'use client'

import {
  type LandrushWorldNode,
  LandrushWorldNode as LandrushWorldNodeSchema,
} from '@landrush/pascal-plugin'
import {
  LandrushRobot,
  type LandrushRobotAnimationState,
} from '@landrush/pascal-plugin/landrush-world/robot'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useSearchParams } from 'next/navigation'
import { Profiler, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Camera, DoubleSide, type Group, MathUtils, Shape, Vector3 } from 'three'
import type { LandrushIsland, LandrushPoint2 } from '@/components/landrush/types'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, GRASS_SPAWN_FIELD_RESOLUTION } from './grass-field-texture'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GrassWaterLandLayers } from './grass-water-layers'
import {
  createRobotWorldDebugStore,
  createRobotWorldProfiler,
  type RobotWorldProfileMeasure,
  type RobotWorldProfileSnapshot,
} from './robot-world-profiler'
import { WATER_FIELD_PREVIEW_RESOLUTION, WATER_FIELD_RESOLUTION } from './water-field-texture'
import {
  generateWaterLabIsland,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import {
  LANDRUSH_WATER_EFFECT_PARAMETERS,
  type LandrushWaterEffectParameters,
  WATER_PLANE_SIZE,
} from './water-material'
import { type WaterLandSurface, WaterScene } from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_ROBOT_WORLD_LAB__?: unknown
  }
}

type RobotWorldDebugState = {
  animationClipCount: number
  animationIdleClip: string | null
  animationIdleClipTime: number
  animationIdleTimeScale: number
  animationIdleWeight: number
  animationMixerTimeScale: number
  animationPace: number
  animationRunClip: string | null
  animationRunClipTime: number
  animationRunTimeScale: number
  animationRunWeight: number
  animationWalkClip: string | null
  animationWalkClipTime: number
  animationWalkTimeScale: number
  animationWalkWeight: number
  detailMode: 'debug' | 'full'
  frameDeltaMs: number
  frameRate: number
  heading: number
  insideTopSurface: boolean
  modelLoaded: boolean
  moving: boolean
  speed: number
  spawn: { x: number; y: number; z: number }
  x: number
  y: number
  z: number
}

type RobotMotion = {
  cameraSnapVersion: number
  frameDeltaMs: number
  frameRate: number
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

type RobotWorldDebugStore = ReturnType<typeof createRobotWorldDebugStore<RobotWorldDebugState>>
type RobotWorldProfiler = ReturnType<typeof createRobotWorldProfiler>
type ReactProfileHandler = (id: string, phase: string, actualDuration: number) => void

const ROBOT_WORLD_GRASS_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  brightness: 0.68,
  density: 0.58,
  foliageOpacity: 0.24,
  height: 0.66,
  opacity: 0.24,
  patchSize: 8,
  patchSoftness: 0.03,
  rootShadow: 1,
  width: 0.09,
  wind: 0.76,
} satisfies GrassBladeTuning

const ROBOT_WORLD_WALK_SPEED = 4.4
const ROBOT_WORLD_RUN_MULTIPLIER = 1.55
const ROBOT_WORLD_ACCELERATION = 18
const ROBOT_WORLD_DECELERATION = 24
const ROBOT_WORLD_TURN_RESPONSE = 12
const ROBOT_GROUND_CLEARANCE = 0.04
const ROBOT_CAMERA_TARGET_HEIGHT = 1.28
const ROBOT_CAMERA_INITIAL_DISTANCE = 8.2
const ROBOT_CAMERA_INITIAL_HEIGHT = 4.5
const ROBOT_CAMERA_FOLLOW_RESPONSE = 16
const ROBOT_CAMERA_MIN_DISTANCE = 3.2
const ROBOT_CAMERA_MAX_DISTANCE = 15
const ROBOT_CAMERA_MIN_POLAR_ANGLE = MathUtils.degToRad(24)
const ROBOT_CAMERA_MAX_POLAR_ANGLE = MathUtils.degToRad(76)
const ROBOT_WORLD_DEBUG_FIELD_RESOLUTION = 16
const ROBOT_WORLD_DEBUG_FINAL_FIELD_RESOLUTION = 64
const ROBOT_WORLD_DEBUG_FINAL_SPAWN_RESOLUTION = 64
const ROBOT_WORLD_PROGRESSIVE_GRASS_FIELD_RESOLUTION = 32
const ROBOT_WORLD_PROGRESSIVE_WATER_FIELD_RESOLUTION = Math.min(WATER_FIELD_PREVIEW_RESOLUTION, 96)
const ROBOT_WORLD_SIMPLE_WATER_ELEVATION = -0.08
const ROBOT_WORLD_SIMPLE_SAND_ELEVATION = -0.04
const ROBOT_WORLD_SIMPLE_GRASS_ELEVATION = 0.02
const ROBOT_WORLD_ANIMATION_PACE_DEFAULT = 1
const ROBOT_WORLD_ANIMATION_PACE_MIN = 0.2
const ROBOT_WORLD_ANIMATION_PACE_MAX = 1.6
const ROBOT_WORLD_ANIMATION_PACE_STEP = 0.05

