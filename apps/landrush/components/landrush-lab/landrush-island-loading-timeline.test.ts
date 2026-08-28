import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  resolveLandrushIslandLoadingProgressStage,
} from './landrush-island-loading-progress-controller'
import { LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS } from './landrush-island-loading-shell-bootstrap'
import {
  createLandrushIslandLoadingForecast,
  createLandrushIslandLoadingTaskTopologyKey,
  createLandrushIslandLoadingTimelineRun,
  LANDRUSH_ISLAND_LOADING_TIMING_MAX_SAMPLES,
  LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION,
  type LandrushIslandLoadingTaskSnapshot,
  type LandrushIslandLoadingTimingProfile,
  type LandrushIslandLoadingTimingSample,
  type LandrushIslandLoadingTimingStorage,
  readLandrushIslandLoadingTimingProfile,
} from './landrush-island-loading-timeline'
import {
  animateLandrushIslandLoadingFill,
  appendLandrushIslandDocumentReadinessTask,
  createLandrushIslandLoadingVisualPreview,
  LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID,
  resolveLandrushIslandLoadingVisualSegmentProgress,
  shouldReconcileLandrushIslandLoadingPreview,
} from './landrush-island-loading-timeline-react'

const TEST_TOPOLOGY_SIGNATURE = 'landrush-test-catalog:v1'

function createMemoryStorage(): LandrushIslandLoadingTimingStorage & {
  entries: Map<string, string>
} {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  }
}

function task(id: string, completed: number, total: number, ready = completed === total) {
  return { completed, id, ready, total } satisfies LandrushIslandLoadingTaskSnapshot
}

