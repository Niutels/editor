import assert from 'node:assert/strict'
import test from 'node:test'
import { sortLandrushExteriorEntryRoutes } from '../scenario-utils.mjs'
import scenario, {
  collectZombieEnterRoomFinalIssues,
  createZombieEnterRoomMeasurementContract,
  createZombieEnterRoomReadinessState,
  createZombieEnterRoomValidityState,
  maximumZombieEnterRoomSparseSearchFirstServiceAgeTicks,
  observeZombieEnterRoomReadiness,
  observeZombieEnterRoomStage,
  reduceZombieEnterRoomObstacleDeltaContract,
  reduceZombieEnterRoomNavigationContract,
  runZombieEnterRoomNavigationLeg,
  summarizeZombieEnterRoomPerformance,
  summarizeZombieEnterRoomState,
  waitForSettledZombieNight,
  waitForZombieEnterRoomSoakProtection,
  ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS,
  ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_CAUSAL_DELTA_FIELDS,
  ZOMBIE_ENTER_ROOM_COLLISION_REANCHOR_COUNTER_KEYS,
  ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS,
  ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
  ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_PROMOTION_KEYS,
  ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_LIVENESS_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_MAXIMUM_CADENCE_P95_MS,
  ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS,
  ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS,
  ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS,
  ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT,
  ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS,
  ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_COUNTER_KEYS,
  ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_COUNTER_KEYS,
  ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_REVISION_KEYS,
  ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS,
  ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_QUIESCENCE_FIELDS,
  ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS,
  ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_STAGE_SEQUENCE,
  ZOMBIE_ENTER_ROOM_TIMING,
  ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_TELEMETRY_KEYS,
  ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_CONSERVATION_GROUPS,
  ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS,
  ZOMBIE_ENTER_ROOM_WORLD_REFRESH_TELEMETRY_KEYS,
  zombieEnterRoomAttachmentLeaseIssues,
  zombieEnterRoomBaseIssues,
  zombieEnterRoomIntentAdmissionDeferredIssues,
  zombieEnterRoomMeteredWorkAttributionIssues,
  zombieEnterRoomNavigationLegProgressIssues,
  zombieEnterRoomObstacleDeltaTelemetryIssues,
  zombieEnterRoomObstacleRefreshIssues,
  zombieEnterRoomPerformanceIssues,
  zombieEnterRoomPresentationIssues,
  zombieEnterRoomNavigationAdmissionIssues,
  zombieEnterRoomRefreshAdmissionIssues,
  zombieEnterRoomSparseSearchProgressIssues,
  zombieEnterRoomSoakCleanupIssues,
  zombieEnterRoomStateIssues,
  zombieEnterRoomTargetRouteIssues,
  zombieEnterRoomVisibilityWorkIssues,
  zombieEnterRoomWorldRefreshIssues,
} from './landrush-zombie-enter-room.mjs'

const ROUTE = Object.freeze({
  buildingScopeId: 'building-a',
  doorId: 'door-a',
  inside: Object.freeze({ x: 2, y: 0, z: 1 }),
  levelId: 'level-ground',
  outside: Object.freeze({ x: 0, y: 0, z: 1 }),
})

const TEST_SPARSE_SEARCH_PROGRESS_KEYS = Object.freeze({
  agentEligiblePendingCountAtScheduleThisTickKey: 'testAgentEligiblePendingThisTick',
  agentMaximumPendingNoProgressAgeTicksKey: 'testAgentMaximumPendingNoProgressAge',
  agentOldestPendingNoProgressAgeTicksKey: 'testAgentOldestPendingNoProgressAge',
  agentProgressSliceCountThisTickKey: 'testAgentProgressThisTick',
  agentProgressSliceCountTotalKey: 'testAgentProgressTotal',
  agentServiceSliceCountThisTickKey: 'testAgentServiceThisTick',
  agentServiceSliceCountTotalKey: 'testAgentServiceTotal',
  completionProgressThisTickKey: 'testCompletionProgressThisTick',
  completionProgressTotalKey: 'testCompletionProgressTotal',
  firstServiceCountTotalKey: 'testFirstServiceCountTotal',
  maximumFirstServiceAgeTicksKey: 'testMaximumFirstServiceAgeTicks',
  maximumNoProgressAgeTicksKey: 'testMaximumNoProgressAgeTicks',
  minimumWorkUnitsPerAgentSliceKey: 'testMinimumWorkUnitsPerAgentSlice',
  noProgressAgeTicksKey: 'testNoProgressAgeTicks',
  remainingWorkKey: 'testRemainingWork',
  serviceSliceCountTotalKey: 'testServiceSliceCountTotal',
  serviceSliceCountThisTickKey: 'testServiceSliceCountThisTick',
  spawnMaximumNoProgressAgeTicksKey: 'testSpawnMaximumNoProgressAge',
  spawnDependencyWaitingKey: 'testSpawnDependencyWaiting',
  spawnCompletedCountTotalKey: 'testSpawnCompletedCountTotal',
  spawnInvalidatedCountTotalKey: 'testSpawnInvalidatedCountTotal',
  spawnNoProgressAgeTicksKey: 'testSpawnNoProgressAge',
  spawnPendingCountKey: 'testSpawnPendingCount',
  spawnProgressSliceCountThisTickKey: 'testSpawnProgressThisTick',
  spawnProgressSliceCountTotalKey: 'testSpawnProgressTotal',
  spawnServiceSliceCountThisTickKey: 'testSpawnServiceThisTick',
  spawnServiceSliceCountTotalKey: 'testSpawnServiceTotal',
  spawnSlicesPerTickKey: 'testSpawnSlicesPerTick',
  spawnStartedCountTotalKey: 'testSpawnStartedCountTotal',
  targetMaximumNoProgressAgeTicksKey: 'testTargetMaximumNoProgressAge',
  targetNoProgressAgeTicksKey: 'testTargetNoProgressAge',
  targetProgressSliceCountThisTickKey: 'testTargetProgressThisTick',
  targetProgressSliceCountTotalKey: 'testTargetProgressTotal',
  targetServiceSliceCountThisTickKey: 'testTargetServiceThisTick',
  targetServiceSliceCountTotalKey: 'testTargetServiceTotal',
  targetSlicesPerTickKey: 'testTargetSlicesPerTick',
  targetUpdateStatusKey: 'testTargetUpdateStatus',
})

const TEST_METERED_NAVIGATION_WORK_KEYS = Object.freeze([
  'testTargetRegionWorkTotal',
  'testCachedFollowWorkTotal',
  'testSpawnAttachmentWorkTotal',
])

const TEST_ADDITIONAL_METERED_WORK_DIMENSIONS = Object.freeze([
  Object.freeze({
    label: 'test shared-target graph edge visits',
    maximumObservedKey: 'testTargetGraphEdgeVisitsMaximumObservedPerTick',
    maximumPerTick: 512,
    maximumPerTickKey: 'testTargetGraphEdgeVisitsMaximumPerTick',
    thisTickKey: 'testTargetGraphEdgeVisitsThisTick',
    totalKey: 'testTargetGraphEdgeVisitsTotal',
    violationCountKey: 'testTargetGraphEdgeVisitBudgetViolationCount',
  }),
])

function createSampleMeteredNavigationTelemetry(aggregateWork) {
  const telemetry = {}
  for (const dimension of ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS) {
    telemetry[dimension.maximumObservedKey] = 0
    telemetry[dimension.maximumPerTickKey] = dimension.maximumPerTick
    telemetry[dimension.thisTickKey] = 0
    telemetry[dimension.totalKey] = 0
    if (dimension.violationCountKey) telemetry[dimension.violationCountKey] = 0
  }
  for (const group of ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS) {
    const sourceIndex = Math.max(
      0,
      group.sourceThisTickKeys.findIndex((key) => key.includes('SpawnSearch')),
    )
    const sourceMaximumObservedKey = group.sourceMaximumObservedKeys[sourceIndex]
    const sourceThisTickKey = group.sourceThisTickKeys[sourceIndex]
    const sourceTotalKey = group.sourceTotalKeys[sourceIndex]
    telemetry[sourceThisTickKey] = aggregateWork[group.aggregateThisTickKey] ?? 0
    telemetry[sourceTotalKey] = aggregateWork[group.aggregateTotalKey] ?? 0
    telemetry[sourceMaximumObservedKey] =
      aggregateWork[
        group.aggregateThisTickKey.replace(/ThisTick$/u, 'MaximumObservedPerTick')
      ] ?? 0
  }
  return telemetry
}

function createHeapWorkTelemetry({
  cachedMaximum = 0,
  cachedThisTick = 0,
  cachedTotal = 0,
  flowMaximum = 0,
  flowThisTick = 0,
  flowTotal = 0,
  spawnMaximum = 0,
  spawnThisTick = 0,
  spawnTotal = 0,
  targetMaximum = 0,
  targetThisTick = 0,
  targetTotal = 0,
  aggregateMaximum = cachedMaximum + flowMaximum + spawnMaximum + targetMaximum,
  aggregateThisTick = cachedThisTick + flowThisTick + spawnThisTick + targetThisTick,
  aggregateTotal = cachedTotal + flowTotal + spawnTotal + targetTotal,
} = {}) {
  return {
    navigationSparseCachedFollowHeapOperationsMaximumObservedPerTick: cachedMaximum,
    navigationSparseCachedFollowHeapOperationsThisTick: cachedThisTick,
    navigationSparseCachedFollowHeapOperationsTotal: cachedTotal,
    navigationSparseFlowSearchHeapOperationsMaximumObservedPerTick: flowMaximum,
    navigationSparseFlowSearchHeapOperationsThisTick: flowThisTick,
    navigationSparseFlowSearchHeapOperationsTotal: flowTotal,
    navigationSparseSearchHeapOperationsMaximumObservedPerTick: aggregateMaximum,
    navigationSparseSearchHeapOperationsThisTick: aggregateThisTick,
    navigationSparseSearchHeapOperationsTotal: aggregateTotal,
    navigationSparseSpawnSearchHeapOperationsMaximumObservedPerTick: spawnMaximum,
    navigationSparseSpawnSearchHeapOperationsThisTick: spawnThisTick,
    navigationSparseSpawnSearchHeapOperationsTotal: spawnTotal,
    navigationSparseTargetUpdateHeapOperationsMaximumObservedPerTick: targetMaximum,
    navigationSparseTargetUpdateHeapOperationsThisTick: targetThisTick,
    navigationSparseTargetUpdateHeapOperationsTotal: targetTotal,
  }
}

function createSampleSparseSearchProgressTelemetry({
  activeZombieCount,
  completionProgressTotal,
  serviceSliceTotal,
}) {
  return {
    navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick: 0,
    navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved: 0,
    navigationSparseSearchAgentOldestPendingNoProgressAgeTicks: 0,
    navigationSparseSearchAgentProgressSliceCountThisTick: 0,
    navigationSparseSearchAgentProgressSliceCountTotal: completionProgressTotal,
    navigationSparseSearchAgentServiceSliceCountThisTick: 0,
    navigationSparseSearchAgentServiceSliceCountTotal: serviceSliceTotal,
    navigationSparseSearchMinimumWorkUnitsPerAgentSlice: 1,
    navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved: 0,
    navigationSparseSpawnSearchDependencyWaiting: false,
    navigationSparseSpawnSearchCompletedCount: activeZombieCount,
    navigationSparseSpawnSearchInvalidatedCount: 0,
    navigationSparseSearchSpawnNoProgressAgeTicks: 0,
    navigationSparseSpawnSearchPendingCount: 0,
    navigationSparseSearchSpawnProgressSliceCountThisTick: 0,
    navigationSparseSearchSpawnProgressSliceCountTotal: 0,
    navigationSparseSearchSpawnServiceSliceCountThisTick: 0,
    navigationSparseSearchSpawnServiceSliceCountTotal: 0,
    navigationSparseSearchSpawnSlicesPerTick: 1,
    navigationSparseSpawnSearchStartedCount: activeZombieCount,
    navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved: 0,
    navigationSparseSearchTargetNoProgressAgeTicks: 0,
    navigationSparseSearchTargetProgressSliceCountThisTick: 0,
    navigationSparseSearchTargetProgressSliceCountTotal: 0,
    navigationSparseSearchTargetServiceSliceCountThisTick: 0,
    navigationSparseSearchTargetServiceSliceCountTotal: 0,
    navigationSparseSearchTargetSlicesPerTick: 1,
    navigationSparseTargetUpdateStatus: 'ready',
  }
}

function createSampleVisibilityWorkTelemetry(overrides = {}) {
  return {
    ...Object.fromEntries(
      ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.flatMap((dimension) => [
        [dimension.maximumObservedKey, 0],
        [dimension.thisTickKey, 0],
        [dimension.totalKey, 0],
      ]),
    ),
    ...overrides,
  }
}

function createSampleObstacleDeltaTelemetry(overrides = {}) {
  return {
    obstacleDeltaAllocationCountMaximumObservedPerTick: 0,
    obstacleDeltaAllocationCountThisTick: 0,
    obstacleDeltaAllocationCountTotal: 0,
    obstacleDeltaAppliedCount: 0,
    obstacleDeltaAppliedRevision: 0,
    obstacleDeltaConnectorMaskWritesMaximumObservedPerTick: 0,
    obstacleDeltaConnectorMaskWritesThisTick: 0,
    obstacleDeltaConnectorMaskWritesTotal: 0,
    obstacleDeltaFullArrayClearCountMaximumObservedPerTick: 0,
    obstacleDeltaFullArrayClearCountThisTick: 0,
    obstacleDeltaFullArrayClearCountTotal: 0,
    obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick: 0,
    obstacleDeltaObjectLookupComparisonsThisTick: 0,
    obstacleDeltaObjectLookupComparisonsTotal: 0,
    obstacleDeltaObjectMaskWritesMaximumObservedPerTick: 0,
    obstacleDeltaObjectMaskWritesThisTick: 0,
    obstacleDeltaObjectMaskWritesTotal: 0,
    obstacleDeltaRequestCount: 0,
    obstacleDeltaRequestedRevision: 0,
    obstacleDeltaRequiresRecompileCount: 0,
    obstacleDeltaRevisionAdvanceCount: 0,
    obstacleDeltaUnchangedCount: 0,
    obstacleDeltaViewRevisionAdvanceCount: 0,
    obstacleDeltaWorldCompileCountMaximumObservedPerTick: 0,
    obstacleDeltaWorldCompileCountThisTick: 0,
    obstacleDeltaWorldCompileCountTotal: 0,
    ...overrides,
  }
}

function createSampleObstacleRefreshTelemetry(overrides = {}) {
  return {
    navigationObstacleRefreshDeferredCanceledCount: 0,
    navigationObstacleRefreshDeferredMarkedCount: 0,
    navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick: 0,
    navigationObstacleRefreshDeferredPendingCount: 0,
    navigationObstacleRefreshDeferredPromotedCount: 0,
    navigationObstacleRefreshDeferredPromotedCountThisTick: 0,
    navigationObstacleRefreshDeferredPromotionBudgetPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
    navigationObstacleRefreshDiscoveryAppliedRevision: 0,
    navigationObstacleRefreshDiscoveryEpochRevision: 0,
    navigationObstacleRefreshDiscoveryRemainingSlotCount: 0,
    ...overrides,
  }
}

function createSampleRefreshAdmissionTelemetry(overrides = {}) {
  return {
    navigationRefreshSlotCapacity: 64,
    navigationRefreshAdmissionBudgetPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
    navigationRefreshAdmissionCountThisTick: 0,
    navigationRefreshAdmissionCountTotal: 0,
    navigationRefreshAdmissionMaximumCountObservedPerTick: 0,
    navigationRefreshCandidateInspectionBudgetPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.refreshCandidateInspectionBudgetPerTick,
    navigationRefreshCandidateInspectionsMaximumObservedPerTick: 0,
    navigationRefreshCandidateInspectionsThisTick: 0,
    navigationRefreshCandidateInspectionsTotal: 0,
    ...overrides,
  }
}

function createSampleIntentAdmissionTelemetry(overrides = {}) {
  const reasonPromotions = Object.fromEntries(
    ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_PROMOTION_KEYS.map((key) => [
      key,
      overrides[key] ?? 0,
    ]),
  )
  const promoted =
    overrides.navigationIntentAdmissionDeferredPromotedCount ??
    Object.values(reasonPromotions).reduce((sum, value) => sum + value, 0)
  const canceled = overrides.navigationIntentAdmissionDeferredCanceledCount ?? 0
  const pending = overrides.navigationIntentAdmissionDeferredPendingCount ?? 0
  const marked =
    overrides.navigationIntentAdmissionDeferredMarkedCount ?? promoted + canceled + pending
  const queueOperationsTotal =
    overrides.navigationIntentAdmissionDeferredQueueOperationCountTotal ??
    marked + promoted + canceled
  return {
    navigationIntentAdmissionDeferredCanceledCount: canceled,
    navigationIntentAdmissionDeferredMarkedCount: marked,
    navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick:
      overrides.navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick ??
      Math.min(
        promoted,
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      ),
    navigationIntentAdmissionDeferredPendingCount: pending,
    navigationIntentAdmissionDeferredPromotedCount: promoted,
    navigationIntentAdmissionDeferredPromotedCountThisTick: 0,
    navigationIntentAdmissionDeferredPromotionBudgetPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
    navigationIntentAdmissionDeferredQueueOperationCountThisTick: 0,
    navigationIntentAdmissionDeferredQueueOperationCountTotal: queueOperationsTotal,
    navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick:
      overrides.navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick ??
      queueOperationsTotal,
    ...reasonPromotions,
    ...overrides,
  }
}

function createSampleWorldRefreshTelemetry(
  collisionWorldGeneration,
  promotedTotal,
  restartedTotal,
  overrides = {},
) {
  return {
    navigationWorldRefreshAdmissionGeneration: collisionWorldGeneration,
    navigationWorldRefreshEpochGeneration: collisionWorldGeneration,
    navigationWorldRefreshInspectionRemaining: 0,
    navigationWorldRefreshMaximumPromotedCountObservedPerTick: Math.min(
      promotedTotal,
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
    ),
    navigationWorldRefreshMinimumAppliedGeneration: collisionWorldGeneration,
    navigationWorldRefreshPendingCount: 0,
    navigationWorldRefreshPromotedCountThisTick: 0,
    navigationWorldRefreshPromotedCountTotal: promotedTotal,
    navigationWorldRefreshRestartedCountThisTick: 0,
    navigationWorldRefreshRestartedCountTotal: restartedTotal,
    ...overrides,
  }
}

