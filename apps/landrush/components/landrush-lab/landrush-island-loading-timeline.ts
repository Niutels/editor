import { LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING } from './landrush-island-loading-progress-controller'

export const LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION = 2
export const LANDRUSH_ISLAND_LOADING_TIMING_MAX_SAMPLES = 8
export const LANDRUSH_ISLAND_LOADING_PENDING_EVIDENCE_SHARE = 0.985

const LANDRUSH_ISLAND_LOADING_TIMING_STORAGE_PREFIX = 'landrush-island-loading-timing'
const LANDRUSH_ISLAND_LOADING_MAX_SAMPLE_DURATION_MS = 10 * 60_000
const LANDRUSH_ISLAND_LOADING_PENDING_MAX_PROGRESS = 0.999
const LANDRUSH_ISLAND_LOADING_SETTLED_MILESTONE_SHARE = 0.7
const LANDRUSH_ISLAND_LOADING_UNREADY_GATE_CEILING = 0.75
const LANDRUSH_ISLAND_LOADING_NEXT_MILESTONE_PREVIEW_SHARE = 0.9
const LANDRUSH_ISLAND_LOADING_MINIMUM_FORECAST_INTERVAL_MS = 250

export type LandrushIslandLoadingTaskSnapshot = Readonly<{
  completed: number
  id: string
  ready: boolean
  total: number
}>

export type LandrushIslandLoadingTimingStorage = Readonly<{
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}>

export type LandrushIslandLoadingTopologyFallback = Readonly<{
  expectedRunMs: number
  maximumRunMs: number
  minimumRunMs: number
}>

export type LandrushIslandLoadingTaskTimingSample = Readonly<{
  completionOffsetsMs: readonly number[]
  id: string
  readyOffsetMs: number
  total: number
}>

export type LandrushIslandLoadingTimingSample = Readonly<{
  durationMs: number
  tasks: readonly LandrushIslandLoadingTaskTimingSample[]
  topologyKey: string
}>

export type LandrushIslandLoadingTimingProfile = Readonly<{
  samples: readonly LandrushIslandLoadingTimingSample[]
  version: typeof LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION
}>

export type LandrushIslandLoadingTaskForecast = Readonly<{
  completionOffsetsMs: readonly number[]
  id: string
  readyOffsetMs: number
  total: number
}>

export type LandrushIslandLoadingForecast = Readonly<{
  durationMs: number
  historicalSampleCount: number
  tasks: readonly LandrushIslandLoadingTaskForecast[]
  topologyKey: string
}>

export type LandrushIslandLoadingTimelineUpdate = Readonly<{
  allReady: boolean
  evidenceProgress: number
  presentationProgress: number
  progress: number
  stale: boolean
}>

export type LandrushIslandLoadingTimelineRun = Readonly<{
  abort: () => void
  advance: (nowMs: number) => number
  commitSuccess: () => boolean
  getForecast: () => LandrushIslandLoadingForecast
  invalidatePersistence: () => void
  project: (nowMs: number) => number
  raiseProgressFloor: (progress: number) => number
  update: (
    generation: string,
    tasks: readonly LandrushIslandLoadingTaskSnapshot[],
    nowMs: number,
  ) => LandrushIslandLoadingTimelineUpdate
}>

const DEFAULT_TOPOLOGY_FALLBACK: LandrushIslandLoadingTopologyFallback = {
  expectedRunMs: 18_000,
  maximumRunMs: 120_000,
  minimumRunMs: 4_000,
}

type MutableTaskTiming = {
  completionOffsetsMs: number[]
  readyOffsetMs: number | null
  total: number
}

export function createLandrushIslandLoadingTimingStorageKey(profileKey: string) {
  return `${LANDRUSH_ISLAND_LOADING_TIMING_STORAGE_PREFIX}:v${String(
    LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION,
  )}:${encodeURIComponent(profileKey)}`
}

