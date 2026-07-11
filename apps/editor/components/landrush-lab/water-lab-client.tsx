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
  createSmoothedWaterPerimeter,
  createWaterFieldTexture,
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
import { WATER_MATERIAL_SLIDERS } from './water-material-sliders'
import { measureWaterLab, WATER_REFERENCE, waterMetricGates } from './water-metrics'
import {
  createWaveDepthFieldTexture,
  type WaterArtifactDiagnostics,
  type WaterMaterialFactory,
  WaterScene,
} from './water-scene'
import { getWaterViewPreset } from './water-view-presets'

declare global {
  interface Window {
    __LANDRUSH_WATER_LAB__?: unknown
  }
}

type CopyStatus = 'copied' | 'failed' | 'idle'
type ArtifactDiagnosticKey = keyof WaterArtifactDiagnostics
type DepthTexturePreviewState = {
  histogram: readonly number[]
  resolution: number
  stats: {
    blackAt: number
    max: number
    median: number
    min: number
    p10: number
    p90: number
    sentinelPercent: number
    waterPercent: number
    whiteAt: number
  }
  url: string
}

const ARTIFACT_DIAGNOSTICS_DEFAULTS = {
  expandLand: false,
  hideWater: false,
  liftLand: false,
  maskLandWater: false,
  opaqueWater: false,
  showDepthTexture: false,
} satisfies WaterArtifactDiagnostics

const ARTIFACT_DIAGNOSTIC_BUTTONS = [
  { key: 'opaqueWater', label: 'Opaque water' },
  { key: 'hideWater', label: 'Hide water' },
  { key: 'maskLandWater', label: 'Mask land water' },
  { key: 'showDepthTexture', label: 'Depth texture' },
  { key: 'liftLand', label: 'Lift land' },
  { key: 'expandLand', label: 'Expand land' },
] satisfies readonly { key: ArtifactDiagnosticKey; label: string }[]

export type WaterLabMaterialParameters = LandrushWaterEffectParameters &
  Partial<Record<WaterLabBodyMaterialKey, number>>

export type WaterLabMaterialSliderConfig = SliderConfig<MaterialSliderKey>
export type WaterLabMaterialToggleConfig = ToggleConfig<MaterialToggleKey>

type WaterLabClientProps = {
  labTitle?: string
  materialDefaults?: WaterLabMaterialParameters
  materialSliders?: readonly WaterLabMaterialSliderConfig[]
  materialToggles?: readonly WaterLabMaterialToggleConfig[]
  panelSubtitle?: string
  waterMaterialFactory?: WaterMaterialFactory
}