export function RobotWorldLabClient() {
  const profiler = useMemo(() => createRobotWorldProfiler(), [])
  const debugStore = useMemo(() => createRobotWorldDebugStore<RobotWorldDebugState>(), [])
  const searchParams = useSearchParams()
  const [animationPace, setAnimationPace] = useState(() =>
    parseRobotWorldAnimationPace(searchParams.get('animationPace') ?? searchParams.get('pace')),
  )
  const preset = getWaterViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const frameProfile = searchParams.get('frameProfile') === '1'
  const fullDetail = searchParams.get('detail') === 'full'
  const standIn = searchParams.get('standin') === '1'
  const useSimpleScene = searchParams.get('simple') === '1' || searchParams.get('water') === 'webgl'
  const landDetail = !useSimpleScene || fullDetail
  const requestedWaterDebugLayer =
    searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const debugWaterLayer = requestedWaterDebugLayer
  const handleAnimationPaceChange = useCallback((value: number) => {
    setAnimationPace(clampRobotWorldAnimationPace(value))
  }, [])
  const handleReactProfile = useCallback(
    (id: string, phase: string, actualDuration: number) => {
      profiler.record(`react.${id}.${phase}`, actualDuration)
    },
    [profiler],
  )
  const island = useMemo(
    () =>
      profiler.measure('setup.robot-world.generate-island', () =>
        generateWaterLabIsland(
          WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
          profiler.measure,
          'setup.robot-world.generate-island.generator',
        ),
      ),
    [profiler],
  )
  const bladeSubdivisions = useMemo(
    () =>
      profiler.measure('setup.robot-world.resolve-blade-subdivisions', () =>
        resolveGrassWebGpuBladeSubdivisions(ROBOT_WORLD_GRASS_TUNING.density),
      ),
    [profiler],
  )
  const simpleSurface = useMemo(
    () =>
      profiler.measure('setup.robot-world.simple-surface', () =>
        createRobotWorldSimpleSurface(island),
      ),
    [island, profiler],
  )
  const renderLandOverlay = useCallback(
    (surface: WaterLandSurface) => (
      <RobotWorldLandOverlay
        animationPace={animationPace}
        bladeSubdivisions={bladeSubdivisions}
        fullDetail={landDetail}
        onDebugState={debugStore.set}
        profileMeasure={profiler.measure}
        progressiveGrass={!useSimpleScene}
        standIn={standIn}
        surface={surface}
      />
    ),
    [animationPace, bladeSubdivisions, debugStore, landDetail, profiler, standIn, useSimpleScene],
  )

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_ROBOT_WORLD_LAB__ = {
      island: {
        bounds: island.perimeter.bounds,
        seed: island.seed,
      },
      robot: () => debugStore.get(),
      profile: () => profiler.snapshot(),
      summary: 'Robot world lab: water scene, grass layers, and a movable robot on the top land.',
    }
    return () => {
      delete window.__LANDRUSH_ROBOT_WORLD_LAB__
    }
  }, [debug, debugStore, island, profiler])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      {clean ? <style>{'nextjs-portal{display:none!important}'}</style> : null}
      {!useSimpleScene ? (
        <Profiler id="robot-world.webgpu-water-scene" onRender={handleReactProfile}>
          <WaterScene
            debugLayer={debugWaterLayer}
            elevationParameters={WATER_LAB_DEFAULT_ELEVATION_PARAMETERS}
            fieldParameters={WATER_LAB_DEFAULT_FIELD_PARAMETERS}
            frameProfile={frameProfile}
            island={island}
            materialParameters={LANDRUSH_WATER_EFFECT_PARAMETERS as LandrushWaterEffectParameters}
            preset={preset}
            previewTerrainFieldResolution={ROBOT_WORLD_PROGRESSIVE_WATER_FIELD_RESOLUTION}
            progressiveField
            renderLandOverlay={renderLandOverlay}
            showDepthReference={false}
            terrainFieldResolution={WATER_FIELD_RESOLUTION}
            waterFieldIsland={island}
          />
        </Profiler>
      ) : (
        <Profiler id="robot-world.simple-scene" onRender={handleReactProfile}>
          <RobotWorldSimpleScene
            bladeSubdivisions={bladeSubdivisions}
            animationPace={animationPace}
            fullDetail={landDetail}
            onDebugState={debugStore.set}
            profileMeasure={profiler.measure}
            standIn={standIn}
            surface={simpleSurface}
          />
        </Profiler>
      )}
      {!clean ? (
        <Profiler id="robot-world.debug-overlay" onRender={handleReactProfile}>
          <RobotWorldDebugOverlay
            animationPace={animationPace}
            debugStore={debugStore}
            onAnimationPaceChange={handleAnimationPaceChange}
            profiler={profiler}
          />
        </Profiler>
      ) : null}
    </main>
  )
}

function RobotWorldSimpleScene({
  animationPace,
  bladeSubdivisions,
  fullDetail,
  onDebugState,
  profileMeasure,
  standIn,
  surface,
}: {
  animationPace: number
  bladeSubdivisions: number
  fullDetail: boolean
  onDebugState: (state: RobotWorldDebugState) => void
  profileMeasure: RobotWorldProfileMeasure
  standIn: boolean
  surface: WaterLandSurface
}) {
  return (
    <Canvas className="h-full w-full" dpr={[1, 1.5]} frameloop="always" shadows={false}>
      <color args={['#164a77']} attach="background" />
      <ambientLight intensity={1.22} />
      <directionalLight intensity={1.95} position={[36, 58, 28]} />
      <RobotWorldRendererProfiler profileMeasure={profileMeasure} />
      <RobotWorldSimpleWater />
      <RobotWorldSimpleIsland profileMeasure={profileMeasure} surface={surface} />
      <RobotWorldLandOverlay
        animationPace={animationPace}
        bladeSubdivisions={bladeSubdivisions}
        fullDetail={fullDetail}
        onDebugState={onDebugState}
        profileMeasure={profileMeasure}
        progressiveGrass={false}
        standIn={standIn}
        surface={surface}
      />
    </Canvas>
  )
}

