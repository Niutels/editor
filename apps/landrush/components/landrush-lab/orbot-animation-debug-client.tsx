'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  advanceOrbotAnimationDebugBlend,
  ORBOT_ANIMATION_DEBUG_TRACK_LENGTH,
  type OrbotAnimationDebugBlendWeights,
  type OrbotAnimationDebugGait,
  resolveOrbotAnimationDebugBlendTargets,
  sampleOrbotAnimationDebugTrack,
  seededOrbotAnimationDebugPhase,
} from './orbot-animation-debug-motion'

const ORBOT_ASSET_PATH = '/navigation/proto_pascal_robot-jpeg-4fc9f04e.glb'
const ORBOT_TARGET_HEIGHT = 1.82
const ORBOT_GLB_VISUAL_SCALE = 1 / 110.16949152542374
const ORBOT_BLEND_RESPONSE = 8
const ORBOT_IDLE_TIME_SCALE = 0.5
const ORBOT_WALK_TIME_SCALE = 0.88
const ORBOT_RUN_TIME_SCALE_RANGE = [0.75, 1.45] as const
const ORBOT_TRACE_POINT_LIMIT = 420
const ORBOT_TRACE_POINT_SPACING = 0.08

const ORBOT_IDLE_CLIP_NAMES = [
  'Idle_9',
  'Idle_11',
  'Idle_7',
  'Idle_12',
  'Idle_Talking_Loop',
  'Idle_Loop',
] as const
const ORBOT_WALK_CLIP_NAMES = ['Walking', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop'] as const
const ORBOT_RUN_CLIP_NAMES = ['Running', 'Sprint_Loop', 'Jog_Fwd_Loop'] as const

type ProjectionMode = 'orthographic' | 'perspective'
type RootMotionMode = 'in-place' | 'path'
type CameraBookmarkName = 'custom' | 'design' | 'far' | 'near'
type FixedCameraBookmarkName = Exclude<CameraBookmarkName, 'custom'>

type DebugControls = {
  azimuth: number
  cameraBookmark: CameraBookmarkName
  elevation: number
  forceProcedural: boolean
  gait: OrbotAnimationDebugGait
  noPostBaseline: boolean
  paused: boolean
  projection: ProjectionMode
  rootMotionMode: RootMotionMode
  seed: number
  showBounds: boolean
  showPath: boolean
  showRootTrace: boolean
  showSkeleton: boolean
  showVectors: boolean
  speed: number
  targetOffset: [number, number, number]
  timeScale: number
  zoom: number
}

type CameraBookmark = {
  azimuth: number
  elevation: number
  projection: ProjectionMode
  targetOffset: [number, number, number]
  zoom: number
}

type AssetReport = {
  assetPath: string
  boneCount: number
  clipCount: number
  error: string | null
  meshCount: number
  selectedClips: {
    idle: string | null
    run: string | null
    walk: string | null
  }
  state: 'error' | 'loaded' | 'loading' | 'procedural'
}

type DebugMetrics = {
  backend: string
  blend: OrbotAnimationDebugBlendWeights
  boundsSize: [number, number, number]
  clipRootOffset: [number, number, number]
  distance: number
  dpr: number
  drawCalls: number
  elapsed: number
  fps: number
  frameIntervalMs: number
  geometries: number
  gpuFrameMs: number | null
  lap: number
  lines: number
  pathProgress: number
  points: number
  postPasses: number
  renderTargets: number
  rootPosition: [number, number, number]
  textures: number
  triangles: number
  viewport: [number, number]
}

type DebugRuntime = {
  actorPosition: THREE.Vector3
  blend: OrbotAnimationDebugBlendWeights
  boundsSize: THREE.Vector3
  clipRootOffset: THREE.Vector3
  distance: number
  elapsed: number
  frameIntervalMs: number
  heading: number
  lap: number
  lastMetricsAt: number
  lastResetRevision: number
  pathPosition: THREE.Vector3
  pathProgress: number
  seed: number
  tangent: THREE.Vector3
  trace: THREE.Vector3[]
  velocity: THREE.Vector3
}

type OrbotAnimationDebugApi = {
  reset: () => void
  setBookmark: (bookmark: FixedCameraBookmarkName) => void
  setPaused: (paused: boolean) => void
  snapshot: {
    asset: AssetReport
    controls: DebugControls
    metrics: DebugMetrics
    ready: boolean
    version: 1
  }
}

declare global {
  interface Window {
    __ORBOT_ANIMATION_DEBUG__?: OrbotAnimationDebugApi
  }
}

const CAMERA_BOOKMARKS: Record<FixedCameraBookmarkName, CameraBookmark> = {
  design: {
    azimuth: 34,
    elevation: 68,
    projection: 'orthographic',
    targetOffset: [0, 0.72, 0],
    zoom: 1,
  },
  far: {
    azimuth: 24,
    elevation: 78,
    projection: 'orthographic',
    targetOffset: [0, 0.45, 0],
    zoom: 0.68,
  },
  near: {
    azimuth: 42,
    elevation: 54,
    projection: 'perspective',
    targetOffset: [1.4, 0.88, -0.35],
    zoom: 1.62,
  },
}

const DEFAULT_CONTROLS: DebugControls = {
  ...CAMERA_BOOKMARKS.design,
  cameraBookmark: 'design',
  forceProcedural: false,
  gait: 'auto',
  noPostBaseline: true,
  paused: false,
  rootMotionMode: 'path',
  seed: 47,
  showBounds: true,
  showPath: true,
  showRootTrace: true,
  showSkeleton: false,
  showVectors: true,
  speed: 2.4,
  timeScale: 1,
}

const INITIAL_ASSET_REPORT: AssetReport = {
  assetPath: ORBOT_ASSET_PATH,
  boneCount: 0,
  clipCount: 0,
  error: null,
  meshCount: 0,
  selectedClips: { idle: null, run: null, walk: null },
  state: 'loading',
}

const INITIAL_METRICS: DebugMetrics = {
  backend: 'initializing',
  blend: { idle: 1, run: 0, walk: 0 },
  boundsSize: [0, 0, 0],
  clipRootOffset: [0, 0, 0],
  distance: 0,
  dpr: 1,
  drawCalls: 0,
  elapsed: 0,
  fps: 0,
  frameIntervalMs: 0,
  geometries: 0,
  gpuFrameMs: null,
  lap: 0,
  lines: 0,
  pathProgress: 0,
  points: 0,
  postPasses: 0,
  renderTargets: 0,
  rootPosition: [0, 0, 0],
  textures: 0,
  triangles: 0,
  viewport: [0, 0],
}

export function OrbotAnimationDebugClient() {
  const [controls, setControls] = useState<DebugControls>(DEFAULT_CONTROLS)
  const [resetRevision, setResetRevision] = useState(0)
  const [assetReport, setAssetReport] = useState<AssetReport>(INITIAL_ASSET_REPORT)
  const [metrics, setMetrics] = useState<DebugMetrics>(INITIAL_METRICS)
  const [visualRoot, setVisualRoot] = useState<THREE.Object3D | null>(null)
  const actorRootRef = useRef<THREE.Group | null>(null)
  const runtimeRef = useRef(createDebugRuntime())

  const updateControls = useCallback((patch: Partial<DebugControls>) => {
    setControls((current) => ({ ...current, ...patch }))
  }, [])

  const updateCameraControls = useCallback((patch: Partial<DebugControls>) => {
    setControls((current) => ({ ...current, ...patch, cameraBookmark: 'custom' }))
  }, [])

  const updateTargetOffset = useCallback((axis: 0 | 1 | 2, value: number) => {
    setControls((current) => {
      const targetOffset = [...current.targetOffset] as [number, number, number]
      targetOffset[axis] = value
      return { ...current, cameraBookmark: 'custom', targetOffset }
    })
  }, [])

  const applyCameraBookmark = useCallback((name: FixedCameraBookmarkName) => {
    setControls((current) => ({
      ...current,
      ...CAMERA_BOOKMARKS[name],
      cameraBookmark: name,
    }))
  }, [])

  const reset = useCallback(() => {
    setResetRevision((revision) => revision + 1)
  }, [])

  const setPaused = useCallback((paused: boolean) => {
    setControls((current) => ({ ...current, paused }))
  }, [])

  const debugApi = useMemo<OrbotAnimationDebugApi>(
    () => ({
      reset,
      setBookmark: applyCameraBookmark,
      setPaused,
      snapshot: {
        asset: INITIAL_ASSET_REPORT,
        controls: DEFAULT_CONTROLS,
        metrics: INITIAL_METRICS,
        ready: false,
        version: 1,
      },
    }),
    [applyCameraBookmark, reset, setPaused],
  )

  debugApi.snapshot = {
    asset: assetReport,
    controls,
    metrics,
    ready: assetReport.state !== 'loading',
    version: 1,
  }

  useEffect(() => {
    window.__ORBOT_ANIMATION_DEBUG__ = debugApi
    return () => {
      if (window.__ORBOT_ANIMATION_DEBUG__ === debugApi) {
        delete window.__ORBOT_ANIMATION_DEBUG__
      }
    }
  }, [debugApi])

  const assetStatusTone =
    assetReport.state === 'loaded'
      ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
      : assetReport.state === 'loading'
        ? 'border-amber-300/30 bg-amber-400/10 text-amber-100'
        : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100'

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#080d12] text-slate-100">
      <Canvas
        camera={{ far: 90, fov: 38, near: 0.05, position: [11, 13, 11] }}
        className="h-full w-full"
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        shadows={!controls.noPostBaseline}
      >
        <OrbotDebugScene
          actorRootRef={actorRootRef}
          controls={controls}
          onAssetReport={setAssetReport}
          onMetrics={setMetrics}
          onVisualRoot={setVisualRoot}
          resetRevision={resetRevision}
          runtimeRef={runtimeRef}
          visualRoot={visualRoot}
        />
      </Canvas>

      <aside className="absolute top-4 left-4 z-20 max-h-[calc(100vh-2rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/12 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
        <div className="border-white/10 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] text-cyan-300 uppercase tracking-[0.22em]">
                Landrush lab
              </p>
              <h1 className="mt-1 font-semibold text-lg">Orbot motion inspector</h1>
              <p className="mt-1 text-slate-400 text-xs">
                Deterministic root path and locomotion blend harness
              </p>
            </div>
            <button
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-medium text-xs hover:bg-white/10"
              onClick={reset}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>

        <ControlSection title="Motion">
          <RangeControl
            label="Speed"
            max={8}
            min={0}
            onChange={(speed) => updateControls({ speed })}
            step={0.1}
            suffix="m/s"
            value={controls.speed}
          />
          <label className="grid gap-1.5 text-xs">
            <span className="text-slate-400">Gait</span>
            <select
              className="rounded-lg border border-white/12 bg-slate-900 px-2.5 py-2 text-sm outline-none focus:border-cyan-300/60"
              onChange={(event) =>
                updateControls({ gait: event.target.value as OrbotAnimationDebugGait })
              }
              value={controls.gait}
            >
              <option value="auto">Auto blend</option>
              <option value="idle">Idle</option>
              <option value="walk">Walk</option>
              <option value="run">Run</option>
            </select>
          </label>
          <RangeControl
            label="Time scale"
            max={2}
            min={0.1}
            onChange={(timeScale) => updateControls({ timeScale })}
            step={0.05}
            suffix="×"
            value={controls.timeScale}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => setPaused(!controls.paused)}
              type="button"
            >
              {controls.paused ? 'Resume' : 'Pause'}
            </button>
            <select
              aria-label="Root motion mode"
              className="rounded-lg border border-white/12 bg-slate-900 px-2.5 py-2 text-sm outline-none focus:border-cyan-300/60"
              onChange={(event) =>
                updateControls({ rootMotionMode: event.target.value as RootMotionMode })
              }
              value={controls.rootMotionMode}
            >
              <option value="path">Root on path</option>
              <option value="in-place">In place</option>
            </select>
          </div>
          <label className="grid grid-cols-[1fr_7rem] items-center gap-3 text-xs">
            <span className="text-slate-400">Deterministic seed</span>
            <input
              className="min-w-0 rounded-lg border border-white/12 bg-slate-900 px-2.5 py-2 text-right font-mono text-sm outline-none focus:border-cyan-300/60"
              onChange={(event) => {
                const seed = Number(event.target.value)
                if (!Number.isFinite(seed)) return
                updateControls({ seed: Math.trunc(seed) })
                setResetRevision((revision) => revision + 1)
              }}
              type="number"
              value={controls.seed}
            />
          </label>
        </ControlSection>

        <ControlSection title="Camera">
          <div className="grid grid-cols-3 gap-1.5">
            {(['near', 'design', 'far'] as const).map((bookmark) => (
              <button
                className={`rounded-lg border px-2 py-1.5 text-xs capitalize ${
                  controls.cameraBookmark === bookmark
                    ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100'
                    : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
                key={bookmark}
                onClick={() => applyCameraBookmark(bookmark)}
                type="button"
              >
                {bookmark}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-xs">
            <span className="text-slate-400">Projection</span>
            <select
              className="rounded-lg border border-white/12 bg-slate-900 px-2.5 py-2 text-sm outline-none focus:border-cyan-300/60"
              onChange={(event) =>
                updateCameraControls({ projection: event.target.value as ProjectionMode })
              }
              value={controls.projection}
            >
              <option value="orthographic">Orthographic</option>
              <option value="perspective">Perspective</option>
            </select>
          </label>
          <RangeControl
            label="Azimuth"
            max={180}
            min={-180}
            onChange={(azimuth) => updateCameraControls({ azimuth })}
            step={1}
            suffix="°"
            value={controls.azimuth}
          />
          <RangeControl
            label="Elevation"
            max={86}
            min={25}
            onChange={(elevation) => updateCameraControls({ elevation })}
            step={1}
            suffix="°"
            value={controls.elevation}
          />
          <RangeControl
            label="Zoom"
            max={2.5}
            min={0.45}
            onChange={(zoom) => updateCameraControls({ zoom })}
            step={0.05}
            suffix="×"
            value={controls.zoom}
          />
          <div className="grid grid-cols-3 gap-2">
            {(['X', 'Y', 'Z'] as const).map((axis, index) => (
              <label className="grid gap-1 text-[10px] text-slate-500" key={axis}>
                Target {axis}
                <input
                  className="min-w-0 rounded-md border border-white/10 bg-slate-900 px-1.5 py-1.5 text-center font-mono text-slate-200 text-xs outline-none focus:border-cyan-300/60"
                  onChange={(event) =>
                    updateTargetOffset(index as 0 | 1 | 2, Number(event.target.value))
                  }
                  step="0.1"
                  type="number"
                  value={controls.targetOffset[index]}
                />
              </label>
            ))}
          </div>
        </ControlSection>

        <ControlSection title="Diagnostics">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <ToggleControl
              checked={controls.showPath}
              label="Track path"
              onChange={(showPath) => updateControls({ showPath })}
            />
            <ToggleControl
              checked={controls.showRootTrace}
              label="Root trace"
              onChange={(showRootTrace) => updateControls({ showRootTrace })}
            />
            <ToggleControl
              checked={controls.showSkeleton}
              label="Skeleton"
              onChange={(showSkeleton) => updateControls({ showSkeleton })}
            />
            <ToggleControl
              checked={controls.showBounds}
              label="Bounds"
              onChange={(showBounds) => updateControls({ showBounds })}
            />
            <ToggleControl
              checked={controls.showVectors}
              label="Debug vectors"
              onChange={(showVectors) => updateControls({ showVectors })}
            />
            <ToggleControl
              checked={controls.noPostBaseline}
              label="No-post baseline"
              onChange={(noPostBaseline) => updateControls({ noPostBaseline })}
            />
            <ToggleControl
              checked={controls.forceProcedural}
              label="Force fallback"
              onChange={(forceProcedural) => updateControls({ forceProcedural })}
            />
          </div>
        </ControlSection>
      </aside>

      <section
        className={`absolute top-4 right-4 z-10 w-[min(24rem,calc(100vw-2rem))] rounded-xl border px-3.5 py-3 shadow-xl backdrop-blur-xl ${assetStatusTone}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-sm">
            {assetReport.state === 'loaded'
              ? 'Existing Orbot asset loaded'
              : assetReport.state === 'loading'
                ? 'Loading GLB · procedural preview'
                : assetReport.state === 'error'
                  ? 'GLB unavailable · procedural fallback'
                  : 'Deterministic procedural fallback'}
          </span>
          <span className="rounded-full border border-current/20 px-2 py-0.5 font-mono text-[10px] uppercase">
            {controls.noPostBaseline ? 'baseline' : 'lit'}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-[11px] opacity-80">
          {assetReport.clipCount} clips · {assetReport.boneCount} bones · {assetReport.meshCount}{' '}
          meshes · post passes 0
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px]">
          <ClipStatus label="Idle" name={assetReport.selectedClips.idle} />
          <ClipStatus label="Walk" name={assetReport.selectedClips.walk} />
          <ClipStatus label="Run" name={assetReport.selectedClips.run} />
        </div>
        {assetReport.error ? <p className="mt-2 text-[11px]">{assetReport.error}</p> : null}
      </section>

      <section className="absolute right-4 bottom-4 z-10 hidden w-[22rem] rounded-xl border border-white/12 bg-slate-950/88 p-3 shadow-xl backdrop-blur-xl md:block">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-semibold text-xs uppercase tracking-[0.16em]">Runtime metrics</p>
          <span className="font-mono text-[10px] text-slate-500">
            GPU {metrics.gpuFrameMs === null ? 'n/a' : `${metrics.gpuFrameMs.toFixed(2)} ms`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-2 font-mono text-[10px]">
          <Metric label="FPS" value={metrics.fps.toFixed(1)} />
          <Metric label="Frame" value={`${metrics.frameIntervalMs.toFixed(2)} ms`} />
          <Metric label="DPR" value={metrics.dpr.toFixed(2)} />
          <Metric label="Calls" value={metrics.drawCalls} />
          <Metric label="Triangles" value={metrics.triangles.toLocaleString()} />
          <Metric label="Geometries" value={metrics.geometries} />
          <Metric label="Textures" value={metrics.textures} />
          <Metric label="Targets" value={metrics.renderTargets} />
          <Metric label="Backend" value={metrics.backend} />
          <Metric label="Time" value={`${metrics.elapsed.toFixed(2)} s`} />
          <Metric label="Distance" value={`${metrics.distance.toFixed(2)} m`} />
          <Metric
            label="Lap"
            value={`${metrics.lap} + ${(metrics.pathProgress * 100).toFixed(0)}%`}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-white/10 border-t pt-2 font-mono text-[10px]">
          <BlendMetric color="bg-sky-400" label="Idle" value={metrics.blend.idle} />
          <BlendMetric color="bg-amber-400" label="Walk" value={metrics.blend.walk} />
          <BlendMetric color="bg-fuchsia-400" label="Run" value={metrics.blend.run} />
        </div>
        <p className="mt-2 font-mono text-[10px] text-slate-500">
          Root [{metrics.rootPosition.map((value) => value.toFixed(2)).join(', ')}] · bounds [
          {metrics.boundsSize.map((value) => value.toFixed(2)).join(', ')}]
        </p>
      </section>

      <div className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-white/12 bg-slate-950/75 px-3 py-1.5 font-mono text-[10px] text-slate-300 backdrop-blur md:block">
        cyan tangent · green up · magenta clip-root Δ · yellow camera target
      </div>
    </main>
  )
}

function OrbotDebugScene({
  actorRootRef,
  controls,
  onAssetReport,
  onMetrics,
  onVisualRoot,
  resetRevision,
  runtimeRef,
  visualRoot,
}: {
  actorRootRef: { current: THREE.Group | null }
  controls: DebugControls
  onAssetReport: (report: AssetReport) => void
  onMetrics: (metrics: DebugMetrics) => void
  onVisualRoot: (root: THREE.Object3D | null) => void
  resetRevision: number
  runtimeRef: { current: DebugRuntime }
  visualRoot: THREE.Object3D | null
}) {
  const proceduralReport = useMemo<AssetReport>(
    () => ({
      ...INITIAL_ASSET_REPORT,
      error: null,
      state: 'procedural',
    }),
    [],
  )

  return (
    <>
      <RendererConfiguration noPostBaseline={controls.noPostBaseline} />
      <OrbotDebugCamera controls={controls} runtimeRef={runtimeRef} />
      <color args={[controls.noPostBaseline ? '#091018' : '#172332']} attach="background" />
      {controls.noPostBaseline ? null : <fog args={['#172332', 18, 46]} attach="fog" />}
      <ambientLight intensity={controls.noPostBaseline ? 1.75 : 0.72} />
      <hemisphereLight args={['#dff7ff', '#23351f', controls.noPostBaseline ? 1.25 : 0.7]} />
      <directionalLight
        castShadow={!controls.noPostBaseline}
        intensity={controls.noPostBaseline ? 2.2 : 3.4}
        position={[7, 13, 8]}
      />
      <GroundTrack noPostBaseline={controls.noPostBaseline} showPath={controls.showPath} />
      <MotionDriver
        actorRootRef={actorRootRef}
        controls={controls}
        onMetrics={onMetrics}
        resetRevision={resetRevision}
        runtimeRef={runtimeRef}
      />
      <group ref={actorRootRef}>
        {controls.forceProcedural ? (
          <ProceduralOrbot
            noPostBaseline={controls.noPostBaseline}
            onAssetReport={onAssetReport}
            onVisualRoot={onVisualRoot}
            report={proceduralReport}
            runtimeRef={runtimeRef}
          />
        ) : (
          <OrbotAssetErrorBoundary
            fallback={(error) => (
              <ProceduralOrbot
                noPostBaseline={controls.noPostBaseline}
                onAssetReport={onAssetReport}
                onVisualRoot={onVisualRoot}
                report={{
                  ...proceduralReport,
                  error: describeError(error),
                  state: 'error',
                }}
                runtimeRef={runtimeRef}
              />
            )}
            resetKey={resetRevision}
          >
            <Suspense
              fallback={
                <ProceduralOrbot
                  noPostBaseline={controls.noPostBaseline}
                  onAssetReport={onAssetReport}
                  onVisualRoot={onVisualRoot}
                  report={INITIAL_ASSET_REPORT}
                  runtimeRef={runtimeRef}
                />
              }
            >
              <LoadedOrbot
                controls={controls}
                onAssetReport={onAssetReport}
                onVisualRoot={onVisualRoot}
                resetRevision={resetRevision}
                runtimeRef={runtimeRef}
              />
            </Suspense>
          </OrbotAssetErrorBoundary>
        )}
      </group>
      <ActorDiagnostics
        actorRootRef={actorRootRef}
        runtimeRef={runtimeRef}
        showBounds={controls.showBounds}
        showSkeleton={controls.showSkeleton}
        showVectors={controls.showVectors}
        visualRoot={visualRoot}
      />
      <RootTrace runtimeRef={runtimeRef} visible={controls.showRootTrace} />
      <PathTargetMarker rootMotionMode={controls.rootMotionMode} runtimeRef={runtimeRef} />
      <CameraTargetDiagnostics
        controls={controls}
        runtimeRef={runtimeRef}
        visible={controls.showVectors}
      />
    </>
  )
}

function RendererConfiguration({ noPostBaseline }: { noPostBaseline: boolean }) {
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure
    const previousShadows = gl.shadowMap.enabled
    gl.toneMapping = noPostBaseline ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = noPostBaseline ? 1 : 1.05
    gl.shadowMap.enabled = !noPostBaseline
    gl.shadowMap.type = THREE.PCFShadowMap
    return () => {
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
      gl.shadowMap.enabled = previousShadows
    }
  }, [gl, noPostBaseline])

  return null
}

function OrbotDebugCamera({
  controls,
  runtimeRef,
}: {
  controls: DebugControls
  runtimeRef: { current: DebugRuntime }
}) {
  const canvasCamera = useThree((state) => state.camera)
  const initialCameraRef = useRef(canvasCamera)
  const set = useThree((state) => state.set)
  const size = useThree((state) => state.size)
  const perspectiveCamera = useMemo(() => new THREE.PerspectiveCamera(), [])
  const orthographicCamera = useMemo(() => new THREE.OrthographicCamera(), [])
  const followedTarget = useMemo(() => new THREE.Vector3(), [])
  const desiredTarget = useMemo(() => new THREE.Vector3(), [])
  const targetOffset = useMemo(
    () => new THREE.Vector3(...controls.targetOffset),
    [controls.targetOffset],
  )
  const cameraOffset = useMemo(() => {
    const azimuth = THREE.MathUtils.degToRad(controls.azimuth)
    const elevation = THREE.MathUtils.degToRad(controls.elevation)
    const distance = 18 / Math.max(0.1, controls.zoom)
    const horizontalDistance = Math.cos(elevation) * distance
    return new THREE.Vector3(
      Math.sin(azimuth) * horizontalDistance,
      Math.sin(elevation) * distance,
      Math.cos(azimuth) * horizontalDistance,
    )
  }, [controls.azimuth, controls.elevation, controls.zoom])

  useLayoutEffect(() => {
    const aspect = Math.max(0.1, size.width / Math.max(1, size.height))
    const selectedCamera =
      controls.projection === 'orthographic' ? orthographicCamera : perspectiveCamera
    followedTarget.copy(runtimeRef.current.actorPosition).add(targetOffset)
    selectedCamera.position.copy(followedTarget).add(cameraOffset)
    selectedCamera.up.set(0, 1, 0)
    selectedCamera.lookAt(followedTarget)

    if (selectedCamera instanceof THREE.PerspectiveCamera) {
      selectedCamera.aspect = aspect
      selectedCamera.fov = 38
      selectedCamera.near = 0.05
      selectedCamera.far = 90
      selectedCamera.zoom = 1
    } else {
      const halfHeight = 6.4
      selectedCamera.left = -halfHeight * aspect
      selectedCamera.right = halfHeight * aspect
      selectedCamera.top = halfHeight
      selectedCamera.bottom = -halfHeight
      selectedCamera.near = 0.05
      selectedCamera.far = 90
      selectedCamera.zoom = controls.zoom
    }
    selectedCamera.updateProjectionMatrix()
    selectedCamera.updateMatrixWorld(true)
    set({ camera: selectedCamera })
  }, [
    cameraOffset,
    controls.projection,
    controls.zoom,
    followedTarget,
    orthographicCamera,
    perspectiveCamera,
    runtimeRef,
    set,
    size.height,
    size.width,
    targetOffset,
  ])

  useFrame((_, delta) => {
    const selectedCamera =
      controls.projection === 'orthographic' ? orthographicCamera : perspectiveCamera
    desiredTarget.copy(runtimeRef.current.actorPosition).add(targetOffset)
    followedTarget.lerp(desiredTarget, 1 - Math.exp(-12 * Math.min(0.05, Math.max(0, delta))))
    selectedCamera.position.copy(followedTarget).add(cameraOffset)
    selectedCamera.lookAt(followedTarget)
    selectedCamera.updateMatrixWorld()
  }, -2.5)

  useEffect(
    () => () => {
      set({ camera: initialCameraRef.current })
    },
    [set],
  )

  return null
}

function MotionDriver({
  actorRootRef,
  controls,
  onMetrics,
  resetRevision,
  runtimeRef,
}: {
  actorRootRef: { current: THREE.Group | null }
  controls: DebugControls
  onMetrics: (metrics: DebugMetrics) => void
  resetRevision: number
  runtimeRef: { current: DebugRuntime }
}) {
  useFrame((state, delta) => {
    const runtime = runtimeRef.current
    const frameDelta = Math.min(0.05, Math.max(0, delta))

    if (runtime.lastResetRevision !== resetRevision) {
      runtime.lastResetRevision = resetRevision
      runtime.seed = controls.seed
      runtime.elapsed = 0
      runtime.distance = 0
      runtime.blend = { idle: 1, run: 0, walk: 0 }
      runtime.trace.length = 0
      runtime.clipRootOffset.set(0, 0, 0)
      runtime.frameIntervalMs = frameDelta * 1000
    }

    const scaledDelta = controls.paused ? 0 : frameDelta * controls.timeScale
    if (scaledDelta > 0) {
      runtime.elapsed += scaledDelta
      runtime.distance += controls.speed * scaledDelta
      runtime.blend = advanceOrbotAnimationDebugBlend(
        runtime.blend,
        resolveOrbotAnimationDebugBlendTargets(controls.gait, controls.speed),
        ORBOT_BLEND_RESPONSE,
        scaledDelta,
      )
    }

    const trackSample = sampleOrbotAnimationDebugTrack(runtime.distance, runtime.seed)
    runtime.pathPosition.fromArray(trackSample.position)
    runtime.tangent.fromArray(trackSample.tangent)
    runtime.heading = trackSample.heading
    runtime.lap = trackSample.lap
    runtime.pathProgress = trackSample.progress
    runtime.velocity
      .copy(runtime.tangent)
      .multiplyScalar(controls.paused ? 0 : controls.speed * controls.timeScale)

    if (controls.rootMotionMode === 'path') {
      runtime.actorPosition.copy(runtime.pathPosition)
    } else {
      runtime.actorPosition.set(0, 0, 0)
    }

    const actorRoot = actorRootRef.current
    if (actorRoot) {
      actorRoot.position.copy(runtime.actorPosition)
      actorRoot.rotation.set(0, controls.rootMotionMode === 'path' ? runtime.heading : 0, 0)
    }

    const lastTracePoint = runtime.trace.at(-1)
    if (
      !lastTracePoint ||
      lastTracePoint.distanceToSquared(runtime.pathPosition) >=
        ORBOT_TRACE_POINT_SPACING * ORBOT_TRACE_POINT_SPACING
    ) {
      runtime.trace.push(runtime.pathPosition.clone())
      if (runtime.trace.length > ORBOT_TRACE_POINT_LIMIT) runtime.trace.shift()
    }

    const frameIntervalMs = frameDelta * 1000
    runtime.frameIntervalMs +=
      (frameIntervalMs - runtime.frameIntervalMs) *
      (1 - Math.exp(-4 * Math.max(frameDelta, 0.0001)))

    const now = performance.now()
    if (now - runtime.lastMetricsAt < 120) return
    runtime.lastMetricsAt = now
    const renderer = state.gl
    const rendererInfo = renderer.info
    const backend = (renderer as THREE.WebGLRenderer & { isWebGPURenderer?: boolean })
      .isWebGPURenderer
      ? 'webgpu'
      : 'webgl'

    onMetrics({
      backend,
      blend: { ...runtime.blend },
      boundsSize: vectorToRoundedTuple(runtime.boundsSize),
      clipRootOffset: vectorToRoundedTuple(runtime.clipRootOffset),
      distance: runtime.distance,
      dpr: renderer.getPixelRatio(),
      drawCalls: rendererInfo.render.calls,
      elapsed: runtime.elapsed,
      fps: runtime.frameIntervalMs > 0 ? 1000 / runtime.frameIntervalMs : 0,
      frameIntervalMs: runtime.frameIntervalMs,
      geometries: rendererInfo.memory.geometries,
      gpuFrameMs: null,
      lap: runtime.lap,
      lines: rendererInfo.render.lines,
      pathProgress: runtime.pathProgress,
      points: rendererInfo.render.points,
      postPasses: 0,
      renderTargets: controls.noPostBaseline ? 0 : 1,
      rootPosition: vectorToRoundedTuple(runtime.actorPosition),
      textures: rendererInfo.memory.textures,
      triangles: rendererInfo.render.triangles,
      viewport: [state.size.width, state.size.height],
    })
  }, -3)

  return null
}

function LoadedOrbot({
  controls,
  onAssetReport,
  onVisualRoot,
  resetRevision,
  runtimeRef,
}: {
  controls: DebugControls
  onAssetReport: (report: AssetReport) => void
  onVisualRoot: (root: THREE.Object3D | null) => void
  resetRevision: number
  runtimeRef: { current: DebugRuntime }
}) {
  const gltf = useGLTF(ORBOT_ASSET_PATH)
  const clonedScene = useMemo(() => cloneSkeleton(gltf.scene) as THREE.Group, [gltf.scene])
  const modelTransform = useMemo(() => computeOrbotModelTransform(clonedScene), [clonedScene])
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene])
  const selectedClips = useMemo(
    () => ({
      idle: selectPreferredClip(gltf.animations, ORBOT_IDLE_CLIP_NAMES),
      run: selectPreferredClip(gltf.animations, ORBOT_RUN_CLIP_NAMES),
      walk: selectPreferredClip(gltf.animations, ORBOT_WALK_CLIP_NAMES),
    }),
    [gltf.animations],
  )
  const actions = useMemo(
    () => ({
      idle: selectedClips.idle ? mixer.clipAction(selectedClips.idle) : null,
      run: selectedClips.run ? mixer.clipAction(selectedClips.run) : null,
      walk: selectedClips.walk ? mixer.clipAction(selectedClips.walk) : null,
    }),
    [mixer, selectedClips],
  )
  const restPose = useMemo(() => captureBoneRestPose(clonedScene), [clonedScene])
  const resetRevisionRef = useRef(-1)

  useEffect(() => {
    const actionSet = new Set(Object.values(actions).filter(isAnimationAction))
    for (const action of actionSet) {
      action.enabled = true
      action.clampWhenFinished = false
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY)
      action.reset()
      action.play()
    }
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  useEffect(() => {
    let boneCount = 0
    let meshCount = 0
    clonedScene.traverse((child) => {
      if ((child as THREE.Bone).isBone) boneCount += 1
      if ((child as THREE.Mesh).isMesh) {
        meshCount += 1
        const mesh = child as THREE.Mesh
        mesh.castShadow = !controls.noPostBaseline
        mesh.receiveShadow = !controls.noPostBaseline
        mesh.frustumCulled = false
      }
    })
    onAssetReport({
      assetPath: ORBOT_ASSET_PATH,
      boneCount,
      clipCount: gltf.animations.length,
      error: null,
      meshCount,
      selectedClips: {
        idle: selectedClips.idle?.name ?? null,
        run: selectedClips.run?.name ?? null,
        walk: selectedClips.walk?.name ?? null,
      },
      state: 'loaded',
    })
  }, [clonedScene, controls.noPostBaseline, gltf.animations.length, onAssetReport, selectedClips])

  useEffect(() => {
    onVisualRoot(clonedScene)
    return () => onVisualRoot(null)
  }, [clonedScene, onVisualRoot])

  useFrame((_, delta) => {
    const runtime = runtimeRef.current
    if (resetRevisionRef.current !== resetRevision) {
      resetRevisionRef.current = resetRevision
      for (const action of Object.values(actions)) {
        action?.reset().play()
      }
      mixer.setTime(0)
      restoreBoneRestPose(restPose)
    }

    setActionState(actions.idle, runtime.blend.idle, ORBOT_IDLE_TIME_SCALE)
    setActionState(actions.walk, runtime.blend.walk, ORBOT_WALK_TIME_SCALE)
    setActionState(actions.run, runtime.blend.run, resolveRunTimeScale(controls.speed))
    mixer.update(controls.paused ? 0 : Math.min(0.05, delta) * controls.timeScale)
    applyProceduralClipFallback({
      actions,
      restPose,
      runtime,
      seed: runtime.seed,
    })

    const hips = restPose.byName.get('hips')
    const hipsRest = hips ? restPose.byBone.get(hips) : null
    if (hips && hipsRest) {
      runtime.clipRootOffset
        .copy(hips.position)
        .sub(hipsRest.position)
        .multiplyScalar(modelTransform.scale * 0.01)
    } else {
      runtime.clipRootOffset.set(0, 0, 0)
    }
  }, -2)

  return (
    <group scale={modelTransform.scale}>
      <primitive object={clonedScene} position={modelTransform.offset} />
    </group>
  )
}

