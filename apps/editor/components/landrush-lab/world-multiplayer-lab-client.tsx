'use client'

import {
  type AnyNode,
  type LandrushWorldNode,
  LandrushWorldNode as LandrushWorldNodeSchema,
  useScene,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import {
  LandrushRobot,
  type LandrushRobotAnimationState,
} from '@pascal-app/nodes/landrush-world/robot'
import { renderScheduler, useViewer } from '@pascal-app/viewer'
import { Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Box,
  DoorOpen,
  Hammer,
  Map as MapIcon,
  MousePointer2,
  Paintbrush,
  Square,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Camera,
  Color,
  type Group,
  MathUtils,
  type Mesh,
  type MeshBasicMaterial,
  Raycaster,
  Shape,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import {
  LANDRUSH_BUILDING_ID,
  LANDRUSH_LEVEL_ID,
  LANDRUSH_WORLD_ID,
} from '@/components/landrush/pascal-landrush-scene'
import type { LandrushPoint2 } from '@/components/landrush/types'
import { type LandrushGamepadInput, readLandrushGamepadInput } from './landrush-gamepad-input'
import {
  frameIndependentResponseAmount,
  REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS,
  REMOTE_PRESENTATION_MOVEMENT_FRESH_MS,
  type RemotePresentationTimeline,
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
  shortestAngleDistance,
  shouldContinueRemotePresentation,
} from './multiplayer-presentation'
import type { ParcelAllocationParcel, ParcelAllocationResult } from './parcel-allocation'
import type { ParcelStreetNetwork } from './parcel-streets'
import { LandrushRobotFootstepAudio } from './robot-footstep-audio'
import type { StylizedGrassInteraction, StylizedGrassPerfProbe } from './stylized-scene-land-layers'
import type { WaterLandSurface } from './water-scene'
import { WorldLabClient } from './world-lab-client'
import {
  isSpatialVoiceSignalPayload,
  SpatialVoiceControl,
  type SpatialVoiceController,
  type SpatialVoiceSignalMessage,
  type SpatialVoiceSignalPayload,
  useLandrushSpatialVoice,
} from './world-multiplayer-spatial-audio'
import { SpatialVoiceRangeRing } from './world-multiplayer-spatial-voice-range'

declare global {
  interface Window {
    __LANDRUSH_WORLD_MULTIPLAYER_LAB__?: unknown
  }
}

export type LocalPlayerProfile = {
  color: string
  id: string
  name: string
}

export type MultiplayerPlayerSnapshot = LocalPlayerProfile & {
  heading: number
  moving: boolean
  pose?: 'falling'
  position: [number, number, number]
  speed: number
  updatedAt: number
}

export type MultiplayerRemotePlayerStore = {
  getPresentationSnapshot: (id: string, now: number) => MultiplayerPlayerSnapshot | null
  getSnapshot: (id: string) => MultiplayerPlayerSnapshot | null
  getSnapshots: () => MultiplayerPlayerSnapshot[]
}

type MultiplayerRemotePlayerTimeline = RemotePresentationTimeline<MultiplayerPlayerSnapshot>

export type ParcelOwnership = {
  claimedAt: number
  owner: LocalPlayerProfile
  parcelId: string
  worldId: string
}

export type ParcelClaimError = {
  code: string
  message: string
  parcelId?: string
  worldId?: string
}

export type ParcelBuildNodesSnapshot = {
  nodes: AnyNode[]
  parcelId: string
  updatedAt: number
  updatedBy: string
  worldId: string
}

export type TvMediaStateSnapshot = {
  muted: boolean
  parcelId: string
  playbackSeconds: number
  playbackUpdatedAt: number
  playing: boolean
  tvId: string
  updatedAt: number
  updatedBy: string
  url: string
  userVolume: number
  worldId: string
}

type OfflineParcelStateStore = Record<
  string,
  | {
      builds?: ParcelBuildNodesSnapshot[]
      ownerships?: ParcelOwnership[]
      tvMediaStates?: TvMediaStateSnapshot[]
    }
  | undefined
>

export type ConnectionStatus = 'connected' | 'connecting' | 'offline' | 'reconnecting'

type ServerMessage =
  | {
      connectionId: string
      heartbeatIntervalMs: number
      maxPeers: number
      serverTime: number
      stalePeerMs: number
      type: 'welcome'
    }
  | { players: MultiplayerPlayerSnapshot[]; roomId: string; serverTime: number; type: 'snapshot' }
  | {
      player: MultiplayerPlayerSnapshot
      roomId: string
      serverTime: number
      type: 'player-joined' | 'player-state'
    }
  | {
      from: string
      roomId: string
      serverTime: number
      signal: SpatialVoiceSignalPayload
      type: 'voice-signal'
    }
  | { id: string; reason?: string; roomId: string; serverTime: number; type: 'player-left' }
  | {
      ownership: ParcelOwnership
      roomId: string
      serverTime: number
      type: 'parcel-claim-result' | 'parcel-owned'
    }
  | {
      code: string
      message: string
      parcelId?: string
      roomId?: string
      serverTime: number
      type: 'parcel-claim-rejected'
      worldId?: string
    }
  | {
      ownerships: ParcelOwnership[]
      roomId: string
      serverTime: number
      type: 'parcel-ownership-snapshot'
      worldId: string
    }
  | {
      builds: ParcelBuildNodesSnapshot[]
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-snapshot'
      worldId: string
    }
  | {
      build: ParcelBuildNodesSnapshot
      roomId: string
      serverTime: number
      type: 'parcel-build-nodes-synced' | 'parcel-build-nodes-updated'
    }
  | {
      roomId: string
      serverTime: number
      tvs: TvMediaStateSnapshot[]
      type: 'tv-media-state-snapshot'
      worldId: string
    }
  | {
      roomId: string
      serverTime: number
      tv: TvMediaStateSnapshot
      type: 'tv-media-state-synced' | 'tv-media-state-updated'
    }
  | { playerCount: number; roomId: string; serverTime: number; type: 'room-state' }
  | {
      playerCount?: number
      roomId?: string
      sentAt?: number
      serverTime: number
      type: 'heartbeat'
    }
  | { code: string; message: string; serverTime: number; type: 'error' }

export type MultiplayerConnectionDetails = {
  connectionId: string | null
  heartbeatIntervalMs: number
  latencyMs: number | null
  lastError: string | null
  maxPeers: number | null
  reconnectAttempt: number
  serverPlayerCount: number | null
  stalePeerMs: number | null
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

type MobileJoystickInput = {
  forward: number
  strafe: number
  strength: number
}

type RobotWorldOrbitControls = {
  target: Vector3
  update: () => void
}

type MultiplayerPerfRunOptions = {
  durationMs: number
  enabled: boolean
  speed: 'run' | 'walk'
}

type MultiplayerPerfFrameSample = {
  dt: number
  time: number
}

type MultiplayerPerfRunState = {
  completedAt: number | null
  durationMs: number
  frames: MultiplayerPerfFrameSample[]
  speed: 'run' | 'walk'
  spikeThresholdMs: number
  startedAt: number | null
  status: 'done' | 'pending' | 'running'
}

type PascalBuildToolId = 'wall' | 'slab' | 'door' | 'window' | 'item'
type LandrushBuildToolbarToolId = PascalBuildToolId | 'move' | 'paint'
export type WorldMultiplayerBuildParcel = ParcelAllocationParcel
export type WorldMultiplayerBuildContext = {
  allocation: ParcelAllocationResult
  parcel: ParcelAllocationParcel
  parcelWorldId: string
  streetNetwork: ParcelStreetNetwork | null
  surface: WaterLandSurface
}

type WorldMultiplayerLabClientProps = {
  buildModeExitRequest?: number
  onBuildModeChange?: (context: WorldMultiplayerBuildContext | null) => void
  showInlineBuildOverlay?: boolean
}

const DEFAULT_ROOM_ID = 'landrush-lab-world-multiplayer'
const PLAYER_STORAGE_KEY = 'landrush-lab-world-multiplayer-player'
const OFFLINE_PARCEL_STATE_STORAGE_KEY = 'landrush-lab-world-multiplayer-offline-parcels'
const MULTIPLAYER_PERF_DEFAULT_DURATION_MS = 9000
const MULTIPLAYER_PERF_MAX_FRAME_SAMPLES = 1200
const MULTIPLAYER_PERF_SPIKE_THRESHOLD_MS = 24
const MULTIPLAYER_PERF_START_DELAY_MS = 2500
const LOCAL_STATE_SEND_INTERVAL_MS = 80
const LOCAL_STATE_IDLE_SEND_INTERVAL_MS = 2000
const LOCAL_STATE_HEADING_EPSILON = 0.02
const LOCAL_STATE_POSITION_EPSILON = 0.03
const LOCAL_STATE_SPEED_EPSILON = 0.05
const REMOTE_PLAYER_STALE_MS = 12_000
const MULTIPLAYER_LATENCY_EVENT = 'landrush-multiplayer-latency'
const ROBOT_PREVIOUS_WALK_SPEED = 2.75
const ROBOT_WALK_SPEED = ROBOT_PREVIOUS_WALK_SPEED / 1.5
const ROBOT_RUN_SPEED = ROBOT_PREVIOUS_WALK_SPEED * 2.48
const ROBOT_JOYSTICK_RUN_START = 0.82
const ROBOT_ACCELERATION = 18
const ROBOT_DECELERATION = 24
const ROBOT_TURN_RESPONSE = 12
const ROBOT_MOBILE_JOYSTICK_TURN_RESPONSE = ROBOT_TURN_RESPONSE / 5
const ROBOT_GROUND_CLEARANCE = 0.04
const ROBOT_CAMERA_TARGET_HEIGHT = 1.28
const ROBOT_CAMERA_INITIAL_DISTANCE = 8.2
const ROBOT_CAMERA_INITIAL_HEIGHT = 4.5
const ROBOT_CAMERA_FOLLOW_RESPONSE = 16
const ROBOT_CAMERA_MIN_DISTANCE = 3.2
const ROBOT_CAMERA_MAX_DISTANCE = 15
const ROBOT_CAMERA_MIN_PITCH = MathUtils.degToRad(-8)
const ROBOT_CAMERA_MAX_PITCH = MathUtils.degToRad(84)
const ROBOT_CAMERA_MOUSE_PITCH_SPEED = 0.0026
const ROBOT_CAMERA_MOUSE_YAW_SPEED = 0.0032
const ROBOT_CAMERA_TOUCH_PITCH_SPEED = 0.0031
const ROBOT_CAMERA_TOUCH_YAW_SPEED = 0.0038 / 5
const ROBOT_CAMERA_GAMEPAD_YAW_SPEED = MathUtils.degToRad(130)
const ROBOT_CAMERA_GAMEPAD_PITCH_SPEED = MathUtils.degToRad(92)
const ROBOT_CAMERA_WHEEL_ZOOM_SPEED = 0.001
const ROBOT_GRASS_INTERACTION_RADIUS = 2.7
const PARCEL_MAP_OVERLAY_ELEVATION_OFFSET = 0.08
const PARCEL_MAP_OVERLAY_HOVER_SCALE = 1.014
const PARCEL_MAP_OVERLAY_RESPONSE = 12
const PARCEL_MAP_BASE_COLOR = '#d3aa58'
const PARCEL_MAP_HOVER_COLOR = '#f5cf78'
const PARCEL_MAP_BASE_OPACITY = 0.19
const PARCEL_MAP_HOVER_OPACITY = 0.34
const PARCEL_MAP_CAMERA_POSITION = [0, 128, 0.01] as const
const PARCEL_MAP_CAMERA_TARGET = [0, 0, 0] as const
const PARCEL_MAP_CAMERA_ZOOM = 8.6
const MOBILE_CONTROLS_QUERY = '(max-width: 767px)'
const REMOTE_POSITION_RESPONSE = 12
const REMOTE_HEADING_RESPONSE = 14

const PLAYER_COLORS = ['#7dd3fc', '#facc15', '#86efac', '#f0abfc', '#fb7185', '#c4b5fd'] as const
const DEFAULT_MULTIPLAYER_WEBSOCKET_URL =
  'wss://landrush-world-multiplayer.onrender.com/api/landrush-lab/world-multiplayer/ws'
const HOSTED_MULTIPLAYER_WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_LANDRUSH_WORLD_MULTIPLAYER_WS_URL ?? DEFAULT_MULTIPLAYER_WEBSOCKET_URL
const WORLD_MULTIPLAYER_CANVAS_STYLE = { touchAction: 'none' } satisfies CSSProperties

const FALLBACK_LOCAL_PROFILE = {
  color: PLAYER_COLORS[0],
  id: 'local-pending',
  name: 'Player',
} satisfies LocalPlayerProfile

const LANDRUSH_BUILD_TOOLBAR_TOOLS = [
  { icon: MousePointer2, id: 'move', label: 'Move' },
  { icon: Hammer, id: 'wall', label: 'Wall' },
  { icon: Square, id: 'slab', label: 'Slab' },
  { icon: DoorOpen, id: 'door', label: 'Door' },
  { icon: Box, id: 'item', label: 'Item' },
  { icon: Paintbrush, id: 'paint', label: 'Paint' },
] satisfies readonly {
  icon: typeof Hammer
  id: LandrushBuildToolbarToolId
  label: string
}[]

function createEmptyRobotAnimationState(): LandrushRobotAnimationState {
  return {
    clipCount: 0,
    idleClip: null,
    idleClipDuration: 0,
    idleClipTime: 0,
    idleTimeScale: 0,
    idleWeight: 0,
    mixerTimeScale: 1,
    runClip: null,
    runClipDuration: 0,
    runClipTime: 0,
    runTimeScale: 0,
    runWeight: 0,
    walkClip: null,
    walkClipDuration: 0,
    walkClipTime: 0,
    walkTimeScale: 0,
    walkWeight: 0,
  }
}

function createConnectionDetails(): MultiplayerConnectionDetails {
  return {
    connectionId: null,
    heartbeatIntervalMs: 3000,
    latencyMs: null,
    lastError: null,
    maxPeers: null,
    reconnectAttempt: 0,
    serverPlayerCount: null,
    stalePeerMs: null,
  }
}

function setMultiplayerDebugHandle(key: string, value: unknown) {
  const debug = getMultiplayerDebugSurface()
  debug[key] = value
  window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__ = debug

  return () => {
    const current = window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__
    if (!current || typeof current !== 'object') return

    const currentDebug = current as Record<string, unknown>
    if (currentDebug[key] === value) delete currentDebug[key]
    if (Object.keys(currentDebug).length === 0) {
      delete window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__
    }
  }
}

function getMultiplayerDebugSurface() {
  const current = window.__LANDRUSH_WORLD_MULTIPLAYER_LAB__
  return current && typeof current === 'object' ? (current as Record<string, unknown>) : {}
}

function isLandrushBuildToolbarToolId(value: unknown): value is LandrushBuildToolbarToolId {
  return (
    value === 'move' ||
    value === 'wall' ||
    value === 'slab' ||
    value === 'door' ||
    value === 'window' ||
    value === 'item' ||
    value === 'paint'
  )
}

function syncPascalLandrushBuildMode(parcelId: string, tool: PascalBuildToolId = 'wall') {
  const editor = useEditor.getState()
  const sceneStore = useScene.getState()
  const viewer = useViewer.getState()

  sceneStore.updateNode(
    LANDRUSH_WORLD_ID as never,
    {
      focusParcelId: parcelId,
      landrushMode: 'build',
    } as never,
  )
  viewer.setSelection({
    buildingId: LANDRUSH_BUILDING_ID as never,
    levelId: LANDRUSH_LEVEL_ID as never,
    selectedIds: [],
    zoneId: null,
  })
  viewer.setCameraMode('perspective')
  viewer.setShowGrid(false)

  editor.setFirstPersonMode(false)
  editor.setPreviewMode(false)
  editor.setViewMode('3d')
  applyPascalLandrushBuildTool(tool)
}

function leavePascalLandrushBuildMode() {
  const editor = useEditor.getState()
  const sceneStore = useScene.getState()

  sceneStore.updateNode(
    LANDRUSH_WORLD_ID as never,
    {
      focusParcelId: null,
      landrushMode: 'walk',
    } as never,
  )
  editor.setMode('select')
  editor.setTool(null)
}

function applyPascalLandrushBuildTool(tool: LandrushBuildToolbarToolId) {
  const editor = useEditor.getState()

  editor.setFirstPersonMode(false)
  editor.setPreviewMode(false)
  editor.setViewMode('3d')

  if (tool === 'move') {
    editor.setMode('select')
    editor.setTool(null)
    return
  }

  if (tool === 'paint') {
    editor.setMode('material-paint')
    return
  }

  if (tool === 'item') {
    editor.setPhase('furnish')
    editor.setMode('build')
    editor.setTool('item')
    editor.setCatalogCategory('furniture')
    return
  }

  editor.setPhase('structure')
  editor.setStructureLayer('elements')
  editor.setMode('build')
  editor.setTool(tool)
  editor.setCatalogCategory(null)
}

function useMultiplayerPerfRunProbe(perfRun: MultiplayerPerfRunOptions) {
  useEffect(() => {
    if (!perfRun.enabled) {
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__?.enabled) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      delete document.documentElement.dataset.landrushPerfRun
      return
    }

    const grassProbe: StylizedGrassPerfProbe = { enabled: true, samples: [] }
    const state: MultiplayerPerfRunState = {
      completedAt: null,
      durationMs: perfRun.durationMs,
      frames: [],
      speed: perfRun.speed,
      spikeThresholdMs: MULTIPLAYER_PERF_SPIKE_THRESHOLD_MS,
      startedAt: null,
      status: 'pending',
    }
    window.__LANDRUSH_STYLIZED_GRASS_PERF__ = grassProbe
    const publishSummary = () => {
      document.documentElement.dataset.landrushPerfRun = JSON.stringify(
        summarizeMultiplayerPerfRun(state, grassProbe),
      )
    }
    const cleanupDebug = setMultiplayerDebugHandle('perfRun', () =>
      summarizeMultiplayerPerfRun(state, grassProbe),
    )

    let raf = 0
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
        if (state.frames.length > MULTIPLAYER_PERF_MAX_FRAME_SAMPLES) {
          state.frames.splice(0, state.frames.length - MULTIPLAYER_PERF_MAX_FRAME_SAMPLES)
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
    }, MULTIPLAYER_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(publishTimer)
      window.cancelAnimationFrame(raf)
      cleanupDebug()
      delete document.documentElement.dataset.landrushPerfRun
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__ === grassProbe) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
    }
  }, [perfRun])
}

