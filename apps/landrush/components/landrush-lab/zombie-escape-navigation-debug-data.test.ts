import { describe, expect, test } from 'bun:test'
import type { ZombieEscapeFlowField } from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionWorld,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import type {
  ZombieEscapeSparseNavigationAdjacency,
  ZombieEscapeSparseNavigationTargetRegionIndex,
} from '@landrush/zombie-gameplay/zombie-escape-sparse-navigation'
import {
  classifyZombieEscapeNavigationDebugAgents,
  countZombieEscapeNavigationDebugDraws,
  countZombieEscapeNavigationDebugStrictRegionOverlaps,
  countZombieEscapeNavigationDebugTerminalSegments,
  createZombieEscapeNavigationDebugLiveBuffers,
  createZombieEscapeNavigationDebugRouteSnapshot,
  createZombieEscapeNavigationDebugStaticSnapshot,
  resolveZombieEscapeNavigationDebugFeatureDrawRange,
  updateZombieEscapeNavigationDebugLiveGeometry,
  updateZombieEscapeNavigationDebugTerminalLinks,
  ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR,
  zombieEscapeNavigationDebugClassificationIsCurrent,
} from './zombie-escape-navigation-debug-data'

describe('Zombie Escape navigation debug packed data', () => {
  test('packs strict and fallback triangles while omitting shared seams from strong boundaries', () => {
    const index = createTargetRegionIndex([
      { fallback: false, points: [0, 0, 2, 0, 0, 2] },
      { fallback: false, points: [2, 0, 2, 2, 0, 2] },
      { fallback: true, points: [4, 0, 5, 0, 4, 1] },
    ])
    const snapshot = createZombieEscapeNavigationDebugStaticSnapshot(createWorld(index))
    const layer = snapshot.layers[0]!

    expect(layer.strictRegionVertexCount).toBe(6)
    expect(layer.regionTrianglePositions.length / 3).toBe(9)
    expect(layer.strictBoundaryVertexCount).toBe(24)
    expect(layer.boundaryTrianglePositions.length / 3).toBe(42)
    expect(layer.regionTriangleColors.length).toBe(layer.regionTrianglePositions.length)
    expect(layer.boundaryTriangleColors.length).toBe(layer.boundaryTrianglePositions.length)
    expect(layer.regionOverlapMarkerPositions.length).toBe(0)
  })

  test('marks only positive-area same-variant overlaps and excludes a shared triangle seam', () => {
    const sharedSeam = createTargetRegionIndex([
      { fallback: false, points: [0, 0, 2, 0, 0, 2] },
      { fallback: false, points: [2, 0, 2, 2, 0, 2] },
    ])
    expect(countZombieEscapeNavigationDebugStrictRegionOverlaps(sharedSeam, 0, 1, 1)).toBe(0)
    expect(
      createZombieEscapeNavigationDebugStaticSnapshot(createWorld(sharedSeam)).layers[0]!
        .regionOverlapMarkerPositions.length,
    ).toBe(0)

    const overlap = createTargetRegionIndex([
      { fallback: false, points: [0, 0, 2, 0, 0, 2] },
      { fallback: false, points: [0.2, 0.2, 1.4, 0.2, 0.2, 1.4] },
      { fallback: true, points: [0.3, 0.3, 1.2, 0.3, 0.3, 1.2] },
      { fallback: true, points: [0.4, 0.4, 1, 0.4, 0.4, 1] },
    ])
    expect(countZombieEscapeNavigationDebugStrictRegionOverlaps(overlap, 0, 0.4, 0.4)).toBe(2)
    expect(
      createZombieEscapeNavigationDebugStaticSnapshot(createWorld(overlap)).layers[0]!
        .regionOverlapMarkerPositions.length,
    ).toBe(6)
    expect(
      createZombieEscapeNavigationDebugStaticSnapshot(createWorld(overlap)).layers[0]!
        .strictRegionOverlapMarkerCount,
    ).toBe(1)
  })

  test('emits cyan door links only from exact active semantic breach ordinals', () => {
    const index = createTargetRegionIndex([])
    const doorWorld = createWorld(index, {
      activeObjectMask: Uint8Array.of(1),
      breachObjectOrdinals: Uint32Array.of(0),
      fallbackAdjacency: createTwoNodeDoorAdjacency(),
      objectIds: ['door-a'],
      objectSemanticKinds: Uint8Array.of(ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door),
    })
    const doorLayer = createZombieEscapeNavigationDebugStaticSnapshot(doorWorld).layers[0]!
    const doorFeatureOffset = doorLayer.graphFeatureLineVertexCount * 3
    expect(Array.from(doorLayer.featureLinePositions.slice(doorFeatureOffset))).toEqual([
      0,
      expect.closeTo(0.055),
      0,
      2,
      expect.closeTo(0.055),
      0,
    ])
    expect(Array.from(doorLayer.featureLineColors.slice(doorFeatureOffset))).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.88),
      1,
      expect.closeTo(0.1),
      expect.closeTo(0.88),
      1,
    ])

    const furnitureWorld = createWorld(index, {
      activeObjectMask: Uint8Array.of(1),
      breachObjectOrdinals: Uint32Array.of(0),
      fallbackAdjacency: createTwoNodeDoorAdjacency(),
      objectIds: ['item-a'],
      objectSemanticKinds: Uint8Array.of(ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture),
    })
    expect(
      createZombieEscapeNavigationDebugStaticSnapshot(furnitureWorld).layers[0]!
        .graphFeatureLineVertexCount,
    ).toBe(
      createZombieEscapeNavigationDebugStaticSnapshot(furnitureWorld).layers[0]!
        .featureLinePositions.length / 3,
    )

    doorWorld.activeObjectMask[0] = 0
    expect(
      createZombieEscapeNavigationDebugStaticSnapshot(doorWorld).layers[0]!
        .graphFeatureLineVertexCount,
    ).toBe(
      createZombieEscapeNavigationDebugStaticSnapshot(doorWorld).layers[0]!.featureLinePositions
        .length / 3,
    )
  })

  test('packs every unique strict and fallback-only graph edge with layered nodes', () => {
    const targetRegionIndex = createTargetRegionIndex([
      { fallback: false, points: [0, 0, 1, 0, 0, 1] },
    ])
    const snapshot = createZombieEscapeNavigationDebugStaticSnapshot(
      createWorld(targetRegionIndex, {
        connectorEnds: Uint8Array.of(0, 0, 0, 1),
        connectorIndices: Int16Array.of(-1, -1, 0, 0),
        fallbackAdjacency: createUndirectedAdjacency(4, [
          [0, 1],
          [1, 2],
          [2, 3],
        ]),
        layerIndices: Int16Array.of(0, 0, 0, 1),
        navigationLayers: [{ elevation: 0 }, { elevation: 3 }],
        strictAdjacency: createUndirectedAdjacency(4, [
          [0, 1],
          [2, 3],
        ]),
        x: Float64Array.of(0, 1, 2, 2),
        z: Float64Array.of(0, 0, 0, 2),
      }),
    )

    expect(snapshot.graphNodeCount).toBe(4)
    expect(snapshot.graphStrictEdgeCount).toBe(2)
    expect(snapshot.graphFallbackOnlyEdgeCount).toBe(1)
    expect(snapshot.layers[0]!.graphFeatureLineVertexCount).toBe(6)
    expect(snapshot.layers[1]!.graphFeatureLineVertexCount).toBe(2)
    expect(Array.from(snapshot.layers[0]!.featureLinePositions.slice(0, 18))).toEqual([
      0,
      expect.closeTo(0.095),
      0,
      1,
      expect.closeTo(0.095),
      0,
      1,
      expect.closeTo(0.095),
      0,
      2,
      expect.closeTo(0.095),
      0,
      2,
      expect.closeTo(0.095),
      0,
      2,
      expect.closeTo(3.095),
      2,
    ])
    expect(Array.from(snapshot.layers[1]!.featureLinePositions.slice(0, 6))).toEqual([
      2,
      expect.closeTo(0.095),
      0,
      2,
      expect.closeTo(3.095),
      2,
    ])
    expect(Array.from(snapshot.layers[0]!.graphNodePositions)).toEqual([
      0,
      expect.closeTo(0.115),
      0,
      1,
      expect.closeTo(0.115),
      0,
      2,
      expect.closeTo(0.115),
      0,
    ])
    expect(Array.from(snapshot.layers[1]!.graphNodePositions)).toEqual([
      2,
      expect.closeTo(3.115),
      2,
    ])
    expect(Array.from(snapshot.layers[0]!.featureLineColors.slice(0, 3))).toEqual([
      expect.closeTo(0.12),
      expect.closeTo(0.68),
      1,
    ])
    expect(Array.from(snapshot.layers[0]!.featureLineColors.slice(6, 9))).toEqual([
      1,
      expect.closeTo(0.52),
      expect.closeTo(0.08),
    ])
    expect(Array.from(snapshot.layers[0]!.featureLineColors.slice(12, 15))).toEqual([
      expect.closeTo(0.82),
      expect.closeTo(0.46),
      1,
    ])
    expect(Array.from(snapshot.layers[0]!.graphNodeColors.slice(0, 3))).toEqual([
      1,
      expect.closeTo(0.9),
      expect.closeTo(0.22),
    ])
    expect(Array.from(snapshot.layers[1]!.graphNodeColors)).toEqual([
      1,
      expect.closeTo(0.08),
      expect.closeTo(0.26),
    ])
  })

  test('packs directional route arrows only for the authenticated target-layer bank', () => {
    const world = createWorld(createTargetRegionIndex([]), {
      fallbackAdjacency: createEmptyAdjacency(2),
    })
    const field = createRouteField(world)
    const snapshot = createZombieEscapeNavigationDebugRouteSnapshot(field)

    expect(snapshot.generation).toBe(5)
    expect(snapshot.layers[0]!.linePositions.length).toBe(18)
    expect(Array.from(snapshot.layers[0]!.linePositions.slice(0, 6))).toEqual([
      0,
      expect.closeTo(0.075),
      0,
      2,
      expect.closeTo(0.075),
      0,
    ])
    expect(Array.from(snapshot.layers[0]!.linePositions.slice(6, 9))).toEqual([
      2,
      expect.closeTo(0.075),
      0,
    ])
    expect(Array.from(snapshot.layers[0]!.linePositions.slice(12, 15))).toEqual([
      2,
      expect.closeTo(0.075),
      0,
    ])
    expect(Array.from(snapshot.layers[0]!.terminalAnchorPositions)).toEqual([
      2,
      expect.closeTo(0.075),
      0,
    ])

    ;(
      field as unknown as {
        graphReverseFieldBanks: { banks: Array<{ routeTargetLayerIndex: number }> }
      }
    ).graphReverseFieldBanks.banks[0]!.routeTargetLayerIndex = 1
    expect(() => createZombieEscapeNavigationDebugRouteSnapshot(field)).toThrow(
      'route bank is not current',
    )
  })

  test('accepts a conservative route bank only after production acknowledges a mask removal', () => {
    const world = createWorld(createTargetRegionIndex([]), {
      fallbackAdjacency: createEmptyAdjacency(2),
    })
    const field = createRouteField(world)
    ;(world as { revision: string }).revision = 'world-after-removal'

    expect(() => createZombieEscapeNavigationDebugRouteSnapshot(field)).toThrow(
      'route bank is not current',
    )
    field.graphSparseTargetUpdate.status = 'ready'
    field.graphSparseTargetUpdate.worldRevision = world.revision
    expect(() => createZombieEscapeNavigationDebugRouteSnapshot(field)).not.toThrow()

    field.graphSparseTargetUpdate.status = 'pending'
    expect(() => createZombieEscapeNavigationDebugRouteSnapshot(field)).not.toThrow()

    field.graphSparseTargetUpdate.status = 'invalidated'
    expect(() => createZombieEscapeNavigationDebugRouteSnapshot(field)).toThrow(
      'route bank is not current',
    )
  })

  test('terminates arrows at the production effective committed target', () => {
    const world = createWorld(createTargetRegionIndex([]), {
      fallbackAdjacency: createEmptyAdjacency(2),
    })
    const field = createRouteField(world)
    field.graphSparseTargetUpdate.routeTargetInitialized = true
    field.graphSparseTargetUpdate.routeTargetLayerIndex = 0
    field.graphSparseTargetUpdate.routeTargetX = 7
    field.graphSparseTargetUpdate.routeTargetY = 0
    field.graphSparseTargetUpdate.routeTargetZ = 4
    field.graphFallbackNextNodes[1] = 0

    const snapshot = createZombieEscapeNavigationDebugRouteSnapshot(field)
    expect(Array.from(snapshot.layers[0]!.terminalAnchorPositions)).toEqual([
      2,
      expect.closeTo(0.075),
      0,
    ])
    const buffers = createZombieEscapeNavigationDebugLiveBuffers(
      1,
      countZombieEscapeNavigationDebugTerminalSegments(snapshot),
    )
    expect(updateZombieEscapeNavigationDebugTerminalLinks(field, snapshot, buffers, 0)).toBe(3)
    expect(Array.from(buffers.linkPositions.slice(0, 6))).toEqual([
      2,
      expect.closeTo(0.075),
      0,
      7,
      expect.closeTo(0.075),
      4,
    ])

    field.graphSparseTargetUpdate.routeTargetX = 8
    field.graphSparseTargetUpdate.routeTargetZ = 5
    updateZombieEscapeNavigationDebugTerminalLinks(field, snapshot, buffers, 0)
    expect(Array.from(buffers.linkPositions.slice(3, 6))).toEqual([8, expect.closeTo(0.075), 5])

    field.graphSparseTargetUpdate.status = 'invalidated'
    updateZombieEscapeNavigationDebugTerminalLinks(field, snapshot, buffers, 0)
    expect(Array.from(buffers.linkPositions.slice(3, 6))).toEqual([3, expect.closeTo(0.075), 1])

    field.graphSparseTargetUpdate.status = 'ready'
    field.graphSparseTargetUpdate.routeTargetLayerIndex = 1
    updateZombieEscapeNavigationDebugTerminalLinks(field, snapshot, buffers, 0)
    expect(Array.from(buffers.linkPositions.slice(3, 6))).toEqual([3, expect.closeTo(0.075), 1])
  })

  test('keeps the packed visual contract at nine batched draws per visible floor', () => {
    const layer = createZombieEscapeNavigationDebugStaticSnapshot(
      createWorld(
        createTargetRegionIndex([
          { fallback: false, points: [0, 0, 2, 0, 0, 2] },
          { fallback: false, points: [0.2, 0.2, 1.4, 0.2, 0.2, 1.4] },
        ]),
        { fallbackAdjacency: createEmptyAdjacency(1) },
      ),
    ).layers[0]!
    const route = {
      lineColors: Float32Array.of(0, 1, 0, 0, 1, 0),
      linePositions: Float32Array.of(0, 0, 0, 1, 0, 1),
    }

    expect(
      countZombieEscapeNavigationDebugDraws([layer], [route], 0, true, true, 100, 100, 1),
    ).toBeLessThanOrEqual(9)
    expect(countZombieEscapeNavigationDebugDraws([layer], [route], 0, true, true, 1, 1, 0)).toBe(
      countZombieEscapeNavigationDebugDraws([layer], [route], 0, true, true, 1, 0, 0) + 1,
    )
    expect(countZombieEscapeNavigationDebugDraws([layer], [route], 0, true, true, 1, 0, 0)).toBe(
      countZombieEscapeNavigationDebugDraws([layer], [route], 0, true, false, 1, 0, 0) + 1,
    )
    expect(resolveZombieEscapeNavigationDebugFeatureDrawRange(layer, true)).toEqual({
      count: layer.featureLinePositions.length / 3,
      start: 0,
    })
    expect(resolveZombieEscapeNavigationDebugFeatureDrawRange(layer, false)).toEqual({
      count: layer.featureLinePositions.length / 3 - layer.graphFeatureLineVertexCount,
      start: layer.graphFeatureLineVertexCount,
    })
  })

  test('packs active blockers in red semantic shades and connectors in purple', () => {
    const targetRegionIndex = createTargetRegionIndex([])
    const blockers = createWorld(targetRegionIndex, {
      activeObjectMask: Uint8Array.of(1, 1),
      boxes: [createBox('door-a', 0), createBox('item-a', 3)],
      colliderObjectOrdinals: Int32Array.of(0, 1),
      objectIds: ['door-a', 'item-a'],
      objectSemanticKinds: Uint8Array.of(
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
      ),
    })
    const blockerLayer = createZombieEscapeNavigationDebugStaticSnapshot(blockers).layers[0]!
    expect(blockerLayer.featureLinePositions.length).toBe(48)
    expect(Array.from(blockerLayer.featureLineColors.slice(0, 3))).toEqual([
      1,
      expect.closeTo(0.08),
      expect.closeTo(0.12),
    ])
    expect(Array.from(blockerLayer.featureLineColors.slice(24, 27))).toEqual([
      1,
      expect.closeTo(0.2),
      expect.closeTo(0.28),
    ])

    blockers.activeObjectMask[0] = 0
    expect(
      createZombieEscapeNavigationDebugStaticSnapshot(blockers).layers[0]!.featureLinePositions
        .length,
    ).toBe(24)

    const connectorLayer = createZombieEscapeNavigationDebugStaticSnapshot(
      createWorld(targetRegionIndex, {
        navigationConnectors: [
          {
            endLayerIndex: 0,
            endX: 2,
            endY: 1,
            endZ: 2,
            objectId: 'stairs-a',
            startLayerIndex: 0,
            startX: 0,
            startY: 0,
            startZ: 0,
          },
        ] as ZombieEscapeCollisionWorld['navigationConnectors'],
      }),
    ).layers[0]!
    expect(Array.from(connectorLayer.featureLineColors.slice(0, 3))).toEqual([
      expect.closeTo(0.76),
      expect.closeTo(0.36),
      1,
    ])
  })

  test('reuses live buffers, filters floors, and never draws a no-action link to the origin', () => {
    const simulation = createLiveSimulation()
    const buffers = createZombieEscapeNavigationDebugLiveBuffers(1)
    const agentPositions = buffers.agentPositions
    const linkPositions = buffers.linkPositions

    expect(classifyZombieEscapeNavigationDebugAgents(simulation, buffers)).toBe(1)
    expect(updateZombieEscapeNavigationDebugLiveGeometry(simulation, buffers, 0)).toBe(buffers)
    expect(buffers.visibleAnomalyCount).toBe(0)
    expect(buffers.linkCount).toBe(1)
    expect(buffers.visibleCount).toBe(1)
    expect(updateZombieEscapeNavigationDebugLiveGeometry(simulation, buffers, 1).visibleCount).toBe(
      0,
    )
    expect(
      updateZombieEscapeNavigationDebugLiveGeometry(
        simulation,
        buffers,
        ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all,
      ).visibleCount,
    ).toBe(1)

    simulation.zombies.navigationIntentHasCached[0] = 0
    simulation.zombies.navigationIntentValid[0] = 0
    simulation.zombies.navigationReachable[0] = 0
    classifyZombieEscapeNavigationDebugAgents(simulation, buffers)
    const noAction = updateZombieEscapeNavigationDebugLiveGeometry(simulation, buffers, 0)
    expect(noAction.linkCount).toBe(0)
    expect(buffers.agentPositions).toBe(agentPositions)
    expect(buffers.linkPositions).toBe(linkPositions)
  })

  test('invalidates live classifications on slot reuse or navigation tuple changes', () => {
    const simulation = createLiveSimulation()
    const buffers = createZombieEscapeNavigationDebugLiveBuffers(1)
    classifyZombieEscapeNavigationDebugAgents(simulation, buffers)
    expect(zombieEscapeNavigationDebugClassificationIsCurrent(simulation, buffers)).toBe(true)

    for (const invalidate of [
      () => {
        simulation.zombies.pool.generation[0] = 8
      },
      () => {
        simulation.collisionWorldGeneration += 1
      },
      () => {
        ;(simulation.collisionWorld as { activationRevision: number }).activationRevision += 1
      },
      () => {
        simulation.navigationTargetCommittedRouteGeneration += 1
      },
      () => {
        simulation.navigationTargetRequestedRevision += 1
      },
    ]) {
      invalidate()
      expect(zombieEscapeNavigationDebugClassificationIsCurrent(simulation, buffers)).toBe(false)
      expect(
        updateZombieEscapeNavigationDebugLiveGeometry(simulation, buffers, 0).visibleCount,
      ).toBe(0)
      classifyZombieEscapeNavigationDebugAgents(simulation, buffers)
      expect(zombieEscapeNavigationDebugClassificationIsCurrent(simulation, buffers)).toBe(true)
    }
  })

  test('does not mutate the source-world identity or packed inputs', () => {
    const world = createWorld(
      createTargetRegionIndex([{ fallback: false, points: [0, 0, 2, 0, 0, 2] }]),
      {
        activeObjectMask: Uint8Array.of(1),
        boxes: [createBox('door-a', 0)],
        colliderObjectOrdinals: Int32Array.of(0),
        objectIds: ['door-a'],
        objectSemanticKinds: Uint8Array.of(ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door),
      },
    )
    const before = sourceWorldIdentity(world)

    createZombieEscapeNavigationDebugStaticSnapshot(world)

    expect(sourceWorldIdentity(world)).toBe(before)
    expect(world.revision).toBe('world-a')
    expect(world.semanticKey).toBe('semantic-a')
  })
})

