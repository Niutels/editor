export const LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS = 0.984
export const LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS = 1
export const LANDRUSH_ISLAND_LOADING_RESPONSE_MS = 850
export const LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS = 250
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND = 3
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED = 16
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD = 0.099

const MAXIMUM_INITIAL_VELOCITY_PER_SECOND = 0.075
const MAXIMUM_PREVIEW_DURATION_MS = 120_000
const RESPONSE_SEARCH_STEP_MS = 5
const MAXIMUM_CLOCK_MS = Number.MAX_SAFE_INTEGER - LANDRUSH_ISLAND_LOADING_RESPONSE_MS
const BOUND_TOLERANCE = 1e-10

type ProgressPulse = Readonly<{
  amount: number
  durationMs: number
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
  pulses: readonly ProgressPulse[]
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
  displayedProgress,
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
      Math.max(clamp01(displayedProgress), ceiling),
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
  let confirmedProgress = initialProgress
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
      pulses: [...pulses],
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

  const raiseTarget = (value: number, startedAtMs: number, terminal: boolean) => {
    const nextTarget = Math.max(targetProgress, clamp01(value))
    if (nextTarget <= targetProgress) return
    const amount = nextTarget - targetProgress
    let durationMs = LANDRUSH_ISLAND_LOADING_RESPONSE_MS
    if (!terminal) {
      durationMs = LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS
      while (
        durationMs <= LANDRUSH_ISLAND_LOADING_RESPONSE_MS &&
        !admitsCompletionReserve(
          [...pulses, { amount, durationMs, startedAtMs }],
          inheritedMotion,
          startedAtMs,
          1 - nextTarget,
        )
      ) {
        durationMs += RESPONSE_SEARCH_STEP_MS
      }
      if (durationMs > LANDRUSH_ISLAND_LOADING_RESPONSE_MS) {
        throw new RangeError('Landrush loading motion has no admissible completion reserve.')
      }
    }
    const matching = pulses.findIndex(
      (pulse) => pulse.startedAtMs === startedAtMs && pulse.durationMs === durationMs,
    )
    if (matching >= 0) {
      const existing = pulses[matching]!
      pulses[matching] = { ...existing, amount: existing.amount + amount }
    } else {
      pulses.push({ amount, durationMs, startedAtMs })
    }
    targetProgress = nextTarget
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
      raiseTarget(1, completionStartedAtMs, true)
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
      pulses = [...snapshot.pulses]
      completionRequested = snapshot.completionRequested
      completionStartedAtMs = snapshot.completionStartedAtMs
      confirmedProgress = snapshot.confirmedProgress
      stageCeiling = snapshot.stageCeiling
      stageDurationMs = snapshot.stageDurationMs
    },
    setConfirmedProgress(value, stage = {}) {
      confirmedProgress = Math.max(
        confirmedProgress,
        Math.min(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS, clamp01(value)),
      )
      stageCeiling = Math.max(
        confirmedProgress,
        Math.min(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS, clamp01(stage.ceiling ?? value)),
      )
      stageDurationMs = nonNegativeTime(stage.estimatedDurationMs)
      raiseTarget(confirmedProgress, recordRequest(stage.startDelayMs), false)
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

function admitsCompletionReserve(
  pulses: readonly ProgressPulse[],
  inherited: InheritedMotion | null,
  requestedAtMs: number,
  remainingAmount: number,
) {
  const durationMs = LANDRUSH_ISLAND_LOADING_RESPONSE_MS
  const knots = new Set(collectMotionKnots(pulses, inherited, requestedAtMs))
  for (const offset of [durationMs / 3, durationMs / 2, (durationMs * 2) / 3, durationMs]) {
    knots.add(requestedAtMs + offset)
  }
  const unit: ProgressPulse = { amount: remainingAmount, durationMs, startedAtMs: 0 }
  const states = [...knots]
    .sort((left, right) => left - right)
    .map((timeMs) => {
      const plan = samplePlan(pulses, inherited, timeMs)
      const ageMs = timeMs - requestedAtMs
      // Any later completion has an age in [0, ageMs]; reserve its reachable derivative extrema.
      const velocityReserve = samplePulse(unit, Math.min(ageMs, durationMs / 2))
      const upperAcceleration = samplePulse(unit, Math.min(ageMs, durationMs / 3))
      const lowerAcceleration = samplePulse(unit, Math.min(ageMs, (durationMs * 2) / 3))
      return {
        accelerationLower:
          plan.accelerationPerSecondSquared +
          Math.min(0, lowerAcceleration.accelerationPerSecondSquared),
        accelerationUpper:
          plan.accelerationPerSecondSquared + upperAcceleration.accelerationPerSecondSquared,
        timeMs,
        velocityDerivative:
          plan.accelerationPerSecondSquared +
          (ageMs < durationMs / 2 ? velocityReserve.accelerationPerSecondSquared : 0),
        velocityUpper: plan.velocityPerSecond + velocityReserve.velocityPerSecond,
      }
    })
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]!
    if (
      state.velocityUpper >
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + BOUND_TOLERANCE ||
      state.accelerationUpper >
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED +
          BOUND_TOLERANCE ||
      state.accelerationLower <
        -LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED - BOUND_TOLERANCE
    )
      return false
    const previous = states[index - 1]
    if (!previous) continue
    const derivativeDelta = state.velocityDerivative - previous.velocityDerivative
    if (derivativeDelta === 0) continue
    const fraction = -previous.velocityDerivative / derivativeDelta
    if (!(fraction > 0 && fraction < 1)) continue
    const intervalSeconds = (state.timeMs - previous.timeMs) / 1_000
    const seconds = fraction * intervalSeconds
    const velocity =
      previous.velocityUpper +
      previous.velocityDerivative * seconds +
      ((derivativeDelta / intervalSeconds) * seconds ** 2) / 2
    if (velocity > LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + BOUND_TOLERANCE) {
      return false
    }
  }
  return true
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
