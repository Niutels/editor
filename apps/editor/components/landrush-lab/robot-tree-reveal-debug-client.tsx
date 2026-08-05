'use client'

import { LandrushWorldNode as LandrushWorldNodeSchema } from '@pascal-app/core'
import { LandrushRobot } from '@pascal-app/nodes/landrush-world/robot'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  type CSSProperties,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Camera,
  DataTexture,
  RenderTarget,
  RGBAFormat,
  type Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { LandrushTree } from '@/components/landrush/types'
import { BrunoTreeLayer, type BrunoTreeReference } from './bruno-tree-layers'
import { DEFAULT_GRASS_BLADE_TUNING } from './grass-material'
import { sampleLandrushRobotScreenRevealRadialOpacity } from './robot-screen-reveal-curve'
import {
  clearLandrushRobotScreenRevealMask,
  updateLandrushRobotScreenRevealMask,
  updateLandrushRobotScreenRevealSmoothness,
} from './robot-screen-reveal-mask'
import { createStandaloneOceanRenderer } from './standalone-ocean-client'

declare global {
  interface Window {
    __LANDRUSH_ROBOT_TREE_REVEAL_DEBUG__?: {
      controls: RevealControls
      latest: RevealMeasurement | null
      measure: () => void
    }
  }
}

type MaskCaptureMode = 'clear-tree' | 'full-tree' | 'transition'

type RevealControls = {
  innerRadiusPx: number
  outerRadiusPx: number
  smoothnessPercent: number
}

type RevealProbe = {
  centerX: number
  centerY: number
  height: number
  robotNearDepth: number
  width: number
}

type RevealRenderContext = {
  camera: Camera
  renderer: WebGPURenderer
  scene: Scene
}

type RevealProfileBin = {
  count: number
  expectedOpacity: number
  observedOpacity: number
  radiusPx: number
}

type RevealMeasurement = {
  controls: RevealControls
  eligiblePixelCount: number
  largestJumpRadiusPx: number
  maxAbsoluteCurveError: number
  maxAbsoluteCurveErrorRadiusPx: number
  maxExpectedDeltaPerPixel: number
  maxObservedDeltaPerPixel: number
  profile: RevealProfileBin[]
  validRadiusBinCount: number
}

const VIEWPORT_WIDTH = 960
const VIEWPORT_HEIGHT = 720
const DEBUG_ROBOT_POSITION = new Vector3(0, 0.04, -1.45)
const DEBUG_ROBOT_SAMPLE_POSITION = new Vector3(0, 1.12, -1.45)
const DEFAULT_CONTROLS: RevealControls = {
  innerRadiusPx: 72,
  outerRadiusPx: 270,
  smoothnessPercent: 100,
}
const DEBUG_TREE: LandrushTree = {
  band: 'grass',
  canopyRadius: 2.65,
  id: 'robot-tree-reveal-debug-oak',
  kind: 'canopy',
  position: { x: 0, z: 0 },
  r3fPosition: [0, 0, 0],
  rotation: 0.42,
  trunkHeight: 4.8,
}
const DEBUG_TREE_REFERENCES: readonly BrunoTreeReference[] = [{ elevation: 0, tree: DEBUG_TREE }]
const DEBUG_TREE_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
}
const DEBUG_ROBOT_NODE = LandrushWorldNodeSchema.parse({
  id: 'landrush-world_robot-tree-reveal-debug',
  landrushMode: 'walk',
  playerHeading: Math.PI,
  playerMoving: false,
  playerPosition: [DEBUG_ROBOT_POSITION.x, DEBUG_ROBOT_POSITION.y, DEBUG_ROBOT_POSITION.z],
  playerSpeed: 0,
  playerStart: [DEBUG_ROBOT_POSITION.x, DEBUG_ROBOT_POSITION.y, DEBUG_ROBOT_POSITION.z],
  type: 'landrush-world',
})

