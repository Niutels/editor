import {
  createZombieEscapeAudioEventRing,
  emitZombieEscapeAudioEvent,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventRing,
} from './zombie-escape-audio-events'
import {
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeNavigationMoveResult,
  createZombieEscapeReachableSpawn,
  isZombieEscapeCollisionHitBreakable,
  isZombieEscapeCollisionObjectBreakable,
  isZombieEscapeCollisionObjectBreakableAtElevation,
  moveZombieEscapeCircleWithSlide,
  moveZombieEscapeNavigationAgent,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeFlowDirection,
  resolveZombieEscapeNavigationTargetElevation,
  resolveZombieEscapeReachableSpawn,
  setZombieEscapeFlowFieldWorld,
  sweepZombieEscapeProjectileAgainstWorld,
  updateZombieEscapeFlowTarget,
  type ZombieEscapeCircleMoveResult,
  type ZombieEscapeCollisionCircleSource,
  type ZombieEscapeCollisionHit,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeFlowField,
  type ZombieEscapeFlowSample,
  type ZombieEscapeNavigationMoveResult,
  zombieEscapeSegmentIsClearInVerticalRange,
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
  zombieEscapeRandomRange,
} from './zombie-escape-random'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import {
  createZombieEscapeFallbackWeaponPickupPlacements,
  type ZombieEscapeWeaponPickupPlacement,
} from './zombie-escape-weapon-placement'
import type { ZombieEscapeArenaData } from './zombie-escape-world'
import {
  createZombieEscapeGaitByPoolSlot,
  createZombieEscapeVariantByPoolSlot,
  ZOMBIE_ESCAPE_ZOMBIE_GAIT,
} from './zombie-escape-zombie-roster'

export type ZombieEscapeGameStatus = 'lost' | 'playing' | 'won'
export type ZombieEscapeGamePhase = 'build' | 'night'
export type ZombieEscapeWaveState = 'active' | 'escape' | 'intermission'
export type ZombieEscapePurchaseFeedback = 'insufficient-funds' | 'purchased' | null

const ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS = 21.4
const ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MAXIMUM_RADIUS_METERS = 22.8
const ZOMBIE_ESCAPE_WAVE_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS = 8
const ZOMBIE_ESCAPE_MUZZLE_VALIDATION_MAXIMUM_DISTANCE_METERS = 2.25

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

export const ZOMBIE_ESCAPE_ZOMBIE_INTENT = {
  attackObstacle: 2,
  attackPlayer: 1,
  blocked: 3,
  chase: 0,
} as const

export type ZombieEscapeZombieIntent =
  (typeof ZOMBIE_ESCAPE_ZOMBIE_INTENT)[keyof typeof ZOMBIE_ESCAPE_ZOMBIE_INTENT]

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
  weaponIndex: number
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
  originX: Float32Array
  originY: Float32Array
  originZ: Float32Array
  phase: Uint8Array
  pool: ZombieEscapeFixedPool
  previousX: Float32Array
  previousY: Float32Array
  previousZ: Float32Array
  travelAge: Float32Array
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

export type ZombieEscapeZombiePool = {
  attackCooldown: Float32Array
  attackFocusX: Float32Array
  attackFocusZ: Float32Array
  attackTargetObjectId: Array<string | null>
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
  navigationConnector: Int16Array
  navigationConnectorTargetEnd: Uint8Array
  pool: ZombieEscapeFixedPool
  runBlend: Float32Array
  speedScale: Float32Array
  variant: Uint8Array
  vx: Float32Array
  vz: Float32Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}

export type ZombieEscapeSimulation = {
  audioEvents: ZombieEscapeAudioEventRing
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
  elapsedSeconds: number
  externalPlayerPose: boolean
  extractionOpen: boolean
  fireCooldownSeconds: number
  impacts: ZombieEscapeShotPhaseMetricView
  impactAttachmentScratch: ZombieEscapeImpactAttachment
  kills: number
  lastShotGeneration: number
  lastShotSlot: number
  money: number
  nearbyPickupIndex: number
  navigationField: ZombieEscapeFlowField
  navigationHitScratch: ZombieEscapeCollisionHit
  navigationMoveScratch: ZombieEscapeNavigationMoveResult
  navigationSampleScratch: ZombieEscapeFlowSample
  navigationTargetY: number
  night: number
  obstacleHitCounts: Map<string, number>
  obstacleRevision: number
  paused: boolean
  phase: ZombieEscapeGamePhase
  phaseSecondsRemaining: number
  player: ZombieEscapePlayerState
  presentationPoseScratch: ZombieEscapePresentationPose
  projectileHitCandidateScratch: ZombieEscapeCollisionHit
  projectiles: ZombieEscapeShotPhaseMetricView
  purchaseFeedback: ZombieEscapePurchaseFeedback
  purchasedWeapons: Uint8Array
  random: ZombieEscapeRandomState
  reachableSpawnScratch: ReturnType<typeof createZombieEscapeReachableSpawn>
  replacementSpawnRemaining: number
  seed: number
  shots: ZombieEscapeShotEventPool
  shotsFired: number
  status: ZombieEscapeGameStatus
  tracers: ZombieEscapeShotPhaseMetricView
  variantByPoolSlot: Uint8Array
  gaitByPoolSlot: Uint8Array
  wave: number
  waveIntermissionSeconds: number
  waveSpawnRemaining: number
  waveSpawnTimerSeconds: number
  waveState: ZombieEscapeWaveState
  weaponPickups: readonly ZombieEscapeWeaponPickupPlacement[]
  zombies: ZombieEscapeZombiePool
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
  zombies: number
}

