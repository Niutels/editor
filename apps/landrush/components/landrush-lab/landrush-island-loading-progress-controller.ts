export const LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS = 0.984
export const LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS = 1
export const LANDRUSH_ISLAND_LOADING_RESPONSE_MS = 850
export const LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS = 800
export const LANDRUSH_ISLAND_LOADING_SPECULATIVE_RESPONSE_MS = 825
export const LANDRUSH_ISLAND_LOADING_SPECULATIVE_INTERVAL_MS = 275
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND = 3
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED = 16
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD = 0.099

const MAXIMUM_INITIAL_VELOCITY_PER_SECOND = 0.075
const MAXIMUM_PREVIEW_DURATION_MS = 120_000
const SPECULATIVE_RENEWAL_THRESHOLD_MS = MAXIMUM_PREVIEW_DURATION_MS / 2
const SPECULATIVE_RESERVOIR_HALF_LIFE_MS = 20_000
const INITIAL_SPECULATIVE_RESERVOIR_SHARE = 0.12
const SPECULATIVE_RESERVOIR_SHARE_PER_PULSE =
  1 - 2 ** (-LANDRUSH_ISLAND_LOADING_SPECULATIVE_INTERVAL_MS / SPECULATIVE_RESERVOIR_HALF_LIFE_MS)
const MAXIMUM_CLOCK_MS = Number.MAX_SAFE_INTEGER - LANDRUSH_ISLAND_LOADING_RESPONSE_MS

type ProgressPulse = Readonly<{
  amount: number
  durationMs: number
  kind: 'completion' | 'confirmed' | 'speculative'
  startedAtMs: number
}>

type InheritedMotion = Readonly<{
  holdUntilMs: number
  velocityPerSecond: number
}>

type ProgressMotion = Readonly<{
  accelerationPerSecondSquared: number
  progress: number
  velocityPerSecond: number
}>

export type LandrushIslandLoadingProgressMotionSample = ProgressMotion &
  Readonly<{
    offset: number
  }>

export type LandrushIslandLoadingProgressMotionSnapshot = Readonly<{
  accelerationPerSecondSquared: number
  baseProgress: number
  completionRequested: boolean
  completionStartedAtMs: number | null
  confirmedProgress: number
  displayedProgress: number
  elapsedMs: number
  inheritedMotion: InheritedMotion | null
  lastRequestAtMs: number
  motionRevision: number
  pulses: readonly ProgressPulse[]
  speculativeThroughMs: number | null
  stageCeiling: number
  stageDurationMs: number
  targetProgress: number
  velocityPerSecond: number
}>

export type LandrushIslandLoadingProgressMotionPreview = Readonly<{
  durationMs: number
  samples: readonly LandrushIslandLoadingProgressMotionSample[]
}>

export type LandrushIslandLoadingProgressController = Readonly<{
  cancelCompletion: () => void
  complete: (startDelayMs?: number) => LandrushIslandLoadingProgressMotionSnapshot
  createMotionPreview: (
    durationMs?: number,
    sampleIntervalMs?: number,
  ) => LandrushIslandLoadingProgressMotionPreview
  getSnapshot: () => LandrushIslandLoadingProgressMotionSnapshot
  readyToDismiss: () => boolean
  restoreMotionSnapshot: (snapshot: LandrushIslandLoadingProgressMotionSnapshot) => void
  setConfirmedProgress: (
    value: number,
    stage?: Readonly<{
      ceiling?: number
      estimatedDurationMs?: number
      startDelayMs?: number
    }>,
  ) => LandrushIslandLoadingProgressMotionSnapshot
  step: (deltaMs: number) => number
}>

