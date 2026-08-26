import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findTraversableLandrushExteriorEntryRoute,
  landrushExteriorEntryObservationIssues,
} from '../scenario-utils.mjs'
import {
  resolveZombieEnterRoomLoaderCount,
  zombieEnterRoomLivenessIssues,
  zombieEnterRoomTargetWorkBudgetIssues,
} from './landrush-zombie-enter-room.mjs'

test('loading readiness follows the explicit handoff and visible overlay state', () => {
  assert.equal(
    resolveZombieEnterRoomLoaderCount({
      loadingHandedOff: true,
      loadingHandoffMarkerPresent: true,
      visibleLoaderCount: 1,
    }),
    1,
  )
  assert.equal(
    resolveZombieEnterRoomLoaderCount({
      loadingHandedOff: false,
      loadingHandoffMarkerPresent: true,
      visibleLoaderCount: 0,
    }),
    1,
  )
  assert.equal(
    resolveZombieEnterRoomLoaderCount({
      loadingHandedOff: false,
      loadingHandoffMarkerPresent: false,
      visibleLoaderCount: 2,
    }),
    2,
  )
})

test('doorway endpoint evidence requires a matching pose, explicit side, and advancing frame', () => {
  const observation = {
    floor: {
      buildingScopeId: 'parcel:parcel-02',
      insideBuilding: true,
      levelId: 'level-a',
    },
    frameIdx: 42,
    robot: { x: 3, y: 0, z: 5 },
  }
  const options = {
    buildingScopeId: 'parcel:parcel-02',
    expectedInside: true,
    levelId: 'level-a',
    minimumFrameIdx: 41,
    point: { x: 3, y: 0, z: 5 },
  }
  assert.deepEqual(landrushExteriorEntryObservationIssues(observation, options), [])
  assert.ok(
    landrushExteriorEntryObservationIssues(
      { ...observation, frameIdx: 41 },
      options,
    ).some((issue) => issue.includes('bridge frame')),
  )
  assert.ok(
    landrushExteriorEntryObservationIssues(
      { ...observation, floor: { ...observation.floor, insideBuilding: false } },
      options,
    ).some((issue) => issue.includes('insideBuilding=false')),
  )
  assert.ok(
    landrushExteriorEntryObservationIssues(
      { ...observation, robot: { x: 30, y: 0, z: 50 } },
      options,
    ).some((issue) => issue.includes('pose does not match')),
  )
})

test('entry selection rejects a teleported candidate, traverses the next, and restages outside', async () => {
  let frameIdx = 0
  let observedAtMs = 0
  let movement = []
  let robot = { x: 0, y: 0, z: 0 }
  const floor = {
    buildingScopeId: null,
    insideBuilding: false,
    levelId: null,
    regionSource: 'outside',
  }
  const portals = [
    {
      baseY: 0,
      doorId: 'door-a',
      sideA: { x: 0, z: 0 },
      sideB: { x: 1, z: 0 },
    },
    {
      baseY: 0,
      doorId: 'door-b',
      sideA: { x: 10, z: 0 },
      sideB: { x: 11, z: 0 },
    },
  ]
  const setPose = (point) => {
    robot = { x: point.x, y: point.y ?? 0, z: point.z }
    const inside = point.x === 1 || point.x === 11
    floor.insideBuilding = inside
    floor.buildingScopeId = inside ? `parcel:${point.x === 1 ? 'a' : 'b'}` : null
    floor.levelId = inside ? `level-${point.x === 1 ? 'a' : 'b'}` : null
    floor.regionSource = inside ? 'building' : 'outside'
  }
  const navigation = {
    getState: () => {
      const next = movement.shift()
      if (next) setPose(next)
      return { doorPortals: portals, heading: 0, robot, speed: 0, stairPortals: [] }
    },
    setupStart: ({ start }) => {
      movement = []
      setPose(start)
      return true
    },
    startMove: ({ label, start, target }) => {
      setPose(start)
      if (label.includes('door-a')) {
        setPose(target)
        return true
      }
      movement = [
        { x: 10.3, y: 0, z: 0 },
        { x: 10.6, y: 0, z: 0 },
        { x: 10.9, y: 0, z: 0 },
        target,
      ]
      return true
    },
  }
  const previousWindow = globalThis.window
  globalThis.window = {
    __LANDRUSH_ISLAND_NAV_TEST__: navigation,
    __LANDRUSH_ISLAND_RUNTIME_PROBE__: { floorVisibility: floor },
    __PASCAL_BENCH__: { beacon: () => ({ frameIdx: ++frameIdx }) },
  }
  const page = {
    evaluate: async (callback, argument) => {
      const value = callback(argument)
      if (Number.isInteger(value?.frameIdx)) {
        observedAtMs += 100
        value.observedAtMs = observedAtMs
      }
      return value
    },
  }
  try {
    const route = await findTraversableLandrushExteriorEntryRoute(page, async () => {})
    assert.equal(route?.doorId, 'door-b')
    assert.deepEqual(robot, { x: 10, y: 0, z: 0 })
    assert.equal(floor.insideBuilding, false)
  } finally {
    globalThis.window = previousWindow
  }
})

