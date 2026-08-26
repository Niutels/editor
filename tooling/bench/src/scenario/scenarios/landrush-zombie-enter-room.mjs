import {
  benchmarkParams,
  findTraversableLandrushExteriorEntryRoute,
  landrushEntryTraversalMotionIssues,
  placeLandrushPlayerAt,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForSceneNodes,
  waitForStableFloorState,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export const ZOMBIE_ENTER_ROOM_TIMING = Object.freeze({
  arrivalToleranceMeters: 1.25,
  holdMs: 1_000,
  motionInputReleaseToleranceMeters: 0.35,
  motionPollMs: 100,
  motionStartToleranceMeters: 0.6,
  pollMs: 400,
  premeasurementQuiescenceTimeoutMs: 90_000,
  readinessPollMs: 500,
  requiredConsecutiveQuiescenceSamples: 12,
  requiredConsecutiveSamples: 2,
  requiredConsecutiveRosterSamples: 4,
  steadyHoldMs: 30_000,
  steadyPollMs: 1_000,
  transitionTimeoutMs: 12_000,
})

const ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT = Object.freeze({
  compact: Object.freeze({
    candidateVisits: 256,
    graphEdgeVisits: 512,
    heapOperations: 512,
    maximumNodeCount: 256,
  }),
  full: Object.freeze({
    candidateVisits: 1_024,
    graphEdgeVisits: 1_024,
    heapOperations: 3_072,
  }),
})

export const ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT = 100
export const ZOMBIE_ENTER_ROOM_MAXIMUM_AUTHORED_BATCH_COUNT = 10
export const ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS = 3 * 60_000
export const ZOMBIE_ENTER_ROOM_MAXIMUM_CADENCE_P95_MS = 17.42
export const ZOMBIE_ENTER_ROOM_SUPPORTED_DETAILED_ZOMBIE_COUNTS = Object.freeze([0, 16])

export function createZombieEnterRoomMeasurementContract(detailedZombieCount = 16) {
  const resolvedDetailedZombieCount = Number(detailedZombieCount)
  if (!ZOMBIE_ENTER_ROOM_SUPPORTED_DETAILED_ZOMBIE_COUNTS.includes(resolvedDetailedZombieCount)) {
    throw new Error(
      `zombie room benchmark detailed presentation count must be 0 or 16; received ` +
        String(detailedZombieCount),
    )
  }
  return Object.freeze({
    cadence: Object.freeze({ maximumP95Ms: ZOMBIE_ENTER_ROOM_MAXIMUM_CADENCE_P95_MS }),
    presentation: Object.freeze({
      activeZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
      authoredInstancedActiveCount:
        ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - resolvedDetailedZombieCount,
      authoredInstancedBatchCount: Object.freeze({
        maximum: ZOMBIE_ENTER_ROOM_MAXIMUM_AUTHORED_BATCH_COUNT,
        minimum: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT > resolvedDetailedZombieCount ? 1 : 0,
      }),
      detailedActiveCount: resolvedDetailedZombieCount,
      detailedCapacity: resolvedDetailedZombieCount,
      fallbackCount: 0,
      instancedActiveCount:
        ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT - resolvedDetailedZombieCount,
      unpresentedActiveCount: 0,
    }),
  })
}

export const ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT = Object.freeze({
  maximumAttachmentFullSearchesPerResolvedIntent: 2,
  refreshCandidateInspectionBudgetPerTick: 64,
  resolveBudgetPerTick: 16,
  sparseAttachmentAgentLeaseCapacity: 8,
  sparseAttachmentTotalLeaseCapacity: 10,
  sparseSearchAgentSlicesPerTick: 8,
  sparseSearchMinimumWorkUnitsPerAgentSlice: 1,
  sparseSearchMaximumCandidateVisitsPerAgentSlice: 32,
  sparseSearchMaximumCandidateVisitsPerTick: 256,
  sparseSearchMaximumCollisionPredicatesPerAgentSlice: 8,
  sparseSearchMaximumCollisionPredicatesPerTick: 64,
  sparseSearchMaximumGraphEdgeVisitsPerTick: 512,
  sparseSearchMaximumHeapOperationsPerAgentSlice: 32,
  sparseSearchMaximumHeapOperationsPerTick: 256,
  sparseSearchMaximumHierarchyNodeVisitsPerAgentSlice: 32,
  sparseSearchMaximumHierarchyNodeVisitsPerTick: 256,
  sparseSearchMaximumNoProgressAgeTicks: 1,
  sparseSearchMaximumSupportPredicatesPerAgentSlice: 16,
  sparseSearchMaximumSupportPredicatesPerTick: 128,
  sparseSearchSpawnSlicesPerTick: 1,
  sparseSearchMaximumTargetBuildsPerTick: 2,
  sparseSearchTargetSlicesPerTick: 1,
  spatialCandidateInspectionsPerQuery: 48,
})

export const ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_TELEMETRY_KEYS = Object.freeze([
  'navigationSparseAttachmentActiveAgentLeaseCount',
  'navigationSparseAttachmentAvailableAgentLeaseCount',
  'navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved',
  'navigationSparseAttachmentFieldSingletonLeaseReserved',
  'navigationSparseAttachmentSpawnLeaseReserved',
  'navigationSparseAttachmentLeaseInvariantViolationCount',
])

const ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_NUMERIC_KEYS = Object.freeze([
  'navigationSparseAttachmentActiveAgentLeaseCount',
  'navigationSparseAttachmentAvailableAgentLeaseCount',
  'navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved',
  'navigationSparseAttachmentLeaseInvariantViolationCount',
])

const ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_RESERVATION_KEYS = Object.freeze([
  'navigationSparseAttachmentFieldSingletonLeaseReserved',
  'navigationSparseAttachmentSpawnLeaseReserved',
])

const ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY =
  'navigationSparseAttachmentMaximumHierarchyNodeCount'

export const ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS = Object.freeze([
  Object.freeze({
    label: 'hierarchy node visits',
    metricSuffix: 'HierarchyNodeVisits',
    maximumObservedKey:
      'navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick',
    maximumPerAgentSliceKey:
      'navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice',
    maximumPerAgentSlice:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHierarchyNodeVisitsPerAgentSlice,
    maximumPerTickKey: 'navigationSparseSearchMaximumHierarchyNodeVisitsPerTick',
    maximumPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHierarchyNodeVisitsPerTick,
    thisTickKey: 'navigationSparseSearchHierarchyNodeVisitsThisTick',
    totalKey: 'navigationSparseSearchHierarchyNodeVisitsTotal',
  }),
  Object.freeze({
    excludesTargetWork: true,
    label: 'candidate visits',
    metricSuffix: 'CandidateVisits',
    maximumObservedKey: 'navigationSparseSearchCandidateVisitsMaximumObservedPerTick',
    maximumPerAgentSliceKey: 'navigationSparseSearchMaximumCandidateVisitsPerAgentSlice',
    maximumPerAgentSlice:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCandidateVisitsPerAgentSlice,
    maximumPerTickKey: 'navigationSparseSearchMaximumCandidateVisitsPerTick',
    maximumPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCandidateVisitsPerTick,
    thisTickKey: 'navigationSparseSearchCandidateVisitsThisTick',
    totalKey: 'navigationSparseSearchCandidateVisitsTotal',
  }),
  Object.freeze({
    label: 'support predicates',
    metricSuffix: 'SupportPredicates',
    maximumObservedKey: 'navigationSparseSearchSupportPredicatesMaximumObservedPerTick',
    maximumPerAgentSliceKey:
      'navigationSparseSearchMaximumSupportPredicatesPerAgentSlice',
    maximumPerAgentSlice:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumSupportPredicatesPerAgentSlice,
    maximumPerTickKey: 'navigationSparseSearchMaximumSupportPredicatesPerTick',
    maximumPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumSupportPredicatesPerTick,
    thisTickKey: 'navigationSparseSearchSupportPredicatesThisTick',
    totalKey: 'navigationSparseSearchSupportPredicatesTotal',
  }),
  Object.freeze({
    label: 'collision predicates',
    metricSuffix: 'CollisionPredicates',
    maximumObservedKey:
      'navigationSparseSearchCollisionPredicatesMaximumObservedPerTick',
    maximumPerAgentSliceKey:
      'navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice',
    maximumPerAgentSlice:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCollisionPredicatesPerAgentSlice,
    maximumPerTickKey: 'navigationSparseSearchMaximumCollisionPredicatesPerTick',
    maximumPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumCollisionPredicatesPerTick,
    thisTickKey: 'navigationSparseSearchCollisionPredicatesThisTick',
    totalKey: 'navigationSparseSearchCollisionPredicatesTotal',
  }),
  Object.freeze({
    excludesTargetWork: true,
    label: 'heap operations',
    metricSuffix: 'HeapOperations',
    maximumObservedKey: 'navigationSparseSearchHeapOperationsMaximumObservedPerTick',
    maximumPerAgentSliceKey:
      'navigationSparseSearchMaximumHeapOperationsPerAgentSlice',
    maximumPerAgentSlice:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerAgentSlice,
    maximumPerTickKey: 'navigationSparseSearchMaximumHeapOperationsPerTick',
    maximumPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerTick,
    thisTickKey: 'navigationSparseSearchHeapOperationsThisTick',
    totalKey: 'navigationSparseSearchHeapOperationsTotal',
  }),
])

const ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS = Object.freeze([
  Object.freeze({
    label: 'graph edge visits',
    maximumObservedKey: 'navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick',
    maximumPerTick:
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumGraphEdgeVisitsPerTick,
    maximumPerTickKey: 'navigationSparseSearchMaximumGraphEdgeVisitsPerTick',
    metricSuffix: 'GraphEdgeVisits',
    targetCapKind: 'graphEdgeVisits',
    thisTickKey: 'navigationSparseSearchGraphEdgeVisitsThisTick',
    totalKey: 'navigationSparseSearchGraphEdgeVisitsTotal',
  }),
])

function createZombieEnterRoomVisibilityWorkDimension(label, metricSuffix, parentMetricSuffix) {
  return Object.freeze({
    label,
    maximumObservedKey: `navigationVisibility${metricSuffix}MaximumObservedPerTick`,
    parentMaximumObservedKey:
      `navigationSparseSearch${parentMetricSuffix}MaximumObservedPerTick`,
    parentThisTickKey: `navigationSparseSearch${parentMetricSuffix}ThisTick`,
    parentTotalKey: `navigationSparseSearch${parentMetricSuffix}Total`,
    thisTickKey: `navigationVisibility${metricSuffix}ThisTick`,
    totalKey: `navigationVisibility${metricSuffix}Total`,
  })
}

export const ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS = Object.freeze([
  createZombieEnterRoomVisibilityWorkDimension(
    'support hierarchy node visits',
    'SupportHierarchyNodeVisits',
    'HierarchyNodeVisits',
  ),
  createZombieEnterRoomVisibilityWorkDimension(
    'support item visits',
    'SupportItemVisits',
    'CandidateVisits',
  ),
  createZombieEnterRoomVisibilityWorkDimension(
    'support hole visits',
    'SupportHoleVisits',
    'SupportPredicates',
  ),
  createZombieEnterRoomVisibilityWorkDimension(
    'support ring hierarchy node visits',
    'SupportRingHierarchyNodeVisits',
    'HierarchyNodeVisits',
  ),
  createZombieEnterRoomVisibilityWorkDimension(
    'support ring edge visits',
    'SupportRingEdgeVisits',
    'SupportPredicates',
  ),
  createZombieEnterRoomVisibilityWorkDimension(
    'collider hierarchy node visits',
    'ColliderHierarchyNodeVisits',
    'HierarchyNodeVisits',
  ),
  createZombieEnterRoomVisibilityWorkDimension(
    'collider candidate visits',
    'ColliderCandidateVisits',
    'CandidateVisits',
  ),
])

export const ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_CONSERVATION_GROUPS = Object.freeze(
  [
    ['hierarchy node visits', 'HierarchyNodeVisits'],
    ['candidate visits', 'CandidateVisits'],
    ['support predicates', 'SupportPredicates'],
  ].map(([label, parentMetricSuffix]) =>
    Object.freeze({
      aggregateThisTickKey: `navigationSparseSearch${parentMetricSuffix}ThisTick`,
      aggregateTotalKey: `navigationSparseSearch${parentMetricSuffix}Total`,
      detailDimensions: ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.filter(
        (dimension) =>
          dimension.parentThisTickKey ===
          `navigationSparseSearch${parentMetricSuffix}ThisTick`,
      ),
      label,
    }),
  ),
)

function createZombieEnterRoomObstacleDeltaWorkDimension(label, metricSuffix) {
  return Object.freeze({
    label,
    maximumObservedKey: `obstacleDelta${metricSuffix}MaximumObservedPerTick`,
    thisTickKey: `obstacleDelta${metricSuffix}ThisTick`,
    totalKey: `obstacleDelta${metricSuffix}Total`,
  })
}

export const ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS = Object.freeze([
  createZombieEnterRoomObstacleDeltaWorkDimension(
    'object lookup comparisons',
    'ObjectLookupComparisons',
  ),
  createZombieEnterRoomObstacleDeltaWorkDimension('object mask writes', 'ObjectMaskWrites'),
  createZombieEnterRoomObstacleDeltaWorkDimension(
    'connector mask writes',
    'ConnectorMaskWrites',
  ),
  createZombieEnterRoomObstacleDeltaWorkDimension('world compiles', 'WorldCompileCount'),
  createZombieEnterRoomObstacleDeltaWorkDimension(
    'full array clears',
    'FullArrayClearCount',
  ),
  createZombieEnterRoomObstacleDeltaWorkDimension('allocations', 'AllocationCount'),
])

export const ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_COUNTER_KEYS = Object.freeze([
  'obstacleDeltaRequestCount',
  'obstacleDeltaAppliedCount',
  'obstacleDeltaUnchangedCount',
  'obstacleDeltaRequiresRecompileCount',
  'obstacleDeltaRevisionAdvanceCount',
  'obstacleDeltaViewRevisionAdvanceCount',
])

export const ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_REVISION_KEYS = Object.freeze([
  'obstacleDeltaRequestedRevision',
  'obstacleDeltaAppliedRevision',
])

export const ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS = Object.freeze([
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_COUNTER_KEYS,
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_REVISION_KEYS,
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS.flatMap((dimension) => [
    dimension.maximumObservedKey,
    dimension.thisTickKey,
    dimension.totalKey,
  ]),
])

export const ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS = Object.freeze([
  'navigationObstacleRefreshDeferredMarkedCount',
  'navigationObstacleRefreshDeferredPromotedCount',
  'navigationObstacleRefreshDeferredCanceledCount',
  'navigationObstacleRefreshDeferredPendingCount',
  'navigationObstacleRefreshDeferredPromotedCountThisTick',
  'navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick',
  'navigationObstacleRefreshDeferredPromotionBudgetPerTick',
  'navigationObstacleRefreshDiscoveryAppliedRevision',
  'navigationObstacleRefreshDiscoveryEpochRevision',
  'navigationObstacleRefreshDiscoveryRemainingSlotCount',
])

export const ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS = Object.freeze([
  'navigationTargetRequestedRevision',
  'navigationTargetCommittedRouteGeneration',
  'navigationSparseSearchRestartedRoutePublishedCount',
])

export const ZOMBIE_ENTER_ROOM_WORLD_REFRESH_TELEMETRY_KEYS = Object.freeze([
  'navigationWorldRefreshAdmissionGeneration',
  'navigationWorldRefreshEpochGeneration',
  'navigationWorldRefreshInspectionRemaining',
  'navigationWorldRefreshMaximumPromotedCountObservedPerTick',
  'navigationWorldRefreshMinimumAppliedGeneration',
  'navigationWorldRefreshPendingCount',
  'navigationWorldRefreshPromotedCountThisTick',
  'navigationWorldRefreshPromotedCountTotal',
  'navigationWorldRefreshRestartedCountThisTick',
  'navigationWorldRefreshRestartedCountTotal',
])

export const ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS = Object.freeze([
  'navigationRefreshSlotCapacity',
  'navigationRefreshAdmissionCountThisTick',
  'navigationRefreshAdmissionCountTotal',
  'navigationRefreshAdmissionMaximumCountObservedPerTick',
  'navigationRefreshAdmissionBudgetPerTick',
  'navigationRefreshCandidateInspectionsThisTick',
  'navigationRefreshCandidateInspectionsTotal',
  'navigationRefreshCandidateInspectionsMaximumObservedPerTick',
  'navigationRefreshCandidateInspectionBudgetPerTick',
])

export const ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_PROMOTION_KEYS = Object.freeze([
  'navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount',
  'navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount',
  'navigationIntentAdmissionDeferredPromotedConnectorChangedCount',
  'navigationIntentAdmissionDeferredPromotedSpawnCount',
  'navigationIntentAdmissionDeferredPromotedWorldChangedCount',
])

const ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_CAUSAL_PAIRS = Object.freeze([
  ['navigationIntentDemandCachedAnchorLostCount', 'navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount'],
  ['navigationIntentDemandCollisionRecoveryCount', 'navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount'],
  ['navigationIntentDemandConnectorChangedCount', 'navigationIntentAdmissionDeferredPromotedConnectorChangedCount'],
  ['navigationIntentDemandSpawnCount', 'navigationIntentAdmissionDeferredPromotedSpawnCount'],
  ['navigationIntentDemandWorldChangedCount', 'navigationIntentAdmissionDeferredPromotedWorldChangedCount'],
])

export const ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_TELEMETRY_KEYS = Object.freeze([
  'navigationIntentAdmissionDeferredMarkedCount',
  'navigationIntentAdmissionDeferredPromotedCount',
  'navigationIntentAdmissionDeferredCanceledCount',
  'navigationIntentAdmissionDeferredPendingCount',
  'navigationIntentAdmissionDeferredPromotedCountThisTick',
  'navigationIntentAdmissionDeferredPromotionBudgetPerTick',
  'navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick',
  'navigationIntentAdmissionDeferredQueueOperationCountThisTick',
  'navigationIntentAdmissionDeferredQueueOperationCountTotal',
  'navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick',
  ...ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_PROMOTION_KEYS,
])

const ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_MONOTONIC_KEYS = Object.freeze([
  'navigationIntentAdmissionDeferredMarkedCount',
  'navigationIntentAdmissionDeferredPromotedCount',
  'navigationIntentAdmissionDeferredCanceledCount',
  'navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick',
  'navigationIntentAdmissionDeferredQueueOperationCountTotal',
  'navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick',
  ...ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_PROMOTION_KEYS,
])

const ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_MONOTONIC_KEYS = Object.freeze([
  'navigationObstacleRefreshDeferredMarkedCount',
  'navigationObstacleRefreshDeferredPromotedCount',
  'navigationObstacleRefreshDeferredCanceledCount',
  'navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick',
  'navigationObstacleRefreshDiscoveryAppliedRevision',
  'navigationObstacleRefreshDiscoveryEpochRevision',
])

const ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_MONOTONIC_KEYS = Object.freeze([
  'navigationRefreshAdmissionCountTotal',
  'navigationRefreshAdmissionMaximumCountObservedPerTick',
  'navigationRefreshCandidateInspectionsTotal',
  'navigationRefreshCandidateInspectionsMaximumObservedPerTick',
])

const ZOMBIE_ENTER_ROOM_WORLD_REFRESH_MONOTONIC_KEYS = Object.freeze([
  'navigationWorldRefreshAdmissionGeneration',
  'navigationWorldRefreshEpochGeneration',
  'navigationWorldRefreshMaximumPromotedCountObservedPerTick',
  'navigationWorldRefreshMinimumAppliedGeneration',
  'navigationWorldRefreshPromotedCountTotal',
  'navigationWorldRefreshRestartedCountTotal',
])

const ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_AGENT_CAUSAL_KEYS = Object.freeze([
  'navigationIntentDemandCachedAnchorLostCount',
  'navigationIntentDemandWorldChangedCount',
  'navigationIntentIssuedCount',
  'navigationSparseSearchAgentServiceSliceCountTotal',
  'navigationSparseSearchInvalidatedCount',
  'navigationSparseSearchRestartedCollisionRecoveryCount',
  'navigationSparseSearchRestartedCount',
  'navigationSparseSearchRestartedRoutePublishedCount',
  'navigationSparseSearchRestartedWorldChangedCount',
  'navigationSparseSearchStartedCount',
  'simulationTick',
])

const ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_MONOTONIC_KEYS = Object.freeze([
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_COUNTER_KEYS,
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_REVISION_KEYS,
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS.flatMap((dimension) => [
    dimension.maximumObservedKey,
    dimension.totalKey,
  ]),
])

const ZOMBIE_ENTER_ROOM_METERED_WORK_SOURCES = Object.freeze([
  Object.freeze({ label: 'cached-follow', prefix: 'navigationSparseCachedFollow' }),
  Object.freeze({ label: 'flow-search', prefix: 'navigationSparseFlowSearch' }),
  Object.freeze({ label: 'spawn-search', prefix: 'navigationSparseSpawnSearch' }),
  Object.freeze({
    includeTargetOnlyWork: true,
    label: 'target-update',
    prefix: 'navigationSparseTargetUpdate',
  }),
])

function createZombieEnterRoomAttributedWorkDimension(source, dimension) {
  const targetCapKind =
    source.includeTargetOnlyWork &&
    ['CandidateVisits', 'GraphEdgeVisits', 'HeapOperations'].includes(
      dimension.metricSuffix,
    )
      ? {
          CandidateVisits: 'candidateVisits',
          GraphEdgeVisits: 'graphEdgeVisits',
          HeapOperations: 'heapOperations',
        }[dimension.metricSuffix]
      : null
  return Object.freeze({
    label: `${source.label} ${dimension.label}`,
    maximumObservedKey: `${source.prefix}${dimension.metricSuffix}MaximumObservedPerTick`,
    maximumPerTick: dimension.maximumPerTick,
    maximumPerTickKey: dimension.maximumPerTickKey,
    targetCapKind,
    thisTickKey: `${source.prefix}${dimension.metricSuffix}ThisTick`,
    totalKey: `${source.prefix}${dimension.metricSuffix}Total`,
  })
}

const ZOMBIE_ENTER_ROOM_ATTRIBUTED_WORK_DIMENSIONS = Object.freeze(
  ZOMBIE_ENTER_ROOM_METERED_WORK_SOURCES.flatMap((source) =>
    [
      ...ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS,
      ...(source.includeTargetOnlyWork ? ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS : []),
    ].map((dimension) => createZombieEnterRoomAttributedWorkDimension(source, dimension)),
  ),
)

export const ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS = Object.freeze([
  ...ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS,
  ...ZOMBIE_ENTER_ROOM_ATTRIBUTED_WORK_DIMENSIONS,
])

export const ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS = Object.freeze([
  ...ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS,
  ...ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS,
].map((dimension) =>
  Object.freeze({
    aggregateMaximumObservedKey: dimension.maximumObservedKey,
    aggregateThisTickKey: dimension.thisTickKey,
    aggregateTotalKey: dimension.totalKey,
    label: dimension.label,
    sourceMaximumObservedKeys: ZOMBIE_ENTER_ROOM_METERED_WORK_SOURCES.filter(
      (source) =>
        !ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS.includes(dimension) ||
        source.includeTargetOnlyWork,
    ).map((source) => `${source.prefix}${dimension.metricSuffix}MaximumObservedPerTick`),
    sourceThisTickKeys: ZOMBIE_ENTER_ROOM_METERED_WORK_SOURCES.filter(
      (source) =>
        !ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS.includes(dimension) ||
        source.includeTargetOnlyWork,
    ).map((source) => `${source.prefix}${dimension.metricSuffix}ThisTick`),
    sourceTotalKeys: ZOMBIE_ENTER_ROOM_METERED_WORK_SOURCES.filter(
      (source) =>
        !ZOMBIE_ENTER_ROOM_TARGET_ONLY_WORK_DIMENSIONS.includes(dimension) ||
        source.includeTargetOnlyWork,
    ).map((source) => `${source.prefix}${dimension.metricSuffix}Total`),
  }),
))

export const ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS = Object.freeze([
  'navigationIntentDemandSpawnCount',
  'navigationIntentDemandWorldChangedCount',
  'navigationIntentDemandConnectorChangedCount',
  'navigationIntentDemandCachedAnchorLostCount',
  'navigationIntentDemandCollisionRecoveryCount',
  'navigationIntentDemandRoutePublishedCount',
])

export const ZOMBIE_ENTER_ROOM_LIVENESS_TELEMETRY_KEYS = Object.freeze([
  'navigationLivingWithoutCommittedActionCount',
  'navigationRetainedPendingActionCount',
  'navigationStaleTargetCount',
])

export const ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_TELEMETRY_KEYS = Object.freeze([
  'navigationGraphNodeCount',
  'navigationSparseSearchCompactTargetMaximumNodeCount',
  'navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick',
  'navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick',
  'navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick',
  'navigationSparseSearchMaximumTargetCandidateVisitsPerTick',
  'navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick',
  'navigationSparseSearchMaximumTargetHeapOperationsPerTick',
])

export const ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS = Object.freeze({
  agentEligiblePendingCountAtScheduleThisTickKey:
    'navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick',
  agentMaximumPendingNoProgressAgeTicksKey:
    'navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved',
  agentOldestPendingNoProgressAgeTicksKey:
    'navigationSparseSearchAgentOldestPendingNoProgressAgeTicks',
  agentProgressSliceCountThisTickKey:
    'navigationSparseSearchAgentProgressSliceCountThisTick',
  agentProgressSliceCountTotalKey: 'navigationSparseSearchAgentProgressSliceCountTotal',
  agentServiceSliceCountThisTickKey: 'navigationSparseSearchAgentServiceSliceCountThisTick',
  agentServiceSliceCountTotalKey: 'navigationSparseSearchAgentServiceSliceCountTotal',
  completionProgressThisTickKey: 'navigationSparseSearchCompletionProgressThisTick',
  completionProgressTotalKey: 'navigationSparseSearchCompletionProgressTotal',
  firstServiceCountTotalKey: 'navigationIntentFirstServiceCount',
  maximumFirstServiceAgeTicksKey: 'navigationIntentMaximumUnservicedAgeTicksObserved',
  maximumNoProgressAgeTicksKey: 'navigationSparseSearchMaximumNoProgressAgeTicksObserved',
  noProgressAgeTicksKey: 'navigationSparseSearchNoProgressAgeTicks',
  oldestUnservicedAgeTicksKey: 'navigationIntentOldestUnservicedAgeTicks',
  minimumWorkUnitsPerAgentSliceKey:
    'navigationSparseSearchMinimumWorkUnitsPerAgentSlice',
  remainingWorkKey: null,
  serviceSliceCountThisTickKey: 'navigationSparseSearchServiceSliceCountThisTick',
  serviceSliceCountTotalKey: 'navigationSparseSearchServiceSliceCountTotal',
  spawnMaximumNoProgressAgeTicksKey:
    'navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved',
  spawnDependencyWaitingKey: 'navigationSparseSpawnSearchDependencyWaiting',
  spawnCompletedCountTotalKey: 'navigationSparseSpawnSearchCompletedCount',
  spawnInvalidatedCountTotalKey: 'navigationSparseSpawnSearchInvalidatedCount',
  spawnNoProgressAgeTicksKey: 'navigationSparseSearchSpawnNoProgressAgeTicks',
  spawnPendingCountKey: 'navigationSparseSpawnSearchPendingCount',
  spawnProgressSliceCountThisTickKey:
    'navigationSparseSearchSpawnProgressSliceCountThisTick',
  spawnProgressSliceCountTotalKey: 'navigationSparseSearchSpawnProgressSliceCountTotal',
  spawnServiceSliceCountThisTickKey: 'navigationSparseSearchSpawnServiceSliceCountThisTick',
  spawnServiceSliceCountTotalKey: 'navigationSparseSearchSpawnServiceSliceCountTotal',
  spawnSlicesPerTickKey: 'navigationSparseSearchSpawnSlicesPerTick',
  spawnStartedCountTotalKey: 'navigationSparseSpawnSearchStartedCount',
  targetMaximumNoProgressAgeTicksKey:
    'navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved',
  targetNoProgressAgeTicksKey: 'navigationSparseSearchTargetNoProgressAgeTicks',
  targetProgressSliceCountThisTickKey:
    'navigationSparseSearchTargetProgressSliceCountThisTick',
  targetProgressSliceCountTotalKey: 'navigationSparseSearchTargetProgressSliceCountTotal',
  targetServiceSliceCountThisTickKey:
    'navigationSparseSearchTargetServiceSliceCountThisTick',
  targetServiceSliceCountTotalKey: 'navigationSparseSearchTargetServiceSliceCountTotal',
  targetSlicesPerTickKey: 'navigationSparseSearchTargetSlicesPerTick',
  targetUpdateStatusKey: 'navigationSparseTargetUpdateStatus',
  unservicedPendingCountKey: 'navigationIntentUnservicedPendingCount',
})

export const ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS = Object.freeze([
  ...new Set(
    [
      ...ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS,
      ...ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS,
    ].flatMap((dimension) => [dimension.maximumObservedKey, dimension.totalKey]),
  ),
])

export const ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS =
  Object.freeze({
    maximumObservedKey:
      'navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick',
    thisTickKey:
      'navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsThisTick',
    totalKey: 'navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal',
  })

export const ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_COUNTER_KEYS = Object.freeze([
  'navigationSparseSearchCanceledCount',
  'navigationSparseSearchInvalidatedCount',
  'navigationSparseSearchRestartedCount',
  'navigationSparseSearchRestartedCollisionRecoveryCount',
  'navigationSparseSearchRestartedRoutePublishedCount',
  'navigationSparseSearchRestartedWorldChangedCount',
  'navigationSparseSearchUncausedStartViolationCount',
])

export const ZOMBIE_ENTER_ROOM_COLLISION_REANCHOR_COUNTER_KEYS = Object.freeze([
  'navigationSparseCollisionReanchorAttemptCount',
  'navigationSparseCollisionReanchorCompletedCount',
  'navigationSparseCollisionReanchorFailedCount',
])

const ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_GAUGE_KEYS = Object.freeze([
  'navigationSparseSearchActiveAgentCount',
  'navigationSparseSearchWorldStaleActiveCount',
])

const ZOMBIE_ENTER_ROOM_EXPECTED_ROUTING_TELEMETRY_KEYS = Object.freeze([
  ...new Set([
    ...ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_TELEMETRY_KEYS,
    ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY,
    ...Object.values(ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS).filter(
      (key) => typeof key === 'string' && key.length > 0,
    ),
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
    ...ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_COUNTER_KEYS,
    ...ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_GAUGE_KEYS,
  ]),
])

export const ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS = Object.freeze({
  entry: 'zombie-enter-room-single-entry',
  obstacleDelta: 'zombie-enter-room-obstacle-delta',
  steadyInside: 'zombie-enter-room-steady-inside',
  steadyOutside: 'zombie-enter-room-steady-outside',
  transitionStress: 'zombie-enter-room-repeated-transition-stress',
})

export const ZOMBIE_ENTER_ROOM_STAGE_SEQUENCE = Object.freeze([
  'outside-hold',
  'entered',
  'inside-hold',
  'exited',
])

export const ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS = Object.freeze([
  'fallbackRoutingRebuildCount',
  'navigationAnchorInvalidationCount',
  ...ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS,
  'navigationIntentCanceledCount',
  'navigationIntentIssuedCount',
  'navigationIntentResolvedCount',
  'navigationIntentResolveBudgetViolationCount',
  'navigationTargetRequestedRevision',
  'navigationTargetCommittedRouteGeneration',
  'navigationWorldRevision',
  'navigationSparseSearchBudgetViolationCount',
  'navigationSparseSearchCandidateVisitsMaximumObservedPerTick',
  'navigationSparseSearchCandidateVisitsTotal',
  'navigationSparseSearchCollisionPredicatesMaximumObservedPerTick',
  'navigationSparseSearchCollisionPredicatesTotal',
  'navigationSparseSearchCompletedCount',
  'navigationSparseSearchHeapOperationsMaximumObservedPerTick',
  'navigationSparseSearchHeapOperationsTotal',
  'navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick',
  'navigationSparseSearchHierarchyNodeVisitsTotal',
  ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS.maximumObservedKey,
  ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS.totalKey,
  'navigationSparseSearchStartedCount',
  'navigationSparseSearchSupportPredicatesMaximumObservedPerTick',
  'navigationSparseSearchSupportPredicatesTotal',
  'navigationSparseSearchTargetBuildsMaximumObservedPerTick',
  'navigationSparseSearchTargetBuildsTotal',
  'navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved',
  'navigationSparseAttachmentLeaseInvariantViolationCount',
  ...ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_MONOTONIC_KEYS,
  ...ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_MONOTONIC_KEYS,
  ...ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_MONOTONIC_KEYS,
  ...ZOMBIE_ENTER_ROOM_WORLD_REFRESH_MONOTONIC_KEYS,
  ...ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_MONOTONIC_KEYS,
  ...ZOMBIE_ENTER_ROOM_NAVIGATION_RESTART_COUNTER_KEYS,
  'navigationIntentFirstServiceCount',
  'navigationIntentMaximumUnservicedAgeTicksObserved',
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.agentMaximumPendingNoProgressAgeTicksKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.agentProgressSliceCountTotalKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.agentServiceSliceCountTotalKey,
  'navigationSparseSearchCompletionProgressTotal',
  'navigationSparseSearchMaximumNoProgressAgeTicksObserved',
  'navigationSparseSearchServiceSliceCountTotal',
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.spawnMaximumNoProgressAgeTicksKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.spawnProgressSliceCountTotalKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.spawnServiceSliceCountTotalKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.targetMaximumNoProgressAgeTicksKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.targetProgressSliceCountTotalKey,
  ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS.targetServiceSliceCountTotalKey,
  'routingGraphAttachmentCandidateCount',
  'routingGraphAttachmentFullSearchCount',
  'routingGraphAttachmentSupportCheckCount',
  'routingMaximumResolveCountObservedPerTick',
  'routingRebuildCount',
  'routingResolveCount',
  'spatialBuildCount',
  'spatialCandidateInspectionCount',
  'spatialMaximumCandidateInspectionsObserved',
  'spatialOverflowQueryCount',
  'spatialPairInspectionCount',
  'spatialQueryCount',
  'spatialSeparationNeighborCount',
])

export const ZOMBIE_ENTER_ROOM_CAUSAL_DELTA_FIELDS = Object.freeze([
  ...ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS,
  'navigationAnchoredAgentCount',
  'navigationIntentPendingCount',
  'navigationSparseSearchActiveAgentCount',
  'navigationSparseSearchPendingAgentCount',
  'simulationTick',
])

export const ZOMBIE_ENTER_ROOM_QUIESCENCE_FIELDS = Object.freeze([
  'collisionWorldGeneration',
  'fallbackRoutingRebuildCount',
  'navigationAnchorInvalidationCount',
  ...ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS,
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
  ...ZOMBIE_ENTER_ROOM_EXPECTED_ROUTING_TELEMETRY_KEYS.filter(
    (key) =>
      key !== 'navigationTargetRequestedRevision' &&
      key !== 'navigationTargetCommittedRouteGeneration',
  ),
])

const ZOMBIE_ENTER_ROOM_STEADY_TOPOLOGY_FIELDS = Object.freeze([
  'collisionWorldGeneration',
  'fallbackRoutingRebuildCount',
  'navigationWorldRevision',
  'routingRebuildCount',
])

let preparePass = 0
let preparedEntryRoute = null
let preparedQuiescencePerformance = null
let preparedMeasurementContract = createZombieEnterRoomMeasurementContract()

function finitePlayerPose(navigation) {
  const robot = navigation?.robot
  if (
    !robot ||
    !Number.isFinite(robot.x) ||
    !Number.isFinite(robot.y) ||
    !Number.isFinite(robot.z)
  ) {
    return null
  }
  return {
    heading: Number.isFinite(navigation.heading) ? navigation.heading : null,
    x: robot.x,
    y: robot.y,
    z: robot.z,
  }
}

function zombieEnterRoomPlanarDistance(first, second) {
  return Math.hypot(first.x - second.x, first.z - second.z)
}

export function maximumZombieEnterRoomSparseSearchFirstServiceAgeTicks(
  activeZombieCount,
  slicesPerTick = ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
) {
  if (!(Number.isFinite(activeZombieCount) && activeZombieCount >= 0)) return Number.NaN
  if (!(Number.isFinite(slicesPerTick) && slicesPerTick > 0)) return Number.NaN
  return Math.ceil(activeZombieCount / slicesPerTick)
}

function resolveZombieEnterRoomTargetWorkCap(performance, kind) {
  const regime =
    performance?.navigationGraphNodeCount <=
    ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.compact.maximumNodeCount
      ? ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.compact
      : ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.full
  return regime[kind] ?? Number.NaN
}

export function zombieEnterRoomTargetWorkBudgetIssues(
  performance,
  context = 'target-update work',
) {
  const issues = []
  const expectedCapTelemetry = {
    navigationSparseSearchCompactTargetMaximumNodeCount:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.compact.maximumNodeCount,
    navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.compact.candidateVisits,
    navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.compact.graphEdgeVisits,
    navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.compact.heapOperations,
    navigationSparseSearchMaximumTargetCandidateVisitsPerTick:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.full.candidateVisits,
    navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.full.graphEdgeVisits,
    navigationSparseSearchMaximumTargetHeapOperationsPerTick:
      ZOMBIE_ENTER_ROOM_TARGET_WORK_CAP_CONTRACT.full.heapOperations,
  }
  if (
    !Number.isInteger(performance?.navigationGraphNodeCount) ||
    performance.navigationGraphNodeCount <= 0
  ) {
    issues.push(
      `${context} navigationGraphNodeCount=${String(performance?.navigationGraphNodeCount)}`,
    )
  }
  for (const [key, expected] of Object.entries(expectedCapTelemetry)) {
    if (performance?.[key] !== expected) {
      issues.push(
        `${context} ${key}=${String(performance?.[key])} expected ${String(expected)}`,
      )
    }
  }
  for (const [kind, label, suffix] of [
    ['candidateVisits', 'candidate visits', 'CandidateVisits'],
    ['graphEdgeVisits', 'graph edge visits', 'GraphEdgeVisits'],
    ['heapOperations', 'heap operations', 'HeapOperations'],
  ]) {
    const cap = resolveZombieEnterRoomTargetWorkCap(performance, kind)
    const thisTick = performance[`navigationSparseTargetUpdate${suffix}ThisTick`]
    const maximum =
      performance[`navigationSparseTargetUpdate${suffix}MaximumObservedPerTick`]
    for (const [period, value] of [
      ['this tick', thisTick],
      ['maximum observed', maximum],
    ]) {
      if (!Number.isFinite(value) || value < 0) {
        issues.push(`${context} ${label} ${period}=${String(value)}`)
      } else if (value > cap) {
        issues.push(
          `${context} ${label} ${period}=${String(value)} exceeds target cap=${String(cap)}`,
        )
      }
    }
  }
  return issues
}

export function zombieEnterRoomLivenessIssues(performance, context = 'navigation liveness') {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_LIVENESS_TELEMETRY_KEYS) {
    if (!Number.isInteger(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (!Number.isInteger(performance?.navigationGoalResolvedTick) || performance.navigationGoalResolvedTick <= 0) {
    issues.push(`${context} navigationGoalResolvedTick=${String(performance?.navigationGoalResolvedTick)}`)
  }
  if (issues.length > 0) return issues
  if (performance.navigationLivingWithoutCommittedActionCount !== 0) {
    issues.push(
      `${context} living without committed action=${String(
        performance.navigationLivingWithoutCommittedActionCount,
      )}`,
    )
  }
  if (performance.navigationStaleTargetCount !== 0) {
    issues.push(`${context} stale targets=${String(performance.navigationStaleTargetCount)}`)
  }
  if (
    Number.isFinite(performance.spatialIndexedAgentCount) &&
    performance.navigationRetainedPendingActionCount > performance.spatialIndexedAgentCount
  ) {
    issues.push(
      `${context} retained pending actions=${String(
        performance.navigationRetainedPendingActionCount,
      )} exceed indexed agents=${String(performance.spatialIndexedAgentCount)}`,
    )
  }
  return issues
}

export function zombieEnterRoomAttachmentLeaseIssues(
  performance,
  context = 'sparse attachment leases',
) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_NUMERIC_KEYS) {
    if (!Number.isInteger(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  for (const key of ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_RESERVATION_KEYS) {
    if (performance?.[key] !== true) {
      issues.push(`${context} ${key}=${String(performance?.[key])} expected true`)
    }
  }
  if (issues.length > 0) return issues

  const active = performance.navigationSparseAttachmentActiveAgentLeaseCount
  const available = performance.navigationSparseAttachmentAvailableAgentLeaseCount
  const maximumObserved =
    performance.navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved
  if (
    active + available !==
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity
  ) {
    issues.push(
      `${context} active+available agent leases=${String(active + available)} expected ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity,
    )
  }
  if (maximumObserved < active) {
    issues.push(
      `${context} maximum active agent leases=${String(maximumObserved)} is below active=${String(
        active,
      )}`,
    )
  }
  if (
    maximumObserved >
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity
  ) {
    issues.push(
      `${context} maximum active agent leases=${String(maximumObserved)} exceeds ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseAttachmentAgentLeaseCapacity,
    )
  }
  if (performance.navigationSparseAttachmentLeaseInvariantViolationCount !== 0) {
    issues.push(
      `${context} invariant violations=${String(
        performance.navigationSparseAttachmentLeaseInvariantViolationCount,
      )}`,
    )
  }
  return issues
}

function zombieEnterRoomSparseSpawnWorkBoundIssues(
  performance,
  context = 'sparse spawn search work',
) {
  const issues = []
  const maximumHierarchyNodeCount =
    performance?.[ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY]
  const startedCount = performance?.navigationSparseSpawnSearchStartedCount
  const attachmentHierarchyNodeVisits =
    performance?.[
      ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS.totalKey
    ]
  const heapOperations = performance?.navigationSparseSpawnSearchHeapOperationsTotal
  for (const [label, value] of [
    ['maximum attachment hierarchy nodes', maximumHierarchyNodeCount],
    ['spawn searches started', startedCount],
    ['spawn attachment hierarchy node visits', attachmentHierarchyNodeVisits],
    ['spawn heap operations', heapOperations],
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      issues.push(`${context} ${label}=${String(value)}`)
    }
  }
  if (issues.length > 0) return issues

  const maximumHierarchyNodeVisits = startedCount * 2 * maximumHierarchyNodeCount
  const maximumHeapOperations =
    maximumHierarchyNodeVisits *
    (3 + 5 * Math.ceil(Math.log2(Math.max(1, maximumHierarchyNodeCount))))
  if (attachmentHierarchyNodeVisits > maximumHierarchyNodeVisits) {
    issues.push(
      `${context} spawn attachment hierarchy node visits=${String(
        attachmentHierarchyNodeVisits,
      )} exceed ` +
        `${String(startedCount)} starts * 2H=${String(maximumHierarchyNodeVisits)}`,
    )
  }
  if (heapOperations > maximumHeapOperations) {
    issues.push(
      `${context} spawn heap operations=${String(heapOperations)} exceed topology bound=` +
        String(maximumHeapOperations),
    )
  }
  return issues
}

function zombieEnterRoomSparseSearchHeapIssues(
  performance,
  progressKeys = ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS,
  context = 'sparse-search heap work',
) {
  const issues = []
  const maximumPerAgentSlice =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerAgentSlice
  const maximumPerTick =
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerTick
  const maximumTargetWork =
    resolveZombieEnterRoomTargetWorkCap(performance, 'heapOperations') -
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick *
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMinimumWorkUnitsPerAgentSlice
  const keys = {
    aggregateMaximum: 'navigationSparseSearchHeapOperationsMaximumObservedPerTick',
    aggregateThisTick: 'navigationSparseSearchHeapOperationsThisTick',
    aggregateTotal: 'navigationSparseSearchHeapOperationsTotal',
    cachedMaximum:
      'navigationSparseCachedFollowHeapOperationsMaximumObservedPerTick',
    cachedThisTick: 'navigationSparseCachedFollowHeapOperationsThisTick',
    cachedTotal: 'navigationSparseCachedFollowHeapOperationsTotal',
    flowMaximum: 'navigationSparseFlowSearchHeapOperationsMaximumObservedPerTick',
    flowThisTick: 'navigationSparseFlowSearchHeapOperationsThisTick',
    flowTotal: 'navigationSparseFlowSearchHeapOperationsTotal',
    spawnMaximum: 'navigationSparseSpawnSearchHeapOperationsMaximumObservedPerTick',
    spawnThisTick: 'navigationSparseSpawnSearchHeapOperationsThisTick',
    spawnTotal: 'navigationSparseSpawnSearchHeapOperationsTotal',
    targetMaximum:
      'navigationSparseTargetUpdateHeapOperationsMaximumObservedPerTick',
    targetThisTick: 'navigationSparseTargetUpdateHeapOperationsThisTick',
    targetTotal: 'navigationSparseTargetUpdateHeapOperationsTotal',
  }
  const serviceKeys = [
    progressKeys.agentServiceSliceCountThisTickKey,
    progressKeys.spawnServiceSliceCountThisTickKey,
    progressKeys.targetServiceSliceCountThisTickKey,
    progressKeys.spawnPendingCountKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  for (const key of [...Object.values(keys), ...serviceKeys]) {
    if (!Number.isInteger(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (issues.length > 0) return issues

  const agentService = progressKeys.agentServiceSliceCountThisTickKey
    ? performance[progressKeys.agentServiceSliceCountThisTickKey]
    : 0
  const spawnService = progressKeys.spawnServiceSliceCountThisTickKey
    ? performance[progressKeys.spawnServiceSliceCountThisTickKey]
    : 0
  const targetService = progressKeys.targetServiceSliceCountThisTickKey
    ? performance[progressKeys.targetServiceSliceCountThisTickKey]
    : 0
  const spawnPending = progressKeys.spawnPendingCountKey
    ? performance[progressKeys.spawnPendingCountKey]
    : 0
  const agentWork = performance[keys.cachedThisTick] + performance[keys.flowThisTick]
  if (agentWork > agentService * maximumPerAgentSlice) {
    issues.push(
      `${context} agent heap operations this tick=${String(agentWork)} exceed ` +
        `${String(agentService)} service slices * ${String(maximumPerAgentSlice)}`,
    )
  }
  if (performance[keys.spawnThisTick] > spawnService * maximumPerAgentSlice) {
    issues.push(
      `${context} spawn heap operations this tick=${String(
        performance[keys.spawnThisTick],
      )} exceed ${String(spawnService)} service slices * ${String(maximumPerAgentSlice)}`,
    )
  }
  if (performance[keys.targetThisTick] > 0 && targetService === 0) {
    issues.push(`${context} target heap work was recorded without a target service slice`)
  }
  if (performance[keys.spawnMaximum] > maximumPerAgentSlice) {
    issues.push(
      `${context} maximum spawn heap operations/tick=${String(
        performance[keys.spawnMaximum],
      )} exceeds ${String(maximumPerAgentSlice)}`,
    )
  }
  if (performance[keys.targetMaximum] > maximumTargetWork) {
    issues.push(
      `${context} maximum target heap operations/tick=${String(
        performance[keys.targetMaximum],
      )} exceeds eight-agent reservation bound=${String(maximumTargetWork)}`,
    )
  }
  const activeSpawnWork = spawnPending === 1 || spawnService > 0
  const targetThisTickLimit =
    maximumTargetWork -
    (activeSpawnWork
      ? ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMinimumWorkUnitsPerAgentSlice
      : 0)
  if (performance[keys.targetThisTick] > targetThisTickLimit) {
    issues.push(
      `${context} target heap operations this tick=${String(
        performance[keys.targetThisTick],
      )} exceed reserved-work bound=${String(targetThisTickLimit)}`,
    )
  }
  return issues
}

export function zombieEnterRoomNavigationLegProgressIssues(observations, { start, target }) {
  const issues = []
  if (!Array.isArray(observations) || observations.length < 2) {
    return ['navigation leg did not capture at least two frame samples']
  }
  const initialPose = observations[0]?.playerPose
  const finalPose = observations.at(-1)?.playerPose
  if (!(initialPose && finalPose)) return ['navigation leg did not capture finite player poses']
  issues.push(
    ...landrushEntryTraversalMotionIssues(observations, {
      arrivalToleranceMeters: ZOMBIE_ENTER_ROOM_TIMING.arrivalToleranceMeters,
      start,
      startToleranceMeters: ZOMBIE_ENTER_ROOM_TIMING.motionStartToleranceMeters,
      target,
    }),
  )

  const initialDistance = zombieEnterRoomPlanarDistance(initialPose, target)
  let minimumDistance = initialDistance
  let frameAdvanceCount = 0
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1]
    const current = observations[index]
    if (current?.bridgeFrameIdx > previous?.bridgeFrameIdx) frameAdvanceCount += 1
    if (current?.playerPose) {
      minimumDistance = Math.min(
        minimumDistance,
        zombieEnterRoomPlanarDistance(current.playerPose, target),
      )
    }
  }
  if (frameAdvanceCount === 0) issues.push('navigation leg captured no advancing frames')
  if (
    zombieEnterRoomPlanarDistance(initialPose, start) >
    ZOMBIE_ENTER_ROOM_TIMING.motionStartToleranceMeters
  ) {
    issues.push('navigation leg did not begin at its declared doorway endpoint')
  }
  const requiredProgressMeters = Math.min(0.25, Math.max(0.05, initialDistance * 0.1))
  if (initialDistance - minimumDistance < requiredProgressMeters) {
    issues.push(
      `navigation leg made ${(initialDistance - minimumDistance).toFixed(3)}m forward progress; ` +
        `required ${requiredProgressMeters.toFixed(3)}m`,
    )
  }
  const finalDistance = zombieEnterRoomPlanarDistance(finalPose, target)
  if (finalDistance > ZOMBIE_ENTER_ROOM_TIMING.arrivalToleranceMeters) {
    issues.push(`navigation leg ended ${finalDistance.toFixed(3)}m from its target`)
  }
  return issues
}

export function zombieEnterRoomSparseSearchProgressIssues(
  baseline,
  current,
  {
    activeZombieCount = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    context = 'sparse-search progress',
    expectedMeteredWorkKeys = ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
    progressKeys = ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS,
  } = {},
) {
  const issues = []
  const roleEntries = Object.entries(progressKeys).filter(
    ([role, key]) =>
      role !== 'spawnDependencyWaitingKey' &&
      role !== 'targetUpdateStatusKey' &&
      typeof key === 'string' &&
      key.length > 0,
  )
  const expectedKeys = [
    ...new Set([...roleEntries.map(([, key]) => key), ...expectedMeteredWorkKeys]),
  ]
  if (expectedKeys.length === 0) return issues

  for (const key of expectedKeys) {
    if (baseline && (!Number.isFinite(baseline[key]) || baseline[key] < 0)) {
      issues.push(`${context} baseline ${key}=${String(baseline[key])}`)
    }
    if (!Number.isFinite(current?.[key]) || current[key] < 0) {
      issues.push(`${context} current ${key}=${String(current?.[key])}`)
    }
  }
  const spawnDependencyWaitingKey = progressKeys.spawnDependencyWaitingKey
  const spawnDependencyWaiting = spawnDependencyWaitingKey
    ? current?.[spawnDependencyWaitingKey]
    : null
  const baselineSpawnDependencyWaiting = spawnDependencyWaitingKey
    ? baseline?.[spawnDependencyWaitingKey]
    : null
  if (
    spawnDependencyWaitingKey &&
    baseline &&
    typeof baselineSpawnDependencyWaiting !== 'boolean'
  ) {
    issues.push(
      `${context} baseline spawn dependency waiting=${String(
        baselineSpawnDependencyWaiting,
      )}`,
    )
  }
  if (spawnDependencyWaitingKey && typeof spawnDependencyWaiting !== 'boolean') {
    issues.push(
      `${context} current spawn dependency waiting=${String(spawnDependencyWaiting)}`,
    )
  }
  if (issues.length > 0) return issues

  const maximumFirstServiceAgeTicks = maximumZombieEnterRoomSparseSearchFirstServiceAgeTicks(
    activeZombieCount,
  )
  const maximumFirstServiceAgeKey = progressKeys.maximumFirstServiceAgeTicksKey
  const oldestUnservicedAgeKey = progressKeys.oldestUnservicedAgeTicksKey
  const unservicedPendingCountKey = progressKeys.unservicedPendingCountKey
  if (
    maximumFirstServiceAgeKey &&
    current[maximumFirstServiceAgeKey] > maximumFirstServiceAgeTicks
  ) {
    issues.push(
      `${context} maximum first-service age=${String(
        current[maximumFirstServiceAgeKey],
      )} ticks exceeds ${String(maximumFirstServiceAgeTicks)} ticks for ` +
        `${String(activeZombieCount)} agents at ` +
        `${String(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick)} slices/tick`,
    )
  }
  if (
    oldestUnservicedAgeKey &&
    current[oldestUnservicedAgeKey] > maximumFirstServiceAgeTicks
  ) {
    issues.push(
      `${context} oldest unserviced age=${String(
        current[oldestUnservicedAgeKey],
      )} ticks exceeds first-service bound=${String(maximumFirstServiceAgeTicks)}`,
    )
  }
  if (
    unservicedPendingCountKey &&
    current[unservicedPendingCountKey] > current.navigationSparseSearchPendingAgentCount
  ) {
    issues.push(
      `${context} unserviced pending=${String(
        current[unservicedPendingCountKey],
      )} exceeds pending sparse searches=${String(
        current.navigationSparseSearchPendingAgentCount,
      )}`,
    )
  }
  if (
    unservicedPendingCountKey &&
    oldestUnservicedAgeKey &&
    current[unservicedPendingCountKey] === 0 &&
    current[oldestUnservicedAgeKey] !== 0
  ) {
    issues.push(`${context} reports unserviced age with no unserviced pending searches`)
  }
  const agentMaximumNoProgressAgeKey =
    progressKeys.agentMaximumPendingNoProgressAgeTicksKey
  const agentOldestNoProgressAgeKey = progressKeys.agentOldestPendingNoProgressAgeTicksKey
  const targetUpdateStatusKey = progressKeys.targetUpdateStatusKey
  const targetUpdateStatus = targetUpdateStatusKey ? current[targetUpdateStatusKey] : null
  const baselineTargetUpdateStatus = targetUpdateStatusKey
    ? baseline?.[targetUpdateStatusKey]
    : null
  if (
    targetUpdateStatusKey &&
    baseline &&
    (typeof baselineTargetUpdateStatus !== 'string' ||
      baselineTargetUpdateStatus.length === 0)
  ) {
    issues.push(`${context} baseline target-update status=${String(baselineTargetUpdateStatus)}`)
  }
  if (
    targetUpdateStatusKey &&
    (typeof targetUpdateStatus !== 'string' || targetUpdateStatus.length === 0)
  ) {
    issues.push(`${context} target-update status=${String(targetUpdateStatus)}`)
  }
  const targetUpdatePending = targetUpdateStatus === 'pending'
  const spawnPendingCountKey = progressKeys.spawnPendingCountKey
  const spawnPendingCount = spawnPendingCountKey ? current[spawnPendingCountKey] : 0
  const baselineSpawnPendingCount = spawnPendingCountKey
    ? baseline?.[spawnPendingCountKey]
    : 0
  for (const [label, value] of [
    ['baseline', baselineSpawnPendingCount],
    ['current', spawnPendingCount],
  ]) {
    if (spawnPendingCountKey && (label === 'current' || baseline) && value !== 0 && value !== 1) {
      issues.push(`${context} ${label} spawn pending count=${String(value)} expected 0 or 1`)
    }
  }
  issues.push(
    ...zombieEnterRoomSparseSearchHeapIssues(current, progressKeys, `${context} current heap`),
  )
  if (
    !targetUpdatePending &&
    agentOldestNoProgressAgeKey &&
    current[agentOldestNoProgressAgeKey] > maximumFirstServiceAgeTicks
  ) {
    issues.push(
      `${context} agent oldest pending no-progress age=${String(
        current[agentOldestNoProgressAgeKey],
      )} ticks exceeds agent fairness bound=${String(maximumFirstServiceAgeTicks)}`,
    )
  }
  const baselineTargetUpdatePending = baselineTargetUpdateStatus === 'pending'
  if (
    baseline &&
    !baselineTargetUpdatePending &&
    !targetUpdatePending &&
    agentMaximumNoProgressAgeKey &&
    current[agentMaximumNoProgressAgeKey] > maximumFirstServiceAgeTicks &&
    current[agentMaximumNoProgressAgeKey] > baseline[agentMaximumNoProgressAgeKey]
  ) {
      issues.push(
        `${context} agent maximum pending no-progress age=${String(
          current[agentMaximumNoProgressAgeKey],
        )} ticks increased beyond agent fairness bound=${String(maximumFirstServiceAgeTicks)}`,
      )
  }
  if (
    agentOldestNoProgressAgeKey &&
    current.navigationSparseSearchPendingAgentCount === 0 &&
    current[agentOldestNoProgressAgeKey] !== 0
  ) {
    issues.push(`${context} reports agent no-progress age with no pending agent searches`)
  }
  for (const [label, key] of [
    ['target maximum no-progress age', progressKeys.targetMaximumNoProgressAgeTicksKey],
    ['target no-progress age', progressKeys.targetNoProgressAgeTicksKey],
    ['spawn maximum no-progress age', progressKeys.spawnMaximumNoProgressAgeTicksKey],
    ['spawn no-progress age', progressKeys.spawnNoProgressAgeTicksKey],
  ]) {
    if (
      key &&
      current[key] > ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumNoProgressAgeTicks
    ) {
      issues.push(
        `${context} ${label}=${String(current[key])} ticks exceeds job progress bound=` +
          ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumNoProgressAgeTicks,
      )
    }
  }
  const maximumNoProgressAgeKey = progressKeys.maximumNoProgressAgeTicksKey
  const noProgressAgeKey = progressKeys.noProgressAgeTicksKey
  const categoryCurrentNoProgressAgeKeys = [
    agentOldestNoProgressAgeKey,
    progressKeys.targetNoProgressAgeTicksKey,
    progressKeys.spawnNoProgressAgeTicksKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  if (noProgressAgeKey && categoryCurrentNoProgressAgeKeys.length === 3) {
    const expectedNoProgressAge = Math.max(
      ...categoryCurrentNoProgressAgeKeys.map((key) => current[key]),
    )
    if (current[noProgressAgeKey] !== expectedNoProgressAge) {
      issues.push(
        `${context} aggregate no-progress age=${String(current[noProgressAgeKey])} ` +
          `does not equal category maximum=${String(expectedNoProgressAge)}`,
      )
    }
  }
  const categoryMaximumNoProgressAgeKeys = [
    agentMaximumNoProgressAgeKey,
    progressKeys.targetMaximumNoProgressAgeTicksKey,
    progressKeys.spawnMaximumNoProgressAgeTicksKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  if (maximumNoProgressAgeKey && categoryMaximumNoProgressAgeKeys.length === 3) {
    const expectedMaximumNoProgressAge = Math.max(
      ...categoryMaximumNoProgressAgeKeys.map((key) => current[key]),
    )
    if (current[maximumNoProgressAgeKey] !== expectedMaximumNoProgressAge) {
      issues.push(
        `${context} aggregate maximum no-progress age=${String(
          current[maximumNoProgressAgeKey],
        )} does not equal category maximum=${String(expectedMaximumNoProgressAge)}`,
      )
    }
  }
  if (
    progressKeys.minimumWorkUnitsPerAgentSliceKey &&
    current[progressKeys.minimumWorkUnitsPerAgentSliceKey] !==
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMinimumWorkUnitsPerAgentSlice
  ) {
    issues.push(
      `${context} minimum work units/agent slice=${String(
        current[progressKeys.minimumWorkUnitsPerAgentSliceKey],
      )} expected ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMinimumWorkUnitsPerAgentSlice,
    )
  }
  if (
    progressKeys.targetSlicesPerTickKey &&
    current[progressKeys.targetSlicesPerTickKey] !==
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick
  ) {
    issues.push(
      `${context} target slices/tick=${String(
        current[progressKeys.targetSlicesPerTickKey],
      )} expected ${String(
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick,
      )}`,
    )
  }
  if (
    progressKeys.spawnSlicesPerTickKey &&
    current[progressKeys.spawnSlicesPerTickKey] !==
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchSpawnSlicesPerTick
  ) {
    issues.push(
      `${context} spawn slices/tick=${String(
        current[progressKeys.spawnSlicesPerTickKey],
      )} expected ${String(
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchSpawnSlicesPerTick,
      )}`,
    )
  }
  const agentServiceSliceCountThisTickKey =
    progressKeys.agentServiceSliceCountThisTickKey
  const agentEligiblePendingCountAtScheduleThisTickKey =
    progressKeys.agentEligiblePendingCountAtScheduleThisTickKey
  if (agentServiceSliceCountThisTickKey) {
    const expectedAgentServices = agentEligiblePendingCountAtScheduleThisTickKey
      ? Math.min(
          ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
          current[agentEligiblePendingCountAtScheduleThisTickKey],
        )
      : null
    if (
      expectedAgentServices !== null &&
      current[agentServiceSliceCountThisTickKey] !== expectedAgentServices
    ) {
      issues.push(
        `${context} agent service slices this tick=${String(
          current[agentServiceSliceCountThisTickKey],
        )} expected ${String(expectedAgentServices)} for eligible=${String(
          current[agentEligiblePendingCountAtScheduleThisTickKey],
        )}`,
      )
    }
    if (
      current[agentServiceSliceCountThisTickKey] >
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
    ) {
      issues.push(
        `${context} agent service slices this tick=${String(
          current[agentServiceSliceCountThisTickKey],
        )} exceeds ` + ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      )
    }
  }
  const targetServiceSliceCountThisTickKey =
    progressKeys.targetServiceSliceCountThisTickKey
  const spawnServiceSliceCountThisTickKey = progressKeys.spawnServiceSliceCountThisTickKey
  for (const [label, key, maximum] of [
    [
      'target',
      targetServiceSliceCountThisTickKey,
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick,
    ],
    [
      'spawn',
      spawnServiceSliceCountThisTickKey,
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchSpawnSlicesPerTick,
    ],
  ]) {
    if (key && current[key] > maximum) {
      issues.push(
        `${context} ${label} service slices this tick=${String(
          current[key],
        )} exceeds ${String(maximum)}`,
      )
    }
  }
  if (
    targetUpdatePending &&
    targetServiceSliceCountThisTickKey &&
    current[targetServiceSliceCountThisTickKey] !==
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick
  ) {
    issues.push(
      `${context} pending target received ${String(
        current[targetServiceSliceCountThisTickKey],
      )} service slices this tick; expected ` +
        String(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick),
    )
  }
  const serviceSliceCountThisTickKey = progressKeys.serviceSliceCountThisTickKey
  const categoryServiceSliceCountThisTickKeys = [
    agentServiceSliceCountThisTickKey,
    targetServiceSliceCountThisTickKey,
    spawnServiceSliceCountThisTickKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  if (
    serviceSliceCountThisTickKey &&
    current[serviceSliceCountThisTickKey] >
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchSpawnSlicesPerTick
  ) {
    issues.push(
      `${context} service slices this tick=${String(
        current[serviceSliceCountThisTickKey],
      )} exceeds ` +
        String(
          ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick +
            ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchTargetSlicesPerTick +
            ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchSpawnSlicesPerTick,
        ),
    )
  }
  if (serviceSliceCountThisTickKey && categoryServiceSliceCountThisTickKeys.length === 3) {
    const attributedServiceSlices = categoryServiceSliceCountThisTickKeys.reduce(
      (sum, key) => sum + current[key],
      0,
    )
    if (current[serviceSliceCountThisTickKey] !== attributedServiceSlices) {
      issues.push(
        `${context} aggregate service slices this tick=${String(
          current[serviceSliceCountThisTickKey],
        )} does not equal category sum=${String(attributedServiceSlices)}`,
      )
    }
  }
  const completionProgressThisTickKey = progressKeys.completionProgressThisTickKey
  const agentProgressSliceCountThisTickKey =
    progressKeys.agentProgressSliceCountThisTickKey
  const targetProgressSliceCountThisTickKey =
    progressKeys.targetProgressSliceCountThisTickKey
  const spawnProgressSliceCountThisTickKey = progressKeys.spawnProgressSliceCountThisTickKey
  for (const [label, progressKey, serviceKey] of [
    ['agent', agentProgressSliceCountThisTickKey, agentServiceSliceCountThisTickKey],
    ['target', targetProgressSliceCountThisTickKey, targetServiceSliceCountThisTickKey],
    ['spawn', spawnProgressSliceCountThisTickKey, spawnServiceSliceCountThisTickKey],
  ]) {
    if (progressKey && serviceKey && current[progressKey] > current[serviceKey]) {
      issues.push(
        `${context} ${label} progress slices this tick=${String(
          current[progressKey],
        )} exceeds service slices=${String(current[serviceKey])}`,
      )
    }
  }
  const categoryProgressSliceCountThisTickKeys = [
    agentProgressSliceCountThisTickKey,
    targetProgressSliceCountThisTickKey,
    spawnProgressSliceCountThisTickKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  if (
    completionProgressThisTickKey &&
    serviceSliceCountThisTickKey &&
    current[completionProgressThisTickKey] > current[serviceSliceCountThisTickKey]
  ) {
    issues.push(
      `${context} completion progress this tick=${String(
        current[completionProgressThisTickKey],
      )} exceeds service slices=${String(current[serviceSliceCountThisTickKey])}`,
    )
  }
  if (completionProgressThisTickKey && categoryProgressSliceCountThisTickKeys.length === 3) {
    const attributedProgressSlices = categoryProgressSliceCountThisTickKeys.reduce(
      (sum, key) => sum + current[key],
      0,
    )
    if (current[completionProgressThisTickKey] !== attributedProgressSlices) {
      issues.push(
        `${context} aggregate completion progress this tick=${String(
          current[completionProgressThisTickKey],
        )} does not equal category sum=${String(attributedProgressSlices)}`,
      )
    }
  }
  const spawnNoProgressAgeTicksKey = progressKeys.spawnNoProgressAgeTicksKey
  const validateSpawnDependencySnapshot = (label, snapshot, status, waiting) => {
    if (!snapshot || !spawnPendingCountKey || !spawnDependencyWaitingKey) return
    const pendingCount = snapshot[spawnPendingCountKey]
    const startedCount = progressKeys.spawnStartedCountTotalKey
      ? snapshot[progressKeys.spawnStartedCountTotalKey]
      : null
    const completedCount = progressKeys.spawnCompletedCountTotalKey
      ? snapshot[progressKeys.spawnCompletedCountTotalKey]
      : null
    const invalidatedCount = progressKeys.spawnInvalidatedCountTotalKey
      ? snapshot[progressKeys.spawnInvalidatedCountTotalKey]
      : null
    const spawnServiceThisTick = spawnServiceSliceCountThisTickKey
      ? snapshot[spawnServiceSliceCountThisTickKey]
      : null
    const spawnProgressThisTick = spawnProgressSliceCountThisTickKey
      ? snapshot[spawnProgressSliceCountThisTickKey]
      : null
    const spawnNoProgressAge = spawnNoProgressAgeTicksKey
      ? snapshot[spawnNoProgressAgeTicksKey]
      : null
    if (
      Number.isFinite(startedCount) &&
      Number.isFinite(completedCount) &&
      Number.isFinite(invalidatedCount) &&
      startedCount !== completedCount + invalidatedCount + pendingCount
    ) {
      issues.push(
        `${context} ${label} spawn lifecycle started=${String(
          startedCount,
        )} does not equal completed+invalidated+pending=${String(
          completedCount + invalidatedCount + pendingCount,
        )}`,
      )
    }
    if (waiting === true) {
      if (pendingCount !== 1) {
        issues.push(`${context} ${label} spawn dependency wait has pending=${String(pendingCount)}`)
      }
      if (status !== 'pending') {
        issues.push(`${context} ${label} spawn dependency wait has target status=${String(status)}`)
      }
      if (spawnNoProgressAge !== 0) {
        issues.push(
          `${context} ${label} spawn dependency wait has no-progress age=${String(
            spawnNoProgressAge,
          )} expected 0`,
        )
      }
    } else if (pendingCount === 1 && spawnServiceThisTick === 0) {
      issues.push(`${context} ${label} suppressed spawn service without dependency-wait flag`)
    }
  }
  validateSpawnDependencySnapshot(
    'baseline',
    baseline,
    baselineTargetUpdateStatus,
    baselineSpawnDependencyWaiting,
  )
  validateSpawnDependencySnapshot(
    'current',
    current,
    targetUpdateStatus,
    spawnDependencyWaiting,
  )
  if (!baseline) return issues

  for (const key of [
    progressKeys.agentMaximumPendingNoProgressAgeTicksKey,
    progressKeys.agentProgressSliceCountTotalKey,
    progressKeys.agentServiceSliceCountTotalKey,
    progressKeys.completionProgressTotalKey,
    progressKeys.firstServiceCountTotalKey,
    progressKeys.maximumFirstServiceAgeTicksKey,
    progressKeys.maximumNoProgressAgeTicksKey,
    progressKeys.serviceSliceCountTotalKey,
    progressKeys.spawnMaximumNoProgressAgeTicksKey,
    progressKeys.spawnCompletedCountTotalKey,
    progressKeys.spawnInvalidatedCountTotalKey,
    progressKeys.spawnProgressSliceCountTotalKey,
    progressKeys.spawnServiceSliceCountTotalKey,
    progressKeys.spawnStartedCountTotalKey,
    progressKeys.targetMaximumNoProgressAgeTicksKey,
    progressKeys.targetProgressSliceCountTotalKey,
    progressKeys.targetServiceSliceCountTotalKey,
    ...expectedMeteredWorkKeys,
  ].filter((key) => typeof key === 'string' && key.length > 0)) {
    if (current[key] < baseline[key]) {
      issues.push(`${context} ${key} regressed from ${String(baseline[key])} to ${String(current[key])}`)
    }
  }

  const elapsedTicks = current.simulationTick - baseline.simulationTick
  const serviceSliceCountKey = progressKeys.serviceSliceCountTotalKey
  const completionProgressKey = progressKeys.completionProgressTotalKey
  const agentServiceSliceCountKey = progressKeys.agentServiceSliceCountTotalKey
  const targetServiceSliceCountKey = progressKeys.targetServiceSliceCountTotalKey
  const spawnServiceSliceCountKey = progressKeys.spawnServiceSliceCountTotalKey
  const agentProgressSliceCountKey = progressKeys.agentProgressSliceCountTotalKey
  const targetProgressSliceCountKey = progressKeys.targetProgressSliceCountTotalKey
  const spawnProgressSliceCountKey = progressKeys.spawnProgressSliceCountTotalKey
  const categoryServiceSliceCountKeys = [
    agentServiceSliceCountKey,
    targetServiceSliceCountKey,
    spawnServiceSliceCountKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  if (serviceSliceCountKey && categoryServiceSliceCountKeys.length === 3) {
    const aggregateServiceDelta = current[serviceSliceCountKey] - baseline[serviceSliceCountKey]
    const attributedServiceDelta = categoryServiceSliceCountKeys.reduce(
      (sum, key) => sum + current[key] - baseline[key],
      0,
    )
    if (aggregateServiceDelta !== attributedServiceDelta) {
      issues.push(
        `${context} aggregate service delta=${String(
          aggregateServiceDelta,
        )} does not equal category delta=${String(attributedServiceDelta)}`,
      )
    }
  }
  const categoryProgressSliceCountKeys = [
    agentProgressSliceCountKey,
    targetProgressSliceCountKey,
    spawnProgressSliceCountKey,
  ].filter((key) => typeof key === 'string' && key.length > 0)
  if (completionProgressKey && categoryProgressSliceCountKeys.length === 3) {
    const aggregateProgressDelta =
      current[completionProgressKey] - baseline[completionProgressKey]
    const attributedProgressDelta = categoryProgressSliceCountKeys.reduce(
      (sum, key) => sum + current[key] - baseline[key],
      0,
    )
    if (aggregateProgressDelta !== attributedProgressDelta) {
      issues.push(
        `${context} aggregate completion-progress delta=${String(
          aggregateProgressDelta,
        )} does not equal category delta=${String(attributedProgressDelta)}`,
      )
    }
  }
  if (progressKeys.firstServiceCountTotalKey && agentProgressSliceCountKey) {
    const firstServiceDelta =
      current[progressKeys.firstServiceCountTotalKey] -
      baseline[progressKeys.firstServiceCountTotalKey]
    const agentProgressDelta =
      current[agentProgressSliceCountKey] - baseline[agentProgressSliceCountKey]
    if (firstServiceDelta > agentProgressDelta) {
      issues.push(
        `${context} first-service delta=${String(firstServiceDelta)} exceeds positive ` +
          `agent-progress delta=${String(agentProgressDelta)}`,
      )
    }
  }
  const spawnServiceDelta = spawnServiceSliceCountKey
    ? current[spawnServiceSliceCountKey] - baseline[spawnServiceSliceCountKey]
    : Number.NaN
  const spawnProgressDelta = spawnProgressSliceCountKey
    ? current[spawnProgressSliceCountKey] - baseline[spawnProgressSliceCountKey]
    : Number.NaN
  const maximumSpawnServiceDelta =
    Math.max(0, elapsedTicks) *
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchSpawnSlicesPerTick
  if (spawnServiceSliceCountKey && spawnServiceDelta > maximumSpawnServiceDelta) {
    issues.push(
      `${context} spawn service delta=${String(spawnServiceDelta)} exceeds ${String(
        maximumSpawnServiceDelta,
      )} across ${String(elapsedTicks)} ticks`,
    )
  }
  if (
    spawnProgressSliceCountKey &&
    spawnServiceSliceCountKey &&
    spawnProgressDelta > spawnServiceDelta
  ) {
    issues.push(
      `${context} spawn progress delta=${String(spawnProgressDelta)} exceeds service delta=` +
        String(spawnServiceDelta),
    )
  }
  const spawnCompletedDelta = progressKeys.spawnCompletedCountTotalKey
    ? current[progressKeys.spawnCompletedCountTotalKey] -
      baseline[progressKeys.spawnCompletedCountTotalKey]
    : Number.NaN
  if (
    progressKeys.spawnCompletedCountTotalKey &&
    spawnProgressSliceCountKey &&
    spawnCompletedDelta > spawnProgressDelta
  ) {
    issues.push(
      `${context} spawn completion delta=${String(spawnCompletedDelta)} exceeds positive ` +
        `progress delta=${String(spawnProgressDelta)}`,
    )
  }
  for (const [label, totalKeys, serviceDelta, maximumPerService] of [
    [
      'agent',
      [
        'navigationSparseCachedFollowHeapOperationsTotal',
        'navigationSparseFlowSearchHeapOperationsTotal',
      ],
      agentServiceSliceCountKey
        ? current[agentServiceSliceCountKey] - baseline[agentServiceSliceCountKey]
        : Number.NaN,
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerAgentSlice,
    ],
    [
      'spawn',
      ['navigationSparseSpawnSearchHeapOperationsTotal'],
      spawnServiceDelta,
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerAgentSlice,
    ],
    [
      'target',
      ['navigationSparseTargetUpdateHeapOperationsTotal'],
      targetServiceSliceCountKey
        ? current[targetServiceSliceCountKey] - baseline[targetServiceSliceCountKey]
        : Number.NaN,
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumHeapOperationsPerTick -
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick *
          ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMinimumWorkUnitsPerAgentSlice,
    ],
  ]) {
    const workDelta = totalKeys.reduce(
      (sum, key) => sum + current[key] - baseline[key],
      0,
    )
    if (!Number.isFinite(workDelta) || workDelta < 0) {
      issues.push(`${context} ${label} heap operations delta=${String(workDelta)}`)
    } else if (
      Number.isFinite(serviceDelta) &&
      workDelta > Math.max(0, serviceDelta) * maximumPerService
    ) {
      issues.push(
        `${context} ${label} heap operations delta=${String(workDelta)} exceeds ` +
          `${String(serviceDelta)} service slices * ${String(maximumPerService)}`,
      )
    }
  }
  const sameWaitingSpawnJob =
    baselineSpawnDependencyWaiting === true &&
    spawnDependencyWaiting === true &&
    [
      progressKeys.spawnStartedCountTotalKey,
      progressKeys.spawnCompletedCountTotalKey,
      progressKeys.spawnInvalidatedCountTotalKey,
    ].every((key) => key && current[key] - baseline[key] === 0)
  if (sameWaitingSpawnJob && (spawnServiceDelta !== 0 || spawnProgressDelta !== 0)) {
    issues.push(
      `${context} same waiting spawn job service/progress delta=${String(
        spawnServiceDelta,
      )}/${String(spawnProgressDelta)} expected 0/0`,
    )
  }
  if (baselineSpawnDependencyWaiting === true && targetUpdateStatus === 'ready') {
    if (spawnDependencyWaiting !== false) {
      issues.push(`${context} target-ready transition did not clear spawn dependency wait`)
    }
    if (!(spawnServiceDelta >= 1 && spawnServiceDelta <= maximumSpawnServiceDelta)) {
      issues.push(
        `${context} target-ready spawn service delta=${String(
          spawnServiceDelta,
        )} expected 1..${String(maximumSpawnServiceDelta)} across ${String(
          elapsedTicks,
        )} ticks`,
      )
    }
    if (!(spawnProgressDelta >= 1 && spawnProgressDelta <= spawnServiceDelta)) {
      issues.push(
        `${context} target-ready spawn progress delta=${String(
          spawnProgressDelta,
        )} expected 1..service delta ${String(spawnServiceDelta)}`,
      )
    }
  }
  if (targetUpdatePending) return issues
  const pendingRequiredProgress =
    baseline.navigationSparseSearchPendingAgentCount > 0 ||
    (oldestUnservicedAgeKey &&
      current[oldestUnservicedAgeKey] >= maximumFirstServiceAgeTicks) ||
    (agentOldestNoProgressAgeKey &&
      current[agentOldestNoProgressAgeKey] >= maximumFirstServiceAgeTicks)
  if (!(pendingRequiredProgress && elapsedTicks >= maximumFirstServiceAgeTicks)) return issues

  const remainingWorkKey = progressKeys.remainingWorkKey
  const serviceSliceDelta = agentServiceSliceCountKey
    ? current[agentServiceSliceCountKey] - baseline[agentServiceSliceCountKey]
    : Number.NaN
  const completionProgressDelta = agentProgressSliceCountKey
    ? current[agentProgressSliceCountKey] - baseline[agentProgressSliceCountKey]
    : Number.NaN
  const remainingWorkDelta = remainingWorkKey
    ? current[remainingWorkKey] - baseline[remainingWorkKey]
    : Number.NaN

  if (agentServiceSliceCountKey && !(serviceSliceDelta > 0)) {
    issues.push(
      `${context} pending agent searches received no dedicated service across ` +
        `${String(elapsedTicks)} ticks`,
    )
  }
  if (
    (agentProgressSliceCountKey || remainingWorkKey) &&
    !(completionProgressDelta > 0 || remainingWorkDelta < 0)
  ) {
    issues.push(
      `${context} pending agent searches made no positive progress across ${String(
        elapsedTicks,
      )} ticks`,
    )
  }
  return issues
}

export function summarizeZombieEnterRoomPerformance(sample) {
  const performance = sample?.zombie?.performance
  const expectedRoutingTelemetry = Object.fromEntries(
    ZOMBIE_ENTER_ROOM_EXPECTED_ROUTING_TELEMETRY_KEYS.map((key) => [
      key,
      performance?.routing?.[key] ?? null,
    ]),
  )
  return {
    collisionWorldGeneration: performance?.collisionWorldGeneration ?? null,
    fallbackRoutingRebuildCount: performance?.routing?.fallbackRebuildCount ?? null,
    navigationAnchorInvalidationCount:
      performance?.routing?.navigationAnchorInvalidationCount ?? null,
    navigationAnchoredAgentCount: performance?.routing?.navigationAnchoredAgentCount ?? null,
    navigationIntentCanceledCount:
      performance?.routing?.navigationIntentCanceledCount ?? null,
    navigationIntentDemandCachedAnchorLostCount:
      performance?.routing?.navigationIntentDemandCachedAnchorLostCount ?? null,
    navigationIntentDemandCollisionRecoveryCount:
      performance?.routing?.navigationIntentDemandCollisionRecoveryCount ?? null,
    navigationIntentDemandConnectorChangedCount:
      performance?.routing?.navigationIntentDemandConnectorChangedCount ?? null,
    navigationIntentDemandRoutePublishedCount:
      performance?.routing?.navigationIntentDemandRoutePublishedCount ?? null,
    navigationIntentDemandSpawnCount:
      performance?.routing?.navigationIntentDemandSpawnCount ?? null,
    navigationIntentDemandWorldChangedCount:
      performance?.routing?.navigationIntentDemandWorldChangedCount ?? null,
    navigationIntentIssuedCount: performance?.routing?.navigationIntentIssuedCount ?? null,
    navigationIntentOldestPendingAgeTicks:
      performance?.routing?.navigationIntentOldestPendingAgeTicks ?? null,
    navigationIntentPendingCount: performance?.routing?.navigationIntentPendingCount ?? null,
    navigationIntentResolvedCount:
      performance?.routing?.navigationIntentResolvedCount ?? null,
    navigationIntentResolveBudgetViolationCount:
      performance?.routing?.navigationIntentResolveBudgetViolationCount ?? null,
    navigationTargetCommittedRouteGeneration:
      performance?.routing?.navigationTargetCommittedRouteGeneration ?? null,
    navigationTargetRequestedRevision:
      performance?.routing?.navigationTargetRequestedRevision ?? null,
    navigationWorldRevision: performance?.routing?.navigationWorldRevision ?? null,
    navigationSparseSearchAgentSlicesPerTick:
      performance?.routing?.navigationSparseSearchAgentSlicesPerTick ?? null,
    navigationSparseSearchBudgetViolationCount:
      performance?.routing?.navigationSparseSearchBudgetViolationCount ?? null,
    navigationSparseSearchCandidateVisitsMaximumObservedPerTick:
      performance?.routing?.navigationSparseSearchCandidateVisitsMaximumObservedPerTick ?? null,
    navigationSparseSearchCandidateVisitsThisTick:
      performance?.routing?.navigationSparseSearchCandidateVisitsThisTick ?? null,
    navigationSparseSearchCandidateVisitsTotal:
      performance?.routing?.navigationSparseSearchCandidateVisitsTotal ?? null,
    navigationSparseSearchCollisionPredicatesMaximumObservedPerTick:
      performance?.routing?.navigationSparseSearchCollisionPredicatesMaximumObservedPerTick ??
      null,
    navigationSparseSearchCollisionPredicatesThisTick:
      performance?.routing?.navigationSparseSearchCollisionPredicatesThisTick ?? null,
    navigationSparseSearchCollisionPredicatesTotal:
      performance?.routing?.navigationSparseSearchCollisionPredicatesTotal ?? null,
    navigationSparseSearchCompletedCount:
      performance?.routing?.navigationSparseSearchCompletedCount ?? null,
    navigationSparseSearchHeapOperationsMaximumObservedPerTick:
      performance?.routing?.navigationSparseSearchHeapOperationsMaximumObservedPerTick ?? null,
    navigationSparseSearchHeapOperationsThisTick:
      performance?.routing?.navigationSparseSearchHeapOperationsThisTick ?? null,
    navigationSparseSearchHeapOperationsTotal:
      performance?.routing?.navigationSparseSearchHeapOperationsTotal ?? null,
    navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick:
      performance?.routing?.navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick ??
      null,
    navigationSparseSearchHierarchyNodeVisitsThisTick:
      performance?.routing?.navigationSparseSearchHierarchyNodeVisitsThisTick ?? null,
    navigationSparseSearchHierarchyNodeVisitsTotal:
      performance?.routing?.navigationSparseSearchHierarchyNodeVisitsTotal ?? null,
    navigationSparseSearchMaximumCandidateVisitsPerAgentSlice:
      performance?.routing?.navigationSparseSearchMaximumCandidateVisitsPerAgentSlice ?? null,
    navigationSparseSearchMaximumCandidateVisitsPerTick:
      performance?.routing?.navigationSparseSearchMaximumCandidateVisitsPerTick ?? null,
    navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice:
      performance?.routing?.navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice ?? null,
    navigationSparseSearchMaximumCollisionPredicatesPerTick:
      performance?.routing?.navigationSparseSearchMaximumCollisionPredicatesPerTick ?? null,
    navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice:
      performance?.routing?.navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice ?? null,
    navigationSparseSearchMaximumHierarchyNodeVisitsPerTick:
      performance?.routing?.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick ?? null,
    navigationSparseSearchMaximumHeapOperationsPerAgentSlice:
      performance?.routing?.navigationSparseSearchMaximumHeapOperationsPerAgentSlice ?? null,
    navigationSparseSearchMaximumHeapOperationsPerTick:
      performance?.routing?.navigationSparseSearchMaximumHeapOperationsPerTick ?? null,
    navigationSparseSearchMaximumSupportPredicatesPerAgentSlice:
      performance?.routing?.navigationSparseSearchMaximumSupportPredicatesPerAgentSlice ?? null,
    navigationSparseSearchMaximumSupportPredicatesPerTick:
      performance?.routing?.navigationSparseSearchMaximumSupportPredicatesPerTick ?? null,
    navigationSparseSearchMaximumTargetBuildsPerTick:
      performance?.routing?.navigationSparseSearchMaximumTargetBuildsPerTick ?? null,
    navigationSparseSearchPendingAgentCount:
      performance?.routing?.navigationSparseSearchPendingAgentCount ?? null,
    navigationSparseSearchStartedCount:
      performance?.routing?.navigationSparseSearchStartedCount ?? null,
    navigationSparseSearchSupportPredicatesMaximumObservedPerTick:
      performance?.routing?.navigationSparseSearchSupportPredicatesMaximumObservedPerTick ?? null,
    navigationSparseSearchSupportPredicatesThisTick:
      performance?.routing?.navigationSparseSearchSupportPredicatesThisTick ?? null,
    navigationSparseSearchSupportPredicatesTotal:
      performance?.routing?.navigationSparseSearchSupportPredicatesTotal ?? null,
    navigationSparseSearchTargetBuildsMaximumObservedPerTick:
      performance?.routing?.navigationSparseSearchTargetBuildsMaximumObservedPerTick ?? null,
    navigationSparseSearchTargetBuildsThisTick:
      performance?.routing?.navigationSparseSearchTargetBuildsThisTick ?? null,
    navigationSparseSearchTargetBuildsTotal:
      performance?.routing?.navigationSparseSearchTargetBuildsTotal ?? null,
    routingGraphAttachmentCandidateCount:
      performance?.routing?.graphAttachmentCandidateCount ?? null,
    routingGraphAttachmentFullSearchCount:
      performance?.routing?.graphAttachmentFullSearchCount ?? null,
    routingGraphAttachmentSupportCheckCount:
      performance?.routing?.graphAttachmentSupportCheckCount ?? null,
    routingMaximumResolveCountObservedPerTick:
      performance?.routing?.navigationIntentMaximumResolveCountObservedPerTick ?? null,
    routingNavigationMode: performance?.routing?.navigationMode ?? null,
    routingRebuildCount: performance?.routing?.rebuildCount ?? null,
    routingResolveBudgetPerTick:
      performance?.routing?.navigationIntentResolveBudgetPerTick ?? null,
    routingResolveCount: performance?.routing?.resolveCount ?? null,
    routingResolveCountThisTick:
      performance?.routing?.navigationIntentResolveCountThisTick ?? null,
    routingTargetLayerIndex: performance?.routing?.targetLayerIndex ?? null,
    simulationTick: performance?.routing?.simulationTick ?? null,
    spatialBuildCount: performance?.spatial?.buildCount ?? null,
    spatialCandidateInspectionCount: performance?.spatial?.candidateInspectionCount ?? null,
    spatialIndexedAgentCount: performance?.spatial?.indexedAgentCount ?? null,
    spatialMaximumCandidateInspectionsObserved:
      performance?.spatial?.maximumCandidateInspectionsObserved ?? null,
    spatialMaximumCandidateInspectionsPerQuery:
      performance?.spatial?.maximumCandidateInspectionsPerQuery ?? null,
    spatialOverflowQueryCount: performance?.spatial?.overflowQueryCount ?? null,
    spatialPairInspectionCount: performance?.spatial?.pairInspectionCount ?? null,
    spatialQueryCount: performance?.spatial?.queryCount ?? null,
    spatialSeparationNeighborCount: performance?.spatial?.separationNeighborCount ?? null,
    spatialUnindexedAgentCount: performance?.spatial?.unindexedAgentCount ?? null,
    ...expectedRoutingTelemetry,
  }
}

function zombieEnterRoomSparseSearchBudgetIssues(performance, context = 'sparse search') {
  const issues = []
  if (
    performance?.navigationSparseSearchAgentSlicesPerTick !==
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
  ) {
    issues.push(
      `${context} agent slices/tick=${String(
        performance?.navigationSparseSearchAgentSlicesPerTick,
      )} expected ${ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick}`,
    )
  }
  for (const dimension of ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS) {
    if (performance?.[dimension.maximumPerAgentSliceKey] !== dimension.maximumPerAgentSlice) {
      issues.push(
        `${context} ${dimension.label}/agent-slice=${String(
          performance?.[dimension.maximumPerAgentSliceKey],
        )} expected ${String(dimension.maximumPerAgentSlice)}`,
      )
    }
    if (performance?.[dimension.maximumPerTickKey] !== dimension.maximumPerTick) {
      issues.push(
        `${context} ${dimension.label}/tick=${String(
          performance?.[dimension.maximumPerTickKey],
        )} expected ${String(dimension.maximumPerTick)}`,
      )
    }
    const targetThisTickKey = `navigationSparseTargetUpdate${dimension.metricSuffix}ThisTick`
    const thisTick = dimension.excludesTargetWork
      ? performance?.[dimension.thisTickKey] - performance?.[targetThisTickKey]
      : performance?.[dimension.thisTickKey]
    if (!Number.isFinite(thisTick) || thisTick < 0) {
      issues.push(`${context} non-target ${dimension.label} this tick=${String(thisTick)}`)
    } else if (thisTick > dimension.maximumPerTick) {
      issues.push(
        `${context} ${dimension.label} this tick=${String(
          thisTick,
        )} exceeds ${String(dimension.maximumPerTick)}`,
      )
    }
    if (
      !dimension.excludesTargetWork &&
      performance?.[dimension.maximumObservedKey] > dimension.maximumPerTick
    ) {
      issues.push(
        `${context} maximum ${dimension.label}/tick=${String(
          performance?.[dimension.maximumObservedKey],
        )} exceeds ${String(dimension.maximumPerTick)}`,
      )
    }
  }
  if (
    performance?.navigationSparseSearchMaximumTargetBuildsPerTick !==
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick
  ) {
    issues.push(
      `${context} target builds/tick=${String(
        performance?.navigationSparseSearchMaximumTargetBuildsPerTick,
      )} expected ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick,
    )
  }
  if (
    performance?.navigationSparseSearchTargetBuildsThisTick >
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick
  ) {
    issues.push(
      `${context} target builds this tick=${String(
        performance?.navigationSparseSearchTargetBuildsThisTick,
      )} exceeds ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick,
    )
  }
  if (
    performance?.navigationSparseSearchTargetBuildsMaximumObservedPerTick >
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick
  ) {
    issues.push(
      `${context} maximum target builds/tick=${String(
        performance?.navigationSparseSearchTargetBuildsMaximumObservedPerTick,
      )} exceeds ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchMaximumTargetBuildsPerTick,
    )
  }
  if (performance?.navigationSparseSearchBudgetViolationCount !== 0) {
    issues.push(
      `${context} budget violations=${String(
        performance?.navigationSparseSearchBudgetViolationCount,
      )}`,
    )
  }
  const sparseLifecycleTotal =
    performance?.navigationSparseSearchCompletedCount +
    performance?.navigationSparseSearchInvalidatedCount +
    performance?.navigationSparseSearchCanceledCount +
    performance?.navigationSparseSearchActiveAgentCount
  if (
    Number.isFinite(sparseLifecycleTotal) &&
    sparseLifecycleTotal !== performance?.navigationSparseSearchStartedCount
  ) {
    issues.push(
      `${context} lifecycle conservation failed: started=${String(
        performance?.navigationSparseSearchStartedCount,
      )} completed=${String(
        performance?.navigationSparseSearchCompletedCount,
      )} invalidated=${String(performance?.navigationSparseSearchInvalidatedCount)} canceled=${String(
        performance?.navigationSparseSearchCanceledCount,
      )} active=${String(performance?.navigationSparseSearchActiveAgentCount)}`,
    )
  }
  const sparseRestartReasonTotal =
    performance?.navigationSparseSearchRestartedRoutePublishedCount +
    performance?.navigationSparseSearchRestartedWorldChangedCount +
    performance?.navigationSparseSearchRestartedCollisionRecoveryCount
  if (
    Number.isFinite(sparseRestartReasonTotal) &&
    sparseRestartReasonTotal !== performance?.navigationSparseSearchRestartedCount
  ) {
    issues.push(
      `${context} restart conservation failed: restarted=${String(
        performance?.navigationSparseSearchRestartedCount,
      )} reasons=${String(sparseRestartReasonTotal)}`,
    )
  }
  if (
    performance?.navigationSparseSearchInvalidatedCount !==
    performance?.navigationSparseSearchRestartedCount
  ) {
    issues.push(
      `${context} invalidated=${String(
        performance?.navigationSparseSearchInvalidatedCount,
      )} does not equal restarted=${String(performance?.navigationSparseSearchRestartedCount)}`,
    )
  }
  if (
    performance?.navigationSparseSearchStartedCount >
    performance?.navigationIntentIssuedCount + performance?.navigationSparseSearchRestartedCount
  ) {
    issues.push(
      `${context} started=${String(performance?.navigationSparseSearchStartedCount)} exceeds ` +
        `issued+restarted=${String(
          performance?.navigationIntentIssuedCount +
            performance?.navigationSparseSearchRestartedCount,
        )}`,
    )
  }
  if (performance?.navigationSparseSearchUncausedStartViolationCount !== 0) {
    issues.push(
      `${context} uncaused start violations=${String(
        performance?.navigationSparseSearchUncausedStartViolationCount,
      )}`,
    )
  }
  if (
    performance?.navigationSparseSearchActiveAgentCount >
    performance?.navigationSparseSearchPendingAgentCount
  ) {
    issues.push(
      `${context} active sparse searches=${String(
        performance?.navigationSparseSearchActiveAgentCount,
      )} exceed pending=${String(performance?.navigationSparseSearchPendingAgentCount)}`,
    )
  }
  return issues
}

function zombieEnterRoomAdditionalMeteredWorkBudgetIssues(
  performance,
  dimensions = ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS,
  context = 'metered navigation work',
) {
  const issues = []
  for (const dimension of dimensions) {
    const maximumPerTick = dimension.targetCapKind
      ? resolveZombieEnterRoomTargetWorkCap(performance, dimension.targetCapKind)
      : dimension.maximumPerTick
    if (
      !dimension.targetCapKind &&
      performance?.[dimension.maximumPerTickKey] !== maximumPerTick
    ) {
      issues.push(
        `${context} ${dimension.label}/tick=${String(
          performance?.[dimension.maximumPerTickKey],
        )} expected ${String(maximumPerTick)}`,
      )
    }
    if (performance?.[dimension.thisTickKey] > maximumPerTick) {
      issues.push(
        `${context} ${dimension.label} this tick=${String(
          performance?.[dimension.thisTickKey],
        )} exceeds ${String(maximumPerTick)}`,
      )
    }
    if (performance?.[dimension.maximumObservedKey] > maximumPerTick) {
      issues.push(
        `${context} maximum ${dimension.label}/tick=${String(
          performance?.[dimension.maximumObservedKey],
        )} exceeds ${String(maximumPerTick)}`,
      )
    }
    if (dimension.violationCountKey && performance?.[dimension.violationCountKey] !== 0) {
      issues.push(
        `${context} ${dimension.label} violations=${String(
          performance?.[dimension.violationCountKey],
        )}`,
      )
    }
  }
  return issues
}

export function zombieEnterRoomMeteredWorkAttributionIssues(
  performance,
  groups = ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS,
  context = 'metered navigation work',
) {
  const issues = []
  for (const group of groups) {
    const requiredKeys = [
      group.aggregateMaximumObservedKey,
      group.aggregateThisTickKey,
      group.aggregateTotalKey,
      ...group.sourceMaximumObservedKeys,
      ...group.sourceThisTickKeys,
      ...group.sourceTotalKeys,
    ]
    let valid = true
    for (const key of requiredKeys) {
      if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
        issues.push(`${context} ${key}=${String(performance?.[key])}`)
        valid = false
      }
    }
    if (!valid) continue

    for (const [period, aggregateKey, sourceKeys] of [
      ['this tick', group.aggregateThisTickKey, group.sourceThisTickKeys],
      ['total', group.aggregateTotalKey, group.sourceTotalKeys],
    ]) {
      const aggregate = performance?.[aggregateKey]
      const attributed = sourceKeys.reduce(
        (sum, key) => sum + (performance?.[key] ?? Number.NaN),
        0,
      )
      if (aggregate !== attributed) {
        issues.push(
          `${context} ${group.label} ${period} aggregate=${String(
            aggregate,
          )} does not equal attributed=${String(attributed)}`,
        )
      }
    }
    for (const [label, maximumKey, thisTickKey, totalKey] of [
      [
        'aggregate',
        group.aggregateMaximumObservedKey,
        group.aggregateThisTickKey,
        group.aggregateTotalKey,
      ],
      ...group.sourceMaximumObservedKeys.map((maximumKey, index) => [
        'source',
        maximumKey,
        group.sourceThisTickKeys[index],
        group.sourceTotalKeys[index],
      ]),
    ]) {
      if (performance[maximumKey] < performance[thisTickKey]) {
        issues.push(
          `${context} ${group.label} ${label} current work exceeds its lifetime maximum`,
        )
      }
      if (performance[totalKey] < performance[thisTickKey]) {
        issues.push(
          `${context} ${group.label} ${label} current work exceeds its lifetime total`,
        )
      }
    }
    const aggregateMaximum = performance[group.aggregateMaximumObservedKey]
    const sourceMaximums = group.sourceMaximumObservedKeys.map(
      (key) => performance[key],
    )
    const lowerBound = Math.max(...sourceMaximums)
    const upperBound = sourceMaximums.reduce((sum, value) => sum + value, 0)
    if (aggregateMaximum < lowerBound || aggregateMaximum > upperBound) {
      issues.push(
        `${context} ${group.label} maximum aggregate=${String(
          aggregateMaximum,
        )} is outside attributed range=${String(lowerBound)}..${String(upperBound)}`,
      )
    }
  }
  return issues
}

export function zombieEnterRoomVisibilityWorkIssues(
  performance,
  {
    context = 'visibility work',
    dimensions = ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS,
    groups = ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_CONSERVATION_GROUPS,
    previous = null,
  } = {},
) {
  const issues = []
  for (const dimension of dimensions) {
    const requiredKeys = [
      dimension.maximumObservedKey,
      dimension.parentMaximumObservedKey,
      dimension.parentThisTickKey,
      dimension.parentTotalKey,
      dimension.thisTickKey,
      dimension.totalKey,
    ]
    for (const key of requiredKeys) {
      if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
        issues.push(`${context} ${key}=${String(performance?.[key])}`)
      }
    }
    if (previous) {
      for (const key of [dimension.maximumObservedKey, dimension.totalKey]) {
        if (!Number.isFinite(previous?.[key]) || previous[key] < 0) {
          issues.push(`${context} baseline ${key}=${String(previous?.[key])}`)
        } else if (Number.isFinite(performance?.[key]) && performance[key] < previous[key]) {
          issues.push(
            `${context} ${key} regressed from ${String(previous[key])} ` +
              `to ${String(performance[key])}`,
          )
        }
      }
    }
    if (
      Number.isFinite(performance?.[dimension.maximumObservedKey]) &&
      Number.isFinite(performance?.[dimension.thisTickKey]) &&
      performance[dimension.maximumObservedKey] < performance[dimension.thisTickKey]
    ) {
      issues.push(`${context} ${dimension.label} current work exceeds its lifetime maximum`)
    }
    if (
      Number.isFinite(performance?.[dimension.totalKey]) &&
      Number.isFinite(performance?.[dimension.thisTickKey]) &&
      performance[dimension.totalKey] < performance[dimension.thisTickKey]
    ) {
      issues.push(`${context} ${dimension.label} current work exceeds its lifetime total`)
    }
    if (
      Number.isFinite(performance?.[dimension.maximumObservedKey]) &&
      Number.isFinite(performance?.[dimension.parentMaximumObservedKey]) &&
      performance[dimension.maximumObservedKey] >
        performance[dimension.parentMaximumObservedKey]
    ) {
      issues.push(
        `${context} maximum ${dimension.label}=${String(
          performance[dimension.maximumObservedKey],
        )} exceeds parent maximum=${String(
          performance[dimension.parentMaximumObservedKey],
        )}`,
      )
    }
  }

  for (const group of groups) {
    const currentThisTick = group.detailDimensions.reduce(
      (sum, dimension) => sum + (performance?.[dimension.thisTickKey] ?? Number.NaN),
      0,
    )
    const currentTotal = group.detailDimensions.reduce(
      (sum, dimension) => sum + (performance?.[dimension.totalKey] ?? Number.NaN),
      0,
    )
    if (
      Number.isFinite(currentThisTick) &&
      Number.isFinite(performance?.[group.aggregateThisTickKey]) &&
      currentThisTick > performance[group.aggregateThisTickKey]
    ) {
      issues.push(
        `${context} ${group.label} detailed this-tick sum=${String(
          currentThisTick,
        )} exceeds aggregate=${String(performance[group.aggregateThisTickKey])}`,
      )
    }
    if (
      Number.isFinite(currentTotal) &&
      Number.isFinite(performance?.[group.aggregateTotalKey]) &&
      currentTotal > performance[group.aggregateTotalKey]
    ) {
      issues.push(
        `${context} ${group.label} detailed total=${String(
          currentTotal,
        )} exceeds aggregate=${String(performance[group.aggregateTotalKey])}`,
      )
    }
    if (previous) {
      const detailedDelta = group.detailDimensions.reduce(
        (sum, dimension) =>
          sum + performance[dimension.totalKey] - previous[dimension.totalKey],
        0,
      )
      const aggregateDelta =
        performance[group.aggregateTotalKey] - previous[group.aggregateTotalKey]
      if (
        Number.isFinite(detailedDelta) &&
        Number.isFinite(aggregateDelta) &&
        detailedDelta > aggregateDelta
      ) {
        issues.push(
          `${context} ${group.label} detailed delta=${String(
            detailedDelta,
          )} exceeds aggregate delta=${String(aggregateDelta)}`,
        )
      }
    }
  }
  return issues
}

export function zombieEnterRoomObstacleDeltaTelemetryIssues(
  performance,
  { context = 'obstacle delta', previous = null } = {},
) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS) {
    if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (issues.length > 0) return issues

  if (
    performance.obstacleDeltaRequestCount !==
    performance.obstacleDeltaAppliedCount + performance.obstacleDeltaUnchangedCount
  ) {
    issues.push(
      `${context} request conservation failed: requested=${String(
        performance.obstacleDeltaRequestCount,
      )} applied+unchanged=${String(
        performance.obstacleDeltaAppliedCount + performance.obstacleDeltaUnchangedCount,
      )}`,
    )
  }
  if (
    performance.obstacleDeltaRevisionAdvanceCount !==
    performance.obstacleDeltaAppliedCount
  ) {
    issues.push(
      `${context} revision advances=${String(
        performance.obstacleDeltaRevisionAdvanceCount,
      )} do not equal applied=${String(performance.obstacleDeltaAppliedCount)}`,
    )
  }
  if (
    performance.obstacleDeltaRequiresRecompileCount >
    performance.obstacleDeltaAppliedCount
  ) {
    issues.push(`${context} recompile fallbacks exceed applied transactions`)
  }
  if (
    performance.obstacleDeltaViewRevisionAdvanceCount <
      performance.obstacleDeltaAppliedCount ||
    performance.obstacleDeltaViewRevisionAdvanceCount >
      performance.obstacleDeltaAppliedCount * 2
  ) {
    issues.push(
      `${context} view revision advances=${String(
        performance.obstacleDeltaViewRevisionAdvanceCount,
      )} are outside one-to-two changed views per applied transaction`,
    )
  }
  if (
    performance.obstacleDeltaObjectMaskWritesTotal !==
    performance.obstacleDeltaViewRevisionAdvanceCount
  ) {
    issues.push(
      `${context} object mask writes=${String(
        performance.obstacleDeltaObjectMaskWritesTotal,
      )} do not equal changed-view revisions=${String(
        performance.obstacleDeltaViewRevisionAdvanceCount,
      )}`,
    )
  }
  if (
    performance.obstacleDeltaAppliedRevision >
    performance.obstacleDeltaRequestedRevision
  ) {
    issues.push(`${context} applied revision exceeds requested revision`)
  }

  for (const dimension of ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS) {
    if (performance[dimension.maximumObservedKey] < performance[dimension.thisTickKey]) {
      issues.push(`${context} ${dimension.label} current work exceeds its lifetime maximum`)
    }
    if (performance[dimension.totalKey] < performance[dimension.thisTickKey]) {
      issues.push(`${context} ${dimension.label} current work exceeds its lifetime total`)
    }
  }
  if (previous) {
    for (const key of ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_MONOTONIC_KEYS) {
      if (!Number.isFinite(previous?.[key]) || previous[key] < 0) {
        issues.push(`${context} baseline ${key}=${String(previous?.[key])}`)
      } else if (performance[key] < previous[key]) {
        issues.push(
          `${context} ${key} regressed from ${String(previous[key])} ` +
            `to ${String(performance[key])}`,
        )
      }
    }
  }
  return issues
}

export function zombieEnterRoomNavigationAdmissionIssues(
  previous,
  current,
  { context = 'bounded sparse admission' } = {},
) {
  if (!previous || !current) return []
  const issues = []
  const simulationTickDelta = current.simulationTick - previous.simulationTick
  if (!Number.isFinite(simulationTickDelta) || simulationTickDelta < 0) {
    return [`${context} simulation tick delta=${String(simulationTickDelta)}`]
  }
  const maximumAdmissions =
    simulationTickDelta * ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
  for (const [label, key] of [
    ['issued intents', 'navigationIntentIssuedCount'],
    ['started searches', 'navigationSparseSearchStartedCount'],
    ['spawn demands', 'navigationIntentDemandSpawnCount'],
    ['world-change demands', 'navigationIntentDemandWorldChangedCount'],
    ['connector-change demands', 'navigationIntentDemandConnectorChangedCount'],
    ['cached-anchor-loss demands', 'navigationIntentDemandCachedAnchorLostCount'],
    ['collision-recovery demands', 'navigationIntentDemandCollisionRecoveryCount'],
    ['world-change restarts', 'navigationSparseSearchRestartedWorldChangedCount'],
    ['collision-recovery restarts', 'navigationSparseSearchRestartedCollisionRecoveryCount'],
    ['route-publication restarts', 'navigationSparseSearchRestartedRoutePublishedCount'],
  ]) {
    const delta = current[key] - previous[key]
    if (!Number.isFinite(delta) || delta < 0) {
      issues.push(`${context} ${label} delta=${String(delta)}`)
    } else if (delta > maximumAdmissions) {
      issues.push(
        `${context} ${label}=${String(delta)} exceed ${String(
          simulationTickDelta,
        )} ticks * ${String(
          ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
        )} agent admissions`,
      )
    }
  }
  const startedDelta =
    current.navigationSparseSearchStartedCount - previous.navigationSparseSearchStartedCount
  const serviceDelta =
    current.navigationSparseSearchAgentServiceSliceCountTotal -
    previous.navigationSparseSearchAgentServiceSliceCountTotal
  if (Number.isFinite(startedDelta) && Number.isFinite(serviceDelta) && startedDelta > serviceDelta) {
    issues.push(
      `${context} started searches=${String(startedDelta)} exceed metered agent services=${String(
        serviceDelta,
      )}`,
    )
  }
  const previousWorldStaleActive = previous.navigationSparseSearchWorldStaleActiveCount
  const currentWorldStaleActive = current.navigationSparseSearchWorldStaleActiveCount
  if (
    !Number.isFinite(previousWorldStaleActive) ||
    previousWorldStaleActive < 0 ||
    !Number.isFinite(currentWorldStaleActive) ||
    currentWorldStaleActive < 0
  ) {
    issues.push(
      `${context} world-stale active searches previous=${String(
        previousWorldStaleActive,
      )}, current=${String(currentWorldStaleActive)}`,
    )
  } else {
    const slotCapacity = current.navigationRefreshSlotCapacity
    if (
      Number.isFinite(slotCapacity) &&
      (previousWorldStaleActive > slotCapacity || currentWorldStaleActive > slotCapacity)
    ) {
      issues.push(
        `${context} world-stale active searches exceed slot capacity=${String(slotCapacity)}`,
      )
    }
  }
  const worldRestartDelta =
    current.navigationSparseSearchRestartedWorldChangedCount -
    previous.navigationSparseSearchRestartedWorldChangedCount
  const admittedWorldRestartDelta =
    current.navigationWorldRefreshRestartedCountTotal -
    previous.navigationWorldRefreshRestartedCountTotal
  const lazyWorldRestartDelta = worldRestartDelta - admittedWorldRestartDelta
  if (!Number.isFinite(lazyWorldRestartDelta) || lazyWorldRestartDelta < 0) {
    issues.push(
      `${context} lazy world-change restart delta=${String(
        lazyWorldRestartDelta,
      )} from total=${String(worldRestartDelta)} and admitted=${String(
        admittedWorldRestartDelta,
      )}`,
    )
  }
  if (
    Number.isFinite(lazyWorldRestartDelta) &&
    Number.isFinite(serviceDelta) &&
    lazyWorldRestartDelta > serviceDelta
  ) {
    issues.push(
      `${context} lazy world-change restarts=${String(
        lazyWorldRestartDelta,
      )} exceed metered agent services=${String(serviceDelta)}`,
    )
  }
  const navigationWorldRevisionDelta =
    current.navigationWorldRevision - previous.navigationWorldRevision
  const collisionWorldGenerationDelta =
    current.collisionWorldGeneration - previous.collisionWorldGeneration
  if (
    lazyWorldRestartDelta > 0 &&
    previousWorldStaleActive === 0 &&
    navigationWorldRevisionDelta === 0 &&
    collisionWorldGenerationDelta === 0
  ) {
    issues.push(
      `${context} lazy world-change restarts=${String(
        lazyWorldRestartDelta,
      )} have no prior stale search or world revision change`,
    )
  }
  return issues
}

export function zombieEnterRoomIntentAdmissionDeferredIssues(
  performance,
  { context = 'deferred intent admission', previous = null, requireDrained = false } = {},
) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_TELEMETRY_KEYS) {
    if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (issues.length > 0) return issues

  const marked = performance.navigationIntentAdmissionDeferredMarkedCount
  const promoted = performance.navigationIntentAdmissionDeferredPromotedCount
  const canceled = performance.navigationIntentAdmissionDeferredCanceledCount
  const pending = performance.navigationIntentAdmissionDeferredPendingCount
  const promotedThisTick = performance.navigationIntentAdmissionDeferredPromotedCountThisTick
  const promotionBudget = performance.navigationIntentAdmissionDeferredPromotionBudgetPerTick
  const maximumPromoted =
    performance.navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick
  const queueOperationsThisTick =
    performance.navigationIntentAdmissionDeferredQueueOperationCountThisTick
  const queueOperationsTotal =
    performance.navigationIntentAdmissionDeferredQueueOperationCountTotal
  const maximumQueueOperations =
    performance.navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick
  const admissionBudget = performance.navigationRefreshAdmissionBudgetPerTick
  const selectedReasonPromotions =
    ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_PROMOTION_KEYS.reduce(
      (sum, key) => sum + performance[key],
      0,
    )

  if (
    promotionBudget !== ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick ||
    promotionBudget !== admissionBudget
  ) {
    issues.push(
      `${context} promotion budget=${String(promotionBudget)} expected unified ${String(
        admissionBudget,
      )}`,
    )
  }

  if (marked !== promoted + canceled + pending) {
    issues.push(
      `${context} conservation failed: marked=${String(marked)} ` +
        `promoted+canceled+pending=${String(promoted + canceled + pending)}`,
    )
  }
  if (queueOperationsTotal !== marked + promoted + canceled) {
    issues.push(
      `${context} queue-operation conservation failed: operations=${String(
        queueOperationsTotal,
      )} marked+promoted+canceled=${String(marked + promoted + canceled)}`,
    )
  }
  if (selectedReasonPromotions !== promoted) {
    issues.push(
      `${context} selected-reason promotions=${String(
        selectedReasonPromotions,
      )} do not equal promoted=${String(promoted)}`,
    )
  }
  if (promotedThisTick !== performance.navigationRefreshAdmissionCountThisTick) {
    issues.push(
      `${context} promoted this tick=${String(
        promotedThisTick,
      )} does not equal unified admissions=${String(
        performance.navigationRefreshAdmissionCountThisTick,
      )}`,
    )
  }
  if (promoted !== performance.navigationRefreshAdmissionCountTotal) {
    issues.push(
      `${context} promoted total=${String(promoted)} does not equal unified admissions=${String(
        performance.navigationRefreshAdmissionCountTotal,
      )}`,
    )
  }
  if (promotedThisTick > promotionBudget) {
    issues.push(
      `${context} promoted this tick=${String(promotedThisTick)} exceeds budget=${String(
        promotionBudget,
      )}`,
    )
  }
  if (maximumPromoted > promotionBudget) {
    issues.push(
      `${context} maximum promoted per tick=${String(maximumPromoted)} exceeds budget=${String(
        promotionBudget,
      )}`,
    )
  }
  if (promotedThisTick > maximumPromoted || maximumPromoted > promoted) {
    issues.push(
      `${context} promoted current=${String(promotedThisTick)}, maximum=${String(
        maximumPromoted,
      )}, total=${String(promoted)}`,
    )
  }
  if (
    queueOperationsThisTick > maximumQueueOperations ||
    maximumQueueOperations > queueOperationsTotal
  ) {
    issues.push(
      `${context} queue operations current=${String(
        queueOperationsThisTick,
      )}, maximum=${String(maximumQueueOperations)}, total=${String(queueOperationsTotal)}`,
    )
  }
  if (pending > performance.navigationRefreshSlotCapacity) {
    issues.push(
      `${context} pending=${String(pending)} exceeds slot capacity=${String(
        performance.navigationRefreshSlotCapacity,
      )}`,
    )
  }
  if (requireDrained && pending !== 0) {
    issues.push(`${context} pending deferred admissions=${String(pending)} expected 0`)
  }

  if (previous) {
    for (const key of ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_MONOTONIC_KEYS) {
      if (!Number.isFinite(previous?.[key]) || previous[key] < 0) {
        issues.push(`${context} baseline ${key}=${String(previous?.[key])}`)
      } else if (performance[key] < previous[key]) {
        issues.push(
          `${context} ${key} regressed from ${String(previous[key])} ` +
            `to ${String(performance[key])}`,
        )
      }
    }
    const tickDelta = performance.simulationTick - previous.simulationTick
    const promotedDelta =
      promoted - previous.navigationIntentAdmissionDeferredPromotedCount
    const maximumDelta = Math.max(0, tickDelta) * promotionBudget
    if (!Number.isFinite(tickDelta) || tickDelta < 0) {
      issues.push(`${context} simulation tick delta=${String(tickDelta)}`)
    } else if (promotedDelta > maximumDelta) {
      issues.push(
        `${context} promoted delta=${String(promotedDelta)} exceeds ${String(
          tickDelta,
        )} ticks * ${String(promotionBudget)}`,
      )
    }
    const queueOperationDelta =
      queueOperationsTotal - previous.navigationIntentAdmissionDeferredQueueOperationCountTotal
    const markedDelta = marked - previous.navigationIntentAdmissionDeferredMarkedCount
    const canceledDelta = canceled - previous.navigationIntentAdmissionDeferredCanceledCount
    if (queueOperationDelta !== markedDelta + promotedDelta + canceledDelta) {
      issues.push(
        `${context} queue-operation delta=${String(
          queueOperationDelta,
        )} does not equal marked+promoted+canceled delta=${String(
          markedDelta + promotedDelta + canceledDelta,
        )}`,
      )
    }
    const issuedDelta =
      performance.navigationIntentIssuedCount - previous.navigationIntentIssuedCount
    if (issuedDelta > promotedDelta) {
      issues.push(
        `${context} issued-intent delta=${String(issuedDelta)} exceeds promoted delta=${String(
          promotedDelta,
        )}`,
      )
    }
    for (const [demandKey, promotionKey] of ZOMBIE_ENTER_ROOM_INTENT_ADMISSION_REASON_CAUSAL_PAIRS) {
      const demandDelta = performance[demandKey] - previous[demandKey]
      const reasonPromotionDelta = performance[promotionKey] - previous[promotionKey]
      if (demandDelta > reasonPromotionDelta) {
        issues.push(
          `${context} ${demandKey} delta=${String(
            demandDelta,
          )} exceeds selected promotions=${String(reasonPromotionDelta)}`,
        )
      }
    }
    for (const [restartKey, promotionKey] of [
      [
        'navigationSparseSearchRestartedCollisionRecoveryCount',
        'navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount',
      ],
    ]) {
      const restartDelta = performance[restartKey] - previous[restartKey]
      const reasonPromotionDelta = performance[promotionKey] - previous[promotionKey]
      if (restartDelta > reasonPromotionDelta) {
        issues.push(
          `${context} ${restartKey} delta=${String(
            restartDelta,
          )} exceeds selected promotions=${String(reasonPromotionDelta)}`,
        )
      }
    }
  }
  return issues
}

export function zombieEnterRoomObstacleRefreshIssues(
  performance,
  { context = 'deferred obstacle refresh', previous = null, requireDrained = false } = {},
) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS) {
    if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (issues.length > 0) return issues
  const marked = performance.navigationObstacleRefreshDeferredMarkedCount
  const promoted = performance.navigationObstacleRefreshDeferredPromotedCount
  const canceled = performance.navigationObstacleRefreshDeferredCanceledCount
  const pending = performance.navigationObstacleRefreshDeferredPendingCount
  const promotedThisTick =
    performance.navigationObstacleRefreshDeferredPromotedCountThisTick
  const maximumPromoted =
    performance.navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick
  const promotionBudget =
    performance.navigationObstacleRefreshDeferredPromotionBudgetPerTick
  const discoveryAppliedRevision =
    performance.navigationObstacleRefreshDiscoveryAppliedRevision
  const discoveryEpochRevision = performance.navigationObstacleRefreshDiscoveryEpochRevision
  const discoveryRemaining =
    performance.navigationObstacleRefreshDiscoveryRemainingSlotCount
  if (marked !== promoted + canceled + pending) {
    issues.push(
      `${context} conservation failed: marked=${String(marked)} ` +
        `promoted+canceled+pending=${String(promoted + canceled + pending)}`,
    )
  }
  if (
    promotionBudget !== ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
  ) {
    issues.push(
      `${context} promotion budget=${String(promotionBudget)} expected ${String(
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      )}`,
    )
  }
  if (promotedThisTick > promotionBudget) {
    issues.push(
      `${context} promoted this tick=${String(promotedThisTick)} exceeds budget=${String(
        promotionBudget,
      )}`,
    )
  }
  if (maximumPromoted > promotionBudget) {
    issues.push(
      `${context} maximum promoted per tick=${String(maximumPromoted)} exceeds budget=${String(
        promotionBudget,
      )}`,
    )
  }
  if (discoveryAppliedRevision > discoveryEpochRevision) {
    issues.push(
      `${context} applied discovery revision=${String(
        discoveryAppliedRevision,
      )} exceeds epoch revision=${String(discoveryEpochRevision)}`,
    )
  }
  if (discoveryEpochRevision > performance.obstacleDeltaAppliedRevision) {
    issues.push(
      `${context} discovery epoch revision=${String(
        discoveryEpochRevision,
      )} exceeds applied obstacle revision=${String(
        performance.obstacleDeltaAppliedRevision,
      )}`,
    )
  }
  if (discoveryRemaining === 0 && discoveryAppliedRevision !== discoveryEpochRevision) {
    issues.push(
      `${context} completed discovery applied revision=${String(
        discoveryAppliedRevision,
      )} does not equal epoch=${String(discoveryEpochRevision)}`,
    )
  }
  if (requireDrained && pending !== 0) {
    issues.push(`${context} pending deferred refreshes=${String(pending)} expected 0`)
  }
  if (requireDrained && discoveryRemaining !== 0) {
    issues.push(`${context} discovery remaining slots=${String(discoveryRemaining)} expected 0`)
  }
  if (
    requireDrained &&
    discoveryAppliedRevision !== performance.obstacleDeltaAppliedRevision
  ) {
    issues.push(
      `${context} drained discovery revision=${String(
        discoveryAppliedRevision,
      )} expected obstacle revision=${String(performance.obstacleDeltaAppliedRevision)}`,
    )
  }
  if (previous) {
    for (const key of ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_MONOTONIC_KEYS) {
      if (!Number.isFinite(previous?.[key]) || previous[key] < 0) {
        issues.push(`${context} baseline ${key}=${String(previous?.[key])}`)
      } else if (performance[key] < previous[key]) {
        issues.push(
          `${context} ${key} regressed from ${String(previous[key])} ` +
            `to ${String(performance[key])}`,
        )
      }
    }
    const tickDelta = performance.simulationTick - previous.simulationTick
    const promotedDelta =
      performance.navigationObstacleRefreshDeferredPromotedCount -
      previous.navigationObstacleRefreshDeferredPromotedCount
    const markedDelta =
      performance.navigationObstacleRefreshDeferredMarkedCount -
      previous.navigationObstacleRefreshDeferredMarkedCount
    const canceledDelta =
      performance.navigationObstacleRefreshDeferredCanceledCount -
      previous.navigationObstacleRefreshDeferredCanceledCount
    const maximumDelta = Math.max(0, tickDelta) * promotionBudget
    if (Number.isFinite(promotedDelta) && promotedDelta > maximumDelta) {
      issues.push(
        `${context} promoted delta=${String(promotedDelta)} exceeds ${String(
          tickDelta,
        )} ticks * ${String(promotionBudget)}`,
      )
    }
  }
  return issues
}

export function zombieEnterRoomWorldRefreshIssues(
  performance,
  { context = 'world refresh admission', previous = null, requireDrained = false } = {},
) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_WORLD_REFRESH_TELEMETRY_KEYS) {
    if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (issues.length > 0) return issues

  const admissionGeneration = performance.navigationWorldRefreshAdmissionGeneration
  const epochGeneration = performance.navigationWorldRefreshEpochGeneration
  const inspectionRemaining = performance.navigationWorldRefreshInspectionRemaining
  const minimumAppliedGeneration = performance.navigationWorldRefreshMinimumAppliedGeneration
  const pending = performance.navigationWorldRefreshPendingCount
  const promotedThisTick = performance.navigationWorldRefreshPromotedCountThisTick
  const promotedTotal = performance.navigationWorldRefreshPromotedCountTotal
  const maximumPromoted =
    performance.navigationWorldRefreshMaximumPromotedCountObservedPerTick
  const restartedThisTick = performance.navigationWorldRefreshRestartedCountThisTick
  const restartedTotal = performance.navigationWorldRefreshRestartedCountTotal
  const admissionBudget = performance.navigationRefreshAdmissionBudgetPerTick
  const capacity = performance.navigationRefreshSlotCapacity

  if (admissionGeneration > epochGeneration) {
    issues.push(
      `${context} admission generation=${String(admissionGeneration)} exceeds epoch=${String(
        epochGeneration,
      )}`,
    )
  }
  if (epochGeneration > performance.collisionWorldGeneration) {
    issues.push(
      `${context} epoch generation=${String(epochGeneration)} exceeds collision world=${String(
        performance.collisionWorldGeneration,
      )}`,
    )
  }
  if (inspectionRemaining === 0 && admissionGeneration !== epochGeneration) {
    issues.push(
      `${context} completed scan admission generation=${String(
        admissionGeneration,
      )} does not equal epoch=${String(epochGeneration)}`,
    )
  }
  if (pending === 0 && minimumAppliedGeneration !== performance.collisionWorldGeneration) {
    issues.push(
      `${context} drained minimum generation=${String(
        minimumAppliedGeneration,
      )} does not equal collision world=${String(performance.collisionWorldGeneration)}`,
    )
  }
  if (pending > capacity || inspectionRemaining > capacity) {
    issues.push(`${context} pending/inspection work exceeds slot capacity=${String(capacity)}`)
  }
  if (promotedThisTick > admissionBudget || maximumPromoted > admissionBudget) {
    issues.push(
      `${context} promoted current=${String(promotedThisTick)}, maximum=${String(
        maximumPromoted,
      )} exceed budget=${String(admissionBudget)}`,
    )
  }
  if (promotedThisTick > maximumPromoted || maximumPromoted > promotedTotal) {
    issues.push(
      `${context} promoted current=${String(promotedThisTick)}, maximum=${String(
        maximumPromoted,
      )}, total=${String(promotedTotal)}`,
    )
  }
  if (restartedThisTick > promotedThisTick || restartedTotal > promotedTotal) {
    issues.push(
      `${context} restarted current=${String(restartedThisTick)}, total=${String(
        restartedTotal,
      )} exceed promoted current=${String(promotedThisTick)}, total=${String(promotedTotal)}`,
    )
  }
  if (
    promotedThisTick > performance.navigationIntentAdmissionDeferredPromotedCountThisTick ||
    promotedTotal > performance.navigationIntentAdmissionDeferredPromotedCount
  ) {
    issues.push(`${context} world attribution exceeds generic intent admissions`)
  }
  if (requireDrained && (pending !== 0 || inspectionRemaining !== 0)) {
    issues.push(
      `${context} did not drain: pending=${String(pending)}, inspections=${String(
        inspectionRemaining,
      )}`,
    )
  }
  if (
    requireDrained &&
    (admissionGeneration !== performance.collisionWorldGeneration ||
      epochGeneration !== performance.collisionWorldGeneration)
  ) {
    issues.push(
      `${context} did not acknowledge collision world generation=${String(
        performance.collisionWorldGeneration,
      )}`,
    )
  }

  if (previous) {
    for (const key of ZOMBIE_ENTER_ROOM_WORLD_REFRESH_MONOTONIC_KEYS) {
      if (!Number.isFinite(previous?.[key]) || previous[key] < 0) {
        issues.push(`${context} baseline ${key}=${String(previous?.[key])}`)
      } else if (performance[key] < previous[key]) {
        issues.push(
          `${context} ${key} regressed from ${String(previous[key])} ` +
            `to ${String(performance[key])}`,
        )
      }
    }
    const tickDelta = performance.simulationTick - previous.simulationTick
    const promotedDelta =
      promotedTotal - previous.navigationWorldRefreshPromotedCountTotal
    const restartedDelta =
      restartedTotal - previous.navigationWorldRefreshRestartedCountTotal
    const admissionDelta =
      performance.navigationRefreshAdmissionCountTotal -
      previous.navigationRefreshAdmissionCountTotal
    const worldDemandDelta =
      performance.navigationIntentDemandWorldChangedCount -
      previous.navigationIntentDemandWorldChangedCount
    const sparseWorldRestartDelta =
      performance.navigationSparseSearchRestartedWorldChangedCount -
      previous.navigationSparseSearchRestartedWorldChangedCount
    const maximumDelta = Math.max(0, tickDelta) * admissionBudget
    if (!Number.isFinite(tickDelta) || tickDelta < 0) {
      issues.push(`${context} simulation tick delta=${String(tickDelta)}`)
    } else if (promotedDelta > maximumDelta) {
      issues.push(
        `${context} promotion delta=${String(promotedDelta)} exceeds ${String(
          tickDelta,
        )} ticks * ${String(admissionBudget)}`,
      )
    }
    if (promotedDelta > admissionDelta) {
      issues.push(
        `${context} promotion delta=${String(promotedDelta)} exceeds admission delta=${String(
          admissionDelta,
        )}`,
      )
    }
    if (restartedDelta > promotedDelta || worldDemandDelta > promotedDelta) {
      issues.push(`${context} world restart/demand deltas exceed promotions`)
    }
    if (restartedDelta > sparseWorldRestartDelta) {
      issues.push(
        `${context} admitted world restarts=${String(
          restartedDelta,
        )} exceed sparse world restarts=${String(sparseWorldRestartDelta)}`,
      )
    }
  }
  return issues
}

export function zombieEnterRoomTargetRouteIssues(
  performance,
  {
    activeZombieCount = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    context = 'shared target route',
    expectation = null,
    previous = null,
  } = {},
) {
  const issues = []
  const validateSnapshot = (label, snapshot) => {
    for (const key of ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS) {
      if (!Number.isInteger(snapshot?.[key]) || snapshot[key] < 0) {
        issues.push(`${context} ${label} ${key}=${String(snapshot?.[key])}`)
      }
    }
    if (!['invalidated', 'pending', 'ready'].includes(snapshot?.navigationSparseTargetUpdateStatus)) {
      issues.push(
        `${context} ${label} target-update status=${String(
          snapshot?.navigationSparseTargetUpdateStatus,
        )}`,
      )
    }
  }
  validateSnapshot('current', performance)
  if (previous) validateSnapshot('baseline', previous)
  if (!Number.isInteger(activeZombieCount) || activeZombieCount <= 0) {
    issues.push(`${context} active zombie count=${String(activeZombieCount)}`)
  }
  if (issues.length > 0) return issues
  if (
    (expectation === 'ready' || expectation === 'stable') &&
    performance.navigationTargetCommittedRouteGeneration <= 0
  ) {
    issues.push(
      `${context} current committed route generation=${String(
        performance.navigationTargetCommittedRouteGeneration,
      )} is uncommitted`,
    )
  }
  if (!previous) {
    if (
      (expectation === 'ready' || expectation === 'stable') &&
      performance.navigationSparseTargetUpdateStatus !== 'ready'
    ) {
      issues.push(
        `${context} target-update status=${String(
          performance.navigationSparseTargetUpdateStatus,
        )} expected ready`,
      )
    } else if (expectation !== null && expectation !== 'ready' && expectation !== 'stable') {
      issues.push(`${context} ${String(expectation)} expectation requires a baseline`)
    }
    return issues
  }

  const requestedDelta =
    performance.navigationTargetRequestedRevision - previous.navigationTargetRequestedRevision
  const committedDelta =
    performance.navigationTargetCommittedRouteGeneration -
    previous.navigationTargetCommittedRouteGeneration
  const routePublishedRestartDelta =
    performance.navigationSparseSearchRestartedRoutePublishedCount -
    previous.navigationSparseSearchRestartedRoutePublishedCount
  const agentServiceDelta =
    performance.navigationSparseSearchAgentServiceSliceCountTotal -
    previous.navigationSparseSearchAgentServiceSliceCountTotal
  for (const [label, delta] of [
    ['requested revision', requestedDelta],
    ['committed generation', committedDelta],
    ['route-publication restart', routePublishedRestartDelta],
    ['agent service', agentServiceDelta],
  ]) {
    if (!Number.isInteger(delta) || delta < 0) {
      issues.push(`${context} ${label} delta=${String(delta)}`)
    }
  }
  if (routePublishedRestartDelta > agentServiceDelta) {
    issues.push(
      `${context} route-publication restarts=${String(
        routePublishedRestartDelta,
      )} exceed bounded agent service slices=${String(agentServiceDelta)}`,
    )
  }
  const maximumRoutePublishedRestarts = committedDelta * activeZombieCount
  if (routePublishedRestartDelta > maximumRoutePublishedRestarts) {
    issues.push(
      `${context} route-publication restarts=${String(
        routePublishedRestartDelta,
      )} exceed ${String(committedDelta)} committed publications * ${String(
        activeZombieCount,
      )} active zombies=${String(maximumRoutePublishedRestarts)}`,
    )
  }
  if (expectation === 'stable') {
    for (const [label, delta] of [
      ['requested revision', requestedDelta],
      ['committed generation', committedDelta],
      ['route-publication restart', routePublishedRestartDelta],
    ]) {
      if (delta !== 0) issues.push(`${context} ${label} delta=${String(delta)} expected 0`)
    }
    if (
      previous.navigationSparseTargetUpdateStatus !== 'ready' ||
      performance.navigationSparseTargetUpdateStatus !== 'ready'
    ) {
      issues.push(`${context} stable route is not ready at both boundaries`)
    }
    if (previous.navigationTargetCommittedRouteGeneration <= 0) {
      issues.push(
        `${context} baseline committed route generation=${String(
          previous.navigationTargetCommittedRouteGeneration,
        )} is uncommitted`,
      )
    }
  } else if (expectation === 'published') {
    if (committedDelta <= 0) {
      issues.push(`${context} committed generation delta=${String(committedDelta)} expected >0`)
    }
    if (performance.navigationSparseTargetUpdateStatus !== 'ready') {
      issues.push(
        `${context} published route target-update status=${String(
          performance.navigationSparseTargetUpdateStatus,
        )}`,
      )
    }
  } else if (expectation === 'ready') {
    if (performance.navigationSparseTargetUpdateStatus !== 'ready') {
      issues.push(
        `${context} target-update status=${String(
          performance.navigationSparseTargetUpdateStatus,
        )} expected ready`,
      )
    }
  } else if (expectation !== null) {
    issues.push(`${context} target route expectation=${String(expectation)}`)
  }
  return issues
}

export function zombieEnterRoomRefreshAdmissionIssues(
  performance,
  { context = 'navigation refresh admission', previous = null, requireDrained = false } = {},
) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS) {
    if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
      issues.push(`${context} ${key}=${String(performance?.[key])}`)
    }
  }
  if (issues.length > 0) return issues

  const budget = performance.navigationRefreshAdmissionBudgetPerTick
  const slotCapacity = performance.navigationRefreshSlotCapacity
  const admissionThisTick = performance.navigationRefreshAdmissionCountThisTick
  const admissionTotal = performance.navigationRefreshAdmissionCountTotal
  const maximumAdmission =
    performance.navigationRefreshAdmissionMaximumCountObservedPerTick
  const inspectionBudget = performance.navigationRefreshCandidateInspectionBudgetPerTick
  const inspectionsThisTick = performance.navigationRefreshCandidateInspectionsThisTick
  const inspectionsTotal = performance.navigationRefreshCandidateInspectionsTotal
  const maximumInspections =
    performance.navigationRefreshCandidateInspectionsMaximumObservedPerTick
  const obstacleDiscoveryRemaining =
    performance.navigationObstacleRefreshDiscoveryRemainingSlotCount
  const obstaclePromotedThisTick =
    performance.navigationObstacleRefreshDeferredPromotedCountThisTick
  const obstaclePromotedTotal = performance.navigationObstacleRefreshDeferredPromotedCount
  const worldInspectionRemaining = performance.navigationWorldRefreshInspectionRemaining
  const worldPending = performance.navigationWorldRefreshPendingCount
  const worldPromotedThisTick = performance.navigationWorldRefreshPromotedCountThisTick
  const worldPromotedTotal = performance.navigationWorldRefreshPromotedCountTotal

  if (!Number.isInteger(slotCapacity) || slotCapacity <= 0) {
    issues.push(`${context} refresh slot capacity=${String(slotCapacity)}`)
  }
  if (
    performance.navigationObstacleRefreshDeferredPendingCount > slotCapacity ||
    obstacleDiscoveryRemaining > slotCapacity ||
    worldPending > slotCapacity ||
    worldInspectionRemaining > slotCapacity
  ) {
    issues.push(`${context} refresh pending/discovery work exceeds slot capacity=${String(slotCapacity)}`)
  }

  if (budget !== ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick) {
    issues.push(
      `${context} admission budget=${String(budget)} expected ${String(
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick,
      )}`,
    )
  }
  if (admissionThisTick > budget) {
    issues.push(
      `${context} admissions this tick=${String(admissionThisTick)} exceed budget=${String(
        budget,
      )}`,
    )
  }
  if (maximumAdmission > budget) {
    issues.push(
      `${context} maximum admissions per tick=${String(maximumAdmission)} exceeds budget=${String(
        budget,
      )}`,
    )
  }
  if (
    inspectionBudget !==
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.refreshCandidateInspectionBudgetPerTick
  ) {
    issues.push(
      `${context} candidate inspection budget=${String(inspectionBudget)} expected ${String(
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.refreshCandidateInspectionBudgetPerTick,
      )}`,
    )
  }
  if (inspectionsThisTick > inspectionBudget) {
    issues.push(
      `${context} candidate inspections this tick=${String(
        inspectionsThisTick,
      )} exceed budget=${String(inspectionBudget)}`,
    )
  }
  if (maximumInspections > inspectionBudget) {
    issues.push(
      `${context} maximum candidate inspections per tick=${String(
        maximumInspections,
      )} exceed budget=${String(inspectionBudget)}`,
    )
  }
  if (inspectionsThisTick > maximumInspections) {
    issues.push(
      `${context} candidate inspections this tick=${String(
        inspectionsThisTick,
      )} exceed lifetime maximum=${String(maximumInspections)}`,
    )
  }
  if (inspectionsThisTick > inspectionsTotal) {
    issues.push(
      `${context} candidate inspections this tick=${String(
        inspectionsThisTick,
      )} exceed lifetime total=${String(inspectionsTotal)}`,
    )
  }
  if (admissionThisTick > inspectionsThisTick) {
    issues.push(
      `${context} admissions this tick=${String(
        admissionThisTick,
      )} exceed candidate inspections=${String(inspectionsThisTick)}`,
    )
  }
  if (admissionTotal > inspectionsTotal) {
    issues.push(
      `${context} admissions total=${String(admissionTotal)} exceed candidate inspections=${String(
        inspectionsTotal,
      )}`,
    )
  }
  if (
    Number.isFinite(obstaclePromotedThisTick) &&
    Math.max(obstaclePromotedThisTick, worldPromotedThisTick) > admissionThisTick
  ) {
    issues.push(
      `${context} category this-tick promotions obstacle=${String(
        obstaclePromotedThisTick,
      )}, world=${String(worldPromotedThisTick)}, admissions=${String(admissionThisTick)}`,
    )
  }
  if (
    Number.isFinite(obstaclePromotedTotal) &&
    Math.max(obstaclePromotedTotal, worldPromotedTotal) > admissionTotal
  ) {
    issues.push(
      `${context} category total promotions obstacle=${String(
        obstaclePromotedTotal,
      )}, world=${String(worldPromotedTotal)}, admissions=${String(admissionTotal)}`,
    )
  }
  if (requireDrained && obstacleDiscoveryRemaining !== 0) {
    issues.push(
      `${context} obstacle discovery remaining=${String(obstacleDiscoveryRemaining)} expected 0`,
    )
  }
  if (requireDrained && (worldPending !== 0 || worldInspectionRemaining !== 0)) {
    issues.push(
      `${context} world refresh pending=${String(worldPending)}, inspections=${String(
        worldInspectionRemaining,
      )} expected 0`,
    )
  }
  if (
    previous &&
    admissionThisTick === 0 &&
    performance.navigationObstacleRefreshDeferredPendingCount === 0 &&
    obstacleDiscoveryRemaining === 0 &&
    worldPending === 0 &&
    worldInspectionRemaining === 0 &&
    performance.navigationWorldRefreshMinimumAppliedGeneration ===
      performance.collisionWorldGeneration &&
    previous.navigationObstacleRefreshDeferredPendingCount === 0 &&
    previous.navigationObstacleRefreshDiscoveryRemainingSlotCount === 0 &&
    previous.navigationWorldRefreshPendingCount === 0 &&
    previous.navigationWorldRefreshInspectionRemaining === 0 &&
    previous.collisionWorldGeneration === performance.collisionWorldGeneration &&
    inspectionsThisTick !== 0
  ) {
    issues.push(
      `${context} idle refresh fast path inspected ${String(inspectionsThisTick)} candidates`,
    )
  }

  if (previous) {
    if (previous.navigationRefreshSlotCapacity !== slotCapacity) {
      issues.push(
        `${context} refresh slot capacity changed from ${String(
          previous.navigationRefreshSlotCapacity,
        )} to ${String(slotCapacity)}`,
      )
    }
    for (const key of ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_MONOTONIC_KEYS) {
      if (!Number.isFinite(previous?.[key]) || previous[key] < 0) {
        issues.push(`${context} baseline ${key}=${String(previous?.[key])}`)
      } else if (performance[key] < previous[key]) {
        issues.push(
          `${context} ${key} regressed from ${String(previous[key])} ` +
            `to ${String(performance[key])}`,
        )
      }
    }
    const tickDelta = performance.simulationTick - previous.simulationTick
    const maximumDelta = Math.max(0, tickDelta) * budget
    const admissionDelta =
      performance.navigationRefreshAdmissionCountTotal -
      previous.navigationRefreshAdmissionCountTotal
    const inspectionDelta =
      performance.navigationRefreshCandidateInspectionsTotal -
      previous.navigationRefreshCandidateInspectionsTotal
    if (!Number.isFinite(tickDelta) || tickDelta < 0) {
      issues.push(`${context} simulation tick delta=${String(tickDelta)}`)
    } else if (admissionDelta > maximumDelta) {
      issues.push(
        `${context} admission delta=${String(admissionDelta)} exceeds ${String(
          tickDelta,
        )} ticks * ${String(budget)}`,
      )
    }
    const maximumInspectionDelta = Math.max(0, tickDelta) * inspectionBudget
    if (inspectionDelta > maximumInspectionDelta) {
      issues.push(
        `${context} candidate inspection delta=${String(
          inspectionDelta,
        )} exceeds ${String(tickDelta)} ticks * ${String(inspectionBudget)}`,
      )
    }
  }
  return issues
}