function createArenaCollisionWorld(arena: ZombieEscapeArenaData) {
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
    playRadius: arena.playRadius,
  })
}

export function createZombieEscapeSimulation(
  arena: ZombieEscapeArenaData,
  seed = ZOMBIE_ESCAPE_SEED,
  weaponPickups: readonly ZombieEscapeWeaponPickupPlacement[] = createZombieEscapeFallbackWeaponPickupPlacements(),
): ZombieEscapeSimulation {
  const shots = createShotEventPool(ZOMBIE_ESCAPE_CAPACITY.shots)
  const purchasedWeapons = createPurchasedWeapons()
  const collisionWorld = createArenaCollisionWorld(arena)
  return {
    audioEvents: createZombieEscapeAudioEventRing(),
    cameraBookmark: 'design',
    collisionHitScratch: createZombieEscapeCollisionHit(),
    collisionMoveScratch: createZombieEscapeCircleMoveResult(),
    collisionSourceWorld: collisionWorld,
    collisionWorld,
    collisionWorldGeneration: 1,
    combatCollisionSourceWorld: collisionWorld,
    combatCollisionWorld: collisionWorld,
    combatVerticalRangeScratch: { maximumY: 0, minimumY: 0 },
    debugMode: 'final',
    destroyedObstacleIds: new Set(),
    elapsedSeconds: 0,
    externalPlayerPose: false,
    extractionOpen: false,
    fireCooldownSeconds: 0,
    impacts: createShotPhaseMetricView(shots, ZOMBIE_ESCAPE_SHOT_PHASE.impact),
    impactAttachmentScratch: createZombieEscapeImpactAttachment(),
    kills: 0,
    lastShotGeneration: 0,
    lastShotSlot: -1,
    money: 0,
    nearbyPickupIndex: -1,
    navigationField: createZombieEscapeFlowField(collisionWorld),
    navigationHitScratch: createZombieEscapeCollisionHit(),
    navigationMoveScratch: createZombieEscapeNavigationMoveResult(),
    navigationSampleScratch: {
      blockingDistance: Number.POSITIVE_INFINITY,
      blockingX: 0,
      blockingZ: 0,
      reachable: false,
      x: 0,
      z: 0,
    },
    navigationTargetY: 0,
    night: 0,
    obstacleHitCounts: new Map(),
    obstacleRevision: 0,
    paused: false,
    phase: 'build',
    phaseSecondsRemaining: ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds,
    player: createPlayerState(arena),
    presentationPoseScratch: createZombieEscapePresentationPose(),
    projectileHitCandidateScratch: createZombieEscapeCollisionHit(),
    projectiles: createShotPhaseMetricView(shots, ZOMBIE_ESCAPE_SHOT_PHASE.travel),
    purchaseFeedback: null,
    purchasedWeapons,
    random: createZombieEscapeRandomState(seed),
    reachableSpawnScratch: createZombieEscapeReachableSpawn(),
    replacementSpawnRemaining: 0,
    seed,
    shots,
    shotsFired: 0,
    status: 'playing',
    tracers: createShotPhaseMetricView(shots, ZOMBIE_ESCAPE_SHOT_PHASE.inactive),
    gaitByPoolSlot: createZombieEscapeGaitByPoolSlot(seed),
    variantByPoolSlot: createZombieEscapeVariantByPoolSlot(seed),
    wave: 1,
    waveIntermissionSeconds: 0,
    waveSpawnRemaining: 0,
    waveSpawnTimerSeconds: 0.35,
    waveState: 'intermission',
    weaponPickups: sanitizeZombieEscapeWeaponPickupPlacements(weaponPickups),
    zombies: createZombiePool(ZOMBIE_ESCAPE_CAPACITY.zombies),
  }
}

export function resetZombieEscapeSimulation(
  state: ZombieEscapeSimulation,
  arena: ZombieEscapeArenaData,
) {
  // Keep the audio sequence monotonic so a lethal event remains consumable after this reset.
  resetZombieEscapeRandomState(state.random, state.seed)
  resetShotEventPool(state.shots)
  resetZombiePool(state.zombies)
  state.elapsedSeconds = 0
  state.extractionOpen = false
  state.fireCooldownSeconds = 0
  state.kills = 0
  state.lastShotGeneration = 0
  state.lastShotSlot = -1
  state.money = 0
  state.nearbyPickupIndex = -1
  state.navigationTargetY = 0
  state.night = 0
  restoreZombieEscapeObstacleState(state)
  state.paused = false
  state.phase = 'build'
  state.phaseSecondsRemaining = ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds
  state.purchaseFeedback = null
  state.purchasedWeapons.fill(0)
  state.purchasedWeapons[0] = 1
  state.replacementSpawnRemaining = 0
  state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  state.player.aimAngle = Math.PI
  state.player.health = 100
  state.player.hurtFlash = 0
  state.player.locomotionBlend = 0
  state.player.locomotionPhase = 0
  resetZombieEscapeMeleeState(state.player)
  state.player.meleeSequence = 0
  state.player.movementHeading = Math.PI
  state.player.muzzlePoseExternal = false
  state.player.runBlend = 0
  state.player.weaponIndex = 0
  state.player.vx = 0
  state.player.vz = 0
  state.player.x = arena.playerStartX
  state.player.y = 0
  state.player.z = arena.playerStartZ
  updateDefaultMuzzlePose(state.player)
  state.shotsFired = 0
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
  state.collisionSourceWorld = navigationWorld
  state.combatCollisionSourceWorld = combatWorld
  return applyZombieEscapeEffectiveCollisionWorld(state)
}