function createMultiplayerPerfRunOptions(searchParams: { get: (key: string) => string | null }) {
  const enabled = searchParams.get('perfRun') === 'straight'
  const requestedDuration = Number(searchParams.get('perfDurationMs'))
  const durationMs = MathUtils.clamp(
    Number.isFinite(requestedDuration) ? requestedDuration : MULTIPLAYER_PERF_DEFAULT_DURATION_MS,
    4000,
    20_000,
  )
  const speed = searchParams.get('perfSpeed') === 'walk' ? 'walk' : 'run'
  return { durationMs, enabled, speed } satisfies MultiplayerPerfRunOptions
}

function isLayoutView(searchParams: { get: (key: string) => string | null }) {
  const camera = searchParams.get('camera')
  return (
    searchParams.get('layout') === '1' ||
    searchParams.get('topdown') === '1' ||
    searchParams.get('observer') === '1' ||
    searchParams.get('spectator') === '1' ||
    camera === 'layout' ||
    camera === 'topdown' ||
    camera === 'overhead'
  )
}

function summarizeMultiplayerPerfRun(
  state: MultiplayerPerfRunState,
  grassProbe: StylizedGrassPerfProbe,
) {
  const frameDts = state.frames.map((frame) => frame.dt)
  const frameSpikes = state.frames.filter((frame) => frame.dt >= state.spikeThresholdMs)
  const grassSamples = grassProbe.samples
  const matrixSamples = grassSamples.filter((sample) => sample.kind === 'matrix')
  const buildSamples = grassSamples.filter((sample) => sample.kind === 'build')
  const attributeSamples = grassSamples.filter((sample) => sample.kind === 'attributes')
  const streamSamples = grassSamples.filter((sample) => sample.kind === 'stream')

  return {
    durationMs: state.durationMs,
    frames: {
      count: state.frames.length,
      maxMs: round(max(frameDts)),
      p95Ms: round(percentile(frameDts, 0.95)),
      p99Ms: round(percentile(frameDts, 0.99)),
      spikeCount: frameSpikes.length,
      spikeThresholdMs: state.spikeThresholdMs,
      spikes: frameSpikes.slice(0, 12).map((frame) => ({
        dt: round(frame.dt),
        time: round(frame.time),
      })),
    },
    grass: {
      attributes: summarizeGrassPerfSamples(attributeSamples),
      builds: summarizeGrassPerfSamples(buildSamples),
      matrices: summarizeGrassPerfSamples(matrixSamples),
      streamUpdates: streamSamples.map((sample) => ({
        time: round(sample.time - (state.startedAt ?? sample.time)),
        x: round(sample.centerX ?? 0),
        z: round(sample.centerZ ?? 0),
      })),
    },
    speed: state.speed,
    status: state.status,
  }
}

function summarizeGrassPerfSamples(samples: StylizedGrassPerfProbe['samples']) {
  const durations = samples.map((sample) => sample.durationMs)
  return {
    count: samples.length,
    maxMs: round(max(durations)),
    p95Ms: round(percentile(durations, 0.95)),
    top: [...samples]
      .sort((first, second) => second.durationMs - first.durationMs)
      .slice(0, 8)
      .map((sample) => ({
        count: sample.count ?? 0,
        durationMs: round(sample.durationMs),
        moving: sample.moving ?? undefined,
      })),
  }
}

function percentile(values: readonly number[], percentileValue: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))] ?? 0
}

function max(values: readonly number[]) {
  return values.length === 0 ? 0 : Math.max(...values)
}

export function WorldMultiplayerLabClient({
  buildModeExitRequest = 0,
  onBuildModeChange,
  showInlineBuildOverlay = true,
}: WorldMultiplayerLabClientProps = {}) {
  const searchParams = useSearchParams()
  const grassInteractionRef = useRef<StylizedGrassInteraction | null>(null)
  const mobileJoystickRef = useRef<MobileJoystickInput | null>(null)
  const localMotionRef = useRef<RobotMotion | null>(null)
  const restorePointerLockAfterMapRef = useRef(false)
  const restorePointerLockAfterBuildRef = useRef(false)
  const buildReturnMapViewRef = useRef(false)
  const buildModeExitRequestRef = useRef(buildModeExitRequest)
  const [localProfile, setLocalProfile] = useState<LocalPlayerProfile>(FALLBACK_LOCAL_PROFILE)
  const [mapView, setMapView] = useState(false)
  const [buildContext, setBuildContext] = useState<WorldMultiplayerBuildContext | null>(null)
  const activeEditorMode = useEditor((state) => state.mode)
  const activeEditorTool = useEditor((state) => state.tool)
  const clean = searchParams.get('v') === 'clean' || searchParams.get('clean') === '1'
  const roomId = sanitizeRoomId(searchParams.get('room') ?? DEFAULT_ROOM_ID)
  const offline = searchParams.get('offline') === '1'
  const layoutView = isLayoutView(searchParams)
  const buildParcel = buildContext?.parcel ?? null
  const effectiveMapView = layoutView || mapView || Boolean(buildContext)
  const activeBuildToolbarTool = useMemo<LandrushBuildToolbarToolId>(() => {
    if (activeEditorMode === 'material-paint') return 'paint'
    if (activeEditorMode === 'select') return 'move'
    return isLandrushBuildToolbarToolId(activeEditorTool) ? activeEditorTool : 'wall'
  }, [activeEditorMode, activeEditorTool])
  const perfRun = useMemo(() => createMultiplayerPerfRunOptions(searchParams), [searchParams])
  const [incomingVoiceSignals, setIncomingVoiceSignals] = useState<SpatialVoiceSignalMessage[]>([])
  const handleVoiceSignal = useCallback((message: SpatialVoiceSignalMessage) => {
    setIncomingVoiceSignals((current) => [...current.slice(-63), message])
  }, [])
  const multiplayer = useLandrushWorldMultiplayer({
    enabled: !offline,
    localProfile,
    onVoiceSignal: handleVoiceSignal,
    persistOfflineState: !clean,
    roomId,
    spectator: layoutView,
  })
  const spatialVoice = useLandrushSpatialVoice({
    available: !offline && !layoutView && multiplayer.status === 'connected',
    incomingSignals: incomingVoiceSignals,
    localMotionRef,
    localProfile,
    remotePlayers: multiplayer.remotePlayers,
    roomId,
    sendSignal: multiplayer.sendVoiceSignal,
  })
  useMultiplayerPerfRunProbe(perfRun)

  const enterBuildMode = useCallback(
    (context: WorldMultiplayerBuildContext) => {
      buildReturnMapViewRef.current = mapView
      restorePointerLockAfterBuildRef.current = !mapView && releaseWorldPointerLock()
      setMapView(true)
      setBuildContext(context)
      syncPascalLandrushBuildMode(context.parcel.id)
      onBuildModeChange?.(context)
    },
    [mapView, onBuildModeChange],
  )

  const leaveBuildMode = useCallback(() => {
    const returnToMapView = buildReturnMapViewRef.current

    setBuildContext(null)
    leavePascalLandrushBuildMode()
    onBuildModeChange?.(null)
    if (!layoutView) setMapView(returnToMapView)
    if (!layoutView && !returnToMapView && restorePointerLockAfterBuildRef.current) {
      requestWorldPointerLock()
    }

    restorePointerLockAfterBuildRef.current = false
    buildReturnMapViewRef.current = false
  }, [layoutView, onBuildModeChange])

  const selectBuildTool = useCallback((tool: LandrushBuildToolbarToolId) => {
    applyPascalLandrushBuildTool(tool)
  }, [])

  const renderSceneOverlay = useCallback(
    ({
      allocation,
      parcelWorldId,
      streetNetwork,
      surface,
    }: {
      allocation: ParcelAllocationResult | null
      parcelWorldId: string
      streetNetwork: ParcelStreetNetwork | null
      surface: WaterLandSurface
    }) => (
      <LandrushWorldMultiplayerScene
        allocation={allocation}
        buildParcelId={buildParcel?.id ?? null}
        claimParcel={multiplayer.claimParcel}
        grassInteractionRef={grassInteractionRef}
        layoutView={layoutView}
        localMotionRef={localMotionRef}
        localProfile={localProfile}
        mapView={effectiveMapView}
        mobileJoystickRef={mobileJoystickRef}
        onBuildParcel={enterBuildMode}
        onLocalPlayerChange={multiplayer.publishLocalPlayer}
        parcelClaimError={multiplayer.parcelClaimError}
        parcelOwnerships={multiplayer.parcelOwnerships}
        parcelWorldId={parcelWorldId}
        perfRun={perfRun}
        remotePlayerStore={multiplayer.remotePlayerStore}
        remotePlayers={multiplayer.remotePlayers}
        remoteVoicePeerIds={spatialVoice.remoteVoicePeerIds}
        streetNetwork={streetNetwork}
        surface={surface}
        voiceRangeVisible={spatialVoice.desired && spatialVoice.status === 'live'}
        watchParcelWorld={multiplayer.watchParcelWorld}
      />
    ),
    [
      buildParcel?.id,
      effectiveMapView,
      enterBuildMode,
      layoutView,
      localProfile,
      multiplayer.claimParcel,
      multiplayer.parcelClaimError,
      multiplayer.parcelOwnerships,
      multiplayer.publishLocalPlayer,
      multiplayer.remotePlayerStore,
      multiplayer.remotePlayers,
      multiplayer.watchParcelWorld,
      perfRun,
      spatialVoice.desired,
      spatialVoice.remoteVoicePeerIds,
      spatialVoice.status,
    ],
  )

  useEffect(() => {
    setLocalProfile(readLocalPlayerProfile())
  }, [])

  useEffect(() => {
    if (!buildContext) return
    return () => leavePascalLandrushBuildMode()
  }, [buildContext])

  useEffect(() => {
    if (buildModeExitRequestRef.current === buildModeExitRequest) return
    buildModeExitRequestRef.current = buildModeExitRequest
    if (buildContext) leaveBuildMode()
  }, [buildModeExitRequest, buildContext, leaveBuildMode])

  const enterMapView = useCallback(() => {
    if (layoutView) return
    restorePointerLockAfterMapRef.current = releaseWorldPointerLock()
    setMapView(true)
  }, [layoutView])

  const leaveMapView = useCallback(() => {
    if (layoutView) return
    setMapView(false)
    if (!restorePointerLockAfterMapRef.current) return
    restorePointerLockAfterMapRef.current = false
    requestWorldPointerLock()
  }, [layoutView])

  const toggleMapView = useCallback(() => {
    if (mapView) {
      leaveMapView()
      return
    }

    enterMapView()
  }, [enterMapView, leaveMapView, mapView])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || layoutView) return
      if (buildParcel && event.code === 'Escape') {
        event.preventDefault()
        leaveBuildMode()
        return
      }
      if (mapView && event.code === 'Escape') {
        event.preventDefault()
        leaveMapView()
        return
      }
      if (buildParcel && event.code === 'KeyM') {
        event.preventDefault()
        if (!event.repeat) leaveBuildMode()
        return
      }
      if (event.code !== 'KeyM') return
      event.preventDefault()
      if (!event.repeat) toggleMapView()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [buildParcel, layoutView, leaveBuildMode, leaveMapView, mapView, toggleMapView])

  useEffect(() => {
    if (!effectiveMapView) return
    mobileJoystickRef.current = null
    releaseWorldPointerLock()
  }, [effectiveMapView])

  useEffect(
    () =>
      setMultiplayerDebugHandle('connection', () => ({
        ...multiplayer.connection,
        offline,
        remotePlayers: multiplayer.remotePlayers.length,
        roomId,
        view: buildParcel ? 'build' : layoutView ? 'layout' : mapView ? 'map' : 'robot',
        status: offline ? 'offline' : multiplayer.status,
      })),
    [
      buildParcel,
      layoutView,
      mapView,
      multiplayer.connection,
      multiplayer.remotePlayers.length,
      multiplayer.status,
      offline,
      roomId,
    ],
  )

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <WorldLabClient
        canvasStyle={WORLD_MULTIPLAYER_CANVAS_STYLE}
        grassInteractionRef={grassInteractionRef}
        labTitle="Landrush lab world multiplayer"
        parcelOwnershipScope={roomId}
        renderSceneOverlay={renderSceneOverlay}
        showDirtCopyParcels
        variant="dirt-copy"
      />
      {!clean ? (
        <MultiplayerStatusPanel
          connection={multiplayer.connection}
          localPlayerIncluded={!layoutView}
          remotePlayerCount={multiplayer.remotePlayers.length}
          status={offline ? 'offline' : multiplayer.status}
          voice={spatialVoice}
        />
      ) : null}
      {layoutView || buildParcel ? null : (
        <MobileMapToggleButton mapView={mapView} onToggle={toggleMapView} />
      )}
      {showInlineBuildOverlay ? (
        <LandrushBuildModeOverlay
          activeTool={activeBuildToolbarTool}
          parcel={buildParcel}
          onExit={leaveBuildMode}
          onSelectTool={selectBuildTool}
        />
      ) : null}
      {effectiveMapView ? null : <MobileMovementJoystick movementRef={mobileJoystickRef} />}
    </div>
  )
}

