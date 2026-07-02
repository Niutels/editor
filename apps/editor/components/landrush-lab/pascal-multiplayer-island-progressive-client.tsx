'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type LandrushLayoutNode,
  LandrushLayoutNode as LandrushLayoutNodeSchema,
  type LandrushWorldNode,
  LandrushWorldNode as LandrushWorldNodeSchema,
  type LevelNode,
  type PascalWaterNode,
  useScene,
} from '@pascal-app/core'
import {
  BVHEcctrl,
  type BVHEcctrlApi,
  buildFirstPersonColliderWorldFromRegistry,
  EDITOR_LAYER,
  Editor,
  type EditorCameraInitialPose,
  type FirstPersonColliderWorld,
  ItemsPanel,
  type SceneGraph,
  useEditor,
  useSidebarStore,
} from '@pascal-app/editor'
import {
  createPascalWaterLandSurface,
  createPascalWaterSmoothedPerimeter,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type LandrushWaterSurfaceParameters,
  type PascalWaterLandSurface,
} from '@pascal-app/nodes'
import {
  LANDRUSH_ROBOT_HOVER_RESPONSE,
  LandrushRobot,
  type LandrushRobotPresentationMode,
  resolveLandrushRobotHoverOffset,
} from '@pascal-app/nodes/landrush-world/robot'
import { renderScheduler, useViewer } from '@pascal-app/viewer'
import {
  Html,
  KeyboardControls,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  ChevronDown,
  ChevronRight,
  Hammer,
  Layers,
  Package,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import {
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  DoubleSide,
  type GridHelper,
  type Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh/src/index.js'
import type { LandrushPoint2, LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { FrameLoadProfilerProbe } from './frame-load-profiler'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, type GrassFieldBlocker } from './grass-field-texture'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import {
  allocateParcels,
  type ParcelAllocationOptions,
  type ParcelAllocationParcel,
  type ParcelAllocationResult,
  polygonCentroid,
} from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  generateParcelEdgeStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
  type ParcelStreetNetwork,
  type ParcelStreetSegment,
} from './parcel-streets'
import { GrassWaterLandLayers } from './progressive-grass-water-layers'
import type {
  ProgressiveIslandRevealState,
  StylizedGrassInteraction,
  StylizedGrassPerfProbe,
} from './progressive-stylized-scene-land-layers'
import { LandrushRobotFootstepAudio } from './robot-footstep-audio'
import {
  WATER_FIELD_PREVIEW_RESOLUTION,
  WATER_FIELD_RESOLUTION,
  type WaterFieldParameters,
} from './water-field-texture'
import {
  generateWaterLabIsland,
  type IslandElevationParameters,
  type LabSliderConfig,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  WATER_LAB_ISLAND_SLIDERS,
  type WaterLabIslandParameters,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'
import { WATER_MATERIAL_SLIDERS, type WaterMaterialSliderKey } from './water-material-sliders'
import {
  type ConnectionStatus,
  type LocalPlayerProfile,
  type MultiplayerPlayerSnapshot,
  MultiplayerStatusPanel,
  type ParcelBuildNodesSnapshot,
  type ParcelClaimError,
  type ParcelOwnership,
  readLocalPlayerProfile,
  sanitizeRoomId,
  useLandrushWorldMultiplayer,
} from './world-multiplayer-lab-client'

const PASCAL_WATER_SITE_ID = 'site_pascal-water-debug'
const PASCAL_WATER_BUILDING_ID = 'building_pascal-water-debug'
const PASCAL_WATER_LEVEL_ID = 'level_pascal-water-debug'
const PASCAL_WATER_NODE_ID = 'pascal-water_debug-water'
const PASCAL_WATER_LAYOUT_NODE_ID = 'landrush-world_pascal-water-layout'
const PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID = 'landrush-layout_pascal-multiplayer-island-layout'
const PASCAL_WATER_CAMERA_POSITION = [88, 86, 94] as const
const PASCAL_WATER_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_WATER_CAMERA_ZOOM = 7.8
const PASCAL_WATER_MATERIAL_PARAMETERS = {
  ...LANDRUSH_WATER_SURFACE_PARAMETERS,
} satisfies LandrushWaterSurfaceParameters
const PASCAL_WATER_ELEVATION_PARAMETERS = {
  ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  cliffColorAverageRatio: 0.92,
  cliffToneVariation: 0.12,
} satisfies IslandElevationParameters
const PASCAL_WATER_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} as const
const PASCAL_WATER_PARCEL_OVERLAY_COLOR = '#e0a35a'
const PASCAL_WATER_DIRT_ROAD_WIDTH_METERS =
  (DEFAULT_PARCEL_STREET_WIDTH_METERS +
    PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
    PARCEL_STREET_CURB_EXTRA_WIDTH_METERS) /
  2.35
const PASCAL_WATER_PROGRESSIVE_GRASS_BLADE_SUBDIVISIONS = 80
const PASCAL_WATER_PROGRESSIVE_GRASS_FIELD_RESOLUTION = 64
const PASCAL_WATER_INTERACTIVE_GRASS_FIELD_RESOLUTION = GRASS_FIELD_RESOLUTION
const PASCAL_MULTIPLAYER_ISLAND_REVEAL_INITIAL_RADIUS_METERS = 9
const PASCAL_MULTIPLAYER_ISLAND_REVEAL_FINAL_RADIUS_METERS = 96
const PASCAL_MULTIPLAYER_ISLAND_REVEAL_FEATHER_METERS = 7
const PASCAL_MULTIPLAYER_ISLAND_REVEAL_SECONDS = 5.2
const PASCAL_MULTIPLAYER_ISLAND_REVEAL_CENTER_RESPONSE = 7
const PASCAL_WATER_GRASS_TEXTURE_TILE_METERS = 5
const PASCAL_WATER_GROUND_GRASS_BLOCKERS: readonly GrassFieldBlocker[] = []
const PASCAL_WATER_GRASS_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  colorPatchScale: 0.7,
  colorVariation: 0.5,
  density: 5000,
  flutter: 0.28,
  gustScale: 0.5,
  heightNoiseScale: 0.15,
  heightVariation: 1,
  macroScale: 0.115,
  macroVariation: 0.48,
  projection: 0.74,
  scale: 1.3,
  treeSway: 0.7,
  turbulence: 0.28,
  windAngle: 45,
  windSpeed: 2,
  windStrength: 0.25,
} satisfies GrassBladeTuning
const PASCAL_WATER_MULTIPLAYER_ROOM_ID = 'landrush-lab-world-multiplayer'
const PASCAL_WATER_VISUAL_PLAYER_GROUND_Y = 0.04
const PASCAL_WATER_LOCAL_STATE_SEND_INTERVAL_MS = 80
const PASCAL_WATER_ROBOT_PREVIOUS_WALK_SPEED = 2.75
const PASCAL_WATER_ROBOT_WALK_SPEED = PASCAL_WATER_ROBOT_PREVIOUS_WALK_SPEED / 1.5
const PASCAL_WATER_ROBOT_RUN_SPEED = PASCAL_WATER_ROBOT_PREVIOUS_WALK_SPEED * 2.48
const PASCAL_WATER_ROBOT_JOYSTICK_RUN_START = 0.82
const PASCAL_WATER_ROBOT_ACCELERATION = 18
const PASCAL_WATER_ROBOT_DECELERATION = 24
const PASCAL_WATER_ROBOT_LOCAL_POSITION_RESPONSE = 26
const PASCAL_WATER_ROBOT_TURN_RESPONSE = 12
const PASCAL_WATER_ROBOT_GROUND_CLEARANCE = 0.04
const PASCAL_WATER_ROBOT_CAMERA_TARGET_HEIGHT = 1.28
const PASCAL_WATER_ROBOT_CAMERA_FOLLOW_RESPONSE = 16
const PASCAL_WATER_ISOMETRIC_CAMERA_DISTANCE = 18
const PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE = 10
const PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE = 34
const PASCAL_WATER_ISOMETRIC_CAMERA_PITCH = MathUtils.degToRad(54)
const PASCAL_WATER_ISOMETRIC_CAMERA_MIN_PITCH = MathUtils.degToRad(14)
const PASCAL_WATER_ISOMETRIC_CAMERA_MAX_PITCH = MathUtils.degToRad(74)
const PASCAL_WATER_ISOMETRIC_CAMERA_PITCH_DRAG_SPEED = 0.006
const PASCAL_WATER_ISOMETRIC_CAMERA_INITIAL_YAW = MathUtils.degToRad(135)
const PASCAL_WATER_ISOMETRIC_CAMERA_YAW_RESPONSE = 8
const PASCAL_WATER_ISOMETRIC_CAMERA_YAW_SPEED = MathUtils.degToRad(88)
const PASCAL_WATER_ISOMETRIC_CAMERA_ZOOM_STEP = 0.012
const PASCAL_WATER_ROBOT_MESH_WIDTH_METERS = 0.46
const PASCAL_WATER_CLICK_MOVE_STOP_RADIUS = 0.35
const PASCAL_WATER_CLICK_MOVE_FULL_SPEED_DISTANCE = 1.75
const PASCAL_WATER_CLICK_MOVE_RUN_DISTANCE = PASCAL_WATER_ROBOT_MESH_WIDTH_METERS * 4
const PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS = 0.48
const PASCAL_WATER_ROBOT_PHYSICS_CENTER_FROM_ROOT = 0.8
const PASCAL_WATER_ROBOT_GRASS_INTERACTION_RADIUS = 4.2
const PASCAL_WATER_ROBOT_GRASS_IDLE_BEND_STRENGTH = 0.34
const PASCAL_WATER_ROBOT_GRASS_FULL_BEND_SPEED = 5.8
const PASCAL_WATER_BUILT_GRASS_PADDING_METERS = 1
const PASCAL_WATER_BUILT_GRASS_FEATHER_METERS = 0.3
const PASCAL_WATER_BUILD_PARCEL_BLADE_FEATHER_METERS = 0.24
const PASCAL_WATER_BUILD_PARCEL_EDGE_TOLERANCE_METERS = 0.04
const PASCAL_WATER_BUILD_GRID_SIZE_METERS = 132
const PASCAL_WATER_BUILD_GRID_DIVISIONS = 132
const PASCAL_WATER_BUILD_GRID_ELEVATION_OFFSET = 0.16
const PASCAL_WATER_BUILD_GRASS_GROUND_RENDER_ORDER = 0
const PASCAL_WATER_BUILD_GRASS_BLADE_RENDER_ORDER = 0.1
const PASCAL_WATER_BUILD_CAMERA_MIN_DISTANCE = 10
const PASCAL_WATER_BUILD_CAMERA_MAX_DISTANCE = 22
const PASCAL_WATER_BUILD_CAMERA_MIN_HEIGHT = 7
const PASCAL_WATER_BUILD_CAMERA_MAX_HEIGHT = 15
const PASCAL_WATER_BUILD_CAMERA_TRANSITION_SECONDS = 1.15
const PASCAL_WATER_LOADING_EXPECTED_MS = 18_000
const PASCAL_WATER_LOADING_FADE_MS = 520
const PASCAL_WATER_LOADING_MINIMUM_MS = 1_800
const PASCAL_WATER_LOADING_QUIET_MS = 900
const PASCAL_WATER_PARCEL_MAP_OVERLAY_ELEVATION_OFFSET = 0.08
const PASCAL_WATER_PARCEL_MAP_OVERLAY_HOVER_SCALE = 1.014
const PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE = 12

type PascalWaterClientExperience = 'pascal-water' | 'pascal-multiplayer-island'
type PascalWaterFieldDebugMode = 'cached-worker'
type PascalWaterLayoutNode = LandrushWorldNode | LandrushLayoutNode
type PascalWaterLayoutNodeKind = PascalWaterLayoutNode['type']

type PascalWaterExperienceConfig = {
  debugSource: PascalWaterClientExperience
  layoutNodeId: string
  layoutNodeKind: PascalWaterLayoutNodeKind
  layoutNodeMetadataSource: string
  layoutNodeName: string
  projectId: string
}

const PASCAL_WATER_EXPERIENCE_CONFIGS = {
  'pascal-water': {
    debugSource: 'pascal-water',
    layoutNodeId: PASCAL_WATER_LAYOUT_NODE_ID,
    layoutNodeKind: 'landrush-world',
    layoutNodeMetadataSource: 'world-multiplayer-dirt-copy-layout',
    layoutNodeName: 'World Multiplayer Layout',
    projectId: 'pascal-water-debug',
  },
  'pascal-multiplayer-island': {
    debugSource: 'pascal-multiplayer-island',
    layoutNodeId: PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID,
    layoutNodeKind: 'landrush-layout',
    layoutNodeMetadataSource: 'pascal-multiplayer-island-layout',
    layoutNodeName: 'Pascal Multiplayer Island Layout',
    projectId: 'pascal-multiplayer-island',
  },
} satisfies Record<PascalWaterClientExperience, PascalWaterExperienceConfig>
const PASCAL_WATER_PARCEL_MAP_BASE_COLOR = '#d3aa58'
const PASCAL_WATER_PARCEL_MAP_HOVER_COLOR = '#f5cf78'
const PASCAL_WATER_PARCEL_MAP_BASE_OPACITY = 0.19
const PASCAL_WATER_PARCEL_MAP_HOVER_OPACITY = 0.34
const PASCAL_WATER_MAP_CAMERA_POSITION = [0, 128, 0.01] as const
const PASCAL_WATER_MAP_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_WATER_MAP_CAMERA_ZOOM = 8.6
const PASCAL_WATER_MAP_CAMERA_MIN_ZOOM = 3
const PASCAL_WATER_MAP_CAMERA_MAX_ZOOM = 28
const PASCAL_WATER_MAP_CAMERA_TRANSITION_MAX_ZOOM = 64
const PASCAL_WATER_MOBILE_CONTROLS_QUERY = '(max-width: 767px)'
const PASCAL_WATER_REMOTE_POSITION_RESPONSE = 12
const PASCAL_WATER_REMOTE_HEADING_RESPONSE = 14
const PASCAL_WATER_PERF_DEFAULT_DURATION_MS = 9000
const PASCAL_WATER_PERF_MAX_FRAME_SAMPLES = 1200
const PASCAL_WATER_PERF_SPIKE_THRESHOLD_MS = 24
const PASCAL_WATER_PERF_START_DELAY_MS = 2500
const PASCAL_WATER_FALLBACK_PROFILE = {
  color: '#7dd3fc',
  id: 'pascal-water-pending',
  name: 'Builder',
} satisfies LocalPlayerProfile

const PASCAL_WATER_SIDEBAR_TABS = [
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

type FieldSliderKey = keyof WaterFieldParameters
type ElevationSliderKey = keyof IslandElevationParameters
type IslandSliderKey = keyof WaterLabIslandParameters
type PascalWaterTuningGroupId = 'grass' | 'island' | 'waterAreas' | 'waterEdge' | 'waterRipples'
type PascalWaterIsland = ReturnType<typeof generateWaterLabIsland>
type PascalWaterPerimeter = PascalWaterNode['perimeter']
type PascalWaterViewMode = 'build' | 'map' | 'player'
type PascalWaterProfileMeasure = <T>(id: string, callback: () => T) => T
type PascalWaterCameraPose = {
  distance: number
  pitch: number
  position: Vector3
  target: Vector3
  yaw: number
}
type PascalWaterOrthographicCamera = Camera & {
  isOrthographicCamera: true
  updateProjectionMatrix: () => void
  zoom: number
}
type PascalWaterReturnCameraTransition = {
  elapsed: number
  startPosition: Vector3
  startTarget: Vector3
  targetPose: PascalWaterCameraPose
}
type PascalWaterStartupProfileSpan = {
  durationMs: number
  id: string
  startMs: number
}
type PascalWaterStartupLongTask = {
  durationMs: number
  name: string
  startMs: number
}
type PascalWaterStartupAnimationFrameScript = {
  durationMs: number
  forcedStyleAndLayoutDurationMs: number
  invoker: string
  invokerType: string
  pauseDurationMs: number
  sourceChar: number
  sourceFunctionName: string
  sourceLine: number
  sourceURL: string
  windowAttribution: string
}
type PascalWaterStartupAnimationFrame = {
  blockingDurationMs: number
  durationMs: number
  firstUIEventTimestampMs: number
  renderStartMs: number
  scripts: PascalWaterStartupAnimationFrameScript[]
  startMs: number
  styleAndLayoutStartMs: number
}
type PascalWaterStartupReactCommit = {
  actualDurationMs: number
  baseDurationMs: number
  commitMs: number
  id: string
  phase: string
  startMs: number
}
type PascalWaterStartupProfile = {
  animationFrames: PascalWaterStartupAnimationFrame[]
  longTasks: PascalWaterStartupLongTask[]
  reactCommits: PascalWaterStartupReactCommit[]
  spans: PascalWaterStartupProfileSpan[]
  startedAt: number
}
type PascalWaterPerfRunOptions = {
  durationMs: number
  enabled: boolean
  speed: 'run' | 'walk'
}
type PascalWaterPerfFrameSample = {
  dt: number
  time: number
}
type PascalWaterPerfLongTaskSample = {
  durationMs: number
  name: string
  startMs: number
}
type PascalWaterPerfRunState = {
  completedAt: number | null
  durationMs: number
  frames: PascalWaterPerfFrameSample[]
  longTasks: PascalWaterPerfLongTaskSample[]
  speed: 'run' | 'walk'
  spikeThresholdMs: number
  startedAt: number | null
  status: 'done' | 'pending' | 'running'
}

type PascalWaterSceneStore = ReturnType<typeof useScene.getState>
type ProgressiveRenderValue<T> = {
  finalValue: T
  isSettling: boolean
  previewValue: T
}
type RobotMotion = {
  cameraSnapVersion: number
  heading: number
  isMoving: boolean
  position: Vector3
  speed: number
  velocity: Vector3
}
type RobotMovementInput = {
  heading: number
  intensity: number
  runAmount: number
  x: number
  z: number
}
type PascalWaterMoveTarget = {
  point: LandrushPoint2
}
type PascalWaterRightHoldMove = {
  id: number
  x: number
  y: number
}
type PascalWaterNavigationObstacle = {
  points: readonly LandrushPoint2[]
}
type PascalWaterRoofNode = Extract<AnyNode, { type: 'roof' }>
type PascalWaterRoofSegmentNode = Extract<AnyNode, { type: 'roof-segment' }>
type MobileJoystickInput = {
  forward: number
  strafe: number
  strength: number
}
type RobotWorldOrbitControls = {
  target: Vector3
  update: () => void
}
type PascalWaterCameraControls = {
  getTarget?: (target: Vector3, receiveEndValue?: boolean) => Vector3
  setLookAt?: (
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition?: boolean,
  ) => unknown
  target?: Vector3
  update?: (delta?: number) => void
}

const FIELD_SLIDERS = [
  { key: 'depthContourOffsetMeters', label: 'depth contour offset', max: 12, min: -6, step: 0.1 },
  {
    key: 'depthContourVariationMeters',
    label: 'depth contour variation',
    max: 14,
    min: 0,
    step: 0.1,
  },
  {
    key: 'depthContourNoiseFrequency',
    label: 'depth contour scale',
    max: 0.18,
    min: 0.005,
    step: 0.005,
  },
  {
    key: 'depthContourCollapseMeters',
    label: 'depth contour collapse',
    max: 12,
    min: 0,
    step: 0.1,
  },
  {
    key: 'depthContourCollapseScale',
    label: 'collapse pocket size',
    max: 1.4,
    min: 0.15,
    step: 0.05,
  },
  { key: 'depthReach', label: 'depth reach', max: 70, min: 4, step: 1 },
  { key: 'depthExponent', label: 'depth curve', max: 2, min: 0.45, step: 0.01 },
  { key: 'depthNoiseStrength', label: 'field noise', max: 0.14, min: 0, step: 0.001 },
  { key: 'depthNoiseFrequency', label: 'field noise size', max: 0.16, min: 0.001, step: 0.001 },
  { key: 'shoreBandMeters', label: 'shore width', max: 10, min: 0, step: 0.05 },
  { key: 'shoreFeatherMeters', label: 'shore feather', max: 4, min: 0.02, step: 0.02 },
  { key: 'shoreVariationMeters', label: 'shore variation', max: 5, min: 0, step: 0.05 },
  { key: 'shoreNoiseFrequency', label: 'shore variation size', max: 0.35, min: 0.002, step: 0.002 },
] satisfies readonly LabSliderConfig<FieldSliderKey>[]

const ELEVATION_SLIDERS = [
  { key: 'edgeLiftMeters', label: 'edge lift', max: 6, min: 0, step: 0.05 },
  { key: 'outerContourMeters', label: 'outside edge', max: 14, min: 0, step: 0.25 },
  { key: 'innerContourMeters', label: 'inside edge', max: 32, min: 1, step: 0.25 },
  { key: 'contourVariationMeters', label: 'edge variation', max: 10, min: 0, step: 0.25 },
  { key: 'contourNoiseFrequency', label: 'edge variation size', max: 0.2, min: 0.005, step: 0.005 },
  { key: 'cliffBandMergeThresholdMeters', label: 'band merge', max: 32, min: 0, step: 0.01 },
  { key: 'cliffBlockDepthMinMeters', label: 'depth out min', max: 18, min: 0, step: 0.05 },
  { key: 'cliffBlockDepthMaxMeters', label: 'depth out max', max: 18, min: 0, step: 0.05 },
  { key: 'cliffContrast', label: 'cliff contrast', max: 1, min: 0, step: 0.01 },
  { key: 'cliffToneVariation', label: 'tone variation', max: 1, min: 0, step: 0.01 },
  { key: 'cliffColorAverageRatio', label: 'color average', max: 1, min: 0, step: 0.01 },
] satisfies readonly LabSliderConfig<ElevationSliderKey>[]

const PASCAL_WATER_GRASS_SLIDERS = [
  { key: 'density', label: 'density', max: 30_000, min: 0, step: 100 },
  { key: 'scale', label: 'scale', max: 3, min: 0.1, step: 0.05 },
  { key: 'heightVariation', label: 'height variation', max: 1, min: 0, step: 0.01 },
  { key: 'heightNoiseScale', label: 'height noise scale', max: 2, min: 0.05, step: 0.01 },
  { key: 'windStrength', label: 'wind strength', max: 0.5, min: 0, step: 0.01 },
  { key: 'windSpeed', label: 'wind speed', max: 5, min: 0, step: 0.1 },
  { key: 'windAngle', label: 'wind direction', max: 360, min: 0, step: 1 },
  { key: 'gustScale', label: 'gust frequency', max: 1.5, min: 0.1, step: 0.01 },
  { key: 'turbulence', label: 'turbulence', max: 1, min: 0, step: 0.01 },
  { key: 'flutter', label: 'tip flutter', max: 1, min: 0, step: 0.01 },
  { key: 'treeSway', label: 'tree sway', max: 3, min: 0, step: 0.05 },
  { key: 'projection', label: 'ground projection', max: 1, min: 0, step: 0.01 },
  { key: 'colorVariation', label: 'color variation', max: 1, min: 0, step: 0.01 },
  { key: 'colorPatchScale', label: 'color patch scale', max: 2, min: 0.05, step: 0.01 },
  { key: 'macroVariation', label: 'macro variation', max: 0.5, min: 0, step: 0.01 },
  { key: 'macroScale', label: 'macro scale', max: 0.5, min: 0.01, step: 0.005 },
] satisfies readonly LabSliderConfig<keyof GrassBladeTuning>[]

declare global {
  interface Window {
    __PASCAL_BENCH_ORBITING__?: boolean
    __PASCAL_WATER_PERF_RUN__?: () => unknown
    __PASCAL_WATER_STARTUP_PROFILE__?: PascalWaterStartupProfile
    __PASCAL_WATER_DEBUG__?: {
      features: readonly string[]
      layoutNodeId: string
      layoutNodeKind: string
      materialParameters: Partial<LandrushWaterSurfaceParameters>
      nodeId: string
      source: string
      worldLayout: {
        parcels: number
        roadSegments: number
      }
    }
  }
}

function usePascalWaterPerfRunProbe(perfRun: PascalWaterPerfRunOptions) {
  useEffect(() => {
    if (!perfRun.enabled) {
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__?.enabled) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      delete window.__PASCAL_WATER_PERF_RUN__
      delete document.documentElement.dataset.pascalWaterPerfRun
      return
    }

    const grassProbe: StylizedGrassPerfProbe = { enabled: true, samples: [] }
    const state: PascalWaterPerfRunState = {
      completedAt: null,
      durationMs: perfRun.durationMs,
      frames: [],
      longTasks: [],
      speed: perfRun.speed,
      spikeThresholdMs: PASCAL_WATER_PERF_SPIKE_THRESHOLD_MS,
      startedAt: null,
      status: 'pending',
    }
    window.__LANDRUSH_STYLIZED_GRASS_PERF__ = grassProbe

    const publishSummary = () => {
      const summary = summarizePascalWaterPerfRun(state, grassProbe)
      document.documentElement.dataset.pascalWaterPerfRun = JSON.stringify(summary)
      return summary
    }

    window.__PASCAL_WATER_PERF_RUN__ = publishSummary

    let raf = 0
    let longTaskObserver: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined') {
      longTaskObserver = new PerformanceObserver((list) => {
        const startedAt = state.startedAt
        if (startedAt === null || state.status !== 'running') return
        for (const entry of list.getEntries()) {
          if (entry.startTime < startedAt) continue
          state.longTasks.push({
            durationMs: entry.duration,
            name: entry.name,
            startMs: entry.startTime - startedAt,
          })
        }
      })
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
      } catch {
        longTaskObserver.disconnect()
        longTaskObserver = null
      }
    }
    const publishTimer = window.setInterval(publishSummary, 250)
    const startTimer = window.setTimeout(() => {
      state.startedAt = performance.now()
      state.status = 'running'
      let previous = state.startedAt

      const tick = (now: number) => {
        const time = now - (state.startedAt ?? now)
        const dt = now - previous
        previous = now
        state.frames.push({ dt, time })
        if (state.frames.length > PASCAL_WATER_PERF_MAX_FRAME_SAMPLES) {
          state.frames.splice(0, state.frames.length - PASCAL_WATER_PERF_MAX_FRAME_SAMPLES)
        }

        if (time < perfRun.durationMs) {
          raf = window.requestAnimationFrame(tick)
          return
        }

        state.completedAt = now
        state.status = 'done'
        publishSummary()
      }

      raf = window.requestAnimationFrame(tick)
    }, PASCAL_WATER_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(publishTimer)
      window.cancelAnimationFrame(raf)
      longTaskObserver?.disconnect()
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__ === grassProbe) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      if (window.__PASCAL_WATER_PERF_RUN__ === publishSummary) {
        delete window.__PASCAL_WATER_PERF_RUN__
      }
      delete document.documentElement.dataset.pascalWaterPerfRun
    }
  }, [perfRun])
}

