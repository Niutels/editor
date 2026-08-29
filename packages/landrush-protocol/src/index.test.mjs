import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PROFILE_MONEY,
  DEFAULT_MULTIPLAYER_ROOM_ID,
  isApplyProfileMoneyOperationMessage,
  isMultiplayerPlayerCombatSnapshot,
  isMultiplayerZombieEscapeStateSnapshot,
  isParcelBuildSchemaVersion,
  isParcelWriterEpoch,
  isMultiplayerPlayerPose,
  isProfileMoneyOperation,
  isProfileWalletSnapshot,
  isReportZombieEscapeDeathMessage,
  isSpatialVoiceSignalPayload,
  isSupportedParcelBuildSchemaVersion,
  LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
  MAX_PROFILE_MONEY,
  MAX_PROFILE_MONEY_OPERATION_ID_LENGTH,
  MAX_MULTIPLAYER_ROOM_ID_LENGTH,
  MAX_MULTIPLAYER_COMBAT_SHOTS,
  MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS,
  MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
  sanitizeParcelWriterSessionId,
  sanitizeMultiplayerRoomId,
  sanitizeMultiplayerPlayerCombatSnapshot,
  sanitizeMultiplayerZombieEscapeStateSnapshot,
  sanitizeProfileMoneyOperation,
  sanitizeProfileMoneyOperationId,
  sanitizeProfileWalletSnapshot,
  ZOMBIE_ESCAPE_KILL_REWARD,
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

test('shares a bounded persistent profile wallet contract', () => {
  assert.equal(DEFAULT_PROFILE_MONEY, 0)
  assert.equal(MAX_PROFILE_MONEY, 1_000_000_000)
  assert.equal(ZOMBIE_ESCAPE_KILL_REWARD, 10)

  const wallet = {
    balance: 37,
    ignored: true,
    profileId: 'player-1',
    revision: 4,
    updatedAt: 123_456,
  }
  assert.equal(isProfileWalletSnapshot(wallet), true)
  assert.deepEqual(sanitizeProfileWalletSnapshot(wallet), {
    balance: 37,
    profileId: 'player-1',
    revision: 4,
    updatedAt: 123_456,
  })

  for (const overrides of [
    { profileId: '' },
    { balance: -1 },
    { balance: 1.5 },
    { balance: MAX_PROFILE_MONEY + 1 },
    { revision: -1 },
    { updatedAt: Number.POSITIVE_INFINITY },
  ]) {
    const value = { ...wallet, ...overrides }
    assert.equal(isProfileWalletSnapshot(value), false)
    assert.equal(sanitizeProfileWalletSnapshot(value), undefined)
  }
})

test('validates stable idempotent profile money operations and writer envelopes', () => {
  assert.equal(sanitizeProfileMoneyOperationId(' reward / 1 '), 'reward---1')
  assert.equal(
    sanitizeProfileMoneyOperationId('x'.repeat(MAX_PROFILE_MONEY_OPERATION_ID_LENGTH + 1)),
    'x'.repeat(MAX_PROFILE_MONEY_OPERATION_ID_LENGTH),
  )

  const reward = {
    baseRevision: 2,
    kind: 'zombie-kill-reward',
    operationId: 'reward:session-1:night-2:zombie-3',
  }
  const purchase = {
    baseRevision: 3,
    cost: 50,
    kind: 'weapon-purchase',
    operationId: 'purchase:player-1:4',
  }
  assert.equal(isProfileMoneyOperation(reward), true)
  assert.equal(isProfileMoneyOperation(purchase), true)
  assert.deepEqual(sanitizeProfileMoneyOperation({ ...purchase, ignored: true }), purchase)
  assert.equal(
    isApplyProfileMoneyOperationMessage({
      operation: purchase,
      type: 'apply-profile-money-operation',
      writerEpoch: 2,
      writerSessionId: 'writer-1',
    }),
    true,
  )

  for (const value of [
    { ...reward, baseRevision: -1 },
    { ...reward, operationId: ' reward ' },
    { ...purchase, cost: 0 },
    { ...purchase, cost: 1.5 },
    { ...purchase, cost: MAX_PROFILE_MONEY + 1 },
  ]) {
    assert.equal(isProfileMoneyOperation(value), false)
    assert.equal(sanitizeProfileMoneyOperation(value), undefined)
  }
  assert.equal(
    isApplyProfileMoneyOperationMessage({
      operation: purchase,
      type: 'apply-profile-money-operation',
      writerSessionId: 'writer-1',
    }),
    false,
  )
})

test('validates Zombie Escape death reports against a positive session night', () => {
  const report = {
    night: 2,
    sessionId: 'zombie-session',
    type: 'report-zombie-escape-death',
  }
  assert.equal(isReportZombieEscapeDeathMessage(report), true)
  for (const overrides of [
    { night: 0 },
    { night: 1.5 },
    { sessionId: '' },
    { sessionId: 'x'.repeat(81) },
    { type: 'player-died' },
  ]) {
    assert.equal(isReportZombieEscapeDeathMessage({ ...report, ...overrides }), false)
  }
})

