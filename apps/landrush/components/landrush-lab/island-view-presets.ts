export type IslandViewId = 'overview' | 'north-low' | 'east-bank' | 'parcel-angle' | 'wide-map'

export type IslandViewPreset = {
  id: IslandViewId
  label: string
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    zoom: number
  }
}

export const ISLAND_VIEW_PRESETS: readonly IslandViewPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    camera: { position: [92, 92, 92], target: [0, 0, 0], zoom: 8.3 },
  },
  {
    id: 'north-low',
    label: 'North Low',
    camera: { position: [18, 54, 112], target: [0, 0, 2], zoom: 7.7 },
  },
  {
    id: 'east-bank',
    label: 'East Bank',
    camera: { position: [118, 48, 26], target: [0, 0, -3], zoom: 7.9 },
  },
  {
    id: 'parcel-angle',
    label: 'Parcel Angle',
    camera: { position: [66, 70, -92], target: [2, 0, -2], zoom: 8.1 },
  },
  {
    id: 'wide-map',
    label: 'Wide Map',
    camera: { position: [0, 118, 0.01], target: [0, 0, 0], zoom: 9.7 },
  },
]

export function getIslandViewPreset(value: string | null): IslandViewPreset {
  return ISLAND_VIEW_PRESETS.find((preset) => preset.id === value) ?? ISLAND_VIEW_PRESETS[0]!
}
