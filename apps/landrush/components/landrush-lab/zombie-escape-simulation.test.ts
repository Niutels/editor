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
import {
  clearZombieEscapeSparseFlowSearchRouteCorridor,
  createZombieEscapeCollisionWorld,
  createZombieEscapeSparseCommittedNodeRoute,
  createZombieEscapeSparseSpawnAnchor,
  getZombieEscapeSparseFlowSearchRouteGeneration,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  inspectZombieEscapeSparseReverseFieldBanks,
  sampleZombieEscapeSparseSpawnAnchor,
  zombieEscapeSameLayerNavigationSegmentIsClear,
  zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease,
} from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCatalogEntry,
  getZombieEscapeZombieCollisionRadiusMeters,
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
  inspectZombieEscapeCommittedNavigationAction,
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
import {
  resolveZombieEscapeProjectileSlowdownMultiplier,
  ZOMBIE_ESCAPE_ZOMBIE_GAIT,
} from './zombie-escape-zombie-roster'

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
    expect([...second.zombies.spawnOrdinal]).toEqual([...first.zombies.spawnOrdinal])
    expect([...second.zombies.projectileHitOrdinal]).toEqual([
      ...first.zombies.projectileHitOrdinal,
    ])
    expect([...second.zombies.speedScale]).toEqual([...first.zombies.speedScale])
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

  test('uses one validated zombie capacity for every capacity-dependent simulation store', () => {
    const arena = createZombieEscapeArena(12_349)
    const defaultState = createZombieEscapeSimulation(arena, 98_764)
    const zombieCapacity = 257
    const state = createZombieEscapeSimulation(arena, 98_764, undefined, { zombieCapacity })

    expect(defaultState.zombies.pool.capacity).toBe(ZOMBIE_ESCAPE_CAPACITY.zombies)
    expect(state.zombies.pool.capacity).toBe(zombieCapacity)
    expect(state.zombies.pool.active).toHaveLength(zombieCapacity)
    expect(state.zombies.pool.generation).toHaveLength(zombieCapacity)
    expect(state.agentSpatialIndex.capacity).toBe(zombieCapacity)
    expect(state.agentSpatialIndex.agentCellTableSlots).toHaveLength(zombieCapacity)
    expect(state.agentSpatialIndex.agentLayerKeys).toHaveLength(zombieCapacity)
    expect(state.agentSpatialIndex.cellOccupants).toHaveLength(zombieCapacity)
    expect(state.navigationIntentResolveEligible).toHaveLength(zombieCapacity)
    expect(state.navigationIntentResolveScheduled).toHaveLength(zombieCapacity)
    expect(state.variantByPoolSlot).toHaveLength(zombieCapacity)
    for (const [name, storage] of Object.entries(state.zombies)) {
      if (name === 'pool') continue
      expect([name, (storage as ArrayLike<unknown>).length]).toEqual([name, zombieCapacity])
    }
  })

  test('rejects every explicit zombie capacity outside the supported integer range', () => {
    const arena = createZombieEscapeArena(12_350)
    for (const zombieCapacity of [0, -1, 1.5, 32_768, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createZombieEscapeSimulation(arena, 98_765, undefined, { zombieCapacity }),
      ).toThrow(RangeError)
    }
  })

  test('resets a custom-capacity simulation in place without reverting its capacity', () => {
    const arena = createZombieEscapeArena(12_351)
    const zombieCapacity = 257
    const state = createZombieEscapeSimulation(arena, 98_766, undefined, { zombieCapacity })
    const active = state.zombies.pool.active
    const eligible = state.navigationIntentResolveEligible
    const scheduled = state.navigationIntentResolveScheduled
    const variants = state.variantByPoolSlot
    spawnZombieEscapeZombie(state, 1, 1)
    spawnZombieEscapeZombie(state, 2, 2)
    eligible.fill(1)
    scheduled.fill(1)

    resetZombieEscapeSimulation(state, arena)

    expect(state.zombies.pool.capacity).toBe(zombieCapacity)
    expect(state.zombies.pool.active).toBe(active)
    expect(state.navigationIntentResolveEligible).toBe(eligible)
    expect(state.navigationIntentResolveScheduled).toBe(scheduled)
    expect(state.variantByPoolSlot).toBe(variants)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect([...state.zombies.pool.active].every((value) => value === 0)).toBe(true)
    expect([...state.navigationIntentResolveEligible].every((value) => value === 0)).toBe(true)
    expect([...state.navigationIntentResolveScheduled].every((value) => value === 0)).toBe(true)
  })

  test('preserves a high zombie slot in an emitted obstacle-impact audio event', () => {
    const arena = createZombieEscapeArena(12_352)
    arena.obstacleCount = 0
    const zombieCapacity = 257
    const state = createZombieEscapeSimulation(arena, 98_767, undefined, { zombieCapacity })
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boxes: [
          {
            breakable: true,
            centerX: 0,
            centerZ: 0,
            halfDepth: 1.2,
            halfWidth: 0.35,
            id: 'high-slot-table:footprint',
            maximumY: 0.8,
            minimumY: 0,
            objectId: 'high-slot-table',
            rotation: 0,
          },
        ],
        playRadius: arena.playRadius,
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.obstacleDamageEnabled = false
    state.player.x = 1.5
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    for (let index = 0; index < zombieCapacity - 1; index += 1) {
      const slot = spawnZombieEscapeZombie(state, 20, 20)
      state.zombies.health[slot] = 0
      state.zombies.deathPresentationSeconds[slot] = 1_000
    }
    const highSlot = spawnZombieEscapeZombie(state, -0.85, 0)
    state.zombies.attackCooldown[highSlot] = 0
    state.zombies.attackFocusX[highSlot] = 0
    state.zombies.attackFocusZ[highSlot] = 0
    state.zombies.attackTargetObjectId[highSlot] = 'high-slot-table'
    state.zombies.attackTargetObjectOrdinal[highSlot] =
      state.collisionWorld.objectCatalog.objectIds.indexOf('high-slot-table')

    for (let frame = 0; frame < 180 && state.audioEvents.writeSequence === 0; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    let subjectIndex = -1
    visitZombieEscapeAudioEventsAfter(state.audioEvents, 0, (events, slot) => {
      if (events.kind[slot] === ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact) {
        subjectIndex = events.subjectIndex[slot]!
      }
    })
    expect(highSlot).toBe(256)
    expect(state.audioEvents.subjectIndex).toBeInstanceOf(Uint16Array)
    expect(subjectIndex).toBe(highSlot)
  })

  test('schedules the explicit normal-gameplay population independently of pool capacity', () => {
    const arena = createZombieEscapeArena(12_345)
    const state = createZombieEscapeSimulation(arena, 98_760)

    setZombieEscapeGamePhase(state, 'night')

    expect(state.wave).toBe(1)
    expect(state.waveSpawnRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount)
    expect(state.replacementSpawnRemaining).toBe(0)
    expect(createZombieEscapeHudSnapshot(state).waveRemaining).toBe(
      ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount,
    )
    expect(state.zombies.pool.capacity).toBe(ZOMBIE_ESCAPE_CAPACITY.zombies)
  })

  test('admits all fifty production zombies through the fixed spawn budget before its deadline', () => {
    const arena = createZombieEscapeArena(12_345_1)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 98_760_1)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'production-spawn-surface',
          polygon: [
            { x: -25, z: -25 },
            { x: 25, z: -25 },
            { x: 25, z: 25 },
            { x: -25, z: 25 },
          ],
        },
      ],
      playRadius: arena.playRadius,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    state.player.health = 1_000_000
    state.player.x = 0
    state.player.y = 0
    state.player.z = 0
    setZombieEscapeGamePhase(state, 'night')
    const input = createZombieEscapeControlState()
    const deadlineTicks = Math.ceil(
      ZOMBIE_ESCAPE_SIMULATION.initialZombiePopulationAdmissionDeadlineSeconds /
        ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
    )

    for (
      let tick = 0;
      tick < deadlineTicks &&
      state.zombies.pool.activeCount < ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount;
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    }

    const activeSlots = Array.from(state.zombies.pool.active.keys()).filter(
      (slot) => state.zombies.pool.active[slot] !== 0,
    )

    expect(state.collisionWorld.navigationMode).toBe('sparse')
    expect(state.waveSpawnRemaining).toBe(0)
    expect(state.zombies.pool.activeCount).toBe(ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount)
    expect(activeSlots).toHaveLength(ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount)
    expect(activeSlots.every((slot) => state.zombies.navigationIntentValid[slot] !== 0)).toBe(true)
    expect(activeSlots.every((slot) => state.zombies.navigationIntentHasCached[slot] !== 0)).toBe(
      true,
    )
    expect(
      activeSlots.every(
        (slot) =>
          state.zombies.navigationIntentCommittedRouteGeneration[slot] ===
          state.navigationTargetCommittedRouteGeneration,
      ),
    ).toBe(true)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
  })

  test('starts every zombie as a runner and applies one deterministic slowdown on a surviving projectile hit', () => {
    const arena = createZombieEscapeArena(12_347)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 98_762)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, 0, -2, 120)
    const initialSpeedScale = state.zombies.speedScale[zombie]!
    const randomBeforeHit = { ...state.random }
    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1

    for (let frame = 0; frame < 30; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.gait[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner)
    expect(state.zombies.runBlend[zombie]).toBeGreaterThan(0.5)

    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false
    for (let frame = 0; frame < 10; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.health[zombie]).toBeLessThan(120)
    expect(state.zombies.gait[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.walker)
    expect(state.zombies.runBlend[zombie]).toBeLessThan(1)
    expect(state.zombies.projectileHitOrdinal[zombie]).toBe(1)
    expect(state.zombies.speedScale[zombie]).toBeGreaterThanOrEqual(initialSpeedScale * 0.9)
    expect(state.zombies.speedScale[zombie]).toBeLessThanOrEqual(initialSpeedScale * 0.99)
    expect(state.random).toEqual(randomBeforeHit)
  })

  test('applies one stateless multiplicative slowdown for each surviving projectile hit', () => {
    const arena = createZombieEscapeArena(12_348)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 98_763)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 0
    state.player.z = 0
    const zombie = spawnZombieEscapeZombie(state, 0, -3.2, 500)
    state.zombies.speedScale[zombie] = 0.9
    const spawnOrdinal = state.zombies.spawnOrdinal[zombie]!
    const expectedSpeedScale = Math.fround(
      Math.fround(
        0.9 * resolveZombieEscapeProjectileSlowdownMultiplier(state.seed, spawnOrdinal, 0),
      ) * resolveZombieEscapeProjectileSlowdownMultiplier(state.seed, spawnOrdinal, 1),
    )
    const input = createZombieEscapeControlState()
    input.aimX = 0
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true

    for (
      let frame = 0;
      frame < 180 && state.zombies.projectileHitOrdinal[zombie]! < 2;
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.projectileHitOrdinal[zombie]).toBe(2)
    expect(state.zombies.gait[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.walker)
    expect(state.zombies.speedScale[zombie]).toBe(expectedSpeedScale)
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
      state.zombies.gait[corpse] = ZOMBIE_ESCAPE_ZOMBIE_GAIT.walker
      state.zombies.projectileHitOrdinal[corpse] = 7
      state.zombies.speedScale[corpse] = 0.4
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
    expect(first.zombies.gait[firstReplacement]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner)
    expect(second.zombies.gait[secondReplacement]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner)
    expect(first.zombies.spawnOrdinal[firstReplacement]).toBe(1)
    expect(second.zombies.spawnOrdinal[secondReplacement]).toBe(1)
    expect(first.zombies.speedScale[firstReplacement]).toBe(
      second.zombies.speedScale[secondReplacement],
    )
    expect(first.zombies.projectileHitOrdinal[firstReplacement]).toBe(0)
    expect(first.zombies.speedScale[firstReplacement]).toBeGreaterThan(0.4)
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

  test('keeps the smallest zombie inside strict sparse free space while sliding around a wall', () => {
    const arena = createZombieEscapeArena(41)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'ground',
            polygon: [
              { x: -8, z: -8 },
              { x: 8, z: -8 },
              { x: 8, z: 8 },
              { x: -8, z: 8 },
            ],
          },
        ],
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
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -3, 0)
    state.zombies.variant[zombie] = 5
    const zombieCollisionRadius = getZombieEscapeZombieCollisionRadiusMeters(
      state.zombies.variant[zombie]!,
    )
    state.zombies.speedScale[zombie] = 0
    for (
      let frame = 0;
      frame < 512 &&
      (state.zombies.navigationIntentPending[zombie] !== 0 ||
        state.zombies.navigationIntentValid[zombie] === 0);
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.navigationIntentValid[zombie]).toBe(1)
    const fullSearches = state.navigationField.graphAttachmentFullSearchCount
    const route = createZombieEscapeSparseCommittedNodeRoute()
    const anchor = createZombieEscapeSparseSpawnAnchor()
    state.zombies.speedScale[zombie] = 1.55

    for (let frame = 0; frame < 720 && state.zombies.x[zombie]! < 2; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      const x = state.zombies.x[zombie]!
      const z = state.zombies.z[zombie]!
      const closestZ = Math.max(-2.2, Math.min(2.2, z))
      expect(Math.hypot(x, z - closestZ)).toBeGreaterThanOrEqual(
        zombieCollisionRadius + 0.09 - 0.000_01,
      )
      expect(
        sampleZombieEscapeSparseSpawnAnchor(
          state.navigationField,
          x,
          z,
          state.zombies.y[zombie]!,
          route,
          anchor,
        ),
      ).toBe(true)
    }

    expect(state.zombies.x[zombie]).toBeGreaterThan(2)
    expect(state.navigationField.graphAttachmentFullSearchCount).toBe(fullSearches)
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(0)
    expect(state.navigationSparseCollisionReanchorFailedCount).toBe(0)
  })

  test('moves a small zombie through connector clearance narrower than the compiled maximum radius', () => {
    const arena = createZombieEscapeArena(41_001)
    arena.obstacleCount = 0
    const smallRadius = getZombieEscapeZombieCollisionRadiusMeters(5)
    const innerHalfWidth =
      (smallRadius + ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS) * 0.5
    const wallHalfThickness = 0.02
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'narrow-ramp',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 1,
          endX: 2,
          endY: 1,
          endZ: 0,
          halfWidth: innerHalfWidth,
          id: 'narrow-ramp',
          startX: -2,
          startY: 0,
          startZ: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'ground',
          polygon: [
            { x: -6, z: -4 },
            { x: 6, z: -4 },
            { x: 6, z: 4 },
            { x: -6, z: 4 },
          ],
        },
        {
          boundary: true,
          elevation: 1,
          id: 'upper',
          polygon: [
            { x: -6, z: -4 },
            { x: 6, z: -4 },
            { x: 6, z: 4 },
            { x: -6, z: 4 },
          ],
        },
      ],
      playRadius: arena.playRadius,
      segments: [-1, 1].map((side) => ({
        endX: 2.5,
        endZ: side * (innerHalfWidth + wallHalfThickness),
        halfThickness: wallHalfThickness,
        id: `narrow-ramp-wall-${side}`,
        maximumY: 1.5,
        minimumY: 0,
        startX: -2.5,
        startZ: side * (innerHalfWidth + wallHalfThickness),
      })),
    })
    const state = createZombieEscapeSimulation(arena, 81_001)
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = -4
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -4, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.player.x = 4
    state.player.y = 1
    state.zombies.variant[zombie] = 5
    state.zombies.x[zombie] = -2

    expect(innerHalfWidth).toBeGreaterThan(smallRadius)
    expect(innerHalfWidth).toBeLessThan(ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS)
    state.zombies.navigationConnector[zombie] = 0
    state.zombies.navigationConnectorTargetEnd[zombie] = 1
    state.zombies.speedScale[zombie] = 1
    const recoveryDemandsBefore = state.navigationIntentDemandCollisionRecoveryCount

    for (let tick = 0; tick < 240 && state.zombies.x[zombie]! < 1.5; tick += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.x[zombie]).toBeGreaterThanOrEqual(1.5)
    expect(Math.abs(state.zombies.z[zombie]!)).toBeLessThan(0.001)
    expect(state.navigationIntentDemandCollisionRecoveryCount).toBe(recoveryDemandsBefore)

    state.zombies.variant[zombie] = 4
    state.zombies.x[zombie] = -2
    state.zombies.y[zombie] = 0
    state.zombies.z[zombie] = 0
    state.zombies.vx[zombie] = 0
    state.zombies.vz[zombie] = 0
    state.zombies.navigationConnector[zombie] = 0
    state.zombies.navigationConnectorTargetEnd[zombie] = 1
    for (let tick = 0; tick < 60; tick += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.zombies.x[zombie]).toBeLessThan(-1.9)
  })

  test('keeps fifty zombies pursuing a moving live goal around an obstructing wall', () => {
    const arena = createZombieEscapeArena(41_050)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_050)
    const wallEndZ = 6
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'crowd-pursuit-surface',
          polygon: [
            { x: -25, z: -18 },
            { x: 25, z: -18 },
            { x: 25, z: 18 },
            { x: -25, z: 18 },
          ],
        },
      ],
      playRadius: arena.playRadius,
      segments: [
        {
          endX: 0,
          endZ: wallEndZ,
          halfThickness: 0.1,
          id: 'crowd-pursuit-wall',
          startX: 0,
          startZ: -wallEndZ,
        },
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.health = 1_000_000
    const targetCellX = Math.floor(15 / world.cellSize)
    const targetCellZ = Math.floor(0 / world.cellSize)
    const targetCenterX = (targetCellX + 0.5) * world.cellSize
    const targetCenterZ = (targetCellZ + 0.5) * world.cellSize
    const targetMotionRadius = world.cellSize * 0.1
    state.player.x = targetCenterX
    state.player.y = 0
    state.player.z = targetCenterZ
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const slots: number[] = []
    for (let index = 0; index < ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount; index += 1) {
      slots.push(
        spawnZombieEscapeZombie(
          state,
          -17.5 - (index % 5) * 1.15,
          -10 + Math.floor(index / 5) * 2.15,
        ),
      )
    }
    const initialDistances = slots.map((slot) =>
      Math.hypot(state.player.x - state.zombies.x[slot]!, state.player.z - state.zombies.z[slot]!),
    )
    const previousX = Float64Array.from(slots, (slot) => state.zombies.x[slot]!)
    let wallCrossingViolationCount = 0

    for (let tick = 0; tick < 1_800; tick += 1) {
      const elapsed = tick * ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
      state.player.x = targetCenterX + Math.sin(elapsed * 1.7) * targetMotionRadius
      state.player.z = targetCenterZ + Math.cos(elapsed * 1.3) * targetMotionRadius
      stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index]!
        const nextX = state.zombies.x[slot]!
        if (
          previousX[index]! < 0 &&
          nextX >= 0 &&
          Math.abs(state.zombies.z[slot]!) < wallEndZ + state.collisionWorld.agentRadius
        ) {
          wallCrossingViolationCount += 1
        }
        previousX[index] = nextX
      }
    }

    const progressedCount = slots.filter((slot, index) => {
      const finalDistance = Math.hypot(
        state.player.x - state.zombies.x[slot]!,
        state.player.z - state.zombies.z[slot]!,
      )
      return finalDistance <= initialDistances[index]! - 5
    }).length
    expect(state.zombies.pool.activeCount).toBe(ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount)
    expect(progressedCount).toBeGreaterThanOrEqual(45)
    expect(wallCrossingViolationCount).toBe(0)
    expect(state.navigationTargetRequestedRevision).toBeLessThanOrEqual(2)
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
  })

  test('keeps fifty obstructed zombies on the live goal while it runs across route cells and reverses', () => {
    const arena = createZombieEscapeArena(41_051)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 81_051)
    const wallEndZ = 7
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'cross-cell-crowd-pursuit-surface',
          polygon: [
            { x: -30, z: -18 },
            { x: 30, z: -18 },
            { x: 30, z: 18 },
            { x: -30, z: 18 },
          ],
        },
      ],
      playRadius: arena.playRadius,
      segments: [
        {
          endX: 0,
          endZ: wallEndZ,
          halfThickness: 0.1,
          id: 'cross-cell-crowd-pursuit-wall',
          startX: 0,
          startZ: -wallEndZ,
        },
        ...Array.from({ length: 8 }, (_, index) => {
          const column = index % 8
          const row = Math.floor(index / 8)
          const startX = 21.5 + column * 0.85
          const startZ = 11.5 + row * 1.25
          return {
            endX: startX + 0.35,
            endZ: startZ,
            halfThickness: 0.04,
            id: `cross-cell-build-load:${index}`,
            startX,
            startZ,
          }
        }),
      ],
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.health = 1_000_000
    state.player.x = 11
    state.player.y = 0
    state.player.z = -9
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const targetWaypoints = [
      { x: -11, z: -9 },
      { x: -11, z: 9 },
      { x: 11, z: 9 },
      { x: 11, z: -9 },
    ] as const
    let targetWaypointIndex = 0
    const slots: number[] = []
    for (let index = 0; index < ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount; index += 1) {
      slots.push(
        spawnZombieEscapeZombie(state, -22 - (index % 5) * 1.1, -12 + Math.floor(index / 5) * 2.65),
      )
    }
    const initialDistances = slots.map((slot) =>
      Math.hypot(state.player.x - state.zombies.x[slot]!, state.player.z - state.zombies.z[slot]!),
    )
    const previousX = Float64Array.from(slots, (slot) => state.zombies.x[slot]!)
    const previousZ = Float64Array.from(slots, (slot) => state.zombies.z[slot]!)
    let wallCrossingViolationCount = 0
    const recordWallCrossings = () => {
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index]!
        const nextX = state.zombies.x[slot]!
        const nextZ = state.zombies.z[slot]!
        const crossedWallAxis =
          (previousX[index]! < 0 && nextX >= 0) || (previousX[index]! > 0 && nextX <= 0)
        const crossingAmount = crossedWallAxis
          ? -previousX[index]! / (nextX - previousX[index]!)
          : -1
        if (crossingAmount >= 0 && crossingAmount <= 1) {
          const crossingZ = previousZ[index]! + (nextZ - previousZ[index]!) * crossingAmount
          if (Math.abs(crossingZ) < wallEndZ + state.collisionWorld.agentRadius) {
            wallCrossingViolationCount += 1
          }
        }
        previousX[index] = nextX
        previousZ[index] = nextZ
      }
    }
    let warmupTicks = 0
    let warmupArrivedCount = 0
    while (warmupTicks < 1_800 && warmupArrivedCount < 8) {
      stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
      recordWallCrossings()
      warmupArrivedCount = slots.filter(
        (slot) =>
          Math.hypot(
            state.player.x - state.zombies.x[slot]!,
            state.player.z - state.zombies.z[slot]!,
          ) <=
          ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters + 1,
      ).length
      warmupTicks += 1
    }
    let previousTargetCellX = Math.floor(state.player.x / world.cellSize)
    let previousTargetCellZ = Math.floor(state.player.z / world.cellSize)
    let targetCellTransitionCount = 0
    let targetDirectionChangeCount = 0
    let consecutivePendingReplacementTicks = 0
    let maximumConsecutivePendingReplacementTicks = 0
    let maximumFirstServiceLatencyTicks = 0
    const consecutiveWrongWayTicks = new Uint16Array(slots.length)
    const sourceLiveGoalClear = new Uint8Array(slots.length)
    const closestMovingDistances = Float64Array.from(initialDistances)
    let maximumConsecutiveWrongWayTicks = 0
    const reverseFieldBanksBefore = inspectZombieEscapeSparseReverseFieldBanks(
      state.navigationField,
    )
    const publicationCountBefore = reverseFieldBanksBefore.publicationCount
    const publicationBlockedCountBefore = reverseFieldBanksBefore.publicationBlockedCount
    let observedPublicationCount = publicationCountBefore
    const requestedRevisionBefore = state.navigationTargetRequestedRevision
    const navigationIntentPendingCountBefore = state.navigationIntentPendingCount
    const navigationIntentIssuedCountBefore = state.navigationIntentIssuedCount
    const navigationIntentResolvedCountBefore = state.navigationIntentResolvedCount
    const navigationIntentCanceledCountBefore = state.navigationIntentCanceledCount
    const routePublishedRestartsBefore = state.navigationSparseSearchRestartedRoutePublishedCount
    const targetPublicationPreemptionRestartsBefore =
      state.navigationSparseSearchRestartedTargetPublicationPreemptionCount
    const observedDemandSerial = new Uint32Array(slots.length)
    const observedDemandPendingSinceTick = new Uint32Array(slots.length)
    const observedDemandActive = new Uint8Array(slots.length)
    const observedDemandPreemptionTransitions = new Uint8Array(slots.length)
    const previousTargetPreemptionUsed = new Uint8Array(slots.length)
    let observedDemandCount = 0
    let observedDemandCompletionCount = 0
    let observedPreemptedDemandCount = 0
    let observedPreemptionTransitionCount = 0
    let maximumPreemptionTransitionsPerDemand = 0
    let maximumProtectedStagingReaderCount = 0
    let protectedPublicationBlockedTickCount = 0

    let protectedPathStressInjected = false

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]!
      if (state.zombies.navigationIntentPending[slot] !== 0) {
        observedDemandSerial[index] = 1
        observedDemandPendingSinceTick[index] =
          state.zombies.navigationIntentPendingSinceTick[slot]!
        observedDemandActive[index] = 1
        observedDemandCount += 1
        if (state.zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] !== 0) {
          observedDemandPreemptionTransitions[index] = 1
          maximumPreemptionTransitionsPerDemand = 1
        }
      }
      previousTargetPreemptionUsed[index] =
        state.zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot]!
    }

    const countProtectedStagingReaders = () => {
      let protectedReaderCount = 0
      for (const slot of slots) {
        if (
          state.zombies.navigationIntentPending[slot] !== 0 &&
          state.zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] !== 0 &&
          zombieEscapeSparseFlowSearchHoldsStagingReverseFieldBankLease(
            state.zombies.navigationSparseFlowSearch[slot]!,
            state.navigationField,
          )
        ) {
          protectedReaderCount += 1
        }
      }
      return protectedReaderCount
    }

    const recordFairnessState = (
      protectedStagingReaderCountBeforeStep: number,
      publicationBlockedCountBeforeStep: number,
    ) => {
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index]!
        const pending = state.zombies.navigationIntentPending[slot] !== 0
        const pendingSinceTick = state.zombies.navigationIntentPendingSinceTick[slot]!
        const beganObservedDemand =
          pending &&
          (observedDemandActive[index] === 0 ||
            observedDemandPendingSinceTick[index] !== pendingSinceTick)
        if (beganObservedDemand) {
          if (observedDemandActive[index] !== 0) observedDemandCompletionCount += 1
          observedDemandSerial[index] += 1
          observedDemandPendingSinceTick[index] = pendingSinceTick
          observedDemandActive[index] = 1
          observedDemandPreemptionTransitions[index] = 0
          observedDemandCount += 1
        } else if (!pending && observedDemandActive[index] !== 0) {
          observedDemandActive[index] = 0
          observedDemandCompletionCount += 1
        }

        const targetPreemptionUsed =
          state.zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot]!
        if (
          pending &&
          targetPreemptionUsed !== 0 &&
          (beganObservedDemand || previousTargetPreemptionUsed[index] === 0)
        ) {
          observedDemandPreemptionTransitions[index] += 1
          observedPreemptionTransitionCount += 1
          if (observedDemandPreemptionTransitions[index] === 1) {
            observedPreemptedDemandCount += 1
          }
          maximumPreemptionTransitionsPerDemand = Math.max(
            maximumPreemptionTransitionsPerDemand,
            observedDemandPreemptionTransitions[index]!,
          )
        }
        previousTargetPreemptionUsed[index] = targetPreemptionUsed

        const firstServiceTick = state.zombies.navigationIntentFirstServiceTick[slot]!
        const firstServiceEligibleSinceTick =
          state.zombies.navigationIntentFirstServiceEligibleSinceTick[slot]!
        if (firstServiceTick >= firstServiceEligibleSinceTick) {
          const firstServiceLatencyTicks = (firstServiceTick - firstServiceEligibleSinceTick) >>> 0
          if (firstServiceLatencyTicks > maximumFirstServiceLatencyTicks) {
            maximumFirstServiceLatencyTicks = firstServiceLatencyTicks
          }
        }
      }

      const protectedStagingReaderCountAfterStep = countProtectedStagingReaders()
      maximumProtectedStagingReaderCount = Math.max(
        maximumProtectedStagingReaderCount,
        protectedStagingReaderCountBeforeStep,
        protectedStagingReaderCountAfterStep,
      )
      const publicationBlockedCountAfterStep = inspectZombieEscapeSparseReverseFieldBanks(
        state.navigationField,
      ).publicationBlockedCount
      if (
        publicationBlockedCountAfterStep > publicationBlockedCountBeforeStep &&
        Math.max(protectedStagingReaderCountBeforeStep, protectedStagingReaderCountAfterStep) > 0
      ) {
        protectedPublicationBlockedTickCount += 1
      }
    }

    for (let tick = 0; tick < 2_028; tick += 1) {
      if (!protectedPathStressInjected && tick >= 900) {
        const protectedPathStressSlot = slots.find(
          (slot) =>
            state.zombies.navigationIntentPending[slot] === 0 &&
            !zombieEscapeSameLayerNavigationSegmentIsClear(
              world,
              state.zombies.x[slot]!,
              state.zombies.y[slot]!,
              state.zombies.z[slot]!,
              state.player.x,
              state.player.y,
              state.player.z,
              world.agentRadius,
            ),
        )
        if (protectedPathStressSlot !== undefined) {
          clearZombieEscapeSparseFlowSearchRouteCorridor(
            state.zombies.navigationSparseCommittedFlowSearch[protectedPathStressSlot]!,
          )
          state.zombies.navigationIntentCommittedRouteGeneration[protectedPathStressSlot] = 0
          state.zombies.navigationIntentHasCached[protectedPathStressSlot] = 0
          state.zombies.navigationIntentValid[protectedPathStressSlot] = 0
          state.zombies.navigationReachable[protectedPathStressSlot] = 0
          state.zombies.navigationWaypointFallback[protectedPathStressSlot] = 0
          state.zombies.navigationWaypointNode[protectedPathStressSlot] = -1
          protectedPathStressInjected = true
        }
      }
      let remainingTargetTravel =
        ZOMBIE_ESCAPE_SIMULATION.runSpeed * ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
      while (remainingTargetTravel > 0) {
        const target = targetWaypoints[targetWaypointIndex]!
        const offsetX = target.x - state.player.x
        const offsetZ = target.z - state.player.z
        const distance = Math.hypot(offsetX, offsetZ)
        if (distance > remainingTargetTravel) {
          state.player.x += (offsetX / distance) * remainingTargetTravel
          state.player.z += (offsetZ / distance) * remainingTargetTravel
          remainingTargetTravel = 0
        } else {
          state.player.x = target.x
          state.player.z = target.z
          remainingTargetTravel -= distance
          targetWaypointIndex = (targetWaypointIndex + 1) % targetWaypoints.length
          targetDirectionChangeCount += 1
        }
      }

      const protectedStagingReaderCountBeforeStep = countProtectedStagingReaders()
      const publicationBlockedCountBeforeStep = inspectZombieEscapeSparseReverseFieldBanks(
        state.navigationField,
      ).publicationBlockedCount
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index]!
        sourceLiveGoalClear[index] = zombieEscapeSameLayerNavigationSegmentIsClear(
          world,
          state.zombies.x[slot]!,
          state.zombies.y[slot]!,
          state.zombies.z[slot]!,
          state.player.x,
          state.player.y,
          state.player.z,
          world.agentRadius,
        )
          ? 1
          : 0
      }
      stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
      recordFairnessState(protectedStagingReaderCountBeforeStep, publicationBlockedCountBeforeStep)
      const targetCellX = Math.floor(state.player.x / world.cellSize)
      const targetCellZ = Math.floor(state.player.z / world.cellSize)
      if (targetCellX !== previousTargetCellX || targetCellZ !== previousTargetCellZ) {
        targetCellTransitionCount += 1
        previousTargetCellX = targetCellX
        previousTargetCellZ = targetCellZ
      }
      const targetUpdate = state.navigationField.graphSparseTargetUpdate
      const currentPublicationCount = state.navigationField.graphReverseFieldBanks.publicationCount
      const publicationAdvanced = currentPublicationCount > observedPublicationCount
      observedPublicationCount = currentPublicationCount
      const pendingReplacement =
        targetUpdate.status === 'pending' &&
        (targetUpdate.requestedTargetX !== targetUpdate.activeTargetX ||
          targetUpdate.requestedTargetZ !== targetUpdate.activeTargetZ)
      if (pendingReplacement) {
        consecutivePendingReplacementTicks = publicationAdvanced
          ? 1
          : consecutivePendingReplacementTicks + 1
        maximumConsecutivePendingReplacementTicks = Math.max(
          maximumConsecutivePendingReplacementTicks,
          consecutivePendingReplacementTicks,
        )
      } else {
        consecutivePendingReplacementTicks = 0
      }
      recordWallCrossings()
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index]!
        closestMovingDistances[index] = Math.min(
          closestMovingDistances[index]!,
          Math.hypot(
            state.player.x - state.zombies.x[slot]!,
            state.player.z - state.zombies.z[slot]!,
          ),
        )
        const velocityX = state.zombies.vx[slot]!
        const velocityZ = state.zombies.vz[slot]!
        const velocityPointsAway =
          velocityX * velocityX + velocityZ * velocityZ > 0.000_001 &&
          velocityX * (state.player.x - state.zombies.x[slot]!) +
            velocityZ * (state.player.z - state.zombies.z[slot]!) <
            0
        if (
          sourceLiveGoalClear[index] !== 0 &&
          state.zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase &&
          velocityPointsAway
        ) {
          consecutiveWrongWayTicks[index] += 1
          maximumConsecutiveWrongWayTicks = Math.max(
            maximumConsecutiveWrongWayTicks,
            consecutiveWrongWayTicks[index]!,
          )
        } else {
          consecutiveWrongWayTicks[index] = 0
        }
      }
    }

    const movingDistances = slots.map((slot) =>
      Math.hypot(state.player.x - state.zombies.x[slot]!, state.player.z - state.zombies.z[slot]!),
    )
    const movingProgressedFiveMetersCount = closestMovingDistances.filter(
      (distance, index) => distance <= initialDistances[index]! - 5,
    ).length
    const movingProgressedTenMetersCount = closestMovingDistances.filter(
      (distance, index) => distance <= initialDistances[index]! - 10,
    ).length
    const isCurrentGenerationSearch = (slot: number) =>
      state.zombies.navigationIntentPending[slot] !== 0 &&
      state.zombies.navigationSparseFlowSearchActive[slot] !== 0 &&
      state.zombies.navigationIntentValid[slot] === 0 &&
      state.zombies.navigationWaypointNode[slot] === -1 &&
      getZombieEscapeSparseFlowSearchRouteGeneration(
        state.zombies.navigationSparseFlowSearch[slot]!,
      ) === state.navigationTargetCommittedRouteGeneration
    const isBoundedRoutePublicationReadmission = (slot: number) =>
      state.zombies.navigationIntentPending[slot] !== 0 &&
      state.zombies.navigationSparseFlowSearchActive[slot] === 0 &&
      state.zombies.navigationSparseFlowSearchDependencyWaiting[slot] !== 0 &&
      state.zombies.navigationSparseFlowSearchRestartToken[slot] !== 0 &&
      state.zombies.navigationSparseFlowSearchTargetPreemptionUsed[slot] !== 0 &&
      state.zombies.navigationIntentValid[slot] === 0 &&
      state.zombies.navigationWaypointNode[slot] === -1
    const isBoundedCurrentRouteAdmission = (slot: number) =>
      state.zombies.navigationIntentPending[slot] !== 0 &&
      state.zombies.navigationSparseFlowSearchActive[slot] === 0 &&
      state.zombies.navigationSparseFlowSearchDependencyWaiting[slot] !== 0 &&
      state.zombies.navigationIntentHasCached[slot] === 0 &&
      state.zombies.navigationIntentValid[slot] === 0 &&
      state.zombies.navigationWaypointNode[slot] === -1
    const movingCurrentGenerationSearchCount = slots.filter(isCurrentGenerationSearch).length
    const movingRoutePublicationReadmissionCount = slots.filter(
      isBoundedRoutePublicationReadmission,
    ).length
    const movingCurrentRouteAdmissionCount = slots.filter(isBoundedCurrentRouteAdmission).length
    const movingAlignedWithCurrentGoalCount = slots.filter((slot) => {
      return (
        state.zombies.navigationIntentCommittedRouteGeneration[slot] ===
          state.navigationTargetCommittedRouteGeneration ||
        isCurrentGenerationSearch(slot) ||
        isBoundedRoutePublicationReadmission(slot) ||
        isBoundedCurrentRouteAdmission(slot) ||
        zombieEscapeSameLayerNavigationSegmentIsClear(
          world,
          state.zombies.x[slot]!,
          state.zombies.y[slot]!,
          state.zombies.z[slot]!,
          state.player.x,
          state.player.y,
          state.player.z,
          world.agentRadius,
        )
      )
    }).length
    const movingMeanDistance =
      movingDistances.reduce((total, distance) => total + distance, 0) / movingDistances.length

    let settleTicks = 0
    let arrivedCount = 0
    while (
      settleTicks < 1_800 &&
      (arrivedCount < 8 ||
        state.navigationField.graphSparseTargetUpdate.status === 'pending' ||
        state.navigationIntentPendingCount > 0 ||
        state.navigationIntentAdmissionDeferredPendingCount > 0 ||
        state.zombies.navigationSparseFlowSearchActive.some((active) => active !== 0))
    ) {
      const protectedStagingReaderCountBeforeStep = countProtectedStagingReaders()
      const publicationBlockedCountBeforeStep = inspectZombieEscapeSparseReverseFieldBanks(
        state.navigationField,
      ).publicationBlockedCount
      stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
      recordFairnessState(protectedStagingReaderCountBeforeStep, publicationBlockedCountBeforeStep)
      recordWallCrossings()
      arrivedCount = slots.filter(
        (slot) =>
          Math.hypot(
            state.player.x - state.zombies.x[slot]!,
            state.player.z - state.zombies.z[slot]!,
          ) <=
          ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters + 1,
      ).length
      settleTicks += 1
    }
    const publicationCount =
      state.navigationField.graphReverseFieldBanks.publicationCount - publicationCountBefore
    const requestedRevisionCount = state.navigationTargetRequestedRevision - requestedRevisionBefore
    const publicationBlockedCount =
      inspectZombieEscapeSparseReverseFieldBanks(state.navigationField).publicationBlockedCount -
      publicationBlockedCountBefore
    const navigationIntentIssuedCount =
      state.navigationIntentIssuedCount - navigationIntentIssuedCountBefore
    const navigationIntentResolvedCount =
      state.navigationIntentResolvedCount - navigationIntentResolvedCountBefore
    const navigationIntentCanceledCount =
      state.navigationIntentCanceledCount - navigationIntentCanceledCountBefore
    const routePublishedRestartCount =
      state.navigationSparseSearchRestartedRoutePublishedCount - routePublishedRestartsBefore
    const targetPublicationPreemptionRestartCount =
      state.navigationSparseSearchRestartedTargetPublicationPreemptionCount -
      targetPublicationPreemptionRestartsBefore
    const targetPreemptionRestartCount =
      routePublishedRestartCount + targetPublicationPreemptionRestartCount
    const reverseFieldBanks = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
    const attachmentHeapLeases = inspectZombieEscapeSparseAttachmentHeapLeases(
      state.navigationField,
    )
    const targetUpdate = state.navigationField.graphSparseTargetUpdate

    expect(protectedPathStressInjected).toBe(true)
    expect(state.zombies.pool.activeCount).toBe(ZOMBIE_ESCAPE_SIMULATION.initialNightZombieCount)
    expect(targetCellTransitionCount).toBeGreaterThan(30)
    expect(targetDirectionChangeCount).toBeGreaterThan(8)
    expect(maximumConsecutivePendingReplacementTicks).toBeLessThanOrEqual(60)
    expect(warmupArrivedCount).toBeGreaterThanOrEqual(8)
    expect(warmupTicks).toBeLessThan(1_800)
    expect(movingProgressedFiveMetersCount).toBeGreaterThanOrEqual(45)
    expect(movingProgressedTenMetersCount).toBeGreaterThanOrEqual(40)
    expect(movingMeanDistance).toBeLessThan(18)
    expect(movingAlignedWithCurrentGoalCount).toBe(slots.length)
    expect(movingCurrentGenerationSearchCount).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(movingRoutePublicationReadmissionCount).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(movingCurrentRouteAdmissionCount).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(maximumConsecutiveWrongWayTicks).toBe(0)
    expect(maximumFirstServiceLatencyTicks).toBeLessThanOrEqual(14)
    expect(arrivedCount).toBeGreaterThanOrEqual(8)
    expect(settleTicks).toBeLessThan(300)
    expect(wallCrossingViolationCount).toBe(0)
    expect(publicationCount).toBeGreaterThan(1)
    expect(publicationCount).toBeLessThanOrEqual(targetCellTransitionCount + 1)
    expect(publicationBlockedCount).toBeLessThanOrEqual(60)
    expect(maximumProtectedStagingReaderCount).toBeLessThanOrEqual(1)
    expect(protectedPublicationBlockedTickCount).toBeLessThanOrEqual(60)
    expect(targetPreemptionRestartCount).toBeLessThanOrEqual(
      publicationCount * ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(observedPreemptionTransitionCount).toBeLessThanOrEqual(targetPreemptionRestartCount)
    expect(routePublishedRestartCount).toBeLessThanOrEqual(
      publicationCount * ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    )
    expect(observedPreemptedDemandCount).toBeLessThanOrEqual(observedDemandCount)
    expect(maximumPreemptionTransitionsPerDemand).toBeLessThanOrEqual(1)
    expect(observedDemandCompletionCount).toBe(observedDemandCount)
    expect(observedDemandActive.every((active) => active === 0)).toBe(true)
    expect(navigationIntentCanceledCount).toBe(0)
    expect(navigationIntentResolvedCount).toBe(
      navigationIntentPendingCountBefore + navigationIntentIssuedCount,
    )
    expect(requestedRevisionCount).toBeLessThan(targetCellTransitionCount)
    expect(requestedRevisionCount).toBeGreaterThan(100)
    expect(state.navigationSparseSearchTargetBuildsMaximumObservedPerTick).toBeLessThanOrEqual(
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetBuildsPerTick,
    )
    expect(state.navigationSparseSearchBudgetViolationCount).toBe(0)
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentAdmissionDeferredPendingCount).toBe(0)
    expect(state.zombies.navigationSparseFlowSearchActive.every((active) => active === 0)).toBe(
      true,
    )
    expect(targetUpdate.status).toBe('ready')
    expect([
      targetUpdate.activeTargetBucketX,
      targetUpdate.activeTargetBucketZ,
      targetUpdate.activeTargetX,
      targetUpdate.activeTargetY,
      targetUpdate.activeTargetZ,
    ]).toEqual([
      targetUpdate.requestedTargetBucketX,
      targetUpdate.requestedTargetBucketZ,
      targetUpdate.requestedTargetX,
      targetUpdate.requestedTargetY,
      targetUpdate.requestedTargetZ,
    ])
    expect([
      targetUpdate.routeTargetBucketX,
      targetUpdate.routeTargetBucketZ,
      targetUpdate.routeTargetX,
      targetUpdate.routeTargetY,
      targetUpdate.routeTargetZ,
    ]).toEqual([
      targetUpdate.requestedTargetBucketX,
      targetUpdate.requestedTargetBucketZ,
      targetUpdate.requestedTargetX,
      targetUpdate.requestedTargetY,
      targetUpdate.requestedTargetZ,
    ])
    expect(targetUpdate.activeTargetLayerIndex).toBe(targetUpdate.routeTargetLayerIndex)
    expect([
      state.navigationRouteTargetX,
      state.navigationRouteTargetY,
      state.navigationRouteTargetZ,
    ]).toEqual([
      targetUpdate.requestedTargetX,
      targetUpdate.requestedTargetY,
      targetUpdate.requestedTargetZ,
    ])
    expect(reverseFieldBanks.activeGeneration).toBe(state.navigationTargetCommittedRouteGeneration)
    expect(reverseFieldBanks.activeRouteTargetLayerIndex).toBe(targetUpdate.routeTargetLayerIndex)
    expect(reverseFieldBanks.readerLeaseCount).toBe(0)
    expect(reverseFieldBanks.bankZeroReaderCount).toBe(0)
    expect(reverseFieldBanks.bankOneReaderCount).toBe(0)
    expect(reverseFieldBanks.leaseInvariantViolationCount).toBe(0)
    expect(reverseFieldBanks.maximumReaderLeaseCount).toBeGreaterThan(0)
    expect(attachmentHeapLeases.activeAgentLeases).toBe(0)
    expect(attachmentHeapLeases.leaseInvariantViolationCount).toBe(0)
    expect(attachmentHeapLeases.maximumActiveAgentLeases).toBeGreaterThan(0)
  })

  test('moves the smallest catalog zombie through the parcel-02 stair connector using navigation collision', () => {
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
    state.zombies.variant[zombie] = 5
    const input = createZombieEscapeControlState()
    let previousProgress = 0
    let previousElevation = state.zombies.y[zombie]!
    let largestBacktrack = 0
    let crossedStair = false
    let ascendingConnectorTicks = 0

    for (let frame = 0; frame < 720; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (state.zombies.navigationConnector[zombie]! >= 0) {
        ascendingConnectorTicks += 1
        expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
        expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
        expect(state.navigationIntentOldestPendingAgeTicks).toBe(0)
      }
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
    expect(ascendingConnectorTicks).toBeGreaterThan(0)
    expect(largestBacktrack).toBeLessThan(0.02)
    expect(state.zombies.y[zombie]).toBeCloseTo(connector!.endY, 5)
    expect(state.zombies.navigationConnector[zombie]).toBe(-1)
    expect(state.zombies.attackTargetObjectId[zombie]).toBeNull()
    expect(state.navigationIntentDemandConnectorChangedCount).toBe(1)

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
    let descendingConnectorTicks = 0
    for (let frame = 0; frame < 720; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (state.zombies.navigationConnector[zombie]! >= 0) {
        descendingConnectorTicks += 1
        expect(state.zombies.navigationIntentPending[zombie]).toBe(0)
        expect(state.zombies.navigationSparseFlowSearchActive[zombie]).toBe(0)
        expect(state.navigationIntentOldestPendingAgeTicks).toBe(0)
      }
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
    expect(descendingConnectorTicks).toBeGreaterThan(0)
    expect(largestForwardSlip).toBeLessThan(0.02)
    expect(state.zombies.y[zombie]).toBeCloseTo(connector!.startY, 5)
    expect(state.zombies.navigationConnector[zombie]).toBe(-1)
    expect(state.navigationIntentDemandConnectorChangedCount).toBe(2)
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
    expect(state.collisionWorld.boxes).toHaveLength(1)
    const tableObjectOrdinal = state.collisionWorld.objectCatalog.objectIds.indexOf('table')
    expect(tableObjectOrdinal).toBeGreaterThanOrEqual(0)
    expect(state.collisionWorld.activeObjectMask[tableObjectOrdinal]).toBe(0)
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

  test('rejects a zombie on a disconnected navigation support', () => {
    const arena = createZombieEscapeArena(411)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 811)
    setZombieEscapeCollisionWorld(
      state,
      createZombieEscapeCollisionWorld({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'disconnected-ground',
            polygon: [
              { x: -4, z: -4 },
              { x: -0.5, z: -4 },
              { x: -0.5, z: 4 },
              { x: -4, z: 4 },
            ],
          },
          {
            boundary: true,
            elevation: 3,
            id: 'disconnected-upper',
            polygon: [
              { x: 0.5, z: -4 },
              { x: 4, z: -4 },
              { x: 4, z: 4 },
              { x: 0.5, z: 4 },
            ],
          },
        ],
        playRadius: arena.playRadius,
      }),
    )
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 1.5
    state.player.y = 3
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, -0.55, 0)

    expect(zombie).toBe(-1)
    expect(state.zombies.pool.activeCount).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.collisionWorld.navigationSupports).toHaveLength(2)
  })

  test('preserves sparse waypoint caches when furniture removal shares the navigation graph', () => {
    const arena = createZombieEscapeArena(4_112)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 8_112)
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'crate:footprint',
          objectId: 'crate',
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 9,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    publishZombieEscapeSparseTarget(state, createZombieEscapeControlState(), arena)
    const zombie = spawnZombieEscapeZombie(state, -3, 0)
    const waypointNode = Math.min(1, world.navigationGraph.nodeIds.length - 1)
    expect(waypointNode).toBeGreaterThanOrEqual(0)
    state.zombies.navigationWaypointNode[zombie] = waypointNode
    state.destroyedObstacleIds.add('crate')

    setZombieEscapeCollisionWorld(state, world)

    expect(state.collisionWorld.navigationGraph).toBe(world.navigationGraph)
    expect(state.zombies.navigationWaypointNode[zombie]).toBe(waypointNode)
  })

  test('remaps a stable sparse waypoint across an equivalent rebuilt graph', () => {
    const arena = createZombieEscapeArena(4_113)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 8_113)
    const first = createSparseWaypointRemapWorld({ elevations: [0, 3] })
    const second = createSparseWaypointRemapWorld({ elevations: [0, 3] })
    expect(second.navigationGraph).not.toBe(first.navigationGraph)
    setZombieEscapeCollisionWorld(state, first)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 2
    state.player.y = 0
    state.player.z = 0
    publishZombieEscapeSparseTarget(state, createZombieEscapeControlState(), arena)
    const zombie = spawnZombieEscapeZombie(state, 0, 0)
    state.zombies.y[zombie] = 3
    const firstNode = findSparseWaypointCenterNode(first, 3)
    const key = first.navigationGraph.nodeKeys[firstNode]!
    const secondNode = second.navigationGraph.nodeKeys.indexOf(key)
    expect(firstNode).toBeGreaterThanOrEqual(0)
    expect(secondNode).toBeGreaterThanOrEqual(0)
    state.zombies.navigationWaypointFallback[zombie] = 1
    state.zombies.navigationWaypointNode[zombie] = firstNode

    setZombieEscapeCollisionWorld(state, second)

    expect(state.zombies.navigationWaypointNode[zombie]).toBe(secondNode)
    expect(state.zombies.navigationWaypointFallback[zombie]).toBe(1)
  })

  test('atomically retires moved and wrong-floor sparse waypoints during topology replacement', () => {
    const arena = createZombieEscapeArena(4_114)
    arena.obstacleCount = 0
    const first = createSparseWaypointRemapWorld({ elevations: [0, 6] })
    const originalNode = findSparseWaypointCenterNode(first, 6)
    expect(originalNode).toBeGreaterThanOrEqual(0)
    const prepare = (seed: number) => {
      const state = createZombieEscapeSimulation(arena, seed)
      setZombieEscapeCollisionWorld(state, first)
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      state.waveState = 'escape'
      state.player.x = 2
      state.player.y = 0
      state.player.z = 0
      publishZombieEscapeSparseTarget(state, createZombieEscapeControlState(), arena)
      const zombie = spawnZombieEscapeZombie(state, 0, 0)
      expect(zombie).toBeGreaterThanOrEqual(0)
      state.zombies.y[zombie] = 6
      state.zombies.navigationWaypointFallback[zombie] = 1
      state.zombies.navigationWaypointNode[zombie] = originalNode
      state.waveState = 'active'
      state.waveSpawnTimerSeconds = 10_000
      return { state, zombie }
    }

    const movedCase = prepare(8_114)
    const moved = createSparseWaypointRemapWorld({ centerX: 20, elevations: [0, 6] })
    setZombieEscapeCollisionWorld(movedCase.state, moved)
    expect(movedCase.state.zombies.pool.active[movedCase.zombie]).toBe(0)
    expect(movedCase.state.replacementSpawnRemaining).toBe(1)
    expect(inspectZombieEscapeCommittedNavigationAction(movedCase.state, movedCase.zombie)).toBe(
      'none',
    )

    const wrongFloorCase = prepare(8_115)
    const twoFloors = createSparseWaypointRemapWorld({ elevations: [3, 6] })
    const groundNode = findSparseWaypointCenterNode(twoFloors, 3)
    const upperNode = findSparseWaypointCenterNode(twoFloors, 6)
    expect(groundNode).toBeGreaterThanOrEqual(0)
    expect(upperNode).toBeGreaterThanOrEqual(0)
    expect(twoFloors.navigationGraph.x[groundNode]).toBe(twoFloors.navigationGraph.x[upperNode])
    expect(twoFloors.navigationGraph.z[groundNode]).toBe(twoFloors.navigationGraph.z[upperNode])
    expect(twoFloors.navigationGraph.nodeKeys[groundNode]).not.toBe(
      twoFloors.navigationGraph.nodeKeys[upperNode],
    )

    setZombieEscapeCollisionWorld(wrongFloorCase.state, twoFloors)
    expect(wrongFloorCase.state.zombies.pool.active[wrongFloorCase.zombie]).toBe(0)
    expect(wrongFloorCase.state.replacementSpawnRemaining).toBe(1)
    expect(
      inspectZombieEscapeCommittedNavigationAction(wrongFloorCase.state, wrongFloorCase.zombie),
    ).toBe('none')
  })

  test('remaps connector waypoints by semantic chain endpoint when graph indices shift', () => {
    const arena = createZombieEscapeArena(4_115)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 8_115)
    const first = createSparseWaypointRemapWorld({ connectorChainIds: ['stable'] })
    const second = createSparseWaypointRemapWorld({ connectorChainIds: ['earlier', 'stable'] })
    const firstNode = first.navigationGraph.nodeIds.findIndex((id) =>
      id.includes('connector:stable:lower'),
    )
    expect(firstNode).toBeGreaterThanOrEqual(0)
    const key = first.navigationGraph.nodeKeys[firstNode]!
    const secondNode = second.navigationGraph.nodeKeys.indexOf(key)
    expect(secondNode).toBeGreaterThanOrEqual(0)
    expect(secondNode).not.toBe(firstNode)
    setZombieEscapeCollisionWorld(state, first)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    publishZombieEscapeSparseTarget(state, createZombieEscapeControlState(), arena)
    const zombie = spawnZombieEscapeZombie(state, 0, -2)
    state.zombies.navigationWaypointFallback[zombie] = 1
    state.zombies.navigationWaypointNode[zombie] = firstNode

    setZombieEscapeCollisionWorld(state, second)

    expect(state.zombies.navigationWaypointNode[zombie]).toBe(secondNode)
    expect(state.zombies.navigationWaypointFallback[zombie]).toBe(1)
  })

  test('remaps a full active zombie cohort within one frame budget', () => {
    const arena = createZombieEscapeArena(4_116)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 8_116)
    const first = createSparseWaypointRemapWorld({ boxCount: 24 })
    const second = createSparseWaypointRemapWorld({ boxCount: 25 })
    setZombieEscapeCollisionWorld(state, first)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    publishZombieEscapeSparseTarget(state, createZombieEscapeControlState(), arena)
    const key = '0:0.000:0.000'
    const firstNode = first.navigationGraph.nodeKeys.indexOf(key)
    const secondNode = second.navigationGraph.nodeKeys.indexOf(key)
    expect(firstNode).toBeGreaterThanOrEqual(0)
    expect(secondNode).toBeGreaterThanOrEqual(0)
    const zombies: number[] = []
    for (let index = 0; index < ZOMBIE_ESCAPE_CAPACITY.zombies; index += 1) {
      const zombie = spawnZombieEscapeZombie(state, 0, -2)
      expect(zombie).toBeGreaterThanOrEqual(0)
      zombies.push(zombie)
      state.zombies.navigationWaypointFallback[zombie] = 1
      state.zombies.navigationWaypointNode[zombie] = firstNode
    }

    const startedAt = performance.now()
    setZombieEscapeCollisionWorld(state, second)
    const elapsedMilliseconds = performance.now() - startedAt

    expect(elapsedMilliseconds).toBeLessThan(16.7)
    expect(
      zombies.every((zombie) => state.zombies.navigationWaypointNode[zombie] === secondNode),
    ).toBe(true)
    expect(zombies.every((zombie) => state.zombies.navigationWaypointFallback[zombie] === 1)).toBe(
      true,
    )
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
    expect(state.collisionWorld.segments).toHaveLength(1)
    expect(
      state.collisionWorld.activeObjectMask[
        state.collisionWorld.objectCatalog.objectIds.indexOf('front-door')
      ],
    ).toBe(0)

    setZombieEscapeGamePhase(state, 'build')

    expect(state.destroyedObstacleIds.size).toBe(0)
    expect(state.obstacleHitCounts.size).toBe(0)
    expect(state.obstacleRevision).toBe(2)
    expect(state.collisionWorld.segments).toHaveLength(1)
    expect(
      state.collisionWorld.activeObjectMask[
        state.collisionWorld.objectCatalog.objectIds.indexOf('front-door')
      ],
    ).toBe(1)
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
    const clearSpeedScale = clear.zombies.speedScale[clearZombie]!
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
    expect(clear.zombies.gait[clearZombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner)
    expect(clear.zombies.projectileHitOrdinal[clearZombie]).toBe(0)
    expect(clear.zombies.speedScale[clearZombie]).toBe(clearSpeedScale)
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
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -arena.playRadius, z: -arena.playRadius },
            { x: arena.playRadius, z: -arena.playRadius },
            { x: arena.playRadius, z: arena.playRadius },
            { x: -arena.playRadius, z: arena.playRadius },
          ],
        },
      ],
      playRadius: arena.playRadius,
      segments: [
        {
          endX: 10,
          endZ: 10,
          halfThickness: 0.1,
          id: 'routing-wall',
          startX: 10,
          startZ: -5,
        },
      ],
    })
    for (const state of [first, second]) {
      setZombieEscapeCollisionWorld(state, world)
      setZombieEscapeGamePhase(state, 'night')
      state.player.x = 0
      state.player.z = 0
      state.waveSpawnRemaining = 1
      state.waveSpawnTimerSeconds = 0
      const input = createZombieEscapeControlState()
      for (let tick = 0; tick < 256 && state.waveSpawnRemaining > 0; tick += 1) {
        stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      }
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
    expect(
      Math.hypot(first.zombies.x[firstSlot]!, first.zombies.z[firstSlot]!),
    ).toBeGreaterThanOrEqual(8)
    expect(first.zombies.navigationWaypointNode[firstSlot]).toBeGreaterThanOrEqual(0)
    expect(first.zombies.navigationIntentHasCached[firstSlot]).toBe(1)
    expect(first.zombies.navigationIntentValid[firstSlot]).toBe(1)
    expect(first.zombies.navigationIntentWorldGeneration[firstSlot]).toBe(
      first.collisionWorldGeneration,
    )
    expect(first.zombies.navigationIntentCommittedRouteGeneration[firstSlot]).toBe(
      first.navigationTargetCommittedRouteGeneration,
    )
    expect(first.navigationIntentDemandSpawnCount).toBe(0)
    expect(first.navigationIntentPendingCount).toBe(0)
    expect(second.zombies.navigationWaypointNode[secondSlot]).toBe(
      first.zombies.navigationWaypointNode[firstSlot],
    )
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
    expect(state.collisionSourceWorld).toBe(navigationWorld)
    expect(state.combatCollisionSourceWorld).toBe(combatWorld)
    expect(state.collisionWorld.segments).toBe(navigationWorld.segments)
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
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 0.5, 120)
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
    const input = createZombieEscapeControlState()
    publishZombieEscapeSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 3.2, 120)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    state.zombies.y[zombie] = 2.5
    state.player.y = 2.5
    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: state.player.x,
      y: 3.5,
      z: state.player.z,
    })
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

  test('keeps the report-position ground zombie on a committed route and hittable below an overlapping floor', () => {
    const arena = createZombieEscapeArena(5413)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9413)
    const player = { x: 22.61534685, z: 18.6765284 }
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: player.x,
          centerZ: player.z - 2,
          halfDepth: 0.1,
          halfWidth: 0.7,
          id: 'report-low-blocker',
          maximumY: 0.8,
          minimumY: 0,
          navigationLayerY: 0,
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'report-ground',
          polygon: [
            { x: player.x - 4, z: player.z - 5 },
            { x: player.x + 4, z: player.z - 5 },
            { x: player.x + 4, z: player.z + 5 },
            { x: player.x - 4, z: player.z + 5 },
          ],
        },
        {
          elevation: 2.56,
          id: 'report-upper-floor',
          polygon: [
            { x: player.x - 4, z: player.z - 5 },
            { x: player.x + 4, z: player.z - 5 },
            { x: player.x + 4, z: player.z + 5 },
            { x: player.x - 4, z: player.z + 5 },
          ],
        },
      ],
      playRadius: arena.playRadius,
    })
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = player.x
    state.player.y = 0.05
    state.player.z = player.z
    const input = createZombieEscapeControlState()
    for (
      let tick = 0;
      tick < 256 &&
      (!state.navigationGoalInitialized ||
        state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
        state.navigationTargetCommittedRouteGeneration === 0);
      tick += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
    expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
    const zombie = spawnZombieEscapeZombie(state, player.x, player.z - 4, 120)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0

    for (let frame = 0; frame < 30; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe('none')
    expect(state.zombies.intent[zombie]).not.toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.blocked)
    expect(state.zombies.x[zombie]).toBeCloseTo(player.x, 6)
    expect(state.zombies.z[zombie]).toBeCloseTo(player.z - 4, 6)
    expect(state.zombies.y[zombie]).toBe(0)

    setZombieEscapePlayerMuzzlePose(state, {
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      x: player.x,
      y: 1.05,
      z: player.z,
    })
    input.fire = true
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    input.fire = false
    const shot = state.lastShotSlot
    for (
      let frame = 0;
      frame < 20 && state.shots.phase[shot] === ZOMBIE_ESCAPE_SHOT_PHASE.travel;
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }

    expect(state.zombies.y[zombie]).toBe(0)
    expect(state.zombies.health[zombie]).toBeLessThan(120)
    expect(state.shots.impactKind[shot]).toBe(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy)
    expect(state.shots.hitTargetSlot[shot]).toBe(zombie)
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
    const initialSpeedScale = state.zombies.speedScale[zombie]!
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
    expect(state.zombies.gait[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner)
    expect(state.zombies.projectileHitOrdinal[zombie]).toBe(0)
    expect(state.zombies.speedScale[zombie]).toBe(initialSpeedScale)
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

  test('reset replays fresh gameplay speed and projectile slowdown independent of pool generation', () => {
    const arena = createZombieEscapeArena(520)
    arena.obstacleCount = 0
    const fresh = createZombieEscapeSimulation(arena, 920)
    const reset = createZombieEscapeSimulation(arena, 920)
    spawnZombieEscapeZombie(reset, 8, 8)
    resetZombieEscapeSimulation(reset, arena)
    const input = createZombieEscapeControlState()
    input.aimZ = -1
    input.aimStrength = 1
    input.fire = true

    const slots = [fresh, reset].map((state) => {
      setZombieEscapeGamePhase(state, 'night')
      state.waveSpawnRemaining = 0
      state.waveState = 'escape'
      const slot = spawnZombieEscapeZombie(state, state.player.x, state.player.z - 2, 120)
      for (let frame = 0; frame < 12; frame += 1) {
        stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      }
      return slot
    })

    expect(reset.zombies.pool.generation[slots[1]!]).toBeGreaterThan(
      fresh.zombies.pool.generation[slots[0]!]!,
    )
    expect(reset.zombies.spawnOrdinal[slots[1]!]).toBe(0)
    expect(reset.zombies.speedScale[slots[1]!]).toBe(fresh.zombies.speedScale[slots[0]!])
    expect(reset.zombies.projectileHitOrdinal[slots[1]!]).toBe(
      fresh.zombies.projectileHitOrdinal[slots[0]!],
    )
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
    const input = createZombieEscapeControlState()
    const attackSequence = state.audioEvents.writeSequence

    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    expect(state.player.health).toBe(100)
    expect(state.zombies.intent[zombie]).toBe(ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer)
    expect(state.zombies.attackContactResolved[zombie]).toBe(0)
    expect(state.zombies.attackCooldown[zombie]).toBeCloseTo(
      ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds,
      5,
    )
    expect(readZombieEscapeAudioEventKinds(state, attackSequence)).toEqual([])
    for (let frame = 0; frame < 120 && state.player.health === 100; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
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
    for (let frame = 0; frame < 120 && state.status !== 'lost'; frame += 1) {
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
    }
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

function publishZombieEscapeSparseTarget(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
) {
  for (
    let tick = 0;
    tick < 512 &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    tick += 1
  ) {
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
  }
  expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
}

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

function createSparseWaypointRemapWorld({
  boxCount = 0,
  centerX = 0,
  connectorChainIds = [],
  elevations = [0, 3],
}: {
  boxCount?: number
  centerX?: number
  connectorChainIds?: readonly string[]
  elevations?: readonly number[]
}) {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    boxes: Array.from({ length: boxCount }, (_, index) => ({
      breakable: false,
      centerX: centerX - 5.5 + (index % 12),
      centerZ: 4 + Math.floor(index / 12) * 1.2,
      halfDepth: 0.2,
      halfWidth: 0.2,
      id: `remap-box:${String(index)}`,
      maximumY: 2,
      minimumY: -1,
      navigationLayerY: 0,
      objectId: `remap-box:${String(index)}`,
      rotation: 0,
    })),
    navigationConnectors: connectorChainIds.map((chainId, index) => ({
      ascendingEnd: true,
      chainId,
      chainLowerY: 0,
      chainOrder: 0,
      chainUpperY: 3,
      endX: centerX - index * 2,
      endY: 3,
      endZ: 1,
      halfWidth: 0.7,
      id: `${chainId}:flight`,
      startX: centerX - index * 2,
      startY: 0,
      startZ: -1,
    })),
    navigationSupports: elevations.map((elevation) => ({
      boundary: true as const,
      elevation,
      id: `surface-${String(elevation)}`,
      polygon: [
        { x: centerX - 8, z: -8 },
        { x: centerX + 8, z: -8 },
        { x: centerX + 8, z: 8 },
        { x: centerX - 8, z: 8 },
      ],
    })),
    playRadius: 32,
  })
}

function findSparseWaypointCenterNode(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
  elevation: number,
) {
  const layerIndex = world.navigationLayers.findIndex((layer) => layer.elevation === elevation)
  return world.navigationGraph.nodeIds.findIndex(
    (_, node) =>
      world.navigationGraph.layerIndices[node] === layerIndex &&
      Math.abs(world.navigationGraph.x[node]!) <= 1e-7 &&
      Math.abs(world.navigationGraph.z[node]!) <= 1e-7,
  )
}