function LandrushBuildModeOverlay({
  activeTool,
  onExit,
  onSelectTool,
  parcel,
}: {
  activeTool: LandrushBuildToolbarToolId
  onExit: () => void
  onSelectTool: (tool: LandrushBuildToolbarToolId) => void
  parcel: ParcelAllocationParcel | null
}) {
  if (!parcel) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <style>{`
        @keyframes landrush-build-panel-in {
          0% { opacity: 0; transform: translateY(12px) scale(0.975); }
          70% { opacity: 1; transform: translateY(-2px) scale(1.012); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="absolute inset-x-0 bottom-5 flex justify-center px-4 md:bottom-7">
        <section
          className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-amber-100/20 bg-slate-950/82 px-2.5 py-2 text-white shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-md"
          style={{ animation: 'landrush-build-panel-in 260ms cubic-bezier(0.2, 0.9, 0.2, 1) both' }}
        >
          <div className="hidden min-w-0 px-2 sm:block">
            <p className="truncate text-[11px] font-semibold uppercase text-amber-100/72">Build</p>
            <p className="truncate text-xs text-white/78">{parcel.id}</p>
          </div>
          <div className="flex items-center gap-1">
            {LANDRUSH_BUILD_TOOLBAR_TOOLS.map(({ icon: Icon, id, label }) => {
              const active = activeTool === id
              return (
                <button
                  aria-label={label}
                  className={[
                    'grid size-9 place-items-center rounded-lg border transition',
                    active
                      ? 'border-amber-100/54 bg-amber-200/22 text-amber-50 shadow-[0_0_18px_rgba(245,207,120,0.18)]'
                      : 'border-white/10 bg-white/6 text-white/70 hover:border-amber-100/30 hover:bg-white/10 hover:text-amber-50',
                  ].join(' ')}
                  key={id}
                  onClick={() => onSelectTool(id)}
                  title={label}
                  type="button"
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              )
            })}
          </div>
          <button
            className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/6 px-2.5 text-xs font-semibold text-white/76 transition hover:border-amber-100/30 hover:bg-white/10 hover:text-amber-50"
            onClick={onExit}
            type="button"
          >
            <X className="size-3.5" aria-hidden />
            <span>Exit</span>
          </button>
        </section>
      </div>
    </div>
  )
}

function LandrushWorldMultiplayerScene({
  allocation,
  buildParcelId,
  claimParcel,
  grassInteractionRef,
  layoutView,
  localMotionRef,
  localProfile,
  mapView,
  mobileJoystickRef,
  onBuildParcel,
  onLocalPlayerChange,
  parcelClaimError,
  parcelOwnerships,
  parcelWorldId,
  perfRun,
  remotePlayerStore,
  remotePlayers,
  remoteVoicePeerIds,
  streetNetwork,
  surface,
  voiceRangeVisible,
  watchParcelWorld,
}: {
  allocation: ParcelAllocationResult | null
  buildParcelId: string | null
  claimParcel: (worldId: string, parcelId: string) => boolean
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  layoutView: boolean
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapView: boolean
  mobileJoystickRef: { current: MobileJoystickInput | null }
  onBuildParcel: (context: WorldMultiplayerBuildContext) => void
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  parcelClaimError: ParcelClaimError | null
  parcelOwnerships: readonly ParcelOwnership[]
  parcelWorldId: string
  perfRun: MultiplayerPerfRunOptions
  remotePlayerStore: MultiplayerRemotePlayerStore
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  remoteVoicePeerIds: readonly string[]
  streetNetwork: ParcelStreetNetwork | null
  surface: WaterLandSurface
  voiceRangeVisible: boolean
  watchParcelWorld: (worldId: string) => void
}) {
  const spawn = useMemo(() => centroidForPolygon(surface.grassSurfacePoints), [surface])
  const groundY = surface.grassSurfaceElevation + ROBOT_GROUND_CLEARANCE
  const remoteVoicePeerIdSet = useMemo(() => new Set(remoteVoicePeerIds), [remoteVoicePeerIds])

  return (
    <group>
      {mapView ? <ParcelMapCameraRig /> : null}
      {layoutView ? null : (
        <>
          <LocalMultiplayerRobot
            grassInteractionRef={grassInteractionRef}
            groundY={groundY}
            localMotionRef={localMotionRef}
            localProfile={localProfile}
            mapView={mapView}
            mobileJoystickRef={mobileJoystickRef}
            onLocalPlayerChange={onLocalPlayerChange}
            perfRun={perfRun}
            spawn={spawn}
            surfacePoints={surface.grassSurfacePoints}
          />
          <SpatialVoiceRangeRing
            color={localProfile.color}
            groundY={surface.grassSurfaceElevation}
            motionRef={localMotionRef}
            visible={voiceRangeVisible}
          />
        </>
      )}
      {remotePlayers.map((player) => (
        <RemoteMultiplayerRobot
          groundY={groundY}
          key={player.id}
          player={player}
          remotePlayerStore={remotePlayerStore}
        />
      ))}
      {remotePlayers.map((player) => (
        <SpatialVoiceRangeRing
          color={player.color}
          groundY={surface.grassSurfaceElevation}
          key={`voice-range-${player.id}`}
          position={player.position}
          visible={voiceRangeVisible && remoteVoicePeerIdSet.has(player.id)}
        />
      ))}
      <ParcelOwnershipLayer
        allocation={allocation}
        buildParcelId={buildParcelId}
        claimParcel={claimParcel}
        localMotionRef={localMotionRef}
        localProfile={localProfile}
        mapView={mapView}
        onBuildParcel={onBuildParcel}
        parcelClaimError={parcelClaimError}
        parcelOwnerships={parcelOwnerships}
        parcelWorldId={parcelWorldId}
        remotePlayers={remotePlayers}
        streetNetwork={streetNetwork}
        surface={surface}
        watchParcelWorld={watchParcelWorld}
      />
    </group>
  )
}

function LocalMultiplayerRobot({
  grassInteractionRef,
  groundY,
  localMotionRef,
  localProfile,
  mapView,
  mobileJoystickRef,
  onLocalPlayerChange,
  perfRun,
  spawn,
  surfacePoints,
}: {
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  groundY: number
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapView: boolean
  mobileJoystickRef: { current: MobileJoystickInput | null }
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: MultiplayerPerfRunOptions
  spawn: LandrushPoint2
  surfacePoints: readonly LandrushPoint2[]
}) {
  const pressedKeysRef = useRef(new Set<string>())
  const lastSentAtRef = useRef(0)
  const modelLoadedRef = useRef(false)
  const animationStateRef = useRef<LandrushRobotAnimationState>(createEmptyRobotAnimationState())
  const surfacePointsRef = useRef(surfacePoints)
  const nodeRef = useRef<LandrushWorldNode>(createRobotNode(localProfile.id, spawn, groundY))
  const motionRef = useRef<RobotMotion>({
    cameraSnapVersion: 0,
    heading: 0,
    isMoving: false,
    position: new Vector3(spawn.x, groundY, spawn.z),
    speed: 0,
    velocity: new Vector3(),
  })
  surfacePointsRef.current = surfacePoints

  useEffect(() => {
    localMotionRef.current = motionRef.current
    return () => {
      if (localMotionRef.current === motionRef.current) localMotionRef.current = null
    }
  }, [localMotionRef])

  const publishCurrentPlayer = useCallback(() => {
    const motion = motionRef.current
    onLocalPlayerChange({
      ...localProfile,
      heading: motion.heading,
      moving: motion.isMoving,
      position: [motion.position.x, motion.position.y, motion.position.z],
      speed: motion.speed,
      updatedAt: Date.now(),
    })
  }, [localProfile, onLocalPlayerChange])

  const handleModelLoaded = useCallback(() => {
    modelLoadedRef.current = true
  }, [])

  const handleAnimationState = useCallback((state: LandrushRobotAnimationState) => {
    animationStateRef.current = state
  }, [])

  useEffect(
    () =>
      setMultiplayerDebugHandle('localRobot', () => {
        const motion = motionRef.current
        return {
          animation: animationStateRef.current,
          heading: round(motion.heading),
          insideSurface: pointInPolygon(
            { x: motion.position.x, z: motion.position.z },
            surfacePointsRef.current,
          ),
          modelLoaded: modelLoadedRef.current,
          moving: motion.isMoving,
          pressedKeys: [...pressedKeysRef.current],
          speed: round(motion.speed),
          x: round(motion.position.x),
          y: round(motion.position.y),
          z: round(motion.position.z),
        }
      }),
    [],
  )

  const resetToSpawn = useCallback(() => {
    const motion = motionRef.current
    motion.position.set(spawn.x, groundY, spawn.z)
    motion.velocity.set(0, 0, 0)
    motion.heading = 0
    motion.isMoving = false
    motion.speed = 0
    motion.cameraSnapVersion += 1
    grassInteractionRef.current = {
      radius: ROBOT_GRASS_INTERACTION_RADIUS,
      speed: 0,
      x: motion.position.x,
      z: motion.position.z,
    }
    writeMotionToRobotNode(nodeRef.current, motion)
    publishCurrentPlayer()
  }, [grassInteractionRef, groundY, publishCurrentPlayer, spawn])

  useEffect(() => {
    updateRobotNodeIdentity(nodeRef.current, localProfile.id, spawn, groundY)
    resetToSpawn()
  }, [groundY, localProfile.id, resetToSpawn, spawn])

  useEffect(() => {
    if (!mapView) return
    pressedKeysRef.current.clear()
    mobileJoystickRef.current = null
  }, [mapView, mobileJoystickRef])

  useEffect(() => {
    if (!perfRun.enabled) return

    let stopTimer = 0
    const startTimer = window.setTimeout(() => {
      resetToSpawn()
      pressedKeysRef.current.add('KeyW')
      if (perfRun.speed === 'run') pressedKeysRef.current.add('ShiftLeft')

      stopTimer = window.setTimeout(() => {
        pressedKeysRef.current.delete('KeyW')
        pressedKeysRef.current.delete('ShiftLeft')
      }, perfRun.durationMs)
    }, MULTIPLAYER_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(stopTimer)
      pressedKeysRef.current.delete('KeyW')
      pressedKeysRef.current.delete('ShiftLeft')
    }
  }, [perfRun, resetToSpawn])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return

      if (event.code === 'KeyR') {
        event.preventDefault()
        if (!event.repeat) resetToSpawn()
        return
      }

      if (!isTrackedWalkKey(event.code)) return
      event.preventDefault()
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
  }, [resetToSpawn])

  useFrame((state, delta) => {
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const motion = motionRef.current
    const mobileViewport = isMobileControlViewport()
    const joystick = mobileJoystickRef.current
    const mobileJoystickActive = Boolean(mobileViewport && joystick && joystick.strength > 0.08)
    const gamepadInput = mapView ? null : readLandrushGamepadInput()

    const movement = mapView
      ? null
      : resolveCameraRelativeMovement(
          pressedKeysRef.current,
          state.camera,
          mobileJoystickRef.current,
          gamepadInput,
        )
    const cameraHeading = resolveCameraForwardHeading(state.camera)
    const targetHeading = movement
      ? movement.heading
      : mobileViewport
        ? motion.heading
        : cameraHeading
    const targetSpeed = movement
      ? resolveRobotTargetSpeed(
          movement,
          isRunPressed(pressedKeysRef.current) || Boolean(gamepadInput?.run),
        )
      : 0
    const desiredVelocity = movement
      ? { x: movement.x * targetSpeed, z: movement.z * targetSpeed }
      : { x: 0, z: 0 }
    const acceleration = movement ? ROBOT_ACCELERATION : ROBOT_DECELERATION
    const nextVelocity = {
      x: approach(motion.velocity.x, desiredVelocity.x, acceleration * frameDelta),
      z: approach(motion.velocity.z, desiredVelocity.z, acceleration * frameDelta),
    }
    const previous = { x: motion.position.x, z: motion.position.z }
    const proposed = {
      x: motion.position.x + nextVelocity.x * frameDelta,
      z: motion.position.z + nextVelocity.z * frameDelta,
    }
    const constrained = constrainToPolygon(proposed, previous, surfacePoints)

    motion.position.set(constrained.x, groundY, constrained.z)
    motion.velocity.set(
      (constrained.x - previous.x) / frameDelta,
      0,
      (constrained.z - previous.z) / frameDelta,
    )
    motion.speed = Math.hypot(motion.velocity.x, motion.velocity.z)
    motion.isMoving = motion.speed > 0.05
    motion.heading = lerpAngle(
      motion.heading,
      targetHeading,
      clamp01(
        frameDelta *
          (mobileJoystickActive ? ROBOT_MOBILE_JOYSTICK_TURN_RESPONSE : ROBOT_TURN_RESPONSE),
      ),
    )
    grassInteractionRef.current = {
      radius: ROBOT_GRASS_INTERACTION_RADIUS,
      speed: motion.isMoving ? motion.speed : 0,
      x: motion.position.x,
      z: motion.position.z,
    }

    writeMotionToRobotNode(nodeRef.current, motion)

    const now = window.performance.now()
    if (now - lastSentAtRef.current >= LOCAL_STATE_SEND_INTERVAL_MS) {
      lastSentAtRef.current = now
      publishCurrentPlayer()
    }
  }, -1)

  useEffect(
    () => () => {
      grassInteractionRef.current = null
    },
    [grassInteractionRef],
  )

  return (
    <>
      {mapView ? null : (
        <RobotThirdPersonCameraRig mobileJoystickRef={mobileJoystickRef} motionRef={motionRef} />
      )}
      <Suspense
        fallback={<RobotNodePrimitiveActor color={localProfile.color} node={nodeRef.current} />}
      >
        <LocalMultiplayerRegisteredActor
          node={nodeRef.current}
          onAnimationState={handleAnimationState}
          onLoaded={handleModelLoaded}
        />
      </Suspense>
      <LandrushRobotFootstepAudio
        groundY={groundY}
        motionRef={motionRef}
        runSpeed={ROBOT_RUN_SPEED}
        walkSpeed={ROBOT_WALK_SPEED}
      />
      <RobotPlayerBeacon color={localProfile.color} node={nodeRef.current} />
    </>
  )
}

function RemoteMultiplayerRobot({
  groundY,
  player,
  remotePlayerStore,
}: {
  groundY: number
  player: MultiplayerPlayerSnapshot
  remotePlayerStore: MultiplayerRemotePlayerStore
}) {
  const nodeRef = useRef<LandrushWorldNode>(
    createRobotNode(player.id, snapshotPoint(player), groundY),
  )
  const positionRef = useRef(new Vector3(...player.position))
  const targetPositionRef = useRef(new Vector3(...player.position))
  const headingRef = useRef(player.heading)
  const targetHeadingRef = useRef(player.heading)
  const animationSettleSecondsRef = useRef(0)
  const lastSnapshotUpdatedAtRef = useRef(player.updatedAt)
  const lastSnapshotReceivedAtRef = useRef<number | null>(null)

  useEffect(() => {
    targetPositionRef.current.set(player.position[0], player.position[1], player.position[2])
    targetHeadingRef.current = player.heading
  }, [player])

  useFrame((_, delta) => {
    const livePlayer = remotePlayerStore.getSnapshot(player.id) ?? player
    const now = performance.now()
    if (
      lastSnapshotReceivedAtRef.current === null ||
      livePlayer.updatedAt !== lastSnapshotUpdatedAtRef.current
    ) {
      lastSnapshotUpdatedAtRef.current = livePlayer.updatedAt
      lastSnapshotReceivedAtRef.current = now
    }
    targetPositionRef.current.set(
      livePlayer.position[0],
      livePlayer.position[1] || groundY,
      livePlayer.position[2],
    )
    targetHeadingRef.current = livePlayer.heading

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionErrorSq = positionRef.current.distanceToSquared(targetPositionRef.current)
    const headingErrorRadians = shortestAngleDistance(headingRef.current, targetHeadingRef.current)
    const positionAmount = frameIndependentResponseAmount(REMOTE_POSITION_RESPONSE, frameDelta)
    const headingAmount = frameIndependentResponseAmount(REMOTE_HEADING_RESPONSE, frameDelta)
    const movementFresh =
      livePlayer.moving &&
      now - (lastSnapshotReceivedAtRef.current ?? now) <= REMOTE_PRESENTATION_MOVEMENT_FRESH_MS

    positionRef.current.lerp(targetPositionRef.current, positionAmount)
    headingRef.current = lerpAngle(headingRef.current, targetHeadingRef.current, headingAmount)
    animationSettleSecondsRef.current = movementFresh
      ? REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS
      : Math.max(0, animationSettleSecondsRef.current - frameDelta)

    const node = nodeRef.current
    node.playerPosition = [
      positionRef.current.x,
      positionRef.current.y || groundY,
      positionRef.current.z,
    ]
    node.playerHeading = headingRef.current
    node.playerMoving = movementFresh
    node.playerSpeed = movementFresh ? livePlayer.speed : 0

    if (
      shouldContinueRemotePresentation({
        animationSettleSeconds: animationSettleSecondsRef.current,
        headingErrorRadians,
        moving: movementFresh,
        positionErrorSq,
      })
    ) {
      renderScheduler.requestFrame('animation')
    }
  })

  return (
    <>
      <Suspense fallback={<RobotNodePrimitiveActor color={player.color} node={nodeRef.current} />}>
        <LandrushRobot node={nodeRef.current} />
      </Suspense>
      <RobotPlayerBeacon color={player.color} node={nodeRef.current} />
    </>
  )
}

function LocalMultiplayerRegisteredActor({
  node,
  onAnimationState,
  onLoaded,
}: {
  node: LandrushWorldNode
  onAnimationState: (state: LandrushRobotAnimationState) => void
  onLoaded: () => void
}) {
  useEffect(() => {
    onLoaded()
  }, [onLoaded])

  return <LandrushRobot node={node} onAnimationState={onAnimationState} />
}

function RobotNodePrimitiveActor({ color, node }: { color: string; node: LandrushWorldNode }) {
  const groupRef = useRef<Group>(null!)

  useFrame(() => {
    groupRef.current?.position.set(
      node.playerPosition[0],
      node.playerPosition[1],
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
      <RobotWalkerPrimitive color={color} />
    </group>
  )
}

function ParcelMapCameraRig() {
  const controlsTarget = useMemo(() => new Vector3(...PARCEL_MAP_CAMERA_TARGET), [])

  return (
    <>
      <OrthographicCamera
        far={900}
        makeDefault
        near={0.1}
        position={PARCEL_MAP_CAMERA_POSITION}
        zoom={PARCEL_MAP_CAMERA_ZOOM}
      />
      <ParcelMapCameraTarget target={PARCEL_MAP_CAMERA_TARGET} />
      <OrbitControls
        dampingFactor={0.08}
        enableDamping
        enablePan
        enableRotate={false}
        enableZoom
        makeDefault
        maxZoom={28}
        minZoom={3}
        target={controlsTarget}
      />
    </>
  )
}

function ParcelMapCameraTarget({ target }: { target: readonly [number, number, number] }) {
  const { camera, invalidate } = useThree()

  useEffect(() => {
    camera.lookAt(new Vector3(...target))
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, target])

  return null
}

function RobotThirdPersonCameraRig({
  mobileJoystickRef,
  motionRef,
}: {
  mobileJoystickRef: { current: MobileJoystickInput | null }
  motionRef: { current: RobotMotion }
}) {
  const initialTarget = useMemo(() => new Vector3(), [])

  return (
    <>
      <PerspectiveCamera far={900} fov={48} makeDefault near={0.1} position={[0, 4.5, -8.2]} />
      <OrbitControls
        dampingFactor={0.12}
        enableDamping
        enablePan={false}
        enableRotate={false}
        enableZoom={false}
        makeDefault
        maxDistance={ROBOT_CAMERA_MAX_DISTANCE}
        minDistance={ROBOT_CAMERA_MIN_DISTANCE}
        rotateSpeed={0.82}
        target={initialTarget}
        zoomSpeed={0.75}
      />
      <RobotThirdPersonCameraController
        mobileJoystickRef={mobileJoystickRef}
        motionRef={motionRef}
      />
    </>
  )
}

function RobotThirdPersonCameraController({
  mobileJoystickRef,
  motionRef,
}: {
  mobileJoystickRef: { current: MobileJoystickInput | null }
  motionRef: { current: RobotMotion }
}) {
  const cameraDistanceRef = useRef(
    Math.hypot(ROBOT_CAMERA_INITIAL_DISTANCE, ROBOT_CAMERA_INITIAL_HEIGHT),
  )
  const cameraPitchRef = useRef(
    Math.atan2(ROBOT_CAMERA_INITIAL_HEIGHT, ROBOT_CAMERA_INITIAL_DISTANCE),
  )
  const cameraYawRef = useRef(Math.PI)
  const desiredCameraPositionRef = useRef(new Vector3())
  const targetRef = useRef(new Vector3())
  const previousTargetRef = useRef<Vector3 | null>(null)
  const snapVersionRef = useRef<number | null>(null)
  const mobileOrbitTouchRef = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return
      void Promise.resolve(event.target.requestPointerLock()).catch(() => undefined)
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!(document.pointerLockElement instanceof HTMLCanvasElement)) return
      if (event.movementX === 0 && event.movementY === 0) return

      cameraYawRef.current -= event.movementX * ROBOT_CAMERA_MOUSE_YAW_SPEED
      cameraPitchRef.current = MathUtils.clamp(
        cameraPitchRef.current + event.movementY * ROBOT_CAMERA_MOUSE_PITCH_SPEED,
        ROBOT_CAMERA_MIN_PITCH,
        ROBOT_CAMERA_MAX_PITCH,
      )
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    const handleWheel = (event: WheelEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return
      event.preventDefault()
      event.stopPropagation()
      cameraDistanceRef.current = MathUtils.clamp(
        cameraDistanceRef.current * Math.exp(event.deltaY * ROBOT_CAMERA_WHEEL_ZOOM_SPEED),
        ROBOT_CAMERA_MIN_DISTANCE,
        ROBOT_CAMERA_MAX_DISTANCE,
      )
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (!isMobileControlViewport() || !isMobileCameraOrbitTarget(event.target)) return
      const touch = event.changedTouches.item(0)
      if (!touch) return
      event.preventDefault()
      event.stopPropagation()
      mobileOrbitTouchRef.current = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const activeTouch = mobileOrbitTouchRef.current
      if (!activeTouch) return
      const touch = findTouchById(event.touches, activeTouch.id)
      if (!touch) return
      event.preventDefault()
      event.stopPropagation()

      const dx = touch.clientX - activeTouch.x
      const dy = touch.clientY - activeTouch.y
      activeTouch.x = touch.clientX
      activeTouch.y = touch.clientY

      cameraYawRef.current -= dx * ROBOT_CAMERA_TOUCH_YAW_SPEED
      cameraPitchRef.current = MathUtils.clamp(
        cameraPitchRef.current + dy * ROBOT_CAMERA_TOUCH_PITCH_SPEED,
        ROBOT_CAMERA_MIN_PITCH,
        ROBOT_CAMERA_MAX_PITCH,
      )
    }

    const handleTouchEnd = (event: TouchEvent) => {
      const activeTouch = mobileOrbitTouchRef.current
      if (!activeTouch || !findTouchById(event.changedTouches, activeTouch.id)) return
      event.preventDefault()
      event.stopPropagation()
      mobileOrbitTouchRef.current = null
    }

    window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false })
    window.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false })
    window.addEventListener('touchend', handleTouchEnd, true)
    window.addEventListener('touchcancel', handleTouchEnd, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('wheel', handleWheel, true)
      window.removeEventListener('touchstart', handleTouchStart, true)
      window.removeEventListener('touchmove', handleTouchMove, true)
      window.removeEventListener('touchend', handleTouchEnd, true)
      window.removeEventListener('touchcancel', handleTouchEnd, true)
    }
  }, [])

  useFrame((state, delta) => {
    const motion = motionRef.current
    const target = targetRef.current.set(
      motion.position.x,
      motion.position.y + ROBOT_CAMERA_TARGET_HEIGHT,
      motion.position.z,
    )
    const controls = getRobotWorldOrbitControls(state)
    const previousTarget = previousTargetRef.current

    if (!previousTarget || snapVersionRef.current !== motion.cameraSnapVersion) {
      snapThirdPersonCamera(state.camera, controls, target, motion.heading)
      syncThirdPersonCameraOrbitRefs(
        state.camera,
        target,
        cameraYawRef,
        cameraPitchRef,
        cameraDistanceRef,
      )
      previousTargetRef.current = target.clone()
      snapVersionRef.current = motion.cameraSnapVersion
      return
    }

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const gamepadInput = readLandrushGamepadInput()
    const gamepadLookActive = Boolean(gamepadInput && gamepadInput.lookStrength > 0)
    if (gamepadLookActive && gamepadInput && !mobileOrbitTouchRef.current) {
      cameraYawRef.current -= gamepadInput.lookX * ROBOT_CAMERA_GAMEPAD_YAW_SPEED * frameDelta
      cameraPitchRef.current = MathUtils.clamp(
        cameraPitchRef.current + gamepadInput.lookY * ROBOT_CAMERA_GAMEPAD_PITCH_SPEED * frameDelta,
        ROBOT_CAMERA_MIN_PITCH,
        ROBOT_CAMERA_MAX_PITCH,
      )
    }
    const joystick = mobileJoystickRef.current
    if (
      !gamepadLookActive &&
      joystick &&
      joystick.strength > 0.08 &&
      !mobileOrbitTouchRef.current &&
      isMobileControlViewport()
    ) {
      cameraYawRef.current = playerHeadingToCameraYaw(motion.heading)
    }

    const followAmount = 1 - Math.exp(-ROBOT_CAMERA_FOLLOW_RESPONSE * frameDelta)
    previousTarget.lerp(target, followAmount)
    const desiredCameraPosition = resolveThirdPersonCameraPosition(
      previousTarget,
      cameraYawRef.current,
      cameraPitchRef.current,
      cameraDistanceRef.current,
      desiredCameraPositionRef.current,
    )
    state.camera.position.lerp(desiredCameraPosition, followAmount)

    if (controls) {
      controls.target.copy(previousTarget)
      controls.update()
      return
    }

    state.camera.lookAt(previousTarget)
  })

  return null
}

function RobotPlayerBeacon({ color, node }: { color: string; node: LandrushWorldNode }) {
  const meshRef = useRef<Mesh>(null!)

  useFrame(() => {
    meshRef.current?.position.set(
      node.playerPosition[0],
      node.playerPosition[1] + 2.28,
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

function ParcelOwnershipLayer({
  allocation,
  buildParcelId,
  claimParcel,
  localMotionRef,
  localProfile,
  mapView,
  onBuildParcel,
  parcelClaimError,
  parcelOwnerships,
  parcelWorldId,
  remotePlayers,
  streetNetwork,
  surface,
  watchParcelWorld,
}: {
  allocation: ParcelAllocationResult | null
  buildParcelId: string | null
  claimParcel: (worldId: string, parcelId: string) => boolean
  localMotionRef: { current: RobotMotion | null }
  localProfile: LocalPlayerProfile
  mapView: boolean
  onBuildParcel: (context: WorldMultiplayerBuildContext) => void
  parcelClaimError: ParcelClaimError | null
  parcelOwnerships: readonly ParcelOwnership[]
  parcelWorldId: string
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  streetNetwork: ParcelStreetNetwork | null
  surface: WaterLandSurface
  watchParcelWorld: (worldId: string) => void
}) {
  const { camera, gl } = useThree()
  const [hoveredParcelId, setHoveredParcelId] = useState<string | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null)
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
  const groundY = surface.grassSurfaceElevation + PARCEL_MAP_OVERLAY_ELEVATION_OFFSET
  const selectedParcel = useMemo(
    () => allocation?.parcels.find((parcel) => parcel.id === selectedParcelId) ?? null,
    [allocation, selectedParcelId],
  )

  useEffect(() => {
    if (!allocation) return
    watchParcelWorld(parcelWorldId)
  }, [allocation, parcelWorldId, watchParcelWorld])

  useEffect(() => {
    if (mapView) return
    setHoveredParcelId(null)
    setSelectedParcelId(null)
  }, [mapView])

  useEffect(() => {
    if (!allocation || !mapView) return

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
      if (event.button !== 0) return
      if (buildParcelId) return

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
  }, [allocation, buildParcelId, camera, gl, groundY, mapPickNdc, mapPickRaycaster, mapView])

  if (!allocation) return null

  return (
    <>
      {allocation.parcels.map((parcel) => (
        <ParcelClaimMesh
          groundY={groundY}
          hovered={hoveredParcelId === parcel.id}
          key={parcel.id}
          mapView={mapView}
          onSelect={() => setSelectedParcelId(parcel.id)}
          parcel={parcel}
          selected={selectedParcelId === parcel.id || buildParcelId === parcel.id}
        />
      ))}
      <LocalMapPlayerMarker
        color={localProfile.color}
        groundY={groundY}
        motionRef={localMotionRef}
        visible={mapView}
      />
      {remotePlayers.map((player) => (
        <RemoteMapPlayerMarker
          groundY={groundY}
          key={player.id}
          player={player}
          visible={mapView}
        />
      ))}
      {localOwnership
        ? allocation.parcels
            .filter((parcel) => parcel.id === localOwnership.parcelId)
            .map((parcel) => (
              <ParcelBuildMarker
                groundY={groundY}
                key={parcel.id}
                onBuild={(ownedParcel) =>
                  onBuildParcel({
                    allocation,
                    parcel: ownedParcel,
                    parcelWorldId,
                    streetNetwork,
                    surface,
                  })
                }
                parcel={parcel}
                visible={!buildParcelId && mapView}
              />
            ))
        : null}
      {mapView && !buildParcelId && selectedParcel ? (
        <ParcelClaimDialog
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

function ParcelClaimMesh({
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
  const shape = useMemo(() => centeredShapeFromParcel(parcel), [parcel])
  const baseColor = useMemo(() => new Color(PARCEL_MAP_BASE_COLOR), [])
  const hoverColor = useMemo(() => new Color(PARCEL_MAP_HOVER_COLOR), [])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    if (!group || !material) return

    const interactive = mapView
    const emphasis = interactive && (hovered || selected)
    const targetScale = emphasis ? PARCEL_MAP_OVERLAY_HOVER_SCALE : 1
    const scale = MathUtils.damp(group.scale.x, targetScale, PARCEL_MAP_OVERLAY_RESPONSE, delta)
    group.scale.setScalar(scale)

    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 3.1 + parcel.index * 0.61) * 0.5
    const targetOpacity = interactive
      ? MathUtils.lerp(PARCEL_MAP_BASE_OPACITY, PARCEL_MAP_HOVER_OPACITY, emphasis ? 1 : 0) +
        pulse * 0.018
      : 0
    material.opacity = MathUtils.damp(
      material.opacity,
      targetOpacity,
      PARCEL_MAP_OVERLAY_RESPONSE,
      delta,
    )
    material.color.lerpColors(baseColor, hoverColor, emphasis ? 0.26 : pulse * 0.08)
  })

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
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial
          color={PARCEL_MAP_BASE_COLOR}
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

function LocalMapPlayerMarker({
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

  useFrame((_, delta) => {
    const group = groupRef.current
    const motion = motionRef.current
    if (!group) return

    group.visible = visible && Boolean(motion)
    if (!motion) return

    group.position.set(motion.position.x, groundY + 0.16, motion.position.z)
    group.rotation.y = lerpAngle(group.rotation.y, motion.heading, clamp01(delta * 16))
  })

  return <MapPlayerBadgeMarker color={color} groupRef={groupRef} visible={false} />
}

function RemoteMapPlayerMarker({
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
    targetPositionRef.current.set(player.position[0], groundY, player.position[2])
    targetHeadingRef.current = player.heading
  }, [groundY, player])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    group.visible = visible
    if (!visible) return

    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionAmount = 1 - Math.exp(-REMOTE_POSITION_RESPONSE * frameDelta)
    const headingAmount = 1 - Math.exp(-REMOTE_HEADING_RESPONSE * frameDelta)
    positionRef.current.lerp(targetPositionRef.current, positionAmount)
    headingRef.current = lerpAngle(headingRef.current, targetHeadingRef.current, headingAmount)

    group.position.set(positionRef.current.x, groundY + 0.24, positionRef.current.z)
    group.rotation.y = headingRef.current
  })

  return (
    <group ref={groupRef} visible={false}>
      <MapPlayerBadgeMarker color={player.color} scale={1.28} />
      <Html center className="pointer-events-none" position={[0, 0.36, 0]} zIndexRange={[68, 0]}>
        <span className="whitespace-nowrap rounded-full border border-white/16 bg-slate-950/72 px-2 py-0.5 text-[10px] font-semibold text-white/86 shadow-lg backdrop-blur">
          {player.name}
        </span>
      </Html>
    </group>
  )
}

function MapPlayerBadgeMarker({
  color,
  groupRef,
  scale = 1.5,
  visible = true,
}: {
  color: string
  groupRef?: RefObject<Group>
  scale?: number
  visible?: boolean
}) {
  return (
    <group ref={groupRef} scale={scale} visible={visible}>
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
      <Html center className="pointer-events-none select-none" position={[0, 0.12, 0]}>
        <span
          className="grid h-5 w-5 place-items-center rounded-full text-[13px] font-black leading-none text-slate-950"
          style={{
            textShadow:
              '0 1px 0 rgba(248,250,252,0.95), 1px 0 0 rgba(248,250,252,0.95), 0 -1px 0 rgba(248,250,252,0.95), -1px 0 0 rgba(248,250,252,0.95)',
          }}
        >
          P
        </span>
      </Html>
    </group>
  )
}

function ParcelBuildMarker({
  groundY,
  onBuild,
  parcel,
  visible,
}: {
  groundY: number
  onBuild: (parcel: ParcelAllocationParcel) => void
  parcel: ParcelAllocationParcel
  visible: boolean
}) {
  if (!visible) return null

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
        <Hammer className="size-3.5" aria-hidden />
        <span>Build</span>
      </button>
    </Html>
  )
}

function ParcelClaimDialog({
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
  const isFallbackProfile = localProfile.id === FALLBACK_LOCAL_PROFILE.id
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
            <X className="size-3.5" aria-hidden />
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

function RobotWalkerPrimitive({ color }: { color: string }) {
  return (
    <group>
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

export function MultiplayerStatusPanel({
  connection,
  localPlayerIncluded,
  remotePlayerCount,
  renderedFpsRef,
  status,
  voice,
}: {
  connection: MultiplayerConnectionDetails
  localPlayerIncluded: boolean
  remotePlayerCount: number
  renderedFpsRef?: RefObject<number | null>
  status: ConnectionStatus
  voice?: SpatialVoiceController
}) {
  const latencyLabelRef = useRef<HTMLSpanElement>(null)
  const displayedPlayerCount =
    connection.serverPlayerCount ?? remotePlayerCount + (localPlayerIncluded ? 1 : 0)
  const statusLabel = compactStatusLabel(status)
  const latencyLabel = connection.latencyMs === null ? '--ms' : `${connection.latencyMs}ms`
  const measuredFps = useMeasuredFps(renderedFpsRef)
  const fpsLabel = measuredFps === null ? '--fps' : `${measuredFps}fps`

  useEffect(() => {
    const element = latencyLabelRef.current
    if (!element) return
    element.textContent = latencyLabel

    const handleLatency = (event: Event) => {
      const latencyMs = (event as CustomEvent<number>).detail
      if (Number.isFinite(latencyMs)) element.textContent = `${latencyMs}ms`
    }
    window.addEventListener(MULTIPLAYER_LATENCY_EVENT, handleLatency)
    return () => window.removeEventListener(MULTIPLAYER_LATENCY_EVENT, handleLatency)
  }, [latencyLabel])

  return (
    <section className="pointer-events-auto absolute top-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded border border-white/18 bg-slate-950/62 px-2 py-1 font-medium text-[11px] text-white/88 shadow-lg backdrop-blur">
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${compactStatusDotClass(status)}`}
      />
      <span className="capitalize">{statusLabel}</span>
      <span className="text-white/35">/</span>
      <span>{displayedPlayerCount}p</span>
      <span className="text-white/35">/</span>
      <span ref={latencyLabelRef}>{latencyLabel}</span>
      <span className="text-white/35">/</span>
      <span>{fpsLabel}</span>
      {voice ? (
        <>
          <span className="text-white/35">/</span>
          <SpatialVoiceControl voice={voice} />
        </>
      ) : null}
    </section>
  )
}

