'use client'

import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, type RootState, useFrame, useThree } from '@react-three/fiber'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
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
  type StandaloneOceanWaveBandParameters,
} from './standalone-ocean-material'
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

const STANDALONE_OCEAN_EFFECT_TOGGLES = [
  { key: 'wavesEnabled', label: 'Waves' },
  { key: 'choppinessEnabled', label: 'Chop' },
  { key: 'foamEnabled', label: 'Foam' },
  { key: 'toonEnabled', label: 'Toon' },
  { key: 'reflectionEnabled', label: 'Reflect' },
  { key: 'fresnelEnabled', label: 'Fresnel' },
  { key: 'glintsEnabled', label: 'Glints' },
  { key: 'hazeEnabled', label: 'Haze' },
  { key: 'glareEnabled', label: 'Glare' },
  { key: 'skyEnabled', label: 'Sky' },
] as const

const STANDALONE_OCEAN_WAVE_BAND_LABELS = [
  'Primary swell',
  'Cross swell',
  'Mid waves',
  'Short waves',
  'Ripples',
  'Micro waves',
] as const

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

  function setParameter<Key extends keyof StandaloneOceanParameters>(
    key: Key,
    value: StandaloneOceanParameters[Key],
  ) {
    setParameters((current) => ({ ...current, [key]: value }))
  }

  function setWaveBandParameter<Key extends keyof StandaloneOceanWaveBandParameters>(
    index: number,
    key: Key,
    value: StandaloneOceanWaveBandParameters[Key],
  ) {
    setParameters((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [key]: value } : band,
      ),
    }))
  }

  function setAllWaveBandsEnabled(enabled: boolean) {
    setParameters((current) => ({
      ...current,
      waveBands: current.waveBands.map((band) => ({ ...band, enabled })),
    }))
  }

  function soloWaveBand(index: number) {
    setParameters((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) => ({
        ...band,
        enabled: bandIndex === index,
      })),
    }))
  }

  function resetWaveBand(index: number) {
    const defaultBand = createDefaultStandaloneOceanParameters().waveBands[index]
    if (!defaultBand) return
    setParameters((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) =>
        bandIndex === index ? defaultBand : band,
      ),
    }))
  }

  function resetAllWaveBands() {
    setParameters((current) => ({
      ...current,
      waveBands: createDefaultStandaloneOceanParameters().waveBands,
    }))
  }

  function setAllEffects(enabled: boolean) {
    setAnimated(enabled)
    setParameters((current) => ({
      ...current,
      choppinessEnabled: enabled,
      foamEnabled: enabled,
      fresnelEnabled: enabled,
      glareEnabled: enabled,
      glintsEnabled: enabled,
      hazeEnabled: enabled,
      reflectionEnabled: enabled,
      skyEnabled: enabled,
      toonEnabled: enabled,
      wavesEnabled: enabled,
    }))
  }

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

        <section className="border-white/10 border-b bg-[#08172a] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[9px] text-cyan-100 uppercase tracking-[0.16em]">
              Effects
            </span>
            <div className="flex gap-1">
              <button
                className="rounded border border-cyan-200/30 bg-cyan-300/10 px-2 py-1 font-semibold text-[8px] text-cyan-100 uppercase hover:bg-cyan-300/20"
                onClick={() => setAllEffects(true)}
                type="button"
              >
                All on
              </button>
              <button
                className="rounded border border-white/10 bg-white/5 px-2 py-1 font-semibold text-[8px] text-slate-300 uppercase hover:bg-white/10"
                onClick={() => setAllEffects(false)}
                type="button"
              >
                All off
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <OceanEffectToggle
              enabled={animated}
              label="Motion"
              onClick={() => setAnimated((current) => !current)}
            />
            {STANDALONE_OCEAN_EFFECT_TOGGLES.map((effect) => (
              <OceanEffectToggle
                enabled={parameters[effect.key]}
                key={effect.key}
                label={effect.label}
                onClick={() => setParameter(effect.key, !parameters[effect.key])}
              />
            ))}
          </div>
        </section>

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
              onClick={() => setParameter('seed', (parameters.seed + 31) % 129)}
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

          <OceanControlSection label="Global wave shape">
            <OceanSlider
              label="Amplitude"
              max={8}
              min={0}
              onChange={(value) => setParameter('oceanWaveScale', value)}
              step={0.01}
              value={parameters.oceanWaveScale}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(2)}×`}
              label="Frequency"
              max={4}
              min={0.25}
              onChange={(value) => setParameter('oceanFrequencyScale', value)}
              step={0.01}
              value={parameters.oceanFrequencyScale}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(2)} m`}
              label="Smallest wave"
              max={4}
              min={0.35}
              onChange={(value) => setParameter('oceanSmallestWave', value)}
              step={0.01}
              value={parameters.oceanSmallestWave}
            />
            <OceanSlider
              label="Choppiness"
              max={2}
              min={0}
              onChange={(value) => setParameter('oceanChoppiness', value)}
              step={0.001}
              value={parameters.oceanChoppiness}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(2)}×`}
              label="Spectral spread"
              max={1.5}
              min={0}
              onChange={(value) => setParameter('oceanSpectrumSpread', value)}
              step={0.01}
              value={parameters.oceanSpectrumSpread}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(2)}×`}
              label="Crest curvature"
              max={1.5}
              min={0}
              onChange={(value) => setParameter('oceanCrestCurvature', value)}
              step={0.01}
              value={parameters.oceanCrestCurvature}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(2)}×`}
              label="Micro-surface detail"
              max={1.2}
              min={0}
              onChange={(value) => setParameter('oceanDetailStrength', value)}
              step={0.01}
              value={parameters.oceanDetailStrength}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(1)} m/s`}
              label="Wind velocity"
              max={35}
              min={1}
              onChange={(value) => setParameter('oceanWindVelocity', value)}
              step={0.1}
              value={parameters.oceanWindVelocity}
            />
            <OceanSlider
              label="Alignment"
              max={1}
              min={0}
              onChange={(value) => setParameter('oceanAlignment', value)}
              step={0.001}
              value={parameters.oceanAlignment}
            />
            <OceanSlider
              format={(value) => `${Math.round(value)}°`}
              label="Direction"
              max={360}
              min={0}
              onChange={(value) => setParameter('oceanDirectionDegrees', value)}
              step={1}
              value={parameters.oceanDirectionDegrees}
            />
            <OceanSlider
              label="Damping"
              max={1}
              min={0}
              onChange={(value) => setParameter('oceanDamping', value)}
              step={0.001}
              value={parameters.oceanDamping}
            />
            <OceanSlider
              format={(value) => `${value.toFixed(2)}×`}
              label="Global animation speed"
              max={1.5}
              min={0}
              onChange={(value) => setParameter('oceanTimeScale', value)}
              step={0.01}
              value={parameters.oceanTimeScale}
            />
            <OceanSlider
              format={(value) => `${Math.round(value)}`}
              label="Seed"
              max={128}
              min={0}
              onChange={(value) => setParameter('seed', Math.round(value))}
              step={1}
              value={parameters.seed}
            />
          </OceanControlSection>

          <OceanControlSection label="Spectral bands · 6" open>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                className="rounded-md border border-cyan-200/20 bg-cyan-300/10 px-2 py-1.5 font-semibold text-[8px] text-cyan-100 uppercase hover:bg-cyan-300/20"
                onClick={() => setAllWaveBandsEnabled(true)}
                type="button"
              >
                All bands on
              </button>
              <button
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] text-slate-300 uppercase hover:bg-white/10"
                onClick={() => setAllWaveBandsEnabled(false)}
                type="button"
              >
                All bands off
              </button>
              <button
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] text-slate-300 uppercase hover:bg-white/10"
                onClick={resetAllWaveBands}
                type="button"
              >
                Reset bands
              </button>
            </div>
            {parameters.waveBands.map((band, index) => (
              <OceanWaveBandControls
                band={band}
                index={index}
                key={STANDALONE_OCEAN_WAVE_BAND_LABELS[index] ?? index}
                label={STANDALONE_OCEAN_WAVE_BAND_LABELS[index] ?? `Wave ${index + 1}`}
                onChange={(key, value) => setWaveBandParameter(index, key, value)}
                onReset={() => resetWaveBand(index)}
                onSolo={() => soloWaveBand(index)}
                open={index === 0}
              />
            ))}
          </OceanControlSection>

          <OceanControlSection label="Foam shader" open>
            <OceanSlider
              label="Coverage"
              max={1}
              min={0}
              onChange={(value) => setParameter('waveFoamCoverage', value)}
              step={0.01}
              value={parameters.waveFoamCoverage}
            />
            <OceanSlider
              format={percent}
              label="Foam opacity"
              max={1}
              min={0}
              onChange={(value) => setParameter('waveFoamOpacity', value)}
              step={0.01}
              value={parameters.waveFoamOpacity}
            />
            <OceanSlider
              label="Blue ramp position"
              max={0.9}
              min={0.05}
              onChange={(value) => setParameter('foamColorRampPosition', value)}
              step={0.001}
              value={parameters.foamColorRampPosition}
            />
            <OceanSlider
              label="White ramp position"
              max={0.9}
              min={0.05}
              onChange={(value) => setParameter('foamWhiteRampPosition', value)}
              step={0.001}
              value={parameters.foamWhiteRampPosition}
            />
            <OceanSlider
              label="Emission"
              max={24}
              min={0}
              onChange={(value) => setParameter('foamEmissionStrength', value)}
              step={0.1}
              value={parameters.foamEmissionStrength}
            />
            <OceanColorControl
              label="Ocean A"
              onChange={(value) => setParameter('oceanColorA', value)}
              value={parameters.oceanColorA}
            />
            <OceanColorControl
              label="Ocean B"
              onChange={(value) => setParameter('oceanColorB', value)}
              value={parameters.oceanColorB}
            />
            <OceanColorControl
              label="Foam"
              onChange={(value) => setParameter('foamColor', value)}
              value={parameters.foamColor}
            />
          </OceanControlSection>

          <OceanControlSection label="Optics & glare" open>
            <OceanSlider
              format={percent}
              label="Reflection"
              max={1}
              min={0}
              onChange={(value) => setParameter('reflectionStrength', value)}
              step={0.01}
              value={parameters.reflectionStrength}
            />
            <OceanSlider
              format={percent}
              label="Moving glints"
              max={1.5}
              min={0}
              onChange={(value) => setParameter('glintStrength', value)}
              step={0.01}
              value={parameters.glintStrength}
            />
            <OceanSlider
              format={percent}
              label="Horizon haze"
              max={1}
              min={0}
              onChange={(value) => setParameter('horizonHaze', value)}
              step={0.01}
              value={parameters.horizonHaze}
            />
            <OceanSlider
              label="Glare strength"
              max={2}
              min={0}
              onChange={(value) => setParameter('glareStrength', value)}
              step={0.001}
              value={parameters.glareStrength}
            />
            <OceanSlider
              label="Glare saturation"
              max={1}
              min={0}
              onChange={(value) => setParameter('glareSaturation', value)}
              step={0.01}
              value={parameters.glareSaturation}
            />
            <OceanSlider
              label="Glare size"
              max={1}
              min={0}
              onChange={(value) => setParameter('glareSize', value)}
              step={0.01}
              value={parameters.glareSize}
            />
            <OceanColorControl
              label="Deep water"
              onChange={(value) => setParameter('deepColor', value)}
              value={parameters.deepColor}
            />
            <OceanColorControl
              label="Shallow water"
              onChange={(value) => setParameter('shallowColor', value)}
              value={parameters.shallowColor}
            />
            <OceanColorControl
              label="Glare tint"
              onChange={(value) => setParameter('glareTint', value)}
              value={parameters.glareTint}
            />
          </OceanControlSection>

          <OceanControlSection label="Sky">
            <OceanSlider
              format={(value) => `${Math.round(value)}°`}
              label="Sun azimuth"
              max={180}
              min={-180}
              onChange={(value) => setParameter('sunAzimuthDegrees', value)}
              step={1}
              value={parameters.sunAzimuthDegrees}
            />
            <OceanSlider
              format={(value) => `${Math.round(value)}°`}
              label="Sun elevation"
              max={85}
              min={3}
              onChange={(value) => setParameter('sunElevationDegrees', value)}
              step={1}
              value={parameters.sunElevationDegrees}
            />
            <OceanColorControl
              label="Horizon"
              onChange={(value) => setParameter('skyHorizonColor', value)}
              value={parameters.skyHorizonColor}
            />
            <OceanColorControl
              label="Zenith"
              onChange={(value) => setParameter('skyZenithColor', value)}
              value={parameters.skyZenithColor}
            />
          </OceanControlSection>

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

