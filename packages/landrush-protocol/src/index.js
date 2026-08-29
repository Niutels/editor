export const LEGACY_PARCEL_BUILD_SCHEMA_VERSION = 1
export const PARCEL_BUILD_SCHEMA_VERSION = 2
export const PARCEL_WRITER_SESSION_CLOSE_CODE = 4009
export const MAX_PARCEL_WRITER_SESSION_ID_LENGTH = 120
export const DEFAULT_MULTIPLAYER_ROOM_ID = 'landrush-lab-world-multiplayer'
export const MAX_MULTIPLAYER_ROOM_ID_LENGTH = 80
export const MAX_MULTIPLAYER_COMBAT_SHOTS = 64
export const MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS = 60_000
export const MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS = 180_000
export const DEFAULT_PROFILE_MONEY = 0
export const MAX_PROFILE_MONEY = 1_000_000_000
export const MAX_PROFILE_MONEY_OPERATION_ID_LENGTH = 120
export const ZOMBIE_ESCAPE_KILL_REWARD = 10

const MAX_PROFILE_ID_LENGTH = 120
const MAX_ZOMBIE_ESCAPE_SESSION_ID_LENGTH = 80

export function isParcelBuildSchemaVersion(value) {
  return value === PARCEL_BUILD_SCHEMA_VERSION
}

export function isSupportedParcelBuildSchemaVersion(value) {
  return value === LEGACY_PARCEL_BUILD_SCHEMA_VERSION || isParcelBuildSchemaVersion(value)
}

export function isParcelWriterEpoch(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function sanitizeParcelWriterSessionId(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.slice(0, MAX_PARCEL_WRITER_SESSION_ID_LENGTH).replace(/[^a-zA-Z0-9._:-]/g, '-')
}

export function normalizeParcelBuildRevision(value, fallback = 0) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

export function sanitizeMultiplayerRoomId(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || DEFAULT_MULTIPLAYER_ROOM_ID)
    .slice(0, MAX_MULTIPLAYER_ROOM_ID_LENGTH)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function sanitizeProfileMoneyOperationId(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized
    .slice(0, MAX_PROFILE_MONEY_OPERATION_ID_LENGTH)
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
}

export function isProfileWalletSnapshot(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.profileId === 'string' &&
    value.profileId.length > 0 &&
    value.profileId.length <= MAX_PROFILE_ID_LENGTH &&
    isProfileMoney(value.balance) &&
    isNonnegativeSafeInteger(value.revision) &&
    isNonnegativeSafeInteger(value.updatedAt)
  )
}

export function sanitizeProfileWalletSnapshot(value) {
  if (!isProfileWalletSnapshot(value)) return undefined
  return {
    balance: value.balance,
    profileId: value.profileId,
    revision: value.revision,
    updatedAt: value.updatedAt,
  }
}

export function isProfileMoneyOperation(value) {
  if (!value || typeof value !== 'object') return false
  if (
    !isNonnegativeSafeInteger(value.baseRevision) ||
    !isCanonicalProfileMoneyOperationId(value.operationId)
  ) {
    return false
  }
  if (value.kind === 'zombie-kill-reward') return true
  return value.kind === 'weapon-purchase' && isPositiveProfileMoney(value.cost)
}

export function sanitizeProfileMoneyOperation(value) {
  if (!isProfileMoneyOperation(value)) return undefined
  if (value.kind === 'zombie-kill-reward') {
    return {
      baseRevision: value.baseRevision,
      kind: value.kind,
      operationId: value.operationId,
    }
  }
  return {
    baseRevision: value.baseRevision,
    cost: value.cost,
    kind: value.kind,
    operationId: value.operationId,
  }
}

export function isApplyProfileMoneyOperationMessage(value) {
  if (!value || typeof value !== 'object') return false
  return (
    value.type === 'apply-profile-money-operation' &&
    isProfileMoneyOperation(value.operation) &&
    isParcelWriterEpoch(value.writerEpoch) &&
    typeof value.writerSessionId === 'string' &&
    value.writerSessionId.length > 0 &&
    value.writerSessionId === sanitizeParcelWriterSessionId(value.writerSessionId)
  )
}

