import { describe, expect, test } from 'bun:test'
import {
  createLandrushBuildSyncSnapshotNodes,
  createLandrushBuildSyncTransportNodes,
  isLandrushBuildNodeInParcelMutationScope,
  isLandrushBuildNodeInValidatedLegacyScope,
  isLandrushBuildSyncCandidateSafeAgainstLiveBaseline,
  isLandrushBuildSyncMigrationPayloadSafe,
} from '@landrush/pascal-host/landrush-build-sync'
import { canonicalizeLandrushParcelBuildGraph } from '@landrush/pascal-host/landrush-parcel-build-graph'
import {
  type AnyNode,
  type AnyNodeId,
  applySceneOperationPatch,
  BuildingNode,
  clearSceneHistory,
  DoorNode,
  LevelNode,
  type SceneCommit,
  SiteNode,
  StairNode,
  subscribeSceneCommits,
  useScene,
  WallNode,
} from '@pascal-app/core'
import { resolveStairDestinationLevel } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  activateLandrushBuildHostEditorTarget,
  advanceLandrushBuildAuthorizedLocalDeletions,
  createLandrushBuildAuthorityEvictionPatches,
  createLandrushBuildAuthorityParcelKey,
  createLandrushBuildCommitPublishScheduler,
  createLandrushBuildHostOperationPatches,
  createLandrushBuildInvalidNodeDeletionScheduler,
  isLandrushBuildConflictRetryReady,
  isLandrushBuildMaterializationReady,
  resetLandrushBuildAuthorityCachesOnChange,
  rollbackLandrushBuildRejectedCandidate,
  shouldApplyLandrushBuildContentUpdate,
  shouldPublishLandrushBuildSceneCommit,
  shouldSubscribeLandrushBuildCommitPublisher,
} from './landrush-build-host-sync'

function node(value: Record<string, unknown>) {
  return value as AnyNode
}

function sceneCommit(
  beforeNodes: Record<string, AnyNode>,
  currentNodes: Record<string, AnyNode>,
  changedNodeIds?: ReadonlySet<AnyNodeId>,
  origin: SceneCommit['origin'] = 'local',
): SceneCommit {
  const snapshot = (nodes: Record<string, AnyNode>) => ({
    collections: {},
    installedPlugins: [],
    materials: {},
    nodes,
    rootNodeIds: [],
  })
  return {
    before: snapshot(beforeNodes),
    changedNodeIds,
    current: snapshot(currentNodes),
    origin,
  }
}

function ownsParcelA(candidate: AnyNode) {
  return (
    (candidate.metadata as { landrushParcelId?: string } | undefined)?.landrushParcelId ===
    'parcel-a'
  )
}

function withTestScene(
  nodes: Record<string, AnyNode>,
  rootNodeIds: readonly AnyNodeId[],
  callback: () => void,
) {
  const original = useScene.getState()
  try {
    useScene.setState({
      collections: {},
      dirtyNodes: new Set<AnyNodeId>(),
      installedPlugins: original.installedPlugins,
      materials: {},
      nodes,
      readOnly: false,
      rootNodeIds,
    } as never)
    clearSceneHistory()
    callback()
  } finally {
    useScene.setState({
      collections: original.collections,
      dirtyNodes: original.dirtyNodes,
      installedPlugins: original.installedPlugins,
      materials: original.materials,
      nodes: original.nodes,
      readOnly: original.readOnly,
      rootNodeIds: original.rootNodeIds,
    })
    clearSceneHistory()
  }
}

