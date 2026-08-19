'use client'

import { useEffect } from 'react'
import { MathUtils } from 'three'
import type { StylizedGrassPerfProbe } from './stylized-scene-land-layers'

export const LANDRUSH_ISLAND_PERF_START_DELAY_MS = 2500

const LANDRUSH_ISLAND_PERF_DEFAULT_DURATION_MS = 9000
const LANDRUSH_ISLAND_PERF_MAX_FRAME_SAMPLES = 1200
const LANDRUSH_ISLAND_PERF_SPIKE_THRESHOLD_MS = 24

type LandrushIslandPerfRunScenario =
  | 'circle-camera'
  | 'low-angle-orbit'
  | 'pointer-orbit'
  | 'straight'

export type LandrushIslandPerfRunOptions = {
  direction: 'backward' | 'forward'
  durationMs: number
  enabled: boolean
  scenario: LandrushIslandPerfRunScenario
  speed: 'run' | 'walk'
}

type LandrushIslandPerfFrameSample = {
  dt: number
  time: number
}

type LandrushIslandPerfLongTaskSample = {
  durationMs: number
  name: string
  startMs: number
}

type LandrushIslandPerfRunState = {
  completedAt: number | null
  durationMs: number
  frames: LandrushIslandPerfFrameSample[]
  longTasks: LandrushIslandPerfLongTaskSample[]
  scenario: LandrushIslandPerfRunScenario
  speed: 'run' | 'walk'
  spikeThresholdMs: number
  startedAt: number | null
  status: 'done' | 'pending' | 'running'
}

declare global {
  interface Window {
    __LANDRUSH_ISLAND_PERF_RUN__?: () => unknown
  }
}

export function useLandrushIslandPerfRunProbe(perfRun: LandrushIslandPerfRunOptions) {
  useEffect(() => {
    if (!perfRun.enabled) {
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__?.enabled) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      delete window.__LANDRUSH_ISLAND_PERF_RUN__
      delete document.documentElement.dataset.landrushIslandPerfRun
      return
    }

    const grassProbe: StylizedGrassPerfProbe = { enabled: true, samples: [] }
    const state: LandrushIslandPerfRunState = {
      completedAt: null,
      durationMs: perfRun.durationMs,
      frames: [],
      longTasks: [],
      scenario: perfRun.scenario,
      speed: perfRun.speed,
      spikeThresholdMs: LANDRUSH_ISLAND_PERF_SPIKE_THRESHOLD_MS,
      startedAt: null,
      status: 'pending',
    }
    window.__LANDRUSH_STYLIZED_GRASS_PERF__ = grassProbe

    const publishSummary = () => {
      const summary = summarizeLandrushIslandPerfRun(state, grassProbe)
      document.documentElement.dataset.landrushIslandPerfRun = JSON.stringify(summary)
      return summary
    }

    window.__LANDRUSH_ISLAND_PERF_RUN__ = publishSummary

    let raf = 0
    let longTaskObserver: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined') {
      longTaskObserver = new PerformanceObserver((list) => {
        const startedAt = state.startedAt
        if (startedAt === null || state.status !== 'running') return
        for (const entry of list.getEntries()) {
          if (entry.startTime < startedAt) continue
          state.longTasks.push({
            durationMs: entry.duration,
            name: entry.name,
            startMs: entry.startTime - startedAt,
          })
        }
      })
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
      } catch {
        longTaskObserver.disconnect()
        longTaskObserver = null
      }
    }
    const publishTimer = window.setInterval(publishSummary, 250)
    const startTimer = window.setTimeout(() => {
      state.startedAt = performance.now()
      state.status = 'running'
      let previous = state.startedAt

      const tick = (now: number) => {
        const time = now - (state.startedAt ?? now)
        const dt = now - previous
        previous = now
        state.frames.push({ dt, time })
        if (state.frames.length > LANDRUSH_ISLAND_PERF_MAX_FRAME_SAMPLES) {
          state.frames.splice(0, state.frames.length - LANDRUSH_ISLAND_PERF_MAX_FRAME_SAMPLES)
        }

        if (time < perfRun.durationMs) {
          raf = window.requestAnimationFrame(tick)
          return
        }

        state.completedAt = now
        state.status = 'done'
        publishSummary()
      }

      raf = window.requestAnimationFrame(tick)
    }, LANDRUSH_ISLAND_PERF_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(publishTimer)
      window.cancelAnimationFrame(raf)
      longTaskObserver?.disconnect()
      if (window.__LANDRUSH_STYLIZED_GRASS_PERF__ === grassProbe) {
        delete window.__LANDRUSH_STYLIZED_GRASS_PERF__
      }
      if (window.__LANDRUSH_ISLAND_PERF_RUN__ === publishSummary) {
        delete window.__LANDRUSH_ISLAND_PERF_RUN__
      }
      delete document.documentElement.dataset.landrushIslandPerfRun
    }
  }, [perfRun])
}