export function reduceZombieEnterRoomObstacleDeltaContract(
  baseline,
  current,
  {
    context = 'measured obstacle delta',
    appliedPerformance = null,
    requestResult,
    roomSoak,
    transaction,
    transactionBaseline,
  } = {},
) {
  const issues = [
    ...zombieEnterRoomObstacleDeltaTelemetryIssues(baseline, {
      context: `${context} baseline`,
    }),
    ...zombieEnterRoomObstacleDeltaTelemetryIssues(current, {
      context,
      previous: baseline,
    }),
    ...zombieEnterRoomObstacleRefreshIssues(baseline, {
      context: `${context} deferred-refresh baseline`,
    }),
    ...zombieEnterRoomObstacleRefreshIssues(current, {
      context: `${context} deferred refresh`,
      previous: baseline,
      requireDrained: true,
    }),
    ...zombieEnterRoomIntentAdmissionDeferredIssues(baseline, {
      context: `${context} intent-admission baseline`,
    }),
    ...zombieEnterRoomIntentAdmissionDeferredIssues(current, {
      context: `${context} intent admission`,
      previous: baseline,
      requireDrained: true,
    }),
    ...zombieEnterRoomWorldRefreshIssues(baseline, {
      context: `${context} world-refresh baseline`,
    }),
    ...zombieEnterRoomWorldRefreshIssues(current, {
      context: `${context} world refresh`,
      previous: baseline,
      requireDrained: true,
    }),
    ...zombieEnterRoomTargetRouteIssues(baseline, {
      context: `${context} shared-target baseline`,
      expectation: 'ready',
    }),
    ...zombieEnterRoomTargetRouteIssues(current, {
      context: `${context} shared target route`,
      expectation: 'stable',
      previous: baseline,
    }),
    ...zombieEnterRoomRefreshAdmissionIssues(baseline, {
      context: `${context} refresh-admission baseline`,
    }),
    ...zombieEnterRoomRefreshAdmissionIssues(current, {
      context: `${context} refresh admission`,
      previous: baseline,
      requireDrained: true,
    }),
  ]
  const deltaKeys = [
    'collisionWorldGeneration',
    ...ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS,
    'navigationWorldRevision',
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_MONOTONIC_KEYS,
  ]
  const deltas = Object.fromEntries(
    deltaKeys.map((key) => [key, current?.[key] - baseline?.[key]]),
  )
  if (issues.length > 0) return { deltas, issues: [...new Set(issues)] }

  for (const key of [
    'collisionWorldGeneration',
    'navigationWorldRevision',
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_AGENT_CAUSAL_KEYS,
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS,
  ]) {
    if (!Number.isFinite(transactionBaseline?.[key]) || transactionBaseline[key] < 0) {
      issues.push(
        `${context} transaction baseline ${key}=${String(transactionBaseline?.[key])}`,
      )
    }
    if (!Number.isFinite(transaction?.[key]) || transaction[key] < 0) {
      issues.push(`${context} transaction ${key}=${String(transaction?.[key])}`)
    }
  }
  if (issues.length > 0) return { deltas, issues: [...new Set(issues)] }

  for (const [key, expected] of [
    ['obstacleDeltaRequestCount', 1],
    ['obstacleDeltaAppliedCount', 1],
    ['obstacleDeltaUnchangedCount', 0],
    ['obstacleDeltaRequiresRecompileCount', 0],
    ['obstacleDeltaRevisionAdvanceCount', 1],
    ['obstacleDeltaRequestedRevision', 1],
    ['obstacleDeltaAppliedRevision', 1],
    ['collisionWorldGeneration', 0],
    ['navigationWorldRevision', 1],
    ['navigationTargetRequestedRevision', 0],
    ['navigationTargetCommittedRouteGeneration', 0],
    ['navigationSparseSearchRestartedRoutePublishedCount', 0],
  ]) {
    if (deltas[key] !== expected) {
      issues.push(`${context} ${key} delta=${String(deltas[key])} expected ${String(expected)}`)
    }
  }
  for (const [key, expected] of [
    ['collisionWorldGeneration', 0],
    ['navigationWorldRevision', 1],
    ['navigationTargetRequestedRevision', 0],
    ['navigationTargetCommittedRouteGeneration', 0],
    ['navigationSparseSearchRestartedRoutePublishedCount', 0],
    ['obstacleDeltaRequestCount', 1],
    ['obstacleDeltaAppliedCount', 1],
    ['obstacleDeltaUnchangedCount', 0],
    ['obstacleDeltaRequiresRecompileCount', 0],
    ['obstacleDeltaRevisionAdvanceCount', 1],
    ['obstacleDeltaRequestedRevision', 1],
    ['obstacleDeltaAppliedRevision', 1],
  ]) {
    const transactionDelta = transaction[key] - transactionBaseline[key]
    if (transactionDelta !== expected) {
      issues.push(
        `${context} transaction ${key} delta=${String(transactionDelta)} ` +
          `expected ${String(expected)}`,
      )
    }
  }
  const transactionRestartDeltas = Object.fromEntries(
    ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_AGENT_CAUSAL_KEYS.map((key) => [
      key,
      transaction[key] - transactionBaseline[key],
    ]),
  )
  if (transactionRestartDeltas.navigationIntentDemandWorldChangedCount !== 0) {
    issues.push(
      `${context} transaction synchronously issued ${String(
        transactionRestartDeltas.navigationIntentDemandWorldChangedCount,
      )} per-agent world-change demands`,
    )
  }
  if (transactionRestartDeltas.navigationSparseSearchInvalidatedCount !== 0) {
    issues.push(
      `${context} transaction synchronously invalidated ${String(
        transactionRestartDeltas.navigationSparseSearchInvalidatedCount,
      )} agent searches`,
    )
  }
  if (transactionRestartDeltas.navigationSparseSearchRestartedWorldChangedCount !== 0) {
    issues.push(
      `${context} transaction synchronously restarted ${String(
        transactionRestartDeltas.navigationSparseSearchRestartedWorldChangedCount,
      )} agent searches for the world change`,
    )
  }
  const transactionRestartReasonDelta =
    transactionRestartDeltas.navigationSparseSearchRestartedCollisionRecoveryCount +
    transactionRestartDeltas.navigationSparseSearchRestartedRoutePublishedCount +
    transactionRestartDeltas.navigationSparseSearchRestartedWorldChangedCount
  if (
    transactionRestartDeltas.navigationSparseSearchRestartedCount !==
    transactionRestartReasonDelta
  ) {
    issues.push(`${context} transaction restart reasons do not conserve their total`)
  }
  if (
    transactionRestartDeltas.navigationSparseSearchInvalidatedCount !==
    transactionRestartDeltas.navigationSparseSearchRestartedCount
  ) {
    issues.push(`${context} transaction invalidations do not conserve restart causes`)
  }
  for (const key of ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS.filter(
    (candidate) =>
      candidate !== 'navigationObstacleRefreshDiscoveryEpochRevision' &&
      candidate !== 'navigationObstacleRefreshDiscoveryRemainingSlotCount',
  )) {
    const transactionDelta = transaction[key] - transactionBaseline[key]
    if (transactionDelta !== 0) {
      issues.push(
        `${context} transaction ${key} delta=${String(transactionDelta)} expected 0`,
      )
    }
  }
  for (const key of [
    ...ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS,
  ]) {
    const transactionDelta = transaction[key] - transactionBaseline[key]
    if (transactionDelta !== 0) {
      issues.push(
        `${context} transaction ${key} delta=${String(transactionDelta)} expected 0`,
      )
    }
  }
  const transactionDiscoveryEpochDelta =
    transaction.navigationObstacleRefreshDiscoveryEpochRevision -
    transactionBaseline.navigationObstacleRefreshDiscoveryEpochRevision
  if (transactionDiscoveryEpochDelta !== 1) {
    issues.push(
      `${context} transaction discovery epoch delta=${String(
        transactionDiscoveryEpochDelta,
      )} expected 1`,
    )
  }
  const transactionDiscoveryDelta =
    transaction.navigationObstacleRefreshDiscoveryRemainingSlotCount -
    transactionBaseline.navigationObstacleRefreshDiscoveryRemainingSlotCount
  if (transactionBaseline.navigationObstacleRefreshDiscoveryRemainingSlotCount !== 0) {
    issues.push(
      `${context} transaction baseline discovery remaining=${String(
        transactionBaseline.navigationObstacleRefreshDiscoveryRemainingSlotCount,
      )} expected 0`,
    )
  }
  if (transactionDiscoveryDelta !== transaction.navigationRefreshSlotCapacity) {
    issues.push(
      `${context} transaction obstacle discovery delta=${String(
        transactionDiscoveryDelta,
      )} expected full slot capacity=${String(transaction.navigationRefreshSlotCapacity)}`,
    )
  }
  if (appliedPerformance) {
    issues.push(
      ...zombieEnterRoomNavigationAdmissionIssues(transaction, appliedPerformance, {
        context: `${context} first post-transaction sample`,
      }),
    )
  }
  issues.push(
    ...zombieEnterRoomNavigationAdmissionIssues(transaction, current, {
      context: `${context} quiescence`,
    }),
  )
  const lookupDelta = deltas.obstacleDeltaObjectLookupComparisonsTotal
  if (!(lookupDelta > 0 && lookupDelta <= 64)) {
    issues.push(`${context} object lookup comparisons delta=${String(lookupDelta)} expected 1..64`)
  }
  const viewRevisionDelta = deltas.obstacleDeltaViewRevisionAdvanceCount
  const objectMaskWriteDelta = deltas.obstacleDeltaObjectMaskWritesTotal
  if (!(viewRevisionDelta >= 1 && viewRevisionDelta <= 2)) {
    issues.push(`${context} changed-view revision delta=${String(viewRevisionDelta)} expected 1..2`)
  }
  if (objectMaskWriteDelta !== viewRevisionDelta) {
    issues.push(
      `${context} object mask write delta=${String(
        objectMaskWriteDelta,
      )} expected changed-view delta=${String(viewRevisionDelta)}`,
    )
  }
  for (const key of [
    'obstacleDeltaConnectorMaskWritesTotal',
    'obstacleDeltaWorldCompileCountTotal',
    'obstacleDeltaFullArrayClearCountTotal',
    'obstacleDeltaAllocationCountTotal',
  ]) {
    if (deltas[key] !== 0) {
      issues.push(`${context} ${key} delta=${String(deltas[key])} expected 0`)
    }
  }
  for (const dimension of ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_WORK_DIMENSIONS) {
    const transactionTotalDelta =
      transaction[dimension.totalKey] - transactionBaseline[dimension.totalKey]
    const transactionThisTickDelta =
      transaction[dimension.thisTickKey] - transactionBaseline[dimension.thisTickKey]
    if (transactionThisTickDelta !== transactionTotalDelta) {
      issues.push(
        `${context} transaction ${dimension.label} this-tick delta=${String(
          transactionThisTickDelta,
        )} does not attribute total delta=${String(transactionTotalDelta)}`,
      )
    }
    if (current[dimension.totalKey] !== transaction[dimension.totalKey]) {
      issues.push(`${context} ${dimension.label} changed after the one-shot transaction`)
    }
  }
  if (current.obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick > 64) {
    issues.push(`${context} object lookup maximum exceeded 64 comparisons in one tick`)
  }
  if (
    current.obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick < lookupDelta
  ) {
    issues.push(`${context} object lookup total delta is not attributed to a measured tick`)
  }
  if (
    current.obstacleDeltaObjectMaskWritesMaximumObservedPerTick < objectMaskWriteDelta
  ) {
    issues.push(`${context} object mask writes are not attributed to a measured tick`)
  }
  if (
    requestResult?.applied !== true ||
    typeof requestResult?.objectId !== 'string' ||
    requestResult.objectId.length === 0
  ) {
    issues.push(`${context} bridge did not apply one identified breakable object`)
  }
  for (const [label, observed, expected] of [
    [
      'bridge requested revision',
      requestResult?.requestedRevision,
      current.obstacleDeltaRequestedRevision,
    ],
    [
      'bridge applied revision',
      requestResult?.appliedRevision,
      current.obstacleDeltaAppliedRevision,
    ],
    [
      'room-soak requested revision',
      roomSoak?.obstacleDeltaRequestedRevision,
      current.obstacleDeltaRequestedRevision,
    ],
    [
      'room-soak applied revision',
      roomSoak?.obstacleDeltaAppliedRevision,
      current.obstacleDeltaAppliedRevision,
    ],
  ]) {
    if (!Number.isFinite(observed) || observed !== expected) {
      issues.push(`${context} ${label}=${String(observed)} expected ${String(expected)}`)
    }
  }
  return { deltas, issues: [...new Set(issues)] }
}

