import type { GrassFieldBlocker } from './grass-field-texture'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import {
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS,
} from './zombie-escape-zombie-catalog'

export type ZombieEscapeCameraBookmark = 'design' | 'far' | 'near'
export type ZombieEscapeDebugMode = 'final' | 'navigation' | 'no-post' | 'pools'
export type ZombieEscapeInputMode = 'gamepad' | 'keyboard' | 'touch'
export type ZombieEscapeQuality = 'balanced' | 'performance'

export const ZOMBIE_ESCAPE_SEED = 0x5a45_2026
export const ZOMBIE_ESCAPE_ASSET_ROOT = '/landrush-lab/zombie-escape/assets/'
export const ZOMBIE_ESCAPE_PLAYER_HEIGHT = 1.82
export const ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS =
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS

// Replacement spawning uses the authored maximum envelope instead of live viewport state so
// multiplayer simulation stays deterministic while spawned zombies remain fully offscreen.
export const ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE = {
  azimuthRadians: (34 * Math.PI) / 180,
  distanceMeters: 18,
  elevationRadians: (68 * Math.PI) / 180,
  farMeters: 90,
  followResponse: 12,
  halfHeightMeters: 6.4,
  maximumAspectRatio: 21 / 9,
  nearMeters: 0.05,
  replacementSpawnMarginMeters: 1,
  targetHeightMeters: 0.72,
  zoom: 1,
} as const

export function resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(aspectRatio: number) {
  const aspect = Number.isFinite(aspectRatio) ? Math.max(0.1, aspectRatio) : 1
  const camera = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
  const horizontalHalfWidth = camera.halfHeightMeters * Math.min(aspect, camera.maximumAspectRatio)
  const verticalHalfHeight = horizontalHalfWidth / aspect
  const verticalGroundReach =
    verticalHalfHeight / Math.sin(camera.elevationRadians) +
    camera.targetHeightMeters / Math.tan(camera.elevationRadians)
  return Math.hypot(horizontalHalfWidth, verticalGroundReach)
}

export const ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS =
  resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(
    ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE.maximumAspectRatio,
  ) +
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS +
  ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE.replacementSpawnMarginMeters

export const ZOMBIE_ESCAPE_ARENA = {
  radius: 27,
  playRadius: 23.6,
  waterRadius: 72,
} as const

export const ZOMBIE_ESCAPE_CAPACITY = {
  impactEvents: 128,
  impactSparksPerShot: 12,
  shots: 64,
  zombies: 100,
} as const