export function WaterLabClient({
  labTitle = 'Landrush water lab',
  materialDefaults = LANDRUSH_WATER_EFFECT_PARAMETERS,
  materialSliders = MATERIAL_SLIDERS,
  materialToggles = [],
  panelSubtitle = 'field + Bruno mask',
  waterMaterialFactory,
}: WaterLabClientProps = {}) {
  const searchParams = useSearchParams()
  const preset = getWaterViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const debugWaterLayer = searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const waveDepthTextureEnabled = 'waveDepthSmooth' in materialDefaults
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [artifactDiagnostics, setArtifactDiagnostics] = useState<WaterArtifactDiagnostics>({
    ...ARTIFACT_DIAGNOSTICS_DEFAULTS,
  })
  const [depthTexturePreview, setDepthTexturePreview] = useState<DepthTexturePreviewState | null>(
    null,
  )
  const [depthTexturePreviewZoom, setDepthTexturePreviewZoom] = useState(1)
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
  const [materialParameters, setMaterialParameters] = useState<WaterLabMaterialParameters>(() => ({
    ...materialDefaults,
  }))
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
  const waterSceneKey = useMemo(
    () =>
      JSON.stringify({
        field: {
          depthContourCollapseMeters: fieldParameters.depthContourCollapseMeters,
          depthContourCollapseScale: fieldParameters.depthContourCollapseScale,
          depthContourNoiseFrequency: fieldParameters.depthContourNoiseFrequency,
          depthContourOffsetMeters: fieldParameters.depthContourOffsetMeters,
          depthContourVariationMeters: fieldParameters.depthContourVariationMeters,
          shoreBandMeters: fieldParameters.shoreBandMeters,
          shoreFeatherMeters: fieldParameters.shoreFeatherMeters,
          shoreNoiseFrequency: fieldParameters.shoreNoiseFrequency,
          shoreVariationMeters: fieldParameters.shoreVariationMeters,
        },
        island: waterFieldIslandParameters,
        resolution: terrainFieldResolution,
      }),
    [
      fieldParameters.depthContourCollapseMeters,
      fieldParameters.depthContourCollapseScale,
      fieldParameters.depthContourNoiseFrequency,
      fieldParameters.depthContourOffsetMeters,
      fieldParameters.depthContourVariationMeters,
      fieldParameters.shoreBandMeters,
      fieldParameters.shoreFeatherMeters,
      fieldParameters.shoreNoiseFrequency,
      fieldParameters.shoreVariationMeters,
      terrainFieldResolution,
      waterFieldIslandParameters,
    ],
  )

  const resetParameters = () => {
    setHasUnappliedIslandChanges(false)
    setPreviewResolution(WATER_FIELD_PREVIEW_RESOLUTION)
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setVisibleIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setWaterFieldIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setTerrainFieldResolution(WATER_FIELD_RESOLUTION)
    setFieldParameters({ ...WATER_LAB_DEFAULT_FIELD_PARAMETERS })
    setElevationParameters({ ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS })
    setMaterialParameters({ ...materialDefaults })
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
      island: { ...islandParameters },
      preview: {
        appliedIsland: { ...waterFieldIslandParameters },
        resolution: previewResolution,
        terrainFieldResolution,
        visibleIsland: { ...visibleIslandParameters },
      },
      elevation: { ...elevationParameters },
      field: { ...fieldParameters },
      material: { ...materialParameters },
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
    if (!artifactDiagnostics.showDepthTexture) {
      setDepthTexturePreview(null)
      return
    }

    let cancelled = false
    const previewTimer = window.setTimeout(() => {
      const texture = createWaterFieldTexture({
        parameters: fieldParameters,
        perimeter: createSmoothedWaterPerimeter(waterFieldIsland.perimeter.points),
        planeSize: WATER_PLANE_SIZE,
        resolution: terrainFieldResolution,
      })
      const waveDepthTexture = createWaveDepthFieldTexture(
        texture,
        fieldParameters,
        materialParameters.waveDepthSmooth ?? 0,
      )
      const image = waveDepthTexture.image as {
        data?: Uint8Array
        height?: number
        width?: number
      }
      const bytes = image.data
      const width = image.width ?? 0
      const height = image.height ?? 0
      if (!bytes || width <= 0 || height <= 0) {
        waveDepthTexture.dispose()
        texture.dispose()
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        waveDepthTexture.dispose()
        texture.dispose()
        return
      }

      const preview = context.createImageData(width, height)
      const visibleWaveDepthValues: number[] = []
      let sentinelPixels = 0
      for (let index = 0; index < bytes.length; index += 4) {
        const alpha = bytes[index + 3] ?? 0
        const waveDepth = (bytes[index] ?? 0) / 255
        if (alpha <= 0 || waveDepth <= 0.000001) {
          sentinelPixels += 1
          continue
        }

        if (waveDepth > 0.000001 && waveDepth < 0.999999) {
          visibleWaveDepthValues.push(waveDepth)
        }
      }
      visibleWaveDepthValues.sort((a, b) => a - b)
      const waterMin = visibleWaveDepthValues[0] ?? 0
      const waterMax = visibleWaveDepthValues.at(-1) ?? 1
      const waterP10 = percentile(visibleWaveDepthValues, 0.1)
      const waterMedian = percentile(visibleWaveDepthValues, 0.5)
      const waterP90 = percentile(visibleWaveDepthValues, 0.9)
      const histogram = createDepthHistogram(visibleWaveDepthValues, 48)
      const contrastLow = waterP10
      const contrastHigh = Math.max(waterP90, contrastLow + 0.000001)
      const waterRange = contrastHigh - contrastLow
      for (let index = 0; index < bytes.length; index += 4) {
        const alpha = bytes[index + 3] ?? 0
        const waveDepth = (bytes[index] ?? 0) / 255
        if (alpha <= 0 || waveDepth <= 0.000001) {
          preview.data[index] = 10
          preview.data[index + 1] = 14
          preview.data[index + 2] = 18
          preview.data[index + 3] = 0
          continue
        }

        const normalizedDepth = Math.max(0, Math.min(1, (waveDepth - contrastLow) / waterRange))
        const depthValue = Math.round(normalizedDepth * 255)
        preview.data[index] = depthValue
        preview.data[index + 1] = depthValue
        preview.data[index + 2] = depthValue
        preview.data[index + 3] = 255
      }
      context.putImageData(preview, 0, 0)

      if (!cancelled) {
        const waterPixelPercent = (visibleWaveDepthValues.length / (width * height)) * 100
        setDepthTexturePreview({
          histogram,
          resolution: width,
          stats: {
            blackAt: waterP10,
            max: waterMax,
            median: waterMedian,
            min: waterMin,
            p10: waterP10,
            p90: waterP90,
            sentinelPercent: (sentinelPixels / (width * height)) * 100,
            waterPercent: waterPixelPercent,
            whiteAt: waterP90,
          },
          url: canvas.toDataURL('image/png'),
        })
      }
      waveDepthTexture.dispose()
      texture.dispose()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(previewTimer)
    }
  }, [
    artifactDiagnostics.showDepthTexture,
    fieldParameters,
    materialParameters.waveDepthSmooth,
    terrainFieldResolution,
    waterFieldIsland,
  ])

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
        artifactDiagnostics={artifactDiagnostics}
        elevationParameters={elevationParameters}
        fieldRevisionKey={waterSceneKey}
        fieldParameters={fieldParameters}
        debugLayer={debugWaterLayer}
        island={island}
        materialParameters={materialParameters}
        preset={preset}
        terrainFieldResolution={terrainFieldResolution}
        showDepthReference={showDepthReference}
        waterFieldIsland={waterFieldIsland}
        waterMaterialFactory={waterMaterialFactory}
        waveDepthTextureEnabled={waveDepthTextureEnabled}
      />
      {!clean ? (
        <section className="pointer-events-none absolute left-5 top-5 max-w-[390px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
          <div className="text-sm font-semibold tracking-wide">{labTitle}</div>
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
          materialSliders={materialSliders}
          materialToggles={materialToggles}
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
              (current) => ({ ...current, [key]: value }) as WaterLabMaterialParameters,
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
          panelSubtitle={panelSubtitle}
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
      {debug ? (
        <ArtifactDiagnosticsBar
          diagnostics={artifactDiagnostics}
          onToggle={(key) =>
            setArtifactDiagnostics((current) => ({ ...current, [key]: !current[key] }))
          }
        />
      ) : null}
      {artifactDiagnostics.showDepthTexture ? (
        <DepthTexturePreview
          onZoomChange={setDepthTexturePreviewZoom}
          preview={depthTexturePreview}
          zoom={depthTexturePreviewZoom}
        />
      ) : null}
    </main>
  )
}

type IslandSliderKey = keyof WaterLabIslandParameters
type ElevationSliderKey = keyof IslandElevationParameters
type FieldSliderKey = keyof WaterFieldParameters
type TuningGroupId = 'areas' | 'island' | 'ripples'
type WaveBodyMaterialSliderKey =
  | 'waveBodyAheadBrightness'
  | 'waveBodyAheadLagSeconds'
  | 'waveBodyAheadRatio'
  | 'waveBodyAheadWidth'
  | 'waveBodyBehindBrightness'
  | 'waveBodyBehindLagSeconds'
  | 'waveBodyBehindRatio'
  | 'waveBodyBehindWidth'
  | 'waveDepthSmooth'
  | 'waveSectorCount'
  | 'waveSectorRotationSpeed'
  | 'waveSectorTimeOffset'
type WaveBodyMaterialToggleKey = 'waveSectorEnabled'
type WaterLabBodyMaterialKey = WaveBodyMaterialSliderKey | WaveBodyMaterialToggleKey
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
  | WaveBodyMaterialSliderKey
type MaterialToggleKey = WaveBodyMaterialToggleKey
type MaterialControlKey = MaterialSliderKey | MaterialToggleKey

type SliderConfig<Key extends string> = {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

type ToggleConfig<Key extends string> = {
  key: Key
  label: string
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
  { key: 'depthReach', label: 'depth reach', max: 70, min: 1, step: 1 },
  { key: 'depthExponent', label: 'depth curve', max: 2, min: 0.45, step: 0.01 },
  { key: 'depthNoiseStrength', label: 'field noise', max: 0.14, min: 0, step: 0.001 },
  { key: 'depthNoiseFrequency', label: 'field noise size', max: 0.16, min: 0.001, step: 0.001 },
  { key: 'shoreBandMeters', label: 'shore width', max: 10, min: 0, step: 0.05 },
  { key: 'shoreFeatherMeters', label: 'shore feather', max: 4, min: 0.02, step: 0.02 },
  { key: 'shoreVariationMeters', label: 'shore variation', max: 5, min: 0, step: 0.05 },
  { key: 'shoreNoiseFrequency', label: 'shore variation size', max: 0.35, min: 0.002, step: 0.002 },
  { key: 'edgeFadeDistance', label: 'edge fade distance', max: 80, min: 0, step: 0.5 },
] satisfies readonly SliderConfig<FieldSliderKey>[]

export const MATERIAL_SLIDERS =
  WATER_MATERIAL_SLIDERS satisfies readonly WaterLabMaterialSliderConfig[]

function WaterTunePanel({
  copyStatus,
  elevationParameters,
  fieldParameters,
  islandParameters,
  materialParameters,
  materialSliders,
  materialToggles,
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
  panelSubtitle,
  previewResolution,
  showDepthReference,
  hasUnappliedIslandChanges,
  usingPreviewResolution,
}: {
  copyStatus: CopyStatus
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  islandParameters: WaterLabIslandParameters
  materialParameters: WaterLabMaterialParameters
  materialSliders: readonly WaterLabMaterialSliderConfig[]
  materialToggles: readonly WaterLabMaterialToggleConfig[]
  onClose: () => void
  onCopy: () => void
  onElevationChange: (key: ElevationSliderKey, value: number) => void
  onFieldChange: (key: FieldSliderKey, value: number) => void
  onIslandChange: (key: IslandSliderKey, value: number) => void
  onMaterialChange: (key: MaterialControlKey, value: number) => void
  onApplyFullResolution: () => void
  onApplyPreviewResolution: () => void
  onPreviewResolutionChange: (value: number) => void
  onReset: () => void
  onToggleDepthReference: () => void
  panelSubtitle: string
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
          <div className="mt-0.5 text-xs text-white/58">{panelSubtitle}</div>
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
          {materialToggles.map(({ key, label }) => (
            <WaterToggle
              key={key}
              label={label}
              onChange={(enabled) => onMaterialChange(key, enabled ? 1 : 0)}
              value={(materialParameters[key] ?? 0) > 0.5}
            />
          ))}
          {materialSliders.map(({ key, ...slider }) => (
            <WaterSlider
              key={key}
              {...slider}
              onChange={(value) => onMaterialChange(key, value)}
              value={materialParameters[key] ?? 0}
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

function WaterToggle({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: boolean) => void
  value: boolean
}) {
  return (
    <button
      aria-pressed={value}
      className="flex h-8 items-center justify-between rounded border border-white/18 bg-white/8 px-2 text-xs transition hover:border-white/36 hover:bg-white/12"
      onClick={() => onChange(!value)}
      type="button"
    >
      <span className="text-white/72">{label}</span>
      <span
        className={
          value
            ? 'rounded bg-cyan-300/18 px-1.5 py-0.5 font-semibold text-[10px] text-cyan-100 uppercase'
            : 'rounded bg-white/10 px-1.5 py-0.5 font-semibold text-[10px] text-white/48 uppercase'
        }
      >
        {value ? 'On' : 'Off'}
      </span>
    </button>
  )
}

function ArtifactDiagnosticsBar({
  diagnostics,
  onToggle,
}: {
  diagnostics: WaterArtifactDiagnostics
  onToggle: (key: ArtifactDiagnosticKey) => void
}) {
  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/20 bg-slate-950/76 p-2 text-xs text-white shadow-xl backdrop-blur">
      {ARTIFACT_DIAGNOSTIC_BUTTONS.map(({ key, label }) => {
        const enabled = diagnostics[key]
        return (
          <button
            aria-pressed={enabled}
            className={
              enabled
                ? 'rounded border border-cyan-200/60 bg-cyan-300/18 px-2.5 py-1.5 font-medium text-cyan-50'
                : 'rounded border border-white/20 bg-white/8 px-2.5 py-1.5 font-medium text-white/68 transition hover:border-white/38 hover:text-white'
            }
            key={key}
            onClick={() => onToggle(key)}
            type="button"
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function DepthTexturePreview({
  onZoomChange,
  preview,
  zoom,
}: {
  onZoomChange: (value: number) => void
  preview: DepthTexturePreviewState | null
  zoom: number
}) {
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 })
  const decreaseZoom = () => onZoomChange(Math.max(1, Math.round((zoom / 1.25) * 100) / 100))
  const increaseZoom = () => onZoomChange(Math.min(12, Math.round(zoom * 1.25 * 100) / 100))
  const changeZoomFromWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setZoomOrigin({
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    })
    const nextZoom = event.deltaY < 0 ? zoom * 1.18 : zoom / 1.18
    onZoomChange(Math.max(1, Math.min(12, Math.round(nextZoom * 100) / 100)))
  }

  return (
    <div className="absolute bottom-20 left-5 w-[520px] max-w-[calc(100vw-2.5rem)] rounded-md border border-white/20 bg-slate-950/76 p-2 text-white shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-white/62 uppercase tracking-[0.08em]">
        <span>Depth texture</span>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            className="rounded border border-white/20 px-1.5 py-0.5 text-white/70 transition hover:border-white/40 hover:text-white"
            onClick={decreaseZoom}
            type="button"
          >
            -
          </button>
          <span className="min-w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className="rounded border border-white/20 px-1.5 py-0.5 text-white/70 transition hover:border-white/40 hover:text-white"
            onClick={increaseZoom}
            type="button"
          >
            +
          </button>
          <span className="ml-1">{preview ? `${preview.resolution}px` : 'loading'}</span>
        </div>
      </div>
      {preview ? (
        <div
          className="pointer-events-auto aspect-square w-full overflow-hidden rounded border border-white/15 bg-slate-950/40"
          onWheel={changeZoomFromWheel}
        >
          <img
            alt="Packed water depth texture"
            className="size-full object-cover [image-rendering:pixelated]"
            src={preview.url}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
            }}
          />
        </div>
      ) : (
        <div className="aspect-square w-full rounded border border-white/15 bg-white/8" />
      )}
      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[10px] text-white/50">
        <span>wave depth p10-p90</span>
        <span>p10 {preview ? formatDepthPercent(preview.stats.p10) : '--'}</span>
        <span>p90 {preview ? formatDepthPercent(preview.stats.p90) : '--'}</span>
        <span>min {preview ? formatDepthPercent(preview.stats.min) : '--'}</span>
        <span>mid {preview ? formatDepthPercent(preview.stats.median) : '--'}</span>
        <span>max {preview ? formatDepthPercent(preview.stats.max) : '--'}</span>
        <span>visible {preview ? `${preview.stats.waterPercent.toFixed(1)}%` : '--'}</span>
        <span>sentinel {preview ? `${preview.stats.sentinelPercent.toFixed(1)}%` : '--'}</span>
        <span>smoothed texture</span>
      </div>
      {preview ? <DepthHistogram preview={preview} /> : null}
    </div>
  )
}

function DepthHistogram({ preview }: { preview: DepthTexturePreviewState }) {
  const maxBucket = Math.max(...preview.histogram, 1)
  const whiteMarkerLeft = `${Math.max(0, Math.min(100, preview.stats.whiteAt * 100))}%`
  const blackMarkerLeft = `${Math.max(0, Math.min(100, preview.stats.blackAt * 100))}%`

  return (
    <div className="mt-2">
      <div className="relative flex h-16 items-end gap-px rounded border border-white/15 bg-black/28 px-1 pt-2 pb-1">
        {preview.histogram.map((count, index) => (
          <div
            className="flex-1 rounded-t-[1px] bg-cyan-200/70"
            key={`${index}-${count}`}
            style={{ height: `${Math.max(1, (count / maxBucket) * 100)}%` }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-1 bottom-1 w-0.5 bg-sky-300"
          title="full white"
          style={{ left: whiteMarkerLeft }}
        />
        <div
          className="pointer-events-none absolute top-1 bottom-1 w-0.5 bg-red-400"
          title="full black"
          style={{ left: blackMarkerLeft }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/42">
        <span>0%</span>
        <span>
          <span className="text-sky-300">white</span>
          <span className="px-1">/</span>
          <span className="text-red-400">black</span>
        </span>
        <span>100%</span>
      </div>
    </div>
  )
}

function percentile(sortedValues: readonly number[], ratio: number) {
  if (sortedValues.length === 0) return 0
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * ratio)),
  )
  return sortedValues[index] ?? 0
}

function createDepthHistogram(values: readonly number[], bucketCount: number) {
  const buckets = Array.from({ length: bucketCount }, () => 0)
  for (const value of values) {
    const bucket = Math.max(0, Math.min(bucketCount - 1, Math.floor(value * bucketCount)))
    buckets[bucket] = (buckets[bucket] ?? 0) + 1
  }
  return buckets
}

function formatDepthPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
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
  const changeValue = (rawValue: string) => {
    if (rawValue === '') return
    const nextValue = Number(rawValue)
    if (!Number.isFinite(nextValue)) return
    onChange(Math.max(min, Math.min(max, nextValue)))
  }

  return (
    <label className="grid gap-1 text-xs">
      <span className="flex items-center justify-between gap-3">
        <span className="text-white/72">{label}</span>
        <input
          className="h-6 w-16 rounded border border-white/18 bg-white/8 px-1.5 text-right font-mono text-[11px] text-white outline-none focus:border-cyan-300/70"
          max={max}
          min={min}
          onChange={(event) => changeValue(event.currentTarget.value)}
          step={step}
          type="number"
          value={formatSliderValue(value, step)}
        />
      </span>
      <input
        className="h-5 w-full accent-cyan-300"
        max={max}
        min={min}
        onChange={(event) => changeValue(event.currentTarget.value)}
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
