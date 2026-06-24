'use client'

import {
  createLandrushIncomingWaterMaterial,
  LANDRUSH_INCOMING_WATER_SURFACE_PARAMETERS,
  type LandrushIncomingWaterSurfaceParameters,
} from '@pascal-app/nodes'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, GRASS_SPAWN_FIELD_RESOLUTION } from './grass-field-texture'
import { GRASS_BLADE_TUNING_SLIDERS as GRASS_SLIDERS } from './grass-lab-parameters'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GrassWaterLandLayers } from './grass-water-layers'
import { WATER_FIELD_RESOLUTION } from './water-field-texture'
import {
  generateWaterLabIsland,
  WATER_LAB_ISLAND_SLIDERS as ISLAND_SLIDERS,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  type WaterLabIslandParameters,
} from './water-lab-parameters'
import { INCOMING_WATER_MATERIAL_SLIDERS } from './water-material-sliders'
import { type WaterLandSurface, WaterScene } from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_GRASS_WATER_LAB__?: unknown
  }
}

const GRASS_WATER_DEFAULT_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  brightness: 0.65,
  density: 0.54,
  foliageOpacity: 0.23,
  height: 0.7,
  opacity: 0.23,
  patchSize: 8,
  patchSoftness: 0.03,
  rootShadow: 1,
  width: 0.1,
  wind: 0.79,
} satisfies GrassBladeTuning

export function GrassWaterLabClient() {
  const searchParams = useSearchParams()
  const preset = getWaterViewPreset(searchParams.get('view'))
  const debug = searchParams.get('debugLandrush') === '1'
  const debugWaterLayer = searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const [showTunePanel, setShowTunePanel] = useState(() => searchParams.get('v') !== 'clean')
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [islandParameters, setIslandParameters] = useState<WaterLabIslandParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
  const [tuning, setTuning] = useState<GrassBladeTuning>(() => ({
    ...GRASS_WATER_DEFAULT_TUNING,
  }))
  const [waterMaterialParameters, setWaterMaterialParameters] =
    useState<LandrushIncomingWaterSurfaceParameters>(() => ({
      ...LANDRUSH_INCOMING_WATER_SURFACE_PARAMETERS,
    }))
  const resolvedTuning = useMemo(() => ({ ...GRASS_WATER_DEFAULT_TUNING, ...tuning }), [tuning])
  const renderTuning = useSettledRenderValue(resolvedTuning, 260)
  const bladeSubdivisions = useMemo(
    () => resolveGrassWebGpuBladeSubdivisions(renderTuning.density),
    [renderTuning.density],
  )
  const renderIslandParameters = useSettledRenderValue(islandParameters, 320)
  const island = useMemo(
    () => generateWaterLabIsland(renderIslandParameters),
    [renderIslandParameters],
  )
  const renderGrassLandOverlay = useCallback(
    (surface: WaterLandSurface) => (
      <GrassWaterLandLayers
        bladeSubdivisions={bladeSubdivisions}
        fieldResolution={GRASS_FIELD_RESOLUTION}
        spawnResolution={GRASS_SPAWN_FIELD_RESOLUTION}
        surface={surface}
        tuning={renderTuning}
      />
    ),
    [bladeSubdivisions, renderTuning],
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
    }, 1800)
    return () => {
      window.clearTimeout(warmup)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_GRASS_WATER_LAB__ = {
      frameP95,
      island: {
        bounds: island.perimeter.bounds,
        parameters: islandParameters,
        seed: island.seed,
      },
      summary:
        'Hybrid debug lab: water lab foundation with Landrush grass field color and Bruno-style blades on the raised land.',
      grass: {
        groundTextureResolution: GRASS_FIELD_RESOLUTION,
        spawnTextureResolution: GRASS_SPAWN_FIELD_RESOLUTION,
      },
      tuning: resolvedTuning,
      water: {
        elevation: WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
        field: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
        material: waterMaterialParameters,
        terrainFieldResolution: WATER_FIELD_RESOLUTION,
      },
    }
    return () => {
      delete window.__LANDRUSH_GRASS_WATER_LAB__
    }
  }, [debug, frameP95, island, islandParameters, resolvedTuning, waterMaterialParameters])

  const resetParameters = () => {
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setTuning({ ...GRASS_WATER_DEFAULT_TUNING })
    setWaterMaterialParameters({ ...LANDRUSH_INCOMING_WATER_SURFACE_PARAMETERS })
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      <WaterScene
        debugLayer={debugWaterLayer}
        elevationParameters={WATER_LAB_DEFAULT_ELEVATION_PARAMETERS}
        fieldParameters={WATER_LAB_DEFAULT_FIELD_PARAMETERS}
        island={island}
        materialParameters={waterMaterialParameters}
        preset={preset}
        renderLandOverlay={renderGrassLandOverlay}
        terrainFieldResolution={WATER_FIELD_RESOLUTION}
        showDepthReference={false}
        waterFieldIsland={island}
        waterMaterialFactory={createLandrushIncomingWaterMaterial}
      />
      {showTunePanel ? (
        <GrassWaterTunePanel
          islandParameters={islandParameters}
          onClose={() => setShowTunePanel(false)}
          onIslandChange={(key, value) =>
            setIslandParameters((current) => ({ ...current, [key]: value }))
          }
          onReset={resetParameters}
          onTuningChange={(key, value) => setTuning((current) => ({ ...current, [key]: value }))}
          onWaterMaterialChange={(key, value) =>
            setWaterMaterialParameters((current) => ({ ...current, [key]: value }))
          }
          tuning={resolvedTuning}
          waterMaterialParameters={waterMaterialParameters}
        />
      ) : (
        <button
          className="pointer-events-auto absolute right-5 top-5 rounded-md border border-white/25 bg-slate-950/78 px-3 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur transition hover:border-white/45 hover:text-white"
          onClick={() => setShowTunePanel(true)}
          type="button"
        >
          Sliders
        </button>
      )}
    </main>
  )
}

