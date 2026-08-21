'use client'

import {
  type AnyNode,
  type AnyNodeDefinition,
  type AnyNodeId,
  emitter,
  type GridEvent,
  isRegistrySelectable,
  type NodeEvent,
  nodeRegistry,
  resolveLevelId,
  resolveSelectionProxyId,
  sceneRegistry,
  useRegistryVersion,
  useScene,
} from '@pascal-app/core'
import {
  getMovingNode,
  rotateCurrentGroupSelection,
  runRedo,
  runUndo,
  triggerSFX,
  useEditor,
  useInteractionScope,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type ComponentType, lazy, Suspense, useEffect, useMemo, useRef } from 'react'

type AffordanceLoader = NonNullable<AnyNodeDefinition['affordanceTools']>[string]

type SelectionNode = {
  type: string
}

type SelectionAffordanceDefinition = Pick<AnyNodeDefinition, 'affordanceTools'>

type LandrushPascalLevelContext = Pick<
  ReturnType<typeof useViewer.getState>['selection'],
  'buildingId' | 'levelId'
>

const lazyAffordanceCache = new WeakMap<AffordanceLoader, ComponentType>()

const STRUCTURE_ELEMENT_TYPES = new Set([
  'wall',
  'fence',
  'column',
  'elevator',
  'slab',
  'ceiling',
  'roof',
  'roof-segment',
  'stair',
  'stair-segment',
  'spawn',
  'window',
  'door',
])

const KEYBOARD_ROTATION_STEP = Math.PI / 4

export type LandrushPascalNodeSelectionTarget = {
  phase: 'structure' | 'furnish'
  structureLayer?: 'elements' | 'zones'
}

export function resolveRegisteredSelectionAffordanceLoader({
  getDefinition,
  selectedKind,
}: {
  getDefinition: (kind: string) => SelectionAffordanceDefinition | undefined
  selectedKind: string | null
}): AffordanceLoader | null {
  if (!selectedKind) return null
  return getDefinition(selectedKind)?.affordanceTools?.selection ?? null
}

export function resolveSoleSelectedNodeType(
  selectedIds: readonly string[],
  nodes: Readonly<Record<string, SelectionNode | undefined>>,
): string | null {
  if (selectedIds.length !== 1) return null
  return nodes[selectedIds[0] as string]?.type ?? null
}

export function resolveLandrushPascalSelectionManager(_editingActive: boolean): 'custom' {
  return 'custom'
}

export function resolveLandrushPascalNodeSelectionTarget({
  itemCategory,
  nodeType,
  registryCategory,
  registrySelectable,
}: {
  itemCategory: string | null
  nodeType: string
  registryCategory: string | null
  registrySelectable: boolean
}): LandrushPascalNodeSelectionTarget | null {
  if (nodeType === 'zone') return { phase: 'structure', structureLayer: 'zones' }
  if (nodeType === 'item') {
    return itemCategory === 'door' || itemCategory === 'window'
      ? { phase: 'structure', structureLayer: 'elements' }
      : { phase: 'furnish' }
  }
  if (STRUCTURE_ELEMENT_TYPES.has(nodeType)) {
    return { phase: 'structure', structureLayer: 'elements' }
  }
  if (!registrySelectable) return null
  return registryCategory === 'furnish'
    ? { phase: 'furnish' }
    : { phase: 'structure', structureLayer: 'elements' }
}

export function resolveLandrushPascalNodeSelection({
  activeTool,
  currentLevelId,
  editorMode,
  interactionKind,
  nodeId,
  nodeLevelId,
  nodeType,
  selectable,
  selectedIds,
  toggle,
  viaHandle = false,
}: {
  activeTool: string | null
  currentLevelId: string | null
  editorMode: string
  interactionKind: string
  nodeId: string
  nodeLevelId: string | null
  nodeType: string
  selectable: boolean
  selectedIds: readonly string[]
  toggle: boolean
  viaHandle?: boolean
}): string[] | null {
  if (!selectable || interactionKind !== 'idle') return null
  if (editorMode !== 'select' && !(editorMode === 'build' && activeTool === null)) return null
  if (nodeType === 'ceiling' && !viaHandle) return null
  if (nodeType !== 'elevator' && currentLevelId && nodeLevelId !== currentLevelId) return null
  if (!toggle) return [nodeId]
  return selectedIds.includes(nodeId)
    ? selectedIds.filter((selectedId) => selectedId !== nodeId)
    : [...selectedIds, nodeId]
}