function useMeasuredFps(renderedFpsRef?: RefObject<number | null>) {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    if (renderedFpsRef) {
      const updateRenderedFps = () => {
        setFps(document.visibilityState === 'visible' ? renderedFpsRef.current : null)
      }
      updateRenderedFps()
      const interval = window.setInterval(updateRenderedFps, 250)
      document.addEventListener('visibilitychange', updateRenderedFps)
      return () => {
        window.clearInterval(interval)
        document.removeEventListener('visibilitychange', updateRenderedFps)
      }
    }

    let animationFrame = 0
    let frameCount = 0
    let windowStartedAt = performance.now()

    const tick = (now: number) => {
      frameCount += 1
      const elapsedMs = now - windowStartedAt
      if (elapsedMs >= 1000) {
        setFps(Math.round((frameCount * 1000) / elapsedMs))
        frameCount = 0
        windowStartedAt = now
      }
      animationFrame = window.requestAnimationFrame(tick)
    }

    const handleVisibilityChange = () => {
      frameCount = 0
      windowStartedAt = performance.now()
      if (document.visibilityState !== 'visible') setFps(null)
    }

    animationFrame = window.requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [renderedFpsRef])

  return fps
}

function compactStatusLabel(status: ConnectionStatus) {
  if (status === 'connected') return 'online'
  if (status === 'reconnecting') return 'retry'
  if (status === 'connecting') return 'join'
  return 'offline'
}

