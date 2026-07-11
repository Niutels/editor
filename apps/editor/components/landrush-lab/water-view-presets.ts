export type WaterViewId = 'overview' | 'low-shore' | 'ripple-field' | 'foam-edge' | 'wide-atoll'

export type WaterViewPreset = {
  id: WaterViewId
  label: string
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    zoom: number
  }
}

export const WATER_VIEW_PRESETS: readonly WaterViewPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    camera: { position: [88, 86, 94], target: [0, 0, 0], zoom: 7.8 },
  },
  {
    id: 'low-shore',
    label: 'Low Shore',
    camera: { position: [24, 34, 108], target: [0, 0, -2], zoom: 7.2 },
  },
  {
    id: 'ripple-field',
    label: 'Ripple Field',
    camera: { position: [-112, 42, 46], target: [-2, 0, 1], zoom: 7.4 },
  },
  {
    id: 'foam-edge',
    label: 'Foam Edge',
    camera: { position: [96, 38, -64], target: [2, 0, 0], zoom: 7.6 },
  },
  {
    id: 'wide-atoll',
    label: 'Wide Atoll',
    camera: { position: [0, 128, 0.01], target: [0, 0, 0], zoom: 8.6 },
  },
]

export function getWaterViewPreset(value: string | null): WaterViewPreset {
  return WATER_VIEW_PRESETS.find((preset) => preset.id === value) ?? WATER_VIEW_PRESETS[0]!
}