export function createLandrushIslandLoadingTaskTopologyKey(
  tasks: readonly LandrushIslandLoadingTaskSnapshot[],
  topologySignature: string,
) {
  const taskKey = normalizeLandrushIslandLoadingTasks(tasks)
    .map((task) => `${encodeURIComponent(task.id)}:${String(task.total)}`)
    .join('|')
  return `${encodeURIComponent(normalizeTopologySignature(topologySignature))}|${taskKey}`
}

export function readLandrushIslandLoadingTimingProfile(
  storage: LandrushIslandLoadingTimingStorage | null | undefined,
  profileKey: string,
): LandrushIslandLoadingTimingProfile {
  if (!storage) return createEmptyLandrushIslandLoadingTimingProfile()
  try {
    const raw = storage.getItem(createLandrushIslandLoadingTimingStorageKey(profileKey))
    if (!raw) return createEmptyLandrushIslandLoadingTimingProfile()
    return parseLandrushIslandLoadingTimingProfile(JSON.parse(raw))
  } catch {
    return createEmptyLandrushIslandLoadingTimingProfile()
  }
}

export function createLandrushIslandLoadingForecast({
  fallback = DEFAULT_TOPOLOGY_FALLBACK,
  profile,
  tasks,
  topologySignature,
}: {
  fallback?: LandrushIslandLoadingTopologyFallback
  profile: LandrushIslandLoadingTimingProfile
  tasks: readonly LandrushIslandLoadingTaskSnapshot[]
  topologySignature: string
}): LandrushIslandLoadingForecast {
  const normalizedTasks = normalizeLandrushIslandLoadingTasks(tasks)
  const topologyKey = createLandrushIslandLoadingTaskTopologyKey(normalizedTasks, topologySignature)
  const compatibleSamples = profile.samples.filter((sample) => sample.topologyKey === topologyKey)
  const boundedFallback = normalizeTopologyFallback(fallback)
  const taskForecasts = normalizedTasks.map((task) => {
    const fallbackReadyOffsetMs = clampFinite(
      boundedFallback.expectedRunMs,
      boundedFallback.minimumRunMs,
      boundedFallback.maximumRunMs,
    )
    const compatibleTaskSamples = compatibleSamples
      .map((sample) => sample.tasks.find((candidate) => candidate.id === task.id))
      .filter(
        (sample): sample is LandrushIslandLoadingTaskTimingSample =>
          sample !== undefined && sample.total === task.total,
      )
    const completionOffsetsMs: number[] = []
    let previousOffsetMs = 0
    for (let ordinal = 0; ordinal < task.total; ordinal += 1) {
      const learnedOffsetMs = percentile75(
        compatibleTaskSamples
          .map((sample) => sample.completionOffsetsMs[ordinal])
          .filter(isPositiveFiniteNumber),
      )
      const fallbackOffsetMs = fallbackReadyOffsetMs * ((ordinal + 1) / Math.max(1, task.total))
      const offsetMs = Math.max(previousOffsetMs, learnedOffsetMs ?? fallbackOffsetMs)
      completionOffsetsMs.push(offsetMs)
      previousOffsetMs = offsetMs
    }
    const learnedReadyOffsetMs = percentile75(
      compatibleTaskSamples.map((sample) => sample.readyOffsetMs).filter(isPositiveFiniteNumber),
    )
    const readyOffsetMs = clampFinite(
      Math.max(previousOffsetMs, learnedReadyOffsetMs ?? fallbackReadyOffsetMs),
      1,
      boundedFallback.maximumRunMs,
    )
    return {
      completionOffsetsMs,
      id: task.id,
      readyOffsetMs,
      total: task.total,
    }
  })
  const learnedDurationMs = percentile75(
    compatibleSamples.map((sample) => sample.durationMs).filter(isPositiveFiniteNumber),
  )
  const criticalPathMs = taskForecasts.reduce(
    (maximum, task) => Math.max(maximum, task.readyOffsetMs),
    boundedFallback.minimumRunMs,
  )
  const durationMs = clampFinite(
    Math.max(criticalPathMs, learnedDurationMs ?? 0),
    boundedFallback.minimumRunMs,
    boundedFallback.maximumRunMs,
  )
  return {
    durationMs,
    historicalSampleCount: compatibleSamples.length,
    tasks: taskForecasts,
    topologyKey,
  }
}

