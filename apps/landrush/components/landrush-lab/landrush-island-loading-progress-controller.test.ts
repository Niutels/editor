import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
  LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
  type LandrushIslandLoadingProgressController,
  type LandrushIslandLoadingProgressMotionSnapshot,
  resolveLandrushIslandLoadingProgressStage,
} from './landrush-island-loading-progress-controller'

const RESPONSE_MS = LANDRUSH_ISLAND_LOADING_RESPONSE_MS
const EPSILON_MS = 0.000_1
const NUMERIC_TOLERANCE = 1e-10

describe('Landrush island loading progress motion', () => {
  test('retargets evidence and completion without changing position, velocity or acceleration', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.02,
      initialVelocityPerSecond: 0.006,
    })
    for (const target of [0.2, 0.45, 0.7, 0.984]) {
      controller.step(73)
      const before = controller.getSnapshot()
      const after = controller.setConfirmedProgress(target)
      expectMotionEqual(after, before)
      expect(after.pulses.at(-1)?.startedAtMs).toBe(after.elapsedMs)
    }
    const before = controller.getSnapshot()
    const after = controller.complete()
    expectMotionEqual(after, before)
    expect(after.targetProgress).toBe(1)
    expect(controller.readyToDismiss()).toBe(false)
  })

  test('matches the independent compact cubic response and its analytic derivatives', () => {
    const controller = createLandrushIslandLoadingProgressController()
    controller.setConfirmedProgress(0.9)
    const source = controller.getSnapshot()
    const knotSeconds = RESPONSE_MS / 3_000
    for (let index = 0; index <= 120; index += 1) {
      const position = index / 40
      const sample = sampleFrom(source, (position * RESPONSE_MS) / 3)
      const terms = [1, -3, 3, -1]
      const positive = terms.map((_, knot) => Math.max(0, position - knot))
      const cdf = terms.reduce((sum, factor, knot) => sum + factor * positive[knot]! ** 3, 0) / 6
      const pdf = terms.reduce((sum, factor, knot) => sum + factor * positive[knot]! ** 2, 0) / 2
      const slope = terms.reduce((sum, factor, knot) => sum + factor * positive[knot]!, 0)
      expect(sample.displayedProgress).toBeCloseTo(0.9 * cdf, 11)
      expect(sample.velocityPerSecond).toBeCloseTo((0.9 * pdf) / knotSeconds, 10)
      expect(sample.accelerationPerSecondSquared).toBeCloseTo((0.9 * slope) / knotSeconds ** 2, 10)
    }
  })

  test('is C2 on both sides of every active spline knot, including settlement', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.03,
      initialVelocityPerSecond: 0.075,
    })
    controller.setConfirmedProgress(0.3)
    controller.step(37)
    controller.setConfirmedProgress(0.55)
    controller.step(41)
    controller.complete()
    const source = controller.getSnapshot()
    const knots = new Set<number>()
    for (const pulse of source.pulses) {
      for (let knot = 0; knot <= 3; knot += 1) {
        const offset = pulse.startedAtMs + (knot * RESPONSE_MS) / 3 - source.elapsedMs
        if (offset > EPSILON_MS) knots.add(offset)
      }
    }
    expect(knots.size).toBeGreaterThan(8)
    for (const offset of knots) {
      const at = sampleFrom(source, offset)
      for (const neighbor of [
        sampleFrom(source, offset - EPSILON_MS),
        sampleFrom(source, offset + EPSILON_MS),
      ]) {
        expect(Math.abs(neighbor.displayedProgress - at.displayedProgress)).toBeLessThan(3.1e-7)
        expect(Math.abs(neighbor.velocityPerSecond - at.velocityPerSecond)).toBeLessThan(1.7e-6)
        expect(
          Math.abs(neighbor.accelerationPerSecondSquared - at.accelerationPerSecondSquared),
        ).toBeLessThan(0.000_02)
      }
    }
    assertAnalyticEnvelope(controller)
  })

  test('preserves exact shell derivatives for both supported inherited rates', () => {
    for (const initialProgress of [0, 0.000_01, 0.05, 0.5]) {
      for (const initialVelocityPerSecond of [0.006, 0.075]) {
        const controller = createLandrushIslandLoadingProgressController({
          initialProgress,
          initialVelocityPerSecond,
        })
        const initial = controller.getSnapshot()
        expect(initial.displayedProgress).toBeCloseTo(initialProgress, 14)
        expect(initial.velocityPerSecond).toBeCloseTo(initialVelocityPerSecond, 14)
        expect(initial.accelerationPerSecondSquared).toBe(0)
        expect(initial.pulses).toHaveLength(1)
        expect(initial.pulses[0]?.startedAtMs).toBe(-RESPONSE_MS / 2)
        controller.step(RESPONSE_MS / 2)
        const stopped = controller.getSnapshot()
        expect(stopped.displayedProgress).toBeCloseTo(
          initialProgress + (initialVelocityPerSecond * (RESPONSE_MS / 1_000)) / 4.5,
          14,
        )
        expect(stopped.velocityPerSecond).toBe(0)
        expect(stopped.accelerationPerSecondSquared).toBe(0)
      }
    }
  })

  test('bounds the exact extrema of all cubic intervals, including inherited motion', () => {
    for (const initialProgress of [0, 0.000_01, 0.1, 0.5, 0.95, 0.98, 0.984]) {
      for (const initialVelocityPerSecond of [0, 0.006, 0.075]) {
        const controller = createLandrushIslandLoadingProgressController({
          initialProgress,
          initialVelocityPerSecond,
        })
        controller.setConfirmedProgress(0.23)
        controller.step(19)
        controller.setConfirmedProgress(0.47)
        controller.step(83)
        controller.setConfirmedProgress(0.81)
        controller.step(29)
        controller.complete()
        assertAnalyticEnvelope(controller)
      }
    }
    expect(LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND).toBeLessThanOrEqual(3)
    expect(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED,
    ).toBeLessThanOrEqual(16)
  })

  test('keeps finite positive increments monotone, and ignores stale targets', () => {
    for (const amount of [Number.EPSILON, 1e-8, 0.001, 0.2, 0.984]) {
      const controller = createLandrushIslandLoadingProgressController()
      controller.setConfirmedProgress(amount)
      let previous = 0
      for (let elapsed = 10; elapsed < RESPONSE_MS; elapsed += 10) {
        controller.step(10)
        const current = controller.getSnapshot()
        expect(Number.isFinite(current.displayedProgress)).toBe(true)
        expect(current.displayedProgress).toBeGreaterThanOrEqual(previous)
        expect(current.velocityPerSecond).toBeGreaterThan(0)
        previous = current.displayedProgress
      }
      controller.step(10)
      expect(controller.getSnapshot().displayedProgress).toBe(amount)
      const settled = controller.getSnapshot()
      controller.setConfirmedProgress(amount / 2)
      controller.setConfirmedProgress(Number.NaN)
      expect(controller.getSnapshot().pulses).toHaveLength(0)
      expectMotionEqual(controller.getSnapshot(), settled)
      expect(controller.getSnapshot().targetProgress).toBe(amount)
    }
  })

  test('remains monotone under deterministic irregular retargets and frame intervals', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialVelocityPerSecond: 0.075,
    })
    let state = 42
    let target = 0
    let previous = 0
    for (let index = 0; index < 150; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
      target = Math.min(0.984, target + (state % 400) / 20_000)
      const before = controller.getSnapshot()
      controller.setConfirmedProgress(target)
      expectMotionEqual(controller.getSnapshot(), before)
      controller.step(1 + (state % 50))
      const current = controller.getSnapshot()
      expect(current.displayedProgress).toBeGreaterThanOrEqual(previous - NUMERIC_TOLERANCE)
      expect(current.velocityPerSecond).toBeGreaterThanOrEqual(-NUMERIC_TOLERANCE)
      expect(current.velocityPerSecond).toBeLessThanOrEqual(3 + NUMERIC_TOLERANCE)
      expect(Math.abs(current.accelerationPerSecondSquared)).toBeLessThanOrEqual(16)
      previous = current.displayedProgress
    }
    controller.complete()
    assertAnalyticEnvelope(controller)
    controller.step(RESPONSE_MS)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
  })

  test('never spends inherited or forecast motion above the pending 98.4 percent ceiling', () => {
    for (const initialProgress of [0, 0.9, 0.97, 0.98, 0.983, 0.984]) {
      for (const initialVelocityPerSecond of [0, 0.006, 0.075]) {
        const controller = createLandrushIslandLoadingProgressController({
          initialProgress,
          initialVelocityPerSecond,
        })
        expect(controller.getSnapshot().targetProgress).toBeLessThanOrEqual(
          LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
        )
        controller.setConfirmedProgress(1, { ceiling: 1 })
        for (const sample of controller.createMotionPreview(120_000).samples) {
          expect(sample.progress).toBeLessThanOrEqual(
            LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
          )
        }
        controller.step(120_000)
        expect(controller.getSnapshot().displayedProgress).toBe(
          LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
        )
        expect(controller.readyToDismiss()).toBe(false)
      }
    }
  })

  test('reaches exact visible completion within 800ms even from a nearly empty bar', () => {
    expect(RESPONSE_MS).toBe(800)
    for (const initialProgress of [0, 0.000_001, 0.05, 0.25, 0.8, 0.98, 0.984]) {
      for (const initialVelocityPerSecond of [0, 0.006, 0.075]) {
        const controller = createLandrushIslandLoadingProgressController({
          initialProgress,
          initialVelocityPerSecond,
        })
        const initial = controller.getSnapshot()
        controller.complete()
        expectMotionEqual(controller.getSnapshot(), initial)
        expect(controller.readyToDismiss()).toBe(false)
        controller.step(RESPONSE_MS - 1)
        expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
        expect(controller.readyToDismiss()).toBe(false)
        controller.step(1)
        expect(controller.getSnapshot()).toMatchObject({
          accelerationPerSecondSquared: 0,
          displayedProgress: 1,
          pulses: [],
          velocityPerSecond: 0,
        })
        expect(controller.readyToDismiss()).toBe(true)
      }
    }
  })

  test('repeated completion requests do not restart or extend the completion deadline', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.05 })
    controller.setConfirmedProgress(0.4)
    controller.step(125)
    controller.complete()
    const completeAt = controller.getSnapshot().elapsedMs
    for (const delta of [0, 100, 199, 400, 100]) {
      controller.step(delta)
      const before = controller.getSnapshot()
      expect(controller.complete()).toEqual(before)
    }
    expect(controller.getSnapshot().elapsedMs).toBe(completeAt + RESPONSE_MS - 1)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(1)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(controller.readyToDismiss()).toBe(true)
    expect(controller.complete().pulses).toHaveLength(0)
  })

  test('cancelling completion revokes dismissal without changing the motion trajectory', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.2 })
    controller.complete()
    controller.step(250)
    const before = controller.getSnapshot()
    controller.cancelCompletion()
    expectMotionEqual(controller.getSnapshot(), before)
    expect(controller.getSnapshot().pulses).toEqual(before.pulses)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(RESPONSE_MS)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(controller.readyToDismiss()).toBe(false)
    controller.complete()
    expect(controller.readyToDismiss()).toBe(true)
    expect(controller.getSnapshot().pulses).toHaveLength(0)
  })

  test('restores the entire active pulse plan and independently continues through remount', () => {
    const source = createLandrushIslandLoadingProgressController({
      initialProgress: 0.02,
      initialVelocityPerSecond: 0.006,
    })
    source.setConfirmedProgress(0.2)
    source.step(71)
    source.setConfirmedProgress(0.48)
    source.step(103)
    source.complete()
    source.step(19)
    const retained = source.getSnapshot()
    const restored = createLandrushIslandLoadingProgressController()
    restored.restoreMotionSnapshot(retained)
    expect(retained.pulses.length).toBeGreaterThanOrEqual(4)
    expect(restored.getSnapshot()).toEqual(retained)
    expect(restored.createMotionPreview()).toEqual(source.createMotionPreview())
    for (const delta of [13, 47, 109, 73, 277, 281, 5_000]) {
      expect(restored.step(delta)).toBe(source.step(delta))
      expect(restored.getSnapshot()).toEqual(source.getSnapshot())
      expect(restored.readyToDismiss()).toBe(source.readyToDismiss())
    }
    expect(retained.pulses.length).toBeGreaterThanOrEqual(4)
    expect(retained.elapsedMs).toBe(193)
    expect(restored.readyToDismiss()).toBe(true)
  })

  test('sanitizes negative and non-finite public input without poisoning the motion', () => {
    const invalidValues = [-1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
    for (const initialProgress of [...invalidValues, 2]) {
      for (const initialVelocityPerSecond of [...invalidValues, 10]) {
        const controller = createLandrushIslandLoadingProgressController({
          initialProgress,
          initialVelocityPerSecond,
        })
        controller.setConfirmedProgress(0.5)
        const before = controller.getSnapshot()
        for (const delta of invalidValues) {
          controller.step(delta)
          expect(controller.getSnapshot()).toEqual(before)
        }
        controller.setConfirmedProgress(Number.NaN, {
          ceiling: Number.NaN,
          estimatedDurationMs: Number.NaN,
        })
        controller.step(37)
        const current = controller.getSnapshot()
        expect(Number.isFinite(current.displayedProgress)).toBe(true)
        expect(current.displayedProgress).toBeGreaterThanOrEqual(0)
        expect(current.displayedProgress).toBeLessThanOrEqual(1)
        expect(Number.isFinite(current.velocityPerSecond)).toBe(true)
        expect(Number.isFinite(current.accelerationPerSecondSquared)).toBe(true)
        expect(current.stageDurationMs).toBe(0)
      }
    }
  })

  test('keeps default previews compact and immutable while exactly matching live samples', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialVelocityPerSecond: 0.006,
    })
    for (let ordinal = 1; ordinal <= 100; ordinal += 1) {
      controller.setConfirmedProgress(ordinal * 0.009)
      controller.step(50)
    }
    const before = controller.getSnapshot()
    const preview = controller.createMotionPreview()
    expect(controller.getSnapshot()).toEqual(before)
    expect(before.pulses.length).toBeLessThanOrEqual(RESPONSE_MS / 50)
    expect(preview.durationMs).toBe(120_000)
    expect(preview.samples.length).toBeLessThanOrEqual(4 * before.pulses.length + 2)
    expect(preview.samples.length).toBeLessThan(70)
    expect(preview.samples[0]?.offset).toBe(0)
    expect(preview.samples.at(-1)?.offset).toBe(1)
    for (const sample of preview.samples) {
      const live = sampleFrom(before, sample.offset * preview.durationMs)
      expect(sample.progress).toBeCloseTo(live.displayedProgress, 12)
      expect(sample.velocityPerSecond).toBeCloseTo(live.velocityPerSecond, 12)
      expect(sample.accelerationPerSecondSquared).toBeCloseTo(live.accelerationPerSecondSquared, 11)
    }
    assertAnalyticEnvelope(controller)
  })

  test('optional sampled previews add exact knots without changing the analytic plan', () => {
    const controller = createLandrushIslandLoadingProgressController()
    controller.setConfirmedProgress(0.6)
    controller.step(17)
    const before = controller.getSnapshot()
    const preview = controller.createMotionPreview(1_111, 37)
    const offsets = preview.samples.map((sample) => sample.offset * preview.durationMs)
    expect(offsets.some((offset) => Math.abs(offset - (RESPONSE_MS / 3 - 17)) < 1e-9)).toBe(true)
    expect(offsets.some((offset) => Math.abs(offset - (RESPONSE_MS - 17)) < 1e-9)).toBe(true)
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index]!).toBeGreaterThan(offsets[index - 1]!)
    }
    for (const sample of preview.samples) {
      const live = sampleFrom(before, sample.offset * preview.durationMs)
      expect(sample.progress).toBeCloseTo(live.displayedProgress, 12)
      expect(sample.velocityPerSecond).toBeCloseTo(live.velocityPerSecond, 11)
      expect(sample.accelerationPerSecondSquared).toBeCloseTo(live.accelerationPerSecondSquared, 10)
    }
    expect(controller.getSnapshot()).toEqual(before)
    expect(controller.createMotionPreview(-1).durationMs).toBe(1)
    expect(controller.createMotionPreview(Number.NaN).durationMs).toBe(120_000)
    expect(controller.createMotionPreview(Number.POSITIVE_INFINITY).durationMs).toBe(120_000)
    expect(controller.createMotionPreview(999_999).durationMs).toBe(120_000)
  })
})

