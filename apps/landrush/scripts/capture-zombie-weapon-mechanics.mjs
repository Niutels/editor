import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { launchBenchBrowser } from '../../../tooling/bench/src/chrome.mjs'
import {
  assertZombieWeaponMechanicsCaptureState,
  createZombieWeaponMechanicsCaptureTimes,
  createZombieWeaponMechanicsCaptureUrl,
  ZOMBIE_WEAPON_MECHANICS_CAPTURE_VARIANTS,
  ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS,
} from './zombie-weapon-mechanics-capture-plan.mjs'

const execFileAsync = promisify(execFile)
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..')
const baseUrl = process.env.ZOMBIE_WEAPON_MECHANICS_BASE_URL ?? 'http://localhost:3002'
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
const captureTimes = createZombieWeaponMechanicsCaptureTimes({
  endSeconds: readPositiveNumber('ZOMBIE_WEAPON_MECHANICS_CAPTURE_END_SECONDS', 1.2),
  frameCount: readPositiveInteger('ZOMBIE_WEAPON_MECHANICS_CAPTURE_FRAME_COUNT', 30),
  startSeconds: readNonNegativeNumber('ZOMBIE_WEAPON_MECHANICS_CAPTURE_START_SECONDS', 0),
})
const frameRate = (captureTimes.length - 1) / (captureTimes.at(-1) - captureTimes[0])
const runStamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').slice(0, 23)
const outputRoot = path.join(
  repositoryRoot,
  '.landrush-local',
  'weapon-mechanics-proof',
  runStamp,
)

