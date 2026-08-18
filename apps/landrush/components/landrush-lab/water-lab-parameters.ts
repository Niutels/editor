import { generateLandrushIsland } from '@/components/landrush/generator'
import type { LandrushIsland } from '@/components/landrush/types'
import type { WaterFieldParameters } from './water-field-texture'

export type IslandElevationParameters = {
  cliffAverageSlope: number
  cliffBandMergeThresholdMeters: number
  cliffBlockDepthMaxMeters: number
  cliffBlockDepthMinMeters: number
  cliffColorAverageRatio: number
  cliffColorFamilyVariationCount: number
  cliffColorFamilyDistribution: number
  cliffContrast: number
  cliffCornerChipAngleAverage: number
  cliffCornerChipAngleDensity: number
  cliffCornerChipAngleDistribution: number
  cliffCornerChipAngleVariation: number
  cliffCornerChipAverage: number
  cliffCornerChipDarkening: number
  cliffCornerChipDensity: number
  cliffCornerChipDistribution: number
  cliffCornerChipVariation: number
  cliffFrontPaintColorCount: number
  cliffFrontPaintColorDistance: number
  cliffFrontPaintDensity: number
  cliffFrontPaintSplashHeightRatio: number
  cliffFrontPaintSplashHeightVariation: number
  cliffFrontPaintSplashHeightVariationDistribution: number
  cliffFrontPaintSplashVerticalSpreadRatio: number
  cliffFrontPaintSplashVerticalSpreadVariation: number
  cliffFrontPaintSplashVerticalSpreadVariationDistribution: number
  cliffFrontPaintSplashWidthRatio: number
  cliffFrontPaintSplashWidthVariation: number
  cliffFrontPaintSplashWidthVariationDistribution: number
  cliffLayer1BlockWidthMeters: number
  cliffLayer1BlockWidthVariationMeters: number
  cliffLayer1BlockWidthVariationDistribution: number
  cliffLayer1ExtrusionAverageMeters: number
  cliffLayer1ExtrusionVariationMeters: number
  cliffLayer1ExtrusionVariationDistribution: number
  cliffLayer2AltitudeRatio: number
  cliffLayer2AltitudeVariation: number
  cliffLayer2AltitudeVariationDistribution: number
  cliffLayer2BlockWidthMeters: number
  cliffLayer2Density: number
  cliffLayer2BlockWidthVariationMeters: number
  cliffLayer2BlockWidthVariationDistribution: number
  cliffLayer2ExtrusionAverageMeters: number
  cliffLayer2ExtrusionVariationMeters: number
  cliffLayer2ExtrusionVariationDistribution: number
  cliffLayer3AltitudeRatio: number
  cliffLayer3AltitudeVariation: number
  cliffLayer3AltitudeVariationDistribution: number
  cliffLayer3BlockWidthMeters: number
  cliffLayer3Density: number
  cliffLayer3BlockWidthVariationMeters: number
  cliffLayer3BlockWidthVariationDistribution: number
  cliffLayer3ExtrusionAverageMeters: number
  cliffLayer3ExtrusionVariationMeters: number
  cliffLayer3ExtrusionVariationDistribution: number
  cliffSlopeVariation: number
  cliffSlopeVariationDistribution: number
  cliffToneVariation: number
  contourNoiseFrequency: number
  contourVariationMeters: number
  edgeLiftMeters: number
  innerContourMeters: number
  outerContourMeters: number
}

export type WaterLabIslandParameters = {
  coast: number
  coastCharacter: number
  covePairing: number
  detailSeparation: number
  detail: number
  erosionSmoothness: number
  lobes: number
  naturalness: number
  neckPinch: number
  size: number
  spineInfluence: number
  variant: number
}