function createPascalWaterPerfRunOptions(searchParams: { get: (key: string) => string | null }) {
  const enabled = searchParams.get('perfRun') === 'straight'
  const requestedDuration = Number(searchParams.get('perfDurationMs'))
  const durationMs = MathUtils.clamp(
    Number.isFinite(requestedDuration) ? requestedDuration : PASCAL_WATER_PERF_DEFAULT_DURATION_MS,
    4000,
    20_000,
  )
  const speed = searchParams.get('perfSpeed') === 'walk' ? 'walk' : 'run'
  return { durationMs, enabled, speed } satisfies PascalWaterPerfRunOptions
}

function summarizePascalWaterPerfRun(
  state: PascalWaterPerfRunState,
  grassProbe: StylizedGrassPerfProbe,
) {
  const frameDts = state.frames.map((frame) => frame.dt)
  const frameSpikes = state.frames.filter((frame) => frame.dt >= state.spikeThresholdMs)
  const longTaskDurations = state.longTasks.map((task) => task.durationMs)
  const grassSamples = grassProbe.samples
  const matrixSamples = grassSamples.filter((sample) => sample.kind === 'matrix')
  const buildSamples = grassSamples.filter((sample) => sample.kind === 'build')
  const attributeSamples = grassSamples.filter((sample) => sample.kind === 'attributes')
  const streamSamples = grassSamples.filter((sample) => sample.kind === 'stream')

  return {
    durationMs: state.durationMs,
    frames: {
      count: state.frames.length,
      maxMs: roundPerf(maxPerf(frameDts)),
      p95Ms: roundPerf(percentilePerf(frameDts, 0.95)),
      p99Ms: roundPerf(percentilePerf(frameDts, 0.99)),
      spikeCount: frameSpikes.length,
      spikeThresholdMs: state.spikeThresholdMs,
      spikes: frameSpikes.slice(0, 12).map((frame) => ({
        dt: roundPerf(frame.dt),
        time: roundPerf(frame.time),
      })),
    },
    grass: {
      attributes: summarizePascalWaterGrassPerfSamples(attributeSamples),
      builds: summarizePascalWaterGrassPerfSamples(buildSamples),
      matrices: summarizePascalWaterGrassPerfSamples(matrixSamples),
      streamUpdates: streamSamples.map((sample) => ({
        time: roundPerf(sample.time - (state.startedAt ?? sample.time)),
        x: roundPerf(sample.centerX ?? 0),
        z: roundPerf(sample.centerZ ?? 0),
      })),
    },
    longTasks: {
      count: state.longTasks.length,
      maxMs: roundPerf(maxPerf(longTaskDurations)),
      p95Ms: roundPerf(percentilePerf(longTaskDurations, 0.95)),
      totalMs: roundPerf(longTaskDurations.reduce((total, duration) => total + duration, 0)),
      top: [...state.longTasks]
        .sort((first, second) => second.durationMs - first.durationMs)
        .slice(0, 8)
        .map((task) => ({
          durationMs: roundPerf(task.durationMs),
          name: task.name,
          startMs: roundPerf(task.startMs),
        })),
    },
    speed: state.speed,
    status: state.status,
  }
}

function summarizePascalWaterGrassPerfSamples(samples: StylizedGrassPerfProbe['samples']) {
  const durations = samples.map((sample) => sample.durationMs)
  return {
    count: samples.length,
    maxMs: roundPerf(maxPerf(durations)),
    p95Ms: roundPerf(percentilePerf(durations, 0.95)),
    top: [...samples]
      .sort((first, second) => second.durationMs - first.durationMs)
      .slice(0, 8)
      .map((sample) => ({
        count: sample.count ?? 0,
        durationMs: roundPerf(sample.durationMs),
        moving: sample.moving ?? undefined,
      })),
  }
}

function percentilePerf(values: readonly number[], percentileValue: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))] ?? 0
}

function maxPerf(values: readonly number[]) {
  return values.length === 0 ? 0 : Math.max(...values)
}

function roundPerf(value: number) {
  return Math.round(value * 1000) / 1000
}

function PascalWaterStartupReactProfiler({
  children,
  enabled,
  id,
  onRender,
}: {
  children: ReactNode
  enabled: boolean
  id: string
  onRender: ProfilerOnRenderCallback
}) {
  if (!enabled) return <>{children}</>
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  )
}

function syncPascalMultiplayerIslandBuildEditorMode(buildMode: boolean) {
  const editor = useEditor.getState()

  if (buildMode) {
    if (
      editor.phase === 'structure' &&
      editor.mode === 'select' &&
      editor.structureLayer === 'elements' &&
      editor.tool === null &&
      editor.activeSidebarPanel === 'site' &&
      editor.catalogCategory === null &&
      editor.floorplanSelectionTool === 'click'
    ) {
      return
    }

    useEditor.setState({
      activeSidebarPanel: 'site',
      catalogCategory: null,
      floorplanSelectionTool: 'click',
      mode: 'select',
      phase: 'structure',
      structureLayer: 'elements',
      tool: null,
    })
    return
  }

  if (editor.mode === 'select' && editor.tool === null && editor.catalogCategory === null) return
  useEditor.setState({
    catalogCategory: null,
    mode: 'select',
    tool: null,
  })
}

export function PascalWaterClient({
  experience = 'pascal-water',
  waterFieldDebugMode,
}: {
  experience?: PascalWaterClientExperience
  waterFieldDebugMode?: PascalWaterFieldDebugMode
} = {}) {
  const experienceConfig = PASCAL_WATER_EXPERIENCE_CONFIGS[experience]
  const localFirstProgressiveLoading = experience === 'pascal-multiplayer-island'
  const searchParams = useSearchParams()
  const startupProfileEnabled =
    searchParams.get('startupProfile') === '1' || searchParams.get('profileStartup') === '1'
  const startupProfileNoLandLayers = searchParams.get('profileNoLandLayers') === '1'
  const startupProfileNoStylizedBlades = searchParams.get('profileNoStylizedBlades') === '1'
  const startupProfileNoStylizedGround = searchParams.get('profileNoStylizedGround') === '1'
  const startupProfileNoStylizedTrees = searchParams.get('profileNoStylizedTrees') === '1'
  const startupProfileNoWaterNode = searchParams.get('profileNoWaterNode') === '1'
  const profilePlainWaterMaterial = searchParams.get('profilePlainWaterMaterial') === '1'
  const profileGrassDensityScale = clampOptionalNumber(
    optionalSearchParamNumber(searchParams, 'profileGrassDensityScale'),
    0,
    1,
  )
  const profileBladeSubdivisions = clampOptionalNumber(
    optionalSearchParamNumber(searchParams, 'profileBladeSubdivisions'),
    4,
    160,
  )
  const perfRun = useMemo(() => createPascalWaterPerfRunOptions(searchParams), [searchParams])
  const startupProfileRef = useRef<PascalWaterStartupProfile | null>(null)
  const grassInteractionRef = useRef<StylizedGrassInteraction | null>(null)
  const mobileJoystickRef = useRef<MobileJoystickInput | null>(null)
  const localMotionRef = useRef<RobotMotion | null>(null)
  const playerCameraPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const buildCameraPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const mapCameraPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const mapTransitionStartPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const playerReturnCameraPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const lastAppliedBuildSnapshotSignatureRef = useRef(new Map<string, string>())
  const lastSyncedBuildSnapshotSignatureRef = useRef<string | null>(null)
  const initialViewModeAppliedRef = useRef(false)
  if (startupProfileEnabled && !startupProfileRef.current && typeof performance !== 'undefined') {
    startupProfileRef.current = {
      animationFrames: [],
      longTasks: [],
      reactCommits: [],
      spans: [],
      startedAt: performance.now(),
    }
  }
  if (startupProfileEnabled && startupProfileRef.current && typeof window !== 'undefined') {
    window.__PASCAL_WATER_STARTUP_PROFILE__ = startupProfileRef.current
  }
  const startupProfileMeasure = useCallback<PascalWaterProfileMeasure>((id, callback) => {
    const profile = startupProfileRef.current
    if (!profile || typeof performance === 'undefined') return callback()

    const startedAt = performance.now()
    try {
      return callback()
    } finally {
      profile.spans.push({
        durationMs: performance.now() - startedAt,
        id,
        startMs: startedAt - profile.startedAt,
      })
    }
  }, [])
  const activeProfileMeasure = startupProfileEnabled ? startupProfileMeasure : undefined
  const handleStartupReactRender = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      const profile = startupProfileRef.current
      if (!profile) return
      profile.reactCommits.push({
        actualDurationMs: roundPerf(actualDuration),
        baseDurationMs: roundPerf(baseDuration),
        commitMs: roundPerf(commitTime - profile.startedAt),
        id,
        phase,
        startMs: roundPerf(startTime - profile.startedAt),
      })
    },
    [],
  )
  const [loadingActive, setLoadingActive] = useState(!localFirstProgressiveLoading)
  useEffect(() => {
    if (localFirstProgressiveLoading) setLoadingActive(false)
  }, [localFirstProgressiveLoading])
  const activePerfRun = useMemo(
    () => ({ ...perfRun, enabled: perfRun.enabled && !loadingActive }),
    [loadingActive, perfRun],
  )
  const frameProfile =
    searchParams.get('frameProfile') === '1' || searchParams.get('profileFrame') === '1'
  const viewerRendererBackend = searchParams.get('rendererBackend') === 'webgl' ? 'webgl' : 'webgpu'
  const [buildMode, setBuildMode] = useState(false)
  const [buildParcelId, setBuildParcelId] = useState<string | null>(null)
  const [buildCameraControlsInitialPose, setBuildCameraControlsInitialPose] =
    useState<EditorCameraInitialPose | null>(null)
  const [buildCameraControlsReady, setBuildCameraControlsReady] = useState(false)
  const [mapView, setMapView] = useState(false)
  const [showTunePanel, setShowTunePanel] = useState(false)
  const [localProfile, setLocalProfile] = useState<LocalPlayerProfile | null>(null)
  const [islandParameters, setIslandParameters] = useState<WaterLabIslandParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
  const [fieldParameters, setFieldParameters] = useState<WaterFieldParameters>(() => ({
    ...WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  }))
  const [elevationParameters, setElevationParameters] = useState<IslandElevationParameters>(() => ({
    ...PASCAL_WATER_ELEVATION_PARAMETERS,
  }))
  const [materialParameters, setMaterialParameters] = useState<LandrushWaterSurfaceParameters>(
    () => ({
      ...PASCAL_WATER_MATERIAL_PARAMETERS,
    }),
  )
  const [grassTuning, setGrassTuning] = useState<GrassBladeTuning>(() => ({
    ...PASCAL_WATER_GRASS_TUNING,
  }))
  const [terrainFieldResolution, setTerrainFieldResolution] = useState(WATER_FIELD_RESOLUTION)
  const showDepthReference = false
  const offline = searchParams.get('offline') === '1'
  const benchmarkOrbiting =
    searchParams.get('benchOrbiting') === '1' || searchParams.get('benchmark') === '1'
  const roomId = useMemo(
    () => sanitizeRoomId(searchParams.get('room') ?? PASCAL_WATER_MULTIPLAYER_ROOM_ID),
    [searchParams],
  )
  const multiplayer = useLandrushWorldMultiplayer({
    enabled: !offline && Boolean(localProfile),
    localProfile: localProfile ?? PASCAL_WATER_FALLBACK_PROFILE,
    roomId,
    spectator: false,
  })
  const resolvedLocalProfile = localProfile ?? PASCAL_WATER_FALLBACK_PROFILE
  const multiplayerStatus: ConnectionStatus = offline ? 'offline' : multiplayer.status
  const viewMode: PascalWaterViewMode = buildMode ? 'build' : mapView ? 'map' : 'player'

  usePascalWaterPerfRunProbe(activePerfRun)

  const prepareCameraHandoff = useCallback(
    (nextViewMode: PascalWaterViewMode) => {
      if (nextViewMode === 'player') {
        if (viewMode !== 'player') {
          const currentNonPlayerPose =
            viewMode === 'map' ? mapCameraPoseRef.current : buildCameraPoseRef.current
          if (currentNonPlayerPose) {
            buildCameraPoseRef.current = clonePascalWaterCameraPose(currentNonPlayerPose)
          }
          playerReturnCameraPoseRef.current = clonePascalWaterCameraPose(
            playerCameraPoseRef.current,
          )
        }
        mapTransitionStartPoseRef.current = null
        return
      }

      playerReturnCameraPoseRef.current = null
      if (nextViewMode === 'map') {
        mapTransitionStartPoseRef.current = clonePascalWaterCameraPose(
          viewMode === 'build' ? buildCameraPoseRef.current : playerCameraPoseRef.current,
        )
        return
      }

      mapTransitionStartPoseRef.current = null
      if (viewMode === 'player') buildCameraPoseRef.current = null
      if (viewMode === 'map') {
        buildCameraPoseRef.current = clonePascalWaterCameraPose(mapCameraPoseRef.current)
      }
    },
    [viewMode],
  )

  const enterPlayerView = useCallback(() => {
    prepareCameraHandoff('player')
    setBuildMode(false)
    setBuildParcelId(null)
    setMapView(false)
  }, [prepareCameraHandoff])

  const enterMapView = useCallback(() => {
    prepareCameraHandoff('map')
    setBuildMode(false)
    setBuildParcelId(null)
    setMapView(true)
    releasePascalWaterPointerLock()
  }, [prepareCameraHandoff])

  const enterBuildView = useCallback(
    (parcelId: string) => {
      prepareCameraHandoff('build')
      setBuildParcelId(parcelId)
      setBuildMode(true)
      setMapView(false)
      releasePascalWaterPointerLock()
    },
    [prepareCameraHandoff],
  )
  const islandRender = useProgressiveRenderValue(islandParameters, 320)
  const fieldRender = useProgressiveRenderValue(fieldParameters, 160)
  const elevationRender = useProgressiveRenderValue(elevationParameters, 160)
  const grassRender = useProgressiveRenderValue(grassTuning, 160)
  const terrainFieldResolutionRender = useProgressiveRenderValue(terrainFieldResolution, 160)
  const renderIslandParameters = progressiveRenderValue(islandRender)
  const renderFieldParameters = progressiveRenderValue(fieldRender)
  const renderElevationParameters = progressiveRenderValue(elevationRender)
  const baseRenderGrassTuning = progressiveRenderValue(grassRender)
  const renderGrassTuning = useMemo(
    () =>
      profileGrassDensityScale === null
        ? baseRenderGrassTuning
        : {
            ...baseRenderGrassTuning,
            density: Math.max(0, baseRenderGrassTuning.density * profileGrassDensityScale),
          },
    [baseRenderGrassTuning, profileGrassDensityScale],
  )
  const isWaterFieldPreviewing =
    islandRender.isSettling || fieldRender.isSettling || terrainFieldResolutionRender.isSettling
  const isGrassFieldPreviewing =
    islandRender.isSettling || elevationRender.isSettling || grassRender.isSettling
  const renderTerrainFieldResolution = isWaterFieldPreviewing
    ? Math.min(terrainFieldResolutionRender.previewValue, WATER_FIELD_PREVIEW_RESOLUTION)
    : terrainFieldResolutionRender.finalValue
  const liveIsland = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.generate-island', () =>
        generateWaterLabIsland(renderIslandParameters),
      ),
    [activeProfileMeasure, renderIslandParameters],
  )
  const livePerimeter = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.create-perimeter', () =>
        createPascalWaterPerimeter(liveIsland),
      ),
    [activeProfileMeasure, liveIsland],
  )
  const liveSmoothedShorelinePoints = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.smooth-perimeter', () =>
        createPascalWaterSmoothedPerimeter(livePerimeter.points),
      ),
    [activeProfileMeasure, livePerimeter.points],
  )
  const liveLandSurface = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.land-surface', () =>
        createPascalWaterLandSurface({
          elevationParameters: renderElevationParameters,
          shorelinePoints: liveSmoothedShorelinePoints,
          waterPlaneSize: WATER_PLANE_SIZE,
        }),
      ),
    [activeProfileMeasure, liveSmoothedShorelinePoints, renderElevationParameters],
  )
  const liveParcelOptions = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.parcel-options', () =>
        createPascalWaterParcelOptions(liveIsland.seed),
      ),
    [activeProfileMeasure, liveIsland.seed],
  )
  const liveParcelAllocation = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.allocate-parcels', () =>
        allocateParcels(liveLandSurface.grassSurfacePoints, liveParcelOptions),
      ),
    [activeProfileMeasure, liveLandSurface.grassSurfacePoints, liveParcelOptions],
  )
  const parcelWorldId = useMemo(
    () => createPascalWaterParcelOwnershipWorldId(liveParcelOptions),
    [liveParcelOptions],
  )
  const localParcelOwnership = useMemo(
    () =>
      multiplayer.parcelOwnerships.find(
        (ownership) =>
          ownership.worldId === parcelWorldId && ownership.owner.id === resolvedLocalProfile.id,
      ) ?? null,
    [multiplayer.parcelOwnerships, parcelWorldId, resolvedLocalProfile.id],
  )
  const localOwnedParcel = useMemo(
    () =>
      localParcelOwnership
        ? (liveParcelAllocation.parcels.find(
            (parcel) => parcel.id === localParcelOwnership.parcelId,
          ) ?? null)
        : null,
    [liveParcelAllocation.parcels, localParcelOwnership],
  )
  const activeBuildParcel = useMemo(
    () =>
      buildParcelId
        ? (liveParcelAllocation.parcels.find((parcel) => parcel.id === buildParcelId) ?? null)
        : null,
    [buildParcelId, liveParcelAllocation.parcels],
  )
  const liveViewerLandSurface = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.viewer-land-surface', () =>
        createPascalWaterViewerLandSurface(liveLandSurface),
      ),
    [activeProfileMeasure, liveLandSurface],
  )
  const progressiveRevealOrigin = useMemo(
    () => centroidForPolygon(liveViewerLandSurface.grassSurfacePoints),
    [liveViewerLandSurface.grassSurfacePoints],
  )
  const progressiveReveal = usePascalMultiplayerIslandProgressiveReveal(
    progressiveRevealOrigin,
    experience === 'pascal-multiplayer-island',
  )
  const bladeSubdivisions = useMemo(
    () =>
      Math.min(
        profileBladeSubdivisions ?? Number.POSITIVE_INFINITY,
        isGrassFieldPreviewing
          ? Math.min(
              PASCAL_WATER_PROGRESSIVE_GRASS_BLADE_SUBDIVISIONS,
              resolveGrassWebGpuBladeSubdivisions(renderGrassTuning.density),
            )
          : resolveGrassWebGpuBladeSubdivisions(renderGrassTuning.density),
      ),
    [isGrassFieldPreviewing, profileBladeSubdivisions, renderGrassTuning.density],
  )
  const pascalWaterScene = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.initial-scene-graph', () =>
        createPascalWaterSceneGraph({
          elevationParameters: PASCAL_WATER_ELEVATION_PARAMETERS,
          fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
          islandParameters: WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
          layoutConfig: experienceConfig,
          materialParameters: PASCAL_WATER_MATERIAL_PARAMETERS,
          omitWaterNode: startupProfileNoWaterNode,
          profilePlainWaterMaterial,
          showDepthReference: false,
          terrainFieldResolution: WATER_FIELD_RESOLUTION,
          waterFieldDebugMode,
        }),
      ),
    [
      activeProfileMeasure,
      experienceConfig,
      profilePlainWaterMaterial,
      startupProfileNoWaterNode,
      waterFieldDebugMode,
    ],
  )
  const liveWaterNode = useMemo(
    () =>
      measurePascalWaterSetup(
        activeProfileMeasure,
        'setup.pascal-water.live-water-node',
        () =>
          createPascalWaterNode({
            elevationParameters: renderElevationParameters,
            fieldParameters: renderFieldParameters,
            materialParameters,
            perimeter: livePerimeter,
            profilePlainWaterMaterial,
            showDepthReference,
            terrainFieldResolution: renderTerrainFieldResolution,
            waterFieldDebugMode,
            waterLabSeed: liveIsland.seed,
          }).waterNode,
      ),
    [
      activeProfileMeasure,
      renderElevationParameters,
      renderFieldParameters,
      renderTerrainFieldResolution,
      liveIsland.seed,
      livePerimeter,
      materialParameters,
      profilePlainWaterMaterial,
      waterFieldDebugMode,
    ],
  )
  const liveLayoutNode = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.live-layout-node', () =>
        createPascalWaterLayoutNode({
          allocation: liveParcelAllocation,
          island: liveIsland,
          landSurface: liveLandSurface,
          layoutConfig: experienceConfig,
        }),
      ),
    [activeProfileMeasure, experienceConfig, liveIsland, liveLandSurface, liveParcelAllocation],
  )
  const liveGrassRoads = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.grass-roads', () =>
        createPascalWaterGrassRoadSegments(liveLayoutNode.roads.segments),
      ),
    [activeProfileMeasure, liveLayoutNode.roads.segments],
  )
  const hasLiveWaterNode = useScene((state) => Boolean(state.nodes[PASCAL_WATER_NODE_ID as never]))
  const hasLiveLayoutNode = useScene((state) =>
    Boolean(state.nodes[experienceConfig.layoutNodeId as never]),
  )
  const sceneNodes = useScene((state) => state.nodes)
  const builtGrassBlockers = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.built-grass-blockers', () =>
        createPascalWaterBuiltGrassBlockers(sceneNodes),
      ),
    [activeProfileMeasure, sceneNodes],
  )
  const previousGrassBlockerBuildModeRef = useRef(buildMode)
  const [visibleBladeGrassBlockers, setVisibleBladeGrassBlockers] =
    useState<readonly GrassFieldBlocker[]>(builtGrassBlockers)
  useLayoutEffect(() => {
    const wasBuildMode = previousGrassBlockerBuildModeRef.current

    if (!buildMode && wasBuildMode) {
      const latestBlockers = createPascalWaterBuiltGrassBlockers(useScene.getState().nodes)
      setVisibleBladeGrassBlockers(latestBlockers)
    } else if (!buildMode) {
      setVisibleBladeGrassBlockers(builtGrassBlockers)
    }

    previousGrassBlockerBuildModeRef.current = buildMode
  }, [buildMode, builtGrassBlockers])
  // Built objects only clear vertical blades; the flat ground texture stays stable below walls.
  const grassBlockers = PASCAL_WATER_GROUND_GRASS_BLOCKERS
  const bladeGrassBlockers = PASCAL_WATER_GROUND_GRASS_BLOCKERS
  const bladeGrassFadeBlockers = useMemo(() => {
    const fadeBlockers: GrassFieldBlocker[] = visibleBladeGrassBlockers.map(
      createPascalWaterHiddenBladeFadeBlocker,
    )
    if (buildMode && activeBuildParcel) {
      fadeBlockers.push({
        featherMeters: PASCAL_WATER_BUILD_PARCEL_BLADE_FEATHER_METERS,
        points: activeBuildParcel.points,
      })
    }
    return fadeBlockers
  }, [activeBuildParcel, buildMode, visibleBladeGrassBlockers])
  const handleLoad = useCallback(async () => pascalWaterScene.sceneGraph, [pascalWaterScene])
  const activeBuildCameraControlsInitialPose =
    buildMode && buildCameraControlsReady && !buildCameraControlsInitialPose
      ? maybePascalWaterCameraPoseToEditorInitialPose(buildCameraPoseRef.current)
      : buildCameraControlsInitialPose
  const handleBuildCameraSettled = useCallback((pose: PascalWaterCameraPose) => {
    setBuildCameraControlsInitialPose(pascalWaterCameraPoseToEditorInitialPose(pose))
    setBuildCameraControlsReady(true)
  }, [])

  useEffect(() => {
    setLocalProfile(readLocalPlayerProfile())
  }, [])

  useEffect(() => {
    if (buildMode) return
    setBuildCameraControlsInitialPose(null)
    setBuildCameraControlsReady(false)
  }, [buildMode])

  useEffect(() => {
    if (!startupProfileEnabled || !startupProfileRef.current) {
      delete window.__PASCAL_WATER_STARTUP_PROFILE__
      return
    }

    const profile = startupProfileRef.current
    window.__PASCAL_WATER_STARTUP_PROFILE__ = profile
    const profileOutput = document.createElement('pre')
    profileOutput.hidden = true
    profileOutput.dataset.pascalWaterStartupProfile = '1'
    document.body.appendChild(profileOutput)
    const flushProfileOutput = () => {
      profileOutput.textContent = JSON.stringify(profile)
    }
    flushProfileOutput()
    const intervalId = window.setInterval(flushProfileOutput, 1000)

    if (typeof PerformanceObserver === 'undefined') {
      return () => {
        window.clearInterval(intervalId)
        profileOutput.remove()
        delete window.__PASCAL_WATER_STARTUP_PROFILE__
      }
    }

    let observer: PerformanceObserver | null = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        profile.longTasks.push({
          durationMs: entry.duration,
          name: entry.name,
          startMs: entry.startTime - profile.startedAt,
        })
      }
    })
    try {
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      observer.disconnect()
      observer = null
    }
    let animationFrameObserver: PerformanceObserver | null = null
    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes ?? []
    if (supportedEntryTypes.includes('long-animation-frame')) {
      animationFrameObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const frame = entry as PerformanceEntry & {
            blockingDuration?: number
            firstUIEventTimestamp?: number
            renderStart?: number
            scripts?: Array<{
              duration?: number
              forcedStyleAndLayoutDuration?: number
              invoker?: string
              invokerType?: string
              pauseDuration?: number
              sourceChar?: number
              sourceFunctionName?: string
              sourceLine?: number
              sourceURL?: string
              windowAttribution?: string
            }>
            styleAndLayoutStart?: number
          }
          profile.animationFrames.push({
            blockingDurationMs: roundPerf(frame.blockingDuration ?? 0),
            durationMs: roundPerf(frame.duration),
            firstUIEventTimestampMs: roundPerf(frame.firstUIEventTimestamp ?? 0),
            renderStartMs: roundPerf((frame.renderStart ?? 0) - profile.startedAt),
            scripts: (frame.scripts ?? []).map((script) => ({
              durationMs: roundPerf(script.duration ?? 0),
              forcedStyleAndLayoutDurationMs: roundPerf(script.forcedStyleAndLayoutDuration ?? 0),
              invoker: script.invoker ?? '',
              invokerType: script.invokerType ?? '',
              pauseDurationMs: roundPerf(script.pauseDuration ?? 0),
              sourceChar: script.sourceChar ?? 0,
              sourceFunctionName: script.sourceFunctionName ?? '',
              sourceLine: script.sourceLine ?? 0,
              sourceURL: script.sourceURL ?? '',
              windowAttribution: script.windowAttribution ?? '',
            })),
            startMs: roundPerf(entry.startTime - profile.startedAt),
            styleAndLayoutStartMs: roundPerf((frame.styleAndLayoutStart ?? 0) - profile.startedAt),
          })
        }
      })
      try {
        animationFrameObserver.observe({ type: 'long-animation-frame', buffered: true })
      } catch {
        animationFrameObserver.disconnect()
        animationFrameObserver = null
      }
    }

    return () => {
      window.clearInterval(intervalId)
      observer?.disconnect()
      animationFrameObserver?.disconnect()
      profileOutput.remove()
      delete window.__PASCAL_WATER_STARTUP_PROFILE__
    }
  }, [startupProfileEnabled])

  useEffect(() => {
    if (initialViewModeAppliedRef.current) return
    initialViewModeAppliedRef.current = true

    const initialBuildMode =
      searchParams.get('build') === '1' || searchParams.get('pascalBuild') === '1'
    const camera = searchParams.get('camera')
    const initialMapView =
      searchParams.get('map') === '1' ||
      camera === 'layout' ||
      camera === 'topdown' ||
      camera === 'overhead'

    setBuildMode(initialBuildMode)
    setMapView(!initialBuildMode && initialMapView)
    if (initialBuildMode || initialMapView) releasePascalWaterPointerLock()
  }, [searchParams])

  useEffect(() => {
    if (!buildMode) return
    if (localOwnedParcel && activeBuildParcel?.id === localOwnedParcel.id) return
    if (localOwnedParcel) {
      setBuildParcelId(localOwnedParcel.id)
      return
    }
    setBuildMode(false)
    setBuildParcelId(null)
  }, [activeBuildParcel, buildMode, localOwnedParcel])

  useEffect(() => {
    if (!buildMode || !activeBuildParcel) return

    const pendingDeleteIds = new Set<string>()
    let deleteQueued = false
    const enforceOwnedParcel = () => {
      const scene = useScene.getState()
      const invalidIds = createPascalWaterInvalidBuildNodeIds(scene.nodes, activeBuildParcel)
      if (invalidIds.length === 0) return

      for (const id of invalidIds) pendingDeleteIds.add(id)
      if (deleteQueued) return

      deleteQueued = true
      queueMicrotask(() => {
        deleteQueued = false
        const currentScene = useScene.getState()
        const ids = [...pendingDeleteIds]
        pendingDeleteIds.clear()
        for (const id of ids) {
          if (currentScene.nodes[id as never]) currentScene.deleteNode(id as never)
        }
        if (ids.length > 0) renderScheduler.requestFrame('geometry:changed')
      })
    }

    enforceOwnedParcel()
    return useScene.subscribe(enforceOwnedParcel)
  }, [activeBuildParcel, buildMode])

  useEffect(() => {
    if (!localOwnedParcel) {
      lastSyncedBuildSnapshotSignatureRef.current = null
      return
    }

    const syncOwnedParcelBuildNodes = () => {
      const nodes = createPascalWaterSyncedBuildNodes({
        nodes: useScene.getState().nodes,
        parcel: localOwnedParcel,
        parcelWorldId,
      })
      const signature = signatureForPascalWaterBuildNodes(nodes)
      if (signature === lastSyncedBuildSnapshotSignatureRef.current) return

      lastSyncedBuildSnapshotSignatureRef.current = signature
      multiplayer.syncParcelBuildNodes(parcelWorldId, localOwnedParcel.id, nodes)
    }

    syncOwnedParcelBuildNodes()
    return useScene.subscribe(syncOwnedParcelBuildNodes)
  }, [localOwnedParcel, multiplayer.syncParcelBuildNodes, parcelWorldId])

  useEffect(() => {
    const snapshots = multiplayer.parcelBuildNodes.filter(
      (build) => build.worldId === parcelWorldId,
    )
    if (snapshots.length === 0) return

    const scene = useScene.getState()
    for (const build of snapshots) {
      const parcel = liveParcelAllocation.parcels.find(
        (candidate) => candidate.id === build.parcelId,
      )
      if (!parcel) continue
      if (buildMode && build.updatedBy === resolvedLocalProfile.id) continue

      const nodes = sanitizePascalWaterIncomingBuildNodes(build, parcelWorldId, parcel)
      const signature = signatureForPascalWaterBuildNodes(nodes)
      const snapshotKey = `${build.worldId}:${build.parcelId}`
      if (lastAppliedBuildSnapshotSignatureRef.current.get(snapshotKey) === signature) continue

      lastAppliedBuildSnapshotSignatureRef.current.set(snapshotKey, signature)
      applyPascalWaterBuildSnapshot(scene, build.parcelId, nodes)
    }
  }, [
    buildMode,
    liveParcelAllocation.parcels,
    multiplayer.parcelBuildNodes,
    parcelWorldId,
    resolvedLocalProfile.id,
  ])

  useEffect(
    () => () => {
      delete window.__PASCAL_BENCH_ORBITING__
      useScene.getState().unloadScene()
    },
    [],
  )

  useEffect(() => {
    if (!benchmarkOrbiting) {
      delete window.__PASCAL_BENCH_ORBITING__
      return
    }

    window.__PASCAL_BENCH_ORBITING__ = true
    return () => {
      delete window.__PASCAL_BENCH_ORBITING__
    }
  }, [benchmarkOrbiting])

  useEffect(() => {
    const editor = useEditor.getState()
    const viewer = useViewer.getState()
    const sidebar = useSidebarStore.getState()

    viewer.setCameraMode('perspective')
    viewer.setColorPreset('clay')
    viewer.setShading('rendered')
    viewer.setTextures(true)
    viewer.setShowGrid(buildMode)
    viewer.setShadows(false)
    viewer.setWallMode('up')
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: PASCAL_WATER_BUILDING_ID as never,
      levelId: PASCAL_WATER_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    editor.setFirstPersonMode(false)
    editor.setPreviewMode(false)
    editor.setViewMode('3d')
    sidebar.setIsCollapsed(true)
    syncPascalMultiplayerIslandBuildEditorMode(buildMode)

    renderScheduler.requestFrame('geometry:changed')
  }, [buildMode])

  useEffect(() => {
    if (!hasLiveLayoutNode) return
    syncPascalMultiplayerIslandBuildEditorMode(buildMode)
    renderScheduler.requestFrame('geometry:changed')
  }, [buildMode, hasLiveLayoutNode])

  useEffect(() => {
    if (viewMode === 'player') return
    mobileJoystickRef.current = null
    releasePascalWaterPointerLock()
  }, [viewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || event.repeat) return
      if (event.code === 'KeyM') {
        event.preventDefault()
        if (buildMode) {
          enterMapView()
          return
        }
        if (mapView) {
          enterPlayerView()
          return
        }
        enterMapView()
        return
      }
      if (event.code === 'KeyB') {
        event.preventDefault()
        if (buildMode) {
          enterPlayerView()
          return
        }
        if (!localOwnedParcel) return
        enterBuildView(localOwnedParcel.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    buildMode,
    enterBuildView,
    enterMapView,
    enterPlayerView,
    localOwnedParcel,
    mapView,
    viewMode,
  ])

  useEffect(() => {
    const scene = useScene.getState()
    if (hasLiveWaterNode) {
      const existingWaterNode = scene.nodes[PASCAL_WATER_NODE_ID as never] as
        | PascalWaterNode
        | undefined
      const skipIdenticalDebugWaterNode =
        waterFieldDebugMode === 'cached-worker' &&
        existingWaterNode &&
        createPascalWaterNodeRenderSignature(existingWaterNode) ===
          createPascalWaterNodeRenderSignature(liveWaterNode)
      if (!skipIdenticalDebugWaterNode) {
        scene.updateNode(PASCAL_WATER_NODE_ID as never, liveWaterNode as never)
      }
    }
    if (hasLiveLayoutNode) {
      scene.updateNode(experienceConfig.layoutNodeId as never, liveLayoutNode as never)
    }
    window.__PASCAL_WATER_DEBUG__ = {
      features: [
        'pascal-editor-canvas',
        'pascal-water-node',
        'pascal-landrush-layout-node',
        'pascal-build-grid-aligned-to-grass-plane',
        'build-chrome-hidden-until-toggle',
        'donated-water-field-texture',
        'world-multiplayer-water-material',
        'world-multiplayer-full-water-plane',
        'donated-shore-contours',
        'world-multiplayer-dirt-copy-parcels',
        'world-multiplayer-dirt-copy-edge-paths',
        'water-scene-cliff-ring',
        'grass-water-blades',
        'grass-water-stylized-trees',
        'grass-water-road-masked-spawn-field',
        'world-multiplayer-local-player',
        'world-multiplayer-remote-players',
        'world-multiplayer-status-panel',
        'debug-water-sliders',
        'editor-panels-reserved-for-build-mode',
        ...(waterFieldDebugMode === 'cached-worker' ? ['water-field-debug-cached-worker'] : []),
      ],
      layoutNodeId: liveLayoutNode.id,
      layoutNodeKind: liveLayoutNode.type,
      materialParameters:
        liveWaterNode.materialParameters as Partial<LandrushWaterSurfaceParameters>,
      nodeId: liveWaterNode.id,
      source: experienceConfig.debugSource,
      worldLayout: {
        parcels: liveLayoutNode.parcels.length,
        roadSegments: liveLayoutNode.roads.segments.length,
      },
    }
    renderScheduler.requestFrame('geometry:changed')

    return () => {
      delete window.__PASCAL_WATER_DEBUG__
    }
  }, [
    experienceConfig,
    hasLiveLayoutNode,
    hasLiveWaterNode,
    liveLayoutNode,
    liveWaterNode,
    waterFieldDebugMode,
  ])

  const resetParameters = () => {
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setFieldParameters({ ...WATER_LAB_DEFAULT_FIELD_PARAMETERS })
    setElevationParameters({ ...PASCAL_WATER_ELEVATION_PARAMETERS })
    setMaterialParameters({ ...PASCAL_WATER_MATERIAL_PARAMETERS })
    setGrassTuning({ ...PASCAL_WATER_GRASS_TUNING })
    setTerrainFieldResolution(WATER_FIELD_RESOLUTION)
  }
  const handleLoadingLoaded = useCallback(() => setLoadingActive(false), [])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0f1720] [&_canvas]:h-full [&_canvas]:w-full">
      <div
        aria-hidden={loadingActive}
        className={[
          'absolute inset-0 transition-[filter,transform,opacity] duration-500 ease-out',
          loadingActive
            ? 'pointer-events-none scale-[1.01] blur-[7px] brightness-75'
            : 'scale-100 blur-0 brightness-100',
        ].join(' ')}
      >
        <PascalWaterStartupReactProfiler
          enabled={startupProfileEnabled}
          id="pascal-water.editor"
          onRender={handleStartupReactRender}
        >
          <Editor
            layoutVersion="v2"
            onLoad={handleLoad}
            projectId={experienceConfig.projectId}
            showEditorChrome={buildMode}
            sidebarTabs={[]}
            viewerCameraControls={buildMode && buildCameraControlsReady}
            viewerCameraInitialPose={activeBuildCameraControlsInitialPose}
            viewerDefaultCamera={false}
            viewerEditorSystems={buildMode}
            viewerPostProcessing={false}
            viewerRendererBackend={viewerRendererBackend}
            viewerSceneChildren={
              <PascalWaterStartupReactProfiler
                enabled={startupProfileEnabled}
                id="pascal-water.viewer-scene-children"
                onRender={handleStartupReactRender}
              >
                <color args={['#164a77']} attach="background" />
                <FrameLoadProfilerProbe enabled={frameProfile} />
                <PascalWaterEditorOverlayLayerBridge enabled={buildMode} />
                <PascalWaterPlayerLayer
                  baseNode={liveLayoutNode}
                  buildCameraPoseRef={buildCameraPoseRef}
                  grassInteractionRef={grassInteractionRef}
                  localMotionRef={localMotionRef}
                  localProfile={resolvedLocalProfile}
                  mapCameraPoseRef={mapCameraPoseRef}
                  mapTransitionStartPoseRef={mapTransitionStartPoseRef}
                  mobileJoystickRef={mobileJoystickRef}
                  onExitBuildMode={enterPlayerView}
                  onLocalPlayerChange={multiplayer.publishLocalPlayer}
                  perfRun={activePerfRun}
                  playerCameraPoseRef={playerCameraPoseRef}
                  playerReturnCameraPoseRef={playerReturnCameraPoseRef}
                  remotePlayers={multiplayer.remotePlayers}
                  surface={liveViewerLandSurface}
                  viewMode={viewMode}
                />
                <PascalWaterParcelOwnershipLayer
                  allocation={liveParcelAllocation}
                  buildParcelId={buildParcelId}
                  buildMode={buildMode}
                  claimParcel={multiplayer.claimParcel}
                  localMotionRef={localMotionRef}
                  localProfile={resolvedLocalProfile}
                  mapView={viewMode === 'map'}
                  onBuildParcel={(parcel) => {
                    enterBuildView(parcel.id)
                  }}
                  parcelClaimError={multiplayer.parcelClaimError}
                  parcelOwnerships={multiplayer.parcelOwnerships}
                  parcelWorldId={parcelWorldId}
                  surface={liveViewerLandSurface}
                  watchParcelWorld={multiplayer.watchParcelWorld}
                />
                <PascalWaterBuildParcelGuardLayer
                  buildMode={buildMode}
                  groundY={liveViewerLandSurface.grassSurfaceElevation}
                  parcel={activeBuildParcel}
                />
                <PascalWaterBuildCameraRig
                  buildCameraPoseRef={buildCameraPoseRef}
                  captureEditorCameraPose={buildCameraControlsReady}
                  groundY={liveViewerLandSurface.grassSurfaceElevation}
                  onSettled={handleBuildCameraSettled}
                  parcel={activeBuildParcel}
                  playerCameraPoseRef={playerCameraPoseRef}
                  visible={buildMode}
                />
                {!startupProfileNoLandLayers ? (
                  <PascalWaterStartupReactProfiler
                    enabled={startupProfileEnabled}
                    id="pascal-water.land-layers"
                    onRender={handleStartupReactRender}
                  >
                    <Suspense fallback={null}>
                      <GrassWaterLandLayers
                        bladeFadeBlockers={bladeGrassFadeBlockers}
                        bladeSubdivisions={bladeSubdivisions}
                        bladeGrassBlockers={bladeGrassBlockers}
                        fieldResolution={PASCAL_WATER_PROGRESSIVE_GRASS_FIELD_RESOLUTION}
                        finalFieldResolution={
                          isGrassFieldPreviewing
                            ? PASCAL_WATER_PROGRESSIVE_GRASS_FIELD_RESOLUTION
                            : PASCAL_WATER_INTERACTIVE_GRASS_FIELD_RESOLUTION
                        }
                        finalSpawnResolution={
                          isGrassFieldPreviewing
                            ? PASCAL_WATER_PROGRESSIVE_GRASS_FIELD_RESOLUTION
                            : PASCAL_WATER_INTERACTIVE_GRASS_FIELD_RESOLUTION
                        }
                        bladeRenderOrder={
                          buildMode ? PASCAL_WATER_BUILD_GRASS_BLADE_RENDER_ORDER : undefined
                        }
                        grassDebugState={{
                          buildMode,
                          source: 'pascal-multiplayer-island-progressive',
                        }}
                        grassInteractionRef={grassInteractionRef}
                        grassBlockers={grassBlockers}
                        groundRenderOrder={
                          buildMode ? PASCAL_WATER_BUILD_GRASS_GROUND_RENDER_ORDER : undefined
                        }
                        profileMeasure={activeProfileMeasure}
                        progressiveReveal={progressiveReveal}
                        roads={liveGrassRoads}
                        showBlades={!startupProfileNoStylizedBlades}
                        showGround
                        showTrees={!startupProfileNoStylizedTrees}
                        spawnResolution={PASCAL_WATER_PROGRESSIVE_GRASS_FIELD_RESOLUTION}
                        stylizedGroundTexture={!startupProfileNoStylizedGround}
                        stylizedGroundTextureWorldSizeMeters={
                          PASCAL_WATER_GRASS_TEXTURE_TILE_METERS
                        }
                        stylizedSceneLayout
                        surface={liveViewerLandSurface}
                        tuning={renderGrassTuning}
                      />
                    </Suspense>
                  </PascalWaterStartupReactProfiler>
                ) : null}
                <PascalWaterBuildGridOverlay
                  groundY={liveViewerLandSurface.grassSurfaceElevation}
                  visible={buildMode}
                />
              </PascalWaterStartupReactProfiler>
            }
            viewerUseBvh={false}
          />
        </PascalWaterStartupReactProfiler>
        <MultiplayerStatusPanel
          connection={multiplayer.connection}
          localPlayerIncluded={!offline}
          remotePlayerCount={multiplayer.remotePlayers.length}
          status={multiplayerStatus}
        />
        <div className="pointer-events-auto absolute top-[24vh] right-5 z-[80] flex flex-col gap-2">
          <button
            aria-label="Map mode"
            aria-pressed={mapView && !buildMode}
            className={pascalWaterModeButtonClass(mapView && !buildMode)}
            data-landrush-map-toggle
            onClick={() => {
              if (buildMode) {
                enterMapView()
                return
              }
              if (mapView) {
                enterPlayerView()
                return
              }
              enterMapView()
            }}
            type="button"
          >
            M
          </button>
          <button
            aria-label="Build mode"
            aria-pressed={buildMode}
            className={pascalWaterModeButtonClass(buildMode)}
            data-landrush-build-toggle
            onClick={() => {
              if (buildMode) {
                enterPlayerView()
                return
              }
              if (!localOwnedParcel) return
              enterBuildView(localOwnedParcel.id)
            }}
            type="button"
          >
            B
          </button>
        </div>
        {showTunePanel ? (
          <PascalWaterTunePanel
            elevationParameters={elevationParameters}
            fieldParameters={fieldParameters}
            grassTuning={grassTuning}
            islandParameters={islandParameters}
            materialParameters={materialParameters}
            onClose={() => setShowTunePanel(false)}
            onElevationChange={(key, value) =>
              setElevationParameters((current) => ({ ...current, [key]: value }))
            }
            onFieldChange={(key, value) =>
              setFieldParameters((current) => ({ ...current, [key]: value }))
            }
            onGrassChange={(key, value) =>
              setGrassTuning((current) => ({ ...current, [key]: value }))
            }
            onIslandChange={(key, value) =>
              setIslandParameters((current) => ({ ...current, [key]: value }))
            }
            onMaterialChange={(key, value) =>
              setMaterialParameters(
                (current) => ({ ...current, [key]: value }) as LandrushWaterSurfaceParameters,
              )
            }
            onReset={resetParameters}
            onTerrainFieldResolutionChange={(value) => setTerrainFieldResolution(Math.round(value))}
            terrainFieldResolution={terrainFieldResolution}
          />
        ) : (
          <button
            className="pointer-events-auto absolute top-5 right-5 inline-flex items-center gap-2 rounded-md border border-white/25 bg-slate-950/78 px-3 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur transition hover:border-white/45 hover:text-white"
            onClick={() => setShowTunePanel(true)}
            type="button"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Sliders
          </button>
        )}
        {viewMode === 'player' ? <MobileMovementJoystick movementRef={mobileJoystickRef} /> : null}
      </div>
      {localFirstProgressiveLoading ? null : (
        <PascalWaterLoadingOverlay onLoaded={handleLoadingLoaded} />
      )}
    </main>
  )
}

