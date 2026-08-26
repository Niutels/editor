import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
  resolveLandrushIslandLoadingProgressStage,
} from './landrush-island-loading-progress-controller'

describe('Landrush island loading progress controller', () => {
  test('keeps a sparse 80 percent stage strictly moving toward reserved headroom', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.8 })
    controller.setConfirmedProgress(0.8, {
      ceiling: LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
      estimatedDurationMs: 8_000,
    })

    const preview = controller.createMotionPreview(15_000, 100)

    expect(
      preview.samples.every(
        (sample, index) => index === 0 || sample.progress > preview.samples[index - 1]!.progress,
      ),
    ).toBe(true)
    expect(preview.samples.at(-1)?.progress).toBeGreaterThan(0.9)
    expect(preview.samples.at(-1)?.progress).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
    )
  })

  test('never crosses 98.4 percent before real completion', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.8 })
    controller.setConfirmedProgress(0.999, { ceiling: 1, estimatedDurationMs: 250 })

    for (let elapsedMs = 0; elapsedMs < 120_000; elapsedMs += 100) controller.step(100)

    expect(controller.getSnapshot().displayedProgress).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
    )
    expect(controller.readyToDismiss()).toBe(false)
  })

  test('starts a compositor preview at the exact adopted shell position', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.4375 })
    controller.setConfirmedProgress(0.8, {
      ceiling: LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
      estimatedDurationMs: 8_000,
    })

    expect(controller.createMotionPreview(1_000, 100).samples[0]).toEqual({
      offset: 0,
      progress: 0.4375,
    })
  })

  test('clamps inherited motion to the rendered speed ceiling', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.3,
      initialVelocityPerSecond: 0.18,
    })

    expect(controller.getSnapshot().velocityPerSecond).toBe(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
    )

    controller.setConfirmedProgress(0.9, { ceiling: 0.984, estimatedDurationMs: 250 })
    const samples = controller.createMotionPreview(2_000, 1_000 / 30).samples
    const intervalRates = samples.slice(1).map((sample, index) => {
      const previous = samples[index]!
      return (sample.progress - previous.progress) / (1_000 / 30 / 1_000)
    })

    expect(Math.max(...intervalRates)).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
    )
  })

  test('never reconciles a stale compositor sample backward', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.3 })
    controller.setConfirmedProgress(0.7, { ceiling: 0.8, estimatedDurationMs: 2_000 })
    controller.step(500)
    controller.reconcileDisplayedProgress(0.5)
    const reconciled = controller.getSnapshot().displayedProgress

    controller.reconcileDisplayedProgress(0.2)

    expect(controller.getSnapshot().displayedProgress).toBe(reconciled)
  })

  test('adopts only a forward rendered position without changing its motion derivatives', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.3,
      initialVelocityPerSecond: 0.02,
    })
    controller.setConfirmedProgress(0.8, { ceiling: 0.9, estimatedDurationMs: 4_000 })
    controller.step(500)
    const before = controller.getSnapshot()

    controller.adoptRenderedProgress(0.2)
    expect(controller.getSnapshot().displayedProgress).toBe(before.displayedProgress)

    controller.adoptRenderedProgress(0.5)
    const adopted = controller.getSnapshot()

    expect(adopted.displayedProgress).toBe(0.5)
    expect(adopted.velocityPerSecond).toBe(before.velocityPerSecond)
    expect(adopted.accelerationPerSecondSquared).toBe(before.accelerationPerSecondSquared)
  })

  test('restores the full retained trajectory state across a runtime remount', () => {
    const source = createLandrushIslandLoadingProgressController({
      initialProgress: 0.14,
      initialVelocityPerSecond: 0.006,
    })
    source.complete()
    source.step(1_000)
    const retained = source.getSnapshot()
    const restored = createLandrushIslandLoadingProgressController()

    restored.restoreMotionSnapshot(retained)

    expect(restored.getSnapshot()).toEqual(retained)
  })

  test('preserves motion derivatives and bounds them across a milestone retarget', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.08 })
    controller.setConfirmedProgress(0.2, { ceiling: 0.24, estimatedDurationMs: 1_600 })
    for (let frame = 0; frame < 20; frame += 1) controller.step(16.67)
    const before = controller.getSnapshot()

    controller.setConfirmedProgress(0.9, { ceiling: 0.984, estimatedDurationMs: 8_000 })
    const retargeted = controller.getSnapshot()
    controller.step(16.67)
    const after = controller.getSnapshot()

    expect(retargeted.velocityPerSecond).toBe(before.velocityPerSecond)
    expect(retargeted.accelerationPerSecondSquared).toBe(before.accelerationPerSecondSquared)
    expect(after.velocityPerSecond).toBeLessThanOrEqual(0.180_001)
    expect(
      Math.abs(after.accelerationPerSecondSquared - retargeted.accelerationPerSecondSquared),
    ).toBeLessThanOrEqual(1.1 * 0.016_67 + 0.000_001)
    expect(after.displayedProgress).toBeGreaterThan(retargeted.displayedProgress)
  })

  test('does not convert batched readiness evidence into a first-half speed burst', () => {
    const beforeBatch = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0.1,
      estimatedDurationMs: 12_000,
      evidenceProgress: 0.1,
      forecastProgress: 0.2,
    })
    const afterBatch = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0.1,
      estimatedDurationMs: 12_000,
      evidenceProgress: 0.9,
      forecastProgress: 0.95,
    })

    expect(afterBatch.confirmedProgress).toBe(beforeBatch.confirmedProgress)
    expect(afterBatch.ceiling).toBe(beforeBatch.ceiling)
  })

  test('uses a bounded final runway instead of sprinting from a low hard-refresh value', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.14,
      initialVelocityPerSecond: 0.006,
    })

    controller.complete()
    controller.step(1_664)
    const afterObservedBurstWindow = controller.getSnapshot()

    expect(afterObservedBurstWindow.displayedProgress).toBeGreaterThan(0.14)
    expect(afterObservedBurstWindow.displayedProgress).toBeLessThan(0.22)
    expect(afterObservedBurstWindow.velocityPerSecond).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
    )
    expect(Math.abs(afterObservedBurstWindow.accelerationPerSecondSquared)).toBeLessThanOrEqual(
      0.060_001,
    )
  })

  test('keeps completion velocity, acceleration, and jerk continuous at display cadence', () => {
    const frameMs = 1_000 / 60
    const frameSeconds = frameMs / 1_000
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.14,
      initialVelocityPerSecond: 0.006,
    })
    controller.complete()
    let previous = controller.getSnapshot()

    for (let frame = 0; frame < 180; frame += 1) {
      controller.step(frameMs)
      const current = controller.getSnapshot()
      expect(current.displayedProgress).toBeGreaterThan(previous.displayedProgress)
      expect(current.velocityPerSecond).toBeLessThanOrEqual(
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
      )
      expect(Math.abs(current.accelerationPerSecondSquared)).toBeLessThanOrEqual(0.060_001)
      expect(
        Math.abs(current.accelerationPerSecondSquared - previous.accelerationPerSecondSquared),
      ).toBeLessThanOrEqual(0.12 * frameSeconds + 0.000_001)
      previous = current
    }
  })

  test('hard-caps every sampled final-runway interval at the rendered speed limit', () => {
    const sampleIntervalMs = 1_000 / 30
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.14,
      initialVelocityPerSecond: 0.006,
    })
    controller.complete()

    const samples = controller.createMotionPreview(30_000, sampleIntervalMs).samples
    const intervalRates = samples.slice(1).map((sample, index) => {
      const previous = samples[index]!
      return (sample.progress - previous.progress) / (sampleIntervalMs / 1_000)
    })

    expect(Math.min(...intervalRates)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...intervalRates)).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
    )
  })

  test('keeps the full visible completion runway smooth through fade eligibility', () => {
    const sampleIntervalMs = 1_000 / 30
    const sampleIntervalSeconds = sampleIntervalMs / 1_000
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.14,
      initialVelocityPerSecond: 0.006,
    })
    controller.complete()
    const progress = [controller.getSnapshot().displayedProgress]

    while (!controller.readyToDismiss() && progress.length < 2_000) {
      controller.step(sampleIntervalMs)
      progress.push(controller.getSnapshot().displayedProgress)
    }

    const velocities = progress
      .slice(1)
      .map((value, index) => (value - progress[index]!) / sampleIntervalSeconds)
    const accelerations = velocities
      .slice(1)
      .map((value, index) => (value - velocities[index]!) / sampleIntervalSeconds)
    const jerks = accelerations
      .slice(1)
      .map((value, index) => (value - accelerations[index]!) / sampleIntervalSeconds)

    expect(controller.readyToDismiss()).toBe(true)
    expect(Math.max(...velocities)).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
    )
    expect(Math.max(...accelerations.map(Math.abs))).toBeLessThanOrEqual(0.080_001)
    expect(Math.max(...jerks.map(Math.abs))).toBeLessThanOrEqual(0.120_001)
  })

  test('sampled compositor motion matches live controller integration', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.28 })
    controller.setConfirmedProgress(0.8, { ceiling: 0.984, estimatedDurationMs: 8_000 })

    const preview = controller.createMotionPreview(3_000, 100)
    controller.step(3_000)

    expect(preview.samples.at(-1)?.progress).toBeCloseTo(
      controller.getSnapshot().displayedProgress,
      10,
    )
  })

  test('keeps a visibly positive rate throughout a pending startup interval', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.82,
      initialVelocityPerSecond: 0.001,
    })
    const stage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0.82,
      estimatedDurationMs: -1,
      evidenceProgress: 1,
      forecastProgress: 1,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)

    expect(stage.confirmedProgress).toBe(0.82)
    expect(stage.ceiling).toBe(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS)
    expect(stage.estimatedDurationMs).toBe(10_000)
    let previous = controller.getSnapshot().displayedProgress
    for (let elapsedMs = 0; elapsedMs < 8_000; elapsedMs += 100) {
      controller.step(100)
      const current = controller.getSnapshot().displayedProgress
      expect(current).toBeGreaterThan(previous)
      expect(current).toBeLessThanOrEqual(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS)
      previous = current
    }
  })

  test('keeps the inherited runtime runway moving beyond 50 percent before it can expire', () => {
    const sampleIntervalMs = 1_000 / 30
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0,
      initialVelocityPerSecond: 0.006,
    })
    controller.setConfirmedProgress(0, {
      ceiling: LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
      estimatedDurationMs: (LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS / 0.006) * 1_000,
    })

    const preview = controller.createMotionPreview(120_000, sampleIntervalMs)
    const rates = preview.samples.slice(1).map((sample, index) => {
      const previous = preview.samples[index]!
      return (sample.progress - previous.progress) / (sampleIntervalMs / 1_000)
    })

    expect(preview.durationMs).toBe(120_000)
    expect(preview.samples.at(-1)?.progress).toBeGreaterThan(0.5)
    expect(Math.min(...rates)).toBeGreaterThan(0)
    expect(Math.max(...rates)).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
    )
  })

  test('samples a positive trajectory with bounded acceleration and jerk at display cadence', () => {
    const frameSeconds = 1 / 60
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.08,
      initialVelocityPerSecond: 0.006,
    })
    controller.setConfirmedProgress(0.6, { ceiling: 0.82, estimatedDurationMs: 10_000 })

    const progress = controller
      .createMotionPreview(5_000, 1_000 / 60)
      .samples.map((sample) => sample.progress)
    const velocities = progress
      .slice(1)
      .map((value, index) => (value - progress[index]!) / frameSeconds)
    const accelerations = velocities
      .slice(1)
      .map((value, index) => (value - velocities[index]!) / frameSeconds)
    const jerks = accelerations
      .slice(1)
      .map((value, index) => (value - accelerations[index]!) / frameSeconds)

    expect(Math.min(...velocities)).toBeGreaterThan(0)
    expect(Math.max(...accelerations.map(Math.abs))).toBeLessThanOrEqual(0.25)
    expect(Math.max(...jerks.map(Math.abs))).toBeLessThanOrEqual(1.100_001)
  })
})
