import { describe, expect, test } from 'bun:test'
import {
  classifyZombieEscapeCollisionObjectDelta,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionObjectDeltaResult,
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldActiveView,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeSparseCommittedNodeRoute,
  deactivateZombieEscapeCollisionObject,
  followZombieEscapeCachedSparseWaypoint,
  getZombieEscapeSparseCommittedRouteGeneration,
  getZombieEscapeSparseRequestedTargetRevision,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  resolveZombieEscapeFlowDirection,
  sampleZombieEscapeSparseCommittedNodeRoute,
  seedZombieEscapeSparseFlowSearchRouteCorridor,
  updateZombieEscapeFlowTarget,
  type ZombieEscapeFlowSample,
  zombieEscapeSegmentIsClear,
} from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  applyZombieEscapeObstacleDelta,
  createZombieEscapeSimulation,
  hasZombieEscapeNavigationCollisionRecoveryProgressed,
  inspectZombieEscapeCommittedNavigationAction,
  inspectZombieEscapeNavigationRefreshCandidates,
  resetZombieEscapeSimulation,
  resolveZombieEscapeSparseAgentWorkBudgetLimit,
  resolveZombieEscapeSparseSharedWorkBudgetLimit,
  scheduleZombieEscapeNavigationIntentResolutions,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  writeZombieEscapeDeferredNavigationDirection,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
  type ZombieEscapeNavigationRefreshInspectionState,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

function createFlowSample(): ZombieEscapeFlowSample {
  return {
    blockingDistance: Number.POSITIVE_INFINITY,
    blockingX: 0,
    blockingZ: 0,
    connectorIndex: -1,
    connectorTargetEnd: false,
    reachable: false,
    waypointNode: -1,
    waypointUsesFallback: false,
    x: 0,
    z: 0,
  }
}

function expectNavigationIntentConservation(state: ZombieEscapeSimulation) {
  const attachmentHeapLeases = inspectZombieEscapeSparseAttachmentHeapLeases(state.navigationField)
  let activeDependencyWaitCount = 0
  for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
    if (
      state.zombies.navigationSparseFlowSearchActive[slot] !== 0 &&
      state.zombies.navigationSparseFlowSearchDependencyWaiting[slot] !== 0
    ) {
      activeDependencyWaitCount += 1
    }
  }
  const reasonDemandCount =
    state.navigationIntentDemandSpawnCount +
    state.navigationIntentDemandWorldChangedCount +
    state.navigationIntentDemandConnectorChangedCount +
    state.navigationIntentDemandRoutePublishedCount +
    state.navigationIntentDemandCachedAnchorLostCount +
    state.navigationIntentDemandCollisionRecoveryCount
  expect(ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick).toBe(16)
  expect(state.navigationIntentIssuedCount).toBe(reasonDemandCount)
  expect(state.navigationIntentIssuedCount).toBe(
    state.navigationIntentResolvedCount +
      state.navigationIntentCanceledCount +
      state.navigationIntentPendingCount,
  )
  expect(state.navigationIntentResolveCount).toBe(state.navigationIntentResolvedCount)
  expect(state.navigationIntentPendingCount).toBe(
    [...state.zombies.navigationIntentPending].filter((pending) => pending !== 0).length,
  )
  expect(state.navigationIntentResolveCountThisTick).toBeLessThanOrEqual(16)
  expect(state.navigationIntentMaximumResolveCountObservedPerTick).toBeLessThanOrEqual(16)
  expect(state.navigationIntentResolveBudgetViolationCount).toBe(0)
  expect(state.navigationIntentFirstServiceCount).toBeLessThanOrEqual(
    state.navigationIntentIssuedCount,
  )
  expect(state.navigationSparseSearchStartedCount).toBe(
    state.navigationSparseSearchCompletedCount +
      state.navigationSparseSearchInvalidatedCount +
      state.navigationSparseSearchCanceledCount +
      state.navigationSparseSearchActiveAgentCount,
  )
  expect(state.navigationSparseSearchRestartedCount).toBe(
    state.navigationSparseSearchRestartedCollisionRecoveryCount +
      state.navigationSparseSearchRestartedRoutePublishedCount +
      state.navigationSparseSearchRestartedTargetPublicationPreemptionCount +
      state.navigationSparseSearchRestartedWorldChangedCount,
  )
  expect(state.navigationSparseSearchStartedCount).toBeLessThanOrEqual(
    state.navigationIntentIssuedCount + state.navigationSparseSearchRestartedCount,
  )
  expect(attachmentHeapLeases.activeAgentLeases + activeDependencyWaitCount).toBe(
    state.navigationSparseSearchActiveAgentCount,
  )
  expect(attachmentHeapLeases.activeAgentLeases + attachmentHeapLeases.availableAgentLeases).toBe(8)
  expect(attachmentHeapLeases.maximumActiveAgentLeases).toBeLessThanOrEqual(8)
  expect(attachmentHeapLeases.singletonReserved).toBe(true)
  expect(attachmentHeapLeases.spawnReserved).toBe(true)
  expect(attachmentHeapLeases.leaseInvariantViolationCount).toBe(0)
  expect(state.navigationSparseSearchUncausedStartViolationCount).toBe(0)
  expect(state.navigationSparseSearchCompletionProgressThisTick).toBeLessThanOrEqual(
    state.navigationSparseSearchServiceSliceCountThisTick,
  )
  expect(state.navigationSparseSearchAgentServiceSliceCountThisTick).toBeGreaterThanOrEqual(
    Math.min(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
      state.navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick,
    ),
  )
  expect(state.navigationSparseSearchAgentServiceSliceCountThisTick).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
  )
  expect(state.navigationSparseSearchTargetServiceSliceCountThisTick).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchTargetSlicesPerTick,
  )
  expect(state.navigationSparseSearchSpawnServiceSliceCountThisTick).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchSpawnSlicesPerTick,
  )
  expect(state.navigationSparseSearchServiceSliceCountThisTick).toBe(
    state.navigationSparseSearchAgentServiceSliceCountThisTick +
      state.navigationSparseSearchTargetServiceSliceCountThisTick +
      state.navigationSparseSearchSpawnServiceSliceCountThisTick,
  )
  expect(state.navigationSparseSearchServiceSliceCountTotal).toBe(
    state.navigationSparseSearchAgentServiceSliceCountTotal +
      state.navigationSparseSearchTargetServiceSliceCountTotal +
      state.navigationSparseSearchSpawnServiceSliceCountTotal,
  )
  expect(state.navigationSparseSearchCompletionProgressThisTick).toBe(
    state.navigationSparseSearchAgentProgressSliceCountThisTick +
      state.navigationSparseSearchTargetProgressSliceCountThisTick +
      state.navigationSparseSearchSpawnProgressSliceCountThisTick,
  )
  expect(state.navigationSparseSearchCompletionProgressTotal).toBe(
    state.navigationSparseSearchAgentProgressSliceCountTotal +
      state.navigationSparseSearchTargetProgressSliceCountTotal +
      state.navigationSparseSearchSpawnProgressSliceCountTotal,
  )
  expect(state.navigationSparseSearchNoProgressAgeTicks).toBe(
    Math.max(
      state.navigationSparseSearchAgentOldestPendingNoProgressAgeTicks,
      state.navigationSparseSearchTargetNoProgressAgeTicks,
      state.navigationSparseSearchSpawnNoProgressAgeTicks,
    ),
  )
  expect(state.navigationSparseSearchMaximumNoProgressAgeTicksObserved).toBe(
    Math.max(
      state.navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved,
      state.navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved,
      state.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved,
    ),
  )
  const workCategories = [
    state.navigationSparseCachedFollowWork,
    state.navigationSparseFlowSearchWork,
    state.navigationSparseSpawnWork,
    state.navigationSparseTargetWork,
  ]
  const agentWorkCategories = [
    state.navigationSparseCachedFollowWork,
    state.navigationSparseFlowSearchWork,
    state.navigationSparseSpawnWork,
  ]
  const compactTarget =
    state.collisionWorld.navigationGraph.nodeIds.length <=
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumNodeCount
  const targetCandidateVisitLimit = compactTarget
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick
    : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetCandidateVisitsPerTick
  const targetGraphEdgeVisitLimit = compactTarget
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick
    : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick
  const targetHeapOperationLimit = compactTarget
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick
    : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetHeapOperationsPerTick
  expect(state.navigationSparseSearchCandidateVisitsThisTick).toBe(
    workCategories.reduce((sum, work) => sum + work.candidateVisitsThisTick, 0),
  )
  expect(state.navigationSparseSearchCandidateVisitsTotal).toBe(
    workCategories.reduce((sum, work) => sum + work.candidateVisitsTotal, 0),
  )
  expect(state.navigationSparseSearchCollisionPredicatesThisTick).toBe(
    workCategories.reduce((sum, work) => sum + work.collisionPredicatesThisTick, 0),
  )
  expect(state.navigationSparseSearchHierarchyNodeVisitsThisTick).toBe(
    workCategories.reduce((sum, work) => sum + work.hierarchyNodeVisitsThisTick, 0),
  )
  expect(state.navigationSparseSearchSupportPredicatesThisTick).toBe(
    workCategories.reduce((sum, work) => sum + work.supportPredicatesThisTick, 0),
  )
  expect(state.navigationSparseSearchGraphEdgeVisitsThisTick).toBe(
    state.navigationSparseTargetWork.graphEdgeVisitsThisTick,
  )
  expect(state.navigationSparseSearchHeapOperationsThisTick).toBe(
    workCategories.reduce((sum, work) => sum + work.heapOperationsThisTick, 0),
  )
  expect(state.navigationSparseSearchHeapOperationsTotal).toBe(
    workCategories.reduce((sum, work) => sum + work.heapOperationsTotal, 0),
  )
  expect(
    agentWorkCategories.reduce((sum, work) => sum + work.candidateVisitsThisTick, 0),
  ).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerTick,
  )
  expect(
    state.navigationSparseTargetWork.candidateVisitsMaximumObservedPerTick,
  ).toBeLessThanOrEqual(targetCandidateVisitLimit)
  expect(
    state.navigationSparseTargetWork.graphEdgeVisitsMaximumObservedPerTick,
  ).toBeLessThanOrEqual(targetGraphEdgeVisitLimit)
  expect(
    agentWorkCategories.reduce((sum, work) => sum + work.heapOperationsThisTick, 0),
  ).toBeLessThanOrEqual(ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick)
  expect(state.navigationSparseSpawnWork.attachmentHierarchyNodeVisitsThisTick).toBeLessThanOrEqual(
    state.navigationSparseSpawnWork.hierarchyNodeVisitsThisTick,
  )
  expect(state.navigationSparseSpawnWork.attachmentHierarchyNodeVisitsTotal).toBeLessThanOrEqual(
    state.navigationSparseSpawnWork.hierarchyNodeVisitsTotal,
  )
  expect(
    state.navigationSparseSpawnWork.attachmentHierarchyNodeVisitsMaximumObservedPerTick,
  ).toBeLessThanOrEqual(state.navigationSparseSpawnWork.hierarchyNodeVisitsMaximumObservedPerTick)
  for (const work of agentWorkCategories) {
    expect(work.heapOperationsMaximumObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick,
    )
  }
  expect(state.navigationSparseTargetWork.heapOperationsMaximumObservedPerTick).toBeLessThanOrEqual(
    targetHeapOperationLimit,
  )
  expect(state.navigationObstacleRefreshDeferredMarkedCount).toBe(
    state.navigationObstacleRefreshDeferredPromotedCount +
      state.navigationObstacleRefreshDeferredCanceledCount +
      state.navigationObstacleRefreshDeferredPendingCount,
  )
  expect(state.navigationIntentAdmissionDeferredMarkedCount).toBe(
    state.navigationIntentAdmissionDeferredPromotedCount +
      state.navigationIntentAdmissionDeferredCanceledCount +
      state.navigationIntentAdmissionDeferredPendingCount,
  )
  expect(state.navigationIntentAdmissionDeferredQueueOperationCountTotal).toBe(
    state.navigationIntentAdmissionDeferredMarkedCount +
      state.navigationIntentAdmissionDeferredPromotedCount +
      state.navigationIntentAdmissionDeferredCanceledCount,
  )
  expect(state.navigationIntentAdmissionDeferredPromotedCount).toBe(
    state.navigationRefreshAdmissionCountTotal,
  )
  expect(
    state.navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount +
      state.navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount +
      state.navigationIntentAdmissionDeferredPromotedConnectorChangedCount +
      state.navigationIntentAdmissionDeferredPromotedSpawnCount +
      state.navigationIntentAdmissionDeferredPromotedWorldChangedCount,
  ).toBe(state.navigationIntentAdmissionDeferredPromotedCount)
  expect(state.navigationIntentAdmissionDeferredPromotedCountThisTick).toBe(
    state.navigationRefreshAdmissionCountThisTick,
  )
  expect(state.navigationRefreshAdmissionCountThisTick).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
  )
  expect(state.navigationRefreshCandidateInspectionsThisTick).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick,
  )
  expect(state.navigationRefreshCandidateInspectionsMaximumObservedPerTick).toBeLessThanOrEqual(
    ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick,
  )
  expect(state.navigationObstacleRefreshDeferredPromotedCountThisTick).toBeLessThanOrEqual(
    state.navigationRefreshAdmissionCountThisTick,
  )
  expect(state.navigationWorldRefreshPromotedCountThisTick).toBeLessThanOrEqual(
    state.navigationRefreshAdmissionCountThisTick,
  )
  if (state.navigationWorldRefreshPendingCount === 0) {
    expect(state.navigationWorldRefreshMinimumAppliedGeneration).toBe(
      state.collisionWorldGeneration,
    )
  }
}

function publishZombieEscapeSparseTarget(
  state: ZombieEscapeSimulation,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
) {
  for (
    let tick = 0;
    tick < 1_024 &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    tick += 1
  ) {
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
  }
  expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
}