function RobotWorldRendererProfiler({
  profileMeasure,
}: {
  profileMeasure: RobotWorldProfileMeasure
}) {
  const { gl } = useThree()

  useEffect(() => {
    const context = gl.getContext() as unknown as Record<string, unknown>
    const originalRender = gl.render.bind(gl)
    let renderCount = 0
    const restoreContextMethods: Array<() => void> = []
    const patchContextMethod = (name: string, id: string) => {
      const original = context[name]
      if (typeof original !== 'function') return
      context[name] = (...args: unknown[]) => {
        const scopedId = getWebGlContextCallProfileId(name, id, args)
        return profileMeasure(scopedId, () => original.apply(context, args))
      }
      restoreContextMethods.push(() => {
        context[name] = original
      })
    }

    patchContextMethod('drawArrays', 'frame.renderer.draw-arrays')
    patchContextMethod('drawElements', 'frame.renderer.draw-elements')
    patchContextMethod('drawArraysInstanced', 'frame.renderer.draw-arrays-instanced')
    patchContextMethod('drawElementsInstanced', 'frame.renderer.draw-elements-instanced')
    patchContextMethod('bufferData', 'frame.renderer.buffer-data')
    patchContextMethod('bufferSubData', 'frame.renderer.buffer-sub-data')
    patchContextMethod('compileShader', 'frame.renderer.compile-shader')
    patchContextMethod('linkProgram', 'frame.renderer.link-program')
    patchContextMethod('getProgramParameter', 'frame.renderer.get-program-parameter')
    patchContextMethod('getShaderParameter', 'frame.renderer.get-shader-parameter')
    patchContextMethod('texImage2D', 'frame.renderer.tex-image-2d')
    patchContextMethod('texSubImage2D', 'frame.renderer.tex-sub-image-2d')
    patchContextMethod('generateMipmap', 'frame.renderer.generate-mipmap')
    patchContextMethod('useProgram', 'frame.renderer.use-program')
    patchContextMethod('bindVertexArray', 'frame.renderer.bind-vertex-array')
    patchContextMethod('clear', 'frame.renderer.clear')

    gl.render = ((scene, camera) => {
      renderCount += 1
      const renderPhase =
        renderCount <= 8
          ? 'frame.renderer.webgl-render.initial'
          : 'frame.renderer.webgl-render.steady'
      return profileMeasure('frame.renderer.webgl-render', () =>
        profileMeasure(renderPhase, () => originalRender(scene, camera)),
      )
    }) as typeof gl.render

    return () => {
      gl.render = originalRender
      for (const restore of restoreContextMethods) restore()
    }
  }, [gl, profileMeasure])

  return null
}

function getWebGlContextCallProfileId(name: string, fallbackId: string, args: readonly unknown[]) {
  if (name !== 'texImage2D' && name !== 'texSubImage2D') return fallbackId
  const size = describeWebGlTextureUpload(name, args)
  return size ? `${fallbackId}.${size}` : fallbackId
}

function describeWebGlTextureUpload(name: string, args: readonly unknown[]) {
  const widthIndex = name === 'texImage2D' ? 3 : 4
  const heightIndex = name === 'texImage2D' ? 4 : 5
  const explicitWidth =
    args.length >= 9 && typeof args[widthIndex] === 'number' ? args[widthIndex] : null
  const explicitHeight =
    args.length >= 9 && typeof args[heightIndex] === 'number' ? args[heightIndex] : null
  if (explicitWidth && explicitHeight) return `${explicitWidth}x${explicitHeight}`

  const source = args.at(-1)
  if (!source || typeof source !== 'object') return null
  const textureSource = source as {
    height?: number
    naturalHeight?: number
    naturalWidth?: number
    videoHeight?: number
    videoWidth?: number
    width?: number
  }
  const width = textureSource.width ?? textureSource.naturalWidth ?? textureSource.videoWidth
  const height = textureSource.height ?? textureSource.naturalHeight ?? textureSource.videoHeight
  return width && height ? `${width}x${height}` : null
}