function ProceduralOrbot({
  noPostBaseline,
  onAssetReport,
  onVisualRoot,
  report,
  runtimeRef,
}: {
  noPostBaseline: boolean
  onAssetReport: (report: AssetReport) => void
  onVisualRoot: (root: THREE.Object3D | null) => void
  report: AssetReport
  runtimeRef: { current: DebugRuntime }
}) {
  const rootRef = useRef<THREE.Group | null>(null)
  const bodyRef = useRef<THREE.Group | null>(null)
  const leftArmRef = useRef<THREE.Group | null>(null)
  const rightArmRef = useRef<THREE.Group | null>(null)
  const leftLegRef = useRef<THREE.Group | null>(null)
  const rightLegRef = useRef<THREE.Group | null>(null)

  useEffect(() => {
    onAssetReport(report)
  }, [onAssetReport, report])

  useEffect(() => {
    onVisualRoot(rootRef.current)
    return () => onVisualRoot(null)
  }, [onVisualRoot])

  useFrame(() => {
    const runtime = runtimeRef.current
    const phase = seededOrbotAnimationDebugPhase(runtime.seed)
    const walkSwing = Math.sin(runtime.elapsed * Math.PI * 2 + phase)
    const runSwing = Math.sin(runtime.elapsed * Math.PI * 3.2 + phase)
    const swing = walkSwing * runtime.blend.walk * 0.58 + runSwing * runtime.blend.run * 0.92
    const idleBreath = Math.sin(runtime.elapsed * 1.45 + phase) * runtime.blend.idle
    if (bodyRef.current) {
      bodyRef.current.position.y = 0.95 + idleBreath * 0.018 + Math.abs(swing) * 0.025
      bodyRef.current.rotation.z = swing * 0.035
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = swing
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing
    if (leftArmRef.current) leftArmRef.current.rotation.x = -swing * 0.72
    if (rightArmRef.current) rightArmRef.current.rotation.x = swing * 0.72
    runtime.clipRootOffset.set(0, idleBreath * 0.018, 0)
  }, -2)

  const castShadow = !noPostBaseline
  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        <mesh castShadow={castShadow} position={[0, 0.18, 0]} receiveShadow={castShadow}>
          <boxGeometry args={[0.54, 0.82, 0.34]} />
          <meshStandardMaterial color="#e3edf0" metalness={0.18} roughness={0.58} />
        </mesh>
        <mesh castShadow={castShadow} position={[0, 0.78, 0]}>
          <sphereGeometry args={[0.3, 18, 12]} />
          <meshStandardMaterial color="#f3f7f7" metalness={0.12} roughness={0.48} />
        </mesh>
        <mesh position={[-0.1, 0.82, 0.27]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshBasicMaterial color="#34d7ff" toneMapped={false} />
        </mesh>
        <mesh position={[0.1, 0.82, 0.27]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshBasicMaterial color="#34d7ff" toneMapped={false} />
        </mesh>
        <group position={[-0.37, 0.42, 0]} ref={leftArmRef}>
          <mesh castShadow={castShadow} position={[0, -0.31, 0]}>
            <boxGeometry args={[0.16, 0.62, 0.18]} />
            <meshStandardMaterial color="#91a5ad" metalness={0.28} roughness={0.62} />
          </mesh>
        </group>
        <group position={[0.37, 0.42, 0]} ref={rightArmRef}>
          <mesh castShadow={castShadow} position={[0, -0.31, 0]}>
            <boxGeometry args={[0.16, 0.62, 0.18]} />
            <meshStandardMaterial color="#91a5ad" metalness={0.28} roughness={0.62} />
          </mesh>
        </group>
      </group>
      <group position={[-0.17, 0.57, 0]} ref={leftLegRef}>
        <mesh castShadow={castShadow} position={[0, -0.48, 0]}>
          <boxGeometry args={[0.2, 0.72, 0.22]} />
          <meshStandardMaterial color="#7f949e" metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh castShadow={castShadow} position={[0, -0.82, 0.08]}>
          <boxGeometry args={[0.25, 0.12, 0.42]} />
          <meshStandardMaterial color="#26343d" metalness={0.18} roughness={0.72} />
        </mesh>
      </group>
      <group position={[0.17, 0.57, 0]} ref={rightLegRef}>
        <mesh castShadow={castShadow} position={[0, -0.48, 0]}>
          <boxGeometry args={[0.2, 0.72, 0.22]} />
          <meshStandardMaterial color="#7f949e" metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh castShadow={castShadow} position={[0, -0.82, 0.08]}>
          <boxGeometry args={[0.25, 0.12, 0.42]} />
          <meshStandardMaterial color="#26343d" metalness={0.18} roughness={0.72} />
        </mesh>
      </group>
    </group>
  )
}

function GroundTrack({ noPostBaseline, showPath }: { noPostBaseline: boolean; showPath: boolean }) {
  const trackGeometry = useMemo(() => createTrackRibbonGeometry(1.25, 192, 0.012), [])
  const centerLineGeometry = useMemo(() => createTrackRibbonGeometry(0.045, 192, 0.025), [])

  useEffect(
    () => () => {
      trackGeometry.dispose()
      centerLineGeometry.dispose()
    },
    [centerLineGeometry, trackGeometry],
  )

  return (
    <group>
      <mesh position={[0, -0.035, 0]} receiveShadow={!noPostBaseline} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[24, 15]} />
        <meshStandardMaterial color="#1a2925" roughness={0.96} />
      </mesh>
      <gridHelper args={[24, 24, '#32453f', '#21322e']} position={[0, -0.024, 0]} />
      <mesh geometry={trackGeometry} receiveShadow={!noPostBaseline}>
        <meshStandardMaterial color="#26323a" metalness={0.08} roughness={0.9} />
      </mesh>
      {showPath ? (
        <mesh geometry={centerLineGeometry}>
          <meshBasicMaterial color="#5ee9ff" toneMapped={false} />
        </mesh>
      ) : null}
      <mesh position={[0, 0.025, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.55, 0.61, 48]} />
        <meshBasicMaterial color="#36505b" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function ActorDiagnostics({
  actorRootRef,
  runtimeRef,
  showBounds,
  showSkeleton,
  showVectors,
  visualRoot,
}: {
  actorRootRef: { current: THREE.Group | null }
  runtimeRef: { current: DebugRuntime }
  showBounds: boolean
  showSkeleton: boolean
  showVectors: boolean
  visualRoot: THREE.Object3D | null
}) {
  const bounds = useMemo(() => new THREE.Box3(), [])
  const boundsHelper = useMemo(() => new THREE.Box3Helper(bounds, '#ffba55'), [bounds])
  const tangentArrow = useMemo(
    () => new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, '#49dcff'),
    [],
  )
  const upArrow = useMemo(
    () => new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, '#72f59a'),
    [],
  )
  const clipRootArrow = useMemo(
    () => new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, '#ff55e6'),
    [],
  )
  const skeletonHelper = useMemo(() => {
    if (!visualRoot) return null
    const helper = new THREE.SkeletonHelper(visualRoot)
    const material = helper.material as THREE.LineBasicMaterial
    material.color.set('#66f6ff')
    material.depthTest = false
    material.transparent = true
    material.opacity = 0.86
    helper.renderOrder = 30
    return helper
  }, [visualRoot])
  const scratchVector = useMemo(() => new THREE.Vector3(), [])
  const frameRef = useRef(0)

  useLayoutEffect(() => {
    if (!visualRoot) return
    visualRoot.updateWorldMatrix(true, true)
    bounds.setFromObject(visualRoot, true)
    if (!bounds.isEmpty()) bounds.getSize(runtimeRef.current.boundsSize)
  }, [bounds, runtimeRef, visualRoot])

  useEffect(
    () => () => {
      disposeHelper(boundsHelper)
      disposeHelper(tangentArrow)
      disposeHelper(upArrow)
      disposeHelper(clipRootArrow)
      if (skeletonHelper) disposeHelper(skeletonHelper)
    },
    [boundsHelper, clipRootArrow, skeletonHelper, tangentArrow, upArrow],
  )

  useFrame(() => {
    const runtime = runtimeRef.current
    const actorRoot = actorRootRef.current
    frameRef.current += 1

    if (visualRoot && frameRef.current % 6 === 0) {
      visualRoot.updateWorldMatrix(true, true)
      bounds.setFromObject(visualRoot, true)
      if (!bounds.isEmpty()) bounds.getSize(runtime.boundsSize)
    }

    if (actorRoot) {
      actorRoot.getWorldPosition(scratchVector)
      tangentArrow.position.copy(scratchVector).addScaledVector(THREE.Object3D.DEFAULT_UP, 0.1)
      tangentArrow.setDirection(runtime.tangent)
      tangentArrow.setLength(Math.max(0.75, runtime.velocity.length() * 0.35), 0.18, 0.1)
      upArrow.position.copy(scratchVector)
      upArrow.setDirection(THREE.Object3D.DEFAULT_UP)
      upArrow.setLength(1.15, 0.18, 0.1)

      scratchVector.copy(runtime.clipRootOffset).applyQuaternion(actorRoot.quaternion)
      const clipRootLength = scratchVector.length()
      clipRootArrow.position
        .copy(actorRoot.position)
        .addScaledVector(THREE.Object3D.DEFAULT_UP, 0.05)
      clipRootArrow.visible = clipRootLength > 0.001
      if (clipRootLength > 0.001) {
        clipRootArrow.setDirection(scratchVector.normalize())
        clipRootArrow.setLength(Math.max(0.25, clipRootLength), 0.14, 0.08)
      }
    }

    skeletonHelper?.updateMatrixWorld(true)
  }, -1)

  return (
    <>
      {showBounds && visualRoot ? <primitive object={boundsHelper} /> : null}
      {showSkeleton && skeletonHelper ? <primitive object={skeletonHelper} /> : null}
      {showVectors ? (
        <>
          <primitive object={tangentArrow} />
          <primitive object={upArrow} />
          <primitive object={clipRootArrow} />
        </>
      ) : null}
    </>
  )
}

