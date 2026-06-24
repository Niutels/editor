'use client'

import {
  type LandrushWorldNode,
  LandrushWorldNode as LandrushWorldNodeSchema,
} from '@pascal-app/core'
import {
  LandrushRobot,
  type LandrushRobotAnimationState,
} from '@pascal-app/nodes/landrush-world/robot'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Copy, RadioTower, RefreshCw, Users, Wifi, WifiOff } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Camera, type Group, MathUtils, type Mesh, ShapeUtils, Vector2, Vector3 } from 'three'
import type { LandrushPoint2 } from '@/components/landrush/types'
import type { StylizedGrassInteraction, StylizedGrassPerfProbe } from './stylized-scene-land-layers'
import type { WaterLandSurface } from './water-scene'
import { WorldLabClient } from './world-lab-client'

declare global {
  interface Window {
    __LANDRUSH_WORLD_MULTIPLAYER_LAB__?: unknown
  }
}

type LocalPlayerProfile = {
  color: string
  id: string
  name: string
}

type MultiplayerPlayerSnapshot = LocalPlayerProfile & {
  heading: number
  moving: boolean
  position: [number, number, number]
  speed: number
  updatedAt: number
}

type ConnectionStatus = 'connected' | 'connecting' | 'offline' | 'reconnecting'
type CopyInviteStatus = 'copied' | 'failed' | 'idle'

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
  | { id: string; reason?: string; roomId: string; serverTime: number; type: 'player-left' }
  | { playerCount: number; roomId: string; serverTime: number; type: 'room-state' }
  | {
      playerCount?: number
      roomId?: string
      sentAt?: number
      serverTime: number
      type: 'heartbeat'
    }
  | { code: string; message: string; serverTime: number; type: 'error' }