export function isReportZombieEscapeDeathMessage(value) {
  if (!value || typeof value !== 'object') return false
  return (
    value.type === 'report-zombie-escape-death' &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= MAX_ZOMBIE_ESCAPE_SESSION_ID_LENGTH &&
    Number.isSafeInteger(value.night) &&
    value.night > 0
  )
}

export function isSpatialVoiceSignalPayload(value) {
  if (!value || typeof value !== 'object') return false
  if (value.type === 'disconnect' || value.type === 'ready') return true
  if (value.type === 'ice-candidate') {
    return Boolean(value.candidate) && typeof value.candidate === 'object'
  }
  return (
    value.type === 'description' &&
    (value.description?.type === 'offer' || value.description?.type === 'answer') &&
    typeof value.description.sdp === 'string' &&
    value.description.sdp.length <= 120_000
  )
}

export function isMultiplayerPlayerPose(value) {
  return value === 'crouching' || value === 'falling'
}

export function isMultiplayerZombieEscapeStateSnapshot(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= MAX_ZOMBIE_ESCAPE_SESSION_ID_LENGTH &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    (value.phase === 'build' || value.phase === 'night') &&
    Number.isSafeInteger(value.night) &&
    value.night >= 0 &&
    (value.phase !== 'night' || value.night > 0) &&
    (value.phaseEndsAt === null ||
      (Number.isSafeInteger(value.phaseEndsAt) && value.phaseEndsAt >= 0))
  )
}

function isCanonicalProfileMoneyOperationId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === sanitizeProfileMoneyOperationId(value)
  )
}

function isNonnegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isProfileMoney(value) {
  return isNonnegativeSafeInteger(value) && value <= MAX_PROFILE_MONEY
}

function isPositiveProfileMoney(value) {
  return isProfileMoney(value) && value > 0
}

export function sanitizeMultiplayerZombieEscapeStateSnapshot(value) {
  if (!isMultiplayerZombieEscapeStateSnapshot(value)) return undefined
  return {
    night: value.night,
    phase: value.phase,
    phaseEndsAt: value.phaseEndsAt,
    revision: value.revision,
    sessionId: value.sessionId,
  }
}

export function isMultiplayerPlayerCombatSnapshot(value) {
  if (!value || typeof value !== 'object') return false
  return (
    Number.isFinite(value.aimAngle) &&
    Number.isSafeInteger(value.ammo) &&
    value.ammo >= 0 &&
    isCombatWeaponIndex(value.weaponIndex) &&
    Number.isInteger(value.shotSequence) &&
    value.shotSequence >= 0 &&
    value.shotSequence <= 0xffff_ffff &&
    ['active', 'idle', 'recovery', 'windup'].includes(value.meleePhase) &&
    Number.isFinite(value.meleeProgress) &&
    value.meleeProgress >= 0 &&
    value.meleeProgress <= 1 &&
    Array.isArray(value.shots) &&
    value.shots.length <= MAX_MULTIPLAYER_COMBAT_SHOTS &&
    value.shots.every(isCombatShotSnapshot)
  )
}

export function sanitizeMultiplayerPlayerCombatSnapshot(value) {
  if (!isMultiplayerPlayerCombatSnapshot(value)) return undefined
  return {
    aimAngle: value.aimAngle,
    ammo: value.ammo,
    meleePhase: value.meleePhase,
    meleeProgress: value.meleeProgress,
    shotSequence: value.shotSequence,
    shots: value.shots.map((shot) => ({
      id: shot.id,
      impactAge: shot.impactAge,
      position: [...shot.position],
      previousPosition: [...shot.previousPosition],
      weaponIndex: shot.weaponIndex,
    })),
    weaponIndex: value.weaponIndex,
  }
}

function isCombatWeaponIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < 5
}

function isCombatPoint(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

function isCombatShotSnapshot(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    isCombatWeaponIndex(value.weaponIndex) &&
    isCombatPoint(value.position) &&
    isCombatPoint(value.previousPosition) &&
    (value.impactAge === null ||
      (Number.isFinite(value.impactAge) && value.impactAge >= 0 && value.impactAge <= 1))
  )
}