export const ZOMBIE_ESCAPE_SIMULATION = {
  buildDurationSeconds: 60,
  defaultMuzzleForwardOffset: 0.86,
  defaultMuzzleHeight: 1.05,
  escapeRadius: 2.25,
  fixedDeltaSeconds: 1 / 60,
  impactLifetimeSeconds: 0.28,
  initialNightZombieCount: 10,
  initialZombiePopulationAdmissionDeadlineSeconds: 6,
  killReward: 10,
  maximumNightZombieCount: ZOMBIE_ESCAPE_CAPACITY.zombies,
  maximumFrameDeltaSeconds: 0.05,
  maximumSubsteps: 4,
  muzzleFlashSeconds: 0.085,
  navigationIntentResolveBudgetPerTick: 16,
  navigationRefreshCandidateInspectionBudgetPerTick: 64,
  navigationRouteTargetMaximumPublicationLatencyTicks: 14,
  navigationRouteTargetCellHysteresisRatio: 0.2,
  navigationRouteTargetLayerHysteresisMeters: 1.8,
  navigationSparseSearchAgentSlicesPerTick: 8,
  navigationSparseSearchCompactTargetMaximumNodeCount: 256,
  navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick: 256,
  navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick: 512,
  navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick: 512,
  navigationSparseSearchMinimumWorkUnitsPerAgentSlice: 1,
  navigationSparseSearchMaximumCandidateVisitsPerAgentSlice: 32,
  navigationSparseSearchMaximumCandidateVisitsPerTick: 256,
  navigationSparseSearchMaximumTargetCandidateVisitsPerTick: 1024,
  navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice: 8,
  navigationSparseSearchMaximumCollisionPredicatesPerTick: 64,
  navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice: 32,
  navigationSparseSearchMaximumHierarchyNodeVisitsPerTick: 256,
  navigationSparseSearchMaximumGraphEdgeVisitsPerTick: 512,
  navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick: 1024,
  navigationSparseSearchMaximumHeapOperationsPerAgentSlice: 32,
  navigationSparseSearchMaximumHeapOperationsPerTick: 256,
  navigationSparseSearchMaximumTargetHeapOperationsPerTick: 3072,
  navigationSparseSearchMaximumSupportPredicatesPerAgentSlice: 16,
  navigationSparseSearchMaximumSupportPredicatesPerTick: 128,
  navigationSparseSearchMaximumTargetBuildsPerTick: 2,
  navigationSparseSearchSpawnSlicesPerTick: 1,
  navigationSparseSearchTargetSlicesPerTick: 1,
  nightDifficultyIntervalSeconds: 30,
  nightDurationSeconds: 180,
  obstacleHitsToBreak: 2,
  pickupInteractionRadius: 1.35,
  playerHitSlowSeconds: 0.5,
  playerHitSpeedScale: 0.5,
  weaponPickupRespawnSeconds: 60,
  playerRadius: 0.5,
  projectileRadius: 0.035,
  projectileLifetimeSeconds: 1.05,
  projectileSpeed: 37,
  runSpeed: 7.1,
  walkSpeed: 4.25,
  zombieHitFlashSeconds: 0.12,
  zombieHitImpulseDecay: 7.5,
  zombieHitReactionSeconds: 0.3,
  zombieDeathCollapseSeconds: 0.72,
  zombieDeathPresentationSeconds: 2.4,
  zombieNavigationRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
  zombieNavigationRoutePlanningSpeedMetersPerSecond: 3.2,
  zombieObstacleAttackContactPhase: 0.42,
  zombieObstacleAttackCooldownSeconds: 0.72,
  zombieObstacleAttackReachMeters: 0.9,
  zombieObstacleAttackReleaseMeters: 1.1,
  zombiePlayerAttackReachMeters: 1.05,
  zombieRadius: 0.48,
  zombieSeparationRadiusMeters: 1.75,
  zombieSeparationStrength: 1.55,
  zombieSeparationVerticalToleranceMeters: 0.75,
  zombieSpawnIntervalSeconds: 0.075,
  zombieSpawnMaximumAdmissionsPerTick: 1,
  zombieLiveGoalReacquisitionClearTicks: 6,
  zombieSpawnSpeedMaximumGrowthPerDifficultyInterval: 0.05,
  zombieSpatialMaximumCandidateInspectionsPerQuery: 48,
  zombieTurnSpeedRadiansPerSecond: Math.PI * 3,
} as const

export const ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS =
  (ZOMBIE_ESCAPE_SIMULATION.obstacleHitsToBreak -
    1 +
    ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase) *
  ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds

export const ZOMBIE_ESCAPE_MELEE = {
  activeSeconds: 0.07,
  damage: 34,
  halfAngleRadians: Math.PI * 0.32,
  rangeMeters: 1.45,
  recoverySeconds: 0.28,
  windupSeconds: 0.12,
} as const

export const ZOMBIE_ESCAPE_WEAPON_PICKUPS = [
  { x: -6, z: 6 },
  { x: -3.1, z: 4.6 },
  { x: 0, z: 4 },
  { x: 3.1, z: 4.6 },
  { x: 6, z: 6 },
] as const

// Cover the pedestal at its selected scale; padding and feather match built-object blockers.
const ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS = 0.76 * 1.18
const ZOMBIE_ESCAPE_PICKUP_GRASS_CLEARANCE_METERS = 1
const ZOMBIE_ESCAPE_PICKUP_GRASS_FEATHER_METERS = 0.3
const ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS =
  ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS * Math.SQRT1_2
const ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT = [
  { x: 0, z: -ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS },
  {
    x: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
  { x: ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS, z: 0 },
  {
    x: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
  { x: 0, z: ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS },
  {
    x: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
  { x: -ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS, z: 0 },
  {
    x: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
] as const

export function createZombieEscapeWeaponPickupGrassBlockers(
  spawn: Readonly<{ x: number; z: number }>,
): readonly GrassFieldBlocker[] {
  return ZOMBIE_ESCAPE_WEAPON_PICKUPS.map((pickup) => ({
    clearanceMeters: ZOMBIE_ESCAPE_PICKUP_GRASS_CLEARANCE_METERS,
    featherMeters: ZOMBIE_ESCAPE_PICKUP_GRASS_FEATHER_METERS,
    points: ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT.map((offset) => ({
      x: spawn.x + pickup.x + offset.x,
      z: spawn.z + pickup.z + offset.z,
    })),
  }))
}

export const ZOMBIE_ESCAPE_WEAPON_PROFILES = [
  {
    ammoGranted: 60,
    blastMinimumDamageScale: 0,
    blastRadiusMeters: 0,
    chainDamageScale: 0,
    chainRadiusMeters: 0,
    chainTargetCount: 0,
    maximumEnemyHits: 1,
    mechanic: 'pistol',
    pelletCount: 1,
    presentationImpulseScale: 1,
    projectileDamage: 36,
    projectileLifetimeSeconds: 1.05,
    projectileRadius: 0.035,
    projectileSpeed: 37,
    purchaseCost: 0,
    shotIntervalSeconds: 0.19,
    spreadRadians: 0,
  },
  {
    ammoGranted: 168,
    blastMinimumDamageScale: 0,
    blastRadiusMeters: 0,
    chainDamageScale: 0,
    chainRadiusMeters: 0,
    chainTargetCount: 0,
    maximumEnemyHits: 4,
    mechanic: 'piercing',
    pelletCount: 1,
    presentationImpulseScale: 1,
    projectileDamage: 24,
    projectileLifetimeSeconds: 0.82,
    projectileRadius: 0.025,
    projectileSpeed: 48,
    purchaseCost: 5,
    shotIntervalSeconds: 0.095,
    spreadRadians: 0,
  },
  {
    ammoGranted: 72,
    blastMinimumDamageScale: 0,
    blastRadiusMeters: 0,
    chainDamageScale: 0,
    chainRadiusMeters: 0,
    chainTargetCount: 0,
    maximumEnemyHits: 1,
    mechanic: 'scatter',
    pelletCount: 7,
    presentationImpulseScale: 1,
    projectileDamage: 22,
    projectileLifetimeSeconds: 1.15,
    projectileRadius: 0.03,
    projectileSpeed: 34,
    purchaseCost: 5,
    shotIntervalSeconds: 0.42,
    spreadRadians: 0.18,
  },
  {
    ammoGranted: 256,
    blastMinimumDamageScale: 0,
    blastRadiusMeters: 0,
    chainDamageScale: 0.45,
    chainRadiusMeters: 2.8,
    chainTargetCount: 2,
    maximumEnemyHits: 1,
    mechanic: 'chain',
    pelletCount: 1,
    presentationImpulseScale: 1,
    projectileDamage: 20,
    projectileLifetimeSeconds: 0.98,
    projectileRadius: 0.035,
    projectileSpeed: 40,
    purchaseCost: 5,
    shotIntervalSeconds: 0.072,
    spreadRadians: 0,
  },
  {
    ammoGranted: 40,
    blastMinimumDamageScale: 0.3,
    blastRadiusMeters: 3.2,
    chainDamageScale: 0,
    chainRadiusMeters: 0,
    chainTargetCount: 0,
    maximumEnemyHits: 1,
    mechanic: 'blast',
    pelletCount: 1,
    presentationImpulseScale: 4,
    projectileDamage: 180,
    projectileLifetimeSeconds: 1.9,
    projectileRadius: 0.12,
    projectileSpeed: 20,
    purchaseCost: 5,
    shotIntervalSeconds: 0.68,
    spreadRadians: 0,
  },
] as const

if (
  ZOMBIE_ESCAPE_WEAPON_PICKUPS.length !== ZOMBIE_ESCAPE_WEAPON_CATALOG.length ||
  ZOMBIE_ESCAPE_WEAPON_PROFILES.length !== ZOMBIE_ESCAPE_WEAPON_CATALOG.length
) {
  throw new Error('Zombie Escape requires one pickup and balance profile per weapon')
}

export const ZOMBIE_ESCAPE_DEBUG_MODES = [
  'final',
  'navigation',
  'pools',
  'no-post',
] as const satisfies readonly ZombieEscapeDebugMode[]

export const ZOMBIE_ESCAPE_CAMERA_BOOKMARKS = [
  'near',
  'design',
  'far',
] as const satisfies readonly ZombieEscapeCameraBookmark[]

export const ZOMBIE_ESCAPE_QUALITY = {
  balanced: {
    dpr: [1, 1.35] as [number, number],
    label: 'Balanced',
  },
  performance: {
    dpr: [1, 1] as [number, number],
    label: 'Performance',
  },
} as const

export const ZOMBIE_ESCAPE_VISUAL_CONTRACT = {
  allowedDivergences: [
    'Pooled procedural zombies remain visible only while their matching generated GLB loads.',
    'The ocean is an analytic low-cost presentation layer with no reflection render target.',
  ],
  cameraEnvelope: { design: 16.7, far: 23.2, near: 11.6 },
  frameBudgetMs: 16.7,
  identity: ['chunky orbot silhouette', 'sunlit island arena', 'cyan extraction beacon'],
  invariants: [
    'Movement and aim remain independently readable.',
    'Each trigger owns one primary carrier; spread volleys add generation-keyed secondary carriers and every contact emits an immutable impact event.',
    'The player, zombies, shots, hit reactions, and extraction beacon remain legible without post effects.',
    'Reset reproduces spawn order and arena layout for the fixed seed.',
  ],
  materialSeparation: ['warm sand', 'green turf', 'cool water', 'coral threats'],
  motion: ['walk-run blend', 'separated zombie steering', 'generation-keyed pooled shot events'],
  silhouette: ['low island shelf', 'upright orbot', 'hunched zombie crowd'],
  subject: 'A deterministic stylized island zombie-escape arena',
} as const

const defaultWeapon = ZOMBIE_ESCAPE_WEAPON_CATALOG[0]
if (!defaultWeapon) throw new Error('Zombie Escape requires at least one weapon catalog entry')

export const ZOMBIE_ESCAPE_DEFAULT_WEAPON = defaultWeapon
export const ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT: number = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length

if (ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT === 0) {
  throw new Error('Zombie Escape requires at least one zombie catalog entry')
}

export function getZombieEscapeZombieCatalogEntry(index: number) {
  const normalizedIndex =
    ((Math.trunc(index) % ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length) +
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length) %
    ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
  const entry = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[normalizedIndex]
  if (!entry) throw new Error('Zombie Escape zombie catalog is unexpectedly empty')
  return entry
}

export function getZombieEscapeZombieCollisionRadiusMeters(index: number) {
  return getZombieEscapeZombieCatalogEntry(index).capsule.radiusMeters
}

export function deriveZombieEscapeCameraRig(
  bookmark: ZombieEscapeCameraBookmark,
  arenaRadius: number = ZOMBIE_ESCAPE_ARENA.radius,
  playerHeight: number = ZOMBIE_ESCAPE_PLAYER_HEIGHT,
) {
  const distanceScale = bookmark === 'near' ? 0.43 : bookmark === 'far' ? 0.86 : 0.62
  const horizontalDistance = Math.max(playerHeight * 5.8, arenaRadius * distanceScale)
  const height = Math.max(playerHeight * 4.6, horizontalDistance * 0.76)
  return {
    far: Math.max(180, arenaRadius * 8),
    followResponse: bookmark === 'near' ? 11 : 8.5,
    fov: bookmark === 'near' ? 51 : bookmark === 'far' ? 43 : 47,
    near: Math.max(0.05, playerHeight * 0.04),
    offsetX: horizontalDistance * 0.66,
    offsetY: height,
    offsetZ: horizontalDistance * 0.75,
  }
}