function PascalWaterLoadingOverlay({ onLoaded }: { onLoaded: () => void }) {
  const { progress, visible } = usePascalWaterLoadingProgress()
  const percent = Math.round(clamp(progress, 0, 100))
  const complete = percent >= 100

  useEffect(() => {
    if (complete) onLoaded()
  }, [complete, onLoaded])

  if (!visible) return null

  return (
    <div
      aria-live="polite"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className={[
        'pointer-events-auto absolute inset-0 z-[220] grid place-items-center bg-slate-950/18 transition-opacity duration-500',
        complete ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      role="progressbar"
    >
      <div className="w-[50vw] max-w-[760px]">
        <div className="mb-3 flex items-center justify-between text-white">
          <span className="font-medium text-sm tracking-[0.18em] uppercase">Loading</span>
          <span className="font-mono text-sm tabular-nums">{percent}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full border border-white/24 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div
            className="h-full origin-left rounded-full bg-gradient-to-r from-amber-200 via-lime-200 to-sky-200 transition-transform duration-100 ease-linear"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
      </div>
    </div>
  )
}

function PascalWaterTunePanel({
  elevationParameters,
  fieldParameters,
  grassTuning,
  islandParameters,
  materialParameters,
  onClose,
  onElevationChange,
  onFieldChange,
  onGrassChange,
  onIslandChange,
  onMaterialChange,
  onReset,
  onTerrainFieldResolutionChange,
  terrainFieldResolution,
}: {
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  grassTuning: GrassBladeTuning
  islandParameters: WaterLabIslandParameters
  materialParameters: LandrushWaterSurfaceParameters
  onClose: () => void
  onElevationChange: (key: ElevationSliderKey, value: number) => void
  onFieldChange: (key: FieldSliderKey, value: number) => void
  onGrassChange: (key: keyof GrassBladeTuning, value: number) => void
  onIslandChange: (key: IslandSliderKey, value: number) => void
  onMaterialChange: (key: WaterMaterialSliderKey, value: number) => void
  onReset: () => void
  onTerrainFieldResolutionChange: (value: number) => void
  terrainFieldResolution: number
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<PascalWaterTuningGroupId, boolean>>(
    {
      grass: true,
      island: true,
      waterAreas: true,
      waterEdge: true,
      waterRipples: false,
    },
  )
  const toggleGroup = (group: PascalWaterTuningGroupId) => {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  return (
    <section className="pointer-events-auto absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[min(390px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">Pascal water</div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            aria-label="Reset"
            className="inline-flex size-7 items-center justify-center rounded border border-white/20 text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onReset}
            type="button"
          >
            <RotateCcw aria-hidden className="size-3.5" />
          </button>
          <button
            aria-label="Close sliders"
            className="inline-flex size-7 items-center justify-center rounded border border-white/20 text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <PascalWaterTuningGroup
          collapsed={collapsedGroups.island}
          onToggle={() => toggleGroup('island')}
          title="Water island"
        >
          {WATER_LAB_ISLAND_SLIDERS.map(({ key, ...slider }) => (
            <PascalWaterTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onIslandChange(key, value)}
              value={islandParameters[key]}
            />
          ))}
          <PascalWaterTuneSlider
            label="field resolution"
            max={WATER_FIELD_RESOLUTION}
            min={128}
            onChange={onTerrainFieldResolutionChange}
            step={64}
            value={terrainFieldResolution}
          />
        </PascalWaterTuningGroup>
        <PascalWaterTuningGroup
          collapsed={collapsedGroups.waterAreas}
          onToggle={() => toggleGroup('waterAreas')}
          title="Water areas"
        >
          {FIELD_SLIDERS.map(({ key, ...slider }) => (
            <PascalWaterTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onFieldChange(key, value)}
              value={fieldParameters[key]}
            />
          ))}
        </PascalWaterTuningGroup>
        <PascalWaterTuningGroup
          collapsed={collapsedGroups.waterEdge}
          onToggle={() => toggleGroup('waterEdge')}
          title="Raised edge"
        >
          {ELEVATION_SLIDERS.map(({ key, ...slider }) => (
            <PascalWaterTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onElevationChange(key, value)}
              value={elevationParameters[key]}
            />
          ))}
        </PascalWaterTuningGroup>
        <PascalWaterTuningGroup
          collapsed={collapsedGroups.waterRipples}
          onToggle={() => toggleGroup('waterRipples')}
          title="Water ripples"
        >
          {WATER_MATERIAL_SLIDERS.map(({ key, ...slider }) => (
            <PascalWaterTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onMaterialChange(key, value)}
              value={materialParameters[key]}
            />
          ))}
        </PascalWaterTuningGroup>
        <PascalWaterTuningGroup
          collapsed={collapsedGroups.grass}
          onToggle={() => toggleGroup('grass')}
          title="Grass and trees"
        >
          {PASCAL_WATER_GRASS_SLIDERS.map(({ key, ...slider }) => (
            <PascalWaterTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onGrassChange(key, value)}
              value={grassTuning[key]}
            />
          ))}
        </PascalWaterTuningGroup>
      </div>
    </section>
  )
}

function PascalWaterTuningGroup({
  children,
  collapsed,
  onToggle,
  title,
}: {
  children: React.ReactNode
  collapsed: boolean
  onToggle: () => void
  title: string
}) {
  const ToggleIcon = collapsed ? ChevronRight : ChevronDown
  return (
    <div className="overflow-hidden rounded border border-white/14 bg-white/[0.03]">
      <button
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-white/78 transition hover:bg-white/[0.04] hover:text-white"
        onClick={onToggle}
        type="button"
      >
        <span>{title}</span>
        <ToggleIcon aria-hidden className="size-3.5 shrink-0" />
      </button>
      <div className={collapsed ? 'hidden' : 'grid gap-3 border-white/10 border-t px-3 py-3'}>
        {children}
      </div>
    </div>
  )
}

