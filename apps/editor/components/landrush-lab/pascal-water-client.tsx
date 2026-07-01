'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type DoorAnimationState,
  emitter,
  isOperationDoorType,
  type LandrushLayoutNode,
  LandrushLayoutNode as LandrushLayoutNodeSchema,
  type LandrushWorldNode,
  LandrushWorldNode as LandrushWorldNodeSchema,
  type LevelNode,
  type PascalWaterNode,
  sceneRegistry,
  useInteractive,
  useScene,
} from '@pascal-app/core'
import {
  BVHEcctrl,
  type BVHEcctrlApi,
  buildFirstPersonColliderWorldFromRegistry,
  buildFloorplanStairEntry,
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
  type LandrushRobotAnimationState,
  type LandrushRobotHoverPoseSample,
  type LandrushRobotPresentationMode,
  resolveLandrushRobotHoverOffset,
} from '@pascal-app/nodes/landrush-world/robot'
import { GRID_LAYER, renderScheduler, useViewer } from '@pascal-app/viewer'
import { Html, KeyboardControls, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { type RootState, useFrame, useThree } from '@react-three/fiber'
import {
  ChevronDown,
  ChevronRight,
  Hammer,
  Layers,
  Map as MapIcon,
  Mic,
  MicOff,
  MouseRight,
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
  Box3,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  DoubleSide,
  type Group,
  LineBasicMaterial,
  type Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import { float } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh/src/index.js'
import type { LandrushPoint2, LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { FrameLoadProfilerProbe, measureLandrushFrameSlice } from './frame-load-profiler'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, type GrassFieldBlocker } from './grass-field-texture'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GrassWaterLandLayers } from './grass-water-layers'
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
import { LandrushRobotFootstepAudio } from './robot-footstep-audio'
import {
  clearLandrushRobotScreenRevealMask,
  createLandrushRobotScreenRevealOpacityNode,
  readLandrushRobotScreenRevealMaskSnapshot,
  updateLandrushRobotScreenRevealMask,
} from './robot-screen-reveal-mask'
import type { StylizedGrassInteraction, StylizedGrassPerfProbe } from './stylized-scene-land-layers'
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
import {
  type SpatialVoiceController,
  type SpatialVoiceSignalMessage,
  useLandrushSpatialVoice,
} from './world-multiplayer-spatial-audio'
import { SpatialVoiceRangeRing } from './world-multiplayer-spatial-voice-range'

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
const PASCAL_WATER_ISOMETRIC_CAMERA_YAW_DRAG_SPEED = 0.006
const PASCAL_WATER_ISOMETRIC_CAMERA_INITIAL_YAW = MathUtils.degToRad(135)
const PASCAL_WATER_ISOMETRIC_CAMERA_YAW_RESPONSE = 8
const PASCAL_WATER_ISOMETRIC_CAMERA_YAW_SPEED = MathUtils.degToRad(88)
const PASCAL_WATER_ISOMETRIC_CAMERA_ZOOM_STEP = 0.0006
const PASCAL_WATER_ROBOT_MESH_WIDTH_METERS = 0.46
const PASCAL_WATER_CLICK_MOVE_STOP_RADIUS = 0.35
const PASCAL_WATER_CLICK_MOVE_PROJECTED_STOP_RADIUS = PASCAL_WATER_CLICK_MOVE_STOP_RADIUS * 1.75
const PASCAL_WATER_CLICK_MOVE_WAYPOINT_RADIUS = 0.36
const PASCAL_WATER_CLICK_MOVE_FULL_SPEED_DISTANCE = 1.75
const PASCAL_WATER_CLICK_MOVE_MIN_SPEED_SCALE = 0.08
const PASCAL_WATER_CLICK_MOVE_RUN_DISTANCE = PASCAL_WATER_ROBOT_MESH_WIDTH_METERS * 4
const PASCAL_WATER_CLICK_MOVE_PROGRESS_EPSILON_METERS = 0.04
const PASCAL_WATER_CLICK_MOVE_STALL_MS = 650
const PASCAL_WATER_CLICK_MOVE_NO_PROGRESS_RETRY_MS = 1400
const PASCAL_WATER_CLICK_MOVE_STALL_SPEED = 0.12
const PASCAL_WATER_CLICK_MOVE_RETRY_MS = 520
const PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS = 0.78
const PASCAL_WATER_CLICK_MOVE_RECOVERY_FORWARD_METERS = 0.42
const PASCAL_WATER_CLICK_MOVE_LOCAL_RETRY_MAX = 6
const PASCAL_WATER_RIGHT_CLICK_MOVE_CLICK_TOLERANCE_PX = 8
const PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS = 0.48
const PASCAL_WATER_NAVIGATION_SLIDE_RADIUS_METERS =
  PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS + PASCAL_WATER_ROBOT_MESH_WIDTH_METERS * 0.5
const PASCAL_WATER_NAVIGATION_SLIDE_MIN_INWARD_DOT = 0.025
const PASCAL_WATER_NAVIGATION_TARGET_NUDGE_METERS = 0.08
const PASCAL_WATER_NAVIGATION_VERTEX_OFFSET_METERS = 0.35
const PASCAL_WATER_NAVIGATION_MAX_GRAPH_POINTS = 96
const PASCAL_WATER_NAVIGATION_DEBUG_TRACE_POINTS = 180
const PASCAL_WATER_NAVIGATION_DEBUG_UPDATE_MS = 90
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID = 'wall_landrush-nav-live-door' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_DOOR_ID = 'door_landrush-nav-live-door' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_ROOM_EAST_WALL_ID =
  'wall_landrush-nav-live-room-east' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_ROOM_NORTH_WALL_ID =
  'wall_landrush-nav-live-room-north' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_ROOM_SOUTH_WALL_ID =
  'wall_landrush-nav-live-room-south' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_ID = 'stair_landrush-nav-live-stair' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID =
  'sseg_landrush-nav-live-stair' as const
const PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_TOP_SLAB_ID =
  'slab_landrush-nav-live-stair-top' as const
const PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS = 1.5
const PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS = 0.24
const PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS = 0.18
const PASCAL_WATER_DOOR_CROSSING_TANGENT_MARGIN_METERS = 0.5
const PASCAL_WATER_DOOR_CROSSING_MIN_INTENSITY = 0.68
const PASCAL_WATER_DOOR_CROSSING_OPEN_MIN = 0.82
const PASCAL_WATER_CONSTRAINED_CROSSING_LOOKAHEAD_METERS = 0.55
const PASCAL_WATER_CONSTRAINED_CROSSING_FULL_SPEED_METERS = 0.95
const PASCAL_WATER_CONSTRAINED_CROSSING_MIN_SPEED_SCALE = 0.28
const PASCAL_WATER_CONSTRAINED_CROSSING_MAX_SPEED_SCALE = 0.82
const PASCAL_WATER_CONSTRAINED_CROSSING_RUN_APPROACH_METERS =
  PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS * 1.5
const PASCAL_WATER_DOOR_OPEN_TRIGGER_METERS = 1.45
const PASCAL_WATER_DOOR_OPEN_LOOKAHEAD_METERS = 4.8
const PASCAL_WATER_DOOR_OPEN_PATH_CLEARANCE_METERS = 0.62
const PASCAL_WATER_DOOR_OPEN_ANIMATION_MS = 520
const PASCAL_WATER_DOOR_OPEN_SWING_ANGLE = Math.PI / 2
const PASCAL_WATER_ROBOT_PHYSICS_CENTER_FROM_ROOT = 0.8
const PASCAL_WATER_ROBOT_GRASS_INTERACTION_RADIUS = 3.15
const PASCAL_WATER_ROBOT_GRASS_IDLE_BEND_STRENGTH = 1
const PASCAL_WATER_ROBOT_GRASS_FULL_BEND_SPEED = 5.8
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_DIAMETER_SCALE = 1.5
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_FEATHER_EXPANSION_SCALE = 3
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_MIN_RADIUS_PX = 42
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_CLIP_SEGMENTS = 16
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_FEATHER_RADIUS_SCALE = 2
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_BASE_HEIGHT = 0.08
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_HEAD_HEIGHT = 2.08
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_CENTER_BIAS = 0.76
const PASCAL_WATER_ROBOT_SCREEN_REVEAL_HOVER_BOTTOM_SAFE_PX = 176
const PASCAL_WATER_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS = 0.16
const PASCAL_WATER_BUILD_ROBOT_EXIT_HOVER_RADIUS = 1.24
const PASCAL_WATER_WALK_TARGET_MIN_NORMAL_Y = 0.35
const PASCAL_WATER_BUILT_GRASS_PADDING_METERS = 1
const PASCAL_WATER_BUILT_GRASS_FEATHER_METERS = 0.3
const PASCAL_WATER_BUILD_PARCEL_BLADE_FEATHER_METERS = 0.24
const PASCAL_WATER_BUILD_PARCEL_EDGE_TOLERANCE_METERS = 0.04
const PASCAL_WATER_BUILD_GRID_SIZE_METERS = 132
const PASCAL_WATER_BUILD_GRID_DIVISIONS = 132
const PASCAL_WATER_BUILD_GRID_ELEVATION_OFFSET = 0.015
const PASCAL_WATER_BUILD_GRID_FADE_METERS = 4
const PASCAL_WATER_BUILD_GRID_FADE_BUCKETS = 8
const PASCAL_WATER_BUILD_GRID_RENDER_ORDER = 0.05
const PASCAL_WATER_BUILD_GRASS_GROUND_RENDER_ORDER = 0
const PASCAL_WATER_BUILD_GRASS_BLADE_RENDER_ORDER = 0.1
const PASCAL_WATER_BUILD_CAMERA_MIN_DISTANCE = 10
const PASCAL_WATER_BUILD_CAMERA_MAX_DISTANCE = 22
const PASCAL_WATER_BUILD_CAMERA_MIN_HEIGHT = 7
const PASCAL_WATER_BUILD_CAMERA_MAX_HEIGHT = 15
const PASCAL_WATER_CAMERA_TRANSITION_SECONDS = 2
const PASCAL_WATER_CAMERA_TRANSITION_TICK_MS = 1000 / 120
const PASCAL_WATER_CAMERA_TRANSITION_COMPLETION_EPSILON_SECONDS = 0.001
const PASCAL_WATER_RUNTIME_FRAME_GAP_MS = 34
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
const PASCAL_WATER_PARCEL_MAP_DEFAULT_FILL_OPACITY_SCALE = 0.65
const PASCAL_WATER_PARCEL_MAP_CONTOUR_OPACITY = 0.62
const PASCAL_WATER_PARCEL_MAP_FREE_BADGE_OPACITY = 0.88
const PASCAL_WATER_PARCEL_MAP_HOVER_OPACITY = 0.34
const PASCAL_WATER_PARCEL_MAP_ROAD_TRIM_METERS = PASCAL_WATER_DIRT_ROAD_WIDTH_METERS * 0.56
const PASCAL_WATER_MAP_CAMERA_POSITION = [0, 128, 0.01] as const
const PASCAL_WATER_MAP_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_WATER_MAP_CAMERA_ZOOM = 8.6
const PASCAL_WATER_MAP_CAMERA_MIN_ZOOM = 3
const PASCAL_WATER_MAP_CAMERA_MAX_ZOOM = 28
const PASCAL_WATER_MAP_CAMERA_DISTANCE = distance3(
  PASCAL_WATER_MAP_CAMERA_POSITION,
  PASCAL_WATER_MAP_CAMERA_TARGET,
)
const PASCAL_WATER_MAP_CAMERA_MIN_DISTANCE =
  (PASCAL_WATER_MAP_CAMERA_DISTANCE * PASCAL_WATER_MAP_CAMERA_ZOOM) /
  PASCAL_WATER_MAP_CAMERA_MAX_ZOOM
const PASCAL_WATER_MAP_CAMERA_MAX_DISTANCE =
  (PASCAL_WATER_MAP_CAMERA_DISTANCE * PASCAL_WATER_MAP_CAMERA_ZOOM) /
  PASCAL_WATER_MAP_CAMERA_MIN_ZOOM
const PASCAL_WATER_MOBILE_CONTROLS_QUERY = '(max-width: 767px)'
const PASCAL_WATER_REMOTE_POSITION_RESPONSE = 12
const PASCAL_WATER_REMOTE_HEADING_RESPONSE = 14
const PASCAL_WATER_REMOTE_ROBOT_FRAME_PRIORITY = 1
const PASCAL_WATER_REMOTE_BEACON_FRAME_PRIORITY = 2
const PASCAL_WATER_LOCAL_ROBOT_FRAME_PRIORITY = 2
const PASCAL_WATER_LOCAL_BEACON_FRAME_PRIORITY = 3
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
type PascalWaterModeTransitionFadeState = {
  from: PascalWaterViewMode
  id: number
  to: PascalWaterViewMode
}
type PascalWaterProfileMeasure = <T>(id: string, callback: () => T) => T
type PascalWaterCameraPose = {
  distance: number
  pitch: number
  position: Vector3
  quaternion: Quaternion
  target: Vector3
  yaw: number
  zoom?: number | null
}
type PascalWaterOrthographicCamera = Camera & {
  isOrthographicCamera: true
  updateProjectionMatrix: () => void
  zoom: number
}
type PascalWaterCameraPoseTransition = {
  elapsed: number
  startPosition: Vector3
  startQuaternion: Quaternion
  startTarget: Vector3
  targetPose: PascalWaterCameraPose
  targetQuaternion: Quaternion
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
type PascalWaterRuntimeReactCommitTotal = {
  count: number
  id: string
  maxMs: number
  phase: string
  totalMs: number
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
type PascalWaterInteractiveDoorAnimationRecord = Record<AnyNodeId, DoorAnimationState>
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
  runRequested: boolean
  speed: number
  velocity: Vector3
}
type RobotMovementInput = {
  doorId?: AnyNodeId
  heading: number
  intensity: number
  navigationKind?: PascalWaterNavigationSteeringKind
  runAmount: number
  steeringDistance?: number
  steeringPoint?: LandrushPoint2
  x: number
  z: number
}
type PascalWaterMoveTarget = {
  point: LandrushPoint2
  route?: PascalWaterMoveRouteState
}
type PascalWaterMoveRouteState = {
  bestDistance: number
  doorCrossing: PascalWaterDoorCrossingState | null
  lastProgressAt: number
  lastRobotPoint: LandrushPoint2
  lastSteeringPoint: LandrushPoint2 | null
  nextRetryAt: number
  recoveryCount: number
}
type PascalWaterNavigationDebugRobotPoint = LandrushPoint2 & { y: number }
type PascalWaterNavigationDebugSnapshot = {
  crossing: PascalWaterDoorCrossingState | null
  doorPortals: readonly PascalWaterDoorPortal[]
  kind: PascalWaterNavigationSteeringKind | 'manual' | null
  obstacles: readonly PascalWaterNavigationObstacle[]
  robot: PascalWaterNavigationDebugRobotPoint
  stairPortals: readonly PascalWaterStairPortal[]
  steeringPoint: LandrushPoint2 | null
  target: LandrushPoint2 | null
  trace: readonly LandrushPoint2[]
}
type PascalWaterNavigationLiveCapture = {
  captures: Array<{ elapsedMs: number; snapshot: PascalWaterNavigationDebugSnapshot }>
  scenario: PascalWaterNavigationLiveScenarioKind
  startedAt: number
}
type PascalWaterNavigationTestBridge = {
  getState: () => {
    doorPortals: readonly PascalWaterDoorPortal[]
    robot: PascalWaterNavigationDebugRobotPoint
    stairPortals: readonly PascalWaterStairPortal[]
  }
  projectPoint: (
    point: LandrushPoint2 & { y?: number },
  ) => { clientX: number; clientY: number; visible: boolean } | null
  setupStart: (request: { label?: string; start: LandrushPoint2 & { y?: number } }) => boolean
  startMove: (request: {
    label?: string
    mode?: 'direct' | 'stair-resolved'
    start: LandrushPoint2 & { y?: number }
    target: LandrushPoint2
  }) => boolean
}
type PascalWaterDoorCrossingPhase = 'center' | 'entry' | 'exit'
type PascalWaterConstrainedCrossingKind = 'door' | 'stair'
type PascalWaterDoorCrossingState = {
  center: LandrushPoint2
  doorId?: AnyNodeId
  entry: LandrushPoint2
  exit: LandrushPoint2
  kind: PascalWaterConstrainedCrossingKind
  nodeId: AnyNodeId
  phase: PascalWaterDoorCrossingPhase
}
type PascalWaterRightHoldMove = {
  id: number
  startX: number
  startY: number
  x: number
  y: number
}
type PascalWaterRuntimeCameraSample = {
  dtMs: number | null
  mode: PascalWaterViewMode | 'unknown'
  position: [number, number, number]
  progress: number | null
  quaternion: [number, number, number, number]
  rotation: [number, number, number]
  source: string
  target: [number, number, number]
  timeMs: number
  zoom: number | null
}
type PascalWaterRuntimeCameraJump = PascalWaterRuntimeCameraSample & {
  distanceMeters: number
  targetDistanceMeters: number
}
type PascalWaterRuntimeFrameSample = {
  dtMs: number | null
  mode: PascalWaterViewMode | 'unknown'
  source: 'raf' | 'r3f'
  timeMs: number
}
type PascalWaterRuntimeFrameGap = PascalWaterRuntimeFrameSample & {
  thresholdMs: number
}
type PascalWaterRuntimeLongTaskSample = {
  durationMs: number
  name: string
  startMs: number
}
type PascalWaterRuntimePhaseEvent = {
  detail?: Record<string, unknown>
  name: string
  timeMs: number
}
type PascalWaterRuntimeReactCommit = PascalWaterStartupReactCommit
type PascalWaterRuntimeGrassSample = {
  centerLagMeters: number
  moving: boolean
  physicsLagMeters: number
  position: [number, number]
  radius: number
  source: string
  speed: number
  strength: number
  timeMs: number
}
type PascalWaterRuntimeProbe = {
  cameraJumps: PascalWaterRuntimeCameraJump[]
  cameraSamples: PascalWaterRuntimeCameraSample[]
  claimFirstFreeParcel?: () => boolean
  enterFirstBuildParcel?: () => boolean
  parcelDiagnostics?: {
    freeParcelCount: number
    firstParcelIds: string[]
    localOwnershipParcelId: string | null
    ownershipCount: number
    parcelCount: number
    parcelWorldId: string
  }
  frameGaps: PascalWaterRuntimeFrameGap[]
  frameSamples: PascalWaterRuntimeFrameSample[]
  gridSamples: Record<string, unknown>[]
  grassEvents: Record<string, unknown>[]
  grassSamples: PascalWaterRuntimeGrassSample[]
  inputEvents: Record<string, unknown>[]
  lastCameraSamplesBySource: Record<string, PascalWaterRuntimeCameraSample>
  longTasks: PascalWaterRuntimeLongTaskSample[]
  navigationEvents: Record<string, unknown>[]
  navigationSelfTest?: Record<string, unknown>
  phaseEvents: PascalWaterRuntimePhaseEvent[]
  reactCommits: PascalWaterRuntimeReactCommit[]
  reactCommitTotals: Record<string, PascalWaterRuntimeReactCommitTotal>
  revealSamples: Record<string, unknown>[]
  lastRobotAnimationState?: LandrushRobotAnimationState
  robotAnimationSamples: Record<string, unknown>[]
  robotHoverSamples: Record<string, unknown>[]
  startedAt: number
}
type PascalWaterNavigationObstacle = {
  kind?: PascalWaterNavigationSteeringKind | 'asset'
  nodeId?: AnyNodeId
  points: readonly LandrushPoint2[]
}
type PascalWaterDoorPortal = {
  center: LandrushPoint2
  doorId: AnyNodeId
  halfWidth: number
  normal: LandrushPoint2
  sideA: LandrushPoint2
  sideB: LandrushPoint2
  tangent: LandrushPoint2
}
type PascalWaterParcelMapShape = {
  centroid: LandrushPoint2
  points: readonly LandrushPoint2[]
}
type PascalWaterStairPortal = {
  center: LandrushPoint2
  halfRun: number
  halfWidth: number
  nodeId: AnyNodeId
  normal: LandrushPoint2
  sideA: LandrushPoint2
  sideB: LandrushPoint2
  tangent: LandrushPoint2
}
type PascalWaterStairNode = Extract<AnyNode, { type: 'stair' }>
type PascalWaterStairSegmentNode = Extract<AnyNode, { type: 'stair-segment' }>
type PascalWaterRoofNode = Extract<AnyNode, { type: 'roof' }>
type PascalWaterRoofSegmentNode = Extract<AnyNode, { type: 'roof-segment' }>
type PascalWaterStairSegmentLayout = {
  center: LandrushPoint2
  length: number
  normal: LandrushPoint2
  nodeId: AnyNodeId
  tangent: LandrushPoint2
  width: number
}
type PascalWaterStairNavigationFootprint = {
  nodeId: AnyNodeId
  points: readonly LandrushPoint2[]
}
type PascalWaterNavigationSteeringKind = 'direct' | 'door' | 'graph' | 'recovery' | 'stair'
type PascalWaterNavigationLiveScenarioKind = 'door' | 'room' | 'stair'
type PascalWaterNavigationSteeringResult = {
  doorCrossing?: PascalWaterDoorCrossingState
  doorId?: AnyNodeId
  kind: PascalWaterNavigationSteeringKind
  point: LandrushPoint2
}
type PascalWaterRevealMaterialState = {
  clipIntersection: boolean
  clippingPlanes: Material['clippingPlanes']
}
type PascalWaterRobotScreenBounds = {
  centerX: number
  centerY: number
  height: number
  maxX: number
  maxY: number
  minX: number
  minY: number
  width: number
}
type PascalWaterRevealObjectState = {
  clipIntersection: unknown
  clippingPlanes: unknown
  clipShadows: unknown
  enabled: unknown
  isClippingGroup: unknown
}
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

declare global {
  interface Window {
    __PASCAL_CAMERA_DRAGGING__?: boolean
    __PASCAL_WATER_FLUSH_RUNTIME_PROBE__?: () => string | null
    __PASCAL_WATER_NAV_DEBUG__?: PascalWaterNavigationDebugSnapshot
    __PASCAL_WATER_NAV_LIVE_CAPTURE__?: PascalWaterNavigationLiveCapture
    __PASCAL_WATER_NAV_TEST__?: PascalWaterNavigationTestBridge
    __PASCAL_WATER_RUNTIME_PROBE__?: PascalWaterRuntimeProbe
  }
}

function setPascalWaterCameraDragging(dragging: boolean) {
  if (typeof window !== 'undefined') {
    window.__PASCAL_CAMERA_DRAGGING__ = dragging
  }
  useViewer.getState().setCameraDragging(dragging)
}

function getPascalWaterRuntimeProbe() {
  if (typeof window === 'undefined') return null
  if (!new URLSearchParams(window.location.search).has('landrushProbe')) return null

  window.__PASCAL_WATER_RUNTIME_PROBE__ ??= {
    cameraJumps: [],
    cameraSamples: [],
    frameGaps: [],
    frameSamples: [],
    gridSamples: [],
    grassEvents: [],
    grassSamples: [],
    inputEvents: [],
    lastCameraSamplesBySource: {},
    longTasks: [],
    navigationEvents: [],
    navigationSelfTest: runPascalWaterNavigationSelfTest(),
    phaseEvents: [],
    reactCommits: [],
    reactCommitTotals: {},
    revealSamples: [],
    robotAnimationSamples: [],
    robotHoverSamples: [],
    startedAt: performance.now(),
  }
  return window.__PASCAL_WATER_RUNTIME_PROBE__
}

function pushPascalWaterProbeSample<T>(samples: T[], sample: T, maxSamples = 800) {
  samples.push(sample)
  if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples)
}

function recordPascalWaterInputProbe(event: Record<string, unknown>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return
  pushPascalWaterProbeSample(probe.inputEvents, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterNavigationProbe(event: Record<string, unknown>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return
  pushPascalWaterProbeSample(probe.navigationEvents, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterGrassEventProbe(event: Record<string, unknown>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return
  pushPascalWaterProbeSample(probe.grassEvents, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterGridProbe(event: Record<string, unknown>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return
  pushPascalWaterProbeSample(probe.gridSamples, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterFrameProbe(sample: Omit<PascalWaterRuntimeFrameSample, 'timeMs'>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  const framedSample: PascalWaterRuntimeFrameSample = {
    ...sample,
    dtMs: sample.dtMs === null ? null : roundPerf(sample.dtMs),
    timeMs: roundPerf(performance.now() - probe.startedAt),
  }
  pushPascalWaterProbeSample(probe.frameSamples, framedSample, 20_000)
  if (framedSample.dtMs !== null && framedSample.dtMs >= PASCAL_WATER_RUNTIME_FRAME_GAP_MS) {
    pushPascalWaterProbeSample(probe.frameGaps, {
      ...framedSample,
      thresholdMs: PASCAL_WATER_RUNTIME_FRAME_GAP_MS,
    })
  }
}

function recordPascalWaterLongTaskProbe(entry: PerformanceEntry) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  pushPascalWaterProbeSample(probe.longTasks, {
    durationMs: roundPerf(entry.duration),
    name: entry.name,
    startMs: roundPerf(entry.startTime - probe.startedAt),
  })
}

function recordPascalWaterPhaseProbe(name: string, detail?: Record<string, unknown>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  pushPascalWaterProbeSample(probe.phaseEvents, {
    detail,
    name,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterReactCommitProbe(commit: PascalWaterRuntimeReactCommit) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  const key = `${commit.id}|${commit.phase}`
  let total = probe.reactCommitTotals[key]
  if (!total) {
    total = {
      count: 0,
      id: commit.id,
      maxMs: 0,
      phase: commit.phase,
      totalMs: 0,
    }
    probe.reactCommitTotals[key] = total
  }
  total.count += 1
  total.totalMs = roundPerf(total.totalMs + commit.actualDurationMs)
  total.maxMs = Math.max(total.maxMs, commit.actualDurationMs)

  if (commit.actualDurationMs > 5) {
    pushPascalWaterProbeSample(probe.reactCommits, commit, 1200)
  }
}

function recordPascalWaterRevealProbe(event: Record<string, unknown>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return
  pushPascalWaterProbeSample(probe.revealSamples, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterGrassProbe(sample: Omit<PascalWaterRuntimeGrassSample, 'timeMs'>) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return
  pushPascalWaterProbeSample(probe.grassSamples, {
    ...sample,
    centerLagMeters: roundPerf(sample.centerLagMeters),
    physicsLagMeters: roundPerf(sample.physicsLagMeters),
    radius: roundPerf(sample.radius),
    speed: roundPerf(sample.speed),
    strength: roundPerf(sample.strength),
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordPascalWaterRobotAnimationProbe(state: LandrushRobotAnimationState) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  const previous = probe.lastRobotAnimationState
  const walkStep = resolveRobotAnimationProbeStep(
    previous?.walkClip === state.walkClip ? previous.walkClipTime : null,
    state.walkClipTime,
    state.walkClipDuration,
  )
  const runStep = resolveRobotAnimationProbeStep(
    previous?.runClip === state.runClip ? previous.runClipTime : null,
    state.runClipTime,
    state.runClipDuration,
  )
  const discontinuity = walkStep.unexpectedReset || runStep.unexpectedReset
  probe.lastRobotAnimationState = state
  pushPascalWaterProbeSample(probe.robotAnimationSamples, {
    discontinuity,
    runClip: state.runClip,
    runDuration: state.runClipDuration,
    runPhaseDelta: runStep.phaseDelta,
    runTime: state.runClipTime,
    runTimeDelta: runStep.rawDelta,
    runWeight: state.runWeight,
    runWrapped: runStep.wrapped,
    timeMs: roundPerf(performance.now() - probe.startedAt),
    walkClip: state.walkClip,
    walkDuration: state.walkClipDuration,
    walkPhaseDelta: walkStep.phaseDelta,
    walkTime: state.walkClipTime,
    walkTimeDelta: walkStep.rawDelta,
    walkWeight: state.walkWeight,
    walkWrapped: walkStep.wrapped,
  })
}

function recordPascalWaterRobotHoverPoseProbe(sample: LandrushRobotHoverPoseSample) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  pushPascalWaterProbeSample(probe.robotHoverSamples, {
    ...sample,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function resolveRobotAnimationProbeStep(
  previousTime: number | null | undefined,
  currentTime: number,
  duration: number,
) {
  if (previousTime == null) {
    return { phaseDelta: 0, rawDelta: 0, unexpectedReset: false, wrapped: false }
  }

  const rawDelta = currentTime - previousTime
  const wrapped = duration > 0 && rawDelta < -duration * 0.4 && previousTime > duration * 0.35
  const phaseDelta = wrapped ? rawDelta + duration : rawDelta
  return {
    phaseDelta: roundPerf(phaseDelta),
    rawDelta: roundPerf(rawDelta),
    unexpectedReset: rawDelta < -0.05 && !wrapped,
    wrapped,
  }
}

function recordPascalWaterCameraProbe({
  camera,
  mode,
  progress = null,
  source,
  target,
}: {
  camera: Camera
  mode: PascalWaterRuntimeCameraSample['mode']
  progress?: number | null
  source: string
  target: Vector3
}) {
  const probe = getPascalWaterRuntimeProbe()
  if (!probe) return

  const now = performance.now()
  const previous = probe.lastCameraSamplesBySource[source]
  const sample: PascalWaterRuntimeCameraSample = {
    dtMs: previous ? roundPerf(now - probe.startedAt - previous.timeMs) : null,
    mode,
    position: [
      roundPerf(camera.position.x),
      roundPerf(camera.position.y),
      roundPerf(camera.position.z),
    ],
    progress: progress === null ? null : roundPerf(progress),
    quaternion: [
      roundPerf(camera.quaternion.x),
      roundPerf(camera.quaternion.y),
      roundPerf(camera.quaternion.z),
      roundPerf(camera.quaternion.w),
    ],
    rotation: [
      roundPerf(camera.rotation.x),
      roundPerf(camera.rotation.y),
      roundPerf(camera.rotation.z),
    ],
    source,
    target: [roundPerf(target.x), roundPerf(target.y), roundPerf(target.z)],
    timeMs: roundPerf(now - probe.startedAt),
    zoom: isPascalWaterOrthographicCamera(camera) ? roundPerf(camera.zoom) : null,
  }
  pushPascalWaterProbeSample(probe.cameraSamples, sample, 6000)

  if (
    previous &&
    previous.progress === null &&
    sample.progress === null &&
    sample.dtMs !== null &&
    sample.dtMs <= 120
  ) {
    const distanceMeters = distance3(sample.position, previous.position)
    const targetDistanceMeters = distance3(sample.target, previous.target)
    if (distanceMeters > 3 || targetDistanceMeters > 2) {
      pushPascalWaterProbeSample(probe.cameraJumps, {
        ...sample,
        distanceMeters: roundPerf(distanceMeters),
        targetDistanceMeters: roundPerf(targetDistanceMeters),
      })
    }
  }
  probe.lastCameraSamplesBySource[source] = sample
}

function distance3(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function createPascalWaterParcelMapShapes(
  parcels: readonly ParcelAllocationParcel[],
  roads: readonly LandrushRoadSegment[],
) {
  return new Map(
    parcels.map((parcel) => [parcel.id, createPascalWaterParcelMapShape(parcel, roads)]),
  )
}

function createPascalWaterParcelMapShape(
  parcel: ParcelAllocationParcel,
  roads: readonly LandrushRoadSegment[],
): PascalWaterParcelMapShape {
  const connectedRoads = roads.filter((road) => road.connectsParcelIds.includes(parcel.id))
  if (connectedRoads.length === 0) {
    return { centroid: parcel.centroid, points: parcel.points }
  }

  const trimMeters = Math.max(
    PASCAL_WATER_PARCEL_MAP_ROAD_TRIM_METERS,
    ...connectedRoads.map((road) => road.width * 0.52),
  )
  const points = parcel.points.map((point) => {
    const dx = parcel.centroid.x - point.x
    const dz = parcel.centroid.z - point.z
    const distance = Math.hypot(dx, dz)
    if (distance <= 0.000001) return point

    const amount = Math.min(trimMeters, distance * 0.36)
    return {
      x: point.x + (dx / distance) * amount,
      z: point.z + (dz / distance) * amount,
    }
  })

  return points.length >= 3
    ? { centroid: polygonCentroid(points), points }
    : { centroid: parcel.centroid, points: parcel.points }
}

function runPascalWaterNavigationSelfTest() {
  const surface = [
    { x: -6, z: -6 },
    { x: 6, z: -6 },
    { x: 6, z: 6 },
    { x: -6, z: 6 },
  ]
  const doorPortal: PascalWaterDoorPortal = {
    center: { x: 0, z: 0 },
    doorId: 'door_navigation_self_test' as AnyNodeId,
    halfWidth: 0.5,
    normal: { x: 1, z: 0 },
    sideA: { x: PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS, z: 0 },
    sideB: { x: -PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS, z: 0 },
    tangent: { x: 0, z: 1 },
  }
  const stairId = 'stair_navigation_self_test' as AnyNodeId
  const stairPortal: PascalWaterStairPortal = {
    center: { x: 0, z: 0 },
    halfRun: 1.5,
    halfWidth: 0.5,
    nodeId: stairId,
    normal: { x: 0, z: 1 },
    sideA: { x: 0, z: 1.5 + PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS },
    sideB: { x: 0, z: -1.5 - PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS },
    tangent: { x: 1, z: 0 },
  }
  const stairObstacle: PascalWaterNavigationObstacle = {
    kind: 'stair',
    nodeId: stairId,
    points: rectFootprintFromAxes({
      center: stairPortal.center,
      depth: stairPortal.halfRun * 2 + PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS * 2,
      normal: stairPortal.normal,
      tangent: stairPortal.tangent,
      width: stairPortal.halfWidth * 2 + PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS * 2,
    }),
  }
  const doorRoute = resolvePascalWaterNavigationSteeringPoint(
    { x: -4, z: 0 },
    { x: 4, z: 0 },
    [],
    [doorPortal],
    surface,
  )
  const doorCenterRoute = resolvePascalWaterNavigationSteeringPoint(
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    [],
    [doorPortal],
    surface,
  )
  const doorNearCenterRoute = resolvePascalWaterNavigationSteeringPoint(
    { x: -PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS * 0.7, z: 0 },
    { x: 4, z: 0 },
    [],
    [doorPortal],
    surface,
  )
  const stairCrossRoute = resolvePascalWaterNavigationSteeringPoint(
    { x: 0, z: -4 },
    { x: 0, z: 4 },
    [stairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const stairClickTarget = resolvePascalWaterStairConnectorTarget(
    { x: 0, z: -4 },
    { x: 0, z: 0.45 },
    [stairPortal],
  )
  const stairClickRoute = resolvePascalWaterNavigationSteeringPoint(
    { x: 0, z: -4 },
    stairClickTarget,
    [stairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const stairExitRoute = resolvePascalWaterNavigationSteeringPoint(
    { x: 0, z: 0 },
    { x: 0, z: 4 },
    [stairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const recovery = resolvePascalWaterNavigationRecoverySteeringPoint(
    { x: 0, z: 0 },
    { x: 3, z: 0 },
    { x: 1, z: 0 },
    [
      {
        points: rectFootprint({
          center: { x: 1, z: 0 },
          depth: 1,
          rotation: 0,
          width: 1,
        }),
      },
    ],
    [],
    surface,
  )
  const projectedArrival = segmentReachedPascalWaterNavigationPoint(
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0.72, z: 0.08 },
    0.12,
  )
  return {
    doorEntryMetersFromCenter:
      doorRoute?.kind === 'door' ? roundPerf(Math.abs(doorRoute.point.x)) : null,
    doorCenterAdvancesToExit:
      doorCenterRoute?.kind === 'door' &&
      doorCenterRoute.point.x >= PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    doorNearCenterAdvancesToExit:
      doorNearCenterRoute?.kind === 'door' &&
      doorNearCenterRoute.point.x >= PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    doorOpensBeforeCenter:
      doorRoute?.kind === 'door' &&
      doorRoute.doorId === doorPortal.doorId &&
      doorRoute.point.x <= -PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS + 0.001,
    projectedArrival,
    recoveryAvailable: recovery?.kind === 'recovery',
    recoveryPoint: recovery ? [roundPerf(recovery.point.x), roundPerf(recovery.point.z)] : null,
    stairClickOnRun:
      stairClickRoute?.kind === 'stair' &&
      stairClickRoute.point.z <= -1.5 - PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS + 0.001 &&
      stairClickTarget.z >= 1.5 + PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    stairCrossUsesEntry:
      stairCrossRoute?.kind === 'stair' &&
      stairCrossRoute.point.z <= -1.5 - PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS + 0.001,
    stairExitFollowsRun:
      stairExitRoute?.kind === 'stair' &&
      stairExitRoute.point.z >= 1.5 + PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
  }
}

function resolvePascalWaterNavigationLiveScenario(
  value: string | null,
): PascalWaterNavigationLiveScenarioKind | null {
  if (value === '1' || value === 'door') return 'door'
  if (value === 'room') return 'room'
  if (value === 'stair') return 'stair'
  return null
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

function syncPascalWaterBuildEditorMode(buildMode: boolean) {
  return measureLandrushFrameSlice(
    buildMode
      ? 'pascal-water.editor-store.sync-build-mode'
      : 'pascal-water.editor-store.sync-select-mode',
    () => {
      const editor = useEditor.getState()
      if (buildMode) {
        if (
          editor.phase === 'structure' &&
          editor.mode === 'build' &&
          editor.structureLayer === 'elements' &&
          editor.tool === 'wall' &&
          editor.catalogCategory === null
        ) {
          return
        }

        useEditor.setState({
          catalogCategory: null,
          mode: 'build',
          phase: 'structure',
          structureLayer: 'elements',
          tool: 'wall',
        })
        return
      }

      if (editor.mode === 'select' && editor.tool === null && editor.catalogCategory === null)
        return
      useEditor.setState({
        catalogCategory: null,
        mode: 'select',
        tool: null,
      })
    },
  )
}

export function PascalWaterClient({
  experience = 'pascal-water',
  waterFieldDebugMode,
}: {
  experience?: PascalWaterClientExperience
  waterFieldDebugMode?: PascalWaterFieldDebugMode
} = {}) {
  const experienceConfig = PASCAL_WATER_EXPERIENCE_CONFIGS[experience]
  const searchParams = useSearchParams()
  const runtimeProbeEnabled = searchParams.has('landrushProbe')
  const navigationDebugEnabled =
    searchParams.get('navDebug') === '1' || searchParams.get('landrushNavDebug') === '1'
  const navigationLiveScenario = resolvePascalWaterNavigationLiveScenario(
    searchParams.get('navDebugLiveScenario') ?? searchParams.get('landrushNavLiveScenario'),
  )
  const navigationLiveScenarioImmediate =
    searchParams.get('navDebugLiveScenarioImmediate') === '1' ||
    searchParams.get('landrushNavLiveScenarioImmediate') === '1'
  const navigationLiveScenarioAutoRun =
    searchParams.get('navDebugLiveScenarioAuto') !== '0' &&
    searchParams.get('landrushNavLiveScenarioAuto') !== '0'
  const runtimeProbeDomOutput =
    runtimeProbeEnabled &&
    (searchParams.get('landrushProbeDom') === '1' ||
      searchParams.get('landrushProbeOutput') === '1' ||
      searchParams.get('landrushProbeOutput') === 'dom' ||
      searchParams.get('landrushProbeOutput') === 'interval')
  const startupProfileEnabled =
    searchParams.get('startupProfile') === '1' || searchParams.get('profileStartup') === '1'
  const startupProfileNoLandLayers = searchParams.get('profileNoLandLayers') === '1'
  const startupProfileNoStylizedBlades = searchParams.get('profileNoStylizedBlades') === '1'
  const startupProfileNoStylizedGround = searchParams.get('profileNoStylizedGround') === '1'
  const startupProfileNoStylizedTrees = searchParams.get('profileNoStylizedTrees') === '1'
  const startupProfileNoWaterNode = searchParams.get('profileNoWaterNode') === '1'
  const profilePlainWaterMaterial = searchParams.get('profilePlainWaterMaterial') === '1'
  const revealProofMode = searchParams.get('revealProof')
  const revealProof =
    revealProofMode === '1' || revealProofMode === 'enabled' || revealProofMode === 'disabled'
  const robotScreenRevealEnabled =
    revealProofMode !== 'disabled' &&
    searchParams.get('passthrough') !== '0' &&
    searchParams.get('reveal') !== '0'
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
  const mapReturnCameraPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const playerReturnCameraPoseRef = useRef<PascalWaterCameraPose | null>(null)
  const modeTransitionFadeIdRef = useRef(0)
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
  const handleRuntimeReactRender = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      const probe = getPascalWaterRuntimeProbe()
      if (!probe) return

      recordPascalWaterReactCommitProbe({
        actualDurationMs: roundPerf(actualDuration),
        baseDurationMs: roundPerf(baseDuration),
        commitMs: roundPerf(commitTime - probe.startedAt),
        id,
        phase,
        startMs: roundPerf(startTime - probe.startedAt),
      })
    },
    [],
  )
  const editorRuntimeReactProfileEnabled =
    runtimeProbeEnabled &&
    (searchParams.get('landrushEditorReactProfile') === '1' ||
      searchParams.get('editorReactProfile') === '1')
  const editorRuntimeReactProfiler = useMemo(
    () =>
      editorRuntimeReactProfileEnabled
        ? {
            enabled: true,
            idPrefix: 'runtime.pascal-water.editor',
            onRender: handleRuntimeReactRender,
          }
        : undefined,
    [editorRuntimeReactProfileEnabled, handleRuntimeReactRender],
  )
  const [loadingActive, setLoadingActive] = useState(true)
  const stylizedGroundTextureRequired =
    !startupProfileNoLandLayers && !startupProfileNoStylizedGround
  const [stylizedGroundTextureReady, setStylizedGroundTextureReady] = useState(
    !stylizedGroundTextureRequired,
  )
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
  const [modeTransitionFade, setModeTransitionFade] =
    useState<PascalWaterModeTransitionFadeState | null>(null)
  const [showTunePanel, setShowTunePanel] = useState(false)
  const [localProfile, setLocalProfile] = useState<LocalPlayerProfile | null>(null)
  const [incomingVoiceSignals, setIncomingVoiceSignals] = useState<SpatialVoiceSignalMessage[]>([])
  const handleVoiceSignal = useCallback((message: SpatialVoiceSignalMessage) => {
    setIncomingVoiceSignals((current) => [...current.slice(-63), message])
  }, [])
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
    onVoiceSignal: handleVoiceSignal,
    roomId,
    spectator: false,
  })
  const resolvedLocalProfile = localProfile ?? PASCAL_WATER_FALLBACK_PROFILE
  const multiplayerStatus: ConnectionStatus = offline ? 'offline' : multiplayer.status
  const spatialVoice = useLandrushSpatialVoice({
    available: !offline && Boolean(localProfile) && multiplayer.status === 'connected',
    incomingSignals: incomingVoiceSignals,
    localMotionRef,
    localProfile: resolvedLocalProfile,
    remotePlayers: multiplayer.remotePlayers,
    roomId,
    sendSignal: multiplayer.sendVoiceSignal,
  })
  const viewMode: PascalWaterViewMode = buildMode ? 'build' : mapView ? 'map' : 'player'
  const mapPresentationProgressRef = useRef(viewMode === 'map' ? 1 : 0)
  const loadingAssetsReady = !stylizedGroundTextureRequired || stylizedGroundTextureReady

  useEffect(() => {
    setStylizedGroundTextureReady(!stylizedGroundTextureRequired)
  }, [stylizedGroundTextureRequired])

  usePascalWaterPerfRunProbe(activePerfRun)
  useEffect(() => {
    const probe = getPascalWaterRuntimeProbe()
    if (!probe) return

    const probeOutput = document.createElement('pre')
    probeOutput.hidden = true
    probeOutput.dataset.pascalWaterRuntimeProbe = '1'
    document.body.appendChild(probeOutput)
    const flushProbeOutput = () => {
      const latestProbe = window.__PASCAL_WATER_RUNTIME_PROBE__ ?? probe
      const serialized = JSON.stringify(latestProbe)
      probeOutput.textContent = serialized
      probeOutput.dataset.pascalWaterRuntimeProbeFlushedAt = String(performance.now())
      return serialized
    }
    window.__PASCAL_WATER_FLUSH_RUNTIME_PROBE__ = flushProbeOutput
    const handleFlushProbeOutput = () => {
      flushProbeOutput()
    }
    window.addEventListener('pascal-water-runtime-probe:flush', handleFlushProbeOutput)
    const intervalId = runtimeProbeDomOutput ? window.setInterval(flushProbeOutput, 250) : null
    if (runtimeProbeDomOutput) flushProbeOutput()
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId)
      window.removeEventListener('pascal-water-runtime-probe:flush', handleFlushProbeOutput)
      if (window.__PASCAL_WATER_FLUSH_RUNTIME_PROBE__ === flushProbeOutput) {
        delete window.__PASCAL_WATER_FLUSH_RUNTIME_PROBE__
      }
      probeOutput.remove()
    }
  }, [runtimeProbeDomOutput])

  const prepareCameraHandoff = useCallback(
    (nextViewMode: PascalWaterViewMode) => {
      recordPascalWaterPhaseProbe('camera-handoff:start', {
        from: viewMode,
        to: nextViewMode,
      })
      if (nextViewMode !== viewMode) {
        modeTransitionFadeIdRef.current += 1
        recordPascalWaterPhaseProbe('camera-handoff:fade', {
          from: viewMode,
          id: modeTransitionFadeIdRef.current,
          to: nextViewMode,
        })
        setModeTransitionFade({
          from: viewMode,
          id: modeTransitionFadeIdRef.current,
          to: nextViewMode,
        })
        if (nextViewMode === 'map' || viewMode === 'map') {
          setPascalWaterCameraDragging(true)
        }
      }

      if (nextViewMode === 'player') {
        mapReturnCameraPoseRef.current = null
        if (viewMode !== 'player') {
          const currentNonPlayerPose =
            viewMode === 'map' ? mapCameraPoseRef.current : buildCameraPoseRef.current
          if (currentNonPlayerPose && viewMode === 'build') {
            buildCameraPoseRef.current = clonePascalWaterCameraPose(currentNonPlayerPose)
          }
          if (viewMode === 'map') {
            mapReturnCameraPoseRef.current = clonePascalWaterCameraPose(currentNonPlayerPose)
          }
          playerReturnCameraPoseRef.current = clonePascalWaterCameraPose(
            playerCameraPoseRef.current,
          )
        }
        mapTransitionStartPoseRef.current = null
        recordPascalWaterPhaseProbe('camera-handoff:player-ready', { from: viewMode })
        return
      }

      playerReturnCameraPoseRef.current = null
      mapReturnCameraPoseRef.current = null
      if (nextViewMode === 'map') {
        mapTransitionStartPoseRef.current = clonePascalWaterCameraPose(
          viewMode === 'build' ? buildCameraPoseRef.current : playerCameraPoseRef.current,
        )
        recordPascalWaterPhaseProbe('camera-handoff:map-ready', { from: viewMode })
        return
      }

      mapTransitionStartPoseRef.current = null
      if (viewMode === 'player') buildCameraPoseRef.current = null
      if (viewMode === 'map') {
        buildCameraPoseRef.current = clonePascalWaterCameraPose(mapCameraPoseRef.current)
      }
      recordPascalWaterPhaseProbe('camera-handoff:build-ready', { from: viewMode })
    },
    [viewMode],
  )
  const handleModeTransitionFadeDone = useCallback((transitionId: number) => {
    setModeTransitionFade((current) => (current?.id === transitionId ? null : current))
  }, [])

  useEffect(() => {
    if (!modeTransitionFade) {
      mapPresentationProgressRef.current = viewMode === 'map' ? 1 : 0
      return
    }

    const startedAt = performance.now()
    let intervalId = 0
    const tick = () => {
      const now = performance.now()
      const elapsed = Math.max(0, (now - startedAt) / 1000)
      const nextProgress = clamp01(elapsed / PASCAL_WATER_CAMERA_TRANSITION_SECONDS)
      mapPresentationProgressRef.current = resolvePascalWaterMapPresentationProgress(
        viewMode,
        modeTransitionFade,
        nextProgress,
      )
      renderScheduler.requestFrame('camera:move')
      if (nextProgress >= 1) {
        window.clearInterval(intervalId)
        handleModeTransitionFadeDone(modeTransitionFade.id)
      }
    }

    mapPresentationProgressRef.current = resolvePascalWaterMapPresentationProgress(
      viewMode,
      modeTransitionFade,
      0,
    )
    intervalId = window.setInterval(tick, PASCAL_WATER_CAMERA_TRANSITION_TICK_MS)
    tick()
    return () => window.clearInterval(intervalId)
  }, [handleModeTransitionFadeDone, modeTransitionFade, viewMode])

  useEffect(() => {
    const mapTransitionActive =
      modeTransitionFade?.from === 'map' || modeTransitionFade?.to === 'map'
    if (!mapTransitionActive) return

    setPascalWaterCameraDragging(true)
    return () => setPascalWaterCameraDragging(false)
  }, [modeTransitionFade])

  const mapPresentationVisible =
    viewMode === 'map' || modeTransitionFade?.from === 'map' || modeTransitionFade?.to === 'map'

  const enterPlayerView = useCallback(() => {
    measureLandrushFrameSlice('pascal-water.view.enter-player', () => {
      recordPascalWaterPhaseProbe('view:enter-player:start', { from: viewMode })
      measureLandrushFrameSlice('pascal-water.view.enter-player.prepare-camera-handoff', () =>
        prepareCameraHandoff('player'),
      )
      measureLandrushFrameSlice('pascal-water.view.enter-player.set-build-mode', () =>
        setBuildMode(false),
      )
      measureLandrushFrameSlice('pascal-water.view.enter-player.set-build-parcel', () =>
        setBuildParcelId(null),
      )
      measureLandrushFrameSlice('pascal-water.view.enter-player.set-map-view', () =>
        setMapView(false),
      )
      recordPascalWaterPhaseProbe('view:enter-player:state-dispatched', { from: viewMode })
    })
  }, [prepareCameraHandoff, viewMode])

  const enterMapView = useCallback(() => {
    measureLandrushFrameSlice('pascal-water.view.enter-map', () => {
      recordPascalWaterPhaseProbe('view:enter-map:start', { from: viewMode })
      measureLandrushFrameSlice('pascal-water.view.enter-map.prepare-camera-handoff', () =>
        prepareCameraHandoff('map'),
      )
      measureLandrushFrameSlice('pascal-water.view.enter-map.set-build-mode', () =>
        setBuildMode(false),
      )
      measureLandrushFrameSlice('pascal-water.view.enter-map.set-build-parcel', () =>
        setBuildParcelId(null),
      )
      measureLandrushFrameSlice('pascal-water.view.enter-map.set-map-view', () => setMapView(true))
      measureLandrushFrameSlice('pascal-water.view.enter-map.release-pointer-lock', () =>
        releasePascalWaterPointerLock(),
      )
      recordPascalWaterPhaseProbe('view:enter-map:state-dispatched', { from: viewMode })
    })
  }, [prepareCameraHandoff, viewMode])

  const enterBuildView = useCallback(
    (parcelId: string) => {
      measureLandrushFrameSlice('pascal-water.view.enter-build', () => {
        recordPascalWaterPhaseProbe('view:enter-build:start', { from: viewMode })
        measureLandrushFrameSlice('pascal-water.view.enter-build.prepare-camera-handoff', () =>
          prepareCameraHandoff('build'),
        )
        measureLandrushFrameSlice('pascal-water.view.enter-build.set-build-parcel', () =>
          setBuildParcelId(parcelId),
        )
        measureLandrushFrameSlice('pascal-water.view.enter-build.sync-editor-mode', () =>
          syncPascalWaterBuildEditorMode(true),
        )
        measureLandrushFrameSlice('pascal-water.view.enter-build.set-build-mode', () =>
          setBuildMode(true),
        )
        measureLandrushFrameSlice('pascal-water.view.enter-build.set-map-view', () =>
          setMapView(false),
        )
        measureLandrushFrameSlice('pascal-water.view.enter-build.release-pointer-lock', () =>
          releasePascalWaterPointerLock(),
        )
        recordPascalWaterPhaseProbe('view:enter-build:state-dispatched', { from: viewMode })
      })
    },
    [prepareCameraHandoff, viewMode],
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
  const sceneNodesForGrassBlockers = useScene((state) => (buildMode ? null : state.nodes))
  const builtGrassBlockers = useMemo(
    () =>
      measurePascalWaterSetup(activeProfileMeasure, 'setup.pascal-water.built-grass-blockers', () =>
        createPascalWaterBuiltGrassBlockers(
          sceneNodesForGrassBlockers ?? useScene.getState().nodes,
        ),
      ),
    [activeProfileMeasure, sceneNodesForGrassBlockers],
  )
  const previousGrassBlockerBuildModeRef = useRef(buildMode)
  const [visibleBladeGrassBlockers, setVisibleBladeGrassBlockers] =
    useState<readonly GrassFieldBlocker[]>(builtGrassBlockers)
  useLayoutEffect(() => {
    const wasBuildMode = previousGrassBlockerBuildModeRef.current

    if (buildMode) {
      if (!wasBuildMode) {
        recordPascalWaterGrassEventProbe({
          blockers: builtGrassBlockers.length,
          kind: 'build-enter-freeze-blockers',
        })
      }
    } else if (wasBuildMode) {
      const latestBlockers = createPascalWaterBuiltGrassBlockers(useScene.getState().nodes)
      setVisibleBladeGrassBlockers(latestBlockers)
      recordPascalWaterGrassEventProbe({
        visibleBlockers: latestBlockers.length,
        kind: 'build-exit-apply-blockers-with-fade',
      })
    } else {
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
        initialVisibility: 1,
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
    viewer.setShowGrid(false)
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
    editor.setPhase('structure')
    editor.setStructureLayer('elements')
    editor.setCatalogCategory(null)
    sidebar.setIsCollapsed(true)

    renderScheduler.requestFrame('geometry:changed')
  }, [])

  useEffect(() => {
    measureLandrushFrameSlice('pascal-water.effect.sync-build-mode', () => {
      syncPascalWaterBuildEditorMode(buildMode)
      renderScheduler.requestFrame('geometry:changed')
    })
  }, [buildMode])

  useEffect(() => {
    if (viewMode === 'player') return
    mobileJoystickRef.current = null
    releasePascalWaterPointerLock()
  }, [viewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      measureLandrushFrameSlice('pascal-water.input.mode-keydown', () => {
        if (event.defaultPrevented || isEditableTarget(event.target) || event.repeat) return
        if (event.code === 'KeyM') {
          event.preventDefault()
          if (buildMode) {
            measureLandrushFrameSlice('pascal-water.input.mode-keydown.enter-map', enterMapView)
            return
          }
          if (mapView) {
            measureLandrushFrameSlice(
              'pascal-water.input.mode-keydown.enter-player',
              enterPlayerView,
            )
            return
          }
          measureLandrushFrameSlice('pascal-water.input.mode-keydown.enter-map', enterMapView)
          return
        }
        if (event.code === 'KeyB') {
          event.preventDefault()
          if (buildMode) {
            measureLandrushFrameSlice(
              'pascal-water.input.mode-keydown.enter-player',
              enterPlayerView,
            )
            return
          }
          if (!localOwnedParcel) return
          measureLandrushFrameSlice('pascal-water.input.mode-keydown.enter-build', () =>
            enterBuildView(localOwnedParcel.id),
          )
          return
        }
        if (event.code === 'KeyP') {
          const voiceBlocked = !spatialVoice.available && !spatialVoice.desired
          if (voiceBlocked) return
          event.preventDefault()
          spatialVoice.toggle()
          return
        }
      })
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
    spatialVoice,
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
            ? 'pointer-events-none scale-[1.01] blur-[7px]'
            : 'scale-100 blur-0 brightness-100',
        ].join(' ')}
      >
        <PascalWaterStartupReactProfiler
          enabled={runtimeProbeEnabled}
          id="runtime.pascal-water.editor"
          onRender={handleRuntimeReactRender}
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
              reactProfiler={editorRuntimeReactProfiler}
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
                  enabled={runtimeProbeEnabled}
                  id="runtime.pascal-water.viewer-scene-children"
                  onRender={handleRuntimeReactRender}
                >
                  <PascalWaterStartupReactProfiler
                    enabled={startupProfileEnabled}
                    id="pascal-water.viewer-scene-children"
                    onRender={handleStartupReactRender}
                  >
                    <color args={['#164a77']} attach="background" />
                    <FrameLoadProfilerProbe enabled={frameProfile} />
                    <PascalWaterEditorOverlayLayerBridge enabled={buildMode} />
                    <PascalWaterStartupReactProfiler
                      enabled={runtimeProbeEnabled}
                      id="runtime.pascal-water.player-layer"
                      onRender={handleRuntimeReactRender}
                    >
                      <PascalWaterPlayerLayer
                        baseNode={liveLayoutNode}
                        buildCameraPoseRef={buildCameraPoseRef}
                        grassInteractionRef={grassInteractionRef}
                        localMotionRef={localMotionRef}
                        localProfile={resolvedLocalProfile}
                        mapPresentationProgressRef={mapPresentationProgressRef}
                        mapPresentationVisible={mapPresentationVisible}
                        mapCameraPoseRef={mapCameraPoseRef}
                        mapReturnCameraPoseRef={mapReturnCameraPoseRef}
                        mapTransitionStartPoseRef={mapTransitionStartPoseRef}
                        mobileJoystickRef={mobileJoystickRef}
                        navigationDebugEnabled={
                          navigationDebugEnabled || navigationLiveScenario !== null
                        }
                        navigationLiveScenario={navigationLiveScenario}
                        navigationLiveScenarioAutoRun={navigationLiveScenarioAutoRun}
                        navigationLiveScenarioReady={
                          !loadingActive || navigationLiveScenarioImmediate
                        }
                        onExitBuildMode={enterPlayerView}
                        onLocalPlayerChange={multiplayer.publishLocalPlayer}
                        perfRun={activePerfRun}
                        playerCameraPoseRef={playerCameraPoseRef}
                        playerReturnCameraPoseRef={playerReturnCameraPoseRef}
                        remotePlayers={multiplayer.remotePlayers}
                        robotScreenRevealEnabled={robotScreenRevealEnabled}
                        surface={liveViewerLandSurface}
                        viewMode={viewMode}
                        voiceRangeVisible={spatialVoice.desired && spatialVoice.status === 'live'}
                      />
                    </PascalWaterStartupReactProfiler>
                    {revealProof ? (
                      <PascalWaterRevealProofOccluder
                        motionRef={localMotionRef}
                        presentationMode={viewMode === 'build' ? 'hover' : 'default'}
                        visible={viewMode !== 'map'}
                      />
                    ) : null}
                    <PascalWaterStartupReactProfiler
                      enabled={runtimeProbeEnabled}
                      id="runtime.pascal-water.parcel-ownership-layer"
                      onRender={handleRuntimeReactRender}
                    >
                      <PascalWaterParcelOwnershipLayer
                        allocation={liveParcelAllocation}
                        buildParcelId={buildParcelId}
                        buildMode={buildMode}
                        claimParcel={multiplayer.claimParcel}
                        localMotionRef={localMotionRef}
                        localProfile={resolvedLocalProfile}
                        mapPresentationProgressRef={mapPresentationProgressRef}
                        mapPresentationVisible={mapPresentationVisible}
                        mapView={viewMode === 'map'}
                        onBuildParcel={(parcel) => {
                          enterBuildView(parcel.id)
                        }}
                        parcelClaimError={multiplayer.parcelClaimError}
                        parcelOwnerships={multiplayer.parcelOwnerships}
                        parcelWorldId={parcelWorldId}
                        roads={liveGrassRoads}
                        surface={liveViewerLandSurface}
                        watchParcelWorld={multiplayer.watchParcelWorld}
                      />
                    </PascalWaterStartupReactProfiler>
                    <PascalWaterBuildParcelGuardLayer
                      buildMode={buildMode}
                      groundY={liveViewerLandSurface.grassSurfaceElevation}
                      parcel={activeBuildParcel}
                    />
                    <PascalWaterStartupReactProfiler
                      enabled={runtimeProbeEnabled}
                      id="runtime.pascal-water.build-camera-rig"
                      onRender={handleRuntimeReactRender}
                    >
                      <PascalWaterBuildCameraRig
                        buildCameraPoseRef={buildCameraPoseRef}
                        captureEditorCameraPose={buildCameraControlsReady}
                        groundY={liveViewerLandSurface.grassSurfaceElevation}
                        onSettled={handleBuildCameraSettled}
                        parcel={activeBuildParcel}
                        playerCameraPoseRef={playerCameraPoseRef}
                        visible={buildMode}
                      />
                    </PascalWaterStartupReactProfiler>
                    {!startupProfileNoLandLayers ? (
                      <PascalWaterStartupReactProfiler
                        enabled={runtimeProbeEnabled}
                        id="runtime.pascal-water.land-layers"
                        onRender={handleRuntimeReactRender}
                      >
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
                                source: 'pascal-multiplayer-island',
                              }}
                              grassInteractionRef={grassInteractionRef}
                              grassBlockers={grassBlockers}
                              groundRenderOrder={
                                buildMode ? PASCAL_WATER_BUILD_GRASS_GROUND_RENDER_ORDER : undefined
                              }
                              onStylizedGroundTextureReady={setStylizedGroundTextureReady}
                              profileMeasure={activeProfileMeasure}
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
                      </PascalWaterStartupReactProfiler>
                    ) : null}
                    <PascalWaterBuildGridOverlay
                      groundY={liveViewerLandSurface.grassSurfaceElevation}
                      parcel={activeBuildParcel}
                      visible={buildMode}
                    />
                    <PascalWaterRuntimeCameraProbeRecorder mode={viewMode} />
                  </PascalWaterStartupReactProfiler>
                </PascalWaterStartupReactProfiler>
              }
              viewerUseBvh={false}
            />
          </PascalWaterStartupReactProfiler>
        </PascalWaterStartupReactProfiler>
        <MultiplayerStatusPanel
          connection={multiplayer.connection}
          localPlayerIncluded={!offline}
          remotePlayerCount={multiplayer.remotePlayers.length}
          status={multiplayerStatus}
        />
        <div className="pointer-events-auto absolute top-[18vh] right-5 z-[80] flex flex-col gap-1.5 rounded-lg border border-white/16 bg-slate-950/58 p-1.5 shadow-2xl backdrop-blur-md">
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
            <MapIcon aria-hidden className="size-5" />
            <span>M</span>
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
            <Hammer aria-hidden className="size-5" />
            <span>B</span>
          </button>
          <PascalWaterVoiceModeButton voice={spatialVoice} />
          <div className={pascalWaterModeHintClass()} title="Right click to move">
            <MouseRight aria-hidden className="size-6 text-white/82" />
            <span>Move</span>
          </div>
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
      <PascalWaterLoadingOverlay assetsReady={loadingAssetsReady} onLoaded={handleLoadingLoaded} />
    </main>
  )
}

function resolvePascalWaterMapPresentationProgress(
  viewMode: PascalWaterViewMode,
  transition: PascalWaterModeTransitionFadeState | null,
  progress: number,
) {
  if (!transition) return viewMode === 'map' ? 1 : 0

  const amount = easePascalWaterCameraTransition(progress, transition.to)
  if (transition.to === 'map') return amount
  if (transition.from === 'map') return 1 - amount
  return viewMode === 'map' ? 1 : 0
}

function PascalWaterLoadingOverlay({
  assetsReady,
  onLoaded,
}: {
  assetsReady: boolean
  onLoaded: () => void
}) {
  const { progress, visible } = usePascalWaterLoadingProgress(assetsReady)
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
        'pointer-events-auto absolute inset-0 z-[220] grid place-items-center bg-transparent transition-opacity duration-500',
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

function pascalWaterModeButtonClass(active: boolean, disabled = false) {
  return [
    'inline-flex h-14 w-28 items-center justify-center gap-3 rounded-md border px-3 text-2xl font-black leading-none shadow-xl backdrop-blur transition',
    active
      ? 'border-amber-100/64 bg-amber-300 text-slate-950 shadow-[0_0_22px_rgba(245,207,120,0.22)]'
      : 'border-white/22 bg-slate-950/70 text-white/78 hover:border-white/42 hover:bg-slate-900/84 hover:text-white',
    disabled ? 'cursor-not-allowed opacity-45 hover:border-white/22 hover:bg-slate-950/70' : '',
  ].join(' ')
}

function pascalWaterModeHintClass() {
  return [
    'pointer-events-none inline-flex h-14 w-28 items-center justify-center gap-3 rounded-md border border-white/18 bg-slate-950/54 px-3 text-base font-black uppercase leading-none text-white/76 shadow-xl backdrop-blur',
  ].join(' ')
}

function PascalWaterVoiceModeButton({ voice }: { voice: SpatialVoiceController }) {
  const active = voice.desired && voice.status === 'live'
  const blocked = !voice.available && !voice.desired
  const Icon = active ? Mic : MicOff
  const title =
    voice.status === 'error'
      ? (voice.error ?? 'Voice unavailable')
      : active
        ? 'Mute spatial voice'
        : 'Enable spatial voice'

  return (
    <button
      aria-label={title}
      aria-pressed={active}
      className={[
        pascalWaterModeButtonClass(active, blocked),
        active ? 'border-emerald-200/70 bg-emerald-300 text-slate-950' : '',
        voice.status === 'error' ? 'border-rose-200/55 text-rose-100' : '',
      ].join(' ')}
      disabled={blocked}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        voice.toggle()
      }}
      title={title}
      type="button"
    >
      <Icon aria-hidden className="size-5" />
      <span>P</span>
    </button>
  )
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

  useFrame((state, delta) => {
    if (!visible || !parcel || !captureEditorCameraPose) return

    const controls = getPascalWaterCameraControls(state)
    const target = readPascalWaterCameraControlsTarget(controls, controlsTarget) ?? controlsTarget
    writePascalWaterCameraPose(buildCameraPoseRef, state.camera, target)
  })

  if (!visible || !parcel) return null

  return (
    <>
      <PascalWaterPoseCamera fallbackPosition={initialPosition} pose={initialPose} />
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

function PascalWaterCameraPoseSeed({
  pose,
  zoom,
}: {
  pose: PascalWaterCameraPose | null
  zoom?: number
}) {
  const camera = useThree((state) => state.camera)

  useLayoutEffect(() => {
    if (!pose) return
    applyPascalWaterCameraPose(camera, pose)
    const targetZoom = zoom ?? pose.zoom
    if (typeof targetZoom === 'number') setPascalWaterMapCameraZoom(camera, targetZoom)
    camera.updateMatrixWorld()
  }, [camera, pose, zoom])

  return null
}

function PascalWaterRuntimeCameraProbeRecorder({ mode }: { mode: PascalWaterViewMode }) {
  const getThreeState = useThree((state) => state.get)
  const targetRef = useRef(new Vector3())
  const forwardRef = useRef(new Vector3())
  const modeRef = useRef<PascalWaterViewMode>(mode)
  const lastR3fFrameAtRef = useRef<number | null>(null)

  modeRef.current = mode

  useFrame((state, delta) => {
    const now = performance.now()
    const previousFrameAt = lastR3fFrameAtRef.current
    lastR3fFrameAtRef.current = now
    recordPascalWaterFrameProbe({
      dtMs: previousFrameAt === null ? null : now - previousFrameAt,
      mode,
      source: 'r3f',
    })
    const target = targetRef.current
      .copy(state.camera.position)
      .add(state.camera.getWorldDirection(forwardRef.current).multiplyScalar(10))
    recordPascalWaterCameraProbe({
      camera: state.camera,
      mode,
      source: 'runtime-camera',
      target,
    })
  })

  useEffect(() => {
    if (!getPascalWaterRuntimeProbe()) return

    let animationFrameId = 0
    let lastRafAt: number | null = null
    const recordRafFrame = (now: number) => {
      recordPascalWaterFrameProbe({
        dtMs: lastRafAt === null ? null : now - lastRafAt,
        mode: modeRef.current,
        source: 'raf',
      })
      lastRafAt = now
      animationFrameId = window.requestAnimationFrame(recordRafFrame)
    }

    let longTaskObserver: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined') {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) recordPascalWaterLongTaskProbe(entry)
      })
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
      } catch {
        longTaskObserver.disconnect()
        longTaskObserver = null
      }
    }

    const recordCurrentCamera = () => {
      const state = getThreeState()
      const target = targetRef.current
        .copy(state.camera.position)
        .add(state.camera.getWorldDirection(forwardRef.current).multiplyScalar(10))
      recordPascalWaterCameraProbe({
        camera: state.camera,
        mode: modeRef.current,
        source: 'runtime-camera-interval',
        target,
      })
    }

    recordCurrentCamera()
    animationFrameId = window.requestAnimationFrame(recordRafFrame)
    const intervalId = window.setInterval(recordCurrentCamera, 50)
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.clearInterval(intervalId)
      longTaskObserver?.disconnect()
    }
  }, [getThreeState])

  return null
}

function PascalWaterPoseCamera({
  fallbackPosition,
  fallbackTarget = PASCAL_WATER_CAMERA_TARGET,
  makeDefault = true,
  pose,
}: {
  fallbackPosition: readonly [number, number, number]
  fallbackTarget?: readonly [number, number, number]
  makeDefault?: boolean
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
      applyPascalWaterCameraPose(camera, initialPoseRef.current, fallbackTarget)
    },
    [fallbackTarget],
  )

  return (
    <PerspectiveCamera
      far={900}
      fov={48}
      makeDefault={makeDefault}
      near={0.1}
      onUpdate={handleUpdate}
      position={initialPositionRef.current}
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
  const startQuaternionRef = useRef(new Quaternion())
  const endQuaternionRef = useRef(new Quaternion())
  const startedAtRef = useRef<number | null>(null)
  const parcelRadius = useMemo(() => parcelBuildCameraRadius(parcel), [parcel])

  useEffect(() => {
    renderScheduler.requestFrame('camera:start')
    return () => renderScheduler.requestFrame('camera:end')
  }, [])

  useFrame((state, delta) => {
    if (settledRef.current) return

    renderScheduler.requestFrame('camera:move')
    state.camera.up.set(0, 1, 0)
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
        state.camera.lookAt(startTargetRef.current)
      }
      startQuaternionRef.current.copy(state.camera.quaternion)
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
    if (startedAtRef.current === null) {
      startedAtRef.current = performance.now()
      const currentPosition = state.camera.position.clone()
      const currentQuaternion = state.camera.quaternion.clone()
      state.camera.position.copy(desired)
      state.camera.lookAt(target)
      endQuaternionRef.current.copy(state.camera.quaternion)
      state.camera.position.copy(currentPosition)
      state.camera.quaternion.copy(currentQuaternion)
      state.camera.updateMatrixWorld()
    }

    const elapsed = Math.max(0, (performance.now() - startedAtRef.current) / 1000)
    const progress = clamp01(elapsed / PASCAL_WATER_CAMERA_TRANSITION_SECONDS)
    const amount = easePascalWaterCameraTransition(progress, 'build')
    state.camera.position.lerpVectors(startPositionRef.current, desired, amount)
    controlsTarget.lerpVectors(startTargetRef.current, target, amount)

    state.camera.quaternion.slerpQuaternions(
      startQuaternionRef.current,
      endQuaternionRef.current,
      amount,
    )
    state.camera.updateMatrixWorld()
    writePascalWaterCameraPose(buildCameraPoseRef, state.camera, controlsTarget)
    recordPascalWaterCameraProbe({
      camera: state.camera,
      mode: 'build',
      progress,
      source: 'build-transition',
      target: controlsTarget,
    })

    if (progress >= 1) {
      state.camera.position.copy(desired)
      controlsTarget.copy(target)
      state.camera.quaternion.copy(endQuaternionRef.current)
      state.camera.updateMatrixWorld()
      writePascalWaterCameraPose(buildCameraPoseRef, state.camera, target)
      settledRef.current = true
      const finalPose =
        clonePascalWaterCameraPose(buildCameraPoseRef.current) ??
        createPascalWaterCameraPose(state.camera, target)
      onSettled(finalPose)
      renderScheduler.requestFrame('camera:end')
    }
  }, -1)

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

function PascalWaterBuildGridOverlay({
  groundY,
  parcel,
  visible,
}: {
  groundY: number
  parcel: ParcelAllocationParcel | null
  visible: boolean
}) {
  const invalidate = useThree((state) => state.invalidate)
  const targetVisible = visible && Boolean(parcel)
  const [renderParcel, setRenderParcel] = useState(parcel)
  const [renderVisible, setRenderVisible] = useState(targetVisible)
  const fadeRef = useRef({
    from: targetVisible ? 1 : 0,
    opacity: targetVisible ? 1 : 0,
    startedAt: 0,
    to: targetVisible ? 1 : 0,
  })
  const geometries = useMemo(
    () => createPascalWaterBuildGridGeometries(renderParcel),
    [renderParcel],
  )
  const materials = useMemo(() => createPascalWaterBuildGridMaterials(), [])
  const lastProbeAtRef = useRef(-Infinity)
  const renderParcelRef = useRef(renderParcel)

  useEffect(() => {
    renderParcelRef.current = renderParcel
  }, [renderParcel])

  useEffect(() => {
    if (parcel) {
      renderParcelRef.current = parcel
      setRenderParcel(parcel)
    }
    if (targetVisible) setRenderVisible(true)
    invalidate()
    fadeRef.current = {
      from: fadeRef.current.opacity,
      opacity: fadeRef.current.opacity,
      startedAt: performance.now(),
      to: targetVisible ? 1 : 0,
    }

    let animationFrame = 0
    const tick = () => {
      const now = performance.now()
      const fade = fadeRef.current
      const progress = clamp01(
        (now - fade.startedAt) / (PASCAL_WATER_CAMERA_TRANSITION_SECONDS * 1000),
      )
      const opacity = MathUtils.lerp(
        fade.from,
        fade.to,
        easePascalWaterCameraTransition(progress, fade.to > fade.from ? 'build' : 'player'),
      )
      fade.opacity = opacity
      setPascalWaterBuildGridMaterialsOpacity(materials, opacity)
      invalidate()

      if (now - lastProbeAtRef.current > 120) {
        lastProbeAtRef.current = now
        const currentParcel = renderParcelRef.current
        recordPascalWaterGridProbe({
          fadeTarget: fade.to,
          opacity: roundPerf(opacity),
          parcelId: currentParcel?.id ?? null,
          progress: roundPerf(progress),
          renderOrder: PASCAL_WATER_BUILD_GRID_RENDER_ORDER,
          visible: opacity > 0.002 && Boolean(currentParcel),
        })
      }
      if (opacity <= 0.002 && fade.to === 0) {
        setRenderVisible(false)
      }
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick)
      }
    }
    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [invalidate, materials, parcel, targetVisible])

  useEffect(
    () => () => {
      for (const geometry of geometries) geometry.dispose()
    },
    [geometries],
  )
  useEffect(
    () => () => {
      for (const material of materials) material.dispose()
    },
    [materials],
  )

  return (
    <group
      position={[0, groundY + PASCAL_WATER_BUILD_GRID_ELEVATION_OFFSET, 0]}
      visible={renderVisible && Boolean(renderParcel)}
    >
      {geometries.map((geometry, index) => (
        <lineSegments
          geometry={geometry}
          key={index}
          layers={GRID_LAYER}
          material={materials[index]}
          renderOrder={PASCAL_WATER_BUILD_GRID_RENDER_ORDER}
        />
      ))}
    </group>
  )
}

function setPascalWaterBuildGridMaterialsOpacity(
  materials: readonly LineBasicMaterial[],
  opacity: number,
) {
  for (const material of materials) {
    const baseOpacity =
      typeof material.userData.pascalWaterBuildGridBaseOpacity === 'number'
        ? material.userData.pascalWaterBuildGridBaseOpacity
        : material.opacity
    material.userData.pascalWaterBuildGridBaseOpacity = baseOpacity
    material.opacity = baseOpacity * opacity
  }
}

function createPascalWaterBuildGridMaterials() {
  return Array.from({ length: PASCAL_WATER_BUILD_GRID_FADE_BUCKETS }, (_, index) => {
    const alpha = ((index + 1) / PASCAL_WATER_BUILD_GRID_FADE_BUCKETS) ** 1.15
    const material = new LineBasicMaterial({
      color: '#ffffff',
      depthTest: true,
      depthWrite: false,
      opacity: 0.42 * alpha,
      transparent: true,
    })
    material.userData.pascalWaterBuildGridBaseOpacity = material.opacity
    material.toneMapped = false
    return material
  })
}

function createPascalWaterBuildGridGeometries(parcel: ParcelAllocationParcel | null) {
  const bucketVertices = Array.from(
    { length: PASCAL_WATER_BUILD_GRID_FADE_BUCKETS },
    () => [] as number[],
  )
  if (parcel) {
    const ring = openPointRing(parcel.points)
    const bounds = boundsForPoints(ring)
    const gridStep = PASCAL_WATER_BUILD_GRID_SIZE_METERS / PASCAL_WATER_BUILD_GRID_DIVISIONS
    const segmentStep = gridStep / 2
    const minX =
      Math.floor((bounds.minX - PASCAL_WATER_BUILD_GRID_FADE_METERS) / gridStep) * gridStep
    const maxX =
      Math.ceil((bounds.maxX + PASCAL_WATER_BUILD_GRID_FADE_METERS) / gridStep) * gridStep
    const minZ =
      Math.floor((bounds.minZ - PASCAL_WATER_BUILD_GRID_FADE_METERS) / gridStep) * gridStep
    const maxZ =
      Math.ceil((bounds.maxZ + PASCAL_WATER_BUILD_GRID_FADE_METERS) / gridStep) * gridStep

    for (let x = minX; x <= maxX + 0.0001; x += gridStep) {
      for (let z = minZ; z < maxZ - 0.0001; z += segmentStep) {
        pushPascalWaterBuildGridSegment(
          bucketVertices,
          ring,
          x,
          z,
          x,
          Math.min(maxZ, z + segmentStep),
        )
      }
    }
    for (let z = minZ; z <= maxZ + 0.0001; z += gridStep) {
      for (let x = minX; x < maxX - 0.0001; x += segmentStep) {
        pushPascalWaterBuildGridSegment(
          bucketVertices,
          ring,
          x,
          z,
          Math.min(maxX, x + segmentStep),
          z,
        )
      }
    }
  }

  return bucketVertices.map((vertices) => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    return geometry
  })
}

function pushPascalWaterBuildGridSegment(
  bucketVertices: number[][],
  ring: readonly LandrushPoint2[],
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const alpha = pascalWaterBuildGridAlphaAtPoint(
    {
      x: (startX + endX) / 2,
      z: (startZ + endZ) / 2,
    },
    ring,
  )
  if (alpha <= 0.015) return

  const bucket = Math.min(
    PASCAL_WATER_BUILD_GRID_FADE_BUCKETS - 1,
    Math.max(0, Math.floor(alpha * PASCAL_WATER_BUILD_GRID_FADE_BUCKETS)),
  )
  bucketVertices[bucket]?.push(startX, 0, startZ, endX, 0, endZ)
}

function pascalWaterBuildGridAlphaAtPoint(point: LandrushPoint2, ring: readonly LandrushPoint2[]) {
  if (ring.length < 3) return 0
  if (pointInPolygon(point, ring)) return 1
  const distance = distanceToClosedPolyline(point, ring)
  return clamp01(1 - distance / PASCAL_WATER_BUILD_GRID_FADE_METERS)
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

function pascalWaterStairColliderGeometryReady() {
  const nodes = useScene.getState().nodes
  for (const node of Object.values(nodes)) {
    if (
      node.type !== 'stair' ||
      node.visible === false ||
      node.parentId !== PASCAL_WATER_LEVEL_ID ||
      (node.stairType ?? 'straight') !== 'straight' ||
      (node.children?.length ?? 0) === 0
    ) {
      continue
    }

    const group = sceneRegistry.nodes.get(node.id) as Group | undefined
    const mergedStair = group?.getObjectByName('merged-stair') as Mesh | undefined
    const positions = mergedStair?.geometry?.getAttribute('position')
    if (!positions || positions.count < 3) return false
  }
  return true
}

function usePascalWaterBuiltColliderWorlds() {
  const physicsSignature = useScene((state) => createPascalWaterPhysicsNodeSignature(state.nodes))
  const doorAnimationSignature = useInteractive((state) =>
    createPascalWaterDoorAnimationSignature(state.doorAnimations),
  )
  const [runtimeColliderVersion, setRuntimeColliderVersion] = useState(0)
  const [worlds, setWorlds] = useState<{
    collision: FirstPersonColliderWorld | null
    floatOnly: FirstPersonColliderWorld | null
  }>({ collision: null, floatOnly: null })
  const worldsRef = useRef<{
    collision: FirstPersonColliderWorld | null
    floatOnly: FirstPersonColliderWorld | null
  }>({ collision: null, floatOnly: null })
  const colliderWorldVersion = `${physicsSignature}:${doorAnimationSignature}:${runtimeColliderVersion}`

  const replaceWorlds = useCallback(
    (nextWorlds: {
      collision: FirstPersonColliderWorld | null
      floatOnly: FirstPersonColliderWorld | null
    }) => {
      worldsRef.current.collision?.dispose()
      worldsRef.current.floatOnly?.dispose()
      worldsRef.current = nextWorlds
      setWorlds(nextWorlds)
    },
    [],
  )

  const disposeWorlds = useCallback(
    (nextWorlds: {
      collision: FirstPersonColliderWorld | null
      floatOnly: FirstPersonColliderWorld | null
    }) => {
      nextWorlds.collision?.dispose()
      nextWorlds.floatOnly?.dispose()
    },
    [],
  )

  const buildWorlds = useCallback(() => {
    const collision = buildFirstPersonColliderWorldFromRegistry({
      excludeNodeTypes: ['slab', 'stair-segment'],
    })
    const floatOnly = buildFirstPersonColliderWorldFromRegistry({
      includeNodeTypes: ['slab'],
      userData: {
        excludeCollisionCheck: true,
        excludeFloatHit: false,
      },
    })
    return { collision, floatOnly }
  }, [])

  useEffect(() => {
    void colliderWorldVersion
    let cancelled = false
    let frame = 0
    let attempts = 0
    const rebuildWhenReady = () => {
      attempts += 1
      if (!pascalWaterStairColliderGeometryReady() && attempts < 90) {
        frame = window.requestAnimationFrame(rebuildWhenReady)
        return
      }

      const nextWorlds = buildWorlds()
      if (cancelled) {
        disposeWorlds(nextWorlds)
        return
      }
      replaceWorlds(nextWorlds)
    }
    frame = window.requestAnimationFrame(rebuildWhenReady)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [buildWorlds, colliderWorldVersion, disposeWorlds, replaceWorlds])

  useEffect(() => {
    const rebuildColliderWorld = () => setRuntimeColliderVersion((version) => version + 1)
    emitter.on('door:animation-completed', rebuildColliderWorld)
    emitter.on('window:animation-completed', rebuildColliderWorld)
    return () => {
      emitter.off('door:animation-completed', rebuildColliderWorld)
      emitter.off('window:animation-completed', rebuildColliderWorld)
    }
  }, [])

  useEffect(
    () => () => {
      worldsRef.current.collision?.dispose()
      worldsRef.current.floatOnly?.dispose()
      worldsRef.current = { collision: null, floatOnly: null }
    },
    [],
  )

  return worlds
}

function createPascalWaterDoorAnimationSignature(
  doorAnimations: PascalWaterInteractiveDoorAnimationRecord,
) {
  return Object.entries(doorAnimations)
    .map(([doorId, animation]) => `${doorId}:${animation.field}:${animation.to}`)
    .sort()
    .join('|')
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
  mapPresentationProgressRef,
  mapPresentationVisible,
  mapReturnCameraPoseRef,
  mapTransitionStartPoseRef,
  mobileJoystickRef,
  navigationDebugEnabled,
  navigationLiveScenario,
  navigationLiveScenarioAutoRun,
  navigationLiveScenarioReady,
  onExitBuildMode,
  onLocalPlayerChange,
  perfRun,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
  remotePlayers,
  robotScreenRevealEnabled,
  surface,
  viewMode,
  voiceRangeVisible,
}: {
  baseNode: PascalWaterLayoutNode
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapPresentationProgressRef: { current: number }
  mapPresentationVisible: boolean
  mapReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapTransitionStartPoseRef: { current: PascalWaterCameraPose | null }
  mobileJoystickRef: { current: MobileJoystickInput | null }
  navigationDebugEnabled: boolean
  navigationLiveScenario: PascalWaterNavigationLiveScenarioKind | null
  navigationLiveScenarioAutoRun: boolean
  navigationLiveScenarioReady: boolean
  onExitBuildMode: () => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: PascalWaterPerfRunOptions
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  robotScreenRevealEnabled: boolean
  surface: PascalWaterLandSurface
  viewMode: PascalWaterViewMode
  voiceRangeVisible: boolean
}) {
  const spawn = useMemo(() => centroidForPolygon(surface.grassSurfacePoints), [surface])
  const groundY = surface.grassSurfaceElevation + PASCAL_WATER_ROBOT_GROUND_CLEARANCE
  const mapVisible = viewMode === 'map'
  const movementEnabled = viewMode !== 'build'
  const cameraEnabled = viewMode === 'player'
  const localRobotVisualRootRef = useRef<Group | null>(null)
  const robotPresentationMode: LandrushRobotPresentationMode =
    viewMode === 'build' ? 'hover' : 'default'

  return (
    <group>
      <PascalWaterMapCameraRig
        active={mapVisible}
        mapCameraPoseRef={mapCameraPoseRef}
        mapTransitionStartPoseRef={mapTransitionStartPoseRef}
        playerCameraPoseRef={playerCameraPoseRef}
      />
      <LocalPascalWaterRobot
        baseNode={baseNode}
        grassInteractionRef={grassInteractionRef}
        groundY={groundY}
        localMotionRef={localMotionRef}
        localProfile={localProfile}
        localRobotVisualRootRef={localRobotVisualRootRef}
        mobileJoystickRef={mobileJoystickRef}
        cameraEnabled={cameraEnabled}
        movementEnabled={movementEnabled}
        navigationDebugEnabled={navigationDebugEnabled}
        navigationLiveScenario={navigationLiveScenario}
        navigationLiveScenarioAutoRun={navigationLiveScenarioAutoRun}
        navigationLiveScenarioReady={navigationLiveScenarioReady}
        onExitBuildMode={onExitBuildMode}
        onLocalPlayerChange={onLocalPlayerChange}
        perfRun={perfRun}
        presentationMode={robotPresentationMode}
        buildCameraPoseRef={buildCameraPoseRef}
        mapReturnCameraPoseRef={mapReturnCameraPoseRef}
        playerCameraPoseRef={playerCameraPoseRef}
        playerReturnCameraPoseRef={playerReturnCameraPoseRef}
        spawn={spawn}
        surfacePoints={surface.grassSurfacePoints}
      />
      <SpatialVoiceRangeRing
        color={localProfile.color}
        groundY={surface.grassSurfaceElevation}
        motionRef={localMotionRef}
        visible={voiceRangeVisible}
      />
      {remotePlayers.map((player) => (
        <RemotePascalWaterRobot
          baseNode={baseNode}
          groundY={groundY}
          key={player.id}
          player={player}
        />
      ))}
      <PascalWaterRobotScreenRevealClipper
        motionRef={localMotionRef}
        presentationMode={robotPresentationMode}
        visualRootRef={localRobotVisualRootRef}
        visible={robotScreenRevealEnabled && viewMode !== 'map'}
      />
      <PascalWaterMapPlayerMarker
        color={localProfile.color}
        groundY={groundY}
        motionRef={localMotionRef}
        opacityRef={mapPresentationProgressRef}
        visible={mapPresentationVisible}
      />
      {remotePlayers.map((player) => (
        <PascalWaterRemoteMapPlayerMarker
          groundY={groundY}
          key={`map-${player.id}`}
          opacityRef={mapPresentationProgressRef}
          player={player}
          visible={mapPresentationVisible}
        />
      ))}
    </group>
  )
}

function PascalWaterRevealProofOccluder({
  motionRef,
  presentationMode,
  visible,
}: {
  motionRef: { current: RobotMotion | null }
  presentationMode: LandrushRobotPresentationMode
  visible: boolean
}) {
  const meshRef = useRef<Mesh | null>(null)
  const cameraPositionRef = useRef(new Vector3())
  const occluderCenterRef = useRef(new Vector3())
  const cameraDirectionRef = useRef(new Vector3())
  const hoverAmountRef = useRef(0)
  const geometry = useMemo(() => new PlaneGeometry(2.6, 3.15), [])
  const material = useMemo(() => {
    const nextMaterial = new MeshBasicNodeMaterial({
      color: '#111827',
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      transparent: true,
    })
    nextMaterial.opacityNode = createLandrushRobotScreenRevealOpacityNode(float(1))
    nextMaterial.userData.landrushRobotScreenRevealSoftMask = true
    return nextMaterial
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(({ camera, clock }, delta) => {
    const mesh = meshRef.current
    const motion = motionRef.current
    if (!mesh || !motion || !visible) {
      if (mesh) mesh.visible = false
      return
    }

    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      presentationMode === 'hover' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      Math.min(delta, 0.05),
    )
    const hoverOffset = resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    cameraPositionRef.current.setFromMatrixPosition(camera.matrixWorld)
    occluderCenterRef.current.set(
      motion.position.x,
      motion.position.y + hoverOffset + PASCAL_WATER_ROBOT_CAMERA_TARGET_HEIGHT,
      motion.position.z,
    )
    cameraDirectionRef.current
      .subVectors(cameraPositionRef.current, occluderCenterRef.current)
      .normalize()
    mesh.position.copy(occluderCenterRef.current).addScaledVector(cameraDirectionRef.current, 0.55)
    mesh.lookAt(cameraPositionRef.current)
    mesh.visible = true
  })

  return (
    <group userData={{ landrushRobotOccluder: true }}>
      <mesh
        frustumCulled={false}
        geometry={geometry}
        material={material}
        ref={meshRef}
        renderOrder={18}
      />
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
  mapPresentationProgressRef,
  mapPresentationVisible,
  mapView,
  onBuildParcel,
  parcelClaimError,
  parcelOwnerships,
  parcelWorldId,
  roads,
  surface,
  watchParcelWorld,
}: {
  allocation: ParcelAllocationResult
  buildMode: boolean
  buildParcelId: string | null
  claimParcel: (worldId: string, parcelId: string) => boolean
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapPresentationProgressRef: { current: number }
  mapPresentationVisible: boolean
  mapView: boolean
  onBuildParcel: (parcel: ParcelAllocationParcel) => void
  parcelClaimError: ParcelClaimError | null
  parcelOwnerships: readonly ParcelOwnership[]
  parcelWorldId: string
  roads: readonly LandrushRoadSegment[]
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
  const parcelMapShapes = useMemo(
    () => createPascalWaterParcelMapShapes(allocation.parcels, roads),
    [allocation.parcels, roads],
  )

  useEffect(() => {
    watchParcelWorld(parcelWorldId)
  }, [parcelWorldId, watchParcelWorld])

  useEffect(() => {
    const probe = getPascalWaterRuntimeProbe()
    if (!probe) return

    const claimFirstFreeParcel = () => {
      if (localOwnership) return true
      const parcel = allocation.parcels.find((candidate) => !ownershipMap.has(candidate.id))
      if (!parcel) return false
      return claimParcel(parcelWorldId, parcel.id)
    }
    const enterFirstBuildParcel = () => {
      const parcelId = localOwnership?.parcelId
      const parcel =
        (parcelId ? allocation.parcels.find((candidate) => candidate.id === parcelId) : null) ??
        allocation.parcels.find((candidate) => !ownershipMap.has(candidate.id)) ??
        allocation.parcels[0]
      if (!parcel) return false
      onBuildParcel(parcel)
      return true
    }

    probe.claimFirstFreeParcel = claimFirstFreeParcel
    probe.enterFirstBuildParcel = enterFirstBuildParcel
    probe.parcelDiagnostics = {
      firstParcelIds: allocation.parcels.slice(0, 5).map((parcel) => parcel.id),
      freeParcelCount: allocation.parcels.filter((parcel) => !ownershipMap.has(parcel.id)).length,
      localOwnershipParcelId: localOwnership?.parcelId ?? null,
      ownershipCount: ownershipMap.size,
      parcelCount: allocation.parcels.length,
      parcelWorldId,
    }
    return () => {
      if (probe.claimFirstFreeParcel === claimFirstFreeParcel) {
        delete probe.claimFirstFreeParcel
      }
      if (probe.enterFirstBuildParcel === enterFirstBuildParcel) {
        delete probe.enterFirstBuildParcel
      }
      if (probe.parcelDiagnostics?.parcelWorldId === parcelWorldId) {
        delete probe.parcelDiagnostics
      }
    }
  }, [allocation.parcels, claimParcel, localOwnership, onBuildParcel, ownershipMap, parcelWorldId])

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
      return (
        allocation.parcels.find((candidate) =>
          pointInPolygon(point, parcelMapShapes.get(candidate.id)?.points ?? candidate.points),
        ) ?? null
      )
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
    parcelMapShapes,
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
      {!buildMode
        ? allocation.parcels.map((parcel) => (
            <PascalWaterParcelClaimMesh
              groundY={groundY}
              hovered={hoveredParcelId === parcel.id}
              key={parcel.id}
              mapOpacityRef={mapPresentationProgressRef}
              mapView={mapView}
              onSelect={() => setSelectedParcelId(parcel.id)}
              owned={ownershipMap.has(parcel.id)}
              parcel={parcel}
              selected={selectedParcelId === parcel.id || buildParcelId === parcel.id}
              shape={parcelMapShapes.get(parcel.id)}
            />
          ))
        : null}
      {localOwnership
        ? allocation.parcels
            .filter((parcel) => parcel.id === localOwnership.parcelId)
            .map((parcel) => (
              <PascalWaterParcelBuildMarker
                groundY={groundY}
                key={parcel.id}
                mapPresentationVisible={mapPresentationVisible}
                mapView={mapView}
                mapOpacityRef={mapPresentationProgressRef}
                onBuild={onBuildParcel}
                parcel={parcel}
                shape={parcelMapShapes.get(parcel.id)}
                visible={
                  !buildMode &&
                  (mapPresentationVisible || mapView || insideOwnedParcelId === parcel.id)
                }
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
  mapOpacityRef,
  mapView,
  onSelect,
  owned,
  parcel,
  selected,
  shape,
}: {
  groundY: number
  hovered: boolean
  mapOpacityRef: { current: number }
  mapView: boolean
  onSelect: () => void
  owned: boolean
  parcel: ParcelAllocationParcel
  selected: boolean
  shape?: PascalWaterParcelMapShape
}) {
  const groupRef = useRef<Group>(null!)
  const freeBadgeRef = useRef<HTMLDivElement | null>(null)
  const materialRef = useRef<MeshBasicMaterial>(null!)
  const contourMaterialRef = useRef<LineBasicMaterial>(null!)
  const parcelShape = useMemo(
    () => shape ?? createPascalWaterParcelMapShape(parcel, []),
    [parcel, shape],
  )
  const geometry = useMemo(
    () => createCenteredParcelGeometry(parcel, parcelShape.points, parcelShape.centroid),
    [parcel, parcelShape],
  )
  const contourGeometry = useMemo(
    () => createCenteredParcelContourGeometry(parcel, parcelShape.points, parcelShape.centroid),
    [parcel, parcelShape],
  )
  const baseColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_HOVER_COLOR), [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => contourGeometry.dispose(), [contourGeometry])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    const contourMaterial = contourMaterialRef.current
    if (!group || !material || !contourMaterial) return

    const opacityAmount = clamp01(mapOpacityRef.current)
    const mapVisible = opacityAmount > 0.002
    const emphasis = mapVisible && mapView && (hovered || selected || owned)
    const targetScale = emphasis ? PASCAL_WATER_PARCEL_MAP_OVERLAY_HOVER_SCALE : 1
    const scale = MathUtils.damp(
      group.scale.x,
      targetScale,
      PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    group.scale.setScalar(scale)

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 3.1 + parcel.index * 0.61) * 0.5
    const targetOpacity = emphasis
      ? opacityAmount * (PASCAL_WATER_PARCEL_MAP_HOVER_OPACITY + pulse * 0.018)
      : opacityAmount *
        PASCAL_WATER_PARCEL_MAP_BASE_OPACITY *
        PASCAL_WATER_PARCEL_MAP_DEFAULT_FILL_OPACITY_SCALE
    material.opacity = targetOpacity
    material.color.lerpColors(baseColor, hoverColor, emphasis ? 0.72 : 0.12)
    contourMaterial.opacity = mapVisible
      ? opacityAmount * (PASCAL_WATER_PARCEL_MAP_CONTOUR_OPACITY + pulse * 0.018)
      : 0
    const badgeOpacity =
      !owned && mapVisible ? opacityAmount * PASCAL_WATER_PARCEL_MAP_FREE_BADGE_OPACITY : 0
    if (freeBadgeRef.current) freeBadgeRef.current.style.opacity = String(badgeOpacity)
    group.visible = targetOpacity > 0.002 || contourMaterial.opacity > 0.002 || badgeOpacity > 0.002
  })

  return (
    <group
      ref={groupRef}
      position={[parcelShape.centroid.x, groundY, parcelShape.centroid.z]}
      visible
    >
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
      <lineSegments renderOrder={77} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive attach="geometry" object={contourGeometry} />
        <lineBasicMaterial
          color={PASCAL_WATER_PARCEL_MAP_HOVER_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          ref={contourMaterialRef}
          toneMapped={false}
          transparent
        />
      </lineSegments>
      {!owned ? (
        <Html
          center
          position={[0, 0.92, 0]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[65, 0]}
        >
          <div
            className="rounded-full border border-amber-100/60 bg-slate-950/72 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur"
            ref={freeBadgeRef}
            style={{ opacity: 0 }}
          >
            Free
          </div>
        </Html>
      ) : null}
    </group>
  )
}

function PascalWaterParcelBuildMarker({
  groundY,
  mapOpacityRef,
  mapPresentationVisible,
  mapView,
  onBuild,
  parcel,
  shape,
  visible,
}: {
  groundY: number
  mapOpacityRef: { current: number }
  mapPresentationVisible: boolean
  mapView: boolean
  onBuild: (parcel: ParcelAllocationParcel) => void
  parcel: ParcelAllocationParcel
  shape?: PascalWaterParcelMapShape
  visible: boolean
}) {
  const mapButtonRef = useRef<HTMLDivElement | null>(null)
  const fallbackButtonRef = useRef<HTMLDivElement | null>(null)

  useFrame(() => {
    const mapOpacity = visible ? clamp01(mapOpacityRef.current) : 0
    const mapActive = mapView || mapPresentationVisible || mapOpacity > 0.002
    const fallbackActive = visible && !mapView && !mapPresentationVisible
    if (mapButtonRef.current) {
      mapButtonRef.current.style.opacity = String(mapActive ? mapOpacity : 0)
      mapButtonRef.current.style.pointerEvents = mapView ? 'auto' : 'none'
    }
    if (fallbackButtonRef.current) {
      fallbackButtonRef.current.style.opacity = fallbackActive ? '1' : '0'
      fallbackButtonRef.current.style.pointerEvents = fallbackActive ? 'auto' : 'none'
    }
  })

  if (!visible) return null

  return (
    <>
      <PascalWaterParcelBuildGlow
        groundY={groundY}
        opacityRef={mapOpacityRef}
        parcel={parcel}
        shape={shape}
        visible={mapView || mapPresentationVisible}
      />
      <Html
        center
        position={[parcel.centroid.x, groundY + 1.05, parcel.centroid.z]}
        style={{ pointerEvents: mapView ? 'auto' : 'none' }}
        zIndexRange={[70, 0]}
      >
        <div ref={mapButtonRef} style={{ opacity: 0, pointerEvents: mapView ? 'auto' : 'none' }}>
          <button
            aria-label="Build"
            className="group pointer-events-auto inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-amber-100/55 bg-slate-950/72 text-xs font-semibold text-amber-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition-[width,background-color,transform] duration-200 hover:w-[5.75rem] hover:scale-105 hover:bg-slate-900/84 focus-visible:w-[5.75rem] focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!mapView) return
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
        </div>
      </Html>
      <Html
        center
        position={[parcel.centroid.x, groundY + 1.05, parcel.centroid.z]}
        zIndexRange={[70, 0]}
      >
        <div ref={fallbackButtonRef} style={{ opacity: 0, pointerEvents: 'none' }}>
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
        </div>
      </Html>
    </>
  )
}

function PascalWaterParcelBuildGlow({
  groundY,
  opacityRef,
  parcel,
  shape,
  visible,
}: {
  groundY: number
  opacityRef: { current: number }
  parcel: ParcelAllocationParcel
  shape?: PascalWaterParcelMapShape
  visible: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const materialRef = useRef<MeshBasicMaterial>(null!)
  const parcelShape = useMemo(
    () => shape ?? createPascalWaterParcelMapShape(parcel, []),
    [parcel, shape],
  )
  const geometry = useMemo(
    () => createCenteredParcelGeometry(parcel, parcelShape.points, parcelShape.centroid),
    [parcel, parcelShape],
  )
  const baseColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(PASCAL_WATER_PARCEL_MAP_HOVER_COLOR), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    if (!group || !material) return

    const opacity = visible ? clamp01(opacityRef.current) : 0
    group.visible = opacity > 0.002
    if (!group.visible) return

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 2.2 + parcel.index * 0.61) * 0.5
    const targetScale = PASCAL_WATER_PARCEL_MAP_OVERLAY_HOVER_SCALE * 0.998
    const scale = MathUtils.damp(
      group.scale.x,
      targetScale,
      PASCAL_WATER_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    group.scale.setScalar(scale)
    material.opacity = opacity * (PASCAL_WATER_PARCEL_MAP_BASE_OPACITY * 0.62 + pulse * 0.01)
    material.color.lerpColors(baseColor, hoverColor, 0.16 + pulse * 0.05)
  })

  return (
    <group
      ref={groupRef}
      position={[parcelShape.centroid.x, groundY + 0.015, parcelShape.centroid.z]}
    >
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

const PASCAL_WATER_ROBOT_REVEAL_OCCLUDER_NODE_TYPES = [
  'wall',
  'fence',
  'door',
  'window',
  'item',
  'column',
  'elevator',
  'stair',
  'stair-segment',
] as const

function PascalWaterRobotScreenRevealClipper({
  motionRef,
  presentationMode,
  visualRootRef,
  visible,
}: {
  motionRef: { current: RobotMotion | null }
  presentationMode: LandrushRobotPresentationMode
  visualRootRef: { current: Group | null }
  visible: boolean
}) {
  const { camera, gl, scene } = useThree()
  const occludersRef = useRef<Object3D[]>([])
  const objectStatesRef = useRef(new Map<Object3D, PascalWaterRevealObjectState>())
  const activeObjectsRef = useRef(new Set<Object3D>())
  const materialsRef = useRef<Material[]>([])
  const materialStatesRef = useRef(new Map<Material, PascalWaterRevealMaterialState>())
  const activeMaterialsRef = useRef(new Set<Material>())
  const lastRefreshAtRef = useRef(-Infinity)
  const lastProbeAtRef = useRef(-Infinity)
  const revealActiveRef = useRef(false)
  const clippingPlanesRef = useRef(
    Array.from({ length: PASCAL_WATER_ROBOT_SCREEN_REVEAL_CLIP_SEGMENTS }, () => new Plane()),
  )
  const boundaryPointsRef = useRef(
    Array.from({ length: PASCAL_WATER_ROBOT_SCREEN_REVEAL_CLIP_SEGMENTS }, () => new Vector3()),
  )
  const cameraPositionRef = useRef(new Vector3())
  const robotVisualRootRef = useRef(new Vector3())
  const robotVisualBoundsRef = useRef(new Box3())
  const robotVisualBoundsCenterRef = useRef(new Vector3())
  const robotVisualBoundsCornersRef = useRef(Array.from({ length: 8 }, () => new Vector3()))
  const robotBaseRef = useRef(new Vector3())
  const robotHeadRef = useRef(new Vector3())
  const robotCenterRef = useRef(new Vector3())
  const robotNdcRef = useRef(new Vector3())
  const revealScreenRef = useRef({ x: 0, y: 0 })
  const hoverAmountRef = useRef(0)
  const rendererClippingRef = useRef<{
    localClippingEnabled?: boolean
    renderer: { localClippingEnabled?: boolean }
  } | null>(null)

  const restoreClipping = useCallback(() => {
    clearLandrushRobotScreenRevealMask()
    for (const [object, state] of objectStatesRef.current) {
      restorePascalWaterRevealObjectState(object, state)
    }
    objectStatesRef.current.clear()
    activeObjectsRef.current.clear()
    for (const [material, state] of materialStatesRef.current) {
      material.clippingPlanes = state.clippingPlanes
      material.clipIntersection = state.clipIntersection
      material.needsUpdate = true
    }
    materialStatesRef.current.clear()
    activeMaterialsRef.current.clear()
    const rendererState = rendererClippingRef.current
    if (rendererState) {
      rendererState.renderer.localClippingEnabled = rendererState.localClippingEnabled
      rendererClippingRef.current = null
    }
    revealActiveRef.current = false
  }, [])

  useEffect(() => restoreClipping, [restoreClipping])

  useFrame(({ clock }, delta) => {
    if (!visible) {
      hoverAmountRef.current = 0
      if (revealActiveRef.current) restoreClipping()
      return
    }

    const motion = motionRef.current
    const width = gl.domElement.clientWidth
    const height = gl.domElement.clientHeight
    if (!motion || width <= 0 || height <= 0) {
      if (revealActiveRef.current) restoreClipping()
      return
    }

    const renderer = gl as unknown as {
      backend?: { device?: unknown }
      constructor?: { name?: string }
      isWebGPURenderer?: boolean
      isWebGLRenderer?: boolean
      localClippingEnabled?: boolean
    }
    const revealPath = resolvePascalWaterRevealClippingPath(renderer)
    if (revealPath === 'none') {
      if (revealActiveRef.current) restoreClipping()
      return
    }

    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      presentationMode === 'hover' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      Math.min(delta, 0.05),
    )
    const visualRoot = visualRootRef.current
    visualRoot?.updateWorldMatrix(true, true)
    const robotVisualRoot = visualRoot
      ? robotVisualRootRef.current.setFromMatrixPosition(visualRoot.matrixWorld)
      : null
    const robotScreenBounds = visualRoot
      ? projectPascalWaterObjectScreenBounds({
          bounds: robotVisualBoundsRef.current,
          camera,
          corners: robotVisualBoundsCornersRef.current,
          height,
          object: visualRoot,
          width,
        })
      : null
    const robotVisualY =
      robotVisualRoot?.y ??
      motion.position.y + resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    const robotX = robotVisualRoot?.x ?? motion.position.x
    const robotZ = robotVisualRoot?.z ?? motion.position.z
    const robotPoint = { x: robotX, z: robotZ }
    if (clock.elapsedTime - lastRefreshAtRef.current > 0.35) {
      lastRefreshAtRef.current = clock.elapsedTime
      occludersRef.current = collectPascalWaterRobotRevealOccluders(scene, robotPoint)
      materialsRef.current = collectPascalWaterRobotRevealMaterials(occludersRef.current)
    }
    const robotBase = robotBaseRef.current.set(
      robotX,
      robotVisualY + PASCAL_WATER_ROBOT_SCREEN_REVEAL_BASE_HEIGHT,
      robotZ,
    )
    const robotHead = robotHeadRef.current.set(
      robotX,
      robotVisualY + PASCAL_WATER_ROBOT_SCREEN_REVEAL_HEAD_HEIGHT,
      robotZ,
    )
    const robotCenter = robotScreenBounds
      ? robotVisualBoundsRef.current.getCenter(robotVisualBoundsCenterRef.current)
      : robotCenterRef.current
          .copy(robotBase)
          .lerp(robotHead, PASCAL_WATER_ROBOT_SCREEN_REVEAL_CENTER_BIAS)
    const robotNdc = robotNdcRef.current.copy(robotCenter).project(camera)
    if (robotNdc.z < -1 || robotNdc.z > 1) {
      if (revealActiveRef.current) restoreClipping()
      return
    }

    const baseScreen = projectPascalWaterScreenPoint(robotBase.project(camera), width, height)
    const headScreen = projectPascalWaterScreenPoint(robotHead.project(camera), width, height)
    const projectedCenterScreen = projectPascalWaterScreenPoint(robotNdc, width, height)
    const robotScreen = robotScreenBounds
      ? { x: robotScreenBounds.centerX, y: robotScreenBounds.centerY }
      : projectedCenterScreen
    const robotScreenInsideViewport =
      robotScreen.x >= 0 && robotScreen.x <= width && robotScreen.y >= 0 && robotScreen.y <= height
    const robotScreenHeight = robotScreenBounds
      ? Math.max(robotScreenBounds.width, robotScreenBounds.height)
      : Math.hypot(headScreen.x - baseScreen.x, headScreen.y - baseScreen.y)
    const baseRevealRadiusPx = Math.max(
      PASCAL_WATER_ROBOT_SCREEN_REVEAL_MIN_RADIUS_PX,
      robotScreenHeight * PASCAL_WATER_ROBOT_SCREEN_REVEAL_DIAMETER_SCALE * 0.5,
    )
    const revealRadiusPx = baseRevealRadiusPx
    const revealOuterRadiusPx =
      revealRadiusPx +
      baseRevealRadiusPx *
        (PASCAL_WATER_ROBOT_SCREEN_REVEAL_FEATHER_RADIUS_SCALE - 1) *
        PASCAL_WATER_ROBOT_SCREEN_REVEAL_FEATHER_EXPANSION_SCALE
    const revealScreen = revealScreenRef.current
    revealScreen.x = robotScreen.x
    revealScreen.y = robotScreen.y
    const revealClampMarginPx = Math.min(revealRadiusPx * 0.72, Math.min(width, height) * 0.45)
    const revealScreenClamped =
      presentationMode === 'hover' &&
      !robotScreenInsideViewport &&
      revealClampMarginPx < width * 0.5 &&
      revealClampMarginPx < height * 0.5
    if (revealScreenClamped) {
      const maxRevealY =
        height -
        Math.max(
          revealClampMarginPx,
          presentationMode === 'hover' ? PASCAL_WATER_ROBOT_SCREEN_REVEAL_HOVER_BOTTOM_SAFE_PX : 0,
        )
      revealScreen.x = MathUtils.clamp(
        revealScreen.x,
        revealClampMarginPx,
        width - revealClampMarginPx,
      )
      revealScreen.y = MathUtils.clamp(revealScreen.y, revealClampMarginPx, maxRevealY)
    }
    updateLandrushRobotScreenRevealMask({
      centerX: revealScreen.x,
      centerY: revealScreen.y,
      height,
      innerRadius: revealRadiusPx,
      outerRadius: revealOuterRadiusPx,
      width,
    })
    updatePascalWaterRobotRevealClippingPlanes({
      camera,
      cameraPosition: cameraPositionRef.current,
      height,
      ndcZ: robotNdc.z,
      planes: clippingPlanesRef.current,
      points: boundaryPointsRef.current,
      radiusPx: revealRadiusPx,
      robotCenter,
      robotScreen: revealScreen,
      width,
    })
    revealActiveRef.current = true
    const now = performance.now()
    if (now - lastProbeAtRef.current > 160) {
      lastProbeAtRef.current = now
      recordPascalWaterRevealProbe({
        mask: readLandrushRobotScreenRevealMaskSnapshot(),
        occluderCount: occludersRef.current.length,
        path: revealPath,
        presentationMode,
        radiusRatio: roundPerf(revealOuterRadiusPx / revealRadiusPx),
        robotNdc: [roundPerf(robotNdc.x), roundPerf(robotNdc.y), roundPerf(robotNdc.z)],
        projectedCenterScreen: [
          roundPerf(projectedCenterScreen.x),
          roundPerf(projectedCenterScreen.y),
        ],
        revealScreen: [roundPerf(revealScreen.x), roundPerf(revealScreen.y)],
        revealScreenClamped,
        robotScreenBounds: robotScreenBounds
          ? [
              roundPerf(robotScreenBounds.minX),
              roundPerf(robotScreenBounds.minY),
              roundPerf(robotScreenBounds.maxX),
              roundPerf(robotScreenBounds.maxY),
            ]
          : null,
        screenSource: robotScreenBounds ? 'visual-root-bounds' : 'visual-root-segment',
        robotScreen: [roundPerf(robotScreen.x), roundPerf(robotScreen.y)],
        robotScreenInsideViewport,
        softMaterialCount: materialsRef.current.filter(isPascalWaterSoftRevealMaterial).length,
      })
    }

    if (revealPath === 'object') {
      restorePascalWaterRevealMaterialClipping(materialStatesRef.current)
      applyPascalWaterRevealObjectClipping({
        activeObjects: activeObjectsRef.current,
        objectStates: objectStatesRef.current,
        objects: occludersRef.current,
        planes: clippingPlanesRef.current,
      })
      return
    }

    restorePascalWaterRevealObjectClipping(objectStatesRef.current)
    if (rendererClippingRef.current?.renderer !== renderer) {
      rendererClippingRef.current = {
        localClippingEnabled: renderer.localClippingEnabled,
        renderer,
      }
    }
    renderer.localClippingEnabled = true

    const activeMaterials = activeMaterialsRef.current
    activeMaterials.clear()
    for (const material of materialsRef.current) {
      activeMaterials.add(material)
      if (!materialStatesRef.current.has(material)) {
        materialStatesRef.current.set(material, {
          clipIntersection: material.clipIntersection,
          clippingPlanes: material.clippingPlanes,
        })
      }
      if (material.clippingPlanes !== clippingPlanesRef.current) {
        material.clippingPlanes = clippingPlanesRef.current
        material.needsUpdate = true
      }
      if (!material.clipIntersection) {
        material.clipIntersection = true
        material.needsUpdate = true
      }
    }
    for (const [material, state] of materialStatesRef.current) {
      if (activeMaterials.has(material)) continue
      material.clippingPlanes = state.clippingPlanes
      material.clipIntersection = state.clipIntersection
      material.needsUpdate = true
      materialStatesRef.current.delete(material)
    }
  }, 4)

  return null
}

function resolvePascalWaterRevealClippingPath(renderer: {
  backend?: { device?: unknown }
  constructor?: { name?: string }
  isWebGPURenderer?: boolean
  isWebGLRenderer?: boolean
  localClippingEnabled?: boolean
}): 'material' | 'none' | 'object' {
  if (
    renderer.isWebGPURenderer === true ||
    renderer.constructor?.name === 'WebGPURenderer' ||
    renderer.backend?.device
  ) {
    return 'object'
  }
  if (renderer.isWebGLRenderer === true && typeof renderer.localClippingEnabled === 'boolean') {
    return 'material'
  }
  return 'none'
}

function applyPascalWaterRevealObjectClipping({
  activeObjects,
  objectStates,
  objects,
  planes,
}: {
  activeObjects: Set<Object3D>
  objectStates: Map<Object3D, PascalWaterRevealObjectState>
  objects: readonly Object3D[]
  planes: Plane[]
}) {
  activeObjects.clear()
  for (const object of objects) {
    if (objectHasPascalWaterSoftRevealMaterial(object)) continue
    const target = resolvePascalWaterRevealClippingObject(object)
    if (!target) continue
    activeObjects.add(target)
    const clippingTarget = target as Object3D & {
      clipIntersection?: unknown
      clippingPlanes?: unknown
      clipShadows?: unknown
      enabled?: unknown
      isClippingGroup?: unknown
    }
    if (!objectStates.has(target)) {
      objectStates.set(target, {
        clipIntersection: clippingTarget.clipIntersection,
        clippingPlanes: clippingTarget.clippingPlanes,
        clipShadows: clippingTarget.clipShadows,
        enabled: clippingTarget.enabled,
        isClippingGroup: clippingTarget.isClippingGroup,
      })
    }
    clippingTarget.isClippingGroup = true
    clippingTarget.clippingPlanes = planes
    clippingTarget.enabled = true
    clippingTarget.clipIntersection = true
    clippingTarget.clipShadows = false
  }

  for (const [object, state] of objectStates) {
    if (activeObjects.has(object)) continue
    restorePascalWaterRevealObjectState(object, state)
    objectStates.delete(object)
  }
}

function restorePascalWaterRevealObjectClipping(
  objectStates: Map<Object3D, PascalWaterRevealObjectState>,
) {
  for (const [object, state] of objectStates) {
    restorePascalWaterRevealObjectState(object, state)
  }
  objectStates.clear()
}

function restorePascalWaterRevealObjectState(
  object: Object3D,
  state: PascalWaterRevealObjectState,
) {
  const target = object as Object3D & {
    clipIntersection?: unknown
    clippingPlanes?: unknown
    clipShadows?: unknown
    enabled?: unknown
    isClippingGroup?: unknown
  }
  restorePascalWaterOptionalProperty(target, 'isClippingGroup', state.isClippingGroup)
  restorePascalWaterOptionalProperty(target, 'clippingPlanes', state.clippingPlanes)
  restorePascalWaterOptionalProperty(target, 'enabled', state.enabled)
  restorePascalWaterOptionalProperty(target, 'clipIntersection', state.clipIntersection)
  restorePascalWaterOptionalProperty(target, 'clipShadows', state.clipShadows)
}

function restorePascalWaterOptionalProperty<
  Key extends 'clipIntersection' | 'clipShadows' | 'clippingPlanes' | 'enabled' | 'isClippingGroup',
>(target: Partial<Record<Key, unknown>>, key: Key, value: unknown) {
  if (value === undefined) {
    delete target[key]
    return
  }
  target[key] = value
}

function resolvePascalWaterRevealClippingObject(object: Object3D) {
  return (object as Object3D & { isGroup?: boolean }).isGroup === true ? object : null
}

function restorePascalWaterRevealMaterialClipping(
  materialStates: Map<Material, PascalWaterRevealMaterialState>,
) {
  for (const [material, state] of materialStates) {
    material.clippingPlanes = state.clippingPlanes
    material.clipIntersection = state.clipIntersection
    material.needsUpdate = true
  }
  materialStates.clear()
}

function updatePascalWaterRobotRevealClippingPlanes({
  camera,
  cameraPosition,
  height,
  ndcZ,
  planes,
  points,
  radiusPx,
  robotCenter,
  robotScreen,
  width,
}: {
  camera: Camera
  cameraPosition: Vector3
  height: number
  ndcZ: number
  planes: Plane[]
  points: Vector3[]
  radiusPx: number
  robotCenter: Vector3
  robotScreen: { x: number; y: number }
  width: number
}) {
  cameraPosition.setFromMatrixPosition(camera.matrixWorld)
  const centerNdcX = (robotScreen.x / width) * 2 - 1
  const centerNdcY = -(robotScreen.y / height) * 2 + 1
  const radiusNdcX = (radiusPx / width) * 2
  const radiusNdcY = (radiusPx / height) * 2

  for (let index = 0; index < planes.length; index += 1) {
    const angle = (index / planes.length) * Math.PI * 2
    points[index]
      ?.set(
        centerNdcX + Math.cos(angle) * radiusNdcX,
        centerNdcY + Math.sin(angle) * radiusNdcY,
        ndcZ,
      )
      .unproject(camera)
  }

  for (let index = 0; index < planes.length; index += 1) {
    const nextIndex = (index + 1) % planes.length
    const point = points[index]
    const nextPoint = points[nextIndex]
    const plane = planes[index]
    if (!point || !nextPoint || !plane) continue
    plane.setFromCoplanarPoints(cameraPosition, nextPoint, point)
    if (plane.distanceToPoint(robotCenter) > 0) plane.negate()
  }
}

function collectPascalWaterRobotRevealOccluders(scene: Object3D, robotPoint: LandrushPoint2) {
  const occluders = new Set<Object3D>()
  const registryByType = sceneRegistry.byType as Record<string, Set<string> | undefined>
  for (const type of PASCAL_WATER_ROBOT_REVEAL_OCCLUDER_NODE_TYPES) {
    const nodeIds = registryByType[type]
    if (!nodeIds) continue
    for (const nodeId of nodeIds) {
      if (shouldSkipPascalWaterRobotRevealOccluder(nodeId as AnyNodeId, robotPoint)) continue
      const object = sceneRegistry.nodes.get(nodeId as AnyNodeId)
      if (object) occluders.add(object)
    }
  }
  scene.traverse((object) => {
    if (object.userData?.landrushRobotOccluder === true) occluders.add(object)
  })
  return [...occluders]
}

function shouldSkipPascalWaterRobotRevealOccluder(nodeId: AnyNodeId, robotPoint: LandrushPoint2) {
  const node = useScene.getState().nodes[nodeId]
  if (!node) return false

  if (node.type === 'stair') {
    return pointInPascalWaterRevealStairFootprint(node, robotPoint)
  }

  if (node.type !== 'stair-segment') return false

  const parentId = (node as { parentId?: AnyNodeId | null }).parentId
  const parent = parentId ? useScene.getState().nodes[parentId] : null
  return parent?.type === 'stair' && pointInPascalWaterRevealStairFootprint(parent, robotPoint)
}

function pointInPascalWaterRevealStairFootprint(
  node: Extract<AnyNode, { type: 'stair' }>,
  point: LandrushPoint2,
) {
  const footprint = createPascalWaterBuildNodeFootprint(
    node,
    PASCAL_WATER_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS,
  )
  return Boolean(
    footprint &&
      pointInPolygonOrNearEdge(
        point,
        footprint,
        PASCAL_WATER_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS,
      ),
  )
}

function collectPascalWaterRobotRevealMaterials(occluders: readonly Object3D[]) {
  const materials = new Set<Material>()
  for (const object of occluders) {
    collectPascalWaterObjectMaterials(object, materials)
  }
  return [...materials]
}

function collectPascalWaterObjectMaterials(object: Object3D, materials: Set<Material>) {
  object.traverse((child) => {
    const mesh = child as { isMesh?: boolean; material?: unknown }
    if (!mesh.isMesh) return
    for (const material of getPascalWaterMaterials(mesh.material)) {
      materials.add(material)
    }
  })
}

function getPascalWaterMaterials(material: unknown): Material[] {
  if (Array.isArray(material)) return material.filter(isPascalWaterMaterial)
  return isPascalWaterMaterial(material) ? [material] : []
}

function isPascalWaterMaterial(material: unknown): material is Material {
  return Boolean(material && typeof material === 'object' && 'needsUpdate' in material)
}

function isPascalWaterSoftRevealMaterial(material: Material) {
  return material.userData?.landrushRobotScreenRevealSoftMask === true
}

function objectHasPascalWaterSoftRevealMaterial(object: Object3D) {
  let hasSoftRevealMaterial = false
  object.traverse((child) => {
    if (hasSoftRevealMaterial) return
    const material = (child as { material?: Material | Material[] }).material
    if (!material) return
    hasSoftRevealMaterial = getPascalWaterMaterials(material).some(isPascalWaterSoftRevealMaterial)
  })
  return hasSoftRevealMaterial
}

function projectPascalWaterObjectScreenBounds({
  bounds,
  camera,
  corners,
  height,
  object,
  width,
}: {
  bounds: Box3
  camera: Camera
  corners: Vector3[]
  height: number
  object: Object3D
  width: number
}): PascalWaterRobotScreenBounds | null {
  bounds.setFromObject(object)
  if (bounds.isEmpty()) return null

  const min = bounds.min
  const max = bounds.max
  corners[0]?.set(min.x, min.y, min.z)
  corners[1]?.set(max.x, min.y, min.z)
  corners[2]?.set(min.x, max.y, min.z)
  corners[3]?.set(max.x, max.y, min.z)
  corners[4]?.set(min.x, min.y, max.z)
  corners[5]?.set(max.x, min.y, max.z)
  corners[6]?.set(min.x, max.y, max.z)
  corners[7]?.set(max.x, max.y, max.z)

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let validCorners = 0

  for (const corner of corners) {
    const projected = corner.project(camera)
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      !Number.isFinite(projected.z)
    ) {
      continue
    }
    const screen = projectPascalWaterScreenPoint(projected, width, height)
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue
    minX = Math.min(minX, screen.x)
    minY = Math.min(minY, screen.y)
    maxX = Math.max(maxX, screen.x)
    maxY = Math.max(maxY, screen.y)
    validCorners += 1
  }

  if (validCorners === 0 || maxX <= minX || maxY <= minY) return null
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    height: maxY - minY,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX,
  }
}

function setPascalWaterGroupMaterialOpacity(group: Group, opacity: number) {
  group.visible = opacity > 0.002
  group.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material
    if (!material) return

    for (const candidate of getPascalWaterMaterials(material)) {
      const baseOpacity =
        typeof candidate.userData.pascalWaterBaseOpacity === 'number'
          ? candidate.userData.pascalWaterBaseOpacity
          : candidate.opacity
      candidate.userData.pascalWaterBaseOpacity = baseOpacity
      candidate.opacity = baseOpacity * opacity
      candidate.transparent = true
    }
  })
}

function projectPascalWaterScreenPoint(ndc: Vector3, width: number, height: number) {
  return {
    x: (ndc.x * 0.5 + 0.5) * width,
    y: (-ndc.y * 0.5 + 0.5) * height,
  }
}

const _pascalWaterScreenProjectionVector = new Vector3()
const _pascalWaterScreenProjectionPoint = new Vector2()
const _pascalWaterCameraPoseLookAtMatrix = new Matrix4()
const _pascalWaterCameraPoseUp = new Vector3(0, 1, 0)

function projectVectorToPascalWaterScreenPoint(
  point: Vector3,
  camera: Camera,
  viewport: { height: number; width: number },
) {
  const projected = _pascalWaterScreenProjectionVector.copy(point).project(camera)
  const screen = projectPascalWaterScreenPoint(projected, viewport.width, viewport.height)
  return _pascalWaterScreenProjectionPoint.set(screen.x, screen.y)
}

function distanceSqToPascalWaterScreenSegment(point: Vector2, start: Vector2, end: Vector2) {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSq = segmentX * segmentX + segmentY * segmentY
  if (segmentLengthSq <= Number.EPSILON) return point.distanceToSquared(start)
  const projectedAmount = MathUtils.clamp(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSq,
    0,
    1,
  )
  const closestX = start.x + segmentX * projectedAmount
  const closestY = start.y + segmentY * projectedAmount
  const dx = point.x - closestX
  const dy = point.y - closestY
  return dx * dx + dy * dy
}

function LocalPascalWaterRobot({
  baseNode,
  buildCameraPoseRef,
  cameraEnabled,
  grassInteractionRef,
  groundY,
  localMotionRef,
  localProfile,
  localRobotVisualRootRef,
  mapReturnCameraPoseRef,
  mobileJoystickRef,
  movementEnabled,
  navigationDebugEnabled,
  navigationLiveScenario,
  navigationLiveScenarioAutoRun,
  navigationLiveScenarioReady,
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
  localRobotVisualRootRef: { current: Group | null }
  mapReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  mobileJoystickRef: { current: MobileJoystickInput | null }
  movementEnabled: boolean
  navigationDebugEnabled: boolean
  navigationLiveScenario: PascalWaterNavigationLiveScenarioKind | null
  navigationLiveScenarioAutoRun: boolean
  navigationLiveScenarioReady: boolean
  onExitBuildMode: () => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: PascalWaterPerfRunOptions
  presentationMode: LandrushRobotPresentationMode
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  spawn: LandrushPoint2
  surfacePoints: readonly LandrushPoint2[]
}) {
  const { camera, gl } = useThree()
  const builtColliderWorlds = usePascalWaterBuiltColliderWorlds()
  const sceneNodesForNavigation = useScene((state) => (movementEnabled ? state.nodes : null))
  const pressedKeysRef = useRef(new Set<string>())
  const clickMoveTargetRef = useRef<PascalWaterMoveTarget | null>(null)
  const rightHoldMoveRef = useRef<PascalWaterRightHoldMove | null>(null)
  const physicsControllerRef = useRef<BVHEcctrlApi | null>(null)
  const physicsHeadingRef = useRef(0)
  const lastPhysicsPositionRef = useRef(new Vector3(spawn.x, groundY, spawn.z))
  const targetMotionPositionRef = useRef(new Vector3(spawn.x, groundY, spawn.z))
  const lastGrassProbeAtRef = useRef(0)
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
      [
        groundColliderMesh,
        builtColliderWorlds.collision?.mesh,
        builtColliderWorlds.floatOnly?.mesh,
      ].filter((mesh): mesh is Mesh => Boolean(mesh)),
    [builtColliderWorlds, groundColliderMesh],
  )
  const navigationObstacles = useMemo(
    () =>
      movementEnabled && sceneNodesForNavigation
        ? createPascalWaterNavigationObstacles(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const doorPortals = useMemo(
    () =>
      movementEnabled && sceneNodesForNavigation
        ? createPascalWaterDoorPortals(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const stairPortals = useMemo(
    () =>
      movementEnabled && sceneNodesForNavigation
        ? createPascalWaterStairPortals(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const nodeRef = useRef<LandrushWorldNode>(
    createPascalWaterRobotActorNode(baseNode, localProfile.id, spawn, groundY),
  )
  const [buildRobotHovered, setBuildRobotHovered] = useState(false)
  const [navigationDebugSnapshot, setNavigationDebugSnapshot] =
    useState<PascalWaterNavigationDebugSnapshot | null>(null)
  const motionRef = useRef<RobotMotion>({
    cameraSnapVersion: 0,
    heading: 0,
    isMoving: false,
    position: new Vector3(spawn.x, groundY, spawn.z),
    runRequested: false,
    speed: 0,
    velocity: new Vector3(),
  })
  const activeNavigationDebugRef = useRef<{
    kind: PascalWaterNavigationSteeringKind | 'manual' | null
    steeringPoint: LandrushPoint2 | null
  }>({ kind: null, steeringPoint: null })
  const navigationTraceRef = useRef<LandrushPoint2[]>([])
  const lastNavigationDebugAtRef = useRef(0)
  const navigationLiveScenarioRunRef = useRef<string | null>(null)
  const navigationLiveScenarioTimerRef = useRef<number | null>(null)
  const navigationLiveScenarioDefinition = useMemo(
    () =>
      navigationLiveScenario
        ? createPascalWaterNavigationLiveScenarioDefinition(spawn, navigationLiveScenario)
        : null,
    [navigationLiveScenario, spawn],
  )
  surfacePointsRef.current = surfacePoints

  useEffect(() => {
    if (presentationMode !== 'hover') setBuildRobotHovered(false)
  }, [presentationMode])

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
    motion.runRequested = false
    motion.speed = 0
    motion.cameraSnapVersion += 1
    physicsHeadingRef.current = 0
    lastPhysicsPositionRef.current.set(spawn.x, groundY, spawn.z)
    targetMotionPositionRef.current.set(spawn.x, groundY, spawn.z)
    navigationTraceRef.current = [{ x: spawn.x, z: spawn.z }]
    setNavigationDebugSnapshot(null)
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
    recordPascalWaterGrassProbe({
      centerLagMeters: 0,
      moving: false,
      physicsLagMeters: 0,
      position: [motion.position.x, motion.position.z],
      radius: PASCAL_WATER_ROBOT_GRASS_INTERACTION_RADIUS,
      source: 'reset-spawn',
      speed: 0,
      strength: PASCAL_WATER_ROBOT_GRASS_IDLE_BEND_STRENGTH,
    })
    writeMotionToPascalWaterRobotNode(nodeRef.current, motion)
    publishCurrentPlayerRef.current()
  }, [grassInteractionRef, groundY, spawn])

  const setupNavigationTestStart = useCallback(
    ({ label, start }: { label?: string; start: LandrushPoint2 & { y?: number } }) => {
      const startY = start.y ?? groundY
      const motion = motionRef.current
      motion.position.set(start.x, startY, start.z)
      motion.velocity.set(0, 0, 0)
      motion.isMoving = false
      motion.runRequested = false
      motion.speed = 0
      motion.cameraSnapVersion += 1
      lastPhysicsPositionRef.current.set(start.x, startY, start.z)
      targetMotionPositionRef.current.set(start.x, startY, start.z)
      navigationTraceRef.current = [{ x: start.x, z: start.z }]
      rightHoldMoveRef.current = null
      clickMoveTargetRef.current = null
      activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
      setNavigationDebugSnapshot(null)
      const physicsGroup = physicsControllerRef.current?.group
      if (physicsGroup) {
        physicsGroup.position.set(
          start.x,
          startY + PASCAL_WATER_ROBOT_PHYSICS_CENTER_FROM_ROOT,
          start.z,
        )
        physicsControllerRef.current?.resetLinVel()
        physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
      }
      if (typeof window !== 'undefined') {
        window.__PASCAL_WATER_NAV_LIVE_CAPTURE__ = {
          captures: [],
          scenario: navigationLiveScenario ?? 'room',
          startedAt: performance.now(),
        }
      }
      recordPascalWaterInputProbe({
        kind: 'nav-test-setup-start',
        label,
        start: [roundPerf(start.x), roundPerf(startY), roundPerf(start.z)],
      })
      writeMotionToPascalWaterRobotNode(nodeRef.current, motion)
      publishCurrentPlayerRef.current()
      return true
    },
    [groundY, navigationLiveScenario],
  )

  const startNavigationTestMove = useCallback(
    ({
      label,
      mode = 'direct',
      start,
      target,
    }: {
      label?: string
      mode?: 'direct' | 'stair-resolved'
      start: LandrushPoint2 & { y?: number }
      target: LandrushPoint2
    }) => {
      const resolvedTarget =
        mode === 'stair-resolved'
          ? resolvePascalWaterStairConnectorTarget(start, target, stairPortals)
          : target
      setupNavigationTestStart({ label, start })
      const motion = motionRef.current
      motion.heading = Math.atan2(resolvedTarget.x - start.x, resolvedTarget.z - start.z)
      physicsHeadingRef.current = motion.heading
      clickMoveTargetRef.current = { point: resolvedTarget }
      recordPascalWaterInputProbe({
        kind: 'nav-test-start-move',
        label,
        mode,
        resolvedTarget: [roundPerf(resolvedTarget.x), roundPerf(resolvedTarget.z)],
        target: [roundPerf(target.x), roundPerf(target.z)],
      })
      writeMotionToPascalWaterRobotNode(nodeRef.current, motion)
      publishCurrentPlayerRef.current()
      return true
    },
    [setupNavigationTestStart, stairPortals],
  )

  const projectNavigationTestPoint = useCallback(
    (point: LandrushPoint2 & { y?: number }) => {
      const canvas = gl.domElement
      const rect = canvas.getBoundingClientRect()
      const projected = new Vector3(point.x, point.y ?? groundY, point.z).project(camera)
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null
      const clientX = rect.left + ((projected.x + 1) / 2) * rect.width
      const clientY = rect.top + ((1 - projected.y) / 2) * rect.height
      return {
        clientX,
        clientY,
        visible:
          projected.z >= -1 &&
          projected.z <= 1 &&
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom,
      }
    },
    [camera, gl, groundY],
  )

  useEffect(() => {
    nodeRef.current = createPascalWaterRobotActorNode(baseNode, localProfile.id, spawn, groundY)
    resetToSpawn()
  }, [baseNode, groundY, localProfile.id, resetToSpawn, spawn])

  useEffect(() => {
    if (!navigationDebugEnabled && !navigationLiveScenario) return
    const bridge: PascalWaterNavigationTestBridge = {
      getState: () => ({
        doorPortals: doorPortals.map(clonePascalWaterDoorPortal),
        robot: {
          x: motionRef.current.position.x,
          y: motionRef.current.position.y,
          z: motionRef.current.position.z,
        },
        stairPortals: stairPortals.map(clonePascalWaterStairPortal),
      }),
      projectPoint: projectNavigationTestPoint,
      setupStart: setupNavigationTestStart,
      startMove: startNavigationTestMove,
    }
    window.__PASCAL_WATER_NAV_TEST__ = bridge
    return () => {
      if (window.__PASCAL_WATER_NAV_TEST__ === bridge) delete window.__PASCAL_WATER_NAV_TEST__
    }
  }, [
    doorPortals,
    navigationDebugEnabled,
    navigationLiveScenario,
    projectNavigationTestPoint,
    setupNavigationTestStart,
    stairPortals,
    startNavigationTestMove,
  ])

  useEffect(() => {
    if (movementEnabled) return
    pressedKeysRef.current.clear()
    mobileJoystickRef.current = null
    clickMoveTargetRef.current = null
    rightHoldMoveRef.current = null
    activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
    motionRef.current.runRequested = false
    physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
    physicsControllerRef.current?.resetLinVel()
  }, [mobileJoystickRef, movementEnabled])

  useEffect(() => {
    if (!navigationLiveScenario || !navigationLiveScenarioDefinition) {
      navigationLiveScenarioRunRef.current = null
      if (navigationLiveScenarioTimerRef.current !== null) {
        window.clearTimeout(navigationLiveScenarioTimerRef.current)
        navigationLiveScenarioTimerRef.current = null
      }
      if (typeof window !== 'undefined') delete window.__PASCAL_WATER_NAV_LIVE_CAPTURE__
      return
    }

    applyPascalWaterNavigationLiveScenarioNodes(navigationLiveScenarioDefinition.nodes)
    navigationTraceRef.current = [{ x: spawn.x, z: spawn.z }]
    if (typeof window !== 'undefined') {
      window.__PASCAL_WATER_NAV_LIVE_CAPTURE__ = {
        captures: [],
        scenario: navigationLiveScenario,
        startedAt: performance.now(),
      }
    }
    recordPascalWaterNavigationProbe({
      kind: 'nav-live-scenario-seeded',
      scenario: navigationLiveScenario,
    })
  }, [navigationLiveScenario, navigationLiveScenarioDefinition, spawn.x, spawn.z])

  useEffect(() => {
    if (
      !movementEnabled ||
      !navigationLiveScenario ||
      !navigationLiveScenarioAutoRun ||
      !navigationLiveScenarioDefinition ||
      !navigationLiveScenarioReady
    ) {
      return
    }

    const hasRequiredPortal =
      navigationLiveScenario === 'door' || navigationLiveScenario === 'room'
        ? doorPortals.some(
            (portal) => portal.doorId === PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_DOOR_ID,
          )
        : stairPortals.some(
            (portal) =>
              portal.nodeId === PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID ||
              portal.nodeId === PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_ID,
          )
    if (!hasRequiredPortal) return

    const target =
      navigationLiveScenario === 'stair'
        ? navigationLiveScenarioDefinition.stairTarget
        : navigationLiveScenarioDefinition.doorTarget
    const runKey = `${navigationLiveScenario}:${roundPerf(target.x)}:${roundPerf(target.z)}`
    if (
      navigationLiveScenarioRunRef.current === runKey ||
      navigationLiveScenarioTimerRef.current !== null
    ) {
      return
    }
    navigationLiveScenarioRunRef.current = runKey

    navigationLiveScenarioTimerRef.current = window.setTimeout(() => {
      navigationLiveScenarioTimerRef.current = null
      resetToSpawn()
      rightHoldMoveRef.current = null
      navigationTraceRef.current = [{ x: spawn.x, z: spawn.z }]
      const resolvedTarget =
        navigationLiveScenario === 'stair'
          ? resolvePascalWaterStairConnectorTarget({ x: spawn.x, z: spawn.z }, target, stairPortals)
          : target
      clickMoveTargetRef.current = { point: resolvedTarget }
      activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
      if (typeof window !== 'undefined') {
        window.__PASCAL_WATER_NAV_LIVE_CAPTURE__ = {
          captures: [],
          scenario: navigationLiveScenario,
          startedAt: performance.now(),
        }
      }
      recordPascalWaterInputProbe({
        kind: 'nav-live-scenario-target',
        scenario: navigationLiveScenario,
        target: [roundPerf(resolvedTarget.x), roundPerf(resolvedTarget.z)],
      })
    }, 750)
  }, [
    doorPortals,
    movementEnabled,
    navigationLiveScenario,
    navigationLiveScenarioAutoRun,
    navigationLiveScenarioDefinition,
    navigationLiveScenarioReady,
    resetToSpawn,
    spawn.x,
    spawn.z,
    stairPortals,
  ])

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
      if (
        event.defaultPrevented ||
        event.button !== 2 ||
        !pointerEventInPascalWaterCanvas(event, canvas) ||
        isPascalWaterInteractivePointerTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      clickMoveTargetRef.current = null
      rightHoldMoveRef.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
      }
      recordPascalWaterInputProbe({ kind: 'right-click-down' })
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
      const active = rightHoldMoveRef.current
      if (active?.id !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      rightHoldMoveRef.current = null
      const dragDistance = Math.hypot(active.x - active.startX, active.y - active.startY)
      if (dragDistance > PASCAL_WATER_RIGHT_CLICK_MOVE_CLICK_TOLERANCE_PX) {
        recordPascalWaterInputProbe({
          dragDistance: roundPerf(dragDistance),
          kind: 'right-click-hold-end',
        })
        return
      }

      const point = pickPascalWaterWalkTargetPoint({
        camera,
        canvas,
        colliderMeshes,
        event,
        groundY,
        pointerNdc: clickMovePointerNdc,
        raycaster: clickMoveRaycaster,
      })
      const start = {
        x: motionRef.current.position.x,
        z: motionRef.current.position.z,
      }
      const rawResolvedPoint = point
        ? resolvePascalWaterStairConnectorTarget(start, point, stairPortals)
        : null
      const resolvedPoint = rawResolvedPoint
        ? resolvePascalWaterWalkableNavigationTargetPoint(
            rawResolvedPoint,
            navigationObstacles,
            surfacePointsRef.current,
          )
        : null
      const accepted = Boolean(resolvedPoint)
      clickMoveTargetRef.current = accepted && resolvedPoint ? { point: resolvedPoint } : null
      recordPascalWaterInputProbe({
        accepted,
        dragDistance: roundPerf(dragDistance),
        kind: 'right-click-move-target',
        pickedTarget: point ? [roundPerf(point.x), roundPerf(point.z)] : null,
        rawTarget: rawResolvedPoint
          ? [roundPerf(rawResolvedPoint.x), roundPerf(rawResolvedPoint.z)]
          : null,
        target: resolvedPoint ? [roundPerf(resolvedPoint.x), roundPerf(resolvedPoint.z)] : null,
        targetAdjusted: Boolean(
          rawResolvedPoint &&
            resolvedPoint &&
            Math.hypot(resolvedPoint.x - rawResolvedPoint.x, resolvedPoint.z - rawResolvedPoint.z) >
              0.001,
        ),
      })
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (rightHoldMoveRef.current?.id === event.pointerId) {
        rightHoldMoveRef.current = null
      }
    }
    const handleContextMenu = (event: MouseEvent) => {
      if (!pointerEventInPascalWaterCanvas(event, canvas)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false })
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
    window.addEventListener('contextmenu', handleContextMenu, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerCancel, true)
      window.removeEventListener('contextmenu', handleContextMenu, true)
    }
  }, [
    camera,
    clickMovePointerNdc,
    clickMoveRaycaster,
    colliderMeshes,
    gl,
    groundY,
    movementEnabled,
    navigationObstacles,
    stairPortals,
  ])

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
            colliderMeshes,
            groundY,
            doorPortals,
            motion,
            navigationObstacles,
            pointer: rightHoldMoveRef.current,
            pointerNdc: clickMovePointerNdc,
            raycaster: clickMoveRaycaster,
            stairPortals,
            surfacePoints: surfacePointsRef.current,
          })
        : null
    const clickMovement =
      movementEnabled && !movement && !rightHoldMovement
        ? resolveClickMoveMovement(
            motion,
            clickMoveTargetRef,
            navigationObstacles,
            doorPortals,
            stairPortals,
            surfacePointsRef.current,
          )
        : null
    const activeMovement = movement ?? rightHoldMovement ?? clickMovement
    const physicsMovement = activeMovement
      ? resolvePascalWaterObstacleSlideMovement(
          { x: motion.position.x, z: motion.position.z },
          activeMovement,
          navigationObstacles,
        )
      : null
    activeNavigationDebugRef.current = activeMovement
      ? {
          kind: activeMovement.navigationKind ?? (movement ? 'manual' : null),
          steeringPoint: activeMovement.steeringPoint ?? null,
        }
      : { kind: null, steeringPoint: null }

    if (physicsMovement) {
      if (physicsMovement.doorId) {
        const openState = openPascalWaterDoor(physicsMovement.doorId)
        if (openState === 'started') {
          recordPascalWaterNavigationProbe({
            doorId: physicsMovement.doorId,
            kind: 'door-open-before-cross',
            steeringDistance: roundPerf(physicsMovement.steeringDistance ?? 0),
          })
        }
      }
      openApproachingPascalWaterDoorPortal(motion.position, physicsMovement, doorPortals)
      physicsHeadingRef.current = physicsMovement.heading
      const runRequested = isRunPressed(pressedKeysRef.current) || physicsMovement.runAmount > 0.5
      motion.runRequested = runRequested
      physicsControllerRef.current?.setMovement({
        run: runRequested,
        speedScale: physicsMovement.intensity,
        worldDirection: { x: physicsMovement.x, z: physicsMovement.z },
      })
      return
    }

    motion.runRequested = false
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
    const now = window.performance.now()
    const grassInteraction = {
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
    grassInteractionRef.current = grassInteraction
    if (now - lastGrassProbeAtRef.current >= 250) {
      lastGrassProbeAtRef.current = now
      recordPascalWaterGrassProbe({
        centerLagMeters: Math.hypot(
          grassInteraction.x - motion.position.x,
          grassInteraction.z - motion.position.z,
        ),
        moving: motion.isMoving,
        physicsLagMeters: Math.hypot(
          motion.position.x - constrained.x,
          motion.position.z - constrained.z,
        ),
        position: [motion.position.x, motion.position.z],
        radius: grassInteraction.radius,
        source: 'local-robot',
        speed: grassInteraction.speed,
        strength: grassInteraction.strength,
      })
    }

    if (navigationDebugEnabled) {
      const trace = navigationTraceRef.current
      const lastTracePoint = trace.at(-1)
      if (
        !lastTracePoint ||
        Math.hypot(lastTracePoint.x - motion.position.x, lastTracePoint.z - motion.position.z) >=
          0.04
      ) {
        trace.push({ x: motion.position.x, z: motion.position.z })
        if (trace.length > PASCAL_WATER_NAVIGATION_DEBUG_TRACE_POINTS) {
          trace.splice(0, trace.length - PASCAL_WATER_NAVIGATION_DEBUG_TRACE_POINTS)
        }
      }

      if (now - lastNavigationDebugAtRef.current >= PASCAL_WATER_NAVIGATION_DEBUG_UPDATE_MS) {
        lastNavigationDebugAtRef.current = now
        const snapshot = createPascalWaterNavigationDebugSnapshot({
          active: activeNavigationDebugRef.current,
          clickTarget: clickMoveTargetRef.current,
          doorPortals,
          navigationObstacles,
          robot: { x: motion.position.x, y: motion.position.y, z: motion.position.z },
          stairPortals,
          trace,
        })
        setNavigationDebugSnapshot(snapshot)
        window.__PASCAL_WATER_NAV_DEBUG__ = snapshot
        if (
          navigationLiveScenario &&
          window.__PASCAL_WATER_NAV_LIVE_CAPTURE__?.scenario === navigationLiveScenario
        ) {
          const capture = window.__PASCAL_WATER_NAV_LIVE_CAPTURE__
          capture.captures.push({
            elapsedMs: roundPerf(now - capture.startedAt),
            snapshot,
          })
          if (capture.captures.length > 360) {
            capture.captures.splice(0, capture.captures.length - 360)
          }
        }
        recordPascalWaterNavigationProbe({
          crossing: snapshot.crossing
            ? {
                center: [
                  roundPerf(snapshot.crossing.center.x),
                  roundPerf(snapshot.crossing.center.z),
                ],
                entry: [roundPerf(snapshot.crossing.entry.x), roundPerf(snapshot.crossing.entry.z)],
                exit: [roundPerf(snapshot.crossing.exit.x), roundPerf(snapshot.crossing.exit.z)],
                kind: snapshot.crossing.kind,
                phase: snapshot.crossing.phase,
              }
            : null,
          kind: 'nav-debug-snapshot',
          movementKind: snapshot.kind,
          robot: [
            roundPerf(snapshot.robot.x),
            roundPerf(snapshot.robot.y),
            roundPerf(snapshot.robot.z),
          ],
          steeringPoint: snapshot.steeringPoint
            ? [roundPerf(snapshot.steeringPoint.x), roundPerf(snapshot.steeringPoint.z)]
            : null,
          target: snapshot.target
            ? [roundPerf(snapshot.target.x), roundPerf(snapshot.target.z)]
            : null,
        })
      }
    } else if (navigationDebugSnapshot) {
      setNavigationDebugSnapshot(null)
    }

    writeMotionToPascalWaterRobotNode(nodeRef.current, motion)

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
          mapReturnCameraPoseRef={mapReturnCameraPoseRef}
          motionRef={motionRef}
          playerCameraPoseRef={playerCameraPoseRef}
          playerReturnCameraPoseRef={playerReturnCameraPoseRef}
        />
      ) : null}
      <Suspense
        fallback={
          presentationMode === 'hover' ? null : (
            <PascalWaterRobotNodePrimitiveActor
              color={localProfile.color}
              node={nodeRef.current}
              presentationMode={presentationMode}
            />
          )
        }
      >
        <LandrushRobot
          framePriority={PASCAL_WATER_LOCAL_ROBOT_FRAME_PRIORITY}
          hoverOutlineWidthScale={buildRobotHovered ? 2 : 1}
          node={nodeRef.current}
          onAnimationState={recordPascalWaterRobotAnimationProbe}
          onHoverPoseSample={recordPascalWaterRobotHoverPoseProbe}
          presentationMode={presentationMode}
          visualRootRef={localRobotVisualRootRef}
        />
      </Suspense>
      <LandrushRobotFootstepAudio
        groundY={groundY}
        motionRef={motionRef}
        runSpeed={PASCAL_WATER_ROBOT_RUN_SPEED}
        walkSpeed={PASCAL_WATER_ROBOT_WALK_SPEED}
      />
      <PascalWaterRobotPlayerBeacon
        color={localProfile.color}
        framePriority={PASCAL_WATER_LOCAL_BEACON_FRAME_PRIORITY}
        node={nodeRef.current}
        presentationMode={presentationMode}
        visualRootRef={localRobotVisualRootRef}
      />
      <PascalWaterBuildRobotExitHotspot
        motionRef={motionRef}
        onExitBuildMode={onExitBuildMode}
        onHoverChange={setBuildRobotHovered}
        visible={presentationMode === 'hover'}
      />
      <PascalWaterNavigationDebugOverlay
        enabled={navigationDebugEnabled}
        snapshot={navigationDebugSnapshot}
      />
    </>
  )
}

function createPascalWaterNavigationDebugSnapshot({
  active,
  clickTarget,
  doorPortals,
  navigationObstacles,
  robot,
  stairPortals,
  trace,
}: {
  active: {
    kind: PascalWaterNavigationSteeringKind | 'manual' | null
    steeringPoint: LandrushPoint2 | null
  }
  clickTarget: PascalWaterMoveTarget | null
  doorPortals: readonly PascalWaterDoorPortal[]
  navigationObstacles: readonly PascalWaterNavigationObstacle[]
  robot: PascalWaterNavigationDebugRobotPoint
  stairPortals: readonly PascalWaterStairPortal[]
  trace: readonly LandrushPoint2[]
}): PascalWaterNavigationDebugSnapshot {
  return {
    crossing: clickTarget?.route?.doorCrossing
      ? clonePascalWaterDoorCrossingState(clickTarget.route.doorCrossing)
      : null,
    doorPortals: doorPortals.map(clonePascalWaterDoorPortal),
    kind: active.kind,
    obstacles: navigationObstacles.map(clonePascalWaterNavigationObstacle),
    robot: clonePascalWaterNavigationDebugRobotPoint(robot),
    stairPortals: stairPortals.map(clonePascalWaterStairPortal),
    steeringPoint: active.steeringPoint ? clonePoint2(active.steeringPoint) : null,
    target: clickTarget ? clonePoint2(clickTarget.point) : null,
    trace: trace.map(clonePoint2),
  }
}

function clonePascalWaterNavigationDebugRobotPoint(
  point: PascalWaterNavigationDebugRobotPoint,
): PascalWaterNavigationDebugRobotPoint {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
  }
}

function clonePascalWaterNavigationObstacle(
  obstacle: PascalWaterNavigationObstacle,
): PascalWaterNavigationObstacle {
  return {
    kind: obstacle.kind,
    nodeId: obstacle.nodeId,
    points: obstacle.points.map(clonePoint2),
  }
}

function clonePascalWaterDoorPortal(portal: PascalWaterDoorPortal): PascalWaterDoorPortal {
  return {
    center: clonePoint2(portal.center),
    doorId: portal.doorId,
    halfWidth: portal.halfWidth,
    normal: clonePoint2(portal.normal),
    sideA: clonePoint2(portal.sideA),
    sideB: clonePoint2(portal.sideB),
    tangent: clonePoint2(portal.tangent),
  }
}

function clonePascalWaterStairPortal(portal: PascalWaterStairPortal): PascalWaterStairPortal {
  return {
    center: clonePoint2(portal.center),
    halfRun: portal.halfRun,
    halfWidth: portal.halfWidth,
    nodeId: portal.nodeId,
    normal: clonePoint2(portal.normal),
    sideA: clonePoint2(portal.sideA),
    sideB: clonePoint2(portal.sideB),
    tangent: clonePoint2(portal.tangent),
  }
}

function createPascalWaterNavigationLiveScenarioDefinition(
  spawn: LandrushPoint2,
  scenario: PascalWaterNavigationLiveScenarioKind,
) {
  if (scenario === 'room') {
    const doorX = spawn.x + 7
    const doorZ = spawn.z + 3
    const roomDepth = 6
    const roomHalfWidth = 6
    const roomEastX = doorX + roomDepth
    const roomSouthZ = doorZ - roomHalfWidth
    const roomNorthZ = doorZ + roomHalfWidth
    const nodes: AnyNode[] = [
      {
        backSide: 'unknown',
        children: [PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_DOOR_ID],
        frontSide: 'unknown',
        height: 2.5,
        id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: PASCAL_WATER_LEVEL_ID,
        start: [doorX, roomSouthZ],
        end: [doorX, roomNorthZ],
        thickness: 0.2,
        type: 'wall',
        visible: true,
      } as AnyNode,
      {
        backSide: 'unknown',
        children: [],
        frontSide: 'unknown',
        height: 2.5,
        id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_ROOM_EAST_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: PASCAL_WATER_LEVEL_ID,
        start: [roomEastX, roomSouthZ],
        end: [roomEastX, roomNorthZ],
        thickness: 0.2,
        type: 'wall',
        visible: true,
      } as AnyNode,
      {
        backSide: 'unknown',
        children: [],
        frontSide: 'unknown',
        height: 2.5,
        id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_ROOM_SOUTH_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: PASCAL_WATER_LEVEL_ID,
        start: [doorX, roomSouthZ],
        end: [roomEastX, roomSouthZ],
        thickness: 0.2,
        type: 'wall',
        visible: true,
      } as AnyNode,
      {
        backSide: 'unknown',
        children: [],
        frontSide: 'unknown',
        height: 2.5,
        id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_ROOM_NORTH_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: PASCAL_WATER_LEVEL_ID,
        start: [doorX, roomNorthZ],
        end: [roomEastX, roomNorthZ],
        thickness: 0.2,
        type: 'wall',
        visible: true,
      } as AnyNode,
      {
        archHeight: 0.45,
        contentPadding: [0.04, 0.04],
        cornerRadius: 0.15,
        doorCloser: false,
        doorCategory: 'interior',
        doorType: 'hinged',
        frameDepth: 0.07,
        frameThickness: 0.05,
        garagePanelCount: 4,
        handle: true,
        handleHeight: 1.05,
        handleSide: 'right',
        height: 2.1,
        hingesSide: 'left',
        id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_DOOR_ID,
        leafCount: 1,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        openingKind: 'door',
        openingRadiusMode: 'all',
        openingRevealRadius: 0.025,
        openingShape: 'rectangle',
        openingTopRadii: [0.15, 0.15],
        operationState: 0,
        panicBar: false,
        panicBarHeight: 1,
        parentId: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID,
        position: [roomHalfWidth, 1.05, 0],
        rotation: [0, 0, 0],
        segments: [
          {
            columnRatios: [1],
            dividerThickness: 0.03,
            heightRatio: 0.4,
            panelDepth: 0.01,
            panelInset: 0.04,
            type: 'panel',
          },
          {
            columnRatios: [1],
            dividerThickness: 0.03,
            heightRatio: 0.6,
            panelDepth: 0.01,
            panelInset: 0.04,
            type: 'panel',
          },
        ],
        slideDirection: 'left',
        swingAngle: 0,
        swingDirection: 'inward',
        threshold: true,
        thresholdHeight: 0.02,
        trackStyle: 'none',
        type: 'door',
        visible: true,
        wallId: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID,
        width: 1.4,
      } as AnyNode,
    ]

    return {
      doorTarget: { x: doorX + 3.2, z: doorZ },
      nodes,
      stairTarget: { x: doorX + 3.2, z: doorZ },
    }
  }

  const doorX = spawn.x + 2.6
  const doorZ = spawn.z
  const wallHalfLength = 3
  const stairX = spawn.x - 1.8
  const stairZ = spawn.z + 2.8
  const nodes: AnyNode[] = [
    {
      backSide: 'unknown',
      children: [PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_DOOR_ID],
      frontSide: 'unknown',
      height: 2.5,
      id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      parentId: PASCAL_WATER_LEVEL_ID,
      start: [doorX, doorZ - wallHalfLength],
      end: [doorX, doorZ + wallHalfLength],
      thickness: 0.2,
      type: 'wall',
      visible: true,
    } as AnyNode,
    {
      archHeight: 0.45,
      contentPadding: [0.04, 0.04],
      cornerRadius: 0.15,
      doorCloser: false,
      doorCategory: 'interior',
      doorType: 'hinged',
      frameDepth: 0.07,
      frameThickness: 0.05,
      garagePanelCount: 4,
      handle: true,
      handleHeight: 1.05,
      handleSide: 'right',
      height: 2.1,
      hingesSide: 'left',
      id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_DOOR_ID,
      leafCount: 1,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      openingKind: 'door',
      openingRadiusMode: 'all',
      openingRevealRadius: 0.025,
      openingShape: 'rectangle',
      openingTopRadii: [0.15, 0.15],
      operationState: 0,
      panicBar: false,
      panicBarHeight: 1,
      parentId: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID,
      position: [wallHalfLength, 1.05, 0],
      rotation: [0, 0, 0],
      segments: [
        {
          columnRatios: [1],
          dividerThickness: 0.03,
          heightRatio: 0.4,
          panelDepth: 0.01,
          panelInset: 0.04,
          type: 'panel',
        },
        {
          columnRatios: [1],
          dividerThickness: 0.03,
          heightRatio: 0.6,
          panelDepth: 0.01,
          panelInset: 0.04,
          type: 'panel',
        },
      ],
      slideDirection: 'left',
      swingAngle: 0,
      swingDirection: 'inward',
      threshold: true,
      thresholdHeight: 0.02,
      trackStyle: 'none',
      type: 'door',
      visible: true,
      wallId: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_WALL_ID,
      width: 1,
    } as AnyNode,
    {
      children: [PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID],
      fillToFloor: true,
      fromLevelId: null,
      id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_ID,
      innerRadius: 0.9,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      openingOffset: 0,
      parentId: PASCAL_WATER_LEVEL_ID,
      position: [stairX, 0, stairZ],
      railingHeight: 0.92,
      railingMode: 'none',
      rotation: 0,
      showCenterColumn: true,
      showStepSupports: true,
      slabOpeningMode: 'none',
      stairType: 'straight',
      stepCount: 6,
      sweepAngle: Math.PI / 2,
      thickness: 0.25,
      toLevelId: null,
      topLandingDepth: 0.1,
      topLandingMode: 'none',
      totalRise: 0.8,
      type: 'stair',
      visible: true,
      width: 1.2,
    } as AnyNode,
    {
      attachmentSide: 'front',
      fillToFloor: true,
      height: 0.8,
      id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID,
      length: 3,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      parentId: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_ID,
      position: [0, 0, 0],
      rotation: 0,
      segmentType: 'stair',
      stepCount: 6,
      thickness: 0.25,
      type: 'stair-segment',
      visible: true,
      width: 1.2,
    } as AnyNode,
    {
      autoFromWalls: false,
      elevation: 0.8,
      holeMetadata: [],
      holes: [],
      id: PASCAL_WATER_NAVIGATION_LIVE_SCENARIO_STAIR_TOP_SLAB_ID,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      parentId: PASCAL_WATER_LEVEL_ID,
      polygon: [
        [stairX - 2.2, stairZ + 3.08],
        [stairX + 2.2, stairZ + 3.08],
        [stairX + 2.2, stairZ + 5.4],
        [stairX - 2.2, stairZ + 5.4],
      ],
      type: 'slab',
      visible: true,
    } as AnyNode,
  ]

  return {
    doorTarget: { x: spawn.x + 5.2, z: doorZ },
    nodes,
    stairTarget: { x: stairX, z: stairZ + 3.4 },
  }
}

function applyPascalWaterNavigationLiveScenarioNodes(nodes: readonly AnyNode[]) {
  const scene = useScene.getState()
  const incomingIds = new Set(nodes.map((node) => node.id as AnyNodeId))
  const deleteIds = Object.values(scene.nodes)
    .filter((node) => {
      const metadata = node.metadata as { landrushNavigationLiveScenario?: boolean } | undefined
      return metadata?.landrushNavigationLiveScenario === true && !incomingIds.has(node.id)
    })
    .map((node) => node.id as AnyNodeId)
  const create: { node: AnyNode; parentId?: AnyNodeId }[] = []
  const update: { id: AnyNodeId; data: Partial<AnyNode> }[] = []

  for (const node of nodes) {
    const id = node.id as AnyNodeId
    if (scene.nodes[id]) {
      update.push({ data: node, id })
    } else {
      create.push({
        node,
        parentId: (node.parentId as AnyNodeId | null | undefined) ?? undefined,
      })
    }
  }

  if (create.length === 0 && update.length === 0 && deleteIds.length === 0) return
  scene.applyNodeChanges({ create, delete: deleteIds, update })
  renderScheduler.requestFrame('geometry:changed')
}

function PascalWaterNavigationDebugOverlay({
  enabled,
  snapshot,
}: {
  enabled: boolean
  snapshot: PascalWaterNavigationDebugSnapshot | null
}) {
  if (!enabled || !snapshot) return null

  const width = 430
  const height = 320
  const padding = 24
  const project = createPascalWaterNavigationDebugProjector(snapshot, width, height, padding)
  const tracePoints = svgPoints(snapshot.trace, project)
  const crossingRoute = snapshot.crossing
    ? svgPoints(
        [snapshot.crossing.entry, snapshot.crossing.center, snapshot.crossing.exit],
        project,
      )
    : ''

  return (
    <Html fullscreen prepend zIndexRange={[88, 0]}>
      <div className="pointer-events-none absolute left-4 bottom-4 z-[88] w-[430px] max-w-[calc(100vw-2rem)] rounded-md border border-slate-100/20 bg-slate-950/82 p-3 text-[10px] font-semibold text-slate-100 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span>nav plane</span>
          <span className="text-slate-300">
            {snapshot.kind ?? 'idle'} · x {roundPerf(snapshot.robot.x)} z{' '}
            {roundPerf(snapshot.robot.z)} y {roundPerf(snapshot.robot.y)}
          </span>
        </div>
        <svg
          className="h-[320px] w-full overflow-visible rounded bg-slate-900"
          viewBox={`0 0 ${width} ${height}`}
        >
          <rect fill="#0f172a" height={height} width={width} x={0} y={0} />
          {snapshot.obstacles.map((obstacle, index) => (
            <polygon
              fill={navigationDebugObstacleFill(obstacle.kind)}
              key={`obstacle-${obstacle.nodeId ?? index}-${index}`}
              points={svgPoints(obstacle.points, project)}
              stroke={navigationDebugObstacleStroke(obstacle.kind)}
              strokeWidth={1}
            />
          ))}
          {snapshot.doorPortals.map((portal, index) => {
            const sideA = project(portal.sideA)
            const sideB = project(portal.sideB)
            const center = project(portal.center)
            const left = project({
              x: portal.center.x - portal.tangent.x * portal.halfWidth,
              z: portal.center.z - portal.tangent.z * portal.halfWidth,
            })
            const right = project({
              x: portal.center.x + portal.tangent.x * portal.halfWidth,
              z: portal.center.z + portal.tangent.z * portal.halfWidth,
            })
            return (
              <g key={`door-${portal.doorId}-${index}`}>
                <line
                  stroke="#22d3ee"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  x1={sideA.x}
                  x2={sideB.x}
                  y1={sideA.y}
                  y2={sideB.y}
                />
                <line
                  stroke="#67e8f9"
                  strokeWidth={3}
                  x1={left.x}
                  x2={right.x}
                  y1={left.y}
                  y2={right.y}
                />
                <circle cx={center.x} cy={center.y} fill="#cffafe" r={3.5} />
              </g>
            )
          })}
          {snapshot.stairPortals.map((portal, index) => {
            const sideA = project(portal.sideA)
            const sideB = project(portal.sideB)
            const center = project(portal.center)
            return (
              <g key={`stair-${portal.nodeId}-${index}`}>
                <line
                  stroke="#c084fc"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  x1={sideA.x}
                  x2={sideB.x}
                  y1={sideA.y}
                  y2={sideB.y}
                />
                <circle cx={center.x} cy={center.y} fill="#f5d0fe" r={3.5} />
              </g>
            )
          })}
          {crossingRoute ? (
            <g>
              <polyline
                fill="none"
                points={crossingRoute}
                stroke="#fbbf24"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
              />
              <DebugPoint color="#22c55e" label="entry" point={project(snapshot.crossing!.entry)} />
              <DebugPoint
                color="#f59e0b"
                label="center"
                point={project(snapshot.crossing!.center)}
              />
              <DebugPoint color="#ef4444" label="exit" point={project(snapshot.crossing!.exit)} />
            </g>
          ) : null}
          {tracePoints ? (
            <polyline
              fill="none"
              points={tracePoints}
              stroke="#fb7185"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          ) : null}
          {snapshot.target ? (
            <DebugPoint color="#38bdf8" label="target" point={project(snapshot.target)} />
          ) : null}
          {snapshot.steeringPoint ? (
            <DebugPoint color="#f97316" label="steer" point={project(snapshot.steeringPoint)} />
          ) : null}
          <DebugPoint color="#ffffff" label="robot" point={project(snapshot.robot)} radius={5} />
        </svg>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-300">
          <span className="text-cyan-200">cyan: door portal</span>
          <span className="text-fuchsia-200">violet: stair portal</span>
          <span className="text-amber-200">yellow: entry-center-exit</span>
          <span className="text-rose-200">red: actual trace</span>
        </div>
      </div>
    </Html>
  )
}

function DebugPoint({
  color,
  label,
  point,
  radius = 4,
}: {
  color: string
  label: string
  point: { x: number; y: number }
  radius?: number
}) {
  return (
    <g>
      <circle cx={point.x} cy={point.y} fill={color} r={radius} stroke="#020617" strokeWidth={1} />
      <text
        fill={color}
        fontSize={10}
        paintOrder="stroke"
        stroke="#020617"
        strokeWidth={3}
        x={point.x + radius + 3}
        y={point.y - radius - 2}
      >
        {label}
      </text>
    </g>
  )
}

function createPascalWaterNavigationDebugProjector(
  snapshot: PascalWaterNavigationDebugSnapshot,
  width: number,
  height: number,
  padding: number,
) {
  const points = collectPascalWaterNavigationDebugPoints(snapshot)
  const bounds = boundsForPoints(points)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const spanX = Math.max(bounds.maxX - bounds.minX, 6)
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 6)
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ)
  const viewWidthMeters = (width - padding * 2) / scale
  const viewHeightMeters = (height - padding * 2) / scale
  const minX = centerX - viewWidthMeters / 2
  const minZ = centerZ - viewHeightMeters / 2

  return (point: LandrushPoint2) => ({
    x: padding + (point.x - minX) * scale,
    y: height - padding - (point.z - minZ) * scale,
  })
}

