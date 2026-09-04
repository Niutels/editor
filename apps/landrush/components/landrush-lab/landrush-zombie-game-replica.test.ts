import { describe, expect, test } from 'bun:test'
import {
  isZombieGameSnapshot,
  ZOMBIE_GAME_IMPACT_FIELDS,
  ZOMBIE_GAME_SHOT_FIELDS,
  ZOMBIE_GAME_ZOMBIE_FIELDS,
  type ZombieGameSnapshot,
} from '@landrush/protocol/zombie-game'
import { createMultiplayerZombieGameClient } from '@landrush/runtime/zombie-game-client'
import { createZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import { createLandrushZombieGameController } from './landrush-zombie-game-controller'
import {
  applyLandrushZombieGameSnapshot,
  createLandrushZombieGameReplica,
  presentLandrushZombieGameReplica,
  resetLandrushZombieGameReplicaScope,
} from './landrush-zombie-game-replica'

const scope = {
  roomId: 'room',
  worldId: 'world',
  sessionId: 'session',
  playerId: 'player',
  night: 1,
  worldGeneration: 1,
  transportGeneration: 1,
}
const origin = { x: 10, y: 2, z: -10 }
function setup() {
  const simulation = createZombieEscapeSimulation(createZombieEscapeArena(1), 1)
  const replica = createLandrushZombieGameReplica(simulation, scope)
  const numberFields = <T extends string>(keys: readonly T[]) =>
    Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
  function snapshot(sequence = 1): ZombieGameSnapshot {
    const ammo = Array.from(simulation.player.weaponAmmoByIndex)
    return {
      type: 'zombie-game-snapshot',
      schemaVersion: 1,
      roomId: 'room',
      worldId: 'world',
      sessionId: 'session',
      sequence,
      tick: sequence,
      serverTime: sequence * 100,
      night: 1,
      phase: 'night',
      phaseSecondsRemaining: 179,
      elapsedSeconds: sequence / 10,
      worldGeneration: 1,
      self: {
        playerId: 'player',
        lastInputSequence: sequence,
        health: 100,
        status: 'playing',
        ammo: ammo[0]!,
        weaponIndex: 0,
        weaponInventoryMask: 1,
        weaponAmmoByIndex: ammo,
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
        weaponPickupRespawnAtSeconds: ammo.map((_, index) => (index === 0 ? null : 0)),
      },
      players: [
        { id: 'player', generation: 1, health: 100, status: 'playing', ackInputSequence: sequence },
      ],
      ambientNpcs: [],
      pendingAmbientNpcIndices: [],
      zombies: [
        {
          ...numberFields(ZOMBIE_GAME_ZOMBIE_FIELDS),
          slot: 0,
          generation: 72,
          sourceNpcIndex: 0,
          targetPlayerId: 'player',
          variant: simulation.variantByPoolSlot[0]!,
          health: 100,
          x: 20,
          y: 4,
          z: 0,
        },
      ],
      shots: [
        {
          ...numberFields(ZOMBIE_GAME_SHOT_FIELDS),
          slot: 0,
          generation: 80,
          ownerPlayerId: 'player',
          phase: 1,
          hitTargetSlot: 0,
          hitTargetGeneration: 72,
          hitWorldGeneration: 1,
          x: 11,
          y: 3,
          z: -8,
          originX: 12,
          originY: 4,
          originZ: -7,
          hitLocalX: 0.3,
        },
      ],
      impacts: [
        {
          ...numberFields(ZOMBIE_GAME_IMPACT_FIELDS),
          slot: 0,
          generation: 99,
          targetSlot: 0,
          targetGeneration: 72,
          hitWorldGeneration: 1,
          x: 22,
          y: 6,
          z: 4,
          sourceX: 12,
          sourceY: 3,
          sourceZ: -7,
        },
      ],
      audio: [],
      destroyedObstacleIds: ['wall'],
      passableObstacleIds: ['door'],
      obstacleHitFeedback: [{ id: 'wall', amount: 0.5 }],
    }
  }
  const apply = (value: unknown, receivedAtMs = 1000, transportGeneration = 1) =>
    applyLandrushZombieGameSnapshot(replica, simulation, value, {
      receivedAtMs,
      origin,
      transportGeneration,
    })
  return { simulation, replica, snapshot, apply }
}

describe('authoritative 3D replica', () => {
  test('presentation time advances each frame without rewinding on snapshot jitter and remains bounded', () => {
    const { simulation, replica, snapshot, apply } = setup()
    const first = snapshot()
    first.elapsedSeconds = 10
    apply(first)
    presentLandrushZombieGameReplica(replica, simulation, 1150)
    expect(simulation.elapsedSeconds).toBeCloseTo(10.05)
    presentLandrushZombieGameReplica(replica, simulation, 1166)
    expect(simulation.elapsedSeconds).toBeCloseTo(10.066)
    const next = snapshot(2)
    next.elapsedSeconds = 10.1
    apply(next, 1166)
    expect(simulation.elapsedSeconds).toBeCloseTo(10.066)
    presentLandrushZombieGameReplica(replica, simulation, 1170)
    expect(simulation.elapsedSeconds).toBeCloseTo(10.066)
    presentLandrushZombieGameReplica(replica, simulation, 20000)
    expect(simulation.elapsedSeconds).toBeCloseTo(11)
    presentLandrushZombieGameReplica(replica, simulation, 30000)
    expect(simulation.elapsedSeconds).toBeCloseTo(11)
  })

  test('a newly received night cannot inherit the previous build phase ready flag', () => {
    const { simulation, snapshot } = setup()
    let now = 1000
    const sent: unknown[] = []
    const client = createMultiplayerZombieGameClient({
      enabled: true,
      now: () => now,
      readScope: () => scope,
      send: (message) => {
        sent.push(message)
        return true
      },
    })
    const controller = createLandrushZombieGameController(client, simulation, origin)
    const status = { type: 'zombie-game-status', schemaVersion: 1, ...scope, status: 'ready' }
    client.acceptCapability(1)
    client.acceptStatus(status, 1)
    const build = snapshot()
    build.phase = 'build'
    client.acceptSnapshot(build, 1)
    controller.update(now, true, true, 'build')
    now += 100
    client.acceptStatus({ ...status, night: 2 }, 1)
    const night = snapshot(2)
    night.night = 2
    client.acceptSnapshot(night, 1)
    controller.update(now, true, true, 'build')
    controller.update(now, true, false, 'night')
    controller.update(now, true, true, 'night')
    expect(
      sent.map((value) => {
        const row = value as { phase: string; ready: boolean }
        return [row.phase, row.ready]
      }),
    ).toEqual([
      ['build', true],
      ['night', false],
      ['night', true],
    ])
  })

  test('copies canonical geometry, attachments, handoff and outcomes into existing arrays without moving player', () => {
    const { simulation, replica, snapshot, apply } = setup()
    simulation.player.x = 123
    const originalPool = simulation.zombies.x
    const value = snapshot()
    expect(isZombieGameSnapshot(value)).toBe(true)
    expect(apply(value)).toBe(true)
    expect(simulation.zombies.x).toBe(originalPool)
    expect([simulation.zombies.x[0], simulation.zombies.y[0], simulation.zombies.z[0]]).toEqual([
      10, 2, 10,
    ])
    expect([
      simulation.shots.originX[0],
      simulation.shots.originY[0],
      simulation.shots.originZ[0],
    ]).toEqual([2, 2, 3])
    expect(simulation.shots.hitLocalX[0]).toBeCloseTo(0.3)
    expect(simulation.impactEvents.sourceX[0]).toBe(2)
    expect(simulation.shots.hitTargetGeneration[0]).toBe(simulation.zombies.pool.generation[0])
    expect(simulation.ambientHandoff.generationByNpcIndex[0]).toBe(
      simulation.zombies.pool.generation[0],
    )
    expect(replica.zombies.wireGeneration[0]).toBe(72)
    expect(simulation.player.x).toBe(123)
    expect(simulation.weaponPickupRespawnAtSeconds[0]).toBe(Infinity)
    expect(simulation.destroyedObstacleIds.has('wall')).toBe(true)
    expect(simulation.waveSpawnRemaining).toBe(0)
  })

  test('all stale, wrong-scope, malformed or capacity-invalid updates are rejected before simulation mutation', () => {
    const { simulation, snapshot, apply } = setup()
    expect(apply(snapshot())).toBe(true)
    const before = simulation.zombies.x[0]
    const changes: Partial<ZombieGameSnapshot>[] = [
      { sequence: 1 },
      { roomId: 'other' },
      { worldId: 'other' },
      { sessionId: 'other' },
      { worldGeneration: 2 },
      { night: 2 },
      { serverTime: 99 },
      { tick: 0 },
      { zombies: [{ ...snapshot().zombies[0]!, slot: simulation.zombies.pool.capacity }] },
    ]
    for (const change of changes) expect(apply({ ...snapshot(2), ...change }, 1100)).toBe(false)
    expect(apply(snapshot(2), 900)).toBe(false)
    expect(apply(snapshot(2), 1100, 2)).toBe(false)
    expect(simulation.zombies.x[0]).toBe(before)
  })

  test('interpolates only matching lifetimes and never extrapolates past server state', () => {
    const { simulation, replica, snapshot, apply } = setup()
    apply(snapshot())
    const next = snapshot(2)
    next.zombies[0]!.x = 30
    next.zombies[0]!.heading = -3.1
    replica.latest!.zombies[0]!.heading = 3.1
    apply(next, 1100)
    presentLandrushZombieGameReplica(replica, simulation, 1150)
    expect(simulation.zombies.x[0]).toBe(15)
    expect(Math.abs(simulation.zombies.heading[0]!)).toBeCloseTo(Math.PI)
    presentLandrushZombieGameReplica(replica, simulation, 5000)
    expect(simulation.zombies.x[0]).toBe(20)
    const replacement = snapshot(3)
    replacement.zombies[0]!.generation = 73
    replacement.zombies[0]!.x = 50
    apply(replacement, 1200)
    presentLandrushZombieGameReplica(replica, simulation, 1200)
    expect(simulation.zombies.x[0]).toBe(40)
    expect(simulation.shots.hitTargetGeneration[0]).toBe(0)
  })

  test('full snapshot clears absent entities and source claims after dropped messages', () => {
    const { simulation, snapshot, apply } = setup()
    apply(snapshot())
    const next = snapshot(25)
    next.zombies = []
    next.shots = []
    next.impacts = []
    next.destroyedObstacleIds = []
    apply(next, 2500)
    expect(simulation.zombies.pool.activeCount).toBe(0)
    expect(simulation.shots.pool.activeCount).toBe(0)
    expect(simulation.ambientHandoff.slotByNpcIndex[0]).toBe(-1)
    expect(simulation.destroyedObstacleIds.size).toBe(0)
  })

  test('pending NPC conversion survives partial snapshots until canonical admission', () => {
    const { simulation, snapshot, apply } = setup()
    const pending = snapshot()
    pending.zombies = []
    pending.pendingAmbientNpcIndices = [0, 1]
    expect(apply(pending)).toBe(true)
    expect(simulation.ambientHandoff.candidateCount).toBe(2)
    expect(simulation.ambientHandoff.candidateNpcIndex[0]).toBe(0)
    const admitted = snapshot(2)
    admitted.pendingAmbientNpcIndices = [1]
    expect(apply(admitted, 1100)).toBe(true)
    expect(simulation.ambientHandoff.slotByNpcIndex[0]).toBe(0)
    expect(simulation.ambientHandoff.candidateCount).toBe(1)
    expect(simulation.ambientHandoff.candidateNpcIndex[0]).toBe(1)
    expect(apply({ ...snapshot(3), pendingAmbientNpcIndices: [0] }, 1200)).toBe(false)
  })

  test('interpolated tracer endpoints retain direction, and effect clocks use correct countdown semantics', () => {
    const { simulation, replica, snapshot, apply } = setup()
    const first = snapshot()
    first.shots[0]!.x = 20
    first.shots[0]!.previousX = 19
    first.shots[0]!.travelAge = 0.2
    apply(first)
    const next = snapshot(2)
    next.shots[0]!.x = 30
    next.shots[0]!.previousX = 29
    next.shots[0]!.travelAge = 0.3
    next.zombies[0]!.health = 0
    next.zombies[0]!.deathPresentationSeconds = 0.4
    next.impacts[0]!.age = 0.2
    apply(next, 1100)
    presentLandrushZombieGameReplica(replica, simulation, 1150)
    expect(simulation.shots.x[0]! - simulation.shots.previousX[0]!).toBeCloseTo(1)
    expect(simulation.shots.travelAge[0]).toBeCloseTo(0.25)
    expect(simulation.impactEvents.age[0]).toBeCloseTo(0.15)
    expect(simulation.zombies.deathPresentationSeconds[0]).toBeCloseTo(0.45)
    const impact = snapshot(3)
    impact.shots[0]!.phase = 2
    impact.shots[0]!.travelAge = 0.3
    impact.shots[0]!.impactAge = 0.1
    apply(impact, 1200)
    presentLandrushZombieGameReplica(replica, simulation, 1250)
    expect(simulation.shots.travelAge[0]).toBeCloseTo(0.3)
    expect(simulation.shots.impactAge[0]).toBeCloseTo(0.05)
  })

  test('ambient NPCs use the same world-coordinate timeline and reuse output rows', () => {
    const { simulation, replica, snapshot, apply } = setup()
    const first = snapshot()
    first.ambientNpcs = [
      { index: 0, x: 20, y: 4, z: 2, yaw: 3.1, phase: 'walk', locomotionPhase: 2 },
    ]
    apply(first)
    const row = replica.ambientNpcs[0]
    const next = snapshot(2)
    next.ambientNpcs = [{ ...first.ambientNpcs[0]!, x: 30, yaw: -3.1, locomotionPhase: 4 }]
    apply(next, 1100)
    presentLandrushZombieGameReplica(replica, simulation, 1150)
    expect(replica.ambientNpcs[0]).toBe(row)
    expect(row?.x).toBe(25)
    expect(row?.y).toBe(4)
    expect(row?.locomotionPhase).toBe(3)
    expect(Math.abs(row!.yaw)).toBeCloseTo(Math.PI)
    apply(snapshot(3), 1200)
    expect(replica.ambientNpcs[0]).toBeNull()
    expect(simulation.obstacleRevision).toBe(1)
  })

  test('controller waits for prepared world, throttles intent, acknowledges equip, and freezes after disconnect', () => {
    const { simulation, snapshot } = setup()
    let now = 1000
    const sent: Array<{
      type?: string
      sequence?: number
      weaponIndex?: number
      ready?: boolean
      interactPressed?: boolean
    }> = []
    const client = createMultiplayerZombieGameClient({
      enabled: true,
      now: () => now,
      readScope: () => scope,
      send: (message) => {
        sent.push(message)
        return true
      },
    })
    const controller = createLandrushZombieGameController(client, simulation, origin)
    const first = snapshot()
    first.self.weaponInventoryMask = 3
    first.self.lastInputSequence = 0
    first.players[0]!.ackInputSequence = 0
    client.acceptCapability(1)
    client.acceptStatus(
      { type: 'zombie-game-status', schemaVersion: 1, ...scope, status: 'ready' },
      1,
    )
    client.acceptSnapshot(first, 1)
    expect(controller.update(now, false)).toBe(false)
    expect(controller.getReplica()).toBeNull()
    expect(controller.update(now, true)).toBe(true)
    expect(
      sent
        .filter((message) => message.type === 'zombie-game-ready')
        .map((message) => message.ready),
    ).toEqual([false, true])
    controller.update(now, true)
    expect(sent.filter((message) => message.type === 'zombie-game-ready')).toHaveLength(2)
    expect(controller.cycleWeapon(1)).toBe(true)
    expect(simulation.player.weaponIndex).toBe(0)
    const intent = {
      aimAngle: 0,
      fire: false,
      interactPressed: false,
      muzzle: { x: 10, y: 3, z: -10, directionX: 0, directionY: 0, directionZ: 1 },
    }
    expect(controller.send(now, intent)).toBe(true)
    expect(sent.find((message) => message.type === 'zombie-game-input')?.weaponIndex).toBe(1)
    now += 10
    expect(controller.send(now, intent)).toBe(false)
    expect(controller.send(now, { ...intent, fire: true })).toBe(true)
    expect(controller.send(now, { ...intent, fire: true, interactPressed: true })).toBe(true)
    expect(controller.send(now + 1, { ...intent, fire: true, interactPressed: true })).toBe(false)
    expect(sent.filter((message) => message.interactPressed)).toHaveLength(1)
    const next = snapshot(2)
    next.self.lastInputSequence = 3
    next.players[0]!.ackInputSequence = 3
    next.self.weaponInventoryMask = 3
    next.self.weaponIndex = 1
    next.self.ammo = next.self.weaponAmmoByIndex[1]!
    client.acceptSnapshot(next, 1)
    expect(controller.update(now, true)).toBe(true)
    expect(simulation.player.weaponIndex).toBe(1)
    client.clear()
    const count = simulation.zombies.pool.activeCount
    expect(controller.update(now + 50, true)).toBe(false)
    expect(controller.send(now + 50, intent)).toBe(false)
    expect(simulation.zombies.pool.activeCount).toBe(count)
  })

  test('deduplicates event history and gives new local lifetimes after trusted epoch reset', () => {
    const { simulation, replica, snapshot, apply } = setup()
    const first = snapshot()
    first.audio = [{ sequence: 1, kind: 8, subjectIndex: 0, x: 12, y: 3, z: -8 }]
    apply(first)
    expect(simulation.audioEvents.writeSequence).toBe(0)
    const oldGeneration = simulation.zombies.pool.generation[0]
    const next = snapshot(2)
    next.audio = [...first.audio, { ...first.audio[0]!, sequence: 2 }]
    apply(next, 1100)
    expect(simulation.audioEvents.writeSequence).toBe(1)
    apply({ ...next, sequence: 3, tick: 3 }, 1200)
    expect(simulation.audioEvents.writeSequence).toBe(1)
    resetLandrushZombieGameReplicaScope(replica, simulation, { ...scope, night: 2 })
    expect(apply(snapshot(4), 1300)).toBe(false)
    const newNight = snapshot()
    newNight.night = 2
    expect(apply(newNight, 1400)).toBe(true)
    expect(simulation.zombies.pool.generation[0]).not.toBe(oldGeneration)
    expect(replica.previous).toBeNull()
  })
})
