'use client'

import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, GRASS_SPAWN_FIELD_RESOLUTION } from './grass-field-texture'
import { GRASS_BLADE_TUNING_SLIDERS as GRASS_SLIDERS } from './grass-lab-parameters'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GrassWaterLandLayers } from './grass-water-layers'
import type { ParcelAllocationOptions, ParcelAllocationResult } from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
  type ParcelStreetNetwork,
  type ParcelStreetOptions,
} from './parcel-streets'
import { type ParcelOverlayOptions, ParcelsLandLayers } from './parcels-layers'
import { measureParcelsLab, parcelsMetricGates } from './parcels-metrics'
import { WATER_FIELD_RESOLUTION } from './water-field-texture'
import {
  generateWaterLabIsland,
  WATER_LAB_ISLAND_SLIDERS as ISLAND_SLIDERS,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  type WaterLabIslandParameters,
} from './water-lab-parameters'
import {
  LANDRUSH_WATER_EFFECT_PARAMETERS,
  type LandrushWaterEffectParameters,
  WATER_PLANE_SIZE,
} from './water-material'
import { measureWaterLab, waterMetricGates } from './water-metrics'
import { type WaterLandSurface, WaterScene } from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_WORLD_LAB__?: unknown
  }
}

type ParcelLabParameters = {
  maxEdges: number
  parcelCount: number
  shoreSetbackMeters: number
  simplifyToleranceMeters: number
  splitJitter: number
  squareness: number
}

type ParcelOverlayParameters = ParcelOverlayOptions

type StreetLabParameters = {
  loopiness: number
  roadWidthMeters: number
}

const WORLD_GRASS_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  brightness: 0.68,
  density: 0.58,
  height: 0.66,
  opacity: 0.24,
  patchSize: 8,
  patchSoftness: 0.03,
  rootShadow: 1,
  width: 0.09,
  wind: 0.76,
} satisfies GrassBladeTuning

const DEFAULT_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} satisfies ParcelLabParameters

const DEFAULT_PARCEL_HINT_PARAMETERS = {
  contourWidthMeters: 0.34,
  glowOpacity: 0.055,
  glowWidthMeters: 2.1,
  gradientDistanceMeters: 4.8,
  maxTransparency: 0.99,
  minTransparency: 0.58,
} satisfies ParcelOverlayParameters

const DEFAULT_STREET_PARAMETERS = {
  loopiness: 0,
  roadWidthMeters: DEFAULT_PARCEL_STREET_WIDTH_METERS,
} satisfies StreetLabParameters

const PARCEL_SLIDERS = [
  { key: 'parcelCount', label: 'parcels', max: 40, min: 2, step: 1 },
  { key: 'maxEdges', label: 'max edges', max: 15, min: 6, step: 1 },
  { key: 'shoreSetbackMeters', label: 'shore setback', max: 8, min: 0, step: 0.25 },
  { key: 'squareness', label: 'squareness', max: 1, min: 0, step: 0.01 },
  { key: 'splitJitter', label: 'organic split', max: 0.45, min: 0, step: 0.01 },
  { key: 'simplifyToleranceMeters', label: 'simplify', max: 1.5, min: 0, step: 0.02 },
] satisfies readonly LabSliderConfig<keyof ParcelLabParameters>[]

const PARCEL_HINT_SLIDERS = [
  { key: 'gradientDistanceMeters', label: 'hint fade', max: 18, min: 1, step: 0.25 },
  { key: 'contourWidthMeters', label: 'hint contour', max: 2, min: 0.05, step: 0.05 },
  { key: 'glowWidthMeters', label: 'hint glow', max: 6, min: 0, step: 0.1 },
  { key: 'glowOpacity', label: 'glow opacity', max: 0.22, min: 0, step: 0.005 },
  { key: 'minTransparency', label: 'edge transparency', max: 0.95, min: 0.2, step: 0.01 },
  { key: 'maxTransparency', label: 'field transparency', max: 1, min: 0.75, step: 0.01 },
] satisfies readonly LabSliderConfig<keyof ParcelOverlayParameters>[]