export function resolveLandrushIslandLoadingProgressStage({
  estimatedDurationMs,
  evidenceProgress,
}: Readonly<{
  displayedProgress: number
  estimatedDurationMs: number
  evidenceProgress: number
}>) {
  const ceiling = Math.min(
    LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
    clamp01(evidenceProgress) + LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD,
  )
  return {
    ceiling,
    confirmedProgress: Math.min(
      LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
      clamp01(evidenceProgress),
    ),
    estimatedDurationMs: nonNegativeTime(estimatedDurationMs),
  }
}

export function createLandrushIslandLoadingProgressController(
  options: Readonly<{
    inheritedVelocityHoldMs?: number
    initialProgress?: number
    initialVelocityPerSecond?: number
  }> = {},
): LandrushIslandLoadingProgressController {
  const initialProgress = clamp01(options.initialProgress ?? 0)
  const holdUntilMs = nonNegativeTime(options.inheritedVelocityHoldMs)
  const initialVelocity = Math.max(
    0,
    Math.min(
      MAXIMUM_INITIAL_VELOCITY_PER_SECOND,
      finiteOr(options.initialVelocityPerSecond, 0),
      Math.max(0, LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS - initialProgress) /
        (holdUntilMs / 1_000 + LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 4_500),
    ),
  )
  let inheritedMotion: InheritedMotion | null =
    initialVelocity > 0 ? { holdUntilMs, velocityPerSecond: initialVelocity } : null
  let baseProgress = initialProgress
  let targetProgress = Math.min(1, initialProgress + inheritedAdvance(inheritedMotion))
  let elapsedMs = 0
  let lastRequestAtMs = holdUntilMs
  let pulses: ProgressPulse[] = []
  let completionRequested = false
  let completionStartedAtMs: number | null = null
  let confirmedProgress = 0
  let motionRevision = 0
  let speculativeThroughMs: number | null = null
  let stageCeiling = initialProgress
  let stageDurationMs = 0

  const sample = (timeMs: number) => {
    const current = samplePlan(pulses, inheritedMotion, timeMs)
    const settled =
      (!inheritedMotion || timeMs >= inheritedEnd(inheritedMotion)) &&
      pulses.every((pulse) => timeMs >= pulse.startedAtMs + pulse.durationMs)
    return {
      ...current,
      progress: settled ? targetProgress : clamp01(baseProgress + current.progress),
    }
  }

  const getSnapshot = (): LandrushIslandLoadingProgressMotionSnapshot => {
    const current = sample(elapsedMs)
    return {
      accelerationPerSecondSquared: current.accelerationPerSecondSquared,
      baseProgress,
      completionRequested,
      completionStartedAtMs,
      confirmedProgress,
      displayedProgress: current.progress,
      elapsedMs,
      inheritedMotion: inheritedMotion ? { ...inheritedMotion } : null,
      lastRequestAtMs,
      motionRevision,
      pulses: [...pulses],
      speculativeThroughMs,
      stageCeiling,
      stageDurationMs,
      targetProgress,
      velocityPerSecond: current.velocityPerSecond,
    }
  }

  const recordRequest = (startDelayMs: number | undefined) => {
    // A stale document clock cannot move a later wall-clock observation before an earlier one.
    lastRequestAtMs = Math.min(
      MAXIMUM_CLOCK_MS,
      Math.max(lastRequestAtMs, elapsedMs + nonNegativeTime(startDelayMs)),
    )
    return lastRequestAtMs
  }

  const appendPulse = (
    amount: number,
    durationMs: number,
    kind: ProgressPulse['kind'],
    startedAtMs: number,
  ) => {
    if (!(amount > 0)) return false
    const matching = pulses.findIndex(
      (pulse) =>
        pulse.startedAtMs === startedAtMs && pulse.durationMs === durationMs && pulse.kind === kind,
    )
    if (matching >= 0) {
      const existing = pulses[matching]!
      pulses[matching] = { ...existing, amount: existing.amount + amount }
    } else {
      pulses.push({ amount, durationMs, kind, startedAtMs })
    }
    targetProgress = clamp01(targetProgress + amount)
    return true
  }

  const discardFutureSpeculation = (timeMs: number) => {
    let changed = false
    pulses = pulses.filter((pulse) => {
      // Unstarted pulses have zero p/v/a; only these can be removed without rewriting history.
      if (pulse.kind !== 'speculative' || pulse.startedAtMs < timeMs) return true
      changed = true
      return false
    })
    targetProgress = clamp01(
      baseProgress +
        inheritedAdvance(inheritedMotion) +
        pulses.reduce((total, pulse) => total + pulse.amount, 0),
    )
    speculativeThroughMs = pulses.reduce<number | null>(
      (throughMs, pulse) =>
        pulse.kind === 'speculative'
          ? Math.max(throughMs ?? 0, pulse.startedAtMs + pulse.durationMs)
          : throughMs,
      null,
    )
    return changed
  }

  const extendSpeculativeMotion = (requestedAtMs: number, restarted: boolean) => {
    if (restarted) speculativeThroughMs = null
    if (completionRequested || !(stageCeiling > targetProgress)) return false
    if (
      speculativeThroughMs !== null &&
      speculativeThroughMs - requestedAtMs >= SPECULATIVE_RENEWAL_THRESHOLD_MS
    ) {
      return false
    }
    const horizonMs = Math.min(MAXIMUM_CLOCK_MS, requestedAtMs + MAXIMUM_PREVIEW_DURATION_MS)
    let startedAtMs = Math.max(
      requestedAtMs,
      speculativeThroughMs === null
        ? requestedAtMs
        : speculativeThroughMs +
            LANDRUSH_ISLAND_LOADING_SPECULATIVE_INTERVAL_MS -
            LANDRUSH_ISLAND_LOADING_SPECULATIVE_RESPONSE_MS,
    )
    let changed = false
    let lastStartedAtMs: number | null = null
    while (startedAtMs < horizonMs) {
      const remaining = Math.max(0, stageCeiling - targetProgress)
      const share =
        restarted && !changed
          ? INITIAL_SPECULATIVE_RESERVOIR_SHARE
          : SPECULATIVE_RESERVOIR_SHARE_PER_PULSE
      const amount = remaining * share
      if (!(amount > 0) || targetProgress + amount === targetProgress) break
      appendPulse(
        amount,
        LANDRUSH_ISLAND_LOADING_SPECULATIVE_RESPONSE_MS,
        'speculative',
        startedAtMs,
      )
      changed = true
      lastStartedAtMs = startedAtMs
      startedAtMs += LANDRUSH_ISLAND_LOADING_SPECULATIVE_INTERVAL_MS
    }
    if (lastStartedAtMs !== null) {
      speculativeThroughMs = lastStartedAtMs + LANDRUSH_ISLAND_LOADING_SPECULATIVE_RESPONSE_MS
    }
    return changed
  }

  return {
    cancelCompletion() {
      completionRequested = false
      completionStartedAtMs = null
    },
    complete(startDelayMs = 0) {
      if (completionRequested) return getSnapshot()
      completionStartedAtMs = recordRequest(startDelayMs)
      completionRequested = true
      confirmedProgress = 1
      stageCeiling = 1
      let changed = discardFutureSpeculation(completionStartedAtMs)
      changed =
        appendPulse(
          Math.max(0, 1 - targetProgress),
          LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
          'completion',
          completionStartedAtMs,
        ) || changed
      if (changed) motionRevision += 1
      return getSnapshot()
    },
    createMotionPreview(durationMs = MAXIMUM_PREVIEW_DURATION_MS, sampleIntervalMs) {
      const boundedDurationMs = Math.max(
        1,
        Math.min(MAXIMUM_PREVIEW_DURATION_MS, finiteOr(durationMs, MAXIMUM_PREVIEW_DURATION_MS)),
      )
      const offsets = new Set([0, boundedDurationMs])
      for (const knot of collectMotionKnots(pulses, inheritedMotion, elapsedMs)) {
        const offsetMs = knot - elapsedMs
        if (offsetMs > 0 && offsetMs < boundedDurationMs) offsets.add(offsetMs)
      }
      if (sampleIntervalMs !== undefined && Number.isFinite(sampleIntervalMs)) {
        const interval = Math.max(1, sampleIntervalMs)
        for (let offsetMs = interval; offsetMs < boundedDurationMs; offsetMs += interval) {
          offsets.add(offsetMs)
        }
      }
      return {
        durationMs: boundedDurationMs,
        samples: [...offsets]
          .sort((left, right) => left - right)
          .map((offsetMs) => ({
            ...sample(elapsedMs + offsetMs),
            offset: offsetMs / boundedDurationMs,
          })),
      }
    },
    getSnapshot,
    readyToDismiss() {
      return (
        completionRequested &&
        completionStartedAtMs !== null &&
        elapsedMs >= completionStartedAtMs &&
        sample(elapsedMs).progress === 1
      )
    },
    restoreMotionSnapshot(snapshot) {
      baseProgress = snapshot.baseProgress
      targetProgress = snapshot.targetProgress
      elapsedMs = snapshot.elapsedMs
      inheritedMotion = snapshot.inheritedMotion ? { ...snapshot.inheritedMotion } : null
      lastRequestAtMs = snapshot.lastRequestAtMs
      motionRevision = snapshot.motionRevision
      pulses = [...snapshot.pulses]
      speculativeThroughMs = snapshot.speculativeThroughMs
      completionRequested = snapshot.completionRequested
      completionStartedAtMs = snapshot.completionStartedAtMs
      confirmedProgress = snapshot.confirmedProgress
      stageCeiling = snapshot.stageCeiling
      stageDurationMs = snapshot.stageDurationMs
    },
    setConfirmedProgress(value, stage = {}) {
      const nextConfirmedProgress = Math.max(
        confirmedProgress,
        Math.min(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS, clamp01(value)),
      )
      const nextStageCeiling = Math.max(
        nextConfirmedProgress,
        Math.min(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS, clamp01(stage.ceiling ?? value)),
      )
      stageDurationMs = nonNegativeTime(stage.estimatedDurationMs)
      const requestedAtMs = recordRequest(stage.startDelayMs)
      const stageChanged =
        nextConfirmedProgress !== confirmedProgress || nextStageCeiling !== stageCeiling
      confirmedProgress = nextConfirmedProgress
      stageCeiling = nextStageCeiling
      let changed = stageChanged ? discardFutureSpeculation(requestedAtMs) : false
      changed =
        appendPulse(
          Math.max(0, confirmedProgress - targetProgress),
          LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS,
          'confirmed',
          requestedAtMs,
        ) || changed
      changed = extendSpeculativeMotion(requestedAtMs, stageChanged) || changed
      if (changed) motionRevision += 1
      return getSnapshot()
    },
    step(deltaMs) {
      elapsedMs = Math.min(MAXIMUM_CLOCK_MS, elapsedMs + nonNegativeTime(deltaMs))
      const pending: ProgressPulse[] = []
      for (const pulse of pulses) {
        if (elapsedMs >= pulse.startedAtMs + pulse.durationMs) baseProgress += pulse.amount
        else pending.push(pulse)
      }
      pulses = pending
      if (inheritedMotion && elapsedMs >= inheritedEnd(inheritedMotion)) {
        baseProgress += inheritedAdvance(inheritedMotion)
        inheritedMotion = null
      }
      if (pulses.length === 0 && !inheritedMotion) baseProgress = targetProgress
      return sample(elapsedMs).progress
    },
  }
}

