export type BVHEcctrlCollisionResponseMode = 'push-back' | 'slide'

export function resolveBVHEcctrlCollisionNormalSpeed({
  averageDepth,
  deltaSeconds,
  mode,
  pushBackDamping,
  pushBackThreshold,
  restitution,
  velocityIntoSurface,
}: {
  averageDepth: number
  deltaSeconds: number
  mode: BVHEcctrlCollisionResponseMode
  pushBackDamping: number
  pushBackThreshold: number
  restitution: number
  velocityIntoSurface: number
}) {
  const absorbedSpeed =
    velocityIntoSurface < 0
      ? -velocityIntoSurface * (1 + (mode === 'push-back' ? Math.max(0, restitution) : 0))
      : 0
  const pushBackSpeed =
    mode === 'push-back' && averageDepth > pushBackThreshold
      ? (Math.max(0, pushBackDamping) / Math.max(0.001, deltaSeconds)) * averageDepth
      : 0
  return absorbedSpeed + pushBackSpeed
}