function RootTrace({
  runtimeRef,
  visible,
}: {
  runtimeRef: { current: DebugRuntime }
  visible: boolean
}) {
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(ORBOT_TRACE_POINT_LIMIT * 3), 3),
    )
    nextGeometry.setDrawRange(0, 0)
    return nextGeometry
  }, [])
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#f472ff',
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  )
  const line = useMemo(() => {
    const nextLine = new THREE.Line(geometry, material)
    nextLine.frustumCulled = false
    nextLine.renderOrder = 20
    return nextLine
  }, [geometry, material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(() => {
    if (!visible) return
    const points = runtimeRef.current.trace
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const count = Math.min(points.length, ORBOT_TRACE_POINT_LIMIT)
    for (let index = 0; index < count; index += 1) {
      const point = points[index]
      if (!point) continue
      position.setXYZ(index, point.x, point.y + 0.07, point.z)
    }
    position.needsUpdate = true
    geometry.setDrawRange(0, count)
  })

  return visible ? <primitive object={line} /> : null
}

function PathTargetMarker({
  rootMotionMode,
  runtimeRef,
}: {
  rootMotionMode: RootMotionMode
  runtimeRef: { current: DebugRuntime }
}) {
  const markerRef = useRef<THREE.Mesh | null>(null)
  useFrame(() => {
    if (!markerRef.current) return
    markerRef.current.position.copy(runtimeRef.current.pathPosition)
    markerRef.current.position.y += 0.08
  })
  if (rootMotionMode !== 'in-place') return null
  return (
    <mesh ref={markerRef}>
      <sphereGeometry args={[0.12, 12, 8]} />
      <meshBasicMaterial color="#f472ff" toneMapped={false} />
    </mesh>
  )
}

function CameraTargetDiagnostics({
  controls,
  runtimeRef,
  visible,
}: {
  controls: DebugControls
  runtimeRef: { current: DebugRuntime }
  visible: boolean
}) {
  const groupRef = useRef<THREE.Group | null>(null)
  const targetOffset = useMemo(
    () => new THREE.Vector3(...controls.targetOffset),
    [controls.targetOffset],
  )

  useFrame(() => {
    if (!groupRef.current) return
    groupRef.current.position.copy(runtimeRef.current.actorPosition).add(targetOffset)
  }, -2.4)

  return visible ? (
    <group ref={groupRef}>
      <axesHelper args={[0.65]} />
      <mesh>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color="#ffe66d" depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  ) : null
}

class OrbotAssetErrorBoundary extends Component<
  {
    children: ReactNode
    fallback: (error: Error) => ReactNode
    resetKey: number
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  componentDidUpdate(previousProps: Readonly<{ resetKey: number }>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children
  }
}

type BoneRestPose = {
  byBone: Map<THREE.Bone, { position: THREE.Vector3; quaternion: THREE.Quaternion }>
  byName: Map<string, THREE.Bone>
}

function captureBoneRestPose(root: THREE.Object3D): BoneRestPose {
  const byBone: BoneRestPose['byBone'] = new Map()
  const byName: BoneRestPose['byName'] = new Map()
  root.traverse((child) => {
    const bone = child as THREE.Bone
    if (!bone.isBone) return
    byBone.set(bone, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    })
    byName.set(bone.name.toLowerCase(), bone)
  })
  return { byBone, byName }
}

