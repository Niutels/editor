#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchBenchBrowser } from './chrome.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CANONICAL_PATH = '/landrush-lab/pascal-multiplayer-island/'
const START_BUTTON = '[data-testid="landrush-zombie-escape-build-countdown"]'
const GAME_FPS_SELECTOR = '[data-landrush-day-chrome] > section > span:nth-child(8)'
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024
const MAX_PROFILE_BYTES = 20 * 1024 * 1024
const CPU_PROFILE_INTERVAL_US = 1000
const STARTUP_READINESS_TIMEOUT_MS = 180000

export function parseColdEntryArgs(argv) {
  const allowed = new Set(['base-url', 'expected-build-id', 'expected-source', 'source-kind', 'scenario', 'duration', 'post-hide', 'output-dir', 'cpu-profile', 'no-spawn', 'server-mode', 'ws', 'help'])
  const raw = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--') || !allowed.has(flag.slice(2))) throw new Error(`Unknown option ${flag}`)
    const name = flag.slice(2)
    if (['cpu-profile', 'no-spawn', 'help'].includes(name)) raw[name] = true
    else {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
      raw[name] = value
    }
  }
  if (raw.help) return { help: true }
  const base = new URL(raw['base-url'] ?? 'https://landrush.niutgames.com')
  if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('--base-url must be an HTTP(S) origin')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  const sourceKind = raw['source-kind'] ?? 'published'
  if (!['published', 'worktree'].includes(sourceKind)) throw new Error('--source-kind must be published or worktree')
  if (sourceKind === 'worktree' && !local) throw new Error('--source-kind worktree requires a local base URL')
  const scenario = raw.scenario ?? 'night-entry'
  if (!['startup', 'night-entry'].includes(scenario)) throw new Error('--scenario must be startup or night-entry')
  const durationSeconds = Number(raw.duration ?? (scenario === 'startup' ? 30 : 180))
  const postHideSeconds = Number(raw['post-hide'] ?? 30)
  if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 300) throw new Error('--duration must be 30..300 seconds')
  if (!Number.isFinite(postHideSeconds) || postHideSeconds < 30 || postHideSeconds > 40) throw new Error('--post-hide must be 30..40 seconds, before the normal 60s day ends')
  if (!/^[A-Za-z0-9_-]+$/.test(raw['expected-build-id'] ?? '')) throw new Error('--expected-build-id is required')
  if (!/^[0-9a-f]{40}$/.test(raw['expected-source'] ?? '')) throw new Error('--expected-source requires an exact 40-character SHA: published source or local worktree base HEAD, according to --source-kind')
  const serverMode = raw['server-mode'] ?? 'production'
  if (!['production', 'development'].includes(serverMode)) throw new Error('--server-mode must be production or development')
  const url = new URL(CANONICAL_PATH, base)
  url.searchParams.set('game', 'zombie-escape')
  if (raw.ws) {
    const ws = new URL(raw.ws)
    if (!local || !['ws:', 'wss:'].includes(ws.protocol) || ws.username || ws.password) throw new Error('--ws is supported only for a local app and requires a WS(S) URL')
    url.searchParams.set('ws', ws.href)
  } else if (local) throw new Error('Local canonical-world comparison requires explicit --ws; localhost otherwise selects the local authority')
  return { baseUrl: base.origin, local, sourceKind, scenario, durationSeconds, postHideSeconds, expectedBuildId: raw['expected-build-id'], expectedSource: raw['expected-source'], serverMode, cpuProfile: Boolean(raw['cpu-profile']), noSpawn: true, outputDir: raw['output-dir'] ? path.resolve(raw['output-dir']) : null, url: url.href }
}

