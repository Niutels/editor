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
  numericStats,
} from './atomic-frame-accounting.mjs'
import { formatAtomicRenderScale, summarizeAtomicRenderScale } from './atomic-render-scale.mjs'
import { BridgeClient, sleep } from './bridge-client.mjs'
import { launchBenchBrowser } from './chrome.mjs'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
  summarizeLandrushBenchmarkFixture,
} from './landrush-fixture.mjs'
import { restoreLandrushBenchmarkFixture } from './scenario/scenario-utils.mjs'
import {
  buildRawFrameTimeline,
  buildZombieFrameResponsibility,
  isStrictFrameBudgetMissMs,
  serializeSlowFrameContributorsCsv,
  serializeSlowFramesCsv,
} from './zombie-frame-responsibility.mjs'

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
  'viz',
  'disabled-by-default-gpu.service',
  'disabled-by-default-cc.debug',
].join(',')
const VARIANTS = ['baseline', 'trace', 'v8', 'scoped', 'gpu']
const WINDOW_START_US = -2_000_000
const WINDOW_END_US = 15_000_000
const ACCOUNTING_WINDOW = Object.freeze({
  windowEndUs: WINDOW_END_US,
  windowStartUs: WINDOW_START_US,
})
const WINDOW_BEFORE_SECONDS = Math.abs(WINDOW_START_US) / 1_000_000
const WINDOW_AFTER_SECONDS = WINDOW_END_US / 1_000_000
const WINDOW_DURATION_SECONDS = WINDOW_BEFORE_SECONDS + WINDOW_AFTER_SECONDS
const FRAME_BUDGET_US = 1_000_000 / 60

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
    const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
    const startZombieButton = document.querySelector(
      '[data-testid="landrush-zombie-escape-build-countdown"]',
    )
    const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const loadingOverlays = [...document.querySelectorAll('[role="progressbar"]')]
    const visibleLoadingOverlays = loadingOverlays.filter((element) => {
      let current = element
      while (current) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false
        const style = getComputedStyle(current)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          style.contentVisibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') <= 0
        ) {
          return false
        }
        if (current.parentElement) current = current.parentElement
        else {
          const root = current.getRootNode()
          current = root instanceof ShadowRoot ? root.host : null
        }
      }
      const bounds = element.getBoundingClientRect()
      return bounds.width > 0 && bounds.height > 0
    })
    const loadingOverlayVisible = visibleLoadingOverlays.length > 0
    const loadingAttributes = main
      ? Object.fromEntries(
          [...main.attributes]
            .filter((attribute) => attribute.name.startsWith('data-landrush-loading-'))
            .map((attribute) => [attribute.name, attribute.value]),
        )
      : null
    return {
      ambientReady: main?.getAttribute('data-landrush-loading-ambient-ready') ?? null,
      handedOff: main?.getAttribute('data-landrush-loading-handed-off') ?? null,
      initialParcelReady:
        main?.getAttribute('data-landrush-loading-initial-parcel-ready') ?? null,
      loadingAttributes,
      loadingOverlayCount: loadingOverlays.length,
      loadingOverlayVisible,
      loadingOverlayVisibleCount: visibleLoadingOverlays.length,
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
      hud: hud
        ? {
            expectedPhase: hud.getAttribute('data-expected-phase'),
            nightStartReady: hud.getAttribute('data-night-start-ready'),
            phase: hud.getAttribute('data-phase'),
            phaseReady: hud.getAttribute('data-phase-ready'),
          }
        : null,
      startZombieButtonDisabled:
        startZombieButton instanceof HTMLButtonElement ? startZombieButton.disabled : null,
      startZombieButtonVisible: Boolean(startZombieButton),
      zombie:
        zombie && typeof zombie === 'object'
          ? {
              expectedPhase: zombie.expectedPhase ?? null,
              night: zombie.night ?? null,
              phase: zombie.phase ?? null,
              phaseReady: zombie.phaseReady ?? false,
              phaseSecondsRemaining: zombie.phaseSecondsRemaining ?? null,
              roomSoak: zombie.benchmarkRoomSoak ?? null,
              status: zombie.status ?? null,
            }
          : null,
    }
  })
}