function restoreBoneRestPose(restPose: BoneRestPose) {
  for (const [bone, transform] of restPose.byBone) {
    bone.position.copy(transform.position)
    bone.quaternion.copy(transform.quaternion)
  }
}

function applyProceduralClipFallback({
  actions,
  restPose,
  runtime,
  seed,
}: {
  actions: Record<'idle' | 'run' | 'walk', THREE.AnimationAction | null>
  restPose: BoneRestPose
  runtime: DebugRuntime
  seed: number
}) {
  const proceduralIdle = actions.idle ? 0 : runtime.blend.idle
  const proceduralWalk = actions.walk ? 0 : runtime.blend.walk
  const proceduralRun = actions.run ? 0 : runtime.blend.run
  const proceduralWeight = proceduralIdle + proceduralWalk + proceduralRun
  if (proceduralWeight <= 0.0001) return

  const realWeight =
    (actions.idle ? runtime.blend.idle : 0) +
    (actions.walk ? runtime.blend.walk : 0) +
    (actions.run ? runtime.blend.run : 0)
  if (realWeight <= 0.0001) restoreBoneRestPose(restPose)

  const phase = seededOrbotAnimationDebugPhase(seed)
  const walkSwing = Math.sin(runtime.elapsed * Math.PI * 2 + phase)
  const runSwing = Math.sin(runtime.elapsed * Math.PI * 3.2 + phase)
  const swing = walkSwing * proceduralWalk * 0.58 + runSwing * proceduralRun * 0.92
  const idleBreath = Math.sin(runtime.elapsed * 1.45 + phase) * proceduralIdle
  rotateBoneX(restPose, 'leftupleg', swing)
  rotateBoneX(restPose, 'rightupleg', -swing)
  rotateBoneX(restPose, 'leftleg', Math.max(0, -swing) * 0.65)
  rotateBoneX(restPose, 'rightleg', Math.max(0, swing) * 0.65)
  rotateBoneX(restPose, 'leftarm', -swing * 0.72)
  rotateBoneX(restPose, 'rightarm', swing * 0.72)
  rotateBoneX(restPose, 'spine02', idleBreath * 0.025 - Math.abs(swing) * 0.035)
  rotateBoneX(restPose, 'head', -idleBreath * 0.018)
}