export function RobotTreeRevealDebugClient() {
  const [controls, setControls] = useState(DEFAULT_CONTROLS)
  const [measurement, setMeasurement] = useState<RevealMeasurement | null>(null)
  const [probe, setProbe] = useState<RevealProbe | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [displayMode, setDisplayMode] = useState<MaskCaptureMode>('transition')
  const captureModeRef = useRef<MaskCaptureMode>('transition')
  const displayModeRef = useRef<MaskCaptureMode>('transition')
  const gpuCaptureInProgressRef = useRef(false)
  const measuringRef = useRef(false)
  const probeRef = useRef<RevealProbe | null>(null)
  const renderContextRef = useRef<RevealRenderContext | null>(null)
  const measurementRevisionRef = useRef(0)
  const colorTexture = useMemo(() => {
    const texture = new DataTexture(
      new Uint8Array([120, 158, 72, 255]),
      1,
      1,
      RGBAFormat,
      UnsignedByteType,
    )
    texture.needsUpdate = true
    return texture
  }, [])

  useEffect(() => () => colorTexture.dispose(), [colorTexture])

  useEffect(() => {
    updateLandrushRobotScreenRevealSmoothness(controls.smoothnessPercent)
  }, [controls.smoothnessPercent])

  useEffect(() => {
    displayModeRef.current = displayMode
    if (!measuringRef.current) captureModeRef.current = displayMode
  }, [displayMode])

  const measure = useCallback(async () => {
    const currentProbe = probeRef.current
    const renderContext = renderContextRef.current
    if (!currentProbe || !renderContext || measuringRef.current) return

    const revision = measurementRevisionRef.current + 1
    measurementRevisionRef.current = revision
    measuringRef.current = true
    gpuCaptureInProgressRef.current = true
    setMeasuring(true)
    try {
      captureModeRef.current = 'clear-tree'
      applyRevealMaskMode('clear-tree', currentProbe, controls)
      const clearTree = await captureRenderTargetPixels(renderContext, currentProbe)

      captureModeRef.current = 'full-tree'
      applyRevealMaskMode('full-tree', currentProbe, controls)
      const fullTree = await captureRenderTargetPixels(renderContext, currentProbe)

      captureModeRef.current = 'transition'
      applyRevealMaskMode('transition', currentProbe, controls)
      const transition = await captureRenderTargetPixels(renderContext, currentProbe)

      const nextMeasurement = measureRenderedReveal({
        clearTree,
        controls,
        fullTree,
        probe: currentProbe,
        transition,
      })
      if (measurementRevisionRef.current !== revision) return
      setMeasurement(nextMeasurement)
      logRenderedRevealMeasurement(nextMeasurement)
    } catch (error) {
      console.error('[robot-tree-reveal-debug] measurement failed', error)
    } finally {
      captureModeRef.current = displayModeRef.current
      applyRevealMaskMode(displayModeRef.current, currentProbe, controls)
      gpuCaptureInProgressRef.current = false
      measuringRef.current = false
      setMeasuring(false)
    }
  }, [controls])

  useEffect(() => {
    if (!sceneReady || !probe) return
    const timeout = window.setTimeout(() => void measure(), 800)
    return () => window.clearTimeout(timeout)
  }, [measure, probe, sceneReady])

  useEffect(() => {
    window.__LANDRUSH_ROBOT_TREE_REVEAL_DEBUG__ = {
      controls,
      latest: measurement,
      measure: () => void measure(),
    }
    return () => {
      delete window.__LANDRUSH_ROBOT_TREE_REVEAL_DEBUG__
    }
  }, [controls, measure, measurement])

  const setControl = useCallback((key: keyof RevealControls, value: number) => {
    setControls((current) => ({ ...current, [key]: value }))
  }, [])

  return (
    <main className="min-h-screen min-w-[1380px] overflow-auto bg-[#101317] text-white">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Final-pixel alpha diagnostic
          </div>
          <h1 className="mt-0.5 text-lg font-semibold">
            Actual island oak · actual robot · white field
          </h1>
        </div>
        <div className="font-mono text-xs text-white/55">
          960×720 · DPR 1 · WebGPU · fixed camera
        </div>
      </header>

      <div className="flex gap-5 p-5">
        <section>
          <div
            className="relative overflow-hidden bg-white shadow-2xl ring-1 ring-white/15"
            style={{ height: VIEWPORT_HEIGHT, width: VIEWPORT_WIDTH }}
          >
            <Canvas
              camera={{ far: 80, fov: 42, near: 0.1, position: [0, 2.7, 9.1] }}
              dpr={1}
              frameloop="always"
              gl={createStandaloneOceanRenderer as never}
              shadows={false}
            >
              <color args={['#ffffff']} attach="background" />
              <FixedCameraRenderer captureInProgressRef={gpuCaptureInProgressRef} />
              <ambientLight intensity={1.65} />
              <directionalLight intensity={2.2} position={[5, 9, 7]} />
              <Suspense fallback={null}>
                <BrunoTreeLayer
                  colorTexture={colorTexture}
                  fieldSize={20}
                  references={DEBUG_TREE_REFERENCES}
                  tuning={DEBUG_TREE_TUNING}
                />
                <LandrushRobot
                  animationPace={0.1}
                  node={DEBUG_ROBOT_NODE}
                  presentationMode="default"
                />
                <RevealMaskController
                  captureModeRef={captureModeRef}
                  controls={controls}
                  onRenderContext={(context) => {
                    renderContextRef.current = context
                  }}
                  onProbe={(nextProbe) => {
                    probeRef.current = nextProbe
                    setProbe((current) =>
                      current && revealProbesEqual(current, nextProbe) ? current : nextProbe,
                    )
                  }}
                  onReady={() => setSceneReady(true)}
                />
              </Suspense>
            </Canvas>
            <RevealGuides measurement={measurement} probe={probe} controls={controls} />
          </div>
          <div className="mt-2 flex items-center gap-5 font-mono text-[11px] text-white/55">
            <span>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-cyan-300" />
              inner: fully clear
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-300" />
              outer: fully tree
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500" />
              measured largest jump
            </span>
          </div>
        </section>

        <aside className="w-[370px] shrink-0 space-y-4">
          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
              Mask controls
            </h2>
            <div className="mt-4 space-y-5">
              <RangeControl
                label="Inner radius · fully clear"
                max={160}
                min={0}
                onChange={(value) => setControl('innerRadiusPx', value)}
                value={controls.innerRadiusPx}
              />
              <RangeControl
                label="Outer radius · no reveal"
                max={360}
                min={180}
                onChange={(value) => setControl('outerRadiusPx', value)}
                value={controls.outerRadiusPx}
              />
              <RangeControl
                label="Curve endpoint smoothing"
                max={100}
                min={0}
                onChange={(value) => setControl('smoothnessPercent', value)}
                suffix="%"
                value={controls.smoothnessPercent}
              />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg bg-black/25 p-1">
              {(['transition', 'clear-tree', 'full-tree'] as const).map((mode) => (
                <button
                  className={`rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                    displayMode === mode ? 'bg-white text-slate-950' : 'text-white/55'
                  }`}
                  disabled={measuring}
                  key={mode}
                  onClick={() => setDisplayMode(mode)}
                  type="button"
                >
                  {mode === 'transition'
                    ? 'Transition'
                    : mode === 'clear-tree'
                      ? 'Front clear'
                      : 'Tree full'}
                </button>
              ))}
            </div>
            <button
              className="mt-5 w-full rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              disabled={!sceneReady || measuring}
              onClick={() => void measure()}
              type="button"
            >
              {measuring
                ? 'Capturing clear / full / transition…'
                : 'Measure final pixels + console log'}
            </button>
          </section>

          <MeasurementPanel measurement={measurement} measuring={measuring} />
        </aside>
      </div>
    </main>
  )
}