function compactStatusDotClass(status: ConnectionStatus) {
  if (status === 'connected') return 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]'
  if (status === 'offline') return 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.65)]'
  return 'bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.65)]'
}

function MobileMapToggleButton({ mapView, onToggle }: { mapView: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={mapView ? 'Close map view' : 'Open map view'}
      className={`pointer-events-auto absolute right-5 bottom-[8.25rem] z-40 grid size-12 place-items-center rounded-full border shadow-xl backdrop-blur transition md:hidden ${
        mapView
          ? 'border-amber-100/70 bg-amber-300 text-slate-950'
          : 'border-white/24 bg-slate-950/48 text-white'
      }`}
      onClick={onToggle}
      type="button"
    >
      <MapIcon className="size-5" aria-hidden />
    </button>
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

function isMobileControlViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_CONTROLS_QUERY).matches
}

function isMobileCameraOrbitTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-landrush-mobile-joystick]')) return false
  return !target.closest(
    'a, button, input, select, textarea, section, [role="button"], [role="slider"]',
  )
}

function sortedRemotePlayerSnapshots(map: ReadonlyMap<string, MultiplayerPlayerSnapshot>) {
  return [...map.values()].sort((first, second) => first.name.localeCompare(second.name))
}

function remotePlayerRosterChanged(
  previous: MultiplayerPlayerSnapshot,
  next: MultiplayerPlayerSnapshot,
) {
  return previous.name !== next.name || previous.color !== next.color || previous.pose !== next.pose
}

