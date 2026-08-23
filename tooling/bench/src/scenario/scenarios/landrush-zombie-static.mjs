import {
  benchmarkParams,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForSceneNodes,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

const STATE_POLL_MS = 350
const REQUIRED_CONSECUTIVE_SAMPLES = 4
const STAGED_HORIZONTAL_TOLERANCE_METERS = 0.2
const STAGED_VERTICAL_TOLERANCE_METERS = 0.12
const STAGED_VERTICAL_SETTLEMENT_TOLERANCE_METERS = 0.02

let preparePass = 0
let stagedPoint = null

function readFinitePoint(point) {
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    return null
  }
  return { x: point.x, y: point.y, z: point.z }
}

function stagedPointIssues(robot, point) {
  const resolvedRobot = readFinitePoint(robot)
  if (!resolvedRobot) return ['navigation robot position is unavailable']
  if (!point) return ['upper-floor staging point is unavailable']
  const horizontalError = Math.hypot(resolvedRobot.x - point.x, resolvedRobot.z - point.z)
  const verticalError = Math.abs(resolvedRobot.y - point.y)
  const issues = []
  if (horizontalError > STAGED_HORIZONTAL_TOLERANCE_METERS) {
    issues.push(`staged horizontal error is ${horizontalError.toFixed(3)}m`)
  }
  if (verticalError > STAGED_VERTICAL_TOLERANCE_METERS) {
    issues.push(`staged vertical error is ${verticalError.toFixed(3)}m`)
  }
  return issues
}

function upperFloorCandidateIssues(robot, candidate, previousRobot = null) {
  const resolvedRobot = readFinitePoint(robot)
  if (!resolvedRobot) return ['navigation robot position is unavailable']
  const horizontalError = Math.hypot(
    resolvedRobot.x - candidate.x,
    resolvedRobot.z - candidate.z,
  )
  const issues = []
  if (horizontalError > STAGED_HORIZONTAL_TOLERANCE_METERS) {
    issues.push(`staged horizontal error is ${horizontalError.toFixed(3)}m`)
  }
  const resolvedPreviousRobot = readFinitePoint(previousRobot)
  if (
    resolvedPreviousRobot &&
    Math.abs(resolvedRobot.y - resolvedPreviousRobot.y) >
      STAGED_VERTICAL_SETTLEMENT_TOLERANCE_METERS
  ) {
    issues.push('staged collision support is still settling vertically')
  }
  return issues
}

function settledNightIssues(sample, previousFrameIdx = null) {
  const issues = []
  if (sample.hud?.phase !== 'night') issues.push(`HUD phase=${sample.hud?.phase ?? 'missing'}`)
  if (sample.hud?.expectedPhase !== 'night') {
    issues.push(`HUD expectedPhase=${sample.hud?.expectedPhase ?? 'missing'}`)
  }
  if (sample.hud?.phaseReady !== 'true') {
    issues.push(`HUD phaseReady=${sample.hud?.phaseReady ?? 'missing'}`)
  }
  if (sample.zombie?.integratedIntoExistingCanvas !== true) {
    issues.push('zombie mode is not integrated into the existing canvas')
  }
  if (sample.zombie?.phase !== 'night') {
    issues.push(`zombie phase=${sample.zombie?.phase ?? 'missing'}`)
  }
  if (sample.zombie?.expectedPhase !== 'night') {
    issues.push(`zombie expectedPhase=${sample.zombie?.expectedPhase ?? 'missing'}`)
  }
  if (sample.zombie?.phaseReady !== true) {
    issues.push(`zombie phaseReady=${String(sample.zombie?.phaseReady)}`)
  }
  if (sample.zombie?.status !== 'playing') {
    issues.push(`zombie status=${sample.zombie?.status ?? 'missing'}`)
  }
  if (!Number.isFinite(sample.zombie?.night) || sample.zombie.night < 1) {
    issues.push(`zombie night=${String(sample.zombie?.night)}`)
  }
  if (!Number.isFinite(sample.zombie?.activeTargets) || sample.zombie.activeTargets < 1) {
    issues.push(`active targets=${String(sample.zombie?.activeTargets)}`)
  }
  if (!Number.isFinite(sample.bridge?.nodeCount) || sample.bridge.nodeCount < 1) {
    issues.push(`bridge nodeCount=${String(sample.bridge?.nodeCount)}`)
  }
  if (!Number.isFinite(sample.bridge?.frameIdx)) {
    issues.push(`bridge frameIdx=${String(sample.bridge?.frameIdx)}`)
  } else if (previousFrameIdx !== null && sample.bridge.frameIdx <= previousFrameIdx) {
    issues.push(`bridge frame did not advance from ${previousFrameIdx}`)
  }
  if (!Number.isFinite(sample.floor?.visibleLevelCount) || sample.floor.visibleLevelCount < 3) {
    issues.push(`visible floor count=${String(sample.floor?.visibleLevelCount)}`)
  }
  return issues
}