function PascalWaterTuneSlider({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="flex items-center justify-between gap-3">
        <span className="text-white/70">{label}</span>
        <input
          className="h-6 w-20 rounded border border-white/18 bg-white/8 px-1.5 text-right font-mono text-[11px] text-white outline-none focus:border-lime-300/70"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={step}
          type="number"
          value={formatTuningValue(value, step)}
        />
      </span>
      <input
        className="h-5 w-full accent-lime-300"
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

function formatTuningValue(value: number, step = 0.01) {
  if (!Number.isFinite(value)) return '--'
  if (step < 0.005) return value.toFixed(3)
  if (step < 0.05) return value.toFixed(2)
  if (step < 0.5) return value.toFixed(1)
  return String(Math.round(value))
}

function pascalWaterModeButtonClass(active: boolean) {
  return [
    'grid size-11 place-items-center rounded-full border font-semibold text-sm shadow-xl backdrop-blur transition',
    active
      ? 'border-amber-100/64 bg-amber-300 text-slate-950 shadow-[0_0_22px_rgba(245,207,120,0.22)]'
      : 'border-white/22 bg-slate-950/70 text-white/78 hover:border-white/42 hover:bg-slate-900/84 hover:text-white',
  ].join(' ')
}

function PascalWaterEditorOverlayLayerBridge({ enabled }: { enabled: boolean }) {
  const { camera, raycaster } = useThree()

  useEffect(() => {
    if (!enabled) return
    camera.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(EDITOR_LAYER)
  }, [camera, enabled, raycaster])

  return null
}

function PascalWaterBuildParcelGuardLayer({
  buildMode,
  groundY,
  parcel,
}: {
  buildMode: boolean
  groundY: number
  parcel: ParcelAllocationParcel | null
}) {
  const { camera, gl } = useThree()
  const pointerNdc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])

  useEffect(() => {
    if (!buildMode) return

    const canvas = gl.domElement
    const isInsideParcel = (event: MouseEvent | PointerEvent) => {
      if (!parcel) return false

      const point = pickPascalWaterBuildGroundPoint({
        camera,
        canvas,
        event,
        groundY,
        pointerNdc,
        raycaster,
      })
      return Boolean(point && pointInPolygonOrNearEdge(point, parcel.points))
    }
    const blockOutsideParcel = (event: MouseEvent | PointerEvent) => {
      if ('button' in event && event.button !== 0) return
      if (isInsideParcel(event)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    canvas.addEventListener('pointerdown', blockOutsideParcel, { capture: true })
    canvas.addEventListener('pointerup', blockOutsideParcel, { capture: true })
    canvas.addEventListener('click', blockOutsideParcel, { capture: true })
    canvas.addEventListener('dblclick', blockOutsideParcel, { capture: true })
    return () => {
      canvas.removeEventListener('pointerdown', blockOutsideParcel, true)
      canvas.removeEventListener('pointerup', blockOutsideParcel, true)
      canvas.removeEventListener('click', blockOutsideParcel, true)
      canvas.removeEventListener('dblclick', blockOutsideParcel, true)
    }
  }, [buildMode, camera, gl, groundY, parcel, pointerNdc, raycaster])

  return null
}

function PascalWaterBuildCameraRig({
  buildCameraPoseRef,
  captureEditorCameraPose,
  groundY,
  onSettled,
  parcel,
  playerCameraPoseRef,
  visible,
}: {
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  captureEditorCameraPose: boolean
  groundY: number
  onSettled: (pose: PascalWaterCameraPose) => void
  parcel: ParcelAllocationParcel | null
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  visible: boolean
}) {
  const controlsTarget = useMemo(() => new Vector3(), [])
  const initialPose = buildCameraPoseRef.current ?? playerCameraPoseRef.current
  const initialPosition = initialPose
    ? ([initialPose.position.x, initialPose.position.y, initialPose.position.z] as const)
    : ([0, 4.5, -8.2] as const)

  useEffect(() => {
    if (!visible || parcel) return
    buildCameraPoseRef.current = null
  }, [buildCameraPoseRef, parcel, visible])

  useFrame((state) => {
    if (!visible || !parcel || !captureEditorCameraPose) return

    const controls = getPascalWaterCameraControls(state)
    const target = readPascalWaterCameraControlsTarget(controls, controlsTarget) ?? controlsTarget
    writePascalWaterCameraPose(buildCameraPoseRef, state.camera, target)
  })

  if (!visible || !parcel) return null

  return (
    <>
      <PascalWaterPoseCamera fallbackPosition={initialPosition} pose={initialPose} />
      <PascalWaterCameraPoseSeed pose={initialPose} />
      <PascalWaterBuildCameraTransition
        controlsTarget={controlsTarget}
        groundY={groundY}
        buildCameraPoseRef={buildCameraPoseRef}
        key={parcel.id}
        onSettled={onSettled}
        parcel={parcel}
        playerCameraPoseRef={playerCameraPoseRef}
      />
    </>
  )
}

function PascalWaterCameraPoseSeed({ pose }: { pose: PascalWaterCameraPose | null }) {
  const camera = useThree((state) => state.camera)

  useLayoutEffect(() => {
    if (!pose) return
    camera.up.set(0, 1, 0)
    camera.position.copy(pose.position)
    camera.lookAt(pose.target)
    camera.updateMatrixWorld()
  }, [camera, pose])

  return null
}

function PascalWaterPoseCamera({
  fallbackPosition,
  fallbackTarget = PASCAL_WATER_CAMERA_TARGET,
  pose,
}: {
  fallbackPosition: readonly [number, number, number]
  fallbackTarget?: readonly [number, number, number]
  pose: PascalWaterCameraPose | null
}) {
  const position = pose
    ? ([pose.position.x, pose.position.y, pose.position.z] as const)
    : fallbackPosition

  const handleUpdate = useCallback(
    (camera: Camera) => {
      camera.up.set(0, 1, 0)
      if (pose) {
        camera.position.copy(pose.position)
        camera.lookAt(pose.target)
      } else {
        camera.lookAt(fallbackTarget[0], fallbackTarget[1], fallbackTarget[2])
      }
      camera.updateMatrixWorld()
    },
    [fallbackTarget, pose],
  )

  return (
    <PerspectiveCamera
      far={900}
      fov={48}
      makeDefault
      near={0.1}
      onUpdate={handleUpdate}
      position={position}
    />
  )
}

function PascalWaterBuildCameraTransition({
  buildCameraPoseRef,
  controlsTarget,
  groundY,
  onSettled,
  parcel,
  playerCameraPoseRef,
}: {
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  controlsTarget: Vector3
  groundY: number
  onSettled: (pose: PascalWaterCameraPose) => void
  parcel: ParcelAllocationParcel
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const directionRef = useRef<Vector3 | null>(null)
  const settledRef = useRef(false)
  const targetRef = useRef(new Vector3())
  const desiredRef = useRef(new Vector3())
  const startPositionRef = useRef(new Vector3())
  const startTargetRef = useRef(new Vector3())
  const forwardRef = useRef(new Vector3())
  const elapsedRef = useRef(0)
  const parcelRadius = useMemo(() => parcelBuildCameraRadius(parcel), [parcel])

  useFrame((state, delta) => {
    if (settledRef.current) return

    state.camera.up.set(0, 1, 0)
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const target = targetRef.current.set(parcel.centroid.x, groundY + 0.35, parcel.centroid.z)
    if (!directionRef.current) {
      const rememberedPose = buildCameraPoseRef.current ?? playerCameraPoseRef.current
      if (rememberedPose) {
        startPositionRef.current.copy(rememberedPose.position)
        startTargetRef.current.copy(rememberedPose.target)
        state.camera.position.copy(rememberedPose.position)
        state.camera.lookAt(rememberedPose.target)
      } else {
        startPositionRef.current.copy(state.camera.position)
        resolvePascalWaterBuildCameraStartTarget(
          state.camera,
          target.y,
          startTargetRef.current,
          forwardRef.current,
        )
      }
      const direction = new Vector3(
        startPositionRef.current.x - target.x,
        0,
        startPositionRef.current.z - target.z,
      )
      if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1)
      direction.normalize()
      directionRef.current = direction
      controlsTarget.copy(startTargetRef.current)
    }

    const distance = clamp(
      parcelRadius * 1.28,
      PASCAL_WATER_BUILD_CAMERA_MIN_DISTANCE,
      PASCAL_WATER_BUILD_CAMERA_MAX_DISTANCE,
    )
    const height = clamp(
      parcelRadius * 0.72,
      PASCAL_WATER_BUILD_CAMERA_MIN_HEIGHT,
      PASCAL_WATER_BUILD_CAMERA_MAX_HEIGHT,
    )
    const desired = desiredRef.current.copy(target).addScaledVector(directionRef.current, distance)
    desired.y = target.y + height

    elapsedRef.current += frameDelta
    const progress = clamp01(elapsedRef.current / PASCAL_WATER_BUILD_CAMERA_TRANSITION_SECONDS)
    const amount = progress * progress * (3 - 2 * progress)
    state.camera.position.lerpVectors(startPositionRef.current, desired, amount)
    controlsTarget.lerpVectors(startTargetRef.current, target, amount)

    state.camera.lookAt(controlsTarget)
    writePascalWaterCameraPose(buildCameraPoseRef, state.camera, controlsTarget)

    if (progress >= 1) {
      state.camera.position.copy(desired)
      controlsTarget.copy(target)
      state.camera.lookAt(target)
      writePascalWaterCameraPose(buildCameraPoseRef, state.camera, target)
      settledRef.current = true
      const finalPose =
        clonePascalWaterCameraPose(buildCameraPoseRef.current) ??
        createPascalWaterCameraPose(state.camera, target)
      onSettled(finalPose)
    }
  })

  return null
}

function resolvePascalWaterBuildCameraStartTarget(
  camera: Camera,
  targetY: number,
  target: Vector3,
  forward: Vector3,
) {
  camera.getWorldDirection(forward)
  const directionY = forward.y
  if (Math.abs(directionY) > 0.000001) {
    const distance = (targetY - camera.position.y) / directionY
    if (Number.isFinite(distance) && distance > 0) {
      return target.copy(camera.position).addScaledVector(forward, distance)
    }
  }

  return target.copy(camera.position).addScaledVector(forward, 10)
}

function PascalWaterBuildGridOverlay({ groundY, visible }: { groundY: number; visible: boolean }) {
  const gridRef = useRef<GridHelper>(null!)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    grid.renderOrder = 86
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const material of materials) {
      material.depthTest = false
      material.depthWrite = false
      material.opacity = 0.42
      material.transparent = true
      material.toneMapped = false
      material.needsUpdate = true
    }
  }, [])

  return (
    <gridHelper
      args={[
        PASCAL_WATER_BUILD_GRID_SIZE_METERS,
        PASCAL_WATER_BUILD_GRID_DIVISIONS,
        '#fff1a8',
        '#f2c86c',
      ]}
      position={[0, groundY + PASCAL_WATER_BUILD_GRID_ELEVATION_OFFSET, 0]}
      ref={gridRef}
      visible={visible}
    />
  )
}

const PASCAL_WATER_PHYSICS_COLLIDER_NODE_TYPES = new Set([
  'wall',
  'fence',
  'slab',
  'stair',
  'stair-segment',
  'roof',
  'roof-segment',
  'door',
  'window',
  'item',
])

const PASCAL_WATER_GROUND_COLLIDER_MATERIAL = new MeshBasicMaterial({
  side: DoubleSide,
  visible: false,
})

function usePascalWaterBuiltColliderWorld() {
  const physicsSignature = useScene((state) => createPascalWaterPhysicsNodeSignature(state.nodes))
  const [world, setWorld] = useState<FirstPersonColliderWorld | null>(null)
  const worldRef = useRef<FirstPersonColliderWorld | null>(null)

  const replaceWorld = useCallback((nextWorld: FirstPersonColliderWorld | null) => {
    worldRef.current?.dispose()
    worldRef.current = nextWorld
    setWorld(nextWorld)
  }, [])

  useEffect(() => {
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      const nextWorld = buildFirstPersonColliderWorldFromRegistry()
      if (cancelled) {
        nextWorld?.dispose()
        return
      }
      replaceWorld(nextWorld)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [physicsSignature, replaceWorld])

  useEffect(
    () => () => {
      worldRef.current?.dispose()
      worldRef.current = null
    },
    [],
  )

  return world
}

function createPascalWaterPhysicsNodeSignature(nodes: PascalWaterSceneStore['nodes']) {
  const entries: string[] = []
  for (const node of Object.values(nodes) as AnyNode[]) {
    if (!PASCAL_WATER_PHYSICS_COLLIDER_NODE_TYPES.has(node.type)) continue
    entries.push(`${node.id}:${node.type}:${JSON.stringify(node)}`)
  }
  return entries.sort().join('|')
}

function createPascalWaterGroundColliderMesh(points: readonly LandrushPoint2[], groundY: number) {
  const geometry = new BufferGeometry()
  const contour = points.map((point) => new Vector2(point.x, point.z))
  const triangles = ShapeUtils.triangulateShape(contour, [])
  const positions = new Float32Array(points.length * 3)
  const normals = new Float32Array(points.length * 3)

  points.forEach((point, index) => {
    const offset = index * 3
    positions[offset] = point.x
    positions[offset + 1] = groundY
    positions[offset + 2] = point.z
    normals[offset + 1] = 1
  })

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setIndex(
    triangles.flatMap((triangle) => {
      const [a, b, c] = triangle
      return a === undefined || b === undefined || c === undefined ? [] : [a, b, c, a, c, b]
    }),
  )
  geometry.computeBoundingBox()

  const bvhGeometry = geometry as BufferGeometry & {
    computeBoundsTree?: typeof computeBoundsTree
    disposeBoundsTree?: typeof disposeBoundsTree
  }
  ;(bvhGeometry as any).computeBoundsTree = computeBoundsTree
  ;(bvhGeometry as any).disposeBoundsTree = disposeBoundsTree
  bvhGeometry.computeBoundsTree()

  const mesh = new Mesh(bvhGeometry, PASCAL_WATER_GROUND_COLLIDER_MATERIAL)
  mesh.raycast = acceleratedRaycast
  mesh.visible = true
  mesh.userData = {
    excludeCollisionCheck: false,
    excludeFloatHit: false,
    friction: 0.82,
    restitution: 0.03,
    type: 'STATIC',
  }
  mesh.updateMatrixWorld(true)
  return mesh
}

function disposePascalWaterGroundColliderMesh(mesh: Mesh) {
  const geometry = mesh.geometry as BufferGeometry & {
    disposeBoundsTree?: typeof disposeBoundsTree
  }
  geometry.disposeBoundsTree?.()
  geometry.dispose()
}

function PascalWaterPlayerLayer({
  baseNode,
  buildCameraPoseRef,
  grassInteractionRef,
  localMotionRef,
  localProfile,
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  mobileJoystickRef,
  onExitBuildMode,
  onLocalPlayerChange,
  perfRun,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
  remotePlayers,
  surface,
  viewMode,
}: {
  baseNode: PascalWaterLayoutNode
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapTransitionStartPoseRef: { current: PascalWaterCameraPose | null }
  mobileJoystickRef: { current: MobileJoystickInput | null }
  onExitBuildMode: () => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: PascalWaterPerfRunOptions
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  surface: PascalWaterLandSurface
  viewMode: PascalWaterViewMode
}) {
  const spawn = useMemo(() => centroidForPolygon(surface.grassSurfacePoints), [surface])
  const groundY = surface.grassSurfaceElevation + PASCAL_WATER_ROBOT_GROUND_CLEARANCE
  const mapVisible = viewMode === 'map'
  const movementEnabled = viewMode === 'player'
  const cameraEnabled = viewMode === 'player'
  const robotPresentationMode: LandrushRobotPresentationMode =
    viewMode === 'build' ? 'hover' : 'default'

  return (
    <group>
      {mapVisible ? (
        <PascalWaterMapCameraRig
          mapCameraPoseRef={mapCameraPoseRef}
          mapTransitionStartPoseRef={mapTransitionStartPoseRef}
          playerCameraPoseRef={playerCameraPoseRef}
        />
      ) : null}
      <LocalPascalWaterRobot
        baseNode={baseNode}
        grassInteractionRef={grassInteractionRef}
        groundY={groundY}
        localMotionRef={localMotionRef}
        localProfile={localProfile}
        mobileJoystickRef={mobileJoystickRef}
        cameraEnabled={cameraEnabled}
        movementEnabled={movementEnabled}
        onExitBuildMode={onExitBuildMode}
        onLocalPlayerChange={onLocalPlayerChange}
        perfRun={perfRun}
        presentationMode={robotPresentationMode}
        buildCameraPoseRef={buildCameraPoseRef}
        playerCameraPoseRef={playerCameraPoseRef}
        playerReturnCameraPoseRef={playerReturnCameraPoseRef}
        spawn={spawn}
        surfacePoints={surface.grassSurfacePoints}
      />
      {remotePlayers.map((player) => (
        <RemotePascalWaterRobot
          baseNode={baseNode}
          groundY={groundY}
          key={player.id}
          player={player}
        />
      ))}
      <PascalWaterMapPlayerMarker
        color={localProfile.color}
        groundY={groundY}
        motionRef={localMotionRef}
        visible={mapVisible}
      />
      {remotePlayers.map((player) => (
        <PascalWaterRemoteMapPlayerMarker
          groundY={groundY}
          key={`map-${player.id}`}
          player={player}
          visible={mapVisible}
        />
      ))}
    </group>
  )
}

function PascalWaterParcelOwnershipLayer({
  allocation,
  buildMode,
  buildParcelId,
  claimParcel,
  localMotionRef,
  localProfile,
  mapView,
  onBuildParcel,
  parcelClaimError,
  parcelOwnerships,
  parcelWorldId,
  surface,
  watchParcelWorld,
}: {
  allocation: ParcelAllocationResult
  buildMode: boolean
  buildParcelId: string | null
  claimParcel: (worldId: string, parcelId: string) => boolean
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapView: boolean
  onBuildParcel: (parcel: ParcelAllocationParcel) => void
  parcelClaimError: ParcelClaimError | null
  parcelOwnerships: readonly ParcelOwnership[]
  parcelWorldId: string
  surface: PascalWaterLandSurface
  watchParcelWorld: (worldId: string) => void
}) {
  const { camera, gl } = useThree()
  const [hoveredParcelId, setHoveredParcelId] = useState<string | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null)
  const [insideOwnedParcelId, setInsideOwnedParcelId] = useState<string | null>(null)
  const insideCheckAtRef = useRef(0)
  const mapPickNdc = useMemo(() => new Vector2(), [])
  const mapPickRaycaster = useMemo(() => new Raycaster(), [])
  const ownershipMap = useMemo(() => {
    const map = new Map<string, ParcelOwnership>()
    for (const ownership of parcelOwnerships) {
      if (ownership.worldId === parcelWorldId) map.set(ownership.parcelId, ownership)
    }
    return map
  }, [parcelOwnerships, parcelWorldId])
  const localOwnership = useMemo(
    () => [...ownershipMap.values()].find((ownership) => ownership.owner.id === localProfile.id),
    [localProfile.id, ownershipMap],
  )
  const groundY = surface.grassSurfaceElevation + PASCAL_WATER_PARCEL_MAP_OVERLAY_ELEVATION_OFFSET
  const selectedParcel = useMemo(
    () => allocation.parcels.find((parcel) => parcel.id === selectedParcelId) ?? null,
    [allocation.parcels, selectedParcelId],
  )

  useEffect(() => {
    watchParcelWorld(parcelWorldId)
  }, [parcelWorldId, watchParcelWorld])

  useEffect(() => {
    if (mapView) return
    setHoveredParcelId(null)
    setSelectedParcelId(null)
  }, [mapView])

  useEffect(() => {
    if (!mapView || buildMode) return

    const canvas = gl.domElement
    const previousCursor = canvas.style.cursor
    const pickParcel = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mapPickNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      mapPickRaycaster.setFromCamera(mapPickNdc, camera)

      const directionY = mapPickRaycaster.ray.direction.y
      if (Math.abs(directionY) < 0.000001) return null

      const distance = (groundY - mapPickRaycaster.ray.origin.y) / directionY
      if (distance < 0) return null

      const point = {
        x: mapPickRaycaster.ray.origin.x + mapPickRaycaster.ray.direction.x * distance,
        z: mapPickRaycaster.ray.origin.z + mapPickRaycaster.ray.direction.z * distance,
      }
      return allocation.parcels.find((candidate) => pointInPolygon(point, candidate.points)) ?? null
    }

    const handlePointerMove = (event: PointerEvent) => {
      const parcel = pickParcel(event)
      canvas.style.cursor = parcel ? 'pointer' : previousCursor
      setHoveredParcelId((current) => (current === parcel?.id ? current : (parcel?.id ?? null)))
    }

    const handlePointerLeave = () => {
      canvas.style.cursor = previousCursor
      setHoveredParcelId(null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || buildParcelId) return

      const parcel = pickParcel(event)
      if (!parcel) return

      event.preventDefault()
      event.stopPropagation()
      setSelectedParcelId(parcel.id)
    }

    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true })
    canvas.addEventListener('pointerleave', handlePointerLeave)
    canvas.addEventListener('pointermove', handlePointerMove, { capture: true })
    return () => {
      canvas.style.cursor = previousCursor
      canvas.removeEventListener('pointerdown', handlePointerDown, true)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('pointermove', handlePointerMove, true)
    }
  }, [
    allocation.parcels,
    buildMode,
    buildParcelId,
    camera,
    gl,
    groundY,
    mapPickNdc,
    mapPickRaycaster,
    mapView,
  ])

  useFrame((state) => {
    if (mapView || !localOwnership || buildMode) {
      if (insideOwnedParcelId !== null) setInsideOwnedParcelId(null)
      return
    }

    const elapsed = state.clock.elapsedTime
    if (elapsed - insideCheckAtRef.current < 0.12) return
    insideCheckAtRef.current = elapsed

    const motion = localMotionRef.current
    const parcel = allocation.parcels.find((candidate) => candidate.id === localOwnership.parcelId)
    const nextInsideParcelId =
      motion &&
      parcel &&
      pointInPolygon({ x: motion.position.x, z: motion.position.z }, parcel.points)
        ? parcel.id
        : null
    setInsideOwnedParcelId((current) =>
      current === nextInsideParcelId ? current : nextInsideParcelId,
    )
  })

  return (
    <>
      {allocation.parcels.map((parcel) => (
        <PascalWaterParcelClaimMesh
          groundY={groundY}
          hovered={hoveredParcelId === parcel.id}
          key={parcel.id}
          mapView={mapView && !buildMode}
          onSelect={() => setSelectedParcelId(parcel.id)}
          parcel={parcel}
          selected={selectedParcelId === parcel.id || buildParcelId === parcel.id}
        />
      ))}
      {localOwnership
        ? allocation.parcels
            .filter((parcel) => parcel.id === localOwnership.parcelId)
            .map((parcel) => (
              <PascalWaterParcelBuildMarker
                groundY={groundY}
                key={parcel.id}
                mapView={mapView}
                onBuild={onBuildParcel}
                parcel={parcel}
                visible={!buildMode && (mapView || insideOwnedParcelId === parcel.id)}
              />
            ))
        : null}
      {mapView && !buildMode && selectedParcel ? (
        <PascalWaterParcelClaimDialog
          claimError={parcelClaimError}
          claimParcel={claimParcel}
          localOwnership={localOwnership}
          localProfile={localProfile}
          onClose={() => setSelectedParcelId(null)}
          ownership={ownershipMap.get(selectedParcel.id)}
          parcel={selectedParcel}
          parcelWorldId={parcelWorldId}
        />
      ) : null}
    </>
  )
}

function PascalWaterParcelClaimMesh({
  groundY,
  hovered,
  mapView,
  onSelect,
  parcel,
  selected,
}: {
  groundY: number
  hovered: boolean
  mapView: boolean
  onSelect: () => void
  parcel: ParcelAllocationParcel
  selected: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const materialRef = useRef<MeshBasicMaterial>(null!)
  const geometry = useMemo(() => createCenteredParcelGeometry(parcel), [parcel])
  const baseColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_HOVER_COLOR), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    if (mapView) return
    const material = materialRef.current
    if (material) material.opacity = 0
  }, [mapView])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    if (!group || !material) return

    const emphasis = mapView && (hovered || selected)
    const targetScale = emphasis ? PASCAL_WATER_PARCEL_MAP_OVERLAY_HOVER_SCALE : 1
    const scale = MathUtils.damp(
      group.scale.x,
      targetScale,
      PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    group.scale.setScalar(scale)

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 3.1 + parcel.index * 0.61) * 0.5
    const targetOpacity = mapView
      ? MathUtils.lerp(
          PASCAL_WATER_PARCEL_MAP_BASE_OPACITY,
          PASCAL_WATER_PARCEL_MAP_HOVER_OPACITY,
          emphasis ? 1 : 0,
        ) +
        pulse * 0.018
      : 0
    material.opacity = MathUtils.damp(
      material.opacity,
      targetOpacity,
      PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    material.color.lerpColors(baseColor, hoverColor, emphasis ? 0.26 : pulse * 0.08)
  })

  if (!mapView) return null

  return (
    <group ref={groupRef} position={[parcel.centroid.x, groundY, parcel.centroid.z]}>
      <mesh
        onClick={(event) => {
          if (!mapView) return
          event.stopPropagation()
          onSelect()
        }}
        renderOrder={75}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <primitive attach="geometry" object={geometry} />
        <meshBasicMaterial
          color={PASCAL_WATER_PARCEL_MAP_BASE_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          ref={materialRef}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  )
}

function PascalWaterParcelBuildMarker({
  groundY,
  mapView,
  onBuild,
  parcel,
  visible,
}: {
  groundY: number
  mapView: boolean
  onBuild: (parcel: ParcelAllocationParcel) => void
  parcel: ParcelAllocationParcel
  visible: boolean
}) {
  if (!visible) return null

  if (mapView) {
    return (
      <>
        <PascalWaterParcelBuildGlow groundY={groundY} parcel={parcel} />
        <Html
          center
          position={[parcel.centroid.x, groundY + 1.05, parcel.centroid.z]}
          zIndexRange={[70, 0]}
        >
          <button
            aria-label="Build"
            className="group pointer-events-auto inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-amber-100/55 bg-slate-950/72 text-xs font-semibold text-amber-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition-[width,background-color,transform] duration-200 hover:w-[5.75rem] hover:scale-105 hover:bg-slate-900/84 focus-visible:w-[5.75rem] focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onBuild(parcel)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Hammer aria-hidden className="size-4 shrink-0" />
            <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-200 group-hover:ml-1.5 group-hover:max-w-12 group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-12 group-focus-visible:opacity-100">
              Build
            </span>
          </button>
        </Html>
      </>
    )
  }

  return (
    <Html
      center
      position={[parcel.centroid.x, groundY + 1.05, parcel.centroid.z]}
      zIndexRange={[70, 0]}
    >
      <button
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-amber-100/65 bg-slate-950/72 px-3 py-2 text-xs font-semibold text-amber-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:scale-105 hover:bg-slate-900/82"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onBuild(parcel)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <Hammer aria-hidden className="size-3.5" />
        <span>Build</span>
      </button>
    </Html>
  )
}

function PascalWaterParcelBuildGlow({
  groundY,
  parcel,
}: {
  groundY: number
  parcel: ParcelAllocationParcel
}) {
  const groupRef = useRef<Group>(null!)
  const materialRef = useRef<MeshBasicMaterial>(null!)
  const geometry = useMemo(() => createCenteredParcelGeometry(parcel), [parcel])
  const baseColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_HOVER_COLOR), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    if (!group || !material) return

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 2.2 + parcel.index * 0.61) * 0.5
    const targetScale = PASCAL_WATER_PARCEL_MAP_OVERLAY_HOVER_SCALE * 0.998
    const scale = MathUtils.damp(
      group.scale.x,
      targetScale,
      PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    group.scale.setScalar(scale)
    material.opacity = MathUtils.damp(
      material.opacity,
      PASCAL_WATER_PARCEL_MAP_BASE_OPACITY * 0.62 + pulse * 0.01,
      PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    material.color.lerpColors(baseColor, hoverColor, 0.16 + pulse * 0.05)
  })

  return (
    <group ref={groupRef} position={[parcel.centroid.x, groundY + 0.015, parcel.centroid.z]}>
      <mesh renderOrder={76} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive attach="geometry" object={geometry} />
        <meshBasicMaterial
          color={PASCAL_WATER_PARCEL_MAP_BASE_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          ref={materialRef}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  )
}