export function useLandrushWorldMultiplayer({
  enabled,
  localProfile,
  onVoiceSignal,
  persistOfflineState = true,
  roomId,
  spectator,
}: {
  enabled: boolean
  localProfile: LocalPlayerProfile
  onVoiceSignal?: (message: SpatialVoiceSignalMessage) => void
  persistOfflineState?: boolean
  roomId: string
  spectator: boolean
}) {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectAttemptRef = useRef(0)
  const latestPlayerRef = useRef<MultiplayerPlayerSnapshot | null>(null)
  const heartbeatIntervalMsRef = useRef(createConnectionDetails().heartbeatIntervalMs)
  const lastNetworkSentAtRef = useRef(0)
  const lastSentPlayerRef = useRef<MultiplayerPlayerSnapshot | null>(null)
  const onVoiceSignalRef = useRef(onVoiceSignal)
  const voiceSignalSequenceRef = useRef(0)
  const watchedParcelWorldIdRef = useRef<string | null>(null)
  const remotePlayerMapRef = useRef<Map<string, MultiplayerPlayerSnapshot>>(new Map())
  const remotePlayerTimelineMapRef = useRef<Map<string, MultiplayerRemotePlayerTimeline>>(new Map())
  const [connection, setConnection] =
    useState<MultiplayerConnectionDetails>(createConnectionDetails)
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? 'connecting' : 'offline')
  const [remotePlayerRosterMap, setRemotePlayerRosterMap] = useState<
    Map<string, MultiplayerPlayerSnapshot>
  >(() => new Map())
  const [parcelClaimError, setParcelClaimError] = useState<ParcelClaimError | null>(null)
  const [parcelOwnershipMap, setParcelOwnershipMap] = useState<Map<string, ParcelOwnership>>(
    () => new Map(),
  )
  const [parcelBuildNodeMap, setParcelBuildNodeMap] = useState<
    Map<string, ParcelBuildNodesSnapshot>
  >(() => new Map())
  const [parcelBuildSnapshotWorldId, setParcelBuildSnapshotWorldId] = useState<string | null>(null)
  const [tvMediaStateMap, setTvMediaStateMap] = useState<Map<string, TvMediaStateSnapshot>>(
    () => new Map(),
  )
  const parcelOwnershipMapRef = useRef(parcelOwnershipMap)
  const parcelBuildNodeMapRef = useRef(parcelBuildNodeMap)
  const tvMediaStateMapRef = useRef(tvMediaStateMap)
  const remotePlayers = useMemo(
    () => sortedRemotePlayerSnapshots(remotePlayerRosterMap),
    [remotePlayerRosterMap],
  )
  const remotePlayerStore = useMemo<MultiplayerRemotePlayerStore>(
    () => ({
      getPresentationSnapshot: (id, now) =>
        resolveRemotePresentationSnapshot(remotePlayerTimelineMapRef.current.get(id) ?? null, now),
      getSnapshot: (id) => remotePlayerMapRef.current.get(id) ?? null,
      getSnapshots: () => sortedRemotePlayerSnapshots(remotePlayerMapRef.current),
    }),
    [],
  )
  const parcelOwnerships = useMemo(
    () =>
      [...parcelOwnershipMap.values()].sort((first, second) =>
        first.parcelId.localeCompare(second.parcelId),
      ),
    [parcelOwnershipMap],
  )
  const parcelBuildNodes = useMemo(
    () =>
      [...parcelBuildNodeMap.values()].sort((first, second) =>
        first.parcelId.localeCompare(second.parcelId),
      ),
    [parcelBuildNodeMap],
  )
  const tvMediaStates = useMemo(
    () =>
      [...tvMediaStateMap.values()].sort((first, second) => first.tvId.localeCompare(second.tvId)),
    [tvMediaStateMap],
  )

  useEffect(() => {
    parcelOwnershipMapRef.current = parcelOwnershipMap
  }, [parcelOwnershipMap])

  useEffect(() => {
    parcelBuildNodeMapRef.current = parcelBuildNodeMap
  }, [parcelBuildNodeMap])

  useEffect(() => {
    tvMediaStateMapRef.current = tvMediaStateMap
  }, [tvMediaStateMap])

  useEffect(() => {
    onVoiceSignalRef.current = onVoiceSignal
  }, [onVoiceSignal])

  const sendMessage = useCallback((message: unknown, socket = socketRef.current) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send(JSON.stringify(message))
      return true
    } catch {
      setConnection((current) => ({
        ...current,
        lastError: 'Could not send multiplayer message',
      }))
      socket.close()
      return false
    }
  }, [])

  const sendPlayerState = useCallback(
    (player: MultiplayerPlayerSnapshot) => {
      latestPlayerRef.current = player
      if (!enabled || spectator) return

      const now = window.performance.now()
      if (
        !shouldSendPlayerSnapshot(
          player,
          lastSentPlayerRef.current,
          now - lastNetworkSentAtRef.current,
        )
      ) {
        return
      }

      if (sendMessage({ player, type: 'state' })) {
        lastNetworkSentAtRef.current = now
        lastSentPlayerRef.current = player
      }
    },
    [enabled, sendMessage, spectator],
  )

  const publishLocalPlayer = useCallback(
    (player: MultiplayerPlayerSnapshot) => {
      sendPlayerState(player)
    },
    [sendPlayerState],
  )

  const sendVoiceSignal = useCallback(
    (to: string, signal: SpatialVoiceSignalPayload) =>
      Boolean(sendMessage({ signal, to, type: 'voice-signal' })),
    [sendMessage],
  )

  const watchParcelWorld = useCallback(
    (worldId: string) => {
      if (watchedParcelWorldIdRef.current !== worldId) {
        watchedParcelWorldIdRef.current = worldId
        const offlineState =
          !enabled && persistOfflineState ? readOfflineParcelWorldState(worldId) : null
        const nextOwnershipMap = offlineState
          ? new Map(offlineState.ownerships.map((ownership) => [ownership.parcelId, ownership]))
          : new Map<string, ParcelOwnership>()
        const nextBuildNodeMap = offlineState
          ? new Map(offlineState.builds.map((build) => [build.parcelId, build]))
          : new Map<string, ParcelBuildNodesSnapshot>()
        const nextTvMediaStateMap = offlineState
          ? new Map(offlineState.tvMediaStates.map((tv) => [tv.tvId, tv]))
          : new Map<string, TvMediaStateSnapshot>()
        parcelOwnershipMapRef.current = nextOwnershipMap
        parcelBuildNodeMapRef.current = nextBuildNodeMap
        tvMediaStateMapRef.current = nextTvMediaStateMap
        setParcelBuildSnapshotWorldId(enabled ? null : worldId)
        setParcelOwnershipMap(nextOwnershipMap)
        setParcelBuildNodeMap(nextBuildNodeMap)
        setTvMediaStateMap(nextTvMediaStateMap)
      }
      if (!enabled) return
      sendMessage({ roomId, type: 'watch-parcels', worldId })
    },
    [enabled, persistOfflineState, roomId, sendMessage],
  )

  const syncParcelBuildNodes = useCallback(
    (worldId: string, parcelId: string, nodes: readonly AnyNode[]) => {
      watchedParcelWorldIdRef.current = worldId
      if (!enabled) {
        const build = {
          nodes: [...nodes],
          parcelId,
          updatedAt: Date.now(),
          updatedBy: localProfile.id,
          worldId,
        } satisfies ParcelBuildNodesSnapshot
        const nextBuildNodeMap = new Map(parcelBuildNodeMapRef.current)
        nextBuildNodeMap.set(parcelId, build)
        parcelBuildNodeMapRef.current = nextBuildNodeMap
        setParcelBuildNodeMap(nextBuildNodeMap)
        if (persistOfflineState) {
          writeOfflineParcelWorldState(
            worldId,
            [...parcelOwnershipMapRef.current.values()],
            [...nextBuildNodeMap.values()],
            [...tvMediaStateMapRef.current.values()],
          )
        }
        return true
      }

      const sent = sendMessage({ nodes, parcelId, type: 'sync-parcel-build-nodes', worldId })
      if (!sent) {
        setConnection((current) => ({
          ...current,
          lastError: 'Connect before syncing build nodes',
        }))
      }
      return Boolean(sent)
    },
    [enabled, localProfile.id, persistOfflineState, sendMessage],
  )

  const syncTvMediaState = useCallback(
    (
      worldId: string,
      parcelId: string,
      tvId: string,
      media: {
        muted: boolean
        playbackSeconds: number
        playbackUpdatedAt: number
        playing: boolean
        url: string
        userVolume: number
      },
    ) => {
      watchedParcelWorldIdRef.current = worldId
      const now = Date.now()
      const tv = {
        muted: Boolean(media.muted),
        parcelId,
        playbackSeconds: Math.max(0, finiteNumber(media.playbackSeconds, 0)),
        playbackUpdatedAt: now,
        playing: Boolean(media.playing),
        tvId,
        updatedAt: now,
        updatedBy: localProfile.id,
        url: media.url,
        userVolume: Math.max(0, Math.min(1, media.userVolume)),
        worldId,
      } satisfies TvMediaStateSnapshot
      const nextTvMediaStateMap = new Map(tvMediaStateMapRef.current)
      nextTvMediaStateMap.set(tvId, tv)
      tvMediaStateMapRef.current = nextTvMediaStateMap
      setTvMediaStateMap(nextTvMediaStateMap)

      if (!enabled) {
        if (persistOfflineState) {
          writeOfflineParcelWorldState(
            worldId,
            [...parcelOwnershipMapRef.current.values()],
            [...parcelBuildNodeMapRef.current.values()],
            [...nextTvMediaStateMap.values()],
          )
        }
        return true
      }

      const sent = sendMessage({
        muted: tv.muted,
        parcelId,
        playbackSeconds: tv.playbackSeconds,
        playing: tv.playing,
        tvId,
        type: 'sync-tv-media-state',
        url: tv.url,
        userVolume: tv.userVolume,
        worldId,
      })
      if (!sent) {
        setConnection((current) => ({
          ...current,
          lastError: 'Connect before syncing TV media',
        }))
      }
      return Boolean(sent)
    },
    [enabled, localProfile.id, persistOfflineState, sendMessage],
  )

  const claimParcel = useCallback(
    (worldId: string, parcelId: string) => {
      watchedParcelWorldIdRef.current = worldId
      setParcelClaimError(null)
      if (!enabled) {
        const currentOwnershipMap = parcelOwnershipMapRef.current
        const existingOwnership = currentOwnershipMap.get(parcelId)
        if (existingOwnership && existingOwnership.owner.id !== localProfile.id) {
          setParcelClaimError({
            code: 'parcel-owned',
            message: 'Parcel already claimed',
            parcelId,
            worldId,
          })
          return false
        }

        const existingLocalOwnership = [...currentOwnershipMap.values()].find(
          (ownership) =>
            ownership.worldId === worldId &&
            ownership.owner.id === localProfile.id &&
            ownership.parcelId !== parcelId,
        )
        if (existingLocalOwnership) {
          setParcelClaimError({
            code: 'already-owns-parcel',
            message: 'You already claimed a parcel',
            parcelId,
            worldId,
          })
          return false
        }

        const nextOwnershipMap = new Map(currentOwnershipMap)
        nextOwnershipMap.set(parcelId, {
          claimedAt: Date.now(),
          owner: localProfile,
          parcelId,
          worldId,
        })
        parcelOwnershipMapRef.current = nextOwnershipMap
        setParcelOwnershipMap(nextOwnershipMap)
        if (persistOfflineState) {
          writeOfflineParcelWorldState(
            worldId,
            [...nextOwnershipMap.values()],
            [...parcelBuildNodeMapRef.current.values()],
            [...tvMediaStateMapRef.current.values()],
          )
        }
        return true
      }

      const sent = sendMessage({ parcelId, type: 'claim-parcel', worldId })
      if (!sent) {
        setParcelClaimError({
          code: 'not-connected',
          message: 'Connect before claiming a parcel',
          parcelId,
          worldId,
        })
      }
      return Boolean(sent)
    },
    [enabled, localProfile, persistOfflineState, sendMessage],
  )

  useEffect(() => {
    if (!enabled || (!spectator && localProfile.id === FALLBACK_LOCAL_PROFILE.id)) {
      setStatus(enabled ? 'connecting' : 'offline')
      remotePlayerMapRef.current = new Map()
      remotePlayerTimelineMapRef.current = new Map()
      setRemotePlayerRosterMap(new Map())
      setParcelClaimError(null)
      const offlineState =
        !enabled && persistOfflineState
          ? readOfflineParcelWorldState(watchedParcelWorldIdRef.current)
          : null
      const nextOwnershipMap = offlineState
        ? new Map(offlineState.ownerships.map((ownership) => [ownership.parcelId, ownership]))
        : new Map<string, ParcelOwnership>()
      const nextBuildNodeMap = offlineState
        ? new Map(offlineState.builds.map((build) => [build.parcelId, build]))
        : new Map<string, ParcelBuildNodesSnapshot>()
      const nextTvMediaStateMap = offlineState
        ? new Map(offlineState.tvMediaStates.map((tv) => [tv.tvId, tv]))
        : new Map<string, TvMediaStateSnapshot>()
      parcelOwnershipMapRef.current = nextOwnershipMap
      parcelBuildNodeMapRef.current = nextBuildNodeMap
      tvMediaStateMapRef.current = nextTvMediaStateMap
      setParcelBuildSnapshotWorldId(enabled ? null : watchedParcelWorldIdRef.current)
      setParcelBuildNodeMap(nextBuildNodeMap)
      setParcelOwnershipMap(nextOwnershipMap)
      setTvMediaStateMap(nextTvMediaStateMap)
      setConnection(createConnectionDetails())
      return
    }

    let cancelled = false
    let reconnectTimer = 0
    let heartbeatTimer = 0

    const clearHeartbeat = () => {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = 0
    }

    const connect = () => {
      if (cancelled) return
      setParcelBuildSnapshotWorldId(null)
      setStatus(reconnectDelayRef.current > 1000 ? 'reconnecting' : 'connecting')
      setConnection((current) => ({
        ...current,
        connectionId: null,
        lastError: null,
        reconnectAttempt: reconnectAttemptRef.current,
      }))

      const socket = new WebSocket(resolveWebSocketUrl())
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (cancelled) return
        reconnectDelayRef.current = 1000
        reconnectAttemptRef.current = 0
        const player = latestPlayerRef.current ?? createStationaryPlayer(localProfile)
        const joined = spectator
          ? sendMessage({ roomId, type: 'watch' }, socket)
          : sendMessage({ player, roomId, type: 'join' }, socket)
        if (joined) {
          lastNetworkSentAtRef.current = window.performance.now()
          lastSentPlayerRef.current = player
        }
        const watchedParcelWorldId = watchedParcelWorldIdRef.current
        if (watchedParcelWorldId) {
          sendMessage({ roomId, type: 'watch-parcels', worldId: watchedParcelWorldId }, socket)
        }
        clearHeartbeat()
        heartbeatTimer = window.setInterval(() => {
          sendMessage({ sentAt: Date.now(), type: 'heartbeat' }, socket)
        }, heartbeatIntervalMsRef.current)
      })

      socket.addEventListener('message', (event) => {
        const message = parseServerMessage(event.data)
        if (!message) return

        if (message.type === 'welcome') {
          heartbeatIntervalMsRef.current = message.heartbeatIntervalMs
          setConnection((current) => ({
            ...current,
            connectionId: message.connectionId,
            heartbeatIntervalMs: message.heartbeatIntervalMs,
            lastError: null,
            maxPeers: message.maxPeers,
            stalePeerMs: message.stalePeerMs,
          }))
          return
        }

        if (message.type === 'error') {
          setConnection((current) => ({
            ...current,
            lastError: message.message,
          }))
          return
        }

        if (message.type === 'heartbeat') {
          const receivedAt = Date.now()
          if (typeof message.sentAt === 'number') {
            window.dispatchEvent(
              new CustomEvent<number>(MULTIPLAYER_LATENCY_EVENT, {
                detail: Math.max(0, receivedAt - message.sentAt),
              }),
            )
          }
          setConnection((current) => {
            const serverPlayerCount = message.playerCount ?? current.serverPlayerCount
            if (current.lastError === null && current.serverPlayerCount === serverPlayerCount) {
              return current
            }
            return {
              ...current,
              lastError: null,
              serverPlayerCount,
            }
          })
          return
        }

        if (message.type === 'voice-signal') {
          if (message.roomId !== roomId || message.from === localProfile.id) return
          onVoiceSignalRef.current?.({
            from: message.from,
            sequence: voiceSignalSequenceRef.current++,
            signal: message.signal,
          })
          return
        }

        if (message.type === 'parcel-claim-rejected') {
          if (message.roomId && message.roomId !== roomId) return
          setParcelClaimError({
            code: message.code,
            message: message.message,
            parcelId: message.parcelId,
            worldId: message.worldId,
          })
          return
        }

        if (message.roomId !== roomId) return

        if (message.type === 'parcel-ownership-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          setParcelOwnershipMap(
            new Map(message.ownerships.map((ownership) => [ownership.parcelId, ownership])),
          )
          setParcelClaimError(null)
          return
        }

        if (message.type === 'parcel-owned' || message.type === 'parcel-claim-result') {
          if (message.ownership.worldId !== watchedParcelWorldIdRef.current) return
          setParcelOwnershipMap((current) => {
            const next = new Map(current)
            next.set(message.ownership.parcelId, message.ownership)
            return next
          })
          setParcelClaimError(null)
          return
        }

        if (message.type === 'parcel-build-nodes-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          setParcelBuildNodeMap(new Map(message.builds.map((build) => [build.parcelId, build])))
          setParcelBuildSnapshotWorldId(message.worldId)
          return
        }

        if (message.type === 'tv-media-state-snapshot') {
          if (message.worldId !== watchedParcelWorldIdRef.current) return
          const receivedAt = Date.now()
          setTvMediaStateMap(
            new Map(
              message.tvs.map((tv) => {
                const normalized = normalizeTvMediaStateSnapshot(tv, message.serverTime, receivedAt)
                return [normalized.tvId, normalized]
              }),
            ),
          )
          return
        }

        if (
          message.type === 'parcel-build-nodes-synced' ||
          message.type === 'parcel-build-nodes-updated'
        ) {
          if (message.build.worldId !== watchedParcelWorldIdRef.current) return
          setParcelBuildNodeMap((current) => {
            const next = new Map(current)
            next.set(message.build.parcelId, message.build)
            return next
          })
          return
        }

        if (message.type === 'tv-media-state-synced' || message.type === 'tv-media-state-updated') {
          if (message.tv.worldId !== watchedParcelWorldIdRef.current) return
          const normalized = normalizeTvMediaStateSnapshot(message.tv, message.serverTime)
          setTvMediaStateMap((current) => {
            const next = new Map(current)
            next.set(normalized.tvId, normalized)
            return next
          })
          return
        }

        if (message.type === 'room-state') {
          setConnection((current) =>
            current.serverPlayerCount === message.playerCount
              ? current
              : { ...current, serverPlayerCount: message.playerCount },
          )
          return
        }

        if (message.type === 'snapshot') {
          setStatus('connected')
          const receivedAt = performance.now()
          const nextRemotePlayerMap = new Map<string, MultiplayerPlayerSnapshot>()
          const nextRemotePlayerTimelineMap = new Map<string, MultiplayerRemotePlayerTimeline>()
          for (const player of message.players) {
            if (player.id === localProfile.id) continue
            const reconciliation = reconcileRemotePresentationTimeline(
              remotePlayerTimelineMapRef.current.get(player.id) ?? null,
              player,
              message.serverTime,
              receivedAt,
            )
            nextRemotePlayerTimelineMap.set(player.id, reconciliation.timeline)
            nextRemotePlayerMap.set(
              player.id,
              reconciliation.accepted
                ? player
                : (remotePlayerMapRef.current.get(player.id) ?? player),
            )
          }
          remotePlayerMapRef.current = nextRemotePlayerMap
          remotePlayerTimelineMapRef.current = nextRemotePlayerTimelineMap
          setRemotePlayerRosterMap(new Map(nextRemotePlayerMap))
          renderScheduler.requestFrame('animation')
          setConnection((current) => {
            const serverPlayerCount = message.players.length + (spectator ? 0 : 1)
            return current.serverPlayerCount === serverPlayerCount
              ? current
              : { ...current, serverPlayerCount }
          })
          return
        }

        if (message.type === 'player-joined' || message.type === 'player-state') {
          if (message.player.id === localProfile.id) return
          const reconciliation = reconcileRemotePresentationTimeline(
            remotePlayerTimelineMapRef.current.get(message.player.id) ?? null,
            message.player,
            message.serverTime,
            performance.now(),
          )
          remotePlayerTimelineMapRef.current.set(message.player.id, reconciliation.timeline)
          if (!reconciliation.accepted) return
          const previous = remotePlayerMapRef.current.get(message.player.id)
          remotePlayerMapRef.current.set(message.player.id, message.player)
          if (!previous || remotePlayerRosterChanged(previous, message.player)) {
            setRemotePlayerRosterMap(new Map(remotePlayerMapRef.current))
          }
          renderScheduler.requestFrame('animation')
          return
        }

        if (message.type === 'player-left') {
          remotePlayerMapRef.current.delete(message.id)
          remotePlayerTimelineMapRef.current.delete(message.id)
          setRemotePlayerRosterMap(new Map(remotePlayerMapRef.current))
          renderScheduler.requestFrame('animation')
        }
      })

      socket.addEventListener('close', (event) => {
        clearHeartbeat()
        if (socketRef.current === socket) socketRef.current = null
        if (cancelled) return

        reconnectAttemptRef.current += 1
        setStatus('reconnecting')
        setConnection((current) => ({
          ...current,
          connectionId: null,
          lastError: event.reason || current.lastError,
          reconnectAttempt: reconnectAttemptRef.current,
        }))
        reconnectTimer = window.setTimeout(connect, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000)
      })

      socket.addEventListener('error', () => {
        if (cancelled) return
        setStatus('reconnecting')
        setConnection((current) => ({
          ...current,
          lastError: 'WebSocket connection error',
        }))
      })
    }

    connect()

    return () => {
      cancelled = true
      window.clearTimeout(reconnectTimer)
      clearHeartbeat()
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'leave' }))
      }
      socket?.close()
    }
  }, [enabled, localProfile, persistOfflineState, roomId, sendMessage, spectator])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (status === 'connected') return
      const cutoff = Date.now() - REMOTE_PLAYER_STALE_MS
      const next = new Map(
        [...remotePlayerMapRef.current.entries()].filter(
          ([, player]) => player.updatedAt >= cutoff,
        ),
      )
      if (next.size === remotePlayerMapRef.current.size) return
      remotePlayerMapRef.current = next
      remotePlayerTimelineMapRef.current = new Map(
        [...remotePlayerTimelineMapRef.current.entries()].filter(([id]) => next.has(id)),
      )
      setRemotePlayerRosterMap(new Map(next))
    }, 3000)
    return () => window.clearInterval(interval)
  }, [status])

  return {
    claimParcel,
    connection,
    parcelBuildNodes,
    parcelBuildSnapshotWorldId,
    parcelClaimError,
    parcelOwnerships,
    publishLocalPlayer,
    remotePlayerStore,
    remotePlayers,
    sendVoiceSignal,
    syncParcelBuildNodes,
    syncTvMediaState,
    status,
    tvMediaStates,
    watchParcelWorld,
  }
}