function FixedCameraRenderer({
  captureInProgressRef,
}: {
  captureInProgressRef: { current: boolean }
}) {
  useFrame(({ camera, gl, scene }) => {
    camera.lookAt(0, 2.05, 0)
    camera.updateMatrixWorld(true)
    if (captureInProgressRef.current) return
    gl.setRenderTarget(null)
    gl.render(scene, camera)
  }, 1)

  return null
}

function RevealMaskController({
  captureModeRef,
  controls,
  onProbe,
  onReady,
  onRenderContext,
}: {
  captureModeRef: { current: MaskCaptureMode }
  controls: RevealControls
  onProbe: (probe: RevealProbe) => void
  onReady: () => void
  onRenderContext: (context: RevealRenderContext) => void
}) {
  const { camera, gl, scene } = useThree()
  const drawingBufferSize = useMemo(() => new Vector2(), [])
  const projectedRobot = useMemo(() => new Vector3(), [])
  const robotView = useMemo(() => new Vector3(), [])
  const readyRef = useRef(false)
  const previousProbeRef = useRef<RevealProbe | null>(null)

  useEffect(() => {
    onRenderContext({ camera, renderer: gl as unknown as WebGPURenderer, scene })
  }, [camera, gl, onRenderContext, scene])

  useFrame(() => {
    camera.updateMatrixWorld(true)
    gl.getDrawingBufferSize(drawingBufferSize)
    projectedRobot.copy(DEBUG_ROBOT_SAMPLE_POSITION).project(camera)
    robotView.copy(DEBUG_ROBOT_SAMPLE_POSITION).applyMatrix4(camera.matrixWorldInverse)
    const nextProbe: RevealProbe = {
      centerX: (projectedRobot.x * 0.5 + 0.5) * drawingBufferSize.x,
      centerY: (-projectedRobot.y * 0.5 + 0.5) * drawingBufferSize.y,
      height: drawingBufferSize.y,
      robotNearDepth: -robotView.z - 0.08,
      width: drawingBufferSize.x,
    }

    if (!previousProbeRef.current || !revealProbesEqual(previousProbeRef.current, nextProbe)) {
      previousProbeRef.current = nextProbe
      onProbe(nextProbe)
    }

    applyRevealMaskMode(captureModeRef.current, nextProbe, controls)

    if (!readyRef.current) {
      readyRef.current = true
      onReady()
    }
  })

  useEffect(() => () => clearLandrushRobotScreenRevealMask(), [])
  return null
}

