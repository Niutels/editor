'use client'

import { type AnyNode, useScene } from '@pascal-app/core'
import { useViewer, Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { REVISION, Vector3 } from 'three'
import type {
  PascalOpenworldIntegrationCamera,
  PascalOpenworldIntegrationCell,
  PascalOpenworldIntegrationManifest,
} from './pascal-openworld-integration-contract'
import { createPascalOpenworldIntegrationScene } from './pascal-openworld-integration-scene'

type RuntimeProbe = {
  route: '/landrush-lab/pascal-openworld-integration-lab'
  cell: PascalOpenworldIntegrationCell
  camera: PascalOpenworldIntegrationCamera
  canvasCount: number
  rendererContract: 'one-pascal-viewer'
  rendererBackend: string
  threeRevision: string
  originIsolated: boolean
  multiplayerEnabled: false
  hiddenTabPaused: boolean
  postFx: boolean
  nodeCount: number
  levelCount: number
  worldNodeCount: number
  constructionNodeCount: number
  floorAreaSquareMeters: number
  drawCalls: number | null
  triangles: number | null
  frameP95Ms: number | null
}

declare global {
  interface Window {
    __PASCAL_OPENWORLD_INTEGRATION_LAB__?: RuntimeProbe
  }
}

const CAMERA_BOOKMARKS: Record<
  PascalOpenworldIntegrationCamera,
  { positionOffset: readonly [number, number, number]; targetMode: 'house' | 'island' }
> = {
  near: { positionOffset: [14, 8, 17], targetMode: 'house' },
  design: { positionOffset: [25, 19, 27], targetMode: 'house' },
  far: { positionOffset: [72, 60, 76], targetMode: 'island' },
}

export function PascalOpenworldIntegrationRuntime({
  cameraBookmark,
  cell,
  postFx,
}: {
  cameraBookmark: PascalOpenworldIntegrationCamera
  cell: PascalOpenworldIntegrationCell
  postFx: boolean
}) {
  const scene = useMemo(() => createPascalOpenworldIntegrationScene(cell), [cell])

  useEffect(() => {
    const viewer = useViewer.getState()
    const previous = {
      cameraMode: viewer.cameraMode,
      levelMode: viewer.levelMode,
      projectId: viewer.projectId,
      renderPaused: viewer.renderPaused,
      sceneTheme: viewer.sceneTheme,
      shadows: viewer.shadows,
      showGrid: viewer.showGrid,
      wallMode: viewer.wallMode,
    }
    const syncVisibility = () => useViewer.getState().setRenderPaused(document.hidden)

    viewer.setProjectId(scene.manifest.persistenceNamespace)
    viewer.setCameraMode('perspective')
    viewer.setLevelMode('stacked')
    viewer.setWallMode('up')
    viewer.setSceneTheme('studio')
    viewer.setShowGrid(false)
    viewer.setShadows(true)
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      delete window.__PASCAL_OPENWORLD_INTEGRATION_LAB__
      useScene.getState().unloadScene()
      const currentViewer = useViewer.getState()
      currentViewer.setProjectId(previous.projectId)
      currentViewer.setCameraMode(previous.cameraMode)
      currentViewer.setLevelMode(previous.levelMode)
      currentViewer.setRenderPaused(previous.renderPaused)
      currentViewer.setSceneTheme(previous.sceneTheme)
      currentViewer.setShadows(previous.shadows)
      currentViewer.setShowGrid(previous.showGrid)
      currentViewer.setWallMode(previous.wallMode)
      currentViewer.resetSelection()
    }
  }, [scene.manifest.persistenceNamespace])

  useEffect(() => {
    const nodes = Object.values(scene.graph.nodes) as AnyNode[]
    const building = nodes.find((node) => node.type === 'building')
    const groundLevel = nodes.find((node) => node.type === 'level' && node.level === 0)
    useScene.getState().setScene(scene.graph.nodes as never, scene.graph.rootNodeIds as never)
    const viewer = useViewer.getState()
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: (building?.id ?? null) as never,
      levelId: (groundLevel?.id ?? null) as never,
      selectedIds: [],
      zoneId: null,
    })
  }, [scene])

  return (
    <Viewer
      defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
      disablePostFx={!postFx}
      renderContext="viewer"
      rendererBackend="webgl"
      selectionManager="custom"
      useBvh={false}
    >
      <IntegrationCameraRig bookmark={cameraBookmark} manifest={scene.manifest} />
      <IntegrationRuntimeProbe
        bookmark={cameraBookmark}
        manifest={scene.manifest}
        nodeCount={Object.keys(scene.graph.nodes).length}
        postFx={postFx}
      />
    </Viewer>
  )
}

function IntegrationCameraRig({
  bookmark,
  manifest,
}: {
  bookmark: PascalOpenworldIntegrationCamera
  manifest: PascalOpenworldIntegrationManifest
}) {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const config = CAMERA_BOOKMARKS[bookmark]
  const target = useMemo(
    () =>
      config.targetMode === 'island'
        ? new Vector3(0, 1.5, 0)
        : new Vector3(...manifest.houseCenter),
    [config.targetMode, manifest.houseCenter],
  )

  useEffect(() => {
    camera.position.set(
      target.x + config.positionOffset[0],
      target.y + config.positionOffset[1],
      target.z + config.positionOffset[2],
    )
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, config.positionOffset, invalidate, target])

  return (
    <OrbitControls
      dampingFactor={0.075}
      enableDamping
      makeDefault
      maxDistance={240}
      minDistance={3}
      target={target}
    />
  )
}

function IntegrationRuntimeProbe({
  bookmark,
  manifest,
  nodeCount,
  postFx,
}: {
  bookmark: PascalOpenworldIntegrationCamera
  manifest: PascalOpenworldIntegrationManifest
  nodeCount: number
  postFx: boolean
}) {
  const gl = useThree((state) => state.gl)
  const frameSamples = useRef<number[]>([])

  useEffect(() => {
    const info = gl.info
    window.__PASCAL_OPENWORLD_INTEGRATION_LAB__ = {
      route: '/landrush-lab/pascal-openworld-integration-lab',
      cell: manifest.cell,
      camera: bookmark,
      canvasCount: document.querySelectorAll('[data-landrush-integration-lab] canvas').length,
      rendererContract: manifest.rendererContract,
      rendererBackend: gl.constructor.name,
      threeRevision: REVISION,
      originIsolated: window.location.hostname === '127.0.0.1',
      multiplayerEnabled: false,
      hiddenTabPaused: document.hidden,
      postFx,
      nodeCount,
      levelCount: manifest.levelCount,
      worldNodeCount: manifest.worldNodeCount,
      constructionNodeCount: manifest.constructionNodeCount,
      floorAreaSquareMeters: manifest.floorAreaSquareMeters,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      frameP95Ms: null,
    }
  }, [bookmark, gl, manifest, nodeCount, postFx])

  useFrame((_state, delta) => {
    const samples = frameSamples.current
    samples.push(delta * 1000)
    if (samples.length < 120) return

    const sorted = [...samples].sort((left, right) => left - right)
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? null
    samples.length = 0
    const probe = window.__PASCAL_OPENWORLD_INTEGRATION_LAB__
    if (!probe) return
    probe.canvasCount = document.querySelectorAll('[data-landrush-integration-lab] canvas').length
    probe.hiddenTabPaused = document.hidden
    probe.drawCalls = gl.info.render.calls
    probe.triangles = gl.info.render.triangles
    probe.frameP95Ms = p95
  })

  return null
}