test('accepts only supported multiplayer presentation poses', () => {
  assert.equal(isMultiplayerPlayerPose('crouching'), true)
  assert.equal(isMultiplayerPlayerPose('falling'), true)
  assert.equal(isMultiplayerPlayerPose('standing'), false)
  assert.equal(isMultiplayerPlayerPose(undefined), false)
})

test('preserves bounded combat state and strips unrelated payload fields', () => {
  const combat = combatSnapshot()
  const sanitized = sanitizeMultiplayerPlayerCombatSnapshot({
    ...combat,
    ignored: 'not part of the wire contract',
    shots: combat.shots.map((shot) => ({ ...shot, ignored: true })),
  })
  assert.equal(isMultiplayerPlayerCombatSnapshot(combat), true)
  assert.deepEqual(sanitized, combat)
  combat.shots[0].position[0] = 999
  assert.equal(sanitized.shots[0].position[0], 1)
})

test('rejects malformed combat state before it reaches a remote weapon rig', () => {
  for (const overrides of [
    { aimAngle: Number.NaN },
    { ammo: -1 },
    { ammo: 1.5 },
    { weaponIndex: -1 },
    { weaponIndex: 5 },
    { weaponIndex: 0.5 },
    { meleePhase: 'unknown' },
    { meleeProgress: 1.1 },
    { shotSequence: -1 },
    { shotSequence: 0x1_0000_0000 },
    { shots: Array(MAX_MULTIPLAYER_COMBAT_SHOTS + 1).fill(combatSnapshot().shots[0]) },
    { shots: [{ ...combatSnapshot().shots[0], position: [0, Number.POSITIVE_INFINITY, 0] }] },
    { shots: [{ ...combatSnapshot().shots[0], previousPosition: [0, 1] }] },
    { shots: [{ ...combatSnapshot().shots[0], impactAge: -1 }] },
    { shots: [null] },
  ]) {
    const value = { ...combatSnapshot(), ...overrides }
    assert.equal(isMultiplayerPlayerCombatSnapshot(value), false)
    assert.equal(sanitizeMultiplayerPlayerCombatSnapshot(value), undefined)
  }
  assert.equal(sanitizeMultiplayerPlayerCombatSnapshot(undefined), undefined)
  assert.equal(sanitizeMultiplayerPlayerCombatSnapshot(null), undefined)
})

test('shares and validates the canonical Zombie Escape room clock contract', () => {
  assert.equal(MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS, 60_000)
  assert.equal(MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS, 180_000)

  const held = zombieEscapeState()
  const active = {
    ...held,
    ignored: 'not part of the wire contract',
    night: 3,
    phase: 'night',
    phaseEndsAt: 123_456,
    revision: 7,
  }
  assert.equal(isMultiplayerZombieEscapeStateSnapshot(held), true)
  assert.equal(isMultiplayerZombieEscapeStateSnapshot(active), true)
  assert.deepEqual(sanitizeMultiplayerZombieEscapeStateSnapshot(active), {
    night: 3,
    phase: 'night',
    phaseEndsAt: 123_456,
    revision: 7,
    sessionId: 'zombie-session',
  })
})

test('rejects malformed Zombie Escape room clocks', () => {
  for (const overrides of [
    { sessionId: '' },
    { sessionId: 'x'.repeat(81) },
    { revision: -1 },
    { revision: 1.5 },
    { phase: 'day' },
    { night: -1 },
    { night: 1.5 },
    { phase: 'night', night: 0 },
    { phaseEndsAt: -1 },
    { phaseEndsAt: 1.5 },
    { phaseEndsAt: Number.POSITIVE_INFINITY },
  ]) {
    const value = { ...zombieEscapeState(), ...overrides }
    assert.equal(isMultiplayerZombieEscapeStateSnapshot(value), false)
    assert.equal(sanitizeMultiplayerZombieEscapeStateSnapshot(value), undefined)
  }
  assert.equal(sanitizeMultiplayerZombieEscapeStateSnapshot(undefined), undefined)
  assert.equal(sanitizeMultiplayerZombieEscapeStateSnapshot(null), undefined)
})

function combatSnapshot() {
  return {
    aimAngle: 1.2,
    ammo: 59,
    meleePhase: 'idle',
    meleeProgress: 0,
    shotSequence: 1,
    shots: [{ id: 8, impactAge: null, position: [1, 2, 3], previousPosition: [0, 2, 3], weaponIndex: 0 }],
    weaponIndex: 0,
  }
}

function zombieEscapeState() {
  return {
    night: 0,
    phase: 'build',
    phaseEndsAt: null,
    revision: 0,
    sessionId: 'zombie-session',
  }
}