function shouldSendPlayerSnapshot(
  player: MultiplayerPlayerSnapshot,
  previous: MultiplayerPlayerSnapshot | null,
  elapsedSinceLastSendMs: number,
) {
  if (!previous) return true
  if (elapsedSinceLastSendMs >= LOCAL_STATE_IDLE_SEND_INTERVAL_MS) return true
  if (player.name !== previous.name || player.color !== previous.color) return true
  if (player.moving !== previous.moving) return true
  if (player.pose !== previous.pose) return true
  if (Math.abs(player.speed - previous.speed) >= LOCAL_STATE_SPEED_EPSILON) return true
  if (angleDistance(player.heading, previous.heading) >= LOCAL_STATE_HEADING_EPSILON) return true

  return (
    distanceSquared3(player.position, previous.position) >=
    LOCAL_STATE_POSITION_EPSILON * LOCAL_STATE_POSITION_EPSILON
  )
}

function distanceSquared3(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
) {
  const dx = first[0] - second[0]
  const dy = first[1] - second[1]
  const dz = first[2] - second[2]
  return dx * dx + dy * dy + dz * dz
}

function angleDistance(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)))
}

function createRobotNode(id: string, spawn: LandrushPoint2, groundY: number) {
  return LandrushWorldNodeSchema.parse({
    id: robotNodeId(id),
    landrushMode: 'walk',
    playerHeading: 0,
    playerMoving: false,
    playerPosition: [spawn.x, groundY, spawn.z],
    playerSpeed: 0,
    playerStart: [spawn.x, groundY, spawn.z],
    type: 'landrush-world',
  })
}

function updateRobotNodeIdentity(
  node: LandrushWorldNode,
  id: string,
  spawn: LandrushPoint2,
  groundY: number,
) {
  node.id = robotNodeId(id)
  node.playerStart = [spawn.x, groundY, spawn.z]
}

