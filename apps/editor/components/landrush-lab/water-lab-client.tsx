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
import {
  WATER_FIELD_PREVIEW_RESOLUTION,
  WATER_FIELD_RESOLUTION,
  type WaterFieldParameters,
} from './water-field-texture'
import {
  generateWaterLabIsland,
  WATER_LAB_ISLAND_SLIDERS as ISLAND_SLIDERS,
  type IslandElevationParameters,
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
import { measureWaterLab, WATER_REFERENCE, waterMetricGates } from './water-metrics'
import { WaterScene } from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_WATER_LAB__?: unknown
  }
}

type CopyStatus = 'copied' | 'failed' | 'idle'

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
  const [hasUnappliedIslandChanges, setHasUnappliedIslandChanges] = useState(false)
  const [previewResolution, setPreviewResolution] = useState(WATER_FIELD_PREVIEW_RESOLUTION)
  const [islandParameters, setIslandParameters] = useState<WaterLabIslandParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
  const [visibleIslandParameters, setVisibleIslandParameters] = useState<WaterLabIslandParameters>(
    () => ({
      ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
    }),
  )
  const [waterFieldIslandParameters, setWaterFieldIslandParameters] =
    useState<WaterLabIslandParameters>(() => ({
      ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
    }))
  const [terrainFieldResolution, setTerrainFieldResolution] = useState(WATER_FIELD_RESOLUTION)
  const [fieldParameters, setFieldParameters] = useState<WaterFieldParameters>(() => ({
    ...WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  }))
  const [elevationParameters, setElevationParameters] = useState<IslandElevationParameters>(() => ({
    ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  }))
  const [materialParameters, setMaterialParameters] = useState<LandrushWaterEffectParameters>(
    () => ({
      ...LANDRUSH_WATER_EFFECT_PARAMETERS,
    }),
  )
  const island = useMemo(
    () => generateWaterLabIsland(visibleIslandParameters),
    [visibleIslandParameters],
  )
  const waterFieldIsland = useMemo(
    () => generateWaterLabIsland(waterFieldIslandParameters),
    [waterFieldIslandParameters],
  )
  const metrics = useMemo(
    () => measureWaterLab(island, WATER_PLANE_SIZE, materialParameters, fieldParameters),
    [fieldParameters, island, materialParameters],
  )
  const gates = useMemo(() => waterMetricGates(metrics), [metrics])

  const resetParameters = () => {
    setHasUnappliedIslandChanges(false)
    setPreviewResolution(WATER_FIELD_PREVIEW_RESOLUTION)
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setVisibleIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setWaterFieldIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setTerrainFieldResolution(WATER_FIELD_RESOLUTION)
    setFieldParameters({ ...WATER_LAB_DEFAULT_FIELD_PARAMETERS })
    setElevationParameters({ ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS })
    setMaterialParameters({ ...LANDRUSH_WATER_EFFECT_PARAMETERS })
  }

  const changeIslandParameter = (key: IslandSliderKey, value: number) => {
    const nextParameters = { ...islandParameters, [key]: value }
    setIslandParameters(nextParameters)

    if (key === 'variant') {
      setVisibleIslandParameters(nextParameters)
      setWaterFieldIslandParameters(nextParameters)
      setTerrainFieldResolution(previewResolution)
      setHasUnappliedIslandChanges(false)
    } else {
      setVisibleIslandParameters((current) => ({ ...current, [key]: value }))
      setHasUnappliedIslandChanges(true)
    }
  }

  const applyIslandWaterField = (resolution: number) => {
    setVisibleIslandParameters({ ...islandParameters })
    setWaterFieldIslandParameters({ ...islandParameters })
    setTerrainFieldResolution(resolution)
    setHasUnappliedIslandChanges(false)
  }

  const copyParameters = async () => {
    const snapshot = {
      island: Object.fromEntries(ISLAND_SLIDERS.map(({ key }) => [key, islandParameters[key]])),
      preview: {
        appliedIsland: Object.fromEntries(
          ISLAND_SLIDERS.map(({ key }) => [key, waterFieldIslandParameters[key]]),
        ),
        resolution: previewResolution,
        terrainFieldResolution,
        visibleIsland: Object.fromEntries(
          ISLAND_SLIDERS.map(({ key }) => [key, visibleIslandParameters[key]]),
        ),
      },
      elevation: Object.fromEntries(
        ELEVATION_SLIDERS.map(({ key }) => [key, elevationParameters[key]]),
      ),
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
        elevation: elevationParameters,
        field: fieldParameters,
        island: islandParameters,
        material: materialParameters,
        previewResolution,
        terrainFieldResolution,
        visibleIsland: visibleIslandParameters,
        waterFieldIsland: waterFieldIslandParameters,
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
    elevationParameters,
    fieldParameters,
    frameP95,
    gates,
    islandParameters,
    terrainFieldResolution,
    materialParameters,
    metrics,
    preset.id,
    previewResolution,
    visibleIslandParameters,
    waterFieldIslandParameters,
  ])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      <WaterScene
        elevationParameters={elevationParameters}
        fieldParameters={fieldParameters}
        debugLayer={debugWaterLayer}
        island={island}
        materialParameters={materialParameters}
        preset={preset}
        terrainFieldResolution={terrainFieldResolution}
        showDepthReference={showDepthReference}
        waterFieldIsland={waterFieldIsland}
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
          elevationParameters={elevationParameters}
          onFieldChange={(key, value) =>
            setFieldParameters((current) => ({ ...current, [key]: value }))
          }
          onElevationChange={(key, value) =>
            setElevationParameters((current) => ({ ...current, [key]: value }))
          }
          onIslandChange={changeIslandParameter}
          onMaterialChange={(key, value) =>
            setMaterialParameters(
              (current) => ({ ...current, [key]: value }) as LandrushWaterEffectParameters,
            )
          }
          onApplyFullResolution={() => applyIslandWaterField(WATER_FIELD_RESOLUTION)}
          onApplyPreviewResolution={() => applyIslandWaterField(previewResolution)}
          onPreviewResolutionChange={(value) => {
            setPreviewResolution(Math.round(value))
            setHasUnappliedIslandChanges(true)
          }}
          onReset={resetParameters}
          onToggleDepthReference={() => setShowDepthReference((current) => !current)}
          previewResolution={previewResolution}
          showDepthReference={showDepthReference}
          hasUnappliedIslandChanges={hasUnappliedIslandChanges}
          usingPreviewResolution={terrainFieldResolution !== WATER_FIELD_RESOLUTION}
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

