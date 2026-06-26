import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'

export const GRASS_WATER_DEFAULT_TUNING = {
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
