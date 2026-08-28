export const LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS = 0.984
export const LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS = 0.999
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND = 0.075

const DEFAULT_STAGE_DURATION_MS = 1_600
const MINIMUM_STAGE_DURATION_MS = 250
const MAXIMUM_INTEGRATION_STEP_MS = 20
const MAXIMUM_ELAPSED_STEP_MS = 30_000
const CONFIRMED_RESPONSE_HORIZON_MS = 500
const MINIMUM_FORWARD_RATE_PER_SECOND = 0.001
const MAXIMUM_SPECULATIVE_RATE_PER_SECOND = 0.035
const MAXIMUM_CONFIRMED_RATE_PER_SECOND = 0.18
const MINIMUM_SPECULATIVE_RUNWAY = 0.005
const SPECULATIVE_RUNWAY_REFRESH_THRESHOLD = 0.0005
const MINIMUM_UNCERTAIN_STAGE_DURATION_MS = 10_000
const VELOCITY_ERROR_RESPONSE_PER_SECOND = 4.2
const MAXIMUM_FORWARD_ACCELERATION_PER_SECOND_SQUARED = 0.22
const MAXIMUM_FORWARD_DECELERATION_PER_SECOND_SQUARED = 0.28
const MAXIMUM_ACCELERATION_JERK_PER_SECOND_CUBED = 1.1
const MAXIMUM_COMPLETION_ACCELERATION_PER_SECOND_SQUARED = 0.06
const MAXIMUM_COMPLETION_DECELERATION_PER_SECOND_SQUARED = 0.08
const MAXIMUM_COMPLETION_ACCELERATION_JERK_PER_SECOND_CUBED = 0.12
const STOPPING_SPEED_SAFETY_FACTOR = 0.72
const DEFAULT_PREVIEW_SAMPLE_INTERVAL_MS = 1_000 / 60
const MAXIMUM_PREVIEW_DURATION_MS = 120_000

export type LandrushIslandLoadingProgressMotionSnapshot = Readonly<{
  accelerationPerSecondSquared: number
  completionRequested: boolean
  confirmedProgress: number
  displayedProgress: number
  stageCeiling: number
  stageDurationMs: number
  targetVelocityPerSecond: number
  velocityPerSecond: number
}>

export type LandrushIslandLoadingProgressMotionPreview = Readonly<{
  durationMs: number
  samples: readonly Readonly<{ offset: number; progress: number }>[]
}>

export type LandrushIslandLoadingProgressController = Readonly<{
  adoptRenderedProgress: (value: number) => LandrushIslandLoadingProgressMotionSnapshot
  complete: () => LandrushIslandLoadingProgressMotionSnapshot
  createMotionPreview: (
    durationMs?: number,
    sampleIntervalMs?: number,
  ) => LandrushIslandLoadingProgressMotionPreview
  getSnapshot: () => LandrushIslandLoadingProgressMotionSnapshot
  readyToDismiss: () => boolean
  reconcileDisplayedProgress: (value: number) => LandrushIslandLoadingProgressMotionSnapshot
  restoreMotionSnapshot: (
    snapshot: LandrushIslandLoadingProgressMotionSnapshot,
  ) => LandrushIslandLoadingProgressMotionSnapshot
  snapToComplete: () => LandrushIslandLoadingProgressMotionSnapshot
  synchronizeRenderedProgress: (
    value: number,
    velocityPerSecond: number,
  ) => LandrushIslandLoadingProgressMotionSnapshot
  setConfirmedProgress: (
    value: number,
    stage?: Readonly<{ ceiling?: number; estimatedDurationMs?: number }>,
  ) => LandrushIslandLoadingProgressMotionSnapshot
  step: (deltaMs: number) => number
}>

type MutableMotionState = {
  accelerationPerSecondSquared: number
  completionRequested: boolean
  confirmedProgress: number
  displayedProgress: number
  stageCeiling: number
  stageDurationMs: number
  targetVelocityPerSecond: number
  velocityPerSecond: number
}