function collectPascalWaterNavigationDebugPoints(
  snapshot: PascalWaterNavigationDebugSnapshot,
): readonly LandrushPoint2[] {
  const points: LandrushPoint2[] = [snapshot.robot]
  if (snapshot.target) points.push(snapshot.target)
  if (snapshot.steeringPoint) points.push(snapshot.steeringPoint)
  points.push(...snapshot.trace)
  for (const obstacle of snapshot.obstacles) points.push(...obstacle.points)
  for (const portal of snapshot.doorPortals) {
    points.push(portal.center, portal.sideA, portal.sideB)
  }
  for (const portal of snapshot.stairPortals) {
    points.push(portal.center, portal.sideA, portal.sideB)
  }
  if (snapshot.crossing) {
    points.push(snapshot.crossing.entry, snapshot.crossing.center, snapshot.crossing.exit)
  }
  return points
}

function svgPoints(
  points: readonly LandrushPoint2[],
  project: (point: LandrushPoint2) => { x: number; y: number },
) {
  return points
    .map(project)
    .map((point) => `${roundPerf(point.x)},${roundPerf(point.y)}`)
    .join(' ')
}

function navigationDebugObstacleFill(kind: PascalWaterNavigationObstacle['kind']) {
  if (kind === 'stair') return 'rgba(168,85,247,0.18)'
  if (kind === 'asset') return 'rgba(148,163,184,0.14)'
  return 'rgba(100,116,139,0.2)'
}

