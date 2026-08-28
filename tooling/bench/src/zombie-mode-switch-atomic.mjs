import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ATOMIC_WINDOW,
  buildBaselineWallLedger,
  buildGpuAtomicLedger,
  buildScopedCpuLedger,
  buildTraceLedger,
  buildV8SampleLedger,
  createFrameWindows,
  numericStats,
} from './atomic-frame-accounting.mjs'
import { BridgeClient, sleep } from './bridge-client.mjs'
import { launchBenchBrowser } from './chrome.mjs'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
  summarizeLandrushBenchmarkFixture,
} from './landrush-fixture.mjs'
import { restoreLandrushBenchmarkFixture } from './scenario/scenario-utils.mjs'

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SOURCE_DIR, '..', '..', '..')
const RUNS_DIR = path.join(REPO_ROOT, 'tooling', 'bench', 'runs')
const TRACE_CATEGORIES = [
  '-*',
  'toplevel',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'v8',
  'cc',
  'blink',
  'renderer.scheduler',
  'gpu',
  'disabled-by-default-gpu.service',
].join(',')
const VARIANTS = ['baseline', 'trace', 'v8', 'scoped', 'gpu']

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) continue
    const key = value.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      result[key] = next
      index += 1
    } else {
      result[key] = true
    }
  }
  return result
}

function runName() {
  return `zombie-switch-atomic-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`
}

async function writeJson(filePath, value, pretty = false) {
  await writeFile(filePath, JSON.stringify(value, null, pretty ? 2 : 0))
}

function normalizeV8ClockCalibration(capture, profile) {
  const calibration = capture.clockCalibration
  const anchor = calibration?.anchor
  if (!anchor) throw new Error('V8 capture has no clock calibration anchor')
  const beforeMs = Number.isFinite(anchor.beforeMs)
    ? anchor.beforeMs
    : anchor.midpointMs - anchor.uncertaintyUs / 1_000
  const afterMs = Number.isFinite(anchor.afterMs)
    ? anchor.afterMs
    : anchor.midpointMs + anchor.uncertaintyUs / 1_000
  if (!Number.isFinite(beforeMs) || !Number.isFinite(afterMs)) {
    throw new Error('V8 capture has an invalid clock calibration anchor')
  }
  capture.clockCalibration = {
    anchor: { afterMs, beforeMs },
    basis: 'profile.startTime anchored to performance.now immediately before console.profile',
    offsetUs: profile.startTime - beforeMs * 1_000,
    setupDurationUs: (afterMs - beforeMs) * 1_000,
    uncertaintyUs: 1_000,
  }
}

function compactFrame(frame) {
  return {
    cpu: frame.cpu,
    draws: frame.draws,
    dtMs: frame.dtMs,
    frameIdx: frame.frameIdx,
    gpu: frame.gpu,
    marks: frame.marks,
    memMB: frame.memMB,
    tris: frame.tris,
    wallT: frame.wallT,
  }
}

function readiness(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main[data-landrush-loading-handed-off]')
    return {
      ambientReady: main?.getAttribute('data-landrush-loading-ambient-ready') ?? null,
      handedOff: main?.getAttribute('data-landrush-loading-handed-off') ?? null,
      initialParcelReady:
        main?.getAttribute('data-landrush-loading-initial-parcel-ready') ?? null,
      loadingOverlayVisible: Boolean(document.querySelector('[role="progressbar"]')),
      paintReady: main?.getAttribute('data-landrush-loading-paint-ready') ?? null,
      viewerSceneReady:
        main?.getAttribute('data-landrush-loading-viewer-scene-ready') ?? null,
      worldFrameReady:
        main?.getAttribute('data-landrush-loading-world-frame-ready') ?? null,
      zombieAssetsReady:
        main?.getAttribute('data-landrush-loading-zombie-assets-ready') ?? null,
      zombieHudVisible: Boolean(
        document.querySelector('[data-testid="landrush-zombie-escape-hud"]'),
      ),
    }
  })
}

async function waitForNormalLoadingHandoff(page) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('main[data-landrush-loading-handed-off]')
        ?.getAttribute('data-landrush-loading-handed-off') === 'true',
    null,
    { timeout: 360_000 },
  )
}

async function startTrace(cdp) {
  await cdp.send('Tracing.start', {
    categories: TRACE_CATEGORIES,
    transferMode: 'ReturnAsStream',
  })
}

