import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isParcelBuildSchemaVersion,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
} from './index.js'

test('accepts only the current parcel-build schema', () => {
  assert.equal(isParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION + 1), false)
})

test('normalizes parcel-build revisions without accepting fractions or negative values', () => {
  assert.equal(normalizeParcelBuildRevision(4), 4)
  assert.equal(normalizeParcelBuildRevision(-1, 2), 2)
  assert.equal(normalizeParcelBuildRevision(1.5, 3), 3)
})
