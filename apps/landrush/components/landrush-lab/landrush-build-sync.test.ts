import { describe, expect, test } from 'bun:test'
import {
  areLandrushBuildFootprintsInsideBoundary,
  areLandrushBuildSyncNodeSetsEqual,
  collectLandrushBuildSyncDescendantIds,
  collectLandrushBuildSyncGraphNodeIds,
  collectLandrushBuildSyncRequiredLiveNodeIds,
  createLandrushBuildSpawnFootprint,
  createLandrushBuildSyncSnapshotNodes,
  createLandrushBuildSyncTransportNodes,
  hasLandrushBuildPlacementDraftAncestry,
  isLandrushBuildNodeInParcelMutationScope,
  isLandrushBuildNodeInValidatedLegacyScope,
  isLandrushBuildPlacementDraft,
  isLandrushBuildSyncCandidateSafeAgainstLiveBaseline,
  isLandrushBuildSyncMigrationPayloadSafe,
  isLandrushBuildSyncStructuralObject,
  isLandrushBuildSyncV2GraphLossless,
  type LandrushBuildSyncGraphNode,
  parseLandrushBuildSyncSnapshotNodes,
} from '@landrush/pascal-host/landrush-build-sync'
import { pointInPolygonOrNearEdge, segmentFootprint } from '@landrush/runtime'
import { type AnyNode, AnyNode as AnyNodeSchema, SlabNode } from '@pascal-app/core'
import { migrateVerticalSceneNodes } from '@pascal-app/core/scene-migrations'

const SYNC_SCOPE = {
  parcelId: 'parcel-a',
  worldId: 'world-a',
}

function createSnapshot(
  nodes: Record<string, LandrushBuildSyncGraphNode & Record<string, unknown>>,
  rootIds: readonly string[],
) {
  const ids = collectLandrushBuildSyncDescendantIds(nodes, rootIds)
  return createLandrushBuildSyncSnapshotNodes(
    [...ids].map((id) => nodes[id]!).filter(Boolean),
    SYNC_SCOPE,
  )
}