function sample({
  activeTargets = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  buildingScopeId = null,
  collisionWorldGeneration = 3,
  expectedPhase = 'night',
  fallbackRoutingRebuildCount = 0,
  frameIdx = 1,
  observedAtMs = frameIdx * 100,
  insideBuilding,
  intentAdmissionTelemetry = null,
  levelId = insideBuilding ? ROUTE.levelId : null,
  navigationAnchorInvalidationCount = 0,
  navigationAnchoredAgentCount = activeTargets,
  navigationIntentCanceledCount = 0,
  navigationIntentDemandCachedAnchorLostCount = 0,
  navigationIntentDemandCollisionRecoveryCount = 0,
  navigationIntentDemandConnectorChangedCount = 0,
  navigationIntentDemandRoutePublishedCount = 0,
  navigationIntentDemandSpawnCount = activeTargets,
  navigationIntentDemandWorldChangedCount = 0,
  navigationIntentFirstServiceCount = activeTargets,
  navigationIntentIssuedCount =
    navigationIntentDemandSpawnCount +
    navigationIntentDemandWorldChangedCount +
    navigationIntentDemandConnectorChangedCount +
    navigationIntentDemandRoutePublishedCount +
    navigationIntentDemandCachedAnchorLostCount +
    navigationIntentDemandCollisionRecoveryCount,
  navigationIntentOldestPendingAgeTicks = 0,
  navigationIntentOldestUnservicedAgeTicks = 0,
  navigationIntentMaximumUnservicedAgeTicksObserved = Math.ceil(
    activeTargets / ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
  ),
  navigationIntentPendingCount = 0,
  navigationIntentResolvedCount =
    navigationIntentIssuedCount - navigationIntentCanceledCount - navigationIntentPendingCount,
  navigationIntentResolveBudgetViolationCount = 0,
  navigationIntentUnservicedPendingCount = 0,
  navigationLivingWithoutCommittedActionCount = 0,
  navigationRetainedPendingActionCount = 0,
  navigationStaleTargetCount = 0,
  navigationGoalResolvedTick = 1,
  navigationGraphNodeCount = null,
  navigationTargetCommittedRouteGeneration = 1,
  navigationTargetRequestedRevision = 1,
  navigationWorldRevision = 1,
  navigationSparseSearchAgentSlicesPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
  navigationSparseAttachmentActiveAgentLeaseCount = 0,
  navigationSparseAttachmentAvailableAgentLeaseCount =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity,
  navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved = Math.min(
    activeTargets,
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity,
  ),
  navigationSparseAttachmentFieldSingletonLeaseReserved = true,
  navigationSparseAttachmentSpawnLeaseReserved = true,
  navigationSparseAttachmentLeaseInvariantViolationCount = 0,
  navigationSparseAttachmentMaximumHierarchyNodeCount = 64,
  navigationSparseCollisionReanchorAttemptCount = 0,
  navigationSparseCollisionReanchorCompletedCount = 0,
  navigationSparseCollisionReanchorFailedCount = 0,
  navigationSparseSearchBudgetViolationCount = 0,
  navigationSparseSearchCanceledCount = 0,
  navigationSparseSearchCandidateVisitsMaximumObservedPerTick = 32,
  navigationSparseSearchCandidateVisitsThisTick = 0,
  navigationSparseSearchCandidateVisitsTotal = activeTargets * 6,
  navigationSparseSearchCollisionPredicatesMaximumObservedPerTick = 8,
  navigationSparseSearchCollisionPredicatesThisTick = 0,
  navigationSparseSearchCollisionPredicatesTotal = activeTargets,
  navigationSparseSearchCompletedCount = activeTargets,
  navigationSparseSearchCompletionProgressThisTick = 0,
  navigationSparseSearchCompletionProgressTotal = activeTargets,
  navigationSparseSearchHeapOperationsMaximumObservedPerTick = 0,
  navigationSparseSearchHeapOperationsThisTick = 0,
  navigationSparseSearchHeapOperationsTotal = 0,
  navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick = 32,
  navigationSparseSearchHierarchyNodeVisitsThisTick = 0,
  navigationSparseSearchHierarchyNodeVisitsTotal = activeTargets * 8,
  navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick = 0,
  navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsThisTick = 0,
  navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal = 0,
  meteredNavigationTelemetry = null,
  navigationSparseSearchMaximumCandidateVisitsPerAgentSlice =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCandidateVisitsPerAgentSlice,
  navigationSparseSearchMaximumCandidateVisitsPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCandidateVisitsPerTick,
  navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCollisionPredicatesPerAgentSlice,
  navigationSparseSearchMaximumCollisionPredicatesPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCollisionPredicatesPerTick,
  navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHierarchyNodeVisitsPerAgentSlice,
  navigationSparseSearchMaximumHierarchyNodeVisitsPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHierarchyNodeVisitsPerTick,
  navigationSparseSearchMaximumHeapOperationsPerAgentSlice =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerAgentSlice,
  navigationSparseSearchMaximumHeapOperationsPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerTick,
  navigationSparseSearchMaximumSupportPredicatesPerAgentSlice =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumSupportPredicatesPerAgentSlice,
  navigationSparseSearchMaximumSupportPredicatesPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumSupportPredicatesPerTick,
  navigationSparseSearchMaximumTargetBuildsPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick,
  navigationSparseSearchCompactTargetMaximumNodeCount = 256,
  navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick = 256,
  navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick = 512,
  navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick = 512,
  navigationSparseSearchMaximumTargetCandidateVisitsPerTick = 1_024,
  navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick = 1_024,
  navigationSparseSearchMaximumTargetHeapOperationsPerTick = 3_072,
  navigationSparseSearchPendingAgentCount = 0,
  navigationSparseSearchActiveAgentCount = navigationSparseSearchPendingAgentCount,
  navigationSparseSearchInvalidatedCount = 0,
  navigationSparseSearchMaximumNoProgressAgeTicksObserved = 0,
  navigationSparseSearchNoProgressAgeTicks = 0,
  navigationSparseSearchRestartedCount = 0,
  navigationSparseSearchRestartedCollisionRecoveryCount = 0,
  navigationSparseSearchRestartedRoutePublishedCount = 0,
  navigationSparseSearchRestartedWorldChangedCount = 0,
  navigationSparseSearchWorldStaleActiveCount = 0,
  navigationSparseSearchServiceSliceCountThisTick = 0,
  navigationSparseSearchServiceSliceCountTotal = activeTargets,
  navigationSparseSearchStartedCount = activeTargets,
  navigationSparseSearchSupportPredicatesMaximumObservedPerTick = 16,
  navigationSparseSearchSupportPredicatesThisTick = 0,
  navigationSparseSearchSupportPredicatesTotal = activeTargets * 3,
  navigationSparseSearchTargetBuildsMaximumObservedPerTick = 2,
  navigationSparseSearchTargetBuildsThisTick = 0,
  navigationSparseSearchTargetBuildsTotal = 2,
  navigationSparseSearchUncausedStartViolationCount = 0,
  night = 1,
  nodeCount = 240,
  obstacleDeltaAppliedRevision = 0,
  obstacleDamageSuppressed = true,
  obstacleDeltaRequestedRevision = 0,
  obstacleDeltaTelemetry = null,
  obstacleRefreshTelemetry = null,
  refreshAdmissionTelemetry = null,
  phase = 'night',
  phaseHeld = true,
  phaseReady = true,
  playerProtected = true,
  presentationActiveZombieCount = activeTargets,
  presentationDetailedActiveCount = Math.min(activeTargets, 16),
  presentationDetailedCapacity = 16,
  presentationInstancedActiveCount =
    presentationActiveZombieCount - presentationDetailedActiveCount,
  presentationAuthoredInstancedActiveCount = presentationInstancedActiveCount,
  presentationAuthoredInstancedBatchCount =
    presentationAuthoredInstancedActiveCount > 0 ? 10 : 0,
  presentationFallbackCount = 0,
  presentationUnpresentedActiveCount = 0,
  remaining,
  roomSoakActiveZombieCount = activeTargets,
  roomSoakEnabled = true,
  roomSoakReachableSpawnCompletedCount = activeTargets,
  roomSoakRepresentedZombieCount = activeTargets,
  roomSoakRosterRealized = activeTargets === ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  roomSoakScheduledZombieCount = activeTargets,
  roomSoakTargetZombieCount = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  routingNavigationMode = 'sparse',
  routingGraphAttachmentCandidateCount = 84,
  routingGraphAttachmentFullSearchCount = 14,
  routingGraphAttachmentSupportCheckCount = 42,
  routingMaximumResolveCountObservedPerTick = Math.min(
    activeTargets,
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick,
  ),
  routingRebuildCount = 1,
  routingResolveBudgetPerTick = ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick,
  routingResolveCount = navigationIntentResolvedCount,
  routingResolveCountThisTick = 0,
  routingTargetLayerIndex = 0,
  speed = 0,
  spatialBuildCount = frameIdx,
  spatialCandidateInspectionCount = frameIdx * 48,
  spatialIndexedAgentCount = activeTargets,
  spatialMaximumCandidateInspectionsObserved = 48,
  spatialMaximumCandidateInspectionsPerQuery = 48,
  spatialOverflowQueryCount = frameIdx,
  spatialPairInspectionCount = frameIdx * 47,
  spatialQueryCount = frameIdx,
  spatialSeparationNeighborCount = frameIdx * 8,
  spatialUnindexedAgentCount = 0,
  sparseSearchProgressTelemetry = null,
  status = 'playing',
  simulationTick = frameIdx,
  visibilityWorkTelemetry = null,
  worldRefreshTelemetry = null,
  x = insideBuilding ? ROUTE.inside.x : ROUTE.outside.x,
  y = 0,
  zombieCapacity = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  z = insideBuilding ? ROUTE.inside.z : ROUTE.outside.z,
}) {
  const resolvedBuildingScopeId = insideBuilding
    ? (buildingScopeId ?? ROUTE.buildingScopeId)
    : buildingScopeId
  const defaultMeteredNavigationTelemetry = createSampleMeteredNavigationTelemetry({
    navigationSparseSearchCandidateVisitsMaximumObservedPerTick,
    navigationSparseSearchCandidateVisitsThisTick,
    navigationSparseSearchCandidateVisitsTotal,
    navigationSparseSearchCollisionPredicatesMaximumObservedPerTick,
    navigationSparseSearchCollisionPredicatesThisTick,
    navigationSparseSearchCollisionPredicatesTotal,
    navigationSparseSearchHeapOperationsMaximumObservedPerTick,
    navigationSparseSearchHeapOperationsThisTick,
    navigationSparseSearchHeapOperationsTotal,
    navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseSearchHierarchyNodeVisitsThisTick,
    navigationSparseSearchHierarchyNodeVisitsTotal,
    navigationSparseSearchSupportPredicatesMaximumObservedPerTick,
    navigationSparseSearchSupportPredicatesThisTick,
    navigationSparseSearchSupportPredicatesTotal,
  })
  const defaultSparseSearchProgressTelemetry = createSampleSparseSearchProgressTelemetry({
    activeZombieCount: activeTargets,
    completionProgressTotal: navigationSparseSearchCompletionProgressTotal,
    serviceSliceTotal: navigationSparseSearchServiceSliceCountTotal,
  })
  const defaultVisibilityWorkTelemetry = createSampleVisibilityWorkTelemetry()
  const defaultObstacleDeltaTelemetry = createSampleObstacleDeltaTelemetry()
  const resolvedObstacleDeltaTelemetry = {
    ...defaultObstacleDeltaTelemetry,
    ...(obstacleDeltaTelemetry ?? {}),
  }
  const defaultObstacleRefreshTelemetry = createSampleObstacleRefreshTelemetry({
    navigationObstacleRefreshDiscoveryAppliedRevision:
      resolvedObstacleDeltaTelemetry.obstacleDeltaAppliedRevision,
    navigationObstacleRefreshDiscoveryEpochRevision:
      resolvedObstacleDeltaTelemetry.obstacleDeltaAppliedRevision,
  })
  const resolvedObstacleRefreshTelemetry = {
    ...defaultObstacleRefreshTelemetry,
    ...(obstacleRefreshTelemetry ?? {}),
  }
  const defaultIntentAdmissionTelemetry = createSampleIntentAdmissionTelemetry({
    navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount:
      navigationIntentDemandCachedAnchorLostCount,
    navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount:
      navigationIntentDemandCollisionRecoveryCount,
    navigationIntentAdmissionDeferredPromotedConnectorChangedCount:
      navigationIntentDemandConnectorChangedCount,
    navigationIntentAdmissionDeferredPromotedSpawnCount: navigationIntentDemandSpawnCount,
    navigationIntentAdmissionDeferredPromotedWorldChangedCount:
      navigationIntentDemandWorldChangedCount,
  })
  const resolvedIntentAdmissionTelemetry = {
    ...defaultIntentAdmissionTelemetry,
    ...(intentAdmissionTelemetry ?? {}),
  }
  const resolvedRefreshAdmissionTotal =
    resolvedIntentAdmissionTelemetry.navigationIntentAdmissionDeferredPromotedCount
  const defaultWorldRefreshTelemetry = createSampleWorldRefreshTelemetry(
    collisionWorldGeneration,
    navigationIntentDemandWorldChangedCount,
    navigationSparseSearchRestartedWorldChangedCount,
  )
  const resolvedWorldRefreshTelemetry = {
    ...defaultWorldRefreshTelemetry,
    ...(worldRefreshTelemetry ?? {}),
  }
  const defaultRefreshAdmissionTelemetry = createSampleRefreshAdmissionTelemetry({
    navigationRefreshSlotCapacity: Math.max(64, activeTargets),
    navigationRefreshAdmissionCountTotal: resolvedRefreshAdmissionTotal,
    navigationRefreshAdmissionMaximumCountObservedPerTick: Math.min(
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      resolvedObstacleRefreshTelemetry.navigationObstacleRefreshDeferredPromotedCount,
    ),
    navigationRefreshCandidateInspectionsMaximumObservedPerTick: Math.min(
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.refreshCandidateInspectionBudgetPerTick,
      resolvedRefreshAdmissionTotal,
    ),
    navigationRefreshCandidateInspectionsTotal: resolvedRefreshAdmissionTotal,
  })
  return {
    bridge: { frameIdx, nodeCount },
    documentVisibility: 'visible',
    observedAtMs,
    floor: {
      buildingScopeId: resolvedBuildingScopeId,
      insideBuilding,
      levelId,
    },
    hud: { expectedPhase, phase, phaseReady },
    loaderCount: 0,
    navigation: {
      heading: 0.25,
      robot: { x, y, z },
      speed,
    },
    presentation: {
      activeMixerCount: presentationDetailedActiveCount,
      activeZombieCount: presentationActiveZombieCount,
      allocatedRootCount: presentationDetailedActiveCount,
      authoredInstancedActiveCount: presentationAuthoredInstancedActiveCount,
      authoredInstancedBatchCount: presentationAuthoredInstancedBatchCount,
      detailedActiveCount: presentationDetailedActiveCount,
      detailedCapacity: presentationDetailedCapacity,
      fallbackCount: presentationFallbackCount,
      instancedActiveCount: presentationInstancedActiveCount,
      rootCapacity: 20,
      unpresentedActiveCount: presentationUnpresentedActiveCount,
    },
    zombie: {
      activeTargets,
      benchmarkRoomSoak: {
        activeZombieCount: roomSoakActiveZombieCount,
        enabled: roomSoakEnabled,
        obstacleDeltaAppliedRevision,
        obstacleDamageSuppressed,
        obstacleDeltaRequestedRevision,
        phaseHeld,
        playerProtected,
        reachableSpawnCompletedCount: roomSoakReachableSpawnCompletedCount,
        representedZombieCount: roomSoakRepresentedZombieCount,
        rosterRealized: roomSoakRosterRealized,
        scheduledZombieCount: roomSoakScheduledZombieCount,
        targetZombieCount: roomSoakTargetZombieCount,
        zombieCapacity,
      },
      expectedPhase,
      integratedIntoExistingCanvas: true,
      night,
      performance: {
        collisionWorldGeneration,
        routing: {
          fallbackRebuildCount: fallbackRoutingRebuildCount,
          navigationAnchorInvalidationCount,
          navigationAnchoredAgentCount,
          navigationIntentCanceledCount,
          navigationIntentDemandCachedAnchorLostCount,
          navigationIntentDemandCollisionRecoveryCount,
          navigationIntentDemandConnectorChangedCount,
          navigationIntentDemandRoutePublishedCount,
          navigationIntentDemandSpawnCount,
          navigationIntentDemandWorldChangedCount,
          navigationIntentIssuedCount,
          navigationIntentFirstServiceCount,
          navigationIntentMaximumUnservicedAgeTicksObserved,
          navigationIntentMaximumResolveCountObservedPerTick:
            routingMaximumResolveCountObservedPerTick,
          navigationIntentOldestPendingAgeTicks,
          navigationIntentOldestUnservicedAgeTicks,
          navigationIntentPendingCount,
          navigationIntentResolvedCount,
          navigationIntentResolveBudgetPerTick: routingResolveBudgetPerTick,
          navigationIntentResolveBudgetViolationCount,
          navigationIntentResolveCountThisTick: routingResolveCountThisTick,
          navigationIntentUnservicedPendingCount,
          navigationLivingWithoutCommittedActionCount,
          navigationRetainedPendingActionCount,
          navigationStaleTargetCount,
          navigationGoalResolvedTick,
          navigationGraphNodeCount: navigationGraphNodeCount ?? nodeCount,
          navigationTargetCommittedRouteGeneration,
          navigationTargetRequestedRevision,
          navigationWorldRevision,
          navigationSparseAttachmentActiveAgentLeaseCount,
          navigationSparseAttachmentAvailableAgentLeaseCount,
          navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved,
          navigationSparseAttachmentFieldSingletonLeaseReserved,
          navigationSparseAttachmentSpawnLeaseReserved,
          navigationSparseAttachmentLeaseInvariantViolationCount,
          navigationSparseAttachmentMaximumHierarchyNodeCount,
          navigationSparseCollisionReanchorAttemptCount,
          navigationSparseCollisionReanchorCompletedCount,
          navigationSparseCollisionReanchorFailedCount,
          navigationSparseSearchAgentSlicesPerTick,
          navigationSparseSearchActiveAgentCount,
          navigationSparseSearchBudgetViolationCount,
          navigationSparseSearchCanceledCount,
          navigationSparseSearchCandidateVisitsMaximumObservedPerTick,
          navigationSparseSearchCandidateVisitsThisTick,
          navigationSparseSearchCandidateVisitsTotal,
          navigationSparseSearchCollisionPredicatesMaximumObservedPerTick,
          navigationSparseSearchCollisionPredicatesThisTick,
          navigationSparseSearchCollisionPredicatesTotal,
          navigationSparseSearchCompletedCount,
          navigationSparseSearchCompletionProgressThisTick,
          navigationSparseSearchCompletionProgressTotal,
          navigationSparseSearchHeapOperationsMaximumObservedPerTick,
          navigationSparseSearchHeapOperationsThisTick,
          navigationSparseSearchHeapOperationsTotal,
          navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick,
          navigationSparseSearchHierarchyNodeVisitsThisTick,
          navigationSparseSearchHierarchyNodeVisitsTotal,
          navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick,
          navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsThisTick,
          navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal,
          navigationSparseSearchMaximumCandidateVisitsPerAgentSlice,
          navigationSparseSearchMaximumCandidateVisitsPerTick,
          navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice,
          navigationSparseSearchMaximumCollisionPredicatesPerTick,
          navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice,
          navigationSparseSearchMaximumHierarchyNodeVisitsPerTick,
          navigationSparseSearchMaximumHeapOperationsPerAgentSlice,
          navigationSparseSearchMaximumHeapOperationsPerTick,
          navigationSparseSearchMaximumSupportPredicatesPerAgentSlice,
          navigationSparseSearchMaximumSupportPredicatesPerTick,
          navigationSparseSearchMaximumTargetBuildsPerTick,
          navigationSparseSearchCompactTargetMaximumNodeCount,
          navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick,
          navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick,
          navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick,
          navigationSparseSearchMaximumTargetCandidateVisitsPerTick,
          navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick,
          navigationSparseSearchMaximumTargetHeapOperationsPerTick,
          navigationSparseSearchPendingAgentCount,
          navigationSparseSearchInvalidatedCount,
          navigationSparseSearchMaximumNoProgressAgeTicksObserved,
          navigationSparseSearchNoProgressAgeTicks,
          navigationSparseSearchRestartedCount,
          navigationSparseSearchRestartedCollisionRecoveryCount,
          navigationSparseSearchRestartedRoutePublishedCount,
          navigationSparseSearchRestartedWorldChangedCount,
          navigationSparseSearchWorldStaleActiveCount,
          navigationSparseSearchServiceSliceCountThisTick,
          navigationSparseSearchServiceSliceCountTotal,
          navigationSparseSearchStartedCount,
          navigationSparseSearchSupportPredicatesMaximumObservedPerTick,
          navigationSparseSearchSupportPredicatesThisTick,
          navigationSparseSearchSupportPredicatesTotal,
          navigationSparseSearchTargetBuildsMaximumObservedPerTick,
          navigationSparseSearchTargetBuildsThisTick,
          navigationSparseSearchTargetBuildsTotal,
          navigationSparseSearchUncausedStartViolationCount,
          ...defaultVisibilityWorkTelemetry,
          ...(visibilityWorkTelemetry ?? {}),
          ...resolvedObstacleDeltaTelemetry,
          ...resolvedObstacleRefreshTelemetry,
          ...defaultRefreshAdmissionTelemetry,
          ...(refreshAdmissionTelemetry ?? {}),
          ...resolvedIntentAdmissionTelemetry,
          ...resolvedWorldRefreshTelemetry,
          ...defaultSparseSearchProgressTelemetry,
          ...(sparseSearchProgressTelemetry ?? {}),
          ...defaultMeteredNavigationTelemetry,
          ...(meteredNavigationTelemetry ?? {}),
          graphAttachmentCandidateCount: routingGraphAttachmentCandidateCount,
          graphAttachmentFullSearchCount: routingGraphAttachmentFullSearchCount,
          graphAttachmentSupportCheckCount: routingGraphAttachmentSupportCheckCount,
          maximumResolveCountObservedPerTick: routingMaximumResolveCountObservedPerTick,
          navigationMode: routingNavigationMode,
          rebuildCount: routingRebuildCount,
          resolveBudgetPerTick: routingResolveBudgetPerTick,
          resolveCount: routingResolveCount,
          resolveCountThisTick: routingResolveCountThisTick,
          simulationTick,
          targetLayerIndex: routingTargetLayerIndex,
        },
        spatial: {
          buildCount: spatialBuildCount,
          candidateInspectionCount: spatialCandidateInspectionCount,
          indexedAgentCount: spatialIndexedAgentCount,
          maximumCandidateInspectionsObserved: spatialMaximumCandidateInspectionsObserved,
          maximumCandidateInspectionsPerQuery: spatialMaximumCandidateInspectionsPerQuery,
          overflowQueryCount: spatialOverflowQueryCount,
          pairInspectionCount: spatialPairInspectionCount,
          queryCount: spatialQueryCount,
          separationNeighborCount: spatialSeparationNeighborCount,
          unindexedAgentCount: spatialUnindexedAgentCount,
        },
      },
      phase,
      phaseReady,
      phaseSecondsRemaining: remaining,
      status,
    },
  }
}

function observe(state, { cycle, frameIdx, insideBuilding, remaining, stage }) {
  const target = insideBuilding ? ROUTE.inside : ROUTE.outside
  const previous = state.lastPerformance
  const transitionPublication = stage === 'entered' || stage === 'exited' ? 1 : 0
  const navigationIntentDemandSpawnCount =
    previous?.navigationIntentDemandSpawnCount ?? ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
  const navigationIntentIssuedCount = navigationIntentDemandSpawnCount
  const transitionTickCount = transitionPublication ? 4 : 1
  const result = observeZombieEnterRoomStage(
    state,
    sample({
      frameIdx,
      insideBuilding,
      navigationIntentDemandSpawnCount,
      navigationIntentIssuedCount,
      navigationIntentResolvedCount: navigationIntentIssuedCount,
      navigationTargetCommittedRouteGeneration:
        (previous?.navigationTargetCommittedRouteGeneration ?? 1) + transitionPublication,
      navigationTargetRequestedRevision:
        (previous?.navigationTargetRequestedRevision ?? 1) + transitionPublication * 3,
      navigationSparseSearchTargetBuildsTotal:
        (previous?.navigationSparseSearchTargetBuildsTotal ?? 2) + transitionPublication * 2,
      remaining,
      routingResolveCount: navigationIntentIssuedCount,
      simulationTick: (previous?.simulationTick ?? 0) + transitionTickCount,
    }),
    {
      cycle,
      expectedInside: insideBuilding,
      route: ROUTE,
      stage,
      target,
    },
  )
  assert.deepEqual(result.issues, [])
  return result.state
}

function causalPerformance(options) {
  return summarizeZombieEnterRoomPerformance(
    sample({ insideBuilding: false, remaining: 170, ...options }),
  )
}