type RegionDefinition = Readonly<{
  fallback: boolean
  points: readonly [number, number, number, number, number, number]
}>

function createTargetRegionIndex(
  definitions: readonly RegionDefinition[],
): ZombieEscapeSparseNavigationTargetRegionIndex {
  const strictRegionIndices = definitions.flatMap(({ fallback }, index) =>
    fallback ? [] : [index],
  )
  return {
    bucketHeight: strictRegionIndices.length > 0 ? 1 : 0,
    bucketOffsets:
      strictRegionIndices.length > 0
        ? Uint32Array.of(0, strictRegionIndices.length)
        : Uint32Array.of(0),
    bucketRegionIndices: Uint32Array.from(strictRegionIndices),
    bucketSize: 8,
    bucketWidth: strictRegionIndices.length > 0 ? 1 : 0,
    fallbacks: Uint8Array.from(definitions.map(({ fallback }) => (fallback ? 1 : 0))),
    firstXs: Float64Array.from(definitions.map(({ points }) => points[0])),
    firstZs: Float64Array.from(definitions.map(({ points }) => points[1])),
    layerCount: strictRegionIndices.length > 0 ? 1 : 0,
    layerIndices: new Int16Array(definitions.length),
    maximumBucketRegionCount: strictRegionIndices.length,
    minimumBucketX: 0,
    minimumBucketZ: 0,
    secondXs: Float64Array.from(definitions.map(({ points }) => points[2])),
    secondZs: Float64Array.from(definitions.map(({ points }) => points[3])),
    thirdXs: Float64Array.from(definitions.map(({ points }) => points[4])),
    thirdZs: Float64Array.from(definitions.map(({ points }) => points[5])),
    witnessNodes: new Int32Array(definitions.length),
  }
}

