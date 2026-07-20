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
import { Vector3 } from 'three'
import type { LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { allocateParcels, type ParcelAllocationResult } from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  generateParcelEdgeStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
} from './parcel-streets'
import {
  type CliffCameraBookmark,
  type CliffLandscapeDebugMode,
  type CliffLandscapeMetrics,
  type CliffLandscapeQuality,
  type CliffLandscapeRuntimeMetrics,
  ProceduralCliffLandscape,
} from './procedural-cliff-landscape'
import {
  generateWaterLabIsland,
  PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const CLIFF_SITE_ID = 'site_pascal-cliffs-vegetation-debug'
const CLIFF_BUILDING_ID = 'building_pascal-cliffs-vegetation-debug'
const CLIFF_LEVEL_ID = 'level_pascal-cliffs-vegetation-debug'
const CLIFF_DEFAULT_SEED = 1847
const CLIFF_STRESS_SEED = 90210
const CLIFF_CAMERA_REFERENCE_ASPECT = 1280 / 720

const CLIFF_CAMERA_BOOKMARKS: Record<
  CliffCameraBookmark,
  {
    position: readonly [number, number, number]
    target: readonly [number, number, number]
    zoom: number
  }
> = {
  design: { position: [86, 70, 96], target: [0, 3.8, 0], zoom: 7.25 },
  near: { position: [58, 42, 68], target: [-8, 4.8, 5], zoom: 10.2 },
  far: { position: [108, 112, 124], target: [0, 2.4, 0], zoom: 5.2 },
}

const CLIFF_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} as const

const CLIFF_ROAD_WIDTH_METERS =
  (DEFAULT_PARCEL_STREET_WIDTH_METERS +
    PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
    PARCEL_STREET_CURB_EXTRA_WIDTH_METERS) /
  2.35

declare global {
  interface Window {
    __LANDRUSH_PASCAL_CLIFFS_DEBUG__?: {
      camera: CliffCameraBookmark
      debugMode: CliffLandscapeDebugMode
      features: readonly string[]
      fieldContract: readonly string[]
      metrics: CliffLandscapeMetrics | null
      noPostBaseline: true
      quality: CliffLandscapeQuality
      runtime: CliffLandscapeRuntimeMetrics | null
      seed: number
      showCliffs: boolean
      showPaths: boolean
      showVegetation: boolean
      source: string
      waterNodeId: string
      windPaused: boolean
    }
  }
}

