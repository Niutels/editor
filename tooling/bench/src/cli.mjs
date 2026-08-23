#!/usr/bin/env node
// Pascal bench harness CLI. Runs under node (not bun).
//
//   node tooling/bench/src/cli.mjs run --scenario orbit-sweep --minutes 2 [--seed 42]
//        [--page pascal-multiplayer-island] [--headless] [--no-cpuprofile]
//        [--warmup 20] [--fps-cap 60] [--display-hz 60] [--width 1920 --height 1080]
//        [--watchdog|--no-watchdog] [--no-spawn] [--checkpoints]
//   node tooling/bench/src/cli.mjs report <runDir>          re-evaluate budgets
//   node tooling/bench/src/cli.mjs replay <runDir> [...]    (phase 5)
//   node tooling/bench/src/cli.mjs verify <runDir> [...]    (phase 4)
//
// Every run records a replayable trace + full artifacts under tooling/bench/runs/.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createRunDir,
  gitInfo,
  JsonlWriter,
  REPO_ROOT,
  RUNS_ROOT,
  writeCheckpoint,
  writeRunJson,
} from './artifacts.mjs'
import { BridgeClient, sleep } from './bridge-client.mjs'
import { launchBenchBrowser } from './chrome.mjs'
import { attachPageCapture, BeaconWatchdog, DEFAULT_BEACON_WATCHDOG_POLL_MS } from './detectors.mjs'
import {
  createEventContinuityTracker,
  createFrameContinuityTracker,
  recordEventDrain,
  recordFrameDrain,
  summarizeEventContinuity,
  summarizeFrameContinuity,
} from './frame-continuity.mjs'
import { InputDriver } from './input.mjs'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
  summarizeLandrushBenchmarkFixture,
} from './landrush-fixture.mjs'
import { buildReport } from './report.mjs'
import { BASE_URL, ensureServer, readServerMode } from './server.mjs'

function parseArgs(argv) {
  const [, , verb, ...rest] = argv
  const args = { verb, positional: [] }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg.startsWith('--')) {
      args.positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}

async function loadScenario(name) {
  const file = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'scenario',
    'scenarios',
    `${name}.mjs`,
  )
  try {
    const mod = await import(pathToFileURL(file).href)
    return mod.default
  } catch (err) {
    throw new Error(`unknown scenario "${name}" (${err.message})`)
  }
}

// mulberry32 — the same PRNG family the landrush world gen uses.
export function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function resolveScenarioLifecycle(scenario, args = {}) {
  const metadata = scenario.lifecycle ?? {}
  const warmupSeconds = Number(args.warmup ?? metadata.warmupSeconds ?? 20)
  if (!Number.isFinite(warmupSeconds) || warmupSeconds < 0) {
    throw new Error(`invalid warmup duration: ${String(args.warmup ?? metadata.warmupSeconds)}`)
  }
  return {
    warmupSeconds,
    prepareAfterWarmup: metadata.prepareAfterWarmup ?? true,
    captureInitialCheckpoint: metadata.captureInitialCheckpoint ?? true,
    settleBeforeMeasurement: metadata.settleBeforeMeasurement ?? true,
    deferDrain: metadata.deferDrain ?? false,
    watchdog: metadata.watchdog ?? true,
  }
}

function finitePositiveNumber(value, fallback, label) {
  const resolved = Number(value ?? fallback)
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`invalid ${label}: ${String(value)}`)
  }
  return resolved
}

function positiveInteger(value, fallback, label) {
  const resolved = finitePositiveNumber(value, fallback, label)
  if (!Number.isInteger(resolved)) throw new Error(`invalid ${label}: ${String(value)}`)
  return resolved
}

function resolveWatchdogPolicy(scenarioLifecycle, args) {
  if (args.watchdog && args['no-watchdog']) {
    throw new Error('choose either --watchdog or --no-watchdog')
  }
  if (args.watchdog) return { enabled: true, source: 'cli-enable' }
  if (args['no-watchdog']) return { enabled: false, source: 'cli-disable' }
  return { enabled: scenarioLifecycle.watchdog, source: 'scenario-lifecycle' }
}

