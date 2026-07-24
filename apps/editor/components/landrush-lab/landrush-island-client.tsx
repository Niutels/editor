'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type DoorAnimationState,
  emitter,
  type GridEvent,
  getLevelHeight,
  isOperationDoorType,
  type PascalWaterNode as LandrushIslandNode,
  type LandrushLayoutNode,
  LandrushLayoutNode as LandrushLayoutNodeSchema,
  type LandrushWorldNode,
  LandrushWorldNode as LandrushWorldNodeSchema,
  type LevelNode,
  sceneRegistry,
  useInteractive,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
  type WallEvent,
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
  createPascalWaterLandSurface as createLandrushIslandLandSurface,
  createPascalWaterSmoothedPerimeter as createLandrushIslandSmoothedPerimeter,
  PASCAL_WATER_LOW_ELEVATION as LANDRUSH_ISLAND_LOW_ELEVATION,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type PascalWaterLandSurface as LandrushIslandLandSurface,
  type LandrushWaterSurfaceParameters,
} from '@pascal-app/nodes'
import {
  LANDRUSH_ROBOT_HOVER_RESPONSE,
  LandrushRobot,
  type LandrushRobotAnimationState,
  type LandrushRobotHoverPoseSample,
  type LandrushRobotPresentationMode,
  resolveLandrushRobotHoverOffset,
} from '@pascal-app/nodes/landrush-world/robot'
import {
  getMaterialRendererBackend,
  renderScheduler,
  useViewer,
  type ViewerPresentationEffectDebugMode,
  type ViewerPresentationEffectState,
} from '@pascal-app/viewer'
import { Html, KeyboardControls, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { type RootState, useFrame, useThree } from '@react-three/fiber'
import {
  ChevronDown,
  ChevronRight,
  Eye,
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
  type Dispatch,
  memo,
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  Suspense,
  startTransition,
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
  Euler,
  type Group,
  type LineBasicMaterial,
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
  Spherical,
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
import { type LandrushGamepadInput, readLandrushGamepadInput } from './landrush-gamepad-input'
import {
  LandrushIslandPlacedTvScreens,
  type LandrushIslandTvMediaSettings,
} from './landrush-island-tv-screens'
import {
  createNaturalRoadMaskSegments,
  createNaturalRoadPlan,
  NaturalRoadNetworkLayer,
} from './natural-road-network-layer'
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
import {
  PASCAL_WORLD_ELEVATION_PARAMETERS,
  PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
} from './pascal-world-visual-defaults'
import {
  DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
  type ProceduralBeachControls,
  type ProceduralRockCliffRuntimeMetrics,
  ProceduralRockCliffs,
  type ProceduralRockCliffWallControls,
  type ProceduralRockOffshoreControls,
  type ProceduralRockToneControls,
} from './procedural-rock-cliffs'
import { LandrushRobotFootstepAudio } from './robot-footstep-audio'
import { isLandrushRevealObjectOwnedByRoot } from './robot-reveal-mesh-ownership'
import {
  clearLandrushRobotScreenRevealMask,
  createLandrushRobotScreenRevealOpacityNode,
  readLandrushRobotScreenRevealMaskSnapshot,
  updateLandrushRobotScreenRevealMask,
} from './robot-screen-reveal-mask'
import { StandaloneOceanWorld } from './standalone-ocean-client'
import {
  createDefaultStandaloneOceanParameters,
  type StandaloneOceanParameters,
} from './standalone-ocean-material'
import { StandaloneOceanParameterControls } from './standalone-ocean-parameter-controls'
import { STYLIZED_PATH_WIDTH_SCALE } from './stylized-path-network-layer'
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
import type { WaterlineInteractionField } from './waterline-interaction-field'
import {
  type ConnectionStatus,
  type LocalPlayerProfile,
  type MultiplayerPlayerSnapshot,
  type MultiplayerRemotePlayerStore,
  MultiplayerStatusPanel,
  type ParcelBuildNodesSnapshot,
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

const LANDRUSH_ISLAND_SITE_ID = 'site_landrush-island-debug'
const LANDRUSH_ISLAND_BUILDING_ID = 'building_landrush-island-debug'
const LANDRUSH_ISLAND_LEVEL_ID = 'level_landrush-island-debug'
const LANDRUSH_ISLAND_NODE_ID = 'pascal-water_debug-water'
const LANDRUSH_ISLAND_LAYOUT_NODE_ID = 'landrush-world_landrush-island-layout'
const PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID = 'landrush-layout_pascal-multiplayer-island-layout'
const LANDRUSH_ISLAND_CAMERA_POSITION = [88, 86, 94] as const
const LANDRUSH_ISLAND_CAMERA_TARGET = [0, 0, 0] as const
const LANDRUSH_ISLAND_CAMERA_ZOOM = 7.8
const LANDRUSH_ISLAND_MATERIAL_PARAMETERS = {
  ...LANDRUSH_WATER_SURFACE_PARAMETERS,
} satisfies LandrushWaterSurfaceParameters
const PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_CUT_COUNT = 17
const PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_SCALE = 1.02
const PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_SEED = 1847
const LANDRUSH_ISLAND_GAMEPAD_BUILD_MODES = [
  'select',
  'build',
  'material-paint',
  'delete',
] as const satisfies readonly LandrushIslandGamepadBuildMode[]
const LANDRUSH_ISLAND_ELEVATION_PARAMETERS = {
  ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  cliffColorAverageRatio: 0.92,
  cliffToneVariation: 0.12,
} satisfies IslandElevationParameters
const LANDRUSH_ISLAND_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} as const
const LANDRUSH_ISLAND_PARCEL_OVERLAY_COLOR = '#e0a35a'
const LANDRUSH_ISLAND_DIRT_ROAD_WIDTH_METERS =
  (DEFAULT_PARCEL_STREET_WIDTH_METERS +
    PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
    PARCEL_STREET_CURB_EXTRA_WIDTH_METERS) /
  2.35
const LANDRUSH_ISLAND_PROGRESSIVE_GRASS_BLADE_SUBDIVISIONS = 80
const LANDRUSH_ISLAND_PROGRESSIVE_GRASS_FIELD_RESOLUTION = 64
const LANDRUSH_ISLAND_INTERACTIVE_GRASS_FIELD_RESOLUTION = GRASS_FIELD_RESOLUTION
const LANDRUSH_ISLAND_GRASS_TEXTURE_TILE_METERS = 5
const LANDRUSH_ISLAND_GROUND_GRASS_BLOCKERS: readonly GrassFieldBlocker[] = []
const LANDRUSH_ISLAND_GRASS_GROUND_TINT_CAP_PERCENT = 80
const LANDRUSH_ISLAND_GRASS_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  colorPatchScale: 0.7,
  colorVariation: 0.5,
  density: 15_000,
  flutter: 0.28,
  greenTint: 0.55,
  gustScale: 0.5,
  heightNoiseScale: 0.15,
  heightVariation: 0.5,
  macroScale: 0.18,
  macroVariation: 0.05,
  projection: 0.74,
  scale: 1.55,
  treeSway: 0.7,
  turbulence: 0.28,
  windAngle: 45,
  windSpeed: 2,
  windStrength: 0.75,
} satisfies GrassBladeTuning
const LANDRUSH_ISLAND_MULTIPLAYER_ROOM_ID = 'landrush-lab-world-multiplayer'
const LANDRUSH_ISLAND_VISUAL_PLAYER_GROUND_Y = 0.04
const LANDRUSH_ISLAND_LOCAL_STATE_SEND_INTERVAL_MS = 80
const LANDRUSH_ISLAND_ROBOT_PREVIOUS_WALK_SPEED = 2.75
const LANDRUSH_ISLAND_ROBOT_WALK_SPEED = LANDRUSH_ISLAND_ROBOT_PREVIOUS_WALK_SPEED / 1.5
const LANDRUSH_ISLAND_ROBOT_RUN_SPEED = LANDRUSH_ISLAND_ROBOT_PREVIOUS_WALK_SPEED * 2.48
const LANDRUSH_ISLAND_ROBOT_ACCELERATION = 18
const LANDRUSH_ISLAND_ROBOT_DECELERATION = 24
const LANDRUSH_ISLAND_ROBOT_FALL_UP_SPEED = 6.8
const LANDRUSH_ISLAND_ROBOT_FALL_EDGE_TOLERANCE_METERS = 0.08
const LANDRUSH_ISLAND_ROBOT_FALL_MIN_FORWARD_SPEED = 1.85
const LANDRUSH_ISLAND_ROBOT_FALL_FORWARD_MOMENTUM_MULTIPLIER = 1.5
const LANDRUSH_ISLAND_ROBOT_FALL_GRAVITY = 9.2
const LANDRUSH_ISLAND_ROBOT_FALL_RESPAWN_DROP_METERS = 18
const LANDRUSH_ISLAND_ROBOT_FALL_RESPAWN_FALLBACK_AFTER_HIT_SECONDS = 2
const LANDRUSH_ISLAND_ROBOT_FALL_WATER_HOLD_SECONDS = 0.5
const LANDRUSH_ISLAND_ROBOT_FALL_WIGGLE_DELAY_SECONDS = 0.5
const LANDRUSH_ISLAND_ROBOT_FALL_WIGGLE_RAMP_SECONDS = 1.15
const LANDRUSH_ISLAND_ROBOT_FALL_INITIAL_SLOW_MOTION_FACTOR = 0.48
const LANDRUSH_ISLAND_ROBOT_FALL_WATER_SLOW_MOTION_FACTOR = 0.12
const LANDRUSH_ISLAND_ROBOT_FALL_CLIFF_LEDGE_METERS = 0.7
const LANDRUSH_ISLAND_ROBOT_FALL_CLIFF_LEDGE_MAX_FRACTION = 0.35
const LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ROTATIONS_PER_SECOND = 3
const LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_SPEED =
  Math.PI * 2 * LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ROTATIONS_PER_SECOND
const LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_ACCELERATION =
  LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_SPEED / 2
const LANDRUSH_ISLAND_ROBOT_FALL_POINTER_DEADZONE_PX = 8
const LANDRUSH_ISLAND_ROBOT_FALL_POINTER_FULL_INPUT_PX = 96
const LANDRUSH_ISLAND_ROBOT_LOCAL_POSITION_RESPONSE = 26
const LANDRUSH_ISLAND_ROBOT_TURN_RESPONSE = 12
const LANDRUSH_ISLAND_ROBOT_GROUND_CLEARANCE = 0.04
const LANDRUSH_ISLAND_ROBOT_LEVEL_SELECTION_TOLERANCE_METERS = 0.35
const LANDRUSH_ISLAND_ROBOT_FALL_COLLIDER_MESHES: Mesh[] = []
const LANDRUSH_ISLAND_ROBOT_CAMERA_TARGET_HEIGHT = 1.28
const LANDRUSH_ISLAND_ROBOT_CAMERA_FOLLOW_RESPONSE = 16
const LANDRUSH_ISLAND_ROBOT_FPV_EYE_HEIGHT = 1.58
const LANDRUSH_ISLAND_ROBOT_FPV_FORWARD_OFFSET = 0.08
const LANDRUSH_ISLAND_ROBOT_FPV_MOUSE_YAW_SPEED = 0.0022
const LANDRUSH_ISLAND_ROBOT_FPV_MOUSE_PITCH_SPEED = 0.002
const LANDRUSH_ISLAND_ROBOT_FPV_PITCH_LIMIT = MathUtils.degToRad(82)
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_DISTANCE = 18
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE = 10
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE = 34
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH = MathUtils.degToRad(54)
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH = MathUtils.degToRad(14)
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_PITCH = MathUtils.degToRad(74)
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH_DRAG_SPEED = 0.006
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_DRAG_SPEED = 0.006
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_INITIAL_YAW = MathUtils.degToRad(135)
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_RESPONSE = 8
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_SPEED = MathUtils.degToRad(88)
const LANDRUSH_ISLAND_BUILD_CAMERA_MOUSE_PITCH_DRAG_SPEED = 0.004
const LANDRUSH_ISLAND_BUILD_CAMERA_MOUSE_ROTATE_DRAG_SPEED = 0.006
const LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_SPEED_METERS = 6.25
const LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_MIN_MOVE_METERS = 0.004
const LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_MAX_RADIUS_METERS = 0.42
const LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_MIN_RADIUS_METERS = 0.14
const LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_RENDER_ORDER = 1200
const LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_SCREEN_SCALE = 0.014
const LANDRUSH_ISLAND_BUILD_GAMEPAD_PAN_SPEED_METERS = 8
const LANDRUSH_ISLAND_BUILD_GAMEPAD_TRIGGER_DEADZONE = 0.05
const LANDRUSH_ISLAND_BUILD_GAMEPAD_WALL_CURSOR_MAX_DISTANCE_METERS = 0.9
const LANDRUSH_ISLAND_BUILD_GAMEPAD_WALL_TARGET_TOOLS = new Set(['door', 'window'])
const LANDRUSH_ISLAND_BUILD_GAMEPAD_WINDOW_LOCAL_Y = 1.5
const LANDRUSH_ISLAND_BUILD_GAMEPAD_ZOOM_SPEED_METERS = 18
const LANDRUSH_ISLAND_GAMEPAD_CAMERA_YAW_SPEED = MathUtils.degToRad(120)
const LANDRUSH_ISLAND_GAMEPAD_CAMERA_PITCH_SPEED = MathUtils.degToRad(86)
const LANDRUSH_ISLAND_ISOMETRIC_CAMERA_ZOOM_STEP = 0.0006
const LANDRUSH_ISLAND_ROBOT_MESH_WIDTH_METERS = 0.46
const LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS = 0.35
const LANDRUSH_ISLAND_CLICK_MOVE_PROJECTED_STOP_RADIUS =
  LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS * 1.75
const LANDRUSH_ISLAND_CLICK_MOVE_WAYPOINT_RADIUS = 0.36
const LANDRUSH_ISLAND_CLICK_MOVE_FULL_SPEED_DISTANCE = 1.75
const LANDRUSH_ISLAND_CLICK_MOVE_MIN_SPEED_SCALE = 0.08
const LANDRUSH_ISLAND_CLICK_MOVE_RUN_DISTANCE = LANDRUSH_ISLAND_ROBOT_MESH_WIDTH_METERS * 4
const LANDRUSH_ISLAND_CLICK_MOVE_PROGRESS_EPSILON_METERS = 0.04
const LANDRUSH_ISLAND_CLICK_MOVE_STALL_MS = 650
const LANDRUSH_ISLAND_CLICK_MOVE_NO_PROGRESS_RETRY_MS = 1400
const LANDRUSH_ISLAND_CLICK_MOVE_STALL_SPEED = 0.12
const LANDRUSH_ISLAND_CLICK_MOVE_RETRY_MS = 520
const LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS = 0.78
const LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_FORWARD_METERS = 0.42
const LANDRUSH_ISLAND_CLICK_MOVE_LOCAL_RETRY_MAX = 6
const LANDRUSH_ISLAND_RIGHT_CLICK_MOVE_CLICK_TOLERANCE_PX = 8
const LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS = 0.48
const LANDRUSH_ISLAND_NAVIGATION_SLIDE_RADIUS_METERS =
  LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS + LANDRUSH_ISLAND_ROBOT_MESH_WIDTH_METERS * 0.5
const LANDRUSH_ISLAND_NAVIGATION_SLIDE_MIN_INWARD_DOT = 0.025
const LANDRUSH_ISLAND_NAVIGATION_TARGET_NUDGE_METERS = 0.08
const LANDRUSH_ISLAND_NAVIGATION_VERTEX_OFFSET_METERS = 0.35
const LANDRUSH_ISLAND_NAVIGATION_MAX_GRAPH_POINTS = 96
const LANDRUSH_ISLAND_NAVIGATION_DEBUG_TRACE_POINTS = 180
const LANDRUSH_ISLAND_NAVIGATION_DEBUG_UPDATE_MS = 90
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID = 'wall_landrush-nav-live-door' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_DOOR_ID = 'door_landrush-nav-live-door' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_ROOM_EAST_WALL_ID =
  'wall_landrush-nav-live-room-east' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_ROOM_NORTH_WALL_ID =
  'wall_landrush-nav-live-room-north' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_ROOM_SOUTH_WALL_ID =
  'wall_landrush-nav-live-room-south' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_ID = 'stair_landrush-nav-live-stair' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID =
  'sseg_landrush-nav-live-stair' as const
const LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_TOP_SLAB_ID =
  'slab_landrush-nav-live-stair-top' as const
const LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS = 1.5
const LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS = 0.24
const LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS = 0.18
const LANDRUSH_ISLAND_DOOR_CROSSING_TANGENT_MARGIN_METERS = 0.5
const LANDRUSH_ISLAND_DOOR_CROSSING_MIN_INTENSITY = 0.68
const LANDRUSH_ISLAND_DOOR_CROSSING_OPEN_MIN = 0.82
const LANDRUSH_ISLAND_CONSTRAINED_CROSSING_LOOKAHEAD_METERS = 0.55
const LANDRUSH_ISLAND_CONSTRAINED_CROSSING_FULL_SPEED_METERS = 0.95
const LANDRUSH_ISLAND_CONSTRAINED_CROSSING_MIN_SPEED_SCALE = 0.28
const LANDRUSH_ISLAND_CONSTRAINED_CROSSING_MAX_SPEED_SCALE = 0.82
const LANDRUSH_ISLAND_CONSTRAINED_CROSSING_RUN_APPROACH_METERS =
  LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS * 1.5
const LANDRUSH_ISLAND_DOOR_OPEN_TRIGGER_METERS = 1.45
const LANDRUSH_ISLAND_DOOR_OPEN_LOOKAHEAD_METERS = 4.8
const LANDRUSH_ISLAND_DOOR_OPEN_PATH_CLEARANCE_METERS = 0.62
const LANDRUSH_ISLAND_DOOR_OPEN_ANIMATION_MS = 520
const LANDRUSH_ISLAND_DOOR_OPEN_SWING_ANGLE = Math.PI / 2
const LANDRUSH_ISLAND_ROBOT_CONTROLLER_CAPSULE_RADIUS = 0.25
const LANDRUSH_ISLAND_ROBOT_CONTROLLER_CAPSULE_LENGTH = 0.8
const LANDRUSH_ISLAND_ROBOT_CONTROLLER_FLOAT_HEIGHT = 0.5
const LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT =
  LANDRUSH_ISLAND_ROBOT_CONTROLLER_CAPSULE_LENGTH / 2 +
  LANDRUSH_ISLAND_ROBOT_CONTROLLER_CAPSULE_RADIUS +
  LANDRUSH_ISLAND_ROBOT_CONTROLLER_FLOAT_HEIGHT
const LANDRUSH_ISLAND_ROBOT_GRASS_INTERACTION_RADIUS = 3.15
const LANDRUSH_ISLAND_ROBOT_GRASS_IDLE_BEND_STRENGTH = 1
const LANDRUSH_ISLAND_ROBOT_GRASS_FULL_BEND_SPEED = 5.8
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_DIAMETER_SCALE = 1.5
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_DEPTH_BIAS_METERS = 0.2
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_MIN_RADIUS_PX = 42
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_CLIP_SEGMENTS = 16
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_FEATHER_RADIUS_SCALE = 2
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_BASE_HEIGHT = 0.08
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_HEAD_HEIGHT = 2.08
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_CENTER_BIAS = 0.76
const LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_HOVER_BOTTOM_SAFE_PX = 176
const LANDRUSH_ISLAND_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS = 0.16
const LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS = 0.08
const LANDRUSH_ISLAND_BUILD_ROBOT_EXIT_HOVER_RADIUS = 1.24
const LANDRUSH_ISLAND_WALK_TARGET_MIN_NORMAL_Y = 0.35
const LANDRUSH_ISLAND_BUILT_GRASS_PADDING_METERS = 1
const LANDRUSH_ISLAND_BUILT_GRASS_FEATHER_METERS = 0.3
const LANDRUSH_ISLAND_BUILD_PARCEL_BLADE_FEATHER_METERS = 0.24
const LANDRUSH_ISLAND_BUILD_PARCEL_EDGE_TOLERANCE_METERS = 0.04
const LANDRUSH_ISLAND_BUILD_GRASS_GROUND_RENDER_ORDER = 0
const LANDRUSH_ISLAND_BUILD_GRASS_BLADE_RENDER_ORDER = 0.1
const LANDRUSH_ISLAND_BUILD_CAMERA_MIN_DISTANCE = 10
const LANDRUSH_ISLAND_BUILD_CAMERA_MAX_DISTANCE = 22
const LANDRUSH_ISLAND_BUILD_CAMERA_MIN_HEIGHT = 7
const LANDRUSH_ISLAND_BUILD_CAMERA_MAX_HEIGHT = 15
const LANDRUSH_ISLAND_CAMERA_TRANSITION_SECONDS = 1.4
const LANDRUSH_ISLAND_CAMERA_TRANSITION_TICK_MS = 1000 / 120
const LANDRUSH_ISLAND_CAMERA_TRANSITION_COMPLETION_EPSILON_SECONDS = 0.001
const LANDRUSH_ISLAND_RUNTIME_FRAME_GAP_MS = 34
const LANDRUSH_ISLAND_LOADING_EXPECTED_MS = 18_000
const LANDRUSH_ISLAND_LOADING_FADE_MS = 520
const LANDRUSH_ISLAND_LOADING_MINIMUM_MS = 1_800
const LANDRUSH_ISLAND_LOADING_QUIET_MS = 900
const LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_ELEVATION_OFFSET = 0.08
const LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_HOVER_SCALE = 1.014
const LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_RESPONSE = 12

type LandrushIslandClientExperience = 'pascal-water' | 'pascal-multiplayer-island'
type LandrushIslandFieldDebugMode = 'cached-worker'
type LandrushIslandLayoutNode = LandrushWorldNode | LandrushLayoutNode
type LandrushIslandLayoutNodeKind = LandrushIslandLayoutNode['type']

type LandrushIslandExperienceConfig = {
  debugSource: LandrushIslandClientExperience
  layoutNodeId: string
  layoutNodeKind: LandrushIslandLayoutNodeKind
  layoutNodeMetadataSource: string
  layoutNodeName: string
  projectId: string
}

const LANDRUSH_ISLAND_EXPERIENCE_CONFIGS = {
  'pascal-water': {
    debugSource: 'pascal-water',
    layoutNodeId: LANDRUSH_ISLAND_LAYOUT_NODE_ID,
    layoutNodeKind: 'landrush-world',
    layoutNodeMetadataSource: 'world-multiplayer-dirt-copy-layout',
    layoutNodeName: 'World Multiplayer Layout',
    projectId: 'landrush-island-debug',
  },
  'pascal-multiplayer-island': {
    debugSource: 'pascal-multiplayer-island',
    layoutNodeId: PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID,
    layoutNodeKind: 'landrush-layout',
    layoutNodeMetadataSource: 'pascal-multiplayer-island-layout',
    layoutNodeName: 'Pascal Multiplayer Island Layout',
    projectId: 'pascal-multiplayer-island',
  },
} satisfies Record<LandrushIslandClientExperience, LandrushIslandExperienceConfig>
const LANDRUSH_ISLAND_PARCEL_MAP_BASE_COLOR = '#d3aa58'
const LANDRUSH_ISLAND_PARCEL_MAP_HOVER_COLOR = '#f5cf78'
const LANDRUSH_ISLAND_PARCEL_MAP_BASE_OPACITY = 0.19
const LANDRUSH_ISLAND_PARCEL_MAP_DEFAULT_FILL_OPACITY_SCALE = 0.65
const LANDRUSH_ISLAND_PARCEL_MAP_CONTOUR_OPACITY = 0.62
const LANDRUSH_ISLAND_PARCEL_MAP_FREE_BADGE_OPACITY = 0.88
const LANDRUSH_ISLAND_PARCEL_MAP_HOVER_OPACITY = 0.34
const LANDRUSH_ISLAND_PARCEL_MAP_ROAD_TRIM_METERS = LANDRUSH_ISLAND_DIRT_ROAD_WIDTH_METERS * 0.56
const LANDRUSH_ISLAND_MAP_CAMERA_DISTANCE = 136
const LANDRUSH_ISLAND_MAP_CAMERA_PITCH_RADIANS = MathUtils.degToRad(60)
const LANDRUSH_ISLAND_MAP_CAMERA_TARGET = [0, 0, 10] as const
const LANDRUSH_ISLAND_MAP_CAMERA_POSITION = [
  LANDRUSH_ISLAND_MAP_CAMERA_TARGET[0],
  LANDRUSH_ISLAND_MAP_CAMERA_TARGET[1] +
    Math.sin(LANDRUSH_ISLAND_MAP_CAMERA_PITCH_RADIANS) * LANDRUSH_ISLAND_MAP_CAMERA_DISTANCE,
  LANDRUSH_ISLAND_MAP_CAMERA_TARGET[2] +
    Math.cos(LANDRUSH_ISLAND_MAP_CAMERA_PITCH_RADIANS) * LANDRUSH_ISLAND_MAP_CAMERA_DISTANCE,
] as const
const LANDRUSH_ISLAND_MAP_CAMERA_ZOOM = 8.6
const LANDRUSH_ISLAND_MAP_CAMERA_MIN_ZOOM = 3
const LANDRUSH_ISLAND_MAP_CAMERA_MAX_ZOOM = 28
const LANDRUSH_ISLAND_MAP_CAMERA_MIN_DISTANCE =
  (LANDRUSH_ISLAND_MAP_CAMERA_DISTANCE * LANDRUSH_ISLAND_MAP_CAMERA_ZOOM) /
  LANDRUSH_ISLAND_MAP_CAMERA_MAX_ZOOM
const LANDRUSH_ISLAND_MAP_CAMERA_MAX_DISTANCE =
  (LANDRUSH_ISLAND_MAP_CAMERA_DISTANCE * LANDRUSH_ISLAND_MAP_CAMERA_ZOOM) /
  LANDRUSH_ISLAND_MAP_CAMERA_MIN_ZOOM
const LANDRUSH_ISLAND_REMOTE_POSITION_RESPONSE = 12
const LANDRUSH_ISLAND_REMOTE_HEADING_RESPONSE = 14
const LANDRUSH_ISLAND_REMOTE_ROBOT_FRAME_PRIORITY = 1
const LANDRUSH_ISLAND_REMOTE_BEACON_FRAME_PRIORITY = 2
const LANDRUSH_ISLAND_LOCAL_ROBOT_FRAME_PRIORITY = 2
const LANDRUSH_ISLAND_LOCAL_BEACON_FRAME_PRIORITY = 3
const LANDRUSH_ISLAND_PRIMITIVE_ROBOT_GEOMETRY_CENTER_Y = 1.04
const LANDRUSH_ISLAND_PERF_DEFAULT_DURATION_MS = 9000
const LANDRUSH_ISLAND_PERF_MAX_FRAME_SAMPLES = 1200
const LANDRUSH_ISLAND_PERF_SPIKE_THRESHOLD_MS = 24
const LANDRUSH_ISLAND_PERF_START_DELAY_MS = 2500
const LANDRUSH_ISLAND_FALLBACK_PROFILE = {
  color: '#7dd3fc',
  id: 'landrush-island-pending',
  name: 'Builder',
} satisfies LocalPlayerProfile
const LANDRUSH_ISLAND_UP_AXIS = new Vector3(0, 1, 0)
const LANDRUSH_ISLAND_IDENTITY_QUATERNION = new Quaternion()

const LANDRUSH_ISLAND_SIDEBAR_TABS = [
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
type ProceduralBeachNumericControl = Exclude<keyof ProceduralBeachControls, 'enabled'>
type LandrushIslandTuningGroupId =
  | 'grass'
  | 'island'
  | 'rocks'
  | 'waterAreas'
  | 'waterEdge'
  | 'waterRipples'
type LandrushIslandIsland = ReturnType<typeof generateWaterLabIsland>
type LandrushIslandPerimeter = LandrushIslandNode['perimeter']
type LandrushIslandViewMode = 'build' | 'map' | 'player'
type LandrushIslandGamepadButtonState = {
  circle: boolean
  cross: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  dpadUp: boolean
  leftShoulder: boolean
  square: boolean
  triangle: boolean
}
type LandrushIslandGamepadBuildMode = 'build' | 'delete' | 'material-paint' | 'select'
type LandrushIslandGamepadBuildFocusRow = 'modes' | 'structure-tools'
type LandrushIslandMovementReferenceFrame = 'camera-forward' | 'screen-up'
type LandrushIslandModeTransitionFadeState = {
  from: LandrushIslandViewMode
  id: number
  to: LandrushIslandViewMode
}
type LandrushIslandModeTransitionPresentationState = ViewerPresentationEffectState & {
  grassVisibility: number
}
type LandrushIslandParcelSelectionDirection = 'down' | 'left' | 'right' | 'up'
type LandrushIslandProfileMeasure = <T>(id: string, callback: () => T) => T
type LandrushIslandCameraPose = {
  distance: number
  pitch: number
  position: Vector3
  quaternion: Quaternion
  target: Vector3
  yaw: number
  zoom?: number | null
}
type LandrushIslandOrthographicCamera = Camera & {
  isOrthographicCamera: true
  updateProjectionMatrix: () => void
  zoom: number
}
type LandrushIslandCameraPoseTransition = {
  elapsed: number
  startPosition: Vector3
  startQuaternion: Quaternion
  startTarget: Vector3
  targetPose: LandrushIslandCameraPose
  targetQuaternion: Quaternion
}
type LandrushIslandStartupProfileSpan = {
  durationMs: number
  id: string
  startMs: number
}
type LandrushIslandStartupLongTask = {
  durationMs: number
  name: string
  startMs: number
}
type LandrushIslandStartupAnimationFrameScript = {
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
type LandrushIslandStartupAnimationFrame = {
  blockingDurationMs: number
  durationMs: number
  firstUIEventTimestampMs: number
  renderStartMs: number
  scripts: LandrushIslandStartupAnimationFrameScript[]
  startMs: number
  styleAndLayoutStartMs: number
}
type LandrushIslandStartupReactCommit = {
  actualDurationMs: number
  baseDurationMs: number
  commitMs: number
  id: string
  phase: string
  startMs: number
}
type LandrushIslandRuntimeReactCommitTotal = {
  count: number
  id: string
  maxMs: number
  phase: string
  totalMs: number
}
type LandrushIslandStartupProfile = {
  animationFrames: LandrushIslandStartupAnimationFrame[]
  longTasks: LandrushIslandStartupLongTask[]
  reactCommits: LandrushIslandStartupReactCommit[]
  spans: LandrushIslandStartupProfileSpan[]
  startedAt: number
}
type LandrushIslandPerfRunScenario =
  | 'circle-camera'
  | 'low-angle-orbit'
  | 'pointer-orbit'
  | 'straight'
type LandrushIslandPerfRunOptions = {
  durationMs: number
  enabled: boolean
  scenario: LandrushIslandPerfRunScenario
  speed: 'run' | 'walk'
}
type LandrushIslandPerfFrameSample = {
  dt: number
  time: number
}
type LandrushIslandPerfLongTaskSample = {
  durationMs: number
  name: string
  startMs: number
}
type LandrushIslandPerfRunState = {
  completedAt: number | null
  durationMs: number
  frames: LandrushIslandPerfFrameSample[]
  longTasks: LandrushIslandPerfLongTaskSample[]
  scenario: LandrushIslandPerfRunScenario
  speed: 'run' | 'walk'
  spikeThresholdMs: number
  startedAt: number | null
  status: 'done' | 'pending' | 'running'
}

type LandrushIslandSceneStore = ReturnType<typeof useScene.getState>
type LandrushIslandInteractiveDoorAnimationRecord = Record<AnyNodeId, DoorAnimationState>
type ProgressiveRenderValue<T> = {
  finalValue: T
  isSettling: boolean
  previewValue: T
}
type RobotMotion = {
  cameraSnapVersion: number
  falling: boolean
  heading: number
  isMoving: boolean
  position: Vector3
  runRequested: boolean
  speed: number
  velocity: Vector3
}
type LandrushIslandRobotFallState = {
  elapsedSeconds: number
  position: Vector3
  predictedWaterHitSeconds: number
  simulatedSeconds: number
  startRootY: number
  velocity: Vector3
  waterY: number
  waterReachedSeconds: number | null
}
type LandrushIslandFallPresentationState = {
  active: boolean
  amount: number
  slowMotionFactor: number
  wiggleAmount: number
}
type LandrushIslandFallControlInput = {
  forward: number
  strafe: number
  strength: number
}
type RobotMovementInput = {
  doorId?: AnyNodeId
  heading: number
  intensity: number
  navigationKind?: LandrushIslandNavigationSteeringKind
  runAmount: number
  steeringDistance?: number
  steeringPoint?: LandrushPoint2
  x: number
  z: number
}
type LandrushIslandMoveTarget = {
  levelId?: LevelNode['id']
  point: LandrushPoint2
  route?: LandrushIslandMoveRouteState
  worldY?: number
}
type LandrushIslandMoveRouteState = {
  bestDistance: number
  doorCrossing: LandrushIslandDoorCrossingState | null
  lastProgressAt: number
  lastRobotPoint: LandrushPoint2
  lastSteeringPoint: LandrushPoint2 | null
  legKey: string
  nextRetryAt: number
  recoveryCount: number
}
type LandrushIslandNavigationDebugRobotPoint = LandrushPoint2 & { y: number }
type LandrushIslandNavigationDebugSnapshot = {
  crossing: LandrushIslandDoorCrossingState | null
  doorPortals: readonly LandrushIslandDoorPortal[]
  kind: LandrushIslandNavigationSteeringKind | 'manual' | null
  obstacles: readonly LandrushIslandNavigationObstacle[]
  robot: LandrushIslandNavigationDebugRobotPoint
  stairPortals: readonly LandrushIslandStairPortal[]
  steeringPoint: LandrushPoint2 | null
  target: LandrushPoint2 | null
  trace: readonly LandrushPoint2[]
}
type LandrushIslandNavigationLiveCapture = {
  captures: Array<{ elapsedMs: number; snapshot: LandrushIslandNavigationDebugSnapshot }>
  scenario: LandrushIslandNavigationLiveScenarioKind
  startedAt: number
}
type LandrushIslandNavigationTestBridge = {
  getState: () => {
    doorPortals: readonly LandrushIslandDoorPortal[]
    robot: LandrushIslandNavigationDebugRobotPoint
    stairPortals: readonly LandrushIslandStairPortal[]
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
type LandrushIslandDoorCrossingPhase = 'center' | 'entry' | 'exit'
type LandrushIslandConstrainedCrossingKind = 'door' | 'stair'
type LandrushIslandDoorCrossingState = {
  center: LandrushPoint2
  doorId?: AnyNodeId
  entry: LandrushPoint2
  exit: LandrushPoint2
  kind: LandrushIslandConstrainedCrossingKind
  nodeId: AnyNodeId
  phase: LandrushIslandDoorCrossingPhase
}
type LandrushIslandRightHoldMove = {
  id: number
  source: 'mouse' | 'touch'
  startX: number
  startY: number
  x: number
  y: number
}
type LandrushIslandRuntimeCameraSample = {
  cameraId: string
  dtMs: number | null
  mode: LandrushIslandViewMode | 'unknown'
  position: [number, number, number]
  progress: number | null
  quaternion: [number, number, number, number]
  rotation: [number, number, number]
  source: string
  target: [number, number, number]
  timeMs: number
  zoom: number | null
}
type LandrushIslandRuntimeCameraJump = LandrushIslandRuntimeCameraSample & {
  distanceMeters: number
  targetDistanceMeters: number
}
type LandrushIslandRuntimeFrameSample = {
  dtMs: number | null
  mode: LandrushIslandViewMode | 'unknown'
  source: 'raf' | 'r3f'
  timeMs: number
}
type LandrushIslandRuntimeFrameGap = LandrushIslandRuntimeFrameSample & {
  thresholdMs: number
}
type LandrushIslandRuntimeLongTaskSample = {
  durationMs: number
  name: string
  startMs: number
}
type LandrushIslandRuntimeLongAnimationFrameSample = {
  blockingDurationMs: number
  durationMs: number
  scripts: Array<{
    durationMs: number
    forcedStyleAndLayoutDurationMs: number
    invoker: string
    pauseDurationMs: number
    sourceFunctionName: string
    sourceUrl: string
  }>
  startMs: number
}
type LandrushIslandRuntimePhaseEvent = {
  detail?: Record<string, unknown>
  name: string
  timeMs: number
}
type LandrushIslandRuntimeReactCommit = LandrushIslandStartupReactCommit
type LandrushIslandRuntimeGrassSample = {
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
type LandrushIslandRuntimeProbe = {
  cameraIntervalSamples: LandrushIslandRuntimeCameraSample[]
  cameraJumps: LandrushIslandRuntimeCameraJump[]
  cameraSamples: LandrushIslandRuntimeCameraSample[]
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
  frameGaps: LandrushIslandRuntimeFrameGap[]
  frameSamples: LandrushIslandRuntimeFrameSample[]
  gridSamples: Record<string, unknown>[]
  grassEvents: Record<string, unknown>[]
  grassSamples: LandrushIslandRuntimeGrassSample[]
  inputEvents: Record<string, unknown>[]
  lastCameraSamplesBySource: Record<string, LandrushIslandRuntimeCameraSample>
  longAnimationFrames: LandrushIslandRuntimeLongAnimationFrameSample[]
  longTasks: LandrushIslandRuntimeLongTaskSample[]
  navigationEvents: Record<string, unknown>[]
  navigationSelfTest?: Record<string, unknown>
  phaseEvents: LandrushIslandRuntimePhaseEvent[]
  reactCommits: LandrushIslandRuntimeReactCommit[]
  reactCommitTotals: Record<string, LandrushIslandRuntimeReactCommitTotal>
  revealSamples: Record<string, unknown>[]
  lastRobotAnimationState?: LandrushRobotAnimationState
  robotAnimationSamples: Record<string, unknown>[]
  robotHoverSamples: Record<string, unknown>[]
  startedAt: number
}
type LandrushIslandNavigationObstacle = {
  kind?: LandrushIslandNavigationSteeringKind | 'asset'
  levelId: LevelNode['id']
  nodeId?: AnyNodeId
  points: readonly LandrushPoint2[]
  stairId?: AnyNodeId
}
type LandrushIslandDoorPortal = {
  center: LandrushPoint2
  doorId: AnyNodeId
  halfWidth: number
  levelId: LevelNode['id']
  normal: LandrushPoint2
  sideA: LandrushPoint2
  sideB: LandrushPoint2
  tangent: LandrushPoint2
}
type LandrushIslandParcelMapShape = {
  centroid: LandrushPoint2
  points: readonly LandrushPoint2[]
}
type LandrushIslandStairPortal = {
  center: LandrushPoint2
  halfRun: number
  halfWidth: number
  levelId: LevelNode['id']
  nodeId: AnyNodeId
  normal: LandrushPoint2
  sideA: LandrushPoint2
  sideB: LandrushPoint2
  stairId: AnyNodeId
  tangent: LandrushPoint2
}
type LandrushIslandStairConnector = {
  fromLevelId: LevelNode['id']
  fromPoint: LandrushPoint2
  nodeId: AnyNodeId
  portals: readonly LandrushIslandStairPortal[]
  toLevelId: LevelNode['id']
  toPoint: LandrushPoint2
}
type LandrushIslandNavigationContext = {
  doorPortals: readonly LandrushIslandDoorPortal[]
  navigationObstacles: readonly LandrushIslandNavigationObstacle[]
  stairPortals: readonly LandrushIslandStairPortal[]
}
type LandrushIslandNavigationLeg = {
  final: boolean
  key: string
  point: LandrushPoint2
  stairPortals?: readonly LandrushIslandStairPortal[]
}
type LandrushIslandWalkTargetPoint = LandrushPoint2 & {
  levelId: LevelNode['id']
  worldY: number
}
type LandrushIslandStairNode = Extract<AnyNode, { type: 'stair' }>
type LandrushIslandStairSegmentNode = Extract<AnyNode, { type: 'stair-segment' }>
type LandrushIslandRoofNode = Extract<AnyNode, { type: 'roof' }>
type LandrushIslandRoofSegmentNode = Extract<AnyNode, { type: 'roof-segment' }>
type LandrushIslandStairSegmentLayout = {
  center: LandrushPoint2
  length: number
  normal: LandrushPoint2
  nodeId: AnyNodeId
  tangent: LandrushPoint2
  width: number
}
type LandrushIslandStairNavigationFootprint = {
  nodeId: AnyNodeId
  points: readonly LandrushPoint2[]
}
type LandrushIslandNavigationSteeringKind = 'direct' | 'door' | 'graph' | 'recovery' | 'stair'
type LandrushIslandNavigationLiveScenarioKind = 'door' | 'room' | 'stair'
type LandrushIslandNavigationSteeringResult = {
  doorCrossing?: LandrushIslandDoorCrossingState
  doorId?: AnyNodeId
  kind: LandrushIslandNavigationSteeringKind
  point: LandrushPoint2
}
type LandrushIslandRevealMaterialState = {
  clipIntersection: boolean
  clippingPlanes: Material['clippingPlanes']
}
type LandrushIslandRevealObjectState = {
  clipIntersection: unknown
  clippingPlanes: unknown
  clipShadows: unknown
  enabled: unknown
  isClippingGroup: unknown
}
type LandrushIslandRobotRevealOccluder = {
  object: Object3D
}
type LandrushIslandRobotRevealOccluderContext = {
  cameraPoint: LandrushPoint2
  cameraY: number
  robotPoint: LandrushPoint2
  robotY: number
  stairTransitionTopY: number | null
  structureGroundY: number
}
type RobotWorldOrbitControls = {
  target: Vector3
  update: () => void
}
type LandrushIslandCameraControls = {
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
  { key: 'cliffCornerChipDarkening', label: 'chip darkening', max: 1, min: 0, step: 0.01 },
  { key: 'cliffColorAverageRatio', label: 'color average', max: 1, min: 0, step: 0.01 },
] satisfies readonly LabSliderConfig<ElevationSliderKey>[]

const LANDRUSH_ISLAND_GRASS_SLIDERS = [
  { key: 'density', label: 'density', max: 30_000, min: 0, step: 100 },
  { key: 'scale', label: 'scale', max: 3, min: 0.1, step: 0.05 },
  { key: 'heightVariation', label: 'height variation', max: 1, min: 0, step: 0.01 },
  { key: 'heightNoiseScale', label: 'height noise scale', max: 2, min: 0.05, step: 0.01 },
  { key: 'greenTint', label: 'green tint', max: 1, min: 0, step: 0.01 },
  { key: 'windStrength', label: 'wind strength', max: 1, min: 0, step: 0.01 },
  { key: 'windSpeed', label: 'wind speed', max: 5, min: 0, step: 0.1 },
  { key: 'windAngle', label: 'wind direction', max: 360, min: 0, step: 1 },
  { key: 'gustScale', label: 'gust frequency', max: 1.5, min: 0.1, step: 0.01 },
  { key: 'turbulence', label: 'turbulence', max: 1, min: 0, step: 0.01 },
  { key: 'flutter', label: 'tip flutter', max: 1, min: 0, step: 0.01 },
  { key: 'treeSway', label: 'tree sway', max: 3, min: 0, step: 0.05 },
  { key: 'colorVariation', label: 'color variation', max: 1, min: 0, step: 0.01 },
  { key: 'colorPatchScale', label: 'color patch scale', max: 2, min: 0.05, step: 0.01 },
  { key: 'macroVariation', label: 'macro variation', max: 0.5, min: 0, step: 0.01 },
  { key: 'macroScale', label: 'macro scale', max: 0.5, min: 0.01, step: 0.005 },
] satisfies readonly LabSliderConfig<keyof GrassBladeTuning>[]

declare global {
  interface Window {
    __PASCAL_BENCH_ORBITING__?: boolean
    __LANDRUSH_ISLAND_CLIFF_RUNTIME_METRICS__?: ProceduralRockCliffRuntimeMetrics
    __LANDRUSH_ISLAND_PERF_RUN__?: () => unknown
    __LANDRUSH_ISLAND_STARTUP_PROFILE__?: LandrushIslandStartupProfile
    __LANDRUSH_ISLAND_DEBUG__?: {
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

function useLandrushIslandPerfRunProbe(perfRun: LandrushIslandPerfRunOptions) {
  useEffect(() => {
    if (!perfRun.enabled) {
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__?.enabled) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      delete window.__LANDRUSH_ISLAND_PERF_RUN__
      delete document.documentElement.dataset.landrushIslandPerfRun
      return
    }

    const grassProbe: StylizedGrassPerfProbe = { enabled: true, samples: [] }
    const state: LandrushIslandPerfRunState = {
      completedAt: null,
      durationMs: perfRun.durationMs,
      frames: [],
      longTasks: [],
      scenario: perfRun.scenario,
      speed: perfRun.speed,
      spikeThresholdMs: LANDRUSH_ISLAND_PERF_SPIKE_THRESHOLD_MS,
      startedAt: null,
      status: 'pending',
    }
    window.__LANDRUSH_STYLIZED_GRASS_PERF__ = grassProbe

    const publishSummary = () => {
      const summary = summarizeLandrushIslandPerfRun(state, grassProbe)
      document.documentElement.dataset.landrushIslandPerfRun = JSON.stringify(summary)
      return summary
    }

    window.__LANDRUSH_ISLAND_PERF_RUN__ = publishSummary

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
        if (state.frames.length > LANDRUSH_ISLAND_PERF_MAX_FRAME_SAMPLES) {
          state.frames.splice(0, state.frames.length - LANDRUSH_ISLAND_PERF_MAX_FRAME_SAMPLES)
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
    }, LANDRUSH_ISLAND_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(publishTimer)
      window.cancelAnimationFrame(raf)
      longTaskObserver?.disconnect()
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__ === grassProbe) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      if (window.__LANDRUSH_ISLAND_PERF_RUN__ === publishSummary) {
        delete window.__LANDRUSH_ISLAND_PERF_RUN__
      }
      delete document.documentElement.dataset.landrushIslandPerfRun
    }
  }, [perfRun])
}

function createLandrushIslandPerfRunOptions(searchParams: { get: (key: string) => string | null }) {
  const requestedScenario = searchParams.get('perfRun')
  const scenario: LandrushIslandPerfRunScenario =
    requestedScenario === 'circle-camera' ||
    requestedScenario === 'low-angle-orbit' ||
    requestedScenario === 'pointer-orbit'
      ? requestedScenario
      : 'straight'
  const enabled =
    requestedScenario === 'straight' ||
    requestedScenario === 'circle-camera' ||
    requestedScenario === 'low-angle-orbit' ||
    requestedScenario === 'pointer-orbit'
  const requestedDuration = Number(searchParams.get('perfDurationMs'))
  const durationMs = MathUtils.clamp(
    Number.isFinite(requestedDuration)
      ? requestedDuration
      : LANDRUSH_ISLAND_PERF_DEFAULT_DURATION_MS,
    4000,
    20_000,
  )
  const speed = searchParams.get('perfSpeed') === 'walk' ? 'walk' : 'run'
  return { durationMs, enabled, scenario, speed } satisfies LandrushIslandPerfRunOptions
}

function summarizeLandrushIslandPerfRun(
  state: LandrushIslandPerfRunState,
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
      attributes: summarizeLandrushIslandGrassPerfSamples(attributeSamples),
      builds: summarizeLandrushIslandGrassPerfSamples(buildSamples),
      matrices: summarizeLandrushIslandGrassPerfSamples(matrixSamples),
      streamScans: summarizeLandrushIslandGrassPerfSamples(streamSamples),
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
    scenario: state.scenario,
    speed: state.speed,
    status: state.status,
  }
}

function summarizeLandrushIslandGrassPerfSamples(samples: StylizedGrassPerfProbe['samples']) {
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

function roundCameraProbe(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function createLandrushIslandFallPresentationState(): LandrushIslandFallPresentationState {
  return {
    active: false,
    amount: 0,
    slowMotionFactor: 1,
    wiggleAmount: 0,
  }
}

declare global {
  interface Window {
    __PASCAL_CAMERA_DRAGGING__?: boolean
    __LANDRUSH_ISLAND_FLUSH_RUNTIME_PROBE__?: () => string | null
    __LANDRUSH_ISLAND_NAV_DEBUG__?: LandrushIslandNavigationDebugSnapshot
    __LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__?: LandrushIslandNavigationLiveCapture
    __LANDRUSH_ISLAND_NAV_TEST__?: LandrushIslandNavigationTestBridge
    __LANDRUSH_ISLAND_RUNTIME_PROBE__?: LandrushIslandRuntimeProbe
  }
}

function setLandrushIslandCameraDragging(dragging: boolean) {
  if (typeof window !== 'undefined') {
    window.__PASCAL_CAMERA_DRAGGING__ = dragging
  }
  useViewer.getState().setCameraDragging(dragging)
}

let cachedLandrushIslandRuntimeProbeSearch: string | null = null
let cachedLandrushIslandRuntimeProbeEnabled = false

function landrushIslandRuntimeProbeIsEnabled() {
  if (typeof window === 'undefined') return false
  if (window.location.search === cachedLandrushIslandRuntimeProbeSearch) {
    return cachedLandrushIslandRuntimeProbeEnabled
  }
  cachedLandrushIslandRuntimeProbeSearch = window.location.search
  cachedLandrushIslandRuntimeProbeEnabled = new URLSearchParams(window.location.search).has(
    'landrushProbe',
  )
  return cachedLandrushIslandRuntimeProbeEnabled
}

function getLandrushIslandRuntimeProbe() {
  if (typeof window === 'undefined') return null
  if (!landrushIslandRuntimeProbeIsEnabled()) return null

  window.__LANDRUSH_ISLAND_RUNTIME_PROBE__ ??= {
    cameraIntervalSamples: [],
    cameraJumps: [],
    cameraSamples: [],
    frameGaps: [],
    frameSamples: [],
    gridSamples: [],
    grassEvents: [],
    grassSamples: [],
    inputEvents: [],
    lastCameraSamplesBySource: {},
    longAnimationFrames: [],
    longTasks: [],
    navigationEvents: [],
    navigationSelfTest: runLandrushIslandNavigationSelfTest(),
    phaseEvents: [],
    reactCommits: [],
    reactCommitTotals: {},
    revealSamples: [],
    robotAnimationSamples: [],
    robotHoverSamples: [],
    startedAt: performance.now(),
  }
  window.__LANDRUSH_ISLAND_RUNTIME_PROBE__.cameraIntervalSamples ??= []
  window.__LANDRUSH_ISLAND_RUNTIME_PROBE__.longAnimationFrames ??= []
  return window.__LANDRUSH_ISLAND_RUNTIME_PROBE__
}

function pushLandrushIslandProbeSample<T>(samples: T[], sample: T, maxSamples = 800) {
  samples.push(sample)
  if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples)
}

function recordLandrushIslandInputProbe(event: Record<string, unknown>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return
  pushLandrushIslandProbeSample(probe.inputEvents, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordLandrushIslandNavigationProbe(event: Record<string, unknown>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return
  pushLandrushIslandProbeSample(probe.navigationEvents, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordLandrushIslandGrassEventProbe(event: Record<string, unknown>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return
  pushLandrushIslandProbeSample(probe.grassEvents, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordLandrushIslandFrameProbe(sample: Omit<LandrushIslandRuntimeFrameSample, 'timeMs'>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return

  const framedSample: LandrushIslandRuntimeFrameSample = {
    ...sample,
    dtMs: sample.dtMs === null ? null : roundPerf(sample.dtMs),
    timeMs: roundPerf(performance.now() - probe.startedAt),
  }
  pushLandrushIslandProbeSample(probe.frameSamples, framedSample, 20_000)
  if (framedSample.dtMs !== null && framedSample.dtMs >= LANDRUSH_ISLAND_RUNTIME_FRAME_GAP_MS) {
    pushLandrushIslandProbeSample(probe.frameGaps, {
      ...framedSample,
      thresholdMs: LANDRUSH_ISLAND_RUNTIME_FRAME_GAP_MS,
    })
  }
}

function recordLandrushIslandLongTaskProbe(entry: PerformanceEntry) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return

  pushLandrushIslandProbeSample(probe.longTasks, {
    durationMs: roundPerf(entry.duration),
    name: entry.name,
    startMs: roundPerf(entry.startTime - probe.startedAt),
  })
}

function recordLandrushIslandLongAnimationFrameProbe(entry: PerformanceEntry) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return

  const longAnimationFrame = entry as PerformanceEntry & {
    blockingDuration?: number
    scripts?: Array<{
      duration?: number
      forcedStyleAndLayoutDuration?: number
      invoker?: string
      pauseDuration?: number
      sourceFunctionName?: string
      sourceURL?: string
    }>
  }
  pushLandrushIslandProbeSample(probe.longAnimationFrames, {
    blockingDurationMs: roundPerf(longAnimationFrame.blockingDuration ?? 0),
    durationMs: roundPerf(entry.duration),
    scripts: [...(longAnimationFrame.scripts ?? [])]
      .sort((first, second) => (second.duration ?? 0) - (first.duration ?? 0))
      .slice(0, 12)
      .map((script) => ({
        durationMs: roundPerf(script.duration ?? 0),
        forcedStyleAndLayoutDurationMs: roundPerf(script.forcedStyleAndLayoutDuration ?? 0),
        invoker: script.invoker ?? '',
        pauseDurationMs: roundPerf(script.pauseDuration ?? 0),
        sourceFunctionName: script.sourceFunctionName ?? '',
        sourceUrl: script.sourceURL ?? '',
      })),
    startMs: roundPerf(entry.startTime - probe.startedAt),
  })
}

function recordLandrushIslandPhaseProbe(name: string, detail?: Record<string, unknown>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return

  pushLandrushIslandProbeSample(probe.phaseEvents, {
    detail,
    name,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordLandrushIslandReactCommitProbe(commit: LandrushIslandRuntimeReactCommit) {
  const probe = getLandrushIslandRuntimeProbe()
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
    pushLandrushIslandProbeSample(probe.reactCommits, commit, 1200)
  }
}

function recordLandrushIslandRevealProbe(event: Record<string, unknown>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return
  pushLandrushIslandProbeSample(probe.revealSamples, {
    ...event,
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordLandrushIslandGrassProbe(sample: Omit<LandrushIslandRuntimeGrassSample, 'timeMs'>) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return
  pushLandrushIslandProbeSample(probe.grassSamples, {
    ...sample,
    centerLagMeters: roundPerf(sample.centerLagMeters),
    physicsLagMeters: roundPerf(sample.physicsLagMeters),
    radius: roundPerf(sample.radius),
    speed: roundPerf(sample.speed),
    strength: roundPerf(sample.strength),
    timeMs: roundPerf(performance.now() - probe.startedAt),
  })
}

function recordLandrushIslandRobotAnimationProbe(state: LandrushRobotAnimationState) {
  const probe = getLandrushIslandRuntimeProbe()
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
  pushLandrushIslandProbeSample(probe.robotAnimationSamples, {
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

function recordLandrushIslandRobotHoverPoseProbe(sample: LandrushRobotHoverPoseSample) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return

  pushLandrushIslandProbeSample(probe.robotHoverSamples, {
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

function recordLandrushIslandCameraProbe({
  camera,
  mode,
  progress = null,
  source,
  target,
}: {
  camera: Camera
  mode: LandrushIslandRuntimeCameraSample['mode']
  progress?: number | null
  source: string
  target: Vector3
}) {
  const probe = getLandrushIslandRuntimeProbe()
  if (!probe) return

  const now = performance.now()
  const previous = probe.lastCameraSamplesBySource[source]
  const sample: LandrushIslandRuntimeCameraSample = {
    cameraId: camera.uuid,
    dtMs: previous ? roundPerf(now - probe.startedAt - previous.timeMs) : null,
    mode,
    position: [
      roundCameraProbe(camera.position.x),
      roundCameraProbe(camera.position.y),
      roundCameraProbe(camera.position.z),
    ],
    progress: progress === null ? null : roundPerf(progress),
    quaternion: [
      roundCameraProbe(camera.quaternion.x),
      roundCameraProbe(camera.quaternion.y),
      roundCameraProbe(camera.quaternion.z),
      roundCameraProbe(camera.quaternion.w),
    ],
    rotation: [
      roundCameraProbe(camera.rotation.x),
      roundCameraProbe(camera.rotation.y),
      roundCameraProbe(camera.rotation.z),
    ],
    source,
    target: [roundCameraProbe(target.x), roundCameraProbe(target.y), roundCameraProbe(target.z)],
    timeMs: roundPerf(now - probe.startedAt),
    zoom: isLandrushIslandOrthographicCamera(camera) ? roundPerf(camera.zoom) : null,
  }
  pushLandrushIslandProbeSample(probe.cameraSamples, sample, 6000)
  if (source === 'runtime-camera-interval') {
    pushLandrushIslandProbeSample(probe.cameraIntervalSamples, sample, 1200)
  }

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
      pushLandrushIslandProbeSample(probe.cameraJumps, {
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

function distanceSq2(first: LandrushPoint2, second: LandrushPoint2) {
  const dx = first.x - second.x
  const dz = first.z - second.z
  return dx * dx + dz * dz
}

function createLandrushIslandParcelMapShapes(
  parcels: readonly ParcelAllocationParcel[],
  roads: readonly LandrushRoadSegment[],
) {
  return new Map(
    parcels.map((parcel) => [parcel.id, createLandrushIslandParcelMapShape(parcel, roads)]),
  )
}

function createLandrushIslandParcelMapShape(
  parcel: ParcelAllocationParcel,
  roads: readonly LandrushRoadSegment[],
): LandrushIslandParcelMapShape {
  const connectedRoads = roads.filter((road) => road.connectsParcelIds.includes(parcel.id))
  if (connectedRoads.length === 0) {
    return { centroid: parcel.centroid, points: parcel.points }
  }

  const trimMeters = Math.max(
    LANDRUSH_ISLAND_PARCEL_MAP_ROAD_TRIM_METERS,
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

function canClaimLandrushIslandParcel({
  localOwnership,
  localProfile,
  ownership,
}: {
  localOwnership: ParcelOwnership | undefined
  localProfile: LocalPlayerProfile
  ownership: ParcelOwnership | undefined
}) {
  return !ownership && !localOwnership && localProfile.id !== LANDRUSH_ISLAND_FALLBACK_PROFILE.id
}

function getLandrushIslandParcelMapCentroid(
  parcel: ParcelAllocationParcel,
  shapes: ReadonlyMap<string, LandrushIslandParcelMapShape>,
) {
  return shapes.get(parcel.id)?.centroid ?? parcel.centroid
}

function resolveLandrushIslandBuildingLevels(
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  buildingId: AnyNodeId | null,
) {
  if (!buildingId) return []
  const building = nodes[buildingId]
  if (building?.type !== 'building') return []

  return building.children
    .map((id) => nodes[id])
    .filter((node): node is LevelNode => node?.type === 'level')
    .sort((first, second) => first.level - second.level)
}

function resolveLandrushIslandActiveLevelBaseY(
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  selectedLevelId: LevelNode['id'] | null,
) {
  if (!selectedLevelId) return 0

  const selectedLevel = nodes[selectedLevelId]
  if (selectedLevel?.type !== 'level') return 0

  const levels = resolveLandrushIslandBuildingLevels(
    nodes,
    (selectedLevel.parentId as AnyNodeId | null) ?? null,
  )
  let baseY = 0
  const lowerLevelNumbers = [...new Set(levels.map((level) => level.level))]
    .filter((levelNumber) => levelNumber < selectedLevel.level)
    .sort((first, second) => first - second)
  for (const levelNumber of lowerLevelNumbers) {
    const level = levels.find((candidate) => candidate.level === levelNumber)
    if (!level) continue
    const canonicalLevelId = resolveLandrushIslandCanonicalBuildingLevelId(nodes, level.id)
    baseY += getLevelHeight(canonicalLevelId, nodes)
  }

  return baseY
}

function resolveLandrushIslandCanonicalBuildingLevelId(
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  levelId: LevelNode['id'],
) {
  const sourceLevel = nodes[levelId]
  if (sourceLevel?.type !== 'level') return levelId

  const candidates = resolveLandrushIslandBuildingLevels(
    nodes,
    (sourceLevel.parentId as AnyNodeId | null) ?? null,
  ).filter((level) => level.level === sourceLevel.level)
  let bestLevel = sourceLevel
  let bestContentCount = countLandrushIslandLevelContent(sourceLevel.id, nodes)
  for (const candidate of candidates) {
    const contentCount = countLandrushIslandLevelContent(candidate.id, nodes)
    if (
      contentCount > bestContentCount ||
      (contentCount === bestContentCount && candidate.id < bestLevel.id)
    ) {
      bestLevel = candidate
      bestContentCount = contentCount
    }
  }
  return bestLevel.id
}

function countLandrushIslandLevelContent(
  levelId: LevelNode['id'],
  nodes: ReturnType<typeof useScene.getState>['nodes'],
) {
  let count = 0
  for (const node of Object.values(nodes)) {
    if (node.parentId === levelId && node.visible !== false) count += 1
  }
  return count
}

function resolveLandrushIslandRobotLevelId(
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  robotWorldY: number,
  groundY: number,
) {
  const levels = resolveLandrushIslandBuildingLevels(
    nodes,
    LANDRUSH_ISLAND_BUILDING_ID as AnyNodeId,
  )
  if (levels.length === 0) return LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id']

  const levelNumbers = [...new Set(levels.map((level) => level.level))].sort(
    (first, second) => first - second,
  )
  let baseY = groundY
  let currentLevelId = resolveLandrushIslandCanonicalBuildingLevelId(nodes, levels[0]!.id)
  for (const levelNumber of levelNumbers) {
    const level = levels.find((candidate) => candidate.level === levelNumber)
    if (!level) continue
    const canonicalLevelId = resolveLandrushIslandCanonicalBuildingLevelId(nodes, level.id)
    if (robotWorldY + LANDRUSH_ISLAND_ROBOT_LEVEL_SELECTION_TOLERANCE_METERS >= baseY) {
      currentLevelId = canonicalLevelId
    }
    baseY += getLevelHeight(canonicalLevelId, nodes)
  }

  return currentLevelId
}

function resolveLandrushIslandNavigationContext(
  levelId: LevelNode['id'],
  navigationObstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  stairPortals: readonly LandrushIslandStairPortal[],
  stairConnectors: readonly LandrushIslandStairConnector[],
): LandrushIslandNavigationContext {
  const connectedStairIds = new Set(
    stairConnectors
      .filter((connector) => connector.fromLevelId === levelId || connector.toLevelId === levelId)
      .map((connector) => connector.nodeId),
  )

  return {
    doorPortals: doorPortals.filter((portal) => portal.levelId === levelId),
    navigationObstacles: navigationObstacles.filter(
      (obstacle) =>
        obstacle.levelId === levelId ||
        Boolean(obstacle.stairId && connectedStairIds.has(obstacle.stairId)),
    ),
    stairPortals: stairPortals.filter(
      (portal) => portal.levelId === levelId || connectedStairIds.has(portal.stairId),
    ),
  }
}

function resolveLandrushIslandNavigationLeg(
  start: LandrushPoint2,
  currentLevelId: LevelNode['id'],
  target: LandrushIslandMoveTarget,
  stairConnectors: readonly LandrushIslandStairConnector[],
): LandrushIslandNavigationLeg | null {
  const targetLevelId = target.levelId ?? currentLevelId
  if (currentLevelId === targetLevelId) {
    return {
      final: true,
      key: `final:${targetLevelId}`,
      point: target.point,
    }
  }

  const route = resolveLandrushIslandStairConnectorRoute(
    start,
    currentLevelId,
    targetLevelId,
    stairConnectors,
  )
  const connector = route?.[0]
  if (!connector) return null
  const ascending = connector.fromLevelId === currentLevelId

  return {
    final: false,
    key: `stair:${currentLevelId}:${targetLevelId}:${connector.nodeId}:${ascending ? 'up' : 'down'}`,
    point: ascending ? connector.toPoint : connector.fromPoint,
    stairPortals: resolveLandrushIslandStairConnectorPortals(connector, ascending),
  }
}

function resolveLandrushIslandClickMoveNavigationLeg(
  start: LandrushPoint2,
  currentLevelId: LevelNode['id'],
  target: LandrushIslandMoveTarget,
  stairConnectors: readonly LandrushIslandStairConnector[],
): LandrushIslandNavigationLeg | null {
  const crossing = target.route?.doorCrossing
  if (crossing?.kind === 'stair') {
    const connector = stairConnectors.find(
      (candidate) =>
        candidate.nodeId === crossing.nodeId ||
        candidate.portals.some((portal) => portal.nodeId === crossing.nodeId),
    )
    const ascending = target.route!.legKey.endsWith(':up')
    return {
      final: false,
      key: target.route!.legKey,
      point: crossing.exit,
      stairPortals: connector
        ? resolveLandrushIslandStairConnectorPortals(connector, ascending)
        : undefined,
    }
  }
  return resolveLandrushIslandNavigationLeg(start, currentLevelId, target, stairConnectors)
}

function resolveLandrushIslandStairConnectorPortals(
  connector: LandrushIslandStairConnector,
  ascending: boolean,
) {
  return ascending ? connector.portals : [...connector.portals].reverse()
}

function resolveLandrushIslandNavigationLegStairPortals(
  leg: LandrushIslandNavigationLeg,
  stairPortals: readonly LandrushIslandStairPortal[],
) {
  return leg.final ? [] : (leg.stairPortals ?? stairPortals)
}

function resolveLandrushIslandStairConnectorRoute(
  start: LandrushPoint2,
  startLevelId: LevelNode['id'],
  targetLevelId: LevelNode['id'],
  stairConnectors: readonly LandrushIslandStairConnector[],
): readonly LandrushIslandStairConnector[] | null {
  const frontier: Array<{
    cost: number
    levelId: LevelNode['id']
    point: LandrushPoint2
    route: LandrushIslandStairConnector[]
  }> = [{ cost: 0, levelId: startLevelId, point: start, route: [] }]
  const bestCostByLevel = new Map<LevelNode['id'], number>()

  while (frontier.length > 0) {
    frontier.sort((first, second) => first.cost - second.cost)
    const state = frontier.shift()
    if (!state) break
    if (state.levelId === targetLevelId) return state.route
    if (state.cost >= (bestCostByLevel.get(state.levelId) ?? Number.POSITIVE_INFINITY)) continue
    bestCostByLevel.set(state.levelId, state.cost)

    for (const connector of stairConnectors) {
      const ascending = connector.fromLevelId === state.levelId
      const descending = connector.toLevelId === state.levelId
      if (!ascending && !descending) continue

      const entry = ascending ? connector.fromPoint : connector.toPoint
      const exit = ascending ? connector.toPoint : connector.fromPoint
      const nextLevelId = ascending ? connector.toLevelId : connector.fromLevelId
      const nextCost =
        state.cost +
        Math.hypot(entry.x - state.point.x, entry.z - state.point.z) +
        Math.hypot(exit.x - entry.x, exit.z - entry.z)
      if (nextCost >= (bestCostByLevel.get(nextLevelId) ?? Number.POSITIVE_INFINITY)) continue
      frontier.push({
        cost: nextCost,
        levelId: nextLevelId,
        point: exit,
        route: [...state.route, connector],
      })
    }
  }

  return null
}

function resolveLandrushIslandDefaultParcelSelection({
  camera,
  parcels,
  shapes,
}: {
  camera: Camera
  parcels: readonly ParcelAllocationParcel[]
  shapes: ReadonlyMap<string, LandrushIslandParcelMapShape>
}) {
  let bestParcel: ParcelAllocationParcel | null = null
  let bestDistanceSq = Number.POSITIVE_INFINITY
  const center = { x: camera.position.x, z: camera.position.z }

  for (const parcel of parcels) {
    const centroid = getLandrushIslandParcelMapCentroid(parcel, shapes)
    const distanceSq = distanceSq2(center, centroid)
    if (distanceSq >= bestDistanceSq) continue
    bestDistanceSq = distanceSq
    bestParcel = parcel
  }

  return bestParcel
}

function resolveLandrushIslandDirectionalParcelSelection({
  camera,
  currentParcelId,
  direction,
  parcels,
  shapes,
}: {
  camera: Camera
  currentParcelId: string | null
  direction: LandrushIslandParcelSelectionDirection
  parcels: readonly ParcelAllocationParcel[]
  shapes: ReadonlyMap<string, LandrushIslandParcelMapShape>
}) {
  if (parcels.length === 0) return null

  const currentParcel = parcels.find((parcel) => parcel.id === currentParcelId) ?? null
  if (!currentParcel) {
    return resolveLandrushIslandDefaultParcelSelection({ camera, parcels, shapes })
  }

  const currentCentroid = getLandrushIslandParcelMapCentroid(currentParcel, shapes)
  const directionVector = resolveLandrushIslandMapSelectionDirection(camera, direction)
  let bestParcel: ParcelAllocationParcel | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const parcel of parcels) {
    if (parcel.id === currentParcel.id) continue

    const centroid = getLandrushIslandParcelMapCentroid(parcel, shapes)
    const delta = {
      x: centroid.x - currentCentroid.x,
      z: centroid.z - currentCentroid.z,
    }
    const distance = Math.hypot(delta.x, delta.z)
    if (distance <= 0.000001) continue

    const forward = dot2(delta, directionVector)
    if (forward <= 0.05 || forward / distance < 0.18) continue

    const lateral = Math.abs(delta.x * directionVector.z - delta.z * directionVector.x)
    const score = lateral * 1.35 + forward * 0.18
    if (score >= bestScore) continue
    bestScore = score
    bestParcel = parcel
  }

  return bestParcel
}

function resolveLandrushIslandMapSelectionDirection(
  camera: Camera,
  direction: LandrushIslandParcelSelectionDirection,
) {
  const axes = resolveLandrushIslandCameraScreenAxes(camera)
  if (direction === 'up') return axes.up
  if (direction === 'down') return { x: -axes.up.x, z: -axes.up.z }
  if (direction === 'right') return axes.right
  return { x: -axes.right.x, z: -axes.right.z }
}

function runLandrushIslandNavigationSelfTest() {
  const surface = [
    { x: -6, z: -6 },
    { x: 6, z: -6 },
    { x: 6, z: 6 },
    { x: -6, z: 6 },
  ]
  const doorPortal: LandrushIslandDoorPortal = {
    center: { x: 0, z: 0 },
    doorId: 'door_navigation_self_test' as AnyNodeId,
    halfWidth: 0.5,
    levelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    normal: { x: 1, z: 0 },
    sideA: { x: LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS, z: 0 },
    sideB: { x: -LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS, z: 0 },
    tangent: { x: 0, z: 1 },
  }
  const stairId = 'stair_navigation_self_test' as AnyNodeId
  const stairPortal: LandrushIslandStairPortal = {
    center: { x: 0, z: 0 },
    halfRun: 1.5,
    halfWidth: 0.5,
    levelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    nodeId: stairId,
    normal: { x: 0, z: 1 },
    sideA: { x: 0, z: 1.5 + LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS },
    sideB: { x: 0, z: -1.5 - LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS },
    stairId,
    tangent: { x: 1, z: 0 },
  }
  const stairObstacle: LandrushIslandNavigationObstacle = {
    kind: 'stair',
    levelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    nodeId: stairId,
    points: rectFootprintFromAxes({
      center: stairPortal.center,
      depth: stairPortal.halfRun * 2 + LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS * 2,
      normal: stairPortal.normal,
      tangent: stairPortal.tangent,
      width: stairPortal.halfWidth * 2 + LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS * 2,
    }),
    stairId,
  }
  const upperStairPortal: LandrushIslandStairPortal = {
    ...stairPortal,
    center: { x: 0, z: 3.2 },
    halfRun: 1,
    nodeId: 'sseg_navigation_self_test_upper' as AnyNodeId,
    sideA: {
      x: 0,
      z: 4.2 + LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS,
    },
    sideB: {
      x: 0,
      z: 2.2 - LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS,
    },
  }
  const upperStairObstacle: LandrushIslandNavigationObstacle = {
    kind: 'stair',
    levelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    nodeId: upperStairPortal.nodeId,
    points: rectFootprintFromAxes({
      center: upperStairPortal.center,
      depth: upperStairPortal.halfRun * 2 + LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS * 2,
      normal: upperStairPortal.normal,
      tangent: upperStairPortal.tangent,
      width:
        upperStairPortal.halfWidth * 2 + LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS * 2,
    }),
    stairId,
  }
  const overlappingStairObstacle: LandrushIslandNavigationObstacle = {
    ...stairObstacle,
    nodeId: 'sseg_navigation_self_test_overlap' as AnyNodeId,
    stairId: 'stair_navigation_self_test_overlap' as AnyNodeId,
  }
  const doorRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: -4, z: 0 },
    { x: 4, z: 0 },
    [],
    [doorPortal],
    surface,
  )
  const doorCenterRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    [],
    [doorPortal],
    surface,
  )
  const doorNearCenterRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: -LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS * 0.7, z: 0 },
    { x: 4, z: 0 },
    [],
    [doorPortal],
    surface,
  )
  const stairCrossRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: 0, z: -4 },
    { x: 0, z: 4 },
    [stairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const overlappingStairCrossRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: 0, z: -4 },
    { x: 0, z: 4 },
    [stairObstacle, overlappingStairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const stairClickTarget = resolveLandrushIslandStairConnectorTarget(
    { x: 0, z: -4 },
    { x: 0, z: 0.45 },
    [stairPortal],
  )
  const stairClickRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: 0, z: -4 },
    stairClickTarget,
    [stairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const stairExitRoute = resolveLandrushIslandNavigationSteeringPoint(
    { x: 0, z: 0 },
    { x: 0, z: 4 },
    [stairObstacle],
    [],
    surface,
    [stairPortal],
  )
  const recovery = resolveLandrushIslandNavigationRecoverySteeringPoint(
    { x: 0, z: 0 },
    { x: 3, z: 0 },
    { x: 1, z: 0 },
    [
      {
        levelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
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
  const projectedArrival = segmentReachedLandrushIslandNavigationPoint(
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0.72, z: 0.08 },
    0.12,
  )
  const upperLevelId = 'level_navigation_self_test_upper' as LevelNode['id']
  const floorConnector: LandrushIslandStairConnector = {
    fromLevelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    fromPoint: clonePoint2(stairPortal.sideB),
    nodeId: stairId,
    portals: [stairPortal],
    toLevelId: upperLevelId,
    toPoint: clonePoint2(stairPortal.sideA),
  }
  const multiSegmentFloorConnector: LandrushIslandStairConnector = {
    ...floorConnector,
    portals: [stairPortal, upperStairPortal],
    toPoint: clonePoint2(upperStairPortal.sideA),
  }
  const upperFloorTarget: LandrushIslandMoveTarget = {
    levelId: upperLevelId,
    point: { x: 4, z: 4 },
    worldY: 2.7,
  }
  const upperFloorStairLeg = resolveLandrushIslandNavigationLeg(
    { x: 0, z: -4 },
    LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    upperFloorTarget,
    [floorConnector],
  )
  const upperFloorFinalLeg = resolveLandrushIslandNavigationLeg(
    floorConnector.toPoint,
    upperLevelId,
    upperFloorTarget,
    [floorConnector],
  )
  const upperFloorFinalStairPortals = upperFloorFinalLeg
    ? resolveLandrushIslandNavigationLegStairPortals(upperFloorFinalLeg, [stairPortal])
    : [stairPortal]
  const upperFloorFinalSteering = resolveLandrushIslandNavigationSteeringPoint(
    floorConnector.toPoint,
    { x: 0, z: -4 },
    [stairObstacle],
    [],
    surface,
    upperFloorFinalStairPortals,
  )
  const lowerFloorTarget: LandrushIslandMoveTarget = {
    levelId: LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'],
    point: { x: 0, z: -4 },
    worldY: 0,
  }
  const lowerFloorStairLeg = resolveLandrushIslandNavigationLeg(
    { x: 0, z: 5 },
    upperLevelId,
    lowerFloorTarget,
    [multiSegmentFloorConnector],
  )
  const lowerFloorStairPortals = lowerFloorStairLeg
    ? resolveLandrushIslandNavigationLegStairPortals(lowerFloorStairLeg, [
        stairPortal,
        upperStairPortal,
      ])
    : []
  const lowerFloorStairSteering = resolveLandrushIslandNavigationSteeringPoint(
    { x: 0, z: 5 },
    lowerFloorTarget.point,
    [stairObstacle, upperStairObstacle],
    [],
    surface,
    lowerFloorStairPortals,
  )
  const crossingLockedTarget: LandrushIslandMoveTarget = {
    ...upperFloorTarget,
    route: createLandrushIslandMoveRouteState(
      stairPortal.center,
      stairPortal.halfRun,
      performance.now(),
      'stair-navigation-self-test',
    ),
  }
  crossingLockedTarget.route!.doorCrossing = {
    center: clonePoint2(stairPortal.center),
    entry: clonePoint2(stairPortal.sideB),
    exit: clonePoint2(stairPortal.sideA),
    kind: 'stair',
    nodeId: stairPortal.nodeId,
    phase: 'center',
  }
  const crossingLockedLeg = resolveLandrushIslandClickMoveNavigationLeg(
    stairPortal.center,
    upperLevelId,
    crossingLockedTarget,
    [floorConnector],
  )
  return {
    doorEntryMetersFromCenter:
      doorRoute?.kind === 'door' ? roundPerf(Math.abs(doorRoute.point.x)) : null,
    doorCenterAdvancesToExit:
      doorCenterRoute?.kind === 'door' &&
      doorCenterRoute.point.x >= LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    doorNearCenterAdvancesToExit:
      doorNearCenterRoute?.kind === 'door' &&
      doorNearCenterRoute.point.x >= LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    doorOpensBeforeCenter:
      doorRoute?.kind === 'door' &&
      doorRoute.doorId === doorPortal.doorId &&
      doorRoute.point.x <= -LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS + 0.001,
    projectedArrival,
    recoveryAvailable: recovery?.kind === 'recovery',
    recoveryPoint: recovery ? [roundPerf(recovery.point.x), roundPerf(recovery.point.z)] : null,
    overlappingStairsShareCrossing:
      overlappingStairCrossRoute?.kind === 'stair' &&
      overlappingStairCrossRoute.point.z <=
        -1.5 - LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS + 0.001,
    stairClickOnRun:
      stairClickRoute?.kind === 'stair' &&
      stairClickRoute.point.z <= -1.5 - LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS + 0.001 &&
      stairClickTarget.z >= 1.5 + LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    stairCrossUsesEntry:
      stairCrossRoute?.kind === 'stair' &&
      stairCrossRoute.point.z <= -1.5 - LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS + 0.001,
    stairExitFollowsRun:
      stairExitRoute?.kind === 'stair' &&
      stairExitRoute.point.z >= 1.5 + LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS - 0.001,
    stairCrossingLocksFloorTransition:
      crossingLockedLeg?.final === false &&
      distanceSq2(crossingLockedLeg.point, stairPortal.sideA) <= 0.000001,
    upperFloorClickRoutesToStair:
      upperFloorStairLeg?.final === false &&
      distanceSq2(upperFloorStairLeg.point, floorConnector.toPoint) <= 0.000001,
    upperFloorRouteContinuesAfterStair:
      upperFloorFinalLeg?.final === true &&
      distanceSq2(upperFloorFinalLeg.point, upperFloorTarget.point) <= 0.000001,
    upperFloorFinalRouteAvoidsStairReentry:
      upperFloorFinalLeg?.final === true &&
      upperFloorFinalStairPortals.length === 0 &&
      upperFloorFinalSteering !== null &&
      upperFloorFinalSteering.kind !== 'stair',
    lowerFloorDescentStartsAtUpperStairPortal:
      lowerFloorStairLeg?.final === false &&
      lowerFloorStairPortals[0]?.nodeId === upperStairPortal.nodeId &&
      lowerFloorStairSteering?.kind === 'stair' &&
      lowerFloorStairSteering.doorCrossing?.nodeId === upperStairPortal.nodeId,
  }
}

function resolveLandrushIslandNavigationLiveScenario(
  value: string | null,
): LandrushIslandNavigationLiveScenarioKind | null {
  if (value === '1' || value === 'door') return 'door'
  if (value === 'room') return 'room'
  if (value === 'stair') return 'stair'
  return null
}

function LandrushIslandStartupReactProfiler({
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

function syncLandrushIslandBuildEditorMode(buildMode: boolean) {
  return measureLandrushFrameSlice(
    buildMode
      ? 'landrush-island.editor-store.sync-build-mode'
      : 'landrush-island.editor-store.sync-select-mode',
    () => {
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

function createLandrushIslandGamepadButtonState(): LandrushIslandGamepadButtonState {
  return {
    circle: false,
    cross: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false,
    dpadUp: false,
    leftShoulder: false,
    square: false,
    triangle: false,
  }
}

function readLandrushIslandGamepadButtonState(
  input: LandrushGamepadInput | null,
): LandrushIslandGamepadButtonState {
  if (!input) return createLandrushIslandGamepadButtonState()
  return {
    circle: input.circle,
    cross: input.cross,
    dpadDown: input.dpadDown,
    dpadLeft: input.dpadLeft,
    dpadRight: input.dpadRight,
    dpadUp: input.dpadUp,
    leftShoulder: input.leftShoulder,
    square: input.square,
    triangle: input.triangle,
  }
}

function isLandrushIslandGamepadInputUsed(input: LandrushGamepadInput | null) {
  if (!input) return false
  return (
    input.circle ||
    input.cross ||
    input.dpadDown ||
    input.dpadLeft ||
    input.dpadRight ||
    input.dpadUp ||
    input.leftShoulder ||
    input.rightShoulder ||
    input.square ||
    input.triangle ||
    input.jump ||
    input.run ||
    input.leftTrigger > 0.05 ||
    input.rightTrigger > 0.05 ||
    input.strength > 0 ||
    input.lookStrength > 0
  )
}

function wasLandrushIslandGamepadButtonPressed(
  current: LandrushIslandGamepadButtonState,
  previous: LandrushIslandGamepadButtonState,
  button: keyof LandrushIslandGamepadButtonState,
) {
  return current[button] && !previous[button]
}

function resolveLandrushIslandCurrentGamepadBuildMode(): LandrushIslandGamepadBuildMode {
  const editor = useEditor.getState()
  if (editor.mode === 'delete') return 'delete'
  if (editor.mode === 'material-paint') return 'material-paint'
  if (
    editor.mode === 'build' &&
    editor.phase === 'structure' &&
    editor.structureLayer === 'elements'
  ) {
    return 'build'
  }
  return 'select'
}

function cycleLandrushIslandGamepadBuildMode(
  current: LandrushIslandGamepadBuildMode,
  direction: -1 | 1,
) {
  const currentIndex = LANDRUSH_ISLAND_GAMEPAD_BUILD_MODES.indexOf(current)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex =
    (safeIndex + direction + LANDRUSH_ISLAND_GAMEPAD_BUILD_MODES.length) %
    LANDRUSH_ISLAND_GAMEPAD_BUILD_MODES.length
  return LANDRUSH_ISLAND_GAMEPAD_BUILD_MODES[nextIndex] ?? 'select'
}

function focusLandrushIslandGamepadBuildMode(mode: LandrushIslandGamepadBuildMode) {
  if (typeof document === 'undefined') return

  const element = document.querySelector<HTMLButtonElement>(`[data-editor-control-mode="${mode}"]`)
  if (!element || element.disabled) return

  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'nearest', inline: 'center' })
}

function scheduleLandrushIslandGamepadBuildModeFocus(mode: LandrushIslandGamepadBuildMode) {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(() => focusLandrushIslandGamepadBuildMode(mode))
}

function getLandrushIslandGamepadStructureToolButtons() {
  if (typeof document === 'undefined') return []
  return [...document.querySelectorAll<HTMLButtonElement>('[data-editor-structure-tool]')].filter(
    (element) => !element.disabled,
  )
}

function focusLandrushIslandGamepadStructureToolButton(button: HTMLButtonElement) {
  button.focus({ preventScroll: true })
  button.scrollIntoView({ block: 'nearest', inline: 'center' })
}

function focusLandrushIslandCurrentGamepadStructureTool() {
  const buttons = getLandrushIslandGamepadStructureToolButtons()
  if (buttons.length === 0) return

  const activeTool = useEditor.getState().tool
  const activeButton =
    buttons.find((button) => button.dataset.editorStructureTool === activeTool) ?? buttons[0]
  if (activeButton) focusLandrushIslandGamepadStructureToolButton(activeButton)
}

function scheduleLandrushIslandCurrentGamepadStructureToolFocus() {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(focusLandrushIslandCurrentGamepadStructureTool)
}

function selectLandrushIslandAdjacentGamepadStructureTool(direction: -1 | 1) {
  const buttons = getLandrushIslandGamepadStructureToolButtons()
  if (buttons.length === 0) return

  const activeElement = document.activeElement
  const activeIndex =
    activeElement instanceof HTMLButtonElement ? buttons.indexOf(activeElement) : -1
  const activeTool = useEditor.getState().tool
  const toolIndex = buttons.findIndex((button) => button.dataset.editorStructureTool === activeTool)
  const baseIndex = activeIndex >= 0 ? activeIndex : toolIndex >= 0 ? toolIndex : 0
  const nextIndex = (baseIndex + direction + buttons.length) % buttons.length
  const nextButton = buttons[nextIndex]
  if (!nextButton) return

  focusLandrushIslandGamepadStructureToolButton(nextButton)
  nextButton.click()
}

function enterLandrushIslandGamepadStructureToolRow(focusRowRef: {
  current: LandrushIslandGamepadBuildFocusRow
}) {
  focusRowRef.current = 'structure-tools'
  scheduleLandrushIslandCurrentGamepadStructureToolFocus()
}

function leaveLandrushIslandGamepadStructureToolRow(focusRowRef: {
  current: LandrushIslandGamepadBuildFocusRow
}) {
  focusRowRef.current = 'modes'
  focusLandrushIslandGamepadBuildMode('build')
}

function applyLandrushIslandGamepadBuildMode(mode: LandrushIslandGamepadBuildMode) {
  const editor = useEditor.getState()
  if (mode === 'select') {
    editor.setMode('select')
    editor.setFloorplanSelectionTool('click')
    return
  }
  if (mode === 'build') {
    editor.setPhase('structure')
    editor.setStructureLayer('elements')
    editor.setMode('build')
    return
  }
  if (mode === 'material-paint') {
    editor.primeMaterialPaintFromSelection()
    editor.setPhase('structure')
    editor.setStructureLayer('elements')
    editor.setMode('material-paint')
    return
  }
  editor.setMode('delete')
}

function runLandrushIslandGamepadUndo(undoBaselineRef: { current: number | null }) {
  const temporal = useScene.temporal.getState()
  const baseline = undoBaselineRef.current ?? temporal.pastStates.length
  undoBaselineRef.current = baseline
  if (temporal.pastStates.length <= baseline) return

  const nextState = temporal.pastStates.at(-1)
  if (!isLandrushIslandGamepadUndoStateSafe(nextState)) {
    undoBaselineRef.current = temporal.pastStates.length
    return
  }

  temporal.undo()
  useLiveNodeOverrides.getState().clearAll()
  useLiveTransforms.getState().clearAll()
  const scene = useScene.getState()
  for (const node of Object.values(scene.nodes)) {
    scene.markDirty(node.id)
  }
}

function isLandrushIslandGamepadUndoStateSafe(state: unknown) {
  if (!state || typeof state !== 'object') return false
  const nodes = (state as { nodes?: unknown }).nodes
  if (!nodes || typeof nodes !== 'object') return false

  const currentNodes = useScene.getState().nodes
  let checkedProtectedNodeCount = 0
  for (const id of [
    LANDRUSH_ISLAND_NODE_ID,
    LANDRUSH_ISLAND_LAYOUT_NODE_ID,
    PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID,
  ]) {
    const currentNode = currentNodes[id as AnyNodeId]
    if (!currentNode) continue
    checkedProtectedNodeCount += 1
    const nextNode = (nodes as Record<string, unknown>)[id]
    if (!nextNode) return false
    if (JSON.stringify(nextNode) !== JSON.stringify(currentNode)) return false
  }

  return checkedProtectedNodeCount > 0
}

function cancelLandrushIslandGamepadWallDraft(wallDraftActiveRef: { current: boolean }) {
  emitter.emit('tool:cancel')
  wallDraftActiveRef.current = false
  renderScheduler.requestFrame('selection:changed')
}

export function LandrushIslandClient({
  experience = 'pascal-water',
  waterFieldDebugMode,
}: {
  experience?: LandrushIslandClientExperience
  waterFieldDebugMode?: LandrushIslandFieldDebugMode
} = {}) {
  const experienceConfig = LANDRUSH_ISLAND_EXPERIENCE_CONFIGS[experience]
  const multiplayerNaturalEnvironment = experience === 'pascal-multiplayer-island'
  const defaultElevationParameters =
    experience === 'pascal-multiplayer-island'
      ? PASCAL_WORLD_ELEVATION_PARAMETERS
      : LANDRUSH_ISLAND_ELEVATION_PARAMETERS
  const defaultMaterialParameters =
    experience === 'pascal-multiplayer-island'
      ? PASCAL_WORLD_WATER_MATERIAL_PARAMETERS
      : LANDRUSH_ISLAND_MATERIAL_PARAMETERS
  const defaultGrassTuning = LANDRUSH_ISLAND_GRASS_TUNING
  const searchParams = useSearchParams()
  const runtimeProbeEnabled = searchParams.has('landrushProbe')
  const navigationDebugEnabled =
    searchParams.get('navDebug') === '1' || searchParams.get('landrushNavDebug') === '1'
  const navigationLiveScenario = resolveLandrushIslandNavigationLiveScenario(
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
  const transitionBlurDebugParam = searchParams.get('transitionBlurDebug')
  const transitionBlurDebugMode: ViewerPresentationEffectDebugMode =
    transitionBlurDebugParam === 'mask' || transitionBlurDebugParam === 'contribution'
      ? transitionBlurDebugParam
      : 'final'
  const startupProfileEnabled =
    searchParams.get('startupProfile') === '1' || searchParams.get('profileStartup') === '1'
  const startupProfileNoLandLayers = searchParams.get('profileNoLandLayers') === '1'
  const startupProfileNoStylizedBlades = searchParams.get('profileNoStylizedBlades') === '1'
  const startupProfileNoStylizedGround = searchParams.get('profileNoStylizedGround') === '1'
  const startupProfileNoStylizedTrees = searchParams.get('profileNoStylizedTrees') === '1'
  const startupProfileNoWaterNode = searchParams.get('profileNoWaterNode') === '1'
  const profileNoOcean = searchParams.get('profileNoOcean') === '1'
  const profileNoCliffs = searchParams.get('profileNoCliffs') === '1'
  const profileRuntimeMetrics = searchParams.get('profileRuntimeMetrics') === '1'
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
  const perfRun = useMemo(() => createLandrushIslandPerfRunOptions(searchParams), [searchParams])
  const startupProfileRef = useRef<LandrushIslandStartupProfile | null>(null)
  const grassInteractionRef = useRef<StylizedGrassInteraction | null>(null)
  const localMotionRef = useRef<RobotMotion | null>(null)
  const playerCameraPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const buildCameraPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const mapCameraPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const mapTransitionStartPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const mapReturnCameraPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const playerReturnCameraPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const modeTransitionFadeIdRef = useRef(0)
  const modeTransitionPresentationRef = useRef(
    createLandrushIslandModeTransitionPresentationState(transitionBlurDebugMode),
  )
  const grassVisibilityRef = useRef(1)
  const renderedFpsRef = useRef<number | null>(null)
  const lastAppliedBuildSnapshotSignatureRef = useRef(new Map<string, string>())
  const lastSyncedBuildSnapshotSignatureRef = useRef<string | null>(null)
  const initialViewModeAppliedRef = useRef(false)
  const previousGamepadButtonsRef = useRef(createLandrushIslandGamepadButtonState())
  const gamepadBuildModeRef = useRef<LandrushIslandGamepadBuildMode>('select')
  const gamepadBuildFocusRowRef = useRef<LandrushIslandGamepadBuildFocusRow>('modes')
  const gamepadBuildWallDraftActiveRef = useRef(false)
  const gamepadBuildUndoBaselineRef = useRef<number | null>(null)
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
    window.__LANDRUSH_ISLAND_STARTUP_PROFILE__ = startupProfileRef.current
  }
  const startupProfileMeasure = useCallback<LandrushIslandProfileMeasure>((id, callback) => {
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
  const handleCliffRuntimeMetrics = useCallback((metrics: ProceduralRockCliffRuntimeMetrics) => {
    if (typeof window !== 'undefined') {
      window.__LANDRUSH_ISLAND_CLIFF_RUNTIME_METRICS__ = metrics
    }
  }, [])
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
      const probe = getLandrushIslandRuntimeProbe()
      if (!probe) return

      recordLandrushIslandReactCommitProbe({
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
            idPrefix: 'runtime.landrush-island.editor',
            onRender: handleRuntimeReactRender,
          }
        : undefined,
    [editorRuntimeReactProfileEnabled, handleRuntimeReactRender],
  )
  const [loadingActive, setLoadingActive] = useState(true)
  const fallPresentationRef = useRef<LandrushIslandFallPresentationState>(
    createLandrushIslandFallPresentationState(),
  )
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
  const [fpvView, setFpvView] = useState(false)
  const [modeTransitionFade, setModeTransitionFade] =
    useState<LandrushIslandModeTransitionFadeState | null>(null)
  const [gamepadHintsActive, setGamepadHintsActive] = useState(false)
  const gamepadHintsActiveRef = useRef(false)
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
    ...defaultElevationParameters,
  }))
  const [materialParameters, setMaterialParameters] = useState<LandrushWaterSurfaceParameters>(
    () => ({
      ...defaultMaterialParameters,
    }),
  )
  const [multiplayerOceanAnimated, setMultiplayerOceanAnimated] = useState(true)
  const [multiplayerOceanParameters, setMultiplayerOceanParameters] =
    useState<StandaloneOceanParameters>(createDefaultStandaloneOceanParameters)
  const [multiplayerBeachControls, setMultiplayerBeachControls] = useState<ProceduralBeachControls>(
    () => ({
      ...DEFAULT_PROCEDURAL_BEACH_CONTROLS,
    }),
  )
  const [multiplayerRockCutCount, setMultiplayerRockCutCount] = useState(
    PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_CUT_COUNT,
  )
  const [multiplayerRockScale, setMultiplayerRockScale] = useState(
    PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_SCALE,
  )
  const [multiplayerRockWallControls, setMultiplayerRockWallControls] =
    useState<ProceduralRockCliffWallControls>(() => ({
      ...DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
    }))
  const [multiplayerRockOffshoreControls, setMultiplayerRockOffshoreControls] =
    useState<ProceduralRockOffshoreControls>(() => ({
      ...DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
    }))
  const [multiplayerRockToneControls, setMultiplayerRockToneControls] =
    useState<ProceduralRockToneControls>(() => ({
      ...DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
    }))
  const [multiplayerWaterlineInteractionField, setMultiplayerWaterlineInteractionField] =
    useState<WaterlineInteractionField | null>(null)
  const [grassTuning, setGrassTuning] = useState<GrassBladeTuning>(() => ({
    ...defaultGrassTuning,
  }))
  const [grassGroundTintCapPercent, setGrassGroundTintCapPercent] = useState(
    LANDRUSH_ISLAND_GRASS_GROUND_TINT_CAP_PERCENT,
  )
  const [terrainFieldResolution, setTerrainFieldResolution] = useState(WATER_FIELD_RESOLUTION)
  const showDepthReference = false
  const clean = searchParams.get('v') === 'clean' || searchParams.get('clean') === '1'
  const offline = searchParams.get('offline') === '1'
  const benchmarkOrbiting =
    searchParams.get('benchOrbiting') === '1' || searchParams.get('benchmark') === '1'
  const roomId = useMemo(
    () => sanitizeRoomId(searchParams.get('room') ?? LANDRUSH_ISLAND_MULTIPLAYER_ROOM_ID),
    [searchParams],
  )
  const multiplayer = useLandrushWorldMultiplayer({
    enabled: !offline && Boolean(localProfile),
    localProfile: localProfile ?? LANDRUSH_ISLAND_FALLBACK_PROFILE,
    onVoiceSignal: handleVoiceSignal,
    persistOfflineState: !clean,
    roomId,
    spectator: false,
  })
  const resolvedLocalProfile = localProfile ?? LANDRUSH_ISLAND_FALLBACK_PROFILE
  const multiplayerStatus: ConnectionStatus = offline ? 'offline' : multiplayer.status
  const spatialVoice = useLandrushSpatialVoice({
    available: !offline && multiplayer.status === 'connected',
    incomingSignals: incomingVoiceSignals,
    localMotionRef,
    localProfile: resolvedLocalProfile,
    remotePlayerStore: multiplayer.remotePlayerStore,
    remotePlayers: multiplayer.remotePlayers,
    roomId,
    sendSignal: multiplayer.sendVoiceSignal,
  })
  const viewMode: LandrushIslandViewMode = buildMode ? 'build' : mapView ? 'map' : 'player'
  const buildSceneModeActive = buildMode && buildCameraControlsReady && modeTransitionFade === null
  const buildSceneEntryViewModeRef = useRef<LandrushIslandViewMode>('player')
  const sceneViewMode = buildMode
    ? buildSceneModeActive
      ? 'build'
      : buildSceneEntryViewModeRef.current
    : viewMode
  const [buildEditorSystemsReady, setBuildEditorSystemsReady] = useState(false)
  const [buildEditorChromeReady, setBuildEditorChromeReady] = useState(false)
  const buildEditorSystemsActive =
    (buildMode && buildEditorSystemsReady) || (!buildMode && modeTransitionFade?.from === 'build')
  const buildEditorChromeActive =
    (buildMode && buildEditorChromeReady) || (!buildMode && modeTransitionFade?.from === 'build')

  useEffect(() => {
    if (!buildMode) return

    let chromeTimeoutId: number | null = null
    const systemsTimeoutId = window.setTimeout(() => {
      startTransition(() => setBuildEditorSystemsReady(true))
      chromeTimeoutId = window.setTimeout(
        () => startTransition(() => setBuildEditorChromeReady(true)),
        0,
      )
    }, 0)

    return () => {
      window.clearTimeout(systemsTimeoutId)
      if (chromeTimeoutId !== null) window.clearTimeout(chromeTimeoutId)
    }
  }, [buildMode])

  const fpvActive = viewMode === 'player' && fpvView
  const mapPresentationProgressRef = useRef(viewMode === 'map' ? 1 : 0)
  const loadingAssetsReady = !stylizedGroundTextureRequired || stylizedGroundTextureReady

  useEffect(() => {
    setStylizedGroundTextureReady(!stylizedGroundTextureRequired)
  }, [stylizedGroundTextureRequired])

  useLandrushIslandPerfRunProbe(activePerfRun)
  useEffect(() => {
    const probe = getLandrushIslandRuntimeProbe()
    if (!probe) return

    const probeOutput = document.createElement('pre')
    probeOutput.hidden = true
    probeOutput.dataset.landrushIslandRuntimeProbe = '1'
    document.body.appendChild(probeOutput)
    const flushProbeOutput = () => {
      const latestProbe = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__ ?? probe
      const serialized = JSON.stringify(latestProbe)
      probeOutput.textContent = serialized
      probeOutput.dataset.landrushIslandRuntimeProbeFlushedAt = String(performance.now())
      return serialized
    }
    window.__LANDRUSH_ISLAND_FLUSH_RUNTIME_PROBE__ = flushProbeOutput
    const handleFlushProbeOutput = () => {
      flushProbeOutput()
    }
    window.addEventListener('pascal-water-runtime-probe:flush', handleFlushProbeOutput)
    const intervalId = runtimeProbeDomOutput ? window.setInterval(flushProbeOutput, 1000) : null
    if (runtimeProbeDomOutput) flushProbeOutput()
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId)
      window.removeEventListener('pascal-water-runtime-probe:flush', handleFlushProbeOutput)
      if (window.__LANDRUSH_ISLAND_FLUSH_RUNTIME_PROBE__ === flushProbeOutput) {
        delete window.__LANDRUSH_ISLAND_FLUSH_RUNTIME_PROBE__
      }
      probeOutput.remove()
    }
  }, [runtimeProbeDomOutput])

  const prepareCameraHandoff = useCallback(
    (nextViewMode: LandrushIslandViewMode) => {
      recordLandrushIslandPhaseProbe('camera-handoff:start', {
        from: viewMode,
        to: nextViewMode,
      })
      if (nextViewMode !== viewMode) {
        modeTransitionFadeIdRef.current += 1
        const nextTransition = {
          from: viewMode,
          id: modeTransitionFadeIdRef.current,
          to: nextViewMode,
        }
        recordLandrushIslandPhaseProbe('camera-handoff:fade', {
          from: viewMode,
          id: nextTransition.id,
          to: nextViewMode,
        })
        updateLandrushIslandModeTransitionPresentation(
          modeTransitionPresentationRef.current,
          viewMode,
          nextTransition,
          0,
        )
        grassVisibilityRef.current = modeTransitionPresentationRef.current.grassVisibility
        setModeTransitionFade(nextTransition)
      }

      if (nextViewMode === 'player') {
        mapReturnCameraPoseRef.current = null
        if (viewMode !== 'player') {
          const currentNonPlayerPose =
            viewMode === 'map' ? mapCameraPoseRef.current : buildCameraPoseRef.current
          if (currentNonPlayerPose && viewMode === 'build') {
            buildCameraPoseRef.current = cloneLandrushIslandCameraPose(currentNonPlayerPose)
          }
          if (viewMode === 'map') {
            mapReturnCameraPoseRef.current = cloneLandrushIslandCameraPose(currentNonPlayerPose)
          }
          playerReturnCameraPoseRef.current = cloneLandrushIslandCameraPose(
            playerCameraPoseRef.current,
          )
        }
        mapTransitionStartPoseRef.current = null
        recordLandrushIslandPhaseProbe('camera-handoff:player-ready', { from: viewMode })
        return
      }

      playerReturnCameraPoseRef.current = null
      mapReturnCameraPoseRef.current = null
      if (nextViewMode === 'map') {
        mapTransitionStartPoseRef.current = cloneLandrushIslandCameraPose(
          viewMode === 'build' ? buildCameraPoseRef.current : playerCameraPoseRef.current,
        )
        recordLandrushIslandPhaseProbe('camera-handoff:map-ready', { from: viewMode })
        return
      }

      mapTransitionStartPoseRef.current = null
      if (viewMode === 'player') buildCameraPoseRef.current = null
      if (viewMode === 'map') {
        buildCameraPoseRef.current = cloneLandrushIslandCameraPose(mapCameraPoseRef.current)
      }
      recordLandrushIslandPhaseProbe('camera-handoff:build-ready', { from: viewMode })
    },
    [viewMode],
  )
  const handleModeTransitionFadeDone = useCallback(
    (transition: LandrushIslandModeTransitionFadeState) => {
      startTransition(() => {
        setModeTransitionFade((current) => (current?.id === transition.id ? null : current))
        if (transition.from === 'build') {
          setBuildCameraControlsInitialPose(null)
          setBuildCameraControlsReady(false)
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!modeTransitionFade) {
      mapPresentationProgressRef.current = viewMode === 'map' ? 1 : 0
      updateLandrushIslandModeTransitionPresentation(
        modeTransitionPresentationRef.current,
        viewMode,
        null,
        1,
      )
      grassVisibilityRef.current = modeTransitionPresentationRef.current.grassVisibility
      return
    }

    const startedAt = performance.now()
    let intervalId = 0
    const tick = () => {
      const now = performance.now()
      const elapsed = Math.max(0, (now - startedAt) / 1000)
      const nextProgress = clamp01(elapsed / LANDRUSH_ISLAND_CAMERA_TRANSITION_SECONDS)
      updateLandrushIslandModeTransitionPresentation(
        modeTransitionPresentationRef.current,
        viewMode,
        modeTransitionFade,
        nextProgress,
      )
      grassVisibilityRef.current = modeTransitionPresentationRef.current.grassVisibility
      mapPresentationProgressRef.current = resolveLandrushIslandMapPresentationProgress(
        viewMode,
        modeTransitionFade,
        nextProgress,
      )
      renderScheduler.requestFrame('camera:move')
      if (nextProgress >= 1) {
        window.clearInterval(intervalId)
        handleModeTransitionFadeDone(modeTransitionFade)
      }
    }

    mapPresentationProgressRef.current = resolveLandrushIslandMapPresentationProgress(
      viewMode,
      modeTransitionFade,
      0,
    )
    intervalId = window.setInterval(tick, LANDRUSH_ISLAND_CAMERA_TRANSITION_TICK_MS)
    tick()
    return () => window.clearInterval(intervalId)
  }, [handleModeTransitionFadeDone, modeTransitionFade, viewMode])

  const mapPresentationVisible =
    viewMode === 'map' || modeTransitionFade?.from === 'map' || modeTransitionFade?.to === 'map'
  const grassStreamingPaused = modeTransitionFade !== null || viewMode === 'map'
  const mapLabelsVisible = viewMode === 'map' && modeTransitionFade === null
  const grassBladesVisible = !startupProfileNoStylizedBlades

  const enterPlayerView = useCallback(() => {
    measureLandrushFrameSlice('landrush-island.view.enter-player', () => {
      recordLandrushIslandPhaseProbe('view:enter-player:start', { from: viewMode })
      startTransition(() => {
        measureLandrushFrameSlice('landrush-island.view.enter-player.prepare-camera-handoff', () =>
          prepareCameraHandoff('player'),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-player.set-build-mode', () =>
          setBuildMode(false),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-player.set-build-parcel', () =>
          setBuildParcelId(null),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-player.set-map-view', () =>
          setMapView(false),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-player.set-fpv-view', () =>
          setFpvView(false),
        )
      })
      measureLandrushFrameSlice('landrush-island.view.enter-player.release-pointer-lock', () =>
        releaseLandrushIslandPointerLock(),
      )
      recordLandrushIslandPhaseProbe('view:enter-player:state-dispatched', { from: viewMode })
    })
  }, [prepareCameraHandoff, viewMode])

  const enterFpvView = useCallback(() => {
    measureLandrushFrameSlice('landrush-island.view.enter-fpv', () => {
      recordLandrushIslandPhaseProbe('view:enter-fpv:start', { from: viewMode })
      startTransition(() => {
        measureLandrushFrameSlice('landrush-island.view.enter-fpv.prepare-camera-handoff', () =>
          prepareCameraHandoff('player'),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-fpv.set-build-mode', () =>
          setBuildMode(false),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-fpv.set-build-parcel', () =>
          setBuildParcelId(null),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-fpv.set-map-view', () =>
          setMapView(false),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-fpv.set-fpv-view', () =>
          setFpvView(true),
        )
      })
      measureLandrushFrameSlice('landrush-island.view.enter-fpv.request-pointer-lock', () =>
        requestLandrushIslandPointerLock(),
      )
      recordLandrushIslandPhaseProbe('view:enter-fpv:state-dispatched', { from: viewMode })
    })
  }, [prepareCameraHandoff, viewMode])

  const exitFpvView = useCallback(() => {
    measureLandrushFrameSlice('landrush-island.view.exit-fpv', () => {
      recordLandrushIslandPhaseProbe('view:exit-fpv:start', { from: viewMode })
      measureLandrushFrameSlice('landrush-island.view.exit-fpv.set-fpv-view', () =>
        setFpvView(false),
      )
      measureLandrushFrameSlice('landrush-island.view.exit-fpv.release-pointer-lock', () =>
        releaseLandrushIslandPointerLock(),
      )
      recordLandrushIslandPhaseProbe('view:exit-fpv:state-dispatched', { from: viewMode })
    })
  }, [viewMode])

  const enterMapView = useCallback(() => {
    measureLandrushFrameSlice('landrush-island.view.enter-map', () => {
      recordLandrushIslandPhaseProbe('view:enter-map:start', { from: viewMode })
      startTransition(() => {
        measureLandrushFrameSlice('landrush-island.view.enter-map.prepare-camera-handoff', () =>
          prepareCameraHandoff('map'),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-map.set-build-mode', () =>
          setBuildMode(false),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-map.set-build-parcel', () =>
          setBuildParcelId(null),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-map.set-map-view', () =>
          setMapView(true),
        )
        measureLandrushFrameSlice('landrush-island.view.enter-map.set-fpv-view', () =>
          setFpvView(false),
        )
      })
      measureLandrushFrameSlice('landrush-island.view.enter-map.release-pointer-lock', () =>
        releaseLandrushIslandPointerLock(),
      )
      recordLandrushIslandPhaseProbe('view:enter-map:state-dispatched', { from: viewMode })
    })
  }, [prepareCameraHandoff, viewMode])

  const enterBuildView = useCallback(
    (parcelId: string) => {
      measureLandrushFrameSlice('landrush-island.view.enter-build', () => {
        recordLandrushIslandPhaseProbe('view:enter-build:start', { from: viewMode })
        buildSceneEntryViewModeRef.current = viewMode
        gamepadBuildUndoBaselineRef.current = useScene.temporal.getState().pastStates.length
        startTransition(() => {
          measureLandrushFrameSlice('landrush-island.view.enter-build.prepare-camera-handoff', () =>
            prepareCameraHandoff('build'),
          )
          measureLandrushFrameSlice('landrush-island.view.enter-build.set-build-parcel', () =>
            setBuildParcelId(parcelId),
          )
          measureLandrushFrameSlice('landrush-island.view.enter-build.set-build-mode', () =>
            setBuildMode(true),
          )
          measureLandrushFrameSlice('landrush-island.view.enter-build.set-map-view', () =>
            setMapView(false),
          )
          measureLandrushFrameSlice('landrush-island.view.enter-build.set-fpv-view', () =>
            setFpvView(false),
          )
        })
        measureLandrushFrameSlice('landrush-island.view.enter-build.release-pointer-lock', () =>
          releaseLandrushIslandPointerLock(),
        )
        recordLandrushIslandPhaseProbe('view:enter-build:state-dispatched', { from: viewMode })
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
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.generate-island',
        () => generateWaterLabIsland(renderIslandParameters),
      ),
    [activeProfileMeasure, renderIslandParameters],
  )
  const livePerimeter = useMemo(
    () =>
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.create-perimeter',
        () => createLandrushIslandPerimeter(liveIsland),
      ),
    [activeProfileMeasure, liveIsland],
  )
  const liveSmoothedShorelinePoints = useMemo(
    () =>
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.smooth-perimeter',
        () => createLandrushIslandSmoothedPerimeter(livePerimeter.points),
      ),
    [activeProfileMeasure, livePerimeter.points],
  )
  const liveLandSurface = useMemo(
    () =>
      measureLandrushIslandSetup(activeProfileMeasure, 'setup.landrush-island.land-surface', () =>
        createLandrushIslandLandSurface({
          elevationParameters: renderElevationParameters,
          shorelinePoints: liveSmoothedShorelinePoints,
          waterPlaneSize: WATER_PLANE_SIZE,
        }),
      ),
    [activeProfileMeasure, liveSmoothedShorelinePoints, renderElevationParameters],
  )
  const liveParcelOptions = useMemo(
    () =>
      measureLandrushIslandSetup(activeProfileMeasure, 'setup.landrush-island.parcel-options', () =>
        createLandrushIslandParcelOptions(liveIsland.seed),
      ),
    [activeProfileMeasure, liveIsland.seed],
  )
  const liveParcelAllocation = useMemo(
    () =>
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.allocate-parcels',
        () => allocateParcels(liveLandSurface.grassSurfacePoints, liveParcelOptions),
      ),
    [activeProfileMeasure, liveLandSurface.grassSurfacePoints, liveParcelOptions],
  )
  const parcelWorldId = useMemo(
    () => createLandrushIslandParcelOwnershipWorldId(liveParcelOptions),
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
  const selectedLevelId = useViewer((state) => state.selection.levelId)
  const activeBuildLevelBaseY = useScene((state) =>
    resolveLandrushIslandActiveLevelBaseY(
      state.nodes,
      selectedLevelId ?? (LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id']),
    ),
  )
  const liveViewerLandSurface = useMemo(
    () =>
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.viewer-land-surface',
        () => createLandrushIslandViewerLandSurface(liveLandSurface),
      ),
    [activeProfileMeasure, liveLandSurface],
  )
  const activeBuildGroundY = liveViewerLandSurface.grassSurfaceElevation + activeBuildLevelBaseY
  const bladeSubdivisions = useMemo(
    () =>
      Math.min(
        profileBladeSubdivisions ?? Number.POSITIVE_INFINITY,
        isGrassFieldPreviewing
          ? Math.min(
              LANDRUSH_ISLAND_PROGRESSIVE_GRASS_BLADE_SUBDIVISIONS,
              resolveGrassWebGpuBladeSubdivisions(renderGrassTuning.density),
            )
          : resolveGrassWebGpuBladeSubdivisions(renderGrassTuning.density),
      ),
    [isGrassFieldPreviewing, profileBladeSubdivisions, renderGrassTuning.density],
  )
  const landrushIslandScene = useMemo(
    () =>
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.initial-scene-graph',
        () =>
          createLandrushIslandSceneGraph({
            elevationParameters: defaultElevationParameters,
            fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
            islandParameters: WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
            layoutConfig: experienceConfig,
            materialParameters: defaultMaterialParameters,
            omitWaterNode: startupProfileNoWaterNode || multiplayerNaturalEnvironment,
            profilePlainWaterMaterial,
            showDepthReference: false,
            terrainFieldResolution: WATER_FIELD_RESOLUTION,
            waterFieldDebugMode,
          }),
      ),
    [
      activeProfileMeasure,
      defaultElevationParameters,
      defaultMaterialParameters,
      experienceConfig,
      multiplayerNaturalEnvironment,
      profilePlainWaterMaterial,
      startupProfileNoWaterNode,
      waterFieldDebugMode,
    ],
  )
  const liveWaterNode = useMemo(
    () =>
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.live-water-node',
        () =>
          createLandrushIslandNode({
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
      measureLandrushIslandSetup(
        activeProfileMeasure,
        'setup.landrush-island.live-layout-node',
        () =>
          createLandrushIslandLayoutNode({
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
      measureLandrushIslandSetup(activeProfileMeasure, 'setup.landrush-island.grass-roads', () =>
        createLandrushIslandGrassRoadSegments(liveLayoutNode.roads.segments),
      ),
    [activeProfileMeasure, liveLayoutNode.roads.segments],
  )
  const liveNaturalRoadPlan = useMemo(
    () =>
      multiplayerNaturalEnvironment
        ? measureLandrushIslandSetup(
            activeProfileMeasure,
            'setup.landrush-island.natural-road-plan',
            () =>
              createNaturalRoadPlan({
                elevation: liveViewerLandSurface.grassSurfaceElevation,
                perimeter: liveViewerLandSurface.grassSurfacePoints,
                quality: 'high',
                roads: liveGrassRoads,
                seed: 'cala',
              }),
          )
        : null,
    [activeProfileMeasure, liveGrassRoads, liveViewerLandSurface, multiplayerNaturalEnvironment],
  )
  const liveRenderedGrassRoads = useMemo(
    () =>
      liveNaturalRoadPlan
        ? createNaturalRoadMaskSegments(liveNaturalRoadPlan, 1 / STYLIZED_PATH_WIDTH_SCALE)
        : liveGrassRoads,
    [liveGrassRoads, liveNaturalRoadPlan],
  )
  const liveOceanElevation = LANDRUSH_ISLAND_LOW_ELEVATION - liveLandSurface.grassSurfaceElevation
  const multiplayerViewerRockWallControls = useMemo(
    () => ({
      ...multiplayerRockWallControls,
      // Preserve the cliff-debug water-relative depth after the multiplayer viewer normalizes land to y=0.
      bottomElevationMeters:
        multiplayerRockWallControls.bottomElevationMeters +
        liveOceanElevation -
        LANDRUSH_WATER_SURFACE_ELEVATION,
    }),
    [liveOceanElevation, multiplayerRockWallControls],
  )
  const hasLiveWaterNode = useScene((state) =>
    Boolean(state.nodes[LANDRUSH_ISLAND_NODE_ID as never]),
  )
  const hasLiveLayoutNode = useScene((state) =>
    Boolean(state.nodes[experienceConfig.layoutNodeId as never]),
  )
  const sceneNodesForGrassBlockers = useScene((state) =>
    buildSceneModeActive ? null : state.nodes,
  )
  const builtGrassBlockersRef = useRef<readonly GrassFieldBlocker[] | null>(null)
  const builtGrassBlockers = useMemo(() => {
    if (sceneNodesForGrassBlockers === null) return builtGrassBlockersRef.current ?? []

    const nextBlockers = measureLandrushIslandSetup(
      activeProfileMeasure,
      'setup.landrush-island.built-grass-blockers',
      () => createLandrushIslandBuiltGrassBlockers(sceneNodesForGrassBlockers),
    )
    builtGrassBlockersRef.current = nextBlockers
    return nextBlockers
  }, [activeProfileMeasure, sceneNodesForGrassBlockers])
  const previousGrassBlockerBuildModeRef = useRef(buildSceneModeActive)
  const [visibleBladeGrassBlockers, setVisibleBladeGrassBlockers] =
    useState<readonly GrassFieldBlocker[]>(builtGrassBlockers)
  useLayoutEffect(() => {
    const wasBuildMode = previousGrassBlockerBuildModeRef.current

    if (buildSceneModeActive) {
      if (!wasBuildMode) {
        recordLandrushIslandGrassEventProbe({
          blockers: builtGrassBlockers.length,
          kind: 'build-enter-freeze-blockers',
        })
      }
    } else if (wasBuildMode) {
      const latestBlockers = createLandrushIslandBuiltGrassBlockers(useScene.getState().nodes)
      setVisibleBladeGrassBlockers(latestBlockers)
      recordLandrushIslandGrassEventProbe({
        visibleBlockers: latestBlockers.length,
        kind: 'build-exit-apply-blade-blockers',
      })
    } else {
      setVisibleBladeGrassBlockers(builtGrassBlockers)
    }

    previousGrassBlockerBuildModeRef.current = buildSceneModeActive
  }, [buildSceneModeActive, builtGrassBlockers])
  // Built objects only clear vertical blades; the flat ground texture stays stable below walls.
  const grassBlockers = LANDRUSH_ISLAND_GROUND_GRASS_BLOCKERS
  // Stable built footprints are structural blade blockers. The active build parcel
  // is fade-only so entering build mode does not rebuild grass instances mid-animation.
  const bladeGrassBlockers = useMemo(
    () =>
      visibleBladeGrassBlockers.length === 0
        ? LANDRUSH_ISLAND_GROUND_GRASS_BLOCKERS
        : [...LANDRUSH_ISLAND_GROUND_GRASS_BLOCKERS, ...visibleBladeGrassBlockers],
    [visibleBladeGrassBlockers],
  )
  const activeBuildParcelGrassFadeBlockers = useMemo(() => {
    const fadeBlockers: GrassFieldBlocker[] = []
    if (buildSceneModeActive && activeBuildParcel) {
      fadeBlockers.push({
        featherMeters: LANDRUSH_ISLAND_BUILD_PARCEL_BLADE_FEATHER_METERS,
        initialVisibility: 1,
        points: activeBuildParcel.points,
      })
    }
    return fadeBlockers
  }, [activeBuildParcel, buildSceneModeActive])
  const bladeGrassFadeBlockers = activeBuildParcelGrassFadeBlockers
  const treeGrassBlockers = useMemo(
    () =>
      activeBuildParcelGrassFadeBlockers.length === 0
        ? bladeGrassBlockers
        : [...bladeGrassBlockers, ...activeBuildParcelGrassFadeBlockers],
    [activeBuildParcelGrassFadeBlockers, bladeGrassBlockers],
  )
  const handleLoad = useCallback(async () => landrushIslandScene.sceneGraph, [landrushIslandScene])
  const handleBuildParcel = useCallback(
    (parcel: ParcelAllocationParcel) => enterBuildView(parcel.id),
    [enterBuildView],
  )
  const stylizedGrassDebugState = useMemo(
    () => ({ buildMode: buildSceneModeActive, source: 'pascal-multiplayer-island' }),
    [buildSceneModeActive],
  )
  const activeBuildCameraControlsInitialPose =
    buildMode && buildCameraControlsReady && !buildCameraControlsInitialPose
      ? maybeLandrushIslandCameraPoseToEditorInitialPose(buildCameraPoseRef.current)
      : buildCameraControlsInitialPose
  const handleBuildCameraSettled = useCallback((pose: LandrushIslandCameraPose) => {
    startTransition(() => {
      setBuildCameraControlsInitialPose(landrushIslandCameraPoseToEditorInitialPose(pose))
      setBuildCameraControlsReady(true)
    })
  }, [])

  useEffect(() => {
    setLocalProfile(readLocalPlayerProfile())
  }, [])

  useEffect(() => {
    if (buildMode || modeTransitionFade?.from === 'build') return
    setBuildCameraControlsInitialPose(null)
    setBuildCameraControlsReady(false)
  }, [buildMode, modeTransitionFade])

  useEffect(() => {
    if (!startupProfileEnabled || !startupProfileRef.current) {
      delete window.__LANDRUSH_ISLAND_STARTUP_PROFILE__
      return
    }

    const profile = startupProfileRef.current
    window.__LANDRUSH_ISLAND_STARTUP_PROFILE__ = profile
    const profileOutput = document.createElement('pre')
    profileOutput.hidden = true
    profileOutput.dataset.landrushIslandStartupProfile = '1'
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
        delete window.__LANDRUSH_ISLAND_STARTUP_PROFILE__
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
      delete window.__LANDRUSH_ISLAND_STARTUP_PROFILE__
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
    if (initialBuildMode || initialMapView) releaseLandrushIslandPointerLock()
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
      const invalidIds = createLandrushIslandInvalidBuildNodeIds(scene.nodes, activeBuildParcel)
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

  const handleTvMediaStateChange = useCallback(
    (parcelId: string, tvId: string, media: LandrushIslandTvMediaSettings) => {
      multiplayer.syncTvMediaState(parcelWorldId, parcelId, tvId, media)
    },
    [multiplayer.syncTvMediaState, parcelWorldId],
  )

  useEffect(() => {
    if (!hasLiveLayoutNode) return
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

      const nodes = sanitizeLandrushIslandIncomingBuildNodes(build, parcelWorldId, parcel)
      const signature = signatureForLandrushIslandBuildNodes(nodes)
      const snapshotKey = `${build.worldId}:${build.parcelId}`
      if (lastAppliedBuildSnapshotSignatureRef.current.get(snapshotKey) === signature) continue

      lastAppliedBuildSnapshotSignatureRef.current.set(snapshotKey, signature)
      if (
        buildMode &&
        build.updatedBy === resolvedLocalProfile.id &&
        signature === lastSyncedBuildSnapshotSignatureRef.current
      ) {
        continue
      }
      applyLandrushIslandBuildSnapshot(scene, build.parcelId, nodes)
    }
  }, [
    buildMode,
    hasLiveLayoutNode,
    liveParcelAllocation.parcels,
    multiplayer.parcelBuildNodes,
    parcelWorldId,
    resolvedLocalProfile.id,
  ])

  useEffect(() => {
    if (
      !hasLiveLayoutNode ||
      !localOwnedParcel ||
      multiplayer.parcelBuildSnapshotWorldId !== parcelWorldId
    ) {
      lastSyncedBuildSnapshotSignatureRef.current = null
      return
    }

    lastSyncedBuildSnapshotSignatureRef.current = null
    const syncOwnedParcelBuildNodes = () => {
      const nodes = createLandrushIslandSyncedBuildNodes({
        nodes: useScene.getState().nodes,
        parcel: localOwnedParcel,
        parcelWorldId,
      })
      const signature = signatureForLandrushIslandBuildNodes(nodes)
      if (signature === lastSyncedBuildSnapshotSignatureRef.current) return

      lastSyncedBuildSnapshotSignatureRef.current = signature
      multiplayer.syncParcelBuildNodes(parcelWorldId, localOwnedParcel.id, nodes)
    }

    syncOwnedParcelBuildNodes()
    return useScene.subscribe(syncOwnedParcelBuildNodes)
  }, [
    hasLiveLayoutNode,
    localOwnedParcel,
    multiplayer.parcelBuildSnapshotWorldId,
    multiplayer.syncParcelBuildNodes,
    parcelWorldId,
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
      buildingId: LANDRUSH_ISLAND_BUILDING_ID as never,
      levelId: LANDRUSH_ISLAND_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    editor.setFirstPersonMode(false)
    editor.setPreviewMode(false)
    editor.setViewMode('3d')
    editor.setMode('select')
    editor.setPhase('structure')
    editor.setStructureLayer('elements')
    editor.setFloorplanSelectionTool('click')
    editor.setActiveSidebarPanel('site')
    editor.setCatalogCategory(null)
    editor.setTool(null)
    sidebar.setIsCollapsed(true)

    renderScheduler.requestFrame('geometry:changed')
  }, [])

  useEffect(() => {
    if (!buildEditorChromeActive) return
    if (!buildMode && (modeTransitionFade === null || modeTransitionFade.from !== 'build')) return

    const timeoutId = window.setTimeout(() => {
      measureLandrushFrameSlice('landrush-island.effect.sync-build-mode', () => {
        syncLandrushIslandBuildEditorMode(buildMode)
        renderScheduler.requestFrame('geometry:changed')
      })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [buildEditorChromeActive, buildMode, modeTransitionFade])

  useEffect(() => {
    if (
      !hasLiveLayoutNode ||
      !buildEditorChromeActive ||
      (!buildMode && (modeTransitionFade === null || modeTransitionFade.from !== 'build'))
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      measureLandrushFrameSlice('landrush-island.effect.sync-build-mode-after-scene-load', () => {
        syncLandrushIslandBuildEditorMode(buildMode)
        renderScheduler.requestFrame('geometry:changed')
      })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [buildEditorChromeActive, buildMode, hasLiveLayoutNode, modeTransitionFade])

  useEffect(() => {
    if (fpvActive) {
      if (useEditor.getState().isFirstPersonMode) useEditor.getState().setFirstPersonMode(false)
      return
    }
    releaseLandrushIslandPointerLock()
  }, [fpvActive])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      measureLandrushFrameSlice('landrush-island.input.mode-keydown', () => {
        if (event.defaultPrevented || isEditableTarget(event.target) || event.repeat) return
        if (event.code === 'Escape' && fpvActive) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          measureLandrushFrameSlice('landrush-island.input.mode-keydown.exit-fpv', exitFpvView)
          return
        }
        if (event.code === 'Escape' && mapView) {
          event.preventDefault()
          event.stopPropagation()
          measureLandrushFrameSlice(
            'landrush-island.input.mode-keydown.enter-player',
            enterPlayerView,
          )
          return
        }
        if (event.code === 'KeyM') {
          event.preventDefault()
          event.stopPropagation()
          if (buildMode) {
            measureLandrushFrameSlice('landrush-island.input.mode-keydown.enter-map', enterMapView)
            return
          }
          if (mapView) {
            measureLandrushFrameSlice(
              'landrush-island.input.mode-keydown.enter-player',
              enterPlayerView,
            )
            return
          }
          measureLandrushFrameSlice('landrush-island.input.mode-keydown.enter-map', enterMapView)
          return
        }
        if (event.code === 'KeyB') {
          event.preventDefault()
          event.stopPropagation()
          if (buildMode) {
            measureLandrushFrameSlice(
              'landrush-island.input.mode-keydown.enter-player',
              enterPlayerView,
            )
            return
          }
          if (!localOwnedParcel) return
          measureLandrushFrameSlice('landrush-island.input.mode-keydown.enter-build', () =>
            enterBuildView(localOwnedParcel.id),
          )
          return
        }
        if (event.code === 'KeyF') {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          if (fpvActive) {
            measureLandrushFrameSlice('landrush-island.input.mode-keydown.exit-fpv', exitFpvView)
            return
          }
          measureLandrushFrameSlice('landrush-island.input.mode-keydown.enter-fpv', enterFpvView)
          return
        }
        if (event.code === 'KeyP') {
          const voiceBlocked = !spatialVoice.available && !spatialVoice.desired
          if (voiceBlocked) return
          event.preventDefault()
          event.stopPropagation()
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
    enterFpvView,
    enterMapView,
    enterPlayerView,
    exitFpvView,
    fpvActive,
    localOwnedParcel,
    mapView,
    spatialVoice,
  ])

  useEffect(() => {
    let frameId: number | null = null

    const tick = () => {
      const input = readLandrushGamepadInput()
      if (!gamepadHintsActiveRef.current && isLandrushIslandGamepadInputUsed(input)) {
        gamepadHintsActiveRef.current = true
        setGamepadHintsActive(true)
      }

      const buttons = readLandrushIslandGamepadButtonState(input)
      const previous = previousGamepadButtonsRef.current
      const squarePressed = wasLandrushIslandGamepadButtonPressed(buttons, previous, 'square')
      const circlePressed = wasLandrushIslandGamepadButtonPressed(buttons, previous, 'circle')
      const trianglePressed = wasLandrushIslandGamepadButtonPressed(buttons, previous, 'triangle')
      const crossPressed = wasLandrushIslandGamepadButtonPressed(buttons, previous, 'cross')
      const voicePressed = wasLandrushIslandGamepadButtonPressed(buttons, previous, 'leftShoulder')
      const nextModePressed =
        wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadRight') ||
        wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadDown')
      const previousModePressed =
        wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadLeft') ||
        wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadUp')

      previousGamepadButtonsRef.current = buttons

      if (voicePressed && (spatialVoice.available || spatialVoice.desired)) {
        measureLandrushFrameSlice('landrush-island.input.gamepad.toggle-voice', spatialVoice.toggle)
      }

      if (squarePressed) {
        if (buildMode) {
          gamepadBuildFocusRowRef.current = 'modes'
          gamepadBuildWallDraftActiveRef.current = false
          measureLandrushFrameSlice('landrush-island.input.gamepad.leave-build', enterPlayerView)
        } else if (localOwnedParcel) {
          gamepadBuildFocusRowRef.current = 'modes'
          gamepadBuildWallDraftActiveRef.current = false
          measureLandrushFrameSlice('landrush-island.input.gamepad.enter-build', () =>
            enterBuildView(localOwnedParcel.id),
          )
          gamepadBuildModeRef.current = resolveLandrushIslandCurrentGamepadBuildMode()
          scheduleLandrushIslandGamepadBuildModeFocus(gamepadBuildModeRef.current)
        }
      }

      if (trianglePressed) {
        measureLandrushFrameSlice(
          mapView && !buildMode
            ? 'landrush-island.input.gamepad.leave-map'
            : 'landrush-island.input.gamepad.enter-map',
          mapView && !buildMode ? enterPlayerView : enterMapView,
        )
      }

      if (circlePressed) {
        if (mapView && !buildMode) {
          measureLandrushFrameSlice('landrush-island.input.gamepad.leave-map', enterPlayerView)
        } else if (buildMode && gamepadBuildFocusRowRef.current === 'structure-tools') {
          if (gamepadBuildWallDraftActiveRef.current) {
            measureLandrushFrameSlice('landrush-island.input.gamepad.cancel-wall-draft', () =>
              cancelLandrushIslandGamepadWallDraft(gamepadBuildWallDraftActiveRef),
            )
          } else {
            measureLandrushFrameSlice('landrush-island.input.gamepad.leave-structure-tools', () =>
              leaveLandrushIslandGamepadStructureToolRow(gamepadBuildFocusRowRef),
            )
          }
        } else if (buildMode) {
          measureLandrushFrameSlice('landrush-island.input.gamepad.undo-build', () =>
            runLandrushIslandGamepadUndo(gamepadBuildUndoBaselineRef),
          )
        }
      }

      if (buildMode) {
        if (gamepadBuildFocusRowRef.current === 'structure-tools') {
          if (nextModePressed || previousModePressed) {
            measureLandrushFrameSlice('landrush-island.input.gamepad.select-structure-tool', () => {
              selectLandrushIslandAdjacentGamepadStructureTool(nextModePressed ? 1 : -1)
              if (useEditor.getState().tool !== 'wall') {
                gamepadBuildWallDraftActiveRef.current = false
              }
            })
          }
          frameId = window.requestAnimationFrame(tick)
          return
        }

        if (nextModePressed || previousModePressed) {
          const currentMode =
            gamepadBuildModeRef.current || resolveLandrushIslandCurrentGamepadBuildMode()
          gamepadBuildModeRef.current = cycleLandrushIslandGamepadBuildMode(
            currentMode,
            nextModePressed ? 1 : -1,
          )
          focusLandrushIslandGamepadBuildMode(gamepadBuildModeRef.current)
        }
        if (crossPressed) {
          measureLandrushFrameSlice('landrush-island.input.gamepad.apply-build-mode', () => {
            const mode = gamepadBuildModeRef.current
            applyLandrushIslandGamepadBuildMode(mode)
            if (mode === 'build')
              enterLandrushIslandGamepadStructureToolRow(gamepadBuildFocusRowRef)
          })
        }
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
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
    if (!buildMode) {
      gamepadBuildFocusRowRef.current = 'modes'
      gamepadBuildWallDraftActiveRef.current = false
      gamepadBuildUndoBaselineRef.current = null
      return
    }
    gamepadBuildUndoBaselineRef.current ??= useScene.temporal.getState().pastStates.length
    gamepadBuildModeRef.current = resolveLandrushIslandCurrentGamepadBuildMode()
    scheduleLandrushIslandGamepadBuildModeFocus(gamepadBuildModeRef.current)
  }, [buildMode])

  useEffect(() => {
    const scene = useScene.getState()
    if (hasLiveWaterNode) {
      const existingWaterNode = scene.nodes[LANDRUSH_ISLAND_NODE_ID as never] as
        | LandrushIslandNode
        | undefined
      if (multiplayerNaturalEnvironment) {
        if (existingWaterNode?.visible !== false) {
          scene.updateNode(
            LANDRUSH_ISLAND_NODE_ID as never,
            { ...liveWaterNode, visible: false } as never,
          )
        }
      } else {
        const skipIdenticalDebugWaterNode =
          waterFieldDebugMode === 'cached-worker' &&
          existingWaterNode &&
          createLandrushIslandNodeRenderSignature(existingWaterNode) ===
            createLandrushIslandNodeRenderSignature(liveWaterNode)
        if (!skipIdenticalDebugWaterNode) {
          scene.updateNode(LANDRUSH_ISLAND_NODE_ID as never, liveWaterNode as never)
        }
      }
    }
    if (hasLiveLayoutNode) {
      scene.updateNode(experienceConfig.layoutNodeId as never, liveLayoutNode as never)
    }
    window.__LANDRUSH_ISLAND_DEBUG__ = {
      features: [
        'pascal-editor-canvas',
        'landrush-island-water-node',
        'pascal-landrush-layout-node',
        'pascal-build-grid-aligned-to-grass-plane',
        'build-chrome-hidden-until-toggle',
        'donated-water-field-texture',
        'world-multiplayer-water-material',
        'world-multiplayer-full-water-plane',
        'donated-shore-contours',
        'world-multiplayer-dirt-copy-parcels',
        'world-multiplayer-dirt-copy-edge-paths',
        ...(multiplayerNaturalEnvironment ? [] : ['water-scene-cliff-ring']),
        'grass-water-blades',
        'grass-water-stylized-trees',
        'grass-water-road-masked-spawn-field',
        ...(multiplayerNaturalEnvironment
          ? [
              'standalone-spectral-ocean',
              'blender-reference-procedural-rock-cliffs',
              'procedural-rock-offshore-field',
              'procedural-rock-waterline-distance-field',
              'mesh-water-boundary-foam',
              'submerged-rock-depth-transmission',
              'standalone-ocean-and-rock-controls',
              'natural-road-network',
              'constant-inward-perimeter-sidewalk',
              'multiplayer-sidewalk-material-style',
            ]
          : []),
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
      delete window.__LANDRUSH_ISLAND_DEBUG__
    }
  }, [
    experienceConfig,
    hasLiveLayoutNode,
    hasLiveWaterNode,
    liveLayoutNode,
    liveWaterNode,
    multiplayerNaturalEnvironment,
    waterFieldDebugMode,
  ])

  const resetParameters = () => {
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setFieldParameters({ ...WATER_LAB_DEFAULT_FIELD_PARAMETERS })
    setElevationParameters({ ...defaultElevationParameters })
    setMaterialParameters({ ...defaultMaterialParameters })
    setMultiplayerOceanAnimated(true)
    setMultiplayerOceanParameters(createDefaultStandaloneOceanParameters())
    setMultiplayerBeachControls({ ...DEFAULT_PROCEDURAL_BEACH_CONTROLS })
    setMultiplayerRockCutCount(PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_CUT_COUNT)
    setMultiplayerRockScale(PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_SCALE)
    setMultiplayerRockWallControls({ ...DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS })
    setMultiplayerRockOffshoreControls({ ...DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS })
    setMultiplayerRockToneControls({ ...DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS })
    setGrassTuning({ ...defaultGrassTuning })
    setGrassGroundTintCapPercent(LANDRUSH_ISLAND_GRASS_GROUND_TINT_CAP_PERCENT)
    setTerrainFieldResolution(WATER_FIELD_RESOLUTION)
  }
  const handleLoadingLoaded = useCallback(() => setLoadingActive(false), [])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0f1720] [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:touch-none">
      <div
        aria-hidden={loadingActive}
        className={[
          'absolute inset-0 transition-[filter,transform,opacity] duration-500 ease-out',
          loadingActive
            ? 'pointer-events-none scale-[1.01] blur-[7px]'
            : 'scale-100 blur-0 brightness-100',
        ].join(' ')}
      >
        <LandrushIslandStartupReactProfiler
          enabled={editorRuntimeReactProfileEnabled}
          id="runtime.landrush-island.editor"
          onRender={handleRuntimeReactRender}
        >
          <LandrushIslandStartupReactProfiler
            enabled={startupProfileEnabled}
            id="landrush-island.editor"
            onRender={handleStartupReactRender}
          >
            <Editor
              layoutVersion="v2"
              onLoad={handleLoad}
              projectId={experienceConfig.projectId}
              reactProfiler={editorRuntimeReactProfiler}
              showEditorChrome={buildEditorChromeActive}
              showFullActionMenu
              showMobileSelectionBar={false}
              showSidebarRail={false}
              sidebarTabs={[]}
              viewerCameraControls={
                buildMode && buildEditorSystemsActive && buildCameraControlsReady
              }
              viewerCameraInitialPose={activeBuildCameraControlsInitialPose}
              viewerDefaultCamera={false}
              viewerEditorGrid={buildMode && buildEditorChromeActive}
              viewerEditorGridVisualOffset={0.04}
              viewerEditorGridY={activeBuildGroundY}
              viewerEditorSystems={buildEditorSystemsActive}
              viewerSceneEnvironment={false}
              viewerPostProcessing={false}
              viewerPresentationEffectRef={modeTransitionPresentationRef}
              viewerRendererBackend={viewerRendererBackend}
              viewerSceneChildren={
                <LandrushIslandStartupReactProfiler
                  enabled={editorRuntimeReactProfileEnabled}
                  id="runtime.landrush-island.viewer-scene-children"
                  onRender={handleRuntimeReactRender}
                >
                  <LandrushIslandStartupReactProfiler
                    enabled={startupProfileEnabled}
                    id="landrush-island.viewer-scene-children"
                    onRender={handleStartupReactRender}
                  >
                    <color args={['#164a77']} attach="background" />
                    {multiplayerNaturalEnvironment ? (
                      <>
                        {!profileNoOcean ? (
                          <StandaloneOceanWorld
                            animated={multiplayerOceanAnimated}
                            cameraPreset="design"
                            debugMode="final"
                            elevation={liveOceanElevation}
                            parameters={multiplayerOceanParameters}
                            profileMeasure={activeProfileMeasure}
                            quality="balanced"
                            resetRevision={0}
                            submergedRockRefraction
                            waterlineInteractionField={multiplayerWaterlineInteractionField}
                          />
                        ) : null}
                        {!profileNoCliffs ? (
                          <ProceduralRockCliffs
                            beachControls={multiplayerBeachControls}
                            cutCount={multiplayerRockCutCount}
                            debugMode="final"
                            offshoreControls={multiplayerRockOffshoreControls}
                            onRuntimeMetrics={
                              profileRuntimeMetrics ? handleCliffRuntimeMetrics : undefined
                            }
                            onWaterlineInteractionField={setMultiplayerWaterlineInteractionField}
                            profileMeasure={activeProfileMeasure}
                            quality="balanced"
                            rockRenderOrder={-10}
                            rockScale={multiplayerRockScale}
                            seed={PASCAL_MULTIPLAYER_ISLAND_ROCK_CLIFF_SEED}
                            showGround={false}
                            surface={liveViewerLandSurface}
                            toneControls={multiplayerRockToneControls}
                            wallControls={multiplayerViewerRockWallControls}
                            waterSurfaceElevation={liveOceanElevation}
                          />
                        ) : null}
                      </>
                    ) : null}
                    <FrameLoadProfilerProbe enabled={frameProfile} />
                    <LandrushIslandEditorOverlayLayerBridge enabled={buildEditorChromeActive} />
                    <LandrushIslandStartupReactProfiler
                      enabled={editorRuntimeReactProfileEnabled}
                      id="runtime.landrush-island.player-layer"
                      onRender={handleRuntimeReactRender}
                    >
                      <MemoizedLandrushIslandPlayerLayer
                        baseNode={liveLayoutNode}
                        buildCameraPoseRef={buildCameraPoseRef}
                        fallPresentationRef={fallPresentationRef}
                        fpvActive={fpvActive}
                        grassInteractionRef={grassInteractionRef}
                        localMotionRef={localMotionRef}
                        localProfile={resolvedLocalProfile}
                        mapPresentationProgressRef={mapPresentationProgressRef}
                        mapPresentationVisible={mapPresentationVisible}
                        mapCameraPoseRef={mapCameraPoseRef}
                        mapReturnCameraPoseRef={mapReturnCameraPoseRef}
                        mapTransitionStartPoseRef={mapTransitionStartPoseRef}
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
                        remotePlayerStore={multiplayer.remotePlayerStore}
                        remotePlayers={multiplayer.remotePlayers}
                        remoteVoicePeerIds={spatialVoice.remoteVoicePeerIds}
                        robotScreenRevealEnabled={robotScreenRevealEnabled}
                        surface={liveViewerLandSurface}
                        viewMode={sceneViewMode}
                        voiceRangeVisible={spatialVoice.desired && spatialVoice.status === 'live'}
                        waterY={
                          LANDRUSH_ISLAND_LOW_ELEVATION - liveLandSurface.grassSurfaceElevation
                        }
                      />
                    </LandrushIslandStartupReactProfiler>
                    {revealProof ? (
                      <LandrushIslandRevealProofOccluder
                        motionRef={localMotionRef}
                        presentationMode={sceneViewMode === 'build' ? 'hover' : 'default'}
                        visible={sceneViewMode !== 'map'}
                      />
                    ) : null}
                    <LandrushIslandStartupReactProfiler
                      enabled={editorRuntimeReactProfileEnabled}
                      id="runtime.landrush-island.parcel-ownership-layer"
                      onRender={handleRuntimeReactRender}
                    >
                      <MemoizedLandrushIslandParcelOwnershipLayer
                        allocation={liveParcelAllocation}
                        buildParcelId={buildSceneModeActive ? buildParcelId : null}
                        buildMode={buildSceneModeActive}
                        claimParcel={multiplayer.claimParcel}
                        localMotionRef={localMotionRef}
                        localProfile={resolvedLocalProfile}
                        mapPresentationProgressRef={mapPresentationProgressRef}
                        mapPresentationVisible={mapPresentationVisible}
                        mapLabelsVisible={mapLabelsVisible}
                        mapView={sceneViewMode === 'map'}
                        onBuildParcel={handleBuildParcel}
                        parcelOwnerships={multiplayer.parcelOwnerships}
                        parcelWorldId={parcelWorldId}
                        roads={liveGrassRoads}
                        surface={liveViewerLandSurface}
                        watchParcelWorld={multiplayer.watchParcelWorld}
                      />
                    </LandrushIslandStartupReactProfiler>
                    <LandrushIslandBuildParcelGuardLayer
                      buildMode={buildSceneModeActive}
                      groundY={activeBuildGroundY}
                      parcel={buildSceneModeActive ? activeBuildParcel : null}
                    />
                    <LandrushIslandStartupReactProfiler
                      enabled={editorRuntimeReactProfileEnabled}
                      id="runtime.landrush-island.build-camera-rig"
                      onRender={handleRuntimeReactRender}
                    >
                      <LandrushIslandBuildCameraRig
                        buildCameraPoseRef={buildCameraPoseRef}
                        captureEditorCameraPose={buildCameraControlsReady}
                        groundY={activeBuildGroundY}
                        onSettled={handleBuildCameraSettled}
                        parcel={activeBuildParcel}
                        playerCameraPoseRef={playerCameraPoseRef}
                        visible={buildMode}
                      />
                    </LandrushIslandStartupReactProfiler>
                    <LandrushIslandBuildCameraMouseOrbitController
                      buildCameraPoseRef={buildCameraPoseRef}
                      groundY={activeBuildGroundY}
                      parcel={buildSceneModeActive ? activeBuildParcel : null}
                      visible={buildSceneModeActive}
                    />
                    <LandrushIslandBuildGamepadPlacementController
                      buildCameraPoseRef={buildCameraPoseRef}
                      focusRowRef={gamepadBuildFocusRowRef}
                      groundY={activeBuildGroundY}
                      parcel={buildSceneModeActive ? activeBuildParcel : null}
                      visible={buildSceneModeActive}
                      wallDraftActiveRef={gamepadBuildWallDraftActiveRef}
                    />
                    <LandrushIslandRobotLevelSelectionTracker
                      enabled={!buildSceneModeActive}
                      groundY={liveViewerLandSurface.grassSurfaceElevation}
                      localMotionRef={localMotionRef}
                    />
                    {!startupProfileNoLandLayers ? (
                      <LandrushIslandStartupReactProfiler
                        enabled={editorRuntimeReactProfileEnabled}
                        id="runtime.landrush-island.land-layers"
                        onRender={handleRuntimeReactRender}
                      >
                        <LandrushIslandStartupReactProfiler
                          enabled={startupProfileEnabled}
                          id="landrush-island.land-layers"
                          onRender={handleStartupReactRender}
                        >
                          <Suspense fallback={null}>
                            <MemoizedGrassWaterLandLayers
                              bladeFadeBlockers={bladeGrassFadeBlockers}
                              bladeSubdivisions={bladeSubdivisions}
                              bladeGrassBlockers={bladeGrassBlockers}
                              fieldResolution={LANDRUSH_ISLAND_PROGRESSIVE_GRASS_FIELD_RESOLUTION}
                              finalFieldResolution={
                                isGrassFieldPreviewing
                                  ? LANDRUSH_ISLAND_PROGRESSIVE_GRASS_FIELD_RESOLUTION
                                  : LANDRUSH_ISLAND_INTERACTIVE_GRASS_FIELD_RESOLUTION
                              }
                              finalSpawnResolution={
                                isGrassFieldPreviewing
                                  ? LANDRUSH_ISLAND_PROGRESSIVE_GRASS_FIELD_RESOLUTION
                                  : LANDRUSH_ISLAND_INTERACTIVE_GRASS_FIELD_RESOLUTION
                              }
                              bladeRenderOrder={
                                buildSceneModeActive
                                  ? LANDRUSH_ISLAND_BUILD_GRASS_BLADE_RENDER_ORDER
                                  : undefined
                              }
                              bladeVisibilityRef={grassVisibilityRef}
                              grassDebugState={stylizedGrassDebugState}
                              grassInteractionRef={grassInteractionRef}
                              grassStreamingPaused={grassStreamingPaused}
                              grassBlockers={grassBlockers}
                              groundRenderOrder={
                                buildSceneModeActive
                                  ? LANDRUSH_ISLAND_BUILD_GRASS_GROUND_RENDER_ORDER
                                  : undefined
                              }
                              onStylizedGroundTextureReady={setStylizedGroundTextureReady}
                              profileMeasure={activeProfileMeasure}
                              renderStylizedPathNetwork={!multiplayerNaturalEnvironment}
                              roads={liveRenderedGrassRoads}
                              bladesVisible={grassBladesVisible}
                              showBlades={!startupProfileNoStylizedBlades}
                              showGround
                              showTrees={!startupProfileNoStylizedTrees}
                              spawnResolution={LANDRUSH_ISLAND_PROGRESSIVE_GRASS_FIELD_RESOLUTION}
                              stylizedGroundTexture={!startupProfileNoStylizedGround}
                              stylizedGroundTextureWorldSizeMeters={
                                LANDRUSH_ISLAND_GRASS_TEXTURE_TILE_METERS
                              }
                              stylizedGrassGroundTintCap={grassGroundTintCapPercent / 100}
                              stylizedSceneLayout
                              surface={liveViewerLandSurface}
                              treeBlockers={treeGrassBlockers}
                              tuning={renderGrassTuning}
                            />
                          </Suspense>
                          {liveNaturalRoadPlan ? (
                            <NaturalRoadNetworkLayer
                              debugMode="final"
                              plan={liveNaturalRoadPlan}
                              renderOrder={30}
                              sidewalkStyle="multiplayer-island"
                            />
                          ) : null}
                        </LandrushIslandStartupReactProfiler>
                      </LandrushIslandStartupReactProfiler>
                    ) : null}
                    <LandrushIslandPlacedTvScreens
                      enabled={experience === 'pascal-multiplayer-island'}
                      localMotionRef={localMotionRef}
                      mediaStates={multiplayer.tvMediaStates}
                      onMediaStateChange={handleTvMediaStateChange}
                    />
                    <LandrushIslandRuntimeCameraProbeRecorder
                      mode={viewMode}
                      renderedFpsRef={renderedFpsRef}
                    />
                  </LandrushIslandStartupReactProfiler>
                </LandrushIslandStartupReactProfiler>
              }
              viewerUseBvh={false}
            />
          </LandrushIslandStartupReactProfiler>
        </LandrushIslandStartupReactProfiler>
        <MultiplayerStatusPanel
          connection={multiplayer.connection}
          localPlayerIncluded={!offline}
          remotePlayerCount={multiplayer.remotePlayers.length}
          renderedFpsRef={renderedFpsRef}
          status={multiplayerStatus}
        />
        <div
          className="pointer-events-auto absolute top-20 right-3 z-[80] flex flex-col gap-1 rounded-md border border-white/16 bg-slate-950/58 p-1 shadow-2xl backdrop-blur-md md:top-[18vh] md:right-5 md:gap-1.5 md:rounded-lg md:p-1.5"
          data-landrush-ui
        >
          <button
            aria-label="Map mode"
            aria-pressed={mapView && !buildMode}
            className={landrushIslandModeButtonClass(mapView && !buildMode)}
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
            <span className="hidden text-lg md:inline">{gamepadHintsActive ? '△' : 'M'}</span>
          </button>
          {!fpvActive ? (
            <button
              aria-label="Build mode"
              aria-pressed={buildMode}
              className={landrushIslandModeButtonClass(buildMode)}
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
              <span className="hidden text-lg md:inline">{gamepadHintsActive ? '□' : 'B'}</span>
            </button>
          ) : null}
          <LandrushIslandVoiceModeButton
            gamepadHintsActive={gamepadHintsActive}
            voice={spatialVoice}
          />
          <button
            aria-label={fpvActive ? 'Exit FPV mode' : 'FPV mode'}
            aria-pressed={fpvActive}
            className={landrushIslandModeButtonClass(fpvActive)}
            onClick={() => {
              if (fpvActive) {
                exitFpvView()
                return
              }
              enterFpvView()
            }}
            title={fpvActive ? 'Exit FPV mode' : 'FPV mode'}
            type="button"
          >
            <Eye aria-hidden className="size-5" />
            <span className="hidden text-lg md:inline">F</span>
          </button>
          <div className={landrushIslandModeHintClass()} title="Right click to move">
            <MouseRight aria-hidden className="size-6 text-white/82" />
            <span>Move</span>
          </div>
          {buildMode ? (
            <div className="border-white/10 border-t pt-1.5" data-landrush-ui-interactive>
              <LandrushIslandLevelModeControls />
            </div>
          ) : null}
        </div>
        {showTunePanel ? (
          <LandrushIslandTunePanel
            beachControls={multiplayerBeachControls}
            elevationParameters={elevationParameters}
            fieldParameters={fieldParameters}
            grassGroundTintCapPercent={grassGroundTintCapPercent}
            grassTuning={grassTuning}
            islandParameters={islandParameters}
            materialParameters={materialParameters}
            multiplayerNaturalEnvironment={multiplayerNaturalEnvironment}
            oceanAnimated={multiplayerOceanAnimated}
            oceanParameters={multiplayerOceanParameters}
            onBeachControlChange={(key, value) =>
              setMultiplayerBeachControls((current) => ({ ...current, [key]: value }))
            }
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
            onGrassGroundTintCapPercentChange={setGrassGroundTintCapPercent}
            onIslandChange={(key, value) =>
              setIslandParameters((current) => ({ ...current, [key]: value }))
            }
            onMaterialChange={(key, value) =>
              setMaterialParameters(
                (current) => ({ ...current, [key]: value }) as LandrushWaterSurfaceParameters,
              )
            }
            onOceanAnimatedChange={setMultiplayerOceanAnimated}
            onOceanParametersChange={setMultiplayerOceanParameters}
            onReset={resetParameters}
            onRockCutCountChange={(value) => setMultiplayerRockCutCount(Math.round(value))}
            onRockOffshoreControlChange={(key, value) =>
              setMultiplayerRockOffshoreControls((current) => ({ ...current, [key]: value }))
            }
            onRockScaleChange={setMultiplayerRockScale}
            onRockToneControlChange={(key, value) =>
              setMultiplayerRockToneControls((current) => ({ ...current, [key]: value }))
            }
            onRockWallControlChange={(key, value) =>
              setMultiplayerRockWallControls((current) => ({ ...current, [key]: value }))
            }
            onTerrainFieldResolutionChange={(value) => setTerrainFieldResolution(Math.round(value))}
            rockCutCount={multiplayerRockCutCount}
            rockOffshoreControls={multiplayerRockOffshoreControls}
            rockScale={multiplayerRockScale}
            rockToneControls={multiplayerRockToneControls}
            rockWallControls={multiplayerRockWallControls}
            terrainFieldResolution={terrainFieldResolution}
            rockReferenceWaterSurfaceElevation={LANDRUSH_WATER_SURFACE_ELEVATION}
          />
        ) : (
          <button
            className="pointer-events-auto absolute top-5 right-5 hidden items-center gap-2 rounded-md border border-white/25 bg-slate-950/78 px-3 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur transition hover:border-white/45 hover:text-white md:inline-flex"
            onClick={() => setShowTunePanel(true)}
            type="button"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Sliders
          </button>
        )}
      </div>
      <LandrushIslandLoadingOverlay
        assetsReady={loadingAssetsReady}
        onLoaded={handleLoadingLoaded}
      />
      <LandrushIslandFallScreenEffect presentationRef={fallPresentationRef} />
    </main>
  )
}

function LandrushIslandFallScreenEffect({
  presentationRef,
}: {
  presentationRef: { current: LandrushIslandFallPresentationState }
}) {
  const [snapshot, setSnapshot] = useState(() => createLandrushIslandFallPresentationState())

  useEffect(() => {
    let frameId: number | null = null
    const tick = () => {
      const next = presentationRef.current
      setSnapshot((current) => {
        if (
          current.active === next.active &&
          Math.abs(current.amount - next.amount) < 0.012 &&
          Math.abs(current.slowMotionFactor - next.slowMotionFactor) < 0.025
        ) {
          return current
        }
        return { ...next }
      })
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [presentationRef])

  const amount = MathUtils.smoothstep(clamp01(snapshot.amount), 0, 1)
  if (!snapshot.active && amount <= 0.001) return null

  const blur = amount * 18
  const opacity = clamp01(amount * 1.18)
  const darkness = amount * 0.72

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[95] transition-opacity duration-75 ease-linear"
      style={{
        WebkitBackdropFilter: `blur(${blur}px) saturate(${1 - amount * 0.32})`,
        backdropFilter: `blur(${blur}px) saturate(${1 - amount * 0.32})`,
        backgroundColor: `rgba(2, 15, 42, ${darkness})`,
        opacity,
      }}
    />
  )
}

function createLandrushIslandModeTransitionPresentationState(
  zoomBlurDebugMode: ViewerPresentationEffectDebugMode,
): LandrushIslandModeTransitionPresentationState {
  return {
    grassVisibility: 1,
    zoomBlurAmount: 0,
    zoomBlurCenter: [0.5, 0.48],
    zoomBlurDebugMode,
    zoomBlurDirection: 1,
  }
}

function updateLandrushIslandModeTransitionPresentation(
  output: LandrushIslandModeTransitionPresentationState,
  viewMode: LandrushIslandViewMode,
  transition: LandrushIslandModeTransitionFadeState | null,
  progress: number,
) {
  if (!transition) {
    output.grassVisibility = viewMode === 'map' ? 0 : 1
    output.zoomBlurAmount = 0
    output.zoomBlurDirection = 1
    return
  }

  const amount = clamp01(progress)
  const normalizedCameraVelocity = 4 * amount * (1 - amount)
  const blurIn = MathUtils.smoothstep(amount, 0.015, 0.14)
  const blurOut = 1 - MathUtils.smoothstep(amount, 0.72, 0.98)
  const conceal = MathUtils.smoothstep(amount, 0.16, 0.36)
  const reveal = MathUtils.smoothstep(amount, 0.5, 0.7)
  const fromVisibility = transition.from === 'map' ? 0 : 1
  const targetVisibility = transition.to === 'map' ? 0 : 1

  output.zoomBlurAmount = clamp01(normalizedCameraVelocity ** 0.72 * blurIn * blurOut)
  output.zoomBlurDirection =
    transition.to === 'map' || (transition.from === 'player' && transition.to === 'build') ? 1 : -1
  output.grassVisibility =
    fromVisibility === targetVisibility
      ? clamp01(fromVisibility - conceal + reveal)
      : fromVisibility > targetVisibility
        ? 1 - conceal
        : reveal
}

function resolveLandrushIslandMapPresentationProgress(
  viewMode: LandrushIslandViewMode,
  transition: LandrushIslandModeTransitionFadeState | null,
  progress: number,
) {
  if (!transition) return viewMode === 'map' ? 1 : 0

  const amount = easeLandrushIslandCameraTransition(progress, transition.to)
  if (transition.to === 'map') return amount
  if (transition.from === 'map') return 1 - amount
  return viewMode === 'map' ? 1 : 0
}

function LandrushIslandLoadingOverlay({
  assetsReady,
  onLoaded,
}: {
  assetsReady: boolean
  onLoaded: () => void
}) {
  const { progress, visible } = useLandrushIslandLoadingProgress(assetsReady)
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

function LandrushIslandTunePanel({
  beachControls,
  elevationParameters,
  fieldParameters,
  grassGroundTintCapPercent,
  grassTuning,
  islandParameters,
  materialParameters,
  multiplayerNaturalEnvironment,
  oceanAnimated,
  oceanParameters,
  onBeachControlChange,
  onClose,
  onElevationChange,
  onFieldChange,
  onGrassChange,
  onGrassGroundTintCapPercentChange,
  onIslandChange,
  onMaterialChange,
  onOceanAnimatedChange,
  onOceanParametersChange,
  onReset,
  onRockCutCountChange,
  onRockOffshoreControlChange,
  onRockScaleChange,
  onRockToneControlChange,
  onRockWallControlChange,
  onTerrainFieldResolutionChange,
  rockCutCount,
  rockOffshoreControls,
  rockScale,
  rockToneControls,
  rockWallControls,
  terrainFieldResolution,
  rockReferenceWaterSurfaceElevation,
}: {
  beachControls: ProceduralBeachControls
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  grassGroundTintCapPercent: number
  grassTuning: GrassBladeTuning
  islandParameters: WaterLabIslandParameters
  materialParameters: LandrushWaterSurfaceParameters
  multiplayerNaturalEnvironment: boolean
  oceanAnimated: boolean
  oceanParameters: StandaloneOceanParameters
  onBeachControlChange: (key: ProceduralBeachNumericControl, value: number) => void
  onClose: () => void
  onElevationChange: (key: ElevationSliderKey, value: number) => void
  onFieldChange: (key: FieldSliderKey, value: number) => void
  onGrassChange: (key: keyof GrassBladeTuning, value: number) => void
  onGrassGroundTintCapPercentChange: (value: number) => void
  onIslandChange: (key: IslandSliderKey, value: number) => void
  onMaterialChange: (key: WaterMaterialSliderKey, value: number) => void
  onOceanAnimatedChange: (animated: boolean) => void
  onOceanParametersChange: Dispatch<SetStateAction<StandaloneOceanParameters>>
  onReset: () => void
  onRockCutCountChange: (value: number) => void
  onRockOffshoreControlChange: (key: keyof ProceduralRockOffshoreControls, value: number) => void
  onRockScaleChange: (value: number) => void
  onRockToneControlChange: (key: keyof ProceduralRockToneControls, value: number) => void
  onRockWallControlChange: (key: keyof ProceduralRockCliffWallControls, value: number) => void
  onTerrainFieldResolutionChange: (value: number) => void
  rockCutCount: number
  rockOffshoreControls: ProceduralRockOffshoreControls
  rockScale: number
  rockToneControls: ProceduralRockToneControls
  rockWallControls: ProceduralRockCliffWallControls
  terrainFieldResolution: number
  rockReferenceWaterSurfaceElevation: number
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<LandrushIslandTuningGroupId, boolean>
  >({
    grass: true,
    island: true,
    rocks: false,
    waterAreas: true,
    waterEdge: true,
    waterRipples: false,
  })
  const toggleGroup = (group: LandrushIslandTuningGroupId) => {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  return (
    <section className="pointer-events-auto absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[min(390px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">
            {multiplayerNaturalEnvironment ? 'Pascal island environment' : 'Pascal water'}
          </div>
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
        {multiplayerNaturalEnvironment ? (
          <StandaloneOceanParameterControls
            animated={oceanAnimated}
            onAnimatedChange={onOceanAnimatedChange}
            onParametersChange={onOceanParametersChange}
            parameters={oceanParameters}
          />
        ) : null}
        <LandrushIslandTuningGroup
          collapsed={collapsedGroups.island}
          onToggle={() => toggleGroup('island')}
          title="Water island"
        >
          {WATER_LAB_ISLAND_SLIDERS.map(({ key, ...slider }) => (
            <LandrushIslandTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onIslandChange(key, value)}
              value={islandParameters[key]}
            />
          ))}
          <LandrushIslandTuneSlider
            label="field resolution"
            max={WATER_FIELD_RESOLUTION}
            min={128}
            onChange={onTerrainFieldResolutionChange}
            step={64}
            value={terrainFieldResolution}
          />
        </LandrushIslandTuningGroup>
        {!multiplayerNaturalEnvironment ? (
          <LandrushIslandTuningGroup
            collapsed={collapsedGroups.waterAreas}
            onToggle={() => toggleGroup('waterAreas')}
            title="Water areas"
          >
            {FIELD_SLIDERS.map(({ key, ...slider }) => (
              <LandrushIslandTuneSlider
                key={key}
                {...slider}
                onChange={(value) => onFieldChange(key, value)}
                value={fieldParameters[key]}
              />
            ))}
          </LandrushIslandTuningGroup>
        ) : null}
        <LandrushIslandTuningGroup
          collapsed={collapsedGroups.waterEdge}
          onToggle={() => toggleGroup('waterEdge')}
          title="Raised edge"
        >
          {ELEVATION_SLIDERS.map(({ key, ...slider }) => (
            <LandrushIslandTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onElevationChange(key, value)}
              value={elevationParameters[key]}
            />
          ))}
        </LandrushIslandTuningGroup>
        {!multiplayerNaturalEnvironment ? (
          <LandrushIslandTuningGroup
            collapsed={collapsedGroups.waterRipples}
            onToggle={() => toggleGroup('waterRipples')}
            title="Water ripples"
          >
            {WATER_MATERIAL_SLIDERS.map(({ key, ...slider }) => (
              <LandrushIslandTuneSlider
                key={key}
                {...slider}
                onChange={(value) => onMaterialChange(key, value)}
                value={materialParameters[key]}
              />
            ))}
          </LandrushIslandTuningGroup>
        ) : null}
        {multiplayerNaturalEnvironment ? (
          <LandrushIslandTuningGroup
            collapsed={collapsedGroups.rocks}
            onToggle={() => toggleGroup('rocks')}
            title="Cliffs and shore rocks"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-lime-100/80">
              Ocean-floor bathymetry
            </div>
            <LandrushIslandTuneSlider
              label="beach coastline (%)"
              max={85}
              min={0}
              onChange={(value) => onBeachControlChange('dryCoverage', value / 100)}
              step={1}
              value={Math.round(beachControls.dryCoverage * 100)}
            />
            <LandrushIslandTuneSlider
              label="maximum emergence (m)"
              max={3}
              min={0.05}
              onChange={(value) => onBeachControlChange('maximumEmergenceMeters', value)}
              step={0.05}
              value={beachControls.maximumEmergenceMeters}
            />
            <LandrushIslandTuneSlider
              label="cliff-coast depth (m)"
              max={10}
              min={0.25}
              onChange={(value) => onBeachControlChange('shorelineDepthMeters', value)}
              step={0.05}
              value={beachControls.shorelineDepthMeters}
            />
            <LandrushIslandTuneSlider
              label="coastal falloff (m)"
              max={180}
              min={8}
              onChange={(value) => onBeachControlChange('widthMeters', value)}
              step={1}
              value={beachControls.widthMeters}
            />
            <LandrushIslandTuneSlider
              label="falloff variation (%)"
              max={80}
              min={0}
              onChange={(value) => onBeachControlChange('widthVariation', value / 100)}
              step={1}
              value={Math.round(beachControls.widthVariation * 100)}
            />
            <LandrushIslandTuneSlider
              label="coastal profile"
              max={3.5}
              min={0.45}
              onChange={(value) => onBeachControlChange('profilePower', value)}
              step={0.05}
              value={beachControls.profilePower}
            />
            <LandrushIslandTuneSlider
              label="near-shore relief (m)"
              max={4}
              min={0}
              onChange={(value) => onBeachControlChange('surfaceVariationMeters', value)}
              step={0.05}
              value={beachControls.surfaceVariationMeters}
            />
            <LandrushIslandTuneSlider
              label="basin relief (m)"
              max={4}
              min={0}
              onChange={(value) => onBeachControlChange('basinVariationMeters', value)}
              step={0.05}
              value={beachControls.basinVariationMeters}
            />
            <LandrushIslandTuneSlider
              label="domain warp (m)"
              max={48}
              min={0}
              onChange={(value) => onBeachControlChange('domainWarpMeters', value)}
              step={0.5}
              value={beachControls.domainWarpMeters}
            />
            <LandrushIslandTuneSlider
              label="macro scale (m)"
              max={180}
              min={12}
              onChange={(value) => onBeachControlChange('macroScaleMeters', value)}
              step={1}
              value={beachControls.macroScaleMeters}
            />
            <LandrushIslandTuneSlider
              label="nominal grid spacing (m)"
              max={8}
              min={1.5}
              onChange={(value) => onBeachControlChange('gridSpacingMeters', value)}
              step={0.1}
              value={beachControls.gridSpacingMeters}
            />
            <div className="border-white/10 border-t pt-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-lime-100/80">
              Cliff walls
            </div>
            <LandrushIslandTuneSlider
              label="cliff + offshore bottom (m)"
              max={Math.max(-9.95, rockReferenceWaterSurfaceElevation - 0.25)}
              min={-10}
              onChange={(value) => onRockWallControlChange('bottomElevationMeters', value)}
              step={0.05}
              value={rockWallControls.bottomElevationMeters}
            />
            <LandrushIslandTuneSlider
              label="cutter passes"
              max={18}
              min={8}
              onChange={onRockCutCountChange}
              step={1}
              value={rockCutCount}
            />
            <LandrushIslandTuneSlider
              label="rock scale"
              max={1.2}
              min={0.82}
              onChange={onRockScaleChange}
              step={0.01}
              value={rockScale}
            />
            <LandrushIslandTuneSlider
              label="rock width (m)"
              max={6}
              min={0.7}
              onChange={(value) => onRockWallControlChange('rockWidthMeters', value)}
              step={0.05}
              value={rockWallControls.rockWidthMeters}
            />
            <LandrushIslandTuneSlider
              label="rock height (m)"
              max={5}
              min={0.6}
              onChange={(value) => onRockWallControlChange('rockHeightMeters', value)}
              step={0.05}
              value={rockWallControls.rockHeightMeters}
            />
            <LandrushIslandTuneSlider
              label="relief depth (m)"
              max={2.5}
              min={0.15}
              onChange={(value) => onRockWallControlChange('reliefDepthMeters', value)}
              step={0.05}
              value={rockWallControls.reliefDepthMeters}
            />
            <LandrushIslandTuneSlider
              label="coverage overlap (%)"
              max={45}
              min={0}
              onChange={(value) => onRockWallControlChange('coverageOverlap', value / 100)}
              step={1}
              value={Math.round(rockWallControls.coverageOverlap * 100)}
            />
            <div className="border-white/10 border-t pt-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-lime-100/80">
              Offshore color
            </div>
            <LandrushIslandTuneSlider
              label="offshore tone contribution (%)"
              max={100}
              min={0}
              onChange={(value) =>
                onRockToneControlChange('dryBottomToTopContribution', value / 100)
              }
              step={1}
              value={Math.round(rockToneControls.dryBottomToTopContribution * 100)}
            />
            <LandrushIslandTuneSlider
              label="offshore tone offset (%)"
              max={100}
              min={-100}
              onChange={(value) => onRockToneControlChange('offshoreGradientBias', value / 100)}
              step={1}
              value={Math.round(rockToneControls.offshoreGradientBias * 100)}
            />
            <div className="border-white/10 border-t pt-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-lime-100/80">
              Offshore field
            </div>
            <LandrushIslandTuneSlider
              label="offshore density (%)"
              max={400}
              min={0}
              onChange={(value) => onRockOffshoreControlChange('density', value / 100)}
              step={5}
              value={Math.round(rockOffshoreControls.density * 100)}
            />
            <LandrushIslandTuneSlider
              label="offshore clusters"
              max={32}
              min={1}
              onChange={(value) => onRockOffshoreControlChange('clusterCount', Math.round(value))}
              step={1}
              value={rockOffshoreControls.clusterCount}
            />
            <LandrushIslandTuneSlider
              label="distance from shore (m)"
              max={60}
              min={2}
              onChange={(value) => onRockOffshoreControlChange('shoreDistanceMeters', value)}
              step={0.5}
              value={rockOffshoreControls.shoreDistanceMeters}
            />
            <LandrushIslandTuneSlider
              label="distribution spread (m)"
              max={40}
              min={0}
              onChange={(value) => onRockOffshoreControlChange('clusterSpreadMeters', value)}
              step={0.5}
              value={rockOffshoreControls.clusterSpreadMeters}
            />
            <LandrushIslandTuneSlider
              label="boulder size"
              max={4}
              min={0.2}
              onChange={(value) => onRockOffshoreControlChange('sizeScale', value)}
              step={0.05}
              value={rockOffshoreControls.sizeScale}
            />
            <LandrushIslandTuneSlider
              label="size variation (%)"
              max={250}
              min={0}
              onChange={(value) => onRockOffshoreControlChange('sizeVariation', value / 100)}
              step={5}
              value={Math.round(rockOffshoreControls.sizeVariation * 100)}
            />
            <LandrushIslandTuneSlider
              label="water exposure (%)"
              max={95}
              min={2}
              onChange={(value) => onRockOffshoreControlChange('exposure', value / 100)}
              step={1}
              value={Math.round(rockOffshoreControls.exposure * 100)}
            />
            <LandrushIslandTuneSlider
              label="minimum spacing (%)"
              max={300}
              min={50}
              onChange={(value) => onRockOffshoreControlChange('minimumSpacingRatio', value / 100)}
              step={1}
              value={Math.round(rockOffshoreControls.minimumSpacingRatio * 100)}
            />
            <LandrushIslandTuneSlider
              label="fully submerged (%)"
              max={100}
              min={0}
              onChange={(value) => onRockOffshoreControlChange('submergedFraction', value / 100)}
              step={1}
              value={Math.round(rockOffshoreControls.submergedFraction * 100)}
            />
            <LandrushIslandTuneSlider
              label="shallow crown depth (m)"
              max={9}
              min={0.05}
              onChange={(value) =>
                onRockOffshoreControlChange('submergedCrownDepthMinMeters', value)
              }
              step={0.05}
              value={rockOffshoreControls.submergedCrownDepthMinMeters}
            />
            <LandrushIslandTuneSlider
              label="deep crown depth (m)"
              max={9}
              min={0.05}
              onChange={(value) =>
                onRockOffshoreControlChange('submergedCrownDepthMaxMeters', value)
              }
              step={0.05}
              value={rockOffshoreControls.submergedCrownDepthMaxMeters}
            />
            <LandrushIslandTuneSlider
              label="wide rock chance (%)"
              max={100}
              min={0}
              onChange={(value) =>
                onRockOffshoreControlChange('horizontalScaleChance', value / 100)
              }
              step={1}
              value={Math.round(rockOffshoreControls.horizontalScaleChance * 100)}
            />
            <LandrushIslandTuneSlider
              label="maximum horizontal size"
              max={4}
              min={1}
              onChange={(value) => onRockOffshoreControlChange('horizontalScaleMaximum', value)}
              step={0.05}
              value={rockOffshoreControls.horizontalScaleMaximum}
            />
            <LandrushIslandTuneSlider
              label="compound chance (%)"
              max={100}
              min={0}
              onChange={(value) => onRockOffshoreControlChange('compoundChance', value / 100)}
              step={1}
              value={Math.round(rockOffshoreControls.compoundChance * 100)}
            />
            <LandrushIslandTuneSlider
              label="compound members"
              max={8}
              min={0}
              onChange={(value) => onRockOffshoreControlChange('compoundMemberCount', value)}
              step={1}
              value={rockOffshoreControls.compoundMemberCount}
            />
            <LandrushIslandTuneSlider
              label="compound spread (%)"
              max={92}
              min={8}
              onChange={(value) => onRockOffshoreControlChange('compoundSpreadRatio', value / 100)}
              step={1}
              value={Math.round(rockOffshoreControls.compoundSpreadRatio * 100)}
            />
          </LandrushIslandTuningGroup>
        ) : null}
        <LandrushIslandTuningGroup
          collapsed={collapsedGroups.grass}
          onToggle={() => toggleGroup('grass')}
          title="Grass and trees"
        >
          <LandrushIslandTuneSlider
            label="ground tint cap (%)"
            max={100}
            min={0}
            onChange={onGrassGroundTintCapPercentChange}
            step={1}
            value={grassGroundTintCapPercent}
          />
          {LANDRUSH_ISLAND_GRASS_SLIDERS.map(({ key, ...slider }) => (
            <LandrushIslandTuneSlider
              key={key}
              {...slider}
              onChange={(value) => onGrassChange(key, value)}
              value={grassTuning[key]}
            />
          ))}
        </LandrushIslandTuningGroup>
      </div>
    </section>
  )
}

function LandrushIslandTuningGroup({
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

function LandrushIslandTuneSlider({
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

function landrushIslandModeButtonClass(active: boolean, disabled = false) {
  return [
    'inline-flex size-11 items-center justify-center rounded-md border text-2xl font-black leading-none shadow-xl backdrop-blur transition md:h-14 md:w-28 md:gap-3 md:px-3',
    active
      ? 'border-amber-100/64 bg-amber-300 text-slate-950 shadow-[0_0_22px_rgba(245,207,120,0.22)]'
      : 'border-white/22 bg-slate-950/70 text-white/78 hover:border-white/42 hover:bg-slate-900/84 hover:text-white',
    disabled ? 'cursor-not-allowed opacity-45 hover:border-white/22 hover:bg-slate-950/70' : '',
  ].join(' ')
}

function landrushIslandModeHintClass() {
  return [
    'pointer-events-none hidden h-14 w-28 items-center justify-center gap-3 rounded-md border border-white/18 bg-slate-950/54 px-3 text-base font-black uppercase leading-none text-white/76 shadow-xl backdrop-blur md:inline-flex',
  ].join(' ')
}

const LANDRUSH_ISLAND_LEVEL_MODE_OPTIONS = [
  { label: 'Stack', mode: 'stacked' },
  { label: 'Explode', mode: 'exploded' },
  { label: 'Solo', mode: 'solo' },
] as const

function landrushIslandLevelModeButtonClass(active: boolean) {
  return [
    'inline-flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-md border px-2 font-black text-[10px] uppercase leading-none shadow-lg transition md:h-10 md:min-w-[7.25rem] md:px-3 md:text-[11px]',
    active
      ? 'border-sky-100/70 bg-sky-300 text-slate-950 shadow-[0_0_18px_rgba(125,211,252,0.2)]'
      : 'border-white/18 bg-slate-950/64 text-white/74 hover:border-white/38 hover:bg-slate-900/84 hover:text-white',
  ].join(' ')
}

function LandrushIslandLevelModeControls() {
  const levelMode = useViewer((state) => state.levelMode)
  const setLevelMode = useViewer((state) => state.setLevelMode)
  const [open, setOpen] = useState(false)
  const activeOption =
    LANDRUSH_ISLAND_LEVEL_MODE_OPTIONS.find((option) => option.mode === levelMode) ??
    LANDRUSH_ISLAND_LEVEL_MODE_OPTIONS[0]!

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={`Level mode: ${activeOption.label}`}
        className={landrushIslandLevelModeButtonClass(true)}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        title={`Levels: ${activeOption.label}`}
        type="button"
      >
        <Layers aria-hidden className="size-3.5" />
        <span>{activeOption.label}</span>
        <ChevronDown
          aria-hidden
          className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-[90] mt-1 grid min-w-full gap-1 rounded-md border border-white/16 bg-slate-950/88 p-1 shadow-2xl backdrop-blur-md">
          {LANDRUSH_ISLAND_LEVEL_MODE_OPTIONS.map((option) => (
            <button
              aria-label={`Level mode: ${option.label}`}
              aria-pressed={levelMode === option.mode}
              className={landrushIslandLevelModeButtonClass(levelMode === option.mode)}
              key={option.mode}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setLevelMode(option.mode)
                setOpen(false)
              }}
              title={`Levels: ${option.label}`}
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LandrushIslandVoiceModeButton({
  gamepadHintsActive,
  voice,
}: {
  gamepadHintsActive: boolean
  voice: SpatialVoiceController
}) {
  const active = voice.desired && voice.status !== 'error' && voice.status !== 'unsupported'
  const live = voice.desired && voice.status === 'live'
  const blocked = !voice.available && !voice.desired
  const Icon = active ? Mic : MicOff
  const title =
    voice.status === 'error'
      ? (voice.error ?? 'Voice unavailable')
      : live
        ? 'Mute spatial voice'
        : voice.desired
          ? 'Starting spatial voice'
          : 'Enable spatial voice'

  return (
    <button
      aria-label={title}
      aria-pressed={active}
      className={[
        landrushIslandModeButtonClass(active, blocked),
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
      <span className="hidden text-lg md:inline">{gamepadHintsActive ? 'L1' : 'P'}</span>
    </button>
  )
}

function LandrushIslandEditorOverlayLayerBridge({ enabled }: { enabled: boolean }) {
  const { camera, raycaster } = useThree()

  useEffect(() => {
    if (!enabled) return
    camera.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(EDITOR_LAYER)
  }, [camera, enabled, raycaster])

  return null
}

function LandrushIslandBuildParcelGuardLayer({
  buildMode,
  groundY,
  parcel,
}: {
  buildMode: boolean
  groundY: number
  parcel: ParcelAllocationParcel | null
}) {
  const { camera, events, gl } = useThree()
  const pointerNdc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])

  useEffect(() => {
    if (!buildMode) return

    const canvas = gl.domElement
    const eventTarget = getLandrushIslandCanvasEventTarget(canvas, events.connected)
    const isInsideParcel = (event: MouseEvent | PointerEvent) => {
      if (!parcel) return false

      const point = pickLandrushIslandBuildGroundPoint({
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
      if (
        !pointerEventInLandrushIslandCanvas(event, canvas) ||
        isLandrushIslandInteractivePointerTarget(event.target)
      ) {
        return
      }
      if ('button' in event && event.button !== 0) return
      if (isInsideParcel(event)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    eventTarget.addEventListener('click', blockOutsideParcel, { capture: true })
    eventTarget.addEventListener('dblclick', blockOutsideParcel, { capture: true })
    return () => {
      eventTarget.removeEventListener('click', blockOutsideParcel, true)
      eventTarget.removeEventListener('dblclick', blockOutsideParcel, true)
    }
  }, [buildMode, camera, events.connected, gl, groundY, parcel, pointerNdc, raycaster])

  return null
}

function LandrushIslandBuildCameraRig({
  buildCameraPoseRef,
  captureEditorCameraPose,
  groundY,
  onSettled,
  parcel,
  playerCameraPoseRef,
  visible,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  captureEditorCameraPose: boolean
  groundY: number
  onSettled: (pose: LandrushIslandCameraPose) => void
  parcel: ParcelAllocationParcel | null
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  visible: boolean
}) {
  const controlsTarget = useMemo(() => new Vector3(), [])

  useEffect(() => {
    if (!visible || parcel) return
    buildCameraPoseRef.current = null
  }, [buildCameraPoseRef, parcel, visible])

  useFrame((state, delta) => {
    if (!visible || !parcel || !captureEditorCameraPose) return

    const controls = getLandrushIslandCameraControls(state)
    const target =
      readLandrushIslandCameraControlsTarget(controls, controlsTarget) ?? controlsTarget
    writeLandrushIslandCameraPose(buildCameraPoseRef, state.camera, target)
  })

  if (!visible || !parcel) return null

  return (
    <>
      <LandrushIslandBuildCameraTransition
        cameraControlsReady={captureEditorCameraPose}
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

function LandrushIslandBuildCameraMouseOrbitController({
  buildCameraPoseRef,
  groundY,
  parcel,
  visible,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  groundY: number
  parcel: ParcelAllocationParcel | null
  visible: boolean
}) {
  const { camera, gl } = useThree()
  const getThreeState = useThree((state) => state.get)
  const dragRef = useRef<{
    dragged: boolean
    lastX: number
    lastY: number
    pointerId: number | null
    source: 'mouse' | 'pointer'
    startX: number
    startY: number
  } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const targetRef = useRef(new Vector3())
  const offsetRef = useRef(new Vector3())
  const sphericalRef = useRef(new Spherical())

  useEffect(() => {
    if (!visible || !parcel) return

    const canvas = gl.domElement
    const finishDrag = (event: PointerEvent | MouseEvent, forceSuppress: boolean) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      if (drag.dragged || forceSuppress) {
        event.preventDefault()
        event.stopPropagation()
        suppressClickUntilRef.current = performance.now() + 350
      }
      if (drag.dragged) {
        setLandrushIslandCameraDragging(false)
        renderScheduler.requestFrame('camera:end')
      }
    }

    const beginDrag = (
      event: MouseEvent | PointerEvent,
      source: 'mouse' | 'pointer',
      pointerId: number | null,
    ) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        !pointerEventInLandrushIslandCanvas(event, canvas) ||
        isLandrushIslandInteractivePointerTarget(event.target)
      ) {
        return
      }
      if (dragRef.current) return
      if (getLandrushIslandCameraControls(getThreeState())) return

      dragRef.current = {
        dragged: false,
        lastX: event.clientX,
        lastY: event.clientY,
        pointerId,
        source,
        startX: event.clientX,
        startY: event.clientY,
      }
    }

    const moveDrag = (event: MouseEvent | PointerEvent, source: 'mouse' | 'pointer') => {
      const drag = dragRef.current
      if (!drag || drag.source !== source) return
      if ('pointerId' in event && drag.pointerId !== event.pointerId) return

      const totalDelta = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (!drag.dragged && totalDelta < 4) return

      const deltaX = event.clientX - drag.lastX
      const deltaY = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      drag.dragged = true

      event.preventDefault()
      event.stopPropagation()
      setLandrushIslandCameraDragging(true)

      const target = targetRef.current.set(parcel.centroid.x, groundY + 0.35, parcel.centroid.z)
      const offset = offsetRef.current.copy(camera.position).sub(target)
      if (offset.lengthSq() < 0.0001) {
        offset.set(
          0,
          LANDRUSH_ISLAND_BUILD_CAMERA_MIN_HEIGHT,
          LANDRUSH_ISLAND_BUILD_CAMERA_MIN_DISTANCE,
        )
      }

      const spherical = sphericalRef.current.setFromVector3(offset)
      spherical.theta -= deltaX * LANDRUSH_ISLAND_BUILD_CAMERA_MOUSE_ROTATE_DRAG_SPEED
      spherical.phi = clamp(
        spherical.phi - deltaY * LANDRUSH_ISLAND_BUILD_CAMERA_MOUSE_PITCH_DRAG_SPEED,
        0.2,
        Math.PI / 2 - 0.08,
      )
      offset.setFromSpherical(spherical)
      camera.position.copy(target).add(offset)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      writeLandrushIslandCameraPose(buildCameraPoseRef, camera, target)
      renderScheduler.requestFrame('camera:move')
    }

    const endDrag = (event: MouseEvent | PointerEvent, source: 'mouse' | 'pointer') => {
      const drag = dragRef.current
      if (!drag || drag.source !== source) return
      if ('pointerId' in event && drag.pointerId !== event.pointerId) return
      finishDrag(event, false)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      beginDrag(event, 'pointer', event.pointerId)
    }
    const handlePointerMove = (event: PointerEvent) => moveDrag(event, 'pointer')
    const handlePointerUp = (event: PointerEvent) => endDrag(event, 'pointer')
    const handleMouseDown = (event: MouseEvent) => beginDrag(event, 'mouse', null)
    const handleMouseMove = (event: MouseEvent) => moveDrag(event, 'mouse')
    const handleMouseUp = (event: MouseEvent) => endDrag(event, 'mouse')

    const handleClick = (event: MouseEvent) => {
      if (performance.now() > suppressClickUntilRef.current) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: false })
    window.addEventListener('pointercancel', handlePointerUp, { capture: true, passive: false })
    window.addEventListener('mousedown', handleMouseDown, { capture: true })
    window.addEventListener('mousemove', handleMouseMove, { capture: true })
    window.addEventListener('mouseup', handleMouseUp, { capture: true })
    window.addEventListener('click', handleClick, { capture: true })
    return () => {
      if (dragRef.current?.dragged) setLandrushIslandCameraDragging(false)
      dragRef.current = null
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerUp, true)
      window.removeEventListener('mousedown', handleMouseDown, true)
      window.removeEventListener('mousemove', handleMouseMove, true)
      window.removeEventListener('mouseup', handleMouseUp, true)
      window.removeEventListener('click', handleClick, true)
    }
  }, [buildCameraPoseRef, camera, getThreeState, gl, groundY, parcel, visible])

  return null
}

function LandrushIslandBuildGamepadPlacementController({
  buildCameraPoseRef,
  focusRowRef,
  groundY,
  parcel,
  visible,
  wallDraftActiveRef,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  focusRowRef: { current: LandrushIslandGamepadBuildFocusRow }
  groundY: number
  parcel: ParcelAllocationParcel | null
  visible: boolean
  wallDraftActiveRef: { current: boolean }
}) {
  const { camera } = useThree()
  const gridSnapStep = useEditor((state) => state.gridSnapStep)
  const cursorRef = useRef<LandrushPoint2 | null>(null)
  const emittedCursorRef = useRef<LandrushPoint2 | null>(null)
  const crossHeldRef = useRef(false)
  const previousFocusRowRef = useRef<LandrushIslandGamepadBuildFocusRow>(focusRowRef.current)
  const hoveredWallIdRef = useRef<string | null>(null)
  const wallTargetToolRef = useRef<string | null>(null)
  const cursorVisualRef = useRef<Mesh>(null)
  const targetRef = useRef(new Vector3())
  const offsetRef = useRef(new Vector3())
  const sphericalRef = useRef(new Spherical())

  useEffect(() => {
    cursorRef.current = parcel?.centroid ? { ...parcel.centroid } : null
    emittedCursorRef.current = null
    crossHeldRef.current = false
    wallDraftActiveRef.current = false
    wallTargetToolRef.current = null
    hideLandrushIslandGamepadBuildCursorVisual(cursorVisualRef)
    clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
    return () => clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
  }, [parcel, wallDraftActiveRef])

  useFrame((state, delta) => {
    if (!visible || !parcel) {
      crossHeldRef.current = false
      wallDraftActiveRef.current = false
      wallTargetToolRef.current = null
      hideLandrushIslandGamepadBuildCursorVisual(cursorVisualRef)
      clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
      return
    }

    const input = readLandrushGamepadInput()
    if (!input) {
      crossHeldRef.current = false
      wallTargetToolRef.current = null
      hideLandrushIslandGamepadBuildCursorVisual(cursorVisualRef)
      clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
      return
    }

    if (previousFocusRowRef.current !== focusRowRef.current) {
      previousFocusRowRef.current = focusRowRef.current
      crossHeldRef.current = input.cross
      emittedCursorRef.current = null
    }

    const controls = getLandrushIslandCameraControls(state)
    if (input.lookStrength > 0) {
      rotateLandrushIslandBuildCameraWithGamepad({
        buildCameraPoseRef,
        camera,
        controls,
        delta,
        groundY,
        input,
        offset: offsetRef.current,
        parcel,
        spherical: sphericalRef.current,
        target: targetRef.current,
      })
    }

    if (
      Math.abs(input.rightTrigger - input.leftTrigger) >
      LANDRUSH_ISLAND_BUILD_GAMEPAD_TRIGGER_DEADZONE
    ) {
      zoomLandrushIslandBuildCameraWithGamepad({
        buildCameraPoseRef,
        camera,
        controls,
        delta,
        groundY,
        input,
        offset: offsetRef.current,
        parcel,
        target: targetRef.current,
      })
    }

    const cameraPanning = input.rightShoulder && input.strength > 0
    if (cameraPanning) {
      panLandrushIslandBuildCameraWithGamepad({
        buildCameraPoseRef,
        camera,
        controls,
        delta,
        groundY,
        input,
        position: offsetRef.current,
        parcel,
        target: targetRef.current,
      })
    }

    if (focusRowRef.current !== 'structure-tools') {
      crossHeldRef.current = input.cross
      if (useEditor.getState().tool !== 'wall') wallDraftActiveRef.current = false
      wallTargetToolRef.current = null
      hideLandrushIslandGamepadBuildCursorVisual(cursorVisualRef)
      clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
      return
    }

    if (cameraPanning) {
      crossHeldRef.current = input.cross
      updateLandrushIslandGamepadBuildCursorVisual({
        camera,
        point: {
          x: cursorRef.current?.x ?? parcel.centroid.x,
          y: groundY + 0.1,
          z: cursorRef.current?.z ?? parcel.centroid.z,
        },
        visualRef: cursorVisualRef,
      })
      return
    }

    const current = cursorRef.current ?? parcel.centroid
    const nextCursor = moveLandrushIslandGamepadBuildCursor({
      camera,
      current,
      delta,
      input,
      parcel,
    })
    cursorRef.current = nextCursor

    const snappedCursor = snapLandrushIslandGamepadBuildCursor(nextCursor, gridSnapStep)
    const activeTool = useEditor.getState().tool

    if (isLandrushIslandGamepadWallTargetTool(activeTool)) {
      if (wallTargetToolRef.current !== activeTool) {
        clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
        wallTargetToolRef.current = activeTool
      }

      emittedCursorRef.current = null
      const wallTarget = resolveLandrushIslandGamepadBuildWallTarget({
        groundY,
        localY: activeTool === 'window' ? LANDRUSH_ISLAND_BUILD_GAMEPAD_WINDOW_LOCAL_Y : 0,
        parcel,
        point: nextCursor,
      })
      updateLandrushIslandGamepadBuildCursorVisual({
        camera,
        point: wallTarget
          ? {
              x: wallTarget.position[0],
              y: wallTarget.position[1],
              z: wallTarget.position[2],
            }
          : {
              x: nextCursor.x,
              y: groundY + 0.1,
              z: nextCursor.z,
            },
        visualRef: cursorVisualRef,
      })
      emitLandrushIslandGamepadBuildWallHover(hoveredWallIdRef, wallTarget)

      const crossPressed = input.cross && !crossHeldRef.current
      crossHeldRef.current = input.cross
      if (crossPressed && wallTarget) {
        emitLandrushIslandGamepadBuildWallEvent('click', wallTarget)
        renderScheduler.requestFrame('selection:changed')
      }
      return
    }

    wallTargetToolRef.current = null
    clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
    updateLandrushIslandGamepadBuildCursorVisual({
      camera,
      point: {
        x: snappedCursor.x,
        y: groundY + 0.1,
        z: snappedCursor.z,
      },
      visualRef: cursorVisualRef,
    })

    const previous = emittedCursorRef.current
    const moved =
      !previous ||
      Math.hypot(previous.x - snappedCursor.x, previous.z - snappedCursor.z) >
        LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_MIN_MOVE_METERS

    if (moved || useEditor.getState().mode === 'build') {
      emittedCursorRef.current = snappedCursor
      emitLandrushIslandGamepadBuildGridEvent('move', snappedCursor, groundY)
    }

    const crossPressed = input.cross && !crossHeldRef.current
    crossHeldRef.current = input.cross
    if (!crossPressed) return

    emitLandrushIslandGamepadBuildGridEvent('click', snappedCursor, groundY)
    wallDraftActiveRef.current = activeTool === 'wall'
    renderScheduler.requestFrame('selection:changed')
  })

  return (
    <mesh
      frustumCulled={false}
      ref={cursorVisualRef}
      renderOrder={LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_RENDER_ORDER}
      visible={false}
    >
      <circleGeometry args={[1, 32]} />
      <meshBasicMaterial
        color="#818cf8"
        depthTest={false}
        depthWrite={false}
        opacity={0.82}
        side={DoubleSide}
        transparent
      />
    </mesh>
  )
}

function hideLandrushIslandGamepadBuildCursorVisual(visualRef: { current: Mesh | null }) {
  if (visualRef.current) visualRef.current.visible = false
}

function updateLandrushIslandGamepadBuildCursorVisual({
  camera,
  point,
  visualRef,
}: {
  camera: Camera
  point: { x: number; y: number; z: number }
  visualRef: { current: Mesh | null }
}) {
  const visual = visualRef.current
  if (!visual) return

  visual.visible = true
  visual.position.set(point.x, point.y, point.z)
  visual.quaternion.copy(camera.quaternion)
  const radius = clamp(
    camera.position.distanceTo(visual.position) * LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_SCREEN_SCALE,
    LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_MIN_RADIUS_METERS,
    LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_MAX_RADIUS_METERS,
  )
  visual.scale.setScalar(radius)
}

function rotateLandrushIslandBuildCameraWithGamepad({
  buildCameraPoseRef,
  camera,
  controls,
  delta,
  groundY,
  input,
  offset,
  parcel,
  spherical,
  target,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  camera: Camera
  controls: LandrushIslandCameraControls | undefined
  delta: number
  groundY: number
  input: LandrushGamepadInput
  offset: Vector3
  parcel: ParcelAllocationParcel
  spherical: Spherical
  target: Vector3
}) {
  const fallbackTarget = target.set(parcel.centroid.x, groundY + 0.35, parcel.centroid.z)
  resolveLandrushIslandBuildCameraTarget({
    buildCameraPoseRef,
    controls,
    fallbackTarget,
    target,
  })
  offset.copy(camera.position).sub(target)
  if (offset.lengthSq() < 0.0001) {
    offset.set(
      0,
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_HEIGHT,
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_DISTANCE,
    )
  }

  spherical.setFromVector3(offset)
  spherical.theta -= input.lookX * LANDRUSH_ISLAND_GAMEPAD_CAMERA_YAW_SPEED * delta
  spherical.phi = clamp(
    spherical.phi - input.lookY * LANDRUSH_ISLAND_GAMEPAD_CAMERA_PITCH_SPEED * delta,
    0.2,
    Math.PI / 2 - 0.08,
  )
  offset.setFromSpherical(spherical)
  offset.add(target)

  applyLandrushIslandBuildGamepadCameraLookAt({
    buildCameraPoseRef,
    camera,
    controls,
    delta,
    position: offset,
    target,
  })
}

function zoomLandrushIslandBuildCameraWithGamepad({
  buildCameraPoseRef,
  camera,
  controls,
  delta,
  groundY,
  input,
  offset,
  parcel,
  target,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  camera: Camera
  controls: LandrushIslandCameraControls | undefined
  delta: number
  groundY: number
  input: LandrushGamepadInput
  offset: Vector3
  parcel: ParcelAllocationParcel
  target: Vector3
}) {
  const rawZoomInput = input.rightTrigger - input.leftTrigger
  const zoomInput =
    Math.sign(rawZoomInput) *
    ((Math.abs(rawZoomInput) - LANDRUSH_ISLAND_BUILD_GAMEPAD_TRIGGER_DEADZONE) /
      (1 - LANDRUSH_ISLAND_BUILD_GAMEPAD_TRIGGER_DEADZONE))
  const fallbackTarget = target.set(parcel.centroid.x, groundY + 0.35, parcel.centroid.z)
  resolveLandrushIslandBuildCameraTarget({
    buildCameraPoseRef,
    controls,
    fallbackTarget,
    target,
  })

  offset.copy(camera.position).sub(target)
  if (offset.lengthSq() < 0.0001) {
    offset.set(
      0,
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_HEIGHT,
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_DISTANCE,
    )
  }
  offset.setLength(
    clamp(
      offset.length() - zoomInput * LANDRUSH_ISLAND_BUILD_GAMEPAD_ZOOM_SPEED_METERS * delta,
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_DISTANCE,
      LANDRUSH_ISLAND_BUILD_CAMERA_MAX_DISTANCE,
    ),
  )
  offset.add(target)

  applyLandrushIslandBuildGamepadCameraLookAt({
    buildCameraPoseRef,
    camera,
    controls,
    delta,
    position: offset,
    target,
  })
}

function panLandrushIslandBuildCameraWithGamepad({
  buildCameraPoseRef,
  camera,
  controls,
  delta,
  groundY,
  input,
  position,
  parcel,
  target,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  camera: Camera
  controls: LandrushIslandCameraControls | undefined
  delta: number
  groundY: number
  input: LandrushGamepadInput
  position: Vector3
  parcel: ParcelAllocationParcel
  target: Vector3
}) {
  const fallbackTarget = target.set(parcel.centroid.x, groundY + 0.35, parcel.centroid.z)
  resolveLandrushIslandBuildCameraTarget({
    buildCameraPoseRef,
    controls,
    fallbackTarget,
    target,
  })

  const axes = resolveLandrushIslandCameraScreenAxes(camera)
  const distance = input.strength * LANDRUSH_ISLAND_BUILD_GAMEPAD_PAN_SPEED_METERS * delta
  const moveX = (axes.right.x * input.strafe + axes.up.x * input.forward) * distance
  const moveZ = (axes.right.z * input.strafe + axes.up.z * input.forward) * distance

  target.x += moveX
  target.z += moveZ
  position.copy(camera.position)
  position.x += moveX
  position.z += moveZ

  applyLandrushIslandBuildGamepadCameraLookAt({
    buildCameraPoseRef,
    camera,
    controls,
    delta,
    position,
    target,
  })
}

function resolveLandrushIslandBuildCameraTarget({
  buildCameraPoseRef,
  controls,
  fallbackTarget,
  target,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  controls: LandrushIslandCameraControls | undefined
  fallbackTarget: Vector3
  target: Vector3
}) {
  if (readLandrushIslandCameraControlsTarget(controls, target)) return target
  const poseTarget = buildCameraPoseRef.current?.target
  if (poseTarget) return target.copy(poseTarget)
  return target.copy(fallbackTarget)
}

function applyLandrushIslandBuildGamepadCameraLookAt({
  buildCameraPoseRef,
  camera,
  controls,
  delta,
  position,
  target,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  camera: Camera
  controls: LandrushIslandCameraControls | undefined
  delta: number
  position: Vector3
  target: Vector3
}) {
  if (controls?.setLookAt) {
    controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false)
    controls.update?.(delta)
  } else {
    camera.position.copy(position)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }

  writeLandrushIslandCameraPose(buildCameraPoseRef, camera, target)
  renderScheduler.requestFrame('camera:move')
}

function moveLandrushIslandGamepadBuildCursor({
  camera,
  current,
  delta,
  input,
  parcel,
}: {
  camera: Camera
  current: LandrushPoint2
  delta: number
  input: LandrushGamepadInput
  parcel: ParcelAllocationParcel
}) {
  if (input.strength <= 0) return current

  const axes = resolveLandrushIslandCameraScreenAxes(camera)
  const distance = input.strength * LANDRUSH_ISLAND_BUILD_GAMEPAD_CURSOR_SPEED_METERS * delta
  const next = {
    x: current.x + (axes.right.x * input.strafe + axes.up.x * input.forward) * distance,
    z: current.z + (axes.right.z * input.strafe + axes.up.z * input.forward) * distance,
  }
  return constrainLandrushIslandGamepadBuildCursorToParcel(next, current, parcel.points)
}

function constrainLandrushIslandGamepadBuildCursorToParcel(
  next: LandrushPoint2,
  current: LandrushPoint2,
  polygon: readonly LandrushPoint2[],
) {
  if (pointInPolygonOrNearEdge(next, polygon)) return next

  const xOnly = { x: next.x, z: current.z }
  if (pointInPolygonOrNearEdge(xOnly, polygon)) return xOnly

  const zOnly = { x: current.x, z: next.z }
  if (pointInPolygonOrNearEdge(zOnly, polygon)) return zOnly

  return current
}

function snapLandrushIslandGamepadBuildCursor(point: LandrushPoint2, gridSnapStep: number) {
  const step = Math.max(0.01, gridSnapStep)
  return {
    x: Math.round(point.x / step) * step,
    z: Math.round(point.z / step) * step,
  }
}

type LandrushIslandGamepadBuildWallTarget = {
  localPosition: [number, number, number]
  node: Extract<AnyNode, { type: 'wall' }>
  normal: [number, number, number]
  object: Object3D
  position: [number, number, number]
}

function isLandrushIslandGamepadWallTargetTool(tool: unknown): tool is string {
  return typeof tool === 'string' && LANDRUSH_ISLAND_BUILD_GAMEPAD_WALL_TARGET_TOOLS.has(tool)
}

function resolveLandrushIslandGamepadBuildWallTarget({
  groundY,
  localY,
  parcel,
  point,
}: {
  groundY: number
  localY: number
  parcel: ParcelAllocationParcel
  point: LandrushPoint2
}): LandrushIslandGamepadBuildWallTarget | null {
  const viewerSelection = useViewer.getState().selection
  const levelId = viewerSelection.levelId
  if (!levelId) return null

  const buildingId = viewerSelection.buildingId
  const buildingMesh = buildingId ? sceneRegistry.nodes.get(buildingId as AnyNodeId) : null
  const localCursor = new Vector3(point.x, groundY, point.z)
  if (buildingMesh) {
    buildingMesh.updateWorldMatrix(true, false)
    buildingMesh.worldToLocal(localCursor)
  }

  let best: {
    localX: number
    node: Extract<AnyNode, { type: 'wall' }>
    planPoint: LandrushPoint2
  } | null = null
  let bestDistanceSq =
    LANDRUSH_ISLAND_BUILD_GAMEPAD_WALL_CURSOR_MAX_DISTANCE_METERS *
    LANDRUSH_ISLAND_BUILD_GAMEPAD_WALL_CURSOR_MAX_DISTANCE_METERS

  for (const node of Object.values(useScene.getState().nodes)) {
    if (
      node.type !== 'wall' ||
      node.visible === false ||
      node.parentId !== levelId ||
      Math.abs(node.curveOffset ?? 0) > 0.000001
    ) {
      continue
    }

    const frame = resolveLandrushIslandWallFrame(node)
    if (!frame) continue

    const cursorFromStartX = localCursor.x - node.start[0]
    const cursorFromStartZ = localCursor.z - node.start[1]
    const localX = clamp(
      cursorFromStartX * frame.dir.x + cursorFromStartZ * frame.dir.z,
      0,
      frame.length,
    )
    const planPoint = pointOnLandrushIslandWall(node, frame, localX)
    if (!pointInPolygonOrNearEdge(planPoint, parcel.points)) continue

    const distanceSq =
      (localCursor.x - planPoint.x) * (localCursor.x - planPoint.x) +
      (localCursor.z - planPoint.z) * (localCursor.z - planPoint.z)
    if (distanceSq >= bestDistanceSq) continue

    bestDistanceSq = distanceSq
    best = {
      localX,
      node,
      planPoint,
    }
  }

  if (!best) return null

  const localPosition: [number, number, number] = [best.localX, localY, 0]
  const worldPosition = new Vector3(best.planPoint.x, localY, best.planPoint.z)
  if (buildingMesh) {
    buildingMesh.localToWorld(worldPosition)
  }
  const object =
    sceneRegistry.nodes.get(best.node.id as AnyNodeId) ??
    buildingMesh ??
    sceneRegistry.nodes.get(levelId as AnyNodeId)
  if (!object) return null

  return {
    localPosition,
    node: best.node,
    normal: [0, 0, 1],
    object,
    position: [worldPosition.x, worldPosition.y, worldPosition.z],
  }
}

function emitLandrushIslandGamepadBuildWallHover(
  hoveredWallIdRef: { current: string | null },
  target: LandrushIslandGamepadBuildWallTarget | null,
) {
  if (!target) {
    clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
    return
  }

  if (hoveredWallIdRef.current !== target.node.id) {
    clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef)
    hoveredWallIdRef.current = target.node.id
    emitLandrushIslandGamepadBuildWallEvent('enter', target)
    return
  }

  emitLandrushIslandGamepadBuildWallEvent('move', target)
}

function clearLandrushIslandGamepadBuildWallHover(hoveredWallIdRef: { current: string | null }) {
  const wallId = hoveredWallIdRef.current
  if (!wallId) return

  hoveredWallIdRef.current = null
  const node = useScene.getState().nodes[wallId as AnyNodeId]
  if (!node || node.type !== 'wall') return

  const payload = {
    localPosition: [0, 0, 0],
    nativeEvent: createLandrushIslandGamepadGridNativeEvent(),
    node,
    normal: [0, 0, 1],
    position: [0, 0, 0],
    stopPropagation: () => {},
  } as WallEvent

  emitter.emit('wall:leave', payload)
}

function emitLandrushIslandGamepadBuildWallEvent(
  suffix: 'click' | 'enter' | 'move',
  target: LandrushIslandGamepadBuildWallTarget,
) {
  const payload: WallEvent = {
    faceIndex: undefined,
    localPosition: target.localPosition,
    nativeEvent: createLandrushIslandGamepadGridNativeEvent() as WallEvent['nativeEvent'],
    node: target.node,
    normal: target.normal,
    object: target.object,
    position: target.position,
    stopPropagation: () => {},
  }
  emitter.emit(`wall:${suffix}`, payload)
}

function emitLandrushIslandGamepadBuildGridEvent(
  suffix: 'click' | 'move',
  point: LandrushPoint2,
  groundY: number,
) {
  const worldPoint = new Vector3(point.x, groundY, point.z)
  const buildingId = useViewer.getState().selection.buildingId
  const buildingMesh = buildingId ? sceneRegistry.nodes.get(buildingId as AnyNodeId) : null
  const localPoint = buildingMesh ? buildingMesh.worldToLocal(worldPoint.clone()) : worldPoint
  const payload: GridEvent = {
    localPosition: [localPoint.x, localPoint.y, localPoint.z],
    nativeEvent: createLandrushIslandGamepadGridNativeEvent(),
    position: [worldPoint.x, worldPoint.y, worldPoint.z],
  }
  emitter.emit(`grid:${suffix}`, payload)
}

function createLandrushIslandGamepadGridNativeEvent(): GridEvent['nativeEvent'] {
  return {
    altKey: false,
    button: 0,
    buttons: 0,
    ctrlKey: false,
    detail: 1,
    metaKey: false,
    preventDefault: () => {},
    shiftKey: false,
    stopPropagation: () => {},
    type: 'gamepad',
  } as unknown as GridEvent['nativeEvent']
}

function LandrushIslandRuntimeCameraProbeRecorder({
  mode,
  renderedFpsRef,
}: {
  mode: LandrushIslandViewMode
  renderedFpsRef: RefObject<number | null>
}) {
  const getThreeState = useThree((state) => state.get)
  const targetRef = useRef(new Vector3())
  const forwardRef = useRef(new Vector3())
  const modeRef = useRef<LandrushIslandViewMode>(mode)
  const lastR3fFrameAtRef = useRef<number | null>(null)
  const renderedFpsWindowRef = useRef({ frameCount: 0, startedAt: performance.now() })

  modeRef.current = mode

  useFrame((state, delta) => {
    const now = performance.now()
    const previousFrameAt = lastR3fFrameAtRef.current
    lastR3fFrameAtRef.current = now
    const renderedFpsWindow = renderedFpsWindowRef.current
    renderedFpsWindow.frameCount += 1
    const renderedFpsElapsedMs = now - renderedFpsWindow.startedAt
    if (renderedFpsElapsedMs >= 1000) {
      renderedFpsRef.current =
        renderedFpsElapsedMs > 2500
          ? null
          : Math.round((renderedFpsWindow.frameCount * 1000) / renderedFpsElapsedMs)
      renderedFpsWindow.frameCount = 0
      renderedFpsWindow.startedAt = now
    }
    recordLandrushIslandFrameProbe({
      dtMs: previousFrameAt === null ? null : now - previousFrameAt,
      mode,
      source: 'r3f',
    })
    const target = targetRef.current
      .copy(state.camera.position)
      .add(state.camera.getWorldDirection(forwardRef.current).multiplyScalar(10))
    recordLandrushIslandCameraProbe({
      camera: state.camera,
      mode,
      source: 'runtime-camera',
      target,
    })
  })

  useEffect(() => {
    if (!getLandrushIslandRuntimeProbe()) return

    let animationFrameId = 0
    let lastRafAt: number | null = null
    const recordRafFrame = (now: number) => {
      recordLandrushIslandFrameProbe({
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
        for (const entry of list.getEntries()) recordLandrushIslandLongTaskProbe(entry)
      })
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
      } catch {
        longTaskObserver.disconnect()
        longTaskObserver = null
      }
    }

    let longAnimationFrameObserver: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined') {
      longAnimationFrameObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          recordLandrushIslandLongAnimationFrameProbe(entry)
        }
      })
      try {
        longAnimationFrameObserver.observe({ type: 'long-animation-frame', buffered: true })
      } catch {
        longAnimationFrameObserver.disconnect()
        longAnimationFrameObserver = null
      }
    }

    const recordCurrentCamera = () => {
      const state = getThreeState()
      const target = targetRef.current
        .copy(state.camera.position)
        .add(state.camera.getWorldDirection(forwardRef.current).multiplyScalar(10))
      recordLandrushIslandCameraProbe({
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
      longAnimationFrameObserver?.disconnect()
      longTaskObserver?.disconnect()
    }
  }, [getThreeState])

  return null
}

function LandrushIslandPoseCamera({
  fallbackPosition,
  fallbackTarget = LANDRUSH_ISLAND_CAMERA_TARGET,
  makeDefault = true,
  pose,
}: {
  fallbackPosition: readonly [number, number, number]
  fallbackTarget?: readonly [number, number, number]
  makeDefault?: boolean
  pose: LandrushIslandCameraPose | null
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
      applyLandrushIslandCameraPose(camera, initialPoseRef.current, fallbackTarget)
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

function LandrushIslandBuildCameraTransition({
  buildCameraPoseRef,
  cameraControlsReady,
  controlsTarget,
  groundY,
  onSettled,
  parcel,
  playerCameraPoseRef,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  cameraControlsReady: boolean
  controlsTarget: Vector3
  groundY: number
  onSettled: (pose: LandrushIslandCameraPose) => void
  parcel: ParcelAllocationParcel
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
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
  const finalPoseRef = useRef<LandrushIslandCameraPose | null>(null)
  const handoffFramesRef = useRef(0)
  const handoffCompleteRef = useRef(false)
  const parcelRadius = useMemo(() => parcelBuildCameraRadius(parcel), [parcel])

  useEffect(() => {
    renderScheduler.requestFrame('camera:start')
    return () => renderScheduler.requestFrame('camera:end')
  }, [])

  useFrame((state, delta) => {
    if (settledRef.current) {
      const finalPose = finalPoseRef.current
      if (!finalPose || handoffCompleteRef.current) return

      renderScheduler.requestFrame('camera:move')
      const controls = getLandrushIslandCameraControls(state)
      if (cameraControlsReady && controls?.setLookAt) {
        controls.setLookAt(
          finalPose.position.x,
          finalPose.position.y,
          finalPose.position.z,
          finalPose.target.x,
          finalPose.target.y,
          finalPose.target.z,
          false,
        )
        controls.update?.(0)
        handoffFramesRef.current += 1
        if (handoffFramesRef.current >= 3) handoffCompleteRef.current = true
      }
      applyLandrushIslandCameraPose(state.camera, finalPose)
      writeLandrushIslandCameraPose(buildCameraPoseRef, state.camera, finalPose.target)
      return
    }

    renderScheduler.requestFrame('camera:move')
    state.camera.up.set(0, 1, 0)
    const target = targetRef.current.set(parcel.centroid.x, groundY + 0.35, parcel.centroid.z)
    if (!directionRef.current) {
      const rememberedPose = buildCameraPoseRef.current ?? playerCameraPoseRef.current
      if (rememberedPose) {
        startPositionRef.current.copy(rememberedPose.position)
        startTargetRef.current.copy(rememberedPose.target)
        state.camera.position.copy(rememberedPose.position)
        state.camera.quaternion.copy(rememberedPose.quaternion)
      } else {
        startPositionRef.current.copy(state.camera.position)
        resolveLandrushIslandBuildCameraStartTarget(
          state.camera,
          target.y,
          startTargetRef.current,
          forwardRef.current,
        )
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
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_DISTANCE,
      LANDRUSH_ISLAND_BUILD_CAMERA_MAX_DISTANCE,
    )
    const height = clamp(
      parcelRadius * 0.72,
      LANDRUSH_ISLAND_BUILD_CAMERA_MIN_HEIGHT,
      LANDRUSH_ISLAND_BUILD_CAMERA_MAX_HEIGHT,
    )
    const desired = desiredRef.current.copy(target).addScaledVector(directionRef.current, distance)
    desired.y = target.y + height
    if (startedAtRef.current === null) {
      startedAtRef.current = performance.now()
      resolveLandrushIslandCameraPoseQuaternion(desired, target, endQuaternionRef.current)
    }

    const elapsed = Math.max(0, (performance.now() - startedAtRef.current) / 1000)
    const progress = clamp01(elapsed / LANDRUSH_ISLAND_CAMERA_TRANSITION_SECONDS)
    const amount = easeLandrushIslandCameraTransition(progress, 'build')
    state.camera.position.lerpVectors(startPositionRef.current, desired, amount)
    controlsTarget.lerpVectors(startTargetRef.current, target, amount)

    state.camera.quaternion.slerpQuaternions(
      startQuaternionRef.current,
      endQuaternionRef.current,
      amount,
    )
    state.camera.updateMatrixWorld()
    writeLandrushIslandCameraPose(buildCameraPoseRef, state.camera, controlsTarget)
    recordLandrushIslandCameraProbe({
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
      writeLandrushIslandCameraPose(buildCameraPoseRef, state.camera, target)
      settledRef.current = true
      const finalPose =
        cloneLandrushIslandCameraPose(buildCameraPoseRef.current) ??
        createLandrushIslandCameraPose(state.camera, target)
      finalPoseRef.current = finalPose
      onSettled(finalPose)
      renderScheduler.requestFrame('camera:end')
    }
  }, -1)

  return null
}

function resolveLandrushIslandBuildCameraStartTarget(
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

const LANDRUSH_ISLAND_PHYSICS_COLLIDER_NODE_TYPES = new Set([
  'level',
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

const LANDRUSH_ISLAND_GROUND_COLLIDER_MATERIAL = new MeshBasicMaterial({
  side: DoubleSide,
  visible: false,
})

function landrushIslandStairColliderGeometryReady() {
  const nodes = useScene.getState().nodes
  for (const node of Object.values(nodes)) {
    if (
      node.type !== 'stair' ||
      node.visible === false ||
      !isLandrushIslandBuildLevelId(node.parentId, nodes) ||
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

function landrushIslandLevelColliderTransformsReady() {
  const nodes = useScene.getState().nodes
  const levels = resolveLandrushIslandBuildingLevels(
    nodes,
    LANDRUSH_ISLAND_BUILDING_ID as AnyNodeId,
  )
  let cumulativeY = 0

  for (const level of levels) {
    const object = sceneRegistry.nodes.get(level.id)
    if (!object || Math.abs(object.position.y - cumulativeY) > 0.015) return false
    cumulativeY += getLevelHeight(
      level.id,
      nodes,
      (wallId) => sceneRegistry.nodes.get(wallId)?.position.y,
    )
  }

  return true
}

function useLandrushIslandBuiltColliderWorlds() {
  const physicsSignature = useScene((state) =>
    createLandrushIslandPhysicsNodeSignature(state.nodes),
  )
  const doorAnimationSignature = useInteractive((state) =>
    createLandrushIslandDoorAnimationSignature(state.doorAnimations),
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
    const collision = buildFirstPersonColliderWorldFromRegistry()
    return { collision, floatOnly: null }
  }, [])

  useEffect(() => {
    void colliderWorldVersion
    let cancelled = false
    let frame = 0
    let attempts = 0
    const rebuildWhenReady = () => {
      attempts += 1
      if (
        (!landrushIslandStairColliderGeometryReady() ||
          !landrushIslandLevelColliderTransformsReady()) &&
        attempts < 90
      ) {
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

function createLandrushIslandDoorAnimationSignature(
  doorAnimations: LandrushIslandInteractiveDoorAnimationRecord,
) {
  return Object.entries(doorAnimations)
    .map(([doorId, animation]) => `${doorId}:${animation.field}:${animation.to}`)
    .sort()
    .join('|')
}

function createLandrushIslandPhysicsNodeSignature(nodes: LandrushIslandSceneStore['nodes']) {
  const entries: string[] = []
  for (const node of Object.values(nodes) as AnyNode[]) {
    if (!LANDRUSH_ISLAND_PHYSICS_COLLIDER_NODE_TYPES.has(node.type)) continue
    entries.push(`${node.id}:${node.type}:${JSON.stringify(node)}`)
  }
  return entries.sort().join('|')
}

function createLandrushIslandGroundColliderMesh(
  points: readonly LandrushPoint2[],
  groundY: number,
) {
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

  const mesh = new Mesh(bvhGeometry, LANDRUSH_ISLAND_GROUND_COLLIDER_MATERIAL)
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

function disposeLandrushIslandGroundColliderMesh(mesh: Mesh) {
  const geometry = mesh.geometry as BufferGeometry & {
    disposeBoundsTree?: typeof disposeBoundsTree
  }
  geometry.disposeBoundsTree?.()
  geometry.dispose()
}

function LandrushIslandPlayerLayer({
  baseNode,
  buildCameraPoseRef,
  fallPresentationRef,
  fpvActive,
  grassInteractionRef,
  localMotionRef,
  localProfile,
  mapCameraPoseRef,
  mapPresentationProgressRef,
  mapPresentationVisible,
  mapReturnCameraPoseRef,
  mapTransitionStartPoseRef,
  navigationDebugEnabled,
  navigationLiveScenario,
  navigationLiveScenarioAutoRun,
  navigationLiveScenarioReady,
  onExitBuildMode,
  onLocalPlayerChange,
  perfRun,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
  remotePlayerStore,
  remotePlayers,
  remoteVoicePeerIds,
  robotScreenRevealEnabled,
  surface,
  viewMode,
  voiceRangeVisible,
  waterY,
}: {
  baseNode: LandrushIslandLayoutNode
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  fallPresentationRef: { current: LandrushIslandFallPresentationState }
  fpvActive: boolean
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapPresentationProgressRef: { current: number }
  mapPresentationVisible: boolean
  mapReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapTransitionStartPoseRef: { current: LandrushIslandCameraPose | null }
  navigationDebugEnabled: boolean
  navigationLiveScenario: LandrushIslandNavigationLiveScenarioKind | null
  navigationLiveScenarioAutoRun: boolean
  navigationLiveScenarioReady: boolean
  onExitBuildMode: () => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: LandrushIslandPerfRunOptions
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  playerReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  remotePlayerStore: MultiplayerRemotePlayerStore
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  remoteVoicePeerIds: readonly string[]
  robotScreenRevealEnabled: boolean
  surface: LandrushIslandLandSurface
  viewMode: LandrushIslandViewMode
  voiceRangeVisible: boolean
  waterY: number
}) {
  const spawn = useMemo(() => centroidForPolygon(surface.grassSurfacePoints), [surface])
  const groundY = surface.grassSurfaceElevation + LANDRUSH_ISLAND_ROBOT_GROUND_CLEARANCE
  const mapVisible = viewMode === 'map'
  const movementEnabled = viewMode !== 'build'
  const cameraEnabled = viewMode === 'player'
  const localRobotVisualRootRef = useRef<Group | null>(null)
  const robotPresentationMode: LandrushRobotPresentationMode =
    viewMode === 'build' ? 'hover' : 'default'
  const remoteVoicePeerIdSet = useMemo(() => new Set(remoteVoicePeerIds), [remoteVoicePeerIds])
  const cliffFallBoundaryPoints = useMemo(
    () => createLandrushIslandRobotCliffFallBoundaryPoints(surface),
    [surface],
  )

  return (
    <group userData={{ pascalExcludeFromToolConeTarget: true }}>
      <LandrushIslandPoseCamera
        fallbackPosition={[0, 4.5, -8.2]}
        pose={playerCameraPoseRef.current}
      />
      <LandrushIslandMapCameraRig
        active={mapVisible}
        mapCameraPoseRef={mapCameraPoseRef}
        mapTransitionStartPoseRef={mapTransitionStartPoseRef}
        playerCameraPoseRef={playerCameraPoseRef}
      />
      <LocalLandrushIslandRobot
        baseNode={baseNode}
        fallSurfacePoints={cliffFallBoundaryPoints}
        fallPresentationRef={fallPresentationRef}
        fpvActive={fpvActive}
        grassInteractionRef={grassInteractionRef}
        groundY={groundY}
        localMotionRef={localMotionRef}
        localProfile={localProfile}
        localRobotVisualRootRef={localRobotVisualRootRef}
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
        waterY={waterY}
      />
      <SpatialVoiceRangeRing
        color={localProfile.color}
        groundY={surface.grassSurfaceElevation}
        motionRef={localMotionRef}
        visible={voiceRangeVisible}
      />
      {remotePlayers.map((player) => (
        <RemoteLandrushIslandRobot
          baseNode={baseNode}
          groundY={groundY}
          key={player.id}
          player={player}
          remotePlayerStore={remotePlayerStore}
        />
      ))}
      {remotePlayers.map((player) => (
        <RemoteSpatialVoiceRangeRing
          color={player.color}
          groundY={surface.grassSurfaceElevation}
          key={`voice-range-${player.id}`}
          playerId={player.id}
          remotePlayerStore={remotePlayerStore}
          visible={voiceRangeVisible && remoteVoicePeerIdSet.has(player.id)}
        />
      ))}
      <LandrushIslandRobotScreenRevealClipper
        motionRef={localMotionRef}
        presentationMode={robotPresentationMode}
        structureGroundY={surface.grassSurfaceElevation}
        visualRootRef={localRobotVisualRootRef}
        visible={robotScreenRevealEnabled && viewMode !== 'map' && !fpvActive}
      />
      <LandrushIslandMapPlayerMarker
        color={localProfile.color}
        groundY={groundY}
        motionRef={localMotionRef}
        opacityRef={mapPresentationProgressRef}
        visible={mapPresentationVisible}
      />
      {remotePlayers.map((player) => (
        <LandrushIslandRemoteMapPlayerMarker
          groundY={groundY}
          key={`map-${player.id}`}
          opacityRef={mapPresentationProgressRef}
          player={player}
          remotePlayerStore={remotePlayerStore}
          visible={mapPresentationVisible}
        />
      ))}
    </group>
  )
}

function LandrushIslandRevealProofOccluder({
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
    if (getMaterialRendererBackend() === 'webgl') {
      return new MeshBasicMaterial({
        color: '#111827',
        depthTest: true,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
        transparent: true,
      })
    }
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
      motion.position.y + hoverOffset + LANDRUSH_ISLAND_ROBOT_CAMERA_TARGET_HEIGHT,
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

function LandrushIslandRobotLevelSelectionTracker({
  enabled,
  groundY,
  localMotionRef,
}: {
  enabled: boolean
  groundY: number
  localMotionRef: { current: RobotMotion | null }
}) {
  const lastLevelIdRef = useRef<LevelNode['id'] | null>(null)

  useFrame(() => {
    if (!enabled) {
      lastLevelIdRef.current = null
      return
    }

    const motion = localMotionRef.current
    if (!motion) return

    const nodes = useScene.getState().nodes
    const levelId = resolveLandrushIslandRobotLevelId(nodes, motion.position.y, groundY)
    if (levelId === lastLevelIdRef.current) return

    const viewer = useViewer.getState()
    if (viewer.selection.levelId === levelId) {
      lastLevelIdRef.current = levelId
      return
    }

    lastLevelIdRef.current = levelId
    viewer.setSelection({
      buildingId: LANDRUSH_ISLAND_BUILDING_ID as never,
      levelId,
      selectedIds: [],
      zoneId: null,
    })
  })

  return null
}

function LandrushIslandParcelOwnershipLayer({
  allocation,
  buildMode,
  buildParcelId,
  claimParcel,
  localMotionRef,
  localProfile,
  mapPresentationProgressRef,
  mapPresentationVisible,
  mapLabelsVisible,
  mapView,
  onBuildParcel,
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
  mapLabelsVisible: boolean
  mapView: boolean
  onBuildParcel: (parcel: ParcelAllocationParcel) => void
  parcelOwnerships: readonly ParcelOwnership[]
  parcelWorldId: string
  roads: readonly LandrushRoadSegment[]
  surface: LandrushIslandLandSurface
  watchParcelWorld: (worldId: string) => void
}) {
  const { camera, gl } = useThree()
  const [hoveredParcelId, setHoveredParcelId] = useState<string | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null)
  const previousParcelGamepadButtonsRef = useRef(createLandrushIslandGamepadButtonState())
  const selectedParcelIdRef = useRef<string | null>(null)
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
  const groundY =
    surface.grassSurfaceElevation + LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_ELEVATION_OFFSET
  const parcelMapShapes = useMemo(
    () => createLandrushIslandParcelMapShapes(allocation.parcels, roads),
    [allocation.parcels, roads],
  )
  const claimMapParcel = useCallback(
    (parcel: ParcelAllocationParcel) => {
      const ownership = ownershipMap.get(parcel.id)
      if (!canClaimLandrushIslandParcel({ localOwnership, localProfile, ownership })) return false
      return claimParcel(parcelWorldId, parcel.id)
    },
    [claimParcel, localOwnership, localProfile, ownershipMap, parcelWorldId],
  )

  useEffect(() => {
    selectedParcelIdRef.current = selectedParcelId
  }, [selectedParcelId])

  useEffect(() => {
    watchParcelWorld(parcelWorldId)
  }, [parcelWorldId, watchParcelWorld])

  useEffect(() => {
    const probe = getLandrushIslandRuntimeProbe()
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
    selectedParcelIdRef.current = null
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
    if (!mapView || buildMode) {
      previousParcelGamepadButtonsRef.current = createLandrushIslandGamepadButtonState()
      return
    }

    const buttons = readLandrushIslandGamepadButtonState(readLandrushGamepadInput())
    const previous = previousParcelGamepadButtonsRef.current
    previousParcelGamepadButtonsRef.current = buttons

    const direction: LandrushIslandParcelSelectionDirection | null =
      wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadUp')
        ? 'up'
        : wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadDown')
          ? 'down'
          : wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadLeft')
            ? 'left'
            : wasLandrushIslandGamepadButtonPressed(buttons, previous, 'dpadRight')
              ? 'right'
              : null

    if (direction) {
      const parcel = resolveLandrushIslandDirectionalParcelSelection({
        camera: state.camera,
        currentParcelId: selectedParcelIdRef.current,
        direction,
        parcels: allocation.parcels,
        shapes: parcelMapShapes,
      })
      if (parcel) {
        selectedParcelIdRef.current = parcel.id
        setSelectedParcelId(parcel.id)
        setHoveredParcelId(null)
        renderScheduler.requestFrame('selection:changed')
      }
    }

    if (!wasLandrushIslandGamepadButtonPressed(buttons, previous, 'cross')) return

    const parcel =
      allocation.parcels.find((candidate) => candidate.id === selectedParcelIdRef.current) ??
      resolveLandrushIslandDefaultParcelSelection({
        camera: state.camera,
        parcels: allocation.parcels,
        shapes: parcelMapShapes,
      })
    if (!parcel) return

    selectedParcelIdRef.current = parcel.id
    setSelectedParcelId(parcel.id)
    setHoveredParcelId(null)
    if (claimMapParcel(parcel)) renderScheduler.requestFrame('selection:changed')
  })

  return (
    <>
      {!buildMode
        ? allocation.parcels.map((parcel) => (
            <LandrushIslandParcelClaimMesh
              canClaim={canClaimLandrushIslandParcel({
                localOwnership,
                localProfile,
                ownership: ownershipMap.get(parcel.id),
              })}
              groundY={groundY}
              hovered={hoveredParcelId === parcel.id}
              key={parcel.id}
              labelVisible={mapLabelsVisible}
              mapOpacityRef={mapPresentationProgressRef}
              mapView={mapView}
              onClaim={() => {
                selectedParcelIdRef.current = parcel.id
                setSelectedParcelId(parcel.id)
                claimMapParcel(parcel)
              }}
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
              <LandrushIslandParcelBuildMarker
                groundY={groundY}
                key={parcel.id}
                labelsVisible={mapLabelsVisible}
                mapPresentationVisible={mapPresentationVisible}
                mapView={mapView}
                mapOpacityRef={mapPresentationProgressRef}
                onBuild={onBuildParcel}
                parcel={parcel}
                shape={parcelMapShapes.get(parcel.id)}
                visible={!buildMode && (mapPresentationVisible || mapView)}
              />
            ))
        : null}
    </>
  )
}

function LandrushIslandParcelClaimMesh({
  canClaim,
  groundY,
  hovered,
  labelVisible,
  mapOpacityRef,
  mapView,
  onClaim,
  onSelect,
  owned,
  parcel,
  selected,
  shape,
}: {
  canClaim: boolean
  groundY: number
  hovered: boolean
  labelVisible: boolean
  mapOpacityRef: { current: number }
  mapView: boolean
  onClaim: () => void
  onSelect: () => void
  owned: boolean
  parcel: ParcelAllocationParcel
  selected: boolean
  shape?: LandrushIslandParcelMapShape
}) {
  const groupRef = useRef<Group>(null!)
  const freeBadgeRef = useRef<HTMLButtonElement | null>(null)
  const materialRef = useRef<MeshBasicMaterial>(null!)
  const contourMaterialRef = useRef<LineBasicMaterial>(null!)
  const parcelShape = useMemo(
    () => shape ?? createLandrushIslandParcelMapShape(parcel, []),
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
  const claimLabelExpanded = canClaim && selected
  const baseColor = useMemo(() => new Color(LANDRUSH_ISLAND_PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(LANDRUSH_ISLAND_PARCEL_MAP_HOVER_COLOR), [])

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
    const targetScale = emphasis ? LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_HOVER_SCALE : 1
    const scale = MathUtils.damp(
      group.scale.x,
      targetScale,
      LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    group.scale.setScalar(scale)

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 3.1 + parcel.index * 0.61) * 0.5
    const targetOpacity = emphasis
      ? opacityAmount * (LANDRUSH_ISLAND_PARCEL_MAP_HOVER_OPACITY + pulse * 0.018)
      : opacityAmount *
        LANDRUSH_ISLAND_PARCEL_MAP_BASE_OPACITY *
        LANDRUSH_ISLAND_PARCEL_MAP_DEFAULT_FILL_OPACITY_SCALE
    material.opacity = targetOpacity
    material.color.lerpColors(baseColor, hoverColor, emphasis ? 0.72 : 0.12)
    contourMaterial.opacity = mapVisible
      ? opacityAmount * (LANDRUSH_ISLAND_PARCEL_MAP_CONTOUR_OPACITY + pulse * 0.018)
      : 0
    const badgeOpacity =
      !owned && mapVisible ? opacityAmount * LANDRUSH_ISLAND_PARCEL_MAP_FREE_BADGE_OPACITY : 0
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
          color={LANDRUSH_ISLAND_PARCEL_MAP_BASE_COLOR}
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
          color={LANDRUSH_ISLAND_PARCEL_MAP_HOVER_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          ref={contourMaterialRef}
          toneMapped={false}
          transparent
        />
      </lineSegments>
      {!owned && labelVisible ? (
        <Html
          center
          position={[0, 0.92, 0]}
          style={{ pointerEvents: mapView ? 'auto' : 'none' }}
          zIndexRange={[65, 0]}
        >
          <button
            aria-disabled={!canClaim}
            aria-label={canClaim ? 'Claim free parcel' : 'Free parcel'}
            className={[
              'group pointer-events-auto inline-flex h-6 items-center justify-center overflow-hidden rounded-full border border-amber-100/60 bg-slate-950/72 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur transition-[width,transform,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70',
              canClaim
                ? claimLabelExpanded
                  ? 'w-[5.8rem] scale-105 bg-slate-900/84'
                  : 'w-[3.25rem] hover:w-[5.8rem] hover:scale-105 hover:bg-slate-900/84 focus-visible:w-[5.8rem] focus-visible:scale-105 focus-visible:bg-slate-900/84'
                : 'w-[3.25rem] opacity-70',
            ].join(' ')}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (canClaim) {
                onClaim()
                return
              }
              onSelect()
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => onSelect()}
            ref={freeBadgeRef}
            style={{ opacity: 0 }}
            type="button"
          >
            <span
              className={[
                'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150',
                canClaim && claimLabelExpanded
                  ? 'max-w-0 opacity-0'
                  : canClaim
                    ? 'max-w-10 opacity-100 group-hover:max-w-0 group-hover:opacity-0 group-focus-visible:max-w-0 group-focus-visible:opacity-0'
                    : 'max-w-10 opacity-100',
              ].join(' ')}
            >
              Free
            </span>
            {canClaim ? (
              <span
                className={[
                  'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150',
                  claimLabelExpanded
                    ? 'max-w-20 opacity-100'
                    : 'max-w-0 opacity-0 group-hover:max-w-20 group-hover:opacity-100 group-focus-visible:max-w-20 group-focus-visible:opacity-100',
                ].join(' ')}
              >
                Claim free
              </span>
            ) : null}
          </button>
        </Html>
      ) : null}
    </group>
  )
}

function LandrushIslandParcelBuildMarker({
  groundY,
  labelsVisible,
  mapOpacityRef,
  mapPresentationVisible,
  mapView,
  onBuild,
  parcel,
  shape,
  visible,
}: {
  groundY: number
  labelsVisible: boolean
  mapOpacityRef: { current: number }
  mapPresentationVisible: boolean
  mapView: boolean
  onBuild: (parcel: ParcelAllocationParcel) => void
  parcel: ParcelAllocationParcel
  shape?: LandrushIslandParcelMapShape
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
      <LandrushIslandParcelBuildGlow
        groundY={groundY}
        opacityRef={mapOpacityRef}
        parcel={parcel}
        shape={shape}
        visible={mapView || mapPresentationVisible}
      />
      {labelsVisible ? (
        <>
          <Html
            center
            position={[parcel.centroid.x, groundY + 1.05, parcel.centroid.z]}
            style={{ pointerEvents: mapView ? 'auto' : 'none' }}
            zIndexRange={[70, 0]}
          >
            <div
              ref={mapButtonRef}
              style={{ opacity: 0, pointerEvents: mapView ? 'auto' : 'none' }}
            >
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
      ) : null}
    </>
  )
}

function LandrushIslandParcelBuildGlow({
  groundY,
  opacityRef,
  parcel,
  shape,
  visible,
}: {
  groundY: number
  opacityRef: { current: number }
  parcel: ParcelAllocationParcel
  shape?: LandrushIslandParcelMapShape
  visible: boolean
}) {
  const groupRef = useRef<Group>(null!)
  const materialRef = useRef<MeshBasicMaterial>(null!)
  const parcelShape = useMemo(
    () => shape ?? createLandrushIslandParcelMapShape(parcel, []),
    [parcel, shape],
  )
  const geometry = useMemo(
    () => createCenteredParcelGeometry(parcel, parcelShape.points, parcelShape.centroid),
    [parcel, parcelShape],
  )
  const baseColor = useMemo(() => new Color(LANDRUSH_ISLAND_PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(LANDRUSH_ISLAND_PARCEL_MAP_HOVER_COLOR), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    if (!group || !material) return

    const opacity = visible ? clamp01(opacityRef.current) : 0
    group.visible = opacity > 0.002
    if (!group.visible) return

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 2.2 + parcel.index * 0.61) * 0.5
    const targetScale = LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_HOVER_SCALE * 0.998
    const scale = MathUtils.damp(
      group.scale.x,
      targetScale,
      LANDRUSH_ISLAND_PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    group.scale.setScalar(scale)
    material.opacity = opacity * (LANDRUSH_ISLAND_PARCEL_MAP_BASE_OPACITY * 0.62 + pulse * 0.01)
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
          color={LANDRUSH_ISLAND_PARCEL_MAP_BASE_COLOR}
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

const MemoizedGrassWaterLandLayers = memo(GrassWaterLandLayers)
const MemoizedLandrushIslandPlayerLayer = memo(LandrushIslandPlayerLayer)
const MemoizedLandrushIslandParcelOwnershipLayer = memo(LandrushIslandParcelOwnershipLayer)

const LANDRUSH_ISLAND_ROBOT_REVEAL_OCCLUDER_NODE_TYPES = [
  'wall',
  'fence',
  'door',
  'window',
  'item',
  'column',
  'elevator',
  'stair',
  'stair-segment',
  'slab',
  'ceiling',
  'roof',
] as const

function LandrushIslandRobotScreenRevealClipper({
  motionRef,
  presentationMode,
  structureGroundY,
  visualRootRef,
  visible,
}: {
  motionRef: { current: RobotMotion | null }
  presentationMode: LandrushRobotPresentationMode
  structureGroundY: number
  visualRootRef: { current: Group | null }
  visible: boolean
}) {
  const { camera, gl, scene } = useThree()
  const occludersRef = useRef<LandrushIslandRobotRevealOccluder[]>([])
  const objectStatesRef = useRef(new Map<Object3D, LandrushIslandRevealObjectState>())
  const activeObjectsRef = useRef(new Set<Object3D>())
  const materialsRef = useRef<Material[]>([])
  const materialStatesRef = useRef(new Map<Material, LandrushIslandRevealMaterialState>())
  const activeMaterialsRef = useRef(new Set<Material>())
  const registeredNodeRootsRef = useRef(new Set<Object3D>())
  const lastRefreshAtRef = useRef(-Infinity)
  const lastStairTransitionTopYRef = useRef<number | null>(null)
  const lastProbeAtRef = useRef(-Infinity)
  const revealActiveRef = useRef(false)
  const clippingPlanesRef = useRef(
    Array.from(
      { length: LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_CLIP_SEGMENTS + 1 },
      () => new Plane(),
    ),
  )
  const boundaryPointsRef = useRef(
    Array.from({ length: LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_CLIP_SEGMENTS }, () => new Vector3()),
  )
  const cameraPositionRef = useRef(new Vector3())
  const robotVisualRootRef = useRef(new Vector3())
  const robotBaseRef = useRef(new Vector3())
  const robotHeadRef = useRef(new Vector3())
  const robotCenterRef = useRef(new Vector3())
  const robotNdcRef = useRef(new Vector3())
  const robotViewPointRef = useRef(new Vector3())
  const revealDepthNormalRef = useRef(new Vector3())
  const revealDepthPointRef = useRef(new Vector3())
  const revealScreenRef = useRef({ x: 0, y: 0 })
  const hoverAmountRef = useRef(0)
  const rendererClippingRef = useRef<{
    localClippingEnabled?: boolean
    renderer: { localClippingEnabled?: boolean }
  } | null>(null)
  const restoreClipping = useCallback(() => {
    clearLandrushRobotScreenRevealMask()
    for (const [object, state] of objectStatesRef.current) {
      restoreLandrushIslandRevealObjectState(object, state)
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
    lastRefreshAtRef.current = -Infinity
    lastStairTransitionTopYRef.current = null
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
    const revealPath = resolveLandrushIslandRevealClippingPath(renderer)
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
    const robotVisualY =
      robotVisualRoot?.y ??
      motion.position.y + resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    const robotX = robotVisualRoot?.x ?? motion.position.x
    const robotZ = robotVisualRoot?.z ?? motion.position.z
    const robotPoint = { x: robotX, z: robotZ }
    cameraPositionRef.current.setFromMatrixPosition(camera.matrixWorld)
    const nodes = useScene.getState().nodes
    const registeredNodeRoots = registeredNodeRootsRef.current
    const stairTransitionTopY = resolveLandrushIslandRobotRevealStairTransitionTopY(
      nodes,
      robotPoint,
      structureGroundY,
    )
    const stairTransitionChanged =
      stairTransitionTopY === null
        ? lastStairTransitionTopYRef.current !== null
        : lastStairTransitionTopYRef.current === null ||
          Math.abs(stairTransitionTopY - lastStairTransitionTopYRef.current) > 0.001
    if (stairTransitionChanged || clock.elapsedTime - lastRefreshAtRef.current > 0.35) {
      lastRefreshAtRef.current = clock.elapsedTime
      lastStairTransitionTopYRef.current = stairTransitionTopY
      registeredNodeRoots.clear()
      for (const object of sceneRegistry.nodes.values()) registeredNodeRoots.add(object)
      occludersRef.current = collectLandrushIslandRobotRevealOccluders(scene, {
        cameraPoint: { x: cameraPositionRef.current.x, z: cameraPositionRef.current.z },
        cameraY: cameraPositionRef.current.y,
        robotPoint,
        robotY: robotVisualY,
        stairTransitionTopY,
        structureGroundY,
      })
      materialsRef.current = collectLandrushIslandRobotRevealMaterials(
        occludersRef.current,
        registeredNodeRoots,
      )
    }
    const robotBase = robotBaseRef.current.set(
      robotX,
      robotVisualY + LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_BASE_HEIGHT,
      robotZ,
    )
    const robotHead = robotHeadRef.current.set(
      robotX,
      robotVisualY + LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_HEAD_HEIGHT,
      robotZ,
    )
    const robotCenter = robotCenterRef.current
      .copy(robotBase)
      .lerp(robotHead, LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_CENTER_BIAS)
    const robotNdc = robotNdcRef.current.copy(robotCenter).project(camera)
    if (robotNdc.z < -1 || robotNdc.z > 1) {
      if (revealActiveRef.current) restoreClipping()
      return
    }
    const robotCenterViewDepth = -robotViewPointRef.current
      .copy(robotCenter)
      .applyMatrix4(camera.matrixWorldInverse).z
    const robotNearDepth =
      robotCenterViewDepth - LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_DEPTH_BIAS_METERS
    if (!Number.isFinite(robotNearDepth) || robotNearDepth <= 0) {
      if (revealActiveRef.current) restoreClipping()
      return
    }
    const revealDepthNormal = camera
      .getWorldDirection(revealDepthNormalRef.current)
      .normalize()
      .negate()
    const revealDepthPoint = revealDepthPointRef.current
      .copy(cameraPositionRef.current)
      .addScaledVector(revealDepthNormal, -robotNearDepth)

    const baseScreen = projectLandrushIslandScreenPoint(robotBase.project(camera), width, height)
    const headScreen = projectLandrushIslandScreenPoint(robotHead.project(camera), width, height)
    const projectedCenterScreen = projectLandrushIslandScreenPoint(robotNdc, width, height)
    const robotScreen = projectedCenterScreen
    const robotScreenInsideViewport =
      robotScreen.x >= 0 && robotScreen.x <= width && robotScreen.y >= 0 && robotScreen.y <= height
    const robotScreenHeight = Math.hypot(headScreen.x - baseScreen.x, headScreen.y - baseScreen.y)
    const baseRevealRadiusPx = Math.max(
      LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_MIN_RADIUS_PX,
      robotScreenHeight * LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_DIAMETER_SCALE * 0.5,
    )
    const revealRadiusPx = baseRevealRadiusPx
    const revealOuterRadiusPx =
      revealRadiusPx * LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_FEATHER_RADIUS_SCALE
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
          presentationMode === 'hover'
            ? LANDRUSH_ISLAND_ROBOT_SCREEN_REVEAL_HOVER_BOTTOM_SAFE_PX
            : 0,
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
      robotNearDepth,
      width,
    })
    updateLandrushIslandRobotRevealClippingPlanes({
      camera,
      cameraPosition: cameraPositionRef.current,
      depthPlaneNormal: revealDepthNormal,
      depthPlanePoint: revealDepthPoint,
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
      recordLandrushIslandRevealProbe({
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
        robotScreenBounds: null,
        screenSource: 'visual-root-segment',
        stairTransitionTopY,
        robotScreen: [roundPerf(robotScreen.x), roundPerf(robotScreen.y)],
        robotScreenInsideViewport,
        softMaterialCount: materialsRef.current.filter(isLandrushIslandSoftRevealMaterial).length,
      })
    }

    if (revealPath === 'object') {
      restoreLandrushIslandRevealMaterialClipping(materialStatesRef.current)
      applyLandrushIslandRevealObjectClipping({
        activeObjects: activeObjectsRef.current,
        objectStates: objectStatesRef.current,
        objects: occludersRef.current,
        planes: clippingPlanesRef.current,
        registeredNodeRoots,
      })
      return
    }

    restoreLandrushIslandRevealObjectClipping(objectStatesRef.current)
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

function resolveLandrushIslandRevealClippingPath(renderer: {
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

function applyLandrushIslandRevealObjectClipping({
  activeObjects,
  objectStates,
  objects,
  planes,
  registeredNodeRoots,
}: {
  activeObjects: Set<Object3D>
  objectStates: Map<Object3D, LandrushIslandRevealObjectState>
  objects: readonly LandrushIslandRobotRevealOccluder[]
  planes: Plane[]
  registeredNodeRoots: ReadonlySet<Object3D>
}) {
  activeObjects.clear()
  for (const { object } of objects) {
    object.traverse((child) => {
      if ((child as { isMesh?: boolean }).isMesh !== true) return
      const mesh = child as Mesh
      if (
        !isLandrushRevealObjectOwnedByRoot(mesh, object, registeredNodeRoots) ||
        !isLandrushIslandSoftRevealMeshVisible(mesh, object) ||
        !isLandrushIslandRevealMeshDrawable(mesh)
      ) {
        return
      }
      if (getLandrushIslandMaterials(mesh.material).some(isLandrushIslandSoftRevealMaterial)) return
      const target = resolveLandrushIslandRevealClippingObject(child)
      if (!target) return
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
    })
  }

  for (const [object, state] of objectStates) {
    if (activeObjects.has(object)) continue
    restoreLandrushIslandRevealObjectState(object, state)
    objectStates.delete(object)
  }
}

function restoreLandrushIslandRevealObjectClipping(
  objectStates: Map<Object3D, LandrushIslandRevealObjectState>,
) {
  for (const [object, state] of objectStates) {
    restoreLandrushIslandRevealObjectState(object, state)
  }
  objectStates.clear()
}

function restoreLandrushIslandRevealObjectState(
  object: Object3D,
  state: LandrushIslandRevealObjectState,
) {
  const target = object as Object3D & {
    clipIntersection?: unknown
    clippingPlanes?: unknown
    clipShadows?: unknown
    enabled?: unknown
    isClippingGroup?: unknown
  }
  restoreLandrushIslandOptionalProperty(target, 'isClippingGroup', state.isClippingGroup)
  restoreLandrushIslandOptionalProperty(target, 'clippingPlanes', state.clippingPlanes)
  restoreLandrushIslandOptionalProperty(target, 'enabled', state.enabled)
  restoreLandrushIslandOptionalProperty(target, 'clipIntersection', state.clipIntersection)
  restoreLandrushIslandOptionalProperty(target, 'clipShadows', state.clipShadows)
}

function restoreLandrushIslandOptionalProperty<
  Key extends 'clipIntersection' | 'clipShadows' | 'clippingPlanes' | 'enabled' | 'isClippingGroup',
>(target: Partial<Record<Key, unknown>>, key: Key, value: unknown) {
  if (value === undefined) {
    delete target[key]
    return
  }
  target[key] = value
}

function resolveLandrushIslandRevealClippingObject(object: Object3D) {
  const target = object as Object3D & { isGroup?: boolean; isMesh?: boolean }
  return target.isGroup === true || target.isMesh === true ? object : null
}

function restoreLandrushIslandRevealMaterialClipping(
  materialStates: Map<Material, LandrushIslandRevealMaterialState>,
) {
  for (const [material, state] of materialStates) {
    material.clippingPlanes = state.clippingPlanes
    material.clipIntersection = state.clipIntersection
    material.needsUpdate = true
  }
  materialStates.clear()
}

function isLandrushIslandSoftRevealMeshVisible(mesh: Mesh, root: Object3D) {
  let current: Object3D | null = mesh
  while (current) {
    if (!current.visible) return false
    if (current === root) return true
    current = current.parent
  }
  return false
}

function isLandrushIslandRevealMeshDrawable(mesh: Mesh) {
  const positionCount = mesh.geometry.getAttribute('position')?.count ?? 0
  const elementCount = mesh.geometry.index?.count ?? positionCount
  return positionCount >= 3 && elementCount >= 3
}

function updateLandrushIslandRobotRevealClippingPlanes({
  camera,
  cameraPosition,
  depthPlaneNormal,
  depthPlanePoint,
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
  depthPlaneNormal: Vector3
  depthPlanePoint: Vector3
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

  for (let index = 0; index < points.length; index += 1) {
    const angle = (index / points.length) * Math.PI * 2
    points[index]
      ?.set(
        centerNdcX + Math.cos(angle) * radiusNdcX,
        centerNdcY + Math.sin(angle) * radiusNdcY,
        ndcZ,
      )
      .unproject(camera)
  }

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length
    const point = points[index]
    const nextPoint = points[nextIndex]
    const plane = planes[index]
    if (!point || !nextPoint || !plane) continue
    plane.setFromCoplanarPoints(cameraPosition, nextPoint, point)
    if (plane.distanceToPoint(robotCenter) > 0) plane.negate()
  }
  planes[points.length]?.setFromNormalAndCoplanarPoint(depthPlaneNormal, depthPlanePoint)
}

function collectLandrushIslandRobotRevealOccluders(
  scene: Object3D,
  context: LandrushIslandRobotRevealOccluderContext,
) {
  const occluders = new Set<Object3D>()
  const registryByType = sceneRegistry.byType as Record<string, Set<string> | undefined>
  for (const type of LANDRUSH_ISLAND_ROBOT_REVEAL_OCCLUDER_NODE_TYPES) {
    const nodeIds = registryByType[type]
    if (!nodeIds) continue
    for (const nodeId of nodeIds) {
      if (shouldSkipLandrushIslandRobotRevealOccluder(nodeId as AnyNodeId, context)) continue
      const object = sceneRegistry.nodes.get(nodeId as AnyNodeId)
      if (object) occluders.add(object)
    }
  }
  scene.traverse((object) => {
    if (object.userData?.landrushRobotOccluder === true) occluders.add(object)
  })
  return [...occluders].map((object) => ({ object }))
}

function shouldSkipLandrushIslandRobotRevealOccluder(
  nodeId: AnyNodeId,
  context: LandrushIslandRobotRevealOccluderContext,
) {
  const nodes = useScene.getState().nodes
  const node = nodes[nodeId]
  if (!node) return false
  const metadata = node.metadata as { isTransient?: boolean } | undefined
  if (metadata?.isTransient) return true

  const levelId = resolveLandrushIslandNavigationNodeLevelId(node, nodes)
  if (levelId) {
    const levelBaseY =
      context.structureGroundY + resolveLandrushIslandActiveLevelBaseY(nodes, levelId)
    if (
      context.stairTransitionTopY !== null &&
      levelBaseY >=
        context.stairTransitionTopY - LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS
    ) {
      return true
    }
  }

  if (node.type === 'stair') {
    return pointInLandrushIslandRevealStairFootprint(node, context.robotPoint)
  }

  if (node.type === 'stair-segment') {
    const parentId = (node as { parentId?: AnyNodeId | null }).parentId
    const parent = parentId ? useScene.getState().nodes[parentId] : null
    return (
      parent?.type === 'stair' &&
      pointInLandrushIslandRevealStairFootprint(parent, context.robotPoint)
    )
  }

  if (node.type === 'slab') {
    const surfaceY = resolveLandrushIslandRobotRevealSurfaceY(node, context, nodes)
    if (
      surfaceY <=
      context.robotY + LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS
    ) {
      return true
    }
    if (
      context.stairTransitionTopY !== null &&
      surfaceY >=
        context.stairTransitionTopY - LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS
    ) {
      return true
    }
    return !shouldCutLandrushIslandRobotRevealSurface(node, context)
  }

  if (node.type === 'ceiling' || node.type === 'roof') {
    return !shouldCutLandrushIslandRobotRevealSurface(node, context)
  }

  return false
}

function resolveLandrushIslandRobotRevealStairTransitionTopY(
  nodes: Record<string, AnyNode>,
  robotPoint: LandrushPoint2,
  structureGroundY: number,
) {
  let transitionTopY: number | null = null
  for (const node of Object.values(nodes)) {
    if (
      node.type !== 'stair' ||
      node.visible === false ||
      !pointInLandrushIslandRevealStairFootprint(node, robotPoint)
    ) {
      continue
    }
    const levelId = resolveLandrushIslandNavigationNodeLevelId(node, nodes)
    const levelBaseY = resolveLandrushIslandActiveLevelBaseY(nodes, levelId)
    const localY = node.position?.[1] ?? 0
    const topY = structureGroundY + levelBaseY + localY + Math.max(0, node.totalRise ?? 0)
    transitionTopY = transitionTopY === null ? topY : Math.max(transitionTopY, topY)
  }
  return transitionTopY
}

function pointInLandrushIslandRevealStairFootprint(
  node: Extract<AnyNode, { type: 'stair' }>,
  point: LandrushPoint2,
) {
  const nodes = useScene.getState().nodes
  const footprints = createLandrushIslandStairNavigationFootprints(
    node,
    nodes,
    LANDRUSH_ISLAND_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS,
  )
  return footprints.some(({ points }) =>
    Boolean(
      pointInPolygonOrNearEdge(
        point,
        points,
        LANDRUSH_ISLAND_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS,
      ),
    ),
  )
}

function shouldCutLandrushIslandRobotRevealSurface(
  node: Extract<AnyNode, { type: 'ceiling' | 'roof' | 'slab' }>,
  context: LandrushIslandRobotRevealOccluderContext,
) {
  const nodes = useScene.getState().nodes
  const footprints = createLandrushIslandBuildNodeFootprints(node, 0, nodes)
  if (footprints.length === 0) return true

  const coversRobot = footprints.some((footprint) =>
    pointInPolygonOrNearEdge(
      context.robotPoint,
      footprint,
      LANDRUSH_ISLAND_ROBOT_REVEAL_STAIR_STANDING_TOLERANCE_METERS,
    ),
  )
  const crossesCameraPath = footprints.some((footprint) =>
    landrushIslandNavigationSegmentIntersectsPolygon(
      context.cameraPoint,
      context.robotPoint,
      footprint,
    ),
  )
  if (!coversRobot && !crossesCameraPath) return false

  if (node.type === 'roof') return true

  const surfaceY = resolveLandrushIslandRobotRevealSurfaceY(node, context, nodes)
  if (
    coversRobot &&
    surfaceY > context.robotY + LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS
  ) {
    return true
  }

  const minViewY = Math.min(context.cameraY, context.robotY)
  const maxViewY = Math.max(context.cameraY, context.robotY)
  return (
    crossesCameraPath &&
    surfaceY >= minViewY - LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS &&
    surfaceY <= maxViewY + LANDRUSH_ISLAND_ROBOT_REVEAL_SUPPORT_SURFACE_TOLERANCE_METERS
  )
}

function resolveLandrushIslandRobotRevealSurfaceY(
  node: Extract<AnyNode, { type: 'ceiling' | 'slab' }>,
  context: LandrushIslandRobotRevealOccluderContext,
  nodes: Record<string, AnyNode>,
) {
  const levelId = resolveLandrushIslandNavigationNodeLevelId(node, nodes)
  const levelBaseY = resolveLandrushIslandActiveLevelBaseY(nodes, levelId)
  const localSurfaceY =
    node.type === 'ceiling' ? (node.height ?? 2.5) : Math.max(0, node.elevation ?? 0.05)
  return context.structureGroundY + levelBaseY + localSurfaceY
}

function collectLandrushIslandRobotRevealMaterials(
  occluders: readonly LandrushIslandRobotRevealOccluder[],
  registeredNodeRoots: ReadonlySet<Object3D>,
) {
  const materials = new Set<Material>()
  for (const { object } of occluders) {
    collectLandrushIslandObjectMaterials(object, registeredNodeRoots, materials)
  }
  return [...materials]
}

function collectLandrushIslandObjectMaterials(
  object: Object3D,
  registeredNodeRoots: ReadonlySet<Object3D>,
  materials: Set<Material>,
) {
  object.traverse((child) => {
    const mesh = child as { isMesh?: boolean; material?: unknown }
    if (!mesh.isMesh) return
    if (!isLandrushRevealObjectOwnedByRoot(child, object, registeredNodeRoots)) return
    for (const material of getLandrushIslandMaterials(mesh.material)) {
      materials.add(material)
    }
  })
}

function getLandrushIslandMaterials(material: unknown): Material[] {
  if (Array.isArray(material)) return material.filter(isLandrushIslandMaterial)
  return isLandrushIslandMaterial(material) ? [material] : []
}

function isLandrushIslandMaterial(material: unknown): material is Material {
  return Boolean(material && typeof material === 'object' && 'needsUpdate' in material)
}

function isLandrushIslandSoftRevealMaterial(material: Material) {
  return material.userData?.landrushRobotScreenRevealSoftMask === true
}

function setLandrushIslandGroupMaterialOpacity(group: Group, opacity: number) {
  group.visible = opacity > 0.002
  group.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material
    if (!material) return

    for (const candidate of getLandrushIslandMaterials(material)) {
      const baseOpacity =
        typeof candidate.userData.landrushIslandBaseOpacity === 'number'
          ? candidate.userData.landrushIslandBaseOpacity
          : candidate.opacity
      candidate.userData.landrushIslandBaseOpacity = baseOpacity
      candidate.opacity = baseOpacity * opacity
      candidate.transparent = true
    }
  })
}

function projectLandrushIslandScreenPoint(ndc: Vector3, width: number, height: number) {
  return {
    x: (ndc.x * 0.5 + 0.5) * width,
    y: (-ndc.y * 0.5 + 0.5) * height,
  }
}

const _landrushIslandScreenProjectionVector = new Vector3()
const _landrushIslandScreenProjectionPoint = new Vector2()
const _landrushIslandCameraPoseLookAtMatrix = new Matrix4()
const _landrushIslandCameraPoseUp = new Vector3(0, 1, 0)

function projectVectorToLandrushIslandScreenPoint(
  point: Vector3,
  camera: Camera,
  viewport: { height: number; width: number },
) {
  const projected = _landrushIslandScreenProjectionVector.copy(point).project(camera)
  const screen = projectLandrushIslandScreenPoint(projected, viewport.width, viewport.height)
  return _landrushIslandScreenProjectionPoint.set(screen.x, screen.y)
}

function distanceSqToLandrushIslandScreenSegment(point: Vector2, start: Vector2, end: Vector2) {
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

function isLandrushIslandProjectedPointWithinClipDepth(point: Vector3) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    point.z >= -1 &&
    point.z <= 1
  )
}

function doesLandrushIslandScreenCapsuleIntersectViewport(
  start: Vector2,
  end: Vector2,
  radius: number,
  width: number,
  height: number,
) {
  return (
    Math.max(start.x, end.x) + radius >= 0 &&
    Math.min(start.x, end.x) - radius <= width &&
    Math.max(start.y, end.y) + radius >= 0 &&
    Math.min(start.y, end.y) - radius <= height
  )
}

function LocalLandrushIslandRobot({
  baseNode,
  buildCameraPoseRef,
  cameraEnabled,
  fallSurfacePoints,
  fallPresentationRef,
  fpvActive,
  grassInteractionRef,
  groundY,
  localMotionRef,
  localProfile,
  localRobotVisualRootRef,
  mapReturnCameraPoseRef,
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
  waterY,
}: {
  baseNode: LandrushIslandLayoutNode
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  cameraEnabled: boolean
  fallSurfacePoints: readonly LandrushPoint2[]
  fallPresentationRef: { current: LandrushIslandFallPresentationState }
  fpvActive: boolean
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  groundY: number
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  localRobotVisualRootRef: { current: Group | null }
  mapReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  movementEnabled: boolean
  navigationDebugEnabled: boolean
  navigationLiveScenario: LandrushIslandNavigationLiveScenarioKind | null
  navigationLiveScenarioAutoRun: boolean
  navigationLiveScenarioReady: boolean
  onExitBuildMode: () => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: LandrushIslandPerfRunOptions
  presentationMode: LandrushRobotPresentationMode
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  playerReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  spawn: LandrushPoint2
  surfacePoints: readonly LandrushPoint2[]
  waterY: number
}) {
  const { camera, gl } = useThree()
  const builtColliderWorlds = useLandrushIslandBuiltColliderWorlds()
  const sceneNodesForNavigation = useScene((state) => (movementEnabled ? state.nodes : null))
  const pressedKeysRef = useRef(new Set<string>())
  const clickMoveTargetRef = useRef<LandrushIslandMoveTarget | null>(null)
  const rightHoldMoveRef = useRef<LandrushIslandRightHoldMove | null>(null)
  const fallStateRef = useRef<LandrushIslandRobotFallState | null>(null)
  const fallControlQuaternionRef = useRef(new Quaternion())
  const fallControlAngularVelocityRef = useRef(new Vector3())
  const fallControlTargetAngularVelocityRef = useRef(new Vector3())
  const fallControlAxisRef = useRef(new Vector3())
  const fallControlDeltaQuaternionRef = useRef(new Quaternion())
  const fallControlCameraForwardRef = useRef(new Vector3())
  const fallControlCameraRightRef = useRef(new Vector3())
  const fallControlCameraUpRef = useRef(new Vector3())
  const gamepadJumpHeldRef = useRef(false)
  const lastFallDirectionRef = useRef<LandrushPoint2>({ x: 0, z: 1 })
  const physicsControllerRef = useRef<BVHEcctrlApi | null>(null)
  const physicsHeadingRef = useRef(0)
  const lastPhysicsPositionRef = useRef(new Vector3(spawn.x, groundY, spawn.z))
  const targetMotionPositionRef = useRef(new Vector3(spawn.x, groundY, spawn.z))
  const lastGrassProbeAtRef = useRef(0)
  const lastSentAtRef = useRef(0)
  const surfacePointsRef = useRef(surfacePoints)
  const fallSurfacePointsRef = useRef(fallSurfacePoints)
  const clickMovePointerNdc = useMemo(() => new Vector2(), [])
  const clickMoveRaycaster = useMemo(() => new Raycaster(), [])
  const groundColliderMesh = useMemo(
    () => createLandrushIslandGroundColliderMesh(fallSurfacePoints, groundY),
    [fallSurfacePoints, groundY],
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
        ? createLandrushIslandNavigationObstacles(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const doorPortals = useMemo(
    () =>
      movementEnabled && sceneNodesForNavigation
        ? createLandrushIslandDoorPortals(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const stairPortals = useMemo(
    () =>
      movementEnabled && sceneNodesForNavigation
        ? createLandrushIslandStairPortals(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const stairConnectors = useMemo(
    () =>
      movementEnabled && sceneNodesForNavigation
        ? createLandrushIslandStairConnectors(sceneNodesForNavigation)
        : [],
    [movementEnabled, sceneNodesForNavigation],
  )
  const nodeRef = useRef<LandrushWorldNode>(
    createLandrushIslandRobotActorNode(baseNode, localProfile.id, spawn, groundY),
  )
  const [buildRobotHovered, setBuildRobotHovered] = useState(false)
  const [fallPresentationActive, setFallPresentationActive] = useState(false)
  const [fallPresentation, setFallPresentation] = useState(() =>
    createLandrushIslandFallPresentationState(),
  )
  const [navigationDebugSnapshot, setNavigationDebugSnapshot] =
    useState<LandrushIslandNavigationDebugSnapshot | null>(null)
  const motionRef = useRef<RobotMotion>({
    cameraSnapVersion: 0,
    falling: false,
    heading: 0,
    isMoving: false,
    position: new Vector3(spawn.x, groundY, spawn.z),
    runRequested: false,
    speed: 0,
    velocity: new Vector3(),
  })
  const activeNavigationDebugRef = useRef<{
    kind: LandrushIslandNavigationSteeringKind | 'manual' | null
    steeringPoint: LandrushPoint2 | null
  }>({ kind: null, steeringPoint: null })
  const navigationTraceRef = useRef<LandrushPoint2[]>([])
  const lastNavigationDebugAtRef = useRef(0)
  const navigationLiveScenarioRunRef = useRef<string | null>(null)
  const navigationLiveScenarioTimerRef = useRef<number | null>(null)
  const navigationLiveScenarioDefinition = useMemo(
    () =>
      navigationLiveScenario
        ? createLandrushIslandNavigationLiveScenarioDefinition(spawn, navigationLiveScenario)
        : null,
    [navigationLiveScenario, spawn],
  )
  surfacePointsRef.current = surfacePoints
  fallSurfacePointsRef.current = fallSurfacePoints
  const effectivePresentationMode: LandrushRobotPresentationMode = fallPresentationActive
    ? 'fall'
    : presentationMode

  useEffect(() => {
    if (presentationMode !== 'hover') setBuildRobotHovered(false)
  }, [presentationMode])

  const updateFallPresentation = useCallback(
    (next: LandrushIslandFallPresentationState) => {
      fallPresentationRef.current = next
      setFallPresentation((current) => {
        if (
          current.active === next.active &&
          Math.abs(current.amount - next.amount) < 0.012 &&
          Math.abs(current.slowMotionFactor - next.slowMotionFactor) < 0.025 &&
          Math.abs(current.wiggleAmount - next.wiggleAmount) < 0.025
        ) {
          return current
        }
        return next
      })
    },
    [fallPresentationRef],
  )

  useEffect(
    () => () => {
      disposeLandrushIslandGroundColliderMesh(groundColliderMesh)
      updateFallPresentation(createLandrushIslandFallPresentationState())
    },
    [groundColliderMesh, updateFallPresentation],
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
      createLandrushIslandPlayerSnapshot({
        heading: motion.heading,
        localProfile,
        moving: motion.isMoving,
        ...(motion.falling ? { pose: 'falling' as const } : {}),
        position: [motion.position.x, motion.position.y, motion.position.z],
        speed: motion.speed,
      }),
    )
  }, [localProfile, onLocalPlayerChange])
  publishCurrentPlayerRef.current = publishCurrentPlayer

  const resetToSpawn = useCallback(() => {
    const motion = motionRef.current
    fallStateRef.current = null
    resetLandrushIslandFallControlRotation(
      fallControlQuaternionRef.current,
      fallControlAngularVelocityRef.current,
    )
    motion.position.set(spawn.x, groundY, spawn.z)
    motion.velocity.set(0, 0, 0)
    motion.falling = false
    motion.heading = 0
    motion.isMoving = false
    motion.runRequested = false
    motion.speed = 0
    motion.cameraSnapVersion += 1
    physicsHeadingRef.current = 0
    lastPhysicsPositionRef.current.set(spawn.x, groundY, spawn.z)
    targetMotionPositionRef.current.set(spawn.x, groundY, spawn.z)
    navigationTraceRef.current = [{ x: spawn.x, z: spawn.z }]
    rightHoldMoveRef.current = null
    clickMoveTargetRef.current = null
    gamepadJumpHeldRef.current = false
    lastFallDirectionRef.current = { x: 0, z: 1 }
    activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
    setNavigationDebugSnapshot(null)
    setFallPresentationActive(false)
    updateFallPresentation(createLandrushIslandFallPresentationState())
    physicsControllerRef.current?.setPaused(false)
    const physicsGroup = physicsControllerRef.current?.group
    if (physicsGroup) {
      physicsGroup.position.set(
        spawn.x,
        groundY + LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT,
        spawn.z,
      )
      physicsControllerRef.current?.resetLinVel()
      physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
    }
    grassInteractionRef.current = {
      radius: LANDRUSH_ISLAND_ROBOT_GRASS_INTERACTION_RADIUS,
      speed: 0,
      strength: LANDRUSH_ISLAND_ROBOT_GRASS_IDLE_BEND_STRENGTH,
      x: motion.position.x,
      z: motion.position.z,
    }
    recordLandrushIslandGrassProbe({
      centerLagMeters: 0,
      moving: false,
      physicsLagMeters: 0,
      position: [motion.position.x, motion.position.z],
      radius: LANDRUSH_ISLAND_ROBOT_GRASS_INTERACTION_RADIUS,
      source: 'reset-spawn',
      speed: 0,
      strength: LANDRUSH_ISLAND_ROBOT_GRASS_IDLE_BEND_STRENGTH,
    })
    writeMotionToLandrushIslandRobotNode(nodeRef.current, motion)
    publishCurrentPlayerRef.current()
  }, [grassInteractionRef, groundY, spawn, updateFallPresentation])

  const setupNavigationTestStart = useCallback(
    ({ label, start }: { label?: string; start: LandrushPoint2 & { y?: number } }) => {
      const startY = start.y ?? groundY
      const motion = motionRef.current
      fallStateRef.current = null
      resetLandrushIslandFallControlRotation(
        fallControlQuaternionRef.current,
        fallControlAngularVelocityRef.current,
      )
      motion.position.set(start.x, startY, start.z)
      motion.velocity.set(0, 0, 0)
      motion.falling = false
      motion.isMoving = false
      motion.runRequested = false
      motion.speed = 0
      motion.cameraSnapVersion += 1
      lastPhysicsPositionRef.current.set(start.x, startY, start.z)
      targetMotionPositionRef.current.set(start.x, startY, start.z)
      navigationTraceRef.current = [{ x: start.x, z: start.z }]
      rightHoldMoveRef.current = null
      clickMoveTargetRef.current = null
      gamepadJumpHeldRef.current = false
      lastFallDirectionRef.current = { x: 0, z: 1 }
      activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
      setNavigationDebugSnapshot(null)
      setFallPresentationActive(false)
      updateFallPresentation(createLandrushIslandFallPresentationState())
      physicsControllerRef.current?.setPaused(false)
      const physicsGroup = physicsControllerRef.current?.group
      if (physicsGroup) {
        physicsGroup.position.set(
          start.x,
          startY + LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT,
          start.z,
        )
        physicsControllerRef.current?.resetLinVel()
        physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
      }
      if (typeof window !== 'undefined') {
        window.__LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__ = {
          captures: [],
          scenario: navigationLiveScenario ?? 'room',
          startedAt: performance.now(),
        }
      }
      recordLandrushIslandInputProbe({
        kind: 'nav-test-setup-start',
        label,
        start: [roundPerf(start.x), roundPerf(startY), roundPerf(start.z)],
      })
      writeMotionToLandrushIslandRobotNode(nodeRef.current, motion)
      publishCurrentPlayerRef.current()
      return true
    },
    [groundY, navigationLiveScenario, updateFallPresentation],
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
          ? resolveLandrushIslandStairConnectorTarget(start, target, stairPortals)
          : target
      setupNavigationTestStart({ label, start })
      const motion = motionRef.current
      motion.heading = Math.atan2(resolvedTarget.x - start.x, resolvedTarget.z - start.z)
      physicsHeadingRef.current = motion.heading
      clickMoveTargetRef.current = { point: resolvedTarget }
      recordLandrushIslandInputProbe({
        kind: 'nav-test-start-move',
        label,
        mode,
        resolvedTarget: [roundPerf(resolvedTarget.x), roundPerf(resolvedTarget.z)],
        target: [roundPerf(target.x), roundPerf(target.z)],
      })
      writeMotionToLandrushIslandRobotNode(nodeRef.current, motion)
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
    nodeRef.current = createLandrushIslandRobotActorNode(baseNode, localProfile.id, spawn, groundY)
    resetToSpawn()
  }, [baseNode, groundY, localProfile.id, resetToSpawn, spawn])

  useEffect(() => {
    if (!navigationDebugEnabled && !navigationLiveScenario) return
    const bridge: LandrushIslandNavigationTestBridge = {
      getState: () => ({
        doorPortals: doorPortals.map(cloneLandrushIslandDoorPortal),
        robot: {
          x: motionRef.current.position.x,
          y: motionRef.current.position.y,
          z: motionRef.current.position.z,
        },
        stairPortals: stairPortals.map(cloneLandrushIslandStairPortal),
      }),
      projectPoint: projectNavigationTestPoint,
      setupStart: setupNavigationTestStart,
      startMove: startNavigationTestMove,
    }
    window.__LANDRUSH_ISLAND_NAV_TEST__ = bridge
    return () => {
      if (window.__LANDRUSH_ISLAND_NAV_TEST__ === bridge) delete window.__LANDRUSH_ISLAND_NAV_TEST__
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
    clickMoveTargetRef.current = null
    rightHoldMoveRef.current = null
    gamepadJumpHeldRef.current = false
    lastFallDirectionRef.current = { x: 0, z: 1 }
    activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
    fallStateRef.current = null
    resetLandrushIslandFallControlRotation(
      fallControlQuaternionRef.current,
      fallControlAngularVelocityRef.current,
    )
    motionRef.current.falling = false
    motionRef.current.runRequested = false
    setFallPresentationActive(false)
    updateFallPresentation(createLandrushIslandFallPresentationState())
    physicsControllerRef.current?.setPaused(false)
    physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
    physicsControllerRef.current?.resetLinVel()
  }, [movementEnabled, updateFallPresentation])

  useEffect(() => {
    if (!navigationLiveScenario || !navigationLiveScenarioDefinition) {
      navigationLiveScenarioRunRef.current = null
      if (navigationLiveScenarioTimerRef.current !== null) {
        window.clearTimeout(navigationLiveScenarioTimerRef.current)
        navigationLiveScenarioTimerRef.current = null
      }
      if (typeof window !== 'undefined') delete window.__LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__
      return
    }

    applyLandrushIslandNavigationLiveScenarioNodes(navigationLiveScenarioDefinition.nodes)
    navigationTraceRef.current = [{ x: spawn.x, z: spawn.z }]
    if (typeof window !== 'undefined') {
      window.__LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__ = {
        captures: [],
        scenario: navigationLiveScenario,
        startedAt: performance.now(),
      }
    }
    recordLandrushIslandNavigationProbe({
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
            (portal) => portal.doorId === LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_DOOR_ID,
          )
        : stairPortals.some(
            (portal) =>
              portal.nodeId === LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID ||
              portal.nodeId === LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_ID,
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
          ? resolveLandrushIslandStairConnectorTarget(
              { x: spawn.x, z: spawn.z },
              target,
              stairPortals,
            )
          : target
      clickMoveTargetRef.current = { point: resolvedTarget }
      activeNavigationDebugRef.current = { kind: null, steeringPoint: null }
      if (typeof window !== 'undefined') {
        window.__LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__ = {
          captures: [],
          scenario: navigationLiveScenario,
          startedAt: performance.now(),
        }
      }
      recordLandrushIslandInputProbe({
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
    let pointerOrbitAnimationFrame = 0
    let pointerOrbitActive = false
    const pointerOrbitId = 91
    const stopPointerOrbit = () => {
      window.cancelAnimationFrame(pointerOrbitAnimationFrame)
      pointerOrbitAnimationFrame = 0
      if (!pointerOrbitActive) return
      pointerOrbitActive = false
      gl.domElement.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          button: 0,
          buttons: 0,
          cancelable: true,
          clientX: 0,
          clientY: 0,
          isPrimary: true,
          pointerId: pointerOrbitId,
          pointerType: 'mouse',
        }),
      )
    }
    const startTimer = window.setTimeout(() => {
      resetToSpawn()
      const orbitScenario =
        perfRun.scenario === 'circle-camera' || perfRun.scenario === 'low-angle-orbit'
      if (perfRun.scenario === 'low-angle-orbit') {
        pressedKeysRef.current.add('KeyA')
        if (playerCameraPoseRef.current) {
          playerCameraPoseRef.current.pitch = LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH
        }
      }
      pressedKeysRef.current.add('KeyW')
      if (perfRun.speed === 'run') pressedKeysRef.current.add('ShiftLeft')
      if (orbitScenario) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, code: 'KeyE', key: 'e' }),
        )
      }
      if (perfRun.scenario === 'pointer-orbit') {
        const canvas = gl.domElement
        const bounds = canvas.getBoundingClientRect()
        const orbitDistance = Math.min(240, bounds.width * 0.25)
        const startX = bounds.left + bounds.width * 0.5 - orbitDistance * 0.5
        const y = bounds.top + bounds.height * 0.5
        const startedAt = performance.now()
        pointerOrbitActive = true
        canvas.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            buttons: 1,
            cancelable: true,
            clientX: startX,
            clientY: y,
            isPrimary: true,
            pointerId: pointerOrbitId,
            pointerType: 'mouse',
          }),
        )
        const stepPointerOrbit = (now: number) => {
          if (!pointerOrbitActive) return
          const progress = Math.min(1, (now - startedAt) / perfRun.durationMs)
          canvas.dispatchEvent(
            new PointerEvent('pointermove', {
              bubbles: true,
              button: -1,
              buttons: 1,
              cancelable: true,
              clientX: startX + orbitDistance * progress,
              clientY: y,
              isPrimary: true,
              pointerId: pointerOrbitId,
              pointerType: 'mouse',
            }),
          )
          if (progress < 1) {
            pointerOrbitAnimationFrame = window.requestAnimationFrame(stepPointerOrbit)
          }
        }
        pointerOrbitAnimationFrame = window.requestAnimationFrame(stepPointerOrbit)
      }

      stopTimer = window.setTimeout(() => {
        pressedKeysRef.current.delete('KeyA')
        pressedKeysRef.current.delete('KeyW')
        pressedKeysRef.current.delete('ShiftLeft')
        if (orbitScenario) {
          window.dispatchEvent(
            new KeyboardEvent('keyup', { bubbles: true, code: 'KeyE', key: 'e' }),
          )
        }
        stopPointerOrbit()
      }, perfRun.durationMs)
    }, LANDRUSH_ISLAND_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(stopTimer)
      stopPointerOrbit()
      pressedKeysRef.current.delete('KeyA')
      pressedKeysRef.current.delete('KeyW')
      pressedKeysRef.current.delete('ShiftLeft')
      if (perfRun.scenario === 'circle-camera' || perfRun.scenario === 'low-angle-orbit') {
        window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'KeyE', key: 'e' }))
      }
    }
  }, [gl, movementEnabled, perfRun, playerCameraPoseRef, resetToSpawn])

  useEffect(() => {
    const canvas = gl.domElement
    if (!movementEnabled) {
      rightHoldMoveRef.current = null
      clickMoveTargetRef.current = null
      return
    }

    const previousTouchAction = canvas.style.touchAction
    canvas.style.touchAction = 'none'

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && !event.isPrimary) {
        rightHoldMoveRef.current = null
        clickMoveTargetRef.current = null
        return
      }
      const touchScreenPress =
        cameraEnabled && event.pointerType === 'touch' && (event.button === 0 || event.button < 0)
      const desktopRightPress = event.button === 2
      if (
        event.defaultPrevented ||
        (!desktopRightPress && !touchScreenPress) ||
        !pointerEventInLandrushIslandCanvas(event, canvas) ||
        isLandrushIslandInteractivePointerTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (touchScreenPress) event.stopImmediatePropagation()
      clickMoveTargetRef.current = null
      rightHoldMoveRef.current = {
        id: event.pointerId,
        source: touchScreenPress ? 'touch' : 'mouse',
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
      }
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {}
      recordLandrushIslandInputProbe({
        kind: 'right-click-down',
        source: touchScreenPress ? 'mobile-touch' : 'mouse',
      })
    }

    const handlePointerMove = (event: PointerEvent) => {
      const active = rightHoldMoveRef.current
      if (!active || active.id !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      if (active.source === 'touch') event.stopImmediatePropagation()
      active.x = event.clientX
      active.y = event.clientY
    }

    const handlePointerUp = (event: PointerEvent) => {
      const active = rightHoldMoveRef.current
      if (active?.id !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      if (active.source === 'touch') event.stopImmediatePropagation()
      rightHoldMoveRef.current = null
      try {
        canvas.releasePointerCapture(active.id)
      } catch {}
      const dragDistance = Math.hypot(active.x - active.startX, active.y - active.startY)
      if (dragDistance > LANDRUSH_ISLAND_RIGHT_CLICK_MOVE_CLICK_TOLERANCE_PX) {
        recordLandrushIslandInputProbe({
          dragDistance: roundPerf(dragDistance),
          kind: 'right-click-hold-end',
        })
        return
      }

      const point = pickLandrushIslandWalkTargetPoint({
        camera,
        canvas,
        colliderMeshes,
        event,
        groundY,
        nodes: useScene.getState().nodes,
        pointerNdc: clickMovePointerNdc,
        raycaster: clickMoveRaycaster,
      })
      const start = {
        x: motionRef.current.position.x,
        z: motionRef.current.position.z,
      }
      const targetNavigation = point
        ? resolveLandrushIslandNavigationContext(
            point.levelId,
            navigationObstacles,
            doorPortals,
            stairPortals,
            stairConnectors,
          )
        : null
      const rawResolvedPoint =
        point && targetNavigation
          ? resolveLandrushIslandStairConnectorTarget(start, point, targetNavigation.stairPortals)
          : null
      const resolvedPoint = rawResolvedPoint
        ? resolveLandrushIslandWalkableNavigationTargetPoint(
            rawResolvedPoint,
            targetNavigation?.navigationObstacles ?? [],
            surfacePointsRef.current,
          )
        : null
      const accepted = Boolean(resolvedPoint)
      clickMoveTargetRef.current =
        accepted && resolvedPoint && point
          ? { levelId: point.levelId, point: resolvedPoint, worldY: point.worldY }
          : null
      recordLandrushIslandInputProbe({
        accepted,
        dragDistance: roundPerf(dragDistance),
        kind: 'right-click-move-target',
        pickedTarget: point
          ? [roundPerf(point.x), roundPerf(point.worldY), roundPerf(point.z)]
          : null,
        rawTarget: rawResolvedPoint
          ? [roundPerf(rawResolvedPoint.x), roundPerf(rawResolvedPoint.z)]
          : null,
        target: resolvedPoint ? [roundPerf(resolvedPoint.x), roundPerf(resolvedPoint.z)] : null,
        targetLevelId: point?.levelId ?? null,
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
        try {
          canvas.releasePointerCapture(event.pointerId)
        } catch {}
      }
    }
    const handleContextMenu = (event: MouseEvent) => {
      if (!pointerEventInLandrushIslandCanvas(event, canvas)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false })
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
    window.addEventListener('contextmenu', handleContextMenu, { capture: true })
    return () => {
      canvas.style.touchAction = previousTouchAction
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerCancel, true)
      window.removeEventListener('contextmenu', handleContextMenu, true)
    }
  }, [
    camera,
    cameraEnabled,
    clickMovePointerNdc,
    clickMoveRaycaster,
    colliderMeshes,
    gl,
    groundY,
    movementEnabled,
    doorPortals,
    navigationObstacles,
    stairConnectors,
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
    const falling = fallStateRef.current !== null
    const currentLevelId = resolveLandrushIslandRobotLevelId(
      sceneNodesForNavigation ?? useScene.getState().nodes,
      motion.position.y,
      groundY,
    )
    const activeNavigation = resolveLandrushIslandNavigationContext(
      currentLevelId,
      navigationObstacles,
      doorPortals,
      stairPortals,
      stairConnectors,
    )
    const gamepadInput = movementEnabled && !falling ? readLandrushGamepadInput() : null
    const gamepadJumpPressed = cameraEnabled && Boolean(gamepadInput?.jump)
    const jumpRequested = !falling && gamepadJumpPressed && !gamepadJumpHeldRef.current
    gamepadJumpHeldRef.current = gamepadJumpPressed
    const movementReferenceFrame: LandrushIslandMovementReferenceFrame = cameraEnabled
      ? 'camera-forward'
      : 'screen-up'
    const movement = movementEnabled
      ? falling
        ? null
        : resolveCameraRelativeMovement(
            pressedKeysRef.current,
            state.camera,
            gamepadInput,
            movementReferenceFrame,
          )
      : null
    if (movement) clickMoveTargetRef.current = null
    const rightHoldMovement =
      movementEnabled && !falling && !movement
        ? resolveRightHoldMovement({
            camera: state.camera,
            canvas: gl.domElement,
            colliderMeshes,
            currentLevelId,
            doorPortals,
            groundY,
            motion,
            navigationObstacles,
            nodes: sceneNodesForNavigation ?? useScene.getState().nodes,
            pointer: rightHoldMoveRef.current,
            pointerNdc: clickMovePointerNdc,
            raycaster: clickMoveRaycaster,
            stairConnectors,
            stairPortals,
            surfacePoints: surfacePointsRef.current,
          })
        : null
    const clickMovement =
      movementEnabled && !falling && !movement && !rightHoldMovement
        ? resolveClickMoveMovement(
            motion,
            clickMoveTargetRef,
            activeNavigation.navigationObstacles,
            activeNavigation.doorPortals,
            activeNavigation.stairPortals,
            surfacePointsRef.current,
            currentLevelId,
            stairConnectors,
          )
        : null
    const activeMovement = movement ?? rightHoldMovement ?? clickMovement
    const physicsMovement = activeMovement
      ? resolveLandrushIslandObstacleSlideMovement(
          { x: motion.position.x, z: motion.position.z },
          activeMovement,
          activeNavigation.navigationObstacles,
        )
      : null
    const fallMovementDirection = physicsMovement ?? activeMovement
    if (
      fallMovementDirection &&
      Math.hypot(fallMovementDirection.x, fallMovementDirection.z) > 0.001
    ) {
      lastFallDirectionRef.current = normalize2(fallMovementDirection.x, fallMovementDirection.z)
    }
    activeNavigationDebugRef.current = activeMovement
      ? {
          kind: activeMovement.navigationKind ?? (movement ? 'manual' : null),
          steeringPoint: activeMovement.steeringPoint ?? null,
        }
      : { kind: null, steeringPoint: null }

    if (falling) {
      motion.runRequested = false
      physicsControllerRef.current?.setMovement({
        jump: false,
        run: false,
        worldDirection: null,
      })
      return
    }

    if (physicsMovement) {
      if (physicsMovement.doorId) {
        const openState = openLandrushIslandDoor(physicsMovement.doorId)
        if (openState === 'started') {
          recordLandrushIslandNavigationProbe({
            doorId: physicsMovement.doorId,
            kind: 'door-open-before-cross',
            steeringDistance: roundPerf(physicsMovement.steeringDistance ?? 0),
          })
        }
      }
      openApproachingLandrushIslandDoorPortal(
        motion.position,
        physicsMovement,
        activeNavigation.doorPortals,
      )
      physicsHeadingRef.current = physicsMovement.heading
      const runRequested =
        isRunPressed(pressedKeysRef.current) ||
        Boolean(gamepadInput?.run) ||
        physicsMovement.runAmount > 0.5
      motion.runRequested = runRequested
      physicsControllerRef.current?.setMovement({
        jump: jumpRequested,
        run: runRequested,
        speedScale: physicsMovement.intensity,
        worldDirection: { x: physicsMovement.x, z: physicsMovement.z },
      })
      return
    }

    motion.runRequested = false
    physicsControllerRef.current?.setMovement({
      jump: jumpRequested,
      run: false,
      worldDirection: null,
    })
  }, -2)

  useFrame((state, delta) => {
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
    const outsideSurface = !pointInPolygonOrNearEdge(
      rawNext,
      fallSurfacePointsRef.current,
      LANDRUSH_ISLAND_ROBOT_FALL_EDGE_TOLERANCE_METERS,
    )
    if (!fallStateRef.current && outsideSurface) {
      const fallDirection = resolveLandrushIslandFallBurstDirection(
        rawNext,
        lastFallDirectionRef.current,
        fallSurfacePointsRef.current,
      )
      const startRootPosition = new Vector3(
        physicsGroup.position.x,
        physicsGroup.position.y - LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT,
        physicsGroup.position.z,
      )
      const launchVelocity = resolveLandrushIslandFallLaunchVelocity({
        controllerVelocity: physicsControllerRef.current?.getLinVel(new Vector3()) ?? null,
        fallbackDirection: fallDirection,
        measuredVelocity: new Vector3(
          (rawNext.x - previousPhysics.x) / frameDelta,
          0,
          (rawNext.z - previousPhysics.z) / frameDelta,
        ),
      })
      fallStateRef.current = {
        elapsedSeconds: 0,
        position: startRootPosition,
        predictedWaterHitSeconds: predictLandrushIslandFallWaterHitSeconds({
          startRootY: startRootPosition.y,
          velocityY: launchVelocity.y,
          waterY,
        }),
        simulatedSeconds: 0,
        startRootY: startRootPosition.y,
        velocity: launchVelocity,
        waterY,
        waterReachedSeconds: null,
      }
      resetLandrushIslandFallControlRotation(
        fallControlQuaternionRef.current,
        fallControlAngularVelocityRef.current,
      )
      motion.falling = true
      motion.isMoving = false
      motion.runRequested = false
      motion.speed = 0
      clickMoveTargetRef.current = null
      gamepadJumpHeldRef.current = false
      physicsControllerRef.current?.setMovement({ worldDirection: null, run: false, jump: false })
      physicsControllerRef.current?.setLinVel(new Vector3(0, 0, 0))
      physicsControllerRef.current?.setPaused(true)
      setFallPresentationActive(true)
      updateFallPresentation({
        active: true,
        amount: 0,
        slowMotionFactor: LANDRUSH_ISLAND_ROBOT_FALL_INITIAL_SLOW_MOTION_FACTOR,
        wiggleAmount: 0,
      })
      recordLandrushIslandInputProbe({
        direction: [roundPerf(fallDirection.x), roundPerf(fallDirection.z)],
        forwardSpeed: roundPerf(Math.hypot(launchVelocity.x, launchVelocity.z)),
        kind: 'island-edge-fall-start',
        predictedWaterHitSeconds: roundPerf(fallStateRef.current.predictedWaterHitSeconds),
        reason: 'outside-surface',
        from: [roundPerf(previousPhysics.x), roundPerf(previousPhysics.z)],
        to: [roundPerf(rawNext.x), roundPerf(rawNext.z)],
        waterY: roundPerf(waterY),
      })
    }
    const fallState = fallStateRef.current
    let rootY = physicsGroup.position.y - LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT
    if (fallState) {
      fallState.elapsedSeconds += frameDelta
      updateLandrushIslandFallControlRotation({
        angularVelocity: fallControlAngularVelocityRef.current,
        axis: fallControlAxisRef.current,
        camera: state.camera,
        cameraForward: fallControlCameraForwardRef.current,
        cameraRight: fallControlCameraRightRef.current,
        cameraUp: fallControlCameraUpRef.current,
        deltaQuaternion: fallControlDeltaQuaternionRef.current,
        frameDelta,
        input: movementEnabled
          ? resolveLandrushIslandFallControlInput({
              gamepadInput: readLandrushGamepadInput(),
              keys: pressedKeysRef.current,
              pointer: rightHoldMoveRef.current,
            })
          : null,
        quaternion: fallControlQuaternionRef.current,
        targetAngularVelocity: fallControlTargetAngularVelocityRef.current,
      })
      const previousFallAmount = resolveLandrushIslandFallAltitudeAmount(
        fallState.position.y,
        fallState.startRootY,
        fallState.waterY,
      )
      const stepSlowMotionFactor = resolveLandrushIslandFallSlowMotionFactor(previousFallAmount)
      if (fallState.waterReachedSeconds === null) {
        const simulatedDelta = frameDelta * stepSlowMotionFactor
        fallState.simulatedSeconds += simulatedDelta
        fallState.velocity.y -= LANDRUSH_ISLAND_ROBOT_FALL_GRAVITY * simulatedDelta
        fallState.position.addScaledVector(fallState.velocity, simulatedDelta)
        if (fallState.position.y <= fallState.waterY) {
          fallState.position.y = fallState.waterY
          fallState.waterReachedSeconds = fallState.elapsedSeconds
        }
      }
      physicsGroup.position.set(
        fallState.position.x,
        fallState.position.y + LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT,
        fallState.position.z,
      )
      rawNext.x = fallState.position.x
      rawNext.z = fallState.position.z
      rootY = fallState.position.y
      const altitudeFallAmount = resolveLandrushIslandFallAltitudeAmount(
        rootY,
        fallState.startRootY,
        fallState.waterY,
      )
      const timeFallAmount = clamp01(
        fallState.elapsedSeconds / Math.max(0.001, fallState.predictedWaterHitSeconds),
      )
      const fallAmount = Math.max(altitudeFallAmount, timeFallAmount)
      const slowMotionFactor = resolveLandrushIslandFallSlowMotionFactor(fallAmount)
      updateFallPresentation({
        active: true,
        amount: fallAmount,
        slowMotionFactor,
        wiggleAmount: resolveLandrushIslandFallWiggleAmount(fallState.elapsedSeconds),
      })
      const waterHoldComplete =
        fallState.waterReachedSeconds !== null &&
        fallState.elapsedSeconds - fallState.waterReachedSeconds >=
          LANDRUSH_ISLAND_ROBOT_FALL_WATER_HOLD_SECONDS
      const predictedHitExpired =
        fallState.elapsedSeconds >=
        fallState.predictedWaterHitSeconds +
          LANDRUSH_ISLAND_ROBOT_FALL_WATER_HOLD_SECONDS +
          LANDRUSH_ISLAND_ROBOT_FALL_RESPAWN_FALLBACK_AFTER_HIT_SECONDS
      if (
        waterHoldComplete ||
        predictedHitExpired ||
        rootY <= groundY - LANDRUSH_ISLAND_ROBOT_FALL_RESPAWN_DROP_METERS
      ) {
        resetToSpawn()
        return
      }
    }
    lastPhysicsPositionRef.current.set(rawNext.x, groundY, rawNext.z)

    const previousMotionX = motion.position.x
    const previousMotionZ = motion.position.z
    targetMotionPositionRef.current.set(rawNext.x, rootY, rawNext.z)
    if (fallStateRef.current || fpvActive) {
      motion.position.copy(targetMotionPositionRef.current)
    } else {
      motion.position.lerp(
        targetMotionPositionRef.current,
        1 - Math.exp(-LANDRUSH_ISLAND_ROBOT_LOCAL_POSITION_RESPONSE * frameDelta),
      )
    }
    motion.velocity.set(
      (motion.position.x - previousMotionX) / frameDelta,
      0,
      (motion.position.z - previousMotionZ) / frameDelta,
    )
    motion.falling = fallStateRef.current !== null
    motion.speed = motion.falling ? 0 : Math.hypot(motion.velocity.x, motion.velocity.z)
    motion.isMoving = !motion.falling && motion.speed > 0.05
    motion.heading = lerpAngle(
      motion.heading,
      motion.isMoving ? physicsHeadingRef.current : motion.heading,
      clamp01(frameDelta * LANDRUSH_ISLAND_ROBOT_TURN_RESPONSE),
    )
    const now = window.performance.now()
    const grassInteraction = {
      radius: LANDRUSH_ISLAND_ROBOT_GRASS_INTERACTION_RADIUS,
      speed: motion.isMoving ? motion.speed : 0,
      strength: clamp01(
        LANDRUSH_ISLAND_ROBOT_GRASS_IDLE_BEND_STRENGTH +
          (motion.speed / LANDRUSH_ISLAND_ROBOT_GRASS_FULL_BEND_SPEED) *
            (1 - LANDRUSH_ISLAND_ROBOT_GRASS_IDLE_BEND_STRENGTH),
      ),
      x: motion.position.x,
      z: motion.position.z,
    }
    grassInteractionRef.current = grassInteraction
    if (now - lastGrassProbeAtRef.current >= 250) {
      lastGrassProbeAtRef.current = now
      recordLandrushIslandGrassProbe({
        centerLagMeters: Math.hypot(
          grassInteraction.x - motion.position.x,
          grassInteraction.z - motion.position.z,
        ),
        moving: motion.isMoving,
        physicsLagMeters: Math.hypot(motion.position.x - rawNext.x, motion.position.z - rawNext.z),
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
        if (trace.length > LANDRUSH_ISLAND_NAVIGATION_DEBUG_TRACE_POINTS) {
          trace.splice(0, trace.length - LANDRUSH_ISLAND_NAVIGATION_DEBUG_TRACE_POINTS)
        }
      }

      if (now - lastNavigationDebugAtRef.current >= LANDRUSH_ISLAND_NAVIGATION_DEBUG_UPDATE_MS) {
        lastNavigationDebugAtRef.current = now
        const snapshot = createLandrushIslandNavigationDebugSnapshot({
          active: activeNavigationDebugRef.current,
          clickTarget: clickMoveTargetRef.current,
          doorPortals,
          navigationObstacles,
          robot: { x: motion.position.x, y: motion.position.y, z: motion.position.z },
          stairPortals,
          trace,
        })
        setNavigationDebugSnapshot(snapshot)
        window.__LANDRUSH_ISLAND_NAV_DEBUG__ = snapshot
        if (
          navigationLiveScenario &&
          window.__LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__?.scenario === navigationLiveScenario
        ) {
          const capture = window.__LANDRUSH_ISLAND_NAV_LIVE_CAPTURE__
          capture.captures.push({
            elapsedMs: roundPerf(now - capture.startedAt),
            snapshot,
          })
          if (capture.captures.length > 360) {
            capture.captures.splice(0, capture.captures.length - 360)
          }
        }
        recordLandrushIslandNavigationProbe({
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

    writeMotionToLandrushIslandRobotNode(nodeRef.current, motion)

    if (now - lastSentAtRef.current >= LANDRUSH_ISLAND_LOCAL_STATE_SEND_INTERVAL_MS) {
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
          acceleration={LANDRUSH_ISLAND_ROBOT_ACCELERATION}
          airDragFactor={0.3}
          colliderCapsuleArgs={[
            LANDRUSH_ISLAND_ROBOT_CONTROLLER_CAPSULE_RADIUS,
            LANDRUSH_ISLAND_ROBOT_CONTROLLER_CAPSULE_LENGTH,
            4,
            8,
          ]}
          colliderMeshes={
            fallPresentationActive ? LANDRUSH_ISLAND_ROBOT_FALL_COLLIDER_MESHES : colliderMeshes
          }
          collisionCheckIteration={3}
          collisionPushBackDamping={0.1}
          collisionPushBackThreshold={0.001}
          debug={false}
          deceleration={LANDRUSH_ISLAND_ROBOT_DECELERATION}
          delay={0}
          fallGravityFactor={4}
          floatCheckType="BOTH"
          floatDampingC={36}
          floatHeight={LANDRUSH_ISLAND_ROBOT_CONTROLLER_FLOAT_HEIGHT}
          floatPullBackHeight={0.35}
          floatSensorRadius={0.15}
          floatSpringK={1200}
          gravity={9.81}
          jumpVel={6}
          maxRunSpeed={LANDRUSH_ISLAND_ROBOT_RUN_SPEED}
          maxSlope={1.2}
          maxWalkSpeed={LANDRUSH_ISLAND_ROBOT_WALK_SPEED}
          paused={!movementEnabled || fallPresentationActive}
          position={[spawn.x, groundY + LANDRUSH_ISLAND_ROBOT_PHYSICS_CENTER_FROM_ROOT, spawn.z]}
          ref={physicsControllerRef}
          slowMotionFactor={fallPresentationActive ? fallPresentation.slowMotionFactor : 1}
        />
      </KeyboardControls>
      {cameraEnabled ? (
        fpvActive ? (
          <LandrushIslandFirstPersonCameraRig
            buildCameraPoseRef={buildCameraPoseRef}
            mapReturnCameraPoseRef={mapReturnCameraPoseRef}
            motionRef={motionRef}
            playerCameraPoseRef={playerCameraPoseRef}
            playerReturnCameraPoseRef={playerReturnCameraPoseRef}
          />
        ) : (
          <LandrushIslandThirdPersonCameraRig
            buildCameraPoseRef={buildCameraPoseRef}
            controllerEnabled={movementEnabled}
            mapReturnCameraPoseRef={mapReturnCameraPoseRef}
            motionRef={motionRef}
            playerCameraPoseRef={playerCameraPoseRef}
            playerReturnCameraPoseRef={playerReturnCameraPoseRef}
          />
        )
      ) : null}
      <group visible={!fpvActive}>
        <Suspense
          fallback={
            effectivePresentationMode === 'hover' ? null : (
              <LandrushIslandRobotNodePrimitiveActor
                color={localProfile.color}
                fallControlRotation={fallControlQuaternionRef.current}
                fallIntensity={fallPresentation.wiggleAmount}
                fallMotionScale={fallPresentation.slowMotionFactor}
                node={nodeRef.current}
                presentationMode={effectivePresentationMode}
              />
            )
          }
        >
          <LandrushRobot
            framePriority={LANDRUSH_ISLAND_LOCAL_ROBOT_FRAME_PRIORITY}
            hoverOutlineWidthScale={buildRobotHovered ? 2 : 1}
            fallControlRotation={fallControlQuaternionRef.current}
            fallIntensity={fallPresentation.wiggleAmount}
            fallMotionScale={fallPresentation.slowMotionFactor}
            node={nodeRef.current}
            onAnimationState={recordLandrushIslandRobotAnimationProbe}
            onHoverPoseSample={recordLandrushIslandRobotHoverPoseProbe}
            presentationMode={effectivePresentationMode}
            visualRootRef={localRobotVisualRootRef}
          />
        </Suspense>
      </group>
      <LandrushRobotFootstepAudio
        groundY={groundY}
        motionRef={motionRef}
        runSpeed={LANDRUSH_ISLAND_ROBOT_RUN_SPEED}
        walkSpeed={LANDRUSH_ISLAND_ROBOT_WALK_SPEED}
      />
      {fpvActive ? null : (
        <LandrushIslandRobotPlayerBeacon
          color={localProfile.color}
          framePriority={LANDRUSH_ISLAND_LOCAL_BEACON_FRAME_PRIORITY}
          node={nodeRef.current}
          presentationMode={effectivePresentationMode}
          visualRootRef={localRobotVisualRootRef}
        />
      )}
      <LandrushIslandBuildRobotExitHotspot
        motionRef={motionRef}
        onExitBuildMode={onExitBuildMode}
        onHoverChange={setBuildRobotHovered}
        visible={effectivePresentationMode === 'hover'}
      />
      <LandrushIslandNavigationDebugOverlay
        enabled={navigationDebugEnabled}
        snapshot={navigationDebugSnapshot}
      />
    </>
  )
}

function createLandrushIslandNavigationDebugSnapshot({
  active,
  clickTarget,
  doorPortals,
  navigationObstacles,
  robot,
  stairPortals,
  trace,
}: {
  active: {
    kind: LandrushIslandNavigationSteeringKind | 'manual' | null
    steeringPoint: LandrushPoint2 | null
  }
  clickTarget: LandrushIslandMoveTarget | null
  doorPortals: readonly LandrushIslandDoorPortal[]
  navigationObstacles: readonly LandrushIslandNavigationObstacle[]
  robot: LandrushIslandNavigationDebugRobotPoint
  stairPortals: readonly LandrushIslandStairPortal[]
  trace: readonly LandrushPoint2[]
}): LandrushIslandNavigationDebugSnapshot {
  return {
    crossing: clickTarget?.route?.doorCrossing
      ? cloneLandrushIslandDoorCrossingState(clickTarget.route.doorCrossing)
      : null,
    doorPortals: doorPortals.map(cloneLandrushIslandDoorPortal),
    kind: active.kind,
    obstacles: navigationObstacles.map(cloneLandrushIslandNavigationObstacle),
    robot: cloneLandrushIslandNavigationDebugRobotPoint(robot),
    stairPortals: stairPortals.map(cloneLandrushIslandStairPortal),
    steeringPoint: active.steeringPoint ? clonePoint2(active.steeringPoint) : null,
    target: clickTarget ? clonePoint2(clickTarget.point) : null,
    trace: trace.map(clonePoint2),
  }
}

function cloneLandrushIslandNavigationDebugRobotPoint(
  point: LandrushIslandNavigationDebugRobotPoint,
): LandrushIslandNavigationDebugRobotPoint {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
  }
}

function cloneLandrushIslandNavigationObstacle(
  obstacle: LandrushIslandNavigationObstacle,
): LandrushIslandNavigationObstacle {
  return {
    kind: obstacle.kind,
    levelId: obstacle.levelId,
    nodeId: obstacle.nodeId,
    points: obstacle.points.map(clonePoint2),
    stairId: obstacle.stairId,
  }
}

function cloneLandrushIslandDoorPortal(portal: LandrushIslandDoorPortal): LandrushIslandDoorPortal {
  return {
    center: clonePoint2(portal.center),
    doorId: portal.doorId,
    halfWidth: portal.halfWidth,
    levelId: portal.levelId,
    normal: clonePoint2(portal.normal),
    sideA: clonePoint2(portal.sideA),
    sideB: clonePoint2(portal.sideB),
    tangent: clonePoint2(portal.tangent),
  }
}

function cloneLandrushIslandStairPortal(
  portal: LandrushIslandStairPortal,
): LandrushIslandStairPortal {
  return {
    center: clonePoint2(portal.center),
    halfRun: portal.halfRun,
    halfWidth: portal.halfWidth,
    levelId: portal.levelId,
    nodeId: portal.nodeId,
    normal: clonePoint2(portal.normal),
    sideA: clonePoint2(portal.sideA),
    sideB: clonePoint2(portal.sideB),
    stairId: portal.stairId,
    tangent: clonePoint2(portal.tangent),
  }
}

function createLandrushIslandNavigationLiveScenarioDefinition(
  spawn: LandrushPoint2,
  scenario: LandrushIslandNavigationLiveScenarioKind,
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
        children: [LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_DOOR_ID],
        frontSide: 'unknown',
        height: 2.5,
        id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
        id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_ROOM_EAST_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
        id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_ROOM_SOUTH_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
        id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_ROOM_NORTH_WALL_ID,
        metadata: { landrushNavigationLiveScenario: true },
        object: 'node',
        parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
        id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_DOOR_ID,
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
        parentId: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID,
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
        wallId: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID,
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
      children: [LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_DOOR_ID],
      frontSide: 'unknown',
      height: 2.5,
      id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
      id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_DOOR_ID,
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
      parentId: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID,
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
      wallId: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_WALL_ID,
      width: 1,
    } as AnyNode,
    {
      children: [LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID],
      fillToFloor: true,
      fromLevelId: null,
      id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_ID,
      innerRadius: 0.9,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      openingOffset: 0,
      parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
      id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_SEGMENT_ID,
      length: 3,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      parentId: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_ID,
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
      id: LANDRUSH_ISLAND_NAVIGATION_LIVE_SCENARIO_STAIR_TOP_SLAB_ID,
      metadata: { landrushNavigationLiveScenario: true },
      object: 'node',
      parentId: LANDRUSH_ISLAND_LEVEL_ID,
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

function applyLandrushIslandNavigationLiveScenarioNodes(nodes: readonly AnyNode[]) {
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

function LandrushIslandNavigationDebugOverlay({
  enabled,
  snapshot,
}: {
  enabled: boolean
  snapshot: LandrushIslandNavigationDebugSnapshot | null
}) {
  if (!enabled || !snapshot) return null

  const width = 430
  const height = 320
  const padding = 24
  const project = createLandrushIslandNavigationDebugProjector(snapshot, width, height, padding)
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

function createLandrushIslandNavigationDebugProjector(
  snapshot: LandrushIslandNavigationDebugSnapshot,
  width: number,
  height: number,
  padding: number,
) {
  const points = collectLandrushIslandNavigationDebugPoints(snapshot)
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

function collectLandrushIslandNavigationDebugPoints(
  snapshot: LandrushIslandNavigationDebugSnapshot,
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

function navigationDebugObstacleFill(kind: LandrushIslandNavigationObstacle['kind']) {
  if (kind === 'stair') return 'rgba(168,85,247,0.18)'
  if (kind === 'asset') return 'rgba(148,163,184,0.14)'
  return 'rgba(100,116,139,0.2)'
}

function navigationDebugObstacleStroke(kind: LandrushIslandNavigationObstacle['kind']) {
  if (kind === 'stair') return '#a855f7'
  if (kind === 'asset') return '#94a3b8'
  return '#64748b'
}

function RemoteSpatialVoiceRangeRing({
  color,
  groundY,
  playerId,
  remotePlayerStore,
  visible,
}: {
  color: string
  groundY: number
  playerId: string
  remotePlayerStore: MultiplayerRemotePlayerStore
  visible: boolean
}) {
  const positionRef = useRef<readonly [number, number, number] | null>(
    remotePlayerStore.getSnapshot(playerId)?.position ?? null,
  )

  useFrame(() => {
    positionRef.current = remotePlayerStore.getSnapshot(playerId)?.position ?? null
  })

  return (
    <SpatialVoiceRangeRing
      color={color}
      groundY={groundY}
      positionRef={positionRef}
      visible={visible}
    />
  )
}

function RemoteLandrushIslandRobot({
  baseNode,
  groundY,
  player,
  remotePlayerStore,
}: {
  baseNode: LandrushIslandLayoutNode
  groundY: number
  player: MultiplayerPlayerSnapshot
  remotePlayerStore: MultiplayerRemotePlayerStore
}) {
  const nodeRef = useRef<LandrushWorldNode>(
    createLandrushIslandRobotActorNode(baseNode, player.id, snapshotPoint(player), groundY),
  )
  const positionRef = useRef(new Vector3(player.position[0], groundY, player.position[2]))
  const targetPositionRef = useRef(new Vector3(player.position[0], groundY, player.position[2]))
  const headingRef = useRef(player.heading)
  const targetHeadingRef = useRef(player.heading)
  const visualRootRef = useRef<Group | null>(null)
  const presentationMode: LandrushRobotPresentationMode =
    player.pose === 'falling' ? 'fall' : 'default'

  useEffect(() => {
    targetPositionRef.current.set(
      player.position[0],
      player.position[1] || groundY,
      player.position[2],
    )
    targetHeadingRef.current = player.heading
  }, [groundY, player])

  useFrame((_, delta) => {
    const livePlayer = remotePlayerStore.getSnapshot(player.id) ?? player
    targetPositionRef.current.set(
      livePlayer.position[0],
      livePlayer.position[1] || groundY,
      livePlayer.position[2],
    )
    targetHeadingRef.current = livePlayer.heading

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionAmount = 1 - Math.exp(-LANDRUSH_ISLAND_REMOTE_POSITION_RESPONSE * frameDelta)
    const headingAmount = 1 - Math.exp(-LANDRUSH_ISLAND_REMOTE_HEADING_RESPONSE * frameDelta)

    positionRef.current.lerp(targetPositionRef.current, positionAmount)
    headingRef.current = lerpAngle(headingRef.current, targetHeadingRef.current, headingAmount)

    const node = nodeRef.current
    node.playerPosition = [
      positionRef.current.x,
      positionRef.current.y || groundY,
      positionRef.current.z,
    ]
    node.playerHeading = headingRef.current
    node.playerMoving = livePlayer.moving
    node.playerSpeed = livePlayer.speed
  })

  return (
    <>
      <Suspense
        fallback={
          <LandrushIslandRobotNodePrimitiveActor
            color={player.color}
            node={nodeRef.current}
            presentationMode={presentationMode}
          />
        }
      >
        <LandrushRobot
          framePriority={LANDRUSH_ISLAND_REMOTE_ROBOT_FRAME_PRIORITY}
          node={nodeRef.current}
          presentationMode={presentationMode}
          visualRootRef={visualRootRef}
        />
      </Suspense>
      <LandrushIslandRobotPlayerBeacon
        color={player.color}
        framePriority={LANDRUSH_ISLAND_REMOTE_BEACON_FRAME_PRIORITY}
        node={nodeRef.current}
        presentationMode={presentationMode}
        visualRootRef={visualRootRef}
      />
    </>
  )
}

function LandrushIslandMapCameraRig({
  active,
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  playerCameraPoseRef,
}: {
  active: boolean
  mapCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapTransitionStartPoseRef: { current: LandrushIslandCameraPose | null }
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
}) {
  const controlsTarget = useMemo(() => new Vector3(...LANDRUSH_ISLAND_MAP_CAMERA_TARGET), [])
  const [controlsEnabled, setControlsEnabled] = useState(false)
  const handleMapCameraSettled = useCallback(
    (pose: LandrushIslandCameraPose) => {
      mapCameraPoseRef.current = cloneLandrushIslandCameraPose(pose)
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
    writeLandrushIslandCameraPose(
      mapCameraPoseRef,
      state.camera,
      controls?.target ?? controlsTarget,
    )
    recordLandrushIslandCameraProbe({
      camera: state.camera,
      mode: 'map',
      source: 'map-camera',
      target: controls?.target ?? controlsTarget,
    })
  })

  return (
    <>
      {active && controlsEnabled ? (
        <OrbitControls
          dampingFactor={0.08}
          enableDamping
          enablePan
          enableRotate
          enableZoom
          makeDefault
          maxDistance={LANDRUSH_ISLAND_MAP_CAMERA_MAX_DISTANCE}
          minDistance={LANDRUSH_ISLAND_MAP_CAMERA_MIN_DISTANCE}
          onChange={() => renderScheduler.requestFrame('camera:move')}
          onEnd={() => renderScheduler.requestFrame('camera:end')}
          onStart={() => renderScheduler.requestFrame('camera:start')}
          target={controlsTarget}
          zoomSpeed={0.0375}
        />
      ) : null}
      <LandrushIslandMapCameraTransition
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

function useLandrushIslandExplicitCameraTransitionClock({
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

function createLandrushIslandCameraPoseTransition({
  camera,
  startPosition,
  startQuaternion = camera.quaternion,
  startTarget,
  targetPose,
}: {
  camera: Camera
  startPosition: Vector3
  startQuaternion?: Quaternion
  startTarget: Vector3
  targetPose: LandrushIslandCameraPose
}): LandrushIslandCameraPoseTransition {
  const targetQuaternion = targetPose.quaternion.clone()

  return {
    elapsed: 0,
    startPosition: startPosition.clone(),
    startQuaternion: startQuaternion.clone(),
    startTarget: startTarget.clone(),
    targetPose: cloneLandrushIslandCameraPose(targetPose) ?? targetPose,
    targetQuaternion,
  }
}

function stepLandrushIslandCameraPoseTransition({
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
  mode: LandrushIslandRuntimeCameraSample['mode']
  poseRef: { current: LandrushIslandCameraPose | null }
  source: string
  target: Vector3
  transition: LandrushIslandCameraPoseTransition
}) {
  const nextElapsed = elapsedSeconds
  transition.elapsed =
    LANDRUSH_ISLAND_CAMERA_TRANSITION_SECONDS - nextElapsed <=
    LANDRUSH_ISLAND_CAMERA_TRANSITION_COMPLETION_EPSILON_SECONDS
      ? LANDRUSH_ISLAND_CAMERA_TRANSITION_SECONDS
      : nextElapsed
  const progress = clamp01(transition.elapsed / LANDRUSH_ISLAND_CAMERA_TRANSITION_SECONDS)
  const amount = easeLandrushIslandCameraTransition(progress, mode)
  camera.position.lerpVectors(transition.startPosition, transition.targetPose.position, amount)
  target.lerpVectors(transition.startTarget, transition.targetPose.target, amount)
  camera.quaternion.slerpQuaternions(
    transition.startQuaternion,
    transition.targetQuaternion,
    amount,
  )
  camera.updateMatrixWorld()

  writeLandrushIslandCameraPose(poseRef, camera, target)
  recordLandrushIslandCameraProbe({
    camera,
    mode,
    progress,
    source,
    target,
  })

  return progress
}

function finishLandrushIslandCameraPoseTransition({
  camera,
  poseRef,
  target,
  transition,
}: {
  camera: Camera
  poseRef: { current: LandrushIslandCameraPose | null }
  target: Vector3
  transition: LandrushIslandCameraPoseTransition
}) {
  camera.position.copy(transition.targetPose.position)
  target.copy(transition.targetPose.target)
  camera.quaternion.copy(transition.targetQuaternion)
  camera.updateMatrixWorld()
  writeLandrushIslandCameraPose(poseRef, camera, target)
}

function LandrushIslandMapCameraTransition({
  active,
  controlsTarget,
  mapCameraPoseRef,
  mapTransitionStartPoseRef,
  onSettled,
  playerCameraPoseRef,
}: {
  active: boolean
  controlsTarget: Vector3
  mapCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapTransitionStartPoseRef: { current: LandrushIslandCameraPose | null }
  onSettled: (pose: LandrushIslandCameraPose) => void
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
}) {
  const settledRef = useRef(false)
  const startTargetRef = useRef(new Vector3())
  const desiredRef = useRef(new Vector3(...LANDRUSH_ISLAND_MAP_CAMERA_POSITION))
  const targetRef = useRef(new Vector3(...LANDRUSH_ISLAND_MAP_CAMERA_TARGET))
  const forwardRef = useRef(new Vector3())
  const transitionRef = useRef<LandrushIslandCameraPoseTransition | null>(null)

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
          : resolveLandrushIslandBuildCameraStartTarget(
              state.camera,
              target.y,
              startTargetRef.current,
              forwardRef.current,
            ).clone()
        const currentPosition = state.camera.position.clone()
        const currentQuaternion = state.camera.quaternion.clone()
        state.camera.position.copy(desiredRef.current)
        state.camera.lookAt(target)
        const targetPose = createLandrushIslandCameraPose(state.camera, target)
        state.camera.position.copy(currentPosition)
        state.camera.quaternion.copy(currentQuaternion)
        state.camera.updateMatrixWorld()

        transition = createLandrushIslandCameraPoseTransition({
          camera: state.camera,
          startPosition,
          startQuaternion: rememberedPose?.quaternion,
          startTarget,
          targetPose,
        })
        transitionRef.current = transition
        controlsTarget.copy(startTarget)
        writeLandrushIslandCameraPose(mapCameraPoseRef, state.camera, controlsTarget)
      }

      const progress = stepLandrushIslandCameraPoseTransition({
        camera: state.camera,
        elapsedSeconds,
        mode: 'map',
        poseRef: mapCameraPoseRef,
        source: 'map-transition',
        target: controlsTarget,
        transition,
      })

      if (progress < 1) return false

      finishLandrushIslandCameraPoseTransition({
        camera: state.camera,
        poseRef: mapCameraPoseRef,
        target: controlsTarget,
        transition,
      })
      settledRef.current = true
      transitionRef.current = null
      const finalPose =
        cloneLandrushIslandCameraPose(mapCameraPoseRef.current) ??
        createLandrushIslandCameraPose(state.camera, controlsTarget)
      onSettled(finalPose)
      renderScheduler.requestFrame('camera:end')
      return true
    },
    [controlsTarget, mapCameraPoseRef, mapTransitionStartPoseRef, onSettled, playerCameraPoseRef],
  )

  useLandrushIslandExplicitCameraTransitionClock({
    active,
    onFrame: stepTransition,
    onInactive: resetTransition,
  })

  return null
}

function LandrushIslandThirdPersonCameraRig({
  buildCameraPoseRef,
  controllerEnabled,
  mapReturnCameraPoseRef,
  motionRef,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  controllerEnabled: boolean
  mapReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  motionRef: { current: RobotMotion }
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  playerReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
}) {
  const handleReturnSettled = useCallback(() => {
    mapReturnCameraPoseRef.current = null
  }, [mapReturnCameraPoseRef])

  if (!controllerEnabled) return null

  return (
    <LandrushIslandThirdPersonCameraController
      buildCameraPoseRef={buildCameraPoseRef}
      mapReturnCameraPoseRef={mapReturnCameraPoseRef}
      motionRef={motionRef}
      onReturnSettled={handleReturnSettled}
      playerCameraPoseRef={playerCameraPoseRef}
      playerReturnCameraPoseRef={playerReturnCameraPoseRef}
    />
  )
}

function LandrushIslandFirstPersonCameraRig({
  buildCameraPoseRef,
  mapReturnCameraPoseRef,
  motionRef,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  motionRef: { current: RobotMotion }
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  playerReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
}) {
  return (
    <LandrushIslandFirstPersonCameraController
      buildCameraPoseRef={buildCameraPoseRef}
      mapReturnCameraPoseRef={mapReturnCameraPoseRef}
      motionRef={motionRef}
      playerCameraPoseRef={playerCameraPoseRef}
      playerReturnCameraPoseRef={playerReturnCameraPoseRef}
    />
  )
}

function LandrushIslandFirstPersonCameraController({
  buildCameraPoseRef,
  mapReturnCameraPoseRef,
  motionRef,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  motionRef: { current: RobotMotion }
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  playerReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
}) {
  const { gl } = useThree()
  const seededRef = useRef(false)
  const targetYawRef = useRef(0)
  const targetPitchRef = useRef(0)
  const forwardRef = useRef(new Vector3())
  const targetRef = useRef(new Vector3())
  const cameraPositionRef = useRef(new Vector3())

  useEffect(() => {
    buildCameraPoseRef.current = null
    mapReturnCameraPoseRef.current = null
    playerReturnCameraPoseRef.current = null
    requestLandrushIslandPointerLock(gl.domElement)
  }, [buildCameraPoseRef, gl, mapReturnCameraPoseRef, playerReturnCameraPoseRef])

  useEffect(() => {
    const canvas = gl.domElement
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        !pointerEventInLandrushIslandCanvas(event, canvas) ||
        isLandrushIslandInteractivePointerTarget(event.target)
      ) {
        return
      }

      requestLandrushIslandPointerLock(canvas)
    }
    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return

      event.preventDefault()
      event.stopPropagation()
      targetYawRef.current -= event.movementX * LANDRUSH_ISLAND_ROBOT_FPV_MOUSE_YAW_SPEED
      targetPitchRef.current = clamp(
        targetPitchRef.current - event.movementY * LANDRUSH_ISLAND_ROBOT_FPV_MOUSE_PITCH_SPEED,
        -LANDRUSH_ISLAND_ROBOT_FPV_PITCH_LIMIT,
        LANDRUSH_ISLAND_ROBOT_FPV_PITCH_LIMIT,
      )
      renderScheduler.requestFrame('camera:move')
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false })
    window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('mousemove', handleMouseMove, true)
    }
  }, [gl])

  useFrame((state, delta) => {
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const motion = motionRef.current

    if (!seededRef.current) {
      targetYawRef.current = motion.heading
      targetPitchRef.current = 0
      seededRef.current = true
    }

    const gamepadInput = readLandrushGamepadInput()
    if (gamepadInput && gamepadInput.lookStrength > 0) {
      targetYawRef.current -=
        gamepadInput.lookX * LANDRUSH_ISLAND_GAMEPAD_CAMERA_YAW_SPEED * frameDelta
      targetPitchRef.current = clamp(
        targetPitchRef.current +
          gamepadInput.lookY * LANDRUSH_ISLAND_GAMEPAD_CAMERA_PITCH_SPEED * frameDelta,
        -LANDRUSH_ISLAND_ROBOT_FPV_PITCH_LIMIT,
        LANDRUSH_ISLAND_ROBOT_FPV_PITCH_LIMIT,
      )
    }

    const yaw = targetYawRef.current
    const pitch = targetPitchRef.current
    const pitchCos = Math.cos(pitch)
    forwardRef.current.set(Math.sin(yaw) * pitchCos, Math.sin(pitch), Math.cos(yaw) * pitchCos)
    cameraPositionRef.current.set(
      motion.position.x + Math.sin(yaw) * LANDRUSH_ISLAND_ROBOT_FPV_FORWARD_OFFSET,
      motion.position.y + LANDRUSH_ISLAND_ROBOT_FPV_EYE_HEIGHT,
      motion.position.z + Math.cos(yaw) * LANDRUSH_ISLAND_ROBOT_FPV_FORWARD_OFFSET,
    )
    targetRef.current.copy(cameraPositionRef.current).add(forwardRef.current)

    state.camera.up.set(0, 1, 0)
    state.camera.position.copy(cameraPositionRef.current)
    state.camera.lookAt(targetRef.current)
    state.camera.updateMatrixWorld()
    writeLandrushIslandCameraPose(playerCameraPoseRef, state.camera, targetRef.current)

    if (motion.isMoving || gamepadInput?.lookStrength) renderScheduler.requestFrame('camera:move')
    recordLandrushIslandCameraProbe({
      camera: state.camera,
      mode: 'player',
      source: 'fpv-camera',
      target: targetRef.current,
    })
  }, 2)

  return null
}

function LandrushIslandThirdPersonCameraController({
  buildCameraPoseRef,
  mapReturnCameraPoseRef,
  motionRef,
  onReturnSettled,
  playerCameraPoseRef,
  playerReturnCameraPoseRef,
}: {
  buildCameraPoseRef: { current: LandrushIslandCameraPose | null }
  mapReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
  motionRef: { current: RobotMotion }
  onReturnSettled: () => void
  playerCameraPoseRef: { current: LandrushIslandCameraPose | null }
  playerReturnCameraPoseRef: { current: LandrushIslandCameraPose | null }
}) {
  const { gl } = useThree()
  const cameraDistanceRef = useRef(LANDRUSH_ISLAND_ISOMETRIC_CAMERA_DISTANCE)
  const cameraPitchRef = useRef(LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH)
  const targetCameraPitchRef = useRef(LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH)
  const cameraYawRef = useRef(LANDRUSH_ISLAND_ISOMETRIC_CAMERA_INITIAL_YAW)
  const targetCameraYawRef = useRef(LANDRUSH_ISLAND_ISOMETRIC_CAMERA_INITIAL_YAW)
  const orbitKeysRef = useRef({ clockwise: false, counterClockwise: false })
  const pitchDragRef = useRef<{
    id: number
    moved: boolean
    pitch: number
    x: number
    y: number
    yaw: number
  } | null>(null)
  const pinchZoomRef = useRef<{
    cameraDistance: number
    distance: number
  } | null>(null)
  const pendingPitchDragPointRef = useRef<{ x: number; y: number } | null>(null)
  const pitchDragAnimationFrameRef = useRef(0)
  const desiredCameraPositionRef = useRef(new Vector3())
  const targetRef = useRef(new Vector3())
  const previousTargetRef = useRef<Vector3 | null>(null)
  const returnTargetRef = useRef(new Vector3())
  const returnForwardRef = useRef(new Vector3())
  const returnTransitionRef = useRef<LandrushIslandCameraPoseTransition | null>(null)
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
        cameraDistanceRef.current *
        Math.exp(event.deltaY * LANDRUSH_ISLAND_ISOMETRIC_CAMERA_ZOOM_STEP)
      cameraDistanceRef.current = clamp(
        nextDistance,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
      )
    }

    canvas.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel, true)
  }, [gl])

  useEffect(() => {
    const canvas = gl.domElement
    const getTouchDistance = (touches: TouchList) => {
      const first = touches.item(0)
      const second = touches.item(1)
      if (!(first && second)) return null
      return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
    }
    const handleTouch = (event: TouchEvent) => {
      if (event.defaultPrevented || event.target !== canvas) return
      const distance = getTouchDistance(event.touches)
      if (distance === null) {
        pinchZoomRef.current = null
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pitchDragRef.current = null

      if (!pinchZoomRef.current) {
        pinchZoomRef.current = {
          cameraDistance: cameraDistanceRef.current,
          distance,
        }
        setCameraMotionActive(true)
        return
      }

      const nextDistance =
        pinchZoomRef.current.cameraDistance * (pinchZoomRef.current.distance / distance)
      cameraDistanceRef.current = clamp(
        nextDistance,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
      )
      renderScheduler.requestFrame('camera:move')
    }
    const handleTouchEnd = () => {
      pinchZoomRef.current = null
    }

    canvas.addEventListener('touchstart', handleTouch, { capture: true, passive: false })
    window.addEventListener('touchmove', handleTouch, { capture: true, passive: false })
    window.addEventListener('touchend', handleTouchEnd, true)
    window.addEventListener('touchcancel', handleTouchEnd, true)
    return () => {
      canvas.removeEventListener('touchstart', handleTouch, true)
      window.removeEventListener('touchmove', handleTouch, true)
      window.removeEventListener('touchend', handleTouchEnd, true)
      window.removeEventListener('touchcancel', handleTouchEnd, true)
      pinchZoomRef.current = null
    }
  }, [gl, setCameraMotionActive])

  useEffect(() => {
    const canvas = gl.domElement
    const applyPendingPitchDrag = () => {
      pitchDragAnimationFrameRef.current = 0
      const drag = pitchDragRef.current
      const point = pendingPitchDragPointRef.current
      pendingPitchDragPointRef.current = null
      if (!(drag && point)) return

      targetCameraYawRef.current =
        drag.yaw - (point.x - drag.x) * LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_DRAG_SPEED
      targetCameraPitchRef.current = clamp(
        drag.pitch + (point.y - drag.y) * LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH_DRAG_SPEED,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_PITCH,
      )
      renderScheduler.requestFrame('camera:move')
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.pointerType === 'touch' ||
        !pointerEventInLandrushIslandCanvas(event, canvas) ||
        isLandrushIslandInteractivePointerTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      window.cancelAnimationFrame(pitchDragAnimationFrameRef.current)
      pitchDragAnimationFrameRef.current = 0
      pendingPitchDragPointRef.current = null
      pitchDragRef.current = {
        id: event.pointerId,
        moved: false,
        pitch: targetCameraPitchRef.current,
        x: event.clientX,
        y: event.clientY,
        yaw: targetCameraYawRef.current,
      }
      setCameraMotionActive(true)
    }
    const handlePointerMove = (event: PointerEvent) => {
      const drag = pitchDragRef.current
      if (!drag || drag.id !== event.pointerId) return

      event.preventDefault()
      event.stopPropagation()
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 2) drag.moved = true
      const coalescedEvents = event.getCoalescedEvents?.()
      const latestEvent = coalescedEvents?.[coalescedEvents.length - 1] ?? event
      pendingPitchDragPointRef.current = { x: latestEvent.clientX, y: latestEvent.clientY }
      if (pitchDragAnimationFrameRef.current === 0) {
        pitchDragAnimationFrameRef.current = window.requestAnimationFrame(applyPendingPitchDrag)
      }
    }
    const handlePointerEnd = (event: PointerEvent) => {
      const drag = pitchDragRef.current
      if (!drag || drag.id !== event.pointerId) return
      if (drag.moved) {
        event.preventDefault()
        event.stopPropagation()
      }
      window.cancelAnimationFrame(pitchDragAnimationFrameRef.current)
      applyPendingPitchDrag()
      pitchDragRef.current = null
      pendingPitchDragPointRef.current = null
      renderScheduler.requestFrame('camera:move')
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false })
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
      window.cancelAnimationFrame(pitchDragAnimationFrameRef.current)
      pitchDragAnimationFrameRef.current = 0
      pendingPitchDragPointRef.current = null
      pitchDragRef.current = null
    }
  }, [gl, setCameraMotionActive])

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
        motion.position.y + LANDRUSH_ISLAND_ROBOT_CAMERA_TARGET_HEIGHT,
        motion.position.z,
      )
      let transition = returnTransitionRef.current

      if (!transition) {
        const returnPose = playerReturnCameraPoseRef.current
        if (!returnPose) {
          returnTransitionRunningRef.current = false
          return true
        }

        const buildPose = cloneLandrushIslandCameraPose(
          mapReturnCameraPoseRef.current ?? buildCameraPoseRef.current,
        )
        const startTarget =
          buildPose?.target.clone() ??
          resolveLandrushIslandBuildCameraStartTarget(
            state.camera,
            target.y,
            returnTargetRef.current,
            returnForwardRef.current,
          ).clone()
        const targetPose = mapReturnCameraPoseRef.current
          ? resolveLandrushIslandPlayerReturnTargetPose(
              returnPose,
              target,
              desiredCameraPositionRef.current,
            )
          : (cloneLandrushIslandCameraPose(returnPose) ??
            createLandrushIslandCameraPose(state.camera, target))

        transition = createLandrushIslandCameraPoseTransition({
          camera: state.camera,
          startPosition: buildPose?.position.clone() ?? state.camera.position.clone(),
          startQuaternion: buildPose?.quaternion,
          startTarget,
          targetPose,
        })
        returnTransitionRef.current = transition
        returnTransitionRunningRef.current = true
        returnTargetRef.current.copy(transition.startTarget)
        state.camera.position.copy(transition.startPosition)
        state.camera.quaternion.copy(transition.startQuaternion)
        state.camera.updateMatrixWorld()
        writeLandrushIslandCameraPose(playerCameraPoseRef, state.camera, transition.startTarget)
      }

      renderScheduler.requestFrame('camera:move')
      const progress = stepLandrushIslandCameraPoseTransition({
        camera: state.camera,
        elapsedSeconds,
        mode: 'player',
        poseRef: playerCameraPoseRef,
        source: 'player-return-transition',
        target: returnTargetRef.current,
        transition,
      })

      if (progress < 1) return false

      finishLandrushIslandCameraPoseTransition({
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
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
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

  useLandrushIslandExplicitCameraTransitionClock({
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
      motion.position.y + LANDRUSH_ISLAND_ROBOT_CAMERA_TARGET_HEIGHT,
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
          : LANDRUSH_ISLAND_ISOMETRIC_CAMERA_INITIAL_YAW
      const storedDistance = playerCameraPoseRef.current?.distance
      const storedPitch = playerCameraPoseRef.current?.pitch
      const pitch =
        typeof storedPitch === 'number' && Number.isFinite(storedPitch)
          ? clamp(
              storedPitch,
              LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH,
              LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_PITCH,
            )
          : LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH
      cameraYawRef.current = yaw
      targetCameraYawRef.current = yaw
      cameraPitchRef.current = pitch
      targetCameraPitchRef.current = pitch
      cameraDistanceRef.current =
        typeof storedDistance === 'number' && Number.isFinite(storedDistance)
          ? clamp(
              storedDistance,
              LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
              LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
            )
          : LANDRUSH_ISLAND_ISOMETRIC_CAMERA_DISTANCE
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
      writeLandrushIslandCameraPose(playerCameraPoseRef, state.camera, target)
      setCameraMotionActive(true)
      renderScheduler.requestFrame('camera:move')
      return
    }

    const followAmount = 1 - Math.exp(-LANDRUSH_ISLAND_ROBOT_CAMERA_FOLLOW_RESPONSE * frameDelta)
    const yawInput =
      Number(orbitKeysRef.current.counterClockwise) - Number(orbitKeysRef.current.clockwise)
    const gamepadInput = readLandrushGamepadInput()
    const gamepadLookActive = Boolean(gamepadInput && gamepadInput.lookStrength > 0)
    const targetShiftSq = previousTarget.distanceToSquared(target)
    if (yawInput !== 0) {
      targetCameraYawRef.current +=
        yawInput * LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_SPEED * frameDelta
    }
    if (gamepadLookActive && gamepadInput) {
      targetCameraYawRef.current -=
        gamepadInput.lookX * LANDRUSH_ISLAND_GAMEPAD_CAMERA_YAW_SPEED * frameDelta
      targetCameraPitchRef.current = clamp(
        targetCameraPitchRef.current +
          gamepadInput.lookY * LANDRUSH_ISLAND_GAMEPAD_CAMERA_PITCH_SPEED * frameDelta,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_PITCH,
      )
    }
    cameraYawRef.current = lerpAngle(
      cameraYawRef.current,
      targetCameraYawRef.current,
      1 - Math.exp(-LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_RESPONSE * frameDelta),
    )
    cameraPitchRef.current = MathUtils.damp(
      cameraPitchRef.current,
      targetCameraPitchRef.current,
      LANDRUSH_ISLAND_ISOMETRIC_CAMERA_YAW_RESPONSE,
      frameDelta,
    )
    cameraDistanceRef.current = clamp(
      cameraDistanceRef.current,
      LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
      LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
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
    writeLandrushIslandCameraPose(playerCameraPoseRef, state.camera, previousTarget)
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
      gamepadLookActive ||
      pitchDragRef.current !== null ||
      pinchZoomRef.current !== null ||
      targetShiftSq > 0.000001 ||
      cameraShiftSq > 0.000001 ||
      yawSettling > 0.0001 ||
      pitchSettling > 0.0001
    setCameraMotionActive(activeCameraMotion)
    if (activeCameraMotion) renderScheduler.requestFrame('camera:move')
    recordLandrushIslandCameraProbe({
      camera: state.camera,
      mode: 'player',
      source: 'player-camera',
      target: previousTarget,
    })
  }, 2)

  return null
}

function LandrushIslandRobotNodePrimitiveActor({
  color,
  fallControlRotation,
  fallIntensity = 1,
  fallMotionScale = 1,
  node,
  presentationMode = 'default',
}: {
  color: string
  fallControlRotation?: Quaternion
  fallIntensity?: number
  fallMotionScale?: number
  node: LandrushWorldNode
  presentationMode?: LandrushRobotPresentationMode
}) {
  const groupRef = useRef<Group>(null!)
  const fallPivotRef = useRef<Group>(null!)
  const hoverAmountRef = useRef(0)
  const fallAmountRef = useRef(0)
  const fallSpinRef = useRef(0)
  const headingQuaternionRef = useRef(new Quaternion())
  const fallControlQuaternionRef = useRef(new Quaternion())
  const fallProceduralEulerRef = useRef(new Euler())
  const fallProceduralQuaternionRef = useRef(new Quaternion())

  useFrame(({ clock }, delta) => {
    const frameDelta = Math.min(delta, 0.05)
    hoverAmountRef.current = MathUtils.damp(
      hoverAmountRef.current,
      presentationMode === 'hover' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      frameDelta,
    )
    fallAmountRef.current = MathUtils.damp(
      fallAmountRef.current,
      presentationMode === 'fall' ? 1 : 0,
      LANDRUSH_ROBOT_HOVER_RESPONSE,
      frameDelta,
    )
    if (fallAmountRef.current > 0.0001) {
      fallSpinRef.current +=
        frameDelta * MathUtils.clamp(fallMotionScale, 0.05, 1) * (1.2 + fallAmountRef.current)
    } else {
      fallSpinRef.current = 0
    }
    const hoverOffset = resolveLandrushRobotHoverOffset(hoverAmountRef.current, clock.elapsedTime)
    const fallAmount = fallAmountRef.current
    const looseAmount = MathUtils.smoothstep(clamp01(fallIntensity), 0, 1)
    const fallPitch =
      (-0.9 + Math.sin(fallSpinRef.current * 1.4) * (0.12 + looseAmount * 0.36)) * fallAmount
    const fallYaw = Math.sin(fallSpinRef.current * 0.65) * (0.22 + looseAmount * 0.48) * fallAmount
    const fallRoll =
      (0.98 + Math.sin(fallSpinRef.current) * (0.18 + looseAmount * 0.46)) * fallAmount
    const group = groupRef.current
    group?.position.set(
      node.playerPosition[0],
      node.playerPosition[1] + hoverOffset,
      node.playerPosition[2],
    )
    const fallPivot = fallPivotRef.current
    if (fallPivot) {
      headingQuaternionRef.current.setFromAxisAngle(
        LANDRUSH_ISLAND_UP_AXIS,
        node.playerHeading ?? 0,
      )
      fallControlQuaternionRef.current.copy(
        presentationMode === 'fall' && fallControlRotation
          ? fallControlRotation
          : LANDRUSH_ISLAND_IDENTITY_QUATERNION,
      )
      fallProceduralEulerRef.current.set(fallPitch, fallYaw, fallRoll, 'XYZ')
      fallProceduralQuaternionRef.current.setFromEuler(fallProceduralEulerRef.current)
      fallPivot.quaternion
        .copy(fallControlQuaternionRef.current)
        .multiply(headingQuaternionRef.current)
        .multiply(fallProceduralQuaternionRef.current)
    }
  })

  return (
    <group
      position={[node.playerPosition[0], node.playerPosition[1], node.playerPosition[2]]}
      ref={groupRef}
    >
      <group
        position={[0, LANDRUSH_ISLAND_PRIMITIVE_ROBOT_GEOMETRY_CENTER_Y, 0]}
        ref={fallPivotRef}
        rotation={[0, node.playerHeading ?? 0, 0]}
      >
        <group position={[0, -LANDRUSH_ISLAND_PRIMITIVE_ROBOT_GEOMETRY_CENTER_Y, 0]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.46, 1.28, 0.32]} />
            <meshStandardMaterial color="#dce8ea" roughness={0.78} />
          </mesh>
          <mesh position={[0, 1.66, 0.02]}>
            <boxGeometry args={[0.36, 0.32, 0.3]} />
            <meshStandardMaterial color={color} roughness={0.74} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function LandrushIslandRobotPlayerBeacon({
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

function LandrushIslandBuildRobotExitHotspot({
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
  const segmentStart = useMemo(() => new Vector3(), [])
  const segmentEnd = useMemo(() => new Vector3(), [])
  const hoverProjectedStart = useMemo(() => new Vector3(), [])
  const hoverProjectedEnd = useMemo(() => new Vector3(), [])
  const hoverProjectedRadiusPoint = useMemo(() => new Vector3(), [])
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

      const motion = motionRef.current
      const hoverOffset = hoverOffsetRef.current
      segmentStart.set(motion.position.x, motion.position.y + hoverOffset + 0.12, motion.position.z)
      segmentEnd.set(motion.position.x, motion.position.y + hoverOffset + 2.26, motion.position.z)

      hoverProjectedStart.copy(segmentStart).project(camera)
      hoverProjectedEnd.copy(segmentEnd).project(camera)
      if (
        !isLandrushIslandProjectedPointWithinClipDepth(hoverProjectedStart) ||
        !isLandrushIslandProjectedPointWithinClipDepth(hoverProjectedEnd)
      ) {
        return false
      }

      hoverScreenPointer.set(event.clientX - rect.left, event.clientY - rect.top)
      hoverScreenStart.set(
        (hoverProjectedStart.x * 0.5 + 0.5) * rect.width,
        (-hoverProjectedStart.y * 0.5 + 0.5) * rect.height,
      )
      hoverScreenEnd.set(
        (hoverProjectedEnd.x * 0.5 + 0.5) * rect.width,
        (-hoverProjectedEnd.y * 0.5 + 0.5) * rect.height,
      )
      hoverScreenMid.copy(segmentStart).lerp(segmentEnd, 0.5)
      hoverScreenRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      hoverScreenRadiusPoint
        .copy(hoverScreenMid)
        .addScaledVector(hoverScreenRight, LANDRUSH_ISLAND_BUILD_ROBOT_EXIT_HOVER_RADIUS)
      hoverProjectedRadiusPoint.copy(hoverScreenRadiusPoint).project(camera)
      if (!isLandrushIslandProjectedPointWithinClipDepth(hoverProjectedRadiusPoint)) return false
      const projectedHoverScreenRadius = hoverScreenStart.distanceTo(
        projectVectorToLandrushIslandScreenPoint(hoverScreenRadiusPoint, camera, rect),
      )
      const visibleRobotScreenRadius = Math.max(
        2,
        projectedHoverScreenRadius *
          ((LANDRUSH_ISLAND_ROBOT_MESH_WIDTH_METERS * 0.5) /
            LANDRUSH_ISLAND_BUILD_ROBOT_EXIT_HOVER_RADIUS),
      )
      if (
        !doesLandrushIslandScreenCapsuleIntersectViewport(
          hoverScreenStart,
          hoverScreenEnd,
          visibleRobotScreenRadius,
          rect.width,
          rect.height,
        )
      ) {
        return false
      }

      const hoverScreenRadius = Math.max(36, projectedHoverScreenRadius)
      return (
        distanceSqToLandrushIslandScreenSegment(
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
    gl,
    hoverProjectedEnd,
    hoverProjectedRadiusPoint,
    hoverProjectedStart,
    hoverScreenEnd,
    hoverScreenMid,
    hoverScreenPointer,
    hoverScreenRadiusPoint,
    hoverScreenRight,
    hoverScreenStart,
    motionRef,
    onExitBuildMode,
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

function LandrushIslandMapPlayerMarker({
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
    setLandrushIslandGroupMaterialOpacity(group, materialOpacityRef.current)
    if (labelRef.current) labelRef.current.style.opacity = String(materialOpacityRef.current)
    if (!motion || targetOpacity <= 0.002) return

    group.position.set(motion.position.x, groundY + 0.16, motion.position.z)
    group.rotation.y = lerpAngle(group.rotation.y, motion.heading, clamp01(delta * 16))
  })

  return (
    <LandrushIslandMapBadgeMarker color={color} groupRef={groupRef} label="P" labelRef={labelRef} />
  )
}

function LandrushIslandRemoteMapPlayerMarker({
  groundY,
  opacityRef,
  player,
  remotePlayerStore,
  visible,
}: {
  groundY: number
  opacityRef: { current: number }
  player: MultiplayerPlayerSnapshot
  remotePlayerStore: MultiplayerRemotePlayerStore
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
    setLandrushIslandGroupMaterialOpacity(group, materialOpacityRef.current)
    if (materialOpacityRef.current <= 0.002) return

    const livePlayer = remotePlayerStore.getSnapshot(player.id) ?? player
    targetPositionRef.current.set(
      livePlayer.position[0],
      livePlayer.position[1] || groundY,
      livePlayer.position[2],
    )
    targetHeadingRef.current = livePlayer.heading

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionAmount = 1 - Math.exp(-LANDRUSH_ISLAND_REMOTE_POSITION_RESPONSE * frameDelta)
    const headingAmount = 1 - Math.exp(-LANDRUSH_ISLAND_REMOTE_HEADING_RESPONSE * frameDelta)
    positionRef.current.lerp(targetPositionRef.current, positionAmount)
    headingRef.current = lerpAngle(headingRef.current, targetHeadingRef.current, headingAmount)

    group.position.set(positionRef.current.x, groundY + 0.24, positionRef.current.z)
    group.rotation.y = headingRef.current
  })

  return <LandrushIslandMapBadgeMarker color={player.color} groupRef={groupRef} scale={1.28} />
}

function LandrushIslandMapBadgeMarker({
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
          userData={{ landrushIslandBaseOpacity: 0.52 }}
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
          userData={{ landrushIslandBaseOpacity: 0.52 }}
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
          userData={{ landrushIslandBaseOpacity: 0.9 }}
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
          userData={{ landrushIslandBaseOpacity: 0.9 }}
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
          userData={{ landrushIslandBaseOpacity: 0.98 }}
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
          userData={{ landrushIslandBaseOpacity: 0.98 }}
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
          userData={{ landrushIslandBaseOpacity: 0.98 }}
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

function createLandrushIslandPlayerSnapshot({
  heading,
  localProfile,
  moving,
  pose,
  position,
  speed,
}: {
  heading: number
  localProfile: LocalPlayerProfile
  moving: boolean
  pose?: MultiplayerPlayerSnapshot['pose']
  position: [number, number, number]
  speed: number
}): MultiplayerPlayerSnapshot {
  const snapshot: MultiplayerPlayerSnapshot = {
    ...localProfile,
    heading,
    moving,
    position,
    speed,
    updatedAt: Date.now(),
  }
  if (pose) snapshot.pose = pose
  return snapshot
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

function measureLandrushIslandSetup<T>(
  profileMeasure: LandrushIslandProfileMeasure | undefined,
  id: string,
  callback: () => T,
) {
  return profileMeasure ? profileMeasure(id, callback) : callback()
}

function useLandrushIslandLoadingProgress(assetsReady: boolean) {
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
      }, LANDRUSH_ISLAND_LOADING_FADE_MS)
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
      const target = Math.min(96, (elapsed / LANDRUSH_ISLAND_LOADING_EXPECTED_MS) * 96)
      const quietFor = now - lastLongTaskAt
      const canComplete =
        assetsReadyRef.current &&
        document.readyState !== 'loading' &&
        elapsed >= LANDRUSH_ISLAND_LOADING_MINIMUM_MS &&
        quietFor >= LANDRUSH_ISLAND_LOADING_QUIET_MS
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

function createLandrushIslandRobotActorNode(
  baseNode: LandrushIslandLayoutNode,
  id: string,
  spawn: LandrushPoint2,
  groundY: number,
): LandrushWorldNode {
  return {
    ...baseNode,
    focusParcelId: null,
    id: landrushIslandRobotNodeId(id),
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

function landrushIslandRobotNodeId(id: string): `landrush-world_${string}` {
  return `landrush-world_landrush-island-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function writeMotionToLandrushIslandRobotNode(node: LandrushWorldNode, motion: RobotMotion) {
  node.playerPosition = [motion.position.x, motion.position.y, motion.position.z]
  node.playerHeading = motion.heading
  node.playerMoving = !motion.falling && motion.isMoving
  node.playerSpeed =
    !motion.falling && motion.runRequested && motion.speed > 0.2
      ? Math.max(motion.speed, LANDRUSH_ISLAND_ROBOT_RUN_SPEED)
      : motion.speed
}

function setLandrushIslandMapCameraZoom(camera: Camera, zoom: number) {
  if (!isLandrushIslandOrthographicCamera(camera)) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}

function isLandrushIslandOrthographicCamera(
  camera: Camera,
): camera is LandrushIslandOrthographicCamera {
  return (camera as Partial<LandrushIslandOrthographicCamera>).isOrthographicCamera === true
}

function applyLandrushIslandCameraPose(
  camera: Camera,
  pose: LandrushIslandCameraPose | null,
  fallbackTarget: readonly [number, number, number] = LANDRUSH_ISLAND_CAMERA_TARGET,
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

function createLandrushIslandCameraPose(camera: Camera, target: Vector3): LandrushIslandCameraPose {
  const pose: LandrushIslandCameraPose = {
    distance: 0,
    pitch: 0,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: target.clone(),
    yaw: 0,
    zoom: isLandrushIslandOrthographicCamera(camera) ? camera.zoom : null,
  }
  updateLandrushIslandCameraPoseOrbit(pose)
  return pose
}

function cloneLandrushIslandCameraPose(
  pose: LandrushIslandCameraPose | null,
): LandrushIslandCameraPose | null {
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

function landrushIslandCameraPoseToEditorInitialPose(
  pose: LandrushIslandCameraPose,
): EditorCameraInitialPose {
  return {
    position: [pose.position.x, pose.position.y, pose.position.z],
    target: [pose.target.x, pose.target.y, pose.target.z],
  }
}

function maybeLandrushIslandCameraPoseToEditorInitialPose(
  pose: LandrushIslandCameraPose | null,
): EditorCameraInitialPose | null {
  return pose ? landrushIslandCameraPoseToEditorInitialPose(pose) : null
}

function writeLandrushIslandCameraPose(
  poseRef: { current: LandrushIslandCameraPose | null },
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
  pose.zoom = isLandrushIslandOrthographicCamera(camera) ? camera.zoom : null
  updateLandrushIslandCameraPoseOrbit(pose)
}

function updateLandrushIslandCameraPoseOrbit(pose: LandrushIslandCameraPose) {
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
    LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH,
    LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_PITCH,
  )
  distanceRef.current = MathUtils.clamp(
    Math.hypot(horizontalDistance, offsetY),
    LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
    LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
  )
}

function resolveLandrushIslandPlayerReturnTargetPose(
  sourcePose: LandrushIslandCameraPose,
  target: Vector3,
  outputPosition: Vector3,
): LandrushIslandCameraPose {
  const yaw = Number.isFinite(sourcePose.yaw)
    ? sourcePose.yaw
    : LANDRUSH_ISLAND_ISOMETRIC_CAMERA_INITIAL_YAW
  const pitch = Number.isFinite(sourcePose.pitch)
    ? clamp(
        sourcePose.pitch,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_PITCH,
        LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_PITCH,
      )
    : LANDRUSH_ISLAND_ISOMETRIC_CAMERA_PITCH
  const sourceDistance = Number.isFinite(sourcePose.distance)
    ? sourcePose.distance
    : sourcePose.position.distanceTo(sourcePose.target)
  const distance = clamp(
    sourceDistance,
    LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MIN_DISTANCE,
    LANDRUSH_ISLAND_ISOMETRIC_CAMERA_MAX_DISTANCE,
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
    quaternion: resolveLandrushIslandCameraPoseQuaternion(position, target, new Quaternion()),
    target: target.clone(),
    yaw,
    zoom: null,
  }
}

function resolveLandrushIslandCameraPoseQuaternion(
  position: Vector3,
  target: Vector3,
  output: Quaternion,
) {
  _landrushIslandCameraPoseLookAtMatrix.lookAt(position, target, _landrushIslandCameraPoseUp)
  return output.setFromRotationMatrix(_landrushIslandCameraPoseLookAtMatrix)
}

function easeLandrushIslandCameraTransition(
  progress: number,
  _targetMode: LandrushIslandRuntimeCameraSample['mode'],
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

function getLandrushIslandCameraControls(state: unknown) {
  const controls = (state as { controls?: unknown }).controls
  if (!isLandrushIslandCameraControls(controls)) return undefined
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

function isLandrushIslandCameraControls(
  controls: unknown,
): controls is LandrushIslandCameraControls {
  if (!controls || typeof controls !== 'object') return false
  const candidate = controls as Partial<LandrushIslandCameraControls>
  return typeof candidate.setLookAt === 'function' || typeof candidate.getTarget === 'function'
}

function readLandrushIslandCameraControlsTarget(
  controls: LandrushIslandCameraControls | undefined,
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
  currentLevelId,
  doorPortals,
  groundY,
  motion,
  navigationObstacles,
  nodes,
  pointer,
  pointerNdc,
  raycaster,
  stairConnectors,
  stairPortals,
  surfacePoints,
}: {
  camera: Camera
  canvas: HTMLCanvasElement
  colliderMeshes: Mesh[]
  currentLevelId: LevelNode['id']
  doorPortals: readonly LandrushIslandDoorPortal[]
  groundY: number
  motion: RobotMotion
  navigationObstacles: readonly LandrushIslandNavigationObstacle[]
  nodes: Record<string, AnyNode>
  pointer: LandrushIslandRightHoldMove | null
  pointerNdc: Vector2
  raycaster: Raycaster
  stairConnectors: readonly LandrushIslandStairConnector[]
  stairPortals: readonly LandrushIslandStairPortal[]
  surfacePoints: readonly LandrushPoint2[]
}): RobotMovementInput | null {
  if (!pointer) return null

  const point = pickLandrushIslandWalkTargetPoint({
    camera,
    canvas,
    colliderMeshes,
    event: { clientX: pointer.x, clientY: pointer.y } as PointerEvent,
    groundY,
    nodes,
    pointerNdc,
    raycaster,
  })
  const start = { x: motion.position.x, z: motion.position.z }
  const targetNavigation = point
    ? resolveLandrushIslandNavigationContext(
        point.levelId,
        navigationObstacles,
        doorPortals,
        stairPortals,
        stairConnectors,
      )
    : null
  const rawTargetPoint =
    point && targetNavigation
      ? resolveLandrushIslandStairConnectorTarget(start, point, targetNavigation.stairPortals)
      : null
  const targetPoint = rawTargetPoint
    ? resolveLandrushIslandWalkableNavigationTargetPoint(
        rawTargetPoint,
        targetNavigation?.navigationObstacles ?? [],
        surfacePoints,
      )
    : null
  if (!(point && targetPoint)) return null

  const leg = resolveLandrushIslandNavigationLeg(
    start,
    currentLevelId,
    { levelId: point.levelId, point: targetPoint, worldY: point.worldY },
    stairConnectors,
  )
  if (!leg) return null
  const activeNavigation = resolveLandrushIslandNavigationContext(
    currentLevelId,
    navigationObstacles,
    doorPortals,
    stairPortals,
    stairConnectors,
  )
  const activeStairPortals = resolveLandrushIslandNavigationLegStairPortals(
    leg,
    activeNavigation.stairPortals,
  )

  const steeringPoint = resolveLandrushIslandNavigationSteeringPoint(
    start,
    leg.point,
    activeNavigation.navigationObstacles,
    activeNavigation.doorPortals,
    surfacePoints,
    activeStairPortals,
  )
  if (!steeringPoint) return null
  openLandrushIslandDoorPortalsAlongSegment(start, leg.point, activeNavigation.doorPortals)
  const dx = leg.point.x - motion.position.x
  const dz = leg.point.z - motion.position.z
  const distance = Math.hypot(dx, dz)
  if (distance <= LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS) return null

  const movement = resolveLandrushIslandNavigationMovementVector(start, steeringPoint, distance)
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
  targetRef: { current: LandrushIslandMoveTarget | null },
  navigationObstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  stairPortals: readonly LandrushIslandStairPortal[],
  surfacePoints: readonly LandrushPoint2[],
  currentLevelId: LevelNode['id'],
  stairConnectors: readonly LandrushIslandStairConnector[],
): RobotMovementInput | null {
  const target = targetRef.current
  if (!target) return null

  const now = performance.now()
  const start = { x: motion.position.x, z: motion.position.z }
  const leg = resolveLandrushIslandClickMoveNavigationLeg(
    start,
    currentLevelId,
    target,
    stairConnectors,
  )
  if (!leg) return null
  const activeStairPortals = resolveLandrushIslandNavigationLegStairPortals(leg, stairPortals)
  const navigationTarget = leg.point
  const distance = Math.hypot(navigationTarget.x - start.x, navigationTarget.z - start.z)
  if (target.route?.legKey !== leg.key) {
    target.route = createLandrushIslandMoveRouteState(start, distance, now, leg.key)
  }
  const crossingInProgress = target.route.doorCrossing !== null

  const projectedFinalReached =
    !crossingInProgress &&
    segmentReachedLandrushIslandNavigationPoint(
      target.route.lastRobotPoint,
      start,
      navigationTarget,
      LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS,
    )
  if (
    !crossingInProgress &&
    (distance <= LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS ||
      (projectedFinalReached && distance <= LANDRUSH_ISLAND_CLICK_MOVE_PROJECTED_STOP_RADIUS))
  ) {
    if (!leg.final) {
      recordLandrushIslandNavigationProbe({
        currentLevelId,
        distance: roundPerf(distance),
        kind: 'floor-portal-arrived',
        targetLevelId: target.levelId,
      })
      return null
    }
    recordLandrushIslandNavigationProbe({
      distance: roundPerf(distance),
      kind: 'click-arrived',
      projected: distance > LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS,
    })
    targetRef.current = null
    return null
  }
  if (projectedFinalReached) {
    recordLandrushIslandNavigationProbe({
      distance: roundPerf(distance),
      kind: 'click-arrival-projection-ignored',
      projectedStopRadius: roundPerf(LANDRUSH_ISLAND_CLICK_MOVE_PROJECTED_STOP_RADIUS),
    })
  }

  target.route = updateLandrushIslandMoveRouteProgress(target.route, start, distance, now)
  let doorCrossingResolution = resolveLandrushIslandActiveDoorCrossingSteering(
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
  let activeSteering: LandrushIslandNavigationSteeringResult | null =
    doorCrossingResolution?.steering ?? null
  const noProgressMs = now - target.route.lastProgressAt
  const hasStalled =
    noProgressMs >= LANDRUSH_ISLAND_CLICK_MOVE_STALL_MS &&
    (motion.speed <= LANDRUSH_ISLAND_CLICK_MOVE_STALL_SPEED ||
      noProgressMs >= LANDRUSH_ISLAND_CLICK_MOVE_NO_PROGRESS_RETRY_MS)
  if (!activeSteering && hasStalled) {
    const recovery = resolveLandrushIslandNavigationRecoverySteeringPoint(
      start,
      navigationTarget,
      target.route.lastSteeringPoint ?? navigationTarget,
      navigationObstacles,
      doorPortals,
      surfacePoints,
      activeStairPortals,
    )
    target.route.lastProgressAt = now
    target.route.recoveryCount += 1
    if (recovery) {
      activeSteering = recovery
      recordLandrushIslandNavigationProbe({
        distance: roundPerf(distance),
        kind: 'click-stall-recovery',
        recoveryCount: target.route.recoveryCount,
        steering: [roundPerf(recovery.point.x), roundPerf(recovery.point.z)],
      })
    } else {
      const retry = resolveLandrushIslandNavigationLocalRetrySteeringPoint(
        start,
        navigationTarget,
        target.route.lastSteeringPoint ?? navigationTarget,
        navigationObstacles,
        surfacePoints,
        target.route.recoveryCount,
      )
      if (retry) {
        activeSteering = retry
        recordLandrushIslandNavigationProbe({
          distance: roundPerf(distance),
          kind: 'click-stall-local-retry',
          noProgressMs: roundPerf(noProgressMs),
          recoveryCount: target.route.recoveryCount,
          steering: [roundPerf(retry.point.x), roundPerf(retry.point.z)],
        })
      } else if (target.route.recoveryCount < LANDRUSH_ISLAND_CLICK_MOVE_LOCAL_RETRY_MAX) {
        target.route.nextRetryAt = now + LANDRUSH_ISLAND_CLICK_MOVE_RETRY_MS
      }
      recordLandrushIslandNavigationProbe({
        distance: roundPerf(distance),
        kind: 'click-stall-replan',
        noProgressMs: roundPerf(noProgressMs),
        recoveryCount: target.route.recoveryCount,
      })
    }
  }

  if (!activeSteering) {
    activeSteering = resolveLandrushIslandNavigationSteeringPoint(
      start,
      navigationTarget,
      navigationObstacles,
      doorPortals,
      surfacePoints,
      activeStairPortals,
    )
    if (!activeSteering) {
      activeSteering = resolveLandrushIslandNavigationEscapeSteeringPoint(
        start,
        navigationTarget,
        navigationObstacles,
        doorPortals,
        surfacePoints,
        activeStairPortals,
      )
      if (activeSteering) {
        target.route.lastProgressAt = now
        target.route.nextRetryAt = 0
        target.route.recoveryCount += 1
        recordLandrushIslandNavigationProbe({
          distance: roundPerf(distance),
          kind: 'click-route-recovery',
          recoveryCount: target.route.recoveryCount,
          steering: [roundPerf(activeSteering.point.x), roundPerf(activeSteering.point.z)],
          target: [roundPerf(navigationTarget.x), roundPerf(navigationTarget.z)],
        })
      } else {
        const retryRecovery = resolveLandrushIslandNavigationRecoverySteeringPoint(
          start,
          navigationTarget,
          target.route.lastSteeringPoint ?? navigationTarget,
          navigationObstacles,
          doorPortals,
          surfacePoints,
          activeStairPortals,
        )
        if (retryRecovery) {
          activeSteering = retryRecovery
          target.route.nextRetryAt = 0
          target.route.recoveryCount += 1
          recordLandrushIslandNavigationProbe({
            distance: roundPerf(distance),
            kind: 'click-no-route-recovery',
            recoveryCount: target.route.recoveryCount,
            steering: [roundPerf(retryRecovery.point.x), roundPerf(retryRecovery.point.z)],
            target: [roundPerf(navigationTarget.x), roundPerf(navigationTarget.z)],
          })
        } else {
          target.route.recoveryCount += 1
          const localRetry = resolveLandrushIslandNavigationLocalRetrySteeringPoint(
            start,
            navigationTarget,
            target.route.lastSteeringPoint ?? navigationTarget,
            navigationObstacles,
            surfacePoints,
            target.route.recoveryCount,
          )
          if (localRetry) {
            activeSteering = localRetry
            target.route.nextRetryAt = 0
            recordLandrushIslandNavigationProbe({
              distance: roundPerf(distance),
              kind: 'click-no-route-local-retry',
              recoveryCount: target.route.recoveryCount,
              steering: [roundPerf(localRetry.point.x), roundPerf(localRetry.point.z)],
              target: [roundPerf(navigationTarget.x), roundPerf(navigationTarget.z)],
            })
          } else {
            target.route.nextRetryAt = now + LANDRUSH_ISLAND_CLICK_MOVE_RETRY_MS
            recordLandrushIslandNavigationProbe({
              distance: roundPerf(distance),
              kind: 'click-no-route-retry',
              recoveryCount: target.route.recoveryCount,
              retryMs: LANDRUSH_ISLAND_CLICK_MOVE_RETRY_MS,
              target: [roundPerf(navigationTarget.x), roundPerf(navigationTarget.z)],
            })
            return null
          }
        }
      }
    } else if (completedDoorCrossing) {
      recordLandrushIslandNavigationProbe({
        distance: roundPerf(distance),
        kind: 'door-crossing-resume-target',
      })
    }
  }

  if (activeSteering.doorCrossing && !target.route.doorCrossing) {
    target.route.doorCrossing = cloneLandrushIslandDoorCrossingState(activeSteering.doorCrossing)
    recordLandrushIslandNavigationProbe({
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
    doorCrossingResolution = resolveLandrushIslandActiveDoorCrossingSteering(
      target.route,
      start,
      now,
    )
    if (doorCrossingResolution?.waiting) {
      target.route.lastRobotPoint = start
      return null
    }
    activeSteering = doorCrossingResolution?.steering ?? activeSteering
  }

  openLandrushIslandDoorPortalsAlongSegment(start, navigationTarget, doorPortals)
  if (activeSteering.doorId) {
    const openState = openLandrushIslandDoor(activeSteering.doorId)
    if (openState === 'started') {
      recordLandrushIslandNavigationProbe({
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
    const waypointRadius = LANDRUSH_ISLAND_CLICK_MOVE_WAYPOINT_RADIUS
    const reached =
      steeringDistance <= waypointRadius ||
      segmentReachedLandrushIslandNavigationPoint(
        target.route.lastRobotPoint,
        start,
        activeSteering.point,
        waypointRadius,
      )
    if (!reached) break

    target.route.lastProgressAt = now
    target.route.lastRobotPoint = start
    target.route.lastSteeringPoint = activeSteering.point
    recordLandrushIslandNavigationProbe({
      kind: 'click-waypoint-reached',
      navigationKind: activeSteering.kind,
      steeringDistance: roundPerf(steeringDistance),
    })
    const nextSteering = resolveLandrushIslandNavigationSteeringPoint(
      start,
      navigationTarget,
      navigationObstacles,
      doorPortals,
      surfacePoints,
      activeStairPortals,
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
        if (leg.final) {
          recordLandrushIslandNavigationProbe({
            distance: roundPerf(distance),
            kind: 'click-arrived',
            projected: true,
          })
          targetRef.current = null
        } else {
          recordLandrushIslandNavigationProbe({
            currentLevelId,
            distance: roundPerf(distance),
            kind: 'floor-portal-arrived',
            targetLevelId: target.levelId,
          })
        }
      }
      return null
    }
    activeSteering = nextSteering
  }

  const movement = resolveLandrushIslandNavigationMovementVector(start, activeSteering, distance)
  const lastSteeringPoint = target.route.lastSteeringPoint
  const steeringPointChanged =
    !lastSteeringPoint ||
    Math.hypot(
      movement.steeringPoint.x - lastSteeringPoint.x,
      movement.steeringPoint.z - lastSteeringPoint.z,
    ) > 0.05
  if (activeSteering.doorId && steeringPointChanged) {
    recordLandrushIslandNavigationProbe({
      doorId: activeSteering.doorId,
      kind: 'door-route-selected',
      steeringDistance: roundPerf(movement.steeringDistance),
      steeringPoint: [roundPerf(movement.steeringPoint.x), roundPerf(movement.steeringPoint.z)],
      target: [roundPerf(navigationTarget.x), roundPerf(navigationTarget.z)],
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

function resolveLandrushIslandNavigationMovementVector(
  start: LandrushPoint2,
  activeSteering: LandrushIslandNavigationSteeringResult,
  targetDistance: number,
) {
  const constrained = activeSteering.doorCrossing
    ? resolveLandrushIslandConstrainedCrossingMovement(
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
      resolveLandrushIslandNavigationMoveIntensity(
        activeSteering.kind,
        steeringDistance,
        targetDistance,
      ),
    runAmount:
      constrained?.runAmount ?? (targetDistance > LANDRUSH_ISLAND_CLICK_MOVE_RUN_DISTANCE ? 1 : 0),
    steeringDistance,
    steeringPoint,
  }
}

function resolveLandrushIslandWalkableNavigationTargetPoint(
  target: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
): LandrushPoint2 | null {
  if (!pointInPolygon(target, surfacePoints)) return null
  if (!pointInLandrushIslandBlockingNavigationObstacle(target, obstacles)) return target

  let best: { distance: number; point: LandrushPoint2 } | null = null
  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair' || !pointInPolygon(target, obstacle.points)) continue
    const boundary = closestPointOnClosedPolyline(target, obstacle.points)
    if (!boundary) continue
    const centroid = centroidForPolygon(obstacle.points)
    const normal = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
    const tangent = normalize2(-normal.z, normal.x)
    const distances = [
      LANDRUSH_ISLAND_NAVIGATION_TARGET_NUDGE_METERS,
      LANDRUSH_ISLAND_CLICK_MOVE_STOP_RADIUS,
      LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
    ] as const

    for (const distance of distances) {
      for (const side of [0, -1, 1] as const) {
        const candidate = {
          x:
            boundary.x +
            normal.x * distance +
            tangent.x * side * LANDRUSH_ISLAND_NAVIGATION_TARGET_NUDGE_METERS,
          z:
            boundary.z +
            normal.z * distance +
            tangent.z * side * LANDRUSH_ISLAND_NAVIGATION_TARGET_NUDGE_METERS,
        }
        if (!pointInPolygon(candidate, surfacePoints)) continue
        if (pointInLandrushIslandBlockingNavigationObstacle(candidate, obstacles)) continue
        const candidateDistance = Math.hypot(candidate.x - target.x, candidate.z - target.z)
        if (!best || candidateDistance < best.distance) {
          best = { distance: candidateDistance, point: candidate }
        }
      }
    }
  }

  return best?.point ?? null
}

function resolveLandrushIslandObstacleSlideMovement(
  start: LandrushPoint2,
  movement: RobotMovementInput,
  obstacles: readonly LandrushIslandNavigationObstacle[],
): RobotMovementInput {
  if (movement.navigationKind === 'door' || movement.navigationKind === 'stair') return movement

  const contact = resolveLandrushIslandNavigationSlideContact(start, movement, obstacles)
  if (!contact) return movement

  const inwardDot = movement.x * contact.normal.x + movement.z * contact.normal.z
  if (inwardDot >= -LANDRUSH_ISLAND_NAVIGATION_SLIDE_MIN_INWARD_DOT) return movement

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

function resolveLandrushIslandNavigationSlideContact(
  start: LandrushPoint2,
  movement: RobotMovementInput,
  obstacles: readonly LandrushIslandNavigationObstacle[],
) {
  let best: { distance: number; normal: LandrushPoint2; tangent: LandrushPoint2 } | null = null

  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair') continue
    const boundary = closestPointOnClosedPolyline(start, obstacle.points)
    if (!boundary) continue

    const inside = pointInPolygon(start, obstacle.points)
    const distance = Math.hypot(start.x - boundary.x, start.z - boundary.z)
    if (!inside && distance > LANDRUSH_ISLAND_NAVIGATION_SLIDE_RADIUS_METERS) continue

    const centroid = centroidForPolygon(obstacle.points)
    let normal = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
    if (!inside && distance > 0.000001) {
      const pointSide = normalize2(start.x - boundary.x, start.z - boundary.z)
      if (pointSide.x * normal.x + pointSide.z * normal.z < 0) {
        normal = { x: -normal.x, z: -normal.z }
      }
    }

    const inwardAmount = -(movement.x * normal.x + movement.z * normal.z)
    if (inwardAmount <= LANDRUSH_ISLAND_NAVIGATION_SLIDE_MIN_INWARD_DOT) continue

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

function resolveLandrushIslandConstrainedCrossingMovement(
  start: LandrushPoint2,
  crossing: LandrushIslandDoorCrossingState,
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
      ? LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS
      : LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS
  const phasePlaneReached = progressFromEntry >= phaseProgress - phaseRadius
  const steeringProgress = clamp(
    phasePlaneReached && Math.abs(lateralFromRoute) <= phaseRadius
      ? progressFromEntry + LANDRUSH_ISLAND_CONSTRAINED_CROSSING_LOOKAHEAD_METERS
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
    crossingDistance / LANDRUSH_ISLAND_CONSTRAINED_CROSSING_FULL_SPEED_METERS,
  )
  const intensity = MathUtils.clamp(
    rawIntensity,
    LANDRUSH_ISLAND_CONSTRAINED_CROSSING_MIN_SPEED_SCALE,
    LANDRUSH_ISLAND_CONSTRAINED_CROSSING_MAX_SPEED_SCALE,
  )
  const distanceBeforeEntry = Math.max(0, -progressFromEntry)
  const runAmount =
    crossing.phase === 'entry' &&
    Math.max(distanceBeforeEntry, steeringDistance) >
      LANDRUSH_ISLAND_CONSTRAINED_CROSSING_RUN_APPROACH_METERS &&
    targetDistance > LANDRUSH_ISLAND_CLICK_MOVE_RUN_DISTANCE
      ? 1
      : 0

  return {
    intensity,
    runAmount,
    steeringPoint,
  }
}

function createLandrushIslandMoveRouteState(
  point: LandrushPoint2,
  distance: number,
  now: number,
  legKey: string,
): LandrushIslandMoveRouteState {
  return {
    bestDistance: distance,
    doorCrossing: null,
    lastProgressAt: now,
    lastRobotPoint: point,
    lastSteeringPoint: null,
    legKey,
    nextRetryAt: 0,
    recoveryCount: 0,
  }
}

function updateLandrushIslandMoveRouteProgress(
  route: LandrushIslandMoveRouteState,
  point: LandrushPoint2,
  distance: number,
  now: number,
) {
  if (distance < route.bestDistance - LANDRUSH_ISLAND_CLICK_MOVE_PROGRESS_EPSILON_METERS) {
    route.bestDistance = distance
    route.lastProgressAt = now
  }
  route.lastRobotPoint = route.lastRobotPoint ?? point
  return route
}

function resolveLandrushIslandClickMoveIntensity(distance: number) {
  const normalized = clamp01(distance / LANDRUSH_ISLAND_CLICK_MOVE_FULL_SPEED_DISTANCE)
  return MathUtils.clamp(normalized * normalized, LANDRUSH_ISLAND_CLICK_MOVE_MIN_SPEED_SCALE, 1)
}

function resolveLandrushIslandNavigationMoveIntensity(
  kind: LandrushIslandNavigationSteeringKind,
  steeringDistance: number,
  targetDistance: number,
) {
  const constrainedCrossing = kind === 'door' || kind === 'stair'
  const speedDistance = constrainedCrossing ? targetDistance : steeringDistance
  const intensity = resolveLandrushIslandClickMoveIntensity(speedDistance)
  return constrainedCrossing
    ? Math.max(LANDRUSH_ISLAND_DOOR_CROSSING_MIN_INTENSITY, intensity)
    : intensity
}

function resolveLandrushIslandActiveDoorCrossingSteering(
  route: LandrushIslandMoveRouteState,
  start: LandrushPoint2,
  now: number,
): {
  completed: boolean
  steering: LandrushIslandNavigationSteeringResult | null
  waiting: boolean
} | null {
  const crossing = route.doorCrossing
  if (!crossing) return null

  for (let advance = 0; advance < 3; advance += 1) {
    const point = pointForLandrushIslandDoorCrossingPhase(crossing)
    const radius =
      crossing.phase === 'center'
        ? LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS
        : LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS
    const distance = Math.hypot(point.x - start.x, point.z - start.z)
    const reached =
      distance <= radius ||
      segmentReachedLandrushIslandNavigationPoint(route.lastRobotPoint, start, point, radius)
    if (!reached) {
      return {
        completed: false,
        steering: {
          doorCrossing: cloneLandrushIslandDoorCrossingState(crossing),
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
      getLandrushIslandDoorOpenRatio(crossing.doorId) < LANDRUSH_ISLAND_DOOR_CROSSING_OPEN_MIN
    ) {
      const openState = openLandrushIslandDoor(crossing.doorId)
      route.lastProgressAt = now
      route.lastSteeringPoint = point
      recordLandrushIslandNavigationProbe({
        distance: roundPerf(distance),
        doorId: crossing.doorId,
        kind: 'door-crossing-wait-open',
        nodeId: crossing.nodeId,
        openRatio: roundPerf(getLandrushIslandDoorOpenRatio(crossing.doorId)),
        openState,
        phase: crossing.phase,
      })
      return { completed: false, steering: null, waiting: true }
    }

    route.lastProgressAt = now
    route.lastSteeringPoint = point
    recordLandrushIslandNavigationProbe({
      distance: roundPerf(distance),
      doorId: crossing.doorId,
      kind: `${crossing.kind}-crossing-waypoint`,
      nodeId: crossing.nodeId,
      phase: crossing.phase,
      signedDistance: roundPerf(signedLandrushIslandDoorCrossingDistance(start, crossing)),
      tangentDistance: roundPerf(tangentLandrushIslandDoorCrossingDistance(start, crossing)),
    })

    const nextPhase = nextLandrushIslandDoorCrossingPhase(crossing.phase)
    if (!nextPhase) {
      route.doorCrossing = null
      recordLandrushIslandNavigationProbe({
        doorId: crossing.doorId,
        kind: `${crossing.kind}-crossing-complete`,
        nodeId: crossing.nodeId,
      })
      return { completed: true, steering: null, waiting: false }
    }
    crossing.phase = nextPhase
  }

  const point = pointForLandrushIslandDoorCrossingPhase(crossing)
  return {
    completed: false,
    steering: {
      doorCrossing: cloneLandrushIslandDoorCrossingState(crossing),
      doorId: crossing.doorId,
      kind: crossing.kind,
      point,
    },
    waiting: false,
  }
}

function pointForLandrushIslandDoorCrossingPhase(crossing: LandrushIslandDoorCrossingState) {
  if (crossing.phase === 'entry') return crossing.entry
  if (crossing.phase === 'center') return crossing.center
  return crossing.exit
}

function nextLandrushIslandDoorCrossingPhase(
  phase: LandrushIslandDoorCrossingPhase,
): LandrushIslandDoorCrossingPhase | null {
  if (phase === 'entry') return 'center'
  if (phase === 'center') return 'exit'
  return null
}

function cloneLandrushIslandDoorCrossingState(
  crossing: LandrushIslandDoorCrossingState,
): LandrushIslandDoorCrossingState {
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

function signedLandrushIslandDoorCrossingDistance(
  point: LandrushPoint2,
  crossing: LandrushIslandDoorCrossingState,
) {
  const normal = normalize2(
    crossing.entry.x - crossing.center.x,
    crossing.entry.z - crossing.center.z,
  )
  return (point.x - crossing.center.x) * normal.x + (point.z - crossing.center.z) * normal.z
}

function tangentLandrushIslandDoorCrossingDistance(
  point: LandrushPoint2,
  crossing: LandrushIslandDoorCrossingState,
) {
  const normal = normalize2(
    crossing.entry.x - crossing.center.x,
    crossing.entry.z - crossing.center.z,
  )
  return (point.x - crossing.center.x) * -normal.z + (point.z - crossing.center.z) * normal.x
}

function getLandrushIslandDoorOpenRatio(doorId: AnyNodeId) {
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
      0) / LANDRUSH_ISLAND_DOOR_OPEN_SWING_ANGLE,
  )
}

function segmentReachedLandrushIslandNavigationPoint(
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

function resolveLandrushIslandNavigationRecoverySteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  blockedPoint: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly LandrushIslandStairPortal[] = [],
): LandrushIslandNavigationSteeringResult | null {
  const escapeSteering = resolveLandrushIslandNavigationEscapeSteeringPoint(
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
        forward.x * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_FORWARD_METERS +
        right.x * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
      z:
        start.z +
        forward.z * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_FORWARD_METERS +
        right.z * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
    },
    {
      x:
        start.x +
        forward.x * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_FORWARD_METERS -
        right.x * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
      z:
        start.z +
        forward.z * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_FORWARD_METERS -
        right.z * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
    },
    {
      x: start.x - blockedDirection.x * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
      z: start.z - blockedDirection.z * LANDRUSH_ISLAND_CLICK_MOVE_RECOVERY_SIDE_METERS,
    },
  ]

  for (const candidate of candidates) {
    if (!pointInPolygon(candidate, surfacePoints)) continue
    if (pointInLandrushIslandNavigationObstacle(candidate, obstacles)) continue
    if (!landrushIslandNavigationSegmentPassable(start, candidate, obstacles, surfacePoints))
      continue
    const onward = resolveLandrushIslandNavigationSteeringPoint(
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

function resolveLandrushIslandNavigationLocalRetrySteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  blockedPoint: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
  attempt: number,
): LandrushIslandNavigationSteeringResult | null {
  const contact = resolveLandrushIslandNavigationLocalRetryContact(start, obstacles)
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
      if (pointInLandrushIslandBlockingNavigationObstacle(candidate, obstacles)) continue
      if (contact) {
        if (
          landrushIslandNavigationSegmentBlockedByOtherObstacles(
            start,
            candidate,
            obstacles,
            contact.obstacle,
          )
        ) {
          continue
        }
      } else if (
        !landrushIslandNavigationSegmentPassable(start, candidate, obstacles, surfacePoints)
      ) {
        continue
      }
      return { kind: 'recovery', point: candidate }
    }
  }

  return null
}

function resolveLandrushIslandNavigationLocalRetryContact(
  start: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
) {
  let best: {
    distance: number
    normal: LandrushPoint2
    obstacle: LandrushIslandNavigationObstacle
    tangent: LandrushPoint2
  } | null = null

  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair') continue
    const boundary = closestPointOnClosedPolyline(start, obstacle.points)
    if (!boundary) continue

    const inside = pointInPolygon(start, obstacle.points)
    const distance = Math.hypot(start.x - boundary.x, start.z - boundary.z)
    if (!inside && distance > LANDRUSH_ISLAND_NAVIGATION_SLIDE_RADIUS_METERS * 1.35) continue

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

function resolveLandrushIslandNavigationEscapeSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly LandrushIslandStairPortal[] = [],
): LandrushIslandNavigationSteeringResult | null {
  for (const obstacle of obstacles) {
    if (!pointInPolygon(start, obstacle.points)) continue
    for (const candidate of createLandrushIslandNavigationEscapeCandidates(
      start,
      target,
      obstacle,
    )) {
      if (!pointInPolygon(candidate, surfacePoints)) continue
      if (pointInLandrushIslandNavigationObstacle(candidate, obstacles)) continue
      if (
        landrushIslandNavigationSegmentBlockedByOtherObstacles(
          start,
          candidate,
          obstacles,
          obstacle,
        )
      ) {
        continue
      }
      const onward = resolveLandrushIslandNavigationSteeringPoint(
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

function createLandrushIslandNavigationEscapeCandidates(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacle: LandrushIslandNavigationObstacle,
) {
  const boundary = closestPointOnClosedPolyline(start, obstacle.points) ?? start
  const centroid = centroidForPolygon(obstacle.points)
  const outward = normalize2(boundary.x - centroid.x, boundary.z - centroid.z)
  const targetDirection = normalize2(target.x - start.x, target.z - start.z)
  const right = { x: -targetDirection.z, z: targetDirection.x }
  const escapeDistance = Math.max(
    LANDRUSH_ISLAND_NAVIGATION_VERTEX_OFFSET_METERS,
    LANDRUSH_ISLAND_CLICK_MOVE_WAYPOINT_RADIUS + LANDRUSH_ISLAND_CLICK_MOVE_PROGRESS_EPSILON_METERS,
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

function landrushIslandNavigationSegmentBlockedByOtherObstacles(
  start: LandrushPoint2,
  end: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  ignoredObstacle: LandrushIslandNavigationObstacle,
) {
  for (const obstacle of obstacles) {
    if (obstacle === ignoredObstacle) continue
    if (landrushIslandNavigationSegmentIntersectsPolygon(start, end, obstacle.points)) return true
  }
  return false
}

function resolveCameraRelativeMovement(
  keys: ReadonlySet<string>,
  camera: Camera,
  gamepadInput: LandrushGamepadInput | null = null,
  referenceFrame: LandrushIslandMovementReferenceFrame = 'camera-forward',
): RobotMovementInput | null {
  const keyboardStrafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const keyboardForward =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'))
  const hasKeyboardInput = keyboardStrafe !== 0 || keyboardForward !== 0
  const hasGamepadInput = Boolean(gamepadInput && gamepadInput.strength > 0)
  const strafe = keyboardStrafe + (gamepadInput?.strafe ?? 0)
  const forwardInput = keyboardForward + (gamepadInput?.forward ?? 0)

  if (strafe === 0 && forwardInput === 0) return null

  const forward =
    referenceFrame === 'screen-up'
      ? resolveLandrushIslandCameraScreenAxes(camera).up
      : resolveCameraForwardXZ(camera)
  const right = { x: -forward.z, z: forward.x }
  const direction = normalize2(
    right.x * strafe + forward.x * forwardInput,
    right.z * strafe + forward.z * forwardInput,
  )
  const heading = Math.atan2(direction.x, direction.z)
  const intensity = hasKeyboardInput ? 1 : hasGamepadInput ? (gamepadInput?.strength ?? 1) : 1
  const runAmount = gamepadInput?.run ? 1 : 0
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

function resolveLandrushIslandCameraScreenAxes(camera: Camera) {
  camera.updateMatrixWorld()
  const elements = camera.matrixWorld.elements
  const right = normalize2(elements[0] ?? 1, elements[2] ?? 0)
  const up = normalize2(elements[4] ?? 0, elements[6] ?? -1)
  return { right, up }
}

function resolveLandrushIslandFallDirection(
  point: LandrushPoint2,
  surfacePoints: readonly LandrushPoint2[],
) {
  const center = centroidForPolygon(surfacePoints)
  return normalize2(point.x - center.x, point.z - center.z)
}

function resolveLandrushIslandFallBurstDirection(
  point: LandrushPoint2,
  movementDirection: LandrushPoint2,
  surfacePoints: readonly LandrushPoint2[],
) {
  const radialDirection = resolveLandrushIslandFallDirection(point, surfacePoints)
  const movementLength = Math.hypot(movementDirection.x, movementDirection.z)
  if (movementLength <= 0.001) return radialDirection

  const normalizedMovement = normalize2(movementDirection.x, movementDirection.z)
  if (dot2(normalizedMovement, radialDirection) < -0.15) return radialDirection
  return normalizedMovement
}

function resolveLandrushIslandFallLaunchVelocity({
  controllerVelocity,
  fallbackDirection,
  measuredVelocity,
}: {
  controllerVelocity: Vector3 | null
  fallbackDirection: LandrushPoint2
  measuredVelocity: Vector3
}) {
  const controllerSpeed = controllerVelocity
    ? Math.hypot(controllerVelocity.x, controllerVelocity.z)
    : 0
  const measuredSpeed = Math.hypot(measuredVelocity.x, measuredVelocity.z)
  const inheritedVelocity =
    controllerVelocity && controllerSpeed >= measuredSpeed ? controllerVelocity : measuredVelocity
  const inheritedSpeed = Math.hypot(inheritedVelocity.x, inheritedVelocity.z)
  const horizontalDirection =
    inheritedSpeed > 0.1
      ? normalize2(inheritedVelocity.x, inheritedVelocity.z)
      : normalize2(fallbackDirection.x, fallbackDirection.z)
  const forwardSpeed =
    Math.max(inheritedSpeed, LANDRUSH_ISLAND_ROBOT_FALL_MIN_FORWARD_SPEED) *
    LANDRUSH_ISLAND_ROBOT_FALL_FORWARD_MOMENTUM_MULTIPLIER

  return new Vector3(
    horizontalDirection.x * forwardSpeed,
    LANDRUSH_ISLAND_ROBOT_FALL_UP_SPEED,
    horizontalDirection.z * forwardSpeed,
  )
}

function resetLandrushIslandFallControlRotation(quaternion: Quaternion, angularVelocity: Vector3) {
  quaternion.identity()
  angularVelocity.set(0, 0, 0)
}

function resolveLandrushIslandFallControlInput({
  gamepadInput,
  keys,
  pointer,
}: {
  gamepadInput: LandrushGamepadInput | null
  keys: ReadonlySet<string>
  pointer: LandrushIslandRightHoldMove | null
}): LandrushIslandFallControlInput | null {
  let forward = 0
  let strafe = 0

  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1

  if (gamepadInput && gamepadInput.strength > 0) {
    forward += gamepadInput.forward
    strafe += gamepadInput.strafe
  }

  const pointerInput = resolveLandrushIslandPointerFallControlInput(pointer)
  if (pointerInput) {
    forward += pointerInput.forward
    strafe += pointerInput.strafe
  }

  const magnitude = Math.hypot(forward, strafe)
  if (magnitude <= 0.000001) return null

  const scale = magnitude > 1 ? 1 / magnitude : 1
  return {
    forward: forward * scale,
    strafe: strafe * scale,
    strength: Math.min(1, magnitude),
  }
}

function resolveLandrushIslandPointerFallControlInput(
  pointer: LandrushIslandRightHoldMove | null,
): LandrushIslandFallControlInput | null {
  if (!pointer) return null

  const dx = pointer.x - pointer.startX
  const dy = pointer.y - pointer.startY
  const distance = Math.hypot(dx, dy)
  if (distance <= LANDRUSH_ISLAND_ROBOT_FALL_POINTER_DEADZONE_PX) return null

  const strength = clamp01(
    (distance - LANDRUSH_ISLAND_ROBOT_FALL_POINTER_DEADZONE_PX) /
      (LANDRUSH_ISLAND_ROBOT_FALL_POINTER_FULL_INPUT_PX -
        LANDRUSH_ISLAND_ROBOT_FALL_POINTER_DEADZONE_PX),
  )
  return {
    forward: (-dy / distance) * strength,
    strafe: (dx / distance) * strength,
    strength,
  }
}

function updateLandrushIslandFallControlRotation({
  angularVelocity,
  axis,
  camera,
  cameraForward,
  cameraRight,
  cameraUp,
  deltaQuaternion,
  frameDelta,
  input,
  quaternion,
  targetAngularVelocity,
}: {
  angularVelocity: Vector3
  axis: Vector3
  camera: Camera
  cameraForward: Vector3
  cameraRight: Vector3
  cameraUp: Vector3
  deltaQuaternion: Quaternion
  frameDelta: number
  input: LandrushIslandFallControlInput | null
  quaternion: Quaternion
  targetAngularVelocity: Vector3
}) {
  const inputStrength = MathUtils.clamp(input?.strength ?? 0, 0, 1)
  targetAngularVelocity.set(0, 0, 0)

  if (inputStrength > 0) {
    camera.getWorldDirection(cameraForward).normalize()
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize()
    cameraRight.crossVectors(cameraForward, cameraUp)
    if (cameraRight.lengthSq() <= 0.000001) {
      cameraRight.set(1, 0, 0)
    } else {
      cameraRight.normalize()
    }

    targetAngularVelocity
      .addScaledVector(cameraRight, input?.forward ?? 0)
      .addScaledVector(cameraForward, -(input?.strafe ?? 0))

    if (targetAngularVelocity.lengthSq() > 0.000001) {
      targetAngularVelocity
        .normalize()
        .multiplyScalar(LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_SPEED * inputStrength)
    }
  }

  const accelerationScale = inputStrength > 0 ? inputStrength : 1
  moveVectorToward(
    angularVelocity,
    targetAngularVelocity,
    LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_ACCELERATION * accelerationScale * frameDelta,
  )

  if (angularVelocity.lengthSq() > LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_SPEED ** 2) {
    angularVelocity.setLength(LANDRUSH_ISLAND_ROBOT_FALL_CONTROL_MAX_ANGULAR_SPEED)
  }

  const angularSpeed = angularVelocity.length()
  if (angularSpeed <= 0.0001) return

  axis.copy(angularVelocity).multiplyScalar(1 / angularSpeed)
  deltaQuaternion.setFromAxisAngle(axis, angularSpeed * frameDelta)
  quaternion.premultiply(deltaQuaternion).normalize()
}

function moveVectorToward(current: Vector3, target: Vector3, maxDelta: number) {
  const deltaX = target.x - current.x
  const deltaY = target.y - current.y
  const deltaZ = target.z - current.z
  const distance = Math.hypot(deltaX, deltaY, deltaZ)
  if (distance <= maxDelta || distance <= 0.000001) {
    current.copy(target)
    return
  }
  current.addScaledVector(
    _landrushIslandMoveVectorTowardDelta.set(deltaX, deltaY, deltaZ),
    maxDelta / distance,
  )
}

const _landrushIslandMoveVectorTowardDelta = new Vector3()

function predictLandrushIslandFallWaterHitSeconds({
  startRootY,
  velocityY,
  waterY,
}: {
  startRootY: number
  velocityY: number
  waterY: number
}) {
  let elapsedSeconds = 0
  let rootY = startRootY
  let verticalVelocity = velocityY
  const frameStep = 1 / 120

  while (elapsedSeconds < 30 && rootY > waterY) {
    const fallAmount = resolveLandrushIslandFallAltitudeAmount(rootY, startRootY, waterY)
    const simulatedDelta = frameStep * resolveLandrushIslandFallSlowMotionFactor(fallAmount)
    verticalVelocity -= LANDRUSH_ISLAND_ROBOT_FALL_GRAVITY * simulatedDelta
    rootY += verticalVelocity * simulatedDelta
    elapsedSeconds += frameStep
  }

  return elapsedSeconds
}

function resolveLandrushIslandFallAltitudeAmount(
  rootY: number,
  startRootY: number,
  waterY: number,
) {
  const fallDistance = Math.max(1, startRootY - waterY)
  return clamp01((startRootY - rootY) / fallDistance)
}

function resolveLandrushIslandFallSlowMotionFactor(amount: number) {
  return MathUtils.lerp(
    LANDRUSH_ISLAND_ROBOT_FALL_INITIAL_SLOW_MOTION_FACTOR,
    LANDRUSH_ISLAND_ROBOT_FALL_WATER_SLOW_MOTION_FACTOR,
    MathUtils.smoothstep(clamp01(amount), 0, 1),
  )
}

function resolveLandrushIslandFallWiggleAmount(elapsedSeconds: number) {
  return MathUtils.smoothstep(
    elapsedSeconds,
    LANDRUSH_ISLAND_ROBOT_FALL_WIGGLE_DELAY_SECONDS,
    LANDRUSH_ISLAND_ROBOT_FALL_WIGGLE_DELAY_SECONDS +
      LANDRUSH_ISLAND_ROBOT_FALL_WIGGLE_RAMP_SECONDS,
  )
}

function createLandrushIslandRobotCliffFallBoundaryPoints(
  surface: LandrushIslandLandSurface,
): readonly LandrushPoint2[] {
  if (!surface.hasElevation || surface.plateauPoints.length < 3) return surface.grassSurfacePoints

  const plateauRing = openPointRing(surface.plateauPoints)
  const lowerCliffRing = openPointRing(surface.slopeStartPoints)
  const center = centroidForPolygon(plateauRing)
  return plateauRing.map((point, index) => {
    const lowerPoint = lowerCliffRing[index]
    const lowerDirection = lowerPoint
      ? normalize2(lowerPoint.x - point.x, lowerPoint.z - point.z)
      : normalize2(point.x - center.x, point.z - center.z)
    const lowerDistance = lowerPoint
      ? Math.hypot(lowerPoint.x - point.x, lowerPoint.z - point.z)
      : 0
    const ledgeDistance =
      lowerDistance > 0.001
        ? Math.min(
            LANDRUSH_ISLAND_ROBOT_FALL_CLIFF_LEDGE_METERS,
            lowerDistance * LANDRUSH_ISLAND_ROBOT_FALL_CLIFF_LEDGE_MAX_FRACTION,
          )
        : LANDRUSH_ISLAND_ROBOT_FALL_CLIFF_LEDGE_METERS
    return {
      x: point.x + lowerDirection.x * ledgeDistance,
      z: point.z + lowerDirection.z * ledgeDistance,
    }
  })
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

function dot2(a: LandrushPoint2, b: LandrushPoint2) {
  return a.x * b.x + a.z * b.z
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

function pickLandrushIslandWalkTargetPoint({
  camera,
  canvas,
  colliderMeshes,
  event,
  groundY,
  nodes,
  pointerNdc,
  raycaster,
}: {
  camera: Camera
  canvas: HTMLCanvasElement
  colliderMeshes: Mesh[]
  event: Pick<MouseEvent | PointerEvent, 'clientX' | 'clientY'>
  groundY: number
  nodes: Record<string, AnyNode>
  pointerNdc: Vector2
  raycaster: Raycaster
}): LandrushIslandWalkTargetPoint | null {
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
    if (normalY < LANDRUSH_ISLAND_WALK_TARGET_MIN_NORMAL_Y) continue
    return {
      levelId: resolveLandrushIslandRobotLevelId(nodes, hit.point.y, groundY),
      worldY: hit.point.y,
      x: hit.point.x,
      z: hit.point.z,
    }
  }

  const groundPoint = pickLandrushIslandBuildGroundPoint({
    camera,
    canvas,
    event,
    groundY,
    pointerNdc,
    raycaster,
  })
  return groundPoint
    ? {
        ...groundPoint,
        levelId: resolveLandrushIslandRobotLevelId(nodes, groundY, groundY),
        worldY: groundY,
      }
    : null
}

function pickLandrushIslandBuildGroundPoint({
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

function pointerEventInLandrushIslandCanvas(
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

function getLandrushIslandCanvasEventTarget(canvas: HTMLCanvasElement, connected: unknown) {
  return connected instanceof HTMLElement ? connected : canvas
}

function isLandrushIslandInteractivePointerTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLCanvasElement) return false
  const interactiveTarget = target.closest(
    'button,a,input,textarea,select,[role="button"],[role="menuitem"],[data-landrush-ui-interactive]',
  )
  if (interactiveTarget) return true

  const landrushUi = target.closest('[data-landrush-ui]')
  if (!(landrushUi instanceof HTMLElement)) return false
  const style = window.getComputedStyle(landrushUi)
  return (
    style.pointerEvents !== 'none' &&
    landrushUi.matches('button,[role="button"],input,textarea,select,a')
  )
}

function createLandrushIslandSyncedBuildNodes({
  nodes,
  parcel,
  parcelWorldId,
}: {
  nodes: Record<string, AnyNode>
  parcel: ParcelAllocationParcel
  parcelWorldId: string
}) {
  const buildNodes = collectLandrushIslandBuildNodesInsideParcel(nodes, parcel)
  const syncedIds = new Set(buildNodes.map((node) => node.id as AnyNodeId))
  return buildNodes.map((node) =>
    sanitizeLandrushIslandBuildNodeForSync(node, parcelWorldId, parcel.id, syncedIds),
  )
}

function sanitizeLandrushIslandIncomingBuildNodes(
  build: ParcelBuildNodesSnapshot,
  parcelWorldId: string,
  parcel: ParcelAllocationParcel,
) {
  const nodes = Object.fromEntries(build.nodes.map((node) => [node.id, node])) as Record<
    string,
    AnyNode
  >
  const buildNodes = collectLandrushIslandBuildNodesInsideParcel(nodes, parcel)
  const syncedIds = new Set(buildNodes.map((node) => node.id as AnyNodeId))
  return buildNodes.map((node) =>
    sanitizeLandrushIslandBuildNodeForSync(node, parcelWorldId, parcel.id, syncedIds),
  )
}

function collectLandrushIslandBuildNodesInsideParcel(
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

  const collectBuildAncestors = (id: AnyNodeId) => {
    let parentId = nodes[id]?.parentId as AnyNodeId | null
    const visited = new Set<AnyNodeId>()

    while (parentId && !visited.has(parentId)) {
      if (parentId === LANDRUSH_ISLAND_LEVEL_ID) return
      visited.add(parentId)
      const parent = nodes[parentId]
      if (!parent) return
      if (parent.type === 'building') return
      selectedIds.add(parentId)
      parentId = parent.parentId as AnyNodeId | null
    }
  }

  for (const node of Object.values(nodes)) {
    if (!isLandrushIslandBuildObjectNode(node, nodes)) continue
    if (!isLandrushIslandBuildNodeInsideParcel(node, parcel, nodes)) continue

    collectBuildAncestors(node.id as AnyNodeId)
    collectDescendants(node.id as AnyNodeId)
  }

  return Array.from(selectedIds)
    .map((id) => nodes[id])
    .filter((node): node is AnyNode => Boolean(node))
    .sort((first, second) => {
      const depthDiff =
        landrushIslandBuildNodeParentDepth(first, nodes) -
        landrushIslandBuildNodeParentDepth(second, nodes)
      return depthDiff || first.id.localeCompare(second.id)
    })
}

function sanitizeLandrushIslandBuildNodeForSync(
  node: AnyNode,
  parcelWorldId: string,
  parcelId: string,
  syncedIds?: ReadonlySet<AnyNodeId>,
) {
  const clone = JSON.parse(JSON.stringify(node)) as AnyNode & {
    children?: unknown[]
    metadata?: Record<string, unknown>
  }
  if (Array.isArray(clone.children) && syncedIds) {
    clone.children = clone.children.filter((id) => syncedIds.has(id as AnyNodeId))
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

function landrushIslandBuildNodeParentDepth(node: AnyNode, nodes: Record<string, AnyNode>) {
  let depth = 0
  let parentId = node.parentId as string | null
  const visited = new Set<string>()

  while (
    parentId &&
    parentId !== LANDRUSH_ISLAND_BUILDING_ID &&
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

function isLandrushIslandBuildNodeInsideParcel(
  node: AnyNode,
  parcel: ParcelAllocationParcel,
  nodes: Record<string, AnyNode>,
) {
  const footprints = createLandrushIslandBuildNodeFootprints(node, 0, nodes)
  return (
    footprints.length > 0 &&
    footprints.every((footprint) =>
      footprint.every((point) => pointInPolygonOrNearEdge(point, parcel.points)),
    )
  )
}

function applyLandrushIslandBuildSnapshot(
  scene: LandrushIslandSceneStore,
  parcelId: string,
  nodes: readonly AnyNode[],
) {
  const incomingIds = new Set(nodes.map((node) => node.id as AnyNodeId))
  const deleteIds = Object.values(scene.nodes)
    .filter((node) => isLandrushIslandSyncedBuildNodeForParcel(node, parcelId))
    .map((node) => node.id as AnyNodeId)
    .filter((id) => !incomingIds.has(id))
  const createNodes: { node: AnyNode; parentId?: AnyNodeId }[] = []
  const updateNodes: { id: AnyNodeId; data: Partial<AnyNode> }[] = []

  for (const node of nodes) {
    const id = node.id as AnyNodeId
    const existing = scene.nodes[id]
    if (existing) {
      if (
        isLandrushIslandSyncedBuildNodeForParcel(existing, parcelId) ||
        isLandrushIslandSyncedBuildNodeForParcel(node, parcelId)
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
          : isLandrushIslandBuildLevelNode(node)
            ? (LANDRUSH_ISLAND_BUILDING_ID as AnyNodeId)
            : (LANDRUSH_ISLAND_LEVEL_ID as AnyNodeId),
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

function isLandrushIslandSyncedBuildNodeForParcel(node: AnyNode, parcelId: string) {
  const metadata = node.metadata as
    | { landrushBuildSynced?: boolean; landrushParcelId?: string }
    | undefined
  return metadata?.landrushBuildSynced === true && metadata.landrushParcelId === parcelId
}

function signatureForLandrushIslandBuildNodes(nodes: readonly AnyNode[]) {
  return JSON.stringify(nodes)
}

function createLandrushIslandBuiltGrassBlockers(
  nodes: Record<string, AnyNode>,
): readonly GrassFieldBlocker[] {
  const blockers: GrassFieldBlocker[] = []
  for (const node of Object.values(nodes)) {
    for (const footprint of createLandrushIslandBuildNodeFootprints(node, 0, nodes)) {
      blockers.push({
        clearanceMeters: LANDRUSH_ISLAND_BUILT_GRASS_PADDING_METERS,
        featherMeters: LANDRUSH_ISLAND_BUILT_GRASS_FEATHER_METERS,
        points: footprint,
      })
    }
  }
  return blockers
}

function resolveLandrushIslandNavigationNodeLevelId(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): LevelNode['id'] | null {
  let current: AnyNode | undefined = node
  const visited = new Set<AnyNodeId>()

  while (current) {
    if (current.type === 'level') return current.id
    const parentId = current.parentId as AnyNodeId | null
    if (!parentId || visited.has(parentId)) return null
    visited.add(parentId)
    current = nodes[parentId]
  }

  return null
}

function resolveLandrushIslandStairConnectorLevels(
  stair: LandrushIslandStairNode,
  nodes: Record<string, AnyNode>,
): { fromLevelId: LevelNode['id']; toLevelId: LevelNode['id'] } | null {
  const parentLevelId = resolveLandrushIslandNavigationNodeLevelId(stair, nodes)
  const declaredFromLevel = stair.fromLevelId ? nodes[stair.fromLevelId] : undefined
  const rawFromLevelId = declaredFromLevel?.type === 'level' ? declaredFromLevel.id : parentLevelId
  if (!rawFromLevelId) return null
  const fromLevelId = resolveLandrushIslandCanonicalBuildingLevelId(nodes, rawFromLevelId)

  const declaredToLevel = stair.toLevelId ? nodes[stair.toLevelId] : undefined
  if (declaredToLevel?.type === 'level' && declaredToLevel.id !== fromLevelId) {
    return {
      fromLevelId,
      toLevelId: resolveLandrushIslandCanonicalBuildingLevelId(nodes, declaredToLevel.id),
    }
  }

  const fromLevel = nodes[fromLevelId]
  if (fromLevel?.type !== 'level') return null
  const levels = resolveLandrushIslandBuildingLevels(
    nodes,
    (fromLevel.parentId as AnyNodeId | null) ?? null,
  )
  const toLevel = levels.find((level) => level.level > fromLevel.level)
  return toLevel
    ? {
        fromLevelId,
        toLevelId: resolveLandrushIslandCanonicalBuildingLevelId(nodes, toLevel.id),
      }
    : null
}

function createLandrushIslandNavigationObstacles(
  nodes: Record<string, AnyNode>,
): readonly LandrushIslandNavigationObstacle[] {
  const obstacles: LandrushIslandNavigationObstacle[] = []
  for (const node of Object.values(nodes)) {
    if (!isLandrushIslandNavigationObstacleNode(node, nodes)) continue
    const levelId = resolveLandrushIslandNavigationNodeLevelId(node, nodes)
    if (!levelId) continue
    if (node.type === 'wall') {
      for (const footprint of createLandrushIslandWallNavigationFootprints(
        node,
        nodes,
        LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS,
      )) {
        obstacles.push({ kind: 'graph', levelId, nodeId: node.id as AnyNodeId, points: footprint })
      }
      continue
    }

    if (node.type === 'stair') {
      for (const footprint of createLandrushIslandStairNavigationFootprints(
        node,
        nodes,
        LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS,
      )) {
        obstacles.push({
          kind: 'stair',
          levelId,
          nodeId: footprint.nodeId,
          points: footprint.points,
          stairId: node.id as AnyNodeId,
        })
      }
      continue
    }

    const footprint = createLandrushIslandBuildNodeFootprint(
      node,
      LANDRUSH_ISLAND_NAVIGATION_OBSTACLE_PADDING_METERS,
      nodes,
    )
    if (!footprint) continue
    obstacles.push({
      kind: 'asset',
      levelId,
      nodeId: node.id as AnyNodeId,
      points: footprint,
    })
  }
  return obstacles
}

function createLandrushIslandDoorPortals(
  nodes: Record<string, AnyNode>,
): readonly LandrushIslandDoorPortal[] {
  const portals: LandrushIslandDoorPortal[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== 'door') continue
    const wallId = node.wallId ?? node.parentId
    const wall = wallId ? nodes[wallId as AnyNodeId] : undefined
    if (wall?.type !== 'wall') continue
    const levelId = resolveLandrushIslandNavigationNodeLevelId(wall, nodes)
    if (!levelId) continue
    const wallFrame = resolveLandrushIslandWallFrame(wall)
    if (!wallFrame) continue

    const centerX = MathUtils.clamp(node.position[0], 0, wallFrame.length)
    const crossingDistance = LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS
    const center = {
      x: wall.start[0] + wallFrame.dir.x * centerX,
      z: wall.start[1] + wallFrame.dir.z * centerX,
    }
    portals.push({
      center,
      doorId: node.id as AnyNodeId,
      halfWidth: Math.max(0.18, node.width / 2),
      levelId,
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

function createLandrushIslandStairPortals(
  nodes: Record<string, AnyNode>,
): readonly LandrushIslandStairPortal[] {
  const portals: LandrushIslandStairPortal[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== 'stair' || !isLandrushIslandBuildObjectNode(node, nodes)) continue
    portals.push(...createLandrushIslandStairNavigationPortals(node, nodes))
  }
  return portals
}

function createLandrushIslandStairConnectors(
  nodes: Record<string, AnyNode>,
): readonly LandrushIslandStairConnector[] {
  const connectors: LandrushIslandStairConnector[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== 'stair' || !isLandrushIslandBuildObjectNode(node, nodes)) continue
    const levels = resolveLandrushIslandStairConnectorLevels(node, nodes)
    if (!levels) continue
    const portals = createLandrushIslandStairNavigationPortals(node, nodes)
    const firstPortal = portals[0]
    const lastPortal = portals[portals.length - 1]
    if (!(firstPortal && lastPortal)) continue

    connectors.push({
      fromLevelId: levels.fromLevelId,
      fromPoint: clonePoint2(firstPortal.sideB),
      nodeId: node.id as AnyNodeId,
      portals,
      toLevelId: levels.toLevelId,
      toPoint: clonePoint2(lastPortal.sideA),
    })
  }
  return connectors
}

function createLandrushIslandStairNavigationFootprints(
  stair: LandrushIslandStairNode,
  nodes: Record<string, AnyNode>,
  padding: number,
): readonly LandrushIslandStairNavigationFootprint[] {
  const layouts = createLandrushIslandStraightStairSegmentLayouts(stair, nodes)
  if (layouts.length === 0) {
    return [
      {
        nodeId: stair.id as AnyNodeId,
        points: createLandrushIslandFallbackStairFootprint(stair, padding),
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

function createLandrushIslandStairNavigationPortals(
  stair: LandrushIslandStairNode,
  nodes: Record<string, AnyNode>,
): readonly LandrushIslandStairPortal[] {
  const levelId =
    resolveLandrushIslandNavigationNodeLevelId(stair, nodes) ??
    (LANDRUSH_ISLAND_LEVEL_ID as LevelNode['id'])
  const stairId = stair.id as AnyNodeId
  const layouts = createLandrushIslandStraightStairSegmentLayouts(stair, nodes)
  if (layouts.length === 0) {
    return [createLandrushIslandFallbackStairPortal(stair, levelId)]
  }

  return layouts.map((layout) => {
    const sideDistance = layout.length / 2 + LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS
    return {
      center: layout.center,
      halfRun: layout.length / 2,
      halfWidth: Math.max(0.2, layout.width / 2),
      levelId,
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
      stairId,
      tangent: layout.tangent,
    }
  })
}

function createLandrushIslandStraightStairSegmentLayouts(
  stair: LandrushIslandStairNode,
  nodes: Record<string, AnyNode>,
): readonly LandrushIslandStairSegmentLayout[] {
  if ((stair.stairType ?? 'straight') !== 'straight') return []

  const segments = (stair.children ?? [])
    .map((childId) => nodes[childId as AnyNodeId] as LandrushIslandStairSegmentNode | undefined)
    .filter(
      (segment): segment is LandrushIslandStairSegmentNode =>
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

function createLandrushIslandFallbackStairPortal(
  stair: LandrushIslandStairNode,
  levelId: LevelNode['id'],
): LandrushIslandStairPortal {
  const footprint = createLandrushIslandFallbackStairFootprint(stair, 0)
  const center = polygonCentroid(footprint)
  const normal = normalize2(Math.sin(stair.rotation ?? 0), Math.cos(stair.rotation ?? 0))
  const run = Math.max(0.8, stair.stepCount * 0.28 + stair.topLandingDepth)
  const sideDistance = run / 2 + LANDRUSH_ISLAND_DOOR_CROSSING_CLEARANCE_METERS
  return {
    center,
    halfRun: run / 2,
    halfWidth: Math.max(0.2, stair.width / 2),
    levelId,
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
    stairId: stair.id as AnyNodeId,
    tangent: normalize2(normal.z, -normal.x),
  }
}

function createLandrushIslandFallbackStairFootprint(
  stair: LandrushIslandStairNode,
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

function createLandrushIslandWallNavigationFootprints(
  wall: Extract<AnyNode, { type: 'wall' }>,
  nodes: Record<string, AnyNode>,
  padding: number,
): readonly (readonly LandrushPoint2[])[] {
  const wallFrame = resolveLandrushIslandWallFrame(wall)
  if (!wallFrame) return []

  const openings = collectLandrushIslandWallDoorOpenings(wall, nodes)
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
          pointOnLandrushIslandWall(wall, wallFrame, cursor),
          pointOnLandrushIslandWall(wall, wallFrame, opening.start),
          (wall.thickness ?? 0.18) + padding * 2,
        ),
      )
    }
    cursor = Math.max(cursor, opening.end)
  }
  if (wallFrame.length - cursor > 0.08) {
    footprints.push(
      segmentFootprint(
        pointOnLandrushIslandWall(wall, wallFrame, cursor),
        pointOnLandrushIslandWall(wall, wallFrame, wallFrame.length),
        (wall.thickness ?? 0.18) + padding * 2,
      ),
    )
  }
  return footprints
}

function collectLandrushIslandWallDoorOpenings(
  wall: Extract<AnyNode, { type: 'wall' }>,
  nodes: Record<string, AnyNode>,
) {
  const wallFrame = resolveLandrushIslandWallFrame(wall)
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

function resolveLandrushIslandWallFrame(wall: Extract<AnyNode, { type: 'wall' }>) {
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

function pointOnLandrushIslandWall(
  wall: Extract<AnyNode, { type: 'wall' }>,
  frame: NonNullable<ReturnType<typeof resolveLandrushIslandWallFrame>>,
  localX: number,
) {
  return {
    x: wall.start[0] + frame.dir.x * localX,
    z: wall.start[1] + frame.dir.z * localX,
  }
}

function createLandrushIslandInvalidBuildNodeIds(
  nodes: Record<string, AnyNode>,
  parcel: ParcelAllocationParcel,
) {
  const invalidIds: string[] = []
  for (const node of Object.values(nodes)) {
    if (!isLandrushIslandBuildObjectNode(node, nodes)) continue
    const footprints = createLandrushIslandBuildNodeFootprints(node, 0, nodes)
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

function createLandrushIslandBuildNodeFootprints(
  node: AnyNode,
  padding: number,
  nodes: Record<string, AnyNode>,
): readonly (readonly LandrushPoint2[])[] {
  if (!isLandrushIslandBuildObjectNode(node, nodes)) return []
  if (node.type === 'roof') return createLandrushIslandRoofBuildFootprints(node, padding, nodes)

  const footprint = createLandrushIslandBuildNodeFootprint(node, padding, nodes)
  return footprint ? [footprint] : []
}

function createLandrushIslandRoofBuildFootprints(
  roof: LandrushIslandRoofNode,
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
    const segment = nodes[childId] as LandrushIslandRoofSegmentNode | undefined
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

function createLandrushIslandBuildNodeFootprint(
  node: AnyNode,
  padding: number,
  nodes?: Record<string, AnyNode>,
): readonly LandrushPoint2[] | null {
  if (!isLandrushIslandBuildObjectNode(node, nodes)) return null

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
    if (node.asset.attachTo) return null
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

function isLandrushIslandBuildLevelNode(node: AnyNode | undefined): node is LevelNode {
  return node?.type === 'level' && node.parentId === LANDRUSH_ISLAND_BUILDING_ID
}

function isLandrushIslandBuildLevelId(
  levelId: AnyNodeId | string | null | undefined,
  nodes?: Record<string, AnyNode>,
) {
  if (!levelId) return false
  if (levelId === LANDRUSH_ISLAND_LEVEL_ID) return true
  if (!nodes) return false
  return isLandrushIslandBuildLevelNode(nodes[levelId as AnyNodeId])
}

function isLandrushIslandBuildObjectNode(node: AnyNode, nodes?: Record<string, AnyNode>) {
  if (node.visible === false || !isLandrushIslandBuildLevelId(node.parentId, nodes)) return false
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

function isLandrushIslandNavigationObstacleNode(node: AnyNode, nodes: Record<string, AnyNode>) {
  if (node.visible === false || !isLandrushIslandBuildLevelId(node.parentId, nodes)) return false
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

function resolveLandrushIslandNavigationSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly LandrushIslandStairPortal[] = [],
): LandrushIslandNavigationSteeringResult | null {
  const directPassable = landrushIslandNavigationSegmentPassable(
    start,
    target,
    obstacles,
    surfacePoints,
  )
  const doorCrossingPoint = resolveLandrushIslandDoorCrossingSteeringPoint(
    start,
    target,
    obstacles,
    doorPortals,
    surfacePoints,
    directPassable,
  )
  if (doorCrossingPoint) return doorCrossingPoint
  const stairCrossingPoint = resolveLandrushIslandStairCrossingSteeringPoint(
    start,
    target,
    obstacles,
    stairPortals,
    surfacePoints,
    directPassable,
  )
  if (stairCrossingPoint) return stairCrossingPoint
  if (directPassable) return { kind: 'direct', point: target }

  const candidates = collectLandrushIslandNavigationCandidates(
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
      if (
        !next ||
        !landrushIslandNavigationSegmentPassable(current, next, obstacles, surfacePoints)
      ) {
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

function resolveLandrushIslandDoorCrossingSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  directPassable: boolean,
): LandrushIslandNavigationSteeringResult | null {
  let best: { point: LandrushIslandNavigationSteeringResult; score: number } | null = null

  for (const portal of doorPortals) {
    const startSigned = signedLandrushIslandDoorPortalDistance(start, portal)
    const targetSigned = signedLandrushIslandDoorPortalDistance(target, portal)
    const startTangent = tangentLandrushIslandDoorPortalDistance(start, portal)
    const targetTangent = tangentLandrushIslandDoorPortalDistance(target, portal)
    const tangentLimit = portal.halfWidth + LANDRUSH_ISLAND_DOOR_CROSSING_TANGENT_MARGIN_METERS
    const startNearCenter =
      Math.abs(startSigned) <= LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS &&
      Math.abs(startTangent) <= tangentLimit
    const targetNearCenter =
      Math.abs(targetSigned) <= LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS &&
      Math.abs(targetTangent) <= tangentLimit
    const segmentCrossing = resolveLandrushIslandDoorSegmentCrossing(start, target, portal)
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
      !landrushIslandNavigationSegmentPassable(entry, portal.center, obstacles, surfacePoints) ||
      !landrushIslandNavigationSegmentPassable(portal.center, exit, obstacles, surfacePoints)
    ) {
      continue
    }

    if (!directPassable) {
      const startToEntryReached =
        Math.hypot(start.x - entry.x, start.z - entry.z) <=
        LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS
      const exitToTargetReached =
        Math.hypot(target.x - exit.x, target.z - exit.z) <=
        LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS
      if (
        !startToEntryReached &&
        !landrushIslandNavigationSegmentPassable(start, entry, obstacles, surfacePoints)
      ) {
        continue
      }
      if (
        !exitToTargetReached &&
        !landrushIslandNavigationSegmentPassable(exit, target, obstacles, surfacePoints)
      ) {
        continue
      }
    }

    const nextPoint = nextLandrushIslandDoorCrossingWaypoint(start, entry, portal.center, exit)
    if (!nextPoint) continue
    const phase = landrushIslandDoorCrossingPhaseForPoint(nextPoint, entry, portal.center, exit)
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

function resolveLandrushIslandStairCrossingSteeringPoint(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  stairPortals: readonly LandrushIslandStairPortal[],
  surfacePoints: readonly LandrushPoint2[],
  directPassable: boolean,
): LandrushIslandNavigationSteeringResult | null {
  let best: { point: LandrushIslandNavigationSteeringResult; score: number } | null = null

  for (const portal of stairPortals) {
    const crossingObstacles = landrushIslandNavigationObstaclesWithoutStairRun(obstacles, portal)
    const startSigned = signedLandrushIslandStairPortalDistance(start, portal)
    const targetSigned = signedLandrushIslandStairPortalDistance(target, portal)
    const startTangent = tangentLandrushIslandStairPortalDistance(start, portal)
    const targetTangent = tangentLandrushIslandStairPortalDistance(target, portal)
    const tangentLimit = portal.halfWidth + LANDRUSH_ISLAND_DOOR_CROSSING_TANGENT_MARGIN_METERS
    const runLimit = portal.halfRun + LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS
    const startWithinStair =
      Math.abs(startSigned) <= runLimit && Math.abs(startTangent) <= tangentLimit
    const targetWithinStair =
      Math.abs(targetSigned) <= runLimit && Math.abs(targetTangent) <= tangentLimit
    const segmentCrossing = resolveLandrushIslandStairSegmentCrossing(start, target, portal)
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
      !landrushIslandNavigationSegmentPassable(
        entry,
        portal.center,
        crossingObstacles,
        surfacePoints,
      ) ||
      !landrushIslandNavigationSegmentPassable(
        portal.center,
        exit,
        crossingObstacles,
        surfacePoints,
      )
    ) {
      continue
    }

    if (!directPassable) {
      const startToEntryReached =
        Math.hypot(start.x - entry.x, start.z - entry.z) <=
        LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS
      const exitToTargetReached =
        targetWithinStair ||
        Math.hypot(target.x - exit.x, target.z - exit.z) <=
          LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS
      if (
        !startToEntryReached &&
        !landrushIslandNavigationSegmentPassable(start, entry, crossingObstacles, surfacePoints)
      ) {
        continue
      }
      if (
        !exitToTargetReached &&
        !landrushIslandNavigationSegmentPassable(exit, target, crossingObstacles, surfacePoints)
      ) {
        continue
      }
    }

    const nextPoint = nextLandrushIslandDoorCrossingWaypoint(start, entry, portal.center, exit)
    if (!nextPoint) continue
    const phase = landrushIslandDoorCrossingPhaseForPoint(nextPoint, entry, portal.center, exit)
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

function signedLandrushIslandDoorPortalDistance(
  point: LandrushPoint2,
  portal: LandrushIslandDoorPortal,
) {
  return (
    (point.x - portal.center.x) * portal.normal.x + (point.z - portal.center.z) * portal.normal.z
  )
}

function tangentLandrushIslandDoorPortalDistance(
  point: LandrushPoint2,
  portal: LandrushIslandDoorPortal,
) {
  return (
    (point.x - portal.center.x) * portal.tangent.x + (point.z - portal.center.z) * portal.tangent.z
  )
}

function portalSideForSignedDistance(distance: number) {
  if (distance > LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS) return 1
  if (distance < -LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS) return -1
  return 0
}

function portalPointForSide(portal: LandrushIslandDoorPortal, side: number) {
  return side >= 0 ? portal.sideA : portal.sideB
}

function signedLandrushIslandStairPortalDistance(
  point: LandrushPoint2,
  portal: LandrushIslandStairPortal,
) {
  return (
    (point.x - portal.center.x) * portal.normal.x + (point.z - portal.center.z) * portal.normal.z
  )
}

function tangentLandrushIslandStairPortalDistance(
  point: LandrushPoint2,
  portal: LandrushIslandStairPortal,
) {
  return (
    (point.x - portal.center.x) * portal.tangent.x + (point.z - portal.center.z) * portal.tangent.z
  )
}

function stairPortalPointForSide(portal: LandrushIslandStairPortal, side: number) {
  return side >= 0 ? portal.sideA : portal.sideB
}

function resolveLandrushIslandStairConnectorTarget(
  start: LandrushPoint2,
  target: LandrushPoint2,
  stairPortals: readonly LandrushIslandStairPortal[],
): LandrushPoint2 {
  let best: { point: LandrushPoint2; score: number } | null = null

  for (const portal of stairPortals) {
    const targetSigned = signedLandrushIslandStairPortalDistance(target, portal)
    const targetTangent = tangentLandrushIslandStairPortalDistance(target, portal)
    const tangentLimit = portal.halfWidth + LANDRUSH_ISLAND_DOOR_CROSSING_TANGENT_MARGIN_METERS
    const runLimit = portal.halfRun + LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS
    if (Math.abs(targetSigned) > runLimit || Math.abs(targetTangent) > tangentLimit) continue

    const startSigned = signedLandrushIslandStairPortalDistance(start, portal)
    const startSide = portalSideForSignedDistance(startSigned)
    const targetSide = portalSideForSignedDistance(targetSigned)
    const exitSide = startSide ? -startSide : targetSide || 1
    const point = stairPortalPointForSide(portal, exitSide)
    const score = Math.abs(targetSigned) + Math.abs(targetTangent)
    if (!best || score < best.score) best = { point, score }
  }

  return best?.point ?? target
}

function resolveLandrushIslandDoorSegmentCrossing(
  start: LandrushPoint2,
  target: LandrushPoint2,
  portal: LandrushIslandDoorPortal,
) {
  const startSigned = signedLandrushIslandDoorPortalDistance(start, portal)
  const targetSigned = signedLandrushIslandDoorPortalDistance(target, portal)
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
    tangent: tangentLandrushIslandDoorPortalDistance(point, portal),
  }
}

function resolveLandrushIslandStairSegmentCrossing(
  start: LandrushPoint2,
  target: LandrushPoint2,
  portal: LandrushIslandStairPortal,
) {
  const startSigned = signedLandrushIslandStairPortalDistance(start, portal)
  const targetSigned = signedLandrushIslandStairPortalDistance(target, portal)
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
    tangent: tangentLandrushIslandStairPortalDistance(point, portal),
  }
}

function nextLandrushIslandDoorCrossingWaypoint(
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
    entryDistance <= LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS ||
    (progressFromEntry >= -LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS &&
      lateralFromRoute <= LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS)
  const centerAligned =
    centerDistance <= LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS ||
    (progressFromEntry >= centerFromEntry - LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS &&
      lateralFromRoute <= LANDRUSH_ISLAND_DOOR_CROSSING_CENTER_RADIUS)
  const exitAligned =
    exitDistance <= LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS ||
    (progressFromEntry >= routeLength - LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS &&
      lateralFromRoute <= LANDRUSH_ISLAND_DOOR_CROSSING_WAYPOINT_RADIUS)

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

function landrushIslandDoorCrossingPhaseForPoint(
  point: LandrushPoint2,
  entry: LandrushPoint2,
  center: LandrushPoint2,
  exit: LandrushPoint2,
): LandrushIslandDoorCrossingPhase {
  if (Math.hypot(point.x - entry.x, point.z - entry.z) <= 0.001) return 'entry'
  if (Math.hypot(point.x - center.x, point.z - center.z) <= 0.001) return 'center'
  if (Math.hypot(point.x - exit.x, point.z - exit.z) <= 0.001) return 'exit'
  return 'entry'
}

function collectLandrushIslandNavigationCandidates(
  start: LandrushPoint2,
  target: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  doorPortals: readonly LandrushIslandDoorPortal[],
  surfacePoints: readonly LandrushPoint2[],
  stairPortals: readonly LandrushIslandStairPortal[] = [],
) {
  const candidates: LandrushPoint2[] = []
  for (const portal of doorPortals) {
    for (const point of [portal.sideA, portal.center, portal.sideB]) {
      if (!pointInPolygon(point, surfacePoints)) continue
      if (pointInLandrushIslandNavigationObstacle(point, obstacles)) continue
      candidates.push(point)
    }
  }
  for (const portal of stairPortals) {
    for (const point of [portal.sideA, portal.center, portal.sideB]) {
      if (!pointInPolygon(point, surfacePoints)) continue
      if (pointInLandrushIslandNavigationObstacle(point, obstacles)) continue
      candidates.push(point)
    }
  }
  for (const obstacle of obstacles) {
    for (const vertex of obstacle.points) {
      const candidate = offsetLandrushIslandNavigationCandidate(
        vertex,
        obstacle.points,
        LANDRUSH_ISLAND_NAVIGATION_VERTEX_OFFSET_METERS,
      )
      if (!pointInPolygon(candidate, surfacePoints)) continue
      if (pointInLandrushIslandNavigationObstacle(candidate, obstacles)) continue
      candidates.push(candidate)
    }
  }

  return candidates
    .sort(
      (first, second) =>
        navigationCandidateScore(first, start, target) -
        navigationCandidateScore(second, start, target),
    )
    .slice(0, LANDRUSH_ISLAND_NAVIGATION_MAX_GRAPH_POINTS)
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

function offsetLandrushIslandNavigationCandidate(
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

function landrushIslandNavigationSegmentPassable(
  start: LandrushPoint2,
  end: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
  surfacePoints: readonly LandrushPoint2[],
) {
  return (
    landrushIslandNavigationSegmentInSurface(start, end, surfacePoints) &&
    !landrushIslandNavigationSegmentBlocked(start, end, obstacles)
  )
}

function landrushIslandNavigationSegmentInSurface(
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

function landrushIslandNavigationSegmentBlocked(
  start: LandrushPoint2,
  end: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
) {
  for (const obstacle of obstacles) {
    if (landrushIslandNavigationSegmentIntersectsPolygon(start, end, obstacle.points)) return true
  }
  return false
}

function landrushIslandNavigationObstaclesWithoutStairRun(
  obstacles: readonly LandrushIslandNavigationObstacle[],
  portal: LandrushIslandStairPortal,
) {
  return obstacles.filter(
    (obstacle) =>
      obstacle.nodeId !== portal.nodeId &&
      !(obstacle.kind === 'stair' && obstacle.stairId === portal.stairId) &&
      !(obstacle.kind === 'stair' && pointInPolygonOrNearEdge(portal.center, obstacle.points)),
  )
}

function pointInLandrushIslandNavigationObstacle(
  point: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
) {
  for (const obstacle of obstacles) {
    if (pointInPolygon(point, obstacle.points)) return true
  }
  return false
}

function pointInLandrushIslandBlockingNavigationObstacle(
  point: LandrushPoint2,
  obstacles: readonly LandrushIslandNavigationObstacle[],
) {
  for (const obstacle of obstacles) {
    if (obstacle.kind === 'stair') continue
    if (pointInPolygon(point, obstacle.points)) return true
  }
  return false
}

function openApproachingLandrushIslandDoorPortal(
  position: Vector3,
  movement: RobotMovementInput,
  doorPortals: readonly LandrushIslandDoorPortal[],
) {
  openNearbyLandrushIslandDoorPortal(position, doorPortals)

  const start = { x: position.x, z: position.z }
  const end = {
    x: start.x + movement.x * LANDRUSH_ISLAND_DOOR_OPEN_LOOKAHEAD_METERS,
    z: start.z + movement.z * LANDRUSH_ISLAND_DOOR_OPEN_LOOKAHEAD_METERS,
  }
  for (const portal of doorPortals) {
    const ahead = nearestForwardLandrushIslandDoorPortalDistance(start, movement, portal)
    if (!Number.isFinite(ahead) || ahead > LANDRUSH_ISLAND_DOOR_OPEN_LOOKAHEAD_METERS) continue
    const distanceToPath = Math.min(
      distanceToSegment2(portal.center, start, end),
      distanceToSegment2(portal.sideA, start, end),
      distanceToSegment2(portal.sideB, start, end),
    )
    if (distanceToPath <= LANDRUSH_ISLAND_DOOR_OPEN_PATH_CLEARANCE_METERS) {
      openLandrushIslandDoor(portal.doorId)
    }
  }
}

function openLandrushIslandDoorPortalsAlongSegment(
  start: LandrushPoint2,
  target: LandrushPoint2,
  doorPortals: readonly LandrushIslandDoorPortal[],
) {
  for (const portal of doorPortals) {
    const crossing = resolveLandrushIslandDoorSegmentCrossing(start, target, portal)
    if (!crossing) continue
    const tangentLimit = portal.halfWidth + LANDRUSH_ISLAND_DOOR_CROSSING_TANGENT_MARGIN_METERS
    if (Math.abs(crossing.tangent) > tangentLimit) continue
    const openState = openLandrushIslandDoor(portal.doorId)
    if (openState === 'started') {
      recordLandrushIslandNavigationProbe({
        doorId: portal.doorId,
        kind: 'door-open-on-segment',
        tangent: roundPerf(crossing.tangent),
      })
    }
  }
}

function nearestForwardLandrushIslandDoorPortalDistance(
  start: LandrushPoint2,
  movement: RobotMovementInput,
  portal: LandrushIslandDoorPortal,
) {
  let nearest = Number.POSITIVE_INFINITY
  for (const point of [portal.sideA, portal.center, portal.sideB]) {
    const ahead = (point.x - start.x) * movement.x + (point.z - start.z) * movement.z
    if (ahead > 0 && ahead < nearest) nearest = ahead
  }
  return nearest
}

function openNearbyLandrushIslandDoorPortal(
  position: Vector3,
  doorPortals: readonly LandrushIslandDoorPortal[],
) {
  const point = { x: position.x, z: position.z }
  for (const portal of doorPortals) {
    const distance = Math.min(
      Math.hypot(point.x - portal.center.x, point.z - portal.center.z),
      Math.hypot(point.x - portal.sideA.x, point.z - portal.sideA.z),
      Math.hypot(point.x - portal.sideB.x, point.z - portal.sideB.z),
    )
    if (distance <= LANDRUSH_ISLAND_DOOR_OPEN_TRIGGER_METERS) {
      openLandrushIslandDoor(portal.doorId)
    }
  }
}

function openLandrushIslandDoor(doorId: AnyNodeId) {
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
      durationMs: LANDRUSH_ISLAND_DOOR_OPEN_ANIMATION_MS,
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
    activeAnimation.to >= LANDRUSH_ISLAND_DOOR_OPEN_SWING_ANGLE * 0.98
  ) {
    return 'already-open'
  }
  const currentSwingAngle =
    interactive.doors[doorId]?.swingAngle ??
    (activeAnimation?.field === 'swingAngle' ? activeAnimation.to : undefined) ??
    node.swingAngle ??
    0
  if (currentSwingAngle >= LANDRUSH_ISLAND_DOOR_OPEN_SWING_ANGLE * 0.82) return 'already-open'
  interactive.startDoorAnimation(doorId, {
    durationMs: LANDRUSH_ISLAND_DOOR_OPEN_ANIMATION_MS,
    field: 'swingAngle',
    from: currentSwingAngle,
    persist: false,
    startedAt: null,
    to: LANDRUSH_ISLAND_DOOR_OPEN_SWING_ANGLE,
  })
  return 'started'
}

function landrushIslandNavigationSegmentIntersectsPolygon(
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
  tolerance = LANDRUSH_ISLAND_BUILD_PARCEL_EDGE_TOLERANCE_METERS,
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

function distanceToOpenPolyline(point: LandrushPoint2, polyline: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
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

function releaseLandrushIslandPointerLock() {
  if (!(document.pointerLockElement instanceof HTMLCanvasElement)) return false
  document.exitPointerLock()
  return true
}

function requestLandrushIslandPointerLock(canvas?: HTMLCanvasElement | null) {
  if (typeof document === 'undefined') return false
  const target = canvas ?? findLandrushIslandPointerLockCanvas()
  if (!(target instanceof HTMLCanvasElement)) return false
  if (document.pointerLockElement === target) return true
  void Promise.resolve(target.requestPointerLock()).catch(() => undefined)
  return true
}

function findLandrushIslandPointerLockCanvas() {
  const canvases = Array.from(document.querySelectorAll('canvas'))
  return (
    canvases
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ canvas, rect }) => {
        if (rect.width < 16 || rect.height < 16) return false
        return window.getComputedStyle(canvas).pointerEvents !== 'none'
      })
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.canvas ??
    null
  )
}

function createLandrushIslandViewerLandSurface(
  surface: LandrushIslandLandSurface,
): LandrushIslandLandSurface {
  const elevationOffset = surface.grassSurfaceElevation
  return {
    ...surface,
    grassSurfaceElevation: 0,
    plateauElevation: surface.plateauElevation - elevationOffset,
  }
}

function createLandrushIslandGrassRoadSegments(
  segments: LandrushWorldNode['roads']['segments'],
): readonly LandrushRoadSegment[] {
  return segments.map((segment) => ({
    connectsParcelIds: segment.connectsParcelIds,
    fromNodeId: segment.fromNodeId,
    id: `landrush-island-grass-${segment.id}`,
    kind: segment.kind === 'driveway' ? 'driveway' : 'spine',
    points: segment.points,
    r3fPoints: segment.points.map((point) => [point.x, 0, point.z] satisfies LandrushVec3),
    toNodeId: segment.toNodeId,
    width: segment.width,
  }))
}

function createLandrushIslandPerimeter(island: LandrushIslandIsland): LandrushIslandPerimeter {
  return {
    bounds: island.perimeter.bounds,
    closed: island.perimeter.closed,
    points: [...island.perimeter.points],
  }
}

function createLandrushIslandNodeRenderSignature(node: LandrushIslandNode) {
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

function createLandrushIslandNode({
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
  perimeter: LandrushIslandPerimeter
  profilePlainWaterMaterial?: boolean
  showDepthReference: boolean
  terrainFieldResolution: number
  waterFieldDebugMode?: LandrushIslandFieldDebugMode
  waterLabSeed: string
}) {
  const landSurface = createLandrushIslandLandSurface({
    elevationParameters,
    shorelinePoints: perimeter.points,
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const waterNode: LandrushIslandNode = {
    object: 'node',
    id: LANDRUSH_ISLAND_NODE_ID as never,
    type: 'pascal-water',
    name: 'Landrush Island Water',
    parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
      source: 'landrush-island-debug',
      ...(waterFieldDebugMode ? { waterFieldDebugMode } : {}),
      waterLabSeed,
    },
  }

  return { waterNode }
}

function createLandrushIslandLayoutNode({
  allocation,
  island,
  landSurface,
  layoutConfig,
}: {
  allocation: ParcelAllocationResult
  island: LandrushIslandIsland
  landSurface: LandrushIslandLandSurface
  layoutConfig: LandrushIslandExperienceConfig
}): LandrushIslandLayoutNode {
  const streetNetwork = generateParcelEdgeStreets(allocation, {
    loopiness: 0,
    roadWidthMeters: LANDRUSH_ISLAND_DIRT_ROAD_WIDTH_METERS,
    seed: `${island.seed}:world-streets:${LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount}`,
  })
  const perimeterPoints = openPointRing(landSurface.grassSurfacePoints)
  const bounds = boundsForPoints(perimeterPoints)
  const center = polygonCentroid(perimeterPoints)
  const roadNodes = createLandrushIslandRoadNodes(streetNetwork)
  const roadSegments = streetNetwork.segments.map((segment) =>
    createLandrushIslandRoadSegment(segment),
  )
  const layoutNode = {
    object: 'node',
    id: layoutConfig.layoutNodeId as never,
    type: layoutConfig.layoutNodeKind,
    name: layoutConfig.layoutNodeName,
    parentId: LANDRUSH_ISLAND_LEVEL_ID,
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
    parcels: allocation.parcels.map(createLandrushIslandParcel),
    ownerParcelId: '',
    roads: {
      adjacency: createLandrushIslandRoadAdjacency(roadSegments),
      connected: streetNetwork.roadConnected,
      connectedParcelIds: [...streetNetwork.connectedParcelIds],
      nodes: roadNodes,
      segments: roadSegments,
      sidewalks: [],
    },
    trees: [],
    playerStart: [center.x, LANDRUSH_ISLAND_VISUAL_PLAYER_GROUND_Y, center.z],
    playerPosition: [center.x, LANDRUSH_ISLAND_VISUAL_PLAYER_GROUND_Y, center.z],
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
          pass: allocation.parcels.length === LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount,
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

function createLandrushIslandSceneGraph(options: {
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  islandParameters: WaterLabIslandParameters
  layoutConfig: LandrushIslandExperienceConfig
  materialParameters: LandrushWaterSurfaceParameters
  omitWaterNode?: boolean
  profilePlainWaterMaterial?: boolean
  showDepthReference: boolean
  terrainFieldResolution: number
  waterFieldDebugMode?: LandrushIslandFieldDebugMode
}): {
  landrushLayoutNode: LandrushIslandLayoutNode
  sceneGraph: SceneGraph
  waterNode: LandrushIslandNode
} {
  const island = generateWaterLabIsland(options.islandParameters)
  const landSurface = createLandrushIslandLandSurface({
    elevationParameters: options.elevationParameters,
    shorelinePoints: createLandrushIslandSmoothedPerimeter(island.perimeter.points),
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const { waterNode } = createLandrushIslandNode({
    elevationParameters: options.elevationParameters,
    fieldParameters: options.fieldParameters,
    materialParameters: options.materialParameters,
    perimeter: createLandrushIslandPerimeter(island),
    profilePlainWaterMaterial: options.profilePlainWaterMaterial,
    showDepthReference: options.showDepthReference,
    terrainFieldResolution: options.terrainFieldResolution,
    waterFieldDebugMode: options.waterFieldDebugMode,
    waterLabSeed: island.seed,
  })
  const landrushLayoutNode = createLandrushIslandLayoutNode({
    allocation: allocateParcels(
      landSurface.grassSurfacePoints,
      createLandrushIslandParcelOptions(island.seed),
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
    id: LANDRUSH_ISLAND_LEVEL_ID,
    type: 'level',
    name: 'Landrush Island Level',
    parentId: LANDRUSH_ISLAND_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...LANDRUSH_ISLAND_CAMERA_POSITION],
      target: [...LANDRUSH_ISLAND_CAMERA_TARGET],
      zoom: LANDRUSH_ISLAND_CAMERA_ZOOM,
    },
    children: levelChildren,
    level: 0,
    metadata: { source: 'landrush-island-debug' },
  }

  return {
    landrushLayoutNode,
    waterNode,
    sceneGraph: {
      rootNodeIds: [LANDRUSH_ISLAND_SITE_ID],
      nodes: {
        [LANDRUSH_ISLAND_SITE_ID]: {
          object: 'node',
          id: LANDRUSH_ISLAND_SITE_ID,
          type: 'site',
          name: 'Landrush Island Site',
          parentId: null,
          visible: false,
          metadata: { source: 'landrush-island-debug' },
          polygon: {
            points: [],
            type: 'polygon',
          },
          children: [LANDRUSH_ISLAND_BUILDING_ID],
        },
        [LANDRUSH_ISLAND_BUILDING_ID]: {
          object: 'node',
          id: LANDRUSH_ISLAND_BUILDING_ID,
          type: 'building',
          name: 'Landrush Island Context',
          parentId: LANDRUSH_ISLAND_SITE_ID,
          visible: true,
          metadata: { source: 'landrush-island-debug' },
          children: [LANDRUSH_ISLAND_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [LANDRUSH_ISLAND_LEVEL_ID]: level,
        [landrushLayoutNode.id]: landrushLayoutNode,
        ...(options.omitWaterNode ? {} : { [waterNode.id]: waterNode }),
      },
    },
  }
}

function createLandrushIslandParcelOptions(seed: string): ParcelAllocationOptions {
  return {
    count: LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount,
    maxEdges: LANDRUSH_ISLAND_PARCEL_PARAMETERS.maxEdges,
    seed: `${seed}:world-parcels:${LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount}`,
    shoreSetbackMeters: LANDRUSH_ISLAND_PARCEL_PARAMETERS.shoreSetbackMeters,
    simplifyToleranceMeters: LANDRUSH_ISLAND_PARCEL_PARAMETERS.simplifyToleranceMeters,
    splitJitter: LANDRUSH_ISLAND_PARCEL_PARAMETERS.splitJitter,
    squareness: LANDRUSH_ISLAND_PARCEL_PARAMETERS.squareness,
  }
}

function createLandrushIslandParcelOwnershipWorldId(options: ParcelAllocationOptions) {
  return [
    'landrush-world',
    'landrush-island',
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

function createLandrushIslandParcel(
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
    fillColor: LANDRUSH_ISLAND_PARCEL_OVERLAY_COLOR,
    id: parcel.id,
    index: parcel.index,
    kind: 'neighbor',
    label: `Parcel ${parcel.index + 1}`,
    outline: [...parcel.points],
    owner: {
      accentColor: LANDRUSH_ISLAND_PARCEL_OVERLAY_COLOR,
      id: 'unclaimed',
      label: 'Unclaimed',
    },
    radius: Math.sqrt(Math.max(0.001, parcel.area) / Math.PI),
    vertices: [...parcel.points],
  }
}

function createLandrushIslandRoadNodes(network: ParcelStreetNetwork) {
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

function createLandrushIslandRoadSegment(
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

function createLandrushIslandRoadAdjacency(
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
