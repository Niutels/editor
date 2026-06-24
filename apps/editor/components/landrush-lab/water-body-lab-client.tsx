'use client'

import {
  createLandrushWaterBodyMaterial,
  LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  type LandrushWaterBodySurfaceParameters,
} from '@pascal-app/nodes'
import {
  WaterLabClient,
  type WaterLabMaterialSliderConfig,
  type WaterLabMaterialToggleConfig,
} from './water-lab-client'
import { WATER_MATERIAL_SLIDERS } from './water-material-sliders'

const BODY_MATERIAL_SLIDERS = [
  ...WATER_MATERIAL_SLIDERS,
  { key: 'waveDepthSmooth', label: 'wave depth smooth', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyBehindRatio', label: 'behind body', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyBehindLagSeconds', label: 'behind lag', max: 2, min: 0, step: 0.01 },
  { key: 'waveBodyBehindWidth', label: 'behind width', max: 0.6, min: 0.005, step: 0.005 },
  { key: 'waveBodyBehindBrightness', label: 'behind brightness', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyAheadRatio', label: 'ahead body', max: 1, min: 0, step: 0.01 },
  { key: 'waveBodyAheadLagSeconds', label: 'ahead lag', max: 2, min: 0, step: 0.01 },
  { key: 'waveBodyAheadWidth', label: 'ahead width', max: 0.6, min: 0.005, step: 0.005 },
  { key: 'waveBodyAheadBrightness', label: 'ahead brightness', max: 1, min: 0, step: 0.01 },
  { key: 'waveSectorCount', label: 'clock count', max: 60, min: 1, step: 1 },
  { key: 'waveSectorTimeOffset', label: 'sector offset sec', max: 30, min: 5, step: 0.25 },
  { key: 'waveSectorRotationSpeed', label: 'sector spin', max: 4, min: 0, step: 0.01 },
] satisfies readonly WaterLabMaterialSliderConfig[]

const BODY_MATERIAL_TOGGLES = [
  { key: 'waveSectorEnabled', label: 'clock offsets' },
] satisfies readonly WaterLabMaterialToggleConfig[]

const BODY_MATERIAL_DEFAULTS = {
  ...LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  ripplesBreakupEnd: 0.61,
  ripplesBreakupFrequency: 0.02,
  ripplesBreakupStart: 0.06,
  waveBodyBehindRatio: 0.28,
  waveBodyBehindLagSeconds: 0.36,
  waveBodyBehindWidth: 0.12,
  waveBodyBehindBrightness: 0.69,
  waveBodyAheadRatio: 0.16,
  waveBodyAheadLagSeconds: 1.97,
  waveBodyAheadWidth: 0.6,
  waveBodyAheadBrightness: 0.51,
  waveDepthSmooth: 1,
  waveSectorCount: 1,
  waveSectorEnabled: 1,
  waveSectorRotationSpeed: 0,
  waveSectorTimeOffset: 5,
} satisfies LandrushWaterBodySurfaceParameters

export function WaterBodyLabClient() {
  return (
    <WaterLabClient
      key="water-body-defaults-v7"
      labTitle="Landrush water body lab"
      materialDefaults={BODY_MATERIAL_DEFAULTS}
      materialSliders={BODY_MATERIAL_SLIDERS}
      materialToggles={BODY_MATERIAL_TOGGLES}
      panelSubtitle="independent lagged body material"
      waterMaterialFactory={createLandrushWaterBodyMaterial}
    />
  )
}