function serializeError(error) {
  if (!error) return null
  return {
    message: error?.message ?? String(error),
    name: error?.name ?? 'Error',
    stack: error?.stack ?? null,
  }
}

export async function runScenario(args) {
  const scenarioName = args.scenario ?? 'orbit-sweep'
  const seed = Number(args.seed ?? 42)
  if (!Number.isFinite(seed)) throw new Error(`invalid seed: ${String(args.seed)}`)
  const minutes = finitePositiveNumber(args.minutes, 2, 'measurement duration')
  const page = args.page ?? 'pascal-multiplayer-island'
  const headless = Boolean(args.headless)
  const fpsCap = finitePositiveNumber(args['fps-cap'], 60, 'FPS cap')
  const displayHz = finitePositiveNumber(args['display-hz'], 60, 'display refresh rate')
  const width = positiveInteger(args.width, 1600, 'viewport width')
  const height = positiveInteger(args.height, 1000, 'viewport height')
  const cpuProfile = !args['no-cpuprofile']
  const frameProfile = !args['no-frame-profile']
  const gpuProfile = !args['no-gpu-profile']
  const periodicCheckpoints = Boolean(args.checkpoints)
  const bridgeFrame = Boolean(args['bridge-frame'])
  const serverMode = args['server-mode'] ?? 'dev'

  const scenario = await loadScenario(scenarioName)
  const scenarioLifecycle = resolveScenarioLifecycle(scenario, args)
  const { warmupSeconds } = scenarioLifecycle
  const watchdogPolicy = resolveWatchdogPolicy(scenarioLifecycle, args)
  if (scenarioLifecycle.deferDrain && periodicCheckpoints) {
    throw new Error('periodic checkpoints require measurement-time draining')
  }
  const { runId, runDir } = createRunDir(scenarioName, seed)
  const startedAt = new Date().toISOString()
  const log = (msg) => process.stderr.write(`[bench:${runId}] ${msg}\n`)

  log(
    `starting — scenario=${scenarioName} seed=${seed} minutes=${minutes} ` +
      `displayHz=${displayHz} viewport=${width}x${height} headless=${headless}`,
  )
  const server = await ensureServer({
    repoRoot: REPO_ROOT,
    runDir,
    spawnIfMissing: !args['no-spawn'],
  })
  log(server.reused ? `reusing running ${serverMode} server` : 'spawned dev server')
  const actualServerMode = await readServerMode()
  if (actualServerMode !== serverMode) {
    throw new Error(
      `server mode mismatch: requested ${serverMode}, received ${actualServerMode ?? 'unknown'}`,
    )
  }

  const framesOut = new JsonlWriter(path.join(runDir, 'frames.jsonl'))
  const eventsOut = new JsonlWriter(path.join(runDir, 'events.jsonl'))
  const traceOut = new JsonlWriter(path.join(runDir, 'trace.jsonl'))

  const browser = await launchBenchBrowser({ headless, width, height })
  let watchdog = null
  let input = null
  let pageCapture = null
  let bridge = null
  let landrushFixture = null
  let url = null
  let info = null
  let preMeasurementEvents = null
  let measureFromFrame = null
  let measureToFrame = null
  let measurementStartDriverT = null
  let measurementEndDriverT = null
  let frameContinuityTracker = null
  let eventContinuityTracker = null
  const scenarioEvidence = {}
  let pumpLoop = null
  let pumping = false
  let cpuProfilerStarted = false
  let writersClosed = false
  let exitCode = 0
  const closeWriters = async () => {
    if (writersClosed) return
    writersClosed = true
    await Promise.all([framesOut.close(), eventsOut.close(), traceOut.close()])
  }
  const stopCpuProfiler = async () => {
    if (!cpuProfilerStarted) return
    const { profile } = await browser.cdp.send('Profiler.stop')
    cpuProfilerStarted = false
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path.join(runDir, 'profile.cpuprofile'), JSON.stringify(profile))
  }
  const finalizeAbortedRun = async (error) => {
    const finalizationIssues = []
    pumping = false
    if (pumpLoop) {
      try {
        await pumpLoop
      } catch (pumpError) {
        finalizationIssues.push(`pump shutdown: ${pumpError?.message ?? String(pumpError)}`)
      }
      pumpLoop = null
    }
    if (watchdog) {
      try {
        await watchdog.stop()
      } catch (watchdogError) {
        finalizationIssues.push(
          `watchdog shutdown: ${watchdogError?.message ?? String(watchdogError)}`,
        )
      }
      watchdog = null
    }
    try {
      await stopCpuProfiler()
    } catch (profileError) {
      finalizationIssues.push(
        `CPU profiler shutdown: ${profileError?.message ?? String(profileError)}`,
      )
    }
    if (input) {
      try {
        const cleanup = await input.releaseAll({ intent: 'benchmark aborted-run cleanup' })
        if (cleanup.errors.length > 0) {
          finalizationIssues.push(`input cleanup: ${JSON.stringify(cleanup.errors)}`)
        }
      } catch (inputError) {
        finalizationIssues.push(`input cleanup: ${inputError?.message ?? String(inputError)}`)
      }
      input = null
    }

    frameContinuityTracker ??= createFrameContinuityTracker(measureFromFrame ?? 0)
    eventContinuityTracker ??= createEventContinuityTracker(bridge?.eventCursor ?? 0)
    if (bridge) {
      try {
        const frameDrain = await bridge.pumpFrames()
        recordFrameDrain(frameContinuityTracker, frameDrain)
        framesOut.writeAll(frameDrain.frames)
      } catch (frameError) {
        finalizationIssues.push(`final frame drain: ${frameError?.message ?? String(frameError)}`)
      }
      try {
        const eventDrain = await bridge.pumpEventBatch()
        recordEventDrain(eventContinuityTracker, eventDrain)
        eventsOut.writeAll(eventDrain.events)
      } catch (eventError) {
        finalizationIssues.push(`final event drain: ${eventError?.message ?? String(eventError)}`)
      }
      try {
        info = await bridge.info()
      } catch (infoError) {
        finalizationIssues.push(`final bridge info: ${infoError?.message ?? String(infoError)}`)
      }
    }

    const frameContinuity = summarizeFrameContinuity(frameContinuityTracker)
    const eventContinuity = summarizeEventContinuity(eventContinuityTracker)
    eventsOut.write({
      data: frameContinuity,
      t: performance.now(),
      type: 'bench:frame-continuity',
    })
    eventsOut.write({
      data: eventContinuity,
      t: performance.now(),
      type: 'bench:event-continuity',
    })

    try {
      await browser.page.screenshot({ path: path.join(runDir, 'screenshots', 'final.png') })
    } catch (screenshotError) {
      finalizationIssues.push(
        `final screenshot: ${screenshotError?.message ?? String(screenshotError)}`,
      )
    }

    const actualViewport = {
      dpr: Number.isFinite(info?.dpr) ? info.dpr : null,
      height: Number.isFinite(info?.viewport?.h) ? info.viewport.h : null,
      width: Number.isFinite(info?.viewport?.w) ? info.viewport.w : null,
    }
    const requestedViewport = { height, width }
    const viewportMatchesRequest =
      actualViewport.width === requestedViewport.width &&
      actualViewport.height === requestedViewport.height
    if (!viewportMatchesRequest) {
      finalizationIssues.push(
        `viewport mismatch: requested ${width}x${height}, received ` +
          `${String(actualViewport.width)}x${String(actualViewport.height)}`,
      )
    }

    const scenarioValidity = {
      error: serializeError(error),
      issues: [
        `scenario lifecycle: ${error?.message ?? String(error)}`,
        ...finalizationIssues,
        ...frameContinuity.issues.map((issue) => `frame continuity: ${issue}`),
        ...eventContinuity.issues.map((issue) => `event continuity: ${issue}`),
      ],
      pass: false,
    }
    traceOut.write({
      kind: 'validation',
      name: 'scenario-validity',
      scenarioValidity,
      t: performance.now(),
    })
    pageCapture?.dispose?.()
    await closeWriters()

    const measurementStarted = Number.isInteger(measureFromFrame)
    const watchdogMeasured = measurementStarted && watchdogPolicy.enabled
    const meta = {
      runId,
      scenario: scenarioName,
      seed,
      minutes,
      page,
      url,
      mode: serverMode,
      headless,
      git: gitInfo(),
      serverReused: server.reused,
      chrome: { executablePath: browser.executablePath },
      adapter: info?.adapter ?? null,
      viewport: info?.viewport ?? null,
      dpr: info?.dpr ?? null,
      actualViewport,
      requestedViewport,
      viewportMatchesRequest,
      fpsCap,
      displayHz,
      warmupSeconds,
      scenarioLifecycle,
      watchdog: {
        configuredEnabled: watchdogPolicy.enabled,
        enabled: watchdogMeasured,
        pollMs: watchdogMeasured ? DEFAULT_BEACON_WATCHDOG_POLL_MS : null,
        source: measurementStarted ? watchdogPolicy.source : 'measurement-not-started',
      },
      taskStarvationMeasured: watchdogMeasured,
      inputModalities: scenario.inputModalities ?? null,
      cpuProfile,
      frameProfile,
      fixture: summarizeLandrushBenchmarkFixture(landrushFixture),
      gpuProfile,
      periodicCheckpoints,
      bridgeFrame,
      frameContinuity,
      eventContinuity,
      measureFromFrame,
      measureToFrame,
      measurementWindow: {
        endDriverT: measurementEndDriverT,
        endFrameIdx: measureToFrame,
        eventDroppedByRing: eventContinuity.droppedByRing,
        eventEndCursor: eventContinuity.endCursor,
        eventEndMarkSeq: eventContinuity.endMarkSeq,
        eventStartCursor: eventContinuity.startCursor,
        eventStartMarkSeq: eventContinuity.startMarkSeq,
        startDriverT: measurementStartDriverT,
        startFrameIdx: measureFromFrame,
      },
      preMeasurementEvents,
      pageCapture,
      scenarioValidity,
      scenarioEvidence,
      startedAt,
    }
    const report = buildReport({
      runDir,
      fpsCap,
      measureFromFrame: measureFromFrame ?? 0,
      meta,
    })
    writeRunJson(runDir, {
      ...meta,
      reportVerdict: report.verdict,
      verdict: 'FAIL',
      pass: false,
      gates: report.gates,
    })
    log(`report: ${path.join(runDir, 'report.md')}`)
    log('verdict: FAIL')
    for (const issue of scenarioValidity.issues) log(`  INVALID scenario — ${issue}`)
  }
  try {
    pageCapture = attachPageCapture(browser.page, eventsOut)

    await browser.cdp.send('Network.enable')
    await browser.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    for (const origin of [BASE_URL, BASE_URL.replace('localhost', '127.0.0.1')]) {
      await browser.cdp.send('Storage.clearDataForOrigin', {
        origin,
        storageTypes: 'local_storage,indexeddb,cache_storage,service_workers',
      })
    }

    landrushFixture = scenario.fixture
      ? await loadLandrushBenchmarkFixture({
          name: scenario.fixture,
          repoRoot: REPO_ROOT,
        })
      : null
    if (landrushFixture) {
      await installLandrushBenchmarkFixture(browser.page, landrushFixture)
      log(
        `installed ${landrushFixture.name} fixture ` +
          `(${landrushFixture.report.save.builds.length} builds)`,
      )
    }

    const scenarioParams = scenario.urlParams?.({ seed }) ?? ''
    url = `${BASE_URL}/landrush-lab/${page}?offline=1&bench=1${frameProfile ? '&frameProfile=1' : ''}${gpuProfile ? '' : '&benchNoGpu=1'}${scenarioParams ? `&${scenarioParams}` : ''}`
    log(`opening ${url}`)
    await browser.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })

    const bridgeTarget = bridgeFrame ? await waitForBenchFrame(browser.page) : browser.page
    bridge = new BridgeClient(bridgeTarget)
    const up = await bridge.waitForBridge({ requireProfiler: frameProfile })
    log(`bridge up at frame ${up.beacon.frameIdx}`)

    const rng = createRng(seed)
    input = new InputDriver({ cdp: browser.cdp, trace: traceOut, rng })

    if (scenario.prepare) {
      log('waiting for scenario state')
      await scenario.prepare({ bridge, input, page: bridgeTarget, sleep, trace: traceOut })
      const ready = (await bridge.beacon()).beacon
      log(
        `scenario state ready at frame ${ready?.frameIdx ?? 'unknown'} ` +
          `(nodes=${ready?.nodeCount ?? 'unknown'}, mode=${ready?.mode ?? 'unknown'}, tool=${ready?.tool ?? 'none'})`,
      )
    }

    // Warmup: shader/pipeline compiles and dev-mode first-compile jank stay
    // out of the measurement window.
    if (warmupSeconds > 0) await sleep(warmupSeconds * 1000)
    if (scenario.prepare && scenarioLifecycle.prepareAfterWarmup) {
      await scenario.prepare({ bridge, input, page: bridgeTarget, sleep, trace: traceOut })
    }
    // Capture replay state before the timed window. Serializing the complete
    // scene during measurement can itself create the hitch under test.
    let checkpointCounter = 0
    if (scenarioLifecycle.captureInitialCheckpoint) {
      const initialCheckpoint = await bridge.getCheckpoint()
      if (initialCheckpoint) {
        checkpointCounter += 1
        writeCheckpoint(runDir, `${checkpointCounter}`.padStart(3, '0'), {
          frameIdx: (await bridge.beacon()).beacon.frameIdx,
          checkpoint: initialCheckpoint,
        })
      }
      // Checkpoint serialization can leave one delayed rAF behind it. Keep that
      // recovery frame outside the timed window so the harness cannot report its
      // own replay capture as an application freeze.
      await sleep(1000)
    }
    if (scenarioLifecycle.settleBeforeMeasurement) {
      await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 10_000 })
    }
    preMeasurementEvents = await bridge.discardEvents()
    if (cpuProfile) {
      await browser.cdp.send('Profiler.enable')
      await browser.cdp.send('Profiler.setSamplingInterval', {
        interval: 1000,
      })
      await browser.cdp.send('Profiler.start')
      cpuProfilerStarted = true
    }
    measurementStartDriverT = performance.now()
    measureFromFrame = await bridge.mark('measure-start')
    if (!Number.isInteger(measureFromFrame)) {
      throw new Error('bench bridge could not assign the measurement start frame')
    }
    bridge.primeFrameCursor(measureFromFrame)
    traceOut.write({
      edge: 'start',
      frameIdx: measureFromFrame,
      kind: 'measurement-boundary',
      t: measurementStartDriverT,
    })
    frameContinuityTracker = createFrameContinuityTracker(measureFromFrame)
    eventContinuityTracker = createEventContinuityTracker(preMeasurementEvents.cursor)
    log(`warmup done — measuring from frame ${measureFromFrame}`)

    if (watchdogPolicy.enabled) {
      watchdog = new BeaconWatchdog({
        page: bridgeTarget,
        screenshotPage: browser.page,
        events: eventsOut,
        runDir,
        onAnomaly: (freeze) =>
          log(`FREEZE detected: stall ${freeze.stallMs}ms at frame ${freeze.frameIdx}`),
      }).start()
    }

    // Background pumps: frames/events → JSONL every 2s. Periodic checkpoints
    // are opt-in because full-scene serialization perturbs frame timing.
    pumping = !scenarioLifecycle.deferDrain
    pumpLoop = scenarioLifecycle.deferDrain
      ? null
      : (async () => {
          let sinceCheckpoint = 0
          while (pumping) {
            await sleep(2000)
            if (!pumping) break
            try {
              const drain = await bridge.pumpFrames()
              const { frames, droppedByRing } = drain
              recordFrameDrain(frameContinuityTracker, drain)
              framesOut.writeAll(frames)
              if (droppedByRing > 0) {
                eventsOut.write({
                  t: performance.now(),
                  type: 'pump-gap',
                  data: { droppedByRing },
                })
              }
              const eventDrain = await bridge.pumpEventBatch()
              recordEventDrain(eventContinuityTracker, eventDrain)
              eventsOut.writeAll(eventDrain.events)
              if (periodicCheckpoints) sinceCheckpoint += 2
              if (periodicCheckpoints && sinceCheckpoint >= 10) {
                sinceCheckpoint = 0
                const checkpoint = await bridge.getCheckpoint()
                if (checkpoint) {
                  checkpointCounter += 1
                  writeCheckpoint(runDir, `${checkpointCounter}`.padStart(3, '0'), {
                    frameIdx: (await bridge.beacon()).beacon.frameIdx,
                    checkpoint,
                  })
                }
              }
            } catch {
              /* final continuity validation rejects any resulting record loss */
            }
          }
        })()

    const context = {
      page: bridgeTarget,
      cdp: browser.cdp,
      bridge,
      input,
      rng,
      minutes,
      displayHz,
      runDir,
      log,
      sleep,
      mark: async (label) => {
        const frameIdx = await bridge.mark(label)
        traceOut.write({ t: performance.now(), frameIdx, kind: 'mark', label })
        return frameIdx
      },
      recordEvidence: (name, evidence) => {
        scenarioEvidence[name] = evidence
      },
      trace: traceOut,
      events: eventsOut,
    }

    let scenarioError = null
    try {
      await scenario.execute(context)
    } catch (error) {
      scenarioError = error
    }

    const finalizationIssues = []
    measurementEndDriverT = performance.now()
    try {
      measureToFrame = await bridge.mark('measure-end')
      if (!Number.isInteger(measureToFrame)) {
        throw new Error('bench bridge could not assign the measurement end frame')
      }
      traceOut.write({
        edge: 'end',
        frameIdx: measureToFrame,
        kind: 'measurement-boundary',
        t: measurementEndDriverT,
      })
    } catch (error) {
      finalizationIssues.push(`measurement end boundary: ${error?.message ?? String(error)}`)
    }

    if (Number.isInteger(measureToFrame)) {
      try {
        await bridge.waitForFrame(measureToFrame)
      } catch (error) {
        finalizationIssues.push(`measurement end frame: ${error?.message ?? String(error)}`)
      }
    }

    if (watchdog) {
      try {
        await watchdog.stop()
      } catch (error) {
        finalizationIssues.push(`watchdog shutdown: ${error?.message ?? String(error)}`)
      }
      watchdog = null
    }
    try {
      await stopCpuProfiler()
    } catch (error) {
      finalizationIssues.push(`CPU profiler shutdown: ${error?.message ?? String(error)}`)
    }

    pumping = false
    if (pumpLoop) await pumpLoop
    pumpLoop = null

    try {
      const finalDrain = await bridge.pumpFrames()
      recordFrameDrain(frameContinuityTracker, finalDrain)
      framesOut.writeAll(finalDrain.frames)
    } catch (error) {
      finalizationIssues.push(`final frame drain: ${error?.message ?? String(error)}`)
    }
    try {
      const finalEventDrain = await bridge.pumpEventBatch()
      recordEventDrain(eventContinuityTracker, finalEventDrain)
      eventsOut.writeAll(finalEventDrain.events)
    } catch (error) {
      finalizationIssues.push(`final event drain: ${error?.message ?? String(error)}`)
    }
    const frameContinuity = summarizeFrameContinuity(frameContinuityTracker)
    const eventContinuity = summarizeEventContinuity(eventContinuityTracker)
    if (Number.isInteger(measureToFrame) && frameContinuity.endMarkFrameIdx !== measureToFrame) {
      finalizationIssues.push(
        `measurement end frame mismatch: marked ${String(measureToFrame)}, ` +
          `captured ${String(frameContinuity.endMarkFrameIdx)}`,
      )
    }
    eventsOut.write({
      data: frameContinuity,
      t: performance.now(),
      type: 'bench:frame-continuity',
    })
    eventsOut.write({
      data: eventContinuity,
      t: performance.now(),
      type: 'bench:event-continuity',
    })

    try {
      const cleanup = await input.releaseAll({
        intent: 'benchmark post-measurement cleanup',
      })
      if (cleanup.errors.length > 0) {
        finalizationIssues.push(`input cleanup: ${JSON.stringify(cleanup.errors)}`)
        const retry = await input.releaseAll({
          intent: 'benchmark input cleanup retry',
        })
        if (retry.errors.length > 0) {
          finalizationIssues.push(`input cleanup retry: ${JSON.stringify(retry.errors)}`)
        }
      }
    } catch (error) {
      finalizationIssues.push(`input cleanup: ${error?.message ?? String(error)}`)
    }
    input = null
    await sleep(400)

    try {
      info = await bridge.info()
    } catch (error) {
      finalizationIssues.push(`final bridge info: ${error?.message ?? String(error)}`)
    }
    try {
      await browser.page.screenshot({
        path: path.join(runDir, 'screenshots', 'final.png'),
      })
    } catch {
      /* timing evidence remains complete when only the presentation artifact fails */
    }

    const actualViewport = {
      dpr: Number.isFinite(info?.dpr) ? info.dpr : null,
      height: Number.isFinite(info?.viewport?.h) ? info.viewport.h : null,
      width: Number.isFinite(info?.viewport?.w) ? info.viewport.w : null,
    }
    const requestedViewport = { height, width }
    const viewportMatchesRequest =
      actualViewport.width === requestedViewport.width &&
      actualViewport.height === requestedViewport.height
    if (!viewportMatchesRequest) {
      finalizationIssues.push(
        `viewport mismatch: requested ${width}x${height}, received ` +
          `${String(actualViewport.width)}x${String(actualViewport.height)}`,
      )
    }

    const validityIssues = [
      ...(scenarioError ? [`scenario: ${scenarioError?.message ?? String(scenarioError)}`] : []),
      ...finalizationIssues,
      ...frameContinuity.issues.map((issue) => `frame continuity: ${issue}`),
      ...eventContinuity.issues.map((issue) => `event continuity: ${issue}`),
    ]
    const scenarioValidity = {
      error: serializeError(scenarioError),
      issues: validityIssues,
      pass: validityIssues.length === 0,
    }
    traceOut.write({
      kind: 'validation',
      name: 'scenario-validity',
      scenarioValidity,
      t: performance.now(),
    })
    pageCapture.dispose?.()
    await closeWriters()

    const meta = {
      runId,
      scenario: scenarioName,
      seed,
      minutes,
      page,
      url,
      mode: serverMode,
      headless,
      git: gitInfo(),
      serverReused: server.reused,
      chrome: { executablePath: browser.executablePath },
      adapter: info?.adapter ?? null,
      viewport: info?.viewport ?? null,
      dpr: info?.dpr ?? null,
      actualViewport,
      requestedViewport,
      viewportMatchesRequest,
      fpsCap,
      displayHz,
      warmupSeconds,
      scenarioLifecycle,
      watchdog: {
        enabled: watchdogPolicy.enabled,
        pollMs: watchdogPolicy.enabled ? DEFAULT_BEACON_WATCHDOG_POLL_MS : null,
        source: watchdogPolicy.source,
      },
      taskStarvationMeasured: watchdogPolicy.enabled,
      inputModalities: scenario.inputModalities ?? null,
      cpuProfile,
      frameProfile,
      fixture: summarizeLandrushBenchmarkFixture(landrushFixture),
      gpuProfile,
      periodicCheckpoints,
      bridgeFrame,
      frameContinuity,
      eventContinuity,
      measureFromFrame,
      measureToFrame,
      measurementWindow: {
        endDriverT: measurementEndDriverT,
        endFrameIdx: measureToFrame,
        eventDroppedByRing: eventContinuity.droppedByRing,
        eventEndCursor: eventContinuity.endCursor,
        eventEndMarkSeq: eventContinuity.endMarkSeq,
        eventStartCursor: eventContinuity.startCursor,
        eventStartMarkSeq: eventContinuity.startMarkSeq,
        startDriverT: measurementStartDriverT,
        startFrameIdx: measureFromFrame,
      },
      preMeasurementEvents,
      pageCapture,
      scenarioValidity,
      scenarioEvidence,
      startedAt,
    }
    const report = buildReport({ runDir, fpsCap, measureFromFrame, meta })
    const verdict = scenarioValidity.pass ? report.verdict : 'FAIL'
    const pass = scenarioValidity.pass ? report.pass : false
    writeRunJson(runDir, {
      ...meta,
      reportVerdict: report.verdict,
      verdict,
      pass,
      gates: report.gates,
    })

    log(`report: ${path.join(runDir, 'report.md')}`)
    log(`verdict: ${verdict}`)
    if (!scenarioValidity.pass) {
      for (const issue of scenarioValidity.issues) log(`  INVALID scenario — ${issue}`)
    }
    for (const gate of report.gates) {
      const status = gate.status ?? (gate.pass ? 'pass' : 'fail')
      log(`  ${status.toUpperCase()} ${gate.gate} — ${gate.detail}`)
    }
    console.log(
      JSON.stringify(
        { runId, runDir, verdict, pass, scenarioValidity, gates: report.gates },
        null,
        2,
      ),
    )
    exitCode = scenarioValidity.pass ? (report.verdict === 'PASS' ? 0 : 1) : 2
  } catch (err) {
    exitCode = 2
    log(`ERROR: ${err.stack ?? err}`)
    try {
      await finalizeAbortedRun(err)
    } catch (finalizationError) {
      log(`ERROR finalizing aborted run: ${finalizationError.stack ?? finalizationError}`)
    }
  } finally {
    pumping = false
    try {
      if (pumpLoop) await pumpLoop
    } catch {
      /* the primary failure is already logged */
    }
    try {
      await watchdog?.stop()
    } catch {
      /* browser shutdown below is the final containment boundary */
    }
    try {
      await stopCpuProfiler()
    } catch {
      /* preserve the primary result */
    }
    try {
      await input?.releaseAll({ intent: 'benchmark emergency cleanup' })
    } catch {
      /* browser shutdown releases any remaining synthetic input state */
    }
    pageCapture?.dispose?.()
    try {
      await closeWriters()
    } catch {
      /* preserve the primary result */
    }
    await browser.close()
    await server.stop()
  }
  return exitCode
}