await mkdir(outputRoot, { recursive: true })
const browser = await launchBenchBrowser({
  headless: true,
  height: 900,
  profileDir: path.join(outputRoot, '.chrome-profile'),
  width: 1440,
})
const consoleErrors = []
const pageErrors = []
const requestFailures = []
const consoleErrorSet = new Set()
const pageErrorSet = new Set()
const requestFailureSet = new Set()
browser.page.on('console', (message) => {
  if (message.type() === 'error') recordDiagnostic(consoleErrors, consoleErrorSet, message.text())
})
browser.page.on('pageerror', (error) =>
  recordDiagnostic(pageErrors, pageErrorSet, error.message),
)
browser.page.on('requestfailed', (request) => {
  recordDiagnostic(
    requestFailures,
    requestFailureSet,
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`,
  )
})

const captures = []
const noPostDiagnostics = []
let captureFailure = null
try {
  for (const weaponId of ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS) {
    for (const variantNumber of ZOMBIE_WEAPON_MECHANICS_CAPTURE_VARIANTS) {
      const capture = await captureSequence('final', weaponId, variantNumber)
      captures.push(capture)
      noPostDiagnostics.push(
        await captureDiagnosticStill(
          weaponId,
          variantNumber,
          capture.firstContactTimeSeconds ?? captureTimes[Math.floor(captureTimes.length / 2)],
        ),
      )
    }
  }
} catch (error) {
  captureFailure = error instanceof Error ? error.message : String(error)
} finally {
  await browser.close()
  const diagnosticsFailed =
    consoleErrors.length > 0 || pageErrors.length > 0 || requestFailures.length > 0
  const manifest = {
    captureFailure,
    captureTimes,
    captures,
    consoleErrors,
    frameCount: captureTimes.length,
    frameRate,
    gifCount: captures.length,
    noPostDiagnosticCount: noPostDiagnostics.length,
    noPostDiagnostics,
    pageErrors,
    requestFailures,
    route: '/landrush-lab/zombie-shooting-debug?mechanics=1',
    status: captureFailure || diagnosticsFailed ? 'failed' : 'complete',
    viewport: { dpr: 1, height: 900, width: 1440 },
  }
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(outputRoot, 'gallery.md'), createGalleryMarkdown(captures))
  if (!(captureFailure || diagnosticsFailed)) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
  }
}

if (captureFailure) throw new Error(`Zombie weapon mechanics proof failed: ${captureFailure}`)
if (consoleErrors.length > 0 || pageErrors.length > 0 || requestFailures.length > 0) {
  throw new Error(
    `Zombie weapon mechanics proof emitted browser errors: ${JSON.stringify({ consoleErrors, pageErrors, requestFailures })}`,
  )
}

async function captureSequence(view, weaponId, variantNumber) {
  const captureId = `${weaponId}-v${variantNumber}-${view}`
  const frameDirectory = path.join(outputRoot, captureId)
  await mkdir(frameDirectory, { recursive: true })
  const url = createZombieWeaponMechanicsCaptureUrl(
    baseUrl,
    view,
    captureTimes[0],
    weaponId,
    variantNumber,
  )
  await browser.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await browser.page.waitForFunction(
    () => window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.getState().ready === true,
    undefined,
    { timeout: 120_000 },
  )

  let firstContactTimeSeconds = null
  for (let frameIndex = 0; frameIndex < captureTimes.length; frameIndex += 1) {
    const timeSeconds = captureTimes[frameIndex]
    await browser.page.evaluate((time) => {
      window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.setTime(time)
    }, timeSeconds)
    await browser.page.waitForFunction(
      (expectedTime) => {
        const state = window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.getState()
        return Boolean(
          state?.ready && Math.abs((state.timeSeconds ?? Number.NaN) - expectedTime) < 0.000_1,
        )
      },
      timeSeconds,
      { timeout: 120_000 },
    )
    await browser.page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }),
    )
    const frameState = await browser.page.evaluate(() =>
      window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.getState(),
    )
    if (
      firstContactTimeSeconds === null &&
      (frameState?.scenarios?.[0]?.contactCount ?? 0) > 0
    ) {
      firstContactTimeSeconds = timeSeconds
    }
    await browser.page.screenshot({
      animations: 'disabled',
      path: path.join(frameDirectory, `${String(frameIndex).padStart(3, '0')}.png`),
    })
  }

  const state = assertZombieWeaponMechanicsCaptureState(
    await browser.page.evaluate(() => window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.getState()),
    weaponId,
    variantNumber,
  )
  const gifPath = path.join(outputRoot, `weapon-${weaponId}-v${variantNumber}.gif`)
  await execFileAsync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      frameRate.toFixed(6),
      '-i',
      path.join(frameDirectory, '%03d.png'),
      '-filter_complex',
      '[0:v]split[source][paletteInput];[paletteInput]palettegen=max_colors=192:stats_mode=diff[palette];[source][palette]paletteuse=dither=sierra2_4a',
      gifPath,
    ],
    { cwd: repositoryRoot, windowsHide: true },
  )
  return { firstContactTimeSeconds, gifPath, state, url, variantNumber, view, weaponId }
}

async function captureDiagnosticStill(weaponId, variantNumber, timeSeconds) {
  const url = createZombieWeaponMechanicsCaptureUrl(
    baseUrl,
    'no-post',
    timeSeconds,
    weaponId,
    variantNumber,
  )
  await browser.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await browser.page.waitForFunction(
    () => window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.getState().ready === true,
    undefined,
    { timeout: 120_000 },
  )
  await browser.page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
  const state = assertZombieWeaponMechanicsCaptureState(
    await browser.page.evaluate(() => window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__?.getState()),
    weaponId,
    variantNumber,
  )
  const imagePath = path.join(outputRoot, `weapon-${weaponId}-v${variantNumber}-no-post.png`)
  await browser.page.screenshot({ animations: 'disabled', path: imagePath })
  return { imagePath, state, timeSeconds, url, variantNumber, weaponId }
}

function createGalleryMarkdown(captureEntries) {
  const lines = ['# Weapon VFX variant gallery', '']
  for (const weaponId of ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS) {
    lines.push(`## ${weaponId}`, '')
    for (const capture of captureEntries.filter((entry) => entry.weaponId === weaponId)) {
      lines.push(
        `### V${capture.variantNumber}`,
        '',
        `![${weaponId} V${capture.variantNumber}](${path.basename(capture.gifPath)})`,
        '',
      )
    }
  }
  return `${lines.join('\n')}\n`
}

function recordDiagnostic(target, seen, value) {
  if (seen.has(value) || target.length >= 50) return
  seen.add(value)
  target.push(value)
}

function readNonNegativeNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readPositiveInteger(name, fallback) {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 1 ? value : fallback
}
