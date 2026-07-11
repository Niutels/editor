import type { LandrushIncomingWaterSurfaceParameters } from '@pascal-app/nodes'
import type { LandrushWaterEffectParameters } from './water-material'

export type WaterMaterialSliderKey = Extract<
  keyof LandrushWaterEffectParameters,
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
>

export type IncomingWaterMaterialSliderKey =
  | WaterMaterialSliderKey
  | Extract<keyof LandrushIncomingWaterSurfaceParameters, 'waveDepthSlowdown' | 'waveShoreWrap'>

export type WaterMaterialSliderConfig = {
  key: WaterMaterialSliderKey
  label: string
  max: number
  min: number
  step: number
}

export const WATER_MATERIAL_SLIDERS = [
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
] satisfies readonly WaterMaterialSliderConfig[]

export const INCOMING_WATER_MATERIAL_SLIDERS = [
  { key: 'ripplesRatio', label: 'ripple amount', max: 1, min: 0, step: 0.01 },
  { key: 'ripplesSlopeFrequency', label: 'ripple count', max: 40, min: 1, step: 0.1 },
  { key: 'waveDepthSlowdown', label: 'shallow slowdown', max: 1.5, min: 0, step: 0.01 },
  { key: 'waveShoreWrap', label: 'shore bend', max: 1, min: 0, step: 0.01 },
  ...WATER_MATERIAL_SLIDERS.slice(2),
] satisfies readonly (Omit<WaterMaterialSliderConfig, 'key'> & {
  key: IncomingWaterMaterialSliderKey
})[]