function RobotWorldLandOverlay({
  animationPace,
  bladeSubdivisions,
  fullDetail,
  onDebugState,
  profileMeasure,
  progressiveGrass,
  standIn,
  surface,
}: {
  animationPace: number
  bladeSubdivisions: number
  fullDetail: boolean
  onDebugState: (state: RobotWorldDebugState) => void
  profileMeasure: RobotWorldProfileMeasure
  progressiveGrass: boolean
  standIn: boolean
  surface: WaterLandSurface
}) {
  const grassPreviewResolution = progressiveGrass
    ? ROBOT_WORLD_PROGRESSIVE_GRASS_FIELD_RESOLUTION
    : fullDetail
      ? GRASS_FIELD_RESOLUTION
      : ROBOT_WORLD_DEBUG_FIELD_RESOLUTION
  const grassFinalFieldResolution = fullDetail
    ? GRASS_FIELD_RESOLUTION
    : ROBOT_WORLD_DEBUG_FINAL_FIELD_RESOLUTION
  const grassFinalSpawnResolution = fullDetail
    ? GRASS_SPAWN_FIELD_RESOLUTION
    : ROBOT_WORLD_DEBUG_FINAL_SPAWN_RESOLUTION

  return (
    <group>
      <RobotIslandWalker
        animationPace={animationPace}
        detailMode={fullDetail ? 'full' : 'debug'}
        onDebugState={onDebugState}
        profileMeasure={profileMeasure}
        standIn={standIn}
        surface={surface}
      />
      <GrassWaterLandLayers
        bladeSubdivisions={bladeSubdivisions}
        fieldResolution={grassPreviewResolution}
        finalFieldResolution={grassFinalFieldResolution}
        finalSpawnResolution={grassFinalSpawnResolution}
        profileMeasure={profileMeasure}
        showBlades={fullDetail}
        showTrees={fullDetail}
        spawnResolution={grassPreviewResolution}
        surface={surface}
        tuning={ROBOT_WORLD_GRASS_TUNING}
      />
    </group>
  )
}

function RobotWorldSimpleWater() {
  return (
    <mesh
      position={[0, ROBOT_WORLD_SIMPLE_WATER_ELEVATION, 0]}
      renderOrder={1}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[WATER_PLANE_SIZE, WATER_PLANE_SIZE, 1, 1]} />
      <meshBasicMaterial color="#0d85ac" opacity={0.92} side={DoubleSide} transparent />
    </mesh>
  )
}

function RobotWorldSimpleIsland({
  profileMeasure,
  surface,
}: {
  profileMeasure: RobotWorldProfileMeasure
  surface: WaterLandSurface
}) {
  const shorelineShape = useMemo(
    () =>
      profileMeasure('setup.robot-world.simple-shoreline-shape', () =>
        shapeFromPoints(surface.shorelinePoints),
      ),
    [profileMeasure, surface],
  )
  const grassShape = useMemo(
    () =>
      profileMeasure('setup.robot-world.simple-grass-shape', () =>
        shapeFromPoints(surface.grassSurfacePoints),
      ),
    [profileMeasure, surface],
  )

  return (
    <>
      <mesh
        position={[0, ROBOT_WORLD_SIMPLE_SAND_ELEVATION, 0]}
        renderOrder={2}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <shapeGeometry args={[shorelineShape]} />
        <meshStandardMaterial color="#d8cb90" roughness={0.96} side={DoubleSide} />
      </mesh>
      <mesh
        position={[0, surface.grassSurfaceElevation - 0.01, 0]}
        renderOrder={3}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <shapeGeometry args={[grassShape]} />
        <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
      </mesh>
    </>
  )
}

function createRobotWorldSimpleSurface(island: LandrushIsland): WaterLandSurface {
  const shorelinePoints = island.perimeter.points
  return {
    grassSurfaceElevation: ROBOT_WORLD_SIMPLE_GRASS_ELEVATION,
    grassSurfacePoints: shorelinePoints,
    hasElevation: false,
    plateauElevation: ROBOT_WORLD_SIMPLE_GRASS_ELEVATION,
    plateauPoints: shorelinePoints,
    shorelinePoints,
    slopeStartPoints: shorelinePoints,
    waterPlaneSize: WATER_PLANE_SIZE,
  }
}

