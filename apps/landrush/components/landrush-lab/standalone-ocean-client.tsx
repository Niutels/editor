'use client'

import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, type RootState, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, type Mesh, SphereGeometry, Vector3 } from 'three'
import * as THREE from 'three/webgpu'
import { measureLandrushFrameSlice } from './frame-load-profiler'
import {
  createStandaloneOceanDiskGeometry,
  type StandaloneOceanDiskGeometryMetrics,
} from './standalone-ocean-geometry'
import {
  createDefaultStandaloneOceanParameters,
  createStandaloneOceanMaterials,
  STANDALONE_OCEAN_SPECTRAL_MODE_COUNT,
  type StandaloneOceanDebugMode,
  type StandaloneOceanParameters,
} from './standalone-ocean-material'
import { StandaloneOceanParameterControls } from './standalone-ocean-parameter-controls'
import type { WaterlineInteractionField } from './waterline-interaction-field'

export type StandaloneOceanQuality = 'balanced' | 'high' | 'performance'
export type StandaloneOceanCameraPreset = 'aerial' | 'design' | 'waterline'

type StandaloneOceanDebugState = {
  animated: boolean
  backend: 'webgl' | 'webgpu'
  cameraPreset: StandaloneOceanCameraPreset
  debugMode: StandaloneOceanDebugMode
  elevation: number
  frameIntervalMs: number
  gpuFrameMs: null
  interactionField: {
    maximumDistanceMeters: number
    resolution: number
    segmentCount: number
  } | null
  parameters: StandaloneOceanParameters
  quality: StandaloneOceanQuality
  rendering: {
    analyticWaveCount: number
    detailRadialSegments: number
    diskRadius: number
    horizonRadialSegments: number
    oceanDrawCalls: number
    postProcessRenderTargets: number
    skyDrawCalls: number
    triangleCount: number
  }
  seed: number
  timeSeconds: number
}

declare global {
  interface Window {
    __STANDALONE_OCEAN_DEBUG__?: StandaloneOceanDebugState
  }
}

export const STANDALONE_OCEAN_DETAIL_RADIUS = 600
export const STANDALONE_OCEAN_HORIZON_RADIUS = 1800

const STANDALONE_OCEAN_SKY_RADIUS = 950
const STANDALONE_OCEAN_SKY_FAR_PLANE_RATIO = 0.8
// Pass-through structures keep depth ownership, so transparent water must composite first.
const STANDALONE_OCEAN_TRANSPARENT_RENDER_ORDER = -10

export const STANDALONE_OCEAN_QUALITY = {
  balanced: { dpr: [1, 1.35] as [number, number], segments: 192 },
  high: { dpr: [1, 1.7] as [number, number], segments: 256 },
  performance: { dpr: [1, 1] as [number, number], segments: 128 },
} as const

export const STANDALONE_OCEAN_CAMERAS = {
  aerial: {
    fov: 38,
    position: [-84, 110, 150] as [number, number, number],
    target: [0, 0, -20] as [number, number, number],
  },
  design: {
    fov: 42,
    position: [52, 42, 72] as [number, number, number],
    target: [0, 0, -35] as [number, number, number],
  },
  waterline: {
    fov: 50,
    position: [0, 8.5, 32] as [number, number, number],
    target: [0, 1, -52] as [number, number, number],
  },
} as const

const STANDALONE_OCEAN_RENDERER_CACHE = new WeakMap<
  HTMLCanvasElement,
  Promise<THREE.WebGPURenderer>
>()

export function createStandaloneOceanRenderer(props: { canvas?: HTMLCanvasElement }) {
  const canvas = props.canvas
  const cached = canvas ? STANDALONE_OCEAN_RENDERER_CACHE.get(canvas) : undefined
  if (cached) return cached

  const promise = (async () => {
    const renderer = new THREE.WebGPURenderer({
      ...props,
      alpha: false,
      antialias: true,
      outputBufferType: THREE.UnsignedByteType,
      powerPreference: 'high-performance',
    } as never)
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    await renderer.init()
    return renderer
  })()

  if (canvas) STANDALONE_OCEAN_RENDERER_CACHE.set(canvas, promise)
  return promise
}

