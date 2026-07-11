'use client'

export const ROBOT_WORLD_PROFILE_THRESHOLD_MS = 10

export type RobotWorldProfileMeasure = <T>(id: string, callback: () => T) => T

export type RobotWorldProfileRecord = {
  avgMs: number
  count: number
  id: string
  maxMs: number
  overThresholdCount: number
  p95Ms: number
  totalMs: number
}

export type RobotWorldProfileSnapshot = {
  generatedAt: string
  overThreshold: RobotWorldProfileRecord[]
  records: RobotWorldProfileRecord[]
  thresholdMs: number
  unmonitoredOverThreshold: RobotWorldProfileRecord[]
}

type RawProfileRecord = {
  count: number
  maxMs: number
  overThresholdCount: number
  samples: number[]
  totalMs: number
}

type OpenProfileSpan = {
  childMs: number
  id: string
  startMs: number
}

const ROBOT_WORLD_PROFILE_MAX_SAMPLES = 320

export function createRobotWorldProfiler() {
  const records = new Map<string, RawProfileRecord>()
  const stack: OpenProfileSpan[] = []

  const record = (id: string, durationMs: number) => {
    const safeDuration = Math.max(0, durationMs)
    const entry =
      records.get(id) ??
      ({
        count: 0,
        maxMs: 0,
        overThresholdCount: 0,
        samples: [],
        totalMs: 0,
      } satisfies RawProfileRecord)

    entry.count += 1
    entry.totalMs += safeDuration
    entry.maxMs = Math.max(entry.maxMs, safeDuration)
    if (safeDuration > ROBOT_WORLD_PROFILE_THRESHOLD_MS) entry.overThresholdCount += 1
    entry.samples.push(safeDuration)
    if (entry.samples.length > ROBOT_WORLD_PROFILE_MAX_SAMPLES) entry.samples.shift()
    records.set(id, entry)
  }

  const measure: RobotWorldProfileMeasure = (id, callback) => {
    const span: OpenProfileSpan = {
      childMs: 0,
      id,
      startMs: performance.now(),
    }
    stack.push(span)

    try {
      return callback()
    } finally {
      const durationMs = performance.now() - span.startMs
      stack.pop()
      record(id, durationMs)
      record(`${id}.self`, Math.max(0, durationMs - span.childMs))
      const parent = stack.at(-1)
      if (parent) parent.childMs += durationMs
    }
  }

  const snapshot = (): RobotWorldProfileSnapshot => {
    const normalized = [...records.entries()]
      .map(([id, entry]) => normalizeRecord(id, entry))
      .sort((first, second) => second.p95Ms - first.p95Ms)
    const overThreshold = normalized.filter(
      (entry) => entry.maxMs > ROBOT_WORLD_PROFILE_THRESHOLD_MS,
    )
    return {
      generatedAt: new Date().toISOString(),
      overThreshold,
      records: normalized,
      thresholdMs: ROBOT_WORLD_PROFILE_THRESHOLD_MS,
      unmonitoredOverThreshold: overThreshold.filter((entry) => entry.id.endsWith('.self')),
    }
  }

  return {
    measure,
    record,
    reset: () => {
      records.clear()
      stack.length = 0
    },
    snapshot,
  }
}

export function createRobotWorldDebugStore<State>() {
  let state: State | null = null

  return {
    get: () => state,
    set: (nextState: State) => {
      state = nextState
    },
  }
}

function normalizeRecord(id: string, record: RawProfileRecord): RobotWorldProfileRecord {
  const sorted = [...record.samples].sort((first, second) => first - second)
  return {
    avgMs: roundMs(record.totalMs / Math.max(1, record.count)),
    count: record.count,
    id,
    maxMs: roundMs(record.maxMs),
    overThresholdCount: record.overThresholdCount,
    p95Ms: roundMs(percentile(sorted, 0.95)),
    totalMs: roundMs(record.totalMs),
  }
}

function percentile(sortedValues: readonly number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0
  return sortedValues[
    Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * percentileValue))
  ]!
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000
}