function createEmptyAdjacency(nodeCount: number): ZombieEscapeSparseNavigationAdjacency {
  return {
    breachCounts: new Uint32Array(0),
    breachObjectIndices: new Uint32Array(0),
    breachObjectOffsets: Uint32Array.of(0),
    nodeOffsets: new Uint32Array(nodeCount + 1),
    toNodes: new Int32Array(0),
    weights: new Float32Array(0),
  }
}

function createTwoNodeDoorAdjacency(): ZombieEscapeSparseNavigationAdjacency {
  return {
    breachCounts: Uint32Array.of(1, 1),
    breachObjectIndices: Uint32Array.of(0, 0),
    breachObjectOffsets: Uint32Array.of(0, 1, 2),
    nodeOffsets: Uint32Array.of(0, 1, 2),
    toNodes: Int32Array.of(1, 0),
    weights: Float32Array.of(2, 2),
  }
}

function createUndirectedAdjacency(
  nodeCount: number,
  edges: readonly (readonly [number, number])[],
): ZombieEscapeSparseNavigationAdjacency {
  const directed = edges
    .flatMap(([first, second]) => [
      { from: first, to: second },
      { from: second, to: first },
    ])
    .sort((first, second) => first.from - second.from || first.to - second.to)
  const nodeOffsets = new Uint32Array(nodeCount + 1)
  for (const edge of directed) nodeOffsets[edge.from + 1]! += 1
  for (let node = 0; node < nodeCount; node += 1) {
    nodeOffsets[node + 1] = nodeOffsets[node + 1]! + nodeOffsets[node]!
  }
  return {
    breachCounts: new Uint32Array(directed.length),
    breachObjectIndices: new Uint32Array(0),
    breachObjectOffsets: new Uint32Array(directed.length + 1),
    nodeOffsets,
    toNodes: Int32Array.from(directed.map(({ to }) => to)),
    weights: new Float32Array(directed.length).fill(1),
  }
}

