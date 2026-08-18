'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type {
  NaturalRoadDebugMode,
  NaturalRoadPlan,
  NaturalRoadQuality,
  NaturalRoadSeed,
} from './natural-road-network-layer'
import {
  NATURAL_ROAD_FINAL_DRAW_GROUPS,
  NATURAL_ROAD_FRAME_BUDGET_MS,
} from './natural-road-network-layer'
import type { StandaloneOceanCameraPreset } from './standalone-ocean-client'

type TimestampRenderer = {
  backend?: { trackTimestamp: boolean }
  hasFeature?: (name: string) => boolean
  resolveTimestampsAsync?: (type: string) => Promise<number | undefined>
}

export function NaturalRoadDebugPanel({
  cameraPreset,
  debugMode,
  onCameraPresetChange,
  onDebugModeChange,
  onQualityChange,
  onSeedChange,
  plan,
  quality,
  sceneGpuFrameMs,
  seed,
}: {
  cameraPreset: StandaloneOceanCameraPreset
  debugMode: NaturalRoadDebugMode
  onCameraPresetChange: (preset: StandaloneOceanCameraPreset) => void
  onDebugModeChange: (mode: NaturalRoadDebugMode) => void
  onQualityChange: (quality: NaturalRoadQuality) => void
  onSeedChange: (seed: NaturalRoadSeed) => void
  plan: NaturalRoadPlan
  quality: NaturalRoadQuality
  sceneGpuFrameMs: number | null | undefined
  seed: NaturalRoadSeed
}) {
  const [clientBuildTimeMs, setClientBuildTimeMs] = useState<number | null>(null)

  useEffect(() => {
    setClientBuildTimeMs(plan.metrics.buildTimeMs)
  }, [plan])

  return (
    <section className="pointer-events-auto absolute right-4 top-4 z-10 max-w-[calc(100vw-2rem)] rounded-lg border border-white/12 bg-slate-950/78 px-3 py-3 text-xs text-slate-100 shadow-2xl shadow-black/25 backdrop-blur">
      <div className="mb-2 font-medium uppercase tracking-[0.16em] text-slate-300">
        Natural Road Network
      </div>
      <div className="flex flex-col gap-2">
        <RoadSelect
          label="Road view"
          onChange={(value) => onDebugModeChange(value as NaturalRoadDebugMode)}
          options={[
            ['final', 'Final'],
            ['topology', 'Topology'],
            ['structure', 'Structure'],
            ['clearance', 'Grass clearance'],
          ]}
          value={debugMode}
        />
        <RoadSelect
          label="Road seed"
          onChange={(value) => onSeedChange(value as NaturalRoadSeed)}
          options={[
            ['cala', 'Cala'],
            ['capri', 'Capri'],
            ['corsica', 'Corsica'],
          ]}
          value={seed}
        />
        <RoadSelect
          label="Geometry"
          onChange={(value) => onQualityChange(value as NaturalRoadQuality)}
          options={[
            ['balanced', 'Balanced'],
            ['high', 'High'],
          ]}
          value={quality}
        />
        <RoadSelect
          label="Camera"
          onChange={(value) => onCameraPresetChange(value as StandaloneOceanCameraPreset)}
          options={[
            ['design', 'Design'],
            ['aerial', 'Aerial'],
            ['waterline', 'Waterline'],
          ]}
          value={cameraPreset}
        />
      </div>
      <div className="mt-3 space-y-0.5 text-[10px] text-slate-400">
        <div>
          {plan.metrics.routeLengthMeters.toFixed(0)} m network / {plan.metrics.segmentCount}{' '}
          segments
        </div>
        <div>
          {plan.metrics.junctionCount} intersections / {plan.metrics.endpointCount} dead ends
        </div>
        <div>{plan.metrics.perimeterSidewalkSegmentCount} coastline segments / sidewalk only</div>
        <div>
          {plan.metrics.footprintVertexCount.toLocaleString()} footprint vertices / ~
          {plan.metrics.estimatedTriangleCount.toLocaleString()} triangles
        </div>
        <div>
          Footprint build:{' '}
          {clientBuildTimeMs === null
            ? 'measuring...'
            : `${clientBuildTimeMs.toFixed(1)} ms one-time`}
        </div>
        <div>{NATURAL_ROAD_FINAL_DRAW_GROUPS} road draw groups / 1 compiled network</div>
        <div>Isolated road contract: &lt;{NATURAL_ROAD_FRAME_BUDGET_MS.toFixed(1)} ms</div>
        <div className="text-cyan-200">
          Full scene GPU:{' '}
          {sceneGpuFrameMs === undefined
            ? 'warming...'
            : sceneGpuFrameMs === null
              ? 'unavailable'
              : `${sceneGpuFrameMs.toFixed(2)} ms`}
        </div>
      </div>
    </section>
  )
}

export function NaturalRoadGpuTimestampProbe({
  onSample,
}: {
  onSample: (value: number | null) => void
}) {
  const gl = useThree((state) => state.gl)
  const rendererRef = useRef<TimestampRenderer | null>(null)
  const activeRef = useRef(false)
  const frameCountRef = useRef(0)
  const pendingRef = useRef(false)

  useEffect(() => {
    const renderer = gl as unknown as TimestampRenderer
    const backend = renderer.backend
    if (!(backend && renderer.hasFeature && renderer.resolveTimestampsAsync)) {
      onSample(null)
      return
    }

    let available = false
    try {
      available = renderer.hasFeature('timestamp-query')
    } catch {
      available = false
    }
    if (!available) {
      onSample(null)
      return
    }

    const previousTrackTimestamp = backend.trackTimestamp
    backend.trackTimestamp = true
    rendererRef.current = renderer
    activeRef.current = true

    return () => {
      activeRef.current = false
      rendererRef.current = null
      backend.trackTimestamp = previousTrackTimestamp
    }
  }, [gl, onSample])

  useFrame(() => {
    const renderer = rendererRef.current
    if (!(activeRef.current && renderer?.resolveTimestampsAsync) || pendingRef.current) return
    frameCountRef.current += 1
    if (frameCountRef.current < 20) return
    frameCountRef.current = 0
    pendingRef.current = true

    renderer
      .resolveTimestampsAsync('render')
      .then((sample) => {
        if (activeRef.current && typeof sample === 'number' && Number.isFinite(sample)) {
          onSample(sample)
        }
      })
      .catch(() => {
        if (activeRef.current) onSample(null)
      })
      .finally(() => {
        pendingRef.current = false
      })
  })

  return null
}

function RoadSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: readonly (readonly [string, string])[]
  value: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
      {label}
      <select
        className="min-w-28 rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}
