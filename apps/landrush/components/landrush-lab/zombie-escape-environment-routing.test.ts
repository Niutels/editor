import { describe, expect, test } from 'bun:test'
import { createLandrushZombieEscapeCollisionWorldsResolver } from '@landrush/pascal-host/zombie-game-navigation'
import {
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  zombieEscapeSameLayerNavigationSegmentIsClear,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS } from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  spawnZombieEscapeZombieAtNavigationElevation,
  stepZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import {
  type AnyNode,
  BuildingNode,
  LevelNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  WallNode,
} from '@pascal-app/core'

const FIXED_DELTA_SECONDS = 1 / 60

describe('Zombie Escape environment-aware pursuit', () => {
  test('reattaches locally when a doorway interrupts direct pursuit', () => {
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
          id: 'doorway-ground',
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
        wall('doorway-north', -2, 2, 2, 2),
        wall('doorway-south', 2, -2, -2, -2),
        wall('doorway-west', -2, -2, -2, 2),
        wall('doorway-east-lower', 2, -2, 2, -0.6),
        wall('doorway-east-upper', 2, 0.6, 2, 2),
      ],
    })
    expect(world.navigationMode).toBe('sparse')
    const arena = createZombieEscapeArena(73_005)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 73_006, undefined, {
      zombieCapacity: 8,
    })
    setZombieEscapeCollisionWorld(state, world, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    const input = createZombieEscapeControlState()
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, 5, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).toBe('direct')

    const targetRevisionBeforeMove = state.navigationTargetRequestedRevision
    state.player.x = 0
    state.player.z = 1.4
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
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.navigationField.graphSparseTargetUpdate.status).toBe('pending')
    expect(state.zombies.pool.active[zombie]).toBe(1)
    expect(state.zombies.navigationWaypointNode[zombie]).toBeGreaterThanOrEqual(0)
    expect(
      Math.hypot(
        state.zombies.navigationDirectionX[zombie]!,
        state.zombies.navigationDirectionZ[zombie]!,
      ),
    ).toBeGreaterThan(0)
    for (
      let frame = 0;
      frame < 420 &&
      (state.navigationTargetRequestedRevision === targetRevisionBeforeMove ||
        state.zombies.navigationWaypointNode[zombie]! < 0);
      frame += 1
    ) {
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
    }
    expect(state.navigationTargetRequestedRevision).toBeGreaterThan(targetRevisionBeforeMove)
    const waypointNode = state.zombies.navigationWaypointNode[zombie]!
    expect(waypointNode).toBeGreaterThanOrEqual(0)
    expect(
      Math.hypot(
        world.navigationGraph.x[waypointNode]! - state.zombies.x[zombie]!,
        world.navigationGraph.z[waypointNode]! - state.zombies.z[zombie]!,
      ),
    ).toBeLessThan(4)
  })

  test('keeps stair endpoints attached when a wall is close to the upper landing', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: false,
          centerX: 0,
          centerZ: 2.2,
          halfDepth: 0.1,
          halfWidth: 3,
          id: 'upper-landing-wall',
          maximumY: 5.5,
          minimumY: 2.55,
          navigationLayerY: 3,
          objectId: 'upper-landing-wall',
          rotation: 0,
        },
      ],
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'landing-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 3,
          endX: 0,
          endY: 3,
          endZ: 1.5,
          halfWidth: 0.65,
          id: 'landing-stair-flight',
          startX: 0,
          startY: 0,
          startZ: -1.5,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'landing-ground',
          polygon: [
            { x: -7, z: -7 },
            { x: 7, z: -7 },
            { x: 7, z: 7 },
            { x: -7, z: 7 },
          ],
        },
        {
          elevation: 3,
          id: 'landing-upper',
          polygon: [
            { x: -7, z: -7 },
            { x: 7, z: -7 },
            { x: 7, z: 7 },
            { x: -7, z: 7 },
          ],
        },
      ],
      playRadius: 8,
    })
    const graph = world.navigationGraph
    const connectorIndex = 0
    const connectorNodes = Array.from(graph.connectorIndices)
      .map((value, node) => (value === connectorIndex ? node : -1))
      .filter((node) => node >= 0)

    expect(connectorNodes).toHaveLength(2)
    for (const node of connectorNodes) {
      const layerIndex = graph.layerIndices[node]!
      const neighbors = graph.strictAdjacency.toNodes.slice(
        graph.strictAdjacency.nodeOffsets[node]!,
        graph.strictAdjacency.nodeOffsets[node + 1]!,
      )
      expect(
        Array.from(neighbors).some((neighbor) => graph.layerIndices[neighbor] === layerIndex),
      ).toBe(true)
    }
    const upperNode = connectorNodes.find((node) => graph.layerIndices[node] === 1)!
    expect(graph.x[upperNode]).toBe(0)
    expect(graph.z[upperNode]).toBe(1.5)
  })

  test('keeps an inside zombie on the authored route through an offset building exit', () => {
    const building = BuildingNode.parse({
      children: ['level_room_route'],
      id: 'building_room_route',
    })
    const level = LevelNode.parse({
      children: [
        'slab_room_route',
        'wall_room_north',
        'wall_room_south',
        'wall_room_west',
        'wall_room_east_lower',
        'wall_room_east_upper',
      ],
      id: 'level_room_route',
      level: 0,
      parentId: building.id,
    })
    const slab = SlabNode.parse({
      id: 'slab_room_route',
      parentId: level.id,
      polygon: [
        [-6, -6],
        [6, -6],
        [6, 6],
        [-6, 6],
      ],
    })
    const walls = [
      WallNode.parse({
        end: [2, 3],
        id: 'wall_room_north',
        parentId: level.id,
        start: [-2, 3],
      }),
      WallNode.parse({
        end: [-2, -3],
        id: 'wall_room_south',
        parentId: level.id,
        start: [2, -3],
      }),
      WallNode.parse({
        end: [-2, 3],
        id: 'wall_room_west',
        parentId: level.id,
        start: [-2, -3],
      }),
      WallNode.parse({
        end: [2, 0.5],
        id: 'wall_room_east_lower',
        parentId: level.id,
        start: [2, -3],
      }),
      WallNode.parse({
        end: [2, 3],
        id: 'wall_room_east_upper',
        parentId: level.id,
        start: [2, 2],
      }),
    ]
    const worlds = compilePascalWorlds([building, level, slab, ...walls], 8)
    const arena = createZombieEscapeArena(73_001)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 73_002)
    setZombieEscapeCollisionWorld(state, worlds.navigation, worlds.combat)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = -3.2
    state.player.y = 0
    state.player.z = 2.5
    const input = createZombieEscapeControlState()
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombie(state, 0, 0)
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    const targetRevisionBeforeMove = state.navigationTargetRequestedRevision
    state.player.z = -2.5
    state.zombies.speedScale[zombie] = 1
    const visibilityHit = createZombieEscapeCollisionHit()
    let crossedOffsetExit = false
    let reachedPlayerSide = false
    let sawOccludedMovementAwayFromPlayer = false
    let sawRetarget = false

    for (let frame = 0; frame < 3_600 && !reachedPlayerSide; frame += 1) {
      const previousX = state.zombies.x[zombie]!
      const previousZ = state.zombies.z[zombie]!
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      sawRetarget ||= state.navigationTargetRequestedRevision > targetRevisionBeforeMove
      const visible = zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        state.zombies.x[zombie]!,
        state.zombies.y[zombie]!,
        state.zombies.z[zombie]!,
        state.player.x,
        state.player.y,
        state.player.z,
        state.collisionWorld.agentRadius,
        visibilityHit,
      )
      if (!visible) {
        expect(state.zombies.navigationIntentCurrentTargetFallback[zombie]).toBe(0)
        expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe(
          'attack-player',
        )
        const movementX = state.zombies.x[zombie]! - previousX
        const movementZ = state.zombies.z[zombie]! - previousZ
        sawOccludedMovementAwayFromPlayer ||=
          movementX * (state.player.x - previousX) + movementZ * (state.player.z - previousZ) <
          -0.000_001
      }
      if (previousX <= 2 && state.zombies.x[zombie]! > 2) {
        expect(state.zombies.z[zombie]).toBeGreaterThan(0.5)
        expect(state.zombies.z[zombie]).toBeLessThan(2)
        crossedOffsetExit = true
      }
      reachedPlayerSide =
        crossedOffsetExit &&
        state.zombies.x[zombie]! < -2.25 &&
        Math.hypot(
          state.zombies.x[zombie]! - state.player.x,
          state.zombies.z[zombie]! - state.player.z,
        ) < 1.5
    }

    expect(sawRetarget).toBe(true)
    expect(sawOccludedMovementAwayFromPlayer).toBe(true)
    expect(crossedOffsetExit).toBe(true)
    expect(reachedPlayerSide).toBe(true)
  })

  test('routes away in XZ to use a stair when the player is directly above', () => {
    const building = BuildingNode.parse({
      children: ['level_floor_route'],
      id: 'building_floor_route',
    })
    const level = LevelNode.parse({
      children: ['slab_floor_lower', 'slab_floor_upper', 'stair_floor_route'],
      id: 'level_floor_route',
      level: 0,
      parentId: building.id,
    })
    const segment = StairSegmentNode.parse({
      id: 'sseg_floor_route',
      parentId: 'stair_floor_route',
    })
    const stair = StairNode.parse({
      children: [segment.id],
      id: 'stair_floor_route',
      parentId: level.id,
      position: [4.25, 0, -7.5],
      rotation: Math.PI / 2,
    })
    const lowerSlab = SlabNode.parse({
      id: 'slab_floor_lower',
      parentId: level.id,
      polygon: [
        [-12, -12],
        [12, -12],
        [12, 12],
        [-12, 12],
      ],
    })
    const upperSlab = SlabNode.parse({
      elevation: segment.height,
      id: 'slab_floor_upper',
      parentId: level.id,
      polygon: [
        [1, -12],
        [12, -12],
        [12, -3],
        [1, -3],
      ],
    })
    const worlds = compilePascalWorlds([building, level, stair, segment, lowerSlab, upperSlab], 16)
    const [connector] = worlds.navigation.navigationConnectors
    expect(connector).toBeDefined()
    const targetX = connector!.endX + connector!.directionX
    const targetZ = connector!.endZ + connector!.directionZ
    const arena = createZombieEscapeArena(73_003)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 73_004)
    setZombieEscapeCollisionWorld(state, worlds.navigation, worlds.combat)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = targetX
    state.player.y = connector!.endY
    state.player.z = targetZ
    const input = createZombieEscapeControlState()
    publishSparseTarget(state, input, arena)
    const zombie = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      targetX,
      targetZ,
      connector!.startY,
    )
    expect(zombie).toBeGreaterThanOrEqual(0)
    state.zombies.speedScale[zombie] = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)

    const targetRevisionBeforeMove = state.navigationTargetRequestedRevision
    state.player.x += connector!.directionX * 3
    state.player.z += connector!.directionZ * 3
    state.zombies.speedScale[zombie] = 1
    const visibilityHit = createZombieEscapeCollisionHit()
    let enteredConnector = false
    let reachedUpperFloor = false
    let sawMovementAwayFromPlayer = false
    let sawRetarget = false

    for (let frame = 0; frame < 1_200 && !reachedUpperFloor; frame += 1) {
      const previousX = state.zombies.x[zombie]!
      const previousZ = state.zombies.z[zombie]!
      stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.zombies.pool.active[zombie]).toBe(1)
      sawRetarget ||= state.navigationTargetRequestedRevision > targetRevisionBeforeMove
      const visible = zombieEscapeSameLayerNavigationSegmentIsClear(
        state.collisionWorld,
        state.zombies.x[zombie]!,
        state.zombies.y[zombie]!,
        state.zombies.z[zombie]!,
        state.player.x,
        state.player.y,
        state.player.z,
        state.collisionWorld.agentRadius,
        visibilityHit,
      )
      if (!visible) {
        expect(state.zombies.navigationIntentCurrentTargetFallback[zombie]).toBe(0)
        expect(inspectZombieEscapeCommittedNavigationAction(state, zombie)).not.toBe(
          'attack-player',
        )
        const movementX = state.zombies.x[zombie]! - previousX
        const movementZ = state.zombies.z[zombie]! - previousZ
        sawMovementAwayFromPlayer ||=
          movementX * (state.player.x - previousX) + movementZ * (state.player.z - previousZ) <
          -0.000_001
      }
      enteredConnector ||= state.zombies.navigationConnector[zombie]! >= 0
      reachedUpperFloor =
        enteredConnector &&
        state.zombies.navigationConnector[zombie] === -1 &&
        Math.abs(state.zombies.y[zombie]! - connector!.endY) < 0.001
    }

    expect(sawRetarget).toBe(true)
    expect(sawMovementAwayFromPlayer).toBe(true)
    expect(enteredConnector).toBe(true)
    expect(reachedUpperFloor).toBe(true)
  })
})

function compilePascalWorlds(nodes: readonly AnyNode[], playRadius: number) {
  return createLandrushZombieEscapeCollisionWorldsResolver()({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<string, AnyNode>,
    playRadius,
    spawn: { x: 0, z: 0 },
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