function navigationDebugObstacleStroke(kind: PascalWaterNavigationObstacle['kind']) {
  if (kind === 'stair') return '#a855f7'
  if (kind === 'asset') return '#94a3b8'
  return '#64748b'
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
  const visualRootRef = useRef<Group | null>(null)

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
        <LandrushRobot
          framePriority={PASCAL_WATER_REMOTE_ROBOT_FRAME_PRIORITY}
          node={nodeRef.current}
          visualRootRef={visualRootRef}
        />
      </Suspense>
      <PascalWaterRobotPlayerBeacon
        color={player.color}
        framePriority={PASCAL_WATER_REMOTE_BEACON_FRAME_PRIORITY}
        node={nodeRef.current}
        visualRootRef={visualRootRef}
      />
    </>
  )
}

function PascalWaterMapCameraRig({
  active,
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  playerCameraPoseRef,
}: {
  active: boolean
  mapCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapTransitionStartPoseRef: { current: PascalWaterCameraPose | null }
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const controlsTarget = useMemo(() => new Vector3(...PASCAL_WATER_MAP_CAMERA_TARGET), [])
  const [controlsEnabled, setControlsEnabled] = useState(false)
  const transitionStartPose = mapTransitionStartPoseRef.current
  const initialPose = transitionStartPose ?? mapCameraPoseRef.current ?? playerCameraPoseRef.current
  const initialPosition = initialPose
    ? ([initialPose.position.x, initialPose.position.y, initialPose.position.z] as const)
    : PASCAL_WATER_MAP_CAMERA_POSITION
  const transitionUsesPerspectiveCamera = active && transitionStartPose !== null && !controlsEnabled
  const handleMapCameraSettled = useCallback(
    (pose: PascalWaterCameraPose) => {
      mapCameraPoseRef.current = clonePascalWaterCameraPose(pose)
      mapTransitionStartPoseRef.current = null
      setControlsEnabled(true)
    },
    [mapCameraPoseRef, mapTransitionStartPoseRef],
  )

  useEffect(() => {
    if (!active) setControlsEnabled(false)
  }, [active])

  useFrame((state) => {
    if (!active || !controlsEnabled) return

    const controls = getRobotWorldOrbitControls(state)
    if (controls) controlsTarget.copy(controls.target)
    writePascalWaterCameraPose(mapCameraPoseRef, state.camera, controls?.target ?? controlsTarget)
    recordPascalWaterCameraProbe({
      camera: state.camera,
      mode: 'map',
      source: 'map-camera',
      target: controls?.target ?? controlsTarget,
    })
  })

  return (
    <>
      {transitionUsesPerspectiveCamera ? (
        <>
          <PascalWaterPoseCamera
            fallbackPosition={initialPosition}
            fallbackTarget={PASCAL_WATER_MAP_CAMERA_TARGET}
            makeDefault={active}
            pose={initialPose}
          />
          {active ? <PascalWaterCameraPoseSeed pose={initialPose} /> : null}
        </>
      ) : (
        <>
          <PascalWaterMapCamera
            fallbackPosition={initialPosition}
            fallbackTarget={PASCAL_WATER_MAP_CAMERA_TARGET}
            makeDefault={active}
            pose={initialPose}
          />
          {active ? <PascalWaterCameraPoseSeed pose={initialPose} /> : null}
        </>
      )}
      {active && controlsEnabled ? (
        <OrbitControls
          dampingFactor={0.08}
          enableDamping
          enablePan
          enableRotate={false}
          enableZoom
          makeDefault
          maxDistance={PASCAL_WATER_MAP_CAMERA_MAX_DISTANCE}
          minDistance={PASCAL_WATER_MAP_CAMERA_MIN_DISTANCE}
          onChange={() => renderScheduler.requestFrame('camera:move')}
          onEnd={() => renderScheduler.requestFrame('camera:end')}
          onStart={() => renderScheduler.requestFrame('camera:start')}
          target={controlsTarget}
          zoomSpeed={0.0375}
        />
      ) : null}
      <PascalWaterMapCameraTransition
        active={active}
        controlsTarget={controlsTarget}
        mapCameraPoseRef={mapCameraPoseRef}
        mapTransitionStartPoseRef={mapTransitionStartPoseRef}
        onSettled={handleMapCameraSettled}
        playerCameraPoseRef={playerCameraPoseRef}
      />
    </>
  )
}

function PascalWaterMapCamera({
  fallbackPosition,
  fallbackTarget,
  makeDefault = true,
  pose,
}: {
  fallbackPosition: readonly [number, number, number]
  fallbackTarget: readonly [number, number, number]
  makeDefault?: boolean
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
      applyPascalWaterCameraPose(camera, initialPoseRef.current, fallbackTarget)
    },
    [fallbackTarget],
  )

  return (
    <PerspectiveCamera
      far={900}
      fov={48}
      makeDefault={makeDefault}
      near={0.1}
      onUpdate={handleUpdate}
      position={initialPositionRef.current}
    />
  )
}

