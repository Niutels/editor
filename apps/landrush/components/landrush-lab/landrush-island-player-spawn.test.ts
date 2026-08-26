import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  LevelNode,
  nodeRegistry,
  registerNode,
  SlabNode,
  SpawnNode,
  spatialGridManager,
} from '@pascal-app/core'
import { spawnDefinition } from '@pascal-app/nodes'
import { resolveLandrushIslandPlayerSpawn } from './landrush-island-player-spawn'

const FALLBACK = { heading: 0, x: 4, y: 1.2, z: 6 }

function createParcelSpawnGraph({
  buildingId,
  parcelId,
  spawnId,
  spawnVisible = true,
}: {
  buildingId: `building_${string}`
  parcelId: string
  spawnId: `spawn_${string}`
  spawnVisible?: boolean
}) {
  const building = BuildingNode.parse({
    id: buildingId,
    metadata: { landrushParcelId: parcelId },
  })
  const level = LevelNode.parse({ id: `level_${buildingId}`, parentId: building.id })
  const spawn = SpawnNode.parse({
    id: spawnId,
    parentId: level.id,
    visible: spawnVisible,
  })
  return { building, level, spawn }
}

describe('Landrush island player spawn', () => {
  test('falls back when the local parcel has no visible spawn', () => {
    const hidden = createParcelSpawnGraph({
      buildingId: 'building_hidden',
      parcelId: 'parcel-local',
      spawnId: 'spawn_hidden',
      spawnVisible: false,
    })
    const foreign = createParcelSpawnGraph({
      buildingId: 'building_foreign',
      parcelId: 'parcel-foreign',
      spawnId: 'spawn_foreign',
    })
    const nodes = Object.fromEntries(
      [...Object.values(hidden), ...Object.values(foreign)].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    expect(
      resolveLandrushIslandPlayerSpawn({ fallback: FALLBACK, nodes, parcelId: 'parcel-local' }),
    ).toEqual({ ...FALLBACK, source: 'fallback', spawnNodeId: null })
  })

  test('ignores an in-progress placement draft', () => {
    const graph = createParcelSpawnGraph({
      buildingId: 'building_draft',
      parcelId: 'parcel-local',
      spawnId: 'spawn_draft',
    })
    const draft = SpawnNode.parse({
      ...graph.spawn,
      metadata: { isNew: true },
    })
    const nodes = Object.fromEntries(
      [graph.building, graph.level, draft].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    expect(
      resolveLandrushIslandPlayerSpawn({ fallback: FALLBACK, nodes, parcelId: 'parcel-local' }),
    ).toEqual({ ...FALLBACK, source: 'fallback', spawnNodeId: null })
  })

  test('chooses the deterministic visible spawn in local parcel ancestry', () => {
    const graph = createParcelSpawnGraph({
      buildingId: 'building_local',
      parcelId: 'parcel-local',
      spawnId: 'spawn_b',
    })
    const first = SpawnNode.parse({ id: 'spawn_a', parentId: graph.level.id })
    const nodes = Object.fromEntries(
      [...Object.values(graph), first].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    expect(
      resolveLandrushIslandPlayerSpawn({ fallback: FALLBACK, nodes, parcelId: 'parcel-local' }),
    ).toMatchObject({ source: 'scene', spawnNodeId: 'spawn_a' })
  })

  test('skips malformed candidates without hiding a later valid local spawn', () => {
    const graph = createParcelSpawnGraph({
      buildingId: 'building_valid',
      parcelId: 'parcel-local',
      spawnId: 'spawn_valid',
    })
    const malformed = SpawnNode.parse({
      id: 'spawn_0_malformed',
      metadata: { landrushParcelId: 'parcel-local' },
      parentId: null,
    })
    const nodes = Object.fromEntries(
      [...Object.values(graph), malformed].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    expect(
      resolveLandrushIslandPlayerSpawn({ fallback: FALLBACK, nodes, parcelId: 'parcel-local' }),
    ).toMatchObject({ source: 'scene', spawnNodeId: 'spawn_valid' })
  })

  test('composes the building transform, level elevation, and spawn yaw', () => {
    const building = BuildingNode.parse({
      id: 'building_transform',
      metadata: { landrushParcelId: 'parcel-local' },
      position: [10, 2, 20],
      rotation: [0, Math.PI / 2, 0],
    })
    const level = LevelNode.parse({ id: 'level_transform', parentId: building.id })
    const spawn = SpawnNode.parse({
      id: 'spawn_transform',
      parentId: level.id,
      position: [2, 0.5, 3],
      rotation: Math.PI / 4,
    })
    const nodes = Object.fromEntries(
      [building, level, spawn].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const result = resolveLandrushIslandPlayerSpawn({
      fallback: FALLBACK,
      levelBaseYById: new Map([[level.id, 4]]),
      nodes,
      parcelId: 'parcel-local',
    })

    expect(result.source).toBe('scene')
    expect(result.spawnNodeId).toBe(spawn.id)
    expect(result.x).toBeCloseTo(13)
    expect(result.y).toBeCloseTo(6.5)
    expect(result.z).toBeCloseTo(18)
    expect(result.heading).toBeCloseTo((Math.PI * 3) / 4)
  })

  test('includes the canonical floor-placement lift from a persisted slab support', () => {
    if (!nodeRegistry.has('spawn')) registerNode(spawnDefinition)
    const building = BuildingNode.parse({
      id: 'building_supported',
      metadata: { landrushParcelId: 'parcel-local' },
      position: [0, 2, 0],
    })
    const level = LevelNode.parse({ id: 'level_supported', parentId: building.id })
    const slab = SlabNode.parse({
      elevation: 1.4,
      id: 'slab_supported',
      parentId: level.id,
      polygon: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
      thickness: 0.2,
    })
    const spawn = SpawnNode.parse({
      id: 'spawn_supported',
      parentId: level.id,
      position: [0, 0.15, 0],
      supportSlabId: slab.id,
    })
    const nodes = Object.fromEntries(
      [building, level, slab, spawn].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    spatialGridManager.handleNodeCreated(slab, level.id)

    try {
      expect(
        resolveLandrushIslandPlayerSpawn({
          fallback: FALLBACK,
          levelBaseYById: new Map([[level.id, 3]]),
          nodes,
          parcelId: 'parcel-local',
        }).y,
      ).toBeCloseTo(6.55)
    } finally {
      spatialGridManager.handleNodeDeleted(slab.id, slab.type, level.id)
    }
  })

  test('rejects conflicting parcel metadata anywhere in the ancestry', () => {
    const building = BuildingNode.parse({
      id: 'building_conflict',
      metadata: { landrushParcelId: 'parcel-foreign' },
    })
    const level = LevelNode.parse({ id: 'level_conflict', parentId: building.id })
    const spawn = SpawnNode.parse({
      id: 'spawn_conflict',
      metadata: { landrushParcelId: 'parcel-local' },
      parentId: level.id,
    })
    const nodes = Object.fromEntries(
      [building, level, spawn].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    expect(
      resolveLandrushIslandPlayerSpawn({ fallback: FALLBACK, nodes, parcelId: 'parcel-local' }),
    ).toEqual({ ...FALLBACK, source: 'fallback', spawnNodeId: null })
  })
})