describe('Landrush island measured loading timeline', () => {
  test('records every ordinal completion offset and persists only after a successful handoff', () => {
    const storage = createMemoryStorage()
    const initial = [task('ambient', 0, 3, false), task('generated', 0, 2, false)]
    const run = createLandrushIslandLoadingTimelineRun({
      generation: 'world:1',
      initialObservationTimeMs: 1_000,
      profileKey: 'zombie',
      startTimeMs: 1_000,
      storage,
      tasks: initial,
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    run.update('world:1', [task('ambient', 1, 3, false), task('generated', 0, 2, false)], 1_100)
    run.update('world:1', [task('ambient', 1, 3, false), task('generated', 1, 2, false)], 1_300)
    run.update('world:1', [task('ambient', 3, 3), task('generated', 1, 2, false)], 1_600)
    const ready = run.update('world:1', [task('ambient', 3, 3), task('generated', 2, 2)], 1_800)
    const stillReady = run.update(
      'world:1',
      [task('ambient', 3, 3), task('generated', 2, 2)],
      1_900,
    )

    expect(ready.allReady).toBe(true)
    expect(stillReady.allReady).toBe(true)
    expect(storage.entries.size).toBe(0)
    expect(run.commitSuccess()).toBe(true)

    const profile = readLandrushIslandLoadingTimingProfile(storage, 'zombie')
    expect(profile.samples).toHaveLength(1)
    expect(profile.samples[0]).toEqual({
      durationMs: 800,
      tasks: [
        {
          completionOffsetsMs: [100, 600, 600],
          id: 'ambient',
          readyOffsetMs: 600,
          total: 3,
        },
        {
          completionOffsetsMs: [300, 800],
          id: 'generated',
          readyOffsetMs: 800,
          total: 2,
        },
      ],
      topologyKey: createLandrushIslandLoadingTaskTopologyKey(initial, TEST_TOPOLOGY_SIGNATURE),
    })
  })

  test('does not persist aborted, regressed, or stale-generation runs', () => {
    for (const kind of ['aborted', 'regressed', 'stale'] as const) {
      const storage = createMemoryStorage()
      const run = createLandrushIslandLoadingTimelineRun({
        generation: 'world:1',
        initialObservationTimeMs: 0,
        profileKey: kind,
        startTimeMs: 0,
        storage,
        tasks: [task('ambient', 0, 2, false)],
        topologySignature: TEST_TOPOLOGY_SIGNATURE,
      })
      run.update('world:1', [task('ambient', 1, 2, false)], 100)
      if (kind === 'aborted') run.abort()
      if (kind === 'regressed') run.update('world:1', [task('ambient', 0, 2, false)], 200)
      if (kind === 'stale') {
        expect(run.update('world:2', [task('ambient', 2, 2)], 200).stale).toBe(true)
      } else {
        run.update('world:1', [task('ambient', 2, 2)], 300)
      }
      expect(run.commitSuccess()).toBe(false)
      expect(storage.entries.size).toBe(0)
    }
  })

  test('uses p75 absolute completion offsets and the parallel critical path', () => {
    const topologyTasks = [task('ambient', 0, 2, false), task('generated', 0, 1, false)]
    const topologyKey = createLandrushIslandLoadingTaskTopologyKey(
      topologyTasks,
      TEST_TOPOLOGY_SIGNATURE,
    )
    const samples = [
      createTimingSample(topologyKey, 1_000, 4_000),
      createTimingSample(topologyKey, 1_500, 5_000),
      createTimingSample(topologyKey, 2_000, 6_000),
      createTimingSample(topologyKey, 2_500, 10_000),
    ]
    const profile: LandrushIslandLoadingTimingProfile = {
      samples,
      version: LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION,
    }

    const forecast = createLandrushIslandLoadingForecast({
      profile,
      tasks: topologyTasks,
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    expect(forecast.historicalSampleCount).toBe(4)
    expect(forecast.tasks.find((candidate) => candidate.id === 'ambient')?.readyOffsetMs).toBe(
      2_000,
    )
    expect(forecast.tasks.find((candidate) => candidate.id === 'generated')?.readyOffsetMs).toBe(
      6_000,
    )
    expect(forecast.durationMs).toBe(6_000)
    expect(forecast.durationMs).not.toBe(8_000)
  })

  test('gives every top-level gate the same first-run fallback without summing tasks', () => {
    const profile: LandrushIslandLoadingTimingProfile = {
      samples: [],
      version: LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION,
    }
    const forecast = createLandrushIslandLoadingForecast({
      fallback: {
        expectedRunMs: 600,
        maximumRunMs: 10_000,
        minimumRunMs: 100,
      },
      profile,
      tasks: [task('ambient', 0, 2, false), task('generated', 0, 5, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    expect(forecast.tasks.map((candidate) => candidate.readyOffsetMs)).toEqual([600, 600])
    expect(forecast.durationMs).toBe(600)
  })

  test('does not let a 26-ordinal asset gate dominate a one-ordinal gate', () => {
    const manyAssetRun = createLandrushIslandLoadingTimelineRun({
      generation: 'world:many-assets',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-many-assets',
      startTimeMs: 0,
      tasks: [task('ambient', 0, 26, false), task('scene', 0, 1, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })
    const singleAssetRun = createLandrushIslandLoadingTimelineRun({
      generation: 'world:single-asset',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-single-asset',
      startTimeMs: 0,
      tasks: [task('ambient', 0, 26, false), task('scene', 0, 1, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const manyAssetGateReady = manyAssetRun.update(
      'world:many-assets',
      [task('ambient', 26, 26), task('scene', 0, 1, false)],
      0,
    ).progress
    const singleAssetGateReady = singleAssetRun.update(
      'world:single-asset',
      [task('ambient', 0, 26, false), task('scene', 1, 1)],
      0,
    ).progress

    expect(manyAssetGateReady).toBeCloseTo(singleAssetGateReady)
    expect(manyAssetGateReady).toBeCloseTo(0.5 * 0.985)
  })

  test('keeps one or two unresolved aggregate gates below fixed endgame caps', () => {
    const readyTasks = [
      task('document', 1, 1),
      task('ground', 1, 1),
      task('parcel', 1, 1),
      task('scene', 1, 1),
      task('viewer', 1, 1),
      task('world', 1, 1),
      task('paint', 1, 1),
    ]
    const oneUnresolvedTasks = [...readyTasks, task('ambient', 26, 26, false)]
    const twoUnresolvedTasks = [
      ...readyTasks,
      task('ambient', 26, 26, false),
      task('zombie', 15, 15, false),
    ]
    const oneUnresolvedRun = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 1_000,
        maximumRunMs: 10_000,
        minimumRunMs: 100,
      },
      generation: 'world:one-unresolved',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-one-unresolved',
      startTimeMs: 0,
      tasks: oneUnresolvedTasks,
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })
    const twoUnresolvedRun = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 1_000,
        maximumRunMs: 10_000,
        minimumRunMs: 100,
      },
      generation: 'world:two-unresolved',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-two-unresolved',
      startTimeMs: 0,
      tasks: twoUnresolvedTasks,
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const oneUnresolvedProgress = oneUnresolvedRun.advance(600_000)
    const twoUnresolvedProgress = twoUnresolvedRun.advance(600_000)
    const oneUnresolvedHardCap = ((7 + 0.75) / 8) * 0.985
    const twoUnresolvedHardCap = ((7 + 2 * 0.75) / 9) * 0.985

    expect(oneUnresolvedHardCap).toBeLessThan(0.96)
    expect(oneUnresolvedProgress).toBeLessThan(oneUnresolvedHardCap)
    expect(twoUnresolvedHardCap).toBeLessThan(0.94)
    expect(twoUnresolvedProgress).toBeLessThan(twoUnresolvedHardCap)
    const ready = twoUnresolvedRun.update(
      'world:two-unresolved',
      twoUnresolvedTasks.map((candidate) => ({
        ...candidate,
        completed: candidate.total,
        ready: true,
      })),
      600_100,
    )
    expect(ready.allReady).toBe(true)
    expect(ready.progress).toBeLessThan(1)
    expect(twoUnresolvedRun.commitSuccess()).toBe(true)
    expect(twoUnresolvedRun.project(600_100)).toBe(1)
  })

  test('reports completed-task evidence separately from elapsed forecast progress', () => {
    const tasks = [task('scene', 1, 1), task('paint', 0, 1, false)]
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 1_000,
        maximumRunMs: 120_000,
        minimumRunMs: 100,
      },
      generation: 'world:evidence',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-evidence',
      startTimeMs: 0,
      tasks,
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const update = run.update('world:evidence', tasks, 30_000)

    expect(update.evidenceProgress).toBeCloseTo(0.5 * 0.985)
    expect(update.progress).toBeGreaterThan(update.evidenceProgress)
  })

  test('unlocks only the next forecast interval when an ordinal settles', () => {
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 4_000,
        maximumRunMs: 20_000,
        minimumRunMs: 100,
      },
      generation: 'world:ordinals',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-ordinals',
      startTimeMs: 0,
      tasks: [task('ambient', 0, 4, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const beforeSettlement = run.advance(60_000)
    const firstSettlement = run.update(
      'world:ordinals',
      [task('ambient', 1, 4, false)],
      60_000,
    ).progress
    const approachingSecond = run.project(120_000)
    const secondSettlement = run.update(
      'world:ordinals',
      [task('ambient', 2, 4, false)],
      120_000,
    ).progress

    expect(beforeSettlement).toBeLessThan(0.7 * 0.25 * 0.985)
    expect(firstSettlement).toBeGreaterThan(beforeSettlement)
    expect(approachingSecond).toBeGreaterThan(firstSettlement)
    expect(approachingSecond).toBeLessThan(0.7 * 0.5 * 0.985)
    expect(secondSettlement).toBeGreaterThan(approachingSecond)
  })

  test('keeps rational preview moving after ten learned intervals without crossing a milestone', () => {
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 1_000,
        maximumRunMs: 10_000,
        minimumRunMs: 100,
      },
      generation: 'world:rational-tail',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-rational-tail',
      startTimeMs: 0,
      tasks: [task('ambient', 0, 1, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const afterTenIntervals = run.project(10_000)
    const afterTwentyIntervals = run.project(20_000)

    expect(afterTwentyIntervals).toBeGreaterThan(afterTenIntervals)
    expect(afterTwentyIntervals).toBeLessThan(0.7 * 0.985)
  })

  test('keeps live time moving beyond ten minutes but rejects the oversized timing sample', () => {
    const storage = createMemoryStorage()
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 60_000,
        maximumRunMs: 120_000,
        minimumRunMs: 1_000,
      },
      generation: 'world:long-run',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-long-run',
      startTimeMs: 0,
      storage,
      tasks: [task('ambient', 0, 1, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const afterTenMinutes = run.advance(600_000)
    const afterTwentyMinutes = run.project(1_200_000)
    const ready = run.update('world:long-run', [task('ambient', 1, 1)], 1_200_000)

    expect(afterTwentyMinutes).toBeGreaterThan(afterTenMinutes)
    expect(ready.allReady).toBe(true)
    expect(run.commitSuccess()).toBe(true)
    expect(run.project(1_200_000)).toBe(1)
    expect(storage.entries.size).toBe(0)
  })

  test('does not reuse same-count timing history across catalog signatures', () => {
    const topologyTasks = [task('ambient', 0, 2, false), task('generated', 0, 1, false)]
    const catalogATopology = createLandrushIslandLoadingTaskTopologyKey(topologyTasks, 'catalog:a')
    const catalogBTopology = createLandrushIslandLoadingTaskTopologyKey(topologyTasks, 'catalog:b')
    const profile: LandrushIslandLoadingTimingProfile = {
      samples: [createTimingSample(catalogATopology, 1_000, 4_000)],
      version: LANDRUSH_ISLAND_LOADING_TIMING_PROFILE_VERSION,
    }
    const fallback = {
      expectedRunMs: 7_000,
      maximumRunMs: 20_000,
      minimumRunMs: 100,
    }

    const catalogAForecast = createLandrushIslandLoadingForecast({
      fallback,
      profile,
      tasks: topologyTasks,
      topologySignature: 'catalog:a',
    })
    const catalogBForecast = createLandrushIslandLoadingForecast({
      fallback,
      profile,
      tasks: topologyTasks,
      topologySignature: 'catalog:b',
    })

    expect(catalogATopology).not.toBe(catalogBTopology)
    expect(catalogAForecast.historicalSampleCount).toBe(1)
    expect(catalogAForecast.durationMs).toBe(4_000)
    expect(catalogBForecast.historicalSampleCount).toBe(0)
    expect(catalogBForecast.durationMs).toBe(7_000)
  })

  test('records initially-ready hydration work from the earlier run start', () => {
    const storage = createMemoryStorage()
    const run = createLandrushIslandLoadingTimelineRun({
      generation: 'world:hydrated',
      initialObservationTimeMs: 1_750,
      profileKey: 'hydrated',
      startTimeMs: 1_000,
      storage,
      tasks: [task('scene', 1, 1)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    expect(run.commitSuccess()).toBe(true)
    expect(readLandrushIslandLoadingTimingProfile(storage, 'hydrated').samples[0]).toEqual({
      durationMs: 750,
      tasks: [
        {
          completionOffsetsMs: [750],
          id: 'scene',
          readyOffsetMs: 750,
          total: 1,
        },
      ],
      topologyKey: createLandrushIslandLoadingTaskTopologyKey(
        [task('scene', 1, 1)],
        TEST_TOPOLOGY_SIGNATURE,
      ),
    })
  })

  test('keeps projected progress monotonic and below 100 until success is committed', () => {
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: {
        expectedRunMs: 1_000,
        maximumRunMs: 20_000,
        minimumRunMs: 1_000,
      },
      generation: 'world:1',
      initialObservationTimeMs: 0,
      profileKey: 'zombie',
      startTimeMs: 0,
      tasks: [task('ambient', 0, 1, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })

    const values = [0, 250, 1_000, 4_000].map((nowMs) => run.advance(nowMs))
    expect(values).toEqual([...values].sort((left, right) => left - right))
    expect(values.at(-1)).toBeLessThan(1)
    const ready = run.update('world:1', [task('ambient', 1, 1)], 4_500)
    expect(ready.progress).toBeLessThan(1)
    expect(run.commitSuccess()).toBe(true)
    expect(run.advance(4_500)).toBe(1)
  })

  test('bounds recent successful samples and tolerates unavailable storage', () => {
    const storage = createMemoryStorage()
    for (let index = 1; index <= LANDRUSH_ISLAND_LOADING_TIMING_MAX_SAMPLES + 2; index += 1) {
      const run = createLandrushIslandLoadingTimelineRun({
        generation: `world:${String(index)}`,
        initialObservationTimeMs: 0,
        profileKey: 'day',
        startTimeMs: 0,
        storage,
        tasks: [task('scene', 0, 1, false)],
        topologySignature: TEST_TOPOLOGY_SIGNATURE,
      })
      run.update(`world:${String(index)}`, [task('scene', 1, 1)], index * 100)
      expect(run.commitSuccess()).toBe(true)
    }
    expect(readLandrushIslandLoadingTimingProfile(storage, 'day').samples).toHaveLength(
      LANDRUSH_ISLAND_LOADING_TIMING_MAX_SAMPLES,
    )

    const unavailableStorage: LandrushIslandLoadingTimingStorage = {
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    expect(() => readLandrushIslandLoadingTimingProfile(unavailableStorage, 'zombie')).not.toThrow()
    const run = createLandrushIslandLoadingTimelineRun({
      generation: 'world:safe',
      initialObservationTimeMs: 0,
      profileKey: 'zombie',
      startTimeMs: 0,
      storage: unavailableStorage,
      tasks: [task('scene', 0, 1, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })
    run.update('world:safe', [task('scene', 1, 1)], 1_000)
    expect(() => run.commitSuccess()).not.toThrow()
  })

  test('invalidates only persistence while preserving monotonic live progress', () => {
    const storage = createMemoryStorage()
    const run = createLandrushIslandLoadingTimelineRun({
      generation: 'world:authority',
      initialObservationTimeMs: 0,
      profileKey: 'zombie-authority',
      startTimeMs: 0,
      storage,
      tasks: [task('assets', 0, 2, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })
    const beforeInvalidation = run.update('world:authority', [task('assets', 1, 2, false)], 100)

    run.invalidatePersistence()
    const afterInvalidation = run.update('world:authority', [task('assets', 2, 2)], 300)

    expect(afterInvalidation.stale).toBe(false)
    expect(afterInvalidation.progress).toBeGreaterThanOrEqual(beforeInvalidation.progress)
    expect(run.project(400)).toBeGreaterThanOrEqual(afterInvalidation.progress)
    expect(run.commitSuccess()).toBe(true)
    expect(run.project(400)).toBe(1)
    expect(storage.entries.size).toBe(0)
  })

  test('uses one immutable WAAPI trajectory without per-frame React work', () => {
    let frames: Keyframe[] | PropertyIndexedKeyframes | null = null
    let options: number | KeyframeAnimationOptions | undefined
    let finishListenerCount = 0
    let cancelled = false
    const style = {
      transform: '',
      transformOrigin: '',
      willChange: '',
    }
    const animation = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'finish' && typeof listener === 'function') finishListenerCount += 1
      },
      cancel: () => {
        cancelled = true
      },
    }
    const element = {
      animate: (
        nextFrames: Keyframe[] | PropertyIndexedKeyframes,
        nextOptions?: number | KeyframeAnimationOptions,
      ) => {
        frames = nextFrames
        options = nextOptions
        return animation
      },
      style,
    }

    const returned = animateLandrushIslandLoadingFill(
      element as unknown as HTMLElement,
      0.2,
      0.7,
      10_000,
    )

    expect(returned).toBe(animation)
    expect(frames).toEqual([
      { offset: 0, transform: 'scaleX(0.2)' },
      { offset: 1, transform: 'scaleX(0.7)' },
    ])
    expect(options).toEqual({
      duration: 10_000,
      easing: 'linear',
      fill: 'forwards',
    })
    expect(style.transformOrigin).toBe('left center')
    expect(style.transform).toBe('scaleX(0.2)')
    expect(finishListenerCount).toBe(0)
    expect(cancelled).toBe(false)
    expect(
      resolveLandrushIslandLoadingVisualSegmentProgress(
        {
          durationMs: 500,
          from: 0.2,
          keyframes: [
            { offset: 0, progress: 0.2 },
            { offset: 1, progress: 0.7 },
          ],
          startedAtMs: 1_000,
          to: 0.7,
        },
        1_250,
      ),
    ).toBeCloseTo(0.45)
  })

  test('builds one long linear compositor preview from retained presentation motion', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0 })
    const stage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0,
      estimatedDurationMs: 4_000,
      evidenceProgress: 0.2,
      forecastProgress: 0.8,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)

    const preview = createLandrushIslandLoadingVisualPreview(controller, 1_000)

    expect(preview.durationMs).toBe(LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS)
    expect(preview.keyframes).toEqual([
      { offset: 0, progress: 0 },
      { offset: 1, progress: preview.to },
    ])
    expect(preview.to).toBeLessThanOrEqual(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS)
    expect(
      resolveLandrushIslandLoadingVisualSegmentProgress(
        preview,
        preview.startedAtMs + preview.durationMs / 2,
      ),
    ).toBeGreaterThan(0)
  })

  test('reconciles a milestone jump from the exact compositor position without a visual jump', () => {
    const run = createLandrushIslandLoadingTimelineRun({
      generation: 'world:reconcile',
      initialObservationTimeMs: 0,
      profileKey: 'zombie',
      startTimeMs: 0,
      tasks: [task('assets', 0, 4, false)],
      topologySignature: TEST_TOPOLOGY_SIGNATURE,
    })
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0 })
    const initialStage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0,
      estimatedDurationMs: run.getForecast().durationMs,
      evidenceProgress: 0,
      forecastProgress: run.project(0),
    })
    controller.setConfirmedProgress(initialStage.confirmedProgress, initialStage)
    const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
    const nowMs = 100
    const visualProgress = resolveLandrushIslandLoadingVisualSegmentProgress(preview, nowMs)
    const milestone = run.update('world:reconcile', [task('assets', 2, 4, false)], nowMs)

    expect(milestone.progress).toBeGreaterThan(visualProgress)
    expect(shouldReconcileLandrushIslandLoadingPreview(preview, nowMs, milestone.progress)).toBe(
      true,
    )
    controller.step(nowMs)
    controller.reconcileDisplayedProgress(visualProgress)
    const milestoneStage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: visualProgress,
      estimatedDurationMs: run.getForecast().durationMs - nowMs,
      evidenceProgress: milestone.evidenceProgress,
      forecastProgress: milestone.progress,
    })
    controller.setConfirmedProgress(milestoneStage.confirmedProgress, milestoneStage)
    const reconciled = createLandrushIslandLoadingVisualPreview(controller, nowMs)
    const reconciledProgress = reconciled.keyframes[0]?.progress ?? 0
    expect(reconciledProgress).toBeGreaterThanOrEqual(visualProgress)
    expect(reconciledProgress - visualProgress).toBeLessThan(0.000_1)
    expect(
      resolveLandrushIslandLoadingVisualSegmentProgress(reconciled, nowMs + 1),
    ).toBeGreaterThanOrEqual(visualProgress)
  })

  test('adds a stable document-readiness gate to every browser snapshot', () => {
    const pending = appendLandrushIslandDocumentReadinessTask([task('scene', 0, 1, false)], false)
    const ready = appendLandrushIslandDocumentReadinessTask([task('scene', 1, 1)], true)

    expect(createLandrushIslandLoadingTaskTopologyKey(pending, TEST_TOPOLOGY_SIGNATURE)).toBe(
      createLandrushIslandLoadingTaskTopologyKey(ready, TEST_TOPOLOGY_SIGNATURE),
    )
    expect(
      pending.find((candidate) => candidate.id === LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID),
    ).toEqual(task(LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID, 0, 1, false))
    expect(
      ready.find((candidate) => candidate.id === LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID),
    ).toEqual(task(LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID, 1, 1, true))
  })
})

function createTimingSample(
  topologyKey: string,
  ambientReadyOffsetMs: number,
  generatedReadyOffsetMs: number,
): LandrushIslandLoadingTimingSample {
  return {
    durationMs: generatedReadyOffsetMs,
    tasks: [
      {
        completionOffsetsMs: [ambientReadyOffsetMs / 2, ambientReadyOffsetMs],
        id: 'ambient',
        readyOffsetMs: ambientReadyOffsetMs,
        total: 2,
      },
      {
        completionOffsetsMs: [generatedReadyOffsetMs],
        id: 'generated',
        readyOffsetMs: generatedReadyOffsetMs,
        total: 1,
      },
    ],
    topologyKey,
  }
}