describe('Landrush build host sync', () => {
  test('publishes only Pascal local commits so host changes cannot echo', () => {
    expect(shouldPublishLandrushBuildSceneCommit('local')).toBe(true)
    expect(shouldPublishLandrushBuildSceneCommit('host')).toBe(false)
    expect(shouldPublishLandrushBuildSceneCommit('load')).toBe(false)
  })

  test('keeps the local commit publisher subscribed while authority is suspended', () => {
    expect(
      shouldSubscribeLandrushBuildCommitPublisher({
        hasLiveLayoutNode: true,
        hasLocalParcelOwnership: true,
      }),
    ).toBe(true)
    expect(
      shouldSubscribeLandrushBuildCommitPublisher({
        hasLiveLayoutNode: false,
        hasLocalParcelOwnership: true,
      }),
    ).toBe(false)
    expect(
      shouldSubscribeLandrushBuildCommitPublisher({
        hasLiveLayoutNode: true,
        hasLocalParcelOwnership: false,
      }),
    ).toBe(false)
  })

  test('keeps Fast Refresh state paused until its transport baseline is rehydrated', () => {
    const baseline = [node({ id: 'wall-a', object: 'node', type: 'wall' })]
    expect(
      isLandrushBuildMaterializationReady({
        appliedSequence: 12,
        baselineNodes: undefined,
        liveNodes: {},
        materializedSequence: 12,
      }),
    ).toBe(false)
    expect(
      isLandrushBuildMaterializationReady({
        appliedSequence: 12,
        baselineNodes: baseline,
        liveNodes: { 'wall-a': baseline[0] },
        materializedSequence: 12,
      }),
    ).toBe(true)
    expect(
      isLandrushBuildMaterializationReady({
        appliedSequence: 12,
        baselineNodes: baseline,
        liveNodes: {},
        materializedSequence: 12,
      }),
    ).toBe(false)
    expect(
      isLandrushBuildMaterializationReady({
        appliedSequence: 12,
        authorizedDeletedNodeIds: new Set(['wall-a']),
        baselineNodes: baseline,
        liveNodes: {},
        materializedSequence: 12,
      }),
    ).toBe(true)
  })

  test('retries only the active conflict sequence with a hydrated baseline', () => {
    expect(
      isLandrushBuildConflictRetryReady({
        appliedSequence: 13,
        conflictSequence: 13,
        hasBaseline: true,
      }),
    ).toBe(true)
    expect(
      isLandrushBuildConflictRetryReady({
        appliedSequence: 14,
        conflictSequence: 13,
        hasBaseline: true,
      }),
    ).toBe(false)
    expect(
      isLandrushBuildConflictRetryReady({
        appliedSequence: 13,
        conflictSequence: 13,
        hasBaseline: false,
      }),
    ).toBe(false)
  })

  test('clears stale authority across world revisits and same-world runtime resets', () => {
    const key = (epoch: number, worldId: string, parcelId = 'parcel-03') =>
      createLandrushBuildAuthorityParcelKey({ authorityEpoch: epoch, parcelId, worldId })
    const appliedSequences = new Map<string, number>([[key(4, 'world-a'), 12]])
    const materializedSequences = new Map<string, number>([[key(4, 'world-a'), 12]])
    const authorizedDeletionIds = new Map<string, ReadonlySet<AnyNodeId>>([
      [key(4, 'world-a'), new Set(['wall-a' as AnyNodeId])],
    ])
    const quarantinedSequences = new Map<string, number>([[key(4, 'world-a', 'parcel-04'), 9]])
    const safeTransportBaselines = new Map<string, readonly AnyNode[]>([
      [key(4, 'world-a'), [node({ id: 'wall-a', object: 'node', type: 'wall' })]],
    ])
    const reset = (
      previousAuthority: { epoch: number; worldId: string },
      nextAuthority: { epoch: number; worldId: string },
    ) =>
      resetLandrushBuildAuthorityCachesOnChange({
        appliedSequences,
        authorizedDeletionIds,
        materializedSequences,
        nextAuthority,
        previousAuthority,
        quarantinedSequences,
        safeTransportBaselines,
      })

    expect(reset({ epoch: 4, worldId: 'world-a' }, { epoch: 4, worldId: 'world-a' })).toBe(false)
    expect(appliedSequences.get(key(4, 'world-a'))).toBe(12)
    expect(safeTransportBaselines.has(key(4, 'world-a'))).toBe(true)

    expect(reset({ epoch: 4, worldId: 'world-a' }, { epoch: 5, worldId: 'world-b' })).toBe(true)
    expect(appliedSequences.size).toBe(0)
    expect(materializedSequences.size).toBe(0)
    expect(authorizedDeletionIds.size).toBe(0)
    expect(quarantinedSequences.size).toBe(0)
    expect(safeTransportBaselines.size).toBe(0)
    expect(
      isLandrushBuildMaterializationReady({
        appliedSequence: appliedSequences.get(key(5, 'world-b')) ?? 0,
        baselineNodes: safeTransportBaselines.get(key(5, 'world-b')),
        liveNodes: {},
        materializedSequence: materializedSequences.get(key(5, 'world-b')) ?? 0,
      }),
    ).toBe(false)

    appliedSequences.set(key(5, 'world-b'), 1)
    materializedSequences.set(key(5, 'world-b'), 1)
    safeTransportBaselines.set(key(5, 'world-b'), [
      node({ id: 'wall-b', object: 'node', type: 'wall' }),
    ])
    expect(reset({ epoch: 5, worldId: 'world-b' }, { epoch: 6, worldId: 'world-a' })).toBe(true)
    expect(
      isLandrushBuildMaterializationReady({
        appliedSequence: appliedSequences.get(key(6, 'world-a')) ?? 0,
        baselineNodes: safeTransportBaselines.get(key(6, 'world-a')),
        liveNodes: {},
        materializedSequence: materializedSequences.get(key(6, 'world-a')) ?? 0,
      }),
    ).toBe(false)

    appliedSequences.set(key(6, 'world-a'), 1)
    materializedSequences.set(key(6, 'world-a'), 1)
    safeTransportBaselines.set(key(6, 'world-a'), [
      node({ id: 'wall-a-new', object: 'node', type: 'wall' }),
    ])
    expect(reset({ epoch: 6, worldId: 'world-a' }, { epoch: 7, worldId: 'world-a' })).toBe(true)
    expect(appliedSequences.size).toBe(0)
    expect(materializedSequences.size).toBe(0)
    expect(safeTransportBaselines.size).toBe(0)
  })

  test('evicts only the previous world parcel graph and preserves shared context', () => {
    const site = node({
      children: ['building-a', 'building-b', 'shared-tree'],
      id: 'site',
      object: 'node',
      type: 'site',
    })
    const buildingA = node({
      children: ['level-a'],
      id: 'building-a',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-a',
        landrushWorldId: 'world-a',
      },
      object: 'node',
      parentId: 'site',
      type: 'building',
    })
    const levelA = node({
      children: ['wall-a', 'stair-a'],
      id: 'level-a',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-a',
        landrushWorldId: 'world-a',
      },
      object: 'node',
      parentId: 'building-a',
      type: 'level',
    })
    const wallA = node({
      children: ['door-a'],
      id: 'wall-a',
      object: 'node',
      parentId: 'level-a',
      type: 'wall',
    })
    const doorA = node({
      id: 'door-a',
      object: 'node',
      parentId: 'wall-a',
      type: 'door',
    })
    const stairA = node({
      id: 'stair-a',
      object: 'node',
      parentId: 'level-a',
      type: 'stair',
    })
    const buildingB = node({
      id: 'building-b',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-b',
        landrushWorldId: 'world-b',
      },
      object: 'node',
      parentId: 'site',
      type: 'building',
    })
    const sharedTree = node({
      id: 'shared-tree',
      object: 'node',
      parentId: 'site',
      type: 'item',
    })
    const currentNodes = {
      [buildingA.id]: buildingA,
      [buildingB.id]: buildingB,
      [doorA.id]: doorA,
      [levelA.id]: levelA,
      [site.id]: site,
      [stairA.id]: stairA,
      [sharedTree.id]: sharedTree,
      [wallA.id]: wallA,
    }
    const result = createLandrushBuildAuthorityEvictionPatches({
      currentNodes,
      currentRootNodeIds: [site.id],
      worldIds: new Set(['world-a']),
    })

    expect(result.kind).toBe('patches')
    if (result.kind !== 'patches') return
    expect(result.patches).toHaveLength(1)
    expect(new Set(result.patches[0]?.nodeDeletes.map(({ node: deleted }) => deleted.id))).toEqual(
      new Set(['building-a', 'level-a', 'wall-a', 'door-a', 'stair-a']),
    )
    withTestScene(currentNodes, [site.id], () => {
      expect(result.patches.every((operation) => applySceneOperationPatch(operation))).toBe(true)
      expect(useScene.getState().nodes[buildingA.id]).toBeUndefined()
      expect(useScene.getState().nodes[levelA.id]).toBeUndefined()
      expect(useScene.getState().nodes[wallA.id]).toBeUndefined()
      expect(useScene.getState().nodes[doorA.id]).toBeUndefined()
      expect(useScene.getState().nodes[stairA.id]).toBeUndefined()
      expect(useScene.getState().nodes[buildingB.id]).toEqual(buildingB)
      expect(useScene.getState().nodes[sharedTree.id]).toEqual(sharedTree)
      expect((useScene.getState().nodes[site.id] as { children: string[] }).children).toEqual([
        'building-b',
        'shared-tree',
      ])
    })
  })

  test('evicts every tagged parcel graph when a new room reuses the same world id', () => {
    const site = node({
      children: ['building-a', 'building-b', 'shared-tree'],
      id: 'site',
      object: 'node',
      type: 'site',
    })
    const taggedBuilding = (id: string, parcelId: string) =>
      node({
        id,
        metadata: {
          landrushBuildSynced: true,
          landrushParcelId: parcelId,
          landrushWorldId: 'shared-world',
        },
        object: 'node',
        parentId: 'site',
        type: 'building',
      })
    const buildingA = taggedBuilding('building-a', 'parcel-a')
    const buildingB = taggedBuilding('building-b', 'parcel-b')
    const sharedTree = node({
      id: 'shared-tree',
      object: 'node',
      parentId: 'site',
      type: 'item',
    })
    const currentNodes = {
      [buildingA.id]: buildingA,
      [buildingB.id]: buildingB,
      [site.id]: site,
      [sharedTree.id]: sharedTree,
    }
    const result = createLandrushBuildAuthorityEvictionPatches({
      currentNodes,
      currentRootNodeIds: [site.id],
      worldIds: new Set(['shared-world']),
    })

    expect(result.kind).toBe('patches')
    if (result.kind !== 'patches') return
    expect(result.patches[0]?.nodeDeletes.map(({ node: deleted }) => deleted.id)).toEqual([
      'building-a',
      'building-b',
    ])
    withTestScene(currentNodes, [site.id], () => {
      expect(result.patches.every((operation) => applySceneOperationPatch(operation))).toBe(true)
      expect(useScene.getState().nodes[buildingA.id]).toBeUndefined()
      expect(useScene.getState().nodes[buildingB.id]).toBeUndefined()
      expect(useScene.getState().nodes[sharedTree.id]).toEqual(sharedTree)
      expect((useScene.getState().nodes[site.id] as { children: string[] }).children).toEqual([
        'shared-tree',
      ])
    })
  })

  test('rejects eviction when a target parcel contains foreign tagged descendants', () => {
    const building = node({
      children: ['level-a'],
      id: 'building-a',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-a',
        landrushWorldId: 'world-a',
      },
      object: 'node',
      parentId: null,
      type: 'building',
    })
    const level = node({
      children: ['wall-b'],
      id: 'level-a',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-a',
        landrushWorldId: 'world-a',
      },
      object: 'node',
      parentId: 'building-a',
      type: 'level',
    })
    const foreignWall = node({
      id: 'wall-b',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-b',
        landrushWorldId: 'world-a',
      },
      object: 'node',
      parentId: 'level-a',
      type: 'wall',
    })

    expect(
      createLandrushBuildAuthorityEvictionPatches({
        currentNodes: {
          [building.id]: building,
          [foreignWall.id]: foreignWall,
          [level.id]: level,
        },
        currentRootNodeIds: [building.id],
        worldIds: new Set(['world-a']),
      }),
    ).toEqual({ kind: 'invalid' })
  })

  test('rejects cyclic untagged descendants beneath a target parcel graph', () => {
    const level = node({
      children: ['wall-a'],
      id: 'level-a',
      metadata: {
        landrushBuildSynced: true,
        landrushParcelId: 'parcel-a',
        landrushWorldId: 'world-a',
      },
      object: 'node',
      parentId: null,
      type: 'level',
    })
    const wall = node({
      children: ['door-a'],
      id: 'wall-a',
      object: 'node',
      parentId: 'door-a',
      type: 'wall',
    })
    const door = node({
      children: ['wall-a'],
      id: 'door-a',
      object: 'node',
      parentId: 'wall-a',
      type: 'door',
    })

    expect(
      createLandrushBuildAuthorityEvictionPatches({
        currentNodes: { [door.id]: door, [level.id]: level, [wall.id]: wall },
        currentRootNodeIds: [level.id],
        worldIds: new Set(['world-a']),
      }),
    ).toEqual({ kind: 'invalid' })
  })

  test('publishes the settled stair-derived state after the local commit', () => {
    const microtasks: Array<() => void> = []
    const published: string[] = []
    let desired = 'stair-created'
    const scheduler = createLandrushBuildCommitPublishScheduler({
      publish: (next) => published.push(next),
      readDesired: () => desired,
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })

    scheduler.handleCommit(sceneCommit({}, {}, new Set()))
    microtasks.shift()?.()
    desired = 'stair-rise-and-opening-synced'
    microtasks.shift()?.()

    expect(published).toEqual(['stair-rise-and-opening-synced'])
  })

  test('rolls a rejected build back only to the nearest safe history state and clears redo', () => {
    const pastStates = [
      { label: 'older build state', transport: 'older-build' },
      { label: 'safe build state', transport: 'safe-build' },
      { label: 'unrelated local change', transport: 'safe-build' },
    ]
    let desired = 'rejected-build'
    let clearRedoCount = 0
    let rematerializeCount = 0
    const result = rollbackLandrushBuildRejectedCandidate({
      areEqual: (first, second) => first === second,
      baseline: 'safe-build',
      clearRedo: () => {
        clearRedoCount += 1
      },
      desiredFromPastState: (state) => state.transport,
      pastStates,
      readDesired: () => desired,
      rematerialize: () => {
        rematerializeCount += 1
        desired = 'safe-build'
        return desired
      },
      undo: () => {
        desired = pastStates.pop()?.transport ?? desired
      },
    })

    expect(result).toEqual({ kind: 'history', undoCount: 1 })
    expect(pastStates).toEqual([
      { label: 'older build state', transport: 'older-build' },
      { label: 'safe build state', transport: 'safe-build' },
    ])
    expect(clearRedoCount).toBe(1)
    expect(rematerializeCount).toBe(0)
  })

  test('uses safe rematerialization without undoing when history has no matching baseline', () => {
    let desired = 'rejected-build'
    let undoCount = 0
    let redoCleared = false
    const result = rollbackLandrushBuildRejectedCandidate({
      areEqual: (first, second) => first === second,
      baseline: 'safe-build',
      clearRedo: () => {
        redoCleared = true
      },
      desiredFromPastState: (state) => state,
      pastStates: ['unrelated-old-state'],
      readDesired: () => desired,
      rematerialize: () => {
        desired = 'safe-build'
        return desired
      },
      undo: () => {
        undoCount += 1
      },
    })

    expect(result).toEqual({ kind: 'rematerialized', undoCount: 0 })
    expect(undoCount).toBe(0)
    expect(redoCleared).toBe(true)
  })

  test('coalesces rollback commits to the safe baseline without retrying the rejected candidate', () => {
    const microtasks: Array<() => void> = []
    const considered: string[] = []
    const synced: string[] = []
    const pastStates = ['safe-build']
    let desired = 'rejected-build'
    let redoCleared = false
    let safeBaseline = 'safe-build'
    let scheduler!: ReturnType<typeof createLandrushBuildCommitPublishScheduler<string>>
    scheduler = createLandrushBuildCommitPublishScheduler({
      publish: (candidate) => {
        considered.push(candidate)
        if (candidate === 'rejected-build') {
          rollbackLandrushBuildRejectedCandidate({
            areEqual: (first, second) => first === second,
            baseline: safeBaseline,
            clearRedo: () => {
              redoCleared = true
            },
            desiredFromPastState: (state) => state,
            pastStates,
            readDesired: () => desired,
            rematerialize: () => null,
            undo: () => {
              desired = pastStates.pop() ?? desired
              scheduler.handleCommit(sceneCommit({}, {}, new Set()))
            },
          })
          return
        }
        if (candidate === safeBaseline) return
        synced.push(candidate)
        safeBaseline = candidate
      },
      readDesired: () => desired,
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })

    scheduler.handleCommit(sceneCommit({}, {}, new Set()))
    while (microtasks.length > 0) microtasks.shift()?.()

    expect(considered).toEqual(['rejected-build', 'safe-build'])
    expect(synced).toEqual([])
    expect(safeBaseline).toBe('safe-build')
    expect(redoCleared).toBe(true)
  })

  test('settles a load commit against the latest safe baseline without publishing stale content', () => {
    const microtasks: Array<() => void> = []
    const published: number[] = []
    const safeBaseline = Array.from({ length: 15 }, (_, index) => `node-${index}`)
    const staleAuthorityUpdate = safeBaseline.slice(0, 14)
    let liveNodes = ['parcel-building', 'parcel-level']
    const scheduler = createLandrushBuildCommitPublishScheduler({
      publish: (nodes) => published.push(nodes.length),
      readDesired: () => staleAuthorityUpdate,
      scheduleMicrotask: (callback) => microtasks.push(callback),
      settle: () => {
        liveNodes = safeBaseline
        return false
      },
    })

    scheduler.handleCommit(sceneCommit({}, {}, undefined, 'load'))
    while (microtasks.length > 0) microtasks.shift()?.()

    expect(liveNodes).toEqual(safeBaseline)
    expect(published).toEqual([])
  })

  test('rejects a retained 15-node baseline collapsing to a two-node HMR scaffold', () => {
    const baseline = Array.from({ length: 15 }, (_, index) =>
      node({
        id: index === 0 ? 'parcel-building' : index === 1 ? 'parcel-level' : `build-node-${index}`,
        object: 'node',
        parentId: index === 0 ? null : index === 1 ? 'parcel-building' : 'parcel-level',
        type: index === 0 ? 'building' : index === 1 ? 'level' : 'wall',
      }),
    )
    const baselineById = Object.fromEntries(baseline.map((candidate) => [candidate.id, candidate]))
    const scaffold = baseline.slice(0, 2)
    const scaffoldById = Object.fromEntries(scaffold.map((candidate) => [candidate.id, candidate]))
    const microtasks: Array<() => void> = []
    const published: number[] = []
    let authorizedNodeIds = new Set<AnyNodeId>()
    let desired = baseline
    let liveNodes = baselineById
    const scheduler = createLandrushBuildCommitPublishScheduler({
      publish: (nodes) => {
        if (
          !isLandrushBuildMaterializationReady({
            appliedSequence: 285,
            authorizedDeletedNodeIds: authorizedNodeIds,
            baselineNodes: baseline,
            liveNodes,
            materializedSequence: 285,
          }) ||
          !isLandrushBuildSyncCandidateSafeAgainstLiveBaseline(baseline, nodes, liveNodes, {
            authorizedDeletedNodeIds: authorizedNodeIds,
          })
        ) {
          return
        }
        published.push(nodes.length)
        authorizedNodeIds = new Set()
      },
      readDesired: () => desired,
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })
    const handleCommit = (commit: SceneCommit) => {
      authorizedNodeIds = advanceLandrushBuildAuthorizedLocalDeletions({
        authorizedNodeIds,
        baselineNodes: baseline,
        commit,
      })
      scheduler.handleCommit(commit)
    }

    handleCommit(sceneCommit(baselineById, {}))
    liveNodes = scaffoldById
    desired = scaffold
    handleCommit(sceneCommit({}, scaffoldById))
    while (microtasks.length > 0) microtasks.shift()?.()

    expect(authorizedNodeIds).toEqual(new Set())
    expect(published).toEqual([])

    liveNodes = baselineById
    desired = baseline
    const deletedId = baseline[14]!.id as AnyNodeId
    const afterDelete = { ...baselineById }
    delete afterDelete[deletedId]
    desired = baseline.filter((candidate) => candidate.id !== deletedId)
    liveNodes = afterDelete
    handleCommit(sceneCommit(baselineById, afterDelete, new Set([deletedId])))
    while (microtasks.length > 0) microtasks.shift()?.()

    expect(published).toEqual([14])
  })

  test('revalidates queued invalid placements before deleting them', () => {
    const microtasks: Array<() => void> = []
    const deleted: string[][] = []
    let invalidIds = ['edge-wall']
    const scheduler = createLandrushBuildInvalidNodeDeletionScheduler({
      deleteInvalidNodeIds: (ids) => deleted.push([...ids]),
      readInvalidNodeIds: () => invalidIds,
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })

    scheduler.handleSceneChange()
    invalidIds = []
    microtasks.shift()?.()
    expect(deleted).toEqual([])

    invalidIds = ['edge-wall']
    scheduler.handleSceneChange()
    microtasks.shift()?.()
    expect(deleted).toEqual([['edge-wall']])
  })

  test('applies authoritative content updates but not acknowledgements or conflicts', () => {
    let visibleDesiredState = 'S2'
    let applyCount = 0
    const events = [
      { operationId: 'S1-operation', revision: 1, type: 'parcel-build-nodes-ack' },
      { localDesiredNodes: ['S2'], source: 'conflict' },
    ]

    for (const event of events) {
      if (!shouldApplyLandrushBuildContentUpdate(event)) continue
      applyCount += 1
      visibleDesiredState = 'S1'
    }

    expect(applyCount).toBe(0)
    expect(visibleDesiredState).toBe('S2')
    expect(shouldApplyLandrushBuildContentUpdate({ source: 'snapshot' })).toBe(true)
    expect(shouldApplyLandrushBuildContentUpdate({ source: 'remote' })).toBe(true)
    expect(shouldApplyLandrushBuildContentUpdate({ source: 'insufficient-funds' })).toBe(true)
    expect(shouldApplyLandrushBuildContentUpdate({ source: 'conflict' })).toBe(false)
  })

  test('creates a host patch without replacing unrelated scene nodes', () => {
    const currentNodes = {
      level: node({ children: ['wall', 'tree'], id: 'level', object: 'node', type: 'level' }),
      tree: node({ id: 'tree', object: 'node', parentId: 'level', type: 'item' }),
      wall: node({
        children: [],
        id: 'wall',
        metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
        object: 'node',
        parentId: 'level',
        start: [0, 0],
        type: 'wall',
      }),
    }
    const incomingNodes = [
      node({
        children: ['door'],
        id: 'wall',
        metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
        object: 'node',
        parentId: 'level',
        start: [1, 0],
        type: 'wall',
      }),
      node({
        id: 'door',
        metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
        object: 'node',
        parentId: 'wall',
        type: 'door',
      }),
    ]

    const result = createLandrushBuildHostOperationPatches({
      currentNodes,
      currentRootNodeIds: [],
      incomingNodes,
      ownsCurrentNode: ownsParcelA,
    })

    expect(result.kind).toBe('patches')
    if (result.kind !== 'patches') return
    expect(result.patches).toHaveLength(1)
    expect(result.patches[0]?.nodeCreates).toEqual([{ node: incomingNodes[1], position: 0 }])
    expect(result.patches[0]?.nodeDeletes).toEqual([])
    expect(result.patches[0]?.nodeUpdates).toEqual([
      {
        data: { children: ['door'], start: [1, 0] },
        id: 'wall',
        removeFields: [],
      },
    ])
    expect(currentNodes.level.children).toEqual(['wall', 'tree'])
  })

  test('reparents a retained door before deleting its previous authoritative wall', () => {
    const metadata = { landrushBuildSynced: true, landrushParcelId: 'parcel-a' }
    const site = SiteNode.parse({
      children: ['building_parcel'],
      id: 'site_context',
      parentId: null,
    })
    const building = BuildingNode.parse({
      children: ['level_parcel'],
      id: 'building_parcel',
      metadata,
      parentId: site.id,
    })
    const level = LevelNode.parse({
      children: ['wall_old'],
      id: 'level_parcel',
      level: 0,
      metadata,
      parentId: building.id,
    })
    const oldWall = WallNode.parse({
      children: ['door_retained'],
      end: [4, 0],
      id: 'wall_old',
      metadata,
      parentId: level.id,
      start: [0, 0],
    })
    const door = DoorNode.parse({
      id: 'door_retained',
      metadata,
      parentId: oldWall.id,
      position: [1, 0, 0],
      wallId: oldWall.id,
    })
    const newWall = WallNode.parse({
      children: [door.id],
      end: [4, 2],
      id: 'wall_new',
      metadata,
      parentId: level.id,
      start: [0, 2],
    })
    const incomingDoor = DoorNode.parse({
      ...door,
      parentId: newWall.id,
      wallId: newWall.id,
    })
    const incomingLevel = LevelNode.parse({ ...level, children: [newWall.id] })
    const currentNodes = Object.fromEntries(
      [site, building, level, oldWall, door].map((candidate) => [candidate.id, candidate]),
    )

    const result = createLandrushBuildHostOperationPatches({
      currentNodes,
      currentRootNodeIds: [site.id],
      incomingNodes: [building, incomingLevel, newWall, incomingDoor],
      ownsCurrentNode: ownsParcelA,
    })

    expect(result.kind).toBe('patches')
    if (result.kind !== 'patches') return
    expect(result.patches).toHaveLength(3)
    expect(result.patches[0]?.nodeCreates.map(({ node: created }) => created.id)).toEqual([
      newWall.id,
    ])
    expect(result.patches[1]?.nodeUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: { children: [] }, id: oldWall.id }),
        expect.objectContaining({ data: { children: [door.id] }, id: newWall.id }),
        expect.objectContaining({
          data: expect.objectContaining({ parentId: newWall.id }),
          id: door.id,
        }),
      ]),
    )
    expect(result.patches[2]?.nodeDeletes.map(({ node: deleted }) => deleted.id)).toEqual([
      oldWall.id,
    ])

    withTestScene(currentNodes, [site.id], () => {
      expect(result.patches.every((operation) => applySceneOperationPatch(operation))).toBe(true)
      expect(useScene.getState().nodes[oldWall.id]).toBeUndefined()
      expect(useScene.getState().nodes[newWall.id]).toEqual(newWall)
      expect(useScene.getState().nodes[door.id]).toEqual(incomingDoor)
      expect(useScene.getState().nodes[level.id]).toEqual(incomingLevel)
    })
  })

  test('deletes only parcel-owned nodes at their structural positions', () => {
    const wall = node({
      id: 'wall',
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: 'level',
      type: 'wall',
    })
    const result = createLandrushBuildHostOperationPatches({
      currentNodes: {
        level: node({ children: ['tree', 'wall'], id: 'level', object: 'node', type: 'level' }),
        tree: node({ id: 'tree', object: 'node', parentId: 'level', type: 'item' }),
        wall,
      },
      currentRootNodeIds: [],
      incomingNodes: [],
      ownsCurrentNode: ownsParcelA,
    })

    expect(result).toEqual({
      kind: 'patches',
      patches: [
        {
          materialChanges: [],
          nodeCreates: [],
          nodeDeletes: [{ node: wall, position: 1 }],
          nodeUpdates: [],
        },
      ],
    })
  })

  test('migrates a shared legacy level with two synchronous host patches', () => {
    const legacyWall = node({
      id: 'wall',
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: 'shared-level',
      type: 'wall',
    })
    const parcelBuilding = node({
      children: ['parcel-level'],
      id: 'parcel-building',
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: 'site',
      type: 'building',
    })
    const parcelLevel = node({
      children: ['wall'],
      id: 'parcel-level',
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: 'parcel-building',
      type: 'level',
    })
    const migratedWall = node({ ...legacyWall, parentId: 'parcel-level' })
    const currentNodes = {
      site: node({ children: ['shared-building'], id: 'site', object: 'node', type: 'site' }),
      'shared-building': node({
        children: ['shared-level'],
        id: 'shared-building',
        object: 'node',
        parentId: 'site',
        type: 'building',
      }),
      'shared-level': node({
        children: ['wall', 'tree'],
        id: 'shared-level',
        object: 'node',
        parentId: 'shared-building',
        type: 'level',
      }),
      tree: node({ id: 'tree', object: 'node', parentId: 'shared-level', type: 'item' }),
      wall: legacyWall,
    }

    const result = createLandrushBuildHostOperationPatches({
      currentNodes,
      currentRootNodeIds: ['site' as never],
      incomingNodes: [parcelBuilding, parcelLevel, migratedWall],
      ownsCurrentNode: (candidate) =>
        isLandrushBuildNodeInParcelMutationScope(currentNodes, candidate.id, {
          allowUntaggedSharedLevel: true,
          parcelId: 'parcel-a',
          sharedLevelId: 'shared-level',
        }),
    })

    expect(result.kind).toBe('patches')
    if (result.kind !== 'patches') return
    expect(result.patches).toHaveLength(2)
    expect(result.patches[0]?.nodeCreates.map(({ node: created }) => created.id)).toEqual([
      'parcel-building',
      'parcel-level',
    ])
    expect(result.patches[1]?.nodeUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'parcel-level' }),
          id: 'wall',
        }),
        expect.objectContaining({ data: { children: ['tree'] }, id: 'shared-level' }),
        expect.objectContaining({ data: { children: ['wall'] }, id: 'parcel-level' }),
      ]),
    )
  })

  test('preflights the full patch sequence and applies after live interaction clears', () => {
    const legacyWall = node({
      id: 'wall',
      metadata: { landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: 'shared-level',
      type: 'wall',
    })
    const incomingNodes = [
      node({
        children: ['parcel-level'],
        id: 'parcel-building',
        metadata: { landrushParcelId: 'parcel-a' },
        object: 'node',
        parentId: 'site',
        type: 'building',
      }),
      node({
        children: ['wall'],
        id: 'parcel-level',
        metadata: { landrushParcelId: 'parcel-a' },
        object: 'node',
        parentId: 'parcel-building',
        type: 'level',
      }),
      node({ ...legacyWall, parentId: 'parcel-level' }),
    ]
    const currentNodes = {
      site: node({ children: ['shared-building'], id: 'site', object: 'node', type: 'site' }),
      'shared-building': node({
        children: ['shared-level'],
        id: 'shared-building',
        object: 'node',
        parentId: 'site',
        type: 'building',
      }),
      'shared-level': node({
        children: ['wall'],
        id: 'shared-level',
        object: 'node',
        parentId: 'shared-building',
        type: 'level',
      }),
      wall: legacyWall,
    }
    let wallIsLive = true
    let applyCount = 0
    let selectionCount = 0
    const activate = () =>
      activateLandrushBuildHostEditorTarget({
        applyPatch: () => {
          applyCount += 1
          return true
        },
        currentNodes,
        currentRootNodeIds: ['site' as never],
        hasLiveNodeState: (id) => id === legacyWall.id && wallIsLive,
        incomingNodes,
        ownsCurrentNode: ownsParcelA,
        selectTarget: () => {
          selectionCount += 1
        },
        target: { buildingId: 'parcel-building' as never, levelId: 'parcel-level' as never },
      })

    expect(activate()).toBe(false)
    expect(applyCount).toBe(0)
    expect(selectionCount).toBe(0)

    wallIsLive = false
    expect(activate()).toBe(true)
    expect(applyCount).toBe(2)
    expect(selectionCount).toBe(1)
  })

  test('applies hierarchy migration through real host commits without republishing', () => {
    const original = useScene.getState()
    const site = SiteNode.parse({
      children: ['building_shared'],
      id: 'site_context',
      parentId: null,
    })
    const sharedBuilding = BuildingNode.parse({
      children: ['level_shared'],
      id: 'building_shared',
      parentId: site.id,
    })
    const sharedLevel = LevelNode.parse({
      children: ['wall_legacy'],
      id: 'level_shared',
      level: 0,
      parentId: sharedBuilding.id,
    })
    const legacyWall = WallNode.parse({
      end: [4, 0],
      id: 'wall_legacy',
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      parentId: sharedLevel.id,
      start: [0, 0],
    })
    const parcelBuilding = BuildingNode.parse({
      children: ['level_parcel_ground'],
      id: 'building_parcel_a',
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      parentId: site.id,
    })
    const parcelLevel = LevelNode.parse({
      children: [legacyWall.id],
      id: 'level_parcel_ground',
      level: 0,
      metadata: { landrushBuildSynced: true, landrushParcelId: 'parcel-a' },
      parentId: parcelBuilding.id,
    })
    const migratedWall = WallNode.parse({ ...legacyWall, parentId: parcelLevel.id })
    const origins: string[] = []
    let publishCount = 0
    let unsubscribe = () => {}

    try {
      useScene.setState({
        collections: {},
        dirtyNodes: new Set<AnyNodeId>(),
        installedPlugins: original.installedPlugins,
        materials: {},
        nodes: {
          [legacyWall.id]: legacyWall,
          [sharedBuilding.id]: sharedBuilding,
          [sharedLevel.id]: sharedLevel,
          [site.id]: site,
        },
        readOnly: false,
        rootNodeIds: [site.id],
      } as never)
      clearSceneHistory()
      unsubscribe = subscribeSceneCommits((commit) => {
        origins.push(commit.origin)
        if (shouldPublishLandrushBuildSceneCommit(commit.origin)) publishCount += 1
      })
      const result = createLandrushBuildHostOperationPatches({
        currentNodes: useScene.getState().nodes,
        currentRootNodeIds: useScene.getState().rootNodeIds,
        incomingNodes: [parcelBuilding, parcelLevel, migratedWall],
        ownsCurrentNode: ownsParcelA,
      })
      expect(result.kind).toBe('patches')
      if (result.kind !== 'patches') return
      expect(result.patches.every((patch) => applySceneOperationPatch(patch))).toBe(true)
      expect(origins).toEqual(['host', 'host'])
      expect(publishCount).toBe(0)
      expect(useScene.getState().nodes[legacyWall.id]?.parentId).toBe(parcelLevel.id)
      expect(
        (useScene.getState().nodes[sharedLevel.id] as { children: string[] }).children,
      ).toEqual([])
    } finally {
      unsubscribe()
      useScene.setState({
        collections: original.collections,
        dirtyNodes: original.dirtyNodes,
        installedPlugins: original.installedPlugins,
        materials: original.materials,
        nodes: original.nodes,
        readOnly: original.readOnly,
        rootNodeIds: original.rootNodeIds,
      })
      clearSceneHistory()
    }
  })

  test('adopts validated untagged schema1 ids before publishing the complete migration', () => {
    const original = useScene.getState()
    const scope = {
      contextBuildingId: 'building_shared',
      contextLevelId: 'level_shared',
      contextSiteId: 'site_context',
      parcelId: 'parcel-a',
      worldId: 'world-a',
    }
    const site = SiteNode.parse({
      children: [scope.contextBuildingId],
      id: scope.contextSiteId,
      parentId: null,
    })
    const sharedBuilding = BuildingNode.parse({
      children: [scope.contextLevelId],
      id: scope.contextBuildingId,
      parentId: site.id,
    })
    const legacyWalls = Array.from({ length: 10 }, (_, index) =>
      WallNode.parse({
        end: [index + 1, 0],
        id: `wall_legacy_${index}`,
        parentId: scope.contextLevelId,
        start: [index, 0],
      }),
    )
    const legacyStair = StairNode.parse({
      fromLevelId: scope.contextLevelId,
      id: 'stair_legacy',
      parentId: scope.contextLevelId,
      toLevelId: 'level_legacy_upper',
    })
    const sourceNodes: AnyNode[] = [...legacyWalls, legacyStair]
    const sharedLevel = LevelNode.parse({
      children: sourceNodes.map((candidate) => candidate.id),
      id: scope.contextLevelId,
      level: 0,
      parentId: sharedBuilding.id,
    })
    const canonical = canonicalizeLandrushParcelBuildGraph(sourceNodes, scope)
    const incomingNodes = createLandrushBuildSyncSnapshotNodes(canonical.nodes, {
      parcelId: scope.parcelId,
      worldId: scope.worldId,
    })

    const ownsStrictly = (candidate: AnyNode) =>
      isLandrushBuildNodeInParcelMutationScope(useScene.getState().nodes, candidate.id, {
        allowUntaggedSharedLevel: false,
        parcelId: scope.parcelId,
        sharedLevelId: scope.contextLevelId,
        worldId: scope.worldId,
      })

    try {
      useScene.setState({
        collections: {},
        dirtyNodes: new Set<AnyNodeId>(),
        installedPlugins: original.installedPlugins,
        materials: {},
        nodes: Object.fromEntries(
          [site, sharedBuilding, sharedLevel, ...sourceNodes].map((candidate) => [
            candidate.id,
            candidate,
          ]),
        ),
        readOnly: false,
        rootNodeIds: [site.id],
      } as never)
      clearSceneHistory()

      expect(sourceNodes).toHaveLength(11)
      expect(canonical.nodes).toHaveLength(14)
      expect(sourceNodes.every((candidate) => !ownsStrictly(candidate))).toBe(true)
      expect(
        createLandrushBuildHostOperationPatches({
          currentNodes: useScene.getState().nodes,
          currentRootNodeIds: useScene.getState().rootNodeIds,
          incomingNodes,
          ownsCurrentNode: ownsStrictly,
        }),
      ).toEqual({ kind: 'invalid' })

      const validatedLegacyIds = new Set(sourceNodes.map((candidate) => candidate.id))
      const result = createLandrushBuildHostOperationPatches({
        currentNodes: useScene.getState().nodes,
        currentRootNodeIds: useScene.getState().rootNodeIds,
        incomingNodes,
        ownsCurrentNode: (candidate) =>
          ownsStrictly(candidate) ||
          isLandrushBuildNodeInValidatedLegacyScope(useScene.getState().nodes, candidate.id, {
            allowedNodeIds: validatedLegacyIds,
            sharedLevelId: scope.contextLevelId,
          }),
      })
      expect(result.kind).toBe('patches')
      if (result.kind !== 'patches') return
      expect(result.patches.every((operation) => applySceneOperationPatch(operation))).toBe(true)

      const liveNodes = useScene.getState().nodes
      const strictOutgoingNodes = Object.values(liveNodes).filter(ownsStrictly)
      const strictOutgoingIds = new Set(strictOutgoingNodes.map((candidate) => candidate.id))
      expect(sourceNodes.every((candidate) => strictOutgoingIds.has(candidate.id))).toBe(true)

      const outgoingGraph = canonicalizeLandrushParcelBuildGraph(strictOutgoingNodes, scope)
      const outgoingTransport = createLandrushBuildSyncTransportNodes(outgoingGraph.nodes, {
        parcelId: scope.parcelId,
        worldId: scope.worldId,
      })
      const canonicalTransport = createLandrushBuildSyncTransportNodes(canonical.nodes, {
        parcelId: scope.parcelId,
        worldId: scope.worldId,
      })
      expect(outgoingTransport).toHaveLength(14)
      expect(
        isLandrushBuildSyncMigrationPayloadSafe(sourceNodes, outgoingTransport, canonicalTransport),
      ).toBe(true)
    } finally {
      useScene.setState({
        collections: original.collections,
        dirtyNodes: original.dirtyNodes,
        installedPlugins: original.installedPlugins,
        materials: original.materials,
        nodes: original.nodes,
        readOnly: original.readOnly,
        rootNodeIds: original.rootNodeIds,
      })
      clearSceneHistory()
    }
  })

  test('returns no patches for an identical authoritative graph', () => {
    const wall = node({
      id: 'wall',
      metadata: { landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: null,
      type: 'wall',
    })
    const result = createLandrushBuildHostOperationPatches({
      currentNodes: { wall },
      currentRootNodeIds: ['wall' as never],
      incomingNodes: [structuredClone(wall)],
      ownsCurrentNode: ownsParcelA,
    })
    expect(result).toEqual({ kind: 'patches', patches: [] })
  })

  test.each([
    'wall',
    'building',
  ] as const)('rejects a same-id %s collision with another parcel', (type) => {
    const current = node({
      id: 'shared-id',
      metadata: { landrushParcelId: 'parcel-b' },
      object: 'node',
      parentId: null,
      type,
    })
    const incoming = node({
      id: 'shared-id',
      metadata: { landrushParcelId: 'parcel-a' },
      object: 'node',
      parentId: null,
      type,
    })

    expect(
      createLandrushBuildHostOperationPatches({
        currentNodes: { [current.id]: current },
        currentRootNodeIds: [current.id],
        incomingNodes: [incoming],
        ownsCurrentNode: ownsParcelA,
      }),
    ).toEqual({ kind: 'invalid' })
  })

  test('materializes and selects an empty parcel graph before wall and stair placement', () => {
    const originalScene = useScene.getState()
    const originalSelection = useViewer.getState().selection
    const site = SiteNode.parse({
      children: ['context-building'],
      id: 'site_context',
      parentId: null,
    })
    const contextBuilding = BuildingNode.parse({
      children: ['level_context'],
      id: 'building_context',
      parentId: site.id,
    })
    const contextLevel = LevelNode.parse({
      children: [],
      id: 'level_context',
      level: 0,
      parentId: contextBuilding.id,
    })
    const graph = canonicalizeLandrushParcelBuildGraph([], {
      contextBuildingId: contextBuilding.id,
      contextLevelId: contextLevel.id,
      contextSiteId: site.id,
      parcelId: 'parcel-a',
      worldId: 'world-a',
    })
    const incomingNodes = createLandrushBuildSyncSnapshotNodes(graph.nodes, {
      parcelId: 'parcel-a',
      worldId: 'world-a',
    })

    try {
      useScene.setState({
        collections: {},
        dirtyNodes: new Set<AnyNodeId>(),
        installedPlugins: originalScene.installedPlugins,
        materials: {},
        nodes: {
          [contextBuilding.id]: contextBuilding,
          [contextLevel.id]: contextLevel,
          [site.id]: site,
        },
        readOnly: false,
        rootNodeIds: [site.id],
      } as never)
      clearSceneHistory()

      expect(
        activateLandrushBuildHostEditorTarget({
          applyPatch: applySceneOperationPatch,
          currentNodes: useScene.getState().nodes,
          currentRootNodeIds: useScene.getState().rootNodeIds,
          incomingNodes,
          ownsCurrentNode: ownsParcelA,
          selectTarget: ({ buildingId, levelId }) => {
            useViewer.getState().setSelection({
              buildingId,
              levelId,
              selectedIds: [],
              zoneId: null,
            })
          },
          target: {
            buildingId: graph.buildingId as AnyNodeId,
            levelId: graph.groundLevelId as AnyNodeId,
          },
        }),
      ).toBe(true)

      const selection = useViewer.getState().selection
      const wall = WallNode.parse({
        end: [4, 0],
        id: 'wall_local',
        parentId: selection.levelId,
        start: [0, 0],
      })
      const stair = StairNode.parse({
        fromLevelId: selection.levelId,
        id: 'stair_local',
        parentId: selection.levelId,
      })
      useScene.getState().createNodes([
        { node: wall, parentId: selection.levelId ?? undefined },
        { node: stair, parentId: selection.levelId ?? undefined },
      ])
      const destination = resolveStairDestinationLevel({
        createMissing: true,
        fromLevelId: selection.levelId,
        nodes: useScene.getState().nodes,
      })

      expect(selection.buildingId).toBe(graph.buildingId)
      expect(selection.levelId).toBe(graph.groundLevelId)
      expect(useScene.getState().nodes[wall.id]?.parentId).toBe(graph.groundLevelId)
      expect(useScene.getState().nodes[stair.id]?.parentId).toBe(graph.groundLevelId)
      expect(destination?.buildingId).toBe(graph.buildingId)
      expect(destination?.createdLevel?.parentId).toBe(graph.buildingId)
      expect(destination?.toLevel.id).not.toBe(contextLevel.id)
    } finally {
      useViewer.getState().setSelection(originalSelection)
      useScene.setState({
        collections: originalScene.collections,
        dirtyNodes: originalScene.dirtyNodes,
        installedPlugins: originalScene.installedPlugins,
        materials: originalScene.materials,
        nodes: originalScene.nodes,
        readOnly: originalScene.readOnly,
        rootNodeIds: originalScene.rootNodeIds,
      })
      clearSceneHistory()
    }
  })
})
