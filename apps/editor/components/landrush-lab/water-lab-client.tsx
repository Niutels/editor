'use client'

import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { generateLandrushIsland } from '@/components/landrush/generator'
import type { WaterFieldParameters } from './water-field-texture'
import {
  LANDRUSH_WATER_EFFECT_PARAMETERS,
  type LandrushWaterEffectParameters,
  WATER_PLANE_SIZE,
} from './water-material'
import { measureWaterLab, WATER_REFERENCE, waterMetricGates } from './water-metrics'
import { WaterScene } from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_WATER_LAB__?: unknown
  }
}

const WATER_LAB_DEFAULT_FIELD_PARAMETERS = {
  depthContourCollapseMeters: 10.3,
  depthContourCollapseScale: 1.25,
  depthContourNoiseFrequency: 0.1,
  depthContourOffsetMeters: 3.2,
  depthContourVariationMeters: 8.6,
  depthExponent: 0.52,
  depthNoiseFrequency: 0.03,
  depthNoiseStrength: 0,
  depthReach: 10,
  edgeFadeDistance: 18,
  shoreBandMeters: 0,
  shoreFeatherMeters: 0.45,
  shoreNoiseFrequency: 0.075,
  shoreVariationMeters: 0.85,
} satisfies WaterFieldParameters

type CopyStatus = 'copied' | 'failed' | 'idle'

type IslandGeneratorParameters = {
  coast: number
  detail: number
  lobes: number
  naturalness: number
  size: number
  variant: number
}

const WATER_LAB_DEFAULT_ISLAND_PARAMETERS = {
  coast: 1,
  detail: 128,
  lobes: 1,
  naturalness: 1,
  size: 1,
  variant: 0,
} satisfies IslandGeneratorParameters