type IslandSliderKey = keyof WaterLabIslandParameters
type ElevationSliderKey = keyof IslandElevationParameters
type FieldSliderKey = keyof WaterFieldParameters
type TuningGroupId = 'areas' | 'island' | 'ripples'
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

const ELEVATION_SLIDERS = [
  { key: 'edgeLiftMeters', label: 'edge lift', max: 6, min: 0, step: 0.05 },
  { key: 'outerContourMeters', label: 'outside edge', max: 14, min: 0, step: 0.25 },
  { key: 'innerContourMeters', label: 'inside edge', max: 32, min: 1, step: 0.25 },
  { key: 'contourVariationMeters', label: 'edge variation', max: 10, min: 0, step: 0.25 },
  { key: 'contourNoiseFrequency', label: 'edge variation size', max: 0.2, min: 0.005, step: 0.005 },
  { key: 'cliffBandMergeThresholdMeters', label: 'band merge', max: 32, min: 0, step: 0.01 },
  { key: 'cliffBlockDepthMinMeters', label: 'depth out min', max: 18, min: 0, step: 0.05 },
  { key: 'cliffBlockDepthMaxMeters', label: 'depth out max', max: 18, min: 0, step: 0.05 },
  { key: 'cliffContrast', label: 'cliff contrast', max: 1, min: 0, step: 0.01 },
  { key: 'cliffToneVariation', label: 'tone variation', max: 1, min: 0, step: 0.01 },
  { key: 'cliffColorAverageRatio', label: 'color average', max: 1, min: 0, step: 0.01 },
] satisfies readonly SliderConfig<ElevationSliderKey>[]

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
  elevationParameters,
  fieldParameters,
  islandParameters,
  materialParameters,
  onClose,
  onCopy,
  onElevationChange,
  onFieldChange,
  onIslandChange,
  onMaterialChange,
  onApplyFullResolution,
  onApplyPreviewResolution,
  onPreviewResolutionChange,
  onReset,
  onToggleDepthReference,
  previewResolution,
  showDepthReference,
  hasUnappliedIslandChanges,
  usingPreviewResolution,
}: {
  copyStatus: CopyStatus
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  islandParameters: WaterLabIslandParameters
  materialParameters: LandrushWaterEffectParameters
  onClose: () => void
  onCopy: () => void
  onElevationChange: (key: ElevationSliderKey, value: number) => void
  onFieldChange: (key: FieldSliderKey, value: number) => void
  onIslandChange: (key: IslandSliderKey, value: number) => void
  onMaterialChange: (key: MaterialSliderKey, value: number) => void
  onApplyFullResolution: () => void
  onApplyPreviewResolution: () => void
  onPreviewResolutionChange: (value: number) => void
  onReset: () => void
  onToggleDepthReference: () => void
  previewResolution: number
  showDepthReference: boolean
  hasUnappliedIslandChanges: boolean
  usingPreviewResolution: boolean
}) {
  const CopyIcon = copyStatus === 'copied' ? Check : Copy
  const DepthReferenceIcon = showDepthReference ? EyeOff : Eye
  const copyLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'
  const depthReferenceLabel = showDepthReference ? 'Hide contour' : 'View contour'
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TuningGroupId, boolean>>({
    areas: false,
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
          action={
            <div className="flex items-center gap-1.5">
              <button
                className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-default disabled:opacity-45 disabled:hover:border-white/20 disabled:hover:text-white/70"
                disabled={!hasUnappliedIslandChanges}
                onClick={onApplyPreviewResolution}
                type="button"
              >
                Preview
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-default disabled:opacity-45 disabled:hover:border-white/20 disabled:hover:text-white/70"
                disabled={!hasUnappliedIslandChanges && !usingPreviewResolution}
                onClick={onApplyFullResolution}
                type="button"
              >
                <Check aria-hidden className="size-3.5" />
                Full
              </button>
            </div>
          }
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
          <WaterSlider
            label="preview resolution"
            max={WATER_FIELD_RESOLUTION}
            min={128}
            onChange={onPreviewResolutionChange}
            step={64}
            value={previewResolution}
          />
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
          collapsed={collapsedGroups.areas}
          onToggle={() => toggleGroup('areas')}
          title="Areas"
        >
          <TuningSubgroup title="Beach / depth contour">
            {FIELD_SLIDERS.map(({ key, ...slider }) => (
              <WaterSlider
                key={key}
                {...slider}
                onChange={(value) => onFieldChange(key, value)}
                value={fieldParameters[key]}
              />
            ))}
          </TuningSubgroup>
          <TuningSubgroup title="Raised island edge">
            {ELEVATION_SLIDERS.map(({ key, ...slider }) => (
              <WaterSlider
                key={key}
                {...slider}
                onChange={(value) => onElevationChange(key, value)}
                value={elevationParameters[key]}
              />
            ))}
          </TuningSubgroup>
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

function TuningSubgroup({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="grid gap-2.5">
      <div className="text-[10px] font-semibold text-white/46 uppercase tracking-[0.08em]">
        {title}
      </div>
      <div className="grid gap-2.5">{children}</div>
    </div>
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