function withTestSparseSearchTelemetry(
  performance,
  {
    completionProgressTotal = 10,
    serviceSliceCountTotal = 1,
    agentEligiblePendingCountAtScheduleThisTick = 0,
    agentMaximumPendingNoProgressAgeTicks = 1,
    agentOldestPendingNoProgressAgeTicks = 0,
    agentProgressSliceCountThisTick = 0,
    agentProgressSliceCountTotal = completionProgressTotal,
    agentServiceSliceCountThisTick = 0,
    agentServiceSliceCountTotal = serviceSliceCountTotal,
    completionProgressThisTick = 0,
    firstServiceCountTotal = 1,
    maximumFirstServiceAgeTicks = 1,
    remainingWork = 10,
    serviceSliceCountThisTick = 0,
    spawnMaximumNoProgressAgeTicks = 0,
    spawnDependencyWaiting = false,
    spawnCompletedCountTotal = 0,
    spawnInvalidatedCountTotal = 0,
    spawnNoProgressAgeTicks = 0,
    spawnPendingCount = 0,
    spawnProgressSliceCountThisTick = 0,
    spawnProgressSliceCountTotal = 0,
    spawnServiceSliceCountThisTick = 0,
    spawnServiceSliceCountTotal = 0,
    spawnStartedCountTotal = 0,
    targetMaximumNoProgressAgeTicks = 0,
    targetNoProgressAgeTicks = 0,
    targetProgressSliceCountThisTick = 0,
    targetProgressSliceCountTotal = 0,
    targetServiceSliceCountThisTick = 0,
    targetServiceSliceCountTotal = 0,
    targetUpdateStatus = 'ready',
    targetRegionWorkTotal = 4,
    cachedFollowWorkTotal = 5,
    spawnAttachmentWorkTotal = 6,
    maximumNoProgressAgeTicks = Math.max(
      agentMaximumPendingNoProgressAgeTicks,
      spawnMaximumNoProgressAgeTicks,
      targetMaximumNoProgressAgeTicks,
    ),
    noProgressAgeTicks = Math.max(
      agentOldestPendingNoProgressAgeTicks,
      spawnNoProgressAgeTicks,
      targetNoProgressAgeTicks,
    ),
  } = {},
) {
  return {
    ...performance,
    testAgentEligiblePendingThisTick: agentEligiblePendingCountAtScheduleThisTick,
    testAgentMaximumPendingNoProgressAge: agentMaximumPendingNoProgressAgeTicks,
    testAgentOldestPendingNoProgressAge: agentOldestPendingNoProgressAgeTicks,
    testAgentProgressThisTick: agentProgressSliceCountThisTick,
    testAgentProgressTotal: agentProgressSliceCountTotal,
    testAgentServiceThisTick: agentServiceSliceCountThisTick,
    testAgentServiceTotal: agentServiceSliceCountTotal,
    testCachedFollowWorkTotal: cachedFollowWorkTotal,
    testCompletionProgressThisTick: completionProgressThisTick,
    testCompletionProgressTotal: completionProgressTotal,
    testFirstServiceCountTotal: firstServiceCountTotal,
    testMaximumFirstServiceAgeTicks: maximumFirstServiceAgeTicks,
    testMaximumNoProgressAgeTicks: maximumNoProgressAgeTicks,
    testMinimumWorkUnitsPerAgentSlice: 1,
    testNoProgressAgeTicks: noProgressAgeTicks,
    testRemainingWork: remainingWork,
    testServiceSliceCountThisTick: serviceSliceCountThisTick,
    testServiceSliceCountTotal: serviceSliceCountTotal,
    testSpawnMaximumNoProgressAge: spawnMaximumNoProgressAgeTicks,
    testSpawnDependencyWaiting: spawnDependencyWaiting,
    testSpawnCompletedCountTotal: spawnCompletedCountTotal,
    testSpawnInvalidatedCountTotal: spawnInvalidatedCountTotal,
    testSpawnNoProgressAge: spawnNoProgressAgeTicks,
    testSpawnPendingCount: spawnPendingCount,
    testSpawnProgressThisTick: spawnProgressSliceCountThisTick,
    testSpawnProgressTotal: spawnProgressSliceCountTotal,
    testSpawnServiceThisTick: spawnServiceSliceCountThisTick,
    testSpawnServiceTotal: spawnServiceSliceCountTotal,
    testSpawnSlicesPerTick: 1,
    testSpawnStartedCountTotal: spawnStartedCountTotal,
    testSpawnAttachmentWorkTotal: spawnAttachmentWorkTotal,
    testTargetMaximumNoProgressAge: targetMaximumNoProgressAgeTicks,
    testTargetNoProgressAge: targetNoProgressAgeTicks,
    testTargetProgressThisTick: targetProgressSliceCountThisTick,
    testTargetProgressTotal: targetProgressSliceCountTotal,
    testTargetRegionWorkTotal: targetRegionWorkTotal,
    testTargetServiceThisTick: targetServiceSliceCountThisTick,
    testTargetServiceTotal: targetServiceSliceCountTotal,
    testTargetSlicesPerTick: 1,
    testTargetUpdateStatus: targetUpdateStatus,
  }
}

test('scenario is deterministic and observer-light by construction', () => {
  assert.equal(scenario.name, 'landrush-zombie-enter-room')
  assert.equal(scenario.fixture, 'outside')
  assert.equal(scenario.lifecycle.captureInitialCheckpoint, false)
  assert.equal(scenario.lifecycle.watchdog, false)
  assert.equal(scenario.lifecycle.warmupSeconds, 20)
  assert.deepEqual(scenario.measurementContract(), createZombieEnterRoomMeasurementContract(16))
  assert.deepEqual(
    scenario.measurementContract({ args: { 'zombie-detailed-capacity': '0' } }),
    createZombieEnterRoomMeasurementContract(0),
  )
  assert.equal(
    scenario.measurementContract().cadence.maximumP95Ms,
    ZOMBIE_ENTER_ROOM_MAXIMUM_CADENCE_P95_MS,
  )
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.pollMs >= 300, true)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs >= 300, true)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.premeasurementQuiescenceTimeoutMs, 90_000)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples, 12)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveRosterSamples >= 4, true)
  assert.equal(ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT, 100)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.motionPollMs, 100)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.steadyHoldMs, 30_000)
  assert.equal(ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS, 180_000)
  assert.equal(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick, 16)
  assert.equal(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity, 8)
  assert.equal(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentTotalLeaseCapacity, 10)
  assert.equal(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick, 8)
  assert.equal(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumNoProgressAgeTicks, 1)
  assert.equal(
    ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.spawnDependencyWaitingKey,
    'navigationSparseSpawnSearchDependencyWaiting',
  )
  assert.deepEqual(
    ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS.map(
      ({ maximumPerAgentSlice, maximumPerTick }) => [
        maximumPerAgentSlice,
        maximumPerTick,
      ],
    ),
    [
      [32, 256],
      [32, 256],
      [16, 128],
      [8, 64],
      [32, 256],
    ],
  )
  assert.equal(
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick,
    2,
  )
  assert.equal(ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS.length, 6)
  assert.deepEqual(ZOMBIE_ENTER_ROOM_COLLISION_REANCHOR_COUNTER_KEYS, [
    'navigationSparseCollisionReanchorAttemptCount',
    'navigationSparseCollisionReanchorCompletedCount',
    'navigationSparseCollisionReanchorFailedCount',
  ])
  assert.ok(
    ZOMBIE_ENTER_ROOM_CAUSAL_DELTA_FIELDS.includes(
      'navigationSparseSearchCandidateVisitsTotal',
    ),
  )
  assert.deepEqual(ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS, {
    entry: 'zombie-enter-room-single-entry',
    obstacleDelta: 'zombie-enter-room-obstacle-delta',
    steadyInside: 'zombie-enter-room-steady-inside',
    steadyOutside: 'zombie-enter-room-steady-outside',
    transitionStress: 'zombie-enter-room-repeated-transition-stress',
  })
  assert.deepEqual(ZOMBIE_ENTER_ROOM_STAGE_SEQUENCE, [
    'outside-hold',
    'entered',
    'inside-hold',
    'exited',
  ])
  const params = scenario.urlParams()
  assert.match(params, /landrushProbe=1/u)
  assert.match(params, /benchmarkReport=outside/u)
  assert.match(params, /game=zombie-escape/u)
  assert.match(params, /landrushNavDebug=1/u)
  assert.match(params, /landrushZombieRoomSoak=1/u)
  assert.equal(params.includes('landrushProbeDom'), false)
  assert.equal(params.includes('landrushFloorProbeDom'), false)
  const executeSource = scenario.execute.toString()
  assert.equal(executeSource.includes('measurementContract: preparedMeasurementContract'), true)
  assert.equal(executeSource.includes('placeLandrushPlayerAt'), false)
  assert.equal(executeSource.includes('startMove'), false)
  assert.equal(executeSource.includes('startNavigationLeg'), false)
  assert.equal(executeSource.includes('runZombieEnterRoomNavigationLeg'), true)
  assert.equal(executeSource.includes('requestZombieEnterRoomObstacleDelta'), true)
  assert.ok(
    executeSource.indexOf('requestZombieEnterRoomObstacleDelta') >
      executeSource.indexOf('const entryLeg'),
  )
  assert.ok(
    executeSource.indexOf('requestZombieEnterRoomObstacleDelta') <
      executeSource.indexOf('const insideHold'),
  )
  const prepareSource = scenario.prepare.toString()
  assert.equal(
    prepareSource.includes('findTraversableLandrushExteriorEntryRoute'),
    true,
  )
  const firstProtectionIndex = prepareSource.indexOf(
    'await waitForZombieEnterRoomSoakProtection(page, sleep)',
  )
  const warmupBoundaryIndex = prepareSource.indexOf('preparePass = 1')
  const secondProtectionIndex = prepareSource.indexOf(
    'await waitForZombieEnterRoomSoakProtection(page, sleep)',
    firstProtectionIndex + 1,
  )
  const settledRosterIndex = prepareSource.indexOf(
    'await waitForSettledZombieNight(page, sleep)',
  )
  assert.ok(firstProtectionIndex >= 0)
  assert.ok(firstProtectionIndex < warmupBoundaryIndex)
  assert.ok(warmupBoundaryIndex < secondProtectionIndex)
  assert.ok(secondProtectionIndex < settledRosterIndex)
  const navigationLegSource = runZombieEnterRoomNavigationLeg.toString()
  assert.equal(navigationLegSource.includes('input.keyDown'), true)
  assert.equal(navigationLegSource.includes('input.keyUp'), true)
  assert.equal(navigationLegSource.includes('readZombieEnterRoomState'), true)
  assert.equal(navigationLegSource.includes('zombie-enter-room-navigation-leg-sample'), true)
  assert.equal(executeSource.includes('-stage-inside'), true)
  assert.equal(executeSource.includes('-stage-outside'), true)
  assert.equal(executeSource.includes('ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS'), true)
  assert.equal(ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS.length, 22)
  assert.equal(ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS.length, 58)
  assert.deepEqual(ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS, {
    maximumObservedKey:
      'navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick',
    thisTickKey:
      'navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsThisTick',
    totalKey: 'navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal',
  })
  assert.equal(ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.length, 7)
  assert.equal(ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_CONSERVATION_GROUPS.length, 3)
  assert.equal(ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS.length, 6)
  assert.ok(
    ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS.includes(
      'navigationSparseTargetUpdateGraphEdgeVisitsTotal',
    ),
  )
  assert.ok(
    ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS.includes(
      'navigationVisibilitySupportRingEdgeVisitsTotal',
    ),
  )
  assert.ok(
    ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS.includes(
      'obstacleDeltaFullArrayClearCountTotal',
    ),
  )
  assert.ok(
    ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS.includes(
      'navigationSparseCachedFollowCollisionPredicatesMaximumObservedPerTick',
    ),
  )
  assert.ok(
    ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS.includes(
      'navigationSparseSpawnSearchSupportPredicatesTotal',
    ),
  )
  assert.deepEqual(
    ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS.find(
      ({ label }) => label === 'heap operations',
    )?.sourceTotalKeys,
    [
      'navigationSparseCachedFollowHeapOperationsTotal',
      'navigationSparseFlowSearchHeapOperationsTotal',
      'navigationSparseSpawnSearchHeapOperationsTotal',
      'navigationSparseTargetUpdateHeapOperationsTotal',
    ],
  )
  assert.equal(ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS.length, 6)
  assert.deepEqual(
    ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS.find(
      ({ label }) => label === 'graph edge visits',
    )?.sourceTotalKeys,
    ['navigationSparseTargetUpdateGraphEdgeVisitsTotal'],
  )
})

test('attachment-query leases conserve the eight-agent pool and two fixed reservations', () => {
  const performance = causalPerformance({ frameIdx: 100, simulationTick: 100 })
  assert.deepEqual(zombieEnterRoomAttachmentLeaseIssues(performance), [])
  assert.equal(
    performance.navigationSparseAttachmentActiveAgentLeaseCount +
      performance.navigationSparseAttachmentAvailableAgentLeaseCount +
      Number(performance.navigationSparseAttachmentFieldSingletonLeaseReserved) +
      Number(performance.navigationSparseAttachmentSpawnLeaseReserved),
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentTotalLeaseCapacity,
  )

  const targetDoesNotOwnLease = {
    ...performance,
    navigationSparseTargetUpdateStatus: 'pending',
  }
  assert.deepEqual(zombieEnterRoomAttachmentLeaseIssues(targetDoesNotOwnLease), [])

  for (const malformed of [
    {
      ...performance,
      navigationSparseAttachmentAvailableAgentLeaseCount: 7,
    },
    {
      ...performance,
      navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved: 9,
    },
    {
      ...performance,
      navigationSparseAttachmentFieldSingletonLeaseReserved: false,
    },
    {
      ...performance,
      navigationSparseAttachmentSpawnLeaseReserved: false,
    },
    {
      ...performance,
      navigationSparseAttachmentLeaseInvariantViolationCount: 1,
    },
  ]) {
    assert.notDeepEqual(zombieEnterRoomAttachmentLeaseIssues(malformed), [])
  }

  const missing = { ...performance }
  delete missing.navigationSparseAttachmentActiveAgentLeaseCount
  assert.ok(
    zombieEnterRoomAttachmentLeaseIssues(missing).some((issue) =>
      issue.includes('navigationSparseAttachmentActiveAgentLeaseCount=undefined'),
    ),
  )

  const fractionalHierarchy = {
    ...performance,
    navigationSparseAttachmentMaximumHierarchyNodeCount: 1.5,
  }
  assert.ok(
    zombieEnterRoomPerformanceIssues(fractionalHierarchy).some((issue) =>
      issue.includes('navigationSparseAttachmentMaximumHierarchyNodeCount must be an integer'),
    ),
  )
})

test('room soak protection retries the atomic begin bridge until every control is active', async () => {
  const protectedState = {
    activeZombieCount: 0,
    enabled: true,
    obstacleDamageSuppressed: true,
    phaseHeld: true,
    playerProtected: true,
    reachableSpawnCompletedCount: 0,
    representedZombieCount: 0,
    rosterRealized: false,
    scheduledZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    targetZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    zombieCapacity: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  }
  const beginSnapshots = [
    null,
    {
      activeZombieCount: 0,
      enabled: true,
      obstacleDamageSuppressed: false,
      phaseHeld: false,
      playerProtected: false,
      reachableSpawnCompletedCount: 0,
      representedZombieCount: 0,
      rosterRealized: false,
      scheduledZombieCount: 0,
      targetZombieCount: 0,
      zombieCapacity: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    },
    protectedState,
  ]
  const sleeps = []
  const page = {
    evaluate: async () => beginSnapshots.shift(),
  }

  assert.equal(
    await waitForZombieEnterRoomSoakProtection(
      page,
      async (durationMs) => sleeps.push(durationMs),
      1_000,
    ),
    protectedState,
  )
  assert.deepEqual(sleeps, [
    ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs,
    ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs,
  ])
})

test('settled-night readiness does not count an unprotected playable-night sample', async () => {
  const snapshots = [
    sample({
      frameIdx: 1,
      insideBuilding: false,
      obstacleDamageSuppressed: false,
      phaseHeld: false,
      playerProtected: false,
      remaining: 170,
    }),
    ...Array.from(
      { length: ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveRosterSamples },
      (_, index) =>
        sample({
          frameIdx: index + 2,
          insideBuilding: false,
          remaining: 170,
        }),
    ),
  ]
  let readCount = 0
  const page = {
    evaluate: async () => snapshots[readCount++],
  }

  const settled = await waitForSettledZombieNight(page, async () => {}, 1_000)
  assert.equal(readCount, ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveRosterSamples + 1)
  assert.equal(
    settled.bridge.frameIdx,
    ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveRosterSamples + 1,
  )
})

test('continuous doorway evidence rejects teleport-only and no-progress legs', () => {
  const continuous = [
    { bridgeFrameIdx: 10, observedAtMs: 0, playerPose: { x: 0, y: 0, z: 1 } },
    { bridgeFrameIdx: 16, observedAtMs: 150, playerPose: { x: 0.7, y: 0, z: 1 } },
    { bridgeFrameIdx: 22, observedAtMs: 310, playerPose: { x: 1.8, y: 0, z: 1 } },
  ]
  assert.deepEqual(
    zombieEnterRoomNavigationLegProgressIssues(continuous, {
      start: ROUTE.outside,
      target: ROUTE.inside,
    }),
    [],
  )

  const stationary = [
    { bridgeFrameIdx: 10, observedAtMs: 0, playerPose: { x: 0, y: 0, z: 1 } },
    { bridgeFrameIdx: 16, observedAtMs: 150, playerPose: { x: 0, y: 0, z: 1 } },
    { bridgeFrameIdx: 22, observedAtMs: 300, playerPose: { x: 0, y: 0, z: 1 } },
  ]
  const noProgressIssues = zombieEnterRoomNavigationLegProgressIssues(stationary, {
    start: ROUTE.outside,
    target: ROUTE.inside,
  })
  assert.ok(noProgressIssues.some((issue) => issue.includes('forward progress')))

  const teleportedStart = [
    { bridgeFrameIdx: 10, observedAtMs: 0, playerPose: { x: 1, y: 0, z: 1 } },
    { bridgeFrameIdx: 16, observedAtMs: 150, playerPose: { x: 1.8, y: 0, z: 1 } },
  ]
  assert.ok(
    zombieEnterRoomNavigationLegProgressIssues(teleportedStart, {
      start: ROUTE.outside,
      target: ROUTE.inside,
    }).some((issue) => issue.includes('declared doorway endpoint')),
  )

  const oneFrameTeleport = [
    { bridgeFrameIdx: 30, observedAtMs: 0, playerPose: { x: 0, y: 0, z: 1 } },
    { bridgeFrameIdx: 31, observedAtMs: 100, playerPose: { x: 1.8, y: 0, z: 1 } },
    { bridgeFrameIdx: 32, observedAtMs: 200, playerPose: { x: 1.8, y: 0, z: 1 } },
  ]
  const teleportIssues = zombieEnterRoomNavigationLegProgressIssues(oneFrameTeleport, {
    start: ROUTE.outside,
    target: ROUTE.inside,
  })
  assert.ok(teleportIssues.some((issue) => issue.includes('production bound=')))
  assert.ok(teleportIssues.some((issue) => issue.includes('advancing motion segments')))
})