function RobotIslandWalker({
  animationPace,
  detailMode,
  onDebugState,
  profileMeasure,
  standIn,
  surface,
}: {
  animationPace: number
  detailMode: RobotWorldDebugState['detailMode']
  onDebugState: (state: RobotWorldDebugState) => void
  profileMeasure: RobotWorldProfileMeasure
  standIn: boolean
  surface: WaterLandSurface
}) {
  const spawn = useMemo(
    () =>
      profileMeasure('setup.robot-world.spawn-centroid', () =>
        centroidForPolygon(surface.grassSurfacePoints),
      ),
    [profileMeasure, surface],
  )
  const groundY = surface.grassSurfaceElevation + ROBOT_GROUND_CLEARANCE
  const pressedKeysRef = useRef(new Set<string>())
  const frameDeltaMsRef = useRef(1000 / 60)
  const lastFrameAtRef = useRef<number | null>(null)
  const reportFrameRef = useRef(0)
  const modelLoadedRef = useRef(false)
  const animationStateRef = useRef<LandrushRobotAnimationState>({
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
  })
  const motionRef = useRef<RobotMotion>({
    cameraSnapVersion: 0,
    frameDeltaMs: 0,
    frameRate: 0,
    heading: 0,
    isMoving: false,
    position: new Vector3(spawn.x, groundY, spawn.z),
    speed: 0,
    velocity: new Vector3(),
  })
  const robotNode = useMemo(
    () =>
      profileMeasure('setup.robot-world.robot-node-schema-parse', () =>
        createRobotWorldNode(spawn, groundY),
      ),
    [groundY, profileMeasure, spawn],
  )
  const robotNodeRef = useRef<LandrushWorldNode>(robotNode)

  const handleModelLoaded = useCallback(() => {
    modelLoadedRef.current = true
  }, [])
  const handleAnimationState = useCallback((state: LandrushRobotAnimationState) => {
    animationStateRef.current = state
  }, [])

  const reportDebugState = useCallback(() => {
    const motion = motionRef.current
    const animationState = animationStateRef.current
    const insideTopSurface = profileMeasure('frame.robot-debug.point-in-grass-polygon', () =>
      pointInPolygon({ x: motion.position.x, z: motion.position.z }, surface.grassSurfacePoints),
    )
    onDebugState({
      animationClipCount: animationState.clipCount,
      animationIdleClip: animationState.idleClip,
      animationIdleClipTime: animationState.idleClipTime,
      animationIdleTimeScale: animationState.idleTimeScale,
      animationIdleWeight: animationState.idleWeight,
      animationMixerTimeScale: animationState.mixerTimeScale,
      animationPace: round(animationPace),
      animationRunClip: animationState.runClip,
      animationRunClipTime: animationState.runClipTime,
      animationRunTimeScale: animationState.runTimeScale,
      animationRunWeight: animationState.runWeight,
      animationWalkClip: animationState.walkClip,
      animationWalkClipTime: animationState.walkClipTime,
      animationWalkTimeScale: animationState.walkTimeScale,
      animationWalkWeight: animationState.walkWeight,
      detailMode,
      frameDeltaMs: round(motion.frameDeltaMs),
      frameRate: round(motion.frameRate),
      heading: round(motion.heading),
      insideTopSurface,
      modelLoaded: modelLoadedRef.current,
      moving: motion.isMoving,
      speed: round(motion.speed),
      spawn: { x: round(spawn.x), y: round(groundY), z: round(spawn.z) },
      x: round(motion.position.x),
      y: round(motion.position.y),
      z: round(motion.position.z),
    })
  }, [
    animationPace,
    detailMode,
    groundY,
    onDebugState,
    profileMeasure,
    spawn,
    surface.grassSurfacePoints,
  ])

  useEffect(() => {
    reportDebugState()
  }, [reportDebugState])

  const resetToSpawn = useCallback(() => {
    const motion = motionRef.current
    motion.position.set(spawn.x, groundY, spawn.z)
    motion.velocity.set(0, 0, 0)
    motion.heading = 0
    motion.isMoving = false
    motion.speed = 0
    motion.cameraSnapVersion += 1
    writeMotionToRobotNode(robotNodeRef.current, motion)
  }, [groundY, spawn])

  useEffect(() => {
    resetToSpawn()
  }, [resetToSpawn])

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
    profileMeasure('frame.robot-motion.total', () => {
      const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
      const motion = motionRef.current
      profileMeasure('frame.robot-motion.sample-frame-rate', () => {
        const now = window.performance.now()
        const previousFrameAt = lastFrameAtRef.current
        lastFrameAtRef.current = now
        const observedFrameDeltaMs =
          previousFrameAt === null ? frameDelta * 1000 : Math.max(1, now - previousFrameAt)
        frameDeltaMsRef.current = MathUtils.lerp(
          frameDeltaMsRef.current,
          observedFrameDeltaMs,
          0.18,
        )
        motion.frameDeltaMs = frameDeltaMsRef.current
        motion.frameRate = 1000 / frameDeltaMsRef.current
      })
      const movement = profileMeasure('frame.robot-motion.resolve-camera-relative-input', () =>
        resolveCameraRelativeMovement(pressedKeysRef.current, state.camera),
      )
      const targetSpeed =
        ROBOT_WORLD_WALK_SPEED *
        (isRunPressed(pressedKeysRef.current) ? ROBOT_WORLD_RUN_MULTIPLIER : 1)
      const desiredVelocity = profileMeasure('frame.robot-motion.compute-desired-velocity', () =>
        movement
          ? {
              x: movement.x * targetSpeed,
              z: movement.z * targetSpeed,
            }
          : { x: 0, z: 0 },
      )
      const nextVelocity = profileMeasure('frame.robot-motion.approach-velocity', () => {
        const acceleration = movement ? ROBOT_WORLD_ACCELERATION : ROBOT_WORLD_DECELERATION
        return {
          x: approach(motion.velocity.x, desiredVelocity.x, acceleration * frameDelta),
          z: approach(motion.velocity.z, desiredVelocity.z, acceleration * frameDelta),
        }
      })
      const previous = { x: motion.position.x, z: motion.position.z }
      const proposed = {
        x: motion.position.x + nextVelocity.x * frameDelta,
        z: motion.position.z + nextVelocity.z * frameDelta,
      }
      const constrained = profileMeasure('frame.robot-motion.constrain-to-grass-polygon', () =>
        constrainToPolygon(proposed, previous, surface.grassSurfacePoints),
      )

      profileMeasure('frame.robot-motion.apply-motion-state', () => {
        motion.position.set(constrained.x, groundY, constrained.z)
        motion.velocity.set(
          (constrained.x - previous.x) / frameDelta,
          0,
          (constrained.z - previous.z) / frameDelta,
        )

        const speed = Math.hypot(motion.velocity.x, motion.velocity.z)
        motion.speed = speed
        motion.isMoving = speed > 0.05
        if (speed > 0.05) {
          motion.heading = lerpAngle(
            motion.heading,
            Math.atan2(motion.velocity.x, motion.velocity.z),
            clamp01(frameDelta * ROBOT_WORLD_TURN_RESPONSE),
          )
        }
      })
      profileMeasure('frame.robot-motion.write-node', () =>
        writeMotionToRobotNode(robotNodeRef.current, motion),
      )

      reportFrameRef.current += 1
      if (reportFrameRef.current % 8 === 0) {
        profileMeasure('frame.robot-motion.report-debug-state', reportDebugState)
      }
    })
  }, -1)

  return (
    <>
      <RobotThirdPersonCameraRig motionRef={motionRef} profileMeasure={profileMeasure} />
      {standIn ? (
        <RobotWorldStandInActor
          motionRef={motionRef}
          onLoaded={handleModelLoaded}
          profileMeasure={profileMeasure}
        />
      ) : (
        <Suspense fallback={<RobotWalkerPrimitive />}>
          <RobotWorldRegisteredActor
            animationPace={animationPace}
            onAnimationState={handleAnimationState}
            node={robotNodeRef.current}
            onLoaded={handleModelLoaded}
            profileMeasure={profileMeasure}
          />
        </Suspense>
      )}
    </>
  )
}

