'use client'

import { type LevelNode, type SceneGraph, useScene } from '@pascal-app/core'
import {
  createPascalWaterLandSurface,
  createPascalWaterSmoothedPerimeter,
  type PascalWaterLandSurface,
} from '@pascal-app/nodes'
import { renderScheduler, useViewer, Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { type Dispatch, type SetStateAction, Suspense, useEffect, useMemo, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import type { LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { GRASS_FIELD_RESOLUTION } from './grass-field-texture'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GrassWaterLandLayers } from './grass-water-layers'
import {
  createDefaultNaturalWaterParameters,
  NaturalAnimatedWater,
  type NaturalWaterDebugMode,
  type NaturalWaterParameters,
  type NaturalWaterQuality,
} from './natural-animated-water'
import { NaturalRoadDebugPanel, NaturalRoadGpuTimestampProbe } from './natural-road-debug-panel'
import {
  createNaturalRoadMaskSegments,
  createNaturalRoadPlan,
  type NaturalRoadDebugMode,
  NaturalRoadNetworkLayer,
  type NaturalRoadQuality,
  type NaturalRoadSeed,
} from './natural-road-network-layer'
import { allocateParcels, type ParcelAllocationResult } from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  generateParcelEdgeStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
} from './parcel-streets'
import {
  StandaloneOceanCamera,
  type StandaloneOceanCameraPreset,
  type StandaloneOceanQuality,
  StandaloneOceanWorld,
} from './standalone-ocean-client'
import {
  createDefaultStandaloneOceanParameters,
  type StandaloneOceanDebugMode,
  type StandaloneOceanParameters,
  type StandaloneOceanWaveBandParameters,
} from './standalone-ocean-material'
import type { StylizedGrassGroundDebugMode } from './stylized-grass-ground-material'
import { STYLIZED_PATH_WIDTH_SCALE } from './stylized-path-network-layer'
import {
  generateWaterLabIsland,
  PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
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
const PASCAL_PATHS_GRASS_STANDALONE_OCEAN_ISLAND_LIFT_METERS = 0.36
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

const PASCAL_PATHS_OCEAN_EFFECT_TOGGLES = [
  { key: 'wavesEnabled', label: 'Waves' },
  { key: 'choppinessEnabled', label: 'Chop' },
  { key: 'foamEnabled', label: 'Foam' },
  { key: 'toonEnabled', label: 'Toon' },
  { key: 'reflectionEnabled', label: 'Reflect' },
  { key: 'fresnelEnabled', label: 'Fresnel' },
  { key: 'glintsEnabled', label: 'Glints' },
  { key: 'hazeEnabled', label: 'Haze' },
  { key: 'glareEnabled', label: 'Glare' },
  { key: 'skyEnabled', label: 'Sky' },
] as const

const PASCAL_PATHS_OCEAN_WAVE_BAND_LABELS = [
  'Primary swell',
  'Cross swell',
  'Mid waves',
  'Short waves',
  'Ripples',
  'Micro waves',
] as const

declare global {
  interface Window {
    __LANDRUSH_PASCAL_PATHS_GRASS_DEBUG__?: {
      features: readonly string[]
      grassBladesVisible: boolean
      grassSurfacePointCount: number
      naturalWaterDebugMode: NaturalWaterDebugMode | null
      naturalWaterQuality: NaturalWaterQuality | null
      naturalWaterVisible: boolean
      naturalRoadDebugMode: NaturalRoadDebugMode | null
      naturalRoadQuality: NaturalRoadQuality | null
      naturalRoadRouteLengthMeters: number | null
      naturalRoadSeed: NaturalRoadSeed | null
      parcelCount: number
      pathCenterlinesVisible: boolean
      pathsVisible: boolean
      roadSegmentCount: number
      roadVariant: PascalPathsGrassRoadVariant
      sceneGpuFrameMs: number | null
      source: string
      standaloneOceanDebugMode: StandaloneOceanDebugMode | null
      standaloneOceanQuality: StandaloneOceanQuality | null
      standaloneOceanVisible: boolean
      stylizedGroundTexture: boolean
      stylizedGroundDebugMode: StylizedGrassGroundDebugMode
      stylizedGroundTextureReady: boolean
    }
  }
}

export type PascalPathsGrassWaterVariant = 'natural-animated' | 'standalone-ocean'
export type PascalPathsGrassRoadVariant = 'natural-road' | 'parcel-paths'

export function PascalPathsGrassDebugClient({
  roadVariant = 'parcel-paths',
  waterVariant = 'standalone-ocean',
}: {
  roadVariant?: PascalPathsGrassRoadVariant
  waterVariant?: PascalPathsGrassWaterVariant
} = {}) {
  const naturalWater = waterVariant === 'natural-animated'
  const naturalRoad = roadVariant === 'natural-road'
  const source = naturalWater
    ? 'pascal-paths-natural-water'
    : naturalRoad
      ? 'pascal-natural-roads-debug'
      : 'pascal-paths-grass-debug'
  const [naturalWaterParameters, setNaturalWaterParameters] = useState(
    createDefaultNaturalWaterParameters,
  )
  const scene = useMemo(
    () =>
      createPascalPathsGrassScene(naturalWater, naturalWaterParameters.plateauHeight, roadVariant),
    [naturalWater, naturalWaterParameters.plateauHeight, roadVariant],
  )
  const { allocation, landSurface, roads: parcelRoads, sceneGraph } = scene
  const [showBlades, setShowBlades] = useState(true)
  const [bladeLayerMounted, setBladeLayerMounted] = useState(false)
  const [showPaths, setShowPaths] = useState(true)
  const [stylizedGround, setStylizedGround] = useState(true)
  const [stylizedGroundDebugMode, setStylizedGroundDebugMode] =
    useState<StylizedGrassGroundDebugMode>('final')
  const [showCenterlines, setShowCenterlines] = useState(false)
  const [groundTextureReady, setGroundTextureReady] = useState(false)
  const [animateWater, setAnimateWater] = useState(true)
  const [standaloneOceanParameters, setStandaloneOceanParameters] = useState(
    createDefaultStandaloneOceanParameters,
  )
  const [standaloneOceanDebugMode, setStandaloneOceanDebugMode] =
    useState<StandaloneOceanDebugMode>('final')
  const [standaloneOceanQuality, setStandaloneOceanQuality] =
    useState<StandaloneOceanQuality>('balanced')
  const [standaloneOceanResetRevision, setStandaloneOceanResetRevision] = useState(0)
  const [naturalWaterDebugMode, setNaturalWaterDebugMode] = useState<NaturalWaterDebugMode>('final')
  const [naturalWaterQuality, setNaturalWaterQuality] = useState<NaturalWaterQuality>('balanced')
  const [naturalWaterResetRevision, setNaturalWaterResetRevision] = useState(0)
  const [naturalRoadSeed, setNaturalRoadSeed] = useState<NaturalRoadSeed>('cala')
  const [naturalRoadQuality, setNaturalRoadQuality] = useState<NaturalRoadQuality>('high')
  const [naturalRoadDebugMode, setNaturalRoadDebugMode] = useState<NaturalRoadDebugMode>('final')
  const [standaloneOceanCameraPreset, setStandaloneOceanCameraPreset] =
    useState<StandaloneOceanCameraPreset>('design')
  const [sceneGpuFrameMs, setSceneGpuFrameMs] = useState<number | null | undefined>(undefined)
  const naturalRoadPlan = useMemo(
    () =>
      naturalRoad
        ? createNaturalRoadPlan({
            elevation: landSurface.grassSurfaceElevation,
            perimeter: landSurface.grassSurfacePoints,
            quality: naturalRoadQuality,
            roads: parcelRoads,
            seed: naturalRoadSeed,
          })
        : null,
    [
      landSurface.grassSurfaceElevation,
      landSurface.grassSurfacePoints,
      naturalRoad,
      naturalRoadQuality,
      naturalRoadSeed,
      parcelRoads,
    ],
  )
  const naturalRoadMaskRoads = useMemo(
    () =>
      naturalRoadPlan
        ? createNaturalRoadMaskSegments(naturalRoadPlan, 1 / STYLIZED_PATH_WIDTH_SCALE)
        : EMPTY_PASCAL_PATHS_ROADS,
    [naturalRoadPlan],
  )
  const roads = naturalRoad ? naturalRoadMaskRoads : parcelRoads
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
        'landrush-island-parcel-allocation',
        'grass-water-ground-field',
        'instanced-stylized-grass-blades',
        ...(naturalRoad
          ? [
              'original-parcel-path-road-topology',
              'boolean-unioned-road-intersections',
              'single-owner-junction-boundaries',
              'grade-following-stone-sidewalks',
              'low-profile-inner-and-outer-curbs',
              'junction-trimmed-road-markings',
              'shared-road-grass-clearance-mask',
            ]
          : ['landrush-island-edge-streets', 'stylized-ground-physical-path-ribbons']),
        ...(naturalWater
          ? [
              'natural-water-shared-sand-heightfield',
              'natural-water-shared-coastal-coordinate-field',
              'natural-water-depth-filtered-seabed',
              'natural-water-clear-animated-surface',
              'natural-water-six-band-directional-ocean',
              'natural-water-horizontal-choppy-displacement',
              'natural-water-jacobian-wave-foam',
              'natural-water-blender-ramp-foam-shader',
              'natural-water-stratified-foam-events',
              'natural-water-wave-linked-glints',
              'natural-water-analytic-additive-glare',
              'natural-water-shared-depth-warp',
            ]
          : [
              'standalone-ocean-explicit-surface',
              'standalone-ocean-twenty-four-mode-stochastic-spectrum',
              'standalone-ocean-shared-displacement-normal-field',
              'standalone-ocean-jacobian-crest-foam',
              'standalone-ocean-analytic-reflection-glints-glare',
              'standalone-ocean-single-draw-zero-render-targets',
            ]),
      ],
      grassBladesVisible: true,
      grassSurfacePointCount: landSurface.grassSurfacePoints.length,
      naturalWaterDebugMode: naturalWater ? 'final' : null,
      naturalWaterQuality: naturalWater ? 'balanced' : null,
      naturalWaterVisible: naturalWater,
      naturalRoadDebugMode: naturalRoad ? naturalRoadDebugMode : null,
      naturalRoadQuality: naturalRoad ? naturalRoadQuality : null,
      naturalRoadRouteLengthMeters: naturalRoadPlan?.metrics.routeLengthMeters ?? null,
      naturalRoadSeed: naturalRoad ? naturalRoadSeed : null,
      parcelCount: allocation.parcels.length,
      pathCenterlinesVisible: false,
      pathsVisible: true,
      roadSegmentCount: roads.length,
      roadVariant,
      sceneGpuFrameMs: null,
      source,
      standaloneOceanDebugMode: naturalWater ? null : 'final',
      standaloneOceanQuality: naturalWater ? null : 'balanced',
      standaloneOceanVisible: !naturalWater,
      stylizedGroundTexture: true,
      stylizedGroundDebugMode: 'final',
      stylizedGroundTextureReady: false,
    }
    useScene.getState().setScene(sceneGraph.nodes as never, sceneGraph.rootNodeIds as never)
    viewer.setProjectId(source)
    viewer.setCameraMode(naturalWater ? 'orthographic' : 'perspective')
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
  }, [
    allocation,
    landSurface,
    naturalRoad,
    naturalRoadDebugMode,
    naturalRoadPlan,
    naturalRoadQuality,
    naturalRoadSeed,
    naturalWater,
    roadVariant,
    roads,
    sceneGraph,
    source,
  ])

  useEffect(() => {
    const debugState = window.__LANDRUSH_PASCAL_PATHS_GRASS_DEBUG__
    if (debugState) {
      debugState.grassBladesVisible = showBlades && bladeLayerMounted
      debugState.pathCenterlinesVisible = showCenterlines
      debugState.pathsVisible = showPaths
      debugState.naturalRoadDebugMode = naturalRoad ? naturalRoadDebugMode : null
      debugState.naturalRoadQuality = naturalRoad ? naturalRoadQuality : null
      debugState.naturalRoadRouteLengthMeters = naturalRoadPlan?.metrics.routeLengthMeters ?? null
      debugState.naturalRoadSeed = naturalRoad ? naturalRoadSeed : null
      debugState.roadSegmentCount = roads.length
      debugState.roadVariant = roadVariant
      debugState.sceneGpuFrameMs = sceneGpuFrameMs ?? null
      debugState.stylizedGroundTexture = stylizedGround
      debugState.stylizedGroundDebugMode = stylizedGroundDebugMode
      debugState.stylizedGroundTextureReady = groundTextureReady
      debugState.naturalWaterDebugMode = naturalWater ? naturalWaterDebugMode : null
      debugState.naturalWaterQuality = naturalWater ? naturalWaterQuality : null
      debugState.standaloneOceanDebugMode = naturalWater ? null : standaloneOceanDebugMode
      debugState.standaloneOceanQuality = naturalWater ? null : standaloneOceanQuality
    }
    renderScheduler.requestFrame('geometry:changed')
  }, [
    groundTextureReady,
    naturalRoad,
    naturalRoadDebugMode,
    naturalRoadPlan,
    naturalRoadQuality,
    naturalRoadSeed,
    naturalWater,
    naturalWaterDebugMode,
    naturalWaterQuality,
    standaloneOceanDebugMode,
    standaloneOceanQuality,
    bladeLayerMounted,
    roadVariant,
    roads,
    sceneGpuFrameMs,
    showBlades,
    showCenterlines,
    showPaths,
    stylizedGround,
    stylizedGroundDebugMode,
  ])

  return (
    <main
      className={`h-screen w-screen overflow-hidden ${naturalWater ? 'bg-[#061c31]' : 'bg-[#0f1720]'}`}
      data-landrush-pascal-paths-grass-debug
      data-landrush-pascal-paths-natural-water={naturalWater || undefined}
      data-road-variant={roadVariant}
    >
      <Viewer
        antialias={!naturalWater}
        defaultCamera={naturalWater}
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        disablePostFx
        renderContext="viewer"
        rendererBackend="webgpu"
        selectionManager="custom"
        useBvh={false}
      >
        {naturalWater ? (
          <PascalPathsGrassCameraRig />
        ) : (
          <StandaloneOceanCamera preset={naturalRoad ? standaloneOceanCameraPreset : 'design'} />
        )}
        {naturalWater ? (
          <NaturalAnimatedWater
            animate={animateWater}
            debugMode={naturalWaterDebugMode}
            parameters={naturalWaterParameters}
            quality={naturalWaterQuality}
            resetRevision={naturalWaterResetRevision}
            surface={landSurface}
          />
        ) : (
          <StandaloneOceanWorld
            animated={animateWater}
            cameraPreset="design"
            debugMode={standaloneOceanDebugMode}
            parameters={standaloneOceanParameters}
            quality={standaloneOceanQuality}
            resetRevision={standaloneOceanResetRevision}
          />
        )}
        <group
          position={[
            0,
            naturalWater ? 0 : PASCAL_PATHS_GRASS_STANDALONE_OCEAN_ISLAND_LIFT_METERS,
            0,
          ]}
        >
          <Suspense fallback={null}>
            <GrassWaterLandLayers
              fieldResolution={PASCAL_PATHS_GRASS_PREVIEW_FIELD_RESOLUTION}
              finalFieldResolution={GRASS_FIELD_RESOLUTION}
              onStylizedGroundTextureReady={setGroundTextureReady}
              renderStylizedPathNetwork={!naturalRoad}
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
          {naturalRoadPlan ? (
            <NaturalRoadNetworkLayer
              debugMode={naturalRoadDebugMode}
              plan={naturalRoadPlan}
              renderOrder={30}
              visible={showPaths}
            />
          ) : null}
          {showCenterlines && !naturalRoad ? (
            <PascalPathsCenterlineOverlay
              elevation={
                landSurface.grassSurfaceElevation + PASCAL_PATHS_GRASS_CENTERLINE_LIFT_METERS
              }
              roads={roads}
            />
          ) : null}
        </group>
        {naturalRoad ? <NaturalRoadGpuTimestampProbe onSample={setSceneGpuFrameMs} /> : null}
      </Viewer>
      <PascalPathsGrassPanel
        animateWater={animateWater}
        groundTextureReady={groundTextureReady}
        naturalWater={naturalWater}
        naturalWaterDebugMode={naturalWaterDebugMode}
        naturalWaterParameters={naturalWaterParameters}
        naturalWaterQuality={naturalWaterQuality}
        naturalRoad={naturalRoad}
        onAnimateWaterChange={setAnimateWater}
        onNaturalWaterDebugModeChange={setNaturalWaterDebugMode}
        onNaturalWaterParametersChange={setNaturalWaterParameters}
        onNaturalWaterParametersReset={() => {
          setNaturalWaterParameters(createDefaultNaturalWaterParameters())
          setNaturalWaterResetRevision((revision) => revision + 1)
        }}
        onNaturalWaterQualityChange={setNaturalWaterQuality}
        onNaturalWaterReset={() => setNaturalWaterResetRevision((revision) => revision + 1)}
        onStandaloneOceanDebugModeChange={setStandaloneOceanDebugMode}
        onStandaloneOceanParametersChange={setStandaloneOceanParameters}
        onStandaloneOceanParametersReset={() => {
          setStandaloneOceanParameters(createDefaultStandaloneOceanParameters())
          setStandaloneOceanResetRevision((revision) => revision + 1)
        }}
        onStandaloneOceanQualityChange={setStandaloneOceanQuality}
        onStandaloneOceanReset={() => setStandaloneOceanResetRevision((revision) => revision + 1)}
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
        standaloneOceanDebugMode={standaloneOceanDebugMode}
        standaloneOceanParameters={standaloneOceanParameters}
        standaloneOceanQuality={standaloneOceanQuality}
        stylizedGround={stylizedGround}
        stylizedGroundDebugMode={stylizedGroundDebugMode}
      />
      {naturalRoadPlan ? (
        <NaturalRoadDebugPanel
          cameraPreset={standaloneOceanCameraPreset}
          debugMode={naturalRoadDebugMode}
          onCameraPresetChange={setStandaloneOceanCameraPreset}
          onDebugModeChange={setNaturalRoadDebugMode}
          onQualityChange={setNaturalRoadQuality}
          onSeedChange={setNaturalRoadSeed}
          plan={naturalRoadPlan}
          quality={naturalRoadQuality}
          sceneGpuFrameMs={sceneGpuFrameMs}
          seed={naturalRoadSeed}
        />
      ) : null}
    </main>
  )
}

