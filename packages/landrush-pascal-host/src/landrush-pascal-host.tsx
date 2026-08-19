'use client'

import { LandrushMaterialRendererBackendBridge } from '@landrush/runtime'
import {
  initSpaceDetectionSync,
  initSpatialGridSync,
  sceneRegistry,
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
import {
  type PascalSitePresentationVisibility,
  restorePascalSitePresentation,
  suppressPascalSitePresentation,
} from './pascal-site-presentation'

const LANDRUSH_CONTROL_MODES = [
  { iconSrc: '/icons/select.webp', id: 'select', label: 'Select' },
  { iconSrc: '/icons/build.webp', id: 'build', label: 'Build' },
  { iconSrc: '/icons/paint.webp', id: 'material-paint', label: 'Paint' },
  { id: 'delete', label: 'Delete' },
] as const

const LANDRUSH_STRUCTURE_TOOLS = [
  { iconSrc: '/icons/wall.webp', id: 'wall', label: 'Wall' },
  { iconSrc: '/icons/door.webp', id: 'door', label: 'Door' },
  { iconSrc: '/icons/window.webp', id: 'window', label: 'Window' },
  { iconSrc: '/icons/stairs.webp', id: 'stair', label: 'Stairs' },
  { iconSrc: '/icons/floor.webp', id: 'slab', label: 'Floor' },
  { iconSrc: '/icons/ceiling.webp', id: 'ceiling', label: 'Ceiling' },
  { iconSrc: '/icons/roof.webp', id: 'roof', label: 'Roof' },
  { iconSrc: '/icons/fence.webp', id: 'fence', label: 'Fence' },
  { iconSrc: '/icons/column.webp', id: 'column', label: 'Column' },
  { iconSrc: '/icons/couch.webp', id: 'item', label: 'Furniture' },
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
        <LandrushWorldOwnedSitePresentation />
        <LandrushMaterialRendererBackendBridge />
        <InteractiveSystem />
        {editingActive ? <LandrushPascalEditingSurface /> : null}
        {children}
      </Viewer>
      {editingActive ? <LandrushPascalEditingChrome /> : null}
    </>
  )
}

function LandrushWorldOwnedSitePresentation() {
  useEffect(() => {
    const savedVisibility: PascalSitePresentationVisibility = new Map()
    let animationFrame: number | null = null
    let disposed = false

    const schedule = () => {
      if (disposed || animationFrame !== null) return
      animationFrame = window.requestAnimationFrame(apply)
    }
    const apply = () => {
      animationFrame = null
      if (disposed) return

      const scene = useScene.getState()
      let waitingForRenderers = false
      for (const rootId of scene.rootNodeIds) {
        const rootNode = scene.nodes[rootId]
        if (rootNode?.type !== 'site') continue
        const siteObject = sceneRegistry.nodes.get(rootId)
        if (!siteObject) {
          waitingForRenderers = true
          continue
        }

        let siteWaitingForRenderers = false
        const semanticChildObjects = rootNode.children.flatMap((childId) => {
          const object = sceneRegistry.nodes.get(childId)
          if (!object) {
            siteWaitingForRenderers = true
            return []
          }
          return [object]
        })
        if (siteWaitingForRenderers) {
          waitingForRenderers = true
          continue
        }
        suppressPascalSitePresentation(siteObject, semanticChildObjects, savedVisibility)
      }

      if (waitingForRenderers) schedule()
    }

    const unsubscribe = useScene.subscribe(schedule)
    schedule()
    return () => {
      disposed = true
      unsubscribe()
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      restorePascalSitePresentation(savedVisibility)
    }
  }, [])

  return null
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

  const setStructureTool = (nextTool: (typeof LANDRUSH_STRUCTURE_TOOLS)[number]['id']) => {
    const editor = useEditor.getState()
    editor.setPhase(nextTool === 'item' ? 'furnish' : 'structure')
    if (nextTool !== 'item') editor.setStructureLayer('elements')
    editor.setTool(nextTool)
    editor.setMode('build')
    setItemsOpen(nextTool === 'item')
  }

  return (
    <div className="dark text-foreground">
      <FloatingLevelSelector />
      <div className="pointer-events-auto fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-border bg-background/90 shadow-2xl backdrop-blur-md">
        <div className="flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto px-2 py-1.5">
          {LANDRUSH_CONTROL_MODES.map((controlMode) => (
            <LandrushPascalToolbarButton
              active={mode === controlMode.id}
              dataAttribute={{ name: 'data-editor-control-mode', value: controlMode.id }}
              iconSrc={'iconSrc' in controlMode ? controlMode.iconSrc : undefined}
              key={controlMode.id}
              label={controlMode.label}
              onClick={() => setControlMode(controlMode.id)}
            />
          ))}
          <div className="mx-1 h-5 w-px shrink-0 bg-border" />
          {LANDRUSH_STRUCTURE_TOOLS.map((structureTool) => (
            <LandrushPascalToolbarButton
              active={mode === 'build' && tool === structureTool.id}
              dataAttribute={{
                name: 'data-editor-structure-tool',
                value: structureTool.id,
              }}
              iconSrc={structureTool.iconSrc}
              key={structureTool.id}
              label={structureTool.label}
              onClick={() => setStructureTool(structureTool.id)}
            />
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
    </div>
  )
}

function LandrushPascalToolbarButton({
  active,
  dataAttribute,
  iconSrc,
  label,
  onClick,
}: {
  active: boolean
  dataAttribute: {
    name: 'data-editor-control-mode' | 'data-editor-structure-tool'
    value: string
  }
  iconSrc?: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-all ${
        active
          ? 'bg-white/10 text-foreground'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
      }`}
      {...{ [dataAttribute.name]: dataAttribute.value }}
      onClick={onClick}
      title={label}
      type="button"
    >
      {iconSrc ? (
        <img
          alt=""
          aria-hidden="true"
          className={`h-7 w-7 object-contain transition-[opacity,filter,transform] group-hover:scale-105 group-hover:opacity-100 group-hover:grayscale-0 ${
            active ? 'opacity-100 grayscale-0' : 'opacity-60 grayscale'
          }`}
          src={iconSrc}
        />
      ) : (
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="m19 6-1 14H6L5 6" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      )}
    </button>
  )
}