export function createLandrushIslandLoadingTimelineRun({
  fallback,
  generation,
  initialObservationTimeMs,
  profileKey,
  startTimeMs,
  storage,
  tasks,
  topologySignature,
}: {
  fallback?: LandrushIslandLoadingTopologyFallback
  generation: string
  initialObservationTimeMs: number
  profileKey: string
  startTimeMs: number
  storage?: LandrushIslandLoadingTimingStorage | null
  tasks: readonly LandrushIslandLoadingTaskSnapshot[]
  topologySignature: string
}): LandrushIslandLoadingTimelineRun {
  const initialTasks = normalizeLandrushIslandLoadingTasks(tasks)
  const topologyKey = createLandrushIslandLoadingTaskTopologyKey(initialTasks, topologySignature)
  const profile = readLandrushIslandLoadingTimingProfile(storage, profileKey)
  const forecast = createLandrushIslandLoadingForecast({
    fallback,
    profile,
    tasks: initialTasks,
    topologySignature,
  })
  const timings = new Map<string, MutableTaskTiming>(
    initialTasks.map((task) => [
      task.id,
      { completionOffsetsMs: [], readyOffsetMs: null, total: task.total },
    ]),
  )
  let aborted = false
  let committed = false
  let persistenceEligible = true
  let persistenceInvalidated = false
  let progressFloor = 0
  let successfulOffsetMs: number | null = null
  let latestTasks: readonly LandrushIslandLoadingTaskSnapshot[] = initialTasks

  const recordTasks = (nextTasks: readonly LandrushIslandLoadingTaskSnapshot[], nowMs: number) => {
    const offsetMs = normalizeOffsetMs(nowMs - startTimeMs)
    const previousById = new Map(latestTasks.map((task) => [task.id, task]))
    for (const task of nextTasks) {
      const timing = timings.get(task.id)
      const previous = previousById.get(task.id)
      if (!(timing && previous)) {
        persistenceEligible = false
        continue
      }
      if (task.completed < previous.completed) persistenceEligible = false
      while (timing.completionOffsetsMs.length < task.completed) {
        timing.completionOffsetsMs.push(offsetMs)
      }
      if (task.ready) {
        if (!previous.ready || timing.readyOffsetMs === null) timing.readyOffsetMs = offsetMs
      } else if (previous.ready) {
        timing.readyOffsetMs = null
      }
    }
    latestTasks = nextTasks
    const allReady = nextTasks.length > 0 && nextTasks.every((task) => task.ready)
    successfulOffsetMs = allReady ? (successfulOffsetMs ?? offsetMs) : null
    return allReady
  }

  recordTasks(initialTasks, initialObservationTimeMs)

  const project = (nowMs: number) => {
    const elapsedMs = normalizeOffsetMs(nowMs - startTimeMs)
    const forecastFraction = resolveForecastFraction(forecast, latestTasks, timings, elapsedMs)
    const evidenceProgress = resolveEvidenceProgress(latestTasks)
    const modeledProgress = Math.max(
      forecastFraction * LANDRUSH_ISLAND_LOADING_PENDING_EVIDENCE_SHARE,
      evidenceProgress,
    )
    return Math.max(
      progressFloor,
      Math.min(LANDRUSH_ISLAND_LOADING_PENDING_MAX_PROGRESS, modeledProgress),
    )
  }

  return {
    abort() {
      aborted = true
      persistenceEligible = false
    },
    advance(nowMs) {
      progressFloor = Math.max(progressFloor, project(nowMs))
      return progressFloor
    },
    commitSuccess() {
      if (
        aborted ||
        committed ||
        !persistenceEligible ||
        successfulOffsetMs === null ||
        !latestTasks.every((task) => task.ready)
      ) {
        return false
      }
      const sample = createSuccessfulTimingSample({
        durationMs: successfulOffsetMs,
        timings,
        topologyKey,
      })
      committed = true
      progressFloor = 1
      if (sample && !persistenceInvalidated) {
        persistLandrushIslandLoadingTimingSample(storage, profileKey, sample)
      }
      return true
    },
    getForecast: () => forecast,
    invalidatePersistence() {
      persistenceInvalidated = true
    },
    project,
    raiseProgressFloor(progress) {
      progressFloor = Math.max(
        progressFloor,
        Math.min(LANDRUSH_ISLAND_LOADING_PENDING_MAX_PROGRESS, clamp01(progress)),
      )
      return progressFloor
    },
    update(nextGeneration, tasksSnapshot, nowMs) {
      if (aborted || nextGeneration !== generation) {
        aborted = true
        persistenceEligible = false
        const evidenceProgress = resolveEvidenceProgress(latestTasks)
        return {
          allReady: false,
          evidenceProgress,
          presentationProgress:
            resolveLandrushIslandLoadingPendingPresentationProgress(evidenceProgress),
          progress: progressFloor,
          stale: true,
        }
      }
      const nextTasks = normalizeLandrushIslandLoadingTasks(tasksSnapshot)
      if (
        createLandrushIslandLoadingTaskTopologyKey(nextTasks, topologySignature) !== topologyKey
      ) {
        aborted = true
        persistenceEligible = false
        const evidenceProgress = resolveEvidenceProgress(latestTasks)
        return {
          allReady: false,
          evidenceProgress,
          presentationProgress:
            resolveLandrushIslandLoadingPendingPresentationProgress(evidenceProgress),
          progress: progressFloor,
          stale: true,
        }
      }
      const allReady = recordTasks(nextTasks, nowMs)
      progressFloor = Math.max(progressFloor, project(nowMs))
      const evidenceProgress = resolveEvidenceProgress(nextTasks)
      return {
        allReady,
        evidenceProgress,
        presentationProgress:
          resolveLandrushIslandLoadingPendingPresentationProgress(evidenceProgress),
        progress: progressFloor,
        stale: false,
      }
    },
  }
}

