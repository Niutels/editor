import { describe, expect, test } from 'bun:test'
import {
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventKind,
} from './zombie-escape-audio-events'
import { createZombieEscapeCollisionWorld } from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCatalogEntry,
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_WEAPON_PICKUPS,
  ZOMBIE_ESCAPE_WEAPON_PROFILES,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeHudSnapshot,
  createZombieEscapeSimulation,
  resetZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  setZombieEscapePlayerMuzzlePose,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Zombie Escape simulation', () => {
  test('replays identical fixed-step input deterministically', () => {
    const arena = createZombieEscapeArena(12345)
    const first = createZombieEscapeSimulation(arena, 9876)
    const second = createZombieEscapeSimulation(arena, 9876)
    setZombieEscapeGamePhase(first, 'night')
    setZombieEscapeGamePhase(second, 'night')
    const input = createZombieEscapeControlState()
    input.moveX = 0.6
    input.moveZ = -0.8
    input.moveStrength = 1
    input.aimX = -1
    input.aimZ = 0
    input.aimStrength = 1
    input.run = true
    input.fire = true

    for (let frame = 0; frame < 360; frame += 1) {
      stepZombieEscapeSimulation(first, input, 1 / 60, arena)
      stepZombieEscapeSimulation(second, input, 1 / 60, arena)
    }

    expect(second.player).toEqual(first.player)
    expect(second.random).toEqual(first.random)
    expect(second.wave).toBe(first.wave)
    expect(second.shotsFired).toBe(first.shotsFired)
    expect([...second.zombies.pool.active]).toEqual([...first.zombies.pool.active])
    expect([...second.zombies.x]).toEqual([...first.zombies.x])
    expect([...second.shots.x]).toEqual([...first.shots.x])
    expect([...second.shots.y]).toEqual([...first.shots.y])
    expect([...second.shots.phase]).toEqual([...first.shots.phase])
    expect([...second.zombies.hitReaction]).toEqual([...first.zombies.hitReaction])
    expect([...second.audioEvents.kind]).toEqual([...first.audioEvents.kind])
    expect([...second.audioEvents.sequence]).toEqual([...first.audioEvents.sequence])
  })

  test('routes one shared zombie field around a wall without crossing it', () => {
    const arena = createZombieEscapeArena(41)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          { endX: 0, endZ: 2.2, halfThickness: 0.09, id: 'house-wall', startX: 0, startZ: -2.2 },
        ],
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.player.x = 3
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -3, 0)
    const input = createZombieEscapeControlState()

    for (let frame = 0; frame < 720 && state.zombies.x[zombie]! < 2; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      const x = state.zombies.x[zombie]!
      const z = state.zombies.z[zombie]!
      const closestZ = Math.max(-2.2, Math.min(2.2, z))
      expect(Math.hypot(x, z - closestZ)).toBeGreaterThanOrEqual(0.309)
    }

    expect(state.navigationField.rebuildCount).toBeLessThanOrEqual(2)
    expect(state.zombies.x[zombie]).toBeGreaterThan(2)
  })

  test('attacks an unreachable blocking object twice, removes it, and restores it on reset', () => {
    const arena = createZombieEscapeArena(410)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 810)
    const wall = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: arena.playRadius,
      segments: [
        {
          endX: 0,
          endZ: arena.playRadius,
          halfThickness: 0.09,
          id: 'house-wall:piece-0',
          objectId: 'house-wall',
          startX: 0,
          startZ: -arena.playRadius,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, wall)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -1.5, 0)
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()

    for (let frame = 0; frame < 180 && !state.obstacleHitCounts.has('house-wall'); frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.obstacleHitCounts.get('house-wall')).toBe(1)
    expect(state.destroyedObstacleIds.has('house-wall')).toBe(false)
    expect(state.collisionWorld.segments).toHaveLength(1)

    for (let frame = 0; frame < 180 && !state.destroyedObstacleIds.has('house-wall'); frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.destroyedObstacleIds.has('house-wall')).toBe(true)
    expect(state.obstacleHitCounts.has('house-wall')).toBe(false)
    expect(state.collisionSourceWorld.segments).toHaveLength(1)
    expect(state.collisionWorld.segments).toHaveLength(0)

    resetZombieEscapeSimulation(state, arena)
    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.collisionWorld.segments).toHaveLength(1)
  })

  test('uses a semantic zero-ammo melee hit once and respects wall line of sight', () => {
    const arena = createZombieEscapeArena(42)
    arena.obstacleCount = 0
    const clear = createZombieEscapeSimulation(arena, 82)
    const blocked = createZombieEscapeSimulation(arena, 82)
    for (const state of [clear, blocked]) {
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      state.player.x = 0
      state.player.z = 0
      state.player.ammo = 0
    }
    setZombieEscapeCollisionWorld(
      blocked,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRadius,
        playRadius: arena.playRadius,
        segments: [
          {
            endX: 2,
            endZ: -0.55,
            halfThickness: 0.09,
            id: 'closed-wall',
            startX: -2,
            startZ: -0.55,
          },
        ],
      }),
    )
    const clearZombie = spawnZombieEscapeZombie(clear, 0, -1.05, 40)
    const blockedZombie = spawnZombieEscapeZombie(blocked, 0, -1.05, 40)
    clear.zombies.speedScale[clearZombie] = 0
    blocked.zombies.speedScale[blockedZombie] = 0
    const input = createZombieEscapeControlState()
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true

    for (let frame = 0; frame < 13; frame += 1) {
      stepZombieEscapeSimulation(clear, input, 1 / 60, arena)
      stepZombieEscapeSimulation(blocked, input, 1 / 60, arena)
    }

    expect(clear.shotsFired).toBe(0)
    expect(clear.zombies.health[clearZombie]).toBe(6)
    expect(clear.player.meleeTargetSlot).toBe(clearZombie)
    expect(clear.player.meleeTargetGeneration).toBe(clear.zombies.pool.generation[clearZombie])
    expect(blocked.zombies.health[blockedZombie]).toBe(40)
    expect(blocked.player.meleeTargetSlot).toBe(-1)
    expect(readZombieEscapeAudioEventKinds(clear)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.meleeSwing,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyHit,
    ])
    expect(readZombieEscapeAudioEventKinds(blocked)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.meleeSwing,
    ])
  })

  test('does not melee or attack through a vertically separate floor', () => {
    const arena = createZombieEscapeArena(421)
    arena.obstacleCount = 0
    const meleeState = createZombieEscapeSimulation(arena, 821)
    const attackState = createZombieEscapeSimulation(arena, 822)
    for (const state of [meleeState, attackState]) {
      setZombieEscapeExternalPlayerPose(state, true)
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      state.player.x = 0
      state.player.y = 3
      state.player.z = 0
    }
    meleeState.player.ammo = 0
    const meleeZombie = spawnZombieEscapeZombie(meleeState, 0, -1.05, 40)
    const attackZombie = spawnZombieEscapeZombie(attackState, 0, -0.8, 40)
    meleeState.zombies.speedScale[meleeZombie] = 0
    attackState.zombies.speedScale[attackZombie] = 0
    attackState.zombies.attackCooldown[attackZombie] = 0
    const meleeInput = createZombieEscapeControlState()
    meleeInput.aimZ = -1
    meleeInput.aimStrength = 1
    meleeInput.fire = true
    const attackInput = createZombieEscapeControlState()

    for (let frame = 0; frame < 13; frame += 1) {
      stepZombieEscapeSimulation(meleeState, meleeInput, 1 / 60, arena)
      stepZombieEscapeSimulation(attackState, attackInput, 1 / 60, arena)
    }

    expect(meleeState.zombies.health[meleeZombie]).toBe(40)
    expect(meleeState.player.meleeTargetSlot).toBe(-1)
    expect(attackState.player.health).toBe(100)
  })

  test('allows ground combat below a vertically separate wall segment', () => {
    const arena = createZombieEscapeArena(422)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 823)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            endX: 2,
            endZ: -0.55,
            halfThickness: 0.09,
            id: 'upper-floor-wall',
            maximumY: 3.4,
            minimumY: 2.4,
            startX: -2,
            startZ: -0.55,
          },
        ],
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.player.x = 0
    state.player.y = 0
    state.player.z = 0
    state.player.ammo = 0
    const zombie = spawnZombieEscapeZombie(state, 0, -1.05, 40)
    state.zombies.speedScale[zombie] = 0
    const input = createZombieEscapeControlState()
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true

    for (let frame = 0; frame < 13; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBe(6)
    expect(state.player.meleeTargetSlot).toBe(zombie)
  })

  test('spawns each wave zombie on the deterministic player-reachable component', () => {
    const arena = createZombieEscapeArena(423)
    arena.obstacleCount = 0
    const first = createZombieEscapeSimulation(arena, 824)
    const second = createZombieEscapeSimulation(arena, 824)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: arena.playRadius,
      segments: [
        { endX: 10, endZ: -10, halfThickness: 0.1, id: 'south', startX: -10, startZ: -10 },
        { endX: 10, endZ: 10, halfThickness: 0.1, id: 'east', startX: 10, startZ: -10 },
        { endX: -10, endZ: 10, halfThickness: 0.1, id: 'north', startX: 10, startZ: 10 },
        { endX: -10, endZ: -10, halfThickness: 0.1, id: 'west', startX: -10, startZ: 10 },
      ],
    })
    for (const state of [first, second]) {
      setZombieEscapeCollisionWorld(state, world)
      setZombieEscapeGamePhase(state, 'night')
      state.player.x = 0
      state.player.z = 0
      state.waveSpawnRemaining = 1
      state.waveSpawnTimerSeconds = 0
      stepZombieEscapeSimulation(state, createZombieEscapeControlState(), 1 / 60, arena)
    }

    expect(first.waveSpawnRemaining).toBe(0)
    expect(first.zombies.pool.activeCount).toBe(1)
    expect(second.zombies.pool.activeCount).toBe(1)
    const firstSlot = first.zombies.pool.active.findIndex((active) => active !== 0)
    const secondSlot = second.zombies.pool.active.findIndex((active) => active !== 0)
    expect(firstSlot).toBeGreaterThanOrEqual(0)
    expect(secondSlot).toBeGreaterThanOrEqual(0)
    expect(first.zombies.x[firstSlot]).toBe(second.zombies.x[secondSlot])
    expect(first.zombies.z[firstSlot]).toBe(second.zombies.z[secondSlot])
    expect(Math.abs(first.zombies.x[firstSlot]!)).toBeLessThan(9.6)
    expect(Math.abs(first.zombies.z[firstSlot]!)).toBeLessThan(9.6)
    expect(
      Math.hypot(first.zombies.x[firstSlot]!, first.zombies.z[firstSlot]!),
    ).toBeGreaterThanOrEqual(8)
  })

  test('shoots through one fixed shot-event pool and damages a zombie', () => {
    const arena = createZombieEscapeArena(51)
    const state = createZombieEscapeSimulation(arena, 91)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 36)
    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true

    for (let frame = 0; frame < 30; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.shotsFired).toBeGreaterThan(0)
    expect(state.zombies.pool.active[zombie]).toBe(0)
    expect(state.kills).toBeGreaterThanOrEqual(1)
    expect(state.shots.pool.active.length).toBe(ZOMBIE_ESCAPE_CAPACITY.shots)
    expect(state.tracers.pool.activeCount).toBe(0)
  })

  test('creates exactly one 3D traveling carrier at the explicit muzzle pose', () => {
    const arena = createZombieEscapeArena(54)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 94)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 3,
      directionY: 4,
      directionZ: 0,
      x: 2.25,
      y: 1.4,
      z: -3.5,
    })
    const input = createZombieEscapeControlState()
    input.fire = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const slot = state.lastShotSlot
    expect(state.shotsFired).toBe(1)
    expect(state.shots.pool.activeCount).toBe(1)
    expect([...state.shots.pool.active].filter(Boolean)).toHaveLength(1)
    expect(state.shots.pool.generation[slot]).toBe(state.lastShotGeneration)
    expect(state.shots.phase[slot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.travel)
    expect(state.shots.originX[slot]).toBeCloseTo(2.25, 6)
    expect(state.shots.originY[slot]).toBeCloseTo(1.4, 6)
    expect(state.shots.originZ[slot]).toBeCloseTo(-3.5, 6)
    expect(state.shots.previousX[slot]).toBeCloseTo(2.25, 6)
    expect(state.shots.previousY[slot]).toBeCloseTo(1.4, 6)
    expect(state.shots.previousZ[slot]).toBeCloseTo(-3.5, 6)
    expect(state.shots.x[slot]).toBeCloseTo(
      2.25 + ZOMBIE_ESCAPE_SIMULATION.projectileSpeed * (1 / 60) * 0.6,
      5,
    )
    expect(state.shots.y[slot]).toBeCloseTo(
      1.4 + ZOMBIE_ESCAPE_SIMULATION.projectileSpeed * (1 / 60) * 0.8,
      5,
    )
    expect(state.shots.z[slot]).toBeCloseTo(-3.5, 6)
    expect(state.tracers.pool.activeCount).toBe(0)
    expect(readZombieEscapeAudioEventKinds(state)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
    ])
  })

  test('does not hit a ground zombie when the 3D shot passes far above it', () => {
    const arena = createZombieEscapeArena(541)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 941)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 120)
    state.zombies.speedScale[zombie] = 0
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: state.player.x,
      y: 100,
      z: state.player.z,
    })
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false

    for (let frame = 0; frame < 10; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBe(120)
    expect(state.shots.impactKind[state.lastShotSlot]).not.toBe(
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
    )
  })

  test('sweeps projectiles only against collision spans on the same vertical layer', () => {
    const arena = createZombieEscapeArena(5410)
    arena.obstacleCount = 0
    const low = createZombieEscapeSimulation(arena, 9410)
    const high = createZombieEscapeSimulation(arena, 9410)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: arena.playRadius,
      segments: [
        {
          endX: 2,
          endZ: -1,
          halfThickness: 0.09,
          id: 'ground-wall',
          maximumY: 2,
          minimumY: 0,
          startX: -2,
          startZ: -1,
        },
      ],
    })
    for (const [state, y] of [
      [low, 1],
      [high, 3],
    ] as const) {
      setZombieEscapeCollisionWorld(state, world)
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      setZombieEscapePlayerMuzzlePose(state, {
        directionX: 0,
        directionY: 0,
        directionZ: -1,
        x: 0,
        y,
        z: 0,
      })
      const input = createZombieEscapeControlState()
      input.fire = true
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      input.fire = false
      for (let frame = 0; frame < 3; frame += 1) {
        stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      }
    }

    expect(low.shots.impactKind[low.lastShotSlot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment)
    expect(high.shots.impactKind[high.lastShotSlot]).not.toBe(
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
    )
    expect(readZombieEscapeAudioEventKinds(low)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    ])
  })

  test('uses the catalog capsule instead of an oversized global target', () => {
    const arena = createZombieEscapeArena(5411)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9411)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, 0, -3.2, 120)
    state.zombies.variant[zombie] = 8
    state.zombies.speedScale[zombie] = 0
    expect(
      getZombieEscapeZombieCatalogEntry(state.zombies.variant[zombie]!).capsule.radiusMeters,
    ).toBe(0.3)
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: 0.4,
      y: 1.05,
      z: 0,
    })
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false

    for (let frame = 0; frame < 10; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBe(120)
    expect(state.shots.impactKind[state.lastShotSlot]).not.toBe(
      ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
    )
  })

  test('retires a range-expired shot without entering the visible impact phase', () => {
    const arena = createZombieEscapeArena(542)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 942)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 1,
      directionZ: 0,
      x: state.player.x,
      y: 2,
      z: state.player.z,
    })
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false

    for (let frame = 0; frame < 70; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    const shot = state.lastShotSlot
    expect(state.shots.pool.active[shot]).toBe(0)
    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.inactive)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired)
  })

  test('keeps a lethally hit zombie visible through its hit reaction before releasing it', () => {
    const arena = createZombieEscapeArena(543)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 943)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 1)
    state.zombies.speedScale[zombie] = 0
    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false

    for (let frame = 0; frame < 7; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBe(0)
    expect(state.zombies.pool.active[zombie]).toBe(1)
    expect(state.zombies.deathPresentationSeconds[zombie]).toBeGreaterThan(0)
    expect(state.zombies.hitReaction[zombie]).toBeGreaterThan(0)
    expect(state.kills).toBe(1)
    expect(readZombieEscapeAudioEventKinds(state)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyKilled,
    ])

    for (let frame = 0; frame < 30; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.pool.active[zombie]).toBe(0)
  })

  test('stores the earliest exact hit point and deterministic zombie reaction', () => {
    const arena = createZombieEscapeArena(55)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 95)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const muzzleZ = state.player.z
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: state.player.x,
      y: 1.08,
      z: muzzleZ,
    })
    const zombie = spawnZombieEscapeZombie(state, state.player.x, muzzleZ - 3.2, 120)
    state.zombies.variant[zombie] = 8
    state.zombies.speedScale[zombie] = 0
    const targetGeneration = state.zombies.pool.generation[zombie]
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false

    for (let frame = 0; frame < 7; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    const shot = state.lastShotSlot
    const hitRadius = getZombieEscapeZombieCatalogEntry(state.zombies.variant[zombie]!).capsule
      .radiusMeters
    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.impact)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy)
    expect(state.shots.hitTargetSlot[shot]).toBe(zombie)
    expect(state.shots.hitTargetGeneration[shot]).toBe(targetGeneration)
    expect(state.shots.hitX[shot]).toBeCloseTo(state.player.x, 6)
    expect(state.shots.hitY[shot]).toBeCloseTo(1.08, 6)
    expect(state.shots.hitZ[shot]).toBeCloseTo(muzzleZ - (3.2 - hitRadius), 5)
    expect(state.shots.hitLocalZ[shot]).toBeCloseTo(hitRadius, 5)
    expect(state.shots.hitLocalY[shot]).toBeCloseTo(1.05, 5)
    expect(state.shots.hitLocalNormalZ[shot]).toBeCloseTo(1, 5)
    expect(state.shots.z[shot]! - state.shots.hitZ[shot]!).toBeCloseTo(
      ZOMBIE_ESCAPE_SIMULATION.projectileRadius,
      5,
    )
    expect(state.zombies.health[zombie]).toBeLessThan(120)
    expect(state.zombies.hitFlash[zombie]).toBeGreaterThan(0)
    expect(state.zombies.hitReaction[zombie]).toBeGreaterThan(0)
    expect(state.zombies.hitImpulseZ[zombie]).toBeLessThan(0)

    for (let frame = 0; frame < 30; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.hitFlash[zombie]).toBe(0)
    expect(state.zombies.hitReaction[zombie]).toBe(0)
    expect(Math.abs(state.zombies.hitImpulseZ[zombie]!)).toBeLessThan(0.05)
  })

  test('opens the extraction result and reset restores the deterministic start', () => {
    const arena = createZombieEscapeArena(52)
    const state = createZombieEscapeSimulation(arena, 92)
    const input = createZombieEscapeControlState()
    state.extractionOpen = true
    state.waveState = 'escape'
    state.player.x = arena.escapeX
    state.player.z = arena.escapeZ
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.status).toBe('won')

    resetZombieEscapeSimulation(state, arena)
    expect(state.status).toBe('playing')
    expect(state.player.x).toBe(arena.playerStartX)
    expect(state.player.z).toBe(arena.playerStartZ)
    expect(state.wave).toBe(1)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.shots.pool.activeCount).toBe(0)
    expect(state.player.muzzlePoseExternal).toBe(false)
    expect(state.phase).toBe('build')
    expect(state.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds)
    expect(state.player.ammo).toBe(15)
  })

  test('publishes player hurt and death once and preserves a lethal cue across reset', () => {
    const arena = createZombieEscapeArena(521)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 921)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 0.7, 120)
    state.zombies.speedScale[zombie] = 0
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.player.health).toBe(92)
    expect(readZombieEscapeAudioEventKinds(state)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerHurt,
    ])

    const beforeLethalSequence = state.audioEvents.writeSequence
    state.player.health = 8
    state.zombies.attackCooldown[zombie] = 0
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.status).toBe('lost')
    expect(readZombieEscapeAudioEventKinds(state, beforeLethalSequence)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerKilled,
    ])

    const lethalSequence = state.audioEvents.writeSequence
    resetZombieEscapeSimulation(state, arena)
    expect(state.audioEvents.writeSequence).toBe(lethalSequence)
    expect(readZombieEscapeAudioEventKinds(state, lethalSequence - 1)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerKilled,
    ])
  })

  test('requires E to purchase a nearby weapon and applies its finite fire profile', () => {
    const arena = createZombieEscapeArena(53)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 93)
    const weaponIndex = ZOMBIE_ESCAPE_WEAPON_PICKUPS.length - 1
    const pickup = ZOMBIE_ESCAPE_WEAPON_PICKUPS[weaponIndex]
    const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]
    expect(pickup).toBeDefined()
    expect(profile).toBeDefined()
    if (!pickup || !profile) return
    state.player.x = pickup.x
    state.player.z = pickup.z
    const input = createZombieEscapeControlState()

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.player.weaponIndex).toBe(0)

    state.money = profile.purchaseCost
    input.interactPressed = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.player.weaponIndex).toBe(weaponIndex)
    expect(state.player.ammo).toBe(profile.ammoGranted)
    expect(state.money).toBe(0)
    expect(readZombieEscapeAudioEventKinds(state)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.weaponPurchased,
    ])

    input.interactPressed = false
    input.fire = true
    setZombieEscapeGamePhase(state, 'night')
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.shots.damage[state.lastShotSlot]).toBe(profile.projectileDamage)
    expect(state.player.ammo).toBe(profile.ammoGranted - 1)
  })

  test('keeps an unaffordable pickup unchanged apart from prompt feedback', () => {
    const arena = createZombieEscapeArena(530)
    const state = createZombieEscapeSimulation(arena, 930)
    const weaponIndex = 1
    const pickup = ZOMBIE_ESCAPE_WEAPON_PICKUPS[weaponIndex]!
    state.player.x = pickup.x
    state.player.z = pickup.z
    state.money = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!.purchaseCost - 1
    const input = createZombieEscapeControlState()
    input.interactPressed = true
    const before = {
      ammo: state.player.ammo,
      money: state.money,
      purchased: [...state.purchasedWeapons],
      weaponIndex: state.player.weaponIndex,
    }

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect({
      ammo: state.player.ammo,
      money: state.money,
      purchased: [...state.purchasedWeapons],
      weaponIndex: state.player.weaponIndex,
    }).toEqual(before)
    expect(state.purchaseFeedback).toBe('insufficient-funds')
    expect(readZombieEscapeAudioEventKinds(state)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.purchaseDenied,
    ])
    expect(createZombieEscapeHudSnapshot(state).pickupPrompt).toMatchObject({
      affordable: false,
      weaponIndex,
    })
  })

  test('rejects pickup interaction from an upstairs floor at the same XZ position', () => {
    const arena = createZombieEscapeArena(537)
    const state = createZombieEscapeSimulation(arena, 937)
    const weaponIndex = 1
    const pickup = state.weaponPickups.find((candidate) => candidate.weaponIndex === weaponIndex)
    expect(pickup).toBeDefined()
    if (!pickup) return
    state.player.x = pickup.x
    state.player.y = pickup.y + 3
    state.player.z = pickup.z
    state.money = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!.purchaseCost
    const input = createZombieEscapeControlState()
    input.interactPressed = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.player.weaponIndex).toBe(0)
    expect(state.purchasedWeapons[weaponIndex]).toBe(0)
    expect(state.money).toBe(ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!.purchaseCost)
    expect(createZombieEscapeHudSnapshot(state).pickupPrompt).toBeNull()
  })

  test('keeps the standalone boundary clamp while external pose can buy beyond play radius', () => {
    const arena = createZombieEscapeArena(538)
    arena.obstacleCount = 0
    const weaponIndex = 1
    const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!
    const pickup = {
      scopeId: 'building:beyond-inscribed-radius',
      weaponIndex,
      x: arena.playRadius + 4,
      y: 0,
      z: 0,
    } as const
    const standalone = createZombieEscapeSimulation(arena, 938, [pickup])
    const external = createZombieEscapeSimulation(arena, 938, [pickup])
    setZombieEscapeExternalPlayerPose(external, true)
    for (const state of [standalone, external]) {
      state.player.x = pickup.x
      state.player.y = pickup.y
      state.player.z = pickup.z
      state.money = profile.purchaseCost
    }
    const standaloneInput = createZombieEscapeControlState()
    standaloneInput.interactPressed = true
    const externalInput = createZombieEscapeControlState()
    externalInput.interactPressed = true

    stepZombieEscapeSimulation(standalone, standaloneInput, 1 / 60, arena)
    stepZombieEscapeSimulation(external, externalInput, 1 / 60, arena)

    expect(Math.hypot(standalone.player.x, standalone.player.z)).toBeCloseTo(
      arena.playRadius - ZOMBIE_ESCAPE_SIMULATION.playerRadius,
      6,
    )
    expect(standalone.player.weaponIndex).toBe(0)
    expect(standalone.money).toBe(profile.purchaseCost)
    expect(external.player.x).toBe(pickup.x)
    expect(external.player.weaponIndex).toBe(weaponIndex)
    expect(external.money).toBe(0)
  })

  test('starts with a free pistol and exactly 15 finite rounds on night one', () => {
    const arena = createZombieEscapeArena(531)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 931)
    const input = createZombieEscapeControlState()
    input.fire = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.phase).toBe('build')
    expect(state.shotsFired).toBe(0)
    expect(state.player.weaponIndex).toBe(0)
    expect(state.player.ammo).toBe(15)
    expect(state.purchasedWeapons[0]).toBe(1)

    setZombieEscapeGamePhase(state, 'night')
    for (let frame = 0; frame < 600; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.shotsFired).toBe(15)
    expect(state.player.ammo).toBe(0)
  })

  test('awards money exactly once for a lethal zombie hit', () => {
    const arena = createZombieEscapeArena(532)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 932)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 1)
    state.zombies.speedScale[zombie] = 0
    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true

    for (let frame = 0; frame < 15; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.kills).toBe(1)
    expect(state.money).toBe(ZOMBIE_ESCAPE_SIMULATION.killReward)
  })

  test('prices every paid weapon at five and funds one after the first kill', () => {
    const arena = createZombieEscapeArena(534)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 934)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const carbineProfile = ZOMBIE_ESCAPE_WEAPON_PROFILES[1]!
    const carbinePickup = ZOMBIE_ESCAPE_WEAPON_PICKUPS[1]!
    expect(carbineProfile.purchaseCost).toBe(5)
    expect(
      ZOMBIE_ESCAPE_WEAPON_PROFILES.slice(1).every(({ purchaseCost }) => purchaseCost === 5),
    ).toBe(true)

    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 1)
    state.zombies.speedScale[zombie] = 0

    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true
    for (let frame = 0; frame < 30 && state.kills < 1; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.kills).toBe(1)
    expect(state.player.ammo).toBe(14)
    expect(state.money).toBe(ZOMBIE_ESCAPE_SIMULATION.killReward)

    input.fire = false
    input.interactPressed = true
    state.player.x = carbinePickup.x
    state.player.z = carbinePickup.z
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.player.weaponIndex).toBe(1)
    expect(state.player.ammo).toBe(carbineProfile.ammoGranted)
    expect(state.money).toBe(ZOMBIE_ESCAPE_SIMULATION.killReward - carbineProfile.purchaseCost)
  })

  test('starts a later night with one finite pistol loadout when the equipped weapon is empty', () => {
    const arena = createZombieEscapeArena(535)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 935)
    setZombieEscapeGamePhase(state, 'night')
    setZombieEscapeGamePhase(state, 'build')
    state.player.weaponIndex = 1
    state.player.ammo = 0
    state.money = 37

    setZombieEscapeGamePhase(state, 'night')

    expect(state.night).toBe(2)
    expect(state.player.weaponIndex).toBe(0)
    expect(state.player.ammo).toBe(ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted)
    expect(state.money).toBe(37)

    state.waveState = 'escape'
    state.waveSpawnRemaining = 0
    const shotsBefore = state.shotsFired
    const input = createZombieEscapeControlState()
    input.fire = true
    for (let frame = 0; frame < 600; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.shotsFired - shotsBefore).toBe(ZOMBIE_ESCAPE_WEAPON_PROFILES[0].ammoGranted)
    expect(state.player.ammo).toBe(0)
  })

  test('makes paid pickups purchasable again each build without resetting money', () => {
    const arena = createZombieEscapeArena(536)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 936)
    const weaponIndex = 1
    const pickup = ZOMBIE_ESCAPE_WEAPON_PICKUPS[weaponIndex]!
    const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!
    state.player.x = pickup.x
    state.player.z = pickup.z
    state.money = profile.purchaseCost * 2 + 7
    const input = createZombieEscapeControlState()
    input.interactPressed = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.purchasedWeapons[weaponIndex]).toBe(1)
    expect(state.money).toBe(profile.purchaseCost + 7)

    setZombieEscapeGamePhase(state, 'night')
    const moneyBeforeNextBuild = state.money
    setZombieEscapeGamePhase(state, 'build')

    expect(state.money).toBe(moneyBeforeNextBuild)
    expect(state.purchasedWeapons[0]).toBe(1)
    expect(state.purchasedWeapons[weaponIndex]).toBe(0)
    expect(createZombieEscapeHudSnapshot(state).pickupPrompt).toMatchObject({
      affordable: true,
      weaponIndex,
    })

    input.interactPressed = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    expect(state.purchasedWeapons[weaponIndex]).toBe(1)
    expect(state.player.weaponIndex).toBe(weaponIndex)
    expect(state.player.ammo).toBe(profile.ammoGranted)
    expect(state.money).toBe(7)
  })

  test('cycles build and night at 60 and 180 seconds while build suppresses threats', () => {
    const arena = createZombieEscapeArena(533)
    const state = createZombieEscapeSimulation(arena, 933)
    const input = createZombieEscapeControlState()
    input.fire = true
    state.phaseSecondsRemaining = 1 / 60

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.phase).toBe('night')
    expect(state.night).toBe(1)
    expect(state.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds)

    state.phaseSecondsRemaining = 1 / 60
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.phase).toBe('build')
    expect(state.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.shots.pool.activeCount).toBe(0)
  })
})

function readZombieEscapeAudioEventKinds(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  afterSequence = 0,
) {
  const kinds: ZombieEscapeAudioEventKind[] = []
  visitZombieEscapeAudioEventsAfter(state.audioEvents, afterSequence, (events, slot) => {
    const kind = events.kind[slot] as ZombieEscapeAudioEventKind
    kinds.push(kind)
  })
  return kinds
}
