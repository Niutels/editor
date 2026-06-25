'use client'

import { type LevelNode, PascalWaterNode, SlabNode, useScene } from '@pascal-app/core'
import {
  Editor,
  ItemsPanel,
  type SceneGraph,
  useEditor,
  useSidebarStore,
  useViewer,
} from '@pascal-app/editor'
import {
  createLandrushWaterBodyMaterial,
  createPascalWaterLandSurface,
  LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  type LandrushWaterBodySurfaceParameters,
  PASCAL_WATER_LOW_ELEVATION,
} from '@pascal-app/nodes'
import { Hammer, Layers, Package, Settings, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'
import {
  WaterLabClient,
  type WaterLabMaterialSliderConfig,
  type WaterLabMaterialToggleConfig,
} from './water-lab-client'
import {
  generateWaterLabIsland,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'
import { WATER_MATERIAL_SLIDERS } from './water-material-sliders'

const BODY_MATERIAL_SLIDERS = [
  ...WATER_MATERIAL_SLIDERS,
  { key: 'waveDepthSmooth', label: 'wave depth smooth', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyBehindRatio', label: 'behind body', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyBehindLagSeconds', label: 'behind lag', max: 2, min: 0, step: 0.01 },
  { key: 'waveBodyBehindWidth', label: 'behind width', max: 0.6, min: 0.005, step: 0.005 },
  { key: 'waveBodyBehindBrightness', label: 'behind brightness', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyAheadRatio', label: 'ahead body', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyAheadLagSeconds', label: 'ahead lag', max: 2, min: 0, step: 0.01 },
  { key: 'waveBodyAheadWidth', label: 'ahead width', max: 0.6, min: 0.005, step: 0.005 },
  { key: 'waveBodyAheadBrightness', label: 'ahead brightness', max: 1, min: 0, step: 0.01 },
  { key: 'waveSectorCount', label: 'clock count', max: 60, min: 1, step: 1 },
  { key: 'waveSectorTimeOffset', label: 'sector offset sec', max: 30, min: 5, step: 0.25 },
  { key: 'waveSectorRotationSpeed', label: 'sector spin', max: 4, min: 0, step: 0.01 },
] satisfies readonly WaterLabMaterialSliderConfig[]

const BODY_MATERIAL_TOGGLES = [
  { key: 'waveSectorEnabled', label: 'clock offsets' },
] satisfies readonly WaterLabMaterialToggleConfig[]

const BODY_MATERIAL_DEFAULTS = {
  ...LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  ripplesBreakupEnd: 0.61,
  ripplesBreakupFrequency: 0.02,
  ripplesBreakupStart: 0.06,
  waveBodyBehindRatio: 0.28,
  waveBodyBehindLagSeconds: 0.36,
  waveBodyBehindWidth: 0.12,
  waveBodyBehindBrightness: 0.69,
  waveBodyAheadRatio: 0.16,
  waveBodyAheadLagSeconds: 1.97,
  waveBodyAheadWidth: 0.6,
  waveBodyAheadBrightness: 0.51,
  waveDepthSmooth: 1,
  waveSectorCount: 1,
  waveSectorEnabled: 1,
  waveSectorRotationSpeed: 0,
  waveSectorTimeOffset: 5,
} satisfies LandrushWaterBodySurfaceParameters

const WATER_BODY_PASCAL_SITE_ID = 'site_water-body-build'
const WATER_BODY_PASCAL_BUILDING_ID = 'building_water-body-build'
const WATER_BODY_PASCAL_LEVEL_ID = 'level_water-body-build'
const WATER_BODY_BUILD_SURFACE_SLAB_ID = 'slab_water-body-build-surface'
const WATER_BODY_BUILD_CAMERA_POSITION = [76, 58, 82] as const
const WATER_BODY_BUILD_CAMERA_TARGET = [0, 0, 0] as const

const SIDEBAR_TABS = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
  },
  {
    id: 'items',
    label: 'Items',
    component: ItemsPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Package className="h-5 w-5" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Settings className="h-5 w-5" />,
  },
]

declare global {
  interface Window {
    __LANDRUSH_WATER_BODY_PASCAL_BUILD__?: {
      buildSurfaceSlabId: string
      features: readonly string[]
      nodeCount: number
      rootNodeIds: readonly string[]
      waterNodeId: string
    }
  }
}

