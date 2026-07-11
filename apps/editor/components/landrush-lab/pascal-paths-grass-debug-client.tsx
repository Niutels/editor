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
import { Suspense, useEffect, useMemo, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import type { LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { GRASS_FIELD_RESOLUTION } from './grass-field-texture'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GrassWaterLandLayers } from './grass-water-layers'
import { allocateParcels, type ParcelAllocationResult } from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  generateParcelEdgeStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
} from './parcel-streets'
import type { StylizedGrassGroundDebugMode } from './stylized-grass-ground-material'
import {
  generateWaterLabIsland,
  PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const PASCAL_PATHS_GRASS_SITE_ID = 'site_pascal-paths-grass-debug'
const PASCAL_PATHS_GRASS_BUILDING_ID = 'building_pascal-paths-grass-debug'
const PASCAL_PATHS_GRASS_LEVEL_ID = 'level_pascal-paths-grass-debug'
const PASCAL_PATHS_GRASS_CAMERA_POSITION = [88, 86, 94] as const
const PASCAL_PATHS_GRASS_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_PATHS_GRASS_CAMERA_ZOOM = 7.8
const PASCAL_PATHS_GRASS_CAMERA_MIN_ZOOM = 2.8
const PASCAL_PATHS_GRASS_CAMERA_REFERENCE_ASPECT = 1280 / 720
const PASCAL_PATHS_GRASS_CENTERLINE_LIFT_METERS = 0.14
const PASCAL_PATHS_GRASS_PREVIEW_FIELD_RESOLUTION = 64
const PASCAL_PATHS_GRASS_TEXTURE_TILE_METERS = 5
const PASCAL_PATHS_GRASS_DEBUG_BLADE_DENSITY = 4200
const PASCAL_PATHS_GRASS_DEBUG_BLADE_MOUNT_DELAY_MS = 800

// Mirrors LANDRUSH_ISLAND_PARCEL_PARAMETERS in landrush-island-client.tsx.
const PASCAL_PATHS_GRASS_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} as const

// Mirrors LANDRUSH_ISLAND_DIRT_ROAD_WIDTH_METERS in landrush-island-client.tsx.
const PASCAL_PATHS_GRASS_DIRT_ROAD_WIDTH_METERS =
  (DEFAULT_PARCEL_STREET_WIDTH_METERS +
    PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
    PARCEL_STREET_CURB_EXTRA_WIDTH_METERS) /
  2.35

// Mirrors LANDRUSH_ISLAND_GRASS_TUNING in landrush-island-client.tsx.
const PASCAL_PATHS_GRASS_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  colorPatchScale: 0.7,
  colorVariation: 0.5,
  density: PASCAL_PATHS_GRASS_DEBUG_BLADE_DENSITY,
  flutter: 0.28,
  gustScale: 0.5,
  heightNoiseScale: 0.15,
  heightVariation: 0.3,
  macroScale: 0.115,
  macroVariation: 0.48,
  projection: 0.74,
  scale: 1.18,
  treeSway: 0.7,
  turbulence: 0.28,
  windAngle: 45,
  windSpeed: 2,
  windStrength: 0.25,
} satisfies GrassBladeTuning

const EMPTY_PASCAL_PATHS_ROADS: readonly LandrushRoadSegment[] = []

declare global {
  interface Window {
    __LANDRUSH_PASCAL_PATHS_GRASS_DEBUG__?: {
      features: readonly string[]
      grassBladesVisible: boolean
      grassSurfacePointCount: number
      parcelCount: number
      pathCenterlinesVisible: boolean
      pathsVisible: boolean
      roadSegmentCount: number
      source: string
      stylizedGroundTexture: boolean
      stylizedGroundDebugMode: StylizedGrassGroundDebugMode
      stylizedGroundTextureReady: boolean
      waterNodeId: string
    }
  }
}

