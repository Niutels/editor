export type ClickGestureDeduperOptions = {
  followUpWindowMs?: number
  tolerancePx?: number
}

type ClickGestureSample = {
  clientX: number
  clientY: number
  pointerId?: number
  timeStamp: number
  type: string
}

const DEFAULT_FOLLOW_UP_WINDOW_MS = 1_000
const DEFAULT_TOLERANCE_PX = 2

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function readClickGestureSample(value: unknown): ClickGestureSample | null {
  let event = asRecord(value)
  if (!event) return null

  for (let depth = 0; depth < 3; depth += 1) {
    const nested = asRecord(event.nativeEvent)
    if (!nested || nested === event) break
    event = nested
  }

  const { clientX, clientY, pointerId, timeStamp, type } = event
  if (
    typeof clientX !== 'number' ||
    typeof clientY !== 'number' ||
    typeof timeStamp !== 'number' ||
    typeof type !== 'string'
  ) {
    return null
  }

  return {
    clientX,
    clientY,
    pointerId: typeof pointerId === 'number' ? pointerId : undefined,
    timeStamp,
    type,
  }
}

function samplesMatch(previous: ClickGestureSample, next: ClickGestureSample, tolerancePx: number) {
  if (
    previous.pointerId !== undefined &&
    next.pointerId !== undefined &&
    previous.pointerId !== next.pointerId
  ) {
    return false
  }
  const deltaX = next.clientX - previous.clientX
  const deltaY = next.clientY - previous.clientY
  return deltaX * deltaX + deltaY * deltaY <= tolerancePx * tolerancePx
}

/**
 * Collapses duplicate semantic clicks from one pointer gesture. R3F node
 * clicks are synthesized on `pointerup`, while the manual grid emits the
 * browser's follow-up `click`; a consumer can subscribe to both safely.
 */
export function createClickGestureDeduper({
  followUpWindowMs = DEFAULT_FOLLOW_UP_WINDOW_MS,
  tolerancePx = DEFAULT_TOLERANCE_PX,
}: ClickGestureDeduperOptions = {}) {
  let previous: ClickGestureSample | null = null

  return (event: unknown): boolean => {
    const next = readClickGestureSample(event)
    if (!next) {
      previous = null
      return true
    }

    if (previous && samplesMatch(previous, next, tolerancePx)) {
      const sameDispatch = previous.type === next.type && previous.timeStamp === next.timeStamp
      const ageMs = next.timeStamp - previous.timeStamp
      const browserClickAfterPointerUp =
        previous.type === 'pointerup' &&
        next.type === 'click' &&
        ageMs >= 0 &&
        ageMs <= followUpWindowMs

      if (sameDispatch || browserClickAfterPointerUp) {
        if (browserClickAfterPointerUp) previous = null
        return false
      }
    }

    previous = next
    return true
  }
}