export function cancelLandrushPascalEditingRuntime({
  emitToolCancel = () => emitter.emit('tool:cancel'),
  endInteraction = () => useInteractionScope.getState().end(),
  resetInputDragging = () => useViewer.getState().setInputDragging(false),
  resetMovingNode = () => useEditor.getState().setMovingNode(null),
}: {
  emitToolCancel?: () => void
  endInteraction?: () => void
  resetInputDragging?: () => void
  resetMovingNode?: () => void
} = {}) {
  emitToolCancel()
  resetMovingNode()
  endInteraction()
  resetInputDragging()
}

export function exitLandrushPascalEditingToSelect({
  cancelEditing = cancelLandrushPascalEditingRuntime,
  clearElementSelection = () =>
    useViewer.getState().setSelection({ selectedIds: [], zoneId: null }),
  clearReferenceSelection = () => useEditor.getState().setSelectedReferenceId(null),
  setClickSelection = () => useEditor.getState().setFloorplanSelectionTool('click'),
  setSelectMode = () => useEditor.getState().setMode('select'),
}: {
  cancelEditing?: () => void
  clearElementSelection?: () => void
  clearReferenceSelection?: () => void
  setClickSelection?: () => void
  setSelectMode?: () => void
} = {}) {
  cancelEditing()
  setSelectMode()
  setClickSelection()
  clearElementSelection()
  clearReferenceSelection()
}

export function runLandrushPascalToolActivationInCurrentLevel(
  activate: () => void,
  {
    getContext = () => {
      const { buildingId, levelId } = useViewer.getState().selection
      return { buildingId, levelId }
    },
    isContextAvailable = ({ buildingId, levelId }) => {
      if (!(buildingId && levelId)) return false
      const nodes = useScene.getState().nodes
      return (
        nodes[buildingId]?.type === 'building' &&
        nodes[levelId]?.type === 'level' &&
        nodes[levelId]?.parentId === buildingId
      )
    },
    restoreContext = (context) => useViewer.getState().setSelection(context),
  }: {
    getContext?: () => LandrushPascalLevelContext
    isContextAvailable?: (context: LandrushPascalLevelContext) => boolean
    restoreContext?: (context: LandrushPascalLevelContext) => void
  } = {},
): void {
  const context = getContext()
  activate()

  const nextContext = getContext()
  if (
    (nextContext.buildingId === context.buildingId && nextContext.levelId === context.levelId) ||
    !isContextAvailable(context)
  ) {
    return
  }
  restoreContext(context)
}

export function deleteLandrushPascalSelectedOpenings({
  clearSelection = () => useViewer.getState().setSelection({ selectedIds: [] }),
  deleteNodes = (ids) => useScene.getState().deleteNodes(ids as AnyNodeId[]),
  getNodeType = (id) => useScene.getState().nodes[id as AnyNodeId]?.type ?? null,
  selectedIds = useViewer.getState().selection.selectedIds,
}: {
  clearSelection?: () => void
  deleteNodes?: (ids: string[]) => void
  getNodeType?: (id: string) => string | null
  selectedIds?: string[]
} = {}): boolean {
  if (selectedIds.length === 0) return false
  if (selectedIds.some((id) => !isOpeningNodeType(getNodeType(id)))) return false
  deleteNodes(selectedIds)
  clearSelection()
  return true
}

export function runLandrushPascalHistoryShortcut(
  direction: 'undo' | 'redo',
  {
    cancelEditing = cancelLandrushPascalEditingRuntime,
    historyIsTracking = () => useScene.temporal.getState().isTracking,
    interactionIsIdle = () =>
      useInteractionScope.getState().scope.kind === 'idle' && !useViewer.getState().inputDragging,
    redo = runRedo,
    undo = runUndo,
  }: {
    cancelEditing?: () => void
    historyIsTracking?: () => boolean
    interactionIsIdle?: () => boolean
    redo?: () => unknown
    undo?: () => unknown
  } = {},
): boolean {
  const interactionWasIdle = interactionIsIdle()
  cancelEditing()
  if (!(interactionWasIdle && interactionIsIdle() && historyIsTracking())) return false
  if (direction === 'redo') redo()
  else undo()
  return true
}

type LandrushPascalShortcutEvent = Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey'>

export function isLandrushPascalSelectShortcut(event: LandrushPascalShortcutEvent) {
  return event.key === 'v' && !event.metaKey && !event.ctrlKey
}