describe('Landrush readiness and forecast tracking', () => {
  test('uses real readiness while permitting at most eight points of additional forecast lead', () => {
    for (const evidence of [0, 0.01, 0.2, 0.5, 0.9, 0.98, 1]) {
      for (const forecast of [0, evidence, evidence + 0.02, 1, Number.NaN]) {
        const stage = resolveLandrushIslandLoadingProgressStage({
          displayedProgress: Math.max(0, evidence - 0.1),
          estimatedDurationMs: 4_000,
          evidenceProgress: evidence,
          forecastProgress: forecast,
        })
        expect(stage.confirmedProgress).toBeGreaterThanOrEqual(Math.min(0.984, evidence))
        expect(stage.confirmedProgress).toBeLessThanOrEqual(
          evidence + LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD,
        )
        expect(stage.ceiling).toBeLessThanOrEqual(evidence + 0.08)
        expect(stage.confirmedProgress).toBeLessThanOrEqual(0.984)
      }
    }
    expect(
      resolveLandrushIslandLoadingProgressStage({
        displayedProgress: Number.NaN,
        estimatedDurationMs: -1,
        evidenceProgress: Number.NaN,
        forecastProgress: Number.NaN,
      }),
    ).toEqual({ ceiling: 0.08, confirmedProgress: 0, estimatedDurationMs: 0 })
  })

  test('does not invent additional work completion after an optimistic forecast settles', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.15 })
    const stage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0.15,
      estimatedDurationMs: 4_000,
      evidenceProgress: 0.15,
      forecastProgress: 1,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    controller.step(120_000)
    expect(controller.getSnapshot().displayedProgress).toBeCloseTo(0.23, 14)
    expect(controller.getSnapshot().velocityPerSecond).toBe(0)
    expect(controller.readyToDismiss()).toBe(false)
  })

  test('tracks real four-to-five-second progress within ten points with modest forecast compensation', () => {
    for (const durationMs of [4_000, 4_500, 5_000]) {
      for (const sampleIntervalMs of [5, 25, 50]) {
        expect(measureRampError(durationMs, sampleIntervalMs, 0.025)).toBeLessThanOrEqual(0.1)
      }
    }
  })

  test('tracks four-and-a-half-to-five-second evidence-only ramps within ten points', () => {
    for (const durationMs of [4_500, 5_000]) {
      expect(measureRampError(durationMs, 5, 0)).toBeLessThanOrEqual(0.1)
    }
  })

  test('preserves continuity instead of pretending a large Boolean readiness jump is accurate immediately', () => {
    const controller = createLandrushIslandLoadingProgressController()
    const stage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0,
      estimatedDurationMs: 100,
      evidenceProgress: 0.8,
      forecastProgress: 0.8,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    expect(controller.getSnapshot().displayedProgress).toBe(0)
    expect(0.8 - controller.getSnapshot().displayedProgress).toBeGreaterThan(0.1)
    controller.step(RESPONSE_MS)
    expect(controller.getSnapshot().displayedProgress).toBe(0.8)
    expect(controller.readyToDismiss()).toBe(false)
  })
})

