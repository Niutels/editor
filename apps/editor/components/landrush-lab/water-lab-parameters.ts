import { generateLandrushIsland } from '@/components/landrush/generator'
import type { LandrushIsland } from '@/components/landrush/types'
import type { WaterFieldParameters } from './water-field-texture'

export type IslandElevationParameters = {
  cliffBandMergeThresholdMeters: number
  cliffBlockDepthMaxMeters: number
  cliffBlockDepthMinMeters: number
  cliffColorAverageRatio: number
  cliffContrast: number
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
  cliffBandMergeThresholdMeters: 3.6,
  cliffBlockDepthMaxMeters: 2.1,
  cliffBlockDepthMinMeters: 0.5,
  cliffColorAverageRatio: 0.75,
  cliffContrast: 0.41,
  cliffToneVariation: 0.35,
  contourNoiseFrequency: 0.08,
  contourVariationMeters: 3.5,
  edgeLiftMeters: 6,
  innerContourMeters: 3.75,
  outerContourMeters: 0,
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
