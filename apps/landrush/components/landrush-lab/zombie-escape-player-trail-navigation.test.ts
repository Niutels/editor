import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  zombieEscapeSameLayerNavigationSegmentIsClear,
} from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapePlayerTrailPoint,
  getZombieEscapePlayerTrailOldestSequence,
  readZombieEscapePlayerTrailPoint,
  recordZombieEscapePlayerTrailPoint,
  resetZombieEscapePlayerTrail,
} from './zombie-escape-player-trail'
import {
  createZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombieAtNavigationElevation,
  stepZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

const FIXED_DELTA_SECONDS = 1 / 60

describe('Zombie Escape player-trail pursuit', () => {
  test('follows the entrance the player used after doorway occlusion', () => {
    const wall = (id: string, startX: number, startZ: number, endX: number, endZ: number) => ({
      breakable: false,
      endX,
      endZ,
      halfThickness: 0.1,
      id,
      maximumY: 2.8,
      minimumY: 0,
      navigationLayerY: 0,
      objectId: id,
      startX,
      startZ,
    })
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'breadcrumb-doorway-ground',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 10,
      segments: [
        wall('breadcrumb-doorway-north', -2, 2, 2, 2),
        wall('breadcrumb-doorway-south', 2, -2, -2, -2),
        wall('breadcrumb-doorway-west', -2, -2, -2, 2),
        wall('breadcrumb-doorway-east-lower', 2, -2, 2, -0.6),
        wall('breadcrumb-doorway-east-upper', 2, 0.6, 2, 2),
      ],
    })
    const arena = createZombieEscapeArena(74_001)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 74_002, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 4
    state.player.y = 0
    state.player.z = 0
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombieAtNavigationElevation(state, 5.5, 0, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    for (let step = 1; step <= 30; step += 1) {
      state.player.x = 4 - step * 0.1
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    for (let step = 1; step <= 18; step += 1) {
      state.player.z = step * 0.1
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    for (let step = 1; step <= 20; step += 1) {
      state.player.x = 1 - step * 0.1
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }

    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        state.zombies.x[zombie]!,
        state.zombies.y[zombie]!,
        state.zombies.z[zombie]!,
        state.player.x,
        state.player.y,
        state.player.z,
        state.collisionWorld.agentRadius,
        createZombieEscapeCollisionHit(),
      ),
    ).toBe(false)
    expect(state.playerTrail.count).toBeGreaterThan(5)
    expect(state.zombies.pursuitTrailGeneration[zombie]).toBe(state.playerTrail.generation)
    expect(state.zombies.pursuitTrailSequence[zombie]).toBeLessThan(
      state.playerTrail.newestSequence,
    )
    expect(state.zombies.pursuitTrailValidatedStatus[zombie]).toBeGreaterThan(0)

    state.zombies.speedScale[zombie] = 1
    let crossedEntrance = false
    for (let frame = 0; frame < 1_200 && !crossedEntrance; frame += 1) {
      const previousX = state.zombies.x[zombie]!
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      if (previousX >= 2 && state.zombies.x[zombie]! < 2) {
        expect(Math.abs(state.zombies.z[zombie]!)).toBeLessThan(0.6)
        crossedEntrance = true
      }
    }
    expect(crossedEntrance).toBe(true)
  })

  test('requires six consecutive clear samples before leaving an occluded trail', () => {
    const { arena, input, state, zombie } = createOccludedDoorwayPursuit(74_007, 74_008)
    const occludedGeneration = state.zombies.pursuitTrailGeneration[zombie]!
    const occludedSequence = state.zombies.pursuitTrailSequence[zombie]!

    expect(ZOMBIE_ESCAPE_SIMULATION.zombieLiveGoalReacquisitionClearTicks).toBe(6)
    expect(state.zombies.navigationLiveGoalClearTicks[zombie]).toBe(0)
    expect(occludedSequence).toBeLessThan(state.playerTrail.newestSequence)

    state.player.x = 2.5
    state.player.y = 0
    state.player.z = 0
    expect(
      zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        state.zombies.x[zombie]!,
        state.zombies.y[zombie]!,
        state.zombies.z[zombie]!,
        state.player.x,
        state.player.y,
        state.player.z,
        state.collisionWorld.agentRadius,
        createZombieEscapeCollisionHit(),
      ),
    ).toBe(true)

    for (let clearSample = 1; clearSample < 6; clearSample += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.navigationLiveGoalClearTicks[zombie]).toBe(clearSample)
      expect(state.zombies.pursuitTrailGeneration[zombie]).toBe(occludedGeneration)
      expect(state.zombies.pursuitTrailSequence[zombie]).toBe(occludedSequence)
    }

    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.zombies.navigationLiveGoalClearTicks[zombie]).toBe(6)
    expect(state.zombies.pursuitTrailGeneration[zombie]).toBe(state.playerTrail.generation)
    expect(state.zombies.pursuitTrailSequence[zombie]).toBe(state.playerTrail.newestSequence)
  })

  test('retires a reached newest point without replacing the sparse-route steer with zero', () => {
    const world = createThinOccludingWallWorld()
    const arena = createZombieEscapeArena(74_009)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 74_010, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = -0.2
    state.player.y = 0
    state.player.z = 0
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombieAtNavigationElevation(state, 0.2, 0, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)

    const terminalX = state.zombies.x[zombie]!
    const terminalY = state.zombies.y[zombie]!
    const terminalZ = state.zombies.z[zombie]!
    expect(terminalX).toBeGreaterThan(0)
    state.player.x = terminalX - 0.4
    state.player.y = terminalY
    state.player.z = terminalZ
    resetZombieEscapePlayerTrail(state.playerTrail)
    const terminalSequence = recordZombieEscapePlayerTrailPoint(
      state.playerTrail,
      {
        layerIndex: state.navigationGoalLayerIndex,
        regionIndex: state.navigationGoalRegionIndex,
        tick: state.navigationIntentTick,
        x: terminalX,
        y: terminalY,
        z: terminalZ,
      },
      true,
    )
    state.zombies.pursuitTrailGeneration[zombie] = state.playerTrail.generation
    state.zombies.pursuitTrailSequence[zombie] = terminalSequence
    state.zombies.pursuitTrailValidatedSequence[zombie] = 0
    state.zombies.pursuitTrailValidatedStatus[zombie] = 0

    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.zombies.pool.active[zombie]).toBe(1)
    expect(state.zombies.pursuitTrailValidatedSequence[zombie]).toBe(terminalSequence)
    expect(state.zombies.pursuitTrailValidatedStatus[zombie]).toBe(3)
    expect(
      Math.hypot(state.zombies.x[zombie]! - terminalX, state.zombies.z[zombie]! - terminalZ),
    ).toBeGreaterThan(0.001)
    const movementSpeedScale = state.zombies.speedScale[zombie]!
    state.zombies.speedScale[zombie] = 0

    const nextSequence = recordZombieEscapePlayerTrailPoint(
      state.playerTrail,
      {
        layerIndex: state.navigationGoalLayerIndex,
        regionIndex: state.navigationGoalRegionIndex,
        tick: state.navigationIntentTick,
        x: state.player.x,
        y: state.player.y,
        z: state.player.z,
      },
      true,
    )
    expect(nextSequence).toBe(terminalSequence + 1)
    const framesUntilTrailPhase = 15 - ((state.navigationIntentTick + zombie) % 15)
    for (let frame = 1; frame < framesUntilTrailPhase; frame += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      expect(state.playerTrail.newestSequence).toBe(nextSequence)
      expect(state.zombies.pursuitTrailGeneration[zombie]).toBe(state.playerTrail.generation)
      expect(state.zombies.pursuitTrailSequence[zombie]).toBe(terminalSequence)
    }
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.zombies.pursuitTrailSequence[zombie]).toBe(nextSequence)
    state.zombies.speedScale[zombie] = movementSpeedScale

    let maximumDisplacement = Math.hypot(
      state.zombies.x[zombie]! - terminalX,
      state.zombies.z[zombie]! - terminalZ,
    )
    for (let frame = 0; frame < 240 && maximumDisplacement < 0.2; frame += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      expect(state.playerTrail.newestSequence).toBe(nextSequence)
      expect(state.zombies.pursuitTrailGeneration[zombie]).toBe(state.playerTrail.generation)
      maximumDisplacement = Math.max(
        maximumDisplacement,
        Math.hypot(state.zombies.x[zombie]! - terminalX, state.zombies.z[zombie]! - terminalZ),
      )
    }

    expect(maximumDisplacement).toBeGreaterThanOrEqual(0.2)
  })

  test('retires a colliding trail segment while preserving fallback-route progress', () => {
    const world = createThinOccludingWallWorld()
    const arena = createZombieEscapeArena(74_011)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 74_012, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = -0.8
    state.player.y = 0
    state.player.z = -1.8
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombieAtNavigationElevation(state, 0.3, -0.4, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)

    const sourceX = state.zombies.x[zombie]!
    const sourceZ = state.zombies.z[zombie]!
    state.zombies.vx[zombie] = -20
    state.zombies.vz[zombie] = -25
    resetZombieEscapePlayerTrail(state.playerTrail)
    const blockedSequence = recordZombieEscapePlayerTrailPoint(
      state.playerTrail,
      {
        layerIndex: state.navigationGoalLayerIndex,
        regionIndex: state.navigationGoalRegionIndex,
        tick: state.navigationIntentTick,
        x: state.player.x,
        y: state.player.y,
        z: state.player.z,
      },
      true,
    )
    state.zombies.pursuitTrailGeneration[zombie] = state.playerTrail.generation
    state.zombies.pursuitTrailSequence[zombie] = blockedSequence
    state.zombies.pursuitTrailValidatedSequence[zombie] = blockedSequence
    state.zombies.pursuitTrailValidatedSourceX[zombie] = sourceX
    state.zombies.pursuitTrailValidatedSourceZ[zombie] = sourceZ
    state.zombies.pursuitTrailValidatedStatus[zombie] = 1
    state.zombies.pursuitTrailValidatedWorldRevision[zombie] = state.navigationWorldRevision

    let sawCollisionRetirement = false
    let maximumDisplacement = 0
    for (
      let frame = 0;
      frame < 600 && (!sawCollisionRetirement || maximumDisplacement < 0.9);
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      expect(state.zombies.pursuitTrailGeneration[zombie]).toBe(state.playerTrail.generation)
      expect(state.zombies.pursuitTrailSequence[zombie]).toBe(blockedSequence)
      sawCollisionRetirement ||=
        state.zombies.pursuitTrailValidatedSequence[zombie] === blockedSequence &&
        state.zombies.pursuitTrailValidatedStatus[zombie] === 4
      maximumDisplacement = Math.max(
        maximumDisplacement,
        Math.hypot(state.zombies.x[zombie]! - sourceX, state.zombies.z[zombie]! - sourceZ),
      )
    }

    expect(sawCollisionRetirement).toBe(true)
    expect(maximumDisplacement).toBeGreaterThanOrEqual(0.9)
  })

  test('clears collision-hit scratch when a same-layer query fails structurally', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.1,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'hit-reset-ground',
          polygon: [
            { x: -3, z: -3 },
            { x: 3, z: -3 },
            { x: 3, z: 3 },
            { x: -3, z: 3 },
          ],
        },
      ],
      playRadius: 4,
      segments: [
        {
          breakable: false,
          endX: 0,
          endZ: 2,
          halfThickness: 0.05,
          id: 'hit-reset-wall',
          maximumY: 2.8,
          minimumY: 0,
          navigationLayerY: 0,
          objectId: 'hit-reset-wall',
          startX: 0,
          startZ: -2,
        },
      ],
    })
    const hit = createZombieEscapeCollisionHit()

    expect(zombieEscapeSameLayerNavigationSegmentIsClear(world, -1, 0, 0, 1, 0, 0, 0.1, hit)).toBe(
      false,
    )
    expect(hit.colliderKind).toBe('segment')
    expect(hit.colliderIndex).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(hit.time)).toBe(true)

    expect(zombieEscapeSameLayerNavigationSegmentIsClear(world, -1, 0, 0, 1, 3, 0, 0.1, hit)).toBe(
      false,
    )
    expect(hit.colliderKind).toBe('none')
    expect(hit.colliderIndex).toBe(-1)
    expect(hit.normalX).toBe(0)
    expect(hit.normalY).toBe(0)
    expect(hit.normalZ).toBe(0)
    expect(hit.time).toBe(Number.POSITIVE_INFINITY)
  })

  test('phases one hundred trail validations to seven per tick and services all within fifteen', () => {
    const zombieCapacity = 100
    const world = createThinOccludingWallWorld()
    const arena = createZombieEscapeArena(74_013)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 74_014, undefined, { zombieCapacity })
    const input = createZombieEscapeControlState()
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = -0.8
    state.player.y = 0
    state.player.z = 0
    publishSparseTarget(state, input, arena)

    const slots: number[] = []
    for (let index = 0; index < zombieCapacity; index += 1) {
      const slot = spawnZombieEscapeZombieAtNavigationElevation(state, 0.8, 0, 0)
      expect(slot).toBeGreaterThanOrEqual(0)
      state.zombies.speedScale[slot] = 0
      slots.push(slot)
    }

    resetZombieEscapePlayerTrail(state.playerTrail)
    const targetSequence = recordZombieEscapePlayerTrailPoint(
      state.playerTrail,
      {
        layerIndex: state.navigationGoalLayerIndex,
        regionIndex: state.navigationGoalRegionIndex,
        tick: state.navigationIntentTick,
        x: 1.8,
        y: 0,
        z: 0,
      },
      true,
    )
    const newestSequence = recordZombieEscapePlayerTrailPoint(
      state.playerTrail,
      {
        layerIndex: state.navigationGoalLayerIndex,
        regionIndex: state.navigationGoalRegionIndex,
        tick: state.navigationIntentTick,
        x: state.player.x,
        y: state.player.y,
        z: state.player.z,
      },
      true,
    )
    expect(newestSequence).toBe(targetSequence + 1)
    for (const slot of slots) {
      state.zombies.pursuitTrailGeneration[slot] = state.playerTrail.generation
      state.zombies.pursuitTrailSequence[slot] = targetSequence
      state.zombies.pursuitTrailValidatedSequence[slot] = 0
      state.zombies.pursuitTrailValidatedStatus[slot] = 0
    }

    let validatedCount = 0
    let maximumNewValidations = 0
    for (let tick = 0; tick < 15; tick += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      let currentValidatedCount = 0
      for (const slot of slots) {
        if (
          state.zombies.pursuitTrailValidatedSequence[slot] === targetSequence &&
          state.zombies.pursuitTrailValidatedStatus[slot] !== 0
        ) {
          currentValidatedCount += 1
        }
      }
      const newValidations = currentValidatedCount - validatedCount
      maximumNewValidations = Math.max(maximumNewValidations, newValidations)
      expect(newValidations).toBeGreaterThan(0)
      expect(newValidations).toBeLessThanOrEqual(7)
      validatedCount = currentValidatedCount
    }

    expect(maximumNewValidations).toBe(7)
    expect(validatedCount).toBe(zombieCapacity)
  })

  test('turns a floor-changing trail point into an authored stair traversal', () => {
    const world = createPlayerTrailStairWorld()
    const connector = world.navigationConnectors[0]!
    const arena = createZombieEscapeArena(74_003)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 74_004, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = connector.startX - connector.directionX
    state.player.y = connector.startY
    state.player.z = connector.startZ - connector.directionZ
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      connector.startX - connector.directionX * 2.5,
      connector.startZ - connector.directionZ * 2.5,
      connector.startY,
    )
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    for (let step = 0; step <= 40; step += 1) {
      const amount = step / 40
      state.player.x = connector.startX + (connector.endX - connector.startX) * amount
      state.player.y = connector.startY + (connector.endY - connector.startY) * amount
      state.player.z = connector.startZ + (connector.endZ - connector.startZ) * amount
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    for (let step = 1; step <= 30; step += 1) {
      state.player.x = connector.endX + connector.directionX * step * 0.1
      state.player.y = connector.endY
      state.player.z = connector.endZ + connector.directionZ * step * 0.1
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }

    const trailPoint = createZombieEscapePlayerTrailPoint()
    let linkedConnectorSequence = 0
    for (
      let sequence = getZombieEscapePlayerTrailOldestSequence(state.playerTrail);
      sequence <= state.playerTrail.newestSequence;
      sequence += 1
    ) {
      if (
        readZombieEscapePlayerTrailPoint(state.playerTrail, sequence, trailPoint) &&
        trailPoint.connectorIndex === 0 &&
        trailPoint.connectorTargetEnd
      ) {
        linkedConnectorSequence = sequence
        break
      }
    }
    expect(linkedConnectorSequence).toBeGreaterThan(0)

    state.zombies.speedScale[zombie] = 1
    let usedTrailConnector = false
    let enteredConnector = false
    let reachedUpperFloor = false
    for (let frame = 0; frame < 1_500 && !reachedUpperFloor; frame += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      usedTrailConnector ||= state.zombies.pursuitTrailConnectorSequence[zombie]! > 0
      enteredConnector ||= state.zombies.navigationConnector[zombie]! >= 0
      reachedUpperFloor =
        enteredConnector &&
        state.zombies.navigationConnector[zombie] === -1 &&
        Math.abs(state.zombies.y[zombie]! - connector.endY) < 0.001
    }

    expect(usedTrailConnector).toBe(true)
    expect(enteredConnector).toBe(true)
    expect(reachedUpperFloor).toBe(true)
  })

  test('uses the same authored trail connector when following downstairs', () => {
    const world = createPlayerTrailStairWorld()
    const connector = world.navigationConnectors[0]!
    const arena = createZombieEscapeArena(74_005)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 74_006, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = connector.endX + connector.directionX
    state.player.y = connector.endY
    state.player.z = connector.endZ + connector.directionZ
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      connector.endX + connector.directionX * 2.5,
      connector.endZ + connector.directionZ * 2.5,
      connector.endY,
    )
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    for (let step = 0; step <= 40; step += 1) {
      const amount = 1 - step / 40
      state.player.x = connector.startX + (connector.endX - connector.startX) * amount
      state.player.y = connector.startY + (connector.endY - connector.startY) * amount
      state.player.z = connector.startZ + (connector.endZ - connector.startZ) * amount
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }
    for (let step = 1; step <= 30; step += 1) {
      state.player.x = connector.startX - connector.directionX * step * 0.1
      state.player.y = connector.startY
      state.player.z = connector.startZ - connector.directionZ * step * 0.1
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    }

    const trailPoint = createZombieEscapePlayerTrailPoint()
    let linkedConnectorSequence = 0
    for (
      let sequence = getZombieEscapePlayerTrailOldestSequence(state.playerTrail);
      sequence <= state.playerTrail.newestSequence;
      sequence += 1
    ) {
      if (
        readZombieEscapePlayerTrailPoint(state.playerTrail, sequence, trailPoint) &&
        trailPoint.connectorIndex === 0 &&
        !trailPoint.connectorTargetEnd
      ) {
        linkedConnectorSequence = sequence
        break
      }
    }
    expect(linkedConnectorSequence).toBeGreaterThan(0)

    state.zombies.speedScale[zombie] = 1
    let usedTrailConnector = false
    let enteredConnector = false
    let reachedLowerFloor = false
    for (let frame = 0; frame < 1_500 && !reachedLowerFloor; frame += 1) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      usedTrailConnector ||= state.zombies.pursuitTrailConnectorSequence[zombie]! > 0
      enteredConnector ||= state.zombies.navigationConnector[zombie]! >= 0
      reachedLowerFloor =
        enteredConnector &&
        state.zombies.navigationConnector[zombie] === -1 &&
        Math.abs(state.zombies.y[zombie]! - connector.startY) < 0.001
    }

    expect(usedTrailConnector).toBe(true)
    expect(enteredConnector).toBe(true)
    expect(reachedLowerFloor).toBe(true)
  })
})