function usePascalWaterExplicitCameraTransitionClock({
  active,
  onFrame,
  onInactive,
}: {
  active: boolean
  onFrame: (state: RootState, elapsedSeconds: number) => boolean
  onInactive: () => void
}) {
  const onFrameRef = useRef(onFrame)
  const onInactiveRef = useRef(onInactive)
  const settledRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)

  onFrameRef.current = onFrame
  onInactiveRef.current = onInactive

  useEffect(() => {
    if (!active) {
      settledRef.current = false
      startedAtRef.current = null
      onInactiveRef.current()
      return
    }

    settledRef.current = false
    startedAtRef.current = null
    renderScheduler.requestFrame('camera:start')
    return () => {
      settledRef.current = true
      startedAtRef.current = null
    }
  }, [active])

  useFrame((state) => {
    if (!active || settledRef.current) return

    renderScheduler.requestFrame('camera:move')
    startedAtRef.current ??= performance.now()
    const elapsedSeconds = Math.max(0, (performance.now() - startedAtRef.current) / 1000)
    const settled = onFrameRef.current(state, elapsedSeconds)
    if (!settled) return

    settledRef.current = true
    startedAtRef.current = null
  }, -1)
}

function createPascalWaterCameraPoseTransition({
  camera,
  startPosition,
  startTarget,
  targetPose,
}: {
  camera: Camera
  startPosition: Vector3
  startTarget: Vector3
  targetPose: PascalWaterCameraPose
}): PascalWaterCameraPoseTransition {
  const currentPosition = camera.position.clone()
  const currentQuaternion = camera.quaternion.clone()

  camera.position.copy(startPosition)
  camera.lookAt(startTarget)
  const startQuaternion = camera.quaternion.clone()

  camera.position.copy(targetPose.position)
  camera.lookAt(targetPose.target)
  const targetQuaternion = camera.quaternion.clone()

  camera.position.copy(currentPosition)
  camera.quaternion.copy(currentQuaternion)
  camera.updateMatrixWorld()

  return {
    elapsed: 0,
    startPosition: startPosition.clone(),
    startQuaternion,
    startTarget: startTarget.clone(),
    targetPose: clonePascalWaterCameraPose(targetPose) ?? targetPose,
    targetQuaternion,
  }
}