async function waitForZombieDayReady(page) {
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main[data-landrush-loading-handed-off]')
        const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
        const startZombieButton = document.querySelector(
          '[data-testid="landrush-zombie-escape-build-countdown"]',
        )
        const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
        const loadingOverlayVisible = [
          ...document.querySelectorAll('[role="progressbar"]'),
        ].some((element) => {
          let current = element
          while (current) {
            if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false
            const style = getComputedStyle(current)
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              style.visibility === 'collapse' ||
              style.contentVisibility === 'hidden' ||
              Number.parseFloat(style.opacity || '1') <= 0
            ) {
              return false
            }
            if (current.parentElement) current = current.parentElement
            else {
              const root = current.getRootNode()
              current = root instanceof ShadowRoot ? root.host : null
            }
          }
          const bounds = element.getBoundingClientRect()
          return bounds.width > 0 && bounds.height > 0
        })
        return (
          main?.getAttribute('data-landrush-loading-handed-off') === 'true' &&
          !loadingOverlayVisible &&
          hud?.getAttribute('data-night-start-ready') === 'true' &&
          hud.getAttribute('data-phase') === 'build' &&
          hud.getAttribute('data-expected-phase') === 'build' &&
          startZombieButton instanceof HTMLButtonElement &&
          !startZombieButton.disabled &&
          zombie?.status === 'playing' &&
          zombie.phase === 'build' &&
          zombie.expectedPhase === 'build'
        )
      },
      null,
      { timeout: 360_000 },
    )
  } catch (error) {
    const state = await readiness(page).catch((readError) => ({
      readinessReadError: String(readError),
    }))
    throw new Error(`Zombie day readiness timed out: ${JSON.stringify(state)}`, {
      cause: error,
    })
  }
}

function zombieDayReadinessIssues(state) {
  const issues = []
  if (state.handedOff !== 'true') issues.push(`loading handoff=${String(state.handedOff)}`)
  if (state.loadingOverlayVisible) issues.push('loading overlay is visible')
  if (!state.zombieHudVisible) issues.push('Zombie HUD is unavailable')
  if (state.hud?.nightStartReady !== 'true') {
    issues.push(`HUD nightStartReady=${String(state.hud?.nightStartReady)}`)
  }
  if (state.hud?.phase !== 'build' || state.hud?.expectedPhase !== 'build') {
    issues.push(`HUD phase=${String(state.hud?.phase)}/${String(state.hud?.expectedPhase)}`)
  }
  if (!state.startZombieButtonVisible) issues.push('Start zombie control is unavailable')
  if (state.startZombieButtonDisabled !== false) {
    issues.push(`Start zombie disabled=${String(state.startZombieButtonDisabled)}`)
  }
  if (state.zombie?.status !== 'playing') {
    issues.push(`status=${String(state.zombie?.status)}`)
  }
  if (state.zombie?.phase !== 'build' || state.zombie?.expectedPhase !== 'build') {
    issues.push(
      `phase=${String(state.zombie?.phase)}/${String(state.zombie?.expectedPhase)}`,
    )
  }
  if (state.zombie?.roomSoak?.enabled !== true || state.zombie.roomSoak.active !== false) {
    issues.push(`room soak=${JSON.stringify(state.zombie?.roomSoak ?? null)}`)
  }
  return issues
}