const STREET_SLIDERS = [
  { key: 'roadWidthMeters', label: 'road size', max: 5, min: 0.8, step: 0.05 },
  { key: 'loopiness', label: 'extra links', max: 0.8, min: 0, step: 0.02 },
] satisfies readonly LabSliderConfig<keyof StreetLabParameters>[]

type LabSliderConfig<Key extends string> = {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

export function WorldLabClient() {
  const searchParams = useSearchParams()
  const preset = getWaterViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const debugWaterLayer = searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const [showTunePanel, setShowTunePanel] = useState(() => searchParams.get('v') !== 'clean')
  const [showParcelHints, setShowParcelHints] = useState(() => searchParams.get('parcels') !== '0')
  const [showStreets, setShowStreets] = useState(() => searchParams.get('streets') !== '0')
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [allocation, setAllocation] = useState<ParcelAllocationResult | null>(null)
  const [streetNetwork, setStreetNetwork] = useState<ParcelStreetNetwork | null>(null)
  const [islandParameters, setIslandParameters] = useState<WaterLabIslandParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
  const [grassTuning, setGrassTuning] = useState<GrassBladeTuning>(() => ({
    ...WORLD_GRASS_TUNING,
  }))
  const [parcelParameters, setParcelParameters] = useState<ParcelLabParameters>(() => ({
    ...DEFAULT_PARCEL_PARAMETERS,
  }))
  const [parcelHintParameters, setParcelHintParameters] = useState<ParcelOverlayParameters>(() => ({
    ...DEFAULT_PARCEL_HINT_PARAMETERS,
  }))
  const [streetParameters, setStreetParameters] = useState<StreetLabParameters>(() => ({
    ...DEFAULT_STREET_PARAMETERS,
  }))
  const resolvedGrassTuning = useMemo(
    () => ({ ...WORLD_GRASS_TUNING, ...grassTuning }),
    [grassTuning],
  )
  const renderIslandParameters = useSettledRenderValue(islandParameters, 320)
  const renderGrassTuning = useSettledRenderValue(resolvedGrassTuning, 260)
  const renderParcelParameters = useSettledRenderValue(parcelParameters, 160)
  const renderParcelHintParameters = useSettledRenderValue(parcelHintParameters, 120)
  const renderStreetParameters = useSettledRenderValue(streetParameters, 160)
  const island = useMemo(
    () => generateWaterLabIsland(renderIslandParameters),
    [renderIslandParameters],
  )
  const bladeSubdivisions = useMemo(
    () => resolveGrassWebGpuBladeSubdivisions(renderGrassTuning.density),
    [renderGrassTuning.density],
  )
  const parcelOptions = useMemo<ParcelAllocationOptions>(
    () => ({
      count: renderParcelParameters.parcelCount,
      maxEdges: renderParcelParameters.maxEdges,
      seed: `${island.seed}:world-parcels:${renderParcelParameters.parcelCount}`,
      shoreSetbackMeters: renderParcelParameters.shoreSetbackMeters,
      simplifyToleranceMeters: renderParcelParameters.simplifyToleranceMeters,
      splitJitter: renderParcelParameters.splitJitter,
      squareness: renderParcelParameters.squareness,
    }),
    [island.seed, renderParcelParameters],
  )
  const streetOptions = useMemo<ParcelStreetOptions>(
    () => ({
      loopiness: renderStreetParameters.loopiness,
      roadWidthMeters: renderStreetParameters.roadWidthMeters,
      seed: `${island.seed}:world-streets:${renderParcelParameters.parcelCount}`,
    }),
    [island.seed, renderParcelParameters.parcelCount, renderStreetParameters],
  )
  const grassRoads = useMemo(
    () => grassRoadSegmentsFromStreetNetwork(streetNetwork),
    [streetNetwork],
  )
  const waterMetrics = useMemo(
    () =>
      measureWaterLab(
        island,
        WATER_PLANE_SIZE,
        LANDRUSH_WATER_EFFECT_PARAMETERS,
        WATER_LAB_DEFAULT_FIELD_PARAMETERS,
      ),
    [island],
  )
  const parcelMetrics = useMemo(
    () => measureParcelsLab(allocation, parcelOptions),
    [allocation, parcelOptions],
  )
  const waterGates = useMemo(() => waterMetricGates(waterMetrics), [waterMetrics])
  const parcelGates = useMemo(
    () => parcelsMetricGates(parcelMetrics, parcelOptions),
    [parcelMetrics, parcelOptions],
  )
  const renderLandOverlay = useCallback(
    (surface: WaterLandSurface) => (
      <group>
        <GrassWaterLandLayers
          bladeSubdivisions={bladeSubdivisions}
          fieldResolution={GRASS_FIELD_RESOLUTION}
          roads={grassRoads}
          spawnResolution={GRASS_SPAWN_FIELD_RESOLUTION}
          surface={surface}
          tuning={renderGrassTuning}
        />
        <ParcelsLandLayers
          onAllocationChange={setAllocation}
          onStreetNetworkChange={setStreetNetwork}
          options={parcelOptions}
          parcelOverlayOptions={renderParcelHintParameters}
          showParcels={showParcelHints}
          showStreets={showStreets}
          streetOptions={streetOptions}
          surface={surface}
        />
      </group>
    ),
    [
      bladeSubdivisions,
      grassRoads,
      parcelOptions,
      renderGrassTuning,
      renderParcelHintParameters,
      showParcelHints,
      showStreets,
      streetOptions,
    ],
  )

  useEffect(() => {
    const samples: number[] = []
    let previous = performance.now()
    let raf = 0
    let warmup = 0
    const tick = (now: number) => {
      samples.push(now - previous)
      previous = now
      if (samples.length < 100) {
        raf = requestAnimationFrame(tick)
        return
      }
      const sorted = [...samples.slice(10)].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      setFrameP95(Math.round(p95 * 100) / 100)
    }
    warmup = window.setTimeout(() => {
      previous = performance.now()
      raf = requestAnimationFrame(tick)
    }, 1800)
    return () => {
      window.clearTimeout(warmup)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_WORLD_LAB__ = {
      allocation: allocation
        ? {
            availableArea: allocation.availableArea,
            parcelAreas: allocation.parcels.map((parcel) => parcel.area),
            parcelEdges: allocation.parcels.map((parcel) => parcel.edgeCount),
          }
        : null,
      frameP95,
      grass: {
        groundTextureResolution: GRASS_FIELD_RESOLUTION,
        roadMaskSegments: grassRoads.length,
        spawnTextureResolution: GRASS_SPAWN_FIELD_RESOLUTION,
        tuning: resolvedGrassTuning,
      },
      island: {
        bounds: island.perimeter.bounds,
        parameters: islandParameters,
        seed: island.seed,
      },
      parcels: {
        hints: showParcelHints,
        metrics: parcelMetrics,
        parameters: parcelParameters,
      },
      preset: preset.id,
      streets: streetNetwork
        ? {
            connectedParcelCount: streetNetwork.connectedParcelCount,
            graphConnected: streetNetwork.graphConnected,
            parameters: streetParameters,
            roadConnected: streetNetwork.roadConnected,
            segmentCount: streetNetwork.segments.length,
            shown: showStreets,
            totalLength: streetNetwork.totalLength,
          }
        : null,
      summary:
        'Integrated Landrush debug lab: water, grass and Bruno trees with procedural parcels and edge roads.',
      water: {
        elevation: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
        field: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
        material: LANDRUSH_WATER_EFFECT_PARAMETERS,
        metrics: waterMetrics,
        terrainFieldResolution: WATER_FIELD_RESOLUTION,
      },
    }
    return () => {
      delete window.__LANDRUSH_WORLD_LAB__
    }
  }, [
    allocation,
    debug,
    frameP95,
    grassRoads.length,
    island,
    islandParameters,
    parcelMetrics,
    parcelParameters,
    preset.id,
    resolvedGrassTuning,
    showParcelHints,
    showStreets,
    streetNetwork,
    streetParameters,
    waterMetrics,
  ])

  const resetParameters = () => {
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setGrassTuning({ ...WORLD_GRASS_TUNING })
    setParcelParameters({ ...DEFAULT_PARCEL_PARAMETERS })
    setParcelHintParameters({ ...DEFAULT_PARCEL_HINT_PARAMETERS })
    setStreetParameters({ ...DEFAULT_STREET_PARAMETERS })
    setShowParcelHints(true)
    setShowStreets(true)
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      <WaterScene
        debugLayer={debugWaterLayer}
        elevationParameters={WATER_LAB_DEFAULT_ELEVATION_PARAMETERS}
        fieldParameters={WATER_LAB_DEFAULT_FIELD_PARAMETERS}
        island={island}
        materialParameters={LANDRUSH_WATER_EFFECT_PARAMETERS as LandrushWaterEffectParameters}
        preset={preset}
        renderLandOverlay={renderLandOverlay}
        showDepthReference={false}
        terrainFieldResolution={WATER_FIELD_RESOLUTION}
        waterFieldIsland={island}
      />
      {!clean ? (
        <section className="pointer-events-none absolute left-5 top-5 max-w-[420px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
          <div className="text-sm font-semibold tracking-wide">Landrush world lab</div>
          <div className="mt-1 text-xs text-white/72">{preset.label}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-white/58">water ratio</dt>
            <dd>{waterMetrics.waterPlaneRatio}</dd>
            <dt className="text-white/58">grass density</dt>
            <dd>{resolvedGrassTuning.density.toFixed(2)}</dd>
            <dt className="text-white/58">trees</dt>
            <dd>field driven</dd>
            <dt className="text-white/58">parcels</dt>
            <dd>{parcelMetrics.parcelCount}</dd>
            <dt className="text-white/58">streets</dt>
            <dd>{streetNetwork?.segments.length ?? 0}</dd>
            <dt className="text-white/58">street access</dt>
            <dd>
              {streetNetwork?.connectedParcelCount ?? 0}/{parcelMetrics.parcelCount}
            </dd>
            <dt className="text-white/58">road graph</dt>
            <dd>{streetNetwork?.roadConnected ? 'yes' : 'no'}</dd>
            <dt className="text-white/58">frame p95</dt>
            <dd>{frameP95 ?? 'measuring'}ms</dd>
          </dl>
          <div className="mt-3 grid gap-1 text-xs">
            {[...waterGates.slice(0, 3), ...parcelGates.slice(0, 4)].map((gate) => (
              <div className="flex items-center justify-between gap-3" key={gate.label}>
                <span className="text-white/70">{gate.label}</span>
                <span className={gate.pass ? 'text-emerald-300' : 'text-rose-300'}>
                  {gate.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {showTunePanel ? (
        <WorldTunePanel
          grassTuning={resolvedGrassTuning}
          islandParameters={islandParameters}
          onClose={() => setShowTunePanel(false)}
          onGrassChange={(key, value) =>
            setGrassTuning((current) => ({ ...current, [key]: value }))
          }
          onIslandChange={(key, value) =>
            setIslandParameters((current) => ({ ...current, [key]: value }))
          }
          onParcelChange={(key, value) =>
            setParcelParameters((current) => ({ ...current, [key]: value }))
          }
          onParcelHintChange={(key, value) =>
            setParcelHintParameters((current) => ({ ...current, [key]: value }))
          }
          onReset={resetParameters}
          onStreetChange={(key, value) =>
            setStreetParameters((current) => ({ ...current, [key]: value }))
          }
          onToggleParcelHints={() => setShowParcelHints((current) => !current)}
          onToggleStreets={() => setShowStreets((current) => !current)}
          parcelHintParameters={parcelHintParameters}
          parcelParameters={parcelParameters}
          showParcelHints={showParcelHints}
          showStreets={showStreets}
          streetParameters={streetParameters}
        />
      ) : (
        <button
          className="pointer-events-auto absolute right-5 top-5 inline-flex items-center gap-2 rounded-md border border-white/25 bg-slate-950/78 px-3 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur transition hover:border-white/45 hover:text-white"
          onClick={() => setShowTunePanel(true)}
          type="button"
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          Sliders
        </button>
      )}
    </main>
  )
}

function WorldTunePanel({
  grassTuning,
  islandParameters,
  onClose,
  onGrassChange,
  onIslandChange,
  onParcelChange,
  onParcelHintChange,
  onReset,
  onStreetChange,
  onToggleParcelHints,
  onToggleStreets,
  parcelHintParameters,
  parcelParameters,
  showParcelHints,
  showStreets,
  streetParameters,
}: {
  grassTuning: GrassBladeTuning
  islandParameters: WaterLabIslandParameters
  onClose: () => void
  onGrassChange: (key: keyof GrassBladeTuning, value: number) => void
  onIslandChange: (key: keyof WaterLabIslandParameters, value: number) => void
  onParcelChange: (key: keyof ParcelLabParameters, value: number) => void
  onParcelHintChange: (key: keyof ParcelOverlayParameters, value: number) => void
  onReset: () => void
  onStreetChange: (key: keyof StreetLabParameters, value: number) => void
  onToggleParcelHints: () => void
  onToggleStreets: () => void
  parcelHintParameters: ParcelOverlayParameters
  parcelParameters: ParcelLabParameters
  showParcelHints: boolean
  showStreets: boolean
  streetParameters: StreetLabParameters
}) {
  return (
    <section className="absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[min(360px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">World tune</div>
          <div className="mt-0.5 text-[11px] text-white/54">water + grass + roads + parcels</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Toggle parcel hints"
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onToggleParcelHints}
            type="button"
          >
            {showParcelHints ? 'hints' : 'plain'}
          </button>
          <button
            aria-label="Toggle streets"
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onToggleStreets}
            type="button"
          >
            {showStreets ? 'roads' : 'lots'}
          </button>
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
      <TuningGroup title="Island">
        {ISLAND_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onIslandChange(key, value)}
            value={islandParameters[key]}
          />
        ))}
      </TuningGroup>
      <TuningGroup title="Grass and trees">
        {GRASS_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onGrassChange(key, value)}
            value={grassTuning[key]}
          />
        ))}
      </TuningGroup>
      <TuningGroup title="Parcels">
        {PARCEL_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onParcelChange(key, value)}
            value={parcelParameters[key]}
          />
        ))}
      </TuningGroup>
      <TuningGroup title="Parcel hint">
        {PARCEL_HINT_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onParcelHintChange(key, value)}
            value={parcelHintParameters[key]}
          />
        ))}
      </TuningGroup>
      <TuningGroup title="Streets">
        {STREET_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onStreetChange(key, value)}
            value={streetParameters[key]}
          />
        ))}
      </TuningGroup>
    </section>
  )
}