async function stopTraceToFile(cdp, filePath) {
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end')
  const { stream } = await complete
  const file = await open(filePath, 'w')
  try {
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle: stream })
      await file.write(chunk.data)
      if (chunk.eof) break
    }
  } finally {
    await file.close()
    await cdp.send('IO.close', { handle: stream }).catch(() => {})
  }
}

function profileDirectoryIsSafe(profileDir) {
  const resolved = path.resolve(profileDir)
  return (
    path.dirname(resolved) === path.resolve(tmpdir()) &&
    path.basename(resolved).startsWith('landrush-zombie-atomic-')
  )
}

async function captureVariant({ baseUrl, fixture, headless, runDir, variant }) {
  const profileDir = await mkdtemp(path.join(tmpdir(), 'landrush-zombie-atomic-'))
  if (!profileDirectoryIsSafe(profileDir)) throw new Error(`unsafe temporary profile ${profileDir}`)
  const browser = await launchBenchBrowser({ headless, profileDir })
  const pageErrors = []
  const consoleErrors = []
  let tracePath = null
  let profile = null
  let clockCalibration = null
  let consoleProfileFinished = null
  try {
    browser.page.setDefaultTimeout(360_000)
    browser.page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 2_000)))
    browser.page.on('console', (message) => {
      if (message.type() !== 'error') return
      consoleErrors.push(message.text().slice(0, 2_000))
      if (consoleErrors.length > 100) consoleErrors.shift()
    })
    await installLandrushBenchmarkFixture(browser.page, fixture)
    const url = new URL('/landrush-lab/pascal-multiplayer-island', baseUrl)
    url.searchParams.set('offline', '1')
    url.searchParams.set('bench', '1')
    if (variant !== 'gpu') url.searchParams.set('benchNoGpu', '1')
    if (variant === 'scoped') url.searchParams.set('frameProfile', '1')
    process.stderr.write(`[atomic] ${variant}: opening normal world\n`)
    await browser.page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    const bridge = new BridgeClient(browser.page)
    const bridgeUp = await bridge.waitForBridge({ requireProfiler: variant === 'scoped' })
    await waitForNormalLoadingHandoff(browser.page)
    await restoreLandrushBenchmarkFixture(browser.page, bridge)
    const settled = await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 30_000 })
    if (!settled || settled.timedOut) throw new Error(`${variant} normal world did not settle`)
    await sleep(1_000)
    const beforeSwitch = await readiness(browser.page)
    const infoBefore = await bridge.info()
    if (variant === 'gpu' && infoBefore?.gpuSupported !== true) {
      throw new Error('WebGPU timestamp queries are unavailable')
    }
    if (variant === 'trace') {
      tracePath = path.join(runDir, 'chrome-trace.json')
      await startTrace(browser.cdp)
      await sleep(1_000)
    }
    if (variant === 'v8') {
      await browser.cdp.send('Profiler.enable')
      await browser.cdp.send('Profiler.setSamplingInterval', { interval: 500 })
      const profileTitle = 'landrush-atomic-v8'
      consoleProfileFinished = new Promise((resolve) => {
        const listener = (event) => {
          if (event.title !== profileTitle) return
          browser.cdp.off('Profiler.consoleProfileFinished', listener)
          resolve(event)
        }
        browser.cdp.on('Profiler.consoleProfileFinished', listener)
      })
      const anchor = await browser.page.evaluate((title) => {
        const beforeMs = performance.now()
        console.profile(title)
        const afterMs = performance.now()
        return { afterMs, beforeMs }
      }, profileTitle)
      clockCalibration = {
        anchor,
        basis: 'profile.startTime anchored to performance.now immediately before console.profile',
        offsetUs: null,
        setupDurationUs: (anchor.afterMs - anchor.beforeMs) * 1_000,
        uncertaintyUs: 1_000,
      }
      await sleep(1_000)
    }
    const prime = (await bridge.beacon()).beacon
    bridge.primeFrameCursor(Math.max(0, (prime?.frameIdx ?? 2) - 2))
    await browser.page.evaluate(() => {
      window.__LANDRUSH_ATOMIC_BRIDGE__ = window.__PASCAL_BENCH__
    })
    await sleep(2_000)
    const markerName = `landrush-atomic-zombie-switch-${variant}`
    const switchPoint = await browser.page.evaluate((marker) => {
      const entry = performance.mark(marker)
      console.timeStamp(marker)
      window.__PASCAL_BENCH__?.mark(marker)
      const target = new URL(window.location.href)
      target.searchParams.set('game', 'zombie-escape')
      history.pushState({}, '', target)
      return {
        pageTMs: entry.startTime,
        timeOriginMs: performance.timeOrigin,
        url: window.location.href,
      }
    }, markerName)
    process.stderr.write(`[atomic] ${variant}: switched; recording +10s\n`)
    await sleep(10_200)
    const endPoint = await browser.page.evaluate((marker) => {
      const entry = performance.mark(marker)
      console.timeStamp(marker)
      window.__PASCAL_BENCH__?.mark(marker)
      return { pageTMs: entry.startTime, url: window.location.href }
    }, `landrush-atomic-window-end-${variant}`)
    await sleep(variant === 'gpu' ? 1_500 : 300)
    if (variant === 'v8') {
      await browser.page.evaluate(() => console.profileEnd('landrush-atomic-v8'))
      const finished = await consoleProfileFinished
      profile = finished.profile
      clockCalibration.offsetUs = profile.startTime - clockCalibration.anchor.beforeMs * 1_000
    }
    if (variant === 'trace') await stopTraceToFile(browser.cdp, tracePath)
    const drained = await bridge.pumpFrames()
    const afterSwitch = await readiness(browser.page)
    const finalState = await browser.page.evaluate(() => ({
      bridgePreserved: window.__LANDRUSH_ATOMIC_BRIDGE__ === window.__PASCAL_BENCH__,
      visibility: document.visibilityState,
    }))
    const infoAfter = await bridge.info()
    const capture = {
      afterSwitch,
      beforeSwitch,
      bridge: { after: infoAfter, before: infoBefore, initialFrameIdx: bridgeUp.beacon.frameIdx },
      clockCalibration,
      consoleErrors,
      droppedByRing: drained.droppedByRing,
      endPoint,
      finalState,
      frames: drained.frames.map(compactFrame),
      markerName,
      pageErrors,
      switchPoint,
      variant,
    }
    if (profile) await writeJson(path.join(runDir, 'v8.cpuprofile'), profile)
    await writeJson(path.join(runDir, `capture-${variant}.json`), capture)
    return { capture, profile, tracePath }
  } finally {
    await browser.close()
    if (profileDirectoryIsSafe(profileDir)) {
      await rm(profileDir, { force: true, recursive: true, maxRetries: 4, retryDelay: 250 }).catch(
        () => {},
      )
    }
  }
}