function GrassWaterTunePanel({
  islandParameters,
  onClose,
  onIslandChange,
  onReset,
  onTuningChange,
  onWaterMaterialChange,
  tuning,
  waterMaterialParameters,
}: {
  islandParameters: WaterLabIslandParameters
  onClose: () => void
  onIslandChange: (key: keyof WaterLabIslandParameters, value: number) => void
  onReset: () => void
  onTuningChange: (key: keyof GrassBladeTuning, value: number) => void
  onWaterMaterialChange: (key: keyof LandrushIncomingWaterSurfaceParameters, value: number) => void
  tuning: GrassBladeTuning
  waterMaterialParameters: LandrushIncomingWaterSurfaceParameters
}) {
  return (
    <section className="absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[min(350px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">Hybrid tune</div>
          <div className="mt-0.5 text-[11px] text-white/54">water base + land grass</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onReset}
            type="button"
          >
            reset
          </button>
          <button
            aria-label="Close sliders"
            className="size-7 rounded border border-white/20 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onClose}
            title="Close sliders"
            type="button"
          >
            x
          </button>
        </div>
      </div>
      <TuningGroup title="Island shape">
        {ISLAND_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onIslandChange(key, value)}
            value={islandParameters[key]}
          />
        ))}
      </TuningGroup>
      <TuningGroup title="Water ripples">
        {INCOMING_WATER_MATERIAL_SLIDERS.map(({ key, ...slider }) => {
          const materialKey = key as keyof LandrushIncomingWaterSurfaceParameters
          const value = waterMaterialParameters[materialKey]

          return (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(nextValue) => onWaterMaterialChange(materialKey, nextValue)}
              value={typeof value === 'number' ? value : 0}
            />
          )
        })}
      </TuningGroup>
      <TuningGroup title="Ground and blades">
        {GRASS_SLIDERS.map(({ key, ...slider }) => (
          <TuneSlider
            key={key}
            {...slider}
            onChange={(value) => onTuningChange(key, value)}
            value={tuning[key]}
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