function createCollisionReanchorFixture(seed: number, variant: number) {
  const arena = createZombieEscapeArena(seed)
  arena.obstacleCount = 0
  const state = createZombieEscapeSimulation(arena, seed + 1)
  const world = createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'surface',
        polygon: [
          { x: -6, z: -6 },
          { x: 6, z: -6 },
          { x: 6, z: 6 },
          { x: -6, z: 6 },
        ],
      },
    ],
    playRadius: 7,
    segments: [
      {
        endX: 0,
        endZ: 4,
        halfThickness: 0.1,
        id: 'wall',
        startX: 0,
        startZ: -4,
      },
    ],
  })
  setZombieEscapeCollisionWorld(state, world)
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.x = 3
  state.player.z = 0
  const input = createZombieEscapeControlState()
  publishZombieEscapeSparseTarget(state, input, arena)
  const zombie = spawnZombieEscapeZombie(state, -0.5, 0)
  expect(zombie).toBeGreaterThanOrEqual(0)
  state.zombies.variant[zombie] = variant
  state.zombies.speedScale[zombie] = 0

  for (
    let tick = 0;
    tick < 256 &&
    (state.navigationField.graphSparseTargetUpdate.status === 'pending' ||
      state.navigationIntentPendingCount > 0 ||
      state.navigationIntentAdmissionDeferredPendingCount > 0 ||
      state.zombies.navigationSparseFlowSearchActive[zombie] !== 0);
    tick += 1
  ) {
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
  }
  expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
  expect(state.navigationIntentPendingCount).toBe(0)
  expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
  expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)

  const route = createZombieEscapeSparseCommittedNodeRoute()
  let waypointNode = -1
  for (let node = 0; node < world.navigationGraph.nodeIds.length; node += 1) {
    if (
      world.navigationGraph.x[node]! > 1 &&
      Math.abs(world.navigationGraph.z[node]!) < 2 &&
      sampleZombieEscapeSparseCommittedNodeRoute(state.navigationField, node, false, route) &&
      route.reachable
    ) {
      waypointNode = node
      break
    }
  }
  expect(waypointNode).toBeGreaterThanOrEqual(0)
  return { arena, input, state, waypointNode, zombie }
}

function armCollisionReanchorStall(
  state: ZombieEscapeSimulation,
  zombie: number,
  waypointNode: number,
  collisionRadius: number,
) {
  const acceptedX = -0.1 - collisionRadius - 0.000_1
  state.zombies.speedScale[zombie] = 1.55
  state.zombies.runBlend[zombie] = 1
  state.zombies.navigationIntentHasCached[zombie] = 1
  state.zombies.navigationIntentValid[zombie] = 1
  state.zombies.navigationIntentCommittedRouteGeneration[zombie] =
    state.navigationTargetCommittedRouteGeneration
  state.zombies.navigationIntentWorldGeneration[zombie] = state.collisionWorldGeneration
  state.zombies.navigationReachable[zombie] = 1
  state.zombies.navigationDirectionX[zombie] = 1
  state.zombies.navigationDirectionZ[zombie] = 0
  state.zombies.navigationBlockerBreakable[zombie] = 0
  state.zombies.navigationBlockerObjectId[zombie] = null
  state.zombies.navigationBlockerObjectOrdinal[zombie] = -1
  state.zombies.navigationBlockingDistance[zombie] = Number.POSITIVE_INFINITY
  state.zombies.attackTargetObjectId[zombie] = null
  state.zombies.attackTargetObjectOrdinal[zombie] = -1
  state.zombies.navigationWaypointNode[zombie] = waypointNode
  state.zombies.navigationWaypointFallback[zombie] = 0
  state.navigationTargetRequestedLayerHint =
    state.navigationField.graphSparseTargetUpdate.routeTargetLayerIndex
  state.zombies.vx[zombie] = 0
  state.zombies.vz[zombie] = 0
  state.zombies.x[zombie] = acceptedX
  state.zombies.z[zombie] = state.collisionWorld.navigationGraph.z[waypointNode]!
  state.zombies.navigationSourceCertifiedX[zombie] = state.zombies.x[zombie]!
  state.zombies.navigationSourceCertifiedY[zombie] = state.zombies.y[zombie]!
  state.zombies.navigationSourceCertifiedZ[zombie] = state.zombies.z[zombie]!
  state.zombies.navigationSourceNeedsValidation[zombie] = 0
  return acceptedX
}

