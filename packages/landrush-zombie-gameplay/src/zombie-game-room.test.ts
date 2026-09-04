import { describe, expect, test } from 'bun:test'
import { createLandrushZombieEscapeIntegratedArenaFromPlayRadius } from './landrush-zombie-escape-arena'
import { createLandrushZombieEscapeCollisionWorldsFromCompilePayload } from './landrush-zombie-escape-collision-world-compiler'
import { ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND } from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { spawnZombieEscapeZombieAtNavigationElevation } from './zombie-escape-simulation'
import { ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT } from './zombie-escape-zombie-catalog'
import {
  createZombieGameRoom,
  setZombieGamePhase,
  setZombieGamePlayer,
  setZombieGamePlayerConnected,
  setZombieGameWorld,
  stepZombieGameRoom,
  submitZombieGameInput,
  type ZombieGameRoom,
} from './zombie-game-room'

function makeWorld(
  segments: Parameters<
    typeof createLandrushZombieEscapeCollisionWorldsFromCompilePayload
  >[0]['segments'] = [],
  upperFloor = false,
) {
  return createLandrushZombieEscapeCollisionWorldsFromCompilePayload({
    agentRadius: 0.4,
    playRadius: 30,
    circles: [],
    combatBoxes: [],
    navigationBoxes: [],
    navigationConnectors: [],
    objectSemantics: segments
      .map((segment) => ({
        objectId: segment.objectId ?? segment.id,
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
      }))
      .sort((left, right) => left.objectId.localeCompare(right.objectId)),
    segments,
    navigationSupports: [0, ...(upperFloor ? [3] : [])].map((elevation) => ({
      boundary: true,
      elevation,
      id: `ground-${elevation}`,
      polygon: [
        { x: -30, z: -30 },
        { x: 30, z: -30 },
        { x: 30, z: 30 },
        { x: -30, z: 30 },
      ],
    })),
  })
}

function makeRoom(playerCount = 3, segments: Parameters<typeof makeWorld>[0] = []) {
  const room = createZombieGameRoom({
    arena: createLandrushZombieEscapeIntegratedArenaFromPlayRadius(30),
    seed: 123,
    capacity: 30,
  })
  setZombieGameWorld(room, makeWorld(segments))
  for (let index = 0; index < playerCount; index += 1)
    setZombieGamePlayer(room, `p${index}`, { x: (index - 1) * 8, y: 0, z: 0 })
  setZombieGamePhase(room, 'night')
  room.simulation.waveState = 'escape'
  tick(room, 12)
  return room
}

function tick(room: ZombieGameRoom, count: number) {
  for (let index = 0; index < count; index += 1) stepZombieGameRoom(room, 1 / 60)
}

function spawn(
  room: ZombieGameRoom,
  x: number,
  z: number,
  health = 100,
  variant: number | null = null,
) {
  const slot = spawnZombieEscapeZombieAtNavigationElevation(
    room.simulation,
    x,
    z,
    0,
    health,
    variant,
  )
  expect(slot).toBeGreaterThanOrEqual(0)
  return slot
}

function fire(room: ZombieGameRoom, id: string, sequence = 1) {
  const player = room.players.get(id)!
  return submitZombieGameInput(room, id, {
    sequence,
    aimAngle: 0,
    fire: true,
    interactPressed: false,
    weaponIndex: 0,
    muzzle: {
      x: player.state.x,
      y: player.state.y + 1.05,
      z: player.state.z + 0.86,
      directionX: 0,
      directionY: 0,
      directionZ: 1,
    },
  })
}

