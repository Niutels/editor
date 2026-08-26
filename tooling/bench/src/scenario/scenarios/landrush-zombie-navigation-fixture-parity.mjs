import {
  assertLandrushZombieNavigationExecutionParity,
  assertLandrushZombieNavigationFixtureCaptureParity,
  loadLandrushZombieNavigationCanonicalFixture,
  runHeadlessLandrushZombieNavigationProofProcess,
  LANDRUSH_ZOMBIE_NAVIGATION_SOURCE_REPLAY_PATH,
  writeLandrushZombieNavigationCanonicalFixtureFromCapture,
  writeLandrushZombieNavigationBrowserParityResult,
} from '../../landrush-zombie-navigation-proof-parity.mjs'
import { readFile } from 'node:fs/promises'
import {
  benchmarkParams,
  restoreLandrushBenchmarkFixture,
  waitForSceneNodes,
  waitForWorldLayout,
} from '../scenario-utils.mjs'
import {
  summarizeZombieNavigationScaleProof,
  zombieNavigationScaleProofIssues,
} from './landrush-zombie-navigation-scale-proof-contract.mjs'

const STATE_POLL_MS = 250
const CAPTURE_TIMEOUT_MS = 120_000
const PROOF_TIMEOUT_MS = 120_000

let preparePass = 0
let parityComplete = false
let paritySummary = null

export function isLandrushZombieNavigationFullParityRequested(args = {}) {
  const value = args['full-parity']
  return value === true || value === '1' || value === 'true'
}

export function isLandrushZombieNavigationFixtureCaptureRequested(args = {}) {
  const value = args['capture-fixture']
  return value === true || value === '1' || value === 'true'
}

async function captureBrowserFixture(page) {
  const startedAt = Date.now()
  let last = null
  while (Date.now() - startedAt < CAPTURE_TIMEOUT_MS) {
    last = await page.evaluate(async () => {
      const debug = window.__LANDRUSH_ZOMBIE_ESCAPE__
      const capture =
        debug && typeof debug === 'object'
          ? Reflect.get(debug, 'captureNavigationScaleProofFixture')
          : null
      if (
        typeof capture !== 'function' ||
        Reflect.get(debug, 'phaseReady') !== true ||
        Reflect.get(debug, 'status') !== 'playing'
      ) {
        return {
          capture: null,
          phase: debug && typeof debug === 'object' ? Reflect.get(debug, 'phase') : null,
          phaseReady:
            debug && typeof debug === 'object' ? Reflect.get(debug, 'phaseReady') : null,
          status: debug && typeof debug === 'object' ? Reflect.get(debug, 'status') : null,
        }
      }
      try {
        return { capture: await capture(), error: null, phase: null, phaseReady: true, status: 'playing' }
      } catch (error) {
        return {
          capture: null,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          phase: Reflect.get(debug, 'phase') ?? null,
          phaseReady: Reflect.get(debug, 'phaseReady') ?? null,
          status: Reflect.get(debug, 'status') ?? null,
        }
      }
    })
    if (last?.capture) return last.capture
    await new Promise((resolve) => setTimeout(resolve, STATE_POLL_MS))
  }
  throw new Error(`navigation fixture capture did not become ready (${JSON.stringify(last)})`)
}

async function runBrowserProof(page) {
  return page.evaluate(async () => {
    const debug = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const runProof =
      debug && typeof debug === 'object' ? Reflect.get(debug, 'runNavigationScaleProof') : null
    if (typeof runProof !== 'function') {
      throw new Error('full parity requested without the browser navigation proof bridge')
    }
    return runProof()
  })
}

export default {
  name: 'landrush-zombie-navigation-fixture-parity',
  fixture: 'zombie-navigation-real-island',
  lifecycle: {
    captureInitialCheckpoint: false,
    prepareAfterWarmup: true,
    settleBeforeMeasurement: true,
    watchdog: true,
  },
  urlParams: ({ args }) =>
    `${benchmarkParams('outside')}&game=zombie-escape&landrushNavDebug=1&` +
    'landrushNavFixtureCapture=1' +
    (isLandrushZombieNavigationFullParityRequested(args) ? '&landrushNavScaleProof=1' : ''),
  async prepare({ args, bridge, page, sleep, trace }) {
    if (preparePass === 0) {
      await waitForWorldLayout(page)
      await waitForSceneNodes(bridge, 1)
      await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
      const settled = await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 15_000 })
      if (!settled || settled.timedOut) {
        throw new Error(`navigation fixture parity scene did not settle (${JSON.stringify(settled)})`)
      }
      preparePass = 1
      return
    }
    if (parityComplete) return

    const capture = await captureBrowserFixture(page)
    if (isLandrushZombieNavigationFixtureCaptureRequested(args)) {
      const sourceReplayBytes = await readFile(LANDRUSH_ZOMBIE_NAVIGATION_SOURCE_REPLAY_PATH)
      await writeLandrushZombieNavigationCanonicalFixtureFromCapture({
        capture,
        sourceReplayBytes,
      })
    }
    const { fixture, sourceReplayBytes } = await loadLandrushZombieNavigationCanonicalFixture()
    const fixtureParity = assertLandrushZombieNavigationFixtureCaptureParity({
      capture,
      fixture,
      sourceReplayBytes,
    })
    const fullParity = isLandrushZombieNavigationFullParityRequested(args)
    if (fullParity) {
      const browserResult = await runBrowserProof(page)
      const headless = await runHeadlessLandrushZombieNavigationProofProcess({
        timeoutMs: PROOF_TIMEOUT_MS,
      })
      const executionParity = assertLandrushZombieNavigationExecutionParity({
        browserResult,
        headlessResult: headless.result,
      })
      await writeLandrushZombieNavigationBrowserParityResult({
        browserResult,
        capturedAt: new Date().toISOString(),
        executionParity,
        fixture: {
          payloadSha256: fixture.compilation.payloadSha256,
          replaySha256: fixture.source.replaySha256,
          worldId: fixture.source.worldId,
        },
        headlessDurationMs: headless.durationMs,
        schemaVersion: 1,
      })
      paritySummary = {
        fixtureParity,
        fullParity: true,
        issues: zombieNavigationScaleProofIssues(browserResult),
        summary: summarizeZombieNavigationScaleProof(browserResult),
      }
    } else {
      const hasHeavyProofBridge = await page.evaluate(() => {
        const debug = window.__LANDRUSH_ZOMBIE_ESCAPE__
        return Boolean(
          debug &&
            typeof debug === 'object' &&
            typeof Reflect.get(debug, 'runNavigationScaleProof') === 'function',
        )
      })
      if (hasHeavyProofBridge) {
        throw new Error('fixture smoke exposed the heavy navigation proof bridge')
      }
      paritySummary = { fixtureParity, fullParity: false }
    }
    parityComplete = true
    trace.write({
      kind: 'validation',
      name: 'zombie-navigation-fixture-parity',
      summary: paritySummary,
      t: performance.now(),
    })
    await sleep(STATE_POLL_MS)
  },
  async execute({ mark, sleep, trace }) {
    if (!parityComplete || !paritySummary) {
      throw new Error('navigation fixture parity did not complete before measurement')
    }
    trace.write({
      kind: 'validation',
      name: 'zombie-navigation-fixture-parity-measured-window',
      summary: paritySummary,
      t: performance.now(),
    })
    await mark('zombie-navigation-fixture-parity-start')
    await sleep(500)
    await mark('zombie-navigation-fixture-parity-end')
  },
}