function stepPascalWaterCameraPoseTransition({
  camera,
  elapsedSeconds,
  mode,
  poseRef,
  source,
  target,
  transition,
}: {
  camera: Camera
  elapsedSeconds: number
  mode: PascalWaterRuntimeCameraSample['mode']
  poseRef: { current: PascalWaterCameraPose | null }
  source: string
  target: Vector3
  transition: PascalWaterCameraPoseTransition
}) {
  const nextElapsed = elapsedSeconds
  transition.elapsed =
    PASCAL_WATER_CAMERA_TRANSITION_SECONDS - nextElapsed <=
    PASCAL_WATER_CAMERA_TRANSITION_COMPLETION_EPSILON_SECONDS
      ? PASCAL_WATER_CAMERA_TRANSITION_SECONDS
      : nextElapsed
  const progress = clamp01(transition.elapsed / PASCAL_WATER_CAMERA_TRANSITION_SECONDS)
  const amount = easePascalWaterCameraTransition(progress, mode)
  camera.position.lerpVectors(transition.startPosition, transition.targetPose.position, amount)
  target.lerpVectors(transition.startTarget, transition.targetPose.target, amount)
  camera.quaternion.slerpQuaternions(
    transition.startQuaternion,
    transition.targetQuaternion,
    amount,
  )
  camera.updateMatrixWorld()

  writePascalWaterCameraPose(poseRef, camera, target)
  recordPascalWaterCameraProbe({
    camera,
    mode,
    progress,
    source,
    target,
  })

  return progress
}

