const STYLIZED_SCENE_GRASS_FADE_SECONDS = 1.375

export function advanceStylizedGrassFadeVisibility(
  value: number,
  target: number,
  elapsedSeconds: number,
) {
  const safeValue = clamp01(Number.isFinite(value) ? value : 1)
  const safeTarget = clamp01(Number.isFinite(target) ? target : safeValue)
  const step =
    Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0) /
    STYLIZED_SCENE_GRASS_FADE_SECONDS
  if (safeValue < safeTarget) return Math.min(safeTarget, safeValue + step)
  return Math.max(safeTarget, safeValue - step)
}

export function resolveStylizedGrassFadeSpatialVisibility(
  signedDistanceMeters: number,
  featherMeters: number,
) {
  if (!Number.isFinite(signedDistanceMeters)) return 1
  const safeFeather = Math.max(0, Number.isFinite(featherMeters) ? featherMeters : 0)
  if (safeFeather <= 0.000_001) return signedDistanceMeters <= 0 ? 0 : 1
  const progress = clamp01(signedDistanceMeters / safeFeather)
  return progress * progress * (3 - 2 * progress)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