function TuningGroup({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mt-4 grid gap-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/46">
        {title}
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  )
}

function TuneSlider({
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
        <span className="tabular-nums text-white/90">{formatTuningValue(value)}</span>
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

function grassRoadSegmentsFromStreetNetwork(
  network: ParcelStreetNetwork | null,
): readonly LandrushRoadSegment[] {
  if (!network) return []

  return network.segments.map((segment) => {
    const start = segment.points[0] ?? { x: 0, z: 0 }
    const end = segment.points.at(-1) ?? start
    const fullPavedWidth =
      segment.width +
      PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
      PARCEL_STREET_CURB_EXTRA_WIDTH_METERS
    return {
      connectsParcelIds: segment.parcelIds,
      fromNodeId: `world-road-start-${nodeId(start)}`,
      id: `world-road-${segment.id}`,
      kind: 'spine',
      points: segment.points,
      r3fPoints: segment.points.map((point) => [point.x, 0, point.z] satisfies LandrushVec3),
      toNodeId: `world-road-end-${nodeId(end)}`,
      width: fullPavedWidth,
    }
  })
}

function nodeId(point: { x: number; z: number }) {
  return `${Math.round(point.x * 100)}-${Math.round(point.z * 100)}`
}

function formatTuningValue(value: number) {
  if (!Number.isFinite(value)) return '--'
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value))
  return value < 0.2 ? value.toFixed(3) : value.toFixed(2)
}

function useSettledRenderValue<T>(value: T, settleMs: number) {
  const [renderValue, setRenderValue] = useState(value)
  const latestValueRef = useRef(value)
  const didMountRef = useRef(false)
  const settleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    latestValueRef.current = value
    if (!didMountRef.current) {
      didMountRef.current = true
      setRenderValue(value)
      return
    }

    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      setRenderValue(latestValueRef.current)
      settleTimerRef.current = null
    }, settleMs)
  }, [settleMs, value])

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current)
    },
    [],
  )

  return renderValue
}