export function PascalPathsGrassDebugClient() {
  const scene = useMemo(createPascalPathsGrassScene, [])
  const { allocation, landSurface, roads, sceneGraph, waterNode } = scene
  const [showBlades, setShowBlades] = useState(true)
  const [bladeLayerMounted, setBladeLayerMounted] = useState(false)
  const [showPaths, setShowPaths] = useState(true)
  const [stylizedGround, setStylizedGround] = useState(true)
  const [stylizedGroundDebugMode, setStylizedGroundDebugMode] =
    useState<StylizedGrassGroundDebugMode>('final')
  const [showCenterlines, setShowCenterlines] = useState(false)
  const [groundTextureReady, setGroundTextureReady] = useState(false)
  const activeRoads = showPaths ? roads : EMPTY_PASCAL_PATHS_ROADS

  useEffect(() => {
    if (!showBlades) {
      setBladeLayerMounted(false)
      return
    }
    const timeoutId = window.setTimeout(
      () => setBladeLayerMounted(true),
      PASCAL_PATHS_GRASS_DEBUG_BLADE_MOUNT_DELAY_MS,
    )
    return () => window.clearTimeout(timeoutId)
  }, [showBlades])

  useEffect(() => {
    const viewer = useViewer.getState()

    window.__LANDRUSH_PASCAL_PATHS_GRASS_DEBUG__ = {
      features: [
        'pascal-viewer-canvas',
        'pascal-scene-store',
        'pascal-water-node',
        'landrush-island-parcel-allocation',
        'landrush-island-edge-streets',
        'grass-water-ground-field',
        'instanced-stylized-grass-blades',
        'stylized-ground-physical-path-ribbons',
      ],
      grassBladesVisible: true,
      grassSurfacePointCount: landSurface.grassSurfacePoints.length,
      parcelCount: allocation.parcels.length,
      pathCenterlinesVisible: false,
      pathsVisible: true,
      roadSegmentCount: roads.length,
      source: 'pascal-paths-grass-debug',
      stylizedGroundTexture: true,
      stylizedGroundDebugMode: 'final',
      stylizedGroundTextureReady: false,
      waterNodeId: waterNode.id,
    }
    useScene.getState().setScene(sceneGraph.nodes as never, sceneGraph.rootNodeIds as never)
    viewer.setProjectId('pascal-paths-grass-debug')
    viewer.setCameraMode('orthographic')
    viewer.setShowGrid(false)
    viewer.setShadows(false)
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: PASCAL_PATHS_GRASS_BUILDING_ID as never,
      levelId: PASCAL_PATHS_GRASS_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    renderScheduler.requestFrame('geometry:changed')

    return () => {
      delete window.__LANDRUSH_PASCAL_PATHS_GRASS_DEBUG__
      useScene.getState().unloadScene()
    }
  }, [allocation, landSurface, roads, sceneGraph, waterNode])

  useEffect(() => {
    const debugState = window.__LANDRUSH_PASCAL_PATHS_GRASS_DEBUG__
    if (debugState) {
      debugState.grassBladesVisible = showBlades && bladeLayerMounted
      debugState.pathCenterlinesVisible = showCenterlines
      debugState.pathsVisible = showPaths
      debugState.stylizedGroundTexture = stylizedGround
      debugState.stylizedGroundDebugMode = stylizedGroundDebugMode
      debugState.stylizedGroundTextureReady = groundTextureReady
    }
    renderScheduler.requestFrame('geometry:changed')
  }, [
    groundTextureReady,
    bladeLayerMounted,
    showBlades,
    showCenterlines,
    showPaths,
    stylizedGround,
    stylizedGroundDebugMode,
  ])

  return (
    <main
      className="h-screen w-screen overflow-hidden bg-[#0f1720]"
      data-landrush-pascal-paths-grass-debug
    >
      <Viewer
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        disablePostFx
        renderContext="viewer"
        rendererBackend="webgpu"
        selectionManager="custom"
        useBvh={false}
      >
        <PascalPathsGrassCameraRig />
        <Suspense fallback={null}>
          <GrassWaterLandLayers
            fieldResolution={PASCAL_PATHS_GRASS_PREVIEW_FIELD_RESOLUTION}
            finalFieldResolution={GRASS_FIELD_RESOLUTION}
            onStylizedGroundTextureReady={setGroundTextureReady}
            roads={activeRoads}
            showBlades={showBlades && bladeLayerMounted}
            showGround
            showTrees={false}
            stylizedGroundTexture={stylizedGround}
            stylizedGroundDebugMode={stylizedGroundDebugMode}
            stylizedGroundTextureWorldSizeMeters={PASCAL_PATHS_GRASS_TEXTURE_TILE_METERS}
            stylizedSceneLayout
            surface={landSurface}
            tuning={PASCAL_PATHS_GRASS_TUNING}
          />
        </Suspense>
        {showCenterlines ? (
          <PascalPathsCenterlineOverlay
            elevation={
              landSurface.grassSurfaceElevation + PASCAL_PATHS_GRASS_CENTERLINE_LIFT_METERS
            }
            roads={roads}
          />
        ) : null}
      </Viewer>
      <PascalPathsGrassPanel
        groundTextureReady={groundTextureReady}
        onShowBladesChange={setShowBlades}
        onShowCenterlinesChange={setShowCenterlines}
        onShowPathsChange={setShowPaths}
        onStylizedGroundChange={setStylizedGround}
        onStylizedGroundDebugModeChange={setStylizedGroundDebugMode}
        parcelCount={allocation.parcels.length}
        roadSegmentCount={roads.length}
        showBlades={showBlades}
        showCenterlines={showCenterlines}
        showPaths={showPaths}
        stylizedGround={stylizedGround}
        stylizedGroundDebugMode={stylizedGroundDebugMode}
      />
    </main>
  )
}