function collectMotionKnots(
  pulses: readonly ProgressPulse[],
  inherited: InheritedMotion | null,
  fromMs: number,
) {
  const knots = new Set([fromMs])
  for (const pulse of pulses) {
    for (let knot = 0; knot <= 3; knot += 1) {
      const timeMs = pulse.startedAtMs + (knot * pulse.durationMs) / 3
      if (timeMs > fromMs) knots.add(timeMs)
    }
  }
  if (inherited) {
    for (const offset of [
      0,
      LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 6,
      LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 2,
    ]) {
      const timeMs = inherited.holdUntilMs + offset
      if (timeMs > fromMs) knots.add(timeMs)
    }
  }
  return knots
}

function samplePlan(
  pulses: readonly ProgressPulse[],
  inherited: InheritedMotion | null,
  timeMs: number,
): ProgressMotion {
  const initial = sampleInherited(inherited, timeMs)
  let progress = initial.progress
  let velocityPerSecond = initial.velocityPerSecond
  let accelerationPerSecondSquared = initial.accelerationPerSecondSquared
  for (const pulse of pulses) {
    const current = samplePulse(pulse, timeMs)
    progress += current.progress
    velocityPerSecond += current.velocityPerSecond
    accelerationPerSecondSquared += current.accelerationPerSecondSquared
  }
  return { accelerationPerSecondSquared, progress, velocityPerSecond }
}