function PascalWaterParcelClaimDialog({
  claimError,
  claimParcel,
  localOwnership,
  localProfile,
  onClose,
  ownership,
  parcel,
  parcelWorldId,
}: {
  claimError: ParcelClaimError | null
  claimParcel: (worldId: string, parcelId: string) => boolean
  localOwnership: ParcelOwnership | undefined
  localProfile: LocalPlayerProfile
  onClose: () => void
  ownership: ParcelOwnership | undefined
  parcel: ParcelAllocationParcel
  parcelWorldId: string
}) {
  const isFallbackProfile = localProfile.id === PASCAL_WATER_FALLBACK_PROFILE.id
  const localAlreadyOwnsAnother = Boolean(localOwnership && localOwnership.parcelId !== parcel.id)
  const canClaim = !ownership && !localAlreadyOwnsAnother && !isFallbackProfile
  const statusText = ownership
    ? `Claimed by ${ownership.owner.name}`
    : localAlreadyOwnsAnother
      ? `You already own ${localOwnership?.parcelId}`
      : 'Free parcel'
  const errorVisible = claimError && (!claimError.parcelId || claimError.parcelId === parcel.id)

  return (
    <Html center position={[parcel.centroid.x, 2.8, parcel.centroid.z]} zIndexRange={[90, 0]}>
      <section
        className="pointer-events-auto w-64 rounded-lg border border-amber-100/24 bg-slate-950/82 p-3 text-white shadow-[0_18px_56px_rgba(0,0,0,0.42)] backdrop-blur-md"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-normal text-amber-100">
              {formatParcelLabel(parcel.id)}
            </h2>
            <p className="mt-1 text-xs text-white/64">{statusText}</p>
          </div>
          <button
            aria-label="Close parcel claim"
            className="grid size-7 place-items-center rounded-full border border-white/12 bg-white/7 text-white/72 transition hover:bg-white/12 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
        {errorVisible ? <p className="mt-2 text-xs text-rose-200">{claimError.message}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded-full border border-white/12 px-3 py-1.5 text-xs font-medium text-white/72 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full border border-amber-100/60 bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-[0_8px_24px_rgba(245,203,92,0.22)] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/12 disabled:text-white/36 disabled:shadow-none"
            disabled={!canClaim}
            onClick={() => {
              if (claimParcel(parcelWorldId, parcel.id)) onClose()
            }}
            type="button"
          >
            Claim free
          </button>
        </div>
      </section>
    </Html>
  )
}

function LocalPascalWaterRobot({
  baseNode,
  buildCameraPoseRef,
  cameraEnabled,
  grassInteractionRef,
  groundY,
  localMotionRef,
  localProfile,
  mobileJoystickRef,
  movementEnabled,
  onExitBuildMode,
  onLocalPlayerChange,
  perfRun,
  presentationMode,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
  spawn,
  surfacePoints,
}: {
  baseNode: PascalWaterLayoutNode
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  cameraEnabled: boolean
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  groundY: number
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mobileJoystickRef: { current: MobileJoystickInput | null }
  movementEnabled: boolean
  onExitBuildMode: () => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: PascalWaterPerfRunOptions
  presentationMode: LandrushRobotPresentationMode
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  spawn: LandrushPoint2
  surfacePoints: readonly LandrushPoint2[]
}) {
  const { gl } = useThree()
  const builtColliderWorld = usePascalWaterBuiltColliderWorld()
  const sceneNodesForNavigation = useScene((state) => state.nodes)
  const pressedKeysRef = useRef(new Set<string>())
  const clickMoveTargetRef = useRef<PascalWaterMoveTarget | null>(null)
  const rightHoldMoveRef = useRef<PascalWaterRightHoldMove | null>(null)
  const physicsControllerRef = useRef<BVHEcctrlApi | null>(null)
  const physicsHeadingRef = useRef(0)
  const lastPhysicsPositionRef = useRef(new Vector3(spawn.x, groundY, spawn.z))
  const targetMotionPositionRef = useRef(new Vector3(spawn.x, groundY, spawn.z))
  const lastSentAtRef = useRef(0)
  const surfacePointsRef = useRef(surfacePoints)
  const clickMovePointerNdc = useMemo(() => new Vector2(), [])
  const clickMoveRaycaster = useMemo(() => new Raycaster(), [])
  const groundColliderMesh = useMemo(
    () => createPascalWaterGroundColliderMesh(surfacePoints, groundY),
    [groundY, surfacePoints],
  )
  const colliderMeshes = useMemo(
    () =>
      builtColliderWorld ? [groundColliderMesh, builtColliderWorld.mesh] : [groundColliderMesh],
    [builtColliderWorld, groundColliderMesh],
  )
  const navigationObstacles = useMemo(
    () => createPascalWaterNavigationObstacles(sceneNodesForNavigation),
    [sceneNodesForNavigation],
  )
  const nodeRef = useRef<LandrushWorldNode>(
    createPascalWaterRobotActorNode(baseNode, localProfile.id, spawn, groundY),
  )
  const motionRef = useRef<RobotMotion>({
    cameraSnapVersion: 0,
    heading: 0,
    isMoving: false,
    position: new Vector3(spawn.x, groundY, spawn.z),
    speed: 0,
    velocity: new Vector3(),
  })
  surfacePointsRef.current = surfacePoints

  useEffect(
    () => () => {
      disposePascalWaterGroundColliderMesh(groundColliderMesh)
    },
    [groundColliderMesh],
  )

  useEffect(() => {
    localMotionRef.current = motionRef.current
    return () => {
      if (localMotionRef.current === motionRef.current) localMotionRef.current = null
    }
  }, [localMotionRef])

  const publishCurrentPlayerRef = useRef<() => void>(() => {})
  const publishCurrentPlayer = useCallback(() => {
    const motion = motionRef.current
    onLocalPlayerChange(
      createPascalWaterPlayerSnapshot({
        heading: motion.heading,
        localProfile,
        moving: motion.isMoving,
        position: [motion.position.x, motion.position.y, motion.position.z],
        speed: motion.speed,
      }),
    )
  }, [localProfile, onLocalPlayerChange])
  publishCurrentPlayerRef.current = publishCurrentPlayer

  const resetToSpawn = useCallback(() => {
    const motion = motionRef.current
    motion.position.set(spawn.x, groundY, spawn.z)
    motion.velocity.set(0, 0, 0)
    motion.heading = 0
    motion.isMoving = false
    motion.speed = 0
    motion.cameraSnapVersion += 1
    physicsHeadingRef.current = 0
    lastPhysicsPositionRef.current.set(spawn.x, groundY, spawn.z)
    targetMotionPositionRef.current.set(spawn.x, groundY, spawn.z)
    const physicsGroup = physicsControllerRef.current?.group
    if (physicsGroup) {
      physicsGroup.position.set(
        spawn.x,
        groundY + PASCAL_WATER_ROBOT_PHYSICS_CENTER_FROM_ROOT,
        spawn.z,
      )
      physicsControllerRef.current?.resetLinVel()
      physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
    }
    grassInteractionRef.current = {
      radius: PASCAL_WATER_ROBOT_GRASS_INTERACTION_RADIUS,
      speed: 0,
      strength: PASCAL_WATER_ROBOT_GRASS_IDLE_BEND_STRENGTH,
      x: motion.position.x,
      z: motion.position.z,
    }
    writeMotionToPascalWaterRobotNode(nodeRef.current, motion)
    publishCurrentPlayerRef.current()
  }, [grassInteractionRef, groundY, spawn])

  useEffect(() => {
    nodeRef.current = createPascalWaterRobotActorNode(baseNode, localProfile.id, spawn, groundY)
    resetToSpawn()
  }, [baseNode, groundY, localProfile.id, resetToSpawn, spawn])

  useEffect(() => {
    if (movementEnabled) return
    pressedKeysRef.current.clear()
    mobileJoystickRef.current = null
    clickMoveTargetRef.current = null
    rightHoldMoveRef.current = null
    physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
    physicsControllerRef.current?.resetLinVel()
  }, [mobileJoystickRef, movementEnabled])

  useEffect(() => {
    if (!movementEnabled || !perfRun.enabled) return

    let stopTimer = 0
    const startTimer = window.setTimeout(() => {
      resetToSpawn()
      pressedKeysRef.current.add('KeyW')
      if (perfRun.speed === 'run') pressedKeysRef.current.add('ShiftLeft')

      stopTimer = window.setTimeout(() => {
        pressedKeysRef.current.delete('KeyW')
        pressedKeysRef.current.delete('ShiftLeft')
      }, perfRun.durationMs)
    }, PASCAL_WATER_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(stopTimer)
      pressedKeysRef.current.delete('KeyW')
      pressedKeysRef.current.delete('ShiftLeft')
    }
  }, [movementEnabled, perfRun, resetToSpawn])

  useEffect(() => {
    const canvas = gl.domElement
    if (!movementEnabled) {
      rightHoldMoveRef.current = null
      clickMoveTargetRef.current = null
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.defaultPrevented || event.button !== 2 || event.target !== canvas) return
      event.preventDefault()
      event.stopPropagation()
      clickMoveTargetRef.current = null
      rightHoldMoveRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const active = rightHoldMoveRef.current
      if (!active || active.id !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      active.x = event.clientX
      active.y = event.clientY
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (rightHoldMoveRef.current?.id !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      rightHoldMoveRef.current = null
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (rightHoldMoveRef.current?.id === event.pointerId) {
        rightHoldMoveRef.current = null
      }
    }
    const handleContextMenu = (event: MouseEvent) => {
      if (event.target !== canvas) return
      event.preventDefault()
      event.stopPropagation()
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerCancel, true)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [clickMovePointerNdc, clickMoveRaycaster, gl, groundY, movementEnabled])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!movementEnabled || event.defaultPrevented || isEditableTarget(event.target)) return

      if (event.code === 'KeyR') {
        event.preventDefault()
        if (!event.repeat) resetToSpawn()
        return
      }

      if (!isTrackedWalkKey(event.code)) return
      event.preventDefault()
      clickMoveTargetRef.current = null
      pressedKeysRef.current.add(event.code)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isTrackedWalkKey(event.code)) return
      pressedKeysRef.current.delete(event.code)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      pressedKeysRef.current.clear()
    }
  }, [movementEnabled, resetToSpawn])

  useFrame((state) => {
    const motion = motionRef.current
    const movement = movementEnabled
      ? resolveCameraRelativeMovement(
          pressedKeysRef.current,
          state.camera,
          mobileJoystickRef.current,
        )
      : null
    if (movement) clickMoveTargetRef.current = null
    const rightHoldMovement =
      movementEnabled && !movement
        ? resolveRightHoldMovement({
            camera: state.camera,
            canvas: gl.domElement,
            groundY,
            motion,
            navigationObstacles,
            pointer: rightHoldMoveRef.current,
            pointerNdc: clickMovePointerNdc,
            raycaster: clickMoveRaycaster,
            surfacePoints: surfacePointsRef.current,
          })
        : null
    const clickMovement =
      movementEnabled && !movement && !rightHoldMovement
        ? resolveClickMoveMovement(
            motion,
            clickMoveTargetRef,
            navigationObstacles,
            surfacePointsRef.current,
          )
        : null
    const activeMovement = movement ?? rightHoldMovement ?? clickMovement

    if (activeMovement) {
      physicsHeadingRef.current = activeMovement.heading
      physicsControllerRef.current?.setMovement({
        run: isRunPressed(pressedKeysRef.current) || activeMovement.runAmount > 0.5,
        worldDirection: { x: activeMovement.x, z: activeMovement.z },
      })
      return
    }

    physicsControllerRef.current?.setMovement({
      run: false,
      worldDirection: null,
    })
  }, -2)

  useFrame((_, delta) => {
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const motion = motionRef.current
    const physicsGroup = physicsControllerRef.current?.group
    if (!physicsGroup) return

    const previousPhysics = {
      x: lastPhysicsPositionRef.current.x,
      z: lastPhysicsPositionRef.current.z,
    }
    const rawNext = {
      x: physicsGroup.position.x,
      z: physicsGroup.position.z,
    }
    const constrained = constrainToPolygon(rawNext, previousPhysics, surfacePoints)
    if (constrained.x !== rawNext.x || constrained.z !== rawNext.z) {
      physicsGroup.position.x = constrained.x
      physicsGroup.position.z = constrained.z
      physicsControllerRef.current?.resetLinVel()
    }
    lastPhysicsPositionRef.current.set(constrained.x, groundY, constrained.z)

    const rootY = physicsGroup.position.y - PASCAL_WATER_ROBOT_PHYSICS_CENTER_FROM_ROOT
    const previousMotionX = motion.position.x
    const previousMotionZ = motion.position.z
    targetMotionPositionRef.current.set(constrained.x, rootY, constrained.z)
    motion.position.lerp(
      targetMotionPositionRef.current,
      1 - Math.exp(-PASCAL_WATER_ROBOT_LOCAL_POSITION_RESPONSE * frameDelta),
    )
    motion.velocity.set(
      (motion.position.x - previousMotionX) / frameDelta,
      0,
      (motion.position.z - previousMotionZ) / frameDelta,
    )
    motion.speed = Math.hypot(motion.velocity.x, motion.velocity.z)
    motion.isMoving = motion.speed > 0.05
    motion.heading = lerpAngle(
      motion.heading,
      motion.isMoving ? physicsHeadingRef.current : motion.heading,
      clamp01(frameDelta * PASCAL_WATER_ROBOT_TURN_RESPONSE),
    )
    grassInteractionRef.current = {
      radius: PASCAL_WATER_ROBOT_GRASS_INTERACTION_RADIUS,
      speed: motion.isMoving ? motion.speed : 0,
      strength: clamp01(
        PASCAL_WATER_ROBOT_GRASS_IDLE_BEND_STRENGTH +
          (motion.speed / PASCAL_WATER_ROBOT_GRASS_FULL_BEND_SPEED) *
            (1 - PASCAL_WATER_ROBOT_GRASS_IDLE_BEND_STRENGTH),
      ),
      x: motion.position.x,
      z: motion.position.z,
    }

    writeMotionToPascalWaterRobotNode(nodeRef.current, motion)

    const now = window.performance.now()
    if (now - lastSentAtRef.current >= PASCAL_WATER_LOCAL_STATE_SEND_INTERVAL_MS) {
      lastSentAtRef.current = now
      publishCurrentPlayer()
    }
  }, 1)

  useEffect(
    () => () => {
      grassInteractionRef.current = null
    },
    [grassInteractionRef],
  )

  return (
    <>
      <KeyboardControls map={[]}>
        <BVHEcctrl
          acceleration={PASCAL_WATER_ROBOT_ACCELERATION}
          airDragFactor={0.3}
          colliderCapsuleArgs={[0.25, 0.8, 4, 8]}
          colliderMeshes={colliderMeshes}
          collisionCheckIteration={3}
          collisionPushBackDamping={0.1}
          collisionPushBackThreshold={0.001}
          debug={false}
          deceleration={PASCAL_WATER_ROBOT_DECELERATION}
          delay={0}
          fallGravityFactor={4}
          floatCheckType="BOTH"
          floatDampingC={36}
          floatHeight={0.5}
          floatPullBackHeight={0.35}
          floatSensorRadius={0.15}
          floatSpringK={1200}
          gravity={9.81}
          jumpVel={6}
          maxRunSpeed={PASCAL_WATER_ROBOT_RUN_SPEED}
          maxSlope={1.2}
          maxWalkSpeed={PASCAL_WATER_ROBOT_WALK_SPEED}
          paused={!movementEnabled}
          position={[spawn.x, groundY + PASCAL_WATER_ROBOT_PHYSICS_CENTER_FROM_ROOT, spawn.z]}
          ref={physicsControllerRef}
        />
      </KeyboardControls>
      {cameraEnabled ? (
        <PascalWaterThirdPersonCameraRig
          buildCameraPoseRef={buildCameraPoseRef}
          controllerEnabled={movementEnabled}
          motionRef={motionRef}
          playerCameraPoseRef={playerCameraPoseRef}
          playerReturnCameraPoseRef={playerReturnCameraPoseRef}
        />
      ) : null}
      <Suspense
        fallback={
          <PascalWaterRobotNodePrimitiveActor
            color={localProfile.color}
            node={nodeRef.current}
            presentationMode={presentationMode}
          />
        }
      >
        <LandrushRobot node={nodeRef.current} presentationMode={presentationMode} />
      </Suspense>
      <LandrushRobotFootstepAudio
        groundY={groundY}
        motionRef={motionRef}
        runSpeed={PASCAL_WATER_ROBOT_RUN_SPEED}
        walkSpeed={PASCAL_WATER_ROBOT_WALK_SPEED}
      />
      <PascalWaterRobotPlayerBeacon
        color={localProfile.color}
        node={nodeRef.current}
        presentationMode={presentationMode}
      />
      <PascalWaterBuildRobotExitHotspot
        motionRef={motionRef}
        onExitBuildMode={onExitBuildMode}
        visible={presentationMode === 'hover'}
      />
    </>
  )
}

function RemotePascalWaterRobot({
  baseNode,
  groundY,
  player,
}: {
  baseNode: PascalWaterLayoutNode
  groundY: number
  player: MultiplayerPlayerSnapshot
}) {
  const nodeRef = useRef<LandrushWorldNode>(
    createPascalWaterRobotActorNode(baseNode, player.id, snapshotPoint(player), groundY),
  )
  const positionRef = useRef(new Vector3(player.position[0], groundY, player.position[2]))
  const targetPositionRef = useRef(new Vector3(player.position[0], groundY, player.position[2]))
  const headingRef = useRef(player.heading)
  const targetHeadingRef = useRef(player.heading)

  useEffect(() => {
    targetPositionRef.current.set(
      player.position[0],
      player.position[1] || groundY,
      player.position[2],
    )
    targetHeadingRef.current = player.heading
  }, [groundY, player])

  useFrame((_, delta) => {
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionAmount = 1 - Math.exp(-PASCAL_WATER_REMOTE_POSITION_RESPONSE * frameDelta)
    const headingAmount = 1 - Math.exp(-PASCAL_WATER_REMOTE_HEADING_RESPONSE * frameDelta)

    positionRef.current.lerp(targetPositionRef.current, positionAmount)
    headingRef.current = lerpAngle(headingRef.current, targetHeadingRef.current, headingAmount)

    const node = nodeRef.current
    node.playerPosition = [
      positionRef.current.x,
      positionRef.current.y || groundY,
      positionRef.current.z,
    ]
    node.playerHeading = headingRef.current
    node.playerMoving = player.moving
    node.playerSpeed = player.speed
  })

  return (
    <>
      <Suspense
        fallback={
          <PascalWaterRobotNodePrimitiveActor color={player.color} node={nodeRef.current} />
        }
      >
        <LandrushRobot node={nodeRef.current} />
      </Suspense>
      <PascalWaterRobotPlayerBeacon color={player.color} node={nodeRef.current} />
    </>
  )
}

function PascalWaterMapCameraRig({
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  playerCameraPoseRef,
}: {
  mapCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapTransitionStartPoseRef: { current: PascalWaterCameraPose | null }
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const controlsTarget = useMemo(() => new Vector3(...PASCAL_WATER_MAP_CAMERA_TARGET), [])
  const [controlsEnabled, setControlsEnabled] = useState(false)
  const initialPose =
    mapTransitionStartPoseRef.current ?? mapCameraPoseRef.current ?? playerCameraPoseRef.current
  const initialPosition = initialPose
    ? ([initialPose.position.x, initialPose.position.y, initialPose.position.z] as const)
    : PASCAL_WATER_MAP_CAMERA_POSITION

  useEffect(() => {
    setControlsEnabled(false)
  }, [])

  useFrame((state) => {
    if (!controlsEnabled) return
    const controls = getRobotWorldOrbitControls(state)
    if (controls) controlsTarget.copy(controls.target)
    writePascalWaterCameraPose(mapCameraPoseRef, state.camera, controls?.target ?? controlsTarget)
  })

  return (
    <>
      <PascalWaterMapCamera
        fallbackPosition={initialPosition}
        fallbackTarget={PASCAL_WATER_MAP_CAMERA_TARGET}
        pose={initialPose}
      />
      {controlsEnabled ? (
        <OrbitControls
          dampingFactor={0.08}
          enableDamping
          enablePan
          enableRotate={false}
          enableZoom
          makeDefault
          maxZoom={PASCAL_WATER_MAP_CAMERA_MAX_ZOOM}
          minZoom={PASCAL_WATER_MAP_CAMERA_MIN_ZOOM}
          target={controlsTarget}
          zoomSpeed={0.75}
        />
      ) : null}
      <PascalWaterMapCameraTransition
        controlsTarget={controlsTarget}
        mapCameraPoseRef={mapCameraPoseRef}
        mapTransitionStartPoseRef={mapTransitionStartPoseRef}
        onSettled={() => setControlsEnabled(true)}
        playerCameraPoseRef={playerCameraPoseRef}
      />
    </>
  )
}

function PascalWaterMapCamera({
  fallbackPosition,
  fallbackTarget,
  pose,
}: {
  fallbackPosition: readonly [number, number, number]
  fallbackTarget: readonly [number, number, number]
  pose: PascalWaterCameraPose | null
}) {
  const position = pose
    ? ([pose.position.x, pose.position.y, pose.position.z] as const)
    : fallbackPosition

  const handleUpdate = useCallback(
    (camera: Camera) => {
      if (pose) {
        camera.position.copy(pose.position)
        camera.lookAt(pose.target)
      } else {
        camera.lookAt(fallbackTarget[0], fallbackTarget[1], fallbackTarget[2])
      }
      setPascalWaterMapCameraZoom(camera, PASCAL_WATER_MAP_CAMERA_ZOOM)
      camera.updateMatrixWorld()
    },
    [fallbackTarget, pose],
  )

  return (
    <OrthographicCamera
      far={900}
      makeDefault
      near={0.1}
      onUpdate={handleUpdate}
      position={position}
      zoom={PASCAL_WATER_MAP_CAMERA_ZOOM}
    />
  )
}

function PascalWaterMapCameraTransition({
  controlsTarget,
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  onSettled,
  playerCameraPoseRef,
}: {
  controlsTarget: Vector3
  mapCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapTransitionStartPoseRef: { current: PascalWaterCameraPose | null }
  onSettled: () => void
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const settledRef = useRef(false)
  const elapsedRef = useRef(0)
  const startPositionRef = useRef(new Vector3())
  const startTargetRef = useRef(new Vector3())
  const desiredRef = useRef(new Vector3(...PASCAL_WATER_MAP_CAMERA_POSITION))
  const targetRef = useRef(new Vector3(...PASCAL_WATER_MAP_CAMERA_TARGET))
  const forwardRef = useRef(new Vector3())
  const startZoomRef = useRef(PASCAL_WATER_MAP_CAMERA_ZOOM)

  useEffect(() => {
    settledRef.current = false
    elapsedRef.current = 0
  }, [])

  useFrame((state, delta) => {
    if (settledRef.current) return

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const target = targetRef.current
    const desired = desiredRef.current

    if (elapsedRef.current === 0) {
      const rememberedPose = mapTransitionStartPoseRef.current ?? playerCameraPoseRef.current
      if (rememberedPose) {
        startPositionRef.current.copy(rememberedPose.position)
        startTargetRef.current.copy(rememberedPose.target)
        state.camera.position.copy(rememberedPose.position)
        state.camera.lookAt(rememberedPose.target)
      } else {
        startPositionRef.current.copy(state.camera.position)
        resolvePascalWaterBuildCameraStartTarget(
          state.camera,
          target.y,
          startTargetRef.current,
          forwardRef.current,
        )
      }
      startZoomRef.current = resolvePascalWaterMapTransitionStartZoom(
        state.camera,
        startPositionRef.current,
        startTargetRef.current,
        desired,
        target,
      )
      setPascalWaterMapCameraZoom(state.camera, startZoomRef.current)
      controlsTarget.copy(startTargetRef.current)
    }

    elapsedRef.current += frameDelta
    const progress = clamp01(elapsedRef.current / PASCAL_WATER_BUILD_CAMERA_TRANSITION_SECONDS)
    const amount = progress * progress * (3 - 2 * progress)

    state.camera.position.lerpVectors(startPositionRef.current, desired, amount)
    controlsTarget.lerpVectors(startTargetRef.current, target, amount)
    setPascalWaterMapCameraZoom(
      state.camera,
      MathUtils.lerp(startZoomRef.current, PASCAL_WATER_MAP_CAMERA_ZOOM, amount),
    )
    state.camera.lookAt(controlsTarget)
    writePascalWaterCameraPose(mapCameraPoseRef, state.camera, controlsTarget)

    if (progress >= 1) {
      state.camera.position.copy(desired)
      controlsTarget.copy(target)
      setPascalWaterMapCameraZoom(state.camera, PASCAL_WATER_MAP_CAMERA_ZOOM)
      state.camera.lookAt(target)
      writePascalWaterCameraPose(mapCameraPoseRef, state.camera, target)
      mapTransitionStartPoseRef.current = null
      settledRef.current = true
      onSettled()
    }
  })

  return null
}

function PascalWaterThirdPersonCameraRig({
  buildCameraPoseRef,
  controllerEnabled,
  motionRef,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  controllerEnabled: boolean
  motionRef: { current: RobotMotion }
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const initialPose =
    buildCameraPoseRef.current ?? playerReturnCameraPoseRef.current ?? playerCameraPoseRef.current
  const initialPosition = initialPose
    ? ([initialPose.position.x, initialPose.position.y, initialPose.position.z] as const)
    : ([0, 4.5, -8.2] as const)

  return (
    <>
      {controllerEnabled ? (
        <PascalWaterControllerOwnedCamera fallbackPosition={initialPosition} pose={initialPose} />
      ) : (
        <>
          <PascalWaterPoseCamera fallbackPosition={initialPosition} pose={initialPose} />
          <PascalWaterCameraPoseSeed pose={initialPose} />
        </>
      )}
      {controllerEnabled ? (
        <>
          <PascalWaterThirdPersonCameraController
            buildCameraPoseRef={buildCameraPoseRef}
            motionRef={motionRef}
            onReturnSettled={noopPascalWaterCameraSettled}
            playerCameraPoseRef={playerCameraPoseRef}
            playerReturnCameraPoseRef={playerReturnCameraPoseRef}
          />
        </>
      ) : null}
    </>
  )
}

function noopPascalWaterCameraSettled() {}

function PascalWaterControllerOwnedCamera({
  fallbackPosition,
  fallbackTarget = PASCAL_WATER_CAMERA_TARGET,
  pose,
}: {
  fallbackPosition: readonly [number, number, number]
  fallbackTarget?: readonly [number, number, number]
  pose: PascalWaterCameraPose | null
}) {
  const initialPoseRef = useRef(pose)
  const initialPositionRef = useRef(
    pose ? ([pose.position.x, pose.position.y, pose.position.z] as const) : fallbackPosition,
  )
  const seededRef = useRef(false)
  const handleUpdate = useCallback(
    (camera: Camera) => {
      if (seededRef.current) return
      seededRef.current = true
      camera.up.set(0, 1, 0)
      const initialPose = initialPoseRef.current
      if (initialPose) {
        camera.position.copy(initialPose.position)
        camera.lookAt(initialPose.target)
      } else {
        camera.lookAt(fallbackTarget[0], fallbackTarget[1], fallbackTarget[2])
      }
      camera.updateMatrixWorld()
    },
    [fallbackTarget],
  )

  return (
    <PerspectiveCamera
      far={900}
      fov={48}
      makeDefault
      near={0.1}
      onUpdate={handleUpdate}
      position={initialPositionRef.current}
    />
  )
}

function PascalWaterThirdPersonCameraController({
  buildCameraPoseRef,
  motionRef,
  onReturnSettled,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  motionRef: { current: RobotMotion }
  onReturnSettled: () => void
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const { gl } = useThree()
  const cameraDistanceRef = useRef(PASCAL_WATER_ISOMETRIC_CAMERA_DISTANCE)
  const cameraPitchRef = useRef(PASCAL_WATER_ISOMETRIC_CAMERA_PITCH)
  const targetCameraPitchRef = useRef(PASCAL_WATER_ISOMETRIC_CAMERA_PITCH)
  const cameraYawRef = useRef(PASCAL_WATER_ISOMETRIC_CAMERA_INITIAL_YAW)
  const targetCameraYawRef = useRef(PASCAL_WATER_ISOMETRIC_CAMERA_INITIAL_YAW)
  const orbitKeysRef = useRef({ clockwise: false, counterClockwise: false })
  const pitchDragRef = useRef<{ id: number; pitch: number; y: number } | null>(null)
  const desiredCameraPositionRef = useRef(new Vector3())
  const targetRef = useRef(new Vector3())
  const previousTargetRef = useRef<Vector3 | null>(null)
  const returnTargetRef = useRef(new Vector3())
  const returnForwardRef = useRef(new Vector3())
  const returnTransitionRef = useRef<PascalWaterReturnCameraTransition | null>(null)
  const snapVersionRef = useRef<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return
      if (event.code !== 'KeyQ' && event.code !== 'KeyE') return

      event.preventDefault()
      if (event.code === 'KeyQ') orbitKeysRef.current.counterClockwise = true
      if (event.code === 'KeyE') orbitKeysRef.current.clockwise = true
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyQ') orbitKeysRef.current.counterClockwise = false
      if (event.code === 'KeyE') orbitKeysRef.current.clockwise = false
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      orbitKeysRef.current.clockwise = false
      orbitKeysRef.current.counterClockwise = false
    }
  }, [])

  useEffect(() => {
    const canvas = gl.domElement
    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.target !== canvas) return

      event.preventDefault()
      event.stopPropagation()
      const nextDistance =
        cameraDistanceRef.current * Math.exp(event.deltaY * PASCAL_WATER_ISOMETRIC_CAMERA_ZOOM_STEP)
      cameraDistanceRef.current = clamp(
        nextDistance,
        PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE,
        PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE,
      )
    }

    canvas.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel, true)
  }, [gl])

  useEffect(() => {
    const canvas = gl.domElement
    const handlePointerDown = (event: PointerEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.target !== canvas) return
      pitchDragRef.current = {
        id: event.pointerId,
        pitch: targetCameraPitchRef.current,
        y: event.clientY,
      }
    }
    const handlePointerMove = (event: PointerEvent) => {
      const drag = pitchDragRef.current
      if (!drag || drag.id !== event.pointerId) return

      event.preventDefault()
      const nextPitch =
        drag.pitch + (event.clientY - drag.y) * PASCAL_WATER_ISOMETRIC_CAMERA_PITCH_DRAG_SPEED
      targetCameraPitchRef.current = clamp(
        nextPitch,
        PASCAL_WATER_ISOMETRIC_CAMERA_MIN_PITCH,
        PASCAL_WATER_ISOMETRIC_CAMERA_MAX_PITCH,
      )
    }
    const handlePointerEnd = (event: PointerEvent) => {
      if (pitchDragRef.current?.id === event.pointerId) pitchDragRef.current = null
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
      pitchDragRef.current = null
    }
  }, [gl])

  useFrame((state, delta) => {
    state.camera.up.set(0, 1, 0)
    const motion = motionRef.current
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const target = targetRef.current.set(
      motion.position.x,
      motion.position.y + PASCAL_WATER_ROBOT_CAMERA_TARGET_HEIGHT,
      motion.position.z,
    )
    const returnPose = playerReturnCameraPoseRef.current
    if (returnPose) {
      let transition = returnTransitionRef.current
      if (!transition) {
        const buildPose = clonePascalWaterCameraPose(buildCameraPoseRef.current)
        const startTarget =
          buildPose?.target.clone() ??
          resolvePascalWaterBuildCameraStartTarget(
            state.camera,
            target.y,
            new Vector3(),
            returnForwardRef.current,
          )
        const targetPose =
          clonePascalWaterCameraPose(returnPose) ??
          createPascalWaterCameraPose(state.camera, target)
        const startPosition = buildPose?.position.clone() ?? state.camera.position.clone()
        transition = {
          elapsed: 0,
          startPosition,
          startTarget,
          targetPose,
        }
        returnTransitionRef.current = transition
        returnTargetRef.current.copy(transition.startTarget)
        state.camera.position.copy(transition.startPosition)
        state.camera.lookAt(transition.startTarget)
        writePascalWaterCameraPose(playerCameraPoseRef, state.camera, transition.startTarget)
      }

      transition.elapsed += frameDelta
      const progress = clamp01(transition.elapsed / PASCAL_WATER_BUILD_CAMERA_TRANSITION_SECONDS)
      const amount = progress * progress * (3 - 2 * progress)
      const transitionTarget = returnTargetRef.current.lerpVectors(
        transition.startTarget,
        transition.targetPose.target,
        amount,
      )
      state.camera.position.lerpVectors(
        transition.startPosition,
        transition.targetPose.position,
        amount,
      )
      state.camera.lookAt(transitionTarget)

      writePascalWaterCameraPose(playerCameraPoseRef, state.camera, transitionTarget)

      if (progress >= 1) {
        state.camera.position.copy(transition.targetPose.position)
        returnTargetRef.current.copy(transition.targetPose.target)
        state.camera.lookAt(transition.targetPose.target)
        syncThirdPersonCameraOrbitRefs(
          state.camera,
          transition.targetPose.target,
          cameraYawRef,
          cameraPitchRef,
          cameraDistanceRef,
        )
        targetCameraYawRef.current = cameraYawRef.current
        targetCameraPitchRef.current = cameraPitchRef.current
        cameraDistanceRef.current = clamp(
          cameraDistanceRef.current,
          PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE,
          PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE,
        )
        previousTargetRef.current = transition.targetPose.target.clone()
        snapVersionRef.current = motion.cameraSnapVersion
        buildCameraPoseRef.current = null
        playerReturnCameraPoseRef.current = null
        returnTransitionRef.current = null
        writePascalWaterCameraPose(playerCameraPoseRef, state.camera, transition.targetPose.target)
        onReturnSettled()
      }
      return
    }

    returnTransitionRef.current = null
    const previousTarget = previousTargetRef.current

    if (!previousTarget || snapVersionRef.current !== motion.cameraSnapVersion) {
      const storedYaw = playerCameraPoseRef.current?.yaw
      const yaw =
        typeof storedYaw === 'number' && Number.isFinite(storedYaw)
          ? storedYaw
          : PASCAL_WATER_ISOMETRIC_CAMERA_INITIAL_YAW
      const storedDistance = playerCameraPoseRef.current?.distance
      const storedPitch = playerCameraPoseRef.current?.pitch
      const pitch =
        typeof storedPitch === 'number' && Number.isFinite(storedPitch)
          ? clamp(
              storedPitch,
              PASCAL_WATER_ISOMETRIC_CAMERA_MIN_PITCH,
              PASCAL_WATER_ISOMETRIC_CAMERA_MAX_PITCH,
            )
          : PASCAL_WATER_ISOMETRIC_CAMERA_PITCH
      cameraYawRef.current = yaw
      targetCameraYawRef.current = yaw
      cameraPitchRef.current = pitch
      targetCameraPitchRef.current = pitch
      cameraDistanceRef.current =
        typeof storedDistance === 'number' && Number.isFinite(storedDistance)
          ? clamp(
              storedDistance,
              PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE,
              PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE,
            )
          : PASCAL_WATER_ISOMETRIC_CAMERA_DISTANCE
      const desiredCameraPosition = resolveThirdPersonCameraPosition(
        target,
        cameraYawRef.current,
        cameraPitchRef.current,
        cameraDistanceRef.current,
        desiredCameraPositionRef.current,
      )
      state.camera.position.copy(desiredCameraPosition)
      state.camera.lookAt(target)
      previousTargetRef.current = target.clone()
      snapVersionRef.current = motion.cameraSnapVersion
      writePascalWaterCameraPose(playerCameraPoseRef, state.camera, target)
      return
    }

    const followAmount = 1 - Math.exp(-PASCAL_WATER_ROBOT_CAMERA_FOLLOW_RESPONSE * frameDelta)
    const yawInput =
      Number(orbitKeysRef.current.counterClockwise) - Number(orbitKeysRef.current.clockwise)
    if (yawInput !== 0) {
      targetCameraYawRef.current += yawInput * PASCAL_WATER_ISOMETRIC_CAMERA_YAW_SPEED * frameDelta
    }
    cameraYawRef.current = lerpAngle(
      cameraYawRef.current,
      targetCameraYawRef.current,
      1 - Math.exp(-PASCAL_WATER_ISOMETRIC_CAMERA_YAW_RESPONSE * frameDelta),
    )
    cameraPitchRef.current = MathUtils.damp(
      cameraPitchRef.current,
      targetCameraPitchRef.current,
      PASCAL_WATER_ISOMETRIC_CAMERA_YAW_RESPONSE,
      frameDelta,
    )
    cameraDistanceRef.current = clamp(
      cameraDistanceRef.current,
      PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE,
      PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE,
    )
    previousTarget.lerp(target, followAmount)
    const desiredCameraPosition = resolveThirdPersonCameraPosition(
      previousTarget,
      cameraYawRef.current,
      cameraPitchRef.current,
      cameraDistanceRef.current,
      desiredCameraPositionRef.current,
    )
    state.camera.position.lerp(desiredCameraPosition, followAmount)

    state.camera.lookAt(previousTarget)
    writePascalWaterCameraPose(playerCameraPoseRef, state.camera, previousTarget)
  })

  return null
}

