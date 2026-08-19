import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { BridgeClient, sleep } from './bridge-client.mjs'
import { launchBenchBrowser } from './chrome.mjs'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
  summarizeLandrushBenchmarkFixture,
} from './landrush-fixture.mjs'
import {
  enterLandrushBuildMode,
  readLandrushViewMode,
  waitForActiveBuildParcel,
  waitForLocalParcelOwnership,
  waitForWorldLayout,
} from './scenario/scenario-utils.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const port = Number(process.env.PASCAL_BENCH_PORT ?? 3002)
const pageUrl =
  process.env.LANDRUSH_VISUAL_URL ??
  `http://localhost:${port}/landrush-lab/pascal-multiplayer-island`
const outputDir = path.resolve(
  process.argv[2] ??
    path.join(
      repoRoot,
      '.artifacts',
      'landrush-visual-parity',
      new Date().toISOString().replaceAll(':', '-'),
    ),
)
const checkpointsMs = [0, 100, 250, 500, 1_000, 2_000]
const commonQuery = [
  'offline=1',
  'bench=1',
  'landrushProbe=1',
  'landrushProbeDom=1',
  'benchmarkReport=build',
].join('&')
const variants = [
  {
    name: 'production-no-post',
    purpose: 'The canonical multiplayer-island render path used in production.',
    url: `${pageUrl}?${commonQuery}`,
  },
].filter(
  (variant) =>
    !process.env.LANDRUSH_VISUAL_VARIANT ||
    variant.name === process.env.LANDRUSH_VISUAL_VARIANT,
)
const visualContract = {
  subject: 'Landrush Pascal multiplayer island',
  route: '/landrush-lab/pascal-multiplayer-island',
  viewport: { width: 1600, height: 1000, dpr: 1 },
  cameraViews: ['app-owned-built-parcel-design'],
  invariants: [
    'The canonical page owns one Pascal Viewer and one Three.js scene.',
    'The complete island, roads, parcels, vegetation, water, players, and Pascal buildings coexist.',
    'The deterministic build fixture exposes at least three visible building levels.',
    'Every construction node in the fixture has a mounted Pascal render object and every drawable construction kind has a visible mesh.',
    'Pascal site presentation is suppressed because Landrush owns the island ground and ocean.',
    'Build mode reaches the fixture-owned parcel and a stable app-owned camera without replacing the canonical scene.',
    'The production path remains legible without post-processing.',
    'No uncaught page or console error is accepted.',
  ],
  allowedDivergences: [
    'Water, grass, and other time-driven materials may differ at individual pixels between runs.',
    'The production path intentionally omits Pascal post-processing for its steady-state frame budget.',
  ],
  knownCompromises: [
    'Landrush owns build-camera state outside Pascal CameraControls, so this gate does not claim an automated distance sweep.',
    'House-specific visual angles remain covered by the bug-report replay pipeline rather than this startup gate.',
  ],
}

if (variants.length === 0) {
  throw new Error(`unknown LANDRUSH_VISUAL_VARIANT "${process.env.LANDRUSH_VISUAL_VARIANT}"`)
}

mkdirSync(outputDir, { recursive: true })
const fixture = await loadLandrushBenchmarkFixture({ name: 'build', repoRoot })
const fixtureBuildParcelId = fixture.report.mode.buildParcelId
if (!fixtureBuildParcelId) throw new Error('build fixture did not select a parcel')
const results = []