export function extractColdEntryBuildId(html) {
  const chunks = [...String(html).matchAll(/self\.__next_f\.push\(\s*\[1,\s*("(?:[^"\\]|\\.)*")\s*\]\s*\)/g)].map((match) => JSON.parse(match[1])).join('')
  const roots = chunks.split('\n').filter((line) => line.startsWith('0:'))
  if (roots.length !== 1) throw new Error(`Expected one Next flight root; received ${roots.length}`)
  const value = JSON.parse(roots[0].slice(2)).b
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Next build ID is missing')
  return value
}

export function installColdEntryObserver(config) {
  if (window.top !== window || location.href !== config.url) return
  const state = { frames: [], samples: [], fpsSamples: [], resources: [], longTasks: [], errors: [], inputs: [], visibility: [], focus: [], milestones: [], overflow: [], observerSupport: {}, styleReads: 0, hiddenAt: null, readyAt: null, clickRequestedAt: null, clickedAt: null, nightReadyAt: null, terminalAt: null, finishedAt: null, outcome: null }
  let stopped = false
  let finished = false
  let sawLoader = false
  let lastSampleAt = -Infinity
  let preEntryNotified = false
  let main = null
  let hud = null
  let shell = null
  let gameFpsCounter = null
  let latestGameFps = null
  let lastGameFpsReadAt = -Infinity
  let lastHeartbeatAt = -Infinity
  let rafId = null
  let startupTimer = null
  const observers = []
  const push = (array, value, limit, label) => {
    if (array.length < limit) array.push(value)
    else if (!state.overflow.includes(label)) state.overflow.push(label)
  }
  const notify = (name) => {
    const row = { name, now: performance.now() }
    push(state.milestones, row, 30, 'milestones')
    Promise.resolve(window.__landrushColdEntryEvent?.(row)).catch(() => {})
  }
  const finish = (outcome) => {
    if (finished) return
    finished = true
    state.outcome = outcome
    state.finishedAt = performance.now()
    clearTimeout(startupTimer)
    notify('done')
  }
  startupTimer = setTimeout(() => {
    if (state.readyAt === null) finish('startup-readiness-timeout')
  }, Math.max(0, config.startupReadinessTimeoutMs - performance.now()))
  const present = (element) => !!element?.isConnected && !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  const readState = () => {
    const now = performance.now()
    if (now - lastGameFpsReadAt >= 500) {
      lastGameFpsReadAt = now
      if (!gameFpsCounter?.isConnected) gameFpsCounter = document.querySelector(config.gameFpsSelector)
      latestGameFps = null
      if (gameFpsCounter) {
        const text = (gameFpsCounter.textContent ?? '').trim().slice(0, 40)
        const match = /^(\d+)fps$/.exec(text)
        latestGameFps = { now, fps: match ? Number(match[1]) : null, text, status: match ? 'available' : text === '--fps' ? 'unavailable' : 'unrecognized-label', source: 'MultiplayerStatusPanel.renderedFpsRef' }
        push(state.fpsSamples, latestGameFps, 1500, 'fpsSamples')
      }
    }
    main ??= document.querySelector('main[data-landrush-interface-focus-sink]')
    if (!hud?.isConnected) hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
    shell ??= document.querySelector('[data-landrush-island-loading-shell]')
    const bars = [...document.querySelectorAll('[role="progressbar"]')]
    let loadingVisible = bars.some(present)
    const handedOff = main?.getAttribute('data-landrush-loading-handed-off') === 'true'
    if (handedOff && loadingVisible) {
      loadingVisible = bars.some((bar) => {
        if (!present(bar)) return false
        state.styleReads += 1
        const style = getComputedStyle(bar)
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
      })
    }
    const runtime = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const button = document.querySelector(config.startButton)
    const terminal = !!document.querySelector('[data-testid="landrush-zombie-escape-run-again"]')
    return {
      now: performance.now(), loadingVisible, handedOff,
      worldReady: main?.getAttribute('data-landrush-loading-world-frame-ready') === 'true',
      viewerReady: main?.getAttribute('data-landrush-loading-viewer-scene-ready') === 'true',
      assetsReady: main?.getAttribute('data-landrush-loading-zombie-assets-ready') === 'true',
      navigationReady: main?.getAttribute('data-landrush-loading-zombie-navigation-ready') === 'true',
      integrated: hud?.getAttribute('data-integrated-landrush-world') === 'true',
      phase: hud?.getAttribute('data-phase') ?? null,
      expectedPhase: hud?.getAttribute('data-expected-phase') ?? null,
      phaseReady: hud?.getAttribute('data-phase-ready') === 'true',
      nightStartReady: hud?.getAttribute('data-night-start-ready') === 'true',
      secondsRemaining: hud?.getAttribute('data-phase-seconds-remaining') ?? null,
      startEnabled: !!button && !button.disabled, terminal,
      runtimeStatus: runtime?.status ?? null, runtimeNight: runtime?.night ?? null,
      renderError: !!document.querySelector('[data-landrush-zombie-render-error]'),
      canvases: document.querySelectorAll('canvas').length,
      focused: document.hasFocus(), visibility: document.visibilityState,
      gameFrameFps: latestGameFps?.fps ?? null, gameFrameFpsSampleAt: latestGameFps?.now ?? null,
      actualReadyMarker: shell?.getAttribute('data-landrush-island-loading-ready-at-ms') ?? null,
    }
  }
  // The HUD's phaseReady is combat actionability, deliberately false during the build phase.
  const isReady = (sample) => sample.handedOff && !sample.loadingVisible && sample.worldReady && sample.viewerReady && sample.assetsReady && sample.integrated && (sample.phase === 'build' ? sample.nightStartReady : sample.phase === 'night' && sample.phaseReady) && sample.phase === sample.expectedPhase && sample.canvases === 1 && !sample.renderError && !sample.terminal
  const sample = () => {
    const current = readState()
    if (current.loadingVisible) sawLoader = true
    if (state.hiddenAt === null && sawLoader && current.handedOff && !current.loadingVisible) {
      state.hiddenAt = current.now
      notify('loader-hidden')
    }
    if (state.readyAt === null && current.now < config.startupReadinessTimeoutMs && state.hiddenAt !== null && isReady(current)) {
      state.readyAt = current.now
      clearTimeout(startupTimer)
      notify('game-ready')
    }
    if (current.terminal && state.terminalAt === null) {
      state.terminalAt = current.now
      notify('terminal')
    }
    if (state.clickRequestedAt !== null && state.nightReadyAt === null && current.phase === 'night' && isReady(current)) {
      state.nightReadyAt = current.now
      notify('night-ready')
    }
    if (current.renderError) finish('render-error')
    push(state.samples, current, 3000, 'samples')
    if (current.now - lastHeartbeatAt >= 10000) {
      lastHeartbeatAt = current.now
      Promise.resolve(window.__landrushColdEntryEvent?.({ name: 'heartbeat', now: current.now, sample: current, lastErrors: state.errors.slice(-3) })).catch(() => {})
    }
    if (state.readyAt === null && current.now >= config.startupReadinessTimeoutMs) finish('startup-readiness-timeout')
    return current
  }
  const mutation = new MutationObserver(() => {
    if (finished) return
    if (state.hiddenAt === null) sample()
  })
  mutation.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'data-landrush-loading-handed-off'] })
  observers.push(mutation)
  for (const [type, target, limit] of [['resource', state.resources, 3000], ['longtask', state.longTasks, 2000]]) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const row = { start: entry.startTime, duration: entry.duration }
          if (type === 'resource') Object.assign(row, { name: entry.name.slice(0, 500), initiatorType: entry.initiatorType, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, responseEnd: entry.responseEnd })
          push(target, row, limit, type)
        }
      })
      observer.observe({ type, buffered: true })
      state.observerSupport[type] = true
      observers.push(observer)
    } catch { state.observerSupport[type] = false }
  }
  const onVisibility = () => push(state.visibility, { now: performance.now(), value: document.visibilityState }, 100, 'visibility')
  const onFocus = (event) => push(state.focus, { now: performance.now(), type: event?.type ?? 'initial', focused: document.hasFocus() }, 100, 'focus')
  const onInput = (event) => {
    const startButton = event.target instanceof Element ? event.target.closest(config.startButton) : null
    const row = { now: performance.now(), type: event.type, trusted: event.isTrusted, startButton: !!startButton }
    push(state.inputs, row, 1000, 'inputs')
    if (event.type === 'pointerdown' && event.isTrusted && startButton && state.clickedAt === null) state.clickedAt = row.now
  }
  const onError = (event) => push(state.errors, { now: performance.now(), type: event.type, message: String(event.message ?? event.reason ?? 'resource or context error').slice(0, 1000) }, 200, 'errors')
  addEventListener('visibilitychange', onVisibility)
  addEventListener('focus', onFocus)
  addEventListener('blur', onFocus)
  for (const type of ['pointerdown', 'keydown', 'wheel']) addEventListener(type, onInput, { capture: true, passive: true })
  addEventListener('error', onError, true)
  addEventListener('unhandledrejection', onError)
  document.addEventListener('webglcontextlost', onError, true)
  onVisibility()
  onFocus()
  const frame = (timestamp) => {
    if (stopped || finished) return
    const now = performance.now()
    push(state.frames, [timestamp, now], 100000, 'frames')
    if (now - lastSampleAt >= 500) {
      lastSampleAt = now
      const current = sample()
      if (state.hiddenAt !== null && state.readyAt !== null) {
        if (config.scenario === 'startup' && now - state.hiddenAt >= config.durationSeconds * 1000) finish('complete')
        if (config.scenario === 'night-entry' && !preEntryNotified && now - state.hiddenAt >= config.postHideSeconds * 1000) {
          preEntryNotified = true
          if (!isReady(current) || current.phase !== 'build' || !current.startEnabled) finish('first-night-control-unavailable')
          else notify('entry-ready')
        }
      }
      if (state.clickRequestedAt !== null && state.nightReadyAt === null && now - state.clickRequestedAt > 60000) finish('night-readiness-timeout')
      if (state.nightReadyAt !== null) {
        const elapsed = now - state.nightReadyAt
        if (state.terminalAt !== null && elapsed >= 30000) finish('terminal-before-duration')
        else if (elapsed >= config.durationSeconds * 1000) finish('complete')
      }
    }
    rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)
  window.__LANDRUSH_COLD_ENTRY__ = {
    requestEntry() {
      const current = sample()
      if (!isReady(current) || current.phase !== 'build' || !current.startEnabled || state.clickRequestedAt !== null) throw new Error('First Start zombie control is not ready')
      state.clickRequestedAt = performance.now()
      notify('entry-requested')
      return current
    },
    stop(outcome = null) {
      if (outcome && state.outcome === null) {
        state.outcome = outcome
        state.finishedAt = performance.now()
      }
      stopped = true
      cancelAnimationFrame(rafId)
      clearTimeout(startupTimer)
      for (const observer of observers) observer.disconnect()
      removeEventListener('visibilitychange', onVisibility)
      removeEventListener('focus', onFocus)
      removeEventListener('blur', onFocus)
      for (const type of ['pointerdown', 'keydown', 'wheel']) removeEventListener(type, onInput, true)
      removeEventListener('error', onError, true)
      removeEventListener('unhandledrejection', onError)
      document.removeEventListener('webglcontextlost', onError, true)
      return { ...state, endAt: state.finishedAt ?? performance.now(), final: readState() }
    },
  }
}

