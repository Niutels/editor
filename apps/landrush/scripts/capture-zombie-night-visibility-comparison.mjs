import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { BridgeClient, sleep } from '../../../tooling/bench/src/bridge-client.mjs'
import { launchBenchBrowser } from '../../../tooling/bench/src/chrome.mjs'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
  summarizeLandrushBenchmarkFixture,
} from '../../../tooling/bench/src/landrush-fixture.mjs'
import { restoreLandrushBenchmarkFixture } from '../../../tooling/bench/src/scenario/scenario-utils.mjs'

const execFileAsync = promisify(execFile)
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..')
const baseUrl = process.env.ZOMBIE_NIGHT_COMPARISON_BASE_URL ?? 'http://localhost:3012'
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
const frameRate = 4
const frameCount = 16
const firstCaptureOffsetMs = 10_000
const frameIntervalMs = 1_000 / frameRate
const viewport = { dpr: 1, height: 540, width: 960 }
const variants = [
  { id: 'normal', label: 'CURRENT NIGHT' },
  { id: 'zombies50', label: 'ZOMBIES 50% DARKER' },
  { id: 'world50', label: 'WHOLE NIGHT 50% DARKER' },
]
const runStamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').slice(0, 23)
const outputRoot = path.join(
  repositoryRoot,
  'artifacts',
  'zombie-night',
  `visibility-comparison-${runStamp}`,
)
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'landrush-zombie-visibility-'))

await mkdir(outputRoot, { recursive: true })
await Promise.all(variants.map((variant) => createLabelImage(variant)))
const fixture = await loadLandrushBenchmarkFixture({ name: 'outside', repoRoot: repositoryRoot })
const browser = await launchBenchBrowser({
  headless: true,
  height: viewport.height,
  profileDir: profileDirectory,
  width: viewport.width,
})
await installLandrushBenchmarkFixture(browser.page, fixture)

