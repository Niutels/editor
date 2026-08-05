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
  const smoothness = Number.isFinite(smoothnessPercent)
    ? Math.min(1, Math.max(0, smoothnessPercent / 100))
    : 1
  const endpointSmoothFade = transitionRatio ** 2 * (3 - 2 * transitionRatio)
  return transitionRatio + (endpointSmoothFade - transitionRatio) * smoothness
}

export function compensateLandrushRobotScreenRevealLayerOpacity(
  opacity: number,
  effectiveLayerCount: number,
) {
  const clampedOpacity = Math.min(1, Math.max(0, opacity))
  const safeLayerCount = Math.max(1, effectiveLayerCount)
  return 1 - (1 - clampedOpacity) ** (1 / safeLayerCount)
}

export function advanceLandrushRobotScreenRevealAmount({
  amount,
  deltaSeconds,
  response,
  target,
}: {
  amount: number
  deltaSeconds: number
  response: number
  target: number
}) {
  const safeAmount = Math.min(1, Math.max(0, amount))
  const safeTarget = Math.min(1, Math.max(0, target))
  const safeDeltaSeconds = Math.min(0.05, Math.max(0, deltaSeconds))
  const safeResponse = Math.max(0, response)
  return safeTarget + (safeAmount - safeTarget) * Math.exp(-safeResponse * safeDeltaSeconds)
}

export function sampleLandrushRobotScreenRevealGrowthScale({
  amount,
  startScale,
}: {
  amount: number
  startScale: number
}) {
  const progress = Math.min(1, Math.max(0, amount))
  const safeStartScale = Math.min(1, Math.max(0, startScale))
  const easedProgress = progress ** 2 * (3 - 2 * progress)
  return safeStartScale + (1 - safeStartScale) * easedProgress
}
