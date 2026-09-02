'use client'

import { LandrushWorldNode } from '@landrush/pascal-plugin'
import { LandrushRobot } from '@landrush/pascal-plugin/landrush-world/robot'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  NoToneMapping,
  type Object3D,
  type PerspectiveCamera,
  type SpotLight,
  SRGBColorSpace,
} from 'three'
import { WebGPURenderer } from 'three/webgpu'
import {
  LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  resolveLandrushRobotShoulderTorchGeometryBudget,
} from './landrush-robot-shoulder-torch'
import { LandrushRobotShoulderTorchRig } from './landrush-robot-shoulder-torch-rig'
import {
  createLandrushRobotWeaponCombatState,
  type LandrushRobotWeaponCombatState,
} from './landrush-robot-weapon-rig'
import {
  createZombieShoulderTorchDebugScreenshotFilename,
  resolveZombieShoulderTorchDebugCameraPose,
  ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES,
  ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES,
  ZOMBIE_SHOULDER_TORCH_DEBUG_MODE_PRESENTATION,
  ZOMBIE_SHOULDER_TORCH_DEBUG_MODES,
  ZOMBIE_SHOULDER_TORCH_DEBUG_VISUAL_CONTRACT,
  type ZombieShoulderTorchDebugAngle,
  type ZombieShoulderTorchDebugCameraDistance,
  type ZombieShoulderTorchDebugMode,
  type ZombieShoulderTorchDebugState,
} from './zombie-shoulder-torch-debug-state'

const ZOMBIE_SHOULDER_TORCH_DEBUG_RENDERER_CACHE = new WeakMap<
  HTMLCanvasElement,
  Promise<WebGPURenderer>
>()
const DEBUG_METRICS_SAMPLE_SECONDS = 0.25

type ZombieShoulderTorchDebugMetrics = Readonly<{
  beamOpacity: number | null
  drawCalls: number | null
  fps: number | null
  frameIntervalMs: number | null
  gpuFrameMs: null
  spotIntensity: number | null
  renderToken: string
  triangles: number | null
}>

type ZombieShoulderTorchDebugSnapshot = Readonly<{
  angle: ZombieShoulderTorchDebugAngle
  budget: ReturnType<typeof resolveLandrushRobotShoulderTorchGeometryBudget>
  cameraDistance: ZombieShoulderTorchDebugCameraDistance
  design: typeof LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN
  dpr: 1
  filename: string
  frameBudgetMs: number
  metrics: ZombieShoulderTorchDebugMetrics
  mode: ZombieShoulderTorchDebugMode
  ready: boolean
}>

declare global {
  interface Window {
    __ZOMBIE_SHOULDER_TORCH_DEBUG__?: ZombieShoulderTorchDebugSnapshot
  }
}

const EMPTY_DEBUG_METRICS: ZombieShoulderTorchDebugMetrics = {
  beamOpacity: null,
  drawCalls: null,
  fps: null,
  frameIntervalMs: null,
  gpuFrameMs: null,
  spotIntensity: null,
  renderToken: '',
  triangles: null,
}