function applyRevealMaskMode(mode: MaskCaptureMode, probe: RevealProbe, controls: RevealControls) {
  if (mode === 'full-tree') {
    clearLandrushRobotScreenRevealMask()
    return
  }
  const clearRadius = Math.hypot(probe.width, probe.height) * 2
  updateLandrushRobotScreenRevealMask({
    ...probe,
    innerRadius: mode === 'clear-tree' ? clearRadius : controls.innerRadiusPx,
    outerRadius: mode === 'clear-tree' ? clearRadius + 1 : controls.outerRadiusPx,
  })
}

function RevealGuides({
  controls,
  measurement,
  probe,
}: {
  controls: RevealControls
  measurement: RevealMeasurement | null
  probe: RevealProbe | null
}) {
  if (!probe) return null
  return (
    <div className="pointer-events-none absolute inset-0">
      <CircleGuide color="#67e8f9" probe={probe} radius={controls.innerRadiusPx} />
      <CircleGuide color="#fcd34d" probe={probe} radius={controls.outerRadiusPx} />
      {measurement ? (
        <CircleGuide
          color="#ef4444"
          probe={probe}
          radius={measurement.largestJumpRadiusPx}
          width={2}
        />
      ) : null}
      <div
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-white"
        style={{ left: probe.centerX, top: probe.centerY }}
      />
    </div>
  )
}

function CircleGuide({
  color,
  probe,
  radius,
  width = 1,
}: {
  color: string
  probe: RevealProbe
  radius: number
  width?: number
}) {
  const style: CSSProperties = {
    borderColor: color,
    borderWidth: width,
    height: radius * 2,
    left: probe.centerX - radius,
    top: probe.centerY - radius,
    width: radius * 2,
  }
  return <div className="absolute rounded-full border-solid" style={style} />
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  suffix = ' px',
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  suffix?: string
  value: number
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs text-white/70">
        <span>{label}</span>
        <output className="font-mono text-cyan-200">
          {value}
          {suffix}
        </output>
      </span>
      <input
        className="mt-2 w-full accent-cyan-300"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={1}
        type="range"
        value={value}
      />
    </label>
  )
}