export function getZombieEscapeMeleeProgress(player: ZombieEscapePlayerState) {
  return resolveZombieEscapeMeleePhaseProgress(player.meleePhase, player.meleePhaseSeconds)
}

export function tryPurchaseNearbyZombieEscapeWeapon(state: ZombieEscapeSimulation) {
  const pickupIndex = state.nearbyPickupIndex
  const pickup = state.weaponPickups[pickupIndex]
  if (!pickup || state.purchasedWeapons[pickup.weaponIndex] !== 0) return false
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[pickup.weaponIndex]
  if (!profile) return false
  if (state.money < profile.purchaseCost) {
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

  state.money -= profile.purchaseCost
  state.player.ammo = profile.ammoGranted
  state.player.weaponIndex = pickup.weaponIndex
  state.purchasedWeapons[pickup.weaponIndex] = 1
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
  updatePlayer(state, input, delta)
  if (state.phase === 'night') {
    updateShots(state, delta)
    updateZombies(state, delta)
    updateWaves(state, delta)
  }
  if (state.extractionOpen) {
    const escapeDistance = Math.hypot(
      state.player.x - arena.escapeX,
      state.player.z - arena.escapeZ,
    )
    if (escapeDistance <= ZOMBIE_ESCAPE_SIMULATION.escapeRadius) state.status = 'won'
  }
  if (state.phase === 'night' && state.player.health <= 0) {
    state.player.health = 0
    state.status = 'lost'
  }
}

export function spawnZombieEscapeZombie(
  state: ZombieEscapeSimulation,
  x: number,
  z: number,
  health = 44 + state.wave * 8,
) {
  const zombies = state.zombies
  const slot = acquireZombieEscapePoolSlot(zombies.pool)
  zombies.x[slot] = x
  zombies.y[slot] = 0
  zombies.z[slot] = z
  zombies.vx[slot] = 0
  zombies.vz[slot] = 0
  zombies.health[slot] = health
  zombies.gait[slot] = state.gaitByPoolSlot[slot]!
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
  zombies.navigationConnector[slot] = -1
  zombies.navigationConnectorTargetEnd[slot] = 0
  zombies.attackCooldown[slot] = zombieEscapeRandomRange(state.random, 0.1, 0.6)
  zombies.attackFocusX[slot] = x
  zombies.attackFocusZ[slot] = z
  zombies.attackTargetObjectId[slot] = null
  zombies.deathPresentationSeconds[slot] = 0
  zombies.speedScale[slot] = zombieEscapeRandomRange(state.random, 0.9, 1.12)
  zombies.variant[slot] = state.variantByPoolSlot[slot]!
  return slot
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
      state.waveSpawnRemaining + state.replacementSpawnRemaining + state.zombies.pool.activeCount,
    waveState: state.waveState,
    weaponIndex: state.player.weaponIndex,
    zombies: state.zombies.pool.activeCount,
  }
}

