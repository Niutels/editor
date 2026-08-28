export const LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS = 0.984
export const LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS = 1
export const LANDRUSH_ISLAND_LOADING_RESPONSE_MS = 800
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND = 3
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED = 16
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD = 0.08

const MAXIMUM_INITIAL_VELOCITY_PER_SECOND = 0.075
const MAXIMUM_PREVIEW_DURATION_MS = 120_000

type ProgressPulse = Readonly<{
  amount: number
  startedAtMs: number
}>

export type LandrushIslandLoadingProgressMotionSample = Readonly<{
  accelerationPerSecondSquared: number
  offset: number
  progress: number
  velocityPerSecond: number
}>

export type LandrushIslandLoadingProgressMotionSnapshot = Readonly<{
  accelerationPerSecondSquared: number
  baseProgress: number
  completionRequested: boolean
  confirmedProgress: number
  displayedProgress: number
  elapsedMs: number
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
  complete: () => LandrushIslandLoadingProgressMotionSnapshot
  createMotionPreview: (
    durationMs?: number,
    sampleIntervalMs?: number,
  ) => LandrushIslandLoadingProgressMotionPreview
  getSnapshot: () => LandrushIslandLoadingProgressMotionSnapshot
  readyToDismiss: () => boolean
  restoreMotionSnapshot: (snapshot: LandrushIslandLoadingProgressMotionSnapshot) => void
  setConfirmedProgress: (
    value: number,
    stage?: Readonly<{ ceiling?: number; estimatedDurationMs?: number }>,
  ) => LandrushIslandLoadingProgressMotionSnapshot
  step: (deltaMs: number) => number
}>

export function resolveLandrushIslandLoadingProgressStage({
  displayedProgress,
  estimatedDurationMs,
  evidenceProgress,
  forecastProgress,
}: Readonly<{
  displayedProgress: number
  estimatedDurationMs: number
  evidenceProgress: number
  forecastProgress: number
}>) {
  const evidence = clamp01(evidenceProgress)
  const ceiling = Math.min(
    LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
    evidence + LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD,
  )
  return {
    ceiling,
    confirmedProgress: Math.min(
      LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
      Math.max(clamp01(displayedProgress), evidence, Math.min(ceiling, clamp01(forecastProgress))),
    ),
    estimatedDurationMs: Math.max(0, finiteOr(estimatedDurationMs, 0)),
  }
}

export function createLandrushIslandLoadingProgressController(
  options: Readonly<{ initialProgress?: number; initialVelocityPerSecond?: number }> = {},
): LandrushIslandLoadingProgressController {
  const initialProgress = clamp01(options.initialProgress ?? 0)
  const initialVelocity = Math.max(
    0,
    Math.min(
      MAXIMUM_INITIAL_VELOCITY_PER_SECOND,
      finiteOr(options.initialVelocityPerSecond, 0),
      (Math.max(0, LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS - initialProgress) * 4.5) /
        (LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 1_000),
    ),
  )
  // A half-completed pulse inherits the shell's position, velocity and zero acceleration exactly.
  const inheritedAmount = (initialVelocity * (LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 1_000)) / 2.25
  let baseProgress = initialProgress - inheritedAmount / 2
  let targetProgress = initialProgress + inheritedAmount / 2
  let elapsedMs = 0
  let pulses: ProgressPulse[] =
    inheritedAmount > 0
      ? [{ amount: inheritedAmount, startedAtMs: -LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 2 }]
      : []
  let completionRequested = false
  let confirmedProgress = initialProgress
  let stageCeiling = initialProgress
  let stageDurationMs = 0

  const sample = (timeMs: number) => {
    let progress = baseProgress
    let velocityPerSecond = 0
    let accelerationPerSecondSquared = 0
    const knotSeconds = LANDRUSH_ISLAND_LOADING_RESPONSE_MS / 3_000
    for (const pulse of pulses) {
      const position = ((timeMs - pulse.startedAtMs) * 3) / LANDRUSH_ISLAND_LOADING_RESPONSE_MS
      const response = resolvePulseResponse(position)
      progress += pulse.amount * response.progress
      velocityPerSecond += (pulse.amount * response.velocity) / knotSeconds
      accelerationPerSecondSquared += (pulse.amount * response.acceleration) / knotSeconds ** 2
    }
    const settled = pulses.every(
      (pulse) => timeMs >= pulse.startedAtMs + LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
    )
    return {
      accelerationPerSecondSquared,
      progress: settled ? targetProgress : clamp01(progress),
      velocityPerSecond,
    }
  }

  const getSnapshot = (): LandrushIslandLoadingProgressMotionSnapshot => {
    const current = sample(elapsedMs)
    return {
      accelerationPerSecondSquared: current.accelerationPerSecondSquared,
      baseProgress,
      completionRequested,
      confirmedProgress,
      displayedProgress: current.progress,
      elapsedMs,
      pulses: [...pulses],
      stageCeiling,
      stageDurationMs,
      targetProgress,
      velocityPerSecond: current.velocityPerSecond,
    }
  }

  const raiseTarget = (value: number) => {
    const nextTarget = Math.max(targetProgress, clamp01(value))
    if (nextTarget > targetProgress) {
      const amount = nextTarget - targetProgress
      const last = pulses.at(-1)
      if (last?.startedAtMs === elapsedMs) {
        pulses[pulses.length - 1] = { amount: last.amount + amount, startedAtMs: elapsedMs }
      } else {
        pulses.push({ amount, startedAtMs: elapsedMs })
      }
      targetProgress = nextTarget
    }
  }

  return {
    cancelCompletion() {
      completionRequested = false
    },
    complete() {
      completionRequested = true
      confirmedProgress = 1
      stageCeiling = 1
      raiseTarget(1)
      return getSnapshot()
    },
    createMotionPreview(durationMs = MAXIMUM_PREVIEW_DURATION_MS, sampleIntervalMs) {
      const boundedDurationMs = Math.max(
        1,
        Math.min(MAXIMUM_PREVIEW_DURATION_MS, finiteOr(durationMs, MAXIMUM_PREVIEW_DURATION_MS)),
      )
      const offsets = new Set([0, boundedDurationMs])
      for (const pulse of pulses) {
        for (let knot = 0; knot <= 3; knot += 1) {
          const offsetMs =
            pulse.startedAtMs + (knot * LANDRUSH_ISLAND_LOADING_RESPONSE_MS) / 3 - elapsedMs
          if (offsetMs > 0 && offsetMs < boundedDurationMs) offsets.add(offsetMs)
        }
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
      return completionRequested && sample(elapsedMs).progress === 1
    },
    restoreMotionSnapshot(snapshot) {
      baseProgress = snapshot.baseProgress
      targetProgress = snapshot.targetProgress
      elapsedMs = snapshot.elapsedMs
      pulses = [...snapshot.pulses]
      completionRequested = snapshot.completionRequested
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
      stageDurationMs = Math.max(0, finiteOr(stage.estimatedDurationMs, 0))
      raiseTarget(confirmedProgress)
      return getSnapshot()
    },
    step(deltaMs) {
      elapsedMs += Math.max(0, finiteOr(deltaMs, 0))
      const pending: ProgressPulse[] = []
      for (const pulse of pulses) {
        if (elapsedMs >= pulse.startedAtMs + LANDRUSH_ISLAND_LOADING_RESPONSE_MS) {
          baseProgress += pulse.amount
        } else {
          pending.push(pulse)
        }
      }
      pulses = pending
      if (pulses.length === 0) baseProgress = targetProgress
      return sample(elapsedMs).progress
    },
  }
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

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? (value as number) : fallback
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, finiteOr(value, 0)))
}
