import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { launchBenchBrowser } from '../../../tooling/bench/src/chrome.mjs'

const execFileAsync = promisify(execFile)
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..')
const baseUrl = process.env.ZOMBIE_DEATH_VFX_BASE_URL ?? 'http://localhost:3002'
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
const supportedVariants = [
  'alpha-hash-puffs',
  'low-poly-puffs',
  'ellipsoid-impostors',
  'toon-flipbook',
  'ground-clods',
]
const requestedVariants = (process.env.ZOMBIE_DEATH_VFX_VARIANTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const variants =
  requestedVariants.length === 0
    ? supportedVariants
    : requestedVariants.filter((variant) => supportedVariants.includes(variant))
if (variants.length === 0) {
  throw new Error('ZOMBIE_DEATH_VFX_VARIANTS did not contain a supported dust variant.')
}
const captureStartSeconds = 0.18
const captureEndSeconds = 3.18
const frameCount = 42
const frameRate = (frameCount - 1) / (captureEndSeconds - captureStartSeconds)
const runStamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').slice(0, 23)
const outputRoot = path.join(
  repositoryRoot,
  '.landrush-local',
  'zombie-death-vfx-render-off',
  runStamp,
)

await mkdir(outputRoot, { recursive: true })
const browser = await launchBenchBrowser({
  headless: true,
  height: 512,
  profileDir: path.join(outputRoot, '.chrome-profile'),
  width: 512,
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
let captureFailure = null
let comparisonState = null
try {
  for (const variant of variants) {
    const variantDirectory = path.join(outputRoot, variant)
    await mkdir(variantDirectory, { recursive: true })
    const url = `${baseUrl}/landrush-lab/zombie-death-vfx-comparison?variant=${encodeURIComponent(variant)}`
    await browser.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await browser.page.waitForFunction(
      () => window.__ZOMBIE_DEATH_VFX_COMPARISON__?.getState().assetReady === true,
      undefined,
      { timeout: 180_000 },
    )
    const state = await browser.page.evaluate(() =>
      window.__ZOMBIE_DEATH_VFX_COMPARISON__?.getState(),
    )
    if (state?.backend !== 'webgpu') {
      throw new Error(`Comparison renderer must be WebGPU; received ${state?.backend ?? 'unknown'}.`)
    }
    comparisonState ??= state
    for (let frame = 0; frame < frameCount; frame += 1) {
      const progress = frame / (frameCount - 1)
      const seconds = captureStartSeconds + (captureEndSeconds - captureStartSeconds) * progress
      await browser.page.evaluate((time) => {
        window.__ZOMBIE_DEATH_VFX_COMPARISON__?.setTime(time)
      }, seconds)
      await browser.page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          }),
      )
      await browser.page.screenshot({
        animations: 'disabled',
        path: path.join(variantDirectory, `${String(frame).padStart(3, '0')}.png`),
      })
    }
    const gifPath = path.join(outputRoot, `${variant}.gif`)
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
        path.join(variantDirectory, '%03d.png'),
        '-filter_complex',
        '[0:v]split[source][paletteInput];[paletteInput]palettegen=max_colors=160:stats_mode=diff[palette];[source][palette]paletteuse=dither=sierra2_4a',
        gifPath,
      ],
      { cwd: repositoryRoot, windowsHide: true },
    )
    captures.push({ gifPath, url, variant })
  }
} catch (error) {
  captureFailure = error instanceof Error ? error.message : String(error)
} finally {
  await browser.close()
  const diagnosticsFailed =
    consoleErrors.length > 0 || pageErrors.length > 0 || requestFailures.length > 0
  const manifest = {
    assetKey: 'zombie:dockworker',
    camera: {
      far: 80,
      fov: 38,
      near: 0.05,
      position: [3.45, 2.25, 4.85],
      target: [0, 0.82, 0],
    },
    captureEndSeconds,
    captureFailure,
    captureStartSeconds,
    comparisonState,
    consoleErrors,
    captures,
    frameCount,
    frameRate,
    pageErrors,
    quality: 'balanced',
    requestFailures,
    status: captureFailure || diagnosticsFailed ? 'failed' : 'complete',
    viewport: { dpr: 1, height: 512, width: 512 },
  }
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (!(captureFailure || diagnosticsFailed)) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
  }
}

if (captureFailure) throw new Error(`Zombie death VFX render-off failed: ${captureFailure}`)
if (consoleErrors.length > 0 || pageErrors.length > 0 || requestFailures.length > 0) {
  throw new Error(
    `Zombie death VFX render-off emitted browser errors: ${JSON.stringify({ consoleErrors, pageErrors, requestFailures })}`,
  )
}

function recordDiagnostic(target, seen, value) {
  if (seen.has(value) || target.length >= 50) return
  seen.add(value)
  target.push(value)
}