function samplePulse(pulse: ProgressPulse, timeMs: number): ProgressMotion {
  const response = resolvePulseResponse(((timeMs - pulse.startedAtMs) * 3) / pulse.durationMs)
  const knotSeconds = pulse.durationMs / 3_000
  return {
    accelerationPerSecondSquared: (pulse.amount * response.acceleration) / knotSeconds ** 2,
    progress: pulse.amount * response.progress,
    velocityPerSecond: (pulse.amount * response.velocity) / knotSeconds,
  }
}

function sampleInherited(motion: InheritedMotion | null, timeMs: number): ProgressMotion {
  if (!motion) return { accelerationPerSecondSquared: 0, progress: 0, velocityPerSecond: 0 }
  if (timeMs <= motion.holdUntilMs) {
    return {
      accelerationPerSecondSquared: 0,
      progress: (motion.velocityPerSecond * Math.max(0, timeMs)) / 1_000,
      velocityPerSecond: motion.velocityPerSecond,
    }
  }
  const amount = (motion.velocityPerSecond * (LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 1_000)) / 2.25
  const tail = samplePulse(
    {
      amount,
      durationMs: LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
      kind: 'confirmed',
      startedAtMs: motion.holdUntilMs - LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 2,
    },
    timeMs,
  )
  return {
    ...tail,
    progress: (motion.velocityPerSecond * motion.holdUntilMs) / 1_000 + tail.progress - amount / 2,
  }
}