test('first-service fairness uses eight slices at 14 and 1400 agents', () => {
  for (const [roster, expectedBound] of [
    [14, 2],
    [1_400, 175],
  ]) {
    assert.equal(maximumZombieEnterRoomSparseSearchFirstServiceAgeTicks(roster), expectedBound)
    const baseline = withTestSparseSearchTelemetry(
      causalPerformance({
        activeTargets: roster,
        frameIdx: 100,
        navigationIntentOldestPendingAgeTicks: 1,
        navigationIntentPendingCount: 1,
        navigationIntentResolvedCount: roster - 1,
        navigationSparseSearchCompletedCount: roster - 1,
        navigationSparseSearchPendingAgentCount: 1,
        routingResolveCount: roster - 1,
        simulationTick: 100,
        spatialIndexedAgentCount: roster,
      }),
      { maximumFirstServiceAgeTicks: 1 },
    )
    const current = withTestSparseSearchTelemetry(
      causalPerformance({
        activeTargets: roster,
        frameIdx: 100 + expectedBound,
        navigationIntentOldestPendingAgeTicks: expectedBound + 50,
        navigationIntentPendingCount: 1,
        navigationIntentResolvedCount: roster - 1,
        navigationSparseSearchCompletedCount: roster - 1,
        navigationSparseSearchPendingAgentCount: 1,
        routingResolveCount: roster - 1,
        simulationTick: 100 + expectedBound,
        spatialIndexedAgentCount: roster,
      }),
      {
        completionProgressTotal: 11,
        firstServiceCountTotal: 2,
        maximumFirstServiceAgeTicks: expectedBound,
        remainingWork: 9,
        serviceSliceCountTotal: 2,
      },
    )
    const accepted = reduceZombieEnterRoomNavigationContract(baseline, current, {
      activeZombieCount: roster,
      context: `multi-slice fairness ${String(roster)}`,
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      targetRouteExpectation: 'stable',
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    })
    assert.deepEqual(accepted.issues, [])
    assert.equal(accepted.deltas.navigationSparseSearchCompletedCount, 0)

    const tooOld = {
      ...current,
      testMaximumFirstServiceAgeTicks: expectedBound + 1,
    }
    assert.ok(
      reduceZombieEnterRoomNavigationContract(baseline, tooOld, {
        activeZombieCount: roster,
        context: `late first service ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        targetRouteExpectation: 'stable',
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      }).issues.some((issue) => issue.includes('maximum first-service age=')),
    )
  }
})

test('target and sustained spawn work preserve eight dedicated agent services', () => {
  for (const roster of [14, 1_400]) {
    const fairnessBound = maximumZombieEnterRoomSparseSearchFirstServiceAgeTicks(roster)
    const concurrentHeapTelemetry = createHeapWorkTelemetry({
      cachedMaximum: 8,
      cachedThisTick: 8,
      cachedTotal: fairnessBound * 8,
      spawnMaximum: 1,
      spawnThisTick: 1,
      spawnTotal: fairnessBound,
      targetMaximum: 247,
      targetThisTick: 247,
      targetTotal: fairnessBound * 247,
    })
    const baselinePerformance = causalPerformance({
      activeTargets: roster,
      frameIdx: 100,
      navigationSparseSearchPendingAgentCount: roster,
      simulationTick: 100,
      spatialIndexedAgentCount: roster,
    })
    const baseline = withTestSparseSearchTelemetry(baselinePerformance, {
      agentMaximumPendingNoProgressAgeTicks: 0,
      agentOldestPendingNoProgressAgeTicks: 0,
      agentProgressSliceCountTotal: 0,
      agentServiceSliceCountTotal: 0,
      completionProgressTotal: 0,
      firstServiceCountTotal: 0,
      maximumFirstServiceAgeTicks: 0,
      maximumNoProgressAgeTicks: 0,
      noProgressAgeTicks: 0,
      serviceSliceCountTotal: 0,
      targetUpdateStatus: 'pending',
    })
    const concurrent = withTestSparseSearchTelemetry(
      causalPerformance({
        activeTargets: roster,
        frameIdx: 100 + fairnessBound,
        meteredNavigationTelemetry: concurrentHeapTelemetry,
        navigationSparseAttachmentActiveAgentLeaseCount: 8,
        navigationSparseAttachmentAvailableAgentLeaseCount: 0,
        navigationSparseSearchPendingAgentCount: roster,
        simulationTick: 100 + fairnessBound,
        spatialIndexedAgentCount: roster,
      }),
      {
        agentEligiblePendingCountAtScheduleThisTick: roster,
        agentMaximumPendingNoProgressAgeTicks: 0,
        agentOldestPendingNoProgressAgeTicks: 0,
        agentProgressSliceCountThisTick: 8,
        agentProgressSliceCountTotal: fairnessBound * 8,
        agentServiceSliceCountThisTick: 8,
        agentServiceSliceCountTotal: fairnessBound * 8,
        completionProgressThisTick: 10,
        completionProgressTotal: fairnessBound * 10,
        firstServiceCountTotal: roster,
        maximumFirstServiceAgeTicks: fairnessBound,
        maximumNoProgressAgeTicks: 0,
        noProgressAgeTicks: 0,
        serviceSliceCountThisTick: 10,
        serviceSliceCountTotal: fairnessBound * 10,
        spawnProgressSliceCountThisTick: 1,
        spawnProgressSliceCountTotal: fairnessBound,
        spawnPendingCount: 1,
        spawnServiceSliceCountThisTick: 1,
        spawnServiceSliceCountTotal: fairnessBound,
        spawnStartedCountTotal: 1,
        targetProgressSliceCountThisTick: 1,
        targetProgressSliceCountTotal: fairnessBound,
        targetServiceSliceCountThisTick: 1,
        targetServiceSliceCountTotal: fairnessBound,
        targetUpdateStatus: 'pending',
      },
    )
    assert.deepEqual(
      zombieEnterRoomSparseSearchProgressIssues(baseline, concurrent, {
        activeZombieCount: roster,
        context: `simultaneous target-agent-spawn ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      }),
      [],
    )
    assert.equal(concurrent.testAgentServiceThisTick + concurrent.testSpawnServiceThisTick, 9)
    assert.equal(concurrent.testServiceSliceCountThisTick, 10)
    assert.deepEqual(zombieEnterRoomAttachmentLeaseIssues(concurrent), [])
    assert.equal(concurrent.navigationSparseTargetUpdateHeapOperationsThisTick, 247)
    assert.equal(concurrent.navigationSparseSearchHeapOperationsThisTick, 256)

    const stolenAgentHeapReservation = {
      ...concurrent,
      navigationSparseCachedFollowHeapOperationsThisTick: 7,
      navigationSparseTargetUpdateHeapOperationsMaximumObservedPerTick: 505,
      navigationSparseTargetUpdateHeapOperationsThisTick: 504,
    }
    assert.ok(
      zombieEnterRoomSparseSearchProgressIssues(baseline, stolenAgentHeapReservation, {
        activeZombieCount: roster,
        context: `target stole reserved heap work ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      }).some((issue) => issue.includes('target heap operations this tick=504')),
    )

    const dependencyWait = {
      ...concurrent,
      navigationSparseCachedFollowHeapOperationsThisTick: 0,
      navigationSparseCachedFollowHeapOperationsTotal: 0,
      navigationSparseSearchHeapOperationsThisTick: 247,
      navigationSparseSearchHeapOperationsTotal: fairnessBound * 248,
      navigationSparseSpawnSearchHeapOperationsThisTick: 0,
      testAgentEligiblePendingThisTick: 0,
      testAgentProgressThisTick: 0,
      testAgentProgressTotal: 0,
      testAgentServiceThisTick: 0,
      testAgentServiceTotal: 0,
      testCompletionProgressTotal: fairnessBound * 2,
      testFirstServiceCountTotal: 0,
      testServiceSliceCountTotal: fairnessBound * 2,
      testSpawnDependencyWaiting: true,
      testSpawnPendingCount: 1,
      testSpawnProgressThisTick: 0,
      testSpawnServiceThisTick: 0,
      testCompletionProgressThisTick: 1,
      testServiceSliceCountThisTick: 1,
    }
    assert.deepEqual(
      zombieEnterRoomSparseSearchProgressIssues(baseline, dependencyWait, {
        activeZombieCount: roster,
        context: `explicit target dependency ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      }),
      [],
    )
    const unservicedTargetDependency = {
      ...dependencyWait,
      testCompletionProgressThisTick: 0,
      testServiceSliceCountThisTick: 0,
      testTargetProgressThisTick: 0,
      testTargetServiceThisTick: 0,
    }
    assert.ok(
      zombieEnterRoomSparseSearchProgressIssues(baseline, unservicedTargetDependency, {
        activeZombieCount: roster,
        context: `unserviced target dependency ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      }).some((issue) => issue.includes('pending target received 0 service slices')),
    )

    const sevenAgentServices = {
      ...concurrent,
      testAgentProgressThisTick: 7,
      testAgentServiceThisTick: 7,
      testCompletionProgressThisTick: 9,
      testServiceSliceCountThisTick: 9,
    }
    assert.ok(
      zombieEnterRoomSparseSearchProgressIssues(baseline, sevenAgentServices, {
        activeZombieCount: roster,
        context: `spawn stole agent service ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      }).some((issue) => issue.includes('agent service slices this tick=7 expected 8')),
    )

    const readyBaseline = { ...baseline, testTargetUpdateStatus: 'ready' }
    const maskedAgentStarvation = {
      ...concurrent,
      testAgentMaximumPendingNoProgressAge: fairnessBound + 1,
      testAgentOldestPendingNoProgressAge: fairnessBound + 1,
      testAgentProgressThisTick: 0,
      testAgentProgressTotal: 0,
      testCompletionProgressThisTick: 2,
      testCompletionProgressTotal: fairnessBound * 2,
      testFirstServiceCountTotal: 1,
      testMaximumNoProgressAgeTicks: fairnessBound + 1,
      testNoProgressAgeTicks: fairnessBound + 1,
      testTargetUpdateStatus: 'ready',
    }
    const starvationIssues = zombieEnterRoomSparseSearchProgressIssues(
      readyBaseline,
      maskedAgentStarvation,
      {
        activeZombieCount: roster,
        context: `target-spawn masked agent starvation ${String(roster)}`,
        expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
        progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
      },
    )
    assert.ok(
      starvationIssues.some((issue) =>
        issue.includes('agent oldest pending no-progress age='),
      ),
    )
    assert.ok(
      starvationIssues.some((issue) =>
        issue.includes('agent maximum pending no-progress age='),
      ),
    )
    assert.ok(starvationIssues.some((issue) => issue.includes('first-service delta=')))
    assert.ok(starvationIssues.some((issue) => issue.includes('made no positive progress')))
  }
})

test('spawn dependency wait fails closed across a sampled target-ready transition', () => {
  const waiting = withTestSparseSearchTelemetry(
    causalPerformance({ frameIdx: 100, simulationTick: 100 }),
    {
      agentMaximumPendingNoProgressAgeTicks: 0,
      agentProgressSliceCountTotal: 0,
      agentServiceSliceCountTotal: 0,
      completionProgressThisTick: 1,
      completionProgressTotal: 5,
      firstServiceCountTotal: 0,
      maximumFirstServiceAgeTicks: 0,
      maximumNoProgressAgeTicks: 0,
      noProgressAgeTicks: 0,
      serviceSliceCountThisTick: 1,
      serviceSliceCountTotal: 5,
      spawnDependencyWaiting: true,
      spawnPendingCount: 1,
      spawnStartedCountTotal: 1,
      targetProgressSliceCountThisTick: 1,
      targetProgressSliceCountTotal: 5,
      targetServiceSliceCountThisTick: 1,
      targetServiceSliceCountTotal: 5,
      targetUpdateStatus: 'pending',
    },
  )
  assert.deepEqual(
    zombieEnterRoomSparseSearchProgressIssues(null, waiting, {
      context: 'legitimate spawn dependency wait',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }),
    [],
  )

  const inactiveWait = { ...waiting, testSpawnPendingCount: 0 }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(null, inactiveWait, {
      context: 'inactive spawn dependency wait',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('dependency wait has pending=0')),
  )

  const suppressed = { ...waiting, testSpawnDependencyWaiting: false }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(null, suppressed, {
      context: 'unflagged spawn suppression',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('suppressed spawn service without dependency-wait flag')),
  )

  const malformed = { ...waiting, testSpawnDependencyWaiting: 'true' }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(null, malformed, {
      context: 'malformed spawn dependency wait',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('current spawn dependency waiting=true')),
  )

  const ready = withTestSparseSearchTelemetry(
    causalPerformance({ frameIdx: 104, simulationTick: 104 }),
    {
      agentMaximumPendingNoProgressAgeTicks: 0,
      agentProgressSliceCountTotal: 0,
      agentServiceSliceCountTotal: 0,
      completionProgressTotal: 9,
      firstServiceCountTotal: 0,
      maximumFirstServiceAgeTicks: 0,
      maximumNoProgressAgeTicks: 0,
      noProgressAgeTicks: 0,
      serviceSliceCountTotal: 10,
      spawnDependencyWaiting: false,
      spawnCompletedCountTotal: 1,
      spawnPendingCount: 0,
      spawnProgressSliceCountTotal: 2,
      spawnServiceSliceCountTotal: 3,
      spawnStartedCountTotal: 1,
      targetProgressSliceCountTotal: 7,
      targetServiceSliceCountTotal: 7,
      targetUpdateStatus: 'ready',
    },
  )
  assert.deepEqual(
    zombieEnterRoomSparseSearchProgressIssues(waiting, ready, {
      context: 'sampled target-ready spawn resume',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }),
    [],
  )
  assert.equal(ready.testSpawnServiceTotal - waiting.testSpawnServiceTotal, 3)
  assert.equal(ready.testSpawnProgressTotal - waiting.testSpawnProgressTotal, 2)

  const uncleared = { ...ready, testSpawnDependencyWaiting: true }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(waiting, uncleared, {
      context: 'uncleared target-ready spawn wait',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('target-ready transition did not clear')),
  )
})

test('32-wall spawn transition permits entry work but rejects same-job waiting work', () => {
  const beforeSpawn = withTestSparseSearchTelemetry(
    causalPerformance({ frameIdx: 100, simulationTick: 100 }),
    {
      agentMaximumPendingNoProgressAgeTicks: 0,
      agentProgressSliceCountTotal: 0,
      agentServiceSliceCountTotal: 0,
      completionProgressThisTick: 1,
      completionProgressTotal: 5,
      firstServiceCountTotal: 0,
      maximumFirstServiceAgeTicks: 0,
      maximumNoProgressAgeTicks: 0,
      noProgressAgeTicks: 0,
      serviceSliceCountThisTick: 1,
      serviceSliceCountTotal: 5,
      targetProgressSliceCountThisTick: 1,
      targetProgressSliceCountTotal: 5,
      targetServiceSliceCountThisTick: 1,
      targetServiceSliceCountTotal: 5,
      targetUpdateStatus: 'pending',
    },
  )
  const enteredWait = withTestSparseSearchTelemetry(
    causalPerformance({
      frameIdx: 101,
      meteredNavigationTelemetry: createHeapWorkTelemetry({
        spawnMaximum: 32,
        spawnThisTick: 32,
        spawnTotal: 32,
      }),
      simulationTick: 101,
    }),
    {
      agentMaximumPendingNoProgressAgeTicks: 0,
      agentProgressSliceCountTotal: 0,
      agentServiceSliceCountTotal: 0,
      completionProgressThisTick: 2,
      completionProgressTotal: 7,
      firstServiceCountTotal: 0,
      maximumFirstServiceAgeTicks: 0,
      maximumNoProgressAgeTicks: 0,
      noProgressAgeTicks: 0,
      serviceSliceCountThisTick: 2,
      serviceSliceCountTotal: 7,
      spawnDependencyWaiting: true,
      spawnPendingCount: 1,
      spawnProgressSliceCountThisTick: 1,
      spawnProgressSliceCountTotal: 1,
      spawnServiceSliceCountThisTick: 1,
      spawnServiceSliceCountTotal: 1,
      spawnStartedCountTotal: 1,
      targetProgressSliceCountThisTick: 1,
      targetProgressSliceCountTotal: 6,
      targetServiceSliceCountThisTick: 1,
      targetServiceSliceCountTotal: 6,
      targetUpdateStatus: 'pending',
    },
  )
  assert.deepEqual(
    reduceZombieEnterRoomNavigationContract(beforeSpawn, enteredWait, {
      context: '32-wall entry-to-wait transition',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      targetRouteExpectation: 'stable',
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).issues,
    [],
  )

  const sameJobWaiting = withTestSparseSearchTelemetry(
    causalPerformance({
      frameIdx: 1_546,
      meteredNavigationTelemetry: createHeapWorkTelemetry({
        aggregateMaximum: 32,
        spawnMaximum: 32,
        spawnTotal: 32,
      }),
      simulationTick: 1_546,
    }),
    {
      agentMaximumPendingNoProgressAgeTicks: 0,
      agentProgressSliceCountTotal: 0,
      agentServiceSliceCountTotal: 0,
      completionProgressThisTick: 1,
      completionProgressTotal: 1_452,
      firstServiceCountTotal: 0,
      maximumFirstServiceAgeTicks: 0,
      maximumNoProgressAgeTicks: 0,
      noProgressAgeTicks: 0,
      serviceSliceCountThisTick: 1,
      serviceSliceCountTotal: 1_452,
      spawnDependencyWaiting: true,
      spawnPendingCount: 1,
      spawnProgressSliceCountTotal: 1,
      spawnServiceSliceCountTotal: 1,
      spawnStartedCountTotal: 1,
      targetProgressSliceCountThisTick: 1,
      targetProgressSliceCountTotal: 1_451,
      targetServiceSliceCountThisTick: 1,
      targetServiceSliceCountTotal: 1_451,
      targetUpdateStatus: 'pending',
    },
  )
  assert.deepEqual(
    zombieEnterRoomSparseSearchProgressIssues(enteredWait, sameJobWaiting, {
      context: '32-wall same-job wait across 1445 ticks',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }),
    [],
  )

  const hiddenSameJobWork = {
    ...sameJobWaiting,
    navigationSparseSearchHeapOperationsTotal:
      sameJobWaiting.navigationSparseSearchHeapOperationsTotal + 1,
    navigationSparseSpawnSearchHeapOperationsTotal:
      sameJobWaiting.navigationSparseSpawnSearchHeapOperationsTotal + 1,
    testCompletionProgressTotal: sameJobWaiting.testCompletionProgressTotal + 1,
    testServiceSliceCountTotal: sameJobWaiting.testServiceSliceCountTotal + 1,
    testSpawnProgressTotal: sameJobWaiting.testSpawnProgressTotal + 1,
    testSpawnServiceTotal: sameJobWaiting.testSpawnServiceTotal + 1,
  }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(enteredWait, hiddenSameJobWork, {
      context: '32-wall hidden same-job work across 1445 ticks',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('same waiting spawn job service/progress delta=1/1')),
  )
  const hiddenSameJobHeapWork = {
    ...sameJobWaiting,
    navigationSparseSearchHeapOperationsTotal:
      sameJobWaiting.navigationSparseSearchHeapOperationsTotal + 1,
    navigationSparseSpawnSearchHeapOperationsTotal:
      sameJobWaiting.navigationSparseSpawnSearchHeapOperationsTotal + 1,
  }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(enteredWait, hiddenSameJobHeapWork, {
      context: '32-wall hidden same-job heap work across 1445 ticks',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('spawn heap operations delta=1')),
  )
})

test('pending multi-slice searches require metered service or remaining-work progress', () => {
  const roster = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
  const elapsedTicks = maximumZombieEnterRoomSparseSearchFirstServiceAgeTicks(roster)
  const baseline = withTestSparseSearchTelemetry(
    causalPerformance({
      frameIdx: 100,
      navigationIntentOldestPendingAgeTicks: 1,
      navigationIntentPendingCount: 1,
      navigationIntentResolvedCount: roster - 1,
      navigationSparseSearchCompletedCount: roster - 1,
      navigationSparseSearchPendingAgentCount: 1,
      routingResolveCount: roster - 1,
      simulationTick: 100,
    }),
  )
  const stalled = withTestSparseSearchTelemetry(
    causalPerformance({
      frameIdx: 100 + elapsedTicks,
      navigationIntentOldestPendingAgeTicks: 500,
      navigationIntentPendingCount: 1,
      navigationIntentResolvedCount: roster - 1,
      navigationSparseSearchCompletedCount: roster - 1,
      navigationSparseSearchPendingAgentCount: 1,
      routingResolveCount: roster - 1,
      simulationTick: 100 + elapsedTicks,
    }),
  )
  const issues = zombieEnterRoomSparseSearchProgressIssues(baseline, stalled, {
    activeZombieCount: roster,
    context: 'stalled multi-slice search',
    expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
    progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
  })
  assert.ok(issues.some((issue) => issue.includes('received no dedicated service')))
  assert.ok(issues.some((issue) => issue.includes('made no positive progress')))

  const regressedMeter = { ...stalled, testCachedFollowWorkTotal: 4 }
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(baseline, regressedMeter, {
      activeZombieCount: roster,
      context: 'regressed metered work',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('testCachedFollowWorkTotal regressed')),
  )

  const missingMeter = { ...stalled }
  delete missingMeter.testSpawnAttachmentWorkTotal
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(baseline, missingMeter, {
      activeZombieCount: roster,
      context: 'missing metered work',
      expectedMeteredWorkKeys: TEST_METERED_NAVIGATION_WORK_KEYS,
      progressKeys: TEST_SPARSE_SEARCH_PROGRESS_KEYS,
    }).some((issue) => issue.includes('testSpawnAttachmentWorkTotal=undefined')),
  )

  const excessiveGlobalStall = causalPerformance({
    frameIdx: 102,
    navigationSparseSearchMaximumNoProgressAgeTicksObserved: 2,
    navigationSparseSearchNoProgressAgeTicks: 2,
    simulationTick: 102,
  })
  assert.ok(
    zombieEnterRoomSparseSearchProgressIssues(null, excessiveGlobalStall).some((issue) =>
      issue.includes('maximum no-progress age=2'),
    ),
  )
})

test('generic metered-work dimensions fail closed on per-tick and segment amplification', () => {
  const baseline = {
    ...causalPerformance({ frameIdx: 100, simulationTick: 100 }),
    testTargetGraphEdgeVisitBudgetViolationCount: 0,
    testTargetGraphEdgeVisitsMaximumObservedPerTick: 64,
    testTargetGraphEdgeVisitsMaximumPerTick: 512,
    testTargetGraphEdgeVisitsThisTick: 0,
    testTargetGraphEdgeVisitsTotal: 1_000,
  }
  const bounded = {
    ...causalPerformance({ frameIdx: 102, simulationTick: 102 }),
    testTargetGraphEdgeVisitBudgetViolationCount: 0,
    testTargetGraphEdgeVisitsMaximumObservedPerTick: 128,
    testTargetGraphEdgeVisitsMaximumPerTick: 512,
    testTargetGraphEdgeVisitsThisTick: 128,
    testTargetGraphEdgeVisitsTotal: 1_128,
  }
  assert.deepEqual(
    reduceZombieEnterRoomNavigationContract(baseline, bounded, {
      context: 'bounded shared target work',
      expectedMeteredWorkKeys: [
        'testTargetGraphEdgeVisitsMaximumObservedPerTick',
        'testTargetGraphEdgeVisitsTotal',
      ],
      targetRouteExpectation: 'stable',
      meteredWorkDimensions: TEST_ADDITIONAL_METERED_WORK_DIMENSIONS,
    }).issues,
    [],
  )

  const amplified = {
    ...bounded,
    testTargetGraphEdgeVisitBudgetViolationCount: 1,
    testTargetGraphEdgeVisitsMaximumObservedPerTick: 513,
    testTargetGraphEdgeVisitsThisTick: 513,
    testTargetGraphEdgeVisitsTotal: 2_025,
  }
  const issues = reduceZombieEnterRoomNavigationContract(baseline, amplified, {
    context: 'amplified shared target work',
    expectedMeteredWorkKeys: [
      'testTargetGraphEdgeVisitsMaximumObservedPerTick',
      'testTargetGraphEdgeVisitsTotal',
    ],
    targetRouteExpectation: 'stable',
    meteredWorkDimensions: TEST_ADDITIONAL_METERED_WORK_DIMENSIONS,
  }).issues
  assert.ok(issues.some((issue) => issue.includes('this tick=513')))
  assert.ok(issues.some((issue) => issue.includes('delta=1025')))
  assert.ok(issues.some((issue) => issue.includes('violations=1')))
})

test('metered work attribution conserves every globally budgeted work dimension', () => {
  const performance = causalPerformance({ frameIdx: 100, simulationTick: 100 })
  assert.deepEqual(zombieEnterRoomMeteredWorkAttributionIssues(performance), [])

  const hiddenCachedWork = {
    ...performance,
    navigationSparseCachedFollowCandidateVisitsTotal:
      performance.navigationSparseCachedFollowCandidateVisitsTotal + 1,
  }
  assert.ok(
    zombieEnterRoomMeteredWorkAttributionIssues(hiddenCachedWork).some((issue) =>
      issue.includes('candidate visits total aggregate='),
    ),
  )
  assert.ok(
    zombieEnterRoomPerformanceIssues(hiddenCachedWork).some((issue) =>
      issue.includes('candidate visits total aggregate='),
    ),
  )

  const hiddenTargetHeapWork = {
    ...performance,
    navigationSparseTargetUpdateHeapOperationsThisTick: 1,
  }
  assert.ok(
    zombieEnterRoomMeteredWorkAttributionIssues(hiddenTargetHeapWork).some((issue) =>
      issue.includes('heap operations this tick aggregate=0 does not equal attributed=1'),
    ),
  )

  const missingHeapMeter = { ...performance }
  delete missingHeapMeter.navigationSparseFlowSearchHeapOperationsTotal
  assert.ok(
    zombieEnterRoomMeteredWorkAttributionIssues(missingHeapMeter).some((issue) =>
      issue.includes('navigationSparseFlowSearchHeapOperationsTotal=undefined'),
    ),
  )

  const impossibleHeapMaximum = {
    ...performance,
    navigationSparseSearchHeapOperationsMaximumObservedPerTick: 5,
    navigationSparseSpawnSearchHeapOperationsMaximumObservedPerTick: 4,
  }
  assert.ok(
    zombieEnterRoomMeteredWorkAttributionIssues(impossibleHeapMaximum).some((issue) =>
      issue.includes('heap operations maximum aggregate=5 is outside attributed range=4..4'),
    ),
  )
})

