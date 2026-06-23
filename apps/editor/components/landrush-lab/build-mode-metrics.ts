import type { LandrushMode } from '../landrush/types'

export const BUILD_MODE_CAMERA_TRANSITION_MS = 520
export const BUILD_MODE_SURROUNDING_TARGET_OPACITY = 0.08

export type BuildModeRuntimeMetrics = {
  buildMenuOpacity: number
  cameraTransitionProgress: number
  canBuild: boolean
  deniedCount: number
  mode: LandrushMode
  modeChangeCount: number
  surroundingIslandOpacity: number
}

export type BuildModeProofMetrics = {
  buildMenuVisibleMs: number | null
  cameraTransitionMs: number | null
  deniedOutsidePass: number
  modeSwitchMs: number | null
  noReloadPass: number
  surroundingHiddenMs: number | null
}

export type BuildModeMetrics = BuildModeRuntimeMetrics & BuildModeProofMetrics

export type BuildModeMetricGate = {
  key: keyof BuildModeMetrics
  label: string
  pass: boolean
  value: number | string | boolean | null
}

export function measureBuildModeLab(
  runtime: BuildModeRuntimeMetrics,
  proof: BuildModeProofMetrics,
): BuildModeMetrics {
  return {
    ...runtime,
    ...proof,
  }
}

export function buildModeMetricGates(metrics: BuildModeMetrics): BuildModeMetricGate[] {
  return [
    {
      key: 'deniedOutsidePass',
      label: 'B outside range denied',
      pass: metrics.deniedOutsidePass === 1,
      value: metrics.deniedOutsidePass,
    },
    {
      key: 'modeSwitchMs',
      label: 'B inside switches <250ms',
      pass: typeof metrics.modeSwitchMs === 'number' && metrics.modeSwitchMs < 250,
      value: metrics.modeSwitchMs,
    },
    {
      key: 'cameraTransitionMs',
      label: 'camera transition 300-700ms',
      pass:
        typeof metrics.cameraTransitionMs === 'number' &&
        metrics.cameraTransitionMs >= 300 &&
        metrics.cameraTransitionMs <= 700,
      value: metrics.cameraTransitionMs,
    },
    {
      key: 'noReloadPass',
      label: 'no page reload',
      pass: metrics.noReloadPass === 1,
      value: metrics.noReloadPass,
    },
    {
      key: 'surroundingHiddenMs',
      label: 'surroundings <0.1 by 700ms',
      pass: typeof metrics.surroundingHiddenMs === 'number' && metrics.surroundingHiddenMs <= 700,
      value: metrics.surroundingHiddenMs,
    },
    {
      key: 'buildMenuVisibleMs',
      label: 'menu >0.95 by 500ms',
      pass: typeof metrics.buildMenuVisibleMs === 'number' && metrics.buildMenuVisibleMs <= 500,
      value: metrics.buildMenuVisibleMs,
    },
  ]
}

export const EMPTY_BUILD_MODE_PROOF: BuildModeProofMetrics = {
  buildMenuVisibleMs: null,
  cameraTransitionMs: null,
  deniedOutsidePass: 0,
  modeSwitchMs: null,
  noReloadPass: 0,
  surroundingHiddenMs: null,
}