function finishPascalWaterCameraPoseTransition({
  camera,
  poseRef,
  target,
  transition,
}: {
  camera: Camera
  poseRef: { current: PascalWaterCameraPose | null }
  target: Vector3
  transition: PascalWaterCameraPoseTransition
}) {
  camera.position.copy(transition.targetPose.position)
  target.copy(transition.targetPose.target)
  camera.quaternion.copy(transition.targetQuaternion)
  camera.updateMatrixWorld()
  writePascalWaterCameraPose(poseRef, camera, target)
}

function PascalWaterMapCameraTransition({
  active,
  controlsTarget,
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  onSettled,
  playerCameraPoseRef,
}: {
  active: boolean
  controlsTarget: Vector3
  mapCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapTransitionStartPoseRef: { current: PascalWaterCameraPose | null }
  onSettled: (pose: PascalWaterCameraPose) => void
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const settledRef = useRef(false)
  const startTargetRef = useRef(new Vector3())
  const desiredRef = useRef(new Vector3(...PASCAL_WATER_MAP_CAMERA_POSITION))
  const targetRef = useRef(new Vector3(...PASCAL_WATER_MAP_CAMERA_TARGET))
  const forwardRef = useRef(new Vector3())
  const transitionRef = useRef<PascalWaterCameraPoseTransition | null>(null)

  const resetTransition = useCallback(() => {
    settledRef.current = false
    transitionRef.current = null
  }, [])

  const stepTransition = useCallback(
    (state: RootState, elapsedSeconds: number) => {
      if (settledRef.current) return true

      renderScheduler.requestFrame('camera:move')
      state.camera.up.set(0, 1, 0)
      const target = targetRef.current
      let transition = transitionRef.current
      if (!transition) {
        const rememberedPose = mapTransitionStartPoseRef.current ?? playerCameraPoseRef.current
        const startPosition = rememberedPose?.position.clone() ?? state.camera.position.clone()
        const startTarget = rememberedPose
          ? rememberedPose.target.clone()
          : resolvePascalWaterBuildCameraStartTarget(
              state.camera,
              target.y,
              startTargetRef.current,
              forwardRef.current,
            ).clone()
        const currentPosition = state.camera.position.clone()
        const currentQuaternion = state.camera.quaternion.clone()
        state.camera.position.copy(desiredRef.current)
        state.camera.lookAt(target)
        const targetPose = createPascalWaterCameraPose(state.camera, target)
        state.camera.position.copy(currentPosition)
        state.camera.quaternion.copy(currentQuaternion)
        state.camera.updateMatrixWorld()

        transition = createPascalWaterCameraPoseTransition({
          camera: state.camera,
          startPosition,
          startTarget,
          targetPose,
        })
        transitionRef.current = transition
        controlsTarget.copy(startTarget)
        writePascalWaterCameraPose(mapCameraPoseRef, state.camera, controlsTarget)
      }

      const progress = stepPascalWaterCameraPoseTransition({
        camera: state.camera,
        elapsedSeconds,
        mode: 'map',
        poseRef: mapCameraPoseRef,
        source: 'map-transition',
        target: controlsTarget,
        transition,
      })

      if (progress < 1) return false

      finishPascalWaterCameraPoseTransition({
        camera: state.camera,
        poseRef: mapCameraPoseRef,
        target: controlsTarget,
        transition,
      })
      settledRef.current = true
      transitionRef.current = null
      const finalPose =
        clonePascalWaterCameraPose(mapCameraPoseRef.current) ??
        createPascalWaterCameraPose(state.camera, controlsTarget)
      onSettled(finalPose)
      renderScheduler.requestFrame('camera:end')
      return true
    },
    [controlsTarget, mapCameraPoseRef, mapTransitionStartPoseRef, onSettled, playerCameraPoseRef],
  )

  usePascalWaterExplicitCameraTransitionClock({
    active,
    onFrame: stepTransition,
    onInactive: resetTransition,
  })

  return null
}

function PascalWaterThirdPersonCameraRig({
  buildCameraPoseRef,
  controllerEnabled,
  mapReturnCameraPoseRef,
  motionRef,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  controllerEnabled: boolean
  mapReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
  motionRef: { current: RobotMotion }
  playerCameraPoseRef: { current: PascalWaterCameraPose | null }
  playerReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
}) {
  const initialPose =
    mapReturnCameraPoseRef.current ??
    buildCameraPoseRef.current ??
    playerReturnCameraPoseRef.current ??
    playerCameraPoseRef.current
  const initialPosition = initialPose
    ? ([initialPose.position.x, initialPose.position.y, initialPose.position.z] as const)
    : ([0, 4.5, -8.2] as const)
  const handleReturnSettled = useCallback(() => {
    mapReturnCameraPoseRef.current = null
  }, [mapReturnCameraPoseRef])

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
            mapReturnCameraPoseRef={mapReturnCameraPoseRef}
            motionRef={motionRef}
            onReturnSettled={handleReturnSettled}
            playerCameraPoseRef={playerCameraPoseRef}
            playerReturnCameraPoseRef={playerReturnCameraPoseRef}
          />
        </>
      ) : null}
    </>
  )
}

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
      const initialPose = initialPoseRef.current
      applyPascalWaterCameraPose(camera, initialPose, fallbackTarget)
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
  mapReturnCameraPoseRef,
  motionRef,
  onReturnSettled,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: PascalWaterCameraPose | null }
  mapReturnCameraPoseRef: { current: PascalWaterCameraPose | null }
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
  const pitchDragRef = useRef<{
    id: number
    pitch: number
    x: number
    y: number
    yaw: number
  } | null>(null)
  const desiredCameraPositionRef = useRef(new Vector3())
  const targetRef = useRef(new Vector3())
  const previousTargetRef = useRef<Vector3 | null>(null)
  const returnTargetRef = useRef(new Vector3())
  const returnForwardRef = useRef(new Vector3())
  const returnTransitionRef = useRef<PascalWaterCameraPoseTransition | null>(null)
  const returnTransitionRunningRef = useRef(false)
  const cameraMotionActiveRef = useRef(false)
  const snapVersionRef = useRef<number | null>(null)

  const setCameraMotionActive = useCallback((active: boolean) => {
    if (cameraMotionActiveRef.current === active) return
    cameraMotionActiveRef.current = active
    renderScheduler.requestFrame(active ? 'camera:start' : 'camera:end')
  }, [])

  useEffect(() => () => setCameraMotionActive(false), [setCameraMotionActive])

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
        x: event.clientX,
        y: event.clientY,
        yaw: targetCameraYawRef.current,
      }
    }
    const handlePointerMove = (event: PointerEvent) => {
      const drag = pitchDragRef.current
      if (!drag || drag.id !== event.pointerId) return

      event.preventDefault()
      const nextPitch =
        drag.pitch + (event.clientY - drag.y) * PASCAL_WATER_ISOMETRIC_CAMERA_PITCH_DRAG_SPEED
      const nextYaw =
        drag.yaw - (event.clientX - drag.x) * PASCAL_WATER_ISOMETRIC_CAMERA_YAW_DRAG_SPEED
      targetCameraYawRef.current = nextYaw
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

  const resetReturnTransition = useCallback(() => {
    returnTransitionRunningRef.current = false
    returnTransitionRef.current = null
  }, [])

  const stepReturnTransition = useCallback(
    (state: RootState, elapsedSeconds: number) => {
      state.camera.up.set(0, 1, 0)
      const motion = motionRef.current
      const target = targetRef.current.set(
        motion.position.x,
        motion.position.y + PASCAL_WATER_ROBOT_CAMERA_TARGET_HEIGHT,
        motion.position.z,
      )
      let transition = returnTransitionRef.current

      if (!transition) {
        const returnPose = playerReturnCameraPoseRef.current
        if (!returnPose) {
          returnTransitionRunningRef.current = false
          return true
        }

        const buildPose = clonePascalWaterCameraPose(
          mapReturnCameraPoseRef.current ?? buildCameraPoseRef.current,
        )
        const startTarget =
          buildPose?.target.clone() ??
          resolvePascalWaterBuildCameraStartTarget(
            state.camera,
            target.y,
            returnTargetRef.current,
            returnForwardRef.current,
          ).clone()
        const targetPose = mapReturnCameraPoseRef.current
          ? resolvePascalWaterPlayerReturnTargetPose(
              returnPose,
              target,
              desiredCameraPositionRef.current,
            )
          : (clonePascalWaterCameraPose(returnPose) ??
            createPascalWaterCameraPose(state.camera, target))

        transition = createPascalWaterCameraPoseTransition({
          camera: state.camera,
          startPosition: buildPose?.position.clone() ?? state.camera.position.clone(),
          startTarget,
          targetPose,
        })
        returnTransitionRef.current = transition
        returnTransitionRunningRef.current = true
        returnTargetRef.current.copy(transition.startTarget)
        state.camera.position.copy(transition.startPosition)
        state.camera.quaternion.copy(transition.startQuaternion)
        state.camera.updateMatrixWorld()
        writePascalWaterCameraPose(playerCameraPoseRef, state.camera, transition.startTarget)
      }

      renderScheduler.requestFrame('camera:move')
      const progress = stepPascalWaterCameraPoseTransition({
        camera: state.camera,
        elapsedSeconds,
        mode: 'player',
        poseRef: playerCameraPoseRef,
        source: 'player-return-transition',
        target: returnTargetRef.current,
        transition,
      })

      if (progress < 1) return false

      finishPascalWaterCameraPoseTransition({
        camera: state.camera,
        poseRef: playerCameraPoseRef,
        target: returnTargetRef.current,
        transition,
      })
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
      mapReturnCameraPoseRef.current = null
      playerReturnCameraPoseRef.current = null
      returnTransitionRef.current = null
      returnTransitionRunningRef.current = false
      onReturnSettled()
      renderScheduler.requestFrame('camera:end')
      return true
    },
    [
      buildCameraPoseRef,
      mapReturnCameraPoseRef,
      motionRef,
      onReturnSettled,
      playerCameraPoseRef,
      playerReturnCameraPoseRef,
    ],
  )

  const returnTransitionActive =
    playerReturnCameraPoseRef.current !== null || returnTransitionRunningRef.current

  usePascalWaterExplicitCameraTransitionClock({
    active: returnTransitionActive,
    onFrame: stepReturnTransition,
    onInactive: resetReturnTransition,
  })

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
    if (returnPose || returnTransitionRunningRef.current) {
      setCameraMotionActive(false)
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
      setCameraMotionActive(true)
      renderScheduler.requestFrame('camera:move')
      return
    }

    const followAmount = 1 - Math.exp(-PASCAL_WATER_ROBOT_CAMERA_FOLLOW_RESPONSE * frameDelta)
    const yawInput =
      Number(orbitKeysRef.current.counterClockwise) - Number(orbitKeysRef.current.clockwise)
    const targetShiftSq = previousTarget.distanceToSquared(target)
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
    const cameraShiftSq = state.camera.position.distanceToSquared(desiredCameraPosition)
    state.camera.position.lerp(desiredCameraPosition, followAmount)

    state.camera.lookAt(previousTarget)
    writePascalWaterCameraPose(playerCameraPoseRef, state.camera, previousTarget)
    const yawSettling = Math.abs(
      Math.atan2(
        Math.sin(cameraYawRef.current - targetCameraYawRef.current),
        Math.cos(cameraYawRef.current - targetCameraYawRef.current),
      ),
    )
    const pitchSettling = Math.abs(cameraPitchRef.current - targetCameraPitchRef.current)
    const activeCameraMotion =
      motion.isMoving ||
      yawInput !== 0 ||
      pitchDragRef.current !== null ||
      targetShiftSq > 0.000001 ||
      cameraShiftSq > 0.000001 ||
      yawSettling > 0.0001 ||
      pitchSettling > 0.0001
    setCameraMotionActive(activeCameraMotion)
    if (activeCameraMotion) renderScheduler.requestFrame('camera:move')
    recordPascalWaterCameraProbe({
      camera: state.camera,
      mode: 'player',
      source: 'player-camera',
      target: previousTarget,
    })
  }, 2)

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
  framePriority = 0,
  node,
  presentationMode = 'default',
  visualRootRef,
}: {
  color: string
  framePriority?: number
  node: LandrushWorldNode
  presentationMode?: LandrushRobotPresentationMode
  visualRootRef?: { current: Group | null }
}) {
  const meshRef = useRef<Mesh>(null!)
  const hoverAmountRef = useRef(0)
  const visualRootPositionRef = useRef(new Vector3())

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current
    const visualRoot = visualRootRef?.current
    if (visualRoot) {
      visualRoot.getWorldPosition(visualRootPositionRef.current)
      mesh.position.set(
        visualRootPositionRef.current.x,
        visualRootPositionRef.current.y + 2.28,
        visualRootPositionRef.current.z,
      )
      return
    }

    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      presentationMode === 'hover' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      Math.min(delta, 0.05),
    )
    const hoverOffset = resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    mesh.position.set(
      node.playerPosition[0],
      node.playerPosition[1] + hoverOffset + 2.28,
      node.playerPosition[2],
    )
  }, framePriority)

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
  onHoverChange,
  visible,
}: {
  motionRef: { current: RobotMotion }
  onExitBuildMode: () => void
  onHoverChange: (hovered: boolean) => void
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
  const hoverScreenPointer = useMemo(() => new Vector2(), [])
  const hoverScreenStart = useMemo(() => new Vector2(), [])
  const hoverScreenEnd = useMemo(() => new Vector2(), [])
  const hoverScreenMid = useMemo(() => new Vector3(), [])
  const hoverScreenRadiusPoint = useMemo(() => new Vector3(), [])
  const hoverScreenRight = useMemo(() => new Vector3(), [])
  const hoverAmountRef = useRef(0)
  const hoverOffsetRef = useRef(0)
  const hoveredRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const setHotspotHovered = useCallback(
    (nextHovered: boolean) => {
      if (hoveredRef.current === nextHovered) return
      hoveredRef.current = nextHovered
      setHovered(nextHovered)
      onHoverChange(nextHovered)
    },
    [onHoverChange],
  )

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
      setHotspotHovered(false)
      return
    }

    const canvas = gl.domElement
    const previousCursor = canvas.style.cursor
    const isRobotHit = (event: MouseEvent | PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return false
      }
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
      if (
        distanceSq <=
        PASCAL_WATER_BUILD_ROBOT_EXIT_HOVER_RADIUS * PASCAL_WATER_BUILD_ROBOT_EXIT_HOVER_RADIUS
      ) {
        return true
      }

      hoverScreenPointer.set(event.clientX - rect.left, event.clientY - rect.top)
      hoverScreenStart.copy(projectVectorToPascalWaterScreenPoint(segmentStart, camera, rect))
      hoverScreenEnd.copy(projectVectorToPascalWaterScreenPoint(segmentEnd, camera, rect))
      hoverScreenMid.copy(segmentStart).lerp(segmentEnd, 0.5)
      hoverScreenRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      hoverScreenRadiusPoint
        .copy(hoverScreenMid)
        .addScaledVector(hoverScreenRight, PASCAL_WATER_BUILD_ROBOT_EXIT_HOVER_RADIUS)
      const hoverScreenRadius = Math.max(
        36,
        hoverScreenStart.distanceTo(
          projectVectorToPascalWaterScreenPoint(hoverScreenRadiusPoint, camera, rect),
        ),
      )
      return (
        distanceSqToPascalWaterScreenSegment(
          hoverScreenPointer,
          hoverScreenStart,
          hoverScreenEnd,
        ) <=
        hoverScreenRadius * hoverScreenRadius
      )
    }
    const suppressBuilderEvent = (event: MouseEvent | PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    const handlePointerMove = (event: MouseEvent | PointerEvent) => {
      const robotHit = isRobotHit(event)
      setHotspotHovered(robotHit)
      if (!robotHit) {
        canvas.style.cursor = previousCursor
        return
      }

      canvas.style.cursor = 'default'
      suppressBuilderEvent(event)
    }
    const handlePointerLeave = () => {
      setHotspotHovered(false)
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

    window.addEventListener('pointermove', handlePointerMove, { capture: true })
    window.addEventListener('mousemove', handlePointerMove, { capture: true })
    canvas.addEventListener('pointerleave', handlePointerLeave)
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('pointerup', handleClick, { capture: true })
    window.addEventListener('click', handleClick, { capture: true })
    window.addEventListener('dblclick', handleBlockedMouseEvent, { capture: true })
    window.addEventListener('contextmenu', handleBlockedMouseEvent, { capture: true })
    return () => {
      setHotspotHovered(false)
      canvas.style.cursor = previousCursor
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('mousemove', handlePointerMove, true)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointerup', handleClick, true)
      window.removeEventListener('click', handleClick, true)
      window.removeEventListener('dblclick', handleBlockedMouseEvent, true)
      window.removeEventListener('contextmenu', handleBlockedMouseEvent, true)
    }
  }, [
    camera,
    closestRayPoint,
    closestRobotPoint,
    gl,
    hoverScreenEnd,
    hoverScreenMid,
    hoverScreenPointer,
    hoverScreenRadiusPoint,
    hoverScreenRight,
    hoverScreenStart,
    motionRef,
    onExitBuildMode,
    pointerNdc,
    raycaster,
    segmentEnd,
    segmentStart,
    setHotspotHovered,
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
        <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/18 bg-slate-950/82 px-3.5 py-1.5 text-sm font-black leading-none text-white shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-base font-black leading-none text-slate-950">
            B
          </span>
          <span className="text-lg font-black leading-none">Exit</span>
        </span>
      </Html>
    </group>
  )
}