test('visibility inner-work meters reject outer-predicate-only amplification', () => {
  const baseline = causalPerformance({ frameIdx: 100, simulationTick: 100 })
  baseline.navigationVisibilitySupportRingEdgeVisitsMaximumObservedPerTick = 10
  baseline.navigationVisibilitySupportRingEdgeVisitsTotal = 10
  const hiddenInnerWork = {
    ...causalPerformance({ frameIdx: 101, simulationTick: 101 }),
    navigationVisibilitySupportRingEdgeVisitsMaximumObservedPerTick: 10,
    navigationVisibilitySupportRingEdgeVisitsTotal: 11,
  }
  const visibilityIssues = zombieEnterRoomVisibilityWorkIssues(hiddenInnerWork, {
    context: 'hidden ring traversal',
    previous: baseline,
  })
  assert.ok(
    visibilityIssues.some((issue) =>
      issue.includes('support predicates detailed delta=1 exceeds aggregate delta=0'),
    ),
  )
  assert.ok(
    zombieEnterRoomPerformanceIssues(hiddenInnerWork, { previous: baseline }).some((issue) =>
      issue.includes('support predicates detailed delta=1 exceeds aggregate delta=0'),
    ),
  )

  const unmeteredBurst = {
    ...hiddenInnerWork,
    navigationVisibilitySupportRingEdgeVisitsMaximumObservedPerTick: 17,
    navigationVisibilitySupportRingEdgeVisitsThisTick: 17,
    navigationVisibilitySupportRingEdgeVisitsTotal: 27,
  }
  const burstIssues = zombieEnterRoomVisibilityWorkIssues(unmeteredBurst, {
    context: 'unmetered ring burst',
    previous: baseline,
  })
  assert.ok(burstIssues.some((issue) => issue.includes('detailed this-tick sum=17')))
  assert.ok(burstIssues.some((issue) => issue.includes('exceeds parent maximum=16')))
})

test('one production obstacle delta is bounded and rejects rebuild or allocation work', () => {
  const baseline = causalPerformance({ frameIdx: 100, simulationTick: 100 })
  const obstacleDeltaTelemetry = createSampleObstacleDeltaTelemetry({
    obstacleDeltaAppliedCount: 1,
    obstacleDeltaAppliedRevision: 1,
    obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick: 12,
    obstacleDeltaObjectLookupComparisonsTotal: 12,
    obstacleDeltaObjectMaskWritesMaximumObservedPerTick: 2,
    obstacleDeltaObjectMaskWritesTotal: 2,
    obstacleDeltaRequestCount: 1,
    obstacleDeltaRequestedRevision: 1,
    obstacleDeltaRevisionAdvanceCount: 1,
    obstacleDeltaViewRevisionAdvanceCount: 2,
  })
  const current = causalPerformance({
    frameIdx: 101,
    navigationWorldRevision: 2,
    obstacleDeltaTelemetry,
    simulationTick: 101,
  })
  const requestResult = {
    applied: true,
    appliedRevision: 1,
    objectId: 'breakable-a',
    requestedRevision: 1,
  }
  const roomSoak = {
    obstacleDeltaAppliedRevision: 1,
    obstacleDeltaRequestedRevision: 1,
  }
  const transactionBaseline = { ...baseline }
  const createTransaction = (performance) => ({
    ...performance,
    navigationObstacleRefreshDiscoveryAppliedRevision:
      baseline.navigationObstacleRefreshDiscoveryAppliedRevision,
    navigationObstacleRefreshDiscoveryEpochRevision: 1,
    navigationObstacleRefreshDiscoveryRemainingSlotCount:
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    ...Object.fromEntries(
      ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS.map((dimension) => [
        dimension.thisTickKey,
        performance[dimension.totalKey] - baseline[dimension.totalKey],
      ]),
    ),
  })
  const reduceObstacleDelta = (performance, transaction = createTransaction(performance)) =>
    reduceZombieEnterRoomObstacleDeltaContract(baseline, performance, {
      requestResult,
      roomSoak,
      transaction,
      transactionBaseline,
    })
  const accepted = reduceZombieEnterRoomObstacleDeltaContract(baseline, current, {
    requestResult,
    roomSoak,
    transaction: createTransaction(current),
    transactionBaseline,
  })
  assert.deepEqual(accepted.issues, [])
  assert.equal(accepted.deltas.collisionWorldGeneration, 0)
  assert.equal(accepted.deltas.navigationWorldRevision, 1)
  assert.equal(accepted.deltas.navigationTargetRequestedRevision, 0)
  assert.equal(accepted.deltas.navigationTargetCommittedRouteGeneration, 0)
  assert.equal(accepted.deltas.navigationSparseSearchRestartedRoutePublishedCount, 0)

  for (const key of [
    'obstacleDeltaWorldCompileCount',
    'obstacleDeltaFullArrayClearCount',
    'obstacleDeltaAllocationCount',
  ]) {
    const amplified = {
      ...current,
      [`${key}MaximumObservedPerTick`]: 1,
      [`${key}Total`]: 1,
    }
    assert.ok(
      reduceObstacleDelta(amplified).issues.some((issue) =>
        issue.includes(`${key}Total delta=1 expected 0`),
      ),
    )
  }

  const fullRewrite = {
    ...current,
    obstacleDeltaObjectMaskWritesMaximumObservedPerTick: 3,
    obstacleDeltaObjectMaskWritesTotal: 3,
  }
  assert.ok(
    reduceObstacleDelta(fullRewrite).issues.some((issue) =>
      issue.includes('object mask writes=3'),
    ),
  )

  const lookupAmplification = {
    ...current,
    obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick: 65,
    obstacleDeltaObjectLookupComparisonsTotal: 65,
  }
  assert.ok(
    reduceObstacleDelta(lookupAmplification).issues.some((issue) =>
      issue.includes('expected 1..64'),
    ),
  )

  const synchronousFleetRestart = {
    ...createTransaction(current),
    navigationIntentDemandWorldChangedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    navigationSparseSearchInvalidatedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    navigationSparseSearchRestartedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    navigationSparseSearchRestartedWorldChangedCount:
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  }
  const synchronousIssues = reduceObstacleDelta(current, synchronousFleetRestart).issues
  assert.ok(synchronousIssues.some((issue) => issue.includes('per-agent world-change demands')))
  assert.ok(synchronousIssues.some((issue) => issue.includes('synchronously invalidated 100')))
  assert.ok(synchronousIssues.some((issue) => issue.includes('synchronously restarted 100')))

  const nineLazyRestartsInOneTick = causalPerformance({
    frameIdx: 101,
    navigationSparseSearchInvalidatedCount: 9,
    navigationSparseSearchRestartedCount: 9,
    navigationSparseSearchRestartedWorldChangedCount: 9,
    navigationSparseSearchStartedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 9,
    simulationTick: 101,
  })
  assert.ok(
    zombieEnterRoomPerformanceIssues(nineLazyRestartsInOneTick, {
      previous: baseline,
    }).some((issue) => issue.includes('lazy world-change restarts=9 exceed 1 ticks * 8')),
  )
  assert.deepEqual(zombieEnterRoomObstacleDeltaTelemetryIssues(current), [])
})

test('navigation admission rejects a 1400-agent cached-blocker herd and accepts bounded drain', () => {
  const roster = 1_400
  const appliedTelemetry = createSampleObstacleDeltaTelemetry({
    obstacleDeltaAppliedCount: 1,
    obstacleDeltaAppliedRevision: 1,
    obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick: 12,
    obstacleDeltaObjectLookupComparisonsTotal: 12,
    obstacleDeltaObjectMaskWritesMaximumObservedPerTick: 2,
    obstacleDeltaObjectMaskWritesTotal: 2,
    obstacleDeltaRequestCount: 1,
    obstacleDeltaRequestedRevision: 1,
    obstacleDeltaRevisionAdvanceCount: 1,
    obstacleDeltaViewRevisionAdvanceCount: 2,
  })
  const baseline = causalPerformance({
    activeTargets: roster,
    frameIdx: 100,
    obstacleDeltaTelemetry: appliedTelemetry,
    simulationTick: 100,
  })
  const fleetBurst = causalPerformance({
    activeTargets: roster,
    frameIdx: 101,
    navigationIntentDemandCachedAnchorLostCount: roster,
    navigationSparseSearchCompletedCount: roster * 2,
    navigationSparseSearchServiceSliceCountTotal: roster + 8,
    navigationSparseSearchStartedCount: roster * 2,
    obstacleDeltaTelemetry: appliedTelemetry,
    obstacleRefreshTelemetry: createSampleObstacleRefreshTelemetry({
      navigationObstacleRefreshDiscoveryAppliedRevision: 1,
      navigationObstacleRefreshDiscoveryEpochRevision: 1,
      navigationObstacleRefreshDeferredMarkedCount: roster,
      navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick: roster,
      navigationObstacleRefreshDeferredPromotedCount: roster,
      navigationObstacleRefreshDeferredPromotedCountThisTick: roster,
    }),
    simulationTick: 101,
  })
  const burstIssues = zombieEnterRoomNavigationAdmissionIssues(baseline, fleetBurst)
  assert.ok(burstIssues.some((issue) => issue.includes('issued intents=1400')))
  assert.ok(burstIssues.some((issue) => issue.includes('started searches=1400')))
  assert.ok(burstIssues.some((issue) => issue.includes('cached-anchor-loss demands=1400')))
  assert.ok(burstIssues.some((issue) => issue.includes('metered agent services=8')))
  const burstRefreshIssues = zombieEnterRoomObstacleRefreshIssues(fleetBurst, {
    previous: baseline,
  })
  assert.ok(burstRefreshIssues.some((issue) => issue.includes('promoted this tick=1400')))
  assert.ok(burstRefreshIssues.some((issue) => issue.includes('promoted delta=1400')))

  const drainTicks = Math.ceil(
    roster / ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
  )
  const bounded = causalPerformance({
    activeTargets: roster,
    frameIdx: 100 + drainTicks,
    navigationIntentDemandCachedAnchorLostCount: roster,
    navigationIntentFirstServiceCount: roster * 2,
    navigationSparseSearchCompletedCount: roster * 2,
    navigationSparseSearchCompletionProgressTotal: roster * 2,
    navigationSparseSearchServiceSliceCountTotal: roster * 2,
    navigationSparseSearchStartedCount: roster * 2,
    obstacleDeltaTelemetry: appliedTelemetry,
    obstacleRefreshTelemetry: createSampleObstacleRefreshTelemetry({
      navigationObstacleRefreshDiscoveryAppliedRevision: 1,
      navigationObstacleRefreshDiscoveryEpochRevision: 1,
      navigationObstacleRefreshDeferredMarkedCount: roster,
      navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      navigationObstacleRefreshDeferredPromotedCount: roster,
      navigationObstacleRefreshDeferredPromotedCountThisTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
    }),
    simulationTick: 100 + drainTicks,
  })
  assert.deepEqual(zombieEnterRoomNavigationAdmissionIssues(baseline, bounded), [])
  assert.deepEqual(
    zombieEnterRoomObstacleRefreshIssues(bounded, {
      previous: baseline,
      requireDrained: true,
    }),
    [],
  )
  assert.equal(
    bounded.navigationIntentIssuedCount,
    bounded.navigationIntentResolvedCount +
      bounded.navigationIntentCanceledCount +
      bounded.navigationIntentPendingCount,
  )
  assert.equal(
    bounded.navigationSparseSearchStartedCount,
    bounded.navigationSparseSearchCompletedCount +
      bounded.navigationSparseSearchInvalidatedCount +
      bounded.navigationSparseSearchCanceledCount +
      bounded.navigationSparseSearchActiveAgentCount,
  )
})

test('normal navigation admission bounds synchronized cache misses and collision recoveries', () => {
  const roster = 1_400
  const budget = ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
  const drainTicks = Math.ceil(roster / budget)
  const baseline = causalPerformance({
    activeTargets: roster,
    frameIdx: 100,
    simulationTick: 100,
  })
  const createBurst = (reason) =>
    causalPerformance({
      activeTargets: roster,
      frameIdx: 101,
      navigationIntentDemandCachedAnchorLostCount: reason === 'cache' ? roster : 0,
      navigationIntentDemandCollisionRecoveryCount: reason === 'collision' ? roster : 0,
      navigationSparseSearchInvalidatedCount: reason === 'collision' ? roster : 0,
      navigationSparseSearchRestartedCollisionRecoveryCount:
        reason === 'collision' ? roster : 0,
      navigationSparseSearchRestartedCount: reason === 'collision' ? roster : 0,
      navigationSparseSearchServiceSliceCountTotal: roster + budget,
      navigationSparseSearchStartedCount: roster * 2,
      simulationTick: 101,
    })
  const cacheBurstIssues = zombieEnterRoomNavigationAdmissionIssues(
    baseline,
    createBurst('cache'),
    { context: 'synchronized cache miss' },
  )
  assert.ok(cacheBurstIssues.some((issue) => issue.includes('issued intents=1400')))
  assert.ok(cacheBurstIssues.some((issue) => issue.includes('cached-anchor-loss demands=1400')))
  assert.ok(cacheBurstIssues.some((issue) => issue.includes('started searches=1400')))

  const collisionBurstIssues = zombieEnterRoomNavigationAdmissionIssues(
    baseline,
    createBurst('collision'),
    { context: 'synchronized collision recovery' },
  )
  assert.ok(collisionBurstIssues.some((issue) => issue.includes('issued intents=1400')))
  assert.ok(
    collisionBurstIssues.some((issue) => issue.includes('collision-recovery demands=1400')),
  )
  assert.ok(
    collisionBurstIssues.some((issue) => issue.includes('collision-recovery restarts=1400')),
  )

  for (const reason of ['cache', 'collision']) {
    const bounded = causalPerformance({
      activeTargets: roster,
      frameIdx: 100 + drainTicks,
      navigationIntentDemandCachedAnchorLostCount: reason === 'cache' ? roster : 0,
      navigationIntentDemandCollisionRecoveryCount: reason === 'collision' ? roster : 0,
      navigationSparseSearchInvalidatedCount: reason === 'collision' ? roster : 0,
      navigationSparseSearchRestartedCollisionRecoveryCount:
        reason === 'collision' ? roster : 0,
      navigationSparseSearchRestartedCount: reason === 'collision' ? roster : 0,
      navigationSparseSearchServiceSliceCountTotal: roster * 2,
      navigationSparseSearchStartedCount: roster * 2,
      simulationTick: 100 + drainTicks,
    })
    assert.deepEqual(
      zombieEnterRoomNavigationAdmissionIssues(baseline, bounded, {
        context: `bounded synchronized ${reason}`,
      }),
      [],
    )
  }
})

test('lazy world-stale restarts require metered service and an exact stale or revision cause', () => {
  const roster = 1_400
  const baseline = causalPerformance({
    activeTargets: roster,
    frameIdx: 100,
    navigationSparseSearchServiceSliceCountTotal: roster,
    navigationSparseSearchStartedCount: roster,
    navigationWorldRevision: 3,
    simulationTick: 100,
  })

  for (const restartCount of [1, 8]) {
    const staleBaseline = {
      ...baseline,
      navigationSparseSearchWorldStaleActiveCount: restartCount,
    }
    const current = {
      ...staleBaseline,
      navigationSparseSearchInvalidatedCount: restartCount,
      navigationSparseSearchRestartedCount: restartCount,
      navigationSparseSearchRestartedWorldChangedCount: restartCount,
      navigationSparseSearchAgentServiceSliceCountTotal:
        staleBaseline.navigationSparseSearchAgentServiceSliceCountTotal + restartCount,
      navigationSparseSearchServiceSliceCountTotal:
        staleBaseline.navigationSparseSearchServiceSliceCountTotal + restartCount,
      navigationSparseSearchStartedCount:
        staleBaseline.navigationSparseSearchStartedCount + restartCount,
      navigationSparseSearchWorldStaleActiveCount: 0,
      simulationTick: 101,
    }
    assert.deepEqual(
      zombieEnterRoomNavigationAdmissionIssues(staleBaseline, current, {
        context: `${restartCount} lazy stale restarts`,
      }),
      [],
    )
  }

  const revisionChanged = {
    ...baseline,
    navigationSparseSearchInvalidatedCount: 8,
    navigationSparseSearchRestartedCount: 8,
    navigationSparseSearchRestartedWorldChangedCount: 8,
    navigationSparseSearchAgentServiceSliceCountTotal:
      baseline.navigationSparseSearchAgentServiceSliceCountTotal + 8,
    navigationSparseSearchServiceSliceCountTotal:
      baseline.navigationSparseSearchServiceSliceCountTotal + 8,
    navigationSparseSearchStartedCount: baseline.navigationSparseSearchStartedCount + 8,
    navigationWorldRevision: baseline.navigationWorldRevision + 1,
    simulationTick: 101,
  }
  assert.deepEqual(
    zombieEnterRoomNavigationAdmissionIssues(baseline, revisionChanged, {
      context: 'same-window world revision restarts',
    }),
    [],
  )

  const nineRestarts = {
    ...baseline,
    navigationSparseSearchInvalidatedCount: 9,
    navigationSparseSearchRestartedCount: 9,
    navigationSparseSearchRestartedWorldChangedCount: 9,
    navigationSparseSearchAgentServiceSliceCountTotal:
      baseline.navigationSparseSearchAgentServiceSliceCountTotal + 9,
    navigationSparseSearchServiceSliceCountTotal:
      baseline.navigationSparseSearchServiceSliceCountTotal + 9,
    navigationSparseSearchStartedCount: baseline.navigationSparseSearchStartedCount + 9,
    navigationSparseSearchWorldStaleActiveCount: 9,
    simulationTick: 101,
  }
  assert.ok(
    zombieEnterRoomNavigationAdmissionIssues(baseline, nineRestarts, {
      context: 'nine lazy stale restarts',
    }).some((issue) => issue.includes('world-change restarts=9 exceed 1 ticks * 8')),
  )

  const uncausedRestart = {
    ...baseline,
    navigationSparseSearchInvalidatedCount: 1,
    navigationSparseSearchRestartedCount: 1,
    navigationSparseSearchRestartedWorldChangedCount: 1,
    navigationSparseSearchServiceSliceCountTotal:
      baseline.navigationSparseSearchServiceSliceCountTotal + 1,
    navigationSparseSearchStartedCount: baseline.navigationSparseSearchStartedCount + 1,
    simulationTick: 101,
  }
  assert.ok(
    zombieEnterRoomNavigationAdmissionIssues(baseline, uncausedRestart, {
      context: 'uncaused lazy restart',
    }).some((issue) => issue.includes('no prior stale search or world revision change')),
  )

  const unmeteredRestart = {
    ...revisionChanged,
    navigationSparseSearchAgentServiceSliceCountTotal:
      baseline.navigationSparseSearchAgentServiceSliceCountTotal,
    navigationSparseSearchServiceSliceCountTotal:
      baseline.navigationSparseSearchServiceSliceCountTotal,
  }
  assert.ok(
    zombieEnterRoomNavigationAdmissionIssues(baseline, unmeteredRestart, {
      context: 'unmetered lazy restart',
    }).some((issue) => issue.includes('exceed metered agent services=0')),
  )
})

test('generic deferred admission conserves and bounds synchronized spawn, world, cache, and collision reasons', () => {
  const roster = 1_400
  const budget = ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
  const drainTicks = Math.ceil(roster / budget)
  const cases = [
    ['spawn', 'navigationIntentDemandSpawnCount'],
    ['world', 'navigationIntentDemandWorldChangedCount'],
    ['cache', 'navigationIntentDemandCachedAnchorLostCount'],
    ['collision', 'navigationIntentDemandCollisionRecoveryCount'],
  ]

  for (const [reason, demandKey] of cases) {
    const initialSpawnCount = reason === 'spawn' ? 0 : roster
    const baseline = causalPerformance({
      activeTargets: roster,
      frameIdx: 100,
      navigationIntentDemandSpawnCount: initialSpawnCount,
      navigationIntentFirstServiceCount: initialSpawnCount,
      navigationIntentIssuedCount: initialSpawnCount,
      navigationIntentResolvedCount: initialSpawnCount,
      navigationSparseSearchCompletedCount: initialSpawnCount,
      navigationSparseSearchCompletionProgressTotal: initialSpawnCount,
      navigationSparseSearchServiceSliceCountTotal: initialSpawnCount,
      navigationSparseSearchStartedCount: initialSpawnCount,
      simulationTick: 100,
    })
    const demandOverrides = {
      navigationIntentDemandSpawnCount: initialSpawnCount,
      [demandKey]: roster,
    }
    const restartOverrides =
      reason === 'collision'
        ? {
            navigationSparseSearchInvalidatedCount: roster,
            navigationSparseSearchRestartedCollisionRecoveryCount: roster,
            navigationSparseSearchRestartedCount: roster,
          }
        : reason === 'world'
          ? {
              navigationSparseSearchInvalidatedCount: roster,
              navigationSparseSearchRestartedCount: roster,
              navigationSparseSearchRestartedWorldChangedCount: roster,
            }
          : {}
    const burst = causalPerformance({
      activeTargets: roster,
      ...demandOverrides,
      ...restartOverrides,
      collisionWorldGeneration: reason === 'world' ? 4 : 3,
      frameIdx: 101,
      intentAdmissionTelemetry: {
        navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick: roster,
        navigationIntentAdmissionDeferredPromotedCountThisTick: roster,
        navigationIntentAdmissionDeferredQueueOperationCountThisTick: roster * 2,
        navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick: roster * 2,
      },
      refreshAdmissionTelemetry: {
        navigationRefreshAdmissionCountThisTick: roster,
        navigationRefreshAdmissionMaximumCountObservedPerTick: roster,
        navigationRefreshCandidateInspectionsMaximumObservedPerTick: roster,
        navigationRefreshCandidateInspectionsThisTick: roster,
      },
      simulationTick: 101,
      worldRefreshTelemetry:
        reason === 'world'
          ? {
              navigationWorldRefreshMaximumPromotedCountObservedPerTick: roster,
              navigationWorldRefreshPromotedCountThisTick: roster,
            }
          : null,
    })
    const burstIssues = zombieEnterRoomIntentAdmissionDeferredIssues(burst, {
      context: `synchronized ${reason}`,
      previous: baseline,
    })
    assert.ok(
      burstIssues.some((issue) => issue.includes('promoted delta=1400')),
      JSON.stringify({ burstIssues, reason }),
    )
    assert.ok(
      zombieEnterRoomNavigationAdmissionIssues(baseline, burst, {
        context: `synchronized ${reason}`,
      }).some((issue) => issue.includes('issued intents=1400')),
    )
    if (reason === 'world') {
      assert.ok(
        zombieEnterRoomWorldRefreshIssues(burst, {
          context: 'synchronized world epoch',
          previous: baseline,
        }).some((issue) => issue.includes('promotion delta=1400')),
      )
    }

    const bounded = causalPerformance({
      activeTargets: roster,
      ...demandOverrides,
      ...restartOverrides,
      collisionWorldGeneration: reason === 'world' ? 4 : 3,
      frameIdx: 100 + drainTicks,
      intentAdmissionTelemetry: {
        navigationIntentAdmissionDeferredPromotedCountThisTick: budget,
        navigationIntentAdmissionDeferredQueueOperationCountThisTick: budget,
      },
      refreshAdmissionTelemetry: {
        navigationRefreshAdmissionCountThisTick: budget,
        navigationRefreshCandidateInspectionsThisTick: budget,
      },
      simulationTick: 100 + drainTicks,
    })
    assert.deepEqual(
      zombieEnterRoomIntentAdmissionDeferredIssues(bounded, {
        context: `bounded ${reason}`,
        previous: baseline,
        requireDrained: true,
      }),
      [],
    )
    assert.deepEqual(
      zombieEnterRoomNavigationAdmissionIssues(baseline, bounded, {
        context: `bounded ${reason}`,
      }),
      [],
    )
    if (reason === 'world') {
      assert.deepEqual(
        zombieEnterRoomWorldRefreshIssues(bounded, {
          context: 'bounded world epoch',
          previous: baseline,
          requireDrained: true,
        }),
        [],
      )
    }
  }

  const baseline = causalPerformance({ activeTargets: roster, frameIdx: 100, simulationTick: 100 })
  const directBypass = causalPerformance({
    activeTargets: roster,
    frameIdx: 101,
    intentAdmissionTelemetry: createSampleIntentAdmissionTelemetry({
      navigationIntentAdmissionDeferredPromotedSpawnCount: roster,
    }),
    navigationIntentDemandCachedAnchorLostCount: 1,
    navigationIntentIssuedCount: roster + 1,
    navigationIntentResolvedCount: roster + 1,
    refreshAdmissionTelemetry: createSampleRefreshAdmissionTelemetry({
      navigationRefreshAdmissionCountTotal: roster,
      navigationRefreshAdmissionMaximumCountObservedPerTick: budget,
      navigationRefreshCandidateInspectionsMaximumObservedPerTick: budget,
      navigationRefreshCandidateInspectionsTotal: roster,
    }),
    simulationTick: 101,
  })
  const bypassIssues = zombieEnterRoomIntentAdmissionDeferredIssues(directBypass, {
    context: 'direct issuer bypass',
    previous: baseline,
  })
  assert.ok(bypassIssues.some((issue) => issue.includes('issued-intent delta=1')))
  assert.ok(
    bypassIssues.some((issue) => issue.includes('DemandCachedAnchorLostCount delta=1')),
  )
  assert.ok(
    zombieEnterRoomIntentAdmissionDeferredIssues(
      {
        ...baseline,
        navigationIntentAdmissionDeferredMarkedCount:
          baseline.navigationIntentAdmissionDeferredMarkedCount + 1,
      },
      { context: 'corrupt deferred queue' },
    ).some((issue) => issue.includes('conservation failed')),
  )
})