function createWorld(
  targetRegionIndex: ZombieEscapeSparseNavigationTargetRegionIndex,
  overrides: Readonly<{
    activeObjectMask?: Uint8Array
    breachObjectOrdinals?: Uint32Array
    fallbackAdjacency?: ZombieEscapeSparseNavigationAdjacency
    objectIds?: readonly string[]
    objectSemanticKinds?: Uint8Array
    boxes?: ZombieEscapeCollisionWorld['boxes']
    colliderObjectOrdinals?: Int32Array
    connectorEnds?: Uint8Array
    connectorIndices?: Int16Array
    layerIndices?: Int16Array
    navigationConnectors?: ZombieEscapeCollisionWorld['navigationConnectors']
    navigationLayers?: ZombieEscapeCollisionWorld['navigationLayers']
    strictAdjacency?: ZombieEscapeSparseNavigationAdjacency
    x?: Float64Array
    z?: Float64Array
  }> = {},
) {
  const nodeCount = Math.max(
    overrides.x?.length ?? 0,
    (overrides.fallbackAdjacency?.nodeOffsets.length ?? 1) - 1,
    (overrides.strictAdjacency?.nodeOffsets.length ?? 1) - 1,
  )
  const emptyAdjacency = createEmptyAdjacency(nodeCount)
  const objectIds = overrides.objectIds ?? []
  return {
    activeObjectMask: overrides.activeObjectMask ?? new Uint8Array(objectIds.length),
    activationRevision: 0,
    boxes: overrides.boxes ?? [],
    circles: [],
    navigationConnectors: overrides.navigationConnectors ?? [],
    navigationGraph: {
      breachObjectOrdinals: overrides.breachObjectOrdinals ?? new Uint32Array(0),
      connectorEnds: overrides.connectorEnds ?? new Uint8Array(nodeCount),
      connectorIndices: overrides.connectorIndices ?? new Int16Array(nodeCount).fill(-1),
      fallbackAdjacency: overrides.fallbackAdjacency ?? emptyAdjacency,
      layerIndices: overrides.layerIndices ?? new Int16Array(nodeCount),
      nodeIds: Array.from({ length: nodeCount }, (_, index) => `node-${String(index)}`),
      strictAdjacency: overrides.strictAdjacency ?? emptyAdjacency,
      targetRegionIndex,
      x: overrides.x ?? Float64Array.from({ length: nodeCount }, (_, index) => index * 2),
      z: overrides.z ?? new Float64Array(nodeCount),
    },
    navigationLayers: overrides.navigationLayers ?? [{ elevation: 0 }],
    objectCatalog: {
      colliderObjectOrdinals: overrides.colliderObjectOrdinals ?? new Int32Array(0),
      objectIds,
      objectSemanticKinds: overrides.objectSemanticKinds ?? new Uint8Array(objectIds.length),
    },
    revision: 'world-a',
    segments: [],
    semanticKey: 'semantic-a',
  } as unknown as ZombieEscapeCollisionWorld
}

