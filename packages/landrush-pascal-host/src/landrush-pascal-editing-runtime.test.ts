import { describe, expect, test } from 'bun:test'
import {
  BuildingNode,
  clearSceneHistory,
  LevelNode,
  type SceneCommit,
  sceneRegistry,
  subscribeSceneCommits,
  useScene,
  WallNode,
} from '@pascal-app/core'
import { rotateCurrentGroupSelection } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three'
import {
  cancelLandrushPascalEditingRuntime,
  deleteLandrushPascalSelectedOpenings,
  exitLandrushPascalEditingToSelect,
  isLandrushPascalClockwiseRotationShortcut,
  isLandrushPascalRotationOwnedByTool,
  isLandrushPascalSelectShortcut,
  resolveLandrushPascalNodeSelection,
  resolveLandrushPascalNodeSelectionTarget,
  resolveLandrushPascalSelectionManager,
  resolveLandrushPascalSelectionNode,
  resolveRegisteredSelectionAffordanceLoader,
  resolveSoleSelectedNodeType,
  runLandrushPascalClockwiseSelectionRotation,
  runLandrushPascalHistoryShortcut,
  runLandrushPascalToolActivationInCurrentLevel,
} from './landrush-pascal-editing-runtime'

type RafFn = (callback: (time: number) => void) => number
;(globalThis as unknown as { requestAnimationFrame?: RafFn }).requestAnimationFrame ??= (
  callback,
) => {
  callback(0)
  return 0
}
;(globalThis as unknown as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame ??=
  () => {}

describe('Landrush Pascal editing runtime', () => {
  test('loads only the sole selected kind selection affordance', () => {
    const selection = async () => ({ default: () => null })
    const getDefinition = (kind: string) =>
      kind === 'duct-segment' ? { affordanceTools: { selection } } : undefined
    const nodes = {
      duct: { type: 'duct-segment' },
      wall: { type: 'wall' },
    }

    expect(
      resolveRegisteredSelectionAffordanceLoader({
        getDefinition,
        selectedKind: resolveSoleSelectedNodeType(['duct'], nodes),
      }),
    ).toBe(selection)
    expect(resolveSoleSelectedNodeType([], nodes)).toBeNull()
    expect(resolveSoleSelectedNodeType(['duct', 'wall'], nodes)).toBeNull()
    expect(resolveSoleSelectedNodeType(['missing'], nodes)).toBeNull()
    expect(
      resolveRegisteredSelectionAffordanceLoader({
        getDefinition,
        selectedKind: resolveSoleSelectedNodeType(['wall'], nodes),
      }),
    ).toBeNull()
  })

  test('cancels tool state before releasing the shared interaction and input locks', () => {
    const calls: string[] = []

    cancelLandrushPascalEditingRuntime({
      emitToolCancel: () => calls.push('tool:cancel'),
      resetMovingNode: () => calls.push('moving-node'),
      endInteraction: () => calls.push('interaction'),
      resetInputDragging: () => calls.push('input-dragging'),
    })

    expect(calls).toEqual(['tool:cancel', 'moving-node', 'interaction', 'input-dragging'])
  })

  test('keeps the Viewer hierarchy manager out of the Landrush-owned selection route', () => {
    expect(resolveLandrushPascalSelectionManager(true)).toBe('custom')
    expect(resolveLandrushPascalSelectionManager(false)).toBe('custom')
  })

  test('routes common and registry nodes to the same editor phases as Pascal', () => {
    const structure = { phase: 'structure', structureLayer: 'elements' } as const
    expect(
      resolveLandrushPascalNodeSelectionTarget({
        itemCategory: null,
        nodeType: 'wall',
        registryCategory: null,
        registrySelectable: false,
      }),
    ).toEqual(structure)
    expect(
      resolveLandrushPascalNodeSelectionTarget({
        itemCategory: 'door',
        nodeType: 'item',
        registryCategory: null,
        registrySelectable: false,
      }),
    ).toEqual(structure)
    expect(
      resolveLandrushPascalNodeSelectionTarget({
        itemCategory: 'furniture',
        nodeType: 'item',
        registryCategory: null,
        registrySelectable: false,
      }),
    ).toEqual({ phase: 'furnish' })
    expect(
      resolveLandrushPascalNodeSelectionTarget({
        itemCategory: null,
        nodeType: 'plugin-chair',
        registryCategory: 'furnish',
        registrySelectable: true,
      }),
    ).toEqual({ phase: 'furnish' })
    expect(
      resolveLandrushPascalNodeSelectionTarget({
        itemCategory: null,
        nodeType: 'island-prop',
        registryCategory: null,
        registrySelectable: false,
      }),
    ).toBeNull()
  })

  test('selects nodes only after placement releases the current-level pointer', () => {
    const base = {
      activeTool: null,
      currentLevelId: 'level-1',
      editorMode: 'select',
      interactionKind: 'idle',
      nodeId: 'door-1',
      nodeLevelId: 'level-1',
      nodeType: 'door',
      selectable: true,
      selectedIds: [] as string[],
      toggle: false,
    }

    expect(resolveLandrushPascalNodeSelection(base)).toEqual(['door-1'])
    expect(
      resolveLandrushPascalNodeSelection({
        ...base,
        editorMode: 'build',
      }),
    ).toEqual(['door-1'])
    expect(
      resolveLandrushPascalNodeSelection({
        ...base,
        activeTool: 'door',
        editorMode: 'build',
      }),
    ).toBeNull()
    expect(
      resolveLandrushPascalNodeSelection({
        ...base,
        interactionKind: 'placing',
      }),
    ).toBeNull()
    expect(
      resolveLandrushPascalNodeSelection({
        ...base,
        nodeType: 'wall',
        nodeId: 'wall-1',
      }),
    ).toEqual(['wall-1'])
    expect(
      resolveLandrushPascalNodeSelection({
        ...base,
        nodeLevelId: 'level-2',
      }),
    ).toBeNull()
    expect(
      resolveLandrushPascalNodeSelection({
        ...base,
        selectedIds: ['door-1'],
        toggle: true,
      }),
    ).toEqual([])
  })

  test('promotes segment and registry-proxy clicks before updating selection', () => {
    const stair = { id: 'stair', type: 'stair' }
    const wall = { id: 'wall', type: 'wall' }
    const nodes = {
      segment: { id: 'segment', type: 'stair-segment', parentId: 'stair' },
      stair,
      proxy: {
        id: 'proxy',
        type: 'plugin-handle',
        metadata: { nodeSelectionProxyId: 'wall' },
      },
      wall,
    }

    expect(
      String(resolveLandrushPascalSelectionNode(nodes.segment as never, nodes as never).id),
    ).toBe(stair.id)
    expect(
      String(resolveLandrushPascalSelectionNode(nodes.proxy as never, nodes as never).id),
    ).toBe(wall.id)
  })

  test('deletes only committed opening selections as one tracked node batch', () => {
    const calls: string[] = []
    const deleted: string[][] = []
    const nodeTypes: Record<string, string> = { door: 'door', window: 'window', wall: 'wall' }

    expect(
      deleteLandrushPascalSelectedOpenings({
        selectedIds: ['door', 'window'],
        getNodeType: (id) => nodeTypes[id] ?? null,
        deleteNodes: (ids) => deleted.push(ids),
        clearSelection: () => calls.push('clear'),
      }),
    ).toBe(true)
    expect(deleted).toEqual([['door', 'window']])
    expect(calls).toEqual(['clear'])
    expect(
      deleteLandrushPascalSelectedOpenings({
        selectedIds: ['wall'],
        getNodeType: (id) => nodeTypes[id] ?? null,
        deleteNodes: () => calls.push('delete-wall'),
      }),
    ).toBe(false)
    expect(calls).toEqual(['clear'])
  })

  test('exits placement with the standalone select-mode cleanup sequence', () => {
    const calls: string[] = []
    exitLandrushPascalEditingToSelect({
      cancelEditing: () => calls.push('cancel'),
      setSelectMode: () => calls.push('select-mode'),
      setClickSelection: () => calls.push('click-selection'),
      clearElementSelection: () => calls.push('element-selection'),
      clearReferenceSelection: () => calls.push('reference-selection'),
    })
    expect(calls).toEqual([
      'cancel',
      'select-mode',
      'click-selection',
      'element-selection',
      'reference-selection',
    ])
  })

  test('matches Pascal R and V modifier guards without stealing tool-owned rotation', () => {
    expect(isLandrushPascalSelectShortcut({ ctrlKey: false, key: 'v', metaKey: false })).toBe(true)
    expect(isLandrushPascalSelectShortcut({ ctrlKey: false, key: 'V', metaKey: false })).toBe(false)
    expect(isLandrushPascalSelectShortcut({ ctrlKey: true, key: 'v', metaKey: false })).toBe(false)

    expect(
      isLandrushPascalClockwiseRotationShortcut({ ctrlKey: false, key: 'r', metaKey: false }),
    ).toBe(true)
    expect(
      isLandrushPascalClockwiseRotationShortcut({ ctrlKey: false, key: 'R', metaKey: false }),
    ).toBe(true)
    expect(
      isLandrushPascalClockwiseRotationShortcut({ ctrlKey: false, key: 'r', metaKey: true }),
    ).toBe(false)
    expect(
      isLandrushPascalRotationOwnedByTool({
        activeTool: 'door',
        editorMode: 'build',
        movingNode: null,
      }),
    ).toBe(true)
    expect(
      isLandrushPascalRotationOwnedByTool({
        activeTool: null,
        editorMode: 'select',
        movingNode: { type: 'window' } as never,
      }),
    ).toBe(true)
  })

  test('rotates one selected node by one canonical stepped scene mutation', () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
    let sfxCount = 0
    const item = {
      id: 'item-1',
      rotation: [0, Math.PI / 18, 0],
      type: 'item',
    }
    const lockedGuide = {
      id: 'guide-locked',
      rotation: [0, 0, 0],
      type: 'guide',
    }

    expect(
      runLandrushPascalClockwiseSelectionRotation({
        activeTool: null,
        editorMode: 'select',
        getDefinition: () => undefined,
        markDirty: () => undefined,
        movingNode: null,
        nodes: { [item.id]: item as never, [lockedGuide.id]: lockedGuide as never },
        playSfx: () => {
          sfxCount += 1
        },
        referenceLocked: true,
        rotateGroupSelection: () => false,
        selectedIds: [item.id],
        selectedReferenceId: lockedGuide.id,
        updateNode: (id, patch) => updates.push({ id, patch: patch as Record<string, unknown> }),
      }),
    ).toBe(true)

    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe(item.id)
    expect((updates[0]!.patch.rotation as number[])[1]).toBeCloseTo(Math.PI / 4)
    expect(sfxCount).toBe(1)
  })

  test('uses Pascal opening flips and registry actions without duplicate scene writes', () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
    const dirtied: string[] = []
    let registryRuns = 0
    let sfxCount = 0
    const door = {
      id: 'door-1',
      parentId: 'wall-1',
      rotation: [0, 0, 0],
      side: 'front',
      type: 'door',
    }
    const registryNode = { id: 'plugin-1', rotation: [0, 0, 0], type: 'plugin-node' }
    const common = {
      activeTool: null,
      editorMode: 'select',
      markDirty: (id: string) => dirtied.push(id),
      movingNode: null,
      playSfx: () => {
        sfxCount += 1
      },
      referenceLocked: false,
      rotateGroupSelection: () => false,
      selectedReferenceId: null,
      updateNode: (id: string, patch: unknown) =>
        updates.push({ id, patch: patch as Record<string, unknown> }),
    }

    expect(
      runLandrushPascalClockwiseSelectionRotation({
        ...common,
        getDefinition: () => undefined,
        nodes: { [door.id]: door as never },
        selectedIds: [door.id],
      } as never),
    ).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0]?.patch).toMatchObject({ side: 'back' })
    expect((updates[0]!.patch.rotation as number[])[1]).toBeCloseTo(Math.PI)
    expect(dirtied).toEqual(['wall-1'])

    expect(
      runLandrushPascalClockwiseSelectionRotation({
        ...common,
        getDefinition: () =>
          ({
            keyboardActions: {
              r: {
                appliesTo: () => true,
                run: () => {
                  registryRuns += 1
                },
              },
            },
          }) as never,
        nodes: { [registryNode.id]: registryNode as never },
        selectedIds: [registryNode.id],
      } as never),
    ).toBe(true)
    expect(registryRuns).toBe(1)
    expect(updates).toHaveLength(1)
    expect(sfxCount).toBe(2)
  })

  test('leaves draft-owned R input unconsumed before consulting the group command', () => {
    let updateCount = 0
    let groupRotateCount = 0
    const item = { id: 'item-1', rotation: [0, 0, 0], type: 'item' }
    const base = {
      getDefinition: () => undefined,
      markDirty: () => undefined,
      nodes: { [item.id]: item as never },
      playSfx: () => undefined,
      referenceLocked: false,
      rotateGroupSelection: () => {
        groupRotateCount += 1
        return true
      },
      selectedReferenceId: null,
      updateNode: () => {
        updateCount += 1
      },
    }

    expect(
      runLandrushPascalClockwiseSelectionRotation({
        ...base,
        activeTool: 'roof',
        editorMode: 'build',
        movingNode: null,
        selectedIds: [item.id],
      }),
    ).toBe(false)
    expect(updateCount).toBe(0)
    expect(groupRotateCount).toBe(0)
  })

  test('delegates multi-select R to the canonical Pascal batch with one history and network commit', () => {
    const building = BuildingNode.parse({
      id: 'building_landrush_group_rotate',
      children: ['level_landrush_group_rotate'],
    })
    const level = LevelNode.parse({
      id: 'level_landrush_group_rotate',
      parentId: building.id,
      children: [
        'wall_landrush_group_rotate_a',
        'wall_landrush_group_rotate_b',
        'wall_landrush_group_rotate_c',
      ],
    })
    const wallA = WallNode.parse({
      id: 'wall_landrush_group_rotate_a',
      parentId: level.id,
      start: [0, 0],
      end: [2, 0],
    })
    const wallB = WallNode.parse({
      id: 'wall_landrush_group_rotate_b',
      parentId: level.id,
      start: [2, 0],
      end: [2, 2],
    })
    const wallC = WallNode.parse({
      id: 'wall_landrush_group_rotate_c',
      parentId: level.id,
      start: [2, 2],
      end: [0, 2],
    })
    useScene.setState({
      nodes: {
        [building.id]: building,
        [level.id]: level,
        [wallA.id]: wallA,
        [wallB.id]: wallB,
        [wallC.id]: wallC,
      },
      rootNodeIds: [building.id],
      dirtyNodes: new Set(),
      collections: {},
      materials: {},
      readOnly: false,
    } as never)
    clearSceneHistory()
    useViewer.getState().setSelection({
      buildingId: building.id,
      levelId: level.id,
      selectedIds: [wallA.id, wallB.id],
    })

    const material = new MeshBasicMaterial()
    const registrations = [
      [wallA.id, new Mesh(new BoxGeometry(2, 2, 0.1), material)],
      [wallB.id, new Mesh(new BoxGeometry(0.1, 2, 2), material)],
      [wallC.id, new Mesh(new BoxGeometry(2, 2, 0.1), material)],
    ] as const
    registrations[0][1].position.set(1, 1, 0)
    registrations[1][1].position.set(2, 1, 1)
    registrations[2][1].position.set(1, 1, 2)
    for (const [id, object] of registrations) sceneRegistry.nodes.set(id, object)

    const commits: SceneCommit[] = []
    const unsubscribe = subscribeSceneCommits((commit) => commits.push(commit))
    let directUpdateCount = 0
    try {
      expect(
        runLandrushPascalClockwiseSelectionRotation({
          activeTool: null,
          editorMode: 'select',
          getDefinition: () => undefined,
          markDirty: () => undefined,
          movingNode: null,
          nodes: useScene.getState().nodes,
          playSfx: () => undefined,
          referenceLocked: false,
          rotateGroupSelection: rotateCurrentGroupSelection,
          selectedIds: [wallA.id, wallB.id],
          selectedReferenceId: null,
          updateNode: () => {
            directUpdateCount += 1
          },
        }),
      ).toBe(true)

      expect(directUpdateCount).toBe(0)
      expect(commits).toHaveLength(1)
      expect(commits[0]?.origin).toBe('local')
      expect(commits[0]?.changedNodeIds).toEqual(new Set([wallA.id, wallB.id, wallC.id]))
      expect(useScene.temporal.getState().pastStates).toHaveLength(1)

      const rotatedA = useScene.getState().nodes[wallA.id] as typeof wallA
      const rotatedB = useScene.getState().nodes[wallB.id] as typeof wallB
      const rotatedC = useScene.getState().nodes[wallC.id] as typeof wallC
      expect(rotatedA.end[0]).toBeCloseTo(rotatedB.start[0])
      expect(rotatedA.end[1]).toBeCloseTo(rotatedB.start[1])
      expect(rotatedB.end[0]).toBeCloseTo(rotatedC.start[0])
      expect(rotatedB.end[1]).toBeCloseTo(rotatedC.start[1])
      expect(rotatedC.start).not.toEqual(wallC.start)

      useScene.temporal.getState().undo()
      expect((useScene.getState().nodes[wallA.id] as typeof wallA).start).toEqual(wallA.start)
      expect((useScene.getState().nodes[wallB.id] as typeof wallB).end).toEqual(wallB.end)
      expect((useScene.getState().nodes[wallC.id] as typeof wallC).start).toEqual(wallC.start)
    } finally {
      unsubscribe()
      for (const [id, object] of registrations) {
        sceneRegistry.nodes.delete(id)
        object.geometry.dispose()
      }
      material.dispose()
      clearSceneHistory()
    }
  })

  test('keeps a valid parcel floor active while Pascal initializes a structure tool', () => {
    type Context = {
      buildingId: `building_${string}` | null
      levelId: `level_${string}` | null
    }
    const parcelContext: Context = { buildingId: 'building_parcel', levelId: 'level_parcel' }
    let currentContext = parcelContext
    const restored: Context[] = []

    runLandrushPascalToolActivationInCurrentLevel(
      () => {
        currentContext = { buildingId: 'building_island', levelId: 'level_island' }
      },
      {
        getContext: () => currentContext,
        isContextAvailable: (context) => context === parcelContext,
        restoreContext: (context) => {
          restored.push(context)
          currentContext = context
        },
      },
    )

    expect(currentContext).toBe(parcelContext)
    expect(restored).toEqual([parcelContext])

    currentContext = parcelContext
    runLandrushPascalToolActivationInCurrentLevel(
      () => {
        currentContext = { buildingId: 'building_island', levelId: 'level_island' }
      },
      {
        getContext: () => currentContext,
        isContextAvailable: () => false,
        restoreContext: (context) => restored.push(context),
      },
    )
    expect(currentContext).toEqual({ buildingId: 'building_island', levelId: 'level_island' })
    expect(restored).toEqual([parcelContext])
  })

  test('runs public history only after cancellation leaves an idle tracked scene', () => {
    const calls: string[] = []
    expect(
      runLandrushPascalHistoryShortcut('undo', {
        interactionIsIdle: () => true,
        historyIsTracking: () => true,
        cancelEditing: () => calls.push('cancel'),
        undo: () => calls.push('undo'),
      }),
    ).toBe(true)
    expect(calls).toEqual(['cancel', 'undo'])

    expect(
      runLandrushPascalHistoryShortcut('redo', {
        interactionIsIdle: () => false,
        historyIsTracking: () => true,
        cancelEditing: () => calls.push('cancel-active'),
        redo: () => calls.push('redo'),
      }),
    ).toBe(false)
    expect(calls).toEqual(['cancel', 'undo', 'cancel-active'])
  })
})