function rotateBoneX(restPose: BoneRestPose, name: string, angle: number) {
  restPose.byName.get(name)?.rotateX(angle)
}

function selectPreferredClip(
  clips: readonly THREE.AnimationClip[],
  preferredNames: readonly string[],
) {
  for (const name of preferredNames) {
    const clip = clips.find((candidate) => candidate.name === name)
    if (clip) return clip
  }
  return null
}

function setActionState(action: THREE.AnimationAction | null, weight: number, timeScale: number) {
  if (!action) return
  action.enabled = true
  action.paused = false
  if (!action.isRunning()) action.play()
  action.setEffectiveWeight(THREE.MathUtils.clamp(weight, 0, 1))
  action.setEffectiveTimeScale(timeScale)
}

function resolveRunTimeScale(speed: number) {
  return THREE.MathUtils.clamp(
    speed / 7.7,
    ORBOT_RUN_TIME_SCALE_RANGE[0],
    ORBOT_RUN_TIME_SCALE_RANGE[1],
  )
}

function isAnimationAction(action: THREE.AnimationAction | null): action is THREE.AnimationAction {
  return action !== null
}

function computeOrbotModelTransform(root: THREE.Group) {
  const bounds = computeOrbotStaticSceneBounds(root)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = Number.isFinite(size.y) && size.y > 0 ? ORBOT_TARGET_HEIGHT / size.y : 1
  const visualScale = scale * ORBOT_GLB_VISUAL_SCALE
  return {
    offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    scale: visualScale,
  }
}

