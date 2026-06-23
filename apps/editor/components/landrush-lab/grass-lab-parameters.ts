import type { GrassBladeTuning } from './grass-material'

export type GrassBladeTuningSliderKey = keyof GrassBladeTuning

export type GrassBladeTuningSliderConfig<Key extends string = GrassBladeTuningSliderKey> = {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

export const GRASS_BLADE_TUNING_SLIDERS = [
  { key: 'density', label: 'density', max: 1, min: 0.08, step: 0.01 },
  { key: 'patchSize', label: 'patch size', max: 48, min: 8, step: 1 },
  { key: 'patchSoftness', label: 'patch feather', max: 0.42, min: 0.03, step: 0.01 },
  { key: 'brightness', label: 'brightness', max: 1.4, min: 0.65, step: 0.01 },
  { key: 'rootShadow', label: 'root shadow', max: 1, min: 0, step: 0.01 },
  { key: 'opacity', label: 'opacity', max: 1, min: 0.18, step: 0.01 },
  { key: 'width', label: 'width', max: 0.22, min: 0.035, step: 0.005 },
  { key: 'height', label: 'height', max: 1.3, min: 0.25, step: 0.01 },
  { key: 'wind', label: 'wind', max: 1, min: 0, step: 0.01 },
] satisfies readonly GrassBladeTuningSliderConfig[]