export function isLandrushPascalClockwiseRotationShortcut(event: LandrushPascalShortcutEvent) {
  return (event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey
}

export function isLandrushPascalRotationOwnedByTool({
  activeTool,
  editorMode,
  movingNode,
}: {
  activeTool: string | null
  editorMode: string
  movingNode: AnyNode | null
}) {
  if (movingNode?.type === 'door' || movingNode?.type === 'window') return true
  return (
    editorMode === 'build' &&
    (activeTool === 'door' || activeTool === 'window' || activeTool === 'roof')
  )
}

export type LandrushPascalClockwiseSelectionRotationInput = {
  activeTool: string | null
  editorMode: string
  getDefinition: (kind: string) => AnyNodeDefinition | undefined
  markDirty: (id: AnyNodeId) => void
  movingNode: AnyNode | null
  nodes: Readonly<Record<string, AnyNode | undefined>>
  playSfx: () => void
  referenceLocked: boolean
  rotateGroupSelection: (direction: 1 | -1) => boolean
  selectedIds: readonly string[]
  selectedReferenceId: string | null
  updateNode: (id: AnyNodeId, patch: Partial<AnyNode>) => void
}

export function runLandrushPascalClockwiseSelectionRotation({
  activeTool,
  editorMode,
  getDefinition,
  markDirty,
  movingNode,
  nodes,
  playSfx,
  referenceLocked,
  rotateGroupSelection,
  selectedIds,
  selectedReferenceId,
  updateNode,
}: LandrushPascalClockwiseSelectionRotationInput): boolean {
  if (isLandrushPascalRotationOwnedByTool({ activeTool, editorMode, movingNode })) return false

  if (rotateGroupSelection(1)) return true
  let node: AnyNode | undefined
  if (selectedReferenceId) {
    const reference = nodes[selectedReferenceId]
    if (
      reference &&
      (reference.type === 'guide' || reference.type === 'scan') &&
      !referenceLocked
    ) {
      node = reference
    }
  }
  if (!node && selectedIds.length === 1) {
    const selected = nodes[selectedIds[0]!]
    if (selected) {
      node = resolveLandrushPascalDirectRotationNode(selected, nodes, getDefinition)
    }
  }
  if (!node) return false

  if (node.type === 'door' || node.type === 'window') {
    updateNode(node.id, {
      side: node.side === 'front' ? 'back' : 'front',
      rotation: [node.rotation[0], node.rotation[1] + Math.PI, node.rotation[2]],
    } as Partial<AnyNode>)
    if (node.parentId) markDirty(node.parentId as AnyNodeId)
    playSfx()
    return true
  }

  const registryAction = getDefinition(node.type)?.keyboardActions?.r
  if (registryAction?.appliesTo(node)) {
    registryAction.run(node)
    playSfx()
    return true
  }

  const rotation = 'rotation' in node ? node.rotation : undefined
  if (typeof rotation === 'number') {
    updateNode(node.id, {
      rotation: stepLandrushPascalRotationClockwise(rotation),
    } as Partial<AnyNode>)
  } else if (Array.isArray(rotation)) {
    updateNode(node.id, {
      rotation: [rotation[0], stepLandrushPascalRotationClockwise(rotation[1]), rotation[2]],
    } as Partial<AnyNode>)
  } else {
    return false
  }

  playSfx()
  return true
}

function stepLandrushPascalRotationClockwise(rotation: number) {
  return (Math.round(rotation / KEYBOARD_ROTATION_STEP) + 1) * KEYBOARD_ROTATION_STEP
}

function resolveLandrushPascalDirectRotationNode(
  node: AnyNode,
  nodes: Readonly<Record<string, AnyNode | undefined>>,
  getDefinition: (kind: string) => AnyNodeDefinition | undefined,
) {
  const target = nodes[resolveSelectionProxyId(node, nodes)] ?? node
  const parentFrame = getDefinition(target.type)?.capabilities?.movable?.parentFrame
  const parent = parentFrame?.resolveParent(target, nodes as Readonly<Record<string, AnyNode>>)
  return parent && landrushPascalNodeHasDirectRotation(parent, getDefinition) ? parent : target
}

function landrushPascalNodeHasDirectRotation(
  node: AnyNode,
  getDefinition: (kind: string) => AnyNodeDefinition | undefined,
) {
  const definition = getDefinition(node.type)
  if (definition?.capabilities?.rotatable !== undefined) return true
  const descriptorSource = definition?.handles
  const descriptors =
    typeof descriptorSource === 'function'
      ? descriptorSource(node as never)
      : (descriptorSource ?? [])
  return descriptors.some(
    (descriptor) => descriptor.kind === 'arc-resize' && descriptor.shape === 'rotate',
  )
}

function runActiveLandrushPascalClockwiseSelectionRotation() {
  const editor = useEditor.getState()
  const scene = useScene.getState()
  return runLandrushPascalClockwiseSelectionRotation({
    activeTool: editor.tool,
    editorMode: editor.mode,
    getDefinition: (kind) => nodeRegistry.get(kind),
    markDirty: (id) => scene.dirtyNodes.add(id),
    movingNode: getMovingNode(),
    nodes: scene.nodes,
    playSfx: () => triggerSFX('sfx:item-rotate'),
    referenceLocked:
      editor.selectedReferenceId !== null &&
      editor.guideUi[editor.selectedReferenceId]?.locked === true,
    rotateGroupSelection: rotateCurrentGroupSelection,
    selectedIds: useViewer.getState().selection.selectedIds,
    selectedReferenceId: editor.selectedReferenceId,
    updateNode: (id, patch) => scene.updateNode(id, patch),
  })
}

export function LandrushPascalEditingRuntime() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        exitLandrushPascalEditingToSelect()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (!runLandrushPascalHistoryShortcut(event.shiftKey ? 'redo' : 'undo')) {
          exitLandrushPascalEditingToSelect()
        }
        return
      }
      if (isLandrushPascalSelectShortcut(event)) {
        event.preventDefault()
        const editor = useEditor.getState()
        editor.setMode('select')
        editor.setFloorplanSelectionTool('click')
        return
      }
      if (
        isLandrushPascalClockwiseRotationShortcut(event) &&
        runActiveLandrushPascalClockwiseSelectionRotation()
      ) {
        event.preventDefault()
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      const selectedIds = useViewer.getState().selection.selectedIds
      const hasOpeningSelection =
        selectedIds.length > 0 &&
        selectedIds.every((id) => {
          const type = useScene.getState().nodes[id as AnyNodeId]?.type ?? null
          return isOpeningNodeType(type)
        })
      if (!hasOpeningSelection) return
      event.preventDefault()

      const interactionReady =
        useInteractionScope.getState().scope.kind === 'idle' &&
        !useViewer.getState().inputDragging &&
        useScene.temporal.getState().isTracking
      if (interactionReady) {
        deleteLandrushPascalSelectedOpenings({ selectedIds })
        return
      }

      exitLandrushPascalEditingToSelect()
      requestAnimationFrame(() => {
        if (
          useInteractionScope.getState().scope.kind === 'idle' &&
          useScene.temporal.getState().isTracking
        ) {
          deleteLandrushPascalSelectedOpenings({ selectedIds })
        }
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <LandrushNodeSelectionRouter />
      <LandrushSelectionOutlinerSync />
      <RegisteredSelectionAffordance />
    </>
  )
}

function LandrushNodeSelectionRouter() {
  const clickHandledRef = useRef(false)

  useEffect(() => {
    let resetClickHandledTimer: ReturnType<typeof setTimeout> | null = null
    const markClickHandled = () => {
      clickHandledRef.current = true
      if (resetClickHandledTimer) clearTimeout(resetClickHandledTimer)
      resetClickHandledTimer = setTimeout(() => {
        clickHandledRef.current = false
      }, 50)
    }

    const onNodeClick = (event: NodeEvent) => {
      const editor = useEditor.getState()
      const viewer = useViewer.getState()
      const nodes = useScene.getState().nodes
      const node = resolveLandrushPascalSelectionNode(event.node, nodes)
      const definition = nodeRegistry.get(node.type)
      const selectionTarget = resolveLandrushPascalNodeSelectionTarget({
        itemCategory: node.type === 'item' ? node.asset.category : null,
        nodeType: node.type,
        registryCategory: definition?.category ?? null,
        registrySelectable: isRegistrySelectable(node.type),
      })
      if (!selectionTarget) return
      if (
        editor.mode === 'build' &&
        (editor.phase !== selectionTarget.phase ||
          (selectionTarget.phase === 'structure' &&
            selectionTarget.structureLayer !== editor.structureLayer))
      ) {
        return
      }

      const nativeEvent = event.nativeEvent
      const nextSelectedIds = resolveLandrushPascalNodeSelection({
        activeTool: editor.tool,
        currentLevelId: viewer.selection.levelId,
        editorMode: editor.mode,
        interactionKind: useInteractionScope.getState().scope.kind,
        nodeId: node.id,
        nodeLevelId: node.type === 'elevator' ? null : resolveLevelId(node, nodes),
        nodeType: node.type,
        selectable: true,
        selectedIds: viewer.selection.selectedIds,
        toggle: nativeEvent.metaKey || nativeEvent.ctrlKey || nativeEvent.shiftKey,
        viaHandle: event.viaHandle,
      })
      if (!nextSelectedIds) return

      event.stopPropagation()
      markClickHandled()
      if (editor.mode === 'select') {
        if (selectionTarget.phase !== editor.phase) editor.setPhase(selectionTarget.phase)
        if (
          selectionTarget.phase === 'structure' &&
          selectionTarget.structureLayer !== useEditor.getState().structureLayer
        ) {
          editor.setStructureLayer(selectionTarget.structureLayer ?? 'elements')
        }
      }
      viewer.setSelection({ selectedIds: nextSelectedIds })
      useViewer.setState({ hoveredId: null })
      emitter.emit('selection:canvas-node-click', node)
    }

    const onGridClick = (event: GridEvent) => {
      if (clickHandledRef.current) return
      const editor = useEditor.getState()
      if (editor.mode !== 'select' && !(editor.mode === 'build' && editor.tool === null)) return
      if (useInteractionScope.getState().scope.kind !== 'idle') return
      if (event.nativeEvent.metaKey || event.nativeEvent.ctrlKey || event.nativeEvent.shiftKey)
        return
      useViewer.getState().setSelection({ selectedIds: [] })
      editor.setSelectedMaterialTarget(null)
    }

    emitter.on('node:click', onNodeClick)
    emitter.on('grid:click', onGridClick)
    return () => {
      emitter.off('node:click', onNodeClick)
      emitter.off('grid:click', onGridClick)
      if (resetClickHandledTimer) clearTimeout(resetClickHandledTimer)
    }
  }, [])

  return null
}

function LandrushSelectionOutlinerSync() {
  const selection = useViewer((state) => state.selection)
  const externalSelectedIds = useViewer((state) => state.externalSelectedIds)
  const hoveredId = useViewer((state) => state.hoveredId)
  const outliner = useViewer((state) => state.outliner)
  const geometryRevision = useViewer((state) => state.geometryRevision)
  const nodes = useScene((state) => state.nodes)

  useEffect(() => {
    void geometryRevision
    outliner.selectedObjects.length = 0
    for (const id of new Set([...selection.selectedIds, ...externalSelectedIds])) {
      const node = nodes[id as AnyNodeId]
      if (node?.type === 'slab') continue
      const object = sceneRegistry.nodes.get(id)
      if (object) outliner.selectedObjects.push(object)
    }

    outliner.hoveredObjects.length = 0
    if (!hoveredId) return
    const hoveredNode = nodes[hoveredId as AnyNodeId]
    if (hoveredNode?.type === 'slab') return
    const hoveredObject = sceneRegistry.nodes.get(hoveredId)
    if (hoveredObject) outliner.hoveredObjects.push(hoveredObject)
  }, [externalSelectedIds, geometryRevision, hoveredId, nodes, outliner, selection])

  return null
}

export function resolveLandrushPascalSelectionNode(
  node: AnyNode,
  nodes: Readonly<Record<string, AnyNode | undefined>>,
): AnyNode {
  if (
    (node.type === 'roof-segment' || node.type === 'stair-segment') &&
    node.parentId &&
    nodes[node.parentId]?.type === (node.type === 'roof-segment' ? 'roof' : 'stair')
  ) {
    node = nodes[node.parentId] as AnyNode
  }
  return nodes[resolveSelectionProxyId(node, nodes)] ?? node
}

function RegisteredSelectionAffordance() {
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const selectedKind = useScene((state) => resolveSoleSelectedNodeType(selectedIds, state.nodes))
  const registryVersion = useRegistryVersion()
  const loader = useMemo(() => {
    void registryVersion
    return resolveRegisteredSelectionAffordanceLoader({
      getDefinition: (kind) => nodeRegistry.get(kind),
      selectedKind,
    })
  }, [registryVersion, selectedKind])

  const Component = useMemo(() => {
    if (!loader) return null
    const cached = lazyAffordanceCache.get(loader)
    if (cached) return cached
    const next = lazy(loader)
    lazyAffordanceCache.set(loader, next)
    return next
  }, [loader])

  if (!Component) return null
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  )
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

function isOpeningNodeType(type: string | null): type is 'door' | 'window' {
  return type === 'door' || type === 'window'
}