async function readZombieBenchmarkState(page, bridge) {
  const state = await page.evaluate(() => {
    const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
    const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null
    const floor = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.floorVisibility ?? null
    return {
      floor: {
        buildingScopeId: floor?.buildingScopeId ?? null,
        insideBuilding: floor?.insideBuilding ?? null,
        levelId: floor?.levelId ?? null,
        visibleLevelCount: Array.isArray(floor?.visibleLevelIds)
          ? floor.visibleLevelIds.length
          : 0,
      },
      hud: hud
        ? {
            expectedPhase: hud.getAttribute('data-expected-phase'),
            phase: hud.getAttribute('data-phase'),
            phaseReady: hud.getAttribute('data-phase-ready'),
          }
        : null,
      navigation: navigation
        ? {
            robot: navigation.robot,
            speed: navigation.speed,
          }
        : null,
      zombie:
        zombie && typeof zombie === 'object'
          ? {
              activeTargets: zombie.targets?.active ?? null,
              expectedPhase: zombie.expectedPhase ?? null,
              integratedIntoExistingCanvas: zombie.integratedIntoExistingCanvas ?? false,
              night: zombie.night ?? null,
              phase: zombie.phase ?? null,
              phaseReady: zombie.phaseReady ?? false,
              phaseSecondsRemaining: zombie.phaseSecondsRemaining ?? null,
              status: zombie.status ?? null,
            }
          : null,
    }
  })
  const { beacon } = await bridge.beacon()
  return {
    ...state,
    bridge: {
      frameIdx: beacon?.frameIdx ?? null,
      nodeCount: beacon?.nodeCount ?? null,
    },
  }
}

async function waitForSettledNight(page, bridge, sleep, point = null, timeoutMs = 240_000) {
  const startedAt = Date.now()
  let consecutive = 0
  let previousFrameIdx = null
  let last = null
  let lastIssues = []
  while (Date.now() - startedAt < timeoutMs) {
    last = await readZombieBenchmarkState(page, bridge)
    lastIssues = settledNightIssues(last, previousFrameIdx)
    if (point) lastIssues.push(...stagedPointIssues(last.navigation?.robot, point))
    if (lastIssues.length === 0) consecutive += 1
    else consecutive = 0
    previousFrameIdx = last.bridge.frameIdx
    if (consecutive >= REQUIRED_CONSECUTIVE_SAMPLES) return last
    await sleep(STATE_POLL_MS)
  }
  throw new Error(
    `zombie night did not settle for ${REQUIRED_CONSECUTIVE_SAMPLES} samples ` +
      `(issues=${lastIssues.join('; ') || 'none'}, last=${JSON.stringify(last)})`,
  )
}

async function readUpperFloorCandidates(page) {
  return page.evaluate(() => {
    const state = window.__LANDRUSH_ISLAND_NAV_TEST__?.getState()
    if (!state) return null
    const portals = [...state.doorPortals]
      .filter(
        (portal) =>
          Number.isFinite(portal.baseY) &&
          Number.isFinite(portal.center?.x) &&
          Number.isFinite(portal.center?.z),
      )
      .sort(
        (first, second) =>
          second.baseY - first.baseY || String(first.doorId).localeCompare(String(second.doorId)),
      )
    const lowestBaseY = portals.reduce(
      (lowest, portal) => Math.min(lowest, portal.baseY),
      Number.POSITIVE_INFINITY,
    )
    const upperPortal = portals.find((portal) => portal.baseY > lowestBaseY + 0.5)
    if (!upperPortal) return { candidates: [], portalCount: portals.length }
    const positions = [upperPortal.center, upperPortal.sideA, upperPortal.sideB]
    return {
      candidates: positions.map((position, index) => ({
        doorId: String(upperPortal.doorId),
        kind: ['center', 'side-a', 'side-b'][index],
        x: position.x,
        y: upperPortal.baseY,
        z: position.z,
      })),
      portalCount: portals.length,
    }
  })
}