function PascalPathsGrassPanel({
  groundTextureReady,
  onShowBladesChange,
  onShowCenterlinesChange,
  onShowPathsChange,
  onStylizedGroundChange,
  onStylizedGroundDebugModeChange,
  parcelCount,
  roadSegmentCount,
  showBlades,
  showCenterlines,
  showPaths,
  stylizedGround,
  stylizedGroundDebugMode,
}: {
  groundTextureReady: boolean
  onShowBladesChange: (visible: boolean) => void
  onShowCenterlinesChange: (visible: boolean) => void
  onShowPathsChange: (visible: boolean) => void
  onStylizedGroundChange: (enabled: boolean) => void
  onStylizedGroundDebugModeChange: (mode: StylizedGrassGroundDebugMode) => void
  parcelCount: number
  roadSegmentCount: number
  showBlades: boolean
  showCenterlines: boolean
  showPaths: boolean
  stylizedGround: boolean
  stylizedGroundDebugMode: StylizedGrassGroundDebugMode
}) {
  return (
    <section className="pointer-events-auto absolute left-4 top-4 z-10 max-w-[calc(100vw-2rem)] rounded-lg border border-white/12 bg-slate-950/78 px-3 py-3 text-xs text-slate-100 shadow-2xl shadow-black/25 backdrop-blur">
      <div className="mb-2 font-medium uppercase tracking-[0.16em] text-slate-300">
        Paths &amp; Grass Lab
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <input
            checked={showPaths}
            className="size-3.5 accent-cyan-300"
            onChange={(event) => onShowPathsChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Dirt paths
        </label>
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <input
            checked={stylizedGround}
            className="size-3.5 accent-cyan-300"
            onChange={(event) => onStylizedGroundChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Stylized ground texture
        </label>
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <input
            checked={showBlades}
            className="size-3.5 accent-cyan-300"
            onChange={(event) => onShowBladesChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Grass blades
        </label>
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <input
            checked={showCenterlines}
            className="size-3.5 accent-cyan-300"
            onChange={(event) => onShowCenterlinesChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Path centerlines
        </label>
        <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
          Grass view
          <select
            className="min-w-24 rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
            onChange={(event) =>
              onStylizedGroundDebugModeChange(
                event.currentTarget.value as StylizedGrassGroundDebugMode,
              )
            }
            value={stylizedGroundDebugMode}
          >
            <option value="final">Final</option>
            <option value="macro">Macro</option>
            <option value="hierarchy">Hierarchy</option>
            <option value="footprint">Footprint</option>
          </select>
        </label>
      </div>
      <div className="mt-3 space-y-0.5 text-[10px] text-slate-400">
        <div>
          {roadSegmentCount} path segments · {parcelCount} parcels
        </div>
        <div>
          Ground texture:{' '}
          {stylizedGround ? (groundTextureReady ? 'final' : 'preview…') : 'flat field'}
        </div>
      </div>
    </section>
  )
}

function PascalPathsCenterlineOverlay({
  elevation,
  roads,
}: {
  elevation: number
  roads: readonly LandrushRoadSegment[]
}) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (const road of roads) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const start = road.points[index]
        const end = road.points[index + 1]
        if (!(start && end)) continue
        positions.push(start.x, elevation, start.z, end.x, elevation, end.z)
      }
    }
    const lineGeometry = new BufferGeometry()
    lineGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return lineGeometry
  }, [elevation, roads])

  useEffect(() => {
    renderScheduler.requestFrame('geometry:changed')
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  return (
    <lineSegments geometry={geometry} renderOrder={90}>
      <lineBasicMaterial color="#22d3ee" depthTest={false} opacity={0.9} transparent />
    </lineSegments>
  )
}

function PascalPathsGrassCameraRig() {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const size = useThree((state) => state.size)
  const target = useMemo(() => new Vector3(...PASCAL_PATHS_GRASS_CAMERA_TARGET), [])

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const responsiveZoom = Math.max(
      PASCAL_PATHS_GRASS_CAMERA_MIN_ZOOM,
      Math.min(
        PASCAL_PATHS_GRASS_CAMERA_ZOOM,
        PASCAL_PATHS_GRASS_CAMERA_ZOOM * (aspect / PASCAL_PATHS_GRASS_CAMERA_REFERENCE_ASPECT),
      ),
    )

    camera.position.set(...PASCAL_PATHS_GRASS_CAMERA_POSITION)
    camera.lookAt(target)
    if ('zoom' in camera && typeof camera.zoom === 'number') {
      camera.zoom = responsiveZoom
    }
    camera.updateProjectionMatrix()
    invalidate()
    renderScheduler.requestFrame('camera:move')
  }, [camera, invalidate, size.height, size.width, target])

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