for (const variant of variants) {
  const variantDir = path.join(outputDir, variant.name)
  mkdirSync(variantDir, { recursive: true })
  const profileDir = mkdtempSync(path.join(tmpdir(), `landrush-visual-${variant.name}-`))
  const browser = await launchBenchBrowser({ headless: true, profileDir })
  const errors = []
  browser.page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  browser.page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  try {
    await installLandrushBenchmarkFixture(browser.page, fixture)
    await browser.cdp.send('Network.enable')
    await browser.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await browser.cdp.send('Storage.clearDataForOrigin', {
      origin: new URL(variant.url).origin,
      storageTypes: 'local_storage,indexeddb,cache_storage,service_workers',
    })

    const startedAt = performance.now()
    await browser.page.goto(variant.url, { waitUntil: 'commit', timeout: 180_000 })
    const startupCaptures = []
    for (const checkpointMs of checkpointsMs) {
      const waitMs = checkpointMs - (performance.now() - startedAt)
      if (waitMs > 0) await sleep(waitMs)
      const file = path.join(
        variantDir,
        `startup-${String(checkpointMs).padStart(4, '0')}ms.png`,
      )
      await captureFirstCompositedFrame(browser.page, file)
      startupCaptures.push({
        checkpointMs,
        elapsedMs: Math.round(performance.now() - startedAt),
        file,
      })
    }

    const bridge = new BridgeClient(browser.page)
    const up = await bridge.waitForBridge({ requireProfiler: false })
    const floorVisibility = await waitForWorldLayout(browser.page)
    const parcelDiagnostics = await waitForLocalParcelOwnership(
      browser.page,
      fixtureBuildParcelId,
    )
    await enterLandrushBuildMode(browser.page)
    const activeBuildParcel = await waitForActiveBuildParcel(
      browser.page,
      fixtureBuildParcelId,
    )
    await bridge.waitForSettle({ stableFrames: 20, timeoutMs: 30_000 })
    await waitForStableCameraControls(bridge)
    await sleep(500)
    const finalViewMode = await readLandrushViewMode(browser.page)
    if (finalViewMode !== 'build') {
      throw new Error(`Landrush left build view before capture (mode=${finalViewMode})`)
    }
    await waitForActiveBuildParcel(browser.page, fixtureBuildParcelId)

    const actualPose = await bridge.cameraPose()
    if (!actualPose?.position) throw new Error('Landrush build camera pose is unavailable')
    const sceneDigest = await bridge.digest()
    const renderRegistry = await waitForRenderedConstruction(bridge, sceneDigest)
    const designFile = path.join(variantDir, 'design.png')
    await browser.page.screenshot({ path: designFile })
    const viewCaptures = [
      { actualPose, file: designFile, name: 'app-owned-built-parcel-design' },
    ]

    results.push({
      errors,
      activeBuildParcel,
      fixture: summarizeLandrushBenchmarkFixture(fixture),
      floorVisibility,
      finalViewMode,
      name: variant.name,
      nodeCount: up.beacon.nodeCount,
      parcelDiagnostics,
      purpose: variant.purpose,
      readyElapsedMs: Math.round(performance.now() - startedAt),
      renderRegistry,
      runtime: up.info,
      sceneDigest,
      startupCaptures,
      url: variant.url,
      viewCaptures,
    })
  } finally {
    await browser.close()
  }
}

const failedVariants = results.filter((result) => result.errors.length > 0)
const report = {
  generatedAt: new Date().toISOString(),
  outputDir,
  passed: failedVariants.length === 0,
  results,
  visualContract,
}
writeFileSync(path.join(outputDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (failedVariants.length > 0) process.exitCode = 1

function cameraPositionError(actual, expected) {
  if (!actual?.position) return Number.POSITIVE_INFINITY
  return Math.hypot(
    actual.position[0] - expected.position[0],
    actual.position[1] - expected.position[1],
    actual.position[2] - expected.position[2],
  )
}

async function waitForStableCameraControls(bridge, timeoutMs = 30_000) {
  const startedAt = Date.now()
  let previous = null
  let stableSamples = 0
  while (Date.now() - startedAt < timeoutMs) {
    const pose = await bridge.cameraPose()
    if (pose?.position && previous && cameraPositionError(pose, previous) < 0.02) {
      stableSamples += 1
      if (stableSamples >= 4) return pose
    } else {
      stableSamples = 0
    }
    previous = pose
    await sleep(250)
  }
  throw new Error('build camera controls did not reach a stable pose')
}

async function waitForRenderedConstruction(bridge, sceneDigest, timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastFailures = []
  while (Date.now() - startedAt < timeoutMs) {
    const registry = await bridge.renderRegistry()
    lastFailures = constructionRenderFailures(registry, sceneDigest)
    if (lastFailures.length === 0) return registry
    await sleep(250)
  }
  throw new Error(`Pascal construction render contract failed: ${lastFailures.join('; ')}`)
}

function constructionRenderFailures(registry, sceneDigest) {
  if (!registry) return ['render registry is unavailable']
  const failures = []
  const mountedTypes = [
    'building',
    'ceiling',
    'door',
    'item',
    'level',
    'roof',
    'roof-segment',
    'slab',
    'stair',
    'stair-segment',
    'wall',
    'window',
  ]
  const drawableTypes = ['ceiling', 'door', 'item', 'roof', 'slab', 'stair', 'wall', 'window']

  for (const type of mountedTypes) {
    const expected = sceneDigest?.kinds?.[type] ?? 0
    const actual = registry.mountedKinds?.[type] ?? 0
    if (actual < expected) failures.push(`${type} mounted ${actual}/${expected}`)
  }
  for (const type of drawableTypes) {
    const expected = sceneDigest?.kinds?.[type] ?? 0
    const actual = registry.rootsWithRenderableMeshesByKind?.[type] ?? 0
    if (actual < expected) failures.push(`${type} drawable ${actual}/${expected}`)
  }
  for (const site of registry.sitePresentation ?? []) {
    if ((site.visiblePresentationChildCount ?? 0) > 0) {
      failures.push(
        `site ${site.id ?? 'unknown'} still shows ${site.visiblePresentationChildCount} world-presentation children`,
      )
    }
  }
  return failures
}

async function captureFirstCompositedFrame(page, file) {
  let lastError = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await page.screenshot({ path: file })
      return
    } catch (error) {
      lastError = error
      await sleep(50)
    }
  }
  throw lastError
}