export function resolveLandrushIslandLoadingProgressStage({
  displayedProgress,
  estimatedDurationMs,
}: Readonly<{
  displayedProgress: number
  estimatedDurationMs: number
  evidenceProgress: number
  forecastProgress: number
}>) {
  const displayed = clampProgress(displayedProgress, 0)
  return {
    ceiling: LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
    confirmedProgress: displayed,
    estimatedDurationMs: Math.max(
      MINIMUM_UNCERTAIN_STAGE_DURATION_MS,
      resolveStageDuration(estimatedDurationMs),
    ),
  }
}

export function createLandrushIslandLoadingProgressController(
  options: Readonly<{ initialProgress?: number; initialVelocityPerSecond?: number }> = {},
): LandrushIslandLoadingProgressController {
  const initialProgress = clampProgress(options.initialProgress, 0)
  const initialVelocity = Math.max(
    MINIMUM_FORWARD_RATE_PER_SECOND,
    Math.min(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
      finiteOr(options.initialVelocityPerSecond, MINIMUM_FORWARD_RATE_PER_SECOND),
    ),
  )
  const state: MutableMotionState = {
    accelerationPerSecondSquared: 0,
    completionRequested: false,
    confirmedProgress: initialProgress,
    displayedProgress: initialProgress,
    stageCeiling: initialProgress,
    stageDurationMs: DEFAULT_STAGE_DURATION_MS,
    targetVelocityPerSecond: initialVelocity,
    velocityPerSecond: initialVelocity,
  }

  const getSnapshot = () => cloneMotionState(state)

  return {
    adoptRenderedProgress(value) {
      state.displayedProgress = Math.max(
        state.displayedProgress,
        clampProgress(value, state.displayedProgress),
      )
      state.stageCeiling = Math.max(state.stageCeiling, state.displayedProgress)
      return getSnapshot()
    },
    complete() {
      state.confirmedProgress = 1
      state.stageCeiling = 1
      state.completionRequested = true
      return getSnapshot()
    },
    createMotionPreview(
      durationMs = MAXIMUM_ELAPSED_STEP_MS,
      sampleIntervalMs = DEFAULT_PREVIEW_SAMPLE_INTERVAL_MS,
    ) {
      const previewState = cloneMotionState(state)
      const boundedDurationMs = Math.max(
        1,
        Math.min(MAXIMUM_PREVIEW_DURATION_MS, finiteOr(durationMs, MAXIMUM_ELAPSED_STEP_MS)),
      )
      const boundedSampleIntervalMs = Math.max(
        16,
        finiteOr(sampleIntervalMs, DEFAULT_PREVIEW_SAMPLE_INTERVAL_MS),
      )
      const samples: Array<{ offset: number; progress: number }> = [
        { offset: 0, progress: previewState.displayedProgress },
      ]
      let elapsedMs = 0
      while (elapsedMs < boundedDurationMs) {
        const nextSampleMs = Math.min(boundedDurationMs, elapsedMs + boundedSampleIntervalMs)
        advanceMotionState(previewState, nextSampleMs - elapsedMs)
        elapsedMs = nextSampleMs
        samples.push({
          offset: elapsedMs / boundedDurationMs,
          progress: previewState.displayedProgress,
        })
      }
      return { durationMs: boundedDurationMs, samples }
    },
    getSnapshot,
    readyToDismiss() {
      return (
        state.completionRequested &&
        state.displayedProgress >= LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS
      )
    },
    reconcileDisplayedProgress(value) {
      state.displayedProgress = Math.max(
        state.displayedProgress,
        clampProgress(value, state.displayedProgress),
      )
      state.stageCeiling = Math.max(state.stageCeiling, state.displayedProgress)
      return getSnapshot()
    },
    restoreMotionSnapshot(snapshot) {
      state.accelerationPerSecondSquared = Math.min(
        MAXIMUM_FORWARD_ACCELERATION_PER_SECOND_SQUARED,
        Math.max(
          -MAXIMUM_FORWARD_DECELERATION_PER_SECOND_SQUARED,
          finiteOr(snapshot.accelerationPerSecondSquared, 0),
        ),
      )
      state.completionRequested = snapshot.completionRequested === true
      state.confirmedProgress = clampProgress(snapshot.confirmedProgress, 0)
      state.displayedProgress = clampProgress(snapshot.displayedProgress, 0)
      state.stageCeiling = Math.max(
        state.displayedProgress,
        clampProgress(snapshot.stageCeiling, state.displayedProgress),
      )
      state.stageDurationMs = resolveStageDuration(snapshot.stageDurationMs)
      state.targetVelocityPerSecond = Math.min(
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
        Math.max(0, finiteOr(snapshot.targetVelocityPerSecond, 0)),
      )
      state.velocityPerSecond = Math.min(
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
        Math.max(0, finiteOr(snapshot.velocityPerSecond, 0)),
      )
      return getSnapshot()
    },
    snapToComplete() {
      state.confirmedProgress = 1
      state.displayedProgress = 1
      state.stageCeiling = 1
      state.velocityPerSecond = 0
      state.accelerationPerSecondSquared = 0
      state.targetVelocityPerSecond = 0
      state.completionRequested = true
      return getSnapshot()
    },
    synchronizeRenderedProgress(value, velocityPerSecond) {
      const renderedProgress = clampProgress(value, state.displayedProgress)
      const renderedVelocity = Math.min(
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
        Math.max(0, finiteOr(velocityPerSecond, state.velocityPerSecond)),
      )
      state.displayedProgress = renderedProgress
      state.stageCeiling = Math.max(state.stageCeiling, renderedProgress)
      state.velocityPerSecond = renderedVelocity
      state.targetVelocityPerSecond = renderedVelocity
      state.accelerationPerSecondSquared = 0
      return getSnapshot()
    },
    setConfirmedProgress(value, stage = {}) {
      state.confirmedProgress = Math.max(
        state.confirmedProgress,
        clampProgress(value, state.confirmedProgress),
      )
      const maximumCeiling =
        state.confirmedProgress >= 1 ? 1 : LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS
      const requestedCeiling = clampProgress(stage.ceiling, state.confirmedProgress)
      state.stageCeiling = Math.max(
        state.confirmedProgress,
        Math.min(maximumCeiling, requestedCeiling),
        Math.min(maximumCeiling, state.displayedProgress + MINIMUM_SPECULATIVE_RUNWAY),
      )
      state.stageDurationMs = resolveStageDuration(stage.estimatedDurationMs)
      return getSnapshot()
    },
    step(deltaMs) {
      return advanceMotionState(state, deltaMs)
    },
  }
}