function createBox(objectId: string, centerX: number) {
  return {
    centerX,
    centerZ: 0,
    cosine: 1,
    halfDepth: 0.5,
    halfWidth: 0.5,
    navigationLayerY: 0,
    objectId,
    sine: 0,
  } as ZombieEscapeCollisionWorld['boxes'][number]
}

function sourceWorldIdentity(world: ZombieEscapeCollisionWorld) {
  return JSON.stringify({
    activeObjectMask: Array.from(world.activeObjectMask),
    boxes: world.boxes,
    objectSemanticKinds: Array.from(world.objectCatalog.objectSemanticKinds),
    revision: world.revision,
    semanticKey: world.semanticKey,
    targetFirstXs: Array.from(world.navigationGraph.targetRegionIndex.firstXs),
  })
}

function createLiveSimulation() {
  const world = createWorld(
    createTargetRegionIndex([{ fallback: false, points: [0, 0, 2, 0, 0, 2] }]),
    { fallbackAdjacency: createEmptyAdjacency(1) },
  )
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

function createRouteField(world: ZombieEscapeCollisionWorld) {
  const bank = {
    generation: 5,
    routeTargetInitialized: true,
    routeTargetLayerIndex: 0,
    routeTargetX: 3,
    routeTargetY: 0,
    routeTargetZ: 1,
    targetLayerIndex: 0,
    worldRevision: world.revision,
  }
  return {
    graphFallbackNextNodes: Int32Array.of(-1, -1),
    graphFallbackTargetNodeMarks: Uint8Array.of(0, 0),
    graphSparseTargetUpdate: {
      routeTargetInitialized: false,
      routeTargetLayerIndex: 0,
      routeTargetX: 0,
      routeTargetY: 0,
      routeTargetZ: 0,
      status: 'ready',
      worldRevision: world.revision,
    },
    graphReverseFieldBanks: {
      activeBankIndex: 0,
      allocatedBytes: 0,
      bankReaderCounts: Uint8Array.of(0, 0),
      banks: [bank, { ...bank, generation: 0 }],
      leaseInvariantViolationCount: 0,
      maximumReaderLeaseCount: 0,
      publicationBlockedCount: 0,
      publicationCount: 1,
      readerOwnerTokens: new Uint32Array(10),
    },
    graphStrictNextNodes: Int32Array.of(1, -1),
    graphStrictTargetNodeMarks: Uint8Array.of(0, 1),
    targetLayerIndex: 0,
    world,
  } as unknown as ZombieEscapeFlowField
}
