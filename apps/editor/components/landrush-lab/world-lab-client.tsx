'use client'

import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
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
import { WATER_FIELD_RESOLUTION, type WaterFieldParameters } from './water-field-texture'
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

type CopyStatus = 'copied' | 'failed' | 'idle'
type ElevationSliderKey = keyof IslandElevationParameters
type FieldSliderKey = keyof WaterFieldParameters
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

type WorldTuningGroupId =
  | 'grass'
  | 'island'
  | 'parcelHint'
  | 'parcels'
  | 'streets'
  | 'waterAreas'
  | 'waterEdge'
  | 'waterRipples'

const WORLD_GRASS_TUNING = {
  ...DEFAULT_GRASS_BLADE_TUNING,
  brightness: 0.68,
  density: 0.58,
  foliageOpacity: 0.24,
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
] satisfies readonly LabSliderConfig<FieldSliderKey>[]

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
] satisfies readonly LabSliderConfig<ElevationSliderKey>[]

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
] satisfies readonly LabSliderConfig<MaterialSliderKey>[]

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
  const debug = searchParams.get('debugLandrush') === '1'
  const debugWaterLayer = searchParams.get('debugWaterLayer') === 'shoreline' ? 'shoreline' : null
  const frameProfile = searchParams.get('frameProfile') === '1'
  const [showTunePanel, setShowTunePanel] = useState(() => searchParams.get('v') !== 'clean')
  const [showParcelHints, setShowParcelHints] = useState(() => searchParams.get('parcels') !== '0')
  const [showStreets, setShowStreets] = useState(() => searchParams.get('streets') !== '0')
  const [showDepthReference, setShowDepthReference] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [allocation, setAllocation] = useState<ParcelAllocationResult | null>(null)
  const [streetNetwork, setStreetNetwork] = useState<ParcelStreetNetwork | null>(null)
  const [terrainFieldResolution, setTerrainFieldResolution] = useState(WATER_FIELD_RESOLUTION)
  const [islandParameters, setIslandParameters] = useState<WaterLabIslandParameters>(() => ({
    ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
  }))
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
  const renderFieldParameters = useSettledRenderValue(fieldParameters, 160)
  const renderElevationParameters = useSettledRenderValue(elevationParameters, 160)
  const renderMaterialParameters = useSettledRenderValue(materialParameters, 120)
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
        renderMaterialParameters,
        renderFieldParameters,
      ),
    [island, renderFieldParameters, renderMaterialParameters],
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
        gates: parcelGates,
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
        elevation: elevationParameters,
        field: fieldParameters,
        gates: waterGates,
        material: materialParameters,
        metrics: waterMetrics,
        terrainFieldResolution,
      },
    }
    return () => {
      delete window.__LANDRUSH_WORLD_LAB__
    }
  }, [
    allocation,
    debug,
    elevationParameters,
    fieldParameters,
    frameP95,
    grassRoads.length,
    island,
    islandParameters,
    materialParameters,
    parcelMetrics,
    parcelParameters,
    parcelGates,
    preset.id,
    resolvedGrassTuning,
    showParcelHints,
    showStreets,
    streetNetwork,
    streetParameters,
    terrainFieldResolution,
    waterGates,
    waterMetrics,
  ])

  const resetParameters = () => {
    setShowDepthReference(false)
    setTerrainFieldResolution(WATER_FIELD_RESOLUTION)
    setIslandParameters({ ...WATER_LAB_DEFAULT_ISLAND_PARAMETERS })
    setFieldParameters({ ...WATER_LAB_DEFAULT_FIELD_PARAMETERS })
    setElevationParameters({ ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS })
    setMaterialParameters({ ...LANDRUSH_WATER_EFFECT_PARAMETERS })
    setGrassTuning({ ...WORLD_GRASS_TUNING })
    setParcelParameters({ ...DEFAULT_PARCEL_PARAMETERS })
    setParcelHintParameters({ ...DEFAULT_PARCEL_HINT_PARAMETERS })
    setStreetParameters({ ...DEFAULT_STREET_PARAMETERS })
    setShowParcelHints(true)
    setShowStreets(true)
  }

  const copyParameters = async () => {
    const snapshot = {
      preset: preset.id,
      visibility: {
        depthReference: showDepthReference,
        parcelHints: showParcelHints,
        streets: showStreets,
      },
      water: {
        elevation: Object.fromEntries(
          ELEVATION_SLIDERS.map(({ key }) => [key, elevationParameters[key]]),
        ),
        field: Object.fromEntries(FIELD_SLIDERS.map(({ key }) => [key, fieldParameters[key]])),
        material: Object.fromEntries(
          MATERIAL_SLIDERS.map(({ key }) => [key, materialParameters[key]]),
        ),
        terrainFieldResolution,
      },
      grass: Object.fromEntries(GRASS_SLIDERS.map(({ key }) => [key, resolvedGrassTuning[key]])),
      island: Object.fromEntries(ISLAND_SLIDERS.map(({ key }) => [key, islandParameters[key]])),
      parcels: Object.fromEntries(PARCEL_SLIDERS.map(({ key }) => [key, parcelParameters[key]])),
      parcelHint: Object.fromEntries(
        PARCEL_HINT_SLIDERS.map(({ key }) => [key, parcelHintParameters[key]]),
      ),
      streets: Object.fromEntries(STREET_SLIDERS.map(({ key }) => [key, streetParameters[key]])),
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    window.setTimeout(() => setCopyStatus('idle'), 1400)
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#164a77]">
      <WaterScene
        debugLayer={debugWaterLayer}
        elevationParameters={renderElevationParameters}
        fieldParameters={renderFieldParameters}
        frameProfile={frameProfile}
        island={island}
        materialParameters={renderMaterialParameters}
        preset={preset}
        renderLandOverlay={renderLandOverlay}
        showDepthReference={showDepthReference}
        terrainFieldResolution={terrainFieldResolution}
        waterFieldIsland={island}
      />
      {showTunePanel ? (
        <WorldTunePanel
          copyStatus={copyStatus}
          elevationParameters={elevationParameters}
          fieldParameters={fieldParameters}
          grassTuning={resolvedGrassTuning}
          islandParameters={islandParameters}
          materialParameters={materialParameters}
          onClose={() => setShowTunePanel(false)}
          onCopy={() => void copyParameters()}
          onElevationChange={(key, value) =>
            setElevationParameters((current) => ({ ...current, [key]: value }))
          }
          onFieldChange={(key, value) =>
            setFieldParameters((current) => ({ ...current, [key]: value }))
          }
          onGrassChange={(key, value) =>
            setGrassTuning((current) => ({ ...current, [key]: value }))
          }
          onIslandChange={(key, value) =>
            setIslandParameters((current) => ({ ...current, [key]: value }))
          }
          onMaterialChange={(key, value) =>
            setMaterialParameters(
              (current) => ({ ...current, [key]: value }) as LandrushWaterEffectParameters,
            )
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
          onToggleDepthReference={() => setShowDepthReference((current) => !current)}
          onToggleStreets={() => setShowStreets((current) => !current)}
          onTerrainFieldResolutionChange={(value) =>
            setTerrainFieldResolution(Math.round(value))
          }
          parcelHintParameters={parcelHintParameters}
          parcelParameters={parcelParameters}
          showDepthReference={showDepthReference}
          showParcelHints={showParcelHints}
          showStreets={showStreets}
          streetParameters={streetParameters}
          terrainFieldResolution={terrainFieldResolution}
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
  copyStatus,
  elevationParameters,
  fieldParameters,
  grassTuning,
  islandParameters,
  materialParameters,
  onClose,
  onCopy,
  onElevationChange,
  onFieldChange,
  onGrassChange,
  onIslandChange,
  onMaterialChange,
  onParcelChange,
  onParcelHintChange,
  onReset,
  onStreetChange,
  onTerrainFieldResolutionChange,
  onToggleDepthReference,
  onToggleParcelHints,
  onToggleStreets,
  parcelHintParameters,
  parcelParameters,
  showDepthReference,
  showParcelHints,
  showStreets,
  streetParameters,
  terrainFieldResolution,
}: {
  copyStatus: CopyStatus
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  grassTuning: GrassBladeTuning
  islandParameters: WaterLabIslandParameters
  materialParameters: LandrushWaterEffectParameters
  onClose: () => void
  onCopy: () => void
  onElevationChange: (key: ElevationSliderKey, value: number) => void
  onFieldChange: (key: FieldSliderKey, value: number) => void
  onGrassChange: (key: keyof GrassBladeTuning, value: number) => void
  onIslandChange: (key: keyof WaterLabIslandParameters, value: number) => void
  onMaterialChange: (key: MaterialSliderKey, value: number) => void
  onParcelChange: (key: keyof ParcelLabParameters, value: number) => void
  onParcelHintChange: (key: keyof ParcelOverlayParameters, value: number) => void
  onReset: () => void
  onStreetChange: (key: keyof StreetLabParameters, value: number) => void
  onTerrainFieldResolutionChange: (value: number) => void
  onToggleDepthReference: () => void
  onToggleParcelHints: () => void
  onToggleStreets: () => void
  parcelHintParameters: ParcelOverlayParameters
  parcelParameters: ParcelLabParameters
  showDepthReference: boolean
  showParcelHints: boolean
  showStreets: boolean
  streetParameters: StreetLabParameters
  terrainFieldResolution: number
}) {
  const CopyIcon = copyStatus === 'copied' ? Check : Copy
  const copyLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'
  const [collapsedGroups, setCollapsedGroups] = useState<Record<WorldTuningGroupId, boolean>>({
    grass: true,
    island: true,
    parcelHint: true,
    parcels: true,
    streets: true,
    waterAreas: true,
    waterEdge: true,
    waterRipples: true,
  })

  const toggleGroup = (group: WorldTuningGroupId) => {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  return (
    <section className="absolute right-5 top-5 max-h-[calc(100vh-2.5rem)] w-[min(390px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border border-white/25 bg-slate-950/78 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">World tune</div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
            onClick={onCopy}
            type="button"
          >
            <CopyIcon aria-hidden className="size-3.5" />
            {copyLabel}
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
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          aria-pressed={showDepthReference}
          className="rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
          onClick={onToggleDepthReference}
          type="button"
        >
          {showDepthReference ? 'hide contour' : 'contour'}
        </button>
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
      </div>
      <div className="mt-4 grid gap-3">
        <TuningGroup
          collapsed={collapsedGroups.island}
          onToggle={() => toggleGroup('island')}
          title="Water island"
        >
          {ISLAND_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onIslandChange(key, value)}
              value={islandParameters[key]}
            />
          ))}
          <TuneSlider
            label="field resolution"
            max={WATER_FIELD_RESOLUTION}
            min={128}
            onChange={onTerrainFieldResolutionChange}
            step={64}
            value={terrainFieldResolution}
          />
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.waterAreas}
          onToggle={() => toggleGroup('waterAreas')}
          title="Water areas"
        >
          {FIELD_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onFieldChange(key, value)}
              value={fieldParameters[key]}
            />
          ))}
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.waterEdge}
          onToggle={() => toggleGroup('waterEdge')}
          title="Raised edge"
        >
          {ELEVATION_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onElevationChange(key, value)}
              value={elevationParameters[key]}
            />
          ))}
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.waterRipples}
          onToggle={() => toggleGroup('waterRipples')}
          title="Water ripples"
        >
          {MATERIAL_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onMaterialChange(key, value)}
              value={materialParameters[key]}
            />
          ))}
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.grass}
          onToggle={() => toggleGroup('grass')}
          title="Grass and trees"
        >
          {GRASS_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onGrassChange(key, value)}
              value={grassTuning[key]}
            />
          ))}
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.parcels}
          onToggle={() => toggleGroup('parcels')}
          title="Parcels"
        >
          {PARCEL_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onParcelChange(key, value)}
              value={parcelParameters[key]}
            />
          ))}
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.parcelHint}
          onToggle={() => toggleGroup('parcelHint')}
          title="Parcel hint"
        >
          {PARCEL_HINT_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onParcelHintChange(key, value)}
              value={parcelHintParameters[key]}
            />
          ))}
        </TuningGroup>
        <TuningGroup
          collapsed={collapsedGroups.streets}
          onToggle={() => toggleGroup('streets')}
          title="Streets"
        >
          {STREET_SLIDERS.map(({ key, ...slider }) => (
            <TuneSlider
              key={key}
              {...slider}
              onChange={(value) => onStreetChange(key, value)}
              value={streetParameters[key]}
            />
          ))}
        </TuningGroup>
      </div>
    </section>
  )
}

function TuningGroup({
  children,
  collapsed,
  onToggle,
  title,
}: {
  children: React.ReactNode
  collapsed: boolean
  onToggle: () => void
  title: string
}) {
  const ToggleIcon = collapsed ? ChevronRight : ChevronDown

  return (
    <div className="rounded border border-white/12 bg-white/[0.025]">
      <button
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-white/64 transition hover:text-white"
        onClick={onToggle}
        type="button"
      >
        <span>{title}</span>
        <ToggleIcon aria-hidden className="size-3.5 shrink-0" />
      </button>
      <div className={collapsed ? 'hidden' : 'grid gap-3 border-white/10 border-t px-3 py-3'}>
        {children}
      </div>
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
        <input
          className="h-6 w-20 rounded border border-white/18 bg-white/8 px-1.5 text-right font-mono text-[11px] text-white outline-none focus:border-lime-300/70"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={step}
          type="number"
          value={formatTuningValue(value, step)}
        />
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

function formatTuningValue(value: number, step = 0.01) {
  if (!Number.isFinite(value)) return '--'
  if (step < 0.005) return value.toFixed(3)
  if (step < 1) return value.toFixed(2)
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value))
  return String(Math.round(value))
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