describe('one authoritative real-game Zombie room', () => {
  test('three players own different targets while every zombie belongs to one shared pool', () => {
    const room = makeRoom()
    const slots = [spawn(room, -10, 5), spawn(room, 0, 5), spawn(room, 10, 5)]
    const pool = room.simulation.zombies.pool
    tick(room, 45)
    expect(slots.map((slot) => room.targetPlayerIndex[slot])).toEqual([0, 1, 2])
    expect(room.simulation.zombies.pool).toBe(pool)
    expect(pool.activeCount).toBe(3)
    for (const slot of slots) expect(room.simulation.zombies.z[slot]).toBeLessThan(5)
    expect(room.players.get('p0')!.navigationField).not.toBe(
      room.players.get('p1')!.navigationField,
    )
    expect(room.players.get('p0')!.navigationField.world.navigationGraph).toBe(
      room.players.get('p1')!.navigationField.world.navigationGraph,
    )
  })

  test('retargets for a substantially closer player and immediately for dead or disconnected targets', () => {
    const room = makeRoom()
    const slot = spawn(room, -10, 8)
    tick(room, 2)
    expect(room.targetPlayerIndex[slot]).toBe(0)
    setZombieGamePlayer(room, 'p0', { x: -25, y: 0, z: -20 })
    setZombieGamePlayer(room, 'p1', { x: -10, y: 0, z: 7 })
    tick(room, 65)
    expect(room.targetPlayerIndex[slot]).toBe(1)
    setZombieGamePlayerConnected(room, 'p1', false)
    tick(room, 1)
    expect(room.targetPlayerIndex[slot]).not.toBe(1)
    const current = room.playerSlots[room.targetPlayerIndex[slot]!]!
    current.state.health = 0
    tick(room, 1)
    expect(room.targetPlayerIndex[slot]).not.toBe(current.index)
  })

  test('credits one lethal projectile to its owner and keeps the other player inventory untouched', () => {
    const room = makeRoom(2)
    const slot = spawn(room, -8, 1.2, 1)
    expect(fire(room, 'p0')).toBe(true)
    tick(room, 2)
    expect(room.simulation.zombies.health[slot]).toBe(0)
    expect(room.players.get('p0')!.kills).toBe(1)
    expect(room.players.get('p0')!.money).toBe(ZOMBIE_ESCAPE_SIMULATION.killReward)
    expect(room.players.get('p1')!.kills).toBe(0)
    expect(room.players.get('p1')!.money).toBe(0)
    expect(room.players.get('p0')!.state.ammo).toBe(59)
    expect(room.players.get('p1')!.state.ammo).toBe(60)
    tick(room, 10)
    expect(room.players.get('p0')!.kills).toBe(1)
  })

  test('keeps simultaneous fire cooldown and shot owner independent, and times out stale fire', () => {
    const room = makeRoom(2)
    expect(fire(room, 'p0')).toBe(true)
    expect(fire(room, 'p1')).toBe(true)
    tick(room, 1)
    expect(room.players.get('p0')!.state.ammo).toBe(59)
    expect(room.players.get('p1')!.state.ammo).toBe(59)
    expect(Array.from(room.shotOwnerPlayerIndex.slice(0, 2))).toEqual([0, 1])
    tick(room, 1)
    expect(room.players.get('p0')!.state.ammo).toBe(59)
    expect(room.players.get('p1')!.state.ammo).toBe(59)
    tick(room, 25)
    const ammo = room.players.get('p0')!.state.ammo
    tick(room, 40)
    expect(room.players.get('p0')!.state.ammo).toBe(ammo)
  })

  test('keeps melee damage and kill credit on the acting player', () => {
    const room = makeRoom(2)
    const player = room.players.get('p0')!
    player.state.ammo = 0
    player.state.weaponAmmoByIndex[0] = 0
    const slot = spawn(room, -8, 1, 30)
    expect(fire(room, 'p0')).toBe(true)
    tick(room, 22)
    expect(room.simulation.zombies.health[slot]).toBe(0)
    expect(player.kills).toBe(1)
    expect(room.players.get('p1')!.kills).toBe(0)
    expect(room.players.get('p1')!.state.health).toBe(100)
  })

  test('disconnect and reconnect retain health, ammo, and accepted input sequence', () => {
    const room = makeRoom(2)
    const player = room.players.get('p0')!
    fire(room, 'p0', 4)
    tick(room, 1)
    player.state.health = 23
    setZombieGamePlayerConnected(room, 'p0', false)
    setZombieGamePlayer(room, 'p0', { x: 3, y: 0, z: 3 })
    setZombieGamePlayerConnected(room, 'p0', true)
    expect(room.players.get('p0')).toBe(player)
    expect(player.state.health).toBe(23)
    expect(player.state.ammo).toBe(59)
    expect(player.lastInputSequence).toBe(4)
    expect(fire(room, 'p0', 4)).toBe(false)
  })

  test('bounds identities and rejects unowned weapons and a client muzzle far from its server pose', () => {
    const room = createZombieGameRoom({
      arena: createLandrushZombieEscapeIntegratedArenaFromPlayRadius(30),
      playersCapacity: 1,
    })
    expect(setZombieGamePlayer(room, 'p0', { x: 0, y: 0, z: 0 })).toBe(true)
    setZombieGamePlayerConnected(room, 'p0', false)
    expect(setZombieGamePlayer(room, 'p1', { x: 0, y: 0, z: 0 })).toBe(false)
    setZombieGamePlayerConnected(room, 'p0', true)
    expect(
      submitZombieGameInput(room, 'p0', {
        sequence: 1,
        aimAngle: 0,
        fire: true,
        interactPressed: false,
        weaponIndex: 1,
        muzzle: { x: 0, y: 1, z: 0, directionX: 0, directionY: 0, directionZ: 1 },
      }),
    ).toBe(false)
    expect(
      submitZombieGameInput(room, 'p0', {
        sequence: 1,
        aimAngle: 0,
        fire: true,
        interactPressed: false,
        weaponIndex: 0,
        muzzle: { x: 20, y: 1, z: 0, directionX: 0, directionY: 0, directionZ: 1 },
      }),
    ).toBe(false)
  })

  test('heavy zombies use their own assigned player trail and all players share the navigation work budget', () => {
    const room = makeRoom()
    for (let frame = 0; frame < 20; frame += 1) {
      setZombieGamePlayer(room, 'p0', { x: -8 - frame / 5, y: 0, z: 0 })
      setZombieGamePlayer(room, 'p2', { x: 8 + frame / 5, y: 0, z: 0 })
      tick(room, 1)
    }
    const left = spawn(room, -13, 3, 100, ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT)
    const right = spawn(room, 13, 3, 100, ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT)
    tick(room, 60)
    expect(room.targetPlayerIndex[left]).toBe(0)
    expect(room.targetPlayerIndex[right]).toBe(2)
    expect(room.players.get('p0')!.playerTrail).not.toBe(room.players.get('p2')!.playerTrail)
    expect(room.simulation.zombies.z[left]).toBeLessThan(3)
    expect(room.simulation.zombies.z[right]).toBeLessThan(3)
    expect(room.simulation.navigationSparseSearchBudgetViolationCount).toBe(0)
    expect(room.simulation.navigationIntentResolveBudgetViolationCount).toBe(0)
    expect(
      room.simulation.navigationSparseSearchAgentServiceSliceCountThisTick,
    ).toBeLessThanOrEqual(ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick)
  })

  test('three obstructed targets route around separate walls within one global navigation budget', () => {
    const room = makeRoom(
      3,
      [-8, 0, 8].map((center) => ({
        id: `wall-${center}`,
        startX: center - 2,
        endX: center + 2,
        startZ: 3,
        endZ: 3,
        halfThickness: 0.15,
        minimumY: 0,
        maximumY: 3,
      })),
    )
    tick(room, 60)
    for (const player of room.players.values()) player.state.health = 10000
    const slots = [-8, 0, 8].map((x) => spawn(room, x, 6))
    tick(room, 600)
    expect(slots.map((slot) => room.targetPlayerIndex[slot])).toEqual([0, 1, 2])
    for (const slot of slots) {
      expect(room.simulation.zombies.pool.active[slot]).toBe(1)
      expect(room.simulation.zombies.z[slot]).toBeLessThan(2.5)
    }
    expect(room.simulation.navigationSparseSearchBudgetViolationCount).toBe(0)
    expect(room.simulation.navigationIntentResolveBudgetViolationCount).toBe(0)
  })

  test('zombie attack contact damages only its assigned player and first assignment preserves conversion grace', () => {
    const room = makeRoom(2)
    const slot = spawn(room, -8, 0.8)
    room.simulation.zombies.attackCooldown[slot] = 2
    tick(room, 1)
    expect(room.targetPlayerIndex[slot]).toBe(0)
    expect(room.simulation.zombies.attackCooldown[slot]).toBeGreaterThan(1.9)
    tick(room, 150)
    expect(room.players.get('p0')!.state.health).toBeLessThan(100)
    expect(room.players.get('p1')!.state.health).toBe(100)
  })

  test('phase changes retain player inventories and navigation allocations but retire every shared projectile and zombie', () => {
    const room = makeRoom(2)
    const player = room.players.get('p0')!
    const fields = [...room.players.values()].map((entry) => entry.navigationField)
    fire(room, 'p0')
    spawn(room, -8, 4)
    tick(room, 1)
    player.state.health = 0
    tick(room, 1)
    expect(player.status).toBe('lost')
    setZombieGamePhase(room, 'build')
    expect(player.status).toBe('playing')
    expect(player.state.health).toBe(100)
    expect(player.state.ammo).toBe(59)
    expect(room.simulation.zombies.pool.activeCount).toBe(0)
    expect(room.simulation.shots.pool.activeCount).toBe(0)
    setZombieGamePlayer(room, 'p0', { x: -12, y: 0, z: 0 })
    setZombieGamePhase(room, 'night', 2)
    room.simulation.waveState = 'escape'
    tick(room, 12)
    expect(player.state.ammo).toBe(59)
    expect(player.navigationGoalX).toBe(-12)
    for (const entry of room.players.values())
      expect(entry.navigationField).toBe(fields[entry.index]!)
  })

  test('canonical world replacement updates every target without moving or replacing the shared live horde', () => {
    const room = makeRoom()
    const slots = [-8, 0, 8].map((x) => spawn(room, x, 5))
    tick(room, 20)
    const positions = slots.map((slot) => [
      room.simulation.zombies.x[slot],
      room.simulation.zombies.z[slot],
    ])
    const pool = room.simulation.zombies.pool
    const world = makeWorld([
      { id: 'distant-wall', startX: -5, endX: 5, startZ: 20, endZ: 20, halfThickness: 0.1 },
    ])
    setZombieGameWorld(room, world)
    expect(room.simulation.zombies.pool).toBe(pool)
    expect(
      slots.map((slot) => [room.simulation.zombies.x[slot], room.simulation.zombies.z[slot]]),
    ).toEqual(positions)
    for (const player of room.players.values())
      expect(player.navigationField.world.navigationGraph).toBe(world.navigation.navigationGraph)
    tick(room, 60)
    expect(slots.map((slot) => room.targetPlayerIndex[slot])).toEqual([0, 1, 2])
    expect(pool.activeCount).toBe(3)
    expect(room.simulation.navigationSparseSearchBudgetViolationCount).toBe(0)
  })

  test('ignores a closer player on a disconnected floor and retains an idle zombie until a reachable player returns', () => {
    const room = makeRoom(2)
    setZombieGameWorld(room, makeWorld([], true))
    setZombieGamePlayer(room, 'p1', { x: 0, y: 3, z: 4 })
    tick(room, 60)
    room.simulation.multiplayer!.bindPlayerIndex(0)
    const slot = spawn(room, 0, 4)
    tick(room, 12)
    expect(room.targetPlayerIndex[slot]).toBe(0)
    setZombieGamePlayerConnected(room, 'p0', false)
    tick(room, 60)
    expect(room.targetPlayerIndex[slot]).toBe(-1)
    expect(room.simulation.zombies.pool.active[slot]).toBe(1)
    const x = room.simulation.zombies.x[slot]!
    tick(room, 10)
    expect(room.simulation.zombies.x[slot]).toBe(x)
    setZombieGamePlayerConnected(room, 'p0', true)
    tick(room, 20)
    expect(room.targetPlayerIndex[slot]).toBe(0)
    expect(room.simulation.zombies.x[slot]).toBeLessThan(x)
  })

  test('a projectile credits its shooter even when its victim is chasing somebody else', () => {
    const room = makeRoom(2)
    setZombieGamePlayer(room, 'p1', { x: -8, y: 0, z: 5 })
    const slot = spawn(room, -8, 4, 1)
    tick(room, 12)
    expect(room.targetPlayerIndex[slot]).toBe(1)
    fire(room, 'p0')
    tick(room, 12)
    expect(room.simulation.zombies.health[slot]).toBe(0)
    expect(room.players.get('p0')!.kills).toBe(1)
    expect(room.players.get('p1')!.kills).toBe(0)
  })

  test('three players still have only one scheduled night population and one spawn budget', () => {
    const room = makeRoom()
    room.simulation.waveState = 'active'
    tick(room, 120)
    expect(room.simulation.zombies.pool.activeCount).toBe(
      ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount,
    )
    expect(room.simulation.navigationSparseSearchBudgetViolationCount).toBe(0)
  })
})