function robotNodeId(id: string): `landrush-world_${string}` {
  return `landrush-world_${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function writeMotionToRobotNode(node: LandrushWorldNode, motion: RobotMotion) {
  node.playerPosition = [motion.position.x, motion.position.y, motion.position.z]
  node.playerHeading = motion.heading
  node.playerMoving = motion.isMoving
  node.playerSpeed = motion.speed
}

function snapThirdPersonCamera(
  camera: Camera,
  controls: RobotWorldOrbitControls | undefined,
  target: Vector3,
  heading: number,
) {
  camera.position.set(
    target.x - Math.sin(heading) * ROBOT_CAMERA_INITIAL_DISTANCE,
    target.y + ROBOT_CAMERA_INITIAL_HEIGHT,
    target.z - Math.cos(heading) * ROBOT_CAMERA_INITIAL_DISTANCE,
  )
  camera.lookAt(target)

  if (!controls) return
  controls.target.copy(target)
  controls.update()
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
    ROBOT_CAMERA_MIN_PITCH,
    ROBOT_CAMERA_MAX_PITCH,
  )
  distanceRef.current = MathUtils.clamp(
    Math.hypot(horizontalDistance, offsetY),
    ROBOT_CAMERA_MIN_DISTANCE,
    ROBOT_CAMERA_MAX_DISTANCE,
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
  return (state as { controls?: RobotWorldOrbitControls }).controls
}

function resolveRobotTargetSpeed(movement: RobotMovementInput, runPressed: boolean) {
  if (runPressed) return ROBOT_RUN_SPEED
  const walkSpeed = ROBOT_WALK_SPEED * movement.intensity
  return MathUtils.lerp(walkSpeed, ROBOT_RUN_SPEED, movement.runAmount)
}

function resolveCameraRelativeMovement(
  keys: ReadonlySet<string>,
  camera: Camera,
  joystick: MobileJoystickInput | null,
  gamepadInput: LandrushGamepadInput | null = null,
): RobotMovementInput | null {
  const keyboardStrafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const keyboardForward =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'))
  const hasKeyboardInput = keyboardStrafe !== 0 || keyboardForward !== 0
  const hasJoystickInput = Boolean(joystick && joystick.strength > 0.08)
  const hasGamepadInput = Boolean(gamepadInput && gamepadInput.strength > 0)
  const strafe = keyboardStrafe + (joystick?.strafe ?? 0) + (gamepadInput?.strafe ?? 0)
  const forwardInput = keyboardForward + (joystick?.forward ?? 0) + (gamepadInput?.forward ?? 0)

  if (strafe === 0 && forwardInput === 0) return null

  const forward = resolveCameraForwardXZ(camera)
  const right = { x: -forward.z, z: forward.x }
  const direction = normalize2(
    right.x * strafe + forward.x * forwardInput,
    right.z * strafe + forward.z * forwardInput,
  )
  const heading = Math.atan2(direction.x, direction.z)
  const joystickStrength = hasJoystickInput ? (joystick?.strength ?? 1) : 0
  const gamepadStrength = hasGamepadInput ? (gamepadInput?.strength ?? 1) : 0
  const analogStrength = Math.max(joystickStrength, gamepadStrength)
  const intensity = hasKeyboardInput ? 1 : hasJoystickInput || hasGamepadInput ? analogStrength : 1
  const runAmount = gamepadInput?.run
    ? 1
    : hasKeyboardInput || (!hasJoystickInput && !hasGamepadInput)
      ? 0
      : clamp01((analogStrength - ROBOT_JOYSTICK_RUN_START) / (1 - ROBOT_JOYSTICK_RUN_START))
  return { ...direction, heading, intensity, runAmount }
}

function resolveCameraForwardHeading(camera: Camera) {
  const forward = resolveCameraForwardXZ(camera)
  return Math.atan2(forward.x, forward.z)
}

function playerHeadingToCameraYaw(heading: number) {
  return heading + Math.PI
}

function resolveCameraForwardXZ(camera: Camera) {
  const forward = new Vector3()
  camera.getWorldDirection(forward)
  forward.y = 0
  if (forward.lengthSq() < 0.000001) {
    return { x: 0, z: 1 }
  }
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
  const ring = openRing(points)
  if (ring.length < 3) return averagePoint(ring)

  let twiceArea = 0
  let x = 0
  let z = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    if (!(current && next)) continue
    const cross = current.x * next.z - next.x * current.z
    twiceArea += cross
    x += (current.x + next.x) * cross
    z += (current.z + next.z) * cross
  }

  if (Math.abs(twiceArea) < 0.000001) return averagePoint(ring)

  const centroid = { x: x / (3 * twiceArea), z: z / (3 * twiceArea) }
  if (pointInPolygon(centroid, ring)) return centroid

  return triangulatedInteriorPoint(ring) ?? averagePoint(ring)
}

function centeredShapeFromParcel(parcel: ParcelAllocationParcel) {
  const shape = new Shape()
  const ring = openRing(parcel.points)
  const first = ring[0]
  if (!first) return shape

  shape.moveTo(first.x - parcel.centroid.x, -(first.z - parcel.centroid.z))
  for (let index = 1; index < ring.length; index += 1) {
    const point = ring[index]
    if (point) shape.lineTo(point.x - parcel.centroid.x, -(point.z - parcel.centroid.z))
  }
  shape.closePath()
  return shape
}

function formatParcelLabel(parcelId: string) {
  return parcelId
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function averagePoint(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function triangulatedInteriorPoint(points: readonly LandrushPoint2[]) {
  const triangles = ShapeUtils.triangulateShape(
    points.map((point) => new Vector2(point.x, point.z)),
    [],
  )
  let largestArea = 0
  let selected: LandrushPoint2 | null = null

  for (const triangle of triangles) {
    const [firstIndex, secondIndex, thirdIndex] = triangle
    if (
      typeof firstIndex !== 'number' ||
      typeof secondIndex !== 'number' ||
      typeof thirdIndex !== 'number'
    ) {
      continue
    }

    const first = points[firstIndex]
    const second = points[secondIndex]
    const third = points[thirdIndex]
    if (!(first && second && third)) continue

    const candidate = {
      x: (first.x + second.x + third.x) / 3,
      z: (first.z + second.z + third.z) / 3,
    }
    if (!pointInPolygon(candidate, points)) continue

    const area = triangleArea(first, second, third)
    if (area > largestArea) {
      largestArea = area
      selected = candidate
    }
  }

  return selected
}

function triangleArea(first: LandrushPoint2, second: LandrushPoint2, third: LandrushPoint2) {
  return Math.abs(
    (second.x - first.x) * (third.z - first.z) - (third.x - first.x) * (second.z - first.z),
  )
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  const ring = openRing(polygon)
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

function openRing(points: readonly LandrushPoint2[]) {
  const first = points[0]
  const last = points.at(-1)
  return first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.001
    ? points.slice(0, -1)
    : [...points]
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

function approach(current: number, target: number, maxDelta: number) {
  if (current < target) return Math.min(current + maxDelta, target)
  if (current > target) return Math.max(current - maxDelta, target)
  return target
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

function finiteNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
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

function releaseWorldPointerLock() {
  if (!(document.pointerLockElement instanceof HTMLCanvasElement)) return false
  document.exitPointerLock()
  return true
}

function requestWorldPointerLock() {
  const canvas = document.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement) || document.pointerLockElement === canvas) return
  void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined)
}

function snapshotPoint(player: MultiplayerPlayerSnapshot): LandrushPoint2 {
  return { x: player.position[0], z: player.position[2] }
}

function createStationaryPlayer(profile: LocalPlayerProfile): MultiplayerPlayerSnapshot {
  return {
    ...profile,
    heading: 0,
    moving: false,
    position: [0, 0, 0],
    speed: 0,
    updatedAt: Date.now(),
  }
}

export function readLocalPlayerProfile(): LocalPlayerProfile {
  const stored = window.localStorage.getItem(PLAYER_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as LocalPlayerProfile
      if (parsed.id && parsed.name && parsed.color) return parsed
    } catch {
      window.localStorage.removeItem(PLAYER_STORAGE_KEY)
    }
  }

  const id = createPlayerId()
  const color = PLAYER_COLORS[hashString(id) % PLAYER_COLORS.length] ?? PLAYER_COLORS[0]
  const profile = {
    color,
    id,
    name: `Builder ${id.slice(0, 4).toUpperCase()}`,
  }
  window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(profile))
  return profile
}

function readOfflineParcelWorldState(worldId: string | null) {
  if (!worldId) return null
  const state = readOfflineParcelStateStore()[worldId]
  if (!state) return { builds: [], ownerships: [], tvMediaStates: [] }

  return {
    builds: Array.isArray(state.builds)
      ? state.builds.filter(
          (build) => build?.worldId === worldId && typeof build.parcelId === 'string',
        )
      : [],
    ownerships: Array.isArray(state.ownerships)
      ? state.ownerships.filter(
          (ownership) => ownership?.worldId === worldId && typeof ownership.parcelId === 'string',
        )
      : [],
    tvMediaStates: Array.isArray(state.tvMediaStates)
      ? state.tvMediaStates
          .filter((tv) => tv?.worldId === worldId && typeof tv.tvId === 'string')
          .map((tv) => normalizeTvMediaStateSnapshot(tv, Date.now()))
      : [],
  }
}

function writeOfflineParcelWorldState(
  worldId: string,
  ownerships: readonly ParcelOwnership[],
  builds: readonly ParcelBuildNodesSnapshot[],
  tvMediaStates: readonly TvMediaStateSnapshot[],
) {
  const store = readOfflineParcelStateStore()
  store[worldId] = {
    builds: builds.filter((build) => build.worldId === worldId),
    ownerships: ownerships.filter((ownership) => ownership.worldId === worldId),
    tvMediaStates: tvMediaStates.filter((tv) => tv.worldId === worldId),
  }
  try {
    window.localStorage.setItem(OFFLINE_PARCEL_STATE_STORAGE_KEY, JSON.stringify(store))
  } catch {
    window.localStorage.removeItem(OFFLINE_PARCEL_STATE_STORAGE_KEY)
  }
}

function readOfflineParcelStateStore(): OfflineParcelStateStore {
  const stored = window.localStorage.getItem(OFFLINE_PARCEL_STATE_STORAGE_KEY)
  if (!stored) return {}
  try {
    const parsed = JSON.parse(stored) as OfflineParcelStateStore
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    window.localStorage.removeItem(OFFLINE_PARCEL_STATE_STORAGE_KEY)
    return {}
  }
}

function createPlayerId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `player-${Math.random().toString(36).slice(2, 10)}`
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function sanitizeRoomId(roomId: string) {
  const normalized = roomId.trim()
  return (normalized || DEFAULT_ROOM_ID).slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function resolveWebSocketUrl() {
  const explicitUrl = new URLSearchParams(window.location.search).get('ws')
  if (explicitUrl) return normalizeWebSocketUrl(explicitUrl)

  const url = new URL('/api/landrush-lab/world-multiplayer/ws', window.location.href)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = '3003'
    url.protocol = 'ws:'
    return url.toString()
  }

  if (HOSTED_MULTIPLAYER_WEBSOCKET_URL) {
    return normalizeWebSocketUrl(HOSTED_MULTIPLAYER_WEBSOCKET_URL)
  }

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function normalizeWebSocketUrl(rawUrl: string) {
  const url = new URL(rawUrl, window.location.href)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  return url.toString()
}

function parseServerMessage(data: unknown): ServerMessage | null {
  try {
    const message = JSON.parse(String(data)) as ServerMessage
    if (
      message?.type === 'welcome' &&
      typeof message.connectionId === 'string' &&
      typeof message.heartbeatIntervalMs === 'number'
    ) {
      return message
    }
    if (
      message?.type === 'snapshot' &&
      Array.isArray(message.players) &&
      message.players.every(isPlayerSnapshot) &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number'
    ) {
      return message
    }
    if (
      (message?.type === 'player-joined' || message?.type === 'player-state') &&
      isPlayerSnapshot(message.player) &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number'
    ) {
      return message
    }
    if (
      message?.type === 'voice-signal' &&
      typeof message.from === 'string' &&
      typeof message.roomId === 'string' &&
      isSpatialVoiceSignalPayload(message.signal)
    ) {
      return message
    }
    if (
      message?.type === 'player-left' &&
      typeof message.id === 'string' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number'
    ) {
      return message
    }
    if (
      message?.type === 'parcel-ownership-snapshot' &&
      typeof message.roomId === 'string' &&
      typeof message.worldId === 'string' &&
      Array.isArray(message.ownerships) &&
      message.ownerships.every(isParcelOwnership)
    ) {
      return message
    }
    if (
      message?.type === 'parcel-build-nodes-snapshot' &&
      typeof message.roomId === 'string' &&
      typeof message.worldId === 'string' &&
      Array.isArray(message.builds) &&
      message.builds.every(isParcelBuildNodesSnapshot)
    ) {
      return message
    }
    if (
      message?.type === 'tv-media-state-snapshot' &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      typeof message.worldId === 'string' &&
      Array.isArray(message.tvs) &&
      message.tvs.every(isTvMediaStateSnapshot)
    ) {
      return message
    }
    if (
      (message?.type === 'parcel-build-nodes-synced' ||
        message?.type === 'parcel-build-nodes-updated') &&
      typeof message.roomId === 'string' &&
      isParcelBuildNodesSnapshot(message.build)
    ) {
      return message
    }
    if (
      (message?.type === 'tv-media-state-synced' || message?.type === 'tv-media-state-updated') &&
      typeof message.roomId === 'string' &&
      typeof message.serverTime === 'number' &&
      isTvMediaStateSnapshot(message.tv)
    ) {
      return message
    }
    if (
      (message?.type === 'parcel-owned' || message?.type === 'parcel-claim-result') &&
      typeof message.roomId === 'string' &&
      isParcelOwnership(message.ownership)
    ) {
      return message
    }
    if (
      message?.type === 'parcel-claim-rejected' &&
      typeof message.code === 'string' &&
      typeof message.message === 'string'
    ) {
      return message
    }
    if (
      message?.type === 'room-state' &&
      typeof message.roomId === 'string' &&
      typeof message.playerCount === 'number'
    ) {
      return message
    }
    if (message?.type === 'heartbeat' && typeof message.serverTime === 'number') return message
    if (
      message?.type === 'error' &&
      typeof message.code === 'string' &&
      typeof message.message === 'string'
    ) {
      return message
    }
  } catch {
    return null
  }
  return null
}

function isParcelOwnership(value: unknown): value is ParcelOwnership {
  const ownership = value as ParcelOwnership
  return (
    typeof ownership?.claimedAt === 'number' &&
    typeof ownership.parcelId === 'string' &&
    typeof ownership.worldId === 'string' &&
    typeof ownership.owner?.id === 'string' &&
    typeof ownership.owner.name === 'string' &&
    typeof ownership.owner.color === 'string'
  )
}

function isParcelBuildNodesSnapshot(value: unknown): value is ParcelBuildNodesSnapshot {
  const build = value as ParcelBuildNodesSnapshot
  return (
    typeof build?.parcelId === 'string' &&
    typeof build.updatedAt === 'number' &&
    typeof build.updatedBy === 'string' &&
    typeof build.worldId === 'string' &&
    Array.isArray(build.nodes) &&
    build.nodes.every(isSyncedBuildNode)
  )
}

function normalizeTvMediaStateSnapshot(
  value: TvMediaStateSnapshot,
  serverTime: number,
  receivedAt = Date.now(),
): TvMediaStateSnapshot {
  const tv = value as TvMediaStateSnapshot & Partial<TvMediaStateSnapshot>
  const playbackUpdatedAt = finiteNumber(tv.playbackUpdatedAt, serverTime)
  const playbackSeconds = Math.max(0, finiteNumber(tv.playbackSeconds, 0))
  const playing = typeof tv.playing === 'boolean' ? tv.playing : Boolean(tv.url)
  const elapsedSeconds =
    playing && playbackUpdatedAt > 0 ? Math.max(0, serverTime - playbackUpdatedAt) / 1000 : 0

  return {
    ...value,
    playbackSeconds: playbackSeconds + elapsedSeconds,
    playbackUpdatedAt: receivedAt,
    playing,
  }
}

function isTvMediaStateSnapshot(value: unknown): value is TvMediaStateSnapshot {
  const tv = value as TvMediaStateSnapshot
  const playbackSeconds = (tv as Partial<TvMediaStateSnapshot>).playbackSeconds
  const playbackUpdatedAt = (tv as Partial<TvMediaStateSnapshot>).playbackUpdatedAt
  const playing = (tv as Partial<TvMediaStateSnapshot>).playing
  return (
    typeof tv?.muted === 'boolean' &&
    typeof tv.parcelId === 'string' &&
    (playbackSeconds === undefined || typeof playbackSeconds === 'number') &&
    (playbackUpdatedAt === undefined || typeof playbackUpdatedAt === 'number') &&
    (playing === undefined || typeof playing === 'boolean') &&
    typeof tv.tvId === 'string' &&
    typeof tv.updatedAt === 'number' &&
    typeof tv.updatedBy === 'string' &&
    typeof tv.url === 'string' &&
    typeof tv.userVolume === 'number' &&
    typeof tv.worldId === 'string'
  )
}

function isSyncedBuildNode(value: unknown): value is AnyNode {
  const node = value as AnyNode
  return typeof node?.id === 'string' && typeof node.type === 'string'
}

function isPlayerSnapshot(value: unknown): value is MultiplayerPlayerSnapshot {
  const player = value as MultiplayerPlayerSnapshot
  return (
    typeof player?.id === 'string' &&
    typeof player.name === 'string' &&
    typeof player.color === 'string' &&
    Array.isArray(player.position) &&
    player.position.length === 3 &&
    typeof player.heading === 'number' &&
    typeof player.speed === 'number' &&
    typeof player.moving === 'boolean' &&
    (player.pose === undefined || player.pose === 'falling') &&
    typeof player.updatedAt === 'number'
  )
}
