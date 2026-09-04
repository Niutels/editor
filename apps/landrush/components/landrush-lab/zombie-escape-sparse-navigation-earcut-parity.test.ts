import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  createZombieEscapeCollisionWorld,
  type ZombieEscapeSparseNavigationAdjacency,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'

describe('Zombie Escape sparse navigation Earcut parity', () => {
  test('preserves the production graph built by the Three 0.185.1 Earcut 3.0.2 wrapper', () => {
    const polygon = Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2
      const radius = 18 + ((index % 7) - 3) * 0.04
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
    })
    const hole = Array.from({ length: 16 }, (_, index) => {
      const angle = ((15 - index) / 16) * Math.PI * 2
      return { x: 1 + Math.cos(angle) * 2.5, z: -1 + Math.sin(angle) * 1.8 }
    })
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.34,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: -5,
          centerZ: 1.5,
          halfDepth: 0.45,
          halfWidth: 1.2,
          id: 'cabinet',
          maximumY: 2,
          minimumY: 0,
          objectId: 'cabinet',
          rotation: Math.PI / 7,
        },
        {
          centerX: 5,
          centerZ: 2,
          halfDepth: 3.2,
          halfWidth: 0.3,
          id: 'wall',
          maximumY: 3,
          minimumY: 0,
          rotation: 0.2,
        },
      ],
      cellSize: 0.25,
      circles: [{ id: 'column', maximumY: 3, minimumY: 0, radius: 0.8, x: 0, z: 7 }],
      navigationSupports: [{ boundary: true, elevation: 0, holes: [hole], id: 'ground', polygon }],
      playRadius: 24,
    })
    const graph = world.navigationGraph

    expect(world.revision).toBe('a0113e3a')
    expect(graph.nodeIds).toHaveLength(371)
    expect(graph.strictAdjacency.toNodes).toHaveLength(726)
    expect(graph.fallbackAdjacency.toNodes).toHaveLength(784)
    expect(hashNavigationGraph(graph)).toBe(
      '89e57a276eae97b37a5e44fcc9831f1e19a96bce7cc41224fc112bcf1554b826',
    )
  })
})

function hashNavigationGraph(
  graph: ReturnType<typeof createZombieEscapeCollisionWorld>['navigationGraph'],
) {
  const targetRegions = graph.targetRegionIndex
  const serialized = JSON.stringify({
    breachObjectCount: graph.breachObjectCount,
    breachObjectOrdinals: [...graph.breachObjectOrdinals],
    connectorEnds: [...graph.connectorEnds],
    connectorIndices: [...graph.connectorIndices],
    fallbackAdjacency: serializeAdjacency(graph.fallbackAdjacency),
    fallbackComponentIndices: [...graph.fallbackComponentIndices],
    fallbackSameLayerComponentIndices: [...graph.fallbackSameLayerComponentIndices],
    layerIndices: [...graph.layerIndices],
    nodeIds: graph.nodeIds,
    nodeKeys: graph.nodeKeys,
    strictAdjacency: serializeAdjacency(graph.strictAdjacency),
    strictComponentIndices: [...graph.strictComponentIndices],
    strictSameLayerComponentIndices: [...graph.strictSameLayerComponentIndices],
    supportIndices: [...graph.supportIndices],
    supportOffsets: [...graph.supportOffsets],
    targetRegionIndex: {
      bucketHeight: targetRegions.bucketHeight,
      bucketOffsets: [...targetRegions.bucketOffsets],
      bucketRegionIndices: [...targetRegions.bucketRegionIndices],
      bucketSize: targetRegions.bucketSize,
      bucketWidth: targetRegions.bucketWidth,
      fallbacks: [...targetRegions.fallbacks],
      firstXs: [...targetRegions.firstXs],
      firstZs: [...targetRegions.firstZs],
      layerCount: targetRegions.layerCount,
      layerIndices: [...targetRegions.layerIndices],
      maximumBucketRegionCount: targetRegions.maximumBucketRegionCount,
      minimumBucketX: targetRegions.minimumBucketX,
      minimumBucketZ: targetRegions.minimumBucketZ,
      secondXs: [...targetRegions.secondXs],
      secondZs: [...targetRegions.secondZs],
      thirdXs: [...targetRegions.thirdXs],
      thirdZs: [...targetRegions.thirdZs],
      witnessNodes: [...targetRegions.witnessNodes],
    },
    visibilityEvaluationCount: graph.visibilityEvaluationCount,
    x: [...graph.x],
    z: [...graph.z],
  })
  return createHash('sha256').update(serialized).digest('hex')
}

function serializeAdjacency(adjacency: ZombieEscapeSparseNavigationAdjacency) {
  return {
    breachCounts: [...adjacency.breachCounts],
    breachObjectIndices: [...adjacency.breachObjectIndices],
    breachObjectOffsets: [...adjacency.breachObjectOffsets],
    nodeOffsets: [...adjacency.nodeOffsets],
    toNodes: [...adjacency.toNodes],
    weights: [...adjacency.weights],
  }
}
