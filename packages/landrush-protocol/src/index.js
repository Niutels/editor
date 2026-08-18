export const PARCEL_BUILD_SCHEMA_VERSION = 1

export function isParcelBuildSchemaVersion(value) {
  return value === PARCEL_BUILD_SCHEMA_VERSION
}

export function normalizeParcelBuildRevision(value, fallback = 0) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
}
