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

export {
  ZOMBIE_NAVIGATION_SCALE_PROOF_POPULATIONS,
  ZOMBIE_NAVIGATION_SCALE_PROOF_RECORDED_BREACH_BLOCKER_IDS,
  ZOMBIE_NAVIGATION_SCALE_PROOF_TARGET_WORK_KEYS,
  summarizeZombieNavigationScaleProof,
  zombieNavigationScaleProofIssues,
} from './landrush-zombie-navigation-scale-proof-contract.mjs'

const STATE_POLL_MS = 250
const REQUIRED_STABLE_SAMPLES = 4
const MEASURED_OBSERVER_LIGHT_MS = 2_000

let preparePass = 0
let navigationScaleProofResult = null
let roomSoakBegan = false

async function readProofReadiness(page) {
  return page.evaluate(() => {
    const debug = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const roomSoak = window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__
    const runner = debug && typeof debug === 'object' ? Reflect.get(debug, 'runNavigationScaleProof') : null
    return {
      hasRoomSoak: Boolean(roomSoak),
      hasRunner: typeof runner === 'function',
      phase: debug && typeof debug === 'object' ? Reflect.get(debug, 'phase') ?? null : null,
      phaseReady:
        debug && typeof debug === 'object' ? Reflect.get(debug, 'phaseReady') ?? null : null,
      status: debug && typeof debug === 'object' ? Reflect.get(debug, 'status') ?? null : null,
    }
  })
}

async function beginProtectedRoomSoak(page, sleep, timeoutMs = 240_000) {
  const startedAt = Date.now()
  let consecutive = 0
  let last = null
  while (Date.now() - startedAt < timeoutMs) {
    const readiness = await readProofReadiness(page)
    if (
      readiness.hasRoomSoak &&
      readiness.hasRunner &&
      readiness.phase === 'night' &&
      readiness.phaseReady === true &&
      readiness.status === 'playing'
    ) {
      last = await page.evaluate(() => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.begin() ?? null)
      if (
        last?.active === true &&
        last?.enabled === true &&
        last?.obstacleDamageSuppressed === true &&
        last?.phaseHeld === true &&
        last?.playerProtected === true
      ) {
        consecutive += 1
        if (consecutive >= REQUIRED_STABLE_SAMPLES) return last
      } else {
        consecutive = 0
      }
    } else {
      consecutive = 0
    }
    await sleep(STATE_POLL_MS)
  }
  throw new Error(`navigation scale proof room protection did not settle (${JSON.stringify(last)})`)
}

async function endProtectedRoomSoak(page) {
  return page.evaluate(() => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.end() ?? null)
}

async function runLiveNavigationScaleProof(page) {
  return page.evaluate(async () => {
    const debug = window.__LANDRUSH_ZOMBIE_ESCAPE__
    if (!debug || typeof debug !== 'object') throw new Error('Zombie Escape debug bridge is missing')
    const runner = Reflect.get(debug, 'runNavigationScaleProof')
    if (typeof runner !== 'function') {
      throw new Error('Zombie Escape navigation scale proof runner is missing')
    }
    return runner()
  })
}

export default {
  name: 'landrush-zombie-navigation-scale-proof',
  fixture: 'outside',
  lifecycle: {
    captureInitialCheckpoint: false,
    prepareAfterWarmup: true,
    settleBeforeMeasurement: true,
    watchdog: true,
  },
  urlParams: () =>
    `${benchmarkParams('outside')}&game=zombie-escape&landrushNavDebug=1&` +
    'landrushZombieRoomSoak=1&landrushNavScaleProof=1',
  async prepare({ bridge, page, sleep, trace }) {
    if (preparePass === 0) {
      await waitForWorldLayout(page)
      await waitForSceneNodes(bridge, 1)
      await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
      const settled = await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 15_000 })
      if (!settled || settled.timedOut) {
        throw new Error(`navigation scale proof scene did not settle (${JSON.stringify(settled)})`)
      }
      preparePass = 1
      return
    }
    if (navigationScaleProofResult) return

    await beginProtectedRoomSoak(page, sleep)
    roomSoakBegan = true
    try {
      navigationScaleProofResult = await runLiveNavigationScaleProof(page)
      const issues = zombieNavigationScaleProofIssues(navigationScaleProofResult)
      trace.write({
        kind: 'validation',
        name: 'zombie-navigation-scale-proof-premeasurement',
        issues,
        summary: summarizeZombieNavigationScaleProof(navigationScaleProofResult),
        t: performance.now(),
      })
      if (issues.length > 0) throw new Error(`navigation scale proof failed: ${issues.join('; ')}`)
    } catch (error) {
      await endProtectedRoomSoak(page)
      roomSoakBegan = false
      throw error
    }
  },
  async execute({ mark, page, sleep, trace }) {
    if (!navigationScaleProofResult) {
      throw new Error('navigation scale proof was not completed before measurement')
    }
    const issues = zombieNavigationScaleProofIssues(navigationScaleProofResult)
    trace.write({
      kind: 'validation',
      name: 'zombie-navigation-scale-proof-measured-window',
      issues,
      summary: summarizeZombieNavigationScaleProof(navigationScaleProofResult),
      t: performance.now(),
    })
    if (issues.length > 0) {
      throw new Error(`navigation scale proof failed before measured hold: ${issues.join('; ')}`)
    }
    try {
      await mark('zombie-navigation-scale-proof-start')
      await sleep(MEASURED_OBSERVER_LIGHT_MS)
      await mark('zombie-navigation-scale-proof-end')
    } finally {
      if (roomSoakBegan) {
        const ended = await endProtectedRoomSoak(page)
        roomSoakBegan = false
        if (ended?.active !== false || ended?.phaseHeld !== false) {
          throw new Error(`navigation scale proof room cleanup failed (${JSON.stringify(ended)})`)
        }
      }
    }
  },
}