type MultiplayerConnectionDetails = {
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

const DEFAULT_ROOM_ID = 'landrush-lab-world-multiplayer'
const PLAYER_STORAGE_KEY = 'landrush-lab-world-multiplayer-player'
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
const ROBOT_WALK_SPEED = 2.75
const ROBOT_RUN_MULTIPLIER = 2.48
const ROBOT_ACCELERATION = 18
const ROBOT_DECELERATION = 24
const ROBOT_TURN_RESPONSE = 12
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
const ROBOT_CAMERA_WHEEL_ZOOM_SPEED = 0.001
const ROBOT_GRASS_INTERACTION_RADIUS = 2.7
const REMOTE_POSITION_RESPONSE = 12
const REMOTE_HEADING_RESPONSE = 14

const PLAYER_COLORS = ['#7dd3fc', '#facc15', '#86efac', '#f0abfc', '#fb7185', '#c4b5fd'] as const
const DEFAULT_MULTIPLAYER_WEBSOCKET_URL =
  'wss://landrush-world-multiplayer.onrender.com/api/landrush-lab/world-multiplayer/ws'
const HOSTED_MULTIPLAYER_WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_LANDRUSH_WORLD_MULTIPLAYER_WS_URL ?? DEFAULT_MULTIPLAYER_WEBSOCKET_URL

const FALLBACK_LOCAL_PROFILE = {
  color: PLAYER_COLORS[0],
  id: 'local-pending',
  name: 'Player',
} satisfies LocalPlayerProfile

function createEmptyRobotAnimationState(): LandrushRobotAnimationState {
  return {
    clipCount: 0,
    idleClip: null,
    idleClipTime: 0,
    idleTimeScale: 0,
    idleWeight: 0,
    mixerTimeScale: 1,
    runClip: null,
    runClipTime: 0,
    runTimeScale: 0,
    runWeight: 0,
    walkClip: null,
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

function createRoomInviteUrl(roomId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('room', sanitizeRoomId(roomId))
  url.searchParams.delete('offline')
  return url.toString()
}

export function WorldMultiplayerLabClient() {
  const searchParams = useSearchParams()
  const grassInteractionRef = useRef<StylizedGrassInteraction | null>(null)
  const [localProfile, setLocalProfile] = useState<LocalPlayerProfile>(FALLBACK_LOCAL_PROFILE)
  const [copyInviteStatus, setCopyInviteStatus] = useState<CopyInviteStatus>('idle')
  const clean = searchParams.get('v') === 'clean' || searchParams.get('clean') === '1'
  const roomId = sanitizeRoomId(searchParams.get('room') ?? DEFAULT_ROOM_ID)
  const offline = searchParams.get('offline') === '1'
  const perfRun = useMemo(() => createMultiplayerPerfRunOptions(searchParams), [searchParams])
  const multiplayer = useLandrushWorldMultiplayer({
    enabled: !offline,
    localProfile,
    roomId,
  })
  useMultiplayerPerfRunProbe(perfRun)
  const renderSceneOverlay = useCallback(
    ({ surface }: { surface: WaterLandSurface }) => (
      <LandrushWorldMultiplayerScene
        grassInteractionRef={grassInteractionRef}
        localProfile={localProfile}
        onLocalPlayerChange={multiplayer.publishLocalPlayer}
        perfRun={perfRun}
        remotePlayers={multiplayer.remotePlayers}
        surface={surface}
      />
    ),
    [localProfile, multiplayer.publishLocalPlayer, multiplayer.remotePlayers, perfRun],
  )

  const copyInviteLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(createRoomInviteUrl(roomId))
      setCopyInviteStatus('copied')
    } catch {
      setCopyInviteStatus('failed')
    }
    window.setTimeout(() => setCopyInviteStatus('idle'), 1400)
  }, [roomId])

  const goOnline = useCallback(() => {
    window.location.assign(createRoomInviteUrl(roomId))
  }, [roomId])

  useEffect(() => {
    setLocalProfile(readLocalPlayerProfile())
  }, [])

  useEffect(
    () =>
      setMultiplayerDebugHandle('connection', () => ({
        ...multiplayer.connection,
        offline,
        remotePlayers: multiplayer.remotePlayers.length,
        roomId,
        status: offline ? 'offline' : multiplayer.status,
      })),
    [multiplayer.connection, multiplayer.remotePlayers.length, multiplayer.status, offline, roomId],
  )

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <WorldLabClient
        grassInteractionRef={grassInteractionRef}
        labTitle="Landrush lab world multiplayer"
        renderSceneOverlay={renderSceneOverlay}
        showDirtCopyParcels
        variant="dirt-copy"
      />
      {!clean ? (
        <MultiplayerStatusPanel
          connection={multiplayer.connection}
          copyInviteStatus={copyInviteStatus}
          isOfflineMode={offline}
          localProfile={localProfile}
          onCopyInvite={copyInviteLink}
          onGoOnline={goOnline}
          remotePlayerCount={multiplayer.remotePlayers.length}
          roomId={roomId}
          status={offline ? 'offline' : multiplayer.status}
        />
      ) : null}
      <ThirdPersonAimReticle />
    </div>
  )
}

function ThirdPersonAimReticle() {
  return (
    <div
      aria-hidden
      className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 z-30 size-5"
    >
      <span className="-translate-x-1/2 absolute top-1/2 left-1/2 h-px w-5 bg-white/80 shadow-[0_0_8px_rgba(0,0,0,0.55)]" />
      <span className="-translate-y-1/2 absolute top-1/2 left-1/2 h-5 w-px bg-white/80 shadow-[0_0_8px_rgba(0,0,0,0.55)]" />
      <span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 size-1.5 rounded-full border border-black/45 bg-white/70" />
    </div>
  )
}

