import {
  LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION,
  type LandrushWaterSurfaceParameters,
} from '@pascal-app/nodes'
import type { LandrushIsland } from '@/components/landrush/types'
import {
  WATER_FIELD_DEFAULT_PARAMETERS,
  WATER_FIELD_RESOLUTION,
  type WaterFieldParameters,
} from './water-field-texture'
import { LANDRUSH_WATER_EFFECT_PARAMETERS } from './water-material'

export type WaterMetrics = {
  animatedSurfaceLoops: number
  depthExponent: number
  depthNoiseStrength: number
  depthReach: number
  detailLayers: number
  detailTextureResolution: number
  effectParameterCount: number
  islandBoundsDepth: number
  islandBoundsWidth: number
  movingLineLayers: number
  rippleBandsPerDepth: number
  shoreBandMeters: number
  shoreEdge: number
  splashLayers: number
  terrainFieldResolution: number
  transparentMaskCompositing: number
  waterPlaneRatio: number
  windTimeFrequency: number
}

export type WaterMetricGate = {
  key: keyof WaterMetrics
  label: string
  pass: boolean
  value: number
}

export const WATER_REFERENCE = {
  commit: '41046b57eeed8d156d9c3fd7fa259900baef7816',
  license: 'MIT',
  materialPath: 'sources/Game/Materials/MeshDefaultMaterial.js',
  noisePath: 'sources/Game/Noises.js',
  repo: 'https://github.com/brunosimon/folio-2025',
  waterPath: 'sources/Game/World/WaterSurface.js',
  windPath: 'sources/Game/Wind.js',
} as const

export function measureWaterLab(
  island: LandrushIsland,
  waterPlaneSize: number,
  materialParameters: LandrushWaterSurfaceParameters = LANDRUSH_WATER_EFFECT_PARAMETERS,
  fieldParameters: WaterFieldParameters = WATER_FIELD_DEFAULT_PARAMETERS,
): WaterMetrics {
  const largestIslandAxis = Math.max(island.perimeter.bounds.width, island.perimeter.bounds.depth)

  return {
    animatedSurfaceLoops: 1,
    depthExponent: fieldParameters.depthExponent,
    depthNoiseStrength: fieldParameters.depthNoiseStrength,
    depthReach: fieldParameters.depthReach,
    detailLayers:
      1 +
      (materialParameters.ripplesRatio > 0 ? 1 : 0) +
      (materialParameters.iceRatio > 0 ? 1 : 0) +
      (materialParameters.splashesRatio > 0 ? 1 : 0),
    detailTextureResolution: LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION,
    effectParameterCount: Object.keys(materialParameters).length,
    islandBoundsDepth: round(island.perimeter.bounds.depth),
    islandBoundsWidth: round(island.perimeter.bounds.width),
    movingLineLayers: materialParameters.ripplesRatio > 0 ? 1 : 0,
    rippleBandsPerDepth: round(materialParameters.ripplesSlopeFrequency),
    shoreBandMeters: fieldParameters.shoreBandMeters,
    shoreEdge: materialParameters.shoreEdge,
    splashLayers: materialParameters.splashesRatio > 0 ? 1 : 0,
    terrainFieldResolution: WATER_FIELD_RESOLUTION,
    transparentMaskCompositing: materialParameters.hasBlurredUnderlay ? 1 : 0,
    waterPlaneRatio: round(waterPlaneSize / largestIslandAxis, 2),
    windTimeFrequency: materialParameters.windTimeFrequency,
  }
}

export function waterMetricGates(metrics: WaterMetrics): WaterMetricGate[] {
  return [
    {
      key: 'waterPlaneRatio',
      label: 'water margin ratio >= 2.65',
      pass: metrics.waterPlaneRatio >= 2.65,
      value: metrics.waterPlaneRatio,
    },
    {
      key: 'detailLayers',
      label: 'Bruno mask layers >= 2',
      pass: metrics.detailLayers >= 2,
      value: metrics.detailLayers,
    },
    {
      key: 'detailTextureResolution',
      label: 'Bruno noise texture = 128px',
      pass: metrics.detailTextureResolution === 128,
      value: metrics.detailTextureResolution,
    },
    {
      key: 'terrainFieldResolution',
      label: 'terrain field >= 128px',
      pass: metrics.terrainFieldResolution >= 128,
      value: metrics.terrainFieldResolution,
    },
    {
      key: 'rippleBandsPerDepth',
      label: 'Bruno ripple slope = 10',
      pass: metrics.rippleBandsPerDepth === 10,
      value: metrics.rippleBandsPerDepth,
    },
    {
      key: 'movingLineLayers',
      label: 'wind-time ripples enabled',
      pass: metrics.movingLineLayers >= 1,
      value: metrics.movingLineLayers,
    },
    {
      key: 'windTimeFrequency',
      label: 'Bruno wind time = 0.1',
      pass: metrics.windTimeFrequency === 0.1,
      value: metrics.windTimeFrequency,
    },
    {
      key: 'shoreEdge',
      label: 'Bruno shore edge = 0.17',
      pass: metrics.shoreEdge === 0.17,
      value: metrics.shoreEdge,
    },
    {
      key: 'animatedSurfaceLoops',
      label: 'continuous water animation',
      pass: metrics.animatedSurfaceLoops === 1,
      value: metrics.animatedSurfaceLoops,
    },
    {
      key: 'transparentMaskCompositing',
      label: 'transparent detail-mask composition',
      pass: metrics.transparentMaskCompositing === 1,
      value: metrics.transparentMaskCompositing,
    },
    {
      key: 'effectParameterCount',
      label: 'Bruno water params >= 15',
      pass: metrics.effectParameterCount >= 15,
      value: metrics.effectParameterCount,
    },
  ]
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