function OceanEffectToggle({
  enabled,
  label,
  onClick,
}: {
  enabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={enabled}
      className={
        enabled
          ? 'rounded-md border border-cyan-100/70 bg-cyan-300 px-1 py-1.5 text-slate-950 shadow-[0_0_14px_rgba(103,232,249,0.16)]'
          : 'rounded-md border border-white/10 bg-white/[0.035] px-1 py-1.5 text-slate-400 hover:bg-white/[0.07]'
      }
      onClick={onClick}
      title={`${label}: ${enabled ? 'on' : 'off'}`}
      type="button"
    >
      <span className="block font-semibold text-[8px] uppercase leading-none tracking-[0.05em]">
        {label}
      </span>
      <span className="mt-1 block font-mono text-[7px] leading-none">{enabled ? 'ON' : 'OFF'}</span>
    </button>
  )
}

function OceanWaveBandControls({
  band,
  index,
  label,
  onChange,
  onReset,
  onSolo,
  open,
}: {
  band: StandaloneOceanWaveBandParameters
  index: number
  label: string
  onChange: <Key extends keyof StandaloneOceanWaveBandParameters>(
    key: Key,
    value: StandaloneOceanWaveBandParameters[Key],
  ) => void
  onReset: () => void
  onSolo: () => void
  open: boolean
}) {
  return (
    <details className="rounded-lg border border-white/10 bg-[#071426]/70 px-2.5 py-2" open={open}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold text-[9px] text-slate-200 uppercase tracking-[0.08em]">
        <span className="flex items-center gap-2">
          <span
            className={
              band.enabled
                ? 'h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]'
                : 'h-1.5 w-1.5 rounded-full bg-slate-600'
            }
          />
          {index + 1}. {label}
        </span>
        <span className="font-mono text-[7px] text-slate-500">
          {band.enabled ? 'ACTIVE' : 'OFF'}
        </span>
      </summary>
      <div className="mt-2 space-y-2.5 border-white/10 border-t pt-2">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            className={
              band.enabled
                ? 'rounded-md border border-cyan-100/50 bg-cyan-300 px-2 py-1.5 font-semibold text-[8px] text-slate-950 uppercase'
                : 'rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] text-slate-400 uppercase hover:bg-white/10'
            }
            onClick={() => onChange('enabled', !band.enabled)}
            type="button"
          >
            {band.enabled ? 'Band on' : 'Band off'}
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] text-slate-300 uppercase hover:bg-white/10"
            onClick={onSolo}
            type="button"
          >
            Solo
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] text-slate-300 uppercase hover:bg-white/10"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
        </div>
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Band speed"
          max={3}
          min={0}
          onChange={(value) => onChange('speed', value)}
          step={0.01}
          value={band.speed}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Amplitude"
          max={3}
          min={0}
          onChange={(value) => onChange('amplitude', value)}
          step={0.01}
          value={band.amplitude}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Frequency"
          max={4}
          min={0.25}
          onChange={(value) => onChange('frequency', value)}
          step={0.01}
          value={band.frequency}
        />
        <OceanSlider
          format={(value) => value.toFixed(2)}
          label="Peak shape"
          max={4}
          min={1}
          onChange={(value) => onChange('shape', value)}
          step={0.01}
          value={band.shape}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Horizontal chop"
          max={2.5}
          min={0}
          onChange={(value) => onChange('choppiness', value)}
          step={0.01}
          value={band.choppiness}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Direction trim"
          max={180}
          min={-180}
          onChange={(value) => onChange('directionOffsetDegrees', value)}
          step={1}
          value={band.directionOffsetDegrees}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Phase"
          max={180}
          min={-180}
          onChange={(value) => onChange('phaseDegrees', value)}
          step={1}
          value={band.phaseDegrees}
        />
      </div>
    </details>
  )
}

function OceanControlSection({
  children,
  label,
  open = false,
}: {
  children: ReactNode
  label: string
  open?: boolean
}) {
  return (
    <details
      className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
      open={open}
    >
      <summary className="cursor-pointer font-semibold text-[10px] text-cyan-100 uppercase tracking-[0.12em]">
        {label}
      </summary>
      <div className="mt-2 space-y-2.5">{children}</div>
    </details>
  )
}

function OceanSlider({
  format = (value) => value.toFixed(3),
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  format?: (value: number) => string
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-100">{format(value)}</span>
      </span>
      <input
        className="mt-1 block w-full accent-cyan-300"
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

function OceanColorControl({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[10px] text-slate-300">
      <span>{label}</span>
      <span className="flex items-center gap-2 font-mono text-[9px] text-slate-400">
        {value}
        <input
          className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value}
        />
      </span>
    </label>
  )
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}