test('shared target routing coalesces moving requests into one publication without roster fan-out', () => {
  const roster = 1_400
  const baseline = causalPerformance({
    activeTargets: roster,
    frameIdx: 100,
    navigationTargetCommittedRouteGeneration: 4,
    navigationTargetRequestedRevision: 10,
    simulationTick: 100,
  })
  const pending = causalPerformance({
    activeTargets: roster,
    frameIdx: 101,
    navigationTargetCommittedRouteGeneration: 4,
    navigationTargetRequestedRevision: 1_410,
    simulationTick: 101,
    sparseSearchProgressTelemetry: {
      navigationSparseTargetUpdateStatus: 'pending',
    },
  })
  assert.deepEqual(
    zombieEnterRoomTargetRouteIssues(pending, {
      context: 'coalesced moving target',
      previous: baseline,
    }),
    [],
  )
  assert.deepEqual(zombieEnterRoomNavigationAdmissionIssues(baseline, pending), [])
  assert.equal(pending.navigationIntentIssuedCount, baseline.navigationIntentIssuedCount)
  assert.equal(
    pending.navigationSparseSearchStartedCount,
    baseline.navigationSparseSearchStartedCount,
  )

  const published = causalPerformance({
    activeTargets: roster,
    frameIdx: 140,
    navigationTargetCommittedRouteGeneration: 5,
    navigationTargetRequestedRevision: 1_410,
    simulationTick: 140,
  })
  assert.deepEqual(
    zombieEnterRoomTargetRouteIssues(published, {
      context: 'atomic shared-target publication',
      expectation: 'published',
      previous: baseline,
    }),
    [],
  )
  assert.deepEqual(
    zombieEnterRoomRefreshAdmissionIssues(published, {
      previous: baseline,
      requireDrained: true,
    }),
    [],
  )
  assert.equal(
    published.navigationSparseSearchRestartedRoutePublishedCount,
    baseline.navigationSparseSearchRestartedRoutePublishedCount,
  )

  const preBoundaryPendingRequest = causalPerformance({
    activeTargets: roster,
    frameIdx: 139,
    navigationTargetCommittedRouteGeneration: 4,
    navigationTargetRequestedRevision: 1_410,
    simulationTick: 139,
    sparseSearchProgressTelemetry: {
      navigationSparseTargetUpdateStatus: 'pending',
    },
  })
  assert.deepEqual(
    zombieEnterRoomTargetRouteIssues(published, {
      activeZombieCount: roster,
      context: 'publication of a pre-boundary pending request',
      expectation: 'published',
      previous: preBoundaryPendingRequest,
    }),
    [],
  )
  assert.ok(
    zombieEnterRoomTargetRouteIssues(preBoundaryPendingRequest, {
      activeZombieCount: roster,
      context: 'pending request without publication',
      expectation: 'published',
      previous: baseline,
    }).some((issue) => issue.includes('committed generation delta=0 expected >0')),
  )
})

test('route-publication restarts are lazy, service-bounded, and absent from stable holds', () => {
  const baseline = causalPerformance({
    frameIdx: 100,
    navigationTargetCommittedRouteGeneration: 4,
    navigationTargetRequestedRevision: 10,
    simulationTick: 100,
  })
  const restarted = causalPerformance({
    frameIdx: 104,
    navigationSparseSearchServiceSliceCountTotal:
      baseline.navigationSparseSearchAgentServiceSliceCountTotal + 3,
    navigationSparseSearchRestartedCount: 3,
    navigationSparseSearchRestartedRoutePublishedCount: 3,
    navigationTargetCommittedRouteGeneration: 5,
    navigationTargetRequestedRevision: 14,
    simulationTick: 104,
  })
  assert.deepEqual(
    zombieEnterRoomTargetRouteIssues(restarted, {
      context: 'lazy route-publication restart',
      expectation: 'published',
      previous: baseline,
    }),
    [],
  )

  const unserviced = {
    ...restarted,
    navigationSparseSearchRestartedRoutePublishedCount: 4,
  }
  assert.ok(
    zombieEnterRoomTargetRouteIssues(unserviced, {
      context: 'unserviced route-publication restart',
      expectation: 'published',
      previous: baseline,
    }).some((issue) => issue.includes('exceed bounded agent service slices=3')),
  )

  const overRosterBound = {
    ...restarted,
    navigationSparseSearchAgentServiceSliceCountTotal:
      baseline.navigationSparseSearchAgentServiceSliceCountTotal +
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT +
      1,
    navigationSparseSearchRestartedRoutePublishedCount:
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
  }
  const overRosterIssues = zombieEnterRoomTargetRouteIssues(overRosterBound, {
    context: 'roster-amplified route-publication restart',
    expectation: 'published',
    previous: baseline,
  })
  assert.equal(
    overRosterIssues.some((issue) => issue.includes('bounded agent service slices')),
    false,
  )
  assert.ok(
    overRosterIssues.some((issue) =>
      issue.includes('1 committed publications * 100 active zombies=100'),
    ),
  )

  const stable = {
    ...restarted,
    frameIdx: 105,
    simulationTick: 105,
  }
  assert.deepEqual(
    zombieEnterRoomTargetRouteIssues(stable, {
      context: 'stable shared route',
      expectation: 'stable',
      previous: restarted,
    }),
    [],
  )
  const churned = {
    ...stable,
    navigationTargetRequestedRevision: stable.navigationTargetRequestedRevision + 1,
  }
  assert.ok(
    zombieEnterRoomTargetRouteIssues(churned, {
      context: 'steady shared route churn',
      expectation: 'stable',
      previous: restarted,
    }).some((issue) => issue.includes('requested revision delta=1 expected 0')),
  )
})

test('refresh discovery rejects a capacity scan and drains a sparse 1400-slot sweep under the inspection cap', () => {
  const capacity = 1_400
  const inspectionBudget =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.refreshCandidateInspectionBudgetPerTick
  const sweepTicks = Math.ceil(capacity / inspectionBudget)
  const sweepStart = causalPerformance({
    activeTargets: capacity,
    frameIdx: 100,
    refreshAdmissionTelemetry: createSampleRefreshAdmissionTelemetry({
      navigationRefreshSlotCapacity: capacity,
      navigationRefreshAdmissionCountTotal: capacity,
      navigationRefreshAdmissionMaximumCountObservedPerTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      navigationRefreshCandidateInspectionsMaximumObservedPerTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      navigationRefreshCandidateInspectionsTotal: capacity,
      navigationObstacleRefreshDiscoveryRemainingSlotCount: capacity,
    }),
    simulationTick: 100,
  })
  const capacityScan = causalPerformance({
    activeTargets: capacity,
    frameIdx: 101,
    refreshAdmissionTelemetry: createSampleRefreshAdmissionTelemetry({
      navigationRefreshSlotCapacity: capacity,
      navigationRefreshAdmissionCountTotal: capacity,
      navigationRefreshAdmissionMaximumCountObservedPerTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      navigationRefreshCandidateInspectionsMaximumObservedPerTick: capacity,
      navigationRefreshCandidateInspectionsThisTick: capacity,
      navigationRefreshCandidateInspectionsTotal: capacity * 2,
    }),
    simulationTick: 101,
  })
  const capacityScanIssues = zombieEnterRoomRefreshAdmissionIssues(capacityScan, {
    previous: sweepStart,
  })
  assert.ok(
    capacityScanIssues.some((issue) =>
      issue.includes('candidate inspections this tick=1400 exceed budget=64'),
    ),
  )
  assert.ok(
    capacityScanIssues.some((issue) => issue.includes('candidate inspection delta=1400')),
  )

  const boundedSparseDrain = causalPerformance({
    activeTargets: capacity,
    frameIdx: 100 + sweepTicks,
    navigationIntentDemandCachedAnchorLostCount: 1,
    navigationIntentIssuedCount: capacity + 1,
    navigationIntentResolvedCount: capacity + 1,
    navigationSparseSearchServiceSliceCountTotal: capacity + 1,
    navigationSparseSearchStartedCount: capacity + 1,
    obstacleRefreshTelemetry: createSampleObstacleRefreshTelemetry({
      navigationObstacleRefreshDeferredMarkedCount: 1,
      navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick: 1,
      navigationObstacleRefreshDeferredPromotedCount: 1,
      navigationObstacleRefreshDeferredPromotedCountThisTick: 1,
    }),
    refreshAdmissionTelemetry: createSampleRefreshAdmissionTelemetry({
      navigationRefreshSlotCapacity: capacity,
      navigationRefreshAdmissionCountThisTick: 1,
      navigationRefreshAdmissionCountTotal: capacity + 1,
      navigationRefreshAdmissionMaximumCountObservedPerTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      navigationRefreshCandidateInspectionsMaximumObservedPerTick: inspectionBudget,
      navigationRefreshCandidateInspectionsThisTick:
        capacity % inspectionBudget || inspectionBudget,
      navigationRefreshCandidateInspectionsTotal: capacity * 2,
    }),
    simulationTick: 100 + sweepTicks,
  })
  assert.deepEqual(
    zombieEnterRoomNavigationAdmissionIssues(sweepStart, boundedSparseDrain),
    [],
  )
  assert.deepEqual(
    zombieEnterRoomObstacleRefreshIssues(boundedSparseDrain, {
      previous: sweepStart,
      requireDrained: true,
    }),
    [],
  )
  assert.deepEqual(
    zombieEnterRoomRefreshAdmissionIssues(boundedSparseDrain, {
      previous: sweepStart,
      requireDrained: true,
    }),
    [],
  )

  const idle = causalPerformance({
    activeTargets: capacity,
    frameIdx: 100 + sweepTicks + 1,
    navigationIntentDemandCachedAnchorLostCount: 1,
    navigationIntentIssuedCount: capacity + 1,
    navigationIntentResolvedCount: capacity + 1,
    navigationSparseSearchServiceSliceCountTotal: capacity + 1,
    navigationSparseSearchStartedCount: capacity + 1,
    obstacleRefreshTelemetry: createSampleObstacleRefreshTelemetry({
      navigationObstacleRefreshDeferredMarkedCount: 1,
      navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick: 1,
      navigationObstacleRefreshDeferredPromotedCount: 1,
    }),
    refreshAdmissionTelemetry: createSampleRefreshAdmissionTelemetry({
      navigationRefreshSlotCapacity: capacity,
      navigationRefreshAdmissionCountTotal: capacity + 1,
      navigationRefreshAdmissionMaximumCountObservedPerTick:
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      navigationRefreshCandidateInspectionsMaximumObservedPerTick: inspectionBudget,
      navigationRefreshCandidateInspectionsTotal: capacity * 2,
    }),
    simulationTick: 100 + sweepTicks + 1,
  })
  assert.deepEqual(
    zombieEnterRoomRefreshAdmissionIssues(idle, { previous: boundedSparseDrain }),
    [],
  )
  const idleCapacityScan = {
    ...idle,
    navigationRefreshCandidateInspectionsThisTick: inspectionBudget,
    navigationRefreshCandidateInspectionsTotal: capacity * 2 + inspectionBudget,
  }
  assert.ok(
    zombieEnterRoomRefreshAdmissionIssues(idleCapacityScan, {
      previous: boundedSparseDrain,
    }).some((issue) => issue.includes('idle refresh fast path inspected 64 candidates')),
  )
})

test('causal reducer accepts event-driven steady repair and one coalesced route publication', () => {
  const baseline = causalPerformance({ frameIdx: 100, simulationTick: 100 })
  const steady = causalPerformance({
    frameIdx: 130,
    navigationIntentDemandCollisionRecoveryCount: 1,
    routingGraphAttachmentCandidateCount: 90,
    routingGraphAttachmentFullSearchCount: 16,
    routingGraphAttachmentSupportCheckCount: 48,
    simulationTick: 130,
  })
  const steadyResult = reduceZombieEnterRoomNavigationContract(baseline, steady, {
    context: 'synthetic steady repair',
    targetRouteExpectation: 'stable',
  })
  assert.deepEqual(steadyResult.issues, [])
  assert.equal(steadyResult.deltas.navigationIntentResolvedCount, 1)
  assert.equal(steadyResult.deltas.routingGraphAttachmentFullSearchCount, 2)

  const transitioned = causalPerformance({
    frameIdx: 131,
    navigationSparseSearchTargetBuildsTotal: 4,
    navigationTargetCommittedRouteGeneration: 2,
    navigationTargetRequestedRevision: 5,
    simulationTick: 131,
  })
  const transitionResult = reduceZombieEnterRoomNavigationContract(baseline, transitioned, {
    context: 'synthetic target transition',
    targetRouteExpectation: 'published',
  })
  assert.deepEqual(transitionResult.issues, [])
  assert.equal(transitionResult.deltas.navigationTargetRequestedRevision, 4)
  assert.equal(transitionResult.deltas.navigationTargetCommittedRouteGeneration, 1)
  assert.equal(transitionResult.deltas.navigationIntentIssuedCount, 0)
  assert.equal(transitionResult.deltas.routingGraphAttachmentFullSearchCount, 0)
})

test('causal reducer fails closed on unclassified work and attachment amplification', () => {
  const baseline = causalPerformance({ frameIdx: 10, simulationTick: 10 })
  const unclassified = causalPerformance({
    frameIdx: 11,
    navigationIntentIssuedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
    navigationIntentResolvedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
    routingGraphAttachmentCandidateCount: 90,
    routingGraphAttachmentFullSearchCount: 17,
    routingGraphAttachmentSupportCheckCount: 47,
    routingResolveCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
    simulationTick: 11,
  })
  const result = reduceZombieEnterRoomNavigationContract(baseline, unclassified, {
    context: 'unclassified work',
    targetRouteExpectation: 'stable',
  })
  assert.ok(result.issues.some((issue) => issue.includes('demand conservation failed')))

  const amplified = causalPerformance({
    frameIdx: 11,
    navigationIntentDemandCollisionRecoveryCount: 1,
    routingGraphAttachmentCandidateCount: 200,
    routingGraphAttachmentFullSearchCount: 17,
    routingGraphAttachmentSupportCheckCount: 100,
    simulationTick: 11,
  })
  const amplifiedResult = reduceZombieEnterRoomNavigationContract(baseline, amplified, {
    context: 'attachment amplification',
    targetRouteExpectation: 'stable',
  })
  assert.ok(
    amplifiedResult.issues.some((issue) => issue.includes('full attachment searches=')),
  )
})

test('causal reducer enforces every exact sparse-search slice and global tick budget', () => {
  const baseline = causalPerformance({ frameIdx: 10, simulationTick: 10 })
  for (const dimension of ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS) {
    const current = causalPerformance({
      frameIdx: 11,
      navigationSparseSearchBudgetViolationCount: 1,
      [dimension.maximumObservedKey]: dimension.maximumPerTick + 1,
      [dimension.thisTickKey]: dimension.maximumPerTick + 1,
      [dimension.totalKey]: baseline[dimension.totalKey] + dimension.maximumPerTick + 1,
      simulationTick: 11,
    })
    const result = reduceZombieEnterRoomNavigationContract(baseline, current, {
      context: `over-budget ${dimension.label}`,
      targetRouteExpectation: 'stable',
    })
    assert.ok(
      result.issues.some(
        (issue) => issue.includes(dimension.label) && issue.includes('this tick='),
      ),
    )
    assert.ok(
      result.issues.some(
        (issue) => issue.includes(dimension.label) && issue.includes('ticks *'),
      ),
    )
    assert.ok(result.issues.some((issue) => issue.includes('budget violation')))

    const changedDeclaration = causalPerformance({
      frameIdx: 11,
      [dimension.maximumPerAgentSliceKey]: dimension.maximumPerAgentSlice + 1,
      simulationTick: 11,
    })
    assert.ok(
      reduceZombieEnterRoomNavigationContract(baseline, changedDeclaration, {
        context: `changed ${dimension.label} declaration`,
        targetRouteExpectation: 'stable',
      }).issues.some(
        (issue) => issue.includes(`${dimension.label}/agent-slice=`) && issue.includes('expected'),
      ),
    )
  }
})

test('causal reducer requires exactly two target builds per committed publication and zero steady', () => {
  const baseline = causalPerformance({ frameIdx: 10, simulationTick: 10 })
  const steadyBuild = causalPerformance({
    frameIdx: 11,
    navigationSparseSearchTargetBuildsThisTick: 1,
    navigationSparseSearchTargetBuildsTotal: 3,
    simulationTick: 11,
  })
  const steadyResult = reduceZombieEnterRoomNavigationContract(baseline, steadyBuild, {
    context: 'steady target build',
    targetRouteExpectation: 'stable',
  })
  assert.ok(steadyResult.issues.some((issue) => issue.includes('target-build delta=1')))
  assert.ok(steadyResult.issues.some((issue) => issue.includes('during steady state')))

  const transition = causalPerformance({
    frameIdx: 11,
    navigationSparseSearchTargetBuildsThisTick: 2,
    navigationSparseSearchTargetBuildsTotal: 4,
    navigationTargetCommittedRouteGeneration: 2,
    navigationTargetRequestedRevision: 4,
    simulationTick: 11,
  })
  assert.deepEqual(
    reduceZombieEnterRoomNavigationContract(baseline, transition, {
      context: 'one committed route publication',
      targetRouteExpectation: 'published',
    }).issues,
    [],
  )

  const tooFewBuilds = causalPerformance({
    frameIdx: 11,
    navigationSparseSearchTargetBuildsThisTick: 1,
    navigationSparseSearchTargetBuildsTotal: 3,
    navigationTargetCommittedRouteGeneration: 2,
    navigationTargetRequestedRevision: 4,
    simulationTick: 11,
  })
  assert.ok(
    reduceZombieEnterRoomNavigationContract(baseline, tooFewBuilds, {
      context: 'incomplete target publication',
      targetRouteExpectation: 'published',
    }).issues.some((issue) => issue.includes('target-build delta=1 expected 2')),
  )

  const tooManyBuilds = causalPerformance({
    frameIdx: 11,
    navigationSparseSearchBudgetViolationCount: 1,
    navigationSparseSearchTargetBuildsMaximumObservedPerTick: 3,
    navigationSparseSearchTargetBuildsThisTick: 3,
    navigationSparseSearchTargetBuildsTotal: 5,
    navigationTargetCommittedRouteGeneration: 2,
    navigationTargetRequestedRevision: 4,
    simulationTick: 11,
  })
  const overBudget = reduceZombieEnterRoomNavigationContract(baseline, tooManyBuilds, {
    context: 'too many target builds',
    targetRouteExpectation: 'published',
  })
  assert.ok(overBudget.issues.some((issue) => issue.includes('target-build delta=3')))
  assert.ok(overBudget.issues.some((issue) => issue.includes('target builds this tick=3')))
})