function expectMotionEqual(
  actual: LandrushIslandLoadingProgressMotionSnapshot,
  expected: LandrushIslandLoadingProgressMotionSnapshot,
) {
  expect(actual.displayedProgress).toBe(expected.displayedProgress)
  expect(actual.velocityPerSecond).toBe(expected.velocityPerSecond)
  expect(actual.accelerationPerSecondSquared).toBe(expected.accelerationPerSecondSquared)
}

function sampleFrom(snapshot: LandrushIslandLoadingProgressMotionSnapshot, offsetMs: number) {
  const copy = createLandrushIslandLoadingProgressController()
  copy.restoreMotionSnapshot(snapshot)
  copy.step(offsetMs)
  return copy.getSnapshot()
}

function assertAnalyticEnvelope(controller: LandrushIslandLoadingProgressController) {
  const source = controller.getSnapshot()
  const preview = controller.createMotionPreview(RESPONSE_MS + 100)
  const samples = [...preview.samples]
  for (let index = 1; index < preview.samples.length; index += 1) {
    const from = preview.samples[index - 1]!
    const to = preview.samples[index]!
    const durationSeconds = ((to.offset - from.offset) * preview.durationMs) / 1_000
    const jerk =
      (to.accelerationPerSecondSquared - from.accelerationPerSecondSquared) / durationSeconds
    expect(to.velocityPerSecond).toBeCloseTo(
      from.velocityPerSecond +
        from.accelerationPerSecondSquared * durationSeconds +
        0.5 * jerk * durationSeconds ** 2,
      9,
    )
    expect(to.progress).toBeCloseTo(
      from.progress +
        from.velocityPerSecond * durationSeconds +
        0.5 * from.accelerationPerSecondSquared * durationSeconds ** 2 +
        (jerk * durationSeconds ** 3) / 6,
      10,
    )
    const fractions = [0.2, 0.5, 0.8]
    if (jerk !== 0) {
      const zeroAccelerationFraction = -from.accelerationPerSecondSquared / (jerk * durationSeconds)
      if (zeroAccelerationFraction > 0 && zeroAccelerationFraction < 1) {
        fractions.push(zeroAccelerationFraction)
      }
    }
    for (const fraction of fractions) {
      const offset = from.offset + (to.offset - from.offset) * fraction
      const live = sampleFrom(source, offset * preview.durationMs)
      const elapsedSeconds = durationSeconds * fraction
      expect(live.displayedProgress).toBeCloseTo(
        from.progress +
          from.velocityPerSecond * elapsedSeconds +
          0.5 * from.accelerationPerSecondSquared * elapsedSeconds ** 2 +
          (jerk * elapsedSeconds ** 3) / 6,
        10,
      )
      expect(live.velocityPerSecond).toBeCloseTo(
        from.velocityPerSecond +
          from.accelerationPerSecondSquared * elapsedSeconds +
          0.5 * jerk * elapsedSeconds ** 2,
        9,
      )
      expect(live.accelerationPerSecondSquared).toBeCloseTo(
        from.accelerationPerSecondSquared + jerk * elapsedSeconds,
        9,
      )
      samples.push({
        accelerationPerSecondSquared: live.accelerationPerSecondSquared,
        offset,
        progress: live.displayedProgress,
        velocityPerSecond: live.velocityPerSecond,
      })
    }
  }
  samples.sort((left, right) => left.offset - right.offset)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!
    expect(Number.isFinite(sample.progress)).toBe(true)
    expect(sample.progress).toBeGreaterThanOrEqual(0)
    expect(sample.progress).toBeLessThanOrEqual(1)
    expect(sample.velocityPerSecond).toBeGreaterThanOrEqual(-NUMERIC_TOLERANCE)
    expect(sample.velocityPerSecond).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + NUMERIC_TOLERANCE,
    )
    expect(Math.abs(sample.accelerationPerSecondSquared)).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED + NUMERIC_TOLERANCE,
    )
    if (index > 0) {
      expect(sample.progress).toBeGreaterThanOrEqual(
        samples[index - 1]!.progress - NUMERIC_TOLERANCE,
      )
    }
  }
}

