export type RobotViewId =
  | 'idle-front'
  | 'walk-follow'
  | 'run-side'
  | 'high-orbit'
  | 'control-vectors'

export type RobotMotionMode = 'idle' | 'walk' | 'run'

export type RobotViewPreset = {
  id: RobotViewId
  label: string
  motion: RobotMotionMode
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    zoom: number
  }
}

export const ROBOT_VIEW_PRESETS: readonly RobotViewPreset[] = [
  {
    id: 'idle-front',
    label: 'Idle Front',
    motion: 'idle',
    camera: { position: [4.2, 2.3, 6.2], target: [0, 1.05, 0], zoom: 190 },
  },
  {
    id: 'walk-follow',
    label: 'Walk Follow',
    motion: 'walk',
    camera: { position: [4.7, 2.7, 7.3], target: [0.6, 1, -0.4], zoom: 170 },
  },
  {
    id: 'run-side',
    label: 'Run Side',
    motion: 'run',
    camera: { position: [7.5, 2.2, 2.2], target: [0.8, 1, 0], zoom: 180 },
  },
  {
    id: 'high-orbit',
    label: 'High Orbit',
    motion: 'walk',
    camera: { position: [-5.8, 6.8, 7.2], target: [0, 0.9, 0], zoom: 155 },
  },
  {
    id: 'control-vectors',
    label: 'Camera Relative Controls',
    motion: 'run',
    camera: { position: [-6.2, 3.2, 4.8], target: [0.3, 1, -0.2], zoom: 175 },
  },
]

export function getRobotViewPreset(value: string | null): RobotViewPreset {
  return ROBOT_VIEW_PRESETS.find((preset) => preset.id === value) ?? ROBOT_VIEW_PRESETS[0]!
}