function computeOrbotStaticSceneBounds(root: THREE.Group) {
  const bounds = new THREE.Box3()
  const meshBounds = new THREE.Box3()
  root.updateWorldMatrix(true, true)
  root.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry
    if (!geometry) return
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    if (!geometry.boundingBox) return
    meshBounds.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld)
    bounds.union(meshBounds)
  })
  return bounds.isEmpty() ? new THREE.Box3().setFromObject(root) : bounds
}

function createTrackRibbonGeometry(width: number, segments: number, y: number) {
  const vertices = new Float32Array((segments + 1) * 2 * 3)
  const indices: number[] = []
  for (let index = 0; index <= segments; index += 1) {
    const distance = (index / segments) * ORBOT_ANIMATION_DEBUG_TRACK_LENGTH
    const sample = sampleOrbotAnimationDebugTrack(distance, 0)
    const sideX = -sample.tangent[2]
    const sideZ = sample.tangent[0]
    const vertexOffset = index * 6
    vertices[vertexOffset] = sample.position[0] + sideX * width * 0.5
    vertices[vertexOffset + 1] = y
    vertices[vertexOffset + 2] = sample.position[2] + sideZ * width * 0.5
    vertices[vertexOffset + 3] = sample.position[0] - sideX * width * 0.5
    vertices[vertexOffset + 4] = y
    vertices[vertexOffset + 5] = sample.position[2] - sideZ * width * 0.5
    if (index === segments) continue
    const left = index * 2
    indices.push(left, left + 2, left + 1, left + 2, left + 3, left + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function createDebugRuntime(): DebugRuntime {
  return {
    actorPosition: new THREE.Vector3(),
    blend: { idle: 1, run: 0, walk: 0 },
    boundsSize: new THREE.Vector3(),
    clipRootOffset: new THREE.Vector3(),
    distance: 0,
    elapsed: 0,
    frameIntervalMs: 16.67,
    heading: 0,
    lap: 0,
    lastMetricsAt: 0,
    lastResetRevision: -1,
    pathPosition: new THREE.Vector3(),
    pathProgress: 0,
    seed: DEFAULT_CONTROLS.seed,
    tangent: new THREE.Vector3(0, 0, 1),
    trace: [],
    velocity: new THREE.Vector3(),
  }
}

function disposeHelper(helper: THREE.Object3D) {
  helper.traverse((child) => {
    const object = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry
      material?: THREE.Material | THREE.Material[]
    }
    object.geometry?.dispose()
    if (Array.isArray(object.material)) {
      for (const material of object.material) material.dispose()
    } else {
      object.material?.dispose()
    }
  })
}

function vectorToRoundedTuple(vector: THREE.Vector3): [number, number, number] {
  return [roundMetric(vector.x), roundMetric(vector.y), roundMetric(vector.z)]
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'The Orbot GLB could not be loaded.'
}

function ControlSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3 border-white/10 border-b px-4 py-3 last:border-b-0">
      <h2 className="font-semibold text-[11px] text-slate-500 uppercase tracking-[0.18em]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  suffix: string
  value: number
}) {
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="flex items-center justify-between gap-3">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-200">
          {value.toFixed(step < 0.1 ? 2 : 1)} {suffix}
        </span>
      </span>
      <input
        className="h-1.5 w-full cursor-pointer accent-cyan-400"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

function ToggleControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-slate-300 text-xs">
      <input
        checked={checked}
        className="accent-cyan-400"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  )
}

function ClipStatus({ label, name }: { label: string; name: string | null }) {
  return (
    <div className="rounded-md border border-current/15 px-2 py-1.5">
      <span className="block opacity-55">{label}</span>
      <span className="mt-0.5 block truncate">{name ?? 'procedural'}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <span className="block text-slate-600">{label}</span>
      <span className="mt-0.5 block truncate text-slate-200">{value}</span>
    </div>
  )
}

function BlendMetric({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-slate-400">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
      </div>
    </div>
  )
}