function LandrushWorldMultiplayerScene({
  grassInteractionRef,
  localProfile,
  onLocalPlayerChange,
  perfRun,
  remotePlayers,
  surface,
}: {
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  localProfile: LocalPlayerProfile
  onLocalPlayerChange: (player: MultiplayerPlayerSnapshot) => void
  perfRun: MultiplayerPerfRunOptions
  remotePlayers: readonly MultiplayerPlayerSnapshot[]
  surface: WaterLandSurface
}) {
  const spawn = useMemo(() => centroidForPolygon(surface.grassSurfacePoints), [surface])
  const groundY = surface.grassSurfaceElevation + ROBOT_GROUND_CLEARANCE

  return (
    <group>
      <LocalMultiplayerRobot
        grassInteractionRef={grassInteractionRef}
        groundY={groundY}
        localProfile={localProfile}
        onLocalPlayerChange={onLocalPlayerChange}
        perfRun={perfRun}
        spawn={spawn}
        surfacePoints={surface.grassSurfacePoints}
      />
      {remotePlayers.map((player) => (
        <RemoteMultiplayerRobot groundY={groundY} key={player.id} player={player} />
      ))}
    </group>
  )
}

function LocalMultiplayerRobot({
  grassInteractionRef,
  groundY,
  localProfile,
  onLocalPlayerChange,
  perfRun,
  spawn,
  surfacePoints,
}: {
  grassInteractionRef: { current: StylizedGrassInteraction | null }
  groundY: number
  localProfile: LocalPlayerProfile
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
    const movement = resolveCameraRelativeMovement(pressedKeysRef.current, state.camera)
    const cameraHeading = resolveCameraForwardHeading(state.camera)
    const targetSpeed =
      ROBOT_WALK_SPEED * (isRunPressed(pressedKeysRef.current) ? ROBOT_RUN_MULTIPLIER : 1)
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
      cameraHeading,
      clamp01(frameDelta * ROBOT_TURN_RESPONSE),
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
      <RobotThirdPersonCameraRig motionRef={motionRef} />
      <Suspense
        fallback={<RobotNodePrimitiveActor color={localProfile.color} node={nodeRef.current} />}
      >
        <LocalMultiplayerRegisteredActor
          node={nodeRef.current}
          onAnimationState={handleAnimationState}
          onLoaded={handleModelLoaded}
        />
      </Suspense>
      <RobotPlayerBeacon color={localProfile.color} node={nodeRef.current} />
    </>
  )
}