function MeasurementPanel({
  measurement,
  measuring,
}: {
  measurement: RevealMeasurement | null
  measuring: boolean
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
        Observed composite
      </h2>
      {!measurement ? (
        <p className="mt-3 text-sm leading-6 text-white/45">
          {measuring
            ? 'Capturing three final rendered frames…'
            : 'Waiting for the tree and robot assets.'}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric
              label="Largest observed jump"
              value={measurement.maxObservedDeltaPerPixel.toFixed(4)}
            />
            <Metric
              label="Ideal curve jump"
              value={measurement.maxExpectedDeltaPerPixel.toFixed(4)}
            />
            <Metric
              label="Jump radius"
              value={`${measurement.largestJumpRadiusPx.toFixed(1)} px`}
            />
            <Metric
              label="Jump amplification"
              value={`${(
                measurement.maxObservedDeltaPerPixel /
                  Math.max(0.000001, measurement.maxExpectedDeltaPerPixel)
              ).toFixed(2)}×`}
            />
            <Metric
              label="Worst curve error"
              value={measurement.maxAbsoluteCurveError.toFixed(3)}
            />
            <Metric
              label="Measured pixels"
              value={measurement.eligiblePixelCount.toLocaleString()}
            />
          </div>
          <RevealProfileGraph measurement={measurement} />
          <p className="mt-3 text-xs leading-5 text-white/50">
            Cyan is final-pixel tree visibility reconstructed from clear-tree and full-tree
            captures. Amber is the requested radial opacity. A sudden cyan slope is the visible
            ring.
          </p>
        </>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-1 font-mono text-sm text-white/85">{value}</div>
    </div>
  )
}

function RevealProfileGraph({ measurement }: { measurement: RevealMeasurement }) {
  const width = 338
  const height = 164
  const padding = 12
  const profile = measurement.profile
  const firstRadius = profile[0]?.radiusPx ?? measurement.controls.innerRadiusPx
  const lastRadius = profile.at(-1)?.radiusPx ?? measurement.controls.outerRadiusPx
  const radiusSpan = Math.max(1, lastRadius - firstRadius)
  const makePath = (readOpacity: (sample: RevealProfileBin) => number) =>
    profile
      .map((sample, index) => {
        const x = padding + ((sample.radiusPx - firstRadius) / radiusSpan) * (width - padding * 2)
        const y = height - padding - readOpacity(sample) * (height - padding * 2)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')

  return (
    <svg
      aria-label="Observed and ideal radial opacity curves"
      className="mt-4 w-full overflow-visible rounded-lg bg-black/25"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <line
        stroke="rgba(255,255,255,0.13)"
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
      />
      <line
        stroke="rgba(255,255,255,0.13)"
        x1={padding}
        x2={width - padding}
        y1={padding}
        y2={padding}
      />
      <path
        d={makePath((sample) => sample.expectedOpacity)}
        fill="none"
        stroke="#fcd34d"
        strokeWidth="2"
      />
      <path
        d={makePath((sample) => sample.observedOpacity)}
        fill="none"
        stroke="#67e8f9"
        strokeWidth="2.5"
      />
    </svg>
  )
}

async function captureRenderTargetPixels(
  { camera, renderer, scene }: RevealRenderContext,
  probe: RevealProbe,
) {
  const width = Math.max(1, Math.round(probe.width))
  const height = Math.max(1, Math.round(probe.height))
  const target = new RenderTarget(width, height, {
    depthBuffer: true,
    format: RGBAFormat,
    type: UnsignedByteType,
  })
  try {
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)
    return createImageDataFromReadback(
      pixels as Uint8Array,
      width,
      height,
      isWebGpuBackend(renderer),
    )
  } finally {
    renderer.setRenderTarget(null)
    target.dispose()
  }
}

function createImageDataFromReadback(
  pixels: Uint8Array,
  width: number,
  height: number,
  webGpu: boolean,
) {
  const rowBytes = width * 4
  const tightPixels = new Uint8ClampedArray(rowBytes * height)
  if (webGpu) {
    const paddedRowBytes = Math.ceil(rowBytes / 256) * 256
    const sourceRowBytes = pixels.byteLength >= paddedRowBytes * height ? paddedRowBytes : rowBytes
    for (let row = 0; row < height; row += 1) {
      tightPixels.set(
        pixels.subarray(row * sourceRowBytes, row * sourceRowBytes + rowBytes),
        row * rowBytes,
      )
    }
  } else {
    for (let row = 0; row < height; row += 1) {
      const sourceStart = (height - 1 - row) * rowBytes
      tightPixels.set(pixels.subarray(sourceStart, sourceStart + rowBytes), row * rowBytes)
    }
  }
  return new ImageData(tightPixels, width, height)
}

function isWebGpuBackend(renderer: WebGPURenderer) {
  const backend = renderer.backend as {
    constructor?: { name?: string }
    device?: unknown
    isWebGPUBackend?: boolean
  }
  return (
    Boolean(backend.device) ||
    backend.isWebGPUBackend === true ||
    backend.constructor?.name === 'WebGPUBackend'
  )
}

function measureRenderedReveal({
  clearTree,
  controls,
  fullTree,
  probe,
  transition,
}: {
  clearTree: ImageData
  controls: RevealControls
  fullTree: ImageData
  probe: RevealProbe
  transition: ImageData
}): RevealMeasurement {
  const startRadius = Math.max(0, Math.floor(controls.innerRadiusPx))
  const endRadius = Math.ceil(controls.outerRadiusPx)
  const bins = Array.from({ length: endRadius - startRadius + 1 }, () => ({
    observations: [] as number[],
  }))
  let eligiblePixelCount = 0

  for (let y = 0; y < transition.height; y += 1) {
    for (let x = 0; x < transition.width; x += 1) {
      const radius = Math.hypot(x + 0.5 - probe.centerX, y + 0.5 - probe.centerY)
      const radiusIndex = Math.round(radius) - startRadius
      if (radiusIndex < 0 || radiusIndex >= bins.length) continue

      const pixelIndex = (y * transition.width + x) * 4
      let numerator = 0
      let denominator = 0
      for (let channel = 0; channel < 3; channel += 1) {
        const clearValue = clearTree.data[pixelIndex + channel] ?? 0
        const fullDelta = (fullTree.data[pixelIndex + channel] ?? 0) - clearValue
        const transitionDelta = (transition.data[pixelIndex + channel] ?? 0) - clearValue
        numerator += transitionDelta * fullDelta
        denominator += fullDelta * fullDelta
      }
      if (denominator < 18 * 18) continue

      const observedOpacity = Math.min(1.25, Math.max(-0.25, numerator / denominator))
      const bin = bins[radiusIndex]
      if (!bin) continue
      bin.observations.push(observedOpacity)
      eligiblePixelCount += 1
    }
  }

  const profile: RevealProfileBin[] = []
  for (let index = 0; index < bins.length; index += 1) {
    const bin = bins[index]
    if (!bin || bin.observations.length < 12) continue
    const radiusPx = startRadius + index
    profile.push({
      count: bin.observations.length,
      expectedOpacity: sampleLandrushRobotScreenRevealRadialOpacity({
        distancePx: radiusPx,
        innerRadiusPx: controls.innerRadiusPx,
        outerRadiusPx: controls.outerRadiusPx,
        smoothnessPercent: controls.smoothnessPercent,
      }),
      observedOpacity: Math.min(1, Math.max(0, calculateTrimmedMean(bin.observations, 0.1))),
      radiusPx,
    })
  }

  let largestJumpRadiusPx = controls.innerRadiusPx
  let maxObservedDeltaPerPixel = 0
  let maxExpectedDeltaPerPixel = 0
  let maxAbsoluteCurveError = 0
  let maxAbsoluteCurveErrorRadiusPx = controls.innerRadiusPx
  for (let index = 0; index < profile.length; index += 1) {
    const sample = profile[index]
    if (!sample) continue
    const curveError = Math.abs(sample.observedOpacity - sample.expectedOpacity)
    if (curveError > maxAbsoluteCurveError) {
      maxAbsoluteCurveError = curveError
      maxAbsoluteCurveErrorRadiusPx = sample.radiusPx
    }
    const previous = profile[index - 4]
    if (!previous) continue
    const radiusDelta = sample.radiusPx - previous.radiusPx
    if (radiusDelta > 6) continue
    const observedDelta = Math.abs(sample.observedOpacity - previous.observedOpacity) / radiusDelta
    const expectedDelta = Math.abs(sample.expectedOpacity - previous.expectedOpacity) / radiusDelta
    if (observedDelta > maxObservedDeltaPerPixel) {
      maxObservedDeltaPerPixel = observedDelta
      largestJumpRadiusPx = (sample.radiusPx + previous.radiusPx) / 2
    }
    maxExpectedDeltaPerPixel = Math.max(maxExpectedDeltaPerPixel, expectedDelta)
  }

  return {
    controls: { ...controls },
    eligiblePixelCount,
    largestJumpRadiusPx,
    maxAbsoluteCurveError,
    maxAbsoluteCurveErrorRadiusPx,
    maxExpectedDeltaPerPixel,
    maxObservedDeltaPerPixel,
    profile,
    validRadiusBinCount: profile.length,
  }
}

function calculateTrimmedMean(values: number[], trimRatio: number) {
  values.sort((first, second) => first - second)
  const trimCount = Math.floor(values.length * trimRatio)
  const start = Math.min(trimCount, values.length - 1)
  const end = Math.max(start + 1, values.length - trimCount)
  let sum = 0
  for (let index = start; index < end; index += 1) sum += values[index] ?? 0
  return sum / (end - start)
}

function logRenderedRevealMeasurement(measurement: RevealMeasurement) {
  const jumpIndex = measurement.profile.findIndex(
    (sample) => sample.radiusPx >= measurement.largestJumpRadiusPx,
  )
  const diagnosticRows = measurement.profile.slice(
    Math.max(0, jumpIndex - 5),
    Math.min(measurement.profile.length, jumpIndex + 6),
  )
  console.groupCollapsed(
    `[robot-tree-reveal-debug] observed jump ${measurement.maxObservedDeltaPerPixel.toFixed(4)}/px at ${measurement.largestJumpRadiusPx.toFixed(1)}px`,
  )
  console.log(
    '[robot-tree-reveal-debug] summary ' +
      JSON.stringify({
        eligiblePixelCount: measurement.eligiblePixelCount,
        jumpAmplification:
          measurement.maxObservedDeltaPerPixel /
          Math.max(0.000001, measurement.maxExpectedDeltaPerPixel),
        largestJumpRadiusPx: measurement.largestJumpRadiusPx,
        maxAbsoluteCurveError: measurement.maxAbsoluteCurveError,
        maxAbsoluteCurveErrorRadiusPx: measurement.maxAbsoluteCurveErrorRadiusPx,
        maxExpectedDeltaPerPixel: measurement.maxExpectedDeltaPerPixel,
        maxObservedDeltaPerPixel: measurement.maxObservedDeltaPerPixel,
        validRadiusBinCount: measurement.validRadiusBinCount,
      }),
  )
  console.log(`[robot-tree-reveal-debug] jump profile ${JSON.stringify(diagnosticRows)}`)
  console.table(
    diagnosticRows.map((sample) => ({
      count: sample.count,
      error: Number((sample.observedOpacity - sample.expectedOpacity).toFixed(4)),
      expected: Number(sample.expectedOpacity.toFixed(4)),
      observed: Number(sample.observedOpacity.toFixed(4)),
      radiusPx: sample.radiusPx,
    })),
  )
  console.groupEnd()
}

function revealProbesEqual(first: RevealProbe, second: RevealProbe) {
  return (
    Math.abs(first.centerX - second.centerX) < 0.01 &&
    Math.abs(first.centerY - second.centerY) < 0.01 &&
    first.height === second.height &&
    Math.abs(first.robotNearDepth - second.robotNearDepth) < 0.0001 &&
    first.width === second.width
  )
}