function PascalWaterRobotNodePrimitiveActor({
  color,
  node,
  presentationMode = 'default',
}: {
  color: string
  node: LandrushWorldNode
  presentationMode?: LandrushRobotPresentationMode
}) {
  const groupRef = useRef<Group>(null!)
  const hoverAmountRef = useRef(0)

  useFrame(({ clock }, delta) => {
    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      presentationMode === 'hover' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      Math.min(delta, 0.05),
    )
    const hoverOffset = resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    groupRef.current?.position.set(
      node.playerPosition[0],
      node.playerPosition[1] + hoverOffset,
      node.playerPosition[2],
    )
    groupRef.current?.rotation.set(0, node.playerHeading ?? 0, 0)
  })

  return (
    <group
      position={[node.playerPosition[0], node.playerPosition[1], node.playerPosition[2]]}
      ref={groupRef}
      rotation={[0, node.playerHeading ?? 0, 0]}
    >
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.46, 1.28, 0.32]} />
        <meshStandardMaterial color="#dce8ea" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.66, 0.02]}>
        <boxGeometry args={[0.36, 0.32, 0.3]} />
        <meshStandardMaterial color={color} roughness={0.74} />
      </mesh>
    </group>
  )
}

function PascalWaterRobotPlayerBeacon({
  color,
  node,
  presentationMode = 'default',
}: {
  color: string
  node: LandrushWorldNode
  presentationMode?: LandrushRobotPresentationMode
}) {
  const meshRef = useRef<Mesh>(null!)
  const hoverAmountRef = useRef(0)

  useFrame(({ clock }, delta) => {
    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      presentationMode === 'hover' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      Math.min(delta, 0.05),
    )
    const hoverOffset = resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    meshRef.current?.position.set(
      node.playerPosition[0],
      node.playerPosition[1] + hoverOffset + 2.28,
      node.playerPosition[2],
    )
  })

  return (
    <mesh ref={meshRef} renderOrder={60}>
      <sphereGeometry args={[0.13, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

function PascalWaterBuildRobotExitHotspot({
  motionRef,
  onExitBuildMode,
  visible,
}: {
  motionRef: { current: RobotMotion }
  onExitBuildMode: () => void
  visible: boolean
}) {
  const { camera, gl } = useThree()
  const groupRef = useRef<Group>(null!)
  const raycaster = useMemo(() => new Raycaster(), [])
  const pointerNdc = useMemo(() => new Vector2(), [])
  const segmentStart = useMemo(() => new Vector3(), [])
  const segmentEnd = useMemo(() => new Vector3(), [])
  const closestRayPoint = useMemo(() => new Vector3(), [])
  const closestRobotPoint = useMemo(() => new Vector3(), [])
  const hoverAmountRef = useRef(0)
  const hoverOffsetRef = useRef(0)
  const [hovered, setHovered] = useState(false)

  useFrame(({ clock }, delta) => {
    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      visible ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      Math.min(delta, 0.05),
    )
    hoverOffsetRef.current = resolveLandrushRobotHoverOffset(
      hoverAmountRef.current,
      clock.elapsedTime,
    )

    const motion = motionRef.current
    groupRef.current?.position.set(
      motion.position.x,
      motion.position.y + hoverOffsetRef.current + 2.7,
      motion.position.z,
    )
  })

  useEffect(() => {
    if (!visible) {
      setHovered(false)
      return
    }

    const canvas = gl.domElement
    const previousCursor = canvas.style.cursor
    const isRobotHit = (event: MouseEvent | PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointerNdc, camera)

      const motion = motionRef.current
      const hoverOffset = hoverOffsetRef.current
      segmentStart.set(motion.position.x, motion.position.y + hoverOffset + 0.12, motion.position.z)
      segmentEnd.set(motion.position.x, motion.position.y + hoverOffset + 2.26, motion.position.z)
      const distanceSq = raycaster.ray.distanceSqToSegment(
        segmentStart,
        segmentEnd,
        closestRayPoint,
        closestRobotPoint,
      )
      return distanceSq <= 0.62 * 0.62
    }
    const suppressBuilderEvent = (event: MouseEvent | PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    const handlePointerMove = (event: PointerEvent) => {
      const robotHit = isRobotHit(event)
      setHovered((current) => (current === robotHit ? current : robotHit))
      if (!robotHit) {
        canvas.style.cursor = previousCursor
        return
      }

      canvas.style.cursor = 'default'
      suppressBuilderEvent(event)
    }
    const handlePointerLeave = () => {
      setHovered(false)
      canvas.style.cursor = previousCursor
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!isRobotHit(event)) return
      canvas.style.cursor = 'default'
      suppressBuilderEvent(event)
    }
    const handleClick = (event: MouseEvent | PointerEvent) => {
      if ('button' in event && event.button !== 0) return
      if (!isRobotHit(event)) return

      canvas.style.cursor = previousCursor
      suppressBuilderEvent(event)
      onExitBuildMode()
    }
    const handleBlockedMouseEvent = (event: MouseEvent) => {
      if (!isRobotHit(event)) return
      suppressBuilderEvent(event)
    }

    canvas.addEventListener('pointermove', handlePointerMove, { capture: true })
    canvas.addEventListener('pointerleave', handlePointerLeave)
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true })
    canvas.addEventListener('pointerup', handleClick, { capture: true })
    canvas.addEventListener('click', handleClick, { capture: true })
    canvas.addEventListener('dblclick', handleBlockedMouseEvent, { capture: true })
    canvas.addEventListener('contextmenu', handleBlockedMouseEvent, { capture: true })
    return () => {
      setHovered(false)
      canvas.style.cursor = previousCursor
      canvas.removeEventListener('pointermove', handlePointerMove, true)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('pointerdown', handlePointerDown, true)
      canvas.removeEventListener('pointerup', handleClick, true)
      canvas.removeEventListener('click', handleClick, true)
      canvas.removeEventListener('dblclick', handleBlockedMouseEvent, true)
      canvas.removeEventListener('contextmenu', handleBlockedMouseEvent, true)
    }
  }, [
    camera,
    closestRayPoint,
    closestRobotPoint,
    gl,
    motionRef,
    onExitBuildMode,
    pointerNdc,
    raycaster,
    segmentEnd,
    segmentStart,
    visible,
  ])

  return (
    <group ref={groupRef} visible={visible}>
      <Html
        center
        className="pointer-events-none select-none transition-opacity duration-150"
        position={[0, 0, 0]}
        style={{ opacity: hovered ? 1 : 0 }}
        zIndexRange={[120, 0]}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-slate-950/82 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur">
          <span className="grid size-4 place-items-center rounded-full bg-white text-[10px] font-black leading-none text-slate-950">
            X
          </span>
          Build mode
        </span>
      </Html>
    </group>
  )
}

function PascalWaterMapPlayerMarker({
  color,
  groundY,
  motionRef,
  visible,
}: {
  color: string
  groundY: number
  motionRef: { current: RobotMotion | null }
  visible: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const [labelVisible, setLabelVisible] = useState(false)

  useFrame((_, delta) => {
    const group = groupRef.current
    const motion = motionRef.current
    if (!group) return

    const markerVisible = visible && Boolean(motion)
    group.visible = markerVisible
    setLabelVisible((current) => (current === markerVisible ? current : markerVisible))
    if (!motion) return

    group.position.set(motion.position.x, groundY + 0.16, motion.position.z)
    group.rotation.y = lerpAngle(group.rotation.y, motion.heading, clamp01(delta * 16))
  })

  return (
    <PascalWaterMapBadgeMarker
      color={color}
      groupRef={groupRef}
      label="P"
      labelVisible={labelVisible}
    />
  )
}

function PascalWaterRemoteMapPlayerMarker({
  groundY,
  player,
  visible,
}: {
  groundY: number
  player: MultiplayerPlayerSnapshot
  visible: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const positionRef = useRef(new Vector3(player.position[0], groundY, player.position[2]))
  const targetPositionRef = useRef(new Vector3(player.position[0], groundY, player.position[2]))
  const headingRef = useRef(player.heading)
  const targetHeadingRef = useRef(player.heading)

  useEffect(() => {
    targetPositionRef.current.set(
      player.position[0],
      player.position[1] || groundY,
      player.position[2],
    )
    targetHeadingRef.current = player.heading
  }, [groundY, player])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    group.visible = visible
    if (!visible) return

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionAmount = 1 - Math.exp(-PASCAL_WATER_REMOTE_POSITION_RESPONSE * frameDelta)
    const headingAmount = 1 - Math.exp(-PASCAL_WATER_REMOTE_HEADING_RESPONSE * frameDelta)
    positionRef.current.lerp(targetPositionRef.current, positionAmount)
    headingRef.current = lerpAngle(headingRef.current, targetHeadingRef.current, headingAmount)

    group.position.set(positionRef.current.x, groundY + 0.24, positionRef.current.z)
    group.rotation.y = headingRef.current
  })

  return <PascalWaterMapBadgeMarker color={player.color} groupRef={groupRef} scale={1.28} />
}

function PascalWaterMapBadgeMarker({
  color,
  groupRef,
  label,
  labelVisible = false,
  scale = 1.5,
}: {
  color: string
  groupRef: RefObject<Group>
  label?: string
  labelVisible?: boolean
  scale?: number
}) {
  return (
    <group ref={groupRef} scale={scale} visible={false}>
      <mesh renderOrder={91} rotation={[-Math.PI / 2, 0, 0]} scale={1.14}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial
          color="#020617"
          depthTest={false}
          depthWrite={false}
          opacity={0.52}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        position={[0, 0, 0.9]}
        renderOrder={91}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        scale={1.14}
      >
        <circleGeometry args={[0.62, 3]} />
        <meshBasicMaterial
          color="#020617"
          depthTest={false}
          depthWrite={false}
          opacity={0.52}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh renderOrder={92} rotation={[-Math.PI / 2, 0, 0]} scale={1.03}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial
          color="#f8fafc"
          depthTest={false}
          depthWrite={false}
          opacity={0.9}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        position={[0, 0, 0.9]}
        renderOrder={92}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        scale={1.03}
      >
        <circleGeometry args={[0.62, 3]} />
        <meshBasicMaterial
          color="#f8fafc"
          depthTest={false}
          depthWrite={false}
          opacity={0.9}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh renderOrder={93} rotation={[-Math.PI / 2, 0, 0]} scale={0.9}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          opacity={0.98}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        position={[0, 0, 0.9]}
        renderOrder={93}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        scale={0.9}
      >
        <circleGeometry args={[0.5, 3]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          opacity={0.98}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        position={[0, 0, 1.18]}
        renderOrder={94}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        scale={0.9}
      >
        <circleGeometry args={[0.24, 3]} />
        <meshBasicMaterial
          color="#f8fafc"
          depthTest={false}
          depthWrite={false}
          opacity={0.98}
          toneMapped={false}
          transparent
        />
      </mesh>
      {label ? (
        <Html
          center
          className="pointer-events-none select-none transition-opacity duration-300 ease-out"
          position={[0, 0.12, 0]}
          style={{ opacity: labelVisible ? 1 : 0 }}
        >
          <span
            className="grid h-5 w-5 place-items-center rounded-full text-[13px] font-black leading-none text-slate-950"
            style={{
              textShadow:
                '0 1px 0 rgba(248,250,252,0.95), 1px 0 0 rgba(248,250,252,0.95), 0 -1px 0 rgba(248,250,252,0.95), -1px 0 0 rgba(248,250,252,0.95)',
            }}
          >
            {label}
          </span>
        </Html>
      ) : null}
    </group>
  )
}

function MobileMovementJoystick({
  movementRef,
}: {
  movementRef: { current: MobileJoystickInput | null }
}) {
  const baseRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const touchIdRef = useRef<number | null>(null)
  const [thumb, setThumb] = useState({ active: false, x: 0, y: 0 })

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current
      if (!base) return

      const rect = base.getBoundingClientRect()
      const maxOffset = rect.width * 0.32
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const rawX = clientX - centerX
      const rawY = clientY - centerY
      const distance = Math.hypot(rawX, rawY)
      const scale = distance > maxOffset && distance > 0 ? maxOffset / distance : 1
      const x = rawX * scale
      const y = rawY * scale
      const strength = clamp01(distance / maxOffset)

      movementRef.current =
        strength > 0.08
          ? {
              forward: clamp(-y / maxOffset, -1, 1),
              strafe: clamp(x / maxOffset, -1, 1),
              strength,
            }
          : null
      setThumb({ active: true, x, y })
    },
    [movementRef],
  )

  const clearJoystick = useCallback(() => {
    pointerIdRef.current = null
    touchIdRef.current = null
    movementRef.current = null
    setThumb({ active: false, x: 0, y: 0 })
  }, [movementRef])

  const stopPointerJoystick = useCallback(
    (event?: ReactPointerEvent<HTMLDivElement>) => {
      if (touchIdRef.current !== null) return
      if (event && pointerIdRef.current === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }
      clearJoystick()
    },
    [clearJoystick],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (touchIdRef.current !== null) return
      event.preventDefault()
      pointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      updateFromPoint(event.clientX, event.clientY)
    },
    [updateFromPoint],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return
      event.preventDefault()
      updateFromPoint(event.clientX, event.clientY)
    },
    [updateFromPoint],
  )

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches.item(0)
      if (!touch) return
      event.preventDefault()
      pointerIdRef.current = null
      touchIdRef.current = touch.identifier
      updateFromPoint(touch.clientX, touch.clientY)
    },
    [updateFromPoint],
  )

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touchId = touchIdRef.current
      if (touchId === null) return
      const touch = findTouchById(event.touches, touchId)
      if (!touch) return
      event.preventDefault()
      updateFromPoint(touch.clientX, touch.clientY)
    },
    [updateFromPoint],
  )

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touchId = touchIdRef.current
      if (touchId === null || !findTouchById(event.changedTouches, touchId)) return
      event.preventDefault()
      clearJoystick()
    },
    [clearJoystick],
  )

  return (
    <div
      className="pointer-events-auto absolute bottom-[8.25rem] left-5 z-40 md:hidden"
      data-landrush-mobile-joystick
    >
      <div
        aria-label="Move"
        className="relative size-28 touch-none select-none rounded-full border border-white/25 bg-slate-950/38 shadow-xl backdrop-blur"
        onPointerCancel={stopPointerJoystick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPointerJoystick}
        onTouchCancel={handleTouchEnd}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        ref={baseRef}
        role="application"
      >
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-3 rounded-full bg-white/28" />
        </span>
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className="size-11 rounded-full border border-white/28 bg-white/18 shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition-transform duration-75"
            style={{
              transform: `translate3d(${thumb.x}px, ${thumb.y}px, 0) scale(${
                thumb.active ? 1.04 : 1
              })`,
            }}
          />
        </span>
      </div>
    </div>
  )
}

function createPascalWaterPlayerSnapshot({
  heading,
  localProfile,
  moving,
  position,
  speed,
}: {
  heading: number
  localProfile: LocalPlayerProfile
  moving: boolean
  position: [number, number, number]
  speed: number
}): MultiplayerPlayerSnapshot {
  return {
    ...localProfile,
    heading,
    moving,
    position,
    speed,
    updatedAt: Date.now(),
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function progressiveRenderValue<T>(renderValue: ProgressiveRenderValue<T>) {
  return renderValue.isSettling ? renderValue.previewValue : renderValue.finalValue
}

function measurePascalWaterSetup<T>(
  profileMeasure: PascalWaterProfileMeasure | undefined,
  id: string,
  callback: () => T,
) {
  return profileMeasure ? profileMeasure(id, callback) : callback()
}

function usePascalMultiplayerIslandProgressiveReveal(
  origin: LandrushPoint2,
  enabled: boolean,
): ProgressiveIslandRevealState | null {
  const [reveal, setReveal] = useState<ProgressiveIslandRevealState>(() =>
    createPascalMultiplayerIslandProgressiveReveal(origin, 0),
  )

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof performance === 'undefined') {
      setReveal(createPascalMultiplayerIslandProgressiveReveal(origin, 1))
      return
    }

    let frameId: number | null = null
    let lastCommittedAt = 0
    const startedAt = performance.now()
    setReveal(createPascalMultiplayerIslandProgressiveReveal(origin, 0))

    const tick = () => {
      const now = performance.now()
      const progress = clamp01(
        (now - startedAt) / (PASCAL_MULTIPLAYER_ISLAND_REVEAL_SECONDS * 1000),
      )
      const shouldCommit = now - lastCommittedAt >= 120 || progress >= 1
      if (shouldCommit) {
        lastCommittedAt = now
        const nextReveal = createPascalMultiplayerIslandProgressiveReveal(origin, progress)
        setReveal((current) => {
          const centerBlend = 1 - Math.exp(-PASCAL_MULTIPLAYER_ISLAND_REVEAL_CENTER_RESPONSE * 0.12)
          return {
            ...nextReveal,
            center: {
              x: MathUtils.lerp(current.center.x, nextReveal.center.x, centerBlend),
              z: MathUtils.lerp(current.center.z, nextReveal.center.z, centerBlend),
            },
          }
        })
      }
      if (progress < 1) frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [enabled, origin])

  return enabled ? reveal : null
}

function createPascalMultiplayerIslandProgressiveReveal(
  origin: LandrushPoint2,
  progress: number,
): ProgressiveIslandRevealState {
  const amount = 1 - (1 - clamp01(progress)) ** 3
  return {
    center: origin,
    featherMeters: PASCAL_MULTIPLAYER_ISLAND_REVEAL_FEATHER_METERS,
    radius: MathUtils.lerp(
      PASCAL_MULTIPLAYER_ISLAND_REVEAL_INITIAL_RADIUS_METERS,
      PASCAL_MULTIPLAYER_ISLAND_REVEAL_FINAL_RADIUS_METERS,
      amount,
    ),
  }
}

function usePascalWaterLoadingProgress() {
  const [progressState, setProgressState] = useState({ progress: 0, visible: true })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof performance === 'undefined') {
      setProgressState({ progress: 100, visible: false })
      return
    }

    let frameId: number | null = null
    let hideTimeoutId: number | null = null
    let observer: PerformanceObserver | null = null
    let completed = false
    let progress = 0
    const startedAt = performance.now()
    let lastLongTaskAt = startedAt

    const finish = () => {
      if (completed) return
      completed = true
      progress = 100
      setProgressState({ progress: 100, visible: true })
      hideTimeoutId = window.setTimeout(() => {
        setProgressState({ progress: 100, visible: false })
      }, PASCAL_WATER_LOADING_FADE_MS)
    }

    if (typeof PerformanceObserver !== 'undefined') {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          lastLongTaskAt = Math.max(lastLongTaskAt, entry.startTime + entry.duration)
        }
      })
      try {
        observer.observe({ entryTypes: ['longtask'] })
      } catch {
        observer.disconnect()
        observer = null
      }
    }

    const tick = () => {
      if (completed) return

      const now = performance.now()
      const elapsed = now - startedAt
      const target = Math.min(96, (elapsed / PASCAL_WATER_LOADING_EXPECTED_MS) * 96)
      const quietFor = now - lastLongTaskAt
      const canComplete =
        document.readyState !== 'loading' &&
        elapsed >= PASCAL_WATER_LOADING_MINIMUM_MS &&
        quietFor >= PASCAL_WATER_LOADING_QUIET_MS
      const nextTarget = canComplete ? 100 : target
      const step = canComplete
        ? Math.max(1.2, (100 - progress) * 0.18)
        : Math.max(0.08, (nextTarget - progress) * 0.1)

      progress = canComplete
        ? Math.min(100, progress + step)
        : Math.max(progress, Math.min(nextTarget, progress + step))
      setProgressState({ progress, visible: true })

      if (canComplete && progress >= 99.6) {
        finish()
        return
      }
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => {
      completed = true
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (hideTimeoutId !== null) window.clearTimeout(hideTimeoutId)
      observer?.disconnect()
    }
  }, [])

  return progressState
}