function measureRampError(durationMs: number, sampleIntervalMs: number, forecastLead: number) {
  const controller = createLandrushIslandLoadingProgressController({
    initialVelocityPerSecond: 0.006,
  })
  let maximumError = 0
  for (let elapsedMs = 0; elapsedMs <= durationMs + RESPONSE_MS; elapsedMs += sampleIntervalMs) {
    if (elapsedMs > 0) controller.step(sampleIntervalMs)
    const actualProgress = Math.min(1, elapsedMs / durationMs)
    if (elapsedMs === durationMs) controller.complete()
    else if (elapsedMs < durationMs && elapsedMs % 50 === 0) {
      const stage = resolveLandrushIslandLoadingProgressStage({
        displayedProgress: controller.getSnapshot().displayedProgress,
        estimatedDurationMs: durationMs - elapsedMs,
        evidenceProgress: actualProgress,
        forecastProgress: actualProgress + forecastLead,
      })
      controller.setConfirmedProgress(stage.confirmedProgress, stage)
    }
    maximumError = Math.max(
      maximumError,
      Math.abs(controller.getSnapshot().displayedProgress - actualProgress),
    )
  }
  expect(controller.getSnapshot().displayedProgress).toBe(1)
  expect(controller.readyToDismiss()).toBe(true)
  return maximumError
}