export function WaterBodyLabClient() {
  const searchParams = useSearchParams()
  const initialBuildMode =
    searchParams.get('build') === '1' || searchParams.get('pascalBuild') === '1'
  const [buildMode, setBuildMode] = useState(initialBuildMode)
  const [buildLayerMounted, setBuildLayerMounted] = useState(initialBuildMode)

  const enterBuildMode = useCallback(() => {
    setBuildLayerMounted(true)
    setBuildMode(true)
  }, [])
  const exitBuildMode = useCallback(() => setBuildMode(false), [])
  const toggleBuildMode = buildMode ? exitBuildMode : enterBuildMode
  const ToggleIcon = buildMode ? X : Hammer
  const showStandaloneWaterLayer = !buildLayerMounted

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      <div
        className={`absolute inset-0 transition-opacity duration-300 ease-out ${
          showStandaloneWaterLayer
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        data-landrush-water-layer
      >
        <WaterLabClient
          key="water-body-defaults-v7"
          labTitle="Landrush water body lab"
          materialDefaults={BODY_MATERIAL_DEFAULTS}
          materialSliders={BODY_MATERIAL_SLIDERS}
          materialToggles={BODY_MATERIAL_TOGGLES}
          panelSubtitle="independent lagged body material"
          waterMaterialFactory={createLandrushWaterBodyMaterial}
        />
      </div>

      {buildLayerMounted ? (
        <div
          className="pointer-events-auto absolute inset-0 opacity-100 transition-opacity duration-300 ease-out"
          data-build-active={buildMode}
          data-landrush-build-layer
        >
          <WaterBodyPascalBuildClient active={buildMode} />
        </div>
      ) : null}

      <button
        aria-label={buildMode ? 'Return to water view' : 'Open build mode'}
        aria-pressed={buildMode}
        className="pointer-events-auto absolute top-3 left-1/2 z-[80] inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-slate-950/82 px-3 py-1.5 font-medium text-white text-xs shadow-xl backdrop-blur transition hover:border-white/38 hover:bg-slate-900"
        data-landrush-build-toggle
        onClick={toggleBuildMode}
        type="button"
      >
        <ToggleIcon className="size-3.5" aria-hidden />
        <span>{buildMode ? 'View' : 'Build'}</span>
      </button>
    </div>
  )
}

function WaterBodyPascalBuildClient({ active }: { active: boolean }) {
  const buildScene = useMemo(createWaterBodyPascalBuildSceneGraph, [])
  const handleLoad = useCallback(async () => buildScene.sceneGraph, [buildScene.sceneGraph])

  useEffect(() => {
    const editor = useEditor.getState()
    const scene = useScene.getState()

    if (!active) {
      scene.setReadOnly(true)
      if (editor.isFirstPersonMode) editor.setFirstPersonMode(false)
      editor.setPreviewMode(false)
      editor.setMode('select')
      editor.setTool(null)
      editor.setCatalogCategory(null)
      delete window.__LANDRUSH_WATER_BODY_PASCAL_BUILD__
      return () => {
        useScene.getState().setReadOnly(false)
      }
    }

    const viewer = useViewer.getState()
    const sidebar = useSidebarStore.getState()

    scene.setReadOnly(false)
    sidebar.setIsCollapsed(false)
    if (sidebar.width < 300) sidebar.setWidth(300)
    editor.setActiveSidebarPanel('site')
    editor.setFirstPersonMode(false)
    editor.setPreviewMode(false)
    editor.setViewMode('3d')
    editor.setPhase('structure')
    editor.setStructureLayer('elements')
    editor.setMode('build')
    editor.setTool('wall')
    editor.setCatalogCategory(null)
    viewer.setSelection({
      buildingId: WATER_BODY_PASCAL_BUILDING_ID as never,
      levelId: WATER_BODY_PASCAL_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    viewer.setCameraMode('perspective')
    viewer.setShading('rendered')
    viewer.setShowGrid(true)
    viewer.setShadows(true)
    viewer.setWallMode('up')

    window.__LANDRUSH_WATER_BODY_PASCAL_BUILD__ = {
      buildSurfaceSlabId: buildScene.buildSurfaceSlab.id,
      features: [
        'pascal-editor',
        'pascal-water-node',
        'same-water-body-material-defaults',
        'grass-plateau-aligned-to-level-zero',
        'invisible-build-surface-slab',
        'pascal-grid',
        'pascal-wall-tool',
        'pascal-panels',
      ],
      nodeCount: Object.keys(buildScene.sceneGraph.nodes).length,
      rootNodeIds: buildScene.sceneGraph.rootNodeIds,
      waterNodeId: buildScene.waterNode.id,
    }

    return () => {
      delete window.__LANDRUSH_WATER_BODY_PASCAL_BUILD__
    }
  }, [active, buildScene])

  return (
    <main className="h-full w-full overflow-hidden bg-sidebar text-foreground">
      <Editor
        layoutVersion="v2"
        onLoad={handleLoad}
        projectId="landrush-water-body-build"
        sidebarTabs={SIDEBAR_TABS}
        viewerPostProcessing={false}
        viewerRendererBackend="webgpu"
        showEditorChrome={active}
        viewerToolbarLeft={<CommunityViewerToolbarLeft />}
        viewerToolbarRight={<CommunityViewerToolbarRight />}
        viewerUseBvh={false}
      />
    </main>
  )
}

function createWaterBodyPascalBuildSceneGraph(): {
  buildSurfaceSlab: SlabNode
  sceneGraph: SceneGraph
  waterNode: PascalWaterNode
} {
  const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
  const shorelinePoints = [...island.perimeter.points]
  const landSurface = createPascalWaterLandSurface({
    elevationParameters: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
    shorelinePoints,
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const waterNode = PascalWaterNode.parse({
    name: 'Water Body Island',
    parentId: WATER_BODY_PASCAL_LEVEL_ID,
    planeSize: WATER_PLANE_SIZE,
    position: [0, -landSurface.grassSurfaceElevation, 0],
    perimeter: {
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
      points: shorelinePoints,
    },
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    elevationParameters: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
    materialParameters: {
      ...BODY_MATERIAL_DEFAULTS,
      depthExponent: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthExponent,
      depthNoiseFrequency: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseFrequency,
      depthNoiseStrength: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseStrength,
      depthReach: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthReach,
      edgeFadeDistance: WATER_LAB_DEFAULT_FIELD_PARAMETERS.edgeFadeDistance,
    } satisfies Partial<LandrushWaterBodySurfaceParameters>,
    terrainFieldResolution: 1024,
    metadata: {
      source: 'water-body-pascal-build',
      waterLabSeed: island.seed,
    },
  })
  const buildSurfacePoints = openRing(landSurface.grassSurfacePoints)
  const buildSurfaceSlab = SlabNode.parse({
    id: WATER_BODY_BUILD_SURFACE_SLAB_ID,
    name: 'Water body island build surface',
    parentId: WATER_BODY_PASCAL_LEVEL_ID,
    visible: false,
    polygon: buildSurfacePoints.map((point) => [point.x, point.z]),
    elevation: 0.05,
    metadata: {
      role: 'island-build-surface',
      source: 'water-body-pascal-build',
      waterNodePositionY: waterNode.position[1],
      waterPlateauElevation:
        PASCAL_WATER_LOW_ELEVATION + WATER_LAB_DEFAULT_ELEVATION_PARAMETERS.edgeLiftMeters,
    },
  })
  const sitePolygon = openRing(shorelinePoints).map((point) => [point.x, point.z])
  const level: LevelNode & { camera?: unknown } = {
    object: 'node',
    id: WATER_BODY_PASCAL_LEVEL_ID,
    type: 'level',
    name: 'Water Body Build Level',
    parentId: WATER_BODY_PASCAL_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'perspective',
      position: [...WATER_BODY_BUILD_CAMERA_POSITION],
      target: [...WATER_BODY_BUILD_CAMERA_TARGET],
    },
    children: [waterNode.id, buildSurfaceSlab.id],
    level: 0,
    metadata: { source: 'water-body-pascal-build' },
  }

  return {
    buildSurfaceSlab,
    waterNode,
    sceneGraph: {
      rootNodeIds: [WATER_BODY_PASCAL_SITE_ID],
      nodes: {
        [WATER_BODY_PASCAL_SITE_ID]: {
          object: 'node',
          id: WATER_BODY_PASCAL_SITE_ID,
          type: 'site',
          name: 'Water Body Island Site',
          parentId: null,
          visible: true,
          metadata: { source: 'water-body-pascal-build' },
          polygon: {
            points: sitePolygon,
            type: 'polygon',
          },
          children: [WATER_BODY_PASCAL_BUILDING_ID],
        },
        [WATER_BODY_PASCAL_BUILDING_ID]: {
          object: 'node',
          id: WATER_BODY_PASCAL_BUILDING_ID,
          type: 'building',
          name: 'Water Body Build Context',
          parentId: WATER_BODY_PASCAL_SITE_ID,
          visible: true,
          metadata: { source: 'water-body-pascal-build' },
          children: [WATER_BODY_PASCAL_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [WATER_BODY_PASCAL_LEVEL_ID]: level,
        [waterNode.id]: waterNode,
        [buildSurfaceSlab.id]: buildSurfaceSlab,
      },
    },
  }
}

function openRing<Point extends { x: number; z: number }>(points: readonly Point[]) {
  if (points.length > 1) {
    const first = points[0]!
    const last = points[points.length - 1]!
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.001) return points.slice(0, -1)
  }
  return [...points]
}