export function PascalCliffsVegetationDebugClient() {
  const scene = useMemo(createPascalCliffsScene, [])
  const { allocation, landSurface, roads, sceneGraph, waterNode } = scene
  const [cameraBookmark, setCameraBookmark] = useState<CliffCameraBookmark>('design')
  const [debugMode, setDebugMode] = useState<CliffLandscapeDebugMode>('final')
  const [metrics, setMetrics] = useState<CliffLandscapeMetrics | null>(null)
  const [quality, setQuality] = useState<CliffLandscapeQuality>('balanced')
  const [runtime, setRuntime] = useState<CliffLandscapeRuntimeMetrics | null>(null)
  const [seed, setSeed] = useState(CLIFF_DEFAULT_SEED)
  const [showCliffs, setShowCliffs] = useState(true)
  const [showPaths, setShowPaths] = useState(true)
  const [showVegetation, setShowVegetation] = useState(true)
  const [windPaused, setWindPaused] = useState(false)

  useEffect(() => {
    const viewer = useViewer.getState()
    const previous = {
      cameraMode: viewer.cameraMode,
      sceneTheme: viewer.sceneTheme,
      shadows: viewer.shadows,
      showGrid: viewer.showGrid,
    }

    useScene.getState().setScene(sceneGraph.nodes as never, sceneGraph.rootNodeIds as never)
    viewer.setProjectId('pascal-cliffs-vegetation-debug')
    viewer.setCameraMode('orthographic')
    viewer.setSceneTheme('mediterranean')
    viewer.setShowGrid(false)
    viewer.setShadows(true)
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: CLIFF_BUILDING_ID as never,
      levelId: CLIFF_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    renderScheduler.requestFrame('geometry:changed')

    return () => {
      delete window.__LANDRUSH_PASCAL_CLIFFS_DEBUG__
      useScene.getState().unloadScene()
      const currentViewer = useViewer.getState()
      currentViewer.setCameraMode(previous.cameraMode)
      currentViewer.setSceneTheme(previous.sceneTheme)
      currentViewer.setShadows(previous.shadows)
      currentViewer.setShowGrid(previous.showGrid)
    }
  }, [sceneGraph])

  useEffect(() => {
    window.__LANDRUSH_PASCAL_CLIFFS_DEBUG__ = {
      camera: cameraBookmark,
      debugMode,
      features: [
        'new-concentric-terrain-mesh',
        'new-terracotta-cliff-strata',
        'new-low-poly-rock-outcrops',
        'new-rooted-grass-wind',
        'new-shrub-habitat-field',
        'new-umbrella-pine-kit',
        'new-cypress-kit',
        'deterministic-seed-sweep',
        'fixed-camera-bookmarks',
        'no-post-baseline',
      ],
      fieldContract: [
        'world-xz coordinates',
        'macro relief and moisture',
        'road and rim clearances',
        'terrain height and habitat',
        'ground color and vegetation placement',
      ],
      metrics,
      noPostBaseline: true,
      quality,
      runtime,
      seed,
      showCliffs,
      showPaths,
      showVegetation,
      source: 'pascal-cliffs-vegetation-debug',
      waterNodeId: waterNode.id,
      windPaused,
    }
  }, [
    cameraBookmark,
    debugMode,
    metrics,
    quality,
    runtime,
    seed,
    showCliffs,
    showPaths,
    showVegetation,
    waterNode.id,
    windPaused,
  ])

  return (
    <main
      className="h-screen w-screen overflow-hidden bg-[#bdd6e8]"
      data-landrush-pascal-cliffs-vegetation-debug
    >
      <Viewer
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        disablePostFx
        renderContext="viewer"
        rendererBackend="webgpu"
        selectionManager="custom"
        useBvh={false}
      >
        <PascalCliffsCameraRig bookmark={cameraBookmark} />
        <Suspense fallback={null}>
          <ProceduralCliffLandscape
            debugMode={debugMode}
            onMetrics={setMetrics}
            onRuntimeMetrics={setRuntime}
            quality={quality}
            roads={roads}
            seed={seed}
            showCliffs={showCliffs}
            showPaths={showPaths}
            showVegetation={showVegetation}
            surface={landSurface}
            windPaused={windPaused}
          />
        </Suspense>
      </Viewer>
      <PascalCliffsPanel
        allocation={allocation}
        cameraBookmark={cameraBookmark}
        debugMode={debugMode}
        metrics={metrics}
        onCameraBookmarkChange={setCameraBookmark}
        onDebugModeChange={setDebugMode}
        onQualityChange={setQuality}
        onSeedChange={setSeed}
        onShowCliffsChange={setShowCliffs}
        onShowPathsChange={setShowPaths}
        onShowVegetationChange={setShowVegetation}
        onWindPausedChange={setWindPaused}
        quality={quality}
        roadCount={roads.length}
        runtime={runtime}
        seed={seed}
        showCliffs={showCliffs}
        showPaths={showPaths}
        showVegetation={showVegetation}
        windPaused={windPaused}
      />
    </main>
  )
}

