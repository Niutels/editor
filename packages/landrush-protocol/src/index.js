export const LEGACY_PARCEL_BUILD_SCHEMA_VERSION = 1
export const PARCEL_BUILD_SCHEMA_VERSION = 2
export const PARCEL_WRITER_SESSION_CLOSE_CODE = 4009
export const MAX_PARCEL_WRITER_SESSION_ID_LENGTH = 120
export const DEFAULT_MULTIPLAYER_ROOM_ID = 'landrush-lab-world-multiplayer'
export const MAX_MULTIPLAYER_ROOM_ID_LENGTH = 80

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