function PascalPathsGrassPanel({
  animateWater,
  groundTextureReady,
  naturalWater,
  naturalWaterDebugMode,
  naturalWaterParameters,
  naturalWaterQuality,
  naturalRoad,
  onAnimateWaterChange,
  onNaturalWaterDebugModeChange,
  onNaturalWaterParametersChange,
  onNaturalWaterParametersReset,
  onNaturalWaterQualityChange,
  onNaturalWaterReset,
  onStandaloneOceanDebugModeChange,
  onStandaloneOceanParametersChange,
  onStandaloneOceanParametersReset,
  onStandaloneOceanQualityChange,
  onStandaloneOceanReset,
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
  standaloneOceanDebugMode,
  standaloneOceanParameters,
  standaloneOceanQuality,
  stylizedGround,
  stylizedGroundDebugMode,
}: {
  animateWater: boolean
  groundTextureReady: boolean
  naturalWater: boolean
  naturalWaterDebugMode: NaturalWaterDebugMode
  naturalWaterParameters: NaturalWaterParameters
  naturalWaterQuality: NaturalWaterQuality
  naturalRoad: boolean
  onAnimateWaterChange: (animated: boolean) => void
  onNaturalWaterDebugModeChange: (mode: NaturalWaterDebugMode) => void
  onNaturalWaterParametersChange: Dispatch<SetStateAction<NaturalWaterParameters>>
  onNaturalWaterParametersReset: () => void
  onNaturalWaterQualityChange: (quality: NaturalWaterQuality) => void
  onNaturalWaterReset: () => void
  onStandaloneOceanDebugModeChange: (mode: StandaloneOceanDebugMode) => void
  onStandaloneOceanParametersChange: Dispatch<SetStateAction<StandaloneOceanParameters>>
  onStandaloneOceanParametersReset: () => void
  onStandaloneOceanQualityChange: (quality: StandaloneOceanQuality) => void
  onStandaloneOceanReset: () => void
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
  standaloneOceanDebugMode: StandaloneOceanDebugMode
  standaloneOceanParameters: StandaloneOceanParameters
  standaloneOceanQuality: StandaloneOceanQuality
  stylizedGround: boolean
  stylizedGroundDebugMode: StylizedGrassGroundDebugMode
}) {
  function updateNaturalWaterParameter<Key extends keyof NaturalWaterParameters>(
    key: Key,
    value: NaturalWaterParameters[Key],
  ) {
    onNaturalWaterParametersChange((current) => ({ ...current, [key]: value }))
  }

  function updateStandaloneOceanParameter<Key extends keyof StandaloneOceanParameters>(
    key: Key,
    value: StandaloneOceanParameters[Key],
  ) {
    onStandaloneOceanParametersChange((current) => ({ ...current, [key]: value }))
  }

  function updateStandaloneOceanWaveBand<Key extends keyof StandaloneOceanWaveBandParameters>(
    index: number,
    key: Key,
    value: StandaloneOceanWaveBandParameters[Key],
  ) {
    onStandaloneOceanParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [key]: value } : band,
      ),
    }))
  }

  function soloStandaloneOceanWaveBand(index: number) {
    onStandaloneOceanParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) => ({
        ...band,
        enabled: bandIndex === index,
      })),
    }))
  }

  function resetStandaloneOceanWaveBand(index: number) {
    const defaultBand = createDefaultStandaloneOceanParameters().waveBands[index]
    if (!defaultBand) return
    onStandaloneOceanParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) =>
        bandIndex === index ? defaultBand : band,
      ),
    }))
  }

  return (
    <section
      className="pointer-events-auto absolute left-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-[19rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-white/12 bg-slate-950/78 px-3 py-3 text-xs text-slate-100 shadow-2xl shadow-black/25 backdrop-blur"
      data-natural-water-controls={naturalWater || undefined}
    >
      <div className="mb-2 font-medium uppercase tracking-[0.16em] text-slate-300">
        {naturalWater ? 'Natural Water Lab' : 'Island Spectral Ocean'}
      </div>
      <div className="flex flex-col gap-2">
        {!naturalWater ? (
          <div className="mb-1 flex flex-col gap-2 border-b border-white/10 pb-2">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
              <input
                checked={animateWater}
                className="size-3.5 accent-cyan-300"
                onChange={(event) => onAnimateWaterChange(event.currentTarget.checked)}
                type="checkbox"
              />
              Animate water
            </label>
            <div className="grid grid-cols-5 gap-1">
              {PASCAL_PATHS_OCEAN_EFFECT_TOGGLES.map((effect) => {
                const enabled = standaloneOceanParameters[effect.key]
                return (
                  <button
                    aria-pressed={enabled}
                    className={
                      enabled
                        ? 'rounded border border-cyan-100/60 bg-cyan-300 px-1 py-1 text-[8px] font-semibold uppercase text-slate-950'
                        : 'rounded border border-white/10 bg-white/[0.035] px-1 py-1 text-[8px] font-semibold uppercase text-slate-500'
                    }
                    key={effect.key}
                    onClick={() => updateStandaloneOceanParameter(effect.key, !enabled)}
                    type="button"
                  >
                    {effect.label}
                  </button>
                )
              })}
            </div>
            <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
              Water view
              <select
                className="min-w-24 rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
                onChange={(event) =>
                  onStandaloneOceanDebugModeChange(
                    event.currentTarget.value as StandaloneOceanDebugMode,
                  )
                }
                value={standaloneOceanDebugMode}
              >
                <option value="final">Final</option>
                <option value="no-glare">No glare</option>
                <option value="displacement">Displacement</option>
                <option value="compression">Compression</option>
                <option value="normals">Normals</option>
                <option value="foam">Foam</option>
                <option value="fresnel">Fresnel</option>
                <option value="reflection">Reflection</option>
                <option value="glints">Glints</option>
                <option value="glare">Glare</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
              Water quality
              <select
                className="min-w-24 rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
                onChange={(event) =>
                  onStandaloneOceanQualityChange(
                    event.currentTarget.value as StandaloneOceanQuality,
                  )
                }
                value={standaloneOceanQuality}
              >
                <option value="performance">Performance</option>
                <option value="balanced">Balanced</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <input
            checked={showPaths}
            className="size-3.5 accent-cyan-300"
            onChange={(event) => onShowPathsChange(event.currentTarget.checked)}
            type="checkbox"
          />
          {naturalRoad ? 'Natural road' : 'Dirt paths'}
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
        {!naturalRoad ? (
          <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
            <input
              checked={showCenterlines}
              className="size-3.5 accent-cyan-300"
              onChange={(event) => onShowCenterlinesChange(event.currentTarget.checked)}
              type="checkbox"
            />
            Path centerlines
          </label>
        ) : null}
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
        {!naturalWater ? (
          <div className="mt-1 flex flex-col gap-2 border-t border-white/10 pt-2">
            <details className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5" open>
              <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Ocean spectrum
              </summary>
              <div className="mt-2 flex flex-col gap-2.5">
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Wave scale"
                  max={8}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanWaveScale', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanWaveScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)}Ã—`}
                  label="Frequency scale"
                  max={3}
                  min={0.2}
                  onChange={(value) => updateStandaloneOceanParameter('oceanFrequencyScale', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanFrequencyScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Smallest wave"
                  max={4}
                  min={0.35}
                  onChange={(value) => updateStandaloneOceanParameter('oceanSmallestWave', value)}
                  step={0.05}
                  value={standaloneOceanParameters.oceanSmallestWave}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Choppiness"
                  max={2}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanChoppiness', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanChoppiness}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(1)} m/s`}
                  label="Wind velocity"
                  max={32}
                  min={1}
                  onChange={(value) => updateStandaloneOceanParameter('oceanWindVelocity', value)}
                  step={0.5}
                  value={standaloneOceanParameters.oceanWindVelocity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Alignment"
                  max={1}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanAlignment', value)}
                  step={0.001}
                  value={standaloneOceanParameters.oceanAlignment}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value)}Â°`}
                  label="Direction"
                  max={360}
                  min={0}
                  onChange={(value) =>
                    updateStandaloneOceanParameter('oceanDirectionDegrees', value)
                  }
                  step={1}
                  value={standaloneOceanParameters.oceanDirectionDegrees}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Damping"
                  max={1}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanDamping', value)}
                  step={0.001}
                  value={standaloneOceanParameters.oceanDamping}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)}Ã—`}
                  label="Global animation speed"
                  max={1.5}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanTimeScale', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanTimeScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Spectral spread"
                  max={1.5}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanSpectrumSpread', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanSpectrumSpread}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Crest curvature"
                  max={1.5}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanCrestCurvature', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanCrestCurvature}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Micro-surface detail"
                  max={1}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('oceanDetailStrength', value)}
                  step={0.01}
                  value={standaloneOceanParameters.oceanDetailStrength}
                />
              </div>
            </details>
            <details className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5" open>
              <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Six wave bands
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {standaloneOceanParameters.waveBands.map((band, index) => (
                  <StandaloneOceanBandControls
                    band={band}
                    index={index}
                    key={`island-ocean-wave-band-${index}`}
                    label={PASCAL_PATHS_OCEAN_WAVE_BAND_LABELS[index] ?? `Band ${index + 1}`}
                    onChange={updateStandaloneOceanWaveBand}
                    onReset={resetStandaloneOceanWaveBand}
                    onSolo={soloStandaloneOceanWaveBand}
                    open={index === 0}
                  />
                ))}
              </div>
            </details>
            <details className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5">
              <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Foam, light &amp; palette
              </summary>
              <div className="mt-2 flex flex-col gap-2.5">
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Foam coverage"
                  max={1}
                  min={-1}
                  onChange={(value) => updateStandaloneOceanParameter('waveFoamCoverage', value)}
                  step={0.01}
                  value={standaloneOceanParameters.waveFoamCoverage}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Foam opacity"
                  max={1}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('waveFoamOpacity', value)}
                  step={0.01}
                  value={standaloneOceanParameters.waveFoamOpacity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Reflection"
                  max={1}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('reflectionStrength', value)}
                  step={0.01}
                  value={standaloneOceanParameters.reflectionStrength}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Moving glints"
                  max={1}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('glintStrength', value)}
                  step={0.01}
                  value={standaloneOceanParameters.glintStrength}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Glare strength"
                  max={2}
                  min={0}
                  onChange={(value) => updateStandaloneOceanParameter('glareStrength', value)}
                  step={0.001}
                  value={standaloneOceanParameters.glareStrength}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NaturalWaterColorControl
                    label="Deep water"
                    onChange={(value) => updateStandaloneOceanParameter('deepColor', value)}
                    value={standaloneOceanParameters.deepColor}
                  />
                  <NaturalWaterColorControl
                    label="Shallow water"
                    onChange={(value) => updateStandaloneOceanParameter('shallowColor', value)}
                    value={standaloneOceanParameters.shallowColor}
                  />
                  <NaturalWaterColorControl
                    label="Ocean A"
                    onChange={(value) => updateStandaloneOceanParameter('oceanColorA', value)}
                    value={standaloneOceanParameters.oceanColorA}
                  />
                  <NaturalWaterColorControl
                    label="Ocean B"
                    onChange={(value) => updateStandaloneOceanParameter('oceanColorB', value)}
                    value={standaloneOceanParameters.oceanColorB}
                  />
                  <NaturalWaterColorControl
                    label="Foam"
                    onChange={(value) => updateStandaloneOceanParameter('foamColor', value)}
                    value={standaloneOceanParameters.foamColor}
                  />
                  <NaturalWaterColorControl
                    label="Glare tint"
                    onChange={(value) => updateStandaloneOceanParameter('glareTint', value)}
                    value={standaloneOceanParameters.glareTint}
                  />
                </div>
              </div>
            </details>
            <div className="grid grid-cols-3 gap-2">
              <button
                className="rounded border border-cyan-200/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-medium text-cyan-100 hover:bg-cyan-300/15"
                onClick={onStandaloneOceanParametersReset}
                type="button"
              >
                Reset design
              </button>
              <button
                className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-white/10"
                onClick={onStandaloneOceanReset}
                type="button"
              >
                Reset motion
              </button>
              <button
                className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-white/10"
                onClick={() =>
                  updateStandaloneOceanParameter('seed', standaloneOceanParameters.seed + 1)
                }
                type="button"
              >
                Next seed
              </button>
            </div>
          </div>
        ) : null}
        {naturalWater ? (
          <div className="mt-1 flex flex-col gap-2 border-t border-white/10 pt-2">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
              <input
                checked={animateWater}
                className="size-3.5 accent-cyan-300"
                onChange={(event) => onAnimateWaterChange(event.currentTarget.checked)}
                type="checkbox"
              />
              Animate water
            </label>
            <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
              Water view
              <select
                className="min-w-24 rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
                onChange={(event) =>
                  onNaturalWaterDebugModeChange(event.currentTarget.value as NaturalWaterDebugMode)
                }
                value={naturalWaterDebugMode}
              >
                <option value="final">Final</option>
                <option value="terrain">Terrain elevation</option>
                <option value="depth">True water depth</option>
                <option value="bands">Toon bands</option>
                <option value="opacity">Transparency</option>
                <option value="contour">Foam mask</option>
                <option value="foam-events">Foam event field</option>
                <option value="wave-foam">Ocean foam ramps</option>
                <option value="compression">Wave compression</option>
                <option value="displacement">XYZ displacement</option>
                <option value="glints">Moving glints</option>
                <option value="glare">Glare contribution</option>
                <option value="normals">Normals</option>
                <option value="warp">Depth warp</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
              Water quality
              <select
                className="min-w-24 rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
                onChange={(event) =>
                  onNaturalWaterQualityChange(event.currentTarget.value as NaturalWaterQuality)
                }
                value={naturalWaterQuality}
              >
                <option value="balanced">Balanced</option>
                <option value="high">High</option>
              </select>
            </label>
            <details className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5" open>
              <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Terrain field
              </summary>
              <div className="mt-2 flex flex-col gap-2.5">
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value)}`}
                  label="Seed"
                  max={99}
                  min={1}
                  onChange={(value) => updateNaturalWaterParameter('seed', Math.round(value))}
                  step={1}
                  value={naturalWaterParameters.seed}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `−${value.toFixed(1)} m`}
                  label="Maximum depth"
                  max={14}
                  min={6}
                  onChange={(value) =>
                    onNaturalWaterParametersChange((current) =>
                      naturalWaterParametersWithMaxDepth(current, value),
                    )
                  }
                  step={0.1}
                  value={naturalWaterParameters.maxDepth}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `+${value.toFixed(2)} m`}
                  label="Island plateau"
                  max={2}
                  min={1}
                  onChange={(value) => updateNaturalWaterParameter('plateauHeight', value)}
                  step={0.01}
                  value={naturalWaterParameters.plateauHeight}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(0)} m`}
                  label="Shore rise reach"
                  max={150}
                  min={30}
                  onChange={(value) => updateNaturalWaterParameter('shoreRiseDistance', value)}
                  step={1}
                  value={naturalWaterParameters.shoreRiseDistance}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Depth falloff"
                  max={2.4}
                  min={0.4}
                  onChange={(value) => updateNaturalWaterParameter('depthFalloff', value)}
                  step={0.02}
                  value={naturalWaterParameters.depthFalloff}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Broad relief"
                  max={3.5}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('macroRelief', value)}
                  step={0.02}
                  value={naturalWaterParameters.macroRelief}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Fine relief"
                  max={1.4}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('detailRelief', value)}
                  step={0.01}
                  value={naturalWaterParameters.detailRelief}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(0)} m`}
                  label="Seabed feature scale"
                  max={110}
                  min={24}
                  onChange={(value) => updateNaturalWaterParameter('seabedFeatureScale', value)}
                  step={1}
                  value={naturalWaterParameters.seabedFeatureScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Shelf step size"
                  max={2}
                  min={0.1}
                  onChange={(value) => updateNaturalWaterParameter('terraceStep', value)}
                  step={0.01}
                  value={naturalWaterParameters.terraceStep}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Shelf flatness"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('terraceStrength', value)}
                  step={0.01}
                  value={naturalWaterParameters.terraceStrength}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Outcrop coverage"
                  max={0.65}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('outcropCoverage', value)}
                  step={0.01}
                  value={naturalWaterParameters.outcropCoverage}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(0)} m`}
                  label="Outcrop scale"
                  max={80}
                  min={12}
                  onChange={(value) => updateNaturalWaterParameter('outcropScale', value)}
                  step={1}
                  value={naturalWaterParameters.outcropScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `±${value.toFixed(2)} m`}
                  label="Plateau variation"
                  max={0.75}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('plateauVariation', value)}
                  step={0.01}
                  value={naturalWaterParameters.plateauVariation}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Sand patch contrast"
                  max={1.5}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('sandPatchContrast', value)}
                  step={0.01}
                  value={naturalWaterParameters.sandPatchContrast}
                />
              </div>
            </details>
            <details className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5" open>
              <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Toon depth paint
              </summary>
              <div className="mt-2 flex flex-col gap-2.5">
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value)}`}
                  label="Blue levels"
                  max={6}
                  min={2}
                  onChange={(value) =>
                    updateNaturalWaterParameter('depthColorCount', Math.round(value))
                  }
                  step={1}
                  value={naturalWaterParameters.depthColorCount}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Band transition"
                  max={1.5}
                  min={0.02}
                  onChange={(value) =>
                    updateNaturalWaterParameter('depthTransitionSmoothness', value)
                  }
                  step={0.01}
                  value={naturalWaterParameters.depthTransitionSmoothness}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Seabed tint strength"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('depthTintStrength', value)}
                  step={0.01}
                  value={naturalWaterParameters.depthTintStrength}
                />
                {naturalWaterParameters.depthThresholds
                  .slice(0, naturalWaterParameters.depthColorCount - 1)
                  .map((threshold, index) => (
                    <NaturalWaterSlider
                      formatValue={(value) => `−${value.toFixed(2)} m`}
                      key={`natural-water-threshold-${index}`}
                      label={`Level ${index + 2} starts`}
                      max={
                        naturalWaterParameters.depthThresholds[index + 1] ??
                        naturalWaterParameters.maxDepth
                      }
                      min={
                        index === 0
                          ? 0.08
                          : (naturalWaterParameters.depthThresholds[index - 1] ?? 0) + 0.08
                      }
                      onChange={(value) =>
                        onNaturalWaterParametersChange((current) =>
                          naturalWaterParametersWithThreshold(current, index, value),
                        )
                      }
                      step={0.01}
                      value={threshold}
                    />
                  ))}
                <div>
                  <div className="mb-1 text-[10px] text-slate-400">Depth palette</div>
                  <div className="flex flex-wrap gap-1.5">
                    {naturalWaterParameters.depthColors
                      .slice(0, naturalWaterParameters.depthColorCount)
                      .map((depthColor, index) => (
                        <label
                          className="relative size-7 overflow-hidden rounded border border-white/20"
                          key={`natural-water-color-${index}`}
                          style={{ backgroundColor: depthColor }}
                          title={`Depth color ${index + 1}`}
                        >
                          <input
                            aria-label={`Depth color ${index + 1}`}
                            className="absolute inset-0 size-full cursor-pointer opacity-0"
                            onChange={(event) =>
                              onNaturalWaterParametersChange((current) =>
                                naturalWaterParametersWithColor(
                                  current,
                                  index,
                                  event.currentTarget.value,
                                ),
                              )
                            }
                            type="color"
                            value={depthColor}
                          />
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            </details>
            <details className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5" open>
              <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Ocean, foam &amp; glare
              </summary>
              <div className="mt-2 flex flex-col gap-2.5">
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Wave scale"
                  max={8}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('oceanWaveScale', value)}
                  step={0.01}
                  value={naturalWaterParameters.oceanWaveScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Smallest wave"
                  max={4}
                  min={0.35}
                  onChange={(value) => updateNaturalWaterParameter('oceanSmallestWave', value)}
                  step={0.05}
                  value={naturalWaterParameters.oceanSmallestWave}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Choppiness"
                  max={2}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('oceanChoppiness', value)}
                  step={0.01}
                  value={naturalWaterParameters.oceanChoppiness}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(1)} m/s`}
                  label="Wind velocity"
                  max={32}
                  min={1}
                  onChange={(value) => updateNaturalWaterParameter('oceanWindVelocity', value)}
                  step={0.5}
                  value={naturalWaterParameters.oceanWindVelocity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Alignment"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('oceanAlignment', value)}
                  step={0.001}
                  value={naturalWaterParameters.oceanAlignment}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value)}°`}
                  label="Direction"
                  max={360}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('oceanDirectionDegrees', value)}
                  step={1}
                  value={naturalWaterParameters.oceanDirectionDegrees}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Damping"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('oceanDamping', value)}
                  step={0.001}
                  value={naturalWaterParameters.oceanDamping}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)}×`}
                  label="Animation speed"
                  max={1.5}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('oceanTimeScale', value)}
                  step={0.01}
                  value={naturalWaterParameters.oceanTimeScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Shallow surface alpha"
                  max={0.2}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('shallowOpacity', value)}
                  step={0.01}
                  value={naturalWaterParameters.shallowOpacity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Deep surface alpha"
                  max={0.4}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('deepOpacity', value)}
                  step={0.01}
                  value={naturalWaterParameters.deepOpacity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Foam crest width"
                  max={1}
                  min={0.06}
                  onChange={(value) => updateNaturalWaterParameter('shoreContourWidth', value)}
                  step={0.01}
                  value={naturalWaterParameters.shoreContourWidth}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)} m`}
                  label="Water-side travel"
                  max={4}
                  min={0.2}
                  onChange={(value) => updateNaturalWaterParameter('shoreContourReach', value)}
                  step={0.05}
                  value={naturalWaterParameters.shoreContourReach}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Foam softness"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('shoreContourSoftness', value)}
                  step={0.01}
                  value={naturalWaterParameters.shoreContourSoftness}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Foam opacity"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('shoreContourOpacity', value)}
                  step={0.01}
                  value={naturalWaterParameters.shoreContourOpacity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Fog breakup"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('shoreContourBreakup', value)}
                  step={0.01}
                  value={naturalWaterParameters.shoreContourBreakup}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Independent fluctuation"
                  max={1}
                  min={0}
                  onChange={(value) =>
                    updateNaturalWaterParameter('shoreContourFluctuation', value)
                  }
                  step={0.01}
                  value={naturalWaterParameters.shoreContourFluctuation}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(2)}×`}
                  label="Foam cycle speed"
                  max={1.5}
                  min={0}
                  onChange={(value) =>
                    updateNaturalWaterParameter('shoreContourMotionSpeed', value)
                  }
                  step={0.01}
                  value={naturalWaterParameters.shoreContourMotionSpeed}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${value.toFixed(1)} m`}
                  label="Foam section length"
                  max={30}
                  min={4}
                  onChange={(value) => updateNaturalWaterParameter('shoreContourWispScale', value)}
                  step={0.5}
                  value={naturalWaterParameters.shoreContourWispScale}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(2)}
                  label="Wave foam coverage"
                  max={1}
                  min={-1}
                  onChange={(value) => updateNaturalWaterParameter('waveFoamCoverage', value)}
                  step={0.01}
                  value={naturalWaterParameters.waveFoamCoverage}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Wave foam opacity"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('waveFoamOpacity', value)}
                  step={0.01}
                  value={naturalWaterParameters.waveFoamOpacity}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Blue ramp position"
                  max={0.8}
                  min={0.05}
                  onChange={(value) => updateNaturalWaterParameter('foamColorRampPosition', value)}
                  step={0.001}
                  value={naturalWaterParameters.foamColorRampPosition}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="White ramp position"
                  max={0.8}
                  min={0.05}
                  onChange={(value) => updateNaturalWaterParameter('foamWhiteRampPosition', value)}
                  step={0.001}
                  value={naturalWaterParameters.foamWhiteRampPosition}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(1)}
                  label="Foam emission"
                  max={20}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('foamEmissionStrength', value)}
                  step={0.1}
                  value={naturalWaterParameters.foamEmissionStrength}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Moving glints"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('surfaceGlintStrength', value)}
                  step={0.01}
                  value={naturalWaterParameters.surfaceGlintStrength}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Glare strength"
                  max={2}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('glareStrength', value)}
                  step={0.001}
                  value={naturalWaterParameters.glareStrength}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Glare saturation"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('glareSaturation', value)}
                  step={0.001}
                  value={naturalWaterParameters.glareSaturation}
                />
                <NaturalWaterSlider
                  formatValue={(value) => value.toFixed(3)}
                  label="Glare size"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('glareSize', value)}
                  step={0.001}
                  value={naturalWaterParameters.glareSize}
                />
                <NaturalWaterSlider
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  label="Depth warp"
                  max={1}
                  min={0}
                  onChange={(value) => updateNaturalWaterParameter('surfaceWarpStrength', value)}
                  step={0.01}
                  value={naturalWaterParameters.surfaceWarpStrength}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NaturalWaterColorControl
                    label="Ocean A"
                    onChange={(value) => updateNaturalWaterParameter('oceanColorA', value)}
                    value={naturalWaterParameters.oceanColorA}
                  />
                  <NaturalWaterColorControl
                    label="Ocean B"
                    onChange={(value) => updateNaturalWaterParameter('oceanColorB', value)}
                    value={naturalWaterParameters.oceanColorB}
                  />
                  <NaturalWaterColorControl
                    label="Foam"
                    onChange={(value) => updateNaturalWaterParameter('foamColor', value)}
                    value={naturalWaterParameters.foamColor}
                  />
                  <NaturalWaterColorControl
                    label="Glare tint"
                    onChange={(value) => updateNaturalWaterParameter('glareTint', value)}
                    value={naturalWaterParameters.glareTint}
                  />
                </div>
              </div>
            </details>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded border border-cyan-200/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-medium text-cyan-100 hover:bg-cyan-300/15"
                onClick={onNaturalWaterParametersReset}
                type="button"
              >
                Reset design
              </button>
              <button
                className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-white/10"
                onClick={onNaturalWaterReset}
                type="button"
              >
                Reset motion
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-3 space-y-0.5 text-[10px] text-slate-400">
        <div>
          {roadSegmentCount} {naturalRoad ? 'road segments' : 'path segments'} · {parcelCount}{' '}
          parcels
        </div>
        <div>
          Ground texture:{' '}
          {stylizedGround ? (groundTextureReady ? 'final' : 'preview…') : 'flat field'}
        </div>
      </div>
    </section>
  )
}

function NaturalWaterSlider({
  formatValue,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  formatValue: (value: number) => string
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-3 text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-[9px] text-slate-300">{formatValue(value)}</span>
      </span>
      <input
        aria-label={label}
        className="block h-3 w-full accent-cyan-300"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

function NaturalWaterColorControl({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
      <span>{label}</span>
      <span
        className="relative size-7 overflow-hidden rounded border border-white/20"
        style={{ backgroundColor: value }}
      >
        <input
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => onChange(event.currentTarget.value)}
          type="color"
          value={value}
        />
      </span>
    </label>
  )
}

function StandaloneOceanBandControls({
  band,
  index,
  label,
  onChange,
  onReset,
  onSolo,
  open,
}: {
  band: StandaloneOceanWaveBandParameters
  index: number
  label: string
  onChange: <Key extends keyof StandaloneOceanWaveBandParameters>(
    index: number,
    key: Key,
    value: StandaloneOceanWaveBandParameters[Key],
  ) => void
  onReset: (index: number) => void
  onSolo: (index: number) => void
  open: boolean
}) {
  return (
    <details className="rounded border border-white/10 bg-slate-950/35 px-2 py-1.5" open={open}>
      <summary className="cursor-pointer select-none text-[10px] font-medium text-slate-300">
        {index + 1}. {label}
      </summary>
      <div className="mt-2 flex flex-col gap-2.5">
        <div className="grid grid-cols-3 gap-1">
          <button
            aria-pressed={band.enabled}
            className={
              band.enabled
                ? 'rounded border border-cyan-100/60 bg-cyan-300 px-1 py-1 text-[8px] font-semibold uppercase text-slate-950'
                : 'rounded border border-white/10 bg-white/[0.035] px-1 py-1 text-[8px] font-semibold uppercase text-slate-500'
            }
            onClick={() => onChange(index, 'enabled', !band.enabled)}
            type="button"
          >
            Band {band.enabled ? 'on' : 'off'}
          </button>
          <button
            className="rounded border border-white/10 bg-white/[0.035] px-1 py-1 text-[8px] font-semibold uppercase text-slate-300"
            onClick={() => onSolo(index)}
            type="button"
          >
            Solo
          </button>
          <button
            className="rounded border border-white/10 bg-white/[0.035] px-1 py-1 text-[8px] font-semibold uppercase text-slate-300"
            onClick={() => onReset(index)}
            type="button"
          >
            Reset
          </button>
        </div>
        <NaturalWaterSlider
          formatValue={(value) => `${value.toFixed(2)}Ã—`}
          label="Band speed"
          max={2}
          min={0}
          onChange={(value) => onChange(index, 'speed', value)}
          step={0.01}
          value={band.speed}
        />
        <NaturalWaterSlider
          formatValue={(value) => `${value.toFixed(2)}Ã—`}
          label="Amplitude"
          max={2.5}
          min={0}
          onChange={(value) => onChange(index, 'amplitude', value)}
          step={0.01}
          value={band.amplitude}
        />
        <NaturalWaterSlider
          formatValue={(value) => `${value.toFixed(2)}Ã—`}
          label="Frequency"
          max={3}
          min={0.1}
          onChange={(value) => onChange(index, 'frequency', value)}
          step={0.01}
          value={band.frequency}
        />
        <NaturalWaterSlider
          formatValue={(value) => value.toFixed(2)}
          label="Peak shape"
          max={4}
          min={1}
          onChange={(value) => onChange(index, 'shape', value)}
          step={0.01}
          value={band.shape}
        />
        <NaturalWaterSlider
          formatValue={(value) => `${value.toFixed(2)}Ã—`}
          label="Horizontal chop"
          max={2.5}
          min={0}
          onChange={(value) => onChange(index, 'choppiness', value)}
          step={0.01}
          value={band.choppiness}
        />
        <NaturalWaterSlider
          formatValue={(value) => `${Math.round(value)}Â°`}
          label="Direction trim"
          max={180}
          min={-180}
          onChange={(value) => onChange(index, 'directionOffsetDegrees', value)}
          step={1}
          value={band.directionOffsetDegrees}
        />
        <NaturalWaterSlider
          formatValue={(value) => `${Math.round(value)}Â°`}
          label="Phase"
          max={360}
          min={0}
          onChange={(value) => onChange(index, 'phaseDegrees', value)}
          step={1}
          value={band.phaseDegrees}
        />
      </div>
    </details>
  )
}

function naturalWaterParametersWithMaxDepth(
  parameters: NaturalWaterParameters,
  maxDepth: number,
): NaturalWaterParameters {
  const scale = maxDepth / Math.max(0.1, parameters.maxDepth)
  return {
    ...parameters,
    depthThresholds: normalizeNaturalWaterControlThresholds(
      parameters.depthThresholds.map((threshold) => threshold * scale),
      maxDepth,
    ),
    maxDepth,
  }
}

function naturalWaterParametersWithThreshold(
  parameters: NaturalWaterParameters,
  index: number,
  value: number,
): NaturalWaterParameters {
  const thresholds = [...parameters.depthThresholds]
  thresholds[index] = value
  return {
    ...parameters,
    depthThresholds: normalizeNaturalWaterControlThresholds(thresholds, parameters.maxDepth),
  }
}

function naturalWaterParametersWithColor(
  parameters: NaturalWaterParameters,
  index: number,
  value: string,
): NaturalWaterParameters {
  const depthColors = [...parameters.depthColors] as NaturalWaterParameters['depthColors']
  depthColors[index] = value
  return { ...parameters, depthColors }
}

function normalizeNaturalWaterControlThresholds(
  thresholds: readonly number[],
  maxDepth: number,
): NaturalWaterParameters['depthThresholds'] {
  const gap = Math.min(0.25, Math.max(0.08, maxDepth / 40))
  const normalized = [...thresholds]
  for (let index = 0; index < normalized.length; index += 1) {
    const previous = index === 0 ? 0 : (normalized[index - 1] ?? 0)
    const remaining = normalized.length - index - 1
    normalized[index] = Math.max(
      previous + gap,
      Math.min(maxDepth - remaining * gap, normalized[index] ?? previous + gap),
    )
  }
  return normalized as NaturalWaterParameters['depthThresholds']
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

function createPascalPathsGrassScene(
  naturalWater: boolean,
  naturalPlateauHeight: number,
  roadVariant: PascalPathsGrassRoadVariant,
): {
  allocation: ParcelAllocationResult
  landSurface: PascalWaterLandSurface
  roads: readonly LandrushRoadSegment[]
  sceneGraph: SceneGraph
} {
  const source = naturalWater
    ? 'pascal-paths-natural-water'
    : roadVariant === 'natural-road'
      ? 'pascal-natural-roads-debug'
      : 'pascal-paths-grass-debug'
  const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
  const shorelinePoints = createPascalWaterSmoothedPerimeter(island.perimeter.points)
  const elevationParameters = naturalWater
    ? {
        ...PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
        contourVariationMeters: 1.15,
        edgeLiftMeters: Math.max(1, Math.min(2, naturalPlateauHeight)),
        innerContourMeters: 5.4,
        outerContourMeters: 0.25,
      }
    : PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS
  const landSurface = createPascalWaterLandSurface({
    elevationParameters,
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
    children: [],
    level: 0,
    metadata: { source },
  }

  return {
    allocation,
    landSurface,
    roads,
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
          metadata: { source },
          polygon: {
            points: [],
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
          metadata: { source },
          children: [PASCAL_PATHS_GRASS_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [PASCAL_PATHS_GRASS_LEVEL_ID]: level,
      },
    },
  }
}

function pathsGrassRoadNodeId(point: { x: number; z: number }) {
  return `paths-grass-road-${Math.round(point.x * 100)}-${Math.round(point.z * 100)}`
}