async function waitForBenchFrame(page, timeoutMs = 180_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const frame = page
      .frames()
      .find(
        (candidate) => candidate !== page.mainFrame() && candidate.url().includes('/landrush-lab/'),
      )
    if (frame) return frame
    await sleep(250)
  }
  throw new Error('benchmark iframe did not load')
}

async function reevaluate(args) {
  const runDir = path.resolve(args.positional[0] ?? '')
  const { readFileSync } = await import('node:fs')
  const runJson = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'))
  const report = buildReport({
    runDir,
    fpsCap: runJson.fpsCap ?? 60,
    measureFromFrame: runJson.measureFromFrame ?? 0,
    meta: runJson,
  })
  console.log(
    JSON.stringify({ verdict: report.verdict, pass: report.pass, gates: report.gates }, null, 2),
  )
  return report.verdict === 'PASS' ? 0 : 1
}

const args = parseArgs(process.argv)
let code = 0
try {
  switch (args.verb) {
    case 'run':
      code = await runScenario(args)
      break
    case 'report':
      code = await reevaluate(args)
      break
    default:
      console.error(`usage: cli.mjs <run|report> [options]   (runs root: ${RUNS_ROOT})`)
      code = 2
  }
} catch (error) {
  console.error(error?.stack ?? error)
  code = 2
}
process.exit(code)