export function StandaloneOceanClient() {
  const [parameters, setParameters] = useState(createDefaultStandaloneOceanParameters)
  const [debugMode, setDebugMode] = useState<StandaloneOceanDebugMode>('final')
  const [quality, setQuality] = useState<StandaloneOceanQuality>('balanced')
  const [cameraPreset, setCameraPreset] = useState<StandaloneOceanCameraPreset>('design')
  const [animated, setAnimated] = useState(true)
  const [resetRevision, setResetRevision] = useState(0)
  const qualitySettings = STANDALONE_OCEAN_QUALITY[quality]

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#2e82c4]">
      <Canvas
        className="h-full w-full"
        dpr={qualitySettings.dpr}
        frameloop="always"
        gl={createStandaloneOceanRenderer as never}
        shadows={false}
      >
        <StandaloneOceanCamera preset={cameraPreset} />
        <StandaloneOceanWorld
          animated={animated}
          cameraPreset={cameraPreset}
          debugMode={debugMode}
          parameters={parameters}
          quality={quality}
          resetRevision={resetRevision}
        />
      </Canvas>

      <aside className="absolute top-4 left-4 z-10 flex max-h-[calc(100vh-2rem)] w-[310px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#061225]/92 text-slate-100 shadow-2xl backdrop-blur-xl">
        <header className="border-white/10 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[11px] text-cyan-200 tracking-[0.2em]">
                STANDALONE OCEAN
              </p>
              <p className="mt-1 text-slate-300 text-xs">
                Sparse stochastic spectrum, Ocean-style foam and analytic glare.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-cyan-300/12 px-2 py-1 font-mono text-[9px] text-cyan-100">
              1 draw · 0 RT
            </span>
          </div>
        </header>

        <div className="overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-3 gap-1.5">
            {(['waterline', 'design', 'aerial'] as const).map((preset) => (
              <button
                className={
                  cameraPreset === preset
                    ? 'rounded-lg bg-cyan-300 px-2 py-2 font-semibold text-[10px] text-slate-950 uppercase'
                    : 'rounded-lg border border-white/10 bg-white/5 px-2 py-2 font-semibold text-[10px] text-slate-200 uppercase hover:bg-white/10'
                }
                key={preset}
                onClick={() => setCameraPreset(preset)}
                type="button"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
              onClick={() => setResetRevision((revision) => revision + 1)}
              type="button"
            >
              Reset time
            </button>
            <button
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
              onClick={() =>
                setParameters((current) => ({
                  ...current,
                  seed: (current.seed + 31) % 129,
                }))
              }
              type="button"
            >
              Next seed
            </button>
          </div>

          <label className="mt-3 block text-[10px] text-slate-400 uppercase tracking-wide">
            View
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d1b31] px-2 py-2 text-xs text-white"
              onChange={(event) => setDebugMode(event.target.value as StandaloneOceanDebugMode)}
              value={debugMode}
            >
              <option value="final">Final</option>
              <option value="no-glare">No glare baseline</option>
              <option value="displacement">XYZ displacement</option>
              <option value="normals">Spectral normals</option>
              <option value="compression">Compression / crest</option>
              <option value="foam">Ocean foam ramps</option>
              <option value="glints">Moving glints</option>
              <option value="glare">Glare contribution</option>
              <option value="fresnel">Fresnel</option>
              <option value="reflection">Sky reflection</option>
            </select>
          </label>

          <label className="mt-3 block text-[10px] text-slate-400 uppercase tracking-wide">
            Quality
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d1b31] px-2 py-2 text-xs text-white"
              onChange={(event) => setQuality(event.target.value as StandaloneOceanQuality)}
              value={quality}
            >
              <option value="performance">Performance · 128²</option>
              <option value="balanced">Balanced · 192²</option>
              <option value="high">High · 256²</option>
            </select>
          </label>

          <StandaloneOceanParameterControls
            animated={animated}
            onAnimatedChange={setAnimated}
            onParametersChange={setParameters}
            parameters={parameters}
            showRobotPassthrough={false}
          />

          <button
            className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
            onClick={() => {
              setParameters(createDefaultStandaloneOceanParameters())
              setDebugMode('final')
              setQuality('balanced')
              setCameraPreset('design')
              setAnimated(true)
              setResetRevision((revision) => revision + 1)
            }}
            type="button"
          >
            Reset all defaults
          </button>
        </div>
      </aside>
    </main>
  )
}