function inheritedAdvance(motion: InheritedMotion | null) {
  return motion
    ? motion.velocityPerSecond *
        (motion.holdUntilMs / 1_000 + LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 4_500)
    : 0
}

function inheritedEnd(motion: InheritedMotion) {
  return motion.holdUntilMs + LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 2
}

function resolvePulseResponse(position: number) {
  if (position <= 0) return { acceleration: 0, progress: 0, velocity: 0 }
  if (position >= 3) return { acceleration: 0, progress: 1, velocity: 0 }
  if (position < 1) {
    return { acceleration: position, progress: position ** 3 / 6, velocity: position ** 2 / 2 }
  }
  if (position > 2) {
    const remaining = 3 - position
    return {
      acceleration: -remaining,
      progress: 1 - remaining ** 3 / 6,
      velocity: remaining ** 2 / 2,
    }
  }
  return {
    acceleration: position - 3 * (position - 1),
    progress: (position ** 3 - 3 * (position - 1) ** 3) / 6,
    velocity: (position ** 2 - 3 * (position - 1) ** 2) / 2,
  }
}

function nonNegativeTime(value: number | undefined) {
  return Math.min(MAXIMUM_CLOCK_MS, Math.max(0, finiteOr(value, 0)))
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? (value as number) : fallback
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, finiteOr(value, 0)))
}
