'use client'

import { type LevelNode, PascalWaterNode, type SceneGraph, useScene } from '@pascal-app/core'
import {
  LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  type LandrushWaterBodySurfaceParameters,
} from '@pascal-app/nodes'
import { renderScheduler, useViewer, Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import {
  generateWaterLabIsland,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const PASCAL_WATER_SITE_ID = 'site_pascal-water-debug'
const PASCAL_WATER_BUILDING_ID = 'building_pascal-water-debug'
const PASCAL_WATER_LEVEL_ID = 'level_pascal-water-debug'
const PASCAL_WATER_CAMERA_POSITION = [88, 86, 94] as const
const PASCAL_WATER_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_WATER_CAMERA_ZOOM = 7.8

declare global {
  interface Window {
    __PASCAL_BENCH_ORBITING__?: boolean
    __PASCAL_WATER_DEBUG__?: {
      features: readonly string[]
      nodeId: string
      source: string
    }
  }
}

export function PascalWaterClient() {
  const pascalWaterScene = useMemo(createPascalWaterSceneGraph, [])
  const { sceneGraph, waterNode } = pascalWaterScene

  useEffect(() => {
    const viewer = useViewer.getState()

    useScene.getState().setScene(sceneGraph.nodes as never, sceneGraph.rootNodeIds as never)
    viewer.setProjectId('pascal-water-debug')
    viewer.setCameraMode('orthographic')
    viewer.setShowGrid(false)
    viewer.setShadows(false)
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: PASCAL_WATER_BUILDING_ID as never,
      levelId: PASCAL_WATER_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    renderScheduler.requestFrame('geometry:changed')
    window.__PASCAL_BENCH_ORBITING__ = true

    if (waterNode) {
      window.__PASCAL_WATER_DEBUG__ = {
        features: [
          'pascal-viewer-canvas',
          'pascal-water-node',
          'donated-water-field-texture',
          'donated-water-material',
          'donated-shore-contours',
          'editor-panels-reserved-for-build-mode',
        ],
        nodeId: waterNode.id,
        source: 'pascal-water',
      }
    }

    return () => {
      delete window.__PASCAL_WATER_DEBUG__
      delete window.__PASCAL_BENCH_ORBITING__
      useScene.getState().unloadScene()
    }
  }, [sceneGraph, waterNode])

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#0f1720]">
      <Viewer
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        postProcessing={false}
        renderContext="viewer"
        rendererBackend="webgpu"
        selectionManager="custom"
        useBvh={false}
      >
        <PascalWaterCameraRig />
      </Viewer>
    </main>
  )
}

function PascalWaterCameraRig() {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const target = useMemo(() => new Vector3(...PASCAL_WATER_CAMERA_TARGET), [])

  useEffect(() => {
    camera.position.set(...PASCAL_WATER_CAMERA_POSITION)
    camera.lookAt(target)
    if ('zoom' in camera && typeof camera.zoom === 'number') {
      camera.zoom = PASCAL_WATER_CAMERA_ZOOM
    }
    camera.updateProjectionMatrix()
    invalidate()
    renderScheduler.requestFrame('camera:move')
  }, [camera, invalidate, target])

  return (
    <OrbitControls
      dampingFactor={0.08}
      enableDamping
      makeDefault
      maxDistance={900}
      minDistance={30}
      target={target}
    />
  )
}

function createPascalWaterSceneGraph(): {
  sceneGraph: SceneGraph
  waterNode: PascalWaterNode
} {
  const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
  const waterNode = PascalWaterNode.parse({
    name: 'Pascal Water',
    parentId: PASCAL_WATER_LEVEL_ID,
    planeSize: WATER_PLANE_SIZE,
    perimeter: {
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
      points: [...island.perimeter.points],
    },
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    elevationParameters: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
    materialParameters: {
      ...LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
      depthExponent: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthExponent,
      depthNoiseFrequency: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseFrequency,
      depthNoiseStrength: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseStrength,
      depthReach: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthReach,
      edgeFadeDistance: WATER_LAB_DEFAULT_FIELD_PARAMETERS.edgeFadeDistance,
    } satisfies Partial<LandrushWaterBodySurfaceParameters>,
    terrainFieldResolution: 1024,
    metadata: {
      source: 'pascal-water-debug',
      waterLabSeed: island.seed,
    },
  })
  const sitePolygon: [number, number][] = island.perimeter.points
    .slice(0, -1)
    .map((point) => [point.x, point.z])
  const level: LevelNode & { camera?: unknown } = {
    object: 'node',
    id: PASCAL_WATER_LEVEL_ID,
    type: 'level',
    name: 'Pascal Water Level',
    parentId: PASCAL_WATER_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...PASCAL_WATER_CAMERA_POSITION],
      target: [...PASCAL_WATER_CAMERA_TARGET],
      zoom: PASCAL_WATER_CAMERA_ZOOM,
    },
    children: [waterNode.id],
    level: 0,
    metadata: { source: 'pascal-water-debug' },
  }

  return {
    waterNode,
    sceneGraph: {
      rootNodeIds: [PASCAL_WATER_SITE_ID],
      nodes: {
        [PASCAL_WATER_SITE_ID]: {
          object: 'node',
          id: PASCAL_WATER_SITE_ID,
          type: 'site',
          name: 'Pascal Water Site',
          parentId: null,
          visible: true,
          metadata: { source: 'pascal-water-debug' },
          polygon: {
            points: sitePolygon,
            type: 'polygon',
          },
          children: [PASCAL_WATER_BUILDING_ID],
        },
        [PASCAL_WATER_BUILDING_ID]: {
          object: 'node',
          id: PASCAL_WATER_BUILDING_ID,
          type: 'building',
          name: 'Pascal Water Context',
          parentId: PASCAL_WATER_SITE_ID,
          visible: true,
          metadata: { source: 'pascal-water-debug' },
          children: [PASCAL_WATER_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [PASCAL_WATER_LEVEL_ID]: level,
        [waterNode.id]: waterNode,
      },
    },
  }
}
