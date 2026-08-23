import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_MULTIPLAYER_ROOM_ID,
  isParcelBuildSchemaVersion,
  isParcelWriterEpoch,
  isMultiplayerPlayerPose,
  isSpatialVoiceSignalPayload,
  isSupportedParcelBuildSchemaVersion,
  LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
  MAX_MULTIPLAYER_ROOM_ID_LENGTH,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
  sanitizeParcelWriterSessionId,
  sanitizeMultiplayerRoomId,
} from './index.js'

test('accepts only the current parcel-build schema', () => {
  assert.equal(isParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isParcelBuildSchemaVersion(LEGACY_PARCEL_BUILD_SCHEMA_VERSION), false)
  assert.equal(isParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION + 1), false)
  assert.equal(isSupportedParcelBuildSchemaVersion(LEGACY_PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isSupportedParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isSupportedParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION + 1), false)
})

test('validates and sanitizes parcel writer sessions consistently', () => {
  assert.equal(isParcelWriterEpoch(1), true)
  assert.equal(isParcelWriterEpoch(0), false)
  assert.equal(isParcelWriterEpoch(1.5), false)
  assert.equal(sanitizeParcelWriterSessionId(' tab / one '), 'tab---one')
})

test('validates the spatial voice wire payload once for clients and servers', () => {
  assert.equal(isSpatialVoiceSignalPayload({ type: 'ready' }), true)
  assert.equal(
    isSpatialVoiceSignalPayload({
      description: { sdp: 'offer-sdp', type: 'offer' },
      type: 'description',
    }),
    true,
  )
  assert.equal(isSpatialVoiceSignalPayload({ candidate: null, type: 'ice-candidate' }), false)
  assert.equal(
    isSpatialVoiceSignalPayload({
      description: { sdp: 'x'.repeat(120_001), type: 'answer' },
      type: 'description',
    }),
    false,
  )
})

test('normalizes parcel-build revisions without accepting fractions or negative values', () => {
  assert.equal(normalizeParcelBuildRevision(4), 4)
  assert.equal(normalizeParcelBuildRevision(-1, 2), 2)
  assert.equal(normalizeParcelBuildRevision(1.5, 3), 3)
})

test('normalizes multiplayer room ids consistently for clients and servers', () => {
  assert.equal(sanitizeMultiplayerRoomId(undefined), DEFAULT_MULTIPLAYER_ROOM_ID)
  assert.equal(sanitizeMultiplayerRoomId('  island room/1  '), 'island-room-1')
  assert.equal(
    sanitizeMultiplayerRoomId('x'.repeat(MAX_MULTIPLAYER_ROOM_ID_LENGTH + 1)),
    'x'.repeat(MAX_MULTIPLAYER_ROOM_ID_LENGTH),
  )
})

test('accepts only supported multiplayer presentation poses', () => {
  assert.equal(isMultiplayerPlayerPose('crouching'), true)
  assert.equal(isMultiplayerPlayerPose('falling'), true)
  assert.equal(isMultiplayerPlayerPose('standing'), false)
  assert.equal(isMultiplayerPlayerPose(undefined), false)
})
