export const LANDRUSH_ROBOT_SCREEN_REVEAL_CURVE_POWER_RANGE = 15

export function resolveLandrushRobotScreenRevealCurvePower(smoothnessPercent: number) {
  const smoothness = Number.isFinite(smoothnessPercent)
    ? Math.min(1, Math.max(0, smoothnessPercent / 100))
    : 1
  return 1 + (1 - smoothness) ** 2 * LANDRUSH_ROBOT_SCREEN_REVEAL_CURVE_POWER_RANGE
}

export function sampleLandrushRobotScreenRevealRadialOpacity({
  distancePx,
  innerRadiusPx,
  outerRadiusPx,
  smoothnessPercent,
}: {
  distancePx: number
  innerRadiusPx: number
  outerRadiusPx: number
  smoothnessPercent: number
}) {
  const safeInnerRadius = Math.max(0, innerRadiusPx)
  const safeOuterRadius = Math.max(safeInnerRadius + 1, outerRadiusPx)
  const transitionRatio = Math.min(
    1,
    Math.max(0, (distancePx - safeInnerRadius) / (safeOuterRadius - safeInnerRadius)),
  )
  const curvePower = resolveLandrushRobotScreenRevealCurvePower(smoothnessPercent)
  const opaqueWeight = transitionRatio ** curvePower
  const clearWeight = (1 - transitionRatio) ** curvePower
  return opaqueWeight / (opaqueWeight + clearWeight)
}