function createPascalPathsGrassScene(): {
  allocation: ParcelAllocationResult
  landSurface: PascalWaterLandSurface
  roads: readonly LandrushRoadSegment[]
  sceneGraph: SceneGraph
  waterNode: PascalWaterNode
} {
  const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
  const shorelinePoints = createPascalWaterSmoothedPerimeter(island.perimeter.points)
  const landSurface = createPascalWaterLandSurface({
    elevationParameters: PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
    shorelinePoints,
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const allocation = allocateParcels(landSurface.grassSurfacePoints, {
    count: PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.parcelCount,
    maxEdges: PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.maxEdges,
    seed: `${island.seed}:world-parcels:${PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.parcelCount}`,
    shoreSetbackMeters: PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.shoreSetbackMeters,
    simplifyToleranceMeters: PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.simplifyToleranceMeters,
    splitJitter: PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.splitJitter,
    squareness: PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.squareness,
  })
  const streetNetwork = generateParcelEdgeStreets(allocation, {
    loopiness: 0,
    roadWidthMeters: PASCAL_PATHS_GRASS_DIRT_ROAD_WIDTH_METERS,
    seed: `${island.seed}:world-streets:${PASCAL_PATHS_GRASS_PARCEL_PARAMETERS.parcelCount}`,
  })
  const roads = streetNetwork.segments.map<LandrushRoadSegment>((segment) => {
    const start = segment.points[0] ?? { x: 0, z: 0 }
    const end = segment.points.at(-1) ?? start
    return {
      connectsParcelIds: [...segment.parcelIds],
      fromNodeId: pathsGrassRoadNodeId(start),
      id: `pascal-paths-grass-${segment.id}`,
      kind: 'spine',
      points: [...segment.points],
      r3fPoints: segment.points.map(
        (point) => [point.x, landSurface.grassSurfaceElevation, point.z] satisfies LandrushVec3,
      ),
      toNodeId: pathsGrassRoadNodeId(end),
      width: segment.width,
    }
  })
  const waterNode = PascalWaterNode.parse({
    name: 'Pascal Paths Grass Water',
    parentId: PASCAL_PATHS_GRASS_LEVEL_ID,
    planeSize: WATER_PLANE_SIZE,
    perimeter: {
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
      points: [...island.perimeter.points],
    },
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    elevationParameters: PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
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
      source: 'pascal-paths-grass-debug',
      waterLabSeed: island.seed,
    },
  })
  const sitePolygon: [number, number][] = island.perimeter.points
    .slice(0, -1)
    .map((point) => [point.x, point.z])
  const level: LevelNode & { camera?: unknown } = {
    object: 'node',
    id: PASCAL_PATHS_GRASS_LEVEL_ID,
    type: 'level',
    name: 'Pascal Paths Grass Level',
    parentId: PASCAL_PATHS_GRASS_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...PASCAL_PATHS_GRASS_CAMERA_POSITION],
      target: [...PASCAL_PATHS_GRASS_CAMERA_TARGET],
      zoom: PASCAL_PATHS_GRASS_CAMERA_ZOOM,
    },
    children: [waterNode.id],
    level: 0,
    metadata: { source: 'pascal-paths-grass-debug' },
  }

  return {
    allocation,
    landSurface,
    roads,
    waterNode,
    sceneGraph: {
      rootNodeIds: [PASCAL_PATHS_GRASS_SITE_ID],
      nodes: {
        [PASCAL_PATHS_GRASS_SITE_ID]: {
          object: 'node',
          id: PASCAL_PATHS_GRASS_SITE_ID,
          type: 'site',
          name: 'Pascal Paths Grass Site',
          parentId: null,
          visible: true,
          metadata: { source: 'pascal-paths-grass-debug' },
          polygon: {
            points: sitePolygon,
            type: 'polygon',
          },
          children: [PASCAL_PATHS_GRASS_BUILDING_ID],
        },
        [PASCAL_PATHS_GRASS_BUILDING_ID]: {
          object: 'node',
          id: PASCAL_PATHS_GRASS_BUILDING_ID,
          type: 'building',
          name: 'Pascal Paths Grass Context',
          parentId: PASCAL_PATHS_GRASS_SITE_ID,
          visible: true,
          metadata: { source: 'pascal-paths-grass-debug' },
          children: [PASCAL_PATHS_GRASS_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [PASCAL_PATHS_GRASS_LEVEL_ID]: level,
        [waterNode.id]: waterNode,
      },
    },
  }
}

function pathsGrassRoadNodeId(point: { x: number; z: number }) {
  return `paths-grass-road-${Math.round(point.x * 100)}-${Math.round(point.z * 100)}`
}
