export const LANDRUSH_FRAME_PROFILE_SCOPE = 'frame-observed-work-envelope' as const

type FrameEnvelopeSlice = {
  durationMs: number
  startMs: number
}

export function calculateFrameObservedWorkEnvelopeAccounting({
  beginMs,
  nextBeginMs,
  topLevelSlices,
  workEndMs,
}: {
  beginMs: number
  nextBeginMs: number
  topLevelSlices: readonly FrameEnvelopeSlice[]
  workEndMs: number
}) {
  const intervalMs = Math.max(0, nextBeginMs - beginMs)
  const envelopeEndMs = Math.min(beginMs + intervalMs, Math.max(beginMs, workEndMs))
  const observedWorkEnvelopeMs = envelopeEndMs - beginMs
  const measuredTopLevelUnionMs = calculateIntervalUnionMs(topLevelSlices, beginMs, envelopeEndMs)
  const unmeasuredObservedWorkEnvelopeMs = Math.max(
    0,
    observedWorkEnvelopeMs - measuredTopLevelUnionMs,
  )
  const outsideObservedWorkEnvelopeMs = intervalMs - observedWorkEnvelopeMs

  return {
    intervalMs,
    measuredTopLevelUnionMs,
    observedWorkEnvelopeMs,
    outsideObservedWorkEnvelopeMs,
    unmeasuredObservedWorkEnvelopeMs,
  }
}

export function setFrameLoadProfilerActive(
  profiler: { freeze: () => void; reset: () => void },
  active: boolean,
) {
  if (active) profiler.reset()
  else profiler.freeze()
}

function calculateIntervalUnionMs(
  slices: readonly FrameEnvelopeSlice[],
  rangeStartMs: number,
  rangeEndMs: number,
) {
  const intervals = slices
    .filter((slice) => slice.durationMs > 0)
    .map(
      (slice) =>
        [
          Math.max(rangeStartMs, slice.startMs),
          Math.min(rangeEndMs, slice.startMs + slice.durationMs),
        ] as const,
    )
    .filter(([startMs, endMs]) => endMs > startMs)
    .sort((first, second) => first[0] - second[0])
  let totalMs = 0
  let currentStartMs: number | null = null
  let currentEndMs = 0

  for (const [startMs, endMs] of intervals) {
    if (currentStartMs === null) {
      currentStartMs = startMs
      currentEndMs = endMs
      continue
    }

    if (startMs <= currentEndMs) {
      currentEndMs = Math.max(currentEndMs, endMs)
      continue
    }

    totalMs += currentEndMs - currentStartMs
    currentStartMs = startMs
    currentEndMs = endMs
  }

  if (currentStartMs !== null) totalMs += currentEndMs - currentStartMs
  return totalMs
}