function useProgressiveRenderValue<T>(value: T, settleMs: number): ProgressiveRenderValue<T> {
  const [finalValue, setFinalValue] = useState(value)
  const [isSettling, setIsSettling] = useState(false)
  const latestValueRef = useRef(value)
  const didMountRef = useRef(false)
  const settleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    latestValueRef.current = value
    if (!didMountRef.current) {
      didMountRef.current = true
      setFinalValue(value)
      setIsSettling(false)
      return
    }

    setIsSettling(true)
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      setFinalValue(latestValueRef.current)
      setIsSettling(false)
      settleTimerRef.current = null
    }, settleMs)
  }, [settleMs, value])

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current)
    },
    [],
  )

  return { finalValue, isSettling, previewValue: value }
}

function createPascalWaterRobotActorNode(
  baseNode: PascalWaterLayoutNode,
  id: string,
  spawn: LandrushPoint2,
  groundY: number,
): LandrushWorldNode {
  return {
    ...baseNode,
    focusParcelId: null,
    id: pascalWaterRobotNodeId(id),
    landrushMode: 'walk',
    name: id,
    playerHeading: 0,
    playerMoving: false,
    playerPosition: [spawn.x, groundY, spawn.z],
    playerSpeed: 0,
    playerStart: [spawn.x, groundY, spawn.z],
    remotePlayers: [],
    renderFlags: {},
    type: 'landrush-world',
  }
}