function RobotWorldStandInActor({
  motionRef,
  onLoaded,
  profileMeasure,
}: {
  motionRef: { current: RobotMotion }
  onLoaded: () => void
  profileMeasure: RobotWorldProfileMeasure
}) {
  const groupRef = useRef<Group>(null!)

  useEffect(() => {
    onLoaded()
  }, [onLoaded])

  useFrame(() => {
    profileMeasure('frame.robot-standin.apply-transform', () => {
      const motion = motionRef.current
      groupRef.current?.position.set(motion.position.x, motion.position.y, motion.position.z)
      groupRef.current?.rotation.set(0, motion.heading, 0)
    })
  })

  return (
    <group ref={groupRef}>
      <RobotWalkerPrimitive />
    </group>
  )
}

function RobotWorldRegisteredActor({
  animationPace,
  node,
  onAnimationState,
  onLoaded,
  profileMeasure,
}: {
  animationPace: number
  node: LandrushWorldNode
  onAnimationState: (state: LandrushRobotAnimationState) => void
  onLoaded: () => void
  profileMeasure: RobotWorldProfileMeasure
}) {
  useEffect(() => {
    onLoaded()
  }, [onLoaded])

  return (
    <LandrushRobot
      animationPace={animationPace}
      node={node}
      onAnimationState={onAnimationState}
      profileMeasure={profileMeasure}
    />
  )
}

function createRobotWorldNode(spawn: LandrushPoint2, groundY: number) {
  return LandrushWorldNodeSchema.parse({
    id: 'landrush-world_robot-world-debug',
    type: 'landrush-world',
    landrushMode: 'walk',
    playerHeading: 0,
    playerMoving: false,
    playerPosition: [spawn.x, groundY, spawn.z],
    playerSpeed: 0,
    playerStart: [spawn.x, groundY, spawn.z],
  })
}

function writeMotionToRobotNode(node: LandrushWorldNode, motion: RobotMotion) {
  node.playerPosition = [motion.position.x, motion.position.y, motion.position.z]
  node.playerHeading = motion.heading
  node.playerMoving = motion.isMoving
  node.playerSpeed = motion.speed
}

function RobotThirdPersonCameraRig({
  motionRef,
  profileMeasure,
}: {
  motionRef: { current: RobotMotion }
  profileMeasure: RobotWorldProfileMeasure
}) {
  const initialTarget = useMemo(() => new Vector3(), [])

  return (
    <>
      <PerspectiveCamera far={900} fov={48} makeDefault near={0.1} position={[0, 4.5, -8.2]} />
      <OrbitControls
        dampingFactor={0.12}
        enableDamping
        enablePan={false}
        makeDefault
        maxDistance={ROBOT_CAMERA_MAX_DISTANCE}
        maxPolarAngle={ROBOT_CAMERA_MAX_POLAR_ANGLE}
        minDistance={ROBOT_CAMERA_MIN_DISTANCE}
        minPolarAngle={ROBOT_CAMERA_MIN_POLAR_ANGLE}
        rotateSpeed={0.82}
        target={initialTarget}
        zoomSpeed={0.75}
      />
      <RobotThirdPersonCameraController motionRef={motionRef} profileMeasure={profileMeasure} />
    </>
  )
}