function PascalWaterMapPlayerMarker({
  color,
  groundY,
  motionRef,
  opacityRef,
  visible,
}: {
  color: string
  groundY: number
  motionRef: { current: RobotMotion | null }
  opacityRef: { current: number }
  visible: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const materialOpacityRef = useRef(0)
  const labelRef = useRef<HTMLSpanElement | null>(null)

  useFrame((_, delta) => {
    const group = groupRef.current
    const motion = motionRef.current
    if (!group) return

    const targetOpacity = visible && motion ? clamp01(opacityRef.current) : 0
    materialOpacityRef.current = targetOpacity
    setPascalWaterGroupMaterialOpacity(group, materialOpacityRef.current)
    if (labelRef.current) labelRef.current.style.opacity = String(materialOpacityRef.current)
    if (!motion || targetOpacity <= 0.002) return

    group.position.set(motion.position.x, groundY + 0.16, motion.position.z)
    group.rotation.y = lerpAngle(group.rotation.y, motion.heading, clamp01(delta * 16))
  })

  return (
    <PascalWaterMapBadgeMarker
      color={color}
      groupRef={groupRef}
      label="P"
      labelRef={labelRef}
    />
  )
}

function PascalWaterRemoteMapPlayerMarker({
  groundY,
  opacityRef,
  player,
  visible,
}: {
  groundY: number
  opacityRef: { current: number }
  player: MultiplayerPlayerSnapshot
  visible: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const materialOpacityRef = useRef(0)
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

    materialOpacityRef.current = visible ? clamp01(opacityRef.current) : 0
    setPascalWaterGroupMaterialOpacity(group, materialOpacityRef.current)
    if (materialOpacityRef.current <= 0.002) return

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
  labelRef,
  scale = 1.5,
}: {
  color: string
  groupRef: RefObject<Group>
  label?: string
  labelRef?: RefObject<HTMLSpanElement | null>
  scale?: number
}) {
  return (
    <group ref={groupRef} scale={scale} visible>
      <mesh renderOrder={91} rotation={[-Math.PI / 2, 0, 0]} scale={1.14}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial
          color="#020617"
          depthTest={false}
          depthWrite={false}
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.52 }}
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
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.52 }}
        />
      </mesh>
      <mesh renderOrder={92} rotation={[-Math.PI / 2, 0, 0]} scale={1.03}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial
          color="#f8fafc"
          depthTest={false}
          depthWrite={false}
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.9 }}
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
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.9 }}
        />
      </mesh>
      <mesh renderOrder={93} rotation={[-Math.PI / 2, 0, 0]} scale={0.9}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.98 }}
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
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.98 }}
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
          opacity={0}
          toneMapped={false}
          transparent
          userData={{ pascalWaterBaseOpacity: 0.98 }}
        />
      </mesh>
      {label ? (
        <Html
          center
          className="pointer-events-none select-none transition-opacity duration-300 ease-out"
          position={[0, 0.12, 0]}
        >
          <span
            className="grid h-5 w-5 place-items-center rounded-full text-[13px] font-black leading-none text-slate-950"
            ref={labelRef}
            style={{
              opacity: 0,
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

function usePascalWaterLoadingProgress(assetsReady: boolean) {
  const [progressState, setProgressState] = useState({ progress: 0, visible: true })
  const assetsReadyRef = useRef(assetsReady)

  useEffect(() => {
    assetsReadyRef.current = assetsReady
  }, [assetsReady])

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
        assetsReadyRef.current &&
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
  node.playerSpeed =
    motion.runRequested && motion.speed > 0.2
      ? Math.max(motion.speed, PASCAL_WATER_ROBOT_RUN_SPEED)
      : motion.speed
}

function setPascalWaterMapCameraZoom(camera: Camera, zoom: number) {
  if (!isPascalWaterOrthographicCamera(camera)) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}

function isPascalWaterOrthographicCamera(camera: Camera): camera is PascalWaterOrthographicCamera {
  return (camera as Partial<PascalWaterOrthographicCamera>).isOrthographicCamera === true
}

function applyPascalWaterCameraPose(
  camera: Camera,
  pose: PascalWaterCameraPose | null,
  fallbackTarget: readonly [number, number, number] = PASCAL_WATER_CAMERA_TARGET,
) {
  camera.up.set(0, 1, 0)
  if (pose) {
    camera.position.copy(pose.position)
    camera.quaternion.copy(pose.quaternion)
  } else {
    camera.lookAt(fallbackTarget[0], fallbackTarget[1], fallbackTarget[2])
  }
  camera.updateMatrixWorld()
}

function createPascalWaterCameraPose(camera: Camera, target: Vector3): PascalWaterCameraPose {
  const pose: PascalWaterCameraPose = {
    distance: 0,
    pitch: 0,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: target.clone(),
    yaw: 0,
    zoom: isPascalWaterOrthographicCamera(camera) ? camera.zoom : null,
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
    quaternion: pose.quaternion.clone(),
    target: pose.target.clone(),
    yaw: pose.yaw,
    zoom: pose.zoom ?? null,
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
      quaternion: new Quaternion(),
      target: new Vector3(),
      yaw: 0,
    }
    poseRef.current = pose
  }

  pose.position.copy(camera.position)
  pose.quaternion.copy(camera.quaternion)
  pose.target.copy(target)
  pose.zoom = isPascalWaterOrthographicCamera(camera) ? camera.zoom : null
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

function resolvePascalWaterPlayerReturnTargetPose(
  sourcePose: PascalWaterCameraPose,
  target: Vector3,
  outputPosition: Vector3,
): PascalWaterCameraPose {
  const yaw = Number.isFinite(sourcePose.yaw)
    ? sourcePose.yaw
    : PASCAL_WATER_ISOMETRIC_CAMERA_INITIAL_YAW
  const pitch = Number.isFinite(sourcePose.pitch)
    ? clamp(
        sourcePose.pitch,
        PASCAL_WATER_ISOMETRIC_CAMERA_MIN_PITCH,
        PASCAL_WATER_ISOMETRIC_CAMERA_MAX_PITCH,
      )
    : PASCAL_WATER_ISOMETRIC_CAMERA_PITCH
  const sourceDistance = Number.isFinite(sourcePose.distance)
    ? sourcePose.distance
    : sourcePose.position.distanceTo(sourcePose.target)
  const distance = clamp(
    sourceDistance,
    PASCAL_WATER_ISOMETRIC_CAMERA_MIN_DISTANCE,
    PASCAL_WATER_ISOMETRIC_CAMERA_MAX_DISTANCE,
  )

  const position = resolveThirdPersonCameraPosition(
    target,
    yaw,
    pitch,
    distance,
    outputPosition,
  ).clone()

  return {
    distance,
    pitch,
    position,
    quaternion: resolvePascalWaterCameraPoseQuaternion(position, target, new Quaternion()),
    target: target.clone(),
    yaw,
    zoom: null,
  }
}

function resolvePascalWaterCameraPoseQuaternion(
  position: Vector3,
  target: Vector3,
  output: Quaternion,
) {
  _pascalWaterCameraPoseLookAtMatrix.lookAt(position, target, _pascalWaterCameraPoseUp)
  return output.setFromRotationMatrix(_pascalWaterCameraPoseLookAtMatrix)
}

function easePascalWaterCameraTransition(
  progress: number,
  _targetMode: PascalWaterRuntimeCameraSample['mode'],
) {
  const t = clamp01(progress)
  return t * t * (3 - 2 * t)
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
  colliderMeshes,
  doorPortals,
  groundY,
  motion,
  navigationObstacles,
  pointer,
  pointerNdc,
  raycaster,
  stairPortals,
  surfacePoints,
}: {
  camera: Camera
  canvas: HTMLCanvasElement
  colliderMeshes: Mesh[]
  doorPortals: readonly PascalWaterDoorPortal[]
  groundY: number
  motion: RobotMotion
  navigationObstacles: readonly PascalWaterNavigationObstacle[]
  pointer: PascalWaterRightHoldMove | null
  pointerNdc: Vector2
  raycaster: Raycaster
  stairPortals: readonly PascalWaterStairPortal[]
  surfacePoints: readonly LandrushPoint2[]
}): RobotMovementInput | null {
  if (!pointer) return null

  const point = pickPascalWaterWalkTargetPoint({
    camera,
    canvas,
    colliderMeshes,
    event: { clientX: pointer.x, clientY: pointer.y } as PointerEvent,
    groundY,
    pointerNdc,
    raycaster,
  })
  const start = { x: motion.position.x, z: motion.position.z }
  const rawTargetPoint = point
    ? resolvePascalWaterStairConnectorTarget(start, point, stairPortals)
    : null
  const targetPoint = rawTargetPoint
    ? resolvePascalWaterWalkableNavigationTargetPoint(
        rawTargetPoint,
        navigationObstacles,
        surfacePoints,
      )
    : null
  if (!targetPoint) return null

  const steeringPoint = resolvePascalWaterNavigationSteeringPoint(
    start,
    targetPoint,
    navigationObstacles,
    doorPortals,
    surfacePoints,
    stairPortals,
  )
  if (!steeringPoint) return null
  openPascalWaterDoorPortalsAlongSegment(start, targetPoint, doorPortals)
  const dx = targetPoint.x - motion.position.x
  const dz = targetPoint.z - motion.position.z
  const distance = Math.hypot(dx, dz)
  if (distance <= PASCAL_WATER_CLICK_MOVE_STOP_RADIUS) return null

  const movement = resolvePascalWaterNavigationMovementVector(start, steeringPoint, distance)
  return {
    x: movement.x,
    z: movement.z,
    doorId: steeringPoint.doorId,
    heading: movement.heading,
    intensity: movement.intensity,
    navigationKind: steeringPoint.kind,
    runAmount: movement.runAmount,
    steeringDistance: movement.steeringDistance,
    steeringPoint: movement.steeringPoint,
  }
}

function resolveClickMoveMovement(
  motion: RobotMotion,
  targetRef: { current: PascalWaterMoveTarget | null },
  navigationObstacles: readonly PascalWaterNavigationObstacle[],
  doorPortals: readonly PascalWaterDoorPortal[],
  stairPortals: readonly PascalWaterStairPortal[],
  surfacePoints: readonly LandrushPoint2[],
): RobotMovementInput | null {
  const target = targetRef.current
  if (!target) return null

  const now = performance.now()
  const start = { x: motion.position.x, z: motion.position.z }
  const distance = Math.hypot(target.point.x - start.x, target.point.z - start.z)
  target.route ??= createPascalWaterMoveRouteState(start, distance, now)
  const crossingInProgress = target.route.doorCrossing !== null

  const projectedFinalReached =
    !crossingInProgress &&
    segmentReachedPascalWaterNavigationPoint(
      target.route.lastRobotPoint,
      start,
      target.point,
      PASCAL_WATER_CLICK_MOVE_STOP_RADIUS,
    )
  if (
    !crossingInProgress &&
    (distance <= PASCAL_WATER_CLICK_MOVE_STOP_RADIUS ||
      (projectedFinalReached && distance <= PASCAL_WATER_CLICK_MOVE_PROJECTED_STOP_RADIUS))
  ) {
    recordPascalWaterNavigationProbe({
      distance: roundPerf(distance),
      kind: 'click-arrived',
      projected: distance > PASCAL_WATER_CLICK_MOVE_STOP_RADIUS,
    })
    targetRef.current = null
    return null
  }
  if (projectedFinalReached) {
    recordPascalWaterNavigationProbe({
      distance: roundPerf(distance),
      kind: 'click-arrival-projection-ignored',
      projectedStopRadius: roundPerf(PASCAL_WATER_CLICK_MOVE_PROJECTED_STOP_RADIUS),
    })
  }

  target.route = updatePascalWaterMoveRouteProgress(target.route, start, distance, now)
  let doorCrossingResolution = resolvePascalWaterActiveDoorCrossingSteering(
    target.route,
    start,
    now,
  )
  if (doorCrossingResolution?.waiting) {
    target.route.lastRobotPoint = start
    return null
  }
  if (target.route.nextRetryAt > now) {
    target.route.lastRobotPoint = start
    return null
  }
  const completedDoorCrossing = doorCrossingResolution?.completed === true
  let activeSteering: PascalWaterNavigationSteeringResult | null =
    doorCrossingResolution?.steering ?? null
  const noProgressMs = now - target.route.lastProgressAt
  const hasStalled =
    noProgressMs >= PASCAL_WATER_CLICK_MOVE_STALL_MS &&
    (motion.speed <= PASCAL_WATER_CLICK_MOVE_STALL_SPEED ||
      noProgressMs >= PASCAL_WATER_CLICK_MOVE_NO_PROGRESS_RETRY_MS)
  if (!activeSteering && hasStalled) {
    const recovery = resolvePascalWaterNavigationRecoverySteeringPoint(
      start,
      target.point,
      target.route.lastSteeringPoint ?? target.point,
      navigationObstacles,
      doorPortals,
      surfacePoints,
      stairPortals,
    )
    target.route.lastProgressAt = now
    target.route.recoveryCount += 1
    if (recovery) {
      activeSteering = recovery
      recordPascalWaterNavigationProbe({
        distance: roundPerf(distance),
        kind: 'click-stall-recovery',
        recoveryCount: target.route.recoveryCount,
        steering: [roundPerf(recovery.point.x), roundPerf(recovery.point.z)],
      })
    } else {
      const retry = resolvePascalWaterNavigationLocalRetrySteeringPoint(
        start,
        target.point,
        target.route.lastSteeringPoint ?? target.point,
        navigationObstacles,
        surfacePoints,
        target.route.recoveryCount,
      )
      if (retry) {
        activeSteering = retry
        recordPascalWaterNavigationProbe({
          distance: roundPerf(distance),
          kind: 'click-stall-local-retry',
          noProgressMs: roundPerf(noProgressMs),
          recoveryCount: target.route.recoveryCount,
          steering: [roundPerf(retry.point.x), roundPerf(retry.point.z)],
        })
      } else if (target.route.recoveryCount < PASCAL_WATER_CLICK_MOVE_LOCAL_RETRY_MAX) {
        target.route.nextRetryAt = now + PASCAL_WATER_CLICK_MOVE_RETRY_MS
      }
      recordPascalWaterNavigationProbe({
        distance: roundPerf(distance),
        kind: 'click-stall-replan',
        noProgressMs: roundPerf(noProgressMs),
        recoveryCount: target.route.recoveryCount,
      })
    }
  }

  if (!activeSteering) {
    activeSteering = resolvePascalWaterNavigationSteeringPoint(
      start,
      target.point,
      navigationObstacles,
      doorPortals,
      surfacePoints,
      stairPortals,
    )
    if (!activeSteering) {
      activeSteering = resolvePascalWaterNavigationEscapeSteeringPoint(
        start,
        target.point,
        navigationObstacles,
        doorPortals,
        surfacePoints,
        stairPortals,
      )
      if (activeSteering) {
        target.route.lastProgressAt = now
        target.route.nextRetryAt = 0
        target.route.recoveryCount += 1
        recordPascalWaterNavigationProbe({
          distance: roundPerf(distance),
          kind: 'click-route-recovery',
          recoveryCount: target.route.recoveryCount,
          steering: [roundPerf(activeSteering.point.x), roundPerf(activeSteering.point.z)],
          target: [roundPerf(target.point.x), roundPerf(target.point.z)],
        })
      } else {
        const retryRecovery = resolvePascalWaterNavigationRecoverySteeringPoint(
          start,
          target.point,
          target.route.lastSteeringPoint ?? target.point,
          navigationObstacles,
          doorPortals,
          surfacePoints,
          stairPortals,
        )
        if (retryRecovery) {
          activeSteering = retryRecovery
          target.route.nextRetryAt = 0
          target.route.recoveryCount += 1
          recordPascalWaterNavigationProbe({
            distance: roundPerf(distance),
            kind: 'click-no-route-recovery',
            recoveryCount: target.route.recoveryCount,
            steering: [roundPerf(retryRecovery.point.x), roundPerf(retryRecovery.point.z)],
            target: [roundPerf(target.point.x), roundPerf(target.point.z)],
          })
        } else {
          target.route.recoveryCount += 1
          const localRetry = resolvePascalWaterNavigationLocalRetrySteeringPoint(
            start,
            target.point,
            target.route.lastSteeringPoint ?? target.point,
            navigationObstacles,
            surfacePoints,
            target.route.recoveryCount,
          )
          if (localRetry) {
            activeSteering = localRetry
            target.route.nextRetryAt = 0
            recordPascalWaterNavigationProbe({
              distance: roundPerf(distance),
              kind: 'click-no-route-local-retry',
              recoveryCount: target.route.recoveryCount,
              steering: [roundPerf(localRetry.point.x), roundPerf(localRetry.point.z)],
              target: [roundPerf(target.point.x), roundPerf(target.point.z)],
            })
          } else {
            target.route.nextRetryAt = now + PASCAL_WATER_CLICK_MOVE_RETRY_MS
            recordPascalWaterNavigationProbe({
              distance: roundPerf(distance),
              kind: 'click-no-route-retry',
              recoveryCount: target.route.recoveryCount,
              retryMs: PASCAL_WATER_CLICK_MOVE_RETRY_MS,
              target: [roundPerf(target.point.x), roundPerf(target.point.z)],
            })
            return null
          }
        }
      }
    } else if (completedDoorCrossing) {
      recordPascalWaterNavigationProbe({
        distance: roundPerf(distance),
        kind: 'door-crossing-resume-target',
      })
    }
  }

  if (activeSteering.doorCrossing && !target.route.doorCrossing) {
    target.route.doorCrossing = clonePascalWaterDoorCrossingState(activeSteering.doorCrossing)
    recordPascalWaterNavigationProbe({
      doorId: activeSteering.doorId,
      entry: [
        roundPerf(target.route.doorCrossing.entry.x),
        roundPerf(target.route.doorCrossing.entry.z),
      ],
      exit: [
        roundPerf(target.route.doorCrossing.exit.x),
        roundPerf(target.route.doorCrossing.exit.z),
      ],
      kind: `${activeSteering.kind}-crossing-start`,
      nodeId: target.route.doorCrossing.nodeId,
      phase: target.route.doorCrossing.phase,
    })
    doorCrossingResolution = resolvePascalWaterActiveDoorCrossingSteering(target.route, start, now)
    if (doorCrossingResolution?.waiting) {
      target.route.lastRobotPoint = start
      return null
    }
    activeSteering = doorCrossingResolution?.steering ?? activeSteering
  }

  openPascalWaterDoorPortalsAlongSegment(start, target.point, doorPortals)
  if (activeSteering.doorId) {
    const openState = openPascalWaterDoor(activeSteering.doorId)
    if (openState === 'started') {
      recordPascalWaterNavigationProbe({
        doorId: activeSteering.doorId,
        kind: 'door-open-on-route',
        navigationKind: activeSteering.kind,
      })
    }
  }
  for (
    let advance = 0;
    activeSteering.kind !== 'door' && activeSteering.kind !== 'stair' && advance < 3;
    advance += 1
  ) {
    const steeringDistance = Math.hypot(
      activeSteering.point.x - start.x,
      activeSteering.point.z - start.z,
    )
    const waypointRadius = PASCAL_WATER_CLICK_MOVE_WAYPOINT_RADIUS
    const reached =
      steeringDistance <= waypointRadius ||
      segmentReachedPascalWaterNavigationPoint(
        target.route.lastRobotPoint,
        start,
        activeSteering.point,
        waypointRadius,
      )
    if (!reached) break

    target.route.lastProgressAt = now
    target.route.lastRobotPoint = start
    target.route.lastSteeringPoint = activeSteering.point
    recordPascalWaterNavigationProbe({
      kind: 'click-waypoint-reached',
      navigationKind: activeSteering.kind,
      steeringDistance: roundPerf(steeringDistance),
    })
    const nextSteering = resolvePascalWaterNavigationSteeringPoint(
      start,
      target.point,
      navigationObstacles,
      doorPortals,
      surfacePoints,
      stairPortals,
    )
    if (
      !nextSteering ||
      (nextSteering.kind === activeSteering.kind &&
        Math.hypot(
          nextSteering.point.x - activeSteering.point.x,
          nextSteering.point.z - activeSteering.point.z,
        ) <= 0.001)
    ) {
      if (activeSteering.kind === 'direct') {
        recordPascalWaterNavigationProbe({
          distance: roundPerf(distance),
          kind: 'click-arrived',
          projected: true,
        })
        targetRef.current = null
      }
      return null
    }
    activeSteering = nextSteering
  }

  const movement = resolvePascalWaterNavigationMovementVector(start, activeSteering, distance)
  const lastSteeringPoint = target.route.lastSteeringPoint
  const steeringPointChanged =
    !lastSteeringPoint ||
    Math.hypot(
      movement.steeringPoint.x - lastSteeringPoint.x,
      movement.steeringPoint.z - lastSteeringPoint.z,
    ) > 0.05
  if (activeSteering.doorId && steeringPointChanged) {
    recordPascalWaterNavigationProbe({
      doorId: activeSteering.doorId,
      kind: 'door-route-selected',
      steeringDistance: roundPerf(movement.steeringDistance),
      steeringPoint: [roundPerf(movement.steeringPoint.x), roundPerf(movement.steeringPoint.z)],
      target: [roundPerf(target.point.x), roundPerf(target.point.z)],
    })
  }
  target.route.lastRobotPoint = start
  target.route.lastSteeringPoint = movement.steeringPoint
  return {
    x: movement.x,
    z: movement.z,
    doorId: activeSteering.doorId,
    heading: movement.heading,
    intensity: movement.intensity,
    navigationKind: activeSteering.kind,
    runAmount: movement.runAmount,
    steeringDistance: movement.steeringDistance,
    steeringPoint: movement.steeringPoint,
  }
}

function resolvePascalWaterNavigationMovementVector(
  start: LandrushPoint2,
  activeSteering: PascalWaterNavigationSteeringResult,
  targetDistance: number,
) {
  const constrained = activeSteering.doorCrossing
    ? resolvePascalWaterConstrainedCrossingMovement(
        start,
        activeSteering.doorCrossing,
        targetDistance,
      )
    : null
  const steeringPoint = constrained?.steeringPoint ?? activeSteering.point
  const dx = steeringPoint.x - start.x
  const dz = steeringPoint.z - start.z
  const steeringDistance = Math.hypot(dx, dz)
  const direction = normalize2(dx, dz)

  return {
    ...direction,
    heading: Math.atan2(direction.x, direction.z),
    intensity:
      constrained?.intensity ??
      resolvePascalWaterNavigationMoveIntensity(
        activeSteering.kind,
        steeringDistance,
        targetDistance,
      ),
    runAmount:
      constrained?.runAmount ?? (targetDistance > PASCAL_WATER_CLICK_MOVE_RUN_DISTANCE ? 1 : 0),
    steeringDistance,
    steeringPoint,
  }
}

function resolvePascalWaterWalkableNavigationTargetPoint(
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
): LandrushPoint2 | null {
  if (!pointInPolygon(target, surfacePoints)) return null
  if (!pointInPascalWaterBlockingNavigationObstacle(target, obstacles)) return target

  let best: { distance: number; point: LandrushPoint2 } | null = null
  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair' || !pointInPolygon(target, obstacle.points)) continue
    const boundary = closestPointOnClosedPolyline(target, obstacle.points)
    if (!boundary) continue
    const centroid = centroidForPolygon(obstacle.points)
    const normal = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
    const tangent = normalize2(-normal.z, normal.x)
    const distances = [
      PASCAL_WATER_NAVIGATION_TARGET_NUDGE_METERS,
      PASCAL_WATER_CLICK_MOVE_STOP_RADIUS,
      PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
    ] as const

    for (const distance of distances) {
      for (const side of [0, -1, 1] as const) {
        const candidate = {
          x:
            boundary.x +
            normal.x * distance +
            tangent.x * side * PASCAL_WATER_NAVIGATION_TARGET_NUDGE_METERS,
          z:
            boundary.z +
            normal.z * distance +
            tangent.z * side * PASCAL_WATER_NAVIGATION_TARGET_NUDGE_METERS,
        }
        if (!pointInPolygon(candidate, surfacePoints)) continue
        if (pointInPascalWaterBlockingNavigationObstacle(candidate, obstacles)) continue
        const candidateDistance = Math.hypot(candidate.x - target.x, candidate.z - target.z)
        if (!best || candidateDistance < best.distance) {
          best = { distance: candidateDistance, point: candidate }
        }
      }
    }
  }

  return best?.point ?? null
}

function resolvePascalWaterObstacleSlideMovement(
  start: LandrushPoint2,
  movement: RobotMovementInput,
  obstacles: readonly PascalWaterNavigationObstacle[],
): RobotMovementInput {
  if (movement.navigationKind === 'door' || movement.navigationKind === 'stair') return movement

  const contact = resolvePascalWaterNavigationSlideContact(start, movement, obstacles)
  if (!contact) return movement

  const inwardDot = movement.x * contact.normal.x + movement.z * contact.normal.z
  if (inwardDot >= -PASCAL_WATER_NAVIGATION_SLIDE_MIN_INWARD_DOT) return movement

  const slideX = movement.x - contact.normal.x * inwardDot
  const slideZ = movement.z - contact.normal.z * inwardDot
  const slideLength = Math.hypot(slideX, slideZ)
  const direction =
    slideLength > 0.000001
      ? { x: slideX / slideLength, z: slideZ / slideLength }
      : movement.x * contact.tangent.x + movement.z * contact.tangent.z >= 0
        ? contact.tangent
        : { x: -contact.tangent.x, z: -contact.tangent.z }

  return {
    ...movement,
    heading: Math.atan2(direction.x, direction.z),
    x: direction.x,
    z: direction.z,
  }
}

function resolvePascalWaterNavigationSlideContact(
  start: LandrushPoint2,
  movement: RobotMovementInput,
  obstacles: readonly PascalWaterNavigationObstacle[],
) {
  let best: { distance: number; normal: LandrushPoint2; tangent: LandrushPoint2 } | null = null

  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair') continue
    const boundary = closestPointOnClosedPolyline(start, obstacle.points)
    if (!boundary) continue

    const inside = pointInPolygon(start, obstacle.points)
    const distance = Math.hypot(start.x - boundary.x, start.z - boundary.z)
    if (!inside && distance > PASCAL_WATER_NAVIGATION_SLIDE_RADIUS_METERS) continue

    const centroid = centroidForPolygon(obstacle.points)
    let normal = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
    if (!inside && distance > 0.000001) {
      const pointSide = normalize2(start.x - boundary.x, start.z - boundary.z)
      if (pointSide.x * normal.x + pointSide.z * normal.z < 0) {
        normal = { x: -normal.x, z: -normal.z }
      }
    }

    const inwardAmount = -(movement.x * normal.x + movement.z * normal.z)
    if (inwardAmount <= PASCAL_WATER_NAVIGATION_SLIDE_MIN_INWARD_DOT) continue

    const score = inside ? distance * 0.5 : distance
    if (!best || score < best.distance) {
      best = {
        distance: score,
        normal,
        tangent: normalize2(-normal.z, normal.x),
      }
    }
  }

  return best
}

function resolvePascalWaterConstrainedCrossingMovement(
  start: LandrushPoint2,
  crossing: PascalWaterDoorCrossingState,
  targetDistance: number,
) {
  const routeX = crossing.exit.x - crossing.entry.x
  const routeZ = crossing.exit.z - crossing.entry.z
  const routeLength = Math.hypot(routeX, routeZ)
  if (routeLength <= 0.000001) return null

  const routeDirX = routeX / routeLength
  const routeDirZ = routeZ / routeLength
  const lateralDirX = -routeDirZ
  const lateralDirZ = routeDirX
  const progressFromEntry =
    (start.x - crossing.entry.x) * routeDirX + (start.z - crossing.entry.z) * routeDirZ
  const lateralFromRoute =
    (start.x - crossing.entry.x) * lateralDirX + (start.z - crossing.entry.z) * lateralDirZ
  const centerProgress =
    (crossing.center.x - crossing.entry.x) * routeDirX +
    (crossing.center.z - crossing.entry.z) * routeDirZ
  const phaseProgress =
    crossing.phase === 'entry' ? 0 : crossing.phase === 'center' ? centerProgress : routeLength
  const phaseRadius =
    crossing.phase === 'center'
      ? PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS
      : PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS
  const phasePlaneReached = progressFromEntry >= phaseProgress - phaseRadius
  const steeringProgress = clamp(
    phasePlaneReached && Math.abs(lateralFromRoute) <= phaseRadius
      ? progressFromEntry + PASCAL_WATER_CONSTRAINED_CROSSING_LOOKAHEAD_METERS
      : phaseProgress,
    0,
    routeLength,
  )
  const steeringPoint = {
    x: crossing.entry.x + routeDirX * steeringProgress,
    z: crossing.entry.z + routeDirZ * steeringProgress,
  }
  const steeringDistance = Math.hypot(steeringPoint.x - start.x, steeringPoint.z - start.z)
  const crossingDistance = Math.max(steeringDistance, Math.abs(lateralFromRoute) * 0.75)
  const rawIntensity = clamp01(
    crossingDistance / PASCAL_WATER_CONSTRAINED_CROSSING_FULL_SPEED_METERS,
  )
  const intensity = MathUtils.clamp(
    rawIntensity,
    PASCAL_WATER_CONSTRAINED_CROSSING_MIN_SPEED_SCALE,
    PASCAL_WATER_CONSTRAINED_CROSSING_MAX_SPEED_SCALE,
  )
  const distanceBeforeEntry = Math.max(0, -progressFromEntry)
  const runAmount =
    crossing.phase === 'entry' &&
    Math.max(distanceBeforeEntry, steeringDistance) >
      PASCAL_WATER_CONSTRAINED_CROSSING_RUN_APPROACH_METERS &&
    targetDistance > PASCAL_WATER_CLICK_MOVE_RUN_DISTANCE
      ? 1
      : 0

  return {
    intensity,
    runAmount,
    steeringPoint,
  }
}

function createPascalWaterMoveRouteState(
  point: LandrushPoint2,
  distance: number,
  now: number,
): PascalWaterMoveRouteState {
  return {
    bestDistance: distance,
    doorCrossing: null,
    lastProgressAt: now,
    lastRobotPoint: point,
    lastSteeringPoint: null,
    nextRetryAt: 0,
    recoveryCount: 0,
  }
}

function updatePascalWaterMoveRouteProgress(
  route: PascalWaterMoveRouteState,
  point: LandrushPoint2,
  distance: number,
  now: number,
) {
  if (distance < route.bestDistance - PASCAL_WATER_CLICK_MOVE_PROGRESS_EPSILON_METERS) {
    route.bestDistance = distance
    route.lastProgressAt = now
  }
  route.lastRobotPoint = route.lastRobotPoint ?? point
  return route
}

function resolvePascalWaterClickMoveIntensity(distance: number) {
  const normalized = clamp01(distance / PASCAL_WATER_CLICK_MOVE_FULL_SPEED_DISTANCE)
  return MathUtils.clamp(normalized * normalized, PASCAL_WATER_CLICK_MOVE_MIN_SPEED_SCALE, 1)
}

function resolvePascalWaterNavigationMoveIntensity(
  kind: PascalWaterNavigationSteeringKind,
  steeringDistance: number,
  targetDistance: number,
) {
  const constrainedCrossing = kind === 'door' || kind === 'stair'
  const speedDistance = constrainedCrossing ? targetDistance : steeringDistance
  const intensity = resolvePascalWaterClickMoveIntensity(speedDistance)
  return constrainedCrossing
    ? Math.max(PASCAL_WATER_DOOR_CROSSING_MIN_INTENSITY, intensity)
    : intensity
}

function resolvePascalWaterActiveDoorCrossingSteering(
  route: PascalWaterMoveRouteState,
  start: LandrushPoint2,
  now: number,
): {
  completed: boolean
  steering: PascalWaterNavigationSteeringResult | null
  waiting: boolean
} | null {
  const crossing = route.doorCrossing
  if (!crossing) return null

  for (let advance = 0; advance < 3; advance += 1) {
    const point = pointForPascalWaterDoorCrossingPhase(crossing)
    const radius =
      crossing.phase === 'center'
        ? PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS
        : PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS
    const distance = Math.hypot(point.x - start.x, point.z - start.z)
    const reached =
      distance <= radius ||
      segmentReachedPascalWaterNavigationPoint(route.lastRobotPoint, start, point, radius)
    if (!reached) {
      return {
        completed: false,
        steering: {
          doorCrossing: clonePascalWaterDoorCrossingState(crossing),
          doorId: crossing.doorId,
          kind: crossing.kind,
          point,
        },
        waiting: false,
      }
    }

    if (
      crossing.kind === 'door' &&
      crossing.doorId &&
      crossing.phase === 'entry' &&
      getPascalWaterDoorOpenRatio(crossing.doorId) < PASCAL_WATER_DOOR_CROSSING_OPEN_MIN
    ) {
      const openState = openPascalWaterDoor(crossing.doorId)
      route.lastProgressAt = now
      route.lastSteeringPoint = point
      recordPascalWaterNavigationProbe({
        distance: roundPerf(distance),
        doorId: crossing.doorId,
        kind: 'door-crossing-wait-open',
        nodeId: crossing.nodeId,
        openRatio: roundPerf(getPascalWaterDoorOpenRatio(crossing.doorId)),
        openState,
        phase: crossing.phase,
      })
      return { completed: false, steering: null, waiting: true }
    }

    route.lastProgressAt = now
    route.lastSteeringPoint = point
    recordPascalWaterNavigationProbe({
      distance: roundPerf(distance),
      doorId: crossing.doorId,
      kind: `${crossing.kind}-crossing-waypoint`,
      nodeId: crossing.nodeId,
      phase: crossing.phase,
      signedDistance: roundPerf(signedPascalWaterDoorCrossingDistance(start, crossing)),
      tangentDistance: roundPerf(tangentPascalWaterDoorCrossingDistance(start, crossing)),
    })

    const nextPhase = nextPascalWaterDoorCrossingPhase(crossing.phase)
    if (!nextPhase) {
      route.doorCrossing = null
      recordPascalWaterNavigationProbe({
        doorId: crossing.doorId,
        kind: `${crossing.kind}-crossing-complete`,
        nodeId: crossing.nodeId,
      })
      return { completed: true, steering: null, waiting: false }
    }
    crossing.phase = nextPhase
  }

  const point = pointForPascalWaterDoorCrossingPhase(crossing)
  return {
    completed: false,
    steering: {
      doorCrossing: clonePascalWaterDoorCrossingState(crossing),
      doorId: crossing.doorId,
      kind: crossing.kind,
      point,
    },
    waiting: false,
  }
}

function pointForPascalWaterDoorCrossingPhase(crossing: PascalWaterDoorCrossingState) {
  if (crossing.phase === 'entry') return crossing.entry
  if (crossing.phase === 'center') return crossing.center
  return crossing.exit
}

function nextPascalWaterDoorCrossingPhase(
  phase: PascalWaterDoorCrossingPhase,
): PascalWaterDoorCrossingPhase | null {
  if (phase === 'entry') return 'center'
  if (phase === 'center') return 'exit'
  return null
}

function clonePascalWaterDoorCrossingState(
  crossing: PascalWaterDoorCrossingState,
): PascalWaterDoorCrossingState {
  return {
    center: clonePoint2(crossing.center),
    doorId: crossing.doorId,
    entry: clonePoint2(crossing.entry),
    exit: clonePoint2(crossing.exit),
    kind: crossing.kind,
    nodeId: crossing.nodeId,
    phase: crossing.phase,
  }
}

function clonePoint2(point: LandrushPoint2): LandrushPoint2 {
  return { x: point.x, z: point.z }
}

function signedPascalWaterDoorCrossingDistance(
  point: LandrushPoint2,
  crossing: PascalWaterDoorCrossingState,
) {
  const normal = normalize2(
    crossing.entry.x - crossing.center.x,
    crossing.entry.z - crossing.center.z,
  )
  return (point.x - crossing.center.x) * normal.x + (point.z - crossing.center.z) * normal.z
}

function tangentPascalWaterDoorCrossingDistance(
  point: LandrushPoint2,
  crossing: PascalWaterDoorCrossingState,
) {
  const normal = normalize2(
    crossing.entry.x - crossing.center.x,
    crossing.entry.z - crossing.center.z,
  )
  return (point.x - crossing.center.x) * -normal.z + (point.z - crossing.center.z) * normal.x
}

function getPascalWaterDoorOpenRatio(doorId: AnyNodeId) {
  const node = useScene.getState().nodes[doorId]
  if (node?.type !== 'door') return 1
  if (node.openingKind === 'opening') return 1

  const interactive = useInteractive.getState()
  const interactiveDoor = interactive.doors[doorId]
  const activeAnimation = interactive.doorAnimations[doorId]
  if (isOperationDoorType(node.doorType)) {
    return clamp01(
      interactiveDoor?.operationState ??
        (activeAnimation?.field === 'operationState' ? activeAnimation.to : undefined) ??
        node.operationState ??
        0,
    )
  }

  return clamp01(
    (interactiveDoor?.swingAngle ??
      (activeAnimation?.field === 'swingAngle' ? activeAnimation.to : undefined) ??
      node.swingAngle ??
      0) / PASCAL_WATER_DOOR_OPEN_SWING_ANGLE,
  )
}

function segmentReachedPascalWaterNavigationPoint(
  previous: LandrushPoint2,
  current: LandrushPoint2,
  target: LandrushPoint2,
  radius: number,
) {
  if (Math.hypot(target.x - current.x, target.z - current.z) <= radius) return true
  const stepX = current.x - previous.x
  const stepZ = current.z - previous.z
  const stepLengthSq = stepX * stepX + stepZ * stepZ
  if (stepLengthSq <= 0.000001) return false
  const projection =
    ((target.x - previous.x) * stepX + (target.z - previous.z) * stepZ) / stepLengthSq
  return (
    projection >= 0 && projection <= 1 && distanceToSegment2(target, previous, current) <= radius
  )
}

function resolvePascalWaterNavigationRecoverySteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  blockedPoint: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  doorPortals: readonly PascalWaterDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly PascalWaterStairPortal[] = [],
): PascalWaterNavigationSteeringResult | null {
  const escapeSteering = resolvePascalWaterNavigationEscapeSteeringPoint(
    start,
    target,
    obstacles,
    doorPortals,
    surfacePoints,
    stairPortals,
  )
  if (escapeSteering) return escapeSteering

  const forward = normalize2(target.x - start.x, target.z - start.z)
  const blockedDirection = normalize2(blockedPoint.x - start.x, blockedPoint.z - start.z)
  const right = { x: -blockedDirection.z, z: blockedDirection.x }
  const candidates = [
    {
      x:
        start.x +
        forward.x * PASCAL_WATER_CLICK_MOVE_RECOVERY_FORWARD_METERS +
        right.x * PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
      z:
        start.z +
        forward.z * PASCAL_WATER_CLICK_MOVE_RECOVERY_FORWARD_METERS +
        right.z * PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
    },
    {
      x:
        start.x +
        forward.x * PASCAL_WATER_CLICK_MOVE_RECOVERY_FORWARD_METERS -
        right.x * PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
      z:
        start.z +
        forward.z * PASCAL_WATER_CLICK_MOVE_RECOVERY_FORWARD_METERS -
        right.z * PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
    },
    {
      x: start.x - blockedDirection.x * PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
      z: start.z - blockedDirection.z * PASCAL_WATER_CLICK_MOVE_RECOVERY_SIDE_METERS,
    },
  ]

  for (const candidate of candidates) {
    if (!pointInPolygon(candidate, surfacePoints)) continue
    if (pointInPascalWaterNavigationObstacle(candidate, obstacles)) continue
    if (!pascalWaterNavigationSegmentPassable(start, candidate, obstacles, surfacePoints)) continue
    const onward = resolvePascalWaterNavigationSteeringPoint(
      candidate,
      target,
      obstacles,
      doorPortals,
      surfacePoints,
      stairPortals,
    )
    if (!onward) continue
    return { kind: 'recovery', point: candidate }
  }
  return null
}

function resolvePascalWaterNavigationLocalRetrySteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  blockedPoint: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
  attempt: number,
): PascalWaterNavigationSteeringResult | null {
  const contact = resolvePascalWaterNavigationLocalRetryContact(start, obstacles)
  const forward = normalize2(target.x - start.x, target.z - start.z)
  const blockedDirection = normalize2(blockedPoint.x - start.x, blockedPoint.z - start.z)
  const fallbackRight = { x: -blockedDirection.z, z: blockedDirection.x }
  const tangent = contact?.tangent ?? fallbackRight
  const normal = contact?.normal ?? { x: -blockedDirection.x, z: -blockedDirection.z }
  const preferredTangent =
    forward.x * tangent.x + forward.z * tangent.z >= 0 ? tangent : { x: -tangent.x, z: -tangent.z }
  const otherTangent = { x: -preferredTangent.x, z: -preferredTangent.z }
  const directions = [
    preferredTangent,
    otherTangent,
    normalize2(preferredTangent.x + normal.x * 0.45, preferredTangent.z + normal.z * 0.45),
    normalize2(otherTangent.x + normal.x * 0.45, otherTangent.z + normal.z * 0.45),
    normal,
    normalize2(forward.x + preferredTangent.x * 0.7, forward.z + preferredTangent.z * 0.7),
  ]
  const distances = [0.72, 1.08, 1.44] as const
  const startIndex = Math.abs(attempt) % directions.length

  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[(startIndex + index) % directions.length]
    if (!direction) continue
    for (const distance of distances) {
      const candidate = {
        x: start.x + direction.x * distance,
        z: start.z + direction.z * distance,
      }
      if (!pointInPolygon(candidate, surfacePoints)) continue
      if (pointInPascalWaterBlockingNavigationObstacle(candidate, obstacles)) continue
      if (contact) {
        if (
          pascalWaterNavigationSegmentBlockedByOtherObstacles(
            start,
            candidate,
            obstacles,
            contact.obstacle,
          )
        ) {
          continue
        }
      } else if (
        !pascalWaterNavigationSegmentPassable(start, candidate, obstacles, surfacePoints)
      ) {
        continue
      }
      return { kind: 'recovery', point: candidate }
    }
  }

  return null
}

function resolvePascalWaterNavigationLocalRetryContact(
  start: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
) {
  let best: {
    distance: number
    normal: LandrushPoint2
    obstacle: PascalWaterNavigationObstacle
    tangent: LandrushPoint2
  } | null = null

  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair') continue
    const boundary = closestPointOnClosedPolyline(start, obstacle.points)
    if (!boundary) continue

    const inside = pointInPolygon(start, obstacle.points)
    const distance = Math.hypot(start.x - boundary.x, start.z - boundary.z)
    if (!inside && distance > PASCAL_WATER_NAVIGATION_SLIDE_RADIUS_METERS * 1.35) continue

    const centroid = centroidForPolygon(obstacle.points)
    let normal = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
    if (!inside && distance > 0.000001) {
      const pointSide = normalize2(start.x - boundary.x, start.z - boundary.z)
      if (pointSide.x * normal.x + pointSide.z * normal.z < 0) {
        normal = { x: -normal.x, z: -normal.z }
      }
    }
    const score = inside ? distance * 0.5 : distance
    if (!best || score < best.distance) {
      best = {
        distance: score,
        normal,
        obstacle,
        tangent: normalize2(-normal.z, normal.x),
      }
    }
  }

  return best
}

function resolvePascalWaterNavigationEscapeSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  doorPortals: readonly PascalWaterDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly PascalWaterStairPortal[] = [],
): PascalWaterNavigationSteeringResult | null {
  for (const obstacle of obstacles) {
    if (!pointInPolygon(start, obstacle.points)) continue
    for (const candidate of createPascalWaterNavigationEscapeCandidates(start, target, obstacle)) {
      if (!pointInPolygon(candidate, surfacePoints)) continue
      if (pointInPascalWaterNavigationObstacle(candidate, obstacles)) continue
      if (
        pascalWaterNavigationSegmentBlockedByOtherObstacles(start, candidate, obstacles, obstacle)
      ) {
        continue
      }
      const onward = resolvePascalWaterNavigationSteeringPoint(
        candidate,
        target,
        obstacles,
        doorPortals,
        surfacePoints,
        stairPortals,
      )
      if (!onward) continue
      return { kind: 'recovery', point: candidate }
    }
  }
  return null
}

function createPascalWaterNavigationEscapeCandidates(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacle: PascalWaterNavigationObstacle,
) {
  const boundary = closestPointOnClosedPolyline(start, obstacle.points) ?? start
  const centroid = centroidForPolygon(obstacle.points)
  const outward = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
  const targetDirection = normalize2(target.x - start.x, target.z - start.z)
  const right = { x: -targetDirection.z, z: targetDirection.x }
  const escapeDistance = Math.max(
    PASCAL_WATER_NAVIGATION_VERTEX_OFFSET_METERS,
    PASCAL_WATER_CLICK_MOVE_WAYPOINT_RADIUS + PASCAL_WATER_CLICK_MOVE_PROGRESS_EPSILON_METERS,
  )

  return [
    {
      x: boundary.x + outward.x * escapeDistance,
      z: boundary.z + outward.z * escapeDistance,
    },
    {
      x: boundary.x + outward.x * escapeDistance + right.x * escapeDistance,
      z: boundary.z + outward.z * escapeDistance + right.z * escapeDistance,
    },
    {
      x: boundary.x + outward.x * escapeDistance - right.x * escapeDistance,
      z: boundary.z + outward.z * escapeDistance - right.z * escapeDistance,
    },
  ]
}

