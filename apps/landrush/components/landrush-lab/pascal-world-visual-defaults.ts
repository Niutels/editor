import {
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type LandrushWaterSurfaceParameters,
} from '@landrush/pascal-plugin'
import type { GrassBladeTuning } from './grass-material'
import { GRASS_WATER_DEFAULT_TUNING } from './grass-water-defaults'
import {
  type IslandElevationParameters,
  PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS,
} from './water-lab-parameters'

export type PascalWorldWaterMotionTuning = Pick<
  LandrushWaterSurfaceParameters,
  | 'coastalFoamFarDistance'
  | 'coastalFoamFarDistanceOscillationAmplitude'
  | 'coastalFoamFarDistanceOscillationPeriodSeconds'
  | 'coastalFoamNearDistance'
  | 'coastalFoamWashInwardOffset'
  | 'coastalFoamWashReach'
  | 'frontCyanShallowBreakupResponseRate'
  | 'frontCyanShallowDepthThreshold'
  | 'frontCyanShallowSpeedResponseRate'
  | 'ripplesTimeSpeed'
>

export const PASCAL_WORLD_WATER_MOTION_TUNING = {
  coastalFoamFarDistance: 0.056,
  coastalFoamFarDistanceOscillationAmplitude: 0.098,
  coastalFoamFarDistanceOscillationPeriodSeconds: 21.35,
  coastalFoamNearDistance: 0.03,
  coastalFoamWashInwardOffset: 0,
  coastalFoamWashReach: 0.04,
  frontCyanShallowBreakupResponseRate: 160,
  frontCyanShallowDepthThreshold: 0.44,
  frontCyanShallowSpeedResponseRate: 2,
  ripplesTimeSpeed: 0.42,
} satisfies PascalWorldWaterMotionTuning

export const PASCAL_WORLD_WATER_MATERIAL_PARAMETERS = {
  ...LANDRUSH_WATER_SURFACE_PARAMETERS,
  ...PASCAL_WORLD_WATER_MOTION_TUNING,
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
} satisfies LandrushWaterSurfaceParameters

export const PASCAL_WORLD_ELEVATION_PARAMETERS = {
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

export const PASCAL_WORLD_GRASS_TUNING = {
  ...GRASS_WATER_DEFAULT_TUNING,
} satisfies GrassBladeTuning