test('sparse-search restarts conserve exact causes including coalesced collision recovery', () => {
  const baseline = causalPerformance({
    frameIdx: 10,
    navigationIntentPendingCount: 1,
    navigationIntentResolvedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchCompletedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchPendingAgentCount: 1,
    routingResolveCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    simulationTick: 10,
  })
  const restarted = causalPerformance({
    frameIdx: 11,
    navigationIntentPendingCount: 1,
    navigationIntentResolvedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchCompletedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    navigationSparseSearchPendingAgentCount: 1,
    navigationSparseSearchStartedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
    navigationSparseSearchUncausedStartViolationCount: 1,
    routingResolveCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    simulationTick: 11,
  })
  assert.ok(
    reduceZombieEnterRoomNavigationContract(baseline, restarted, {
      context: 'unsolicited restart',
      targetRouteExpectation: 'stable',
    }).issues.some((issue) => issue.includes('uncaused start violations=1')),
  )

  const routePublicationRestart = causalPerformance({
    frameIdx: 11,
    navigationIntentPendingCount: 1,
    navigationIntentResolvedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchCompletedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchInvalidatedCount: 1,
    navigationSparseSearchPendingAgentCount: 1,
    navigationSparseSearchRestartedCount: 1,
    navigationSparseSearchRestartedRoutePublishedCount: 1,
    navigationSparseSearchServiceSliceCountTotal:
      baseline.navigationSparseSearchAgentServiceSliceCountTotal + 1,
    navigationSparseSearchStartedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
    navigationSparseSearchTargetBuildsTotal: 4,
    navigationTargetCommittedRouteGeneration: 2,
    navigationTargetRequestedRevision: 4,
    routingResolveCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    simulationTick: 11,
  })
  assert.deepEqual(
    reduceZombieEnterRoomNavigationContract(baseline, routePublicationRestart, {
      context: 'route-publication restart',
      targetRouteExpectation: 'published',
    }).issues,
    [],
  )

  const collisionRestart = causalPerformance({
    frameIdx: 11,
    navigationIntentPendingCount: 1,
    navigationIntentResolvedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchCompletedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    navigationSparseSearchInvalidatedCount: 1,
    navigationSparseSearchPendingAgentCount: 1,
    navigationSparseSearchRestartedCollisionRecoveryCount: 1,
    navigationSparseSearchRestartedCount: 1,
    navigationSparseSearchStartedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT + 1,
    routingResolveCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    simulationTick: 11,
  })
  assert.deepEqual(
    reduceZombieEnterRoomNavigationContract(baseline, collisionRestart, {
      context: 'coalesced collision-recovery restart',
      targetRouteExpectation: 'stable',
    }).issues,
    [],
  )
})

test('production-shaped spawn work completes all one hundred jobs within existing readiness bounds', () => {
  const hierarchyNodeCount = 16
  const startedCount = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
  const maximumSpawnAttachmentHierarchyNodeVisits =
    startedCount * 2 * hierarchyNodeCount
  const visibilityInflatedSpawnHierarchyNodeVisits =
    maximumSpawnAttachmentHierarchyNodeVisits + startedCount * hierarchyNodeCount
  const maximumSpawnHeapOperations =
    maximumSpawnAttachmentHierarchyNodeVisits *
    (3 + 5 * Math.ceil(Math.log2(Math.max(1, hierarchyNodeCount))))
  const spawnServiceSlices = Math.ceil(
    maximumSpawnHeapOperations /
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerAgentSlice,
  )
  const baseline = causalPerformance({
    fallbackRoutingRebuildCount: 1,
    frameIdx: 100,
    navigationSparseAttachmentMaximumHierarchyNodeCount: hierarchyNodeCount,
    navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick: 0,
    navigationSparseSearchHierarchyNodeVisitsTotal: 0,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick: 0,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal: 0,
    simulationTick: 100,
    sparseSearchProgressTelemetry: {
      navigationSparseSpawnSearchCompletedCount: 0,
      navigationSparseSpawnSearchStartedCount: 0,
    },
  })
  const completedHeapTelemetry = createHeapWorkTelemetry({
    aggregateMaximum: 32,
    spawnMaximum: 32,
    spawnTotal: maximumSpawnHeapOperations,
  })
  const completedOptions = {
    fallbackRoutingRebuildCount: 1,
    meteredNavigationTelemetry: completedHeapTelemetry,
    navigationSparseAttachmentMaximumHierarchyNodeCount: hierarchyNodeCount,
    navigationSparseSearchCompletionProgressTotal: startedCount + spawnServiceSlices,
    navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick: 32,
    navigationSparseSearchHierarchyNodeVisitsTotal:
      visibilityInflatedSpawnHierarchyNodeVisits,
    navigationSparseSearchServiceSliceCountTotal: startedCount + spawnServiceSlices,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick: 32,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal:
      maximumSpawnAttachmentHierarchyNodeVisits,
    simulationTick: 100 + spawnServiceSlices,
    sparseSearchProgressTelemetry: {
      navigationSparseSearchAgentProgressSliceCountTotal: startedCount,
      navigationSparseSearchAgentServiceSliceCountTotal: startedCount,
      navigationSparseSpawnSearchCompletedCount: startedCount,
      navigationSparseSearchSpawnProgressSliceCountTotal: spawnServiceSlices,
      navigationSparseSearchSpawnServiceSliceCountTotal: spawnServiceSlices,
      navigationSparseSpawnSearchStartedCount: startedCount,
    },
  }
  const completed = causalPerformance({ frameIdx: 100 + spawnServiceSlices, ...completedOptions })
  assert.deepEqual(
    reduceZombieEnterRoomNavigationContract(baseline, completed, {
      context: 'production-shaped one-hundred-spawn readiness',
      targetRouteExpectation: 'stable',
    }).issues,
    [],
  )
  assert.ok(
    completed.navigationSparseSpawnSearchHierarchyNodeVisitsTotal >
      maximumSpawnAttachmentHierarchyNodeVisits,
  )

  const overworked = {
    ...completed,
    navigationSparseSearchHeapOperationsTotal:
      completed.navigationSparseSearchHeapOperationsTotal + 1,
    navigationSparseSpawnSearchHeapOperationsTotal:
      completed.navigationSparseSpawnSearchHeapOperationsTotal + 1,
  }
  assert.ok(
    reduceZombieEnterRoomNavigationContract(baseline, overworked, {
      context: 'overworked one-hundred-spawn readiness',
      targetRouteExpectation: 'stable',
    }).issues.some((issue) =>
      issue.includes(
        `spawn heap operations=${String(maximumSpawnHeapOperations + 1)} exceed topology bound=`,
      ),
    ),
  )

  const overvisited = {
    ...completed,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal:
      completed.navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal + 1,
  }
  assert.ok(
    reduceZombieEnterRoomNavigationContract(baseline, overvisited, {
      context: 'overvisited one-hundred-spawn readiness',
      targetRouteExpectation: 'stable',
    }).issues.some((issue) =>
      issue.includes(
        `spawn attachment hierarchy node visits=${String(
          maximumSpawnAttachmentHierarchyNodeVisits + 1,
        )} exceed`,
      ),
    ),
  )

  for (const key of Object.values(
    ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS,
  )) {
    const missingAttachmentHierarchyMeter = { ...completed }
    delete missingAttachmentHierarchyMeter[key]
    assert.ok(
      reduceZombieEnterRoomNavigationContract(baseline, missingAttachmentHierarchyMeter, {
        context: 'missing spawn attachment hierarchy meter',
        targetRouteExpectation: 'stable',
      }).issues.some((issue) => issue.includes(`${key}=undefined`)),
    )
  }

  const amplifiedCompletions = {
    ...completed,
    navigationSparseSpawnSearchCompletedCount: spawnServiceSlices + 1,
    navigationSparseSpawnSearchStartedCount: spawnServiceSlices + 1,
  }
  assert.ok(
    reduceZombieEnterRoomNavigationContract(baseline, amplifiedCompletions, {
      context: 'amplified one-hundred-spawn readiness',
      targetRouteExpectation: 'stable',
    }).issues.some((issue) =>
      issue.includes(`spawn completion delta=${String(spawnServiceSlices + 1)}`),
    ),
  )

  const overworkedObservation = observeZombieEnterRoomReadiness(
    createZombieEnterRoomReadinessState(),
    sample({
      ...completedOptions,
      frameIdx: 101 + spawnServiceSlices,
      insideBuilding: false,
      meteredNavigationTelemetry: createHeapWorkTelemetry({
        aggregateMaximum: 32,
        spawnMaximum: 32,
        spawnTotal: maximumSpawnHeapOperations + 1,
      }),
      remaining: 170,
    }),
    { route: ROUTE, target: ROUTE.outside },
  )
  assert.ok(
    overworkedObservation.issues.some((issue) =>
      issue.includes('routing priming sparse spawn work spawn heap operations='),
    ),
  )

  let readiness = createZombieEnterRoomReadinessState()
  let observation = null
  for (
    let offset = 0;
    offset < ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples;
    offset += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        ...completedOptions,
        frameIdx: 129 + offset,
        insideBuilding: false,
        remaining: 170,
      }),
      { route: ROUTE, target: ROUTE.outside },
    )
    readiness = observation.state
  }
  assert.deepEqual(observation.issues, [])
  assert.equal(readiness.ready, true)
  assert.equal(ZOMBIE_ENTER_ROOM_TIMING.premeasurementQuiescenceTimeoutMs, 90_000)
  assert.ok(
    (ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples - 1) *
      ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs <
      ZOMBIE_ENTER_ROOM_TIMING.premeasurementQuiescenceTimeoutMs,
  )
})

test('premeasurement readiness accepts strict routing while the lazy fallback remains unbuilt', () => {
  let readiness = createZombieEnterRoomReadinessState()
  let observation = null
  for (
    let frameIdx = 1;
    frameIdx <= ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples;
    frameIdx += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        fallbackRoutingRebuildCount: 0,
        frameIdx,
        insideBuilding: false,
        remaining: 170,
      }),
      { route: ROUTE, target: ROUTE.outside },
    )
    readiness = observation.state
  }
  assert.deepEqual(observation.issues, [])
  assert.equal(readiness.consecutiveSamples, 12)
  assert.equal(readiness.ready, true)
})

test('premeasurement readiness rejects a ready-status target field with no committed bank', () => {
  const uncommitted = observeZombieEnterRoomReadiness(
    createZombieEnterRoomReadinessState(),
    sample({
      frameIdx: 1,
      insideBuilding: false,
      navigationTargetCommittedRouteGeneration: 0,
      remaining: 170,
    }),
    { route: ROUTE, target: ROUTE.outside },
  )
  assert.equal(uncommitted.state.ready, false)
  assert.equal(uncommitted.state.consecutiveSamples, 0)
  assert.ok(
    uncommitted.issues.some((issue) => issue.includes('committed route generation=0')),
  )

  const committed = observeZombieEnterRoomReadiness(
    createZombieEnterRoomReadinessState(),
    sample({ frameIdx: 1, insideBuilding: false, remaining: 170 }),
    { route: ROUTE, target: ROUTE.outside },
  )
  assert.deepEqual(committed.issues, [])
  assert.equal(committed.state.consecutiveSamples, 1)
})

test('premeasurement readiness verifies fallback routing when explicitly required', () => {
  let readiness = createZombieEnterRoomReadinessState()
  let observation = null
  for (
    let frameIdx = 1;
    frameIdx <= ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples;
    frameIdx += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        fallbackRoutingRebuildCount: 0,
        frameIdx,
        insideBuilding: false,
        remaining: 170,
      }),
      { requireFallbackRouting: true, route: ROUTE, target: ROUTE.outside },
    )
    readiness = observation.state
    assert.equal(readiness.ready, false)
    assert.equal(readiness.consecutiveSamples, 0)
  }
  assert.ok(
    observation.issues.some((issue) => issue.includes('fallback routing rebuild count=0')),
  )

  observation = observeZombieEnterRoomReadiness(
    readiness,
    sample({
      fallbackRoutingRebuildCount: 1,
      frameIdx: ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples + 1,
      insideBuilding: false,
      remaining: 170,
    }),
    { requireFallbackRouting: true, route: ROUTE, target: ROUTE.outside },
  )
  readiness = observation.state
  assert.deepEqual(observation.changedFields, ['fallbackRoutingRebuildCount'])
  assert.equal(readiness.resetCount, 1)
  assert.equal(readiness.consecutiveSamples, 1)
  assert.equal(readiness.ready, false)

  for (
    let offset = 1;
    offset < ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples;
    offset += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        fallbackRoutingRebuildCount: 1,
        frameIdx: ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples + 1 + offset,
        insideBuilding: false,
        remaining: 170,
      }),
      { requireFallbackRouting: true, route: ROUTE, target: ROUTE.outside },
    )
    readiness = observation.state
  }
  assert.equal(readiness.consecutiveSamples, 12)
  assert.equal(readiness.ready, true)
})

test('premeasurement readiness resets when a late attachment search changes its counters', () => {
  assert.deepEqual(ZOMBIE_ENTER_ROOM_QUIESCENCE_FIELDS, [
    'collisionWorldGeneration',
    'fallbackRoutingRebuildCount',
    'navigationAnchorInvalidationCount',
    'navigationIntentDemandSpawnCount',
    'navigationIntentDemandWorldChangedCount',
    'navigationIntentDemandConnectorChangedCount',
    'navigationIntentDemandCachedAnchorLostCount',
    'navigationIntentDemandCollisionRecoveryCount',
    'navigationIntentDemandRoutePublishedCount',
    'navigationIntentCanceledCount',
    'navigationIntentIssuedCount',
    'navigationIntentPendingCount',
    'navigationIntentResolvedCount',
    'navigationTargetRequestedRevision',
    'navigationTargetCommittedRouteGeneration',
    'navigationWorldRevision',
    'navigationSparseSearchCandidateVisitsTotal',
    'navigationSparseSearchCollisionPredicatesTotal',
    'navigationSparseSearchCompletedCount',
    'navigationSparseSearchHeapOperationsTotal',
    'navigationSparseSearchHierarchyNodeVisitsTotal',
    'navigationSparseSearchPendingAgentCount',
    'navigationSparseSearchStartedCount',
    'navigationSparseSearchSupportPredicatesTotal',
    'navigationSparseSearchTargetBuildsTotal',
    'routingGraphAttachmentCandidateCount',
    'routingGraphAttachmentFullSearchCount',
    'routingGraphAttachmentSupportCheckCount',
    'routingRebuildCount',
    ...new Set([
      ...ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_TELEMETRY_KEYS,
      'navigationSparseAttachmentMaximumHierarchyNodeCount',
      ...Object.values(ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS).filter(Boolean),
      ...Object.values(
        ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS,
      ),
      ...ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
      ...ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS.flatMap((dimension) => [
        dimension.maximumPerTickKey,
        dimension.thisTickKey,
        ...(dimension.violationCountKey ? [dimension.violationCountKey] : []),
      ]),
      ...ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.map(
        (dimension) => dimension.thisTickKey,
      ),
      ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS.filter(
        (key) =>
          key !== 'navigationTargetRequestedRevision' &&
          key !== 'navigationTargetCommittedRouteGeneration',
      ),
      ...ZOMBIE_ENTER_ROOM_WORLD_REFRESH_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_COLLISION_REANCHOR_COUNTER_KEYS,
      ...ZOMBIE_ENTER_ROOM_LIVENESS_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_TELEMETRY_KEYS,
      'navigationGoalResolvedTick',
      ...ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_COUNTER_KEYS,
      'navigationSparseSearchActiveAgentCount',
      'navigationSparseSearchWorldStaleActiveCount',
    ]),
  ])
  let readiness = createZombieEnterRoomReadinessState()
  let observation = null
  for (
    let frameIdx = 1;
    frameIdx < ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples;
    frameIdx += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        fallbackRoutingRebuildCount: 1,
        frameIdx,
        insideBuilding: false,
        remaining: 170,
      }),
      { route: ROUTE, target: ROUTE.outside },
    )
    readiness = observation.state
  }
  assert.equal(readiness.consecutiveSamples, 11)
  assert.equal(readiness.ready, false)
  observation = observeZombieEnterRoomReadiness(
    readiness,
    sample({
      fallbackRoutingRebuildCount: 1,
      frameIdx: 11,
      insideBuilding: false,
      remaining: 170,
    }),
    { route: ROUTE, target: ROUTE.outside },
  )
  readiness = observation.state
  assert.equal(observation.frameAdvanced, false)
  assert.equal(readiness.consecutiveSamples, 11)
  assert.equal(readiness.ready, false)

  observation = observeZombieEnterRoomReadiness(
    readiness,
    sample({
      fallbackRoutingRebuildCount: 1,
      frameIdx: 12,
      insideBuilding: false,
      remaining: 170,
      routingGraphAttachmentCandidateCount: 90,
      routingGraphAttachmentFullSearchCount: 15,
      routingGraphAttachmentSupportCheckCount: 47,
    }),
    { route: ROUTE, target: ROUTE.outside },
  )
  readiness = observation.state
  assert.deepEqual(observation.changedFields, [
    'routingGraphAttachmentCandidateCount',
    'routingGraphAttachmentFullSearchCount',
    'routingGraphAttachmentSupportCheckCount',
  ])
  assert.equal(readiness.resetCount, 1)
  assert.equal(readiness.consecutiveSamples, 1)
  assert.equal(readiness.ready, false)

  for (
    let frameIdx = 13;
    frameIdx < 13 + ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples - 1;
    frameIdx += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        fallbackRoutingRebuildCount: 1,
        frameIdx,
        insideBuilding: false,
        remaining: 170,
        routingGraphAttachmentCandidateCount: 90,
        routingGraphAttachmentFullSearchCount: 15,
        routingGraphAttachmentSupportCheckCount: 47,
      }),
      { route: ROUTE, target: ROUTE.outside },
    )
    readiness = observation.state
  }
  assert.equal(readiness.consecutiveSamples, 12)
  assert.equal(readiness.ready, true)
})

test('doorway route ordering is stable and does not mutate discovery order', () => {
  const routes = [
    { buildingScopeId: 'b', doorId: 'door-2', levelId: 'l1' },
    { buildingScopeId: 'a', doorId: 'door-3', levelId: 'l2' },
    { buildingScopeId: 'a', doorId: 'door-1', levelId: 'l1' },
  ]
  assert.deepEqual(
    sortLandrushExteriorEntryRoutes(routes).map((route) => route.doorId),
    ['door-1', 'door-3', 'door-2'],
  )
  assert.deepEqual(
    routes.map((route) => route.doorId),
    ['door-2', 'door-3', 'door-1'],
  )
})

test('presentation proof accepts only exact K=0 or K=16 accounting for one hundred zombies', () => {
  const detailed = sample({ frameIdx: 12, insideBuilding: true, remaining: 176.5 })
  assert.deepEqual(
    zombieEnterRoomPresentationIssues(
      detailed,
      createZombieEnterRoomMeasurementContract(16).presentation,
    ),
    [],
  )

  const instanced = sample({
    frameIdx: 13,
    insideBuilding: true,
    presentationDetailedActiveCount: 0,
    presentationDetailedCapacity: 0,
    presentationInstancedActiveCount: 100,
    remaining: 176.5,
  })
  assert.deepEqual(
    zombieEnterRoomPresentationIssues(
      instanced,
      createZombieEnterRoomMeasurementContract(0).presentation,
    ),
    [],
  )

  assert.throws(() => createZombieEnterRoomMeasurementContract(8), /must be 0 or 16/u)
  const misaccounted = {
    ...detailed,
    presentation: { ...detailed.presentation, instancedActiveCount: 83 },
  }
  const issues = zombieEnterRoomPresentationIssues(
    misaccounted,
    createZombieEnterRoomMeasurementContract(16).presentation,
  )
  assert.ok(issues.some((issue) => issue.includes('accounting active=100 detailed+instanced=99')))
  assert.ok(issues.some((issue) => issue.includes('instancedActiveCount=83 expected 84')))
})