export function createLandrushIslandPerfRunOptions(searchParams: {
  get: (key: string) => string | null
}) {
  const requestedScenario = searchParams.get('perfRun')
  const scenario: LandrushIslandPerfRunScenario =
    requestedScenario === 'circle-camera' ||
    requestedScenario === 'low-angle-orbit' ||
    requestedScenario === 'pointer-orbit'
      ? requestedScenario
      : 'straight'
  const enabled =
    requestedScenario === 'straight' ||
    requestedScenario === 'circle-camera' ||
    requestedScenario === 'low-angle-orbit' ||
    requestedScenario === 'pointer-orbit'
  const requestedDurationValue = searchParams.get('perfDurationMs')
  const requestedDuration =
    requestedDurationValue === null ? Number.NaN : Number(requestedDurationValue)
  const durationMs = MathUtils.clamp(
    Number.isFinite(requestedDuration)
      ? requestedDuration
      : LANDRUSH_ISLAND_PERF_DEFAULT_DURATION_MS,
    4000,
    20_000,
  )
  const speed = searchParams.get('perfSpeed') === 'walk' ? 'walk' : 'run'
  const direction = searchParams.get('perfDirection') === 'backward' ? 'backward' : 'forward'
  return { direction, durationMs, enabled, scenario, speed } satisfies LandrushIslandPerfRunOptions
}

function summarizeLandrushIslandPerfRun(
  state: LandrushIslandPerfRunState,
  grassProbe: StylizedGrassPerfProbe,
) {
  const frameDts = state.frames.map((frame) => frame.dt)
  const frameSpikes = state.frames.filter((frame) => frame.dt >= state.spikeThresholdMs)
  const longTaskDurations = state.longTasks.map((task) => task.durationMs)
  const grassSamples = grassProbe.samples
  const matrixSamples = grassSamples.filter((sample) => sample.kind === 'matrix')
  const buildSamples = grassSamples.filter((sample) => sample.kind === 'build')
  const attributeSamples = grassSamples.filter((sample) => sample.kind === 'attributes')
  const streamSamples = grassSamples.filter((sample) => sample.kind === 'stream')

  return {
    durationMs: state.durationMs,
    frames: {
      count: state.frames.length,
      maxMs: roundPerf(maxPerf(frameDts)),
      p95Ms: roundPerf(percentilePerf(frameDts, 0.95)),
      p99Ms: roundPerf(percentilePerf(frameDts, 0.99)),
      spikeCount: frameSpikes.length,
      spikeThresholdMs: state.spikeThresholdMs,
      spikes: frameSpikes.slice(0, 12).map((frame) => ({
        dt: roundPerf(frame.dt),
        time: roundPerf(frame.time),
      })),
    },
    grass: {
      attributes: summarizeLandrushIslandGrassPerfSamples(attributeSamples),
      builds: summarizeLandrushIslandGrassPerfSamples(buildSamples),
      matrices: summarizeLandrushIslandGrassPerfSamples(matrixSamples),
      streamScans: summarizeLandrushIslandGrassPerfSamples(streamSamples),
      streamUpdates: streamSamples.map((sample) => ({
        time: roundPerf(sample.time - (state.startedAt ?? sample.time)),
        x: roundPerf(sample.centerX ?? 0),
        z: roundPerf(sample.centerZ ?? 0),
      })),
    },
    longTasks: {
      count: state.longTasks.length,
      maxMs: roundPerf(maxPerf(longTaskDurations)),
      p95Ms: roundPerf(percentilePerf(longTaskDurations, 0.95)),
      totalMs: roundPerf(longTaskDurations.reduce((total, duration) => total + duration, 0)),
      top: [...state.longTasks]
        .sort((first, second) => second.durationMs - first.durationMs)
        .slice(0, 8)
        .map((task) => ({
          durationMs: roundPerf(task.durationMs),
          name: task.name,
          startMs: roundPerf(task.startMs),
        })),
    },
    scenario: state.scenario,
    speed: state.speed,
    status: state.status,
  }
}

function summarizeLandrushIslandGrassPerfSamples(samples: StylizedGrassPerfProbe['samples']) {
  const durations = samples.map((sample) => sample.durationMs)
  return {
    count: samples.length,
    maxMs: roundPerf(maxPerf(durations)),
    p95Ms: roundPerf(percentilePerf(durations, 0.95)),
    top: [...samples]
      .sort((first, second) => second.durationMs - first.durationMs)
      .slice(0, 8)
      .map((sample) => ({
        count: sample.count ?? 0,
        durationMs: roundPerf(sample.durationMs),
        moving: sample.moving ?? undefined,
      })),
  }
}

function percentilePerf(values: readonly number[], percentileValue: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))] ?? 0
}

function maxPerf(values: readonly number[]) {
  return values.length === 0 ? 0 : Math.max(...values)
}

export function roundPerf(value: number) {
  return Math.round(value * 1000) / 1000
}
