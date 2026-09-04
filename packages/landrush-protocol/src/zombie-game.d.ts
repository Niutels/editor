export const ZOMBIE_GAME_SCHEMA_VERSION: 1
export const ZOMBIE_GAME_LIMITS: Readonly<{
  zombies: 4096
  shots: 4096
  impacts: 8192
  players: 32
  audio: 1024
  obstacles: 32768
  weapons: 32
  variants: 256
  ambientNpcs: 128
  coordinate: 1000000
}>
export const ZOMBIE_GAME_ZOMBIE_FIELDS: readonly [
  'attackCooldown',
  'attackFocusX',
  'attackFocusZ',
  'deathPresentationSeconds',
  'gait',
  'health',
  'heading',
  'hitFlash',
  'hitImpulseX',
  'hitImpulseY',
  'hitImpulseZ',
  'hitReaction',
  'intent',
  'locomotionBlend',
  'locomotionPhase',
  'runBlend',
  'spawnOrdinal',
  'speedScale',
  'variant',
  'vx',
  'vz',
  'x',
  'y',
  'z',
]
export const ZOMBIE_GAME_SHOT_FIELDS: readonly [
  'damage',
  'directionX',
  'directionY',
  'directionZ',
  'hitTargetGeneration',
  'hitTargetSlot',
  'hitColliderIndex',
  'hitLocalNormalX',
  'hitLocalNormalY',
  'hitLocalNormalZ',
  'hitLocalX',
  'hitLocalY',
  'hitLocalZ',
  'hitNormalX',
  'hitNormalY',
  'hitNormalZ',
  'hitWorldGeneration',
  'hitX',
  'hitY',
  'hitZ',
  'impactAge',
  'impactKind',
  'lastPiercedTargetGeneration',
  'lastPiercedTargetSlot',
  'originX',
  'originY',
  'originZ',
  'phase',
  'primary',
  'previousX',
  'previousY',
  'previousZ',
  'remainingEnemyPenetrations',
  'travelAge',
  'volleyOrdinal',
  'volleySequence',
  'volleySize',
  'weaponIndex',
  'x',
  'y',
  'z',
]
export const ZOMBIE_GAME_IMPACT_FIELDS: readonly [
  'age',
  'damage',
  'effectKind',
  'hitLocalNormalX',
  'hitLocalNormalY',
  'hitLocalNormalZ',
  'hitLocalX',
  'hitLocalY',
  'hitLocalZ',
  'hitWorldGeneration',
  'impactKind',
  'normalX',
  'normalY',
  'normalZ',
  'sourceX',
  'sourceY',
  'sourceZ',
  'targetGeneration',
  'targetSlot',
  'weaponIndex',
  'x',
  'y',
  'z',
]
export const ZOMBIE_GAME_POSITION_GROUPS: Readonly<{
  zombie: readonly (readonly ['x', 'y', 'z'] | readonly ['attackFocusX', null, 'attackFocusZ'])[]
  shot: readonly (readonly [ZombieGameShotField, ZombieGameShotField, ZombieGameShotField])[]
  impact: readonly (readonly [
    ZombieGameImpactField,
    ZombieGameImpactField,
    ZombieGameImpactField,
  ])[]
}>
export type ZombieGameZombieField = (typeof ZOMBIE_GAME_ZOMBIE_FIELDS)[number]
export type ZombieGameShotField = (typeof ZOMBIE_GAME_SHOT_FIELDS)[number]
export type ZombieGameImpactField = (typeof ZOMBIE_GAME_IMPACT_FIELDS)[number]
export type ZombieGameZombie = Record<ZombieGameZombieField, number> & {
  slot: number
  generation: number
  sourceNpcIndex: number
  targetPlayerId: string | null
}
export type ZombieGameShot = Record<ZombieGameShotField, number> & {
  slot: number
  generation: number
  ownerPlayerId: string
}
export type ZombieGameImpact = Record<ZombieGameImpactField, number> & {
  slot: number
  generation: number
}
export type ZombieGameAudioEvent = {
  sequence: number
  kind: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  subjectIndex: number
  x: number
  y: number
  z: number
}
export type ZombieGameSelf = {
  playerId: string
  lastInputSequence: number
  health: number
  status: 'playing' | 'lost' | 'won'
  ammo: number
  weaponIndex: number
  weaponInventoryMask: number
  weaponAmmoByIndex: number[]
  hitSlowSeconds: number
  hurtFlash: number
  meleePhase: 'idle' | 'windup' | 'active' | 'recovery'
  meleePhaseSeconds: number
  meleeSequence: number
  meleeTargetSlot: number
  meleeTargetGeneration: number
  nextShotVolleySequence: number
  kills: number
  money: number
  nearbyPickupIndex: number
  purchaseFeedback: 'purchased' | 'insufficient-funds' | null
  weaponPurchaseCount: number
  weaponPickupRespawnAtSeconds: (number | null)[]
}
export type ZombieGamePlayer = {
  id: string
  generation: number
  health: number
  status: ZombieGameSelf['status']
  ackInputSequence: number
}
export type ZombieGameAmbientNpc = {
  index: number
  x: number
  y: number
  z: number
  yaw: number
  phase: 'idle' | 'walk' | 'run'
  locomotionPhase: number
}
export type ZombieGameSnapshot = {
  type: 'zombie-game-snapshot'
  schemaVersion: 1
  roomId: string
  worldId: string
  sessionId: string
  sequence: number
  tick: number
  serverTime: number
  night: number
  phase: 'build' | 'night'
  phaseSecondsRemaining: number
  elapsedSeconds: number
  worldGeneration: number
  self: ZombieGameSelf
  players: ZombieGamePlayer[]
  ambientNpcs: ZombieGameAmbientNpc[]
  pendingAmbientNpcIndices: number[]
  zombies: ZombieGameZombie[]
  shots: ZombieGameShot[]
  impacts: ZombieGameImpact[]
  audio: ZombieGameAudioEvent[]
  destroyedObstacleIds: string[]
  passableObstacleIds: string[]
  obstacleHitFeedback: { id: string; amount: number }[]
}
export type ZombieGameInput = {
  type: 'zombie-game-input'
  schemaVersion: 1
  worldId: string
  sessionId: string
  night: number
  worldGeneration: number
  sequence: number
  aimAngle: number
  fire: boolean
  interactPressed: boolean
  weaponIndex: number
  muzzle: {
    x: number
    y: number
    z: number
    directionX: number
    directionY: number
    directionZ: number
  }
}
export function isZombieGameSnapshot(value: unknown): value is ZombieGameSnapshot
export function isZombieGameInput(value: unknown): value is ZombieGameInput
export type ZombieGameBind = { type: 'zombie-game-bind'; schemaVersion: 1; worldId: string }
export type ZombieGameStatus = {
  type: 'zombie-game-status'
  schemaVersion: 1
  roomId: string
  worldId: string
  sessionId: string
  night: number
  worldGeneration: number
  status: 'loading' | 'ready' | 'error'
  message?: string
}
export function isZombieGameBind(value: unknown): value is ZombieGameBind
export function isZombieGameStatus(value: unknown): value is ZombieGameStatus
export type ZombieGameDoor = {
  type: 'zombie-game-door'
  schemaVersion: 1
  worldId: string
  sessionId: string
  night: number
  worldGeneration: number
  sequence: number
  doorId: string
  open: boolean
}
export function isZombieGameDoor(value: unknown): value is ZombieGameDoor
export type ZombieGameReady = {
  type: 'zombie-game-ready'
  schemaVersion: 1
  worldId: string
  sessionId: string
  night: number
  worldGeneration: number
  phase: 'build' | 'night'
  ready: boolean
}
export function isZombieGameReady(value: unknown): value is ZombieGameReady