function updatePlayer(
  state: ZombieEscapeSimulation,
  input: ZombieEscapeControlState,
  delta: number,
) {
  const player = state.player
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
  if (input.interactPressed) {
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
  player.hurtFlash = Math.max(0, player.hurtFlash - delta * 3.2)

  state.fireCooldownSeconds -= delta
  advanceZombieEscapeMelee(state, delta)
  if (state.phase === 'night' && player.meleePhase === 'idle' && input.fire) {
    if (player.ammo > 0) {
      const weaponProfile =
        ZOMBIE_ESCAPE_WEAPON_PROFILES[player.weaponIndex] ?? ZOMBIE_ESCAPE_WEAPON_PROFILES[0]
      while (state.fireCooldownSeconds <= 0 && player.ammo > 0) {
        spawnShot(state, weaponProfile.projectileDamage)
        state.fireCooldownSeconds += weaponProfile.shotIntervalSeconds
      }
    } else {
      startZombieEscapeMelee(state)
    }
  } else {
    state.fireCooldownSeconds = Math.max(0, state.fireCooldownSeconds)
  }
}

function spawnShot(state: ZombieEscapeSimulation, damage: number) {
  const shots = state.shots
  const slot = acquireZombieEscapePoolSlot(shots.pool)
  const player = state.player
  shots.damage[slot] = damage
  shots.directionX[slot] = player.muzzleDirectionX
  shots.directionY[slot] = player.muzzleDirectionY
  shots.directionZ[slot] = player.muzzleDirectionZ
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
  shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.travel
  shots.travelAge[slot] = 0
  initializeZombieEscapeShotLaunch(state, slot)
  state.lastShotGeneration = shots.pool.generation[slot] ?? 0
  state.lastShotSlot = slot
  state.player.ammo = Math.max(0, state.player.ammo - 1)
  state.shotsFired += 1
  emitZombieEscapeAudioEvent(
    state.audioEvents,
    ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
    player.muzzleX,
    player.muzzleY,
    player.muzzleZ,
    player.weaponIndex,
  )
  if (shots.phase[slot] === ZOMBIE_ESCAPE_SHOT_PHASE.impact) {
    emitZombieEscapeAudioEvent(
      state.audioEvents,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
      shots.hitX[slot]!,
      shots.hitY[slot]!,
      shots.hitZ[slot]!,
    )
  }
}

function initializeZombieEscapeShotLaunch(state: ZombieEscapeSimulation, slot: number) {
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

  if (validatesMuzzle) {
    sweepZombieEscapeProjectileAgainstWorld(
      state.combatCollisionWorld,
      anchorX,
      anchorY,
      anchorZ,
      muzzleOffsetX,
      muzzleOffsetY,
      muzzleOffsetZ,
      ZOMBIE_ESCAPE_SIMULATION.projectileRadius,
      state.collisionHitScratch,
      state.projectileHitCandidateScratch,
    )
  }

  if (validatesMuzzle && state.collisionHitScratch.colliderKind !== 'none') {
    const amount = Math.min(1, Math.max(0, state.collisionHitScratch.time))
    const hitCenterX = anchorX + muzzleOffsetX * amount
    const hitCenterY = anchorY + muzzleOffsetY * amount
    const hitCenterZ = anchorZ + muzzleOffsetZ * amount
    const normalX = state.collisionHitScratch.normalX
    const normalY = state.collisionHitScratch.normalY
    const normalZ = state.collisionHitScratch.normalZ
    shots.hitColliderIndex[slot] = state.collisionHitScratch.colliderIndex
    shots.hitNormalX[slot] = normalX
    shots.hitNormalY[slot] = normalY
    shots.hitNormalZ[slot] = normalZ
    shots.hitX[slot] = hitCenterX - normalX * ZOMBIE_ESCAPE_SIMULATION.projectileRadius
    shots.hitY[slot] = hitCenterY - normalY * ZOMBIE_ESCAPE_SIMULATION.projectileRadius
    shots.hitZ[slot] = hitCenterZ - normalZ * ZOMBIE_ESCAPE_SIMULATION.projectileRadius
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
    return
  }

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

function updateShots(state: ZombieEscapeSimulation, delta: number) {
  const shots = state.shots
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
    updateTravelingShot(state, slot, delta)
  }
}

function updateTravelingShot(state: ZombieEscapeSimulation, slot: number, delta: number) {
  const shots = state.shots
  const previousX = shots.x[slot]!
  const previousY = shots.y[slot]!
  const previousZ = shots.z[slot]!
  shots.previousX[slot] = previousX
  shots.previousY[slot] = previousY
  shots.previousZ[slot] = previousZ

  const remainingLifetime = Math.max(
    0,
    ZOMBIE_ESCAPE_SIMULATION.projectileLifetimeSeconds - shots.travelAge[slot]!,
  )
  const travelDelta = Math.min(delta, remainingLifetime)
  const travelDistance = ZOMBIE_ESCAPE_SIMULATION.projectileSpeed * travelDelta
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
    ZOMBIE_ESCAPE_SIMULATION.projectileRadius,
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

  const zombies = state.zombies
  for (let zombie = 0; zombie < zombies.pool.capacity; zombie += 1) {
    if (zombies.pool.active[zombie] === 0 || zombies.health[zombie]! <= 0) continue
    const zombieCatalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[zombie]!)
    const hitRadius =
      zombieCatalogEntry.capsule.radiusMeters + ZOMBIE_ESCAPE_SIMULATION.projectileRadius
    const amount = segmentVerticalCapsuleFirstIntersectionAmount(
      previousX,
      previousY,
      previousZ,
      nextX,
      nextY,
      nextZ,
      zombies.x[zombie]!,
      zombies.z[zombie]!,
      zombies.y[zombie]! + zombieCatalogEntry.capsule.radiusMeters,
      zombies.y[zombie]! +
        zombieCatalogEntry.capsule.radiusMeters +
        zombieCatalogEntry.capsule.segmentLengthMeters,
      hitRadius,
    )
    if (amount >= hitAmount) continue
    hitAmount = amount
    impactKind = ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy
    hitTargetSlot = zombie
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
  shots.x[slot] = hitCenterX
  shots.y[slot] = hitCenterY
  shots.z[slot] = hitCenterZ
  shots.hitColliderIndex[slot] = hitColliderIndex
  shots.hitTargetSlot[slot] = hitTargetSlot
  shots.hitTargetGeneration[slot] =
    hitTargetSlot >= 0 ? (zombies.pool.generation[hitTargetSlot] ?? 0) : 0
  shots.impactAge[slot] = Math.max(0, delta - consumedDelta)
  shots.impactKind[slot] = impactKind
  shots.phase[slot] = ZOMBIE_ESCAPE_SHOT_PHASE.impact
  shots.travelAge[slot] = shots.travelAge[slot]! + consumedDelta
  shots.hitWorldGeneration[slot] = state.collisionWorldGeneration

  if (hitTargetSlot >= 0) {
    writeZombieEscapeZombieHitAttachment(
      state,
      slot,
      hitTargetSlot,
      hitCenterX,
      hitCenterY,
      hitCenterZ,
      shots.directionX[slot]!,
      shots.directionY[slot]!,
      shots.directionZ[slot]!,
    )
    hitNormalX = shots.hitNormalX[slot]!
    hitNormalY = shots.hitNormalY[slot]!
    hitNormalZ = shots.hitNormalZ[slot]!
    applyZombieDamage(
      state,
      hitTargetSlot,
      shots.damage[slot]!,
      shots.directionX[slot]!,
      shots.directionY[slot]!,
      shots.directionZ[slot]!,
      shots.hitX[slot]!,
      shots.hitY[slot]!,
      shots.hitZ[slot]!,
    )
  } else {
    shots.hitX[slot] = hitCenterX - hitNormalX * ZOMBIE_ESCAPE_SIMULATION.projectileRadius
    shots.hitY[slot] = hitCenterY - hitNormalY * ZOMBIE_ESCAPE_SIMULATION.projectileRadius
    shots.hitZ[slot] = hitCenterZ - hitNormalZ * ZOMBIE_ESCAPE_SIMULATION.projectileRadius
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

function applyZombieDamage(
  state: ZombieEscapeSimulation,
  zombieSlot: number,
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
  zombies.gait[zombieSlot] = ZOMBIE_ESCAPE_ZOMBIE_GAIT.walker
  zombies.health[zombieSlot] = zombies.health[zombieSlot]! - damage
  zombies.hitFlash[zombieSlot] = 1
  zombies.hitReaction[zombieSlot] = Math.min(1, zombies.hitReaction[zombieSlot]! + 0.82)
  zombies.hitImpulseX[zombieSlot] = impulseX
  zombies.hitImpulseY[zombieSlot] = impulseY
  zombies.hitImpulseZ[zombieSlot] = impulseZ
  const variant = zombies.variant[zombieSlot]!
  if (zombies.health[zombieSlot]! > 0) {
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
  zombies.deathPresentationSeconds[zombieSlot] = ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds
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

function updateZombies(state: ZombieEscapeSimulation, delta: number) {
  const zombies = state.zombies
  state.navigationTargetY = resolveZombieEscapeNavigationTargetElevation(
    state.collisionWorld,
    state.player.y,
    state.navigationTargetY,
  )
  updateZombieEscapeFlowTarget(
    state.navigationField,
    state.player.x,
    state.player.z,
    state.navigationTargetY,
  )
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
    const impulseDecay = Math.max(0, 1 - delta * ZOMBIE_ESCAPE_SIMULATION.zombieHitImpulseDecay)
    zombies.hitImpulseX[slot] = zombies.hitImpulseX[slot]! * impulseDecay
    zombies.hitImpulseY[slot] = zombies.hitImpulseY[slot]! * impulseDecay
    zombies.hitImpulseZ[slot] = zombies.hitImpulseZ[slot]! * impulseDecay
    if (zombies.health[slot]! <= 0) {
      zombies.deathPresentationSeconds[slot] = zombies.deathPresentationSeconds[slot]! - delta
      if (zombies.deathPresentationSeconds[slot]! <= 0) {
        const released = releaseZombieEscapePoolSlot(zombies.pool, slot)
        if (released && state.phase === 'night' && state.waveState === 'active') {
          state.replacementSpawnRemaining = Math.min(
            zombies.pool.capacity,
            state.replacementSpawnRemaining + 1,
          )
        }
      }
      continue
    }
    zombies.attackCooldown[slot] = zombies.attackCooldown[slot]! - delta
    const x = zombies.x[slot]!
    const y = zombies.y[slot]!
    const z = zombies.z[slot]!
    const toPlayerX = state.player.x - x
    const toPlayerZ = state.player.z - z
    const playerDistance = Math.max(0.000_1, Math.hypot(toPlayerX, toPlayerZ))
    const catalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[slot]!)
    const activeConnector =
      state.collisionWorld.navigationConnectors[zombies.navigationConnector[slot]!]
    if (activeConnector) {
      const targetEnd = zombies.navigationConnectorTargetEnd[slot] !== 0
      const directionAmount = targetEnd ? 1 : -1
      state.navigationSampleScratch.blockingDistance = Number.POSITIVE_INFINITY
      state.navigationSampleScratch.blockingX = x
      state.navigationSampleScratch.blockingZ = z
      state.navigationSampleScratch.reachable = true
      state.navigationSampleScratch.x = activeConnector.directionX * directionAmount
      state.navigationSampleScratch.z = activeConnector.directionZ * directionAmount
      resetZombieEscapeNavigationHit(state.navigationHitScratch)
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
      )
    }
    let steerX = state.navigationSampleScratch.x
    let steerZ = state.navigationSampleScratch.z
    const directBlockingObjectId =
      playerDistance > 0.000_2
        ? resolveZombieEscapeCollisionHitObjectId(state.collisionWorld, state.navigationHitScratch)
        : null
    const directHitDistance = directBlockingObjectId
      ? state.navigationSampleScratch.blockingDistance
      : Number.POSITIVE_INFINITY
    const directBlockerIsBreakable =
      directBlockingObjectId !== null &&
      isZombieEscapeCollisionHitBreakable(state.collisionWorld, state.navigationHitScratch)
    const previousObstacleTarget = zombies.attackTargetObjectId[slot] ?? null
    const storedFocusDistance = previousObstacleTarget
      ? Math.hypot(zombies.attackFocusX[slot]! - x, zombies.attackFocusZ[slot]! - z)
      : Number.POSITIVE_INFINITY
    const storedObstacleTargetIsHeld =
      previousObstacleTarget !== null &&
      isZombieEscapeCollisionObjectBreakableAtElevation(
        state.collisionWorld,
        previousObstacleTarget,
        y,
      ) &&
      storedFocusDistance <= ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackReleaseMeters
    const directObstacleTargetIsInRange =
      directBlockerIsBreakable &&
      directHitDistance <= ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackReachMeters
    const obstacleTargetObjectId = storedObstacleTargetIsHeld
      ? previousObstacleTarget
      : directObstacleTargetIsInRange
        ? directBlockingObjectId
        : null
    const combatLayersOverlap = resolveZombieEscapeCombatVerticalRange(
      state.player.y,
      zombies.y[slot]!,
      catalogEntry.characterHeightMeters,
      state.combatVerticalRangeScratch,
    )
    const playerInAttackRange =
      combatLayersOverlap &&
      playerDistance <= ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters &&
      zombieEscapeSegmentIsClearInVerticalRange(
        state.combatCollisionWorld,
        x,
        z,
        state.player.x,
        state.player.z,
        0.05,
        state.combatVerticalRangeScratch.minimumY,
        state.combatVerticalRangeScratch.maximumY,
        state.collisionHitScratch,
      )

    let holdsPosition = false
    let facingX = steerX
    let facingZ = steerZ
    if (obstacleTargetObjectId) {
      holdsPosition = true
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle
      zombies.attackTargetObjectId[slot] = obstacleTargetObjectId
      if (directBlockingObjectId === obstacleTargetObjectId) {
        zombies.attackFocusX[slot] = state.navigationSampleScratch.blockingX
        zombies.attackFocusZ[slot] = state.navigationSampleScratch.blockingZ
      }
      facingX = zombies.attackFocusX[slot]! - x
      facingZ = zombies.attackFocusZ[slot]! - z
      if (zombies.attackCooldown[slot]! <= 0) {
        const destroyed = hitZombieEscapeObstacle(
          state,
          slot,
          obstacleTargetObjectId,
          zombies.attackFocusX[slot]!,
          zombies.attackFocusZ[slot]!,
        )
        if (destroyed) zombies.attackTargetObjectId[slot] = null
      }
    } else if (playerInAttackRange) {
      holdsPosition = true
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
      zombies.attackTargetObjectId[slot] = null
      zombies.attackFocusX[slot] = state.player.x
      zombies.attackFocusZ[slot] = state.player.z
      facingX = toPlayerX
      facingZ = toPlayerZ
      if (zombies.attackCooldown[slot]! <= 0) {
        applyZombieEscapePlayerDamage(state, slot, 8)
        zombies.attackCooldown[slot] = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
      }
    } else if (!state.navigationSampleScratch.reachable) {
      holdsPosition = true
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.blocked
      zombies.attackTargetObjectId[slot] = null
      zombies.attackFocusX[slot] = directBlockingObjectId
        ? state.navigationSampleScratch.blockingX
        : state.player.x
      zombies.attackFocusZ[slot] = directBlockingObjectId
        ? state.navigationSampleScratch.blockingZ
        : state.player.z
      facingX = zombies.attackFocusX[slot]! - x
      facingZ = zombies.attackFocusZ[slot]! - z
    } else {
      zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
      zombies.attackTargetObjectId[slot] = null

      for (let other = 0; !activeConnector && other < zombies.pool.capacity; other += 1) {
        if (other === slot || zombies.pool.active[other] === 0 || zombies.health[other]! <= 0) {
          continue
        }
        const separateX = x - zombies.x[other]!
        const separateZ = z - zombies.z[other]!
        if (Math.abs(y - zombies.y[other]!) > 0.75) continue
        const distanceSquared = separateX * separateX + separateZ * separateZ
        if (distanceSquared <= 0.000_1 || distanceSquared >= 1.75 * 1.75) continue
        const distance = Math.sqrt(distanceSquared)
        const amount = (1.75 - distance) / 1.75
        steerX += (separateX / distance) * amount * 1.55
        steerZ += (separateZ / distance) * amount * 1.55
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
    if (facingLength > 0.000_1) {
      zombies.heading[slot] = turnZombieEscapeHeadingToward(
        zombies.heading[slot]!,
        Math.atan2(facingX, facingZ),
        ZOMBIE_ESCAPE_SIMULATION.zombieTurnSpeedRadiansPerSecond * delta,
      )
    }
    const runTarget =
      holdsPosition || zombies.gait[slot] !== ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner ? 0 : 1
    zombies.runBlend[slot] =
      zombies.runBlend[slot]! + (runTarget - zombies.runBlend[slot]!) * (1 - Math.exp(-4.5 * delta))
    const walkSpeed = catalogEntry.movement.walkMetersPerSecond + state.wave * 0.06
    const runSpeed = catalogEntry.movement.runMetersPerSecond + state.wave * 0.18
    const desiredSpeed =
      (walkSpeed + (runSpeed - walkSpeed) * zombies.runBlend[slot]!) * zombies.speedScale[slot]!
    if (holdsPosition) {
      zombies.vx[slot] = 0
      zombies.vz[slot] = 0
    } else {
      const response = 1 - Math.exp(-7 * delta)
      zombies.vx[slot] = zombies.vx[slot]! + (steerX * desiredSpeed - zombies.vx[slot]!) * response
      zombies.vz[slot] = zombies.vz[slot]! + (steerZ * desiredSpeed - zombies.vz[slot]!) * response
      moveZombieEscapeNavigationAgent(
        state.collisionWorld,
        x,
        y,
        z,
        zombies.vx[slot]! * delta,
        zombies.vz[slot]! * delta,
        getZombieEscapeZombieCollisionRadiusMeters(zombies.variant[slot]!),
        zombies.navigationConnector[slot]!,
        zombies.navigationConnectorTargetEnd[slot] !== 0,
        state.collisionHitScratch,
        state.navigationMoveScratch,
      )
      zombies.x[slot] = state.navigationMoveScratch.x
      zombies.y[slot] = state.navigationMoveScratch.y
      zombies.z[slot] = state.navigationMoveScratch.z
      zombies.navigationConnector[slot] = state.navigationMoveScratch.connectorIndex
      zombies.navigationConnectorTargetEnd[slot] = state.navigationMoveScratch.connectorTargetEnd
        ? 1
        : 0
      if (state.navigationMoveScratch.collided) {
        zombies.vx[slot] = (zombies.x[slot]! - x) / delta
        zombies.vz[slot] = (zombies.z[slot]! - z) / delta
      }
    }
    const speed = Math.hypot(zombies.vx[slot]!, zombies.vz[slot]!)
    zombies.locomotionBlend[slot] =
      zombies.locomotionBlend[slot]! +
      (Math.min(1, speed / walkSpeed) - zombies.locomotionBlend[slot]!) * (1 - Math.exp(-9 * delta))
    zombies.locomotionPhase[slot] =
      zombies.locomotionPhase[slot]! + speed * delta * (2.2 + zombies.runBlend[slot]!)
  }
}

function resetZombieEscapeNavigationHit(hit: ZombieEscapeCollisionHit) {
  hit.colliderIndex = -1
  hit.colliderKind = 'none'
  hit.normalX = 0
  hit.normalY = 0
  hit.normalZ = 0
  hit.time = Number.POSITIVE_INFINITY
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
    !isZombieEscapeCollisionObjectBreakable(state.collisionWorld, objectId)
  ) {
    return false
  }
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
  const hitCount = (state.obstacleHitCounts.get(objectId) ?? 0) + 1
  zombies.attackCooldown[attackerSlot] =
    ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
  if (hitCount < ZOMBIE_ESCAPE_SIMULATION.obstacleHitsToBreak) {
    state.obstacleHitCounts.set(objectId, hitCount)
    return false
  }

  state.obstacleHitCounts.delete(objectId)
  state.destroyedObstacleIds.add(objectId)
  state.obstacleRevision += 1
  applyZombieEscapeEffectiveCollisionWorld(state)
  updateZombieEscapeFlowTarget(
    state.navigationField,
    state.player.x,
    state.player.z,
    state.navigationTargetY,
  )
  return true
}

function turnZombieEscapeHeadingToward(current: number, target: number, maximumDelta: number) {
  const fullTurn = Math.PI * 2
  const delta = ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
  const next = current + Math.max(-maximumDelta, Math.min(maximumDelta, delta))
  return ((((next + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
}

function applyZombieEscapeEffectiveCollisionWorld(state: ZombieEscapeSimulation) {
  const navigationWorld = createZombieEscapeCollisionWorldWithoutObjects(
    state.collisionSourceWorld,
    state.destroyedObstacleIds,
  )
  const combatWorld = createZombieEscapeCollisionWorldWithoutObjects(
    state.combatCollisionSourceWorld,
    state.destroyedObstacleIds,
  )
  const changed =
    navigationWorld.semanticKey !== state.collisionWorld.semanticKey ||
    combatWorld.semanticKey !== state.combatCollisionWorld.semanticKey
  setZombieEscapeFlowFieldWorld(state.navigationField, navigationWorld)
  state.collisionWorld = navigationWorld
  state.combatCollisionWorld = combatWorld
  if (changed) state.collisionWorldGeneration += 1
  return changed
}

function restoreZombieEscapeObstacleState(state: ZombieEscapeSimulation) {
  const hadObstacleDamage = state.destroyedObstacleIds.size > 0 || state.obstacleHitCounts.size > 0
  state.destroyedObstacleIds.clear()
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

function updateWaves(state: ZombieEscapeSimulation, delta: number) {
  if (state.waveState === 'escape') return
  if (state.waveState === 'intermission') {
    state.waveIntermissionSeconds -= delta
    if (state.waveIntermissionSeconds <= 0) {
      state.wave += 1
      state.waveState = 'active'
      state.waveSpawnRemaining = zombieEscapeWaveSize(state.wave)
      state.waveSpawnTimerSeconds = 0.3
    }
    return
  }

  state.waveSpawnTimerSeconds -= delta
  while (
    (state.replacementSpawnRemaining > 0 || state.waveSpawnRemaining > 0) &&
    state.waveSpawnTimerSeconds <= 0 &&
    state.zombies.pool.activeCount < state.zombies.pool.capacity
  ) {
    const isReplacement = state.replacementSpawnRemaining > 0
    const angle = nextZombieEscapeRandom(state.random) * Math.PI * 2
    const radius =
      ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS +
      nextZombieEscapeRandom(state.random) *
        (ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MAXIMUM_RADIUS_METERS -
          ZOMBIE_ESCAPE_WAVE_SPAWN_DESIRED_MINIMUM_RADIUS_METERS)
    const desiredX = Math.sin(angle) * radius
    const desiredZ = Math.cos(angle) * radius
    state.waveSpawnTimerSeconds += Math.max(0.28, 0.74 - state.wave * 0.08)
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
      break
    }
    spawnZombieEscapeZombie(state, state.reachableSpawnScratch.x, state.reachableSpawnScratch.z)
    if (isReplacement) state.replacementSpawnRemaining -= 1
    else state.waveSpawnRemaining -= 1
  }

  if (
    state.replacementSpawnRemaining > 0 ||
    state.waveSpawnRemaining > 0 ||
    state.zombies.pool.activeCount > 0
  ) {
    return
  }
  state.waveState = 'intermission'
  state.waveIntermissionSeconds = 2.8
  state.player.health = Math.min(100, state.player.health + 14)
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

function zombieEscapeWaveSize(wave: number) {
  const normalizedWave = Math.max(1, Math.trunc(wave))
  const population = 4 + normalizedWave * 3
  return normalizedWave === 1 ? population * 2 : population
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
  if (enteringFromBuild) state.night += 1
  if (state.night <= 0) state.night = 1
  resetShotEventPool(state.shots)
  resetZombiePool(state.zombies)
  state.extractionOpen = false
  state.fireCooldownSeconds = 0
  resetZombieEscapeMeleeState(state.player)
  state.lastShotGeneration = 0
  state.lastShotSlot = -1
  state.replacementSpawnRemaining = 0
  state.wave = state.night
  state.waveIntermissionSeconds = 0
  state.waveSpawnRemaining = zombieEscapeWaveSize(state.wave)
  state.waveSpawnTimerSeconds = 0.35
  state.waveState = 'active'
  if (state.player.ammo === 0) {
    state.player.weaponIndex = 0
    state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  } else if (state.night === 1 && state.player.weaponIndex === 0) {
    state.player.ammo = ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted
  }
}

function enterZombieEscapeBuild(state: ZombieEscapeSimulation) {
  state.phase = 'build'
  state.phaseSecondsRemaining = ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds
  resetShotEventPool(state.shots)
  resetZombiePool(state.zombies)
  restoreZombieEscapeObstacleState(state)
  state.extractionOpen = false
  state.fireCooldownSeconds = 0
  resetZombieEscapeMeleeState(state.player)
  state.lastShotGeneration = 0
  state.lastShotSlot = -1
  state.replacementSpawnRemaining = 0
  state.waveIntermissionSeconds = 0
  state.waveSpawnRemaining = 0
  state.waveSpawnTimerSeconds = 0.35
  state.waveState = 'intermission'
  state.purchasedWeapons.fill(0)
  state.purchasedWeapons[0] = 1
  state.nearbyPickupIndex = findNearbyZombieEscapeWeaponPickup(state)
}

function findNearbyZombieEscapeWeaponPickup(state: ZombieEscapeSimulation) {
  let nearestIndex = -1
  let nearestDistance: number = ZOMBIE_ESCAPE_SIMULATION.pickupInteractionRadius
  for (let index = 0; index < state.weaponPickups.length; index += 1) {
    const pickup = state.weaponPickups[index]
    if (!pickup || state.purchasedWeapons[pickup.weaponIndex] !== 0) continue
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
  if (!pickup || state.purchasedWeapons[pickup.weaponIndex] !== 0) return null
  const weapon = ZOMBIE_ESCAPE_WEAPON_CATALOG[pickup.weaponIndex]
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[pickup.weaponIndex]
  if (!(weapon && profile)) return null
  return {
    affordable: state.money >= profile.purchaseCost,
    cost: profile.purchaseCost,
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

function createPurchasedWeapons() {
  const purchased = new Uint8Array(ZOMBIE_ESCAPE_WEAPON_CATALOG.length)
  purchased[0] = 1
  return purchased
}

function createPlayerState(arena: ZombieEscapeArenaData): ZombieEscapePlayerState {
  const player: ZombieEscapePlayerState = {
    ammo: ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted,
    aimAngle: Math.PI,
    health: 100,
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
    weaponIndex: 0,
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
    originX: new Float32Array(capacity),
    originY: new Float32Array(capacity),
    originZ: new Float32Array(capacity),
    phase: new Uint8Array(capacity),
    pool: createZombieEscapeFixedPool(capacity),
    previousX: new Float32Array(capacity),
    previousY: new Float32Array(capacity),
    previousZ: new Float32Array(capacity),
    travelAge: new Float32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
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
  return {
    attackCooldown: new Float32Array(capacity),
    attackFocusX: new Float32Array(capacity),
    attackFocusZ: new Float32Array(capacity),
    attackTargetObjectId: Array.from({ length: capacity }, () => null),
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
    navigationConnector: new Int16Array(capacity).fill(-1),
    navigationConnectorTargetEnd: new Uint8Array(capacity),
    pool: createZombieEscapeFixedPool(capacity),
    runBlend: new Float32Array(capacity),
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
  shots.originX.fill(0)
  shots.originY.fill(0)
  shots.originZ.fill(0)
  shots.phase.fill(ZOMBIE_ESCAPE_SHOT_PHASE.inactive)
  shots.previousX.fill(0)
  shots.previousY.fill(0)
  shots.previousZ.fill(0)
  shots.travelAge.fill(0)
  shots.x.fill(0)
  shots.y.fill(0)
  shots.z.fill(0)
}

function resetZombiePool(zombies: ZombieEscapeZombiePool) {
  resetZombieEscapeFixedPool(zombies.pool)
  zombies.attackCooldown.fill(0)
  zombies.attackFocusX.fill(0)
  zombies.attackFocusZ.fill(0)
  zombies.attackTargetObjectId.fill(null)
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
  zombies.navigationConnector.fill(-1)
  zombies.navigationConnectorTargetEnd.fill(0)
  zombies.runBlend.fill(0)
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
    if (
      shots.travelAge[slot]! + shots.impactAge[slot]! <
      ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
    ) {
      count += 1
    }
  }
  return count
}