export function ZombieShoulderTorchDebugClient({
  initialAngle,
  initialCameraDistance,
  initialMode,
}: {
  initialAngle: ZombieShoulderTorchDebugAngle
  initialCameraDistance: ZombieShoulderTorchDebugCameraDistance
  initialMode: ZombieShoulderTorchDebugMode
}) {
  const [selection, setSelection] = useState({
    revision: 0,
    state: {
      angle: initialAngle,
      cameraDistance: initialCameraDistance,
      mode: initialMode,
    } satisfies ZombieShoulderTorchDebugState,
  })
  const [appliedCameraKey, setAppliedCameraKey] = useState('')
  const [canvasReady, setCanvasReady] = useState(false)
  const [metrics, setMetrics] = useState<ZombieShoulderTorchDebugMetrics>(EMPTY_DEBUG_METRICS)
  const [renderedToken, setRenderedToken] = useState('')
  const [subjectReady, setSubjectReady] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const debugState = selection.state
  const budget = useMemo(() => resolveLandrushRobotShoulderTorchGeometryBudget(), [])
  const cameraKey = `${debugState.cameraDistance}:${debugState.angle}`
  const stateKey = `${cameraKey}:${debugState.mode}`
  const renderToken = `${stateKey}:${selection.revision}`
  const cameraPose = resolveZombieShoulderTorchDebugCameraPose(
    debugState.cameraDistance,
    debugState.angle,
  )
  const ready = canvasReady && subjectReady && renderedToken === renderToken
  const visibleMetrics = metrics.renderToken === renderToken ? metrics : EMPTY_DEBUG_METRICS
  const filename = createZombieShoulderTorchDebugScreenshotFilename(debugState)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('camera', debugState.cameraDistance)
    url.searchParams.set('angle', debugState.angle)
    url.searchParams.set('mode', debugState.mode)
    window.history.replaceState(window.history.state, '', url)
  }, [debugState])

  useEffect(() => {
    const snapshot: ZombieShoulderTorchDebugSnapshot = {
      angle: debugState.angle,
      budget,
      cameraDistance: debugState.cameraDistance,
      design: LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
      dpr: 1,
      filename,
      frameBudgetMs: ZOMBIE_SHOULDER_TORCH_DEBUG_VISUAL_CONTRACT.frameBudgetMs,
      metrics: visibleMetrics,
      mode: debugState.mode,
      ready,
    }
    window.__ZOMBIE_SHOULDER_TORCH_DEBUG__ = snapshot
    return () => {
      if (window.__ZOMBIE_SHOULDER_TORCH_DEBUG__ === snapshot) {
        delete window.__ZOMBIE_SHOULDER_TORCH_DEBUG__
      }
    }
  }, [budget, debugState, filename, ready, visibleMetrics])

  const updateDebugState = useCallback((patch: Partial<ZombieShoulderTorchDebugState>) => {
    setSelection((current) => {
      const state = { ...current.state, ...patch }
      if (
        state.angle === current.state.angle &&
        state.cameraDistance === current.state.cameraDistance &&
        state.mode === current.state.mode
      ) {
        return current
      }
      return { revision: current.revision + 1, state }
    })
  }, [])

  const captureSnapshot = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !ready) return
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = filename
    link.href = objectUrl
    document.body.append(link)
    link.click()
    link.remove()
    window.requestAnimationFrame(() => URL.revokeObjectURL(objectUrl))
  }, [filename, ready])

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#02050b] text-slate-100 [&_canvas]:h-full [&_canvas]:w-full"
      data-angle={debugState.angle}
      data-camera={debugState.cameraDistance}
      data-capture-ready={ready ? 'true' : 'false'}
      data-mode={debugState.mode}
      data-render-token={renderedToken}
      data-state={stateKey}
      data-testid="zombie-shoulder-torch-debug"
    >
      <Canvas
        camera={{
          far: cameraPose.far,
          fov: cameraPose.fov,
          near: cameraPose.near,
          position: [...cameraPose.position],
        }}
        dpr={1}
        frameloop="always"
        gl={createZombieShoulderTorchDebugRenderer as never}
        onCreated={({ gl }) => {
          canvasRef.current = gl.domElement
          setCanvasReady(true)
        }}
        shadows={false}
      >
        <ZombieShoulderTorchDebugRendererPresentation mode={debugState.mode} />
        <ZombieShoulderTorchDebugCameraRig
          cameraKey={cameraKey}
          onApplied={setAppliedCameraKey}
          pose={cameraPose}
        />
        <ZombieShoulderTorchDebugWorld
          mode={debugState.mode}
          onSubjectReady={() => setSubjectReady(true)}
        />
        <ZombieShoulderTorchDebugManualRenderDriver
          cameraReady={appliedCameraKey === cameraKey}
          onRendered={setRenderedToken}
          renderToken={renderToken}
          subjectReady={subjectReady}
        />
        <ZombieShoulderTorchDebugMetricsReporter onMetrics={setMetrics} renderToken={renderToken} />
      </Canvas>

      <section className="pointer-events-none absolute top-5 left-5 max-w-[29rem] rounded-2xl border border-cyan-100/20 bg-slate-950/80 px-4 py-3 shadow-2xl backdrop-blur-md">
        <p className="font-black text-[10px] text-cyan-200 uppercase tracking-[0.24em]">
          Zombie shoulder torch · render contract
        </p>
        <h1 className="mt-1 font-black text-xl">Two origins · one continuous cone</h1>
        <p className="mt-1 text-slate-300 text-xs">
          Fixed camera · DPR 1 · production robot, fixtures, beam and spotlight
        </p>
        <p className="mt-1 text-slate-400 text-xs">
          {budget.beamTriangles}-triangle beam · one beam draw · {budget.pairFixtureTriangles}{' '}
          fixture tris · 16.67 ms contract
        </p>
        <p className="mt-2 text-[11px] text-cyan-100/75">
          Two shoulder feeds stay filled, join smoothly at 0.8 m, then fade continuously to a
          transparent edge.
        </p>
      </section>

      <ZombieShoulderTorchDebugControls
        onCapture={captureSnapshot}
        onStateChange={updateDebugState}
        ready={ready}
        state={debugState}
      />

      <section
        aria-live="polite"
        className="pointer-events-none absolute right-5 bottom-5 rounded-xl border border-white/10 bg-black/65 px-3 py-2 font-mono text-[10px] text-white/70"
      >
        <p>
          {ready ? 'CAPTURE READY' : 'PREPARING FIXED VIEW'} · {filename}
        </p>
        <p className="mt-1">
          {formatMetric(visibleMetrics.fps, ' fps')} ·{' '}
          {formatMetric(visibleMetrics.frameIntervalMs, ' ms')} ·{' '}
          {formatMetric(visibleMetrics.drawCalls, ' draws')} ·{' '}
          {formatMetric(visibleMetrics.triangles, ' tris')}
        </p>
        <p className="mt-1 text-white/55">
          Beam α {formatMetric(visibleMetrics.beamOpacity, '')} · spot{' '}
          {formatMetric(visibleMetrics.spotIntensity, ' cd')}
        </p>
        <p className="mt-1 text-white/45">GPU frame time: unavailable · never inferred from FPS</p>
      </section>
    </main>
  )
}