export function summarizeColdEntryFrames(frames, start, end) {
  const intervals = []
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index - 1][0] < start || frames[index][0] > end) continue
    const dt = frames[index][0] - frames[index - 1][0]
    if (dt > 0) intervals.push(dt)
  }
  const sorted = [...intervals].sort((a, b) => a - b)
  const percentile = (fraction) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null
  const total = intervals.reduce((sum, value) => sum + value, 0)
  return { start, end, intervals: intervals.length, coveredMs: total, rafFps: total ? intervals.length * 1000 / total : null, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1) ?? null, over50ms: intervals.filter((value) => value > 50).length, freezes250ms: intervals.filter((value) => value >= 250).length }
}

function sourceState() {
  const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  return { head: git('rev-parse', 'HEAD'), dirty: git('status', '--short') }
}

async function compactSceneProof(page) {
  return page.evaluate(async () => {
    const api = window.__LANDRUSH_ISLAND_BUG_REPORT__
    if (!api?.create) throw new Error('Read-only scene report API is unavailable')
    // This existing API also reads canvas pixels; call it only after timing stops.
    const report = await api.create()
    return { now: performance.now(), worldId: report.save.worldId, source: report.save.source, buildCount: report.save.builds.length, savedNodeCount: report.save.builds.reduce((sum, build) => sum + build.nodes.length, 0), nodeCount: report.scene.nodeCount, rootCount: report.scene.rootNodeIds.length, levelCount: report.save.builds.reduce((sum, build) => sum + build.nodes.filter((node) => node.type === 'level').length, 0), parcels: report.save.builds.map((build) => ({ id: build.parcelId, nodes: build.nodes.length })), mode: report.mode, playerPosition: report.player.position }
  })
}