function PascalCliffsPanel({
  allocation,
  cameraBookmark,
  debugMode,
  metrics,
  onCameraBookmarkChange,
  onDebugModeChange,
  onQualityChange,
  onSeedChange,
  onShowCliffsChange,
  onShowPathsChange,
  onShowVegetationChange,
  onWindPausedChange,
  quality,
  roadCount,
  runtime,
  seed,
  showCliffs,
  showPaths,
  showVegetation,
  windPaused,
}: {
  allocation: ParcelAllocationResult
  cameraBookmark: CliffCameraBookmark
  debugMode: CliffLandscapeDebugMode
  metrics: CliffLandscapeMetrics | null
  onCameraBookmarkChange: (bookmark: CliffCameraBookmark) => void
  onDebugModeChange: (mode: CliffLandscapeDebugMode) => void
  onQualityChange: (quality: CliffLandscapeQuality) => void
  onSeedChange: (seed: number) => void
  onShowCliffsChange: (visible: boolean) => void
  onShowPathsChange: (visible: boolean) => void
  onShowVegetationChange: (visible: boolean) => void
  onWindPausedChange: (paused: boolean) => void
  quality: CliffLandscapeQuality
  roadCount: number
  runtime: CliffLandscapeRuntimeMetrics | null
  seed: number
  showCliffs: boolean
  showPaths: boolean
  showVegetation: boolean
  windPaused: boolean
}) {
  return (
    <section className="pointer-events-auto absolute left-4 top-4 z-10 w-[286px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/18 bg-[#17251f]/88 px-3.5 py-3 text-xs text-stone-100 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="font-semibold uppercase tracking-[0.18em] text-[#d9e8c5]">
        Mediterranean Cliff Lab
      </div>
      <div className="mt-1 text-[10px] leading-4 text-stone-300/75">
        New terrain, cliffs, flora, and rooted wind. Post FX stays disabled.
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <PanelSelect
          label="Camera"
          onChange={(value) => onCameraBookmarkChange(value as CliffCameraBookmark)}
          options={[
            ['design', 'Design'],
            ['near', 'Near'],
            ['far', 'Far'],
          ]}
          value={cameraBookmark}
        />
        <PanelSelect
          label="View"
          onChange={(value) => onDebugModeChange(value as CliffLandscapeDebugMode)}
          options={[
            ['final', 'Final'],
            ['terrain', 'Relief'],
            ['habitat', 'Habitat'],
            ['cliffs', 'Strata'],
            ['wind', 'Wind'],
          ]}
          value={debugMode}
        />
        <PanelSelect
          label="Quality"
          onChange={(value) => onQualityChange(value as CliffLandscapeQuality)}
          options={[
            ['balanced', 'Balanced'],
            ['dense', 'Dense'],
          ]}
          value={quality}
        />
        <PanelSelect
          label="Seed"
          onChange={(value) => onSeedChange(Number(value))}
          options={[
            [String(CLIFF_DEFAULT_SEED), 'Hero 1847'],
            [String(CLIFF_STRESS_SEED), 'Stress 90210'],
          ]}
          value={String(seed)}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 pt-3">
        <PanelToggle checked={showPaths} label="Asphalt roads" onChange={onShowPathsChange} />
        <PanelToggle checked={showCliffs} label="Cliff strata" onChange={onShowCliffsChange} />
        <PanelToggle
          checked={showVegetation}
          label="Vegetation"
          onChange={onShowVegetationChange}
        />
        <PanelToggle checked={windPaused} label="Freeze wind" onChange={onWindPausedChange} />
      </div>

      <div className="mt-3 space-y-1 border-t border-white/10 pt-2.5 text-[10px] text-stone-300/75">
        <div className="flex justify-between gap-3">
          <span>Scene</span>
          <span>
            {roadCount} roads · {allocation.parcels.length} parcels
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Vegetation</span>
          <span>
            {metrics
              ? `${(metrics.grassInstances + metrics.shrubInstances).toLocaleString()} ground · ${metrics.pineTrees + metrics.cypressTrees} trees`
              : 'building…'}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Geometry</span>
          <span>
            {metrics
              ? `${(metrics.terrainTriangles + metrics.cliffTriangles).toLocaleString()} tris`
              : 'building…'}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Runtime</span>
          <span>
            {runtime
              ? `${Math.round(runtime.fps)} fps · ${runtime.drawCalls} calls · ${runtime.triangles.toLocaleString()} tris`
              : 'warming…'}
          </span>
        </div>
      </div>
    </section>
  )
}

function PanelSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: readonly (readonly [string, string])[]
  value: string
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.11em] text-stone-300/70">
      {label}
      <select
        className="rounded-md border border-white/12 bg-black/25 px-2 py-1.5 text-[11px] normal-case tracking-normal text-stone-100 outline-none"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function PanelToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-medium text-stone-200">
      <input
        checked={checked}
        className="size-3.5 accent-[#b7d06a]"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      {label}
    </label>
  )
}

function PascalCliffsCameraRig({ bookmark }: { bookmark: CliffCameraBookmark }) {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const size = useThree((state) => state.size)
  const config = CLIFF_CAMERA_BOOKMARKS[bookmark]
  const target = useMemo(() => new Vector3(...config.target), [config])

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const responsiveZoom = Math.max(
      2.8,
      Math.min(config.zoom, config.zoom * (aspect / CLIFF_CAMERA_REFERENCE_ASPECT)),
    )
    camera.position.set(...config.position)
    camera.lookAt(target)
    if ('zoom' in camera && typeof camera.zoom === 'number') camera.zoom = responsiveZoom
    camera.updateProjectionMatrix()
    invalidate()
    renderScheduler.requestFrame('camera:move')
  }, [camera, config, invalidate, size.height, size.width, target])

  return (
    <OrbitControls
      dampingFactor={0.075}
      enableDamping
      makeDefault
      maxDistance={900}
      minDistance={24}
      target={target}
    />
  )
}