function resolveForecastFraction(
  forecast: LandrushIslandLoadingForecast,
  tasks: readonly LandrushIslandLoadingTaskSnapshot[],
  timings: ReadonlyMap<string, MutableTaskTiming>,
  elapsedMs: number,
) {
  if (forecast.tasks.length === 0) return 0
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  let totalFraction = 0
  for (const taskForecast of forecast.tasks) {
    const task = tasksById.get(taskForecast.id)
    if (!task) continue
    totalFraction += resolveTaskForecastFraction(
      taskForecast,
      task,
      timings.get(task.id),
      elapsedMs,
    )
  }
  return totalFraction / forecast.tasks.length
}

function resolveTaskForecastFraction(
  forecast: LandrushIslandLoadingTaskForecast,
  task: LandrushIslandLoadingTaskSnapshot,
  timing: MutableTaskTiming | undefined,
  elapsedMs: number,
) {
  if (task.ready) return 1
  const completed = Math.min(task.completed, task.total)
  const settledFraction = resolveObservedTaskFraction(task)
  const nextCeiling =
    task.total > 0 && completed < task.total
      ? LANDRUSH_ISLAND_LOADING_SETTLED_MILESTONE_SHARE * ((completed + 1) / task.total)
      : LANDRUSH_ISLAND_LOADING_UNREADY_GATE_CEILING
  const actualIntervalStartMs =
    completed > 0 ? (timing?.completionOffsetsMs[completed - 1] ?? elapsedMs) : 0
  const forecastIntervalStartMs =
    completed > 0 ? (forecast.completionOffsetsMs[completed - 1] ?? forecast.readyOffsetMs) : 0
  const forecastIntervalEndMs =
    task.total > 0 && completed < task.total
      ? (forecast.completionOffsetsMs[completed] ?? forecast.readyOffsetMs)
      : forecast.readyOffsetMs
  const forecastIntervalMs = Math.max(
    LANDRUSH_ISLAND_LOADING_MINIMUM_FORECAST_INTERVAL_MS,
    forecastIntervalEndMs - forecastIntervalStartMs,
  )
  const elapsedInIntervalMs = Math.max(0, elapsedMs - actualIntervalStartMs)
  const intervalRatio = elapsedInIntervalMs / forecastIntervalMs
  const approach =
    LANDRUSH_ISLAND_LOADING_NEXT_MILESTONE_PREVIEW_SHARE * (intervalRatio / (1 + intervalRatio))
  return settledFraction + (nextCeiling - settledFraction) * approach
}