describe('Zombie Escape navigation cadence', () => {
  test.each([
    [1_400, ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick],
    [6_400, ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick],
    [1_400, ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick],
    [6_400, ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick],
  ])('caps %i invalid intents to %i fair services per tick', (population, budget) => {
    const active = new Uint8Array(population).fill(1)
    const health = new Float32Array(population).fill(100)
    const navigationConnector = new Int16Array(population).fill(-1)
    const navigationIntentValid = new Uint8Array(population)
    const navigationIntentPending = new Uint8Array(population).fill(1)
    const navigationIntentResolveScheduled = new Uint8Array(population)
    const resolveCounts = new Uint8Array(population)
    const perTickResolveCounts: number[] = []
    const ticksToServicePopulation = Math.ceil(population / budget)
    let cursor = 0

    for (let tick = 0; tick < ticksToServicePopulation; tick += 1) {
      cursor = scheduleZombieEscapeNavigationIntentResolutions(
        active,
        health,
        navigationConnector,
        navigationIntentValid,
        navigationIntentPending,
        cursor,
        navigationIntentResolveScheduled,
        budget,
      )
      const scheduledSlots: number[] = []
      for (let slot = 0; slot < population; slot += 1) {
        if (navigationIntentResolveScheduled[slot] === 0) continue
        scheduledSlots.push(slot)
        resolveCounts[slot] = resolveCounts[slot]! + 1
        navigationIntentValid[slot] = 1
        navigationIntentPending[slot] = 0
      }
      perTickResolveCounts.push(scheduledSlots.length)
      expect(scheduledSlots.length).toBeLessThanOrEqual(budget)
      expect(scheduledSlots[0]).toBe(tick * budget)
      expect(scheduledSlots.at(-1)).toBe(Math.min(population - 1, tick * budget + budget - 1))
    }

    expect(Math.max(...perTickResolveCounts)).toBe(budget)
    expect([...resolveCounts].every((count) => count === 1)).toBe(true)
    expect(cursor).toBe(population % budget === 0 ? 0 : population - (population % budget))
  })

  test('first-services and completes 1400 multi-slice searches within round-robin bounds', () => {
    const population = 1_400
    const budget = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
    const slicesPerSearch = 3
    const active = new Uint8Array(population).fill(1)
    const health = new Float32Array(population).fill(100)
    const navigationConnector = new Int16Array(population).fill(-1)
    const navigationIntentValid = new Uint8Array(population)
    const navigationIntentPending = new Uint8Array(population).fill(1)
    const navigationIntentResolveScheduled = new Uint8Array(population)
    const remainingSlices = new Uint8Array(population).fill(slicesPerSearch)
    const firstServiceTick = new Int32Array(population).fill(-1)
    const completionTick = new Int32Array(population).fill(-1)
    const roundTicks = Math.ceil(population / budget)
    let cursor = 0

    for (let tick = 1; tick <= roundTicks * slicesPerSearch; tick += 1) {
      cursor = scheduleZombieEscapeNavigationIntentResolutions(
        active,
        health,
        navigationConnector,
        navigationIntentValid,
        navigationIntentPending,
        cursor,
        navigationIntentResolveScheduled,
        budget,
      )
      for (let slot = 0; slot < population; slot += 1) {
        if (navigationIntentResolveScheduled[slot] === 0) continue
        if (firstServiceTick[slot] < 0) firstServiceTick[slot] = tick
        remainingSlices[slot] = remainingSlices[slot]! - 1
        if (remainingSlices[slot] !== 0) continue
        completionTick[slot] = tick
        navigationIntentValid[slot] = 1
        navigationIntentPending[slot] = 0
      }
    }

    expect(Math.max(...firstServiceTick)).toBe(roundTicks)
    expect(Math.max(...completionTick)).toBe(roundTicks * slicesPerSearch)
    expect([...firstServiceTick].every((tick) => tick > 0)).toBe(true)
    expect([...completionTick].every((tick) => tick > 0)).toBe(true)
    expect([...remainingSlices].every((remaining) => remaining === 0)).toBe(true)
  })

  test('pins eight slices to attachment lease holders and admits 1400 without starvation', () => {
    const population = 1_400
    const agentLeaseCapacity = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
    const fieldSingletonLeaseCount = 1
    const spawnLeaseCount = 1
    const fixedAttachmentLeaseCount = fieldSingletonLeaseCount + spawnLeaseCount
    const attachmentLeaseCapacity = agentLeaseCapacity + fixedAttachmentLeaseCount
    const slicesPerSearch = 3
    const active = new Uint8Array(population).fill(1)
    const health = new Float32Array(population).fill(100)
    const navigationConnector = new Int16Array(population).fill(-1)
    const navigationIntentValid = new Uint8Array(population)
    const navigationIntentPending = new Uint8Array(population).fill(1)
    const navigationIntentResolveEligible = new Uint8Array(population)
    const navigationIntentResolveScheduled = new Uint8Array(population)
    const attachmentLeaseOwner = new Uint8Array(population)
    const remainingSlices = new Uint8Array(population).fill(slicesPerSearch)
    const firstServiceTick = new Int32Array(population).fill(-1)
    const completionTick = new Int32Array(population).fill(-1)
    const batchCount = Math.ceil(population / agentLeaseCapacity)
    let cursor = 0
    let agentLeaseCount = 0
    let completedCount = 0
    let maximumAttachmentLeaseCount = fixedAttachmentLeaseCount

    for (let tick = 1; tick <= batchCount * slicesPerSearch; tick += 1) {
      navigationIntentResolveEligible.fill(0)
      const agentLeasesWereFull = agentLeaseCount === agentLeaseCapacity
      let availableAgentLeases = agentLeaseCapacity - agentLeaseCount
      for (let offset = 0; offset < population; offset += 1) {
        const slot = (cursor + offset) % population
        if (navigationIntentPending[slot] === 0) continue
        if (attachmentLeaseOwner[slot] !== 0) {
          navigationIntentResolveEligible[slot] = 1
        } else if (availableAgentLeases > 0) {
          navigationIntentResolveEligible[slot] = 1
          availableAgentLeases -= 1
        }
      }

      cursor = scheduleZombieEscapeNavigationIntentResolutions(
        active,
        health,
        navigationConnector,
        navigationIntentValid,
        navigationIntentPending,
        cursor,
        navigationIntentResolveScheduled,
        agentLeaseCapacity,
        navigationIntentResolveEligible,
      )
      let scheduledCount = 0
      for (let slot = 0; slot < population; slot += 1) {
        if (navigationIntentResolveScheduled[slot] === 0) continue
        scheduledCount += 1
        if (agentLeasesWereFull) expect(attachmentLeaseOwner[slot]).toBe(1)
        if (attachmentLeaseOwner[slot] === 0) {
          expect(agentLeaseCount).toBeLessThan(agentLeaseCapacity)
          attachmentLeaseOwner[slot] = 1
          agentLeaseCount += 1
          firstServiceTick[slot] = tick
        }
        remainingSlices[slot] = remainingSlices[slot]! - 1
        if (remainingSlices[slot] !== 0) continue
        attachmentLeaseOwner[slot] = 0
        agentLeaseCount -= 1
        navigationIntentValid[slot] = 1
        navigationIntentPending[slot] = 0
        completionTick[slot] = tick
        completedCount += 1
      }

      const attachmentLeaseCount = agentLeaseCount + fixedAttachmentLeaseCount
      maximumAttachmentLeaseCount = Math.max(maximumAttachmentLeaseCount, attachmentLeaseCount)
      expect(agentLeaseCount).toBeLessThanOrEqual(agentLeaseCapacity)
      expect(attachmentLeaseCount).toBeLessThanOrEqual(attachmentLeaseCapacity)
      if (completedCount < population) expect(scheduledCount).toBeGreaterThan(0)
    }

    expect(agentLeaseCapacity).toBe(8)
    expect(attachmentLeaseCapacity).toBe(10)
    expect(maximumAttachmentLeaseCount).toBe(attachmentLeaseCapacity)
    expect(completedCount).toBe(population)
    expect(agentLeaseCount).toBe(0)
    expect(Math.max(...firstServiceTick)).toBe((batchCount - 1) * slicesPerSearch + 1)
    expect(Math.max(...completionTick)).toBe(batchCount * slicesPerSearch)
    expect([...remainingSlices].every((remaining) => remaining === 0)).toBe(true)
  })

  test('reserves eight positive agent slices beside sustained target and spawn work for 1400 agents', () => {
    const population = 1_400
    const agentSlicesPerTick = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
    const spawnSlicesPerTick = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchSpawnSlicesPerTick
    const minimumWork = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMinimumWorkUnitsPerAgentSlice
    const active = new Uint8Array(population).fill(1)
    const health = new Float32Array(population).fill(100)
    const navigationConnector = new Int16Array(population).fill(-1)
    const navigationIntentValid = new Uint8Array(population)
    const navigationIntentPending = new Uint8Array(population).fill(1)
    const navigationIntentResolveScheduled = new Uint8Array(population)
    const remainingSlices = new Uint8Array(population).fill(3)
    const firstServiceTick = new Int32Array(population).fill(-1)
    const lastProgressTick = new Uint32Array(population)
    const dimensions = [
      {
        maximumPerAgentSlice:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerAgentSlice,
        maximumPerTick:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerTick,
      },
      {
        maximumPerAgentSlice:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice,
        maximumPerTick:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick,
      },
      {
        maximumPerAgentSlice:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice,
        maximumPerTick:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick,
      },
      {
        maximumPerAgentSlice:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerAgentSlice,
        maximumPerTick: ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick,
      },
      {
        maximumPerAgentSlice:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerAgentSlice,
        maximumPerTick:
          ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerTick,
      },
    ] as const
    const targetWorkTotal = new Float64Array(dimensions.length)
    const spawnWorkTotal = new Float64Array(dimensions.length)
    const roundTicks = Math.ceil(population / agentSlicesPerTick)
    let cursor = 0
    let spawnSlicesUntilCompletion = 4
    let spawnCompletionCount = 0
    let maximumAgentNoProgressAge = 0

    for (let tick = 1; tick <= roundTicks * 3; tick += 1) {
      const consumed = new Float64Array(dimensions.length)
      const reservedCommonSlices = agentSlicesPerTick + spawnSlicesPerTick
      for (let dimension = 0; dimension < dimensions.length; dimension += 1) {
        const limits = dimensions[dimension]!
        const targetBudget = resolveZombieEscapeSparseSharedWorkBudgetLimit(
          limits.maximumPerTick,
          consumed[dimension]!,
          reservedCommonSlices,
        )
        expect(targetBudget).toBeGreaterThan(0)
        consumed[dimension] = consumed[dimension]! + targetBudget
        targetWorkTotal[dimension] = targetWorkTotal[dimension]! + targetBudget
      }

      cursor = scheduleZombieEscapeNavigationIntentResolutions(
        active,
        health,
        navigationConnector,
        navigationIntentValid,
        navigationIntentPending,
        cursor,
        navigationIntentResolveScheduled,
        agentSlicesPerTick,
      )
      const scheduledSlots: number[] = []
      for (let slot = 0; slot < population; slot += 1) {
        if (navigationIntentResolveScheduled[slot] !== 0) scheduledSlots.push(slot)
      }
      expect(scheduledSlots).toHaveLength(agentSlicesPerTick)
      for (let index = 0; index < scheduledSlots.length; index += 1) {
        const slot = scheduledSlots[index]!
        const remainingAgentSlices = scheduledSlots.length - index
        for (let dimension = 0; dimension < dimensions.length; dimension += 1) {
          const limits = dimensions[dimension]!
          const agentBudget = resolveZombieEscapeSparseAgentWorkBudgetLimit(
            limits.maximumPerAgentSlice,
            limits.maximumPerTick,
            consumed[dimension]!,
            remainingAgentSlices,
            spawnSlicesPerTick,
          )
          expect(agentBudget).toBeGreaterThanOrEqual(minimumWork)
          consumed[dimension] = consumed[dimension]! + minimumWork
        }
        if (firstServiceTick[slot] < 0) firstServiceTick[slot] = tick
        lastProgressTick[slot] = tick
        remainingSlices[slot] = remainingSlices[slot]! - 1
        if (remainingSlices[slot] === 0) {
          navigationIntentValid[slot] = 1
          navigationIntentPending[slot] = 0
        }
      }

      for (let dimension = 0; dimension < dimensions.length; dimension += 1) {
        const limits = dimensions[dimension]!
        const spawnBudget = resolveZombieEscapeSparseAgentWorkBudgetLimit(
          limits.maximumPerAgentSlice,
          limits.maximumPerTick,
          consumed[dimension]!,
          1,
          0,
        )
        expect(spawnBudget).toBeGreaterThanOrEqual(minimumWork)
        consumed[dimension] = consumed[dimension]! + minimumWork
        spawnWorkTotal[dimension] = spawnWorkTotal[dimension]! + minimumWork
        expect(consumed[dimension]).toBe(limits.maximumPerTick)
      }
      spawnSlicesUntilCompletion -= 1
      if (spawnSlicesUntilCompletion === 0) {
        spawnCompletionCount += 1
        spawnSlicesUntilCompletion = 4
      }
      for (let slot = 0; slot < population; slot += 1) {
        if (navigationIntentValid[slot] !== 0) continue
        maximumAgentNoProgressAge = Math.max(
          maximumAgentNoProgressAge,
          tick - lastProgressTick[slot]!,
        )
      }
    }

    expect(Math.max(...firstServiceTick)).toBe(roundTicks)
    expect(ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerAgentSlice).toBe(
      32,
    )
    expect(ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick).toBe(256)
    expect(maximumAgentNoProgressAge).toBeLessThanOrEqual(roundTicks)
    expect([...remainingSlices].every((remaining) => remaining === 0)).toBe(true)
    expect([...targetWorkTotal].every((work) => work > 0)).toBe(true)
    expect([...spawnWorkTotal].every((work) => work === roundTicks * 3)).toBe(true)
    expect(spawnCompletionCount).toBeGreaterThan(0)
  })

  test('admits a wave spawn from a cached strict-region witness without spawn search work', () => {
    const arena = createZombieEscapeArena(91_035)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_036)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -24, z: -24 },
            { x: 24, z: -24 },
            { x: 24, z: 24 },
            { x: -24, z: 24 },
          ],
        },
      ],
      playRadius: 26,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.player.x = 0
    state.player.y = 0
    state.player.z = 0
    state.waveState = 'escape'
    state.waveSpawnRemaining = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2
      const slot = spawnZombieEscapeZombie(state, Math.sin(angle) * 8, Math.cos(angle) * 8)
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
    }
    state.waveState = 'active'
    state.waveSpawnRemaining = 1
    state.waveSpawnTimerSeconds = 0
    const spawnDemandCount = state.navigationIntentDemandSpawnCount
    const attachmentSearchCount = state.navigationField.graphAttachmentFullSearchCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick).toBe(0)
    expect(state.navigationSparseSearchAgentServiceSliceCountThisTick).toBe(0)
    expect(state.navigationSparseSearchAgentProgressSliceCountThisTick).toBe(0)
    expect(state.navigationSparseSearchSpawnServiceSliceCountThisTick).toBe(0)
    expect(state.navigationSparseSearchSpawnProgressSliceCountThisTick).toBe(0)
    for (
      let tick = 0;
      tick < 512 && state.navigationSparseSpawnSearchCompletedCount === 0;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    const anchoredSpawn = 8
    expect(state.navigationSparseSpawnSearchCompletedCount).toBe(1)
    expect(state.navigationSparseSpawnProbeMaximumObservedPerAdmission).toBeLessThanOrEqual(64)
    expect(state.navigationSparseSearchSpawnServiceSliceCountTotal).toBe(0)
    expect(state.navigationSparseSearchSpawnProgressSliceCountTotal).toBe(0)
    expect(state.navigationIntentDemandSpawnCount).toBe(spawnDemandCount)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
    expect(state.zombies.navigationIntentHasCached[anchoredSpawn]).toBe(1)
    expect(state.zombies.navigationIntentValid[anchoredSpawn]).toBe(1)
    expect(state.zombies.navigationIntentPending[anchoredSpawn]).toBe(0)
    expect(state.zombies.navigationWaypointNode[anchoredSpawn]).toBeGreaterThanOrEqual(0)
    expect(state.zombies.navigationIntentCommittedRouteGeneration[anchoredSpawn]).toBe(
      state.navigationTargetCommittedRouteGeneration,
    )
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expectNavigationIntentConservation(state)
  })

  test('retries bounded spawn probes without a dependency search while the target is pending', () => {
    const arena = createZombieEscapeArena(91_045)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_046)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -24, z: -24 },
            { x: 24, z: -24 },
            { x: 24, z: 24 },
            { x: -24, z: 24 },
          ],
        },
      ],
      playRadius: 26,
      segments: Array.from({ length: 32 }, (_, index) => ({
        endX: -9.6 + (index % 16) * 1.2,
        endZ: -10 + Math.floor(index / 16) * 1.4,
        halfThickness: 0.06,
        id: `spawn-wait-wall-${index}`,
        startX: -10 + (index % 16) * 1.2,
        startZ: -10 + Math.floor(index / 16) * 1.4,
      })),
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.player.x = 12
    state.player.y = 0
    state.player.z = 12
    state.waveState = 'active'
    state.waveSpawnRemaining = 1
    state.waveSpawnTimerSeconds = 0
    const input = createZombieEscapeControlState()
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseSpawnSearchActive).toBe(false)
    expect(state.navigationSparseSpawnSearchDependencyWaiting).toBe(false)
    expect(state.navigationSparseSpawnSearchStartedCount).toBe(0)
    expect(state.navigationSparseSpawnSearchCompletedCount).toBe(0)
    const spawnServiceSlices = state.navigationSparseSearchSpawnServiceSliceCountTotal
    const spawnProgressSlices = state.navigationSparseSearchSpawnProgressSliceCountTotal
    const targetServiceSlices = state.navigationSparseSearchTargetServiceSliceCountTotal
    const targetProgressSlices = state.navigationSparseSearchTargetProgressSliceCountTotal
    let pendingTicks = 0
    let observedReadyTarget = false

    for (
      let tick = 0;
      tick < 1_400 && state.navigationSparseSpawnSearchCompletedCount === 0;
      tick += 1
    ) {
      state.player.y = tick % 2 === 0 ? 0.05 : 0
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (state.navigationField.graphSparseTargetUpdate.status === 'ready') {
        observedReadyTarget = true
      } else {
        pendingTicks += 1
      }
      expect(state.navigationSparseSearchSpawnServiceSliceCountTotal).toBe(spawnServiceSlices)
      expect(state.navigationSparseSearchSpawnProgressSliceCountTotal).toBe(spawnProgressSlices)
      expect(state.navigationSparseSearchSpawnNoProgressAgeTicks).toBe(0)
      expect(state.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved).toBe(0)
      expect(state.navigationSparseSearchTargetServiceSliceCountThisTick).toBeLessThanOrEqual(1)
      expect(state.navigationSparseSearchTargetProgressSliceCountThisTick).toBeLessThanOrEqual(1)
    }

    const targetServiceDelta =
      state.navigationSparseSearchTargetServiceSliceCountTotal - targetServiceSlices
    const targetProgressDelta =
      state.navigationSparseSearchTargetProgressSliceCountTotal - targetProgressSlices
    expect(pendingTicks).toBeGreaterThan(0)
    expect(observedReadyTarget).toBe(true)
    expect(state.navigationSparseSpawnSearchStartedCount).toBe(1)
    expect(state.navigationSparseSpawnSearchCompletedCount).toBe(1)
    expect(state.navigationSparseSpawnProbeMaximumObservedPerAdmission).toBeLessThanOrEqual(64)
    expect(state.navigationIntentDemandSpawnCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.zombies.navigationIntentValid[0]).toBe(1)
    expect(state.zombies.navigationWaypointNode[0]).toBeGreaterThanOrEqual(0)
    expect(targetServiceDelta).toBeGreaterThan(0)
    expect(targetServiceDelta).toBeLessThanOrEqual(1_400)
    expect(targetProgressDelta).toBeGreaterThan(0)
    expect(targetProgressDelta).toBeLessThanOrEqual(targetServiceDelta)
    expectNavigationIntentConservation(state)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expectNavigationIntentConservation(state)
  })

  test('rejects manual admissions during a long target wait and admits anchored agents after publication', () => {
    const arena = createZombieEscapeArena(91_037)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_038)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -14, z: -14 },
            { x: 14, z: -14 },
            { x: 14, z: 14 },
            { x: -14, z: 14 },
          ],
        },
      ],
      playRadius: 16,
      segments: Array.from({ length: 32 }, (_, index) => ({
        endX: -9.6 + (index % 16) * 1.2,
        endZ: -10 + Math.floor(index / 16) * 1.4,
        halfThickness: 0.06,
        id: `target-build-wall-${index}`,
        startX: -10 + (index % 16) * 1.2,
        startZ: -10 + Math.floor(index / 16) * 1.4,
      })),
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 12
    state.player.y = 0
    state.player.z = 12
    const input = createZombieEscapeControlState()
    const rejectedSlots = Array.from({ length: 9 }, (_, index) =>
      spawnZombieEscapeZombie(state, -12 + index * 0.08, -12),
    )
    expect(rejectedSlots.every((slot) => slot === -1)).toBe(true)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)

    let targetPublicationTicks = 0
    while (state.navigationTargetCommittedRouteGeneration === 0 && targetPublicationTicks < 512) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      targetPublicationTicks += 1
      expect(state.navigationSparseSearchTargetServiceSliceCountThisTick).toBe(1)
      expect(state.navigationSparseSearchTargetProgressSliceCountThisTick).toBe(1)
      expectNavigationIntentConservation(state)
    }
    expect(targetPublicationTicks).toBeGreaterThan(5)
    expect(targetPublicationTicks).toBeLessThan(512)
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
    const admittedSlots = Array.from({ length: 9 }, (_, index) =>
      spawnZombieEscapeZombie(state, -12 + index * 0.08, -12),
    )
    expect(admittedSlots.every((slot) => slot >= 0)).toBe(true)
    expect(
      admittedSlots.every(
        (slot) => inspectZombieEscapeCommittedNavigationAction(state, slot) !== 'none',
      ),
    ).toBe(true)
    expect(state.navigationIntentPendingCount).toBe(0)
    expectNavigationIntentConservation(state)
  })

  test('applies repeated obstacle deltas with one logical revision and no world or flow recompilation', () => {
    const arena = createZombieEscapeArena(91_039)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_040)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 4,
          centerZ: -4,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'table-a:footprint',
          objectId: 'table-a',
          rotation: 0,
        },
        {
          breakable: true,
          centerX: 6,
          centerZ: -4,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'table-b:footprint',
          objectId: 'table-b',
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -14, z: -14 },
            { x: 14, z: -14 },
            { x: 14, z: 14 },
            { x: -14, z: 14 },
          ],
        },
      ],
      playRadius: 16,
      segments: Array.from({ length: 32 }, (_, index) => ({
        endX: -9.6 + (index % 16) * 1.2,
        endZ: -10 + Math.floor(index / 16) * 1.4,
        halfThickness: 0.06,
        id: `delta-wall-${index}`,
        startX: -10 + (index % 16) * 1.2,
        startZ: -10 + Math.floor(index / 16) * 1.4,
      })),
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 12
    state.player.z = 12
    const input = createZombieEscapeControlState()
    for (let index = 0; index < 8; index += 1) {
      const slot = spawnZombieEscapeZombie(state, -12 + index * 0.08, -12)
      state.zombies.speedScale[slot] = 0
    }
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const graph = state.collisionWorld.navigationGraph
    const layers = state.collisionWorld.navigationLayers
    const strictDistances = state.navigationField.graphStrictDistances
    const strictNextNodes = state.navigationField.graphStrictNextNodes
    const targetCandidateNodes = state.navigationField.graphTargetCandidateNodes
    const activeSearchCount = [...state.zombies.navigationSparseFlowSearchActive].filter(
      (active) => active !== 0,
    ).length
    const collisionWorldGeneration = state.collisionWorldGeneration
    const navigationWorldRevision = state.navigationWorldRevision
    const navigationTargetCommittedRouteGeneration = state.navigationTargetCommittedRouteGeneration
    const navigationTargetRequestedRevision = state.navigationTargetRequestedRevision
    const routeInvalidationCount =
      state.navigationField.graphSparseTargetUpdate.routeInvalidationCount
    const searchInvalidationCount = state.navigationSparseSearchInvalidatedCount
    const visibilityWorkTotal =
      state.navigationVisibilityWork.colliderCandidateVisitsTotal +
      state.navigationVisibilityWork.colliderHierarchyNodeVisitsTotal +
      state.navigationVisibilityWork.supportHierarchyNodeVisitsTotal +
      state.navigationVisibilityWork.supportHoleVisitsTotal +
      state.navigationVisibilityWork.supportItemVisitsTotal +
      state.navigationVisibilityWork.supportRingEdgeVisitsTotal +
      state.navigationVisibilityWork.supportRingHierarchyNodeVisitsTotal

    expect({ ...applyZombieEscapeObstacleDelta(state, 'table-a') }).toEqual({
      applied: true,
      appliedRevision: 1,
      objectId: 'table-a',
      requestedRevision: 1,
    })
    expect(state.collisionWorldGeneration).toBe(collisionWorldGeneration)
    expect(state.navigationWorldRevision).toBe(navigationWorldRevision + 1)
    expect(state.navigationTargetCommittedRouteGeneration).toBe(
      navigationTargetCommittedRouteGeneration,
    )
    expect(state.navigationTargetRequestedRevision).toBe(navigationTargetRequestedRevision)
    expect(state.navigationField.graphSparseTargetUpdate.routeInvalidationCount).toBe(
      routeInvalidationCount,
    )
    expect(state.navigationSparseSearchInvalidatedCount).toBe(searchInvalidationCount)
    expect(state.collisionWorld.navigationGraph).toBe(graph)
    expect(state.collisionWorld.navigationLayers).toBe(layers)
    expect(state.navigationField.graphStrictDistances).toBe(strictDistances)
    expect(state.navigationField.graphStrictNextNodes).toBe(strictNextNodes)
    expect(state.navigationField.graphTargetCandidateNodes).toBe(targetCandidateNodes)
    expect(
      state.navigationVisibilityWork.colliderCandidateVisitsTotal +
        state.navigationVisibilityWork.colliderHierarchyNodeVisitsTotal +
        state.navigationVisibilityWork.supportHierarchyNodeVisitsTotal +
        state.navigationVisibilityWork.supportHoleVisitsTotal +
        state.navigationVisibilityWork.supportItemVisitsTotal +
        state.navigationVisibilityWork.supportRingEdgeVisitsTotal +
        state.navigationVisibilityWork.supportRingHierarchyNodeVisitsTotal,
    ).toBe(visibilityWorkTotal)
    expect(state.obstacleDeltaMetrics.objectMaskWrites.total).toBe(2)
    expect(state.obstacleDeltaMetrics.viewRevisionAdvanceCount).toBe(2)
    expect(state.obstacleDeltaMetrics.objectLookupComparisons.total).toBeGreaterThan(0)
    expect(state.obstacleDeltaMetrics.objectLookupComparisons.total).toBeLessThanOrEqual(64)
    expect(state.obstacleDeltaMetrics.worldCompileCount.total).toBe(0)
    expect(state.obstacleDeltaMetrics.fullArrayClearCount.total).toBe(0)
    expect(state.obstacleDeltaMetrics.allocationCount.total).toBe(0)

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseSearchInvalidatedCount - searchInvalidationCount).toBe(
      Math.min(
        activeSearchCount,
        ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
      ),
    )

    const generationAfterFirstDelta = state.collisionWorldGeneration
    const invalidationsAfterFirstDelta = state.navigationSparseSearchInvalidatedCount
    expect({ ...applyZombieEscapeObstacleDelta(state, 'table-a') }).toEqual({
      applied: false,
      appliedRevision: 1,
      objectId: 'table-a',
      requestedRevision: 2,
    })
    expect(state.collisionWorldGeneration).toBe(generationAfterFirstDelta)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(invalidationsAfterFirstDelta)
    expect(state.obstacleDeltaMetrics.requestCount).toBe(2)
    expect(state.obstacleDeltaMetrics.appliedCount).toBe(1)
    expect(state.obstacleDeltaMetrics.unchangedCount).toBe(1)
    expect(state.obstacleDeltaMetrics.revisionAdvanceCount).toBe(1)
    expect(state.obstacleDeltaMetrics.objectMaskWrites.total).toBe(2)

    expect({ ...applyZombieEscapeObstacleDelta(state, 'table-b') }).toEqual({
      applied: true,
      appliedRevision: 2,
      objectId: 'table-b',
      requestedRevision: 3,
    })
    expect(state.collisionWorldGeneration).toBe(generationAfterFirstDelta)
    expect(state.obstacleDeltaMetrics.requestCount).toBe(
      state.obstacleDeltaMetrics.appliedCount + state.obstacleDeltaMetrics.unchangedCount,
    )
    expect(state.obstacleDeltaMetrics.revisionAdvanceCount).toBe(2)
    expect(state.obstacleDeltaMetrics.objectMaskWrites.total).toBe(4)
    expect(state.obstacleDeltaMetrics.worldCompileCount.total).toBe(0)
    expect(state.obstacleDeltaMetrics.fullArrayClearCount.total).toBe(0)
    expect(state.obstacleDeltaMetrics.allocationCount.total).toBe(0)
    expect(state.collisionWorld.navigationGraph).toBe(graph)
    expect(state.collisionWorld.navigationLayers).toBe(layers)
    expect(state.navigationField.graphStrictDistances).toBe(strictDistances)
  })

  test.each([
    14,
    ZOMBIE_ESCAPE_CAPACITY.zombies,
  ])('retains %i committed plans when a topology-preserving blocker is removed', (rosterSize) => {
    const arena = createZombieEscapeArena(91_041 + rosterSize)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_105 + rosterSize)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'table:footprint',
          objectId: 'table',
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -16, z: -16 },
            { x: 16, z: -16 },
            { x: 16, z: 16 },
            { x: -16, z: 16 },
          ],
        },
      ],
      playRadius: 18,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 12
    state.player.y = 0
    state.player.z = 12
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const slots = Array.from({ length: rosterSize }, (_, index) => {
      const angle = (index / rosterSize) * Math.PI * 2
      const slot = spawnZombieEscapeZombie(state, Math.sin(angle) * 10, Math.cos(angle) * 10)
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
      return slot
    })
    for (
      let tick = 0;
      tick < 512 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.navigationIntentPendingCount > 0 ||
        slots.some((slot) => state.zombies.navigationIntentValid[slot] === 0));
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)

    const tableOrdinal = state.collisionWorld.objectCatalog.objectIds.indexOf('table')
    expect(tableOrdinal).toBeGreaterThanOrEqual(0)
    for (const slot of slots) {
      state.zombies.navigationBlockerBreakable[slot] = 1
      state.zombies.navigationBlockerObjectId[slot] = 'table'
      state.zombies.navigationBlockerObjectOrdinal[slot] = tableOrdinal
    }
    const committedActions = slots.map((slot) =>
      inspectZombieEscapeCommittedNavigationAction(state, slot),
    )
    const issuedBeforeDelta = state.navigationIntentIssuedCount
    const startedBeforeDelta = state.navigationSparseSearchStartedCount
    const cachedDemandBeforeDelta = state.navigationIntentDemandCachedAnchorLostCount
    expect(applyZombieEscapeObstacleDelta(state, 'table').applied).toBe(true)
    expect(state.navigationObstacleRefreshDeferredMarkedCount).toBe(0)
    expect(state.navigationObstacleRefreshDiscoveryRemainingSlotCount).toBe(0)
    expect(state.navigationObstacleRefreshDeferredMarkedCount).toBe(0)
    expect(state.navigationObstacleRefreshDeferredPromotedCount).toBe(0)
    expect(state.navigationObstacleRefreshDeferredCanceledCount).toBe(0)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforeDelta)
    expect(state.navigationSparseSearchStartedCount).toBe(startedBeforeDelta)
    expect(state.navigationIntentDemandCachedAnchorLostCount).toBe(cachedDemandBeforeDelta)
    expect(slots.every((slot) => state.zombies.navigationBlockerObjectId[slot] === null)).toBe(true)
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expect(slots.map((slot) => inspectZombieEscapeCommittedNavigationAction(state, slot))).toEqual(
      committedActions,
    )
    expectNavigationIntentConservation(state)
  })

  test('drains 1400 mixed removed-blocker and latest-world revisions with bounded inspections', () => {
    const population = 1_400
    const baseWorld = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'table:footprint',
          objectId: 'table',
          rotation: 0,
        },
      ],
      playRadius: 18,
    })
    const world = createZombieEscapeCollisionWorldActiveView(baseWorld)
    const delta = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'table', delta)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, delta)).toBe('changed')
    const tableOrdinal = world.objectCatalog.objectIds.indexOf('table')
    const active = new Uint8Array(population).fill(1)
    const health = new Float32Array(population).fill(100)
    const connector = new Int16Array(population).fill(-1)
    const worldRevisionBySlot = new Uint32Array(population)
    const blockerOrdinal = new Int32Array(population).fill(tableOrdinal)
    const attackOrdinal = new Int32Array(population).fill(-1)
    const inspection: ZombieEscapeNavigationRefreshInspectionState = {
      cursor: 0,
      inspections: 0,
      obstacleRemaining: population,
      slot: -1,
      targetsRemovedObstacle: false,
      worldRemaining: population,
    }
    let worldRevision = 1
    let serviced = 0
    let mixed = 0
    let ticks = 0
    while (
      ticks < 2_000 &&
      (inspection.obstacleRemaining > 0 ||
        inspection.worldRemaining > 0 ||
        blockerOrdinal.some((ordinal) => ordinal >= 0) ||
        worldRevisionBySlot.some((revision) => revision !== worldRevision))
    ) {
      if (ticks === 25 || ticks === 75) {
        worldRevision += 1
        inspection.worldRemaining = population
      }
      let admissions = 0
      let inspections = 0
      while (
        admissions < ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick &&
        inspections < ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick
      ) {
        const found = inspectZombieEscapeNavigationRefreshCandidates(
          world,
          active,
          health,
          connector,
          worldRevisionBySlot,
          worldRevision,
          blockerOrdinal,
          attackOrdinal,
          inspection,
          Math.min(
            8,
            ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick -
              inspections,
          ),
        )
        inspections += inspection.inspections
        if (!found) {
          if (inspection.obstacleRemaining > 0 || inspection.worldRemaining > 0) continue
          break
        }
        const slot = inspection.slot
        const hadBlocker = blockerOrdinal[slot]! >= 0
        const hadStaleWorld = worldRevisionBySlot[slot] !== worldRevision
        if (hadBlocker && hadStaleWorld) mixed += 1
        blockerOrdinal[slot] = -1
        worldRevisionBySlot[slot] = worldRevision
        admissions += 1
        serviced += 1
      }
      expect(admissions).toBeLessThanOrEqual(8)
      expect(inspections).toBeLessThanOrEqual(
        ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick,
      )
      ticks += 1
    }

    expect(ticks).toBeLessThan(2_000)
    expect(serviced).toBeGreaterThanOrEqual(population)
    expect(mixed).toBeGreaterThan(0)
    expect(inspection.obstacleRemaining).toBe(0)
    expect(inspection.worldRemaining).toBe(0)
    expect(blockerOrdinal.every((ordinal) => ordinal < 0)).toBe(true)
    expect(worldRevisionBySlot.every((revision) => revision === worldRevision)).toBe(true)
  })

  test('holds a wall-end refresh without drift for one 1400-agent admission round', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    const waypointX = world.navigationGraph.x[0]!
    const waypointZ = world.navigationGraph.z[0]!
    const arrivalRadius = Math.max(0.08, world.agentRadius * 0.5)
    const sample = createFlowSample()
    let x = waypointX + arrivalRadius * 0.5
    let z = waypointZ
    const initialX = x
    const initialZ = z
    const deferredTicks = Math.ceil(
      1_400 / ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )

    for (let tick = 0; tick < deferredTicks; tick += 1) {
      writeZombieEscapeDeferredNavigationDirection(
        'refresh',
        world.agentRadius,
        x,
        z,
        waypointX,
        waypointZ,
        sample,
      )
      expect(sample.x).toBe(0)
      expect(sample.z).toBe(0)
      x += sample.x * (1 / 60)
      z += sample.z * (1 / 60)
    }

    expect(deferredTicks).toBe(175)
    expect(x).toBe(initialX)
    expect(z).toBe(initialZ)
    writeZombieEscapeDeferredNavigationDirection(
      'pending',
      world.agentRadius,
      waypointX + arrivalRadius * 2,
      waypointZ,
      waypointX,
      waypointZ,
      sample,
    )
    expect(sample.x).toBe(-1)
    expect(sample.z).toBe(0)
    writeZombieEscapeDeferredNavigationDirection(
      'pending',
      world.agentRadius,
      x,
      z,
      waypointX,
      waypointZ,
      sample,
    )
    expect(sample.x).toBe(0)
    expect(sample.z).toBe(0)
  })

  test('caps sparse agent work at eight slices while clear live goals bypass searches', () => {
    const arena = createZombieEscapeArena(91_023)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_024)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -12, z: -12 },
            { x: 12, z: -12 },
            { x: 12, z: 12 },
            { x: -12, z: 12 },
          ],
        },
      ],
      playRadius: 14,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const rosterSize = 14
    const slots = Array.from({ length: rosterSize }, (_, spawnOrdinal) => {
      const angle = (spawnOrdinal / rosterSize) * Math.PI * 2
      const slot = spawnZombieEscapeZombie(state, Math.sin(angle) * 8, Math.cos(angle) * 8)
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
      return slot
    })
    const startedCount = state.navigationSparseSearchStartedCount
    const completedCount = state.navigationSparseSearchCompletedCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseSearchStartedCount).toBe(startedCount)
    expect(state.navigationSparseSearchCompletedCount).toBe(completedCount)
    expect(state.navigationIntentResolveCountThisTick).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationIntentFirstServiceCount).toBe(0)
    expect(state.navigationIntentUnservicedPendingCount).toBe(0)
    expect(state.navigationIntentOldestUnservicedAgeTicks).toBe(0)
    expect(state.navigationSparseSearchSupportPredicatesThisTick).toBe(
      state.navigationSparseTargetWork.supportPredicatesThisTick +
        state.navigationSparseFlowSearchWork.supportPredicatesThisTick +
        state.navigationSparseCachedFollowWork.supportPredicatesThisTick +
        state.navigationSparseSpawnWork.supportPredicatesThisTick,
    )
    expect(
      state.navigationVisibilityWork.supportHoleVisitsThisTick +
        state.navigationVisibilityWork.supportRingEdgeVisitsThisTick,
    ).toBeLessThanOrEqual(state.navigationSparseSearchSupportPredicatesThisTick)
    expect(
      state.navigationVisibilityWork.supportHierarchyNodeVisitsThisTick +
        state.navigationVisibilityWork.supportRingHierarchyNodeVisitsThisTick +
        state.navigationVisibilityWork.colliderHierarchyNodeVisitsThisTick,
    ).toBeLessThanOrEqual(state.navigationSparseSearchHierarchyNodeVisitsThisTick)
    expect(
      state.navigationVisibilityWork.supportItemVisitsThisTick +
        state.navigationVisibilityWork.colliderCandidateVisitsThisTick,
    ).toBeLessThanOrEqual(state.navigationSparseSearchCandidateVisitsThisTick)
    expect(state.navigationSparseSearchCollisionPredicatesThisTick).toBe(
      state.navigationSparseTargetWork.collisionPredicatesThisTick +
        state.navigationSparseFlowSearchWork.collisionPredicatesThisTick +
        state.navigationSparseCachedFollowWork.collisionPredicatesThisTick +
        state.navigationSparseSpawnWork.collisionPredicatesThisTick,
    )
    expect(state.navigationSparseSearchCollisionPredicatesThisTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick,
    )
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expectNavigationIntentConservation(state)

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseSearchStartedCount).toBe(startedCount)
    expect(state.navigationSparseSearchCompletedCount).toBe(completedCount)
    expect(state.navigationIntentResolveCountThisTick).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentFirstServiceCount).toBe(0)
    expect(state.navigationIntentUnservicedPendingCount).toBe(0)
    expect(slots.map((slot) => state.zombies.navigationIntentFirstServiceTick[slot])).toEqual(
      Array.from({ length: rosterSize }, () => 0),
    )
    expect(state.navigationSparseSearchPendingAgentCount).toBe(0)
    expect(state.navigationSparseSearchCandidateVisitsMaximumObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerTick,
    )
    expect(
      state.navigationSparseSearchCollisionPredicatesMaximumObservedPerTick,
    ).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick,
    )
    expect(
      state.navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick,
    ).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick,
    )
    expect(state.navigationSparseSearchSupportPredicatesMaximumObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerTick,
    )
    expect(state.navigationSparseSearchTargetBuildsMaximumObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetBuildsPerTick,
    )
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expectNavigationIntentConservation(state)
  })

  test('accounts an unscheduled clear-goal recovery without claiming search service', () => {
    const arena = createZombieEscapeArena(91_053)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_054)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -12, z: -12 },
            { x: 12, z: -12 },
            { x: 12, z: 12 },
            { x: -12, z: 12 },
          ],
        },
      ],
      playRadius: 14,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const demandCount = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick + 1
    const slots = Array.from({ length: demandCount }, (_, spawnOrdinal) => {
      const angle = (spawnOrdinal / demandCount) * Math.PI * 2
      const slot = spawnZombieEscapeZombie(state, Math.sin(angle) * 8, Math.cos(angle) * 8)
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
      state.zombies.navigationIntentPending[slot] = 1
      state.zombies.navigationIntentPendingSinceTick[slot] = state.navigationIntentTick
      state.zombies.navigationIntentHasReceivedFirstService[slot] = 0
      state.zombies.navigationIntentFirstServiceEligibleSinceTick[slot] = state.navigationIntentTick
      state.zombies.navigationIntentFirstServiceTick[slot] = 0
      return slot
    })
    state.navigationIntentDemandRoutePublishedCount += demandCount
    state.navigationIntentIssuedCount += demandCount
    state.navigationIntentPendingCount += demandCount
    const firstServiceBefore = state.navigationIntentFirstServiceCount
    const inlineRecoveryBefore = state.navigationIntentInlineRecoveryWithoutFirstServiceCount
    const searchStartedBefore = state.navigationSparseSearchStartedCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentResolvedCount).toBe(demandCount)
    expect(state.navigationIntentFirstServiceCount - firstServiceBefore).toBe(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(state.navigationSparseSearchStartedCount - searchStartedBefore).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(
      state.navigationIntentInlineRecoveryWithoutFirstServiceCount - inlineRecoveryBefore,
    ).toBe(1)
    const unscheduledSlot = slots.at(-1)!
    expect(state.zombies.navigationIntentFirstServiceTick[unscheduledSlot]).toBe(0)
    expect(state.zombies.navigationSparseFlowSearchActive[unscheduledSlot]).toBe(0)
    expect(inspectZombieEscapeCommittedNavigationAction(state, unscheduledSlot)).not.toBe('none')
    expectNavigationIntentConservation(state)
  })

  test('admits a small roster from published anchors and never periodically refreshes valid intents', () => {
    const arena = createZombieEscapeArena(91_001)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_002)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'surface',
            polygon: [
              { x: -16, z: -16 },
              { x: 16, z: -16 },
              { x: 16, z: 16 },
              { x: -16, z: 16 },
            ],
          },
        ],
        playRadius: 18,
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const rosterSize = 14
    const slots = Array.from({ length: rosterSize }, (_, spawnOrdinal) => {
      const angle = (spawnOrdinal / rosterSize) * Math.PI * 2
      return spawnZombieEscapeZombie(state, Math.sin(angle) * 8, Math.cos(angle) * 8)
    })
    expect(state.navigationIntentIssuedCount).toBe(0)
    expect(state.navigationIntentDemandSpawnCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationIntentOldestPendingAgeTicks).toBe(0)
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expectNavigationIntentConservation(state)

    const slotZero = slots[0]!
    const beforeHeldMoveX = state.zombies.x[slotZero]!
    const beforeHeldMoveZ = state.zombies.z[slotZero]!
    const issuedCount = state.navigationIntentIssuedCount
    const resolveCount = state.navigationIntentResolveCount
    const resolvedTicks = slots.map((slot) => state.zombies.navigationIntentResolvedTick[slot]!)
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(
      state.zombies.navigationDirectionX[slotZero]! *
        (state.player.x - state.zombies.x[slotZero]!) +
        state.zombies.navigationDirectionZ[slotZero]! *
          (state.player.z - state.zombies.z[slotZero]!),
    ).toBeGreaterThan(0)
    expect(state.navigationIntentResolveCountThisTick).toBe(0)
    expect(
      Math.hypot(
        state.zombies.x[slotZero]! - beforeHeldMoveX,
        state.zombies.z[slotZero]! - beforeHeldMoveZ,
      ),
    ).toBeGreaterThan(0)
    for (let tick = 0; tick < 120; tick += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      expect(state.navigationIntentResolveCountThisTick).toBe(0)
    }
    expect(state.navigationIntentResolveCount).toBe(resolveCount)
    expect(state.navigationIntentIssuedCount).toBe(issuedCount)
    expect(slots.map((slot) => state.zombies.navigationIntentResolvedTick[slot]!)).toEqual(
      resolvedTicks,
    )
    expectNavigationIntentConservation(state)
  })

  test('charges bulk world invalidation against the fixed repair budget', () => {
    const arena = createZombieEscapeArena(91_015)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_016)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'surface',
            polygon: [
              { x: -20, z: -20 },
              { x: 20, z: -20 },
              { x: 20, z: 20 },
              { x: -20, z: 20 },
            ],
          },
        ],
        playRadius: 22,
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const slots = Array.from({ length: ZOMBIE_ESCAPE_CAPACITY.zombies }, (_, spawnOrdinal) => {
      const angle = (spawnOrdinal / ZOMBIE_ESCAPE_CAPACITY.zombies) * Math.PI * 2
      return spawnZombieEscapeZombie(state, Math.sin(angle) * 14, Math.cos(angle) * 14)
    })
    const budget = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
    const serviceTicks = Math.ceil(slots.length / budget)
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)

    const replacementWorld = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: arena.playRadius - 0.5,
    })
    state.zombies.navigationIntentUrgentRefreshUsed[slots[0]!] = 1
    const worldDemandBefore = state.navigationIntentDemandWorldChangedCount
    const issuedBeforeReplacement = state.navigationIntentIssuedCount
    setZombieEscapeCollisionWorld(state, replacementWorld)
    expect(state.zombies.navigationIntentUrgentRefreshUsed[slots[0]!]).toBe(1)
    expect(state.navigationIntentDemandWorldChangedCount).toBe(worldDemandBefore)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforeReplacement)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationWorldRefreshInspectionRemaining).toBe(state.zombies.pool.capacity)
    expectNavigationIntentConservation(state)
    const resolveCountBeforeReplacement = state.navigationIntentResolveCount
    for (let tick = 0; tick < serviceTicks; tick += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      expect(state.navigationIntentResolveCountThisTick).toBeLessThanOrEqual(budget)
    }
    expect(state.zombies.navigationIntentUrgentRefreshUsed[slots[0]!]).toBe(0)
    expect(state.navigationIntentDemandWorldChangedCount - worldDemandBefore).toBe(slots.length)
    expect(state.navigationIntentResolveCount - resolveCountBeforeReplacement).toBe(slots.length)
    expect(state.navigationWorldRefreshPendingCount).toBe(0)
    expect(state.navigationIntentMaximumResolveCountObservedPerTick).toBe(budget)
    expectNavigationIntentConservation(state)
  })

  test('forces fresh intent after collision-world replacement and clears cadence state on reset', () => {
    const arena = createZombieEscapeArena(91_003)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_004)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    const slots = [spawnZombieEscapeZombie(state, -6, 0), spawnZombieEscapeZombie(state, 6, 0)]
    const input = createZombieEscapeControlState()

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    const replacementWorld = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: arena.playRadius - 0.5,
    })
    setZombieEscapeCollisionWorld(state, replacementWorld)
    const replacementGeneration = state.collisionWorldGeneration
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(
      slots.every(
        (slot) =>
          state.zombies.navigationIntentResolvedTick[slot] === 1 &&
          state.zombies.navigationIntentWorldGeneration[slot] === replacementGeneration,
      ),
    ).toBe(true)

    state.navigationIntentInlineRecoveryWithoutFirstServiceCount = 3
    resetZombieEscapeSimulation(state, arena)
    expect(state.navigationIntentTick).toBe(0)
    expect(state.navigationIntentResolveCursor).toBe(0)
    expect(state.navigationIntentResolveCount).toBe(0)
    expect(state.navigationIntentResolveCountThisTick).toBe(0)
    expect(state.navigationIntentMaximumResolveCountObservedPerTick).toBe(0)
    expect(state.navigationIntentIssuedCount).toBe(0)
    expect(state.navigationIntentInlineRecoveryWithoutFirstServiceCount).toBe(0)
    expect(state.navigationIntentResolvedCount).toBe(0)
    expect(state.navigationIntentCanceledCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentOldestPendingAgeTicks).toBe(0)
    expect(state.navigationTargetCommittedRouteGeneration).toBe(
      getZombieEscapeSparseCommittedRouteGeneration(state.navigationField),
    )
    expect(state.navigationTargetRequestedRevision).toBe(
      getZombieEscapeSparseRequestedTargetRevision(state.navigationField),
    )
    expect(state.navigationWorldRevision).toBe(0)
    expect(state.simulationTick).toBe(0)
    expect([...state.navigationIntentResolveScheduled].every((value) => value === 0)).toBe(true)
    expect([...state.zombies.navigationIntentValid].every((value) => value === 0)).toBe(true)
    expect([...state.zombies.navigationRequestedConnector].every((value) => value === -1)).toBe(
      true,
    )
    expectNavigationIntentConservation(state)
  })

  test('retains a committed action across a topology-preserving world mutation', () => {
    const arena = createZombieEscapeArena(91_031)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_032)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 5,
          centerZ: 5,
          halfDepth: 0.4,
          halfWidth: 0.4,
          id: 'crate-collider',
          objectId: 'crate',
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -0.2, 4.5)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    const issuedBeforeMutation = state.navigationIntentIssuedCount
    const resolvedBeforeMutation = state.navigationIntentResolvedCount
    const startedBeforeMutation = state.navigationSparseSearchStartedCount
    const mutatedWorld = createZombieEscapeCollisionWorldWithoutObjects(world, new Set(['crate']))
    expect(mutatedWorld.navigationGraph).toBe(world.navigationGraph)

    setZombieEscapeCollisionWorld(state, mutatedWorld)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforeMutation)
    expect(state.navigationIntentResolvedCount).toBe(resolvedBeforeMutation)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.zombies.navigationIntentHasCached[zombie]).toBe(1)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(0)
    expect(state.navigationSparseSearchRestartedWorldChangedCount).toBe(0)
    expect(state.navigationWorldRefreshInspectionRemaining).toBe(state.zombies.pool.capacity)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expectNavigationIntentConservation(state)

    let observedRetainedPendingAction = false
    for (
      let tick = 0;
      tick < 256 &&
      (state.navigationWorldRefreshPendingCount > 0 ||
        state.navigationIntentPendingCount > 0 ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.zombies.navigationSparseFlowSearchActive[zombie] !== 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (state.navigationIntentPendingCount > 0) {
        observedRetainedPendingAction = true
        expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
      }
    }
    expect(observedRetainedPendingAction).toBe(true)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.navigationSparseSearchStartedCount).toBe(startedBeforeMutation + 1)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(0)
    expect(state.navigationSparseSearchRestartedRoutePublishedCount).toBe(0)
    expect(state.navigationSparseSearchRestartedWorldChangedCount).toBe(0)
    expect(state.zombies.navigationIntentWorldGeneration[zombie]).toBe(
      state.collisionWorldGeneration,
    )
    expectNavigationIntentConservation(state)
  })

  test('cancels a deferred spawn before it can issue a demand', () => {
    const arena = createZombieEscapeArena(91_019)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_020)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    const zombie = spawnZombieEscapeZombie(state, 6, 0)
    state.zombies.health[zombie] = 0

    stepZombieEscapeSimulation(state, createZombieEscapeControlState(), 1 / 60, arena)

    expect(state.navigationIntentDemandSpawnCount).toBe(0)
    expect(state.navigationIntentResolvedCount).toBe(0)
    expect(state.navigationIntentCanceledCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredCanceledCount).toBe(1)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expectNavigationIntentConservation(state)
  })

  test('requires half a collision radius of geometric progress before recovery can re-arm', () => {
    const collisionRadius = 0.8
    expect(
      hasZombieEscapeNavigationCollisionRecoveryProgressed(0, 0, 0.01, 0, collisionRadius),
    ).toBe(false)
    expect(
      hasZombieEscapeNavigationCollisionRecoveryProgressed(0, 0, 0.399, 0, collisionRadius),
    ).toBe(false)
    expect(
      hasZombieEscapeNavigationCollisionRecoveryProgressed(0, 0, 0.4, 0, collisionRadius),
    ).toBe(true)
  })

  test('admits a collision-adjacent committed route without manufacturing a recovery restart', () => {
    const arena = createZombieEscapeArena(91_033)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_034)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -0.5, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 1.55
    state.zombies.runBlend[zombie] = 1
    const startedBeforeCompletion = state.navigationSparseSearchStartedCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationSparseSearchStartedCount).toBe(startedBeforeCompletion)
    expect(state.navigationSparseSearchRestartedCollisionRecoveryCount).toBe(0)
    expect(state.navigationSparseSearchRestartedCount).toBe(0)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(0)
    expect(state.navigationSparseCollisionReanchorAttemptCount).toBe(0)
    expect(state.navigationSparseSearchUncausedStartViolationCount).toBe(0)
    expectNavigationIntentConservation(state)
  })

  test('locally reanchors one finite colliding route without a full search', () => {
    const { arena, input, state, waypointNode, zombie } = createCollisionReanchorFixture(91_035, 4)
    const collisionRadius = getZombieEscapeZombieCollisionRadiusMeters(
      state.zombies.variant[zombie]!,
    )
    expect(collisionRadius).toBe(ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS)
    const attemptsBefore = state.navigationSparseCollisionReanchorAttemptCount
    const completionsBefore = state.navigationSparseCollisionReanchorCompletedCount
    const demandsBefore = state.navigationIntentDemandCollisionRecoveryCount
    const searchesBefore = state.navigationSparseSearchStartedCount
    const fullSearchesBefore = state.navigationField.graphAttachmentFullSearchCount
    state.zombies.navigationIntentUrgentRefreshUsed[zombie] = 0
    const acceptedX = armCollisionReanchorStall(state, zombie, waypointNode, collisionRadius)

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseCollisionReanchorAttemptCount).toBe(attemptsBefore + 1)
    expect(state.navigationSparseCollisionReanchorCompletedCount).toBe(completionsBefore + 1)
    expect(state.navigationSparseCollisionReanchorFailedCount).toBe(0)
    expect(state.zombies.navigationIntentUrgentRefreshUsed[zombie]).toBe(1)
    expect(state.zombies.x[zombie]).toBeCloseTo(acceptedX, 6)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(demandsBefore)
    expect(state.navigationSparseSearchStartedCount).toBe(searchesBefore)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(fullSearchesBefore)

    for (let repeatedStall = 0; repeatedStall < 3; repeatedStall += 1) {
      armCollisionReanchorStall(state, zombie, waypointNode, collisionRadius)
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationSparseCollisionReanchorAttemptCount).toBe(attemptsBefore + 1)
    expect(state.navigationSparseCollisionReanchorCompletedCount).toBe(completionsBefore + 1)
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(demandsBefore)
    expect(state.navigationSparseSearchStartedCount).toBe(searchesBefore)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(fullSearchesBefore)
    expectNavigationIntentConservation(state)
  })

  test('falls back once when a small zombie stalls inside compiled navigation clearance', () => {
    const { arena, input, state, waypointNode, zombie } = createCollisionReanchorFixture(91_037, 2)
    const collisionRadius = getZombieEscapeZombieCollisionRadiusMeters(
      state.zombies.variant[zombie]!,
    )
    expect(collisionRadius).toBe(0.33)
    const attemptsBefore = state.navigationSparseCollisionReanchorAttemptCount
    const failuresBefore = state.navigationSparseCollisionReanchorFailedCount
    const demandsBefore = state.navigationIntentDemandCollisionRecoveryCount
    const searchesBefore = state.navigationSparseSearchStartedCount
    const fullSearchesBefore = state.navigationField.graphAttachmentFullSearchCount
    state.zombies.navigationIntentUrgentRefreshUsed[zombie] = 0
    armCollisionReanchorStall(state, zombie, waypointNode, collisionRadius)

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationSparseCollisionReanchorAttemptCount).toBe(attemptsBefore + 1)
    expect(state.navigationSparseCollisionReanchorCompletedCount).toBe(0)
    expect(state.navigationSparseCollisionReanchorFailedCount).toBe(failuresBefore + 1)
    expect(state.zombies.navigationIntentUrgentRefreshUsed[zombie]).toBe(1)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(1)
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(demandsBefore)

    state.zombies.speedScale[zombie] = 0
    for (
      let tick = 0;
      tick < 256 &&
      (state.navigationIntentDemandCollisionRecoveryCount === demandsBefore ||
        state.navigationIntentPendingCount > 0 ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.zombies.navigationSparseFlowSearchActive[zombie] !== 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(demandsBefore + 1)
    expect(state.navigationSparseSearchStartedCount).toBe(searchesBefore + 1)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBeGreaterThan(fullSearchesBefore)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)

    const attemptsAfterRecovery = state.navigationSparseCollisionReanchorAttemptCount
    const demandsAfterRecovery = state.navigationIntentDemandCollisionRecoveryCount
    const searchesAfterRecovery = state.navigationSparseSearchStartedCount
    const fullSearchesAfterRecovery = state.navigationField.graphAttachmentFullSearchCount
    for (let repeatedStall = 0; repeatedStall < 3; repeatedStall += 1) {
      armCollisionReanchorStall(state, zombie, waypointNode, collisionRadius)
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.navigationIntentUrgentRefreshUsed[zombie]).toBe(1)
    expect(state.navigationSparseCollisionReanchorAttemptCount).toBe(attemptsAfterRecovery)
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(demandsAfterRecovery)
    expect(state.navigationSparseSearchStartedCount).toBe(searchesAfterRecovery)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(fullSearchesAfterRecovery)
    expectNavigationIntentConservation(state)
  })

  test('atomically retires an active connector traversal when its sparse topology changes', () => {
    const arena = createZombieEscapeArena(91_013)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_014)
    const supports = [
      {
        boundary: true as const,
        elevation: 0,
        id: 'ground',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
      {
        boundary: true as const,
        elevation: 3,
        id: 'upper',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ]
    const connector = (id: string, x: number) => ({
      ascendingEnd: true,
      chainId: id,
      chainLowerY: 0,
      chainOrder: 0,
      chainUpperY: 3,
      endX: x,
      endY: 3,
      endZ: 1,
      halfWidth: 0.8,
      id,
      startX: x,
      startY: 0,
      startZ: -1,
    })
    const first = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationConnectors: [connector('stable', 2)],
      navigationSupports: supports,
      playRadius: 10,
    })
    const reordered = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationConnectors: [connector('stable', 2), connector('earlier', -2)],
      navigationSupports: supports,
      playRadius: 10,
    })
    setZombieEscapeCollisionWorld(state, first)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 4
    state.player.y = 0
    state.player.z = 0
    publishZombieEscapeSparseTarget(state, createZombieEscapeControlState(), arena)
    const zombie = spawnZombieEscapeZombie(state, 2, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.navigationConnector[zombie] = first.navigationConnectors.findIndex(
      ({ id }) => id === 'stable',
    )
    state.zombies.navigationConnectorTargetEnd[zombie] = 1
    state.waveState = 'active'
    state.waveSpawnTimerSeconds = 10_000

    setZombieEscapeCollisionWorld(state, reordered)

    expect(state.zombies.pool.active[zombie]).toBe(0)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.replacementSpawnRemaining).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).toBe('none')
  })

  test('coalesces raw target-height motion inside one route layer until the route layer changes', () => {
    const arena = createZombieEscapeArena(91_007)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_008)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'stairs',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 3,
          endX: 1,
          endY: 3,
          endZ: 0,
          halfWidth: 0.8,
          id: 'stairs:0',
          startX: -1,
          startY: 0,
          startZ: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'ground',
          polygon: [
            { x: -8, z: -4 },
            { x: -1, z: -4 },
            { x: -1, z: 4 },
            { x: -8, z: 4 },
          ],
        },
        {
          boundary: true,
          elevation: 3,
          id: 'upper',
          polygon: [
            { x: 1, z: -4 },
            { x: 8, z: -4 },
            { x: 8, z: 4 },
            { x: 1, z: 4 },
          ],
        },
      ],
      playRadius: 20,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.y = 0.5
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const slots = Array.from({ length: 8 }, (_, spawnOrdinal) => {
      const slot = spawnZombieEscapeZombie(state, -5, -3 + spawnOrdinal * 0.75)
      expect(slot).toBeGreaterThanOrEqual(0)
      return slot
    })

    for (
      let tick = 0;
      tick < 1_024 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.navigationIntentPendingCount > 0 ||
        slots.some((slot) => state.zombies.navigationIntentValid[slot] === 0));
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationIntentPendingCount).toBe(0)
    const targetLayerIndex = state.navigationField.targetLayerIndex
    const anchorInvalidationCount = state.navigationAnchorInvalidationCount
    const requestedTargetRevision = state.navigationTargetRequestedRevision
    const committedRouteGeneration = state.navigationTargetCommittedRouteGeneration
    expect(targetLayerIndex).toBe(0)
    expect(state.navigationGoalLayerIndex).toBe(0)
    expect(state.navigationTargetY).toBe(0)
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expect(
      slots.every(
        (slot) =>
          state.zombies.navigationIntentCommittedRouteGeneration[slot] === committedRouteGeneration,
      ),
    ).toBe(true)

    for (let tick = 1; tick <= 3; tick += 1) {
      state.player.y = 0.5 + tick * 0.1
      const priorResolvedTicks = slots.map(
        (slot) => state.zombies.navigationIntentResolvedTick[slot]!,
      )
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)

      expect(state.navigationTargetY).toBe(0)
      expect(state.navigationField.targetLayerIndex).toBe(targetLayerIndex)
      expect(state.navigationTargetRequestedRevision).toBe(requestedTargetRevision)
      expect(state.navigationTargetCommittedRouteGeneration).toBe(committedRouteGeneration)
      expect(
        slots
          .filter(
            (slot, index) =>
              state.zombies.navigationIntentResolvedTick[slot] !== priorResolvedTicks[index],
          )
          .map((slot) => state.zombies.spawnOrdinal[slot]),
      ).toEqual([])
    }

    state.player.x = 4
    state.player.y = 3
    for (const slot of slots) state.zombies.navigationIntentUrgentRefreshUsed[slot] = 1
    const priorResolvedTicks = slots.map(
      (slot) => state.zombies.navigationIntentResolvedTick[slot]!,
    )
    let previousIssued = state.navigationIntentIssuedCount
    for (
      let tick = 0;
      tick < 1_024 && state.navigationTargetCommittedRouteGeneration === committedRouteGeneration;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      expect(state.navigationIntentIssuedCount - previousIssued).toBeLessThanOrEqual(
        ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
      )
      previousIssued = state.navigationIntentIssuedCount
    }
    expect(state.navigationField.targetLayerIndex).not.toBe(targetLayerIndex)
    expect(state.navigationTargetRequestedRevision).toBeGreaterThan(requestedTargetRevision)
    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(committedRouteGeneration)
    expect(state.navigationAnchorInvalidationCount).toBe(anchorInvalidationCount)
    for (
      let tick = 0;
      tick < 1_024 &&
      (state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.navigationIntentPendingCount > 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(
      slots
        .filter(
          (slot, index) =>
            state.zombies.navigationIntentResolvedTick[slot] !== priorResolvedTicks[index],
        )
        .map((slot) => state.zombies.spawnOrdinal[slot]),
    ).toEqual([])
    expect(
      slots.every(
        (slot) =>
          state.zombies.navigationIntentValid[slot] !== 0 &&
          state.zombies.navigationIntentCommittedRouteGeneration[slot] ===
            state.navigationTargetCommittedRouteGeneration,
      ),
    ).toBe(true)
    expectNavigationIntentConservation(state)
  })

  test('retains a committed action across a pending cross-floor route publication', () => {
    const arena = createZombieEscapeArena(91_009)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_010)
    const segments = Array.from({ length: 32 }, (_, index) => {
      const column = index % 8
      const row = Math.floor(index / 8)
      const startX = -10 + column * 2.5
      const startZ = 5 + row * 1.5
      return {
        endX: startX + 0.5,
        endZ: startZ,
        halfThickness: 0.05,
        id: `far-segment:${index}`,
        startX,
        startZ,
      }
    })
    const supportPolygon = [
      { x: -12, z: -12 },
      { x: 12, z: -12 },
      { x: 12, z: 12 },
      { x: -12, z: 12 },
    ]
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'ground',
          polygon: supportPolygon,
        },
        {
          boundary: true,
          elevation: 3,
          id: 'upper',
          polygon: supportPolygon,
        },
      ],
      playRadius: 14,
      segments,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = -3
    state.player.y = 0
    state.player.z = -5
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -6, -5)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    for (
      let tick = 0;
      tick < 4_096 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.navigationIntentPendingCount > 0 ||
        state.zombies.navigationIntentValid[zombie] === 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
    expect(state.zombies.navigationIntentValid[zombie]).toBe(1)
    state.zombies.navigationWaypointNode[zombie] = -1
    state.zombies.navigationReachable[zombie] = 1
    expect(state.zombies.navigationWaypointNode[zombie]).toBe(-1)
    const committedRouteGeneration = state.navigationTargetCommittedRouteGeneration
    const committedRouteTargetLayer =
      state.navigationField.graphSparseTargetUpdate.routeTargetLayerIndex
    expect(committedRouteTargetLayer).toBeGreaterThanOrEqual(0)
    expect(state.navigationTargetRequestedLayerHint).toBe(committedRouteTargetLayer)
    const issuedCount = state.navigationIntentIssuedCount
    const attachmentSearchCount = state.navigationField.graphAttachmentFullSearchCount

    const requestedRevision = state.navigationTargetRequestedRevision
    state.player.x = -2.95
    state.player.z = -4.95
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    const directionX = state.player.x - state.zombies.x[zombie]!
    const directionZ = state.player.z - state.zombies.z[zombie]!
    const directionLength = Math.hypot(directionX, directionZ)
    expect(state.zombies.navigationDirectionX[zombie]).toBeCloseTo(directionX / directionLength, 6)
    expect(state.zombies.navigationDirectionZ[zombie]).toBeCloseTo(directionZ / directionLength, 6)
    expect(state.navigationTargetRequestedRevision).toBe(requestedRevision)
    expect(state.navigationTargetCommittedRouteGeneration).toBe(committedRouteGeneration)
    expect(state.navigationIntentIssuedCount).toBe(issuedCount)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)

    state.player.x = 3
    state.player.y = 3
    state.player.z = -5
    state.zombies.speedScale[zombie] = 1
    state.zombies.vx[zombie] = 0.5
    state.zombies.vz[zombie] = -0.25
    let observedPendingCrossFloorLayer = false
    let retainedActionTickCount = 0
    for (
      let tick = 0;
      tick < 4_096 && state.navigationTargetCommittedRouteGeneration === committedRouteGeneration;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (state.navigationTargetCommittedRouteGeneration !== committedRouteGeneration) break
      expect(state.zombies.navigationIntentValid[zombie]).toBe(1)
      expect(state.zombies.navigationReachable[zombie]).toBe(1)
      expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
      expect(state.navigationIntentIssuedCount).toBe(issuedCount)
      expect(state.navigationField.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
      retainedActionTickCount += 1
      if (state.navigationTargetRequestedLayerHint >= 0) {
        expect(state.navigationTargetRequestedLayerHint).not.toBe(committedRouteTargetLayer)
        observedPendingCrossFloorLayer = true
      }
    }
    expect(retainedActionTickCount).toBeGreaterThan(0)
    expect(observedPendingCrossFloorLayer).toBe(true)
    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(committedRouteGeneration)
  })

  test('follows a sparse wall-end route locally without periodic route refreshes', () => {
    const arena = createZombieEscapeArena(91_011)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_012)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.wave = 8
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -0.2, 4.5)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 1.55
    state.zombies.runBlend[zombie] = 1
    const startedCount = state.navigationSparseSearchStartedCount
    const completedCount = state.navigationSparseSearchCompletedCount
    const canceledCount = state.navigationSparseSearchCanceledCount

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.navigationSparseSearchStartedCount).toBe(startedCount)
    expect(state.navigationSparseSearchCompletedCount).toBe(completedCount)
    expect(state.navigationSparseSearchPendingAgentCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expect(state.zombies.navigationWaypointNode[zombie]).toBeGreaterThanOrEqual(0)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.navigationSparseSearchCompletedCount).toBe(completedCount)
    expect(state.navigationSparseSearchCanceledCount).toBe(canceledCount)
    expect(state.navigationSparseSearchPendingAgentCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)

    let heldLocalFollowTicks = 0
    let heldLocalFollowChecks = 0
    const heldRebuildChanges: number[] = []
    for (let frame = 1; frame <= 240; frame += 1) {
      const previousResolvedTick = state.zombies.navigationIntentResolvedTick[zombie]!
      const previousWaypoint = state.zombies.navigationWaypointNode[zombie]!
      const previousRebuildCount = state.navigationField.rebuildCount
      const previousFallbackRebuildCount = state.navigationField.fallbackRebuildCount
      const previousX = state.zombies.x[zombie]!
      const previousZ = state.zombies.z[zombie]!

      stepZombieEscapeSimulation(state, input, 1 / 60, arena)

      const resolvedTick = state.zombies.navigationIntentResolvedTick[zombie]!
      const waypoint = state.zombies.navigationWaypointNode[zombie]!
      if (resolvedTick === previousResolvedTick && previousWaypoint >= 0) {
        heldLocalFollowTicks += 1
        if (
          state.navigationField.rebuildCount !== previousRebuildCount ||
          state.navigationField.fallbackRebuildCount !== previousFallbackRebuildCount
        ) {
          heldRebuildChanges.push(frame)
        }
        if (waypoint >= 0) {
          const waypointX = world.navigationGraph.x[waypoint]!
          const waypointZ = world.navigationGraph.z[waypoint]!
          const waypointDistance = Math.hypot(waypointX - previousX, waypointZ - previousZ)
          if (waypointDistance > 0.001) {
            expect(state.zombies.navigationDirectionX[zombie]).toBeCloseTo(
              (waypointX - previousX) / waypointDistance,
              5,
            )
            expect(state.zombies.navigationDirectionZ[zombie]).toBeCloseTo(
              (waypointZ - previousZ) / waypointDistance,
              5,
            )
            heldLocalFollowChecks += 1
          }
        }
      }
    }

    expect(heldLocalFollowTicks).toBeGreaterThan(0)
    expect(heldLocalFollowChecks).toBeGreaterThan(0)
    expect(heldRebuildChanges.length).toBeLessThanOrEqual(1)
  })

  test('adopts one hundred safe retained anchors after route publication without agent fan-out', () => {
    const arena = createZombieEscapeArena(91_017)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_018)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -10, z: -10 },
            { x: 10, z: -10 },
            { x: 10, z: 10 },
            { x: -10, z: 10 },
          ],
        },
      ],
      playRadius: 12,
      segments: [
        {
          endX: 0,
          endZ: 5,
          halfThickness: 0.12,
          id: 'wall',
          startX: 0,
          startZ: -5,
        },
        {
          endX: 8,
          endZ: 0,
          halfThickness: 0.12,
          id: 'target-side-divider',
          startX: 2,
          startZ: 0,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 6
    state.player.y = 0
    state.player.z = -3
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const rosterSize = ZOMBIE_ESCAPE_CAPACITY.zombies
    const slots = Array.from({ length: rosterSize }, (_, index) => {
      const slot = spawnZombieEscapeZombie(
        state,
        -8 + (index % 10) * 0.3,
        -2 + Math.floor(index / 10) * 0.4,
      )
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
      return slot
    })

    for (
      let tick = 0;
      tick < 1_024 &&
      (state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        slots.some((slot) => state.zombies.navigationIntentValid[slot] === 0) ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.navigationIntentPendingCount > 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    const attachmentSearchCount = state.navigationField.graphAttachmentFullSearchCount
    const agentSearchCount = state.navigationSparseSearchStartedCount
    const intentResolveCount = state.navigationIntentResolveCount
    expect(agentSearchCount).toBe(0)
    expect(slots.every((slot) => state.zombies.navigationWaypointNode[slot]! >= 0)).toBe(true)

    for (let tick = 0; tick < 240; tick += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      expect(state.navigationIntentResolveCountThisTick).toBe(0)
    }

    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
    expect(state.navigationSparseSearchStartedCount).toBe(agentSearchCount)
    expect(state.navigationIntentResolveCount).toBe(intentResolveCount)
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expect(state.navigationAnchoredAgentCount).toBe(rosterSize)
    expectNavigationIntentConservation(state)

    const anchorInvalidationCount = state.navigationAnchorInvalidationCount
    const attachmentSearchCountBeforeTargetPublication =
      state.navigationField.graphAttachmentFullSearchCount
    const agentSearchCountBeforeTargetPublication = state.navigationSparseSearchStartedCount
    const searchInvalidationCountBeforeTargetPublication =
      state.navigationSparseSearchInvalidatedCount
    const intentIssuedCountBeforeTargetPublication = state.navigationIntentIssuedCount
    const intentResolveCountBeforeTargetPublication = state.navigationIntentResolveCount
    const routePublishedDemandCountBeforeTargetPublication =
      state.navigationIntentDemandRoutePublishedCount
    const requestedTargetRevision = state.navigationTargetRequestedRevision
    const committedRouteGeneration = state.navigationTargetCommittedRouteGeneration
    state.player.z = 3
    for (
      let tick = 0;
      tick < 1_024 && state.navigationTargetCommittedRouteGeneration === committedRouteGeneration;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      expect(state.navigationIntentResolveCountThisTick).toBe(0)
    }
    expect(state.navigationTargetRequestedRevision).toBeGreaterThan(requestedTargetRevision)
    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(committedRouteGeneration)
    expect(state.navigationIntentIssuedCount).toBe(intentIssuedCountBeforeTargetPublication)
    expect(state.navigationIntentDemandRoutePublishedCount).toBe(
      routePublishedDemandCountBeforeTargetPublication,
    )
    expect(state.navigationIntentResolveCount).toBe(intentResolveCountBeforeTargetPublication)
    expect(state.navigationSparseSearchRestartedRoutePublishedCount).toBe(0)
    expect(slots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expect(slots.every((slot) => state.zombies.navigationWaypointNode[slot]! >= 0)).toBe(true)
    const reacquiringSlots = slots.filter(
      (slot) =>
        state.zombies.navigationIntentCommittedRouteGeneration[slot] !==
        state.navigationTargetCommittedRouteGeneration,
    )
    expect(reacquiringSlots.length).toBe(0)
    expect(
      slots.every(
        (slot) =>
          state.zombies.navigationIntentCommittedRouteGeneration[slot] ===
          state.navigationTargetCommittedRouteGeneration,
      ),
    ).toBe(true)
    expect(state.navigationIntentIssuedCount).toBe(intentIssuedCountBeforeTargetPublication)
    expect(state.navigationIntentDemandRoutePublishedCount).toBe(
      routePublishedDemandCountBeforeTargetPublication,
    )
    expect(state.navigationIntentResolveCount).toBe(intentResolveCountBeforeTargetPublication)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(slots.every((slot) => state.zombies.navigationWaypointNode[slot]! >= 0)).toBe(true)
    expect(state.navigationAnchorInvalidationCount).toBe(anchorInvalidationCount)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(
      attachmentSearchCountBeforeTargetPublication,
    )
    expect(state.navigationSparseSearchStartedCount).toBe(agentSearchCountBeforeTargetPublication)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(
      searchInvalidationCountBeforeTargetPublication,
    )
    const successorVisits = slots.map(
      (slot) =>
        state.zombies.navigationSparseCommittedFlowSearch[slot]!.lastRouteCorridorSuccessorVisits,
    )
    const maximumSuccessorVisitsPerAgent = 1
    expect(
      successorVisits.every(
        (visits) =>
          Number.isInteger(visits) && visits >= 0 && visits <= maximumSuccessorVisitsPerAgent,
      ),
    ).toBe(true)
    expect(successorVisits.reduce((total, visits) => total + visits, 0)).toBeLessThanOrEqual(
      rosterSize * maximumSuccessorVisitsPerAgent,
    )
    expect(
      slots.every(
        (slot) =>
          state.zombies.navigationSparseCommittedFlowSearch[slot]!.cachedOriginalNode ===
          state.zombies.navigationWaypointNode[slot],
      ),
    ).toBe(true)
    const livingSlots = slots.filter(
      (slot) => state.zombies.pool.active[slot] !== 0 && state.zombies.health[slot]! > 0,
    )
    expect(livingSlots.length).toBe(rosterSize)
    expect(
      livingSlots.every((slot) => {
        const action = inspectZombieEscapeCommittedNavigationAction(state, slot)
        return action === 'direct' || action === 'route' || action === 'attack-player'
      }),
    ).toBe(true)
    expect(state.navigationLivingWithoutCommittedActionCount).toBe(0)
    expect(state.navigationRetainedPendingActionCount).toBe(0)
    expect(state.navigationStaleTargetCount).toBe(0)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expect(state.navigationSparseSearchUncausedStartViolationCount).toBe(0)
    expect(state.navigationIntentMaximumResolveCountObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
    )
    expectNavigationIntentConservation(state)
  })

  test('promotes a published fallback breach to a nearby strict reattachment', () => {
    const arena = createZombieEscapeArena(91_051)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_052)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      circles: [{ id: 'left-static', radius: 0.6, x: -3, z: 0 }],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          breakable: true,
          endCap: 'flat',
          endX: 0,
          endZ: 6,
          halfThickness: 0.1,
          id: 'divider',
          objectId: 'divider',
          startCap: 'flat',
          startX: 0,
          startZ: -6,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -5, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    const initialSample = createFlowSample()
    resolveZombieEscapeFlowDirection(
      state.navigationField,
      -5,
      0,
      3,
      0,
      initialSample,
      undefined,
      0,
    )
    const weightedAnchor = initialSample.waypointNode ?? -1
    expect(initialSample.waypointUsesFallback).toBe(true)
    expect(weightedAnchor).toBeGreaterThanOrEqual(0)
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        state.zombies.navigationSparseCommittedFlowSearch[zombie]!,
        state.navigationField,
        weightedAnchor,
        true,
      ),
    ).toBe(true)
    state.zombies.navigationDirectionX[zombie] = initialSample.x
    state.zombies.navigationDirectionZ[zombie] = initialSample.z
    state.zombies.navigationWaypointFallback[zombie] = 1
    state.zombies.navigationWaypointNode[zombie] = weightedAnchor
    state.zombies.speedScale[zombie] = 0
    const initialGeneration = state.navigationTargetCommittedRouteGeneration
    const demandCount = state.navigationIntentDemandRoutePublishedCount
    const searchCount = state.navigationSparseSearchStartedCount
    const attachmentSearchCount = state.navigationField.graphAttachmentFullSearchCount

    state.player.x = -1.5
    let publicationObserved = false
    for (
      let tick = 0;
      tick < 1_024 &&
      (!publicationObserved ||
        state.navigationIntentPendingCount > 0 ||
        state.zombies.navigationIntentCommittedRouteGeneration[zombie] !==
          state.navigationTargetCommittedRouteGeneration);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      publicationObserved ||= state.navigationTargetCommittedRouteGeneration > initialGeneration
      expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    }

    expect(publicationObserved).toBe(true)
    expect(state.navigationIntentDemandRoutePublishedCount).toBe(demandCount + 1)
    expect(state.navigationSparseSearchStartedCount).toBe(searchCount)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.zombies.navigationIntentCommittedRouteGeneration[zombie]).toBe(
      state.navigationTargetCommittedRouteGeneration,
    )
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expectNavigationIntentConservation(state)
  })

  test('publishes a moved target for anchored agents without search fan-out or duplicate demands', () => {
    const arena = createZombieEscapeArena(91_047)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_048)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 64 &&
      (!state.navigationRouteTargetInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready');
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
    const initialGeneration = getZombieEscapeSparseCommittedRouteGeneration(state.navigationField)
    const zombie = spawnZombieEscapeZombie(state, -0.2, 4.5)
    state.zombies.speedScale[zombie] = 0
    for (let index = 0; index < 7; index += 1) {
      const filler = spawnZombieEscapeZombie(state, 4.8, -3 + index)
      state.zombies.speedScale[filler] = 0
    }
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
    expect(state.zombies.navigationIntentHasCached[zombie]).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    const issuedBeforePublication = state.navigationIntentIssuedCount
    const startedBeforePublication = state.navigationSparseSearchStartedCount

    state.player.x = -3
    for (
      let tick = 0;
      tick < 64 &&
      getZombieEscapeSparseCommittedRouteGeneration(state.navigationField) === initialGeneration;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(getZombieEscapeSparseCommittedRouteGeneration(state.navigationField)).toBeGreaterThan(
      initialGeneration,
    )
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforePublication)
    expect(state.navigationSparseSearchStartedCount).toBe(startedBeforePublication)
    expect(state.navigationSparseSearchInvalidatedCount).toBe(0)
    expect(state.navigationSparseSearchRestartedCount).toBe(0)
    expectNavigationIntentConservation(state)

    let drainTicks = 0
    while (drainTicks < 256 && state.navigationIntentPendingCount > 0) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      drainTicks += 1
    }
    expect(drainTicks).toBeLessThan(256)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforePublication)
    expect(
      [...state.zombies.pool.active].every(
        (active, slot) =>
          active === 0 ||
          state.zombies.navigationIntentCommittedRouteGeneration[slot] ===
            state.navigationTargetCommittedRouteGeneration,
      ),
    ).toBe(true)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expect(state.navigationSparseSearchUncausedStartViolationCount).toBe(0)
    expect(state.navigationIntentMaximumResolveCountObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
    )
    expectNavigationIntentConservation(state)
  })

  test('repairs a lost sparse anchor synchronously without dropping the committed action', () => {
    const arena = createZombieEscapeArena(91_021)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_022)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 10,
      segments: [
        {
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 5
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -5, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    for (let tick = 0; tick < 128 && state.zombies.navigationWaypointNode[zombie]! < 0; tick += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.navigationWaypointNode[zombie]).toBeGreaterThanOrEqual(0)
    const issuedBeforeLoss = state.navigationIntentIssuedCount
    const demandBeforeLoss = state.navigationIntentDemandCachedAnchorLostCount
    const anchorInvalidationCountBeforeLoss = state.navigationAnchorInvalidationCount
    state.zombies.navigationWaypointNode[zombie] = world.navigationGraph.nodeIds.length + 100

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationIntentDemandCachedAnchorLostCount).toBe(demandBeforeLoss)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforeLoss)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationAnchorInvalidationCount).toBe(anchorInvalidationCountBeforeLoss + 1)
    expect(state.zombies.navigationWaypointNode[zombie]).toBeGreaterThanOrEqual(0)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expectNavigationIntentConservation(state)

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationIntentDemandCachedAnchorLostCount).toBe(demandBeforeLoss)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforeLoss)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentDemandCachedAnchorLostCount).toBe(demandBeforeLoss)
    expect(state.navigationIntentIssuedCount).toBe(issuedBeforeLoss)
    expect(state.navigationIntentResolvedCount + state.navigationIntentCanceledCount).toBe(
      state.navigationIntentIssuedCount,
    )
    expectNavigationIntentConservation(state)
  })

  test('steers a terminal graph anchor toward the moving target through exact line of sight', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -10, z: -10 },
            { x: 10, z: -10 },
            { x: 10, z: 10 },
            { x: -10, z: 10 },
          ],
        },
      ],
      playRadius: 12,
      segments: [
        {
          endX: 0,
          endZ: 5,
          halfThickness: 0.12,
          id: 'wall',
          startX: 0,
          startZ: -5,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 6, 0, 0)
    resolveZombieEscapeFlowDirection(
      field,
      -6,
      0,
      6,
      0,
      sample,
      createZombieEscapeCollisionHit(),
      0,
    )
    expect(sample.waypointNode).toBeGreaterThanOrEqual(0)

    let terminalNode = sample.waypointNode ?? -1
    for (let step = 0; step < world.navigationGraph.nodeIds.length; step += 1) {
      const nextNode = field.graphSameLayerNextNodes[terminalNode] ?? -1
      if (nextNode < 0) break
      terminalNode = nextNode
    }
    expect(field.graphSameLayerNextNodes[terminalNode]).toBe(-1)
    sample.waypointNode = terminalNode
    sample.waypointUsesFallback = false
    sample.x = 1
    sample.z = 0
    const terminalX = world.navigationGraph.x[terminalNode]!
    const terminalZ = world.navigationGraph.z[terminalNode]!
    const attachmentSearchCount = field.graphAttachmentFullSearchCount

    expect(updateZombieEscapeFlowTarget(field, 6, 0.05, 0)).toBe(false)
    expect(followZombieEscapeCachedSparseWaypoint(field, terminalX, terminalZ, 0, sample)).toBe(
      true,
    )
    const targetDistance = Math.hypot(6 - terminalX, 0.05 - terminalZ)
    expect(sample.x).toBeCloseTo((6 - terminalX) / targetDistance, 8)
    expect(sample.z).toBeCloseTo((0.05 - terminalZ) / targetDistance, 8)
    expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
  })

  test('matches an exhaustive lowest-total-travel attachment oracle', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -12, z: -12 },
            { x: 12, z: -12 },
            { x: 12, z: 12 },
            { x: -12, z: 12 },
          ],
        },
      ],
      playRadius: 14,
      segments: [
        {
          endX: 0,
          endZ: 5,
          halfThickness: 0.12,
          id: 'wall',
          startX: 0,
          startZ: -5,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    updateZombieEscapeFlowTarget(field, 7, 0, 0)
    const hit = createZombieEscapeCollisionHit()

    for (const source of [
      { x: -7, z: -3 },
      { x: -7, z: 0 },
      { x: -7, z: 3 },
      { x: -3, z: 1.5 },
    ]) {
      const sample = createFlowSample()
      resolveZombieEscapeFlowDirection(field, source.x, source.z, 7, 0, sample, hit, 0)
      expect(sample.waypointUsesFallback).toBe(false)

      let oracleNode = -1
      let oracleAttachmentDistance = Number.POSITIVE_INFINITY
      let oracleTotalTravelDistance = Number.POSITIVE_INFINITY
      for (let node = 0; node < world.navigationGraph.nodeIds.length; node += 1) {
        const routeDistance = field.graphSameLayerDistances[node]!
        if (world.navigationGraph.layerIndices[node] !== 0 || !Number.isFinite(routeDistance)) {
          continue
        }
        if (
          !zombieEscapeSegmentIsClear(
            world,
            source.x,
            source.z,
            world.navigationGraph.x[node]!,
            world.navigationGraph.z[node]!,
            world.agentRadius,
          )
        ) {
          continue
        }
        const attachmentDistance = Math.hypot(
          world.navigationGraph.x[node]! - source.x,
          world.navigationGraph.z[node]! - source.z,
        )
        const totalTravelDistance = attachmentDistance + routeDistance
        if (
          totalTravelDistance > oracleTotalTravelDistance + 1e-9 ||
          (Math.abs(totalTravelDistance - oracleTotalTravelDistance) <= 1e-9 &&
            (attachmentDistance > oracleAttachmentDistance + 1e-9 ||
              (Math.abs(attachmentDistance - oracleAttachmentDistance) <= 1e-9 &&
                oracleNode >= 0 &&
                node >= oracleNode)))
        ) {
          continue
        }
        oracleNode = node
        oracleAttachmentDistance = attachmentDistance
        oracleTotalTravelDistance = totalTravelDistance
      }

      expect(oracleNode).toBeGreaterThanOrEqual(0)
      const search = field.graphSparseFlowSearch
      expect(search.cachedOriginalNode).toBe(oracleNode)
      expect(search.attachment.bestNode).toBe(oracleNode)
      const steeringNode = sample.waypointNode ?? -1
      expect(steeringNode).toBeGreaterThanOrEqual(0)
      expect(search.cachedVisibleNode).toBe(steeringNode)
      expect(search.waypointNode).toBe(steeringNode)
      const steeringX = world.navigationGraph.x[steeringNode]!
      const steeringZ = world.navigationGraph.z[steeringNode]!
      const steeringDistance = Math.hypot(steeringX - source.x, steeringZ - source.z)
      expect(sample.x).toBeCloseTo((steeringX - source.x) / steeringDistance, 12)
      expect(sample.z).toBeCloseTo((steeringZ - source.z) / steeringDistance, 12)
    }
  })

  test('keeps night cohorts deterministic regardless of build-phase step history', () => {
    const arena = createZombieEscapeArena(91_005)
    arena.obstacleCount = 0
    const earlyState = createZombieEscapeSimulation(arena, 91_006)
    const delayedState = createZombieEscapeSimulation(arena, 91_006)
    const input = createZombieEscapeControlState()

    for (let tick = 0; tick < 7; tick += 1) {
      stepZombieEscapeSimulation(delayedState, input, 1 / 60, arena)
    }
    expect(earlyState.navigationIntentTick).toBe(0)
    expect(delayedState.navigationIntentTick).toBe(0)

    for (const state of [earlyState, delayedState]) {
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      state.waveState = 'escape'
      state.player.x = 0
      state.player.z = 0
      for (let spawnOrdinal = 0; spawnOrdinal < 8; spawnOrdinal += 1) {
        const angle = (spawnOrdinal / 8) * Math.PI * 2
        spawnZombieEscapeZombie(state, Math.sin(angle) * 8, Math.cos(angle) * 8)
      }
    }

    for (let tick = 0; tick < 12; tick += 1) {
      stepZombieEscapeSimulation(earlyState, input, 1 / 60, arena)
      stepZombieEscapeSimulation(delayedState, input, 1 / 60, arena)
    }

    expect(delayedState.navigationIntentTick).toBe(earlyState.navigationIntentTick)
    expect(delayedState.navigationIntentResolveCursor).toBe(
      earlyState.navigationIntentResolveCursor,
    )
    expect(delayedState.navigationIntentResolveCount).toBe(earlyState.navigationIntentResolveCount)
    expect([...delayedState.zombies.navigationIntentResolvedTick]).toEqual([
      ...earlyState.zombies.navigationIntentResolvedTick,
    ])
    expect([...delayedState.zombies.x]).toEqual([...earlyState.zombies.x])
    expect([...delayedState.zombies.z]).toEqual([...earlyState.zombies.z])
  })

  test('invalidates furniture attackers without replanning every unrelated zombie', () => {
    const arena = createZombieEscapeArena(91_009)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 91_010)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 1.2,
          halfWidth: 0.35,
          id: 'table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          navigationLayerY: 0,
          objectId: 'table',
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -10, z: -10 },
            { x: 10, z: -10 },
            { x: 10, z: 10 },
            { x: -10, z: 10 },
          ],
        },
      ],
      playRadius: 12,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const attacker = spawnZombieEscapeZombie(state, -1.5, 0)
    const unrelated = spawnZombieEscapeZombie(state, 7, 7)
    expect(attacker).toBeGreaterThanOrEqual(0)
    expect(unrelated).toBeGreaterThanOrEqual(0)
    state.zombies.attackCooldown[attacker] = 0
    const fixedDeltaSeconds = ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
    const attackDurationSeconds = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
    const contactSeconds =
      attackDurationSeconds * ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase
    const firstContactTick = Math.ceil(contactSeconds / fixedDeltaSeconds)
    const secondContactTick = Math.ceil(
      (attackDurationSeconds + contactSeconds) / fixedDeltaSeconds,
    )
    const stepFixedTicks = (tickCount: number) => {
      for (let tick = 0; tick < tickCount; tick += 1) {
        stepZombieEscapeSimulation(state, input, fixedDeltaSeconds, arena)
      }
    }

    stepFixedTicks(1)
    expect(state.zombies.intent[attacker]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle)
    expect(state.zombies.attackTargetObjectId[attacker]).toBe('table')
    expect(state.zombies.attackCooldown[attacker]).toBeCloseTo(attackDurationSeconds, 5)
    expect(state.zombies.attackContactResolved[attacker]).toBe(0)
    expect(state.obstacleHitCounts.has('table')).toBe(false)

    stepFixedTicks(firstContactTick - 1)
    expect(state.obstacleHitCounts.has('table')).toBe(false)
    stepFixedTicks(1)
    expect(state.obstacleHitCounts.get('table')).toBe(1)
    expect(state.zombies.navigationIntentValid[unrelated]).toBe(1)

    const heldResolvedTick = state.zombies.navigationIntentResolvedTick[unrelated]!
    stepFixedTicks(secondContactTick - firstContactTick - 1)
    expect(state.obstacleHitCounts.get('table')).toBe(1)
    expect(state.destroyedObstacleIds.has('table')).toBe(false)
    const previousWorldGeneration = state.collisionWorldGeneration
    const previousNavigationWorldRevision = state.navigationWorldRevision
    stepFixedTicks(1)

    expect(state.destroyedObstacleIds.has('table')).toBe(true)
    expect(state.collisionWorldGeneration).toBe(previousWorldGeneration)
    expect(state.navigationWorldRevision).toBe(previousNavigationWorldRevision + 1)
    expect(state.zombies.navigationIntentValid[attacker]).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(state, attacker)).not.toBe('none')
    expect(state.navigationObstacleRefreshDeferredPendingCount).toBe(0)
    const targetDemandBeforeAdmission = state.navigationIntentDemandCachedAnchorLostCount
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationObstacleRefreshDeferredPendingCount).toBe(0)
    expect(state.navigationObstacleRefreshDeferredPromotedCountThisTick).toBe(0)
    expect(state.navigationIntentDemandCachedAnchorLostCount).toBe(targetDemandBeforeAdmission)
    expect(state.zombies.navigationIntentValid[unrelated]).toBe(1)
    expect(state.zombies.navigationIntentWorldGeneration[unrelated]).toBe(
      state.collisionWorldGeneration,
    )
    expect(state.zombies.navigationIntentResolvedTick[unrelated]).toBe(heldResolvedTick)
  })
})
