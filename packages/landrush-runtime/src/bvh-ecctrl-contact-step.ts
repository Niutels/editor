export function runBVHEcctrlContactStep<Colliders>(
  colliders: Colliders,
  deltaSeconds: number,
  synchronizeSpatialState: () => void,
  resolveSupport: (colliders: Colliders) => void,
  resolveCollisions: (colliders: Colliders, deltaSeconds: number) => boolean,
) {
  synchronizeSpatialState()
  resolveSupport(colliders)

  synchronizeSpatialState()
  const positionCorrected = resolveCollisions(colliders, deltaSeconds)
  if (!positionCorrected) return false

  synchronizeSpatialState()
  resolveSupport(colliders)
  return true
}
