import assert from 'node:assert/strict'
import test from 'node:test'
import { isZombieGameBind, isZombieGameDoor, isZombieGameInput, isZombieGameSnapshot, isZombieGameStatus, ZOMBIE_GAME_IMPACT_FIELDS, ZOMBIE_GAME_SHOT_FIELDS, ZOMBIE_GAME_ZOMBIE_FIELDS } from './zombie-game.js'

const fields = (keys, extra) => ({ ...Object.fromEntries(keys.map((key) => [key, 0])), slot: 0, generation: 1, ...extra })
function snapshot() {
  return {
    type: 'zombie-game-snapshot', schemaVersion: 1, roomId: 'room', worldId: 'world', sessionId: 'session',
    sequence: 1, tick: 1, serverTime: 100, night: 1, phase: 'night', phaseSecondsRemaining: 179, elapsedSeconds: 1, worldGeneration: 1,
    self: { playerId: 'player', lastInputSequence: 1, health: 100, status: 'playing', ammo: 10, weaponIndex: 0, weaponInventoryMask: 1, weaponAmmoByIndex: [10], hitSlowSeconds: 0, hurtFlash: 0, meleePhase: 'idle', meleePhaseSeconds: 0, meleeSequence: 0, meleeTargetSlot: -1, meleeTargetGeneration: 0, nextShotVolleySequence: 1, kills: 0, money: 200, nearbyPickupIndex: -1, purchaseFeedback: null, weaponPurchaseCount: 0, weaponPickupRespawnAtSeconds: [null] },
    players: [{ id: 'player', generation: 1, health: 100, status: 'playing', ackInputSequence: 1 }],
    zombies: [fields(ZOMBIE_GAME_ZOMBIE_FIELDS, { sourceNpcIndex: -1, targetPlayerId: 'player', health: 100 })],
    shots: [fields(ZOMBIE_GAME_SHOT_FIELDS, { ownerPlayerId: 'player', phase: 2, impactKind: 3 })],
    impacts: [fields(ZOMBIE_GAME_IMPACT_FIELDS)], audio: [{ sequence: 1, kind: 8, subjectIndex: 0, x: 1, y: 2, z: 3 }],
    destroyedObstacleIds: [], passableObstacleIds: [], obstacleHitFeedback: [], ambientNpcs: [], pendingAmbientNpcIndices: [],
  }
}

test('complete real-render state survives JSON round trip including unavailable pickups', () => {
  assert.equal(isZombieGameSnapshot(JSON.parse(JSON.stringify(snapshot()))), true)
})

test('reject malformed or unbounded snapshots without throwing', () => {
  for (const bad of [null, false, [], {}, { type: 'zombie-game-snapshot' }]) assert.equal(isZombieGameSnapshot(bad), false)
  const mutations = [
    (s) => { s.schemaVersion = 2 }, (s) => { s.sessionId = '' }, (s) => { s.worldGeneration = 0 },
    (s) => { s.sequence = -1 }, (s) => { s.tick = 1.5 }, (s) => { s.serverTime = Infinity },
    (s) => { s.self.health = NaN }, (s) => { s.self.weaponAmmoByIndex = [9] },
    (s) => { s.self.weaponPickupRespawnAtSeconds = [Infinity] }, (s) => { s.self.weaponPickupRespawnAtSeconds = [] },
    (s) => { s.self.playerId = 'absent' }, (s) => { s.players[0].ackInputSequence = 3 },
    (s) => { s.players.push(s.players[0]) }, (s) => { s.zombies.push(s.zombies[0]) },
    (s) => { s.zombies[0].generation = 0 }, (s) => { s.zombies[0].slot = 4096 },
    (s) => { s.zombies[0].x = 1_000_001 }, (s) => { s.zombies[0].intent = 4 },
    (s) => { s.zombies[0].runBlend = 1.1 }, (s) => { s.zombies[0].targetPlayerId = 'absent' },
    (s) => { s.zombies[0].sourceNpcIndex = 0; s.zombies.push({ ...s.zombies[0], slot: 1 }) },
    (s) => { s.shots[0].hitTargetGeneration = -1 }, (s) => { delete s.shots[0].hitLocalNormalY },
    (s) => { s.shots[0].phase = 3 }, (s) => { s.impacts[0].effectKind = 5 },
    (s) => { s.audio.push(s.audio[0]) }, (s) => { s.audio[0].kind = 11 },
    (s) => { s.audio = Array(1025).fill(s.audio[0]) }, (s) => { s.destroyedObstacleIds = ['wall', 'wall'] },
    (s) => { s.obstacleHitFeedback = [{ id: 'wall', amount: 2 }] },
    (s) => { s.ambientNpcs = [{ index: 0, x: NaN, y: 0, z: 0, yaw: 0, phase: 'idle', locomotionPhase: 0 }] },
  ]
  for (const mutate of mutations) { const value = snapshot(); mutate(value); assert.equal(isZombieGameSnapshot(value), false, mutate.toString()) }
})

test('input carries explicit authority epoch and unit muzzle direction', () => {
  const input = { type: 'zombie-game-input', schemaVersion: 1, worldId: 'world', sessionId: 'session', night: 1, worldGeneration: 1, sequence: 1, aimAngle: 0, fire: true, interactPressed: false, weaponIndex: 0, muzzle: { x: 1, y: 2, z: 3, directionX: 0, directionY: 0, directionZ: 1 } }
  assert.equal(isZombieGameInput(input), true)
  for (const change of [{ night: 0 }, { sequence: 0 }, { fire: 1 }, { worldGeneration: 0 }, { muzzle: { ...input.muzzle, directionZ: 0 } }, { muzzle: { ...input.muzzle, x: NaN } }]) assert.equal(isZombieGameInput({ ...input, ...change }), false)
})

test('bind and lifecycle status require scope and bounded schema', () => {
  assert.equal(isZombieGameBind({ type: 'zombie-game-bind', schemaVersion: 1, worldId: 'world' }), true)
  assert.equal(isZombieGameBind({ type: 'zombie-game-bind', schemaVersion: 2, worldId: 'world' }), false)
  const state = { type: 'zombie-game-status', schemaVersion: 1, roomId: 'room', worldId: 'world', sessionId: 'session', night: 0, worldGeneration: 1, status: 'ready' }
  assert.equal(isZombieGameStatus(state), true)
  assert.equal(isZombieGameStatus({ ...state, worldGeneration: 0 }), false)
  assert.equal(isZombieGameStatus({ ...state, status: 'whatever' }), false)
})

test('door requests contain an explicit desired state and shared input sequence', () => {
  const door = { type: 'zombie-game-door', schemaVersion: 1, worldId: 'world', sessionId: 'session', night: 0, worldGeneration: 1, sequence: 1, doorId: 'door', open: true }
  assert.equal(isZombieGameDoor(door), true)
  for (const change of [{ open: 1 }, { sequence: 0 }, { doorId: '' }, { worldGeneration: 0 }]) assert.equal(isZombieGameDoor({ ...door, ...change }), false)
})