function createOccludedDoorwayPursuit(arenaSeed: number, simulationSeed: number) {
  const wall = (id: string, startX: number, startZ: number, endX: number, endZ: number) => ({
    breakable: false,
    endX,
    endZ,
    halfThickness: 0.1,
    id,
    maximumY: 2.8,
    minimumY: 0,
    navigationLayerY: 0,
    objectId: id,
    startX,
    startZ,
  })
  const world = createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'breadcrumb-latch-ground',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ],
    playRadius: 10,
    segments: [
      wall('breadcrumb-latch-north', -2, 2, 2, 2),
      wall('breadcrumb-latch-south', 2, -2, -2, -2),
      wall('breadcrumb-latch-west', -2, -2, -2, 2),
      wall('breadcrumb-latch-east-lower', 2, -2, 2, -0.6),
      wall('breadcrumb-latch-east-upper', 2, 0.6, 2, 2),
    ],
  })
  const arena = createZombieEscapeArena(arenaSeed)
  arena.obstacleCount = 0
  const state = createZombieEscapeSimulation(arena, simulationSeed, undefined, {
    zombieCapacity: 8,
  })
  const input = createZombieEscapeControlState()
  setZombieEscapeCollisionWorld(state, world, world)
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.x = 4
  state.player.y = 0
  state.player.z = 0
  publishSparseTarget(state, input, arena)
  const zombie = spawnZombieEscapeZombieAtNavigationElevation(state, 5.5, 0, 0)
  expect(zombie).toBeGreaterThanOrEqual(0)
  state.zombies.speedScale[zombie] = 0
  stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

  for (let step = 1; step <= 30; step += 1) {
    state.player.x = 4 - step * 0.1
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
  }
  for (let step = 1; step <= 18; step += 1) {
    state.player.z = step * 0.1
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
  }
  for (let step = 1; step <= 20; step += 1) {
    state.player.x = 1 - step * 0.1
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
  }

  expect(
    zombieEscapeSameLayerNavigationSegmentIsClear(
      state.collisionWorld,
      state.zombies.x[zombie]!,
      state.zombies.y[zombie]!,
      state.zombies.z[zombie]!,
      state.player.x,
      state.player.y,
      state.player.z,
      state.collisionWorld.agentRadius,
      createZombieEscapeCollisionHit(),
    ),
  ).toBe(false)
  return { arena, input, state, zombie }
}

function createThinOccludingWallWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: 0.05,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'terminal-retirement-ground',
        polygon: [
          { x: -4, z: -4 },
          { x: 4, z: -4 },
          { x: 4, z: 4 },
          { x: -4, z: 4 },
        ],
      },
    ],
    playRadius: 5,
    segments: [
      {
        breakable: false,
        endX: 0,
        endZ: 1,
        halfThickness: 0.02,
        id: 'terminal-retirement-wall',
        maximumY: 2.8,
        minimumY: 0,
        navigationLayerY: 0,
        objectId: 'terminal-retirement-wall',
        startX: 0,
        startZ: -1,
      },
    ],
  })
}

function createPlayerTrailStairWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    navigationConnectors: [
      {
        ascendingEnd: true,
        chainId: 'breadcrumb-stair',
        chainLowerY: 0,
        chainOrder: 0,
        chainUpperY: 3,
        endX: 0,
        endY: 3,
        endZ: 1.5,
        halfWidth: 0.75,
        id: 'breadcrumb-stair-flight',
        startX: 0,
        startY: 0,
        startZ: -1.5,
      },
    ],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'breadcrumb-stair-ground',
        polygon: [
          { x: -6, z: -6 },
          { x: 6, z: -6 },
          { x: 6, z: 6 },
          { x: -6, z: 6 },
        ],
      },
      {
        elevation: 3,
        id: 'breadcrumb-stair-upper',
        polygon: [
          { x: -6, z: -6 },
          { x: 6, z: -6 },
          { x: 6, z: 6 },
          { x: -6, z: 6 },
        ],
      },
    ],
    playRadius: 8,
  })
}

function publishSparseTarget(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
) {
  for (
    let frame = 0;
    frame < 1_200 &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    frame += 1
  ) {
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
  }
  expect(state.navigationGoalInitialized).toBe(true)
  expect(state.navigationField.graphSparseTargetUpdate.status).toBe('ready')
  expect(state.navigationTargetCommittedRouteGeneration).toBeGreaterThan(0)
}