function pascalWaterNavigationSegmentBlockedByOtherObstacles(
  start: LandrushPoint2,
  end: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  ignoredObstacle: PascalWaterNavigationObstacle,
) {
  for (const obstacle of obstacles) {
    if (obstacle === ignoredObstacle) continue
    if (pascalWaterNavigationSegmentIntersectsPolygon(start, end, obstacle.points)) return true
  }
  return false
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

function createCenteredParcelGeometry(
  parcel: ParcelAllocationParcel,
  shapePoints: readonly LandrushPoint2[] = parcel.points,
  center: LandrushPoint2 = parcel.centroid,
) {
  const geometry = new BufferGeometry()
  const ring = openPointRing(shapePoints)
  if (ring.length < 3) return geometry

  const points = ring.map((point) => new Vector2(point.x - center.x, -(point.z - center.z)))
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

function createCenteredParcelContourGeometry(
  parcel: ParcelAllocationParcel,
  shapePoints: readonly LandrushPoint2[] = parcel.points,
  center: LandrushPoint2 = parcel.centroid,
) {
  const geometry = new BufferGeometry()
  const ring = openPointRing(shapePoints)
  if (ring.length < 3) return geometry

  const positions = new Float32Array(ring.length * 2 * 3)
  ring.forEach((point, index) => {
    const nextPoint = ring[(index + 1) % ring.length]
    if (!nextPoint) return
    const offset = index * 6
    positions[offset] = point.x - center.x
    positions[offset + 1] = -(point.z - center.z)
    positions[offset + 2] = 0
    positions[offset + 3] = nextPoint.x - center.x
    positions[offset + 4] = -(nextPoint.z - center.z)
    positions[offset + 5] = 0
  })
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
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

function pickPascalWaterWalkTargetPoint({
  camera,
  canvas,
  colliderMeshes,
  event,
  groundY,
  pointerNdc,
  raycaster,
}: {
  camera: Camera
  canvas: HTMLCanvasElement
  colliderMeshes: Mesh[]
  event: Pick<MouseEvent | PointerEvent, 'clientX' | 'clientY'>
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

  const hits = raycaster.intersectObjects(colliderMeshes, false)
  for (const hit of hits) {
    if (!hit.face) continue
    const normalY = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y
    if (normalY < PASCAL_WATER_WALK_TARGET_MIN_NORMAL_Y) continue
    return { x: hit.point.x, z: hit.point.z }
  }

  return pickPascalWaterBuildGroundPoint({
    camera,
    canvas,
    event,
    groundY,
    pointerNdc,
    raycaster,
  })
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
  event: Pick<MouseEvent | PointerEvent, 'clientX' | 'clientY'>
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

function pointerEventInPascalWaterCanvas(
  event: MouseEvent | PointerEvent,
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect()
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

function isPascalWaterInteractivePointerTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLCanvasElement) return false
  return Boolean(
    target.closest(
      'button,a,input,textarea,select,[role="button"],[role="menuitem"],[data-landrush-ui]',
    ),
  )
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
    for (const footprint of createPascalWaterBuildNodeFootprints(node, 0, nodes)) {
      blockers.push({
        clearanceMeters: PASCAL_WATER_BUILT_GRASS_PADDING_METERS,
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
    if (node.type === 'wall') {
      for (const footprint of createPascalWaterWallNavigationFootprints(
        node,
        nodes,
        PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS,
      )) {
        obstacles.push({ kind: 'graph', nodeId: node.id as AnyNodeId, points: footprint })
      }
      continue
    }

    if (node.type === 'stair') {
      for (const footprint of createPascalWaterStairNavigationFootprints(
        node,
        nodes,
        PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS,
      )) {
        obstacles.push({ kind: 'stair', nodeId: footprint.nodeId, points: footprint.points })
      }
      continue
    }

    const footprint = createPascalWaterBuildNodeFootprint(
      node,
      PASCAL_WATER_NAVIGATION_OBSTACLE_PADDING_METERS,
    )
    if (!footprint) continue
    obstacles.push({
      kind: 'asset',
      nodeId: node.id as AnyNodeId,
      points: footprint,
    })
  }
  return obstacles
}

function createPascalWaterDoorPortals(
  nodes: Record<string, AnyNode>,
): readonly PascalWaterDoorPortal[] {
  const portals: PascalWaterDoorPortal[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== 'door') continue
    const wallId = node.wallId ?? node.parentId
    const wall = wallId ? nodes[wallId as AnyNodeId] : undefined
    if (wall?.type !== 'wall') continue
    const wallFrame = resolvePascalWaterWallFrame(wall)
    if (!wallFrame) continue

    const centerX = MathUtils.clamp(node.position[0], 0, wallFrame.length)
    const crossingDistance = PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS
    const center = {
      x: wall.start[0] + wallFrame.dir.x * centerX,
      z: wall.start[1] + wallFrame.dir.z * centerX,
    }
    portals.push({
      center,
      doorId: node.id as AnyNodeId,
      halfWidth: Math.max(0.18, node.width / 2),
      normal: wallFrame.normal,
      sideA: {
        x: center.x + wallFrame.normal.x * crossingDistance,
        z: center.z + wallFrame.normal.z * crossingDistance,
      },
      sideB: {
        x: center.x - wallFrame.normal.x * crossingDistance,
        z: center.z - wallFrame.normal.z * crossingDistance,
      },
      tangent: wallFrame.dir,
    })
  }
  return portals
}

function createPascalWaterStairPortals(
  nodes: Record<string, AnyNode>,
): readonly PascalWaterStairPortal[] {
  const portals: PascalWaterStairPortal[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== 'stair' || !isPascalWaterBuildObjectNode(node)) continue
    portals.push(...createPascalWaterStairNavigationPortals(node, nodes))
  }
  return portals
}

function createPascalWaterStairNavigationFootprints(
  stair: PascalWaterStairNode,
  nodes: Record<string, AnyNode>,
  padding: number,
): readonly PascalWaterStairNavigationFootprint[] {
  const layouts = createPascalWaterStraightStairSegmentLayouts(stair, nodes)
  if (layouts.length === 0) {
    return [
      {
        nodeId: stair.id as AnyNodeId,
        points: createPascalWaterFallbackStairFootprint(stair, padding),
      },
    ]
  }

  return layouts.map((layout) => ({
    nodeId: layout.nodeId,
    points: rectFootprintFromAxes({
      center: layout.center,
      depth: layout.length + padding * 2,
      normal: layout.normal,
      tangent: layout.tangent,
      width: layout.width + padding * 2,
    }),
  }))
}

function createPascalWaterStairNavigationPortals(
  stair: PascalWaterStairNode,
  nodes: Record<string, AnyNode>,
): readonly PascalWaterStairPortal[] {
  const layouts = createPascalWaterStraightStairSegmentLayouts(stair, nodes)
  if (layouts.length === 0) return [createPascalWaterFallbackStairPortal(stair)]

  return layouts.map((layout) => {
    const sideDistance = layout.length / 2 + PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS
    return {
      center: layout.center,
      halfRun: layout.length / 2,
      halfWidth: Math.max(0.2, layout.width / 2),
      nodeId: layout.nodeId,
      normal: layout.normal,
      sideA: {
        x: layout.center.x + layout.normal.x * sideDistance,
        z: layout.center.z + layout.normal.z * sideDistance,
      },
      sideB: {
        x: layout.center.x - layout.normal.x * sideDistance,
        z: layout.center.z - layout.normal.z * sideDistance,
      },
      tangent: layout.tangent,
    }
  })
}

function createPascalWaterStraightStairSegmentLayouts(
  stair: PascalWaterStairNode,
  nodes: Record<string, AnyNode>,
): readonly PascalWaterStairSegmentLayout[] {
  if ((stair.stairType ?? 'straight') !== 'straight') return []

  const segments = (stair.children ?? [])
    .map((childId) => nodes[childId as AnyNodeId] as PascalWaterStairSegmentNode | undefined)
    .filter(
      (segment): segment is PascalWaterStairSegmentNode =>
        segment?.type === 'stair-segment' && segment.visible !== false,
    )
  const entry = buildFloorplanStairEntry(stair, segments)
  if (!entry) return []

  return entry.segments.flatMap((segmentEntry) => {
    const centerLine = segmentEntry.centerLine
    const polygon = segmentEntry.polygon
    const segment = segmentEntry.segment
    if (!centerLine || polygon.length < 4) return []

    const runX = centerLine.end.x - centerLine.start.x
    const runZ = centerLine.end.y - centerLine.start.y
    const normal = normalize2(runX, runZ)
    const center = {
      x: (centerLine.start.x + centerLine.end.x) / 2,
      z: (centerLine.start.y + centerLine.end.y) / 2,
    }

    return [
      {
        center,
        length: Math.max(0.1, segment.length),
        normal,
        nodeId: segment.id as AnyNodeId,
        tangent: normalize2(normal.z, -normal.x),
        width: Math.max(0.1, segment.width),
      },
    ]
  })
}

function createPascalWaterFallbackStairPortal(stair: PascalWaterStairNode): PascalWaterStairPortal {
  const footprint = createPascalWaterFallbackStairFootprint(stair, 0)
  const center = polygonCentroid(footprint)
  const normal = normalize2(Math.sin(stair.rotation ?? 0), Math.cos(stair.rotation ?? 0))
  const run = Math.max(0.8, stair.stepCount * 0.28 + stair.topLandingDepth)
  const sideDistance = run / 2 + PASCAL_WATER_DOOR_CROSSING_CLEARANCE_METERS
  return {
    center,
    halfRun: run / 2,
    halfWidth: Math.max(0.2, stair.width / 2),
    nodeId: stair.id as AnyNodeId,
    normal,
    sideA: {
      x: center.x + normal.x * sideDistance,
      z: center.z + normal.z * sideDistance,
    },
    sideB: {
      x: center.x - normal.x * sideDistance,
      z: center.z - normal.z * sideDistance,
    },
    tangent: normalize2(normal.z, -normal.x),
  }
}

function createPascalWaterFallbackStairFootprint(
  stair: PascalWaterStairNode,
  padding: number,
): readonly LandrushPoint2[] {
  const run = Math.max(0.8, stair.stepCount * 0.28 + stair.topLandingDepth)
  const normal = normalize2(Math.sin(stair.rotation ?? 0), Math.cos(stair.rotation ?? 0))
  return rectFootprintFromAxes({
    center: { x: stair.position[0], z: stair.position[2] },
    depth: run + padding * 2,
    normal,
    tangent: normalize2(normal.z, -normal.x),
    width: stair.width + padding * 2,
  })
}

function createPascalWaterWallNavigationFootprints(
  wall: Extract<AnyNode, { type: 'wall' }>,
  nodes: Record<string, AnyNode>,
  padding: number,
): readonly (readonly LandrushPoint2[])[] {
  const wallFrame = resolvePascalWaterWallFrame(wall)
  if (!wallFrame) return []

  const openings = collectPascalWaterWallDoorOpenings(wall, nodes)
  if (openings.length === 0) {
    return [
      segmentFootprint(
        { x: wall.start[0], z: wall.start[1] },
        { x: wall.end[0], z: wall.end[1] },
        (wall.thickness ?? 0.18) + padding * 2,
      ),
    ]
  }

  const footprints: (readonly LandrushPoint2[])[] = []
  let cursor = 0
  for (const opening of openings) {
    if (opening.start - cursor > 0.08) {
      footprints.push(
        segmentFootprint(
          pointOnPascalWaterWall(wall, wallFrame, cursor),
          pointOnPascalWaterWall(wall, wallFrame, opening.start),
          (wall.thickness ?? 0.18) + padding * 2,
        ),
      )
    }
    cursor = Math.max(cursor, opening.end)
  }
  if (wallFrame.length - cursor > 0.08) {
    footprints.push(
      segmentFootprint(
        pointOnPascalWaterWall(wall, wallFrame, cursor),
        pointOnPascalWaterWall(wall, wallFrame, wallFrame.length),
        (wall.thickness ?? 0.18) + padding * 2,
      ),
    )
  }
  return footprints
}

function collectPascalWaterWallDoorOpenings(
  wall: Extract<AnyNode, { type: 'wall' }>,
  nodes: Record<string, AnyNode>,
) {
  const wallFrame = resolvePascalWaterWallFrame(wall)
  if (!wallFrame) return []

  const openings: { end: number; start: number }[] = []
  const doorIds = new Set<AnyNodeId>((wall.children ?? []).map((childId) => childId as AnyNodeId))
  for (const node of Object.values(nodes)) {
    if (node.type !== 'door') continue
    if (node.wallId !== wall.id && node.parentId !== wall.id) continue
    doorIds.add(node.id as AnyNodeId)
  }

  for (const doorId of doorIds) {
    const child = nodes[doorId]
    if (child?.type !== 'door') continue
    const centerX = MathUtils.clamp(child.position[0], 0, wallFrame.length)
    const halfWidth = Math.max(0.18, child.width / 2)
    openings.push({
      end: MathUtils.clamp(centerX + halfWidth, 0, wallFrame.length),
      start: MathUtils.clamp(centerX - halfWidth, 0, wallFrame.length),
    })
  }

  return openings.sort((first, second) => first.start - second.start)
}

function resolvePascalWaterWallFrame(wall: Extract<AnyNode, { type: 'wall' }>) {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  if (length <= 0.000001) return null

  const dir = { x: dx / length, z: dz / length }
  return {
    dir,
    length,
    normal: { x: -dir.z, z: dir.x },
  }
}

function pointOnPascalWaterWall(
  wall: Extract<AnyNode, { type: 'wall' }>,
  frame: NonNullable<ReturnType<typeof resolvePascalWaterWallFrame>>,
  localX: number,
) {
  return {
    x: wall.start[0] + frame.dir.x * localX,
    z: wall.start[1] + frame.dir.z * localX,
  }
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
    node.type === 'shelf' ||
    node.type === 'column' ||
    node.type === 'elevator' ||
    node.type === 'stair'
  )
}

function resolvePascalWaterNavigationSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  doorPortals: readonly PascalWaterDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly PascalWaterStairPortal[] = [],
): PascalWaterNavigationSteeringResult | null {
  const directPassable = pascalWaterNavigationSegmentPassable(
    start,
    target,
    obstacles,
    surfacePoints,
  )
  const doorCrossingPoint = resolvePascalWaterDoorCrossingSteeringPoint(
    start,
    target,
    obstacles,
    doorPortals,
    surfacePoints,
    directPassable,
  )
  if (doorCrossingPoint) return doorCrossingPoint
  const stairCrossingPoint = resolvePascalWaterStairCrossingSteeringPoint(
    start,
    target,
    obstacles,
    stairPortals,
    surfacePoints,
    directPassable,
  )
  if (stairCrossingPoint) return stairCrossingPoint
  if (directPassable) return { kind: 'direct', point: target }

  const candidates = collectPascalWaterNavigationCandidates(
    start,
    target,
    obstacles,
    doorPortals,
    surfacePoints,
    stairPortals,
  )
  const points = [start, target, ...candidates]
  const targetIndex = 1
  const distances = new Array(points.length).fill(Number.POSITIVE_INFINITY) as number[]
  const previous = new Array(points.length).fill(-1) as number[]
  const visited = new Set<number>()
  distances[0] = 0

  while (visited.size < points.length) {
    let currentIndex = -1
    let currentDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < points.length; index += 1) {
      if (visited.has(index)) continue
      const distance = distances[index] ?? Number.POSITIVE_INFINITY
      if (distance < currentDistance) {
        currentDistance = distance
        currentIndex = index
      }
    }

    if (currentIndex < 0 || currentDistance === Number.POSITIVE_INFINITY) break
    if (currentIndex === targetIndex) break
    visited.add(currentIndex)

    const current = points[currentIndex]
    if (!current) continue
    for (let nextIndex = 1; nextIndex < points.length; nextIndex += 1) {
      if (visited.has(nextIndex)) continue
      const next = points[nextIndex]
      if (!next || !pascalWaterNavigationSegmentPassable(current, next, obstacles, surfacePoints)) {
        continue
      }
      const nextDistance = currentDistance + Math.hypot(next.x - current.x, next.z - current.z)
      if (nextDistance < (distances[nextIndex] ?? Number.POSITIVE_INFINITY)) {
        distances[nextIndex] = nextDistance
        previous[nextIndex] = currentIndex
      }
    }
  }

  if ((distances[targetIndex] ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) return null

  let routeIndex = targetIndex
  let parentIndex = previous[routeIndex] ?? -1
  while (parentIndex > 0) {
    routeIndex = parentIndex
    parentIndex = previous[routeIndex] ?? -1
  }
  const point = points[routeIndex]
  return point ? { kind: 'graph', point } : null
}

function resolvePascalWaterDoorCrossingSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  doorPortals: readonly PascalWaterDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  directPassable: boolean,
): PascalWaterNavigationSteeringResult | null {
  let best: { point: PascalWaterNavigationSteeringResult; score: number } | null = null

  for (const portal of doorPortals) {
    const startSigned = signedPascalWaterDoorPortalDistance(start, portal)
    const targetSigned = signedPascalWaterDoorPortalDistance(target, portal)
    const startTangent = tangentPascalWaterDoorPortalDistance(start, portal)
    const targetTangent = tangentPascalWaterDoorPortalDistance(target, portal)
    const tangentLimit = portal.halfWidth + PASCAL_WATER_DOOR_CROSSING_TANGENT_MARGIN_METERS
    const startNearCenter =
      Math.abs(startSigned) <= PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS &&
      Math.abs(startTangent) <= tangentLimit
    const targetNearCenter =
      Math.abs(targetSigned) <= PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS &&
      Math.abs(targetTangent) <= tangentLimit
    const segmentCrossing = resolvePascalWaterDoorSegmentCrossing(start, target, portal)
    const directPathUsesDoor = Boolean(
      segmentCrossing && Math.abs(segmentCrossing.tangent) <= tangentLimit,
    )

    if (directPassable && !directPathUsesDoor && !startNearCenter && !targetNearCenter) {
      continue
    }

    const crossesDoorPlane =
      startSigned * targetSigned < 0 || startNearCenter || targetNearCenter || directPathUsesDoor
    if (!crossesDoorPlane) continue

    const targetSide = portalSideForSignedDistance(targetSigned)
    const startSide = portalSideForSignedDistance(startSigned) ?? -targetSide
    if (targetSide === 0) continue

    const entrySide = startNearCenter ? -targetSide : startSide || -targetSide
    const exitSide = targetSide
    const entry = portalPointForSide(portal, entrySide)
    const exit = portalPointForSide(portal, exitSide)
    const route = [entry, portal.center, exit] as const

    if (!route.every((point) => pointInPolygonOrNearEdge(point, surfacePoints))) continue
    if (
      !pascalWaterNavigationSegmentPassable(entry, portal.center, obstacles, surfacePoints) ||
      !pascalWaterNavigationSegmentPassable(portal.center, exit, obstacles, surfacePoints)
    ) {
      continue
    }

    if (!directPassable) {
      const startToEntryReached =
        Math.hypot(start.x - entry.x, start.z - entry.z) <=
        PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS
      const exitToTargetReached =
        Math.hypot(target.x - exit.x, target.z - exit.z) <=
        PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS
      if (
        !startToEntryReached &&
        !pascalWaterNavigationSegmentPassable(start, entry, obstacles, surfacePoints)
      ) {
        continue
      }
      if (
        !exitToTargetReached &&
        !pascalWaterNavigationSegmentPassable(exit, target, obstacles, surfacePoints)
      ) {
        continue
      }
    }

    const nextPoint = nextPascalWaterDoorCrossingWaypoint(start, entry, portal.center, exit)
    if (!nextPoint) continue
    const phase = pascalWaterDoorCrossingPhaseForPoint(nextPoint, entry, portal.center, exit)
    const score =
      Math.hypot(start.x - entry.x, start.z - entry.z) +
      Math.hypot(entry.x - portal.center.x, entry.z - portal.center.z) +
      Math.hypot(portal.center.x - exit.x, portal.center.z - exit.z) +
      Math.hypot(exit.x - target.x, exit.z - target.z)
    if (!best || score < best.score) {
      best = {
        point: {
          doorCrossing: {
            center: clonePoint2(portal.center),
            doorId: portal.doorId,
            entry: clonePoint2(entry),
            exit: clonePoint2(exit),
            kind: 'door',
            nodeId: portal.doorId,
            phase,
          },
          doorId: portal.doorId,
          kind: 'door',
          point: nextPoint,
        },
        score,
      }
    }
  }

  return best?.point ?? null
}

function resolvePascalWaterStairCrossingSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  stairPortals: readonly PascalWaterStairPortal[],
  surfacePoints: readonly LandrushPoint2[],
  directPassable: boolean,
): PascalWaterNavigationSteeringResult | null {
  let best: { point: PascalWaterNavigationSteeringResult; score: number } | null = null

  for (const portal of stairPortals) {
    const crossingObstacles = pascalWaterNavigationObstaclesWithoutNode(obstacles, portal.nodeId)
    const startSigned = signedPascalWaterStairPortalDistance(start, portal)
    const targetSigned = signedPascalWaterStairPortalDistance(target, portal)
    const startTangent = tangentPascalWaterStairPortalDistance(start, portal)
    const targetTangent = tangentPascalWaterStairPortalDistance(target, portal)
    const tangentLimit = portal.halfWidth + PASCAL_WATER_DOOR_CROSSING_TANGENT_MARGIN_METERS
    const runLimit = portal.halfRun + PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS
    const startWithinStair =
      Math.abs(startSigned) <= runLimit && Math.abs(startTangent) <= tangentLimit
    const targetWithinStair =
      Math.abs(targetSigned) <= runLimit && Math.abs(targetTangent) <= tangentLimit
    const segmentCrossing = resolvePascalWaterStairSegmentCrossing(start, target, portal)
    const directPathUsesStair = Boolean(
      segmentCrossing && Math.abs(segmentCrossing.tangent) <= tangentLimit,
    )

    if (directPassable && !directPathUsesStair && !startWithinStair && !targetWithinStair) {
      continue
    }

    const crossesStairRun =
      startSigned * targetSigned < 0 || startWithinStair || targetWithinStair || directPathUsesStair
    if (!crossesStairRun) continue

    const signedTargetSide = portalSideForSignedDistance(targetSigned)
    const signedStartSide = portalSideForSignedDistance(startSigned)
    const startSide = signedStartSide || -signedTargetSide || 1
    const exitSide = targetWithinStair || signedTargetSide === 0 ? -startSide : signedTargetSide
    const entrySide = startWithinStair ? -exitSide : startSide
    const entry = stairPortalPointForSide(portal, entrySide)
    const exit = stairPortalPointForSide(portal, exitSide)
    const route = [entry, portal.center, exit] as const

    if (!route.every((point) => pointInPolygonOrNearEdge(point, surfacePoints))) continue
    if (
      !pascalWaterNavigationSegmentPassable(
        entry,
        portal.center,
        crossingObstacles,
        surfacePoints,
      ) ||
      !pascalWaterNavigationSegmentPassable(portal.center, exit, crossingObstacles, surfacePoints)
    ) {
      continue
    }

    if (!directPassable) {
      const startToEntryReached =
        Math.hypot(start.x - entry.x, start.z - entry.z) <=
        PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS
      const exitToTargetReached =
        targetWithinStair ||
        Math.hypot(target.x - exit.x, target.z - exit.z) <=
          PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS
      if (
        !startToEntryReached &&
        !pascalWaterNavigationSegmentPassable(start, entry, crossingObstacles, surfacePoints)
      ) {
        continue
      }
      if (
        !exitToTargetReached &&
        !pascalWaterNavigationSegmentPassable(exit, target, crossingObstacles, surfacePoints)
      ) {
        continue
      }
    }

    const nextPoint = nextPascalWaterDoorCrossingWaypoint(start, entry, portal.center, exit)
    if (!nextPoint) continue
    const phase = pascalWaterDoorCrossingPhaseForPoint(nextPoint, entry, portal.center, exit)
    const score =
      Math.hypot(start.x - entry.x, start.z - entry.z) +
      Math.hypot(entry.x - portal.center.x, entry.z - portal.center.z) +
      Math.hypot(portal.center.x - exit.x, portal.center.z - exit.z) +
      Math.hypot(exit.x - target.x, exit.z - target.z)
    if (!best || score < best.score) {
      best = {
        point: {
          doorCrossing: {
            center: clonePoint2(portal.center),
            entry: clonePoint2(entry),
            exit: clonePoint2(exit),
            kind: 'stair',
            nodeId: portal.nodeId,
            phase,
          },
          kind: 'stair',
          point: nextPoint,
        },
        score,
      }
    }
  }

  return best?.point ?? null
}

function signedPascalWaterDoorPortalDistance(point: LandrushPoint2, portal: PascalWaterDoorPortal) {
  return (
    (point.x - portal.center.x) * portal.normal.x + (point.z - portal.center.z) * portal.normal.z
  )
}

function tangentPascalWaterDoorPortalDistance(
  point: LandrushPoint2,
  portal: PascalWaterDoorPortal,
) {
  return (
    (point.x - portal.center.x) * portal.tangent.x + (point.z - portal.center.z) * portal.tangent.z
  )
}

function portalSideForSignedDistance(distance: number) {
  if (distance > PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS) return 1
  if (distance < -PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS) return -1
  return 0
}

function portalPointForSide(portal: PascalWaterDoorPortal, side: number) {
  return side >= 0 ? portal.sideA : portal.sideB
}

function signedPascalWaterStairPortalDistance(
  point: LandrushPoint2,
  portal: PascalWaterStairPortal,
) {
  return (
    (point.x - portal.center.x) * portal.normal.x + (point.z - portal.center.z) * portal.normal.z
  )
}

function tangentPascalWaterStairPortalDistance(
  point: LandrushPoint2,
  portal: PascalWaterStairPortal,
) {
  return (
    (point.x - portal.center.x) * portal.tangent.x + (point.z - portal.center.z) * portal.tangent.z
  )
}

function stairPortalPointForSide(portal: PascalWaterStairPortal, side: number) {
  return side >= 0 ? portal.sideA : portal.sideB
}

function resolvePascalWaterStairConnectorTarget(
  start: LandrushPoint2,
  target: LandrushPoint2,
  stairPortals: readonly PascalWaterStairPortal[],
): LandrushPoint2 {
  let best: { point: LandrushPoint2; score: number } | null = null

  for (const portal of stairPortals) {
    const targetSigned = signedPascalWaterStairPortalDistance(target, portal)
    const targetTangent = tangentPascalWaterStairPortalDistance(target, portal)
    const tangentLimit = portal.halfWidth + PASCAL_WATER_DOOR_CROSSING_TANGENT_MARGIN_METERS
    const runLimit = portal.halfRun + PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS
    if (Math.abs(targetSigned) > runLimit || Math.abs(targetTangent) > tangentLimit) continue

    const startSigned = signedPascalWaterStairPortalDistance(start, portal)
    const startSide = portalSideForSignedDistance(startSigned)
    const targetSide = portalSideForSignedDistance(targetSigned)
    const exitSide = startSide ? -startSide : targetSide || 1
    const point = stairPortalPointForSide(portal, exitSide)
    const score = Math.abs(targetSigned) + Math.abs(targetTangent)
    if (!best || score < best.score) best = { point, score }
  }

  return best?.point ?? target
}

function resolvePascalWaterDoorSegmentCrossing(
  start: LandrushPoint2,
  target: LandrushPoint2,
  portal: PascalWaterDoorPortal,
) {
  const startSigned = signedPascalWaterDoorPortalDistance(start, portal)
  const targetSigned = signedPascalWaterDoorPortalDistance(target, portal)
  const denominator = startSigned - targetSigned
  if (Math.abs(denominator) <= 0.000001) return null
  const t = startSigned / denominator
  if (t < 0 || t > 1) return null
  const point = {
    x: start.x + (target.x - start.x) * t,
    z: start.z + (target.z - start.z) * t,
  }
  return {
    point,
    tangent: tangentPascalWaterDoorPortalDistance(point, portal),
  }
}

function resolvePascalWaterStairSegmentCrossing(
  start: LandrushPoint2,
  target: LandrushPoint2,
  portal: PascalWaterStairPortal,
) {
  const startSigned = signedPascalWaterStairPortalDistance(start, portal)
  const targetSigned = signedPascalWaterStairPortalDistance(target, portal)
  const denominator = startSigned - targetSigned
  if (Math.abs(denominator) <= 0.000001) return null
  const t = startSigned / denominator
  if (t < 0 || t > 1) return null
  const point = {
    x: start.x + (target.x - start.x) * t,
    z: start.z + (target.z - start.z) * t,
  }
  return {
    point,
    tangent: tangentPascalWaterStairPortalDistance(point, portal),
  }
}

function nextPascalWaterDoorCrossingWaypoint(
  start: LandrushPoint2,
  entry: LandrushPoint2,
  center: LandrushPoint2,
  exit: LandrushPoint2,
) {
  const routeX = exit.x - entry.x
  const routeZ = exit.z - entry.z
  const routeLength = Math.hypot(routeX, routeZ)
  if (routeLength <= 0.000001) return null

  const routeDirX = routeX / routeLength
  const routeDirZ = routeZ / routeLength
  const progressFromEntry = (start.x - entry.x) * routeDirX + (start.z - entry.z) * routeDirZ
  const centerFromEntry = (center.x - entry.x) * routeDirX + (center.z - entry.z) * routeDirZ
  const lateralFromRoute = Math.abs(
    (start.x - entry.x) * -routeDirZ + (start.z - entry.z) * routeDirX,
  )
  const entryDistance = Math.hypot(start.x - entry.x, start.z - entry.z)
  const centerDistance = Math.hypot(start.x - center.x, start.z - center.z)
  const exitDistance = Math.hypot(start.x - exit.x, start.z - exit.z)
  const entryAligned =
    entryDistance <= PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS ||
    (progressFromEntry >= -PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS &&
      lateralFromRoute <= PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS)
  const centerAligned =
    centerDistance <= PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS ||
    (progressFromEntry >= centerFromEntry - PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS &&
      lateralFromRoute <= PASCAL_WATER_DOOR_CROSSING_CENTER_RADIUS)
  const exitAligned =
    exitDistance <= PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS ||
    (progressFromEntry >= routeLength - PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS &&
      lateralFromRoute <= PASCAL_WATER_DOOR_CROSSING_WAYPOINT_RADIUS)

  if (!entryAligned) {
    return entry
  }
  if (!centerAligned) {
    return center
  }
  if (!exitAligned) {
    return exit
  }
  return null
}

function pascalWaterDoorCrossingPhaseForPoint(
  point: LandrushPoint2,
  entry: LandrushPoint2,
  center: LandrushPoint2,
  exit: LandrushPoint2,
): PascalWaterDoorCrossingPhase {
  if (Math.hypot(point.x - entry.x, point.z - entry.z) <= 0.001) return 'entry'
  if (Math.hypot(point.x - center.x, point.z - center.z) <= 0.001) return 'center'
  if (Math.hypot(point.x - exit.x, point.z - exit.z) <= 0.001) return 'exit'
  return 'entry'
}

function collectPascalWaterNavigationCandidates(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  doorPortals: readonly PascalWaterDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly PascalWaterStairPortal[] = [],
) {
  const candidates: LandrushPoint2[] = []
  for (const portal of doorPortals) {
    for (const point of [portal.sideA, portal.center, portal.sideB]) {
      if (!pointInPolygon(point, surfacePoints)) continue
      if (pointInPascalWaterNavigationObstacle(point, obstacles)) continue
      candidates.push(point)
    }
  }
  for (const portal of stairPortals) {
    for (const point of [portal.sideA, portal.center, portal.sideB]) {
      if (!pointInPolygon(point, surfacePoints)) continue
      if (pointInPascalWaterNavigationObstacle(point, obstacles)) continue
      candidates.push(point)
    }
  }
  for (const obstacle of obstacles) {
    for (const vertex of obstacle.points) {
      const candidate = offsetPascalWaterNavigationCandidate(
        vertex,
        obstacle.points,
        PASCAL_WATER_NAVIGATION_VERTEX_OFFSET_METERS,
      )
      if (!pointInPolygon(candidate, surfacePoints)) continue
      if (pointInPascalWaterNavigationObstacle(candidate, obstacles)) continue
      candidates.push(candidate)
    }
  }

  return candidates
    .sort(
      (first, second) =>
        navigationCandidateScore(first, start, target) -
        navigationCandidateScore(second, start, target),
    )
    .slice(0, PASCAL_WATER_NAVIGATION_MAX_GRAPH_POINTS)
}

function navigationCandidateScore(
  candidate: LandrushPoint2,
  start: LandrushPoint2,
  target: LandrushPoint2,
) {
  return (
    Math.hypot(candidate.x - start.x, candidate.z - start.z) +
    Math.hypot(target.x - candidate.x, target.z - candidate.z)
  )
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

function pascalWaterNavigationSegmentPassable(
  start: LandrushPoint2,
  end: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
) {
  return (
    pascalWaterNavigationSegmentInSurface(start, end, surfacePoints) &&
    !pascalWaterNavigationSegmentBlocked(start, end, obstacles)
  )
}

function pascalWaterNavigationSegmentInSurface(
  start: LandrushPoint2,
  end: LandrushPoint2,
  surfacePoints: readonly LandrushPoint2[],
) {
  if (!pointInPolygonOrNearEdge(start, surfacePoints)) return false
  if (!pointInPolygonOrNearEdge(end, surfacePoints)) return false

  const ring = openPointRing(surfacePoints)
  for (let index = 0; index < ring.length; index += 1) {
    const edgeStart = ring[index]
    const edgeEnd = ring[(index + 1) % ring.length]
    if (!edgeStart || !edgeEnd) continue
    if (!segmentsIntersect2(start, end, edgeStart, edgeEnd)) continue
    if (pointsAlmostEqual2(start, edgeStart) || pointsAlmostEqual2(start, edgeEnd)) continue
    if (pointsAlmostEqual2(end, edgeStart) || pointsAlmostEqual2(end, edgeEnd)) continue
    return false
  }
  return true
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

function pascalWaterNavigationObstaclesWithoutNode(
  obstacles: readonly PascalWaterNavigationObstacle[],
  nodeId: AnyNodeId,
) {
  return obstacles.filter((obstacle) => obstacle.nodeId !== nodeId)
}

function pointInPascalWaterNavigationObstacle(
  point: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
) {
  for (const obstacle of obstacles) {
    if (pointInPolygon(point, obstacle.points)) return true
  }
  return false
}

function pointInPascalWaterBlockingNavigationObstacle(
  point: LandrushPoint2,
  obstacles: readonly PascalWaterNavigationObstacle[],
) {
  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair') continue
    if (pointInPolygon(point, obstacle.points)) return true
  }
  return false
}

function openApproachingPascalWaterDoorPortal(
  position: Vector3,
  movement: RobotMovementInput,
  doorPortals: readonly PascalWaterDoorPortal[],
) {
  openNearbyPascalWaterDoorPortal(position, doorPortals)

  const start = { x: position.x, z: position.z }
  const end = {
    x: start.x + movement.x * PASCAL_WATER_DOOR_OPEN_LOOKAHEAD_METERS,
    z: start.z + movement.z * PASCAL_WATER_DOOR_OPEN_LOOKAHEAD_METERS,
  }
  for (const portal of doorPortals) {
    const ahead = nearestForwardPascalWaterDoorPortalDistance(start, movement, portal)
    if (!Number.isFinite(ahead) || ahead > PASCAL_WATER_DOOR_OPEN_LOOKAHEAD_METERS) continue
    const distanceToPath = Math.min(
      distanceToSegment2(portal.center, start, end),
      distanceToSegment2(portal.sideA, start, end),
      distanceToSegment2(portal.sideB, start, end),
    )
    if (distanceToPath <= PASCAL_WATER_DOOR_OPEN_PATH_CLEARANCE_METERS) {
      openPascalWaterDoor(portal.doorId)
    }
  }
}

function openPascalWaterDoorPortalsAlongSegment(
  start: LandrushPoint2,
  target: LandrushPoint2,
  doorPortals: readonly PascalWaterDoorPortal[],
) {
  for (const portal of doorPortals) {
    const crossing = resolvePascalWaterDoorSegmentCrossing(start, target, portal)
    if (!crossing) continue
    const tangentLimit = portal.halfWidth + PASCAL_WATER_DOOR_CROSSING_TANGENT_MARGIN_METERS
    if (Math.abs(crossing.tangent) > tangentLimit) continue
    const openState = openPascalWaterDoor(portal.doorId)
    if (openState === 'started') {
      recordPascalWaterNavigationProbe({
        doorId: portal.doorId,
        kind: 'door-open-on-segment',
        tangent: roundPerf(crossing.tangent),
      })
    }
  }
}

function nearestForwardPascalWaterDoorPortalDistance(
  start: LandrushPoint2,
  movement: RobotMovementInput,
  portal: PascalWaterDoorPortal,
) {
  let nearest = Number.POSITIVE_INFINITY
  for (const point of [portal.sideA, portal.center, portal.sideB]) {
    const ahead = (point.x - start.x) * movement.x + (point.z - start.z) * movement.z
    if (ahead > 0 && ahead < nearest) nearest = ahead
  }
  return nearest
}

function openNearbyPascalWaterDoorPortal(
  position: Vector3,
  doorPortals: readonly PascalWaterDoorPortal[],
) {
  const point = { x: position.x, z: position.z }
  for (const portal of doorPortals) {
    const distance = Math.min(
      Math.hypot(point.x - portal.center.x, point.z - portal.center.z),
      Math.hypot(point.x - portal.sideA.x, point.z - portal.sideA.z),
      Math.hypot(point.x - portal.sideB.x, point.z - portal.sideB.z),
    )
    if (distance <= PASCAL_WATER_DOOR_OPEN_TRIGGER_METERS) {
      openPascalWaterDoor(portal.doorId)
    }
  }
}

function openPascalWaterDoor(doorId: AnyNodeId) {
  const node = useScene.getState().nodes[doorId]
  if (node?.type !== 'door' || node.openingKind === 'opening') return 'ignored'

  const interactive = useInteractive.getState()
  if (isOperationDoorType(node.doorType)) {
    const activeAnimation = interactive.doorAnimations[doorId]
    if (activeAnimation?.field === 'operationState' && activeAnimation.to >= 0.98) {
      return 'already-open'
    }
    const currentOpenAmount =
      interactive.doors[doorId]?.operationState ??
      (activeAnimation?.field === 'operationState' ? activeAnimation.to : undefined) ??
      node.operationState ??
      0
    if (currentOpenAmount >= 0.82) return 'already-open'
    interactive.startDoorAnimation(doorId, {
      durationMs: PASCAL_WATER_DOOR_OPEN_ANIMATION_MS,
      field: 'operationState',
      from: currentOpenAmount,
      persist: false,
      startedAt: null,
      to: 1,
    })
    return 'started'
  }

  const activeAnimation = interactive.doorAnimations[doorId]
  if (
    activeAnimation?.field === 'swingAngle' &&
    activeAnimation.to >= PASCAL_WATER_DOOR_OPEN_SWING_ANGLE * 0.98
  ) {
    return 'already-open'
  }
  const currentSwingAngle =
    interactive.doors[doorId]?.swingAngle ??
    (activeAnimation?.field === 'swingAngle' ? activeAnimation.to : undefined) ??
    node.swingAngle ??
    0
  if (currentSwingAngle >= PASCAL_WATER_DOOR_OPEN_SWING_ANGLE * 0.82) return 'already-open'
  interactive.startDoorAnimation(doorId, {
    durationMs: PASCAL_WATER_DOOR_OPEN_ANIMATION_MS,
    field: 'swingAngle',
    from: currentSwingAngle,
    persist: false,
    startedAt: null,
    to: PASCAL_WATER_DOOR_OPEN_SWING_ANGLE,
  })
  return 'started'
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

function pointsAlmostEqual2(first: LandrushPoint2, second: LandrushPoint2) {
  return Math.hypot(first.x - second.x, first.z - second.z) <= 0.000001
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

function rectFootprintFromAxes({
  center,
  depth,
  normal,
  tangent,
  width,
}: {
  center: LandrushPoint2
  depth: number
  normal: LandrushPoint2
  tangent: LandrushPoint2
  width: number
}): readonly LandrushPoint2[] {
  const halfWidth = Math.max(0.04, width / 2)
  const halfDepth = Math.max(0.04, depth / 2)
  return [
    {
      x: center.x - tangent.x * halfWidth - normal.x * halfDepth,
      z: center.z - tangent.z * halfWidth - normal.z * halfDepth,
    },
    {
      x: center.x + tangent.x * halfWidth - normal.x * halfDepth,
      z: center.z + tangent.z * halfWidth - normal.z * halfDepth,
    },
    {
      x: center.x + tangent.x * halfWidth + normal.x * halfDepth,
      z: center.z + tangent.z * halfWidth + normal.z * halfDepth,
    },
    {
      x: center.x - tangent.x * halfWidth + normal.x * halfDepth,
      z: center.z - tangent.z * halfWidth + normal.z * halfDepth,
    },
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

function closestPointOnClosedPolyline(
  point: LandrushPoint2,
  polygon: readonly LandrushPoint2[],
): LandrushPoint2 | null {
  const ring = openPointRing(polygon)
  let bestDistanceSq = Number.POSITIVE_INFINITY
  let bestPoint: LandrushPoint2 | null = null
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (!(start && end)) continue
    const candidate = closestPointOnSegment2(point, start, end)
    const distanceSq = (point.x - candidate.x) ** 2 + (point.z - candidate.z) ** 2
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq
      bestPoint = candidate
    }
  }
  return bestPoint
}

function closestPointOnSegment2(
  point: LandrushPoint2,
  start: LandrushPoint2,
  end: LandrushPoint2,
): LandrushPoint2 {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const t = clamp01(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 0.000001),
  )
  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
  }
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