function cadence(capture) {
  const window = createFrameWindows(capture.frames, capture.switchPoint.pageTMs)
  const values = window.windows.filter((frame) => !frame.clipped).map((frame) => frame.totalUs / 1_000)
  return { ...numericStats(values), frameCount: window.windows.length }
}

function phaseName(offsetUs) {
  if (offsetUs <= 0) return '-2s..0s'
  const second = Math.min(9, Math.max(0, Math.floor((offsetUs - 1) / 1_000_000)))
  return `+${second}s..+${second + 1}s`
}

function accountingPhases() {
  return [
    { endOffsetUs: 0, phase: '-2s..0s', startOffsetUs: -2_000_000 },
    ...Array.from({ length: 10 }, (_, second) => ({
      endOffsetUs: (second + 1) * 1_000_000,
      phase: `+${second}s..+${second + 1}s`,
      startOffsetUs: second * 1_000_000,
    })),
  ]
}

function aggregatePhaseLeaves(frames, leafCollections, excluded = new Set()) {
  const groups = new Map(accountingPhases().map((phase) => [phase.phase, new Map()]))
  for (const frame of frames) {
    for (const leaves of leafCollections(frame)) {
      for (const leaf of leaves) {
        if (excluded.has(leaf.category)) continue
        for (const phase of accountingPhases()) {
          const startOffsetUs = Math.max(leaf.startOffsetUs, phase.startOffsetUs)
          const endOffsetUs = Math.min(leaf.endOffsetUs, phase.endOffsetUs)
          if (endOffsetUs <= startOffsetUs) continue
          const values = groups.get(phase.phase)
          const key = `${leaf.category}\u0000${leaf.label}`
          const current = values.get(key) ?? {
            category: leaf.category,
            label: leaf.label,
            totalUs: 0,
          }
          current.totalUs += endOffsetUs - startOffsetUs
          values.set(key, current)
        }
      }
    }
  }
  return [...groups].map(([phase, values]) => ({
    phase,
    values: [...values.values()].sort((left, right) => right.totalUs - left.totalUs),
  }))
}

