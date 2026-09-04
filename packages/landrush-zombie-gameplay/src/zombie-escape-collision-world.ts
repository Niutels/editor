import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import {
  ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS as COLLISION_EPSILON_METERS,
  ZOMBIE_ESCAPE_GEOMETRY_EPSILON as INTERSECTION_EPSILON,
  ZOMBIE_ESCAPE_NAVIGATION_AGENT_HEIGHT_METERS as NAVIGATION_AGENT_HEIGHT_METERS,
} from './zombie-escape-collision-tolerances'
import {
  ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
  ZOMBIE_ESCAPE_SIMULATION,
} from './zombie-escape-config'
import {
  createEmptyZombieEscapeSparseNavigationGraph,
  createZombieEscapeSparseNavigationGraph,
  resolveSparseNavigationStrictRegionWitnessNode,
  sparseNavigationTargetRegionContainsPoint,
  type ZombieEscapeSparseNavigationCandidatePoint,
  type ZombieEscapeSparseNavigationGraph,
  type ZombieEscapeSparseNavigationPairTraversal,
} from './zombie-escape-sparse-navigation'

export type {
  ZombieEscapeSparseNavigationAdjacency,
  ZombieEscapeSparseNavigationGraph,
} from './zombie-escape-sparse-navigation'

const DEFAULT_NAVIGATION_CELL_SIZE_METERS = 0.25
const DEFAULT_BROADPHASE_CELL_SIZE_METERS = 2
const FLOW_TARGET_CELL_STRIDE = 2
const FLOW_UNREACHABLE = 0xffff_ffff
const FLOW_STRICT_UNBUILT = -2
const FLOW_FALLBACK_UNBUILT = -2
const COLLISION_SWEEP_ITERATIONS = 3
const NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS = 0.35
const NAVIGATION_CONNECTOR_TARGET_LANDING_TOLERANCE_METERS = 0.4
const NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS = 0.12
const NAVIGATION_SUPPORT_EDGE_LEAF_SIZE = 8
const NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE_SQUARED = 1e-12
const NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE = Math.sqrt(
  NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE_SQUARED,
)
const SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT = 10
const SPARSE_REVERSE_FIELD_BANK_COUNT = 2
const UNBOUNDED_SPARSE_SEARCH_BUDGET: ZombieEscapeSparseSearchBudget = {
  maximumCandidateVisits: Number.POSITIVE_INFINITY,
  maximumCollisionPredicates: Number.POSITIVE_INFINITY,
  maximumHeapOperations: Number.POSITIVE_INFINITY,
  maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
  maximumSupportPredicates: Number.POSITIVE_INFINITY,
}
const UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET: ZombieEscapeSparseTargetUpdateBudget = {
  ...UNBOUNDED_SPARSE_SEARCH_BUDGET,
  maximumGraphEdgeVisits: Number.POSITIVE_INFINITY,
  maximumHeapOperations: Number.POSITIVE_INFINITY,
}
const FLOW_NEIGHBOR_X = new Int8Array([0, 1, 0, -1, 1, 1, -1, -1])
const FLOW_NEIGHBOR_Z = new Int8Array([-1, 0, 1, 0, -1, 1, 1, -1])

type GridAabbBounds = Readonly<{
  maximumColumn: number
  maximumRow: number
  minimumColumn: number
  minimumRow: number
}>

type CollisionAabbBounds = Readonly<{
  maximumX: number
  maximumZ: number
  minimumX: number
  minimumZ: number
}>

export type ZombieEscapeCollisionEndCap = 'flat' | 'round'
export type ZombieEscapeCollisionBoundaryPolicy = 'none' | 'solid'

export const ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND = {
  other: 0,
  door: 1,
  furniture: 2,
} as const

export type ZombieEscapeCollisionObjectSemanticKind =
  (typeof ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND)[keyof typeof ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND]

export type ZombieEscapeCollisionObjectSemanticSource = Readonly<{
  objectId: string
  semanticKind: ZombieEscapeCollisionObjectSemanticKind
}>

export type ZombieEscapeCollisionCircleSource = Readonly<{
  breakable?: boolean
  id: string
  maximumY?: number
  minimumY?: number
  navigationLayerY?: number
  objectId?: string
  radius: number
  x: number
  z: number
}>

export type ZombieEscapeCollisionSegmentSource = Readonly<{
  breakable?: boolean
  endCap?: ZombieEscapeCollisionEndCap
  endX: number
  endZ: number
  halfThickness: number
  id: string
  maximumY?: number
  minimumY?: number
  navigationLayerY?: number
  objectId?: string
  startCap?: ZombieEscapeCollisionEndCap
  startX: number
  startZ: number
}>

export type ZombieEscapeCollisionBoxSource = Readonly<{
  breakable?: boolean
  centerX: number
  centerZ: number
  halfDepth: number
  halfWidth: number
  id: string
  maximumY?: number
  minimumY?: number
  navigationLayerY?: number
  objectId?: string
  rotation: number
}>

export type ZombieEscapeNavigationConnectorSource = Readonly<{
  ascendingEnd: boolean
  chainId: string
  chainLowerY: number
  chainOrder: number
  chainUpperY: number
  endX: number
  endY: number
  endZ: number
  halfWidth: number
  id: string
  objectId?: string
  startX: number
  startY: number
  startZ: number
}>

export type ZombieEscapeNavigationSupportSource = Readonly<{
  boundary?: boolean
  elevation: number
  holes?: readonly (readonly Readonly<{ x: number; z: number }>[])[]
  id: string
  polygon: readonly Readonly<{ x: number; z: number }>[]
}>

export type ZombieEscapeCollisionCircle = Readonly<{
  breakable: boolean
  id: string
  maximumY: number
  minimumY: number
  navigationLayerY: number
  objectId: string
  radius: number
  x: number
  z: number
}>

export type ZombieEscapeCollisionSegment = Readonly<{
  breakable: boolean
  endCap: ZombieEscapeCollisionEndCap
  endX: number
  endZ: number
  halfThickness: number
  id: string
  maximumY: number
  minimumY: number
  navigationLayerY: number
  objectId: string
  startCap: ZombieEscapeCollisionEndCap
  startX: number
  startZ: number
}>

export type ZombieEscapeCollisionBox = Readonly<{
  breakable: boolean
  centerX: number
  centerZ: number
  cosine: number
  halfDepth: number
  halfWidth: number
  id: string
  maximumY: number
  minimumY: number
  navigationLayerY: number
  objectId: string
  rotation: number
  sine: number
}>

export type ZombieEscapeNavigationConnector = Readonly<{
  ascendingEnd: boolean
  chainId: string
  chainLowerY: number
  chainOrder: number
  chainUpperY: number
  directionX: number
  directionZ: number
  endCell: number
  endLayerIndex: number
  endX: number
  endY: number
  endZ: number
  halfWidth: number
  id: string
  length: number
  objectId: string
  startCell: number
  startLayerIndex: number
  startX: number
  startY: number
  startZ: number
}>

type ZombieEscapeNavigationConnectorEdge = Readonly<{
  fromNode: number
  toNode: number
}>

export type ZombieEscapeNavigationConnectorAdjacency = Readonly<{
  nodeOffsets: Uint32Array
  toNodes: Int32Array
}>

export type ZombieEscapeNavigationLayer = Readonly<{
  breakableOpenOccupancy: Uint8Array
  elevation: number
  occupancy: Uint8Array
  support: Uint8Array
}>

export type ZombieEscapeCollisionBroadphase = Readonly<{
  candidateIndices: Uint32Array
  cellOffsets: Uint32Array
  cellSize: number
  cellVisitStamps: Uint32Array
  colliderIndices: Uint32Array
  gridHeight: number
  gridOriginX: number
  gridOriginZ: number
  gridWidth: number
  visitEpoch: Uint32Array
  visitStamps: Uint32Array
}>

export type ZombieEscapeNavigationBoundsHierarchy = Readonly<{
  itemIndices: Uint32Array
  nodeItemCounts: Uint32Array
  nodeItemOffsets: Uint32Array
  nodeMaximumXs: Float64Array
  nodeMaximumZs: Float64Array
  nodeMinimumXs: Float64Array
  nodeMinimumZs: Float64Array
  nodeSkipIndices: Uint32Array
}>

export type ZombieEscapeNavigationSupportRingAcceleration = Readonly<{
  edgeCount: number
  hierarchy: ZombieEscapeNavigationBoundsHierarchy
}>

export type ZombieEscapeNavigationSupportAccelerationEntry = Readonly<{
  bounds: CollisionAabbBounds
  capsuleFollowsValidatedDisks: boolean
  convexInteriorSign: number
  edgeCount: number
  rings: readonly ZombieEscapeNavigationSupportRingAcceleration[]
}>

export type ZombieEscapeNavigationSupportLayerAcceleration = Readonly<{
  hierarchy: ZombieEscapeNavigationBoundsHierarchy
  supportIndices: Int32Array
  totalEdgeCount: number
}>

export type ZombieEscapeNavigationSupportAcceleration = Readonly<{
  layers: readonly ZombieEscapeNavigationSupportLayerAcceleration[]
  supports: readonly ZombieEscapeNavigationSupportAccelerationEntry[]
}>

export type ZombieEscapeNavigationAttachmentAcceleration = Readonly<{
  layers: readonly ZombieEscapeNavigationBoundsHierarchy[]
}>

export type ZombieEscapeCollisionObjectCatalog = Readonly<{
  breakableObjectOrdinals: Uint32Array
  colliderObjectOrdinals: Int32Array
  connectorObjectOrdinals: Int32Array
  objectHasCollider: Uint8Array
  objectHasConnector: Uint8Array
  objectIds: readonly string[]
  objectSemanticKinds: Uint8Array
  objectSupportsMaskRemoval: Uint8Array
}>

export type ZombieEscapeCollisionObjectDeltaStatus =
  | 'changed'
  | 'invalidated'
  | 'missing'
  | 'requires-recompile'
  | 'unchanged'

export type ZombieEscapeCollisionObjectDeltaResult = {
  allocationCount: number
  fullArrayClearCount: number
  objectLookupComparisons: number
  objectMaskWrites: number
  objectOrdinal: number
  revisionAdvanceCount: number
  revisionAfter: string
  revisionBefore: string
  status: ZombieEscapeCollisionObjectDeltaStatus
  worldCompileCount: number
}

export type ZombieEscapeSparseSearchStatus =
  | 'found'
  | 'invalidated'
  | 'pending'
  | 'routePublished'
  | 'unreachable'

export type ZombieEscapeSparseSearchBudget = Readonly<{
  maximumCandidateVisits: number
  maximumCollisionPredicates: number
  maximumHeapOperations: number
  maximumHierarchyNodeVisits: number
  maximumSupportPredicates: number
}>

export type ZombieEscapeNavigationVisibilityStatus = 'blocked' | 'clear' | 'invalidated' | 'pending'

type ZombieEscapeNavigationVisibilitySupportStage =
  | 'capsule-hole-edge'
  | 'capsule-outer-edge'
  | 'end-hole-edge'
  | 'end-hole-point'
  | 'end-outer-edge'
  | 'end-outer-point'
  | 'start-hole-edge'
  | 'start-hole-point'
  | 'start-outer-edge'
  | 'start-outer-point'

type ZombieEscapeNavigationVisibilityRingMode = 'capsule' | 'convex-capsule' | 'disk' | 'point'

export type ZombieEscapeNavigationVisibilitySearch = {
  breakableCollisionHit: ZombieEscapeCollisionHit
  breakableObjectOrdinals: Set<number>
  breakablesTraversable: boolean
  collisionCandidateIndex: number
  collisionHit: ZombieEscapeCollisionHit
  collisionItemEnd: number
  collisionItemOffset: number
  collisionNodeIndex: number
  endX: number
  endZ: number
  lastStepCandidateVisits: number
  lastStepColliderCandidateVisits: number
  lastStepColliderHierarchyNodeVisits: number
  lastStepCollisionPredicates: number
  lastStepHierarchyNodeVisits: number
  lastStepSupportHierarchyNodeVisits: number
  lastStepSupportHoleVisits: number
  lastStepSupportItemVisits: number
  lastStepSupportPredicates: number
  lastStepSupportRingEdgeVisits: number
  lastStepSupportRingHierarchyNodeVisits: number
  maximumX: number
  maximumZ: number
  minimumX: number
  minimumZ: number
  navigationLayerIndex: number
  phase:
    | 'collision-hierarchy'
    | 'collision-item'
    | 'complete'
    | 'initialize'
    | 'support-hierarchy'
    | 'support-item'
    | 'support-ring'
  radius: number
  ringConvexInteriorSign: number
  ringInside: boolean
  ringItemEnd: number
  ringItemOffset: number
  ringMode: ZombieEscapeNavigationVisibilityRingMode
  ringNodeIndex: number
  ringResult: boolean
  ringTargetX: number
  ringTargetZ: number
  startX: number
  startZ: number
  status: ZombieEscapeNavigationVisibilityStatus
  supportHoleIndex: number
  supportIndex: number
  supportItemEnd: number
  supportItemOffset: number
  supportNodeIndex: number
  supportRingIndex: number
  supportStage: ZombieEscapeNavigationVisibilitySupportStage
  totalCandidateVisits: number
  totalColliderCandidateVisits: number
  totalColliderHierarchyNodeVisits: number
  totalCollisionPredicates: number
  totalHierarchyNodeVisits: number
  totalSupportHierarchyNodeVisits: number
  totalSupportHoleVisits: number
  totalSupportItemVisits: number
  totalSupportPredicates: number
  totalSupportRingEdgeVisits: number
  totalSupportRingHierarchyNodeVisits: number
  worldRevision: string
}

export type ZombieEscapeSparseTargetUpdateStatus = 'invalidated' | 'pending' | 'ready'

export type ZombieEscapeSparseTargetUpdateBudget = ZombieEscapeSparseSearchBudget &
  Readonly<{
    maximumGraphEdgeVisits: number
    maximumHeapOperations: number
  }>

export type ZombieEscapeSparseTargetUpdate = {
  activeForceRebuild: boolean
  activeTargetBucketX: number
  activeTargetBucketZ: number
  activeTargetLayerIndex: number
  activeTargetX: number
  activeTargetY: number
  activeTargetZ: number
  buildBankIndex: number
  buildVariant: number
  bestLayerDistance: number
  candidateOffset: number
  completedAnchorSelectionCount: number
  completedFallbackBuilds: number
  completedStrictBuilds: number
  currentEdge: number
  currentEdgeEnd: number
  currentNode: number
  fallbackInvalidated: boolean
  heapNode: number
  heapPosition: number
  heapReturnPhase: 'build-dijkstra-edges' | 'build-seed-target-nodes'
  heapSize: number
  initializationOffset: number
  layerOffset: number
  lastStepCandidateVisits: number
  lastStepTargetAnchorCandidateVisits: number
  lastStepTargetAnchorVisibilityTests: number
  lastStepColliderCandidateVisits: number
  lastStepColliderHierarchyNodeVisits: number
  lastStepCollisionPredicates: number
  lastStepGraphEdgeVisits: number
  lastStepHeapOperations: number
  lastStepHierarchyNodeVisits: number
  lastStepSupportHierarchyNodeVisits: number
  lastStepSupportHoleVisits: number
  lastStepSupportItemVisits: number
  lastStepSupportPredicates: number
  lastStepSupportRingEdgeVisits: number
  lastStepSupportRingHierarchyNodeVisits: number
  lastStepPublications: number
  phase:
    | 'build-clear-target-marks'
    | 'build-complete'
    | 'build-dijkstra-edges'
    | 'build-dijkstra-pop'
    | 'build-heap-pop'
    | 'build-heap-push'
    | 'build-collect-target-anchors'
    | 'build-reset-nodes'
    | 'build-seed-target-nodes'
    | 'build-select-target-anchors'
    | 'complete'
    | 'initialize'
    | 'resolve-layer'
    | 'wait-staging-bank'
    | 'validate-fallback'
    | 'validate-fallback-visibility'
    | 'validate-strict'
    | 'validate-strict-visibility'
  reachableCount: number
  requestedFallbackBuild: boolean
  requestedForceRebuild: boolean
  requestedStrictBuild: boolean
  requestedTargetBucketX: number
  requestedTargetBucketZ: number
  requestedTargetLayerHint: number
  requestedTargetRevision: number
  requestedTargetX: number
  requestedTargetY: number
  requestedTargetZ: number
  restartCount: number
  routeInvalidationCount: number
  routeTargetInitialized: boolean
  routeTargetBucketX: number
  routeTargetBucketZ: number
  routeTargetLayerIndex: number
  routeTargetX: number
  routeTargetY: number
  routeTargetZ: number
  selectedFallbackAnchorCount: number
  selectedStrictAnchorCount: number
  status: ZombieEscapeSparseTargetUpdateStatus
  strictInvalidated: boolean
  targetNodeOffset: number
  totalCandidateVisits: number
  totalMissingAnchorSelectionCount: number
  totalTargetAnchorCandidateVisits: number
  totalTargetAnchorVisibilityTests: number
  totalColliderCandidateVisits: number
  totalColliderHierarchyNodeVisits: number
  totalCollisionPredicates: number
  totalGraphEdgeVisits: number
  totalHeapOperations: number
  totalHierarchyNodeVisits: number
  totalSupportHierarchyNodeVisits: number
  totalSupportHoleVisits: number
  totalSupportItemVisits: number
  totalSupportPredicates: number
  totalSupportRingEdgeVisits: number
  totalSupportRingHierarchyNodeVisits: number
  validationNodeOffset: number
  visibility: ZombieEscapeNavigationVisibilitySearch
  worldRevision: string
}

export type ZombieEscapeSparseAttachmentSearch = {
  bestAttachmentDistance: number
  bestAttachmentBreachCount: number
  bestAttachmentBreachObjectOrdinals: Set<number>
  bestCost: number
  bestNode: number
  bestRouteBreachCount: number
  bestRouteDistance: number
  bestRouteTravelDistance: number
  breakablesTraversable: boolean
  candidateAttachmentDistance: number
  candidateNode: number
  candidateRouteDistance: number
  hierarchyItemEnd: number
  hierarchyItemOffset: number
  hierarchyHeapCandidatePosition: number
  hierarchyHeapLeaseGeneration: number
  hierarchyHeapLeaseToken: number
  hierarchyHeapNextNode: number
  hierarchyHeapNode: number
  hierarchyHeapSlot: number
  hierarchyHeapWorkspace: ZombieEscapeSparseAttachmentHeapWorkspace | null
  hierarchyHeapOperation:
    | 'idle'
    | 'pop-compare'
    | 'pop-remove'
    | 'pop-select'
    | 'pop-swap'
    | 'push-append'
    | 'push-compare'
    | 'push-swap'
  hierarchyHeapPosition: number
  hierarchyHeapPoppedNode: number
  hierarchyHeapReserved: boolean
  hierarchyHeapSize: number
  hierarchyNodeIndex: number
  lastStepAttachmentHierarchyNodeVisits: number
  lastStepCandidateVisits: number
  lastStepColliderCandidateVisits: number
  lastStepColliderHierarchyNodeVisits: number
  lastStepCollisionPredicates: number
  lastStepHeapOperations: number
  lastStepHierarchyNodeVisits: number
  lastStepSupportHierarchyNodeVisits: number
  lastStepSupportHoleVisits: number
  lastStepSupportItemVisits: number
  lastStepSupportPredicates: number
  lastStepSupportRingEdgeVisits: number
  lastStepSupportRingHierarchyNodeVisits: number
  phase: 'collision' | 'complete' | 'hierarchy' | 'hierarchy-node' | 'support'
  retainHierarchyHeapLeaseOnComplete: boolean
  reverseFieldBankGeneration: number
  reverseFieldBankIndex: number
  reverseFieldBankWorkspace: ZombieEscapeSparseReverseFieldBankWorkspace | null
  reverseFieldDistanceVariant: number
  routeRevision: number
  sourceLayerIndex: number
  sourceX: number
  sourceZ: number
  status: ZombieEscapeSparseSearchStatus
  supportEnd: number
  supportOffset: number
  totalAttachmentHierarchyNodeVisits: number
  totalCandidateVisits: number
  totalColliderCandidateVisits: number
  totalColliderHierarchyNodeVisits: number
  totalCollisionPredicates: number
  totalHeapOperations: number
  totalHierarchyNodeVisits: number
  totalSupportHierarchyNodeVisits: number
  totalSupportHoleVisits: number
  totalSupportItemVisits: number
  totalSupportPredicates: number
  totalSupportRingEdgeVisits: number
  totalSupportRingHierarchyNodeVisits: number
  visibility: ZombieEscapeNavigationVisibilitySearch
  worldRevision: string
}

export type ZombieEscapeSparseFlowSearch = {
  attachment: ZombieEscapeSparseAttachmentSearch
  blockingDistance: number
  blockingHit: ZombieEscapeCollisionHit
  blockingX: number
  blockingZ: number
  cachedNextNode: number
  cachedOriginalNextNode: number
  cachedOriginalNode: number
  cachedUsesFallback: boolean
  cachedVisibleNode: number
  bestLayerDistance: number
  layerOffset: number
  lastStepCandidateVisits: number
  lastStepAttachmentHierarchyNodeVisits: number
  lastStepColliderCandidateVisits: number
  lastStepColliderHierarchyNodeVisits: number
  lastStepCollisionPredicates: number
  lastStepHeapOperations: number
  lastStepHierarchyNodeVisits: number
  lastStepSupportHierarchyNodeVisits: number
  lastStepSupportHoleVisits: number
  lastStepSupportItemVisits: number
  lastStepSupportPredicates: number
  lastStepSupportRingEdgeVisits: number
  lastStepSupportRingHierarchyNodeVisits: number
  lastStepTargetBuilds: number
  lastRouteCorridorSuccessorVisits: number
  maximumRouteCorridorSuccessorVisits: number
  phase:
    | 'cached-fallback-start'
    | 'cached-next-visibility'
    | 'cached-strict-start'
    | 'cached-string-pull'
    | 'cached-validate'
    | 'complete'
    | 'direct'
    | 'direct-visibility'
    | 'fallback-attachment'
    | 'initialize'
    | 'resolve-source-layer'
    | 'resolve-source-support'
    | 'strict-attachment'
    | 'wait-lease'
    | 'wait-fallback-target'
    | 'wait-strict-target'
    | 'wait-weighted-fallback-target'
    | 'waypoint-blocking-visibility'
    | 'waypoint-finalize'
    | 'waypoint-target-visibility'
  preferredWaypointNode: number
  preferredWaypointUsesFallback: boolean
  routeCorridorGeneration: number
  routeCorridorSourceLayerIndex: number
  routeCorridorTargetLayerIndex: number
  routeCorridorUsesFallback: boolean
  routeCorridorWorldRevision: string
  routeGeneration: number
  routeRevision: number
  sourceLayerIndex: number
  sourceY: number
  sourceX: number
  sourceZ: number
  status: ZombieEscapeSparseSearchStatus
  strictAttachmentDistance: number
  strictRouteDistance: number
  strictWaypointNode: number
  targetX: number
  targetZ: number
  totalCandidateVisits: number
  totalAttachmentHierarchyNodeVisits: number
  totalColliderCandidateVisits: number
  totalColliderHierarchyNodeVisits: number
  totalCollisionPredicates: number
  totalHeapOperations: number
  totalHierarchyNodeVisits: number
  totalSupportHierarchyNodeVisits: number
  totalSupportHoleVisits: number
  totalSupportItemVisits: number
  totalSupportPredicates: number
  totalSupportRingEdgeVisits: number
  totalSupportRingHierarchyNodeVisits: number
  totalTargetBuilds: number
  totalRouteCorridorSuccessorVisits: number
  travelSpeedMetersPerSecond: number
  waypointNode: number
  waypointUsesFallback: boolean
  worldRevision: string
}

type ZombieEscapeSparseAttachmentHeapWorkspace = {
  availableGeneralSlotCount: number
  generation: number
  leaseInvariantViolationCount: number
  maximumActiveGeneralSlotCount: number
  nextLeaseToken: number
  nodes: Int32Array
  ownerTokens: Uint32Array
  slotCapacity: number
}

export type ZombieEscapeSparseAttachmentHeapLeaseInspection = Readonly<{
  activeAgentLeases: number
  availableAgentLeases: number
  leaseInvariantViolationCount: number
  maximumActiveAgentLeases: number
  maximumHierarchyNodeCount: number
  singletonReserved: boolean
  spawnReserved: boolean
}>

type ZombieEscapeSparseReverseFieldBank = {
  breachObjectWordCount: number
  fallbackReachableCount: number
  fallbackTargetCell: number
  generation: number
  graphFallbackBreachCounts: Uint32Array
  graphFallbackBreachMasks: Uint32Array
  graphFallbackCosts: Float64Array
  graphFallbackDistances: Float64Array
  graphFallbackNextNodes: Int32Array
  graphFallbackTargetNodeCount: number
  graphFallbackTargetNodeMarks: Uint8Array
  graphFallbackTargetNodes: Int32Array
  graphSameLayerFallbackBreachCounts: Uint32Array
  graphSameLayerFallbackBreachMasks: Uint32Array
  graphSameLayerFallbackCosts: Float64Array
  graphSameLayerDistances: Float64Array
  graphSameLayerFallbackDistances: Float64Array
  graphSameLayerFallbackNextNodes: Int32Array
  graphSameLayerNextNodes: Int32Array
  graphStrictDistances: Float64Array
  graphStrictNextNodes: Int32Array
  graphStrictTargetNodeCount: number
  graphStrictTargetNodeMarks: Uint8Array
  graphStrictTargetNodes: Int32Array
  reachableCount: number
  routeTargetBucketX: number
  routeTargetBucketZ: number
  routeTargetInitialized: boolean
  routeTargetLayerIndex: number
  routeTargetX: number
  routeTargetY: number
  routeTargetZ: number
  targetCell: number
  targetLayerIndex: number
  worldRevision: string
}

type ZombieEscapeSparseReverseFieldBankWorkspace = {
  activeBankIndex: number
  allocatedBytes: number
  bankReaderCounts: Uint8Array
  banks: [ZombieEscapeSparseReverseFieldBank, ZombieEscapeSparseReverseFieldBank]
  generation: number
  leaseInvariantViolationCount: number
  maximumReaderLeaseCount: number
  publicationBlockedCount: number
  publicationCount: number
  readerBankIndices: Int8Array
  readerGenerations: Uint32Array
  readerOwnerTokens: Uint32Array
}

export type ZombieEscapeSparseReverseFieldBankInspection = Readonly<{
  activeBankIndex: number
  activeGeneration: number
  activeRouteTargetLayerIndex: number
  activeWorldRevision: string
  allocatedBytes: number
  availableReaderLeases: number
  bankOneGeneration: number
  bankOneReaderCount: number
  bankZeroGeneration: number
  bankZeroReaderCount: number
  leaseInvariantViolationCount: number
  maximumReaderLeaseCount: number
  publicationBlockedCount: number
  publicationCount: number
  readerLeaseCount: number
  singletonPinned: boolean
  spawnPinned: boolean
}>

export type ZombieEscapeSparseCommittedNodeRoute = {
  connectorIndex: number
  connectorTargetEnd: boolean
  generation: number
  nextNode: number
  reachable: boolean
  targetLayerIndex: number
  terminal: boolean
}

export type ZombieEscapeSparseSpawnAnchor = {
  elevation: number
  generation: number
  layerIndex: number
  reachable: boolean
  usesFallback: boolean
  witnessNode: number
  x: number
  z: number
}

export type ZombieEscapeSparseCachedWaypointStatus =
  | 'followed'
  | 'held'
  | 'invalidated'
  | 'pending'
  | 'reacquiring'
  | 'refresh'
  | 'routePublished'

export type ZombieEscapeSparsePublishedRouteAdoption =
  | 'adopted'
  | 'invalid'
  | 'requiresSearch'
  | 'unreachable'

export type ZombieEscapeSparseReachableSpawnSearch = {
  attachment: ZombieEscapeSparseAttachmentSearch
  bestDistanceSquared: number
  bestLayerDistance: number
  bestNode: number
  desiredLayerIndex: number
  desiredX: number
  desiredY: number
  desiredZ: number
  fallbackItemEnd: number
  fallbackItemOffset: number
  fallbackNodeIndex: number
  lastStepCandidateVisits: number
  lastStepAttachmentHierarchyNodeVisits: number
  lastStepColliderCandidateVisits: number
  lastStepColliderHierarchyNodeVisits: number
  lastStepCollisionPredicates: number
  lastStepHeapOperations: number
  lastStepHierarchyNodeVisits: number
  lastStepSupportHierarchyNodeVisits: number
  lastStepSupportHoleVisits: number
  lastStepSupportItemVisits: number
  lastStepSupportPredicates: number
  lastStepSupportRingEdgeVisits: number
  lastStepSupportRingHierarchyNodeVisits: number
  layerOffset: number
  minimumTargetDistanceSquared: number
  phase:
    | 'attachment'
    | 'complete'
    | 'direct'
    | 'direct-visibility'
    | 'fallback'
    | 'fallback-initialize'
    | 'fallback-node'
    | 'initialize'
    | 'resolve-layer'
    | 'wait-target'
  spawnLayerIndex: number
  routeRevision: number
  status: ZombieEscapeSparseSearchStatus
  targetX: number
  targetZ: number
  totalCandidateVisits: number
  totalAttachmentHierarchyNodeVisits: number
  totalColliderCandidateVisits: number
  totalColliderHierarchyNodeVisits: number
  totalCollisionPredicates: number
  totalHeapOperations: number
  totalHierarchyNodeVisits: number
  totalSupportHierarchyNodeVisits: number
  totalSupportHoleVisits: number
  totalSupportItemVisits: number
  totalSupportPredicates: number
  totalSupportRingEdgeVisits: number
  totalSupportRingHierarchyNodeVisits: number
  worldRevision: string
}

export type ZombieEscapeNavigationSupportQueryInspection = Readonly<{
  contains: boolean
  edgeVisits: number
  layerSupportCount: number
  nodeVisits: number
  supportAabbVisits: number
  supportPredicateVisits: number
  totalEdgeCount: number
}>

export type ZombieEscapeCollisionWorld = Readonly<{
  activeObjectMask: Uint8Array
  activationRevision: number
  agentRadius: number
  boundaryPolicy: ZombieEscapeCollisionBoundaryPolicy
  boxes: readonly ZombieEscapeCollisionBox[]
  breakableObjectIds: ReadonlySet<string>
  broadphase: ZombieEscapeCollisionBroadphase
  cellSize: number
  circles: readonly ZombieEscapeCollisionCircle[]
  gridHeight: number
  gridOriginX: number
  gridOriginZ: number
  gridWidth: number
  playRadius: number
  navigationAttachmentAcceleration: ZombieEscapeNavigationAttachmentAcceleration
  navigationColliderAcceleration: ZombieEscapeNavigationBoundsHierarchy
  navigationConnectorAdjacency: ZombieEscapeNavigationConnectorAdjacency
  navigationConnectors: readonly ZombieEscapeNavigationConnector[]
  navigationGraph: ZombieEscapeSparseNavigationGraph
  navigationLayers: readonly ZombieEscapeNavigationLayer[]
  navigationMode: 'dense' | 'sparse'
  navigationSupportAcceleration: ZombieEscapeNavigationSupportAcceleration
  navigationSupports: readonly ZombieEscapeNavigationSupportSource[]
  objectCatalog: ZombieEscapeCollisionObjectCatalog
  revision: string
  segments: readonly ZombieEscapeCollisionSegment[]
  semanticKey: string
}>

export type ZombieEscapeFlowField = {
  distances: Uint32Array
  fallbackDistances: Uint32Array
  fallbackQueue: Int32Array
  fallbackReachableCount: number
  fallbackRebuildCount: number
  fallbackTargetCell: number
  graphAttachmentCandidateCount: number
  graphAttachmentFullSearchCount: number
  graphAttachmentSupportCheckCount: number
  graphAttachmentHeapWorkspace: ZombieEscapeSparseAttachmentHeapWorkspace
  graphFallbackDistances: Float64Array
  graphFallbackNextNodes: Int32Array
  graphCollisionHit: ZombieEscapeCollisionHit
  graphHeapDistances: Float64Array
  graphHeapNodes: Int32Array
  graphHeapPositions: Int32Array
  graphReverseFieldBanks: ZombieEscapeSparseReverseFieldBankWorkspace
  graphSameLayerDistances: Float64Array
  graphSameLayerFallbackDistances: Float64Array
  graphSameLayerFallbackNextNodes: Int32Array
  graphSameLayerNextNodes: Int32Array
  graphSparseFlowSearch: ZombieEscapeSparseFlowSearch
  graphSparseReachableSpawnSearch: ZombieEscapeSparseReachableSpawnSearch
  graphSparseTargetUpdate: ZombieEscapeSparseTargetUpdate
  graphFallbackTargetNodeCount: number
  graphFallbackTargetNodeMarks: Uint8Array
  graphFallbackTargetNodes: Int32Array
  graphStrictDistances: Float64Array
  graphStrictNextNodes: Int32Array
  graphStrictTargetNodeCount: number
  graphStrictTargetNodeMarks: Uint8Array
  graphStrictTargetNodes: Int32Array
  graphTargetComponentVisitEpoch: Uint32Array
  graphTargetComponentVisitStamps: Uint32Array
  queue: Int32Array
  reachableCount: number
  rebuildCount: number
  routeRevision: number
  targetBucketX: number
  targetBucketZ: number
  targetCell: number
  targetInitialized: boolean
  targetLayerIndex: number
  targetX: number
  targetY: number
  targetZ: number
  world: ZombieEscapeCollisionWorld
}

export type ZombieEscapeFlowSample = {
  blockingDistance: number
  blockingX: number
  blockingZ: number
  connectorIndex: number
  connectorTargetEnd: boolean
  reachable: boolean
  waypointNode?: number
  waypointUsesFallback?: boolean
  x: number
  z: number
}

export type ZombieEscapeReachableSpawn = {
  cell: number
  reachable: boolean
  x: number
  z: number
}

export type ZombieEscapeCollisionHit = {
  colliderIndex: number
  colliderKind: 'boundary' | 'box' | 'circle' | 'none' | 'segment'
  normalX: number
  normalY: number
  normalZ: number
  time: number
}

export type ZombieEscapeCircleMoveResult = {
  collided: boolean
  sweepHit: ZombieEscapeCollisionHit
  x: number
  z: number
}

export type ZombieEscapeNavigationMoveResult = ZombieEscapeCircleMoveResult & {
  connectorIndex: number
  connectorTargetEnd: boolean
  y: number
}

export function createZombieEscapeCollisionWorld({
  agentRadius,
  boundaryPolicy = 'solid',
  boxes = [],
  broadphaseCellSize = DEFAULT_BROADPHASE_CELL_SIZE_METERS,
  cellSize = DEFAULT_NAVIGATION_CELL_SIZE_METERS,
  circles = [],
  navigationConnectors = [],
  navigationSupports = [],
  objectSemantics = [],
  playRadius,
  segments = [],
}: {
  agentRadius: number
  boundaryPolicy?: ZombieEscapeCollisionBoundaryPolicy
  boxes?: readonly ZombieEscapeCollisionBoxSource[]
  broadphaseCellSize?: number
  cellSize?: number
  circles?: readonly ZombieEscapeCollisionCircleSource[]
  navigationConnectors?: readonly ZombieEscapeNavigationConnectorSource[]
  navigationSupports?: readonly ZombieEscapeNavigationSupportSource[]
  objectSemantics?: readonly ZombieEscapeCollisionObjectSemanticSource[]
  playRadius: number
  segments?: readonly ZombieEscapeCollisionSegmentSource[]
}): ZombieEscapeCollisionWorld {
  const resolvedCellSize = finitePositive(cellSize, DEFAULT_NAVIGATION_CELL_SIZE_METERS)
  const resolvedBroadphaseCellSize = finitePositive(
    broadphaseCellSize,
    DEFAULT_BROADPHASE_CELL_SIZE_METERS,
  )
  const resolvedPlayRadius = finitePositive(playRadius, 1)
  const resolvedAgentRadius = Math.max(0, finiteNonNegative(agentRadius, 0.25))
  const resolvedBoundaryPolicy = boundaryPolicy === 'none' ? 'none' : 'solid'
  const normalizedConnectors = navigationConnectors
    .filter(isFiniteNavigationConnector)
    .map(normalizeNavigationConnector)
    .sort(compareNavigationConnectors)
  const normalizedSupports = navigationSupports
    .filter(isFiniteNavigationSupport)
    .map(normalizeNavigationSupport)
    .sort(
      (first, second) => first.elevation - second.elevation || first.id.localeCompare(second.id),
    )
  const resolvedSupports = createNavigationSupportUnion(normalizedSupports)
  const sortedCircles = circles
    .filter(isFiniteCircle)
    .map(normalizeCircle)
    .sort(compareCollisionCircles)
  const sortedBoxes = boxes.filter(isFiniteBox).map(normalizeBox).sort(compareCollisionBoxes)
  const sortedSegments = segments
    .filter(isFiniteSegment)
    .map(normalizeSegment)
    .sort(compareCollisionSegments)
  const usesSparseNavigation = normalizedSupports.some((support) => support.boundary === true)
  const gridWidth = usesSparseNavigation
    ? 1
    : Math.max(1, Math.ceil((resolvedPlayRadius * 2) / resolvedCellSize))
  const gridHeight = gridWidth
  const gridOriginX = -(gridWidth * resolvedCellSize) / 2
  const gridOriginZ = -(gridHeight * resolvedCellSize) / 2
  const navigationLayers = usesSparseNavigation
    ? createSparseNavigationLayers(resolvedSupports)
    : createNavigationLayers(
        resolvedPlayRadius,
        resolvedAgentRadius,
        gridWidth,
        gridHeight,
        gridOriginX,
        gridOriginZ,
        resolvedCellSize,
        sortedBoxes,
        sortedCircles,
        sortedSegments,
        resolvedSupports,
      )

  const navigationConnectorsWithCells = usesSparseNavigation
    ? resolveSparseNavigationConnectors(normalizedConnectors, navigationLayers)
    : resolveNavigationConnectorCells(
        normalizedConnectors,
        navigationLayers,
        gridWidth,
        gridHeight,
        gridOriginX,
        gridOriginZ,
        resolvedCellSize,
        resolvedAgentRadius,
      )
  const navigationConnectorAdjacency = createNavigationConnectorAdjacency(
    navigationConnectorsWithCells,
    gridWidth * gridHeight,
    gridWidth * gridHeight * navigationLayers.length + normalizedConnectors.length * 2,
  )
  const navigationSupportAcceleration = createNavigationSupportAcceleration(
    navigationLayers,
    resolvedSupports,
  )
  const objectCatalog = createZombieEscapeCollisionObjectCatalog(
    sortedBoxes,
    sortedCircles,
    sortedSegments,
    navigationConnectorsWithCells,
    objectSemantics,
  )
  const activeObjectMask = new Uint8Array(objectCatalog.objectIds.length)
  activeObjectMask.fill(1)
  const navigationColliderAcceleration = createZombieEscapeNavigationColliderAcceleration(
    sortedBoxes,
    sortedCircles,
    sortedSegments,
  )

  const semanticKey = createCollisionWorldSemanticKey(
    resolvedPlayRadius,
    resolvedBoundaryPolicy,
    resolvedAgentRadius,
    resolvedCellSize,
    resolvedBroadphaseCellSize,
    sortedBoxes,
    sortedCircles,
    sortedSegments,
    navigationConnectorsWithCells,
    normalizedSupports,
    objectCatalog,
  )
  const emptyNavigationGraph = createEmptyZombieEscapeSparseNavigationGraph()
  const emptyNavigationAttachmentAcceleration = createNavigationAttachmentAcceleration(
    navigationLayers,
    emptyNavigationGraph,
  )
  const baseWorld: ZombieEscapeCollisionWorld = {
    activeObjectMask,
    activationRevision: 0,
    agentRadius: resolvedAgentRadius,
    boundaryPolicy: resolvedBoundaryPolicy,
    boxes: sortedBoxes,
    breakableObjectIds: new Set(
      [...sortedBoxes, ...sortedCircles, ...sortedSegments]
        .filter((collider) => collider.breakable)
        .map((collider) => collider.objectId),
    ),
    broadphase: createCollisionBroadphase(
      resolvedPlayRadius,
      resolvedBoundaryPolicy,
      resolvedBroadphaseCellSize,
      sortedBoxes,
      sortedCircles,
      sortedSegments,
    ),
    cellSize: resolvedCellSize,
    circles: sortedCircles,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    gridWidth,
    playRadius: resolvedPlayRadius,
    navigationAttachmentAcceleration: emptyNavigationAttachmentAcceleration,
    navigationColliderAcceleration,
    navigationConnectorAdjacency,
    navigationConnectors: navigationConnectorsWithCells,
    navigationGraph: emptyNavigationGraph,
    navigationLayers,
    navigationMode: usesSparseNavigation ? 'sparse' : 'dense',
    navigationSupportAcceleration,
    navigationSupports: resolvedSupports,
    objectCatalog,
    revision: hashSemanticKey(semanticKey),
    segments: sortedSegments,
    semanticKey,
  }
  if (!usesSparseNavigation) return baseWorld
  const navigationGraph = createSparseNavigationGraph(baseWorld)
  return {
    ...baseWorld,
    navigationAttachmentAcceleration: createNavigationAttachmentAcceleration(
      navigationLayers,
      navigationGraph,
    ),
    navigationGraph,
  }
}

export function createZombieEscapeCollisionWorldWithoutObjects(
  world: ZombieEscapeCollisionWorld,
  removedObjectIds: ReadonlySet<string>,
) {
  if (removedObjectIds.size === 0) return world
  const circles = world.circles.filter((circle) => !removedObjectIds.has(circle.objectId))
  const boxes = world.boxes.filter((box) => !removedObjectIds.has(box.objectId))
  const segments = world.segments.filter((segment) => !removedObjectIds.has(segment.objectId))
  const navigationConnectors = world.navigationConnectors.filter(
    (connector) => !removedObjectIds.has(connector.objectId),
  )
  if (
    boxes.length === world.boxes.length &&
    circles.length === world.circles.length &&
    segments.length === world.segments.length &&
    navigationConnectors.length === world.navigationConnectors.length
  ) {
    return world
  }
  if (
    world.navigationMode === 'sparse' &&
    navigationConnectors.length === world.navigationConnectors.length &&
    [...removedObjectIds].every((objectId) => world.breakableObjectIds.has(objectId))
  ) {
    const semanticKey = `${world.semanticKey}:without:${[...removedObjectIds].sort().join(',')}`
    const objectCatalog = createZombieEscapeCollisionObjectCatalog(
      boxes,
      circles,
      segments,
      navigationConnectors,
      createZombieEscapeCollisionObjectSemanticsFromCatalog(world.objectCatalog),
    )
    const activeObjectMask = new Uint8Array(objectCatalog.objectIds.length)
    activeObjectMask.fill(1)
    return {
      ...world,
      activeObjectMask,
      activationRevision: 0,
      boxes,
      breakableObjectIds: new Set(
        [...boxes, ...circles, ...segments]
          .filter((collider) => collider.breakable)
          .map((collider) => collider.objectId),
      ),
      broadphase: createCollisionBroadphase(
        world.playRadius,
        world.boundaryPolicy,
        world.broadphase.cellSize,
        boxes,
        circles,
        segments,
      ),
      circles,
      navigationColliderAcceleration: createZombieEscapeNavigationColliderAcceleration(
        boxes,
        circles,
        segments,
      ),
      objectCatalog,
      revision: hashSemanticKey(semanticKey),
      segments,
      semanticKey,
    }
  }
  return createZombieEscapeCollisionWorld({
    agentRadius: world.agentRadius,
    boundaryPolicy: world.boundaryPolicy,
    boxes,
    broadphaseCellSize: world.broadphase.cellSize,
    cellSize: world.cellSize,
    circles,
    navigationConnectors,
    navigationSupports: world.navigationSupports,
    objectSemantics: createZombieEscapeCollisionObjectSemanticsFromCatalog(world.objectCatalog),
    playRadius: world.playRadius,
    segments,
  })
}

export function createZombieEscapeCollisionWorldActiveView(
  baseWorld: ZombieEscapeCollisionWorld,
): ZombieEscapeCollisionWorld {
  const activeObjectMask = new Uint8Array(baseWorld.objectCatalog.objectIds.length)
  activeObjectMask.fill(1)
  return {
    ...baseWorld,
    activeObjectMask,
    activationRevision: 0,
    revision: hashSemanticKey(baseWorld.semanticKey),
  }
}

export function createZombieEscapeCollisionObjectDeltaResult(): ZombieEscapeCollisionObjectDeltaResult {
  return {
    allocationCount: 0,
    fullArrayClearCount: 0,
    objectLookupComparisons: 0,
    objectMaskWrites: 0,
    objectOrdinal: -1,
    revisionAdvanceCount: 0,
    revisionAfter: '',
    revisionBefore: '',
    status: 'missing',
    worldCompileCount: 0,
  }
}

export function classifyZombieEscapeCollisionObjectDelta(
  world: ZombieEscapeCollisionWorld,
  objectId: string,
  output: ZombieEscapeCollisionObjectDeltaResult,
): ZombieEscapeCollisionObjectDeltaStatus {
  resetZombieEscapeCollisionObjectDeltaResult(output, world.revision)
  let minimum = 0
  let maximum = world.objectCatalog.objectIds.length - 1
  while (minimum <= maximum) {
    output.objectLookupComparisons += 1
    const middle = minimum + Math.floor((maximum - minimum) / 2)
    const comparison = world.objectCatalog.objectIds[middle]!.localeCompare(objectId)
    if (comparison < 0) {
      minimum = middle + 1
      continue
    }
    if (comparison > 0) {
      maximum = middle - 1
      continue
    }
    output.objectOrdinal = middle
    output.status =
      world.objectCatalog.objectSupportsMaskRemoval[middle] === 0
        ? 'requires-recompile'
        : world.activeObjectMask[middle] === 0
          ? 'unchanged'
          : 'changed'
    return output.status
  }
  return output.status
}

export function deactivateZombieEscapeCollisionObject(
  world: ZombieEscapeCollisionWorld,
  classification: ZombieEscapeCollisionObjectDeltaResult,
): ZombieEscapeCollisionObjectDeltaStatus {
  if (
    classification.status !== 'changed' ||
    classification.revisionBefore !== world.revision ||
    classification.objectOrdinal < 0 ||
    classification.objectOrdinal >= world.activeObjectMask.length ||
    world.activeObjectMask[classification.objectOrdinal] === 0
  ) {
    classification.status =
      classification.status === 'unchanged' && classification.revisionBefore === world.revision
        ? 'unchanged'
        : 'invalidated'
    classification.revisionAfter = world.revision
    return classification.status
  }
  const mutableWorld = world as {
    activationRevision: number
    revision: string
  }
  world.activeObjectMask[classification.objectOrdinal] = 0
  classification.objectMaskWrites = 1
  mutableWorld.activationRevision += 1
  mutableWorld.revision = `${hashSemanticKey(world.semanticKey)}:${mutableWorld.activationRevision}`
  classification.revisionAdvanceCount = 1
  classification.revisionAfter = mutableWorld.revision
  return classification.status
}

export function findFirstActiveZombieEscapeBreakableObjectId(
  world: ZombieEscapeCollisionWorld,
): string | null {
  for (const objectOrdinal of world.objectCatalog.breakableObjectOrdinals) {
    if (world.activeObjectMask[objectOrdinal] !== 0) {
      return world.objectCatalog.objectIds[objectOrdinal] ?? null
    }
  }
  return null
}

function resetZombieEscapeCollisionObjectDeltaResult(
  output: ZombieEscapeCollisionObjectDeltaResult,
  revision: string,
) {
  output.allocationCount = 0
  output.fullArrayClearCount = 0
  output.objectLookupComparisons = 0
  output.objectMaskWrites = 0
  output.objectOrdinal = -1
  output.revisionAdvanceCount = 0
  output.revisionAfter = revision
  output.revisionBefore = revision
  output.status = 'missing'
  output.worldCompileCount = 0
}

export function createZombieEscapeNavigationVisibilitySearch(): ZombieEscapeNavigationVisibilitySearch {
  const search = {
    breakableCollisionHit: createZombieEscapeCollisionHit(),
    breakableObjectOrdinals: new Set<number>(),
    collisionHit: createZombieEscapeCollisionHit(),
  } as ZombieEscapeNavigationVisibilitySearch
  resetZombieEscapeNavigationVisibilitySearch(search)
  return search
}

function resetZombieEscapeNavigationVisibilitySearch(
  search: ZombieEscapeNavigationVisibilitySearch,
) {
  search.breakableCollisionHit ??= createZombieEscapeCollisionHit()
  resetCollisionHit(search.breakableCollisionHit)
  search.breakableObjectOrdinals ??= new Set<number>()
  search.breakableObjectOrdinals.clear()
  search.breakablesTraversable = false
  search.collisionCandidateIndex = -1
  search.collisionHit ??= createZombieEscapeCollisionHit()
  resetCollisionHit(search.collisionHit)
  search.collisionItemEnd = 0
  search.collisionItemOffset = 0
  search.collisionNodeIndex = 0
  search.endX = 0
  search.endZ = 0
  search.lastStepCandidateVisits = 0
  search.lastStepColliderCandidateVisits = 0
  search.lastStepColliderHierarchyNodeVisits = 0
  search.lastStepCollisionPredicates = 0
  search.lastStepHierarchyNodeVisits = 0
  search.lastStepSupportHierarchyNodeVisits = 0
  search.lastStepSupportHoleVisits = 0
  search.lastStepSupportItemVisits = 0
  search.lastStepSupportPredicates = 0
  search.lastStepSupportRingEdgeVisits = 0
  search.lastStepSupportRingHierarchyNodeVisits = 0
  search.maximumX = 0
  search.maximumZ = 0
  search.minimumX = 0
  search.minimumZ = 0
  search.navigationLayerIndex = -1
  search.phase = 'complete'
  search.radius = 0
  search.ringConvexInteriorSign = 0
  search.ringInside = false
  search.ringItemEnd = 0
  search.ringItemOffset = 0
  search.ringMode = 'point'
  search.ringNodeIndex = -1
  search.ringResult = false
  search.ringTargetX = 0
  search.ringTargetZ = 0
  search.startX = 0
  search.startZ = 0
  search.status = 'blocked'
  search.supportHoleIndex = 0
  search.supportIndex = -1
  search.supportItemEnd = 0
  search.supportItemOffset = 0
  search.supportNodeIndex = 0
  search.supportRingIndex = 0
  search.supportStage = 'start-outer-point'
  search.totalCandidateVisits = 0
  search.totalColliderCandidateVisits = 0
  search.totalColliderHierarchyNodeVisits = 0
  search.totalCollisionPredicates = 0
  search.totalHierarchyNodeVisits = 0
  search.totalSupportHierarchyNodeVisits = 0
  search.totalSupportHoleVisits = 0
  search.totalSupportItemVisits = 0
  search.totalSupportPredicates = 0
  search.totalSupportRingEdgeVisits = 0
  search.totalSupportRingHierarchyNodeVisits = 0
  search.worldRevision = ''
}

export function beginZombieEscapeNavigationVisibilitySearch(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  breakablesTraversable = false,
): ZombieEscapeNavigationVisibilityStatus {
  resetZombieEscapeNavigationVisibilitySearch(search)
  const resolvedRadius = Math.max(0, radius)
  search.breakablesTraversable = breakablesTraversable
  search.endX = endX
  search.endZ = endZ
  search.maximumX = Math.max(startX, endX) + resolvedRadius
  search.maximumZ = Math.max(startZ, endZ) + resolvedRadius
  search.minimumX = Math.min(startX, endX) - resolvedRadius
  search.minimumZ = Math.min(startZ, endZ) - resolvedRadius
  search.navigationLayerIndex = navigationLayerIndex
  search.phase = 'initialize'
  search.radius = resolvedRadius
  search.startX = startX
  search.startZ = startZ
  search.status = 'pending'
  search.worldRevision = world.revision
  return search.status
}

export function stepZombieEscapeNavigationVisibilitySearch(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  budget: ZombieEscapeSparseSearchBudget,
): ZombieEscapeNavigationVisibilityStatus {
  return stepZombieEscapeNavigationVisibilitySearchWithLimits(
    world,
    search,
    normalizeSparseSearchBudget(budget.maximumCandidateVisits),
    normalizeSparseSearchBudget(budget.maximumCollisionPredicates),
    normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits),
    normalizeSparseSearchBudget(budget.maximumSupportPredicates),
  )
}

function stepZombieEscapeNavigationVisibilitySearchWithLimits(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  maximumCandidateVisits: number,
  maximumCollisionPredicates: number,
  maximumHierarchyNodeVisits: number,
  maximumSupportPredicates: number,
) {
  resetZombieEscapeNavigationVisibilityStepWork(search)
  if (search.status !== 'pending') return search.status
  if (search.worldRevision !== world.revision) {
    search.phase = 'complete'
    search.status = 'invalidated'
    return search.status
  }
  while (search.status === 'pending') {
    if (search.phase === 'initialize') {
      if (
        !initializeZombieEscapeNavigationVisibilityCollisionBoundary(
          world,
          search,
          maximumCollisionPredicates,
        )
      ) {
        return search.status
      }
      search.phase = 'support-hierarchy'
      continue
    }
    if (search.phase === 'support-hierarchy' || search.phase === 'support-item') {
      if (
        !stepZombieEscapeNavigationVisibilitySupportHierarchy(
          world,
          search,
          maximumCandidateVisits,
          maximumHierarchyNodeVisits,
        )
      ) {
        return search.status
      }
      continue
    }
    if (search.phase === 'support-ring') {
      if (
        !stepZombieEscapeNavigationVisibilitySupportRing(
          world,
          search,
          maximumHierarchyNodeVisits,
          maximumSupportPredicates,
        )
      ) {
        return search.status
      }
      continue
    }
    if (search.phase === 'collision-hierarchy' || search.phase === 'collision-item') {
      if (
        !stepZombieEscapeNavigationVisibilityColliders(
          world,
          search,
          maximumCandidateVisits,
          maximumCollisionPredicates,
          maximumHierarchyNodeVisits,
        )
      ) {
        return search.status
      }
      continue
    }
    break
  }
  return search.status
}

function resetZombieEscapeNavigationVisibilityStepWork(
  search: ZombieEscapeNavigationVisibilitySearch,
) {
  search.lastStepCandidateVisits = 0
  search.lastStepColliderCandidateVisits = 0
  search.lastStepColliderHierarchyNodeVisits = 0
  search.lastStepCollisionPredicates = 0
  search.lastStepHierarchyNodeVisits = 0
  search.lastStepSupportHierarchyNodeVisits = 0
  search.lastStepSupportHoleVisits = 0
  search.lastStepSupportItemVisits = 0
  search.lastStepSupportPredicates = 0
  search.lastStepSupportRingEdgeVisits = 0
  search.lastStepSupportRingHierarchyNodeVisits = 0
}

function consumeZombieEscapeVisibilityHierarchy(
  search: ZombieEscapeNavigationVisibilitySearch,
  kind: 'collider' | 'support' | 'support-ring',
) {
  search.lastStepHierarchyNodeVisits += 1
  search.totalHierarchyNodeVisits += 1
  if (kind === 'collider') {
    search.lastStepColliderHierarchyNodeVisits += 1
    search.totalColliderHierarchyNodeVisits += 1
  } else if (kind === 'support') {
    search.lastStepSupportHierarchyNodeVisits += 1
    search.totalSupportHierarchyNodeVisits += 1
  } else {
    search.lastStepSupportRingHierarchyNodeVisits += 1
    search.totalSupportRingHierarchyNodeVisits += 1
  }
}

function consumeZombieEscapeVisibilityCandidate(
  search: ZombieEscapeNavigationVisibilitySearch,
  kind: 'collider' | 'support',
) {
  search.lastStepCandidateVisits += 1
  search.totalCandidateVisits += 1
  if (kind === 'collider') {
    search.lastStepColliderCandidateVisits += 1
    search.totalColliderCandidateVisits += 1
  } else {
    search.lastStepSupportItemVisits += 1
    search.totalSupportItemVisits += 1
  }
}

function consumeZombieEscapeVisibilitySupport(
  search: ZombieEscapeNavigationVisibilitySearch,
  kind: 'hole' | 'ring-edge',
) {
  search.lastStepSupportPredicates += 1
  search.totalSupportPredicates += 1
  if (kind === 'hole') {
    search.lastStepSupportHoleVisits += 1
    search.totalSupportHoleVisits += 1
  } else {
    search.lastStepSupportRingEdgeVisits += 1
    search.totalSupportRingEdgeVisits += 1
  }
}

function consumeZombieEscapeVisibilityCollision(search: ZombieEscapeNavigationVisibilitySearch) {
  search.lastStepCollisionPredicates += 1
  search.totalCollisionPredicates += 1
}

function initializeZombieEscapeNavigationVisibilityCollisionBoundary(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  maximumCollisionPredicates: number,
) {
  if (world.boundaryPolicy !== 'solid') return true
  if (search.lastStepCollisionPredicates >= maximumCollisionPredicates) return false
  consumeZombieEscapeVisibilityCollision(search)
  const boundaryRadius = Math.max(0, world.playRadius - search.radius)
  const amount = segmentCircleExitIntersectionAmount(
    search.startX,
    search.startZ,
    search.endX,
    search.endZ,
    boundaryRadius,
  )
  if (amount >= search.collisionHit.time) return true
  const hitX = search.startX + (search.endX - search.startX) * amount
  const hitZ = search.startZ + (search.endZ - search.startZ) * amount
  const inverseLength = 1 / Math.max(INTERSECTION_EPSILON, Math.hypot(hitX, hitZ))
  search.collisionHit.colliderIndex = -1
  search.collisionHit.colliderKind = 'boundary'
  search.collisionHit.normalX = -hitX * inverseLength
  search.collisionHit.normalY = 0
  search.collisionHit.normalZ = -hitZ * inverseLength
  search.collisionHit.time = amount
  return true
}

function stepZombieEscapeNavigationVisibilitySupportHierarchy(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  maximumCandidateVisits: number,
  maximumHierarchyNodeVisits: number,
) {
  const layer = world.navigationSupportAcceleration.layers[search.navigationLayerIndex]
  if (!layer) {
    completeZombieEscapeNavigationVisibility(search, 'blocked')
    return true
  }
  const hierarchy = layer.hierarchy
  if (search.phase === 'support-item') {
    if (search.supportItemOffset >= search.supportItemEnd) {
      search.phase = 'support-hierarchy'
      return true
    }
    if (search.lastStepCandidateVisits >= maximumCandidateVisits) return false
    const supportIndex = hierarchy.itemIndices[search.supportItemOffset]!
    search.supportItemOffset += 1
    consumeZombieEscapeVisibilityCandidate(search, 'support')
    const acceleration = world.navigationSupportAcceleration.supports[supportIndex]
    if (
      !acceleration ||
      !navigationSupportBoundsMayContainCapsuleEndpoints(
        acceleration.bounds,
        search.startX,
        search.startZ,
        search.endX,
        search.endZ,
      )
    ) {
      return true
    }
    search.supportIndex = supportIndex
    search.supportHoleIndex = 0
    search.supportRingIndex = 0
    search.supportStage = acceleration.capsuleFollowsValidatedDisks
      ? 'capsule-outer-edge'
      : 'start-outer-point'
    search.ringNodeIndex = -1
    search.phase = 'support-ring'
    return true
  }
  if (search.supportNodeIndex >= hierarchy.nodeItemCounts.length) {
    completeZombieEscapeNavigationVisibility(search, 'blocked')
    return true
  }
  if (search.lastStepHierarchyNodeVisits >= maximumHierarchyNodeVisits) return false
  const nodeIndex = search.supportNodeIndex
  consumeZombieEscapeVisibilityHierarchy(search, 'support')
  if (
    !navigationBoundsHierarchyNodeMayContainCapsuleEndpoints(
      hierarchy,
      nodeIndex,
      search.startX,
      search.startZ,
      search.endX,
      search.endZ,
    )
  ) {
    search.supportNodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
    return true
  }
  const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
  search.supportNodeIndex += 1
  if (itemCount <= 0) return true
  search.supportItemOffset = hierarchy.nodeItemOffsets[nodeIndex]!
  search.supportItemEnd = search.supportItemOffset + itemCount
  search.phase = 'support-item'
  return true
}

function stepZombieEscapeNavigationVisibilitySupportRing(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  maximumHierarchyNodeVisits: number,
  maximumSupportPredicates: number,
) {
  const support = world.navigationSupports[search.supportIndex]
  const acceleration = world.navigationSupportAcceleration.supports[search.supportIndex]
  if (!support || !acceleration) {
    rejectZombieEscapeNavigationVisibilitySupport(search)
    return true
  }
  if (search.ringNodeIndex === -1) {
    if (
      !beginZombieEscapeNavigationVisibilitySupportRing(
        support,
        acceleration,
        search,
        maximumSupportPredicates,
      )
    ) {
      return false
    }
  }
  if (search.ringNodeIndex === -2) {
    advanceZombieEscapeNavigationVisibilitySupportRing(world, search)
    return true
  }
  const ring = resolveZombieEscapeNavigationVisibilityRing(support, search.supportRingIndex)
  const ringAcceleration = acceleration.rings[search.supportRingIndex]
  if (!ring || !ringAcceleration) {
    search.ringResult = false
    search.ringNodeIndex = -2
    return true
  }
  if (search.ringItemOffset < search.ringItemEnd) {
    if (search.lastStepSupportPredicates >= maximumSupportPredicates) return false
    const edgeIndex = ringAcceleration.hierarchy.itemIndices[search.ringItemOffset]!
    search.ringItemOffset += 1
    consumeZombieEscapeVisibilitySupport(search, 'ring-edge')
    inspectZombieEscapeNavigationVisibilityRingEdge(search, ring, edgeIndex)
    return true
  }
  const hierarchy = ringAcceleration.hierarchy
  if (search.ringNodeIndex >= hierarchy.nodeItemCounts.length) {
    search.ringResult = search.ringMode === 'point' ? search.ringInside : false
    search.ringNodeIndex = -2
    return true
  }
  if (search.lastStepHierarchyNodeVisits >= maximumHierarchyNodeVisits) return false
  const nodeIndex = search.ringNodeIndex
  consumeZombieEscapeVisibilityHierarchy(search, 'support-ring')
  if (!zombieEscapeNavigationVisibilityRingNodeMayAffect(search, hierarchy, nodeIndex)) {
    search.ringNodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
    return true
  }
  const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
  search.ringNodeIndex += 1
  if (itemCount <= 0) return true
  search.ringItemOffset = hierarchy.nodeItemOffsets[nodeIndex]!
  search.ringItemEnd = search.ringItemOffset + itemCount
  return true
}

function beginZombieEscapeNavigationVisibilitySupportRing(
  support: ZombieEscapeNavigationSupportSource,
  acceleration: ZombieEscapeNavigationSupportAccelerationEntry,
  search: ZombieEscapeNavigationVisibilitySearch,
  maximumSupportPredicates: number,
) {
  const holeStage = search.supportStage.includes('hole')
  if (holeStage) {
    if (search.lastStepSupportPredicates >= maximumSupportPredicates) return false
    consumeZombieEscapeVisibilitySupport(search, 'hole')
    search.supportRingIndex = search.supportHoleIndex + 1
  } else {
    search.supportRingIndex = 0
  }
  search.ringMode = search.supportStage.endsWith('point')
    ? 'point'
    : search.supportStage.startsWith('capsule')
      ? acceleration.capsuleFollowsValidatedDisks
        ? 'convex-capsule'
        : 'capsule'
      : 'disk'
  search.ringConvexInteriorSign = acceleration.convexInteriorSign
  const usesEnd = search.supportStage.startsWith('end')
  search.ringTargetX = usesEnd ? search.endX : search.startX
  search.ringTargetZ = usesEnd ? search.endZ : search.startZ
  search.ringInside = false
  search.ringItemEnd = 0
  search.ringItemOffset = 0
  search.ringResult = false
  const ring = resolveZombieEscapeNavigationVisibilityRing(support, search.supportRingIndex)
  const ringAcceleration = acceleration.rings[search.supportRingIndex]
  search.ringNodeIndex = !ring || !ringAcceleration || ring.length < 3 ? -2 : 0
  return true
}

function resolveZombieEscapeNavigationVisibilityRing(
  support: ZombieEscapeNavigationSupportSource,
  ringIndex: number,
) {
  return ringIndex === 0 ? support.polygon : support.holes?.[ringIndex - 1]
}

function zombieEscapeNavigationVisibilityRingNodeMayAffect(
  search: ZombieEscapeNavigationVisibilitySearch,
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  nodeIndex: number,
) {
  if (search.ringMode === 'convex-capsule') return true
  if (search.ringMode === 'point') {
    return navigationRingHierarchyNodeMayAffectPoint(
      hierarchy,
      nodeIndex,
      search.ringTargetX,
      search.ringTargetZ,
    )
  }
  if (search.ringMode === 'disk') {
    return navigationBoundsHierarchyNodeOverlapsBounds(
      hierarchy,
      nodeIndex,
      search.ringTargetX - search.radius,
      search.ringTargetZ - search.radius,
      search.ringTargetX + search.radius,
      search.ringTargetZ + search.radius,
    )
  }
  return navigationBoundsHierarchyNodeOverlapsBounds(
    hierarchy,
    nodeIndex,
    search.minimumX,
    search.minimumZ,
    search.maximumX,
    search.maximumZ,
  )
}

function inspectZombieEscapeNavigationVisibilityRingEdge(
  search: ZombieEscapeNavigationVisibilitySearch,
  ring: readonly Readonly<{ x: number; z: number }>[],
  edgeIndex: number,
) {
  const point = ring[edgeIndex]!
  const previous = ring[(edgeIndex + ring.length - 1) % ring.length]!
  if (search.ringMode === 'convex-capsule') {
    const edgeX = point.x - previous.x
    const edgeZ = point.z - previous.z
    const edgeLength = Math.hypot(edgeX, edgeZ)
    if (edgeLength <= INTERSECTION_EPSILON) return
    const startDistance =
      (search.ringConvexInteriorSign *
        (edgeX * (search.startZ - previous.z) - edgeZ * (search.startX - previous.x))) /
      edgeLength
    const endDistance =
      (search.ringConvexInteriorSign *
        (edgeX * (search.endZ - previous.z) - edgeZ * (search.endX - previous.x))) /
      edgeLength
    if (Math.min(startDistance, endDistance) + INTERSECTION_EPSILON < search.radius) {
      search.ringResult = true
      search.ringNodeIndex = -2
      search.ringItemOffset = search.ringItemEnd
    }
    return
  }
  if (search.ringMode === 'point') {
    if (
      Math.max(previous.x, point.x) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE <
        search.ringTargetX ||
      Math.max(previous.z, point.z) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE <
        search.ringTargetZ ||
      Math.min(previous.z, point.z) - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE > search.ringTargetZ
    ) {
      return
    }
    if (
      pointDistanceToSegmentSquared(
        search.ringTargetX,
        search.ringTargetZ,
        previous.x,
        previous.z,
        point.x,
        point.z,
      ) <= NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE_SQUARED
    ) {
      search.ringResult = true
      search.ringNodeIndex = -2
      search.ringItemOffset = search.ringItemEnd
      return
    }
    if (
      point.z > search.ringTargetZ !== previous.z > search.ringTargetZ &&
      search.ringTargetX <
        ((previous.x - point.x) * (search.ringTargetZ - point.z)) / (previous.z - point.z) + point.x
    ) {
      search.ringInside = !search.ringInside
    }
    return
  }
  if (
    Math.max(previous.x, point.x) < search.minimumX ||
    Math.min(previous.x, point.x) > search.maximumX ||
    Math.max(previous.z, point.z) < search.minimumZ ||
    Math.min(previous.z, point.z) > search.maximumZ
  ) {
    return
  }
  const minimumDistanceSquared = search.radius * search.radius
  const distanceSquared =
    search.ringMode === 'disk'
      ? pointDistanceToSegmentSquared(
          search.ringTargetX,
          search.ringTargetZ,
          previous.x,
          previous.z,
          point.x,
          point.z,
        )
      : segmentDistanceSquared(
          search.startX,
          search.startZ,
          search.endX,
          search.endZ,
          previous.x,
          previous.z,
          point.x,
          point.z,
        )
  if (distanceSquared + INTERSECTION_EPSILON < minimumDistanceSquared) {
    search.ringResult = true
    search.ringNodeIndex = -2
    search.ringItemOffset = search.ringItemEnd
  }
}

function advanceZombieEscapeNavigationVisibilitySupportRing(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
) {
  const support = world.navigationSupports[search.supportIndex]!
  const acceleration = world.navigationSupportAcceleration.supports[search.supportIndex]!
  const holeCount = support.holes?.length ?? 0
  const radiusNeedsEdgeChecks = search.radius * search.radius > INTERSECTION_EPSILON
  if (search.supportStage === 'start-outer-point') {
    if (!search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    return holeCount > 0
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'start-hole-point')
      : radiusNeedsEdgeChecks
        ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'start-outer-edge')
        : advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-outer-point')
  }
  if (search.supportStage === 'start-hole-point') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    search.supportHoleIndex += 1
    if (search.supportHoleIndex < holeCount) {
      return advanceZombieEscapeNavigationVisibilitySupportStage(
        search,
        'start-hole-point',
        search.supportHoleIndex,
      )
    }
    return radiusNeedsEdgeChecks
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'start-outer-edge')
      : advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-outer-point')
  }
  if (search.supportStage === 'start-outer-edge') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    return holeCount > 0
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'start-hole-edge')
      : advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-outer-point')
  }
  if (search.supportStage === 'start-hole-edge') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    search.supportHoleIndex += 1
    return search.supportHoleIndex < holeCount
      ? advanceZombieEscapeNavigationVisibilitySupportStage(
          search,
          'start-hole-edge',
          search.supportHoleIndex,
        )
      : advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-outer-point')
  }
  if (search.supportStage === 'end-outer-point') {
    if (!search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    return holeCount > 0
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-hole-point')
      : radiusNeedsEdgeChecks
        ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-outer-edge')
        : acceptZombieEscapeNavigationVisibilitySupport(search)
  }
  if (search.supportStage === 'end-hole-point') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    search.supportHoleIndex += 1
    if (search.supportHoleIndex < holeCount) {
      return advanceZombieEscapeNavigationVisibilitySupportStage(
        search,
        'end-hole-point',
        search.supportHoleIndex,
      )
    }
    return radiusNeedsEdgeChecks
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-outer-edge')
      : acceptZombieEscapeNavigationVisibilitySupport(search)
  }
  if (search.supportStage === 'end-outer-edge') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    return holeCount > 0
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'end-hole-edge')
      : acceleration.capsuleFollowsValidatedDisks
        ? acceptZombieEscapeNavigationVisibilitySupport(search)
        : advanceZombieEscapeNavigationVisibilitySupportStage(search, 'capsule-outer-edge')
  }
  if (search.supportStage === 'end-hole-edge') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    search.supportHoleIndex += 1
    return search.supportHoleIndex < holeCount
      ? advanceZombieEscapeNavigationVisibilitySupportStage(
          search,
          'end-hole-edge',
          search.supportHoleIndex,
        )
      : advanceZombieEscapeNavigationVisibilitySupportStage(search, 'capsule-outer-edge')
  }
  if (search.supportStage === 'capsule-outer-edge') {
    if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
    return holeCount > 0
      ? advanceZombieEscapeNavigationVisibilitySupportStage(search, 'capsule-hole-edge')
      : acceptZombieEscapeNavigationVisibilitySupport(search)
  }
  if (search.ringResult) return rejectZombieEscapeNavigationVisibilitySupport(search)
  search.supportHoleIndex += 1
  return search.supportHoleIndex < holeCount
    ? advanceZombieEscapeNavigationVisibilitySupportStage(
        search,
        'capsule-hole-edge',
        search.supportHoleIndex,
      )
    : acceptZombieEscapeNavigationVisibilitySupport(search)
}

function advanceZombieEscapeNavigationVisibilitySupportStage(
  search: ZombieEscapeNavigationVisibilitySearch,
  stage: ZombieEscapeNavigationVisibilitySupportStage,
  holeIndex = 0,
) {
  search.supportStage = stage
  search.supportHoleIndex = holeIndex
  search.ringNodeIndex = -1
}

function rejectZombieEscapeNavigationVisibilitySupport(
  search: ZombieEscapeNavigationVisibilitySearch,
) {
  search.ringNodeIndex = -1
  search.supportIndex = -1
  search.phase = 'support-item'
}

function acceptZombieEscapeNavigationVisibilitySupport(
  search: ZombieEscapeNavigationVisibilitySearch,
) {
  search.collisionCandidateIndex = -1
  search.collisionItemEnd = 0
  search.collisionItemOffset = 0
  search.collisionNodeIndex = 0
  search.phase = 'collision-hierarchy'
}

function stepZombieEscapeNavigationVisibilityColliders(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  maximumCandidateVisits: number,
  maximumCollisionPredicates: number,
  maximumHierarchyNodeVisits: number,
) {
  const hierarchy = world.navigationColliderAcceleration
  if (search.phase === 'collision-item') {
    if (search.collisionCandidateIndex >= 0) {
      if (search.lastStepCollisionPredicates >= maximumCollisionPredicates) return false
      consumeZombieEscapeVisibilityCollision(search)
      inspectZombieEscapeNavigationVisibilityCollider(world, search, search.collisionCandidateIndex)
      search.collisionCandidateIndex = -1
      return true
    }
    if (search.collisionItemOffset >= search.collisionItemEnd) {
      search.phase = 'collision-hierarchy'
      return true
    }
    if (search.lastStepCandidateVisits >= maximumCandidateVisits) return false
    const colliderIndex = hierarchy.itemIndices[search.collisionItemOffset]!
    search.collisionItemOffset += 1
    consumeZombieEscapeVisibilityCandidate(search, 'collider')
    if (!zombieEscapeNavigationVisibilityColliderIsEligible(world, search, colliderIndex)) {
      return true
    }
    search.collisionCandidateIndex = colliderIndex
    return true
  }
  if (search.collisionNodeIndex >= hierarchy.nodeItemCounts.length) {
    completeZombieEscapeNavigationVisibility(
      search,
      search.collisionHit.colliderKind === 'none' ||
        search.collisionHit.time >= 1 - COLLISION_EPSILON_METERS
        ? 'clear'
        : 'blocked',
    )
    return true
  }
  if (search.lastStepHierarchyNodeVisits >= maximumHierarchyNodeVisits) return false
  const nodeIndex = search.collisionNodeIndex
  consumeZombieEscapeVisibilityHierarchy(search, 'collider')
  if (
    !navigationBoundsHierarchyNodeOverlapsBounds(
      hierarchy,
      nodeIndex,
      search.minimumX,
      search.minimumZ,
      search.maximumX,
      search.maximumZ,
    )
  ) {
    search.collisionNodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
    return true
  }
  const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
  search.collisionNodeIndex += 1
  if (itemCount <= 0) return true
  search.collisionItemOffset = hierarchy.nodeItemOffsets[nodeIndex]!
  search.collisionItemEnd = search.collisionItemOffset + itemCount
  search.phase = 'collision-item'
  return true
}

function zombieEscapeNavigationVisibilityColliderIsEligible(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  colliderIndex: number,
) {
  if (!zombieEscapeColliderIndexIsActive(world, colliderIndex)) return false
  const segmentCount = world.segments.length
  const circleCount = world.circles.length
  const collider =
    colliderIndex < segmentCount
      ? world.segments[colliderIndex]
      : colliderIndex < segmentCount + circleCount
        ? world.circles[colliderIndex - segmentCount]
        : world.boxes[colliderIndex - segmentCount - circleCount]
  return Boolean(
    collider && colliderMatchesNavigationLayer(world, collider, search.navigationLayerIndex),
  )
}

function inspectZombieEscapeNavigationVisibilityCollider(
  world: ZombieEscapeCollisionWorld,
  search: ZombieEscapeNavigationVisibilitySearch,
  colliderIndex: number,
) {
  const segmentCount = world.segments.length
  const circleCount = world.circles.length
  const collider =
    colliderIndex < segmentCount
      ? world.segments[colliderIndex]
      : colliderIndex < segmentCount + circleCount
        ? world.circles[colliderIndex - segmentCount]
        : world.boxes[colliderIndex - segmentCount - circleCount]
  if (!collider) return
  const objectOrdinal = world.objectCatalog.colliderObjectOrdinals[colliderIndex] ?? -1
  const traversesBreakable =
    search.breakablesTraversable &&
    collider.breakable &&
    objectOrdinal >= 0 &&
    world.objectCatalog.objectSupportsMaskRemoval[objectOrdinal] !== 0
  const collisionHit = traversesBreakable ? search.breakableCollisionHit : search.collisionHit
  if (traversesBreakable) resetCollisionHit(collisionHit)
  if (colliderIndex < segmentCount) {
    const segment = world.segments[colliderIndex]!
    updateSegmentHit(
      search.startX,
      search.startZ,
      search.endX,
      search.endZ,
      segment,
      segment.halfThickness + search.radius,
      colliderIndex,
      collisionHit,
    )
  } else if (colliderIndex < segmentCount + circleCount) {
    const circleIndex = colliderIndex - segmentCount
    const circle = world.circles[circleIndex]!
    updateCircleHit(
      search.startX,
      search.startZ,
      search.endX,
      search.endZ,
      circle,
      circle.radius + search.radius,
      circleIndex,
      collisionHit,
    )
  } else {
    const boxIndex = colliderIndex - segmentCount - circleCount
    updateBoxHit(
      search.startX,
      search.startZ,
      search.endX,
      search.endZ,
      world.boxes[boxIndex]!,
      search.radius,
      boxIndex,
      collisionHit,
    )
  }
  if (
    traversesBreakable &&
    collisionHit.colliderKind !== 'none' &&
    collisionHit.time < 1 - COLLISION_EPSILON_METERS
  ) {
    search.breakableObjectOrdinals.add(objectOrdinal)
  }
}

function completeZombieEscapeNavigationVisibility(
  search: ZombieEscapeNavigationVisibilitySearch,
  status: Exclude<ZombieEscapeNavigationVisibilityStatus, 'pending'>,
) {
  search.phase = 'complete'
  search.status = status
}

type ZombieEscapeVisibilityWorkOwner =
  | ZombieEscapeSparseAttachmentSearch
  | ZombieEscapeSparseFlowSearch
  | ZombieEscapeSparseReachableSpawnSearch
  | ZombieEscapeSparseTargetUpdate

function stepZombieEscapeNavigationVisibilityForOwner(
  world: ZombieEscapeCollisionWorld,
  visibility: ZombieEscapeNavigationVisibilitySearch,
  owner: ZombieEscapeVisibilityWorkOwner,
  maximumCandidateVisits: number,
  maximumCollisionPredicates: number,
  maximumHierarchyNodeVisits: number,
  maximumSupportPredicates: number,
) {
  const status = stepZombieEscapeNavigationVisibilitySearchWithLimits(
    world,
    visibility,
    Math.max(0, maximumCandidateVisits - owner.lastStepCandidateVisits),
    Math.max(0, maximumCollisionPredicates - owner.lastStepCollisionPredicates),
    Math.max(0, maximumHierarchyNodeVisits - owner.lastStepHierarchyNodeVisits),
    Math.max(0, maximumSupportPredicates - owner.lastStepSupportPredicates),
  )
  accumulateZombieEscapeNavigationVisibilityWork(owner, visibility)
  return status
}

function accumulateZombieEscapeNavigationVisibilityWork(
  owner: ZombieEscapeVisibilityWorkOwner,
  visibility: ZombieEscapeNavigationVisibilitySearch,
) {
  owner.lastStepCandidateVisits += visibility.lastStepCandidateVisits
  owner.lastStepColliderCandidateVisits += visibility.lastStepColliderCandidateVisits
  owner.lastStepColliderHierarchyNodeVisits += visibility.lastStepColliderHierarchyNodeVisits
  owner.lastStepCollisionPredicates += visibility.lastStepCollisionPredicates
  owner.lastStepHierarchyNodeVisits += visibility.lastStepHierarchyNodeVisits
  owner.lastStepSupportHierarchyNodeVisits += visibility.lastStepSupportHierarchyNodeVisits
  owner.lastStepSupportHoleVisits += visibility.lastStepSupportHoleVisits
  owner.lastStepSupportItemVisits += visibility.lastStepSupportItemVisits
  owner.lastStepSupportPredicates += visibility.lastStepSupportPredicates
  owner.lastStepSupportRingEdgeVisits += visibility.lastStepSupportRingEdgeVisits
  owner.lastStepSupportRingHierarchyNodeVisits += visibility.lastStepSupportRingHierarchyNodeVisits
  owner.totalCandidateVisits += visibility.lastStepCandidateVisits
  owner.totalColliderCandidateVisits += visibility.lastStepColliderCandidateVisits
  owner.totalColliderHierarchyNodeVisits += visibility.lastStepColliderHierarchyNodeVisits
  owner.totalCollisionPredicates += visibility.lastStepCollisionPredicates
  owner.totalHierarchyNodeVisits += visibility.lastStepHierarchyNodeVisits
  owner.totalSupportHierarchyNodeVisits += visibility.lastStepSupportHierarchyNodeVisits
  owner.totalSupportHoleVisits += visibility.lastStepSupportHoleVisits
  owner.totalSupportItemVisits += visibility.lastStepSupportItemVisits
  owner.totalSupportPredicates += visibility.lastStepSupportPredicates
  owner.totalSupportRingEdgeVisits += visibility.lastStepSupportRingEdgeVisits
  owner.totalSupportRingHierarchyNodeVisits += visibility.lastStepSupportRingHierarchyNodeVisits
}

function resetZombieEscapeVisibilityOwnerStepWork(owner: ZombieEscapeVisibilityWorkOwner) {
  owner.lastStepCandidateVisits = 0
  owner.lastStepColliderCandidateVisits = 0
  owner.lastStepColliderHierarchyNodeVisits = 0
  owner.lastStepCollisionPredicates = 0
  owner.lastStepHierarchyNodeVisits = 0
  owner.lastStepSupportHierarchyNodeVisits = 0
  owner.lastStepSupportHoleVisits = 0
  owner.lastStepSupportItemVisits = 0
  owner.lastStepSupportPredicates = 0
  owner.lastStepSupportRingEdgeVisits = 0
  owner.lastStepSupportRingHierarchyNodeVisits = 0
}

export function resolveZombieEscapeCollisionHitObjectId(
  world: ZombieEscapeCollisionWorld,
  hit: ZombieEscapeCollisionHit,
) {
  if (hit.colliderKind === 'box') return world.boxes[hit.colliderIndex]?.objectId ?? null
  if (hit.colliderKind === 'circle') return world.circles[hit.colliderIndex]?.objectId ?? null
  if (hit.colliderKind === 'segment') return world.segments[hit.colliderIndex]?.objectId ?? null
  return null
}

export function resolveZombieEscapeCollisionHitObjectOrdinal(
  world: ZombieEscapeCollisionWorld,
  hit: ZombieEscapeCollisionHit,
) {
  const colliderIndex =
    hit.colliderKind === 'segment'
      ? hit.colliderIndex
      : hit.colliderKind === 'circle'
        ? world.segments.length + hit.colliderIndex
        : hit.colliderKind === 'box'
          ? world.segments.length + world.circles.length + hit.colliderIndex
          : -1
  return colliderIndex < 0 ? -1 : (world.objectCatalog.colliderObjectOrdinals[colliderIndex] ?? -1)
}

export function resolveZombieEscapeCollisionObjectIdByOrdinal(
  world: ZombieEscapeCollisionWorld,
  objectOrdinal: number,
) {
  return world.objectCatalog.objectIds[objectOrdinal] ?? null
}

export function isZombieEscapeCollisionHitBreakable(
  world: ZombieEscapeCollisionWorld,
  hit: ZombieEscapeCollisionHit,
): boolean {
  const collider =
    hit.colliderKind === 'box'
      ? world.boxes[hit.colliderIndex]
      : hit.colliderKind === 'circle'
        ? world.circles[hit.colliderIndex]
        : hit.colliderKind === 'segment'
          ? world.segments[hit.colliderIndex]
          : null
  return collider?.breakable === true
}

export function isZombieEscapeCollisionObjectBreakable(
  world: ZombieEscapeCollisionWorld,
  objectId: string,
) {
  return world.breakableObjectIds.has(objectId)
}

export function isZombieEscapeCollisionObjectBreakableAtElevation(
  world: ZombieEscapeCollisionWorld,
  objectId: string,
  elevation: number,
) {
  const layer = world.navigationLayers[resolveNavigationLayerIndex(world, elevation)]
  if (!layer) return false
  for (const colliders of [world.boxes, world.circles, world.segments]) {
    if (
      colliders.some(
        (collider) =>
          collider.breakable &&
          collider.objectId === objectId &&
          colliderVerticalRangeBlocksNavigationElevation(collider, layer.elevation),
      )
    ) {
      return true
    }
  }
  return false
}

function maximumZombieEscapeAttachmentHierarchyNodeCount(world: ZombieEscapeCollisionWorld) {
  let maximumNodeCount = 0
  for (const hierarchy of world.navigationAttachmentAcceleration.layers) {
    maximumNodeCount = Math.max(maximumNodeCount, hierarchy.nodeItemCounts.length)
  }
  return maximumNodeCount
}

function createZombieEscapeSparseAttachmentHeapWorkspace(
  world: ZombieEscapeCollisionWorld,
  generation = 0,
): ZombieEscapeSparseAttachmentHeapWorkspace {
  const slotCapacity = maximumZombieEscapeAttachmentHierarchyNodeCount(world)
  return {
    availableGeneralSlotCount: 8,
    generation,
    leaseInvariantViolationCount: 0,
    maximumActiveGeneralSlotCount: 0,
    nextLeaseToken: 1,
    nodes: new Int32Array(slotCapacity * SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT),
    ownerTokens: new Uint32Array(SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT),
    slotCapacity,
  }
}

function nextZombieEscapeSparseAttachmentHeapLeaseToken(
  workspace: ZombieEscapeSparseAttachmentHeapWorkspace,
) {
  for (;;) {
    const token = workspace.nextLeaseToken
    workspace.nextLeaseToken = (token + 1) >>> 0 || 1
    let available = token !== 0
    for (let slot = 0; available && slot < workspace.ownerTokens.length; slot += 1) {
      available = workspace.ownerTokens[slot] !== token
    }
    if (available) return token
  }
}

function reserveZombieEscapeSparseAttachmentHeapSlot(
  search: ZombieEscapeSparseAttachmentSearch,
  workspace: ZombieEscapeSparseAttachmentHeapWorkspace,
  slot: number,
) {
  const token = nextZombieEscapeSparseAttachmentHeapLeaseToken(workspace)
  workspace.ownerTokens[slot] = token
  search.hierarchyHeapLeaseGeneration = workspace.generation
  search.hierarchyHeapLeaseToken = token
  search.hierarchyHeapReserved = slot >= 8
  search.hierarchyHeapSlot = slot
  search.hierarchyHeapWorkspace = workspace
}

function validateZombieEscapeSparseAttachmentHeapWorkspace(
  workspace: ZombieEscapeSparseAttachmentHeapWorkspace,
) {
  let activeGeneralSlotCount = 0
  for (let slot = 0; slot < 8; slot += 1) {
    if (workspace.ownerTokens[slot] === 0) continue
    activeGeneralSlotCount += 1
  }
  workspace.maximumActiveGeneralSlotCount = Math.max(
    workspace.maximumActiveGeneralSlotCount,
    activeGeneralSlotCount,
  )
  if (
    workspace.availableGeneralSlotCount < 0 ||
    workspace.availableGeneralSlotCount > 8 ||
    activeGeneralSlotCount < 0 ||
    activeGeneralSlotCount > 8 ||
    activeGeneralSlotCount + workspace.availableGeneralSlotCount !== 8
  ) {
    workspace.leaseInvariantViolationCount += 1
  }
}

function releaseZombieEscapeSparseAttachmentHeapSlot(
  search: ZombieEscapeSparseAttachmentSearch,
  force = false,
) {
  releaseZombieEscapeSparseReverseFieldBankLease(search)
  if (search.hierarchyHeapReserved && !force) return
  const workspace = search.hierarchyHeapWorkspace
  const slot = search.hierarchyHeapSlot
  if (
    workspace &&
    search.hierarchyHeapLeaseGeneration === workspace.generation &&
    workspace.ownerTokens[slot] === search.hierarchyHeapLeaseToken
  ) {
    workspace.ownerTokens[slot] = 0
    if (slot < 8) workspace.availableGeneralSlotCount += 1
    validateZombieEscapeSparseAttachmentHeapWorkspace(workspace)
  }
  search.hierarchyHeapLeaseGeneration = -1
  search.hierarchyHeapLeaseToken = 0
  search.hierarchyHeapReserved = false
  search.hierarchyHeapSlot = -1
  search.hierarchyHeapWorkspace = null
}

function bindZombieEscapeSparseFieldAttachmentHeapSlots(
  field: ZombieEscapeFlowField,
  workspace: ZombieEscapeSparseAttachmentHeapWorkspace,
) {
  releaseZombieEscapeSparseAttachmentHeapSlot(field.graphSparseFlowSearch.attachment, true)
  releaseZombieEscapeSparseAttachmentHeapSlot(
    field.graphSparseReachableSpawnSearch.attachment,
    true,
  )
  reserveZombieEscapeSparseAttachmentHeapSlot(field.graphSparseFlowSearch.attachment, workspace, 8)
  reserveZombieEscapeSparseAttachmentHeapSlot(
    field.graphSparseReachableSpawnSearch.attachment,
    workspace,
    9,
  )
  validateZombieEscapeSparseAttachmentHeapWorkspace(workspace)
}

function acquireZombieEscapeSparseAttachmentHeapSlot(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
) {
  const workspace = field.graphAttachmentHeapWorkspace
  if (
    search.hierarchyHeapWorkspace === workspace &&
    search.hierarchyHeapLeaseGeneration === workspace.generation &&
    workspace.ownerTokens[search.hierarchyHeapSlot] === search.hierarchyHeapLeaseToken
  ) {
    return true
  }
  releaseZombieEscapeSparseAttachmentHeapSlot(search)
  if (workspace.availableGeneralSlotCount <= 0) return false
  for (let slot = 0; slot < 8; slot += 1) {
    if (workspace.ownerTokens[slot] !== 0) continue
    reserveZombieEscapeSparseAttachmentHeapSlot(search, workspace, slot)
    workspace.availableGeneralSlotCount -= 1
    validateZombieEscapeSparseAttachmentHeapWorkspace(workspace)
    return true
  }
  return false
}

function zombieEscapeSparseAttachmentHeapSlotIsAvailable(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
) {
  const workspace = field.graphAttachmentHeapWorkspace
  return (
    zombieEscapeSparseAttachmentHeapSlotIsHeld(search, field) ||
    workspace.availableGeneralSlotCount > 0
  )
}

function zombieEscapeSparseAttachmentHeapSlotIsHeld(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
) {
  const workspace = field.graphAttachmentHeapWorkspace
  return (
    search.hierarchyHeapWorkspace === workspace &&
    search.hierarchyHeapLeaseGeneration === workspace.generation &&
    workspace.ownerTokens[search.hierarchyHeapSlot] === search.hierarchyHeapLeaseToken
  )
}

export function inspectZombieEscapeSparseAttachmentHeapLeases(
  field: ZombieEscapeFlowField,
): ZombieEscapeSparseAttachmentHeapLeaseInspection {
  const workspace = field.graphAttachmentHeapWorkspace
  let activeAgentLeases = 0
  for (let slot = 0; slot < 8; slot += 1) {
    if (workspace.ownerTokens[slot] !== 0) activeAgentLeases += 1
  }
  return {
    activeAgentLeases,
    availableAgentLeases: workspace.availableGeneralSlotCount,
    leaseInvariantViolationCount: workspace.leaseInvariantViolationCount,
    maximumActiveAgentLeases: workspace.maximumActiveGeneralSlotCount,
    maximumHierarchyNodeCount: workspace.slotCapacity,
    singletonReserved:
      field.graphSparseFlowSearch.attachment.hierarchyHeapLeaseToken !== 0 &&
      field.graphSparseFlowSearch.attachment.hierarchyHeapWorkspace === workspace &&
      workspace.ownerTokens[8] === field.graphSparseFlowSearch.attachment.hierarchyHeapLeaseToken,
    spawnReserved:
      field.graphSparseReachableSpawnSearch.attachment.hierarchyHeapLeaseToken !== 0 &&
      field.graphSparseReachableSpawnSearch.attachment.hierarchyHeapWorkspace === workspace &&
      workspace.ownerTokens[9] ===
        field.graphSparseReachableSpawnSearch.attachment.hierarchyHeapLeaseToken,
  }
}

function createZombieEscapeSparseReverseFieldBank(
  graphNodeCount: number,
  breachObjectWordCount: number,
): ZombieEscapeSparseReverseFieldBank {
  return {
    breachObjectWordCount,
    fallbackReachableCount: 0,
    fallbackTargetCell: FLOW_FALLBACK_UNBUILT,
    generation: 0,
    graphFallbackBreachCounts: new Uint32Array(graphNodeCount),
    graphFallbackBreachMasks: new Uint32Array(graphNodeCount * breachObjectWordCount),
    graphFallbackCosts: new Float64Array(graphNodeCount).fill(Number.POSITIVE_INFINITY),
    graphFallbackDistances: new Float64Array(graphNodeCount).fill(Number.POSITIVE_INFINITY),
    graphFallbackNextNodes: new Int32Array(graphNodeCount).fill(-1),
    graphFallbackTargetNodeCount: 0,
    graphFallbackTargetNodeMarks: new Uint8Array(graphNodeCount),
    graphFallbackTargetNodes: new Int32Array(graphNodeCount),
    graphSameLayerFallbackBreachCounts: new Uint32Array(graphNodeCount),
    graphSameLayerFallbackBreachMasks: new Uint32Array(graphNodeCount * breachObjectWordCount),
    graphSameLayerFallbackCosts: new Float64Array(graphNodeCount).fill(Number.POSITIVE_INFINITY),
    graphSameLayerDistances: new Float64Array(graphNodeCount).fill(Number.POSITIVE_INFINITY),
    graphSameLayerFallbackDistances: new Float64Array(graphNodeCount).fill(
      Number.POSITIVE_INFINITY,
    ),
    graphSameLayerFallbackNextNodes: new Int32Array(graphNodeCount).fill(-1),
    graphSameLayerNextNodes: new Int32Array(graphNodeCount).fill(-1),
    graphStrictDistances: new Float64Array(graphNodeCount).fill(Number.POSITIVE_INFINITY),
    graphStrictNextNodes: new Int32Array(graphNodeCount).fill(-1),
    graphStrictTargetNodeCount: 0,
    graphStrictTargetNodeMarks: new Uint8Array(graphNodeCount),
    graphStrictTargetNodes: new Int32Array(graphNodeCount),
    reachableCount: 0,
    routeTargetBucketX: -1,
    routeTargetBucketZ: -1,
    routeTargetInitialized: false,
    routeTargetLayerIndex: -1,
    routeTargetX: 0,
    routeTargetY: 0,
    routeTargetZ: 0,
    targetCell: FLOW_STRICT_UNBUILT,
    targetLayerIndex: -1,
    worldRevision: '',
  }
}

function resetZombieEscapeSparseReverseFieldBank(bank: ZombieEscapeSparseReverseFieldBank) {
  bank.fallbackReachableCount = 0
  bank.fallbackTargetCell = FLOW_FALLBACK_UNBUILT
  bank.generation = 0
  bank.graphFallbackBreachCounts.fill(0)
  bank.graphFallbackBreachMasks.fill(0)
  bank.graphFallbackCosts.fill(Number.POSITIVE_INFINITY)
  bank.graphFallbackDistances.fill(Number.POSITIVE_INFINITY)
  bank.graphFallbackNextNodes.fill(-1)
  bank.graphFallbackTargetNodeCount = 0
  bank.graphFallbackTargetNodeMarks.fill(0)
  bank.graphFallbackTargetNodes.fill(0)
  bank.graphSameLayerFallbackBreachCounts.fill(0)
  bank.graphSameLayerFallbackBreachMasks.fill(0)
  bank.graphSameLayerFallbackCosts.fill(Number.POSITIVE_INFINITY)
  bank.graphSameLayerDistances.fill(Number.POSITIVE_INFINITY)
  bank.graphSameLayerFallbackDistances.fill(Number.POSITIVE_INFINITY)
  bank.graphSameLayerFallbackNextNodes.fill(-1)
  bank.graphSameLayerNextNodes.fill(-1)
  bank.graphStrictDistances.fill(Number.POSITIVE_INFINITY)
  bank.graphStrictNextNodes.fill(-1)
  bank.graphStrictTargetNodeCount = 0
  bank.graphStrictTargetNodeMarks.fill(0)
  bank.graphStrictTargetNodes.fill(0)
  bank.reachableCount = 0
  bank.routeTargetBucketX = -1
  bank.routeTargetBucketZ = -1
  bank.routeTargetInitialized = false
  bank.routeTargetLayerIndex = -1
  bank.routeTargetX = 0
  bank.routeTargetY = 0
  bank.routeTargetZ = 0
  bank.targetCell = FLOW_STRICT_UNBUILT
  bank.targetLayerIndex = -1
  bank.worldRevision = ''
}

function resetZombieEscapeSparseReverseFieldBankWorkspace(
  workspace: ZombieEscapeSparseReverseFieldBankWorkspace,
) {
  const activeBankIndex = workspace.activeBankIndex
  for (const bank of workspace.banks) resetZombieEscapeSparseReverseFieldBank(bank)
  workspace.activeBankIndex = activeBankIndex
  workspace.bankReaderCounts.fill(0)
  workspace.generation = 0
  workspace.leaseInvariantViolationCount = 0
  workspace.maximumReaderLeaseCount = 0
  workspace.publicationBlockedCount = 0
  workspace.publicationCount = 0
  workspace.readerBankIndices.fill(-1)
  workspace.readerGenerations.fill(0)
  workspace.readerOwnerTokens.fill(0)
}

function zombieEscapeSparseReverseFieldBankAllocatedBytes(
  bank: ZombieEscapeSparseReverseFieldBank,
) {
  return (
    bank.graphFallbackBreachCounts.byteLength +
    bank.graphFallbackBreachMasks.byteLength +
    bank.graphFallbackCosts.byteLength +
    bank.graphFallbackDistances.byteLength +
    bank.graphFallbackNextNodes.byteLength +
    bank.graphFallbackTargetNodeMarks.byteLength +
    bank.graphFallbackTargetNodes.byteLength +
    bank.graphSameLayerFallbackBreachCounts.byteLength +
    bank.graphSameLayerFallbackBreachMasks.byteLength +
    bank.graphSameLayerFallbackCosts.byteLength +
    bank.graphSameLayerDistances.byteLength +
    bank.graphSameLayerFallbackDistances.byteLength +
    bank.graphSameLayerFallbackNextNodes.byteLength +
    bank.graphSameLayerNextNodes.byteLength +
    bank.graphStrictDistances.byteLength +
    bank.graphStrictNextNodes.byteLength +
    bank.graphStrictTargetNodeMarks.byteLength +
    bank.graphStrictTargetNodes.byteLength
  )
}

function createZombieEscapeSparseReverseFieldBankWorkspace(
  graphNodeCount: number,
  breachObjectCount: number,
): ZombieEscapeSparseReverseFieldBankWorkspace {
  const breachObjectWordCount = Math.ceil(breachObjectCount / 32)
  const banks: [ZombieEscapeSparseReverseFieldBank, ZombieEscapeSparseReverseFieldBank] = [
    createZombieEscapeSparseReverseFieldBank(graphNodeCount, breachObjectWordCount),
    createZombieEscapeSparseReverseFieldBank(graphNodeCount, breachObjectWordCount),
  ]
  return {
    activeBankIndex: 0,
    allocatedBytes:
      zombieEscapeSparseReverseFieldBankAllocatedBytes(banks[0]) +
      zombieEscapeSparseReverseFieldBankAllocatedBytes(banks[1]),
    bankReaderCounts: new Uint8Array(SPARSE_REVERSE_FIELD_BANK_COUNT),
    banks,
    generation: 0,
    leaseInvariantViolationCount: 0,
    maximumReaderLeaseCount: 0,
    publicationBlockedCount: 0,
    publicationCount: 0,
    readerBankIndices: new Int8Array(SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT).fill(-1),
    readerGenerations: new Uint32Array(SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT),
    readerOwnerTokens: new Uint32Array(SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT),
  }
}

function activeZombieEscapeSparseReverseFieldBank(field: ZombieEscapeFlowField) {
  const workspace = field.graphReverseFieldBanks
  return workspace.banks[workspace.activeBankIndex]!
}

function zombieEscapeSparseValidatedTargetMatchesBank(
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
) {
  const update = field.graphSparseTargetUpdate
  return (
    update.routeTargetInitialized &&
    update.status !== 'invalidated' &&
    update.worldRevision === field.world.revision &&
    update.routeTargetLayerIndex === bank.targetLayerIndex
  )
}

type ZombieEscapeSparseEffectiveCommittedTarget = Readonly<{
  routeTargetInitialized: boolean
  routeTargetLayerIndex: number
  routeTargetX: number
  routeTargetY: number
  routeTargetZ: number
}>

function resolveZombieEscapeSparseEffectiveCommittedTargetForBank(
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
): ZombieEscapeSparseEffectiveCommittedTarget {
  return zombieEscapeSparseValidatedTargetMatchesBank(field, bank)
    ? field.graphSparseTargetUpdate
    : bank
}

export function resolveZombieEscapeSparseEffectiveCommittedTarget(
  field: ZombieEscapeFlowField,
): ZombieEscapeSparseEffectiveCommittedTarget {
  return resolveZombieEscapeSparseEffectiveCommittedTargetForBank(
    field,
    activeZombieEscapeSparseReverseFieldBank(field),
  )
}

function stagingZombieEscapeSparseReverseFieldBankIndex(field: ZombieEscapeFlowField) {
  return 1 - field.graphReverseFieldBanks.activeBankIndex
}

function stagingZombieEscapeSparseReverseFieldBank(field: ZombieEscapeFlowField) {
  const workspace = field.graphReverseFieldBanks
  return workspace.banks[stagingZombieEscapeSparseReverseFieldBankIndex(field)]!
}

function validateZombieEscapeSparseReverseFieldBankLeases(
  workspace: ZombieEscapeSparseReverseFieldBankWorkspace,
) {
  let readerLeaseCount = 0
  let bankZeroReaderCount = 0
  let bankOneReaderCount = 0
  for (let slot = 0; slot < workspace.readerOwnerTokens.length; slot += 1) {
    if (workspace.readerOwnerTokens[slot] === 0) continue
    readerLeaseCount += 1
    if (workspace.readerBankIndices[slot] === 0) bankZeroReaderCount += 1
    else if (workspace.readerBankIndices[slot] === 1) bankOneReaderCount += 1
    else workspace.leaseInvariantViolationCount += 1
  }
  workspace.maximumReaderLeaseCount = Math.max(workspace.maximumReaderLeaseCount, readerLeaseCount)
  if (
    readerLeaseCount > SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT ||
    bankZeroReaderCount !== workspace.bankReaderCounts[0] ||
    bankOneReaderCount !== workspace.bankReaderCounts[1] ||
    readerLeaseCount !== bankZeroReaderCount + bankOneReaderCount
  ) {
    workspace.leaseInvariantViolationCount += 1
  }
}

function releaseZombieEscapeSparseReverseFieldBankLease(
  search: ZombieEscapeSparseAttachmentSearch,
) {
  const workspace = search.reverseFieldBankWorkspace
  const slot = search.hierarchyHeapSlot
  if (
    workspace &&
    slot >= 0 &&
    workspace.readerOwnerTokens[slot] === search.hierarchyHeapLeaseToken &&
    workspace.readerBankIndices[slot] === search.reverseFieldBankIndex &&
    workspace.readerGenerations[slot] === search.reverseFieldBankGeneration
  ) {
    workspace.readerOwnerTokens[slot] = 0
    workspace.readerBankIndices[slot] = -1
    workspace.readerGenerations[slot] = 0
    const readerCount = workspace.bankReaderCounts[search.reverseFieldBankIndex]!
    if (readerCount > 0) {
      workspace.bankReaderCounts[search.reverseFieldBankIndex] = readerCount - 1
    } else {
      workspace.leaseInvariantViolationCount += 1
    }
    validateZombieEscapeSparseReverseFieldBankLeases(workspace)
  }
  search.reverseFieldBankGeneration = 0
  search.reverseFieldBankIndex = -1
  search.reverseFieldBankWorkspace = null
  search.reverseFieldDistanceVariant = -1
}

function pinnedZombieEscapeSparseReverseFieldBank(search: ZombieEscapeSparseAttachmentSearch) {
  const workspace = search.reverseFieldBankWorkspace
  const slot = search.hierarchyHeapSlot
  if (
    !workspace ||
    slot < 0 ||
    workspace.readerOwnerTokens[slot] !== search.hierarchyHeapLeaseToken ||
    workspace.readerBankIndices[slot] !== search.reverseFieldBankIndex ||
    workspace.readerGenerations[slot] !== search.reverseFieldBankGeneration
  ) {
    return null
  }
  const bank = workspace.banks[search.reverseFieldBankIndex]
  return bank?.generation === search.reverseFieldBankGeneration ? bank : null
}

function acquireZombieEscapeSparseReverseFieldBankLease(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
) {
  const heldBank = pinnedZombieEscapeSparseReverseFieldBank(search)
  if (heldBank) return heldBank
  releaseZombieEscapeSparseReverseFieldBankLease(search)
  if (!zombieEscapeSparseAttachmentHeapSlotIsHeld(search, field)) return null
  const workspace = field.graphReverseFieldBanks
  const slot = search.hierarchyHeapSlot
  if (workspace.readerOwnerTokens[slot] !== 0) {
    workspace.leaseInvariantViolationCount += 1
    return null
  }
  const bankIndex = workspace.activeBankIndex
  const bank = workspace.banks[bankIndex]!
  workspace.readerOwnerTokens[slot] = search.hierarchyHeapLeaseToken
  workspace.readerBankIndices[slot] = bankIndex
  workspace.readerGenerations[slot] = bank.generation
  workspace.bankReaderCounts[bankIndex] = workspace.bankReaderCounts[bankIndex]! + 1
  search.reverseFieldBankGeneration = bank.generation
  search.reverseFieldBankIndex = bankIndex
  search.reverseFieldBankWorkspace = workspace
  validateZombieEscapeSparseReverseFieldBankLeases(workspace)
  return bank
}

function zombieEscapeSparseReverseFieldDistanceVariant(
  bank: ZombieEscapeSparseReverseFieldBank,
  distances: Float64Array,
) {
  if (distances === bank.graphStrictDistances) return 0
  if (distances === bank.graphSameLayerDistances) return 1
  if (distances === bank.graphFallbackDistances || distances === bank.graphFallbackCosts) return 2
  if (
    distances === bank.graphSameLayerFallbackDistances ||
    distances === bank.graphSameLayerFallbackCosts
  ) {
    return 3
  }
  return -1
}

function zombieEscapeSparseReverseFieldDistances(
  bank: ZombieEscapeSparseReverseFieldBank,
  variant: number,
) {
  if (variant === 0) return bank.graphStrictDistances
  if (variant === 1) return bank.graphSameLayerDistances
  if (variant === 2) return bank.graphFallbackDistances
  return bank.graphSameLayerFallbackDistances
}

function zombieEscapeSparseReverseFieldCosts(
  bank: ZombieEscapeSparseReverseFieldBank,
  variant: number,
) {
  if (variant === 0) return bank.graphStrictDistances
  if (variant === 1) return bank.graphSameLayerDistances
  if (variant === 2) return bank.graphFallbackCosts
  return bank.graphSameLayerFallbackCosts
}

function zombieEscapeSparseReverseFieldBreachCounts(
  bank: ZombieEscapeSparseReverseFieldBank,
  variant: number,
) {
  if (variant === 2) return bank.graphFallbackBreachCounts
  if (variant === 3) return bank.graphSameLayerFallbackBreachCounts
  return null
}

function zombieEscapeSparseReverseFieldBreachMasks(
  bank: ZombieEscapeSparseReverseFieldBank,
  variant: number,
) {
  if (variant === 2) return bank.graphFallbackBreachMasks
  if (variant === 3) return bank.graphSameLayerFallbackBreachMasks
  return null
}

function findZombieEscapeSparseBreachObjectIndex(
  breachObjectOrdinals: Uint32Array,
  objectOrdinal: number,
) {
  let minimum = 0
  let maximum = breachObjectOrdinals.length - 1
  while (minimum <= maximum) {
    const middle = (minimum + maximum) >>> 1
    const candidate = breachObjectOrdinals[middle]!
    if (candidate === objectOrdinal) return middle
    if (candidate < objectOrdinal) minimum = middle + 1
    else maximum = middle - 1
  }
  return -1
}

function countZombieEscapeSparseAttachmentBreachesOutsideRoute(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
) {
  const world = field.world
  const graph = world.navigationGraph
  const routeMasks = zombieEscapeSparseReverseFieldBreachMasks(
    bank,
    search.reverseFieldDistanceVariant,
  )
  const routeMaskOffset = search.candidateNode * bank.breachObjectWordCount
  let count = 0
  for (const objectOrdinal of search.visibility.breakableObjectOrdinals) {
    if (world.activeObjectMask[objectOrdinal] === 0) continue
    const objectIndex = findZombieEscapeSparseBreachObjectIndex(
      graph.breachObjectOrdinals,
      objectOrdinal,
    )
    if (
      objectIndex < 0 ||
      !routeMasks ||
      (routeMasks[routeMaskOffset + (objectIndex >>> 5)]! & (1 << (objectIndex & 31))) === 0
    ) {
      count += 1
    }
  }
  return count
}

function zombieEscapeSparseReverseFieldNextNodes(
  bank: ZombieEscapeSparseReverseFieldBank,
  variant: number,
) {
  if (variant === 0) return bank.graphStrictNextNodes
  if (variant === 1) return bank.graphSameLayerNextNodes
  if (variant === 2) return bank.graphFallbackNextNodes
  return bank.graphSameLayerFallbackNextNodes
}

function zombieEscapeSparseReverseFieldVariant(
  sourceLayerIndex: number,
  targetLayerIndex: number,
  usesFallback: boolean,
) {
  const sameLayer = sourceLayerIndex === targetLayerIndex
  return usesFallback ? (sameLayer ? 3 : 2) : sameLayer ? 1 : 0
}

type ZombieEscapeSparseReverseFieldRouteClassification = 'malformed' | 'reachable' | 'unreachable'

function classifyZombieEscapeSparseReverseFieldRouteVariant(
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
  sourceLayerIndex: number,
  waypointNode: number,
  usesFallback: boolean,
): ZombieEscapeSparseReverseFieldRouteClassification {
  const world = field.world
  const graph = world.navigationGraph
  const nodeCount = graph.nodeIds.length
  if (
    world.navigationMode !== 'sparse' ||
    bank.generation <= 0 ||
    bank.worldRevision !== world.revision ||
    !bank.routeTargetInitialized ||
    bank.targetLayerIndex < 0 ||
    !world.navigationLayers[bank.targetLayerIndex] ||
    sourceLayerIndex < 0 ||
    !world.navigationLayers[sourceLayerIndex] ||
    waypointNode < 0 ||
    waypointNode >= nodeCount ||
    graph.layerIndices[waypointNode] !== sourceLayerIndex
  ) {
    return 'malformed'
  }
  const routeIsBuilt = usesFallback
    ? bank.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT
    : bank.targetCell !== FLOW_STRICT_UNBUILT
  if (!routeIsBuilt) return 'unreachable'
  const variant = zombieEscapeSparseReverseFieldVariant(
    sourceLayerIndex,
    bank.targetLayerIndex,
    usesFallback,
  )
  const distances = zombieEscapeSparseReverseFieldDistances(bank, variant)
  const nextNodes = zombieEscapeSparseReverseFieldNextNodes(bank, variant)
  if (distances.length !== nodeCount || nextNodes.length !== nodeCount) return 'malformed'
  const distance = distances[waypointNode]!
  if (distance === Number.POSITIVE_INFINITY) return 'unreachable'
  if (!Number.isFinite(distance) || distance < 0) return 'malformed'
  const nextNode = nextNodes[waypointNode]!
  if (nextNode === -1) {
    const targetNodeMarks = usesFallback
      ? bank.graphFallbackTargetNodeMarks
      : bank.graphStrictTargetNodeMarks
    return sourceLayerIndex === bank.targetLayerIndex && targetNodeMarks[waypointNode] === 1
      ? 'reachable'
      : 'malformed'
  }
  if (!Number.isInteger(nextNode) || nextNode < 0 || nextNode >= nodeCount) return 'malformed'
  const nextDistance = distances[nextNode]!
  if (!Number.isFinite(nextDistance) || nextDistance < 0 || nextDistance >= distance) {
    return 'malformed'
  }
  const nextLayerIndex = graph.layerIndices[nextNode]!
  if (!world.navigationLayers[nextLayerIndex]) return 'malformed'
  if (nextLayerIndex === sourceLayerIndex) return 'reachable'
  const connectorIndex = graph.connectorIndices[waypointNode]!
  const nextConnectorIndex = graph.connectorIndices[nextNode]!
  const connector = world.navigationConnectors[connectorIndex]
  const nextConnector = world.navigationConnectors[nextConnectorIndex]
  if (!(connector && nextConnector) || connector.chainId !== nextConnector.chainId) {
    return 'malformed'
  }
  const connectorTargetsEnd = graph.connectorEnds[waypointNode] !== 0
  const nextConnectorTargetsEnd = graph.connectorEnds[nextNode] !== 0
  const connectorSourceLayerIndex = connectorTargetsEnd
    ? connector.startLayerIndex
    : connector.endLayerIndex
  const nextConnectorSourceLayerIndex = nextConnectorTargetsEnd
    ? nextConnector.startLayerIndex
    : nextConnector.endLayerIndex
  return connectorSourceLayerIndex === sourceLayerIndex &&
    nextConnectorSourceLayerIndex === nextLayerIndex &&
    connectorTargetsEnd !== nextConnectorTargetsEnd
    ? 'reachable'
    : 'malformed'
}

function writeZombieEscapeSparseFlowSearchRouteCorridor(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
  waypointNode: number,
  usesFallback: boolean,
) {
  const sourceLayerIndex = field.world.navigationGraph.layerIndices[waypointNode]!
  const variant = zombieEscapeSparseReverseFieldVariant(
    sourceLayerIndex,
    bank.targetLayerIndex,
    usesFallback,
  )
  search.cachedOriginalNode = waypointNode
  search.cachedOriginalNextNode = zombieEscapeSparseReverseFieldNextNodes(bank, variant)[
    waypointNode
  ]!
  search.routeCorridorGeneration = bank.generation
  search.routeCorridorSourceLayerIndex = sourceLayerIndex
  search.routeCorridorTargetLayerIndex = bank.targetLayerIndex
  search.routeCorridorUsesFallback = usesFallback
  search.routeCorridorWorldRevision = bank.worldRevision
}

function stampZombieEscapeSparseFlowSearchRouteCorridor(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
  waypointNode: number,
  usesFallback: boolean,
) {
  if (
    classifyZombieEscapeSparseReverseFieldRouteVariant(
      field,
      bank,
      field.world.navigationGraph.layerIndices[waypointNode] ?? -1,
      waypointNode,
      usesFallback,
    ) !== 'reachable'
  ) {
    clearZombieEscapeSparseFlowSearchRouteCorridor(search)
    return false
  }
  writeZombieEscapeSparseFlowSearchRouteCorridor(search, field, bank, waypointNode, usesFallback)
  return true
}

export function clearZombieEscapeSparseFlowSearchRouteCorridor(
  search: ZombieEscapeSparseFlowSearch,
) {
  search.cachedOriginalNextNode = -1
  search.routeCorridorGeneration = 0
  search.routeCorridorSourceLayerIndex = -1
  search.routeCorridorTargetLayerIndex = -1
  search.routeCorridorUsesFallback = false
  search.routeCorridorWorldRevision = ''
}

export function seedZombieEscapeSparseFlowSearchRouteCorridor(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  waypointNode: number,
  usesFallback: boolean,
) {
  return stampZombieEscapeSparseFlowSearchRouteCorridor(
    search,
    field,
    activeZombieEscapeSparseReverseFieldBank(field),
    waypointNode,
    usesFallback,
  )
}

function recordZombieEscapeSparseRouteCorridorSuccessorVisits(
  search: ZombieEscapeSparseFlowSearch,
  visits: number,
) {
  search.lastRouteCorridorSuccessorVisits = visits
  search.maximumRouteCorridorSuccessorVisits = Math.max(
    search.maximumRouteCorridorSuccessorVisits,
    visits,
  )
  search.totalRouteCorridorSuccessorVisits += visits
}

export function adoptZombieEscapeSparsePublishedRouteAtWaypoint(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  publicWaypointNode: number,
): ZombieEscapeSparsePublishedRouteAdoption {
  const world = field.world
  const graph = world.navigationGraph
  const bank = activeZombieEscapeSparseReverseFieldBank(field)
  const certificateAnchor = search.cachedOriginalNode
  if (
    world.navigationMode !== 'sparse' ||
    search.routeCorridorGeneration <= 0 ||
    search.routeCorridorGeneration > bank.generation ||
    search.routeCorridorWorldRevision !== world.revision ||
    search.routeCorridorSourceLayerIndex < 0 ||
    search.routeCorridorTargetLayerIndex < 0 ||
    certificateAnchor < 0 ||
    certificateAnchor >= graph.nodeIds.length ||
    publicWaypointNode !== certificateAnchor ||
    graph.layerIndices[certificateAnchor] !== search.routeCorridorSourceLayerIndex ||
    !Number.isInteger(search.cachedOriginalNextNode) ||
    search.cachedOriginalNextNode < -1 ||
    search.cachedOriginalNextNode >= graph.nodeIds.length ||
    bank.generation <= 0 ||
    bank.worldRevision !== world.revision ||
    !bank.routeTargetInitialized
  ) {
    recordZombieEscapeSparseRouteCorridorSuccessorVisits(search, 0)
    clearZombieEscapeSparseFlowSearchRouteCorridor(search)
    return 'invalid'
  }

  const sourceLayerIndex = search.routeCorridorSourceLayerIndex
  recordZombieEscapeSparseRouteCorridorSuccessorVisits(search, 1)
  const strict = classifyZombieEscapeSparseReverseFieldRouteVariant(
    field,
    bank,
    sourceLayerIndex,
    certificateAnchor,
    false,
  )
  if (strict === 'malformed') {
    clearZombieEscapeSparseFlowSearchRouteCorridor(search)
    return 'invalid'
  }
  const fallback = classifyZombieEscapeSparseReverseFieldRouteVariant(
    field,
    bank,
    sourceLayerIndex,
    certificateAnchor,
    true,
  )
  if (fallback === 'malformed') {
    clearZombieEscapeSparseFlowSearchRouteCorridor(search)
    return 'invalid'
  }
  if (strict === 'reachable' || fallback === 'reachable') {
    const fallbackVariant = zombieEscapeSparseReverseFieldVariant(
      sourceLayerIndex,
      bank.targetLayerIndex,
      true,
    )
    const fallbackBreachCount =
      fallback === 'reachable'
        ? (zombieEscapeSparseReverseFieldBreachCounts(bank, fallbackVariant)?.[certificateAnchor] ??
          0)
        : 0
    if (
      strict !== 'reachable' &&
      fallback === 'reachable' &&
      search.routeCorridorGeneration < bank.generation &&
      fallbackBreachCount > 0
    ) {
      clearZombieEscapeSparseFlowSearchRouteCorridor(search)
      return 'requiresSearch'
    }
    let usesFallback = strict !== 'reachable'
    if (strict === 'reachable' && fallback === 'reachable') {
      const strictDistance = zombieEscapeSparseReverseFieldDistances(
        bank,
        zombieEscapeSparseReverseFieldVariant(sourceLayerIndex, bank.targetLayerIndex, false),
      )[certificateAnchor]!
      const fallbackDistance = zombieEscapeSparseReverseFieldDistances(bank, fallbackVariant)[
        certificateAnchor
      ]!
      usesFallback =
        fallbackBreachCount > 0 &&
        zombieEscapeSparseRouteCostSeconds(
          fallbackDistance,
          search.travelSpeedMetersPerSecond,
          fallbackBreachCount,
        ) <
          zombieEscapeSparseRouteCostSeconds(strictDistance, search.travelSpeedMetersPerSecond, 0) -
            INTERSECTION_EPSILON
    }
    writeZombieEscapeSparseFlowSearchRouteCorridor(
      search,
      field,
      bank,
      certificateAnchor,
      usesFallback,
    )
    return 'adopted'
  }
  clearZombieEscapeSparseFlowSearchRouteCorridor(search)
  return 'unreachable'
}

export function inspectZombieEscapeSparseReverseFieldBanks(
  field: ZombieEscapeFlowField,
): ZombieEscapeSparseReverseFieldBankInspection {
  const workspace = field.graphReverseFieldBanks
  const activeBank = workspace.banks[workspace.activeBankIndex]!
  let readerLeaseCount = 0
  for (const ownerToken of workspace.readerOwnerTokens) {
    if (ownerToken !== 0) readerLeaseCount += 1
  }
  return {
    activeBankIndex: workspace.activeBankIndex,
    activeGeneration: activeBank.generation,
    activeRouteTargetLayerIndex: activeBank.routeTargetLayerIndex,
    activeWorldRevision: activeBank.worldRevision,
    allocatedBytes: workspace.allocatedBytes,
    availableReaderLeases: SPARSE_ATTACHMENT_HEAP_WORKSPACE_COUNT - readerLeaseCount,
    bankOneGeneration: workspace.banks[1].generation,
    bankOneReaderCount: workspace.bankReaderCounts[1]!,
    bankZeroGeneration: workspace.banks[0].generation,
    bankZeroReaderCount: workspace.bankReaderCounts[0]!,
    leaseInvariantViolationCount: workspace.leaseInvariantViolationCount,
    maximumReaderLeaseCount: workspace.maximumReaderLeaseCount,
    publicationBlockedCount: workspace.publicationBlockedCount,
    publicationCount: workspace.publicationCount,
    readerLeaseCount,
    singletonPinned: workspace.readerOwnerTokens[8] !== 0,
    spawnPinned: workspace.readerOwnerTokens[9] !== 0,
  }
}

export function getZombieEscapeSparseCommittedRouteGeneration(field: ZombieEscapeFlowField) {
  return activeZombieEscapeSparseReverseFieldBank(field).generation
}

export function zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
) {
  return (
    pinnedZombieEscapeSparseReverseFieldBank(search.attachment) !== null &&
    search.attachment.reverseFieldBankWorkspace === field.graphReverseFieldBanks &&
    search.attachment.reverseFieldBankIndex ===
      stagingZombieEscapeSparseReverseFieldBankIndex(field)
  )
}

export function getZombieEscapeSparseRequestedTargetRevision(field: ZombieEscapeFlowField) {
  return field.graphSparseTargetUpdate.requestedTargetRevision
}

function mixZombieEscapeSparseRouteHash(hash: number, value: number) {
  return Math.imul(hash ^ (value >>> 0), 16_777_619) >>> 0
}

function mixZombieEscapeSparseRouteFloat64Hash(hash: number, value: number) {
  if (Number.isNaN(value)) return mixZombieEscapeSparseRouteHash(hash, 0x7ff8_0001)
  if (value === Number.POSITIVE_INFINITY) return mixZombieEscapeSparseRouteHash(hash, 0x7ff0_0000)
  if (value === Number.NEGATIVE_INFINITY) return mixZombieEscapeSparseRouteHash(hash, 0xfff0_0000)
  if (value === 0) {
    return mixZombieEscapeSparseRouteHash(hash, 1 / value < 0 ? 0x8000_0000 : 0)
  }
  const negative = value < 0
  const absolute = Math.abs(value)
  const exponent = Math.max(-1022, Math.floor(Math.log2(absolute)))
  const significand = (absolute / 2 ** exponent) * 2 ** 52
  const high = Math.floor(significand / 2 ** 32)
  const low = significand - high * 2 ** 32
  hash = mixZombieEscapeSparseRouteHash(hash, negative ? high ^ 0x8000_0000 : high)
  hash = mixZombieEscapeSparseRouteHash(hash, low)
  return mixZombieEscapeSparseRouteHash(hash, exponent + 1074)
}

function mixZombieEscapeSparseRouteVariantHash(
  hash: number,
  variant: number,
  distances: Float64Array,
  nextNodes: Int32Array,
) {
  hash = mixZombieEscapeSparseRouteHash(hash, variant)
  for (let node = 0; node < distances.length; node += 1) {
    hash = mixZombieEscapeSparseRouteFloat64Hash(hash, distances[node]!)
    hash = mixZombieEscapeSparseRouteHash(hash, nextNodes[node]!)
  }
  return hash
}

export function getZombieEscapeSparseCommittedRouteContentHash(field: ZombieEscapeFlowField) {
  const bank = activeZombieEscapeSparseReverseFieldBank(field)
  let hash = 2_166_136_261
  hash = mixZombieEscapeSparseRouteVariantHash(
    hash,
    1,
    bank.graphStrictDistances,
    bank.graphStrictNextNodes,
  )
  hash = mixZombieEscapeSparseRouteVariantHash(
    hash,
    2,
    bank.graphSameLayerDistances,
    bank.graphSameLayerNextNodes,
  )
  hash = mixZombieEscapeSparseRouteVariantHash(
    hash,
    3,
    bank.graphFallbackDistances,
    bank.graphFallbackNextNodes,
  )
  hash = mixZombieEscapeSparseRouteVariantHash(
    hash,
    4,
    bank.graphSameLayerFallbackDistances,
    bank.graphSameLayerFallbackNextNodes,
  )
  for (let node = 0; node < bank.graphFallbackCosts.length; node += 1) {
    hash = mixZombieEscapeSparseRouteFloat64Hash(hash, bank.graphFallbackCosts[node]!)
    hash = mixZombieEscapeSparseRouteHash(hash, bank.graphFallbackBreachCounts[node]!)
    hash = mixZombieEscapeSparseRouteFloat64Hash(hash, bank.graphSameLayerFallbackCosts[node]!)
    hash = mixZombieEscapeSparseRouteHash(hash, bank.graphSameLayerFallbackBreachCounts[node]!)
  }
  hash = mixZombieEscapeSparseRouteHash(hash, bank.graphStrictTargetNodeCount)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.graphFallbackTargetNodeCount)
  for (let offset = 0; offset < bank.graphStrictTargetNodeCount; offset += 1) {
    const node = bank.graphStrictTargetNodes[offset]!
    hash = mixZombieEscapeSparseRouteHash(hash, node)
    hash = mixZombieEscapeSparseRouteHash(hash, bank.graphStrictTargetNodeMarks[node]!)
  }
  for (let offset = 0; offset < bank.graphFallbackTargetNodeCount; offset += 1) {
    const node = bank.graphFallbackTargetNodes[offset]!
    hash = mixZombieEscapeSparseRouteHash(hash, node)
    hash = mixZombieEscapeSparseRouteHash(hash, bank.graphFallbackTargetNodeMarks[node]!)
  }
  hash = mixZombieEscapeSparseRouteHash(hash, bank.reachableCount)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.fallbackReachableCount)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.targetCell)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.fallbackTargetCell)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.targetLayerIndex)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.routeTargetBucketX)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.routeTargetBucketZ)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.routeTargetInitialized ? 1 : 0)
  hash = mixZombieEscapeSparseRouteHash(hash, bank.routeTargetLayerIndex)
  hash = mixZombieEscapeSparseRouteFloat64Hash(hash, bank.routeTargetX)
  hash = mixZombieEscapeSparseRouteFloat64Hash(hash, bank.routeTargetY)
  hash = mixZombieEscapeSparseRouteFloat64Hash(hash, bank.routeTargetZ)
  for (let index = 0; index < bank.worldRevision.length; index += 1) {
    hash = mixZombieEscapeSparseRouteHash(hash, bank.worldRevision.charCodeAt(index))
  }
  return hash >>> 0
}

export function createZombieEscapeSparseCommittedNodeRoute(): ZombieEscapeSparseCommittedNodeRoute {
  return {
    connectorIndex: -1,
    connectorTargetEnd: false,
    generation: 0,
    nextNode: -1,
    reachable: false,
    targetLayerIndex: -1,
    terminal: false,
  }
}

export function sampleZombieEscapeSparseCommittedNodeRoute(
  field: ZombieEscapeFlowField,
  node: number,
  usesFallback: boolean,
  output: ZombieEscapeSparseCommittedNodeRoute,
) {
  const bank = activeZombieEscapeSparseReverseFieldBank(field)
  const graph = field.world.navigationGraph
  output.connectorIndex = -1
  output.connectorTargetEnd = false
  output.generation = bank.generation
  output.nextNode = -1
  output.reachable = false
  output.targetLayerIndex = bank.targetLayerIndex
  output.terminal = false
  if (node < 0 || node >= graph.nodeIds.length || !bank.routeTargetInitialized) return false
  const sourceLayerIndex = graph.layerIndices[node]!
  const variant = zombieEscapeSparseReverseFieldVariant(
    sourceLayerIndex,
    bank.targetLayerIndex,
    usesFallback,
  )
  const distances = zombieEscapeSparseReverseFieldDistances(bank, variant)
  if (!Number.isFinite(distances[node]!)) return false
  const nextNode = zombieEscapeSparseReverseFieldNextNodes(bank, variant)[node]!
  output.nextNode = nextNode
  output.reachable = true
  output.terminal = nextNode < 0
  if (nextNode < 0 || graph.layerIndices[nextNode] === sourceLayerIndex) return true
  const connectorIndex = graph.connectorIndices[node]!
  if (connectorIndex < 0 || !field.world.navigationConnectors[connectorIndex]) return true
  output.connectorIndex = connectorIndex
  output.connectorTargetEnd = graph.connectorEnds[node] !== 0
  return true
}

export function createZombieEscapeSparseSpawnAnchor(): ZombieEscapeSparseSpawnAnchor {
  return {
    elevation: 0,
    generation: 0,
    layerIndex: -1,
    reachable: false,
    usesFallback: false,
    witnessNode: -1,
    x: 0,
    z: 0,
  }
}

export function sampleZombieEscapeSparseSpawnAnchor(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  authoredElevation: number,
  routeScratch: ZombieEscapeSparseCommittedNodeRoute,
  output: ZombieEscapeSparseSpawnAnchor,
) {
  output.elevation = 0
  output.generation = 0
  output.layerIndex = -1
  output.reachable = false
  output.usesFallback = false
  output.witnessNode = -1
  output.x = x
  output.z = z
  const world = field.world
  if (world.navigationMode !== 'sparse' || world.navigationLayers.length === 0) return false
  const bank = activeZombieEscapeSparseReverseFieldBank(field)
  if (
    bank.generation <= 0 ||
    bank.worldRevision !== world.revision ||
    !bank.routeTargetInitialized
  ) {
    return false
  }
  const layerIndex = resolveNavigationLayerIndex(world, authoredElevation)
  const layer = world.navigationLayers[layerIndex]
  if (
    !layer ||
    Math.abs(layer.elevation - authoredElevation) > NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS
  ) {
    return false
  }
  const witnessNode = resolveSparseNavigationStrictRegionWitnessNode(
    world.navigationGraph.targetRegionIndex,
    layerIndex,
    x,
    z,
  )
  if (witnessNode < 0) return false
  let usesFallback = false
  if (!sampleZombieEscapeSparseCommittedNodeRoute(field, witnessNode, false, routeScratch)) {
    usesFallback = true
    if (!sampleZombieEscapeSparseCommittedNodeRoute(field, witnessNode, true, routeScratch)) {
      return false
    }
  }
  if (!routeScratch.reachable || routeScratch.generation !== bank.generation) return false
  output.elevation = layer.elevation
  output.generation = routeScratch.generation
  output.layerIndex = layerIndex
  output.reachable = true
  output.usesFallback = usesFallback
  output.witnessNode = witnessNode
  return true
}

export function createZombieEscapeFlowField(
  world: ZombieEscapeCollisionWorld,
): ZombieEscapeFlowField {
  const nodeCount = navigationNodeCount(world)
  const distances = new Uint32Array(nodeCount)
  distances.fill(FLOW_UNREACHABLE)
  const graphNodeCount = world.navigationGraph.nodeIds.length
  const graphComponentCount = sparseNavigationComponentWorkspaceCount(world.navigationGraph)
  const graphSparseFlowSearch = createZombieEscapeSparseFlowSearch()
  const graphSparseReachableSpawnSearch = createZombieEscapeSparseReachableSpawnSearch()
  const graphAttachmentHeapWorkspace = createZombieEscapeSparseAttachmentHeapWorkspace(world)
  reserveZombieEscapeSparseAttachmentHeapSlot(
    graphSparseFlowSearch.attachment,
    graphAttachmentHeapWorkspace,
    8,
  )
  reserveZombieEscapeSparseAttachmentHeapSlot(
    graphSparseReachableSpawnSearch.attachment,
    graphAttachmentHeapWorkspace,
    9,
  )
  validateZombieEscapeSparseAttachmentHeapWorkspace(graphAttachmentHeapWorkspace)
  const field = {
    distances,
    fallbackDistances: new Uint32Array(nodeCount).fill(FLOW_UNREACHABLE),
    fallbackQueue: new Int32Array(nodeCount),
    fallbackRebuildCount: 0,
    graphAttachmentCandidateCount: 0,
    graphAttachmentFullSearchCount: 0,
    graphAttachmentHeapWorkspace,
    graphAttachmentSupportCheckCount: 0,
    graphCollisionHit: createZombieEscapeCollisionHit(),
    graphHeapDistances: new Float64Array(graphNodeCount),
    graphHeapNodes: new Int32Array(graphNodeCount),
    graphHeapPositions: new Int32Array(graphNodeCount).fill(-1),
    graphReverseFieldBanks: createZombieEscapeSparseReverseFieldBankWorkspace(
      graphNodeCount,
      world.navigationGraph.breachObjectCount,
    ),
    graphSparseFlowSearch,
    graphSparseReachableSpawnSearch,
    graphSparseTargetUpdate: createZombieEscapeSparseTargetUpdate(),
    graphTargetComponentVisitEpoch: Uint32Array.of(1),
    graphTargetComponentVisitStamps: new Uint32Array(graphComponentCount),
    queue: new Int32Array(nodeCount),
    rebuildCount: 0,
    routeRevision: 0,
    targetBucketX: -1,
    targetBucketZ: -1,
    targetInitialized: false,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    world,
  } as ZombieEscapeFlowField
  const activeBank = () => activeZombieEscapeSparseReverseFieldBank(field)
  Object.defineProperties(field, {
    fallbackReachableCount: {
      enumerable: true,
      get: () => activeBank().fallbackReachableCount,
      set: (value: number) => {
        activeBank().fallbackReachableCount = value
      },
    },
    fallbackTargetCell: {
      enumerable: true,
      get: () => activeBank().fallbackTargetCell,
      set: (value: number) => {
        activeBank().fallbackTargetCell = value
      },
    },
    graphFallbackDistances: {
      enumerable: true,
      get: () => activeBank().graphFallbackDistances,
    },
    graphFallbackNextNodes: {
      enumerable: true,
      get: () => activeBank().graphFallbackNextNodes,
    },
    graphFallbackTargetNodeCount: {
      enumerable: true,
      get: () => activeBank().graphFallbackTargetNodeCount,
      set: (value: number) => {
        activeBank().graphFallbackTargetNodeCount = value
      },
    },
    graphFallbackTargetNodeMarks: {
      enumerable: true,
      get: () => activeBank().graphFallbackTargetNodeMarks,
    },
    graphFallbackTargetNodes: {
      enumerable: true,
      get: () => activeBank().graphFallbackTargetNodes,
    },
    graphSameLayerDistances: {
      enumerable: true,
      get: () => activeBank().graphSameLayerDistances,
    },
    graphSameLayerFallbackDistances: {
      enumerable: true,
      get: () => activeBank().graphSameLayerFallbackDistances,
    },
    graphSameLayerFallbackNextNodes: {
      enumerable: true,
      get: () => activeBank().graphSameLayerFallbackNextNodes,
    },
    graphSameLayerNextNodes: {
      enumerable: true,
      get: () => activeBank().graphSameLayerNextNodes,
    },
    graphStrictDistances: {
      enumerable: true,
      get: () => activeBank().graphStrictDistances,
    },
    graphStrictNextNodes: {
      enumerable: true,
      get: () => activeBank().graphStrictNextNodes,
    },
    graphStrictTargetNodeCount: {
      enumerable: true,
      get: () => activeBank().graphStrictTargetNodeCount,
      set: (value: number) => {
        activeBank().graphStrictTargetNodeCount = value
      },
    },
    graphStrictTargetNodeMarks: {
      enumerable: true,
      get: () => activeBank().graphStrictTargetNodeMarks,
    },
    graphStrictTargetNodes: {
      enumerable: true,
      get: () => activeBank().graphStrictTargetNodes,
    },
    reachableCount: {
      enumerable: true,
      get: () => activeBank().reachableCount,
      set: (value: number) => {
        activeBank().reachableCount = value
      },
    },
    targetCell: {
      enumerable: true,
      get: () => activeBank().targetCell,
      set: (value: number) => {
        activeBank().targetCell = value
      },
    },
    targetLayerIndex: {
      enumerable: true,
      get: () => activeBank().targetLayerIndex,
      set: (value: number) => {
        activeBank().targetLayerIndex = value
      },
    },
  })
  return field
}

export function setZombieEscapeFlowFieldWorld(
  field: ZombieEscapeFlowField,
  world: ZombieEscapeCollisionWorld,
) {
  if (field.world === world) return false
  if (field.world.semanticKey === world.semanticKey) {
    field.world = world
    invalidateZombieEscapeFlowFieldForCollisionMaskDelta(field)
    return true
  }
  const previousRouteInvalidationCount = field.graphSparseTargetUpdate.routeInvalidationCount
  const previousWorld = field.world
  const nodeCount = navigationNodeCount(world)
  const graphNodeCount = world.navigationGraph.nodeIds.length
  const graphComponentCount = sparseNavigationComponentWorkspaceCount(world.navigationGraph)
  if (
    previousWorld.navigationMode === 'sparse' &&
    world.navigationMode === 'sparse' &&
    previousWorld.navigationGraph === world.navigationGraph &&
    previousWorld.navigationConnectors === world.navigationConnectors &&
    navigationNodeCount(previousWorld) === nodeCount &&
    previousWorld.navigationGraph.nodeIds.length === graphNodeCount &&
    field.distances.length === nodeCount &&
    field.graphStrictDistances.length === graphNodeCount
  ) {
    field.world = world
    resetZombieEscapeFlowFieldStorage(field)
    return true
  }
  field.routeRevision += 1
  field.world = world
  field.distances = new Uint32Array(nodeCount)
  field.distances.fill(FLOW_UNREACHABLE)
  field.fallbackDistances = new Uint32Array(nodeCount)
  field.fallbackDistances.fill(FLOW_UNREACHABLE)
  field.fallbackQueue = new Int32Array(nodeCount)
  field.graphCollisionHit = createZombieEscapeCollisionHit()
  field.graphHeapDistances = new Float64Array(graphNodeCount)
  field.graphHeapNodes = new Int32Array(graphNodeCount)
  field.graphHeapPositions = new Int32Array(graphNodeCount).fill(-1)
  field.graphAttachmentHeapWorkspace = createZombieEscapeSparseAttachmentHeapWorkspace(
    world,
    field.routeRevision,
  )
  field.graphReverseFieldBanks = createZombieEscapeSparseReverseFieldBankWorkspace(
    graphNodeCount,
    world.navigationGraph.breachObjectCount,
  )
  field.graphTargetComponentVisitEpoch = Uint32Array.of(1)
  field.graphTargetComponentVisitStamps = new Uint32Array(graphComponentCount)
  field.queue = new Int32Array(nodeCount)
  field.targetBucketX = -1
  field.targetBucketZ = -1
  field.targetInitialized = false
  field.targetX = 0
  field.targetY = 0
  field.targetZ = 0
  resetZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch)
  resetZombieEscapeSparseReachableSpawnSearch(field.graphSparseReachableSpawnSearch)
  bindZombieEscapeSparseFieldAttachmentHeapSlots(field, field.graphAttachmentHeapWorkspace)
  resetZombieEscapeSparseTargetUpdate(field.graphSparseTargetUpdate)
  field.graphSparseTargetUpdate.routeInvalidationCount = previousRouteInvalidationCount + 1
  return true
}

export function invalidateZombieEscapeFlowFieldForCollisionMaskDelta(field: ZombieEscapeFlowField) {
  const routeInvalidationCount = field.graphSparseTargetUpdate.routeInvalidationCount + 1
  resetZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch)
  resetZombieEscapeSparseReachableSpawnSearch(field.graphSparseReachableSpawnSearch)
  field.routeRevision += 1
  resetZombieEscapeSparseReverseFieldBankWorkspace(field.graphReverseFieldBanks)
  resetZombieEscapeSparseTargetUpdate(field.graphSparseTargetUpdate)
  field.graphSparseTargetUpdate.routeInvalidationCount = routeInvalidationCount
  field.graphSparseTargetUpdate.status = 'invalidated'
}

export function acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval(field: ZombieEscapeFlowField) {
  const update = field.graphSparseTargetUpdate
  if (update.status !== 'ready') return false
  for (const bank of field.graphReverseFieldBanks.banks) {
    if (bank.generation > 0) bank.worldRevision = field.world.revision
  }
  update.worldRevision = field.world.revision
  return true
}

function resetZombieEscapeFlowFieldStorage(field: ZombieEscapeFlowField) {
  const previousRouteInvalidationCount = field.graphSparseTargetUpdate.routeInvalidationCount
  field.routeRevision += 1
  resetZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch)
  resetZombieEscapeSparseReachableSpawnSearch(field.graphSparseReachableSpawnSearch)
  field.distances.fill(FLOW_UNREACHABLE)
  field.fallbackDistances.fill(FLOW_UNREACHABLE)
  field.fallbackQueue.fill(0)
  resetCollisionHit(field.graphCollisionHit)
  field.graphHeapDistances.fill(0)
  field.graphHeapNodes.fill(0)
  field.graphHeapPositions.fill(-1)
  resetZombieEscapeSparseReverseFieldBankWorkspace(field.graphReverseFieldBanks)
  field.graphTargetComponentVisitEpoch[0] = 1
  field.graphTargetComponentVisitStamps.fill(0)
  field.queue.fill(0)
  field.targetBucketX = -1
  field.targetBucketZ = -1
  field.targetInitialized = false
  field.targetX = 0
  field.targetY = 0
  field.targetZ = 0
  resetZombieEscapeSparseTargetUpdate(field.graphSparseTargetUpdate)
  field.graphSparseTargetUpdate.routeInvalidationCount = previousRouteInvalidationCount + 1
}

function sparseNavigationComponentWorkspaceCount(
  graph: ZombieEscapeCollisionWorld['navigationGraph'],
) {
  let count = 0
  for (const componentIndices of [
    graph.strictComponentIndices,
    graph.strictSameLayerComponentIndices,
    graph.fallbackComponentIndices,
    graph.fallbackSameLayerComponentIndices,
  ]) {
    for (const component of componentIndices) count = Math.max(count, component + 1)
  }
  return count
}

export function createZombieEscapeSparseTargetUpdate(): ZombieEscapeSparseTargetUpdate {
  const update = {} as ZombieEscapeSparseTargetUpdate
  resetZombieEscapeSparseTargetUpdate(update)
  return update
}

function resetZombieEscapeSparseTargetUpdate(update: ZombieEscapeSparseTargetUpdate) {
  update.activeForceRebuild = false
  update.visibility ??= createZombieEscapeNavigationVisibilitySearch()
  resetZombieEscapeNavigationVisibilitySearch(update.visibility)
  update.activeTargetBucketX = -1
  update.activeTargetBucketZ = -1
  update.activeTargetLayerIndex = -1
  update.activeTargetX = 0
  update.activeTargetY = 0
  update.activeTargetZ = 0
  update.bestLayerDistance = Number.POSITIVE_INFINITY
  update.buildBankIndex = -1
  update.buildVariant = -1
  update.candidateOffset = 0
  update.completedAnchorSelectionCount = 0
  update.completedFallbackBuilds = 0
  update.completedStrictBuilds = 0
  update.currentEdge = 0
  update.currentEdgeEnd = 0
  update.currentNode = -1
  update.fallbackInvalidated = false
  update.heapNode = -1
  update.heapPosition = -1
  update.heapReturnPhase = 'build-seed-target-nodes'
  update.heapSize = 0
  update.initializationOffset = 0
  update.layerOffset = 0
  update.lastStepCandidateVisits = 0
  update.lastStepTargetAnchorCandidateVisits = 0
  update.lastStepTargetAnchorVisibilityTests = 0
  update.lastStepColliderCandidateVisits = 0
  update.lastStepColliderHierarchyNodeVisits = 0
  update.lastStepCollisionPredicates = 0
  update.lastStepGraphEdgeVisits = 0
  update.lastStepHeapOperations = 0
  update.lastStepHierarchyNodeVisits = 0
  update.lastStepSupportHierarchyNodeVisits = 0
  update.lastStepSupportHoleVisits = 0
  update.lastStepSupportItemVisits = 0
  update.lastStepSupportPredicates = 0
  update.lastStepSupportRingEdgeVisits = 0
  update.lastStepSupportRingHierarchyNodeVisits = 0
  update.lastStepPublications = 0
  update.phase = 'complete'
  update.reachableCount = 0
  update.requestedFallbackBuild = false
  update.requestedForceRebuild = false
  update.requestedStrictBuild = false
  update.requestedTargetBucketX = -1
  update.requestedTargetBucketZ = -1
  update.requestedTargetLayerHint = -1
  update.requestedTargetRevision = 0
  update.requestedTargetX = 0
  update.requestedTargetY = 0
  update.requestedTargetZ = 0
  update.restartCount = 0
  update.routeInvalidationCount = 0
  update.routeTargetInitialized = false
  update.routeTargetBucketX = -1
  update.routeTargetBucketZ = -1
  update.routeTargetLayerIndex = -1
  update.routeTargetX = 0
  update.routeTargetY = 0
  update.routeTargetZ = 0
  update.selectedFallbackAnchorCount = 0
  update.selectedStrictAnchorCount = 0
  update.status = 'ready'
  update.strictInvalidated = false
  update.targetNodeOffset = 0
  update.totalCandidateVisits = 0
  update.totalMissingAnchorSelectionCount = 0
  update.totalTargetAnchorCandidateVisits = 0
  update.totalTargetAnchorVisibilityTests = 0
  update.totalColliderCandidateVisits = 0
  update.totalColliderHierarchyNodeVisits = 0
  update.totalCollisionPredicates = 0
  update.totalGraphEdgeVisits = 0
  update.totalHeapOperations = 0
  update.totalHierarchyNodeVisits = 0
  update.totalSupportHierarchyNodeVisits = 0
  update.totalSupportHoleVisits = 0
  update.totalSupportItemVisits = 0
  update.totalSupportPredicates = 0
  update.totalSupportRingEdgeVisits = 0
  update.totalSupportRingHierarchyNodeVisits = 0
  update.validationNodeOffset = 0
  update.worldRevision = ''
}

export function beginZombieEscapeSparseTargetUpdate(
  field: ZombieEscapeFlowField,
  targetX: number,
  targetZ: number,
  targetY = 0,
  forceRebuild = false,
): ZombieEscapeSparseTargetUpdateStatus {
  const world = field.world
  const update = field.graphSparseTargetUpdate
  if (world.navigationMode !== 'sparse') return 'ready'
  const targetColumn = Math.floor(targetX / world.cellSize)
  const targetRow = Math.floor(targetZ / world.cellSize)
  const targetBucketX = Math.floor(targetColumn / FLOW_TARGET_CELL_STRIDE)
  const targetBucketZ = Math.floor(targetRow / FLOW_TARGET_CELL_STRIDE)
  const firstTarget = !field.targetInitialized
  const requestMatchesQueuedTarget =
    update.requestedTargetX === targetX &&
    update.requestedTargetY === targetY &&
    update.requestedTargetZ === targetZ
  const requestedForceRebuild =
    forceRebuild ||
    (update.status === 'pending' && requestMatchesQueuedTarget && update.requestedForceRebuild)
  const forceRebuildAddsRequest =
    requestedForceRebuild &&
    !(update.status === 'pending' && requestMatchesQueuedTarget && update.requestedForceRebuild)
  const positionChanged =
    firstTarget ||
    update.status === 'invalidated' ||
    field.targetX !== targetX ||
    field.targetY !== targetY ||
    field.targetZ !== targetZ ||
    forceRebuildAddsRequest

  update.requestedTargetBucketX = targetBucketX
  update.requestedTargetBucketZ = targetBucketZ
  if (positionChanged) update.requestedTargetLayerHint = -1
  update.requestedForceRebuild = requestedForceRebuild
  update.requestedTargetX = targetX
  update.requestedTargetY = targetY
  update.requestedTargetZ = targetZ
  field.targetBucketX = targetBucketX
  field.targetBucketZ = targetBucketZ
  field.targetInitialized = true
  field.targetX = targetX
  field.targetY = targetY
  field.targetZ = targetZ

  const committed = activeZombieEscapeSparseReverseFieldBank(field)
  if (
    update.status === 'pending' &&
    !requestedForceRebuild &&
    committed.routeTargetInitialized &&
    committed.worldRevision === world.revision &&
    committed.routeTargetX === targetX &&
    committed.routeTargetY === targetY &&
    committed.routeTargetZ === targetZ
  ) {
    update.activeForceRebuild = false
    update.activeTargetBucketX = committed.routeTargetBucketX
    update.activeTargetBucketZ = committed.routeTargetBucketZ
    update.activeTargetLayerIndex = committed.routeTargetLayerIndex
    update.activeTargetX = committed.routeTargetX
    update.activeTargetY = committed.routeTargetY
    update.activeTargetZ = committed.routeTargetZ
    update.fallbackInvalidated = false
    update.phase = 'complete'
    update.requestedForceRebuild = false
    update.requestedTargetLayerHint = committed.routeTargetLayerIndex
    update.status = 'ready'
    update.strictInvalidated = false
    return update.status
  }

  if (!positionChanged) return update.status
  update.requestedTargetRevision = (update.requestedTargetRevision + 1) >>> 0 || 1
  if (update.status === 'pending' && update.worldRevision === world.revision) {
    return update.status
  }

  update.activeTargetBucketX = targetBucketX
  update.activeTargetBucketZ = targetBucketZ
  update.activeTargetLayerIndex = -1
  update.activeTargetX = targetX
  update.activeTargetY = targetY
  update.activeTargetZ = targetZ
  update.activeForceRebuild = requestedForceRebuild
  update.bestLayerDistance = Number.POSITIVE_INFINITY
  update.fallbackInvalidated = firstTarget
  update.layerOffset = 0
  update.strictInvalidated = firstTarget
  update.validationNodeOffset = 0
  update.worldRevision = world.revision

  update.phase = 'resolve-layer'
  update.status = 'pending'
  return update.status
}

export function stepZombieEscapeSparseTargetUpdate(
  field: ZombieEscapeFlowField,
  budget: ZombieEscapeSparseTargetUpdateBudget,
): ZombieEscapeSparseTargetUpdateStatus {
  const update = field.graphSparseTargetUpdate
  if (
    zombieEscapeSparseSearchBudgetIsEmpty(budget) &&
    normalizeSparseSearchBudget(budget.maximumGraphEdgeVisits) === 0 &&
    update.worldRevision === field.world.revision
  ) {
    return update.status
  }
  resetZombieEscapeSparseTargetStepWork(update)
  if (update.status !== 'pending') {
    beginRequestedZombieEscapeSparseTargetBuild(field, update)
    if ((update.status as ZombieEscapeSparseTargetUpdateStatus) !== 'pending') {
      return update.status
    }
  }
  if (update.worldRevision !== field.world.revision) {
    update.phase = 'complete'
    update.status = 'invalidated'
    return update.status
  }
  const maximumCandidateVisits = normalizeSparseSearchBudget(budget.maximumCandidateVisits)
  const maximumCollisionPredicates = normalizeSparseSearchBudget(budget.maximumCollisionPredicates)
  const maximumGraphEdgeVisits = normalizeSparseSearchBudget(budget.maximumGraphEdgeVisits)
  const maximumHeapOperations = normalizeSparseSearchBudget(budget.maximumHeapOperations)
  const maximumHierarchyNodeVisits = normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits)
  const maximumSupportPredicates = normalizeSparseSearchBudget(budget.maximumSupportPredicates)

  while (update.status === 'pending') {
    if (update.phase === 'wait-staging-bank') {
      const workspace = field.graphReverseFieldBanks
      const stagingBankIndex = stagingZombieEscapeSparseReverseFieldBankIndex(field)
      if (workspace.bankReaderCounts[stagingBankIndex] !== 0) {
        workspace.publicationBlockedCount += 1
        return update.status
      }
      beginRequestedZombieEscapeSparseTargetBuild(field, update)
      if (update.phase === 'wait-staging-bank') return update.status
      continue
    }
    if (update.phase === 'resolve-layer') {
      if (update.layerOffset >= field.world.navigationLayers.length) {
        completeZombieEscapeSparseTargetLayerResolution(field, update)
        continue
      }
      if (update.lastStepSupportPredicates >= maximumSupportPredicates) return update.status
      const layerIndex = update.layerOffset
      const layer = field.world.navigationLayers[layerIndex]!
      update.layerOffset += 1
      update.lastStepSupportPredicates += 1
      update.totalSupportPredicates += 1
      if (
        layer.elevation >
          update.activeTargetY + NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS ||
        !navigationLayerSupportsPoint(
          field.world,
          layerIndex,
          update.activeTargetX,
          update.activeTargetZ,
        )
      ) {
        continue
      }
      const distance = Math.abs(update.activeTargetY - layer.elevation)
      if (distance < update.bestLayerDistance) {
        update.bestLayerDistance = distance
        update.activeTargetLayerIndex = layerIndex
      }
      continue
    }
    if (update.phase.startsWith('validate-')) {
      if (
        !stepZombieEscapeSparseTargetValidation(
          field,
          update,
          maximumCandidateVisits,
          maximumCollisionPredicates,
          maximumHierarchyNodeVisits,
          maximumSupportPredicates,
        )
      ) {
        return update.status
      }
      continue
    }
    if (
      !stepZombieEscapeSparseTargetBuild(
        field,
        update,
        maximumCandidateVisits,
        maximumGraphEdgeVisits,
        maximumHeapOperations,
      )
    ) {
      return update.status
    }
    if (update.lastStepPublications !== 0) return update.status
  }
  return update.status
}

export function updateZombieEscapeFlowTarget(
  field: ZombieEscapeFlowField,
  targetX: number,
  targetZ: number,
  targetY = 0,
) {
  const world = field.world
  if (world.navigationMode === 'sparse') {
    const update = field.graphSparseTargetUpdate
    const routeGeneration = getZombieEscapeSparseCommittedRouteGeneration(field)
    beginZombieEscapeSparseTargetUpdate(field, targetX, targetZ, targetY)
    while (
      stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET) === 'pending'
    ) {}
    return getZombieEscapeSparseCommittedRouteGeneration(field) !== routeGeneration
  }
  const targetColumn = worldColumn(world, targetX)
  const targetRow = worldRow(world, targetZ)
  const targetBucketX = Math.floor(targetColumn / FLOW_TARGET_CELL_STRIDE)
  const targetBucketZ = Math.floor(targetRow / FLOW_TARGET_CELL_STRIDE)
  const targetLayerIndex = resolveSupportedNavigationLayerIndex(world, targetX, targetZ, targetY)
  if (
    field.targetInitialized &&
    field.targetBucketX === targetBucketX &&
    field.targetBucketZ === targetBucketZ &&
    field.targetLayerIndex === targetLayerIndex
  ) {
    return false
  }

  field.targetBucketX = targetBucketX
  field.targetBucketZ = targetBucketZ
  field.targetInitialized = true
  field.targetLayerIndex = targetLayerIndex
  field.targetX = targetX
  field.targetY = targetY
  field.targetZ = targetZ
  invalidateZombieEscapeStrictFlowTarget(field)
  invalidateZombieEscapeFallbackFlowTarget(field)
  return true
}

function invalidateZombieEscapeStrictFlowTarget(
  field: ZombieEscapeFlowField,
  deferTargetNodeClear = false,
) {
  field.routeRevision += 1
  field.targetCell = FLOW_STRICT_UNBUILT
  field.reachableCount = 0
  if (deferTargetNodeClear) return
  field.graphStrictTargetNodeCount = clearZombieEscapeSparseFlowTargetNodes(
    field.graphStrictTargetNodes,
    field.graphStrictTargetNodeMarks,
    field.graphStrictTargetNodeCount,
  )
}

function invalidateZombieEscapeFallbackFlowTarget(
  field: ZombieEscapeFlowField,
  deferTargetNodeClear = false,
) {
  field.routeRevision += 1
  field.fallbackTargetCell = FLOW_FALLBACK_UNBUILT
  field.fallbackReachableCount = 0
  if (deferTargetNodeClear) return
  field.graphFallbackTargetNodeCount = clearZombieEscapeSparseFlowTargetNodes(
    field.graphFallbackTargetNodes,
    field.graphFallbackTargetNodeMarks,
    field.graphFallbackTargetNodeCount,
  )
}

function resetZombieEscapeSparseTargetStepWork(update: ZombieEscapeSparseTargetUpdate) {
  resetZombieEscapeVisibilityOwnerStepWork(update)
  update.lastStepTargetAnchorCandidateVisits = 0
  update.lastStepTargetAnchorVisibilityTests = 0
  update.lastStepGraphEdgeVisits = 0
  update.lastStepHeapOperations = 0
  update.lastStepPublications = 0
}

function targetUpdateHasCandidateBudget(
  update: ZombieEscapeSparseTargetUpdate,
  maximumCandidateVisits: number,
) {
  return update.lastStepCandidateVisits < maximumCandidateVisits
}

function consumeZombieEscapeSparseTargetCandidate(update: ZombieEscapeSparseTargetUpdate) {
  update.lastStepCandidateVisits += 1
  update.totalCandidateVisits += 1
}

function completeZombieEscapeSparseTargetLayerResolution(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
) {
  const committed = activeZombieEscapeSparseReverseFieldBank(field)
  const targetLayerChanged = committed.targetLayerIndex !== update.activeTargetLayerIndex
  if (targetLayerChanged || update.activeForceRebuild) {
    update.strictInvalidated = true
    update.fallbackInvalidated = true
  }
  if (!committed.routeTargetInitialized) {
    update.strictInvalidated = true
    update.fallbackInvalidated = true
  }
  if (
    update.requestedTargetX === update.activeTargetX &&
    update.requestedTargetY === update.activeTargetY &&
    update.requestedTargetZ === update.activeTargetZ
  ) {
    update.requestedTargetLayerHint = update.activeTargetLayerIndex
  }
  if (update.strictInvalidated || update.fallbackInvalidated) {
    completeZombieEscapeSparseTargetValidation(field, update)
    return
  }
  if (
    committed.targetCell === FLOW_STRICT_UNBUILT ||
    committed.fallbackTargetCell === FLOW_FALLBACK_UNBUILT
  ) {
    update.strictInvalidated = true
    update.fallbackInvalidated = true
    completeZombieEscapeSparseTargetValidation(field, update)
    return
  }
  update.validationNodeOffset = 0
  update.phase = 'validate-strict'
}

function stepZombieEscapeSparseTargetValidation(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  maximumCandidateVisits: number,
  maximumCollisionPredicates: number,
  maximumHierarchyNodeVisits: number,
  maximumSupportPredicates: number,
) {
  const committed = activeZombieEscapeSparseReverseFieldBank(field)
  const fallback = update.phase.startsWith('validate-fallback')
  if (update.phase.endsWith('-visibility')) {
    const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
      field.world,
      update.visibility,
      update,
      maximumCandidateVisits,
      maximumCollisionPredicates,
      maximumHierarchyNodeVisits,
      maximumSupportPredicates,
    )
    if (visibilityStatus === 'pending') return false
    if (visibilityStatus === 'invalidated') {
      update.phase = 'complete'
      update.status = 'invalidated'
      return true
    }
    const valid =
      update.currentNode < 0 ? visibilityStatus !== 'clear' : visibilityStatus === 'clear'
    if (!valid) markZombieEscapeSparseTargetVariantInvalid(update, fallback)
    finishZombieEscapeSparseTargetValidationPhase(field, update, fallback)
    return true
  }
  const built = fallback
    ? committed.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT
    : committed.targetCell !== FLOW_STRICT_UNBUILT
  if (!built) {
    finishZombieEscapeSparseTargetValidationPhase(field, update, fallback)
    return true
  }
  const targetNodes = fallback
    ? committed.graphFallbackTargetNodes
    : committed.graphStrictTargetNodes
  const targetNodeCount = fallback
    ? committed.graphFallbackTargetNodeCount
    : committed.graphStrictTargetNodeCount
  if (targetNodeCount > 0) {
    if (update.validationNodeOffset >= targetNodeCount) {
      finishZombieEscapeSparseTargetValidationPhase(field, update, fallback)
      return true
    }
    if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
    const node = targetNodes[update.validationNodeOffset]!
    consumeZombieEscapeSparseTargetCandidate(update)
    if (field.world.navigationGraph.layerIndices[node] !== update.activeTargetLayerIndex) {
      markZombieEscapeSparseTargetVariantInvalid(update, fallback)
      finishZombieEscapeSparseTargetValidationPhase(field, update, fallback)
      return true
    }
    update.validationNodeOffset += 1
    update.currentNode = node
    beginZombieEscapeNavigationVisibilitySearch(
      field.world,
      update.visibility,
      update.activeTargetLayerIndex,
      update.activeTargetX,
      update.activeTargetZ,
      field.world.navigationGraph.x[node]!,
      field.world.navigationGraph.z[node]!,
      field.world.agentRadius,
      fallback,
    )
    update.phase = fallback ? 'validate-fallback-visibility' : 'validate-strict-visibility'
    return true
  }
  if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
  consumeZombieEscapeSparseTargetCandidate(update)
  update.currentNode = -1
  beginZombieEscapeNavigationVisibilitySearch(
    field.world,
    update.visibility,
    update.activeTargetLayerIndex,
    update.activeTargetX,
    update.activeTargetZ,
    update.activeTargetX,
    update.activeTargetZ,
    field.world.agentRadius,
    fallback,
  )
  update.phase = fallback ? 'validate-fallback-visibility' : 'validate-strict-visibility'
  return true
}

function markZombieEscapeSparseTargetVariantInvalid(
  update: ZombieEscapeSparseTargetUpdate,
  fallback: boolean,
) {
  if (fallback) update.fallbackInvalidated = true
  else update.strictInvalidated = true
}

function finishZombieEscapeSparseTargetValidationPhase(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  fallback: boolean,
) {
  update.validationNodeOffset = 0
  if (!fallback) {
    update.phase = 'validate-fallback'
    return
  }
  completeZombieEscapeSparseTargetValidation(field, update)
}

function completeZombieEscapeSparseTargetValidation(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
) {
  const committed = activeZombieEscapeSparseReverseFieldBank(field)
  const invalidatedBuiltRoute =
    committed.routeTargetInitialized &&
    ((update.strictInvalidated && committed.targetCell !== FLOW_STRICT_UNBUILT) ||
      (update.fallbackInvalidated && committed.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT))
  if (invalidatedBuiltRoute) update.routeInvalidationCount += 1
  if (update.strictInvalidated || update.fallbackInvalidated) {
    update.requestedStrictBuild = true
    update.requestedFallbackBuild = true
    beginRequestedZombieEscapeSparseTargetBuild(field, update)
    return
  }
  update.routeTargetBucketX = update.activeTargetBucketX
  update.routeTargetBucketZ = update.activeTargetBucketZ
  update.routeTargetLayerIndex = update.activeTargetLayerIndex
  update.routeTargetX = update.activeTargetX
  update.routeTargetY = update.activeTargetY
  update.routeTargetZ = update.activeTargetZ
  update.routeTargetInitialized = true
  completeZombieEscapeSparseTargetRequest(field, update)
}

function completeZombieEscapeSparseTargetRequest(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
) {
  if (
    update.requestedTargetX !== update.activeTargetX ||
    update.requestedTargetY !== update.activeTargetY ||
    update.requestedTargetZ !== update.activeTargetZ ||
    (update.requestedForceRebuild && !update.activeForceRebuild)
  ) {
    update.activeForceRebuild = update.requestedForceRebuild
    update.activeTargetBucketX = update.requestedTargetBucketX
    update.activeTargetBucketZ = update.requestedTargetBucketZ
    update.activeTargetLayerIndex = -1
    update.activeTargetX = update.requestedTargetX
    update.activeTargetY = update.requestedTargetY
    update.activeTargetZ = update.requestedTargetZ
    update.bestLayerDistance = Number.POSITIVE_INFINITY
    update.fallbackInvalidated = false
    update.layerOffset = 0
    update.strictInvalidated = false
    update.validationNodeOffset = 0
    update.phase = 'resolve-layer'
    update.status = 'pending'
    return
  }
  update.activeForceRebuild = false
  update.phase = 'complete'
  update.requestedForceRebuild = false
  update.status = 'ready'
}

function requestZombieEscapeSparseTargetBuild(field: ZombieEscapeFlowField, _fallback: boolean) {
  const update = field.graphSparseTargetUpdate
  update.requestedFallbackBuild = true
  update.requestedStrictBuild = true
  if (update.status === 'pending') return
  beginRequestedZombieEscapeSparseTargetBuild(field, update)
}

function beginRequestedZombieEscapeSparseTargetBuild(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
) {
  if (update.status === 'invalidated') return
  const committed = activeZombieEscapeSparseReverseFieldBank(field)
  const strictNeeded =
    update.requestedStrictBuild &&
    (update.strictInvalidated || committed.targetCell === FLOW_STRICT_UNBUILT)
  const fallbackNeeded =
    update.requestedFallbackBuild &&
    (update.fallbackInvalidated || committed.fallbackTargetCell === FLOW_FALLBACK_UNBUILT)
  if (!strictNeeded && !fallbackNeeded) {
    update.requestedStrictBuild = false
    update.requestedFallbackBuild = false
    return
  }
  const workspace = field.graphReverseFieldBanks
  const stagingBankIndex = stagingZombieEscapeSparseReverseFieldBankIndex(field)
  if (workspace.bankReaderCounts[stagingBankIndex] !== 0) {
    update.phase = 'wait-staging-bank'
    update.status = 'pending'
    return
  }
  if (update.status !== 'pending') {
    update.activeTargetBucketX = field.targetBucketX
    update.activeTargetBucketZ = field.targetBucketZ
    update.activeTargetLayerIndex = committed.targetLayerIndex
    update.activeTargetX = field.targetX
    update.activeTargetY = field.targetY
    update.activeTargetZ = field.targetZ
  }
  update.buildBankIndex = stagingBankIndex
  update.worldRevision = field.world.revision
  update.requestedStrictBuild = true
  update.requestedFallbackBuild = true
  beginZombieEscapeSparseTargetBuildVariant(update, 0)
}

function beginZombieEscapeSparseTargetBuildVariant(
  update: ZombieEscapeSparseTargetUpdate,
  variant: number,
) {
  update.buildVariant = variant
  update.candidateOffset = 0
  update.currentEdge = 0
  update.currentEdgeEnd = 0
  update.currentNode = -1
  update.heapNode = -1
  update.heapPosition = -1
  update.heapReturnPhase = 'build-seed-target-nodes'
  update.heapSize = 0
  update.initializationOffset = 0
  update.reachableCount = 0
  update.targetNodeOffset = 0
  if (variant === 0) update.selectedStrictAnchorCount = 0
  if (variant === 2) update.selectedFallbackAnchorCount = 0
  update.phase = variant === 0 || variant === 2 ? 'build-clear-target-marks' : 'build-reset-nodes'
  update.status = 'pending'
}

function sparseTargetBuildCosts(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  variant: number,
) {
  const bank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  return zombieEscapeSparseReverseFieldCosts(bank, variant)
}

function sparseTargetBuildTravelDistances(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  variant: number,
) {
  const bank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  return zombieEscapeSparseReverseFieldDistances(bank, variant)
}

function sparseTargetBuildBreachCounts(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  variant: number,
) {
  const bank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  return zombieEscapeSparseReverseFieldBreachCounts(bank, variant)
}

function sparseTargetBuildBreachMasks(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  variant: number,
) {
  const bank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  if (variant === 2) return bank.graphFallbackBreachMasks
  if (variant === 3) return bank.graphSameLayerFallbackBreachMasks
  return null
}

function sparseTargetBuildNextNodes(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  variant: number,
) {
  const bank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  if (variant === 0) return bank.graphStrictNextNodes
  if (variant === 1) return bank.graphSameLayerNextNodes
  if (variant === 2) return bank.graphFallbackNextNodes
  return bank.graphSameLayerFallbackNextNodes
}

function sparseTargetBuildAdjacency(field: ZombieEscapeFlowField, variant: number) {
  return variant >= 2
    ? field.world.navigationGraph.fallbackAdjacency
    : field.world.navigationGraph.strictAdjacency
}

function sparseTargetBuildComponentIndices(field: ZombieEscapeFlowField, variant: number) {
  const graph = field.world.navigationGraph
  if (variant === 0) return graph.strictComponentIndices
  if (variant === 1) return graph.strictSameLayerComponentIndices
  if (variant === 2) return graph.fallbackComponentIndices
  return graph.fallbackSameLayerComponentIndices
}

function consumeZombieEscapeSparseTargetHeapOperation(update: ZombieEscapeSparseTargetUpdate) {
  update.lastStepHeapOperations += 1
  update.totalHeapOperations += 1
}

function consumeZombieEscapeSparseTargetAnchorCandidate(update: ZombieEscapeSparseTargetUpdate) {
  consumeZombieEscapeSparseTargetCandidate(update)
  update.lastStepTargetAnchorCandidateVisits += 1
  update.totalTargetAnchorCandidateVisits += 1
}

function nextZombieEscapeSparseTargetComponentVisitEpoch(field: ZombieEscapeFlowField) {
  const next = ((field.graphTargetComponentVisitEpoch[0] ?? 0) + 1) >>> 0
  if (next !== 0) {
    field.graphTargetComponentVisitEpoch[0] = next
    return next
  }
  field.graphTargetComponentVisitStamps.fill(0)
  field.graphTargetComponentVisitEpoch[0] = 1
  return 1
}

function sparseNavigationHeapNodePrecedes(
  distances: Float64Array,
  firstNode: number,
  secondNode: number,
) {
  return (
    distances[firstNode]! < distances[secondNode]! - INTERSECTION_EPSILON ||
    (Math.abs(distances[firstNode]! - distances[secondNode]!) <= INTERSECTION_EPSILON &&
      firstNode <= secondNode)
  )
}

function beginZombieEscapeSparseNavigationHeapPush(
  update: ZombieEscapeSparseTargetUpdate,
  node: number,
  returnPhase: ZombieEscapeSparseTargetUpdate['heapReturnPhase'],
) {
  update.heapNode = node
  update.heapPosition = -1
  update.heapReturnPhase = returnPhase
  update.phase = 'build-heap-push'
}

function stepZombieEscapeSparseNavigationHeapPush(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  distances: Float64Array,
) {
  const node = update.heapNode
  if (update.heapPosition < 0) {
    let position = field.graphHeapPositions[node]!
    if (position < 0) {
      position = update.heapSize
      update.heapSize += 1
      field.graphHeapNodes[position] = node
      field.graphHeapPositions[node] = position
    }
    update.heapPosition = position
    if (position === 0) update.phase = update.heapReturnPhase
    return
  }
  const position = update.heapPosition
  const parent = Math.floor((position - 1) / 2)
  const parentNode = field.graphHeapNodes[parent]!
  if (sparseNavigationHeapNodePrecedes(distances, parentNode, node)) {
    update.phase = update.heapReturnPhase
    return
  }
  field.graphHeapNodes[position] = parentNode
  field.graphHeapPositions[parentNode] = position
  field.graphHeapNodes[parent] = node
  field.graphHeapPositions[node] = parent
  update.heapPosition = parent
  if (parent === 0) update.phase = update.heapReturnPhase
}

function beginZombieEscapeSparseNavigationHeapPop(update: ZombieEscapeSparseTargetUpdate) {
  update.heapNode = -1
  update.heapPosition = -1
  update.phase = 'build-heap-pop'
}

function completeZombieEscapeSparseNavigationHeapPop(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
) {
  const adjacency = sparseTargetBuildAdjacency(field, update.buildVariant)
  update.currentEdge = adjacency.nodeOffsets[update.currentNode]!
  update.currentEdgeEnd = adjacency.nodeOffsets[update.currentNode + 1]!
  update.heapNode = -1
  update.heapPosition = -1
  update.phase = 'build-dijkstra-edges'
}

function stepZombieEscapeSparseNavigationHeapPop(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  distances: Float64Array,
) {
  if (update.heapPosition < 0) {
    const root = field.graphHeapNodes[0]!
    update.currentNode = root
    field.graphHeapPositions[root] = -1
    update.heapSize -= 1
    if (update.heapSize <= 0) {
      update.heapSize = 0
      completeZombieEscapeSparseNavigationHeapPop(field, update)
      return
    }
    const replacement = field.graphHeapNodes[update.heapSize]!
    update.heapNode = replacement
    update.heapPosition = 0
    field.graphHeapNodes[0] = replacement
    field.graphHeapPositions[replacement] = 0
    if (update.heapSize === 1) completeZombieEscapeSparseNavigationHeapPop(field, update)
    return
  }
  const position = update.heapPosition
  const left = position * 2 + 1
  if (left >= update.heapSize) {
    completeZombieEscapeSparseNavigationHeapPop(field, update)
    return
  }
  const right = left + 1
  let child = left
  if (
    right < update.heapSize &&
    sparseNavigationHeapNodePrecedes(
      distances,
      field.graphHeapNodes[right]!,
      field.graphHeapNodes[left]!,
    )
  ) {
    child = right
  }
  const replacement = update.heapNode
  const childNode = field.graphHeapNodes[child]!
  if (sparseNavigationHeapNodePrecedes(distances, replacement, childNode)) {
    completeZombieEscapeSparseNavigationHeapPop(field, update)
    return
  }
  field.graphHeapNodes[position] = childNode
  field.graphHeapPositions[childNode] = position
  field.graphHeapNodes[child] = replacement
  field.graphHeapPositions[replacement] = child
  update.heapPosition = child
  if (child * 2 + 1 >= update.heapSize) {
    completeZombieEscapeSparseNavigationHeapPop(field, update)
  }
}

function stepZombieEscapeSparseTargetBuild(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  maximumCandidateVisits: number,
  maximumGraphEdgeVisits: number,
  maximumHeapOperations: number,
) {
  const graph = field.world.navigationGraph
  const variant = update.buildVariant
  const costs = sparseTargetBuildCosts(field, update, variant)
  const distances = sparseTargetBuildTravelDistances(field, update, variant)
  const breachCounts = sparseTargetBuildBreachCounts(field, update, variant)
  const breachMasks = sparseTargetBuildBreachMasks(field, update, variant)
  const nextNodes = sparseTargetBuildNextNodes(field, update, variant)
  const buildBank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  const fallback = variant >= 2
  const sameLayerOnly = variant % 2 === 1

  if (update.phase === 'build-heap-push') {
    if (update.lastStepHeapOperations >= maximumHeapOperations) return false
    consumeZombieEscapeSparseTargetHeapOperation(update)
    stepZombieEscapeSparseNavigationHeapPush(field, update, costs)
    return true
  }

  if (update.phase === 'build-heap-pop') {
    if (update.lastStepHeapOperations >= maximumHeapOperations) return false
    consumeZombieEscapeSparseTargetHeapOperation(update)
    stepZombieEscapeSparseNavigationHeapPop(field, update, costs)
    return true
  }

  if (update.phase === 'build-clear-target-marks') {
    const targetNodes = fallback
      ? buildBank.graphFallbackTargetNodes
      : buildBank.graphStrictTargetNodes
    const targetNodeMarks = fallback
      ? buildBank.graphFallbackTargetNodeMarks
      : buildBank.graphStrictTargetNodeMarks
    const targetNodeCount = fallback
      ? buildBank.graphFallbackTargetNodeCount
      : buildBank.graphStrictTargetNodeCount
    while (update.targetNodeOffset < targetNodeCount) {
      if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
      targetNodeMarks[targetNodes[update.targetNodeOffset]!] = 0
      update.targetNodeOffset += 1
      consumeZombieEscapeSparseTargetCandidate(update)
    }
    if (fallback) buildBank.graphFallbackTargetNodeCount = 0
    else buildBank.graphStrictTargetNodeCount = 0
    update.initializationOffset = 0
    update.phase = 'build-reset-nodes'
    return true
  }

  if (update.phase === 'build-reset-nodes') {
    while (update.initializationOffset < graph.nodeIds.length) {
      if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
      const node = update.initializationOffset
      update.initializationOffset += 1
      distances[node] = Number.POSITIVE_INFINITY
      costs[node] = Number.POSITIVE_INFINITY
      if (breachCounts) breachCounts[node] = 0
      nextNodes[node] = -1
      field.graphHeapPositions[node] = -1
      consumeZombieEscapeSparseTargetCandidate(update)
    }
    update.initializationOffset = 0
    update.candidateOffset = 0
    update.targetNodeOffset = 0
    if (variant === 0 || variant === 2) {
      nextZombieEscapeSparseTargetComponentVisitEpoch(field)
      update.phase = 'build-select-target-anchors'
    } else {
      update.phase = 'build-seed-target-nodes'
    }
    return true
  }

  if (update.phase === 'build-select-target-anchors') {
    const targetRegionIndex = graph.targetRegionIndex
    const componentIndices = sparseTargetBuildComponentIndices(field, variant)
    const targetNodes = fallback
      ? buildBank.graphFallbackTargetNodes
      : buildBank.graphStrictTargetNodes
    const componentVisitEpoch = field.graphTargetComponentVisitEpoch[0] ?? 0
    while (update.candidateOffset < targetRegionIndex.witnessNodes.length) {
      if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
      const region = update.candidateOffset
      update.candidateOffset += 1
      consumeZombieEscapeSparseTargetAnchorCandidate(update)
      if (
        targetRegionIndex.fallbacks[region] !== (fallback ? 1 : 0) ||
        targetRegionIndex.layerIndices[region] !== update.activeTargetLayerIndex ||
        !sparseNavigationTargetRegionContainsPoint(
          targetRegionIndex,
          region,
          update.activeTargetX,
          update.activeTargetZ,
        )
      ) {
        continue
      }
      const node = targetRegionIndex.witnessNodes[region]!
      if (
        node < 0 ||
        node >= graph.nodeIds.length ||
        graph.layerIndices[node] !== update.activeTargetLayerIndex
      ) {
        continue
      }
      const component = componentIndices[node]!
      if (component < 0 || component >= field.graphTargetComponentVisitStamps.length) {
        continue
      }
      if (field.graphTargetComponentVisitStamps[component] !== componentVisitEpoch) {
        field.graphTargetComponentVisitStamps[component] = componentVisitEpoch
        targetNodes[component] = node
      } else {
        targetNodes[component] = Math.min(targetNodes[component]!, node)
      }
    }
    update.candidateOffset = 0
    update.targetNodeOffset = 0
    update.phase = 'build-collect-target-anchors'
    return true
  }

  if (update.phase === 'build-collect-target-anchors') {
    const targetNodes = fallback
      ? buildBank.graphFallbackTargetNodes
      : buildBank.graphStrictTargetNodes
    const targetNodeMarks = fallback
      ? buildBank.graphFallbackTargetNodeMarks
      : buildBank.graphStrictTargetNodeMarks
    const componentVisitEpoch = field.graphTargetComponentVisitEpoch[0] ?? 0
    while (update.candidateOffset < field.graphTargetComponentVisitStamps.length) {
      if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
      const component = update.candidateOffset
      update.candidateOffset += 1
      consumeZombieEscapeSparseTargetAnchorCandidate(update)
      if (field.graphTargetComponentVisitStamps[component] !== componentVisitEpoch) continue
      const node = targetNodes[component]!
      if (node < 0 || node >= graph.nodeIds.length) continue
      targetNodes[update.targetNodeOffset] = node
      targetNodeMarks[node] = 1
      update.targetNodeOffset += 1
    }
    const targetNodeCount = update.targetNodeOffset
    if (fallback) {
      buildBank.graphFallbackTargetNodeCount = targetNodeCount
      update.selectedFallbackAnchorCount = targetNodeCount
    } else {
      buildBank.graphStrictTargetNodeCount = targetNodeCount
      update.selectedStrictAnchorCount = targetNodeCount
    }
    update.completedAnchorSelectionCount += 1
    if (targetNodeCount === 0) update.totalMissingAnchorSelectionCount += 1
    update.targetNodeOffset = 0
    update.phase = 'build-seed-target-nodes'
    return true
  }

  if (update.phase === 'build-seed-target-nodes') {
    const targetNodes = fallback
      ? buildBank.graphFallbackTargetNodes
      : buildBank.graphStrictTargetNodes
    const targetNodeCount = fallback
      ? buildBank.graphFallbackTargetNodeCount
      : buildBank.graphStrictTargetNodeCount
    while (update.targetNodeOffset < targetNodeCount) {
      if (!targetUpdateHasCandidateBudget(update, maximumCandidateVisits)) return false
      const node = targetNodes[update.targetNodeOffset]!
      update.targetNodeOffset += 1
      consumeZombieEscapeSparseTargetCandidate(update)
      if (node < 0 || node >= graph.nodeIds.length) continue
      const targetDistance = Math.hypot(
        graph.x[node]! - update.activeTargetX,
        graph.z[node]! - update.activeTargetZ,
      )
      costs[node] = targetDistance
      distances[node] = targetDistance
      if (breachCounts && breachMasks) {
        breachCounts[node] = 0
        const breachMaskOffset = node * buildBank.breachObjectWordCount
        breachMasks.fill(0, breachMaskOffset, breachMaskOffset + buildBank.breachObjectWordCount)
      }
      nextNodes[node] = -1
      update.reachableCount += 1
      beginZombieEscapeSparseNavigationHeapPush(update, node, 'build-seed-target-nodes')
      return true
    }
    update.phase = 'build-dijkstra-pop'
    return true
  }

  if (update.phase === 'build-dijkstra-pop') {
    if (update.heapSize <= 0) {
      update.phase = 'build-complete'
      return true
    }
    beginZombieEscapeSparseNavigationHeapPop(update)
    return true
  }

  if (update.phase === 'build-dijkstra-edges') {
    if (update.currentEdge >= update.currentEdgeEnd) {
      update.phase = 'build-dijkstra-pop'
      return true
    }
    if (update.lastStepGraphEdgeVisits >= maximumGraphEdgeVisits) {
      return false
    }
    const adjacency = sparseTargetBuildAdjacency(field, variant)
    const edge = update.currentEdge
    const neighbor = adjacency.toNodes[edge]!
    const eligible =
      neighbor >= 0 &&
      (!sameLayerOnly || graph.layerIndices[neighbor] === graph.layerIndices[update.currentNode])
    let shouldRelax = false
    let candidateBreachCount = 0
    let candidateDistance = Number.POSITIVE_INFINITY
    let candidateTravelDistance = Number.POSITIVE_INFINITY
    if (eligible) {
      candidateTravelDistance = distances[update.currentNode]! + adjacency.weights[edge]!
      candidateBreachCount = breachCounts?.[update.currentNode] ?? 0
      if (breachCounts && breachMasks && adjacency.breachCounts[edge]! > 0) {
        const currentMaskOffset = update.currentNode * buildBank.breachObjectWordCount
        for (
          let objectOffset = adjacency.breachObjectOffsets[edge]!;
          objectOffset < adjacency.breachObjectOffsets[edge + 1]!;
          objectOffset += 1
        ) {
          const objectIndex = adjacency.breachObjectIndices[objectOffset]!
          const objectOrdinal = graph.breachObjectOrdinals[objectIndex]!
          if (field.world.activeObjectMask[objectOrdinal] === 0) continue
          const word = objectIndex >>> 5
          const bit = 1 << (objectIndex & 31)
          if ((breachMasks[currentMaskOffset + word]! & bit) === 0) candidateBreachCount += 1
        }
      }
      candidateDistance =
        candidateTravelDistance +
        candidateBreachCount *
          ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRoutePlanningSpeedMetersPerSecond *
          ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS
      const currentDistance = costs[neighbor]!
      shouldRelax =
        candidateDistance < currentDistance - INTERSECTION_EPSILON ||
        (Math.abs(candidateDistance - currentDistance) <= INTERSECTION_EPSILON &&
          (candidateBreachCount < (breachCounts?.[neighbor] ?? 0) ||
            (candidateBreachCount === (breachCounts?.[neighbor] ?? 0) &&
              (candidateTravelDistance < distances[neighbor]! - INTERSECTION_EPSILON ||
                (Math.abs(candidateTravelDistance - distances[neighbor]!) <= INTERSECTION_EPSILON &&
                  (nextNodes[neighbor]! < 0 || update.currentNode < nextNodes[neighbor]!))))))
    }
    update.currentEdge += 1
    update.lastStepGraphEdgeVisits += 1
    update.totalGraphEdgeVisits += 1
    if (!shouldRelax) return true
    if (!Number.isFinite(costs[neighbor]!)) update.reachableCount += 1
    costs[neighbor] = candidateDistance
    distances[neighbor] = distances[update.currentNode]! + adjacency.weights[edge]!
    if (breachCounts && breachMasks) {
      breachCounts[neighbor] = candidateBreachCount
      const currentMaskOffset = update.currentNode * buildBank.breachObjectWordCount
      const neighborMaskOffset = neighbor * buildBank.breachObjectWordCount
      for (let word = 0; word < buildBank.breachObjectWordCount; word += 1) {
        breachMasks[neighborMaskOffset + word] = breachMasks[currentMaskOffset + word]!
      }
      for (
        let objectOffset = adjacency.breachObjectOffsets[edge]!;
        objectOffset < adjacency.breachObjectOffsets[edge + 1]!;
        objectOffset += 1
      ) {
        const objectIndex = adjacency.breachObjectIndices[objectOffset]!
        const objectOrdinal = graph.breachObjectOrdinals[objectIndex]!
        if (field.world.activeObjectMask[objectOrdinal] === 0) continue
        const word = objectIndex >>> 5
        const maskIndex = neighborMaskOffset + word
        breachMasks[maskIndex] = breachMasks[maskIndex]! | (1 << (objectIndex & 31))
      }
    }
    nextNodes[neighbor] = update.currentNode
    beginZombieEscapeSparseNavigationHeapPush(update, neighbor, 'build-dijkstra-edges')
    return true
  }

  if (update.phase === 'build-complete') {
    completeZombieEscapeSparseTargetBuildVariant(field, update)
    return true
  }
  return false
}

function completeZombieEscapeSparseTargetBuildVariant(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
) {
  const buildBank = field.graphReverseFieldBanks.banks[update.buildBankIndex]!
  if (update.buildVariant === 0) {
    buildBank.reachableCount = update.reachableCount
    beginZombieEscapeSparseTargetBuildVariant(update, 1)
    return
  }
  if (update.buildVariant === 1) {
    buildBank.targetCell = buildBank.reachableCount > 0 ? 0 : -1
    beginZombieEscapeSparseTargetBuildVariant(update, 2)
    return
  } else if (update.buildVariant === 2) {
    buildBank.fallbackReachableCount = update.reachableCount
    beginZombieEscapeSparseTargetBuildVariant(update, 3)
    return
  } else {
    buildBank.fallbackTargetCell = buildBank.fallbackReachableCount > 0 ? 0 : -1
  }
  publishZombieEscapeSparseReverseFieldBank(field, update, buildBank)
}

function publishZombieEscapeSparseReverseFieldBank(
  field: ZombieEscapeFlowField,
  update: ZombieEscapeSparseTargetUpdate,
  buildBank: ZombieEscapeSparseReverseFieldBank,
) {
  const workspace = field.graphReverseFieldBanks
  if (
    update.buildBankIndex === workspace.activeBankIndex ||
    workspace.bankReaderCounts[update.buildBankIndex] !== 0
  ) {
    workspace.leaseInvariantViolationCount += 1
    update.phase = 'complete'
    update.status = 'invalidated'
    return
  }
  buildBank.routeTargetBucketX = update.activeTargetBucketX
  buildBank.routeTargetBucketZ = update.activeTargetBucketZ
  buildBank.routeTargetInitialized = true
  buildBank.routeTargetLayerIndex = update.activeTargetLayerIndex
  buildBank.routeTargetX = update.activeTargetX
  buildBank.routeTargetY = update.activeTargetY
  buildBank.routeTargetZ = update.activeTargetZ
  buildBank.targetLayerIndex = update.activeTargetLayerIndex
  buildBank.worldRevision = field.world.revision
  workspace.generation = (workspace.generation + 1) >>> 0 || 1
  buildBank.generation = workspace.generation
  workspace.activeBankIndex = update.buildBankIndex
  workspace.publicationCount += 1
  field.rebuildCount += 1
  field.fallbackRebuildCount += 1
  update.completedStrictBuilds += 1
  update.completedFallbackBuilds += 1
  update.requestedStrictBuild = false
  update.requestedFallbackBuild = false
  update.routeTargetBucketX = buildBank.routeTargetBucketX
  update.routeTargetBucketZ = buildBank.routeTargetBucketZ
  update.routeTargetInitialized = true
  update.routeTargetLayerIndex = buildBank.routeTargetLayerIndex
  update.routeTargetX = buildBank.routeTargetX
  update.routeTargetY = buildBank.routeTargetY
  update.routeTargetZ = buildBank.routeTargetZ
  update.fallbackInvalidated = false
  update.strictInvalidated = false
  update.lastStepPublications += 1
  completeZombieEscapeSparseTargetRequest(field, update)
}

function ensureZombieEscapeStrictFlowTarget(field: ZombieEscapeFlowField) {
  if (field.targetLayerIndex < 0 || field.targetCell !== FLOW_STRICT_UNBUILT) return
  if (field.world.navigationMode === 'sparse') {
    requestZombieEscapeSparseTargetBuild(field, false)
    while (
      stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET) === 'pending'
    ) {}
    return
  }
  const world = field.world
  const targetCell = findNearestWalkableCell(
    world,
    field.targetLayerIndex,
    worldColumn(world, field.targetX),
    worldRow(world, field.targetZ),
  )
  field.distances.fill(FLOW_UNREACHABLE)
  field.reachableCount = 0
  field.targetCell = targetCell
  field.rebuildCount += 1
  if (targetCell < 0) return
  field.reachableCount = rebuildZombieEscapeFlowDistances(
    world,
    field.distances,
    field.queue,
    field.targetLayerIndex,
    targetCell,
    false,
  )
}

function ensureZombieEscapeFallbackFlowTarget(field: ZombieEscapeFlowField) {
  if (field.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT) return
  if (field.world.navigationMode === 'sparse') {
    requestZombieEscapeSparseTargetBuild(field, true)
    while (
      stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET) === 'pending'
    ) {}
    return
  }
  const world = field.world
  const targetCell = findNearestWalkableCell(
    world,
    field.targetLayerIndex,
    worldColumn(world, field.targetX),
    worldRow(world, field.targetZ),
    true,
  )
  field.fallbackDistances.fill(FLOW_UNREACHABLE)
  field.fallbackReachableCount = 0
  field.fallbackTargetCell = targetCell
  field.fallbackRebuildCount += 1
  if (targetCell < 0) return
  field.fallbackReachableCount = rebuildZombieEscapeFlowDistances(
    world,
    field.fallbackDistances,
    field.fallbackQueue,
    field.targetLayerIndex,
    targetCell,
    true,
  )
}

function clearZombieEscapeSparseFlowTargetNodes(
  targetNodes: Int32Array,
  targetNodeMarks: Uint8Array,
  targetNodeCount: number,
) {
  for (let index = 0; index < targetNodeCount; index += 1) {
    targetNodeMarks[targetNodes[index]!] = 0
  }
  return 0
}

function rebuildZombieEscapeFlowDistances(
  world: ZombieEscapeCollisionWorld,
  distances: Uint32Array,
  queue: Int32Array,
  targetLayerIndex: number,
  targetCell: number,
  breakablesTraversable: boolean,
) {
  let readIndex = 0
  let writeIndex = 0
  const targetNode = navigationNode(world, targetLayerIndex, targetCell)
  queue[writeIndex++] = targetNode
  distances[targetNode] = 0
  while (readIndex < writeIndex) {
    const node = queue[readIndex++]!
    const distance = distances[node]!
    if (isGridNavigationNode(world, node)) {
      const layerIndex = navigationNodeLayerIndex(world, node)
      const cell = navigationNodeCell(world, node)
      const column = cell % world.gridWidth
      const row = Math.floor(cell / world.gridWidth)
      for (let neighbor = 0; neighbor < FLOW_NEIGHBOR_X.length; neighbor += 1) {
        const columnOffset = FLOW_NEIGHBOR_X[neighbor]!
        const rowOffset = FLOW_NEIGHBOR_Z[neighbor]!
        const nextColumn = column + columnOffset
        const nextRow = row + rowOffset
        if (!isGridCellWalkable(world, layerIndex, nextColumn, nextRow, breakablesTraversable)) {
          continue
        }
        if (
          columnOffset !== 0 &&
          rowOffset !== 0 &&
          (!isGridCellWalkable(
            world,
            layerIndex,
            column + columnOffset,
            row,
            breakablesTraversable,
          ) ||
            !isGridCellWalkable(world, layerIndex, column, row + rowOffset, breakablesTraversable))
        ) {
          continue
        }
        const nextCell = nextRow * world.gridWidth + nextColumn
        const nextNode = navigationNode(world, layerIndex, nextCell)
        if (distances[nextNode] !== FLOW_UNREACHABLE) continue
        distances[nextNode] = distance + 1
        queue[writeIndex++] = nextNode
      }
    }
    const adjacency = world.navigationConnectorAdjacency
    const edgeEnd = adjacency.nodeOffsets[node + 1]!
    for (let edgeIndex = adjacency.nodeOffsets[node]!; edgeIndex < edgeEnd; edgeIndex += 1) {
      const toNode = adjacency.toNodes[edgeIndex]!
      if (toNode < 0 || distances[toNode] !== FLOW_UNREACHABLE) continue
      distances[toNode] = distance + 1
      queue[writeIndex++] = toNode
    }
  }
  return writeIndex
}

export function createZombieEscapeSparseReachableSpawnSearch(): ZombieEscapeSparseReachableSpawnSearch {
  const search = {} as ZombieEscapeSparseReachableSpawnSearch
  resetZombieEscapeSparseReachableSpawnSearch(search)
  return search
}

export function resetZombieEscapeSparseReachableSpawnSearch(
  search: ZombieEscapeSparseReachableSpawnSearch,
) {
  search.attachment = search.attachment ?? createZombieEscapeSparseAttachmentSearch()
  resetZombieEscapeSparseAttachmentSearch(search.attachment)
  search.bestDistanceSquared = Number.POSITIVE_INFINITY
  search.bestLayerDistance = Number.POSITIVE_INFINITY
  search.bestNode = -1
  search.desiredLayerIndex = -1
  search.desiredX = 0
  search.desiredY = 0
  search.desiredZ = 0
  search.fallbackItemEnd = 0
  search.fallbackItemOffset = 0
  search.fallbackNodeIndex = 0
  search.lastStepAttachmentHierarchyNodeVisits = 0
  search.lastStepCandidateVisits = 0
  search.lastStepColliderCandidateVisits = 0
  search.lastStepColliderHierarchyNodeVisits = 0
  search.lastStepCollisionPredicates = 0
  search.lastStepHeapOperations = 0
  search.lastStepHierarchyNodeVisits = 0
  search.lastStepSupportHierarchyNodeVisits = 0
  search.lastStepSupportHoleVisits = 0
  search.lastStepSupportItemVisits = 0
  search.lastStepSupportPredicates = 0
  search.lastStepSupportRingEdgeVisits = 0
  search.lastStepSupportRingHierarchyNodeVisits = 0
  search.layerOffset = 0
  search.minimumTargetDistanceSquared = 0
  search.phase = 'complete'
  search.routeRevision = -1
  search.spawnLayerIndex = -1
  search.status = 'unreachable'
  search.targetX = 0
  search.targetZ = 0
  search.totalAttachmentHierarchyNodeVisits = 0
  search.totalCandidateVisits = 0
  search.totalColliderCandidateVisits = 0
  search.totalColliderHierarchyNodeVisits = 0
  search.totalCollisionPredicates = 0
  search.totalHeapOperations = 0
  search.totalHierarchyNodeVisits = 0
  search.totalSupportHierarchyNodeVisits = 0
  search.totalSupportHoleVisits = 0
  search.totalSupportItemVisits = 0
  search.totalSupportPredicates = 0
  search.totalSupportRingEdgeVisits = 0
  search.totalSupportRingHierarchyNodeVisits = 0
  search.worldRevision = ''
}

export function beginZombieEscapeSparseReachableSpawnSearch(
  search: ZombieEscapeSparseReachableSpawnSearch,
  field: ZombieEscapeFlowField,
  desiredX: number,
  desiredZ: number,
  targetX: number,
  targetZ: number,
  minimumTargetDistanceMeters: number,
  desiredY = 0,
): ZombieEscapeSparseSearchStatus {
  resetZombieEscapeSparseReachableSpawnSearch(search)
  const world = field.world
  search.desiredX = desiredX
  search.desiredY = desiredY
  search.desiredZ = desiredZ
  const minimumTargetDistance = Math.max(0, finiteNonNegative(minimumTargetDistanceMeters, 0))
  search.minimumTargetDistanceSquared = minimumTargetDistance * minimumTargetDistance
  search.targetX = targetX
  search.targetZ = targetZ
  search.routeRevision = -1
  search.worldRevision = world.revision
  if (
    world.navigationMode !== 'sparse' ||
    !Number.isFinite(desiredX) ||
    !Number.isFinite(desiredY) ||
    !Number.isFinite(desiredZ) ||
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetZ)
  ) {
    return search.status
  }
  search.phase = 'initialize'
  search.status = 'pending'
  return search.status
}

export function stepZombieEscapeSparseReachableSpawnSearch(
  search: ZombieEscapeSparseReachableSpawnSearch,
  field: ZombieEscapeFlowField,
  output: ZombieEscapeReachableSpawn,
  budget: ZombieEscapeSparseSearchBudget,
): ZombieEscapeSparseSearchStatus {
  if (
    search.status === 'pending' &&
    (search.worldRevision !== field.world.revision ||
      (search.routeRevision >= 0 && search.routeRevision !== field.routeRevision))
  ) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    return search.status
  }
  if (zombieEscapeSparseSearchBudgetIsEmpty(budget)) return search.status
  resetZombieEscapeVisibilityOwnerStepWork(search)
  search.lastStepAttachmentHierarchyNodeVisits = 0
  search.lastStepHeapOperations = 0
  search.attachment.lastStepAttachmentHierarchyNodeVisits = 0
  if (search.status !== 'pending') return search.status
  const world = field.world
  if (
    search.worldRevision !== world.revision ||
    (search.routeRevision >= 0 && search.routeRevision !== field.routeRevision)
  ) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    return search.status
  }
  if (search.routeRevision >= 0 && !pinnedZombieEscapeSparseReverseFieldBank(search.attachment)) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    return search.status
  }
  const maximumCandidateVisits = normalizeSparseSearchBudget(budget.maximumCandidateVisits)
  const maximumCollisionPredicates = normalizeSparseSearchBudget(budget.maximumCollisionPredicates)
  const maximumHeapOperations = normalizeSparseSearchBudget(budget.maximumHeapOperations)
  const maximumHierarchyNodeVisits = normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits)
  const maximumSupportPredicates = normalizeSparseSearchBudget(budget.maximumSupportPredicates)

  while (search.status === 'pending') {
    if (search.phase === 'initialize') {
      output.cell = -1
      output.reachable = false
      output.x = 0
      output.z = 0
      search.phase = 'resolve-layer'
      continue
    }
    if (search.phase === 'resolve-layer') {
      if (search.layerOffset >= world.navigationLayers.length) {
        search.spawnLayerIndex = search.desiredLayerIndex
        search.phase = 'wait-target'
        continue
      }
      if (search.lastStepSupportPredicates >= maximumSupportPredicates) return search.status
      const layerIndex = search.layerOffset
      const layer = world.navigationLayers[layerIndex]!
      search.layerOffset += 1
      search.lastStepSupportPredicates += 1
      search.totalSupportPredicates += 1
      if (
        layer.elevation > search.desiredY + NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS ||
        !navigationLayerSupportsPoint(world, layerIndex, search.desiredX, search.desiredZ)
      ) {
        continue
      }
      const distance = Math.abs(search.desiredY - layer.elevation)
      if (distance < search.bestLayerDistance) {
        search.bestLayerDistance = distance
        search.desiredLayerIndex = layerIndex
      }
      continue
    }
    if (search.phase === 'wait-target') {
      const dependency = classifyZombieEscapeSparseReachableSpawnTargetDependency(field)
      if (dependency === 'invalidated') {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      if (dependency === 'unreachable') {
        return completeZombieEscapeSparseReachableSpawnSearch(field, search, output, -1, false)
      }
      if (dependency === 'pending' || dependency === 'request') {
        requestZombieEscapeSparseTargetBuild(field, false)
        return search.status
      }
      if (!acquireZombieEscapeSparseAttachmentHeapSlot(search.attachment, field)) {
        return search.status
      }
      const bank = acquireZombieEscapeSparseReverseFieldBankLease(search.attachment, field)
      if (!bank?.routeTargetInitialized || bank.targetCell === FLOW_STRICT_UNBUILT) {
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        requestZombieEscapeSparseTargetBuild(field, false)
        return search.status
      }
      search.spawnLayerIndex =
        search.desiredLayerIndex >= 0 ? search.desiredLayerIndex : bank.targetLayerIndex
      search.routeRevision = field.routeRevision
      search.phase = 'direct'
      continue
    }
    if (search.phase === 'direct') {
      const targetDistanceSquared =
        (search.desiredX - search.targetX) ** 2 + (search.desiredZ - search.targetZ) ** 2
      if (
        search.desiredLayerIndex < 0 ||
        targetDistanceSquared + INTERSECTION_EPSILON < search.minimumTargetDistanceSquared
      ) {
        search.phase = 'fallback-initialize'
        continue
      }
      const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
      if (!bank) {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      const sameLayer = search.desiredLayerIndex === bank.targetLayerIndex
      if (sameLayer) {
        beginZombieEscapeNavigationVisibilitySearch(
          world,
          search.attachment.visibility,
          search.desiredLayerIndex,
          search.desiredX,
          search.desiredZ,
          search.targetX,
          search.targetZ,
          world.agentRadius,
        )
        search.phase = 'direct-visibility'
        continue
      }
      const distances = sameLayer ? bank.graphSameLayerDistances : bank.graphStrictDistances
      beginZombieEscapeSparseAttachmentSearch(
        search.attachment,
        field,
        distances,
        search.desiredLayerIndex,
        search.desiredX,
        search.desiredZ,
        false,
        true,
      )
      search.phase = 'attachment'
      continue
    }
    if (search.phase === 'direct-visibility') {
      const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
        world,
        search.attachment.visibility,
        search,
        maximumCandidateVisits,
        maximumCollisionPredicates,
        maximumHierarchyNodeVisits,
        maximumSupportPredicates,
      )
      if (visibilityStatus === 'pending') return search.status
      if (visibilityStatus === 'invalidated') {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      if (visibilityStatus === 'clear') {
        return completeZombieEscapeSparseReachableSpawnSearch(field, search, output, -1, true)
      }
      const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
      if (!bank) {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      const distances = bank.graphSameLayerDistances
      beginZombieEscapeSparseAttachmentSearch(
        search.attachment,
        field,
        distances,
        search.desiredLayerIndex,
        search.desiredX,
        search.desiredZ,
        false,
        true,
      )
      search.phase = 'attachment'
      continue
    }
    if (search.phase === 'attachment') {
      const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
      if (!bank || search.attachment.reverseFieldDistanceVariant < 0) {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      const distances = zombieEscapeSparseReverseFieldCosts(
        bank,
        search.attachment.reverseFieldDistanceVariant,
      )
      resetZombieEscapeVisibilityOwnerStepWork(search.attachment)
      search.attachment.lastStepAttachmentHierarchyNodeVisits = 0
      search.attachment.lastStepHeapOperations = 0
      const status = stepZombieEscapeSparseAttachmentSearchWithinLimits(
        search.attachment,
        field,
        distances,
        Math.max(0, maximumHierarchyNodeVisits - search.lastStepHierarchyNodeVisits),
        Math.max(0, maximumCandidateVisits - search.lastStepCandidateVisits),
        Math.max(0, maximumSupportPredicates - search.lastStepSupportPredicates),
        Math.max(0, maximumCollisionPredicates - search.lastStepCollisionPredicates),
        Math.max(0, maximumHeapOperations - search.lastStepHeapOperations),
      )
      accumulateZombieEscapeSparseSpawnSearchWork(search)
      if (status === 'pending') return search.status
      if (status === 'invalidated') {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      if (status === 'found') {
        return completeZombieEscapeSparseReachableSpawnSearch(
          field,
          search,
          output,
          search.attachment.bestNode,
          true,
        )
      }
      search.phase = 'fallback-initialize'
      continue
    }
    if (search.phase === 'fallback-initialize') {
      const hierarchy = world.navigationAttachmentAcceleration.layers[search.spawnLayerIndex]
      if (!hierarchy || hierarchy.nodeItemCounts.length === 0) {
        return completeZombieEscapeSparseReachableSpawnSearch(field, search, output, -1, false)
      }
      const attachment = search.attachment
      attachment.hierarchyHeapCandidatePosition = -1
      attachment.hierarchyHeapNextNode = -1
      attachment.hierarchyHeapNode = -1
      attachment.hierarchyHeapOperation = 'idle'
      attachment.hierarchyHeapPosition = -1
      attachment.hierarchyHeapPoppedNode = -1
      attachment.hierarchyHeapSize = 0
      attachment.hierarchyItemEnd = 0
      attachment.hierarchyItemOffset = 0
      attachment.hierarchyNodeIndex = 0
      attachment.lastStepHeapOperations = 0
      attachment.phase = 'hierarchy'
      attachment.routeRevision = field.routeRevision
      attachment.sourceLayerIndex = search.spawnLayerIndex
      attachment.sourceX = search.desiredX
      attachment.sourceZ = search.desiredZ
      attachment.status = 'pending'
      attachment.worldRevision = world.revision
      beginZombieEscapeSparseAttachmentHeapPush(attachment, 0)
      search.phase = 'fallback'
      continue
    }
    if (search.phase === 'fallback' || search.phase === 'fallback-node') {
      const hierarchy = world.navigationAttachmentAcceleration.layers[search.spawnLayerIndex]
      const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
      if (!bank) {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        return search.status
      }
      const distances =
        search.spawnLayerIndex === bank.targetLayerIndex
          ? bank.graphSameLayerDistances
          : bank.graphStrictDistances
      if (!hierarchy) {
        return completeZombieEscapeSparseReachableSpawnSearch(field, search, output, -1, false)
      }
      const attachment = search.attachment
      if (attachment.hierarchyHeapOperation !== 'idle') {
        if (search.lastStepHeapOperations >= maximumHeapOperations) return search.status
        if (!acquireZombieEscapeSparseAttachmentHeapSlot(attachment, field)) return search.status
        stepZombieEscapeSparseAttachmentHeapOperation(attachment, hierarchy)
        search.lastStepHeapOperations += 1
        search.totalHeapOperations += 1
        if (attachment.status === 'invalidated') {
          search.phase = 'complete'
          search.status = 'invalidated'
          releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
          return search.status
        }
        search.phase = attachment.phase === 'hierarchy-node' ? 'fallback-node' : 'fallback'
        continue
      }
      if (attachment.hierarchyItemOffset < attachment.hierarchyItemEnd) {
        if (search.lastStepCandidateVisits >= maximumCandidateVisits) return search.status
        const node = hierarchy.itemIndices[attachment.hierarchyItemOffset]!
        attachment.hierarchyItemOffset += 1
        search.lastStepCandidateVisits += 1
        search.totalCandidateVisits += 1
        if (!Number.isFinite(distances[node]!)) continue
        const nodeTargetDistanceSquared =
          (world.navigationGraph.x[node]! - search.targetX) ** 2 +
          (world.navigationGraph.z[node]! - search.targetZ) ** 2
        if (
          nodeTargetDistanceSquared + INTERSECTION_EPSILON <
          search.minimumTargetDistanceSquared
        ) {
          continue
        }
        const distanceSquared =
          (world.navigationGraph.x[node]! - search.desiredX) ** 2 +
          (world.navigationGraph.z[node]! - search.desiredZ) ** 2
        if (
          distanceSquared < search.bestDistanceSquared - INTERSECTION_EPSILON ||
          (Math.abs(distanceSquared - search.bestDistanceSquared) <= INTERSECTION_EPSILON &&
            (search.bestNode < 0 || node < search.bestNode))
        ) {
          search.bestDistanceSquared = distanceSquared
          search.bestNode = node
        }
        continue
      }
      if (search.phase === 'fallback' && attachment.hierarchyHeapSize <= 0) {
        return completeZombieEscapeSparseReachableSpawnSearch(
          field,
          search,
          output,
          search.bestNode,
          search.bestNode >= 0,
          false,
        )
      }
      if (search.phase === 'fallback') {
        if (search.lastStepHeapOperations >= maximumHeapOperations) return search.status
        beginZombieEscapeSparseAttachmentHeapPop(attachment)
        continue
      }
      if (search.lastStepHierarchyNodeVisits >= maximumHierarchyNodeVisits) return search.status
      const nodeIndex = attachment.hierarchyNodeIndex
      attachment.lastStepAttachmentHierarchyNodeVisits += 1
      attachment.totalAttachmentHierarchyNodeVisits += 1
      search.lastStepAttachmentHierarchyNodeVisits += 1
      search.totalAttachmentHierarchyNodeVisits += 1
      search.lastStepHierarchyNodeVisits += 1
      search.totalHierarchyNodeVisits += 1
      if (
        navigationBoundsHierarchyNodeMinimumDistance(
          hierarchy,
          nodeIndex,
          search.desiredX,
          search.desiredZ,
        ) **
          2 >
        search.bestDistanceSquared + INTERSECTION_EPSILON
      ) {
        search.phase = 'fallback'
        continue
      }
      const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
      if (itemCount > 0) {
        attachment.hierarchyItemOffset = hierarchy.nodeItemOffsets[nodeIndex]!
        attachment.hierarchyItemEnd = attachment.hierarchyItemOffset + itemCount
        search.phase = 'fallback'
        continue
      }
      const left = nodeIndex + 1
      const right = hierarchy.nodeSkipIndices[left]!
      const subtreeEnd = hierarchy.nodeSkipIndices[nodeIndex]!
      const leftDistance = navigationBoundsHierarchyNodeMinimumDistance(
        hierarchy,
        left,
        search.desiredX,
        search.desiredZ,
      )
      const leftEligible =
        leftDistance * leftDistance <= search.bestDistanceSquared + INTERSECTION_EPSILON
      const rightDistance =
        right < subtreeEnd
          ? navigationBoundsHierarchyNodeMinimumDistance(
              hierarchy,
              right,
              search.desiredX,
              search.desiredZ,
            )
          : Number.POSITIVE_INFINITY
      const rightEligible =
        right < subtreeEnd &&
        rightDistance * rightDistance <= search.bestDistanceSquared + INTERSECTION_EPSILON
      if (leftEligible) {
        beginZombieEscapeSparseAttachmentHeapPush(attachment, left, rightEligible ? right : -1)
      } else if (rightEligible) {
        beginZombieEscapeSparseAttachmentHeapPush(attachment, right)
      }
      search.phase = 'fallback'
    }
  }
  return search.status
}

type ZombieEscapeSparseReachableSpawnTargetDependency =
  | 'invalidated'
  | 'pending'
  | 'ready'
  | 'request'
  | 'unreachable'

function classifyZombieEscapeSparseReachableSpawnTargetDependency(
  field: ZombieEscapeFlowField,
): ZombieEscapeSparseReachableSpawnTargetDependency {
  const targetUpdate = field.graphSparseTargetUpdate
  if (targetUpdate.status === 'invalidated') return 'invalidated'
  if (targetUpdate.status === 'pending') return 'pending'
  const committed = activeZombieEscapeSparseReverseFieldBank(field)
  if (
    committed.routeTargetInitialized &&
    committed.targetLayerIndex >= 0 &&
    committed.targetCell !== FLOW_STRICT_UNBUILT
  ) {
    return 'ready'
  }
  if (committed.routeTargetInitialized && committed.targetLayerIndex < 0) return 'unreachable'
  return 'request'
}

export function zombieEscapeSparseReachableSpawnSearchCanProgress(
  search: ZombieEscapeSparseReachableSpawnSearch,
  field: ZombieEscapeFlowField,
) {
  if (search.status !== 'pending') return false
  if (search.worldRevision !== field.world.revision) return true
  if (search.routeRevision >= 0 && search.routeRevision !== field.routeRevision) return true
  if (
    (search.phase === 'attachment' ||
      search.phase === 'fallback' ||
      search.phase === 'fallback-initialize' ||
      search.phase === 'fallback-node') &&
    !zombieEscapeSparseAttachmentHeapSlotIsAvailable(search.attachment, field)
  ) {
    return false
  }
  return (
    search.phase !== 'wait-target' ||
    classifyZombieEscapeSparseReachableSpawnTargetDependency(field) !== 'pending'
  )
}

function accumulateZombieEscapeSparseSpawnSearchWork(
  search: ZombieEscapeSparseReachableSpawnSearch,
) {
  search.lastStepCandidateVisits += search.attachment.lastStepCandidateVisits
  search.lastStepAttachmentHierarchyNodeVisits +=
    search.attachment.lastStepAttachmentHierarchyNodeVisits
  search.lastStepColliderCandidateVisits += search.attachment.lastStepColliderCandidateVisits
  search.lastStepColliderHierarchyNodeVisits +=
    search.attachment.lastStepColliderHierarchyNodeVisits
  search.lastStepCollisionPredicates += search.attachment.lastStepCollisionPredicates
  search.lastStepHeapOperations += search.attachment.lastStepHeapOperations
  search.lastStepHierarchyNodeVisits += search.attachment.lastStepHierarchyNodeVisits
  search.lastStepSupportHierarchyNodeVisits += search.attachment.lastStepSupportHierarchyNodeVisits
  search.lastStepSupportHoleVisits += search.attachment.lastStepSupportHoleVisits
  search.lastStepSupportItemVisits += search.attachment.lastStepSupportItemVisits
  search.lastStepSupportPredicates += search.attachment.lastStepSupportPredicates
  search.lastStepSupportRingEdgeVisits += search.attachment.lastStepSupportRingEdgeVisits
  search.lastStepSupportRingHierarchyNodeVisits +=
    search.attachment.lastStepSupportRingHierarchyNodeVisits
  search.totalCandidateVisits += search.attachment.lastStepCandidateVisits
  search.totalAttachmentHierarchyNodeVisits +=
    search.attachment.lastStepAttachmentHierarchyNodeVisits
  search.totalColliderCandidateVisits += search.attachment.lastStepColliderCandidateVisits
  search.totalColliderHierarchyNodeVisits += search.attachment.lastStepColliderHierarchyNodeVisits
  search.totalCollisionPredicates += search.attachment.lastStepCollisionPredicates
  search.totalHeapOperations += search.attachment.lastStepHeapOperations
  search.totalHierarchyNodeVisits += search.attachment.lastStepHierarchyNodeVisits
  search.totalSupportHierarchyNodeVisits += search.attachment.lastStepSupportHierarchyNodeVisits
  search.totalSupportHoleVisits += search.attachment.lastStepSupportHoleVisits
  search.totalSupportItemVisits += search.attachment.lastStepSupportItemVisits
  search.totalSupportPredicates += search.attachment.lastStepSupportPredicates
  search.totalSupportRingEdgeVisits += search.attachment.lastStepSupportRingEdgeVisits
  search.totalSupportRingHierarchyNodeVisits +=
    search.attachment.lastStepSupportRingHierarchyNodeVisits
}

function completeZombieEscapeSparseReachableSpawnSearch(
  field: ZombieEscapeFlowField,
  search: ZombieEscapeSparseReachableSpawnSearch,
  output: ZombieEscapeReachableSpawn,
  node: number,
  reachable: boolean,
  useDesiredPosition = true,
) {
  search.phase = 'complete'
  search.status = reachable ? 'found' : 'unreachable'
  releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
  output.cell = node
  output.reachable = reachable
  output.x = reachable
    ? useDesiredPosition
      ? search.desiredX
      : field.world.navigationGraph.x[node]!
    : 0
  output.z = reachable
    ? useDesiredPosition
      ? search.desiredZ
      : field.world.navigationGraph.z[node]!
    : 0
  return search.status
}

export function createZombieEscapeSparseFlowSearch(): ZombieEscapeSparseFlowSearch {
  const search = {
    attachment: createZombieEscapeSparseAttachmentSearch(),
    blockingHit: createZombieEscapeCollisionHit(),
  } as ZombieEscapeSparseFlowSearch
  resetZombieEscapeSparseFlowSearch(search)
  return search
}

export function beginZombieEscapeSparseFlowSearch(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  sourceX: number,
  sourceZ: number,
  targetX: number,
  targetZ: number,
  sourceY = 0,
  preferredWaypointNode = -1,
  preferredWaypointUsesFallback = false,
  travelSpeedMetersPerSecond: number = ZOMBIE_ESCAPE_SIMULATION.runSpeed,
): ZombieEscapeSparseSearchStatus {
  resetZombieEscapeSparseFlowSearch(search)
  const world = field.world
  search.preferredWaypointNode = preferredWaypointNode
  search.preferredWaypointUsesFallback = preferredWaypointUsesFallback
  search.sourceY = sourceY
  search.sourceX = sourceX
  search.sourceZ = sourceZ
  search.targetX = targetX
  search.targetZ = targetZ
  search.travelSpeedMetersPerSecond = finitePositive(
    travelSpeedMetersPerSecond,
    ZOMBIE_ESCAPE_SIMULATION.runSpeed,
  )
  resetZombieEscapeSparseFlowBlockingRecord(search)
  search.routeRevision = -1
  search.worldRevision = world.revision
  if (world.navigationMode !== 'sparse') return search.status
  search.status = 'pending'
  search.phase = acquireZombieEscapeSparseAttachmentHeapSlot(search.attachment, field)
    ? 'resolve-source-layer'
    : 'wait-lease'
  return search.status
}

export function zombieEscapeSparseFlowSearchCanProgress(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
) {
  if (search.status !== 'pending') return false
  if (search.worldRevision !== field.world.revision) return true
  if (search.routeRevision >= 0 && search.routeRevision !== field.routeRevision) return true
  if (
    (search.phase === 'strict-attachment' ||
      search.phase === 'fallback-attachment' ||
      search.phase === 'wait-weighted-fallback-target' ||
      search.phase === 'wait-lease') &&
    !zombieEscapeSparseAttachmentHeapSlotIsAvailable(search.attachment, field)
  ) {
    return false
  }
  if (
    (search.phase === 'wait-strict-target' ||
      search.phase === 'wait-fallback-target' ||
      search.phase === 'wait-weighted-fallback-target') &&
    !field.graphSparseTargetUpdate.routeTargetInitialized
  ) {
    return false
  }
  if (search.phase === 'wait-strict-target') {
    const bank = activeZombieEscapeSparseReverseFieldBank(field)
    return (
      bank.routeTargetInitialized &&
      bank.targetLayerIndex >= 0 &&
      bank.targetCell !== FLOW_STRICT_UNBUILT &&
      zombieEscapeSparseAttachmentHeapSlotIsAvailable(search.attachment, field)
    )
  }
  if (search.phase === 'wait-fallback-target' || search.phase === 'wait-weighted-fallback-target') {
    const bank = activeZombieEscapeSparseReverseFieldBank(field)
    return (
      bank.routeTargetInitialized &&
      bank.targetLayerIndex >= 0 &&
      bank.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT &&
      zombieEscapeSparseAttachmentHeapSlotIsAvailable(search.attachment, field)
    )
  }
  return true
}

export function zombieEscapeSparseFlowSearchHasAttachmentHeapLease(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
) {
  return zombieEscapeSparseAttachmentHeapSlotIsHeld(search.attachment, field)
}

export function getZombieEscapeSparseFlowSearchRouteGeneration(
  search: ZombieEscapeSparseFlowSearch,
) {
  return search.routeGeneration
}

export function zombieEscapeSparseFlowSearchCanBegin(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
) {
  return (
    field.world.navigationMode === 'sparse' &&
    zombieEscapeSparseAttachmentHeapSlotIsAvailable(search.attachment, field)
  )
}

export function stepZombieEscapeSparseFlowSearch(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  output: ZombieEscapeFlowSample,
  budget: ZombieEscapeSparseSearchBudget,
  collisionHit?: ZombieEscapeCollisionHit,
): ZombieEscapeSparseSearchStatus {
  if (
    search.status === 'pending' &&
    (search.worldRevision !== field.world.revision ||
      (search.routeRevision >= 0 && search.routeRevision !== field.routeRevision))
  ) {
    return invalidateZombieEscapeSparseFlowSearch(search)
  }
  publishZombieEscapeSparseFlowBlockingRecord(search, field, output, collisionHit)
  if (zombieEscapeSparseSearchBudgetIsEmpty(budget)) return search.status
  if (
    search.status === 'pending' &&
    search.routeGeneration > 0 &&
    search.routeGeneration !== getZombieEscapeSparseCommittedRouteGeneration(field)
  ) {
    return markZombieEscapeSparseFlowSearchRoutePublished(search)
  }
  resetZombieEscapeVisibilityOwnerStepWork(search)
  search.lastStepAttachmentHierarchyNodeVisits = 0
  search.lastStepHeapOperations = 0
  search.attachment.lastStepAttachmentHierarchyNodeVisits = 0
  search.lastStepTargetBuilds = 0
  if (search.status !== 'pending') return search.status
  const world = field.world
  if (
    search.worldRevision !== world.revision ||
    (search.routeRevision >= 0 && search.routeRevision !== field.routeRevision)
  ) {
    return invalidateZombieEscapeSparseFlowSearch(search)
  }
  if (search.routeRevision >= 0 && !pinnedZombieEscapeSparseReverseFieldBank(search.attachment)) {
    return invalidateZombieEscapeSparseFlowSearch(search)
  }
  const maximumHierarchyNodeVisits = normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits)
  const maximumCandidateVisits = normalizeSparseSearchBudget(budget.maximumCandidateVisits)
  const maximumSupportPredicates = normalizeSparseSearchBudget(budget.maximumSupportPredicates)
  const maximumCollisionPredicates = normalizeSparseSearchBudget(budget.maximumCollisionPredicates)
  const maximumHeapOperations = normalizeSparseSearchBudget(budget.maximumHeapOperations)

  while (search.status === 'pending') {
    if (search.phase === 'wait-lease') {
      if (!acquireZombieEscapeSparseAttachmentHeapSlot(search.attachment, field)) {
        return search.status
      }
      search.phase = 'resolve-source-layer'
      continue
    }
    if (search.phase === 'resolve-source-layer') {
      if (search.layerOffset >= world.navigationLayers.length) {
        const nearestLayer = world.navigationLayers[search.sourceLayerIndex]
        if (
          nearestLayer &&
          Math.abs(nearestLayer.elevation - search.sourceY) <=
            NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS
        ) {
          search.phase = 'initialize'
          continue
        }
        search.bestLayerDistance = Number.POSITIVE_INFINITY
        search.layerOffset = 0
        search.sourceLayerIndex = -1
        search.phase = 'resolve-source-support'
        continue
      }
      if (search.lastStepCandidateVisits >= maximumCandidateVisits) return search.status
      const layerIndex = search.layerOffset
      const distance = Math.abs(world.navigationLayers[layerIndex]!.elevation - search.sourceY)
      search.layerOffset += 1
      search.lastStepCandidateVisits += 1
      search.totalCandidateVisits += 1
      if (distance < search.bestLayerDistance) {
        search.bestLayerDistance = distance
        search.sourceLayerIndex = layerIndex
      }
      continue
    }
    if (search.phase === 'resolve-source-support') {
      if (search.layerOffset >= world.navigationLayers.length) {
        search.phase = 'initialize'
        continue
      }
      if (search.lastStepSupportPredicates >= maximumSupportPredicates) return search.status
      const layerIndex = search.layerOffset
      const layer = world.navigationLayers[layerIndex]!
      search.layerOffset += 1
      search.lastStepSupportPredicates += 1
      search.totalSupportPredicates += 1
      if (
        layer.elevation > search.sourceY + NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS ||
        !navigationLayerSupportsPoint(world, layerIndex, search.sourceX, search.sourceZ)
      ) {
        continue
      }
      const distance = Math.abs(search.sourceY - layer.elevation)
      if (distance < search.bestLayerDistance) {
        search.bestLayerDistance = distance
        search.sourceLayerIndex = layerIndex
      }
      continue
    }
    if (
      search.phase === 'wait-strict-target' ||
      search.phase === 'wait-fallback-target' ||
      search.phase === 'wait-weighted-fallback-target'
    ) {
      const weightedFallback = search.phase === 'wait-weighted-fallback-target'
      const fallback = search.phase !== 'wait-strict-target'
      const bank = activeZombieEscapeSparseReverseFieldBank(field)
      const built = fallback
        ? bank.routeTargetInitialized &&
          bank.targetLayerIndex >= 0 &&
          bank.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT
        : bank.routeTargetInitialized &&
          bank.targetLayerIndex >= 0 &&
          bank.targetCell !== FLOW_STRICT_UNBUILT
      if (!built) {
        requestZombieEscapeSparseTargetBuild(field, fallback)
        return search.status
      }
      if (!acquireZombieEscapeSparseAttachmentHeapSlot(search.attachment, field)) {
        return search.status
      }
      search.lastStepTargetBuilds += 1
      search.totalTargetBuilds += 1
      if (weightedFallback) beginZombieEscapeSparseWeightedFallbackAttachment(search, field)
      else beginZombieEscapeSparseCachedWaypointSearch(search, field, fallback)
      continue
    }
    if (search.phase === 'initialize') {
      resetZombieEscapeSparseFlowBlockingRecord(search)
      resetZombieEscapeFlowBlockingSample(output, search.sourceX, search.sourceZ)
      publishZombieEscapeSparseFlowBlockingRecord(search, field, output, collisionHit)
      output.waypointNode = -1
      output.waypointUsesFallback = false
      if (search.sourceLayerIndex < 0) {
        return completeZombieEscapeSparseFlowSearch(search, output, -1, false)
      }
      const bank = acquireZombieEscapeSparseReverseFieldBankLease(search.attachment, field)
      if (
        !bank?.routeTargetInitialized ||
        bank.targetLayerIndex < 0 ||
        bank.targetCell === FLOW_STRICT_UNBUILT
      ) {
        requestZombieEscapeSparseTargetBuild(field, false)
        releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
        search.phase = 'wait-strict-target'
        return search.status
      }
      search.routeRevision = field.routeRevision
      search.routeGeneration = bank.generation
      const effectiveTarget = resolveZombieEscapeSparseEffectiveCommittedTargetForBank(field, bank)
      search.targetX = effectiveTarget.routeTargetX
      search.targetZ = effectiveTarget.routeTargetZ
      const directX = search.targetX - search.sourceX
      const directZ = search.targetZ - search.sourceZ
      const directLength = Math.hypot(directX, directZ)
      if (
        search.sourceLayerIndex === bank.targetLayerIndex &&
        directLength <= INTERSECTION_EPSILON
      ) {
        output.x = 0
        output.z = 0
        output.reachable = true
        return completeZombieEscapeSparseFlowSearch(search, output, -1, false, true)
      }
      if (search.sourceLayerIndex === bank.targetLayerIndex) {
        search.phase = 'direct'
        continue
      }
      beginZombieEscapeSparseCachedWaypointSearch(search, field, false)
      continue
    }

    if (search.phase === 'direct') {
      beginZombieEscapeNavigationVisibilitySearch(
        world,
        search.attachment.visibility,
        search.sourceLayerIndex,
        search.sourceX,
        search.sourceZ,
        search.targetX,
        search.targetZ,
        world.agentRadius,
      )
      search.phase = 'direct-visibility'
      continue
    }

    if (search.phase === 'direct-visibility') {
      const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
        world,
        search.attachment.visibility,
        search,
        maximumCandidateVisits,
        maximumCollisionPredicates,
        maximumHierarchyNodeVisits,
        maximumSupportPredicates,
      )
      if (visibilityStatus === 'pending') return search.status
      if (visibilityStatus === 'invalidated') return invalidateZombieEscapeSparseFlowSearch(search)
      const directX = search.targetX - search.sourceX
      const directZ = search.targetZ - search.sourceZ
      const directLength = Math.hypot(directX, directZ)
      recordZombieEscapeSparseFlowBlockingRecord(
        search,
        search.attachment.visibility.collisionHit,
        directX,
        directZ,
      )
      publishZombieEscapeSparseFlowBlockingRecord(search, field, output, collisionHit)
      if (visibilityStatus === 'clear') {
        output.x = directX / directLength
        output.z = directZ / directLength
        output.reachable = true
        return completeZombieEscapeSparseFlowSearch(search, output, -1, false, true)
      }
      beginZombieEscapeSparseCachedWaypointSearch(search, field, false)
      continue
    }

    if (search.phase === 'cached-strict-start' || search.phase === 'cached-fallback-start') {
      if (search.preferredWaypointNode < 0) {
        beginZombieEscapeSparseFlowSearchAfterCachedMiss(search, field)
        continue
      }
      if (search.lastStepCandidateVisits >= maximumCandidateVisits) return search.status
      search.lastStepCandidateVisits += 1
      search.totalCandidateVisits += 1
      const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
      if (!bank || search.attachment.reverseFieldDistanceVariant < 0) {
        return invalidateZombieEscapeSparseFlowSearch(search)
      }
      const distances = zombieEscapeSparseReverseFieldDistances(
        bank,
        search.attachment.reverseFieldDistanceVariant,
      )
      const graph = world.navigationGraph
      const waypointNode = search.preferredWaypointNode
      if (
        waypointNode >= graph.nodeIds.length ||
        graph.layerIndices[waypointNode] !== search.sourceLayerIndex ||
        !Number.isFinite(distances[waypointNode]!)
      ) {
        beginZombieEscapeSparseFlowSearchAfterCachedMiss(search, field)
        continue
      }
      search.cachedOriginalNode = waypointNode
      search.cachedVisibleNode = waypointNode
      const distance = Math.hypot(
        graph.x[waypointNode]! - search.sourceX,
        graph.z[waypointNode]! - search.sourceZ,
      )
      if (distance <= Math.max(0.08, world.agentRadius * 0.5)) {
        search.phase = 'cached-string-pull'
        continue
      }
      beginZombieEscapeSparseFlowNodeVisibility(search, world, waypointNode)
      search.phase = 'cached-validate'
      continue
    }

    if (search.phase === 'cached-string-pull') {
      if (search.lastStepHierarchyNodeVisits >= maximumHierarchyNodeVisits) return search.status
      search.lastStepHierarchyNodeVisits += 1
      search.totalHierarchyNodeVisits += 1
      const graph = world.navigationGraph
      const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
      if (!bank || search.attachment.reverseFieldDistanceVariant < 0) {
        return invalidateZombieEscapeSparseFlowSearch(search)
      }
      const distances = zombieEscapeSparseReverseFieldDistances(
        bank,
        search.attachment.reverseFieldDistanceVariant,
      )
      const nextNodes = zombieEscapeSparseReverseFieldNextNodes(
        bank,
        search.attachment.reverseFieldDistanceVariant,
      )
      const nextNode = nextNodes[search.cachedVisibleNode]!
      if (
        nextNode < 0 ||
        graph.layerIndices[nextNode] !== search.sourceLayerIndex ||
        !Number.isFinite(distances[nextNode]!)
      ) {
        beginZombieEscapeSparseFlowWaypointCompletion(
          search,
          field,
          search.cachedVisibleNode,
          search.cachedUsesFallback,
        )
        continue
      }
      search.cachedNextNode = nextNode
      beginZombieEscapeSparseFlowNodeVisibility(search, world, nextNode)
      search.phase = 'cached-next-visibility'
      continue
    }

    if (search.phase === 'cached-next-visibility' || search.phase === 'cached-validate') {
      const visibilityPhase = search.phase
      const node =
        visibilityPhase === 'cached-next-visibility'
          ? search.cachedNextNode
          : search.cachedOriginalNode
      const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
        world,
        search.attachment.visibility,
        search,
        maximumCandidateVisits,
        maximumCollisionPredicates,
        maximumHierarchyNodeVisits,
        maximumSupportPredicates,
      )
      if (visibilityStatus === 'pending') return search.status
      if (visibilityStatus === 'invalidated') return invalidateZombieEscapeSparseFlowSearch(search)
      if (visibilityPhase === 'cached-next-visibility') {
        if (visibilityStatus === 'clear') {
          search.cachedVisibleNode = node
          search.phase = 'cached-string-pull'
          continue
        }
        beginZombieEscapeSparseFlowWaypointCompletion(
          search,
          field,
          search.cachedVisibleNode,
          search.cachedUsesFallback,
        )
        continue
      }
      if (visibilityStatus === 'clear') {
        if (
          !search.cachedUsesFallback &&
          search.preferredWaypointUsesFallback &&
          zombieEscapeSparsePreferredWaypointChoosesFallback(
            search,
            field,
            search.cachedOriginalNode,
          )
        ) {
          beginZombieEscapeSparseCachedWaypointSearch(search, field, true)
          continue
        }
        beginZombieEscapeSparseFlowWaypointCompletion(
          search,
          field,
          search.cachedOriginalNode,
          search.cachedUsesFallback,
        )
        continue
      }
      beginZombieEscapeSparseFlowSearchAfterCachedMiss(search, field)
      continue
    }

    if (search.phase === 'waypoint-target-visibility') {
      const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
        world,
        search.attachment.visibility,
        search,
        maximumCandidateVisits,
        maximumCollisionPredicates,
        maximumHierarchyNodeVisits,
        maximumSupportPredicates,
      )
      if (visibilityStatus === 'pending') return search.status
      if (visibilityStatus === 'invalidated') return invalidateZombieEscapeSparseFlowSearch(search)
      if (visibilityStatus === 'clear') {
        output.waypointNode = search.waypointNode
        output.waypointUsesFallback = true
        writeZombieEscapeSparseFlowTowardTarget(
          search.sourceX,
          search.sourceZ,
          search.targetX,
          search.targetZ,
          output,
        )
        const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
        search.cachedVisibleNode = search.waypointNode
        if (
          !bank ||
          !stampZombieEscapeSparseFlowSearchRouteCorridor(
            search,
            field,
            bank,
            search.waypointNode,
            true,
          )
        ) {
          return invalidateZombieEscapeSparseFlowSearch(search)
        }
        return completeZombieEscapeSparseFlowSearch(search, output, search.waypointNode, true, true)
      }
      search.phase = 'waypoint-finalize'
      continue
    }

    if (search.phase === 'waypoint-blocking-visibility') {
      const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
        world,
        search.attachment.visibility,
        search,
        maximumCandidateVisits,
        maximumCollisionPredicates,
        maximumHierarchyNodeVisits,
        maximumSupportPredicates,
      )
      if (visibilityStatus === 'pending') return search.status
      if (visibilityStatus === 'invalidated') return invalidateZombieEscapeSparseFlowSearch(search)
      const graph = world.navigationGraph
      const waypointX = graph.x[search.waypointNode]!
      const waypointZ = graph.z[search.waypointNode]!
      if (visibilityStatus === 'blocked') {
        recordZombieEscapeSparseFlowBlockingRecord(
          search,
          search.attachment.visibility.collisionHit,
          waypointX - search.sourceX,
          waypointZ - search.sourceZ,
        )
      } else if (!isZombieEscapeCollisionHitBreakable(world, search.blockingHit)) {
        resetZombieEscapeSparseFlowBlockingRecord(search)
      }
      publishZombieEscapeSparseFlowBlockingRecord(search, field, output, collisionHit)
      return completeZombieEscapeSparseFlowFromWaypoint(field, search, output)
    }

    if (search.phase === 'waypoint-finalize') {
      const graph = world.navigationGraph
      const waypointX = graph.x[search.waypointNode]!
      const waypointZ = graph.z[search.waypointNode]!
      const waypointDirectionX = waypointX - search.sourceX
      const waypointDirectionZ = waypointZ - search.sourceZ
      const waypointDistance = Math.hypot(waypointDirectionX, waypointDirectionZ)
      if (search.waypointUsesFallback && waypointDistance > INTERSECTION_EPSILON) {
        beginZombieEscapeNavigationVisibilitySearch(
          world,
          search.attachment.visibility,
          search.sourceLayerIndex,
          search.sourceX,
          search.sourceZ,
          waypointX,
          waypointZ,
          world.agentRadius,
        )
        search.phase = 'waypoint-blocking-visibility'
        continue
      }
      return completeZombieEscapeSparseFlowFromWaypoint(field, search, output)
    }

    const usesFallback = search.phase === 'fallback-attachment'
    const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
    if (!bank || search.attachment.reverseFieldDistanceVariant < 0) {
      return invalidateZombieEscapeSparseFlowSearch(search)
    }
    const distances = zombieEscapeSparseReverseFieldCosts(
      bank,
      search.attachment.reverseFieldDistanceVariant,
    )
    resetZombieEscapeVisibilityOwnerStepWork(search.attachment)
    search.attachment.lastStepAttachmentHierarchyNodeVisits = 0
    search.attachment.lastStepHeapOperations = 0
    const attachmentStatus = stepZombieEscapeSparseAttachmentSearchWithinLimits(
      search.attachment,
      field,
      distances,
      Math.max(0, maximumHierarchyNodeVisits - search.lastStepHierarchyNodeVisits),
      Math.max(0, maximumCandidateVisits - search.lastStepCandidateVisits),
      Math.max(0, maximumSupportPredicates - search.lastStepSupportPredicates),
      Math.max(0, maximumCollisionPredicates - search.lastStepCollisionPredicates),
      Math.max(0, maximumHeapOperations - search.lastStepHeapOperations),
    )
    accumulateZombieEscapeSparseFlowSearchWork(search)
    if (attachmentStatus === 'pending') return search.status
    if (attachmentStatus === 'invalidated') return invalidateZombieEscapeSparseFlowSearch(search)
    if (attachmentStatus === 'found') {
      const waypointNode = search.attachment.bestNode
      if (!usesFallback) {
        search.strictAttachmentDistance = search.attachment.bestAttachmentDistance
        search.strictRouteDistance = search.attachment.bestRouteDistance
        search.strictWaypointNode = waypointNode
        beginZombieEscapeSparseWeightedFallbackAttachment(search, field)
        continue
      }
      const choosesFallback = zombieEscapeSparseWeightedRouteChoosesFallback(search)
      beginZombieEscapeSparseFlowWaypointCompletion(
        search,
        field,
        choosesFallback ? waypointNode : search.strictWaypointNode,
        choosesFallback,
      )
      continue
    }
    if (usesFallback) {
      if (search.strictWaypointNode >= 0) {
        beginZombieEscapeSparseFlowWaypointCompletion(
          search,
          field,
          search.strictWaypointNode,
          false,
        )
        continue
      }
      return completeZombieEscapeSparseFlowSearch(search, output, -1, false)
    }
    beginZombieEscapeSparseCachedWaypointSearch(search, field, true)
  }
  return search.status
}

function beginZombieEscapeSparseWeightedFallbackAttachment(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
) {
  const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
  if (!bank) {
    invalidateZombieEscapeSparseFlowSearch(search)
    return
  }
  if (search.routeGeneration > 0 && search.routeGeneration !== bank.generation) {
    markZombieEscapeSparseFlowSearchRoutePublished(search)
    return
  }
  if (bank.fallbackTargetCell === FLOW_FALLBACK_UNBUILT) {
    requestZombieEscapeSparseTargetBuild(field, true)
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    search.phase = 'wait-weighted-fallback-target'
    return
  }
  const distances = zombieEscapeSparseReverseFieldCosts(
    bank,
    zombieEscapeSparseReverseFieldVariant(search.sourceLayerIndex, bank.targetLayerIndex, true),
  )
  beginZombieEscapeSparseAttachmentSearch(
    search.attachment,
    field,
    distances,
    search.sourceLayerIndex,
    search.sourceX,
    search.sourceZ,
    true,
    true,
  )
  search.phase = 'fallback-attachment'
}

function zombieEscapeSparseRouteCostSeconds(
  routeDistanceMeters: number,
  travelSpeedMetersPerSecond: number,
  breachCount: number,
) {
  const travelSeconds = routeDistanceMeters / travelSpeedMetersPerSecond
  return travelSeconds + breachCount * ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS
}

function zombieEscapeSparseWeightedRouteChoosesFallback(search: ZombieEscapeSparseFlowSearch) {
  if (search.strictWaypointNode < 0) return true
  const fallbackBreachCount =
    search.attachment.bestAttachmentBreachCount + search.attachment.bestRouteBreachCount
  if (fallbackBreachCount <= 0) return false
  const strictCost = zombieEscapeSparseRouteCostSeconds(
    search.strictAttachmentDistance + search.strictRouteDistance,
    search.travelSpeedMetersPerSecond,
    0,
  )
  const fallbackCost = zombieEscapeSparseRouteCostSeconds(
    search.attachment.bestAttachmentDistance + search.attachment.bestRouteTravelDistance,
    search.travelSpeedMetersPerSecond,
    fallbackBreachCount,
  )
  return fallbackCost < strictCost - INTERSECTION_EPSILON
}

function zombieEscapeSparsePreferredWaypointChoosesFallback(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  waypointNode: number,
) {
  const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
  if (!bank) return false
  const strictDistance = zombieEscapeSparseReverseFieldDistances(
    bank,
    zombieEscapeSparseReverseFieldVariant(search.sourceLayerIndex, bank.targetLayerIndex, false),
  )[waypointNode]!
  const fallbackDistance = zombieEscapeSparseReverseFieldDistances(
    bank,
    zombieEscapeSparseReverseFieldVariant(search.sourceLayerIndex, bank.targetLayerIndex, true),
  )[waypointNode]!
  const fallbackBreachCount =
    zombieEscapeSparseReverseFieldBreachCounts(
      bank,
      zombieEscapeSparseReverseFieldVariant(search.sourceLayerIndex, bank.targetLayerIndex, true),
    )?.[waypointNode] ?? 0
  return (
    Number.isFinite(fallbackDistance) &&
    (!Number.isFinite(strictDistance) ||
      (fallbackBreachCount > 0 &&
        zombieEscapeSparseRouteCostSeconds(
          fallbackDistance,
          search.travelSpeedMetersPerSecond,
          fallbackBreachCount,
        ) <
          zombieEscapeSparseRouteCostSeconds(strictDistance, search.travelSpeedMetersPerSecond, 0) -
            INTERSECTION_EPSILON))
  )
}

function beginZombieEscapeSparseCachedWaypointSearch(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  usesFallback: boolean,
) {
  search.cachedNextNode = -1
  search.cachedOriginalNode = -1
  search.cachedUsesFallback = usesFallback
  search.cachedVisibleNode = -1
  const bank = acquireZombieEscapeSparseReverseFieldBankLease(search.attachment, field)
  if (!bank) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    return
  }
  if (search.routeGeneration > 0 && search.routeGeneration !== bank.generation) {
    markZombieEscapeSparseFlowSearchRoutePublished(search)
    return
  }
  const built = usesFallback
    ? bank.routeTargetInitialized &&
      bank.targetLayerIndex >= 0 &&
      bank.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT
    : bank.routeTargetInitialized &&
      bank.targetLayerIndex >= 0 &&
      bank.targetCell !== FLOW_STRICT_UNBUILT
  if (!built) {
    requestZombieEscapeSparseTargetBuild(field, usesFallback)
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    search.phase = usesFallback ? 'wait-fallback-target' : 'wait-strict-target'
    return
  }
  search.attachment.reverseFieldDistanceVariant = zombieEscapeSparseReverseFieldVariant(
    search.sourceLayerIndex,
    bank.targetLayerIndex,
    usesFallback,
  )
  search.routeGeneration = bank.generation
  search.routeRevision = field.routeRevision
  const effectiveTarget = resolveZombieEscapeSparseEffectiveCommittedTargetForBank(field, bank)
  search.targetX = effectiveTarget.routeTargetX
  search.targetZ = effectiveTarget.routeTargetZ
  search.phase = usesFallback ? 'cached-fallback-start' : 'cached-strict-start'
}

function beginZombieEscapeSparseFlowNodeVisibility(
  search: ZombieEscapeSparseFlowSearch,
  world: ZombieEscapeCollisionWorld,
  node: number,
) {
  beginZombieEscapeNavigationVisibilitySearch(
    world,
    search.attachment.visibility,
    search.sourceLayerIndex,
    search.sourceX,
    search.sourceZ,
    world.navigationGraph.x[node]!,
    world.navigationGraph.z[node]!,
    world.agentRadius,
    search.cachedUsesFallback,
  )
}

function beginZombieEscapeSparseFlowSearchAfterCachedMiss(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
) {
  const usesFallback = search.cachedUsesFallback
  const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
  if (!bank || search.attachment.reverseFieldDistanceVariant < 0) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    return
  }
  const built = usesFallback
    ? bank.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT
    : bank.targetCell !== FLOW_STRICT_UNBUILT
  if (!built) {
    requestZombieEscapeSparseTargetBuild(field, usesFallback)
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    search.phase = usesFallback ? 'wait-fallback-target' : 'wait-strict-target'
    return
  }
  beginZombieEscapeSparseAttachmentSearch(
    search.attachment,
    field,
    zombieEscapeSparseReverseFieldCosts(bank, search.attachment.reverseFieldDistanceVariant),
    search.sourceLayerIndex,
    search.sourceX,
    search.sourceZ,
    usesFallback,
    true,
  )
  search.phase = usesFallback ? 'fallback-attachment' : 'strict-attachment'
}

function beginZombieEscapeSparseFlowWaypointCompletion(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  waypointNode: number,
  usesFallback: boolean,
) {
  search.waypointNode = waypointNode
  search.waypointUsesFallback = usesFallback
  const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
  if (!bank || search.attachment.reverseFieldDistanceVariant < 0) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
    return
  }
  const sameLayer = search.sourceLayerIndex === bank.targetLayerIndex
  const nextNodes = zombieEscapeSparseReverseFieldNextNodes(
    bank,
    search.attachment.reverseFieldDistanceVariant,
  )
  if (
    usesFallback &&
    sameLayer &&
    nextNodes[waypointNode] === -1 &&
    search.attachment.bestAttachmentBreachCount === 0
  ) {
    beginZombieEscapeNavigationVisibilitySearch(
      field.world,
      search.attachment.visibility,
      search.sourceLayerIndex,
      search.sourceX,
      search.sourceZ,
      search.targetX,
      search.targetZ,
      field.world.agentRadius,
      true,
    )
    search.phase = 'waypoint-target-visibility'
    return
  }
  search.phase = 'waypoint-finalize'
}

function writeZombieEscapeSparseFlowDirectionFromWaypoint(
  field: ZombieEscapeFlowField,
  bank: ZombieEscapeSparseReverseFieldBank,
  sourceLayerIndex: number,
  x: number,
  z: number,
  output: ZombieEscapeFlowSample,
  bestNode: number,
  usesFallback: boolean,
) {
  const nextNodes = zombieEscapeSparseReverseFieldNextNodes(
    bank,
    zombieEscapeSparseReverseFieldVariant(sourceLayerIndex, bank.targetLayerIndex, usesFallback),
  )
  output.waypointNode = bestNode
  output.waypointUsesFallback = usesFallback
  const graph = field.world.navigationGraph
  const nextNode = nextNodes[bestNode]!
  const connectorIndex = graph.connectorIndices[bestNode]!
  if (connectorIndex >= 0 && nextNode >= 0 && graph.layerIndices[nextNode] !== sourceLayerIndex) {
    const targetEnd = graph.connectorEnds[bestNode] !== 0
    const connector = field.world.navigationConnectors[connectorIndex]
    const sourceY = field.world.navigationLayers[sourceLayerIndex]?.elevation
    if (connector && sourceY !== undefined) {
      const directionAmount = targetEnd ? 1 : -1
      const connectorDirectionX = connector.directionX * directionAmount
      const connectorDirectionZ = connector.directionZ * directionAmount
      if (
        zombieEscapeNavigationConnectorRequestCanActivate(
          field.world,
          connector,
          targetEnd,
          x,
          sourceY,
          z,
          connectorDirectionX,
          connectorDirectionZ,
        )
      ) {
        output.connectorIndex = connectorIndex
        output.connectorTargetEnd = targetEnd
        output.x = connectorDirectionX
        output.z = connectorDirectionZ
        output.reachable = true
        return output
      }
    }
  }

  const waypointX = graph.x[bestNode]!
  const waypointZ = graph.z[bestNode]!
  const waypointDirectionX = waypointX - x
  const waypointDirectionZ = waypointZ - z
  const waypointDistance = Math.hypot(waypointDirectionX, waypointDirectionZ)
  output.x = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionX / waypointDistance : 0
  output.z = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionZ / waypointDistance : 0
  output.reachable = true
  return output
}

function completeZombieEscapeSparseFlowFromWaypoint(
  field: ZombieEscapeFlowField,
  search: ZombieEscapeSparseFlowSearch,
  output: ZombieEscapeFlowSample,
) {
  const bank = pinnedZombieEscapeSparseReverseFieldBank(search.attachment)
  if (!bank) return invalidateZombieEscapeSparseFlowSearch(search)
  writeZombieEscapeSparseFlowDirectionFromWaypoint(
    field,
    bank,
    search.sourceLayerIndex,
    search.sourceX,
    search.sourceZ,
    output,
    search.waypointNode,
    search.waypointUsesFallback,
  )
  search.cachedVisibleNode = output.waypointNode ?? -1
  if (
    !stampZombieEscapeSparseFlowSearchRouteCorridor(
      search,
      field,
      bank,
      search.cachedOriginalNode >= 0 ? search.cachedOriginalNode : search.cachedVisibleNode,
      output.waypointUsesFallback === true,
    )
  ) {
    return invalidateZombieEscapeSparseFlowSearch(search)
  }
  return completeZombieEscapeSparseFlowSearch(
    search,
    output,
    search.waypointNode,
    search.waypointUsesFallback,
    true,
  )
}

function accumulateZombieEscapeSparseFlowSearchWork(search: ZombieEscapeSparseFlowSearch) {
  search.lastStepCandidateVisits += search.attachment.lastStepCandidateVisits
  search.lastStepAttachmentHierarchyNodeVisits +=
    search.attachment.lastStepAttachmentHierarchyNodeVisits
  search.lastStepColliderCandidateVisits += search.attachment.lastStepColliderCandidateVisits
  search.lastStepColliderHierarchyNodeVisits +=
    search.attachment.lastStepColliderHierarchyNodeVisits
  search.lastStepCollisionPredicates += search.attachment.lastStepCollisionPredicates
  search.lastStepHeapOperations += search.attachment.lastStepHeapOperations
  search.lastStepHierarchyNodeVisits += search.attachment.lastStepHierarchyNodeVisits
  search.lastStepSupportHierarchyNodeVisits += search.attachment.lastStepSupportHierarchyNodeVisits
  search.lastStepSupportHoleVisits += search.attachment.lastStepSupportHoleVisits
  search.lastStepSupportItemVisits += search.attachment.lastStepSupportItemVisits
  search.lastStepSupportPredicates += search.attachment.lastStepSupportPredicates
  search.lastStepSupportRingEdgeVisits += search.attachment.lastStepSupportRingEdgeVisits
  search.lastStepSupportRingHierarchyNodeVisits +=
    search.attachment.lastStepSupportRingHierarchyNodeVisits
  search.totalCandidateVisits += search.attachment.lastStepCandidateVisits
  search.totalAttachmentHierarchyNodeVisits +=
    search.attachment.lastStepAttachmentHierarchyNodeVisits
  search.totalColliderCandidateVisits += search.attachment.lastStepColliderCandidateVisits
  search.totalColliderHierarchyNodeVisits += search.attachment.lastStepColliderHierarchyNodeVisits
  search.totalCollisionPredicates += search.attachment.lastStepCollisionPredicates
  search.totalHeapOperations += search.attachment.lastStepHeapOperations
  search.totalHierarchyNodeVisits += search.attachment.lastStepHierarchyNodeVisits
  search.totalSupportHierarchyNodeVisits += search.attachment.lastStepSupportHierarchyNodeVisits
  search.totalSupportHoleVisits += search.attachment.lastStepSupportHoleVisits
  search.totalSupportItemVisits += search.attachment.lastStepSupportItemVisits
  search.totalSupportPredicates += search.attachment.lastStepSupportPredicates
  search.totalSupportRingEdgeVisits += search.attachment.lastStepSupportRingEdgeVisits
  search.totalSupportRingHierarchyNodeVisits +=
    search.attachment.lastStepSupportRingHierarchyNodeVisits
}

function completeZombieEscapeSparseFlowSearch(
  search: ZombieEscapeSparseFlowSearch,
  output: ZombieEscapeFlowSample,
  waypointNode: number,
  waypointUsesFallback: boolean,
  reachable = false,
) {
  search.phase = 'complete'
  search.status = reachable ? 'found' : 'unreachable'
  search.waypointNode = waypointNode
  search.waypointUsesFallback = waypointUsesFallback
  if (!reachable) {
    clearZombieEscapeSparseFlowSearchRouteCorridor(search)
    output.x = 0
    output.z = 0
    output.reachable = false
    output.waypointNode = -1
    output.waypointUsesFallback = false
  }
  releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
  return search.status
}

function invalidateZombieEscapeSparseFlowSearch(search: ZombieEscapeSparseFlowSearch) {
  search.phase = 'complete'
  search.status = 'invalidated'
  clearZombieEscapeSparseFlowSearchRouteCorridor(search)
  releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
  return search.status
}

function markZombieEscapeSparseFlowSearchRoutePublished(search: ZombieEscapeSparseFlowSearch) {
  search.phase = 'complete'
  search.status = 'routePublished'
  clearZombieEscapeSparseFlowSearchRouteCorridor(search)
  releaseZombieEscapeSparseAttachmentHeapSlot(search.attachment)
  return search.status
}

export function resetZombieEscapeSparseFlowSearch(search: ZombieEscapeSparseFlowSearch) {
  resetZombieEscapeSparseAttachmentSearch(search.attachment)
  search.blockingHit ??= createZombieEscapeCollisionHit()
  resetCollisionHit(search.blockingHit)
  search.blockingDistance = Number.POSITIVE_INFINITY
  search.blockingX = 0
  search.blockingZ = 0
  search.cachedNextNode = -1
  search.cachedOriginalNextNode = -1
  search.cachedOriginalNode = -1
  search.cachedUsesFallback = false
  search.cachedVisibleNode = -1
  search.bestLayerDistance = Number.POSITIVE_INFINITY
  search.lastStepAttachmentHierarchyNodeVisits = 0
  search.lastStepCandidateVisits = 0
  search.lastStepColliderCandidateVisits = 0
  search.lastStepColliderHierarchyNodeVisits = 0
  search.lastStepCollisionPredicates = 0
  search.lastStepHeapOperations = 0
  search.lastStepHierarchyNodeVisits = 0
  search.lastStepSupportHierarchyNodeVisits = 0
  search.lastStepSupportHoleVisits = 0
  search.lastStepSupportItemVisits = 0
  search.lastStepSupportPredicates = 0
  search.lastStepSupportRingEdgeVisits = 0
  search.lastStepSupportRingHierarchyNodeVisits = 0
  search.lastStepTargetBuilds = 0
  search.lastRouteCorridorSuccessorVisits = 0
  search.maximumRouteCorridorSuccessorVisits = 0
  search.layerOffset = 0
  search.phase = 'complete'
  search.preferredWaypointNode = -1
  search.preferredWaypointUsesFallback = false
  search.routeCorridorGeneration = 0
  search.routeCorridorSourceLayerIndex = -1
  search.routeCorridorTargetLayerIndex = -1
  search.routeCorridorUsesFallback = false
  search.routeCorridorWorldRevision = ''
  search.routeGeneration = 0
  search.routeRevision = -1
  search.sourceLayerIndex = -1
  search.sourceY = 0
  search.sourceX = 0
  search.sourceZ = 0
  search.status = 'unreachable'
  search.strictAttachmentDistance = Number.POSITIVE_INFINITY
  search.strictRouteDistance = Number.POSITIVE_INFINITY
  search.strictWaypointNode = -1
  search.targetX = 0
  search.targetZ = 0
  search.totalAttachmentHierarchyNodeVisits = 0
  search.totalCandidateVisits = 0
  search.totalColliderCandidateVisits = 0
  search.totalColliderHierarchyNodeVisits = 0
  search.totalCollisionPredicates = 0
  search.totalHeapOperations = 0
  search.totalHierarchyNodeVisits = 0
  search.totalSupportHierarchyNodeVisits = 0
  search.totalSupportHoleVisits = 0
  search.totalSupportItemVisits = 0
  search.totalSupportPredicates = 0
  search.totalSupportRingEdgeVisits = 0
  search.totalSupportRingHierarchyNodeVisits = 0
  search.totalTargetBuilds = 0
  search.totalRouteCorridorSuccessorVisits = 0
  search.travelSpeedMetersPerSecond = ZOMBIE_ESCAPE_SIMULATION.runSpeed
  search.waypointNode = -1
  search.waypointUsesFallback = false
  search.worldRevision = ''
}

export function followZombieEscapeCachedSparseWaypoint(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  sourceY: number,
  output: ZombieEscapeFlowSample,
): boolean
export function followZombieEscapeCachedSparseWaypoint(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  sourceY: number,
  output: ZombieEscapeFlowSample,
  search: ZombieEscapeSparseFlowSearch,
  budget: ZombieEscapeSparseSearchBudget,
  requireRadialArrival?: boolean,
): ZombieEscapeSparseCachedWaypointStatus
export function followZombieEscapeCachedSparseWaypoint(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  sourceY: number,
  output: ZombieEscapeFlowSample,
  search?: ZombieEscapeSparseFlowSearch,
  budget?: ZombieEscapeSparseSearchBudget,
  requireRadialArrival = false,
): ZombieEscapeSparseCachedWaypointStatus | boolean {
  if (
    search?.status !== 'pending' &&
    writeZombieEscapeActiveConnectorDirection(field.world, x, sourceY, z, output)
  ) {
    return search && budget ? 'followed' : true
  }
  if (search && budget) {
    if (zombieEscapeSparseCachedWaypointBudgetIsEmpty(budget)) {
      if (search.status === 'pending') return 'pending'
      const classification = classifyZombieEscapeCachedSparseWaypoint(field, x, z, sourceY, output)
      if (classification === 'held') return writeZombieEscapeHeldSparseWaypoint(x, z, output)
      if (classification !== 'followed') return 'refresh'
      return writeZombieEscapeCachedSparseWaypoint(
        field,
        x,
        z,
        output,
        requireRadialArrival,
        search,
      )
    }
    return stepZombieEscapeCachedSparseWaypoint(
      field,
      x,
      z,
      sourceY,
      output,
      search,
      budget,
      requireRadialArrival,
    )
  }
  const synchronousSearch = field.graphSparseFlowSearch
  let status = stepZombieEscapeCachedSparseWaypoint(
    field,
    x,
    z,
    sourceY,
    output,
    synchronousSearch,
    UNBOUNDED_SPARSE_SEARCH_BUDGET,
  )
  while (status === 'pending') {
    stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET)
    status = stepZombieEscapeCachedSparseWaypoint(
      field,
      x,
      z,
      sourceY,
      output,
      synchronousSearch,
      UNBOUNDED_SPARSE_SEARCH_BUDGET,
    )
  }
  return status === 'followed'
}

function zombieEscapeSparseCachedWaypointBudgetIsEmpty(budget: ZombieEscapeSparseSearchBudget) {
  const targetBudget = budget as ZombieEscapeSparseSearchBudget &
    Partial<
      Pick<ZombieEscapeSparseTargetUpdateBudget, 'maximumGraphEdgeVisits' | 'maximumHeapOperations'>
    >
  return (
    normalizeSparseSearchBudget(budget.maximumCandidateVisits) === 0 &&
    normalizeSparseSearchBudget(budget.maximumCollisionPredicates) === 0 &&
    normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits) === 0 &&
    normalizeSparseSearchBudget(budget.maximumSupportPredicates) === 0 &&
    normalizeSparseSearchBudget(targetBudget.maximumGraphEdgeVisits ?? 0) === 0 &&
    normalizeSparseSearchBudget(targetBudget.maximumHeapOperations ?? 0) === 0
  )
}

function zombieEscapeSparseSearchBudgetIsEmpty(budget: ZombieEscapeSparseSearchBudget) {
  return (
    normalizeSparseSearchBudget(budget.maximumCandidateVisits) === 0 &&
    normalizeSparseSearchBudget(budget.maximumCollisionPredicates) === 0 &&
    normalizeSparseSearchBudget(budget.maximumHeapOperations) === 0 &&
    normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits) === 0 &&
    normalizeSparseSearchBudget(budget.maximumSupportPredicates) === 0
  )
}

type ZombieEscapeCachedSparseWaypointClassification = 'followed' | 'held' | 'refresh' | 'search'
type ZombieEscapeCachedSparseWaypointRouteResolution = 'fallback' | 'held' | 'malformed' | 'strict'
type ZombieEscapeCachedSparseWaypointVariantClassification =
  | 'malformed'
  | 'reachable'
  | 'unreachable'

function classifyZombieEscapeCachedSparseWaypointVariant(
  field: ZombieEscapeFlowField,
  sourceLayerIndex: number,
  waypointNode: number,
  usesFallback: boolean,
): ZombieEscapeCachedSparseWaypointVariantClassification {
  const bank = activeZombieEscapeSparseReverseFieldBank(field)
  const graph = field.world.navigationGraph
  if (!bank.routeTargetInitialized || bank.targetLayerIndex < 0) return 'unreachable'
  const routeIsBuilt = usesFallback
    ? bank.fallbackTargetCell !== FLOW_FALLBACK_UNBUILT
    : bank.targetCell !== FLOW_STRICT_UNBUILT
  if (!routeIsBuilt) return 'unreachable'
  const sameLayer = sourceLayerIndex === bank.targetLayerIndex
  const distances = resolveZombieEscapeCachedSparseWaypointDistances(field, sameLayer, usesFallback)
  const distance = distances[waypointNode]!
  if (distance === Number.POSITIVE_INFINITY) return 'unreachable'
  if (!Number.isFinite(distance)) return 'malformed'
  const nextNode = resolveZombieEscapeCachedSparseWaypointNextNodes(field, sameLayer, usesFallback)[
    waypointNode
  ]!
  if (nextNode === -1) return 'reachable'
  if (!Number.isInteger(nextNode) || nextNode < 0 || nextNode >= graph.nodeIds.length) {
    return 'malformed'
  }
  const nextDistance = distances[nextNode]!
  if (!Number.isFinite(nextDistance) || nextDistance >= distance) return 'malformed'
  const nextLayerIndex = graph.layerIndices[nextNode]!
  if (!field.world.navigationLayers[nextLayerIndex]) return 'malformed'
  if (nextLayerIndex === sourceLayerIndex) return 'reachable'
  const connectorIndex = graph.connectorIndices[waypointNode]!
  const nextConnectorIndex = graph.connectorIndices[nextNode]!
  const connector = field.world.navigationConnectors[connectorIndex]
  const nextConnector = field.world.navigationConnectors[nextConnectorIndex]
  if (!(connector && nextConnector) || connector.chainId !== nextConnector.chainId) {
    return 'malformed'
  }
  const connectorTargetsEnd = graph.connectorEnds[waypointNode] !== 0
  const nextConnectorTargetsEnd = graph.connectorEnds[nextNode] !== 0
  const connectorSourceLayerIndex = connectorTargetsEnd
    ? connector.startLayerIndex
    : connector.endLayerIndex
  const nextConnectorSourceLayerIndex = nextConnectorTargetsEnd
    ? nextConnector.startLayerIndex
    : nextConnector.endLayerIndex
  return connectorSourceLayerIndex === sourceLayerIndex &&
    nextConnectorSourceLayerIndex === nextLayerIndex &&
    connectorTargetsEnd !== nextConnectorTargetsEnd
    ? 'reachable'
    : 'malformed'
}

function resolveZombieEscapeCachedSparseWaypointRoute(
  field: ZombieEscapeFlowField,
  sourceLayerIndex: number,
  waypointNode: number,
  certifiedUsesFallback?: boolean,
): ZombieEscapeCachedSparseWaypointRouteResolution {
  if (certifiedUsesFallback !== undefined) {
    const certified = classifyZombieEscapeCachedSparseWaypointVariant(
      field,
      sourceLayerIndex,
      waypointNode,
      certifiedUsesFallback,
    )
    if (certified === 'malformed') return 'malformed'
    if (certified === 'reachable') return certifiedUsesFallback ? 'fallback' : 'strict'
    return 'held'
  }
  const strict = classifyZombieEscapeCachedSparseWaypointVariant(
    field,
    sourceLayerIndex,
    waypointNode,
    false,
  )
  const fallback = classifyZombieEscapeCachedSparseWaypointVariant(
    field,
    sourceLayerIndex,
    waypointNode,
    true,
  )
  if (strict === 'malformed' || fallback === 'malformed') return 'malformed'
  if (strict === 'reachable') return 'strict'
  if (fallback === 'reachable') return 'fallback'
  return 'held'
}

function classifyZombieEscapeCachedSparseWaypoint(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  sourceY: number,
  output: ZombieEscapeFlowSample,
): ZombieEscapeCachedSparseWaypointClassification {
  const world = field.world
  if (world.navigationMode !== 'sparse') return 'refresh'
  const graph = world.navigationGraph
  const waypointNode = output.waypointNode ?? -1
  if (waypointNode < 0) return 'search'
  if (!Number.isInteger(waypointNode) || waypointNode >= graph.nodeIds.length) return 'refresh'
  const bank = activeZombieEscapeSparseReverseFieldBank(field)
  if (bank.generation > 0 && bank.worldRevision !== world.revision) return 'refresh'
  const sourceLayerIndex = graph.layerIndices[waypointNode]!
  const sourceLayer = world.navigationLayers[sourceLayerIndex]
  if (
    !Number.isFinite(sourceY) ||
    !sourceLayer ||
    Math.abs(sourceLayer.elevation - sourceY) > NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS
  ) {
    return 'refresh'
  }

  const route = resolveZombieEscapeCachedSparseWaypointRoute(field, sourceLayerIndex, waypointNode)
  if (route === 'malformed') return 'refresh'
  return route === 'held' ? 'held' : 'followed'
}

function resolveZombieEscapeCachedSparseWaypointDistances(
  field: ZombieEscapeFlowField,
  sameLayer: boolean,
  usesFallback: boolean,
) {
  return usesFallback
    ? sameLayer
      ? field.graphSameLayerFallbackDistances
      : field.graphFallbackDistances
    : sameLayer
      ? field.graphSameLayerDistances
      : field.graphStrictDistances
}

function resolveZombieEscapeCachedSparseWaypointNextNodes(
  field: ZombieEscapeFlowField,
  sameLayer: boolean,
  usesFallback: boolean,
) {
  return usesFallback
    ? sameLayer
      ? field.graphSameLayerFallbackNextNodes
      : field.graphFallbackNextNodes
    : sameLayer
      ? field.graphSameLayerNextNodes
      : field.graphStrictNextNodes
}

function zombieEscapeCachedSparseWaypointHasArrived(
  world: ZombieEscapeCollisionWorld,
  waypointX: number,
  waypointZ: number,
  x: number,
  z: number,
  approachX: number,
  approachZ: number,
) {
  const approachLength = Math.hypot(approachX, approachZ)
  const offsetX = x - waypointX
  const offsetZ = z - waypointZ
  const lateralDistance =
    approachLength > INTERSECTION_EPSILON
      ? Math.abs(offsetX * -approachZ + offsetZ * approachX) / approachLength
      : Number.POSITIVE_INFINITY
  const arrivalRadius = Math.max(0.08, world.agentRadius * 0.5)
  return (
    Math.hypot(offsetX, offsetZ) <= arrivalRadius ||
    (approachLength > INTERSECTION_EPSILON &&
      offsetX * approachX + offsetZ * approachZ >= 0 &&
      lateralDistance <= arrivalRadius)
  )
}

function writeZombieEscapeHeldSparseWaypoint(
  x: number,
  z: number,
  output: ZombieEscapeFlowSample,
): ZombieEscapeSparseCachedWaypointStatus {
  resetZombieEscapeFlowBlockingSample(output, x, z)
  output.reachable = false
  output.x = 0
  output.z = 0
  return 'held'
}

function writeZombieEscapeCachedSparseWaypoint(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  output: ZombieEscapeFlowSample,
  requireRadialArrival = false,
  search?: ZombieEscapeSparseFlowSearch,
): ZombieEscapeSparseCachedWaypointStatus {
  const world = field.world
  const graph = world.navigationGraph
  let waypointNode = output.waypointNode ?? -1
  const sourceLayerIndex = graph.layerIndices[waypointNode]!
  const sameLayer = sourceLayerIndex === field.targetLayerIndex
  const activeGeneration = activeZombieEscapeSparseReverseFieldBank(field).generation
  const certifiedUsesFallback =
    search &&
    search.routeCorridorGeneration === activeGeneration &&
    search.routeCorridorWorldRevision === world.revision
      ? search.routeCorridorUsesFallback
      : undefined
  const route = resolveZombieEscapeCachedSparseWaypointRoute(
    field,
    sourceLayerIndex,
    waypointNode,
    certifiedUsesFallback,
  )
  if (route === 'malformed') return 'refresh'
  if (route === 'held') return writeZombieEscapeHeldSparseWaypoint(x, z, output)
  const usesFallback = route === 'fallback'
  output.waypointUsesFallback = usesFallback
  const nextNodes = resolveZombieEscapeCachedSparseWaypointNextNodes(field, sameLayer, usesFallback)
  const nextNode = nextNodes[waypointNode]!

  output.connectorIndex = -1
  output.connectorTargetEnd = false
  const waypointDirectionX = graph.x[waypointNode]! - x
  const waypointDirectionZ = graph.z[waypointNode]! - z
  const waypointDistance = Math.hypot(waypointDirectionX, waypointDirectionZ)
  const arrivalRadius = Math.max(0.08, world.agentRadius * 0.5)
  const radialArrivalRequired = requireRadialArrival
  if (radialArrivalRequired && waypointDistance > arrivalRadius) {
    resetZombieEscapeFlowBlockingSample(output, x, z)
    output.reachable = true
    output.waypointNode = waypointNode
    output.x = waypointDirectionX / waypointDistance
    output.z = waypointDirectionZ / waypointDistance
    return 'reacquiring'
  }
  const connectorIndex = graph.connectorIndices[waypointNode]!
  if (connectorIndex >= 0 && nextNode >= 0 && graph.layerIndices[nextNode] !== sourceLayerIndex) {
    const connector = world.navigationConnectors[connectorIndex]
    if (!connector) return 'refresh'
    const targetEnd = graph.connectorEnds[waypointNode] !== 0
    const directionAmount = targetEnd ? 1 : -1
    const connectorDirectionX = connector.directionX * directionAmount
    const connectorDirectionZ = connector.directionZ * directionAmount
    const sourceY = world.navigationLayers[sourceLayerIndex]?.elevation
    if (
      sourceY !== undefined &&
      zombieEscapeNavigationConnectorRequestCanActivate(
        world,
        connector,
        targetEnd,
        x,
        sourceY,
        z,
        connectorDirectionX,
        connectorDirectionZ,
      )
    ) {
      output.connectorIndex = connectorIndex
      output.connectorTargetEnd = targetEnd
      output.reachable = true
      output.waypointNode = waypointNode
      output.x = connectorDirectionX
      output.z = connectorDirectionZ
      return 'followed'
    }
  }

  const arrived = zombieEscapeCachedSparseWaypointHasArrived(
    world,
    graph.x[waypointNode]!,
    graph.z[waypointNode]!,
    x,
    z,
    radialArrivalRequired ? 0 : output.x,
    radialArrivalRequired ? 0 : output.z,
  )
  if (arrived) {
    if (nextNode < 0) {
      const committed = activeZombieEscapeSparseReverseFieldBank(field)
      const effectiveTarget = resolveZombieEscapeSparseEffectiveCommittedTargetForBank(
        field,
        committed,
      )
      output.waypointNode = waypointNode
      writeZombieEscapeSparseFlowTowardTarget(
        x,
        z,
        effectiveTarget.routeTargetX,
        effectiveTarget.routeTargetZ,
        output,
      )
      return 'followed'
    }
    waypointNode = nextNode
  }

  const directionX = graph.x[waypointNode]! - x
  const directionZ = graph.z[waypointNode]! - z
  const distance = Math.hypot(directionX, directionZ)
  output.reachable = true
  output.waypointNode = waypointNode
  output.x = distance > INTERSECTION_EPSILON ? directionX / distance : 0
  output.z = distance > INTERSECTION_EPSILON ? directionZ / distance : 0
  return 'followed'
}

function stepZombieEscapeCachedSparseWaypoint(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  sourceY: number,
  output: ZombieEscapeFlowSample,
  search: ZombieEscapeSparseFlowSearch,
  budget: ZombieEscapeSparseSearchBudget,
  requireRadialArrival = false,
): ZombieEscapeSparseCachedWaypointStatus {
  const world = field.world
  if (world.navigationMode !== 'sparse') return 'refresh'
  if (search.status === 'pending' && search.worldRevision !== world.revision) {
    invalidateZombieEscapeSparseFlowSearch(search)
    return 'invalidated'
  }
  if (search.status === 'pending') {
    return stepZombieEscapeCachedWaypointRefresh(field, x, z, sourceY, output, search, budget)
  }
  const classification = classifyZombieEscapeCachedSparseWaypoint(field, x, z, sourceY, output)
  if (classification === 'refresh') return 'refresh'
  if (classification === 'held') return writeZombieEscapeHeldSparseWaypoint(x, z, output)
  if (classification === 'search') {
    return stepZombieEscapeCachedWaypointRefresh(field, x, z, sourceY, output, search, budget)
  }
  return writeZombieEscapeCachedSparseWaypoint(field, x, z, output, requireRadialArrival, search)
}

function stepZombieEscapeCachedWaypointRefresh(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  sourceY: number,
  output: ZombieEscapeFlowSample,
  search: ZombieEscapeSparseFlowSearch,
  budget: ZombieEscapeSparseSearchBudget,
): ZombieEscapeSparseCachedWaypointStatus {
  if (search.status !== 'pending') {
    beginZombieEscapeSparseFlowSearch(
      search,
      field,
      x,
      z,
      field.targetX,
      field.targetZ,
      sourceY,
      output.waypointNode ?? -1,
      output.waypointUsesFallback === true,
      search.travelSpeedMetersPerSecond,
    )
  }
  const status = stepZombieEscapeSparseFlowSearch(search, field, output, budget)
  if (status === 'pending') return 'pending'
  if (status === 'invalidated') return 'invalidated'
  if (status === 'routePublished') return 'routePublished'
  return status === 'found' ? 'followed' : 'refresh'
}

function writeZombieEscapeSparseFlowTowardTarget(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  output: ZombieEscapeFlowSample,
) {
  const directionX = targetX - x
  const directionZ = targetZ - z
  const distance = Math.hypot(directionX, directionZ)
  output.connectorIndex = -1
  output.connectorTargetEnd = false
  output.reachable = true
  output.x = distance > INTERSECTION_EPSILON ? directionX / distance : 0
  output.z = distance > INTERSECTION_EPSILON ? directionZ / distance : 0
}

function writeZombieEscapeActiveConnectorDirection(
  world: ZombieEscapeCollisionWorld,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapeFlowSample,
) {
  const connector = world.navigationConnectors[output.connectorIndex]
  if (!connector || !zombieEscapeNavigationConnectorTraversalIsActive(world, connector, x, y, z)) {
    return false
  }
  const directionAmount = output.connectorTargetEnd ? 1 : -1
  output.reachable = true
  output.x = connector.directionX * directionAmount
  output.z = connector.directionZ * directionAmount
  return true
}

export function createZombieEscapeSparseAttachmentSearch(): ZombieEscapeSparseAttachmentSearch {
  const search = {
    visibility: createZombieEscapeNavigationVisibilitySearch(),
  } as ZombieEscapeSparseAttachmentSearch
  resetZombieEscapeSparseAttachmentSearch(search)
  return search
}

function zombieEscapeSparseAttachmentHeapArrayIndex(
  search: ZombieEscapeSparseAttachmentSearch,
  position: number,
) {
  return search.hierarchyHeapSlot * search.hierarchyHeapWorkspace!.slotCapacity + position
}

function zombieEscapeSparseAttachmentHeapNodeAt(
  search: ZombieEscapeSparseAttachmentSearch,
  position: number,
) {
  return search.hierarchyHeapWorkspace!.nodes[
    zombieEscapeSparseAttachmentHeapArrayIndex(search, position)
  ]!
}

function setZombieEscapeSparseAttachmentHeapNode(
  search: ZombieEscapeSparseAttachmentSearch,
  position: number,
  node: number,
) {
  search.hierarchyHeapWorkspace!.nodes[
    zombieEscapeSparseAttachmentHeapArrayIndex(search, position)
  ] = node
}

function zombieEscapeSparseAttachmentHeapNodePrecedes(
  search: ZombieEscapeSparseAttachmentSearch,
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  firstNode: number,
  secondNode: number,
) {
  const firstDistance = navigationBoundsHierarchyNodeMinimumDistance(
    hierarchy,
    firstNode,
    search.sourceX,
    search.sourceZ,
  )
  const secondDistance = navigationBoundsHierarchyNodeMinimumDistance(
    hierarchy,
    secondNode,
    search.sourceX,
    search.sourceZ,
  )
  return (
    firstDistance < secondDistance || (firstDistance === secondDistance && firstNode < secondNode)
  )
}

function beginZombieEscapeSparseAttachmentHeapPush(
  search: ZombieEscapeSparseAttachmentSearch,
  node: number,
  nextNode = -1,
) {
  search.hierarchyHeapCandidatePosition = -1
  search.hierarchyHeapNextNode = nextNode
  search.hierarchyHeapNode = node
  search.hierarchyHeapOperation = 'push-append'
  search.hierarchyHeapPosition = -1
}

function completeZombieEscapeSparseAttachmentHeapPush(search: ZombieEscapeSparseAttachmentSearch) {
  if (search.hierarchyHeapNextNode >= 0) {
    const nextNode = search.hierarchyHeapNextNode
    search.hierarchyHeapNextNode = -1
    beginZombieEscapeSparseAttachmentHeapPush(search, nextNode)
    return
  }
  search.hierarchyHeapCandidatePosition = -1
  search.hierarchyHeapNode = -1
  search.hierarchyHeapOperation = 'idle'
  search.hierarchyHeapPosition = -1
  search.phase = 'hierarchy'
}

function beginZombieEscapeSparseAttachmentHeapPop(search: ZombieEscapeSparseAttachmentSearch) {
  search.hierarchyHeapCandidatePosition = -1
  search.hierarchyHeapNode = -1
  search.hierarchyHeapOperation = 'pop-remove'
  search.hierarchyHeapPosition = -1
  search.hierarchyHeapPoppedNode = -1
}

function completeZombieEscapeSparseAttachmentHeapPop(search: ZombieEscapeSparseAttachmentSearch) {
  search.hierarchyHeapCandidatePosition = -1
  search.hierarchyHeapNode = -1
  search.hierarchyHeapOperation = 'idle'
  search.hierarchyHeapPosition = -1
  search.hierarchyNodeIndex = search.hierarchyHeapPoppedNode
  search.phase = 'hierarchy-node'
}

function consumeZombieEscapeSparseAttachmentHeapOperation(
  search: ZombieEscapeSparseAttachmentSearch,
) {
  search.lastStepHeapOperations += 1
  search.totalHeapOperations += 1
}

function stepZombieEscapeSparseAttachmentHeapOperation(
  search: ZombieEscapeSparseAttachmentSearch,
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
) {
  consumeZombieEscapeSparseAttachmentHeapOperation(search)
  if (search.hierarchyHeapOperation === 'push-append') {
    const workspace = search.hierarchyHeapWorkspace!
    if (search.hierarchyHeapSize >= workspace.slotCapacity) {
      search.phase = 'complete'
      search.status = 'invalidated'
      releaseZombieEscapeSparseAttachmentHeapSlot(search)
      return
    }
    const position = search.hierarchyHeapSize
    setZombieEscapeSparseAttachmentHeapNode(search, position, search.hierarchyHeapNode)
    search.hierarchyHeapSize += 1
    search.hierarchyHeapPosition = position
    if (position === 0) completeZombieEscapeSparseAttachmentHeapPush(search)
    else search.hierarchyHeapOperation = 'push-compare'
    return
  }
  if (search.hierarchyHeapOperation === 'push-compare') {
    const position = search.hierarchyHeapPosition
    const parent = Math.floor((position - 1) / 2)
    if (
      !zombieEscapeSparseAttachmentHeapNodePrecedes(
        search,
        hierarchy,
        zombieEscapeSparseAttachmentHeapNodeAt(search, position),
        zombieEscapeSparseAttachmentHeapNodeAt(search, parent),
      )
    ) {
      completeZombieEscapeSparseAttachmentHeapPush(search)
      return
    }
    search.hierarchyHeapCandidatePosition = parent
    search.hierarchyHeapOperation = 'push-swap'
    return
  }
  if (search.hierarchyHeapOperation === 'push-swap') {
    const position = search.hierarchyHeapPosition
    const parent = search.hierarchyHeapCandidatePosition
    const node = zombieEscapeSparseAttachmentHeapNodeAt(search, position)
    setZombieEscapeSparseAttachmentHeapNode(
      search,
      position,
      zombieEscapeSparseAttachmentHeapNodeAt(search, parent),
    )
    setZombieEscapeSparseAttachmentHeapNode(search, parent, node)
    search.hierarchyHeapPosition = parent
    if (parent === 0) completeZombieEscapeSparseAttachmentHeapPush(search)
    else search.hierarchyHeapOperation = 'push-compare'
    return
  }
  if (search.hierarchyHeapOperation === 'pop-remove') {
    search.hierarchyHeapPoppedNode = zombieEscapeSparseAttachmentHeapNodeAt(search, 0)
    search.hierarchyHeapSize -= 1
    if (search.hierarchyHeapSize <= 0) {
      search.hierarchyHeapSize = 0
      completeZombieEscapeSparseAttachmentHeapPop(search)
      return
    }
    search.hierarchyHeapNode = zombieEscapeSparseAttachmentHeapNodeAt(
      search,
      search.hierarchyHeapSize,
    )
    setZombieEscapeSparseAttachmentHeapNode(search, 0, search.hierarchyHeapNode)
    search.hierarchyHeapPosition = 0
    search.hierarchyHeapOperation = 'pop-select'
    return
  }
  if (search.hierarchyHeapOperation === 'pop-select') {
    const left = search.hierarchyHeapPosition * 2 + 1
    if (left >= search.hierarchyHeapSize) {
      completeZombieEscapeSparseAttachmentHeapPop(search)
      return
    }
    const right = left + 1
    search.hierarchyHeapCandidatePosition =
      right < search.hierarchyHeapSize &&
      zombieEscapeSparseAttachmentHeapNodePrecedes(
        search,
        hierarchy,
        zombieEscapeSparseAttachmentHeapNodeAt(search, right),
        zombieEscapeSparseAttachmentHeapNodeAt(search, left),
      )
        ? right
        : left
    search.hierarchyHeapOperation = 'pop-compare'
    return
  }
  if (search.hierarchyHeapOperation === 'pop-compare') {
    const child = search.hierarchyHeapCandidatePosition
    if (
      !zombieEscapeSparseAttachmentHeapNodePrecedes(
        search,
        hierarchy,
        zombieEscapeSparseAttachmentHeapNodeAt(search, child),
        zombieEscapeSparseAttachmentHeapNodeAt(search, search.hierarchyHeapPosition),
      )
    ) {
      completeZombieEscapeSparseAttachmentHeapPop(search)
      return
    }
    search.hierarchyHeapOperation = 'pop-swap'
    return
  }
  const position = search.hierarchyHeapPosition
  const child = search.hierarchyHeapCandidatePosition
  const node = zombieEscapeSparseAttachmentHeapNodeAt(search, position)
  setZombieEscapeSparseAttachmentHeapNode(
    search,
    position,
    zombieEscapeSparseAttachmentHeapNodeAt(search, child),
  )
  setZombieEscapeSparseAttachmentHeapNode(search, child, node)
  search.hierarchyHeapPosition = child
  search.hierarchyHeapOperation = 'pop-select'
}

export function beginZombieEscapeSparseAttachmentSearch(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
  distances: Float64Array,
  sourceLayerIndex: number,
  sourceX: number,
  sourceZ: number,
  breakablesTraversable: boolean,
  retainHierarchyHeapLeaseOnComplete = false,
): ZombieEscapeSparseSearchStatus {
  const world = field.world
  const retainsLease =
    search.hierarchyHeapWorkspace === field.graphAttachmentHeapWorkspace &&
    search.hierarchyHeapWorkspace.ownerTokens[search.hierarchyHeapSlot] ===
      search.hierarchyHeapLeaseToken
  const retainedBank = pinnedZombieEscapeSparseReverseFieldBank(search)
  const retainedVariant = retainedBank
    ? zombieEscapeSparseReverseFieldDistanceVariant(retainedBank, distances)
    : -1
  const preservesReverseFieldBankLease = retainsLease && retainedVariant >= 0
  resetZombieEscapeSparseAttachmentSearch(search, !retainsLease, preservesReverseFieldBankLease)
  search.retainHierarchyHeapLeaseOnComplete = retainHierarchyHeapLeaseOnComplete
  search.breakablesTraversable = breakablesTraversable
  search.sourceLayerIndex = sourceLayerIndex
  search.sourceX = sourceX
  search.sourceZ = sourceZ
  search.routeRevision = field.routeRevision
  search.worldRevision = world.revision
  if (
    world.navigationMode !== 'sparse' ||
    sourceLayerIndex < 0 ||
    sourceLayerIndex >= world.navigationAttachmentAcceleration.layers.length ||
    distances.length !== world.navigationGraph.nodeIds.length ||
    !Number.isFinite(sourceX) ||
    !Number.isFinite(sourceZ)
  ) {
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
    return search.status
  }
  if (!acquireZombieEscapeSparseAttachmentHeapSlot(search, field)) return search.status
  const bank = preservesReverseFieldBankLease
    ? retainedBank
    : acquireZombieEscapeSparseReverseFieldBankLease(search, field)
  if (!bank) {
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
    return search.status
  }
  search.reverseFieldDistanceVariant =
    retainedVariant >= 0
      ? retainedVariant
      : zombieEscapeSparseReverseFieldDistanceVariant(bank, distances)
  if (search.reverseFieldDistanceVariant < 0) {
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
    return search.status
  }
  field.graphAttachmentFullSearchCount += 1
  beginZombieEscapeSparseAttachmentHeapPush(search, 0)
  search.phase = 'hierarchy'
  search.status = 'pending'
  return search.status
}

export function stepZombieEscapeSparseAttachmentSearch(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
  distances: Float64Array,
  budget: ZombieEscapeSparseSearchBudget,
): ZombieEscapeSparseSearchStatus {
  if (
    search.status === 'pending' &&
    (search.worldRevision !== field.world.revision || search.routeRevision !== field.routeRevision)
  ) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
    return search.status
  }
  if (search.status !== 'pending') return search.status
  if (zombieEscapeSparseSearchBudgetIsEmpty(budget)) return search.status
  resetZombieEscapeVisibilityOwnerStepWork(search)
  search.lastStepAttachmentHierarchyNodeVisits = 0
  const bank = pinnedZombieEscapeSparseReverseFieldBank(search)
  if (!bank || search.reverseFieldDistanceVariant < 0) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
    return search.status
  }
  return stepZombieEscapeSparseAttachmentSearchWithinLimits(
    search,
    field,
    zombieEscapeSparseReverseFieldCosts(bank, search.reverseFieldDistanceVariant),
    normalizeSparseSearchBudget(budget.maximumHierarchyNodeVisits),
    normalizeSparseSearchBudget(budget.maximumCandidateVisits),
    normalizeSparseSearchBudget(budget.maximumSupportPredicates),
    normalizeSparseSearchBudget(budget.maximumCollisionPredicates),
    normalizeSparseSearchBudget(budget.maximumHeapOperations),
  )
}

function stepZombieEscapeSparseAttachmentSearchWithinLimits(
  search: ZombieEscapeSparseAttachmentSearch,
  field: ZombieEscapeFlowField,
  distances: Float64Array,
  maximumHierarchyNodeVisits: number,
  maximumCandidateVisits: number,
  maximumSupportPredicates: number,
  maximumCollisionPredicates: number,
  maximumHeapOperations: number,
) {
  if (search.status !== 'pending') return search.status
  const world = field.world
  const graph = world.navigationGraph
  const hierarchy = world.navigationAttachmentAcceleration.layers[search.sourceLayerIndex]
  if (
    search.worldRevision !== world.revision ||
    search.routeRevision !== field.routeRevision ||
    !hierarchy ||
    distances.length !== graph.nodeIds.length
  ) {
    search.phase = 'complete'
    search.status = 'invalidated'
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
    return search.status
  }

  while (search.status === 'pending') {
    if (search.hierarchyHeapOperation !== 'idle') {
      if (search.lastStepHeapOperations >= maximumHeapOperations) return search.status
      if (!acquireZombieEscapeSparseAttachmentHeapSlot(search, field)) return search.status
      stepZombieEscapeSparseAttachmentHeapOperation(search, hierarchy)
      continue
    }
    if (search.phase === 'collision') {
      const supportItemsBefore = search.visibility.totalSupportItemVisits
      const visibilityStatus = stepZombieEscapeNavigationVisibilityForOwner(
        world,
        search.visibility,
        search,
        maximumCandidateVisits,
        maximumCollisionPredicates,
        maximumHierarchyNodeVisits,
        maximumSupportPredicates,
      )
      field.graphAttachmentSupportCheckCount +=
        search.visibility.totalSupportItemVisits - supportItemsBefore
      if (visibilityStatus === 'pending') return search.status
      if (visibilityStatus === 'invalidated') {
        search.phase = 'complete'
        search.status = 'invalidated'
        releaseZombieEscapeSparseAttachmentHeapSlot(search)
        return search.status
      }
      if (visibilityStatus === 'clear') {
        const bank = pinnedZombieEscapeSparseReverseFieldBank(search)
        if (!bank || search.reverseFieldDistanceVariant < 0) {
          search.phase = 'complete'
          search.status = 'invalidated'
          releaseZombieEscapeSparseAttachmentHeapSlot(search)
          return search.status
        }
        const candidateAttachmentBreachCount =
          countZombieEscapeSparseAttachmentBreachesOutsideRoute(search, field, bank)
        const candidateRouteBreachCount =
          zombieEscapeSparseReverseFieldBreachCounts(bank, search.reverseFieldDistanceVariant)?.[
            search.candidateNode
          ] ?? 0
        const candidateRouteTravelDistance = zombieEscapeSparseReverseFieldDistances(
          bank,
          search.reverseFieldDistanceVariant,
        )[search.candidateNode]!
        const candidateTotalBreachCount = candidateAttachmentBreachCount + candidateRouteBreachCount
        const candidateTotalTravelDistance =
          search.candidateAttachmentDistance + candidateRouteTravelDistance
        const candidateCost =
          search.candidateAttachmentDistance +
          search.candidateRouteDistance +
          candidateAttachmentBreachCount *
            ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRoutePlanningSpeedMetersPerSecond *
            ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS
        const bestTotalBreachCount = search.bestAttachmentBreachCount + search.bestRouteBreachCount
        const bestTotalTravelDistance =
          search.bestAttachmentDistance + search.bestRouteTravelDistance
        const candidateIsBetter =
          candidateCost < search.bestCost - INTERSECTION_EPSILON ||
          (Math.abs(candidateCost - search.bestCost) <= INTERSECTION_EPSILON &&
            (candidateTotalBreachCount < bestTotalBreachCount ||
              (candidateTotalBreachCount === bestTotalBreachCount &&
                (candidateTotalTravelDistance < bestTotalTravelDistance - INTERSECTION_EPSILON ||
                  (Math.abs(candidateTotalTravelDistance - bestTotalTravelDistance) <=
                    INTERSECTION_EPSILON &&
                    (search.candidateAttachmentDistance <
                      search.bestAttachmentDistance - INTERSECTION_EPSILON ||
                      (Math.abs(
                        search.candidateAttachmentDistance - search.bestAttachmentDistance,
                      ) <= INTERSECTION_EPSILON &&
                        (search.bestNode < 0 || search.candidateNode < search.bestNode))))))))
        if (candidateIsBetter) {
          search.bestNode = search.candidateNode
          search.bestAttachmentDistance = search.candidateAttachmentDistance
          search.bestAttachmentBreachCount = candidateAttachmentBreachCount
          search.bestAttachmentBreachObjectOrdinals.clear()
          for (const objectOrdinal of search.visibility.breakableObjectOrdinals) {
            if (world.activeObjectMask[objectOrdinal] !== 0) {
              search.bestAttachmentBreachObjectOrdinals.add(objectOrdinal)
            }
          }
          search.bestCost = candidateCost
          search.bestRouteBreachCount = candidateRouteBreachCount
          search.bestRouteDistance = search.candidateRouteDistance
          search.bestRouteTravelDistance = candidateRouteTravelDistance
        }
      }
      search.phase = 'hierarchy'
      continue
    }

    if (search.hierarchyItemOffset < search.hierarchyItemEnd) {
      if (search.lastStepCandidateVisits >= maximumCandidateVisits) return search.status
      const node = hierarchy.itemIndices[search.hierarchyItemOffset]!
      search.hierarchyItemOffset += 1
      search.lastStepCandidateVisits += 1
      search.totalCandidateVisits += 1
      const routeDistance = distances[node]!
      if (!Number.isFinite(routeDistance)) continue
      field.graphAttachmentCandidateCount += 1
      const attachmentDistance = Math.hypot(
        graph.x[node]! - search.sourceX,
        graph.z[node]! - search.sourceZ,
      )
      if (attachmentDistance + routeDistance > search.bestCost + INTERSECTION_EPSILON) {
        continue
      }
      search.candidateAttachmentDistance = attachmentDistance
      search.candidateNode = node
      search.candidateRouteDistance = routeDistance
      beginZombieEscapeNavigationVisibilitySearch(
        world,
        search.visibility,
        search.sourceLayerIndex,
        search.sourceX,
        search.sourceZ,
        graph.x[node]!,
        graph.z[node]!,
        world.agentRadius,
        search.breakablesTraversable,
      )
      search.phase = 'collision'
      continue
    }

    if (search.phase === 'hierarchy' && search.hierarchyHeapSize <= 0) {
      return completeZombieEscapeSparseAttachmentSearch(search, search.bestNode)
    }
    if (search.phase === 'hierarchy') {
      if (search.lastStepHeapOperations >= maximumHeapOperations) return search.status
      beginZombieEscapeSparseAttachmentHeapPop(search)
      continue
    }
    if (search.lastStepHierarchyNodeVisits >= maximumHierarchyNodeVisits) return search.status
    const hierarchyNodeIndex = search.hierarchyNodeIndex
    search.lastStepAttachmentHierarchyNodeVisits += 1
    search.totalAttachmentHierarchyNodeVisits += 1
    search.lastStepHierarchyNodeVisits += 1
    search.totalHierarchyNodeVisits += 1
    if (
      navigationBoundsHierarchyNodeMinimumDistance(
        hierarchy,
        hierarchyNodeIndex,
        search.sourceX,
        search.sourceZ,
      ) >
      search.bestCost + INTERSECTION_EPSILON
    ) {
      search.phase = 'hierarchy'
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[hierarchyNodeIndex]!
    if (itemCount > 0) {
      search.hierarchyItemOffset = hierarchy.nodeItemOffsets[hierarchyNodeIndex]!
      search.hierarchyItemEnd = search.hierarchyItemOffset + itemCount
      search.phase = 'hierarchy'
      continue
    }
    const left = hierarchyNodeIndex + 1
    const right = hierarchy.nodeSkipIndices[left]!
    const maximumDistance = search.bestCost + INTERSECTION_EPSILON
    const leftEligible =
      navigationBoundsHierarchyNodeMinimumDistance(
        hierarchy,
        left,
        search.sourceX,
        search.sourceZ,
      ) <= maximumDistance
    const rightEligible =
      right < hierarchy.nodeSkipIndices[hierarchyNodeIndex]! &&
      navigationBoundsHierarchyNodeMinimumDistance(
        hierarchy,
        right,
        search.sourceX,
        search.sourceZ,
      ) <= maximumDistance
    if (leftEligible) {
      beginZombieEscapeSparseAttachmentHeapPush(search, left, rightEligible ? right : -1)
    } else if (rightEligible) {
      beginZombieEscapeSparseAttachmentHeapPush(search, right)
    } else {
      search.phase = 'hierarchy'
    }
  }
  return search.status
}

function completeZombieEscapeSparseAttachmentSearch(
  search: ZombieEscapeSparseAttachmentSearch,
  bestNode: number,
) {
  search.bestNode = bestNode
  search.phase = 'complete'
  search.status = bestNode >= 0 ? 'found' : 'unreachable'
  if (!search.retainHierarchyHeapLeaseOnComplete) {
    releaseZombieEscapeSparseAttachmentHeapSlot(search)
  }
  return search.status
}

function resetZombieEscapeSparseAttachmentSearch(
  search: ZombieEscapeSparseAttachmentSearch,
  releaseHeapSlot = true,
  preserveReverseFieldBankLease = false,
) {
  if (!preserveReverseFieldBankLease) releaseZombieEscapeSparseReverseFieldBankLease(search)
  if (releaseHeapSlot) releaseZombieEscapeSparseAttachmentHeapSlot(search)
  search.visibility ??= createZombieEscapeNavigationVisibilitySearch()
  resetZombieEscapeNavigationVisibilitySearch(search.visibility)
  search.bestAttachmentDistance = Number.POSITIVE_INFINITY
  search.bestAttachmentBreachCount = 0
  search.bestAttachmentBreachObjectOrdinals ??= new Set<number>()
  search.bestAttachmentBreachObjectOrdinals.clear()
  search.bestCost = Number.POSITIVE_INFINITY
  search.bestNode = -1
  search.bestRouteBreachCount = 0
  search.bestRouteDistance = Number.POSITIVE_INFINITY
  search.bestRouteTravelDistance = Number.POSITIVE_INFINITY
  search.breakablesTraversable = false
  search.candidateAttachmentDistance = Number.POSITIVE_INFINITY
  search.candidateNode = -1
  search.candidateRouteDistance = Number.POSITIVE_INFINITY
  search.hierarchyItemEnd = 0
  search.hierarchyItemOffset = 0
  search.hierarchyHeapCandidatePosition = -1
  search.hierarchyHeapLeaseGeneration ??= -1
  search.hierarchyHeapLeaseToken ??= 0
  search.hierarchyHeapNextNode = -1
  search.hierarchyHeapNode = -1
  search.hierarchyHeapOperation = 'idle'
  search.hierarchyHeapPosition = -1
  search.hierarchyHeapPoppedNode = -1
  search.hierarchyHeapReserved ??= false
  search.hierarchyHeapSize = 0
  search.hierarchyHeapSlot ??= -1
  search.hierarchyHeapWorkspace ??= null
  search.hierarchyNodeIndex = 0
  search.lastStepAttachmentHierarchyNodeVisits = 0
  search.lastStepCandidateVisits = 0
  search.lastStepColliderCandidateVisits = 0
  search.lastStepColliderHierarchyNodeVisits = 0
  search.lastStepCollisionPredicates = 0
  search.lastStepHeapOperations = 0
  search.lastStepHierarchyNodeVisits = 0
  search.lastStepSupportHierarchyNodeVisits = 0
  search.lastStepSupportHoleVisits = 0
  search.lastStepSupportItemVisits = 0
  search.lastStepSupportPredicates = 0
  search.lastStepSupportRingEdgeVisits = 0
  search.lastStepSupportRingHierarchyNodeVisits = 0
  search.phase = 'complete'
  search.retainHierarchyHeapLeaseOnComplete = false
  if (!preserveReverseFieldBankLease) {
    search.reverseFieldBankGeneration ??= 0
    search.reverseFieldBankIndex ??= -1
    search.reverseFieldBankWorkspace ??= null
    search.reverseFieldDistanceVariant = -1
  }
  search.routeRevision = -1
  search.sourceLayerIndex = -1
  search.sourceX = 0
  search.sourceZ = 0
  search.status = 'unreachable'
  search.supportEnd = 0
  search.supportOffset = 0
  search.totalAttachmentHierarchyNodeVisits = 0
  search.totalCandidateVisits = 0
  search.totalColliderCandidateVisits = 0
  search.totalColliderHierarchyNodeVisits = 0
  search.totalCollisionPredicates = 0
  search.totalHeapOperations = 0
  search.totalHierarchyNodeVisits = 0
  search.totalSupportHierarchyNodeVisits = 0
  search.totalSupportHoleVisits = 0
  search.totalSupportItemVisits = 0
  search.totalSupportPredicates = 0
  search.totalSupportRingEdgeVisits = 0
  search.totalSupportRingHierarchyNodeVisits = 0
  search.worldRevision = ''
}

export function createZombieEscapeReachableSpawn(): ZombieEscapeReachableSpawn {
  return { cell: -1, reachable: false, x: 0, z: 0 }
}

export function resolveZombieEscapeNavigationTargetElevation(
  world: ZombieEscapeCollisionWorld,
  targetX: number,
  targetZ: number,
  targetY: number,
  previousTargetY: number,
) {
  const previousLayerIndex = world.navigationLayers.findIndex(({ elevation }) =>
    navigationElevationsMatch(elevation, previousTargetY),
  )
  const previousLayer = world.navigationLayers[previousLayerIndex]
  let supportedElevation = Number.NEGATIVE_INFINITY
  for (let layerIndex = 0; layerIndex < world.navigationLayers.length; layerIndex += 1) {
    const layer = world.navigationLayers[layerIndex]!
    if (
      layer.elevation <= targetY + NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS &&
      layer.elevation > supportedElevation &&
      navigationLayerSupportsPoint(world, layerIndex, targetX, targetZ)
    ) {
      supportedElevation = layer.elevation
    }
  }
  if (
    Number.isFinite(supportedElevation) &&
    (!previousLayer ||
      supportedElevation > previousLayer.elevation + NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS)
  ) {
    return supportedElevation
  }
  if (
    previousLayer &&
    targetY >= previousLayer.elevation - NAVIGATION_CONNECTOR_TARGET_LANDING_TOLERANCE_METERS &&
    navigationLayerSupportsPoint(world, previousLayerIndex, targetX, targetZ)
  ) {
    return previousLayer.elevation
  }
  if (Number.isFinite(supportedElevation)) return supportedElevation
  return targetY
}

export function resolveZombieEscapeReachableSpawn(
  field: ZombieEscapeFlowField,
  desiredX: number,
  desiredZ: number,
  targetX: number,
  targetZ: number,
  minimumTargetDistanceMeters: number,
  output: ZombieEscapeReachableSpawn,
  targetY = 0,
  desiredY = 0,
) {
  updateZombieEscapeFlowTarget(field, targetX, targetZ, targetY)
  const world = field.world
  const minimumTargetDistance = Math.max(0, finiteNonNegative(minimumTargetDistanceMeters, 0))
  const minimumTargetDistanceSquared = minimumTargetDistance * minimumTargetDistance
  if (world.navigationMode === 'sparse') {
    const search = field.graphSparseReachableSpawnSearch
    beginZombieEscapeSparseReachableSpawnSearch(
      search,
      field,
      desiredX,
      desiredZ,
      targetX,
      targetZ,
      minimumTargetDistance,
      desiredY,
    )
    while (search.status === 'pending') {
      stepZombieEscapeSparseReachableSpawnSearch(
        search,
        field,
        output,
        UNBOUNDED_SPARSE_SEARCH_BUDGET,
      )
      if (search.status === 'pending') {
        stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET)
      }
    }
    return search.status === 'found'
  }
  ensureZombieEscapeStrictFlowTarget(field)
  let bestCell = -1
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  const desiredLayerIndex = resolveSupportedNavigationLayerIndex(
    world,
    desiredX,
    desiredZ,
    desiredY,
  )
  for (let reachableIndex = 0; reachableIndex < field.reachableCount; reachableIndex += 1) {
    const node = field.queue[reachableIndex]!
    if (navigationNodeLayerIndex(world, node) !== desiredLayerIndex) continue
    const cell = navigationNodeCell(world, node)
    const column = cell % world.gridWidth
    const row = Math.floor(cell / world.gridWidth)
    const z = world.gridOriginZ + (row + 0.5) * world.cellSize
    const x = world.gridOriginX + (column + 0.5) * world.cellSize
    const targetOffsetX = x - targetX
    const targetOffsetZ = z - targetZ
    if (
      targetOffsetX * targetOffsetX + targetOffsetZ * targetOffsetZ + INTERSECTION_EPSILON <
      minimumTargetDistanceSquared
    ) {
      continue
    }
    const desiredOffsetX = x - desiredX
    const desiredOffsetZ = z - desiredZ
    const distanceSquared = desiredOffsetX * desiredOffsetX + desiredOffsetZ * desiredOffsetZ
    if (
      distanceSquared > bestDistanceSquared + INTERSECTION_EPSILON ||
      (Math.abs(distanceSquared - bestDistanceSquared) <= INTERSECTION_EPSILON &&
        bestCell >= 0 &&
        cell >= bestCell)
    ) {
      continue
    }
    bestCell = cell
    bestDistanceSquared = distanceSquared
  }

  if (bestCell < 0) {
    output.cell = -1
    output.reachable = false
    output.x = 0
    output.z = 0
    return false
  }
  const bestColumn = bestCell % world.gridWidth
  const bestRow = Math.floor(bestCell / world.gridWidth)
  output.cell = bestCell
  output.reachable = true
  output.x = world.gridOriginX + (bestColumn + 0.5) * world.cellSize
  output.z = world.gridOriginZ + (bestRow + 0.5) * world.cellSize
  return true
}

export function resolveZombieEscapeFlowDirection(
  field: ZombieEscapeFlowField,
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  output: ZombieEscapeFlowSample,
  collisionHit?: ZombieEscapeCollisionHit,
  sourceY = 0,
  preferredWaypointNode?: number,
  preferredWaypointUsesFallback?: boolean,
  travelSpeedMetersPerSecond?: number,
) {
  const world = field.world
  if (
    world.navigationMode === 'sparse' &&
    writeZombieEscapeActiveConnectorDirection(world, x, sourceY, z, output)
  ) {
    return output
  }
  const cachedWaypointNode = preferredWaypointNode ?? output.waypointNode ?? -1
  const cachedWaypointUsesFallback =
    preferredWaypointUsesFallback ?? output.waypointUsesFallback === true
  if (world.navigationMode === 'sparse') {
    const search = field.graphSparseFlowSearch
    beginZombieEscapeSparseFlowSearch(
      search,
      field,
      x,
      z,
      targetX,
      targetZ,
      sourceY,
      cachedWaypointNode,
      cachedWaypointUsesFallback,
      travelSpeedMetersPerSecond,
    )
    while (search.status === 'pending') {
      stepZombieEscapeSparseFlowSearch(
        search,
        field,
        output,
        UNBOUNDED_SPARSE_SEARCH_BUDGET,
        collisionHit,
      )
      if (search.status === 'pending') {
        stepZombieEscapeSparseTargetUpdate(field, UNBOUNDED_SPARSE_TARGET_UPDATE_BUDGET)
      }
    }
    return output
  }
  const directCollisionHit = collisionHit ?? field.graphCollisionHit
  resetCollisionHit(directCollisionHit)
  resetZombieEscapeFlowBlockingSample(output, x, z)
  output.waypointNode = -1
  output.waypointUsesFallback = false
  const sourceLayerIndex = resolveZombieEscapePinnedNavigationLayerIndex(world, x, z, sourceY)
  const directX = targetX - x
  const directZ = targetZ - z
  const directLength = Math.hypot(directX, directZ)
  if (sourceLayerIndex === field.targetLayerIndex && directLength <= INTERSECTION_EPSILON) {
    output.x = 0
    output.z = 0
    output.reachable = true
    return output
  }
  if (
    sourceLayerIndex === field.targetLayerIndex &&
    directLength > INTERSECTION_EPSILON &&
    zombieEscapeNavigationSegmentIsClear(
      world,
      sourceLayerIndex,
      x,
      z,
      targetX,
      targetZ,
      world.agentRadius,
      directCollisionHit,
    )
  ) {
    setZombieEscapeFlowBlockingSample(output, directCollisionHit, x, z, directX, directZ)
    output.x = directX / directLength
    output.z = directZ / directLength
    output.reachable = true
    return output
  }
  setZombieEscapeFlowBlockingSample(output, directCollisionHit, x, z, directX, directZ)
  ensureZombieEscapeStrictFlowTarget(field)

  const column = worldColumn(world, x)
  const row = worldRow(world, z)
  let bestNode = resolveZombieEscapeFlowWaypointNode(
    field,
    field.distances,
    sourceLayerIndex,
    column,
    row,
    false,
  )
  let usesFallback = false
  if (bestNode < 0) {
    ensureZombieEscapeFallbackFlowTarget(field)
    bestNode = resolveZombieEscapeFlowWaypointNode(
      field,
      field.fallbackDistances,
      sourceLayerIndex,
      column,
      row,
      true,
    )
    usesFallback = bestNode >= 0
  }

  if (bestNode < 0) {
    output.x = 0
    output.z = 0
    output.reachable = false
    return output
  }
  if (!isGridNavigationNode(world, bestNode)) {
    const endpoint = bestNode - navigationGridNodeCount(world)
    const connectorIndex = Math.floor(endpoint / 2)
    const connector = world.navigationConnectors[connectorIndex]
    if (connector) {
      const targetEnd = endpoint % 2 === 0
      const directionAmount = targetEnd ? 1 : -1
      output.connectorIndex = connectorIndex
      output.connectorTargetEnd = targetEnd
      output.x = connector.directionX * directionAmount
      output.z = connector.directionZ * directionAmount
      output.reachable = true
      return output
    }
  }
  const waypoint = resolveNavigationNodePlanPosition(world, bestNode)
  const waypointX = waypoint.x
  const waypointZ = waypoint.z
  const waypointDirectionX = waypointX - x
  const waypointDirectionZ = waypointZ - z
  const waypointDistance = Math.hypot(waypointDirectionX, waypointDirectionZ)
  if (usesFallback && waypointDistance > INTERSECTION_EPSILON) {
    const waypointCollisionHit = field.graphCollisionHit
    zombieEscapeNavigationSegmentIsClear(
      world,
      sourceLayerIndex,
      x,
      z,
      waypointX,
      waypointZ,
      world.agentRadius,
      waypointCollisionHit,
    )
    if (waypointCollisionHit.colliderKind !== 'none') {
      if (collisionHit) copyZombieEscapeCollisionHit(collisionHit, waypointCollisionHit)
      setZombieEscapeFlowBlockingSample(
        output,
        waypointCollisionHit,
        x,
        z,
        waypointDirectionX,
        waypointDirectionZ,
      )
    }
  }
  output.x = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionX / waypointDistance : 0
  output.z = waypointDistance > INTERSECTION_EPSILON ? waypointDirectionZ / waypointDistance : 0
  output.reachable = true
  return output
}

function resolveZombieEscapeFlowWaypointNode(
  field: ZombieEscapeFlowField,
  distances: Uint32Array,
  sourceLayerIndex: number,
  column: number,
  row: number,
  breakablesTraversable: boolean,
) {
  const world = field.world
  let bestNode = -1
  let bestDistance = FLOW_UNREACHABLE
  for (let neighbor = 0; neighbor < FLOW_NEIGHBOR_X.length; neighbor += 1) {
    const columnOffset = FLOW_NEIGHBOR_X[neighbor]!
    const rowOffset = FLOW_NEIGHBOR_Z[neighbor]!
    const nextColumn = column + columnOffset
    const nextRow = row + rowOffset
    if (!isGridCellWalkable(world, sourceLayerIndex, nextColumn, nextRow, breakablesTraversable)) {
      continue
    }
    if (
      columnOffset !== 0 &&
      rowOffset !== 0 &&
      (!isGridCellWalkable(
        world,
        sourceLayerIndex,
        column + columnOffset,
        row,
        breakablesTraversable,
      ) ||
        !isGridCellWalkable(
          world,
          sourceLayerIndex,
          column,
          row + rowOffset,
          breakablesTraversable,
        ))
    ) {
      continue
    }
    const nextCell = nextRow * world.gridWidth + nextColumn
    const nextNode = navigationNode(world, sourceLayerIndex, nextCell)
    const distance = distances[nextNode]!
    if (distance >= bestDistance) continue
    bestDistance = distance
    bestNode = nextNode
  }
  const currentCell = row * world.gridWidth + column
  const currentNode = navigationNode(world, sourceLayerIndex, currentCell)
  const adjacency = world.navigationConnectorAdjacency
  const edgeEnd = adjacency.nodeOffsets[currentNode + 1]!
  for (let edgeIndex = adjacency.nodeOffsets[currentNode]!; edgeIndex < edgeEnd; edgeIndex += 1) {
    const toNode = adjacency.toNodes[edgeIndex]!
    const distance = toNode >= 0 ? distances[toNode]! : FLOW_UNREACHABLE
    if (distance >= bestDistance) continue
    bestDistance = distance
    bestNode = toNode
  }
  return bestDistance === FLOW_UNREACHABLE ? -1 : bestNode
}

function resetZombieEscapeFlowBlockingSample(
  output: ZombieEscapeFlowSample,
  sourceX: number,
  sourceZ: number,
) {
  output.blockingDistance = Number.POSITIVE_INFINITY
  output.blockingX = sourceX
  output.blockingZ = sourceZ
  output.connectorIndex = -1
  output.connectorTargetEnd = false
}

function resetZombieEscapeSparseFlowBlockingRecord(search: ZombieEscapeSparseFlowSearch) {
  resetCollisionHit(search.blockingHit)
  search.blockingDistance = Number.POSITIVE_INFINITY
  search.blockingX = search.sourceX
  search.blockingZ = search.sourceZ
}

function recordZombieEscapeSparseFlowBlockingRecord(
  search: ZombieEscapeSparseFlowSearch,
  hit: ZombieEscapeCollisionHit,
  segmentX: number,
  segmentZ: number,
) {
  copyZombieEscapeCollisionHit(search.blockingHit, hit)
  search.blockingDistance = Number.POSITIVE_INFINITY
  search.blockingX = search.sourceX
  search.blockingZ = search.sourceZ
  if (hit.colliderKind === 'none' || !Number.isFinite(hit.time)) return
  const time = Math.max(0, Math.min(1, hit.time))
  search.blockingDistance = Math.hypot(segmentX, segmentZ) * time
  search.blockingX = search.sourceX + segmentX * time
  search.blockingZ = search.sourceZ + segmentZ * time
}

function publishZombieEscapeSparseFlowBlockingRecord(
  search: ZombieEscapeSparseFlowSearch,
  field: ZombieEscapeFlowField,
  output: ZombieEscapeFlowSample,
  collisionHit: ZombieEscapeCollisionHit | undefined,
) {
  output.blockingDistance = search.blockingDistance
  output.blockingX = search.blockingX
  output.blockingZ = search.blockingZ
  copyZombieEscapeCollisionHit(collisionHit ?? field.graphCollisionHit, search.blockingHit)
}

function setZombieEscapeFlowBlockingSample(
  output: ZombieEscapeFlowSample,
  collisionHit: ZombieEscapeCollisionHit | undefined,
  sourceX: number,
  sourceZ: number,
  segmentX: number,
  segmentZ: number,
) {
  if (
    !collisionHit ||
    collisionHit.colliderKind === 'none' ||
    !Number.isFinite(collisionHit.time)
  ) {
    return
  }
  const time = Math.max(0, Math.min(1, collisionHit.time))
  output.blockingDistance = Math.hypot(segmentX, segmentZ) * time
  output.blockingX = sourceX + segmentX * time
  output.blockingZ = sourceZ + segmentZ * time
}

export function zombieEscapeSegmentIsClear(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  output = createZombieEscapeCollisionHit(),
) {
  sweepZombieEscapeCircleAgainstWorld(
    world,
    startX,
    startZ,
    endX - startX,
    endZ - startZ,
    radius,
    output,
  )
  return output.colliderKind === 'none' || output.time >= 1 - COLLISION_EPSILON_METERS
}

export function zombieEscapeSameLayerNavigationSegmentIsClear(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  radius: number,
  output = createZombieEscapeCollisionHit(),
) {
  resetCollisionHit(output)
  if (world.navigationLayers.length === 0) return false
  const startLayerIndex = resolveNavigationLayerIndex(world, startY)
  const endLayerIndex = resolveNavigationLayerIndex(world, endY)
  const layer = world.navigationLayers[startLayerIndex]
  if (
    !layer ||
    startLayerIndex !== endLayerIndex ||
    Math.abs(layer.elevation - startY) > NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS ||
    Math.abs(layer.elevation - endY) > NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS
  ) {
    return false
  }
  return zombieEscapeNavigationSegmentIsClear(
    world,
    startLayerIndex,
    startX,
    startZ,
    endX,
    endZ,
    radius,
    output,
  )
}

function zombieEscapeNavigationSegmentIsClear(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  output = createZombieEscapeCollisionHit(),
  ignoredObjectIds?: ReadonlySet<string>,
) {
  if (!navigationSegmentStaysSupported(world, navigationLayerIndex, startX, startZ, endX, endZ)) {
    return false
  }
  return sweepZombieEscapeNavigationCollidersIsClear(
    world,
    navigationLayerIndex,
    startX,
    startZ,
    endX,
    endZ,
    radius,
    output,
    ignoredObjectIds,
  )
}

function sweepZombieEscapeNavigationCollidersIsClear(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  output: ZombieEscapeCollisionHit,
  ignoredObjectIds?: ReadonlySet<string>,
) {
  sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    endX - startX,
    endZ - startZ,
    radius,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    output,
    undefined,
    0,
    undefined,
    ignoredObjectIds,
    navigationLayerIndex,
  )
  return output.colliderKind === 'none' || output.time >= 1 - COLLISION_EPSILON_METERS
}

function navigationSegmentStaysSupported(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  if (world.navigationMode === 'sparse') {
    return sparseNavigationSegmentStaysSupported(
      world,
      navigationLayerIndex,
      startX,
      startZ,
      endX,
      endZ,
    )
  }
  const length = Math.hypot(endX - startX, endZ - startZ)
  const sampleCount = Math.max(1, Math.ceil(length / Math.max(0.05, world.cellSize * 0.5)))
  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const amount = sample / sampleCount
    if (
      !navigationLayerSupportsPoint(
        world,
        navigationLayerIndex,
        startX + (endX - startX) * amount,
        startZ + (endZ - startZ) * amount,
      )
    ) {
      return false
    }
  }
  return true
}

function sparseNavigationSegmentStaysSupported(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  return navigationSupportLayerContainsCapsule(
    world,
    navigationLayerIndex,
    startX,
    startZ,
    endX,
    endZ,
    world.agentRadius,
  )
}

function navigationLayerSupportsPoint(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  x: number,
  z: number,
) {
  const layer = world.navigationLayers[navigationLayerIndex]
  if (!layer) return false
  if (world.navigationMode === 'sparse') {
    const acceleration = world.navigationSupportAcceleration.layers[navigationLayerIndex]
    if (!acceleration) return false
    if (
      navigationSupportElevationsMatch(layer.elevation, 0) &&
      acceleration.supportIndices.length === 0
    ) {
      const maximumCenterRadius = Math.max(0, world.playRadius - world.agentRadius)
      return x * x + z * z <= maximumCenterRadius * maximumCenterRadius
    }
    return navigationSupportLayerContainsDisk(world, navigationLayerIndex, x, z, world.agentRadius)
  }
  return navigationLayerSupportsCell(
    world,
    layer,
    Math.floor((x - world.gridOriginX) / world.cellSize),
    Math.floor((z - world.gridOriginZ) / world.cellSize),
  )
}

export function zombieEscapeSegmentIsClearInVerticalRange(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  minimumY: number,
  maximumY: number,
  output = createZombieEscapeCollisionHit(),
) {
  sweepZombieEscapeCircleAgainstWorldInVerticalRange(
    world,
    startX,
    startZ,
    endX - startX,
    endZ - startZ,
    radius,
    minimumY,
    maximumY,
    output,
  )
  return output.colliderKind === 'none' || output.time >= 1 - COLLISION_EPSILON_METERS
}

export function createZombieEscapeCollisionHit(): ZombieEscapeCollisionHit {
  return {
    colliderIndex: -1,
    colliderKind: 'none',
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    time: Number.POSITIVE_INFINITY,
  }
}

export function createZombieEscapeCircleMoveResult(): ZombieEscapeCircleMoveResult {
  const output = { collided: false, x: 0, z: 0 } as ZombieEscapeCircleMoveResult
  Object.defineProperty(output, 'sweepHit', { value: createZombieEscapeCollisionHit() })
  return output
}

export function createZombieEscapeNavigationMoveResult(): ZombieEscapeNavigationMoveResult {
  const output = {
    collided: false,
    connectorIndex: -1,
    connectorTargetEnd: false,
    x: 0,
    y: 0,
    z: 0,
  } as ZombieEscapeNavigationMoveResult
  Object.defineProperty(output, 'sweepHit', { value: createZombieEscapeCollisionHit() })
  return output
}

export function moveZombieEscapeCircleWithSlide(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  hit: ZombieEscapeCollisionHit,
  output: ZombieEscapeCircleMoveResult,
  ignoredObjectIds?: ReadonlySet<string>,
) {
  return moveZombieEscapeCircleWithSlideOnLayer(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    radius,
    hit,
    output,
    ignoredObjectIds,
  )
}

function moveZombieEscapeCircleWithSlideOnLayer(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  hit: ZombieEscapeCollisionHit,
  output: ZombieEscapeCircleMoveResult,
  ignoredObjectIds?: ReadonlySet<string>,
  navigationLayerIndex?: number,
  enforceSupport = true,
) {
  let x = startX
  let z = startZ
  let remainingX = displacementX
  let remainingZ = displacementZ
  let hasBlockingContact = false
  output.collided = false
  resetCollisionHit(hit)
  resetCollisionHit(output.sweepHit)

  if (world.boundaryPolicy === 'solid') {
    const maximumCenterRadius = Math.max(0, world.playRadius - Math.max(0, radius))
    const startRadius = Math.hypot(x, z)
    if (startRadius > maximumCenterRadius) {
      const scale = maximumCenterRadius / Math.max(INTERSECTION_EPSILON, startRadius)
      x *= scale
      z *= scale
      output.collided = true
    }
  }

  for (let iteration = 0; iteration < COLLISION_SWEEP_ITERATIONS; iteration += 1) {
    if (remainingX * remainingX + remainingZ * remainingZ <= INTERSECTION_EPSILON) break
    const sweepHit = hasBlockingContact ? output.sweepHit : hit
    sweepZombieEscapeCircleAgainstWorldRange(
      world,
      x,
      z,
      remainingX,
      remainingZ,
      radius,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      sweepHit,
      undefined,
      0,
      undefined,
      ignoredObjectIds,
      navigationLayerIndex,
    )
    if (sweepHit.colliderKind === 'none' || sweepHit.time >= 1) {
      x += remainingX
      z += remainingZ
      remainingX = 0
      remainingZ = 0
      break
    }

    output.collided = true
    hasBlockingContact = true
    const amount = Math.max(0, sweepHit.time - COLLISION_EPSILON_METERS)
    x += remainingX * amount + sweepHit.normalX * COLLISION_EPSILON_METERS
    z += remainingZ * amount + sweepHit.normalZ * COLLISION_EPSILON_METERS
    const remainder = Math.max(0, 1 - amount)
    remainingX *= remainder
    remainingZ *= remainder
    const intoSurface = remainingX * sweepHit.normalX + remainingZ * sweepHit.normalZ
    if (intoSurface < 0) {
      remainingX -= sweepHit.normalX * intoSurface
      remainingZ -= sweepHit.normalZ * intoSurface
    }
  }
  if (
    enforceSupport &&
    navigationLayerIndex !== undefined &&
    !navigationSegmentStaysSupported(world, navigationLayerIndex, startX, startZ, x, z)
  ) {
    let supportedAmount = 0
    let unsupportedAmount = 1
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const amount = (supportedAmount + unsupportedAmount) / 2
      const candidateX = startX + (x - startX) * amount
      const candidateZ = startZ + (z - startZ) * amount
      if (
        navigationSegmentStaysSupported(
          world,
          navigationLayerIndex,
          startX,
          startZ,
          candidateX,
          candidateZ,
        )
      ) {
        supportedAmount = amount
      } else {
        unsupportedAmount = amount
      }
    }
    x = startX + (x - startX) * supportedAmount
    z = startZ + (z - startZ) * supportedAmount
    output.collided = true
  }
  output.x = x
  output.z = z
  return output
}

export function moveZombieEscapeNavigationAgent(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startY: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  connectorIndex: number,
  connectorTargetEnd: boolean,
  hit: ZombieEscapeCollisionHit,
  output: ZombieEscapeNavigationMoveResult,
  requestedConnectorIndex = -1,
  requestedConnectorTargetEnd = false,
  connectorRadius = radius,
) {
  const traversal = resolveActiveNavigationConnectorTraversal(
    world,
    connectorIndex,
    connectorTargetEnd,
    startX,
    startY,
    startZ,
    displacementX,
    displacementZ,
    requestedConnectorIndex,
    requestedConnectorTargetEnd,
  )
  let activeConnectorIndex = traversal.connectorIndex
  const targetEnd = traversal.targetEnd
  const connector = world.navigationConnectors[activeConnectorIndex]
  if (!connector) {
    const sourceLayerIndex = resolveZombieEscapePinnedNavigationLayerIndex(
      world,
      startX,
      startZ,
      startY,
    )
    moveZombieEscapeCircleWithSlideOnLayer(
      world,
      startX,
      startZ,
      displacementX,
      displacementZ,
      radius,
      hit,
      output,
      undefined,
      sourceLayerIndex,
    )
    output.connectorIndex = -1
    output.connectorTargetEnd = false
    output.y = world.navigationLayers[sourceLayerIndex]?.elevation ?? startY
    return output
  }

  const directionAmount = targetEnd ? 1 : -1
  const requestedAlongRun =
    (displacementX * connector.directionX + displacementZ * connector.directionZ) * directionAmount
  const travel = traversal.continuesActiveTraversal
    ? Math.hypot(displacementX, displacementZ)
    : Math.max(0, requestedAlongRun)
  moveZombieEscapeCircleWithSlideOnLayer(
    world,
    startX,
    startZ,
    connector.directionX * directionAmount * travel,
    connector.directionZ * directionAmount * travel,
    connectorRadius,
    hit,
    output,
    undefined,
    resolveNavigationLayerIndex(world, startY),
    false,
  )
  const projection = navigationConnectorProjection(connector, output.x, output.z)
  const amount = Math.max(0, Math.min(1, projection / connector.length))
  output.y = connector.startY + (connector.endY - connector.startY) * amount
  const exitDistance = Math.max(0, radius) + COLLISION_EPSILON_METERS
  if (
    (targetEnd && projection >= connector.length + exitDistance) ||
    (!targetEnd && projection <= -exitDistance)
  ) {
    output.y = targetEnd ? connector.endY : connector.startY
    const ascending = targetEnd === connector.ascendingEnd
    activeConnectorIndex = resolveNavigationConnectorChainNeighbor(
      world,
      activeConnectorIndex,
      ascending,
    )
    const nextConnector = world.navigationConnectors[activeConnectorIndex]
    if (nextConnector) {
      const nextTargetEnd = ascending ? nextConnector.ascendingEnd : !nextConnector.ascendingEnd
      const nextSourceEnd = !nextTargetEnd
      output.x = nextSourceEnd ? nextConnector.endX : nextConnector.startX
      output.y = nextSourceEnd ? nextConnector.endY : nextConnector.startY
      output.z = nextSourceEnd ? nextConnector.endZ : nextConnector.startZ
    }
  }
  output.connectorIndex = activeConnectorIndex
  const nextConnector = world.navigationConnectors[activeConnectorIndex]
  output.connectorTargetEnd = nextConnector
    ? targetEnd === connector.ascendingEnd
      ? nextConnector.ascendingEnd
      : !nextConnector.ascendingEnd
    : false
  return output
}

function resolveNavigationConnectorChainNeighbor(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  ascending: boolean,
) {
  const connector = world.navigationConnectors[connectorIndex]
  if (!connector) return -1
  const targetOrder = connector.chainOrder + (ascending ? 1 : -1)
  return world.navigationConnectors.findIndex(
    (candidate) => candidate.chainId === connector.chainId && candidate.chainOrder === targetOrder,
  )
}

function zombieEscapeNavigationConnectorRequestCanActivate(
  world: ZombieEscapeCollisionWorld,
  connector: ZombieEscapeNavigationConnector,
  targetEnd: boolean,
  x: number,
  y: number,
  z: number,
  displacementX: number,
  displacementZ: number,
) {
  const sourceX = targetEnd ? connector.startX : connector.endX
  const sourceY = targetEnd ? connector.startY : connector.endY
  const sourceZ = targetEnd ? connector.startZ : connector.endZ
  if (Math.abs(y - sourceY) > NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS) return false
  const directionAmount = targetEnd ? 1 : -1
  const towardRunX = connector.directionX * directionAmount
  const towardRunZ = connector.directionZ * directionAmount
  if (displacementX * towardRunX + displacementZ * towardRunZ <= 0) return false
  const offsetX = x - sourceX
  const offsetZ = z - sourceZ
  const along = offsetX * towardRunX + offsetZ * towardRunZ
  const lateral = Math.abs(offsetX * -towardRunZ + offsetZ * towardRunX)
  const stateEnvelopeDistance = zombieEscapeNavigationConnectorStateEnvelopeDistance(world)
  return (
    along >= -stateEnvelopeDistance &&
    along <= stateEnvelopeDistance &&
    lateral <= Math.max(0, connector.halfWidth - Math.max(0, world.agentRadius))
  )
}

function zombieEscapeNavigationConnectorTraversalIsActive(
  world: ZombieEscapeCollisionWorld,
  connector: ZombieEscapeNavigationConnector,
  x: number,
  y: number,
  z: number,
) {
  const projection = navigationConnectorProjection(connector, x, z)
  const lateralDistance = Math.abs(navigationConnectorLateralDistance(connector, x, z))
  const amount = Math.max(0, Math.min(1, projection / connector.length))
  const surfaceY = connector.startY + (connector.endY - connector.startY) * amount
  const stateEnvelopeDistance = zombieEscapeNavigationConnectorStateEnvelopeDistance(world)
  return (
    projection >= -stateEnvelopeDistance &&
    projection <= connector.length + stateEnvelopeDistance &&
    lateralDistance <= connector.halfWidth + COLLISION_EPSILON_METERS &&
    Math.abs(y - surfaceY) <= NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS
  )
}

function zombieEscapeNavigationConnectorStateEnvelopeDistance(world: ZombieEscapeCollisionWorld) {
  return Math.max(0, world.agentRadius) + Math.max(0, world.cellSize) * 1.5
}

function resolveActiveNavigationConnectorTraversal(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  connectorTargetEnd: boolean,
  x: number,
  y: number,
  z: number,
  displacementX: number,
  displacementZ: number,
  requestedConnectorIndex: number,
  requestedConnectorTargetEnd: boolean,
) {
  const active = world.navigationConnectors[connectorIndex]
  if (active && zombieEscapeNavigationConnectorTraversalIsActive(world, active, x, y, z)) {
    return {
      connectorIndex,
      continuesActiveTraversal: true,
      targetEnd: connectorTargetEnd,
    }
  }

  const requested = world.navigationConnectors[requestedConnectorIndex]
  if (!requested) {
    return { connectorIndex: -1, continuesActiveTraversal: false, targetEnd: false }
  }
  return zombieEscapeNavigationConnectorRequestCanActivate(
    world,
    requested,
    requestedConnectorTargetEnd,
    x,
    y,
    z,
    displacementX,
    displacementZ,
  )
    ? {
        connectorIndex: requestedConnectorIndex,
        continuesActiveTraversal: false,
        targetEnd: requestedConnectorTargetEnd,
      }
    : { connectorIndex: -1, continuesActiveTraversal: false, targetEnd: false }
}

function navigationConnectorProjection(
  connector: ZombieEscapeNavigationConnector,
  x: number,
  z: number,
) {
  return (
    (x - connector.startX) * connector.directionX + (z - connector.startZ) * connector.directionZ
  )
}

function navigationConnectorLateralDistance(
  connector: ZombieEscapeNavigationConnector,
  x: number,
  z: number,
) {
  return (
    (x - connector.startX) * -connector.directionZ + (z - connector.startZ) * connector.directionX
  )
}

export function sweepZombieEscapeCircleAgainstWorld(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  output: ZombieEscapeCollisionHit,
  ignoredObjectIds?: ReadonlySet<string>,
) {
  return sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    radius,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    output,
    undefined,
    0,
    undefined,
    ignoredObjectIds,
  )
}

export function sweepZombieEscapeCircleAgainstWorldInVerticalRange(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  minimumY: number,
  maximumY: number,
  output: ZombieEscapeCollisionHit,
) {
  const resolvedMinimumY = Math.min(minimumY, maximumY)
  const resolvedMaximumY = Math.max(minimumY, maximumY)
  return sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    radius,
    resolvedMinimumY,
    resolvedMaximumY,
    output,
  )
}

export function sweepZombieEscapeProjectileAgainstWorld(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startY: number,
  startZ: number,
  displacementX: number,
  displacementY: number,
  displacementZ: number,
  radius: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  const endY = startY + displacementY
  const sweepRadius = Math.max(0, radius)
  return sweepZombieEscapeCircleAgainstWorldRange(
    world,
    startX,
    startZ,
    displacementX,
    displacementZ,
    sweepRadius,
    Math.min(startY, endY) - sweepRadius,
    Math.max(startY, endY) + sweepRadius,
    output,
    startY,
    displacementY,
    candidate,
  )
}

function sweepZombieEscapeCircleAgainstWorldRange(
  world: ZombieEscapeCollisionWorld,
  startX: number,
  startZ: number,
  displacementX: number,
  displacementZ: number,
  radius: number,
  minimumY: number,
  maximumY: number,
  output: ZombieEscapeCollisionHit,
  trajectoryStartY?: number,
  trajectoryDisplacementY = 0,
  trajectoryCandidate?: ZombieEscapeCollisionHit,
  ignoredObjectIds?: ReadonlySet<string>,
  navigationLayerIndex?: number,
) {
  resetCollisionHit(output)
  const endX = startX + displacementX
  const endZ = startZ + displacementZ
  const sweepRadius = Math.max(0, radius)

  if (world.boundaryPolicy === 'solid') {
    const boundaryRadius = Math.max(0, world.playRadius - sweepRadius)
    const boundaryAmount = segmentCircleExitIntersectionAmount(
      startX,
      startZ,
      endX,
      endZ,
      boundaryRadius,
    )
    if (boundaryAmount < output.time) {
      const hitX = startX + displacementX * boundaryAmount
      const hitZ = startZ + displacementZ * boundaryAmount
      const inverseLength = 1 / Math.max(INTERSECTION_EPSILON, Math.hypot(hitX, hitZ))
      output.colliderIndex = -1
      output.colliderKind = 'boundary'
      output.normalX = -hitX * inverseLength
      output.normalY = 0
      output.normalZ = -hitZ * inverseLength
      output.time = boundaryAmount
    }
  }

  const broadphase = world.broadphase
  const minimumX = Math.min(startX, endX) - sweepRadius
  const maximumX = Math.max(startX, endX) + sweepRadius
  const minimumZ = Math.min(startZ, endZ) - sweepRadius
  const maximumZ = Math.max(startZ, endZ) + sweepRadius
  const broadphaseMaximumX = broadphase.gridOriginX + broadphase.gridWidth * broadphase.cellSize
  const broadphaseMaximumZ = broadphase.gridOriginZ + broadphase.gridHeight * broadphase.cellSize
  if (
    maximumX < broadphase.gridOriginX ||
    maximumZ < broadphase.gridOriginZ ||
    minimumX > broadphaseMaximumX ||
    minimumZ > broadphaseMaximumZ
  ) {
    return output
  }
  const minimumColumn = clampGridIndex(
    Math.floor((minimumX - broadphase.gridOriginX) / broadphase.cellSize),
    broadphase.gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((maximumX - broadphase.gridOriginX) / broadphase.cellSize),
    broadphase.gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((minimumZ - broadphase.gridOriginZ) / broadphase.cellSize),
    broadphase.gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((maximumZ - broadphase.gridOriginZ) / broadphase.cellSize),
    broadphase.gridHeight,
  )
  const epoch = beginBroadphaseVisit(broadphase)
  let traversalStartAmount = 0
  let traversalEndAmount = 1
  const traversalMinimumX = broadphase.gridOriginX - sweepRadius
  const traversalMaximumX = broadphaseMaximumX + sweepRadius
  const traversalMinimumZ = broadphase.gridOriginZ - sweepRadius
  const traversalMaximumZ = broadphaseMaximumZ + sweepRadius
  if (displacementX === 0) {
    if (startX < traversalMinimumX || startX > traversalMaximumX) return output
  } else {
    let first = (traversalMinimumX - startX) / displacementX
    let second = (traversalMaximumX - startX) / displacementX
    if (first > second) {
      const swap = first
      first = second
      second = swap
    }
    traversalStartAmount = Math.max(traversalStartAmount, first)
    traversalEndAmount = Math.min(traversalEndAmount, second)
  }
  if (displacementZ === 0) {
    if (startZ < traversalMinimumZ || startZ > traversalMaximumZ) return output
  } else {
    let first = (traversalMinimumZ - startZ) / displacementZ
    let second = (traversalMaximumZ - startZ) / displacementZ
    if (first > second) {
      const swap = first
      first = second
      second = swap
    }
    traversalStartAmount = Math.max(traversalStartAmount, first)
    traversalEndAmount = Math.min(traversalEndAmount, second)
  }
  if (traversalStartAmount > traversalEndAmount) return output

  const traversalStartX = startX + displacementX * traversalStartAmount
  const traversalStartZ = startZ + displacementZ * traversalStartAmount
  const traversalEndX = startX + displacementX * traversalEndAmount
  const traversalEndZ = startZ + displacementZ * traversalEndAmount
  const traversalX = traversalEndX - traversalStartX
  const traversalZ = traversalEndZ - traversalStartZ
  const neighborhoodRadius = sweepRadius > 0 ? Math.floor(sweepRadius / broadphase.cellSize) + 1 : 0
  let column = Math.floor((traversalStartX - broadphase.gridOriginX) / broadphase.cellSize)
  let row = Math.floor((traversalStartZ - broadphase.gridOriginZ) / broadphase.cellSize)
  const columnStep = Math.sign(traversalX)
  const rowStep = Math.sign(traversalZ)
  const columnAmountDelta =
    columnStep === 0 ? Number.POSITIVE_INFINITY : broadphase.cellSize / Math.abs(traversalX)
  const rowAmountDelta =
    rowStep === 0 ? Number.POSITIVE_INFINITY : broadphase.cellSize / Math.abs(traversalZ)
  const nextColumnBoundary =
    broadphase.gridOriginX + (column + (columnStep > 0 ? 1 : 0)) * broadphase.cellSize
  const nextRowBoundary =
    broadphase.gridOriginZ + (row + (rowStep > 0 ? 1 : 0)) * broadphase.cellSize
  const startsOnColumnBoundary = broadphaseCoordinateIsGridBoundary(
    traversalStartX,
    broadphase.gridOriginX,
    broadphase.cellSize,
  )
  const startsOnRowBoundary = broadphaseCoordinateIsGridBoundary(
    traversalStartZ,
    broadphase.gridOriginZ,
    broadphase.cellSize,
  )
  const followsColumnBoundary = columnStep === 0 && startsOnColumnBoundary
  const followsRowBoundary = rowStep === 0 && startsOnRowBoundary
  let nextColumnAmount =
    columnStep === 0
      ? Number.POSITIVE_INFINITY
      : (nextColumnBoundary - traversalStartX) / traversalX
  let nextRowAmount =
    rowStep === 0 ? Number.POSITIVE_INFINITY : (nextRowBoundary - traversalStartZ) / traversalZ
  const endColumn = Math.floor((traversalEndX - broadphase.gridOriginX) / broadphase.cellSize)
  const endRow = Math.floor((traversalEndZ - broadphase.gridOriginZ) / broadphase.cellSize)
  const columnSpan = Math.abs(
    clampGridIndex(endColumn, broadphase.gridWidth) - clampGridIndex(column, broadphase.gridWidth),
  )
  const rowSpan = Math.abs(
    clampGridIndex(endRow, broadphase.gridHeight) - clampGridIndex(row, broadphase.gridHeight),
  )
  const supercoverCenterCellBound = 1 + columnSpan + rowSpan + Math.min(columnSpan, rowSpan)
  const neighborhoodDiameter = neighborhoodRadius * 2 + 1
  const supercoverCellEstimate =
    supercoverCenterCellBound * neighborhoodDiameter + neighborhoodDiameter * neighborhoodDiameter
  const aabbCellCount = (maximumColumn - minimumColumn + 1) * (maximumRow - minimumRow + 1)
  let candidateCount = 0
  if (!followsColumnBoundary && !followsRowBoundary && aabbCellCount <= supercoverCellEstimate) {
    for (let candidateRow = minimumRow; candidateRow <= maximumRow; candidateRow += 1) {
      for (
        let candidateColumn = minimumColumn;
        candidateColumn <= maximumColumn;
        candidateColumn += 1
      ) {
        candidateCount = appendBroadphaseNeighborhoodCandidates(
          broadphase,
          candidateColumn,
          candidateRow,
          0,
          epoch,
          candidateCount,
        )
      }
    }
  } else {
    candidateCount = appendBroadphaseSupercoverCandidates(
      broadphase,
      column,
      row,
      neighborhoodRadius,
      epoch,
      candidateCount,
      startsOnColumnBoundary,
      startsOnRowBoundary,
    )
    while (Math.min(nextColumnAmount, nextRowAmount) <= 1 + INTERSECTION_EPSILON) {
      if (Math.abs(nextColumnAmount - nextRowAmount) <= INTERSECTION_EPSILON) {
        const nextColumn = column + columnStep
        const nextRow = row + rowStep
        candidateCount = appendBroadphaseNeighborhoodCandidates(
          broadphase,
          nextColumn,
          row,
          neighborhoodRadius,
          epoch,
          candidateCount,
        )
        candidateCount = appendBroadphaseNeighborhoodCandidates(
          broadphase,
          column,
          nextRow,
          neighborhoodRadius,
          epoch,
          candidateCount,
        )
        column = nextColumn
        row = nextRow
        nextColumnAmount += columnAmountDelta
        nextRowAmount += rowAmountDelta
      } else if (nextColumnAmount < nextRowAmount) {
        column += columnStep
        nextColumnAmount += columnAmountDelta
      } else {
        row += rowStep
        nextRowAmount += rowAmountDelta
      }
      candidateCount = appendBroadphaseSupercoverCandidates(
        broadphase,
        column,
        row,
        neighborhoodRadius,
        epoch,
        candidateCount,
        followsColumnBoundary,
        followsRowBoundary,
      )
    }
  }

  const segmentCount = world.segments.length
  const circleCount = world.circles.length
  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    const colliderIndex = broadphase.candidateIndices[candidateIndex]!
    if (!zombieEscapeColliderIndexIsActive(world, colliderIndex)) continue
    if (colliderIndex < segmentCount) {
      const segment = world.segments[colliderIndex]!
      if (ignoredObjectIds?.has(segment.objectId)) continue
      if (!colliderMatchesNavigationLayer(world, segment, navigationLayerIndex)) continue
      if (!verticalRangesOverlap(segment, minimumY, maximumY)) continue
      if (trajectoryStartY === undefined || trajectoryCandidate === undefined) {
        updateSegmentHit(
          startX,
          startZ,
          endX,
          endZ,
          segment,
          segment.halfThickness + sweepRadius,
          colliderIndex,
          output,
        )
      } else {
        updateTrajectorySegmentHit(
          startX,
          trajectoryStartY,
          startZ,
          endX,
          endZ,
          trajectoryDisplacementY,
          segment,
          segment.halfThickness + sweepRadius,
          sweepRadius,
          colliderIndex,
          output,
          trajectoryCandidate,
        )
      }
      continue
    }

    if (colliderIndex < segmentCount + circleCount) {
      const circleIndex = colliderIndex - segmentCount
      const circle = world.circles[circleIndex]!
      if (ignoredObjectIds?.has(circle.objectId)) continue
      if (!colliderMatchesNavigationLayer(world, circle, navigationLayerIndex)) continue
      if (!verticalRangesOverlap(circle, minimumY, maximumY)) continue
      if (trajectoryStartY === undefined || trajectoryCandidate === undefined) {
        updateCircleHit(
          startX,
          startZ,
          endX,
          endZ,
          circle,
          circle.radius + sweepRadius,
          circleIndex,
          output,
        )
      } else {
        updateTrajectoryCircleHit(
          startX,
          trajectoryStartY,
          startZ,
          endX,
          endZ,
          trajectoryDisplacementY,
          circle,
          circle.radius + sweepRadius,
          sweepRadius,
          circleIndex,
          output,
          trajectoryCandidate,
        )
      }
      continue
    }

    const boxIndex = colliderIndex - segmentCount - circleCount
    const box = world.boxes[boxIndex]!
    if (ignoredObjectIds?.has(box.objectId)) continue
    if (!colliderMatchesNavigationLayer(world, box, navigationLayerIndex)) continue
    if (!verticalRangesOverlap(box, minimumY, maximumY)) continue
    if (trajectoryStartY === undefined || trajectoryCandidate === undefined) {
      updateBoxHit(startX, startZ, endX, endZ, box, sweepRadius, boxIndex, output)
    } else {
      updateTrajectoryBoxHit(
        startX,
        trajectoryStartY,
        startZ,
        endX,
        endZ,
        trajectoryDisplacementY,
        box,
        sweepRadius,
        boxIndex,
        output,
        trajectoryCandidate,
      )
    }
  }
  return output
}

function createCollisionBroadphase(
  playRadius: number,
  boundaryPolicy: ZombieEscapeCollisionBoundaryPolicy,
  cellSize: number,
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
): ZombieEscapeCollisionBroadphase {
  const colliderBounds = resolveCollisionAabb(boxes, circles, segments)
  const useColliderBounds = boundaryPolicy === 'none' && colliderBounds !== null
  const gridOriginX = useColliderBounds
    ? Math.floor(colliderBounds.minimumX / cellSize) * cellSize
    : boundaryPolicy === 'none'
      ? -cellSize / 2
      : -Math.ceil((playRadius * 2) / cellSize) * cellSize * 0.5
  const gridOriginZ = useColliderBounds
    ? Math.floor(colliderBounds.minimumZ / cellSize) * cellSize
    : boundaryPolicy === 'none'
      ? -cellSize / 2
      : -Math.ceil((playRadius * 2) / cellSize) * cellSize * 0.5
  const gridWidth = useColliderBounds
    ? Math.max(1, Math.ceil((colliderBounds.maximumX - gridOriginX) / cellSize))
    : boundaryPolicy === 'none'
      ? 1
      : Math.max(1, Math.ceil((playRadius * 2) / cellSize))
  const gridHeight = useColliderBounds
    ? Math.max(1, Math.ceil((colliderBounds.maximumZ - gridOriginZ) / cellSize))
    : boundaryPolicy === 'none'
      ? 1
      : gridWidth
  const cellCounts = new Uint32Array(gridWidth * gridHeight)

  for (const segment of segments) {
    addColliderToCellCounts(
      cellCounts,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      Math.min(segment.startX, segment.endX) - segment.halfThickness,
      Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
      Math.max(segment.startX, segment.endX) + segment.halfThickness,
      Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
    )
  }
  for (const circle of circles) {
    addColliderToCellCounts(
      cellCounts,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      circle.x - circle.radius,
      circle.z - circle.radius,
      circle.x + circle.radius,
      circle.z + circle.radius,
    )
  }
  for (const box of boxes) {
    const bounds = resolveBoxAabb(box)
    addColliderToCellCounts(
      cellCounts,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      bounds.minimumX,
      bounds.minimumZ,
      bounds.maximumX,
      bounds.maximumZ,
    )
  }

  const cellOffsets = new Uint32Array(cellCounts.length + 1)
  for (let cell = 0; cell < cellCounts.length; cell += 1) {
    cellOffsets[cell + 1] = cellOffsets[cell]! + cellCounts[cell]!
  }
  const colliderIndices = new Uint32Array(cellOffsets[cellOffsets.length - 1] ?? 0)
  const writeOffsets = cellOffsets.slice(0, -1)
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!
    writeColliderToCells(
      colliderIndices,
      writeOffsets,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      Math.min(segment.startX, segment.endX) - segment.halfThickness,
      Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
      Math.max(segment.startX, segment.endX) + segment.halfThickness,
      Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
      index,
    )
  }
  for (let index = 0; index < circles.length; index += 1) {
    const circle = circles[index]!
    writeColliderToCells(
      colliderIndices,
      writeOffsets,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      circle.x - circle.radius,
      circle.z - circle.radius,
      circle.x + circle.radius,
      circle.z + circle.radius,
      segments.length + index,
    )
  }
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]!
    const bounds = resolveBoxAabb(box)
    writeColliderToCells(
      colliderIndices,
      writeOffsets,
      gridWidth,
      gridHeight,
      gridOriginX,
      gridOriginZ,
      cellSize,
      bounds.minimumX,
      bounds.minimumZ,
      bounds.maximumX,
      bounds.maximumZ,
      segments.length + circles.length + index,
    )
  }

  return {
    candidateIndices: new Uint32Array(segments.length + circles.length + boxes.length),
    cellOffsets,
    cellSize,
    cellVisitStamps: new Uint32Array(gridWidth * gridHeight),
    colliderIndices,
    gridHeight,
    gridOriginX,
    gridOriginZ,
    gridWidth,
    visitEpoch: new Uint32Array(1),
    visitStamps: new Uint32Array(segments.length + circles.length + boxes.length),
  }
}

function resolveCollisionAabb(
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
): CollisionAabbBounds | null {
  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  const include = (bounds: CollisionAabbBounds) => {
    maximumX = Math.max(maximumX, bounds.maximumX)
    maximumZ = Math.max(maximumZ, bounds.maximumZ)
    minimumX = Math.min(minimumX, bounds.minimumX)
    minimumZ = Math.min(minimumZ, bounds.minimumZ)
  }
  for (const segment of segments) {
    include({
      maximumX: Math.max(segment.startX, segment.endX) + segment.halfThickness,
      maximumZ: Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
      minimumX: Math.min(segment.startX, segment.endX) - segment.halfThickness,
      minimumZ: Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
    })
  }
  for (const circle of circles) {
    include({
      maximumX: circle.x + circle.radius,
      maximumZ: circle.z + circle.radius,
      minimumX: circle.x - circle.radius,
      minimumZ: circle.z - circle.radius,
    })
  }
  for (const box of boxes) include(resolveBoxAabb(box))
  return Number.isFinite(minimumX) ? { maximumX, maximumZ, minimumX, minimumZ } : null
}

function addColliderToCellCounts(
  counts: Uint32Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
) {
  const bounds = resolveGridAabbBounds(
    gridWidth,
    gridHeight,
    originX,
    originZ,
    cellSize,
    minimumX,
    minimumZ,
    maximumX,
    maximumZ,
  )
  if (!bounds) return
  for (let row = bounds.minimumRow; row <= bounds.maximumRow; row += 1) {
    for (let column = bounds.minimumColumn; column <= bounds.maximumColumn; column += 1) {
      counts[row * gridWidth + column]! += 1
    }
  }
}

function writeColliderToCells(
  colliderIndices: Uint32Array,
  writeOffsets: Uint32Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
  colliderIndex: number,
) {
  const bounds = resolveGridAabbBounds(
    gridWidth,
    gridHeight,
    originX,
    originZ,
    cellSize,
    minimumX,
    minimumZ,
    maximumX,
    maximumZ,
  )
  if (!bounds) return
  for (let row = bounds.minimumRow; row <= bounds.maximumRow; row += 1) {
    for (let column = bounds.minimumColumn; column <= bounds.maximumColumn; column += 1) {
      const cell = row * gridWidth + column
      colliderIndices[writeOffsets[cell]!] = colliderIndex
      writeOffsets[cell]! += 1
    }
  }
}

function resolveGridAabbBounds(
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
): GridAabbBounds | null {
  const gridMaximumX = originX + gridWidth * cellSize
  const gridMaximumZ = originZ + gridHeight * cellSize
  if (
    maximumX < originX ||
    maximumZ < originZ ||
    minimumX > gridMaximumX ||
    minimumZ > gridMaximumZ
  ) {
    return null
  }
  return {
    maximumColumn: clampGridIndex(Math.floor((maximumX - originX) / cellSize), gridWidth),
    maximumRow: clampGridIndex(Math.floor((maximumZ - originZ) / cellSize), gridHeight),
    minimumColumn: clampGridIndex(Math.floor((minimumX - originX) / cellSize), gridWidth),
    minimumRow: clampGridIndex(Math.floor((minimumZ - originZ) / cellSize), gridHeight),
  }
}

function beginBroadphaseVisit(broadphase: ZombieEscapeCollisionBroadphase) {
  let epoch = (broadphase.visitEpoch[0]! + 1) >>> 0
  if (epoch === 0) {
    broadphase.cellVisitStamps.fill(0)
    broadphase.visitStamps.fill(0)
    epoch = 1
  }
  broadphase.visitEpoch[0] = epoch
  return epoch
}

function appendBroadphaseNeighborhoodCandidates(
  broadphase: ZombieEscapeCollisionBroadphase,
  centerColumn: number,
  centerRow: number,
  radius: number,
  epoch: number,
  candidateCount: number,
) {
  const minimumColumn = Math.max(0, centerColumn - radius)
  const maximumColumn = Math.min(broadphase.gridWidth - 1, centerColumn + radius)
  const minimumRow = Math.max(0, centerRow - radius)
  const maximumRow = Math.min(broadphase.gridHeight - 1, centerRow + radius)
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const cell = row * broadphase.gridWidth + column
      if (broadphase.cellVisitStamps[cell] === epoch) continue
      broadphase.cellVisitStamps[cell] = epoch
      const endOffset = broadphase.cellOffsets[cell + 1]!
      for (let offset = broadphase.cellOffsets[cell]!; offset < endOffset; offset += 1) {
        const colliderIndex = broadphase.colliderIndices[offset]!
        if (broadphase.visitStamps[colliderIndex] === epoch) continue
        broadphase.visitStamps[colliderIndex] = epoch
        broadphase.candidateIndices[candidateCount] = colliderIndex
        candidateCount += 1
      }
    }
  }
  return candidateCount
}

function appendBroadphaseSupercoverCandidates(
  broadphase: ZombieEscapeCollisionBroadphase,
  column: number,
  row: number,
  radius: number,
  epoch: number,
  candidateCount: number,
  includePreviousColumn: boolean,
  includePreviousRow: boolean,
) {
  candidateCount = appendBroadphaseNeighborhoodCandidates(
    broadphase,
    column,
    row,
    radius,
    epoch,
    candidateCount,
  )
  if (includePreviousColumn) {
    candidateCount = appendBroadphaseNeighborhoodCandidates(
      broadphase,
      column - 1,
      row,
      radius,
      epoch,
      candidateCount,
    )
  }
  if (includePreviousRow) {
    candidateCount = appendBroadphaseNeighborhoodCandidates(
      broadphase,
      column,
      row - 1,
      radius,
      epoch,
      candidateCount,
    )
  }
  return includePreviousColumn && includePreviousRow
    ? appendBroadphaseNeighborhoodCandidates(
        broadphase,
        column - 1,
        row - 1,
        radius,
        epoch,
        candidateCount,
      )
    : candidateCount
}

function broadphaseCoordinateIsGridBoundary(value: number, origin: number, cellSize: number) {
  const gridCoordinate = (value - origin) / cellSize
  return Math.abs(gridCoordinate - Math.round(gridCoordinate)) <= INTERSECTION_EPSILON
}

function createNavigationLayers(
  playRadius: number,
  agentRadius: number,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
  supports: readonly ZombieEscapeNavigationSupportSource[],
) {
  const elevations = createNavigationLayerElevations(supports)
  const maximumCenterRadius = Math.max(0, playRadius - agentRadius)
  return elevations.map((elevation) => {
    const support = new Uint8Array(gridWidth * gridHeight)
    const supportSources = supports.filter((candidate) =>
      navigationSupportElevationsMatch(candidate.elevation, elevation),
    )
    const implicitGround = navigationSupportElevationsMatch(elevation, 0)
    for (let row = 0; row < gridHeight; row += 1) {
      const z = originZ + (row + 0.5) * cellSize
      for (let column = 0; column < gridWidth; column += 1) {
        const x = originX + (column + 0.5) * cellSize
        if (
          pointHasNavigationSupport(
            x,
            z,
            agentRadius,
            maximumCenterRadius,
            implicitGround,
            supportSources,
          )
        ) {
          support[row * gridWidth + column] = 1
        }
      }
    }
    const occupancy = new Uint8Array(support.length)
    for (let cell = 0; cell < support.length; cell += 1) {
      occupancy[cell] = support[cell] === 1 ? 0 : 1
    }
    const breakableOpenOccupancy = occupancy.slice()
    for (const circle of circles) {
      if (!colliderVerticalRangeBlocksNavigationElevation(circle, elevation)) continue
      rasterizeCircle(
        occupancy,
        gridWidth,
        gridHeight,
        originX,
        originZ,
        cellSize,
        circle,
        agentRadius,
      )
      if (!circle.breakable) {
        rasterizeCircle(
          breakableOpenOccupancy,
          gridWidth,
          gridHeight,
          originX,
          originZ,
          cellSize,
          circle,
          agentRadius,
        )
      }
    }
    for (const box of boxes) {
      if (!colliderVerticalRangeBlocksNavigationElevation(box, elevation)) continue
      rasterizeBox(occupancy, gridWidth, gridHeight, originX, originZ, cellSize, box, agentRadius)
      if (!box.breakable) {
        rasterizeBox(
          breakableOpenOccupancy,
          gridWidth,
          gridHeight,
          originX,
          originZ,
          cellSize,
          box,
          agentRadius,
        )
      }
    }
    for (const segment of segments) {
      if (!colliderVerticalRangeBlocksNavigationElevation(segment, elevation)) continue
      rasterizeSegment(
        occupancy,
        gridWidth,
        gridHeight,
        originX,
        originZ,
        cellSize,
        segment,
        agentRadius,
      )
      if (!segment.breakable) {
        rasterizeSegment(
          breakableOpenOccupancy,
          gridWidth,
          gridHeight,
          originX,
          originZ,
          cellSize,
          segment,
          agentRadius,
        )
      }
    }
    return { breakableOpenOccupancy, elevation, occupancy, support }
  })
}

function createSparseNavigationLayers(supports: readonly ZombieEscapeNavigationSupportSource[]) {
  return createNavigationLayerElevations(supports).map((elevation) => ({
    breakableOpenOccupancy: new Uint8Array(0),
    elevation,
    occupancy: new Uint8Array(0),
    support: new Uint8Array(0),
  }))
}

function createSparseNavigationGraph(
  world: ZombieEscapeCollisionWorld,
): ZombieEscapeSparseNavigationGraph {
  const collisionHit = createZombieEscapeCollisionHit()
  const ignoredBreakableObjectIds = new Set<string>()
  const breakableObjectIndexById = new Map<string, number>()
  for (let index = 0; index < world.objectCatalog.breakableObjectOrdinals.length; index += 1) {
    const objectId =
      world.objectCatalog.objectIds[world.objectCatalog.breakableObjectOrdinals[index]!]
    if (objectId) breakableObjectIndexById.set(objectId, index)
  }
  return createZombieEscapeSparseNavigationGraph(
    {
      agentRadius: world.agentRadius,
      boxes: world.boxes.map((box) => ({
        breakable: box.breakable,
        centerX: box.centerX,
        centerZ: box.centerZ,
        halfDepth: box.halfDepth,
        halfWidth: box.halfWidth,
        maximumY: box.maximumY,
        minimumY: box.minimumY,
        worldAxisX: box.cosine,
        worldAxisZ: -box.sine,
      })),
      cellSize: world.cellSize,
      circles: world.circles,
      navigationConnectorChains: groupNavigationConnectorIndicesByChain(world.navigationConnectors),
      navigationConnectors: world.navigationConnectors,
      navigationLayers: world.navigationLayers,
      navigationSupports: world.navigationSupports,
      segments: world.segments,
    },
    {
      breachObjectOrdinals: world.objectCatalog.breakableObjectOrdinals,
      candidateIsClear: (layerIndex, x, z, breakablesTraversable) =>
        zombieEscapeNavigationSegmentIsClear(
          world,
          layerIndex,
          x,
          z,
          x,
          z,
          world.agentRadius,
          collisionHit,
          breakablesTraversable ? world.breakableObjectIds : undefined,
        ),
      resolveLayerIndex: (elevation) => resolveNavigationLayerIndex(world, elevation),
      resolvePairTraversal: (first, second, output) =>
        resolveSparseNavigationPairTraversal(
          world,
          first,
          second,
          collisionHit,
          ignoredBreakableObjectIds,
          breakableObjectIndexById,
          output,
        ),
      resolveSupportIndices: (layerIndex, x, z) =>
        resolveSparseNavigationCandidateSupportIndices(world, layerIndex, x, z),
    },
  )
}

function resolveSparseNavigationCandidateSupportIndices(
  world: ZombieEscapeCollisionWorld,
  layerIndex: number,
  x: number,
  z: number,
) {
  const supportIndices: number[] = []
  const layerAcceleration = world.navigationSupportAcceleration.layers[layerIndex]
  if (!layerAcceleration) return supportIndices
  const hierarchy = layerAcceleration.hierarchy
  let nodeIndex = 0
  while (nodeIndex < hierarchy.nodeItemCounts.length) {
    if (!navigationBoundsHierarchyNodeMayContainPoint(hierarchy, nodeIndex, x, z)) {
      nodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
    if (itemCount > 0) {
      const itemEnd = hierarchy.nodeItemOffsets[nodeIndex]! + itemCount
      for (
        let itemOffset = hierarchy.nodeItemOffsets[nodeIndex]!;
        itemOffset < itemEnd;
        itemOffset += 1
      ) {
        const supportIndex = hierarchy.itemIndices[itemOffset]!
        const acceleration = world.navigationSupportAcceleration.supports[supportIndex]!
        if (
          navigationSupportBoundsMayContainPoint(acceleration.bounds, x, z) &&
          navigationSupportContainsDisk(
            world.navigationSupports[supportIndex]!,
            acceleration,
            x,
            z,
            world.agentRadius,
          )
        ) {
          supportIndices.push(supportIndex)
        }
      }
    }
    nodeIndex += 1
  }
  supportIndices.sort((first, second) => first - second)
  return supportIndices
}

function resolveSparseNavigationPairTraversal(
  world: ZombieEscapeCollisionWorld,
  first: ZombieEscapeSparseNavigationCandidatePoint,
  second: ZombieEscapeSparseNavigationCandidatePoint,
  collisionHit: ZombieEscapeCollisionHit,
  ignoredBreakableObjectIds: Set<string>,
  breakableObjectIndexById: ReadonlyMap<string, number>,
  output: ZombieEscapeSparseNavigationPairTraversal,
) {
  output.breachObjectIndices.length = 0
  output.visibilityMask = 0
  if (!sparseNavigationCandidatesShareSupport(world, first, second)) return
  const layerIndex = first.layerIndex
  ignoredBreakableObjectIds.clear()
  while (true) {
    const clear = sweepZombieEscapeNavigationCollidersIsClear(
      world,
      layerIndex,
      first.x,
      first.z,
      second.x,
      second.z,
      world.agentRadius,
      collisionHit,
      ignoredBreakableObjectIds.size > 0 ? ignoredBreakableObjectIds : undefined,
    )
    if (clear) {
      output.visibilityMask = ignoredBreakableObjectIds.size === 0 ? 3 : 2
      return
    }
    const objectId = resolveZombieEscapeCollisionHitObjectId(world, collisionHit)
    if (
      !objectId ||
      !world.breakableObjectIds.has(objectId) ||
      ignoredBreakableObjectIds.has(objectId)
    ) {
      return
    }
    ignoredBreakableObjectIds.add(objectId)
    const breakableObjectIndex = breakableObjectIndexById.get(objectId)
    if (breakableObjectIndex === undefined) {
      output.visibilityMask = 0
      return
    }
    output.breachObjectIndices.push(breakableObjectIndex)
  }
}

function sparseNavigationCandidatesShareSupport(
  world: ZombieEscapeCollisionWorld,
  first: ZombieEscapeSparseNavigationCandidatePoint,
  second: ZombieEscapeSparseNavigationCandidatePoint,
) {
  let firstIndex = 0
  let secondIndex = 0
  while (firstIndex < first.supportIndices.length && secondIndex < second.supportIndices.length) {
    const firstSupportIndex = first.supportIndices[firstIndex]!
    const secondSupportIndex = second.supportIndices[secondIndex]!
    if (firstSupportIndex < secondSupportIndex) {
      firstIndex += 1
      continue
    }
    if (secondSupportIndex < firstSupportIndex) {
      secondIndex += 1
      continue
    }
    if (
      navigationSupportContainsCapsuleBetweenValidatedDisks(
        world.navigationSupports[firstSupportIndex]!,
        world.navigationSupportAcceleration.supports[firstSupportIndex]!,
        first.x,
        first.z,
        second.x,
        second.z,
        world.agentRadius,
      )
    ) {
      return true
    }
    firstIndex += 1
    secondIndex += 1
  }
  return false
}

function createNavigationLayerElevations(supports: readonly ZombieEscapeNavigationSupportSource[]) {
  const candidates = [0, ...supports.map(({ elevation }) => elevation)].sort(
    (first, second) => first - second,
  )
  const elevations: number[] = []
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue
    const previous = elevations[elevations.length - 1]
    if (previous !== undefined && navigationSupportElevationsMatch(previous, candidate)) continue
    elevations.push(candidate)
  }
  return elevations.length > 0 ? elevations : [0]
}

type NavigationBoundsHierarchyBuildNode = {
  bounds: CollisionAabbBounds
  itemCount: number
  itemOffset: number
  skipIndex: number
}

function createZombieEscapeCollisionObjectCatalog(
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
  connectors: readonly ZombieEscapeNavigationConnector[],
  objectSemantics: readonly ZombieEscapeCollisionObjectSemanticSource[],
): ZombieEscapeCollisionObjectCatalog {
  const objectIds = [
    ...new Set(
      [...boxes, ...circles, ...segments, ...connectors].map((candidate) => candidate.objectId),
    ),
  ].sort((first, second) => first.localeCompare(second))
  const objectOrdinals = new Map(objectIds.map((objectId, ordinal) => [objectId, ordinal]))
  const semanticKindsByObjectId = createZombieEscapeCollisionObjectSemanticKindMap(objectSemantics)
  const objectSemanticKinds = Uint8Array.from(
    objectIds,
    (objectId) =>
      semanticKindsByObjectId.get(objectId) ?? ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
  )
  const colliders = [...segments, ...circles, ...boxes]
  const colliderObjectOrdinals = Int32Array.from(
    colliders,
    (collider) => objectOrdinals.get(collider.objectId) ?? -1,
  )
  const connectorObjectOrdinals = Int32Array.from(
    connectors,
    (connector) => objectOrdinals.get(connector.objectId) ?? -1,
  )
  const objectHasCollider = new Uint8Array(objectIds.length)
  const objectHasConnector = new Uint8Array(objectIds.length)
  const objectHasNonBreakableCollider = new Uint8Array(objectIds.length)
  for (let colliderIndex = 0; colliderIndex < colliders.length; colliderIndex += 1) {
    const objectOrdinal = colliderObjectOrdinals[colliderIndex]!
    if (objectOrdinal < 0) continue
    objectHasCollider[objectOrdinal] = 1
    if (!colliders[colliderIndex]!.breakable) objectHasNonBreakableCollider[objectOrdinal] = 1
  }
  for (const objectOrdinal of connectorObjectOrdinals) {
    if (objectOrdinal >= 0) objectHasConnector[objectOrdinal] = 1
  }
  const objectSupportsMaskRemoval = new Uint8Array(objectIds.length)
  const breakableObjectOrdinals: number[] = []
  for (let objectOrdinal = 0; objectOrdinal < objectIds.length; objectOrdinal += 1) {
    if (
      objectHasCollider[objectOrdinal] !== 0 &&
      objectHasNonBreakableCollider[objectOrdinal] === 0 &&
      objectHasConnector[objectOrdinal] === 0
    ) {
      objectSupportsMaskRemoval[objectOrdinal] = 1
      breakableObjectOrdinals.push(objectOrdinal)
    }
  }
  return {
    breakableObjectOrdinals: Uint32Array.from(breakableObjectOrdinals),
    colliderObjectOrdinals,
    connectorObjectOrdinals,
    objectHasCollider,
    objectHasConnector,
    objectIds,
    objectSemanticKinds,
    objectSupportsMaskRemoval,
  }
}

function createZombieEscapeCollisionObjectSemanticKindMap(
  objectSemantics: readonly ZombieEscapeCollisionObjectSemanticSource[],
) {
  const semanticKindsByObjectId = new Map<string, ZombieEscapeCollisionObjectSemanticKind>()
  for (const { objectId, semanticKind } of objectSemantics) {
    if (!objectId || !isZombieEscapeCollisionObjectSemanticKind(semanticKind)) {
      throw new TypeError('Collision object semantics contain an invalid object id or kind.')
    }
    const existingKind = semanticKindsByObjectId.get(objectId)
    if (existingKind !== undefined && existingKind !== semanticKind) {
      throw new TypeError(`Collision object ${objectId} has conflicting semantic kinds.`)
    }
    semanticKindsByObjectId.set(objectId, semanticKind)
  }
  return semanticKindsByObjectId
}

function createZombieEscapeCollisionObjectSemanticsFromCatalog(
  catalog: ZombieEscapeCollisionObjectCatalog,
) {
  return catalog.objectIds.map((objectId, objectOrdinal) => ({
    objectId,
    semanticKind: catalog.objectSemanticKinds[
      objectOrdinal
    ] as ZombieEscapeCollisionObjectSemanticKind,
  }))
}

function isZombieEscapeCollisionObjectSemanticKind(
  semanticKind: number,
): semanticKind is ZombieEscapeCollisionObjectSemanticKind {
  return (
    semanticKind === ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other ||
    semanticKind === ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door ||
    semanticKind === ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture
  )
}

function createZombieEscapeNavigationColliderAcceleration(
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
) {
  const colliderCount = segments.length + circles.length + boxes.length
  return createNavigationBoundsHierarchy(
    Array.from({ length: colliderCount }, (_, colliderIndex) => colliderIndex),
    (colliderIndex) => {
      if (colliderIndex < segments.length) {
        const segment = segments[colliderIndex]!
        return {
          maximumX: Math.max(segment.startX, segment.endX) + segment.halfThickness,
          maximumZ: Math.max(segment.startZ, segment.endZ) + segment.halfThickness,
          minimumX: Math.min(segment.startX, segment.endX) - segment.halfThickness,
          minimumZ: Math.min(segment.startZ, segment.endZ) - segment.halfThickness,
        }
      }
      const circleIndex = colliderIndex - segments.length
      if (circleIndex < circles.length) {
        const circle = circles[circleIndex]!
        return {
          maximumX: circle.x + circle.radius,
          maximumZ: circle.z + circle.radius,
          minimumX: circle.x - circle.radius,
          minimumZ: circle.z - circle.radius,
        }
      }
      return resolveBoxAabb(boxes[circleIndex - circles.length]!)
    },
  )
}

export function zombieEscapeCollisionObjectOrdinalIsActive(
  world: ZombieEscapeCollisionWorld,
  objectOrdinal: number,
) {
  return objectOrdinal < 0 || world.activeObjectMask[objectOrdinal] !== 0
}

function zombieEscapeColliderIndexIsActive(
  world: ZombieEscapeCollisionWorld,
  colliderIndex: number,
) {
  return zombieEscapeCollisionObjectOrdinalIsActive(
    world,
    world.objectCatalog.colliderObjectOrdinals[colliderIndex] ?? -1,
  )
}

function zombieEscapeConnectorIndexIsActive(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
) {
  return zombieEscapeCollisionObjectOrdinalIsActive(
    world,
    world.objectCatalog.connectorObjectOrdinals[connectorIndex] ?? -1,
  )
}

function createNavigationSupportAcceleration(
  layers: readonly ZombieEscapeNavigationLayer[],
  supports: readonly ZombieEscapeNavigationSupportSource[],
): ZombieEscapeNavigationSupportAcceleration {
  const acceleratedSupports = supports.map((support) => {
    const rings = [support.polygon, ...(support.holes ?? [])].map((ring) => ({
      edgeCount: ring.length,
      hierarchy: createNavigationBoundsHierarchy(
        Array.from({ length: ring.length }, (_, edgeIndex) => edgeIndex),
        (edgeIndex) => {
          const point = ring[edgeIndex]!
          const previous = ring[(edgeIndex + ring.length - 1) % ring.length]!
          return {
            maximumX: Math.max(previous.x, point.x),
            maximumZ: Math.max(previous.z, point.z),
            minimumX: Math.min(previous.x, point.x),
            minimumZ: Math.min(previous.z, point.z),
          }
        },
      ),
    }))
    return {
      bounds: resolveNavigationRingBounds(support.polygon),
      capsuleFollowsValidatedDisks:
        (support.holes?.length ?? 0) === 0 && navigationRingIsConvex(support.polygon),
      convexInteriorSign: navigationRingOrientationSign(support.polygon),
      edgeCount: rings.reduce((total, ring) => total + ring.edgeCount, 0),
      rings,
    }
  })
  return {
    layers: layers.map((layer) => {
      const supportIndices: number[] = []
      for (let supportIndex = 0; supportIndex < supports.length; supportIndex += 1) {
        if (navigationSupportElevationsMatch(supports[supportIndex]!.elevation, layer.elevation)) {
          supportIndices.push(supportIndex)
        }
      }
      return {
        hierarchy: createNavigationBoundsHierarchy(
          supportIndices,
          (supportIndex) => acceleratedSupports[supportIndex]!.bounds,
        ),
        supportIndices: Int32Array.from(supportIndices),
        totalEdgeCount: supportIndices.reduce(
          (total, supportIndex) => total + acceleratedSupports[supportIndex]!.edgeCount,
          0,
        ),
      }
    }),
    supports: acceleratedSupports,
  }
}

function createNavigationAttachmentAcceleration(
  layers: readonly ZombieEscapeNavigationLayer[],
  graph: ZombieEscapeSparseNavigationGraph,
): ZombieEscapeNavigationAttachmentAcceleration {
  return {
    layers: layers.map((_, layerIndex) => {
      const nodeIndices: number[] = []
      for (let node = 0; node < graph.layerIndices.length; node += 1) {
        if (graph.layerIndices[node] === layerIndex) nodeIndices.push(node)
      }
      return createNavigationBoundsHierarchy(nodeIndices, (node) => ({
        maximumX: graph.x[node]!,
        maximumZ: graph.z[node]!,
        minimumX: graph.x[node]!,
        minimumZ: graph.z[node]!,
      }))
    }),
  }
}

function createNavigationBoundsHierarchy(
  sourceItemIndices: readonly number[],
  resolveBounds: (itemIndex: number) => CollisionAabbBounds,
): ZombieEscapeNavigationBoundsHierarchy {
  if (sourceItemIndices.length === 0) {
    return {
      itemIndices: new Uint32Array(0),
      nodeItemCounts: new Uint32Array(0),
      nodeItemOffsets: new Uint32Array(0),
      nodeMaximumXs: new Float64Array(0),
      nodeMaximumZs: new Float64Array(0),
      nodeMinimumXs: new Float64Array(0),
      nodeMinimumZs: new Float64Array(0),
      nodeSkipIndices: new Uint32Array(0),
    }
  }
  const orderedItems: number[] = []
  const nodes: NavigationBoundsHierarchyBuildNode[] = []
  const appendNode = (itemIndices: number[]) => {
    const nodeIndex = nodes.length
    const bounds = resolveNavigationItemBounds(itemIndices, resolveBounds)
    nodes.push({ bounds, itemCount: 0, itemOffset: 0, skipIndex: 0 })
    if (itemIndices.length <= NAVIGATION_SUPPORT_EDGE_LEAF_SIZE) {
      const itemOffset = orderedItems.length
      orderedItems.push(...itemIndices.sort((first, second) => first - second))
      nodes[nodeIndex] = {
        bounds,
        itemCount: itemIndices.length,
        itemOffset,
        skipIndex: nodeIndex + 1,
      }
      return
    }
    const splitOnX = bounds.maximumX - bounds.minimumX >= bounds.maximumZ - bounds.minimumZ
    itemIndices.sort((first, second) => {
      const firstBounds = resolveBounds(first)
      const secondBounds = resolveBounds(second)
      const firstCenter = splitOnX
        ? firstBounds.minimumX + firstBounds.maximumX
        : firstBounds.minimumZ + firstBounds.maximumZ
      const secondCenter = splitOnX
        ? secondBounds.minimumX + secondBounds.maximumX
        : secondBounds.minimumZ + secondBounds.maximumZ
      return firstCenter - secondCenter || first - second
    })
    const middle = Math.floor(itemIndices.length / 2)
    appendNode(itemIndices.slice(0, middle))
    appendNode(itemIndices.slice(middle))
    nodes[nodeIndex] = { bounds, itemCount: 0, itemOffset: 0, skipIndex: nodes.length }
  }
  appendNode([...sourceItemIndices])
  return {
    itemIndices: Uint32Array.from(orderedItems),
    nodeItemCounts: Uint32Array.from(nodes, ({ itemCount }) => itemCount),
    nodeItemOffsets: Uint32Array.from(nodes, ({ itemOffset }) => itemOffset),
    nodeMaximumXs: Float64Array.from(nodes, ({ bounds }) => bounds.maximumX),
    nodeMaximumZs: Float64Array.from(nodes, ({ bounds }) => bounds.maximumZ),
    nodeMinimumXs: Float64Array.from(nodes, ({ bounds }) => bounds.minimumX),
    nodeMinimumZs: Float64Array.from(nodes, ({ bounds }) => bounds.minimumZ),
    nodeSkipIndices: Uint32Array.from(nodes, ({ skipIndex }) => skipIndex),
  }
}

function resolveNavigationItemBounds(
  itemIndices: readonly number[],
  resolveBounds: (itemIndex: number) => CollisionAabbBounds,
): CollisionAabbBounds {
  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  for (const itemIndex of itemIndices) {
    const bounds = resolveBounds(itemIndex)
    maximumX = Math.max(maximumX, bounds.maximumX)
    maximumZ = Math.max(maximumZ, bounds.maximumZ)
    minimumX = Math.min(minimumX, bounds.minimumX)
    minimumZ = Math.min(minimumZ, bounds.minimumZ)
  }
  return { maximumX, maximumZ, minimumX, minimumZ }
}

function resolveNavigationRingBounds(
  ring: readonly Readonly<{ x: number; z: number }>[],
): CollisionAabbBounds {
  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  for (const point of ring) {
    maximumX = Math.max(maximumX, point.x)
    maximumZ = Math.max(maximumZ, point.z)
    minimumX = Math.min(minimumX, point.x)
    minimumZ = Math.min(minimumZ, point.z)
  }
  return { maximumX, maximumZ, minimumX, minimumZ }
}

function navigationRingIsConvex(ring: readonly Readonly<{ x: number; z: number }>[]) {
  if (ring.length < 3) return false
  let turnSign = 0
  for (let index = 0; index < ring.length; index += 1) {
    const first = ring[index]!
    const second = ring[(index + 1) % ring.length]!
    const third = ring[(index + 2) % ring.length]!
    const cross =
      (second.x - first.x) * (third.z - second.z) - (second.z - first.z) * (third.x - second.x)
    if (Math.abs(cross) <= INTERSECTION_EPSILON) continue
    const currentSign = Math.sign(cross)
    if (turnSign !== 0 && currentSign !== turnSign) return false
    turnSign = currentSign
  }
  return turnSign !== 0
}

function navigationRingOrientationSign(ring: readonly Readonly<{ x: number; z: number }>[]) {
  let doubledArea = 0
  for (let index = 0; index < ring.length; index += 1) {
    const point = ring[index]!
    const next = ring[(index + 1) % ring.length]!
    doubledArea += point.x * next.z - next.x * point.z
  }
  return Math.sign(doubledArea)
}

function navigationBoundsHierarchyNodeMayContainPoint(
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  nodeIndex: number,
  x: number,
  z: number,
) {
  return (
    hierarchy.nodeMinimumXs[nodeIndex]! <= x + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    hierarchy.nodeMaximumXs[nodeIndex]! >= x - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    hierarchy.nodeMinimumZs[nodeIndex]! <= z + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    hierarchy.nodeMaximumZs[nodeIndex]! >= z - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE
  )
}

function navigationBoundsHierarchyNodeMinimumDistance(
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  nodeIndex: number,
  x: number,
  z: number,
) {
  const offsetX = Math.max(
    hierarchy.nodeMinimumXs[nodeIndex]! - x,
    0,
    x - hierarchy.nodeMaximumXs[nodeIndex]!,
  )
  const offsetZ = Math.max(
    hierarchy.nodeMinimumZs[nodeIndex]! - z,
    0,
    z - hierarchy.nodeMaximumZs[nodeIndex]!,
  )
  return Math.hypot(offsetX, offsetZ)
}

function navigationBoundsHierarchyNodeMayContainCapsuleEndpoints(
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  nodeIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  return (
    hierarchy.nodeMinimumXs[nodeIndex]! <=
      Math.min(startX, endX) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    hierarchy.nodeMaximumXs[nodeIndex]! >=
      Math.max(startX, endX) - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    hierarchy.nodeMinimumZs[nodeIndex]! <=
      Math.min(startZ, endZ) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    hierarchy.nodeMaximumZs[nodeIndex]! >=
      Math.max(startZ, endZ) - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE
  )
}

function navigationRingHierarchyNodeMayAffectPoint(
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  nodeIndex: number,
  x: number,
  z: number,
) {
  return (
    hierarchy.nodeMaximumXs[nodeIndex]! + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE >= x &&
    hierarchy.nodeMinimumZs[nodeIndex]! - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE <= z &&
    hierarchy.nodeMaximumZs[nodeIndex]! + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE >= z
  )
}

function navigationBoundsHierarchyNodeOverlapsBounds(
  hierarchy: ZombieEscapeNavigationBoundsHierarchy,
  nodeIndex: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
) {
  return !(
    hierarchy.nodeMaximumXs[nodeIndex]! < minimumX ||
    hierarchy.nodeMinimumXs[nodeIndex]! > maximumX ||
    hierarchy.nodeMaximumZs[nodeIndex]! < minimumZ ||
    hierarchy.nodeMinimumZs[nodeIndex]! > maximumZ
  )
}

function navigationSupportBoundsMayContainPoint(bounds: CollisionAabbBounds, x: number, z: number) {
  return (
    bounds.minimumX <= x + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    bounds.maximumX >= x - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    bounds.minimumZ <= z + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    bounds.maximumZ >= z - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE
  )
}

function navigationSupportBoundsMayContainCapsuleEndpoints(
  bounds: CollisionAabbBounds,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  return (
    bounds.minimumX <= Math.min(startX, endX) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    bounds.maximumX >= Math.max(startX, endX) - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    bounds.minimumZ <= Math.min(startZ, endZ) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE &&
    bounds.maximumZ >= Math.max(startZ, endZ) - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE
  )
}

function navigationElevationsMatch(first: number, second: number) {
  return Math.abs(first - second) <= COLLISION_EPSILON_METERS
}

function navigationSupportElevationsMatch(first: number, second: number) {
  return Math.abs(first - second) <= NAVIGATION_SUPPORT_ELEVATION_TOLERANCE_METERS
}

function colliderVerticalRangeBlocksNavigationElevation(
  collider: Readonly<{ maximumY: number; minimumY: number }>,
  elevation: number,
) {
  return (
    collider.maximumY > elevation + COLLISION_EPSILON_METERS &&
    collider.minimumY < elevation + NAVIGATION_AGENT_HEIGHT_METERS - COLLISION_EPSILON_METERS
  )
}

function colliderMatchesNavigationLayer(
  world: ZombieEscapeCollisionWorld,
  collider: Readonly<{ maximumY: number; minimumY: number }>,
  navigationLayerIndex: number | undefined,
) {
  if (navigationLayerIndex === undefined) return true
  const layer = world.navigationLayers[navigationLayerIndex]
  return Boolean(layer && colliderVerticalRangeBlocksNavigationElevation(collider, layer.elevation))
}

function pointHasNavigationSupport(
  x: number,
  z: number,
  agentRadius: number,
  maximumCenterRadius: number,
  implicitGround: boolean,
  supports: readonly ZombieEscapeNavigationSupportSource[],
) {
  if (implicitGround && supports.length === 0) {
    return x * x + z * z <= maximumCenterRadius * maximumCenterRadius
  }
  const radius = Math.max(0, agentRadius)
  return supports.some((support) => navigationSupportContainsDiskUnindexed(support, x, z, radius))
}

function navigationSupportContainsDiskUnindexed(
  support: ZombieEscapeNavigationSupportSource,
  x: number,
  z: number,
  radius: number,
) {
  if (
    !pointIsInsideNavigationRing(x, z, support.polygon) ||
    (support.holes ?? []).some((hole) => pointIsInsideNavigationRing(x, z, hole))
  ) {
    return false
  }
  const minimumDistanceSquared = Math.max(0, radius) ** 2
  for (const ring of [support.polygon, ...(support.holes ?? [])]) {
    for (let index = 0; index < ring.length; index += 1) {
      const point = ring[index]!
      const previous = ring[(index + ring.length - 1) % ring.length]!
      if (
        pointDistanceToSegmentSquared(x, z, previous.x, previous.z, point.x, point.z) +
          INTERSECTION_EPSILON <
        minimumDistanceSquared
      ) {
        return false
      }
    }
  }
  return true
}

type MutableZombieEscapeNavigationSupportQueryInspection = {
  edgeVisits: number
  nodeVisits: number
  supportAabbVisits: number
  supportPredicateVisits: number
}

export function inspectZombieEscapeNavigationSupportDiskQuery(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  x: number,
  z: number,
  radius: number,
): ZombieEscapeNavigationSupportQueryInspection {
  const inspection: MutableZombieEscapeNavigationSupportQueryInspection = {
    edgeVisits: 0,
    nodeVisits: 0,
    supportAabbVisits: 0,
    supportPredicateVisits: 0,
  }
  const layer = world.navigationSupportAcceleration.layers[navigationLayerIndex]
  return {
    contains: navigationSupportLayerContainsDisk(
      world,
      navigationLayerIndex,
      x,
      z,
      radius,
      inspection,
    ),
    edgeVisits: inspection.edgeVisits,
    layerSupportCount: layer?.supportIndices.length ?? 0,
    nodeVisits: inspection.nodeVisits,
    supportAabbVisits: inspection.supportAabbVisits,
    supportPredicateVisits: inspection.supportPredicateVisits,
    totalEdgeCount: layer?.totalEdgeCount ?? 0,
  }
}

export function inspectZombieEscapeNavigationSupportCapsuleQuery(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
): ZombieEscapeNavigationSupportQueryInspection {
  const inspection: MutableZombieEscapeNavigationSupportQueryInspection = {
    edgeVisits: 0,
    nodeVisits: 0,
    supportAabbVisits: 0,
    supportPredicateVisits: 0,
  }
  const layer = world.navigationSupportAcceleration.layers[navigationLayerIndex]
  return {
    contains: navigationSupportLayerContainsCapsule(
      world,
      navigationLayerIndex,
      startX,
      startZ,
      endX,
      endZ,
      radius,
      inspection,
    ),
    edgeVisits: inspection.edgeVisits,
    layerSupportCount: layer?.supportIndices.length ?? 0,
    nodeVisits: inspection.nodeVisits,
    supportAabbVisits: inspection.supportAabbVisits,
    supportPredicateVisits: inspection.supportPredicateVisits,
    totalEdgeCount: layer?.totalEdgeCount ?? 0,
  }
}

function navigationSupportLayerContainsDisk(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  x: number,
  z: number,
  radius: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  const layer = world.navigationSupportAcceleration.layers[navigationLayerIndex]
  if (!layer) return false
  const hierarchy = layer.hierarchy
  let nodeIndex = 0
  while (nodeIndex < hierarchy.nodeItemCounts.length) {
    if (inspection) inspection.nodeVisits += 1
    if (!navigationBoundsHierarchyNodeMayContainPoint(hierarchy, nodeIndex, x, z)) {
      nodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
    if (itemCount > 0) {
      const itemEnd = hierarchy.nodeItemOffsets[nodeIndex]! + itemCount
      for (
        let itemOffset = hierarchy.nodeItemOffsets[nodeIndex]!;
        itemOffset < itemEnd;
        itemOffset += 1
      ) {
        if (inspection) inspection.supportAabbVisits += 1
        const supportIndex = hierarchy.itemIndices[itemOffset]!
        const acceleration = world.navigationSupportAcceleration.supports[supportIndex]!
        if (!navigationSupportBoundsMayContainPoint(acceleration.bounds, x, z)) continue
        if (inspection) inspection.supportPredicateVisits += 1
        if (
          navigationSupportContainsDisk(
            world.navigationSupports[supportIndex]!,
            acceleration,
            x,
            z,
            radius,
            inspection,
          )
        ) {
          return true
        }
      }
    }
    nodeIndex += 1
  }
  return false
}

function navigationSupportLayerContainsCapsule(
  world: ZombieEscapeCollisionWorld,
  navigationLayerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  const layer = world.navigationSupportAcceleration.layers[navigationLayerIndex]
  if (!layer) return false
  const hierarchy = layer.hierarchy
  let nodeIndex = 0
  while (nodeIndex < hierarchy.nodeItemCounts.length) {
    if (inspection) inspection.nodeVisits += 1
    if (
      !navigationBoundsHierarchyNodeMayContainCapsuleEndpoints(
        hierarchy,
        nodeIndex,
        startX,
        startZ,
        endX,
        endZ,
      )
    ) {
      nodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
    if (itemCount > 0) {
      const itemEnd = hierarchy.nodeItemOffsets[nodeIndex]! + itemCount
      for (
        let itemOffset = hierarchy.nodeItemOffsets[nodeIndex]!;
        itemOffset < itemEnd;
        itemOffset += 1
      ) {
        if (inspection) inspection.supportAabbVisits += 1
        const supportIndex = hierarchy.itemIndices[itemOffset]!
        const acceleration = world.navigationSupportAcceleration.supports[supportIndex]!
        if (
          !navigationSupportBoundsMayContainCapsuleEndpoints(
            acceleration.bounds,
            startX,
            startZ,
            endX,
            endZ,
          )
        ) {
          continue
        }
        if (inspection) inspection.supportPredicateVisits += 1
        if (
          navigationSupportContainsCapsule(
            world.navigationSupports[supportIndex]!,
            acceleration,
            startX,
            startZ,
            endX,
            endZ,
            radius,
            inspection,
          )
        ) {
          return true
        }
      }
    }
    nodeIndex += 1
  }
  return false
}

function navigationSupportContainsDisk(
  support: ZombieEscapeNavigationSupportSource,
  acceleration: ZombieEscapeNavigationSupportAccelerationEntry,
  x: number,
  z: number,
  radius: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  const outerAcceleration = acceleration.rings[0]
  if (
    !outerAcceleration ||
    !pointIsInsideIndexedNavigationRing(x, z, support.polygon, outerAcceleration, inspection)
  ) {
    return false
  }
  const holes = support.holes
  if (holes) {
    for (let holeIndex = 0; holeIndex < holes.length; holeIndex += 1) {
      if (
        pointIsInsideIndexedNavigationRing(
          x,
          z,
          holes[holeIndex]!,
          acceleration.rings[holeIndex + 1]!,
          inspection,
        )
      ) {
        return false
      }
    }
  }
  const minimumDistanceSquared = Math.max(0, radius) ** 2
  if (minimumDistanceSquared <= INTERSECTION_EPSILON) return true
  if (
    indexedNavigationRingHasEdgeWithinDisk(
      support.polygon,
      outerAcceleration,
      x,
      z,
      radius,
      minimumDistanceSquared,
      inspection,
    )
  ) {
    return false
  }
  if (holes) {
    for (let holeIndex = 0; holeIndex < holes.length; holeIndex += 1) {
      if (
        indexedNavigationRingHasEdgeWithinDisk(
          holes[holeIndex]!,
          acceleration.rings[holeIndex + 1]!,
          x,
          z,
          radius,
          minimumDistanceSquared,
          inspection,
        )
      ) {
        return false
      }
    }
  }
  return true
}

function navigationSupportContainsCapsule(
  support: ZombieEscapeNavigationSupportSource,
  acceleration: ZombieEscapeNavigationSupportAccelerationEntry,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  if (
    !navigationSupportContainsDisk(support, acceleration, startX, startZ, radius, inspection) ||
    !navigationSupportContainsDisk(support, acceleration, endX, endZ, radius, inspection)
  ) {
    return false
  }
  return navigationSupportContainsCapsuleBetweenValidatedDisks(
    support,
    acceleration,
    startX,
    startZ,
    endX,
    endZ,
    radius,
    inspection,
  )
}

function navigationSupportContainsCapsuleBetweenValidatedDisks(
  support: ZombieEscapeNavigationSupportSource,
  acceleration: ZombieEscapeNavigationSupportAccelerationEntry,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  const minimumDistanceSquared = Math.max(0, radius) ** 2
  if (minimumDistanceSquared <= INTERSECTION_EPSILON) return true
  const resolvedRadius = Math.max(0, radius)
  const minimumX = Math.min(startX, endX) - resolvedRadius
  const minimumZ = Math.min(startZ, endZ) - resolvedRadius
  const maximumX = Math.max(startX, endX) + resolvedRadius
  const maximumZ = Math.max(startZ, endZ) + resolvedRadius
  if (
    indexedNavigationRingHasEdgeWithinCapsule(
      support.polygon,
      acceleration.rings[0]!,
      startX,
      startZ,
      endX,
      endZ,
      minimumX,
      minimumZ,
      maximumX,
      maximumZ,
      minimumDistanceSquared,
      inspection,
    )
  ) {
    return false
  }
  const holes = support.holes
  if (holes) {
    for (let holeIndex = 0; holeIndex < holes.length; holeIndex += 1) {
      if (
        indexedNavigationRingHasEdgeWithinCapsule(
          holes[holeIndex]!,
          acceleration.rings[holeIndex + 1]!,
          startX,
          startZ,
          endX,
          endZ,
          minimumX,
          minimumZ,
          maximumX,
          maximumZ,
          minimumDistanceSquared,
          inspection,
        )
      ) {
        return false
      }
    }
  }
  return true
}

function pointIsInsideIndexedNavigationRing(
  x: number,
  z: number,
  ring: readonly Readonly<{ x: number; z: number }>[],
  acceleration: ZombieEscapeNavigationSupportRingAcceleration,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  if (ring.length < 3) return false
  const hierarchy = acceleration.hierarchy
  let inside = false
  let nodeIndex = 0
  while (nodeIndex < hierarchy.nodeItemCounts.length) {
    if (inspection) inspection.nodeVisits += 1
    if (!navigationRingHierarchyNodeMayAffectPoint(hierarchy, nodeIndex, x, z)) {
      nodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
    if (itemCount > 0) {
      const itemEnd = hierarchy.nodeItemOffsets[nodeIndex]! + itemCount
      for (
        let itemOffset = hierarchy.nodeItemOffsets[nodeIndex]!;
        itemOffset < itemEnd;
        itemOffset += 1
      ) {
        const edgeIndex = hierarchy.itemIndices[itemOffset]!
        const point = ring[edgeIndex]!
        const previous = ring[(edgeIndex + ring.length - 1) % ring.length]!
        if (
          Math.max(previous.x, point.x) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE < x ||
          Math.max(previous.z, point.z) + NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE < z ||
          Math.min(previous.z, point.z) - NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE > z
        ) {
          continue
        }
        if (inspection) inspection.edgeVisits += 1
        if (
          pointDistanceToSegmentSquared(x, z, previous.x, previous.z, point.x, point.z) <=
          NAVIGATION_SUPPORT_RING_BOUNDARY_DISTANCE_SQUARED
        ) {
          return true
        }
        if (
          point.z > z !== previous.z > z &&
          x < ((previous.x - point.x) * (z - point.z)) / (previous.z - point.z) + point.x
        ) {
          inside = !inside
        }
      }
    }
    nodeIndex += 1
  }
  return inside
}

function indexedNavigationRingHasEdgeWithinDisk(
  ring: readonly Readonly<{ x: number; z: number }>[],
  acceleration: ZombieEscapeNavigationSupportRingAcceleration,
  x: number,
  z: number,
  radius: number,
  minimumDistanceSquared: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  const resolvedRadius = Math.max(0, radius)
  const minimumX = x - resolvedRadius
  const minimumZ = z - resolvedRadius
  const maximumX = x + resolvedRadius
  const maximumZ = z + resolvedRadius
  const hierarchy = acceleration.hierarchy
  let nodeIndex = 0
  while (nodeIndex < hierarchy.nodeItemCounts.length) {
    if (inspection) inspection.nodeVisits += 1
    if (
      !navigationBoundsHierarchyNodeOverlapsBounds(
        hierarchy,
        nodeIndex,
        minimumX,
        minimumZ,
        maximumX,
        maximumZ,
      )
    ) {
      nodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
    if (itemCount > 0) {
      const itemEnd = hierarchy.nodeItemOffsets[nodeIndex]! + itemCount
      for (
        let itemOffset = hierarchy.nodeItemOffsets[nodeIndex]!;
        itemOffset < itemEnd;
        itemOffset += 1
      ) {
        const edgeIndex = hierarchy.itemIndices[itemOffset]!
        const point = ring[edgeIndex]!
        const previous = ring[(edgeIndex + ring.length - 1) % ring.length]!
        if (
          Math.max(previous.x, point.x) < minimumX ||
          Math.min(previous.x, point.x) > maximumX ||
          Math.max(previous.z, point.z) < minimumZ ||
          Math.min(previous.z, point.z) > maximumZ
        ) {
          continue
        }
        if (inspection) inspection.edgeVisits += 1
        if (
          pointDistanceToSegmentSquared(x, z, previous.x, previous.z, point.x, point.z) +
            INTERSECTION_EPSILON <
          minimumDistanceSquared
        ) {
          return true
        }
      }
    }
    nodeIndex += 1
  }
  return false
}

function indexedNavigationRingHasEdgeWithinCapsule(
  ring: readonly Readonly<{ x: number; z: number }>[],
  acceleration: ZombieEscapeNavigationSupportRingAcceleration,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
  minimumDistanceSquared: number,
  inspection?: MutableZombieEscapeNavigationSupportQueryInspection,
) {
  const hierarchy = acceleration.hierarchy
  let nodeIndex = 0
  while (nodeIndex < hierarchy.nodeItemCounts.length) {
    if (inspection) inspection.nodeVisits += 1
    if (
      !navigationBoundsHierarchyNodeOverlapsBounds(
        hierarchy,
        nodeIndex,
        minimumX,
        minimumZ,
        maximumX,
        maximumZ,
      )
    ) {
      nodeIndex = hierarchy.nodeSkipIndices[nodeIndex]!
      continue
    }
    const itemCount = hierarchy.nodeItemCounts[nodeIndex]!
    if (itemCount > 0) {
      const itemEnd = hierarchy.nodeItemOffsets[nodeIndex]! + itemCount
      for (
        let itemOffset = hierarchy.nodeItemOffsets[nodeIndex]!;
        itemOffset < itemEnd;
        itemOffset += 1
      ) {
        const edgeIndex = hierarchy.itemIndices[itemOffset]!
        const point = ring[edgeIndex]!
        const previous = ring[(edgeIndex + ring.length - 1) % ring.length]!
        if (
          Math.max(previous.x, point.x) < minimumX ||
          Math.min(previous.x, point.x) > maximumX ||
          Math.max(previous.z, point.z) < minimumZ ||
          Math.min(previous.z, point.z) > maximumZ
        ) {
          continue
        }
        if (inspection) inspection.edgeVisits += 1
        if (
          segmentDistanceSquared(
            startX,
            startZ,
            endX,
            endZ,
            previous.x,
            previous.z,
            point.x,
            point.z,
          ) +
            INTERSECTION_EPSILON <
          minimumDistanceSquared
        ) {
          return true
        }
      }
    }
    nodeIndex += 1
  }
  return false
}

function segmentDistanceSquared(
  firstStartX: number,
  firstStartZ: number,
  firstEndX: number,
  firstEndZ: number,
  secondStartX: number,
  secondStartZ: number,
  secondEndX: number,
  secondEndZ: number,
) {
  if (
    segmentsIntersect(
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ,
    )
  ) {
    return 0
  }
  return Math.min(
    pointDistanceToSegmentSquared(
      firstStartX,
      firstStartZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ,
    ),
    pointDistanceToSegmentSquared(
      firstEndX,
      firstEndZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ,
    ),
    pointDistanceToSegmentSquared(
      secondStartX,
      secondStartZ,
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
    ),
    pointDistanceToSegmentSquared(
      secondEndX,
      secondEndZ,
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
    ),
  )
}

function segmentsIntersect(
  firstStartX: number,
  firstStartZ: number,
  firstEndX: number,
  firstEndZ: number,
  secondStartX: number,
  secondStartZ: number,
  secondEndX: number,
  secondEndZ: number,
) {
  const orientation = (
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    pointX: number,
    pointZ: number,
  ) => (endX - startX) * (pointZ - startZ) - (endZ - startZ) * (pointX - startX)
  const firstSecondStart = orientation(
    firstStartX,
    firstStartZ,
    firstEndX,
    firstEndZ,
    secondStartX,
    secondStartZ,
  )
  const firstSecondEnd = orientation(
    firstStartX,
    firstStartZ,
    firstEndX,
    firstEndZ,
    secondEndX,
    secondEndZ,
  )
  const secondFirstStart = orientation(
    secondStartX,
    secondStartZ,
    secondEndX,
    secondEndZ,
    firstStartX,
    firstStartZ,
  )
  const secondFirstEnd = orientation(
    secondStartX,
    secondStartZ,
    secondEndX,
    secondEndZ,
    firstEndX,
    firstEndZ,
  )
  return (
    firstSecondStart * firstSecondEnd <= INTERSECTION_EPSILON &&
    secondFirstStart * secondFirstEnd <= INTERSECTION_EPSILON &&
    Math.max(Math.min(firstStartX, firstEndX), Math.min(secondStartX, secondEndX)) <=
      Math.min(Math.max(firstStartX, firstEndX), Math.max(secondStartX, secondEndX)) +
        INTERSECTION_EPSILON &&
    Math.max(Math.min(firstStartZ, firstEndZ), Math.min(secondStartZ, secondEndZ)) <=
      Math.min(Math.max(firstStartZ, firstEndZ), Math.max(secondStartZ, secondEndZ)) +
        INTERSECTION_EPSILON
  )
}

function pointIsOnAnyNavigationSupport(
  x: number,
  z: number,
  supports: readonly ZombieEscapeNavigationSupportSource[],
) {
  return supports.some(
    (support) =>
      pointIsInsideNavigationRing(x, z, support.polygon) &&
      !(support.holes ?? []).some((hole) => pointIsInsideNavigationRing(x, z, hole)),
  )
}

function pointIsInsideNavigationRing(
  x: number,
  z: number,
  ring: readonly Readonly<{ x: number; z: number }>[],
) {
  if (ring.length < 3) return false
  let inside = false
  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index++
  ) {
    const point = ring[index]!
    const previous = ring[previousIndex]!
    if (pointDistanceToSegmentSquared(x, z, previous.x, previous.z, point.x, point.z) <= 1e-12) {
      return true
    }
    if (
      point.z > z !== previous.z > z &&
      x < ((previous.x - point.x) * (z - point.z)) / (previous.z - point.z) + point.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function pointDistanceToSegmentSquared(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  const amount =
    lengthSquared <= INTERSECTION_EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((x - startX) * segmentX + (z - startZ) * segmentZ) / lengthSquared),
        )
  const offsetX = x - (startX + segmentX * amount)
  const offsetZ = z - (startZ + segmentZ * amount)
  return offsetX * offsetX + offsetZ * offsetZ
}

function rasterizeCircle(
  occupancy: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  circle: ZombieEscapeCollisionCircle,
  agentRadius: number,
) {
  const radius = circle.radius + agentRadius
  const minimumColumn = clampGridIndex(
    Math.floor((circle.x - radius - originX) / cellSize),
    gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((circle.x + radius - originX) / cellSize),
    gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((circle.z - radius - originZ) / cellSize),
    gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((circle.z + radius - originZ) / cellSize),
    gridHeight,
  )
  const radiusSquared = radius * radius
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    const z = originZ + (row + 0.5) * cellSize
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = originX + (column + 0.5) * cellSize
      const dx = x - circle.x
      const dz = z - circle.z
      if (dx * dx + dz * dz <= radiusSquared) occupancy[row * gridWidth + column] = 1
    }
  }
}

function rasterizeBox(
  occupancy: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  box: ZombieEscapeCollisionBox,
  agentRadius: number,
) {
  const bounds = resolveBoxAabb(box)
  const minimumColumn = clampGridIndex(
    Math.floor((bounds.minimumX - agentRadius - originX) / cellSize),
    gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((bounds.maximumX + agentRadius - originX) / cellSize),
    gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((bounds.minimumZ - agentRadius - originZ) / cellSize),
    gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((bounds.maximumZ + agentRadius - originZ) / cellSize),
    gridHeight,
  )
  const radiusSquared = agentRadius * agentRadius
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    const z = originZ + (row + 0.5) * cellSize
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = originX + (column + 0.5) * cellSize
      const offsetX = x - box.centerX
      const offsetZ = z - box.centerZ
      const localX = box.cosine * offsetX - box.sine * offsetZ
      const localZ = box.sine * offsetX + box.cosine * offsetZ
      const outsideX = Math.max(Math.abs(localX) - box.halfWidth, 0)
      const outsideZ = Math.max(Math.abs(localZ) - box.halfDepth, 0)
      if (outsideX * outsideX + outsideZ * outsideZ <= radiusSquared) {
        occupancy[row * gridWidth + column] = 1
      }
    }
  }
}

function resolveBoxAabb(box: ZombieEscapeCollisionBox) {
  const extentX = Math.abs(box.cosine) * box.halfWidth + Math.abs(box.sine) * box.halfDepth
  const extentZ = Math.abs(box.sine) * box.halfWidth + Math.abs(box.cosine) * box.halfDepth
  return {
    maximumX: box.centerX + extentX,
    maximumZ: box.centerZ + extentZ,
    minimumX: box.centerX - extentX,
    minimumZ: box.centerZ - extentZ,
  }
}

function rasterizeSegment(
  occupancy: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originZ: number,
  cellSize: number,
  segment: ZombieEscapeCollisionSegment,
  agentRadius: number,
) {
  const radius = segment.halfThickness + agentRadius
  const minimumColumn = clampGridIndex(
    Math.floor((Math.min(segment.startX, segment.endX) - radius - originX) / cellSize),
    gridWidth,
  )
  const maximumColumn = clampGridIndex(
    Math.floor((Math.max(segment.startX, segment.endX) + radius - originX) / cellSize),
    gridWidth,
  )
  const minimumRow = clampGridIndex(
    Math.floor((Math.min(segment.startZ, segment.endZ) - radius - originZ) / cellSize),
    gridHeight,
  )
  const maximumRow = clampGridIndex(
    Math.floor((Math.max(segment.startZ, segment.endZ) + radius - originZ) / cellSize),
    gridHeight,
  )
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    const z = originZ + (row + 0.5) * cellSize
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = originX + (column + 0.5) * cellSize
      if (pointIsInsideExpandedSegment(x, z, segment, radius)) {
        occupancy[row * gridWidth + column] = 1
      }
    }
  }
}

function pointIsInsideExpandedSegment(
  x: number,
  z: number,
  segment: ZombieEscapeCollisionSegment,
  radius: number,
) {
  const segmentX = segment.endX - segment.startX
  const segmentZ = segment.endZ - segment.startZ
  const segmentLength = Math.hypot(segmentX, segmentZ)
  if (segmentLength <= INTERSECTION_EPSILON) {
    if (segment.startCap === 'flat' && segment.endCap === 'flat') return false
    return Math.hypot(x - segment.startX, z - segment.startZ) <= radius
  }
  const tangentX = segmentX / segmentLength
  const tangentZ = segmentZ / segmentLength
  const offsetX = x - segment.startX
  const offsetZ = z - segment.startZ
  const along = offsetX * tangentX + offsetZ * tangentZ
  const across = -offsetX * tangentZ + offsetZ * tangentX
  if (along >= 0 && along <= segmentLength && Math.abs(across) <= radius) return true
  if (along < 0 && segment.startCap === 'round') {
    return offsetX * offsetX + offsetZ * offsetZ <= radius * radius
  }
  if (along > segmentLength && segment.endCap === 'round') {
    const endOffsetX = x - segment.endX
    const endOffsetZ = z - segment.endZ
    return endOffsetX * endOffsetX + endOffsetZ * endOffsetZ <= radius * radius
  }
  return false
}

function updateTrajectoryBoxHit(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endZ: number,
  displacementY: number,
  box: ZombieEscapeCollisionBox,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  resetCollisionHit(candidate)
  updateBoxHit(startX, startZ, endX, endZ, box, radius, colliderIndex, candidate)
  if (candidate.colliderKind === 'none') return
  const entry = candidate.time
  const normalX = candidate.normalX
  const normalZ = candidate.normalZ

  resetCollisionHit(candidate)
  updateBoxHit(endX, endZ, startX, startZ, box, radius, colliderIndex, candidate)
  if (!Number.isFinite(candidate.time)) return
  updateTrajectoryHit(
    entry,
    1 - candidate.time,
    normalX,
    normalZ,
    startY,
    displacementY,
    radius,
    box.minimumY,
    box.maximumY,
    'box',
    colliderIndex,
    output,
  )
}

function updateTrajectoryCircleHit(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endZ: number,
  displacementY: number,
  circle: ZombieEscapeCollisionCircle,
  footprintRadius: number,
  projectileRadius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  resetCollisionHit(candidate)
  updateCircleHit(startX, startZ, endX, endZ, circle, footprintRadius, colliderIndex, candidate)
  if (candidate.colliderKind === 'none') return
  const entry = candidate.time
  const normalX = candidate.normalX
  const normalZ = candidate.normalZ

  resetCollisionHit(candidate)
  updateCircleHit(endX, endZ, startX, startZ, circle, footprintRadius, colliderIndex, candidate)
  if (!Number.isFinite(candidate.time)) return
  updateTrajectoryHit(
    entry,
    1 - candidate.time,
    normalX,
    normalZ,
    startY,
    displacementY,
    projectileRadius,
    circle.minimumY,
    circle.maximumY,
    'circle',
    colliderIndex,
    output,
  )
}

function updateTrajectorySegmentHit(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endZ: number,
  displacementY: number,
  segment: ZombieEscapeCollisionSegment,
  footprintRadius: number,
  projectileRadius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
  candidate: ZombieEscapeCollisionHit,
) {
  resetCollisionHit(candidate)
  updateSegmentHit(startX, startZ, endX, endZ, segment, footprintRadius, colliderIndex, candidate)
  if (candidate.colliderKind === 'none') return
  const entry = candidate.time
  const normalX = candidate.normalX
  const normalZ = candidate.normalZ

  resetCollisionHit(candidate)
  updateSegmentHit(endX, endZ, startX, startZ, segment, footprintRadius, colliderIndex, candidate)
  if (!Number.isFinite(candidate.time)) return
  updateTrajectoryHit(
    entry,
    1 - candidate.time,
    normalX,
    normalZ,
    startY,
    displacementY,
    projectileRadius,
    segment.minimumY,
    segment.maximumY,
    'segment',
    colliderIndex,
    output,
  )
}

function updateTrajectoryHit(
  footprintEntry: number,
  footprintExit: number,
  footprintNormalX: number,
  footprintNormalZ: number,
  startY: number,
  displacementY: number,
  radius: number,
  colliderMinimumY: number,
  colliderMaximumY: number,
  colliderKind: 'box' | 'circle' | 'segment',
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  let verticalEntry = 0
  let verticalExit = 1
  if (Math.abs(displacementY) <= INTERSECTION_EPSILON) {
    if (
      startY < colliderMinimumY - radius - INTERSECTION_EPSILON ||
      startY > colliderMaximumY + radius + INTERSECTION_EPSILON
    ) {
      return
    }
  } else {
    const first = (colliderMinimumY - radius - startY) / displacementY
    const second = (colliderMaximumY + radius - startY) / displacementY
    verticalEntry = Math.max(0, Math.min(first, second))
    verticalExit = Math.min(1, Math.max(first, second))
  }

  const entry = Math.max(0, footprintEntry, verticalEntry)
  const exit = Math.min(1, footprintExit, verticalExit)
  if (entry > exit + INTERSECTION_EPSILON || entry >= output.time) return

  output.colliderIndex = colliderIndex
  output.colliderKind = colliderKind
  if (verticalEntry > footprintEntry + INTERSECTION_EPSILON) {
    output.normalX = 0
    output.normalY = displacementY > 0 ? -1 : 1
    output.normalZ = 0
  } else {
    output.normalX = footprintNormalX
    output.normalY = 0
    output.normalZ = footprintNormalZ
  }
  output.time = entry
}

function updateCircleHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  circle: ZombieEscapeCollisionCircle,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const amount = segmentCircleFirstIntersectionAmount(
    startX,
    startZ,
    endX,
    endZ,
    circle.x,
    circle.z,
    radius,
  )
  if (amount >= output.time) return
  const displacementX = endX - startX
  const displacementZ = endZ - startZ
  const hitX = startX + displacementX * amount
  const hitZ = startZ + displacementZ * amount
  let normalX = hitX - circle.x
  let normalZ = hitZ - circle.z
  const normalLength = Math.hypot(normalX, normalZ)
  if (normalLength <= INTERSECTION_EPSILON) {
    const displacementLength = Math.hypot(displacementX, displacementZ)
    normalX = displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
    normalZ = displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
  } else {
    normalX /= normalLength
    normalZ /= normalLength
  }
  output.colliderIndex = colliderIndex
  output.colliderKind = 'circle'
  output.normalX = normalX
  output.normalY = 0
  output.normalZ = normalZ
  output.time = amount
}

function updateBoxHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  box: ZombieEscapeCollisionBox,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const startOffsetX = startX - box.centerX
  const startOffsetZ = startZ - box.centerZ
  const worldDisplacementX = endX - startX
  const worldDisplacementZ = endZ - startZ
  const localStartX = box.cosine * startOffsetX - box.sine * startOffsetZ
  const localStartZ = box.sine * startOffsetX + box.cosine * startOffsetZ
  const localDisplacementX = box.cosine * worldDisplacementX - box.sine * worldDisplacementZ
  const localDisplacementZ = box.sine * worldDisplacementX + box.cosine * worldDisplacementZ
  const closestX = Math.max(-box.halfWidth, Math.min(box.halfWidth, localStartX))
  const closestZ = Math.max(-box.halfDepth, Math.min(box.halfDepth, localStartZ))
  const outsideX = localStartX - closestX
  const outsideZ = localStartZ - closestZ

  let bestTime = Number.POSITIVE_INFINITY
  let bestLocalNormalX = 0
  let bestLocalNormalZ = 0
  if (outsideX * outsideX + outsideZ * outsideZ <= radius * radius) {
    bestTime = 0
    const outsideLength = Math.hypot(outsideX, outsideZ)
    if (outsideLength > INTERSECTION_EPSILON) {
      bestLocalNormalX = outsideX / outsideLength
      bestLocalNormalZ = outsideZ / outsideLength
    } else {
      const horizontalDistance = box.halfWidth + radius - Math.abs(localStartX)
      const verticalDistance = box.halfDepth + radius - Math.abs(localStartZ)
      if (horizontalDistance < verticalDistance) {
        bestLocalNormalX =
          Math.abs(localStartX) > INTERSECTION_EPSILON
            ? Math.sign(localStartX)
            : localDisplacementX > 0
              ? -1
              : 1
      } else {
        bestLocalNormalZ =
          Math.abs(localStartZ) > INTERSECTION_EPSILON
            ? Math.sign(localStartZ)
            : localDisplacementZ > 0
              ? -1
              : 1
      }
    }
  } else {
    for (const sign of [-1, 1] as const) {
      if (localDisplacementX * sign < -INTERSECTION_EPSILON) {
        const time = (sign * (box.halfWidth + radius) - localStartX) / localDisplacementX
        const hitZ = localStartZ + localDisplacementZ * time
        if (
          time >= 0 &&
          time <= 1 &&
          Math.abs(hitZ) <= box.halfDepth + INTERSECTION_EPSILON &&
          time < bestTime
        ) {
          bestTime = time
          bestLocalNormalX = sign
          bestLocalNormalZ = 0
        }
      }
      if (localDisplacementZ * sign < -INTERSECTION_EPSILON) {
        const time = (sign * (box.halfDepth + radius) - localStartZ) / localDisplacementZ
        const hitX = localStartX + localDisplacementX * time
        if (
          time >= 0 &&
          time <= 1 &&
          Math.abs(hitX) <= box.halfWidth + INTERSECTION_EPSILON &&
          time < bestTime
        ) {
          bestTime = time
          bestLocalNormalX = 0
          bestLocalNormalZ = sign
        }
      }
    }

    for (const signX of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        const cornerX = signX * box.halfWidth
        const cornerZ = signZ * box.halfDepth
        const time = segmentCircleFirstIntersectionAmount(
          localStartX,
          localStartZ,
          localStartX + localDisplacementX,
          localStartZ + localDisplacementZ,
          cornerX,
          cornerZ,
          radius,
        )
        if (time >= bestTime) continue
        const hitX = localStartX + localDisplacementX * time
        const hitZ = localStartZ + localDisplacementZ * time
        if (
          hitX * signX < box.halfWidth - INTERSECTION_EPSILON ||
          hitZ * signZ < box.halfDepth - INTERSECTION_EPSILON
        ) {
          continue
        }
        const normalX = hitX - cornerX
        const normalZ = hitZ - cornerZ
        const normalLength = Math.hypot(normalX, normalZ)
        if (normalLength <= INTERSECTION_EPSILON) continue
        bestTime = time
        bestLocalNormalX = normalX / normalLength
        bestLocalNormalZ = normalZ / normalLength
      }
    }
  }

  if (bestTime >= output.time) return
  output.colliderIndex = colliderIndex
  output.colliderKind = 'box'
  output.normalX = box.cosine * bestLocalNormalX + box.sine * bestLocalNormalZ
  output.normalY = 0
  output.normalZ = -box.sine * bestLocalNormalX + box.cosine * bestLocalNormalZ
  output.time = bestTime
}

function updateSegmentHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  segment: ZombieEscapeCollisionSegment,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const segmentX = segment.endX - segment.startX
  const segmentZ = segment.endZ - segment.startZ
  const segmentLength = Math.hypot(segmentX, segmentZ)
  if (segmentLength <= INTERSECTION_EPSILON) {
    if (segment.startCap === 'flat' && segment.endCap === 'flat') return
    updatePointHit(
      startX,
      startZ,
      endX,
      endZ,
      segment.startX,
      segment.startZ,
      radius,
      colliderIndex,
      output,
    )
    return
  }

  const tangentX = segmentX / segmentLength
  const tangentZ = segmentZ / segmentLength
  const normalAxisX = -tangentZ
  const normalAxisZ = tangentX
  const startOffsetX = startX - segment.startX
  const startOffsetZ = startZ - segment.startZ
  const localStartX = startOffsetX * tangentX + startOffsetZ * tangentZ
  const localStartZ = startOffsetX * normalAxisX + startOffsetZ * normalAxisZ
  const displacementX = endX - startX
  const displacementZ = endZ - startZ
  const localDisplacementX = displacementX * tangentX + displacementZ * tangentZ
  const localDisplacementZ = displacementX * normalAxisX + displacementZ * normalAxisZ
  let entry = 0
  let exit = 1
  let entryNormalX = 0
  let entryNormalZ = 0

  if (Math.abs(localDisplacementX) <= INTERSECTION_EPSILON) {
    if (localStartX < 0 || localStartX > segmentLength) entry = Number.POSITIVE_INFINITY
  } else {
    let first = -localStartX / localDisplacementX
    let second = (segmentLength - localStartX) / localDisplacementX
    let normal = -1
    if (first > second) {
      const swap = first
      first = second
      second = swap
      normal = 1
    }
    if (first > entry) {
      entry = first
      entryNormalX = normal * tangentX
      entryNormalZ = normal * tangentZ
    }
    exit = Math.min(exit, second)
    if (entry > exit || exit < 0 || entry > 1) entry = Number.POSITIVE_INFINITY
  }

  if (Number.isFinite(entry)) {
    if (Math.abs(localDisplacementZ) <= INTERSECTION_EPSILON) {
      if (localStartZ < -radius || localStartZ > radius) entry = Number.POSITIVE_INFINITY
    } else {
      let first = (-radius - localStartZ) / localDisplacementZ
      let second = (radius - localStartZ) / localDisplacementZ
      let normal = -1
      if (first > second) {
        const swap = first
        first = second
        second = swap
        normal = 1
      }
      if (first > entry) {
        entry = first
        entryNormalX = normal * normalAxisX
        entryNormalZ = normal * normalAxisZ
      }
      exit = Math.min(exit, second)
      if (entry > exit || exit < 0 || entry > 1) entry = Number.POSITIVE_INFINITY
    }
  }

  let bestTime = entry >= 0 && entry <= 1 ? entry : Number.POSITIVE_INFINITY
  let bestNormalX = entryNormalX
  let bestNormalZ = entryNormalZ
  for (let endpoint = 0; endpoint < 2; endpoint += 1) {
    const rounded = endpoint === 0 ? segment.startCap === 'round' : segment.endCap === 'round'
    if (!rounded) continue
    const centerX = endpoint === 0 ? segment.startX : segment.endX
    const centerZ = endpoint === 0 ? segment.startZ : segment.endZ
    const time = segmentCircleFirstIntersectionAmount(
      startX,
      startZ,
      endX,
      endZ,
      centerX,
      centerZ,
      radius,
    )
    if (time >= bestTime) continue
    let normalX = startX + displacementX * time - centerX
    let normalZ = startZ + displacementZ * time - centerZ
    const normalLength = Math.hypot(normalX, normalZ)
    if (normalLength <= INTERSECTION_EPSILON) {
      const displacementLength = Math.hypot(displacementX, displacementZ)
      normalX = displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
      normalZ = displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
    } else {
      normalX /= normalLength
      normalZ /= normalLength
    }
    bestTime = time
    bestNormalX = normalX
    bestNormalZ = normalZ
  }

  if (bestTime === 0 && bestNormalX === 0 && bestNormalZ === 0) {
    const nearestAlongDistance = Math.min(Math.max(0, localStartX), segmentLength)
    const closestX = segment.startX + tangentX * nearestAlongDistance
    const closestZ = segment.startZ + tangentZ * nearestAlongDistance
    const normalX = startX - closestX
    const normalZ = startZ - closestZ
    const normalLength = Math.hypot(normalX, normalZ)
    if (normalLength > INTERSECTION_EPSILON) {
      bestNormalX = normalX / normalLength
      bestNormalZ = normalZ / normalLength
    } else {
      const side = localDisplacementZ > 0 ? -1 : 1
      bestNormalX = normalAxisX * side
      bestNormalZ = normalAxisZ * side
    }
  }
  if (bestTime >= output.time) return
  output.colliderIndex = colliderIndex
  output.colliderKind = 'segment'
  output.normalX = bestNormalX
  output.normalY = 0
  output.normalZ = bestNormalZ
  output.time = bestTime
}

function updatePointHit(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  centerX: number,
  centerZ: number,
  radius: number,
  colliderIndex: number,
  output: ZombieEscapeCollisionHit,
) {
  const time = segmentCircleFirstIntersectionAmount(
    startX,
    startZ,
    endX,
    endZ,
    centerX,
    centerZ,
    radius,
  )
  if (time >= output.time) return
  const displacementX = endX - startX
  const displacementZ = endZ - startZ
  let normalX = startX + displacementX * time - centerX
  let normalZ = startZ + displacementZ * time - centerZ
  const normalLength = Math.hypot(normalX, normalZ)
  if (normalLength <= INTERSECTION_EPSILON) {
    const displacementLength = Math.hypot(displacementX, displacementZ)
    normalX = displacementLength > INTERSECTION_EPSILON ? -displacementX / displacementLength : 1
    normalZ = displacementLength > INTERSECTION_EPSILON ? -displacementZ / displacementLength : 0
  } else {
    normalX /= normalLength
    normalZ /= normalLength
  }
  output.colliderIndex = colliderIndex
  output.colliderKind = 'segment'
  output.normalX = normalX
  output.normalY = 0
  output.normalZ = normalZ
  output.time = time
}

function segmentCircleFirstIntersectionAmount(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  centerX: number,
  centerZ: number,
  radius: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const offsetX = startX - centerX
  const offsetZ = startZ - centerZ
  const a = segmentX * segmentX + segmentZ * segmentZ
  const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius
  if (c <= 0) return 0
  if (a <= INTERSECTION_EPSILON) return Number.POSITIVE_INFINITY
  const b = 2 * (offsetX * segmentX + offsetZ * segmentZ)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Number.POSITIVE_INFINITY
  const root = Math.sqrt(discriminant)
  const first = (-b - root) / (2 * a)
  if (first >= 0 && first <= 1) return first
  const second = (-b + root) / (2 * a)
  return second >= 0 && second <= 1 ? second : Number.POSITIVE_INFINITY
}

function segmentCircleExitIntersectionAmount(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const a = segmentX * segmentX + segmentZ * segmentZ
  if (a <= INTERSECTION_EPSILON) return Number.POSITIVE_INFINITY
  const startDistanceSquared = startX * startX + startZ * startZ
  if (startDistanceSquared > radius * radius) return 0
  const b = 2 * (startX * segmentX + startZ * segmentZ)
  const c = startDistanceSquared - radius * radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Number.POSITIVE_INFINITY
  const exit = (-b + Math.sqrt(discriminant)) / (2 * a)
  return exit >= 0 && exit <= 1 ? exit : Number.POSITIVE_INFINITY
}

function findNearestWalkableCell(
  world: ZombieEscapeCollisionWorld,
  layerIndex: number,
  column: number,
  row: number,
  breakablesTraversable = false,
) {
  const maximumRadius = Math.max(world.gridWidth, world.gridHeight)
  for (let radius = 0; radius < maximumRadius; radius += 1) {
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
        if (Math.max(Math.abs(columnOffset), Math.abs(rowOffset)) !== radius) continue
        const candidateColumn = column + columnOffset
        const candidateRow = row + rowOffset
        if (
          !isGridCellWalkable(
            world,
            layerIndex,
            candidateColumn,
            candidateRow,
            breakablesTraversable,
          )
        ) {
          continue
        }
        return candidateRow * world.gridWidth + candidateColumn
      }
    }
  }
  return -1
}

function isGridCellWalkable(
  world: ZombieEscapeCollisionWorld,
  layerIndex: number,
  column: number,
  row: number,
  breakablesTraversable = false,
) {
  const layer = world.navigationLayers[layerIndex]
  return (
    layer !== undefined &&
    column >= 0 &&
    column < world.gridWidth &&
    row >= 0 &&
    row < world.gridHeight &&
    (breakablesTraversable ? layer.breakableOpenOccupancy : layer.occupancy)[
      row * world.gridWidth + column
    ] === 0
  )
}

function resolveNavigationLayerIndex(world: ZombieEscapeCollisionWorld, elevation: number) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < world.navigationLayers.length; index += 1) {
    const distance = Math.abs(elevation - world.navigationLayers[index]!.elevation)
    if (distance >= bestDistance) continue
    bestIndex = index
    bestDistance = distance
  }
  return bestIndex
}

function resolveSupportedNavigationLayerIndex(
  world: ZombieEscapeCollisionWorld,
  x: number,
  z: number,
  elevation: number,
) {
  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < world.navigationLayers.length; index += 1) {
    const layer = world.navigationLayers[index]!
    if (
      layer.elevation > elevation + NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS ||
      !navigationLayerSupportsPoint(world, index, x, z)
    ) {
      continue
    }
    const distance = Math.abs(elevation - layer.elevation)
    if (distance >= bestDistance) continue
    bestIndex = index
    bestDistance = distance
  }
  return bestIndex
}

export function resolveZombieEscapePinnedNavigationLayerIndex(
  world: ZombieEscapeCollisionWorld,
  x: number,
  z: number,
  elevation: number,
) {
  const nearestLayerIndex = resolveNavigationLayerIndex(world, elevation)
  const nearestLayer = world.navigationLayers[nearestLayerIndex]
  if (
    nearestLayer &&
    Math.abs(nearestLayer.elevation - elevation) <=
      NAVIGATION_CONNECTOR_ENTRY_HEIGHT_TOLERANCE_METERS
  ) {
    return nearestLayerIndex
  }
  return resolveSupportedNavigationLayerIndex(world, x, z, elevation)
}

function navigationLayerSupportsCell(
  world: ZombieEscapeCollisionWorld,
  layer: ZombieEscapeNavigationLayer,
  column: number,
  row: number,
) {
  return (
    column >= 0 &&
    column < world.gridWidth &&
    row >= 0 &&
    row < world.gridHeight &&
    layer.support[row * world.gridWidth + column] === 1
  )
}

function navigationCellCount(world: ZombieEscapeCollisionWorld) {
  return world.gridWidth * world.gridHeight
}

function navigationNodeCount(world: ZombieEscapeCollisionWorld) {
  return navigationGridNodeCount(world) + world.navigationConnectors.length * 2
}

function navigationGridNodeCount(world: ZombieEscapeCollisionWorld) {
  return navigationCellCount(world) * world.navigationLayers.length
}

function navigationNode(world: ZombieEscapeCollisionWorld, layerIndex: number, cell: number) {
  return layerIndex * navigationCellCount(world) + cell
}

function navigationNodeLayerIndex(world: ZombieEscapeCollisionWorld, node: number) {
  return isGridNavigationNode(world, node) ? Math.floor(node / navigationCellCount(world)) : -1
}

function navigationNodeCell(world: ZombieEscapeCollisionWorld, node: number) {
  return isGridNavigationNode(world, node) ? node % navigationCellCount(world) : -1
}

function isGridNavigationNode(world: ZombieEscapeCollisionWorld, node: number) {
  return node >= 0 && node < navigationGridNodeCount(world)
}

function resolveNavigationNodePlanPosition(world: ZombieEscapeCollisionWorld, node: number) {
  if (isGridNavigationNode(world, node)) {
    const cell = navigationNodeCell(world, node)
    const column = cell % world.gridWidth
    const row = Math.floor(cell / world.gridWidth)
    return {
      x: world.gridOriginX + (column + 0.5) * world.cellSize,
      z: world.gridOriginZ + (row + 0.5) * world.cellSize,
    }
  }
  const endpoint = node - navigationGridNodeCount(world)
  const connector = world.navigationConnectors[Math.floor(endpoint / 2)]
  if (!connector) return { x: 0, z: 0 }
  return endpoint % 2 === 1
    ? { x: connector.endX, z: connector.endZ }
    : { x: connector.startX, z: connector.startZ }
}

function worldColumn(world: ZombieEscapeCollisionWorld, x: number) {
  return clampGridIndex(Math.floor((x - world.gridOriginX) / world.cellSize), world.gridWidth)
}

function worldRow(world: ZombieEscapeCollisionWorld, z: number) {
  return clampGridIndex(Math.floor((z - world.gridOriginZ) / world.cellSize), world.gridHeight)
}

function clampGridIndex(index: number, size: number) {
  return Math.max(0, Math.min(size - 1, index))
}

function copyZombieEscapeCollisionHit(
  output: ZombieEscapeCollisionHit,
  source: ZombieEscapeCollisionHit,
) {
  output.colliderIndex = source.colliderIndex
  output.colliderKind = source.colliderKind
  output.normalX = source.normalX
  output.normalY = source.normalY
  output.normalZ = source.normalZ
  output.time = source.time
}

function resetCollisionHit(hit: ZombieEscapeCollisionHit) {
  hit.colliderIndex = -1
  hit.colliderKind = 'none'
  hit.normalX = 0
  hit.normalY = 0
  hit.normalZ = 0
  hit.time = Number.POSITIVE_INFINITY
}

function createCollisionWorldSemanticKey(
  playRadius: number,
  boundaryPolicy: ZombieEscapeCollisionBoundaryPolicy,
  agentRadius: number,
  cellSize: number,
  broadphaseCellSize: number,
  boxes: readonly ZombieEscapeCollisionBox[],
  circles: readonly ZombieEscapeCollisionCircle[],
  segments: readonly ZombieEscapeCollisionSegment[],
  navigationConnectors: readonly ZombieEscapeNavigationConnector[],
  navigationSupports: readonly ZombieEscapeNavigationSupportSource[],
  objectCatalog: ZombieEscapeCollisionObjectCatalog,
) {
  return JSON.stringify([
    playRadius,
    boundaryPolicy,
    agentRadius,
    cellSize,
    broadphaseCellSize,
    boxes.map((box) => [
      box.id,
      box.objectId,
      box.breakable,
      box.centerX,
      box.centerZ,
      box.halfWidth,
      box.halfDepth,
      box.rotation,
      serializeVerticalBound(box.minimumY),
      serializeVerticalBound(box.maximumY),
      box.navigationLayerY,
    ]),
    circles.map((circle) => [
      circle.id,
      circle.objectId,
      circle.breakable,
      circle.x,
      circle.z,
      circle.radius,
      serializeVerticalBound(circle.minimumY),
      serializeVerticalBound(circle.maximumY),
      circle.navigationLayerY,
    ]),
    segments.map((segment) => [
      segment.id,
      segment.objectId,
      segment.breakable,
      segment.startX,
      segment.startZ,
      segment.endX,
      segment.endZ,
      segment.halfThickness,
      segment.startCap,
      segment.endCap,
      serializeVerticalBound(segment.minimumY),
      serializeVerticalBound(segment.maximumY),
      segment.navigationLayerY,
    ]),
    navigationConnectors.map((connector) => [
      connector.id,
      connector.objectId,
      connector.ascendingEnd,
      connector.chainId,
      connector.chainLowerY,
      connector.chainOrder,
      connector.chainUpperY,
      connector.startX,
      connector.startY,
      connector.startZ,
      connector.endX,
      connector.endY,
      connector.endZ,
      connector.halfWidth,
    ]),
    navigationSupports.map((support) => [
      support.id,
      support.boundary === true,
      support.elevation,
      support.polygon.map(({ x, z }) => [x, z]),
      (support.holes ?? []).map((hole) => hole.map(({ x, z }) => [x, z])),
    ]),
    objectCatalog.objectIds.map((objectId, objectOrdinal) => [
      objectId,
      objectCatalog.objectSemanticKinds[objectOrdinal],
    ]),
  ])
}

function hashSemanticKey(semanticKey: string) {
  let hash = 0x811c_9dc5
  for (let index = 0; index < semanticKey.length; index += 1) {
    hash ^= semanticKey.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function serializeVerticalBound(value: number) {
  if (value === Number.NEGATIVE_INFINITY) return '-infinity'
  if (value === Number.POSITIVE_INFINITY) return 'infinity'
  return value
}

function normalizeCircle(circle: ZombieEscapeCollisionCircleSource): ZombieEscapeCollisionCircle {
  const verticalRange = normalizeVerticalRange(circle.minimumY, circle.maximumY)
  return {
    breakable: circle.breakable === true,
    id: circle.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: normalizeNavigationLayerY(circle.navigationLayerY),
    objectId: circle.objectId ?? circle.id,
    radius: Math.max(0, circle.radius),
    x: circle.x,
    z: circle.z,
  }
}

function normalizeBox(box: ZombieEscapeCollisionBoxSource): ZombieEscapeCollisionBox {
  const verticalRange = normalizeVerticalRange(box.minimumY, box.maximumY)
  const rotation = normalizeAngle(box.rotation)
  return {
    breakable: box.breakable === true,
    centerX: box.centerX,
    centerZ: box.centerZ,
    cosine: Math.cos(rotation),
    halfDepth: Math.max(0, box.halfDepth),
    halfWidth: Math.max(0, box.halfWidth),
    id: box.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: normalizeNavigationLayerY(box.navigationLayerY),
    objectId: box.objectId ?? box.id,
    rotation,
    sine: Math.sin(rotation),
  }
}

function normalizeNavigationConnector(
  connector: ZombieEscapeNavigationConnectorSource,
): ZombieEscapeNavigationConnector {
  const deltaX = connector.endX - connector.startX
  const deltaZ = connector.endZ - connector.startZ
  const length = Math.hypot(deltaX, deltaZ)
  return {
    ascendingEnd: connector.ascendingEnd,
    chainId: connector.chainId,
    chainLowerY: Math.min(connector.chainLowerY, connector.chainUpperY),
    chainOrder: Math.max(0, Math.trunc(connector.chainOrder)),
    chainUpperY: Math.max(connector.chainLowerY, connector.chainUpperY),
    directionX: deltaX / length,
    directionZ: deltaZ / length,
    endCell: -1,
    endLayerIndex: -1,
    endX: connector.endX,
    endY: connector.endY,
    endZ: connector.endZ,
    halfWidth: Math.max(0, connector.halfWidth),
    id: connector.id,
    length,
    objectId: connector.objectId ?? connector.id,
    startCell: -1,
    startLayerIndex: -1,
    startX: connector.startX,
    startY: connector.startY,
    startZ: connector.startZ,
  }
}

function normalizeNavigationSupport(
  support: ZombieEscapeNavigationSupportSource,
): ZombieEscapeNavigationSupportSource {
  return {
    boundary: support.boundary === true,
    elevation: support.elevation,
    holes: (support.holes ?? []).map((hole) => hole.map(({ x, z }) => ({ x, z }))),
    id: support.id,
    polygon: support.polygon.map(({ x, z }) => ({ x, z })),
  }
}

function createNavigationSupportUnion(supports: readonly ZombieEscapeNavigationSupportSource[]) {
  const groups: ZombieEscapeNavigationSupportSource[][] = []
  for (const support of supports) {
    const group = groups[groups.length - 1]
    if (group && navigationSupportElevationsMatch(group[0]!.elevation, support.elevation)) {
      group.push(support)
    } else {
      groups.push([support])
    }
  }

  const resolved: ZombieEscapeNavigationSupportSource[] = []
  for (const group of groups) {
    const polygons = group.map(navigationSupportToClippingPolygon)
    const union: MultiPolygon = polygonClipping.union(polygons[0]!, ...polygons.slice(1))
    const groupKey = hashSemanticKey(
      JSON.stringify(
        group.map(({ boundary, elevation, holes, id, polygon }) => [
          id,
          elevation,
          boundary === true,
          polygon,
          holes ?? [],
        ]),
      ),
    )
    for (let component = 0; component < union.length; component += 1) {
      const polygon = union[component]!
      const outer = clippingRingToNavigationRing(polygon[0])
      if (outer.length < 3) continue
      const holes = polygon
        .slice(1)
        .map(clippingRingToNavigationRing)
        .filter((hole) => hole.length >= 3)
      resolved.push({
        boundary: group.some((support) => support.boundary === true),
        elevation: group[0]!.elevation,
        holes,
        id: `navigation-support-union:${groupKey}:${String(component)}`,
        polygon: outer,
      })
    }
  }
  return resolved.sort(
    (first, second) => first.elevation - second.elevation || first.id.localeCompare(second.id),
  )
}

function navigationSupportToClippingPolygon(support: ZombieEscapeNavigationSupportSource): Polygon {
  return [
    navigationRingToClippingRing(support.polygon),
    ...(support.holes ?? []).map(navigationRingToClippingRing),
  ]
}

function navigationRingToClippingRing(ring: readonly Readonly<{ x: number; z: number }>[]): Ring {
  const output: Ring = ring.map(({ x, z }) => [x, z])
  const first = output[0]
  const last = output[output.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) output.push([...first])
  return output
}

function clippingRingToNavigationRing(ring: Ring | undefined) {
  if (!ring) return []
  const points = ring.map(([x, z]) => ({ x, z }))
  const first = points[0]
  const last = points[points.length - 1]
  if (first && last && first.x === last.x && first.z === last.z) points.pop()
  return points
}

function resolveSparseNavigationConnectors(
  connectors: readonly ZombieEscapeNavigationConnector[],
  navigationLayers: readonly ZombieEscapeNavigationLayer[],
) {
  return connectors.map((connector) => ({
    ...connector,
    endCell: -1,
    endLayerIndex: resolveNavigationConnectorLandingLayerIndex(navigationLayers, connector.endY),
    startCell: -1,
    startLayerIndex: resolveNavigationConnectorLandingLayerIndex(
      navigationLayers,
      connector.startY,
    ),
  }))
}

function resolveNavigationConnectorCells(
  connectors: readonly ZombieEscapeNavigationConnector[],
  navigationLayers: readonly ZombieEscapeNavigationLayer[],
  gridWidth: number,
  gridHeight: number,
  gridOriginX: number,
  gridOriginZ: number,
  cellSize: number,
  agentRadius: number,
) {
  const landingEndpoints = resolveNavigationConnectorLandingEndpoints(connectors)
  return connectors.map((connector, connectorIndex) => {
    const endLayerIndex = resolveNavigationConnectorLandingLayerIndex(
      navigationLayers,
      connector.endY,
    )
    const startLayerIndex = resolveNavigationConnectorLandingLayerIndex(
      navigationLayers,
      connector.startY,
    )
    return {
      ...connector,
      endCell: landingEndpoints.has(`${String(connectorIndex)}:end`)
        ? resolveNavigationConnectorEndpointCell(
            connector,
            true,
            navigationLayers[endLayerIndex]?.occupancy,
            gridWidth,
            gridHeight,
            gridOriginX,
            gridOriginZ,
            cellSize,
            agentRadius,
          )
        : -1,
      endLayerIndex,
      startCell: landingEndpoints.has(`${String(connectorIndex)}:start`)
        ? resolveNavigationConnectorEndpointCell(
            connector,
            false,
            navigationLayers[startLayerIndex]?.occupancy,
            gridWidth,
            gridHeight,
            gridOriginX,
            gridOriginZ,
            cellSize,
            agentRadius,
          )
        : -1,
      startLayerIndex,
    }
  })
}

function resolveNavigationConnectorLandingEndpoints(
  connectors: readonly ZombieEscapeNavigationConnector[],
) {
  const endpoints = new Set<string>()
  const connectorIndicesByChain = groupNavigationConnectorIndicesByChain(connectors)
  for (const indices of connectorIndicesByChain.values()) {
    const firstIndex = indices[0]
    const lastIndex = indices[indices.length - 1]
    if (firstIndex === undefined || lastIndex === undefined) continue
    const first = connectors[firstIndex]!
    const last = connectors[lastIndex]!
    endpoints.add(`${String(firstIndex)}:${first.ascendingEnd ? 'start' : 'end'}`)
    endpoints.add(`${String(lastIndex)}:${last.ascendingEnd ? 'end' : 'start'}`)
  }
  return endpoints
}

function resolveNavigationConnectorLandingLayerIndex(
  layers: readonly ZombieEscapeNavigationLayer[],
  elevation: number,
) {
  const layerIndex = resolveNavigationLayerIndexFromLayers(layers, elevation)
  const layer = layers[layerIndex]
  return layer &&
    Math.abs(layer.elevation - elevation) <= NAVIGATION_CONNECTOR_TARGET_LANDING_TOLERANCE_METERS
    ? layerIndex
    : -1
}

function resolveNavigationConnectorEndpointCell(
  connector: ZombieEscapeNavigationConnector,
  end: boolean,
  occupancy: Uint8Array | undefined,
  gridWidth: number,
  gridHeight: number,
  gridOriginX: number,
  gridOriginZ: number,
  cellSize: number,
  agentRadius: number,
) {
  if (!occupancy) return -1
  const directionAmount = end ? 1 : -1
  const endpointX = end ? connector.endX : connector.startX
  const endpointZ = end ? connector.endZ : connector.startZ
  const minimumClearance = agentRadius + cellSize
  for (let step = 0; step < 8; step += 1) {
    const clearance = minimumClearance + step * cellSize
    const x = endpointX + connector.directionX * directionAmount * clearance
    const z = endpointZ + connector.directionZ * directionAmount * clearance
    const column = Math.floor((x - gridOriginX) / cellSize)
    const row = Math.floor((z - gridOriginZ) / cellSize)
    if (
      column >= 0 &&
      column < gridWidth &&
      row >= 0 &&
      row < gridHeight &&
      occupancy[row * gridWidth + column] === 0
    ) {
      return row * gridWidth + column
    }
  }
  return -1
}

function createNavigationConnectorAdjacency(
  connectors: readonly ZombieEscapeNavigationConnector[],
  cellCount: number,
  nodeCount: number,
) {
  const edges: ZombieEscapeNavigationConnectorEdge[] = []
  const gridNodeCount = nodeCount - connectors.length * 2
  for (let connectorIndex = 0; connectorIndex < connectors.length; connectorIndex += 1) {
    const connector = connectors[connectorIndex]!
    const startNode = connectorGraphEndpointNode(connectorIndex, false, gridNodeCount)
    const endNode = connectorGraphEndpointNode(connectorIndex, true, gridNodeCount)
    appendBidirectionalNavigationEdge(edges, startNode, endNode)
    if (connector.startCell >= 0 && connector.startLayerIndex >= 0) {
      appendBidirectionalNavigationEdge(
        edges,
        startNode,
        connector.startLayerIndex * cellCount + connector.startCell,
      )
    }
    if (connector.endCell >= 0 && connector.endLayerIndex >= 0) {
      appendBidirectionalNavigationEdge(
        edges,
        endNode,
        connector.endLayerIndex * cellCount + connector.endCell,
      )
    }
  }
  const connectorIndicesByChain = groupNavigationConnectorIndicesByChain(connectors)
  for (const indices of connectorIndicesByChain.values()) {
    for (let order = 0; order < indices.length - 1; order += 1) {
      const firstIndex = indices[order]!
      const secondIndex = indices[order + 1]!
      const first = connectors[firstIndex]!
      const second = connectors[secondIndex]!
      const firstAscendingNode = connectorGraphEndpointNode(
        firstIndex,
        first.ascendingEnd,
        gridNodeCount,
      )
      const secondDescendingNode = connectorGraphEndpointNode(
        secondIndex,
        !second.ascendingEnd,
        gridNodeCount,
      )
      appendBidirectionalNavigationEdge(edges, firstAscendingNode, secondDescendingNode)
    }
  }
  edges.sort((first, second) => first.fromNode - second.fromNode || first.toNode - second.toNode)
  const nodeOffsets = new Uint32Array(nodeCount + 1)
  for (const edge of edges) {
    nodeOffsets[edge.fromNode + 1]! += 1
  }
  for (let node = 0; node < nodeCount; node += 1) {
    nodeOffsets[node + 1] = nodeOffsets[node + 1]! + nodeOffsets[node]!
  }
  const toNodes = new Int32Array(edges.length)
  let edgeIndex = 0
  for (const edge of edges) {
    toNodes[edgeIndex] = edge.toNode
    edgeIndex += 1
  }
  return { nodeOffsets, toNodes }
}

function groupNavigationConnectorIndicesByChain(
  connectors: readonly ZombieEscapeNavigationConnector[],
) {
  const indicesByChain = new Map<string, number[]>()
  for (let index = 0; index < connectors.length; index += 1) {
    const connector = connectors[index]!
    const indices = indicesByChain.get(connector.chainId)
    if (indices) indices.push(index)
    else indicesByChain.set(connector.chainId, [index])
  }
  for (const indices of indicesByChain.values()) {
    indices.sort((first, second) => {
      const firstConnector = connectors[first]!
      const secondConnector = connectors[second]!
      return firstConnector.chainOrder - secondConnector.chainOrder || first - second
    })
  }
  return indicesByChain
}

function appendBidirectionalNavigationEdge(
  edges: ZombieEscapeNavigationConnectorEdge[],
  firstNode: number,
  secondNode: number,
) {
  edges.push({ fromNode: firstNode, toNode: secondNode })
  edges.push({ fromNode: secondNode, toNode: firstNode })
}

function connectorGraphEndpointNode(connectorIndex: number, end: boolean, gridNodeCount: number) {
  return gridNodeCount + connectorIndex * 2 + (end ? 1 : 0)
}

function resolveNavigationLayerIndexFromLayers(
  layers: readonly ZombieEscapeNavigationLayer[],
  elevation: number,
) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < layers.length; index += 1) {
    const distance = Math.abs(elevation - layers[index]!.elevation)
    if (distance >= bestDistance) continue
    bestIndex = index
    bestDistance = distance
  }
  return bestIndex
}

function normalizeSegment(
  segment: ZombieEscapeCollisionSegmentSource,
): ZombieEscapeCollisionSegment {
  const verticalRange = normalizeVerticalRange(segment.minimumY, segment.maximumY)
  return {
    breakable: segment.breakable === true,
    endCap: segment.endCap === 'flat' ? 'flat' : 'round',
    endX: segment.endX,
    endZ: segment.endZ,
    halfThickness: Math.max(0, segment.halfThickness),
    id: segment.id,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: normalizeNavigationLayerY(segment.navigationLayerY),
    objectId: segment.objectId ?? segment.id,
    startCap: segment.startCap === 'flat' ? 'flat' : 'round',
    startX: segment.startX,
    startZ: segment.startZ,
  }
}

function normalizeNavigationLayerY(value: number | undefined) {
  return Number.isFinite(value) ? (value ?? 0) : 0
}

function normalizeVerticalRange(minimumY: number | undefined, maximumY: number | undefined) {
  const resolvedMinimumY =
    minimumY === undefined || Number.isNaN(minimumY) ? Number.NEGATIVE_INFINITY : minimumY
  const resolvedMaximumY =
    maximumY === undefined || Number.isNaN(maximumY) ? Number.POSITIVE_INFINITY : maximumY
  return {
    maximumY: Math.max(resolvedMinimumY, resolvedMaximumY),
    minimumY: Math.min(resolvedMinimumY, resolvedMaximumY),
  }
}

function verticalRangesOverlap(
  collider: Readonly<{ maximumY: number; minimumY: number }>,
  minimumY: number,
  maximumY: number,
) {
  return collider.maximumY >= minimumY && collider.minimumY <= maximumY
}

function compareCollisionCircles(
  first: ZombieEscapeCollisionCircle,
  second: ZombieEscapeCollisionCircle,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.breakable) - Number(second.breakable) ||
    first.x - second.x ||
    first.z - second.z ||
    first.radius - second.radius ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY ||
    first.navigationLayerY - second.navigationLayerY
  )
}

function compareCollisionBoxes(first: ZombieEscapeCollisionBox, second: ZombieEscapeCollisionBox) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.breakable) - Number(second.breakable) ||
    first.centerX - second.centerX ||
    first.centerZ - second.centerZ ||
    first.halfWidth - second.halfWidth ||
    first.halfDepth - second.halfDepth ||
    first.rotation - second.rotation ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY ||
    first.navigationLayerY - second.navigationLayerY
  )
}

function compareCollisionSegments(
  first: ZombieEscapeCollisionSegment,
  second: ZombieEscapeCollisionSegment,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.breakable) - Number(second.breakable) ||
    first.startX - second.startX ||
    first.startZ - second.startZ ||
    first.endX - second.endX ||
    first.endZ - second.endZ ||
    first.halfThickness - second.halfThickness ||
    first.startCap.localeCompare(second.startCap) ||
    first.endCap.localeCompare(second.endCap) ||
    first.minimumY - second.minimumY ||
    first.maximumY - second.maximumY ||
    first.navigationLayerY - second.navigationLayerY
  )
}

function compareNavigationConnectors(
  first: ZombieEscapeNavigationConnector,
  second: ZombieEscapeNavigationConnector,
) {
  return (
    first.objectId.localeCompare(second.objectId) ||
    first.id.localeCompare(second.id) ||
    Number(first.ascendingEnd) - Number(second.ascendingEnd) ||
    first.chainId.localeCompare(second.chainId) ||
    first.chainLowerY - second.chainLowerY ||
    first.chainOrder - second.chainOrder ||
    first.chainUpperY - second.chainUpperY ||
    first.startX - second.startX ||
    first.startY - second.startY ||
    first.startZ - second.startZ ||
    first.endX - second.endX ||
    first.endY - second.endY ||
    first.endZ - second.endZ ||
    first.halfWidth - second.halfWidth
  )
}

function isFiniteCircle(circle: ZombieEscapeCollisionCircleSource) {
  return (
    [circle.x, circle.z, circle.radius].every(Number.isFinite) &&
    optionalFinite(circle.minimumY) &&
    optionalFinite(circle.maximumY) &&
    optionalStrictFinite(circle.navigationLayerY)
  )
}

function isFiniteBox(box: ZombieEscapeCollisionBoxSource) {
  return (
    [box.centerX, box.centerZ, box.halfDepth, box.halfWidth, box.rotation].every(Number.isFinite) &&
    optionalFinite(box.minimumY) &&
    optionalFinite(box.maximumY) &&
    optionalStrictFinite(box.navigationLayerY)
  )
}

function isFiniteSegment(segment: ZombieEscapeCollisionSegmentSource) {
  return (
    [segment.startX, segment.startZ, segment.endX, segment.endZ, segment.halfThickness].every(
      Number.isFinite,
    ) &&
    optionalFinite(segment.minimumY) &&
    optionalFinite(segment.maximumY) &&
    optionalStrictFinite(segment.navigationLayerY)
  )
}

function isFiniteNavigationConnector(connector: ZombieEscapeNavigationConnectorSource) {
  return (
    [
      connector.startX,
      connector.startY,
      connector.startZ,
      connector.endX,
      connector.endY,
      connector.endZ,
      connector.halfWidth,
      connector.chainLowerY,
      connector.chainOrder,
      connector.chainUpperY,
    ].every(Number.isFinite) &&
    connector.chainId.length > 0 &&
    connector.halfWidth > INTERSECTION_EPSILON &&
    Math.hypot(connector.endX - connector.startX, connector.endZ - connector.startZ) >
      INTERSECTION_EPSILON
  )
}

function isFiniteNavigationSupport(support: ZombieEscapeNavigationSupportSource) {
  return (
    support.id.length > 0 &&
    Number.isFinite(support.elevation) &&
    support.polygon.length >= 3 &&
    support.polygon.every(({ x, z }) => Number.isFinite(x) && Number.isFinite(z)) &&
    (support.holes ?? []).every(
      (hole) =>
        hole.length >= 3 && hole.every(({ x, z }) => Number.isFinite(x) && Number.isFinite(z)),
    )
  )
}

function optionalStrictFinite(value: number | undefined) {
  return value === undefined || Number.isFinite(value)
}

function optionalFinite(value: number | undefined) {
  return value === undefined || !Number.isNaN(value)
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeSparseSearchBudget(value: number) {
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_SAFE_INTEGER
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2
  return ((((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
}
