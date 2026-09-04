export const ZOMBIE_GAME_SCHEMA_VERSION = 1
export const ZOMBIE_GAME_LIMITS = Object.freeze({
  zombies: 4096,
  shots: 4096,
  impacts: 8192,
  players: 32,
  audio: 1024,
  obstacles: 32768,
  weapons: 32,
  variants: 256,
  ambientNpcs: 128,
  coordinate: 1_000_000,
})

export const ZOMBIE_GAME_ZOMBIE_FIELDS = Object.freeze([
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
])
export const ZOMBIE_GAME_SHOT_FIELDS = Object.freeze([
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
])
export const ZOMBIE_GAME_IMPACT_FIELDS = Object.freeze([
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
])
export const ZOMBIE_GAME_POSITION_GROUPS = Object.freeze({
  zombie: Object.freeze([
    ['x', 'y', 'z'],
    ['attackFocusX', null, 'attackFocusZ'],
  ]),
  shot: Object.freeze([
    ['x', 'y', 'z'],
    ['previousX', 'previousY', 'previousZ'],
    ['originX', 'originY', 'originZ'],
    ['hitX', 'hitY', 'hitZ'],
  ]),
  impact: Object.freeze([
    ['x', 'y', 'z'],
    ['sourceX', 'sourceY', 'sourceZ'],
  ]),
})

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max
const finite = (value, min = -ZOMBIE_GAME_LIMITS.coordinate, max = ZOMBIE_GAME_LIMITS.coordinate) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
function id(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160) return false
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) < 32) return false
  return true
}
const status = (value) => value === 'playing' || value === 'lost' || value === 'won'
const phase = (value) => value === 'build' || value === 'night'
const uint32Fields = new Set([
  'spawnOrdinal',
  'hitTargetGeneration',
  'hitWorldGeneration',
  'lastPiercedTargetGeneration',
  'volleySequence',
  'targetGeneration',
])
const slotFields = new Set(['hitTargetSlot', 'lastPiercedTargetSlot', 'targetSlot'])
const nonnegativeFields = new Set([
  'attackCooldown',
  'deathPresentationSeconds',
  'hitFlash',
  'hitReaction',
  'locomotionPhase',
  'speedScale',
  'damage',
  'impactAge',
  'travelAge',
  'age',
])
const enumMaximum = {
  gait: 1,
  intent: 3,
  variant: 255,
  phase: 2,
  primary: 1,
  impactKind: 3,
  effectKind: 4,
  remainingEnemyPenetrations: 255,
  volleyOrdinal: 255,
  volleySize: 255,
  weaponIndex: 31,
}

function numericFields(value, fields) {
  for (const field of fields) {
    const number = value[field]
    if (uint32Fields.has(field)) {
      if (!integer(number, 0, 0xffff_ffff)) return false
    } else if (slotFields.has(field)) {
      if (!integer(number, -1, ZOMBIE_GAME_LIMITS.zombies - 1)) return false
    } else if (field === 'hitColliderIndex') {
      if (!integer(number, -1, 0x7fff_ffff)) return false
    } else if (Object.hasOwn(enumMaximum, field)) {
      if (!integer(number, 0, enumMaximum[field])) return false
    } else if (field.endsWith('Blend')) {
      if (!finite(number, 0, 1)) return false
    } else if (!finite(number, nonnegativeFields.has(field) ? 0 : -ZOMBIE_GAME_LIMITS.coordinate))
      return false
  }
  return true
}

function rows(value, maximum, fields, validateExtra) {
  if (!Array.isArray(value) || value.length > maximum) return false
  const slots = new Set()
  for (const row of value) {
    if (
      !record(row) ||
      !integer(row.slot, 0, maximum - 1) ||
      !integer(row.generation, 1, 0xffff_ffff) ||
      slots.has(row.slot) ||
      !numericFields(row, fields) ||
      !validateExtra(row)
    )
      return false
    slots.add(row.slot)
  }
  return true
}

function ids(value) {
  return (
    Array.isArray(value) &&
    value.length <= ZOMBIE_GAME_LIMITS.obstacles &&
    value.every(id) &&
    new Set(value).size === value.length
  )
}