async function stageSafeUpperFloorPoint(page, sleep) {
  const resolved = await readUpperFloorCandidates(page)
  if (!resolved?.candidates.length) {
    throw new Error(
      `zombie benchmark could not derive an upper-floor door point ` +
        `(portals=${resolved?.portalCount ?? 'unavailable'})`,
    )
  }

  let lastIssues = []
  for (const candidate of resolved.candidates) {
    const staged = await page.evaluate((point) => {
      const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
      return navigation?.setupStart({ label: `benchmark-zombie-upper-${point.kind}`, start: point }) ?? false
    }, candidate)
    if (!staged) continue

    let consecutive = 0
    let previousRobot = null
    for (let sampleIndex = 0; sampleIndex < REQUIRED_CONSECUTIVE_SAMPLES; sampleIndex += 1) {
      await sleep(STATE_POLL_MS)
      const robot = await page.evaluate(
        () => window.__LANDRUSH_ISLAND_NAV_TEST__?.getState().robot ?? null,
      )
      lastIssues = upperFloorCandidateIssues(robot, candidate, previousRobot)
      if (lastIssues.length === 0) consecutive += 1
      else consecutive = 0
      previousRobot = readFinitePoint(robot)
    }
    if (consecutive >= REQUIRED_CONSECUTIVE_SAMPLES && previousRobot) {
      return { ...candidate, y: previousRobot.y }
    }
  }

  throw new Error(`zombie benchmark upper-floor staging was not stable (${lastIssues.join('; ')})`)
}

function assertValidInitialState(sample, point) {
  const issues = [...settledNightIssues(sample), ...stagedPointIssues(sample.navigation?.robot, point)]
  if (issues.length > 0) throw new Error(`invalid zombie benchmark initial state: ${issues.join('; ')}`)
}

function finalStateIssues(initial, final, point) {
  const issues = [...settledNightIssues(final), ...stagedPointIssues(final.navigation?.robot, point)]
  if (final.zombie?.night !== initial.zombie?.night) {
    issues.push(`night changed from ${String(initial.zombie?.night)} to ${String(final.zombie?.night)}`)
  }
  if (
    Number.isFinite(initial.zombie?.phaseSecondsRemaining) &&
    Number.isFinite(final.zombie?.phaseSecondsRemaining) &&
    final.zombie.phaseSecondsRemaining > initial.zombie.phaseSecondsRemaining + 1
  ) {
    issues.push(
      `night countdown increased from ${initial.zombie.phaseSecondsRemaining.toFixed(2)}s ` +
        `to ${final.zombie.phaseSecondsRemaining.toFixed(2)}s`,
    )
  }
  return issues
}

export default {
  name: 'landrush-zombie-static',
  fixture: 'outside',
  urlParams: () =>
    `${benchmarkParams('outside')}&game=zombie-escape&landrushNavDebug=1`,
  async prepare({ bridge, page, sleep }) {
    if (preparePass === 0) {
      await waitForWorldLayout(page)
      await waitForSceneNodes(bridge, 1)
      await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
      const settled = await bridge.waitForSettle({ stableFrames: 10, timeoutMs: 15_000 })
      if (!settled || settled.timedOut) {
        throw new Error(`zombie benchmark scene did not settle (${JSON.stringify(settled)})`)
      }
      stagedPoint = null
      preparePass = 1
      return
    }

    await waitForSettledNight(page, bridge, sleep)
    stagedPoint = await stageSafeUpperFloorPoint(page, sleep)
    await waitForSettledNight(page, bridge, sleep, stagedPoint)
    preparePass += 1
  },
  async execute({ bridge, minutes, mark, page, sleep, trace }) {
    const initial = await readZombieBenchmarkState(page, bridge)
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'zombie-static-initial-state',
      point: stagedPoint,
      state: initial,
    })
    assertValidInitialState(initial, stagedPoint)

    await mark('zombie-static-start')
    await sleep(scenarioDurationMs(minutes))
    await mark('zombie-static-end')

    const final = await readZombieBenchmarkState(page, bridge)
    const issues = finalStateIssues(initial, final, stagedPoint)
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'zombie-static-final-state',
      issues,
      point: stagedPoint,
      state: final,
    })
    if (issues.length > 0) {
      throw new Error(`invalid zombie benchmark final state: ${issues.join('; ')}`)
    }
  },
}