function RemoteMultiplayerRobot({
  groundY,
  player,
}: {
  groundY: number
  player: MultiplayerPlayerSnapshot
}) {
  const nodeRef = useRef<LandrushWorldNode>(
    createRobotNode(player.id, snapshotPoint(player), groundY),
  )
  const positionRef = useRef(new Vector3(...player.position))
  const targetPositionRef = useRef(new Vector3(...player.position))
  const headingRef = useRef(player.heading)
  const targetHeadingRef = useRef(player.heading)

  useEffect(() => {
    targetPositionRef.current.set(player.position[0], player.position[1], player.position[2])
    targetHeadingRef.current = player.heading
  }, [player])

  useFrame((_, delta) => {
    const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
    const positionAmount = 1 - Math.exp(-REMOTE_POSITION_RESPONSE * frameDelta)
    const headingAmount = 1 - Math.exp(-REMOTE_HEADING_RESPONSE * frameDelta)

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

function RobotThirdPersonCameraRig({ motionRef }: { motionRef: { current: RobotMotion } }) {
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
      <RobotThirdPersonCameraController motionRef={motionRef} />
    </>
  )
}

function RobotThirdPersonCameraController({ motionRef }: { motionRef: { current: RobotMotion } }) {
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
      cameraDistanceRef.current = MathUtils.clamp(
        cameraDistanceRef.current * Math.exp(event.deltaY * ROBOT_CAMERA_WHEEL_ZOOM_SPEED),
        ROBOT_CAMERA_MIN_DISTANCE,
        ROBOT_CAMERA_MAX_DISTANCE,
      )
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('wheel', handleWheel)
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

function MultiplayerStatusPanel({
  connection,
  copyInviteStatus,
  isOfflineMode,
  localProfile,
  onCopyInvite,
  onGoOnline,
  remotePlayerCount,
  roomId,
  status,
}: {
  connection: MultiplayerConnectionDetails
  copyInviteStatus: CopyInviteStatus
  isOfflineMode: boolean
  localProfile: LocalPlayerProfile
  onCopyInvite: () => void
  onGoOnline: () => void
  remotePlayerCount: number
  roomId: string
  status: ConnectionStatus
}) {
  const statusTone =
    status === 'connected'
      ? 'text-emerald-200'
      : status === 'offline'
        ? 'text-amber-200'
        : 'text-sky-200'
  const StatusIcon = status === 'offline' ? WifiOff : status === 'connected' ? Wifi : RefreshCw
  const displayedPlayerCount = connection.serverPlayerCount ?? remotePlayerCount + 1

  return (
    <section className="pointer-events-auto absolute left-5 top-5 z-40 w-[min(310px,calc(100vw-2.5rem))] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-wide">
          <RadioTower aria-hidden className="size-4 shrink-0 text-sky-200" />
          <span className="min-w-0 truncate">Landrush lab world multiplayer</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isOfflineMode ? (
            <button
              className="grid size-7 place-items-center rounded border border-emerald-200/45 bg-emerald-300/12 text-emerald-100 transition hover:bg-emerald-300/22"
              onClick={onGoOnline}
              title="Go online"
              type="button"
            >
              <Wifi aria-hidden className="size-3.5" />
            </button>
          ) : null}
          <button
            className="grid size-7 place-items-center rounded border border-white/20 bg-white/8 text-white/82 transition hover:bg-white/14"
            onClick={onCopyInvite}
            title="Copy room link"
            type="button"
          >
            <Copy aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-white/58">status</dt>
        <dd className={`flex items-center gap-1.5 capitalize ${statusTone}`}>
          <StatusIcon aria-hidden className="size-3.5" />
          {status}
        </dd>
        <dt className="text-white/58">room</dt>
        <dd className="min-w-0 truncate" title={roomId}>
          {roomId}
        </dd>
        <dt className="text-white/58">you</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: localProfile.color }}
          />
          <span className="min-w-0 truncate">{localProfile.name}</span>
        </dd>
        <dt className="text-white/58">players</dt>
        <dd className="flex items-center gap-1.5">
          <Users aria-hidden className="size-3.5 text-white/64" />
          {displayedPlayerCount}
        </dd>
        <dt className="text-white/58">latency</dt>
        <dd>{connection.latencyMs === null ? '-' : `${connection.latencyMs} ms`}</dd>
        <dt className="text-white/58">invite</dt>
        <dd className="capitalize text-white/74">{copyInviteStatus}</dd>
      </dl>
      {connection.lastError ? (
        <p className="mt-2 truncate text-[11px] text-rose-200" title={connection.lastError}>
          {connection.lastError}
        </p>
      ) : null}
    </section>
  )
}