function zombieNightReadinessIssues(state) {
  const issues = []
  if (state.loadingOverlayVisible) issues.push('loading overlay is visible')
  if (!state.zombieHudVisible) issues.push('Zombie HUD is unavailable')
  if (state.startZombieButtonVisible) issues.push('Start zombie control remained visible')
  if (state.hud?.phase !== 'night' || state.hud?.expectedPhase !== 'night') {
    issues.push(`HUD phase=${String(state.hud?.phase)}/${String(state.hud?.expectedPhase)}`)
  }
  if (state.hud?.phaseReady !== 'true') {
    issues.push(`HUD phaseReady=${String(state.hud?.phaseReady)}`)
  }
  if (state.zombie?.status !== 'playing') {
    issues.push(`status=${String(state.zombie?.status)}`)
  }
  if (state.zombie?.phase !== 'night' || state.zombie?.expectedPhase !== 'night') {
    issues.push(
      `phase=${String(state.zombie?.phase)}/${String(state.zombie?.expectedPhase)}`,
    )
  }
  if (state.zombie?.phaseReady !== true) {
    issues.push(`phaseReady=${String(state.zombie?.phaseReady)}`)
  }
  if (!Number.isInteger(state.zombie?.night) || state.zombie.night < 1) {
    issues.push(`night=${String(state.zombie?.night)}`)
  }
  if (
    state.zombie?.roomSoak?.active !== true ||
    state.zombie.roomSoak.phaseHeld !== true ||
    state.zombie.roomSoak.playerProtected !== true
  ) {
    issues.push(`room soak=${JSON.stringify(state.zombie?.roomSoak ?? null)}`)
  }
  return issues
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
    url.searchParams.set('game', 'zombie-escape')
    url.searchParams.set('landrushZombieRoomSoak', '1')
    if (variant !== 'gpu') url.searchParams.set('benchNoGpu', '1')
    if (variant === 'scoped') url.searchParams.set('frameProfile', '1')
    process.stderr.write(`[atomic] ${variant}: opening Zombie Escape day phase\n`)
    await browser.page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    const bridge = new BridgeClient(browser.page)
    const bridgeUp = await bridge.waitForBridge({ requireProfiler: variant === 'scoped' })
    await waitForZombieDayReady(browser.page)
    await restoreLandrushBenchmarkFixture(browser.page, bridge)
    const settled = await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 30_000 })
    if (!settled || settled.timedOut) throw new Error(`${variant} Zombie day scene did not settle`)
    await waitForZombieDayReady(browser.page)
    await sleep(1_000)
    const beforeSwitch = await readiness(browser.page)
    const beforeSwitchIssues = zombieDayReadinessIssues(beforeSwitch)
    if (beforeSwitchIssues.length > 0) {
      throw new Error(`${variant} day phase is invalid: ${beforeSwitchIssues.join('; ')}`)
    }
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
      window.__LANDRUSH_ATOMIC_VISIBILITY_CHANGES__ = []
      document.addEventListener('visibilitychange', () => {
        window.__LANDRUSH_ATOMIC_VISIBILITY_CHANGES__.push({
          state: document.visibilityState,
          tMs: performance.now(),
        })
      })
    })
    const markerName = `landrush-atomic-zombie-night-start-${variant}`
    const startZombieTarget = await browser.page.evaluate((marker) => {
      const button = document.querySelector(
        '[data-testid="landrush-zombie-escape-build-countdown"]',
      )
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        throw new Error('Start zombie control is unavailable')
      }
      window.__LANDRUSH_ATOMIC_SWITCH_POINT__ = null
      button.addEventListener(
        'click',
        (event) => {
          if (!event.isTrusted) return
          const entry = performance.mark(marker)
          console.timeStamp(marker)
          window.__PASCAL_BENCH__?.mark(marker)
          window.__LANDRUSH_ATOMIC_SWITCH_POINT__ = {
            isTrusted: event.isTrusted,
            pageTMs: entry.startTime,
            timeOriginMs: performance.timeOrigin,
            url: window.location.href,
          }
          setTimeout(() => {
            window.__LANDRUSH_ATOMIC_NIGHT_PROTECTION__ = {
              pageTMs: performance.now(),
              state: window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.begin() ?? null,
            }
          }, 0)
        },
        { capture: true, once: true },
      )
      const bounds = button.getBoundingClientRect()
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    }, markerName)
    await browser.cdp.send('Input.dispatchMouseEvent', {
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
      type: 'mouseMoved',
      ...startZombieTarget,
    })
    await sleep(2_000)
    await browser.cdp.send('Input.dispatchMouseEvent', {
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'mouse',
      type: 'mousePressed',
      ...startZombieTarget,
    })
    await browser.cdp.send('Input.dispatchMouseEvent', {
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'mouse',
      type: 'mouseReleased',
      ...startZombieTarget,
    })
    const switchPoint = await browser.page.evaluate(
      () => window.__LANDRUSH_ATOMIC_SWITCH_POINT__,
    )
    if (!switchPoint) throw new Error(`${variant} trusted Start zombie marker was not recorded`)
    process.stderr.write(
      `[atomic] ${variant}: night started; recording +${WINDOW_AFTER_SECONDS}s\n`,
    )
    await sleep(WINDOW_AFTER_SECONDS * 1_000 + 200)
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
    const afterSwitchIssues = zombieNightReadinessIssues(afterSwitch)
    if (afterSwitchIssues.length > 0) {
      await writeJson(
        path.join(runDir, `capture-${variant}-rejected.json`),
        {
          afterSwitch,
          beforeSwitch,
          consoleErrors,
          droppedByRing: drained.droppedByRing,
          endPoint,
          pageErrors,
          reason: afterSwitchIssues,
          switchPoint,
          variant,
        },
        true,
      )
      throw new Error(`${variant} night phase is invalid: ${afterSwitchIssues.join('; ')}`)
    }
    const finalState = await browser.page.evaluate(() => ({
      bridgePreserved: window.__LANDRUSH_ATOMIC_BRIDGE__ === window.__PASCAL_BENCH__,
      visibility: document.visibilityState,
      visibilityChanges: window.__LANDRUSH_ATOMIC_VISIBILITY_CHANGES__ ?? [],
      nightProtection: window.__LANDRUSH_ATOMIC_NIGHT_PROTECTION__ ?? null,
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
    const validityIssues = []
    if (capture.droppedByRing !== 0) {
      validityIssues.push(`ring-buffer drops=${capture.droppedByRing}`)
    }
    if (capture.pageErrors.length > 0) {
      validityIssues.push(`page errors=${capture.pageErrors.length}`)
    }
    if (!capture.finalState.bridgePreserved) validityIssues.push('benchmark bridge was replaced')
    if (capture.finalState.visibility !== 'visible') {
      validityIssues.push(`final visibility=${capture.finalState.visibility}`)
    }
    if (capture.finalState.visibilityChanges.length > 0) {
      validityIssues.push(`visibility changes=${capture.finalState.visibilityChanges.length}`)
    }
    if (validityIssues.length > 0) {
      throw new Error(`${variant} capture is invalid: ${validityIssues.join('; ')}`)
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
  const timeline = buildRawFrameTimeline(
    capture.frames,
    capture.switchPoint.pageTMs,
    {
      windowEndMs: WINDOW_END_US / 1_000,
      windowStartMs: WINDOW_START_US / 1_000,
    },
  )
  const values = timeline.frames.map((frame) => frame.rawDurationMs)
  return { ...numericStats(values), frameCount: timeline.frames.length }
}

function phaseName(offsetUs) {
  if (offsetUs <= 0) return '-2s..0s'
  const second = Math.min(
    WINDOW_AFTER_SECONDS - 1,
    Math.max(0, Math.floor((offsetUs - 1) / 1_000_000)),
  )
  return `+${second}s..+${second + 1}s`
}

function accountingPhases() {
  return [
    { endOffsetUs: 0, phase: '-2s..0s', startOffsetUs: -2_000_000 },
    ...Array.from({ length: WINDOW_AFTER_SECONDS }, (_, second) => ({
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
  const timeline = buildRawFrameTimeline(
    capture.frames,
    capture.switchPoint.pageTMs,
    {
      windowEndMs: WINDOW_END_US / 1_000,
      windowStartMs: WINDOW_START_US / 1_000,
    },
  )
  const groups = new Map()
  for (const frame of timeline.frames) {
    const name = phaseName(frame.plotEndOffsetUs)
    let values = groups.get(name)
    if (!values) {
      values = []
      groups.set(name, values)
    }
    values.push(frame.rawDurationMs)
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

function buildReport({
  captures,
  frameTimelines,
  fixtureSummary,
  gpuLedger,
  headless,
  health,
  renderScale,
  responsibility,
  runDir,
  scopedLedger,
  traceLedger,
  v8Ledger,
}) {
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
  const primarySeriesById = new Map(
    responsibility.primary.series.map((series) => [series.id, series]),
  )
  const primaryWallTotals = new Map()
  for (const frame of responsibility.primary.frames) {
    for (const bucket of frame.chartBuckets) {
      const series = primarySeriesById.get(bucket.seriesId)
      const key = `${bucket.category}\u0000${bucket.label}`
      const current = primaryWallTotals.get(key) ?? {
        category: series?.category ?? bucket.category,
        label: series?.label ?? bucket.label,
        totalUs: 0,
      }
      current.totalUs += bucket.durationUs
      primaryWallTotals.set(key, current)
    }
  }
  const primaryWallLeaves = [...primaryWallTotals.values()]
    .sort((left, right) => right.totalUs - left.totalUs)
    .slice(0, 30)
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
  const baselineWindows = frameTimelines.baseline.frames
  const baselineWorst = [...baselineWindows].sort(
    (left, right) => right.rawDurationMs - left.rawDurationMs,
  )[0]
  const baselineSlowFrames = baselineWindows.filter(
    (frame) => isStrictFrameBudgetMissMs(frame.rawDurationMs),
  )
  const baselinePostSwitchWindows = baselineWindows.filter((frame) => frame.plotEndOffsetUs > 0)
  const baselinePostSwitchSlowFrames = baselinePostSwitchWindows.filter(
    (frame) => isStrictFrameBudgetMissMs(frame.rawDurationMs),
  )
  const v8NodeById = new Map(v8Ledger.nodes.map((node) => [node.nodeId, node]))
  const sampledStackTotal = (fragment, startOffsetUs = 0, endOffsetUs = WINDOW_END_US) => {
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
  const worstTraceFrames = responsibility.primary.frames
    .map((frame) => {
      return {
        activeUs: frame.rendererMainActiveUs,
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
  return `# Zombie day-to-night switch atomic frame accounting

This captures a trusted click on the visible **Start zombie** control inside an already loaded Zombie Escape day phase. The logical window is exactly ${WINDOW_DURATION_SECONDS} seconds: **−${WINDOW_BEFORE_SECONDS.toFixed(3)}s through +${WINDOW_AFTER_SECONDS.toFixed(3)}s**, where 0 is the trusted click event immediately before the React night-start handler runs.

The server reported **${health.mode}** mode. These results diagnose this local ${health.mode} build; they are not claims about different hardware or deployment environments. The trace capture is the one exhaustive attributed primary execution. Baseline, V8, scoped, and GPU are four separate cold observer-effect validation runs; their unique frames are non-additive and never inherit attribution from the trace run.

## Capture validity

- Route: \`/landrush-lab/pascal-multiplayer-island?offline=1&bench=1&game=zombie-escape&landrushZombieRoomSoak=1\`.
- Scenario: fully loaded and settled Zombie Escape day phase, ${WINDOW_BEFORE_SECONDS} seconds untouched, trusted Start zombie click, then ${WINDOW_AFTER_SECONDS} seconds with the benchmark room-soak protection holding night and preventing idle-player death. No target-roster override or synthetic gameplay input is used.
- Fixture: \`${fixtureSummary.name}\`, ${fixtureSummary.buildCount} builds, ${fixtureSummary.nodeCount} nodes, world \`${fixtureSummary.worldId}\`.
- Input seed: none; the harness sends no movement or combat input.
- Viewport: 1600×1000 CSS pixels at ${formatAtomicRenderScale(renderScale)}; ${headless ? 'headless' : 'headful'} Chromium with WebGPU.
- Browser bridge survived every soft transition: ${VARIANTS.every((variant) => captures[variant].finalState.bridgePreserved) ? 'yes' : 'NO'}.
- Ring-buffer drops: ${VARIANTS.reduce((sum, variant) => sum + captures[variant].droppedByRing, 0)}.
- Frame-index continuity issues across all five captures: ${Object.values(responsibility.invariants.allContinuityIssueCounts).reduce((sum, count) => sum + count, 0)}.
- Visibility changes during the measured windows: ${VARIANTS.reduce((sum, variant) => sum + captures[variant].finalState.visibilityChanges.length, 0)}.
- Page/console errors: ${errors.length}.
- V8 clock alignment uncertainty: ${formatMs(v8Ledger.invariants.clockUncertaintyUs)}ms.
- Before the switch, Zombie asset readiness was \`${captures.baseline.beforeSwitch.zombieAssetsReady}\`; at +${WINDOW_AFTER_SECONDS}s it was \`${captures.baseline.afterSwitch.zombieAssetsReady}\`.

## Direct findings

- The observer-light run's largest complete frame was **${formatMs(baselineWorst.rawDurationMs * 1_000)}ms**, from ${formatMs(baselineWorst.rawStartOffsetUs)}ms to ${formatMs(baselineWorst.rawEndOffsetUs)}ms relative to the click. **${baselineSlowFrames.length}/${baselineWindows.length}** complete frames with positive overlap of the logical window, including **${baselinePostSwitchSlowFrames.length}/${baselinePostSwitchWindows.length}** post-click frames, exceeded the strict raw-time predicate \`durationMs × 60 > 1000\` (${(FRAME_BUDGET_US / 1_000).toFixed(6)}ms).
- The largest traced interval was **${formatMs(worstTraceFrames[0].totalUs)}ms**, of which **${formatMs(worstTraceFrames[0].activeUs)}ms** was renderer-main work. Tracing is intentionally isolated in its own cold differential run, so its cadence is not substituted for the observer-light baseline.
- The primary trace run contains **${responsibility.primary.slowFrameCount}/${responsibility.primary.frames.length}** strict misses. Every one is retained with an additive full-frame wall partition: renderer-main work, named overlapping GPU/compositor/presentation/other Chrome owners during renderer gaps, and an explicit irreducible bucket only where no synchronous trace owner exists.
- Timestamped render-pass execution did not explain the stalls: mean timestamped GPU busy time was **${formatNumber(gpuBefore.average)}ms** before and **${formatNumber(gpuAfter.average)}ms** after the switch; the post-switch maximum was **${formatNumber(gpuAfter.maximum)}ms**. These timestamps exclude pipeline creation, driver compilation, presentation, and compositor waits; those CPU-side Chrome owners are represented separately by the primary trace wall partition when the trace exposes them.
- V8 sampled stacks contain **${formatMs(sampledStackTotal('PostProcessingPasses.useFrame'))}ms** in post-processing and **${formatMs(sampledStackTotal('ZombieEscapeEffects'))}ms** in Zombie effects during +0s..+${WINDOW_AFTER_SECONDS}s. These are sampled attribution totals from a separate run, not values to add to baseline wall time.

## Observer cost check

Each row is a separate cold browser-profile run. Aggregates may exceed 2ms; every individual entry in the atomic ledgers is at most 2ms.

${markdownTable(
  ['variant', 'frames', 'mean dt ms', 'median dt ms', 'p95 dt ms', 'max dt ms'],
  cadenceRows,
)}

## Exhaustive strict-miss ledgers

- \`frame-responsibility.json\`: every complete primary trace frame with positive overlap of −${WINDOW_BEFORE_SECONDS}s..+${WINDOW_AFTER_SECONDS}s, raw sub-microsecond duration, separate clipped plot coordinates, every strict miss and source, plus explicitly non-additive summaries for the other four cold captures.
- \`slow-frames.csv\`: every strict raw \`durationMs × 60 > 1000\` miss from all five isolated captures. Rows from different captures are never matched or added.
- \`slow-frame-contributors.csv\`: every additive trace-wall contributor for every strict primary miss. \`post_budget_us\` is mapped against the same raw full-frame clock.

The primary 0–100% responsibility stack is one wall partition from the trace execution. Renderer gaps are split by overlapping named raw Chrome trace leaves; no parallel track is added to the stack. A category+label contributor receives its own fill only when its aggregate in that frame is strictly greater than 2.000ms; all smaller contributors reconcile into the neutral \`${responsibility.rules.residualLabel}\` bucket.

## Observer-light cadence by time from switch

${markdownTable(['phase', 'frames', 'mean dt ms', 'p95 dt ms', 'max dt ms'], phaseRows)}

## Primary trace wall ownership

This is the exhaustive additive wall-time partition for the primary trace execution. A renderer-main gap is assigned to an overlapping named GPU-process, compositor, presentation, or other Chrome trace leaf when one exists. Only wall time with no synchronous trace owner remains \`irreducible wall time · no synchronous trace owner\`.

${markdownTable(
  ['category', 'trace leaf label', `${WINDOW_DURATION_SECONDS}s aggregate ms`],
  primaryWallLeaves.map((row) => [row.category, row.label.replaceAll('|', '\\|'), formatMs(row.totalUs)]),
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

## Scoped application responsibility (normalized)

The source spans carry durations but no start timestamps. Each frame's duration-only buckets are proportionally normalized to that bench wall interval and ordered synthetically. These values are normalized responsibility proportions, not measured compute duration or exact per-frame timing.

${markdownTable(
  ['category', 'system', `${WINDOW_DURATION_SECONDS}s normalized wall-responsibility ms`],
  scopedLeaves.map((row) => [row.category, row.label.replaceAll('|', '\\|'), formatMs(row.totalUs)]),
)}

### Largest normalized buckets by phase (synthetic order)

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
  ['category', 'sampled leaf', `${WINDOW_DURATION_SECONDS}s sampled ms`],
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
  ['category', 'pass', `${WINDOW_DURATION_SECONDS}s aggregate GPU ms`],
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

All exact trace wall partitions include explicit idle/untraced time, so no duration vanishes. The Chrome per-thread rows each reconcile independently to the same frame interval; summing parallel threads would double-count elapsed time. Scoped application buckets are normalized reconciliation only, not exact timing or raw compute. GPU pass leaves reconcile to measured timestamped render-pass busy time, not CPU wall time.

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
      browser: { deviceScaleFactor: 1, headless, height: 1_000, width: 1_600 },
      durationSeconds: WINDOW_DURATION_SECONDS,
      fixture: summarizeLandrushBenchmarkFixture(fixture),
      health,
      route: '/landrush-lab/pascal-multiplayer-island',
      scenario:
        'trusted Start zombie click from settled day phase into protected deterministic night',
      variants: VARIANTS,
      window: { afterSeconds: WINDOW_AFTER_SECONDS, beforeSeconds: WINDOW_BEFORE_SECONDS },
    }
  }
  const renderScale = summarizeAtomicRenderScale(captures, VARIANTS)
  metadata.renderScale = renderScale
  await writeJson(path.join(runDir, 'metadata.json'), metadata, true)
  normalizeV8ClockCalibration(captures.v8, raw.v8.profile)
  await writeJson(path.join(runDir, 'capture-v8.json'), captures.v8)
  const frameTimelines = Object.fromEntries(
    VARIANTS.map((variant) => [
      variant,
      buildRawFrameTimeline(captures[variant].frames, captures[variant].switchPoint.pageTMs, {
        windowEndMs: WINDOW_END_US / 1_000,
        windowStartMs: WINDOW_START_US / 1_000,
      }),
    ]),
  )
  const baselineLedger = buildBaselineWallLedger(
    captures.baseline.frames,
    captures.baseline.switchPoint.pageTMs,
    ACCOUNTING_WINDOW,
  )
  const trace = JSON.parse(await readFile(raw.trace.tracePath, 'utf8'))
  const traceLedger = buildTraceLedger({
    frames: captures.trace.frames,
    markerName: captures.trace.markerName,
    options: ACCOUNTING_WINDOW,
    switchPageTMs: captures.trace.switchPoint.pageTMs,
    traceEvents: trace.traceEvents ?? [],
  })
  const traceFullFrameLedger = buildTraceLedger({
    frames: captures.trace.frames,
    markerName: captures.trace.markerName,
    options: {
      windowEndUs: frameTimelines.trace.fullFrameLedgerWindow.endOffsetUs,
      windowStartUs: frameTimelines.trace.fullFrameLedgerWindow.startOffsetUs,
    },
    switchPageTMs: captures.trace.switchPoint.pageTMs,
    traceEvents: trace.traceEvents ?? [],
  })
  const v8Ledger = buildV8SampleLedger({
    clockOffsetUs: captures.v8.clockCalibration.offsetUs,
    clockUncertaintyUs: captures.v8.clockCalibration.uncertaintyUs,
    frames: captures.v8.frames,
    options: ACCOUNTING_WINDOW,
    profile: raw.v8.profile,
    switchPageTMs: captures.v8.switchPoint.pageTMs,
  })
  const scopedLedger = buildScopedCpuLedger(
    captures.scoped.frames,
    captures.scoped.switchPoint.pageTMs,
    ACCOUNTING_WINDOW,
  )
  const gpuLedger = buildGpuAtomicLedger(
    captures.gpu.frames,
    captures.gpu.switchPoint.pageTMs,
    ACCOUNTING_WINDOW,
  )
  const responsibility = buildZombieFrameResponsibility({
    baselineLedger,
    frameTimelines,
    gpuLedger,
    logicalWindow: { endOffsetUs: WINDOW_END_US, startOffsetUs: WINDOW_START_US },
    scopedLedger,
    traceLedger: traceFullFrameLedger,
    v8Ledger,
  })
  await Promise.all([
    writeJson(path.join(runDir, 'raw-frame-timelines.json'), frameTimelines),
    writeJson(path.join(runDir, 'atomic-baseline-wall.json'), baselineLedger),
    writeJson(path.join(runDir, 'atomic-chrome-thread-wall.json'), traceLedger),
    writeJson(
      path.join(runDir, 'atomic-chrome-thread-wall-full-frames.json'),
      traceFullFrameLedger,
    ),
    writeJson(path.join(runDir, 'atomic-v8-samples.json'), v8Ledger),
    writeJson(path.join(runDir, 'atomic-scoped-app-systems.json'), scopedLedger),
    writeJson(path.join(runDir, 'atomic-webgpu-passes.json'), gpuLedger),
    writeJson(path.join(runDir, 'frame-responsibility.json'), responsibility),
    writeFile(path.join(runDir, 'slow-frames.csv'), serializeSlowFramesCsv(responsibility)),
    writeFile(
      path.join(runDir, 'slow-frame-contributors.csv'),
      serializeSlowFrameContributorsCsv(responsibility),
    ),
  ])
  const report = buildReport({
    captures,
    frameTimelines,
    fixtureSummary: metadata.fixture,
    gpuLedger,
    headless: metadata.browser?.headless ?? headless,
    health,
    renderScale,
    responsibility,
    runDir,
    scopedLedger,
    traceLedger,
    v8Ledger,
  })
  await writeFile(path.join(runDir, 'report.md'), report)
  process.stdout.write(`${runDir}\n`)
}

await main()