function createZombieShoulderTorchDebugRenderer(props: { canvas?: HTMLCanvasElement }) {
  const canvas = props.canvas
  const cached = canvas ? ZOMBIE_SHOULDER_TORCH_DEBUG_RENDERER_CACHE.get(canvas) : undefined
  if (cached) return cached
  const promise = (async () => {
    const renderer = new WebGPURenderer({
      ...props,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    } as never)
    await renderer.init()
    return renderer
  })()
  if (canvas) ZOMBIE_SHOULDER_TORCH_DEBUG_RENDERER_CACHE.set(canvas, promise)
  return promise
}

function ZombieShoulderTorchDebugRendererPresentation({
  mode,
}: {
  mode: ZombieShoulderTorchDebugMode
}) {
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    const previousOutputColorSpace = gl.outputColorSpace
    const previousToneMapping = gl.toneMapping
    const previousToneMappingExposure = gl.toneMappingExposure
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping =
      ZOMBIE_SHOULDER_TORCH_DEBUG_MODE_PRESENTATION[mode].toneMapping === 'aces'
        ? ACESFilmicToneMapping
        : NoToneMapping
    gl.toneMappingExposure = mode === 'final' ? 1.04 : 1
    return () => {
      gl.outputColorSpace = previousOutputColorSpace
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousToneMappingExposure
    }
  }, [gl, mode])
  return null
}

function ZombieShoulderTorchDebugCameraRig({
  cameraKey,
  onApplied,
  pose,
}: {
  cameraKey: string
  onApplied: (cameraKey: string) => void
  pose: ReturnType<typeof resolveZombieShoulderTorchDebugCameraPose>
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const pendingCameraKeyRef = useRef(cameraKey)

  useLayoutEffect(() => {
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    camera.up.set(pose.up[0], pose.up[1], pose.up[2])
    camera.fov = pose.fov
    camera.near = pose.near
    camera.far = pose.far
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2])
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    pendingCameraKeyRef.current = cameraKey
  }, [camera, cameraKey, pose])

  useFrame(() => {
    const pendingCameraKey = pendingCameraKeyRef.current
    if (!pendingCameraKey) return
    pendingCameraKeyRef.current = ''
    onApplied(pendingCameraKey)
  }, 90)
  return null
}

function ZombieShoulderTorchDebugWorld({
  mode,
  onSubjectReady,
}: {
  mode: ZombieShoulderTorchDebugMode
  onSubjectReady: () => void
}) {
  const presentation = ZOMBIE_SHOULDER_TORCH_DEBUG_MODE_PRESENTATION[mode]
  const isolated = presentation.isolateContribution
  return (
    <>
      <color args={[isolated ? '#010205' : '#07101a']} attach="background" />
      <hemisphereLight
        color={isolated ? '#304052' : '#b8d7f1'}
        groundColor={isolated ? '#030505' : '#111923'}
        intensity={isolated ? 0.035 : 0.58}
      />
      <directionalLight
        color={isolated ? '#30445b' : '#ffe6c4'}
        intensity={isolated ? 0.025 : 1.15}
        position={[3, 7, 2]}
      />
      <mesh position={[0, -0.01, 2.7]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 13]} />
        <meshStandardMaterial color={isolated ? '#0a100f' : '#15221d'} roughness={0.96} />
      </mesh>
      <Suspense fallback={null}>
        <ZombieShoulderTorchRobotSubject mode={mode} onReady={onSubjectReady} />
      </Suspense>
      <ZombieShoulderTorchBeamTargets />
    </>
  )
}

