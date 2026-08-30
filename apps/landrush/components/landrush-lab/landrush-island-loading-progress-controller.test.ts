import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
  LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS,
  LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
  LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
  LANDRUSH_ISLAND_LOADING_SPECULATIVE_INTERVAL_MS,
  LANDRUSH_ISLAND_LOADING_SPECULATIVE_RESPONSE_MS,
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
    const durationMs = source.pulses[0]!.durationMs
    const knotSeconds = durationMs / 3_000
    for (let index = 0; index <= 120; index += 1) {
      const position = index / 40
      const sample = sampleFrom(source, (position * durationMs) / 3)
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
        const offset = pulse.startedAtMs + (knot * pulse.durationMs) / 3 - source.elapsedMs
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
        ).toBeLessThan(0.000_4)
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
        expect(initial.pulses).toHaveLength(0)
        expect(initial.inheritedMotion).toEqual({
          holdUntilMs: 0,
          velocityPerSecond: initialVelocityPerSecond,
        })
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
      const durationMs = controller.getSnapshot().pulses[0]!.durationMs
      let previous = 0
      for (let elapsed = 10; elapsed < durationMs; elapsed += 10) {
        controller.step(10)
        const current = controller.getSnapshot()
        expect(Number.isFinite(current.displayedProgress)).toBe(true)
        expect(current.displayedProgress).toBeGreaterThanOrEqual(previous)
        expect(current.velocityPerSecond).toBeGreaterThan(0)
        previous = current.displayedProgress
      }
      controller.step(durationMs - controller.getSnapshot().elapsedMs)
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

  test('reaches exact visible completion within its bounded deadline even from a nearly empty bar', () => {
    expect(RESPONSE_MS).toBeLessThanOrEqual(850)
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

  test('spends the terminal smoothing before 80 percent and keeps the final fifth brief', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.6,
      maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    })
    controller.complete()
    controller.step(600)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(0.8)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(50)
    expect(controller.getSnapshot().displayedProgress).toBeGreaterThan(0.8)
    controller.step(RESPONSE_MS - 650 - 1)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(1)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(controller.readyToDismiss()).toBe(true)
  })

  test('holds exact 80 percent until the final 350ms of the fixed completion response', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
      maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    })
    const completed = controller.complete()
    const terminal = completed.pulses.find((pulse) => pulse.kind === 'completion')!

    expect(terminal.startedAtMs).toBeGreaterThanOrEqual(RESPONSE_MS - 350)
    expect(terminal.durationMs).toBeLessThanOrEqual(350)
    controller.step(RESPONSE_MS - 350)
    expect(controller.getSnapshot().displayedProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    controller.step(terminal.startedAtMs - controller.getSnapshot().elapsedMs)
    expect(controller.getSnapshot().displayedProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    controller.step(1)
    expect(controller.getSnapshot().displayedProgress).toBeGreaterThan(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    controller.step(RESPONSE_MS - controller.getSnapshot().elapsedMs - 1)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(1)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(controller.readyToDismiss()).toBe(true)
  })

  test('repeated completion requests do not restart or extend the completion deadline', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.05 })
    controller.setConfirmedProgress(0.4)
    controller.step(125)
    controller.complete()
    const completeAt = controller.getSnapshot().elapsedMs
    for (const delta of [0, 100, 199, 400, RESPONSE_MS - 700]) {
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

  test('cancelling completion revokes terminal motion while preserving the pending trajectory', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.2,
      maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    })
    controller.complete()
    controller.step(250)
    const before = controller.getSnapshot()
    controller.cancelCompletion()
    expectMotionEqual(controller.getSnapshot(), before)
    expect(controller.getSnapshot().pulses.some((pulse) => pulse.kind === 'completion')).toBe(false)
    expect(
      controller.getSnapshot().pulses.some((pulse) => pulse.kind === 'completion-pending'),
    ).toBe(true)
    expect(controller.getSnapshot().targetProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(RESPONSE_MS)
    expect(controller.getSnapshot().displayedProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    expect(controller.readyToDismiss()).toBe(false)
    controller.complete()
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(RESPONSE_MS)
    expect(controller.readyToDismiss()).toBe(true)
  })

  test('withdrawal after the terminal leg begins freezes below 100 without a visual reset', () => {
    for (const initialProgress of [0.2, LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING]) {
      const controller = createLandrushIslandLoadingProgressController({
        initialProgress,
        maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
      })
      controller.complete()
      controller.step(RESPONSE_MS - 100)
      const before = controller.getSnapshot()
      expect(before.displayedProgress).toBeGreaterThan(
        LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
      )
      expect(before.displayedProgress).toBeLessThan(1)

      controller.cancelCompletion()
      const withdrawn = controller.getSnapshot()
      expect(withdrawn.displayedProgress).toBeCloseTo(before.displayedProgress, 14)
      expect(withdrawn.targetProgress).toBeCloseTo(before.displayedProgress, 14)
      expect(withdrawn.pulses).toHaveLength(0)
      expect(withdrawn.inheritedMotion).toBeNull()
      expect(controller.readyToDismiss()).toBe(false)
      controller.step(RESPONSE_MS)
      expect(controller.getSnapshot().displayedProgress).toBeCloseTo(before.displayedProgress, 14)
      expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
    }
  })

  test('caps a 120-second shell takeover and its inherited tail at 80 percent', () => {
    const controller = createLandrushIslandLoadingProgressController({
      inheritedVelocityHoldMs: 120_000,
      initialProgress: 0.08,
      initialVelocityPerSecond: 0.006,
      maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    })

    expect(controller.getSnapshot().targetProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    for (const sample of controller.createMotionPreview(120_000).samples) {
      expect(sample.progress).toBeLessThanOrEqual(
        LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
      )
    }
    controller.step(120_000 + RESPONSE_MS)
    expect(controller.getSnapshot().displayedProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    expect(controller.readyToDismiss()).toBe(false)
  })

  test('restores completion ownership on remount and revokes it when readiness withdraws', () => {
    const source = createLandrushIslandLoadingProgressController({
      initialProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
      maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    })
    source.complete()
    source.step(250)
    const snapshot = source.getSnapshot()
    const restored = createLandrushIslandLoadingProgressController({
      maximumPendingProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    })
    restored.restoreMotionSnapshot(snapshot)

    expect(restored.getSnapshot().completionRequested).toBe(true)
    restored.cancelCompletion()
    restored.step(RESPONSE_MS)
    expect(restored.getSnapshot().completionRequested).toBe(false)
    expect(restored.getSnapshot().displayedProgress).toBe(
      LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    )
    expect(restored.readyToDismiss()).toBe(false)
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
    expect(retained.pulses.length).toBeGreaterThanOrEqual(3)
    expect(retained.inheritedMotion).not.toBeNull()
    expect(restored.getSnapshot()).toEqual(retained)
    expect(restored.createMotionPreview()).toEqual(source.createMotionPreview())
    for (const delta of [13, 47, 109, 73, 277, 281, 5_000]) {
      expect(restored.step(delta)).toBe(source.step(delta))
      expect(restored.getSnapshot()).toEqual(source.getSnapshot())
      expect(restored.readyToDismiss()).toBe(source.readyToDismiss())
    }
    expect(retained.pulses.length).toBeGreaterThanOrEqual(3)
    expect(retained.inheritedMotion).not.toBeNull()
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
    const pulseDurationMs = before.pulses[0]!.durationMs
    expect(offsets.some((offset) => Math.abs(offset - (pulseDurationMs / 3 - 17)) < 1e-9)).toBe(
      true,
    )
    expect(offsets.some((offset) => Math.abs(offset - (pulseDurationMs - 17)) < 1e-9)).toBe(true)
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
  test('separates real evidence from the bounded 9.9-point speculative reservoir', () => {
    for (const evidence of [0, 0.01, 0.2, 0.5, 0.9, 0.98, 1]) {
      const stage = resolveLandrushIslandLoadingProgressStage({
        displayedProgress: Math.max(0, evidence - 0.1),
        estimatedDurationMs: 18_000,
        evidenceProgress: evidence,
      })
      expect(stage.confirmedProgress).toBe(Math.min(0.984, evidence))
      expect(stage.ceiling).toBe(
        Math.min(0.984, evidence + LANDRUSH_ISLAND_LOADING_MAXIMUM_FORECAST_LEAD),
      )
      expect(stage.ceiling).toBeLessThanOrEqual(evidence + 0.1)
    }
    expect(
      resolveLandrushIslandLoadingProgressStage({
        displayedProgress: Number.NaN,
        estimatedDurationMs: -1,
        evidenceProgress: Number.NaN,
      }),
    ).toEqual({ ceiling: 0.099, confirmedProgress: 0, estimatedDurationMs: 0 })
    expect(
      resolveLandrushIslandLoadingProgressStage({
        displayedProgress: 0.9,
        estimatedDurationMs: 1,
        evidenceProgress: 0.1,
      }).confirmedProgress,
    ).toBe(0.1)
    const inherited = createLandrushIslandLoadingProgressController({ initialProgress: 0.9 })
    expect(inherited.getSnapshot().confirmedProgress).toBe(0)
    inherited.setConfirmedProgress(0.1, { ceiling: 0.199 })
    expect(inherited.getSnapshot().confirmedProgress).toBe(0.1)
    expect(inherited.getSnapshot().displayedProgress).toBe(0.9)
  })

  test('keeps pending motion inside its reservoir without inventing additional confirmed work', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.15 })
    const stage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0.15,
      estimatedDurationMs: 4_000,
      evidenceProgress: 0.15,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    controller.step(120_000)
    expect(controller.getSnapshot().confirmedProgress).toBe(0.15)
    expect(controller.getSnapshot().displayedProgress).toBeGreaterThan(0.24)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(0.249)
    expect(controller.getSnapshot().velocityPerSecond).toBeGreaterThan(0)
    expect(controller.readyToDismiss()).toBe(false)
  })

  test('tracks real four-to-five-second progress within ten points with bounded readiness lookahead', () => {
    for (const durationMs of [4_000, 4_500, 5_000]) {
      for (const sampleIntervalMs of [5, 25, 50]) {
        expect(measureRampError(durationMs, sampleIntervalMs, true)).toBeLessThanOrEqual(0.1)
      }
    }
  })

  test('tracks four-and-a-half-to-five-second evidence-only ramps within ten points', () => {
    for (const durationMs of [4_500, 5_000]) {
      expect(measureRampError(durationMs, 5, false)).toBeLessThanOrEqual(0.1)
    }
  })

  test('preserves continuity instead of pretending a large Boolean readiness jump is accurate immediately', () => {
    const controller = createLandrushIslandLoadingProgressController()
    const stage = resolveLandrushIslandLoadingProgressStage({
      displayedProgress: 0,
      estimatedDurationMs: 100,
      evidenceProgress: 0.8,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    expect(controller.getSnapshot().displayedProgress).toBe(0)
    expect(0.8 - controller.getSnapshot().displayedProgress).toBeGreaterThan(0.1)
    controller.step(RESPONSE_MS)
    expect(controller.getSnapshot().displayedProgress).toBeGreaterThan(0.8)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(0.899)
    expect(controller.getSnapshot().velocityPerSecond).toBeGreaterThan(0)
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
  const lastEndMs = Math.max(
    source.elapsedMs + RESPONSE_MS,
    ...source.pulses.map((pulse) => pulse.startedAtMs + pulse.durationMs),
    source.inheritedMotion ? source.inheritedMotion.holdUntilMs + RESPONSE_MS / 2 : 0,
  )
  const preview = controller.createMotionPreview(lastEndMs - source.elapsedMs + 100)
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

function measureRampError(durationMs: number, sampleIntervalMs: number, lookahead: boolean) {
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
      })
      controller.setConfirmedProgress(stage.confirmedProgress, {
        ...stage,
        ceiling: lookahead ? stage.ceiling : stage.confirmedProgress,
      })
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

describe('Landrush causal-clock motion and completion reserve', () => {
  test('preserves the D662.2/S1029.2 linear-prefix oracle before delayed evidence begins', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.00353864,
      initialVelocityPerSecond: 0.006,
      inheritedVelocityHoldMs: 367,
    })
    controller.setConfirmedProgress(0.4, { startDelayMs: 367 })
    const state = controller.getSnapshot()
    expect(state.inheritedMotion).toEqual({ holdUntilMs: 367, velocityPerSecond: 0.006 })
    expect(state.pulses[0]?.startedAtMs).toBe(367)
    const at1009 = sampleFrom(state, 1009 - 662.2)
    expect(at1009.displayedProgress).toBeCloseTo(0.00561944, 14)
    expect(at1009.velocityPerSecond).toBe(0.006)
    expect(at1009.accelerationPerSecondSquared).toBe(0)
    const atRequest = sampleFrom(state, 367)
    expect(atRequest.displayedProgress).toBeCloseTo(0.00574064, 14)
    expect(atRequest.velocityPerSecond).toBe(0.006)
    expect(atRequest.accelerationPerSecondSquared).toBe(0)
    expect(
      controller
        .createMotionPreview()
        .samples.some((sample) => Math.abs(sample.offset * 120_000 - 367) < 1e-9),
    ).toBe(true)
    assertAnalyticEnvelope(controller)
  })

  test('preserves the prefix and the future pulse plan across a remount before real handoff', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.08,
      initialVelocityPerSecond: 0.006,
      inheritedVelocityHoldMs: 367,
    })
    controller.setConfirmedProgress(0.3, { startDelayMs: 367 })
    controller.step(100)
    const snapshot = controller.getSnapshot()
    const copy = createLandrushIslandLoadingProgressController()
    copy.restoreMotionSnapshot(snapshot)
    expect(copy.getSnapshot()).toEqual(snapshot)
    expect(copy.createMotionPreview()).toEqual(controller.createMotionPreview())
    for (const duration of [70, 190, 7, 23, 79, 133, 349, 271]) {
      copy.step(duration)
      controller.step(duration)
      expect(copy.getSnapshot()).toEqual(controller.getSnapshot())
    }
    expect(snapshot.inheritedMotion?.holdUntilMs).toBe(367)
    expect(snapshot.pulses[0]?.startedAtMs).toBe(367)
  })

  test('keeps delayed work entirely out of the already presented trajectory', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.08 })
    controller.setConfirmedProgress(0.2)
    controller.step(70)
    const before = controller.getSnapshot()
    controller.setConfirmedProgress(0.7, { startDelayMs: 143 })
    const after = controller.getSnapshot()
    expectMotionEqual(after, before)
    expect(after.pulses.at(-1)?.startedAtMs).toBe(213)
    for (const offset of [0, 13, 75, 142.9, 143]) {
      expectMotionEqual(sampleFrom(after, offset), sampleFrom(before, offset))
    }
    expect(sampleFrom(after, 160).displayedProgress).toBeGreaterThan(
      sampleFrom(before, 160).displayedProgress,
    )
    assertAnalyticEnvelope(controller)
  })

  test('is C2 at delayed pulse starts and at the retained-linear-to-seeded-tail join', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.08,
      initialVelocityPerSecond: 0.075,
      inheritedVelocityHoldMs: 367,
    })
    controller.setConfirmedProgress(0.35, { startDelayMs: 367 })
    controller.setConfirmedProgress(0.64, { startDelayMs: 412 })
    const state = controller.getSnapshot()
    const preview = controller.createMotionPreview()
    for (const sample of preview.samples) {
      const offset = sample.offset * preview.durationMs
      if (!(offset > EPSILON_MS && offset < 2_000)) continue
      const at = sampleFrom(state, offset)
      for (const neighbor of [
        sampleFrom(state, offset - EPSILON_MS),
        sampleFrom(state, offset + EPSILON_MS),
      ]) {
        expect(Math.abs(neighbor.displayedProgress - at.displayedProgress)).toBeLessThan(3.1e-7)
        expect(Math.abs(neighbor.velocityPerSecond - at.velocityPerSecond)).toBeLessThan(1.7e-6)
        expect(
          Math.abs(neighbor.accelerationPerSecondSquared - at.accelerationPerSecondSquared),
        ).toBeLessThan(0.000_4)
      }
    }
    assertAnalyticEnvelope(controller)
  })

  test('completes within the fixed response measured from the actual delayed request', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.00353864,
      initialVelocityPerSecond: 0.006,
      inheritedVelocityHoldMs: 367,
    })
    controller.setConfirmedProgress(0.5, { startDelayMs: 367 })
    const before = controller.getSnapshot()
    controller.complete(367)
    const complete = controller.getSnapshot()
    expectMotionEqual(complete, before)
    expect(complete.completionStartedAtMs).toBe(367)
    expectMotionEqual(sampleFrom(complete, 367), sampleFrom(before, 367))
    controller.step(367 + RESPONSE_MS - 1)
    expect(controller.readyToDismiss()).toBe(false)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
    const pending = controller.getSnapshot()
    expect(controller.complete(5_000)).toEqual(pending)
    controller.step(1)
    expect(controller.readyToDismiss()).toBe(true)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
  })

  test('does not dismiss an already full bar before the actual delayed completion observation', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 1 })
    controller.complete(150)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(149)
    expect(controller.readyToDismiss()).toBe(false)
    controller.step(1)
    expect(controller.readyToDismiss()).toBe(true)
  })

  test('admits every later completion while preserving all exact future derivative bounds', () => {
    for (const initialVelocityPerSecond of [0, 0.006, 0.075]) {
      const controller = createLandrushIslandLoadingProgressController({
        initialProgress: 0.08,
        initialVelocityPerSecond,
        inheritedVelocityHoldMs: 90,
      })
      for (const [target, delay, elapsed] of [
        [0.19, 90, 33],
        [0.36, 80, 79],
        [0.55, 20, 61],
        [0.73, 45, 107],
        [0.92, 15, 53],
      ]) {
        controller.setConfirmedProgress(target!, { startDelayMs: delay! })
        const plan = controller.getSnapshot()
        for (const futureDelay of [0, 37, 133, 319, 691, 1_400]) {
          const readyDelay = Math.max(futureDelay, plan.lastRequestAtMs - plan.elapsedMs)
          const copy = createLandrushIslandLoadingProgressController()
          copy.restoreMotionSnapshot(plan)
          copy.complete(readyDelay)
          expectMotionEqual(copy.getSnapshot(), plan)
          assertAnalyticEnvelope(copy)
          copy.step(readyDelay + RESPONSE_MS)
          expect(copy.getSnapshot().displayedProgress).toBe(1)
          expect(copy.readyToDismiss()).toBe(true)
        }
        controller.step(elapsed!)
      }
    }
  })

  test('uses bounded mass-preserving response durations for every real increment', () => {
    const small = createLandrushIslandLoadingProgressController()
    small.setConfirmedProgress(0.01)
    expect(small.getSnapshot().pulses[0]?.durationMs).toBe(
      LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS,
    )
    const large = createLandrushIslandLoadingProgressController()
    large.setConfirmedProgress(0.984)
    expect(large.getSnapshot().pulses[0]!.durationMs).toBe(
      LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS,
    )
    expect(large.getSnapshot().pulses[0]!.durationMs).toBeLessThanOrEqual(RESPONSE_MS)
    assertAnalyticEnvelope(small)
    assertAnalyticEnvelope(large)
    for (let ordinal = 1; ordinal <= 64; ordinal += 1) {
      small.setConfirmedProgress(Math.min(0.984, ordinal / 64))
    }
    expect(small.getSnapshot().pulses.length).toBeLessThan(64)
    for (const pulse of small.getSnapshot().pulses) {
      expect(pulse.durationMs).toBeGreaterThanOrEqual(LANDRUSH_ISLAND_LOADING_MINIMUM_RESPONSE_MS)
      expect(pulse.durationMs).toBeLessThanOrEqual(RESPONSE_MS)
    }
    assertAnalyticEnvelope(small)
    small.complete()
    assertAnalyticEnvelope(small)
  })

  test('caps a long inherited prefix against all of its reserved forward motion', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.98,
      initialVelocityPerSecond: 0.075,
      inheritedVelocityHoldMs: 60_000,
    })
    const snapshot = controller.getSnapshot()
    expect(snapshot.velocityPerSecond).toBeCloseTo(0.004 / (60 + RESPONSE_MS / 4_500), 14)
    expect(snapshot.targetProgress).toBeLessThanOrEqual(0.984)
    for (const sample of controller.createMotionPreview().samples) {
      expect(sample.progress).toBeLessThanOrEqual(0.984)
    }
    controller.complete(60_000)
    assertAnalyticEnvelope(controller)
    controller.step(60_000 + RESPONSE_MS)
    expect(controller.readyToDismiss()).toBe(true)
  })

  test('sanitizes invalid delay and hold inputs without modifying retained history', () => {
    for (const value of [-1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      const controller = createLandrushIslandLoadingProgressController({
        initialProgress: 0.08,
        initialVelocityPerSecond: 0.006,
        inheritedVelocityHoldMs: value,
      })
      controller.setConfirmedProgress(0.2, { startDelayMs: value })
      const state = controller.getSnapshot()
      expect(state.inheritedMotion?.holdUntilMs).toBe(0)
      expect(state.pulses[0]?.startedAtMs).toBe(0)
      controller.complete(value)
      expect(controller.getSnapshot().completionStartedAtMs).toBe(0)
      controller.step(RESPONSE_MS)
      expect(controller.readyToDismiss()).toBe(true)
    }
  })
})

