'use client'

import { LandrushMaterialRendererBackendBridge } from '@landrush/runtime'
import {
  initSpaceDetectionSync,
  initSpatialGridSync,
  spatialGridManager,
  useScene,
} from '@pascal-app/core'
import {
  applySceneGraphToEditor,
  FloatingLevelSelector,
  FloatingMenu,
  Grid,
  ItemsPanel,
  NodeArrowHandles,
  type SceneGraph,
  ToolManager,
  useEditor,
  useSidebarStore,
} from '@pascal-app/editor'
import { InteractiveSystem, useViewer, Viewer } from '@pascal-app/viewer'
import { type ReactNode, useEffect, useState } from 'react'

const LANDRUSH_STRUCTURE_TOOLS = [
  ['wall', 'Wall'],
  ['door', 'Door'],
  ['window', 'Window'],
  ['stair', 'Stairs'],
  ['slab', 'Floor'],
  ['ceiling', 'Ceiling'],
  ['roof', 'Roof'],
  ['fence', 'Fence'],
  ['column', 'Column'],
  ['item', 'Furniture'],
] as const

export type LandrushPascalHostProps = {
  children: ReactNode
  disablePostFx?: boolean
  editingActive: boolean
  maxFps?: number
  onLoad: () => Promise<SceneGraph | null>
  projectId?: string | null
}

export function LandrushPascalHost({
  children,
  disablePostFx = true,
  editingActive,
  maxFps = 60,
  onLoad,
  projectId = null,
}: LandrushPascalHostProps) {
  const [hasLoadedScene, setHasLoadedScene] = useState(false)
  const [sceneReadyKey, setSceneReadyKey] = useState(0)
  const placementToolActive = useEditor(
    (state) => editingActive && state.mode === 'build' && state.tool !== null,
  )
  const selectionManager = editingActive && !placementToolActive ? 'default' : 'custom'

  useEffect(() => {
    const stopSpatialGrid = initSpatialGridSync()
    const stopSpaceDetection = initSpaceDetectionSync(useScene, useEditor)
    void useEditor.persist.rehydrate()
    void useSidebarStore.persist.rehydrate()

    return () => {
      stopSpatialGrid()
      stopSpaceDetection?.()
      spatialGridManager.clear()
      const outliner = useViewer.getState().outliner
      outliner.selectedObjects.length = 0
      outliner.hoveredObjects.length = 0
    }
  }, [])

  useEffect(() => {
    useViewer.getState().setProjectId(projectId)
    return () => useViewer.getState().setProjectId(null)
  }, [projectId])

  useEffect(() => {
    let cancelled = false

    async function loadScene() {
      try {
        const scene = await onLoad()
        if (cancelled) return
        useScene.getState().unloadScene()
        useViewer.getState().resetSelection()
        applySceneGraphToEditor(scene)
      } catch (error) {
        if (cancelled) return
        console.error('[landrush] Failed to load the Pascal scene.', error)
        applySceneGraphToEditor(null)
      }

      if (cancelled) return
      setSceneReadyKey((key) => key + 1)
      setHasLoadedScene(true)
    }

    void loadScene()
    return () => {
      cancelled = true
    }
  }, [onLoad])

  if (!hasLoadedScene) return null

  return (
    <>
      <Viewer
        defaultRender={{ shading: 'solid' }}
        disablePostFx={disablePostFx}
        maxFps={maxFps}
        renderContext="editor"
        sceneReadyKey={sceneReadyKey}
        selectionManager={selectionManager}
        useBvh={false}
      >
        <LandrushMaterialRendererBackendBridge />
        <InteractiveSystem />
        {editingActive ? <LandrushPascalEditingSurface /> : null}
        {children}
      </Viewer>
      {editingActive ? <LandrushPascalEditingChrome /> : null}
    </>
  )
}

function LandrushPascalEditingSurface() {
  const toolActive = useEditor((state) => state.mode === 'build' && state.tool !== null)

  return (
    <>
      <NodeArrowHandles />
      <FloatingMenu />
      {toolActive ? (
        <>
          <Grid cellColor="#aaa" fadeDistance={500} sectionColor="#ccc" />
          <ToolManager />
        </>
      ) : null}
    </>
  )
}

function LandrushPascalEditingChrome() {
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const [itemsOpen, setItemsOpen] = useState(false)

  const setControlMode = (nextMode: 'build' | 'delete' | 'material-paint' | 'select') => {
    const editor = useEditor.getState()
    setItemsOpen(false)
    if (nextMode === 'select') {
      editor.setTool(null)
      editor.setMode('select')
      editor.setFloorplanSelectionTool('click')
      return
    }
    if (nextMode === 'build') {
      editor.setPhase('structure')
      editor.setStructureLayer('elements')
      editor.setTool(editor.tool ?? 'wall')
      editor.setMode('build')
      return
    }
    if (nextMode === 'material-paint') {
      editor.primeMaterialPaintFromSelection()
      editor.setPhase('structure')
      editor.setStructureLayer('elements')
    }
    editor.setTool(null)
    editor.setMode(nextMode)
  }

  const setStructureTool = (nextTool: (typeof LANDRUSH_STRUCTURE_TOOLS)[number][0]) => {
    const editor = useEditor.getState()
    editor.setPhase(nextTool === 'item' ? 'furnish' : 'structure')
    if (nextTool !== 'item') editor.setStructureLayer('elements')
    editor.setTool(nextTool)
    editor.setMode('build')
    setItemsOpen(nextTool === 'item')
  }

  return (
    <>
      <FloatingLevelSelector />
      <div className="pointer-events-auto fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-1.5 rounded-2xl border border-white/15 bg-slate-950/90 p-2 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-center gap-1">
          {(['select', 'build', 'material-paint', 'delete'] as const).map((controlMode) => (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                mode === controlMode || (controlMode === 'build' && mode === 'build')
                  ? 'bg-blue-500 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              data-editor-control-mode={controlMode}
              key={controlMode}
              onClick={() => setControlMode(controlMode)}
              type="button"
            >
              {controlMode === 'material-paint'
                ? 'Paint'
                : controlMode[0]?.toUpperCase() + controlMode.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex max-w-[calc(100vw-3rem)] items-center gap-1 overflow-x-auto border-white/10 border-t pt-1.5">
          {LANDRUSH_STRUCTURE_TOOLS.map(([toolId, label]) => (
            <button
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition ${
                mode === 'build' && tool === toolId
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              data-editor-structure-tool={toolId}
              key={toolId}
              onClick={() => setStructureTool(toolId)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {itemsOpen ? (
        <aside className="pointer-events-auto fixed top-16 right-4 bottom-24 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-white/10 border-b px-3 py-2">
            <span className="font-semibold text-sm">Furniture and fixtures</span>
            <button
              className="rounded-md px-2 py-1 text-xs text-white/65 hover:bg-white/10 hover:text-white"
              onClick={() => setItemsOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="h-[calc(100%-2.5rem)]">
            <ItemsPanel showSourceFilter={false} showTagFilters={false} />
          </div>
        </aside>
      ) : null}
    </>
  )
}