const diagnostics = {
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
}
const diagnosticSets = {
  consoleErrors: new Set(),
  pageErrors: new Set(),
  requestFailures: new Set(),
}
browser.page.on('console', (message) => {
  if (message.type() === 'error') {
    recordDiagnostic('consoleErrors', message.text())
  }
})
browser.page.on('pageerror', (error) => recordDiagnostic('pageErrors', error.message))
browser.page.on('requestfailed', (request) => {
  if (request.resourceType() === 'media' && request.failure()?.errorText === 'net::ERR_ABORTED') {
    return
  }
  recordDiagnostic(
    'requestFailures',
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`,
  )
})

const captures = []
let captureFailure = null
try {
  for (const variant of variants) captures.push(await captureVariant(variant))
  assertSynchronizedCaptures(captures)
  await createComparisonStill(captures)
  await createComparisonGif(captures)
} catch (error) {
  captureFailure = error instanceof Error ? error.message : String(error)
} finally {
  await browser.close()
  await rm(profileDirectory, { force: true, recursive: true })
  const diagnosticsFailed = Object.values(diagnostics).some((entries) => entries.length > 0)
  const manifest = {
    backend: 'WebGPU',
    baseUrl,
    captureFailure,
    captures,
    comparisonGif: path.join(outputRoot, 'zombie-night-visibility-comparison.gif'),
    comparisonStill: path.join(outputRoot, 'zombie-night-visibility-comparison.png'),
    diagnostics,
    fixture: summarizeLandrushBenchmarkFixture(fixture),
    frameCount,
    frameRate,
    frameWindowMs: {
      end: firstCaptureOffsetMs + (frameCount - 1) * frameIntervalMs,
      start: firstCaptureOffsetMs,
    },
    invariants: [
      'All panels use the same saved outside-world fixture and deterministic Zombie seed.',
      'All panels use the same viewport, DPR, quality, camera settle, trusted click, and pointer aim.',
      'Normal leaves the shipping night render unchanged.',
      'Zombies50 changes only Zombie material visibility outside the real shoulder-torch cone.',
      'World50 changes only the single renderer exposure owner for the whole night scene.',
    ],
    status: captureFailure || diagnosticsFailed ? 'failed' : 'complete',
    viewport,
  }
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (!(captureFailure || diagnosticsFailed)) process.stdout.write(`${JSON.stringify(manifest)}\n`)
}

if (captureFailure) throw new Error(`Zombie night visibility comparison failed: ${captureFailure}`)
if (Object.values(diagnostics).some((entries) => entries.length > 0)) {
  throw new Error(`Zombie night visibility comparison emitted browser errors: ${JSON.stringify(diagnostics)}`)
}

async function captureVariant(variant) {
  const frameDirectory = path.join(outputRoot, variant.id)
  await mkdir(frameDirectory, { recursive: true })
  const url = createVariantUrl(variant.id)
  await browser.page.goto(url, { timeout: 180_000, waitUntil: 'domcontentloaded' })
  const bridge = new BridgeClient(browser.page)
  await bridge.waitForBridge({ minFrames: 30, timeoutMs: 300_000 })
  await waitForZombieDayReady(browser.page)
  await restoreLandrushBenchmarkFixture(browser.page, bridge)
  await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 30_000 })

  const switchPoint = await trustedStartZombie(browser.page, browser.cdp, variant.id)
  await aimAtFixedScenePoint(browser.cdp)
  await browser.page.waitForFunction(
    () => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.getState().active === true,
    undefined,
    { timeout: 30_000 },
  )
  await browser.page.evaluate(() =>
    window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.requestTargetRoster(),
  )
  await waitForSettledZombieNight(browser.page, variant.id)

  const frames = []
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const requestedOffsetMs = firstCaptureOffsetMs + frameIndex * frameIntervalMs
    await browser.page.waitForFunction(
      ({ simulationSeconds, requestedOffsetMs: offset }) =>
        window.__LANDRUSH_ZOMBIE_ESCAPE__?.elapsedSeconds >=
        simulationSeconds + offset / 1_000,
      {
        requestedOffsetMs,
        simulationSeconds: switchPoint.simulationSeconds,
      },
      { timeout: 30_000 },
    )
    const state = await readCaptureState(browser.page, bridge, switchPoint.pageTMs)
    const simulationOffsetMs =
      (state.simulationSeconds - switchPoint.simulationSeconds) * 1_000
    const simulationDriftMs = simulationOffsetMs - requestedOffsetMs
    if (simulationDriftMs < -0.5 || simulationDriftMs > 125) {
      throw new Error(
        `${variant.id} frame ${frameIndex} simulation drift ${simulationDriftMs.toFixed(2)}ms exceeded the 125ms gate`,
      )
    }
    const imagePath = path.join(frameDirectory, `${String(frameIndex).padStart(3, '0')}.png`)
    await browser.page.screenshot({ animations: 'disabled', path: imagePath })
    frames.push({
      ...state,
      frameIndex,
      imagePath,
      requestedOffsetMs,
      simulationDriftMs,
      simulationOffsetMs,
    })
  }

  const gifPath = path.join(outputRoot, `${variant.id}.gif`)
  await createIndividualGif(frameDirectory, gifPath)
  return { frames, gifPath, id: variant.id, label: variant.label, url }
}

function createVariantUrl(visibility) {
  const url = new URL('/landrush-lab/pascal-multiplayer-island', baseUrl)
  const params = {
    bench: '1',
    benchNoGpu: '1',
    game: 'zombie-escape',
    landrushZombieRoomSoak: '1',
    offline: '1',
    zombieNightQuality: 'balanced',
    zombieNightVisibility: visibility,
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

async function waitForZombieDayReady(page) {
  await page.waitForFunction(
    () => {
      const main = document.querySelector('main[data-landrush-loading-handed-off]')
      const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
      const button = document.querySelector(
        '[data-testid="landrush-zombie-escape-build-countdown"]',
      )
      const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
      return (
        main?.getAttribute('data-landrush-loading-handed-off') === 'true' &&
        hud?.getAttribute('data-night-start-ready') === 'true' &&
        hud.getAttribute('data-phase') === 'build' &&
        hud.getAttribute('data-expected-phase') === 'build' &&
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        zombie?.status === 'playing' &&
        zombie.phase === 'build' &&
        zombie.expectedPhase === 'build' &&
        window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.getState().enabled === true
      )
    },
    undefined,
    { timeout: 360_000 },
  )
}

async function trustedStartZombie(page, cdp, variantId) {
  const marker = `zombie-night-visibility-${variantId}`
  const target = await page.evaluate((markerName) => {
    const button = document.querySelector(
      '[data-testid="landrush-zombie-escape-build-countdown"]',
    )
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error('Start Zombie control is unavailable')
    }
    window.__LANDRUSH_VISIBILITY_SWITCH_POINT__ = null
    button.addEventListener(
      'click',
      (event) => {
        if (!event.isTrusted) return
        const entry = performance.mark(markerName)
        window.__PASCAL_BENCH__?.mark(markerName)
        window.__LANDRUSH_VISIBILITY_SWITCH_POINT__ = {
          isTrusted: true,
          pageTMs: entry.startTime,
          simulationSeconds: window.__LANDRUSH_ZOMBIE_ESCAPE__?.elapsedSeconds ?? null,
          timeOriginMs: performance.timeOrigin,
        }
        setTimeout(() => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.begin(), 0)
      },
      { capture: true, once: true },
    )
    const bounds = button.getBoundingClientRect()
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
  }, marker)
  await cdp.send('Input.dispatchMouseEvent', {
    ...target,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
    type: 'mouseMoved',
  })
  await sleep(250)
  await cdp.send('Input.dispatchMouseEvent', {
    ...target,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
    type: 'mousePressed',
  })
  await cdp.send('Input.dispatchMouseEvent', {
    ...target,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
    type: 'mouseReleased',
  })
  const switchPoint = await page.evaluate(() => window.__LANDRUSH_VISIBILITY_SWITCH_POINT__)
  if (!(switchPoint?.isTrusted && Number.isFinite(switchPoint.simulationSeconds))) {
    throw new Error(`${variantId} trusted switch marker was not recorded`)
  }
  return switchPoint
}

async function aimAtFixedScenePoint(cdp) {
  await cdp.send('Input.dispatchMouseEvent', {
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
    type: 'mouseMoved',
    x: viewport.width * 0.7,
    y: viewport.height * 0.48,
  })
}

async function waitForSettledZombieNight(page, visibility) {
  await page.waitForFunction(
    (expectedVisibility) => {
      const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
      const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
      const soak = window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.getState()
      const night = window.__LANDRUSH_ZOMBIE_NIGHT_PRESENTATION__
      return (
        hud?.getAttribute('data-phase') === 'night' &&
        hud.getAttribute('data-expected-phase') === 'night' &&
        hud.getAttribute('data-phase-ready') === 'true' &&
        zombie?.status === 'playing' &&
        zombie.phase === 'night' &&
        zombie.expectedPhase === 'night' &&
        zombie.phaseReady === true &&
        soak?.active === true &&
        soak.phaseHeld === true &&
        soak.playerProtected === true &&
        soak.rosterRealized === true &&
        night?.visibility === expectedVisibility &&
        night.amount >= 0.995
      )
    },
    visibility,
    { timeout: 180_000 },
  )
}

async function readCaptureState(page, bridge, switchPageTMs) {
  const [pageState, cameraPose] = await Promise.all([
    page.evaluate((start) => {
      const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
      return {
        actualOffsetMs: performance.now() - start,
        expectedPhase: zombie?.expectedPhase ?? null,
        night: window.__LANDRUSH_ZOMBIE_NIGHT_PRESENTATION__ ?? null,
        phase: zombie?.phase ?? null,
        phaseSecondsRemaining: zombie?.phaseSecondsRemaining ?? null,
        roomSoak: window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.getState() ?? null,
        simulationSeconds: zombie?.elapsedSeconds ?? null,
      }
    }, switchPageTMs),
    bridge.cameraPose(),
  ])
  return { ...pageState, cameraPose }
}

function assertSynchronizedCaptures(entries) {
  const baseline = entries[0]
  if (!baseline) throw new Error('No baseline capture was produced')
  for (const candidate of entries.slice(1)) {
    if (candidate.frames.length !== baseline.frames.length) {
      throw new Error(`${candidate.id} frame count differs from normal`)
    }
    for (let index = 0; index < baseline.frames.length; index += 1) {
      const reference = baseline.frames[index]
      const compared = candidate.frames[index]
      const offsetDifference = Math.abs(
        reference.simulationOffsetMs - compared.simulationOffsetMs,
      )
      if (offsetDifference > 125) {
        throw new Error(
          `${candidate.id} frame ${index} differs from normal simulation timing by ${offsetDifference.toFixed(2)}ms`,
        )
      }
      if (maximumNumericDifference(reference.cameraPose, compared.cameraPose) > 0.01) {
        throw new Error(`${candidate.id} frame ${index} camera pose differs from normal`)
      }
      if (reference.roomSoak?.activeZombieCount !== compared.roomSoak?.activeZombieCount) {
        throw new Error(`${candidate.id} frame ${index} zombie population differs from normal`)
      }
    }
  }
}

function maximumNumericDifference(left, right) {
  const leftValues = flattenNumbers(left)
  const rightValues = flattenNumbers(right)
  if (leftValues.length !== rightValues.length) return Number.POSITIVE_INFINITY
  return leftValues.reduce(
    (maximum, value, index) => Math.max(maximum, Math.abs(value - rightValues[index])),
    0,
  )
}

function flattenNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(flattenNumbers)
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((key) => flattenNumbers(value[key]))
  }
  return []
}

async function createIndividualGif(frameDirectory, gifPath) {
  await execFileAsync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      String(frameRate),
      '-i',
      path.join(frameDirectory, '%03d.png'),
      '-filter_complex',
      '[0:v]scale=720:405:flags=lanczos,split[source][paletteInput];[paletteInput]palettegen=max_colors=192:stats_mode=diff[palette];[source][palette]paletteuse=dither=sierra2_4a',
      gifPath,
    ],
    { cwd: repositoryRoot, windowsHide: true },
  )
}

async function createComparisonGif(entries) {
  const outputPath = path.join(outputRoot, 'zombie-night-visibility-comparison.gif')
  const inputArgs = entries.flatMap((entry) => [
    '-framerate',
    String(frameRate),
    '-i',
    path.join(outputRoot, entry.id, '%03d.png'),
  ])
  const labelInputArgs = entries.flatMap((entry) => [
    '-loop',
    '1',
    '-framerate',
    String(frameRate),
    '-i',
    path.join(outputRoot, `${entry.id}-label.png`),
  ])
  await execFileAsync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...inputArgs,
      ...labelInputArgs,
      '-filter_complex',
      `${createComparisonStackFilter(entries)};[stack]split[source][paletteInput];[paletteInput]palettegen=max_colors=192:stats_mode=diff[palette];[source][palette]paletteuse=dither=sierra2_4a`,
      outputPath,
    ],
    { cwd: repositoryRoot, windowsHide: true },
  )
}

async function createComparisonStill(entries) {
  const frameIndex = Math.floor(frameCount / 2)
  const inputArgs = entries.flatMap((entry) => [
    '-i',
    path.join(outputRoot, entry.id, `${String(frameIndex).padStart(3, '0')}.png`),
  ])
  const labelInputArgs = entries.flatMap((entry) => [
    '-i',
    path.join(outputRoot, `${entry.id}-label.png`),
  ])
  await execFileAsync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...inputArgs,
      ...labelInputArgs,
      '-filter_complex',
      createComparisonStackFilter(entries),
      '-map',
      '[stack]',
      '-frames:v',
      '1',
      path.join(outputRoot, 'zombie-night-visibility-comparison.png'),
    ],
    { cwd: repositoryRoot, windowsHide: true },
  )
}

function createComparisonStackFilter(entries) {
  const panels = entries.flatMap((_, index) => [
    `[${index}:v]scale=480:270:flags=lanczos[image${index}]`,
    `[${entries.length + index}:v]scale=480:34:flags=lanczos[label${index}]`,
    `[label${index}][image${index}]vstack=inputs=2:shortest=1[v${index}]`,
  ])
  return `${panels.join(';')};${entries.map((_, index) => `[v${index}]`).join('')}hstack=inputs=${entries.length}:shortest=1[stack]`
}

async function createLabelImage(variant) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="34"><rect width="480" height="34" fill="#0b1020"/><text x="240" y="23" text-anchor="middle" fill="#ffffff" font-family="Segoe UI,Arial,sans-serif" font-size="18" font-weight="700">${variant.label}</text></svg>`
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputRoot, `${variant.id}-label.png`))
}

function recordDiagnostic(kind, value) {
  if (diagnosticSets[kind].has(value) || diagnostics[kind].length >= 50) return
  diagnosticSets[kind].add(value)
  diagnostics[kind].push(value)
}