describe('Landrush autonomous pending motion', () => {
  const stage = resolveLandrushIslandLoadingProgressStage({
    displayedProgress: 0.08,
    estimatedDurationMs: 0,
    evidenceProgress: (11 / 13) * LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
    maximumProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING,
  })

  test('uses aligned overlapping cubic pulses throughout a complete no-JavaScript lease', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.08,
      initialVelocityPerSecond: 0.006,
    })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    const source = controller.getSnapshot()
    const speculative = source.pulses.filter((pulse) => pulse.kind === 'speculative')
    expect(speculative.length).toBeGreaterThan(400)
    expect(source.speculativeThroughMs).toBeGreaterThan(120_000)
    expect(source.targetProgress).toBeLessThan(stage.ceiling)
    for (let index = 0; index < speculative.length; index += 1) {
      const pulse = speculative[index]!
      expect(pulse.amount).toBeGreaterThan(0)
      expect(pulse.durationMs).toBe(LANDRUSH_ISLAND_LOADING_SPECULATIVE_RESPONSE_MS)
      if (index > 0) {
        expect(pulse.startedAtMs - speculative[index - 1]!.startedAtMs).toBe(
          LANDRUSH_ISLAND_LOADING_SPECULATIVE_INTERVAL_MS,
        )
      }
    }
    const preview = controller.createMotionPreview()
    expect(preview.samples.length).toBeLessThan(460)
    for (const sample of preview.samples) {
      if (sample.offset > 0) expect(sample.velocityPerSecond).toBeGreaterThan(0)
      expect(sample.progress).toBeLessThan(stage.ceiling)
      const live = sampleFrom(source, sample.offset * preview.durationMs)
      expect(sample.progress).toBeCloseTo(live.displayedProgress, 12)
      expect(sample.velocityPerSecond).toBeCloseTo(live.velocityPerSecond, 12)
      expect(sample.accelerationPerSecondSquared).toBeCloseTo(live.accelerationPerSecondSquared, 11)
    }
    assertAnalyticEnvelope(controller)
    expect(controller.getSnapshot()).toEqual(source)
  })

  test('renews ten minutes of pending motion without exhausting its reservoir or rewriting history', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.08 })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    let previousProgress = controller.getSnapshot().displayedProgress
    let previousRevision = controller.getSnapshot().motionRevision
    let renewals = 0
    for (let elapsedMs = 50; elapsedMs <= 600_000; elapsedMs += 50) {
      controller.step(50)
      const before = controller.getSnapshot()
      const after = controller.setConfirmedProgress(stage.confirmedProgress, stage)
      expectMotionEqual(after, before)
      expect(after.confirmedProgress).toBe(stage.confirmedProgress)
      expect(after.displayedProgress).toBeGreaterThanOrEqual(previousProgress)
      expect(after.displayedProgress).toBeLessThan(stage.ceiling)
      expect(after.velocityPerSecond).toBeGreaterThan(0)
      expect(after.velocityPerSecond).toBeLessThan(3)
      expect(Math.abs(after.accelerationPerSecondSquared)).toBeLessThan(16)
      expect(after.speculativeThroughMs! - after.elapsedMs).toBeGreaterThanOrEqual(60_000)
      if (after.motionRevision !== previousRevision) renewals += 1
      previousProgress = after.displayedProgress
      previousRevision = after.motionRevision
    }
    expect(renewals).toBeGreaterThanOrEqual(8)
    expect(controller.getSnapshot().pulses.length).toBeLessThan(450)
    expect(controller.getSnapshot().targetProgress).toBeLessThan(stage.ceiling)
    expect(controller.readyToDismiss()).toBe(false)
  })

  test('preserves the existing trajectory until a causal retarget and cancels only future speculation', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.08 })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    controller.step(18_017)
    const before = controller.getSnapshot()
    controller.setConfirmedProgress(0.88, { ceiling: 0.979, startDelayMs: 367 })
    const after = controller.getSnapshot()
    expectMotionEqual(after, before)
    expect(after.motionRevision).toBeGreaterThan(before.motionRevision)
    for (const pulse of before.pulses.filter((pulse) => pulse.startedAtMs < 18_384)) {
      expect(after.pulses).toContainEqual(pulse)
    }
    for (const offset of [0, 17, 149, 300, 366.999, 367]) {
      expectMotionEqual(sampleFrom(after, offset), sampleFrom(before, offset))
    }
    assertAnalyticEnvelope(controller)
  })

  test('finishes an arbitrarily long pending stage within 850ms while preserving delayed p/v/a', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.08 })
    controller.setConfirmedProgress(stage.confirmedProgress, stage)
    controller.step(37_019)
    const before = controller.getSnapshot()
    const requestAtMs = before.elapsedMs + 367
    controller.complete(367)
    const completed = controller.getSnapshot()
    expectMotionEqual(completed, before)
    expect(completed.pulses.some((pulse) => pulse.kind === 'completion')).toBe(true)
    expect(
      completed.pulses.some(
        (pulse) => pulse.kind === 'speculative' && pulse.startedAtMs >= requestAtMs,
      ),
    ).toBe(false)
    for (const offset of [0, 73, 274, 366.99, 367]) {
      expectMotionEqual(sampleFrom(completed, offset), sampleFrom(before, offset))
    }
    for (const pulse of completed.pulses) {
      expect(pulse.startedAtMs + pulse.durationMs).toBeLessThanOrEqual(requestAtMs + RESPONSE_MS)
    }
    assertAnalyticEnvelope(controller)
    controller.step(367 + RESPONSE_MS - 1)
    expect(controller.readyToDismiss()).toBe(false)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
    controller.step(1)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(controller.readyToDismiss()).toBe(true)
  })

  test('restores the speculative lease and revision through remount and further renewal', () => {
    const source = createLandrushIslandLoadingProgressController({
      initialProgress: 0.08,
      initialVelocityPerSecond: 0.006,
      inheritedVelocityHoldMs: 367,
    })
    source.setConfirmedProgress(stage.confirmedProgress, { ...stage, startDelayMs: 367 })
    source.step(119)
    const snapshot = source.getSnapshot()
    const copy = createLandrushIslandLoadingProgressController()
    copy.restoreMotionSnapshot(snapshot)
    expect(copy.getSnapshot()).toEqual(snapshot)
    expect(copy.createMotionPreview()).toEqual(source.createMotionPreview())
    for (const elapsedMs of [53, 195, 29_633, 31_077, 40_000, 20_000, 50_000]) {
      source.step(elapsedMs)
      copy.step(elapsedMs)
      source.setConfirmedProgress(stage.confirmedProgress, stage)
      copy.setConfirmedProgress(stage.confirmedProgress, stage)
      expect(copy.getSnapshot()).toEqual(source.getSnapshot())
      expect(copy.createMotionPreview()).toEqual(source.createMotionPreview())
    }
    expect(source.getSnapshot().motionRevision).toBeGreaterThan(snapshot.motionRevision)
    copy.complete()
    copy.cancelCompletion()
    copy.step(RESPONSE_MS)
    expect(copy.readyToDismiss()).toBe(false)
    copy.complete()
    copy.step(RESPONSE_MS)
    expect(copy.readyToDismiss()).toBe(true)
  })
})