describe('Landrush build sync', () => {
  test('syncs spawn points as level-owned structural nodes', () => {
    expect(
      isLandrushBuildSyncStructuralObject(
        { id: 'spawn-local', parentId: 'level-local', type: 'spawn' },
        (parentId) => parentId === 'level-local',
      ),
    ).toBe(true)
    expect(
      isLandrushBuildSyncStructuralObject(
        { id: 'spawn-foreign', parentId: 'level-foreign', type: 'spawn' },
        (parentId) => parentId === 'level-local',
      ),
    ).toBe(false)
  })

  test('uses the spawn marker footprint for parcel-boundary validation', () => {
    const parcel = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ]
    const containsPoint = (point: { x: number; z: number }) =>
      pointInPolygonOrNearEdge(point, parcel)

    const inside = createLandrushBuildSpawnFootprint({ position: [2, 0, 2], rotation: Math.PI / 4 })
    const crossingEdge = createLandrushBuildSpawnFootprint({
      position: [0.1, 0, 2],
      rotation: 0,
    })

    expect(inside).toHaveLength(4)
    expect(areLandrushBuildFootprintsInsideBoundary([inside], containsPoint)).toBe(true)
    expect(areLandrushBuildFootprintsInsideBoundary([crossingEdge], containsPoint)).toBe(false)
  })

  test('keeps committed wall children and excludes Pascal placement drafts', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      'committed-door': {
        id: 'committed-door',
        parentId: 'wall',
      },
      'committed-window': {
        id: 'committed-window',
        parentId: 'wall',
      },
      'draft-door': {
        children: ['draft-handle'],
        id: 'draft-door',
        metadata: { isTransient: true },
        parentId: 'wall',
      },
      'draft-handle': {
        id: 'draft-handle',
        parentId: 'draft-door',
      },
      'draft-window': {
        id: 'draft-window',
        metadata: { isNew: true },
        parentId: 'wall',
      },
      wall: {
        children: ['committed-door', 'draft-door', 'draft-window'],
        id: 'wall',
      },
    }

    expect([...collectLandrushBuildSyncDescendantIds(nodes, ['wall'])].sort()).toEqual([
      'committed-door',
      'committed-window',
      'wall',
    ])
  })

  test('rejects draft roots without treating false flags as drafts', () => {
    expect(isLandrushBuildPlacementDraft({ metadata: { isTransient: true } })).toBe(true)
    expect(isLandrushBuildPlacementDraft({ metadata: { isNew: true } })).toBe(true)
    expect(isLandrushBuildPlacementDraft({ metadata: { isNew: false, isTransient: false } })).toBe(
      false,
    )

    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      committed: { id: 'committed', metadata: { isNew: false } },
      draft: { id: 'draft', metadata: { isTransient: true } },
    }
    expect([...collectLandrushBuildSyncDescendantIds(nodes, ['draft', 'committed'])]).toEqual([
      'committed',
    ])
  })

  test('does not reintroduce transient or new drafts through independently selected descendants', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      'draft-door': {
        children: ['draft-handle'],
        id: 'draft-door',
        metadata: { isTransient: true },
        parentId: 'wall',
      },
      'draft-handle': {
        id: 'draft-handle',
        parentId: 'draft-door',
      },
      'new-group': {
        children: ['new-group-child'],
        id: 'new-group',
        metadata: { isNew: true },
        parentId: 'wall',
      },
      'new-group-child': {
        id: 'new-group-child',
        parentId: 'new-group',
      },
      wall: {
        children: ['draft-door', 'new-group'],
        id: 'wall',
      },
    }

    expect(hasLandrushBuildPlacementDraftAncestry(nodes, 'draft-handle')).toBe(true)
    expect(hasLandrushBuildPlacementDraftAncestry(nodes, 'new-group-child')).toBe(true)
    expect(
      [
        ...collectLandrushBuildSyncDescendantIds(nodes, [
          'wall',
          'draft-handle',
          'new-group-child',
        ]),
      ].sort(),
    ).toEqual(['wall'])
  })

  test('keeps repeated door hover previews out of snapshots and syncs one clicked door', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode & Record<string, unknown>> = {
      'hover-door': {
        id: 'hover-door',
        metadata: { isTransient: true },
        parentId: 'wall',
        position: [2, 1.05, 0],
        type: 'door',
      },
      wall: {
        children: ['hover-door'],
        id: 'wall',
        type: 'wall',
      },
    }

    const firstHoverSnapshot = createSnapshot(nodes, ['wall'])
    nodes['hover-door'] = {
      ...nodes['hover-door']!,
      position: [3, 1.05, 0],
    }
    const repeatedHoverSnapshot = createSnapshot(nodes, ['wall'])

    expect(repeatedHoverSnapshot).toEqual(firstHoverSnapshot)
    expect(firstHoverSnapshot.map((node) => node.id)).toEqual(['wall'])
    expect(firstHoverSnapshot.find((node) => node.id === 'wall')?.children).toEqual([])

    delete nodes['hover-door']
    nodes.wall = {
      ...nodes.wall!,
      children: ['clicked-door'],
    }
    nodes['clicked-door'] = {
      id: 'clicked-door',
      parentId: 'wall',
      position: [3, 1.05, 0],
      type: 'door',
    }

    const clickedSnapshot = createSnapshot(nodes, ['wall'])
    expect(clickedSnapshot.map((node) => node.id).sort()).toEqual(['clicked-door', 'wall'])
    expect(clickedSnapshot.filter((node) => node.type === 'door')).toHaveLength(1)
    expect(clickedSnapshot.find((node) => node.id === 'clicked-door')?.metadata).toEqual({
      landrushBuildSynced: true,
      landrushParcelId: SYNC_SCOPE.parcelId,
      landrushWorldId: SYNC_SCOPE.worldId,
    })
  })

  test('keeps a 20-node baseline intact while a transient door hovers on a wall', () => {
    const baselineWallIds = Array.from({ length: 5 }, (_, index) => `wall-baseline-${index}`)
    const newWallIds = Array.from({ length: 4 }, (_, index) => `wall-new-${index}`)
    const groundChildren = [
      ...baselineWallIds,
      'fence',
      'stair-0',
      'stair-1',
      ...newWallIds,
      'slab',
      'ceiling',
    ]
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      building: {
        children: ['level-ground', 'level-upper'],
        id: 'building',
        metadata: { landrushParcelId: SYNC_SCOPE.parcelId },
        parentId: null,
        type: 'building',
      },
      'level-ground': {
        children: groundChildren,
        id: 'level-ground',
        parentId: 'building',
        type: 'level',
      },
      'level-upper': {
        children: [],
        id: 'level-upper',
        parentId: 'building',
        type: 'level',
      },
      ...Object.fromEntries(
        baselineWallIds.map((id) => [
          id,
          {
            children: id === baselineWallIds[0] ? ['door'] : [],
            id,
            parentId: 'level-ground',
            type: 'wall',
          },
        ]),
      ),
      door: { id: 'door', parentId: baselineWallIds[0], type: 'door' },
      fence: { id: 'fence', parentId: 'level-ground', type: 'fence' },
      'stair-0': {
        children: ['stair-segment-0'],
        id: 'stair-0',
        parentId: 'level-ground',
        type: 'stair',
      },
      'stair-1': {
        children: ['stair-segment-1'],
        id: 'stair-1',
        parentId: 'level-ground',
        type: 'stair',
      },
      'stair-segment-0': {
        id: 'stair-segment-0',
        parentId: 'stair-0',
        type: 'stair-segment',
      },
      'stair-segment-1': {
        id: 'stair-segment-1',
        parentId: 'stair-1',
        type: 'stair-segment',
      },
      ...Object.fromEntries(
        newWallIds.map((id) => [
          id,
          {
            children: id === newWallIds[0] ? ['door-preview'] : [],
            id,
            parentId: 'level-ground',
            type: 'wall',
          },
        ]),
      ),
      slab: { id: 'slab', parentId: 'level-ground', type: 'slab' },
      ceiling: { id: 'ceiling', parentId: 'level-ground', type: 'ceiling' },
      'door-preview': {
        id: 'door-preview',
        metadata: { isTransient: true },
        parentId: newWallIds[0],
        type: 'door',
      },
    }
    const outgoingIds = collectLandrushBuildSyncGraphNodeIds(nodes, ['building'])
    const candidate = createLandrushBuildSyncTransportNodes(
      [...outgoingIds].map((id) => nodes[id]!),
      SYNC_SCOPE,
    )
    const baseline = candidate.map((node) => structuredClone(node))
    const rootsOnly = candidate.filter(
      (node) => node.id === 'building' || node.id === 'level-ground',
    )

    expect(candidate).toHaveLength(20)
    expect(candidate.some((node) => node.id === 'door-preview')).toBe(false)
    expect(candidate.find((node) => node.id === baselineWallIds[0])?.children).toEqual(['door'])
    expect(candidate.find((node) => node.id === newWallIds[0])?.children).toEqual([])
    expect(areLandrushBuildSyncNodeSetsEqual(baseline, candidate)).toBe(true)
    expect(isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(baseline, candidate, nodes)).toBe(
      true,
    )
    expect(rootsOnly).toHaveLength(2)
    expect(isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(baseline, rootsOnly, nodes)).toBe(
      false,
    )
  })

  test('allows a valid interior additive wall candidate through the publish guard', () => {
    const baseline: LandrushBuildSyncGraphNode[] = [
      { children: ['level'], id: 'building', parentId: null, type: 'building' },
      { children: [], id: 'level', parentId: 'building', type: 'level' },
    ]
    const wall: LandrushBuildSyncGraphNode = {
      id: 'interior-wall',
      parentId: 'level',
      type: 'wall',
    }
    const liveNodes = {
      building: baseline[0]!,
      level: { ...baseline[1]!, children: ['interior-wall'] },
      'interior-wall': wall,
    }
    const requiredLiveNodeIds = collectLandrushBuildSyncRequiredLiveNodeIds(
      liveNodes,
      (node) => node.type === 'wall',
    )

    expect(
      isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(
        baseline,
        [...baseline, wall],
        liveNodes,
        { requiredLiveNodeIds },
      ),
    ).toBe(true)
  })

  test('requires explicit deletion provenance when a baseline node is gone from the live scene', () => {
    const baseline: LandrushBuildSyncGraphNode[] = [
      { children: ['level'], id: 'building', parentId: null, type: 'building' },
      { children: ['wall'], id: 'level', parentId: 'building', type: 'level' },
      { id: 'wall', parentId: 'level', type: 'wall' },
    ]
    const candidate = baseline.slice(0, 2)
    const liveNodes = Object.fromEntries(candidate.map((node) => [node.id, node]))

    expect(
      isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(baseline, candidate, liveNodes),
    ).toBe(false)
    expect(
      isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(baseline, candidate, liveNodes, {
        authorizedDeletedNodeIds: new Set(['wall']),
      }),
    ).toBe(true)
  })

  test('rejects a wall whose centerline is on the parcel edge but full thickness is outside', () => {
    const parcel = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ]
    const containsPoint = (point: { x: number; z: number }) =>
      pointInPolygonOrNearEdge(point, parcel)
    const interiorWall = [segmentFootprint({ x: 1, z: 2 }, { x: 3, z: 2 }, 0.18)]
    const edgeWall = [segmentFootprint({ x: 0, z: 1 }, { x: 0, z: 3 }, 0.18)]

    expect(containsPoint({ x: 0, z: 2 })).toBe(true)
    expect(areLandrushBuildFootprintsInsideBoundary(interiorWall, containsPoint)).toBe(true)
    expect(areLandrushBuildFootprintsInsideBoundary(edgeWall, containsPoint)).toBe(false)
  })

  test('fails closed when a candidate omits an additive committed structural node', () => {
    const baseline: LandrushBuildSyncGraphNode[] = [
      { children: ['level'], id: 'building', parentId: null, type: 'building' },
      { children: [], id: 'level', parentId: 'building', type: 'level' },
    ]
    const liveNodes: Record<string, LandrushBuildSyncGraphNode> = {
      building: baseline[0]!,
      level: { ...baseline[1]!, children: ['new-wall'] },
      'new-wall': { id: 'new-wall', parentId: 'level', type: 'wall' },
    }
    const requiredLiveNodeIds = collectLandrushBuildSyncRequiredLiveNodeIds(
      liveNodes,
      (node) => node.type === 'wall',
    )

    expect(requiredLiveNodeIds).toEqual(new Set(['new-wall']))
    expect(areLandrushBuildSyncNodeSetsEqual(baseline, baseline)).toBe(true)
    expect(
      isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(baseline, baseline, liveNodes, {
        requiredLiveNodeIds,
      }),
    ).toBe(false)
  })

  test('retains a canonical parcel building, every level, and nested build descendants', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      site: { children: ['context-building', 'parcel-building'], id: 'site', type: 'site' },
      'context-building': {
        children: ['context-level'],
        id: 'context-building',
        parentId: 'site',
        type: 'building',
      },
      'context-level': {
        children: [],
        id: 'context-level',
        parentId: 'context-building',
        type: 'level',
      },
      'parcel-building': {
        children: ['parcel-ground', 'parcel-upper'],
        id: 'parcel-building',
        metadata: { landrushParcelId: SYNC_SCOPE.parcelId },
        parentId: 'site',
        type: 'building',
      },
      'parcel-ground': {
        children: ['wall', 'stair'],
        id: 'parcel-ground',
        metadata: { landrushParcelId: SYNC_SCOPE.parcelId },
        parentId: 'parcel-building',
        type: 'level',
      },
      'parcel-upper': {
        children: [],
        id: 'parcel-upper',
        metadata: { landrushParcelId: SYNC_SCOPE.parcelId },
        parentId: 'parcel-building',
        type: 'level',
      },
      wall: { children: ['door'], id: 'wall', parentId: 'parcel-ground', type: 'wall' },
      door: { id: 'door', parentId: 'wall', type: 'door' },
      stair: {
        children: ['stair-segment'],
        id: 'stair',
        parentId: 'parcel-ground',
        type: 'stair',
      },
      'stair-segment': { id: 'stair-segment', parentId: 'stair', type: 'stairSegment' },
    }

    const ids = collectLandrushBuildSyncGraphNodeIds(nodes, ['wall', 'stair'], {
      stopParentIds: new Set(['context-building', 'context-level', 'site']),
    })

    expect([...ids].sort()).toEqual([
      'door',
      'parcel-building',
      'parcel-ground',
      'parcel-upper',
      'stair',
      'stair-segment',
      'wall',
    ])
    expect(ids.has('site')).toBe(false)
    expect(ids.has('context-building')).toBe(false)
    expect(ids.has('context-level')).toBe(false)
  })

  test('limits the mutation guard to the active parcel and excludes shared context nodes', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      'shared-level': { children: ['draft'], id: 'shared-level', type: 'level' },
      draft: { id: 'draft', parentId: 'shared-level', type: 'wall' },
      'building-a': {
        children: ['level-a'],
        id: 'building-a',
        metadata: { landrushParcelId: 'parcel-a' },
        type: 'building',
      },
      'level-a': { id: 'level-a', parentId: 'building-a', type: 'level' },
      'wall-a': { id: 'wall-a', parentId: 'level-a', type: 'wall' },
      'building-b': {
        children: ['level-b'],
        id: 'building-b',
        metadata: { landrushParcelId: 'parcel-b' },
        type: 'building',
      },
      'level-b': { id: 'level-b', parentId: 'building-b', type: 'level' },
      'wall-b': { id: 'wall-b', parentId: 'level-b', type: 'wall' },
      'local-tag-under-b': {
        id: 'local-tag-under-b',
        metadata: { landrushParcelId: 'parcel-a' },
        parentId: 'level-b',
        type: 'wall',
      },
    }
    const inParcelA = (id: string) =>
      isLandrushBuildNodeInParcelMutationScope(nodes, id, {
        parcelId: 'parcel-a',
        sharedLevelId: 'shared-level',
      })

    expect(inParcelA('draft')).toBe(false)
    expect(inParcelA('shared-level')).toBe(false)
    expect(inParcelA('wall-a')).toBe(true)
    expect(inParcelA('wall-b')).toBe(false)
    expect(inParcelA('local-tag-under-b')).toBe(false)
  })

  test('limits one-shot legacy adoption to validated untagged shared-level ancestry', () => {
    const allowedNodeIds = new Set([
      'wall',
      'door',
      'foreign-wall',
      'foreign-door',
      'orphan',
      'cycle-a',
      'cycle-b',
    ])
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      'shared-level': { children: ['wall', 'foreign-wall'], id: 'shared-level', type: 'level' },
      wall: { children: ['door'], id: 'wall', parentId: 'shared-level', type: 'wall' },
      door: { id: 'door', parentId: 'wall', type: 'door' },
      'foreign-wall': {
        children: ['foreign-door'],
        id: 'foreign-wall',
        metadata: { landrushParcelId: 'parcel-b', landrushWorldId: 'world-a' },
        parentId: 'shared-level',
        type: 'wall',
      },
      'foreign-door': { id: 'foreign-door', parentId: 'foreign-wall', type: 'door' },
      orphan: { id: 'orphan', parentId: 'missing-parent', type: 'wall' },
      'cycle-a': { id: 'cycle-a', parentId: 'cycle-b', type: 'wall' },
      'cycle-b': { id: 'cycle-b', parentId: 'cycle-a', type: 'wall' },
    }
    const canAdopt = (id: string) =>
      isLandrushBuildNodeInValidatedLegacyScope(nodes, id, {
        allowedNodeIds,
        sharedLevelId: 'shared-level',
      })

    expect(canAdopt('wall')).toBe(true)
    expect(canAdopt('door')).toBe(true)
    expect(canAdopt('foreign-wall')).toBe(false)
    expect(canAdopt('foreign-door')).toBe(false)
    expect(canAdopt('orphan')).toBe(false)
    expect(canAdopt('cycle-a')).toBe(false)
    expect(canAdopt('shared-level')).toBe(false)
  })

  test('collects outgoing nodes by parcel ancestry and excludes foreign roots and children', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      'building-a': {
        children: ['level-a'],
        id: 'building-a',
        metadata: { landrushParcelId: 'parcel-a' },
        type: 'building',
      },
      'level-a': { children: ['wall-a'], id: 'level-a', parentId: 'building-a', type: 'level' },
      'wall-a': {
        children: ['foreign-door', 'outside-wall'],
        id: 'wall-a',
        parentId: 'level-a',
        type: 'wall',
      },
      'foreign-door': {
        id: 'foreign-door',
        metadata: { landrushParcelId: 'parcel-b' },
        parentId: 'wall-a',
        type: 'door',
      },
      'outside-wall': {
        children: ['outside-door'],
        id: 'outside-wall',
        parentId: 'level-a',
        type: 'wall',
      },
      'outside-door': { id: 'outside-door', parentId: 'outside-wall', type: 'door' },
      'building-b': {
        children: ['level-b'],
        id: 'building-b',
        metadata: { landrushParcelId: 'parcel-b' },
        type: 'building',
      },
      'level-b': { children: ['wall-b'], id: 'level-b', parentId: 'building-b', type: 'level' },
      'wall-b': { id: 'wall-b', parentId: 'level-b', type: 'wall' },
    }
    const includeNode = (candidate: LandrushBuildSyncGraphNode) =>
      candidate.id !== 'outside-wall' &&
      isLandrushBuildNodeInParcelMutationScope(nodes, candidate.id, {
        allowUntaggedSharedLevel: false,
        parcelId: 'parcel-a',
        sharedLevelId: 'shared-level',
      })
    const ids = collectLandrushBuildSyncGraphNodeIds(nodes, ['wall-a', 'wall-b'], {
      includeNode,
    })

    expect([...ids].sort()).toEqual(['building-a', 'level-a', 'wall-a'])
  })

  test('retains an isolated untagged v1 shared-level graph for inbound migration', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      wall: { children: ['door'], id: 'wall', parentId: 'shared-level', type: 'wall' },
      door: { id: 'door', parentId: 'wall', type: 'door' },
    }
    const includeNode = (candidate: LandrushBuildSyncGraphNode) =>
      isLandrushBuildNodeInParcelMutationScope(nodes, candidate.id, {
        allowUntaggedSharedLevel: true,
        parcelId: 'parcel-a',
        sharedLevelId: 'shared-level',
      })

    expect(
      [
        ...collectLandrushBuildSyncGraphNodeIds(nodes, ['wall'], {
          includeNode,
          stopParentIds: new Set(['shared-level']),
        }),
      ].sort(),
    ).toEqual(['door', 'wall'])
  })

  test('rejects the whole inbound snapshot when a node is malformed or duplicated', () => {
    const parseNode = (value: unknown) => {
      if (
        !value ||
        typeof value !== 'object' ||
        typeof (value as { id?: unknown }).id !== 'string'
      ) {
        return null
      }
      return value as { id: string }
    }

    expect(parseLandrushBuildSyncSnapshotNodes([{ id: 'wall' }, null], parseNode)).toEqual({
      kind: 'invalid',
    })
    expect(
      parseLandrushBuildSyncSnapshotNodes([{ id: 'wall' }, { id: 'wall' }], parseNode),
    ).toEqual({ kind: 'invalid' })
    expect(parseLandrushBuildSyncSnapshotNodes([{ id: 'wall' }], parseNode)).toEqual({
      kind: 'nodes',
      nodes: { wall: { id: 'wall' } },
    })
  })

  test('preserves validated legacy slab field presence for migration and v2 lossless checks', () => {
    const rawLegacySlab = structuredClone(
      SlabNode.parse({
        elevation: 0.15,
        id: 'slab_legacy_interval',
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      }),
    ) as Record<string, unknown>
    delete rawLegacySlab.thickness
    const parseNode = (value: unknown) => {
      const result = AnyNodeSchema.safeParse(value)
      return result.success ? result.data : null
    }

    const parsedLegacy = parseLandrushBuildSyncSnapshotNodes([rawLegacySlab], parseNode)
    expect(parsedLegacy.kind).toBe('nodes')
    if (parsedLegacy.kind !== 'nodes') throw new Error('Expected valid legacy slab')
    expect(Object.hasOwn(parsedLegacy.nodes.slab_legacy_interval!, 'thickness')).toBe(false)

    const migration = migrateVerticalSceneNodes(parsedLegacy.nodes)
    const migratedNodes = migration.nodes as Record<string, AnyNode>
    expect(migration.changed).toBe(true)
    expect(migratedNodes.slab_legacy_interval).toMatchObject({
      elevation: 0.15,
      thickness: 0.15,
      type: 'slab',
    })
    expect(
      isLandrushBuildSyncV2GraphLossless(
        parsedLegacy.nodes,
        Object.values(parsedLegacy.nodes),
        Object.values(migratedNodes),
      ),
    ).toBe(false)

    const rawV2Slab = { ...rawLegacySlab, thickness: 0.15 }
    const parsedV2 = parseLandrushBuildSyncSnapshotNodes([rawV2Slab], parseNode)
    expect(parsedV2.kind).toBe('nodes')
    if (parsedV2.kind !== 'nodes') throw new Error('Expected valid v2 slab')
    const canonicalV2 = migrateVerticalSceneNodes(parsedV2.nodes)
    expect(canonicalV2.changed).toBe(false)
    expect(
      isLandrushBuildSyncV2GraphLossless(
        parsedV2.nodes,
        Object.values(parsedV2.nodes),
        Object.values(canonicalV2.nodes) as AnyNode[],
      ),
    ).toBe(true)

    const rawZeroThicknessSlab = { ...rawLegacySlab, thickness: 0 }
    const parsedZeroThickness = parseLandrushBuildSyncSnapshotNodes(
      [rawZeroThicknessSlab],
      parseNode,
    )
    expect(parsedZeroThickness.kind).toBe('nodes')
    if (parsedZeroThickness.kind !== 'nodes') throw new Error('Expected valid zero-thickness slab')
    expect(parsedZeroThickness.nodes.slab_legacy_interval).toMatchObject({ thickness: 0 })
    expect(migrateVerticalSceneNodes(parsedZeroThickness.nodes).changed).toBe(false)

    const rawUndefinedThicknessSlab = { ...rawLegacySlab, thickness: undefined }
    const parsedUndefinedThickness = parseLandrushBuildSyncSnapshotNodes(
      [rawUndefinedThicknessSlab],
      parseNode,
    )
    expect(parsedUndefinedThickness.kind).toBe('nodes')
    if (parsedUndefinedThickness.kind !== 'nodes') {
      throw new Error('Expected valid undefined-thickness slab')
    }
    expect(Object.hasOwn(parsedUndefinedThickness.nodes.slab_legacy_interval!, 'thickness')).toBe(
      false,
    )

    expect(
      parseLandrushBuildSyncSnapshotNodes([{ ...rawLegacySlab, polygon: 'malformed' }], parseNode),
    ).toEqual({ kind: 'invalid' })
    expect(
      parseLandrushBuildSyncSnapshotNodes(
        [rawLegacySlab, structuredClone(rawLegacySlab)],
        parseNode,
      ),
    ).toEqual({ kind: 'invalid' })
  })

  test('projects external host parents to transport roots without detaching internal children', () => {
    const graph: LandrushBuildSyncGraphNode[] = [
      {
        children: ['level'],
        id: 'building',
        parentId: 'site-outside-snapshot',
        type: 'building',
      },
      { children: ['wall'], id: 'level', parentId: 'building', type: 'level' },
      { id: 'wall', parentId: 'level', type: 'wall' },
    ]

    const hostNodes = createLandrushBuildSyncSnapshotNodes(graph, SYNC_SCOPE)
    const transportNodes = createLandrushBuildSyncTransportNodes(graph, SYNC_SCOPE)

    expect(hostNodes.find((node) => node.id === 'building')?.parentId).toBe('site-outside-snapshot')
    expect(transportNodes.find((node) => node.id === 'building')?.parentId).toBeNull()
    expect(transportNodes.find((node) => node.id === 'level')?.parentId).toBe('building')
    expect(transportNodes.find((node) => node.id === 'wall')?.parentId).toBe('level')
  })

  test('rejects v2 graphs when selection drops nodes or canonicalization repairs internals', () => {
    const parsed = {
      building: { children: ['level'], id: 'building', parentId: null, type: 'building' },
      level: { children: ['wall'], id: 'level', parentId: 'building', type: 'level' },
      wall: { id: 'wall', parentId: 'level', type: 'wall' },
    }
    const canonicalTransportNodes = Object.values(parsed)

    expect(
      isLandrushBuildSyncV2GraphLossless(
        parsed,
        [parsed.building, parsed.level],
        canonicalTransportNodes,
      ),
    ).toBe(false)
    expect(
      isLandrushBuildSyncV2GraphLossless(parsed, Object.values(parsed), [
        parsed.building,
        parsed.level,
        { ...parsed.wall, parentId: 'building' },
      ]),
    ).toBe(false)
    expect(
      isLandrushBuildSyncV2GraphLossless(parsed, Object.values(parsed), canonicalTransportNodes),
    ).toBe(true)
  })

  test('fails closed when a schema migration drops source ids or is not reversible', () => {
    const source = [{ id: 'legacy-wall' }]
    const scaffold = [
      { children: ['level'], id: 'building', parentId: null, type: 'building' },
      { children: [], id: 'level', parentId: 'building', type: 'level' },
    ]
    const preserved = [
      { ...scaffold[0], children: ['level'] },
      { ...scaffold[1], children: ['legacy-wall'] },
      { id: 'legacy-wall', parentId: 'level', type: 'wall' },
    ]

    expect(isLandrushBuildSyncMigrationPayloadSafe(source, scaffold, scaffold)).toBe(false)
    expect(
      isLandrushBuildSyncMigrationPayloadSafe(source, preserved, [
        preserved[0]!,
        preserved[1]!,
        { ...preserved[2]!, parentId: 'building' },
      ]),
    ).toBe(false)
    expect(isLandrushBuildSyncMigrationPayloadSafe(source, preserved, preserved)).toBe(true)
  })

  test('keeps hidden structural nodes in sync membership while bounds still filter them', () => {
    const nodes: Record<string, LandrushBuildSyncGraphNode> = {
      building: { children: ['level'], id: 'building', type: 'building' },
      level: {
        children: ['hidden-inside', 'hidden-outside'],
        id: 'level',
        parentId: 'building',
        type: 'level',
      },
      'hidden-inside': {
        id: 'hidden-inside',
        parentId: 'level',
        type: 'wall',
        visible: false,
      },
      'hidden-outside': {
        id: 'hidden-outside',
        parentId: 'level',
        type: 'item',
        visible: false,
      },
    }
    const isStructural = (node: LandrushBuildSyncGraphNode) =>
      isLandrushBuildSyncStructuralObject(node, (parentId) => parentId === 'level')

    expect(isStructural(nodes['hidden-inside']!)).toBe(true)
    expect(isStructural(nodes['hidden-outside']!)).toBe(true)
    const ids = collectLandrushBuildSyncGraphNodeIds(nodes, ['building'], {
      includeNode: (node) => !isStructural(node) || node.id !== 'hidden-outside',
    })
    expect([...ids].sort()).toEqual(['building', 'hidden-inside', 'level'])
  })
})