function ZombieShoulderTorchRobotSubject({
  mode,
  onReady,
}: {
  mode: ZombieShoulderTorchDebugMode
  onReady: () => void
}) {
  const presentation = ZOMBIE_SHOULDER_TORCH_DEBUG_MODE_PRESENTATION[mode]
  const visualRootRef = useRef<Group | null>(null)
  const combatStateRef = useRef<LandrushRobotWeaponCombatState | null>(
    createLandrushRobotWeaponCombatState(),
  )
  const readyFramesRef = useRef(0)
  const node = useMemo(
    () =>
      LandrushWorldNode.parse({
        id: 'landrush-world_shoulder-torch-debug-player',
        landrushMode: 'walk',
        name: 'Shoulder torch Orbot',
        playerHeading: 0,
        playerMoving: false,
        playerPosition: [0, 0.02, 0],
        playerSpeed: 0,
      }),
    [],
  )
  const combat = combatStateRef.current
  if (combat) {
    combat.aimAngle = 0
    combat.movementHeading = 0
  }

  useFrame(() => {
    if (!visualRootRef.current || readyFramesRef.current > 14) return
    readyFramesRef.current += 1
    if (readyFramesRef.current === 14) onReady()
  }, 3)

  return (
    <group>
      <LandrushRobot
        animationPace={0}
        framePriority={2}
        node={node}
        visualRootRef={visualRootRef}
      />
      <LandrushRobotShoulderTorchRig
        beamOpacityScale={mode === 'volume' ? 4 : 1}
        combatStateRef={combatStateRef}
        emitSpotLights={presentation.emitSpotLights}
        framePriority={2.6}
        showBeams={presentation.showBeams}
        showFixtures={presentation.showFixtures}
        visualRootRef={visualRootRef}
      />
    </group>
  )
}

function ZombieShoulderTorchDebugManualRenderDriver({
  cameraReady,
  onRendered,
  renderToken,
  subjectReady,
}: {
  cameraReady: boolean
  onRendered: (renderToken: string) => void
  renderToken: string
  subjectReady: boolean
}) {
  const reportedRenderTokenRef = useRef('')
  const settledFrameCountRef = useRef(0)
  const settledRenderTokenRef = useRef('')
  useFrame(({ camera, gl, scene }) => {
    gl.render(scene, camera)
    if (!cameraReady || !subjectReady) {
      reportedRenderTokenRef.current = ''
      settledFrameCountRef.current = 0
      settledRenderTokenRef.current = ''
      return
    }
    if (settledRenderTokenRef.current !== renderToken) {
      reportedRenderTokenRef.current = ''
      settledFrameCountRef.current = 1
      settledRenderTokenRef.current = renderToken
      return
    }
    settledFrameCountRef.current += 1
    if (settledFrameCountRef.current < 3 || reportedRenderTokenRef.current === renderToken) {
      return
    }
    reportedRenderTokenRef.current = renderToken
    onRendered(renderToken)
  }, 100)
  return null
}

function ZombieShoulderTorchDebugMetricsReporter({
  onMetrics,
  renderToken,
}: {
  onMetrics: (metrics: ZombieShoulderTorchDebugMetrics) => void
  renderToken: string
}) {
  const elapsedRef = useRef(0)
  const frameCountRef = useRef(0)
  const lastDrawCallsRef = useRef(0)
  const lastTrianglesRef = useRef(0)
  const sampledRenderTokenRef = useRef('')
  useFrame(({ gl, scene }, delta) => {
    if (sampledRenderTokenRef.current !== renderToken) {
      elapsedRef.current = 0
      frameCountRef.current = 0
      sampledRenderTokenRef.current = renderToken
    }
    const renderInfo = gl.info.render as typeof gl.info.render & { drawCalls?: number }
    elapsedRef.current += delta
    frameCountRef.current += 1
    lastDrawCallsRef.current = renderInfo.drawCalls ?? renderInfo.calls
    lastTrianglesRef.current = renderInfo.triangles
    if (elapsedRef.current < DEBUG_METRICS_SAMPLE_SECONDS) return
    const torchRoot = findShoulderTorchRoot(scene)
    const beam = torchRoot?.children.find((child) => child.type === 'Mesh') as Mesh | undefined
    const spot = torchRoot?.children.find((child) => child.type === 'SpotLight') as
      | SpotLight
      | undefined
    const frameIntervalMs = (elapsedRef.current * 1000) / frameCountRef.current
    elapsedRef.current = 0
    frameCountRef.current = 0
    onMetrics({
      beamOpacity: beam ? (beam.material as MeshBasicMaterial).opacity : null,
      drawCalls: lastDrawCallsRef.current,
      fps: frameIntervalMs > 0 ? 1000 / frameIntervalMs : null,
      frameIntervalMs,
      gpuFrameMs: null,
      spotIntensity: spot?.intensity ?? null,
      renderToken,
      triangles: lastTrianglesRef.current,
    })
  }, 101)
  return null
}