function self(value) {
  return (
    record(value) &&
    id(value.playerId) &&
    finite(value.health, 0, 100) &&
    status(value.status) &&
    integer(value.lastInputSequence) &&
    integer(value.ammo, 0, 0xffff_ffff) &&
    integer(value.weaponIndex, 0, 31) &&
    integer(value.weaponInventoryMask, 0, 0xffff_ffff) &&
    Array.isArray(value.weaponAmmoByIndex) &&
    value.weaponAmmoByIndex.length >= 1 &&
    value.weaponAmmoByIndex.length <= ZOMBIE_GAME_LIMITS.weapons &&
    value.weaponAmmoByIndex.every((ammo) => integer(ammo, 0, 0xffff_ffff)) &&
    value.weaponIndex < value.weaponAmmoByIndex.length &&
    value.ammo === value.weaponAmmoByIndex[value.weaponIndex] &&
    finite(value.hitSlowSeconds, 0) &&
    finite(value.hurtFlash, 0) &&
    ['idle', 'windup', 'active', 'recovery'].includes(value.meleePhase) &&
    finite(value.meleePhaseSeconds, 0) &&
    integer(value.meleeSequence, 0, 0xffff_ffff) &&
    integer(value.meleeTargetSlot, -1, ZOMBIE_GAME_LIMITS.zombies - 1) &&
    integer(value.meleeTargetGeneration, 0, 0xffff_ffff) &&
    integer(value.nextShotVolleySequence, 0, 0xffff_ffff) &&
    integer(value.kills) &&
    finite(value.money, 0, 1_000_000_000) &&
    integer(value.nearbyPickupIndex, -1, 32767) &&
    [null, 'purchased', 'insufficient-funds'].includes(value.purchaseFeedback) &&
    integer(value.weaponPurchaseCount) &&
    Array.isArray(value.weaponPickupRespawnAtSeconds) &&
    value.weaponPickupRespawnAtSeconds.length === value.weaponAmmoByIndex.length &&
    value.weaponPickupRespawnAtSeconds.every(
      (time) => time === null || finite(time, 0, Number.MAX_SAFE_INTEGER),
    )
  )
}

