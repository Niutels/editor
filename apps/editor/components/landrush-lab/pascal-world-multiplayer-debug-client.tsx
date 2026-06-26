'use client'

import { type LevelNode, PascalWaterNode, type SceneGraph, useScene } from '@pascal-app/core'
import {
  createPascalWaterLandSurface,
  createPascalWaterSmoothedPerimeter,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type LandrushWaterSurfaceParameters,
  type PascalWaterLandSurface,
} from '@pascal-app/nodes'
import { renderScheduler, useViewer, Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, GRASS_SPAWN_FIELD_RESOLUTION } from './grass-field-texture'
import { GRASS_WATER_DEFAULT_TUNING } from './grass-water-defaults'
import { GrassWaterLandLayers } from './grass-water-layers'
import {
  generateWaterLabIsland,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const PASCAL_GRASS_WATER_SITE_ID = 'site_pascal-grass-water-debug'
const PASCAL_GRASS_WATER_BUILDING_ID = 'building_pascal-grass-water-debug'
const PASCAL_GRASS_WATER_LEVEL_ID = 'level_pascal-grass-water-debug'
const PASCAL_GRASS_WATER_CAMERA_POSITION = [88, 86, 94] as const
const PASCAL_GRASS_WATER_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_GRASS_WATER_CAMERA_ZOOM = 7.8

declare global {
  interface Window {
    __PASCAL_BENCH_ORBITING__?: boolean
    __LANDRUSH_WORLD_MULTIPLAYER_PASCAL_DEBUG__?: {
      features: readonly string[]
      grassSurfacePointCount: number
      nodeCount: number
      rootNodeIds: readonly string[]
      source: string
      waterNodeId: string
    }
  }
}

export function PascalWorldMultiplayerDebugClient() {
  const pascalGrassWaterScene = useMemo(createPascalGrassWaterSceneGraph, [])
  const { landSurface, sceneGraph, waterNode } = pascalGrassWaterScene
  const bladeSubdivisions = useMemo(
    () => resolveGrassWebGpuBladeSubdivisions(GRASS_WATER_DEFAULT_TUNING.density),
    [],
  )

  useEffect(() => {
    const viewer = useViewer.getState()

    window.__LANDRUSH_WORLD_MULTIPLAYER_PASCAL_DEBUG__ = {
      features: [
        'pascal-viewer-canvas',
        'pascal-scene-store',
        'pascal-water-node',
        'world-multiplayer-water-material',
        'grass-water-land-layers',
        'grass-water-ground-field',
        'grass-water-blades',
        'grass-water-trees',
      ],
      grassSurfacePointCount: landSurface.grassSurfacePoints.length,
      nodeCount: Object.keys(sceneGraph.nodes).length,
      rootNodeIds: sceneGraph.rootNodeIds,
      source: 'pascal-grass-water-debug',
      waterNodeId: waterNode.id,
    }
    useScene.getState().setScene(sceneGraph.nodes as never, sceneGraph.rootNodeIds as never)
    viewer.setProjectId('pascal-grass-water-debug')
    viewer.setCameraMode('orthographic')
    viewer.setShowGrid(false)
    viewer.setShadows(false)
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: PASCAL_GRASS_WATER_BUILDING_ID as never,
      levelId: PASCAL_GRASS_WATER_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    renderScheduler.requestFrame('geometry:changed')
    window.__PASCAL_BENCH_ORBITING__ = true

    return () => {
      delete window.__LANDRUSH_WORLD_MULTIPLAYER_PASCAL_DEBUG__
      delete window.__PASCAL_BENCH_ORBITING__
      useScene.getState().unloadScene()
    }
  }, [landSurface, sceneGraph, waterNode])

  return (
    <main
      className="h-screen w-screen overflow-hidden bg-[#0f1720]"
      data-landrush-pascal-grass-water-debug
    >
      <Viewer
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        postProcessing={false}
        renderContext="viewer"
        rendererBackend="webgpu"
        selectionManager="custom"
        useBvh={false}
      >
        <PascalGrassWaterCameraRig />
        <Suspense fallback={null}>
          <GrassWaterLandLayers
            bladeSubdivisions={bladeSubdivisions}
            fieldResolution={GRASS_FIELD_RESOLUTION}
            spawnResolution={GRASS_SPAWN_FIELD_RESOLUTION}
            surface={landSurface}
            tuning={GRASS_WATER_DEFAULT_TUNING}
          />
        </Suspense>
      </Viewer>
    </main>
  )
}

function PascalGrassWaterCameraRig() {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const target = useMemo(() => new Vector3(...PASCAL_GRASS_WATER_CAMERA_TARGET), [])

  useEffect(() => {
    camera.position.set(...PASCAL_GRASS_WATER_CAMERA_POSITION)
    camera.lookAt(target)
    if ('zoom' in camera && typeof camera.zoom === 'number') {
      camera.zoom = PASCAL_GRASS_WATER_CAMERA_ZOOM
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

function createPascalGrassWaterSceneGraph(): {
  landSurface: PascalWaterLandSurface
  sceneGraph: SceneGraph
  waterNode: PascalWaterNode
} {
  const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
  const shorelinePoints = createPascalWaterSmoothedPerimeter(island.perimeter.points)
  const landSurface = createPascalWaterLandSurface({
    elevationParameters: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
    shorelinePoints,
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const waterNode = PascalWaterNode.parse({
    name: 'Pascal Grass Water',
    parentId: PASCAL_GRASS_WATER_LEVEL_ID,
    planeSize: WATER_PLANE_SIZE,
    perimeter: {
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
      points: [...island.perimeter.points],
    },
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    elevationParameters: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
    materialParameters: {
      ...LANDRUSH_WATER_SURFACE_PARAMETERS,
      depthExponent: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthExponent,
      depthNoiseFrequency: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseFrequency,
      depthNoiseStrength: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseStrength,
      depthReach: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthReach,
      edgeFadeDistance: WATER_LAB_DEFAULT_FIELD_PARAMETERS.edgeFadeDistance,
    } satisfies Partial<LandrushWaterSurfaceParameters>,
    terrainFieldResolution: 1024,
    metadata: {
      source: 'pascal-grass-water-debug',
      waterLabSeed: island.seed,
    },
  })
  const sitePolygon: [number, number][] = island.perimeter.points
    .slice(0, -1)
    .map((point) => [point.x, point.z])
  const level: LevelNode & { camera?: unknown } = {
    object: 'node',
    id: PASCAL_GRASS_WATER_LEVEL_ID,
    type: 'level',
    name: 'Pascal Grass Water Level',
    parentId: PASCAL_GRASS_WATER_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...PASCAL_GRASS_WATER_CAMERA_POSITION],
      target: [...PASCAL_GRASS_WATER_CAMERA_TARGET],
      zoom: PASCAL_GRASS_WATER_CAMERA_ZOOM,
    },
    children: [waterNode.id],
    level: 0,
    metadata: { source: 'pascal-grass-water-debug' },
  }

  return {
    landSurface,
    waterNode,
    sceneGraph: {
      rootNodeIds: [PASCAL_GRASS_WATER_SITE_ID],
      nodes: {
        [PASCAL_GRASS_WATER_SITE_ID]: {
          object: 'node',
          id: PASCAL_GRASS_WATER_SITE_ID,
          type: 'site',
          name: 'Pascal Grass Water Site',
          parentId: null,
          visible: true,
          metadata: { source: 'pascal-grass-water-debug' },
          polygon: {
            points: sitePolygon,
            type: 'polygon',
          },
          children: [PASCAL_GRASS_WATER_BUILDING_ID],
        },
        [PASCAL_GRASS_WATER_BUILDING_ID]: {
          object: 'node',
          id: PASCAL_GRASS_WATER_BUILDING_ID,
          type: 'building',
          name: 'Pascal Grass Water Context',
          parentId: PASCAL_GRASS_WATER_SITE_ID,
          visible: true,
          metadata: { source: 'pascal-grass-water-debug' },
          children: [PASCAL_GRASS_WATER_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [PASCAL_GRASS_WATER_LEVEL_ID]: level,
        [waterNode.id]: waterNode,
      },
    },
  }
}