export type LabSliderConfig<Key extends string> = {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

export const WATER_LAB_DEFAULT_FIELD_PARAMETERS = {
  depthContourCollapseMeters: 10.3,
  depthContourCollapseScale: 1.25,
  depthContourNoiseFrequency: 0.1,
  depthContourOffsetMeters: 2.6,
  depthContourVariationMeters: 8.6,
  depthExponent: 0.52,
  depthNoiseFrequency: 0.03,
  depthNoiseStrength: 0,
  depthReach: 15,
  edgeFadeDistance: 18,
  shoreBandMeters: 0,
  shoreFeatherMeters: 0.45,
  shoreNoiseFrequency: 0.075,
  shoreVariationMeters: 0.85,
} satisfies WaterFieldParameters

export const WATER_LAB_DEFAULT_ELEVATION_PARAMETERS = {
  cliffAverageSlope: 0.42,
  cliffBandMergeThresholdMeters: 3.6,
  cliffBlockDepthMaxMeters: 2.1,
  cliffBlockDepthMinMeters: 0.5,
  cliffColorAverageRatio: 0.75,
  cliffColorFamilyVariationCount: 0,
  cliffColorFamilyDistribution: 0,
  cliffContrast: 0.41,
  cliffCornerChipAngleAverage: 0.5,
  cliffCornerChipAngleDensity: 1,
  cliffCornerChipAngleDistribution: 0.5,
  cliffCornerChipAngleVariation: 0,
  cliffCornerChipAverage: 0,
  cliffCornerChipDarkening: 0.12,
  cliffCornerChipDensity: 0,
  cliffCornerChipDistribution: 0.5,
  cliffCornerChipVariation: 0,
  cliffFrontPaintColorCount: 1,
  cliffFrontPaintColorDistance: 0.45,
  cliffFrontPaintDensity: 1,
  cliffFrontPaintSplashHeightRatio: 0.32,
  cliffFrontPaintSplashHeightVariation: 0.14,
  cliffFrontPaintSplashHeightVariationDistribution: 0.55,
  cliffFrontPaintSplashVerticalSpreadRatio: 0.24,
  cliffFrontPaintSplashVerticalSpreadVariation: 0.12,
  cliffFrontPaintSplashVerticalSpreadVariationDistribution: 0.55,
  cliffFrontPaintSplashWidthRatio: 0.72,
  cliffFrontPaintSplashWidthVariation: 0.18,
  cliffFrontPaintSplashWidthVariationDistribution: 0.55,
  cliffLayer1BlockWidthMeters: 5.4,
  cliffLayer1BlockWidthVariationMeters: 1.8,
  cliffLayer1BlockWidthVariationDistribution: 0,
  cliffLayer1ExtrusionAverageMeters: 0.95,
  cliffLayer1ExtrusionVariationMeters: 0.28,
  cliffLayer1ExtrusionVariationDistribution: 0,
  cliffLayer2AltitudeRatio: 0.64,
  cliffLayer2AltitudeVariation: 0.14,
  cliffLayer2AltitudeVariationDistribution: 0,
  cliffLayer2BlockWidthMeters: 4.2,
  cliffLayer2Density: 1,
  cliffLayer2BlockWidthVariationMeters: 1.5,
  cliffLayer2BlockWidthVariationDistribution: 0,
  cliffLayer2ExtrusionAverageMeters: 0.95,
  cliffLayer2ExtrusionVariationMeters: 0.28,
  cliffLayer2ExtrusionVariationDistribution: 0,
  cliffLayer3AltitudeRatio: 0.36,
  cliffLayer3AltitudeVariation: 0.12,
  cliffLayer3AltitudeVariationDistribution: 0,
  cliffLayer3BlockWidthMeters: 3.1,
  cliffLayer3Density: 1,
  cliffLayer3BlockWidthVariationMeters: 1.15,
  cliffLayer3BlockWidthVariationDistribution: 0,
  cliffLayer3ExtrusionAverageMeters: 0.95,
  cliffLayer3ExtrusionVariationMeters: 0.28,
  cliffLayer3ExtrusionVariationDistribution: 0,
  cliffSlopeVariation: 0.14,
  cliffSlopeVariationDistribution: 0,
  cliffToneVariation: 0.35,
  contourNoiseFrequency: 0.08,
  contourVariationMeters: 3.5,
  edgeLiftMeters: 6,
  innerContourMeters: 3.75,
  outerContourMeters: 0,
} satisfies IslandElevationParameters

export const PASCAL_WORLD_DEFAULT_ELEVATION_PARAMETERS = {
  ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  cliffAverageSlope: 0.14,
  cliffColorAverageRatio: 0.92,
  cliffColorFamilyDistribution: 1,
  cliffColorFamilyVariationCount: 8,
  cliffCornerChipAngleAverage: 0.5,
  cliffCornerChipAngleDensity: 1,
  cliffCornerChipAngleDistribution: 0.65,
  cliffCornerChipAngleVariation: 0.35,
  cliffCornerChipAverage: 0.35,
  cliffCornerChipDarkening: 0.12,
  cliffCornerChipDensity: 0.65,
  cliffCornerChipDistribution: 0.65,
  cliffCornerChipVariation: 0.2,
  cliffFrontPaintColorCount: 5,
  cliffFrontPaintColorDistance: 0.26,
  cliffFrontPaintDensity: 1,
  cliffFrontPaintSplashHeightRatio: 0.61,
  cliffFrontPaintSplashHeightVariation: 0.6,
  cliffFrontPaintSplashHeightVariationDistribution: 1,
  cliffFrontPaintSplashVerticalSpreadRatio: 0.65,
  cliffFrontPaintSplashVerticalSpreadVariation: 0.12,
  cliffFrontPaintSplashVerticalSpreadVariationDistribution: 0.55,
  cliffFrontPaintSplashWidthRatio: 1,
  cliffFrontPaintSplashWidthVariation: 0.6,
  cliffFrontPaintSplashWidthVariationDistribution: 1,
  cliffLayer1BlockWidthMeters: 2.2,
  cliffLayer1BlockWidthVariationMeters: 8,
  cliffLayer1BlockWidthVariationDistribution: 0,
  cliffLayer1ExtrusionAverageMeters: 1.7,
  cliffLayer1ExtrusionVariationMeters: 1,
  cliffLayer1ExtrusionVariationDistribution: 0.1,
  cliffLayer2AltitudeRatio: 0.69,
  cliffLayer2AltitudeVariation: 0.14,
  cliffLayer2AltitudeVariationDistribution: 0,
  cliffLayer2BlockWidthMeters: 0.9,
  cliffLayer2BlockWidthVariationMeters: 4.3,
  cliffLayer2BlockWidthVariationDistribution: 0,
  cliffLayer2Density: 0.57,
  cliffLayer2ExtrusionAverageMeters: 1.15,
  cliffLayer2ExtrusionVariationMeters: 0.28,
  cliffLayer2ExtrusionVariationDistribution: 0,
  cliffLayer3AltitudeRatio: 0.36,
  cliffLayer3AltitudeVariation: 0.17,
  cliffLayer3AltitudeVariationDistribution: 1,
  cliffLayer3BlockWidthMeters: 0.9,
  cliffLayer3BlockWidthVariationMeters: 1.4,
  cliffLayer3BlockWidthVariationDistribution: 0,
  cliffLayer3Density: 1,
  cliffLayer3ExtrusionAverageMeters: 0.95,
  cliffLayer3ExtrusionVariationMeters: 0.28,
  cliffLayer3ExtrusionVariationDistribution: 0,
  cliffSlopeVariation: 0.05,
  cliffSlopeVariationDistribution: 0,
  cliffToneVariation: 0.12,
  edgeLiftMeters: 10.8,
} satisfies IslandElevationParameters

export const WATER_LAB_DEFAULT_ISLAND_PARAMETERS = {
  coast: 1,
  coastCharacter: 0,
  covePairing: 0,
  detailSeparation: 0,
  detail: 128,
  erosionSmoothness: 0.4,
  lobes: 1,
  naturalness: 1,
  neckPinch: 1,
  size: 1,
  spineInfluence: 1,
  variant: 0,
} satisfies WaterLabIslandParameters

export const WATER_LAB_ISLAND_SLIDERS = [
  { key: 'variant', label: 'shape variant', max: 50, min: 0, step: 1 },
  { key: 'size', label: 'island size', max: 1.25, min: 0.75, step: 0.01 },
  { key: 'spineInfluence', label: 'spine shape', max: 1, min: 0, step: 0.01 },
  { key: 'neckPinch', label: 'neck pinch', max: 1, min: 0, step: 0.01 },
  { key: 'erosionSmoothness', label: 'erosion smooth', max: 1, min: 0, step: 0.01 },
  { key: 'detail', label: 'outline detail', max: 128, min: 32, step: 4 },
  { key: 'lobes', label: 'big lobes', max: 1.8, min: 0, step: 0.05 },
  { key: 'coast', label: 'coast cuts', max: 2, min: 0, step: 0.05 },
  { key: 'naturalness', label: 'rough asymmetry', max: 1.8, min: 0, step: 0.05 },
] satisfies readonly LabSliderConfig<keyof WaterLabIslandParameters>[]

type WaterLabIslandProfileMeasure = <T>(id: string, callback: () => T) => T

export function generateWaterLabIsland(
  parameters: WaterLabIslandParameters,
  profileMeasure?: WaterLabIslandProfileMeasure,
  profileScope = 'setup.water-lab.generate-island',
): LandrushIsland {
  return generateLandrushIsland({
    seed: parameters.variant === 0 ? 'mvp-loop-1-295' : `mvp-loop-1-295:${parameters.variant}`,
    profileMeasure,
    profileScope,
    shape: {
      asymmetry: parameters.naturalness,
      coast: parameters.coast,
      coastCharacter: parameters.coastCharacter,
      covePairing: parameters.covePairing,
      detailSeparation: parameters.detailSeparation,
      erosionSmoothness: parameters.erosionSmoothness,
      lobes: parameters.lobes,
      neckPinch: parameters.neckPinch,
      roughness: parameters.naturalness,
      spineInfluence: parameters.spineInfluence,
    },
    size: { width: 116 * parameters.size, depth: 116 * parameters.size },
    perimeterPointCount: parameters.detail,
    treeSpacing: 7.1,
  })
}
