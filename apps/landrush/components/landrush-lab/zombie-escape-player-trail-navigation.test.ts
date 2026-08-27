import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  zombieEscapeSameLayerNavigationSegmentIsClear,
} from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapePlayerTrailPoint,
  getZombieEscapePlayerTrailOldestSequence,
  readZombieEscapePlayerTrailPoint,
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