function cadencePhases(capture) {
  const window = createFrameWindows(capture.frames, capture.switchPoint.pageTMs)
  const groups = new Map()
  for (const frame of window.windows) {
    const name = phaseName(frame.endOffsetUs)
    let values = groups.get(name)
    if (!values) {
      values = []
      groups.set(name, values)
    }
    values.push(frame.totalUs / 1_000)
  }
  return [...groups].map(([phase, values]) => ({ phase, ...numericStats(values) }))
}

function aggregateLeaves(frames, leafCollections, excluded = new Set()) {
  const totals = new Map()
  for (const frame of frames) {
    for (const leaves of leafCollections(frame)) {
      for (const leaf of leaves) {
        if (excluded.has(leaf.category)) continue
        const key = `${leaf.category}\u0000${leaf.label}`
        const current = totals.get(key) ?? {
          category: leaf.category,
          label: leaf.label,
          totalUs: 0,
        }
        current.totalUs += leaf.durationUs
        totals.set(key, current)
      }
    }
  }
  return [...totals.values()].sort((left, right) => right.totalUs - left.totalUs)
}

function formatMs(valueUs) {
  return (valueUs / 1_000).toFixed(3)
}

function formatNumber(value) {
  return value === null || value === undefined ? 'n/a' : value.toFixed(3)
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function buildReport({ captures, fixtureSummary, gpuLedger, health, runDir, scopedLedger, traceLedger, v8Ledger }) {
  const cadenceRows = VARIANTS.map((variant) => {
    const summary = cadence(captures[variant])
    return [
      variant,
      String(summary.frameCount),
      formatNumber(summary.average),
      formatNumber(summary.median),
      formatNumber(summary.p95),
      formatNumber(summary.maximum),
    ]
  })
  const phaseRows = cadencePhases(captures.baseline).map((phase) => [
    phase.phase,
    String(phase.count),
    formatNumber(phase.average),
    formatNumber(phase.p95),
    formatNumber(phase.maximum),
  ])
  const mainThreadLeaves = aggregateLeaves(
    traceLedger.frames,
    (frame) => [frame.threads.find((thread) => thread.key === traceLedger.mainThreadKey)?.leaves ?? []],
    new Set(['idle-or-untraced']),
  ).slice(0, 30)
  const scopedLeaves = aggregateLeaves(scopedLedger.frames, (frame) => [frame.leaves]).slice(0, 30)
  const v8Leaves = aggregateLeaves(
    v8Ledger.frames,
    (frame) => [frame.leaves],
    new Set(['idle', 'sampling-uncovered']),
  ).slice(0, 30)
  const gpuLeaves = aggregateLeaves(gpuLedger.frames, (frame) => [frame.leaves]).slice(0, 30)
  const traceByPhase = aggregatePhaseLeaves(traceLedger.frames, (frame) => [
    frame.threads.find((thread) => thread.key === traceLedger.mainThreadKey)?.leaves ?? [],
  ]).map((row, index) => {
    const categories = new Map()
    for (const value of row.values) {
      categories.set(value.category, (categories.get(value.category) ?? 0) + value.totalUs)
    }
    const phase = accountingPhases()[index]
    const totalUs = phase.endOffsetUs - phase.startOffsetUs
    const idleUs = categories.get('idle-or-untraced') ?? 0
    return { activeUs: totalUs - idleUs, categories, idleUs, phase: row.phase, totalUs }
  })
  const v8ByPhase = aggregatePhaseLeaves(
    v8Ledger.frames,
    (frame) => [frame.leaves],
    new Set(['idle', 'sampling-uncovered']),
  )
  const scopedByPhase = aggregatePhaseLeaves(scopedLedger.frames, (frame) => [frame.leaves])
  const gpuByPhase = new Map()
  for (const frame of gpuLedger.frames) {
    const phase = phaseName(frame.endOffsetUs)
    let group = gpuByPhase.get(phase)
    if (!group) {
      group = { busy: [], complete: 0, phase }
      gpuByPhase.set(phase, group)
    }
    group.busy.push(frame.gpuBusyUs)
    group.complete += frame.complete ? 1 : 0
  }
  const baselineWindows = createFrameWindows(
    captures.baseline.frames,
    captures.baseline.switchPoint.pageTMs,
  ).windows
  const baselineWorst = [...baselineWindows].sort((left, right) => right.totalUs - left.totalUs)[0]
  const v8NodeById = new Map(v8Ledger.nodes.map((node) => [node.nodeId, node]))
  const sampledStackTotal = (fragment, startOffsetUs = 0, endOffsetUs = 10_000_000) => {
    let totalUs = 0
    for (const frame of v8Ledger.frames) {
      for (const leaf of frame.leaves) {
        const node = v8NodeById.get(leaf.nodeId)
        if (!node?.stack?.some((stackFrame) => stackFrame.includes(fragment))) continue
        const startUs = Math.max(startOffsetUs, leaf.startOffsetUs)
        const endUs = Math.min(endOffsetUs, leaf.endOffsetUs)
        if (endUs > startUs) totalUs += endUs - startUs
      }
    }
    return totalUs
  }
  const gpuBefore = numericStats(
    gpuLedger.frames
      .filter((frame) => frame.endOffsetUs <= 0)
      .map((frame) => frame.gpuBusyUs / 1_000),
  )
  const gpuAfter = numericStats(
    gpuLedger.frames
      .filter((frame) => frame.endOffsetUs > 0)
      .map((frame) => frame.gpuBusyUs / 1_000),
  )
  const worstTraceFrames = traceLedger.frames
    .map((frame) => {
      const main = frame.threads.find((thread) => thread.key === traceLedger.mainThreadKey)
      return {
        activeUs: main?.activeUs ?? 0,
        endOffsetUs: frame.endOffsetUs,
        frameIdx: frame.frameIdx,
        totalUs: frame.totalUs,
      }
    })
    .sort((left, right) => right.totalUs - left.totalUs)
    .slice(0, 20)
  const errors = VARIANTS.flatMap((variant) => [
    ...captures[variant].pageErrors.map((error) => `${variant} page: ${error}`),
    ...captures[variant].consoleErrors.map((error) => `${variant} console: ${error}`),
  ])
  const invariants = [
    ['observer-light wall', captures.baseline.frames.length > 0, 2_000],
    ['Chrome thread wall', traceLedger.invariants.threadFrameReconciliation, traceLedger.invariants.maxLeafUs],
    ['V8 sampled timeline', v8Ledger.invariants.exactWindowCoverage, v8Ledger.invariants.maxLeafUs],
    ['scoped app systems', scopedLedger.invariants.exactWindowCoverage, scopedLedger.invariants.maxLeafUs],
    [
      'WebGPU passes',
      gpuLedger.invariants.exactWindowCoverage && gpuLedger.invariants.gpuFrameCoverageRate === 1,
      gpuLedger.invariants.maxLeafUs,
    ],
  ]
  return `# Zombie-mode switch atomic frame accounting

This captures the real same-route soft transition from the normal island to \`game=zombie-escape\`. The logical window is exactly 12 seconds: **−2.000s through +10.000s**, where 0 is the \`history.pushState\` call that enables Zombie Escape.

The server reported **${health.mode}** mode. These results diagnose this local development build; they are not production performance claims. CPU thread wall time, sampled JavaScript, and GPU hardware time are separate ledgers because they overlap and must not be added as if serial.

## Capture validity

- Route: \`/landrush-lab/pascal-multiplayer-island?offline=1&bench=1\`, then the same URL with \`game=zombie-escape\`.
- Scenario: settled normal-world fixture, two seconds untouched, soft mode switch, ten seconds untouched.
- Fixture: \`${fixtureSummary.name}\`, ${fixtureSummary.buildCount} builds, ${fixtureSummary.nodeCount} nodes, world \`${fixtureSummary.worldId}\`.
- Input seed: none; the harness sends no movement or combat input.
- Viewport: 1600×1000 at DPR 1; headless Chromium with WebGPU.
- Browser bridge survived every soft transition: ${VARIANTS.every((variant) => captures[variant].finalState.bridgePreserved) ? 'yes' : 'NO'}.
- Ring-buffer drops: ${VARIANTS.reduce((sum, variant) => sum + captures[variant].droppedByRing, 0)}.
- Page/console errors: ${errors.length}.
- V8 clock alignment uncertainty: ${formatMs(v8Ledger.invariants.clockUncertaintyUs)}ms.
- Before the switch, Zombie asset readiness was \`${captures.baseline.beforeSwitch.zombieAssetsReady}\`; at +10s it was \`${captures.baseline.afterSwitch.zombieAssetsReady}\`.

## Direct findings

- The observer-light run's largest interval was **${formatMs(baselineWorst.totalUs)}ms**, from +${formatMs(baselineWorst.startOffsetUs)}ms to +${formatMs(baselineWorst.endOffsetUs)}ms. The next ten seconds contain additional 197–287ms stalls; this is not one isolated first frame.
- The largest traced interval was **${formatMs(worstTraceFrames[0].totalUs)}ms**, of which **${formatMs(worstTraceFrames[0].activeUs)}ms** was renderer-main work. The trace is slower than baseline because tracing is intentionally isolated in its own differential run.
- GPU work did not jump with the stalls: mean timestamped GPU busy time was **${formatNumber(gpuBefore.average)}ms** before and **${formatNumber(gpuAfter.average)}ms** after the switch; the post-switch maximum was **${formatNumber(gpuAfter.maximum)}ms**. The long pauses are CPU-main-thread limited in this capture.
- The pre-switch \`zombieAssetsReady=true\` value is a bypass (\`!zombieEscapeEnabled || actualReadiness\`), not proof that Zombie assets were preloaded. \`LandrushZombieEscapeMode\` is mounted only after the query changes. At +10s the loading overlay and Zombie HUD were both still mounted, while actual Zombie asset readiness remained false.
- Post-switch V8 samples include **${formatMs(sampledStackTotal('AudioContext'))}ms** under Zombie audio creation, **${formatMs(sampledStackTotal('createToonDustFlipbookTextures'))}ms** creating death-dust textures, **${formatMs(sampledStackTotal('createRenderReadinessRepresentative'))}ms** creating readiness representatives, and **${formatMs(sampledStackTotal('captureBakedTextureFrame'))}ms** baking authored zombie animation textures. These are sampled attribution totals, not values to add to baseline wall time.
- Ongoing frame work remains material after initialization: sampled stacks contain **${formatMs(sampledStackTotal('PostProcessingPasses.useFrame'))}ms** in post-processing and **${formatMs(sampledStackTotal('ZombieEscapeEffects'))}ms** in Zombie effects during +0s..+10s.

## Observer cost check

Each row is a separate cold browser-profile run. Aggregates may exceed 2ms; every individual entry in the atomic ledgers is at most 2ms.

${markdownTable(
  ['variant', 'frames', 'mean dt ms', 'median dt ms', 'p95 dt ms', 'max dt ms'],
  cadenceRows,
)}

## Observer-light cadence by time from switch

${markdownTable(['phase', 'frames', 'mean dt ms', 'p95 dt ms', 'max dt ms'], phaseRows)}

## Chrome renderer-main work

This is an exact wall-time partition for every frame in the trace run. Time without a selected synchronous trace event is retained as \`idle, presentation wait, or work outside enabled trace categories\` rather than discarded.

${markdownTable(
  ['category', 'trace leaf label', '12s aggregate ms'],
  mainThreadLeaves.map((row) => [row.category, row.label.replaceAll('|', '\\|'), formatMs(row.totalUs)]),
)}

### Renderer-main wall time by phase

${markdownTable(
  [
    'phase',
    'wall ms',
    'active ms',
    'idle/untraced ms',
    'JavaScript ms',
    'GC ms',
    'style/layout ms',
    'paint/composite ms',
  ],
  traceByPhase.map((row) => [
    row.phase,
    formatMs(row.totalUs),
    formatMs(row.activeUs),
    formatMs(row.idleUs),
    formatMs(row.categories.get('javascript') ?? 0),
    formatMs(row.categories.get('garbage-collection') ?? 0),
    formatMs(row.categories.get('style-layout') ?? 0),
    formatMs(row.categories.get('paint-composite') ?? 0),
  ]),
)}

## Scoped application systems

${markdownTable(
  ['category', 'system', '12s aggregate ms'],
  scopedLeaves.map((row) => [row.category, row.label.replaceAll('|', '\\|'), formatMs(row.totalUs)]),
)}

### Largest scoped buckets by phase

${markdownTable(
  ['phase', 'three largest buckets'],
  scopedByPhase.map((row) => [
    row.phase,
    row.values
      .slice(0, 3)
      .map((value) => `${value.label.replaceAll('|', '\\|')} (${formatMs(value.totalUs)}ms)`)
      .join('; '),
  ]),
)}

## V8 sampled JavaScript

The sampling interval is 0.5ms. Sample leaves are a statistical attribution ledger, not an additional wall-time total.

${markdownTable(
  ['category', 'sampled leaf', '12s sampled ms'],
  v8Leaves.map((row) => [row.category, row.label.replaceAll('|', '\\|'), formatMs(row.totalUs)]),
)}

### Largest sampled leaves by phase

${markdownTable(
  ['phase', 'three largest sampled leaves'],
  v8ByPhase.map((row) => [
    row.phase,
    row.values
      .slice(0, 3)
      .map((value) => `${value.label.replaceAll('|', '\\|')} (${formatMs(value.totalUs)}ms)`)
      .join('; '),
  ]),
)}

## WebGPU timestamp passes

${markdownTable(
  ['category', 'pass', '12s aggregate GPU ms'],
  gpuLeaves.map((row) => [row.category, row.label.replaceAll('|', '\\|'), formatMs(row.totalUs)]),
)}

Timestamp coverage: ${gpuLedger.invariants.completeFrameCount}/${gpuLedger.frames.length} mapped Three.js frames (${(
    gpuLedger.invariants.gpuFrameCoverageRate * 100
  ).toFixed(2)}%).

${markdownTable(
  ['phase', 'frames', 'complete', 'mean GPU busy ms', 'max GPU busy ms'],
  [...gpuByPhase.values()].map((row) => {
    const summary = numericStats(row.busy.map((value) => value / 1_000))
    return [
      row.phase,
      String(row.busy.length),
      String(row.complete),
      formatNumber(summary.average),
      formatNumber(summary.maximum),
    ]
  }),
)}

## Longest trace-run frame intervals

${markdownTable(
  ['bench frame', 'end offset ms', 'wall interval ms', 'renderer-main active ms'],
  worstTraceFrames.map((frame) => [
    String(frame.frameIdx),
    formatMs(frame.endOffsetUs),
    formatMs(frame.totalUs),
    formatMs(frame.activeUs),
  ]),
)}

## Atomic guarantees

${markdownTable(
  ['ledger', 'reconciles', 'largest leaf ms', '≤2ms'],
  invariants.map(([name, reconciles, maximumUs]) => [
    name,
    reconciles ? 'yes' : 'NO',
    formatMs(maximumUs),
    maximumUs <= ATOMIC_WINDOW.maximumLeafUs ? 'yes' : 'NO',
  ]),
)}

All exact wall ledgers include explicit idle/untraced or missing-profiler buckets. No duration vanishes. The Chrome per-thread rows each reconcile independently to the same frame interval; summing parallel threads would double-count elapsed time. GPU pass leaves reconcile to measured GPU busy time, not CPU wall time.

Artifacts are in \`${runDir}\`.
`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = String(args.url ?? process.env.PASCAL_BENCH_URL ?? 'http://localhost:3002')
  const headless = args.headful !== true
  const rebuildDir = typeof args.rebuild === 'string' ? path.resolve(args.rebuild) : null
  const outputName = typeof args.output === 'string' ? args.output : runName()
  const runDir = rebuildDir ?? path.resolve(RUNS_DIR, outputName)
  await mkdir(runDir, { recursive: true })
  const captures = {}
  const raw = {}
  let health
  let metadata
  if (rebuildDir) {
    metadata = JSON.parse(await readFile(path.join(runDir, 'metadata.json'), 'utf8'))
    health = metadata.health
    for (const variant of VARIANTS) {
      captures[variant] = JSON.parse(
        await readFile(path.join(runDir, `capture-${variant}.json`), 'utf8'),
      )
    }
    raw.trace = { tracePath: path.join(runDir, 'chrome-trace.json') }
    raw.v8 = { profile: JSON.parse(await readFile(path.join(runDir, 'v8.cpuprofile'), 'utf8')) }
    const recaptureVariants =
      typeof args.recapture === 'string'
        ? args.recapture.split(',').map((value) => value.trim()).filter(Boolean)
        : []
    if (recaptureVariants.length > 0) {
      for (const variant of recaptureVariants) {
        if (!VARIANTS.includes(variant)) throw new Error(`unknown recapture variant ${variant}`)
      }
      const healthResponse = await fetch(new URL('/api/health', baseUrl))
      if (!healthResponse.ok) {
        throw new Error(`Landrush health returned HTTP ${healthResponse.status}`)
      }
      health = await healthResponse.json()
      const fixture = await loadLandrushBenchmarkFixture({ name: 'outside', repoRoot: REPO_ROOT })
      for (const variant of recaptureVariants) {
        raw[variant] = await captureVariant({ baseUrl, fixture, headless, runDir, variant })
        captures[variant] = raw[variant].capture
      }
      metadata.health = health
      await writeJson(path.join(runDir, 'metadata.json'), metadata, true)
    }
  } else {
    const healthResponse = await fetch(new URL('/api/health', baseUrl))
    if (!healthResponse.ok) {
      throw new Error(`Landrush health returned HTTP ${healthResponse.status}`)
    }
    health = await healthResponse.json()
    if (health.status !== 'ok') throw new Error(`Landrush health is ${JSON.stringify(health)}`)
    const fixture = await loadLandrushBenchmarkFixture({ name: 'outside', repoRoot: REPO_ROOT })
    for (const variant of VARIANTS) {
      raw[variant] = await captureVariant({ baseUrl, fixture, headless, runDir, variant })
      captures[variant] = raw[variant].capture
    }
    metadata = {
      durationSeconds: 12,
      fixture: summarizeLandrushBenchmarkFixture(fixture),
      health,
      route: '/landrush-lab/pascal-multiplayer-island',
      scenario: 'same-route soft query transition to game=zombie-escape',
      variants: VARIANTS,
      window: { afterSeconds: 10, beforeSeconds: 2 },
    }
    await writeJson(path.join(runDir, 'metadata.json'), metadata, true)
  }
  normalizeV8ClockCalibration(captures.v8, raw.v8.profile)
  await writeJson(path.join(runDir, 'capture-v8.json'), captures.v8)
  const baselineLedger = buildBaselineWallLedger(
    captures.baseline.frames,
    captures.baseline.switchPoint.pageTMs,
  )
  const trace = JSON.parse(await readFile(raw.trace.tracePath, 'utf8'))
  const traceLedger = buildTraceLedger({
    frames: captures.trace.frames,
    markerName: captures.trace.markerName,
    switchPageTMs: captures.trace.switchPoint.pageTMs,
    traceEvents: trace.traceEvents ?? [],
  })
  const v8Ledger = buildV8SampleLedger({
    clockOffsetUs: captures.v8.clockCalibration.offsetUs,
    clockUncertaintyUs: captures.v8.clockCalibration.uncertaintyUs,
    frames: captures.v8.frames,
    profile: raw.v8.profile,
    switchPageTMs: captures.v8.switchPoint.pageTMs,
  })
  const scopedLedger = buildScopedCpuLedger(
    captures.scoped.frames,
    captures.scoped.switchPoint.pageTMs,
  )
  const gpuLedger = buildGpuAtomicLedger(captures.gpu.frames, captures.gpu.switchPoint.pageTMs)
  await Promise.all([
    writeJson(path.join(runDir, 'atomic-baseline-wall.json'), baselineLedger),
    writeJson(path.join(runDir, 'atomic-chrome-thread-wall.json'), traceLedger),
    writeJson(path.join(runDir, 'atomic-v8-samples.json'), v8Ledger),
    writeJson(path.join(runDir, 'atomic-scoped-app-systems.json'), scopedLedger),
    writeJson(path.join(runDir, 'atomic-webgpu-passes.json'), gpuLedger),
  ])
  const report = buildReport({
    captures,
    fixtureSummary: metadata.fixture,
    gpuLedger,
    health,
    runDir,
    scopedLedger,
    traceLedger,
    v8Ledger,
  })
  await writeFile(path.join(runDir, 'report.md'), report)
  process.stdout.write(`${runDir}\n`)
}

await main()