export function isZombieGameSnapshot(value) {
  if (
    !record(value) ||
    value.type !== 'zombie-game-snapshot' ||
    value.schemaVersion !== ZOMBIE_GAME_SCHEMA_VERSION ||
    !id(value.roomId) ||
    !id(value.worldId) ||
    !id(value.sessionId) ||
    !integer(value.sequence) ||
    !integer(value.tick) ||
    !finite(value.serverTime, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(value.night) ||
    !phase(value.phase) ||
    !finite(value.phaseSecondsRemaining, 0, 180) ||
    !finite(value.elapsedSeconds, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(value.worldGeneration, 1, 0xffff_ffff) ||
    !self(value.self) ||
    !Array.isArray(value.ambientNpcs) ||
    value.ambientNpcs.length > ZOMBIE_GAME_LIMITS.ambientNpcs ||
    !Array.isArray(value.pendingAmbientNpcIndices) ||
    value.pendingAmbientNpcIndices.length > ZOMBIE_GAME_LIMITS.ambientNpcs ||
    !value.pendingAmbientNpcIndices.every((index) =>
      integer(index, 0, ZOMBIE_GAME_LIMITS.ambientNpcs - 1),
    ) ||
    new Set(value.pendingAmbientNpcIndices).size !== value.pendingAmbientNpcIndices.length ||
    !Array.isArray(value.players) ||
    value.players.length < 1 ||
    value.players.length > ZOMBIE_GAME_LIMITS.players
  )
    return false
  const playerIds = new Set()
  const ambientIndices = new Set()
  for (const npc of value.ambientNpcs) {
    if (
      !record(npc) ||
      !integer(npc.index, 0, ZOMBIE_GAME_LIMITS.ambientNpcs - 1) ||
      ambientIndices.has(npc.index) ||
      !finite(npc.x) ||
      !finite(npc.y) ||
      !finite(npc.z) ||
      !finite(npc.yaw) ||
      !finite(npc.locomotionPhase, 0) ||
      !['idle', 'walk', 'run'].includes(npc.phase)
    )
      return false
    ambientIndices.add(npc.index)
  }
  for (const player of value.players) {
    if (
      !record(player) ||
      !id(player.id) ||
      playerIds.has(player.id) ||
      !integer(player.generation, 1, 0xffff_ffff) ||
      !finite(player.health, 0, 100) ||
      !status(player.status) ||
      !integer(player.ackInputSequence)
    )
      return false
    playerIds.add(player.id)
  }
  const ownPlayer = value.players.find((player) => player.id === value.self.playerId)
  if (
    !ownPlayer ||
    ownPlayer.health !== value.self.health ||
    ownPlayer.status !== value.self.status ||
    ownPlayer.ackInputSequence !== value.self.lastInputSequence
  )
    return false
  const npcIndices = new Set()
  if (
    !rows(value.zombies, ZOMBIE_GAME_LIMITS.zombies, ZOMBIE_GAME_ZOMBIE_FIELDS, (row) => {
      if (
        !integer(row.sourceNpcIndex, -1, ZOMBIE_GAME_LIMITS.ambientNpcs - 1) ||
        (row.targetPlayerId !== null && !playerIds.has(row.targetPlayerId))
      )
        return false
      if (row.sourceNpcIndex >= 0) {
        if (npcIndices.has(row.sourceNpcIndex)) return false
        npcIndices.add(row.sourceNpcIndex)
      }
      return true
    }) ||
    !rows(value.shots, ZOMBIE_GAME_LIMITS.shots, ZOMBIE_GAME_SHOT_FIELDS, (row) =>
      id(row.ownerPlayerId),
    ) ||
    !rows(value.impacts, ZOMBIE_GAME_LIMITS.impacts, ZOMBIE_GAME_IMPACT_FIELDS, () => true) ||
    !ids(value.destroyedObstacleIds) ||
    !ids(value.passableObstacleIds) ||
    !Array.isArray(value.obstacleHitFeedback) ||
    value.obstacleHitFeedback.length > ZOMBIE_GAME_LIMITS.obstacles ||
    !Array.isArray(value.audio) ||
    value.audio.length > ZOMBIE_GAME_LIMITS.audio
  )
    return false
  if (value.pendingAmbientNpcIndices.some((index) => npcIndices.has(index))) return false
  const obstacleIds = new Set()
  for (const hit of value.obstacleHitFeedback) {
    if (!record(hit) || !id(hit.id) || obstacleIds.has(hit.id) || !finite(hit.amount, 0, 1))
      return false
    obstacleIds.add(hit.id)
  }
  let lastAudioSequence = -1
  for (const event of value.audio) {
    if (
      !record(event) ||
      !integer(event.sequence, 1) ||
      event.sequence <= lastAudioSequence ||
      !integer(event.kind, 1, 10) ||
      !integer(event.subjectIndex, 0, 65535) ||
      !finite(event.x) ||
      !finite(event.y) ||
      !finite(event.z)
    )
      return false
    lastAudioSequence = event.sequence
  }
  return true
}

export function isZombieGameInput(value) {
  if (
    !record(value) ||
    value.type !== 'zombie-game-input' ||
    value.schemaVersion !== ZOMBIE_GAME_SCHEMA_VERSION ||
    !id(value.worldId) ||
    !id(value.sessionId) ||
    !integer(value.night, 1) ||
    !integer(value.worldGeneration, 1, 0xffff_ffff) ||
    !integer(value.sequence, 1) ||
    !finite(value.aimAngle, -Math.PI * 2, Math.PI * 2) ||
    typeof value.fire !== 'boolean' ||
    typeof value.interactPressed !== 'boolean' ||
    !integer(value.weaponIndex, 0, 31) ||
    !record(value.muzzle)
  )
    return false
  const muzzle = value.muzzle
  if (
    !finite(muzzle.x) ||
    !finite(muzzle.y) ||
    !finite(muzzle.z) ||
    !finite(muzzle.directionX, -1, 1) ||
    !finite(muzzle.directionY, -1, 1) ||
    !finite(muzzle.directionZ, -1, 1)
  )
    return false
  const lengthSquared = muzzle.directionX ** 2 + muzzle.directionY ** 2 + muzzle.directionZ ** 2
  return lengthSquared > 0.99 && lengthSquared < 1.01
}

export function isZombieGameBind(value) {
  return (
    record(value) &&
    value.type === 'zombie-game-bind' &&
    value.schemaVersion === ZOMBIE_GAME_SCHEMA_VERSION &&
    id(value.worldId)
  )
}

export function isZombieGameStatus(value) {
  return (
    record(value) &&
    value.type === 'zombie-game-status' &&
    value.schemaVersion === ZOMBIE_GAME_SCHEMA_VERSION &&
    id(value.roomId) &&
    id(value.worldId) &&
    id(value.sessionId) &&
    integer(value.night) &&
    integer(value.worldGeneration, 1, 0xffff_ffff) &&
    ['loading', 'ready', 'error'].includes(value.status) &&
    (value.message === undefined ||
      (typeof value.message === 'string' && value.message.length <= 1024))
  )
}

export function isZombieGameDoor(value) {
  return (
    record(value) &&
    value.type === 'zombie-game-door' &&
    value.schemaVersion === ZOMBIE_GAME_SCHEMA_VERSION &&
    id(value.worldId) &&
    id(value.sessionId) &&
    integer(value.night) &&
    integer(value.worldGeneration, 1, 0xffff_ffff) &&
    integer(value.sequence, 1) &&
    id(value.doorId) &&
    typeof value.open === 'boolean'
  )
}

export function isZombieGameReady(value) {
  return (
    record(value) &&
    value.type === 'zombie-game-ready' &&
    value.schemaVersion === ZOMBIE_GAME_SCHEMA_VERSION &&
    id(value.worldId) &&
    id(value.sessionId) &&
    integer(value.night) &&
    integer(value.worldGeneration, 1, 0xffff_ffff) &&
    phase(value.phase) &&
    typeof value.ready === 'boolean'
  )
}
