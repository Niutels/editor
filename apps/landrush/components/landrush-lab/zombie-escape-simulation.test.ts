import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  LevelNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
} from '@pascal-app/core'
import { createLandrushZombieEscapeCollisionWorldsResolver } from './landrush-island-ai-navigation-semantics'
import {
  visitZombieEscapeAudioEventsAfter,
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventKind,
} from './zombie-escape-audio-events'
import { createZombieEscapeCollisionWorld } from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCatalogEntry,
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_WEAPON_PICKUPS,
  ZOMBIE_ESCAPE_WEAPON_PROFILES,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import { shouldRenderZombieEscapeTracer } from './zombie-escape-effects'
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
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_ZOMBIE_GAIT } from './zombie-escape-zombie-roster'

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
    expect([...second.zombies.y]).toEqual([...first.zombies.y])
    expect([...second.zombies.navigationConnector]).toEqual([...first.zombies.navigationConnector])
    expect([...second.shots.x]).toEqual([...first.shots.x])
    expect([...second.shots.y]).toEqual([...first.shots.y])
    expect([...second.shots.phase]).toEqual([...first.shots.phase])
    expect([...second.zombies.hitReaction]).toEqual([...first.zombies.hitReaction])
    expect([...second.zombies.heading]).toEqual([...first.zombies.heading])
    expect([...second.zombies.intent]).toEqual([...first.zombies.intent])
    expect([...second.zombies.attackFocusX]).toEqual([...first.zombies.attackFocusX])
    expect([...second.zombies.attackFocusZ]).toEqual([...first.zombies.attackFocusZ])
    expect(second.zombies.attackTargetObjectId).toEqual(first.zombies.attackTargetObjectId)
    expect([...second.audioEvents.kind]).toEqual([...first.audioEvents.kind])
    expect([...second.audioEvents.sequence]).toEqual([...first.audioEvents.sequence])
  })

  test('starts night one with twice the original first-wave population', () => {
    const arena = createZombieEscapeArena(12_345)
    const state = createZombieEscapeSimulation(arena, 98_760)

    setZombieEscapeGamePhase(state, 'night')

    expect(state.wave).toBe(1)
    expect(state.waveSpawnRemaining).toBe(14)
    expect(state.replacementSpawnRemaining).toBe(0)
    expect(createZombieEscapeHudSnapshot(state).waveRemaining).toBe(14)
  })

  test('keeps roster runners running until their first damaging hit downgrades them', () => {
    const arena = createZombieEscapeArena(12_347)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 98_762)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.z = 0
    state.gaitByPoolSlot[0] = ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner
    const zombie = spawnZombieEscapeZombie(state, 0, -2, 120)
    state.zombies.speedScale[zombie] = 0
    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1

    for (let frame = 0; frame < 30; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.gait[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner)
    expect(state.zombies.runBlend[zombie]).toBeCloseTo(1, 5)

    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false
    for (let frame = 0; frame < 10; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBeLessThan(120)
    expect(state.zombies.gait[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.walker)
    expect(state.zombies.runBlend[zombie]).toBeLessThan(1)
  })

  test('releases each corpse once and deterministically replaces it outside the player exclusion radius', () => {
    const arena = createZombieEscapeArena(12_346)
    arena.obstacleCount = 0
    const first = createZombieEscapeSimulation(arena, 98_761)
    const second = createZombieEscapeSimulation(arena, 98_761)
    const input = createZombieEscapeControlState()

    for (const state of [first, second]) {
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      state.waveSpawnTimerSeconds = 0
      state.player.x = 0
      state.player.z = 0
      const corpse = spawnZombieEscapeZombie(state, 1, 0, 1)
      state.zombies.health[corpse] = 0
      state.zombies.deathPresentationSeconds[corpse] = 0.001
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(first.zombies.pool.activeCount).toBe(1)
    expect(first.replacementSpawnRemaining).toBe(0)
    expect(createZombieEscapeHudSnapshot(first).waveRemaining).toBe(1)
    const firstReplacement = first.zombies.pool.active.findIndex((active) => active !== 0)
    const secondReplacement = second.zombies.pool.active.findIndex((active) => active !== 0)
    expect(firstReplacement).toBeGreaterThanOrEqual(0)
    expect(secondReplacement).toBe(firstReplacement)
    expect(first.zombies.variant[firstReplacement]).toBe(first.variantByPoolSlot[firstReplacement])
    expect(second.zombies.variant[secondReplacement]).toBe(
      second.variantByPoolSlot[secondReplacement],
    )
    expect(first.zombies.pool.generation[firstReplacement]).toBe(2)
    expect(second.zombies.pool.generation[secondReplacement]).toBe(2)
    expect(first.zombies.x[firstReplacement]).toBe(second.zombies.x[secondReplacement])
    expect(first.zombies.z[firstReplacement]).toBe(second.zombies.z[secondReplacement])
    expect(
      Math.hypot(first.zombies.x[firstReplacement]!, first.zombies.z[firstReplacement]!),
    ).toBeGreaterThanOrEqual(ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS)

    for (let frame = 0; frame < 60; frame += 1) {
      stepZombieEscapeSimulation(first, input, 1 / 60, arena)
      stepZombieEscapeSimulation(second, input, 1 / 60, arena)
    }
    expect(first.zombies.pool.activeCount).toBe(1)
    expect(first.zombies.pool.generation[firstReplacement]).toBe(2)
    expect(second.zombies.pool.generation[secondReplacement]).toBe(2)
    expect(first.replacementSpawnRemaining).toBe(0)
    expect(second.replacementSpawnRemaining).toBe(0)

    first.zombies.health[firstReplacement] = 0
    first.zombies.deathPresentationSeconds[firstReplacement] = 1
    setZombieEscapeGamePhase(first, 'build')
    stepZombieEscapeSimulation(first, input, 1 / 60, arena)
    expect(first.zombies.pool.activeCount).toBe(0)
    expect(first.replacementSpawnRemaining).toBe(0)
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

  test('moves a zombie through the parcel-02 stair connector using navigation collision', () => {
    const building = BuildingNode.parse({
      children: ['level_parcel_02_ground'],
      id: 'building_parcel_02',
    })
    const level = LevelNode.parse({
      children: ['stair_main', 'slab_parcel_02_upper'],
      id: 'level_parcel_02_ground',
      level: 0,
      parentId: building.id,
    })
    const segment = StairSegmentNode.parse({
      id: 'sseg_main',
      parentId: 'stair_main',
    })
    const stair = StairNode.parse({
      children: [segment.id],
      id: 'stair_main',
      parentId: level.id,
      position: [4.25, 0, -7.5],
      rotation: Math.PI / 2,
    })
    const upperSlab = SlabNode.parse({
      elevation: segment.height,
      id: 'slab_parcel_02_upper',
      parentId: level.id,
      polygon: [
        [1, -12],
        [12, -12],
        [12, -3],
        [1, -3],
      ],
    })
    const nodes = Object.fromEntries(
      [building, level, stair, segment, upperSlab].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const arena = createZombieEscapeArena(42)
    arena.obstacleCount = 0
    const worlds = createLandrushZombieEscapeCollisionWorldsResolver()({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      nodes,
      playRadius: arena.playRadius,
      spawn: { x: 0, z: 0 },
    })
    const stairBoxes = worlds.combat.boxes.filter(({ objectId }) => objectId === stair.id)
    const [connector] = worlds.navigation.navigationConnectors
    const startX = connector!.startX - connector!.directionX * 2
    const startZ = connector!.startZ - connector!.directionZ * 2
    const targetX = connector!.endX + connector!.directionX * 4
    const targetZ = connector!.endZ + connector!.directionZ * 4

    expect(stairBoxes.length).toBeGreaterThan(1)
    expect(worlds.navigation.navigationConnectors).toHaveLength(1)
    expect(worlds.navigation.boxes.some(({ objectId }) => objectId === stair.id)).toBe(false)

    const state = createZombieEscapeSimulation(arena, 82)
    setZombieEscapeCollisionWorld(state, worlds.navigation, worlds.combat)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = targetX
    state.player.y = connector!.endY
    state.player.z = targetZ
    const zombie = spawnZombieEscapeZombie(state, startX, startZ)
    const input = createZombieEscapeControlState()
    let previousProgress = 0
    let previousElevation = state.zombies.y[zombie]!
    let largestBacktrack = 0
    let crossedStair = false

    for (let frame = 0; frame < 720; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      const progress =
        (state.zombies.x[zombie]! - startX) * connector!.directionX +
        (state.zombies.z[zombie]! - startZ) * connector!.directionZ
      largestBacktrack = Math.max(largestBacktrack, previousProgress - progress)
      previousProgress = progress
      expect(state.zombies.y[zombie]!).toBeGreaterThanOrEqual(previousElevation - 0.001)
      previousElevation = state.zombies.y[zombie]!
      if (progress > connector!.length + 2.5) {
        crossedStair = true
        break
      }
    }

    expect(crossedStair).toBe(true)
    expect(largestBacktrack).toBeLessThan(0.02)
    expect(state.zombies.y[zombie]).toBeCloseTo(connector!.endY, 5)
    expect(state.zombies.navigationConnector[zombie]).toBe(-1)
    expect(state.zombies.attackTargetObjectId[zombie]).toBeNull()

    state.player.x = startX - connector!.directionX * 2
    state.player.y = connector!.startY
    state.player.z = startZ - connector!.directionZ * 2
    state.zombies.vx[zombie] = 0
    state.zombies.vz[zombie] = 0
    previousProgress =
      (state.zombies.x[zombie]! - startX) * connector!.directionX +
      (state.zombies.z[zombie]! - startZ) * connector!.directionZ
    let previousY = state.zombies.y[zombie]!
    let largestForwardSlip = 0
    let descendedStair = false
    for (let frame = 0; frame < 720; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      const progress =
        (state.zombies.x[zombie]! - startX) * connector!.directionX +
        (state.zombies.z[zombie]! - startZ) * connector!.directionZ
      largestForwardSlip = Math.max(largestForwardSlip, progress - previousProgress)
      previousProgress = progress
      expect(state.zombies.y[zombie]!).toBeLessThanOrEqual(previousY + 0.001)
      previousY = state.zombies.y[zombie]!
      if (progress < -0.25) {
        descendedStair = true
        break
      }
    }
    expect(descendedStair).toBe(true)
    expect(largestForwardSlip).toBeLessThan(0.02)
    expect(state.zombies.y[zombie]).toBeCloseTo(connector!.startY, 5)
    expect(state.zombies.navigationConnector[zombie]).toBe(-1)
  })

  test('attacks immediate furniture despite a reachable route, removes it after two hits, and restores it on build and reset', () => {
    const arena = createZombieEscapeArena(410)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 810)
    const furniture = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 1.2,
          halfWidth: 0.35,
          id: 'table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          objectId: 'table',
          rotation: 0,
        },
      ],
      playRadius: arena.playRadius,
    })
    setZombieEscapeCollisionWorld(state, furniture)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -1.5, 0)
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()

    for (let frame = 0; frame < 180 && !state.obstacleHitCounts.has('table'); frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationSampleScratch.reachable).toBe(true)
    expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle)
    expect(state.zombies.attackTargetObjectId[zombie]).toBe('table')
    expect(state.zombies.vx[zombie]).toBe(0)
    expect(state.zombies.vz[zombie]).toBe(0)
    expect(state.obstacleHitCounts.get('table')).toBe(1)
    expect(state.destroyedObstacleIds.has('table')).toBe(false)
    expect(state.collisionWorld.boxes).toHaveLength(1)

    const heldFocusX = state.zombies.attackFocusX[zombie]!
    const heldFocusZ = state.zombies.attackFocusZ[zombie]!
    state.player.x = -4
    state.player.z = 4
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.navigationHitScratch.colliderKind).toBe('none')
    expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle)
    expect(state.zombies.attackTargetObjectId[zombie]).toBe('table')
    expect(state.zombies.attackFocusX[zombie]).toBe(heldFocusX)
    expect(state.zombies.attackFocusZ[zombie]).toBe(heldFocusZ)

    for (let frame = 0; frame < 180 && !state.destroyedObstacleIds.has('table'); frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.destroyedObstacleIds.has('table')).toBe(true)
    expect(state.obstacleHitCounts.has('table')).toBe(false)
    expect(state.collisionSourceWorld.boxes).toHaveLength(1)
    expect(state.collisionWorld.boxes).toHaveLength(0)
    expect(state.obstacleRevision).toBe(1)

    const destroyedCollisionGeneration = state.collisionWorldGeneration
    setZombieEscapeGamePhase(state, 'build')
    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.collisionWorld.boxes).toHaveLength(1)
    expect(state.obstacleRevision).toBe(2)
    expect(state.collisionWorldGeneration).toBeGreaterThan(destroyedCollisionGeneration)

    state.obstacleHitCounts.set('table', 1)
    resetZombieEscapeSimulation(state, arena)
    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.obstacleRevision).toBe(3)
  })

  test('holds and faces an unbreakable wall without damage or rapid heading oscillation', () => {
    const arena = createZombieEscapeArena(411)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 811)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            breakable: false,
            endX: 0,
            endZ: arena.playRadius,
            halfThickness: 0.09,
            id: 'house-wall:piece-0',
            objectId: 'house-wall',
            startX: 0,
            startZ: -arena.playRadius,
          },
        ],
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -0.55, 0)
    state.zombies.heading[zombie] = -Math.PI / 2
    state.zombies.vx[zombie] = 3
    const input = createZombieEscapeControlState()
    let previousHeading = state.zombies.heading[zombie]!

    for (let frame = 0; frame < 180; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      const heading = state.zombies.heading[zombie]!
      expect(Math.abs(normalizeAngle(heading - previousHeading))).toBeLessThanOrEqual(
        ZOMBIE_ESCAPE_SIMULATION.zombieTurnSpeedRadiansPerSecond / 60 + 0.000_001,
      )
      previousHeading = heading
    }

    expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.blocked)
    expect(state.zombies.vx[zombie]).toBe(0)
    expect(state.zombies.vz[zombie]).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.collisionWorld.segments).toHaveLength(1)
    expect(state.zombies.heading[zombie]).toBeCloseTo(Math.PI / 2, 5)
  })

  test('publishes a destroyed closed-door id and restores the door collider on build entry', () => {
    const arena = createZombieEscapeArena(4_112)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 8_112)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            breakable: true,
            endX: 0,
            endZ: 0.5,
            halfThickness: 0.09,
            id: 'front-door:solid:0:0',
            objectId: 'front-door',
            startX: 0,
            startZ: -0.5,
          },
        ],
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, -0.55, 0)
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()

    for (let frame = 0; frame < 180 && !state.destroyedObstacleIds.has('front-door'); frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.destroyedObstacleIds.has('front-door')).toBe(true)
    expect(state.obstacleRevision).toBe(1)
    expect(state.collisionSourceWorld.segments).toHaveLength(1)
    expect(state.collisionWorld.segments).toHaveLength(0)

    setZombieEscapeGamePhase(state, 'build')

    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.obstacleRevision).toBe(2)
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
    state.waveState = 'escape'
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

  test('keeps the final traveled tracer segment alive through a sub-frame indoor impact', () => {
    const arena = createZombieEscapeArena(511)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 911)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            endX: 2,
            endZ: -0.3,
            halfThickness: 0.04,
            id: 'indoor-wall',
            startX: -2,
            startZ: -0.3,
          },
        ],
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: 0,
      y: 1.05,
      z: 0,
    })
    const input = createZombieEscapeControlState()
    input.fire = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const shot = state.lastShotSlot
    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.impact)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment)
    expect(state.shots.pool.active[shot]).toBe(1)
    expect(state.shots.previousZ[shot]).toBeCloseTo(0, 6)
    expect(state.shots.z[shot]).toBeLessThan(-0.1)
    const finalSegment = {
      previousX: state.shots.previousX[shot],
      previousY: state.shots.previousY[shot],
      previousZ: state.shots.previousZ[shot],
      x: state.shots.x[shot],
      y: state.shots.y[shot],
      z: state.shots.z[shot],
    }
    input.fire = false

    for (let frame = 0; frame < 5; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.impact)
    expect(state.shots.pool.active[shot]).toBe(1)
    expect({
      previousX: state.shots.previousX[shot],
      previousY: state.shots.previousY[shot],
      previousZ: state.shots.previousZ[shot],
      x: state.shots.x[shot],
      y: state.shots.y[shot],
      z: state.shots.z[shot],
    }).toEqual(finalSegment)
  })

  test('sweeps from the player anchor and resolves an obstructed muzzle as an immediate impact', () => {
    const arena = createZombieEscapeArena(5_113)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9_113)
    state.player.x = 0
    state.player.z = 0
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        playRadius: arena.playRadius,
        segments: [
          {
            endX: 1,
            endZ: -0.25,
            halfThickness: 0.04,
            id: 'muzzle-obstruction',
            startX: -1,
            startZ: -0.25,
          },
        ],
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: 0,
      y: ZOMBIE_ESCAPE_SIMULATION.defaultMuzzleHeight,
      z: -0.55,
    })
    const input = createZombieEscapeControlState()
    input.fire = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const shot = state.lastShotSlot
    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.impact)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment)
    expect(state.shots.originZ[shot]).toBeCloseTo(0, 6)
    expect(state.shots.previousZ[shot]).toBeCloseTo(0, 6)
    expect(state.shots.z[shot]).toBeLessThan(0)
    expect(state.shots.z[shot]).toBeGreaterThan(-0.55)
    expect(state.shots.hitZ[shot]).toBeCloseTo(-0.21, 5)
    expect(readZombieEscapeAudioEventKinds(state)).toEqual([
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
      ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
    ])
  })

  test('uses upper-floor combat geometry without adding it to the ground navigation world', () => {
    const arena = createZombieEscapeArena(512)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 912)
    const navigationWorld = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      playRadius: arena.playRadius,
    })
    const combatWorld = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      cellSize: arena.playRadius * 2,
      playRadius: arena.playRadius,
      segments: [
        {
          endX: 2,
          endZ: -0.3,
          halfThickness: 0.04,
          id: 'upper-floor-wall',
          maximumY: 5,
          minimumY: 3,
          startX: -2,
          startZ: -0.3,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, navigationWorld, combatWorld)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: 0,
      y: 3.5,
      z: 0,
    })
    const input = createZombieEscapeControlState()
    input.fire = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)

    const shot = state.lastShotSlot
    expect(state.collisionWorld).toBe(navigationWorld)
    expect(state.navigationField.world.semanticKey).toBe(navigationWorld.semanticKey)
    expect(state.navigationField.world.segments).toHaveLength(0)
    expect(state.combatCollisionWorld.segments).toHaveLength(1)
    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.impact)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment)
    expect(state.shots.hitY[shot]).toBeCloseTo(3.5, 5)
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

  test('uses a supported stair elevation for zombie presentation and projectile capsules', () => {
    const arena = createZombieEscapeArena(542)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 942)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        navigationSupports: [
          {
            elevation: 2.5,
            id: 'stair-upper-landing',
            polygon: [
              { x: state.player.x - 2, z: state.player.z - 5 },
              { x: state.player.x + 2, z: state.player.z - 5 },
              { x: state.player.x + 2, z: state.player.z + 2 },
              { x: state.player.x - 2, z: state.player.z + 2 },
            ],
          },
        ],
        playRadius: arena.playRadius,
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 120)
    state.zombies.speedScale[zombie] = 0
    state.zombies.y[zombie] = 2.5
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: state.player.x,
      y: 3.5,
      z: state.player.z,
    })
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false
    for (let frame = 0; frame < 10; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBeLessThan(120)
    expect(state.shots.impactKind[state.lastShotSlot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy)
    expect(state.shots.hitY[state.lastShotSlot]).toBeGreaterThan(2.5)
  })

  test('lets weapon-height projectiles pass over furniture below the shot altitude', () => {
    const arena = createZombieEscapeArena(5410)
    arena.obstacleCount = 0
    const low = createZombieEscapeSimulation(arena, 9410)
    const high = createZombieEscapeSimulation(arena, 9410)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: -1,
          halfDepth: 0.1,
          halfWidth: 2,
          id: 'low-table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          objectId: 'low-table',
          rotation: 0,
        },
      ],
      playRadius: arena.playRadius,
    })
    for (const [state, y] of [
      [low, 0.6],
      [high, 1.05],
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

  test('damages a zombie behind low furniture and retains the visible final tracer segment', () => {
    const arena = createZombieEscapeArena(5412)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9412)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: -1,
          halfDepth: 0.1,
          halfWidth: 2,
          id: 'low-table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          objectId: 'low-table',
          rotation: 0,
        },
      ],
      playRadius: arena.playRadius,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, 0, -2.2, 120)
    state.zombies.speedScale[zombie] = 0
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: 0,
      y: 1.05,
      z: 0,
    })
    const input = createZombieEscapeControlState()
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false
    const shot = state.lastShotSlot

    for (
      let frame = 0;
      frame < 10 && state.shots.phase[shot] === ZOMBIE_ESCAPE_SHOT_PHASE.travel;
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBeLessThan(120)
    expect(state.shots.phase[shot]).toBe(ZOMBIE_ESCAPE_SHOT_PHASE.impact)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy)
    expect(state.shots.hitTargetSlot[shot]).toBe(zombie)
    expect(state.shots.hitTargetGeneration[shot]).toBe(state.zombies.pool.generation[zombie])
    expect(
      Math.hypot(
        state.shots.x[shot]! - state.shots.previousX[shot]!,
        state.shots.y[shot]! - state.shots.previousY[shot]!,
        state.shots.z[shot]! - state.shots.previousZ[shot]!,
      ),
    ).toBeGreaterThan(0)
    expect(
      shouldRenderZombieEscapeTracer(state.shots.phase[shot]!, state.shots.impactKind[shot]!),
    ).toBe(true)
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
    state.waveState = 'escape'
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
    expect(state.player.ammo).toBe(60)
  })

  test('publishes player hurt and death once and preserves a lethal cue across reset', () => {
    const arena = createZombieEscapeArena(521)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 921)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 0.7, 120)
    const attackX = state.zombies.x[zombie]!
    const attackZ = state.zombies.z[zombie]!
    state.zombies.vx[zombie] = 3
    state.zombies.vz[zombie] = 2
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.player.health).toBe(92)
    expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer)
    expect(state.zombies.x[zombie]).toBe(attackX)
    expect(state.zombies.z[zombie]).toBe(attackZ)
    expect(state.zombies.vx[zombie]).toBe(0)
    expect(state.zombies.vz[zombie]).toBe(0)
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

  test('uses the four-times ammo balance for every weapon profile', () => {
    expect(ZOMBIE_ESCAPE_WEAPON_PROFILES.map(({ ammoGranted }) => ammoGranted)).toEqual([
      60, 168, 72, 256, 40,
    ])
  })

  test('starts with a free pistol and exactly 60 finite rounds on night one', () => {
    const arena = createZombieEscapeArena(531)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 931)
    const input = createZombieEscapeControlState()
    input.fire = true

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.phase).toBe('build')
    expect(state.shotsFired).toBe(0)
    expect(state.player.weaponIndex).toBe(0)
    expect(state.player.ammo).toBe(60)
    expect(state.purchasedWeapons[0]).toBe(1)

    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    const pistolProfile = ZOMBIE_ESCAPE_WEAPON_PROFILES[0]
    const framesToEmpty =
      Math.ceil(pistolProfile.ammoGranted * pistolProfile.shotIntervalSeconds * 60) + 1
    for (let frame = 0; frame < framesToEmpty; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.shotsFired).toBe(60)
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
    expect(state.player.ammo).toBe(59)
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
    const pistolProfile = ZOMBIE_ESCAPE_WEAPON_PROFILES[0]
    const framesToEmpty =
      Math.ceil(pistolProfile.ammoGranted * pistolProfile.shotIntervalSeconds * 60) + 1
    for (let frame = 0; frame < framesToEmpty; frame += 1) {
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

  test('cycles through an explicit 60-second day and 180-second night while day suppresses threats', () => {
    const arena = createZombieEscapeArena(533)
    const state = createZombieEscapeSimulation(arena, 933)
    const input = createZombieEscapeControlState()
    input.fire = true
    expect(ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds).toBe(60)
    expect(ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds).toBe(180)
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

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2
  return ((((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
}