export function StandaloneOceanCamera({ preset }: { preset: StandaloneOceanCameraPreset }) {
  const camera = STANDALONE_OCEAN_CAMERAS[preset]
  const controlsTarget = useMemo(() => new Vector3(...camera.target), [camera.target])

  return (
    <>
      <PerspectiveCamera
        far={2200}
        fov={camera.fov}
        key={`camera-${preset}`}
        makeDefault
        near={0.1}
        position={camera.position}
      />
      <StandaloneOceanCameraTarget key={`target-${preset}`} target={camera.target} />
      <OrbitControls
        dampingFactor={0.065}
        enableDamping
        enablePan={false}
        key={`controls-${preset}`}
        makeDefault
        maxDistance={320}
        maxPolarAngle={Math.PI / 2 - 0.015}
        minDistance={5}
        minPolarAngle={0.08}
        target={controlsTarget}
      />
    </>
  )
}

function StandaloneOceanCameraTarget({ target }: { target: [number, number, number] }) {
  const { camera } = useThree()

  useEffect(() => {
    camera.lookAt(new Vector3(...target))
    camera.updateProjectionMatrix()
  }, [camera, target])

  return null
}

export function StandaloneOceanWorld({
  animated,
  cameraPreset,
  debugMode,
  elevation = 0,
  parameters,
  profileMeasure,
  quality,
  resetRevision,
  submergedRockRefraction = false,
  waterlineInteractionField = null,
}: {
  animated: boolean
  cameraPreset: StandaloneOceanCameraPreset
  debugMode: StandaloneOceanDebugMode
  elevation?: number
  parameters: StandaloneOceanParameters
  profileMeasure?: <T>(id: string, callback: () => T) => T
  quality: StandaloneOceanQuality
  resetRevision: number
  submergedRockRefraction?: boolean
  waterlineInteractionField?: WaterlineInteractionField | null
}) {
  const qualitySettings = STANDALONE_OCEAN_QUALITY[quality]
  const diskGeometry = useMemo(
    () =>
      createStandaloneOceanDiskGeometry({
        detailRadialSegments: qualitySettings.segments / 2,
        detailRadius: STANDALONE_OCEAN_DETAIL_RADIUS,
        horizonAngularSegments: qualitySettings.segments,
        horizonRadialSegments: Math.ceil(qualitySettings.segments / 6),
        outerRadius: STANDALONE_OCEAN_HORIZON_RADIUS,
      }),
    [qualitySettings.segments],
  )
  const diskMetrics = diskGeometry.userData
    .standaloneOceanDisk as StandaloneOceanDiskGeometryMetrics
  const skyGeometry = useMemo(() => new SphereGeometry(STANDALONE_OCEAN_SKY_RADIUS, 32, 18), [])
  const parametersRef = useRef(parameters)
  parametersRef.current = parameters
  const submergedRockRefractionActive = submergedRockRefraction && parameters.underwaterRocksEnabled
  const materials = useMemo(() => {
    const build = () =>
      createStandaloneOceanMaterials(
        parametersRef.current,
        debugMode,
        {
          detailRadius: STANDALONE_OCEAN_DETAIL_RADIUS,
          outerRadius: STANDALONE_OCEAN_HORIZON_RADIUS,
          vertexSpacing: STANDALONE_OCEAN_DETAIL_RADIUS / Math.max(1, qualitySettings.segments / 2),
        },
        waterlineInteractionField,
        submergedRockRefractionActive,
      )
    return profileMeasure ? profileMeasure('setup.ocean.materials', build) : build()
  }, [
    debugMode,
    profileMeasure,
    qualitySettings.segments,
    submergedRockRefractionActive,
    waterlineInteractionField,
  ])
  const timeRef = useRef(0)
  const resetRevisionRef = useRef(resetRevision)
  const frameIntervalRef = useRef(16.7)
  const skyRef = useRef<Mesh>(null)
  const setDpr = useThree((state) => state.setDpr)
  const renderer = useThree((state) => state.gl) as unknown as {
    getPixelRatio?: () => number
    info?: { render?: { calls?: number; triangles?: number } }
    isWebGPURenderer?: boolean
    toneMapping: number
    toneMappingExposure: number
  }

  useEffect(() => {
    const previousDpr = renderer.getPixelRatio?.() ?? 1
    const [minimumDpr, maximumDpr] = qualitySettings.dpr
    const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
    setDpr(Math.min(maximumDpr, Math.max(minimumDpr, deviceDpr)))
    return () => setDpr(previousDpr)
  }, [qualitySettings.dpr, renderer, setDpr])
  useEffect(() => {
    const previousToneMapping = renderer.toneMapping
    const previousExposure = renderer.toneMappingExposure
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    return () => {
      renderer.toneMapping = previousToneMapping
      renderer.toneMappingExposure = previousExposure
    }
  }, [renderer])
  useEffect(() => materials.setParameters(parameters), [materials, parameters])
  useEffect(() => {
    if (resetRevisionRef.current !== resetRevision) {
      resetRevisionRef.current = resetRevision
      timeRef.current = 0
    }
    materials.time.value = timeRef.current
  }, [materials, resetRevision])
  useEffect(() => () => materials.dispose(), [materials])
  useEffect(() => () => diskGeometry.dispose(), [diskGeometry])
  useEffect(() => () => skyGeometry.dispose(), [skyGeometry])

  function runOceanFrame(state: RootState, delta: number) {
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    if (animated) timeRef.current += Math.min(delta, 0.05)
    materials.time.value = timeRef.current
    frameIntervalRef.current += (delta * 1000 - frameIntervalRef.current) * 0.08
    if (skyRef.current) {
      const skyRadius = Math.min(
        STANDALONE_OCEAN_SKY_RADIUS,
        state.camera.far * STANDALONE_OCEAN_SKY_FAR_PLANE_RATIO,
      )
      skyRef.current.position.copy(state.camera.position)
      skyRef.current.scale.setScalar(skyRadius / STANDALONE_OCEAN_SKY_RADIUS)
    }

    window.__STANDALONE_OCEAN_DEBUG__ = {
      animated,
      backend: renderer.isWebGPURenderer ? 'webgpu' : 'webgl',
      cameraPreset,
      debugMode,
      elevation,
      frameIntervalMs: Number(frameIntervalRef.current.toFixed(2)),
      gpuFrameMs: null,
      interactionField: waterlineInteractionField
        ? {
            maximumDistanceMeters: waterlineInteractionField.maximumDistanceMeters,
            resolution: waterlineInteractionField.resolution,
            segmentCount: waterlineInteractionField.segmentCount,
          }
        : null,
      parameters: { ...parameters },
      quality,
      rendering: {
        analyticWaveCount: STANDALONE_OCEAN_SPECTRAL_MODE_COUNT,
        detailRadialSegments: diskMetrics.detailRadialSegments,
        diskRadius: diskMetrics.outerRadius,
        horizonRadialSegments: diskMetrics.horizonRadialSegments,
        oceanDrawCalls: 1,
        postProcessRenderTargets: 0,
        skyDrawCalls: 1,
        triangleCount: diskMetrics.triangleCount,
      },
      seed: parameters.seed,
      timeSeconds: timeRef.current,
    }
  }

  useFrame((state, delta) => {
    measureLandrushFrameSlice('scene.ocean.frame-update', () => {
      runOceanFrame(state, delta)
    })
  })

  return (
    <>
      <mesh
        frustumCulled={false}
        geometry={diskGeometry}
        position={[0, elevation, 0]}
        renderOrder={submergedRockRefractionActive ? STANDALONE_OCEAN_TRANSPARENT_RENDER_ORDER : 0}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <primitive attach="material" object={materials.surface} />
      </mesh>
      <mesh ref={skyRef} frustumCulled={false} geometry={skyGeometry} renderOrder={-20}>
        <primitive attach="material" object={materials.sky} />
      </mesh>
    </>
  )
}