function resolveObservedFraction(tasks: readonly LandrushIslandLoadingTaskSnapshot[]) {
  if (tasks.length === 0) return 0
  let totalFraction = 0
  for (const task of tasks) {
    totalFraction += resolveObservedTaskFraction(task)
  }
  return totalFraction / tasks.length
}

function resolveEvidenceProgress(tasks: readonly LandrushIslandLoadingTaskSnapshot[]) {
  return Math.min(
    LANDRUSH_ISLAND_LOADING_PENDING_MAX_PROGRESS,
    resolveObservedFraction(tasks) * LANDRUSH_ISLAND_LOADING_PENDING_EVIDENCE_SHARE,
  )
}

export function resolveLandrushIslandLoadingPendingPresentationProgress(evidenceProgress: number) {
  return Math.min(
    LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    clamp01(evidenceProgress) *
      (LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING /
        LANDRUSH_ISLAND_LOADING_PENDING_EVIDENCE_SHARE),
  )
}

function resolveObservedTaskFraction(task: LandrushIslandLoadingTaskSnapshot) {
  if (task.ready) return 1
  if (task.total === 0) return 0
  return LANDRUSH_ISLAND_LOADING_SETTLED_MILESTONE_SHARE * clamp01(task.completed / task.total)
}

function createSuccessfulTimingSample({
  durationMs,
  timings,
  topologyKey,
}: {
  durationMs: number
  timings: ReadonlyMap<string, MutableTaskTiming>
  topologyKey: string
}): LandrushIslandLoadingTimingSample | null {
  if (
    !(
      isPositiveFiniteNumber(durationMs) &&
      durationMs <= LANDRUSH_ISLAND_LOADING_MAX_SAMPLE_DURATION_MS
    )
  ) {
    return null
  }
  const tasks: LandrushIslandLoadingTaskTimingSample[] = []
  for (const [id, timing] of Array.from(timings.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (
      timing.readyOffsetMs === null ||
      timing.completionOffsetsMs.length !== timing.total ||
      !timing.completionOffsetsMs.every(isNonNegativeFiniteNumber)
    ) {
      return null
    }
    tasks.push({
      completionOffsetsMs: [...timing.completionOffsetsMs],
      id,
      readyOffsetMs: timing.readyOffsetMs,
      total: timing.total,
    })
  }
  return { durationMs, tasks, topologyKey }
}

function persistLandrushIslandLoadingTimingSample(
  storage: LandrushIslandLoadingTimingStorage | null | undefined,
  profileKey: string,
  sample: LandrushIslandLoadingTimingSample,
) {
  if (!storage) return
  try {
    const current = readLandrushIslandLoadingTimingProfile(storage, profileKey)
    const samples = [...current.samples, sample].slice(-LANDRUSH_ISLAND_LOADING_TIMING_MAX_SAMPLES)
    const profile: LandrushIslandLoadingTimingProfile = {
      samples,
      version: LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION,
    }
    storage.setItem(
      createLandrushIslandLoadingTimingStorageKey(profileKey),
      JSON.stringify(profile),
    )
  } catch {}
}

function parseLandrushIslandLoadingTimingProfile(
  value: unknown,
): LandrushIslandLoadingTimingProfile {
  if (!(isRecord(value) && value.version === LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION)) {
    return createEmptyLandrushIslandLoadingTimingProfile()
  }
  if (!Array.isArray(value.samples)) return createEmptyLandrushIslandLoadingTimingProfile()
  const samples = value.samples
    .map(parseLandrushIslandLoadingTimingSample)
    .filter((sample): sample is LandrushIslandLoadingTimingSample => sample !== null)
    .slice(-LANDRUSH_ISLAND_LOADING_TIMING_MAX_SAMPLES)
  return { samples, version: LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION }
}

function parseLandrushIslandLoadingTimingSample(
  value: unknown,
): LandrushIslandLoadingTimingSample | null {
  if (
    !(
      isRecord(value) &&
      isPositiveFiniteNumber(value.durationMs) &&
      value.durationMs <= LANDRUSH_ISLAND_LOADING_MAX_SAMPLE_DURATION_MS &&
      typeof value.topologyKey === 'string' &&
      Array.isArray(value.tasks)
    )
  ) {
    return null
  }
  const tasks: LandrushIslandLoadingTaskTimingSample[] = []
  for (const task of value.tasks) {
    if (
      !(
        isRecord(task) &&
        typeof task.id === 'string' &&
        task.id.length > 0 &&
        Number.isSafeInteger(task.total) &&
        (task.total as number) >= 0 &&
        isNonNegativeFiniteNumber(task.readyOffsetMs) &&
        Array.isArray(task.completionOffsetsMs) &&
        task.completionOffsetsMs.length === task.total &&
        task.completionOffsetsMs.every(isNonNegativeFiniteNumber)
      )
    ) {
      return null
    }
    tasks.push({
      completionOffsetsMs: [...(task.completionOffsetsMs as number[])],
      id: task.id,
      readyOffsetMs: task.readyOffsetMs,
      total: task.total,
    })
  }
  return {
    durationMs: value.durationMs,
    tasks,
    topologyKey: value.topologyKey,
  } satisfies LandrushIslandLoadingTimingSample
}

function createEmptyLandrushIslandLoadingTimingProfile(): LandrushIslandLoadingTimingProfile {
  return { samples: [], version: LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION }
}

function normalizeLandrushIslandLoadingTasks(
  tasks: readonly LandrushIslandLoadingTaskSnapshot[],
): LandrushIslandLoadingTaskSnapshot[] {
  const normalized = tasks.map((task) => {
    if (!(typeof task.id === 'string' && task.id.length > 0)) {
      throw new Error('Landrush loading task IDs must be non-empty strings.')
    }
    if (!(Number.isSafeInteger(task.total) && task.total >= 0)) {
      throw new Error(`Landrush loading task ${task.id} has an invalid total.`)
    }
    if (!(Number.isSafeInteger(task.completed) && task.completed >= 0)) {
      throw new Error(`Landrush loading task ${task.id} has an invalid completed count.`)
    }
    return {
      completed: Math.min(task.total, task.ready ? task.total : task.completed),
      id: task.id,
      ready: task.ready,
      total: task.total,
    }
  })
  normalized.sort((left, right) => left.id.localeCompare(right.id))
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]?.id === normalized[index]?.id) {
      throw new Error(`Duplicate Landrush loading task ID: ${normalized[index]?.id ?? ''}.`)
    }
  }
  return normalized
}

function normalizeTopologyFallback(
  fallback: LandrushIslandLoadingTopologyFallback,
): LandrushIslandLoadingTopologyFallback {
  const minimumRunMs = Math.max(1, finiteOr(fallback.minimumRunMs, 1))
  const maximumRunMs = Math.max(minimumRunMs, finiteOr(fallback.maximumRunMs, minimumRunMs))
  return {
    expectedRunMs: Math.max(1, finiteOr(fallback.expectedRunMs, minimumRunMs)),
    maximumRunMs,
    minimumRunMs,
  }
}

function normalizeTopologySignature(value: string) {
  if (!(typeof value === 'string' && value.length > 0)) {
    throw new Error('Landrush loading topology signatures must be non-empty strings.')
  }
  return value
}

function percentile75(values: readonly number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)] ?? null
}

function normalizeOffsetMs(value: number) {
  return Math.max(0, finiteOr(value, 0))
}

function clampFinite(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finiteOr(value, minimum)))
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, finiteOr(value, 0)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