function findShoulderTorchRoot(scene: Object3D): Object3D | null {
  let torchRoot: Object3D | null = null
  scene.traverse((object) => {
    if (object.userData.role === 'landrush-robot-shoulder-torches') torchRoot = object
  })
  return torchRoot as Object3D | null
}

function ZombieShoulderTorchBeamTargets() {
  return (
    <>
      <mesh position={[-0.72, 0.24, 3.55]} rotation={[0.04, 0.32, -0.03]}>
        <boxGeometry args={[0.58, 0.5, 0.58]} />
        <meshStandardMaterial color="#5d4a36" metalness={0.08} roughness={0.9} />
      </mesh>
      <mesh position={[0.8, 0.16, 4.35]} rotation={[0, -0.42, 0]}>
        <dodecahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color="#39483e" metalness={0.03} roughness={1} />
      </mesh>
      <gridHelper args={[10, 40, '#344737', '#1b2921']} position={[0, 0.005, 2.7]} />
    </>
  )
}

function ZombieShoulderTorchDebugControls({
  onCapture,
  onStateChange,
  ready,
  state,
}: {
  onCapture: () => void
  onStateChange: (patch: Partial<ZombieShoulderTorchDebugState>) => void
  ready: boolean
  state: ZombieShoulderTorchDebugState
}) {
  return (
    <aside className="absolute top-5 right-5 w-72 rounded-2xl border border-white/15 bg-slate-950/88 p-4 shadow-2xl backdrop-blur-md">
      <DebugButtonGroup
        active={state.cameraDistance}
        label="Distance"
        onSelect={(cameraDistance) => onStateChange({ cameraDistance })}
        options={ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES}
      />
      <DebugButtonGroup
        active={state.angle}
        label="Angle"
        onSelect={(angle) => onStateChange({ angle })}
        options={ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES}
      />
      <DebugButtonGroup
        active={state.mode}
        label="Pass"
        onSelect={(mode) => onStateChange({ mode })}
        options={ZOMBIE_SHOULDER_TORCH_DEBUG_MODES}
      />
      <button
        className="mt-3 w-full rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-3 py-2 font-black text-cyan-100 text-xs uppercase tracking-[0.14em] transition hover:bg-cyan-400/25 disabled:cursor-wait disabled:opacity-40"
        disabled={!ready}
        onClick={onCapture}
        type="button"
      >
        Capture PNG
      </button>
      <p className="mt-2 text-[10px] text-white/45">
        Volume isolates and amplifies the visible cone. Surface isolates the unchanged real light.
      </p>
    </aside>
  )
}

function DebugButtonGroup<Option extends string>({
  active,
  label,
  onSelect,
  options,
}: {
  active: Option
  label: string
  onSelect: (option: Option) => void
  options: readonly Option[]
}) {
  return (
    <fieldset className="mb-3">
      <legend className="mb-1.5 font-black text-[9px] text-white/45 uppercase tracking-[0.2em]">
        {label}
      </legend>
      <div className="grid grid-cols-4 gap-1">
        {options.map((option) => {
          const selected = option === active
          return (
            <button
              aria-pressed={selected}
              className={`rounded-md border px-1.5 py-1.5 font-bold text-[10px] capitalize transition ${
                selected
                  ? 'border-cyan-200/65 bg-cyan-300/25 text-cyan-50'
                  : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'
              }`}
              key={option}
              onClick={() => onSelect(option)}
              type="button"
            >
              {option}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function formatMetric(value: number | null, suffix: string) {
  if (value === null || !Number.isFinite(value)) return `—${suffix}`
  return `${value.toFixed(value >= 100 ? 0 : 1)}${suffix}`
}
