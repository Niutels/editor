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
  FloatingMenu,
  Grid,
  NodeArrowHandles,
  type SceneGraph,
  ToolManager,
  useEditor,
  useSidebarStore,
} from '@pascal-app/editor'
import { InteractiveSystem, useViewer, Viewer } from '@pascal-app/viewer'
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'
import {
  exitLandrushPascalEditingToSelect,
  LandrushPascalEditingRuntime,
  resolveLandrushPascalSelectionManager,
} from './landrush-pascal-editing-runtime'
import { applyLandrushPascalSceneGraph } from './landrush-pascal-scene-load'
import {
  type PascalSitePresentationVisibility,
  restorePascalSitePresentation,
  suppressPascalSitePresentation,
} from './pascal-site-presentation'

export type LandrushPascalHostProps = {
  children: ReactNode
  disablePostFx?: boolean
  editingActive: boolean
  editingChrome: ReactNode
  maxFps?: number
  onLoad: () => Promise<SceneGraph | null>
  onSceneReadyChange: (ready: boolean) => void
  projectId?: string | null
}

export function LandrushPascalHost({
  children,
  disablePostFx = true,
  editingActive,
  editingChrome,
  maxFps = 60,
  onLoad,
  onSceneReadyChange,
  projectId = null,
}: LandrushPascalHostProps) {
  const [hasLoadedScene, setHasLoadedScene] = useState(false)
  const [sceneReadyKey, setSceneReadyKey] = useState(0)
  const selectionManager = resolveLandrushPascalSelectionManager(editingActive)

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
        useViewer.getState().resetSelection()
        if (scene) applyLandrushPascalSceneGraph(scene)
        else applySceneGraphToEditor(null)
      } catch (error) {
        if (cancelled) return
        console.error('[landrush] Failed to load the Pascal scene.', error)
        const currentScene = useScene.getState()
        if (currentScene.rootNodeIds.length === 0 && Object.keys(currentScene.nodes).length === 0) {
          applySceneGraphToEditor(null)
        }
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
    <div className="absolute inset-0" data-landrush-pascal-host>
      <div
        className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
        data-landrush-pascal-viewer-viewport
      >
        <Viewer
          defaultRender={{ shading: 'solid' }}
          disablePostFx={disablePostFx}
          maxFps={maxFps}
          onSceneReadyChange={onSceneReadyChange}
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
      </div>
      {editingActive ? editingChrome : null}
    </div>
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
  const gridSnapStep = useEditor((state) => state.gridSnapStep)

  useLayoutEffect(
    () => () => {
      exitLandrushPascalEditingToSelect()
    },
    [],
  )

  return (
    <>
      <LandrushPascalEditingRuntime />
      <NodeArrowHandles />
      <FloatingMenu />
      <Grid cellColor="#aaa" cellSize={gridSnapStep} fadeDistance={500} sectionColor="#ccc" />
      <ToolManager />
    </>
  )
}
