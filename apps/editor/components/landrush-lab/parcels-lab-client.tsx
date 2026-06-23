'use client'

import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ParcelAllocationOptions, ParcelAllocationResult } from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  type ParcelStreetNetwork,
  type ParcelStreetOptions,
} from './parcel-streets'
import { type ParcelOverlayOptions, ParcelsLandLayers } from './parcels-layers'
import { measureParcelsLab, parcelsMetricGates } from './parcels-metrics'
import { WATER_FIELD_RESOLUTION } from './water-field-texture'
import {
  generateWaterLabIsland,
  WATER_LAB_ISLAND_SLIDERS as ISLAND_SLIDERS,
  type LabSliderConfig,
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
import { measureWaterLab } from './water-metrics'
import { type WaterLandSurface, WaterScene } from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_PARCELS_LAB__?: unknown
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

const DEFAULT_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} satisfies ParcelLabParameters

const DEFAULT_PARCEL_OVERLAY_PARAMETERS = {
  contourWidthMeters: 0.65,
  glowOpacity: 0.16,
  glowWidthMeters: 3.2,
  gradientDistanceMeters: 10,
  maxTransparency: 0.94,
  minTransparency: 0.14,
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

const PARCEL_OVERLAY_SLIDERS = [
  { key: 'gradientDistanceMeters', label: 'gradient distance', max: 24, min: 1, step: 0.25 },
  { key: 'contourWidthMeters', label: 'contour width', max: 3, min: 0.05, step: 0.05 },
  { key: 'glowWidthMeters', label: 'glow width', max: 8, min: 0, step: 0.1 },
  { key: 'glowOpacity', label: 'glow opacity', max: 0.45, min: 0, step: 0.01 },
  { key: 'minTransparency', label: 'min transparency', max: 0.9, min: 0, step: 0.01 },
  { key: 'maxTransparency', label: 'max transparency', max: 1, min: 0.35, step: 0.01 },
] satisfies readonly LabSliderConfig<keyof ParcelOverlayParameters>[]

const STREET_SLIDERS = [
  { key: 'roadWidthMeters', label: 'road size', max: 5, min: 0.8, step: 0.05 },
  { key: 'loopiness', label: 'extra links', max: 0.8, min: 0, step: 0.02 },
] satisfies readonly LabSliderConfig<keyof StreetLabParameters>[]

export function ParcelsLabClient() {
  const searchParams = useSearchParams()
  const preset = getWaterViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const debugWaterLayer = searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const [showStreets, setShowStreets] = useState(() => searchParams.get('streets') !== '0')
  const [showTunePanel, setShowTunePanel] = useState(() => searchParams.get('v') !== 'clean')
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [allocation, setAllocation] = useState<ParcelAllocationResult | null>(null)
  const [streetNetwork, setStreetNetwork] = useState<ParcelStreetNetwork | null>(null)
  const [islandParameters, setIslandParameters] = useState<WaterLabIslandParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
  const [parcelParameters, setParcelParameters] = useState<ParcelLabParameters>(() => ({
    ...DEFAULT_PARCEL_PARAMETERS,
  }))
  const [parcelOverlayParameters, setParcelOverlayParameters] = useState<ParcelOverlayParameters>(
    () => ({
      ...DEFAULT_PARCEL_OVERLAY_PARAMETERS,
    }),
  )
  const [streetParameters, setStreetParameters] = useState<StreetLabParameters>(() => ({
    ...DEFAULT_STREET_PARAMETERS,
  }))
  const renderIslandParameters = useSettledRenderValue(islandParameters, 260)
  const renderParcelParameters = useSettledRenderValue(parcelParameters, 160)
  const renderParcelOverlayParameters = useSettledRenderValue(parcelOverlayParameters, 120)
  const renderStreetParameters = useSettledRenderValue(streetParameters, 160)
  const island = useMemo(
    () => generateWaterLabIsland(renderIslandParameters),
    [renderIslandParameters],
  )
  const parcelOptions = useMemo<ParcelAllocationOptions>(
    () => ({
      count: renderParcelParameters.parcelCount,
      maxEdges: renderParcelParameters.maxEdges,
      seed: `${island.seed}:parcels:${renderParcelParameters.parcelCount}`,
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
      seed: `${island.seed}:streets:${renderParcelParameters.parcelCount}`,
    }),
    [island.seed, renderParcelParameters.parcelCount, renderStreetParameters],
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
  const gates = useMemo(
    () => parcelsMetricGates(parcelMetrics, parcelOptions),
    [parcelMetrics, parcelOptions],
  )
  const renderParcelOverlay = useCallback(
    (surface: WaterLandSurface) => (
      <ParcelsLandLayers
        onAllocationChange={setAllocation}
        onStreetNetworkChange={setStreetNetwork}
        options={parcelOptions}
        parcelOverlayOptions={renderParcelOverlayParameters}
        showStreets={showStreets}
        streetOptions={streetOptions}
        surface={surface}
      />
    ),
    [parcelOptions, renderParcelOverlayParameters, showStreets, streetOptions],
  )

  useEffect(() => {
    const samples: number[] = []
    let previous = performance.now()
    let raf = 0
    let warmup = 0
    const tick = (now: number) => {
      samples.push(now - previous)
      previous = now
      if (samples.length < 90) {
        raf = requestAnimationFrame(tick)
        return
      }
      const sorted = [...samples.slice(8)].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      setFrameP95(Math.round(p95 * 100) / 100)
    }
    warmup = window.setTimeout(() => {
      previous = performance.now()
      raf = requestAnimationFrame(tick)
    }, 900)
    return () => {
      window.clearTimeout(warmup)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_PARCELS_LAB__ = {
      allocation: allocation
        ? {
            availableArea: allocation.availableArea,
            parcelAreas: allocation.parcels.map((parcel) => parcel.area),
            parcelEdges: allocation.parcels.map((parcel) => parcel.edgeCount),
          }
        : null,
      frameP95,
      gates,
      island: {
        bounds: island.perimeter.bounds,
        parameters: islandParameters,
        seed: island.seed,
      },
      metrics: parcelMetrics,
      overlay: parcelOverlayParameters,
      parameters: parcelParameters,
      preset: preset.id,
      streets: streetNetwork
        ? {
            connectedParcelCount: streetNetwork.connectedParcelCount,
            graphConnected: streetNetwork.graphConnected,
            parameters: streetParameters,
            roadConnected: streetNetwork.roadConnected,
            segmentCount: streetNetwork.segments.length,
            totalLength: streetNetwork.totalLength,
          }
        : null,
      summary: 'Parcels lab: recursive scored polygon partition over the WaterScene grass surface.',
    }
    return () => {
      delete window.__LANDRUSH_PARCELS_LAB__
    }
  }, [
    allocation,
    debug,
    frameP95,
    gates,
    island,
    islandParameters,
    parcelMetrics,
    parcelOverlayParameters,
    parcelParameters,
    preset.id,
    streetNetwork,
    streetParameters,
  ])

  const resetParameters = () => {
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setParcelParameters({ ...DEFAULT_PARCEL_PARAMETERS })
    setParcelOverlayParameters({ ...DEFAULT_PARCEL_OVERLAY_PARAMETERS })
    setStreetParameters({ ...DEFAULT_STREET_PARAMETERS })
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
        renderLandOverlay={renderParcelOverlay}
        showDepthReference={false}
        terrainFieldResolution={WATER_FIELD_RESOLUTION}
        waterFieldIsland={island}
      />
      {!clean ? (
        <section className="pointer-events-none absolute left-5 top-5 max-w-[410px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
          <div className="text-sm font-semibold tracking-wide">Landrush parcels lab</div>
          <div className="mt-1 text-xs text-white/72">{preset.label}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-white/58">parcels</dt>
            <dd>{parcelMetrics.parcelCount}</dd>
            <dt className="text-white/58">coverage</dt>
            <dd>{parcelMetrics.coverageRatio}</dd>
            <dt className="text-white/58">visible area</dt>
            <dd>{parcelMetrics.simplifiedCoverageRatio}</dd>
            <dt className="text-white/58">max edges</dt>
            <dd>{parcelMetrics.maxEdges}</dd>
            <dt className="text-white/58">aspect max</dt>
            <dd>{parcelMetrics.maxAspectRatio}</dd>
            <dt className="text-white/58">water ratio</dt>
            <dd>{waterMetrics.waterPlaneRatio}</dd>
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
            {gates.map((gate) => (
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
        <ParcelsTunePanel
          islandParameters={islandParameters}
          onClose={() => setShowTunePanel(false)}
          onIslandChange={(key, value) =>
            setIslandParameters((current) => ({ ...current, [key]: value }))
          }
          onParcelChange={(key, value) =>
            setParcelParameters((current) => ({ ...current, [key]: value }))
          }
          onParcelOverlayChange={(key, value) =>
            setParcelOverlayParameters((current) => ({ ...current, [key]: value }))
          }
          onReset={resetParameters}
          onToggleStreets={() => setShowStreets((current) => !current)}
          onStreetChange={(key, value) =>
            setStreetParameters((current) => ({ ...current, [key]: value }))
          }
          parcelParameters={parcelParameters}
          parcelOverlayParameters={parcelOverlayParameters}
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

function ParcelsTunePanel({
  islandParameters,
  onClose,
  onIslandChange,
  onParcelChange,
  onParcelOverlayChange,
  onReset,
  onStreetChange,
  onToggleStreets,
  parcelOverlayParameters,
  parcelParameters,
  showStreets,
  streetParameters,
}: {
  islandParameters: WaterLabIslandParameters
  onClose: () => void
  onIslandChange: (key: keyof WaterLabIslandParameters, value: number) => void
  onParcelChange: (key: keyof ParcelLabParameters, value: number) => void
  onParcelOverlayChange: (key: keyof ParcelOverlayParameters, value: number) => void
  onReset: () => void
  onStreetChange: (key: keyof StreetLabParameters, value: number) => void
  onToggleStreets: () => void
  parcelOverlayParameters: ParcelOverlayParameters
  parcelParameters: ParcelLabParameters
  showStreets: boolean
  streetParameters: StreetLabParameters
}) {
  return (
    <section className="absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[min(360px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">Parcel tune</div>
          <div className="mt-0.5 text-[11px] text-white/54">grass surface partition</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Toggle streets"
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onToggleStreets}
            type="button"
          >
            {showStreets ? 'streets' : 'lots'}
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
      <TuningGroup title="Parcel overlay">
        {PARCEL_OVERLAY_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onParcelOverlayChange(key, value)}
            value={parcelOverlayParameters[key]}
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