function RobotThirdPersonCameraController({
  motionRef,
  profileMeasure,
}: {
  motionRef: { current: RobotMotion }
  profileMeasure: RobotWorldProfileMeasure
}) {
  const targetRef = useRef(new Vector3())
  const targetDeltaRef = useRef(new Vector3())
  const previousTargetRef = useRef<Vector3 | null>(null)
  const snapVersionRef = useRef<number | null>(null)

  useFrame((state, delta) => {
    profileMeasure('frame.camera-follow.total', () => {
      const motion = motionRef.current
      const target = targetRef.current.set(
        motion.position.x,
        motion.position.y + ROBOT_CAMERA_TARGET_HEIGHT,
        motion.position.z,
      )
      const controls = getRobotWorldOrbitControls(state)
      const previousTarget = previousTargetRef.current

      if (!previousTarget || snapVersionRef.current !== motion.cameraSnapVersion) {
        profileMeasure('frame.camera-follow.snap', () => {
          snapThirdPersonCamera(state.camera, controls, target, motion.heading)
          previousTargetRef.current = target.clone()
          snapVersionRef.current = motion.cameraSnapVersion
        })
        return
      }

      profileMeasure('frame.camera-follow.lerp-target', () => {
        const frameDelta = Math.max(0.001, Math.min(delta, 0.05))
        const followAmount = 1 - Math.exp(-ROBOT_CAMERA_FOLLOW_RESPONSE * frameDelta)
        targetDeltaRef.current.copy(target).sub(previousTarget).multiplyScalar(followAmount)
        previousTarget.add(targetDeltaRef.current)
        state.camera.position.add(targetDeltaRef.current)
      })

      profileMeasure('frame.camera-follow.apply-controls', () => {
        if (controls) {
          controls.target.copy(previousTarget)
          controls.update()
          return
        }

        state.camera.lookAt(previousTarget)
      })
    })
  })

  return null
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

function getRobotWorldOrbitControls(state: unknown) {
  return (state as { controls?: RobotWorldOrbitControls }).controls
}

function RobotWalkerPrimitive() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.46, 1.28, 0.32]} />
        <meshStandardMaterial color="#dce8ea" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.66, 0.02]}>
        <boxGeometry args={[0.36, 0.32, 0.3]} />
        <meshStandardMaterial color="#f4f8fa" roughness={0.74} />
      </mesh>
    </group>
  )
}

function RobotWorldDebugOverlay({
  animationPace,
  debugStore,
  onAnimationPaceChange,
  profiler,
}: {
  animationPace: number
  debugStore: RobotWorldDebugStore
  onAnimationPaceChange: (value: number) => void
  profiler: RobotWorldProfiler
}) {
  const [mounted, setMounted] = useState(false)
  const handleReactProfile = useCallback<ReactProfileHandler>(
    (id, phase, actualDuration) => {
      profiler.record(`react.${id}.${phase}`, actualDuration)
    },
    [profiler],
  )
  const [snapshot, setSnapshot] = useState(() => ({
    profile: profiler.snapshot(),
    robotState: debugStore.get(),
  }))

  useEffect(() => {
    setMounted(true)
    const interval = window.setInterval(() => {
      setSnapshot({
        profile: profiler.snapshot(),
        robotState: debugStore.get(),
      })
    }, 300)
    return () => window.clearInterval(interval)
  }, [debugStore, profiler])

  if (!mounted) return null

  return (
    <Profiler id="robot-world.debug-panel" onRender={handleReactProfile}>
      <RobotWorldDebugPanel
        onReactProfile={handleReactProfile}
        animationPace={animationPace}
        onAnimationPaceChange={onAnimationPaceChange}
        profile={snapshot.profile}
        robotState={snapshot.robotState}
      />
    </Profiler>
  )
}