function targetWorkPerformance(graphNodeCount) {
  return {
    navigationGraphNodeCount: graphNodeCount,
    navigationSparseSearchCompactTargetMaximumNodeCount: 256,
    navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick: 256,
    navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick: 512,
    navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick: 512,
    navigationSparseSearchMaximumTargetCandidateVisitsPerTick: 1_024,
    navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick: 1_024,
    navigationSparseSearchMaximumTargetHeapOperationsPerTick: 3_072,
    navigationSparseTargetUpdateCandidateVisitsMaximumObservedPerTick:
      graphNodeCount <= 256 ? 256 : 1_016,
    navigationSparseTargetUpdateCandidateVisitsThisTick:
      graphNodeCount <= 256 ? 256 : 1_016,
    navigationSparseTargetUpdateGraphEdgeVisitsMaximumObservedPerTick:
      graphNodeCount <= 256 ? 512 : 912,
    navigationSparseTargetUpdateGraphEdgeVisitsThisTick:
      graphNodeCount <= 256 ? 512 : 912,
    navigationSparseTargetUpdateHeapOperationsMaximumObservedPerTick:
      graphNodeCount <= 256 ? 512 : 3_064,
    navigationSparseTargetUpdateHeapOperationsThisTick:
      graphNodeCount <= 256 ? 512 : 3_064,
  }
}

test('target-update work uses pinned compact/full caps and rejects self-report inflation', () => {
  assert.deepEqual(zombieEnterRoomTargetWorkBudgetIssues(targetWorkPerformance(200)), [])
  assert.deepEqual(zombieEnterRoomTargetWorkBudgetIssues(targetWorkPerformance(1_500)), [])
  const excessive = targetWorkPerformance(1_500)
  excessive.navigationSparseTargetUpdateHeapOperationsThisTick = 3_073
  assert.ok(
    zombieEnterRoomTargetWorkBudgetIssues(excessive).some((issue) =>
      issue.includes('exceeds target cap=3072'),
    ),
  )
  const selfInflated = targetWorkPerformance(1_500)
  selfInflated.navigationSparseSearchMaximumTargetHeapOperationsPerTick = 9_999
  selfInflated.navigationSparseTargetUpdateHeapOperationsThisTick = 3_073
  const inflationIssues = zombieEnterRoomTargetWorkBudgetIssues(selfInflated)
  assert.ok(
    inflationIssues.some((issue) =>
      issue.includes('navigationSparseSearchMaximumTargetHeapOperationsPerTick=9999 expected 3072'),
    ),
  )
  assert.ok(inflationIssues.some((issue) => issue.includes('exceeds target cap=3072')))

  const selfInflatedCompactRegime = targetWorkPerformance(300)
  selfInflatedCompactRegime.navigationSparseSearchCompactTargetMaximumNodeCount = 2_000
  selfInflatedCompactRegime.navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick =
    2_000
  selfInflatedCompactRegime.navigationSparseTargetUpdateCandidateVisitsThisTick = 1_500
  const compactInflationIssues = zombieEnterRoomTargetWorkBudgetIssues(
    selfInflatedCompactRegime,
  )
  assert.ok(
    compactInflationIssues.some((issue) =>
      issue.includes('navigationSparseSearchCompactTargetMaximumNodeCount=2000 expected 256'),
    ),
  )
  assert.ok(
    compactInflationIssues.some((issue) =>
      issue.includes('candidate visits this tick=1500 exceeds target cap=1024'),
    ),
  )
})

test('live liveness accepts retained pending actions but rejects missing or stale actions', () => {
  const valid = {
    navigationGoalResolvedTick: 120,
    navigationLivingWithoutCommittedActionCount: 0,
    navigationRetainedPendingActionCount: 8,
    navigationStaleTargetCount: 0,
    spatialIndexedAgentCount: 100,
  }
  assert.deepEqual(zombieEnterRoomLivenessIssues(valid), [])
  assert.ok(
    zombieEnterRoomLivenessIssues({
      ...valid,
      navigationLivingWithoutCommittedActionCount: 1,
      navigationStaleTargetCount: 2,
    }).some((issue) => issue.includes('living without committed action=1')),
  )
})