export async function runColdEntry(options) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const runDir = options.outputDir ?? path.join(REPO_ROOT, 'tooling/bench/runs', `cold-entry-${options.scenario}-${options.cpuProfile ? 'cpu' : 'light'}-${stamp}`)
  await mkdir(path.dirname(runDir), { recursive: true })
  await mkdir(runDir)
  const sourceVerification = options.sourceKind === 'worktree'
    ? 'Expected source is this local worktree base HEAD, accompanied by captured before/after dirty status. This is not publication proof or proof that dirty file bytes match the served build; the caller must tie its build to this worktree state. Browser identity is checked against expected-build-id.'
    : 'Expected source is an external publication proof supplied by the caller; browser identity is checked against expected-build-id. The captured local worktree state describes the harness, not the published bundle.'
  const result = { options, runDir, source: { kind: options.sourceKind ?? 'published', worktreeRoot: REPO_ROOT, before: sourceState(), after: null }, sourceVerification, measurement: 'Main-thread requestAnimationFrame cadence and the existing R3F callback FPS label; neither proves physical GPU/compositor presentation FPS.', observer: { nativeTrace: false, cpuProfile: options.cpuProfile, performanceMetrics: options.cpuProfile, periodicScreenshots: false, checkpoints: false, bench: false, frameProfile: false, gpuProfile: false, stateSampleHz: 2, cachedHeartbeatSeconds: 10, startupReadinessTimeoutMs: STARTUP_READINESS_TIMEOUT_MS, phaseMarks: 'DOM handoff and trusted Start zombie pointerdown' }, console: [], pageErrors: [], resourceFailures: [], lifecycle: [], sceneProof: [], failure: null, interruption: null, cleanup: { browserClosed: false, profileRemoved: false }, gates: [] }
  let browser = null
  let server = null
  let profileDir = null
  let profileStarted = false
  let performanceMetricsEnabled = false
  let capturing = true
  let hardTimer = null
  let progressTimer = null
  let lastHeartbeat = null
  let stopObserverPromise = null
  let resolveInterrupted
  const interrupted = new Promise((resolve) => { resolveInterrupted = resolve })
  const bounded = (array, value) => { if (capturing && array.length < 300) array.push(value) }
  const log = (message) => process.stderr.write(`[cold-entry] ${message}\n`)
  const onSignal = (signal) => {
    if (result.interruption) return
    result.interruption = { signal, at: new Date().toISOString() }
    result.failure ??= { message: `Capture interrupted by ${signal}` }
    log(`${signal} received; preserving partial capture and cleaning up owned browser`)
    resolveInterrupted()
  }
  const onSigint = () => onSignal('SIGINT')
  const onSigterm = () => onSignal('SIGTERM')
  const throwIfInterrupted = () => {
    if (result.interruption) throw new Error(result.failure.message)
  }
  const interruptible = (promise) => Promise.race([promise, interrupted.then(() => { throw new Error(result.failure.message) })])
  const stopObserver = () => {
    if (!browser) return Promise.resolve(null)
    if (!stopObserverPromise) {
      stopObserverPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          result.captureReadError = 'Observer stop did not respond within 5000ms; last heartbeat is retained'
          resolve(null)
        }, 5000)
        browser.page.evaluate((outcome) => window.__LANDRUSH_COLD_ENTRY__?.stop(outcome) ?? null, result.interruption ? 'interrupted' : null)
          .then(resolve, (error) => { result.captureReadError = error.message; resolve(null) })
          .finally(() => clearTimeout(timer))
      })
    }
    return stopObserverPromise
  }
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  try {
    if (options.sourceKind === 'worktree' && result.source.before.head !== options.expectedSource) throw new Error(`Worktree base HEAD mismatch: ${result.source.before.head}`)
    process.env.PASCAL_BENCH_URL = options.baseUrl
    const helpers = await import('./server.mjs')
    server = await helpers.ensureServer({ repoRoot: REPO_ROOT, runDir, spawnIfMissing: false })
    const mode = await helpers.readServerMode(10000)
    result.server = { reused: server.reused, healthMode: mode, requestedMode: options.serverMode, modeEvidence: mode ? 'self-reported health mode; this alone does not distinguish a Next runtime from a static replay server' : 'externally verified static publication plus exact served build ID' }
    if (options.local && mode !== options.serverMode) throw new Error(`Server mode mismatch: ${mode}`)
    if (!options.local && mode && mode !== options.serverMode) throw new Error(`Server mode mismatch: ${mode}`)
    const preflight = await fetch(options.url, { signal: AbortSignal.timeout(30000), redirect: 'manual' })
    const preflightHtml = await preflight.text()
    result.preflight = { status: preflight.status, url: preflight.url, buildId: extractColdEntryBuildId(preflightHtml), sha256: createHash('sha256').update(preflightHtml).digest('hex') }
    if (preflight.status !== 200 || result.preflight.buildId !== options.expectedBuildId) throw new Error('Preflight build identity failed')
    throwIfInterrupted()
    profileDir = await mkdtemp(path.join(tmpdir(), 'landrush-cold-entry-'))
    browser = await launchBenchBrowser({ headless: false, width: 1600, height: 1000, profileDir })
    throwIfInterrupted()
    await browser.page.bringToFront()
    let resolveDone
    const done = new Promise((resolve) => { resolveDone = resolve })
    let entryAction = null
    await browser.page.exposeBinding('__landrushColdEntryEvent', (_, row) => {
      if (row.name === 'heartbeat') {
        lastHeartbeat = { ...row, receivedAt: Date.now() }
        result.lastHeartbeat = lastHeartbeat
        return
      }
      result.lifecycle.push(row)
      log(`${row.name} at page ${row.now.toFixed(1)}ms`)
      if (row.name === 'done') resolveDone()
      if (row.name === 'entry-ready' && !entryAction && !result.interruption) {
        entryAction = (async () => {
          result.beforeClick = await browser.page.evaluate(() => window.__LANDRUSH_COLD_ENTRY__.requestEntry())
          await browser.page.locator(START_BUTTON).click({ timeout: 10000 })
          result.realStartButtonClicked = true
        })().catch((error) => { result.failure = { message: `Start zombie click: ${error.message}` }; resolveDone() })
      }
    })
    await browser.page.addInitScript(installColdEntryObserver, { ...options, startButton: START_BUTTON, gameFpsSelector: GAME_FPS_SELECTOR, startupReadinessTimeoutMs: STARTUP_READINESS_TIMEOUT_MS })
    browser.page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) bounded(result.console, { type: message.type(), text: message.text().slice(0, 1500) }) })
    browser.page.on('pageerror', (error) => bounded(result.pageErrors, { message: error.message }))
    browser.page.on('requestfailed', (request) => bounded(result.resourceFailures, { url: request.url(), error: request.failure()?.errorText }))
    browser.page.on('response', (response) => { if (response.status() >= 400) bounded(result.resourceFailures, { url: response.url(), status: response.status() }) })
    await browser.cdp.send('Network.enable')
    await browser.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    if (options.cpuProfile) {
      await browser.cdp.send('Performance.enable', { timeDomain: 'timeTicks' })
      performanceMetricsEnabled = true
      await browser.cdp.send('Profiler.enable')
      await browser.cdp.send('Profiler.setSamplingInterval', { interval: CPU_PROFILE_INTERVAL_US })
      await browser.cdp.send('Profiler.start')
      profileStarted = true
    }
    const hardTimeoutMs = (180 + options.postHideSeconds + 60 + options.durationSeconds) * 1000
    const timeout = new Promise((_, reject) => { hardTimer = setTimeout(() => reject(new Error(`Capture timed out after ${hardTimeoutMs}ms`)), hardTimeoutMs) })
    progressTimer = setInterval(() => log(JSON.stringify({ status: 'capture active', milestone: result.lifecycle.at(-1)?.name ?? 'navigation', cachedSample: lastHeartbeat?.sample ?? null, cachedSampleAgeMs: lastHeartbeat ? Date.now() - lastHeartbeat.receivedAt : null, lastErrors: { observer: lastHeartbeat?.lastErrors ?? [], page: result.pageErrors.slice(-3), console: result.console.filter((row) => row.type === 'error').slice(-3), resource: result.resourceFailures.slice(-3) } })), 30000)
    log(`opening ${options.url}`)
    throwIfInterrupted()
    const response = await interruptible(browser.page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 90000 }))
    await interruptible(Promise.race([done, timeout]))
    await interruptible(entryAction)
    clearTimeout(hardTimer)
    clearInterval(progressTimer)
    result.capture = await stopObserver()
    capturing = false
    if (profileStarted) {
      const { profile } = await browser.cdp.send('Profiler.stop')
      profileStarted = false
      const content = JSON.stringify(profile)
      result.cpuProfile = { bytes: Buffer.byteLength(content), written: Buffer.byteLength(content) <= MAX_PROFILE_BYTES, requestedSamplingIntervalUs: CPU_PROFILE_INTERVAL_US }
      if (result.cpuProfile.written) await writeFile(path.join(runDir, 'profile.cpuprofile'), content, { flag: 'wx' })
      else result.cpuProfile.issue = 'Profile exceeds the 20MiB artifact cap; requested attribution is unavailable'
      const { metrics } = await browser.cdp.send('Performance.getMetrics')
      const navigationStartSeconds = metrics.find((row) => row.name === 'NavigationStart')?.value ?? null
      const timestampSeconds = metrics.find((row) => row.name === 'Timestamp')?.value ?? null
      const anchorsAvailable = Number.isFinite(navigationStartSeconds) && navigationStartSeconds > 0 && Number.isFinite(timestampSeconds) && timestampSeconds >= navigationStartSeconds && Number.isFinite(profile.startTime) && Number.isFinite(profile.endTime) && profile.endTime >= profile.startTime && profile.endTime / 1e6 <= timestampSeconds
      result.cpuProfile.timing = {
        available: anchorsAvailable,
        collectionPhase: 'After observer timing and CPU profiling have stopped; no metrics polling during measurement.',
        timeDomain: 'timeTicks',
        metrics: metrics.filter((row) => row.name === 'NavigationStart' || row.name === 'Timestamp'),
        navigationStartSeconds, timestampSeconds,
        profileStartTimeUs: profile.startTime, profileEndTimeUs: profile.endTime,
        profileClock: 'Monotonic microseconds; sample i is profile.startTime + sum(profile.timeDeltas[0..i]).',
        pageClock: 'performance.now() milliseconds relative to the page NavigationStart monotonic origin.',
        sampleToPageMs: '(profile.startTime + sum(profile.timeDeltas[0..i])) / 1000 - NavigationStart * 1000',
        captureEndPageMs: result.capture?.endAt ?? null,
        clickedAtPageMs: result.capture?.clickedAt ?? null,
        clickedAtProfileTimeUs: anchorsAvailable && Number.isFinite(result.capture?.clickedAt) ? navigationStartSeconds * 1e6 + result.capture.clickedAt * 1000 : null,
      }
    }
    const navigationHtml = await response.text()
    result.navigation = { status: response.status(), url: response.url(), finalUrl: browser.page.url(), buildId: extractColdEntryBuildId(navigationHtml), sha256: createHash('sha256').update(navigationHtml).digest('hex') }
    for (let index = 0; index < 3 && Number.isFinite(result.capture?.readyAt); index += 1) {
      throwIfInterrupted()
      if (index) await new Promise((resolve) => setTimeout(resolve, 300))
      result.sceneProof.push(await compactSceneProof(browser.page))
    }
  } catch (error) {
    result.failure ??= { message: error.message, stack: error.stack }
    if (browser) result.capture ??= await stopObserver()
  } finally {
    capturing = false
    clearTimeout(hardTimer)
    clearInterval(progressTimer)
    if (profileStarted) await browser?.cdp.send('Profiler.stop').catch(() => {})
    if (performanceMetricsEnabled) await browser?.cdp.send('Performance.disable').catch(() => {})
    if (browser) {
      try { await browser.context.close(); result.cleanup.browserClosed = true }
      catch (error) { result.cleanup.error = error.message }
    }
    if (profileDir) {
      try {
        if (browser && !result.cleanup.browserClosed) throw new Error('Profile retained because owned browser closure was not confirmed')
        const resolved = path.resolve(profileDir)
        if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('landrush-cold-entry-') || (await realpath(resolved)).toLowerCase() !== resolved.toLowerCase()) throw new Error('Unsafe temporary profile cleanup target')
        await rm(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 })
        result.cleanup.profileRemoved = true
      } catch (error) { result.cleanup.error = error.message }
    }
    await server?.stop()
    result.source.after = sourceState()
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
  }
  const capture = result.capture
  const gameFpsSamples = capture?.fpsSamples ?? []
  result.gameFrameCounter = { available: gameFpsSamples.some((row) => Number.isFinite(row.fps)), samples: gameFpsSamples.length, unavailableSamples: gameFpsSamples.filter((row) => !Number.isFinite(row.fps)).length, source: 'MultiplayerStatusPanel.renderedFpsRef', selector: GAME_FPS_SELECTOR, measurement: 'Existing Landrush R3F useFrame callback count over approximately 1-second windows, copied into the mounted status panel every 250ms. Not successful draws or physical presentation FPS.', observerSampleHz: 2, unavailableLabel: '--fps', enabledByHarness: false }
  const gate = (name, pass, detail) => result.gates.push({ name, pass, detail })
  gate('No capture failure', !result.failure, result.failure?.message ?? null)
  if (options.sourceKind === 'worktree') gate('Expected local worktree base HEAD retained', result.source.before.head === options.expectedSource && result.source.after?.head === options.expectedSource, result.source)
  gate('Exact served build ID and route', result.navigation?.buildId === options.expectedBuildId && result.navigation?.status === 200 && result.navigation?.finalUrl === options.url, result.navigation ?? null)
  gate('Loader hide and game readiness witnessed', Number.isFinite(capture?.hiddenAt) && Number.isFinite(capture?.readyAt), { hiddenAt: capture?.hiddenAt, readyAt: capture?.readyAt })
  gate('Page stayed visible and focused', !!capture && capture.visibility.every((row) => row.value === 'visible') && capture.focus.every((row) => row.focused) && capture.samples.every((row) => row.visibility === 'visible' && row.focused), null)
  gate('No page/resource/render errors', result.pageErrors.length === 0 && result.resourceFailures.length === 0 && result.console.every((row) => row.type !== 'error') && (capture?.errors.length ?? 1) === 0 && capture?.final.renderError === false, { page: result.pageErrors.length, resource: result.resourceFailures.length, console: result.console.filter((row) => row.type === 'error').length })
  gate('Observer buffers lossless', !!capture && capture.overflow.length === 0, capture?.overflow ?? null)
  const sceneSignatures = result.sceneProof.map((row) => JSON.stringify([row.worldId, row.buildCount, row.savedNodeCount, row.nodeCount, row.levelCount, row.parcels]))
  gate('Stable populated online scene after timing', result.sceneProof.length === 3 && sceneSignatures.every((value) => value === sceneSignatures[0]) && result.sceneProof.every((row) => row.source === 'multiplayer' && row.buildCount > 0 && row.savedNodeCount > 0 && row.levelCount > 0 && row.nodeCount >= row.savedNodeCount), result.sceneProof)
  gate('Requested playing duration completed', capture?.outcome === 'complete' && capture?.terminalAt === null, { outcome: capture?.outcome, terminalAt: capture?.terminalAt })
  if (options.scenario === 'night-entry') gate('First night used the real Start zombie control', result.realStartButtonClicked === true && Number.isFinite(capture?.clickedAt) && Number.isFinite(capture?.nightReadyAt) && result.beforeClick?.phase === 'build', { clickedAt: capture?.clickedAt, nightReadyAt: capture?.nightReadyAt })
  if (options.cpuProfile) {
    gate('Requested CPU profile retained', result.cpuProfile?.written === true, result.cpuProfile ?? null)
    gate('CPU profile monotonic clock anchors retained', result.cpuProfile?.timing?.available === true, result.cpuProfile?.timing ?? null)
  }
  gate('Owned browser/profile cleaned up', result.cleanup.browserClosed && result.cleanup.profileRemoved, result.cleanup)
  const phases = []
  if (capture?.frames.length) {
    const add = (name, start, end) => { if (Number.isFinite(start) && Number.isFinite(end) && end > start) phases.push({ name, ...summarizeColdEntryFrames(capture.frames, start, end) }) }
    add('cold-navigation-to-hide', 0, capture.hiddenAt)
    if (Number.isFinite(capture.hiddenAt)) {
      for (const [from, to] of [[0, 5], [5, 10], [10, 20], [20, 30]]) add(`post-hide-${from}-${to}s`, capture.hiddenAt + from * 1000, Math.min(capture.hiddenAt + to * 1000, capture.endAt))
    }
    add('trusted-click-to-night-ready', capture.clickedAt, capture.nightReadyAt)
    if (Number.isFinite(capture.nightReadyAt)) {
      const playingEnd = Math.min(capture.terminalAt ?? capture.endAt, capture.endAt)
      for (const [from, to] of [[0, 5], [5, 10], [10, 20], [20, 30]]) add(`night-playing-${from}-${to}s`, capture.nightReadyAt + from * 1000, Math.min(capture.nightReadyAt + to * 1000, playingEnd))
      add('night-playing-only', capture.nightReadyAt, playingEnd)
    }
  }
  for (const phase of phases) {
    const rows = gameFpsSamples.filter((row) => row.now >= phase.start && row.now <= phase.end)
    const values = rows.filter((row) => Number.isFinite(row.fps)).map((row) => row.fps)
    phase.gameFrameFps = { samples: rows.length, availableSamples: values.length, unavailableSamples: rows.length - values.length, meanSampleFps: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, minSampleFps: values.length ? Math.min(...values) : null, maxSampleFps: values.length ? Math.max(...values) : null }
  }
  result.phases = phases
  result.valid = result.gates.every((entry) => entry.pass)
  result.limitations = ['Neither rAF cadence nor the existing R3F callback FPS label proves physical presented FPS or GPU ownership.', 'Game-frame FPS samples retain the existing approximately 1-second rolling window and up to 250ms DOM-copy delay; phase-boundary samples can contain preceding-phase work.', 'Night-playing windows end at the first terminal state observed by the existing 2Hz DOM sampler, not an exact death event timestamp.', 'Scene counts are sampled after timing; this does not independently prove canonical snapshot equality throughout the measured window.', 'No whole-frame CPU/GPU attribution is claimed by observer-light runs.', 'No synthetic movement, invulnerability, fixture override, or automatic restart keeps the player alive.']
  const serialized = JSON.stringify(result)
  if (Buffer.byteLength(serialized) > MAX_CAPTURE_BYTES) throw new Error(`Capture exceeds the 8MiB artifact cap: ${Buffer.byteLength(serialized)} bytes`)
  await writeFile(path.join(runDir, 'capture.json'), serialized, { flag: 'wx' })
  const { capture: _capture, ...summary } = result
  await writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
  process.stdout.write(JSON.stringify({ runDir, valid: result.valid, outcome: capture?.outcome, phases, failedGates: result.gates.filter((entry) => !entry.pass) }, null, 2) + '\n')
  return result.interruption ? (result.interruption.signal === 'SIGINT' ? 130 : 143) : result.valid ? 0 : 2
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseColdEntryArgs(process.argv.slice(2))
    if (options.help) process.stdout.write('node tooling/bench/src/landrush-cold-entry.mjs --expected-source <40-char-sha> --expected-build-id <id> [--source-kind published|worktree] [--base-url <origin>] [--scenario startup|night-entry] [--duration 30..300] [--post-hide 30..40] [--cpu-profile] [--no-spawn] [--output-dir <new-dir>] [--server-mode production|development] [--ws <local-authority-ws>]\n')
    else process.exitCode = await runColdEntry(options)
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 2
  }
}
