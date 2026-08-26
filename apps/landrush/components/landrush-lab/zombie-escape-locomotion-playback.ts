export function resolveZombieEscapeLocomotionPlaybackRate(
  horizontalSpeed: number,
  walkMetersPerSecond: number,
  runMetersPerSecond: number,
  runBlend: number,
) {
  const speed = Math.max(0, horizontalSpeed)
  if (speed <= 0.025) return 0
  const blend = Math.max(0, Math.min(1, runBlend))
  const referenceSpeed =
    Math.max(0.025, walkMetersPerSecond) +
    (Math.max(walkMetersPerSecond, runMetersPerSecond) - Math.max(0.025, walkMetersPerSecond)) *
      blend
  return Math.max(0.35, Math.min(1.75, speed / referenceSpeed))
}

export function resolveZombieEscapeLocomotionWeight(horizontalSpeed: number) {
  return Math.max(0, Math.min(1, (Math.max(0, horizontalSpeed) - 0.025) / 0.2))
}
