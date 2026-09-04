import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldWithoutObjects,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionWorld,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import {
  resolveSparseNavigationStrictRegionIndex,
  sparseNavigationTargetRegionContainsPoint,
} from '@landrush/zombie-gameplay/zombie-escape-sparse-navigation'
import {
  createZombieEscapeNavigationAgentInspection,
  inspectZombieEscapeNavigationAgent,
  ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY,
} from './zombie-escape-navigation-inspection'

describe('Zombie Escape navigation agent inspection', () => {
  test('reports the production action, pinned floor, strict region, next target, and generations', () => {
    const simulation = createInspectionSimulation()
    const output = createZombieEscapeNavigationAgentInspection()

    expect(inspectZombieEscapeNavigationAgent(simulation, 0, output)).toBe(true)
    expect(output).toMatchObject({
      action: 'route',
      active: true,
      anomalyMask: 0,
      connectorIndex: -1,
      layerIndex: 0,
      nextTargetValid: true,
      nextTargetX: 1.5,
      nextTargetY: 0,
      nextTargetZ: 1.5,
      poolGeneration: 7,
      regionIndex: 0,
      routeGeneration: 9,
      slot: 0,
      targetRevision: 4,
      worldGeneration: 3,
    })
  })

  test('fails closed on stale owner and emits no synthetic origin link for no action', () => {
    const simulation = createInspectionSimulation()
    simulation.zombies.navigationIntentPoolGeneration[0] = 6
    simulation.zombies.navigationIntentHasCached[0] = 0
    simulation.zombies.navigationIntentValid[0] = 0
    simulation.zombies.navigationReachable[0] = 0
    const output = createZombieEscapeNavigationAgentInspection()

    expect(inspectZombieEscapeNavigationAgent(simulation, 0, output)).toBe(true)
    expect(output.action).toBe('none')
    expect(output.nextTargetValid).toBe(false)
    expect(output.anomalyMask & ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.noCommittedAction).not.toBe(
      0,
    )
    expect(
      output.anomalyMask & ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.stalePoolGeneration,
    ).not.toBe(0)
  })

  test('exempts an active connector from strict-region ownership while retaining its exact target', () => {
    const simulation = createInspectionSimulation()
    simulation.zombies.navigationConnector[0] = 0
    simulation.zombies.navigationConnectorTargetEnd[0] = 1
    const output = createZombieEscapeNavigationAgentInspection()

    expect(inspectZombieEscapeNavigationAgent(simulation, 0, output)).toBe(true)
    expect(output.action).toBe('connector')
    expect(output.regionIndex).toBe(-1)
    expect(output.anomalyMask & ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.unownedRegion).toBe(0)
    expect(output.nextTargetValid).toBe(true)
    expect([output.nextTargetX, output.nextTargetY, output.nextTargetZ]).toEqual([2, 3, 2])
  })

  test('owns an admissible fallback-only position after its breakable blocker is removed', () => {
    const closedWorld = createFallbackOwnershipWorld()
    const openWorld = createZombieEscapeCollisionWorldWithoutObjects(
      closedWorld,
      new Set(['breakable-table']),
    )
    const targetRegionIndex = openWorld.navigationGraph.targetRegionIndex
    expect(resolveSparseNavigationStrictRegionIndex(targetRegionIndex, 0, 0, 0)).toBe(-1)
    expect(
      Array.from(targetRegionIndex.fallbacks).some(
        (fallback, region) =>
          fallback !== 0 &&
          targetRegionIndex.layerIndices[region] === 0 &&
          sparseNavigationTargetRegionContainsPoint(targetRegionIndex, region, 0, 0),
      ),
    ).toBe(true)

    const simulation = createInspectionSimulation()
    simulation.collisionWorld = closedWorld
    simulation.zombies.x[0] = 0
    simulation.zombies.z[0] = 0
    const output = createZombieEscapeNavigationAgentInspection()
    expect(inspectZombieEscapeNavigationAgent(simulation, 0, output)).toBe(true)
    expect(output.anomalyMask & ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.unownedRegion).not.toBe(0)

    simulation.collisionWorld = openWorld
    simulation.collisionWorldGeneration += 1
    simulation.zombies.navigationIntentWorldGeneration[0] = simulation.collisionWorldGeneration
    expect(inspectZombieEscapeNavigationAgent(simulation, 0, output)).toBe(true)
    expect(output.regionIndex).toBeGreaterThanOrEqual(0)
    expect(targetRegionIndex.fallbacks[output.regionIndex]).toBe(1)
    expect(output.anomalyMask & ZOMBIE_ESCAPE_NAVIGATION_AGENT_ANOMALY.unownedRegion).toBe(0)
  })
})

function createFallbackOwnershipWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: 0.25,
    boundaryPolicy: 'none',
    boxes: [
      {
        breakable: true,
        centerX: 0,
        centerZ: 0,
        halfDepth: 0.6,
        halfWidth: 0.6,
        id: 'breakable-table',
        objectId: 'breakable-table',
        rotation: 0,
      },
    ],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'floor',
        polygon: [
          { x: -4, z: -4 },
          { x: 4, z: -4 },
          { x: 4, z: 4 },
          { x: -4, z: 4 },
        ],
      },
    ],
    objectSemantics: [
      {
        objectId: 'breakable-table',
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
      },
    ],
    playRadius: 5,
  })
}

function createInspectionSimulation() {
  const world = {
    navigationConnectors: [
      {
        endX: 2,
        endY: 3,
        endZ: 2,
        startX: 0,
        startY: 0,
        startZ: 0,
      },
    ],
    navigationGraph: {
      layerIndices: Int16Array.of(0),
      nodeIds: ['node-0'],
      targetRegionIndex: {
        bucketHeight: 1,
        bucketOffsets: Uint32Array.of(0, 1),
        bucketRegionIndices: Uint32Array.of(0),
        bucketSize: 4,
        bucketWidth: 1,
        fallbacks: Uint8Array.of(0),
        firstXs: Float64Array.of(0),
        firstZs: Float64Array.of(0),
        layerCount: 1,
        layerIndices: Int16Array.of(0),
        maximumBucketRegionCount: 1,
        minimumBucketX: 0,
        minimumBucketZ: 0,
        secondXs: Float64Array.of(2),
        secondZs: Float64Array.of(0),
        thirdXs: Float64Array.of(0),
        thirdZs: Float64Array.of(2),
        witnessNodes: Int32Array.of(0),
      },
      x: Float64Array.of(1.5),
      z: Float64Array.of(1.5),
    },
    navigationLayers: [{ elevation: 0 }],
    navigationMode: 'sparse',
  } as unknown as ZombieEscapeCollisionWorld
  return {
    collisionWorld: world,
    collisionWorldGeneration: 3,
    navigationGoalInitialized: true,
    navigationGoalResolvedTick: 11,
    navigationGoalX: 3,
    navigationGoalY: 0,
    navigationGoalZ: 3,
    navigationIntentTick: 11,
    navigationTargetCommittedRouteGeneration: 9,
    navigationTargetRequestedRevision: 4,
    player: { x: 3, y: 0, z: 3 },
    zombies: {
      attackFocusX: Float32Array.of(0),
      attackFocusZ: Float32Array.of(0),
      attackTargetObjectId: [null],
      health: Float32Array.of(40),
      intent: Uint8Array.of(0),
      navigationConnector: Int16Array.of(-1),
      navigationConnectorTargetEnd: Uint8Array.of(0),
      navigationIntentAdmissionDeferredReasons: Uint8Array.of(0),
      navigationIntentCommittedRouteGeneration: Uint32Array.of(9),
      navigationIntentCurrentTargetFallback: Uint8Array.of(0),
      navigationIntentHasCached: Uint8Array.of(1),
      navigationIntentPending: Uint8Array.of(0),
      navigationIntentPoolGeneration: Uint32Array.of(7),
      navigationIntentTargetRevision: Uint32Array.of(4),
      navigationIntentValid: Uint8Array.of(1),
      navigationIntentWorldGeneration: Uint32Array.of(3),
      navigationReachable: Uint8Array.of(1),
      navigationSourceNeedsValidation: Uint8Array.of(0),
      navigationWaypointFallback: Uint8Array.of(0),
      navigationWaypointNode: Int32Array.of(0),
      pool: {
        active: Uint8Array.of(1),
        capacity: 1,
        generation: Uint32Array.of(7),
      },
      x: Float32Array.of(0.5),
      y: Float32Array.of(0),
      z: Float32Array.of(0.5),
    },
  } as unknown as ZombieEscapeSimulation
}
