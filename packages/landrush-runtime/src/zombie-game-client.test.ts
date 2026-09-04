import { expect, test } from 'bun:test'
import type { ZombieGameSnapshot, ZombieGameStatus } from '@landrush/protocol/zombie-game'
import { createMultiplayerZombieGameClient } from './zombie-game-client'

function fixture(enabled = true, unavailableReason: string | null = null) {
  const sent: unknown[] = []
  let now = 100
  let generation = 1
  const client = createMultiplayerZombieGameClient({
    enabled,
    unavailableReason,
    now: () => now,
    readScope: () => ({
      roomId: 'room',
      worldId: 'world',
      playerId: 'player',
      transportGeneration: generation,
    }),
    send: (message) => {
      sent.push(message)
      return true
    },
  })
  const status: ZombieGameStatus = {
    type: 'zombie-game-status',
    schemaVersion: 1,
    roomId: 'room',
    worldId: 'world',
    sessionId: 'session',
    night: 1,
    worldGeneration: 1,
    status: 'ready',
  }
  const snapshot: ZombieGameSnapshot = {
    type: 'zombie-game-snapshot',
    schemaVersion: 1,
    roomId: 'room',
    worldId: 'world',
    sessionId: 'session',
    night: 1,
    worldGeneration: 1,
    sequence: 1,
    tick: 1,
    serverTime: 1,
    phase: 'night',
    phaseSecondsRemaining: 179,
    elapsedSeconds: 1,
    self: {
      playerId: 'player',
      health: 100,
      status: 'playing',
      lastInputSequence: 0,
      ammo: 1,
      weaponIndex: 0,
      weaponInventoryMask: 1,
      weaponAmmoByIndex: [1],
      hitSlowSeconds: 0,
      hurtFlash: 0,
      meleePhase: 'idle',
      meleePhaseSeconds: 0,
      meleeSequence: 0,
      meleeTargetSlot: -1,
      meleeTargetGeneration: 0,
      nextShotVolleySequence: 0,
      kills: 0,
      money: 200,
      nearbyPickupIndex: -1,
      purchaseFeedback: null,
      weaponPurchaseCount: 0,
      weaponPickupRespawnAtSeconds: [null],
    },
    players: [{ id: 'player', generation: 1, health: 100, status: 'playing', ackInputSequence: 0 }],
    zombies: [],
    shots: [],
    impacts: [],
    audio: [],
    destroyedObstacleIds: [],
    passableObstacleIds: [],
    obstacleHitFeedback: [],
    ambientNpcs: [],
    pendingAmbientNpcIndices: [],
  }
  const intent = {
    aimAngle: 0,
    fire: true,
    interactPressed: false,
    weaponIndex: 0,
    muzzle: { x: 0, y: 1, z: 0, directionX: 0, directionY: 0, directionZ: 1 },
  }
  return {
    client,
    sent,
    status,
    snapshot,
    intent,
    setTime: (value: number) => {
      now = value
    },
    setGeneration: (value: number) => {
      generation = value
    },
  }
}

test('real gameplay requires opt-in, capability, accepted status and fresh full snapshot', () => {
  const { client, sent, status, snapshot, intent, setTime } = fixture()
  expect(client.acceptStatus(status, 1)).toBe(false)
  expect(client.acceptSnapshot(snapshot, 1)).toBe(false)
  expect(client.sendInput(intent)).toBe(false)
  expect(client.acceptCapability(2)).toBe(false)
  expect(client.getError()).not.toBeNull()
  expect(client.acceptCapability(1)).toBe(true)
  expect(client.requestBind()).toBe(true)
  expect(client.acceptStatus(status, 1)).toBe(true)
  expect(client.ready()).toBe(false)
  expect(client.acceptSnapshot(snapshot, 1)).toBe(true)
  expect(client.ready()).toBe(true)
  expect(client.sendInput(intent)).toBe(true)
  expect(client.sendDoor('door', true)).toBe(true)
  expect(sent.slice(1).map((message) => (message as { sequence: number }).sequence)).toEqual([1, 2])
  setTime(1101)
  expect(client.ready()).toBe(false)
  expect(client.sendInput(intent)).toBe(false)
  expect(fixture(false).client.acceptCapability(1)).toBe(false)
})

test('rejects stale/mismatched packets and suspends immediately after transport/lifecycle changes', () => {
  const { client, status, snapshot, intent, setGeneration } = fixture()
  client.acceptCapability(1)
  client.acceptStatus(status, 1)
  client.acceptSnapshot(snapshot, 1)
  expect(client.acceptSnapshot(snapshot, 1)).toBe(false)
  expect(client.acceptSnapshot({ ...snapshot, sequence: 2, sessionId: 'other' }, 1)).toBe(false)
  expect(client.acceptSnapshot({ ...snapshot, sequence: 2, worldGeneration: 2 }, 1)).toBe(false)
  expect(client.acceptStatus({ ...status, night: 0 }, 1)).toBe(false)
  setGeneration(2)
  expect(client.ready()).toBe(false)
  expect(client.sendInput(intent)).toBe(false)
  client.clear()
  expect(client.getStatus()).toBeNull()
  expect(client.readSnapshot()).toBeNull()
  expect(client.acceptSnapshot(snapshot, 2)).toBe(false)
})

test('offline authority intent remains enabled but cannot negotiate or fall back to local play', () => {
  const { client, status, snapshot, intent, sent } = fixture(
    true,
    'Shared Zombie gameplay requires an online connection.',
  )
  expect(client.enabled).toBe(true)
  expect(client.getError()).toContain('online connection')
  expect(client.acceptCapability(1)).toBe(false)
  expect(client.acceptStatus(status, 1)).toBe(false)
  expect(client.acceptSnapshot(snapshot, 1)).toBe(false)
  expect(client.sendInput(intent)).toBe(false)
  expect(client.ready()).toBe(false)
  expect(sent).toHaveLength(0)
  client.clear()
  expect(client.getError()).toContain('online connection')
})
