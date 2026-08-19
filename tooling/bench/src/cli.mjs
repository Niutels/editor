#!/usr/bin/env node
// Pascal bench harness CLI. Runs under node (not bun).
//
//   node tooling/bench/src/cli.mjs run --scenario orbit-sweep --minutes 2 [--seed 42]
//        [--page pascal-multiplayer-island] [--headless] [--no-cpuprofile]
//        [--warmup 20] [--fps-cap 50] [--no-spawn] [--checkpoints]
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
import { InputDriver } from './input.mjs'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
  summarizeLandrushBenchmarkFixture,
} from './landrush-fixture.mjs'
import { launchBenchBrowser } from './chrome.mjs'
import { attachPageCapture, BeaconWatchdog } from './detectors.mjs'
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

export async function runScenario(args) {
  const scenarioName = args.scenario ?? 'orbit-sweep'
  const seed = Number(args.seed ?? 42)
  const minutes = Number(args.minutes ?? 2)
  const page = args.page ?? 'pascal-multiplayer-island'
  const headless = Boolean(args.headless)
  const warmupSeconds = Number(args.warmup ?? 20)
  const fpsCap = Number(args['fps-cap'] ?? 50)
  const cpuProfile = !args['no-cpuprofile']
  const frameProfile = !args['no-frame-profile']
  const gpuProfile = !args['no-gpu-profile']
  const periodicCheckpoints = Boolean(args.checkpoints)
  const bridgeFrame = Boolean(args['bridge-frame'])
  const serverMode = args['server-mode'] ?? 'dev'

  const scenario = await loadScenario(scenarioName)
  const { runId, runDir } = createRunDir(scenarioName, seed)
  const log = (msg) => process.stderr.write(`[bench:${runId}] ${msg}\n`)

  log(`starting — scenario=${scenarioName} seed=${seed} minutes=${minutes} headless=${headless}`)
  const server = await ensureServer({ repoRoot: REPO_ROOT, runDir, spawnIfMissing: !args['no-spawn'] })
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

  const browser = await launchBenchBrowser({ headless })
  let watchdog = null
  let exitCode = 0
  try {
    const pageCapture = attachPageCapture(browser.page, eventsOut)

    await browser.cdp.send('Network.enable')
    await browser.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    for (const origin of [BASE_URL, BASE_URL.replace('localhost', '127.0.0.1')]) {
      await browser.cdp.send('Storage.clearDataForOrigin', {
        origin,
        storageTypes: 'local_storage,indexeddb,cache_storage,service_workers',
      })
    }

    const landrushFixture = scenario.fixture
      ? await loadLandrushBenchmarkFixture({ name: scenario.fixture, repoRoot: REPO_ROOT })
      : null
    if (landrushFixture) {
      await installLandrushBenchmarkFixture(browser.page, landrushFixture)
      log(
        `installed ${landrushFixture.name} fixture ` +
          `(${landrushFixture.report.save.builds.length} builds)`,
      )
    }

    if (cpuProfile) {
      await browser.cdp.send('Profiler.enable')
      await browser.cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
      await browser.cdp.send('Profiler.start')
    }

    const scenarioParams = scenario.urlParams?.({ seed }) ?? ''
    const url = `${BASE_URL}/landrush-lab/${page}?offline=1&bench=1${frameProfile ? '&frameProfile=1' : ''}${gpuProfile ? '' : '&benchNoGpu=1'}${scenarioParams ? `&${scenarioParams}` : ''}`
    log(`opening ${url}`)
    await browser.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 })

    const bridgeTarget = bridgeFrame ? await waitForBenchFrame(browser.page) : browser.page
    const bridge = new BridgeClient(bridgeTarget)
    const up = await bridge.waitForBridge({ requireProfiler: frameProfile })
    log(`bridge up at frame ${up.beacon.frameIdx}`)

    if (scenario.prepare) {
      log('waiting for scenario state')
      await scenario.prepare({ bridge, page: bridgeTarget, sleep })
      const ready = (await bridge.beacon()).beacon
      log(
        `scenario state ready at frame ${ready?.frameIdx ?? 'unknown'} ` +
          `(nodes=${ready?.nodeCount ?? 'unknown'}, mode=${ready?.mode ?? 'unknown'}, tool=${ready?.tool ?? 'none'})`,
      )
    }

    // Warmup: shader/pipeline compiles and dev-mode first-compile jank stay
    // out of the measurement window.
    await sleep(warmupSeconds * 1000)
    if (scenario.prepare) {
      await scenario.prepare({ bridge, page: bridgeTarget, sleep })
    }
    // Capture replay state before the timed window. Serializing the complete
    // scene during measurement can itself create the hitch under test.
    let checkpointCounter = 0
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
    await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 10_000 })
    await bridge.mark('measure-start')
    const measureFromFrame = (await bridge.beacon()).beacon.frameIdx
    log(`warmup done — measuring from frame ${measureFromFrame}`)

    watchdog = new BeaconWatchdog({
      page: bridgeTarget,
      screenshotPage: browser.page,
      events: eventsOut,
      runDir,
      onAnomaly: (freeze) => log(`FREEZE detected: stall ${freeze.stallMs}ms at frame ${freeze.frameIdx}`),
    }).start()

    // Background pumps: frames/events → JSONL every 2s. Periodic checkpoints
    // are opt-in because full-scene serialization perturbs frame timing.
    let pumping = true
    const pumpLoop = (async () => {
      let sinceCheckpoint = 0
      while (pumping) {
        await sleep(2000)
        try {
          const { frames, droppedByRing } = await bridge.pumpFrames()
          framesOut.writeAll(frames)
          if (droppedByRing > 0) {
            eventsOut.write({ t: performance.now(), type: 'pump-gap', data: { droppedByRing } })
          }
          eventsOut.writeAll(await bridge.pumpEvents())
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
          /* transient evaluate failure (navigation/freeze) — detectors cover it */
        }
      }
    })()

    const rng = createRng(seed)
    const input = new InputDriver({ cdp: browser.cdp, trace: traceOut, rng })
    const context = {
      page: bridgeTarget,
      cdp: browser.cdp,
      bridge,
      input,
      rng,
      minutes,
      runDir,
      log,
      sleep,
      mark: async (label) => {
        await bridge.mark(label)
        traceOut.write({ t: performance.now(), kind: 'mark', label })
      },
      trace: traceOut,
      events: eventsOut,
    }

    await scenario.execute(context)
    await bridge.mark('measure-end')
    await sleep(400)

    pumping = false
    await pumpLoop
    watchdog.stop()

    // Final drain + artifacts.
    const { frames } = await bridge.pumpFrames()
    framesOut.writeAll(frames)
    eventsOut.writeAll(await bridge.pumpEvents())
    const info = await bridge.info()
    try {
      await browser.page.screenshot({ path: path.join(runDir, 'screenshots', 'final.png') })
    } catch {
      /* non-fatal */
    }

    if (cpuProfile) {
      const { profile } = await browser.cdp.send('Profiler.stop')
      const { writeFileSync } = await import('node:fs')
      writeFileSync(path.join(runDir, 'profile.cpuprofile'), JSON.stringify(profile))
    }

    await framesOut.close()
    await eventsOut.close()
    await traceOut.close()

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
      fpsCap,
      warmupSeconds,
      frameProfile,
      fixture: summarizeLandrushBenchmarkFixture(landrushFixture),
      gpuProfile,
      periodicCheckpoints,
      bridgeFrame,
      measureFromFrame,
      pageCapture,
      startedAt: new Date().toISOString(),
    }
    const report = buildReport({ runDir, fpsCap, measureFromFrame, meta })
    writeRunJson(runDir, { ...meta, verdict: report.pass ? 'PASS' : 'FAIL', gates: report.gates })

    log(`report: ${path.join(runDir, 'report.md')}`)
    log(`verdict: ${report.pass ? 'PASS' : 'FAIL'}`)
    for (const gate of report.gates) {
      log(`  ${gate.pass ? 'PASS' : 'FAIL'} ${gate.gate} — ${gate.detail}`)
    }
    console.log(JSON.stringify({ runId, runDir, pass: report.pass, gates: report.gates }, null, 2))
  } catch (err) {
    exitCode = 2
    log(`ERROR: ${err.stack ?? err}`)
  } finally {
    watchdog?.stop()
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
      .find((candidate) => candidate !== page.mainFrame() && candidate.url().includes('/landrush-lab/'))
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
    fpsCap: runJson.fpsCap ?? 50,
    measureFromFrame: runJson.measureFromFrame ?? 0,
    meta: runJson,
  })
  console.log(JSON.stringify({ pass: report.pass, gates: report.gates }, null, 2))
  return report.pass ? 0 : 1
}

const args = parseArgs(process.argv)
let code = 0
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
process.exit(code)