export function WaterLabClient() {
  const searchParams = useSearchParams()
  const preset = getWaterViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const debugWaterLayer = searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [showDepthReference, setShowDepthReference] = useState(false)
  const [showTunePanel, setShowTunePanel] = useState(true)
  const [islandParameters, setIslandParameters] = useState<IslandGeneratorParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
  const [fieldParameters, setFieldParameters] = useState<WaterFieldParameters>(() => ({
    ...WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  }))
  const [materialParameters, setMaterialParameters] = useState<LandrushWaterEffectParameters>(
    () => ({
      ...LANDRUSH_WATER_EFFECT_PARAMETERS,
    }),
  )
  const island = useMemo(
    () =>
      generateLandrushIsland({
        seed:
          islandParameters.variant === 0
            ? 'mvp-loop-1-295'
            : `mvp-loop-1-295:${islandParameters.variant}`,
        shape: {
          asymmetry: islandParameters.naturalness,
          coast: islandParameters.coast,
          lobes: islandParameters.lobes,
          roughness: islandParameters.naturalness,
        },
        size: { width: 116 * islandParameters.size, depth: 116 * islandParameters.size },
        perimeterPointCount: islandParameters.detail,
        treeSpacing: 7.1,
      }),
    [islandParameters],
  )
  const metrics = useMemo(
    () => measureWaterLab(island, WATER_PLANE_SIZE, materialParameters, fieldParameters),
    [fieldParameters, island, materialParameters],
  )
  const gates = useMemo(() => waterMetricGates(metrics), [metrics])

  const resetParameters = () => {
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setFieldParameters({ ...WATER_LAB_DEFAULT_FIELD_PARAMETERS })
    setMaterialParameters({ ...LANDRUSH_WATER_EFFECT_PARAMETERS })
  }

  const copyParameters = async () => {
    const snapshot = {
      island: Object.fromEntries(ISLAND_SLIDERS.map(({ key }) => [key, islandParameters[key]])),
      field: Object.fromEntries(FIELD_SLIDERS.map(({ key }) => [key, fieldParameters[key]])),
      material: Object.fromEntries(
        MATERIAL_SLIDERS.map(({ key }) => [key, materialParameters[key]]),
      ),
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    window.setTimeout(() => setCopyStatus('idle'), 1400)
  }

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
    window.__LANDRUSH_WATER_LAB__ = {
      frameP95,
      gates,
      metrics,
      parameters: {
        field: fieldParameters,
        island: islandParameters,
        material: materialParameters,
      },
      preset: preset.id,
      reference: WATER_REFERENCE,
      summary:
        'Bruno water stack port: MeshDefaultMaterial output, generated Perlin/Voronoi/hash textures, wind-local-time ripples, and terrain blue-channel shore masks.',
    }
    return () => {
      delete window.__LANDRUSH_WATER_LAB__
    }
  }, [
    debug,
    fieldParameters,
    frameP95,
    gates,
    islandParameters,
    materialParameters,
    metrics,
    preset.id,
  ])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      <WaterScene
        fieldParameters={fieldParameters}
        debugLayer={debugWaterLayer}
        island={island}
        materialParameters={materialParameters}
        preset={preset}
        showDepthReference={showDepthReference}
      />
      {!clean ? (
        <section className="pointer-events-none absolute left-5 top-5 max-w-[390px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
          <div className="text-sm font-semibold tracking-wide">Landrush water lab</div>
          <div className="mt-1 text-xs text-white/72">{preset.label}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-white/58">water ratio</dt>
            <dd>{metrics.waterPlaneRatio}</dd>
            <dt className="text-white/58">noise px</dt>
            <dd>{metrics.detailTextureResolution}</dd>
            <dt className="text-white/58">ripples</dt>
            <dd>{metrics.rippleBandsPerDepth}</dd>
            <dt className="text-white/58">shore band</dt>
            <dd>{metrics.shoreBandMeters}m</dd>
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
        <WaterTunePanel
          copyStatus={copyStatus}
          fieldParameters={fieldParameters}
          islandParameters={islandParameters}
          materialParameters={materialParameters}
          onClose={() => setShowTunePanel(false)}
          onCopy={() => void copyParameters()}
          onFieldChange={(key, value) =>
            setFieldParameters((current) => ({ ...current, [key]: value }))
          }
          onIslandChange={(key, value) =>
            setIslandParameters((current) => ({ ...current, [key]: value }))
          }
          onMaterialChange={(key, value) =>
            setMaterialParameters(
              (current) => ({ ...current, [key]: value }) as LandrushWaterEffectParameters,
            )
          }
          onReset={resetParameters}
          onToggleDepthReference={() => setShowDepthReference((current) => !current)}
          showDepthReference={showDepthReference}
        />
      ) : (
        <button
          className="pointer-events-auto absolute top-5 right-5 inline-flex items-center gap-2 rounded-md border border-white/25 bg-slate-950/78 px-3 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur transition hover:border-white/45 hover:text-white"
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

type IslandSliderKey = keyof IslandGeneratorParameters
type FieldSliderKey = keyof WaterFieldParameters
type TuningGroupId = 'depth' | 'island' | 'ripples'
type MaterialSliderKey =
  | 'ripplesRatio'
  | 'ripplesSlopeFrequency'
  | 'ripplesBreakupEnd'
  | 'ripplesBreakupFrequency'
  | 'ripplesBreakupSize'
  | 'ripplesBreakupStart'
  | 'ripplesNoiseFrequency'
  | 'ripplesNoiseOffset'
  | 'ripplesNoiseStrength'
  | 'ripplesReachEnd'
  | 'ripplesReachStart'
  | 'shoreEdge'
  | 'windStrength'
  | 'windTimeFrequency'

type SliderConfig<Key extends string> = {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

const ISLAND_SLIDERS = [
  { key: 'variant', label: 'shape variant', max: 50, min: 0, step: 1 },
  { key: 'size', label: 'island size', max: 1.25, min: 0.75, step: 0.01 },
  { key: 'detail', label: 'outline detail', max: 128, min: 32, step: 4 },
  { key: 'lobes', label: 'big lobes', max: 1.8, min: 0, step: 0.05 },
  { key: 'coast', label: 'coast cuts', max: 2, min: 0, step: 0.05 },
  { key: 'naturalness', label: 'rough asymmetry', max: 1.8, min: 0, step: 0.05 },
] satisfies readonly SliderConfig<IslandSliderKey>[]

const FIELD_SLIDERS = [
  { key: 'depthContourOffsetMeters', label: 'depth contour offset', max: 12, min: -6, step: 0.1 },
  {
    key: 'depthContourVariationMeters',
    label: 'depth contour variation',
    max: 14,
    min: 0,
    step: 0.1,
  },
  {
    key: 'depthContourNoiseFrequency',
    label: 'depth contour scale',
    max: 0.18,
    min: 0.005,
    step: 0.005,
  },
  {
    key: 'depthContourCollapseMeters',
    label: 'depth contour collapse',
    max: 12,
    min: 0,
    step: 0.1,
  },
  {
    key: 'depthContourCollapseScale',
    label: 'collapse pocket size',
    max: 1.4,
    min: 0.15,
    step: 0.05,
  },
  { key: 'depthReach', label: 'depth reach', max: 70, min: 4, step: 1 },
  { key: 'depthExponent', label: 'depth curve', max: 2, min: 0.45, step: 0.01 },
  { key: 'depthNoiseStrength', label: 'field noise', max: 0.14, min: 0, step: 0.001 },
  { key: 'depthNoiseFrequency', label: 'field noise size', max: 0.16, min: 0.001, step: 0.001 },
  { key: 'shoreBandMeters', label: 'shore width', max: 10, min: 0, step: 0.05 },
  { key: 'shoreFeatherMeters', label: 'shore feather', max: 4, min: 0.02, step: 0.02 },
  { key: 'shoreVariationMeters', label: 'shore variation', max: 5, min: 0, step: 0.05 },
  { key: 'shoreNoiseFrequency', label: 'shore variation size', max: 0.35, min: 0.002, step: 0.002 },
] satisfies readonly SliderConfig<FieldSliderKey>[]

const MATERIAL_SLIDERS = [
  { key: 'ripplesRatio', label: 'ripple amount', max: 1, min: 0, step: 0.01 },
  { key: 'ripplesSlopeFrequency', label: 'ripple count', max: 40, min: 1, step: 0.1 },
  { key: 'ripplesNoiseStrength', label: 'ripple noise amount', max: 1, min: 0, step: 0.01 },
  { key: 'ripplesNoiseFrequency', label: 'ripple noise size', max: 0.7, min: 0, step: 0.005 },
  { key: 'ripplesNoiseOffset', label: 'ripple breakup', max: 1.5, min: 0.04, step: 0.005 },
  { key: 'ripplesBreakupStart', label: 'breakup start', max: 1, min: 0, step: 0.01 },
  { key: 'ripplesBreakupEnd', label: 'breakup full', max: 1, min: 0.05, step: 0.01 },
  { key: 'ripplesBreakupFrequency', label: 'break spacing', max: 0.45, min: 0.005, step: 0.005 },
  { key: 'ripplesBreakupSize', label: 'break size', max: 0.95, min: 0, step: 0.01 },
  { key: 'ripplesReachStart', label: 'ripple near', max: 0.6, min: 0, step: 0.01 },
  { key: 'ripplesReachEnd', label: 'ripple far', max: 1, min: 0.05, step: 0.01 },
  { key: 'shoreEdge', label: 'shore line', max: 0.55, min: 0.005, step: 0.005 },
  { key: 'windStrength', label: 'wind strength', max: 1.6, min: 0, step: 0.01 },
  { key: 'windTimeFrequency', label: 'wind speed', max: 0.6, min: 0, step: 0.005 },
] satisfies readonly SliderConfig<MaterialSliderKey>[]

function WaterTunePanel({
  copyStatus,
  fieldParameters,
  islandParameters,
  materialParameters,
  onClose,
  onCopy,
  onFieldChange,
  onIslandChange,
  onMaterialChange,
  onReset,
  onToggleDepthReference,
  showDepthReference,
}: {
  copyStatus: CopyStatus
  fieldParameters: WaterFieldParameters
  islandParameters: IslandGeneratorParameters
  materialParameters: LandrushWaterEffectParameters
  onClose: () => void
  onCopy: () => void
  onFieldChange: (key: FieldSliderKey, value: number) => void
  onIslandChange: (key: IslandSliderKey, value: number) => void
  onMaterialChange: (key: MaterialSliderKey, value: number) => void
  onReset: () => void
  onToggleDepthReference: () => void
  showDepthReference: boolean
}) {
  const CopyIcon = copyStatus === 'copied' ? Check : Copy
  const DepthReferenceIcon = showDepthReference ? EyeOff : Eye
  const copyLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'
  const depthReferenceLabel = showDepthReference ? 'Hide contour' : 'View contour'
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TuningGroupId, boolean>>({
    depth: false,
    island: false,
    ripples: false,
  })
  const toggleGroup = (group: TuningGroupId) => {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  return (
    <section className="pointer-events-auto absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[340px] overflow-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">Water tuning</div>
          <div className="mt-0.5 text-xs text-white/58">field + Bruno mask</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded border border-white/25 px-2.5 py-1 text-xs text-white/76 transition hover:border-white/45 hover:text-white"
            onClick={onCopy}
            type="button"
          >
            <CopyIcon aria-hidden className="size-3.5" />
            {copyLabel}
          </button>
          <button
            className="rounded border border-white/25 px-2.5 py-1 text-xs text-white/76 transition hover:border-white/45 hover:text-white"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
          <button
            aria-label="Close sliders"
            className="inline-flex size-7 items-center justify-center rounded border border-white/25 text-white/76 transition hover:border-white/45 hover:text-white"
            onClick={onClose}
            title="Close sliders"
            type="button"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <TuningGroup
          collapsed={collapsedGroups.island}
          onToggle={() => toggleGroup('island')}
          title="Island shape"
        >
          {ISLAND_SLIDERS.map(({ key, ...slider }) => (
            <WaterSlider
              key={key}
              {...slider}
              onChange={(value) => onIslandChange(key, value)}
              value={islandParameters[key]}
            />
          ))}
        </TuningGroup>

        <TuningGroup
          action={
            <button
              aria-pressed={showDepthReference}
              className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/70 transition hover:border-white/40 hover:text-white"
              onClick={onToggleDepthReference}
              type="button"
            >
              <DepthReferenceIcon aria-hidden className="size-3.5" />
              {depthReferenceLabel}
            </button>
          }
          collapsed={collapsedGroups.depth}
          onToggle={() => toggleGroup('depth')}
          title="Depth field"
        >
          {FIELD_SLIDERS.map(({ key, ...slider }) => (
            <WaterSlider
              key={key}
              {...slider}
              onChange={(value) => onFieldChange(key, value)}
              value={fieldParameters[key]}
            />
          ))}
        </TuningGroup>

        <TuningGroup
          collapsed={collapsedGroups.ripples}
          onToggle={() => toggleGroup('ripples')}
          title="Ripples"
        >
          {MATERIAL_SLIDERS.map(({ key, ...slider }) => (
            <WaterSlider
              key={key}
              {...slider}
              onChange={(value) => onMaterialChange(key, value)}
              value={materialParameters[key]}
            />
          ))}
        </TuningGroup>
      </div>
    </section>
  )
}

function TuningGroup({
  action,
  children,
  collapsed,
  onToggle,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  collapsed: boolean
  onToggle: () => void
  title: string
}) {
  const ToggleIcon = collapsed ? ChevronRight : ChevronDown

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 border-white/15 border-b pb-1">
        <button
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/62 uppercase tracking-[0.08em] transition hover:text-white/82"
          onClick={onToggle}
          type="button"
        >
          <ToggleIcon aria-hidden className="size-3.5" />
          {title}
        </button>
        {action}
      </div>
      {collapsed ? null : <div className="grid gap-2.5">{children}</div>}
    </div>
  )
}

function WaterSlider({
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
        <span className="text-white/72">{label}</span>
        <input
          className="h-6 w-16 rounded border border-white/18 bg-white/8 px-1.5 text-right font-mono text-[11px] text-white outline-none focus:border-cyan-300/70"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={step}
          type="number"
          value={formatSliderValue(value, step)}
        />
      </span>
      <input
        className="h-5 w-full accent-cyan-300"
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

function formatSliderValue(value: number, step: number) {
  if (step < 0.005) return value.toFixed(3)
  if (step < 1) return value.toFixed(2)
  return String(Math.round(value))
}
