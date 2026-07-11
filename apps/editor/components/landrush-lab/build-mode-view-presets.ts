export type BuildModeViewId =
  | 'island-overview'
  | 'owner-entry'
  | 'build-focus'
  | 'fade-wide'
  | 'menu-proof'

export type BuildModeViewPreset = {
  id: BuildModeViewId
  label: string
  viewBox: [number, number, number, number]
}

export const BUILD_MODE_VIEW_PRESETS: readonly BuildModeViewPreset[] = [
  {
    id: 'island-overview',
    label: 'Island Overview',
    viewBox: [-66, -66, 132, 132],
  },
  {
    id: 'owner-entry',
    label: 'Owner Entry',
    viewBox: [-36, -34, 72, 68],
  },
  {
    id: 'build-focus',
    label: 'Build Focus',
    viewBox: [-25, -25, 50, 50],
  },
  {
    id: 'fade-wide',
    label: 'Fade Wide',
    viewBox: [-52, -48, 104, 96],
  },
  {
    id: 'menu-proof',
    label: 'Menu Proof',
    viewBox: [-30, -30, 60, 60],
  },
]

export function getBuildModeViewPreset(value: string | null): BuildModeViewPreset {
  return (
    BUILD_MODE_VIEW_PRESETS.find((preset) => preset.id === value) ?? BUILD_MODE_VIEW_PRESETS[0]!
  )
}