function advanceMotionState(state: MutableMotionState, deltaMs: number) {
  let remainingMs = Math.min(MAXIMUM_ELAPSED_STEP_MS, Math.max(0, finiteOr(deltaMs, 0)))
  while (remainingMs > 0 && state.displayedProgress < 1) {
    const integrationStepMs = Math.min(MAXIMUM_INTEGRATION_STEP_MS, remainingMs)
    const deltaSeconds = integrationStepMs / 1_000
    if (
      !state.completionRequested &&
      state.stageCeiling < LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS &&
      state.stageCeiling - state.displayedProgress <= SPECULATIVE_RUNWAY_REFRESH_THRESHOLD
    ) {
      state.stageCeiling = Math.min(
        LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
        Math.max(state.stageCeiling, state.displayedProgress) + MINIMUM_SPECULATIVE_RUNWAY,
      )
    }
    const stageGap = Math.max(0, state.stageCeiling - state.displayedProgress)
    const stageWindowSeconds = Math.max(0.25, state.stageDurationMs / 1_000)
    const confirmedGap = Math.max(0, state.confirmedProgress - state.displayedProgress)
    const speculativeVelocity = Math.min(
      MAXIMUM_SPECULATIVE_RATE_PER_SECOND,
      stageGap / stageWindowSeconds,
    )
    const confirmedVelocity = Math.min(
      MAXIMUM_CONFIRMED_RATE_PER_SECOND,
      confirmedGap / (CONFIRMED_RESPONSE_HORIZON_MS / 1_000),
    )
    const motionLimit = state.completionRequested
      ? 1
      : Math.max(
          state.displayedProgress,
          Math.min(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS, state.stageCeiling),
        )
    const motionGap = Math.max(0, motionLimit - state.displayedProgress)
    const minimumForwardRate = MINIMUM_FORWARD_RATE_PER_SECOND
    const maximumForwardAcceleration = state.completionRequested
      ? MAXIMUM_COMPLETION_ACCELERATION_PER_SECOND_SQUARED
      : MAXIMUM_FORWARD_ACCELERATION_PER_SECOND_SQUARED
    const maximumForwardDeceleration = state.completionRequested
      ? MAXIMUM_COMPLETION_DECELERATION_PER_SECOND_SQUARED
      : MAXIMUM_FORWARD_DECELERATION_PER_SECOND_SQUARED
    const maximumAccelerationJerk = state.completionRequested
      ? MAXIMUM_COMPLETION_ACCELERATION_JERK_PER_SECOND_CUBED
      : MAXIMUM_ACCELERATION_JERK_PER_SECOND_CUBED
    const stoppingVelocity =
      Math.sqrt(2 * maximumForwardDeceleration * motionGap) * STOPPING_SPEED_SAFETY_FACTOR
    const requestedVelocity = Math.min(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
      state.completionRequested
        ? LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND
        : Math.max(minimumForwardRate, speculativeVelocity, confirmedVelocity),
    )
    const targetVelocity = Math.min(
      stoppingVelocity,
      Math.max(minimumForwardRate, requestedVelocity),
    )
    state.targetVelocityPerSecond = targetVelocity
    let desiredAcceleration = Math.min(
      maximumForwardAcceleration,
      Math.max(
        -maximumForwardDeceleration,
        (targetVelocity - state.velocityPerSecond) * VELOCITY_ERROR_RESPONSE_PER_SECOND,
      ),
    )
    const accelerationBrakingRunway =
      state.accelerationPerSecondSquared ** 2 / (2 * maximumAccelerationJerk)
    const integrationSafetyRunway = state.accelerationPerSecondSquared * deltaSeconds * 2
    if (
      state.accelerationPerSecondSquared > 0 &&
      state.velocityPerSecond + accelerationBrakingRunway + integrationSafetyRunway >=
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND
    ) {
      desiredAcceleration = Math.min(0, desiredAcceleration)
    }
    state.accelerationPerSecondSquared = moveToward(
      state.accelerationPerSecondSquared,
      desiredAcceleration,
      maximumAccelerationJerk * deltaSeconds,
    )
    const previousVelocity = state.velocityPerSecond
    state.velocityPerSecond = Math.min(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
      Math.max(
        minimumForwardRate,
        state.velocityPerSecond + state.accelerationPerSecondSquared * deltaSeconds,
      ),
    )
    if (state.velocityPerSecond <= minimumForwardRate && state.accelerationPerSecondSquared < 0) {
      state.accelerationPerSecondSquared = 0
    }
    const integratedVelocity = Math.max(
      minimumForwardRate,
      (previousVelocity + state.velocityPerSecond) * 0.5,
    )
    const nextProgress = Math.min(
      motionLimit,
      state.displayedProgress + integratedVelocity * deltaSeconds,
    )
    if (nextProgress >= motionLimit) {
      state.velocityPerSecond = Math.min(state.velocityPerSecond, targetVelocity)
      state.accelerationPerSecondSquared = Math.min(0, state.accelerationPerSecondSquared)
    }
    state.displayedProgress = nextProgress
    remainingMs -= integrationStepMs
  }
  return state.displayedProgress
}

function cloneMotionState(state: MutableMotionState): MutableMotionState {
  return { ...state }
}

function resolveStageDuration(value: number | undefined) {
  return Math.max(MINIMUM_STAGE_DURATION_MS, finiteOr(value, DEFAULT_STAGE_DURATION_MS))
}

function moveToward(current: number, target: number, maximumDelta: number) {
  const delta = target - current
  return Math.abs(delta) <= maximumDelta ? target : current + Math.sign(delta) * maximumDelta
}

function clampProgress(value: number | undefined, fallback: number) {
  return Math.min(1, Math.max(0, finiteOr(value, fallback)))
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? (value as number) : fallback
}