function useLandrushWorldMultiplayer({
  enabled,
  localProfile,
  roomId,
}: {
  enabled: boolean
  localProfile: LocalPlayerProfile
  roomId: string
}) {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectAttemptRef = useRef(0)
  const latestPlayerRef = useRef<MultiplayerPlayerSnapshot | null>(null)
  const heartbeatIntervalMsRef = useRef(createConnectionDetails().heartbeatIntervalMs)
  const lastNetworkSentAtRef = useRef(0)
  const lastSentPlayerRef = useRef<MultiplayerPlayerSnapshot | null>(null)
  const [connection, setConnection] =
    useState<MultiplayerConnectionDetails>(createConnectionDetails)
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? 'connecting' : 'offline')
  const [remotePlayerMap, setRemotePlayerMap] = useState<Map<string, MultiplayerPlayerSnapshot>>(
    () => new Map(),
  )
  const remotePlayers = useMemo(
    () =>
      [...remotePlayerMap.values()].sort((first, second) => first.name.localeCompare(second.name)),
    [remotePlayerMap],
  )

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
      if (!enabled) return

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
    [enabled, sendMessage],
  )

  const publishLocalPlayer = useCallback(
    (player: MultiplayerPlayerSnapshot) => {
      sendPlayerState(player)
    },
    [sendPlayerState],
  )

  useEffect(() => {
    if (!enabled || localProfile.id === FALLBACK_LOCAL_PROFILE.id) {
      setStatus(enabled ? 'connecting' : 'offline')
      setRemotePlayerMap(new Map())
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
        setStatus('connected')
        const player = latestPlayerRef.current ?? createStationaryPlayer(localProfile)
        if (sendMessage({ player, roomId, type: 'join' }, socket)) {
          lastNetworkSentAtRef.current = window.performance.now()
          lastSentPlayerRef.current = player
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
          setConnection((current) => ({
            ...current,
            lastError: null,
            latencyMs:
              typeof message.sentAt === 'number'
                ? Math.max(0, receivedAt - message.sentAt)
                : current.latencyMs,
            serverPlayerCount: message.playerCount ?? current.serverPlayerCount,
          }))
          return
        }

        if (message.roomId !== roomId) return

        if (message.type === 'room-state') {
          setConnection((current) => ({
            ...current,
            serverPlayerCount: message.playerCount,
          }))
          return
        }

        if (message.type === 'snapshot') {
          setRemotePlayerMap(
            new Map(
              message.players
                .filter((player) => player.id !== localProfile.id)
                .map((player) => [player.id, player]),
            ),
          )
          setConnection((current) => ({
            ...current,
            serverPlayerCount: message.players.length + 1,
          }))
          return
        }

        if (message.type === 'player-joined' || message.type === 'player-state') {
          if (message.player.id === localProfile.id) return
          setRemotePlayerMap((current) => {
            const next = new Map(current)
            next.set(message.player.id, message.player)
            return next
          })
          return
        }

        if (message.type === 'player-left') {
          setRemotePlayerMap((current) => {
            const next = new Map(current)
            next.delete(message.id)
            return next
          })
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
  }, [enabled, localProfile, roomId, sendMessage])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - REMOTE_PLAYER_STALE_MS
      setRemotePlayerMap((current) => {
        const next = new Map(
          [...current.entries()].filter(([, player]) => player.updatedAt >= cutoff),
        )
        return next.size === current.size ? current : next
      })
    }, 3000)
    return () => window.clearInterval(interval)
  }, [])

  return { connection, publishLocalPlayer, remotePlayers, status }
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

function resolveCameraRelativeMovement(keys: ReadonlySet<string>, camera: Camera) {
  const strafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const forwardInput =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'))

  if (strafe === 0 && forwardInput === 0) return null

  const forward = resolveCameraForwardXZ(camera)
  const right = { x: -forward.z, z: forward.x }
  return normalize2(
    right.x * strafe + forward.x * forwardInput,
    right.z * strafe + forward.z * forwardInput,
  )
}

function resolveCameraForwardHeading(camera: Camera) {
  const forward = resolveCameraForwardXZ(camera)
  return Math.atan2(forward.x, forward.z)
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

function readLocalPlayerProfile(): LocalPlayerProfile {
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

function sanitizeRoomId(roomId: string) {
  const normalized = roomId.trim()
  return (normalized || DEFAULT_ROOM_ID).slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function resolveWebSocketUrl() {
  const explicitUrl = new URLSearchParams(window.location.search).get('ws')
  if (explicitUrl) return normalizeWebSocketUrl(explicitUrl)
  if (HOSTED_MULTIPLAYER_WEBSOCKET_URL) {
    return normalizeWebSocketUrl(HOSTED_MULTIPLAYER_WEBSOCKET_URL)
  }

  const url = new URL('/api/landrush-lab/world-multiplayer/ws', window.location.href)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = '3003'
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
      typeof message.roomId === 'string'
    ) {
      return message
    }
    if (
      (message?.type === 'player-joined' || message?.type === 'player-state') &&
      isPlayerSnapshot(message.player) &&
      typeof message.roomId === 'string'
    ) {
      return message
    }
    if (
      message?.type === 'player-left' &&
      typeof message.id === 'string' &&
      typeof message.roomId === 'string'
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
    typeof player.updatedAt === 'number'
  )
}
