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
  getMovingNode,
  getPlacementSurface,
  NodeArrowHandles,
  type SceneGraph,
  ToolManager,
  useEditor,
  useSidebarStore,
} from '@pascal-app/editor'
import {
  InteractiveSystem,
  type RendererBackendPreference,
  useViewer,
  Viewer,
  type ViewerPresentationEffectRef,
  type ViewerRendererInitializationFailure,
  type ViewerSceneDrawSubmissionRef,
} from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { memo, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Group, Vector3 } from 'three'
import {
  didLandrushPascalEditingDeactivate,
  exitLandrushPascalEditingToSelect,
  LandrushPascalEditingRuntime,
  resolveLandrushPascalSelectionManager,
} from './landrush-pascal-editing-runtime'
import { resolveLandrushPascalCanonicalGridVisibility } from './landrush-pascal-grid-visual-owner'
import { applyLandrushPascalSceneGraph } from './landrush-pascal-scene-load'
import {
  type PascalSitePresentationVisibility,
  restorePascalSitePresentation,
  suppressPascalSitePresentation,
} from './pascal-site-presentation'

export type LandrushPascalHostProps = {
  antialias?: boolean
  children: ReactNode
  disablePostFx?: boolean
  editingActive: boolean
  editingChrome: ReactNode
  editingViewportModeTransitionActive: boolean
  editingViewportOpen: boolean
  maxFps?: number
  onLoad: () => Promise<SceneGraph | null>
  onSceneReadyChange: (ready: boolean) => void
  ownedHorizontalGridPlaneY: number | null
  presentationEffectRef?: ViewerPresentationEffectRef
  projectId?: string | null
  sceneReadyKey?: string | number | null
  sceneReadyMaxWaitMs?: number
  sceneReadyPrerequisitesReady?: boolean
  sceneDrawDisabled?: boolean
  sceneDrawSubmissionRef?: ViewerSceneDrawSubmissionRef
  rendererBackend?: RendererBackendPreference
  onRendererInitializationFailure?: (failure: ViewerRendererInitializationFailure) => void
}

export function LandrushPascalHost({
  antialias = true,
  children,
  disablePostFx = true,
  editingActive,
  editingChrome,
  editingViewportModeTransitionActive,
  editingViewportOpen,
  maxFps = 60,
  onLoad,
  onSceneReadyChange,
  ownedHorizontalGridPlaneY,
  presentationEffectRef,
  projectId = null,
  sceneReadyKey = null,
  sceneReadyMaxWaitMs,
  sceneReadyPrerequisitesReady = true,
  sceneDrawDisabled = false,
  sceneDrawSubmissionRef,
  rendererBackend = 'auto',
  onRendererInitializationFailure,
}: LandrushPascalHostProps) {
  const [hasLoadedScene, setHasLoadedScene] = useState(false)
  const [sceneLoadRevision, setSceneLoadRevision] = useState(0)
  const viewerSceneReadyKey = JSON.stringify([sceneReadyKey, sceneLoadRevision])
  const previousEditingActiveRef = useRef(editingActive)
  const selectionManager = resolveLandrushPascalSelectionManager(editingActive)

  useLayoutEffect(() => {
    const previousEditingActive = previousEditingActiveRef.current
    previousEditingActiveRef.current = editingActive
    if (didLandrushPascalEditingDeactivate(previousEditingActive, editingActive)) {
      exitLandrushPascalEditingToSelect()
    }
  }, [editingActive])

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
      setSceneLoadRevision((revision) => revision + 1)
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
      <LandrushPascalViewerViewport
        modeTransitionActive={editingViewportModeTransitionActive}
        open={editingViewportOpen}
      >
        <Viewer
          antialias={antialias}
          defaultRender={{ shading: 'solid' }}
          disablePostFx={disablePostFx}
          maxFps={maxFps}
          onRendererInitializationFailure={onRendererInitializationFailure}
          onSceneReadyChange={onSceneReadyChange}
          presentationEffectRef={presentationEffectRef}
          renderContext="editor"
          rendererBackend={rendererBackend}
          sceneReadyKey={viewerSceneReadyKey}
          sceneReadyMaxWaitMs={sceneReadyMaxWaitMs}
          sceneReadyPrerequisitesReady={sceneReadyPrerequisitesReady}
          sceneDrawDisabled={sceneDrawDisabled}
          sceneDrawSubmissionRef={sceneDrawSubmissionRef}
          selectionManager={selectionManager}
          useBvh={false}
        >
          <LandrushPascalHostRuntime
            editingActive={editingActive}
            ownedHorizontalGridPlaneY={ownedHorizontalGridPlaneY}
          />
          {children}
        </Viewer>
      </LandrushPascalViewerViewport>
      {editingChrome}
    </div>
  )
}

