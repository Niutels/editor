import { describe, expect, test } from 'bun:test'
import {
  createLandrushBuildSyncSnapshotNodes,
  createLandrushBuildSyncTransportNodes,
  isLandrushBuildSyncMigrationPayloadSafe,
  isLandrushBuildSyncV2GraphLossless,
} from '@landrush/pascal-host/landrush-build-sync'
import {
  canonicalizeLandrushParcelBuildGraph,
  createLandrushParcelBuildGraphIds,
  type LandrushParcelBuildGraphScope,
} from '@landrush/pascal-host/landrush-parcel-build-graph'
import {
  type AnyNode,
  BuildingNode,
  DoorNode,
  getLevelElevations,
  LevelNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  WallNode,
} from '@pascal-app/core'

const SCOPE = {
  contextBuildingId: 'building_landrush-island-debug',
  contextLevelId: 'level_landrush-island-debug',
  contextSiteId: 'site_landrush-island-debug',
  parcelId: 'parcel-03',
  worldId: 'landrush-world:test',
} satisfies LandrushParcelBuildGraphScope

const SCOPE_METADATA = {
  landrushParcelId: SCOPE.parcelId,
  landrushWorldId: SCOPE.worldId,
}

describe('Landrush parcel build graph', () => {
  test('creates deterministic, isolated Pascal building and ground-level roots', () => {
    const first = canonicalizeLandrushParcelBuildGraph([], SCOPE)
    const repeated = canonicalizeLandrushParcelBuildGraph([], SCOPE)
    const otherParcel = canonicalizeLandrushParcelBuildGraph([], {
      ...SCOPE,
      parcelId: 'parcel-04',
    })

    expect(repeated).toEqual(first)
    expect(first.buildingId).not.toBe(otherParcel.buildingId)
    expect(first.groundLevelId).not.toBe(otherParcel.groundLevelId)
    expect(first.nodes).toHaveLength(2)
    expect(first.nodes.find((node) => node.id === first.buildingId)).toMatchObject({
      children: [first.groundLevelId],
      parentId: SCOPE.contextSiteId,
      type: 'building',
    })
    expect(first.nodes.find((node) => node.id === first.groundLevelId)).toMatchObject({
      children: [],
      level: 0,
      parentId: first.buildingId,
      type: 'level',
    })
  })

  test('migrates a shared-level snapshot without changing placed object ids or geometry', () => {
    const oldUpperLevel = LevelNode.parse({
      children: ['slab_upper'],
      height: 3.1,
      id: 'level_house_upper_storey',
      level: 1,
      metadata: {
        ...SCOPE_METADATA,
        retainedMarker: 'upper',
        worldBaseElevationM: 3,
      },
      parentId: SCOPE.contextBuildingId,
    })
    const wall = WallNode.parse({
      children: ['door_front'],
      end: [8.25, -4.5],
      height: 3,
      id: 'wall_front',
      metadata: { retainedMarker: 'wall', worldBaseElevationM: 0 },
      parentId: SCOPE.contextLevelId,
      start: [1.25, -4.5],
    })
    const door = DoorNode.parse({
      id: 'door_front',
      parentId: wall.id,
      position: [3.5, 1.05, 0],
      wallId: wall.id,
    })
    const groundSlab = SlabNode.parse({
      id: 'slab_ground',
      metadata: { retainedMarker: 'slab', worldBaseElevationM: 0 },
      parentId: SCOPE.contextLevelId,
      polygon: [
        [1.25, -4.5],
        [8.25, -4.5],
        [8.25, -10.5],
        [1.25, -10.5],
      ],
    })
    const upperSlab = SlabNode.parse({
      id: 'slab_upper',
      parentId: oldUpperLevel.id,
      polygon: groundSlab.polygon,
    })
    const stairSegment = StairSegmentNode.parse({
      id: 'sseg_main',
      parentId: 'stair_main',
    })
    const stair = StairNode.parse({
      children: [stairSegment.id],
      id: 'stair_main',
      parentId: SCOPE.contextLevelId,
      position: [4.25, 0, -7.5],
      rotation: Math.PI / 2,
      supportSlabId: groundSlab.id,
      fromLevelId: SCOPE.contextLevelId,
      toLevelId: 'level_other_parcel_upper',
    })
    const source: AnyNode[] = [
      oldUpperLevel,
      wall,
      door,
      groundSlab,
      upperSlab,
      stair,
      stairSegment,
    ]

    const migrated = canonicalizeLandrushParcelBuildGraph(source, SCOPE)
    const nodes = Object.fromEntries(migrated.nodes.map((node) => [node.id, node]))

    expect(migrated.migrated).toBe(true)
    expect(nodes[oldUpperLevel.id]).toMatchObject({
      height: 3.1,
      metadata: { ...SCOPE_METADATA, retainedMarker: 'upper' },
      parentId: migrated.buildingId,
    })
    if (nodes[oldUpperLevel.id]?.type !== 'level') throw new Error('Expected upper level')
    expect(nodes[oldUpperLevel.id].baseElevation).toBeCloseTo(-0.05)
    expect(nodes[migrated.groundLevelId]).toMatchObject({ baseElevation: 0, height: 3.05 })
    expect(getLevelElevations(nodes).get(oldUpperLevel.id)?.baseY).toBe(3)
    expect(nodes[wall.id]).toMatchObject({
      end: wall.end,
      id: wall.id,
      parentId: migrated.groundLevelId,
      start: wall.start,
    })
    expect(nodes[wall.id]?.metadata).toEqual(wall.metadata)
    expect(nodes[groundSlab.id]?.metadata).toEqual(groundSlab.metadata)
    expect(nodes[door.id]).toMatchObject({
      id: door.id,
      parentId: wall.id,
      position: door.position,
      wallId: wall.id,
    })
    expect(nodes[stair.id]).toMatchObject({
      fromLevelId: migrated.groundLevelId,
      parentId: migrated.groundLevelId,
      position: stair.position,
      rotation: stair.rotation,
      supportSlabId: groundSlab.id,
      toLevelId: oldUpperLevel.id,
    })
    expect(new Set(migrated.nodes.map((node) => node.id))).toEqual(
      new Set([...source.map((node) => node.id), migrated.buildingId, migrated.groundLevelId]),
    )

    const repeated = canonicalizeLandrushParcelBuildGraph(migrated.nodes, SCOPE)
    expect(repeated.nodes).toEqual(migrated.nodes)
    expect(repeated.migrated).toBe(false)
  })

  test('consumes legacy world anchors into exact Pascal level elevations once', () => {
    const upperLevel = LevelNode.parse({
      id: 'level_house_upper_storey',
      level: 1,
      metadata: {
        ...SCOPE_METADATA,
        retainedMarker: 'upper',
        worldBaseElevationM: 3,
      },
      parentId: SCOPE.contextBuildingId,
    })
    const negativeLevel = LevelNode.parse({
      id: 'level_house_negative_anchor',
      level: 2,
      metadata: {
        ...SCOPE_METADATA,
        retainedMarker: 'negative',
        worldBaseElevationM: -1,
      },
      parentId: 'building_missing_shared_context',
    })

    const migrated = canonicalizeLandrushParcelBuildGraph([upperLevel, negativeLevel], SCOPE)
    const migratedNodes = Object.fromEntries(migrated.nodes.map((node) => [node.id, node]))
    const elevations = getLevelElevations(migratedNodes)

    expect(migratedNodes[upperLevel.id]).toMatchObject({
      baseElevation: 0.5,
      metadata: { ...SCOPE_METADATA, retainedMarker: 'upper' },
      parentId: migrated.buildingId,
    })
    expect(migratedNodes[negativeLevel.id]).toMatchObject({
      baseElevation: -6.5,
      metadata: { ...SCOPE_METADATA, retainedMarker: 'negative' },
      parentId: migrated.buildingId,
    })
    expect(elevations.get(upperLevel.id)?.baseY).toBe(3)
    expect(elevations.get(negativeLevel.id)?.baseY).toBe(-1)
    expect(migratedNodes[upperLevel.id]?.metadata).toEqual({
      ...SCOPE_METADATA,
      retainedMarker: 'upper',
    })
    expect(migratedNodes[negativeLevel.id]?.metadata).toEqual({
      ...SCOPE_METADATA,
      retainedMarker: 'negative',
    })

    const transportNodes = createLandrushBuildSyncTransportNodes(migrated.nodes, SCOPE)
    const roundTrip = canonicalizeLandrushParcelBuildGraph(transportNodes, SCOPE)
    const roundTripTransportNodes = createLandrushBuildSyncTransportNodes(roundTrip.nodes, SCOPE)
    const repeated = canonicalizeLandrushParcelBuildGraph(roundTrip.nodes, SCOPE)

    expect(
      isLandrushBuildSyncV2GraphLossless(
        Object.fromEntries(transportNodes.map((node) => [node.id, node])),
        transportNodes,
        roundTripTransportNodes,
      ),
    ).toBe(true)
    expect(
      getLevelElevations(Object.fromEntries(roundTrip.nodes.map((node) => [node.id, node]))).get(
        upperLevel.id,
      )?.baseY,
    ).toBe(3)
    expect(repeated.nodes).toEqual(roundTrip.nodes)
    expect(repeated.migrated).toBe(false)
  })

  test('does not consume stale world anchors from a native in-payload level', () => {
    const ids = createLandrushParcelBuildGraphIds(SCOPE)
    const building = BuildingNode.parse({
      id: ids.buildingId,
      metadata: SCOPE_METADATA,
      parentId: SCOPE.contextSiteId,
    })
    const groundLevel = LevelNode.parse({
      height: 2.5,
      id: ids.groundLevelId,
      level: 0,
      parentId: building.id,
    })
    const nativeUpperLevel = LevelNode.parse({
      baseElevation: 0.75,
      children: ['slab_native_upper'],
      height: 2.5,
      id: ids.levelId(1),
      level: 1,
      metadata: {
        ...SCOPE_METADATA,
        retainedMarker: 'native',
        worldBaseElevationM: -8,
      },
      parentId: building.id,
    })
    const nativeUpperSlab = SlabNode.parse({
      elevation: 0.15,
      id: 'slab_native_upper',
      metadata: { worldBaseElevationM: -9 },
      parentId: nativeUpperLevel.id,
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      thickness: 0.15,
    })

    const canonical = canonicalizeLandrushParcelBuildGraph(
      [building, groundLevel, nativeUpperLevel, nativeUpperSlab],
      SCOPE,
    )
    const nodes = Object.fromEntries(canonical.nodes.map((node) => [node.id, node]))

    expect(nodes[nativeUpperLevel.id]).toEqual(nativeUpperLevel)
    expect(nodes[nativeUpperSlab.id]).toEqual(nativeUpperSlab)
    expect(getLevelElevations(nodes).get(nativeUpperLevel.id)?.baseY).toBe(3.25)
  })

  test('uses a consistent direct-child world anchor for any reparented legacy level', () => {
    const orphanUpperLevel = LevelNode.parse({
      children: ['slab_orphan_upper'],
      height: 2.5,
      id: 'level_orphan_upper',
      level: 1,
      metadata: SCOPE_METADATA,
      parentId: 'building_missing_shared_context',
    })
    const orphanUpperSlab = SlabNode.parse({
      elevation: 0.15,
      id: 'slab_orphan_upper',
      metadata: { retainedMarker: 'slab', worldBaseElevationM: 3 },
      parentId: orphanUpperLevel.id,
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      thickness: 0.15,
    })

    const canonical = canonicalizeLandrushParcelBuildGraph(
      [orphanUpperLevel, orphanUpperSlab],
      SCOPE,
    )
    const nodes = Object.fromEntries(canonical.nodes.map((node) => [node.id, node]))

    expect(nodes[orphanUpperLevel.id]).toMatchObject({
      baseElevation: 0.5,
      metadata: SCOPE_METADATA,
      parentId: canonical.buildingId,
    })
    expect(nodes[orphanUpperSlab.id]?.metadata).toEqual(orphanUpperSlab.metadata)
    expect(getLevelElevations(nodes).get(orphanUpperLevel.id)?.baseY).toBe(3)

    const repeated = canonicalizeLandrushParcelBuildGraph(canonical.nodes, SCOPE)
    expect(repeated.nodes).toEqual(canonical.nodes)
    expect(repeated.migrated).toBe(false)
  })

  test('publishes a self-contained retry payload and reversibly restores its Site anchor', () => {
    const legacyWall = WallNode.parse({
      end: [6, 0],
      id: 'wall_retry',
      parentId: SCOPE.contextLevelId,
      start: [0, 0],
    })
    const earlyScaffold = canonicalizeLandrushParcelBuildGraph([], SCOPE)
    const earlyTransportNodes = createLandrushBuildSyncTransportNodes(earlyScaffold.nodes, SCOPE)
    const earlyRoundTrip = canonicalizeLandrushParcelBuildGraph(earlyTransportNodes, SCOPE)
    const earlyCanonicalTransportNodes = createLandrushBuildSyncTransportNodes(
      earlyRoundTrip.nodes,
      SCOPE,
    )

    expect(
      isLandrushBuildSyncMigrationPayloadSafe(
        [legacyWall],
        earlyTransportNodes,
        earlyCanonicalTransportNodes,
      ),
    ).toBe(false)

    const migrated = canonicalizeLandrushParcelBuildGraph([legacyWall], SCOPE)
    const retryNodes = createLandrushBuildSyncTransportNodes(migrated.nodes, SCOPE)
    const retryIds = new Set(retryNodes.map((node) => node.id))
    const retryBuilding = retryNodes.find((node) => node.id === migrated.buildingId)

    expect(retryBuilding?.parentId).toBeNull()
    expect(
      retryNodes.every(
        (node) => node.parentId === null || (node.parentId && retryIds.has(node.parentId)),
      ),
    ).toBe(true)

    const parsedRetryNodes = Object.fromEntries(retryNodes.map((node) => [node.id, node]))
    const restored = canonicalizeLandrushParcelBuildGraph(retryNodes, SCOPE)
    const restoredTransportNodes = createLandrushBuildSyncTransportNodes(restored.nodes, SCOPE)

    expect(
      isLandrushBuildSyncV2GraphLossless(parsedRetryNodes, retryNodes, restoredTransportNodes),
    ).toBe(true)
    expect(
      isLandrushBuildSyncMigrationPayloadSafe([legacyWall], retryNodes, restoredTransportNodes),
    ).toBe(true)
    expect(restored.nodes).toEqual(createLandrushBuildSyncSnapshotNodes(migrated.nodes, SCOPE))
    expect(restored.nodes.find((node) => node.id === migrated.buildingId)?.parentId).toBe(
      SCOPE.contextSiteId,
    )
  })

  test('rejects a Site-anchored host scaffold as v2 transport while accepting its null-root projection', () => {
    const canonical = canonicalizeLandrushParcelBuildGraph([], SCOPE)
    const hostNodes = createLandrushBuildSyncSnapshotNodes(canonical.nodes, SCOPE)
    const transportNodes = createLandrushBuildSyncTransportNodes(canonical.nodes, SCOPE)
    const hostRoundTrip = canonicalizeLandrushParcelBuildGraph(hostNodes, SCOPE)
    const transportRoundTrip = canonicalizeLandrushParcelBuildGraph(transportNodes, SCOPE)
    const hostCanonicalTransport = createLandrushBuildSyncTransportNodes(hostRoundTrip.nodes, SCOPE)
    const transportCanonicalTransport = createLandrushBuildSyncTransportNodes(
      transportRoundTrip.nodes,
      SCOPE,
    )

    expect(hostNodes.find((node) => node.id === canonical.buildingId)?.parentId).toBe(
      SCOPE.contextSiteId,
    )
    expect(transportNodes.find((node) => node.id === canonical.buildingId)?.parentId).toBeNull()
    expect(
      isLandrushBuildSyncV2GraphLossless(
        Object.fromEntries(hostNodes.map((node) => [node.id, node])),
        hostNodes,
        hostCanonicalTransport,
      ),
    ).toBe(false)
    expect(
      isLandrushBuildSyncV2GraphLossless(
        Object.fromEntries(transportNodes.map((node) => [node.id, node])),
        transportNodes,
        transportCanonicalTransport,
      ),
    ).toBe(true)
  })

  test('quarantines a v2 orphan that requires an internal hierarchy repair', () => {
    const orphan = WallNode.parse({
      end: [4, 0],
      id: 'wall_orphan',
      parentId: null,
      start: [0, 0],
    })
    const parsed = Object.fromEntries([[orphan.id, orphan]])
    const repaired = canonicalizeLandrushParcelBuildGraph([orphan], SCOPE)
    const repairedTransportNodes = createLandrushBuildSyncTransportNodes(repaired.nodes, SCOPE)

    expect(isLandrushBuildSyncV2GraphLossless(parsed, [orphan], repairedTransportNodes)).toBe(false)
  })

  test('repairs dangling stair level and slab references within its parcel graph', () => {
    const stair = StairNode.parse({
      children: ['sseg_main'],
      deckSlabId: 'slab_other_parcel',
      fromLevelId: SCOPE.contextLevelId,
      id: 'stair_main',
      parentId: SCOPE.contextLevelId,
      position: [2, 0, 3],
      supportSlabId: 'slab_deleted',
      toLevelId: 'level_other_parcel',
    })
    const segment = StairSegmentNode.parse({
      id: 'sseg_main',
      parentId: stair.id,
    })

    const migrated = canonicalizeLandrushParcelBuildGraph([stair, segment], SCOPE)
    const nodes = Object.fromEntries(migrated.nodes.map((node) => [node.id, node]))
    const migratedStair = nodes[stair.id]
    if (migratedStair?.type !== 'stair') throw new Error('Expected migrated stair')
    const targetLevel = migratedStair.toLevelId ? nodes[migratedStair.toLevelId] : undefined

    expect(migratedStair.parentId).toBe(migrated.groundLevelId)
    expect(migratedStair.fromLevelId).toBe(migrated.groundLevelId)
    expect(migratedStair.supportSlabId).toBeUndefined()
    expect(migratedStair.deckSlabId).toBeUndefined()
    expect(targetLevel).toMatchObject({
      level: 1,
      parentId: migrated.buildingId,
      type: 'level',
    })
    expect(nodes[migrated.buildingId]).toMatchObject({
      children: [migrated.groundLevelId, targetLevel?.id],
    })
    expect(nodes[migrated.groundLevelId]).toMatchObject({ children: [stair.id] })
    expect(nodes[stair.id]).toMatchObject({ children: [segment.id] })

    for (const node of migrated.nodes) {
      expect(
        (node.type === 'building' && node.parentId === SCOPE.contextSiteId) ||
          Boolean(node.parentId && nodes[node.parentId]),
      ).toBe(true)
      if (node.type === 'building') continue
      const parent = node.parentId ? nodes[node.parentId] : undefined
      expect(parent && 'children' in parent && parent.children.includes(node.id as never)).toBe(
        true,
      )
    }
  })

  test('is idempotent for a canonical parcel-owned graph', () => {
    const ids = createLandrushParcelBuildGraphIds(SCOPE)
    const building = BuildingNode.parse({
      id: ids.buildingId,
      metadata: SCOPE_METADATA,
      parentId: SCOPE.contextSiteId,
    })
    const level = LevelNode.parse({
      height: 2.8,
      id: ids.groundLevelId,
      level: 0,
      parentId: building.id,
    })
    const wall = WallNode.parse({
      end: [5, 0],
      id: 'wall_kept',
      parentId: level.id,
      start: [0, 0],
    })
    const canonical = canonicalizeLandrushParcelBuildGraph([building, level, wall], SCOPE)
    const repeated = canonicalizeLandrushParcelBuildGraph(canonical.nodes, SCOPE)

    expect(repeated.nodes).toEqual(canonical.nodes)
    expect(repeated.buildingId).toBe(canonical.buildingId)
    expect(repeated.groundLevelId).toBe(canonical.groundLevelId)
    expect(repeated.migrated).toBe(false)
  })

  test('migrates a missing height under an accepted canonical building parent', () => {
    const ids = createLandrushParcelBuildGraphIds(SCOPE)
    const building = BuildingNode.parse({
      id: ids.buildingId,
      metadata: SCOPE_METADATA,
      parentId: SCOPE.contextSiteId,
    })
    const legacyLevel = LevelNode.parse({
      id: ids.groundLevelId,
      level: 0,
      parentId: building.id,
    })

    const canonical = canonicalizeLandrushParcelBuildGraph([building, legacyLevel], SCOPE)
    const migratedLevel = canonical.nodes.find((node) => node.id === legacyLevel.id)

    expect(migratedLevel).toMatchObject({ height: 2.5, parentId: building.id, type: 'level' })
    const repeated = canonicalizeLandrushParcelBuildGraph(canonical.nodes, SCOPE)
    expect(repeated.nodes).toEqual(canonical.nodes)
    expect(repeated.migrated).toBe(false)
  })

  test('preserves multiple parcel-owned building graphs and keeps stairs inside their building', () => {
    const buildingA = BuildingNode.parse({
      id: 'building_parcel-a',
      metadata: SCOPE_METADATA,
      parentId: SCOPE.contextSiteId,
    })
    const buildingB = BuildingNode.parse({
      id: 'building_parcel-b',
      metadata: SCOPE_METADATA,
      parentId: SCOPE.contextSiteId,
    })
    const groundA = LevelNode.parse({
      height: 2.5,
      id: 'level_parcel-a-ground',
      level: 0,
      metadata: SCOPE_METADATA,
      parentId: buildingA.id,
    })
    const groundB = LevelNode.parse({
      height: 2.5,
      id: 'level_parcel-b-ground',
      level: 0,
      metadata: SCOPE_METADATA,
      parentId: buildingB.id,
    })
    const upperB = LevelNode.parse({
      height: 2.5,
      id: 'level_parcel-b-upper',
      level: 1,
      metadata: SCOPE_METADATA,
      parentId: buildingB.id,
    })
    const slabB = SlabNode.parse({
      id: 'slab_parcel-b',
      parentId: groundB.id,
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    })
    const stairA = StairNode.parse({
      deckSlabId: slabB.id,
      fromLevelId: groundB.id,
      id: 'stair_parcel-a',
      parentId: groundA.id,
      supportSlabId: slabB.id,
      toLevelId: upperB.id,
    })

    const canonical = canonicalizeLandrushParcelBuildGraph(
      [buildingA, buildingB, groundA, groundB, upperB, slabB, stairA],
      SCOPE,
    )
    const nodes = Object.fromEntries(canonical.nodes.map((node) => [node.id, node]))
    const migratedStair = nodes[stairA.id]
    if (migratedStair?.type !== 'stair') throw new Error('Expected stair in building A')
    const stairTarget = migratedStair.toLevelId ? nodes[migratedStair.toLevelId] : undefined

    expect(nodes[buildingA.id]?.parentId).toBe(SCOPE.contextSiteId)
    expect(nodes[buildingB.id]?.parentId).toBe(SCOPE.contextSiteId)
    expect(nodes[groundA.id]?.parentId).toBe(buildingA.id)
    expect(nodes[groundB.id]?.parentId).toBe(buildingB.id)
    expect(nodes[upperB.id]?.parentId).toBe(buildingB.id)
    expect(stairTarget).toMatchObject({ level: 1, parentId: buildingA.id, type: 'level' })
    expect(migratedStair.fromLevelId).toBe(groundA.id)
    expect(migratedStair.toLevelId).not.toBe(upperB.id)
    expect(migratedStair.supportSlabId).toBeUndefined()
    expect(migratedStair.deckSlabId).toBeUndefined()
  })

  test('does not absorb foreign parcel buildings or levels from a malformed snapshot', () => {
    const foreignMetadata = {
      landrushParcelId: 'parcel-99',
      landrushWorldId: SCOPE.worldId,
    }
    const foreignBuilding = BuildingNode.parse({
      id: 'building_foreign',
      metadata: foreignMetadata,
      parentId: SCOPE.contextSiteId,
    })
    const foreignLevel = LevelNode.parse({
      id: 'level_foreign',
      level: 0,
      metadata: foreignMetadata,
      parentId: foreignBuilding.id,
    })
    const foreignWall = WallNode.parse({
      end: [20, 20],
      id: 'wall_foreign',
      metadata: foreignMetadata,
      parentId: foreignLevel.id,
      start: [18, 20],
    })
    const localWall = WallNode.parse({
      end: [4, 1],
      id: 'wall_local',
      parentId: SCOPE.contextLevelId,
      start: [1, 1],
    })

    const canonical = canonicalizeLandrushParcelBuildGraph(
      [foreignBuilding, foreignLevel, foreignWall, localWall],
      SCOPE,
    )
    const nodeIds = new Set(canonical.nodes.map((node) => node.id))

    expect(nodeIds.has(foreignBuilding.id)).toBe(false)
    expect(nodeIds.has(foreignLevel.id)).toBe(false)
    expect(nodeIds.has(foreignWall.id)).toBe(false)
    expect(nodeIds.has(localWall.id)).toBe(true)
    expect(canonical.migrated).toBe(true)
  })
})