export function zombieEnterRoomPerformanceIssues(
  performance,
  {
    expectedCollisionWorldGeneration = null,
    expectedMeteredWorkKeys = ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
    meteredWorkDimensions = ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS,
    previous = null,
    progressKeys = ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS,
  } = {},
) {
  const issues = []
  const requiredScalars = [
    'collisionWorldGeneration',
    ...ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS,
    ...ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_NUMERIC_KEYS,
    ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY,
    ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS.thisTickKey,
    'navigationAnchoredAgentCount',
    'navigationIntentOldestPendingAgeTicks',
    'navigationIntentPendingCount',
    'navigationSparseSearchAgentSlicesPerTick',
    ...ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS.flatMap((dimension) => [
      dimension.maximumPerAgentSliceKey,
      dimension.maximumPerTickKey,
      dimension.thisTickKey,
    ]),
    'navigationSparseSearchMaximumTargetBuildsPerTick',
    'navigationSparseSearchActiveAgentCount',
    'navigationSparseSearchPendingAgentCount',
    'navigationSparseSearchTargetBuildsThisTick',
    'routingResolveBudgetPerTick',
    'routingResolveCountThisTick',
    'routingTargetLayerIndex',
    'simulationTick',
    'spatialIndexedAgentCount',
    'spatialMaximumCandidateInspectionsPerQuery',
    'spatialUnindexedAgentCount',
    ...new Set([
      ...Object.entries(progressKeys)
        .filter(
          ([role, key]) =>
            role !== 'spawnDependencyWaitingKey' &&
            role !== 'targetUpdateStatusKey' &&
            typeof key === 'string' &&
            key.length > 0,
        )
        .map(([, key]) => key),
      ...expectedMeteredWorkKeys,
      ...meteredWorkDimensions.flatMap((dimension) => [
        dimension.maximumObservedKey,
        dimension.maximumPerTickKey,
        dimension.thisTickKey,
        dimension.totalKey,
        ...(dimension.violationCountKey ? [dimension.violationCountKey] : []),
      ]),
      ...ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.flatMap((dimension) => [
        dimension.maximumObservedKey,
        dimension.thisTickKey,
        dimension.totalKey,
      ]),
      ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
    ]),
  ]
  for (const key of requiredScalars) {
    if (!Number.isFinite(performance?.[key]) || performance[key] < 0) {
      issues.push(`${key}=${String(performance?.[key])}`)
    }
  }
  if (
    !Number.isInteger(
      performance?.[ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY],
    )
  ) {
    issues.push(
      `${ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY} must be an integer`,
    )
  }
  if (performance?.routingNavigationMode !== 'sparse') {
    issues.push(`routing navigation mode=${String(performance?.routingNavigationMode)}`)
  }
  issues.push(...zombieEnterRoomAttachmentLeaseIssues(performance))
  issues.push(...zombieEnterRoomSparseSearchBudgetIssues(performance))
  issues.push(
    ...zombieEnterRoomTargetWorkBudgetIssues(performance),
    ...zombieEnterRoomLivenessIssues(performance),
    ...zombieEnterRoomAdditionalMeteredWorkBudgetIssues(
      performance,
      meteredWorkDimensions,
    ),
    ...zombieEnterRoomMeteredWorkAttributionIssues(performance),
    ...zombieEnterRoomVisibilityWorkIssues(performance, { previous }),
    ...zombieEnterRoomObstacleDeltaTelemetryIssues(performance, { previous }),
    ...zombieEnterRoomObstacleRefreshIssues(performance, { previous }),
    ...zombieEnterRoomIntentAdmissionDeferredIssues(performance, { previous }),
    ...zombieEnterRoomWorldRefreshIssues(performance, { previous }),
    ...zombieEnterRoomTargetRouteIssues(performance, { previous }),
    ...zombieEnterRoomRefreshAdmissionIssues(performance, { previous }),
  )
  issues.push(
    ...zombieEnterRoomSparseSearchProgressIssues(previous, performance, {
      activeZombieCount: performance?.spatialIndexedAgentCount,
      context: 'sparse-search progress',
      expectedMeteredWorkKeys,
      progressKeys,
    }),
  )
  if (
    performance?.routingResolveBudgetPerTick !==
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick
  ) {
    issues.push(
      `routing resolve budget=${String(performance?.routingResolveBudgetPerTick)} expected ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick,
    )
  }
  if (performance?.routingResolveCountThisTick > performance?.routingResolveBudgetPerTick) {
    issues.push(
      `routing resolves this tick=${String(performance.routingResolveCountThisTick)} exceeds ` +
        `budget=${String(performance.routingResolveBudgetPerTick)}`,
    )
  }
  if (
    performance?.routingMaximumResolveCountObservedPerTick >
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick
  ) {
    issues.push(
      `routing max resolves=${String(
        performance.routingMaximumResolveCountObservedPerTick,
      )} exceeds budget=${String(performance.routingResolveBudgetPerTick)}`,
    )
  }
  if (performance?.navigationIntentResolveBudgetViolationCount !== 0) {
    issues.push(
      `routing resolve budget violations=${String(
        performance?.navigationIntentResolveBudgetViolationCount,
      )}`,
    )
  }
  const demandCount = ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS.reduce(
    (total, key) => total + (performance?.[key] ?? Number.NaN),
    0,
  )
  if (
    Number.isFinite(demandCount) &&
    performance?.navigationIntentIssuedCount !== demandCount
  ) {
    issues.push(
      `navigation demand conservation failed: issued=${String(
        performance?.navigationIntentIssuedCount,
      )} reasons=${String(demandCount)}`,
    )
  }
  const accountedIntentCount =
    performance?.navigationIntentResolvedCount +
    performance?.navigationIntentCanceledCount +
    performance?.navigationIntentPendingCount
  if (
    Number.isFinite(accountedIntentCount) &&
    performance?.navigationIntentIssuedCount !== accountedIntentCount
  ) {
    issues.push(
      `navigation lifecycle conservation failed: issued=${String(
        performance?.navigationIntentIssuedCount,
      )} resolved+canceled+pending=${String(accountedIntentCount)}`,
    )
  }
  if (performance?.routingResolveCount !== performance?.navigationIntentResolvedCount) {
    issues.push(
      `legacy routing resolve count=${String(performance?.routingResolveCount)} disagrees with ` +
        `resolved intents=${String(performance?.navigationIntentResolvedCount)}`,
    )
  }
  if (
    performance?.navigationIntentPendingCount === 0 &&
    performance?.navigationIntentOldestPendingAgeTicks !== 0
  ) {
    issues.push(
      `oldest pending age=${String(
        performance?.navigationIntentOldestPendingAgeTicks,
      )} with an empty queue`,
    )
  }
  if (
    expectedCollisionWorldGeneration !== null &&
    performance?.collisionWorldGeneration !== expectedCollisionWorldGeneration
  ) {
    issues.push(
      `collision world generation changed from ${expectedCollisionWorldGeneration} ` +
        `to ${String(performance?.collisionWorldGeneration)}`,
    )
  }
  if (performance?.spatialUnindexedAgentCount !== 0) {
    issues.push(`spatial unindexed agents=${String(performance?.spatialUnindexedAgentCount)}`)
  }
  if (!(performance?.spatialQueryCount > 0)) {
    issues.push(`spatial query count=${String(performance?.spatialQueryCount)}`)
  }
  if (
    performance?.spatialMaximumCandidateInspectionsPerQuery !==
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.spatialCandidateInspectionsPerQuery
  ) {
    issues.push(
      `spatial candidate cap=${String(
        performance?.spatialMaximumCandidateInspectionsPerQuery,
      )} expected ${ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.spatialCandidateInspectionsPerQuery}`,
    )
  }
  if (
    performance?.spatialMaximumCandidateInspectionsObserved >
    performance?.spatialMaximumCandidateInspectionsPerQuery
  ) {
    issues.push(
      `spatial max candidates=${String(
        performance.spatialMaximumCandidateInspectionsObserved,
      )} exceeds cap=${String(performance.spatialMaximumCandidateInspectionsPerQuery)}`,
    )
  }
  if (
    performance?.spatialCandidateInspectionCount >
    performance?.spatialQueryCount * performance?.spatialMaximumCandidateInspectionsPerQuery
  ) {
    issues.push('spatial cumulative candidates exceed query count times cap')
  }

  if (previous) {
    for (const key of ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS) {
      if (performance?.[key] < previous[key]) {
        issues.push(`${key} regressed from ${String(previous[key])} to ${String(performance[key])}`)
      }
    }
    const queryDelta = performance?.spatialQueryCount - previous.spatialQueryCount
    const candidateDelta =
      performance?.spatialCandidateInspectionCount - previous.spatialCandidateInspectionCount
    if (
      Number.isFinite(queryDelta) &&
      Number.isFinite(candidateDelta) &&
      candidateDelta > queryDelta * performance?.spatialMaximumCandidateInspectionsPerQuery
    ) {
      issues.push(
        `spatial candidate delta=${String(candidateDelta)} exceeds ` +
        `query delta=${String(queryDelta)} times cap`,
      )
    }
    const simulationTickDelta = performance.simulationTick - previous.simulationTick
    const worldRestartDelta =
      performance.navigationSparseSearchRestartedWorldChangedCount -
      previous.navigationSparseSearchRestartedWorldChangedCount
    const maximumLazyWorldRestarts =
      Math.max(0, simulationTickDelta) *
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
    if (worldRestartDelta > maximumLazyWorldRestarts) {
      issues.push(
        `lazy world-change restarts=${String(worldRestartDelta)} exceed ` +
          `${String(simulationTickDelta)} ticks * ` +
          `${String(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick)} agent slices`,
      )
    }
    issues.push(
      ...zombieEnterRoomNavigationAdmissionIssues(previous, performance, {
        context: 'per-tick navigation admission',
      }),
    )
  }
  return issues
}

function subtractZombieEnterRoomPerformanceCounters(current, baseline) {
  return Object.fromEntries(
    ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS.map((key) => [key, current[key] - baseline[key]]),
  )
}

function subtractZombieEnterRoomNavigationCounters(current, baseline) {
  return Object.fromEntries(
    ZOMBIE_ENTER_ROOM_CAUSAL_DELTA_FIELDS.map((key) => [key, current[key] - baseline[key]]),
  )
}

function sumZombieEnterRoomNavigationDemandCounters(performance) {
  return ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS.reduce(
    (total, key) => total + performance[key],
    0,
  )
}

export function reduceZombieEnterRoomNavigationContract(
  baseline,
  current,
  {
    activeZombieCount = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    context = 'navigation segment',
    expectedWorldRevisionDelta = 0,
    expectedMeteredWorkKeys = ZOMBIE_ENTER_ROOM_EXPECTED_METERED_NAVIGATION_WORK_KEYS,
    meteredWorkDimensions = ZOMBIE_ENTER_ROOM_ADDITIONAL_METERED_WORK_DIMENSIONS,
    progressKeys = ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_PROGRESS_KEYS,
    requireStableTopology = true,
    targetRouteExpectation = null,
  } = {},
) {
  const issues = []
  const requiredFields = [
    ...ZOMBIE_ENTER_ROOM_CAUSAL_DELTA_FIELDS,
    ...ZOMBIE_ENTER_ROOM_ATTACHMENT_LEASE_NUMERIC_KEYS,
    ZOMBIE_ENTER_ROOM_ATTACHMENT_MAXIMUM_HIERARCHY_NODE_COUNT_KEY,
    ZOMBIE_ENTER_ROOM_SPAWN_ATTACHMENT_HIERARCHY_TELEMETRY_KEYS.thisTickKey,
    'navigationIntentOldestPendingAgeTicks',
    'navigationSparseSearchAgentSlicesPerTick',
    ...ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS.flatMap((dimension) => [
      dimension.maximumPerAgentSliceKey,
      dimension.maximumPerTickKey,
      dimension.thisTickKey,
    ]),
    'navigationSparseSearchMaximumTargetBuildsPerTick',
    'navigationSparseSearchTargetBuildsThisTick',
    'routingMaximumResolveCountObservedPerTick',
    'routingResolveBudgetPerTick',
    'routingResolveCount',
    'routingResolveCountThisTick',
    ...new Set([
      ...Object.entries(progressKeys)
        .filter(
          ([role, key]) =>
            role !== 'spawnDependencyWaitingKey' &&
            role !== 'targetUpdateStatusKey' &&
            typeof key === 'string' &&
            key.length > 0,
        )
        .map(([, key]) => key),
      ...expectedMeteredWorkKeys,
      ...meteredWorkDimensions.flatMap((dimension) => [
        dimension.maximumObservedKey,
        dimension.maximumPerTickKey,
        dimension.thisTickKey,
        dimension.totalKey,
        ...(dimension.violationCountKey ? [dimension.violationCountKey] : []),
      ]),
      ...ZOMBIE_ENTER_ROOM_VISIBILITY_WORK_DIMENSIONS.flatMap((dimension) => [
        dimension.maximumObservedKey,
        dimension.thisTickKey,
        dimension.totalKey,
      ]),
      ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
    ]),
  ]
  for (const field of requiredFields) {
    if (!Number.isFinite(baseline?.[field]) || baseline[field] < 0) {
      issues.push(`${context} baseline ${field}=${String(baseline?.[field])}`)
    }
    if (!Number.isFinite(current?.[field]) || current[field] < 0) {
      issues.push(`${context} current ${field}=${String(current?.[field])}`)
    }
  }
  const deltas = subtractZombieEnterRoomNavigationCounters(current, baseline)
  if (issues.length > 0) return { deltas, issues: [...new Set(issues)] }

  issues.push(
    ...zombieEnterRoomAttachmentLeaseIssues(
      baseline,
      `${context} baseline sparse attachment leases`,
    ),
    ...zombieEnterRoomAttachmentLeaseIssues(
      current,
      `${context} current sparse attachment leases`,
    ),
    ...zombieEnterRoomSparseSpawnWorkBoundIssues(
      baseline,
      `${context} baseline sparse spawn work`,
    ),
    ...zombieEnterRoomSparseSpawnWorkBoundIssues(
      current,
      `${context} current sparse spawn work`,
    ),
    ...zombieEnterRoomSparseSearchBudgetIssues(baseline, `${context} baseline sparse search`),
    ...zombieEnterRoomSparseSearchBudgetIssues(current, `${context} current sparse search`),
    ...zombieEnterRoomTargetWorkBudgetIssues(
      baseline,
      `${context} baseline target-update work`,
    ),
    ...zombieEnterRoomTargetWorkBudgetIssues(current, `${context} target-update work`),
    ...zombieEnterRoomLivenessIssues(baseline, `${context} baseline liveness`),
    ...zombieEnterRoomLivenessIssues(current, `${context} liveness`),
    ...zombieEnterRoomAdditionalMeteredWorkBudgetIssues(
      baseline,
      meteredWorkDimensions,
      `${context} baseline metered work`,
    ),
    ...zombieEnterRoomAdditionalMeteredWorkBudgetIssues(
      current,
      meteredWorkDimensions,
      `${context} current metered work`,
    ),
    ...zombieEnterRoomMeteredWorkAttributionIssues(
      baseline,
      ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS,
      `${context} baseline metered work`,
    ),
    ...zombieEnterRoomMeteredWorkAttributionIssues(
      current,
      ZOMBIE_ENTER_ROOM_METERED_WORK_ATTRIBUTION_GROUPS,
      `${context} current metered work`,
    ),
    ...zombieEnterRoomVisibilityWorkIssues(baseline, {
      context: `${context} baseline visibility work`,
    }),
    ...zombieEnterRoomVisibilityWorkIssues(current, {
      context: `${context} visibility work`,
      previous: baseline,
    }),
    ...zombieEnterRoomObstacleDeltaTelemetryIssues(baseline, {
      context: `${context} baseline obstacle delta`,
    }),
    ...zombieEnterRoomObstacleDeltaTelemetryIssues(current, {
      context: `${context} obstacle delta`,
      previous: baseline,
    }),
    ...zombieEnterRoomSparseSearchProgressIssues(baseline, current, {
      activeZombieCount,
      context,
      expectedMeteredWorkKeys,
      progressKeys,
    }),
    ...zombieEnterRoomTargetRouteIssues(current, {
      activeZombieCount,
      context: `${context} shared target route`,
      expectation: targetRouteExpectation,
      previous: baseline,
    }),
  )

  for (const field of ZOMBIE_ENTER_ROOM_MONOTONIC_COUNTERS) {
    if (deltas[field] < 0) {
      issues.push(
        `${context} ${field} regressed from ${String(baseline[field])} ` +
          `to ${String(current[field])}`,
      )
    }
  }
  if (!(deltas.simulationTick > 0)) {
    issues.push(`${context} simulation tick did not advance`)
  }
  if (
    current.routingResolveBudgetPerTick !==
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick ||
    baseline.routingResolveBudgetPerTick !==
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick
  ) {
    issues.push(
      `${context} routing resolve budget must remain exactly ` +
        ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick,
    )
  }
  if (
    current.routingResolveCountThisTick >
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick
  ) {
    issues.push(
      `${context} resolved ${String(current.routingResolveCountThisTick)} intents this tick`,
    )
  }
  if (
    current.routingMaximumResolveCountObservedPerTick >
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.resolveBudgetPerTick
  ) {
    issues.push(
      `${context} maximum resolved intents per tick=${String(
        current.routingMaximumResolveCountObservedPerTick,
      )}`,
    )
  }
  if (deltas.navigationIntentResolveBudgetViolationCount !== 0) {
    issues.push(`${context} recorded a routing resolve-budget violation`)
  }
  if (deltas.navigationSparseSearchBudgetViolationCount !== 0) {
    issues.push(`${context} recorded a sparse-search budget violation`)
  }

  for (const [label, performance] of [
    ['baseline', baseline],
    ['current', current],
  ]) {
    const reasonTotal = sumZombieEnterRoomNavigationDemandCounters(performance)
    if (performance.navigationIntentIssuedCount !== reasonTotal) {
      issues.push(
        `${context} ${label} demand conservation failed: issued=${String(
          performance.navigationIntentIssuedCount,
        )} reasons=${String(reasonTotal)}`,
      )
    }
    const lifecycleTotal =
      performance.navigationIntentResolvedCount +
      performance.navigationIntentCanceledCount +
      performance.navigationIntentPendingCount
    if (performance.navigationIntentIssuedCount !== lifecycleTotal) {
      issues.push(
        `${context} ${label} lifecycle conservation failed: issued=${String(
          performance.navigationIntentIssuedCount,
        )} resolved+canceled+pending=${String(lifecycleTotal)}`,
      )
    }
    if (performance.routingResolveCount !== performance.navigationIntentResolvedCount) {
      issues.push(
        `${context} ${label} legacy resolve count=${String(
          performance.routingResolveCount,
        )} disagrees with resolved intents=${String(
          performance.navigationIntentResolvedCount,
        )}`,
      )
    }
  }

  const demandDelta = ZOMBIE_ENTER_ROOM_NAVIGATION_DEMAND_COUNTERS.reduce(
    (total, key) => total + deltas[key],
    0,
  )
  if (deltas.navigationIntentIssuedCount !== demandDelta) {
    issues.push(
      `${context} issued delta=${String(
        deltas.navigationIntentIssuedCount,
      )} does not equal reason delta=${String(demandDelta)}`,
    )
  }
  const lifecycleDelta =
    deltas.navigationIntentResolvedCount +
    deltas.navigationIntentCanceledCount +
    deltas.navigationIntentPendingCount
  if (deltas.navigationIntentIssuedCount !== lifecycleDelta) {
    issues.push(
      `${context} issued delta=${String(
        deltas.navigationIntentIssuedCount,
      )} does not equal resolved+canceled+pending delta=${String(lifecycleDelta)}`,
    )
  }
  if (deltas.navigationIntentDemandSpawnCount !== 0) {
    issues.push(
      `${context} issued ${String(deltas.navigationIntentDemandSpawnCount)} spawn demands ` +
        'with a fixed roster',
    )
  }

  const simulationTickDelta = deltas.simulationTick
  for (const dimension of ZOMBIE_ENTER_ROOM_SPARSE_SEARCH_WORK_DIMENSIONS) {
    const maximumSegmentWork = simulationTickDelta * dimension.maximumPerTick
    const targetTotalKey = `navigationSparseTargetUpdate${dimension.metricSuffix}Total`
    const totalDelta = dimension.excludesTargetWork
      ? deltas[dimension.totalKey] - (current[targetTotalKey] - baseline[targetTotalKey])
      : deltas[dimension.totalKey]
    if (!Number.isFinite(totalDelta) || totalDelta < 0) {
      issues.push(`${context} non-target ${dimension.label} delta=${String(totalDelta)}`)
    } else if (totalDelta > maximumSegmentWork) {
      issues.push(
        `${context} ${dimension.label} delta=${String(
          totalDelta,
        )} exceeds ${String(simulationTickDelta)} ticks * ${String(
          dimension.maximumPerTick,
        )}`,
      )
    }
  }
  for (const dimension of meteredWorkDimensions) {
    const maximumPerTick = dimension.targetCapKind
      ? resolveZombieEnterRoomTargetWorkCap(current, dimension.targetCapKind)
      : dimension.maximumPerTick
    const maximumSegmentWork = simulationTickDelta * maximumPerTick
    const totalDelta = current[dimension.totalKey] - baseline[dimension.totalKey]
    if (totalDelta < 0) {
      issues.push(
        `${context} ${dimension.label} total regressed from ${String(
          baseline[dimension.totalKey],
        )} to ${String(current[dimension.totalKey])}`,
      )
    } else if (totalDelta > maximumSegmentWork) {
      issues.push(
        `${context} ${dimension.label} delta=${String(totalDelta)} exceeds ` +
          `${String(simulationTickDelta)} ticks * ${String(dimension.maximumPerTick)}`,
      )
    }
    if (current[dimension.maximumObservedKey] < baseline[dimension.maximumObservedKey]) {
      issues.push(
        `${context} ${dimension.maximumObservedKey} regressed from ${String(
          baseline[dimension.maximumObservedKey],
        )} to ${String(current[dimension.maximumObservedKey])}`,
      )
    }
  }

  if (deltas.navigationWorldRevision !== expectedWorldRevisionDelta) {
    issues.push(
      `${context} world revision delta=${String(deltas.navigationWorldRevision)} expected ` +
        String(expectedWorldRevisionDelta),
    )
  }
  const expectedTargetBuilds =
    Math.max(0, deltas.navigationTargetCommittedRouteGeneration) * 2
  if (deltas.navigationSparseSearchTargetBuildsTotal !== expectedTargetBuilds) {
    issues.push(
      `${context} target-build delta=${String(
        deltas.navigationSparseSearchTargetBuildsTotal,
      )} expected ${String(expectedTargetBuilds)} for ` +
        `${String(deltas.navigationTargetCommittedRouteGeneration)} committed route generations`,
    )
  }
  if (
    deltas.navigationTargetCommittedRouteGeneration === 0 &&
    current.navigationSparseSearchTargetBuildsThisTick !== 0
  ) {
    issues.push(
      `${context} target builds this tick=${String(
        current.navigationSparseSearchTargetBuildsThisTick,
      )} during steady state`,
    )
  }
  const maximumWorldDemands = Math.max(0, deltas.navigationWorldRevision) * activeZombieCount
  if (deltas.navigationIntentDemandWorldChangedCount > maximumWorldDemands) {
    issues.push(
      `${context} world-change demands=${String(
        deltas.navigationIntentDemandWorldChangedCount,
      )} exceed ${String(maximumWorldDemands)}`,
    )
  }
  const maximumWorldRestarts =
    Math.max(0, deltas.navigationWorldRevision) * activeZombieCount
  if (deltas.navigationSparseSearchRestartedWorldChangedCount > maximumWorldRestarts) {
    issues.push(
      `${context} world-change restarts=${String(
        deltas.navigationSparseSearchRestartedWorldChangedCount,
      )} exceed ${String(maximumWorldRestarts)} for ` +
        `${String(deltas.navigationWorldRevision)} world revisions and ` +
        `${String(activeZombieCount)} agents`,
    )
  }
  const maximumWorldRestartsByServiceTicks =
    Math.max(0, deltas.simulationTick) *
    ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick
  if (
    deltas.navigationSparseSearchRestartedWorldChangedCount >
    maximumWorldRestartsByServiceTicks
  ) {
    issues.push(
      `${context} world-change restarts=${String(
        deltas.navigationSparseSearchRestartedWorldChangedCount,
      )} exceed ${String(deltas.simulationTick)} ticks * ` +
        `${String(ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.sparseSearchAgentSlicesPerTick)} agent slices`,
    )
  }
  const agentServiceSliceCountTotalKey = progressKeys.agentServiceSliceCountTotalKey
  if (agentServiceSliceCountTotalKey) {
    const agentServiceDelta =
      current[agentServiceSliceCountTotalKey] - baseline[agentServiceSliceCountTotalKey]
    if (deltas.navigationSparseSearchRestartedWorldChangedCount > agentServiceDelta) {
      issues.push(
        `${context} world-change restarts=${String(
          deltas.navigationSparseSearchRestartedWorldChangedCount,
        )} exceed bounded agent service slices=${String(agentServiceDelta)}`,
      )
    }
  }

  if (requireStableTopology) {
    if (deltas.fallbackRoutingRebuildCount !== 0) {
      issues.push(`${context} fallback routing rebuilt`)
    }
    if (deltas.routingRebuildCount !== 0) {
      issues.push(`${context} strict routing rebuilt`)
    }
  }
  if (
    deltas.routingGraphAttachmentFullSearchCount >
    deltas.navigationIntentResolvedCount *
      ZOMBIE_ENTER_ROOM_NAVIGATION_CONTRACT.maximumAttachmentFullSearchesPerResolvedIntent
  ) {
    issues.push(
      `${context} full attachment searches=${String(
        deltas.routingGraphAttachmentFullSearchCount,
      )} exceed twice resolved intents=${String(deltas.navigationIntentResolvedCount)}`,
    )
  }
  if (
    deltas.routingGraphAttachmentFullSearchCount === 0 &&
    (deltas.routingGraphAttachmentCandidateCount !== 0 ||
      deltas.routingGraphAttachmentSupportCheckCount !== 0)
  ) {
    issues.push(`${context} attachment work changed without a full attachment search`)
  }
  if (deltas.navigationAnchorInvalidationCount > deltas.navigationIntentIssuedCount) {
    issues.push(
      `${context} anchor invalidations=${String(
        deltas.navigationAnchorInvalidationCount,
      )} exceed issued intents=${String(deltas.navigationIntentIssuedCount)}`,
    )
  }
  const sparseLifecycleDelta =
    deltas.navigationSparseSearchCompletedCount +
    deltas.navigationSparseSearchInvalidatedCount +
    deltas.navigationSparseSearchCanceledCount +
    deltas.navigationSparseSearchActiveAgentCount
  if (deltas.navigationSparseSearchStartedCount !== sparseLifecycleDelta) {
    issues.push(
      `${context} sparse-search lifecycle delta failed: started=${String(
        deltas.navigationSparseSearchStartedCount,
      )} completed+invalidated+canceled+active=${String(sparseLifecycleDelta)}`,
    )
  }
  const sparseRestartReasonDelta =
    deltas.navigationSparseSearchRestartedRoutePublishedCount +
    deltas.navigationSparseSearchRestartedWorldChangedCount +
    deltas.navigationSparseSearchRestartedCollisionRecoveryCount
  if (deltas.navigationSparseSearchRestartedCount !== sparseRestartReasonDelta) {
    issues.push(
      `${context} sparse-search restart delta=${String(
        deltas.navigationSparseSearchRestartedCount,
      )} does not equal reason delta=${String(sparseRestartReasonDelta)}`,
    )
  }
  if (
    deltas.navigationSparseSearchInvalidatedCount !==
    deltas.navigationSparseSearchRestartedCount
  ) {
    issues.push(`${context} invalidation and restart deltas disagree`)
  }
  if (
    current.navigationAnchoredAgentCount > activeZombieCount ||
    current.navigationIntentPendingCount > activeZombieCount ||
    current.navigationSparseSearchActiveAgentCount > activeZombieCount ||
    current.navigationSparseSearchPendingAgentCount > activeZombieCount
  ) {
    issues.push(
      `${context} agent accounting exceeds roster: anchored=${String(
        current.navigationAnchoredAgentCount,
      )} pending=${String(current.navigationIntentPendingCount)} sparseActive=${String(
        current.navigationSparseSearchActiveAgentCount,
      )} sparsePending=${String(
        current.navigationSparseSearchPendingAgentCount,
      )} roster=${String(activeZombieCount)}`,
    )
  }
  if (
    current.navigationIntentPendingCount === 0 &&
    current.navigationIntentOldestPendingAgeTicks !== 0
  ) {
    issues.push(`${context} reports a pending age with an empty queue`)
  }

  return { deltas, issues: [...new Set(issues)] }
}

export function summarizeZombieEnterRoomState(sample) {
  return {
    activeZombieCount: sample?.zombie?.activeTargets ?? null,
    bridgeFrameIdx: sample?.bridge?.frameIdx ?? null,
    buildingScopeId: sample?.floor?.buildingScopeId ?? null,
    expectedPhase: sample?.zombie?.expectedPhase ?? null,
    hudExpectedPhase: sample?.hud?.expectedPhase ?? null,
    hudPhase: sample?.hud?.phase ?? null,
    hudPhaseReady: sample?.hud?.phaseReady ?? null,
    insideBuilding: sample?.floor?.insideBuilding ?? null,
    levelId: sample?.floor?.levelId ?? null,
    night: sample?.zombie?.night ?? null,
    nodeCount: sample?.bridge?.nodeCount ?? null,
    observedAtMs: sample?.observedAtMs ?? null,
    performance: summarizeZombieEnterRoomPerformance(sample),
    phase: sample?.zombie?.phase ?? null,
    phaseReady: sample?.zombie?.phaseReady ?? null,
    phaseSecondsRemaining: sample?.zombie?.phaseSecondsRemaining ?? null,
    playerPose: finitePlayerPose(sample?.navigation),
    playerSpeed: sample?.navigation?.speed ?? null,
    presentation: sample?.presentation ?? null,
    roomSoak: {
      activeZombieCount:
        sample?.zombie?.benchmarkRoomSoak?.activeZombieCount ?? null,
      enabled: sample?.zombie?.benchmarkRoomSoak?.enabled ?? false,
      obstacleDeltaAppliedRevision:
        sample?.zombie?.benchmarkRoomSoak?.obstacleDeltaAppliedRevision ?? null,
      obstacleDamageSuppressed:
        sample?.zombie?.benchmarkRoomSoak?.obstacleDamageSuppressed ?? false,
      obstacleDeltaRequestedRevision:
        sample?.zombie?.benchmarkRoomSoak?.obstacleDeltaRequestedRevision ?? null,
      phaseHeld: sample?.zombie?.benchmarkRoomSoak?.phaseHeld ?? false,
      playerProtected: sample?.zombie?.benchmarkRoomSoak?.playerProtected ?? false,
      reachableSpawnCompletedCount:
        sample?.zombie?.benchmarkRoomSoak?.reachableSpawnCompletedCount ?? null,
      representedZombieCount:
        sample?.zombie?.benchmarkRoomSoak?.representedZombieCount ?? null,
      rosterRealized: sample?.zombie?.benchmarkRoomSoak?.rosterRealized ?? false,
      scheduledZombieCount:
        sample?.zombie?.benchmarkRoomSoak?.scheduledZombieCount ?? null,
      targetZombieCount:
        sample?.zombie?.benchmarkRoomSoak?.targetZombieCount ?? null,
      zombieCapacity: sample?.zombie?.benchmarkRoomSoak?.zombieCapacity ?? null,
    },
    status: sample?.zombie?.status ?? null,
  }
}

export function zombieEnterRoomPresentationIssues(
  sample,
  contract = preparedMeasurementContract.presentation,
) {
  const issues = []
  const presentation = sample?.presentation
  if (!presentation || typeof presentation !== 'object') {
    return ['Zombie presentation LOD scene evidence is unavailable']
  }
  const exactKeys = [
    'activeZombieCount',
    'authoredInstancedActiveCount',
    'detailedActiveCount',
    'detailedCapacity',
    'fallbackCount',
    'instancedActiveCount',
    'unpresentedActiveCount',
  ]
  for (const key of [...exactKeys, 'authoredInstancedBatchCount']) {
    if (!Number.isInteger(presentation[key]) || presentation[key] < 0) {
      issues.push(`presentation ${key}=${String(presentation[key])}`)
    }
  }
  if (issues.length > 0) return issues
  if (
    presentation.activeZombieCount !==
    presentation.detailedActiveCount + presentation.instancedActiveCount
  ) {
    issues.push(
      `presentation accounting active=${String(presentation.activeZombieCount)} ` +
        `detailed+instanced=${String(
          presentation.detailedActiveCount + presentation.instancedActiveCount,
        )}`,
    )
  }
  if (
    presentation.instancedActiveCount !==
    presentation.authoredInstancedActiveCount +
      presentation.fallbackCount +
      presentation.unpresentedActiveCount
  ) {
    issues.push(
      `instanced presentation accounting instanced=${String(
        presentation.instancedActiveCount,
      )} authored+fallback+unpresented=${String(
        presentation.authoredInstancedActiveCount +
          presentation.fallbackCount +
          presentation.unpresentedActiveCount,
      )}`,
    )
  }
  for (const key of exactKeys) {
    if (presentation[key] !== contract?.[key]) {
      issues.push(
        `presentation ${key}=${String(presentation[key])} expected ${String(contract?.[key])}`,
      )
    }
  }
  const batchContract = contract?.authoredInstancedBatchCount
  if (
    !batchContract ||
    presentation.authoredInstancedBatchCount < batchContract.minimum ||
    presentation.authoredInstancedBatchCount > batchContract.maximum
  ) {
    issues.push(
      `presentation authoredInstancedBatchCount=${String(
        presentation.authoredInstancedBatchCount,
      )} expected ${String(batchContract?.minimum)}..${String(batchContract?.maximum)}`,
    )
  }
  return issues
}

export function resolveZombieEnterRoomLoaderCount({
  loadingHandedOff,
  loadingHandoffMarkerPresent,
  visibleLoaderCount,
}) {
  const visibleCount = Number.isInteger(visibleLoaderCount)
    ? Math.max(0, visibleLoaderCount)
    : 0
  if (visibleCount > 0) return visibleCount
  if (loadingHandoffMarkerPresent) {
    return loadingHandedOff === true ? 0 : 1
  }
  return visibleCount
}

export function zombieEnterRoomBaseIssues(sample, { requireRoomSoak = false } = {}) {
  const issues = []
  if (sample?.loaderCount !== 0) issues.push(`loader count=${String(sample?.loaderCount)}`)
  if (sample?.documentVisibility !== 'visible') {
    issues.push(`document visibility=${String(sample?.documentVisibility)}`)
  }
  if (!Number.isFinite(sample?.bridge?.frameIdx)) {
    issues.push('bench bridge frame is unavailable')
  }
  if (!Number.isFinite(sample?.bridge?.nodeCount) || sample.bridge.nodeCount < 1) {
    issues.push(`scene node count=${String(sample?.bridge?.nodeCount)}`)
  }
  if (!finitePlayerPose(sample?.navigation)) issues.push('player pose is unavailable')
  if (!Number.isFinite(sample?.navigation?.speed)) issues.push('player speed is unavailable')
  if (typeof sample?.floor?.insideBuilding !== 'boolean') {
    issues.push('floor visibility state is unavailable')
  }
  issues.push(...zombieEnterRoomPresentationIssues(sample))

  const zombie = sample?.zombie
  if (!zombie) return [...issues, 'Zombie Escape state is unavailable']
  if (zombie.integratedIntoExistingCanvas !== true) {
    issues.push('Zombie Escape is not integrated into the existing canvas')
  }
  if (zombie.status !== 'playing') issues.push(`Zombie Escape status=${String(zombie.status)}`)
  if (zombie.phase !== 'night') issues.push(`phase=${String(zombie.phase)}`)
  if (zombie.expectedPhase !== 'night') {
    issues.push(`expected phase=${String(zombie.expectedPhase)}`)
  }
  if (zombie.phaseReady !== true) issues.push(`phase ready=${String(zombie.phaseReady)}`)
  if (!Number.isInteger(zombie.night) || zombie.night < 1) {
    issues.push(`night=${String(zombie.night)}`)
  }
  if (!Number.isFinite(zombie.phaseSecondsRemaining) || zombie.phaseSecondsRemaining <= 0) {
    issues.push(`night remaining=${String(zombie.phaseSecondsRemaining)}`)
  }
  if (zombie.activeTargets !== ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT) {
    issues.push(
      `active zombie count=${String(zombie.activeTargets)} expected ` +
        ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    )
  }
  if (
    zombie.benchmarkRoomSoak?.activeZombieCount !== zombie.activeTargets
  ) {
    issues.push(
      `room-soak active zombie count=${String(
        zombie.benchmarkRoomSoak?.activeZombieCount,
      )} expected ${String(zombie.activeTargets)}`,
    )
  }
  if (
    zombie.benchmarkRoomSoak?.zombieCapacity !==
    ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
  ) {
    issues.push(
      `zombie capacity=${String(zombie.benchmarkRoomSoak?.zombieCapacity)} expected ` +
        ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    )
  }
  const performance = summarizeZombieEnterRoomPerformance(sample)
  issues.push(...zombieEnterRoomPerformanceIssues(performance))
  if (performance.navigationAnchoredAgentCount > zombie.activeTargets) {
    issues.push(
      `anchored agents=${String(performance.navigationAnchoredAgentCount)} exceed active ` +
        `zombies=${String(zombie.activeTargets)}`,
    )
  }
  if (performance.navigationIntentPendingCount > zombie.activeTargets) {
    issues.push(
      `pending navigation intents=${String(
        performance.navigationIntentPendingCount,
      )} exceed active zombies=${String(zombie.activeTargets)}`,
    )
  }
  if (performance.navigationSparseSearchPendingAgentCount > zombie.activeTargets) {
    issues.push(
      `pending sparse searches=${String(
        performance.navigationSparseSearchPendingAgentCount,
      )} exceed active zombies=${String(zombie.activeTargets)}`,
    )
  }
  if (requireRoomSoak) {
    if (zombie.benchmarkRoomSoak?.enabled !== true) {
      issues.push('room soak is not enabled')
    }
    if (zombie.benchmarkRoomSoak?.obstacleDamageSuppressed !== true) {
      issues.push('room soak did not suppress obstacle damage')
    }
    if (zombie.benchmarkRoomSoak?.phaseHeld !== true) {
      issues.push('room soak is not holding the phase clock')
    }
    if (zombie.benchmarkRoomSoak?.playerProtected !== true) {
      issues.push('room soak did not protect the player')
    }
    if (
      zombie.benchmarkRoomSoak?.targetZombieCount !==
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
    ) {
      issues.push(
        `room-soak target zombie count=${String(
          zombie.benchmarkRoomSoak?.targetZombieCount,
        )} expected ${String(ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)}`,
      )
    }
    if (
      zombie.benchmarkRoomSoak?.scheduledZombieCount !==
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
    ) {
      issues.push(
        `room-soak scheduled zombie count=${String(
          zombie.benchmarkRoomSoak?.scheduledZombieCount,
        )} expected ${String(ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)}`,
      )
    }
    const reachableSpawnCompletedCount =
      zombie.benchmarkRoomSoak?.reachableSpawnCompletedCount
    if (
      !Number.isInteger(reachableSpawnCompletedCount) ||
      reachableSpawnCompletedCount < ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
    ) {
      issues.push(
        `reachable spawn completions=${String(
          reachableSpawnCompletedCount,
        )} expected at least ${String(ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)}`,
      )
    }
    if (
      zombie.benchmarkRoomSoak?.representedZombieCount !==
      ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
    ) {
      issues.push(
        `represented zombie count=${String(
          zombie.benchmarkRoomSoak?.representedZombieCount,
        )} expected ${String(ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)}`,
      )
    }
    if (zombie.benchmarkRoomSoak?.rosterRealized !== true) {
      issues.push('room-soak roster is not realized through reachable sparse spawns')
    }
    for (const [label, value] of [
      [
        'room-soak requested obstacle revision',
        zombie.benchmarkRoomSoak?.obstacleDeltaRequestedRevision,
      ],
      [
        'room-soak applied obstacle revision',
        zombie.benchmarkRoomSoak?.obstacleDeltaAppliedRevision,
      ],
    ]) {
      if (!Number.isFinite(value) || value < 0) issues.push(`${label}=${String(value)}`)
    }
  }
  if (!sample?.hud) {
    issues.push('Zombie Escape HUD is unavailable')
  } else if (
    sample.hud.phase !== zombie.phase ||
    sample.hud.expectedPhase !== zombie.expectedPhase ||
    sample.hud.phaseReady !== zombie.phaseReady
  ) {
    issues.push('HUD phase readiness disagrees with the simulation')
  }
  return issues
}

export function zombieEnterRoomStateIssues(
  sample,
  { expectedInside, requireRoomSoak = false, route, target = null, requireSettled = true },
) {
  const issues = zombieEnterRoomBaseIssues(sample, { requireRoomSoak })
  const floor = sample?.floor
  if (floor?.insideBuilding !== expectedInside) {
    issues.push(`insideBuilding=${String(floor?.insideBuilding)} expected ${expectedInside}`)
  }
  if (expectedInside) {
    if (!route?.buildingScopeId || floor?.buildingScopeId !== route.buildingScopeId) {
      issues.push(
        `building=${String(floor?.buildingScopeId)} expected ${String(route?.buildingScopeId)}`,
      )
    }
    if (!route?.levelId || floor?.levelId !== route.levelId) {
      issues.push(`level=${String(floor?.levelId)} expected ${String(route?.levelId)}`)
    }
  }
  if (requireSettled && Math.abs(sample?.navigation?.speed ?? Number.POSITIVE_INFINITY) > 0.1) {
    issues.push(`player speed=${String(sample?.navigation?.speed)}`)
  }
  const pose = finitePlayerPose(sample?.navigation)
  if (pose && target) {
    const distance = Math.hypot(pose.x - target.x, pose.z - target.z)
    if (distance > ZOMBIE_ENTER_ROOM_TIMING.arrivalToleranceMeters) {
      issues.push(`target distance=${distance.toFixed(3)}m`)
    }
  }
  return issues
}

function zombieEnterRoomQuiescenceValues(performance) {
  return Object.fromEntries(
    ZOMBIE_ENTER_ROOM_QUIESCENCE_FIELDS.map((key) => [key, performance?.[key] ?? null]),
  )
}

function zombieEnterRoomRoutingPrimingIssues(
  performance,
  activeZombieCount = ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
  { requireFallbackRouting = false } = {},
) {
  const issues = zombieEnterRoomSparseSpawnWorkBoundIssues(
    performance,
    'routing priming sparse spawn work',
  )
  if (!(performance?.collisionWorldGeneration > 0)) {
    issues.push(
      `collision world generation=${String(performance?.collisionWorldGeneration)} is not ready`,
    )
  }
  if (!(performance?.routingRebuildCount > 0)) {
    issues.push(
      `strict routing rebuild count=${String(performance?.routingRebuildCount)} is not ready`,
    )
  }
  if (!(performance?.navigationTargetCommittedRouteGeneration > 0)) {
    issues.push(
      `committed route generation=${String(
        performance?.navigationTargetCommittedRouteGeneration,
      )} is not ready`,
    )
  }
  if (requireFallbackRouting && !(performance?.fallbackRoutingRebuildCount > 0)) {
    issues.push(
      `fallback routing rebuild count=${String(
        performance?.fallbackRoutingRebuildCount,
      )} is not ready`,
    )
  }
  if (performance?.navigationSparseSpawnSearchCompletedCount < activeZombieCount) {
    issues.push(
      `completed spawn searches=${String(
        performance?.navigationSparseSpawnSearchCompletedCount,
      )} are below active zombies=${String(activeZombieCount)}`,
    )
  }
  return issues
}

function zombieEnterRoomSteadyRoutingIssues(current, baseline, context) {
  const issues = []
  for (const key of ZOMBIE_ENTER_ROOM_STEADY_TOPOLOGY_FIELDS) {
    if (key === 'collisionWorldGeneration' || current?.[key] === baseline?.[key]) continue
    if (key === 'routingRebuildCount') {
      issues.push(`strict routing rebuilt during ${context}`)
    } else if (key === 'fallbackRoutingRebuildCount') {
      issues.push(`fallback routing rebuilt during ${context}`)
    } else if (key === 'navigationWorldRevision') {
      issues.push(`navigation world revision changed during ${context}`)
    } else {
      issues.push(`${key} changed during ${context}`)
    }
  }
  return issues
}

export function createZombieEnterRoomReadinessState() {
  return {
    consecutiveSamples: 0,
    lastFrameIdx: null,
    lastPerformance: null,
    lastQuiescenceValues: null,
    ready: false,
    resetCount: 0,
    sampleCount: 0,
  }
}

export function observeZombieEnterRoomReadiness(
  current,
  sample,
  { expectedInside = false, requireFallbackRouting = false, route, target },
) {
  const summary = summarizeZombieEnterRoomState(sample)
  const issues = [
    ...zombieEnterRoomStateIssues(sample, {
      expectedInside,
      requireRoomSoak: true,
      route,
      target,
    }),
    ...zombieEnterRoomRoutingPrimingIssues(
      summary.performance,
      summary.activeZombieCount,
      { requireFallbackRouting },
    ),
    ...zombieEnterRoomNavigationAdmissionIssues(
      current.lastPerformance,
      summary.performance,
      { context: 'navigation quiescence admission' },
    ),
    ...zombieEnterRoomObstacleRefreshIssues(summary.performance, {
      context: 'obstacle quiescence deferred refresh',
      previous: current.lastPerformance,
      requireDrained: (summary.performance?.obstacleDeltaAppliedCount ?? 0) > 0,
    }),
    ...zombieEnterRoomIntentAdmissionDeferredIssues(summary.performance, {
      context: 'navigation quiescence deferred intent admission',
      previous: current.lastPerformance,
      requireDrained: true,
    }),
    ...zombieEnterRoomWorldRefreshIssues(summary.performance, {
      context: 'navigation quiescence world refresh',
      previous: current.lastPerformance,
      requireDrained: true,
    }),
    ...zombieEnterRoomTargetRouteIssues(summary.performance, {
      activeZombieCount: summary.activeZombieCount,
      context: 'navigation quiescence shared target route',
      expectation: 'stable',
      previous: current.lastPerformance,
    }),
    ...zombieEnterRoomRefreshAdmissionIssues(summary.performance, {
      context: 'obstacle quiescence refresh admission',
      previous: current.lastPerformance,
      requireDrained: (summary.performance?.obstacleDeltaAppliedCount ?? 0) > 0,
    }),
  ]
  const frameAdvanced =
    current.lastFrameIdx === null || summary.bridgeFrameIdx > current.lastFrameIdx
  const quiescenceValues = zombieEnterRoomQuiescenceValues(summary.performance)
  const changedFields = current.lastQuiescenceValues
    ? ZOMBIE_ENTER_ROOM_QUIESCENCE_FIELDS.filter(
        (key) => quiescenceValues[key] !== current.lastQuiescenceValues[key],
      )
    : []
  const signatureChanged = changedFields.length > 0
  let consecutiveSamples = current.consecutiveSamples
  let resetCount = current.resetCount
  let sampleCount = current.sampleCount

  if (signatureChanged) {
    consecutiveSamples = 0
    resetCount += 1
  }
  if (frameAdvanced) {
    sampleCount += 1
    consecutiveSamples =
      issues.length === 0
        ? signatureChanged
          ? 1
          : consecutiveSamples + 1
        : 0
  }

  const state = {
    consecutiveSamples,
    lastFrameIdx: frameAdvanced ? summary.bridgeFrameIdx : current.lastFrameIdx,
    lastPerformance:
      frameAdvanced || signatureChanged ? summary.performance : current.lastPerformance,
    lastQuiescenceValues:
      frameAdvanced || signatureChanged ? quiescenceValues : current.lastQuiescenceValues,
    ready:
      issues.length === 0 &&
      consecutiveSamples >= ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveQuiescenceSamples,
    resetCount,
    sampleCount,
  }
  return { changedFields, frameAdvanced, issues: [...new Set(issues)], state, summary }
}

export function createZombieEnterRoomValidityState() {
  return {
    activeZombieCountMax: null,
    activeZombieCountMin: null,
    completedCycles: 0,
    collisionWorldGeneration: null,
    expectedCycle: 1,
    initialNight: null,
    initialNodeCount: null,
    issues: [],
    lastActiveZombieCount: null,
    lastFrameIdx: null,
    lastPerformance: null,
    lastStage: null,
    nextStageIndex: 0,
    performanceBaseline: null,
    performanceCounterDeltas: null,
    phaseSecondsRemainingBaseline: null,
    sampleCount: 0,
  }
}

function primeZombieEnterRoomValidityState(current, sample) {
  const summary = summarizeZombieEnterRoomState(sample)
  return {
    ...current,
    activeZombieCountMax: summary.activeZombieCount,
    activeZombieCountMin: summary.activeZombieCount,
    collisionWorldGeneration: summary.performance.collisionWorldGeneration,
    initialNight: summary.night,
    initialNodeCount: summary.nodeCount,
    lastActiveZombieCount: summary.activeZombieCount,
    lastFrameIdx: summary.bridgeFrameIdx,
    lastPerformance: summary.performance,
    performanceBaseline: summary.performance,
    performanceCounterDeltas: subtractZombieEnterRoomPerformanceCounters(
      summary.performance,
      summary.performance,
    ),
    phaseSecondsRemainingBaseline: summary.phaseSecondsRemaining,
    sampleCount: current.sampleCount + 1,
  }
}

export function observeZombieEnterRoomStage(
  current,
  sample,
  { cycle, expectedInside, route, stage, target },
) {
  const next = { ...current, issues: [...current.issues] }
  const issues = zombieEnterRoomStateIssues(sample, {
    expectedInside,
    requireRoomSoak: true,
    route,
    target,
  })
  const expectedStage = ZOMBIE_ENTER_ROOM_STAGE_SEQUENCE[next.nextStageIndex]
  if (cycle !== next.expectedCycle) {
    issues.push(`cycle=${cycle} expected ${next.expectedCycle}`)
  }
  if (stage !== expectedStage) issues.push(`stage=${stage} expected ${expectedStage}`)

  const summary = summarizeZombieEnterRoomState(sample)
  if (
    next.lastActiveZombieCount !== null &&
    summary.activeZombieCount !== next.lastActiveZombieCount
  ) {
    issues.push(
      `active zombie count changed from ${next.lastActiveZombieCount} ` +
        `to ${String(summary.activeZombieCount)}`,
    )
  }
  issues.push(
    ...zombieEnterRoomPerformanceIssues(summary.performance, {
      expectedCollisionWorldGeneration: next.collisionWorldGeneration,
      previous: next.lastPerformance,
    }),
  )
  const navigationContract = next.lastPerformance
    ? reduceZombieEnterRoomNavigationContract(next.lastPerformance, summary.performance, {
        activeZombieCount: summary.activeZombieCount,
        context: `${stage} stage`,
        targetRouteExpectation:
          stage === 'entered' || stage === 'exited' ? 'published' : 'stable',
      })
    : null
  if (navigationContract) issues.push(...navigationContract.issues)
  const stationaryRoutingSpan =
    (next.lastStage === 'entered' && stage === 'inside-hold') ||
    (next.lastStage === 'exited' && stage === 'outside-hold')
  if (stationaryRoutingSpan && next.lastPerformance) {
    issues.push(
      ...zombieEnterRoomSteadyRoutingIssues(
        summary.performance,
        next.lastPerformance,
        `stationary ${next.lastStage} -> ${stage} hold`,
      ),
    )
  }
  if (next.lastFrameIdx !== null && summary.bridgeFrameIdx <= next.lastFrameIdx) {
    issues.push(`bench frame did not advance from ${next.lastFrameIdx}`)
  }
  if (next.initialNodeCount !== null && summary.nodeCount !== next.initialNodeCount) {
    issues.push(`scene node count changed from ${next.initialNodeCount} to ${summary.nodeCount}`)
  }
  if (next.initialNight !== null && summary.night !== next.initialNight) {
    issues.push(`night changed from ${next.initialNight} to ${summary.night}`)
  }
  if (
    next.phaseSecondsRemainingBaseline !== null &&
    Math.abs(summary.phaseSecondsRemaining - next.phaseSecondsRemainingBaseline) > 0.5
  ) {
    issues.push(
      `night countdown drifted from ${next.phaseSecondsRemainingBaseline} ` +
        `to ${summary.phaseSecondsRemaining}`,
    )
  }

  next.sampleCount += 1
  if (Number.isFinite(summary.activeZombieCount)) {
    next.activeZombieCountMin =
      next.activeZombieCountMin === null
        ? summary.activeZombieCount
        : Math.min(next.activeZombieCountMin, summary.activeZombieCount)
    next.activeZombieCountMax =
      next.activeZombieCountMax === null
        ? summary.activeZombieCount
        : Math.max(next.activeZombieCountMax, summary.activeZombieCount)
  }
  next.initialNodeCount ??= summary.nodeCount
  next.initialNight ??= summary.night
  next.collisionWorldGeneration ??= summary.performance.collisionWorldGeneration
  next.phaseSecondsRemainingBaseline ??= summary.phaseSecondsRemaining
  next.lastFrameIdx = summary.bridgeFrameIdx
  next.lastActiveZombieCount = summary.activeZombieCount
  next.performanceBaseline ??= summary.performance
  next.lastPerformance = summary.performance
  next.lastStage = stage
  next.performanceCounterDeltas = subtractZombieEnterRoomPerformanceCounters(
    summary.performance,
    next.performanceBaseline,
  )

  if (issues.length === 0) {
    next.nextStageIndex += 1
    if (next.nextStageIndex === ZOMBIE_ENTER_ROOM_STAGE_SEQUENCE.length) {
      next.completedCycles += 1
      next.expectedCycle += 1
      next.nextStageIndex = 0
    }
  } else {
    next.issues.push(...issues)
  }
  return { issues, navigationContract, state: next, summary }
}

export function collectZombieEnterRoomFinalIssues({ elapsedMs, requestedDurationMs, validity }) {
  const issues = [...validity.issues]
  if (validity.completedCycles < 1) issues.push('no complete room-entry cycle was observed')
  else if (validity.completedCycles < 2) {
    issues.push('repeated transition stress did not complete a second room-entry cycle')
  }
  if (validity.nextStageIndex !== 0) {
    issues.push(
      `cycle ${validity.expectedCycle} stopped before ` +
        `${ZOMBIE_ENTER_ROOM_STAGE_SEQUENCE[validity.nextStageIndex]}`,
    )
  }
  if (elapsedMs < requestedDurationMs) {
    issues.push(`measured ${Math.round(elapsedMs)}ms/${requestedDurationMs}ms`)
  }
  if (requestedDurationMs < ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS) {
    issues.push(
      `requested duration ${requestedDurationMs}ms is below the ` +
        `${ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS}ms observer-light minimum`,
    )
  }
  if (
    validity.sampleCount > 0 &&
    (validity.activeZombieCountMin !== ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT ||
      validity.activeZombieCountMax !== ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT)
  ) {
    issues.push(
      `measured zombie roster ranged from ${String(validity.activeZombieCountMin)} ` +
        `to ${String(validity.activeZombieCountMax)} instead of remaining at ` +
        ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
    )
  }
  if (!(validity.performanceCounterDeltas?.spatialBuildCount > 0)) {
    issues.push('no spatial-index build occurred during measurement')
  }
  if (!(validity.performanceCounterDeltas?.spatialQueryCount > 0)) {
    issues.push('no spatial query occurred during measurement')
  }
  if (!(validity.performanceCounterDeltas?.navigationTargetRequestedRevision > 0)) {
    issues.push('no shared target-route request occurred during measurement')
  }
  if (!(validity.performanceCounterDeltas?.navigationTargetCommittedRouteGeneration > 0)) {
    issues.push('no shared target-route publication occurred during measurement')
  }
  return [...new Set(issues)]
}

export function zombieEnterRoomSoakCleanupIssues(roomSoak, { roomSoakBegan = false } = {}) {
  if (roomSoakBegan && !roomSoak) {
    return ['zombie room soak bridge disappeared before cleanup']
  }
  if (
    roomSoak &&
    (roomSoak.phaseHeld !== false ||
      roomSoak.playerProtected !== false ||
      roomSoak.obstacleDamageSuppressed !== false)
  ) {
    return [`zombie room soak did not end cleanly: ${JSON.stringify(roomSoak)}`]
  }
  return []
}

async function readZombieEnterRoomState(page) {
  const state = await page.evaluate((expectedRoutingTelemetryKeys) => {
    const bridge = window.__PASCAL_BENCH__?.beacon() ?? null
    const floor = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.floorVisibility ?? null
    const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
    const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null
    const presentationLod = window.__PASCAL_BENCH__?.sceneObjectUserData?.(
      'zombie-escape-presentation',
      'presentationLod',
    )
    const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const loadingRoot = document.querySelector('[data-landrush-loading-handed-off]')
    const composedParentElement = (element) => {
      if (element.parentElement) return element.parentElement
      const root = element.getRootNode()
      return root instanceof ShadowRoot ? root.host : null
    }
    const visibleLoaderCount = [...document.querySelectorAll('[role="progressbar"]')].filter(
      (element) => {
        let composedElement = element
        while (composedElement) {
          if (
            composedElement.hidden ||
            composedElement.getAttribute('aria-hidden') === 'true'
          ) {
            return false
          }
          const style = window.getComputedStyle(composedElement)
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.visibility === 'collapse' ||
            style.contentVisibility === 'hidden' ||
            Number.parseFloat(style.opacity || '1') <= 0
          ) {
            return false
          }
          composedElement = composedParentElement(composedElement)
        }
        const bounds = element.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0
      },
    ).length
    return {
      bridge: bridge
        ? {
            frameIdx: bridge.frameIdx ?? null,
            nodeCount: bridge.nodeCount ?? null,
          }
        : null,
      observedAtMs: performance.now(),
      documentVisibility: document.visibilityState,
      floor: floor
        ? {
            buildingScopeId: floor.buildingScopeId ?? null,
            insideBuilding: floor.insideBuilding,
            levelId: floor.levelId ?? null,
          }
        : null,
      hud: hud
        ? {
            expectedPhase: hud.getAttribute('data-expected-phase'),
            phase: hud.getAttribute('data-phase'),
            phaseReady: hud.getAttribute('data-phase-ready') === 'true',
          }
        : null,
      loadingHandedOff:
        loadingRoot?.getAttribute('data-landrush-loading-handed-off') === 'true',
      loadingHandoffMarkerPresent: loadingRoot !== null,
      visibleLoaderCount,
      navigation: navigation
        ? {
            heading: navigation.heading,
            robot: navigation.robot,
            speed: navigation.speed,
          }
        : null,
      presentation:
        presentationLod && typeof presentationLod === 'object'
          ? {
              activeMixerCount: presentationLod.activeMixerCount ?? null,
              activeZombieCount: presentationLod.activeZombieCount ?? null,
              allocatedRootCount: presentationLod.allocatedRootCount ?? null,
              authoredInstancedActiveCount:
                presentationLod.authoredInstancedActiveCount ?? null,
              authoredInstancedBatchCount:
                presentationLod.authoredInstancedBatchCount ?? null,
              detailedActiveCount: presentationLod.detailedActiveCount ?? null,
              detailedCapacity: presentationLod.detailedCapacity ?? null,
              fallbackCount: presentationLod.fallbackCount ?? null,
              instancedActiveCount: presentationLod.instancedActiveCount ?? null,
              rootCapacity: presentationLod.rootCapacity ?? null,
              unpresentedActiveCount: presentationLod.unpresentedActiveCount ?? null,
            }
          : null,
      zombie:
        zombie && typeof zombie === 'object'
          ? {
              activeTargets: zombie.targets?.active ?? null,
              benchmarkRoomSoak: window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.getState?.() ??
                (zombie.benchmarkRoomSoak
                ? {
                    enabled: zombie.benchmarkRoomSoak.enabled ?? false,
                    activeZombieCount:
                      zombie.benchmarkRoomSoak.activeZombieCount ?? null,
                    obstacleDamageSuppressed:
                      zombie.benchmarkRoomSoak.obstacleDamageSuppressed ?? false,
                    phaseHeld: zombie.benchmarkRoomSoak.phaseHeld ?? false,
                    playerProtected: zombie.benchmarkRoomSoak.playerProtected ?? false,
                    reachableSpawnCompletedCount:
                      zombie.benchmarkRoomSoak.reachableSpawnCompletedCount ?? null,
                    representedZombieCount:
                      zombie.benchmarkRoomSoak.representedZombieCount ?? null,
                    rosterRealized: zombie.benchmarkRoomSoak.rosterRealized ?? false,
                    scheduledZombieCount:
                      zombie.benchmarkRoomSoak.scheduledZombieCount ?? null,
                    targetZombieCount:
                      zombie.benchmarkRoomSoak.targetZombieCount ?? null,
                    zombieCapacity: zombie.benchmarkRoomSoak.zombieCapacity ?? null,
                  }
                : null),
              expectedPhase: zombie.expectedPhase ?? null,
              integratedIntoExistingCanvas: zombie.integratedIntoExistingCanvas ?? false,
              night: zombie.night ?? null,
              performance: zombie.performance
                ? {
                    collisionWorldGeneration:
                      zombie.performance.collisionWorldGeneration ?? null,
                    routing: zombie.performance.routing
                      ? {
                          fallbackRebuildCount:
                            zombie.performance.routing.fallbackRebuildCount ?? null,
                          navigationAnchorInvalidationCount:
                            zombie.performance.routing.navigationAnchorInvalidationCount ?? null,
                          navigationAnchoredAgentCount:
                            zombie.performance.routing.navigationAnchoredAgentCount ?? null,
                          navigationIntentCanceledCount:
                            zombie.performance.routing.navigationIntentCanceledCount ?? null,
                          navigationIntentDemandCachedAnchorLostCount:
                            zombie.performance.routing
                              .navigationIntentDemandCachedAnchorLostCount ?? null,
                          navigationIntentDemandCollisionRecoveryCount:
                            zombie.performance.routing
                              .navigationIntentDemandCollisionRecoveryCount ?? null,
                          navigationIntentDemandConnectorChangedCount:
                            zombie.performance.routing
                              .navigationIntentDemandConnectorChangedCount ?? null,
                          navigationIntentDemandRoutePublishedCount:
                            zombie.performance.routing
                              .navigationIntentDemandRoutePublishedCount ?? null,
                          navigationIntentDemandSpawnCount:
                            zombie.performance.routing.navigationIntentDemandSpawnCount ?? null,
                          navigationIntentDemandWorldChangedCount:
                            zombie.performance.routing.navigationIntentDemandWorldChangedCount ??
                            null,
                          navigationIntentIssuedCount:
                            zombie.performance.routing.navigationIntentIssuedCount ?? null,
                          navigationIntentMaximumResolveCountObservedPerTick:
                            zombie.performance.routing
                              .navigationIntentMaximumResolveCountObservedPerTick ?? null,
                          navigationIntentOldestPendingAgeTicks:
                            zombie.performance.routing.navigationIntentOldestPendingAgeTicks ??
                            null,
                          navigationIntentPendingCount:
                            zombie.performance.routing.navigationIntentPendingCount ?? null,
                          navigationIntentResolvedCount:
                            zombie.performance.routing.navigationIntentResolvedCount ?? null,
                          navigationIntentResolveBudgetPerTick:
                            zombie.performance.routing.navigationIntentResolveBudgetPerTick ??
                            null,
                          navigationIntentResolveBudgetViolationCount:
                            zombie.performance.routing
                              .navigationIntentResolveBudgetViolationCount ?? null,
                          navigationIntentResolveCountThisTick:
                            zombie.performance.routing.navigationIntentResolveCountThisTick ??
                            null,
                          navigationTargetCommittedRouteGeneration:
                            zombie.performance.routing
                              .navigationTargetCommittedRouteGeneration ?? null,
                          navigationTargetRequestedRevision:
                            zombie.performance.routing.navigationTargetRequestedRevision ?? null,
                          navigationWorldRevision:
                            zombie.performance.routing.navigationWorldRevision ?? null,
                          navigationSparseSearchAgentSlicesPerTick:
                            zombie.performance.routing.navigationSparseSearchAgentSlicesPerTick ??
                            null,
                          navigationSparseSearchBudgetViolationCount:
                            zombie.performance.routing
                              .navigationSparseSearchBudgetViolationCount ?? null,
                          navigationSparseSearchCandidateVisitsMaximumObservedPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchCandidateVisitsMaximumObservedPerTick ?? null,
                          navigationSparseSearchCandidateVisitsThisTick:
                            zombie.performance.routing
                              .navigationSparseSearchCandidateVisitsThisTick ?? null,
                          navigationSparseSearchCandidateVisitsTotal:
                            zombie.performance.routing.navigationSparseSearchCandidateVisitsTotal ??
                            null,
                          navigationSparseSearchCollisionPredicatesMaximumObservedPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchCollisionPredicatesMaximumObservedPerTick ??
                            null,
                          navigationSparseSearchCollisionPredicatesThisTick:
                            zombie.performance.routing
                              .navigationSparseSearchCollisionPredicatesThisTick ?? null,
                          navigationSparseSearchCollisionPredicatesTotal:
                            zombie.performance.routing
                              .navigationSparseSearchCollisionPredicatesTotal ?? null,
                          navigationSparseSearchCompletedCount:
                            zombie.performance.routing.navigationSparseSearchCompletedCount ?? null,
                          navigationSparseSearchHeapOperationsMaximumObservedPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchHeapOperationsMaximumObservedPerTick ?? null,
                          navigationSparseSearchHeapOperationsThisTick:
                            zombie.performance.routing
                              .navigationSparseSearchHeapOperationsThisTick ?? null,
                          navigationSparseSearchHeapOperationsTotal:
                            zombie.performance.routing.navigationSparseSearchHeapOperationsTotal ??
                            null,
                          navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick ??
                            null,
                          navigationSparseSearchHierarchyNodeVisitsThisTick:
                            zombie.performance.routing
                              .navigationSparseSearchHierarchyNodeVisitsThisTick ?? null,
                          navigationSparseSearchHierarchyNodeVisitsTotal:
                            zombie.performance.routing
                              .navigationSparseSearchHierarchyNodeVisitsTotal ?? null,
                          navigationSparseSearchMaximumCandidateVisitsPerAgentSlice:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumCandidateVisitsPerAgentSlice ?? null,
                          navigationSparseSearchMaximumCandidateVisitsPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumCandidateVisitsPerTick ?? null,
                          navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice ?? null,
                          navigationSparseSearchMaximumCollisionPredicatesPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumCollisionPredicatesPerTick ?? null,
                          navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice ?? null,
                          navigationSparseSearchMaximumHierarchyNodeVisitsPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumHierarchyNodeVisitsPerTick ?? null,
                          navigationSparseSearchMaximumHeapOperationsPerAgentSlice:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumHeapOperationsPerAgentSlice ?? null,
                          navigationSparseSearchMaximumHeapOperationsPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumHeapOperationsPerTick ?? null,
                          navigationSparseSearchMaximumSupportPredicatesPerAgentSlice:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumSupportPredicatesPerAgentSlice ?? null,
                          navigationSparseSearchMaximumSupportPredicatesPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumSupportPredicatesPerTick ?? null,
                          navigationSparseSearchMaximumTargetBuildsPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchMaximumTargetBuildsPerTick ?? null,
                          navigationSparseSearchPendingAgentCount:
                            zombie.performance.routing
                              .navigationSparseSearchPendingAgentCount ?? null,
                          navigationSparseSearchStartedCount:
                            zombie.performance.routing.navigationSparseSearchStartedCount ?? null,
                          navigationSparseSearchSupportPredicatesMaximumObservedPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchSupportPredicatesMaximumObservedPerTick ?? null,
                          navigationSparseSearchSupportPredicatesThisTick:
                            zombie.performance.routing
                              .navigationSparseSearchSupportPredicatesThisTick ?? null,
                          navigationSparseSearchSupportPredicatesTotal:
                            zombie.performance.routing
                              .navigationSparseSearchSupportPredicatesTotal ?? null,
                          navigationSparseSearchTargetBuildsMaximumObservedPerTick:
                            zombie.performance.routing
                              .navigationSparseSearchTargetBuildsMaximumObservedPerTick ?? null,
                          navigationSparseSearchTargetBuildsThisTick:
                            zombie.performance.routing
                              .navigationSparseSearchTargetBuildsThisTick ?? null,
                          navigationSparseSearchTargetBuildsTotal:
                            zombie.performance.routing
                              .navigationSparseSearchTargetBuildsTotal ?? null,
                          graphAttachmentCandidateCount:
                            zombie.performance.routing.graphAttachmentCandidateCount ?? null,
                          graphAttachmentFullSearchCount:
                            zombie.performance.routing.graphAttachmentFullSearchCount ?? null,
                          graphAttachmentSupportCheckCount:
                            zombie.performance.routing.graphAttachmentSupportCheckCount ?? null,
                          maximumResolveCountObservedPerTick:
                            zombie.performance.routing.maximumResolveCountObservedPerTick ?? null,
                          navigationMode:
                            zombie.performance.routing.navigationMode ?? null,
                          rebuildCount: zombie.performance.routing.rebuildCount ?? null,
                          resolveBudgetPerTick:
                            zombie.performance.routing.resolveBudgetPerTick ?? null,
                          resolveCount: zombie.performance.routing.resolveCount ?? null,
                          resolveCountThisTick:
                            zombie.performance.routing.resolveCountThisTick ?? null,
                          simulationTick: zombie.performance.routing.simulationTick ?? null,
                           targetLayerIndex:
                             zombie.performance.routing.targetLayerIndex ?? null,
                           ...Object.fromEntries(
                             expectedRoutingTelemetryKeys.map((key) => [
                               key,
                               zombie.performance.routing[key] ?? null,
                             ]),
                           ),
                         }
                      : null,
                    spatial: zombie.performance.spatial
                      ? {
                          buildCount: zombie.performance.spatial.buildCount ?? null,
                          candidateInspectionCount:
                            zombie.performance.spatial.candidateInspectionCount ?? null,
                          indexedAgentCount:
                            zombie.performance.spatial.indexedAgentCount ?? null,
                          maximumCandidateInspectionsObserved:
                            zombie.performance.spatial.maximumCandidateInspectionsObserved ?? null,
                          maximumCandidateInspectionsPerQuery:
                            zombie.performance.spatial.maximumCandidateInspectionsPerQuery ?? null,
                          overflowQueryCount:
                            zombie.performance.spatial.overflowQueryCount ?? null,
                          pairInspectionCount:
                            zombie.performance.spatial.pairInspectionCount ?? null,
                          queryCount: zombie.performance.spatial.queryCount ?? null,
                          separationNeighborCount:
                            zombie.performance.spatial.separationNeighborCount ?? null,
                          unindexedAgentCount:
                            zombie.performance.spatial.unindexedAgentCount ?? null,
                        }
                      : null,
                  }
                : null,
              phase: zombie.phase ?? null,
              phaseReady: zombie.phaseReady ?? false,
              phaseSecondsRemaining: zombie.phaseSecondsRemaining ?? null,
              status: zombie.status ?? null,
            }
          : null,
    }
  }, ZOMBIE_ENTER_ROOM_EXPECTED_ROUTING_TELEMETRY_KEYS)
  return {
    ...state,
    loaderCount: resolveZombieEnterRoomLoaderCount(state),
  }
}

async function beginZombieEnterRoomSoak(page) {
  return page.evaluate(() => {
    const roomSoak = window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__
    const begun = roomSoak?.begin() ?? null
    if (
      begun?.enabled !== true ||
      begun.obstacleDamageSuppressed !== true ||
      begun.phaseHeld !== true ||
      begun.playerProtected !== true
    ) {
      return begun
    }
    return roomSoak?.requestTargetRoster?.() ?? begun
  })
}

export async function waitForZombieEnterRoomSoakProtection(
  page,
  sleep,
  timeoutMs = 240_000,
) {
  const startedAt = Date.now()
  let last = null
  while (Date.now() - startedAt < timeoutMs) {
    last = await beginZombieEnterRoomSoak(page)
    if (
      last?.enabled === true &&
      last.obstacleDamageSuppressed === true &&
      last.phaseHeld === true &&
      last.playerProtected === true &&
      last.scheduledZombieCount === ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT &&
      last.targetZombieCount === ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT &&
      last.zombieCapacity === ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT
    ) {
      return last
    }
    await sleep(ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs)
  }
  throw new Error(`Zombie Escape room soak did not become active (last=${JSON.stringify(last)})`)
}

async function endZombieEnterRoomSoak(page) {
  return page.evaluate(
    () => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.end() ?? null,
  )
}

async function requestZombieEnterRoomObstacleDelta(page) {
  return page.evaluate((telemetryKeys) => {
    const roomSoak = window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__
    const readTransaction = () => {
      const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
      const routing = zombie?.performance?.routing
      return zombie && routing
        ? {
            collisionWorldGeneration:
              zombie.performance?.collisionWorldGeneration ?? null,
            navigationTargetCommittedRouteGeneration:
              routing.navigationTargetCommittedRouteGeneration ?? null,
            navigationTargetRequestedRevision:
              routing.navigationTargetRequestedRevision ?? null,
            navigationWorldRevision: routing.navigationWorldRevision ?? null,
            ...Object.fromEntries(
              telemetryKeys.map((key) => [key, routing[key] ?? null]),
            ),
          }
        : null
    }
    const transactionBaseline = readTransaction()
    const requestResult = roomSoak?.requestObstacleDelta?.() ?? null
    return {
      requestResult,
      transaction: readTransaction(),
      transactionBaseline,
    }
  }, [
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_AGENT_CAUSAL_KEYS,
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_DELTA_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_OBSTACLE_REFRESH_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_TARGET_ROUTE_TELEMETRY_KEYS,
    ...ZOMBIE_ENTER_ROOM_REFRESH_ADMISSION_TELEMETRY_KEYS,
  ])
}

export async function waitForSettledZombieNight(page, sleep, timeoutMs = 240_000) {
  const startedAt = Date.now()
  let consecutive = 0
  let last = null
  let lastIssues = []
  let previousFrameIdx = null
  while (Date.now() - startedAt < timeoutMs) {
    last = await readZombieEnterRoomState(page)
    lastIssues = zombieEnterRoomBaseIssues(last, { requireRoomSoak: true })
    const frameAdvanced = previousFrameIdx === null || last?.bridge?.frameIdx > previousFrameIdx
    consecutive = lastIssues.length === 0 && frameAdvanced ? consecutive + 1 : 0
    previousFrameIdx = last?.bridge?.frameIdx ?? previousFrameIdx
    if (consecutive >= ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveRosterSamples) return last
    await sleep(ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs)
  }
  throw new Error(
    `Zombie Escape night did not settle (${lastIssues.join('; ') || 'unknown'}; ` +
      `last=${JSON.stringify(summarizeZombieEnterRoomState(last))})`,
  )
}

async function waitForZombieEnterRoomReadiness(
  page,
  sleep,
  {
    expectedInside = false,
    initialSample = null,
    route,
    target,
    timeoutMs = ZOMBIE_ENTER_ROOM_TIMING.premeasurementQuiescenceTimeoutMs,
  },
) {
  const startedAt = Date.now()
  let readiness = createZombieEnterRoomReadinessState()
  if (initialSample) {
    const initialSummary = summarizeZombieEnterRoomState(initialSample)
    readiness = {
      ...readiness,
      lastFrameIdx: initialSummary.bridgeFrameIdx,
      lastPerformance: initialSummary.performance,
      lastQuiescenceValues: zombieEnterRoomQuiescenceValues(initialSummary.performance),
    }
  }
  let lastObservation = null
  while (Date.now() - startedAt < timeoutMs) {
    const sample = await readZombieEnterRoomState(page)
    lastObservation = observeZombieEnterRoomReadiness(readiness, sample, {
      expectedInside,
      route,
      target,
    })
    readiness = lastObservation.state
    if (readiness.ready) {
      return {
        elapsedMs: Date.now() - startedAt,
        readiness,
        sample,
      }
    }
    await sleep(ZOMBIE_ENTER_ROOM_TIMING.readinessPollMs)
  }
  throw new Error(
    `Zombie Escape premeasurement routing did not become quiescent within ${timeoutMs}ms ` +
      `(${lastObservation?.issues.join('; ') || 'routing counters kept changing'}; ` +
      `changed=${JSON.stringify(lastObservation?.changedFields ?? [])}; ` +
      `readiness=${JSON.stringify(readiness)}; ` +
      `last=${JSON.stringify(lastObservation?.summary ?? null)})`,
  )
}

async function holdZombieEnterRoomState(
  page,
  sleep,
  {
    baselineSample,
    durationMs,
    expectedInside,
    requireRoomSoak = false,
    route,
    target,
    trace,
  },
) {
  const startedAt = Date.now()
  const baseline = summarizeZombieEnterRoomState(baselineSample)
  let last = null
  let previousPerformance = baseline.performance
  let sampleCount = 0
  do {
    last = await readZombieEnterRoomState(page)
    const summary = summarizeZombieEnterRoomState(last)
    const issues = zombieEnterRoomStateIssues(last, {
      expectedInside,
      requireRoomSoak,
      route,
      target,
    })
    issues.push(
      ...zombieEnterRoomPerformanceIssues(summary.performance, {
        expectedCollisionWorldGeneration: baseline.performance.collisionWorldGeneration,
        previous: previousPerformance,
      }),
    )
    if (summary.nodeCount !== baseline.nodeCount) {
      issues.push(`scene node count changed from ${baseline.nodeCount} to ${summary.nodeCount}`)
    }
    if (summary.night !== baseline.night) {
      issues.push(`night changed from ${baseline.night} to ${summary.night}`)
    }
    if (
      Math.abs(summary.phaseSecondsRemaining - baseline.phaseSecondsRemaining) > 0.5
    ) {
      issues.push(
        `night countdown drifted from ${baseline.phaseSecondsRemaining} ` +
          `to ${summary.phaseSecondsRemaining}`,
      )
    }
    issues.push(
      ...zombieEnterRoomSteadyRoutingIssues(
        summary.performance,
        baseline.performance,
        'steady room segment',
      ),
    )
    const navigationContract = reduceZombieEnterRoomNavigationContract(
      baseline.performance,
      summary.performance,
      {
        activeZombieCount: summary.activeZombieCount,
        context: `steady room segment inside=${String(expectedInside)}`,
        targetRouteExpectation: 'stable',
      },
    )
    issues.push(...navigationContract.issues)
    if (issues.length > 0) {
      trace?.write({
        baseline,
        deltas: navigationContract.deltas,
        failingSample: summary,
        issues: [...new Set(issues)],
        kind: 'validation',
        name: 'zombie-enter-room-navigation-contract-failure',
        segmentKind: 'steady',
        t: performance.now(),
      })
      throw new Error(
        `steady room state became invalid inside=${expectedInside}: ${issues.join('; ')}`,
      )
    }
    previousPerformance = summary.performance
    sampleCount += 1
    const remainingMs = durationMs - (Date.now() - startedAt)
    if (remainingMs <= 0) break
    await sleep(Math.min(ZOMBIE_ENTER_ROOM_TIMING.steadyPollMs, remainingMs))
  } while (true)
  return { sample: last, sampleCount }
}

async function resolveZombieEnterRoomMovementKeys(page, target) {
  return page.evaluate((nextTarget) => {
    const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
    const state = navigation?.getState()
    if (!(navigation && state)) return null
    const robotProjection = navigation.projectPoint(state.robot)
    const targetProjection = navigation.projectPoint({ ...nextTarget, y: state.robot.y })
    if (!(robotProjection && targetProjection)) return null
    const screenX = targetProjection.clientX - robotProjection.clientX
    const screenY = targetProjection.clientY - robotProjection.clientY
    const magnitude = Math.hypot(screenX, screenY)
    const threshold = magnitude * 0.2
    const keys = []
    if (magnitude > 1) {
      if (Math.abs(screenY) >= threshold) keys.push(screenY < 0 ? 'w' : 's')
      if (Math.abs(screenX) >= threshold) keys.push(screenX < 0 ? 'a' : 'd')
    }
    return {
      distanceMeters: Math.hypot(state.robot.x - nextTarget.x, state.robot.z - nextTarget.z),
      frame: {
        robot: state.robot,
        robotProjection,
        targetProjection,
      },
      keys,
      screenX,
      screenY,
    }
  }, target)
}

export async function runZombieEnterRoomNavigationLeg(
  page,
  input,
  sleep,
  {
    baselineSample,
    expectedInside,
    targetRouteExpectation,
    label,
    requireRoomSoak = false,
    route,
    segmentKind,
    start,
    target,
    trace,
  },
) {
  const startedAt = Date.now()
  const baseline = summarizeZombieEnterRoomState(baselineSample)
  if (!baseline.playerPose) throw new Error(`${label} start pose is unavailable`)
  const startErrorMeters = zombieEnterRoomPlanarDistance(baseline.playerPose, start)
  if (startErrorMeters > ZOMBIE_ENTER_ROOM_TIMING.motionStartToleranceMeters) {
    throw new Error(
      `${label} started ${startErrorMeters.toFixed(3)}m from its declared doorway endpoint`,
    )
  }

  const observations = [baseline]
  const heldKeys = new Set()
  let consecutiveSettledSamples = 0
  let last = baselineSample
  let lastControl = null
  let previousPerformance = baseline.performance
  let sampleCount = 0

  const applyMovementKeys = async (nextKeys) => {
    const desired = new Set(nextKeys)
    for (const key of heldKeys) {
      if (desired.has(key)) continue
      await input.keyUp(key, { intent: `${label} steering release` })
      heldKeys.delete(key)
    }
    for (const key of desired) {
      if (heldKeys.has(key)) continue
      await input.keyDown(key, { intent: `${label} steering hold` })
      heldKeys.add(key)
    }
  }

  trace?.write({
    controller: 'keyboard-camera-relative',
    kind: 'validation',
    label,
    name: 'zombie-enter-room-navigation-leg-request',
    start,
    state: baseline,
    t: performance.now(),
    target,
  })

  try {
    while (Date.now() - startedAt < ZOMBIE_ENTER_ROOM_TIMING.transitionTimeoutMs) {
      lastControl = await resolveZombieEnterRoomMovementKeys(page, target)
      if (!lastControl) throw new Error(`${label} navigation input bridge is unavailable`)
      await applyMovementKeys(
        lastControl.distanceMeters <=
          ZOMBIE_ENTER_ROOM_TIMING.motionInputReleaseToleranceMeters
          ? []
          : lastControl.keys,
      )
      await sleep(ZOMBIE_ENTER_ROOM_TIMING.motionPollMs)

      last = await readZombieEnterRoomState(page)
      const summary = summarizeZombieEnterRoomState(last)
      const issues = zombieEnterRoomBaseIssues(last, { requireRoomSoak })
      issues.push(
        ...zombieEnterRoomPerformanceIssues(summary.performance, {
          expectedCollisionWorldGeneration: baseline.performance.collisionWorldGeneration,
          previous: previousPerformance,
        }),
      )
      observations.push(summary)
      sampleCount += 1
      trace?.write({
        control: lastControl,
        elapsedMs: Date.now() - startedAt,
        frameDelta: summary.bridgeFrameIdx - baseline.bridgeFrameIdx,
        kind: 'validation',
        label,
        name: 'zombie-enter-room-navigation-leg-sample',
        performanceCounterDeltas: subtractZombieEnterRoomNavigationCounters(
          summary.performance,
          baseline.performance,
        ),
        state: summary,
        t: performance.now(),
      })
      if (issues.length > 0) {
        throw new Error(`${label} became invalid while moving: ${[...new Set(issues)].join('; ')}`)
      }
      previousPerformance = summary.performance

      const settledIssues = zombieEnterRoomStateIssues(last, {
        expectedInside,
        requireRoomSoak,
        route,
        target,
      })
      settledIssues.push(
        ...zombieEnterRoomTargetRouteIssues(summary.performance, {
          activeZombieCount: summary.activeZombieCount,
          context: `${segmentKind} shared target route`,
          expectation: targetRouteExpectation,
          previous: baseline.performance,
        }),
      )
      consecutiveSettledSamples =
        settledIssues.length === 0 ? consecutiveSettledSamples + 1 : 0
      if (
        consecutiveSettledSamples < ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveSamples
      ) {
        continue
      }

      await applyMovementKeys([])
      const progressIssues = zombieEnterRoomNavigationLegProgressIssues(observations, {
        start,
        target,
      })
      const navigationContract = reduceZombieEnterRoomNavigationContract(
        baseline.performance,
        summary.performance,
        {
          activeZombieCount: summary.activeZombieCount,
          context: segmentKind,
          targetRouteExpectation,
        },
      )
      const finalIssues = [...new Set([...progressIssues, ...navigationContract.issues])]
      trace?.write({
        controller: 'keyboard-camera-relative',
        deltas: navigationContract.deltas,
        elapsedMs: Date.now() - startedAt,
        issues: finalIssues,
        kind: 'validation',
        label,
        name: 'zombie-enter-room-navigation-leg-complete',
        sampleCount,
        state: summary,
        t: performance.now(),
      })
      if (finalIssues.length > 0) {
        throw new Error(`${label} navigation contract failed: ${finalIssues.join('; ')}`)
      }
      return {
        elapsedMs: Date.now() - startedAt,
        frameAdvanceCount: observations.reduce(
          (total, observation, index) =>
            index > 0 && observation.bridgeFrameIdx > observations[index - 1].bridgeFrameIdx
              ? total + 1
              : total,
          0,
        ),
        sample: last,
        sampleCount,
      }
    }
  } finally {
    await applyMovementKeys([])
  }

  const summary = summarizeZombieEnterRoomState(last)
  const progressIssues = zombieEnterRoomNavigationLegProgressIssues(observations, {
    start,
    target,
  })
  const stateIssues = zombieEnterRoomStateIssues(last, {
    expectedInside,
    requireRoomSoak,
    route,
    target,
  })
  throw new Error(
    `${label} did not continuously reach its doorway endpoint (` +
      `${[...new Set([...progressIssues, ...stateIssues])].join('; ') || 'timeout'}; ` +
      `last=${JSON.stringify(summary)})`,
  )
}

async function waitForRoomState(
  page,
  sleep,
  {
    baselineSample = null,
    expectedInside,
    targetRouteExpectation = null,
    requireRoomSoak = false,
    route,
    segmentKind = 'transition-settle',
    target,
    trace = null,
  },
) {
  const startedAt = Date.now()
  const baseline = baselineSample ? summarizeZombieEnterRoomState(baselineSample) : null
  let consecutive = 0
  let last = null
  let lastIssues = []
  let previousFrameIdx = null
  while (Date.now() - startedAt < ZOMBIE_ENTER_ROOM_TIMING.transitionTimeoutMs) {
    last = await readZombieEnterRoomState(page)
    const baseIssues = zombieEnterRoomBaseIssues(last, { requireRoomSoak })
    if (baseIssues.length > 0) {
      const failingSample = summarizeZombieEnterRoomState(last)
      const navigationContract = baseline
        ? reduceZombieEnterRoomNavigationContract(
            baseline.performance,
            failingSample.performance,
            {
              activeZombieCount: failingSample.activeZombieCount,
              context: `${segmentKind} wait`,
              targetRouteExpectation,
            },
          )
        : null
      trace?.write({
        baseline,
        deltas: navigationContract?.deltas ?? null,
        failingSample,
        issues: [...new Set([...baseIssues, ...(navigationContract?.issues ?? [])])],
        kind: 'validation',
        name: 'zombie-enter-room-navigation-contract-failure',
        segmentKind,
        t: performance.now(),
      })
      throw new Error(`Zombie Escape became invalid: ${baseIssues.join('; ')}`)
    }
    lastIssues = zombieEnterRoomStateIssues(last, {
      expectedInside,
      requireRoomSoak,
      route,
      target,
    })
    if (baseline) {
      lastIssues.push(
        ...zombieEnterRoomTargetRouteIssues(
          summarizeZombieEnterRoomPerformance(last),
          {
            activeZombieCount: last?.zombie?.activeTargets,
            context: `${segmentKind} shared target route`,
            expectation: targetRouteExpectation,
            previous: baseline.performance,
          },
        ),
      )
    }
    const frameAdvanced = previousFrameIdx === null || last?.bridge?.frameIdx > previousFrameIdx
    consecutive = lastIssues.length === 0 && frameAdvanced ? consecutive + 1 : 0
    previousFrameIdx = last?.bridge?.frameIdx ?? previousFrameIdx
    if (consecutive >= ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveSamples) return last
    await sleep(ZOMBIE_ENTER_ROOM_TIMING.pollMs)
  }
  const failingSample = summarizeZombieEnterRoomState(last)
  const navigationContract = baseline
    ? reduceZombieEnterRoomNavigationContract(baseline.performance, failingSample.performance, {
        activeZombieCount: failingSample.activeZombieCount,
        context: `${segmentKind} timeout`,
        targetRouteExpectation,
      })
    : null
  trace?.write({
    baseline,
    deltas: navigationContract?.deltas ?? null,
    failingSample,
    issues: [...new Set([...lastIssues, ...(navigationContract?.issues ?? [])])],
    kind: 'validation',
    name: 'zombie-enter-room-navigation-contract-failure',
    segmentKind,
    t: performance.now(),
  })
  throw new Error(
    `room state did not settle inside=${expectedInside} ` +
      `(${lastIssues.join('; ') || 'unknown'}; ` +
      `last=${JSON.stringify(summarizeZombieEnterRoomState(last))})`,
  )
}

async function runMarkedPhase(mark, label, operation) {
  await mark(`${label}-start`)
  try {
    return await operation()
  } finally {
    await mark(`${label}-end`)
  }
}

export default {
  name: 'landrush-zombie-enter-room',
  fixture: 'outside',
  measurementContract: ({ args = {} } = {}) =>
    createZombieEnterRoomMeasurementContract(args['zombie-detailed-capacity'] ?? 16),
  lifecycle: {
    captureInitialCheckpoint: false,
    watchdog: false,
    warmupSeconds: 20,
  },
  urlParams: () =>
    `${benchmarkParams('outside')}&game=zombie-escape&landrushNavDebug=1&` +
    'landrushZombieRoomSoak=1',
  async prepare({ bridge, minutes, page, recordEvidence, scenarioContract, sleep, trace }) {
    preparedMeasurementContract = createZombieEnterRoomMeasurementContract(
      scenarioContract?.presentation?.detailedActiveCount ?? 16,
    )
    const requestedDurationMs = scenarioDurationMs(minutes)
    if (
      !Number.isFinite(requestedDurationMs) ||
      requestedDurationMs < ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS
    ) {
      throw new Error(
        `zombie room benchmark requires at least ` +
          `${ZOMBIE_ENTER_ROOM_MINIMUM_MEASUREMENT_MS / 60_000} measured minutes`,
      )
    }
    if (preparePass === 0) {
      await waitForWorldLayout(page)
      await waitForSceneNodes(bridge, 1)
      await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
      preparedEntryRoute ??= await findTraversableLandrushExteriorEntryRoute(page, sleep)
      if (!preparedEntryRoute) {
        throw new Error('zombie room benchmark could not find a traversable exterior doorway')
      }
      if (
        !(await placeLandrushPlayerAt(
          page,
          preparedEntryRoute.outside,
          'benchmark-zombie-room-ready',
        ))
      ) {
        throw new Error('zombie room benchmark could not stage the player outside')
      }
      const floor = await waitForStableFloorState(page, sleep)
      if (floor?.insideBuilding) {
        throw new Error('zombie room benchmark outside side resolved inside the building')
      }
      await waitForZombieEnterRoomSoakProtection(page, sleep)
      preparePass = 1
      return
    }

    const roomSoak = await waitForZombieEnterRoomSoakProtection(page, sleep)
    const settledNight = await waitForSettledZombieNight(page, sleep)
    if (
      !(await placeLandrushPlayerAt(
        page,
        preparedEntryRoute.outside,
        'benchmark-zombie-room-night-ready',
      ))
    ) {
      throw new Error('zombie room benchmark could not restage the player outside')
    }
    const stagedOutside = await waitForRoomState(page, sleep, {
      expectedInside: false,
      requireRoomSoak: true,
      route: preparedEntryRoute,
      target: preparedEntryRoute.outside,
    })
    if (
      !(await placeLandrushPlayerAt(
        page,
        preparedEntryRoute.inside,
        'benchmark-zombie-room-prime-inside',
      ))
    ) {
      throw new Error('zombie room benchmark could not prime the inside routing state')
    }
    const primedInside = await waitForRoomState(page, sleep, {
      expectedInside: true,
      requireRoomSoak: true,
      route: preparedEntryRoute,
      target: preparedEntryRoute.inside,
    })
    if (
      !(await placeLandrushPlayerAt(
        page,
        preparedEntryRoute.outside,
        'benchmark-zombie-room-prime-outside',
      ))
    ) {
      throw new Error('zombie room benchmark could not restore the primed outside routing state')
    }
    const primedOutside = await waitForRoomState(page, sleep, {
      expectedInside: false,
      requireRoomSoak: true,
      route: preparedEntryRoute,
      target: preparedEntryRoute.outside,
    })
    const quiescence = await waitForZombieEnterRoomReadiness(page, sleep, {
      route: preparedEntryRoute,
      target: preparedEntryRoute.outside,
    })
    preparedQuiescencePerformance = summarizeZombieEnterRoomPerformance(quiescence.sample)
    const readinessEvidence = {
      expectedActiveZombieCount: ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT,
      measurementContract: preparedMeasurementContract,
      primedInside: summarizeZombieEnterRoomState(primedInside),
      primedOutside: summarizeZombieEnterRoomState(primedOutside),
      quiescence: {
        elapsedMs: quiescence.elapsedMs,
        readiness: quiescence.readiness,
        state: summarizeZombieEnterRoomState(quiescence.sample),
      },
      roomSoak,
      settledNight: summarizeZombieEnterRoomState(settledNight),
      stagedOutside: summarizeZombieEnterRoomState(stagedOutside),
    }
    recordEvidence?.('zombie-enter-room-readiness', readinessEvidence)
    trace.write({
      ...readinessEvidence,
      kind: 'validation',
      name: 'zombie-enter-room-premeasurement-ready',
      t: performance.now(),
    })
    preparePass += 1
  },
  async execute({ input, mark, minutes, page, recordEvidence, scenarioContract, sleep, trace }) {
    preparedMeasurementContract = createZombieEnterRoomMeasurementContract(
      scenarioContract?.presentation?.detailedActiveCount ?? 16,
    )
    const requestedDurationMs = scenarioDurationMs(minutes)
    const startedAt = performance.now()
    const comparisonSegments = []
    const stages = []
    let validity = createZombieEnterRoomValidityState()
    let executionError = null
    let latestPresentation = null
    let roomSoakBegan = false

    const publishEvidence = (issues = []) => {
      const combinedIssues = [...new Set([...validity.issues, ...issues])]
      recordEvidence?.('zombie-enter-room', {
        issues: combinedIssues,
        latestPresentation,
        measurementContract: preparedMeasurementContract,
        route: preparedEntryRoute,
        comparisonSegments: comparisonSegments.map((segment) => ({ ...segment })),
        stableValidity: {
          ...validity,
          pass:
            combinedIssues.length === 0 &&
            validity.completedCycles > 1 &&
            validity.activeZombieCountMin === ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT &&
            validity.activeZombieCountMax === ZOMBIE_ENTER_ROOM_EXPECTED_ZOMBIE_COUNT &&
            validity.nextStageIndex === 0,
        },
        stages: stages.map((stage) => ({ ...stage })),
        timings: { ...ZOMBIE_ENTER_ROOM_TIMING, requestedDurationMs },
      })
    }

    const recordStage = (cycle, stage, expectedInside, target, sample) => {
      const navigationBaseline = validity.lastPerformance
      const observed = observeZombieEnterRoomStage(validity, sample, {
        cycle,
        expectedInside,
        route: preparedEntryRoute,
        stage,
        target,
      })
      validity = observed.state
      latestPresentation = observed.summary.presentation
      const evidence = {
        cycle,
        elapsedMs: performance.now() - startedAt,
        issues: observed.issues,
        navigationContract: observed.navigationContract,
        stage,
        state: observed.summary,
      }
      stages.push(evidence)
      trace.write({
        ...evidence,
        kind: 'validation',
        name: 'zombie-enter-room-stage',
        navigationBaseline,
        t: performance.now(),
      })
      if (observed.navigationContract?.issues.length > 0) {
        trace.write({
          baseline: navigationBaseline,
          deltas: observed.navigationContract.deltas,
          failingSample: observed.summary.performance,
          issues: observed.navigationContract.issues,
          kind: 'validation',
          name: 'zombie-enter-room-navigation-contract-failure',
          segmentKind: stage === 'entered' || stage === 'exited' ? 'transition' : 'steady',
          stage,
          t: performance.now(),
        })
      }
      publishEvidence(observed.issues)
      if (observed.issues.length > 0) {
        throw new Error(`invalid zombie room ${stage} state: ${observed.issues.join('; ')}`)
      }
    }

    const recordComparisonSegment = ({
      completedCyclesAtStart,
      elapsedStartMs,
      label,
      observations,
      startSample,
      endSample,
    }) => {
      const startState = summarizeZombieEnterRoomState(startSample)
      const endState = summarizeZombieEnterRoomState(endSample)
      const segment = {
        completedCyclesAtEnd: validity.completedCycles,
        completedCyclesAtStart,
        durationMs: performance.now() - startedAt - elapsedStartMs,
        elapsedEndMs: performance.now() - startedAt,
        elapsedStartMs,
        label,
        observations,
        performanceCounterDeltas: subtractZombieEnterRoomPerformanceCounters(
          endState.performance,
          startState.performance,
        ),
        startState,
        endState,
      }
      comparisonSegments.push(segment)
      trace.write({
        ...segment,
        kind: 'validation',
        name: 'zombie-enter-room-comparison-segment',
        t: performance.now(),
      })
      publishEvidence()
    }

    try {
      const roomSoak = await beginZombieEnterRoomSoak(page)
      if (
        roomSoak?.enabled !== true ||
        roomSoak.obstacleDamageSuppressed !== true ||
        roomSoak.phaseHeld !== true ||
        roomSoak.playerProtected !== true
      ) {
        throw new Error(`zombie room soak did not begin: ${JSON.stringify(roomSoak)}`)
      }
      roomSoakBegan = true
      let currentSample = await readZombieEnterRoomState(page)
      latestPresentation = summarizeZombieEnterRoomState(currentSample).presentation
      const currentPerformance = summarizeZombieEnterRoomPerformance(currentSample)
      const initialIssues = zombieEnterRoomStateIssues(currentSample, {
        expectedInside: false,
        requireRoomSoak: true,
        route: preparedEntryRoute,
        target: preparedEntryRoute.outside,
      })
      initialIssues.push(...zombieEnterRoomRoutingPrimingIssues(currentPerformance))
      let readinessBoundaryContract = null
      if (preparedQuiescencePerformance) {
        if (
          currentPerformance.collisionWorldGeneration !==
          preparedQuiescencePerformance.collisionWorldGeneration
        ) {
          initialIssues.push('collision world generation changed after the readiness gate')
        }
        initialIssues.push(
          ...zombieEnterRoomSteadyRoutingIssues(
            currentPerformance,
            preparedQuiescencePerformance,
            'the readiness-to-measurement boundary',
          ),
        )
        readinessBoundaryContract = reduceZombieEnterRoomNavigationContract(
          preparedQuiescencePerformance,
          currentPerformance,
          {
            activeZombieCount: currentSample?.zombie?.activeTargets,
            context: 'readiness-to-measurement boundary',
            targetRouteExpectation: 'stable',
          },
        )
        initialIssues.push(...readinessBoundaryContract.issues)
      } else {
        initialIssues.push('premeasurement routing readiness was not recorded')
      }
      if (initialIssues.length > 0) {
        trace.write({
          baseline: preparedQuiescencePerformance,
          deltas: readinessBoundaryContract?.deltas ?? null,
          failingSample: currentPerformance,
          issues: [...new Set(initialIssues)],
          kind: 'validation',
          name: 'zombie-enter-room-navigation-contract-failure',
          segmentKind: 'readiness-boundary',
          t: performance.now(),
        })
        throw new Error(`zombie room measurement started invalid: ${initialIssues.join('; ')}`)
      }
      validity = primeZombieEnterRoomValidityState(validity, currentSample)
      trace.write({
        kind: 'validation',
        name: 'zombie-enter-room-ready',
        route: preparedEntryRoute,
        roomSoak,
        state: summarizeZombieEnterRoomState(currentSample),
        t: performance.now(),
      })

      let segmentStartedAt = performance.now() - startedAt
      let segmentCyclesAtStart = validity.completedCycles
      let segmentStartSample = currentSample
      const outsideHold = await runMarkedPhase(
        mark,
        ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.steadyOutside,
        () =>
          holdZombieEnterRoomState(page, sleep, {
            baselineSample: currentSample,
            durationMs: ZOMBIE_ENTER_ROOM_TIMING.steadyHoldMs,
            expectedInside: false,
            requireRoomSoak: true,
            route: preparedEntryRoute,
            target: preparedEntryRoute.outside,
            trace,
          }),
      )
      currentSample = outsideHold.sample
      recordStage(1, 'outside-hold', false, preparedEntryRoute.outside, currentSample)
      recordComparisonSegment({
        completedCyclesAtStart: segmentCyclesAtStart,
        elapsedStartMs: segmentStartedAt,
        label: ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.steadyOutside,
        observations: { sampleCount: outsideHold.sampleCount },
        startSample: segmentStartSample,
        endSample: currentSample,
      })

      segmentStartedAt = performance.now() - startedAt
      segmentCyclesAtStart = validity.completedCycles
      segmentStartSample = currentSample
      const entryLeg = await runMarkedPhase(
        mark,
        ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.entry,
        async () => {
          const label = 'benchmark-zombie-room-single-entry'
          const leg = await runZombieEnterRoomNavigationLeg(
            page,
            input,
            sleep,
            {
              baselineSample: currentSample,
              expectedInside: true,
              targetRouteExpectation: 'published',
              label,
              requireRoomSoak: true,
              route: preparedEntryRoute,
              segmentKind: 'single-entry',
              start: preparedEntryRoute.outside,
              target: preparedEntryRoute.inside,
              trace,
            },
          )
          recordStage(1, 'entered', true, preparedEntryRoute.inside, leg.sample)
          return leg
        },
      )
      currentSample = entryLeg.sample
      recordComparisonSegment({
        completedCyclesAtStart: segmentCyclesAtStart,
        elapsedStartMs: segmentStartedAt,
        label: ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.entry,
        observations: {
          frameAdvanceCount: entryLeg.frameAdvanceCount,
          motionSampleCount: entryLeg.sampleCount,
          requiredConsecutiveSettledSamples:
            ZOMBIE_ENTER_ROOM_TIMING.requiredConsecutiveSamples,
        },
        startSample: segmentStartSample,
        endSample: currentSample,
      })

      segmentStartedAt = performance.now() - startedAt
      segmentCyclesAtStart = validity.completedCycles
      segmentStartSample = currentSample
      const obstacleDelta = await runMarkedPhase(
        mark,
        ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.obstacleDelta,
        async () => {
          const request = await requestZombieEnterRoomObstacleDelta(page)
          const requestResult = request?.requestResult ?? null
          const appliedSample = await readZombieEnterRoomState(page)
          const quiescence = await waitForZombieEnterRoomReadiness(page, sleep, {
            expectedInside: true,
            initialSample: appliedSample,
            route: preparedEntryRoute,
            target: preparedEntryRoute.inside,
          })
          const baseline = summarizeZombieEnterRoomState(currentSample)
          const applied = summarizeZombieEnterRoomState(appliedSample)
          const settled = summarizeZombieEnterRoomState(quiescence.sample)
          const obstacleContract = reduceZombieEnterRoomObstacleDeltaContract(
            baseline.performance,
            settled.performance,
            {
              appliedPerformance: applied.performance,
              context: 'production obstacle delta',
              requestResult,
              roomSoak: settled.roomSoak,
              transaction: request?.transaction ?? null,
              transactionBaseline: request?.transactionBaseline ?? null,
            },
          )
          const navigationContract = reduceZombieEnterRoomNavigationContract(
            baseline.performance,
            settled.performance,
            {
              activeZombieCount: settled.activeZombieCount,
              context: 'production obstacle delta navigation',
              targetRouteExpectation: 'stable',
              expectedWorldRevisionDelta: 1,
            },
          )
          const issues = [...new Set([
            ...obstacleContract.issues,
            ...navigationContract.issues,
          ])]
          trace.write({
            applied,
            elapsedMs: performance.now() - startedAt,
            issues,
            kind: 'validation',
            name: 'zombie-enter-room-obstacle-delta',
            navigationContract,
            obstacleContract,
            quiescence: {
              elapsedMs: quiescence.elapsedMs,
              readiness: quiescence.readiness,
            },
            requestResult,
            transaction: request?.transaction ?? null,
            transactionBaseline: request?.transactionBaseline ?? null,
            settled,
            t: performance.now(),
          })
          if (issues.length > 0) {
            throw new Error(`invalid production obstacle delta: ${issues.join('; ')}`)
          }
          return { applied, obstacleContract, quiescence, requestResult }
        },
      )
      currentSample = obstacleDelta.quiescence.sample
      const obstacleState = summarizeZombieEnterRoomState(currentSample)
      validity = {
        ...validity,
        collisionWorldGeneration: obstacleState.performance.collisionWorldGeneration,
        lastFrameIdx: obstacleState.bridgeFrameIdx,
        lastPerformance: obstacleState.performance,
        performanceCounterDeltas: subtractZombieEnterRoomPerformanceCounters(
          obstacleState.performance,
          validity.performanceBaseline,
        ),
      }
      recordComparisonSegment({
        completedCyclesAtStart: segmentCyclesAtStart,
        elapsedStartMs: segmentStartedAt,
        label: ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.obstacleDelta,
        observations: {
          appliedState: obstacleDelta.applied,
          quiescenceElapsedMs: obstacleDelta.quiescence.elapsedMs,
          quiescenceSampleCount: obstacleDelta.quiescence.readiness.sampleCount,
          requestResult: obstacleDelta.requestResult,
        },
        startSample: segmentStartSample,
        endSample: currentSample,
      })

      segmentStartedAt = performance.now() - startedAt
      segmentCyclesAtStart = validity.completedCycles
      segmentStartSample = currentSample
      const insideHold = await runMarkedPhase(
        mark,
        ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.steadyInside,
        () =>
          holdZombieEnterRoomState(page, sleep, {
            baselineSample: currentSample,
            durationMs: ZOMBIE_ENTER_ROOM_TIMING.steadyHoldMs,
            expectedInside: true,
            requireRoomSoak: true,
            route: preparedEntryRoute,
            target: preparedEntryRoute.inside,
          }),
      )
      currentSample = insideHold.sample
      recordStage(1, 'inside-hold', true, preparedEntryRoute.inside, currentSample)
      recordComparisonSegment({
        completedCyclesAtStart: segmentCyclesAtStart,
        elapsedStartMs: segmentStartedAt,
        label: ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.steadyInside,
        observations: { sampleCount: insideHold.sampleCount },
        startSample: segmentStartSample,
        endSample: currentSample,
      })

      segmentStartedAt = performance.now() - startedAt
      segmentCyclesAtStart = validity.completedCycles
      segmentStartSample = currentSample
      let stressStageCount = 0
      await runMarkedPhase(
        mark,
        ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.transitionStress,
        async () => {
          await runMarkedPhase(mark, 'zombie-enter-room-cycle-1-stage-outside', async () => {
            const label = 'benchmark-zombie-room-stage-outside-1'
            const leg = await runZombieEnterRoomNavigationLeg(page, input, sleep, {
              baselineSample: currentSample,
              expectedInside: false,
              targetRouteExpectation: 'published',
              label,
              requireRoomSoak: true,
              route: preparedEntryRoute,
              segmentKind: 'cycle-1-exit',
              start: preparedEntryRoute.inside,
              target: preparedEntryRoute.outside,
              trace,
            })
            currentSample = leg.sample
            stressStageCount += 1
            recordStage(1, 'exited', false, preparedEntryRoute.outside, currentSample)
          })

          do {
            const cycle = validity.completedCycles + 1
            await runMarkedPhase(
              mark,
              `zombie-enter-room-cycle-${cycle}-outside-hold`,
              async () => {
                await sleep(ZOMBIE_ENTER_ROOM_TIMING.holdMs)
                currentSample = await waitForRoomState(page, sleep, {
                  baselineSample: currentSample,
                  expectedInside: false,
                  targetRouteExpectation: 'stable',
                  requireRoomSoak: true,
                  route: preparedEntryRoute,
                  segmentKind: `cycle-${String(cycle)}-outside-hold`,
                  target: preparedEntryRoute.outside,
                  trace,
                })
                stressStageCount += 1
                recordStage(
                  cycle,
                  'outside-hold',
                  false,
                  preparedEntryRoute.outside,
                  currentSample,
                )
              },
            )

            await runMarkedPhase(
              mark,
              `zombie-enter-room-cycle-${cycle}-stage-inside`,
              async () => {
                const label = `benchmark-zombie-room-stage-inside-${cycle}`
                const leg = await runZombieEnterRoomNavigationLeg(page, input, sleep, {
                  baselineSample: currentSample,
                  expectedInside: true,
                  targetRouteExpectation: 'published',
                  label,
                  requireRoomSoak: true,
                  route: preparedEntryRoute,
                  segmentKind: `cycle-${String(cycle)}-entry`,
                  start: preparedEntryRoute.outside,
                  target: preparedEntryRoute.inside,
                  trace,
                })
                currentSample = leg.sample
                stressStageCount += 1
                recordStage(cycle, 'entered', true, preparedEntryRoute.inside, currentSample)
              },
            )

            await runMarkedPhase(
              mark,
              `zombie-enter-room-cycle-${cycle}-inside-hold`,
              async () => {
                await sleep(ZOMBIE_ENTER_ROOM_TIMING.holdMs)
                currentSample = await waitForRoomState(page, sleep, {
                  baselineSample: currentSample,
                  expectedInside: true,
                  targetRouteExpectation: 'stable',
                  requireRoomSoak: true,
                  route: preparedEntryRoute,
                  segmentKind: `cycle-${String(cycle)}-inside-hold`,
                  target: preparedEntryRoute.inside,
                  trace,
                })
                stressStageCount += 1
                recordStage(cycle, 'inside-hold', true, preparedEntryRoute.inside, currentSample)
              },
            )

            await runMarkedPhase(
              mark,
              `zombie-enter-room-cycle-${cycle}-stage-outside`,
              async () => {
                const label = `benchmark-zombie-room-stage-outside-${cycle}`
                const leg = await runZombieEnterRoomNavigationLeg(page, input, sleep, {
                  baselineSample: currentSample,
                  expectedInside: false,
                  targetRouteExpectation: 'published',
                  label,
                  requireRoomSoak: true,
                  route: preparedEntryRoute,
                  segmentKind: `cycle-${String(cycle)}-exit`,
                  start: preparedEntryRoute.inside,
                  target: preparedEntryRoute.outside,
                  trace,
                })
                currentSample = leg.sample
                stressStageCount += 1
                recordStage(cycle, 'exited', false, preparedEntryRoute.outside, currentSample)
              },
            )
          } while (performance.now() - startedAt < requestedDurationMs)
        },
      )
      recordComparisonSegment({
        completedCyclesAtStart: segmentCyclesAtStart,
        elapsedStartMs: segmentStartedAt,
        label: ZOMBIE_ENTER_ROOM_COMPARISON_SEGMENTS.transitionStress,
        observations: { recordedStageCount: stressStageCount },
        startSample: segmentStartSample,
        endSample: currentSample,
      })
    } catch (error) {
      executionError = error
    } finally {
      try {
        const roomSoak = await endZombieEnterRoomSoak(page)
        trace.write({
          kind: 'validation',
          name: 'zombie-enter-room-soak-ended',
          roomSoak,
          t: performance.now(),
        })
        const cleanupIssues = zombieEnterRoomSoakCleanupIssues(roomSoak, { roomSoakBegan })
        if (cleanupIssues.length > 0) {
          throw new Error(cleanupIssues.join('; '))
        }
      } catch (error) {
        executionError ??= error
      }
    }

    const elapsedMs = performance.now() - startedAt
    const finalIssues = collectZombieEnterRoomFinalIssues({
      elapsedMs,
      requestedDurationMs,
      validity,
    })
    trace.write({
      elapsedMs,
      issues: finalIssues,
      kind: 'validation',
      name: 'zombie-enter-room-final',
      stages,
      t: performance.now(),
      validity,
    })
    publishEvidence(finalIssues)
    if (executionError) throw executionError
    if (finalIssues.length > 0) {
      throw new Error(`invalid zombie room run: ${finalIssues.join('; ')}`)
    }
  },
}
