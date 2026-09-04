import {
  constrainZombieEscapeAgentSeparationToRoute,
  createZombieEscapeAgentSeparation,
  createZombieEscapeAgentSpatialIndex,
  rebuildZombieEscapeAgentSpatialIndex,
  resetZombieEscapeAgentSpatialIndex,
  resolveZombieEscapeAgentSeparation,
  type ZombieEscapeAgentSeparation,
  type ZombieEscapeAgentSpatialIndex,
  zombieEscapeAgentSpatialPositionIsClear,
} from './zombie-escape-agent-spatial-index'
import {
  bindZombieEscapeAmbientHandoffOwnership,
  clearZombieEscapeAmbientHandoffOwnership,
  clearZombieEscapeAmbientHandoffSlotOwnership,
  createZombieEscapeAmbientHandoffState,
  installZombieEscapeAmbientHandoffSource,
  resetZombieEscapeAmbientHandoff,
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION,
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_MAXIMUM_ANCHOR_ATTEMPTS,
  type ZombieEscapeAmbientHandoffSource,
  type ZombieEscapeAmbientHandoffState,
} from './zombie-escape-ambient-handoff'
import {
  createZombieEscapeAudioEventRing,
  emitZombieEscapeAudioEvent,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventRing,
} from './zombie-escape-audio-events'
import {
  acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval,
  adoptZombieEscapeSparsePublishedRouteAtWaypoint,
  beginZombieEscapeSparseFlowSearch,
  beginZombieEscapeSparseTargetUpdate,
  classifyZombieEscapeCollisionObjectDelta,
  clearZombieEscapeSparseFlowSearchRouteCorridor,
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionObjectDeltaResult,
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldActiveView,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeNavigationMoveResult,
  createZombieEscapeReachableSpawn,
  createZombieEscapeSparseCommittedNodeRoute,
  createZombieEscapeSparseFlowSearch,
  createZombieEscapeSparseSpawnAnchor,
  deactivateZombieEscapeCollisionObject,
  findFirstActiveZombieEscapeBreakableObjectId,
  followZombieEscapeCachedSparseWaypoint,
  getZombieEscapeSparseCommittedRouteGeneration,
  getZombieEscapeSparseFlowSearchRouteGeneration,
  getZombieEscapeSparseRequestedTargetRevision,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  isZombieEscapeCollisionHitBreakable,
  isZombieEscapeCollisionObjectBreakable,
  isZombieEscapeCollisionObjectBreakableAtElevation,
  moveZombieEscapeCircleWithSlide,
  moveZombieEscapeNavigationAgent,
  resetZombieEscapeSparseFlowSearch,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeCollisionHitObjectOrdinal,
  resolveZombieEscapeFlowDirection,
  resolveZombieEscapeReachableSpawn,
  sampleZombieEscapeSparseCommittedNodeRoute,
  sampleZombieEscapeSparseSpawnAnchor,
  seedZombieEscapeSparseFlowSearchRouteCorridor,
  setZombieEscapeFlowFieldWorld,
  stepZombieEscapeSparseFlowSearch,
  stepZombieEscapeSparseTargetUpdate,
  sweepZombieEscapeProjectileAgainstWorld,
  updateZombieEscapeFlowTarget,
  type ZombieEscapeCircleMoveResult,
  type ZombieEscapeCollisionCircleSource,
  type ZombieEscapeCollisionHit,
  type ZombieEscapeCollisionObjectDeltaResult,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeFlowField,
  type ZombieEscapeFlowSample,
  type ZombieEscapeNavigationMoveResult,
  type ZombieEscapeSparseFlowSearch,
  type ZombieEscapeSparseNavigationGraph,
  type ZombieEscapeSparseSearchBudget,
  type ZombieEscapeSparseTargetUpdateBudget,
  zombieEscapeCollisionObjectOrdinalIsActive,
  zombieEscapeSameLayerNavigationSegmentIsClear,
  zombieEscapeSegmentIsClearInVerticalRange,
  zombieEscapeSparseFlowSearchCanBegin,
  zombieEscapeSparseFlowSearchCanProgress,
  zombieEscapeSparseFlowSearchHasAttachmentHeapLease,
  zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease,
} from './zombie-escape-collision-world'
import {
  resolveZombieEscapeMeleePhaseProgress,
  ZOMBIE_ESCAPE_MELEE_HIT_ACTIVE_PROGRESS,
  type ZombieEscapeMeleePhase,
} from './zombie-escape-combat-pose'
import {
  getZombieEscapeZombieCatalogEntry,
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_CAMERA_BOOKMARKS,
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_DEBUG_MODES,
  ZOMBIE_ESCAPE_MELEE,
  ZOMBIE_ESCAPE_PLAYER_HEIGHT,
  ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
  ZOMBIE_ESCAPE_SEED,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_WEAPON_PROFILES,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
  type ZombieEscapeCameraBookmark,
  type ZombieEscapeDebugMode,
} from './zombie-escape-config'
import type { ZombieEscapeControlState } from './zombie-escape-controls'
import {
  captureZombieEscapeImpactAttachment,
  createZombieEscapeImpactAttachment,
  type ZombieEscapeImpactAttachment,
} from './zombie-escape-impact-attachment'
import {
  createZombieEscapePlayerTrail,
  createZombieEscapePlayerTrailPoint,
  getZombieEscapePlayerTrailOldestSequence,
  readZombieEscapePlayerTrailPoint,
  recordZombieEscapePlayerTrailPoint,
  resetZombieEscapePlayerTrail,
  setZombieEscapePlayerTrailOutgoingConnector,
  type ZombieEscapePlayerTrail,
  type ZombieEscapePlayerTrailPoint,
  type ZombieEscapePlayerTrailPointInput,
} from './zombie-escape-player-trail'
import {
  acquireZombieEscapePoolSlot,
  createZombieEscapeFixedPool,
  releaseZombieEscapePoolSlot,
  resetZombieEscapeFixedPool,
  type ZombieEscapeFixedPool,
} from './zombie-escape-pool'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
  type ZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import {
  createZombieEscapeRandomState,
  nextZombieEscapeRandom,
  resetZombieEscapeRandomState,
  type ZombieEscapeRandomState,
} from './zombie-escape-random'
import {
  clearZombieEscapeSharedRouteCache,
  createZombieEscapeSharedRouteCache,
  publishZombieEscapeSharedComponentRoute,
  publishZombieEscapeSharedRoute,
  readZombieEscapeSharedComponentRouteWaypoint,
  readZombieEscapeSharedRouteWaypoint,
  type ZombieEscapeSharedRouteCache,
} from './zombie-escape-shared-route-cache'
import {
  resolveSparseNavigationNearestStrictTargetProjection,
  resolveSparseNavigationStrictRegionIndex,
  sparseNavigationBucketKey,
  type ZombieEscapeSparseNavigationTargetProjection,
} from './zombie-escape-sparse-navigation'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import {
  resolveZombieEscapeRadialDamageScale,
  writeZombieEscapeSymmetricSpreadDirection,
  type ZombieEscapeWeaponDirection,
  zombieEscapeTargetPrecedesByDistance,
} from './zombie-escape-weapon-mechanics'
import {
  createZombieEscapeFallbackWeaponPickupPlacements,
  type ZombieEscapeWeaponPickupPlacement,
} from './zombie-escape-weapon-pickup-data'
import type { ZombieEscapeArenaData } from './zombie-escape-world'
import {
  ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
} from './zombie-escape-zombie-catalog'
import {
  createZombieEscapeZombieRoster,
  resolveZombieEscapeFirstProjectileSlowdownMultiplier,
  resolveZombieEscapeProjectileSlowdownMultiplier,
  resolveZombieEscapeSpawnSpeedScale,
  ZOMBIE_ESCAPE_ZOMBIE_GAIT,
  type ZombieEscapeAmbientNpcSourceId,
} from './zombie-escape-zombie-roster'

export type ZombieEscapeGameStatus = 'lost' | 'playing' | 'won'
export type ZombieEscapeGamePhase = 'build' | 'night'
export type ZombieEscapeWaveState = 'active' | 'escape' | 'intermission'
type ZombieEscapePlayerTrailPointScratch = {
  -readonly [Key in keyof ZombieEscapePlayerTrailPointInput]: ZombieEscapePlayerTrailPointInput[Key]
}
export type ZombieEscapePurchaseFeedback = 'insufficient-funds' | 'purchased' | null
export type ZombieEscapeSimulationOptions = Readonly<{
  requireSparseNavigation?: boolean
  zombieCapacity?: number
}>

export type ZombieEscapeMultiplayerOwnership = {
  activePlayerIndex: () => number
  bindPlayerIndex: (index: number) => void
  bindZombieTarget: (slot: number) => boolean
  collisionMaskChanged: () => void
  healPlayers: (amount: number) => void
  navigationLeaseBudget: (slot: number) => number
  navigationTargetRejected: (slot: number) => void
  prepareTargets: () => void
  reserveNavigationLease: (slot: number) => void
  selectShotOwner: (slot: number) => void
  selectSpawnTarget: () => boolean
  spawnPositionAllowed: (x: number, z: number, minimumDistanceSquared: number) => boolean
  shotCreated: (slot: number) => void
  targetMatchesActive: (slot: number) => boolean
  updatePlayers: (delta: number) => void
  worldChanged: () => void
  zombieCreated: (slot: number) => void
}

const ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS = 21.4
const ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MAXIMUM_RADIUS_METERS = 22.8
const ZOMBIE_ESCAPE_WAVE_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS = 8
const ZOMBIE_ESCAPE_WAVE_SPAWN_AUTHORED_GROUND_ELEVATION_METERS = 0
const ZOMBIE_ESCAPE_WAVE_SPAWN_MAXIMUM_PROBES_PER_ADMISSION = 64
const ZOMBIE_ESCAPE_WAVE_SPAWN_GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5))
export const ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_GRACE_SECONDS = 1.5
export const ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_STAGGER_SECONDS = 0.12
const ZOMBIE_ESCAPE_MUZZLE_VALIDATION_MAXIMUM_DISTANCE_METERS = 2.25
const ZOMBIE_ESCAPE_MAXIMUM_ENEMY_HITS_PER_SHOT = ZOMBIE_ESCAPE_WEAPON_PROFILES.reduce(
  (maximum, profile) => Math.max(maximum, profile.maximumEnemyHits),
  0,
)
const ZOMBIE_ESCAPE_COLLISION_RECOVERY_REARM_RADIUS_MULTIPLIER = 0.5
const ZOMBIE_ESCAPE_LIVE_GOAL_LAYER_TOLERANCE_METERS = 0.12
const ZOMBIE_ESCAPE_LIVE_GOAL_PROJECTION_MAXIMUM_DISTANCE_METERS = 3
const ZOMBIE_ESCAPE_LIVE_GOAL_PROJECTION_MAXIMUM_LAYER_DISTANCE_METERS = ZOMBIE_ESCAPE_PLAYER_HEIGHT
const ZOMBIE_ESCAPE_LIVE_GOAL_VELOCITY_RESPONSE_PER_SECOND = 20
const ZOMBIE_ESCAPE_ROUTE_VELOCITY_RESPONSE_PER_SECOND = 7
const ZOMBIE_ESCAPE_PLAYER_TRAIL_MAXIMUM_CONTINUITY_DISTANCE_METERS = 4
const ZOMBIE_ESCAPE_PLAYER_TRAIL_MAXIMUM_ADVANCES_PER_TICK = 8
const ZOMBIE_ESCAPE_PLAYER_TRAIL_REVALIDATION_INTERVAL_TICKS = 15
const ZOMBIE_ESCAPE_PLAYER_TRAIL_SOURCE_TOLERANCE_METERS = 0.001
const ZOMBIE_ESCAPE_PLAYER_TRAIL_UNAVAILABLE_RETRY_DISTANCE_METERS = 0.5
const ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID = 0
const ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_CLEAR = 1
const ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE = 2
const ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_TERMINAL_CONSUMED = 3
const ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_COLLISION_RETIRED = 4
const ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE = 0
const ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_BACKWARD = 1
const ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_FORWARD = 2
const ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE = 0
const ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING = 1
const ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_READY = 2
const ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_IDLE = 0
const ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_SCANNING = 1
const ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_UNAVAILABLE = 2
const ZOMBIE_ESCAPE_OBSTACLE_COLLISION_MINIMUM_OPPOSITION = 0.1
const ZOMBIE_ESCAPE_ROUTE_TARGET_MAXIMUM_DRIFT_METERS =
  ZOMBIE_ESCAPE_SIMULATION.runSpeed *
  ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds *
  ZOMBIE_ESCAPE_SIMULATION.navigationRouteTargetMaximumPublicationLatencyTicks
const ZOMBIE_ESCAPE_NAVIGATION_NO_PROGRESS_TIMEOUT_TICKS = Math.max(
  1,
  Math.round(0.65 / ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds),
)
const ZOMBIE_ESCAPE_SPARSE_LOCAL_REATTACHMENT_RADIUS_METERS = 8
const ZOMBIE_ESCAPE_NAVIGATION_RECOVERY_COOLDOWN_TICKS = Math.max(
  ZOMBIE_ESCAPE_NAVIGATION_NO_PROGRESS_TIMEOUT_TICKS,
  Math.round(1.5 / ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds),
)
const ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED = -2
const ZOMBIE_ESCAPE_MAXIMUM_ZOMBIE_CAPACITY = 32_767
export const ZOMBIE_ESCAPE_BOSS_KIND = {
  heavy: 0,
  brute: 1,
} as const
export type ZombieEscapeBossKind =
  (typeof ZOMBIE_ESCAPE_BOSS_KIND)[keyof typeof ZOMBIE_ESCAPE_BOSS_KIND]
const ZOMBIE_ESCAPE_BOSS_KIND_COUNT = 2
const ZOMBIE_ESCAPE_ZERO_SPARSE_SEARCH_BUDGET: ZombieEscapeSparseSearchBudget = {
  maximumCandidateVisits: 0,
  maximumCollisionPredicates: 0,
  maximumHeapOperations: 0,
  maximumHierarchyNodeVisits: 0,
  maximumSupportPredicates: 0,
}

type ZombieEscapeNavigationIntentDemandReason =
  | 'cachedAnchorLost'
  | 'collisionRecovery'
  | 'connectorChanged'
  | 'routePublished'
  | 'spawn'
  | 'worldChanged'

type ZombieEscapeSparseSearchRestartReason =
  | 'collisionRecovery'
  | 'routePublished'
  | 'targetPublicationPreemption'
  | 'worldChanged'

const ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON = {
  cachedAnchorLost: 1 << 0,
  collisionRecovery: 1 << 1,
  connectorChanged: 1 << 2,
  routePublished: 1 << 3,
  spawn: 1 << 4,
  worldChanged: 1 << 5,
} as const

type ZombieEscapeDeferredNavigationIntentReason = ZombieEscapeNavigationIntentDemandReason

type ZombieEscapeSparseServiceCategory = 'agent' | 'spawn' | 'target'

type ZombieEscapeSparseStepWork = Readonly<{
  lastStepCandidateVisits: number
  lastStepColliderCandidateVisits: number
  lastStepColliderHierarchyNodeVisits: number
  lastStepCollisionPredicates: number
  lastStepGraphEdgeVisits?: number
  lastStepHeapOperations: number
  lastStepHierarchyNodeVisits: number
  lastStepSupportHierarchyNodeVisits: number
  lastStepSupportHoleVisits: number
  lastStepSupportItemVisits: number
  lastStepSupportPredicates: number
  lastStepSupportRingEdgeVisits: number
  lastStepSupportRingHierarchyNodeVisits: number
}>

export type ZombieEscapePickupPrompt = Readonly<{
  affordable: boolean
  cost: number
  displayName: string
  weaponIndex: number
}>

export const ZOMBIE_ESCAPE_SHOT_PHASE = {
  inactive: 0,
  travel: 1,
  impact: 2,
} as const

export type ZombieEscapeShotPhase =
  (typeof ZOMBIE_ESCAPE_SHOT_PHASE)[keyof typeof ZOMBIE_ESCAPE_SHOT_PHASE]

export const ZOMBIE_ESCAPE_SHOT_IMPACT_KIND = {
  none: 0,
  environment: 1,
  enemy: 2,
  expired: 3,
} as const

export type ZombieEscapeShotImpactKind =
  (typeof ZOMBIE_ESCAPE_SHOT_IMPACT_KIND)[keyof typeof ZOMBIE_ESCAPE_SHOT_IMPACT_KIND]

export const ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND = {
  projectile: 0,
  piercing: 1,
  chain: 2,
  blast: 3,
  blastVictim: 4,
} as const

export type ZombieEscapeWeaponImpactEffectKind =
  (typeof ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND)[keyof typeof ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND]

type ZombieEscapeWeaponProfile = (typeof ZOMBIE_ESCAPE_WEAPON_PROFILES)[number]

export const ZOMBIE_ESCAPE_ZOMBIE_INTENT = {
  attackObstacle: 2,
  attackPlayer: 1,
  blocked: 3,
  chase: 0,
} as const

export type ZombieEscapeZombieIntent =
  (typeof ZOMBIE_ESCAPE_ZOMBIE_INTENT)[keyof typeof ZOMBIE_ESCAPE_ZOMBIE_INTENT]

export type ZombieEscapeCommittedNavigationAction =
  | 'attack-obstacle'
  | 'attack-player'
  | 'connector'
  | 'direct'
  | 'none'
  | 'route'

export type ZombieEscapeMuzzlePose = Readonly<{
  directionX: number
  directionY: number
  directionZ: number
  x: number
  y: number
  z: number
}>

export type ZombieEscapePlayerState = {
  ammo: number
  aimAngle: number
  health: number
  hitSlowSeconds: number
  hurtFlash: number
  locomotionBlend: number
  locomotionPhase: number
  meleeHitResolved: boolean
  meleePhase: ZombieEscapeMeleePhase
  meleePhaseSeconds: number
  meleeSequence: number
  meleeTargetGeneration: number
  meleeTargetSlot: number
  movementHeading: number
  muzzleDirectionX: number
  muzzleDirectionY: number
  muzzleDirectionZ: number
  muzzlePoseExternal: boolean
  muzzleX: number
  muzzleY: number
  muzzleZ: number
  runBlend: number
  weaponAmmoByIndex: Uint32Array
  weaponIndex: number
  weaponInventoryMask: number
  vx: number
  vz: number
  x: number
  y: number
  z: number
}

export type ZombieEscapeShotEventPool = {
  damage: Float32Array
  directionX: Float32Array
  directionY: Float32Array
  directionZ: Float32Array
  hitTargetGeneration: Uint32Array
  hitTargetSlot: Int16Array
  hitColliderIndex: Int32Array
  hitLocalNormalX: Float32Array
  hitLocalNormalY: Float32Array
  hitLocalNormalZ: Float32Array
  hitLocalX: Float32Array
  hitLocalY: Float32Array
  hitLocalZ: Float32Array
  hitNormalX: Float32Array
  hitNormalY: Float32Array
  hitNormalZ: Float32Array
  hitWorldGeneration: Uint32Array
  hitX: Float32Array
  hitY: Float32Array
  hitZ: Float32Array
  impactAge: Float32Array
  impactKind: Uint8Array
  lastPiercedTargetGeneration: Uint32Array
  lastPiercedTargetSlot: Int16Array
  originX: Float32Array
  originY: Float32Array
  originZ: Float32Array
  phase: Uint8Array
  pool: ZombieEscapeFixedPool
  primary: Uint8Array
  previousX: Float32Array
  previousY: Float32Array
  previousZ: Float32Array
  remainingEnemyPenetrations: Uint8Array
  travelAge: Float32Array
  volleyOrdinal: Uint8Array
  volleySequence: Uint32Array
  volleySize: Uint8Array
  weaponIndex: Uint8Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}

export type ZombieEscapeWeaponImpactEventPool = {
  age: Float32Array
  damage: Float32Array
  effectKind: Uint8Array
  hitLocalNormalX: Float32Array
  hitLocalNormalY: Float32Array
  hitLocalNormalZ: Float32Array
  hitLocalX: Float32Array
  hitLocalY: Float32Array
  hitLocalZ: Float32Array
  hitWorldGeneration: Uint32Array
  impactKind: Uint8Array
  normalX: Float32Array
  normalY: Float32Array
  normalZ: Float32Array
  pool: ZombieEscapeFixedPool
  sourceX: Float32Array
  sourceY: Float32Array
  sourceZ: Float32Array
  targetGeneration: Uint32Array
  targetSlot: Int16Array
  weaponIndex: Uint8Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}

type ZombieEscapeShotPhaseMetricView = {
  pool: {
    readonly activeCount: number
  }
}

type ZombieEscapeVerticalRange = {
  maximumY: number
  minimumY: number
}

type ZombieEscapeMutableSparseSearchBudget = {
  maximumCandidateVisits: number
  maximumCollisionPredicates: number
  maximumGraphEdgeVisits: number
  maximumHeapOperations: number
  maximumHierarchyNodeVisits: number
  maximumSupportPredicates: number
}

type ZombieEscapeSparseWorkMetrics = {
  candidateVisitsMaximumObservedPerTick: number
  candidateVisitsThisTick: number
  candidateVisitsTotal: number
  collisionPredicatesMaximumObservedPerTick: number
  collisionPredicatesThisTick: number
  collisionPredicatesTotal: number
  heapOperationsMaximumObservedPerTick: number
  heapOperationsThisTick: number
  heapOperationsTotal: number
  hierarchyNodeVisitsMaximumObservedPerTick: number
  hierarchyNodeVisitsThisTick: number
  hierarchyNodeVisitsTotal: number
  supportPredicatesMaximumObservedPerTick: number
  supportPredicatesThisTick: number
  supportPredicatesTotal: number
}

type ZombieEscapeSparseAttachmentWorkMetrics = ZombieEscapeSparseWorkMetrics & {
  attachmentHierarchyNodeVisitsMaximumObservedPerTick: number
  attachmentHierarchyNodeVisitsThisTick: number
  attachmentHierarchyNodeVisitsTotal: number
}

type ZombieEscapeSparseTargetWorkMetrics = ZombieEscapeSparseWorkMetrics & {
  graphEdgeVisitsMaximumObservedPerTick: number
  graphEdgeVisitsThisTick: number
  graphEdgeVisitsTotal: number
}

type ZombieEscapeNavigationVisibilityWorkMetrics = {
  colliderCandidateVisitsMaximumObservedPerTick: number
  colliderCandidateVisitsThisTick: number
  colliderCandidateVisitsTotal: number
  colliderHierarchyNodeVisitsMaximumObservedPerTick: number
  colliderHierarchyNodeVisitsThisTick: number
  colliderHierarchyNodeVisitsTotal: number
  supportHierarchyNodeVisitsMaximumObservedPerTick: number
  supportHierarchyNodeVisitsThisTick: number
  supportHierarchyNodeVisitsTotal: number
  supportHoleVisitsMaximumObservedPerTick: number
  supportHoleVisitsThisTick: number
  supportHoleVisitsTotal: number
  supportItemVisitsMaximumObservedPerTick: number
  supportItemVisitsThisTick: number
  supportItemVisitsTotal: number
  supportRingEdgeVisitsMaximumObservedPerTick: number
  supportRingEdgeVisitsThisTick: number
  supportRingEdgeVisitsTotal: number
  supportRingHierarchyNodeVisitsMaximumObservedPerTick: number
  supportRingHierarchyNodeVisitsThisTick: number
  supportRingHierarchyNodeVisitsTotal: number
}

type ZombieEscapeObstacleDeltaCounter = {
  maximumObservedPerTick: number
  thisTick: number
  total: number
}

export type ZombieEscapeObstacleDeltaMetrics = {
  allocationCount: ZombieEscapeObstacleDeltaCounter
  appliedCount: number
  appliedRevision: number
  connectorMaskWrites: ZombieEscapeObstacleDeltaCounter
  fullArrayClearCount: ZombieEscapeObstacleDeltaCounter
  objectLookupComparisons: ZombieEscapeObstacleDeltaCounter
  objectMaskWrites: ZombieEscapeObstacleDeltaCounter
  requestCount: number
  requestedRevision: number
  requiresRecompileCount: number
  revisionAdvanceCount: number
  unchangedCount: number
  viewRevisionAdvanceCount: number
  worldCompileCount: ZombieEscapeObstacleDeltaCounter
}

export type ZombieEscapeObstacleDeltaRequestResult = {
  applied: boolean
  appliedRevision: number
  objectId: string | null
  requestedRevision: number
}

export type ZombieEscapeNavigationRefreshInspectionState = {
  cursor: number
  inspections: number
  obstacleRemaining: number
  slot: number
  targetsRemovedObstacle: boolean
  worldRemaining: number
}

export type ZombieEscapeZombiePool = {
  attackCooldown: Float32Array
  attackContactResolved: Uint8Array
  attackFocusX: Float32Array
  attackFocusZ: Float32Array
  attackObstacleRenewalEvidence: Uint8Array
  attackTargetObjectId: Array<string | null>
  attackTargetObjectOrdinal: Int32Array
  deathPresentationSeconds: Float32Array
  health: Float32Array
  gait: Uint8Array
  heading: Float32Array
  hitFlash: Float32Array
  hitImpulseX: Float32Array
  hitImpulseY: Float32Array
  hitImpulseZ: Float32Array
  hitReaction: Float32Array
  intent: Uint8Array
  locomotionBlend: Float32Array
  locomotionPhase: Float32Array
  navigationBlockerBreakable: Uint8Array
  navigationBlockerObjectId: Array<string | null>
  navigationBlockerObjectOrdinal: Int32Array
  navigationBlockingDistance: Float64Array
  navigationBlockingX: Float64Array
  navigationBlockingZ: Float64Array
  navigationConnector: Int16Array
  navigationConnectorTargetEnd: Uint8Array
  navigationDirectionX: Float64Array
  navigationDirectionZ: Float64Array
  navigationLiveGoalClearTicks: Uint8Array
  navigationCollisionRecoveryOriginX: Float64Array
  navigationCollisionRecoveryOriginZ: Float64Array
  navigationIntentAdmissionDeferredNext: Int32Array
  navigationIntentAdmissionDeferredPrevious: Int32Array
  navigationIntentAdmissionDeferredReasons: Uint8Array
  navigationIntentHasCached: Uint8Array
  navigationIntentHasReceivedFirstService: Uint8Array
  navigationIntentAdmissionWorldGeneration: Uint32Array
  navigationIntentFirstServiceEligibleSinceTick: Uint32Array
  navigationIntentFirstServiceTick: Uint32Array
  navigationIntentPending: Uint8Array
  navigationIntentPendingSinceTick: Uint32Array
  navigationIntentPoolGeneration: Uint32Array
  navigationIntentResolvedTick: Uint32Array
  navigationIntentCommittedRouteGeneration: Uint32Array
  navigationIntentCurrentTargetFallback: Uint8Array
  navigationIntentTargetRevision: Uint32Array
  navigationIntentUrgentRefreshUsed: Uint8Array
  navigationIntentValid: Uint8Array
  navigationIntentWorldGeneration: Uint32Array
  navigationNoProgressTicks: Uint16Array
  navigationProgressTargetNode: Int32Array
  navigationRecoveryCooldownTicks: Uint16Array
  navigationReachable: Uint8Array
  navigationRequestedConnector: Int16Array
  navigationRequestedConnectorTargetEnd: Uint8Array
  navigationSparseCommittedFlowSearch: ZombieEscapeSparseFlowSearch[]
  navigationSparseFlowHit: ZombieEscapeCollisionHit[]
  navigationSparseFlowSample: ZombieEscapeFlowSample[]
  navigationSparseFlowSearch: ZombieEscapeSparseFlowSearch[]
  navigationSparseFlowSearchActive: Uint8Array
  navigationSparseFlowSearchDependencyWaiting: Uint8Array
  navigationSparseFlowSearchLastProgressTick: Uint32Array
  navigationSparseFlowSearchRestartToken: Uint8Array
  navigationSparseFlowSearchStartedForDemand: Uint8Array
  navigationSparseFlowSearchTargetPreemptionUsed: Uint8Array
  navigationSparseFlowSearchWorldRevision: Uint32Array
  navigationSourceCertifiedX: Float32Array
  navigationSourceCertifiedY: Float32Array
  navigationSourceCertifiedZ: Float32Array
  navigationSourceNeedsValidation: Uint8Array
  navigationWaypointFallback: Uint8Array
  navigationWaypointNode: Int32Array
  pool: ZombieEscapeFixedPool
  projectileHitOrdinal: Uint32Array
  pursuitTrailAcquisitionBestDistanceSquared: Float64Array
  pursuitTrailAcquisitionBestSequence: Uint32Array
  pursuitTrailAcquisitionEndSequence: Uint32Array
  pursuitTrailAcquisitionGeneration: Uint32Array
  pursuitTrailAcquisitionLayerIndex: Int16Array
  pursuitTrailAcquisitionNextSequence: Uint32Array
  pursuitTrailAcquisitionScannedNewestSequence: Uint32Array
  pursuitTrailAcquisitionSourceX: Float64Array
  pursuitTrailAcquisitionSourceY: Float64Array
  pursuitTrailAcquisitionSourceZ: Float64Array
  pursuitTrailAcquisitionStatus: Uint8Array
  pursuitTrailAcquisitionWorldRevision: Uint32Array
  pursuitTrailBlockerObjectId: Array<string | null>
  pursuitTrailBlockerObjectOrdinal: Int32Array
  pursuitTrailBlockingX: Float64Array
  pursuitTrailBlockingZ: Float64Array
  pursuitTrailConnectorSequence: Uint32Array
  pursuitTrailGeneration: Uint32Array
  pursuitTrailReachableStartEndSequence: Uint32Array
  pursuitTrailReachableStartOriginSequence: Uint32Array
  pursuitTrailSeekingReachableStart: Uint8Array
  pursuitTrailSequence: Uint32Array
  pursuitTrailValidatedSequence: Uint32Array
  pursuitTrailValidatedSourceX: Float32Array
  pursuitTrailValidatedSourceZ: Float32Array
  pursuitTrailValidatedStatus: Uint8Array
  pursuitTrailValidatedWorldRevision: Uint32Array
  runBlend: Float32Array
  spawnOrdinal: Uint32Array
  speedScale: Float32Array
  variant: Uint8Array
  vx: Float32Array
  vz: Float32Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}

export type ZombieEscapeSimulation = {
  agentSeparationScratch: ZombieEscapeAgentSeparation
  agentSpatialIndex: ZombieEscapeAgentSpatialIndex
  ambientHandoff: ZombieEscapeAmbientHandoffState
  audioEvents: ZombieEscapeAudioEventRing
  bossDefeated: Uint8Array
  bossOwnerGeneration: Uint32Array
  bossOwnerSlot: Int16Array
  bossSpawnPending: Uint8Array
  bossSpawned: Uint8Array
  bossVariant: Uint8Array
  cameraBookmark: ZombieEscapeCameraBookmark
  collisionHitScratch: ZombieEscapeCollisionHit
  collisionMoveScratch: ZombieEscapeCircleMoveResult
  collisionSourceWorld: ZombieEscapeCollisionWorld
  collisionWorld: ZombieEscapeCollisionWorld
  collisionWorldGeneration: number
  combatCollisionSourceWorld: ZombieEscapeCollisionWorld
  combatCollisionWorld: ZombieEscapeCollisionWorld
  combatVerticalRangeScratch: ZombieEscapeVerticalRange
  debugMode: ZombieEscapeDebugMode
  destroyedObstacleIds: Set<string>
  passableObstacleIds: Set<string>
  elapsedSeconds: number
  externalPlayerPose: boolean
  extractionOpen: boolean
  fireCooldownSeconds: number
  impacts: ZombieEscapeShotPhaseMetricView
  impactAttachmentScratch: ZombieEscapeImpactAttachment
  impactEvents: ZombieEscapeWeaponImpactEventPool
  currentNightKills: number
  kills: number
  lastShotGeneration: number
  lastShotSlot: number
  money: number
  multiplayer: ZombieEscapeMultiplayerOwnership | null
  nearbyPickupIndex: number
  navigationField: ZombieEscapeFlowField
  navigationGoalInitialized: boolean
  navigationGoalLayerIndex: number
  navigationGoalProjectionScratch: ZombieEscapeSparseNavigationTargetProjection
  navigationGoalRegionIndex: number
  navigationGoalResolvedTick: number
  navigationGoalX: number
  navigationGoalY: number
  navigationGoalZ: number
  navigationHitScratch: ZombieEscapeCollisionHit
  navigationMoveScratch: ZombieEscapeNavigationMoveResult
  navigationRouteTargetCellX: number
  navigationRouteTargetCellZ: number
  navigationRouteTargetInitialized: boolean
  navigationRouteTargetX: number
  navigationRouteTargetY: number
  navigationRouteTargetZ: number
  navigationRouteTargetRegionIndex: number
  navigationSampleScratch: ZombieEscapeFlowSample
  navigationTargetY: number
  navigationAnchorInvalidationCount: number
  navigationAnchoredAgentCount: number
  navigationIntentCanceledCount: number
  navigationIntentDemandCachedAnchorLostCount: number
  navigationIntentDemandCollisionRecoveryCount: number
  navigationIntentDemandConnectorChangedCount: number
  navigationIntentDemandRoutePublishedCount: number
  navigationIntentDemandSpawnCount: number
  navigationIntentDemandWorldChangedCount: number
  navigationIntentIssuedCount: number
  navigationIntentFirstServiceCount: number
  navigationIntentInlineRecoveryWithoutFirstServiceCount: number
  navigationIntentMaximumResolveCountObservedPerTick: number
  navigationIntentMaximumUnservicedAgeTicksObserved: number
  navigationIntentOldestPendingAgeTicks: number
  navigationIntentOldestUnservicedAgeTicks: number
  navigationIntentPendingCount: number
  navigationIntentResolvedCount: number
  navigationIntentResolveBudgetViolationCount: number
  navigationIntentResolveCount: number
  navigationIntentResolveCountThisTick: number
  navigationIntentResolveCursor: number
  navigationIntentResolveEligible: Uint8Array
  navigationIntentResolveScheduled: Uint8Array
  navigationIntentUnservicedPendingCount: number
  navigationLivingWithoutCommittedActionCount: number
  navigationRetainedPendingActionCount: number
  navigationStaleTargetCount: number
  navigationIntentAdmissionDeferredCanceledCount: number
  navigationIntentAdmissionDeferredMarkedCount: number
  navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick: number
  navigationIntentAdmissionDeferredPendingCount: number
  navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount: number
  navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount: number
  navigationIntentAdmissionDeferredPromotedConnectorChangedCount: number
  navigationIntentAdmissionDeferredPromotedCount: number
  navigationIntentAdmissionDeferredPromotedCountThisTick: number
  navigationIntentAdmissionDeferredPromotedSpawnCount: number
  navigationIntentAdmissionDeferredPromotedWorldChangedCount: number
  navigationIntentAdmissionDeferredQueueHead: number
  navigationIntentAdmissionDeferredQueueOperationCountThisTick: number
  navigationIntentAdmissionDeferredQueueOperationCountTotal: number
  navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick: number
  navigationIntentAdmissionDeferredQueueTail: number
  navigationObstacleRefreshDeferredCanceledCount: number
  navigationObstacleRefreshDiscoveryAppliedRevision: number
  navigationObstacleRefreshDiscoveryEpochRevision: number
  navigationObstacleRefreshDiscoveryRemainingSlotCount: number
  navigationObstacleRefreshDeferredMarkedCount: number
  navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick: number
  navigationObstacleRefreshDeferredPendingCount: number
  navigationObstacleRefreshDeferredPromotedCount: number
  navigationObstacleRefreshDeferredPromotedCountThisTick: number
  navigationRefreshAdmissionCountThisTick: number
  navigationRefreshAdmissionCountTotal: number
  navigationRefreshAdmissionCursor: number
  navigationRefreshAdmissionMaximumCountObservedPerTick: number
  navigationRefreshAdmissionPreferScanned: boolean
  navigationRefreshCandidateInspectionsThisTick: number
  navigationRefreshCandidateInspectionsTotal: number
  navigationRefreshCandidateInspectionsMaximumObservedPerTick: number
  navigationRefreshInspectionScratch: ZombieEscapeNavigationRefreshInspectionState
  navigationVisibilityWork: ZombieEscapeNavigationVisibilityWorkMetrics
  navigationSparseCachedFollowWork: ZombieEscapeSparseWorkMetrics
  navigationSparseCollisionReanchorAttemptCount: number
  navigationSparseCollisionReanchorCompletedCount: number
  navigationSparseCollisionReanchorFailedCount: number
  navigationSparseFlowSearchWork: ZombieEscapeSparseWorkMetrics
  navigationSparseSearchBudgetScratch: ZombieEscapeMutableSparseSearchBudget
  navigationSparseSearchBudgetViolationCount: number
  navigationSparseSearchActiveAgentCount: number
  navigationSparseSearchWorldStaleActiveCount: number
  navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick: number
  navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved: number
  navigationSparseSearchAgentOldestPendingNoProgressAgeTicks: number
  navigationSparseSearchAgentProgressSliceCountThisTick: number
  navigationSparseSearchAgentProgressSliceCountTotal: number
  navigationSparseSearchAgentDrainCursor: number
  navigationSparseSearchProtectedDrainCursor: number
  navigationSparseSearchProtectedOwnerPoolGeneration: number
  navigationSparseSearchProtectedOwnerSlot: number
  navigationSparseSearchAgentServiceSliceCountThisTick: number
  navigationSparseSearchAgentServiceSliceCountTotal: number
  navigationSparseSearchCandidateVisitsMaximumObservedPerTick: number
  navigationSparseSearchCandidateVisitsThisTick: number
  navigationSparseSearchCandidateVisitsTotal: number
  navigationSparseSearchCollisionPredicatesMaximumObservedPerTick: number
  navigationSparseSearchCollisionPredicatesThisTick: number
  navigationSparseSearchCollisionPredicatesTotal: number
  navigationSparseSearchCanceledCount: number
  navigationSparseSearchCompletedCount: number
  navigationSparseSearchCompletionProgressThisTick: number
  navigationSparseSearchCompletionProgressTotal: number
  navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick: number
  navigationSparseSearchGraphEdgeVisitsThisTick: number
  navigationSparseSearchGraphEdgeVisitsTotal: number
  navigationSparseSearchHeapOperationsMaximumObservedPerTick: number
  navigationSparseSearchHeapOperationsThisTick: number
  navigationSparseSearchHeapOperationsTotal: number
  navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick: number
  navigationSparseSearchHierarchyNodeVisitsThisTick: number
  navigationSparseSearchHierarchyNodeVisitsTotal: number
  navigationSparseSearchInvalidatedCount: number
  navigationSparseSearchMaximumNoProgressAgeTicksObserved: number
  navigationSparseSearchNoProgressAgeTicks: number
  navigationSparseSearchPendingAgentCount: number
  navigationSparseSearchRestartedCollisionRecoveryCount: number
  navigationSparseSearchRestartedCount: number
  navigationSparseSearchRestartedRoutePublishedCount: number
  navigationSparseSearchRestartedTargetPublicationPreemptionCount: number
  navigationSparseSearchRestartedWorldChangedCount: number
  navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved: number
  navigationSparseSearchSpawnNoProgressAgeTicks: number
  navigationSparseSearchSpawnProgressSliceCountThisTick: number
  navigationSparseSearchSpawnProgressSliceCountTotal: number
  navigationSparseSearchSpawnServiceSliceCountThisTick: number
  navigationSparseSearchSpawnServiceSliceCountTotal: number
  navigationSparseSearchServiceSliceCountThisTick: number
  navigationSparseSearchServiceSliceCountTotal: number
  navigationSparseSearchStartedCount: number
  navigationSparseSearchSupportPredicatesMaximumObservedPerTick: number
  navigationSparseSearchSupportPredicatesThisTick: number
  navigationSparseSearchSupportPredicatesTotal: number
  navigationSparseSearchTargetBuildsMaximumObservedPerTick: number
  navigationSparseSearchTargetBuildsThisTick: number
  navigationSparseSearchTargetBuildsTotal: number
  navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved: number
  navigationSparseSearchTargetNoProgressAgeTicks: number
  navigationSparseSearchTargetProgressSliceCountThisTick: number
  navigationSparseSearchTargetProgressSliceCountTotal: number
  navigationSparseSearchTargetServiceSliceCountThisTick: number
  navigationSparseSearchTargetServiceSliceCountTotal: number
  navigationSparseSearchUncausedStartViolationCount: number
  navigationSharedRouteCache: ZombieEscapeSharedRouteCache
  navigationSharedRoutePublishedCount: number
  navigationSharedRouteReusedCount: number
  navigationSparseSpawnDesiredX: number
  navigationSparseSpawnDesiredZ: number
  navigationSparseSpawnIsReplacement: boolean
  navigationSparseSpawnMinimumTargetDistanceMeters: number
  navigationSparseSpawnSearchActive: boolean
  navigationSparseSpawnSearchCompletedCount: number
  navigationSparseSpawnSearchDependencyWaiting: boolean
  navigationSparseSpawnSearchInvalidatedCount: number
  navigationSparseSpawnSearchNeedsRestart: boolean
  navigationSparseSpawnSearchStartedCount: number
  navigationSparseSpawnProbeCountTotal: number
  navigationSparseSpawnProbeMaximumObservedPerAdmission: number
  navigationSparseSpawnProbeOrdinal: number
  navigationSparseSpawnAnchorScratch: ReturnType<typeof createZombieEscapeSparseSpawnAnchor>
  navigationSparseSpawnRouteScratch: ReturnType<typeof createZombieEscapeSparseCommittedNodeRoute>
  navigationSparseSpawnWork: ZombieEscapeSparseAttachmentWorkMetrics
  navigationSparseTargetWork: ZombieEscapeSparseTargetWorkMetrics
  nextShotVolleySequence: number
  nextZombieSpawnOrdinal: number
  night: number
  priorNightKills: number
  obstacleDamageEnabled: boolean
  obstacleDeltaCombatResult: ZombieEscapeCollisionObjectDeltaResult
  obstacleDeltaMetrics: ZombieEscapeObstacleDeltaMetrics
  obstacleDeltaNavigationResult: ZombieEscapeCollisionObjectDeltaResult
  obstacleDeltaRequestResult: ZombieEscapeObstacleDeltaRequestResult
  obstacleHitFeedback: Map<string, number>
  obstacleHitCounts: Map<string, number>
  obstacleRevision: number
  paused: boolean
  phase: ZombieEscapeGamePhase
  phaseSecondsRemaining: number
  player: ZombieEscapePlayerState
  playerTrail: ZombieEscapePlayerTrail
  playerTrailAcquisitionCandidateBudgetRemaining: number
  playerTrailInputScratch: ZombieEscapePlayerTrailPointScratch
  playerTrailPreviousScratch: ZombieEscapePlayerTrailPoint
  playerTrailTargetScratch: ZombieEscapePlayerTrailPoint
  presentationPoseScratch: ZombieEscapePresentationPose
  projectileHitCandidateScratch: ZombieEscapeCollisionHit
  projectileLaunchHitTargetSlotsScratch: Int32Array
  projectiles: ZombieEscapeShotPhaseMetricView
  purchaseFeedback: ZombieEscapePurchaseFeedback
  random: ZombieEscapeRandomState
  reachableSpawnScratch: ReturnType<typeof createZombieEscapeReachableSpawn>
  replacementSpawnRemaining: number
  seed: number
  sparseNavigationRequired: boolean
  shots: ZombieEscapeShotEventPool
  shotsFired: number
  navigationIntentTick: number
  navigationTargetCommittedRouteGeneration: number
  navigationTargetRequestedLayerHint: number
  navigationTargetRequestedRevision: number
  navigationWorldRevision: number
  navigationWorldRefreshAdmissionGeneration: number
  navigationWorldRefreshEpochGeneration: number
  navigationWorldRefreshInspectionRemaining: number
  navigationWorldRefreshMaximumPromotedCountObservedPerTick: number
  navigationWorldRefreshMinimumAppliedGeneration: number
  navigationWorldRefreshPendingCount: number
  navigationWorldRefreshPromotedCountThisTick: number
  navigationWorldRefreshPromotedCountTotal: number
  navigationWorldRefreshRestartedCountThisTick: number
  navigationWorldRefreshRestartedCountTotal: number
  simulationTick: number
  status: ZombieEscapeGameStatus
  sourceNpcIdByPoolSlot: readonly (ZombieEscapeAmbientNpcSourceId | null)[]
  tracers: ZombieEscapeShotPhaseMetricView
  variantByPoolSlot: Uint8Array
  wave: number
  waveIntermissionSeconds: number
  waveSpawnRemaining: number
  waveSpawnTimerSeconds: number
  waveState: ZombieEscapeWaveState
  weaponPickupIndexByWeaponIndex: Int16Array
  weaponPickupRespawnAtSeconds: Float64Array
  weaponPickups: readonly ZombieEscapeWeaponPickupPlacement[]
  weaponPurchaseCount: number
  weaponDirectionScratch: ZombieEscapeWeaponDirection
  zombies: ZombieEscapeZombiePool
}

export const ZOMBIE_ESCAPE_NAVIGATION_TARGET_KEYS = [
  'navigationField',
  'navigationGoalInitialized',
  'navigationGoalLayerIndex',
  'navigationGoalProjectionScratch',
  'navigationGoalRegionIndex',
  'navigationGoalResolvedTick',
  'navigationGoalX',
  'navigationGoalY',
  'navigationGoalZ',
  'navigationRouteTargetCellX',
  'navigationRouteTargetCellZ',
  'navigationRouteTargetInitialized',
  'navigationRouteTargetX',
  'navigationRouteTargetY',
  'navigationRouteTargetZ',
  'navigationRouteTargetRegionIndex',
  'navigationTargetY',
  'navigationTargetCommittedRouteGeneration',
  'navigationTargetRequestedLayerHint',
  'navigationTargetRequestedRevision',
  'navigationSharedRouteCache',
  'playerTrail',
  'playerTrailInputScratch',
  'playerTrailPreviousScratch',
  'playerTrailTargetScratch',
] as const satisfies readonly (keyof ZombieEscapeSimulation)[]

export type ZombieEscapeNavigationTargetState = Pick<
  ZombieEscapeSimulation,
  (typeof ZOMBIE_ESCAPE_NAVIGATION_TARGET_KEYS)[number]
>

export function createZombieEscapeNavigationTargetState(
  world: ZombieEscapeCollisionWorld,
): ZombieEscapeNavigationTargetState {
  const navigationField = createZombieEscapeFlowField(world)
  return {
    navigationField,
    navigationGoalInitialized: false,
    navigationGoalLayerIndex: -1,
    navigationGoalProjectionScratch: {
      distanceSquared: Number.POSITIVE_INFINITY,
      regionIndex: -1,
      x: 0,
      z: 0,
    },
    navigationGoalRegionIndex: -1,
    navigationGoalResolvedTick: 0,
    navigationGoalX: 0,
    navigationGoalY: 0,
    navigationGoalZ: 0,
    navigationRouteTargetCellX: 0,
    navigationRouteTargetCellZ: 0,
    navigationRouteTargetInitialized: false,
    navigationRouteTargetX: 0,
    navigationRouteTargetY: 0,
    navigationRouteTargetZ: 0,
    navigationRouteTargetRegionIndex: -1,
    navigationTargetY: 0,
    navigationTargetCommittedRouteGeneration:
      getZombieEscapeSparseCommittedRouteGeneration(navigationField),
    navigationTargetRequestedLayerHint:
      navigationField.graphSparseTargetUpdate.requestedTargetLayerHint,
    navigationTargetRequestedRevision:
      getZombieEscapeSparseRequestedTargetRevision(navigationField),
    navigationSharedRouteCache: createZombieEscapeSharedRouteCacheForGraph(world.navigationGraph),
    playerTrail: createZombieEscapePlayerTrail(),
    playerTrailInputScratch: { layerIndex: -1, regionIndex: -1, tick: 0, x: 0, y: 0, z: 0 },
    playerTrailPreviousScratch: createZombieEscapePlayerTrailPoint(),
    playerTrailTargetScratch: createZombieEscapePlayerTrailPoint(),
  }
}

export function prepareZombieEscapeNavigationTarget(
  state: ZombieEscapeSimulation,
  serviceTarget = true,
) {
  const liveGoalRegionIndex = updateZombieEscapePersistentNavigationGoal(state)
  updateZombieEscapePlayerTrail(state)
  const previousGeneration = state.navigationTargetCommittedRouteGeneration
  if (state.collisionWorld.navigationMode === 'sparse') {
    if (!serviceTarget) return
    updateZombieEscapeSparseNavigationTarget(
      state,
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
      liveGoalRegionIndex,
    )
  } else if (
    updateZombieEscapeFlowTarget(
      state.navigationField,
      state.player.x,
      state.player.z,
      state.navigationTargetY,
    )
  ) {
    state.navigationTargetRequestedRevision += 1
    state.navigationTargetCommittedRouteGeneration += 1
  }
  if (
    state.collisionWorld.navigationMode === 'sparse' &&
    state.navigationTargetCommittedRouteGeneration !== previousGeneration
  ) {
    releaseZombieEscapePreemptedDemandsAfterTargetPublication(state)
    recoverZombieEscapeUnanchoredDemandsAfterTargetPublication(state)
  }
}

export function invalidateZombieEscapeTargetAssignment(
  state: ZombieEscapeSimulation,
  slot: number,
  resetAttackCycle = true,
) {
  cancelZombieEscapeNavigationIntentDemand(state, slot)
  clearZombieEscapeNavigationWaypoint(state, slot)
  resetZombieEscapeSparseFlowSearch(state.zombies.navigationSparseCommittedFlowSearch[slot]!)
  clearZombieEscapePlayerTrailPursuit(state.zombies, slot)
  state.zombies.navigationIntentHasCached[slot] = 0
  state.zombies.navigationIntentPoolGeneration[slot] = 0
  if (resetAttackCycle) {
    state.zombies.attackCooldown[slot] = 0
    state.zombies.attackContactResolved[slot] = 0
  }
  state.zombies.attackTargetObjectId[slot] = null
  state.zombies.attackTargetObjectOrdinal[slot] = -1
}

export function updateZombieEscapePlayerSimulation(
  state: ZombieEscapeSimulation,
  input: ZombieEscapeControlState,
  delta: number,
) {
  updatePlayer(state, input, delta)
}

export type ZombieEscapeHudSnapshot = {
  ammo: number
  cameraBookmark: ZombieEscapeCameraBookmark
  debugMode: ZombieEscapeDebugMode
  elapsedSeconds: number
  extractionOpen: boolean
  frameMs: number
  health: number
  kills: number
  money: number
  muzzleFlashes: number
  paused: boolean
  phase: ZombieEscapeGamePhase
  phaseSecondsRemaining: number
  pickupPrompt: ZombieEscapePickupPrompt | null
  purchaseFeedback: ZombieEscapePurchaseFeedback
  renderCalls: number
  shots: number
  shotsFired: number
  shotsImpacting: number
  shotsTraveling: number
  status: ZombieEscapeGameStatus
  triangles: number
  night: number
  wave: number
  waveRemaining: number
  waveState: ZombieEscapeWaveState
  weaponIndex: number
  weaponInventoryMask: number
  zombies: number
}

function createArenaCollisionWorld(arena: ZombieEscapeArenaData, requireSparseNavigation = false) {
  const circles: ZombieEscapeCollisionCircleSource[] = []
  for (let index = 0; index < arena.obstacleCount; index += 1) {
    circles.push({
      id: `arena-obstacle-${index}`,
      radius: arena.obstacleRadius[index] ?? 0,
      x: arena.obstacleX[index] ?? 0,
      z: arena.obstacleZ[index] ?? 0,
    })
  }
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    circles,
    navigationSupports: requireSparseNavigation
      ? [
          {
            boundary: true,
            elevation: 0,
            id: 'arena-sparse-navigation-boundary',
            polygon: Array.from({ length: 32 }, (_, index) => {
              const angle = (index / 32) * Math.PI * 2
              return {
                x: Math.cos(angle) * arena.playRadius,
                z: Math.sin(angle) * arena.playRadius,
              }
            }),
          },
        ]
      : [],
    playRadius: arena.playRadius,
  })
}

function createZombieEscapeNavigationSample(): ZombieEscapeFlowSample {
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

function createZombieEscapeSparseWorkMetrics(): ZombieEscapeSparseWorkMetrics {
  return {
    candidateVisitsMaximumObservedPerTick: 0,
    candidateVisitsThisTick: 0,
    candidateVisitsTotal: 0,
    collisionPredicatesMaximumObservedPerTick: 0,
    collisionPredicatesThisTick: 0,
    collisionPredicatesTotal: 0,
    heapOperationsMaximumObservedPerTick: 0,
    heapOperationsThisTick: 0,
    heapOperationsTotal: 0,
    hierarchyNodeVisitsMaximumObservedPerTick: 0,
    hierarchyNodeVisitsThisTick: 0,
    hierarchyNodeVisitsTotal: 0,
    supportPredicatesMaximumObservedPerTick: 0,
    supportPredicatesThisTick: 0,
    supportPredicatesTotal: 0,
  }
}

function createZombieEscapeSparseAttachmentWorkMetrics(): ZombieEscapeSparseAttachmentWorkMetrics {
  return {
    ...createZombieEscapeSparseWorkMetrics(),
    attachmentHierarchyNodeVisitsMaximumObservedPerTick: 0,
    attachmentHierarchyNodeVisitsThisTick: 0,
    attachmentHierarchyNodeVisitsTotal: 0,
  }
}

function createZombieEscapeSparseTargetWorkMetrics(): ZombieEscapeSparseTargetWorkMetrics {
  return {
    ...createZombieEscapeSparseWorkMetrics(),
    graphEdgeVisitsMaximumObservedPerTick: 0,
    graphEdgeVisitsThisTick: 0,
    graphEdgeVisitsTotal: 0,
  }
}

function createZombieEscapeNavigationVisibilityWorkMetrics(): ZombieEscapeNavigationVisibilityWorkMetrics {
  return {
    colliderCandidateVisitsMaximumObservedPerTick: 0,
    colliderCandidateVisitsThisTick: 0,
    colliderCandidateVisitsTotal: 0,
    colliderHierarchyNodeVisitsMaximumObservedPerTick: 0,
    colliderHierarchyNodeVisitsThisTick: 0,
    colliderHierarchyNodeVisitsTotal: 0,
    supportHierarchyNodeVisitsMaximumObservedPerTick: 0,
    supportHierarchyNodeVisitsThisTick: 0,
    supportHierarchyNodeVisitsTotal: 0,
    supportHoleVisitsMaximumObservedPerTick: 0,
    supportHoleVisitsThisTick: 0,
    supportHoleVisitsTotal: 0,
    supportItemVisitsMaximumObservedPerTick: 0,
    supportItemVisitsThisTick: 0,
    supportItemVisitsTotal: 0,
    supportRingEdgeVisitsMaximumObservedPerTick: 0,
    supportRingEdgeVisitsThisTick: 0,
    supportRingEdgeVisitsTotal: 0,
    supportRingHierarchyNodeVisitsMaximumObservedPerTick: 0,
    supportRingHierarchyNodeVisitsThisTick: 0,
    supportRingHierarchyNodeVisitsTotal: 0,
  }
}

function createZombieEscapeObstacleDeltaCounter(): ZombieEscapeObstacleDeltaCounter {
  return { maximumObservedPerTick: 0, thisTick: 0, total: 0 }
}

function createZombieEscapeObstacleDeltaMetrics(): ZombieEscapeObstacleDeltaMetrics {
  return {
    allocationCount: createZombieEscapeObstacleDeltaCounter(),
    appliedCount: 0,
    appliedRevision: 0,
    connectorMaskWrites: createZombieEscapeObstacleDeltaCounter(),
    fullArrayClearCount: createZombieEscapeObstacleDeltaCounter(),
    objectLookupComparisons: createZombieEscapeObstacleDeltaCounter(),
    objectMaskWrites: createZombieEscapeObstacleDeltaCounter(),
    requestCount: 0,
    requestedRevision: 0,
    requiresRecompileCount: 0,
    revisionAdvanceCount: 0,
    unchangedCount: 0,
    viewRevisionAdvanceCount: 0,
    worldCompileCount: createZombieEscapeObstacleDeltaCounter(),
  }
}

function resetZombieEscapeObstacleDeltaCounter(counter: ZombieEscapeObstacleDeltaCounter) {
  counter.maximumObservedPerTick = 0
  counter.thisTick = 0
  counter.total = 0
}

function resetZombieEscapeObstacleDeltaMetrics(metrics: ZombieEscapeObstacleDeltaMetrics) {
  resetZombieEscapeObstacleDeltaCounter(metrics.allocationCount)
  metrics.appliedCount = 0
  metrics.appliedRevision = 0
  resetZombieEscapeObstacleDeltaCounter(metrics.connectorMaskWrites)
  resetZombieEscapeObstacleDeltaCounter(metrics.fullArrayClearCount)
  resetZombieEscapeObstacleDeltaCounter(metrics.objectLookupComparisons)
  resetZombieEscapeObstacleDeltaCounter(metrics.objectMaskWrites)
  metrics.requestCount = 0
  metrics.requestedRevision = 0
  metrics.requiresRecompileCount = 0
  metrics.revisionAdvanceCount = 0
  metrics.unchangedCount = 0
  metrics.viewRevisionAdvanceCount = 0
  resetZombieEscapeObstacleDeltaCounter(metrics.worldCompileCount)
}

function resetZombieEscapeObstacleDeltaMetricsThisTick(metrics: ZombieEscapeObstacleDeltaMetrics) {
  metrics.allocationCount.thisTick = 0
  metrics.connectorMaskWrites.thisTick = 0
  metrics.fullArrayClearCount.thisTick = 0
  metrics.objectLookupComparisons.thisTick = 0
  metrics.objectMaskWrites.thisTick = 0
  metrics.worldCompileCount.thisTick = 0
}

function accumulateZombieEscapeObstacleDeltaCounter(
  counter: ZombieEscapeObstacleDeltaCounter,
  amount: number,
) {
  const normalizedAmount = Math.max(0, Math.trunc(amount))
  counter.thisTick += normalizedAmount
  counter.total += normalizedAmount
  counter.maximumObservedPerTick = Math.max(counter.maximumObservedPerTick, counter.thisTick)
}

function accumulateZombieEscapeCollisionObjectDeltaResult(
  metrics: ZombieEscapeObstacleDeltaMetrics,
  result: ZombieEscapeCollisionObjectDeltaResult,
) {
  accumulateZombieEscapeObstacleDeltaCounter(metrics.allocationCount, result.allocationCount)
  accumulateZombieEscapeObstacleDeltaCounter(
    metrics.fullArrayClearCount,
    result.fullArrayClearCount,
  )
  accumulateZombieEscapeObstacleDeltaCounter(
    metrics.objectLookupComparisons,
    result.objectLookupComparisons,
  )
  accumulateZombieEscapeObstacleDeltaCounter(metrics.objectMaskWrites, result.objectMaskWrites)
  accumulateZombieEscapeObstacleDeltaCounter(metrics.worldCompileCount, result.worldCompileCount)
  metrics.viewRevisionAdvanceCount += result.revisionAdvanceCount
}

function resetZombieEscapeSparseWorkMetrics(metrics: ZombieEscapeSparseWorkMetrics) {
  metrics.candidateVisitsMaximumObservedPerTick = 0
  metrics.candidateVisitsThisTick = 0
  metrics.candidateVisitsTotal = 0
  metrics.collisionPredicatesMaximumObservedPerTick = 0
  metrics.collisionPredicatesThisTick = 0
  metrics.collisionPredicatesTotal = 0
  metrics.heapOperationsMaximumObservedPerTick = 0
  metrics.heapOperationsThisTick = 0
  metrics.heapOperationsTotal = 0
  metrics.hierarchyNodeVisitsMaximumObservedPerTick = 0
  metrics.hierarchyNodeVisitsThisTick = 0
  metrics.hierarchyNodeVisitsTotal = 0
  metrics.supportPredicatesMaximumObservedPerTick = 0
  metrics.supportPredicatesThisTick = 0
  metrics.supportPredicatesTotal = 0
}

function resetZombieEscapeSparseAttachmentWorkMetrics(
  metrics: ZombieEscapeSparseAttachmentWorkMetrics,
) {
  resetZombieEscapeSparseWorkMetrics(metrics)
  metrics.attachmentHierarchyNodeVisitsMaximumObservedPerTick = 0
  metrics.attachmentHierarchyNodeVisitsThisTick = 0
  metrics.attachmentHierarchyNodeVisitsTotal = 0
}

function resetZombieEscapeSparseTargetWorkMetrics(metrics: ZombieEscapeSparseTargetWorkMetrics) {
  resetZombieEscapeSparseWorkMetrics(metrics)
  metrics.graphEdgeVisitsMaximumObservedPerTick = 0
  metrics.graphEdgeVisitsThisTick = 0
  metrics.graphEdgeVisitsTotal = 0
}

function resetZombieEscapeNavigationVisibilityWorkMetrics(
  metrics: ZombieEscapeNavigationVisibilityWorkMetrics,
) {
  metrics.colliderCandidateVisitsMaximumObservedPerTick = 0
  metrics.colliderCandidateVisitsThisTick = 0
  metrics.colliderCandidateVisitsTotal = 0
  metrics.colliderHierarchyNodeVisitsMaximumObservedPerTick = 0
  metrics.colliderHierarchyNodeVisitsThisTick = 0
  metrics.colliderHierarchyNodeVisitsTotal = 0
  metrics.supportHierarchyNodeVisitsMaximumObservedPerTick = 0
  metrics.supportHierarchyNodeVisitsThisTick = 0
  metrics.supportHierarchyNodeVisitsTotal = 0
  metrics.supportHoleVisitsMaximumObservedPerTick = 0
  metrics.supportHoleVisitsThisTick = 0
  metrics.supportHoleVisitsTotal = 0
  metrics.supportItemVisitsMaximumObservedPerTick = 0
  metrics.supportItemVisitsThisTick = 0
  metrics.supportItemVisitsTotal = 0
  metrics.supportRingEdgeVisitsMaximumObservedPerTick = 0
  metrics.supportRingEdgeVisitsThisTick = 0
  metrics.supportRingEdgeVisitsTotal = 0
  metrics.supportRingHierarchyNodeVisitsMaximumObservedPerTick = 0
  metrics.supportRingHierarchyNodeVisitsThisTick = 0
  metrics.supportRingHierarchyNodeVisitsTotal = 0
}

function resetZombieEscapeSparseWorkMetricsThisTick(metrics: ZombieEscapeSparseWorkMetrics) {
  metrics.candidateVisitsThisTick = 0
  metrics.collisionPredicatesThisTick = 0
  metrics.heapOperationsThisTick = 0
  metrics.hierarchyNodeVisitsThisTick = 0
  metrics.supportPredicatesThisTick = 0
}

function resetZombieEscapeSparseAttachmentWorkMetricsThisTick(
  metrics: ZombieEscapeSparseAttachmentWorkMetrics,
) {
  resetZombieEscapeSparseWorkMetricsThisTick(metrics)
  metrics.attachmentHierarchyNodeVisitsThisTick = 0
}

function resetZombieEscapeSparseTargetWorkMetricsThisTick(
  metrics: ZombieEscapeSparseTargetWorkMetrics,
) {
  resetZombieEscapeSparseWorkMetricsThisTick(metrics)
  metrics.graphEdgeVisitsThisTick = 0
}

function resetZombieEscapeNavigationVisibilityWorkMetricsThisTick(
  metrics: ZombieEscapeNavigationVisibilityWorkMetrics,
) {
  metrics.colliderCandidateVisitsThisTick = 0
  metrics.colliderHierarchyNodeVisitsThisTick = 0
  metrics.supportHierarchyNodeVisitsThisTick = 0
  metrics.supportHoleVisitsThisTick = 0
  metrics.supportItemVisitsThisTick = 0
  metrics.supportRingEdgeVisitsThisTick = 0
  metrics.supportRingHierarchyNodeVisitsThisTick = 0
}

function finalizeZombieEscapeSparseWorkMetrics(metrics: ZombieEscapeSparseWorkMetrics) {
  metrics.candidateVisitsMaximumObservedPerTick = Math.max(
    metrics.candidateVisitsMaximumObservedPerTick,
    metrics.candidateVisitsThisTick,
  )
  metrics.collisionPredicatesMaximumObservedPerTick = Math.max(
    metrics.collisionPredicatesMaximumObservedPerTick,
    metrics.collisionPredicatesThisTick,
  )
  metrics.heapOperationsMaximumObservedPerTick = Math.max(
    metrics.heapOperationsMaximumObservedPerTick,
    metrics.heapOperationsThisTick,
  )
  metrics.hierarchyNodeVisitsMaximumObservedPerTick = Math.max(
    metrics.hierarchyNodeVisitsMaximumObservedPerTick,
    metrics.hierarchyNodeVisitsThisTick,
  )
  metrics.supportPredicatesMaximumObservedPerTick = Math.max(
    metrics.supportPredicatesMaximumObservedPerTick,
    metrics.supportPredicatesThisTick,
  )
}

function finalizeZombieEscapeSparseAttachmentWorkMetrics(
  metrics: ZombieEscapeSparseAttachmentWorkMetrics,
) {
  finalizeZombieEscapeSparseWorkMetrics(metrics)
  metrics.attachmentHierarchyNodeVisitsMaximumObservedPerTick = Math.max(
    metrics.attachmentHierarchyNodeVisitsMaximumObservedPerTick,
    metrics.attachmentHierarchyNodeVisitsThisTick,
  )
}

function finalizeZombieEscapeSparseTargetWorkMetrics(metrics: ZombieEscapeSparseTargetWorkMetrics) {
  finalizeZombieEscapeSparseWorkMetrics(metrics)
  metrics.graphEdgeVisitsMaximumObservedPerTick = Math.max(
    metrics.graphEdgeVisitsMaximumObservedPerTick,
    metrics.graphEdgeVisitsThisTick,
  )
}

function finalizeZombieEscapeNavigationVisibilityWorkMetrics(
  metrics: ZombieEscapeNavigationVisibilityWorkMetrics,
) {
  metrics.colliderCandidateVisitsMaximumObservedPerTick = Math.max(
    metrics.colliderCandidateVisitsMaximumObservedPerTick,
    metrics.colliderCandidateVisitsThisTick,
  )
  metrics.colliderHierarchyNodeVisitsMaximumObservedPerTick = Math.max(
    metrics.colliderHierarchyNodeVisitsMaximumObservedPerTick,
    metrics.colliderHierarchyNodeVisitsThisTick,
  )
  metrics.supportHierarchyNodeVisitsMaximumObservedPerTick = Math.max(
    metrics.supportHierarchyNodeVisitsMaximumObservedPerTick,
    metrics.supportHierarchyNodeVisitsThisTick,
  )
  metrics.supportHoleVisitsMaximumObservedPerTick = Math.max(
    metrics.supportHoleVisitsMaximumObservedPerTick,
    metrics.supportHoleVisitsThisTick,
  )
  metrics.supportItemVisitsMaximumObservedPerTick = Math.max(
    metrics.supportItemVisitsMaximumObservedPerTick,
    metrics.supportItemVisitsThisTick,
  )
  metrics.supportRingEdgeVisitsMaximumObservedPerTick = Math.max(
    metrics.supportRingEdgeVisitsMaximumObservedPerTick,
    metrics.supportRingEdgeVisitsThisTick,
  )
  metrics.supportRingHierarchyNodeVisitsMaximumObservedPerTick = Math.max(
    metrics.supportRingHierarchyNodeVisitsMaximumObservedPerTick,
    metrics.supportRingHierarchyNodeVisitsThisTick,
  )
}

export function createZombieEscapeSimulation(
  arena: ZombieEscapeArenaData,
  seed = ZOMBIE_ESCAPE_SEED,
  weaponPickups: readonly ZombieEscapeWeaponPickupPlacement[] = createZombieEscapeFallbackWeaponPickupPlacements(),
  options: ZombieEscapeSimulationOptions = {},
): ZombieEscapeSimulation {
  const zombieCapacity = resolveZombieEscapeSimulationZombieCapacity(options.zombieCapacity)
  const zombieRoster = createZombieEscapeZombieRoster(seed, zombieCapacity)
  const shots = createShotEventPool(ZOMBIE_ESCAPE_CAPACITY.shots)
  const impactEvents = createWeaponImpactEventPool(ZOMBIE_ESCAPE_CAPACITY.impactEvents)
  const sanitizedWeaponPickups = sanitizeZombieEscapeWeaponPickupPlacements(weaponPickups)
  const weaponPickupIndexByWeaponIndex = createZombieEscapeWeaponPickupIndex(sanitizedWeaponPickups)
  const weaponPickupRespawnAtSeconds = createZombieEscapeWeaponPickupRespawnDeadlines()
  const collisionSourceWorld = createArenaCollisionWorld(
    arena,
    options.requireSparseNavigation === true,
  )
  const collisionWorld = createZombieEscapeCollisionWorldActiveView(collisionSourceWorld)
  const combatCollisionWorld = createZombieEscapeCollisionWorldActiveView(collisionSourceWorld)
  const navigationField = createZombieEscapeFlowField(collisionWorld)
  return {
    agentSeparationScratch: createZombieEscapeAgentSeparation(),
    agentSpatialIndex: createZombieEscapeAgentSpatialIndex(zombieCapacity, {
      cellSizeMeters: ZOMBIE_ESCAPE_SIMULATION.zombieSeparationRadiusMeters,
      maximumCandidateInspectionsPerQuery:
        ZOMBIE_ESCAPE_SIMULATION.zombieSpatialMaximumCandidateInspectionsPerQuery,
      separationRadiusMeters: ZOMBIE_ESCAPE_SIMULATION.zombieSeparationRadiusMeters,
      separationStrength: ZOMBIE_ESCAPE_SIMULATION.zombieSeparationStrength,
      verticalToleranceMeters: ZOMBIE_ESCAPE_SIMULATION.zombieSeparationVerticalToleranceMeters,
    }),
    ambientHandoff: createZombieEscapeAmbientHandoffState(zombieCapacity),
    audioEvents: createZombieEscapeAudioEventRing(),
    bossDefeated: new Uint8Array(ZOMBIE_ESCAPE_BOSS_KIND_COUNT),
    bossOwnerGeneration: new Uint32Array(ZOMBIE_ESCAPE_BOSS_KIND_COUNT),
    bossOwnerSlot: new Int16Array(ZOMBIE_ESCAPE_BOSS_KIND_COUNT).fill(-1),
    bossSpawnPending: new Uint8Array(ZOMBIE_ESCAPE_BOSS_KIND_COUNT),
    bossSpawned: new Uint8Array(ZOMBIE_ESCAPE_BOSS_KIND_COUNT),
    bossVariant: Uint8Array.of(
      ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
      ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
    ),
    cameraBookmark: 'design',
    collisionHitScratch: createZombieEscapeCollisionHit(),
    collisionMoveScratch: createZombieEscapeCircleMoveResult(),
    collisionSourceWorld,
    collisionWorld,
    collisionWorldGeneration: 1,
    combatCollisionSourceWorld: collisionSourceWorld,
    combatCollisionWorld,
    combatVerticalRangeScratch: { maximumY: 0, minimumY: 0 },
    debugMode: 'final',
    destroyedObstacleIds: new Set(),
    passableObstacleIds: new Set(),
    elapsedSeconds: 0,
    externalPlayerPose: false,
    extractionOpen: false,
    fireCooldownSeconds: 0,
    impacts: createShotPhaseMetricView(shots, ZOMBIE_ESCAPE_SHOT_PHASE.impact),
    impactAttachmentScratch: createZombieEscapeImpactAttachment(),
    impactEvents,
    currentNightKills: 0,
    kills: 0,
    lastShotGeneration: 0,
    lastShotSlot: -1,
    money: 0,
    multiplayer: null,
    nearbyPickupIndex: -1,
    navigationField,
    navigationGoalInitialized: false,
    navigationGoalLayerIndex: -1,
    navigationGoalProjectionScratch: {
      distanceSquared: Number.POSITIVE_INFINITY,
      regionIndex: -1,
      x: 0,
      z: 0,
    },
    navigationGoalRegionIndex: -1,
    navigationGoalResolvedTick: 0,
    navigationGoalX: 0,
    navigationGoalY: 0,
    navigationGoalZ: 0,
    navigationHitScratch: createZombieEscapeCollisionHit(),
    navigationMoveScratch: createZombieEscapeNavigationMoveResult(),
    navigationRouteTargetCellX: 0,
    navigationRouteTargetCellZ: 0,
    navigationRouteTargetInitialized: false,
    navigationRouteTargetX: 0,
    navigationRouteTargetY: 0,
    navigationRouteTargetZ: 0,
    navigationRouteTargetRegionIndex: -1,
    navigationSampleScratch: createZombieEscapeNavigationSample(),
    navigationTargetY: 0,
    navigationAnchorInvalidationCount: 0,
    navigationAnchoredAgentCount: 0,
    navigationIntentCanceledCount: 0,
    navigationIntentDemandCachedAnchorLostCount: 0,
    navigationIntentDemandCollisionRecoveryCount: 0,
    navigationIntentDemandConnectorChangedCount: 0,
    navigationIntentDemandRoutePublishedCount: 0,
    navigationIntentDemandSpawnCount: 0,
    navigationIntentDemandWorldChangedCount: 0,
    navigationIntentIssuedCount: 0,
    navigationIntentFirstServiceCount: 0,
    navigationIntentInlineRecoveryWithoutFirstServiceCount: 0,
    navigationIntentMaximumResolveCountObservedPerTick: 0,
    navigationIntentMaximumUnservicedAgeTicksObserved: 0,
    navigationIntentOldestPendingAgeTicks: 0,
    navigationIntentOldestUnservicedAgeTicks: 0,
    navigationIntentPendingCount: 0,
    navigationIntentResolvedCount: 0,
    navigationIntentResolveBudgetViolationCount: 0,
    navigationIntentResolveCount: 0,
    navigationIntentResolveCountThisTick: 0,
    navigationIntentResolveCursor: 0,
    navigationIntentResolveEligible: new Uint8Array(zombieCapacity),
    navigationIntentResolveScheduled: new Uint8Array(zombieCapacity),
    navigationIntentUnservicedPendingCount: 0,
    navigationLivingWithoutCommittedActionCount: 0,
    navigationRetainedPendingActionCount: 0,
    navigationStaleTargetCount: 0,
    navigationIntentAdmissionDeferredCanceledCount: 0,
    navigationIntentAdmissionDeferredMarkedCount: 0,
    navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick: 0,
    navigationIntentAdmissionDeferredPendingCount: 0,
    navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount: 0,
    navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount: 0,
    navigationIntentAdmissionDeferredPromotedConnectorChangedCount: 0,
    navigationIntentAdmissionDeferredPromotedCount: 0,
    navigationIntentAdmissionDeferredPromotedCountThisTick: 0,
    navigationIntentAdmissionDeferredPromotedSpawnCount: 0,
    navigationIntentAdmissionDeferredPromotedWorldChangedCount: 0,
    navigationIntentAdmissionDeferredQueueHead: -1,
    navigationIntentAdmissionDeferredQueueOperationCountThisTick: 0,
    navigationIntentAdmissionDeferredQueueOperationCountTotal: 0,
    navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick: 0,
    navigationIntentAdmissionDeferredQueueTail: -1,
    navigationObstacleRefreshDeferredCanceledCount: 0,
    navigationObstacleRefreshDiscoveryAppliedRevision: 0,
    navigationObstacleRefreshDiscoveryEpochRevision: 0,
    navigationObstacleRefreshDiscoveryRemainingSlotCount: 0,
    navigationObstacleRefreshDeferredMarkedCount: 0,
    navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick: 0,
    navigationObstacleRefreshDeferredPendingCount: 0,
    navigationObstacleRefreshDeferredPromotedCount: 0,
    navigationObstacleRefreshDeferredPromotedCountThisTick: 0,
    navigationRefreshAdmissionCountThisTick: 0,
    navigationRefreshAdmissionCountTotal: 0,
    navigationRefreshAdmissionCursor: 0,
    navigationRefreshAdmissionMaximumCountObservedPerTick: 0,
    navigationRefreshAdmissionPreferScanned: true,
    navigationRefreshCandidateInspectionsThisTick: 0,
    navigationRefreshCandidateInspectionsTotal: 0,
    navigationRefreshCandidateInspectionsMaximumObservedPerTick: 0,
    navigationRefreshInspectionScratch: {
      cursor: 0,
      inspections: 0,
      obstacleRemaining: 0,
      slot: -1,
      targetsRemovedObstacle: false,
      worldRemaining: 0,
    },
    navigationVisibilityWork: createZombieEscapeNavigationVisibilityWorkMetrics(),
    navigationSparseCachedFollowWork: createZombieEscapeSparseWorkMetrics(),
    navigationSparseCollisionReanchorAttemptCount: 0,
    navigationSparseCollisionReanchorCompletedCount: 0,
    navigationSparseCollisionReanchorFailedCount: 0,
    navigationSparseFlowSearchWork: createZombieEscapeSparseWorkMetrics(),
    navigationSparseSearchBudgetScratch: {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumGraphEdgeVisits: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    },
    navigationSparseSearchBudgetViolationCount: 0,
    navigationSparseSearchActiveAgentCount: 0,
    navigationSparseSearchWorldStaleActiveCount: 0,
    navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick: 0,
    navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved: 0,
    navigationSparseSearchAgentOldestPendingNoProgressAgeTicks: 0,
    navigationSparseSearchAgentProgressSliceCountThisTick: 0,
    navigationSparseSearchAgentProgressSliceCountTotal: 0,
    navigationSparseSearchAgentDrainCursor: 0,
    navigationSparseSearchProtectedDrainCursor: 0,
    navigationSparseSearchProtectedOwnerPoolGeneration: 0,
    navigationSparseSearchProtectedOwnerSlot: -1,
    navigationSparseSearchAgentServiceSliceCountThisTick: 0,
    navigationSparseSearchAgentServiceSliceCountTotal: 0,
    navigationSparseSearchCandidateVisitsMaximumObservedPerTick: 0,
    navigationSparseSearchCandidateVisitsThisTick: 0,
    navigationSparseSearchCandidateVisitsTotal: 0,
    navigationSparseSearchCollisionPredicatesMaximumObservedPerTick: 0,
    navigationSparseSearchCollisionPredicatesThisTick: 0,
    navigationSparseSearchCollisionPredicatesTotal: 0,
    navigationSparseSearchCanceledCount: 0,
    navigationSparseSearchCompletedCount: 0,
    navigationSparseSearchCompletionProgressThisTick: 0,
    navigationSparseSearchCompletionProgressTotal: 0,
    navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick: 0,
    navigationSparseSearchGraphEdgeVisitsThisTick: 0,
    navigationSparseSearchGraphEdgeVisitsTotal: 0,
    navigationSparseSearchHeapOperationsMaximumObservedPerTick: 0,
    navigationSparseSearchHeapOperationsThisTick: 0,
    navigationSparseSearchHeapOperationsTotal: 0,
    navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick: 0,
    navigationSparseSearchHierarchyNodeVisitsThisTick: 0,
    navigationSparseSearchHierarchyNodeVisitsTotal: 0,
    navigationSparseSearchInvalidatedCount: 0,
    navigationSparseSearchMaximumNoProgressAgeTicksObserved: 0,
    navigationSparseSearchNoProgressAgeTicks: 0,
    navigationSparseSearchPendingAgentCount: 0,
    navigationSparseSearchRestartedCollisionRecoveryCount: 0,
    navigationSparseSearchRestartedCount: 0,
    navigationSparseSearchRestartedRoutePublishedCount: 0,
    navigationSparseSearchRestartedTargetPublicationPreemptionCount: 0,
    navigationSparseSearchRestartedWorldChangedCount: 0,
    navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved: 0,
    navigationSparseSearchSpawnNoProgressAgeTicks: 0,
    navigationSparseSearchSpawnProgressSliceCountThisTick: 0,
    navigationSparseSearchSpawnProgressSliceCountTotal: 0,
    navigationSparseSearchSpawnServiceSliceCountThisTick: 0,
    navigationSparseSearchSpawnServiceSliceCountTotal: 0,
    navigationSparseSearchServiceSliceCountThisTick: 0,
    navigationSparseSearchServiceSliceCountTotal: 0,
    navigationSparseSearchStartedCount: 0,
    navigationSparseSearchSupportPredicatesMaximumObservedPerTick: 0,
    navigationSparseSearchSupportPredicatesThisTick: 0,
    navigationSparseSearchSupportPredicatesTotal: 0,
    navigationSparseSearchTargetBuildsMaximumObservedPerTick: 0,
    navigationSparseSearchTargetBuildsThisTick: 0,
    navigationSparseSearchTargetBuildsTotal: 0,
    navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved: 0,
    navigationSparseSearchTargetNoProgressAgeTicks: 0,
    navigationSparseSearchTargetProgressSliceCountThisTick: 0,
    navigationSparseSearchTargetProgressSliceCountTotal: 0,
    navigationSparseSearchTargetServiceSliceCountThisTick: 0,
    navigationSparseSearchTargetServiceSliceCountTotal: 0,
    navigationSparseSearchUncausedStartViolationCount: 0,
    navigationSharedRouteCache: createZombieEscapeSharedRouteCacheForGraph(
      collisionWorld.navigationGraph,
    ),
    navigationSharedRoutePublishedCount: 0,
    navigationSharedRouteReusedCount: 0,
    navigationSparseSpawnDesiredX: 0,
    navigationSparseSpawnDesiredZ: 0,
    navigationSparseSpawnIsReplacement: false,
    navigationSparseSpawnMinimumTargetDistanceMeters: 0,
    navigationSparseSpawnSearchActive: false,
    navigationSparseSpawnSearchCompletedCount: 0,
    navigationSparseSpawnSearchDependencyWaiting: false,
    navigationSparseSpawnSearchInvalidatedCount: 0,
    navigationSparseSpawnSearchNeedsRestart: false,
    navigationSparseSpawnSearchStartedCount: 0,
    navigationSparseSpawnProbeCountTotal: 0,
    navigationSparseSpawnProbeMaximumObservedPerAdmission: 0,
    navigationSparseSpawnProbeOrdinal: 0,
    navigationSparseSpawnAnchorScratch: createZombieEscapeSparseSpawnAnchor(),
    navigationSparseSpawnRouteScratch: createZombieEscapeSparseCommittedNodeRoute(),
    navigationSparseSpawnWork: createZombieEscapeSparseAttachmentWorkMetrics(),
    navigationSparseTargetWork: createZombieEscapeSparseTargetWorkMetrics(),
    nextShotVolleySequence: 0,
    nextZombieSpawnOrdinal: 0,
    night: 0,
    priorNightKills: 0,
    obstacleDamageEnabled: true,
    obstacleDeltaCombatResult: createZombieEscapeCollisionObjectDeltaResult(),
    obstacleDeltaMetrics: createZombieEscapeObstacleDeltaMetrics(),
    obstacleDeltaNavigationResult: createZombieEscapeCollisionObjectDeltaResult(),
    obstacleDeltaRequestResult: {
      applied: false,
      appliedRevision: 0,
      objectId: null,
      requestedRevision: 0,
    },
    obstacleHitFeedback: new Map(),
    obstacleHitCounts: new Map(),
    obstacleRevision: 0,
    paused: false,
    phase: 'build',
    phaseSecondsRemaining: ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds,
    player: createZombieEscapePlayerState(arena),
    playerTrail: createZombieEscapePlayerTrail(),
    playerTrailAcquisitionCandidateBudgetRemaining: 0,
    playerTrailInputScratch: {
      layerIndex: -1,
      regionIndex: -1,
      tick: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    playerTrailPreviousScratch: createZombieEscapePlayerTrailPoint(),
    playerTrailTargetScratch: createZombieEscapePlayerTrailPoint(),
    presentationPoseScratch: createZombieEscapePresentationPose(),
    projectileHitCandidateScratch: createZombieEscapeCollisionHit(),
    projectileLaunchHitTargetSlotsScratch: new Int32Array(
      ZOMBIE_ESCAPE_MAXIMUM_ENEMY_HITS_PER_SHOT,
    ),
    projectiles: createShotPhaseMetricView(shots, ZOMBIE_ESCAPE_SHOT_PHASE.travel),
    purchaseFeedback: null,
    random: createZombieEscapeRandomState(seed),
    reachableSpawnScratch: createZombieEscapeReachableSpawn(),
    replacementSpawnRemaining: 0,
    seed,
    sparseNavigationRequired: options.requireSparseNavigation === true,
    shots,
    shotsFired: 0,
    navigationIntentTick: 0,
    navigationTargetCommittedRouteGeneration:
      getZombieEscapeSparseCommittedRouteGeneration(navigationField),
    navigationTargetRequestedLayerHint:
      navigationField.graphSparseTargetUpdate.requestedTargetLayerHint,
    navigationTargetRequestedRevision:
      getZombieEscapeSparseRequestedTargetRevision(navigationField),
    navigationWorldRevision: 0,
    navigationWorldRefreshAdmissionGeneration: 1,
    navigationWorldRefreshEpochGeneration: 1,
    navigationWorldRefreshInspectionRemaining: 0,
    navigationWorldRefreshMaximumPromotedCountObservedPerTick: 0,
    navigationWorldRefreshMinimumAppliedGeneration: 1,
    navigationWorldRefreshPendingCount: 0,
    navigationWorldRefreshPromotedCountThisTick: 0,
    navigationWorldRefreshPromotedCountTotal: 0,
    navigationWorldRefreshRestartedCountThisTick: 0,
    navigationWorldRefreshRestartedCountTotal: 0,
    simulationTick: 0,
    status: 'playing',
    sourceNpcIdByPoolSlot: zombieRoster.sourceNpcIdByPoolSlot,
    tracers: createShotPhaseMetricView(shots, ZOMBIE_ESCAPE_SHOT_PHASE.inactive),
    variantByPoolSlot: zombieRoster.variantByPoolSlot,
    wave: 1,
    waveIntermissionSeconds: 0,
    waveSpawnRemaining: 0,
    waveSpawnTimerSeconds: 0.35,
    waveState: 'intermission',
    weaponPickupIndexByWeaponIndex,
    weaponPickupRespawnAtSeconds,
    weaponPickups: sanitizedWeaponPickups,
    weaponPurchaseCount: 0,
    weaponDirectionScratch: { x: 0, y: 0, z: -1 },
    zombies: createZombiePool(zombieCapacity),
  }
}

function resolveZombieEscapeSimulationZombieCapacity(zombieCapacity: number | undefined) {
  if (zombieCapacity === undefined) return ZOMBIE_ESCAPE_CAPACITY.zombies
  if (
    !Number.isInteger(zombieCapacity) ||
    zombieCapacity < 1 ||
    zombieCapacity > ZOMBIE_ESCAPE_MAXIMUM_ZOMBIE_CAPACITY
  ) {
    throw new RangeError(
      `Zombie Escape zombieCapacity must be an integer from 1 through ${String(ZOMBIE_ESCAPE_MAXIMUM_ZOMBIE_CAPACITY)}`,
    )
  }
  return zombieCapacity
}

function resetZombieEscapeNightBossState(state: ZombieEscapeSimulation) {
  state.bossDefeated.fill(0)
  state.bossOwnerGeneration.fill(0)
  state.bossOwnerSlot.fill(-1)
  state.bossSpawnPending.fill(0)
  state.bossSpawned.fill(0)
}

export function resetZombieEscapeSimulation(
  state: ZombieEscapeSimulation,
  arena: ZombieEscapeArenaData,
) {
  // Keep the audio sequence monotonic so a lethal event remains consumable after this reset.
  resetZombieEscapeRandomState(state.random, state.seed)
  resetShotEventPool(state.shots)
  resetWeaponImpactEventPool(state.impactEvents)
  resetZombiePool(state.zombies)
  resetZombieEscapeAmbientHandoff(state.ambientHandoff)
  resetZombieEscapePlayerTrail(state.playerTrail)
  resetZombieEscapeNightBossState(state)
  resetZombieEscapeAgentSpatialIndex(state.agentSpatialIndex)
  state.elapsedSeconds = 0
  state.extractionOpen = false
  state.fireCooldownSeconds = 0
  state.currentNightKills = 0
  state.kills = 0
  state.lastShotGeneration = 0
  state.lastShotSlot = -1
  state.nearbyPickupIndex = -1
  state.navigationGoalInitialized = false
  state.navigationGoalLayerIndex = -1
  state.navigationGoalProjectionScratch.distanceSquared = Number.POSITIVE_INFINITY
  state.navigationGoalProjectionScratch.regionIndex = -1
  state.navigationGoalProjectionScratch.x = 0
  state.navigationGoalProjectionScratch.z = 0
  state.navigationGoalRegionIndex = -1
  state.navigationGoalResolvedTick = 0
  state.navigationGoalX = 0
  state.navigationGoalY = 0
  state.navigationGoalZ = 0
  state.navigationTargetY = 0
  state.nextShotVolleySequence = 0
  state.nextZombieSpawnOrdinal = 0
  state.night = 0
  state.priorNightKills = 0
  clearZombieEscapeSharedRouteCache(state.navigationSharedRouteCache)
  state.navigationSharedRoutePublishedCount = 0
  state.navigationSharedRouteReusedCount = 0
  restoreZombieEscapeObstacleState(state)
  state.paused = false
  state.phase = 'build'
  state.phaseSecondsRemaining = ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds
  state.purchaseFeedback = null
  resetZombieEscapeWeaponPickupRespawnDeadlines(state.weaponPickupRespawnAtSeconds)
  state.weaponPurchaseCount = 0
  state.replacementSpawnRemaining = 0
  state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  state.player.aimAngle = Math.PI
  state.player.health = 100
  state.player.hitSlowSeconds = 0
  state.player.hurtFlash = 0
  state.player.locomotionBlend = 0
  state.player.locomotionPhase = 0
  resetZombieEscapeMeleeState(state.player)
  state.player.meleeSequence = 0
  state.player.movementHeading = Math.PI
  state.player.muzzlePoseExternal = false
  state.player.runBlend = 0
  state.player.weaponAmmoByIndex.fill(0)
  state.player.weaponAmmoByIndex[0] = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  state.player.weaponIndex = 0
  state.player.weaponInventoryMask = 1
  state.player.vx = 0
  state.player.vz = 0
  state.player.x = arena.playerStartX
  state.player.y = 0
  state.player.z = arena.playerStartZ
  updateDefaultMuzzlePose(state.player)
  state.shotsFired = 0
  resetZombieEscapeNavigationIntentScheduler(state)
  state.status = 'playing'
  state.wave = 1
  state.waveIntermissionSeconds = 0
  state.waveSpawnRemaining = 0
  state.waveSpawnTimerSeconds = 0.35
  state.waveState = 'intermission'
}

export function setZombieEscapeWeaponPickupPlacements(
  state: ZombieEscapeSimulation,
  placements: readonly ZombieEscapeWeaponPickupPlacement[],
) {
  state.weaponPickups = sanitizeZombieEscapeWeaponPickupPlacements(placements)
  indexZombieEscapeWeaponPickupsByWeaponIndex(
    state.weaponPickupIndexByWeaponIndex,
    state.weaponPickups,
  )
  state.nearbyPickupIndex = findNearbyZombieEscapeWeaponPickup(state)
  return state.weaponPickups
}

export function setZombieEscapeGamePhase(
  state: ZombieEscapeSimulation,
  phase: ZombieEscapeGamePhase,
) {
  if (phase === 'night') enterZombieEscapeNight(state)
  else enterZombieEscapeBuild(state)
}

export function installZombieEscapeAmbientHandoffCandidates(
  state: ZombieEscapeSimulation,
  source: ZombieEscapeAmbientHandoffSource,
) {
  return installZombieEscapeAmbientHandoffSource(
    state.ambientHandoff,
    source,
    state.variantByPoolSlot,
  )
}

export function setZombieEscapeExternalPlayerPose(
  state: ZombieEscapeSimulation,
  externalPlayerPose: boolean,
) {
  state.externalPlayerPose = externalPlayerPose
}

export function setZombieEscapeCollisionWorld(
  state: ZombieEscapeSimulation,
  navigationWorld: ZombieEscapeCollisionWorld,
  combatWorld: ZombieEscapeCollisionWorld = navigationWorld,
) {
  if (state.sparseNavigationRequired && navigationWorld.navigationMode !== 'sparse') {
    throw new Error('Zombie Escape integrated gameplay requires authored sparse navigation')
  }
  state.collisionSourceWorld = navigationWorld
  state.combatCollisionSourceWorld = combatWorld
  const changed = applyZombieEscapeEffectiveCollisionWorld(state)
  if (changed) {
    refreshZombieEscapeNavigationIntentMetrics(state)
  }
  return changed
}

export function setZombieEscapeObstacleDamageEnabled(
  state: ZombieEscapeSimulation,
  enabled: boolean,
) {
  state.obstacleDamageEnabled = enabled
}

export function requestZombieEscapeDeterministicObstacleDelta(state: ZombieEscapeSimulation) {
  const objectId = findFirstActiveZombieEscapeBreakableObjectId(state.combatCollisionWorld)
  if (objectId) return applyZombieEscapeObstacleDelta(state, objectId)
  const metrics = state.obstacleDeltaMetrics
  const result = state.obstacleDeltaRequestResult
  metrics.requestCount += 1
  metrics.requestedRevision += 1
  metrics.unchangedCount += 1
  result.applied = false
  result.appliedRevision = metrics.appliedRevision
  result.objectId = null
  result.requestedRevision = metrics.requestedRevision
  return result
}

export function applyZombieEscapeObstacleDelta(
  state: ZombieEscapeSimulation,
  objectId: string,
  attackerSlot = -1,
) {
  return applyZombieEscapeObstacleDeltaInternal(state, objectId, attackerSlot, 'destroyed')
}

export function applyZombieEscapePassableObstacleDelta(
  state: ZombieEscapeSimulation,
  objectId: string,
) {
  return applyZombieEscapeObstacleDeltaInternal(state, objectId, -1, 'passable')
}

export function synchronizeZombieEscapePassableObstacleIds(
  state: ZombieEscapeSimulation,
  objectIds: Iterable<string>,
  liveObjectIds: Iterable<string>,
) {
  const liveObjectIdSet = new Set(liveObjectIds)
  let mutationCount = 0
  for (const objectId of state.passableObstacleIds) {
    if (liveObjectIdSet.has(objectId)) continue
    state.passableObstacleIds.delete(objectId)
    state.obstacleHitFeedback.delete(objectId)
    mutationCount += 1
  }
  if (mutationCount > 0) applyZombieEscapeEffectiveCollisionWorld(state)
  for (const objectId of objectIds) {
    if (!objectId || !liveObjectIdSet.has(objectId)) continue
    if (applyZombieEscapePassableObstacleDelta(state, objectId).applied) mutationCount += 1
  }
  return mutationCount
}

function applyZombieEscapeObstacleDeltaInternal(
  state: ZombieEscapeSimulation,
  objectId: string,
  attackerSlot: number,
  persistence: 'destroyed' | 'passable',
) {
  const metrics = state.obstacleDeltaMetrics
  const result = state.obstacleDeltaRequestResult
  metrics.requestCount += 1
  metrics.requestedRevision += 1
  result.applied = false
  result.appliedRevision = metrics.appliedRevision
  result.objectId = objectId
  result.requestedRevision = metrics.requestedRevision
  state.obstacleHitFeedback.delete(objectId)

  const navigationStatus = classifyZombieEscapeCollisionObjectDelta(
    state.collisionWorld,
    objectId,
    state.obstacleDeltaNavigationResult,
  )
  const combatStatus = classifyZombieEscapeCollisionObjectDelta(
    state.combatCollisionWorld,
    objectId,
    state.obstacleDeltaCombatResult,
  )
  const requiresRecompile =
    navigationStatus === 'requires-recompile' || combatStatus === 'requires-recompile'
  const navigationChanges = navigationStatus === 'changed'
  const combatChanges = combatStatus === 'changed'
  if (persistence === 'passable') {
    state.passableObstacleIds.add(objectId)
    state.obstacleHitCounts.delete(objectId)
  }
  if (requiresRecompile && persistence === 'passable') {
    accumulateZombieEscapeCollisionObjectDeltaResult(metrics, state.obstacleDeltaNavigationResult)
    accumulateZombieEscapeCollisionObjectDeltaResult(metrics, state.obstacleDeltaCombatResult)
    metrics.requiresRecompileCount += 1
    metrics.unchangedCount += 1
    return result
  }
  if (!requiresRecompile && !navigationChanges && !combatChanges) {
    accumulateZombieEscapeCollisionObjectDeltaResult(metrics, state.obstacleDeltaNavigationResult)
    accumulateZombieEscapeCollisionObjectDeltaResult(metrics, state.obstacleDeltaCombatResult)
    metrics.unchangedCount += 1
    return result
  }

  const previousWorld = state.collisionWorld
  const previousWorldGeneration = state.collisionWorldGeneration
  let collisionWorldChanged = false
  if (requiresRecompile) {
    metrics.requiresRecompileCount += 1
    state.destroyedObstacleIds.add(objectId)
    collisionWorldChanged = applyZombieEscapeEffectiveCollisionWorld(state)
    const compileCount =
      Number(navigationStatus === 'requires-recompile' || navigationChanges) +
      Number(combatStatus === 'requires-recompile' || combatChanges)
    accumulateZombieEscapeObstacleDeltaCounter(metrics.worldCompileCount, compileCount)
    accumulateZombieEscapeObstacleDeltaCounter(metrics.allocationCount, compileCount)
    accumulateZombieEscapeObstacleDeltaCounter(metrics.fullArrayClearCount, 1)
  } else {
    if (navigationChanges) {
      deactivateZombieEscapeCollisionObject(
        state.collisionWorld,
        state.obstacleDeltaNavigationResult,
      )
    }
    if (combatChanges) {
      deactivateZombieEscapeCollisionObject(
        state.combatCollisionWorld,
        state.obstacleDeltaCombatResult,
      )
    }
    if (persistence === 'destroyed') state.destroyedObstacleIds.add(objectId)
    else state.passableObstacleIds.add(objectId)
    invalidateZombieEscapeRuntimeForCollisionMaskDelta(state)
    collisionWorldChanged = true
  }
  accumulateZombieEscapeCollisionObjectDeltaResult(metrics, state.obstacleDeltaNavigationResult)
  accumulateZombieEscapeCollisionObjectDeltaResult(metrics, state.obstacleDeltaCombatResult)
  if (!collisionWorldChanged) {
    if (persistence === 'destroyed') state.destroyedObstacleIds.delete(objectId)
    metrics.unchangedCount += 1
    return result
  }

  if (persistence === 'destroyed') state.obstacleRevision += 1
  metrics.appliedCount += 1
  metrics.appliedRevision += 1
  metrics.revisionAdvanceCount += 1
  result.applied = true
  result.appliedRevision = metrics.appliedRevision
  normalizeZombieEscapeNavigationIntentsAfterObstacleRemoval(
    state,
    attackerSlot,
    objectId,
    previousWorld,
    previousWorldGeneration,
    true,
  )
  if (state.collisionWorld.navigationMode === 'dense') {
    updateZombieEscapeFlowTarget(
      state.navigationField,
      state.player.x,
      state.player.z,
      state.navigationTargetY,
    )
  }
  return result
}

export function getZombieEscapeMeleeProgress(player: ZombieEscapePlayerState) {
  return resolveZombieEscapeMeleePhaseProgress(player.meleePhase, player.meleePhaseSeconds)
}

export function isZombieEscapeWeaponPickupAvailable(
  state: Pick<ZombieEscapeSimulation, 'elapsedSeconds' | 'weaponPickupRespawnAtSeconds'>,
  weaponIndex: number,
) {
  const respawnAtSeconds = state.weaponPickupRespawnAtSeconds[weaponIndex]
  return (
    Number.isInteger(weaponIndex) &&
    weaponIndex > 0 &&
    weaponIndex < state.weaponPickupRespawnAtSeconds.length &&
    respawnAtSeconds !== undefined &&
    zombieEscapeTimeIsAtOrAfter(state.elapsedSeconds, respawnAtSeconds)
  )
}

export function resolveZombieEscapeWeaponPurchaseCost(
  state: Pick<ZombieEscapeSimulation, 'weaponPurchaseCount'>,
  weaponIndex: number,
) {
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]
  if (!(profile && Number.isFinite(state.weaponPurchaseCount))) return Number.POSITIVE_INFINITY
  const cost = profile.purchaseCost * (Math.max(0, Math.trunc(state.weaponPurchaseCount)) + 1)
  return Number.isFinite(cost) ? cost : Number.POSITIVE_INFINITY
}

export function canAffordNearbyZombieEscapeWeapon(state: ZombieEscapeSimulation) {
  const pickup = state.weaponPickups[state.nearbyPickupIndex]
  const cost = pickup
    ? resolveZombieEscapeWeaponPurchaseCost(state, pickup.weaponIndex)
    : Number.POSITIVE_INFINITY
  return Boolean(
    pickup &&
      isZombieEscapeWeaponPickupAvailable(state, pickup.weaponIndex) &&
      Number.isFinite(state.money) &&
      Number.isFinite(cost) &&
      state.money >= cost,
  )
}

function synchronizeZombieEscapeActiveWeaponAmmo(player: ZombieEscapePlayerState) {
  const weaponIndex = player.weaponIndex
  if (
    !Number.isInteger(weaponIndex) ||
    weaponIndex < 0 ||
    weaponIndex >= player.weaponAmmoByIndex.length
  ) {
    return
  }
  const ammo = Number.isFinite(player.ammo)
    ? Math.min(0xffff_ffff, Math.max(0, Math.trunc(player.ammo)))
    : 0
  player.ammo = ammo
  player.weaponAmmoByIndex[weaponIndex] = ammo
}

export function cycleZombieEscapeOwnedWeapon(state: ZombieEscapeSimulation, direction: number) {
  const player = state.player
  synchronizeZombieEscapeActiveWeaponAmmo(player)
  if (!Number.isFinite(direction) || direction === 0) return false

  const weaponCount = player.weaponAmmoByIndex.length
  if (weaponCount <= 0) return false
  const currentWeaponIndex =
    Number.isInteger(player.weaponIndex) &&
    player.weaponIndex >= 0 &&
    player.weaponIndex < weaponCount
      ? player.weaponIndex
      : 0
  const step = direction < 0 ? -1 : 1
  const inventoryMask =
    Number.isFinite(player.weaponInventoryMask) && player.weaponInventoryMask > 0
      ? Math.trunc(player.weaponInventoryMask) >>> 0
      : 0
  for (let offset = 1; offset <= weaponCount; offset += 1) {
    const weaponIndex = (currentWeaponIndex + step * offset + weaponCount) % weaponCount
    if ((inventoryMask & (1 << weaponIndex)) === 0) continue
    if (weaponIndex === player.weaponIndex) return false
    player.weaponIndex = weaponIndex
    player.ammo = player.weaponAmmoByIndex[weaponIndex]!
    return true
  }
  return false
}

export function tryPurchaseNearbyZombieEscapeWeapon(state: ZombieEscapeSimulation) {
  const pickupIndex = state.nearbyPickupIndex
  const pickup = state.weaponPickups[pickupIndex]
  if (!pickup || !isZombieEscapeWeaponPickupAvailable(state, pickup.weaponIndex)) return false
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[pickup.weaponIndex]
  if (!profile) return false
  const purchaseCost = resolveZombieEscapeWeaponPurchaseCost(state, pickup.weaponIndex)
  if (
    !Number.isFinite(state.money) ||
    !Number.isFinite(purchaseCost) ||
    state.money < purchaseCost
  ) {
    state.purchaseFeedback = 'insufficient-funds'
    emitZombieEscapeAudioEvent(
      state.audioEvents,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.purchaseDenied,
      pickup.x,
      pickup.y,
      pickup.z,
      pickup.weaponIndex,
    )
    return false
  }

  state.money -= purchaseCost
  synchronizeZombieEscapeActiveWeaponAmmo(state.player)
  state.player.weaponAmmoByIndex[pickup.weaponIndex] = profile.ammoGranted
  state.player.ammo = profile.ammoGranted
  state.player.weaponIndex = pickup.weaponIndex
  state.player.weaponInventoryMask =
    (state.player.weaponInventoryMask | (1 << pickup.weaponIndex)) >>> 0
  state.weaponPickupRespawnAtSeconds[pickup.weaponIndex] =
    state.elapsedSeconds + ZOMBIE_ESCAPE_SIMULATION.weaponPickupRespawnSeconds
  state.weaponPurchaseCount += 1
  state.purchaseFeedback = 'purchased'
  state.nearbyPickupIndex = -1
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.weaponPurchased,
    pickup.x,
    pickup.y,
    pickup.z,
    pickup.weaponIndex,
  )
  return true
}

export function setZombieEscapePlayerMuzzlePose(
  state: ZombieEscapeSimulation,
  pose: ZombieEscapeMuzzlePose,
) {
  const player = state.player
  const directionLength = Math.hypot(pose.directionX, pose.directionY, pose.directionZ)
  const inverseDirectionLength = 1 / Math.max(0.000_001, directionLength)
  player.muzzleX = pose.x
  player.muzzleY = pose.y
  player.muzzleZ = pose.z
  if (directionLength <= 0.000_001) {
    player.muzzleDirectionX = Math.sin(player.aimAngle)
    player.muzzleDirectionY = 0
    player.muzzleDirectionZ = Math.cos(player.aimAngle)
  } else {
    player.muzzleDirectionX = pose.directionX * inverseDirectionLength
    player.muzzleDirectionY = pose.directionY * inverseDirectionLength
    player.muzzleDirectionZ = pose.directionZ * inverseDirectionLength
  }
  player.muzzlePoseExternal = true
}

export function restoreZombieEscapeDefaultMuzzlePose(state: ZombieEscapeSimulation) {
  state.player.muzzlePoseExternal = false
  updateDefaultMuzzlePose(state.player)
}

export function stepZombieEscapeSimulation(
  state: ZombieEscapeSimulation,
  input: ZombieEscapeControlState,
  deltaSeconds: number,
  arena: ZombieEscapeArenaData,
) {
  stepZombieEscapeSimulationFrame(state, input, deltaSeconds, arena, true)
}

export function stepZombieEscapeSimulationPhysics(
  state: ZombieEscapeSimulation,
  input: ZombieEscapeControlState,
  deltaSeconds: number,
  arena: ZombieEscapeArenaData,
) {
  stepZombieEscapeSimulationFrame(state, input, deltaSeconds, arena, false)
}

function stepZombieEscapeSimulationFrame(
  state: ZombieEscapeSimulation,
  input: ZombieEscapeControlState,
  deltaSeconds: number,
  arena: ZombieEscapeArenaData,
  advancePhaseClock: boolean,
) {
  if (state.paused || state.status !== 'playing') return
  const delta = Math.max(
    0,
    Math.min(ZOMBIE_ESCAPE_SIMULATION.maximumFrameDeltaSeconds, deltaSeconds),
  )
  if (delta <= 0) return
  state.elapsedSeconds += delta
  if (advancePhaseClock) advanceZombieEscapePhaseClock(state, delta)
  if (state.multiplayer) state.multiplayer.updatePlayers(delta)
  else updatePlayer(state, input, delta)
  if (state.phase === 'night') {
    updateWeaponImpactEvents(state.impactEvents, delta)
    updateShots(state, delta)
    updateZombies(state, delta)
    if (!state.multiplayer || state.multiplayer.selectSpawnTarget()) updateWaves(state, delta)
    finalizeZombieEscapeSparseSearchTickMetrics(state)
    refreshZombieEscapeNavigationIntentMetrics(state)
  }
  if (state.extractionOpen && !state.multiplayer) {
    const escapeDistance = Math.hypot(
      state.player.x - arena.escapeX,
      state.player.z - arena.escapeZ,
    )
    if (escapeDistance <= ZOMBIE_ESCAPE_SIMULATION.escapeRadius) state.status = 'won'
  }
  if (!state.multiplayer && state.phase === 'night' && state.player.health <= 0) {
    state.player.health = 0
    state.status = 'lost'
  }
  if (state.status !== 'playing') state.obstacleHitFeedback.clear()
}

export function spawnZombieEscapeZombie(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
  health = 44 + state.wave * 8,
) {
  return spawnZombieEscapeZombieAtNavigationElevation(
    state,
    x,
    z,
    ZOMBIE_ESCAPE_WAVE_SPAWN_AUTHORED_GROUND_ELEVATION_METERS,
    health,
  )
}

export function spawnZombieEscapeZombieAtNavigationElevation(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
  authoredElevation: number,
  health = 44 + state.wave * 8,
  requestedVariant: number | null = null,
) {
  if (!Number.isFinite(authoredElevation)) return -1
  if (state.sparseNavigationRequired && state.collisionWorld.navigationMode !== 'sparse') {
    return -1
  }
  if (state.collisionWorld.navigationMode === 'sparse') {
    if (
      !state.navigationGoalInitialized ||
      state.navigationGoalResolvedTick !== state.navigationIntentTick ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration <= 0
    ) {
      return -1
    }
    const anchor = state.navigationSparseSpawnAnchorScratch
    if (
      !sampleZombieEscapeSparseSpawnAnchor(
        state.navigationField,
        x,
        z,
        authoredElevation,
        state.navigationSparseSpawnRouteScratch,
        anchor,
      ) ||
      anchor.generation !== state.navigationTargetCommittedRouteGeneration
    ) {
      return -1
    }
    return initializeZombieEscapeZombie(state, anchor.x, anchor.z, health, anchor, requestedVariant)
  }
  if (authoredElevation !== ZOMBIE_ESCAPE_WAVE_SPAWN_AUTHORED_GROUND_ELEVATION_METERS) return -1
  return initializeZombieEscapeZombie(state, x, z, health, null, requestedVariant)
}

export function resolveZombieEscapeZombieSpawnHealth(baseHealth: number, variant: number) {
  return baseHealth * getZombieEscapeZombieCatalogEntry(variant).gameplay.healthMultiplier
}

export function inspectZombieEscapeCommittedNavigationAction(
  state: ZombieEscapeSimulation,
  slot: number,
): ZombieEscapeCommittedNavigationAction {
  if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) return 'none'
  const zombies = state.zombies
  if (
    slot < 0 ||
    slot >= zombies.pool.capacity ||
    zombies.pool.active[slot] === 0 ||
    zombies.health[slot]! <= 0
  ) {
    return 'none'
  }
  if (
    state.collisionWorld.navigationMode === 'sparse' &&
    (!state.navigationGoalInitialized ||
      state.navigationGoalResolvedTick !== state.navigationIntentTick)
  ) {
    return 'none'
  }
  if (zombies.navigationConnector[slot]! >= 0) return 'connector'
  if (
    zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
    zombies.attackTargetObjectId[slot] !== null
  ) {
    return 'attack-obstacle'
  }
  if (zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer) return 'attack-player'
  if (
    state.collisionWorld.navigationMode === 'sparse' &&
    zombies.navigationIntentTargetRevision[slot] !== state.navigationTargetRequestedRevision
  ) {
    const retainsSafeInterimAction =
      zombies.navigationIntentCurrentTargetFallback[slot] === 0 &&
      ((zombies.navigationIntentHasCached[slot] !== 0 &&
        zombies.navigationIntentValid[slot] !== 0 &&
        zombies.navigationReachable[slot] !== 0) ||
        zombies.navigationIntentPending[slot] !== 0 ||
        zombies.navigationSparseFlowSearchActive[slot] !== 0 ||
        zombies.navigationIntentAdmissionDeferredReasons[slot] !== 0)
    return retainsSafeInterimAction ? 'route' : 'none'
  }
  if (zombies.navigationIntentCurrentTargetFallback[slot] !== 0) return 'direct'
  if (
    zombies.navigationIntentHasCached[slot] === 0 ||
    zombies.navigationIntentValid[slot] === 0 ||
    zombies.navigationReachable[slot] === 0
  ) {
    return 'none'
  }
  return zombies.navigationWaypointNode[slot]! >= 0 ? 'route' : 'direct'
}

function spawnZombieEscapeSparseAnchoredZombie(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
  expectedPoolSlot: number,
  candidateRadius: number,
  minimumPlayerDistanceSquared: number,
  health = 44 + state.wave * 8,
  requestedVariant: number | null = null,
) {
  const anchor = state.navigationSparseSpawnAnchorScratch
  if (
    !sampleZombieEscapeSparseSpawnAnchor(
      state.navigationField,
      x,
      z,
      ZOMBIE_ESCAPE_WAVE_SPAWN_AUTHORED_GROUND_ELEVATION_METERS,
      state.navigationSparseSpawnRouteScratch,
      anchor,
    )
  ) {
    return -1
  }
  if (resolveZombieEscapeNextAvailablePoolSlot(state.zombies.pool) !== expectedPoolSlot) return -1
  const playerOffsetX = anchor.x - state.player.x
  const playerOffsetZ = anchor.z - state.player.z
  if (
    playerOffsetX * playerOffsetX + playerOffsetZ * playerOffsetZ <
    minimumPlayerDistanceSquared
  ) {
    return -1
  }
  if (
    !zombieEscapeAgentSpatialPositionIsClear(
      state.agentSpatialIndex,
      anchor.layerIndex,
      anchor.x,
      anchor.z,
      candidateRadius,
      state.zombies.variant,
      state.zombies.x,
      state.zombies.z,
    ) ||
    !sampleZombieEscapeSparseSpawnAnchor(
      state.navigationField,
      anchor.x,
      anchor.z,
      ZOMBIE_ESCAPE_WAVE_SPAWN_AUTHORED_GROUND_ELEVATION_METERS,
      state.navigationSparseSpawnRouteScratch,
      anchor,
    )
  ) {
    return -1
  }
  return initializeZombieEscapeZombie(state, anchor.x, anchor.z, health, anchor, requestedVariant)
}

function initializeZombieEscapeZombie(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
  health: number,
  anchor: ZombieEscapeSimulation['navigationSparseSpawnAnchorScratch'] | null,
  requestedVariant: number | null = null,
) {
  const zombies = state.zombies
  const slot = acquireZombieEscapePoolSlot(zombies.pool)
  clearZombieEscapeAmbientHandoffSlotOwnership(state.ambientHandoff, slot)
  cancelZombieEscapeNavigationIntentDemand(state, slot)
  const spawnOrdinal = state.nextZombieSpawnOrdinal >>> 0
  state.nextZombieSpawnOrdinal = (spawnOrdinal + 1) >>> 0
  const variant =
    requestedVariant === null ? state.variantByPoolSlot[slot]! : Math.trunc(requestedVariant)
  zombies.variant[slot] = variant
  zombies.x[slot] = x
  zombies.y[slot] = anchor?.elevation ?? 0
  zombies.z[slot] = z
  zombies.vx[slot] = 0
  zombies.vz[slot] = 0
  zombies.health[slot] = resolveZombieEscapeZombieSpawnHealth(health, variant)
  zombies.gait[slot] = ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner
  zombies.heading[slot] = Math.atan2(state.player.x - x, state.player.z - z)
  zombies.hitFlash[slot] = 0
  zombies.hitImpulseX[slot] = 0
  zombies.hitImpulseY[slot] = 0
  zombies.hitImpulseZ[slot] = 0
  zombies.hitReaction[slot] = 0
  zombies.locomotionBlend[slot] = 0
  zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
  zombies.runBlend[slot] = zombies.gait[slot] === ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner ? 1 : 0
  zombies.locomotionPhase[slot] = nextZombieEscapeRandom(state.random) * Math.PI * 2
  zombies.navigationBlockerBreakable[slot] = 0
  zombies.navigationBlockerObjectId[slot] = null
  zombies.navigationBlockerObjectOrdinal[slot] = -1
  zombies.navigationBlockingDistance[slot] = Number.POSITIVE_INFINITY
  zombies.navigationBlockingX[slot] = x
  zombies.navigationBlockingZ[slot] = z
  zombies.navigationConnector[slot] = -1
  zombies.navigationConnectorTargetEnd[slot] = 0
  zombies.navigationDirectionX[slot] = 0
  zombies.navigationDirectionZ[slot] = 0
  zombies.navigationLiveGoalClearTicks[slot] =
    ZOMBIE_ESCAPE_SIMULATION.zombieLiveGoalReacquisitionClearTicks
  zombies.navigationCollisionRecoveryOriginX[slot] = x
  zombies.navigationCollisionRecoveryOriginZ[slot] = z
  zombies.navigationIntentAdmissionDeferredReasons[slot] = 0
  zombies.navigationIntentAdmissionDeferredNext[slot] = -1
  zombies.navigationIntentAdmissionDeferredPrevious[slot] = -1
  zombies.navigationIntentHasCached[slot] = 0
  zombies.navigationIntentHasReceivedFirstService[slot] = 0
  zombies.navigationIntentAdmissionWorldGeneration[slot] = state.collisionWorldGeneration
  zombies.navigationIntentFirstServiceEligibleSinceTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationIntentFirstServiceTick[slot] = 0
  zombies.navigationIntentPending[slot] = 0
  zombies.navigationIntentPendingSinceTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationIntentPoolGeneration[slot] = zombies.pool.generation[slot] ?? 0
  zombies.navigationIntentResolvedTick[slot] = 0
  zombies.navigationIntentCommittedRouteGeneration[slot] =
    state.navigationTargetCommittedRouteGeneration
  zombies.navigationIntentCurrentTargetFallback[slot] = 0
  zombies.navigationIntentTargetRevision[slot] = 0
  zombies.navigationIntentUrgentRefreshUsed[slot] = 0
  zombies.navigationIntentValid[slot] = 0
  zombies.navigationIntentWorldGeneration[slot] = state.collisionWorldGeneration
  zombies.navigationNoProgressTicks[slot] = 0
  zombies.navigationProgressTargetNode[slot] = ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED
  zombies.navigationRecoveryCooldownTicks[slot] = 0
  zombies.navigationReachable[slot] = 0
  zombies.navigationRequestedConnector[slot] = -1
  zombies.navigationRequestedConnectorTargetEnd[slot] = 0
  resetZombieEscapeSparseFlowSearch(zombies.navigationSparseCommittedFlowSearch[slot]!)
  resetZombieEscapeSparseFlowSearch(zombies.navigationSparseFlowSearch[slot]!)
  zombies.navigationSparseFlowSearchActive[slot] = 0
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationSparseFlowSearchRestartToken[slot] = 0
  zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
  zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 0
  zombies.navigationSparseFlowSearchWorldRevision[slot] = state.navigationWorldRevision
  zombies.navigationSourceCertifiedX[slot] = x
  zombies.navigationSourceCertifiedY[slot] = zombies.y[slot]!
  zombies.navigationSourceCertifiedZ[slot] = z
  zombies.navigationSourceNeedsValidation[slot] = 0
  zombies.navigationWaypointFallback[slot] = 0
  zombies.navigationWaypointNode[slot] = -1
  zombies.projectileHitOrdinal[slot] = 0
  clearZombieEscapePlayerTrailPursuit(zombies, slot)
  zombies.attackCooldown[slot] = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
  zombies.attackContactResolved[slot] = 0
  zombies.attackFocusX[slot] = x
  zombies.attackFocusZ[slot] = z
  zombies.attackObstacleRenewalEvidence[slot] = 0
  zombies.attackTargetObjectId[slot] = null
  zombies.attackTargetObjectOrdinal[slot] = -1
  zombies.deathPresentationSeconds[slot] = 0
  zombies.spawnOrdinal[slot] = spawnOrdinal
  zombies.speedScale[slot] = resolveZombieEscapeSpawnSpeedScale(
    state.seed,
    spawnOrdinal,
    state.phase === 'night'
      ? resolveZombieEscapeNightSpawnSpeedMaximumMultiplier(state.phaseSecondsRemaining)
      : 1,
  )
  if (anchor) {
    cacheZombieEscapeSparseNavigationAnchor(state, slot, anchor)
  } else {
    deferZombieEscapeNavigationIntentAdmission(state, slot, 'spawn')
  }
  state.multiplayer?.zombieCreated(slot)
  return slot
}

function cacheZombieEscapeSparseNavigationAnchor(
  state: ZombieEscapeSimulation,
  slot: number,
  anchor: ZombieEscapeSimulation['navigationSparseSpawnAnchorScratch'],
) {
  writeZombieEscapeSparseNavigationAnchorSample(state, anchor)
  state.zombies.navigationIntentAdmissionWorldGeneration[slot] = state.collisionWorldGeneration
  cacheZombieEscapeNavigationIntent(
    state,
    slot,
    state.navigationIntentTick,
    null,
    -1,
    false,
    anchor.generation,
    state.navigationTargetRequestedRevision,
  )
  if (
    seedZombieEscapeSparseFlowSearchRouteCorridor(
      state.zombies.navigationSparseCommittedFlowSearch[slot]!,
      state.navigationField,
      anchor.witnessNode,
      anchor.usesFallback,
    )
  ) {
    publishZombieEscapeSharedRouteForSource(
      state,
      anchor.x,
      anchor.elevation,
      anchor.z,
      anchor.witnessNode,
      anchor.usesFallback,
    )
  }
}

function rejectZombieEscapeUnanchoredZombieFromNavigation(
  state: ZombieEscapeSimulation,
  slot: number,
) {
  cancelZombieEscapeNavigationIntentDemand(state, slot)
  if (state.multiplayer) state.multiplayer.navigationTargetRejected(slot)
  else releaseZombieEscapeZombieSlot(state, slot, 'navigation')
}

function certifyZombieEscapeNavigationSource(
  zombies: ZombieEscapeZombiePool,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  zombies.navigationSourceCertifiedX[slot] = sourceX
  zombies.navigationSourceCertifiedY[slot] = sourceY
  zombies.navigationSourceCertifiedZ[slot] = sourceZ
  zombies.navigationSourceNeedsValidation[slot] = 0
}

function retainedZombieEscapeSparseCorridorCertifiesSource(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  const zombies = state.zombies
  if (
    zombies.navigationIntentHasCached[slot] === 0 ||
    zombies.navigationIntentValid[slot] === 0 ||
    zombies.navigationReachable[slot] === 0 ||
    zombies.navigationIntentCommittedRouteGeneration[slot] !==
      state.navigationTargetCommittedRouteGeneration
  ) {
    return false
  }
  const waypointNode = zombies.navigationWaypointNode[slot]!
  if (waypointNode < 0) {
    return (
      state.navigationGoalInitialized &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        sourceX,
        sourceY,
        sourceZ,
        state.navigationGoalX,
        state.navigationGoalY,
        state.navigationGoalZ,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    )
  }
  const graph = state.collisionWorld.navigationGraph
  const layerIndex = graph.layerIndices[waypointNode] ?? -1
  const layer = state.collisionWorld.navigationLayers[layerIndex]
  if (
    !layer ||
    !sampleZombieEscapeSparseCommittedNodeRoute(
      state.navigationField,
      waypointNode,
      zombies.navigationWaypointFallback[slot] !== 0,
      state.navigationSparseSpawnRouteScratch,
    ) ||
    !state.navigationSparseSpawnRouteScratch.reachable ||
    state.navigationSparseSpawnRouteScratch.generation !==
      state.navigationTargetCommittedRouteGeneration
  ) {
    return false
  }
  resetZombieEscapeNavigationHit(state.navigationHitScratch)
  if (
    zombieEscapeSameLayerNavigationSegmentIsClear(
      state.collisionWorld,
      sourceX,
      sourceY,
      sourceZ,
      graph.x[waypointNode]!,
      layer.elevation,
      graph.z[waypointNode]!,
      state.collisionWorld.agentRadius,
      state.navigationHitScratch,
    )
  ) {
    return true
  }
  return (
    zombies.navigationWaypointFallback[slot] !== 0 &&
    isZombieEscapeCollisionHitBreakable(state.collisionWorld, state.navigationHitScratch)
  )
}

function validateZombieEscapeReconciledSparseSource(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  navigationIntentTick: number,
) {
  if (retainedZombieEscapeSparseCorridorCertifiesSource(state, slot, sourceX, sourceY, sourceZ)) {
    return true
  }
  if (state.zombies.navigationWaypointNode[slot]! >= 0) {
    state.navigationAnchorInvalidationCount += 1
  }
  if (writeZombieEscapeSparseLocalNavigationSample(state, slot, sourceX, sourceY, sourceZ)) {
    state.zombies.navigationIntentAdmissionWorldGeneration[slot] = state.collisionWorldGeneration
    completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
    return true
  }
  if (!zombieEscapeSparseSourceRegionReachesCommittedTarget(state, sourceX, sourceY, sourceZ)) {
    return false
  }
  deferZombieEscapeSparseLocalReattachment(state, slot, 'cachedAnchorLost')
  return true
}

function writeZombieEscapeSparseNavigationAnchorSample(
  state: ZombieEscapeSimulation,
  anchor: ZombieEscapeSimulation['navigationSparseSpawnAnchorScratch'],
) {
  const graph = state.collisionWorld.navigationGraph
  const witnessX = graph.x[anchor.witnessNode]!
  const witnessZ = graph.z[anchor.witnessNode]!
  const directionX = witnessX - anchor.x
  const directionZ = witnessZ - anchor.z
  const directionLength = Math.hypot(directionX, directionZ)
  const sample = state.navigationSampleScratch
  sample.blockingDistance = Number.POSITIVE_INFINITY
  sample.blockingX = anchor.x
  sample.blockingZ = anchor.z
  sample.connectorIndex = -1
  sample.connectorTargetEnd = false
  sample.reachable = true
  sample.waypointNode = anchor.witnessNode
  sample.waypointUsesFallback = anchor.usesFallback
  sample.x = directionLength > 0.000_001 ? directionX / directionLength : 0
  sample.z = directionLength > 0.000_001 ? directionZ / directionLength : 0
}

function publishZombieEscapeSharedRouteForSource(
  state: ZombieEscapeSimulation,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  waypointNode: number,
  usesFallback: boolean,
) {
  const sourceLayerIndex = resolveZombieEscapeSparseSourceLayerIndex(state.collisionWorld, sourceY)
  if (sourceLayerIndex < 0) return false
  const graph = state.collisionWorld.navigationGraph
  const regionIndex = resolveSparseNavigationStrictRegionIndex(
    graph.targetRegionIndex,
    sourceLayerIndex,
    sourceX,
    sourceZ,
  )
  const regionPublished = publishZombieEscapeSharedRoute(
    state.navigationSharedRouteCache,
    regionIndex,
    waypointNode,
    usesFallback,
    state.navigationTargetCommittedRouteGeneration,
    state.navigationTargetRequestedRevision,
    state.collisionWorldGeneration,
  )
  const sourceWitnessNode = graph.targetRegionIndex.witnessNodes[regionIndex] ?? -1
  const componentIndex = resolveZombieEscapeSharedRouteComponentIndex(
    graph,
    sourceWitnessNode,
    usesFallback,
  )
  const componentPublished = publishZombieEscapeSharedComponentRoute(
    state.navigationSharedRouteCache,
    componentIndex,
    waypointNode,
    usesFallback,
    state.navigationTargetCommittedRouteGeneration,
    state.navigationTargetRequestedRevision,
    state.collisionWorldGeneration,
  )
  const published = regionPublished || componentPublished
  if (published) state.navigationSharedRoutePublishedCount += 1
  return published
}

function createZombieEscapeSharedRouteCacheForGraph(graph: ZombieEscapeSparseNavigationGraph) {
  return createZombieEscapeSharedRouteCache({
    fallbackSameLayerComponentIndices: graph.fallbackSameLayerComponentIndices,
    regionCount: graph.targetRegionIndex.witnessNodes.length,
    strictSameLayerComponentIndices: graph.strictSameLayerComponentIndices,
  })
}

function resolveZombieEscapeSharedRouteComponentIndex(
  graph: ZombieEscapeSparseNavigationGraph,
  witnessNode: number,
  usesFallback: boolean,
) {
  if (witnessNode < 0 || witnessNode >= graph.nodeIds.length) return -1
  return (
    (usesFallback
      ? graph.fallbackSameLayerComponentIndices[witnessNode]
      : graph.strictSameLayerComponentIndices[witnessNode]) ?? -1
  )
}

function resolveZombieEscapeSparseSourceLayerIndex(
  world: ZombieEscapeCollisionWorld,
  sourceY: number,
) {
  let sourceLayerIndex = -1
  let sourceLayerDistance = Number.POSITIVE_INFINITY
  for (let layerIndex = 0; layerIndex < world.navigationLayers.length; layerIndex += 1) {
    const distance = Math.abs(world.navigationLayers[layerIndex]!.elevation - sourceY)
    if (distance >= sourceLayerDistance) continue
    sourceLayerDistance = distance
    sourceLayerIndex = layerIndex
  }
  return sourceLayerDistance <= Math.max(0.05, world.cellSize * 0.5) ? sourceLayerIndex : -1
}

export function zombieEscapeSparseSourceRegionReachesCommittedTarget(
  state: ZombieEscapeSimulation,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  const graph = state.collisionWorld.navigationGraph
  const sourceLayerIndex = resolveZombieEscapeSparseSourceLayerIndex(state.collisionWorld, sourceY)
  if (sourceLayerIndex < 0) return false
  const regionIndex = resolveSparseNavigationStrictRegionIndex(
    graph.targetRegionIndex,
    sourceLayerIndex,
    sourceX,
    sourceZ,
  )
  const witnessNode = graph.targetRegionIndex.witnessNodes[regionIndex] ?? -1
  if (witnessNode < 0) return false
  const route = state.navigationSparseSpawnRouteScratch
  return (
    (sampleZombieEscapeSparseCommittedNodeRoute(state.navigationField, witnessNode, false, route) &&
      route.reachable &&
      route.generation === state.navigationTargetCommittedRouteGeneration) ||
    (sampleZombieEscapeSparseCommittedNodeRoute(state.navigationField, witnessNode, true, route) &&
      route.reachable &&
      route.generation === state.navigationTargetCommittedRouteGeneration)
  )
}

function writeZombieEscapeSparseLocalNavigationSample(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  const world = state.collisionWorld
  const targetStatus = state.navigationField.graphSparseTargetUpdate.status
  if (
    world.navigationMode !== 'sparse' ||
    (targetStatus !== 'ready' && targetStatus !== 'pending') ||
    state.navigationTargetCommittedRouteGeneration <= 0
  ) {
    return false
  }
  const sourceLayerIndex = resolveZombieEscapeSparseSourceLayerIndex(world, sourceY)
  if (sourceLayerIndex < 0) return false

  const graph = world.navigationGraph
  const maximumDistanceSquared = ZOMBIE_ESCAPE_SPARSE_LOCAL_REATTACHMENT_RADIUS_METERS ** 2
  const sourceBucketX = Math.floor(sourceX / graph.bucketSize)
  const sourceBucketZ = Math.floor(sourceZ / graph.bucketSize)
  const maximumBucketRing = Math.ceil(
    ZOMBIE_ESCAPE_SPARSE_LOCAL_REATTACHMENT_RADIUS_METERS / graph.bucketSize,
  )
  let bestStrictDistanceSquared = Number.POSITIVE_INFINITY
  let bestStrictNode = -1
  let bestFallbackDistanceSquared = Number.POSITIVE_INFINITY
  let bestFallbackNode = -1
  const route = state.navigationSparseSpawnRouteScratch
  for (
    let bucketZ = sourceBucketZ - maximumBucketRing;
    bucketZ <= sourceBucketZ + maximumBucketRing;
    bucketZ += 1
  ) {
    for (
      let bucketX = sourceBucketX - maximumBucketRing;
      bucketX <= sourceBucketX + maximumBucketRing;
      bucketX += 1
    ) {
      const nodes = graph.buckets.get(sparseNavigationBucketKey(sourceLayerIndex, bucketX, bucketZ))
      if (!nodes) continue
      for (const node of nodes) {
        if (graph.layerIndices[node] !== sourceLayerIndex) continue
        const offsetX = graph.x[node]! - sourceX
        const offsetZ = graph.z[node]! - sourceZ
        const distanceSquared = offsetX * offsetX + offsetZ * offsetZ
        if (distanceSquared > maximumDistanceSquared) continue
        if (
          !zombieEscapeSameLayerNavigationSegmentIsClear(
            world,
            sourceX,
            sourceY,
            sourceZ,
            graph.x[node]!,
            world.navigationLayers[sourceLayerIndex]!.elevation,
            graph.z[node]!,
            world.agentRadius,
            state.navigationHitScratch,
          )
        ) {
          continue
        }
        const strictRouteIsCurrent =
          sampleZombieEscapeSparseCommittedNodeRoute(state.navigationField, node, false, route) &&
          route.reachable &&
          route.generation === state.navigationTargetCommittedRouteGeneration
        if (strictRouteIsCurrent) {
          if (
            distanceSquared < bestStrictDistanceSquared ||
            (distanceSquared === bestStrictDistanceSquared &&
              (bestStrictNode < 0 || node < bestStrictNode))
          ) {
            bestStrictDistanceSquared = distanceSquared
            bestStrictNode = node
          }
          continue
        }
        const fallbackRouteIsCurrent =
          sampleZombieEscapeSparseCommittedNodeRoute(state.navigationField, node, true, route) &&
          route.reachable &&
          route.generation === state.navigationTargetCommittedRouteGeneration
        if (
          !fallbackRouteIsCurrent ||
          distanceSquared > bestFallbackDistanceSquared ||
          (distanceSquared === bestFallbackDistanceSquared &&
            bestFallbackNode >= 0 &&
            node >= bestFallbackNode)
        ) {
          continue
        }
        bestFallbackDistanceSquared = distanceSquared
        bestFallbackNode = node
      }
    }
  }

  const usesFallback = bestStrictNode < 0
  const witnessNode = usesFallback ? bestFallbackNode : bestStrictNode
  if (
    witnessNode < 0 ||
    !sampleZombieEscapeSparseCommittedNodeRoute(
      state.navigationField,
      witnessNode,
      usesFallback,
      route,
    ) ||
    !route.reachable ||
    route.generation !== state.navigationTargetCommittedRouteGeneration
  ) {
    return false
  }
  const anchor = state.navigationSparseSpawnAnchorScratch
  anchor.elevation = world.navigationLayers[sourceLayerIndex]!.elevation
  anchor.generation = route.generation
  anchor.layerIndex = sourceLayerIndex
  anchor.reachable = true
  anchor.usesFallback = usesFallback
  anchor.witnessNode = witnessNode
  anchor.x = sourceX
  anchor.z = sourceZ
  writeZombieEscapeSparseNavigationAnchorSample(state, anchor)
  if (
    !seedZombieEscapeSparseFlowSearchRouteCorridor(
      state.zombies.navigationSparseCommittedFlowSearch[slot]!,
      state.navigationField,
      witnessNode,
      usesFallback,
    )
  ) {
    return false
  }
  publishZombieEscapeSharedRouteForSource(
    state,
    sourceX,
    sourceY,
    sourceZ,
    witnessNode,
    usesFallback,
  )
  resetZombieEscapeNavigationHit(state.navigationHitScratch)
  return true
}

function tryCompleteZombieEscapeSparseLocalReattachment(
  state: ZombieEscapeSimulation,
  slot: number,
  navigationIntentTick: number,
) {
  const zombies = state.zombies
  if (
    writeZombieEscapeSharedRouteNavigationSample(
      state,
      slot,
      zombies.x[slot]!,
      zombies.y[slot]!,
      zombies.z[slot]!,
    )
  ) {
    recordZombieEscapeSparseServiceSlice(state, 'agent', true, 0, true)
    markZombieEscapeNavigationIntentFirstService(state, slot)
    completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
    zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
    zombies.navigationSparseFlowSearchRestartToken[slot] = 0
    zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
    state.navigationSharedRouteReusedCount += 1
    return true
  }
  if (
    !writeZombieEscapeSparseLocalNavigationSample(
      state,
      slot,
      zombies.x[slot]!,
      zombies.y[slot]!,
      zombies.z[slot]!,
    )
  ) {
    return false
  }
  recordZombieEscapeSparseServiceSlice(state, 'agent', true, 0, true)
  markZombieEscapeNavigationIntentFirstService(state, slot)
  completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  zombies.navigationSparseFlowSearchRestartToken[slot] = 0
  zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
  return true
}

function writeZombieEscapeSharedRouteNavigationSample(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  const world = state.collisionWorld
  const targetStatus = state.navigationField.graphSparseTargetUpdate.status
  if (
    world.navigationMode !== 'sparse' ||
    (targetStatus !== 'ready' && targetStatus !== 'pending') ||
    state.navigationTargetCommittedRouteGeneration <= 0
  ) {
    return false
  }
  const sourceLayerIndex = resolveZombieEscapeSparseSourceLayerIndex(world, sourceY)
  if (sourceLayerIndex < 0) return false
  const regionIndex = resolveSparseNavigationStrictRegionIndex(
    world.navigationGraph.targetRegionIndex,
    sourceLayerIndex,
    sourceX,
    sourceZ,
  )
  const graph = world.navigationGraph
  const exactWaypointNode = readZombieEscapeSharedRouteWaypoint(
    state.navigationSharedRouteCache,
    regionIndex,
    state.navigationTargetCommittedRouteGeneration,
    state.navigationTargetRequestedRevision,
    state.collisionWorldGeneration,
  )
  if (exactWaypointNode >= 0) {
    const exactUsesFallback = state.navigationSharedRouteCache.fallbackByRegion[regionIndex] !== 0
    if (
      writeZombieEscapeSharedRouteWaypointNavigationSample(
        state,
        slot,
        sourceX,
        sourceY,
        sourceZ,
        sourceLayerIndex,
        exactWaypointNode,
        exactUsesFallback,
      )
    ) {
      return true
    }
  }

  const sourceWitnessNode = graph.targetRegionIndex.witnessNodes[regionIndex] ?? -1
  const strictComponentIndex = resolveZombieEscapeSharedRouteComponentIndex(
    graph,
    sourceWitnessNode,
    false,
  )
  const strictWaypointNode = readZombieEscapeSharedComponentRouteWaypoint(
    state.navigationSharedRouteCache,
    strictComponentIndex,
    false,
    state.navigationTargetCommittedRouteGeneration,
    state.navigationTargetRequestedRevision,
    state.collisionWorldGeneration,
  )
  if (
    strictWaypointNode >= 0 &&
    writeZombieEscapeSharedRouteWaypointNavigationSample(
      state,
      slot,
      sourceX,
      sourceY,
      sourceZ,
      sourceLayerIndex,
      strictWaypointNode,
      false,
    )
  ) {
    return true
  }

  const fallbackComponentIndex = resolveZombieEscapeSharedRouteComponentIndex(
    graph,
    sourceWitnessNode,
    true,
  )
  const fallbackWaypointNode = readZombieEscapeSharedComponentRouteWaypoint(
    state.navigationSharedRouteCache,
    fallbackComponentIndex,
    true,
    state.navigationTargetCommittedRouteGeneration,
    state.navigationTargetRequestedRevision,
    state.collisionWorldGeneration,
  )
  return (
    fallbackWaypointNode >= 0 &&
    writeZombieEscapeSharedRouteWaypointNavigationSample(
      state,
      slot,
      sourceX,
      sourceY,
      sourceZ,
      sourceLayerIndex,
      fallbackWaypointNode,
      true,
    )
  )
}

function writeZombieEscapeSharedRouteWaypointNavigationSample(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  sourceLayerIndex: number,
  waypointNode: number,
  usesFallback: boolean,
) {
  const world = state.collisionWorld
  const graph = world.navigationGraph
  if (
    waypointNode < 0 ||
    waypointNode >= graph.nodeIds.length ||
    graph.layerIndices[waypointNode] !== sourceLayerIndex
  ) {
    return false
  }
  const waypointX = graph.x[waypointNode]!
  const waypointZ = graph.z[waypointNode]!
  const waypointY = world.navigationLayers[sourceLayerIndex]!.elevation
  if (
    !zombieEscapeSameLayerNavigationSegmentIsClear(
      world,
      sourceX,
      sourceY,
      sourceZ,
      waypointX,
      waypointY,
      waypointZ,
      world.agentRadius,
      state.navigationHitScratch,
    )
  ) {
    return false
  }
  if (
    !seedZombieEscapeSparseFlowSearchRouteCorridor(
      state.zombies.navigationSparseCommittedFlowSearch[slot]!,
      state.navigationField,
      waypointNode,
      usesFallback,
    )
  ) {
    return false
  }
  const directionX = waypointX - sourceX
  const directionZ = waypointZ - sourceZ
  const directionLength = Math.hypot(directionX, directionZ)
  const sample = state.navigationSampleScratch
  sample.blockingDistance = Number.POSITIVE_INFINITY
  sample.blockingX = waypointX
  sample.blockingZ = waypointZ
  sample.connectorIndex = -1
  sample.connectorTargetEnd = false
  sample.reachable = true
  sample.waypointNode = waypointNode
  sample.waypointUsesFallback = usesFallback
  sample.x = directionLength > 0.000_001 ? directionX / directionLength : 0
  sample.z = directionLength > 0.000_001 ? directionZ / directionLength : 0
  resetZombieEscapeNavigationHit(state.navigationHitScratch)
  return true
}

function recoverZombieEscapeSparseLocalReattachment(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  reason: ZombieEscapeDeferredNavigationIntentReason,
  navigationIntentTick: number,
) {
  if (writeZombieEscapeSparseLocalNavigationSample(state, slot, sourceX, sourceY, sourceZ)) {
    state.zombies.navigationIntentAdmissionWorldGeneration[slot] = state.collisionWorldGeneration
    completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
    return true
  }
  deferZombieEscapeSparseLocalReattachment(state, slot, reason)
  return false
}

function deferZombieEscapeSparseLocalReattachment(
  state: ZombieEscapeSimulation,
  slot: number,
  reason: ZombieEscapeDeferredNavigationIntentReason,
) {
  const zombies = state.zombies
  const admissionReason =
    reason === 'cachedAnchorLost' &&
    zombies.navigationIntentTargetRevision[slot] !== state.navigationTargetRequestedRevision
      ? 'routePublished'
      : reason
  cancelZombieEscapeSparseFlowSearch(state, slot)
  if (zombies.navigationWaypointNode[slot]! >= 0) state.navigationAnchorInvalidationCount += 1
  clearZombieEscapeSparseFlowSearchRouteCorridor(zombies.navigationSparseCommittedFlowSearch[slot]!)
  zombies.navigationIntentCurrentTargetFallback[slot] = 0
  zombies.navigationWaypointFallback[slot] = 0
  zombies.navigationWaypointNode[slot] = -1
  zombies.navigationBlockerBreakable[slot] = 0
  zombies.navigationBlockerObjectId[slot] = null
  zombies.navigationBlockerObjectOrdinal[slot] = -1
  zombies.navigationDirectionX[slot] = 0
  zombies.navigationDirectionZ[slot] = 0
  zombies.navigationRequestedConnector[slot] = -1
  zombies.navigationRequestedConnectorTargetEnd[slot] = 0
  if (zombies.navigationIntentPending[slot] === 0) {
    deferZombieEscapeNavigationIntentAdmission(state, slot, admissionReason)
  }
  return true
}

function zombieEscapeSparseLocalReattachmentIsPending(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  return (
    zombies.navigationIntentPending[slot] !== 0 ||
    zombies.navigationSparseFlowSearchActive[slot] !== 0 ||
    zombies.navigationIntentAdmissionDeferredReasons[slot] !== 0
  )
}

function tryReanchorZombieEscapeSparseCollision(
  state: ZombieEscapeSimulation,
  slot: number,
  acceptedX: number,
  acceptedY: number,
  acceptedZ: number,
) {
  const zombies = state.zombies
  if (
    state.collisionWorld.navigationMode !== 'sparse' ||
    zombies.navigationConnector[slot]! >= 0 ||
    zombies.navigationIntentPending[slot] !== 0 ||
    zombies.navigationSparseFlowSearchActive[slot] !== 0 ||
    zombies.navigationIntentAdmissionDeferredReasons[slot] !== 0
  ) {
    return false
  }
  state.navigationSparseCollisionReanchorAttemptCount += 1
  zombies.x[slot] = acceptedX
  zombies.y[slot] = acceptedY
  zombies.z[slot] = acceptedZ
  zombies.vx[slot] = 0
  zombies.vz[slot] = 0
  if (!writeZombieEscapeSparseLocalNavigationSample(state, slot, acceptedX, acceptedY, acceptedZ)) {
    state.navigationSparseCollisionReanchorFailedCount += 1
    return false
  }
  state.zombies.navigationIntentAdmissionWorldGeneration[slot] = state.collisionWorldGeneration
  completeZombieEscapeRecoveredNavigationIntent(state, slot, state.navigationIntentTick)
  zombies.navigationCollisionRecoveryOriginX[slot] = acceptedX
  zombies.navigationCollisionRecoveryOriginZ[slot] = acceptedZ
  zombies.navigationIntentUrgentRefreshUsed[slot] = 1
  state.navigationSparseCollisionReanchorCompletedCount += 1
  return true
}

export function countZombieEscapeShotsByPhase(
  shots: ZombieEscapeShotEventPool,
  phase: ZombieEscapeShotPhase,
) {
  let count = 0
  for (let slot = 0; slot < shots.pool.capacity; slot += 1) {
    if (shots.pool.active[slot] !== 0 && shots.phase[slot] === phase) count += 1
  }
  return count
}

export function cycleZombieEscapeDebugMode(state: ZombieEscapeSimulation) {
  const index = ZOMBIE_ESCAPE_DEBUG_MODES.indexOf(state.debugMode)
  state.debugMode =
    ZOMBIE_ESCAPE_DEBUG_MODES[(index + 1) % ZOMBIE_ESCAPE_DEBUG_MODES.length] ?? 'final'
  return state.debugMode
}

export function cycleZombieEscapeCameraBookmark(state: ZombieEscapeSimulation) {
  const index = ZOMBIE_ESCAPE_CAMERA_BOOKMARKS.indexOf(state.cameraBookmark)
  state.cameraBookmark =
    ZOMBIE_ESCAPE_CAMERA_BOOKMARKS[(index + 1) % ZOMBIE_ESCAPE_CAMERA_BOOKMARKS.length] ?? 'design'
  return state.cameraBookmark
}

export function createZombieEscapeHudSnapshot(
  state?: ZombieEscapeSimulation,
  renderCalls = 0,
  triangles = 0,
  frameMs = 0,
): ZombieEscapeHudSnapshot {
  if (!state) {
    return {
      ammo: ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted,
      cameraBookmark: 'design',
      debugMode: 'final',
      elapsedSeconds: 0,
      extractionOpen: false,
      frameMs: 0,
      health: 100,
      kills: 0,
      money: 0,
      muzzleFlashes: 0,
      paused: false,
      phase: 'build',
      phaseSecondsRemaining: ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds,
      pickupPrompt: null,
      purchaseFeedback: null,
      renderCalls: 0,
      shots: 0,
      shotsFired: 0,
      shotsImpacting: 0,
      shotsTraveling: 0,
      status: 'playing',
      triangles: 0,
      night: 0,
      wave: 1,
      waveRemaining: 0,
      waveState: 'intermission',
      weaponIndex: 0,
      weaponInventoryMask: 1,
      zombies: 0,
    }
  }
  return {
    ammo: state.player.ammo,
    cameraBookmark: state.cameraBookmark,
    debugMode: state.debugMode,
    elapsedSeconds: state.elapsedSeconds,
    extractionOpen: state.extractionOpen,
    frameMs,
    health: state.player.health,
    kills: state.kills,
    money: state.money,
    muzzleFlashes: countActiveMuzzleFlashes(state.shots),
    paused: state.paused,
    phase: state.phase,
    phaseSecondsRemaining: state.phaseSecondsRemaining,
    pickupPrompt: createZombieEscapePickupPrompt(state),
    purchaseFeedback: state.purchaseFeedback,
    renderCalls,
    shots: state.shots.pool.activeCount,
    shotsFired: state.shotsFired,
    shotsImpacting: countZombieEscapeShotsByPhase(state.shots, ZOMBIE_ESCAPE_SHOT_PHASE.impact),
    shotsTraveling: countZombieEscapeShotsByPhase(state.shots, ZOMBIE_ESCAPE_SHOT_PHASE.travel),
    status: state.status,
    triangles,
    night: state.night,
    wave: state.wave,
    waveRemaining:
      state.waveSpawnRemaining +
      state.replacementSpawnRemaining +
      countZombieEscapePendingBossSpawns(state) +
      state.zombies.pool.activeCount,
    waveState: state.waveState,
    weaponIndex: state.player.weaponIndex,
    weaponInventoryMask: state.player.weaponInventoryMask,
    zombies: state.zombies.pool.activeCount,
  }
}

function updatePlayer(
  state: ZombieEscapeSimulation,
  input: ZombieEscapeControlState,
  delta: number,
) {
  const player = state.player
  synchronizeZombieEscapeActiveWeaponAmmo(player)
  if (!state.externalPlayerPose) {
    const runTarget = input.run && input.moveStrength > 0 ? 1 : 0
    const runResponse = 1 - Math.exp(-10 * delta)
    player.runBlend += (runTarget - player.runBlend) * runResponse
    const speed =
      (ZOMBIE_ESCAPE_SIMULATION.walkSpeed +
        (ZOMBIE_ESCAPE_SIMULATION.runSpeed - ZOMBIE_ESCAPE_SIMULATION.walkSpeed) *
          player.runBlend) *
      input.moveStrength
    const targetVx = input.moveX * speed
    const targetVz = input.moveZ * speed
    const movementResponse = 1 - Math.exp(-14 * delta)
    player.vx += (targetVx - player.vx) * movementResponse
    player.vz += (targetVz - player.vz) * movementResponse
    if (input.moveStrength <= 0.001) {
      const braking = Math.exp(-10 * delta)
      player.vx *= braking
      player.vz *= braking
    }
    const previousX = player.x
    const previousZ = player.z
    moveZombieEscapeCircleWithSlide(
      state.collisionWorld,
      previousX,
      previousZ,
      player.vx * delta,
      player.vz * delta,
      ZOMBIE_ESCAPE_SIMULATION.playerRadius,
      state.collisionHitScratch,
      state.collisionMoveScratch,
    )
    player.x = state.collisionMoveScratch.x
    player.z = state.collisionMoveScratch.z
    if (state.collisionMoveScratch.collided) {
      player.vx = (player.x - previousX) / delta
      player.vz = (player.z - previousZ) / delta
    }
  }
  state.nearbyPickupIndex = findNearbyZombieEscapeWeaponPickup(state)
  if (
    input.interactPressed ||
    (input.inputMode === 'touch' && canAffordNearbyZombieEscapeWeapon(state))
  ) {
    tryPurchaseNearbyZombieEscapeWeapon(state)
    input.interactPressed = false
  }
  if (!state.externalPlayerPose) {
    const currentSpeed = Math.hypot(player.vx, player.vz)
    const locomotionTarget = Math.min(1, currentSpeed / ZOMBIE_ESCAPE_SIMULATION.walkSpeed)
    player.locomotionBlend +=
      (locomotionTarget - player.locomotionBlend) * (1 - Math.exp(-12 * delta))
    if (currentSpeed > 0.08) {
      player.movementHeading = Math.atan2(player.vx, player.vz)
      player.locomotionPhase += currentSpeed * delta * (1.8 + player.runBlend * 0.8)
    }
  }
  if (input.aimStrength > 0.001) player.aimAngle = Math.atan2(input.aimX, input.aimZ)
  if (!player.muzzlePoseExternal) updateDefaultMuzzlePose(player)
  player.hitSlowSeconds = Math.max(0, player.hitSlowSeconds - delta)
  player.hurtFlash = Math.max(0, player.hurtFlash - delta * 3.2)

  state.fireCooldownSeconds -= delta
  advanceZombieEscapeMelee(state, delta)
  if (state.phase === 'night' && player.meleePhase === 'idle' && input.fire) {
    if (player.ammo > 0) {
      const weaponIndex = ZOMBIE_ESCAPE_WEAPON_PROFILES[player.weaponIndex] ? player.weaponIndex : 0
      const weaponProfile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!
      while (state.fireCooldownSeconds <= 0 && player.ammo > 0) {
        fireZombieEscapeWeaponTrigger(state, weaponIndex, weaponProfile)
        state.fireCooldownSeconds += weaponProfile.shotIntervalSeconds
      }
    } else {
      startZombieEscapeMelee(state)
    }
  } else {
    state.fireCooldownSeconds = Math.max(0, state.fireCooldownSeconds)
  }
}

function fireZombieEscapeWeaponTrigger(
  state: ZombieEscapeSimulation,
  weaponIndex: number,
  profile: ZombieEscapeWeaponProfile,
) {
  const player = state.player
  const volleySequence = (state.nextShotVolleySequence + 1) >>> 0 || 1
  state.nextShotVolleySequence = volleySequence
  state.player.ammo = Math.max(0, state.player.ammo - 1)
  state.player.weaponAmmoByIndex[weaponIndex] = state.player.ammo
  state.shotsFired += 1
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
    player.muzzleX,
    player.muzzleY,
    player.muzzleZ,
    weaponIndex,
  )

  let primarySlot = -1
  let primaryGeneration = 0
  for (let volleyOrdinal = 0; volleyOrdinal < profile.pelletCount; volleyOrdinal += 1) {
    const direction = writeZombieEscapeSymmetricSpreadDirection(
      player.muzzleDirectionX,
      player.muzzleDirectionY,
      player.muzzleDirectionZ,
      volleyOrdinal,
      profile.pelletCount,
      profile.spreadRadians,
      state.weaponDirectionScratch,
    )
    const slot = spawnZombieEscapeShotCarrier(
      state,
      weaponIndex,
      profile,
      volleySequence,
      volleyOrdinal,
      direction.x,
      direction.y,
      direction.z,
    )
    if (volleyOrdinal === 0) {
      primarySlot = slot
      primaryGeneration = state.shots.pool.generation[slot] ?? 0
    }
  }
  state.lastShotGeneration = primaryGeneration
  state.lastShotSlot = primarySlot
}

function spawnZombieEscapeShotCarrier(
  state: ZombieEscapeSimulation,
  weaponIndex: number,
  profile: ZombieEscapeWeaponProfile,
  volleySequence: number,
  volleyOrdinal: number,
  directionX: number,
  directionY: number,
  directionZ: number,
) {
  const shots = state.shots
  const slot = acquireZombieEscapePoolSlot(shots.pool)
  state.multiplayer?.shotCreated(slot)
  shots.damage[slot] = profile.projectileDamage
  shots.directionX[slot] = directionX
  shots.directionY[slot] = directionY
  shots.directionZ[slot] = directionZ
  shots.hitTargetGeneration[slot] = 0
  shots.hitTargetSlot[slot] = -1
  shots.hitColliderIndex[slot] = -1
  shots.hitLocalNormalX[slot] = 0
  shots.hitLocalNormalY[slot] = 0
  shots.hitLocalNormalZ[slot] = 0
  shots.hitLocalX[slot] = 0
  shots.hitLocalY[slot] = 0
  shots.hitLocalZ[slot] = 0
  shots.hitNormalX[slot] = 0
  shots.hitNormalY[slot] = 0
  shots.hitNormalZ[slot] = 0
  shots.hitWorldGeneration[slot] = state.collisionWorldGeneration
  shots.impactAge[slot] = 0
  shots.impactKind[slot] = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.none
  shots.lastPiercedTargetGeneration[slot] = 0
  shots.lastPiercedTargetSlot[slot] = -1
  shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.travel
  shots.primary[slot] = volleyOrdinal === 0 ? 1 : 0
  shots.remainingEnemyPenetrations[slot] = Math.max(0, profile.maximumEnemyHits - 1)
  shots.travelAge[slot] = 0
  shots.volleyOrdinal[slot] = volleyOrdinal
  shots.volleySequence[slot] = volleySequence
  shots.volleySize[slot] = profile.pelletCount
  shots.weaponIndex[slot] = weaponIndex
  initializeZombieEscapeShotLaunch(state, slot, profile)
  if (
    shots.phase[slot] === ZOMBIE_ESCAPE_SHOT_PHASE.impact &&
    shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment
  ) {
    emitZombieEscapeAudioEvent(
      state.audioEvents,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
      shots.hitX[slot]!,
      shots.hitY[slot]!,
      shots.hitZ[slot]!,
    )
  }
  return slot
}

function writeZombieEscapeShotAtAuthoredMuzzle(state: ZombieEscapeSimulation, slot: number) {
  const shots = state.shots
  const player = state.player
  shots.hitX[slot] = player.muzzleX
  shots.hitY[slot] = player.muzzleY
  shots.hitZ[slot] = player.muzzleZ
  shots.originX[slot] = player.muzzleX
  shots.originY[slot] = player.muzzleY
  shots.originZ[slot] = player.muzzleZ
  shots.previousX[slot] = player.muzzleX
  shots.previousY[slot] = player.muzzleY
  shots.previousZ[slot] = player.muzzleZ
  shots.x[slot] = player.muzzleX
  shots.y[slot] = player.muzzleY
  shots.z[slot] = player.muzzleZ
}

function initializeZombieEscapeShotLaunch(
  state: ZombieEscapeSimulation,
  slot: number,
  profile: ZombieEscapeWeaponProfile,
) {
  const shots = state.shots
  const player = state.player
  const anchorX = player.x
  const anchorY = player.y + ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight
  const anchorZ = player.z
  const muzzleOffsetX = player.muzzleX - anchorX
  const muzzleOffsetY = player.muzzleY - anchorY
  const muzzleOffsetZ = player.muzzleZ - anchorZ
  const muzzleDistance = Math.hypot(muzzleOffsetX, muzzleOffsetY, muzzleOffsetZ)
  const validatesMuzzle =
    muzzleDistance > 0.000_001 &&
    muzzleDistance <= ZOMBIE_ESCAPE_MUZZLE_VALIDATION_MAXIMUM_DISTANCE_METERS

  writeZombieEscapeShotAtAuthoredMuzzle(state, slot)

  let launchSegmentStartX = anchorX
  let launchSegmentStartY = anchorY
  let launchSegmentStartZ = anchorZ
  let launchSegmentOffsetX = muzzleOffsetX
  let launchSegmentOffsetY = muzzleOffsetY
  let launchSegmentOffsetZ = muzzleOffsetZ
  let resolvesWorldHit = false
  if (validatesMuzzle) {
    let launchHitCount = 0
    while (launchHitCount < profile.maximumEnemyHits) {
      launchSegmentOffsetX = player.muzzleX - launchSegmentStartX
      launchSegmentOffsetY = player.muzzleY - launchSegmentStartY
      launchSegmentOffsetZ = player.muzzleZ - launchSegmentStartZ
      const launchSegmentDistance = Math.hypot(
        launchSegmentOffsetX,
        launchSegmentOffsetY,
        launchSegmentOffsetZ,
      )
      if (launchSegmentDistance <= 0.000_001) {
        writeZombieEscapeShotAtAuthoredMuzzle(state, slot)
        return
      }
      sweepZombieEscapeProjectileAgainstWorld(
        state.combatCollisionWorld,
        launchSegmentStartX,
        launchSegmentStartY,
        launchSegmentStartZ,
        launchSegmentOffsetX,
        launchSegmentOffsetY,
        launchSegmentOffsetZ,
        profile.projectileRadius,
        state.collisionHitScratch,
        state.projectileHitCandidateScratch,
      )
      const worldHitAmount =
        state.collisionHitScratch.colliderKind === 'none'
          ? Number.POSITIVE_INFINITY
          : state.collisionHitScratch.time
      writeNearestZombieEscapeShotEnemyIntersection(
        state,
        slot,
        launchSegmentStartX,
        launchSegmentStartY,
        launchSegmentStartZ,
        player.muzzleX,
        player.muzzleY,
        player.muzzleZ,
        profile.projectileRadius,
        worldHitAmount,
        state.projectileLaunchHitTargetSlotsScratch,
        launchHitCount,
      )
      const hitTargetSlot = state.projectileHitCandidateScratch.colliderIndex
      if (hitTargetSlot < 0) {
        if (state.collisionHitScratch.colliderKind === 'none') {
          writeZombieEscapeShotAtAuthoredMuzzle(state, slot)
          return
        }
        resolvesWorldHit = true
        break
      }
      const amount = Math.min(1, Math.max(0, state.projectileHitCandidateScratch.time))
      const hitCenterX = launchSegmentStartX + launchSegmentOffsetX * amount
      const hitCenterY = launchSegmentStartY + launchSegmentOffsetY * amount
      const hitCenterZ = launchSegmentStartZ + launchSegmentOffsetZ * amount
      state.projectileLaunchHitTargetSlotsScratch[launchHitCount] = hitTargetSlot
      launchHitCount += 1
      shots.originX[slot] = anchorX
      shots.originY[slot] = anchorY
      shots.originZ[slot] = anchorZ
      shots.previousX[slot] = anchorX
      shots.previousY[slot] = anchorY
      shots.previousZ[slot] = anchorZ
      const continuationDistance = Math.max(0.001, profile.projectileRadius * 0.1)
      const continuationAmount = Math.min(1, amount + continuationDistance / launchSegmentDistance)
      const continuationX = launchSegmentStartX + launchSegmentOffsetX * continuationAmount
      const continuationY = launchSegmentStartY + launchSegmentOffsetY * continuationAmount
      const continuationZ = launchSegmentStartZ + launchSegmentOffsetZ * continuationAmount
      const continuesPiercing = resolveZombieEscapeEnemyShotImpact(
        state,
        slot,
        profile,
        hitTargetSlot,
        launchSegmentStartX,
        launchSegmentStartY,
        launchSegmentStartZ,
        hitCenterX,
        hitCenterY,
        hitCenterZ,
        0,
        continuationX,
        continuationY,
        continuationZ,
      )
      if (!continuesPiercing) return
      launchSegmentStartX = continuationX
      launchSegmentStartY = continuationY
      launchSegmentStartZ = continuationZ
    }
    if (!resolvesWorldHit) {
      writeZombieEscapeShotAtAuthoredMuzzle(state, slot)
      return
    }
  }

  if (validatesMuzzle && resolvesWorldHit) {
    const amount = Math.min(1, Math.max(0, state.collisionHitScratch.time))
    const hitCenterX = launchSegmentStartX + launchSegmentOffsetX * amount
    const hitCenterY = launchSegmentStartY + launchSegmentOffsetY * amount
    const hitCenterZ = launchSegmentStartZ + launchSegmentOffsetZ * amount
    const normalX = state.collisionHitScratch.normalX
    const normalY = state.collisionHitScratch.normalY
    const normalZ = state.collisionHitScratch.normalZ
    shots.hitColliderIndex[slot] = state.collisionHitScratch.colliderIndex
    shots.hitNormalX[slot] = normalX
    shots.hitNormalY[slot] = normalY
    shots.hitNormalZ[slot] = normalZ
    shots.hitX[slot] = hitCenterX - normalX * profile.projectileRadius
    shots.hitY[slot] = hitCenterY - normalY * profile.projectileRadius
    shots.hitZ[slot] = hitCenterZ - normalZ * profile.projectileRadius
    shots.impactKind[slot] = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment
    shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.impact
    shots.originX[slot] = anchorX
    shots.originY[slot] = anchorY
    shots.originZ[slot] = anchorZ
    shots.previousX[slot] = anchorX
    shots.previousY[slot] = anchorY
    shots.previousZ[slot] = anchorZ
    shots.x[slot] = hitCenterX
    shots.y[slot] = hitCenterY
    shots.z[slot] = hitCenterZ
    emitZombieEscapeWeaponImpactEvent(
      state,
      profile.mechanic === 'blast'
        ? ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast
        : profile.mechanic === 'piercing'
          ? ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing
          : ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
      shots.weaponIndex[slot]!,
      shots.damage[slot]!,
      launchSegmentStartX,
      launchSegmentStartY,
      launchSegmentStartZ,
      shots.hitX[slot]!,
      shots.hitY[slot]!,
      shots.hitZ[slot]!,
      normalX,
      normalY,
      normalZ,
      -1,
      0,
    )
    if (profile.mechanic === 'blast') {
      resolveZombieEscapeLauncherBlast(
        state,
        -1,
        shots.hitX[slot]!,
        shots.hitY[slot]!,
        shots.hitZ[slot]!,
        normalX,
        normalY,
        normalZ,
        profile,
        shots.weaponIndex[slot]!,
      )
    }
    return
  }
}

function writeNearestZombieEscapeShotEnemyIntersection(
  state: ZombieEscapeSimulation,
  slot: number,
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  projectileRadius: number,
  maximumAmount: number,
  excludedTargetSlots: Int32Array | null,
  excludedTargetCount: number,
) {
  const shots = state.shots
  const zombies = state.zombies
  const result = state.projectileHitCandidateScratch
  result.colliderIndex = -1
  result.time = maximumAmount
  for (let zombie = 0; zombie < zombies.pool.capacity; zombie += 1) {
    if (zombies.pool.active[zombie] === 0 || zombies.health[zombie]! <= 0) continue
    if (
      zombie === shots.lastPiercedTargetSlot[slot] &&
      zombies.pool.generation[zombie] === shots.lastPiercedTargetGeneration[slot]
    ) {
      continue
    }
    let excluded = false
    if (excludedTargetSlots !== null) {
      for (let index = 0; index < excludedTargetCount; index += 1) {
        if (excludedTargetSlots[index] !== zombie) continue
        excluded = true
        break
      }
    }
    if (excluded) continue
    const zombieCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[zombie]!)
    const amount = segmentVerticalCapsuleFirstIntersectionAmount(
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      zombies.x[zombie]!,
      zombies.z[zombie]!,
      zombies.y[zombie]! + zombieCatalogEntry.capsule.radiusMeters,
      zombies.y[zombie]! +
        zombieCatalogEntry.capsule.radiusMeters +
        zombieCatalogEntry.capsule.segmentLengthMeters,
      zombieCatalogEntry.capsule.radiusMeters + projectileRadius,
    )
    if (amount >= result.time) continue
    result.colliderIndex = zombie
    result.time = amount
  }
}

function resolveZombieEscapeEnemyShotImpact(
  state: ZombieEscapeSimulation,
  slot: number,
  profile: ZombieEscapeWeaponProfile,
  hitTargetSlot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  hitCenterX: number,
  hitCenterY: number,
  hitCenterZ: number,
  impactAge: number,
  piercingContinuationX: number,
  piercingContinuationY: number,
  piercingContinuationZ: number,
) {
  const shots = state.shots
  const targetGeneration = state.zombies.pool.generation[hitTargetSlot] ?? 0
  const weaponIndex = shots.weaponIndex[slot]!
  const continuesPiercing =
    profile.mechanic === 'piercing' && shots.remainingEnemyPenetrations[slot]! > 0
  const impactEventSlot = emitZombieEscapeWeaponImpactEvent(
    state,
    profile.mechanic === 'piercing'
      ? ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing
      : profile.mechanic === 'blast'
        ? ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast
        : ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
    ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
    weaponIndex,
    shots.damage[slot]!,
    sourceX,
    sourceY,
    sourceZ,
    hitCenterX,
    hitCenterY,
    hitCenterZ,
    0,
    0,
    0,
    hitTargetSlot,
    targetGeneration,
  )
  if (!continuesPiercing) {
    shots.x[slot] = hitCenterX
    shots.y[slot] = hitCenterY
    shots.z[slot] = hitCenterZ
    shots.hitColliderIndex[slot] = -1
    shots.hitTargetSlot[slot] = hitTargetSlot
    shots.hitTargetGeneration[slot] = targetGeneration
    shots.impactAge[slot] = impactAge
    shots.impactKind[slot] = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy
    shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.impact
    shots.hitWorldGeneration[slot] = state.collisionWorldGeneration
  }
  writeZombieEscapeZombieHitAttachment(
    state,
    continuesPiercing ? -1 : slot,
    impactEventSlot,
    hitTargetSlot,
    hitCenterX,
    hitCenterY,
    hitCenterZ,
    shots.directionX[slot]!,
    shots.directionY[slot]!,
    shots.directionZ[slot]!,
  )
  const eventX = state.impactEvents.x[impactEventSlot]!
  const eventY = state.impactEvents.y[impactEventSlot]!
  const eventZ = state.impactEvents.z[impactEventSlot]!
  applyZombieDamage(
    state,
    hitTargetSlot,
    'projectile',
    shots.damage[slot]!,
    shots.directionX[slot]! * profile.presentationImpulseScale,
    shots.directionY[slot]! * profile.presentationImpulseScale,
    shots.directionZ[slot]! * profile.presentationImpulseScale,
    eventX,
    eventY,
    eventZ,
  )
  if (continuesPiercing) {
    shots.remainingEnemyPenetrations[slot] = Math.max(
      0,
      shots.remainingEnemyPenetrations[slot]! - 1,
    )
    shots.lastPiercedTargetSlot[slot] = hitTargetSlot
    shots.lastPiercedTargetGeneration[slot] = targetGeneration
    shots.x[slot] = piercingContinuationX
    shots.y[slot] = piercingContinuationY
    shots.z[slot] = piercingContinuationZ
    return true
  }
  const hitNormalX = shots.hitNormalX[slot]!
  const hitNormalY = shots.hitNormalY[slot]!
  const hitNormalZ = shots.hitNormalZ[slot]!
  if (profile.mechanic === 'chain') {
    resolveZombieEscapeChainContacts(
      state,
      hitTargetSlot,
      eventX,
      eventY,
      eventZ,
      profile,
      weaponIndex,
    )
  } else if (profile.mechanic === 'blast') {
    resolveZombieEscapeLauncherBlast(
      state,
      hitTargetSlot,
      eventX,
      eventY,
      eventZ,
      hitNormalX,
      hitNormalY,
      hitNormalZ,
      profile,
      weaponIndex,
    )
  }
  return false
}

function updateShots(state: ZombieEscapeSimulation, delta: number) {
  const shots = state.shots
  if (shots.pool.activeCount === 0) return
  for (let slot = 0; slot < shots.pool.capacity; slot += 1) {
    if (shots.pool.active[slot] === 0) continue
    if (shots.phase[slot] === ZOMBIE_ESCAPE_SHOT_PHASE.impact) {
      shots.impactAge[slot] = shots.impactAge[slot]! + delta
      if (shots.impactAge[slot]! >= ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds) {
        shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.inactive
        releaseZombieEscapePoolSlot(shots.pool, slot)
      }
      continue
    }
    if (shots.phase[slot] !== ZOMBIE_ESCAPE_SHOT_PHASE.travel) continue
    state.multiplayer?.selectShotOwner(slot)
    updateTravelingShot(state, slot, delta)
  }
}

function updateTravelingShot(state: ZombieEscapeSimulation, slot: number, delta: number) {
  const shots = state.shots
  const weaponIndex = shots.weaponIndex[slot]!
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex] ?? ZOMBIE_ESCAPE_WEAPON_PROFILES[0]
  const previousX = shots.x[slot]!
  const previousY = shots.y[slot]!
  const previousZ = shots.z[slot]!
  shots.previousX[slot] = previousX
  shots.previousY[slot] = previousY
  shots.previousZ[slot] = previousZ

  const remainingLifetime = Math.max(0, profile.projectileLifetimeSeconds - shots.travelAge[slot]!)
  const travelDelta = Math.min(delta, remainingLifetime)
  const travelDistance = profile.projectileSpeed * travelDelta
  const nextX = previousX + shots.directionX[slot]! * travelDistance
  const nextY = previousY + shots.directionY[slot]! * travelDistance
  const nextZ = previousZ + shots.directionZ[slot]! * travelDistance

  const expiresThisStep = remainingLifetime <= delta
  let hitAmount = Number.POSITIVE_INFINITY
  let impactKind: ZombieEscapeShotImpactKind = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.none
  let hitTargetSlot = -1
  let hitColliderIndex = -1
  let hitNormalX = 0
  let hitNormalY = 0
  let hitNormalZ = 0

  sweepZombieEscapeProjectileAgainstWorld(
    state.combatCollisionWorld,
    previousX,
    previousY,
    previousZ,
    nextX - previousX,
    nextY - previousY,
    nextZ - previousZ,
    profile.projectileRadius,
    state.collisionHitScratch,
    state.projectileHitCandidateScratch,
  )
  if (state.collisionHitScratch.colliderKind !== 'none') {
    hitAmount = state.collisionHitScratch.time
    impactKind = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment
    hitColliderIndex = state.collisionHitScratch.colliderIndex
    hitNormalX = state.collisionHitScratch.normalX
    hitNormalY = state.collisionHitScratch.normalY
    hitNormalZ = state.collisionHitScratch.normalZ
  }

  writeNearestZombieEscapeShotEnemyIntersection(
    state,
    slot,
    previousX,
    previousY,
    previousZ,
    nextX,
    nextY,
    nextZ,
    profile.projectileRadius,
    hitAmount,
    null,
    0,
  )
  if (state.projectileHitCandidateScratch.colliderIndex >= 0) {
    hitAmount = state.projectileHitCandidateScratch.time
    impactKind = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy
    hitTargetSlot = state.projectileHitCandidateScratch.colliderIndex
  }

  if (!Number.isFinite(hitAmount)) {
    shots.x[slot] = nextX
    shots.y[slot] = nextY
    shots.z[slot] = nextZ
    shots.travelAge[slot] = shots.travelAge[slot]! + travelDelta
    if (expiresThisStep) {
      shots.impactKind[slot] = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired
      shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.inactive
      releaseZombieEscapePoolSlot(shots.pool, slot)
    }
    return
  }

  const resolvedAmount = Math.min(1, Math.max(0, hitAmount))
  const hitCenterX = previousX + (nextX - previousX) * resolvedAmount
  const hitCenterY = previousY + (nextY - previousY) * resolvedAmount
  const hitCenterZ = previousZ + (nextZ - previousZ) * resolvedAmount
  const consumedDelta = travelDelta * resolvedAmount
  shots.travelAge[slot] = shots.travelAge[slot]! + consumedDelta

  if (hitTargetSlot >= 0) {
    const continuationOffset = Math.max(0.001, profile.projectileRadius * 0.1)
    const continuesPiercing = resolveZombieEscapeEnemyShotImpact(
      state,
      slot,
      profile,
      hitTargetSlot,
      previousX,
      previousY,
      previousZ,
      hitCenterX,
      hitCenterY,
      hitCenterZ,
      Math.max(0, delta - consumedDelta),
      hitCenterX + shots.directionX[slot]! * continuationOffset,
      hitCenterY + shots.directionY[slot]! * continuationOffset,
      hitCenterZ + shots.directionZ[slot]! * continuationOffset,
    )
    if (continuesPiercing) return
    hitNormalX = shots.hitNormalX[slot]!
    hitNormalY = shots.hitNormalY[slot]!
    hitNormalZ = shots.hitNormalZ[slot]!
  } else {
    shots.x[slot] = hitCenterX
    shots.y[slot] = hitCenterY
    shots.z[slot] = hitCenterZ
    shots.hitColliderIndex[slot] = hitColliderIndex
    shots.hitTargetSlot[slot] = -1
    shots.hitTargetGeneration[slot] = 0
    shots.impactAge[slot] = Math.max(0, delta - consumedDelta)
    shots.impactKind[slot] = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment
    shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.impact
    shots.hitWorldGeneration[slot] = state.collisionWorldGeneration
    shots.hitX[slot] = hitCenterX - hitNormalX * profile.projectileRadius
    shots.hitY[slot] = hitCenterY - hitNormalY * profile.projectileRadius
    shots.hitZ[slot] = hitCenterZ - hitNormalZ * profile.projectileRadius
    emitZombieEscapeWeaponImpactEvent(
      state,
      profile.mechanic === 'blast'
        ? ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast
        : profile.mechanic === 'piercing'
          ? ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing
          : ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
      weaponIndex,
      shots.damage[slot]!,
      previousX,
      previousY,
      previousZ,
      shots.hitX[slot]!,
      shots.hitY[slot]!,
      shots.hitZ[slot]!,
      hitNormalX,
      hitNormalY,
      hitNormalZ,
      -1,
      0,
    )
    if (profile.mechanic === 'blast') {
      resolveZombieEscapeLauncherBlast(
        state,
        -1,
        shots.hitX[slot]!,
        shots.hitY[slot]!,
        shots.hitZ[slot]!,
        hitNormalX,
        hitNormalY,
        hitNormalZ,
        profile,
        weaponIndex,
      )
    }
    emitZombieEscapeAudioEvent(
      state.audioEvents,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
      shots.hitX[slot]!,
      shots.hitY[slot]!,
      shots.hitZ[slot]!,
    )
  }
  shots.hitNormalX[slot] = hitNormalX
  shots.hitNormalY[slot] = hitNormalY
  shots.hitNormalZ[slot] = hitNormalZ
  if (shots.impactAge[slot]! >= ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds) {
    shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.inactive
    releaseZombieEscapePoolSlot(shots.pool, slot)
  }
}

function emitZombieEscapeWeaponImpactEvent(
  state: ZombieEscapeSimulation,
  effectKind: ZombieEscapeWeaponImpactEffectKind,
  impactKind: ZombieEscapeShotImpactKind,
  weaponIndex: number,
  damage: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  x: number,
  y: number,
  z: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  targetSlot: number,
  targetGeneration: number,
) {
  const events = state.impactEvents
  const slot = acquireZombieEscapePoolSlot(events.pool)
  events.age[slot] = 0
  events.damage[slot] = damage
  events.effectKind[slot] = effectKind
  events.hitLocalNormalX[slot] = 0
  events.hitLocalNormalY[slot] = 0
  events.hitLocalNormalZ[slot] = 0
  events.hitLocalX[slot] = 0
  events.hitLocalY[slot] = 0
  events.hitLocalZ[slot] = 0
  events.hitWorldGeneration[slot] = state.collisionWorldGeneration
  events.impactKind[slot] = impactKind
  events.normalX[slot] = normalX
  events.normalY[slot] = normalY
  events.normalZ[slot] = normalZ
  events.sourceX[slot] = sourceX
  events.sourceY[slot] = sourceY
  events.sourceZ[slot] = sourceZ
  events.targetGeneration[slot] = targetGeneration
  events.targetSlot[slot] = targetSlot
  events.weaponIndex[slot] = weaponIndex
  events.x[slot] = x
  events.y[slot] = y
  events.z[slot] = z
  return slot
}

function resolveZombieEscapeChainContacts(
  state: ZombieEscapeSimulation,
  primaryTargetSlot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  profile: ZombieEscapeWeaponProfile,
  weaponIndex: number,
) {
  const zombies = state.zombies
  const maximumDistanceSquared = profile.chainRadiusMeters * profile.chainRadiusMeters
  let previousTargetSlot = -1
  for (let link = 0; link < profile.chainTargetCount; link += 1) {
    let targetSlot = -1
    let targetDistanceSquared = Number.POSITIVE_INFINITY
    for (let candidate = 0; candidate < zombies.pool.capacity; candidate += 1) {
      if (
        candidate === primaryTargetSlot ||
        candidate === previousTargetSlot ||
        zombies.pool.active[candidate] === 0 ||
        zombies.health[candidate]! <= 0
      ) {
        continue
      }
      const candidateCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[candidate]!)
      const candidateY = zombies.y[candidate]! + candidateCatalogEntry.characterHeightMeters * 0.55
      const offsetX = zombies.x[candidate]! - sourceX
      const offsetY = candidateY - sourceY
      const offsetZ = zombies.z[candidate]! - sourceZ
      const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ
      if (
        distanceSquared > maximumDistanceSquared ||
        !zombieEscapeTargetPrecedesByDistance(
          distanceSquared,
          candidate,
          targetDistanceSquared,
          targetSlot,
        )
      ) {
        continue
      }
      if (
        !zombieEscapeSegmentIsClearInVerticalRange(
          state.combatCollisionWorld,
          sourceX,
          sourceZ,
          zombies.x[candidate]!,
          zombies.z[candidate]!,
          0.02,
          Math.min(sourceY, candidateY) - 0.04,
          Math.max(sourceY, candidateY) + 0.04,
          state.collisionHitScratch,
        )
      ) {
        continue
      }
      targetSlot = candidate
      targetDistanceSquared = distanceSquared
    }
    if (targetSlot < 0) break

    const targetCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[targetSlot]!)
    const targetX = zombies.x[targetSlot]!
    const targetY = zombies.y[targetSlot]! + targetCatalogEntry.characterHeightMeters * 0.55
    const targetZ = zombies.z[targetSlot]!
    const directionLength = Math.max(
      0.000_001,
      Math.hypot(targetX - sourceX, targetY - sourceY, targetZ - sourceZ),
    )
    const directionX = (targetX - sourceX) / directionLength
    const directionY = (targetY - sourceY) / directionLength
    const directionZ = (targetZ - sourceZ) / directionLength
    const damage = profile.projectileDamage * profile.chainDamageScale
    const targetGeneration = zombies.pool.generation[targetSlot] ?? 0
    const eventSlot = emitZombieEscapeWeaponImpactEvent(
      state,
      ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain,
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      weaponIndex,
      damage,
      sourceX,
      sourceY,
      sourceZ,
      targetX,
      targetY,
      targetZ,
      0,
      0,
      0,
      targetSlot,
      targetGeneration,
    )
    writeZombieEscapeZombieHitAttachment(
      state,
      -1,
      eventSlot,
      targetSlot,
      targetX,
      targetY,
      targetZ,
      directionX,
      directionY,
      directionZ,
    )
    applyZombieDamage(
      state,
      targetSlot,
      'projectile',
      damage,
      directionX,
      directionY,
      directionZ,
      state.impactEvents.x[eventSlot]!,
      state.impactEvents.y[eventSlot]!,
      state.impactEvents.z[eventSlot]!,
    )
    previousTargetSlot = targetSlot
  }
}

function resolveZombieEscapeLauncherBlast(
  state: ZombieEscapeSimulation,
  directTargetSlot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  sourceNormalX: number,
  sourceNormalY: number,
  sourceNormalZ: number,
  profile: ZombieEscapeWeaponProfile,
  weaponIndex: number,
) {
  const zombies = state.zombies
  const visibilityStartX = sourceX + sourceNormalX * 0.03
  const visibilityStartZ = sourceZ + sourceNormalZ * 0.03
  for (let targetSlot = 0; targetSlot < zombies.pool.capacity; targetSlot += 1) {
    if (
      targetSlot === directTargetSlot ||
      zombies.pool.active[targetSlot] === 0 ||
      zombies.health[targetSlot]! <= 0
    ) {
      continue
    }
    const targetCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[targetSlot]!)
    const targetX = zombies.x[targetSlot]!
    const targetY = zombies.y[targetSlot]! + targetCatalogEntry.characterHeightMeters * 0.55
    const targetZ = zombies.z[targetSlot]!
    const offsetX = targetX - sourceX
    const offsetY = targetY - sourceY
    const offsetZ = targetZ - sourceZ
    const distance = Math.hypot(offsetX, offsetY, offsetZ)
    const damageScale = resolveZombieEscapeRadialDamageScale(
      distance,
      profile.blastRadiusMeters,
      profile.blastMinimumDamageScale,
    )
    if (damageScale <= 0) continue
    if (
      !zombieEscapeSegmentIsClearInVerticalRange(
        state.combatCollisionWorld,
        visibilityStartX,
        visibilityStartZ,
        targetX,
        targetZ,
        0.02,
        Math.min(sourceY, targetY) - 0.04,
        Math.max(sourceY, targetY) + 0.04,
        state.collisionHitScratch,
      )
    ) {
      continue
    }
    const inverseDistance = 1 / Math.max(0.000_001, distance)
    const directionX = distance > 0.000_001 ? offsetX * inverseDistance : sourceNormalX
    const directionY = distance > 0.000_001 ? offsetY * inverseDistance : sourceNormalY
    const directionZ = distance > 0.000_001 ? offsetZ * inverseDistance : sourceNormalZ
    const damage = profile.projectileDamage * damageScale
    const targetGeneration = zombies.pool.generation[targetSlot] ?? 0
    const eventSlot = emitZombieEscapeWeaponImpactEvent(
      state,
      ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim,
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      weaponIndex,
      damage,
      sourceX,
      sourceY,
      sourceZ,
      targetX,
      targetY,
      targetZ,
      0,
      0,
      0,
      targetSlot,
      targetGeneration,
    )
    writeZombieEscapeZombieHitAttachment(
      state,
      -1,
      eventSlot,
      targetSlot,
      targetX,
      targetY,
      targetZ,
      directionX,
      directionY,
      directionZ,
    )
    applyZombieDamage(
      state,
      targetSlot,
      'projectile',
      damage,
      directionX * profile.presentationImpulseScale,
      directionY * profile.presentationImpulseScale,
      directionZ * profile.presentationImpulseScale,
      state.impactEvents.x[eventSlot]!,
      state.impactEvents.y[eventSlot]!,
      state.impactEvents.z[eventSlot]!,
    )
  }
}

function applyZombieDamage(
  state: ZombieEscapeSimulation,
  zombieSlot: number,
  source: 'melee' | 'projectile',
  damage: number,
  impulseX: number,
  impulseY: number,
  impulseZ: number,
  eventX: number,
  eventY: number,
  eventZ: number,
) {
  const zombies = state.zombies
  if (zombies.health[zombieSlot]! <= 0) return false
  zombies.health[zombieSlot] = zombies.health[zombieSlot]! - damage
  zombies.hitFlash[zombieSlot] = 1
  zombies.hitReaction[zombieSlot] = Math.min(1, zombies.hitReaction[zombieSlot]! + 0.82)
  zombies.hitImpulseX[zombieSlot] = impulseX
  zombies.hitImpulseY[zombieSlot] = impulseY
  zombies.hitImpulseZ[zombieSlot] = impulseZ
  const variant = zombies.variant[zombieSlot]!
  if (zombies.health[zombieSlot]! > 0) {
    if (source === 'projectile') {
      const projectileHitOrdinal = zombies.projectileHitOrdinal[zombieSlot]!
      zombies.projectileHitOrdinal[zombieSlot] = projectileHitOrdinal + 1
      const movement = getZombieEscapeZombieCatalogEntry(variant).movement
      const slowdownMultiplier =
        projectileHitOrdinal === 0
          ? resolveZombieEscapeFirstProjectileSlowdownMultiplier(
              state.seed,
              zombies.spawnOrdinal[zombieSlot]!,
              movement.walkMetersPerSecond + state.wave * 0.06,
              movement.runMetersPerSecond + state.wave * 0.18,
            )
          : resolveZombieEscapeProjectileSlowdownMultiplier(
              state.seed,
              zombies.spawnOrdinal[zombieSlot]!,
              projectileHitOrdinal,
            )
      zombies.speedScale[zombieSlot] = Math.fround(
        zombies.speedScale[zombieSlot]! * slowdownMultiplier,
      )
    }
    emitZombieEscapeAudioEvent(
      state.audioEvents,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyHit,
      eventX,
      eventY,
      eventZ,
      variant,
    )
    return true
  }
  zombies.health[zombieSlot] = 0
  cancelZombieEscapeNavigationIntentDemand(state, zombieSlot)
  zombies.navigationIntentUrgentRefreshUsed[zombieSlot] = 0
  zombies.deathPresentationSeconds[zombieSlot] =
    ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds
  state.currentNightKills += 1
  state.kills += 1
  state.money += ZOMBIE_ESCAPE_SIMULATION.killReward
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyKilled,
    eventX,
    eventY,
    eventZ,
    variant,
  )
  return true
}

function startZombieEscapeMelee(state: ZombieEscapeSimulation) {
  const player = state.player
  player.meleeHitResolved = false
  player.meleePhase = 'windup'
  player.meleePhaseSeconds = 0
  player.meleeSequence += 1
  player.meleeTargetGeneration = 0
  player.meleeTargetSlot = -1
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.meleeSwing,
    player.x,
    player.y + ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight,
    player.z,
    player.weaponIndex,
  )
}

function resetZombieEscapeMeleeState(player: ZombieEscapePlayerState) {
  player.meleeHitResolved = false
  player.meleePhase = 'idle'
  player.meleePhaseSeconds = 0
  player.meleeTargetGeneration = 0
  player.meleeTargetSlot = -1
}

function advanceZombieEscapeMelee(state: ZombieEscapeSimulation, delta: number) {
  const player = state.player
  if (state.phase !== 'night') {
    if (player.meleePhase !== 'idle') resetZombieEscapeMeleeState(player)
    return
  }
  let remaining = delta
  while (remaining > 0.000_001 && player.meleePhase !== 'idle') {
    const duration = getZombieEscapeMeleePhaseDuration(player.meleePhase)
    const previousProgress = player.meleePhaseSeconds / duration
    const consumed = Math.min(remaining, duration - player.meleePhaseSeconds)
    player.meleePhaseSeconds += consumed
    remaining -= consumed
    const nextProgress = player.meleePhaseSeconds / duration
    if (
      player.meleePhase === 'active' &&
      !player.meleeHitResolved &&
      previousProgress < ZOMBIE_ESCAPE_MELEE_HIT_ACTIVE_PROGRESS &&
      nextProgress >= ZOMBIE_ESCAPE_MELEE_HIT_ACTIVE_PROGRESS
    ) {
      player.meleeHitResolved = true
      resolveZombieEscapeMeleeHit(state)
    }
    if (player.meleePhaseSeconds + 0.000_001 < duration) break
    if (player.meleePhase === 'windup') {
      player.meleePhase = 'active'
      player.meleePhaseSeconds = 0
      player.meleeHitResolved = false
    } else if (player.meleePhase === 'active') {
      player.meleePhase = 'recovery'
      player.meleePhaseSeconds = 0
    } else {
      resetZombieEscapeMeleeState(player)
    }
  }
}

function getZombieEscapeMeleePhaseDuration(phase: ZombieEscapeMeleePhase) {
  if (phase === 'windup') return ZOMBIE_ESCAPE_MELEE.windupSeconds
  if (phase === 'active') return ZOMBIE_ESCAPE_MELEE.activeSeconds
  return ZOMBIE_ESCAPE_MELEE.recoverySeconds
}

function resolveZombieEscapeMeleeHit(state: ZombieEscapeSimulation) {
  const player = state.player
  const zombies = state.zombies
  const aimX = Math.sin(player.aimAngle)
  const aimZ = Math.cos(player.aimAngle)
  const minimumDot = Math.cos(ZOMBIE_ESCAPE_MELEE.halfAngleRadians)
  const maximumDistanceSquared = ZOMBIE_ESCAPE_MELEE.rangeMeters ** 2
  let targetSlot = -1
  let targetDistanceSquared = Number.POSITIVE_INFINITY
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) continue
    const offsetX = zombies.x[slot]! - player.x
    const offsetZ = zombies.z[slot]! - player.z
    const zombieCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[slot]!)
    if (
      !resolveZombieEscapeCombatVerticalRange(
        player.y,
        zombies.y[slot]!,
        zombieCatalogEntry.characterHeightMeters,
        state.combatVerticalRangeScratch,
      )
    ) {
      continue
    }
    const distanceSquared = offsetX * offsetX + offsetZ * offsetZ
    if (distanceSquared > maximumDistanceSquared || distanceSquared >= targetDistanceSquared)
      continue
    const distance = Math.sqrt(Math.max(0.000_001, distanceSquared))
    if ((offsetX * aimX + offsetZ * aimZ) / distance < minimumDot) continue
    if (
      !zombieEscapeSegmentIsClearInVerticalRange(
        state.combatCollisionWorld,
        player.x,
        player.z,
        zombies.x[slot]!,
        zombies.z[slot]!,
        0.04,
        state.combatVerticalRangeScratch.minimumY,
        state.combatVerticalRangeScratch.maximumY,
        state.collisionHitScratch,
      )
    ) {
      continue
    }
    targetSlot = slot
    targetDistanceSquared = distanceSquared
  }
  if (targetSlot < 0) return
  player.meleeTargetSlot = targetSlot
  player.meleeTargetGeneration = zombies.pool.generation[targetSlot] ?? 0
  const targetCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[targetSlot]!)
  applyZombieDamage(
    state,
    targetSlot,
    'melee',
    ZOMBIE_ESCAPE_MELEE.damage,
    aimX,
    0.18,
    aimZ,
    zombies.x[targetSlot]!,
    zombies.y[targetSlot]! + targetCatalogEntry.characterHeightMeters * 0.55,
    zombies.z[targetSlot]!,
  )
}

function writeZombieEscapeZombieHitAttachment(
  state: ZombieEscapeSimulation,
  shotSlot: number,
  impactEventSlot: number,
  zombieSlot: number,
  hitX: number,
  hitY: number,
  hitZ: number,
  shotDirectionX: number,
  shotDirectionY: number,
  shotDirectionZ: number,
) {
  const zombies = state.zombies
  const shots = state.shots
  const impactEvents = state.impactEvents
  const zombieX = zombies.x[zombieSlot]!
  const zombieY = zombies.y[zombieSlot]!
  const zombieZ = zombies.z[zombieSlot]!
  const zombieCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[zombieSlot]!)
  const radius = zombieCatalogEntry.capsule.radiusMeters
  const axisStartY = zombieY + radius
  const axisEndY = zombieY + radius + zombieCatalogEntry.capsule.segmentLengthMeters
  const axisY = Math.max(axisStartY, Math.min(axisEndY, hitY))
  let normalX = hitX - zombieX
  let normalY = hitY - axisY
  let normalZ = hitZ - zombieZ
  const normalLength = Math.hypot(normalX, normalY, normalZ)
  if (normalLength <= 0.000_001) {
    normalX = -shotDirectionX
    normalY = -shotDirectionY
    normalZ = -shotDirectionZ
  } else {
    const inverseLength = 1 / normalLength
    normalX *= inverseLength
    normalY *= inverseLength
    normalZ *= inverseLength
  }

  const surfaceX = zombieX + normalX * radius
  const surfaceY = axisY + normalY * radius
  const surfaceZ = zombieZ + normalZ * radius
  const presentationPose = resolveZombieEscapePresentationPose(
    zombieX,
    zombieY,
    zombieZ,
    zombies.heading[zombieSlot]!,
    zombies.hitReaction[zombieSlot]!,
    zombies.hitImpulseX[zombieSlot]!,
    zombies.hitImpulseY[zombieSlot]!,
    zombies.hitImpulseZ[zombieSlot]!,
    state.presentationPoseScratch,
    zombieCatalogEntry.characterHeightMeters * 0.5,
    0,
    zombies.spawnOrdinal[zombieSlot] ?? 0,
  )
  const attachment = captureZombieEscapeImpactAttachment(
    surfaceX,
    surfaceY,
    surfaceZ,
    normalX,
    normalY,
    normalZ,
    presentationPose,
    state.impactAttachmentScratch,
  )
  if (shotSlot >= 0) {
    shots.hitX[shotSlot] = surfaceX
    shots.hitY[shotSlot] = surfaceY
    shots.hitZ[shotSlot] = surfaceZ
    shots.hitLocalX[shotSlot] = attachment.x
    shots.hitLocalY[shotSlot] = attachment.y
    shots.hitLocalZ[shotSlot] = attachment.z
    shots.hitLocalNormalX[shotSlot] = attachment.normalX
    shots.hitLocalNormalY[shotSlot] = attachment.normalY
    shots.hitLocalNormalZ[shotSlot] = attachment.normalZ
    shots.hitNormalX[shotSlot] = normalX
    shots.hitNormalY[shotSlot] = normalY
    shots.hitNormalZ[shotSlot] = normalZ
  }
  if (impactEventSlot >= 0) {
    impactEvents.x[impactEventSlot] = surfaceX
    impactEvents.y[impactEventSlot] = surfaceY
    impactEvents.z[impactEventSlot] = surfaceZ
    impactEvents.hitLocalX[impactEventSlot] = attachment.x
    impactEvents.hitLocalY[impactEventSlot] = attachment.y
    impactEvents.hitLocalZ[impactEventSlot] = attachment.z
    impactEvents.hitLocalNormalX[impactEventSlot] = attachment.normalX
    impactEvents.hitLocalNormalY[impactEventSlot] = attachment.normalY
    impactEvents.hitLocalNormalZ[impactEventSlot] = attachment.normalZ
    impactEvents.normalX[impactEventSlot] = normalX
    impactEvents.normalY[impactEventSlot] = normalY
    impactEvents.normalZ[impactEventSlot] = normalZ
  }
}

export function scheduleZombieEscapeNavigationIntentResolutions(
  active: Uint8Array,
  health: Float32Array,
  navigationConnector: Int16Array,
  _navigationIntentValid: Uint8Array,
  navigationIntentPending: Uint8Array,
  navigationIntentResolveCursor: number,
  navigationIntentResolveScheduled: Uint8Array,
  maximumResolveCount: number = ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
  navigationIntentResolveEligible?: Uint8Array,
) {
  const capacity = active.length
  navigationIntentResolveScheduled.fill(0)
  if (capacity === 0) return 0

  const resolveBudget = Math.min(capacity, Math.max(0, Math.trunc(maximumResolveCount)))
  const normalizedCursor = Number.isFinite(navigationIntentResolveCursor)
    ? Math.trunc(navigationIntentResolveCursor)
    : 0
  let slot = ((normalizedCursor % capacity) + capacity) % capacity
  let scannedCount = 0
  let scheduledCount = 0
  while (scannedCount < capacity && scheduledCount < resolveBudget) {
    if (
      active[slot] !== 0 &&
      (health[slot] ?? 0) > 0 &&
      (navigationConnector[slot] ?? -1) < 0 &&
      navigationIntentPending[slot] !== 0 &&
      navigationIntentResolveEligible?.[slot] !== 0
    ) {
      navigationIntentResolveScheduled[slot] = 1
      scheduledCount += 1
    }
    slot = (slot + 1) % capacity
    scannedCount += 1
  }
  return slot
}

export function resolveZombieEscapeSparseSharedWorkBudgetLimit(
  maximumPerTick: number,
  consumedThisTick: number,
  reservedCommonWorkSlices: number,
) {
  const minimumWork = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMinimumWorkUnitsPerAgentSlice
  return Math.max(
    0,
    Math.trunc(maximumPerTick) -
      Math.max(0, Math.trunc(consumedThisTick)) -
      Math.max(0, Math.trunc(reservedCommonWorkSlices)) * minimumWork,
  )
}

export function resolveZombieEscapeSparseAgentWorkBudgetLimit(
  maximumPerAgentSlice: number,
  maximumPerTick: number,
  consumedThisTick: number,
  remainingAgentSlicesIncludingCurrent: number,
  reservedTailSlices: number,
) {
  const minimumWork = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMinimumWorkUnitsPerAgentSlice
  const futureReservedSlices =
    Math.max(0, Math.trunc(remainingAgentSlicesIncludingCurrent) - 1) +
    Math.max(0, Math.trunc(reservedTailSlices))
  return Math.min(
    Math.max(0, Math.trunc(maximumPerAgentSlice)),
    Math.max(
      0,
      Math.trunc(maximumPerTick) -
        Math.max(0, Math.trunc(consumedThisTick)) -
        futureReservedSlices * minimumWork,
    ),
  )
}

function resetZombieEscapeNavigationIntentScheduler(state: ZombieEscapeSimulation) {
  resetZombieEscapeObstacleDeltaMetrics(state.obstacleDeltaMetrics)
  state.obstacleDeltaRequestResult.applied = false
  state.obstacleDeltaRequestResult.appliedRevision = 0
  state.obstacleDeltaRequestResult.objectId = null
  state.obstacleDeltaRequestResult.requestedRevision = 0
  state.navigationAnchorInvalidationCount = 0
  state.navigationAnchoredAgentCount = 0
  state.navigationIntentCanceledCount = 0
  state.navigationIntentDemandCachedAnchorLostCount = 0
  state.navigationIntentDemandCollisionRecoveryCount = 0
  state.navigationIntentDemandConnectorChangedCount = 0
  state.navigationIntentDemandRoutePublishedCount = 0
  state.navigationIntentDemandSpawnCount = 0
  state.navigationIntentDemandWorldChangedCount = 0
  state.navigationIntentIssuedCount = 0
  state.navigationIntentFirstServiceCount = 0
  state.navigationIntentInlineRecoveryWithoutFirstServiceCount = 0
  state.navigationIntentMaximumResolveCountObservedPerTick = 0
  state.navigationIntentMaximumUnservicedAgeTicksObserved = 0
  state.navigationIntentOldestPendingAgeTicks = 0
  state.navigationIntentOldestUnservicedAgeTicks = 0
  state.navigationIntentPendingCount = 0
  state.navigationIntentResolvedCount = 0
  state.navigationIntentResolveBudgetViolationCount = 0
  state.navigationIntentResolveCount = 0
  state.navigationIntentResolveCountThisTick = 0
  state.navigationIntentResolveCursor = 0
  state.navigationIntentResolveEligible.fill(0)
  state.navigationIntentResolveScheduled.fill(0)
  state.navigationIntentUnservicedPendingCount = 0
  state.navigationLivingWithoutCommittedActionCount = 0
  state.navigationRetainedPendingActionCount = 0
  state.navigationStaleTargetCount = 0
  state.navigationIntentAdmissionDeferredCanceledCount = 0
  state.navigationIntentAdmissionDeferredMarkedCount = 0
  state.navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick = 0
  state.navigationIntentAdmissionDeferredPendingCount = 0
  state.navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount = 0
  state.navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount = 0
  state.navigationIntentAdmissionDeferredPromotedConnectorChangedCount = 0
  state.navigationIntentAdmissionDeferredPromotedCount = 0
  state.navigationIntentAdmissionDeferredPromotedCountThisTick = 0
  state.navigationIntentAdmissionDeferredPromotedSpawnCount = 0
  state.navigationIntentAdmissionDeferredPromotedWorldChangedCount = 0
  state.navigationIntentAdmissionDeferredQueueHead = -1
  state.navigationIntentAdmissionDeferredQueueOperationCountThisTick = 0
  state.navigationIntentAdmissionDeferredQueueOperationCountTotal = 0
  state.navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick = 0
  state.navigationIntentAdmissionDeferredQueueTail = -1
  state.navigationObstacleRefreshDeferredCanceledCount = 0
  state.navigationObstacleRefreshDiscoveryAppliedRevision = 0
  state.navigationObstacleRefreshDiscoveryEpochRevision = 0
  state.navigationObstacleRefreshDiscoveryRemainingSlotCount = 0
  state.navigationObstacleRefreshDeferredMarkedCount = 0
  state.navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick = 0
  state.navigationObstacleRefreshDeferredPendingCount = 0
  state.navigationObstacleRefreshDeferredPromotedCount = 0
  state.navigationObstacleRefreshDeferredPromotedCountThisTick = 0
  state.navigationRefreshAdmissionCountThisTick = 0
  state.navigationRefreshAdmissionCountTotal = 0
  state.navigationRefreshAdmissionCursor = 0
  state.navigationRefreshAdmissionMaximumCountObservedPerTick = 0
  state.navigationRefreshAdmissionPreferScanned = true
  state.navigationRefreshCandidateInspectionsThisTick = 0
  state.navigationRefreshCandidateInspectionsTotal = 0
  state.navigationRefreshCandidateInspectionsMaximumObservedPerTick = 0
  state.navigationRefreshInspectionScratch.cursor = 0
  state.navigationRefreshInspectionScratch.inspections = 0
  state.navigationRefreshInspectionScratch.obstacleRemaining = 0
  state.navigationRefreshInspectionScratch.slot = -1
  state.navigationRefreshInspectionScratch.targetsRemovedObstacle = false
  state.navigationRefreshInspectionScratch.worldRemaining = 0
  resetZombieEscapeNavigationVisibilityWorkMetrics(state.navigationVisibilityWork)
  resetZombieEscapeSparseWorkMetrics(state.navigationSparseCachedFollowWork)
  state.navigationSparseCollisionReanchorAttemptCount = 0
  state.navigationSparseCollisionReanchorCompletedCount = 0
  state.navigationSparseCollisionReanchorFailedCount = 0
  resetZombieEscapeSparseWorkMetrics(state.navigationSparseFlowSearchWork)
  state.navigationSparseSearchBudgetScratch.maximumCandidateVisits = 0
  state.navigationSparseSearchBudgetScratch.maximumCollisionPredicates = 0
  state.navigationSparseSearchBudgetScratch.maximumGraphEdgeVisits = 0
  state.navigationSparseSearchBudgetScratch.maximumHeapOperations = 0
  state.navigationSparseSearchBudgetScratch.maximumHierarchyNodeVisits = 0
  state.navigationSparseSearchBudgetScratch.maximumSupportPredicates = 0
  state.navigationSparseSearchBudgetViolationCount = 0
  state.navigationSparseSearchActiveAgentCount = 0
  state.navigationSparseSearchWorldStaleActiveCount = 0
  state.navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick = 0
  state.navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved = 0
  state.navigationSparseSearchAgentOldestPendingNoProgressAgeTicks = 0
  state.navigationSparseSearchAgentProgressSliceCountThisTick = 0
  state.navigationSparseSearchAgentProgressSliceCountTotal = 0
  state.navigationSparseSearchAgentDrainCursor = 0
  state.navigationSparseSearchProtectedDrainCursor = 0
  state.navigationSparseSearchProtectedOwnerPoolGeneration = 0
  state.navigationSparseSearchProtectedOwnerSlot = -1
  state.navigationSparseSearchAgentServiceSliceCountThisTick = 0
  state.navigationSparseSearchAgentServiceSliceCountTotal = 0
  state.navigationSparseSearchCandidateVisitsMaximumObservedPerTick = 0
  state.navigationSparseSearchCandidateVisitsThisTick = 0
  state.navigationSparseSearchCandidateVisitsTotal = 0
  state.navigationSparseSearchCollisionPredicatesMaximumObservedPerTick = 0
  state.navigationSparseSearchCollisionPredicatesThisTick = 0
  state.navigationSparseSearchCollisionPredicatesTotal = 0
  state.navigationSparseSearchCanceledCount = 0
  state.navigationSparseSearchCompletedCount = 0
  state.navigationSparseSearchCompletionProgressThisTick = 0
  state.navigationSparseSearchCompletionProgressTotal = 0
  state.navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick = 0
  state.navigationSparseSearchGraphEdgeVisitsThisTick = 0
  state.navigationSparseSearchGraphEdgeVisitsTotal = 0
  state.navigationSparseSearchHeapOperationsMaximumObservedPerTick = 0
  state.navigationSparseSearchHeapOperationsThisTick = 0
  state.navigationSparseSearchHeapOperationsTotal = 0
  state.navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick = 0
  state.navigationSparseSearchHierarchyNodeVisitsThisTick = 0
  state.navigationSparseSearchHierarchyNodeVisitsTotal = 0
  state.navigationSparseSearchInvalidatedCount = 0
  state.navigationSparseSearchMaximumNoProgressAgeTicksObserved = 0
  state.navigationSparseSearchNoProgressAgeTicks = 0
  state.navigationSparseSearchPendingAgentCount = 0
  state.navigationSparseSearchRestartedCollisionRecoveryCount = 0
  state.navigationSparseSearchRestartedCount = 0
  state.navigationSparseSearchRestartedRoutePublishedCount = 0
  state.navigationSparseSearchRestartedTargetPublicationPreemptionCount = 0
  state.navigationSparseSearchRestartedWorldChangedCount = 0
  state.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved = 0
  state.navigationSparseSearchSpawnNoProgressAgeTicks = 0
  state.navigationSparseSearchSpawnProgressSliceCountThisTick = 0
  state.navigationSparseSearchSpawnProgressSliceCountTotal = 0
  state.navigationSparseSearchSpawnServiceSliceCountThisTick = 0
  state.navigationSparseSearchSpawnServiceSliceCountTotal = 0
  state.navigationSparseSearchServiceSliceCountThisTick = 0
  state.navigationSparseSearchServiceSliceCountTotal = 0
  state.navigationSparseSearchStartedCount = 0
  state.navigationSparseSearchSupportPredicatesMaximumObservedPerTick = 0
  state.navigationSparseSearchSupportPredicatesThisTick = 0
  state.navigationSparseSearchSupportPredicatesTotal = 0
  state.navigationSparseSearchTargetBuildsMaximumObservedPerTick = 0
  state.navigationSparseSearchTargetBuildsThisTick = 0
  state.navigationSparseSearchTargetBuildsTotal = 0
  state.navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved = 0
  state.navigationSparseSearchTargetNoProgressAgeTicks = 0
  state.navigationSparseSearchTargetProgressSliceCountThisTick = 0
  state.navigationSparseSearchTargetProgressSliceCountTotal = 0
  state.navigationSparseSearchTargetServiceSliceCountThisTick = 0
  state.navigationSparseSearchTargetServiceSliceCountTotal = 0
  state.navigationSparseSearchUncausedStartViolationCount = 0
  state.navigationSparseSpawnDesiredX = 0
  state.navigationSparseSpawnDesiredZ = 0
  state.navigationSparseSpawnIsReplacement = false
  state.navigationSparseSpawnMinimumTargetDistanceMeters = 0
  state.navigationSparseSpawnSearchActive = false
  state.navigationSparseSpawnSearchCompletedCount = 0
  state.navigationSparseSpawnSearchDependencyWaiting = false
  state.navigationSparseSpawnSearchInvalidatedCount = 0
  state.navigationSparseSpawnSearchNeedsRestart = false
  state.navigationSparseSpawnSearchStartedCount = 0
  state.navigationSparseSpawnProbeCountTotal = 0
  state.navigationSparseSpawnProbeMaximumObservedPerAdmission = 0
  state.navigationSparseSpawnProbeOrdinal = 0
  resetZombieEscapeSparseAttachmentWorkMetrics(state.navigationSparseSpawnWork)
  resetZombieEscapeSparseTargetWorkMetrics(state.navigationSparseTargetWork)
  state.navigationIntentTick = 0
  state.navigationRouteTargetCellX = 0
  state.navigationRouteTargetCellZ = 0
  state.navigationRouteTargetInitialized = false
  state.navigationRouteTargetX = 0
  state.navigationRouteTargetY = 0
  state.navigationRouteTargetZ = 0
  state.navigationRouteTargetRegionIndex = -1
  state.navigationTargetCommittedRouteGeneration = getZombieEscapeSparseCommittedRouteGeneration(
    state.navigationField,
  )
  state.navigationTargetRequestedLayerHint =
    state.navigationField.graphSparseTargetUpdate.requestedTargetLayerHint
  state.navigationTargetRequestedRevision = getZombieEscapeSparseRequestedTargetRevision(
    state.navigationField,
  )
  state.navigationWorldRevision = 0
  state.navigationWorldRefreshAdmissionGeneration = state.collisionWorldGeneration
  state.navigationWorldRefreshEpochGeneration = state.collisionWorldGeneration
  state.navigationWorldRefreshInspectionRemaining = 0
  state.navigationWorldRefreshMaximumPromotedCountObservedPerTick = 0
  state.navigationWorldRefreshMinimumAppliedGeneration = state.collisionWorldGeneration
  state.navigationWorldRefreshPendingCount = 0
  state.navigationWorldRefreshPromotedCountThisTick = 0
  state.navigationWorldRefreshPromotedCountTotal = 0
  state.navigationWorldRefreshRestartedCountThisTick = 0
  state.navigationWorldRefreshRestartedCountTotal = 0
  state.simulationTick = 0
  state.zombies.navigationCollisionRecoveryOriginX.fill(0)
  state.zombies.navigationCollisionRecoveryOriginZ.fill(0)
  state.zombies.navigationIntentAdmissionDeferredReasons.fill(0)
  state.zombies.navigationIntentAdmissionDeferredNext.fill(-1)
  state.zombies.navigationIntentAdmissionDeferredPrevious.fill(-1)
  state.zombies.navigationIntentHasCached.fill(0)
  state.zombies.navigationIntentHasReceivedFirstService.fill(0)
  state.zombies.navigationIntentAdmissionWorldGeneration.fill(0)
  state.zombies.navigationIntentFirstServiceEligibleSinceTick.fill(0)
  state.zombies.navigationIntentFirstServiceTick.fill(0)
  state.zombies.navigationIntentPending.fill(0)
  state.zombies.navigationIntentPendingSinceTick.fill(0)
  state.zombies.navigationIntentCommittedRouteGeneration.fill(0)
  state.zombies.navigationIntentCurrentTargetFallback.fill(0)
  state.zombies.navigationIntentTargetRevision.fill(0)
  state.zombies.navigationNoProgressTicks.fill(0)
  state.zombies.navigationProgressTargetNode.fill(
    ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED,
  )
  state.zombies.navigationRecoveryCooldownTicks.fill(0)
  state.zombies.navigationSparseFlowSearchActive.fill(0)
  state.zombies.navigationSparseFlowSearchDependencyWaiting.fill(0)
  state.zombies.navigationSparseFlowSearchLastProgressTick.fill(0)
  state.zombies.navigationSparseFlowSearchRestartToken.fill(0)
  state.zombies.navigationSparseFlowSearchStartedForDemand.fill(0)
  state.zombies.navigationSparseFlowSearchTargetPreemptionUsed.fill(0)
  state.zombies.navigationSparseFlowSearchWorldRevision.fill(0)
}

const ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_OBSTACLE = 1 << 6

function resolveZombieEscapeDeferredNavigationIntentReasonBit(
  reason: ZombieEscapeDeferredNavigationIntentReason,
) {
  return ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON[reason]
}

function cancelZombieEscapeDeferredNavigationIntentAdmission(
  state: ZombieEscapeSimulation,
  slot: number,
) {
  const zombies = state.zombies
  const reasons = zombies.navigationIntentAdmissionDeferredReasons[slot]!
  if (reasons === 0) return false
  unlinkZombieEscapeDeferredNavigationIntentAdmission(state, slot)
  zombies.navigationIntentAdmissionDeferredReasons[slot] = 0
  state.navigationIntentAdmissionDeferredPendingCount -= 1
  state.navigationIntentAdmissionDeferredCanceledCount += 1
  if ((reasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_OBSTACLE) !== 0) {
    state.navigationObstacleRefreshDeferredPendingCount -= 1
    state.navigationObstacleRefreshDeferredCanceledCount += 1
  }
  return true
}

function recordZombieEscapeDeferredNavigationIntentQueueOperation(state: ZombieEscapeSimulation) {
  state.navigationIntentAdmissionDeferredQueueOperationCountThisTick += 1
  state.navigationIntentAdmissionDeferredQueueOperationCountTotal += 1
  state.navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick = Math.max(
    state.navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick,
    state.navigationIntentAdmissionDeferredQueueOperationCountThisTick,
  )
}

function unlinkZombieEscapeDeferredNavigationIntentAdmission(
  state: ZombieEscapeSimulation,
  slot: number,
) {
  const zombies = state.zombies
  const previous = zombies.navigationIntentAdmissionDeferredPrevious[slot]!
  const next = zombies.navigationIntentAdmissionDeferredNext[slot]!
  if (previous >= 0) zombies.navigationIntentAdmissionDeferredNext[previous] = next
  else state.navigationIntentAdmissionDeferredQueueHead = next
  if (next >= 0) zombies.navigationIntentAdmissionDeferredPrevious[next] = previous
  else state.navigationIntentAdmissionDeferredQueueTail = previous
  zombies.navigationIntentAdmissionDeferredNext[slot] = -1
  zombies.navigationIntentAdmissionDeferredPrevious[slot] = -1
  recordZombieEscapeDeferredNavigationIntentQueueOperation(state)
}

function deferZombieEscapeNavigationIntentAdmission(
  state: ZombieEscapeSimulation,
  slot: number,
  reason: ZombieEscapeDeferredNavigationIntentReason,
) {
  const zombies = state.zombies
  if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) return false
  const reasonBit = resolveZombieEscapeDeferredNavigationIntentReasonBit(reason)
  const previousReasons = zombies.navigationIntentAdmissionDeferredReasons[slot]!
  if ((previousReasons & reasonBit) !== 0) return false
  if (previousReasons === 0) {
    const tail = state.navigationIntentAdmissionDeferredQueueTail
    zombies.navigationIntentAdmissionDeferredNext[slot] = -1
    zombies.navigationIntentAdmissionDeferredPrevious[slot] = tail
    if (tail >= 0) zombies.navigationIntentAdmissionDeferredNext[tail] = slot
    else state.navigationIntentAdmissionDeferredQueueHead = slot
    state.navigationIntentAdmissionDeferredQueueTail = slot
    recordZombieEscapeDeferredNavigationIntentQueueOperation(state)
    state.navigationIntentAdmissionDeferredMarkedCount += 1
    state.navigationIntentAdmissionDeferredPendingCount += 1
  }
  zombies.navigationIntentAdmissionDeferredReasons[slot] = previousReasons | reasonBit
  return true
}

function deferZombieEscapeObstacleNavigationRefresh(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) return false
  deferZombieEscapeNavigationIntentAdmission(state, slot, 'cachedAnchorLost')
  const reasons = zombies.navigationIntentAdmissionDeferredReasons[slot]!
  if ((reasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_OBSTACLE) !== 0) return false
  zombies.navigationIntentAdmissionDeferredReasons[slot] =
    reasons | ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_OBSTACLE
  state.navigationObstacleRefreshDeferredMarkedCount += 1
  state.navigationObstacleRefreshDeferredPendingCount += 1
  return true
}

function clearZombieEscapeDeferredNavigationIntentReason(
  state: ZombieEscapeSimulation,
  slot: number,
  reason: ZombieEscapeDeferredNavigationIntentReason,
) {
  const zombies = state.zombies
  const reasonBit = resolveZombieEscapeDeferredNavigationIntentReasonBit(reason)
  const previousReasons = zombies.navigationIntentAdmissionDeferredReasons[slot]!
  if ((previousReasons & reasonBit) === 0) return false
  const nextReasons = previousReasons & ~reasonBit
  if (nextReasons !== 0) {
    zombies.navigationIntentAdmissionDeferredReasons[slot] = nextReasons
    return true
  }
  cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
  return true
}

function beginZombieEscapeWorldRefreshAdmissionEpoch(state: ZombieEscapeSimulation) {
  state.navigationWorldRefreshEpochGeneration = state.collisionWorldGeneration
  state.navigationWorldRefreshInspectionRemaining = state.zombies.pool.capacity
  if (state.navigationWorldRefreshInspectionRemaining === 0) {
    state.navigationWorldRefreshAdmissionGeneration = state.collisionWorldGeneration
  }
}

function recordZombieEscapeNavigationRefreshCandidateInspection(state: ZombieEscapeSimulation) {
  state.navigationRefreshCandidateInspectionsThisTick += 1
  state.navigationRefreshCandidateInspectionsTotal += 1
}

function takeZombieEscapeDeferredNavigationIntentCandidate(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const inspectionBudget =
    ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick
  let slot = state.navigationIntentAdmissionDeferredQueueHead
  while (slot >= 0 && state.navigationRefreshCandidateInspectionsThisTick < inspectionBudget) {
    const nextSlot = zombies.navigationIntentAdmissionDeferredNext[slot]!
    recordZombieEscapeNavigationRefreshCandidateInspection(state)
    if (
      zombies.pool.active[slot] !== 0 &&
      zombies.health[slot]! > 0 &&
      zombies.navigationConnector[slot]! < 0
    ) {
      const deferredReasons = zombies.navigationIntentAdmissionDeferredReasons[slot]!
      const hasWorldRefresh =
        (deferredReasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON.worldChanged) !== 0 ||
        zombies.navigationIntentAdmissionWorldGeneration[slot] !== state.collisionWorldGeneration
      const reason = resolveZombieEscapeDeferredNavigationIntentPromotionReason(
        deferredReasons,
        hasWorldRefresh,
      )
      if (
        reason !== 'collisionRecovery' ||
        (zombies.navigationIntentPending[slot] === 0 &&
          zombies.navigationSparseFlowSearchActive[slot] === 0)
      ) {
        return slot
      }
    } else {
      cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
    }
    slot = nextSlot
  }
  return -1
}

export function inspectZombieEscapeNavigationRefreshCandidates(
  world: ZombieEscapeCollisionWorld,
  active: Uint8Array,
  health: Float32Array,
  navigationConnector: Int16Array,
  worldRevisionBySlot: Uint32Array,
  worldRevision: number,
  blockerObjectOrdinal: Int32Array,
  attackTargetObjectOrdinal: Int32Array,
  inspection: ZombieEscapeNavigationRefreshInspectionState,
  maximumInspections: number,
) {
  const capacity = active.length
  const inspectionLimit = Math.max(0, Math.trunc(maximumInspections))
  inspection.inspections = 0
  inspection.slot = -1
  inspection.targetsRemovedObstacle = false
  while (
    capacity > 0 &&
    (inspection.obstacleRemaining > 0 || inspection.worldRemaining > 0) &&
    inspection.inspections < inspectionLimit
  ) {
    const slot = inspection.cursor % capacity
    inspection.cursor = (slot + 1) % capacity
    if (inspection.obstacleRemaining > 0) inspection.obstacleRemaining -= 1
    if (inspection.worldRemaining > 0) inspection.worldRemaining -= 1
    inspection.inspections += 1
    if (active[slot] === 0 || health[slot]! <= 0 || navigationConnector[slot]! >= 0) {
      continue
    }
    const blockerOrdinal = blockerObjectOrdinal[slot]!
    const attackOrdinal = attackTargetObjectOrdinal[slot]!
    const targetsRemovedObstacle =
      (blockerOrdinal >= 0 && !zombieEscapeCollisionObjectOrdinalIsActive(world, blockerOrdinal)) ||
      (attackOrdinal >= 0 && !zombieEscapeCollisionObjectOrdinalIsActive(world, attackOrdinal))
    if (targetsRemovedObstacle || worldRevisionBySlot[slot] !== worldRevision) {
      inspection.slot = slot
      inspection.targetsRemovedObstacle = targetsRemovedObstacle
      return true
    }
  }
  return false
}

function takeZombieEscapeScannedNavigationRefreshCandidate(
  state: ZombieEscapeSimulation,
  maximumInspections: number,
) {
  const zombies = state.zombies
  const inspectionBudget =
    ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick
  const scratch = state.navigationRefreshInspectionScratch
  scratch.cursor = state.navigationRefreshAdmissionCursor
  scratch.obstacleRemaining = state.navigationObstacleRefreshDiscoveryRemainingSlotCount
  scratch.worldRemaining = state.navigationWorldRefreshInspectionRemaining
  inspectZombieEscapeNavigationRefreshCandidates(
    state.collisionWorld,
    zombies.pool.active,
    zombies.health,
    zombies.navigationConnector,
    zombies.navigationIntentAdmissionWorldGeneration,
    state.collisionWorldGeneration,
    zombies.navigationBlockerObjectOrdinal,
    zombies.attackTargetObjectOrdinal,
    scratch,
    Math.min(
      maximumInspections,
      inspectionBudget - state.navigationRefreshCandidateInspectionsThisTick,
    ),
  )
  state.navigationRefreshAdmissionCursor = scratch.cursor
  state.navigationObstacleRefreshDiscoveryRemainingSlotCount = scratch.obstacleRemaining
  state.navigationWorldRefreshInspectionRemaining = scratch.worldRemaining
  state.navigationRefreshCandidateInspectionsThisTick += scratch.inspections
  state.navigationRefreshCandidateInspectionsTotal += scratch.inspections
  if (state.navigationObstacleRefreshDiscoveryRemainingSlotCount === 0) {
    state.navigationObstacleRefreshDiscoveryAppliedRevision =
      state.navigationObstacleRefreshDiscoveryEpochRevision
  }
  if (state.navigationWorldRefreshInspectionRemaining === 0) {
    state.navigationWorldRefreshAdmissionGeneration = state.navigationWorldRefreshEpochGeneration
  }
  if (scratch.slot < 0) return -1
  if (scratch.targetsRemovedObstacle) {
    clearZombieEscapeRemovedObstacleReferences(zombies, scratch.slot)
    deferZombieEscapeObstacleNavigationRefresh(state, scratch.slot)
  }
  if (
    zombies.navigationIntentAdmissionWorldGeneration[scratch.slot] !==
    state.collisionWorldGeneration
  ) {
    deferZombieEscapeNavigationIntentAdmission(state, scratch.slot, 'worldChanged')
  }
  return scratch.slot
}

function admitZombieEscapeDeferredNavigationRefreshes(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const maximumAdmissions = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
  const inspectionBudget =
    ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick
  const inspectionsPerScannedAttempt = Math.max(
    1,
    Math.floor(inspectionBudget / Math.max(1, maximumAdmissions)),
  )
  if (
    state.navigationIntentAdmissionDeferredPendingCount === 0 &&
    state.navigationObstacleRefreshDiscoveryRemainingSlotCount === 0 &&
    state.navigationWorldRefreshAdmissionGeneration === state.collisionWorldGeneration
  ) {
    return
  }
  if (state.navigationWorldRefreshEpochGeneration !== state.collisionWorldGeneration) {
    beginZombieEscapeWorldRefreshAdmissionEpoch(state)
  }
  let admitted = 0
  let obstaclePromoted = 0
  let worldPromoted = 0
  let worldRestarted = 0
  while (
    admitted < maximumAdmissions &&
    state.navigationRefreshCandidateInspectionsThisTick < inspectionBudget
  ) {
    let slot = -1
    if (state.navigationRefreshAdmissionPreferScanned) {
      slot = takeZombieEscapeScannedNavigationRefreshCandidate(state, inspectionsPerScannedAttempt)
      if (slot < 0) slot = takeZombieEscapeDeferredNavigationIntentCandidate(state)
    } else {
      slot = takeZombieEscapeDeferredNavigationIntentCandidate(state)
      if (slot < 0) {
        slot = takeZombieEscapeScannedNavigationRefreshCandidate(
          state,
          inspectionsPerScannedAttempt,
        )
      }
    }
    if (slot < 0) {
      if (
        (state.navigationObstacleRefreshDiscoveryRemainingSlotCount > 0 ||
          state.navigationWorldRefreshInspectionRemaining > 0) &&
        state.navigationRefreshCandidateInspectionsThisTick < inspectionBudget
      ) {
        state.navigationRefreshAdmissionPreferScanned = true
        continue
      }
      break
    }
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) {
      cancelZombieEscapeNavigationIntentDemand(state, slot)
      continue
    }
    const deferredReasons = zombies.navigationIntentAdmissionDeferredReasons[slot]!
    const hasObstacleRefresh =
      (deferredReasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_OBSTACLE) !== 0
    const hasWorldRefresh =
      (deferredReasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON.worldChanged) !== 0 ||
      zombies.navigationIntentAdmissionWorldGeneration[slot] !== state.collisionWorldGeneration
    unlinkZombieEscapeDeferredNavigationIntentAdmission(state, slot)
    zombies.navigationIntentAdmissionDeferredReasons[slot] = 0
    state.navigationIntentAdmissionDeferredPendingCount -= 1
    state.navigationIntentAdmissionDeferredPromotedCount += 1
    if (hasObstacleRefresh) {
      state.navigationObstacleRefreshDeferredPendingCount -= 1
      state.navigationObstacleRefreshDeferredPromotedCount += 1
      obstaclePromoted += 1
    }
    const reason = resolveZombieEscapeDeferredNavigationIntentPromotionReason(
      deferredReasons,
      hasWorldRefresh,
    )
    const worldRestartCountBefore = state.navigationSparseSearchRestartedWorldChangedCount
    demandZombieEscapeNavigationIntent(
      state,
      slot,
      reason,
      reason === 'worldChanged' || reason === 'connectorChanged',
    )
    recordZombieEscapeDeferredNavigationIntentPromotion(state, reason)
    if (hasWorldRefresh) {
      zombies.navigationIntentAdmissionWorldGeneration[slot] = state.collisionWorldGeneration
      worldPromoted += 1
      worldRestarted +=
        state.navigationSparseSearchRestartedWorldChangedCount - worldRestartCountBefore
    }
    admitted += 1
    state.navigationRefreshAdmissionPreferScanned = !state.navigationRefreshAdmissionPreferScanned
  }
  state.navigationRefreshAdmissionCountThisTick = admitted
  state.navigationRefreshAdmissionCountTotal += admitted
  state.navigationRefreshAdmissionMaximumCountObservedPerTick = Math.max(
    state.navigationRefreshAdmissionMaximumCountObservedPerTick,
    admitted,
  )
  state.navigationIntentAdmissionDeferredPromotedCountThisTick = admitted
  state.navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick = Math.max(
    state.navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick,
    admitted,
  )
  state.navigationObstacleRefreshDeferredPromotedCountThisTick = obstaclePromoted
  state.navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick = Math.max(
    state.navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick,
    obstaclePromoted,
  )
  state.navigationWorldRefreshPromotedCountThisTick = worldPromoted
  state.navigationWorldRefreshPromotedCountTotal += worldPromoted
  state.navigationWorldRefreshMaximumPromotedCountObservedPerTick = Math.max(
    state.navigationWorldRefreshMaximumPromotedCountObservedPerTick,
    worldPromoted,
  )
  state.navigationWorldRefreshRestartedCountThisTick = worldRestarted
  state.navigationWorldRefreshRestartedCountTotal += worldRestarted
  state.navigationRefreshCandidateInspectionsMaximumObservedPerTick = Math.max(
    state.navigationRefreshCandidateInspectionsMaximumObservedPerTick,
    state.navigationRefreshCandidateInspectionsThisTick,
  )
}

function resolveZombieEscapeDeferredNavigationIntentPromotionReason(
  reasons: number,
  hasWorldRefresh: boolean,
): ZombieEscapeNavigationIntentDemandReason {
  if ((reasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON.spawn) !== 0) return 'spawn'
  if (hasWorldRefresh) return 'worldChanged'
  if ((reasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON.connectorChanged) !== 0) {
    return 'connectorChanged'
  }
  if ((reasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON.routePublished) !== 0) {
    return 'routePublished'
  }
  if ((reasons & ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_REASON.collisionRecovery) !== 0) {
    return 'collisionRecovery'
  }
  return 'cachedAnchorLost'
}

function recordZombieEscapeDeferredNavigationIntentPromotion(
  state: ZombieEscapeSimulation,
  reason: ZombieEscapeNavigationIntentDemandReason,
) {
  if (reason === 'spawn') state.navigationIntentAdmissionDeferredPromotedSpawnCount += 1
  else if (reason === 'worldChanged') {
    state.navigationIntentAdmissionDeferredPromotedWorldChangedCount += 1
  } else if (reason === 'connectorChanged') {
    state.navigationIntentAdmissionDeferredPromotedConnectorChangedCount += 1
  } else if (reason === 'collisionRecovery') {
    state.navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount += 1
  } else {
    state.navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount += 1
  }
}

function zombieEscapeProtectedSearchOwnerMatchesSlot(state: ZombieEscapeSimulation, slot: number) {
  return (
    state.navigationSparseSearchProtectedOwnerSlot === slot &&
    state.navigationSparseSearchProtectedOwnerPoolGeneration === state.zombies.pool.generation[slot]
  )
}

function releaseZombieEscapeProtectedSearchOwner(state: ZombieEscapeSimulation, slot: number) {
  if (!zombieEscapeProtectedSearchOwnerMatchesSlot(state, slot)) return false
  state.navigationSparseSearchProtectedOwnerPoolGeneration = 0
  state.navigationSparseSearchProtectedOwnerSlot = -1
  return true
}

function zombieEscapeProtectedSearchOwnerIsLive(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const slot = state.navigationSparseSearchProtectedOwnerSlot
  return (
    slot >= 0 &&
    slot < zombies.pool.capacity &&
    zombies.pool.active[slot] !== 0 &&
    zombies.pool.generation[slot] === state.navigationSparseSearchProtectedOwnerPoolGeneration &&
    zombies.health[slot]! > 0 &&
    zombies.navigationConnector[slot]! < 0 &&
    zombies.navigationIntentPending[slot] !== 0 &&
    zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] !== 0
  )
}

function tryClaimZombieEscapeProtectedSearchOwner(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  if (zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] === 0) return true
  if (zombieEscapeProtectedSearchOwnerMatchesSlot(state, slot)) return true
  if (zombieEscapeProtectedSearchOwnerIsLive(state)) return false
  state.navigationSparseSearchProtectedOwnerPoolGeneration = zombies.pool.generation[slot]!
  state.navigationSparseSearchProtectedOwnerSlot = slot
  return true
}

function restartZombieEscapeSparseFlowSearch(
  state: ZombieEscapeSimulation,
  slot: number,
  reason: ZombieEscapeSparseSearchRestartReason,
) {
  const zombies = state.zombies
  if (zombies.navigationSparseFlowSearchActive[slot] === 0) return false
  resetZombieEscapeSparseFlowSearch(zombies.navigationSparseFlowSearch[slot]!)
  releaseZombieEscapeProtectedSearchOwner(state, slot)
  zombies.navigationSparseFlowSearchActive[slot] = 0
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationSparseFlowSearchRestartToken[slot] = 1
  if (reason === 'routePublished' || reason === 'targetPublicationPreemption') {
    zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 1
  }
  state.navigationSparseSearchInvalidatedCount += 1
  state.navigationSparseSearchRestartedCount += 1
  if (reason === 'routePublished') state.navigationSparseSearchRestartedRoutePublishedCount += 1
  else if (reason === 'targetPublicationPreemption') {
    state.navigationSparseSearchRestartedTargetPublicationPreemptionCount += 1
  } else if (reason === 'worldChanged') {
    state.navigationSparseSearchRestartedWorldChangedCount += 1
  } else {
    state.navigationSparseSearchRestartedCollisionRecoveryCount += 1
  }
  return true
}

function cancelZombieEscapeSparseFlowSearch(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  releaseZombieEscapeProtectedSearchOwner(state, slot)
  if (zombies.navigationSparseFlowSearchActive[slot] === 0) return false
  resetZombieEscapeSparseFlowSearch(zombies.navigationSparseFlowSearch[slot]!)
  zombies.navigationSparseFlowSearchActive[slot] = 0
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  zombies.navigationSparseFlowSearchRestartToken[slot] = 0
  zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
  state.navigationSparseSearchCanceledCount += 1
  return true
}

function recordZombieEscapeSparseFlowSearchStart(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  if (zombies.navigationSparseFlowSearchStartedForDemand[slot] === 0) {
    zombies.navigationSparseFlowSearchStartedForDemand[slot] = 1
  } else if (zombies.navigationSparseFlowSearchRestartToken[slot] !== 0) {
    zombies.navigationSparseFlowSearchRestartToken[slot] = 0
  } else {
    state.navigationSparseSearchUncausedStartViolationCount += 1
  }
  state.navigationSparseSearchStartedCount += 1
}

function beginZombieEscapeSparseFlowSearchForAgent(state: ZombieEscapeSimulation, slot: number) {
  if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) return false
  const zombies = state.zombies
  if (zombies.navigationSparseFlowSearchActive[slot] !== 0) return true
  if (!tryClaimZombieEscapeProtectedSearchOwner(state, slot)) return false
  const search = zombies.navigationSparseFlowSearch[slot]!
  const stagedPreferredWaypointNode = search.preferredWaypointNode
  const stagedPreferredWaypointUsesFallback = search.preferredWaypointUsesFallback
  const targetUpdate = state.navigationField.graphSparseTargetUpdate
  const hasValidatedTarget =
    targetUpdate.routeTargetInitialized &&
    targetUpdate.status !== 'invalidated' &&
    targetUpdate.worldRevision === state.navigationField.world.revision &&
    targetUpdate.routeTargetLayerIndex === state.navigationField.targetLayerIndex
  const catalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[slot]!)
  const plannerTravelSpeed =
    (zombies.gait[slot] === ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner
      ? catalogEntry.movement.runMetersPerSecond + state.wave * 0.18
      : catalogEntry.movement.walkMetersPerSecond + state.wave * 0.06) * zombies.speedScale[slot]!
  beginZombieEscapeSparseFlowSearch(
    search,
    state.navigationField,
    zombies.x[slot]!,
    zombies.z[slot]!,
    hasValidatedTarget ? targetUpdate.routeTargetX : state.navigationGoalX,
    hasValidatedTarget ? targetUpdate.routeTargetZ : state.navigationGoalZ,
    zombies.y[slot]!,
    zombies.navigationWaypointNode[slot]! >= 0
      ? zombies.navigationWaypointNode[slot]!
      : stagedPreferredWaypointNode,
    zombies.navigationWaypointNode[slot]! >= 0
      ? zombies.navigationWaypointFallback[slot] !== 0
      : stagedPreferredWaypointUsesFallback,
    plannerTravelSpeed,
  )
  if (search.status !== 'pending') {
    releaseZombieEscapeProtectedSearchOwner(state, slot)
    zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 1
    zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
    return false
  }
  zombies.navigationSparseFlowSearchActive[slot] = 1
  zombies.navigationSparseFlowSearchWorldRevision[slot] = state.navigationWorldRevision
  recordZombieEscapeSparseFlowSearchStart(state, slot)
  return true
}

function refreshZombieEscapeSparseFlowSearchEligibility(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const eligible = state.navigationIntentResolveEligible
  const capacity = zombies.pool.capacity
  let availableAgentLeases = inspectZombieEscapeSparseAttachmentHeapLeases(
    state.navigationField,
  ).availableAgentLeases
  eligible.fill(0)
  for (let offset = 0; offset < capacity; offset += 1) {
    const slot = (state.navigationIntentResolveCursor + offset) % capacity
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) continue
    const targetIsUnavailable =
      state.navigationField.graphSparseTargetUpdate.status === 'ready' &&
      state.navigationTargetCommittedRouteGeneration > 0 &&
      state.navigationField.targetLayerIndex < 0
    if (state.multiplayer) availableAgentLeases = state.multiplayer.navigationLeaseBudget(slot)
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.health[slot]! <= 0 ||
      zombies.navigationConnector[slot]! >= 0 ||
      zombies.navigationIntentPending[slot] === 0
    ) {
      zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
      continue
    }
    const searchIsActive = zombies.navigationSparseFlowSearchActive[slot] !== 0
    const search = zombies.navigationSparseFlowSearch[slot]!
    if (
      searchIsActive &&
      (zombies.navigationSparseFlowSearchWorldRevision[slot] !== state.navigationWorldRevision ||
        search.worldRevision !== state.navigationField.world.revision)
    ) {
      zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
      continue
    }
    const searchHasLease = zombieEscapeSparseFlowSearchHasAttachmentHeapLease(
      search,
      state.navigationField,
    )
    const hasAdmissionCapacity = searchHasLease || availableAgentLeases > 0
    let canProgress =
      targetIsUnavailable ||
      (hasAdmissionCapacity &&
        (searchIsActive
          ? zombieEscapeSparseFlowSearchCanProgress(search, state.navigationField)
          : zombieEscapeSparseFlowSearchCanBegin(search, state.navigationField)))
    if (canProgress && !searchIsActive && !tryClaimZombieEscapeProtectedSearchOwner(state, slot)) {
      canProgress = false
    }
    const wasDependencyWaiting = zombies.navigationSparseFlowSearchDependencyWaiting[slot] !== 0
    if (canProgress) {
      eligible[slot] = 1
      if (!targetIsUnavailable && !searchHasLease) {
        availableAgentLeases -= 1
        state.multiplayer?.reserveNavigationLease(slot)
      }
      if (!wasDependencyWaiting) continue
      zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
    } else {
      zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 1
    }
    zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
    if (zombies.navigationIntentHasReceivedFirstService[slot] === 0) {
      zombies.navigationIntentFirstServiceEligibleSinceTick[slot] = state.navigationIntentTick >>> 0
    }
  }
}

function markZombieEscapeNavigationIntentFirstService(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  if (
    zombies.navigationIntentPending[slot] === 0 ||
    zombies.navigationIntentHasReceivedFirstService[slot] !== 0
  ) {
    return false
  }
  zombies.navigationIntentHasReceivedFirstService[slot] = 1
  zombies.navigationIntentFirstServiceTick[slot] = state.navigationIntentTick >>> 0
  state.navigationIntentFirstServiceCount += 1
  return true
}

function demandZombieEscapeNavigationIntent(
  state: ZombieEscapeSimulation,
  slot: number,
  reason: ZombieEscapeNavigationIntentDemandReason,
  rearmCollisionRecovery: boolean,
) {
  const zombies = state.zombies
  if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) return false
  if (
    reason === 'collisionRecovery' &&
    (zombies.navigationIntentPending[slot] !== 0 ||
      zombies.navigationSparseFlowSearchActive[slot] !== 0)
  ) {
    return false
  }
  cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
  if (rearmCollisionRecovery) zombies.navigationIntentUrgentRefreshUsed[slot] = 0
  if (reason === 'worldChanged') {
    if (zombies.navigationSparseFlowSearchWorldRevision[slot] !== state.navigationWorldRevision) {
      restartZombieEscapeSparseFlowSearch(state, slot, reason)
      zombies.navigationSparseFlowSearchWorldRevision[slot] = state.navigationWorldRevision
    }
  } else if (reason === 'collisionRecovery') {
    restartZombieEscapeSparseFlowSearch(state, slot, reason)
  } else if (reason === 'spawn') {
    if (zombies.navigationIntentHasCached[slot] === 0) zombies.navigationIntentValid[slot] = 0
  }
  if (zombies.navigationConnector[slot]! >= 0) {
    clearZombieEscapeNavigationWaypoint(state, slot)
    cancelZombieEscapeNavigationIntentDemand(state, slot)
    return false
  }
  if (zombies.navigationIntentPending[slot] !== 0) return false

  zombies.navigationIntentPending[slot] = 1
  zombies.navigationIntentPendingSinceTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationIntentHasReceivedFirstService[slot] = 0
  zombies.navigationIntentFirstServiceEligibleSinceTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationIntentFirstServiceTick[slot] = 0
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
  zombies.navigationSparseFlowSearchRestartToken[slot] = 0
  zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
  zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 0
  state.navigationIntentIssuedCount += 1
  state.navigationIntentPendingCount += 1
  if (reason === 'spawn') state.navigationIntentDemandSpawnCount += 1
  else if (reason === 'worldChanged') state.navigationIntentDemandWorldChangedCount += 1
  else if (reason === 'connectorChanged') state.navigationIntentDemandConnectorChangedCount += 1
  else if (reason === 'routePublished') state.navigationIntentDemandRoutePublishedCount += 1
  else if (reason === 'cachedAnchorLost') {
    state.navigationIntentDemandCachedAnchorLostCount += 1
  } else {
    state.navigationIntentDemandCollisionRecoveryCount += 1
  }
  return true
}

function resolveZombieEscapeNavigationIntentDemand(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  if (zombies.navigationIntentPending[slot] === 0) return false
  releaseZombieEscapeProtectedSearchOwner(state, slot)
  zombies.navigationIntentPending[slot] = 0
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 0
  state.navigationIntentPendingCount -= 1
  state.navigationIntentResolvedCount += 1
  return true
}

function cancelZombieEscapeNavigationIntentDemand(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
  zombies.navigationIntentValid[slot] = 0
  zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
  cancelZombieEscapeSparseFlowSearch(state, slot)
  state.navigationIntentResolveScheduled[slot] = 0
  zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 0
  if (zombies.navigationIntentPending[slot] === 0) return false
  zombies.navigationIntentPending[slot] = 0
  state.navigationIntentPendingCount -= 1
  state.navigationIntentCanceledCount += 1
  return true
}

function refreshZombieEscapeNavigationIntentMetrics(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  let anchoredAgentCount = 0
  let livingWithoutCommittedActionCount = 0
  let oldestPendingAgeTicks = 0
  let oldestPendingNoProgressAgeTicks = 0
  let oldestUnservicedAgeTicks = 0
  let retainedPendingActionCount = 0
  let sparseSearchPendingAgentCount = 0
  let sparseSearchWorldStaleActiveCount = 0
  let worldRefreshMinimumAppliedRevision = state.collisionWorldGeneration
  let worldRefreshPendingCount = 0
  let unservicedPendingCount = 0
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) continue
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) continue
    const committedAction = inspectZombieEscapeCommittedNavigationAction(state, slot)
    if (committedAction === 'none') livingWithoutCommittedActionCount += 1
    else if (
      zombies.navigationIntentPending[slot] !== 0 &&
      zombies.navigationIntentHasCached[slot] !== 0
    ) {
      retainedPendingActionCount += 1
    }
    if (zombies.navigationConnector[slot]! < 0) {
      const appliedWorldRevision = zombies.navigationIntentAdmissionWorldGeneration[slot]!
      worldRefreshMinimumAppliedRevision = Math.min(
        worldRefreshMinimumAppliedRevision,
        appliedWorldRevision,
      )
      if (appliedWorldRevision !== state.collisionWorldGeneration) worldRefreshPendingCount += 1
    }
    if (zombies.navigationWaypointNode[slot]! >= 0) anchoredAgentCount += 1
    if (zombies.navigationSparseFlowSearchActive[slot] !== 0) {
      sparseSearchPendingAgentCount += 1
      if (
        zombies.navigationSparseFlowSearch[slot]!.worldRevision !==
        state.navigationField.world.revision
      ) {
        sparseSearchWorldStaleActiveCount += 1
      }
    }
    if (zombies.navigationIntentPending[slot] === 0) continue
    if (zombies.navigationSparseFlowSearchDependencyWaiting[slot] !== 0) {
      zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
      if (zombies.navigationIntentHasReceivedFirstService[slot] === 0) {
        zombies.navigationIntentFirstServiceEligibleSinceTick[slot] =
          state.navigationIntentTick >>> 0
      }
    }
    const pendingAge =
      (state.navigationIntentTick - zombies.navigationIntentPendingSinceTick[slot]!) >>> 0
    oldestPendingAgeTicks = Math.max(oldestPendingAgeTicks, pendingAge)
    const noProgressAge =
      (state.navigationIntentTick - zombies.navigationSparseFlowSearchLastProgressTick[slot]!) >>> 0
    oldestPendingNoProgressAgeTicks = Math.max(oldestPendingNoProgressAgeTicks, noProgressAge)
    if (zombies.navigationIntentHasReceivedFirstService[slot] === 0) {
      unservicedPendingCount += 1
      const unservicedAge =
        (state.navigationIntentTick -
          zombies.navigationIntentFirstServiceEligibleSinceTick[slot]!) >>>
        0
      oldestUnservicedAgeTicks = Math.max(oldestUnservicedAgeTicks, unservicedAge)
    }
  }
  state.navigationAnchoredAgentCount = anchoredAgentCount
  state.navigationIntentOldestPendingAgeTicks = oldestPendingAgeTicks
  state.navigationIntentOldestUnservicedAgeTicks = oldestUnservicedAgeTicks
  state.navigationIntentMaximumUnservicedAgeTicksObserved = Math.max(
    state.navigationIntentMaximumUnservicedAgeTicksObserved,
    oldestUnservicedAgeTicks,
  )
  state.navigationIntentUnservicedPendingCount = unservicedPendingCount
  state.navigationLivingWithoutCommittedActionCount = livingWithoutCommittedActionCount
  state.navigationRetainedPendingActionCount = retainedPendingActionCount
  state.navigationStaleTargetCount =
    state.collisionWorld.navigationMode === 'sparse' &&
    (!state.navigationGoalInitialized ||
      state.navigationGoalResolvedTick !== state.navigationIntentTick)
      ? 1
      : 0
  state.navigationSparseSearchPendingAgentCount = sparseSearchPendingAgentCount
  state.navigationSparseSearchActiveAgentCount = sparseSearchPendingAgentCount
  state.navigationSparseSearchWorldStaleActiveCount = sparseSearchWorldStaleActiveCount
  state.navigationWorldRefreshMinimumAppliedGeneration = worldRefreshMinimumAppliedRevision
  state.navigationWorldRefreshPendingCount = worldRefreshPendingCount
  state.navigationSparseSearchAgentOldestPendingNoProgressAgeTicks = oldestPendingNoProgressAgeTicks
  state.navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved = Math.max(
    state.navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved,
    oldestPendingNoProgressAgeTicks,
  )
  state.navigationSparseSearchNoProgressAgeTicks = Math.max(
    oldestPendingNoProgressAgeTicks,
    state.navigationSparseSearchTargetNoProgressAgeTicks,
    state.navigationSparseSearchSpawnNoProgressAgeTicks,
  )
  state.navigationSparseSearchMaximumNoProgressAgeTicksObserved = Math.max(
    state.navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved,
    state.navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved,
    state.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved,
  )
}

function cacheZombieEscapeNavigationIntent(
  state: ZombieEscapeSimulation,
  slot: number,
  navigationIntentTick: number,
  blockerObjectId: string | null,
  blockerObjectOrdinal: number,
  blockerIsBreakable: boolean,
  committedRouteGeneration: number,
  targetRevision: number,
  recordResolvedTick = true,
) {
  const zombies = state.zombies
  const sample = state.navigationSampleScratch
  zombies.navigationBlockerBreakable[slot] = blockerIsBreakable ? 1 : 0
  zombies.navigationBlockerObjectId[slot] = blockerObjectId
  zombies.navigationBlockerObjectOrdinal[slot] = blockerObjectOrdinal
  zombies.navigationBlockingDistance[slot] = sample.blockingDistance
  zombies.navigationBlockingX[slot] = sample.blockingX
  zombies.navigationBlockingZ[slot] = sample.blockingZ
  zombies.navigationDirectionX[slot] = sample.x
  zombies.navigationDirectionZ[slot] = sample.z
  zombies.navigationIntentHasCached[slot] = 1
  zombies.navigationIntentCommittedRouteGeneration[slot] = committedRouteGeneration
  zombies.navigationIntentCurrentTargetFallback[slot] = 0
  zombies.navigationIntentTargetRevision[slot] = targetRevision >>> 0
  zombies.navigationIntentPoolGeneration[slot] = zombies.pool.generation[slot] ?? 0
  if (recordResolvedTick) {
    zombies.navigationIntentResolvedTick[slot] = navigationIntentTick >>> 0
  }
  zombies.navigationIntentWorldGeneration[slot] = state.collisionWorldGeneration
  zombies.navigationReachable[slot] = sample.reachable ? 1 : 0
  zombies.navigationRequestedConnector[slot] = sample.connectorIndex
  zombies.navigationRequestedConnectorTargetEnd[slot] = sample.connectorTargetEnd ? 1 : 0
  zombies.navigationWaypointFallback[slot] = sample.waypointUsesFallback ? 1 : 0
  zombies.navigationWaypointNode[slot] = sample.waypointNode ?? -1
  zombies.navigationIntentValid[slot] = 1
}

function completeZombieEscapeRecoveredNavigationIntent(
  state: ZombieEscapeSimulation,
  slot: number,
  navigationIntentTick: number,
) {
  const zombies = state.zombies
  const recoveredDemand = zombies.navigationIntentPending[slot] !== 0
  cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
  if (recoveredDemand) {
    if (zombies.navigationIntentHasReceivedFirstService[slot] === 0) {
      state.navigationIntentInlineRecoveryWithoutFirstServiceCount += 1
    }
    cancelZombieEscapeSparseFlowSearch(state, slot)
    state.navigationIntentResolveScheduled[slot] = 0
    state.navigationIntentResolveCount += 1
    state.navigationIntentResolveCountThisTick += 1
    resolveZombieEscapeNavigationIntentDemand(state, slot)
  }
  cacheZombieEscapeNavigationIntent(
    state,
    slot,
    navigationIntentTick,
    null,
    -1,
    false,
    state.navigationTargetCommittedRouteGeneration,
    state.navigationTargetRequestedRevision,
    false,
  )
}

function writeZombieEscapeDirectNavigationSample(
  state: ZombieEscapeSimulation,
  sourceX: number,
  sourceZ: number,
) {
  const directionX = state.navigationGoalX - sourceX
  const directionZ = state.navigationGoalZ - sourceZ
  const directionLength = Math.hypot(directionX, directionZ)
  const sample = state.navigationSampleScratch
  sample.blockingDistance = Number.POSITIVE_INFINITY
  sample.blockingX = state.navigationGoalX
  sample.blockingZ = state.navigationGoalZ
  sample.connectorIndex = -1
  sample.connectorTargetEnd = false
  sample.reachable = true
  sample.waypointNode = -1
  sample.waypointUsesFallback = false
  sample.x = directionLength > 0.000_001 ? directionX / directionLength : 0
  sample.z = directionLength > 0.000_001 ? directionZ / directionLength : 0
  resetZombieEscapeNavigationHit(state.navigationHitScratch)
}

function copyZombieEscapeNavigationSample(
  target: ZombieEscapeFlowSample,
  source: ZombieEscapeFlowSample,
) {
  target.blockingDistance = source.blockingDistance
  target.blockingX = source.blockingX
  target.blockingZ = source.blockingZ
  target.connectorIndex = source.connectorIndex
  target.connectorTargetEnd = source.connectorTargetEnd
  target.reachable = source.reachable
  target.waypointNode = source.waypointNode
  target.waypointUsesFallback = source.waypointUsesFallback
  target.x = source.x
  target.z = source.z
}

function commitZombieEscapeSparseFlowSearchRouteCorridor(
  state: ZombieEscapeSimulation,
  slot: number,
  work: ZombieEscapeSparseFlowSearch,
  sample: ZombieEscapeFlowSample,
) {
  const committed = state.zombies.navigationSparseCommittedFlowSearch[slot]!
  if (!sample.reachable) {
    clearZombieEscapeSparseFlowSearchRouteCorridor(committed)
    return
  }
  if ((sample.waypointNode ?? -1) < 0) {
    clearZombieEscapeSparseFlowSearchRouteCorridor(committed)
    return
  }
  if (
    work.routeCorridorGeneration <= 0 ||
    work.routeCorridorGeneration !== state.navigationTargetCommittedRouteGeneration ||
    !seedZombieEscapeSparseFlowSearchRouteCorridor(
      committed,
      state.navigationField,
      sample.waypointNode!,
      sample.waypointUsesFallback === true,
    )
  ) {
    clearZombieEscapeSparseFlowSearchRouteCorridor(committed)
    return
  }
  publishZombieEscapeSharedRouteForSource(
    state,
    work.sourceX,
    work.sourceY,
    work.sourceZ,
    sample.waypointNode!,
    sample.waypointUsesFallback === true,
  )
}

function resetZombieEscapeSparseSearchTickMetrics(state: ZombieEscapeSimulation) {
  state.navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick = 0
  state.navigationSparseSearchAgentProgressSliceCountThisTick = 0
  state.navigationSparseSearchAgentServiceSliceCountThisTick = 0
  state.navigationSparseSearchCandidateVisitsThisTick = 0
  state.navigationSparseSearchCollisionPredicatesThisTick = 0
  state.navigationSparseSearchCompletionProgressThisTick = 0
  state.navigationSparseSearchGraphEdgeVisitsThisTick = 0
  state.navigationSparseSearchHeapOperationsThisTick = 0
  state.navigationSparseSearchHierarchyNodeVisitsThisTick = 0
  state.navigationSparseSearchServiceSliceCountThisTick = 0
  state.navigationSparseSearchSpawnProgressSliceCountThisTick = 0
  state.navigationSparseSearchSpawnServiceSliceCountThisTick = 0
  state.navigationSparseSearchSupportPredicatesThisTick = 0
  state.navigationSparseSearchTargetBuildsThisTick = 0
  state.navigationSparseSearchTargetProgressSliceCountThisTick = 0
  state.navigationSparseSearchTargetServiceSliceCountThisTick = 0
  resetZombieEscapeNavigationVisibilityWorkMetricsThisTick(state.navigationVisibilityWork)
  resetZombieEscapeSparseWorkMetricsThisTick(state.navigationSparseCachedFollowWork)
  resetZombieEscapeSparseWorkMetricsThisTick(state.navigationSparseFlowSearchWork)
  resetZombieEscapeSparseAttachmentWorkMetricsThisTick(state.navigationSparseSpawnWork)
  resetZombieEscapeSparseTargetWorkMetricsThisTick(state.navigationSparseTargetWork)
}

function resolveZombieEscapeSparseAgentSearchBudget(
  state: ZombieEscapeSimulation,
  remainingAgentSlicesIncludingCurrent: number,
  reserveSpawnSlice: boolean,
): ZombieEscapeSparseSearchBudget {
  const budget = state.navigationSparseSearchBudgetScratch
  const reservedTailSlices = reserveSpawnSlice
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchSpawnSlicesPerTick
    : 0
  budget.maximumCandidateVisits = resolveZombieEscapeSparseAgentWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerAgentSlice,
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerTick,
    state.navigationSparseSearchCandidateVisitsThisTick -
      state.navigationSparseTargetWork.candidateVisitsThisTick,
    remainingAgentSlicesIncludingCurrent,
    reservedTailSlices,
  )
  budget.maximumCollisionPredicates = resolveZombieEscapeSparseAgentWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice,
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick,
    state.navigationSparseSearchCollisionPredicatesThisTick,
    remainingAgentSlicesIncludingCurrent,
    reservedTailSlices,
  )
  budget.maximumHeapOperations = resolveZombieEscapeSparseAgentWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerAgentSlice,
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick,
    state.navigationSparseSearchHeapOperationsThisTick -
      state.navigationSparseTargetWork.heapOperationsThisTick,
    remainingAgentSlicesIncludingCurrent,
    reservedTailSlices,
  )
  budget.maximumHierarchyNodeVisits = resolveZombieEscapeSparseAgentWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice,
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick,
    state.navigationSparseSearchHierarchyNodeVisitsThisTick,
    remainingAgentSlicesIncludingCurrent,
    reservedTailSlices,
  )
  budget.maximumSupportPredicates = resolveZombieEscapeSparseAgentWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerAgentSlice,
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerTick,
    state.navigationSparseSearchSupportPredicatesThisTick,
    remainingAgentSlicesIncludingCurrent,
    reservedTailSlices,
  )
  return budget
}

function resolveZombieEscapeSparseTargetSearchBudget(
  state: ZombieEscapeSimulation,
  reservedCommonWorkSlices: number,
): ZombieEscapeSparseTargetUpdateBudget {
  const budget = state.navigationSparseSearchBudgetScratch
  const compactTarget =
    state.collisionWorld.navigationGraph.nodeIds.length <=
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumNodeCount
  budget.maximumCandidateVisits = resolveZombieEscapeSparseSharedWorkBudgetLimit(
    compactTarget
      ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick
      : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetCandidateVisitsPerTick,
    state.navigationSparseTargetWork.candidateVisitsThisTick,
    reservedCommonWorkSlices,
  )
  budget.maximumCollisionPredicates = resolveZombieEscapeSparseSharedWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick,
    state.navigationSparseSearchCollisionPredicatesThisTick,
    reservedCommonWorkSlices,
  )
  budget.maximumGraphEdgeVisits = Math.max(
    0,
    (compactTarget
      ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick
      : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick) -
      state.navigationSparseTargetWork.graphEdgeVisitsThisTick,
  )
  budget.maximumHeapOperations = resolveZombieEscapeSparseSharedWorkBudgetLimit(
    compactTarget
      ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick
      : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetHeapOperationsPerTick,
    state.navigationSparseTargetWork.heapOperationsThisTick,
    reservedCommonWorkSlices,
  )
  budget.maximumHierarchyNodeVisits = resolveZombieEscapeSparseSharedWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick,
    state.navigationSparseSearchHierarchyNodeVisitsThisTick,
    reservedCommonWorkSlices,
  )
  budget.maximumSupportPredicates = resolveZombieEscapeSparseSharedWorkBudgetLimit(
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerTick,
    state.navigationSparseSearchSupportPredicatesThisTick,
    reservedCommonWorkSlices,
  )
  return budget
}

function accumulateZombieEscapeSparseSearchWork(
  state: ZombieEscapeSimulation,
  work: ZombieEscapeSparseStepWork,
  category: ZombieEscapeSparseWorkMetrics | ZombieEscapeSparseTargetWorkMetrics,
) {
  const visibility = state.navigationVisibilityWork
  const graphEdgeVisits = work.lastStepGraphEdgeVisits ?? 0
  const heapOperations = work.lastStepHeapOperations
  state.navigationSparseSearchCandidateVisitsThisTick += work.lastStepCandidateVisits
  state.navigationSparseSearchCandidateVisitsTotal += work.lastStepCandidateVisits
  state.navigationSparseSearchCollisionPredicatesThisTick += work.lastStepCollisionPredicates
  state.navigationSparseSearchCollisionPredicatesTotal += work.lastStepCollisionPredicates
  state.navigationSparseSearchGraphEdgeVisitsThisTick += graphEdgeVisits
  state.navigationSparseSearchGraphEdgeVisitsTotal += graphEdgeVisits
  state.navigationSparseSearchHeapOperationsThisTick += heapOperations
  state.navigationSparseSearchHeapOperationsTotal += heapOperations
  state.navigationSparseSearchHierarchyNodeVisitsThisTick += work.lastStepHierarchyNodeVisits
  state.navigationSparseSearchHierarchyNodeVisitsTotal += work.lastStepHierarchyNodeVisits
  state.navigationSparseSearchSupportPredicatesThisTick += work.lastStepSupportPredicates
  state.navigationSparseSearchSupportPredicatesTotal += work.lastStepSupportPredicates
  visibility.colliderCandidateVisitsThisTick += work.lastStepColliderCandidateVisits
  visibility.colliderCandidateVisitsTotal += work.lastStepColliderCandidateVisits
  visibility.colliderHierarchyNodeVisitsThisTick += work.lastStepColliderHierarchyNodeVisits
  visibility.colliderHierarchyNodeVisitsTotal += work.lastStepColliderHierarchyNodeVisits
  visibility.supportHierarchyNodeVisitsThisTick += work.lastStepSupportHierarchyNodeVisits
  visibility.supportHierarchyNodeVisitsTotal += work.lastStepSupportHierarchyNodeVisits
  visibility.supportHoleVisitsThisTick += work.lastStepSupportHoleVisits
  visibility.supportHoleVisitsTotal += work.lastStepSupportHoleVisits
  visibility.supportItemVisitsThisTick += work.lastStepSupportItemVisits
  visibility.supportItemVisitsTotal += work.lastStepSupportItemVisits
  visibility.supportRingEdgeVisitsThisTick += work.lastStepSupportRingEdgeVisits
  visibility.supportRingEdgeVisitsTotal += work.lastStepSupportRingEdgeVisits
  visibility.supportRingHierarchyNodeVisitsThisTick += work.lastStepSupportRingHierarchyNodeVisits
  visibility.supportRingHierarchyNodeVisitsTotal += work.lastStepSupportRingHierarchyNodeVisits
  category.candidateVisitsThisTick += work.lastStepCandidateVisits
  category.candidateVisitsTotal += work.lastStepCandidateVisits
  category.collisionPredicatesThisTick += work.lastStepCollisionPredicates
  category.collisionPredicatesTotal += work.lastStepCollisionPredicates
  category.heapOperationsThisTick += heapOperations
  category.heapOperationsTotal += heapOperations
  category.hierarchyNodeVisitsThisTick += work.lastStepHierarchyNodeVisits
  category.hierarchyNodeVisitsTotal += work.lastStepHierarchyNodeVisits
  category.supportPredicatesThisTick += work.lastStepSupportPredicates
  category.supportPredicatesTotal += work.lastStepSupportPredicates
  if ('graphEdgeVisitsThisTick' in category) {
    category.graphEdgeVisitsThisTick += graphEdgeVisits
    category.graphEdgeVisitsTotal += graphEdgeVisits
  }
  return (
    work.lastStepCandidateVisits +
    work.lastStepCollisionPredicates +
    graphEdgeVisits +
    heapOperations +
    work.lastStepHierarchyNodeVisits +
    work.lastStepSupportPredicates
  )
}

function recordZombieEscapeSparseServiceSlice(
  state: ZombieEscapeSimulation,
  category: ZombieEscapeSparseServiceCategory,
  serviceCapacityProvided: boolean,
  consumedWork: number,
  progressedWithoutWork: boolean,
) {
  if (!serviceCapacityProvided) return
  if (category === 'agent') {
    state.navigationSparseSearchAgentServiceSliceCountThisTick += 1
    state.navigationSparseSearchAgentServiceSliceCountTotal += 1
  } else if (category === 'target') {
    state.navigationSparseSearchTargetServiceSliceCountThisTick += 1
    state.navigationSparseSearchTargetServiceSliceCountTotal += 1
  } else {
    state.navigationSparseSearchSpawnServiceSliceCountThisTick += 1
    state.navigationSparseSearchSpawnServiceSliceCountTotal += 1
  }
  state.navigationSparseSearchServiceSliceCountThisTick += 1
  state.navigationSparseSearchServiceSliceCountTotal += 1
  if (consumedWork <= 0 && !progressedWithoutWork) return
  if (category === 'agent') {
    state.navigationSparseSearchAgentProgressSliceCountThisTick += 1
    state.navigationSparseSearchAgentProgressSliceCountTotal += 1
  } else if (category === 'target') {
    state.navigationSparseSearchTargetProgressSliceCountThisTick += 1
    state.navigationSparseSearchTargetProgressSliceCountTotal += 1
  } else {
    state.navigationSparseSearchSpawnProgressSliceCountThisTick += 1
    state.navigationSparseSearchSpawnProgressSliceCountTotal += 1
  }
  state.navigationSparseSearchCompletionProgressThisTick += 1
  state.navigationSparseSearchCompletionProgressTotal += 1
}

function resolveZombieEscapeSparseNavigationIntentSlice(
  state: ZombieEscapeSimulation,
  slot: number,
  navigationIntentTick: number,
  remainingAgentSlicesIncludingCurrent: number,
  reserveSpawnSlice: boolean,
) {
  const zombies = state.zombies
  if (
    state.navigationField.graphSparseTargetUpdate.status === 'ready' &&
    state.navigationTargetCommittedRouteGeneration > 0 &&
    state.navigationField.targetLayerIndex < 0
  ) {
    cancelZombieEscapeSparseFlowSearch(state, slot)
    recordZombieEscapeSparseServiceSlice(state, 'agent', true, 0, true)
    markZombieEscapeNavigationIntentFirstService(state, slot)
    state.navigationIntentResolveCount += 1
    state.navigationIntentResolveCountThisTick += 1
    resolveZombieEscapeNavigationIntentDemand(state, slot)
    zombies.navigationSparseFlowSearchRestartToken[slot] = 0
    zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
    cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
    rejectZombieEscapeUnanchoredZombieFromNavigation(state, slot)
    return true
  }
  if (tryCompleteZombieEscapeSparseLocalReattachment(state, slot, navigationIntentTick)) {
    return true
  }
  const search = zombies.navigationSparseFlowSearch[slot]!
  const sample = zombies.navigationSparseFlowSample[slot]!
  const hit = zombies.navigationSparseFlowHit[slot]!
  if (!beginZombieEscapeSparseFlowSearchForAgent(state, slot)) return false
  const budget = resolveZombieEscapeSparseAgentSearchBudget(
    state,
    remainingAgentSlicesIncludingCurrent,
    reserveSpawnSlice,
  )
  const minimumWork = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMinimumWorkUnitsPerAgentSlice
  const serviceCapacityProvided =
    budget.maximumCandidateVisits >= minimumWork &&
    budget.maximumCollisionPredicates >= minimumWork &&
    budget.maximumHeapOperations >= minimumWork &&
    budget.maximumHierarchyNodeVisits >= minimumWork &&
    budget.maximumSupportPredicates >= minimumWork
  if (!serviceCapacityProvided) state.navigationSparseSearchBudgetViolationCount += 1
  const status = stepZombieEscapeSparseFlowSearch(
    search,
    state.navigationField,
    sample,
    budget,
    hit,
  )
  const consumedWork = accumulateZombieEscapeSparseSearchWork(
    state,
    search,
    state.navigationSparseFlowSearchWork,
  )
  recordZombieEscapeSparseServiceSlice(
    state,
    'agent',
    serviceCapacityProvided,
    consumedWork,
    status !== 'pending',
  )
  if (consumedWork > 0) {
    zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
    markZombieEscapeNavigationIntentFirstService(state, slot)
  }
  if (
    status === 'pending' &&
    !zombieEscapeSparseFlowSearchCanProgress(search, state.navigationField)
  ) {
    zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 1
    zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
    if (zombies.navigationIntentHasReceivedFirstService[slot] === 0) {
      zombies.navigationIntentFirstServiceEligibleSinceTick[slot] = state.navigationIntentTick >>> 0
    }
  }
  if (status === 'invalidated') {
    restartZombieEscapeSparseFlowSearch(state, slot, 'worldChanged')
    return false
  }
  if (status === 'routePublished') {
    if (restartZombieEscapeSparseFlowSearch(state, slot, 'routePublished')) {
      zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 0
    }
    return false
  }
  if (status === 'pending') return false
  if (zombieEscapeSparseFlowSearchHasAttachmentHeapLease(search, state.navigationField)) {
    cancelZombieEscapeSparseFlowSearch(state, slot)
    return false
  }

  zombies.navigationSparseFlowSearchActive[slot] = 0
  copyZombieEscapeNavigationSample(state.navigationSampleScratch, sample)
  const committedBlockingHit = search.blockingHit
  const blockerObjectId = resolveZombieEscapeCollisionHitObjectId(
    state.collisionWorld,
    committedBlockingHit,
  )
  const blockerObjectOrdinal = resolveZombieEscapeCollisionHitObjectOrdinal(
    state.collisionWorld,
    committedBlockingHit,
  )
  const blockerIsBreakable = isZombieEscapeCollisionHitBreakable(
    state.collisionWorld,
    committedBlockingHit,
  )
  if (!sample.reachable && !blockerIsBreakable) {
    state.navigationIntentResolveCount += 1
    state.navigationIntentResolveCountThisTick += 1
    resolveZombieEscapeNavigationIntentDemand(state, slot)
    zombies.navigationSparseFlowSearchRestartToken[slot] = 0
    zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
    search.preferredWaypointNode = -1
    search.preferredWaypointUsesFallback = false
    state.navigationSparseSearchCompletedCount += 1
    cancelZombieEscapeDeferredNavigationIntentAdmission(state, slot)
    rejectZombieEscapeUnanchoredZombieFromNavigation(state, slot)
    return true
  }
  if (!sample.reachable && blockerIsBreakable) {
    const blockerDirectionX = sample.blockingX - zombies.x[slot]!
    const blockerDirectionZ = sample.blockingZ - zombies.z[slot]!
    const blockerDistance = Math.hypot(blockerDirectionX, blockerDirectionZ)
    if (blockerDistance > ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackReachMeters) {
      sample.reachable = true
      sample.x = blockerDirectionX / blockerDistance
      sample.z = blockerDirectionZ / blockerDistance
    }
  }
  cacheZombieEscapeNavigationIntent(
    state,
    slot,
    navigationIntentTick,
    blockerObjectId,
    blockerObjectOrdinal,
    blockerIsBreakable,
    getZombieEscapeSparseFlowSearchRouteGeneration(search),
    state.navigationTargetRequestedRevision,
  )
  commitZombieEscapeSparseFlowSearchRouteCorridor(state, slot, search, sample)
  state.navigationIntentResolveCount += 1
  state.navigationIntentResolveCountThisTick += 1
  resolveZombieEscapeNavigationIntentDemand(state, slot)
  zombies.navigationSparseFlowSearchRestartToken[slot] = 0
  zombies.navigationSparseFlowSearchStartedForDemand[slot] = 0
  search.preferredWaypointNode = -1
  search.preferredWaypointUsesFallback = false
  state.navigationSparseSearchCompletedCount += 1
  return true
}

function finalizeZombieEscapeSparseSearchTickMetrics(state: ZombieEscapeSimulation) {
  const compactTarget =
    state.collisionWorld.navigationGraph.nodeIds.length <=
    ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumNodeCount
  const maximumTargetCandidateVisits = compactTarget
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick
    : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetCandidateVisitsPerTick
  const maximumTargetGraphEdgeVisits = compactTarget
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick
    : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick
  const maximumTargetHeapOperations = compactTarget
    ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick
    : ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetHeapOperationsPerTick
  state.navigationSparseSearchCandidateVisitsMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchCandidateVisitsMaximumObservedPerTick,
    state.navigationSparseSearchCandidateVisitsThisTick,
  )
  state.navigationSparseSearchCollisionPredicatesMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchCollisionPredicatesMaximumObservedPerTick,
    state.navigationSparseSearchCollisionPredicatesThisTick,
  )
  state.navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick,
    state.navigationSparseSearchGraphEdgeVisitsThisTick,
  )
  state.navigationSparseSearchHeapOperationsMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchHeapOperationsMaximumObservedPerTick,
    state.navigationSparseSearchHeapOperationsThisTick,
  )
  state.navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick,
    state.navigationSparseSearchHierarchyNodeVisitsThisTick,
  )
  state.navigationSparseSearchSupportPredicatesMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchSupportPredicatesMaximumObservedPerTick,
    state.navigationSparseSearchSupportPredicatesThisTick,
  )
  state.navigationSparseSearchTargetBuildsMaximumObservedPerTick = Math.max(
    state.navigationSparseSearchTargetBuildsMaximumObservedPerTick,
    state.navigationSparseSearchTargetBuildsThisTick,
  )
  finalizeZombieEscapeSparseWorkMetrics(state.navigationSparseCachedFollowWork)
  finalizeZombieEscapeSparseWorkMetrics(state.navigationSparseFlowSearchWork)
  finalizeZombieEscapeSparseAttachmentWorkMetrics(state.navigationSparseSpawnWork)
  finalizeZombieEscapeSparseTargetWorkMetrics(state.navigationSparseTargetWork)
  finalizeZombieEscapeNavigationVisibilityWorkMetrics(state.navigationVisibilityWork)
  if (
    state.navigationSparseSearchCandidateVisitsThisTick -
      state.navigationSparseTargetWork.candidateVisitsThisTick >
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerTick ||
    state.navigationSparseTargetWork.candidateVisitsThisTick > maximumTargetCandidateVisits ||
    state.navigationSparseSearchCollisionPredicatesThisTick >
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick ||
    state.navigationSparseTargetWork.graphEdgeVisitsThisTick > maximumTargetGraphEdgeVisits ||
    state.navigationSparseSearchHeapOperationsThisTick -
      state.navigationSparseTargetWork.heapOperationsThisTick >
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick ||
    state.navigationSparseTargetWork.heapOperationsThisTick > maximumTargetHeapOperations ||
    state.navigationSparseSearchHierarchyNodeVisitsThisTick >
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick ||
    state.navigationSparseSearchSupportPredicatesThisTick >
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerTick ||
    state.navigationSparseSearchTargetBuildsThisTick >
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetBuildsPerTick
  ) {
    state.navigationSparseSearchBudgetViolationCount += 1
  }
  const targetPending =
    state.collisionWorld.navigationMode === 'sparse' &&
    state.navigationField.graphSparseTargetUpdate.status === 'pending'
  if (!targetPending) {
    state.navigationSparseSearchTargetNoProgressAgeTicks = 0
  } else if (state.navigationSparseSearchTargetProgressSliceCountThisTick > 0) {
    state.navigationSparseSearchTargetNoProgressAgeTicks = 0
  } else {
    state.navigationSparseSearchTargetNoProgressAgeTicks += 1
    state.navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved = Math.max(
      state.navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved,
      state.navigationSparseSearchTargetNoProgressAgeTicks,
    )
  }
  if (
    !state.navigationSparseSpawnSearchActive ||
    state.navigationSparseSpawnSearchDependencyWaiting
  ) {
    state.navigationSparseSearchSpawnNoProgressAgeTicks = 0
  } else if (state.navigationSparseSearchSpawnProgressSliceCountThisTick > 0) {
    state.navigationSparseSearchSpawnNoProgressAgeTicks = 0
  } else {
    state.navigationSparseSearchSpawnNoProgressAgeTicks += 1
    state.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved = Math.max(
      state.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved,
      state.navigationSparseSearchSpawnNoProgressAgeTicks,
    )
  }
}

function restoreZombieEscapeNavigationIntent(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  const sample = state.navigationSampleScratch
  sample.blockingDistance = zombies.navigationBlockingDistance[slot]!
  sample.blockingX = zombies.navigationBlockingX[slot]!
  sample.blockingZ = zombies.navigationBlockingZ[slot]!
  sample.connectorIndex = zombies.navigationRequestedConnector[slot]!
  sample.connectorTargetEnd = zombies.navigationRequestedConnectorTargetEnd[slot] !== 0
  sample.reachable = zombies.navigationReachable[slot] !== 0
  sample.waypointNode = zombies.navigationWaypointNode[slot]!
  sample.waypointUsesFallback = zombies.navigationWaypointFallback[slot] !== 0
  sample.x = zombies.navigationDirectionX[slot]!
  sample.z = zombies.navigationDirectionZ[slot]!
  resetZombieEscapeNavigationHit(state.navigationHitScratch)
}

function resetZombieEscapeUnresolvedNavigationSample(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
) {
  const sample = state.navigationSampleScratch
  sample.blockingDistance = Number.POSITIVE_INFINITY
  sample.blockingX = x
  sample.blockingZ = z
  sample.connectorIndex = -1
  sample.connectorTargetEnd = false
  sample.reachable = false
  sample.waypointNode = -1
  sample.waypointUsesFallback = false
  sample.x = 0
  sample.z = 0
  resetZombieEscapeNavigationHit(state.navigationHitScratch)
}

function writeZombieEscapeHeldNavigationSample(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
) {
  resetZombieEscapeUnresolvedNavigationSample(state, x, z)
  state.navigationSampleScratch.reachable = true
}

export function writeZombieEscapeDeferredNavigationDirection(
  _status: 'pending' | 'refresh',
  agentRadius: number,
  sourceX: number,
  sourceZ: number,
  waypointX: number,
  waypointZ: number,
  output: Pick<ZombieEscapeFlowSample, 'x' | 'z'>,
) {
  const directionX = waypointX - sourceX
  const directionZ = waypointZ - sourceZ
  const directionLength = Math.hypot(directionX, directionZ)
  const arrivalRadius = Math.max(0.08, agentRadius * 0.5)
  output.x = directionLength > arrivalRadius ? directionX / directionLength : 0
  output.z = directionLength > arrivalRadius ? directionZ / directionLength : 0
}

function updateZombieEscapeSparseNavigationTarget(
  state: ZombieEscapeSimulation,
  reservedCommonWorkSlices: number,
  liveGoalRegionIndex: number,
) {
  const field = state.navigationField
  const targetUpdate = field.graphSparseTargetUpdate
  const requestedRevisionBeforeBegin = getZombieEscapeSparseRequestedTargetRevision(field)
  state.navigationTargetRequestedLayerHint =
    targetUpdate.requestedTargetLayerHint >= 0
      ? targetUpdate.requestedTargetLayerHint
      : targetUpdate.status === 'ready'
        ? targetUpdate.routeTargetLayerIndex
        : state.navigationTargetRequestedLayerHint
  const routeTargetChanged = updateZombieEscapeNavigationRouteTarget(state, liveGoalRegionIndex)
  beginZombieEscapeSparseTargetUpdate(
    field,
    state.navigationRouteTargetX,
    state.navigationRouteTargetZ,
    state.navigationRouteTargetY,
    routeTargetChanged,
  )
  if (getZombieEscapeSparseRequestedTargetRevision(field) !== requestedRevisionBeforeBegin) {
    state.navigationTargetRequestedLayerHint = -1
  }
  if (targetUpdate.status === 'pending') {
    preemptZombieEscapeSparseSearchesBlockingTargetPublication(state)
    const previousCompletedBuilds =
      targetUpdate.completedStrictBuilds + targetUpdate.completedFallbackBuilds
    const status = stepZombieEscapeSparseTargetUpdate(
      field,
      resolveZombieEscapeSparseTargetSearchBudget(state, reservedCommonWorkSlices),
    )
    const consumedWork = accumulateZombieEscapeSparseSearchWork(
      state,
      targetUpdate,
      state.navigationSparseTargetWork,
    )
    const completedBuilds =
      targetUpdate.completedStrictBuilds +
      targetUpdate.completedFallbackBuilds -
      previousCompletedBuilds
    state.navigationSparseSearchTargetBuildsThisTick += completedBuilds
    state.navigationSparseSearchTargetBuildsTotal += completedBuilds
    recordZombieEscapeSparseServiceSlice(
      state,
      'target',
      true,
      consumedWork,
      completedBuilds > 0 || status !== 'pending',
    )
  }
  state.navigationTargetRequestedLayerHint =
    targetUpdate.requestedTargetLayerHint >= 0
      ? targetUpdate.requestedTargetLayerHint
      : targetUpdate.status === 'ready'
        ? targetUpdate.routeTargetLayerIndex
        : state.navigationTargetRequestedLayerHint
  state.navigationTargetRequestedRevision = getZombieEscapeSparseRequestedTargetRevision(field)
  state.navigationTargetCommittedRouteGeneration =
    getZombieEscapeSparseCommittedRouteGeneration(field)
}

function preemptZombieEscapeSparseSearchesBlockingTargetPublication(state: ZombieEscapeSimulation) {
  const targetUpdate = state.navigationField.graphSparseTargetUpdate
  if (targetUpdate.phase !== 'wait-staging-bank') return 0
  const zombies = state.zombies
  let preemptedCount = 0
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (state.multiplayer && !state.multiplayer.targetMatchesActive(slot)) continue
    const search = zombies.navigationSparseFlowSearch[slot]!
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.navigationSparseFlowSearchActive[slot] === 0 ||
      !zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease(search, state.navigationField)
    ) {
      continue
    }
    if (zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] !== 0) {
      const searchRouteGeneration = getZombieEscapeSparseFlowSearchRouteGeneration(search)
      if (
        searchRouteGeneration > 0 &&
        searchRouteGeneration < state.navigationTargetCommittedRouteGeneration
      ) {
        restartZombieEscapeSparseFlowSearch(state, slot, 'routePublished')
        preemptedCount += 1
      }
      continue
    }
    if (restartZombieEscapeSparseFlowSearch(state, slot, 'targetPublicationPreemption')) {
      preemptedCount += 1
    }
  }
  return preemptedCount
}

function releaseZombieEscapePreemptedDemandsAfterTargetPublication(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (state.multiplayer && !state.multiplayer.targetMatchesActive(slot)) continue
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.health[slot]! <= 0 ||
      zombies.navigationIntentPending[slot] === 0 ||
      zombies.navigationIntentHasCached[slot] !== 0 ||
      zombies.navigationSparseFlowSearchActive[slot] !== 0 ||
      zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] === 0
    ) {
      continue
    }
    if (
      zombies.navigationConnector[slot]! < 0 &&
      zombies.navigationIntentPoolGeneration[slot] === zombies.pool.generation[slot] &&
      zombies.navigationIntentWorldGeneration[slot] === state.collisionWorldGeneration &&
      writeZombieEscapeSparseLocalNavigationSample(
        state,
        slot,
        zombies.x[slot]!,
        zombies.y[slot]!,
        zombies.z[slot]!,
      )
    ) {
      completeZombieEscapeRecoveredNavigationIntent(state, slot, state.navigationIntentTick)
      continue
    }
    zombies.navigationSparseFlowSearchDependencyWaiting[slot] = 0
    zombies.navigationSparseFlowSearchLastProgressTick[slot] = state.navigationIntentTick >>> 0
    zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] = 0
  }
}

function recoverZombieEscapeUnanchoredDemandsAfterTargetPublication(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (state.multiplayer && !state.multiplayer.targetMatchesActive(slot)) continue
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.health[slot]! <= 0 ||
      zombies.navigationConnector[slot]! >= 0 ||
      zombies.navigationIntentPending[slot] === 0 ||
      zombies.navigationIntentHasCached[slot] !== 0 ||
      zombies.navigationIntentValid[slot] !== 0 ||
      zombies.navigationWaypointNode[slot]! >= 0 ||
      zombies.navigationIntentPoolGeneration[slot] !== zombies.pool.generation[slot] ||
      zombies.navigationIntentWorldGeneration[slot] !== state.collisionWorldGeneration ||
      !writeZombieEscapeSparseLocalNavigationSample(
        state,
        slot,
        zombies.x[slot]!,
        zombies.y[slot]!,
        zombies.z[slot]!,
      )
    ) {
      continue
    }
    completeZombieEscapeRecoveredNavigationIntent(state, slot, state.navigationIntentTick)
  }
}

function updateZombieEscapeNavigationRouteTarget(
  state: ZombieEscapeSimulation,
  liveGoalRegionIndex: number,
) {
  const cellSize = Math.max(0.000_001, state.collisionWorld.cellSize)
  const liveGoalCellX = Math.floor(state.navigationGoalX / cellSize)
  const liveGoalCellZ = Math.floor(state.navigationGoalZ / cellSize)
  const targetUpdate = state.navigationField.graphSparseTargetUpdate
  if (state.navigationRouteTargetInitialized) {
    const horizontalTerminalDrift = Math.hypot(
      state.navigationGoalX - state.navigationRouteTargetX,
      state.navigationGoalZ - state.navigationRouteTargetZ,
    )
    if (
      horizontalTerminalDrift <= 0.000_001 &&
      liveGoalRegionIndex === state.navigationRouteTargetRegionIndex
    ) {
      return false
    }
    const queuedTargetDrift = Math.hypot(
      state.navigationGoalX - targetUpdate.requestedTargetX,
      state.navigationGoalZ - targetUpdate.requestedTargetZ,
    )
    if (
      targetUpdate.status === 'pending' &&
      queuedTargetDrift <= ZOMBIE_ESCAPE_ROUTE_TARGET_MAXIMUM_DRIFT_METERS &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        targetUpdate.requestedTargetX,
        targetUpdate.requestedTargetY,
        targetUpdate.requestedTargetZ,
        state.navigationGoalX,
        state.navigationGoalY,
        state.navigationGoalZ,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    ) {
      state.navigationRouteTargetCellX = Math.floor(targetUpdate.requestedTargetX / cellSize)
      state.navigationRouteTargetCellZ = Math.floor(targetUpdate.requestedTargetZ / cellSize)
      state.navigationRouteTargetX = targetUpdate.requestedTargetX
      state.navigationRouteTargetY = targetUpdate.requestedTargetY
      state.navigationRouteTargetZ = targetUpdate.requestedTargetZ
      state.navigationRouteTargetRegionIndex = liveGoalRegionIndex
      return false
    }
    const committedTargetDrift = Math.hypot(
      state.navigationGoalX - targetUpdate.routeTargetX,
      state.navigationGoalZ - targetUpdate.routeTargetZ,
    )
    if (
      targetUpdate.status === 'pending' &&
      targetUpdate.routeTargetInitialized &&
      committedTargetDrift <= ZOMBIE_ESCAPE_ROUTE_TARGET_MAXIMUM_DRIFT_METERS &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        targetUpdate.routeTargetX,
        targetUpdate.routeTargetY,
        targetUpdate.routeTargetZ,
        state.navigationGoalX,
        state.navigationGoalY,
        state.navigationGoalZ,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    ) {
      state.navigationRouteTargetCellX = Math.floor(targetUpdate.routeTargetX / cellSize)
      state.navigationRouteTargetCellZ = Math.floor(targetUpdate.routeTargetZ / cellSize)
      state.navigationRouteTargetX = targetUpdate.routeTargetX
      state.navigationRouteTargetY = targetUpdate.routeTargetY
      state.navigationRouteTargetZ = targetUpdate.routeTargetZ
      state.navigationRouteTargetRegionIndex = liveGoalRegionIndex
      return false
    }
    const activeTargetDrift = Math.hypot(
      state.navigationGoalX - targetUpdate.activeTargetX,
      state.navigationGoalZ - targetUpdate.activeTargetZ,
    )
    if (
      targetUpdate.status === 'pending' &&
      activeTargetDrift <= ZOMBIE_ESCAPE_ROUTE_TARGET_MAXIMUM_DRIFT_METERS &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        targetUpdate.activeTargetX,
        targetUpdate.activeTargetY,
        targetUpdate.activeTargetZ,
        state.navigationGoalX,
        state.navigationGoalY,
        state.navigationGoalZ,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    ) {
      state.navigationRouteTargetCellX = Math.floor(targetUpdate.activeTargetX / cellSize)
      state.navigationRouteTargetCellZ = Math.floor(targetUpdate.activeTargetZ / cellSize)
      state.navigationRouteTargetX = targetUpdate.activeTargetX
      state.navigationRouteTargetY = targetUpdate.activeTargetY
      state.navigationRouteTargetZ = targetUpdate.activeTargetZ
      state.navigationRouteTargetRegionIndex = liveGoalRegionIndex
      return false
    }
    const requestedTargetDrift = Math.hypot(
      state.navigationGoalX - state.navigationRouteTargetX,
      state.navigationGoalZ - state.navigationRouteTargetZ,
    )
    if (
      requestedTargetDrift <= ZOMBIE_ESCAPE_ROUTE_TARGET_MAXIMUM_DRIFT_METERS &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        state.navigationRouteTargetX,
        state.navigationRouteTargetY,
        state.navigationRouteTargetZ,
        state.navigationGoalX,
        state.navigationGoalY,
        state.navigationGoalZ,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    ) {
      state.navigationRouteTargetRegionIndex = liveGoalRegionIndex
      return false
    }
  }
  state.navigationRouteTargetCellX = liveGoalCellX
  state.navigationRouteTargetCellZ = liveGoalCellZ
  state.navigationRouteTargetInitialized = true
  state.navigationRouteTargetX = state.navigationGoalX
  state.navigationRouteTargetY = state.navigationGoalY
  state.navigationRouteTargetZ = state.navigationGoalZ
  state.navigationRouteTargetRegionIndex = liveGoalRegionIndex
  return true
}

function resolveZombieEscapeSparseLayerAtPosition(
  state: ZombieEscapeSimulation,
  x: number,
  y: number,
  z: number,
) {
  const graph = state.collisionWorld.navigationGraph
  let bestLayerIndex = -1
  let bestElevationDistance = Number.POSITIVE_INFINITY
  for (
    let layerIndex = 0;
    layerIndex < state.collisionWorld.navigationLayers.length;
    layerIndex += 1
  ) {
    const layer = state.collisionWorld.navigationLayers[layerIndex]!
    const elevationDistance = Math.abs(layer.elevation - y)
    if (
      elevationDistance > ZOMBIE_ESCAPE_LIVE_GOAL_LAYER_TOLERANCE_METERS ||
      elevationDistance >= bestElevationDistance ||
      resolveSparseNavigationStrictRegionIndex(graph.targetRegionIndex, layerIndex, x, z) < 0
    ) {
      continue
    }
    bestLayerIndex = layerIndex
    bestElevationDistance = elevationDistance
  }
  return bestLayerIndex
}

function updateZombieEscapePersistentNavigationGoal(state: ZombieEscapeSimulation) {
  const resolvedTick = state.navigationIntentTick >>> 0
  if (state.collisionWorld.navigationMode !== 'sparse') {
    state.navigationGoalInitialized = true
    state.navigationGoalLayerIndex = -1
    state.navigationGoalRegionIndex = -1
    state.navigationGoalResolvedTick = resolvedTick
    state.navigationGoalX = state.player.x
    state.navigationGoalY = state.player.y
    state.navigationGoalZ = state.player.z
    state.navigationTargetY = state.player.y
    return -1
  }

  const graph = state.collisionWorld.navigationGraph
  let goalX = state.player.x
  let goalZ = state.player.z
  let layerIndex = resolveZombieEscapeSparseLayerAtPosition(
    state,
    state.player.x,
    state.player.y,
    state.player.z,
  )
  let regionIndex =
    layerIndex >= 0
      ? resolveSparseNavigationStrictRegionIndex(
          graph.targetRegionIndex,
          layerIndex,
          state.player.x,
          state.player.z,
        )
      : -1

  if (layerIndex < 0) {
    let bestConnectorDistanceSquared = Number.POSITIVE_INFINITY
    const connectorEndpointInset = state.collisionWorld.agentRadius + 0.05
    for (const connector of state.collisionWorld.navigationConnectors) {
      const connectorX = connector.endX - connector.startX
      const connectorY = connector.endY - connector.startY
      const connectorZ = connector.endZ - connector.startZ
      const connectorLengthSquared =
        connectorX * connectorX + connectorY * connectorY + connectorZ * connectorZ
      const amount =
        connectorLengthSquared <= 0.000_001
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((state.player.x - connector.startX) * connectorX +
                  (state.player.y - connector.startY) * connectorY +
                  (state.player.z - connector.startZ) * connectorZ) /
                  connectorLengthSquared,
              ),
            )
      const closestX = connector.startX + connectorX * amount
      const closestY = connector.startY + connectorY * amount
      const closestZ = connector.startZ + connectorZ * amount
      const connectorDistanceSquared =
        (state.player.x - closestX) ** 2 +
        (state.player.y - closestY) ** 2 +
        (state.player.z - closestZ) ** 2
      const connectorCaptureRadius = connector.halfWidth + state.collisionWorld.agentRadius + 0.35
      if (connectorDistanceSquared > connectorCaptureRadius * connectorCaptureRadius) continue
      const usesStart = amount < 0.5
      const endpointX = usesStart
        ? connector.startX - connector.directionX * connectorEndpointInset
        : connector.endX + connector.directionX * connectorEndpointInset
      const endpointY = usesStart ? connector.startY : connector.endY
      const endpointZ = usesStart
        ? connector.startZ - connector.directionZ * connectorEndpointInset
        : connector.endZ + connector.directionZ * connectorEndpointInset
      const endpointLayerIndex = resolveZombieEscapeSparseLayerAtPosition(
        state,
        endpointX,
        endpointY,
        endpointZ,
      )
      if (endpointLayerIndex < 0) continue
      const endpointRegionIndex = resolveSparseNavigationStrictRegionIndex(
        graph.targetRegionIndex,
        endpointLayerIndex,
        endpointX,
        endpointZ,
      )
      const endpointDistanceSquared =
        (endpointX - state.player.x) ** 2 +
        (endpointY - state.player.y) ** 2 +
        (endpointZ - state.player.z) ** 2
      if (endpointRegionIndex < 0 || endpointDistanceSquared >= bestConnectorDistanceSquared) {
        continue
      }
      bestConnectorDistanceSquared = endpointDistanceSquared
      layerIndex = endpointLayerIndex
      regionIndex = endpointRegionIndex
      goalX = endpointX
      goalZ = endpointZ
    }
  }

  if (layerIndex < 0) {
    const previousLayer = state.collisionWorld.navigationLayers[state.navigationGoalLayerIndex]
    if (
      state.navigationGoalInitialized &&
      previousLayer !== undefined &&
      Math.abs(previousLayer.elevation - state.player.y) <=
        ZOMBIE_ESCAPE_LIVE_GOAL_PROJECTION_MAXIMUM_LAYER_DISTANCE_METERS &&
      resolveSparseNavigationNearestStrictTargetProjection(
        graph.targetRegionIndex,
        state.navigationGoalLayerIndex,
        state.player.x,
        state.player.z,
        ZOMBIE_ESCAPE_LIVE_GOAL_PROJECTION_MAXIMUM_DISTANCE_METERS,
        state.navigationGoalProjectionScratch,
      )
    ) {
      layerIndex = state.navigationGoalLayerIndex
      regionIndex = state.navigationGoalProjectionScratch.regionIndex
      goalX = state.navigationGoalProjectionScratch.x
      goalZ = state.navigationGoalProjectionScratch.z
    }
  }

  if (layerIndex < 0) {
    let bestElevationDistance = Number.POSITIVE_INFINITY
    let bestProjectionDistanceSquared = Number.POSITIVE_INFINITY
    for (
      let candidateLayerIndex = 0;
      candidateLayerIndex < state.collisionWorld.navigationLayers.length;
      candidateLayerIndex += 1
    ) {
      const candidateLayer = state.collisionWorld.navigationLayers[candidateLayerIndex]!
      const elevationDistance = Math.abs(candidateLayer.elevation - state.player.y)
      if (
        elevationDistance > ZOMBIE_ESCAPE_LIVE_GOAL_PROJECTION_MAXIMUM_LAYER_DISTANCE_METERS ||
        !resolveSparseNavigationNearestStrictTargetProjection(
          graph.targetRegionIndex,
          candidateLayerIndex,
          state.player.x,
          state.player.z,
          ZOMBIE_ESCAPE_LIVE_GOAL_PROJECTION_MAXIMUM_DISTANCE_METERS,
          state.navigationGoalProjectionScratch,
        )
      ) {
        continue
      }
      const projectionDistanceSquared = state.navigationGoalProjectionScratch.distanceSquared
      if (
        elevationDistance > bestElevationDistance + 0.000_001 ||
        (Math.abs(elevationDistance - bestElevationDistance) <= 0.000_001 &&
          projectionDistanceSquared >= bestProjectionDistanceSquared)
      ) {
        continue
      }
      bestElevationDistance = elevationDistance
      bestProjectionDistanceSquared = projectionDistanceSquared
      layerIndex = candidateLayerIndex
      regionIndex = state.navigationGoalProjectionScratch.regionIndex
      goalX = state.navigationGoalProjectionScratch.x
      goalZ = state.navigationGoalProjectionScratch.z
    }
  }

  if (layerIndex >= 0 && regionIndex >= 0) {
    state.navigationGoalInitialized = true
    state.navigationGoalLayerIndex = layerIndex
    state.navigationGoalRegionIndex = regionIndex
    state.navigationGoalResolvedTick = resolvedTick
    state.navigationGoalX = goalX
    state.navigationGoalY = state.collisionWorld.navigationLayers[layerIndex]!.elevation
    state.navigationGoalZ = goalZ
  } else {
    state.navigationGoalInitialized = false
    state.navigationGoalLayerIndex = -1
    state.navigationGoalRegionIndex = -1
    state.navigationGoalResolvedTick = resolvedTick
    state.navigationGoalX = state.player.x
    state.navigationGoalY = state.player.y
    state.navigationGoalZ = state.player.z
  }
  state.navigationTargetY = state.navigationGoalInitialized ? state.navigationGoalY : state.player.y
  return state.navigationGoalInitialized ? state.navigationGoalRegionIndex : -1
}

function resolveZombieEscapePlayerTrailConnector(
  state: ZombieEscapeSimulation,
  source: ZombieEscapePlayerTrailPoint,
  targetLayerIndex: number,
  targetX: number,
  targetY: number,
  targetZ: number,
) {
  let bestDirectConnector = 0
  let bestDirectScore = Number.POSITIVE_INFINITY
  for (
    let connectorIndex = 0;
    connectorIndex < state.collisionWorld.navigationConnectors.length;
    connectorIndex += 1
  ) {
    const connector = state.collisionWorld.navigationConnectors[connectorIndex]!
    for (const targetEnd of [true, false]) {
      const sourceLayerIndex = targetEnd ? connector.startLayerIndex : connector.endLayerIndex
      const destinationLayerIndex = targetEnd ? connector.endLayerIndex : connector.startLayerIndex
      if (sourceLayerIndex !== source.layerIndex || destinationLayerIndex !== targetLayerIndex) {
        continue
      }
      const sourceX = targetEnd ? connector.startX : connector.endX
      const sourceY = targetEnd ? connector.startY : connector.endY
      const sourceZ = targetEnd ? connector.startZ : connector.endZ
      const destinationX = targetEnd ? connector.endX : connector.startX
      const destinationY = targetEnd ? connector.endY : connector.startY
      const destinationZ = targetEnd ? connector.endZ : connector.startZ
      const maximumEndpointDistance = connector.halfWidth + state.collisionWorld.agentRadius + 0.75
      const sourceDistanceSquared =
        (source.x - sourceX) ** 2 + (source.y - sourceY) ** 2 + (source.z - sourceZ) ** 2
      const destinationDistanceSquared =
        (targetX - destinationX) ** 2 +
        (targetY - destinationY) ** 2 +
        (targetZ - destinationZ) ** 2
      if (
        sourceDistanceSquared > maximumEndpointDistance ** 2 ||
        destinationDistanceSquared > maximumEndpointDistance ** 2
      ) {
        continue
      }
      const score = sourceDistanceSquared + destinationDistanceSquared
      if (score < bestDirectScore) {
        bestDirectScore = score
        bestDirectConnector = targetEnd ? connectorIndex + 1 : -(connectorIndex + 1)
      }
    }
  }
  if (bestDirectConnector !== 0) return bestDirectConnector

  const ascending = targetY > source.y
  let bestChainConnector = 0
  let bestChainScore = Number.POSITIVE_INFINITY
  for (
    let connectorIndex = 0;
    connectorIndex < state.collisionWorld.navigationConnectors.length;
    connectorIndex += 1
  ) {
    const connector = state.collisionWorld.navigationConnectors[connectorIndex]!
    const targetEnd = ascending ? connector.ascendingEnd : !connector.ascendingEnd
    const sourceLayerIndex = targetEnd ? connector.startLayerIndex : connector.endLayerIndex
    const chainTargetY = ascending ? connector.chainUpperY : connector.chainLowerY
    if (
      sourceLayerIndex !== source.layerIndex ||
      Math.abs(chainTargetY - targetY) > ZOMBIE_ESCAPE_LIVE_GOAL_LAYER_TOLERANCE_METERS
    ) {
      continue
    }
    let isChainEntry = true
    for (const candidate of state.collisionWorld.navigationConnectors) {
      if (
        candidate.chainId === connector.chainId &&
        (ascending
          ? candidate.chainOrder < connector.chainOrder
          : candidate.chainOrder > connector.chainOrder)
      ) {
        isChainEntry = false
        break
      }
    }
    if (!isChainEntry) continue
    const sourceX = targetEnd ? connector.startX : connector.endX
    const sourceY = targetEnd ? connector.startY : connector.endY
    const sourceZ = targetEnd ? connector.startZ : connector.endZ
    const sourceDistanceSquared =
      (source.x - sourceX) ** 2 + (source.y - sourceY) ** 2 + (source.z - sourceZ) ** 2
    const maximumEndpointDistance = connector.halfWidth + state.collisionWorld.agentRadius + 0.75
    if (sourceDistanceSquared > maximumEndpointDistance ** 2) continue
    if (sourceDistanceSquared < bestChainScore) {
      bestChainScore = sourceDistanceSquared
      bestChainConnector = targetEnd ? connectorIndex + 1 : -(connectorIndex + 1)
    }
  }
  return bestChainConnector
}

function updateZombieEscapePlayerTrail(state: ZombieEscapeSimulation) {
  const trail = state.playerTrail
  if (!state.navigationGoalInitialized) {
    if (trail.count > 0) resetZombieEscapePlayerTrail(trail)
    return
  }
  const input = state.playerTrailInputScratch
  input.layerIndex = state.navigationGoalLayerIndex
  input.regionIndex = state.navigationGoalRegionIndex
  input.tick = state.navigationIntentTick
  input.x = state.navigationGoalX
  input.y = state.navigationGoalY
  input.z = state.navigationGoalZ
  if (
    trail.count <= 0 ||
    !readZombieEscapePlayerTrailPoint(trail, trail.newestSequence, state.playerTrailPreviousScratch)
  ) {
    recordZombieEscapePlayerTrailPoint(trail, input, true)
    return
  }
  const previous = state.playerTrailPreviousScratch
  const distanceSquared =
    (input.x - previous.x) ** 2 + (input.y - previous.y) ** 2 + (input.z - previous.z) ** 2
  if (
    input.layerIndex === previous.layerIndex &&
    distanceSquared > ZOMBIE_ESCAPE_PLAYER_TRAIL_MAXIMUM_CONTINUITY_DISTANCE_METERS ** 2
  ) {
    resetZombieEscapePlayerTrail(trail)
    recordZombieEscapePlayerTrailPoint(trail, input, true)
    return
  }
  if (input.layerIndex !== previous.layerIndex) {
    const encodedConnector = resolveZombieEscapePlayerTrailConnector(
      state,
      previous,
      input.layerIndex,
      input.x,
      input.y,
      input.z,
    )
    if (encodedConnector === 0) {
      resetZombieEscapePlayerTrail(trail)
      recordZombieEscapePlayerTrailPoint(trail, input, true)
      return
    }
    const sourceSequence = previous.sequence
    recordZombieEscapePlayerTrailPoint(trail, input, true)
    setZombieEscapePlayerTrailOutgoingConnector(
      trail,
      sourceSequence,
      Math.abs(encodedConnector) - 1,
      encodedConnector > 0,
    )
    return
  }
  recordZombieEscapePlayerTrailPoint(trail, input)
}

function resetZombieEscapePlayerTrailValidation(zombies: ZombieEscapeZombiePool, slot: number) {
  zombies.pursuitTrailBlockerObjectId[slot] = null
  zombies.pursuitTrailBlockerObjectOrdinal[slot] = -1
  zombies.pursuitTrailBlockingX[slot] = 0
  zombies.pursuitTrailBlockingZ[slot] = 0
  zombies.pursuitTrailValidatedSequence[slot] = 0
  zombies.pursuitTrailValidatedSourceX[slot] = 0
  zombies.pursuitTrailValidatedSourceZ[slot] = 0
  zombies.pursuitTrailValidatedStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID
  zombies.pursuitTrailValidatedWorldRevision[slot] = 0
}

function resetZombieEscapePlayerTrailAcquisition(zombies: ZombieEscapeZombiePool, slot: number) {
  zombies.pursuitTrailAcquisitionBestDistanceSquared[slot] = Number.POSITIVE_INFINITY
  zombies.pursuitTrailAcquisitionBestSequence[slot] = 0
  zombies.pursuitTrailAcquisitionEndSequence[slot] = 0
  zombies.pursuitTrailAcquisitionGeneration[slot] = 0
  zombies.pursuitTrailAcquisitionLayerIndex[slot] = -1
  zombies.pursuitTrailAcquisitionNextSequence[slot] = 0
  zombies.pursuitTrailAcquisitionScannedNewestSequence[slot] = 0
  zombies.pursuitTrailAcquisitionSourceX[slot] = 0
  zombies.pursuitTrailAcquisitionSourceY[slot] = 0
  zombies.pursuitTrailAcquisitionSourceZ[slot] = 0
  zombies.pursuitTrailAcquisitionStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_IDLE
  zombies.pursuitTrailAcquisitionWorldRevision[slot] = 0
}

function beginZombieEscapePlayerTrailAcquisition(
  zombies: ZombieEscapeZombiePool,
  slot: number,
  generation: number,
  layerIndex: number,
  firstSequence: number,
  newestSequence: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  resetZombieEscapePlayerTrailAcquisition(zombies, slot)
  zombies.pursuitTrailAcquisitionEndSequence[slot] = firstSequence
  zombies.pursuitTrailAcquisitionGeneration[slot] = generation
  zombies.pursuitTrailAcquisitionLayerIndex[slot] = layerIndex
  zombies.pursuitTrailAcquisitionNextSequence[slot] = newestSequence
  zombies.pursuitTrailAcquisitionScannedNewestSequence[slot] = newestSequence
  zombies.pursuitTrailAcquisitionSourceX[slot] = sourceX
  zombies.pursuitTrailAcquisitionSourceY[slot] = sourceY
  zombies.pursuitTrailAcquisitionSourceZ[slot] = sourceZ
  zombies.pursuitTrailAcquisitionStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_SCANNING
}

function markZombieEscapePlayerTrailUnavailable(
  state: ZombieEscapeSimulation,
  slot: number,
  layerIndex: number,
  scannedNewestSequence: number,
) {
  const zombies = state.zombies
  const trail = state.playerTrail
  zombies.pursuitTrailGeneration[slot] = 0
  zombies.pursuitTrailReachableStartEndSequence[slot] = 0
  zombies.pursuitTrailSequence[slot] = 0
  zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
  zombies.pursuitTrailSeekingReachableStart[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
  resetZombieEscapePlayerTrailValidation(zombies, slot)
  resetZombieEscapePlayerTrailAcquisition(zombies, slot)
  zombies.pursuitTrailAcquisitionGeneration[slot] = trail.generation
  zombies.pursuitTrailAcquisitionLayerIndex[slot] = layerIndex
  zombies.pursuitTrailAcquisitionScannedNewestSequence[slot] = scannedNewestSequence
  zombies.pursuitTrailAcquisitionSourceX[slot] = zombies.x[slot]!
  zombies.pursuitTrailAcquisitionSourceY[slot] = zombies.y[slot]!
  zombies.pursuitTrailAcquisitionSourceZ[slot] = zombies.z[slot]!
  zombies.pursuitTrailAcquisitionStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_UNAVAILABLE
  zombies.pursuitTrailAcquisitionWorldRevision[slot] = state.navigationWorldRevision
}

function clearZombieEscapePlayerTrailPursuit(zombies: ZombieEscapeZombiePool, slot: number) {
  zombies.pursuitTrailConnectorSequence[slot] = 0
  zombies.pursuitTrailGeneration[slot] = 0
  zombies.pursuitTrailReachableStartEndSequence[slot] = 0
  zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
  zombies.pursuitTrailSeekingReachableStart[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
  zombies.pursuitTrailSequence[slot] = 0
  resetZombieEscapePlayerTrailValidation(zombies, slot)
  resetZombieEscapePlayerTrailAcquisition(zombies, slot)
}

function synchronizeZombieEscapePlayerTrailPursuit(state: ZombieEscapeSimulation, slot: number) {
  const trail = state.playerTrail
  if (trail.count <= 0 || trail.newestSequence <= 0) return
  const zombies = state.zombies
  if (
    zombies.pursuitTrailGeneration[slot] !== trail.generation ||
    zombies.pursuitTrailSequence[slot] !== trail.newestSequence ||
    zombies.pursuitTrailValidatedStatus[slot] ===
      ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_TERMINAL_CONSUMED ||
    zombies.pursuitTrailValidatedStatus[slot] ===
      ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_COLLISION_RETIRED
  ) {
    zombies.pursuitTrailGeneration[slot] = trail.generation
    zombies.pursuitTrailSequence[slot] = trail.newestSequence
    zombies.pursuitTrailReachableStartEndSequence[slot] = 0
    zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
    zombies.pursuitTrailSeekingReachableStart[slot] =
      ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
    resetZombieEscapePlayerTrailValidation(zombies, slot)
  }
  zombies.pursuitTrailConnectorSequence[slot] = 0
}

function acquireClosestZombieEscapePlayerTrailPoint(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
) {
  const trail = state.playerTrail
  const zombies = state.zombies
  const oldestSequence = getZombieEscapePlayerTrailOldestSequence(trail)
  const pursuitSequence = zombies.pursuitTrailSequence[slot]!
  if (
    zombies.pursuitTrailGeneration[slot] === trail.generation &&
    pursuitSequence >= oldestSequence &&
    pursuitSequence <= trail.newestSequence
  ) {
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_READY
  }
  zombies.pursuitTrailGeneration[slot] = 0
  zombies.pursuitTrailReachableStartEndSequence[slot] = 0
  zombies.pursuitTrailSequence[slot] = 0
  zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
  zombies.pursuitTrailSeekingReachableStart[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
  resetZombieEscapePlayerTrailValidation(zombies, slot)
  if (trail.count <= 0 || oldestSequence <= 0) {
    resetZombieEscapePlayerTrailAcquisition(zombies, slot)
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }

  const layerIndex =
    state.collisionWorld.navigationMode === 'sparse'
      ? resolveZombieEscapeSparseLayerAtPosition(state, sourceX, sourceY, sourceZ)
      : -1
  if (state.collisionWorld.navigationMode === 'sparse' && layerIndex < 0) {
    resetZombieEscapePlayerTrailAcquisition(zombies, slot)
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  let acquisitionChanged =
    zombies.pursuitTrailAcquisitionGeneration[slot] !== trail.generation ||
    zombies.pursuitTrailAcquisitionLayerIndex[slot] !== layerIndex
  if (
    !acquisitionChanged &&
    zombies.pursuitTrailAcquisitionStatus[slot] ===
      ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_UNAVAILABLE
  ) {
    const unavailableSourceDeltaX = sourceX - zombies.pursuitTrailAcquisitionSourceX[slot]!
    const unavailableSourceDeltaZ = sourceZ - zombies.pursuitTrailAcquisitionSourceZ[slot]!
    acquisitionChanged =
      zombies.pursuitTrailAcquisitionWorldRevision[slot] !== state.navigationWorldRevision ||
      unavailableSourceDeltaX * unavailableSourceDeltaX +
        unavailableSourceDeltaZ * unavailableSourceDeltaZ >=
        ZOMBIE_ESCAPE_PLAYER_TRAIL_UNAVAILABLE_RETRY_DISTANCE_METERS ** 2
  }
  if (acquisitionChanged) resetZombieEscapePlayerTrailAcquisition(zombies, slot)

  const acquisitionStatus = zombies.pursuitTrailAcquisitionStatus[slot]!
  if (
    acquisitionStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_UNAVAILABLE &&
    trail.newestSequence <= zombies.pursuitTrailAcquisitionScannedNewestSequence[slot]!
  ) {
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  if (acquisitionStatus !== ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_SCANNING) {
    const previousScannedNewest =
      acquisitionStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_UNAVAILABLE
        ? zombies.pursuitTrailAcquisitionScannedNewestSequence[slot]!
        : 0
    const firstSequence = Math.max(oldestSequence, previousScannedNewest + 1)
    if (firstSequence > trail.newestSequence) {
      markZombieEscapePlayerTrailUnavailable(state, slot, layerIndex, trail.newestSequence)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    }
    beginZombieEscapePlayerTrailAcquisition(
      zombies,
      slot,
      trail.generation,
      layerIndex,
      firstSequence,
      trail.newestSequence,
      sourceX,
      sourceY,
      sourceZ,
    )
  }

  zombies.pursuitTrailAcquisitionEndSequence[slot] = Math.max(
    zombies.pursuitTrailAcquisitionEndSequence[slot]!,
    oldestSequence,
  )

  const point = state.playerTrailTargetScratch
  let zombieCandidateBudgetRemaining =
    ZOMBIE_ESCAPE_SIMULATION.playerTrailClosestPointCandidateBudgetPerZombiePerTick
  let scannedCandidate = false
  while (
    state.playerTrailAcquisitionCandidateBudgetRemaining > 0 &&
    zombieCandidateBudgetRemaining > 0 &&
    zombies.pursuitTrailAcquisitionNextSequence[slot]! >=
      zombies.pursuitTrailAcquisitionEndSequence[slot]!
  ) {
    const sequence = zombies.pursuitTrailAcquisitionNextSequence[slot]!
    zombies.pursuitTrailAcquisitionNextSequence[slot] = sequence - 1
    state.playerTrailAcquisitionCandidateBudgetRemaining -= 1
    zombieCandidateBudgetRemaining -= 1
    scannedCandidate = true
    if (!readZombieEscapePlayerTrailPoint(trail, sequence, point)) {
      if (sequence < getZombieEscapePlayerTrailOldestSequence(trail)) continue
      resetZombieEscapePlayerTrailAcquisition(zombies, slot)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    }
    if (layerIndex >= 0 && point.layerIndex !== layerIndex) continue
    const distanceSquared =
      (point.x - zombies.pursuitTrailAcquisitionSourceX[slot]!) ** 2 +
      (point.y - zombies.pursuitTrailAcquisitionSourceY[slot]!) ** 2 +
      (point.z - zombies.pursuitTrailAcquisitionSourceZ[slot]!) ** 2
    const bestDistanceSquared = zombies.pursuitTrailAcquisitionBestDistanceSquared[slot]!
    const bestSequence = zombies.pursuitTrailAcquisitionBestSequence[slot]!
    if (
      distanceSquared < bestDistanceSquared ||
      (distanceSquared === bestDistanceSquared && sequence > bestSequence)
    ) {
      zombies.pursuitTrailAcquisitionBestDistanceSquared[slot] = distanceSquared
      zombies.pursuitTrailAcquisitionBestSequence[slot] = sequence
    }
  }
  if (
    zombies.pursuitTrailAcquisitionNextSequence[slot]! >=
    zombies.pursuitTrailAcquisitionEndSequence[slot]!
  ) {
    return scannedCandidate
      ? ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING
      : ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  const bestSequence = zombies.pursuitTrailAcquisitionBestSequence[slot]!
  const scannedNewestSequence = zombies.pursuitTrailAcquisitionScannedNewestSequence[slot]!
  if (bestSequence <= 0) {
    markZombieEscapePlayerTrailUnavailable(state, slot, layerIndex, scannedNewestSequence)
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  if (bestSequence < getZombieEscapePlayerTrailOldestSequence(trail)) {
    resetZombieEscapePlayerTrailAcquisition(zombies, slot)
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  zombies.pursuitTrailGeneration[slot] = trail.generation
  zombies.pursuitTrailSequence[slot] = bestSequence
  resetZombieEscapePlayerTrailValidation(zombies, slot)
  resetZombieEscapePlayerTrailAcquisition(zombies, slot)
  zombies.pursuitTrailReachableStartEndSequence[slot] = scannedNewestSequence
  zombies.pursuitTrailReachableStartOriginSequence[slot] = bestSequence
  zombies.pursuitTrailSeekingReachableStart[slot] =
    ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_BACKWARD
  return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_READY
}

function writeZombieEscapePlayerTrailNavigationSample(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  collisionRadius: number,
  forceTrailWork = false,
  respectRetainedRouteDirection = true,
) {
  const trail = state.playerTrail
  const zombies = state.zombies
  const sample = state.navigationSampleScratch
  const retainedRouteX = sample.x
  const retainedRouteZ = sample.z
  const retainedRouteReachable = sample.reachable
  const trailWorkPhase =
    forceTrailWork ||
    (state.navigationIntentTick + slot) % ZOMBIE_ESCAPE_PLAYER_TRAIL_REVALIDATION_INTERVAL_TICKS ===
      0
  zombies.pursuitTrailConnectorSequence[slot] = 0
  if (
    zombies.pursuitTrailGeneration[slot] !== trail.generation ||
    zombies.pursuitTrailSequence[slot]! <= 0
  ) {
    clearZombieEscapePlayerTrailPursuit(zombies, slot)
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  const target = state.playerTrailTargetScratch
  const arrivalRadius = Math.max(0.18, collisionRadius * 0.8)
  const reachableStartEndSequence =
    zombies.pursuitTrailReachableStartEndSequence[slot]! > 0
      ? zombies.pursuitTrailReachableStartEndSequence[slot]!
      : trail.newestSequence
  let sequence = zombies.pursuitTrailSequence[slot]!
  for (
    let advance = 0;
    advance < ZOMBIE_ESCAPE_PLAYER_TRAIL_MAXIMUM_ADVANCES_PER_TICK;
    advance += 1
  ) {
    if (
      zombies.pursuitTrailSeekingReachableStart[slot] ===
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_BACKWARD &&
      sequence < getZombieEscapePlayerTrailOldestSequence(trail)
    ) {
      const forwardSequence = zombies.pursuitTrailReachableStartOriginSequence[slot]! + 1
      if (forwardSequence > reachableStartEndSequence) {
        zombies.pursuitTrailSeekingReachableStart[slot] =
          ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
        return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
      }
      sequence = forwardSequence
      zombies.pursuitTrailSequence[slot] = sequence
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_FORWARD
      resetZombieEscapePlayerTrailValidation(zombies, slot)
    }
    if (!readZombieEscapePlayerTrailPoint(trail, sequence, target)) {
      clearZombieEscapePlayerTrailPursuit(zombies, slot)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    }
    const validatedSequence = zombies.pursuitTrailValidatedSequence[slot]!
    if (
      validatedSequence === sequence &&
      zombies.pursuitTrailValidatedWorldRevision[slot] !== state.navigationWorldRevision
    ) {
      zombies.pursuitTrailBlockerObjectId[slot] = null
      zombies.pursuitTrailBlockerObjectOrdinal[slot] = -1
      zombies.pursuitTrailBlockingX[slot] = 0
      zombies.pursuitTrailBlockingZ[slot] = 0
      zombies.pursuitTrailValidatedStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID
      zombies.pursuitTrailValidatedWorldRevision[slot] = state.navigationWorldRevision
      if (!trailWorkPhase) return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    }
    const validationStatus = zombies.pursuitTrailValidatedStatus[slot]!
    if (
      validatedSequence === sequence &&
      validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_TERMINAL_CONSUMED
    ) {
      if (sequence >= trail.newestSequence || !trailWorkPhase) {
        return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
      }
      if (target.connectorIndex >= 0) {
        resetZombieEscapePlayerTrailValidation(zombies, slot)
      } else {
        sequence += 1
        zombies.pursuitTrailSequence[slot] = sequence
        resetZombieEscapePlayerTrailValidation(zombies, slot)
        continue
      }
    }
    if (
      validatedSequence === sequence &&
      validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_COLLISION_RETIRED
    ) {
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    }
    if (
      validatedSequence === sequence &&
      validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID &&
      zombies.pursuitTrailSeekingReachableStart[slot] ===
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_FORWARD
    ) {
      if (sequence >= reachableStartEndSequence) {
        zombies.pursuitTrailSeekingReachableStart[slot] =
          ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
        return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
      }
      sequence += 1
      zombies.pursuitTrailSequence[slot] = sequence
      resetZombieEscapePlayerTrailValidation(zombies, slot)
      continue
    }
    const distanceSquared =
      (target.x - sourceX) ** 2 + (target.y - sourceY) ** 2 + (target.z - sourceZ) ** 2
    if (
      zombies.pursuitTrailSeekingReachableStart[slot] !== 0 ||
      target.connectorIndex >= 0 ||
      distanceSquared > arrivalRadius * arrivalRadius ||
      sequence >= trail.newestSequence
    ) {
      break
    }
    sequence += 1
    zombies.pursuitTrailSequence[slot] = sequence
    resetZombieEscapePlayerTrailValidation(zombies, slot)
  }
  if (!readZombieEscapePlayerTrailPoint(trail, sequence, target)) {
    clearZombieEscapePlayerTrailPursuit(zombies, slot)
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  const finalDistanceSquared =
    (target.x - sourceX) ** 2 + (target.y - sourceY) ** 2 + (target.z - sourceZ) ** 2
  if (
    respectRetainedRouteDirection &&
    target.connectorIndex < 0 &&
    sequence >= trail.newestSequence &&
    finalDistanceSquared <= arrivalRadius * arrivalRadius
  ) {
    resetZombieEscapePlayerTrailValidation(zombies, slot)
    zombies.pursuitTrailValidatedSequence[slot] = sequence
    zombies.pursuitTrailValidatedStatus[slot] =
      ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_TERMINAL_CONSUMED
    zombies.pursuitTrailValidatedWorldRevision[slot] = state.navigationWorldRevision
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }

  const cachedStatus = zombies.pursuitTrailValidatedStatus[slot]!
  if (
    zombies.pursuitTrailValidatedSequence[slot] === sequence &&
    zombies.pursuitTrailValidatedWorldRevision[slot] === state.navigationWorldRevision &&
    (cachedStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_CLEAR ||
      cachedStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE)
  ) {
    const validatedSourceX = zombies.pursuitTrailValidatedSourceX[slot]!
    const validatedSourceZ = zombies.pursuitTrailValidatedSourceZ[slot]!
    const segmentX = target.x - validatedSourceX
    const segmentZ = target.z - validatedSourceZ
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ
    const sourceOffsetX = sourceX - validatedSourceX
    const sourceOffsetZ = sourceZ - validatedSourceZ
    const sourceOffsetLengthSquared = sourceOffsetX * sourceOffsetX + sourceOffsetZ * sourceOffsetZ
    const sourceToleranceSquared =
      ZOMBIE_ESCAPE_PLAYER_TRAIL_SOURCE_TOLERANCE_METERS *
      ZOMBIE_ESCAPE_PLAYER_TRAIL_SOURCE_TOLERANCE_METERS
    const sourceAmount =
      segmentLengthSquared > sourceToleranceSquared
        ? (sourceOffsetX * segmentX + sourceOffsetZ * segmentZ) / segmentLengthSquared
        : 0
    const perpendicularX = sourceOffsetX - segmentX * sourceAmount
    const perpendicularZ = sourceOffsetZ - segmentZ * sourceAmount
    const remainsOnCertifiedSubsegment =
      Math.abs(sourceY - target.y) <= ZOMBIE_ESCAPE_LIVE_GOAL_LAYER_TOLERANCE_METERS &&
      (segmentLengthSquared <= sourceToleranceSquared
        ? sourceOffsetLengthSquared <= sourceToleranceSquared
        : sourceAmount >= 0 &&
          sourceAmount <= 1 &&
          perpendicularX * perpendicularX + perpendicularZ * perpendicularZ <=
            sourceToleranceSquared)
    const blockerAmount =
      segmentLengthSquared > sourceToleranceSquared
        ? ((zombies.pursuitTrailBlockingX[slot]! - validatedSourceX) * segmentX +
            (zombies.pursuitTrailBlockingZ[slot]! - validatedSourceZ) * segmentZ) /
          segmentLengthSquared
        : 0
    const hasNotPassedCachedBlocker =
      cachedStatus !== ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE ||
      sourceAmount <= blockerAmount
    if (!remainsOnCertifiedSubsegment || !hasNotPassedCachedBlocker) {
      zombies.pursuitTrailBlockerObjectId[slot] = null
      zombies.pursuitTrailBlockerObjectOrdinal[slot] = -1
      zombies.pursuitTrailBlockingX[slot] = 0
      zombies.pursuitTrailBlockingZ[slot] = 0
      zombies.pursuitTrailValidatedStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID
    }
  }

  const requiresGeometricValidation =
    zombies.pursuitTrailValidatedSequence[slot] !== sequence ||
    zombies.pursuitTrailValidatedWorldRevision[slot] !== state.navigationWorldRevision ||
    zombies.pursuitTrailValidatedStatus[slot] === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID
  if (requiresGeometricValidation) {
    if (!trailWorkPhase) return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    resetZombieEscapePlayerTrailValidation(zombies, slot)
    zombies.pursuitTrailValidatedSequence[slot] = sequence
    zombies.pursuitTrailValidatedSourceX[slot] = sourceX
    zombies.pursuitTrailValidatedSourceZ[slot] = sourceZ
    zombies.pursuitTrailValidatedWorldRevision[slot] = state.navigationWorldRevision
    resetZombieEscapeNavigationHit(state.navigationHitScratch)
    const sourceLayerIndex = resolveZombieEscapeSparseLayerAtPosition(
      state,
      sourceX,
      sourceY,
      sourceZ,
    )
    const segmentIsClear =
      sourceLayerIndex === target.layerIndex &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        sourceX,
        sourceY,
        sourceZ,
        target.x,
        target.y,
        target.z,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    if (segmentIsClear) {
      zombies.pursuitTrailValidatedStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_CLEAR
      zombies.pursuitTrailReachableStartEndSequence[slot] = 0
      zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
    } else if (
      zombies.pursuitTrailSeekingReachableStart[slot] ===
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_BACKWARD &&
      sequence > getZombieEscapePlayerTrailOldestSequence(trail)
    ) {
      zombies.pursuitTrailSequence[slot] = sequence - 1
      resetZombieEscapePlayerTrailValidation(zombies, slot)
      resetZombieEscapeNavigationHit(state.navigationHitScratch)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING
    } else if (
      zombies.pursuitTrailSeekingReachableStart[slot] ===
      ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_BACKWARD
    ) {
      const forwardSequence = zombies.pursuitTrailReachableStartOriginSequence[slot]! + 1
      zombies.pursuitTrailSequence[slot] = Math.min(forwardSequence, reachableStartEndSequence)
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_FORWARD
      resetZombieEscapePlayerTrailValidation(zombies, slot)
      resetZombieEscapeNavigationHit(state.navigationHitScratch)
      if (forwardSequence <= reachableStartEndSequence) {
        return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING
      }
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    } else if (
      zombies.pursuitTrailSeekingReachableStart[slot] ===
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_FORWARD &&
      sequence < reachableStartEndSequence
    ) {
      zombies.pursuitTrailSequence[slot] = sequence + 1
      resetZombieEscapePlayerTrailValidation(zombies, slot)
      resetZombieEscapeNavigationHit(state.navigationHitScratch)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING
    } else if (
      zombies.pursuitTrailSeekingReachableStart[slot] ===
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_FORWARD &&
      !(
        sourceLayerIndex === target.layerIndex &&
        state.navigationHitScratch.colliderKind !== 'none' &&
        isZombieEscapeCollisionHitBreakable(state.collisionWorld, state.navigationHitScratch)
      )
    ) {
      zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
      resetZombieEscapeNavigationHit(state.navigationHitScratch)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    } else if (
      sourceLayerIndex === target.layerIndex &&
      state.navigationHitScratch.colliderKind !== 'none' &&
      isZombieEscapeCollisionHitBreakable(state.collisionWorld, state.navigationHitScratch)
    ) {
      zombies.pursuitTrailReachableStartEndSequence[slot] = 0
      zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
      zombies.pursuitTrailValidatedStatus[slot] = ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE
      zombies.pursuitTrailBlockerObjectId[slot] = resolveZombieEscapeCollisionHitObjectId(
        state.collisionWorld,
        state.navigationHitScratch,
      )
      zombies.pursuitTrailBlockerObjectOrdinal[slot] = resolveZombieEscapeCollisionHitObjectOrdinal(
        state.collisionWorld,
        state.navigationHitScratch,
      )
      zombies.pursuitTrailBlockingX[slot] =
        sourceX + (target.x - sourceX) * state.navigationHitScratch.time
      zombies.pursuitTrailBlockingZ[slot] =
        sourceZ + (target.z - sourceZ) * state.navigationHitScratch.time
    }
    if (
      zombies.pursuitTrailValidatedStatus[slot] === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID
    ) {
      zombies.pursuitTrailReachableStartEndSequence[slot] = 0
      zombies.pursuitTrailReachableStartOriginSequence[slot] = 0
      zombies.pursuitTrailSeekingReachableStart[slot] =
        ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE
    }
    resetZombieEscapeNavigationHit(state.navigationHitScratch)
  }
  const validationStatus = zombies.pursuitTrailValidatedStatus[slot]!
  if (validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID) {
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }

  const directionX = target.x - sourceX
  const directionZ = target.z - sourceZ
  const directionLength = Math.hypot(directionX, directionZ)
  if (target.connectorIndex < 0 && directionLength <= arrivalRadius) {
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  const retainedRouteLength = Math.hypot(retainedRouteX, retainedRouteZ)
  if (
    respectRetainedRouteDirection &&
    target.connectorIndex < 0 &&
    retainedRouteReachable &&
    retainedRouteLength > 0.000_1 &&
    directionLength > 0.000_1 &&
    retainedRouteX * directionX + retainedRouteZ * directionZ < 0
  ) {
    return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
  }
  sample.blockingDistance =
    validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE
      ? Math.hypot(
          zombies.pursuitTrailBlockingX[slot]! - sourceX,
          zombies.pursuitTrailBlockingZ[slot]! - sourceZ,
        )
      : Number.POSITIVE_INFINITY
  sample.blockingX =
    validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE
      ? zombies.pursuitTrailBlockingX[slot]!
      : target.x
  sample.blockingZ =
    validationStatus === ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE
      ? zombies.pursuitTrailBlockingZ[slot]!
      : target.z
  sample.connectorIndex = -1
  sample.connectorTargetEnd = false
  sample.reachable = true
  sample.waypointNode = -1
  sample.waypointUsesFallback = false
  sample.x = directionLength > arrivalRadius ? directionX / directionLength : 0
  sample.z = directionLength > arrivalRadius ? directionZ / directionLength : 0
  if (
    target.connectorIndex >= 0 &&
    directionLength <= Math.max(arrivalRadius, state.collisionWorld.agentRadius + 0.15)
  ) {
    const connector = state.collisionWorld.navigationConnectors[target.connectorIndex]
    if (!connector) {
      clearZombieEscapePlayerTrailPursuit(zombies, slot)
      return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    }
    const directionAmount = target.connectorTargetEnd ? 1 : -1
    sample.connectorIndex = target.connectorIndex
    sample.connectorTargetEnd = target.connectorTargetEnd
    sample.x = connector.directionX * directionAmount
    sample.z = connector.directionZ * directionAmount
    zombies.pursuitTrailConnectorSequence[slot] = sequence
  }
  return ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_READY
}

function findZombieEscapeProtectedStagingReaderForDrain(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const capacity = zombies.pool.capacity
  for (let offset = 0; offset < capacity; offset += 1) {
    const slot = (state.navigationSparseSearchProtectedDrainCursor + offset) % capacity
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) continue
    const search = zombies.navigationSparseFlowSearch[slot]!
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.health[slot]! <= 0 ||
      zombies.navigationConnector[slot]! >= 0 ||
      zombies.navigationIntentPending[slot] === 0 ||
      zombies.navigationSparseFlowSearchActive[slot] === 0 ||
      zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] === 0 ||
      !zombieEscapeProtectedSearchOwnerMatchesSlot(state, slot) ||
      !zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease(
        search,
        state.navigationField,
      ) ||
      !zombieEscapeSparseFlowSearchCanProgress(search, state.navigationField)
    ) {
      continue
    }
    state.navigationSparseSearchProtectedDrainCursor = (slot + 1) % capacity
    return slot
  }
  return -1
}

function resolveZombieEscapeProtectedStagingOwnerSlot(state: ZombieEscapeSimulation) {
  const slot = state.navigationSparseSearchProtectedOwnerSlot
  if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) return -1
  if (
    state.navigationField.graphSparseTargetUpdate.phase !== 'wait-staging-bank' ||
    !zombieEscapeProtectedSearchOwnerIsLive(state) ||
    state.zombies.navigationSparseFlowSearchActive[slot] === 0 ||
    !zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease(
      state.zombies.navigationSparseFlowSearch[slot]!,
      state.navigationField,
    )
  ) {
    return -1
  }
  return slot
}

function drainZombieEscapeProtectedStagingReaders(
  state: ZombieEscapeSimulation,
  navigationIntentTick: number,
) {
  const maximumSlices = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
  while (
    (state.multiplayer ||
      state.navigationField.graphSparseTargetUpdate.phase === 'wait-staging-bank') &&
    state.navigationSparseSearchAgentServiceSliceCountThisTick < maximumSlices
  ) {
    const slot = findZombieEscapeProtectedStagingReaderForDrain(state)
    if (slot < 0) return
    const previousServiceSliceCount = state.navigationSparseSearchAgentServiceSliceCountThisTick
    resolveZombieEscapeSparseNavigationIntentSlice(
      state,
      slot,
      navigationIntentTick,
      maximumSlices - previousServiceSliceCount,
      false,
    )
    if (state.navigationSparseSearchAgentServiceSliceCountThisTick <= previousServiceSliceCount) {
      return
    }
  }
}

function drainZombieEscapeActiveSparseSearches(
  state: ZombieEscapeSimulation,
  navigationIntentTick: number,
) {
  const zombies = state.zombies
  const capacity = zombies.pool.capacity
  const maximumSlices = ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
  let firstServiceOnly = true
  let scansWithoutService = 0
  while (
    capacity > 0 &&
    state.navigationSparseSearchAgentServiceSliceCountThisTick < maximumSlices
  ) {
    if (scansWithoutService >= capacity) {
      if (!firstServiceOnly) return
      firstServiceOnly = false
      scansWithoutService = 0
    }
    const slot = state.navigationSparseSearchAgentDrainCursor % capacity
    state.navigationSparseSearchAgentDrainCursor = (slot + 1) % capacity
    scansWithoutService += 1
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) continue
    const search = zombies.navigationSparseFlowSearch[slot]!
    const searchRouteGeneration = getZombieEscapeSparseFlowSearchRouteGeneration(search)
    const searchIsStale =
      zombies.navigationSparseFlowSearchActive[slot] !== 0 &&
      (zombies.navigationSparseFlowSearchWorldRevision[slot] !== state.navigationWorldRevision ||
        search.worldRevision !== state.navigationField.world.revision)
    if (
      searchIsStale &&
      zombies.pool.active[slot] !== 0 &&
      zombies.health[slot]! > 0 &&
      zombies.navigationConnector[slot]! < 0 &&
      zombies.navigationIntentPoolGeneration[slot] === zombies.pool.generation[slot]
    ) {
      const restarted =
        zombies.navigationIntentPending[slot] !== 0
          ? restartZombieEscapeSparseFlowSearch(state, slot, 'worldChanged')
          : cancelZombieEscapeSparseFlowSearch(state, slot)
      if (restarted) {
        zombies.navigationSparseFlowSearchWorldRevision[slot] = state.navigationWorldRevision
        recordZombieEscapeSparseServiceSlice(state, 'agent', true, 0, true)
        scansWithoutService = 0
      }
      continue
    }
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.health[slot]! <= 0 ||
      zombies.navigationConnector[slot]! >= 0 ||
      zombies.navigationIntentPoolGeneration[slot] !== zombies.pool.generation[slot] ||
      zombies.navigationIntentPending[slot] === 0 ||
      (firstServiceOnly && zombies.navigationIntentHasReceivedFirstService[slot] !== 0) ||
      zombies.navigationSparseFlowSearchActive[slot] === 0 ||
      zombies.navigationSparseFlowSearchWorldRevision[slot] !== state.navigationWorldRevision ||
      search.status !== 'pending' ||
      search.worldRevision !== state.navigationField.world.revision ||
      (searchRouteGeneration > 0 &&
        searchRouteGeneration !== state.navigationTargetCommittedRouteGeneration) ||
      !zombieEscapeSparseFlowSearchCanProgress(search, state.navigationField)
    ) {
      continue
    }
    const previousServiceSliceCount = state.navigationSparseSearchAgentServiceSliceCountThisTick
    resolveZombieEscapeSparseNavigationIntentSlice(
      state,
      slot,
      navigationIntentTick,
      maximumSlices - previousServiceSliceCount,
      false,
    )
    if (state.navigationSparseSearchAgentServiceSliceCountThisTick > previousServiceSliceCount) {
      scansWithoutService = 0
    }
  }
}

function updateZombies(state: ZombieEscapeSimulation, delta: number) {
  const zombies = state.zombies
  advanceZombieEscapeObstacleHitFeedback(state.obstacleHitFeedback, delta)
  resetZombieEscapeObstacleDeltaMetricsThisTick(state.obstacleDeltaMetrics)
  resetZombieEscapeSparseSearchTickMetrics(state)
  state.navigationIntentAdmissionDeferredPromotedCountThisTick = 0
  state.navigationIntentAdmissionDeferredQueueOperationCountThisTick = 0
  state.navigationObstacleRefreshDeferredPromotedCountThisTick = 0
  state.navigationRefreshAdmissionCountThisTick = 0
  state.navigationRefreshCandidateInspectionsThisTick = 0
  state.navigationWorldRefreshPromotedCountThisTick = 0
  state.navigationWorldRefreshRestartedCountThisTick = 0
  const navigationIntentTick = state.navigationIntentTick
  state.navigationIntentTick = (navigationIntentTick + 1) >>> 0
  state.simulationTick = state.navigationIntentTick
  state.playerTrailAcquisitionCandidateBudgetRemaining =
    ZOMBIE_ESCAPE_SIMULATION.playerTrailClosestPointCandidateBudgetPerTick
  if (state.multiplayer) state.multiplayer.prepareTargets()
  else prepareZombieEscapeNavigationTarget(state)
  rebuildZombieEscapeAgentSpatialIndex(
    state.agentSpatialIndex,
    state.collisionWorld,
    zombies.pool.active,
    zombies.health,
    zombies.x,
    zombies.y,
    zombies.z,
    zombies.navigationConnector,
  )
  admitZombieEscapeDeferredNavigationRefreshes(state)
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) {
      cancelZombieEscapeNavigationIntentDemand(state, slot)
      continue
    }
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) {
      cancelZombieEscapeNavigationIntentDemand(state, slot)
      continue
    }
    if (zombies.navigationConnector[slot]! >= 0) {
      cancelZombieEscapeNavigationIntentDemand(state, slot)
      zombies.navigationIntentUrgentRefreshUsed[slot] = 0
      continue
    }
    if (zombies.navigationIntentPoolGeneration[slot] !== zombies.pool.generation[slot]) {
      deferZombieEscapeNavigationIntentAdmission(state, slot, 'spawn')
    } else if (zombies.navigationIntentWorldGeneration[slot] !== state.collisionWorldGeneration) {
      if (zombies.navigationIntentPending[slot] === 0) {
        deferZombieEscapeNavigationIntentAdmission(state, slot, 'worldChanged')
      }
    } else if (
      zombies.navigationConnector[slot]! < 0 &&
      zombies.navigationIntentValid[slot] === 0 &&
      zombies.navigationIntentPending[slot] === 0
    ) {
      deferZombieEscapeNavigationIntentAdmission(state, slot, 'cachedAnchorLost')
    }
  }
  if (state.collisionWorld.navigationMode === 'sparse' && state.navigationIntentPendingCount > 0) {
    refreshZombieEscapeSparseFlowSearchEligibility(state)
  }
  if (state.navigationIntentPendingCount > 0) {
    state.navigationIntentResolveCursor = scheduleZombieEscapeNavigationIntentResolutions(
      zombies.pool.active,
      zombies.health,
      zombies.navigationConnector,
      zombies.navigationIntentValid,
      zombies.navigationIntentPending,
      state.navigationIntentResolveCursor,
      state.navigationIntentResolveScheduled,
      state.collisionWorld.navigationMode === 'sparse'
        ? ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick
        : ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
      state.collisionWorld.navigationMode === 'sparse'
        ? state.navigationIntentResolveEligible
        : undefined,
    )
  }
  let remainingScheduledAgentSlices = 0
  if (state.collisionWorld.navigationMode === 'sparse' && state.navigationIntentPendingCount > 0) {
    const protectedStagingOwnerSlot = resolveZombieEscapeProtectedStagingOwnerSlot(state)
    let eligiblePendingCount = 0
    for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
      if (state.navigationIntentResolveEligible[slot] !== 0) eligiblePendingCount += 1
      if (state.navigationIntentResolveScheduled[slot] !== 0) {
        if (
          protectedStagingOwnerSlot >= 0 &&
          slot !== protectedStagingOwnerSlot &&
          zombies.navigationIntentHasReceivedFirstService[slot] !== 0
        ) {
          state.navigationIntentResolveScheduled[slot] = 0
          continue
        }
        remainingScheduledAgentSlices += 1
      }
    }
    state.navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick = eligiblePendingCount
  }
  state.navigationIntentResolveCountThisTick = 0
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0) continue
    zombies.hitFlash[slot] = Math.max(
      0,
      zombies.hitFlash[slot]! - delta / ZOMBIE_ESCAPE_SIMULATION.zombieHitFlashSeconds,
    )
    zombies.hitReaction[slot] = Math.max(
      0,
      zombies.hitReaction[slot]! - delta / ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds,
    )
    if (zombies.health[slot]! <= 0) {
      zombies.deathPresentationSeconds[slot] = zombies.deathPresentationSeconds[slot]! - delta
      if (zombies.deathPresentationSeconds[slot]! <= 0) {
        releaseZombieEscapeZombieSlot(state, slot, 'death')
      }
      continue
    }
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) {
      zombies.vx[slot] = 0
      zombies.vz[slot] = 0
      zombies.locomotionBlend[slot] = 0
      continue
    }
    const impulseDecay = Math.max(0, 1 - delta * ZOMBIE_ESCAPE_SIMULATION.zombieHitImpulseDecay)
    zombies.hitImpulseX[slot] = zombies.hitImpulseX[slot]! * impulseDecay
    zombies.hitImpulseY[slot] = zombies.hitImpulseY[slot]! * impulseDecay
    zombies.hitImpulseZ[slot] = zombies.hitImpulseZ[slot]! * impulseDecay
    const x = zombies.x[slot]!
    const y = zombies.y[slot]!
    const z = zombies.z[slot]!
    const toPlayerX = state.player.x - x
    const toPlayerZ = state.player.z - z
    const playerDistanceSquared = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ
    const catalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[slot]!)
    const collisionRadius = catalogEntry.capsule.radiusMeters
    const activeConnector =
      state.collisionWorld.navigationConnectors[zombies.navigationConnector[slot]!]
    const persistentPlayerTrail = catalogEntry.gameplay.persistentPlayerTrail
    const persistentPlayerTrailAcquisition =
      persistentPlayerTrail && !activeConnector
        ? acquireClosestZombieEscapePlayerTrailPoint(state, slot, x, y, z)
        : ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    const persistentPlayerTrailReady =
      persistentPlayerTrailAcquisition === ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_READY
    if (
      x !== zombies.navigationSourceCertifiedX[slot] ||
      y !== zombies.navigationSourceCertifiedY[slot] ||
      z !== zombies.navigationSourceCertifiedZ[slot]
    ) {
      zombies.navigationSourceNeedsValidation[slot] = 1
    }
    if (
      !activeConnector &&
      zombies.navigationSourceNeedsValidation[slot] !== 0 &&
      state.collisionWorld.navigationMode === 'sparse' &&
      state.navigationField.graphSparseTargetUpdate.status === 'ready' &&
      state.navigationTargetCommittedRouteGeneration > 0 &&
      !validateZombieEscapeReconciledSparseSource(state, slot, x, y, z, navigationIntentTick)
    ) {
      rejectZombieEscapeUnanchoredZombieFromNavigation(state, slot)
      continue
    }
    if (
      zombies.navigationSourceNeedsValidation[slot] !== 0 &&
      (state.collisionWorld.navigationMode !== 'sparse' ||
        (!activeConnector && state.navigationField.graphSparseTargetUpdate.status === 'ready'))
    ) {
      certifyZombieEscapeNavigationSource(zombies, slot, x, y, z)
    }
    let directBlockingObjectId: string | null = null
    let directBlockingObjectOrdinal = -1
    let directBlockerIsBreakable = false
    let directBlockerHasCurrentEvidence = false
    resetZombieEscapeNavigationHit(state.navigationHitScratch)
    const liveGoalVisibilityWasTested =
      !persistentPlayerTrail && !activeConnector && state.collisionWorld.navigationMode === 'sparse'
    const rawLiveGoalClear =
      liveGoalVisibilityWasTested &&
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        x,
        y,
        z,
        state.navigationGoalX,
        state.navigationGoalY,
        state.navigationGoalZ,
        state.collisionWorld.agentRadius,
        state.navigationHitScratch,
      )
    const rawLiveGoalColliderBlocked =
      liveGoalVisibilityWasTested &&
      !rawLiveGoalClear &&
      state.navigationHitScratch.colliderKind !== 'none'
    const liveGoalBlockingObjectId = rawLiveGoalColliderBlocked
      ? resolveZombieEscapeCollisionHitObjectId(state.collisionWorld, state.navigationHitScratch)
      : null
    const liveGoalBlockingObjectOrdinal = rawLiveGoalColliderBlocked
      ? resolveZombieEscapeCollisionHitObjectOrdinal(
          state.collisionWorld,
          state.navigationHitScratch,
        )
      : -1
    const liveGoalBlockerIsBreakable =
      rawLiveGoalColliderBlocked &&
      isZombieEscapeCollisionHitBreakable(state.collisionWorld, state.navigationHitScratch)
    const liveGoalHitAmount = rawLiveGoalColliderBlocked
      ? Math.max(0, Math.min(1, state.navigationHitScratch.time))
      : 1
    const liveGoalBlockingX = x + (state.navigationGoalX - x) * liveGoalHitAmount
    const liveGoalBlockingZ = z + (state.navigationGoalZ - z) * liveGoalHitAmount
    const liveGoalReacquisitionTicks =
      ZOMBIE_ESCAPE_SIMULATION.zombieLiveGoalReacquisitionClearTicks
    zombies.navigationLiveGoalClearTicks[slot] = rawLiveGoalClear
      ? Math.min(liveGoalReacquisitionTicks, zombies.navigationLiveGoalClearTicks[slot]! + 1)
      : 0
    const liveGoalDirect = zombies.navigationLiveGoalClearTicks[slot]! >= liveGoalReacquisitionTicks
    let navigationIntentUpdated = false
    if (activeConnector) {
      let targetEnd = zombies.navigationConnectorTargetEnd[slot] !== 0
      if (
        zombies.pursuitTrailConnectorSequence[slot] === 0 &&
        state.navigationGoalInitialized &&
        state.navigationGoalResolvedTick === state.navigationIntentTick
      ) {
        const startDistanceSquared =
          (activeConnector.startX - state.navigationGoalX) ** 2 +
          (activeConnector.startY - state.navigationGoalY) ** 2 +
          (activeConnector.startZ - state.navigationGoalZ) ** 2
        const endDistanceSquared =
          (activeConnector.endX - state.navigationGoalX) ** 2 +
          (activeConnector.endY - state.navigationGoalY) ** 2 +
          (activeConnector.endZ - state.navigationGoalZ) ** 2
        if (Math.abs(endDistanceSquared - startDistanceSquared) > 0.000_001) {
          targetEnd = endDistanceSquared < startDistanceSquared
        }
        zombies.navigationConnectorTargetEnd[slot] = targetEnd ? 1 : 0
        zombies.navigationIntentTargetRevision[slot] = state.navigationTargetRequestedRevision
      }
      const directionAmount = targetEnd ? 1 : -1
      state.navigationSampleScratch.blockingDistance = Number.POSITIVE_INFINITY
      state.navigationSampleScratch.blockingX = x
      state.navigationSampleScratch.blockingZ = z
      state.navigationSampleScratch.connectorIndex = -1
      state.navigationSampleScratch.connectorTargetEnd = false
      state.navigationSampleScratch.reachable = true
      state.navigationSampleScratch.waypointNode = -1
      state.navigationSampleScratch.waypointUsesFallback = false
      state.navigationSampleScratch.x = activeConnector.directionX * directionAmount
      state.navigationSampleScratch.z = activeConnector.directionZ * directionAmount
      resetZombieEscapeNavigationHit(state.navigationHitScratch)
    } else {
      const navigationIntentResolutionIsScheduled =
        state.navigationIntentResolveScheduled[slot] !== 0
      if (navigationIntentResolutionIsScheduled) {
        state.navigationIntentResolveScheduled[slot] = 0
        if (state.collisionWorld.navigationMode === 'sparse') {
          navigationIntentUpdated = resolveZombieEscapeSparseNavigationIntentSlice(
            state,
            slot,
            navigationIntentTick,
            remainingScheduledAgentSlices,
            false,
          )
          remainingScheduledAgentSlices -= 1
        } else {
          resolveZombieEscapeFlowDirection(
            state.navigationField,
            x,
            z,
            state.player.x,
            state.player.z,
            state.navigationSampleScratch,
            state.navigationHitScratch,
            y,
            zombies.navigationWaypointNode[slot]!,
            zombies.navigationWaypointFallback[slot] !== 0,
          )
          const blockerObjectId = resolveZombieEscapeCollisionHitObjectId(
            state.collisionWorld,
            state.navigationHitScratch,
          )
          const blockerObjectOrdinal = resolveZombieEscapeCollisionHitObjectOrdinal(
            state.collisionWorld,
            state.navigationHitScratch,
          )
          const blockerIsBreakable = isZombieEscapeCollisionHitBreakable(
            state.collisionWorld,
            state.navigationHitScratch,
          )
          cacheZombieEscapeNavigationIntent(
            state,
            slot,
            navigationIntentTick,
            blockerObjectId,
            blockerObjectOrdinal,
            blockerIsBreakable,
            state.navigationTargetCommittedRouteGeneration,
            state.navigationTargetRequestedRevision,
          )
          state.navigationIntentResolveCount += 1
          state.navigationIntentResolveCountThisTick += 1
          markZombieEscapeNavigationIntentFirstService(state, slot)
          resolveZombieEscapeNavigationIntentDemand(state, slot)
          navigationIntentUpdated = true
        }
      }
      if (zombies.pool.active[slot] === 0) continue
      let reuseNavigationIntent =
        zombies.navigationIntentValid[slot] !== 0 ||
        (zombies.navigationIntentPending[slot] !== 0 &&
          zombies.navigationIntentHasCached[slot] !== 0)
      if (
        reuseNavigationIntent &&
        !zombieEscapeCollisionObjectOrdinalIsActive(
          state.collisionWorld,
          zombies.navigationBlockerObjectOrdinal[slot]!,
        )
      ) {
        zombies.navigationBlockerBreakable[slot] = 0
        zombies.navigationBlockerObjectId[slot] = null
      }
      if (reuseNavigationIntent) {
        restoreZombieEscapeNavigationIntent(state, slot)
        if (state.collisionWorld.navigationMode === 'sparse' && !navigationIntentUpdated) {
          const navigationIntentIsPending = zombies.navigationIntentPending[slot] !== 0
          {
            const waypointNode = state.navigationSampleScratch.waypointNode ?? -1
            if (waypointNode >= state.collisionWorld.navigationGraph.nodeIds.length) {
              state.navigationAnchorInvalidationCount += 1
              if (writeZombieEscapeSparseLocalNavigationSample(state, slot, x, y, z)) {
                completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
              } else if (navigationIntentIsPending) {
                zombies.navigationWaypointFallback[slot] = 0
                zombies.navigationWaypointNode[slot] = -1
                clearZombieEscapeSparseFlowSearchRouteCorridor(
                  zombies.navigationSparseCommittedFlowSearch[slot]!,
                )
                writeZombieEscapeRetainedCommittedNavigationIntent(state, slot, x, z)
              } else {
                clearZombieEscapeSparseFlowSearchRouteCorridor(
                  zombies.navigationSparseCommittedFlowSearch[slot]!,
                )
                zombies.navigationIntentHasCached[slot] = 0
                zombies.navigationWaypointFallback[slot] = 0
                zombies.navigationWaypointNode[slot] = -1
                deferZombieEscapeSparseLocalReattachment(state, slot, 'cachedAnchorLost')
                reuseNavigationIntent = false
              }
            } else if (
              waypointNode < 0 &&
              zombies.navigationIntentCommittedRouteGeneration[slot] ===
                state.navigationTargetCommittedRouteGeneration
            ) {
              if (!liveGoalDirect) {
                if (
                  !recoverZombieEscapeSparseLocalReattachment(
                    state,
                    slot,
                    x,
                    y,
                    z,
                    'cachedAnchorLost',
                    navigationIntentTick,
                  )
                ) {
                  writeZombieEscapeHeldNavigationSample(state, x, z)
                }
              } else {
                state.navigationSampleScratch.x = 0
                state.navigationSampleScratch.z = 0
              }
            } else {
              const routeGenerationChanged =
                zombies.navigationIntentCommittedRouteGeneration[slot] !==
                state.navigationTargetCommittedRouteGeneration
              let adoptedPublishedRoute = false
              let followCommittedRoute = !routeGenerationChanged
              if (routeGenerationChanged) {
                const search = zombies.navigationSparseCommittedFlowSearch[slot]!
                if (liveGoalDirect) {
                  cancelZombieEscapeSparseFlowSearch(state, slot)
                  resetZombieEscapeSparseFlowSearch(zombies.navigationSparseFlowSearch[slot]!)
                  clearZombieEscapeSparseFlowSearchRouteCorridor(search)
                  writeZombieEscapeDirectNavigationSample(state, x, z)
                  completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
                } else {
                  const graph = state.collisionWorld.navigationGraph
                  const adoption = adoptZombieEscapeSparsePublishedRouteAtWaypoint(
                    search,
                    state.navigationField,
                    waypointNode,
                  )
                  let adoptedWaypointNode = -1
                  if (adoption === 'adopted') {
                    const successorNode = search.cachedOriginalNextNode
                    const waypointLayerIndex = graph.layerIndices[waypointNode] ?? -1
                    const successorLayerIndex = graph.layerIndices[successorNode] ?? -1
                    const waypointLayer = state.collisionWorld.navigationLayers[waypointLayerIndex]
                    const successorLayer =
                      state.collisionWorld.navigationLayers[successorLayerIndex]
                    if (
                      successorNode >= 0 &&
                      successorLayerIndex === waypointLayerIndex &&
                      successorLayer !== undefined &&
                      zombieEscapeSameLayerNavigationSegmentIsClear(
                        state.collisionWorld,
                        x,
                        y,
                        z,
                        graph.x[successorNode]!,
                        successorLayer.elevation,
                        graph.z[successorNode]!,
                        state.collisionWorld.agentRadius,
                        state.navigationHitScratch,
                      )
                    ) {
                      adoptedWaypointNode = successorNode
                    } else if (
                      waypointLayer !== undefined &&
                      zombieEscapeSameLayerNavigationSegmentIsClear(
                        state.collisionWorld,
                        x,
                        y,
                        z,
                        graph.x[waypointNode]!,
                        waypointLayer.elevation,
                        graph.z[waypointNode]!,
                        state.collisionWorld.agentRadius,
                        state.navigationHitScratch,
                      )
                    ) {
                      adoptedWaypointNode = waypointNode
                    }
                  }
                  if (adoptedWaypointNode >= 0) {
                    state.navigationSampleScratch.waypointNode = adoptedWaypointNode
                    state.navigationSampleScratch.waypointUsesFallback =
                      search.routeCorridorUsesFallback
                    if (
                      adoptedWaypointNode !== waypointNode &&
                      !seedZombieEscapeSparseFlowSearchRouteCorridor(
                        search,
                        state.navigationField,
                        adoptedWaypointNode,
                        search.routeCorridorUsesFallback,
                      )
                    ) {
                      adoptedWaypointNode = -1
                    }
                  }
                  if (adoption === 'requiresSearch') {
                    restartZombieEscapeSparseFlowSearch(state, slot, 'routePublished')
                    writeZombieEscapeRetainedCommittedNavigationIntent(state, slot, x, z)
                    if (!navigationIntentIsPending) {
                      demandZombieEscapeNavigationIntent(state, slot, 'routePublished', false)
                    }
                  } else if (adoptedWaypointNode >= 0) {
                    zombies.navigationIntentCommittedRouteGeneration[slot] =
                      state.navigationTargetCommittedRouteGeneration
                    zombies.navigationIntentTargetRevision[slot] =
                      state.navigationTargetRequestedRevision
                    adoptedPublishedRoute = true
                    followCommittedRoute = true
                  } else {
                    if (
                      !recoverZombieEscapeSparseLocalReattachment(
                        state,
                        slot,
                        x,
                        y,
                        z,
                        'routePublished',
                        navigationIntentTick,
                      )
                    ) {
                      writeZombieEscapeHeldNavigationSample(state, x, z)
                    }
                  }
                }
              }
              if (followCommittedRoute) {
                const cachedStatus = followZombieEscapeCachedSparseWaypoint(
                  state.navigationField,
                  x,
                  z,
                  y,
                  state.navigationSampleScratch,
                  zombies.navigationSparseCommittedFlowSearch[slot]!,
                  ZOMBIE_ESCAPE_ZERO_SPARSE_SEARCH_BUDGET,
                )
                if (
                  adoptedPublishedRoute &&
                  (cachedStatus === 'followed' || cachedStatus === 'reacquiring')
                ) {
                  completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
                }
                if (cachedStatus === 'followed') {
                  const followedWaypointNode = state.navigationSampleScratch.waypointNode ?? -1
                  const committed = zombies.navigationSparseCommittedFlowSearch[slot]!
                  if (
                    followedWaypointNode < 0 ||
                    !seedZombieEscapeSparseFlowSearchRouteCorridor(
                      committed,
                      state.navigationField,
                      followedWaypointNode,
                      state.navigationSampleScratch.waypointUsesFallback === true,
                    )
                  ) {
                    clearZombieEscapeSparseFlowSearchRouteCorridor(committed)
                  }
                }
                if (cachedStatus === 'held') {
                  zombies.navigationBlockerBreakable[slot] = 0
                  zombies.navigationBlockerObjectId[slot] = null
                  zombies.navigationBlockerObjectOrdinal[slot] = -1
                  zombies.navigationBlockingDistance[slot] =
                    state.navigationSampleScratch.blockingDistance
                  zombies.navigationBlockingX[slot] = state.navigationSampleScratch.blockingX
                  zombies.navigationBlockingZ[slot] = state.navigationSampleScratch.blockingZ
                }
                if (cachedStatus === 'pending') {
                  if (navigationIntentIsPending) {
                    writeZombieEscapeRetainedCommittedNavigationIntent(state, slot, x, z)
                  } else {
                    deferZombieEscapeNavigationIntentAdmission(state, slot, 'cachedAnchorLost')
                    const heldWaypointNode = state.navigationSampleScratch.waypointNode ?? -1
                    const heldWaypointX =
                      heldWaypointNode >= 0
                        ? state.collisionWorld.navigationGraph.x[heldWaypointNode]!
                        : state.player.x
                    const heldWaypointZ =
                      heldWaypointNode >= 0
                        ? state.collisionWorld.navigationGraph.z[heldWaypointNode]!
                        : state.player.z
                    writeZombieEscapeDeferredNavigationDirection(
                      'pending',
                      state.collisionWorld.agentRadius,
                      x,
                      z,
                      heldWaypointX,
                      heldWaypointZ,
                      state.navigationSampleScratch,
                    )
                  }
                } else if (cachedStatus === 'refresh') {
                  if (navigationIntentIsPending) {
                    writeZombieEscapeRetainedCommittedNavigationIntent(state, slot, x, z)
                  } else {
                    deferZombieEscapeNavigationIntentAdmission(state, slot, 'cachedAnchorLost')
                  }
                  const heldWaypointNode = state.navigationSampleScratch.waypointNode ?? -1
                  const heldWaypointX =
                    heldWaypointNode >= 0
                      ? state.collisionWorld.navigationGraph.x[heldWaypointNode]!
                      : state.player.x
                  const heldWaypointZ =
                    heldWaypointNode >= 0
                      ? state.collisionWorld.navigationGraph.z[heldWaypointNode]!
                      : state.player.z
                  if (!navigationIntentIsPending) {
                    writeZombieEscapeDeferredNavigationDirection(
                      'refresh',
                      state.collisionWorld.agentRadius,
                      x,
                      z,
                      heldWaypointX,
                      heldWaypointZ,
                      state.navigationSampleScratch,
                    )
                  }
                } else if (cachedStatus === 'invalidated') {
                  if (navigationIntentIsPending) {
                    writeZombieEscapeRetainedCommittedNavigationIntent(state, slot, x, z)
                  } else {
                    deferZombieEscapeNavigationIntentAdmission(state, slot, 'worldChanged')
                    reuseNavigationIntent = false
                  }
                } else if (cachedStatus === 'routePublished') {
                  if (navigationIntentIsPending) {
                    writeZombieEscapeRetainedCommittedNavigationIntent(state, slot, x, z)
                  } else {
                    restartZombieEscapeSparseFlowSearch(state, slot, 'routePublished')
                    demandZombieEscapeNavigationIntent(state, slot, 'routePublished', false)
                    reuseNavigationIntent = false
                  }
                } else if (cachedStatus !== 'reacquiring') {
                  zombies.navigationIntentCommittedRouteGeneration[slot] =
                    state.navigationTargetCommittedRouteGeneration
                }
              }
            }
          }
        } else if (state.collisionWorld.navigationMode === 'dense' && !navigationIntentUpdated) {
          resolveZombieEscapeFlowDirection(
            state.navigationField,
            x,
            z,
            state.player.x,
            state.player.z,
            state.navigationSampleScratch,
            state.navigationHitScratch,
            y,
          )
          zombies.navigationBlockerObjectId[slot] = resolveZombieEscapeCollisionHitObjectId(
            state.collisionWorld,
            state.navigationHitScratch,
          )
          zombies.navigationBlockerObjectOrdinal[slot] =
            resolveZombieEscapeCollisionHitObjectOrdinal(
              state.collisionWorld,
              state.navigationHitScratch,
            )
          zombies.navigationBlockerBreakable[slot] = isZombieEscapeCollisionHitBreakable(
            state.collisionWorld,
            state.navigationHitScratch,
          )
            ? 1
            : 0
        }
        if (
          state.collisionWorld.navigationMode === 'sparse' &&
          state.navigationGoalInitialized &&
          state.navigationGoalResolvedTick === state.navigationIntentTick &&
          (state.navigationField.graphSparseTargetUpdate.status === 'pending' ||
            zombies.navigationIntentTargetRevision[slot] !==
              state.navigationTargetRequestedRevision)
        ) {
          const retainedRouteIsCertified =
            state.navigationSampleScratch.reachable &&
            ((state.navigationSampleScratch.waypointNode ?? -1) >= 0 ||
              state.navigationSampleScratch.connectorIndex >= 0)
          if (!retainedRouteIsCertified) {
            const recoveredLocally =
              !zombieEscapeSparseLocalReattachmentIsPending(state, slot) &&
              recoverZombieEscapeSparseLocalReattachment(
                state,
                slot,
                x,
                y,
                z,
                'routePublished',
                navigationIntentTick,
              )
            if (!recoveredLocally) {
              writeZombieEscapeHeldNavigationSample(state, x, z)
            }
            zombies.attackTargetObjectId[slot] = null
            zombies.attackTargetObjectOrdinal[slot] = -1
            zombies.navigationBlockerBreakable[slot] = 0
            zombies.navigationBlockerObjectId[slot] = null
            zombies.navigationBlockerObjectOrdinal[slot] = -1
          }
          zombies.navigationIntentCurrentTargetFallback[slot] = 0
          reuseNavigationIntent = true
        }
        if (reuseNavigationIntent) {
          zombies.navigationDirectionX[slot] = state.navigationSampleScratch.x
          zombies.navigationDirectionZ[slot] = state.navigationSampleScratch.z
          zombies.navigationReachable[slot] = state.navigationSampleScratch.reachable ? 1 : 0
          zombies.navigationRequestedConnector[slot] = state.navigationSampleScratch.connectorIndex
          zombies.navigationRequestedConnectorTargetEnd[slot] = state.navigationSampleScratch
            .connectorTargetEnd
            ? 1
            : 0
          zombies.navigationWaypointNode[slot] = state.navigationSampleScratch.waypointNode ?? -1
          zombies.navigationWaypointFallback[slot] = state.navigationSampleScratch
            .waypointUsesFallback
            ? 1
            : 0
        } else {
          clearZombieEscapeNavigationWaypoint(state, slot)
          if (
            zombies.navigationIntentPending[slot] === 0 &&
            zombies.navigationIntentWorldGeneration[slot] === state.collisionWorldGeneration
          ) {
            deferZombieEscapeNavigationIntentAdmission(state, slot, 'cachedAnchorLost')
          }
        }
      }
      if (
        !reuseNavigationIntent &&
        state.collisionWorld.navigationMode === 'sparse' &&
        state.navigationGoalInitialized &&
        state.navigationGoalResolvedTick === state.navigationIntentTick
      ) {
        const recoveredLocally =
          !zombieEscapeSparseLocalReattachmentIsPending(state, slot) &&
          recoverZombieEscapeSparseLocalReattachment(
            state,
            slot,
            x,
            y,
            z,
            'cachedAnchorLost',
            navigationIntentTick,
          )
        if (!recoveredLocally) {
          writeZombieEscapeHeldNavigationSample(state, x, z)
        }
        zombies.attackTargetObjectId[slot] = null
        zombies.attackTargetObjectOrdinal[slot] = -1
        zombies.navigationBlockerBreakable[slot] = 0
        zombies.navigationBlockerObjectId[slot] = null
        zombies.navigationBlockerObjectOrdinal[slot] = -1
        zombies.navigationIntentCurrentTargetFallback[slot] = 0
        reuseNavigationIntent = true
      }
      if (reuseNavigationIntent) {
        directBlockingObjectId = zombies.navigationBlockerObjectId[slot] ?? null
        directBlockingObjectOrdinal = zombies.navigationBlockerObjectOrdinal[slot]!
        directBlockerIsBreakable = zombies.navigationBlockerBreakable[slot] !== 0
        directBlockerHasCurrentEvidence =
          state.collisionWorld.navigationMode === 'dense' && directBlockerIsBreakable
      } else {
        resetZombieEscapeUnresolvedNavigationSample(state, x, z)
      }
    }
    if (liveGoalDirect) {
      synchronizeZombieEscapePlayerTrailPursuit(state, slot)
      directBlockingObjectId = null
      directBlockingObjectOrdinal = -1
      directBlockerIsBreakable = false
      directBlockerHasCurrentEvidence = false
      clearZombieEscapeSparseFlowSearchRouteCorridor(
        zombies.navigationSparseCommittedFlowSearch[slot]!,
      )
      writeZombieEscapeDirectNavigationSample(state, x, z)
      completeZombieEscapeRecoveredNavigationIntent(state, slot, navigationIntentTick)
    }
    if (
      !state.navigationSampleScratch.reachable &&
      state.collisionWorld.navigationMode === 'sparse' &&
      (state.navigationField.graphSparseTargetUpdate.status === 'pending' ||
        zombies.navigationIntentPending[slot] !== 0 ||
        zombies.navigationSparseFlowSearchActive[slot] !== 0 ||
        zombies.navigationIntentAdmissionDeferredReasons[slot] !== 0)
    ) {
      writeZombieEscapeHeldNavigationSample(state, x, z)
    }
    if (liveGoalBlockerIsBreakable) {
      directBlockingObjectId = liveGoalBlockingObjectId
      directBlockingObjectOrdinal = liveGoalBlockingObjectOrdinal
      directBlockerIsBreakable = true
      directBlockerHasCurrentEvidence = true
      state.navigationSampleScratch.blockingX = liveGoalBlockingX
      state.navigationSampleScratch.blockingZ = liveGoalBlockingZ
    }
    let playerTrailNavigationResult = ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    if (
      !activeConnector &&
      (persistentPlayerTrailReady || (!persistentPlayerTrail && !liveGoalDirect))
    ) {
      playerTrailNavigationResult = writeZombieEscapePlayerTrailNavigationSample(
        state,
        slot,
        x,
        y,
        z,
        collisionRadius,
        persistentPlayerTrail,
        !persistentPlayerTrail,
      )
    }
    const playerTrailPursuitApplied =
      playerTrailNavigationResult === ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_READY
    if (
      persistentPlayerTrailReady &&
      playerTrailNavigationResult === ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_UNAVAILABLE
    ) {
      markZombieEscapePlayerTrailUnavailable(
        state,
        slot,
        state.collisionWorld.navigationMode === 'sparse'
          ? resolveZombieEscapeSparseLayerAtPosition(state, x, y, z)
          : -1,
        zombies.pursuitTrailReachableStartEndSequence[slot]! > 0
          ? zombies.pursuitTrailReachableStartEndSequence[slot]!
          : state.playerTrail.newestSequence,
      )
    }
    if (playerTrailPursuitApplied) {
      const trailBlockerIsBreakable =
        zombies.pursuitTrailValidatedStatus[slot] ===
        ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE
      directBlockingObjectId = trailBlockerIsBreakable
        ? (zombies.pursuitTrailBlockerObjectId[slot] ?? null)
        : null
      directBlockingObjectOrdinal = trailBlockerIsBreakable
        ? zombies.pursuitTrailBlockerObjectOrdinal[slot]!
        : -1
      directBlockerIsBreakable = trailBlockerIsBreakable
      directBlockerHasCurrentEvidence = trailBlockerIsBreakable
    }
    const persistentPlayerTrailHoldsForSample =
      persistentPlayerTrail &&
      !activeConnector &&
      (persistentPlayerTrailAcquisition === ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING ||
        playerTrailNavigationResult === ZOMBIE_ESCAPE_PLAYER_TRAIL_RESULT_PENDING)
    if (persistentPlayerTrailHoldsForSample) {
      directBlockingObjectId = null
      directBlockingObjectOrdinal = -1
      directBlockerIsBreakable = false
      directBlockerHasCurrentEvidence = false
      zombies.attackTargetObjectId[slot] = null
      zombies.attackTargetObjectOrdinal[slot] = -1
      zombies.attackObstacleRenewalEvidence[slot] = 0
      zombies.navigationBlockerBreakable[slot] = 0
      zombies.navigationBlockerObjectId[slot] = null
      zombies.navigationBlockerObjectOrdinal[slot] = -1
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
      writeZombieEscapeHeldNavigationSample(state, x, z)
    }
    const routeSteerX = state.navigationSampleScratch.x
    const routeSteerZ = state.navigationSampleScratch.z
    const directlyTracksCurrentGoal = liveGoalDirect
    const currentGoalSteerX = state.navigationGoalX - x
    const currentGoalSteerZ = state.navigationGoalZ - z
    const currentGoalSteeringLength = Math.hypot(currentGoalSteerX, currentGoalSteerZ)
    let steerX = routeSteerX
    let steerZ = routeSteerZ
    let advisorySeparationApplied = false
    if (playerDistanceSquared <= 0.000_2 ** 2) {
      directBlockingObjectId = null
      directBlockingObjectOrdinal = -1
      directBlockerIsBreakable = false
      directBlockerHasCurrentEvidence = false
    }
    const directHitDistanceSquared = directBlockingObjectId
      ? (state.navigationSampleScratch.blockingX - x) ** 2 +
        (state.navigationSampleScratch.blockingZ - z) ** 2
      : Number.POSITIVE_INFINITY
    const previousIntent = zombies.intent[slot]!
    let previousObstacleTarget = zombies.attackTargetObjectId[slot] ?? null
    let previousObstacleTargetOrdinal = zombies.attackTargetObjectOrdinal[slot]!
    if (
      previousObstacleTarget !== null &&
      !zombieEscapeCollisionObjectOrdinalIsActive(
        state.collisionWorld,
        previousObstacleTargetOrdinal,
      )
    ) {
      zombies.attackTargetObjectId[slot] = null
      zombies.attackTargetObjectOrdinal[slot] = -1
      zombies.attackObstacleRenewalEvidence[slot] = 0
      previousObstacleTarget = null
      previousObstacleTargetOrdinal = -1
    }
    const storedFocusDistanceSquared = previousObstacleTarget
      ? (zombies.attackFocusX[slot]! - x) ** 2 + (zombies.attackFocusZ[slot]! - z) ** 2
      : Number.POSITIVE_INFINITY
    const previousObstacleContactEligible =
      previousIntent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
      previousObstacleTarget !== null &&
      isZombieEscapeCollisionObjectBreakableAtElevation(
        state.collisionWorld,
        previousObstacleTarget,
        y,
      ) &&
      storedFocusDistanceSquared <= ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackReleaseMeters ** 2
    const directObstacleTargetIsInRange =
      directBlockerIsBreakable &&
      directBlockerHasCurrentEvidence &&
      directBlockingObjectId !== null &&
      directHitDistanceSquared <= ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackReachMeters ** 2
    const obstacleTargetObjectId = directObstacleTargetIsInRange ? directBlockingObjectId : null
    const obstacleTargetObjectOrdinal = directObstacleTargetIsInRange
      ? directBlockingObjectOrdinal
      : -1
    if (!previousObstacleContactEligible) {
      zombies.attackObstacleRenewalEvidence[slot] = 0
    } else if (
      directBlockerIsBreakable &&
      directBlockerHasCurrentEvidence &&
      directBlockingObjectId === previousObstacleTarget
    ) {
      zombies.attackObstacleRenewalEvidence[slot] = 1
    }
    const playerInAttackRange = zombieEscapePlayerIsWithinAttackReach(
      state,
      slot,
      playerDistanceSquared,
      catalogEntry.characterHeightMeters,
    )
    const previousIntentIsAttack =
      previousIntent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle ||
      previousIntent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
    const attackCycleEvent = previousIntentIsAttack
      ? advanceZombieEscapeAttackCycle(zombies, slot, delta)
      : ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.none
    const attackCycleCompleted =
      (attackCycleEvent & ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.completed) !== 0
    const attackContact = (attackCycleEvent & ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.contact) !== 0
    const consumedObstacleRenewalEvidence = zombies.attackObstacleRenewalEvidence[slot] !== 0
    if (attackCycleCompleted) zombies.attackObstacleRenewalEvidence[slot] = 0
    const previousObstacleTargetIsEligible =
      previousObstacleContactEligible && (!attackCycleCompleted || consumedObstacleRenewalEvidence)
    const previousPlayerTargetIsEligible =
      previousIntent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer && playerInAttackRange
    const previousAttackTargetIsEligible =
      previousObstacleTargetIsEligible || previousPlayerTargetIsEligible
    const continuesCommittedAttack =
      previousIntentIsAttack && (!attackCycleCompleted || previousAttackTargetIsEligible)

    let holdsPosition = persistentPlayerTrailHoldsForSample
    let facingX = steerX
    let facingZ = steerZ
    let navigationProgressTargetNode = ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED
    let navigationProjectedProgress = 0
    let navigationMinimumProgress = 0
    if (continuesCommittedAttack) {
      zombies.intent[slot] = previousIntent
      if (previousIntent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle) {
        holdsPosition = previousObstacleTargetIsEligible
        if (previousObstacleTarget !== null) {
          zombies.attackTargetObjectId[slot] = previousObstacleTarget
          zombies.attackTargetObjectOrdinal[slot] = previousObstacleTargetOrdinal
        }
        if (directBlockerHasCurrentEvidence && directBlockingObjectId === previousObstacleTarget) {
          zombies.attackFocusX[slot] = state.navigationSampleScratch.blockingX
          zombies.attackFocusZ[slot] = state.navigationSampleScratch.blockingZ
        }
        facingX = zombies.attackFocusX[slot]! - x
        facingZ = zombies.attackFocusZ[slot]! - z
        if (attackContact && previousObstacleTargetIsEligible && previousObstacleTarget !== null) {
          const destroyed = hitZombieEscapeObstacle(
            state,
            slot,
            previousObstacleTarget,
            zombies.attackFocusX[slot]!,
            zombies.attackFocusZ[slot]!,
          )
          if (destroyed) {
            zombies.attackTargetObjectId[slot] = null
            zombies.attackTargetObjectOrdinal[slot] = -1
            zombies.attackObstacleRenewalEvidence[slot] = 0
          }
        }
      } else {
        zombies.attackTargetObjectId[slot] = null
        zombies.attackTargetObjectOrdinal[slot] = -1
        zombies.attackObstacleRenewalEvidence[slot] = 0
        zombies.attackFocusX[slot] = state.player.x
        zombies.attackFocusZ[slot] = state.player.z
        facingX = toPlayerX
        facingZ = toPlayerZ
      }
    } else if (obstacleTargetObjectId) {
      holdsPosition = true
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle
      zombies.attackTargetObjectId[slot] = obstacleTargetObjectId
      zombies.attackTargetObjectOrdinal[slot] = obstacleTargetObjectOrdinal
      zombies.attackObstacleRenewalEvidence[slot] = 0
      if (directBlockingObjectId === obstacleTargetObjectId) {
        zombies.attackFocusX[slot] = state.navigationSampleScratch.blockingX
        zombies.attackFocusZ[slot] = state.navigationSampleScratch.blockingZ
      }
      facingX = zombies.attackFocusX[slot]! - x
      facingZ = zombies.attackFocusZ[slot]! - z
      beginZombieEscapeAttackCycle(zombies, slot)
    } else if (playerInAttackRange) {
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
      zombies.attackTargetObjectId[slot] = null
      zombies.attackTargetObjectOrdinal[slot] = -1
      zombies.attackObstacleRenewalEvidence[slot] = 0
      zombies.attackFocusX[slot] = state.player.x
      zombies.attackFocusZ[slot] = state.player.z
      facingX = toPlayerX
      facingZ = toPlayerZ
      beginZombieEscapeAttackCycle(zombies, slot)
    } else if (!state.navigationSampleScratch.reachable) {
      rejectZombieEscapeUnanchoredZombieFromNavigation(state, slot)
      continue
    } else {
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
      zombies.attackTargetObjectId[slot] = null
      zombies.attackTargetObjectOrdinal[slot] = -1
      zombies.attackObstacleRenewalEvidence[slot] = 0
    }

    if (!holdsPosition) {
      if (!activeConnector && !(persistentPlayerTrail && playerTrailPursuitApplied)) {
        resolveZombieEscapeAgentSeparation(
          state.agentSpatialIndex,
          slot,
          zombies.pool.active,
          zombies.health,
          zombies.x,
          zombies.y,
          zombies.z,
          state.agentSeparationScratch,
        )
        constrainZombieEscapeAgentSeparationToRoute(
          state.agentSeparationScratch,
          routeSteerX,
          routeSteerZ,
        )
        advisorySeparationApplied =
          state.agentSeparationScratch.x * state.agentSeparationScratch.x +
            state.agentSeparationScratch.z * state.agentSeparationScratch.z >
          0.000_001
        steerX += state.agentSeparationScratch.x
        steerZ += state.agentSeparationScratch.z
      }

      const steeringLength = Math.hypot(steerX, steerZ)
      if (steeringLength > 0.000_1) {
        steerX /= steeringLength
        steerZ /= steeringLength
        facingX = steerX
        facingZ = steerZ
      } else {
        steerX = 0
        steerZ = 0
        facingX = toPlayerX
        facingZ = toPlayerZ
      }
    }

    const facingLength = Math.hypot(facingX, facingZ)
    const liveGoalReacquisitionHoldsHeading =
      zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase &&
      rawLiveGoalClear &&
      !liveGoalDirect &&
      !holdsPosition
    if (!liveGoalReacquisitionHoldsHeading && facingLength > 0.000_1) {
      zombies.heading[slot] = turnZombieEscapeHeadingToward(
        zombies.heading[slot]!,
        Math.atan2(facingX, facingZ),
        ZOMBIE_ESCAPE_SIMULATION.zombieTurnSpeedRadiansPerSecond * delta,
      )
    }
    const walksDuringObstacleAttack =
      !holdsPosition && zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle
    const runTarget =
      holdsPosition ||
      walksDuringObstacleAttack ||
      zombies.gait[slot] !== ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner
        ? 0
        : 1
    zombies.runBlend[slot] =
      zombies.runBlend[slot]! + (runTarget - zombies.runBlend[slot]!) * (1 - Math.exp(-4.5 * delta))
    const walkSpeed = catalogEntry.movement.walkMetersPerSecond + state.wave * 0.06
    const runSpeed = catalogEntry.movement.runMetersPerSecond + state.wave * 0.18
    const desiredSpeed =
      (walksDuringObstacleAttack
        ? walkSpeed
        : walkSpeed + (runSpeed - walkSpeed) * zombies.runBlend[slot]!) * zombies.speedScale[slot]!
    if (holdsPosition) {
      zombies.vx[slot] = 0
      zombies.vz[slot] = 0
    } else {
      const velocityResponsePerSecond = directlyTracksCurrentGoal
        ? ZOMBIE_ESCAPE_LIVE_GOAL_VELOCITY_RESPONSE_PER_SECOND
        : ZOMBIE_ESCAPE_ROUTE_VELOCITY_RESPONSE_PER_SECOND
      const response = 1 - Math.exp(-velocityResponsePerSecond * delta)
      zombies.vx[slot] = zombies.vx[slot]! + (steerX * desiredSpeed - zombies.vx[slot]!) * response
      zombies.vz[slot] = zombies.vz[slot]! + (steerZ * desiredSpeed - zombies.vz[slot]!) * response
      if (rawLiveGoalClear && currentGoalSteeringLength > 0.000_001) {
        const liveGoalDirectionX = currentGoalSteerX / currentGoalSteeringLength
        const liveGoalDirectionZ = currentGoalSteerZ / currentGoalSteeringLength
        const opposingSpeed =
          zombies.vx[slot]! * liveGoalDirectionX + zombies.vz[slot]! * liveGoalDirectionZ
        if (opposingSpeed < 0) {
          zombies.vx[slot] = zombies.vx[slot]! - opposingSpeed * liveGoalDirectionX
          zombies.vz[slot] = zombies.vz[slot]! - opposingSpeed * liveGoalDirectionZ
        }
      }
      let requestedDisplacementX = zombies.vx[slot]! * delta
      let requestedDisplacementZ = zombies.vz[slot]! * delta
      const previousConnectorIndex = zombies.navigationConnector[slot]!
      const navigationCollisionRadius = state.collisionWorld.agentRadius
      moveZombieEscapeNavigationAgent(
        state.collisionWorld,
        x,
        y,
        z,
        requestedDisplacementX,
        requestedDisplacementZ,
        navigationCollisionRadius,
        zombies.navigationConnector[slot]!,
        zombies.navigationConnectorTargetEnd[slot] !== 0,
        state.collisionHitScratch,
        state.navigationMoveScratch,
        state.navigationSampleScratch.connectorIndex,
        state.navigationSampleScratch.connectorTargetEnd,
        collisionRadius,
      )
      let requestedDistanceSquared =
        requestedDisplacementX * requestedDisplacementX +
        requestedDisplacementZ * requestedDisplacementZ
      let actualDisplacementX = state.navigationMoveScratch.x - x
      let actualDisplacementZ = state.navigationMoveScratch.z - z
      let actualDistanceSquared =
        actualDisplacementX * actualDisplacementX + actualDisplacementZ * actualDisplacementZ
      let stalledByCollision =
        state.navigationMoveScratch.collided &&
        requestedDistanceSquared > 0.000_001 &&
        actualDistanceSquared < requestedDistanceSquared * 0.0625
      const routeSteeringLength = Math.hypot(routeSteerX, routeSteerZ)
      const movedAwayFromVisibleGoal =
        rawLiveGoalClear &&
        currentGoalSteeringLength > 0.000_1 &&
        actualDisplacementX * currentGoalSteerX + actualDisplacementZ * currentGoalSteerZ <
          actualDistanceSquared
      if (
        ((stalledByCollision && advisorySeparationApplied) || movedAwayFromVisibleGoal) &&
        routeSteeringLength > 0.000_1
      ) {
        const routeTravel = desiredSpeed * delta
        requestedDisplacementX = (routeSteerX / routeSteeringLength) * routeTravel
        requestedDisplacementZ = (routeSteerZ / routeSteeringLength) * routeTravel
        moveZombieEscapeNavigationAgent(
          state.collisionWorld,
          x,
          y,
          z,
          requestedDisplacementX,
          requestedDisplacementZ,
          navigationCollisionRadius,
          previousConnectorIndex,
          zombies.navigationConnectorTargetEnd[slot] !== 0,
          state.collisionHitScratch,
          state.navigationMoveScratch,
          state.navigationSampleScratch.connectorIndex,
          state.navigationSampleScratch.connectorTargetEnd,
          collisionRadius,
        )
        requestedDistanceSquared =
          requestedDisplacementX * requestedDisplacementX +
          requestedDisplacementZ * requestedDisplacementZ
        actualDisplacementX = state.navigationMoveScratch.x - x
        actualDisplacementZ = state.navigationMoveScratch.z - z
        actualDistanceSquared =
          actualDisplacementX * actualDisplacementX + actualDisplacementZ * actualDisplacementZ
        stalledByCollision =
          state.navigationMoveScratch.collided &&
          requestedDistanceSquared > 0.000_001 &&
          actualDistanceSquared < requestedDistanceSquared * 0.0625
      }
      if (
        rawLiveGoalClear &&
        currentGoalSteeringLength > 0.000_1 &&
        actualDisplacementX * currentGoalSteerX + actualDisplacementZ * currentGoalSteerZ <
          actualDistanceSquared
      ) {
        state.navigationMoveScratch.x = x
        state.navigationMoveScratch.y = y
        state.navigationMoveScratch.z = z
        state.navigationMoveScratch.connectorIndex = previousConnectorIndex
        state.navigationMoveScratch.connectorTargetEnd =
          zombies.navigationConnectorTargetEnd[slot] !== 0
        actualDisplacementX = 0
        actualDisplacementZ = 0
        actualDistanceSquared = 0
        stalledByCollision = true
      }
      if (
        !directlyTracksCurrentGoal &&
        previousConnectorIndex < 0 &&
        state.navigationMoveScratch.connectorIndex < 0 &&
        state.navigationSampleScratch.reachable &&
        zombies.navigationIntentPending[slot] === 0 &&
        zombies.navigationSparseFlowSearchActive[slot] === 0 &&
        zombies.navigationIntentAdmissionDeferredReasons[slot] === 0 &&
        requestedDistanceSquared > 0.000_001
      ) {
        const routeLength = Math.hypot(routeSteerX, routeSteerZ)
        navigationProgressTargetNode = state.navigationSampleScratch.waypointNode ?? -1
        navigationProjectedProgress =
          routeLength > 0.000_1
            ? (actualDisplacementX * routeSteerX + actualDisplacementZ * routeSteerZ) / routeLength
            : 0
        navigationMinimumProgress = Math.max(0.000_1, Math.sqrt(requestedDistanceSquared) * 0.05)
      }
      zombies.x[slot] = state.navigationMoveScratch.x
      zombies.y[slot] = state.navigationMoveScratch.y
      zombies.z[slot] = state.navigationMoveScratch.z
      zombies.navigationConnector[slot] = state.navigationMoveScratch.connectorIndex
      zombies.navigationConnectorTargetEnd[slot] = state.navigationMoveScratch.connectorTargetEnd
        ? 1
        : 0
      zombies.vx[slot] = (zombies.x[slot]! - x) / delta
      zombies.vz[slot] = (zombies.z[slot]! - z) / delta
      const finalMovementCollided = state.navigationMoveScratch.collided
      const movementBlockerObjectId = finalMovementCollided
        ? resolveZombieEscapeCollisionHitObjectId(state.collisionWorld, state.collisionHitScratch)
        : null
      const movementBlockerObjectOrdinal = finalMovementCollided
        ? resolveZombieEscapeCollisionHitObjectOrdinal(
            state.collisionWorld,
            state.collisionHitScratch,
          )
        : -1
      const finalRouteLength = Math.hypot(routeSteerX, routeSteerZ)
      const collisionOpposesRoute =
        finalMovementCollided &&
        finalRouteLength > 0.000_1 &&
        -(
          state.collisionHitScratch.normalX * routeSteerX +
          state.collisionHitScratch.normalZ * routeSteerZ
        ) /
          finalRouteLength >
          ZOMBIE_ESCAPE_OBSTACLE_COLLISION_MINIMUM_OPPOSITION
      const movementBlockerIsBreakable =
        movementBlockerObjectId !== null &&
        isZombieEscapeCollisionObjectBreakableAtElevation(
          state.collisionWorld,
          movementBlockerObjectId,
          zombies.y[slot]!,
        )
      const acceptedObstacleCollision =
        collisionOpposesRoute &&
        movementBlockerIsBreakable &&
        (playerTrailPursuitApplied || stalledByCollision)
      const movementHitAmount = Number.isFinite(state.collisionHitScratch.time)
        ? Math.max(0, Math.min(1, state.collisionHitScratch.time))
        : 1
      const movementBlockingX = x + requestedDisplacementX * movementHitAmount
      const movementBlockingZ = z + requestedDisplacementZ * movementHitAmount
      let handledTrailCollision = false
      if (playerTrailPursuitApplied && finalMovementCollided) {
        handledTrailCollision = true
        zombies.pursuitTrailValidatedSequence[slot] = zombies.pursuitTrailSequence[slot]!
        zombies.pursuitTrailValidatedSourceX[slot] = zombies.x[slot]!
        zombies.pursuitTrailValidatedSourceZ[slot] = zombies.z[slot]!
        zombies.pursuitTrailValidatedWorldRevision[slot] = state.navigationWorldRevision
        if (acceptedObstacleCollision && movementBlockerObjectId !== null) {
          zombies.pursuitTrailBlockerObjectId[slot] = movementBlockerObjectId
          zombies.pursuitTrailBlockerObjectOrdinal[slot] = movementBlockerObjectOrdinal
          zombies.pursuitTrailBlockingX[slot] = movementBlockingX
          zombies.pursuitTrailBlockingZ[slot] = movementBlockingZ
          zombies.pursuitTrailValidatedStatus[slot] =
            ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_BREAKABLE
        } else {
          zombies.pursuitTrailBlockerObjectId[slot] = null
          zombies.pursuitTrailBlockerObjectOrdinal[slot] = -1
          zombies.pursuitTrailBlockingX[slot] = 0
          zombies.pursuitTrailBlockingZ[slot] = 0
          zombies.pursuitTrailValidatedStatus[slot] =
            ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_COLLISION_RETIRED
        }
        navigationProgressTargetNode = ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED
        zombies.navigationNoProgressTicks[slot] = 0
        zombies.navigationProgressTargetNode[slot] =
          ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED
      }
      if (acceptedObstacleCollision && movementBlockerObjectId !== null) {
        zombies.attackTargetObjectId[slot] = movementBlockerObjectId
        zombies.attackTargetObjectOrdinal[slot] = movementBlockerObjectOrdinal
        zombies.attackFocusX[slot] = movementBlockingX
        zombies.attackFocusZ[slot] = movementBlockingZ
        zombies.attackObstacleRenewalEvidence[slot] = 0
        zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle
        beginZombieEscapeAttackCycle(zombies, slot)
      }
      if (zombies.navigationConnector[slot] !== previousConnectorIndex) {
        if (zombies.navigationConnector[slot]! < 0) {
          const completedTrailConnectorSequence = zombies.pursuitTrailConnectorSequence[slot]!
          if (completedTrailConnectorSequence > 0) {
            zombies.pursuitTrailSequence[slot] = completedTrailConnectorSequence + 1
            resetZombieEscapePlayerTrailValidation(zombies, slot)
          }
          zombies.pursuitTrailConnectorSequence[slot] = 0
          if (state.collisionWorld.navigationMode !== 'sparse') {
            deferZombieEscapeNavigationIntentAdmission(state, slot, 'connectorChanged')
          } else {
            recoverZombieEscapeSparseLocalReattachment(
              state,
              slot,
              zombies.x[slot]!,
              zombies.y[slot]!,
              zombies.z[slot]!,
              'connectorChanged',
              navigationIntentTick,
            )
          }
        } else {
          cancelZombieEscapeNavigationIntentDemand(state, slot)
        }
      }
      if (
        zombies.navigationIntentUrgentRefreshUsed[slot] !== 0 &&
        hasZombieEscapeNavigationCollisionRecoveryProgressed(
          zombies.navigationCollisionRecoveryOriginX[slot]!,
          zombies.navigationCollisionRecoveryOriginZ[slot]!,
          zombies.x[slot]!,
          zombies.z[slot]!,
          collisionRadius,
        )
      ) {
        zombies.navigationIntentUrgentRefreshUsed[slot] = 0
        clearZombieEscapeDeferredNavigationIntentReason(state, slot, 'collisionRecovery')
      }
      if (stalledByCollision) {
        if (
          !handledTrailCollision &&
          !navigationIntentUpdated &&
          zombies.navigationIntentUrgentRefreshUsed[slot] === 0
        ) {
          const reanchored = tryReanchorZombieEscapeSparseCollision(state, slot, x, y, z)
          if (!reanchored) {
            zombies.navigationCollisionRecoveryOriginX[slot] = zombies.x[slot]!
            zombies.navigationCollisionRecoveryOriginZ[slot] = zombies.z[slot]!
            zombies.navigationIntentUrgentRefreshUsed[slot] = 1
            deferZombieEscapeNavigationIntentAdmission(state, slot, 'collisionRecovery')
          }
          zombies.navigationRecoveryCooldownTicks[slot] =
            ZOMBIE_ESCAPE_NAVIGATION_RECOVERY_COOLDOWN_TICKS
        }
      }
    }
    if (attackContact && previousIntent === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer) {
      const contactToPlayerX = state.player.x - zombies.x[slot]!
      const contactToPlayerZ = state.player.z - zombies.z[slot]!
      if (
        zombieEscapePlayerIsWithinAttackReach(
          state,
          slot,
          contactToPlayerX * contactToPlayerX + contactToPlayerZ * contactToPlayerZ,
          catalogEntry.characterHeightMeters,
        )
      ) {
        applyZombieEscapePlayerDamage(state, slot, 8)
      }
    }
    if (
      advanceZombieEscapeNavigationProgressWatchdog(
        zombies.navigationNoProgressTicks,
        zombies.navigationProgressTargetNode,
        zombies.navigationRecoveryCooldownTicks,
        slot,
        navigationProgressTargetNode,
        navigationProjectedProgress,
        navigationMinimumProgress,
      )
    ) {
      zombies.navigationIntentUrgentRefreshUsed[slot] = 1
      zombies.navigationCollisionRecoveryOriginX[slot] = zombies.x[slot]!
      zombies.navigationCollisionRecoveryOriginZ[slot] = zombies.z[slot]!
      deferZombieEscapeNavigationIntentAdmission(state, slot, 'collisionRecovery')
    }
    if (zombies.navigationSourceNeedsValidation[slot] === 0) {
      certifyZombieEscapeNavigationSource(
        zombies,
        slot,
        zombies.x[slot]!,
        zombies.y[slot]!,
        zombies.z[slot]!,
      )
    }
    const speed = Math.hypot(zombies.vx[slot]!, zombies.vz[slot]!)
    zombies.locomotionBlend[slot] =
      zombies.locomotionBlend[slot]! +
      (Math.min(1, speed / walkSpeed) - zombies.locomotionBlend[slot]!) * (1 - Math.exp(-9 * delta))
    zombies.locomotionPhase[slot] =
      zombies.locomotionPhase[slot]! + speed * delta * (2.2 + zombies.runBlend[slot]!)
  }
  if (state.collisionWorld.navigationMode === 'sparse') {
    drainZombieEscapeProtectedStagingReaders(state, navigationIntentTick)
    drainZombieEscapeActiveSparseSearches(state, navigationIntentTick)
  }
  state.navigationIntentMaximumResolveCountObservedPerTick = Math.max(
    state.navigationIntentMaximumResolveCountObservedPerTick,
    state.navigationIntentResolveCountThisTick,
  )
  if (
    state.navigationIntentResolveCountThisTick >
    ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick
  ) {
    state.navigationIntentResolveBudgetViolationCount += 1
  }
}

export function advanceZombieEscapeNavigationProgressWatchdog(
  noProgressTicks: Uint16Array,
  progressTargetNodes: Int32Array,
  recoveryCooldownTicks: Uint16Array,
  slot: number,
  targetNode: number,
  projectedProgress: number,
  minimumProgress: number,
  timeoutTicks = ZOMBIE_ESCAPE_NAVIGATION_NO_PROGRESS_TIMEOUT_TICKS,
  cooldownTicks = ZOMBIE_ESCAPE_NAVIGATION_RECOVERY_COOLDOWN_TICKS,
) {
  const nextCooldown = Math.max(0, recoveryCooldownTicks[slot]! - 1)
  recoveryCooldownTicks[slot] = nextCooldown
  if (targetNode === ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED) {
    noProgressTicks[slot] = 0
    progressTargetNodes[slot] = ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED
    return false
  }
  if (progressTargetNodes[slot] !== targetNode) {
    progressTargetNodes[slot] = targetNode
    noProgressTicks[slot] = 0
    return false
  }
  if (projectedProgress >= Math.max(0, minimumProgress)) {
    noProgressTicks[slot] = 0
    return false
  }
  const nextNoProgressTicks = Math.min(0xffff, noProgressTicks[slot]! + 1)
  noProgressTicks[slot] = nextNoProgressTicks
  if (nextNoProgressTicks < Math.max(1, Math.trunc(timeoutTicks)) || nextCooldown > 0) {
    return false
  }
  noProgressTicks[slot] = 0
  recoveryCooldownTicks[slot] = Math.min(0xffff, Math.max(1, Math.trunc(cooldownTicks)))
  return true
}

export function hasZombieEscapeNavigationCollisionRecoveryProgressed(
  originX: number,
  originZ: number,
  currentX: number,
  currentZ: number,
  collisionRadius: number,
) {
  const threshold =
    Math.max(0, collisionRadius) * ZOMBIE_ESCAPE_COLLISION_RECOVERY_REARM_RADIUS_MULTIPLIER
  const deltaX = currentX - originX
  const deltaZ = currentZ - originZ
  return deltaX * deltaX + deltaZ * deltaZ >= threshold * threshold
}

function resetZombieEscapeNavigationHit(hit: ZombieEscapeCollisionHit) {
  hit.colliderIndex = -1
  hit.colliderKind = 'none'
  hit.normalX = 0
  hit.normalY = 0
  hit.normalZ = 0
  hit.time = Number.POSITIVE_INFINITY
}

type ZombieEscapeAttackCycleState = Pick<
  ZombieEscapeZombiePool,
  'attackContactResolved' | 'attackCooldown'
>
const ZOMBIE_ESCAPE_ATTACK_CYCLE_EPSILON_SECONDS = 0.000_001
export const ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT = {
  none: 0,
  contact: 1 << 0,
  completed: 1 << 1,
} as const

export function beginZombieEscapeAttackCycle(zombies: ZombieEscapeAttackCycleState, slot: number) {
  const duration = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
  const remaining = zombies.attackCooldown[slot]!
  zombies.attackCooldown[slot] =
    Number.isFinite(remaining) && remaining > duration ? remaining : duration
  zombies.attackContactResolved[slot] = 0
}

export function advanceZombieEscapeAttackCycle(
  zombies: ZombieEscapeAttackCycleState,
  slot: number,
  deltaSeconds: number,
) {
  const duration = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
  const contactSeconds = duration * ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase
  const delta = Math.max(
    0,
    Math.min(
      ZOMBIE_ESCAPE_SIMULATION.maximumFrameDeltaSeconds,
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
    ),
  )
  let remaining = Number.isFinite(zombies.attackCooldown[slot])
    ? Math.max(0, zombies.attackCooldown[slot]!)
    : duration
  if (remaining > duration + ZOMBIE_ESCAPE_ATTACK_CYCLE_EPSILON_SECONDS) {
    zombies.attackCooldown[slot] = Math.max(duration, remaining - delta)
    return ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.none
  }
  remaining = Math.min(duration, remaining)

  const nextElapsed = duration - remaining + delta
  const contact =
    zombies.attackContactResolved[slot] === 0 &&
    nextElapsed + ZOMBIE_ESCAPE_ATTACK_CYCLE_EPSILON_SECONDS >= contactSeconds
  let event = contact
    ? ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.contact
    : ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.none
  if (nextElapsed + ZOMBIE_ESCAPE_ATTACK_CYCLE_EPSILON_SECONDS >= duration) {
    event |= ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.completed
    const nextCycleElapsed = nextElapsed >= duration ? nextElapsed % duration : 0
    zombies.attackCooldown[slot] = nextCycleElapsed > 0 ? duration - nextCycleElapsed : duration
    zombies.attackContactResolved[slot] = nextCycleElapsed >= contactSeconds ? 1 : 0
  } else {
    zombies.attackCooldown[slot] = duration - nextElapsed
    if (contact) zombies.attackContactResolved[slot] = 1
  }
  return event
}

function advanceZombieEscapeObstacleHitFeedback(
  feedback: Map<string, number>,
  deltaSeconds: number,
) {
  const decay = deltaSeconds / ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds
  for (const [objectId, amount] of feedback) {
    const nextAmount = Math.max(0, amount - decay)
    if (nextAmount > 0) feedback.set(objectId, nextAmount)
    else feedback.delete(objectId)
  }
}

function hitZombieEscapeObstacle(
  state: ZombieEscapeSimulation,
  attackerSlot: number,
  objectId: string,
  focusX: number,
  focusZ: number,
) {
  if (
    state.destroyedObstacleIds.has(objectId) ||
    state.passableObstacleIds.has(objectId) ||
    !isZombieEscapeCollisionObjectBreakable(state.collisionWorld, objectId)
  ) {
    return false
  }
  state.obstacleHitFeedback.set(objectId, 1)
  const zombies = state.zombies
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    focusX,
    zombies.y[attackerSlot]! +
      getZombieEscapeZombieCatalogEntry(zombies.variant[attackerSlot]!).characterHeightMeters *
        0.45,
    focusZ,
    attackerSlot,
  )
  if (!state.obstacleDamageEnabled) return false

  const hitCount = (state.obstacleHitCounts.get(objectId) ?? 0) + 1
  if (hitCount < ZOMBIE_ESCAPE_SIMULATION.obstacleHitsToBreak) {
    state.obstacleHitCounts.set(objectId, hitCount)
    return false
  }

  state.obstacleHitCounts.delete(objectId)
  return applyZombieEscapeObstacleDelta(state, objectId, attackerSlot).applied
}

function normalizeZombieEscapeNavigationIntentsAfterObstacleRemoval(
  state: ZombieEscapeSimulation,
  attackerSlot: number,
  objectId: string,
  previousWorld: ZombieEscapeCollisionWorld,
  previousWorldGeneration: number,
  collisionWorldChanged: boolean,
) {
  const activePlayerIndex = state.multiplayer?.activePlayerIndex()
  const zombies = state.zombies
  const navigationTopologyPreserved =
    collisionWorldChanged &&
    zombieEscapeNavigationTopologyMatches(previousWorld, state.collisionWorld)
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0) continue
    if (state.multiplayer && !state.multiplayer.bindZombieTarget(slot)) continue
    const targetsRemovedObject =
      slot === attackerSlot ||
      zombies.navigationBlockerObjectId[slot] === objectId ||
      zombies.attackTargetObjectId[slot] === objectId
    if (targetsRemovedObject) {
      zombies.attackTargetObjectId[slot] = null
      zombies.attackTargetObjectOrdinal[slot] = -1
      zombies.navigationBlockerBreakable[slot] = 0
      zombies.navigationBlockerObjectId[slot] = null
      zombies.navigationBlockerObjectOrdinal[slot] = -1
      if (
        navigationTopologyPreserved &&
        state.collisionWorld.navigationMode === 'sparse' &&
        zombies.navigationReachable[slot] === 0
      ) {
        recoverZombieEscapeSparseLocalReattachment(
          state,
          slot,
          zombies.x[slot]!,
          zombies.y[slot]!,
          zombies.z[slot]!,
          'cachedAnchorLost',
          state.navigationIntentTick,
        )
      }
    }
    if (
      navigationTopologyPreserved &&
      zombies.navigationIntentValid[slot] !== 0 &&
      zombies.navigationIntentPoolGeneration[slot] === zombies.pool.generation[slot] &&
      zombies.navigationIntentWorldGeneration[slot] === previousWorldGeneration
    ) {
      zombies.navigationIntentWorldGeneration[slot] = state.collisionWorldGeneration
      zombies.navigationIntentUrgentRefreshUsed[slot] = 0
    } else if (!navigationTopologyPreserved) {
      zombies.navigationIntentHasCached[slot] = 0
      zombies.navigationIntentValid[slot] = 0
      zombies.navigationRequestedConnector[slot] = -1
      zombies.navigationRequestedConnectorTargetEnd[slot] = 0
    }
  }
  if (activePlayerIndex !== undefined) state.multiplayer?.bindPlayerIndex(activePlayerIndex)
}

function clearZombieEscapeRemovedObstacleReferences(zombies: ZombieEscapeZombiePool, slot: number) {
  zombies.attackTargetObjectId[slot] = null
  zombies.attackTargetObjectOrdinal[slot] = -1
  zombies.navigationBlockerBreakable[slot] = 0
  zombies.navigationBlockerObjectId[slot] = null
  zombies.navigationBlockerObjectOrdinal[slot] = -1
}

function turnZombieEscapeHeadingToward(current: number, target: number, maximumDelta: number) {
  const fullTurn = Math.PI * 2
  const delta = ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
  const next = current + Math.max(-maximumDelta, Math.min(maximumDelta, delta))
  return ((((next + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
}

function applyZombieEscapeEffectiveCollisionWorld(state: ZombieEscapeSimulation) {
  const previousNavigationWorld = state.collisionWorld
  const previousNavigationGraph = previousNavigationWorld.navigationGraph
  let navigationWorld = createZombieEscapeCollisionWorldActiveView(state.collisionSourceWorld)
  let combatWorld = createZombieEscapeCollisionWorldActiveView(state.combatCollisionSourceWorld)
  let requiresRecompile = false
  for (const objectId of state.destroyedObstacleIds) {
    const navigationStatus = classifyZombieEscapeCollisionObjectDelta(
      navigationWorld,
      objectId,
      state.obstacleDeltaNavigationResult,
    )
    const combatStatus = classifyZombieEscapeCollisionObjectDelta(
      combatWorld,
      objectId,
      state.obstacleDeltaCombatResult,
    )
    if (navigationStatus === 'requires-recompile' || combatStatus === 'requires-recompile') {
      requiresRecompile = true
      break
    }
    if (navigationStatus === 'changed') {
      deactivateZombieEscapeCollisionObject(navigationWorld, state.obstacleDeltaNavigationResult)
    }
    if (combatStatus === 'changed') {
      deactivateZombieEscapeCollisionObject(combatWorld, state.obstacleDeltaCombatResult)
    }
  }
  if (requiresRecompile) {
    navigationWorld = createZombieEscapeCollisionWorldActiveView(
      createZombieEscapeCollisionWorldWithoutObjects(
        state.collisionSourceWorld,
        state.destroyedObstacleIds,
      ),
    )
    combatWorld = createZombieEscapeCollisionWorldActiveView(
      createZombieEscapeCollisionWorldWithoutObjects(
        state.combatCollisionSourceWorld,
        state.destroyedObstacleIds,
      ),
    )
  }
  for (const objectId of state.passableObstacleIds) {
    const navigationStatus = classifyZombieEscapeCollisionObjectDelta(
      navigationWorld,
      objectId,
      state.obstacleDeltaNavigationResult,
    )
    const combatStatus = classifyZombieEscapeCollisionObjectDelta(
      combatWorld,
      objectId,
      state.obstacleDeltaCombatResult,
    )
    if (navigationStatus === 'requires-recompile' || combatStatus === 'requires-recompile') {
      continue
    }
    if (navigationStatus === 'changed') {
      deactivateZombieEscapeCollisionObject(navigationWorld, state.obstacleDeltaNavigationResult)
    }
    if (combatStatus === 'changed') {
      deactivateZombieEscapeCollisionObject(combatWorld, state.obstacleDeltaCombatResult)
    }
  }
  const changed =
    navigationWorld.revision !== state.collisionWorld.revision ||
    combatWorld.revision !== state.combatCollisionWorld.revision
  if (!changed) return false
  const navigationTopologyPreserved = zombieEscapeNavigationTopologyMatches(
    previousNavigationWorld,
    navigationWorld,
  )
  const previousTargetRequestedRevision = state.navigationTargetRequestedRevision
  if (state.navigationSparseSpawnSearchActive) {
    state.navigationSparseSpawnSearchInvalidatedCount += 1
    state.navigationSparseSpawnSearchDependencyWaiting = false
    state.navigationSparseSpawnSearchNeedsRestart = true
  }
  setZombieEscapeFlowFieldWorld(state.navigationField, navigationWorld)
  state.navigationRouteTargetInitialized = false
  state.navigationRouteTargetRegionIndex = -1
  state.navigationTargetCommittedRouteGeneration = getZombieEscapeSparseCommittedRouteGeneration(
    state.navigationField,
  )
  state.navigationTargetRequestedLayerHint =
    state.navigationField.graphSparseTargetUpdate.requestedTargetLayerHint
  state.navigationTargetRequestedRevision = getZombieEscapeSparseRequestedTargetRevision(
    state.navigationField,
  )
  if (navigationTopologyPreserved) {
    for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
      if (
        state.zombies.pool.active[slot] !== 0 &&
        state.zombies.navigationIntentTargetRevision[slot] === previousTargetRequestedRevision
      ) {
        state.zombies.navigationIntentTargetRevision[slot] = state.navigationTargetRequestedRevision
      }
    }
  }
  if (navigationWorld.navigationConnectors !== previousNavigationWorld.navigationConnectors) {
    remapZombieEscapeActiveNavigationConnectors(
      state.zombies,
      previousNavigationWorld,
      navigationWorld,
    )
  }
  state.collisionWorld = navigationWorld
  state.combatCollisionWorld = combatWorld
  if (!navigationTopologyPreserved) {
    state.navigationGoalInitialized = false
    state.navigationGoalLayerIndex = -1
    state.navigationGoalRegionIndex = -1
    resetZombieEscapePlayerTrail(state.playerTrail)
  }
  if (navigationWorld.navigationGraph !== previousNavigationGraph) {
    state.navigationSharedRouteCache = createZombieEscapeSharedRouteCacheForGraph(
      navigationWorld.navigationGraph,
    )
    remapZombieEscapeNavigationWaypoints(state, previousNavigationWorld, navigationWorld)
  }
  state.collisionWorldGeneration += 1
  state.navigationWorldRevision += 1
  if (!navigationTopologyPreserved && navigationWorld.navigationMode === 'sparse') {
    for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
      if (state.zombies.pool.active[slot] === 0) continue
      rejectZombieEscapeUnanchoredZombieFromNavigation(state, slot)
    }
  }
  beginZombieEscapeWorldRefreshAdmissionEpoch(state)
  state.multiplayer?.worldChanged()
  return true
}

function invalidateZombieEscapeRuntimeForCollisionMaskDelta(state: ZombieEscapeSimulation) {
  acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval(state.navigationField)
  state.multiplayer?.collisionMaskChanged()
  state.navigationWorldRevision += 1
}

function remapZombieEscapeActiveNavigationConnectors(
  zombies: ZombieEscapeZombiePool,
  previousWorld: ZombieEscapeCollisionWorld,
  nextWorld: ZombieEscapeCollisionWorld,
) {
  const nextConnectorByKey = new Map<string, number>()
  for (let index = 0; index < nextWorld.navigationConnectors.length; index += 1) {
    nextConnectorByKey.set(
      zombieEscapeNavigationConnectorTraversalKey(nextWorld.navigationConnectors[index]!),
      index,
    )
  }
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.navigationConnector[slot]! < 0) continue
    const previousConnector = previousWorld.navigationConnectors[zombies.navigationConnector[slot]!]
    const nextConnectorIndex = previousConnector
      ? nextConnectorByKey.get(zombieEscapeNavigationConnectorTraversalKey(previousConnector))
      : undefined
    zombies.navigationConnector[slot] = nextConnectorIndex ?? -1
    if (nextConnectorIndex === undefined) zombies.navigationConnectorTargetEnd[slot] = 0
  }
}

function zombieEscapeNavigationConnectorTraversalKey(
  connector: ZombieEscapeCollisionWorld['navigationConnectors'][number],
) {
  return `${connector.id}\u0000${connector.objectId}\u0000${connector.chainId}\u0000${String(connector.chainOrder)}`
}

function zombieEscapeNavigationTopologyMatches(
  previousWorld: ZombieEscapeCollisionWorld,
  nextWorld: ZombieEscapeCollisionWorld,
) {
  const previousGraph = previousWorld.navigationGraph
  const nextGraph = nextWorld.navigationGraph
  if (
    previousGraph.nodeKeys.length !== nextGraph.nodeKeys.length ||
    previousWorld.navigationConnectors.length !== nextWorld.navigationConnectors.length
  ) {
    return false
  }
  for (let node = 0; node < previousGraph.nodeKeys.length; node += 1) {
    if (previousGraph.nodeKeys[node] !== nextGraph.nodeKeys[node]) return false
  }
  for (let connector = 0; connector < previousWorld.navigationConnectors.length; connector += 1) {
    if (
      zombieEscapeNavigationConnectorTraversalKey(
        previousWorld.navigationConnectors[connector]!,
      ) !== zombieEscapeNavigationConnectorTraversalKey(nextWorld.navigationConnectors[connector]!)
    ) {
      return false
    }
  }
  return true
}

function remapZombieEscapeNavigationWaypoints(
  state: ZombieEscapeSimulation,
  previousWorld: ZombieEscapeCollisionWorld,
  nextWorld: ZombieEscapeCollisionWorld,
) {
  const zombies = state.zombies
  const previousGraph = previousWorld.navigationGraph
  const nextGraph = nextWorld.navigationGraph
  let hasCachedWaypoint = false
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0) continue
    const waypointNode = zombies.navigationWaypointNode[slot]!
    if (waypointNode >= 0 && waypointNode < previousGraph.nodeKeys.length) {
      hasCachedWaypoint = true
    } else if (waypointNode >= 0) {
      clearZombieEscapeNavigationWaypoint(state, slot)
    }
  }
  if (!hasCachedWaypoint) return

  const nextNodeByKey = new Map<string, number>()
  for (let node = 0; node < nextGraph.nodeKeys.length; node += 1) {
    nextNodeByKey.set(nextGraph.nodeKeys[node]!, node)
  }
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0) continue
    const previousNode = zombies.navigationWaypointNode[slot]!
    if (previousNode < 0 || previousNode >= previousGraph.nodeKeys.length) continue
    const nextNode = nextNodeByKey.get(previousGraph.nodeKeys[previousNode]!)
    if (
      nextNode === undefined ||
      !sparseNavigationWaypointLayersMatch(
        previousGraph,
        previousNode,
        previousWorld,
        nextGraph,
        nextNode,
        nextWorld,
      )
    ) {
      clearZombieEscapeNavigationWaypoint(state, slot)
      continue
    }
    zombies.navigationWaypointNode[slot] = nextNode
  }
}

function sparseNavigationWaypointLayersMatch(
  previousGraph: ZombieEscapeSparseNavigationGraph,
  previousNode: number,
  previousWorld: ZombieEscapeCollisionWorld,
  nextGraph: ZombieEscapeSparseNavigationGraph,
  nextNode: number,
  nextWorld: ZombieEscapeCollisionWorld,
) {
  const previousLayer = previousWorld.navigationLayers[previousGraph.layerIndices[previousNode]!]
  const nextLayer = nextWorld.navigationLayers[nextGraph.layerIndices[nextNode]!]
  return (
    previousLayer !== undefined &&
    nextLayer !== undefined &&
    previousLayer.elevation === nextLayer.elevation
  )
}

function clearZombieEscapeNavigationWaypoint(state: ZombieEscapeSimulation, slot: number) {
  const zombies = state.zombies
  if (zombies.navigationWaypointNode[slot]! >= 0) state.navigationAnchorInvalidationCount += 1
  clearZombieEscapeSparseFlowSearchRouteCorridor(zombies.navigationSparseCommittedFlowSearch[slot]!)
  zombies.navigationIntentHasCached[slot] = 0
  zombies.navigationIntentCurrentTargetFallback[slot] = 0
  zombies.navigationWaypointFallback[slot] = 0
  zombies.navigationWaypointNode[slot] = -1
}

function writeZombieEscapeRetainedCommittedNavigationIntent(
  state: ZombieEscapeSimulation,
  slot: number,
  sourceX: number,
  sourceZ: number,
) {
  const zombies = state.zombies
  if (zombies.navigationIntentHasCached[slot] === 0 || zombies.navigationIntentValid[slot] === 0) {
    return false
  }
  restoreZombieEscapeNavigationIntent(state, slot)
  const sample = state.navigationSampleScratch
  const waypointNode = sample.waypointNode ?? -1
  if (waypointNode >= 0 && waypointNode < state.collisionWorld.navigationGraph.nodeIds.length) {
    writeZombieEscapeDeferredNavigationDirection(
      'pending',
      state.collisionWorld.agentRadius,
      sourceX,
      sourceZ,
      state.collisionWorld.navigationGraph.x[waypointNode]!,
      state.collisionWorld.navigationGraph.z[waypointNode]!,
      sample,
    )
    sample.reachable = true
    return true
  }
  const directionLength = Math.hypot(sample.x, sample.z)
  if (directionLength > 0.000_001) {
    sample.x /= directionLength
    sample.z /= directionLength
    sample.reachable = true
    sample.waypointNode = -1
    sample.waypointUsesFallback = false
    return true
  }
  const goalDistance = Math.hypot(state.navigationGoalX - sourceX, state.navigationGoalZ - sourceZ)
  if (goalDistance <= Math.max(0.08, state.collisionWorld.agentRadius * 0.5)) {
    sample.reachable = true
    sample.waypointNode = -1
    sample.waypointUsesFallback = false
    sample.x = 0
    sample.z = 0
    return true
  }
  return false
}

function restoreZombieEscapeObstacleState(state: ZombieEscapeSimulation) {
  const hadObstacleDamage = state.destroyedObstacleIds.size > 0 || state.obstacleHitCounts.size > 0
  state.destroyedObstacleIds.clear()
  state.obstacleHitFeedback.clear()
  state.obstacleHitCounts.clear()
  if (hadObstacleDamage) state.obstacleRevision += 1
  applyZombieEscapeEffectiveCollisionWorld(state)
}

function applyZombieEscapePlayerDamage(
  state: ZombieEscapeSimulation,
  attackerSlot: number,
  damage: number,
) {
  const player = state.player
  if (player.health <= 0) return false
  player.health = Math.max(0, player.health - damage)
  player.hitSlowSeconds = ZOMBIE_ESCAPE_SIMULATION.playerHitSlowSeconds
  player.hurtFlash = 1
  const zombies = state.zombies
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    player.health <= 0
      ? ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerKilled
      : ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerHurt,
    zombies.x[attackerSlot]!,
    zombies.y[attackerSlot]! +
      getZombieEscapeZombieCatalogEntry(zombies.variant[attackerSlot]!).characterHeightMeters *
        0.55,
    zombies.z[attackerSlot]!,
    zombies.variant[attackerSlot]!,
  )
  return true
}

function zombieEscapePlayerIsWithinAttackReach(
  state: ZombieEscapeSimulation,
  zombieSlot: number,
  playerDistanceSquared: number,
  zombieHeight: number,
) {
  const zombies = state.zombies
  const zombieX = zombies.x[zombieSlot]!
  const zombieZ = zombies.z[zombieSlot]!
  return (
    resolveZombieEscapeCombatVerticalRange(
      state.player.y,
      zombies.y[zombieSlot]!,
      zombieHeight,
      state.combatVerticalRangeScratch,
    ) &&
    playerDistanceSquared <= ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters ** 2 &&
    zombieEscapeSegmentIsClearInVerticalRange(
      state.combatCollisionWorld,
      zombieX,
      zombieZ,
      state.player.x,
      state.player.z,
      0.05,
      state.combatVerticalRangeScratch.minimumY,
      state.combatVerticalRangeScratch.maximumY,
      state.collisionHitScratch,
    )
  )
}

function resolveZombieEscapeCombatVerticalRange(
  playerY: number,
  zombieY: number,
  zombieHeight: number,
  output: ZombieEscapeVerticalRange,
) {
  output.minimumY = Math.max(playerY, zombieY)
  output.maximumY = Math.min(playerY + ZOMBIE_ESCAPE_PLAYER_HEIGHT, zombieY + zombieHeight)
  return output.maximumY >= output.minimumY
}

function resolveZombieEscapeNextAvailablePoolSlot(pool: ZombieEscapeFixedPool) {
  for (let offset = 0; offset < pool.capacity; offset += 1) {
    const slot = (pool.cursor + offset) % pool.capacity
    if (pool.active[slot] === 0) return slot
  }
  return -1
}

function trySpawnZombieEscapeSparseZombie(
  state: ZombieEscapeSimulation,
  isReplacement: boolean,
  requestedVariant: number | null = null,
) {
  if (
    !state.navigationGoalInitialized ||
    state.navigationGoalResolvedTick !== state.navigationIntentTick
  ) {
    return -1
  }
  const zombies = state.zombies
  const nextSlot = resolveZombieEscapeNextAvailablePoolSlot(zombies.pool)
  if (nextSlot < 0) return -1
  const candidateRadius = getZombieEscapeZombieCollisionRadiusMeters(
    requestedVariant ?? state.variantByPoolSlot[nextSlot]!,
  )
  const minimumPlayerDistance = isReplacement
    ? ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS
    : ZOMBIE_ESCAPE_WAVE_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS
  const minimumPlayerDistanceSquared = minimumPlayerDistance * minimumPlayerDistance
  const seedPhase = ((Math.imul(state.seed | 0, 0x9e37_79b1) >>> 0) / 0x1_0000_0000) * Math.PI * 2
  state.navigationSparseSpawnMinimumTargetDistanceMeters = minimumPlayerDistance
  state.navigationSparseSpawnIsReplacement = isReplacement
  let probes = 0
  while (probes < ZOMBIE_ESCAPE_WAVE_SPAWN_MAXIMUM_PROBES_PER_ADMISSION) {
    const ordinal = state.navigationSparseSpawnProbeOrdinal >>> 0
    state.navigationSparseSpawnProbeOrdinal = (ordinal + 1) >>> 0
    probes += 1
    const angle = seedPhase + ordinal * ZOMBIE_ESCAPE_WAVE_SPAWN_GOLDEN_ANGLE_RADIANS
    const radialUnit = ((ordinal + 1) * 0.754_877_666_246_692_7) % 1
    const minimumRadiusSquared = ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS ** 2
    const maximumRadiusSquared = ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MAXIMUM_RADIUS_METERS ** 2
    const radius = Math.sqrt(
      minimumRadiusSquared + (maximumRadiusSquared - minimumRadiusSquared) * radialUnit,
    )
    const desiredX = Math.sin(angle) * radius
    const desiredZ = Math.cos(angle) * radius
    state.navigationSparseSpawnDesiredX = desiredX
    state.navigationSparseSpawnDesiredZ = desiredZ
    const playerOffsetX = desiredX - state.player.x
    const playerOffsetZ = desiredZ - state.player.z
    if (
      (state.multiplayer &&
        !state.multiplayer.spawnPositionAllowed(
          desiredX,
          desiredZ,
          minimumPlayerDistanceSquared,
        )) ||
      playerOffsetX * playerOffsetX + playerOffsetZ * playerOffsetZ < minimumPlayerDistanceSquared
    ) {
      continue
    }
    const slot = spawnZombieEscapeSparseAnchoredZombie(
      state,
      desiredX,
      desiredZ,
      nextSlot,
      candidateRadius,
      minimumPlayerDistanceSquared,
      44 + state.wave * 8,
      requestedVariant,
    )
    if (slot < 0) continue
    state.navigationSparseSpawnSearchStartedCount += 1
    state.navigationSparseSpawnSearchCompletedCount += 1
    state.navigationSparseSpawnProbeCountTotal += probes
    state.navigationSparseSpawnProbeMaximumObservedPerAdmission = Math.max(
      state.navigationSparseSpawnProbeMaximumObservedPerAdmission,
      probes,
    )
    return slot
  }
  state.navigationSparseSpawnProbeCountTotal += probes
  state.navigationSparseSpawnProbeMaximumObservedPerAdmission = Math.max(
    state.navigationSparseSpawnProbeMaximumObservedPerAdmission,
    probes,
  )
  return -1
}

function trySpawnZombieEscapeDenseZombie(
  state: ZombieEscapeSimulation,
  isReplacement: boolean,
  requestedVariant: number | null = null,
) {
  const angle = nextZombieEscapeRandom(state.random) * Math.PI * 2
  const radius =
    ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS +
    nextZombieEscapeRandom(state.random) *
      (ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MAXIMUM_RADIUS_METERS -
        ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS)
  const desiredX = Math.sin(angle) * radius
  const desiredZ = Math.cos(angle) * radius
  if (
    !resolveZombieEscapeReachableSpawn(
      state.navigationField,
      desiredX,
      desiredZ,
      state.player.x,
      state.player.z,
      isReplacement
        ? ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS
        : ZOMBIE_ESCAPE_WAVE_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
      state.reachableSpawnScratch,
      state.navigationTargetY,
    )
  ) {
    return -1
  }
  return spawnZombieEscapeZombieAtNavigationElevation(
    state,
    state.reachableSpawnScratch.x,
    state.reachableSpawnScratch.z,
    ZOMBIE_ESCAPE_WAVE_SPAWN_AUTHORED_GROUND_ELEVATION_METERS,
    44 + state.wave * 8,
    requestedVariant,
  )
}

function trySpawnZombieEscapeAmbientHandoffCandidate(state: ZombieEscapeSimulation) {
  const handoff = state.ambientHandoff
  const queueIndex = handoff.candidateCursor
  if (queueIndex < 0 || queueIndex >= handoff.candidateCount) return -1
  const nextSlot = resolveZombieEscapeNextAvailablePoolSlot(state.zombies.pool)
  if (nextSlot < 0) return -1

  let slot = -1
  if (state.collisionWorld.navigationMode === 'sparse') {
    if (
      !state.navigationGoalInitialized ||
      state.navigationGoalResolvedTick !== state.navigationIntentTick ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration <= 0
    ) {
      return -1
    }
    const anchor = state.navigationSparseSpawnAnchorScratch
    const candidateRadius = getZombieEscapeZombieCollisionRadiusMeters(
      handoff.candidateVariant[queueIndex]!,
    )
    if (
      sampleZombieEscapeSparseSpawnAnchor(
        state.navigationField,
        handoff.candidateX[queueIndex]!,
        handoff.candidateZ[queueIndex]!,
        handoff.candidateY[queueIndex]!,
        state.navigationSparseSpawnRouteScratch,
        anchor,
      ) &&
      anchor.generation === state.navigationTargetCommittedRouteGeneration &&
      resolveZombieEscapeNextAvailablePoolSlot(state.zombies.pool) === nextSlot &&
      zombieEscapeAgentSpatialPositionIsClear(
        state.agentSpatialIndex,
        anchor.layerIndex,
        anchor.x,
        anchor.z,
        candidateRadius,
        state.zombies.variant,
        state.zombies.x,
        state.zombies.z,
      )
    ) {
      slot = initializeZombieEscapeZombie(state, anchor.x, anchor.z, 44 + state.wave * 8, anchor)
    }
  } else {
    const candidateX = handoff.candidateX[queueIndex]!
    const candidateZ = handoff.candidateZ[queueIndex]!
    slot = initializeZombieEscapeZombie(state, candidateX, candidateZ, 44 + state.wave * 8, null)
    state.zombies.y[slot] = handoff.candidateY[queueIndex]!
    certifyZombieEscapeNavigationSource(
      state.zombies,
      slot,
      state.zombies.x[slot]!,
      state.zombies.y[slot]!,
      state.zombies.z[slot]!,
    )
  }
  if (slot >= 0) {
    applyZombieEscapeAmbientHandoffCandidate(state, queueIndex, slot)
    if (state.collisionWorld.navigationMode === 'sparse') {
      state.navigationSparseSpawnSearchStartedCount += 1
      state.navigationSparseSpawnSearchCompletedCount += 1
    }
    handoff.candidateCursor += 1
    return slot
  }

  handoff.candidateAnchorAttempts[queueIndex] = Math.min(
    0xff,
    handoff.candidateAnchorAttempts[queueIndex]! + 1,
  )
  if (
    handoff.candidateAnchorAttempts[queueIndex]! <
    ZOMBIE_ESCAPE_AMBIENT_HANDOFF_MAXIMUM_ANCHOR_ATTEMPTS
  ) {
    return -1
  }
  slot =
    state.collisionWorld.navigationMode === 'sparse'
      ? trySpawnZombieEscapeSparseZombie(state, false)
      : trySpawnZombieEscapeDenseZombie(state, false)
  if (slot < 0) return -1
  applyZombieEscapeAmbientHandoffCandidate(state, queueIndex, slot)
  handoff.candidateCursor += 1
  return slot
}

function applyZombieEscapeAmbientHandoffCandidate(
  state: ZombieEscapeSimulation,
  queueIndex: number,
  slot: number,
) {
  const handoff = state.ambientHandoff
  const zombies = state.zombies
  const locomotionMode = handoff.candidateLocomotionMode[queueIndex]!
  zombies.attackCooldown[slot] =
    ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds +
    ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_GRACE_SECONDS +
    queueIndex * ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_STAGGER_SECONDS
  zombies.variant[slot] = handoff.candidateVariant[queueIndex]!
  zombies.heading[slot] = handoff.candidateYaw[queueIndex]!
  zombies.locomotionBlend[slot] =
    locomotionMode === ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.idle ? 0 : 1
  zombies.locomotionPhase[slot] = handoff.candidateLocomotionPhase[queueIndex]!
  zombies.runBlend[slot] = locomotionMode === ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.run ? 1 : 0
  bindZombieEscapeAmbientHandoffOwnership(
    handoff,
    handoff.candidateNpcIndex[queueIndex]!,
    slot,
    zombies.pool.generation[slot]!,
  )
}

export function resolveZombieEscapeNightProgress(phaseSecondsRemaining: number) {
  const duration = ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds
  if (duration <= 0) return 1
  const remaining = Number.isFinite(phaseSecondsRemaining)
    ? Math.min(duration, Math.max(0, phaseSecondsRemaining))
    : duration
  return (duration - remaining) / duration
}

export function countZombieEscapePendingBossSpawns(state: ZombieEscapeSimulation) {
  let count = 0
  for (let kind = 0; kind < ZOMBIE_ESCAPE_BOSS_KIND_COUNT; kind += 1) {
    if (state.bossSpawnPending[kind] !== 0) count += 1
  }
  return count
}

function countZombieEscapeReservedBossCapacity(state: ZombieEscapeSimulation) {
  let count = 0
  for (let kind = 0; kind < ZOMBIE_ESCAPE_BOSS_KIND_COUNT; kind += 1) {
    if (state.bossDefeated[kind] === 0) count += 1
  }
  return count
}

function countZombieEscapeActiveBosses(state: ZombieEscapeSimulation) {
  let count = 0
  for (let kind = 0; kind < ZOMBIE_ESCAPE_BOSS_KIND_COUNT; kind += 1) {
    const slot = state.bossOwnerSlot[kind]!
    if (
      slot >= 0 &&
      state.zombies.pool.active[slot] !== 0 &&
      state.zombies.pool.generation[slot] === state.bossOwnerGeneration[kind]
    ) {
      count += 1
    }
  }
  return count
}

function resolveZombieEscapeScheduledGenericPopulation(state: ZombieEscapeSimulation) {
  return (
    state.zombies.pool.activeCount -
    countZombieEscapeActiveBosses(state) +
    Math.max(0, state.replacementSpawnRemaining) +
    Math.max(0, state.waveSpawnRemaining)
  )
}

export function resolveZombieEscapeScheduledPopulation(state: ZombieEscapeSimulation) {
  return (
    state.zombies.pool.activeCount +
    Math.max(0, state.replacementSpawnRemaining) +
    Math.max(0, state.waveSpawnRemaining) +
    countZombieEscapePendingBossSpawns(state)
  )
}

function trimZombieEscapeQueuedGenericSpawnsForPendingBosses(state: ZombieEscapeSimulation) {
  let excess = Math.max(
    0,
    resolveZombieEscapeScheduledPopulation(state) - state.zombies.pool.capacity,
  )
  if (excess <= 0 || countZombieEscapePendingBossSpawns(state) <= 0) return
  const waveTrim = Math.min(excess, state.waveSpawnRemaining)
  state.waveSpawnRemaining -= waveTrim
  excess -= waveTrim
  if (excess <= 0) return
  state.replacementSpawnRemaining -= Math.min(excess, state.replacementSpawnRemaining)
}

function scheduleZombieEscapeNightBosses(state: ZombieEscapeSimulation) {
  const progress = resolveZombieEscapeNightProgress(state.phaseSecondsRemaining)
  for (let kind = 0; kind < ZOMBIE_ESCAPE_BOSS_KIND_COUNT; kind += 1) {
    if (state.bossSpawned[kind] !== 0 || state.bossDefeated[kind] !== 0) continue
    const profile = getZombieEscapeZombieCatalogEntry(state.bossVariant[kind]!).gameplay
    if (profile.nightSpawnProgress === null || progress < profile.nightSpawnProgress) continue
    if (
      state.zombies.pool.activeCount + countZombieEscapePendingBossSpawns(state) >=
      state.zombies.pool.capacity
    ) {
      continue
    }
    state.bossSpawnPending[kind] = 1
    state.waveIntermissionSeconds = 0
    state.waveState = 'active'
  }
}

function findZombieEscapePendingBossKind(state: ZombieEscapeSimulation) {
  for (let kind = 0; kind < ZOMBIE_ESCAPE_BOSS_KIND_COUNT; kind += 1) {
    if (state.bossSpawnPending[kind] !== 0) return kind as ZombieEscapeBossKind
  }
  return -1
}

function trySpawnZombieEscapePendingBoss(
  state: ZombieEscapeSimulation,
  kind: ZombieEscapeBossKind,
) {
  const variant = state.bossVariant[kind]!
  const slot =
    state.collisionWorld.navigationMode === 'sparse'
      ? trySpawnZombieEscapeSparseZombie(state, false, variant)
      : trySpawnZombieEscapeDenseZombie(state, false, variant)
  if (slot < 0) return -1
  state.bossDefeated[kind] = 0
  state.bossOwnerGeneration[kind] = state.zombies.pool.generation[slot]!
  state.bossOwnerSlot[kind] = slot
  state.bossSpawnPending[kind] = 0
  state.bossSpawned[kind] = 1
  return slot
}

function resolveZombieEscapeBossOwnerKind(state: ZombieEscapeSimulation, slot: number) {
  const generation = state.zombies.pool.generation[slot]!
  for (let kind = 0; kind < ZOMBIE_ESCAPE_BOSS_KIND_COUNT; kind += 1) {
    if (state.bossOwnerSlot[kind] === slot && state.bossOwnerGeneration[kind] === generation) {
      return kind as ZombieEscapeBossKind
    }
  }
  return -1
}

function releaseZombieEscapeZombieSlot(
  state: ZombieEscapeSimulation,
  slot: number,
  reason: 'death' | 'navigation',
) {
  const bossKind = resolveZombieEscapeBossOwnerKind(state, slot)
  const released = releaseZombieEscapePoolSlot(state.zombies.pool, slot)
  if (!released) return false
  clearZombieEscapeAmbientHandoffSlotOwnership(state.ambientHandoff, slot)
  if (bossKind !== -1) {
    state.bossOwnerGeneration[bossKind] = 0
    state.bossOwnerSlot[bossKind] = -1
    if (state.phase === 'night') {
      const profile = getZombieEscapeZombieCatalogEntry(state.bossVariant[bossKind]!).gameplay
      if (reason === 'death' && !profile.respawnsDuringNight) {
        state.bossDefeated[bossKind] = 1
        state.bossSpawnPending[bossKind] = 0
      } else {
        state.bossSpawnPending[bossKind] = 1
        state.waveIntermissionSeconds = 0
        state.waveState = 'active'
      }
    }
    return true
  }
  if (state.phase === 'night' && state.waveState === 'active') {
    state.replacementSpawnRemaining = Math.min(
      state.zombies.pool.capacity,
      state.replacementSpawnRemaining + 1,
    )
  }
  return true
}

function updateWaves(state: ZombieEscapeSimulation, delta: number) {
  if (state.waveState === 'escape') return
  scheduleZombieEscapeNightBosses(state)
  trimZombieEscapeQueuedGenericSpawnsForPendingBosses(state)
  scheduleZombieEscapeNightPopulationGrowth(state)
  if (state.waveState === 'intermission') {
    state.waveIntermissionSeconds -= delta
    if (state.waveIntermissionSeconds <= 0) {
      state.wave += 1
      state.waveState = 'active'
      state.waveSpawnRemaining = resolveZombieEscapeNightGenericZombieTarget(
        state.phaseSecondsRemaining,
        state.zombies.pool.capacity,
        state.priorNightKills,
        countZombieEscapeReservedBossCapacity(state),
      )
      state.waveSpawnTimerSeconds = 0
    }
    return
  }

  state.waveSpawnTimerSeconds -= delta
  let admissionsRemaining = ZOMBIE_ESCAPE_SIMULATION.zombieSpawnMaximumAdmissionsPerTick
  if (state.collisionWorld.navigationMode === 'sparse') {
    while (
      admissionsRemaining > 0 &&
      (countZombieEscapePendingBossSpawns(state) > 0 ||
        state.replacementSpawnRemaining > 0 ||
        state.waveSpawnRemaining > 0) &&
      state.waveSpawnTimerSeconds <= 0 &&
      state.zombies.pool.activeCount < state.zombies.pool.capacity
    ) {
      const bossKind = findZombieEscapePendingBossKind(state)
      const hasAmbientCandidate =
        bossKind < 0 &&
        state.waveSpawnRemaining > 0 &&
        state.ambientHandoff.candidateCursor < state.ambientHandoff.candidateCount
      const isReplacement =
        bossKind < 0 && !hasAmbientCandidate && state.replacementSpawnRemaining > 0
      state.waveSpawnTimerSeconds += ZOMBIE_ESCAPE_SIMULATION.zombieSpawnIntervalSeconds
      admissionsRemaining -= 1
      const slot =
        bossKind !== -1
          ? trySpawnZombieEscapePendingBoss(state, bossKind)
          : hasAmbientCandidate
            ? trySpawnZombieEscapeAmbientHandoffCandidate(state)
            : trySpawnZombieEscapeSparseZombie(state, isReplacement)
      if (slot >= 0) {
        if (bossKind !== -1) continue
        if (isReplacement) state.replacementSpawnRemaining -= 1
        else state.waveSpawnRemaining -= 1
      }
    }
  } else {
    while (
      admissionsRemaining > 0 &&
      (countZombieEscapePendingBossSpawns(state) > 0 ||
        state.replacementSpawnRemaining > 0 ||
        state.waveSpawnRemaining > 0) &&
      state.waveSpawnTimerSeconds <= 0 &&
      state.zombies.pool.activeCount < state.zombies.pool.capacity
    ) {
      const bossKind = findZombieEscapePendingBossKind(state)
      const hasAmbientCandidate =
        bossKind < 0 &&
        state.waveSpawnRemaining > 0 &&
        state.ambientHandoff.candidateCursor < state.ambientHandoff.candidateCount
      const isReplacement =
        bossKind < 0 && !hasAmbientCandidate && state.replacementSpawnRemaining > 0
      state.waveSpawnTimerSeconds += ZOMBIE_ESCAPE_SIMULATION.zombieSpawnIntervalSeconds
      admissionsRemaining -= 1
      const slot =
        bossKind !== -1
          ? trySpawnZombieEscapePendingBoss(state, bossKind)
          : hasAmbientCandidate
            ? trySpawnZombieEscapeAmbientHandoffCandidate(state)
            : trySpawnZombieEscapeDenseZombie(state, isReplacement)
      if (slot < 0) continue
      if (bossKind !== -1) continue
      if (isReplacement) state.replacementSpawnRemaining -= 1
      else state.waveSpawnRemaining -= 1
    }
  }

  if (
    countZombieEscapePendingBossSpawns(state) > 0 ||
    state.replacementSpawnRemaining > 0 ||
    state.waveSpawnRemaining > 0 ||
    state.zombies.pool.activeCount > 0
  ) {
    return
  }
  state.waveState = 'intermission'
  state.waveIntermissionSeconds = 2.8
  if (state.multiplayer) state.multiplayer.healPlayers(14)
  else state.player.health = Math.min(100, state.player.health + 14)
}

function segmentVerticalCapsuleFirstIntersectionAmount(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  centerX: number,
  centerZ: number,
  capsuleStartY: number,
  capsuleEndY: number,
  radius: number,
) {
  const segmentX = endX - startX
  const segmentY = endY - startY
  const segmentZ = endZ - startZ
  const offsetX = startX - centerX
  const offsetZ = startZ - centerZ
  const radialStartSquared = offsetX * offsetX + offsetZ * offsetZ
  const radiusSquared = radius * radius
  let earliest = Number.POSITIVE_INFINITY

  if (radialStartSquared <= radiusSquared && startY >= capsuleStartY && startY <= capsuleEndY) {
    return 0
  }

  const radialA = segmentX * segmentX + segmentZ * segmentZ
  if (radialA > 0.000_000_1) {
    const radialB = 2 * (offsetX * segmentX + offsetZ * segmentZ)
    const radialC = radialStartSquared - radiusSquared
    const discriminant = radialB * radialB - 4 * radialA * radialC
    if (discriminant >= 0) {
      const inverseDenominator = 1 / (2 * radialA)
      const root = Math.sqrt(discriminant)
      const first = (-radialB - root) * inverseDenominator
      const second = (-radialB + root) * inverseDenominator
      if (first >= 0 && first <= 1) {
        const y = startY + segmentY * first
        if (y >= capsuleStartY && y <= capsuleEndY) earliest = first
      }
      if (second >= 0 && second <= 1 && second < earliest) {
        const y = startY + segmentY * second
        if (y >= capsuleStartY && y <= capsuleEndY) earliest = second
      }
    }
  }

  earliest = Math.min(
    earliest,
    segmentSphereFirstIntersectionAmount(
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      centerX,
      capsuleStartY,
      centerZ,
      radius,
    ),
    segmentSphereFirstIntersectionAmount(
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      centerX,
      capsuleEndY,
      centerZ,
      radius,
    ),
  )
  return earliest
}

function segmentSphereFirstIntersectionAmount(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
) {
  const offsetX = startX - centerX
  const offsetY = startY - centerY
  const offsetZ = startZ - centerZ
  const segmentX = endX - startX
  const segmentY = endY - startY
  const segmentZ = endZ - startZ
  const c = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radius * radius
  if (c <= 0) return 0
  const a = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ
  if (a <= 0.000_000_1) return Number.POSITIVE_INFINITY
  const b = 2 * (offsetX * segmentX + offsetY * segmentY + offsetZ * segmentZ)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Number.POSITIVE_INFINITY
  const amount = (-b - Math.sqrt(discriminant)) / (2 * a)
  return amount >= 0 && amount <= 1 ? amount : Number.POSITIVE_INFINITY
}

export function resolveZombieEscapeNightDifficultyInterval(phaseSecondsRemaining: number) {
  const duration = ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds
  const remaining = Number.isFinite(phaseSecondsRemaining)
    ? Math.min(duration, Math.max(0, phaseSecondsRemaining))
    : duration
  return Math.floor(
    (duration - remaining + 1e-9) / ZOMBIE_ESCAPE_SIMULATION.nightDifficultyIntervalSeconds,
  )
}

export function resolveZombieEscapeNightZombieTarget(
  phaseSecondsRemaining: number,
  zombieCapacity: number = ZOMBIE_ESCAPE_CAPACITY.zombies,
  priorNightKillCount = 0,
) {
  const capacity = Number.isFinite(zombieCapacity) ? Math.max(0, Math.trunc(zombieCapacity)) : 0
  const duration = ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds
  const remaining = Number.isFinite(phaseSecondsRemaining)
    ? Math.min(duration, Math.max(0, phaseSecondsRemaining))
    : duration
  const basePopulationGrowth =
    ZOMBIE_ESCAPE_SIMULATION.maximumNightZombieCount -
    ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount
  const priorNightKillRamp = Number.isFinite(priorNightKillCount)
    ? Math.min(
        ZOMBIE_ESCAPE_SIMULATION.maximumNightZombieCount,
        Math.max(0, Math.trunc(priorNightKillCount)),
      )
    : 0
  const populationGrowth = basePopulationGrowth + priorNightKillRamp
  const target =
    duration > 0
      ? ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount +
        Math.round((populationGrowth * (duration - remaining)) / duration)
      : ZOMBIE_ESCAPE_SIMULATION.maximumNightZombieCount
  return Math.min(capacity, ZOMBIE_ESCAPE_SIMULATION.maximumNightZombieCount, target)
}

export function resolveZombieEscapeNightGenericZombieTarget(
  phaseSecondsRemaining: number,
  zombieCapacity: number = ZOMBIE_ESCAPE_CAPACITY.zombies,
  priorNightKillCount = 0,
  reservedBossCapacity = ZOMBIE_ESCAPE_BOSS_KIND_COUNT,
) {
  const capacity = Number.isFinite(zombieCapacity) ? Math.max(0, Math.trunc(zombieCapacity)) : 0
  const reserve = Number.isFinite(reservedBossCapacity)
    ? Math.min(capacity, Math.max(0, Math.trunc(reservedBossCapacity)))
    : 0
  return Math.min(
    resolveZombieEscapeNightZombieTarget(phaseSecondsRemaining, capacity, priorNightKillCount),
    capacity - reserve,
  )
}

export function resolveZombieEscapeNightSpawnSpeedMaximumMultiplier(phaseSecondsRemaining: number) {
  return (
    1 +
    resolveZombieEscapeNightDifficultyInterval(phaseSecondsRemaining) *
      ZOMBIE_ESCAPE_SIMULATION.zombieSpawnSpeedMaximumGrowthPerDifficultyInterval
  )
}

function scheduleZombieEscapeNightPopulationGrowth(state: ZombieEscapeSimulation) {
  const target = resolveZombieEscapeNightGenericZombieTarget(
    state.phaseSecondsRemaining,
    state.zombies.pool.capacity,
    state.priorNightKills,
    countZombieEscapeReservedBossCapacity(state),
  )
  const scheduledPopulation = resolveZombieEscapeScheduledGenericPopulation(state)
  if (scheduledPopulation >= target) return
  state.waveSpawnRemaining += target - scheduledPopulation
  state.waveIntermissionSeconds = 0
  state.waveState = 'active'
}

export function advanceZombieEscapePhaseClock(
  state: ZombieEscapeSimulation,
  elapsedSeconds: number,
) {
  if (state.paused || state.status !== 'playing') return false
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  if (elapsed <= 0) return false
  state.phaseSecondsRemaining = Math.max(0, state.phaseSecondsRemaining - elapsed)
  if (state.phaseSecondsRemaining > 0) return false
  if (state.phase === 'build') enterZombieEscapeNight(state)
  else enterZombieEscapeBuild(state)
  return true
}

function enterZombieEscapeNight(state: ZombieEscapeSimulation) {
  const enteringFromBuild = state.phase === 'build'
  state.phase = 'night'
  state.phaseSecondsRemaining = ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds
  if (enteringFromBuild) {
    state.priorNightKills = state.night > 0 ? state.currentNightKills : 0
    state.currentNightKills = 0
    state.night += 1
  }
  if (state.night <= 0) state.night = 1
  resetShotEventPool(state.shots)
  resetWeaponImpactEventPool(state.impactEvents)
  resetZombiePool(state.zombies)
  clearZombieEscapeAmbientHandoffOwnership(state.ambientHandoff)
  resetZombieEscapePlayerTrail(state.playerTrail)
  resetZombieEscapeNightBossState(state)
  resetZombieEscapeAgentSpatialIndex(state.agentSpatialIndex)
  resetZombieEscapeNavigationIntentScheduler(state)
  state.extractionOpen = false
  state.fireCooldownSeconds = 0
  resetZombieEscapeMeleeState(state.player)
  state.lastShotGeneration = 0
  state.lastShotSlot = -1
  state.nextShotVolleySequence = 0
  state.replacementSpawnRemaining = 0
  state.wave = state.night
  state.waveIntermissionSeconds = 0
  state.waveSpawnRemaining = resolveZombieEscapeNightGenericZombieTarget(
    state.phaseSecondsRemaining,
    state.zombies.pool.capacity,
    state.priorNightKills,
    countZombieEscapeReservedBossCapacity(state),
  )
  state.waveSpawnTimerSeconds = 0
  state.waveState = 'active'
  synchronizeZombieEscapeActiveWeaponAmmo(state.player)
  const inventoryMask =
    Number.isFinite(state.player.weaponInventoryMask) && state.player.weaponInventoryMask > 0
      ? Math.trunc(state.player.weaponInventoryMask) >>> 0
      : 0
  let ownedWeaponHasAmmo = false
  for (let weaponIndex = 0; weaponIndex < state.player.weaponAmmoByIndex.length; weaponIndex += 1) {
    if (
      (inventoryMask & (1 << weaponIndex)) !== 0 &&
      state.player.weaponAmmoByIndex[weaponIndex]! > 0
    ) {
      ownedWeaponHasAmmo = true
      break
    }
  }
  if (!ownedWeaponHasAmmo) {
    state.player.weaponAmmoByIndex[0] = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
    state.player.weaponIndex = 0
    state.player.weaponInventoryMask = (inventoryMask | 1) >>> 0
    state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  }
}

function enterZombieEscapeBuild(state: ZombieEscapeSimulation) {
  state.phase = 'build'
  state.phaseSecondsRemaining = ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds
  if (state.status === 'lost') {
    state.player.health = 100
    state.player.hurtFlash = 0
  }
  if (state.status !== 'playing') state.status = 'playing'
  resetShotEventPool(state.shots)
  resetWeaponImpactEventPool(state.impactEvents)
  resetZombiePool(state.zombies)
  resetZombieEscapeAmbientHandoff(state.ambientHandoff)
  resetZombieEscapePlayerTrail(state.playerTrail)
  resetZombieEscapeNightBossState(state)
  resetZombieEscapeAgentSpatialIndex(state.agentSpatialIndex)
  resetZombieEscapeNavigationIntentScheduler(state)
  restoreZombieEscapeObstacleState(state)
  state.extractionOpen = false
  state.fireCooldownSeconds = 0
  resetZombieEscapeMeleeState(state.player)
  state.lastShotGeneration = 0
  state.lastShotSlot = -1
  state.nextShotVolleySequence = 0
  state.replacementSpawnRemaining = 0
  state.waveIntermissionSeconds = 0
  state.waveSpawnRemaining = 0
  state.waveSpawnTimerSeconds = 0.35
  state.waveState = 'intermission'
  state.nearbyPickupIndex = findNearbyZombieEscapeWeaponPickup(state)
}

function findNearbyZombieEscapeWeaponPickup(state: ZombieEscapeSimulation) {
  let nearestIndex = -1
  let nearestDistance: number = ZOMBIE_ESCAPE_SIMULATION.pickupInteractionRadius
  for (let index = 0; index < state.weaponPickups.length; index += 1) {
    const pickup = state.weaponPickups[index]
    if (!pickup || !isZombieEscapeWeaponPickupAvailable(state, pickup.weaponIndex)) continue
    const distance = Math.hypot(
      state.player.x - pickup.x,
      state.player.y - pickup.y,
      state.player.z - pickup.z,
    )
    if (distance >= nearestDistance) continue
    nearestDistance = distance
    nearestIndex = index
  }
  return nearestIndex
}

function createZombieEscapePickupPrompt(state: ZombieEscapeSimulation) {
  const pickup = state.weaponPickups[state.nearbyPickupIndex]
  if (!pickup || !isZombieEscapeWeaponPickupAvailable(state, pickup.weaponIndex)) return null
  const weapon = ZOMBIE_ESCAPE_WEAPON_CATALOG[pickup.weaponIndex]
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[pickup.weaponIndex]
  if (!(weapon && profile)) return null
  const cost = resolveZombieEscapeWeaponPurchaseCost(state, pickup.weaponIndex)
  return {
    affordable: Number.isFinite(state.money) && Number.isFinite(cost) && state.money >= cost,
    cost,
    displayName: weapon.displayName,
    weaponIndex: pickup.weaponIndex,
  } satisfies ZombieEscapePickupPrompt
}

function sanitizeZombieEscapeWeaponPickupPlacements(
  placements: readonly ZombieEscapeWeaponPickupPlacement[],
) {
  const scopes = new Set<string>()
  const weapons = new Set<number>()
  const sanitized: ZombieEscapeWeaponPickupPlacement[] = []
  for (const placement of placements) {
    const weaponIndex = Math.trunc(placement.weaponIndex)
    if (
      sanitized.length >= ZOMBIE_ESCAPE_WEAPON_CATALOG.length ||
      !placement.scopeId ||
      !Number.isFinite(placement.x) ||
      !Number.isFinite(placement.y) ||
      !Number.isFinite(placement.z) ||
      weaponIndex < 0 ||
      weaponIndex >= ZOMBIE_ESCAPE_WEAPON_CATALOG.length ||
      scopes.has(placement.scopeId) ||
      weapons.has(weaponIndex)
    ) {
      continue
    }
    scopes.add(placement.scopeId)
    weapons.add(weaponIndex)
    sanitized.push({
      scopeId: placement.scopeId,
      weaponIndex,
      x: placement.x,
      y: placement.y,
      z: placement.z,
    })
  }
  return sanitized
}

function createZombieEscapeWeaponPickupIndex(
  placements: readonly ZombieEscapeWeaponPickupPlacement[],
) {
  const indexByWeaponIndex = new Int16Array(ZOMBIE_ESCAPE_WEAPON_CATALOG.length)
  indexZombieEscapeWeaponPickupsByWeaponIndex(indexByWeaponIndex, placements)
  return indexByWeaponIndex
}

function indexZombieEscapeWeaponPickupsByWeaponIndex(
  indexByWeaponIndex: Int16Array,
  placements: readonly ZombieEscapeWeaponPickupPlacement[],
) {
  indexByWeaponIndex.fill(-1)
  for (let pickupIndex = 0; pickupIndex < placements.length; pickupIndex += 1) {
    const weaponIndex = placements[pickupIndex]?.weaponIndex
    if (weaponIndex !== undefined && weaponIndex < indexByWeaponIndex.length) {
      indexByWeaponIndex[weaponIndex] = pickupIndex
    }
  }
}

function zombieEscapeTimeIsAtOrAfter(elapsedSeconds: number, targetSeconds: number) {
  if (!(Number.isFinite(elapsedSeconds) && Number.isFinite(targetSeconds))) return false
  const comparisonEpsilon =
    Number.EPSILON * Math.max(1, Math.abs(elapsedSeconds), Math.abs(targetSeconds)) * 256
  return elapsedSeconds + comparisonEpsilon >= targetSeconds
}

function createZombieEscapeWeaponPickupRespawnDeadlines() {
  const deadlines = new Float64Array(ZOMBIE_ESCAPE_WEAPON_CATALOG.length)
  resetZombieEscapeWeaponPickupRespawnDeadlines(deadlines)
  return deadlines
}

function resetZombieEscapeWeaponPickupRespawnDeadlines(deadlines: Float64Array) {
  deadlines.fill(0)
  deadlines[0] = Number.POSITIVE_INFINITY
}

export function createZombieEscapePlayerState(
  arena: ZombieEscapeArenaData,
): ZombieEscapePlayerState {
  const weaponAmmoByIndex = new Uint32Array(ZOMBIE_ESCAPE_WEAPON_CATALOG.length)
  weaponAmmoByIndex[0] = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  const player: ZombieEscapePlayerState = {
    ammo: ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted,
    aimAngle: Math.PI,
    health: 100,
    hitSlowSeconds: 0,
    hurtFlash: 0,
    locomotionBlend: 0,
    locomotionPhase: 0,
    meleeHitResolved: false,
    meleePhase: 'idle',
    meleePhaseSeconds: 0,
    meleeSequence: 0,
    meleeTargetGeneration: 0,
    meleeTargetSlot: -1,
    movementHeading: Math.PI,
    muzzleDirectionX: 0,
    muzzleDirectionY: 0,
    muzzleDirectionZ: -1,
    muzzlePoseExternal: false,
    muzzleX: arena.playerStartX,
    muzzleY: ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight,
    muzzleZ: arena.playerStartZ,
    runBlend: 0,
    weaponAmmoByIndex,
    weaponIndex: 0,
    weaponInventoryMask: 1,
    vx: 0,
    vz: 0,
    x: arena.playerStartX,
    y: 0,
    z: arena.playerStartZ,
  }
  updateDefaultMuzzlePose(player)
  return player
}

function updateDefaultMuzzlePose(player: ZombieEscapePlayerState) {
  const directionX = Math.sin(player.aimAngle)
  const directionZ = Math.cos(player.aimAngle)
  player.muzzleDirectionX = directionX
  player.muzzleDirectionY = 0
  player.muzzleDirectionZ = directionZ
  player.muzzleX = player.x + directionX * ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleForwardOffset
  player.muzzleY = player.y + ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight
  player.muzzleZ = player.z + directionZ * ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleForwardOffset
}

function createShotEventPool(capacity: number): ZombieEscapeShotEventPool {
  const hitTargetSlot = new Int16Array(capacity)
  hitTargetSlot.fill(-1)
  const hitColliderIndex = new Int32Array(capacity)
  hitColliderIndex.fill(-1)
  const lastPiercedTargetSlot = new Int16Array(capacity)
  lastPiercedTargetSlot.fill(-1)
  return {
    damage: new Float32Array(capacity),
    directionX: new Float32Array(capacity),
    directionY: new Float32Array(capacity),
    directionZ: new Float32Array(capacity),
    hitTargetGeneration: new Uint32Array(capacity),
    hitTargetSlot,
    hitColliderIndex,
    hitLocalNormalX: new Float32Array(capacity),
    hitLocalNormalY: new Float32Array(capacity),
    hitLocalNormalZ: new Float32Array(capacity),
    hitLocalX: new Float32Array(capacity),
    hitLocalY: new Float32Array(capacity),
    hitLocalZ: new Float32Array(capacity),
    hitNormalX: new Float32Array(capacity),
    hitNormalY: new Float32Array(capacity),
    hitNormalZ: new Float32Array(capacity),
    hitWorldGeneration: new Uint32Array(capacity),
    hitX: new Float32Array(capacity),
    hitY: new Float32Array(capacity),
    hitZ: new Float32Array(capacity),
    impactAge: new Float32Array(capacity),
    impactKind: new Uint8Array(capacity),
    lastPiercedTargetGeneration: new Uint32Array(capacity),
    lastPiercedTargetSlot,
    originX: new Float32Array(capacity),
    originY: new Float32Array(capacity),
    originZ: new Float32Array(capacity),
    phase: new Uint8Array(capacity),
    pool: createZombieEscapeFixedPool(capacity),
    primary: new Uint8Array(capacity),
    previousX: new Float32Array(capacity),
    previousY: new Float32Array(capacity),
    previousZ: new Float32Array(capacity),
    remainingEnemyPenetrations: new Uint8Array(capacity),
    travelAge: new Float32Array(capacity),
    volleyOrdinal: new Uint8Array(capacity),
    volleySequence: new Uint32Array(capacity),
    volleySize: new Uint8Array(capacity),
    weaponIndex: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
}

function createWeaponImpactEventPool(capacity: number): ZombieEscapeWeaponImpactEventPool {
  const targetSlot = new Int16Array(capacity)
  targetSlot.fill(-1)
  return {
    age: new Float32Array(capacity),
    damage: new Float32Array(capacity),
    effectKind: new Uint8Array(capacity),
    hitLocalNormalX: new Float32Array(capacity),
    hitLocalNormalY: new Float32Array(capacity),
    hitLocalNormalZ: new Float32Array(capacity),
    hitLocalX: new Float32Array(capacity),
    hitLocalY: new Float32Array(capacity),
    hitLocalZ: new Float32Array(capacity),
    hitWorldGeneration: new Uint32Array(capacity),
    impactKind: new Uint8Array(capacity),
    normalX: new Float32Array(capacity),
    normalY: new Float32Array(capacity),
    normalZ: new Float32Array(capacity),
    pool: createZombieEscapeFixedPool(capacity),
    sourceX: new Float32Array(capacity),
    sourceY: new Float32Array(capacity),
    sourceZ: new Float32Array(capacity),
    targetGeneration: new Uint32Array(capacity),
    targetSlot,
    weaponIndex: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
}

function updateWeaponImpactEvents(events: ZombieEscapeWeaponImpactEventPool, delta: number) {
  if (events.pool.activeCount === 0) return
  for (let slot = 0; slot < events.pool.capacity; slot += 1) {
    if (events.pool.active[slot] === 0) continue
    events.age[slot] = events.age[slot]! + delta
    if (events.age[slot]! >= ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds) {
      releaseZombieEscapePoolSlot(events.pool, slot)
    }
  }
}

function createShotPhaseMetricView(
  shots: ZombieEscapeShotEventPool,
  phase: ZombieEscapeShotPhase,
): ZombieEscapeShotPhaseMetricView {
  return {
    pool: {
      get activeCount() {
        return countZombieEscapeShotsByPhase(shots, phase)
      },
    },
  }
}

function createZombiePool(capacity: number): ZombieEscapeZombiePool {
  const navigationBlockingDistance = new Float64Array(capacity)
  navigationBlockingDistance.fill(Number.POSITIVE_INFINITY)
  const navigationRequestedConnector = new Int16Array(capacity)
  navigationRequestedConnector.fill(-1)
  return {
    attackCooldown: new Float32Array(capacity),
    attackContactResolved: new Uint8Array(capacity),
    attackFocusX: new Float32Array(capacity),
    attackFocusZ: new Float32Array(capacity),
    attackObstacleRenewalEvidence: new Uint8Array(capacity),
    attackTargetObjectId: Array.from({ length: capacity }, () => null),
    attackTargetObjectOrdinal: new Int32Array(capacity).fill(-1),
    deathPresentationSeconds: new Float32Array(capacity),
    gait: new Uint8Array(capacity),
    health: new Float32Array(capacity),
    heading: new Float32Array(capacity),
    hitFlash: new Float32Array(capacity),
    hitImpulseX: new Float32Array(capacity),
    hitImpulseY: new Float32Array(capacity),
    hitImpulseZ: new Float32Array(capacity),
    hitReaction: new Float32Array(capacity),
    intent: new Uint8Array(capacity),
    locomotionBlend: new Float32Array(capacity),
    locomotionPhase: new Float32Array(capacity),
    navigationBlockerBreakable: new Uint8Array(capacity),
    navigationBlockerObjectId: Array.from({ length: capacity }, () => null),
    navigationBlockerObjectOrdinal: new Int32Array(capacity).fill(-1),
    navigationBlockingDistance,
    navigationBlockingX: new Float64Array(capacity),
    navigationBlockingZ: new Float64Array(capacity),
    navigationConnector: new Int16Array(capacity).fill(-1),
    navigationConnectorTargetEnd: new Uint8Array(capacity),
    navigationDirectionX: new Float64Array(capacity),
    navigationDirectionZ: new Float64Array(capacity),
    navigationLiveGoalClearTicks: new Uint8Array(capacity),
    navigationCollisionRecoveryOriginX: new Float64Array(capacity),
    navigationCollisionRecoveryOriginZ: new Float64Array(capacity),
    navigationIntentAdmissionDeferredNext: new Int32Array(capacity).fill(-1),
    navigationIntentAdmissionDeferredPrevious: new Int32Array(capacity).fill(-1),
    navigationIntentAdmissionDeferredReasons: new Uint8Array(capacity),
    navigationIntentHasCached: new Uint8Array(capacity),
    navigationIntentHasReceivedFirstService: new Uint8Array(capacity),
    navigationIntentAdmissionWorldGeneration: new Uint32Array(capacity),
    navigationIntentFirstServiceEligibleSinceTick: new Uint32Array(capacity),
    navigationIntentFirstServiceTick: new Uint32Array(capacity),
    navigationIntentPending: new Uint8Array(capacity),
    navigationIntentPendingSinceTick: new Uint32Array(capacity),
    navigationIntentPoolGeneration: new Uint32Array(capacity),
    navigationIntentResolvedTick: new Uint32Array(capacity),
    navigationIntentCommittedRouteGeneration: new Uint32Array(capacity),
    navigationIntentCurrentTargetFallback: new Uint8Array(capacity),
    navigationIntentTargetRevision: new Uint32Array(capacity),
    navigationIntentUrgentRefreshUsed: new Uint8Array(capacity),
    navigationIntentValid: new Uint8Array(capacity),
    navigationIntentWorldGeneration: new Uint32Array(capacity),
    navigationNoProgressTicks: new Uint16Array(capacity),
    navigationProgressTargetNode: new Int32Array(capacity).fill(
      ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED,
    ),
    navigationRecoveryCooldownTicks: new Uint16Array(capacity),
    navigationReachable: new Uint8Array(capacity),
    navigationRequestedConnector,
    navigationRequestedConnectorTargetEnd: new Uint8Array(capacity),
    navigationSparseCommittedFlowSearch: Array.from({ length: capacity }, () =>
      createZombieEscapeSparseFlowSearch(),
    ),
    navigationSparseFlowHit: Array.from({ length: capacity }, () =>
      createZombieEscapeCollisionHit(),
    ),
    navigationSparseFlowSample: Array.from({ length: capacity }, () =>
      createZombieEscapeNavigationSample(),
    ),
    navigationSparseFlowSearch: Array.from({ length: capacity }, () =>
      createZombieEscapeSparseFlowSearch(),
    ),
    navigationSparseFlowSearchActive: new Uint8Array(capacity),
    navigationSparseFlowSearchDependencyWaiting: new Uint8Array(capacity),
    navigationSparseFlowSearchLastProgressTick: new Uint32Array(capacity),
    navigationSparseFlowSearchRestartToken: new Uint8Array(capacity),
    navigationSparseFlowSearchStartedForDemand: new Uint8Array(capacity),
    navigationSparseFlowSearchTargetPreemptionUsed: new Uint8Array(capacity),
    navigationSparseFlowSearchWorldRevision: new Uint32Array(capacity),
    navigationSourceCertifiedX: new Float32Array(capacity),
    navigationSourceCertifiedY: new Float32Array(capacity),
    navigationSourceCertifiedZ: new Float32Array(capacity),
    navigationSourceNeedsValidation: new Uint8Array(capacity),
    navigationWaypointFallback: new Uint8Array(capacity),
    navigationWaypointNode: new Int32Array(capacity).fill(-1),
    pool: createZombieEscapeFixedPool(capacity),
    projectileHitOrdinal: new Uint32Array(capacity),
    pursuitTrailAcquisitionBestDistanceSquared: new Float64Array(capacity).fill(
      Number.POSITIVE_INFINITY,
    ),
    pursuitTrailAcquisitionBestSequence: new Uint32Array(capacity),
    pursuitTrailAcquisitionEndSequence: new Uint32Array(capacity),
    pursuitTrailAcquisitionGeneration: new Uint32Array(capacity),
    pursuitTrailAcquisitionLayerIndex: new Int16Array(capacity).fill(-1),
    pursuitTrailAcquisitionNextSequence: new Uint32Array(capacity),
    pursuitTrailAcquisitionScannedNewestSequence: new Uint32Array(capacity),
    pursuitTrailAcquisitionSourceX: new Float64Array(capacity),
    pursuitTrailAcquisitionSourceY: new Float64Array(capacity),
    pursuitTrailAcquisitionSourceZ: new Float64Array(capacity),
    pursuitTrailAcquisitionStatus: new Uint8Array(capacity),
    pursuitTrailAcquisitionWorldRevision: new Uint32Array(capacity),
    pursuitTrailBlockerObjectId: Array.from({ length: capacity }, () => null),
    pursuitTrailBlockerObjectOrdinal: new Int32Array(capacity).fill(-1),
    pursuitTrailBlockingX: new Float64Array(capacity),
    pursuitTrailBlockingZ: new Float64Array(capacity),
    pursuitTrailConnectorSequence: new Uint32Array(capacity),
    pursuitTrailGeneration: new Uint32Array(capacity),
    pursuitTrailReachableStartEndSequence: new Uint32Array(capacity),
    pursuitTrailReachableStartOriginSequence: new Uint32Array(capacity),
    pursuitTrailSeekingReachableStart: new Uint8Array(capacity),
    pursuitTrailSequence: new Uint32Array(capacity),
    pursuitTrailValidatedSequence: new Uint32Array(capacity),
    pursuitTrailValidatedSourceX: new Float32Array(capacity),
    pursuitTrailValidatedSourceZ: new Float32Array(capacity),
    pursuitTrailValidatedStatus: new Uint8Array(capacity),
    pursuitTrailValidatedWorldRevision: new Uint32Array(capacity),
    runBlend: new Float32Array(capacity),
    spawnOrdinal: new Uint32Array(capacity),
    speedScale: new Float32Array(capacity),
    variant: new Uint8Array(capacity),
    vx: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
}

function resetShotEventPool(shots: ZombieEscapeShotEventPool) {
  resetZombieEscapeFixedPool(shots.pool)
  shots.damage.fill(0)
  shots.directionX.fill(0)
  shots.directionY.fill(0)
  shots.directionZ.fill(0)
  shots.hitTargetGeneration.fill(0)
  shots.hitTargetSlot.fill(-1)
  shots.hitColliderIndex.fill(-1)
  shots.hitLocalNormalX.fill(0)
  shots.hitLocalNormalY.fill(0)
  shots.hitLocalNormalZ.fill(0)
  shots.hitLocalX.fill(0)
  shots.hitLocalY.fill(0)
  shots.hitLocalZ.fill(0)
  shots.hitNormalX.fill(0)
  shots.hitNormalY.fill(0)
  shots.hitNormalZ.fill(0)
  shots.hitWorldGeneration.fill(0)
  shots.hitX.fill(0)
  shots.hitY.fill(0)
  shots.hitZ.fill(0)
  shots.impactAge.fill(0)
  shots.impactKind.fill(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.none)
  shots.lastPiercedTargetGeneration.fill(0)
  shots.lastPiercedTargetSlot.fill(-1)
  shots.originX.fill(0)
  shots.originY.fill(0)
  shots.originZ.fill(0)
  shots.phase.fill(ZOMBIE_ESCAPE_SHOT_PHASE.inactive)
  shots.primary.fill(0)
  shots.previousX.fill(0)
  shots.previousY.fill(0)
  shots.previousZ.fill(0)
  shots.remainingEnemyPenetrations.fill(0)
  shots.travelAge.fill(0)
  shots.volleyOrdinal.fill(0)
  shots.volleySequence.fill(0)
  shots.volleySize.fill(0)
  shots.weaponIndex.fill(0)
  shots.x.fill(0)
  shots.y.fill(0)
  shots.z.fill(0)
}

function resetWeaponImpactEventPool(events: ZombieEscapeWeaponImpactEventPool) {
  resetZombieEscapeFixedPool(events.pool)
  events.age.fill(0)
  events.damage.fill(0)
  events.effectKind.fill(ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile)
  events.hitLocalNormalX.fill(0)
  events.hitLocalNormalY.fill(0)
  events.hitLocalNormalZ.fill(0)
  events.hitLocalX.fill(0)
  events.hitLocalY.fill(0)
  events.hitLocalZ.fill(0)
  events.hitWorldGeneration.fill(0)
  events.impactKind.fill(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.none)
  events.normalX.fill(0)
  events.normalY.fill(0)
  events.normalZ.fill(0)
  events.sourceX.fill(0)
  events.sourceY.fill(0)
  events.sourceZ.fill(0)
  events.targetGeneration.fill(0)
  events.targetSlot.fill(-1)
  events.weaponIndex.fill(0)
  events.x.fill(0)
  events.y.fill(0)
  events.z.fill(0)
}

function resetZombiePool(zombies: ZombieEscapeZombiePool) {
  for (const search of zombies.navigationSparseCommittedFlowSearch) {
    resetZombieEscapeSparseFlowSearch(search)
  }
  for (const search of zombies.navigationSparseFlowSearch) {
    resetZombieEscapeSparseFlowSearch(search)
  }
  resetZombieEscapeFixedPool(zombies.pool)
  zombies.attackCooldown.fill(0)
  zombies.attackContactResolved.fill(0)
  zombies.attackFocusX.fill(0)
  zombies.attackFocusZ.fill(0)
  zombies.attackObstacleRenewalEvidence.fill(0)
  zombies.attackTargetObjectId.fill(null)
  zombies.attackTargetObjectOrdinal.fill(-1)
  zombies.deathPresentationSeconds.fill(0)
  zombies.gait.fill(ZOMBIE_ESCAPE_ZOMBIE_GAIT.walker)
  zombies.health.fill(0)
  zombies.heading.fill(0)
  zombies.hitFlash.fill(0)
  zombies.hitImpulseX.fill(0)
  zombies.hitImpulseY.fill(0)
  zombies.hitImpulseZ.fill(0)
  zombies.hitReaction.fill(0)
  zombies.intent.fill(ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase)
  zombies.locomotionBlend.fill(0)
  zombies.locomotionPhase.fill(0)
  zombies.navigationBlockerBreakable.fill(0)
  zombies.navigationBlockerObjectId.fill(null)
  zombies.navigationBlockerObjectOrdinal.fill(-1)
  zombies.navigationBlockingDistance.fill(Number.POSITIVE_INFINITY)
  zombies.navigationBlockingX.fill(0)
  zombies.navigationBlockingZ.fill(0)
  zombies.navigationConnector.fill(-1)
  zombies.navigationConnectorTargetEnd.fill(0)
  zombies.navigationDirectionX.fill(0)
  zombies.navigationDirectionZ.fill(0)
  zombies.navigationLiveGoalClearTicks.fill(0)
  zombies.navigationCollisionRecoveryOriginX.fill(0)
  zombies.navigationCollisionRecoveryOriginZ.fill(0)
  zombies.navigationIntentAdmissionDeferredNext.fill(-1)
  zombies.navigationIntentAdmissionDeferredPrevious.fill(-1)
  zombies.navigationIntentAdmissionDeferredReasons.fill(0)
  zombies.navigationIntentHasCached.fill(0)
  zombies.navigationIntentHasReceivedFirstService.fill(0)
  zombies.navigationIntentAdmissionWorldGeneration.fill(0)
  zombies.navigationIntentFirstServiceEligibleSinceTick.fill(0)
  zombies.navigationIntentFirstServiceTick.fill(0)
  zombies.navigationIntentPending.fill(0)
  zombies.navigationIntentPendingSinceTick.fill(0)
  zombies.navigationIntentPoolGeneration.fill(0)
  zombies.navigationIntentResolvedTick.fill(0)
  zombies.navigationIntentCommittedRouteGeneration.fill(0)
  zombies.navigationIntentCurrentTargetFallback.fill(0)
  zombies.navigationIntentTargetRevision.fill(0)
  zombies.navigationIntentUrgentRefreshUsed.fill(0)
  zombies.navigationIntentValid.fill(0)
  zombies.navigationIntentWorldGeneration.fill(0)
  zombies.navigationNoProgressTicks.fill(0)
  zombies.navigationProgressTargetNode.fill(ZOMBIE_ESCAPE_NAVIGATION_PROGRESS_TARGET_UNTRACKED)
  zombies.navigationRecoveryCooldownTicks.fill(0)
  zombies.navigationReachable.fill(0)
  zombies.navigationRequestedConnector.fill(-1)
  zombies.navigationRequestedConnectorTargetEnd.fill(0)
  zombies.navigationSparseFlowSearchActive.fill(0)
  zombies.navigationSparseFlowSearchDependencyWaiting.fill(0)
  zombies.navigationSparseFlowSearchLastProgressTick.fill(0)
  zombies.navigationSparseFlowSearchRestartToken.fill(0)
  zombies.navigationSparseFlowSearchStartedForDemand.fill(0)
  zombies.navigationSparseFlowSearchTargetPreemptionUsed.fill(0)
  zombies.navigationSparseFlowSearchWorldRevision.fill(0)
  zombies.navigationSourceCertifiedX.fill(0)
  zombies.navigationSourceCertifiedY.fill(0)
  zombies.navigationSourceCertifiedZ.fill(0)
  zombies.navigationSourceNeedsValidation.fill(0)
  zombies.navigationWaypointFallback.fill(0)
  zombies.navigationWaypointNode.fill(-1)
  zombies.projectileHitOrdinal.fill(0)
  zombies.pursuitTrailAcquisitionBestDistanceSquared.fill(Number.POSITIVE_INFINITY)
  zombies.pursuitTrailAcquisitionBestSequence.fill(0)
  zombies.pursuitTrailAcquisitionEndSequence.fill(0)
  zombies.pursuitTrailAcquisitionGeneration.fill(0)
  zombies.pursuitTrailAcquisitionLayerIndex.fill(-1)
  zombies.pursuitTrailAcquisitionNextSequence.fill(0)
  zombies.pursuitTrailAcquisitionScannedNewestSequence.fill(0)
  zombies.pursuitTrailAcquisitionSourceX.fill(0)
  zombies.pursuitTrailAcquisitionSourceY.fill(0)
  zombies.pursuitTrailAcquisitionSourceZ.fill(0)
  zombies.pursuitTrailAcquisitionStatus.fill(ZOMBIE_ESCAPE_PLAYER_TRAIL_ACQUISITION_IDLE)
  zombies.pursuitTrailAcquisitionWorldRevision.fill(0)
  zombies.pursuitTrailBlockerObjectId.fill(null)
  zombies.pursuitTrailBlockerObjectOrdinal.fill(-1)
  zombies.pursuitTrailBlockingX.fill(0)
  zombies.pursuitTrailBlockingZ.fill(0)
  zombies.pursuitTrailConnectorSequence.fill(0)
  zombies.pursuitTrailGeneration.fill(0)
  zombies.pursuitTrailReachableStartEndSequence.fill(0)
  zombies.pursuitTrailReachableStartOriginSequence.fill(0)
  zombies.pursuitTrailSeekingReachableStart.fill(ZOMBIE_ESCAPE_PLAYER_TRAIL_REACHABLE_START_NONE)
  zombies.pursuitTrailSequence.fill(0)
  zombies.pursuitTrailValidatedSequence.fill(0)
  zombies.pursuitTrailValidatedSourceX.fill(0)
  zombies.pursuitTrailValidatedSourceZ.fill(0)
  zombies.pursuitTrailValidatedStatus.fill(ZOMBIE_ESCAPE_PLAYER_TRAIL_VALIDATION_INVALID)
  zombies.pursuitTrailValidatedWorldRevision.fill(0)
  zombies.runBlend.fill(0)
  zombies.spawnOrdinal.fill(0)
  zombies.speedScale.fill(0)
  zombies.variant.fill(0)
  zombies.vx.fill(0)
  zombies.vz.fill(0)
  zombies.x.fill(0)
  zombies.y.fill(0)
  zombies.z.fill(0)
}

function countActiveMuzzleFlashes(shots: ZombieEscapeShotEventPool) {
  let count = 0
  for (let slot = 0; slot < shots.pool.capacity; slot += 1) {
    if (shots.pool.active[slot] === 0) continue
    if (shots.primary[slot] === 0) continue
    if (
      shots.travelAge[slot]! + shots.impactAge[slot]! <
      ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
    ) {
      count += 1
    }
  }
  return count
}