test('state evidence includes pose, room identity, readiness, soak state, and counters', () => {
  const summary = summarizeZombieEnterRoomState(
    sample({
      frameIdx: 12,
      insideBuilding: true,
      navigationSparseCollisionReanchorAttemptCount: 7,
      navigationSparseCollisionReanchorCompletedCount: 5,
      navigationSparseCollisionReanchorFailedCount: 2,
      remaining: 176.5,
    }),
  )
  assert.deepEqual(summary.playerPose, { heading: 0.25, x: 2, y: 0, z: 1 })
  assert.equal(summary.insideBuilding, true)
  assert.equal(summary.buildingScopeId, ROUTE.buildingScopeId)
  assert.equal(summary.levelId, ROUTE.levelId)
  assert.equal(summary.phase, 'night')
  assert.equal(summary.expectedPhase, 'night')
  assert.equal(summary.phaseReady, true)
  assert.equal(summary.activeZombieCount, ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)
  assert.equal(summary.bridgeFrameIdx, 12)
  assert.equal(summary.nodeCount, 240)
  assert.deepEqual(summary.presentation, {
    activeMixerCount: 16,
    activeZombieCount: 100,
    allocatedRootCount: 16,
    authoredInstancedActiveCount: 84,
    authoredInstancedBatchCount: 10,
    detailedActiveCount: 16,
    detailedCapacity: 16,
    fallbackCount: 0,
    instancedActiveCount: 84,
    rootCapacity: 20,
    unpresentedActiveCount: 0,
  })
  assert.deepEqual(summary.roomSoak, {
    activeZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    enabled: true,
    obstacleDeltaAppliedRevision: 0,
    obstacleDamageSuppressed: true,
    obstacleDeltaRequestedRevision: 0,
    phaseHeld: true,
    playerProtected: true,
    reachableSpawnCompletedCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    representedZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    rosterRealized: true,
    scheduledZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    targetZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    zombieCapacity: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  })
  assert.equal(summary.performance.collisionWorldGeneration, 3)
  assert.equal(summary.performance.spatialQueryCount, 12)
  assert.equal(summary.performance.spatialCandidateInspectionCount, 576)
  assert.equal(summary.performance.navigationSparseSpawnSearchDependencyWaiting, false)
  assert.equal(summary.performance.navigationSparseCollisionReanchorAttemptCount, 7)
  assert.equal(summary.performance.navigationSparseCollisionReanchorCompletedCount, 5)
  assert.equal(summary.performance.navigationSparseCollisionReanchorFailedCount, 2)
  assert.deepEqual(
    Object.keys(summarizeZombieEnterRoomPerformance(sample({ insideBuilding: false }))).sort(),
    [...new Set([
      'collisionWorldGeneration',
      'fallbackRoutingRebuildCount',
      'navigationAnchorInvalidationCount',
      'navigationAnchoredAgentCount',
      'navigationIntentCanceledCount',
      'navigationIntentDemandCachedAnchorLostCount',
      'navigationIntentDemandCollisionRecoveryCount',
      'navigationIntentDemandConnectorChangedCount',
      'navigationIntentDemandRoutePublishedCount',
      'navigationIntentDemandSpawnCount',
      'navigationIntentDemandWorldChangedCount',
      'navigationIntentFirstServiceCount',
      'navigationIntentIssuedCount',
      'navigationIntentMaximumUnservicedAgeTicksObserved',
      'navigationIntentOldestPendingAgeTicks',
      'navigationIntentOldestUnservicedAgeTicks',
      'navigationIntentPendingCount',
      'navigationIntentResolveBudgetViolationCount',
      'navigationIntentResolvedCount',
      'navigationIntentUnservicedPendingCount',
      'navigationSparseSearchActiveAgentCount',
      'navigationSparseSearchWorldStaleActiveCount',
      'navigationSparseSearchAgentSlicesPerTick',
      'navigationSparseSearchBudgetViolationCount',
      'navigationSparseSearchCanceledCount',
      'navigationSparseSearchCandidateVisitsMaximumObservedPerTick',
      'navigationSparseSearchCandidateVisitsThisTick',
      'navigationSparseSearchCandidateVisitsTotal',
      'navigationSparseSearchCollisionPredicatesMaximumObservedPerTick',
      'navigationSparseSearchCollisionPredicatesThisTick',
      'navigationSparseSearchCollisionPredicatesTotal',
      'navigationSparseSearchCompletedCount',
      'navigationSparseSearchCompletionProgressThisTick',
      'navigationSparseSearchCompletionProgressTotal',
      'navigationSparseSearchHeapOperationsMaximumObservedPerTick',
      'navigationSparseSearchHeapOperationsThisTick',
      'navigationSparseSearchHeapOperationsTotal',
      'navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick',
      'navigationSparseSearchHierarchyNodeVisitsThisTick',
      'navigationSparseSearchHierarchyNodeVisitsTotal',
      'navigationSparseSearchInvalidatedCount',
      'navigationSparseSearchMaximumCandidateVisitsPerAgentSlice',
      'navigationSparseSearchMaximumCandidateVisitsPerTick',
      'navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice',
      'navigationSparseSearchMaximumCollisionPredicatesPerTick',
      'navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice',
      'navigationSparseSearchMaximumHierarchyNodeVisitsPerTick',
      'navigationSparseSearchMaximumHeapOperationsPerAgentSlice',
      'navigationSparseSearchMaximumHeapOperationsPerTick',
      'navigationSparseSearchMaximumNoProgressAgeTicksObserved',
      'navigationSparseSearchMaximumSupportPredicatesPerAgentSlice',
      'navigationSparseSearchMaximumSupportPredicatesPerTick',
      'navigationSparseSearchMaximumTargetBuildsPerTick',
      'navigationSparseSearchNoProgressAgeTicks',
      'navigationSparseSearchPendingAgentCount',
      'navigationSparseSearchRestartedCollisionRecoveryCount',
      'navigationSparseSearchRestartedCount',
      'navigationSparseSearchRestartedRoutePublishedCount',
      'navigationSparseSearchRestartedWorldChangedCount',
      'navigationSparseSearchServiceSliceCountThisTick',
      'navigationSparseSearchServiceSliceCountTotal',
      'navigationSparseSearchStartedCount',
      'navigationSparseSearchSupportPredicatesMaximumObservedPerTick',
      'navigationSparseSearchSupportPredicatesThisTick',
      'navigationSparseSearchSupportPredicatesTotal',
      'navigationSparseSearchTargetBuildsMaximumObservedPerTick',
      'navigationSparseSearchTargetBuildsThisTick',
      'navigationSparseSearchTargetBuildsTotal',
      'navigationSparseSearchUncausedStartViolationCount',
      'navigationTargetCommittedRouteGeneration',
      'navigationTargetRequestedRevision',
      'navigationWorldRevision',
      'routingGraphAttachmentCandidateCount',
      'routingGraphAttachmentFullSearchCount',
      'routingGraphAttachmentSupportCheckCount',
      'routingMaximumResolveCountObservedPerTick',
      'routingNavigationMode',
      'routingRebuildCount',
      'routingResolveBudgetPerTick',
      'routingResolveCount',
      'routingResolveCountThisTick',
      'routingTargetLayerIndex',
      'simulationTick',
      'spatialBuildCount',
      'spatialCandidateInspectionCount',
      'spatialIndexedAgentCount',
      'spatialMaximumCandidateInspectionsObserved',
      'spatialMaximumCandidateInspectionsPerQuery',
      'spatialOverflowQueryCount',
      'spatialPairInspectionCount',
      'spatialQueryCount',
      'spatialSeparationNeighborCount',
      'spatialUnindexedAgentCount',
      ...ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_TELEMETRY_KEYS,
      'navigationSparseAttachmentMaximumHierarchyNodeCount',
      ...Object.values(ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS).filter(Boolean),
      ...Object.values(
        ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS,
      ),
      ...ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
      ...ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS.flatMap((dimension) => [
        dimension.maximumPerTickKey,
        dimension.thisTickKey,
        ...(dimension.violationCountKey ? [dimension.violationCountKey] : []),
      ]),
      ...ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.map(
        (dimension) => dimension.thisTickKey,
      ),
      ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_WORLD_REFRESH_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_COLLISION_REANCHOR_COUNTER_KEYS,
      ...ZOMBIE_ENTER_ROOM_LIVENESS_TELEMETRY_KEYS,
      ...ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_TELEMETRY_KEYS,
      'navigationGoalResolvedTick',
    ])].sort(),
  )
})

test('validity accepts repeated outside-entry-inside-exit cycles', () => {
  let state = createZombieEnterRoomValidityState()
  let frameIdx = 1
  const remaining = 178
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    state = observe(state, {
      cycle,
      frameIdx: frameIdx++,
      insideBuilding: false,
      remaining,
      stage: 'outside-hold',
    })
    state = observe(state, {
      cycle,
      frameIdx: frameIdx++,
      insideBuilding: true,
      remaining,
      stage: 'entered',
    })
    state = observe(state, {
      cycle,
      frameIdx: frameIdx++,
      insideBuilding: true,
      remaining,
      stage: 'inside-hold',
    })
    state = observe(state, {
      cycle,
      frameIdx: frameIdx++,
      insideBuilding: false,
      remaining,
      stage: 'exited',
    })
  }

  assert.equal(state.completedCycles, 2)
  assert.equal(state.expectedCycle, 3)
  assert.equal(state.nextStageIndex, 0)
  assert.equal(state.sampleCount, 8)
  assert.equal(state.initialNight, 1)
  assert.equal(state.initialNodeCount, 240)
  assert.equal(state.activeZombieCountMin, ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)
  assert.equal(state.activeZombieCountMax, ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)
  assert.equal(state.collisionWorldGeneration, 3)
  assert.equal(state.phaseSecondsRemainingBaseline, 178)
  assert.equal(state.performanceBaseline.spatialQueryCount, 1)
  assert.equal(state.lastPerformance.spatialQueryCount, 8)
  assert.equal(state.performanceCounterDeltas.spatialQueryCount, 7)
  assert.equal(state.performanceCounterDeltas.spatialCandidateInspectionCount, 336)
  assert.equal(state.performanceCounterDeltas.routingResolveCount, 0)
  assert.equal(state.performanceCounterDeltas.navigationTargetRequestedRevision, 12)
  assert.equal(state.performanceCounterDeltas.navigationTargetCommittedRouteGeneration, 4)
  assert.deepEqual(state.issues, [])
  assert.deepEqual(
    collectZombieEnterRoomFinalIssues({
      elapsedMs: ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS + 1_000,
      requestedDurationMs: ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS,
      validity: state,
    }),
    [],
  )
})

test('phase hold keeps an immutable countdown baseline and rejects downward drift', () => {
  let state = createZombieEnterRoomValidityState()
  state = observe(state, {
    cycle: 1,
    frameIdx: 1,
    insideBuilding: false,
    remaining: 178,
    stage: 'outside-hold',
  })
  state = observe(state, {
    cycle: 1,
    frameIdx: 2,
    insideBuilding: true,
    remaining: 178,
    stage: 'entered',
  })
  state = observe(state, {
    cycle: 1,
    frameIdx: 3,
    insideBuilding: true,
    remaining: 177.75,
    stage: 'inside-hold',
  })

  assert.equal(state.phaseSecondsRemainingBaseline, 178)
  const drifted = observeZombieEnterRoomStage(
    state,
    sample({ frameIdx: 4, insideBuilding: false, remaining: 177.4 }),
    {
      cycle: 1,
      expectedInside: false,
      route: ROUTE,
      stage: 'exited',
      target: ROUTE.outside,
    },
  )
  assert.ok(drifted.issues.includes('night countdown drifted from 178 to 177.4'))
  assert.equal(drifted.state.phaseSecondsRemainingBaseline, 178)
})

test('performance gates require bounded monotonic routing and spatial work in a stable world', () => {
  assert.ok(ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS.includes('spatialQueryCount'))
  assert.ok(ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS.includes('routingResolveCount'))
  const previous = summarizeZombieEnterRoomPerformance(
    sample({ frameIdx: 10, insideBuilding: false, remaining: 170 }),
  )
  assert.deepEqual(zombieEnterRoomPerformanceIssues(previous), [])

  const overloaded = summarizeZombieEnterRoomPerformance(
    sample({
      collisionWorldGeneration: 4,
      frameIdx: 11,
      insideBuilding: true,
      remaining: 169,
      routingMaximumResolveCountObservedPerTick: 17,
      routingResolveCountThisTick: 17,
      spatialCandidateInspectionCount: 529,
      spatialMaximumCandidateInspectionsObserved: 49,
      spatialQueryCount: 11,
      spatialUnindexedAgentCount: 1,
    }),
  )
  const overloadIssues = zombieEnterRoomPerformanceIssues(overloaded, {
    expectedCollisionWorldGeneration: 3,
    previous,
  })
  assert.ok(overloadIssues.some((issue) => issue.includes('collision world generation changed')))
  assert.ok(overloadIssues.some((issue) => issue.includes('spatial unindexed agents=1')))
  assert.ok(overloadIssues.some((issue) => issue.includes('exceeds cap=48')))
  assert.ok(overloadIssues.some((issue) => issue.includes('candidate delta=49')))
  assert.ok(overloadIssues.some((issue) => issue.includes('resolves this tick=17')))
  assert.ok(overloadIssues.some((issue) => issue.includes('routing max resolves=17')))

  const changedBudget = summarizeZombieEnterRoomPerformance(
    sample({
      frameIdx: 11,
      insideBuilding: true,
      remaining: 169,
      routingResolveBudgetPerTick: 17,
    }),
  )
  assert.ok(
    zombieEnterRoomPerformanceIssues(changedBudget, { previous }).some((issue) =>
      issue.includes('routing resolve budget=17 expected 16'),
    ),
  )

  const regressed = summarizeZombieEnterRoomPerformance(
    sample({
      frameIdx: 9,
      insideBuilding: true,
      navigationIntentDemandSpawnCount: 13,
      navigationIntentIssuedCount: 13,
      navigationIntentResolvedCount: 13,
      remaining: 169,
      routingResolveCount: 13,
    }),
  )
  const regressionIssues = zombieEnterRoomPerformanceIssues(regressed, { previous })
  assert.ok(regressionIssues.some((issue) => issue.includes('spatialQueryCount regressed')))
  assert.ok(
    regressionIssues.some((issue) => issue.includes('spatialCandidateInspectionCount regressed')),
  )
  assert.ok(regressionIssues.some((issue) => issue.includes('routingResolveCount regressed')))
})

test('performance gates require sparse routing and zero omissions from each completed index', () => {
  const lifecycleSkew = sample({
    activeTargets: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    insideBuilding: true,
    routingNavigationMode: 'dense',
    spatialIndexedAgentCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
  })
  const issues = zombieEnterRoomBaseIssues(lifecycleSkew)
  assert.ok(issues.includes('routing navigation mode=dense'))
  assert.equal(issues.some((issue) => issue.includes('spatial indexed agents=')), false)

  const omitted = sample({
    activeTargets: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    insideBuilding: true,
    spatialIndexedAgentCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - 1,
    spatialUnindexedAgentCount: 1,
  })
  assert.ok(zombieEnterRoomBaseIssues(omitted).includes('spatial unindexed agents=1'))
})

test('validity rejects routing rebuilds while the player holds still', () => {
  let state = createZombieEnterRoomValidityState()
  state = observe(state, {
    cycle: 1,
    frameIdx: 1,
    insideBuilding: false,
    remaining: 178,
    stage: 'outside-hold',
  })
  const entered = observeZombieEnterRoomStage(
    state,
    sample({
      frameIdx: 2,
      insideBuilding: true,
      navigationSparseSearchTargetBuildsTotal: 4,
      navigationTargetCommittedRouteGeneration: 2,
      navigationTargetRequestedRevision: 3,
      remaining: 178,
      simulationTick: 3,
    }),
    {
      cycle: 1,
      expectedInside: true,
      route: ROUTE,
      stage: 'entered',
      target: ROUTE.inside,
    },
  )
  assert.deepEqual(entered.issues, [])
  const held = observeZombieEnterRoomStage(
    entered.state,
    sample({
      fallbackRoutingRebuildCount: 1,
      frameIdx: 3,
      insideBuilding: true,
      navigationIntentDemandCollisionRecoveryCount: 1,
      navigationSparseSearchTargetBuildsTotal: 4,
      navigationTargetCommittedRouteGeneration: 2,
      navigationTargetRequestedRevision: 3,
      remaining: 178,
      routingGraphAttachmentCandidateCount: 90,
      routingGraphAttachmentFullSearchCount: 15,
      routingGraphAttachmentSupportCheckCount: 47,
      routingRebuildCount: 2,
    }),
    {
      cycle: 1,
      expectedInside: true,
      route: ROUTE,
      stage: 'inside-hold',
      target: ROUTE.inside,
    },
  )
  assert.ok(held.issues.some((issue) => issue.includes('strict routing rebuilt')))
  assert.ok(held.issues.some((issue) => issue.includes('fallback routing rebuilt')))
  assert.equal(held.issues.some((issue) => issue.includes('attachment work changed')), false)
  assert.equal(held.issues.some((issue) => issue.includes('full attachment searches=')), false)
})

test('measured room states require every benchmark-only soak control', () => {
  const issues = zombieEnterRoomStateIssues(
    sample({
      frameIdx: 2,
      insideBuilding: true,
      obstacleDamageSuppressed: false,
      phaseHeld: false,
      playerProtected: false,
      remaining: 170,
    }),
    {
      expectedInside: true,
      requireRoomSoak: true,
      route: ROUTE,
      target: ROUTE.inside,
    },
  )
  assert.ok(issues.includes('room soak did not suppress obstacle damage'))
  assert.ok(issues.includes('room soak is not holding the phase clock'))
  assert.ok(issues.includes('room soak did not protect the player'))
})

test('measured room states require the exact capacity and a realized reachable roster', () => {
  const issues = zombieEnterRoomBaseIssues(
    sample({
      frameIdx: 2,
      insideBuilding: true,
      remaining: 170,
      roomSoakReachableSpawnCompletedCount: 99,
      roomSoakRepresentedZombieCount: 99,
      roomSoakRosterRealized: false,
      roomSoakScheduledZombieCount: 99,
      roomSoakTargetZombieCount: 99,
      zombieCapacity: 99,
    }),
    { requireRoomSoak: true },
  )

  assert.ok(issues.includes('zombie capacity=99 expected 100'))
  assert.ok(issues.includes('room-soak target zombie count=99 expected 100'))
  assert.ok(issues.includes('room-soak scheduled zombie count=99 expected 100'))
  assert.ok(issues.includes('reachable spawn completions=99 expected at least 100'))
  assert.ok(issues.includes('represented zombie count=99 expected 100'))
  assert.ok(issues.includes('room-soak roster is not realized through reachable sparse spawns'))

  const missingCompletion = sample({ frameIdx: 3, insideBuilding: true, remaining: 170 })
  delete missingCompletion.zombie.benchmarkRoomSoak.reachableSpawnCompletedCount
  assert.ok(
    zombieEnterRoomBaseIssues(missingCompletion, { requireRoomSoak: true }).includes(
      'reachable spawn completions=undefined expected at least 100',
    ),
  )
})

test('readiness can quiesce inside after the measured obstacle transaction', () => {
  let readiness = createZombieEnterRoomReadinessState()
  let observation = null
  for (
    let frameIdx = 1;
    frameIdx <= ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples;
    frameIdx += 1
  ) {
    observation = observeZombieEnterRoomReadiness(
      readiness,
      sample({
        fallbackRoutingRebuildCount: 1,
        frameIdx,
        insideBuilding: true,
        remaining: 170,
      }),
      { expectedInside: true, route: ROUTE, target: ROUTE.inside },
    )
    readiness = observation.state
  }
  assert.deepEqual(observation.issues, [])
  assert.equal(readiness.ready, true)
})

test('room soak cleanup requires obstacle damage and player/phase controls to be released', () => {
  const ended = {
    active: false,
    enabled: true,
    obstacleDamageSuppressed: false,
    phaseHeld: false,
    playerProtected: false,
  }
  assert.deepEqual(zombieEnterRoomSoakCleanupIssues(ended, { roomSoakBegan: true }), [])
  assert.ok(
    zombieEnterRoomSoakCleanupIssues(
      { ...ended, obstacleDamageSuppressed: true },
      { roomSoakBegan: true },
    )[0].includes('did not end cleanly'),
  )
  assert.deepEqual(zombieEnterRoomSoakCleanupIssues(null, { roomSoakBegan: true }), [
    'zombie room soak bridge disappeared before cleanup',
  ])
})

test('room state rejects wrong topology, movement, phase readiness, and empty hordes', () => {
  const wrongRoom = sample({
    buildingScopeId: 'building-b',
    frameIdx: 1,
    insideBuilding: true,
    levelId: 'level-upper',
    remaining: 170,
    speed: 0.5,
  })
  const roomIssues = zombieEnterRoomStateIssues(wrongRoom, {
    expectedInside: true,
    route: ROUTE,
    target: ROUTE.inside,
  })
  assert.ok(roomIssues.some((issue) => issue.includes('building=')))
  assert.ok(roomIssues.some((issue) => issue.includes('level=')))
  assert.ok(roomIssues.some((issue) => issue.includes('player speed=')))

  const transition = sample({
    activeTargets: 0,
    expectedPhase: 'build',
    frameIdx: 2,
    insideBuilding: false,
    phaseReady: false,
    remaining: 1,
  })
  transition.hud = { expectedPhase: 'build', phase: 'night', phaseReady: false }
  const baseIssues = zombieEnterRoomBaseIssues(transition)
  assert.ok(baseIssues.some((issue) => issue.includes('expected phase=')))
  assert.ok(baseIssues.some((issue) => issue.includes('phase ready=')))
  assert.ok(baseIssues.some((issue) => issue.includes('active zombie count=')))
})

test('measured steady stages require exactly one hundred zombies', () => {
  assert.equal(
    zombieEnterRoomStateIssues(
      sample({ activeTargets: 100, frameIdx: 1, insideBuilding: false, remaining: 170 }),
      {
        expectedInside: false,
        route: ROUTE,
        target: ROUTE.outside,
      },
    ).some((issue) => issue.includes('active zombie count=')),
    false,
  )
  for (const activeTargets of [99, 101]) {
    assert.ok(
      zombieEnterRoomStateIssues(
        sample({ activeTargets, frameIdx: 1, insideBuilding: false, remaining: 170 }),
        {
          expectedInside: false,
          route: ROUTE,
          target: ROUTE.outside,
        },
      ).includes(`active zombie count=${activeTargets} expected 100`),
    )
  }
})

test('validity rejects a zombie roster that changes after measurement begins', () => {
  let state = createZombieEnterRoomValidityState()
  state = observe(state, {
    cycle: 1,
    frameIdx: 1,
    insideBuilding: false,
    remaining: 170,
    stage: 'outside-hold',
  })
  const changed = observeZombieEnterRoomStage(
    state,
    sample({ activeTargets: 99, frameIdx: 2, insideBuilding: true, remaining: 170 }),
    {
      cycle: 1,
      expectedInside: true,
      route: ROUTE,
      stage: 'entered',
      target: ROUTE.inside,
    },
  )
  assert.ok(changed.issues.includes('active zombie count=99 expected 100'))
  assert.ok(changed.issues.includes('active zombie count changed from 100 to 99'))
  assert.equal(changed.state.activeZombieCountMin, 99)
  assert.equal(changed.state.activeZombieCountMax, 100)
})

test('final validity rejects observer-light measurements shorter than three minutes', () => {
  const validity = createZombieEnterRoomValidityState()
  validity.activeZombieCountMin = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
  validity.activeZombieCountMax = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
  validity.completedCycles = 2
  validity.sampleCount = 8
  validity.performanceCounterDeltas = {
    navigationTargetCommittedRouteGeneration: 1,
    navigationTargetRequestedRevision: 1,
    spatialBuildCount: 1,
    spatialQueryCount: 1,
  }
  const requestedDurationMs = ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS - 1
  assert.deepEqual(
    collectZombieEnterRoomFinalIssues({
      elapsedMs: requestedDurationMs,
      requestedDurationMs,
      validity,
    }),
    [
      `requested duration ${requestedDurationMs}ms is below the ` +
        `${ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS}ms observer-light minimum`,
    ],
  )
})

test('validity rejects stage reordering and stable-world regressions', () => {
  let state = createZombieEnterRoomValidityState()
  const reordered = observeZombieEnterRoomStage(
    state,
    sample({ frameIdx: 1, insideBuilding: true, remaining: 175 }),
    {
      cycle: 1,
      expectedInside: true,
      route: ROUTE,
      stage: 'entered',
      target: ROUTE.inside,
    },
  )
  assert.ok(reordered.issues.some((issue) => issue.includes('expected outside-hold')))

  state = observe(state, {
    cycle: 1,
    frameIdx: 10,
    insideBuilding: false,
    remaining: 170,
    stage: 'outside-hold',
  })
  const regressed = observeZombieEnterRoomStage(
    state,
    sample({
      frameIdx: 10,
      insideBuilding: true,
      nodeCount: 241,
      remaining: 171,
    }),
    {
      cycle: 1,
      expectedInside: true,
      route: ROUTE,
      stage: 'entered',
      target: ROUTE.inside,
    },
  )
  assert.ok(regressed.issues.some((issue) => issue.includes('frame did not advance')))
  assert.ok(regressed.issues.some((issue) => issue.includes('node count changed')))
  assert.ok(regressed.issues.includes('night countdown drifted from 170 to 171'))
})

test('final validity rejects partial cycles and truncated duration', () => {
  const validity = createZombieEnterRoomValidityState()
  validity.nextStageIndex = 2
  validity.performanceCounterDeltas = {
    routingResolveCount: 0,
    spatialBuildCount: 0,
    spatialQueryCount: 0,
  }
  assert.deepEqual(
    collectZombieEnterRoomFinalIssues({
      elapsedMs: 3_000,
      requestedDurationMs: ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS,
      validity,
    }),
    [
      'no complete room-entry cycle was observed',
      'cycle 1 stopped before inside-hold',
      'measured 3000ms/180000ms',
      'no spatial-index build occurred during measurement',
      'no spatial query occurred during measurement',
      'no shared target-route request occurred during measurement',
      'no shared target-route publication occurred during measurement',
    ],
  )
})