const LandrushPascalHostRuntime = memo(function LandrushPascalHostRuntime({
  editingActive,
  ownedHorizontalGridPlaneY,
}: {
  editingActive: boolean
  ownedHorizontalGridPlaneY: number | null
}) {
  return (
    <>
      <LandrushWorldOwnedSitePresentation />
      <LandrushMaterialRendererBackendBridge />
      <InteractiveSystem />
      {editingActive ? (
        <LandrushPascalEditingSurface ownedHorizontalGridPlaneY={ownedHorizontalGridPlaneY} />
      ) : null}
    </>
  )
})

function LandrushPascalViewerViewport({
  children,
  modeTransitionActive,
  open,
}: {
  children: ReactNode
  modeTransitionActive: boolean
  open: boolean
}) {
  return (
    <div
      className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
      data-landrush-pascal-viewer-mode-transition={modeTransitionActive ? 'true' : 'false'}
      data-landrush-pascal-viewer-open={open ? 'true' : 'false'}
      data-landrush-pascal-viewer-viewport
    >
      <div className="absolute inset-0 min-h-0 min-w-0" data-landrush-pascal-viewer-surface>
        {children}
      </div>
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

function LandrushPascalEditingSurface({
  ownedHorizontalGridPlaneY,
}: {
  ownedHorizontalGridPlaneY: number | null
}) {
  const gridSnapStep = useEditor((state) => state.gridSnapStep)

  return (
    <>
      <LandrushPascalEditingRuntime />
      <NodeArrowHandles />
      <FloatingMenu />
      <LandrushPascalCanonicalGrid
        cellSize={gridSnapStep}
        ownedHorizontalGridPlaneY={ownedHorizontalGridPlaneY}
      />
      <ToolManager />
    </>
  )
}

function LandrushPascalCanonicalGrid({
  cellSize,
  ownedHorizontalGridPlaneY,
}: {
  cellSize: number
  ownedHorizontalGridPlaneY: number | null
}) {
  const visualGroupRef = useRef<Group>(null)
  const movingWorldPositionRef = useRef(new Vector3())

  useFrame(() => {
    const publishedSurface = getPlacementSurface()
    const movingNode = publishedSurface ? null : getMovingNode()
    const movingObject = movingNode ? sceneRegistry.nodes.get(movingNode.id) : null
    const movingPositionY = movingObject
      ? movingObject.getWorldPosition(movingWorldPositionRef.current).y
      : null
    let selectedLevelY = 0
    if (!(publishedSurface || movingObject)) {
      const selectedLevelId = useViewer.getState().selection.levelId
      if (selectedLevelId)
        selectedLevelY = sceneRegistry.nodes.get(selectedLevelId)?.position.y ?? 0
    }
    const movingPlaneWallHosted =
      movingNode?.type === 'item' &&
      (movingNode.asset?.attachTo === 'wall' || movingNode.asset?.attachTo === 'wall-side')
    const visible = resolveLandrushPascalCanonicalGridVisibility(
      ownedHorizontalGridPlaneY,
      publishedSurface?.point.y ?? null,
      publishedSurface?.normal.y ?? null,
      movingPositionY,
      movingPlaneWallHosted,
      selectedLevelY,
    )
    if (visualGroupRef.current && visualGroupRef.current.visible !== visible) {
      visualGroupRef.current.visible = visible
    }
  })

  return (
    <group ref={visualGroupRef}>
      <Grid cellColor="#aaa" cellSize={cellSize} fadeDistance={500} sectionColor="#ccc" />
    </group>
  )
}