function pascalWaterRobotNodeId(id: string): `landrush-world_${string}` {
  return `landrush-world_pascal-water-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function writeMotionToPascalWaterRobotNode(node: LandrushWorldNode, motion: RobotMotion) {
  node.playerPosition = [motion.position.x, motion.position.y, motion.position.z]
  node.playerHeading = motion.heading
  node.playerMoving = motion.isMoving
  node.playerSpeed = motion.speed
}

function resolvePascalWaterMapTransitionStartZoom(
  camera: Camera,
  startPosition: Vector3,
  startTarget: Vector3,
  endPosition: Vector3,
  endTarget: Vector3,
) {
  if (isPascalWaterOrthographicCamera(camera)) {
    return clamp(
      camera.zoom,
      PASCAL_WATER_MAP_CAMERA_MIN_ZOOM,
      PASCAL_WATER_MAP_CAMERA_TRANSITION_MAX_ZOOM,
    )
  }

  const startDistance = Math.max(0.001, startPosition.distanceTo(startTarget))
  const endDistance = Math.max(0.001, endPosition.distanceTo(endTarget))
  return clamp(
    PASCAL_WATER_MAP_CAMERA_ZOOM * (endDistance / startDistance),
    PASCAL_WATER_MAP_CAMERA_ZOOM,
    PASCAL_WATER_MAP_CAMERA_TRANSITION_MAX_ZOOM,
  )
}

function setPascalWaterMapCameraZoom(camera: Camera, zoom: number) {
  if (!isPascalWaterOrthographicCamera(camera)) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}

function isPascalWaterOrthographicCamera(camera: Camera): camera is PascalWaterOrthographicCamera {
  return (camera as Partial<PascalWaterOrthographicCamera>).isOrthographicCamera === true
}

function createPascalWaterCameraPose(camera: Camera, target: Vector3): PascalWaterCameraPose {
  const pose: PascalWaterCameraPose = {
    distance: 0,
    pitch: 0,
    position: camera.position.clone(),
    target: target.clone(),
    yaw: 0,
  }
  updatePascalWaterCameraPoseOrbit(pose)
  return pose
}

function clonePascalWaterCameraPose(
  pose: PascalWaterCameraPose | null,
): PascalWaterCameraPose | null {
  if (!pose) return null
  return {
    distance: pose.distance,
    pitch: pose.pitch,
    position: pose.position.clone(),
    target: pose.target.clone(),
    yaw: pose.yaw,
  }
}

function pascalWaterCameraPoseToEditorInitialPose(
  pose: PascalWaterCameraPose,
): EditorCameraInitialPose {
  return {
    position: [pose.position.x, pose.position.y, pose.position.z],
    target: [pose.target.x, pose.target.y, pose.target.z],
  }
}

function maybePascalWaterCameraPoseToEditorInitialPose(
  pose: PascalWaterCameraPose | null,
): EditorCameraInitialPose | null {
  return pose ? pascalWaterCameraPoseToEditorInitialPose(pose) : null
}

function writePascalWaterCameraPose(
  poseRef: { current: PascalWaterCameraPose | null },
  camera: Camera,
  target: Vector3,
) {
  let pose = poseRef.current
  if (!pose) {
    pose = {
      distance: 0,
      pitch: 0,
      position: new Vector3(),
      target: new Vector3(),
      yaw: 0,
    }
    poseRef.current = pose
  }

  pose.position.copy(camera.position)
  pose.target.copy(target)
  updatePascalWaterCameraPoseOrbit(pose)
}

function updatePascalWaterCameraPoseOrbit(pose: PascalWaterCameraPose) {
  const offsetX = pose.position.x - pose.target.x
  const offsetY = pose.position.y - pose.target.y
  const offsetZ = pose.position.z - pose.target.z
  const horizontalDistance = Math.hypot(offsetX, offsetZ)
  pose.yaw = Math.atan2(offsetX, offsetZ)
  pose.pitch = Math.atan2(offsetY, horizontalDistance)
  pose.distance = Math.hypot(horizontalDistance, offsetY)
}

function syncThirdPersonCameraOrbitRefs(
  camera: Camera,
  target: Vector3,
  yawRef: { current: number },
  pitchRef: { current: number },
  distanceRef: { current: number },
) {
  const offsetX = camera.position.x - target.x
  const offsetY = camera.position.y - target.y
  const offsetZ = camera.position.z - target.z
  const horizontalDistance = Math.hypot(offsetX, offsetZ)
  yawRef.current = Math.atan2(offsetX, offsetZ)
  pitchRef.current = MathUtils.clamp(
    Math.atan2(offsetY, horizontalDistance),
    PASCAL_WATER_ISOMETRIC_CAMERA_MIN_PITCH,
    PASCAL_WATER_ISOMETRIC_CAMERA_MAX_PITCH,
  )
  distanceRef.current = MathUtils.clamp(
    Math.hypot(horizontalDistance, offsetY),
    PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE,
    PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE,
  )
}

function resolveThirdPersonCameraPosition(
  target: Vector3,
  yaw: number,
  pitch: number,
  distance: number,
  output: Vector3,
) {
  const horizontalDistance = Math.cos(pitch) * distance
  output.set(
    target.x + Math.sin(yaw) * horizontalDistance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * horizontalDistance,
  )
  return output
}

function getRobotWorldOrbitControls(state: unknown) {
  const controls = (state as { controls?: unknown }).controls
  if (!isRobotWorldOrbitControls(controls)) return undefined
  return controls
}

function getPascalWaterCameraControls(state: unknown) {
  const controls = (state as { controls?: unknown }).controls
  if (!isPascalWaterCameraControls(controls)) return undefined
  return controls
}

function isRobotWorldOrbitControls(controls: unknown): controls is RobotWorldOrbitControls {
  if (!controls || typeof controls !== 'object') return false
  const candidate = controls as Partial<RobotWorldOrbitControls> & { setLookAt?: unknown }
  return (
    typeof candidate.update === 'function' &&
    candidate.target instanceof Vector3 &&
    typeof candidate.setLookAt !== 'function'
  )
}

function isPascalWaterCameraControls(controls: unknown): controls is PascalWaterCameraControls {
  if (!controls || typeof controls !== 'object') return false
  const candidate = controls as Partial<PascalWaterCameraControls>
  return typeof candidate.setLookAt === 'function' || typeof candidate.getTarget === 'function'
}

function readPascalWaterCameraControlsTarget(
  controls: PascalWaterCameraControls | undefined,
  output: Vector3,
) {
  if (controls?.getTarget) {
    controls.getTarget(output, false)
    return output
  }
  if (controls?.target) return output.copy(controls.target)
  return null
}

function resolveRightHoldMovement({
  camera,
  canvas,
  groundY,
  motion,
  navigationObstacles,
  pointer,
  pointerNdc,
  raycaster,
  surfacePoints,
}: {
  camera: Camera
  canvas: HTMLCanvasElement
  groundY: number
  motion: RobotMotion
  navigationObstacles: readonly PascalWaterNavigationObstacle[]
  pointer: PascalWaterRightHoldMove | null
  pointerNdc: Vector2
  raycaster: Raycaster
  surfacePoints: readonly LandrushPoint2[]
}): RobotMovementInput | null {
  if (!pointer) return null

  const point = pickPascalWaterBuildGroundPoint({
    camera,
    canvas,
    event: { clientX: pointer.x, clientY: pointer.y } as PointerEvent,
    groundY,
    pointerNdc,
    raycaster,
  })
  if (!point || !pointInPolygon(point, surfacePoints)) return null

  const steeringPoint = resolvePascalWaterNavigationSteeringPoint(
    { x: motion.position.x, z: motion.position.z },
    point,
    navigationObstacles,
    surfacePoints,
  )
  const dx = point.x - motion.position.x
  const dz = point.z - motion.position.z
  const targetDx = steeringPoint.x - motion.position.x
  const targetDz = steeringPoint.z - motion.position.z
  const distance = Math.hypot(dx, dz)
  const steeringDistance = Math.hypot(targetDx, targetDz)
  if (distance <= PASCAL_WATER_CLICK_MOVE_STOP_RADIUS) return null

  const direction = normalize2(targetDx, targetDz)
  return {
    ...direction,
    heading: Math.atan2(direction.x, direction.z),
    intensity: MathUtils.clamp(
      steeringDistance / PASCAL_WATER_CLICK_MOVE_FULL_SPEED_DISTANCE,
      0.3,
      1,
    ),
    runAmount: distance > PASCAL_WATER_CLICK_MOVE_RUN_DISTANCE ? 1 : 0,
  }
}

function resolveClickMoveMovement(
  motion: RobotMotion,
  targetRef: { current: PascalWaterMoveTarget | null },
  navigationObstacles: readonly PascalWaterNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
): RobotMovementInput | null {
  const target = targetRef.current
  if (!target) return null

  const distance = Math.hypot(
    target.point.x - motion.position.x,
    target.point.z - motion.position.z,
  )
  if (distance <= PASCAL_WATER_CLICK_MOVE_STOP_RADIUS) {
    targetRef.current = null
    return null
  }

  const steeringPoint = resolvePascalWaterNavigationSteeringPoint(
    { x: motion.position.x, z: motion.position.z },
    target.point,
    navigationObstacles,
    surfacePoints,
  )
  const dx = steeringPoint.x - motion.position.x
  const dz = steeringPoint.z - motion.position.z
  const steeringDistance = Math.hypot(dx, dz)
  if (steeringDistance <= 0.000001) return null

  const direction = normalize2(dx, dz)
  return {
    ...direction,
    heading: Math.atan2(direction.x, direction.z),
    intensity: MathUtils.clamp(
      steeringDistance / PASCAL_WATER_CLICK_MOVE_FULL_SPEED_DISTANCE,
      0.3,
      1,
    ),
    runAmount: distance > PASCAL_WATER_CLICK_MOVE_RUN_DISTANCE ? 1 : 0,
  }
}

function resolveCameraRelativeMovement(
  keys: ReadonlySet<string>,
  camera: Camera,
  joystick: MobileJoystickInput | null,
): RobotMovementInput | null {
  const keyboardStrafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const keyboardForward =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'))
  const hasKeyboardInput = keyboardStrafe !== 0 || keyboardForward !== 0
  const hasJoystickInput = Boolean(joystick && joystick.strength > 0.08)
  const strafe = keyboardStrafe + (joystick?.strafe ?? 0)
  const forwardInput = keyboardForward + (joystick?.forward ?? 0)

  if (strafe === 0 && forwardInput === 0) return null

  const forward = resolveCameraForwardXZ(camera)
  const right = { x: -forward.z, z: forward.x }
  const direction = normalize2(
    right.x * strafe + forward.x * forwardInput,
    right.z * strafe + forward.z * forwardInput,
  )
  const heading = Math.atan2(direction.x, direction.z)
  const joystickStrength = hasJoystickInput ? (joystick?.strength ?? 1) : 0
  const intensity = hasKeyboardInput ? 1 : hasJoystickInput ? joystickStrength : 1
  const runAmount =
    hasKeyboardInput || !hasJoystickInput
      ? 0
      : clamp01(
          (joystickStrength - PASCAL_WATER_ROBOT_JOYSTICK_RUN_START) /
            (1 - PASCAL_WATER_ROBOT_JOYSTICK_RUN_START),
        )
  return { ...direction, heading, intensity, runAmount }
}

function resolveCameraForwardXZ(camera: Camera) {
  const forward = new Vector3()
  camera.getWorldDirection(forward)
  forward.y = 0
  if (forward.lengthSq() < 0.000001) return { x: 0, z: 1 }
  forward.normalize()
  return { x: forward.x, z: forward.z }
}

function constrainToPolygon(
  next: LandrushPoint2,
  current: LandrushPoint2,
  polygon: readonly LandrushPoint2[],
) {
  if (pointInPolygon(next, polygon)) return next

  const xOnly = { x: next.x, z: current.z }
  if (pointInPolygon(xOnly, polygon)) return xOnly

  const zOnly = { x: current.x, z: next.z }
  if (pointInPolygon(zOnly, polygon)) return zOnly

  return current
}

function centroidForPolygon(points: readonly LandrushPoint2[]) {
  return polygonCentroid(openPointRing(points))
}

function createCenteredParcelGeometry(parcel: ParcelAllocationParcel) {
  const geometry = new BufferGeometry()
  const ring = openPointRing(parcel.points)
  if (ring.length < 3) return geometry

  const points = ring.map(
    (point) => new Vector2(point.x - parcel.centroid.x, -(point.z - parcel.centroid.z)),
  )
  const triangles = ShapeUtils.triangulateShape(points, [])
  const positions = new Float32Array(points.length * 3)
  const normals = new Float32Array(points.length * 3)
  const uvs = new Float32Array(points.length * 2)
  const indices: number[] = []
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  const width = Math.max(0.000001, maxX - minX)
  const height = Math.max(0.000001, maxY - minY)

  points.forEach((point, index) => {
    positions[index * 3] = point.x
    positions[index * 3 + 1] = point.y
    positions[index * 3 + 2] = 0
    normals[index * 3 + 2] = 1
    uvs[index * 2] = (point.x - minX) / width
    uvs[index * 2 + 1] = (point.y - minY) / height
  })

  for (const triangle of triangles) {
    const [a, b, c] = triangle
    if (a === undefined || b === undefined || c === undefined) continue
    indices.push(a, b, c)
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

function parcelBuildCameraRadius(parcel: ParcelAllocationParcel) {
  let radius = 0
  for (const point of parcel.points) {
    radius = Math.max(radius, Math.hypot(point.x - parcel.centroid.x, point.z - parcel.centroid.z))
  }
  return Math.max(radius, Math.sqrt(Math.max(0.001, parcel.area) / Math.PI))
}

function formatParcelLabel(parcelId: string) {
  return parcelId
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function isTrackedWalkKey(code: string) {
  return isMovementKey(code) || code === 'ShiftLeft' || code === 'ShiftRight'
}

function isMovementKey(code: string) {
  return (
    code === 'KeyW' ||
    code === 'ArrowUp' ||
    code === 'KeyA' ||
    code === 'ArrowLeft' ||
    code === 'KeyS' ||
    code === 'ArrowDown' ||
    code === 'KeyD' ||
    code === 'ArrowRight'
  )
}

function isRunPressed(keys: ReadonlySet<string>) {
  return keys.has('ShiftLeft') || keys.has('ShiftRight')
}

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * amount
}

function normalize2(x: number, z: number) {
  const length = Math.hypot(x, z)
  if (length < 0.000001) return { x: 0, z: -1 }
  return { x: x / length, z: z / length }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampOptionalNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return null
  return clamp(value, min, max)
}

function optionalSearchParamNumber(
  searchParams: { get: (key: string) => string | null },
  key: string,
) {
  const value = searchParams.get(key)
  return value === null ? Number.NaN : Number(value)
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  const ring = openPointRing(polygon)
  let inside = false
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; index += 1) {
    const current = ring[index]
    const previous = ring[previousIndex]
    if (!(current && previous)) continue
    const crosses = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    if (crosses && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

function pickPascalWaterBuildGroundPoint({
  camera,
  canvas,
  event,
  groundY,
  pointerNdc,
  raycaster,
}: {
  camera: Camera
  canvas: HTMLCanvasElement
  event: MouseEvent | PointerEvent
  groundY: number
  pointerNdc: Vector2
  raycaster: Raycaster
}): LandrushPoint2 | null {
  const rect = canvas.getBoundingClientRect()
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointerNdc, camera)

  const directionY = raycaster.ray.direction.y
  if (Math.abs(directionY) <= 0.000001) return null

  const distance = (groundY - raycaster.ray.origin.y) / directionY
  if (distance < 0) return null

  return {
    x: raycaster.ray.origin.x + raycaster.ray.direction.x * distance,
    z: raycaster.ray.origin.z + raycaster.ray.direction.z * distance,
  }
}

function createPascalWaterSyncedBuildNodes({
  nodes,
  parcel,
  parcelWorldId,
}: {
  nodes: Record<string, AnyNode>
  parcel: ParcelAllocationParcel
  parcelWorldId: string
}) {
  return collectPascalWaterBuildNodesInsideParcel(nodes, parcel).map((node) =>
    sanitizePascalWaterBuildNodeForSync(node, parcelWorldId, parcel.id),
  )
}

function sanitizePascalWaterIncomingBuildNodes(
  build: ParcelBuildNodesSnapshot,
  parcelWorldId: string,
  parcel: ParcelAllocationParcel,
) {
  const nodes = Object.fromEntries(build.nodes.map((node) => [node.id, node])) as Record<
    string,
    AnyNode
  >
  return collectPascalWaterBuildNodesInsideParcel(nodes, parcel).map((node) =>
    sanitizePascalWaterBuildNodeForSync(node, parcelWorldId, parcel.id),
  )
}

function collectPascalWaterBuildNodesInsideParcel(
  nodes: Record<string, AnyNode>,
  parcel: ParcelAllocationParcel,
) {
  const selectedIds = new Set<AnyNodeId>()
  const childrenByParentId = new Map<AnyNodeId, AnyNodeId[]>()

  for (const node of Object.values(nodes)) {
    const parentId = node.parentId as AnyNodeId | null
    if (!parentId) continue

    const children = childrenByParentId.get(parentId) ?? []
    children.push(node.id as AnyNodeId)
    childrenByParentId.set(parentId, children)
  }

  const collectDescendants = (id: AnyNodeId) => {
    if (selectedIds.has(id)) return
    const node = nodes[id]
    if (!node) return

    selectedIds.add(id)
    const explicitChildIds =
      'children' in node && Array.isArray(node.children) ? (node.children as AnyNodeId[]) : []
    const childIds = new Set<AnyNodeId>([
      ...explicitChildIds,
      ...(childrenByParentId.get(id) ?? []),
    ])
    childIds.forEach(collectDescendants)
  }

  for (const node of Object.values(nodes)) {
    if (!isPascalWaterBuildObjectNode(node)) continue
    if (!isPascalWaterBuildNodeInsideParcel(node, parcel, nodes)) continue

    collectDescendants(node.id as AnyNodeId)
  }

  return Array.from(selectedIds)
    .map((id) => nodes[id])
    .filter((node): node is AnyNode => Boolean(node))
    .sort((first, second) => {
      const depthDiff =
        pascalWaterBuildNodeParentDepth(first, nodes) -
        pascalWaterBuildNodeParentDepth(second, nodes)
      return depthDiff || first.id.localeCompare(second.id)
    })
}

function sanitizePascalWaterBuildNodeForSync(
  node: AnyNode,
  parcelWorldId: string,
  parcelId: string,
) {
  const clone = JSON.parse(JSON.stringify(node)) as AnyNode & {
    children?: unknown[]
    metadata?: Record<string, unknown>
  }
  const metadata =
    clone.metadata && typeof clone.metadata === 'object' && !Array.isArray(clone.metadata)
      ? clone.metadata
      : {}
  clone.metadata = {
    ...metadata,
    landrushBuildSynced: true,
    landrushParcelId: parcelId,
    landrushWorldId: parcelWorldId,
  }
  return clone as AnyNode
}

function pascalWaterBuildNodeParentDepth(node: AnyNode, nodes: Record<string, AnyNode>) {
  let depth = 0
  let parentId = node.parentId as string | null
  const visited = new Set<string>()

  while (
    parentId &&
    parentId !== PASCAL_WATER_LEVEL_ID &&
    nodes[parentId] &&
    !visited.has(parentId)
  ) {
    visited.add(parentId)
    depth += 1
    const parent = nodes[parentId]
    parentId = parent ? (parent.parentId as string | null) : null
  }

  return depth
}

function isPascalWaterBuildNodeInsideParcel(
  node: AnyNode,
  parcel: ParcelAllocationParcel,
  nodes: Record<string, AnyNode>,
) {
  const footprints = createPascalWaterBuildNodeFootprints(node, 0, nodes)
  return (
    footprints.length > 0 &&
    footprints.every((footprint) =>
      footprint.every((point) => pointInPolygonOrNearEdge(point, parcel.points)),
    )
  )
}

function applyPascalWaterBuildSnapshot(
  scene: PascalWaterSceneStore,
  parcelId: string,
  nodes: readonly AnyNode[],
) {
  const incomingIds = new Set(nodes.map((node) => node.id as AnyNodeId))
  const deleteIds = Object.values(scene.nodes)
    .filter((node) => isPascalWaterSyncedBuildNodeForParcel(node, parcelId))
    .map((node) => node.id as AnyNodeId)
    .filter((id) => !incomingIds.has(id))
  const createNodes: { node: AnyNode; parentId?: AnyNodeId }[] = []
  const updateNodes: { id: AnyNodeId; data: Partial<AnyNode> }[] = []

  for (const node of nodes) {
    const id = node.id as AnyNodeId
    const existing = scene.nodes[id]
    if (existing) {
      if (
        isPascalWaterSyncedBuildNodeForParcel(existing, parcelId) ||
        isPascalWaterSyncedBuildNodeForParcel(node, parcelId)
      ) {
        updateNodes.push({ data: node, id })
      }
      continue
    }
    createNodes.push({
      node,
      parentId:
        node.parentId && incomingIds.has(node.parentId as AnyNodeId)
          ? (node.parentId as AnyNodeId)
          : (PASCAL_WATER_LEVEL_ID as AnyNodeId),
    })
  }

  if (createNodes.length === 0 && updateNodes.length === 0 && deleteIds.length === 0) return
  scene.applyNodeChanges({
    create: createNodes,
    delete: deleteIds,
    update: updateNodes,
  })
  renderScheduler.requestFrame('geometry:changed')
}

function isPascalWaterSyncedBuildNodeForParcel(node: AnyNode, parcelId: string) {
  const metadata = node.metadata as
    | { landrushBuildSynced?: boolean; landrushParcelId?: string }
    | undefined
  return metadata?.landrushBuildSynced === true && metadata.landrushParcelId === parcelId
}

function signatureForPascalWaterBuildNodes(nodes: readonly AnyNode[]) {
  return JSON.stringify(nodes)
}

function createPascalWaterBuiltGrassBlockers(
  nodes: Record<string, AnyNode>,
): readonly GrassFieldBlocker[] {
  const blockers: GrassFieldBlocker[] = []
  for (const node of Object.values(nodes)) {
    for (const footprint of createPascalWaterBuildNodeFootprints(
      node,
      PASCAL_WATER_BUILT_GRASS_PADDING_METERS,
      nodes,
    )) {
      blockers.push({
        featherMeters: PASCAL_WATER_BUILT_GRASS_FEATHER_METERS,
        points: footprint,
      })
    }
  }
  return blockers
}

function createPascalWaterHiddenBladeFadeBlocker(blocker: GrassFieldBlocker): GrassFieldBlocker {
  return {
    ...blocker,
    initialVisibility: 0,
  }
}

function createPascalWaterNavigationObstacles(
  nodes: Record<string, AnyNode>,
): readonly PascalWaterNavigationObstacle[] {
  const obstacles: PascalWaterNavigationObstacle[] = []
  for (const node of Object.values(nodes)) {
    if (!isPascalWaterNavigationObstacleNode(node)) continue
    const footprint = createPascalWaterBuildNodeFootprint(
      node,
      PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS,
    )
    if (!footprint) continue
    obstacles.push({ points: footprint })
  }
  return obstacles
}

function createPascalWaterInvalidBuildNodeIds(
  nodes: Record<string, AnyNode>,
  parcel: ParcelAllocationParcel,
) {
  const invalidIds: string[] = []
  for (const node of Object.values(nodes)) {
    if (node.parentId !== PASCAL_WATER_LEVEL_ID) continue
    const footprints = createPascalWaterBuildNodeFootprints(node, 0, nodes)
    if (footprints.length === 0) continue
    if (
      footprints.every((footprint) =>
        footprint.every((point) => pointInPolygonOrNearEdge(point, parcel.points)),
      )
    ) {
      continue
    }
    invalidIds.push(node.id)
  }
  return invalidIds
}

function createPascalWaterBuildNodeFootprints(
  node: AnyNode,
  padding: number,
  nodes: Record<string, AnyNode>,
): readonly (readonly LandrushPoint2[])[] {
  if (!isPascalWaterBuildObjectNode(node)) return []
  if (node.type === 'roof') return createPascalWaterRoofBuildFootprints(node, padding, nodes)

  const footprint = createPascalWaterBuildNodeFootprint(node, padding)
  return footprint ? [footprint] : []
}

function createPascalWaterRoofBuildFootprints(
  roof: PascalWaterRoofNode,
  padding: number,
  nodes: Record<string, AnyNode>,
): readonly (readonly LandrushPoint2[])[] {
  const childIds = new Set([
    ...(roof.children ?? []),
    ...Object.values(nodes)
      .filter((node) => node.parentId === roof.id)
      .map((node) => node.id as AnyNodeId),
  ])
  const footprints: Array<readonly LandrushPoint2[]> = [...childIds].flatMap((childId) => {
    const segment = nodes[childId] as PascalWaterRoofSegmentNode | undefined
    if (segment?.type !== 'roof-segment' || segment.visible === false) return []
    const overhang = segment.overhang ?? 0
    return [
      rectFootprint({
        center: rotateFootprintPoint(
          { x: segment.position[0], z: segment.position[2] },
          { x: roof.position[0], z: roof.position[2] },
          roof.rotation ?? 0,
        ),
        depth: segment.depth + overhang * 2 + padding * 2,
        rotation: (roof.rotation ?? 0) + (segment.rotation ?? 0),
        width: segment.width + overhang * 2 + padding * 2,
      }),
    ]
  })

  if (footprints.length > 0) return footprints
  return [
    rectFootprint({
      center: { x: roof.position[0], z: roof.position[2] },
      depth: 0.4 + padding * 2,
      rotation: roof.rotation ?? 0,
      width: 0.4 + padding * 2,
    }),
  ]
}

function createPascalWaterBuildNodeFootprint(
  node: AnyNode,
  padding: number,
): readonly LandrushPoint2[] | null {
  if (!isPascalWaterBuildObjectNode(node)) return null

  if (node.type === 'wall' || node.type === 'fence') {
    return segmentFootprint(
      { x: node.start[0], z: node.start[1] },
      { x: node.end[0], z: node.end[1] },
      (node.thickness ?? 0.18) + padding * 2,
    )
  }

  if (node.type === 'slab' || node.type === 'ceiling') {
    return node.polygon.map(([x, z]) => ({ x, z }))
  }

  if (node.type === 'item') {
    if (node.parentId !== PASCAL_WATER_LEVEL_ID || node.asset.attachTo) return null
    const [width, , depth] = node.asset.dimensions
    return rectFootprint({
      center: { x: node.position[0], z: node.position[2] },
      depth: depth * node.scale[2] + padding * 2,
      rotation: node.rotation[1] ?? 0,
      width: width * node.scale[0] + padding * 2,
    })
  }

  if (node.type === 'column') {
    const width = node.crossSection === 'round' ? node.radius * 2 : node.width
    const depth = node.crossSection === 'round' ? node.radius * 2 : node.depth
    return rectFootprint({
      center: { x: node.position[0], z: node.position[2] },
      depth: depth + padding * 2,
      rotation: node.rotation,
      width: width + padding * 2,
    })
  }

  if (node.type === 'elevator') {
    return rectFootprint({
      center: { x: node.position[0], z: node.position[2] },
      depth: (node.shaftDepth ?? node.depth) + padding * 2,
      rotation: node.rotation,
      width: (node.shaftWidth ?? node.width) + padding * 2,
    })
  }

  if (node.type === 'stair') {
    const run = Math.max(0.8, node.stepCount * 0.28 + node.topLandingDepth)
    return rectFootprint({
      center: { x: node.position[0], z: node.position[2] },
      depth: run + padding * 2,
      rotation: node.rotation,
      width: node.width + padding * 2,
    })
  }

  if (node.type === 'shelf') {
    return rectFootprint({
      center: { x: node.position[0], z: node.position[2] },
      depth: node.depth + padding * 2,
      rotation: node.rotation[1] ?? 0,
      width: node.width + padding * 2,
    })
  }

  return null
}

function isPascalWaterBuildObjectNode(node: AnyNode) {
  if (node.visible === false || node.parentId !== PASCAL_WATER_LEVEL_ID) return false
  const metadata = node.metadata as { isTransient?: boolean } | undefined
  if (metadata?.isTransient) return false
  return (
    node.type === 'wall' ||
    node.type === 'fence' ||
    node.type === 'item' ||
    node.type === 'slab' ||
    node.type === 'ceiling' ||
    node.type === 'column' ||
    node.type === 'elevator' ||
    node.type === 'stair' ||
    node.type === 'roof' ||
    node.type === 'shelf'
  )
}

function isPascalWaterNavigationObstacleNode(node: AnyNode) {
  if (node.visible === false || node.parentId !== PASCAL_WATER_LEVEL_ID) return false
  const metadata = node.metadata as { isTransient?: boolean } | undefined
  if (metadata?.isTransient) return false
  return (
    node.type === 'wall' ||
    node.type === 'fence' ||
    node.type === 'item' ||
    node.type === 'column' ||
    node.type === 'elevator'
  )
}

function resolvePascalWaterNavigationSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
) {
  if (!pascalWaterNavigationSegmentBlocked(start, target, obstacles)) return target

  let bestPoint: LandrushPoint2 | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const obstacle of obstacles) {
    if (!pascalWaterNavigationSegmentIntersectsPolygon(start, target, obstacle.points)) continue

    for (const vertex of obstacle.points) {
      const candidate = offsetPascalWaterNavigationCandidate(vertex, obstacle.points, 0.35)
      if (!pointInPolygon(candidate, surfacePoints)) continue
      if (pascalWaterNavigationSegmentBlocked(start, candidate, obstacles)) continue
      if (pascalWaterNavigationSegmentBlocked(candidate, target, obstacles)) continue

      const distance =
        Math.hypot(candidate.x - start.x, candidate.z - start.z) +
        Math.hypot(target.x - candidate.x, target.z - candidate.z)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPoint = candidate
      }
    }
  }

  return bestPoint ?? target
}

function offsetPascalWaterNavigationCandidate(
  point: LandrushPoint2,
  polygon: readonly LandrushPoint2[],
  distance: number,
) {
  const centroid = centroidForPolygon(polygon)
  const direction = normalize2(point.x - centroid.x, point.z - centroid.z)
  return {
    x: point.x + direction.x * distance,
    z: point.z + direction.z * distance,
  }
}

function pascalWaterNavigationSegmentBlocked(
  start: LandrushPoint2,
  end: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
) {
  for (const obstacle of obstacles) {
    if (pascalWaterNavigationSegmentIntersectsPolygon(start, end, obstacle.points)) return true
  }
  return false
}

function pascalWaterNavigationSegmentIntersectsPolygon(
  start: LandrushPoint2,
  end: LandrushPoint2,
  polygon: readonly LandrushPoint2[],
) {
  if (pointInPolygon(end, polygon)) return true

  const ring = openPointRing(polygon)
  for (let index = 0; index < ring.length; index += 1) {
    const edgeStart = ring[index]
    const edgeEnd = ring[(index + 1) % ring.length]
    if (!edgeStart || !edgeEnd) continue
    if (segmentsIntersect2(start, end, edgeStart, edgeEnd)) return true
  }
  return false
}

function segmentsIntersect2(
  firstStart: LandrushPoint2,
  firstEnd: LandrushPoint2,
  secondStart: LandrushPoint2,
  secondEnd: LandrushPoint2,
) {
  const firstDirection = orient2(firstStart, firstEnd, secondStart)
  const secondDirection = orient2(firstStart, firstEnd, secondEnd)
  const thirdDirection = orient2(secondStart, secondEnd, firstStart)
  const fourthDirection = orient2(secondStart, secondEnd, firstEnd)

  if (
    Math.sign(firstDirection) !== Math.sign(secondDirection) &&
    Math.sign(thirdDirection) !== Math.sign(fourthDirection)
  ) {
    return true
  }

  return (
    pointOnSegment2(secondStart, firstStart, firstEnd, firstDirection) ||
    pointOnSegment2(secondEnd, firstStart, firstEnd, secondDirection) ||
    pointOnSegment2(firstStart, secondStart, secondEnd, thirdDirection) ||
    pointOnSegment2(firstEnd, secondStart, secondEnd, fourthDirection)
  )
}

function orient2(a: LandrushPoint2, b: LandrushPoint2, c: LandrushPoint2) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function pointOnSegment2(
  point: LandrushPoint2,
  start: LandrushPoint2,
  end: LandrushPoint2,
  orientation: number,
) {
  if (Math.abs(orientation) > 0.000001) return false
  return (
    point.x >= Math.min(start.x, end.x) - 0.000001 &&
    point.x <= Math.max(start.x, end.x) + 0.000001 &&
    point.z >= Math.min(start.z, end.z) - 0.000001 &&
    point.z <= Math.max(start.z, end.z) + 0.000001
  )
}

function rectFootprint({
  center,
  depth,
  rotation,
  width,
}: {
  center: LandrushPoint2
  depth: number
  rotation: number
  width: number
}): readonly LandrushPoint2[] {
  const halfWidth = Math.max(0.04, width / 2)
  const halfDepth = Math.max(0.04, depth / 2)
  return [
    rotateFootprintPoint({ x: -halfWidth, z: -halfDepth }, center, rotation),
    rotateFootprintPoint({ x: halfWidth, z: -halfDepth }, center, rotation),
    rotateFootprintPoint({ x: halfWidth, z: halfDepth }, center, rotation),
    rotateFootprintPoint({ x: -halfWidth, z: halfDepth }, center, rotation),
  ]
}

function segmentFootprint(
  start: LandrushPoint2,
  end: LandrushPoint2,
  width: number,
): readonly LandrushPoint2[] {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length <= 0.000001) {
    return rectFootprint({ center: start, depth: width, rotation: 0, width })
  }

  const halfWidth = Math.max(0.04, width / 2)
  const nx = (-dz / length) * halfWidth
  const nz = (dx / length) * halfWidth
  return [
    { x: start.x + nx, z: start.z + nz },
    { x: end.x + nx, z: end.z + nz },
    { x: end.x - nx, z: end.z - nz },
    { x: start.x - nx, z: start.z - nz },
  ]
}

function rotateFootprintPoint(
  point: LandrushPoint2,
  center: LandrushPoint2,
  rotation: number,
): LandrushPoint2 {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    x: center.x + point.x * cos - point.z * sin,
    z: center.z + point.x * sin + point.z * cos,
  }
}

function pointInPolygonOrNearEdge(
  point: LandrushPoint2,
  polygon: readonly LandrushPoint2[],
  tolerance = PASCAL_WATER_BUILD_PARCEL_EDGE_TOLERANCE_METERS,
) {
  return pointInPolygon(point, polygon) || distanceToClosedPolyline(point, polygon) <= tolerance
}

function distanceToClosedPolyline(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  const ring = openPointRing(polygon)
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (start && end) best = Math.min(best, distanceToSegment2(point, start, end))
  }
  return best
}

function distanceToSegment2(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const t = clamp01(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 0.000001),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function snapshotPoint(player: MultiplayerPlayerSnapshot): LandrushPoint2 {
  return { x: player.position[0], z: player.position[2] }
}

function releasePascalWaterPointerLock() {
  if (!(document.pointerLockElement instanceof HTMLCanvasElement)) return false
  document.exitPointerLock()
  return true
}

function findTouchById<TouchLike extends { identifier: number }>(
  touches: { item: (index: number) => TouchLike | null; length: number },
  identifier: number,
) {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index)
    if (touch?.identifier === identifier) return touch
  }
  return null
}

function isPascalWaterMobileControlViewport() {
  return (
    typeof window !== 'undefined' && window.matchMedia(PASCAL_WATER_MOBILE_CONTROLS_QUERY).matches
  )
}

function createPascalWaterViewerLandSurface(
  surface: PascalWaterLandSurface,
): PascalWaterLandSurface {
  const elevationOffset = surface.grassSurfaceElevation
  return {
    ...surface,
    grassSurfaceElevation: 0,
    plateauElevation: surface.plateauElevation - elevationOffset,
  }
}

function createPascalWaterGrassRoadSegments(
  segments: LandrushWorldNode['roads']['segments'],
): readonly LandrushRoadSegment[] {
  return segments.map((segment) => ({
    connectsParcelIds: segment.connectsParcelIds,
    fromNodeId: segment.fromNodeId,
    id: `pascal-water-grass-${segment.id}`,
    kind: segment.kind === 'driveway' ? 'driveway' : 'spine',
    points: segment.points,
    r3fPoints: segment.points.map((point) => [point.x, 0, point.z] satisfies LandrushVec3),
    toNodeId: segment.toNodeId,
    width: segment.width,
  }))
}

function createPascalWaterPerimeter(island: PascalWaterIsland): PascalWaterPerimeter {
  return {
    bounds: island.perimeter.bounds,
    closed: island.perimeter.closed,
    points: [...island.perimeter.points],
  }
}

function createPascalWaterNodeRenderSignature(node: PascalWaterNode) {
  return JSON.stringify({
    elevationParameters: node.elevationParameters,
    fieldParameters: node.fieldParameters,
    maskLandWater: node.maskLandWater,
    materialParameters: node.materialParameters,
    perimeter: node.perimeter,
    planeSize: node.planeSize,
    position: node.position,
    showDepthReference: node.showDepthReference,
    terrainFieldResolution: node.terrainFieldResolution,
  })
}

function createPascalWaterNode({
  elevationParameters,
  fieldParameters,
  materialParameters,
  perimeter,
  profilePlainWaterMaterial,
  showDepthReference,
  terrainFieldResolution,
  waterFieldDebugMode,
  waterLabSeed,
}: {
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  materialParameters: LandrushWaterSurfaceParameters
  perimeter: PascalWaterPerimeter
  profilePlainWaterMaterial?: boolean
  showDepthReference: boolean
  terrainFieldResolution: number
  waterFieldDebugMode?: PascalWaterFieldDebugMode
  waterLabSeed: string
}) {
  const landSurface = createPascalWaterLandSurface({
    elevationParameters,
    shorelinePoints: perimeter.points,
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const waterNode: PascalWaterNode = {
    object: 'node',
    id: PASCAL_WATER_NODE_ID as never,
    type: 'pascal-water',
    name: 'Pascal Water',
    parentId: PASCAL_WATER_LEVEL_ID,
    visible: true,
    position: [0, -landSurface.grassSurfaceElevation, 0],
    planeSize: WATER_PLANE_SIZE,
    perimeter,
    fieldParameters,
    elevationParameters,
    materialParameters: {
      ...materialParameters,
      depthExponent: fieldParameters.depthExponent,
      depthNoiseFrequency: fieldParameters.depthNoiseFrequency,
      depthNoiseStrength: fieldParameters.depthNoiseStrength,
      depthReach: fieldParameters.depthReach,
      edgeFadeDistance: fieldParameters.edgeFadeDistance,
    } satisfies Partial<LandrushWaterSurfaceParameters>,
    showDepthReference,
    terrainFieldResolution,
    maskLandWater: false,
    metadata: {
      grassSurfaceElevation: landSurface.grassSurfaceElevation,
      ...(profilePlainWaterMaterial ? { profilePlainWaterMaterial: true } : {}),
      source: 'pascal-water-debug',
      ...(waterFieldDebugMode ? { waterFieldDebugMode } : {}),
      waterLabSeed,
    },
  }

  return { waterNode }
}

function createPascalWaterLayoutNode({
  allocation,
  island,
  landSurface,
  layoutConfig,
}: {
  allocation: ParcelAllocationResult
  island: PascalWaterIsland
  landSurface: PascalWaterLandSurface
  layoutConfig: PascalWaterExperienceConfig
}): PascalWaterLayoutNode {
  const streetNetwork = generateParcelEdgeStreets(allocation, {
    loopiness: 0,
    roadWidthMeters: PASCAL_WATER_DIRT_ROAD_WIDTH_METERS,
    seed: `${island.seed}:world-streets:${PASCAL_WATER_PARCEL_PARAMETERS.parcelCount}`,
  })
  const perimeterPoints = openPointRing(landSurface.grassSurfacePoints)
  const bounds = boundsForPoints(perimeterPoints)
  const center = polygonCentroid(perimeterPoints)
  const roadNodes = createPascalWaterRoadNodes(streetNetwork)
  const roadSegments = streetNetwork.segments.map((segment) =>
    createPascalWaterRoadSegment(segment),
  )
  const layoutNode = {
    object: 'node',
    id: layoutConfig.layoutNodeId as never,
    type: layoutConfig.layoutNodeKind,
    name: layoutConfig.layoutNodeName,
    parentId: PASCAL_WATER_LEVEL_ID,
    visible: true,
    position: [0, 0, 0],
    seed: island.seed,
    size: { width: WATER_PLANE_SIZE, depth: WATER_PLANE_SIZE },
    perimeter: {
      bounds,
      closed: true,
      id: 'world-multiplayer-grass-surface',
      points: closedPointRing(perimeterPoints),
    },
    parcels: allocation.parcels.map(createPascalWaterParcel),
    ownerParcelId: '',
    roads: {
      adjacency: createPascalWaterRoadAdjacency(roadSegments),
      connected: streetNetwork.roadConnected,
      connectedParcelIds: [...streetNetwork.connectedParcelIds],
      nodes: roadNodes,
      segments: roadSegments,
      sidewalks: [],
    },
    trees: [],
    playerStart: [center.x, PASCAL_WATER_VISUAL_PLAYER_GROUND_Y, center.z],
    playerPosition: [center.x, PASCAL_WATER_VISUAL_PLAYER_GROUND_Y, center.z],
    playerHeading: 0,
    playerMoving: false,
    playerSpeed: 0,
    remotePlayers: [],
    focusParcelId: null,
    landrushMode: 'walk',
    metadata: {
      actualBounds: bounds,
      checks: [
        {
          check: 'world-multiplayer parcel allocation',
          pass: allocation.parcels.length === PASCAL_WATER_PARCEL_PARAMETERS.parcelCount,
          value: allocation.parcels.length,
        },
        {
          check: 'world-multiplayer dirt edge paths',
          pass: streetNetwork.segments.length > 0,
          value: streetNetwork.segments.length,
        },
      ],
      counts: {
        parcels: allocation.parcels.length,
        perimeterPoints: perimeterPoints.length,
        roadNodes: roadNodes.length,
        roadSegments: roadSegments.length,
        sidewalks: 0,
        trees: 0,
      },
      ownerParcelId: '',
      requestedSize: island.size,
      roadGraph: {
        connected: streetNetwork.roadConnected,
        connectedParcelIds: [...streetNetwork.connectedParcelIds],
        reachableNodeCount: roadNodes.length,
        totalNodeCount: roadNodes.length,
      },
      seed: island.seed,
      source: layoutConfig.layoutNodeMetadataSource,
      summary: `World multiplayer layout: ${allocation.parcels.length} parcels, ${streetNetwork.segments.length} dirt edge paths.`,
      verificationSummary:
        'Generated from the same smoothed water island, parcel allocator, and dirt-copy edge street path used by world-multiplayer.',
    },
  }

  if (layoutConfig.layoutNodeKind === 'landrush-layout') {
    return LandrushLayoutNodeSchema.parse(layoutNode)
  }

  return LandrushWorldNodeSchema.parse({
    ...layoutNode,
    renderFlags: {
      grassBlades: false,
      grassPatches: false,
      ground: false,
      parcelDetails: false,
      parcels: false,
      robot: false,
      roads: false,
      shoreDetails: false,
      trees: false,
      water: false,
    },
    type: 'landrush-world',
  })
}

function createPascalWaterSceneGraph(options: {
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  islandParameters: WaterLabIslandParameters
  layoutConfig: PascalWaterExperienceConfig
  materialParameters: LandrushWaterSurfaceParameters
  omitWaterNode?: boolean
  profilePlainWaterMaterial?: boolean
  showDepthReference: boolean
  terrainFieldResolution: number
  waterFieldDebugMode?: PascalWaterFieldDebugMode
}): {
  landrushLayoutNode: PascalWaterLayoutNode
  sceneGraph: SceneGraph
  waterNode: PascalWaterNode
} {
  const island = generateWaterLabIsland(options.islandParameters)
  const landSurface = createPascalWaterLandSurface({
    elevationParameters: options.elevationParameters,
    shorelinePoints: createPascalWaterSmoothedPerimeter(island.perimeter.points),
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const { waterNode } = createPascalWaterNode({
    elevationParameters: options.elevationParameters,
    fieldParameters: options.fieldParameters,
    materialParameters: options.materialParameters,
    perimeter: createPascalWaterPerimeter(island),
    profilePlainWaterMaterial: options.profilePlainWaterMaterial,
    showDepthReference: options.showDepthReference,
    terrainFieldResolution: options.terrainFieldResolution,
    waterFieldDebugMode: options.waterFieldDebugMode,
    waterLabSeed: island.seed,
  })
  const landrushLayoutNode = createPascalWaterLayoutNode({
    allocation: allocateParcels(
      landSurface.grassSurfacePoints,
      createPascalWaterParcelOptions(island.seed),
    ),
    island,
    landSurface,
    layoutConfig: options.layoutConfig,
  })
  const levelChildren = options.omitWaterNode
    ? [landrushLayoutNode.id]
    : [waterNode.id, landrushLayoutNode.id]
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
    children: levelChildren,
    level: 0,
    metadata: { source: 'pascal-water-debug' },
  }

  return {
    landrushLayoutNode,
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
          visible: false,
          metadata: { source: 'pascal-water-debug' },
          polygon: {
            points: [],
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
        [landrushLayoutNode.id]: landrushLayoutNode,
        ...(options.omitWaterNode ? {} : { [waterNode.id]: waterNode }),
      },
    },
  }
}

function createPascalWaterParcelOptions(seed: string): ParcelAllocationOptions {
  return {
    count: PASCAL_WATER_PARCEL_PARAMETERS.parcelCount,
    maxEdges: PASCAL_WATER_PARCEL_PARAMETERS.maxEdges,
    seed: `${seed}:world-parcels:${PASCAL_WATER_PARCEL_PARAMETERS.parcelCount}`,
    shoreSetbackMeters: PASCAL_WATER_PARCEL_PARAMETERS.shoreSetbackMeters,
    simplifyToleranceMeters: PASCAL_WATER_PARCEL_PARAMETERS.simplifyToleranceMeters,
    splitJitter: PASCAL_WATER_PARCEL_PARAMETERS.splitJitter,
    squareness: PASCAL_WATER_PARCEL_PARAMETERS.squareness,
  }
}

function createPascalWaterParcelOwnershipWorldId(options: ParcelAllocationOptions) {
  return [
    'landrush-world',
    'pascal-water',
    options.seed,
    options.count,
    options.maxEdges,
    options.shoreSetbackMeters,
    options.simplifyToleranceMeters,
    options.splitJitter,
    options.squareness,
  ]
    .join(':')
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .slice(0, 240)
}

function createPascalWaterParcel(
  parcel: ParcelAllocationParcel,
): LandrushWorldNode['parcels'][number] {
  return {
    center: parcel.centroid,
    centroid: parcel.centroid,
    edges: parcel.points.map((start, index) => {
      const end = parcel.points[(index + 1) % parcel.points.length] ?? start
      const control = midpoint2(start, end)
      return {
        control,
        end,
        id: `${parcel.id}-edge-${index + 1}`,
        samples: [start, control, end],
        start,
      }
    }),
    entryPoint: parcel.centroid,
    fillColor: PASCAL_WATER_PARCEL_OVERLAY_COLOR,
    id: parcel.id,
    index: parcel.index,
    kind: 'neighbor',
    label: `Parcel ${parcel.index + 1}`,
    outline: [...parcel.points],
    owner: {
      accentColor: PASCAL_WATER_PARCEL_OVERLAY_COLOR,
      id: 'unclaimed',
      label: 'Unclaimed',
    },
    radius: Math.sqrt(Math.max(0.001, parcel.area) / Math.PI),
    vertices: [...parcel.points],
  }
}

function createPascalWaterRoadNodes(network: ParcelStreetNetwork) {
  const nodes = new Map<string, LandrushWorldNode['roads']['nodes'][number]>()

  for (const segment of network.segments) {
    const start = segment.points[0]
    const end = segment.points.at(-1)
    if (start) {
      nodes.set(roadNodeId(start), {
        id: roadNodeId(start),
        kind: 'spine',
        position: start,
      })
    }
    if (end) {
      nodes.set(roadNodeId(end), {
        id: roadNodeId(end),
        kind: 'spine',
        position: end,
      })
    }
  }

  return [...nodes.values()]
}

function createPascalWaterRoadSegment(
  segment: ParcelStreetSegment,
): LandrushWorldNode['roads']['segments'][number] {
  const start = segment.points[0] ?? { x: 0, z: 0 }
  const end = segment.points.at(-1) ?? start
  return {
    connectsParcelIds: [...segment.parcelIds],
    fromNodeId: roadNodeId(start),
    id: `world-multiplayer-${segment.id}`,
    kind: 'spine',
    points: [...segment.points],
    toNodeId: roadNodeId(end),
    width: segment.width,
  }
}

function createPascalWaterRoadAdjacency(
  segments: readonly LandrushWorldNode['roads']['segments'][number][],
) {
  const adjacency: Record<string, string[]> = {}

  for (const segment of segments) {
    adjacency[segment.fromNodeId] ??= []
    adjacency[segment.toNodeId] ??= []
    adjacency[segment.fromNodeId]!.push(segment.toNodeId)
    adjacency[segment.toNodeId]!.push(segment.fromNodeId)
  }

  return adjacency
}

function roadNodeId(point: LandrushPoint2) {
  return `layout-road-${Math.round(point.x * 100)}-${Math.round(point.z * 100)}`
}

function boundsForPoints(
  points: readonly LandrushPoint2[],
): LandrushWorldNode['perimeter']['bounds'] {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }

  if (!Number.isFinite(minX)) {
    return { depth: 0, maxX: 0, maxZ: 0, minX: 0, minZ: 0, width: 0 }
  }

  return {
    depth: maxZ - minZ,
    maxX,
    maxZ,
    minX,
    minZ,
    width: maxX - minX,
  }
}

function openPointRing(points: readonly LandrushPoint2[]) {
  if (points.length < 2) return [...points]
  const first = points[0]
  const last = points.at(-1)
  if (first && last && areSamePoint(first, last)) return points.slice(0, -1)
  return [...points]
}

function closedPointRing(points: readonly LandrushPoint2[]) {
  const ring = openPointRing(points)
  const first = ring[0]
  const last = ring.at(-1)
  if (!first) return ring
  if (last && areSamePoint(first, last)) return ring
  return [...ring, first]
}

function areSamePoint(first: LandrushPoint2, second: LandrushPoint2) {
  return Math.abs(first.x - second.x) <= 0.001 && Math.abs(first.z - second.z) <= 0.001
}

function midpoint2(first: LandrushPoint2, second: LandrushPoint2): LandrushPoint2 {
  return {
    x: (first.x + second.x) / 2,
    z: (first.z + second.z) / 2,
  }
}