function createPascalCliffsScene(): {
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
    count: CLIFF_PARCEL_PARAMETERS.parcelCount,
    maxEdges: CLIFF_PARCEL_PARAMETERS.maxEdges,
    seed: `${island.seed}:cliff-parcels:${CLIFF_PARCEL_PARAMETERS.parcelCount}`,
    shoreSetbackMeters: CLIFF_PARCEL_PARAMETERS.shoreSetbackMeters,
    simplifyToleranceMeters: CLIFF_PARCEL_PARAMETERS.simplifyToleranceMeters,
    splitJitter: CLIFF_PARCEL_PARAMETERS.splitJitter,
    squareness: CLIFF_PARCEL_PARAMETERS.squareness,
  })
  const streetNetwork = generateParcelEdgeStreets(allocation, {
    loopiness: 0,
    roadWidthMeters: CLIFF_ROAD_WIDTH_METERS,
    seed: `${island.seed}:cliff-streets:${CLIFF_PARCEL_PARAMETERS.parcelCount}`,
  })
  const roads = streetNetwork.segments.map<LandrushRoadSegment>((segment) => {
    const start = segment.points[0] ?? { x: 0, z: 0 }
    const end = segment.points.at(-1) ?? start
    return {
      connectsParcelIds: [...segment.parcelIds],
      fromNodeId: cliffRoadNodeId(start),
      id: `pascal-cliffs-${segment.id}`,
      kind: 'spine',
      points: [...segment.points],
      r3fPoints: segment.points.map(
        (point) => [point.x, landSurface.grassSurfaceElevation, point.z] satisfies LandrushVec3,
      ),
      toNodeId: cliffRoadNodeId(end),
      width: segment.width,
    }
  })
  const waterNode = PascalWaterNode.parse({
    name: 'Pascal Cliffs Sea',
    parentId: CLIFF_LEVEL_ID,
    planeSize: WATER_PLANE_SIZE,
    perimeter: {
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
      points: [...island.perimeter.points],
    },
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    elevationParameters: {
      ...PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
      edgeLiftMeters: 0,
      innerContourMeters: 0,
      outerContourMeters: 0,
    },
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
      source: 'pascal-cliffs-vegetation-debug',
      waterLabSeed: island.seed,
    },
  })
  const sitePolygon: [number, number][] = island.perimeter.points
    .slice(0, -1)
    .map((point) => [point.x, point.z])
  const designCamera = CLIFF_CAMERA_BOOKMARKS.design
  const level: LevelNode & { camera?: unknown } = {
    object: 'node',
    id: CLIFF_LEVEL_ID,
    type: 'level',
    name: 'Pascal Cliffs Vegetation Level',
    parentId: CLIFF_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...designCamera.position],
      target: [...designCamera.target],
      zoom: designCamera.zoom,
    },
    children: [],
    level: 0,
    metadata: { source: 'pascal-cliffs-vegetation-debug' },
  }

  return {
    allocation,
    landSurface,
    roads,
    waterNode,
    sceneGraph: {
      rootNodeIds: [CLIFF_SITE_ID],
      nodes: {
        [CLIFF_SITE_ID]: {
          object: 'node',
          id: CLIFF_SITE_ID,
          type: 'site',
          name: 'Pascal Cliffs Vegetation Site',
          parentId: null,
          visible: true,
          metadata: { source: 'pascal-cliffs-vegetation-debug' },
          polygon: { points: sitePolygon, type: 'polygon' },
          children: [CLIFF_BUILDING_ID],
        },
        [CLIFF_BUILDING_ID]: {
          object: 'node',
          id: CLIFF_BUILDING_ID,
          type: 'building',
          name: 'Pascal Cliffs Vegetation Context',
          parentId: CLIFF_SITE_ID,
          visible: true,
          metadata: { source: 'pascal-cliffs-vegetation-debug' },
          children: [CLIFF_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [CLIFF_LEVEL_ID]: level,
      },
    },
  }
}

function cliffRoadNodeId(point: { x: number; z: number }) {
  return `cliffs-road-${Math.round(point.x * 100)}-${Math.round(point.z * 100)}`
}