function RobotWorldDebugPanel({
  animationPace,
  onAnimationPaceChange,
  onReactProfile,
  profile,
  robotState,
}: {
  animationPace: number
  onAnimationPaceChange: (value: number) => void
  onReactProfile: ReactProfileHandler
  profile: RobotWorldProfileSnapshot
  robotState: RobotWorldDebugState | null
}) {
  const unmonitoredOverThreshold = profile.unmonitoredOverThreshold.slice(0, 6)
  const overThreshold = profile.overThreshold.slice(0, 8)

  return (
    <section
      className="pointer-events-auto absolute left-5 top-5 z-40 max-h-[calc(100vh-2.5rem)] w-[min(430px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur"
      data-profile-over-threshold={profile.overThreshold.length}
      data-profile-unmonitored-over-threshold={profile.unmonitoredOverThreshold.length}
      data-testid="robot-world-debug"
    >
      <div className="text-sm font-semibold tracking-wide">Robot world debug</div>
      <Profiler id="robot-world.debug-metrics" onRender={onReactProfile}>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-white/58">detail</dt>
          <dd>{robotState?.detailMode ?? 'debug'}</dd>
          <dt className="text-white/58">fps</dt>
          <dd>{robotState?.frameRate ?? 'loading'}</dd>
          <dt className="text-white/58">frame ms</dt>
          <dd>{robotState?.frameDeltaMs ?? 'loading'}</dd>
          <dt className="text-white/58">speed</dt>
          <dd>{robotState?.speed ?? 'loading'}</dd>
          <dt className="text-white/58">moving</dt>
          <dd>{String(robotState?.moving ?? false)}</dd>
          <dt className="text-white/58">top surface</dt>
          <dd>{String(robotState?.insideTopSurface ?? false)}</dd>
          <dt className="text-white/58">model</dt>
          <dd>{robotState?.modelLoaded ? 'loaded' : 'fallback'}</dd>
          <dt className="text-white/58">idle</dt>
          <dd>{robotState?.animationIdleClip ?? 'pending'}</dd>
          <dt className="text-white/58">walk</dt>
          <dd>{robotState?.animationWalkClip ?? 'pending'}</dd>
          <dt className="text-white/58">run</dt>
          <dd>{robotState?.animationRunClip ?? 'pending'}</dd>
          <dt className="text-white/58">weights</dt>
          <dd>
            {robotState
              ? `${robotState.animationIdleWeight}/${robotState.animationWalkWeight}/${robotState.animationRunWeight}`
              : 'pending'}
          </dd>
          <dt className="text-white/58">time</dt>
          <dd>
            {robotState
              ? `${robotState.animationIdleTimeScale}/${robotState.animationWalkTimeScale}/${robotState.animationRunTimeScale}`
              : 'pending'}
          </dd>
          <dt className="text-white/58">clip t</dt>
          <dd>
            {robotState
              ? `${robotState.animationIdleClipTime}/${robotState.animationWalkClipTime}/${robotState.animationRunClipTime}`
              : 'pending'}
          </dd>
          <dt className="text-white/58">mixer</dt>
          <dd>{robotState?.animationMixerTimeScale ?? 'pending'}</dd>
          <dt className="text-white/58">x</dt>
          <dd>{robotState?.x ?? '--'}</dd>
          <dt className="text-white/58">z</dt>
          <dd>{robotState?.z ?? '--'}</dd>
        </dl>
      </Profiler>
      <div className="mt-3 border-white/15 border-t pt-3">
        <label className="grid gap-1.5 text-xs">
          <span className="flex items-center justify-between gap-3">
            <span className="font-semibold">Animation pace</span>
            <span className="font-mono text-white/80">{formatRobotWorldPace(animationPace)}x</span>
          </span>
          <input
            aria-label="Animation pace"
            className="h-5 w-full accent-lime-300"
            max={ROBOT_WORLD_ANIMATION_PACE_MAX}
            min={ROBOT_WORLD_ANIMATION_PACE_MIN}
            onChange={(event) => onAnimationPaceChange(Number(event.currentTarget.value))}
            step={ROBOT_WORLD_ANIMATION_PACE_STEP}
            type="range"
            value={animationPace}
          />
        </label>
      </div>
      <div className="mt-3 border-white/15 border-t pt-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold">Leaf/self &gt;10ms</span>
          <span className="text-white/58">{profile.unmonitoredOverThreshold.length}</span>
        </div>
        <Profiler id="robot-world.debug-unmonitored-list" onRender={onReactProfile}>
          <div
            className="mt-2 grid gap-1.5 text-[11px]"
            data-testid="robot-world-unmonitored-profile"
          >
            {unmonitoredOverThreshold.length === 0 ? (
              <div className="text-white/58">none recorded</div>
            ) : (
              unmonitoredOverThreshold.map((entry) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded border border-white/10 bg-white/[0.03] px-2 py-1"
                  key={entry.id}
                >
                  <span className="min-w-0 truncate text-white/72" title={entry.id}>
                    {entry.id}
                  </span>
                  <span className="font-mono text-white/80">
                    p95 {entry.p95Ms} / max {entry.maxMs}
                  </span>
                </div>
              ))
            )}
          </div>
        </Profiler>
      </div>
      <div className="mt-3 border-white/15 border-t pt-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold">Inclusive &gt;10ms</span>
          <span className="text-white/58">{profile.overThreshold.length}</span>
        </div>
        <Profiler id="robot-world.debug-inclusive-list" onRender={onReactProfile}>
          <div className="mt-2 grid gap-1.5 text-[11px]" data-testid="robot-world-profile">
            {overThreshold.length === 0 ? (
              <div className="text-white/58">none recorded</div>
            ) : (
              overThreshold.map((entry) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded border border-white/10 bg-white/[0.03] px-2 py-1"
                  key={entry.id}
                >
                  <span className="min-w-0 truncate text-white/72" title={entry.id}>
                    {entry.id}
                  </span>
                  <span className="font-mono text-white/80">
                    p95 {entry.p95Ms} / max {entry.maxMs}
                  </span>
                </div>
              ))
            )}
          </div>
        </Profiler>
      </div>
    </section>
  )
}

function resolveCameraRelativeMovement(keys: ReadonlySet<string>, camera: Camera) {
  const strafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const forwardInput =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'))

  if (strafe === 0 && forwardInput === 0) return null

  const forward = new Vector3()
  camera.getWorldDirection(forward)
  forward.y = 0
  if (forward.lengthSq() < 0.000001) {
    forward.set(0, 0, -1)
  } else {
    forward.normalize()
  }
  const right = { x: -forward.z, z: forward.x }
  return normalize2(
    right.x * strafe + forward.x * forwardInput,
    right.z * strafe + forward.z * forwardInput,
  )
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

function shapeFromPoints(points: readonly LandrushPoint2[]) {
  const shape = new Shape()
  const ring = openRing(points)
  const first = ring[0]
  if (!first) return shape

  shape.moveTo(first.x, -first.z)
  for (let index = 1; index < ring.length; index += 1) {
    const point = ring[index]
    if (point) shape.lineTo(point.x, -point.z)
  }
  shape.closePath()
  return shape
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
  return pointInPolygon(centroid, ring) ? centroid : averagePoint(ring)
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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function parseRobotWorldAnimationPace(value: string | null) {
  if (value === null) return ROBOT_WORLD_ANIMATION_PACE_DEFAULT
  return clampRobotWorldAnimationPace(Number(value))
}

function clampRobotWorldAnimationPace(value: number) {
  if (!Number.isFinite(value)) return ROBOT_WORLD_ANIMATION_PACE_DEFAULT
  return Math.min(ROBOT_WORLD_ANIMATION_PACE_MAX, Math.max(ROBOT_WORLD_ANIMATION_PACE_MIN, value))
}

function formatRobotWorldPace(value: number) {
  return clampRobotWorldAnimationPace(value)
    .toFixed(2)
    .replace(/\.?0+$/, '')
}
