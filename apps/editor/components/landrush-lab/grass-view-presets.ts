export type GrassViewId = 'overview' | 'blade-low' | 'patch-map' | 'shore-grass' | 'wide-field'

export type GrassViewPreset = {
  id: GrassViewId
  label: string
  camera: {
    fov: number
    position: [number, number, number]
    target: [number, number, number]
  }
}

export const GRASS_VIEW_PRESETS: readonly GrassViewPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    camera: { fov: 25, position: [12.3, 11.8, 12.3], target: [0, 0, 0] },
  },
  {
    id: 'blade-low',
    label: 'Blade Low',
    camera: { fov: 25, position: [7, 4.2, 10], target: [0, 0.5, 0] },
  },
  {
    id: 'patch-map',
    label: 'Patch Map',
    camera: { fov: 25, position: [0, 88, 0.01], target: [0, 0, 0] },
  },
  {
    id: 'shore-grass',
    label: 'Shore Grass',
    camera: { fov: 25, position: [-22, 11, 16], target: [-10, 0.4, 5] },
  },
  {
    id: 'wide-field',
    label: 'Wide Field',
    camera: { fov: 25, position: [38, 24, -46], target: [2, 0.2, -2] },
  },
]

export function getGrassViewPreset(value: string | null): GrassViewPreset {
  return GRASS_VIEW_PRESETS.find((preset) => preset.id === value) ?? GRASS_VIEW_PRESETS[0]!
}
