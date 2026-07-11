'use client'

import {
  type LevelNode,
  PascalWaterNode,
  pauseSceneHistory,
  resumeSceneHistory,
  type SceneGraph,
  useScene,
} from '@pascal-app/core'
import {
  createPascalWaterLandSurface,
  createPascalWaterSmoothedPerimeter,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type LandrushWaterSurfaceParameters,
  PASCAL_WATER_LOW_ELEVATION,
  type PascalWaterLandSurface,
} from '@pascal-app/nodes'
import { renderScheduler, useViewer, Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Check, Copy } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Shape, Vector3 } from 'three'
import { resolveGrassWebGpuBladeSubdivisions } from './grass-blade-geometry'
import { GRASS_FIELD_RESOLUTION, GRASS_SPAWN_FIELD_RESOLUTION } from './grass-field-texture'
import { GRASS_WATER_DEFAULT_TUNING } from './grass-water-defaults'
import { GrassWaterLandLayers } from './grass-water-layers'
import {
  generateWaterLabIsland,
  type IslandElevationParameters,
  type LabSliderConfig,
  PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const PASCAL_GRASS_WATER_SITE_ID = 'site_pascal-grass-water-debug'
const PASCAL_GRASS_WATER_BUILDING_ID = 'building_pascal-grass-water-debug'
const PASCAL_GRASS_WATER_LEVEL_ID = 'level_pascal-grass-water-debug'
const PASCAL_GRASS_WATER_CAMERA_POSITION = [88, 86, 94] as const
const PASCAL_GRASS_WATER_CAMERA_TARGET = [0, 0, 0] as const
const PASCAL_GRASS_WATER_CAMERA_ZOOM = 7.8
const PASCAL_GRASS_WATER_CAMERA_MIN_ZOOM = 2.8
const PASCAL_GRASS_WATER_CAMERA_REFERENCE_ASPECT = 1280 / 720
const PASCAL_CLIFF_EXPERIMENT_OVERLAY_LIFT = 0.08
const PASCAL_CLIFF_EXPERIMENT_LIGHT_NORMAL_Y = 0.55
const PASCAL_CLIFF_EXPERIMENT_SHADE_NORMAL_Y = -0.12
const PASCAL_CLIFF_FAMILY_CUBE_SIZE = 3.2
const PASCAL_CLIFF_FAMILY_CUBE_SPACING = 4.6
const PASCAL_CLIFF_FAMILY_CUBE_LIFT = 4.2
const PASCAL_CLIFF_MAX_FAMILY_VARIATIONS = 8
type PascalWaterMotionTuning = {
  coastalFoamFarDistance: number
  coastalFoamNearDistance: number
  coastalFoamWashReach: number
  frontCyanShallowDepthResponseRate: number
  frontCyanShallowDepthThreshold: number
}
const DEFAULT_PASCAL_WATER_MOTION_TUNING = {
  coastalFoamFarDistance: 0.4,
  coastalFoamNearDistance: 0.06,
  coastalFoamWashReach: 0.13,
  frontCyanShallowDepthResponseRate: 11,
  frontCyanShallowDepthThreshold: 0.34,
} satisfies PascalWaterMotionTuning
type PascalWaterMotionLayerKey =
  | 'coastalFoamVisibility'
  | 'frontCyanDepthContourVisibility'
  | 'ripplesBackColorVisibility'
  | 'ripplesCrestVisibility'
  | 'ripplesFrontColorVisibility'
type PascalWaterMotionLayerVisibility = Record<PascalWaterMotionLayerKey, boolean>

const PASCAL_WATER_MOTION_LAYER_OPTIONS = [
  { key: 'coastalFoamVisibility', label: 'Coastal foam' },
  { key: 'ripplesCrestVisibility', label: 'White crest' },
  { key: 'ripplesFrontColorVisibility', label: 'Front cyan' },
  { key: 'ripplesBackColorVisibility', label: 'Cyan tail' },
  { key: 'frontCyanDepthContourVisibility', label: 'Depth contour' },
] as const satisfies readonly { key: PascalWaterMotionLayerKey; label: string }[]
const DEFAULT_PASCAL_WATER_MOTION_LAYER_VISIBILITY = {
  coastalFoamVisibility: true,
  frontCyanDepthContourVisibility: false,
  ripplesBackColorVisibility: true,
  ripplesCrestVisibility: true,
  ripplesFrontColorVisibility: true,
} satisfies PascalWaterMotionLayerVisibility
const PASCAL_WATER_MOTION_DEBUG_MATERIAL_PARAMETERS = {
  ...DEFAULT_PASCAL_WATER_MOTION_TUNING,
  coastalFoamStrength: 0.95,
  ripplesBackColorRatioMax: 2.5,
  ripplesBackColorRatioMin: 1,
  ripplesBackColorStrength: 0.8,
  ripplesBreakupFrequency: 0.018,
  ripplesBreakupSize: 0.68,
  ripplesFrontColorRatio: 0.5,
  ripplesFrontColorStrength: 0.8,
  ripplesNoiseStrength: 0.12,
  ripplesRatio: 0.94,
  windTimeFrequency: 0.18,
} satisfies Record<string, number>

const PASCAL_WATER_MOTION_DEBUG_ELEVATION_PARAMETERS = {
  ...PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
  cliffCornerChipAngleAverage: 1,
  cliffCornerChipAngleDensity: 1,
  cliffCornerChipAngleDistribution: 1,
  cliffCornerChipAngleVariation: 1,
  cliffCornerChipAverage: 1,
  cliffCornerChipDensity: 1,
  cliffCornerChipDistribution: 1,
  cliffCornerChipVariation: 1,
} satisfies IslandElevationParameters

type PascalCliffPendingGeometryDisposal = { cancelled: boolean }
type PascalCliffGpuQueue = { onSubmittedWorkDone?: () => Promise<void> }
type PascalWorldMultiplayerDebugClientProps = { waterMotionDebug?: boolean }

const pascalCliffPendingGeometryDisposals = new WeakMap<
  BufferGeometry,
  PascalCliffPendingGeometryDisposal
>()

function usePascalCliffGeometryLifecycle(
  resource: BufferGeometry | readonly BufferGeometry[] | null,
) {
  const renderer = useThree((state) => state.gl)

  useEffect(() => {
    const geometries = Array.isArray(resource) ? resource : resource ? [resource] : []
    for (const geometry of geometries) {
      const pending = pascalCliffPendingGeometryDisposals.get(geometry)
      if (pending) {
        pending.cancelled = true
        pascalCliffPendingGeometryDisposals.delete(geometry)
      }
    }
    renderScheduler.requestFrame('geometry:changed')

    return () => {
      for (const geometry of geometries) {
        disposePascalCliffGeometryLater(geometry, renderer)
      }
    }
  }, [renderer, resource])
}

function disposePascalCliffGeometryLater(geometry: BufferGeometry, renderer: unknown) {
  const pending: PascalCliffPendingGeometryDisposal = { cancelled: false }
  pascalCliffPendingGeometryDisposals.set(geometry, pending)
  const dispose = () => {
    if (pending.cancelled || pascalCliffPendingGeometryDisposals.get(geometry) !== pending) return
    pascalCliffPendingGeometryDisposals.delete(geometry)
    geometry.dispose()
  }
  const waitForGpu = () => {
    const queue = (
      renderer as { backend?: { device?: { queue?: PascalCliffGpuQueue } } } | null | undefined
    )?.backend?.device?.queue
    if (queue?.onSubmittedWorkDone) {
      void queue.onSubmittedWorkDone().then(dispose, dispose)
      return
    }
    dispose()
  }

  if (typeof requestAnimationFrame !== 'function') {
    waitForGpu()
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(waitForGpu))
}

type PascalCliffExperimentMode = 'baseline' | 'rock-field' | 'terraced' | 'combined'
type PascalCliffCopyStatus = 'copied' | 'failed' | 'idle'
type PascalCliffExperimentColor = [number, number, number]
type PascalCliffExperimentFamily = {
  dim: PascalCliffExperimentColor
  light: PascalCliffExperimentColor
  shade: PascalCliffExperimentColor
  weight: number
}
type PascalCliffTuningSliderKey =
  | 'cliffColorFamilyVariationCount'
  | 'cliffColorFamilyDistribution'
  | 'cliffCornerChipAngleAverage'
  | 'cliffCornerChipAngleDensity'
  | 'cliffCornerChipAngleDistribution'
  | 'cliffCornerChipAngleVariation'
  | 'cliffCornerChipAverage'
  | 'cliffCornerChipDensity'
  | 'cliffCornerChipDistribution'
  | 'cliffCornerChipVariation'
  | 'cliffFrontPaintColorCount'
  | 'cliffFrontPaintColorDistance'
  | 'cliffFrontPaintDensity'
  | 'cliffFrontPaintSplashHeightRatio'
  | 'cliffFrontPaintSplashHeightVariation'
  | 'cliffFrontPaintSplashHeightVariationDistribution'
  | 'cliffFrontPaintSplashVerticalSpreadRatio'
  | 'cliffFrontPaintSplashVerticalSpreadVariation'
  | 'cliffFrontPaintSplashVerticalSpreadVariationDistribution'
  | 'cliffFrontPaintSplashWidthRatio'
  | 'cliffFrontPaintSplashWidthVariation'
  | 'cliffFrontPaintSplashWidthVariationDistribution'
  | 'edgeLiftMeters'
  | 'cliffAverageSlope'
  | 'cliffSlopeVariation'
  | 'cliffSlopeVariationDistribution'
  | 'cliffLayer1ExtrusionAverageMeters'
  | 'cliffLayer1ExtrusionVariationMeters'
  | 'cliffLayer1ExtrusionVariationDistribution'
  | 'cliffLayer2ExtrusionAverageMeters'
  | 'cliffLayer2Density'
  | 'cliffLayer2ExtrusionVariationMeters'
  | 'cliffLayer2ExtrusionVariationDistribution'
  | 'cliffLayer3ExtrusionAverageMeters'
  | 'cliffLayer3Density'
  | 'cliffLayer3ExtrusionVariationMeters'
  | 'cliffLayer3ExtrusionVariationDistribution'
  | 'cliffLayer2AltitudeRatio'
  | 'cliffLayer2AltitudeVariation'
  | 'cliffLayer2AltitudeVariationDistribution'
  | 'cliffLayer3AltitudeRatio'
  | 'cliffLayer3AltitudeVariation'
  | 'cliffLayer3AltitudeVariationDistribution'
  | 'cliffLayer1BlockWidthMeters'
  | 'cliffLayer1BlockWidthVariationMeters'
  | 'cliffLayer1BlockWidthVariationDistribution'
  | 'cliffLayer2BlockWidthMeters'
  | 'cliffLayer2BlockWidthVariationMeters'
  | 'cliffLayer2BlockWidthVariationDistribution'
  | 'cliffLayer3BlockWidthMeters'
  | 'cliffLayer3BlockWidthVariationMeters'
  | 'cliffLayer3BlockWidthVariationDistribution'
type PascalCliffTuningSliderGroup = {
  id: string
  keys: readonly PascalCliffTuningSliderKey[]
  label: string
}
type PascalCliffExperimentVector = { x: number; y: number; z: number }
type PascalCliffExperimentGridPoint = PascalCliffExperimentVector & {
  outwardX: number
  outwardZ: number
  station: number
  u: number
  v: number
}

const PASCAL_CLIFF_EXPERIMENT_MODES = [
  { id: 'baseline', label: 'Baseline' },
  { id: 'rock-field', label: 'Rock Field' },
  { id: 'terraced', label: 'Terraced Mesh' },
  { id: 'combined', label: 'Combined' },
] as const satisfies readonly { id: PascalCliffExperimentMode; label: string }[]

function pascalCliffExperimentSrgbColor(
  red: number,
  green: number,
  blue: number,
): PascalCliffExperimentColor {
  return [
    pascalCliffExperimentSrgbChannelToLinear(red / 255),
    pascalCliffExperimentSrgbChannelToLinear(green / 255),
    pascalCliffExperimentSrgbChannelToLinear(blue / 255),
  ]
}

function pascalCliffExperimentSrgbChannelToLinear(value: number) {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped <= 0.04045 ? clamped / 12.92 : ((clamped + 0.055) / 1.055) ** 2.4
}

const PASCAL_CLIFF_EXPERIMENT_FAMILIES: readonly PascalCliffExperimentFamily[] = [
  {
    dim: pascalCliffExperimentSrgbColor(0x5d, 0x5d, 0x62),
    light: pascalCliffExperimentSrgbColor(0xb1, 0x9a, 0x8c),
    shade: pascalCliffExperimentSrgbColor(0x46, 0x46, 0x4f),
    weight: 2 / 3,
  },
  {
    dim: pascalCliffExperimentSrgbColor(0x73, 0x62, 0x5d),
    light: pascalCliffExperimentSrgbColor(0x9d, 0x81, 0x72),
    shade: pascalCliffExperimentSrgbColor(0x42, 0x3e, 0x45),
    weight: 1 / 3,
  },
]
const PASCAL_CLIFF_EXPERIMENT_FAMILY_RAMPS = Array.from(
  { length: PASCAL_CLIFF_MAX_FAMILY_VARIATIONS + 1 },
  (_, variationCount) => createPascalCliffExperimentFamilyRamp(variationCount),
)
const PASCAL_CLIFF_FAMILY_CUBE_GEOMETRY_CACHE = new WeakMap<
  readonly PascalCliffExperimentFamily[],
  readonly BufferGeometry[]
>()

const PASCAL_CLIFF_TUNING_SLIDERS = [
  {
    key: 'cliffColorFamilyVariationCount',
    label: 'family variations',
    max: PASCAL_CLIFF_MAX_FAMILY_VARIATIONS,
    min: 0,
    step: 1,
  },
  {
    key: 'cliffColorFamilyDistribution',
    label: 'family distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffCornerChipAverage', label: 'avg chip', max: 1, min: 0, step: 0.01 },
  {
    key: 'cliffCornerChipVariation',
    label: 'chip variability',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffCornerChipDistribution',
    label: 'chip distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffCornerChipDensity', label: 'chip density', max: 1, min: 0, step: 0.01 },
  {
    key: 'cliffCornerChipAngleAverage',
    label: 'avg chip angle',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffCornerChipAngleVariation',
    label: 'angle variability',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffCornerChipAngleDistribution',
    label: 'angle distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffCornerChipAngleDensity',
    label: 'angle density',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintColorCount',
    label: 'front paint colors',
    max: 5,
    min: 1,
    step: 1,
  },
  {
    key: 'cliffFrontPaintDensity',
    label: 'painted rock density',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintColorDistance',
    label: 'paint color distance',
    max: 2,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashHeightRatio',
    label: 'splash bottom height',
    max: 0.9,
    min: 0.05,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashHeightVariation',
    label: 'height variability',
    max: 0.6,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashHeightVariationDistribution',
    label: 'height distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashWidthRatio',
    label: 'splash width',
    max: 1,
    min: 0.1,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashWidthVariation',
    label: 'width variability',
    max: 0.6,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashWidthVariationDistribution',
    label: 'width distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashVerticalSpreadRatio',
    label: 'splash vertical spread',
    max: 0.65,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashVerticalSpreadVariation',
    label: 'spread variability',
    max: 0.5,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffFrontPaintSplashVerticalSpreadVariationDistribution',
    label: 'spread distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'edgeLiftMeters',
    label: 'base island top altitude',
    max: 12,
    min: 0.5,
    step: 0.1,
  },
  { key: 'cliffAverageSlope', label: 'avg slope', max: 1.4, min: 0, step: 0.01 },
  { key: 'cliffSlopeVariation', label: 'slope variability', max: 0.9, min: 0, step: 0.01 },
  {
    key: 'cliffSlopeVariationDistribution',
    label: 'slope distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffLayer1ExtrusionAverageMeters',
    label: '1st avg extrusion',
    max: 3.5,
    min: 0.05,
    step: 0.05,
  },
  {
    key: 'cliffLayer1ExtrusionVariationMeters',
    label: '1st extrusion variability',
    max: 2.4,
    min: 0,
    step: 0.05,
  },
  {
    key: 'cliffLayer1ExtrusionVariationDistribution',
    label: '1st extrusion distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffLayer2ExtrusionAverageMeters',
    label: '2nd avg extrusion',
    max: 3.5,
    min: 0.05,
    step: 0.05,
  },
  {
    key: 'cliffLayer2ExtrusionVariationMeters',
    label: '2nd extrusion variability',
    max: 2.4,
    min: 0,
    step: 0.05,
  },
  {
    key: 'cliffLayer2ExtrusionVariationDistribution',
    label: '2nd extrusion distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffLayer2Density', label: '2nd layer density', max: 1, min: 0, step: 0.01 },
  {
    key: 'cliffLayer3ExtrusionAverageMeters',
    label: '3rd avg extrusion',
    max: 3.5,
    min: 0.05,
    step: 0.05,
  },
  {
    key: 'cliffLayer3ExtrusionVariationMeters',
    label: '3rd extrusion variability',
    max: 2.4,
    min: 0,
    step: 0.05,
  },
  {
    key: 'cliffLayer3ExtrusionVariationDistribution',
    label: '3rd extrusion distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffLayer3Density', label: '3rd layer density', max: 1, min: 0, step: 0.01 },
  {
    key: 'cliffLayer2AltitudeRatio',
    label: '2nd layer altitude',
    max: 0.95,
    min: 0.08,
    step: 0.01,
  },
  {
    key: 'cliffLayer2AltitudeVariation',
    label: '2nd altitude span',
    max: 0.5,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffLayer2AltitudeVariationDistribution',
    label: '2nd altitude distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffLayer3AltitudeRatio',
    label: '3rd layer altitude',
    max: 0.86,
    min: 0.04,
    step: 0.01,
  },
  {
    key: 'cliffLayer3AltitudeVariation',
    label: '3rd altitude span',
    max: 0.45,
    min: 0,
    step: 0.01,
  },
  {
    key: 'cliffLayer3AltitudeVariationDistribution',
    label: '3rd altitude distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffLayer1BlockWidthMeters', label: '1st block width', max: 14, min: 0.9, step: 0.1 },
  {
    key: 'cliffLayer1BlockWidthVariationMeters',
    label: '1st width variability',
    max: 8,
    min: 0,
    step: 0.1,
  },
  {
    key: 'cliffLayer1BlockWidthVariationDistribution',
    label: '1st width distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffLayer2BlockWidthMeters', label: '2nd block width', max: 14, min: 0.9, step: 0.1 },
  {
    key: 'cliffLayer2BlockWidthVariationMeters',
    label: '2nd width variability',
    max: 8,
    min: 0,
    step: 0.1,
  },
  {
    key: 'cliffLayer2BlockWidthVariationDistribution',
    label: '2nd width distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
  { key: 'cliffLayer3BlockWidthMeters', label: '3rd block width', max: 14, min: 0.9, step: 0.1 },
  {
    key: 'cliffLayer3BlockWidthVariationMeters',
    label: '3rd width variability',
    max: 8,
    min: 0,
    step: 0.1,
  },
  {
    key: 'cliffLayer3BlockWidthVariationDistribution',
    label: '3rd width distribution',
    max: 1,
    min: 0,
    step: 0.01,
  },
] satisfies readonly LabSliderConfig<PascalCliffTuningSliderKey>[]

const PASCAL_CLIFF_TUNING_SLIDER_GROUPS = [
  {
    id: 'color-families',
    keys: ['cliffColorFamilyVariationCount', 'cliffColorFamilyDistribution'],
    label: 'Color families',
  },
  {
    id: 'front-paint',
    keys: ['cliffFrontPaintColorCount', 'cliffFrontPaintDensity', 'cliffFrontPaintColorDistance'],
    label: 'Front paint',
  },
  {
    id: 'corner-chips',
    keys: [
      'cliffCornerChipAverage',
      'cliffCornerChipVariation',
      'cliffCornerChipDistribution',
      'cliffCornerChipDensity',
      'cliffCornerChipAngleAverage',
      'cliffCornerChipAngleVariation',
      'cliffCornerChipAngleDistribution',
      'cliffCornerChipAngleDensity',
    ],
    label: 'Corner chips',
  },
  {
    id: 'paint-splash',
    keys: [
      'cliffFrontPaintSplashHeightRatio',
      'cliffFrontPaintSplashHeightVariation',
      'cliffFrontPaintSplashHeightVariationDistribution',
      'cliffFrontPaintSplashWidthRatio',
      'cliffFrontPaintSplashWidthVariation',
      'cliffFrontPaintSplashWidthVariationDistribution',
      'cliffFrontPaintSplashVerticalSpreadRatio',
      'cliffFrontPaintSplashVerticalSpreadVariation',
      'cliffFrontPaintSplashVerticalSpreadVariationDistribution',
    ],
    label: 'Paint splash',
  },
  {
    id: 'shared-shape',
    keys: [
      'edgeLiftMeters',
      'cliffAverageSlope',
      'cliffSlopeVariation',
      'cliffSlopeVariationDistribution',
    ],
    label: 'Shared shape',
  },
  {
    id: 'layer-1',
    keys: [
      'cliffLayer1ExtrusionAverageMeters',
      'cliffLayer1ExtrusionVariationMeters',
      'cliffLayer1ExtrusionVariationDistribution',
      'cliffLayer1BlockWidthMeters',
      'cliffLayer1BlockWidthVariationMeters',
      'cliffLayer1BlockWidthVariationDistribution',
    ],
    label: 'Layer 1',
  },
  {
    id: 'layer-2',
    keys: [
      'cliffLayer2Density',
      'cliffLayer2AltitudeRatio',
      'cliffLayer2AltitudeVariation',
      'cliffLayer2AltitudeVariationDistribution',
      'cliffLayer2ExtrusionAverageMeters',
      'cliffLayer2ExtrusionVariationMeters',
      'cliffLayer2ExtrusionVariationDistribution',
      'cliffLayer2BlockWidthMeters',
      'cliffLayer2BlockWidthVariationMeters',
      'cliffLayer2BlockWidthVariationDistribution',
    ],
    label: 'Layer 2',
  },
  {
    id: 'layer-3',
    keys: [
      'cliffLayer3Density',
      'cliffLayer3AltitudeRatio',
      'cliffLayer3AltitudeVariation',
      'cliffLayer3AltitudeVariationDistribution',
      'cliffLayer3ExtrusionAverageMeters',
      'cliffLayer3ExtrusionVariationMeters',
      'cliffLayer3ExtrusionVariationDistribution',
      'cliffLayer3BlockWidthMeters',
      'cliffLayer3BlockWidthVariationMeters',
      'cliffLayer3BlockWidthVariationDistribution',
    ],
    label: 'Layer 3',
  },
] satisfies readonly PascalCliffTuningSliderGroup[]

const PASCAL_CLIFF_TUNING_SLIDER_BY_KEY = new Map<
  PascalCliffTuningSliderKey,
  LabSliderConfig<PascalCliffTuningSliderKey>
>(PASCAL_CLIFF_TUNING_SLIDERS.map((slider) => [slider.key, slider]))

const PASCAL_CLIFF_EXPERIMENT_WATER_ELEVATION_PARAMETERS =
  createPascalExperimentWaterElevationParameters(PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS)

function pascalCliffElevationParametersEqual(
  first: IslandElevationParameters,
  second: IslandElevationParameters,
) {
  for (const key of Object.keys(first) as (keyof IslandElevationParameters)[]) {
    if (first[key] !== second[key]) return false
  }
  return true
}

declare global {
  interface Window {
    __PASCAL_BENCH_ORBITING__?: boolean
    __LANDRUSH_WORLD_MULTIPLAYER_PASCAL_DEBUG__?: {
      cliffColorFamilyCount: number
      cliffExperimentMode: PascalCliffExperimentMode
      features: readonly string[]
      grassSurfacePointCount: number
      grassVisible: boolean
      frontCyanShallowDepthThreshold: number | null
      nodeCount: number
      rootNodeIds: readonly string[]
      source: string
      waterMotionLayerVisibility: PascalWaterMotionLayerVisibility | null
      waterNodeId: string
    }
  }
}

export function PascalWorldMultiplayerDebugClient({
  waterMotionDebug = false,
}: PascalWorldMultiplayerDebugClientProps = {}) {
  const defaultElevationParameters = waterMotionDebug
    ? PASCAL_WATER_MOTION_DEBUG_ELEVATION_PARAMETERS
    : PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS
  const [copyStatus, setCopyStatus] = useState<PascalCliffCopyStatus>('idle')
  const [draftElevationParameters, setDraftElevationParameters] =
    useState<IslandElevationParameters>(() => ({
      ...defaultElevationParameters,
    }))
  const [elevationParameters, setElevationParameters] = useState<IslandElevationParameters>(() => ({
    ...defaultElevationParameters,
  }))
  useEffect(() => {
    if (pascalCliffElevationParametersEqual(draftElevationParameters, elevationParameters)) {
      return
    }

    const timeout = window.setTimeout(() => {
      setElevationParameters({ ...draftElevationParameters })
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [draftElevationParameters, elevationParameters])

  const pascalGrassWaterScene = useMemo(
    () =>
      createPascalGrassWaterSceneGraph(defaultElevationParameters, {
        waterMotionDebug,
      }),
    [defaultElevationParameters, waterMotionDebug],
  )
  const { sceneGraph, shorelinePoints, waterNode } = pascalGrassWaterScene
  const [cliffExperimentMode, setCliffExperimentMode] =
    useState<PascalCliffExperimentMode>('baseline')
  const [showGrass, setShowGrass] = useState(false)
  const [waterMotionTuning, setWaterMotionTuning] = useState<PascalWaterMotionTuning>(() => ({
    ...DEFAULT_PASCAL_WATER_MOTION_TUNING,
  }))
  const [waterMotionLayerVisibility, setWaterMotionLayerVisibility] =
    useState<PascalWaterMotionLayerVisibility>(() => ({
      ...DEFAULT_PASCAL_WATER_MOTION_LAYER_VISIBILITY,
    }))
  const landSurface = useMemo(
    () =>
      createPascalWaterLandSurface({
        elevationParameters,
        shorelinePoints,
        waterPlaneSize: WATER_PLANE_SIZE,
      }),
    [elevationParameters, shorelinePoints],
  )
  const activeWaterElevationParameters =
    cliffExperimentMode === 'baseline'
      ? elevationParameters
      : PASCAL_CLIFF_EXPERIMENT_WATER_ELEVATION_PARAMETERS
  const activeWaterNode = useMemo(() => {
    const cliffWaterNode = createPascalWaterNodeForCliffMode(
      waterNode,
      cliffExperimentMode,
      activeWaterElevationParameters,
    )
    if (!waterMotionDebug) return cliffWaterNode

    return {
      ...cliffWaterNode,
      materialParameters: {
        ...cliffWaterNode.materialParameters,
        ...createPascalWaterMotionLayerParameters(waterMotionLayerVisibility, waterMotionTuning),
      },
    }
  }, [
    activeWaterElevationParameters,
    cliffExperimentMode,
    waterMotionDebug,
    waterMotionLayerVisibility,
    waterMotionTuning,
    waterNode,
  ])
  const bladeSubdivisions = useMemo(
    () => resolveGrassWebGpuBladeSubdivisions(GRASS_WATER_DEFAULT_TUNING.density),
    [],
  )

  useEffect(() => {
    useScene.getState().setScene(sceneGraph.nodes as never, sceneGraph.rootNodeIds as never)
    const viewer = useViewer.getState()
    viewer.setProjectId('pascal-grass-water-debug')
    viewer.setCameraMode('orthographic')
    viewer.setShowGrid(false)
    viewer.setShadows(false)
    viewer.resetSelection()
    viewer.setSelection({
      buildingId: PASCAL_GRASS_WATER_BUILDING_ID as never,
      levelId: PASCAL_GRASS_WATER_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    renderScheduler.requestFrame('geometry:changed')
    window.__PASCAL_BENCH_ORBITING__ = true

    return () => {
      delete window.__LANDRUSH_WORLD_MULTIPLAYER_PASCAL_DEBUG__
      delete window.__PASCAL_BENCH_ORBITING__
      useScene.getState().unloadScene()
    }
  }, [sceneGraph])

  useEffect(() => {
    const scene = useScene.getState()
    const currentWaterNode = scene.nodes[activeWaterNode.id]
    if (
      currentWaterNode?.type !== 'pascal-water' ||
      (currentWaterNode.elevationParameters === activeWaterNode.elevationParameters &&
        currentWaterNode.materialParameters === activeWaterNode.materialParameters &&
        currentWaterNode.metadata === activeWaterNode.metadata)
    ) {
      return
    }

    pauseSceneHistory(useScene)
    try {
      scene.updateNode(activeWaterNode.id, {
        elevationParameters: activeWaterNode.elevationParameters,
        materialParameters: activeWaterNode.materialParameters,
        metadata: activeWaterNode.metadata,
      } as never)
    } finally {
      resumeSceneHistory(useScene)
    }
    renderScheduler.requestFrame('geometry:changed')
  }, [activeWaterNode])

  useEffect(() => {
    window.__LANDRUSH_WORLD_MULTIPLAYER_PASCAL_DEBUG__ = {
      cliffColorFamilyCount: pascalCliffExperimentFamilyRamp(
        elevationParameters.cliffColorFamilyVariationCount,
      ).length,
      cliffExperimentMode,
      features: [
        'pascal-viewer-canvas',
        'pascal-scene-store',
        'pascal-water-node',
        'world-multiplayer-water-material',
        'pascal-multiplayer-cliff-parameters',
        'debug-cliff-experiment-overlay',
        'grass-water-land-layers',
        'grass-water-ground-field',
        'grass-water-blades',
        'grass-water-trees',
        ...(waterMotionDebug
          ? [
              'asymmetric-water-crest-color',
              'coastal-foam-mini-waves',
              'front-cyan-shallow-depth-threshold',
              'wave-layer-isolation-controls',
            ]
          : []),
      ],
      grassSurfacePointCount: landSurface.grassSurfacePoints.length,
      grassVisible: showGrass,
      frontCyanShallowDepthThreshold: waterMotionDebug
        ? waterMotionTuning.frontCyanShallowDepthThreshold
        : null,
      nodeCount: Object.keys(sceneGraph.nodes).length,
      rootNodeIds: sceneGraph.rootNodeIds,
      source: waterMotionDebug ? 'pascal-water-motion-debug' : 'pascal-grass-water-debug',
      waterMotionLayerVisibility: waterMotionDebug ? waterMotionLayerVisibility : null,
      waterNodeId: waterNode.id,
    }
  }, [
    cliffExperimentMode,
    elevationParameters.cliffColorFamilyVariationCount,
    landSurface,
    sceneGraph,
    showGrass,
    waterMotionLayerVisibility,
    waterMotionTuning,
    waterNode.id,
    waterMotionDebug,
  ])

  const copyCliffParameters = async () => {
    const parameters = Object.fromEntries(
      PASCAL_CLIFF_TUNING_SLIDERS.map((slider) => [
        slider.key,
        draftElevationParameters[slider.key],
      ]),
    )
    const text = JSON.stringify({ mode: cliffExperimentMode, parameters }, null, 2)
    try {
      await copyPascalCliffText(text)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    window.setTimeout(() => setCopyStatus('idle'), 1400)
  }

  return (
    <main
      className="h-screen w-screen overflow-hidden bg-[#0f1720]"
      data-landrush-pascal-grass-water-debug
      data-landrush-water-motion-debug={waterMotionDebug || undefined}
    >
      <Viewer
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        disablePostFx
        renderContext="viewer"
        rendererBackend="webgpu"
        selectionManager="custom"
        useBvh={false}
      >
        <PascalGrassWaterCameraRig />
        <PascalCliffExperimentOverlay
          elevationParameters={elevationParameters}
          mode={cliffExperimentMode}
          surface={landSurface}
        />
        <PascalCliffFamilyColorCubes
          familyVariationCount={elevationParameters.cliffColorFamilyVariationCount}
          surface={landSurface}
        />
        {showGrass ? (
          <Suspense fallback={null}>
            <GrassWaterLandLayers
              bladeSubdivisions={bladeSubdivisions}
              fieldResolution={GRASS_FIELD_RESOLUTION}
              spawnResolution={GRASS_SPAWN_FIELD_RESOLUTION}
              surface={landSurface}
              tuning={GRASS_WATER_DEFAULT_TUNING}
            />
          </Suspense>
        ) : null}
      </Viewer>
      <PascalCliffExperimentPanel
        copyStatus={copyStatus}
        elevationParameters={draftElevationParameters}
        labTitle="Cliff Lab"
        mode={cliffExperimentMode}
        onCopy={() => void copyCliffParameters()}
        onElevationParameterChange={(key, value) =>
          setDraftElevationParameters((current) => ({ ...current, [key]: value }))
        }
        onModeChange={setCliffExperimentMode}
        onResetElevationParameters={() => {
          setDraftElevationParameters({ ...defaultElevationParameters })
          setElevationParameters({ ...defaultElevationParameters })
          setWaterMotionTuning({ ...DEFAULT_PASCAL_WATER_MOTION_TUNING })
          setWaterMotionLayerVisibility({ ...DEFAULT_PASCAL_WATER_MOTION_LAYER_VISIBILITY })
        }}
        onShowGrassChange={setShowGrass}
        showGrass={showGrass}
      />
      {waterMotionDebug ? (
        <PascalWaterMotionPanel
          onWaterMotionTuningChange={(key, value) =>
            setWaterMotionTuning((current) => ({ ...current, [key]: value }))
          }
          onWaterMotionLayerToggle={(key) =>
            setWaterMotionLayerVisibility((current) => ({
              ...current,
              [key]: !current[key],
            }))
          }
          waterMotionLayerVisibility={waterMotionLayerVisibility}
          waterMotionTuning={waterMotionTuning}
        />
      ) : null}
    </main>
  )
}

async function copyPascalCliffText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    if (!copied) throw new Error('Clipboard copy failed')
  }
}

function createPascalWaterNodeForCliffMode(
  waterNode: PascalWaterNode,
  mode: PascalCliffExperimentMode,
  elevationParameters: IslandElevationParameters,
): PascalWaterNode {
  if (
    mode === 'baseline' &&
    pascalCliffElevationParametersEqual(waterNode.elevationParameters, elevationParameters)
  ) {
    return waterNode
  }
  const metadata =
    waterNode.metadata &&
    typeof waterNode.metadata === 'object' &&
    !Array.isArray(waterNode.metadata)
      ? waterNode.metadata
      : {}

  return {
    ...waterNode,
    elevationParameters,
    metadata:
      mode === 'baseline'
        ? metadata
        : {
            ...metadata,
            cliffExperimentBase: 'flat-water-node',
            cliffExperimentMode: mode,
          },
  }
}

function createPascalWaterMotionLayerParameters(
  visibility: PascalWaterMotionLayerVisibility,
  tuning: PascalWaterMotionTuning,
): Pick<LandrushWaterSurfaceParameters, PascalWaterMotionLayerKey | keyof PascalWaterMotionTuning> {
  return {
    ...tuning,
    coastalFoamVisibility: visibility.coastalFoamVisibility ? 1 : 0,
    frontCyanDepthContourVisibility: visibility.frontCyanDepthContourVisibility ? 1 : 0,
    ripplesBackColorVisibility: visibility.ripplesBackColorVisibility ? 1 : 0,
    ripplesCrestVisibility: visibility.ripplesCrestVisibility ? 1 : 0,
    ripplesFrontColorVisibility: visibility.ripplesFrontColorVisibility ? 1 : 0,
  }
}

function createPascalExperimentWaterElevationParameters(
  elevationParameters: IslandElevationParameters,
): IslandElevationParameters {
  return {
    ...elevationParameters,
    cliffBlockDepthMaxMeters: 0,
    cliffBlockDepthMinMeters: 0,
    edgeLiftMeters: 0,
    innerContourMeters: 0,
    outerContourMeters: 0,
  }
}

function PascalCliffExperimentPanel({
  copyStatus,
  elevationParameters,
  labTitle,
  mode,
  onCopy,
  onElevationParameterChange,
  onModeChange,
  onResetElevationParameters,
  onShowGrassChange,
  showGrass,
}: {
  copyStatus: PascalCliffCopyStatus
  elevationParameters: IslandElevationParameters
  labTitle: string
  mode: PascalCliffExperimentMode
  onCopy: () => void
  onElevationParameterChange: (key: PascalCliffTuningSliderKey, value: number) => void
  onModeChange: (mode: PascalCliffExperimentMode) => void
  onResetElevationParameters: () => void
  onShowGrassChange: (showGrass: boolean) => void
  showGrass: boolean
}) {
  const CopyIcon = copyStatus === 'copied' ? Check : Copy
  const copyLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'

  return (
    <section className="pointer-events-auto absolute left-4 top-4 z-10 max-h-[40vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-white/12 bg-slate-950/78 px-3 py-3 text-xs text-slate-100 shadow-2xl shadow-black/25 backdrop-blur sm:max-h-[calc(100vh-2rem)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-medium uppercase tracking-[0.16em] text-slate-300">{labTitle}</div>
        <div className="flex items-center gap-1.5">
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/14 bg-white/8 px-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/14"
            onClick={onCopy}
            type="button"
          >
            <CopyIcon aria-hidden className="size-3.5" />
            {copyLabel}
          </button>
          <button
            className="h-7 rounded-md border border-white/14 bg-white/8 px-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/14"
            onClick={onResetElevationParameters}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cliff experiment mode">
        {PASCAL_CLIFF_EXPERIMENT_MODES.map((option) => (
          <button
            aria-pressed={mode === option.id}
            className={`h-8 rounded-md border px-2.5 text-[11px] font-medium transition ${
              mode === option.id
                ? 'border-cyan-300/80 bg-cyan-300 text-slate-950'
                : 'border-white/14 bg-white/8 text-slate-200 hover:bg-white/14'
            }`}
            key={option.id}
            onClick={() => onModeChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-4">
        {PASCAL_CLIFF_TUNING_SLIDER_GROUPS.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 border-b border-white/12 pb-1 text-[10px] font-semibold uppercase text-slate-400">
              {group.label}
            </h3>
            <div className="space-y-2.5">
              {group.keys.map((key) => {
                const slider = PASCAL_CLIFF_TUNING_SLIDER_BY_KEY.get(key)
                if (!slider) return null
                return (
                  <label className="grid gap-1" key={slider.key}>
                    <span className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
                      <span>{slider.label}</span>
                      <span className="tabular-nums text-slate-100">
                        {formatPascalCliffSliderValue(elevationParameters[slider.key], slider.step)}
                      </span>
                    </span>
                    <input
                      aria-label={slider.label}
                      className="h-4 w-full accent-cyan-300"
                      data-cliff-slider={slider.key}
                      max={slider.max}
                      min={slider.min}
                      onInput={(event) =>
                        onElevationParameterChange(slider.key, Number(event.currentTarget.value))
                      }
                      step={slider.step}
                      type="range"
                      value={elevationParameters[slider.key]}
                    />
                  </label>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-[11px] font-medium text-slate-300">
        <input
          checked={showGrass}
          className="size-3.5 accent-cyan-300"
          onChange={(event) => onShowGrassChange(event.currentTarget.checked)}
          type="checkbox"
        />
        Grass layer
      </label>
    </section>
  )
}

function PascalWaterMotionPanel({
  onWaterMotionLayerToggle,
  onWaterMotionTuningChange,
  waterMotionLayerVisibility,
  waterMotionTuning,
}: {
  onWaterMotionLayerToggle: (key: PascalWaterMotionLayerKey) => void
  onWaterMotionTuningChange: (key: keyof PascalWaterMotionTuning, value: number) => void
  waterMotionLayerVisibility: PascalWaterMotionLayerVisibility
  waterMotionTuning: PascalWaterMotionTuning
}) {
  return (
    <section className="pointer-events-auto absolute right-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-white/12 bg-slate-950/78 px-3 py-3 text-xs text-slate-100 shadow-2xl shadow-black/25 backdrop-blur">
      <div className="mb-3 font-medium uppercase tracking-[0.16em] text-slate-300">
        Water Motion
      </div>
      <section className="mb-3 rounded-md border border-white/10 bg-black/15 p-2.5">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Front cyan behavior
        </h3>
        <div className="grid gap-3">
          <PascalWaterMotionSlider
            accentClassName="accent-fuchsia-400"
            description="Below this normalized depth, Front cyan accelerates and breaks into segments."
            label="Shallow depth threshold"
            max={0.7}
            min={0.05}
            onChange={onWaterMotionTuningChange}
            step={0.01}
            tuningKey="frontCyanShallowDepthThreshold"
            value={waterMotionTuning.frontCyanShallowDepthThreshold}
          />
          <PascalWaterMotionSlider
            accentClassName="accent-fuchsia-400"
            description="Higher values make the speed and breakup change more abruptly per unit of depth."
            label="Depth response rate"
            max={30}
            min={2}
            onChange={onWaterMotionTuningChange}
            step={1}
            tuningKey="frontCyanShallowDepthResponseRate"
            value={waterMotionTuning.frontCyanShallowDepthResponseRate}
          />
        </div>
      </section>
      <section className="mb-3 rounded-md border border-white/10 bg-black/15 p-2.5">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Coastal foam distance
        </h3>
        <div className="grid gap-3">
          <PascalWaterMotionSlider
            description="Controls how far the continuous shore wash reaches into the water."
            label="Shore wash reach"
            max={0.25}
            min={0.03}
            onChange={onWaterMotionTuningChange}
            step={0.01}
            tuningKey="coastalFoamWashReach"
            value={waterMotionTuning.coastalFoamWashReach}
          />
          <PascalWaterMotionSlider
            description="Sets the inner edge of the broken mini-wave band."
            label="Mini-wave near distance"
            max={0.25}
            min={0.02}
            onChange={onWaterMotionTuningChange}
            step={0.01}
            tuningKey="coastalFoamNearDistance"
            value={waterMotionTuning.coastalFoamNearDistance}
          />
          <PascalWaterMotionSlider
            description="Sets the outer edge of the broken mini-wave band. Distances are normalized: 0 is shore, 1 is deep water."
            label="Mini-wave far distance"
            max={0.65}
            min={0.15}
            onChange={onWaterMotionTuningChange}
            step={0.01}
            tuningKey="coastalFoamFarDistance"
            value={waterMotionTuning.coastalFoamFarDistance}
          />
        </div>
      </section>
      <section className="rounded-md border border-white/10 bg-black/15 p-2.5">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Water layers
        </h3>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Water layer visibility">
          {PASCAL_WATER_MOTION_LAYER_OPTIONS.map((option) => {
            const visible = waterMotionLayerVisibility[option.key]
            return (
              <button
                aria-pressed={visible}
                className={`flex min-h-9 items-center justify-between gap-2 rounded-md border px-2 text-left text-[10px] font-medium transition ${
                  visible
                    ? 'border-cyan-300/70 bg-cyan-300/18 text-cyan-100 hover:bg-cyan-300/24'
                    : 'border-white/10 bg-white/5 text-slate-500 hover:bg-white/9 hover:text-slate-300'
                }`}
                data-water-layer={option.key}
                key={option.key}
                onClick={() => onWaterMotionLayerToggle(option.key)}
                type="button"
              >
                <span>{option.label}</span>
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide">
                  {visible ? 'On' : 'Off'}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </section>
  )
}

function PascalWaterMotionSlider({
  accentClassName = 'accent-cyan-300',
  description,
  label,
  max,
  min,
  onChange,
  step,
  tuningKey,
  value,
}: {
  accentClassName?: string
  description: string
  label: string
  max: number
  min: number
  onChange: (key: keyof PascalWaterMotionTuning, value: number) => void
  step: number
  tuningKey: keyof PascalWaterMotionTuning
  value: number
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
        <span>{label}</span>
        <span className="tabular-nums text-slate-100">
          {step >= 1 ? value.toFixed(0) : value.toFixed(2)}
        </span>
      </span>
      <input
        aria-label={label}
        className={`h-4 w-full ${accentClassName}`}
        data-water-tuning={tuningKey}
        max={max}
        min={min}
        onInput={(event) => onChange(tuningKey, Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="text-[10px] leading-4 text-slate-500">{description}</span>
    </label>
  )
}

function formatPascalCliffSliderValue(value: number, step: number) {
  if (step >= 1) return Math.round(value).toString()
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
}

function PascalCliffFamilyColorCubes({
  familyVariationCount,
  surface,
}: {
  familyVariationCount: number
  surface: PascalWaterLandSurface
}) {
  const families = useMemo(
    () => pascalCliffExperimentFamilyRamp(familyVariationCount),
    [familyVariationCount],
  )
  const geometries = pascalCliffFamilyCubeGeometries(families)
  const placement = useMemo(
    () => createPascalCliffFamilyCubePlacement(surface, families.length),
    [families.length, surface],
  )

  if (!placement) {
    return null
  }

  return (
    <group renderOrder={90}>
      {geometries.map((geometry, index) => {
        const position = placement.positions[index]
        if (!position) {
          return null
        }

        return (
          <mesh
            key={`cliff-family-color-cube-${index}`}
            position={position}
            renderOrder={90}
            rotation={[0, placement.rotationY, 0]}
          >
            <primitive attach="geometry" dispose={null} object={geometry} />
            <meshBasicMaterial side={DoubleSide} toneMapped={false} vertexColors />
          </mesh>
        )
      })}
    </group>
  )
}

function PascalCliffExperimentOverlay({
  elevationParameters,
  mode,
  surface,
}: {
  elevationParameters: IslandElevationParameters
  mode: PascalCliffExperimentMode
  surface: PascalWaterLandSurface
}) {
  const geometry = useMemo(() => {
    if (mode === 'baseline') {
      return null
    }
    return createPascalCliffExperimentGeometry(surface, mode, elevationParameters)
  }, [elevationParameters, mode, surface])
  const plateauShape = useMemo(
    () => createPascalCliffShape(surface.plateauPoints),
    [surface.plateauPoints],
  )
  usePascalCliffGeometryLifecycle(geometry)

  if (!geometry) {
    return null
  }

  return (
    <group renderOrder={80}>
      <mesh renderOrder={82}>
        <primitive attach="geometry" dispose={null} object={geometry} />
        <meshStandardMaterial
          metalness={0.01}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
          roughness={0.96}
          side={DoubleSide}
          vertexColors
        />
      </mesh>
      <mesh
        position={[0, surface.plateauElevation + PASCAL_CLIFF_EXPERIMENT_OVERLAY_LIFT, 0]}
        renderOrder={81}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <shapeGeometry args={[plateauShape]} />
        <meshStandardMaterial color="#75a84d" roughness={0.9} side={DoubleSide} />
      </mesh>
    </group>
  )
}

function createPascalCliffFamilyCubeGeometry(family: PascalCliffExperimentFamily) {
  const half = PASCAL_CLIFF_FAMILY_CUBE_SIZE / 2
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  const addFace = (
    vertices: readonly PascalCliffExperimentVector[],
    color: PascalCliffExperimentColor,
  ) => {
    const base = positions.length / 3
    for (const vertex of vertices) {
      positions.push(vertex.x, vertex.y, vertex.z)
      colors.push(color[0], color[1], color[2])
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  addFace(
    [
      { x: -half, y: half, z: -half },
      { x: half, y: half, z: -half },
      { x: half, y: half, z: half },
      { x: -half, y: half, z: half },
    ],
    family.light,
  )
  addFace(
    [
      { x: -half, y: -half, z: half },
      { x: half, y: -half, z: half },
      { x: half, y: half, z: half },
      { x: -half, y: half, z: half },
    ],
    family.dim,
  )
  addFace(
    [
      { x: half, y: -half, z: -half },
      { x: half, y: -half, z: half },
      { x: half, y: half, z: half },
      { x: half, y: half, z: -half },
    ],
    family.shade,
  )
  addFace(
    [
      { x: -half, y: -half, z: half },
      { x: -half, y: -half, z: -half },
      { x: -half, y: half, z: -half },
      { x: -half, y: half, z: half },
    ],
    family.shade,
  )
  addFace(
    [
      { x: half, y: -half, z: -half },
      { x: -half, y: -half, z: -half },
      { x: -half, y: half, z: -half },
      { x: half, y: half, z: -half },
    ],
    family.dim,
  )
  addFace(
    [
      { x: -half, y: -half, z: -half },
      { x: half, y: -half, z: -half },
      { x: half, y: -half, z: half },
      { x: -half, y: -half, z: half },
    ],
    family.shade,
  )

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

function pascalCliffFamilyCubeGeometries(
  families: readonly PascalCliffExperimentFamily[],
): readonly BufferGeometry[] {
  const cached = PASCAL_CLIFF_FAMILY_CUBE_GEOMETRY_CACHE.get(families)
  if (cached) return cached
  const geometries = families.map(createPascalCliffFamilyCubeGeometry)
  PASCAL_CLIFF_FAMILY_CUBE_GEOMETRY_CACHE.set(families, geometries)
  return geometries
}

function createPascalCliffFamilyCubePlacement(
  surface: PascalWaterLandSurface,
  familyCount: number,
): {
  positions: [number, number, number][]
  rotationY: number
} | null {
  const points = openPascalCliffRing(surface.plateauPoints)
  if (points.length < 3) {
    return null
  }

  const center = centerPascalCliffPoints(points)
  const cameraOutward = normalizePascalCliffPoint2(
    PASCAL_GRASS_WATER_CAMERA_POSITION[0] - PASCAL_GRASS_WATER_CAMERA_TARGET[0],
    PASCAL_GRASS_WATER_CAMERA_POSITION[2] - PASCAL_GRASS_WATER_CAMERA_TARGET[2],
  )
  const tangent = { x: cameraOutward.z, z: -cameraOutward.x }
  const radius = averagePascalCliffPointRadius(points, center)
  const forwardOffset = Math.min(Math.max(radius * 0.42, 6), Math.max(6, radius * 0.62))
  const baseY =
    surface.plateauElevation + PASCAL_CLIFF_FAMILY_CUBE_LIFT + PASCAL_CLIFF_FAMILY_CUBE_SIZE / 2
  const positions = Array.from({ length: familyCount }, (_, index) => {
    const sideOffset = (index - (familyCount - 1) / 2) * PASCAL_CLIFF_FAMILY_CUBE_SPACING
    return [
      center.x + cameraOutward.x * forwardOffset + tangent.x * sideOffset,
      baseY,
      center.z + cameraOutward.z * forwardOffset + tangent.z * sideOffset,
    ] as [number, number, number]
  })

  return {
    positions,
    rotationY: Math.atan2(cameraOutward.x, cameraOutward.z),
  }
}

function PascalGrassWaterCameraRig() {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const size = useThree((state) => state.size)
  const target = useMemo(() => new Vector3(...PASCAL_GRASS_WATER_CAMERA_TARGET), [])

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const responsiveZoom = Math.max(
      PASCAL_GRASS_WATER_CAMERA_MIN_ZOOM,
      Math.min(
        PASCAL_GRASS_WATER_CAMERA_ZOOM,
        PASCAL_GRASS_WATER_CAMERA_ZOOM * (aspect / PASCAL_GRASS_WATER_CAMERA_REFERENCE_ASPECT),
      ),
    )

    camera.position.set(...PASCAL_GRASS_WATER_CAMERA_POSITION)
    camera.lookAt(target)
    if ('zoom' in camera && typeof camera.zoom === 'number') {
      camera.zoom = responsiveZoom
    }
    camera.updateProjectionMatrix()
    invalidate()
    renderScheduler.requestFrame('camera:move')
  }, [camera, invalidate, size.height, size.width, target])

  return (
    <OrbitControls
      dampingFactor={0.08}
      enableDamping
      makeDefault
      maxDistance={900}
      minDistance={30}
      target={target}
    />
  )
}

function createPascalGrassWaterSceneGraph(
  elevationParameters: IslandElevationParameters,
  { waterMotionDebug = false }: PascalWorldMultiplayerDebugClientProps = {},
): {
  sceneGraph: SceneGraph
  shorelinePoints: PascalWaterLandSurface['shorelinePoints']
  waterNode: PascalWaterNode
} {
  const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
  const shorelinePoints = createPascalWaterSmoothedPerimeter(island.perimeter.points)
  const waterNode = PascalWaterNode.parse({
    name: 'Pascal Grass Water',
    parentId: PASCAL_GRASS_WATER_LEVEL_ID,
    planeSize: WATER_PLANE_SIZE,
    perimeter: {
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
      points: [...island.perimeter.points],
    },
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    elevationParameters,
    materialParameters: {
      ...LANDRUSH_WATER_SURFACE_PARAMETERS,
      depthExponent: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthExponent,
      depthNoiseFrequency: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseFrequency,
      depthNoiseStrength: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthNoiseStrength,
      depthReach: WATER_LAB_DEFAULT_FIELD_PARAMETERS.depthReach,
      edgeFadeDistance: WATER_LAB_DEFAULT_FIELD_PARAMETERS.edgeFadeDistance,
      ...(waterMotionDebug ? PASCAL_WATER_MOTION_DEBUG_MATERIAL_PARAMETERS : {}),
    } satisfies Partial<LandrushWaterSurfaceParameters>,
    terrainFieldResolution: 1024,
    metadata: {
      source: 'pascal-grass-water-debug',
      waterMotionDebug,
      waterLabSeed: island.seed,
    },
  })
  const sitePolygon: [number, number][] = island.perimeter.points
    .slice(0, -1)
    .map((point) => [point.x, point.z])
  const level: LevelNode & { camera?: unknown } = {
    object: 'node',
    id: PASCAL_GRASS_WATER_LEVEL_ID,
    type: 'level',
    name: 'Pascal Grass Water Level',
    parentId: PASCAL_GRASS_WATER_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...PASCAL_GRASS_WATER_CAMERA_POSITION],
      target: [...PASCAL_GRASS_WATER_CAMERA_TARGET],
      zoom: PASCAL_GRASS_WATER_CAMERA_ZOOM,
    },
    children: [waterNode.id],
    level: 0,
    metadata: { source: 'pascal-grass-water-debug' },
  }

  return {
    shorelinePoints,
    waterNode,
    sceneGraph: {
      rootNodeIds: [PASCAL_GRASS_WATER_SITE_ID],
      nodes: {
        [PASCAL_GRASS_WATER_SITE_ID]: {
          object: 'node',
          id: PASCAL_GRASS_WATER_SITE_ID,
          type: 'site',
          name: 'Pascal Grass Water Site',
          parentId: null,
          visible: false,
          metadata: { source: 'pascal-grass-water-debug' },
          polygon: {
            points: sitePolygon,
            type: 'polygon',
          },
          children: [PASCAL_GRASS_WATER_BUILDING_ID],
        },
        [PASCAL_GRASS_WATER_BUILDING_ID]: {
          object: 'node',
          id: PASCAL_GRASS_WATER_BUILDING_ID,
          type: 'building',
          name: 'Pascal Grass Water Context',
          parentId: PASCAL_GRASS_WATER_SITE_ID,
          visible: true,
          metadata: { source: 'pascal-grass-water-debug' },
          children: [PASCAL_GRASS_WATER_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [PASCAL_GRASS_WATER_LEVEL_ID]: level,
        [waterNode.id]: waterNode,
      },
    },
  }
}

function createPascalCliffExperimentGeometry(
  surface: PascalWaterLandSurface,
  mode: Exclude<PascalCliffExperimentMode, 'baseline'>,
  elevationParameters: IslandElevationParameters,
): BufferGeometry {
  const outer = openPascalCliffRing(surface.slopeStartPoints)
  const inner = openPascalCliffRing(surface.plateauPoints)
  const pointCount = Math.min(outer.length, inner.length)
  const geometry = new BufferGeometry()

  if (pointCount < 3) {
    return geometry
  }

  const rowCount = mode === 'rock-field' ? 6 : 9
  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const grid: PascalCliffExperimentGridPoint[][] = []
  const stations = createPascalCliffStations(outer, inner, pointCount)
  const families = pascalCliffExperimentFamilyRamp(
    elevationParameters.cliffColorFamilyVariationCount,
  )
  const topElevation = surface.plateauElevation + PASCAL_CLIFF_EXPERIMENT_OVERLAY_LIFT
  const toeElevation = PASCAL_WATER_LOW_ELEVATION + PASCAL_CLIFF_EXPERIMENT_OVERLAY_LIFT

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const outerPoint = outer[pointIndex]!
    const innerPoint = inner[pointIndex]!
    const outwardX = outerPoint.x - innerPoint.x
    const outwardZ = outerPoint.z - innerPoint.z
    const width = Math.max(Math.hypot(outwardX, outwardZ), 0.001)
    const normalX = outwardX / width
    const normalZ = outwardZ / width
    const station = stations[pointIndex] ?? 0
    const sector = hashUnit(Math.floor(station / 9.5), 18.73)
    const broadPulse = Math.sin(station * 0.23 + sector * Math.PI * 2)
    const column: PascalCliffExperimentGridPoint[] = []

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const ratio = rowIndex / (rowCount - 1)
      const heightRatio = smoothstep(0, 1, ratio)
      const baseX = lerp(outerPoint.x, innerPoint.x, ratio)
      const baseZ = lerp(outerPoint.z, innerPoint.z, ratio)
      const ledge =
        mode === 'rock-field' ? 0 : createPascalCliffLedgeOffset(ratio, width, elevationParameters)
      const fracture =
        mode === 'rock-field' ? 0 : (hashUnit(pointIndex * 3.13, rowIndex * 7.7) - 0.5) * 0.16
      const roughOutward =
        mode === 'rock-field'
          ? 0
          : (Math.sin(station * 0.41 + ratio * 7.9) * 0.12 + broadPulse * 0.08 + fracture) *
            (1 - Math.abs(ratio - 0.5))
      const lift =
        mode === 'rock-field'
          ? 0
          : Math.sin(station * 0.34 + ratio * 11.2) * 0.08 * (1 - Math.abs(ratio - 0.5))
      const x = baseX + normalX * (ledge + roughOutward)
      const y = lerp(toeElevation, topElevation, heightRatio) + lift
      const z = baseZ + normalZ * (ledge + roughOutward)

      column.push({
        outwardX: normalX,
        outwardZ: normalZ,
        station,
        u: station / 6,
        v: heightRatio * 2,
        x,
        y,
        z,
      })
    }

    grid.push(column)
  }

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const nextPointIndex = (pointIndex + 1) % pointCount
    for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex += 1) {
      const a = grid[pointIndex]?.[rowIndex]
      const b = grid[nextPointIndex]?.[rowIndex]
      const c = grid[nextPointIndex]?.[rowIndex + 1]
      const d = grid[pointIndex]?.[rowIndex + 1]
      if (!(a && b && c && d)) continue

      const family = pickPascalCliffExperimentFamily(
        (a.station + b.station) * 0.5,
        families,
        elevationParameters.cliffColorFamilyDistribution,
      )
      const hint = {
        x: a.outwardX + b.outwardX,
        y: 0.2,
        z: a.outwardZ + b.outwardZ,
      }
      addPascalCliffExperimentTriangle(positions, colors, uvs, [a, b, d], hint, family)
      addPascalCliffExperimentTriangle(positions, colors, uvs, [b, c, d], hint, family)
    }
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

function createPascalCliffLedgeOffset(
  ratio: number,
  width: number,
  elevationParameters: IslandElevationParameters,
): number {
  const lowerShelf = Math.exp(-(((ratio - 0.24) / 0.08) ** 2)) * 0.18
  const undercut = Math.exp(-(((ratio - 0.48) / 0.12) ** 2)) * -0.22
  const upperLip = Math.exp(-(((ratio - 0.78) / 0.1) ** 2)) * 0.16
  const averageExtrusion =
    (elevationParameters.cliffLayer1ExtrusionAverageMeters +
      elevationParameters.cliffLayer2ExtrusionAverageMeters +
      elevationParameters.cliffLayer3ExtrusionAverageMeters) /
    3
  return (lowerShelf + undercut + upperLip) * Math.min(width, 4.2 + averageExtrusion)
}

function addPascalCliffExperimentTriangle(
  positions: number[],
  colors: number[],
  uvs: number[],
  vertices: readonly [
    PascalCliffExperimentGridPoint,
    PascalCliffExperimentGridPoint,
    PascalCliffExperimentGridPoint,
  ],
  hint: PascalCliffExperimentVector,
  family: PascalCliffExperimentFamily,
) {
  let normal = normalForPascalCliffExperimentTriangle(vertices)
  let oriented = vertices
  if (dotPascalCliffExperimentVector(normal, hint) < 0) {
    oriented = [vertices[0], vertices[2], vertices[1]]
    normal = { x: -normal.x, y: -normal.y, z: -normal.z }
  }

  const color = pascalCliffExperimentExposureColor(family, normal)
  for (const vertex of oriented) {
    positions.push(vertex.x, vertex.y, vertex.z)
    colors.push(color[0], color[1], color[2])
    uvs.push(vertex.u, vertex.v)
  }
}

function pascalCliffExperimentExposureColor(
  family: PascalCliffExperimentFamily,
  normal: PascalCliffExperimentVector,
): PascalCliffExperimentColor {
  if (normal.y >= PASCAL_CLIFF_EXPERIMENT_LIGHT_NORMAL_Y) {
    return family.light
  }
  if (normal.y <= PASCAL_CLIFF_EXPERIMENT_SHADE_NORMAL_Y) {
    return family.shade
  }
  return family.dim
}

function createPascalCliffExperimentFamilyRamp(
  variationCount: number,
): readonly PascalCliffExperimentFamily[] {
  const first = PASCAL_CLIFF_EXPERIMENT_FAMILIES[0]!
  const last = PASCAL_CLIFF_EXPERIMENT_FAMILIES[1]!
  const familyCount = variationCount + 2
  const families = Array.from({ length: familyCount }, (_, index) => {
    const t = index / Math.max(1, familyCount - 1)
    return {
      dim: mixPascalCliffExperimentSrgbColor(first.dim, last.dim, t),
      light: mixPascalCliffExperimentSrgbColor(first.light, last.light, t),
      shade: mixPascalCliffExperimentSrgbColor(first.shade, last.shade, t),
      weight: lerp(first.weight, last.weight, t),
    }
  })
  const totalWeight = families.reduce((total, family) => total + family.weight, 0)
  return families.map((family) => ({ ...family, weight: family.weight / totalWeight }))
}

function pascalCliffExperimentFamilyRamp(variationCount: number) {
  const index = Math.min(
    PASCAL_CLIFF_MAX_FAMILY_VARIATIONS,
    Math.max(0, Math.round(variationCount)),
  )
  return PASCAL_CLIFF_EXPERIMENT_FAMILY_RAMPS[index] ?? PASCAL_CLIFF_EXPERIMENT_FAMILIES
}

function mixPascalCliffExperimentSrgbColor(
  first: PascalCliffExperimentColor,
  second: PascalCliffExperimentColor,
  t: number,
): PascalCliffExperimentColor {
  return [0, 1, 2].map((channel) => {
    const firstSrgb = pascalCliffExperimentLinearChannelToSrgb(first[channel] ?? 0)
    const secondSrgb = pascalCliffExperimentLinearChannelToSrgb(second[channel] ?? 0)
    return pascalCliffExperimentSrgbChannelToLinear(lerp(firstSrgb, secondSrgb, t))
  }) as PascalCliffExperimentColor
}

function pascalCliffExperimentLinearChannelToSrgb(value: number) {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
}

function pickPascalCliffExperimentFamily(
  station: number,
  families: readonly PascalCliffExperimentFamily[],
  distribution: number,
): PascalCliffExperimentFamily {
  const rockIndex = Math.floor(station / 5.75)
  const pick = pascalCliffExperimentFamilyDistributionSample(rockIndex, 41.19, distribution)
  let accumulated = 0
  for (const family of families) {
    accumulated += family.weight
    if (pick <= accumulated) {
      return family
    }
  }
  return families[0]!
}

function pascalCliffExperimentFamilyDistributionSample(
  seed: number,
  salt: number,
  distribution: number,
) {
  const uniform = hashUnit(seed, salt)
  const weight = Number.isFinite(distribution) ? clamp01(distribution) : 0
  if (weight <= 0) return uniform

  const centered =
    (hashUnit(seed, salt + 17.17) + hashUnit(seed, salt + 31.31) + hashUnit(seed, salt + 43.43)) / 3
  return lerp(uniform, centered, weight)
}

function normalForPascalCliffExperimentTriangle(
  vertices: readonly [
    PascalCliffExperimentVector,
    PascalCliffExperimentVector,
    PascalCliffExperimentVector,
  ],
): PascalCliffExperimentVector {
  const [first, second, third] = vertices
  const normal = crossPascalCliffExperimentVector(
    subtractPascalCliffExperimentVector(second, first),
    subtractPascalCliffExperimentVector(third, first),
  )
  const length = Math.hypot(normal.x, normal.y, normal.z)
  if (length <= 0.000001) {
    return { x: 0, y: 1, z: 0 }
  }
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function subtractPascalCliffExperimentVector(
  first: PascalCliffExperimentVector,
  second: PascalCliffExperimentVector,
): PascalCliffExperimentVector {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
    z: first.z - second.z,
  }
}

function crossPascalCliffExperimentVector(
  first: PascalCliffExperimentVector,
  second: PascalCliffExperimentVector,
): PascalCliffExperimentVector {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  }
}

function dotPascalCliffExperimentVector(
  first: PascalCliffExperimentVector,
  second: PascalCliffExperimentVector,
) {
  return first.x * second.x + first.y * second.y + first.z * second.z
}

function createPascalCliffStations(
  outer: readonly { x: number; z: number }[],
  inner: readonly { x: number; z: number }[],
  pointCount: number,
): number[] {
  const stations = new Array<number>(pointCount).fill(0)
  for (let pointIndex = 1; pointIndex < pointCount; pointIndex += 1) {
    const previousOuter = outer[pointIndex - 1]!
    const previousInner = inner[pointIndex - 1]!
    const currentOuter = outer[pointIndex]!
    const currentInner = inner[pointIndex]!
    const previous = {
      x: (previousOuter.x + previousInner.x) * 0.5,
      z: (previousOuter.z + previousInner.z) * 0.5,
    }
    const current = {
      x: (currentOuter.x + currentInner.x) * 0.5,
      z: (currentOuter.z + currentInner.z) * 0.5,
    }
    stations[pointIndex] =
      (stations[pointIndex - 1] ?? 0) + Math.hypot(current.x - previous.x, current.z - previous.z)
  }
  return stations
}

function createPascalCliffShape(points: readonly { x: number; z: number }[]): Shape {
  const shape = new Shape()
  const first = points[0]
  if (!first) {
    return shape
  }

  shape.moveTo(first.x, -first.z)
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (point) {
      shape.lineTo(point.x, -point.z)
    }
  }
  shape.closePath()
  return shape
}

function openPascalCliffRing<T extends { x: number; z: number }>(
  points: readonly T[],
): readonly T[] {
  if (points.length < 2) {
    return points
  }
  const first = points[0]!
  const last = points[points.length - 1]!
  return Math.hypot(first.x - last.x, first.z - last.z) < 0.001 ? points.slice(0, -1) : points
}

function centerPascalCliffPoints(points: readonly { x: number; z: number }[]) {
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return {
    x: x / Math.max(1, points.length),
    z: z / Math.max(1, points.length),
  }
}

function averagePascalCliffPointRadius(
  points: readonly { x: number; z: number }[],
  center: { x: number; z: number },
) {
  if (points.length === 0) {
    return 0
  }

  let radius = 0
  for (const point of points) {
    radius += Math.hypot(point.x - center.x, point.z - center.z)
  }
  return radius / points.length
}

function normalizePascalCliffPoint2(x: number, z: number) {
  const length = Math.hypot(x, z)
  if (length <= 0.000001) {
    return { x: 0, z: 1 }
  }
  return { x: x / length, z: z / length }
}

function lerp(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const ratio = clamp01((value - edge0) / (edge1 - edge0))
  return ratio * ratio * (3 - 2 * ratio)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function hashUnit(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
}

function fract(value: number): number {
  return value - Math.floor(value)
}
