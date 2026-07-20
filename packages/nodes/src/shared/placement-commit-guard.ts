export type PlacementCommitPointerSample = {
  clientX: number
  clientY: number
  pointerId?: number
  timeStamp: number
}

const DEFAULT_MAX_AGE_MS = 1_000
const DEFAULT_TOLERANCE_PX = 6

export function createPlacementCommitGuard({
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  tolerancePx = DEFAULT_TOLERANCE_PX,
}: {
  maxAgeMs?: number
  tolerancePx?: number
} = {}) {
  let armed: PlacementCommitPointerSample | null = null

  return {
    arm(sample: PlacementCommitPointerSample) {
      armed = sample
    },
    clear() {
      armed = null
    },
    consume(sample: PlacementCommitPointerSample) {
      const start = armed
      armed = null
      if (!start) return false
      if (
        start.pointerId !== undefined &&
        sample.pointerId !== undefined &&
        start.pointerId !== sample.pointerId
      ) {
        return false
      }
      const ageMs = sample.timeStamp - start.timeStamp
      if (ageMs < 0 || ageMs > maxAgeMs) return false
      const deltaX = sample.clientX - start.clientX
      const deltaY = sample.clientY - start.clientY
      return deltaX * deltaX + deltaY * deltaY <= tolerancePx * tolerancePx
    },
  }
}
