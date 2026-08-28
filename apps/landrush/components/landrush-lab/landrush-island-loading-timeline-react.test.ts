import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
  LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
} from './landrush-island-loading-progress-controller'
import { LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS } from './landrush-island-loading-shell-bootstrap'
import {
  animateLandrushIslandLoadingHandoffFade,
  animateLandrushIslandLoadingPercentPreview,
  animateLandrushIslandLoadingPreview,
  createLandrushIslandLoadingCompletionGate,
  createLandrushIslandLoadingPercentKeyframes,
  createLandrushIslandLoadingProgressPresentation,
  createLandrushIslandLoadingVisualKeyframes,
  createLandrushIslandLoadingVisualPreview,
  LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS,
  LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS,
  LANDRUSH_ISLAND_LOADING_MINIMUM_PRESENTATION_FPS,
  resolveLandrushIslandLoadingObservationDelay,
  resolveLandrushIslandLoadingReducedMotion,
  resolveLandrushIslandLoadingTransformProgress,
  resolveLandrushIslandLoadingVisualSegmentProgress,
  restoreLandrushIslandLoadingHandoffOverlay,
} from './landrush-island-loading-timeline-react'

describe('Landrush island loading presentation handoff', () => {
  test('requires a later foreground frame after the fill actually renders 100%', () => {
    const gate = createLandrushIslandLoadingCompletionGate()
    const observe = (frameTimeMs: number, renderedProgress: number, ready = true, visible = true) =>
      gate.observeFrame({ frameTimeMs, ready, renderedProgress, visible })

    expect(observe(0, 0.05)).toBe(false)
    expect(observe(50, 0.99999)).toBe(false)
    expect(observe(100, 1)).toBe(false)
    expect(gate.hasPresentedCompletion()).toBe(false)
    expect(observe(100, 1)).toBe(false)
    expect(observe(150, 1)).toBe(true)
    expect(gate.hasPresentedCompletion()).toBe(true)

    expect(observe(200, 1, false)).toBe(false)
    expect(observe(250, 1)).toBe(false)
    expect(observe(300, 1, true, false)).toBe(false)
    expect(observe(350, 1)).toBe(false)
    expect(observe(400, 1)).toBe(true)
    gate.reset()
    expect(gate.hasPresentedCompletion()).toBe(false)
    expect(observe(Number.NaN, 1)).toBe(false)
  })

  test('reaches and presents 100% within one second even when readiness arrives at 5%', () => {
    for (const initialProgress of [0, 0.05, 0.9, 0.984]) {
      const controller = createLandrushIslandLoadingProgressController({ initialProgress })
      const gate = createLandrushIslandLoadingCompletionGate()
      controller.complete()
      const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
      let firstCompleteMs: number | null = null
      let handoffMs: number | null = null
      for (let nowMs = 0; nowMs <= LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS; nowMs += 50) {
        if (nowMs > 0) controller.step(50)
        const renderedProgress = resolveLandrushIslandLoadingVisualSegmentProgress(preview, nowMs)
        if (controller.readyToDismiss()) firstCompleteMs ??= nowMs
        const presented = gate.observeFrame({
          frameTimeMs: nowMs,
          ready: controller.readyToDismiss(),
          renderedProgress,
          visible: true,
        })
        if (presented) {
          handoffMs = nowMs
          break
        }
      }
      expect(firstCompleteMs).toBe(LANDRUSH_ISLAND_LOADING_RESPONSE_MS)
      expect(handoffMs).toBe(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 50)
      expect(handoffMs!).toBeLessThanOrEqual(LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS)
    }
  })

  test('lets the readiness-guarded owner finish a compositor fade without hiding directly', () => {
    let frames: Keyframe[] | PropertyIndexedKeyframes | null = null
    let options: KeyframeAnimationOptions | number | undefined
    let finish: (() => void) | undefined
    let finished = 0
    const style = createStyle()
    const animation = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'finish' && typeof listener === 'function') {
          finish = () => listener(new Event('finish'))
        }
      },
      cancel() {},
    }
    const element = {
      animate: (
        nextFrames: Keyframe[] | PropertyIndexedKeyframes,
        nextOptions?: KeyframeAnimationOptions | number,
      ) => {
        frames = nextFrames
        options = nextOptions
        return animation
      },
      style,
    }
    const returned = animateLandrushIslandLoadingHandoffFade(
      element as unknown as HTMLElement,
      100,
      () => {
        finished += 1
      },
    )
    expect(returned).toBe(animation)
    expect(frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(options).toEqual({ duration: 100, easing: 'ease-out', fill: 'forwards' })
    expect(finished).toBe(0)
    finish?.()
    expect(finished).toBe(1)
    expect(style.opacity).toBe('1')
  })

  test('keeps fallback hiding under the same readiness guard', () => {
    for (const animate of [
      undefined,
      () => {
        throw new Error('WAAPI unavailable')
      },
    ]) {
      let finished = 0
      const style = createStyle()
      expect(
        animateLandrushIslandLoadingHandoffFade(
          { animate, style } as unknown as HTMLElement,
          100,
          () => {
            finished += 1
          },
        ),
      ).toBeNull()
      expect(finished).toBe(1)
      expect(style.opacity).toBe('1')
      expect(style.willChange).toBe('')
    }
  })

  test('restores a revoked fade but never resurrects a terminally handed-off shell', () => {
    const attributes = new Map([
      ['aria-hidden', 'true'],
      ['hidden', ''],
    ])
    const style = createStyle()
    style.opacity = '0'
    style.visibility = 'hidden'
    const element = {
      removeAttribute: (name: string) => {
        attributes.delete(name)
      },
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value)
      },
      style,
    } as unknown as HTMLElement
    restoreLandrushIslandLoadingHandoffOverlay(element, true)
    expect(style.opacity).toBe('0')
    expect(attributes.has('hidden')).toBe(true)
    restoreLandrushIslandLoadingHandoffOverlay(element)
    expect(style.opacity).toBe('1')
    expect(style.visibility).toBe('')
    expect(attributes.get('aria-hidden')).toBe('false')
    expect(attributes.has('hidden')).toBe(false)
  })

  test('adopts the exact shell compositor scale instead of an integer percentage', () => {
    expect(resolveLandrushIslandLoadingTransformProgress('matrix(0.3712, 0, 0, 1, 0, 0)')).toBe(
      0.3712,
    )
    expect(
      resolveLandrushIslandLoadingTransformProgress(
        'matrix3d(0.62, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
      ),
    ).toBe(0.62)
    expect(resolveLandrushIslandLoadingTransformProgress('scaleX(0.81)')).toBe(0.81)
    expect(resolveLandrushIslandLoadingTransformProgress('scaleX(-0.1)')).toBe(0)
    expect(resolveLandrushIslandLoadingTransformProgress('none')).toBe(0)
    expect(resolveLandrushIslandLoadingTransformProgress('matrix(NaN, 0, 0, 1, 0, 0)')).toBe(0)
  })

  test('does not backdate arriving evidence into a stale document frame, including remount', () => {
    const frameTimeMs = 662.2
    const observationTimeMs = 1029.2
    const startDelayMs = resolveLandrushIslandLoadingObservationDelay(
      observationTimeMs,
      frameTimeMs,
    )
    expect(startDelayMs).toBeCloseTo(367, 12)
    expect(resolveLandrushIslandLoadingObservationDelay(100, 110)).toBe(0)
    expect(resolveLandrushIslandLoadingObservationDelay(Number.NaN, 110)).toBe(0)
    expect(resolveLandrushIslandLoadingObservationDelay(100, Number.POSITIVE_INFINITY)).toBe(0)

    const controller = createLandrushIslandLoadingProgressController({
      inheritedVelocityHoldMs: startDelayMs,
      initialProgress: 0.00353864,
      initialVelocityPerSecond: 0.006,
    })
    controller.setConfirmedProgress(0.1885, { startDelayMs })
    const preview = createLandrushIslandLoadingVisualPreview(controller, frameTimeMs)
    const frames = createLandrushIslandLoadingVisualKeyframes(preview)
    for (const [timeMs, progress] of [
      [frameTimeMs, 0.00353864],
      [1009, 0.00561944],
      [observationTimeMs, 0.00574064],
    ]) {
      const rendered = evaluateCompositorCurve(frames, preview.durationMs, timeMs! - frameTimeMs)
      expect(rendered.progress).toBeCloseTo(progress!, 11)
      expect(rendered.velocity).toBeCloseTo(0.006, 11)
      expect(rendered.acceleration).toBeCloseTo(0, 9)
    }

    controller.step(100)
    const restored = createLandrushIslandLoadingProgressController()
    restored.restoreMotionSnapshot(controller.getSnapshot())
    const remounted = createLandrushIslandLoadingVisualPreview(restored, frameTimeMs + 100)
    const remountedFrames = createLandrushIslandLoadingVisualKeyframes(remounted)
    for (let elapsedMs = 100; elapsedMs <= 1300; elapsedMs += 5) {
      const originalMotion = evaluateCompositorCurve(frames, preview.durationMs, elapsedMs)
      const remountedMotion = evaluateCompositorCurve(
        remountedFrames,
        remounted.durationMs,
        elapsedMs - 100,
      )
      expect(remountedMotion.progress).toBeCloseTo(originalMotion.progress, 10)
      expect(remountedMotion.velocity).toBeCloseTo(originalMotion.velocity, 9)
      expect(remountedMotion.acceleration).toBeCloseTo(originalMotion.acceleration, 7)
    }
  })

  test('uses exact cubic compositor pieces, not linear samples that break velocity continuity', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.2,
      initialVelocityPerSecond: 0.006,
    })
    controller.setConfirmedProgress(0.4)
    controller.step(125)
    controller.setConfirmedProgress(0.7)
    controller.step(165)
    controller.complete()
    const before = controller.getSnapshot()
    const preview = createLandrushIslandLoadingVisualPreview(controller, 7_000)
    const frames = createLandrushIslandLoadingVisualKeyframes(preview)

    expect(controller.getSnapshot()).toEqual(before)
    expect(preview.from).toBe(before.displayedProgress)
    expect(preview.keyframes.length).toBeLessThan(20)
    for (let elapsedMs = 0; elapsedMs <= 900; elapsedMs += 3) {
      if (elapsedMs > 0) controller.step(3)
      const expected = controller.getSnapshot().displayedProgress
      expect(
        resolveLandrushIslandLoadingVisualSegmentProgress(preview, 7_000 + elapsedMs),
      ).toBeCloseTo(expected, 11)
      expect(evaluateCompositorCurve(frames, preview.durationMs, elapsedMs).progress).toBeCloseTo(
        expected,
        11,
      )
    }
    for (let index = 1; index < frames.length - 1; index += 1) {
      const left = evaluateCompositorPiece(frames, preview.durationMs, index - 1, 1)
      const right = evaluateCompositorPiece(frames, preview.durationMs, index, 0)
      expect(left.progress).toBeCloseTo(right.progress, 11)
      expect(left.velocity).toBeCloseTo(right.velocity, 9)
      expect(left.acceleration).toBeCloseTo(right.acceleration, 7)
    }
  })

  test('preserves position, velocity, and acceleration when new progress retargets a running curve', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.05 })
    controller.setConfirmedProgress(0.6)
    const original = createLandrushIslandLoadingVisualPreview(controller, 0)
    controller.step(350)
    const before = controller.getSnapshot()
    controller.complete()
    const replacement = createLandrushIslandLoadingVisualPreview(controller, 350)
    const oldMotion = evaluateCompositorCurve(
      createLandrushIslandLoadingVisualKeyframes(original),
      original.durationMs,
      350,
    )
    const newMotion = evaluateCompositorCurve(
      createLandrushIslandLoadingVisualKeyframes(replacement),
      replacement.durationMs,
      0,
    )

    expect(newMotion.progress).toBeCloseTo(oldMotion.progress, 12)
    expect(newMotion.velocity).toBeCloseTo(oldMotion.velocity, 10)
    expect(newMotion.acceleration).toBeCloseTo(oldMotion.acceleration, 8)
    expect(replacement.from).toBe(before.displayedProgress)
    expect(replacement.to).toBe(1)
  })

  test('bounds the actual compositor polynomial through the worst-case completion', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0,
      initialVelocityPerSecond: 0.075,
    })
    controller.complete()
    const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
    const frames = createLandrushIslandLoadingVisualKeyframes(preview)
    for (let nowMs = 0; nowMs <= 850; nowMs += 1) {
      const motion = evaluateCompositorCurve(frames, preview.durationMs, nowMs)
      expect(motion.progress).toBeGreaterThanOrEqual(-1e-10)
      expect(motion.progress).toBeLessThanOrEqual(1 + 1e-10)
      expect(motion.velocity).toBeGreaterThanOrEqual(-1e-10)
      expect(motion.velocity).toBeLessThanOrEqual(
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
      )
      expect(Math.abs(motion.acceleration)).toBeLessThanOrEqual(
        LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_ACCELERATION_PER_SECOND_SQUARED,
      )
    }
  })

  test('keeps the compositor lease compact and stops at evidence instead of drifting for minutes', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.2 })
    controller.setConfirmedProgress(0.8)
    const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
    expect(LANDRUSH_ISLAND_LOADING_MINIMUM_PRESENTATION_FPS).toBe(20)
    expect(LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS).toBe(50)
    expect(LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS).toBe(
      LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
    )
    expect(preview.durationMs).toBe(LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS)
    expect(preview.keyframes).toHaveLength(5)
    expect(preview.to).toBe(0.8)
    expect(
      resolveLandrushIslandLoadingVisualSegmentProgress(
        preview,
        LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
      ),
    ).toBeCloseTo(0.8, 12)
    expect(resolveLandrushIslandLoadingVisualSegmentProgress(preview, 120_000)).toBe(0.8)
  })

  test('moves the visible integer at the exact cubic fill thresholds on the same clock', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.05 })
    controller.complete()
    const preview = createLandrushIslandLoadingVisualPreview(controller, 2_000)
    const frames = createLandrushIslandLoadingPercentKeyframes(preview)
    const hundred = frames.find((frame) => frame.transform === 'translate3d(0, -100rem, 0)')!

    for (let percent = 6; percent < 100; percent += 1) {
      const frame = frames.find(
        (candidate) => candidate.transform === `translate3d(0, -${percent}rem, 0)`,
      )!
      const timeMs = 2_000 + Number(frame.offset) * preview.durationMs
      expect(resolveLandrushIslandLoadingVisualSegmentProgress(preview, timeMs)).toBeCloseTo(
        percent / 100,
        8,
      )
      expect(
        resolveLandrushIslandLoadingVisualSegmentProgress(preview, timeMs - 0.001),
      ).toBeLessThan(percent / 100)
      expect(frame.easing).toBe('steps(1, end)')
    }
    expect(Number(hundred.offset) * preview.durationMs).toBeCloseTo(
      LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
      1,
    )
    expect(frames.at(-1)?.offset).toBe(1)
    expect(frames.length).toBeLessThanOrEqual(102)
  })

  test('never exposes a future endpoint before the compositor owns the frame', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.37 })
    controller.setConfirmedProgress(0.8)
    const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
    const style = createStyle()
    style.transform = 'scaleX(0.37)'
    let observedTransform = ''
    const animation = { cancel() {} }
    const returned = animateLandrushIslandLoadingPreview(
      {
        animate: () => {
          observedTransform = style.transform
          return animation as unknown as Animation
        },
        style,
      } as unknown as HTMLElement,
      preview,
    )

    expect(returned).toBe(animation)
    expect(observedTransform).toBe('scaleX(0.37)')
    expect(style.transform).toBe('scaleX(0.37)')
    expect(style.willChange).toBe('transform')
  })

  test('keeps the current floor when fill or percentage animation creation fails', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.37 })
    controller.complete()
    const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
    const style = createStyle()
    const element = {
      animate: () => {
        throw new Error('WAAPI unavailable')
      },
      style,
    } as unknown as HTMLElement

    expect(animateLandrushIslandLoadingPreview(element, preview)).toBeNull()
    expect(style.transform).toBe('scaleX(0.37)')
    expect(animateLandrushIslandLoadingPercentPreview(element, preview)).toBeNull()
    expect(style.transform).toBe('translate3d(0, -37rem, 0)')
  })

  test('derives visible integers from the same scalar without rounding to 100 early', () => {
    expect(createLandrushIslandLoadingProgressPresentation(0.794)).toEqual({
      percent: 79,
      percentText: '79%',
      progress: 0.794,
    })
    expect(createLandrushIslandLoadingProgressPresentation(0.8).percent).toBe(80)
    expect(createLandrushIslandLoadingProgressPresentation(0.999_999_999_999).percent).toBe(99)
    expect(createLandrushIslandLoadingProgressPresentation(1).percent).toBe(100)
  })

  test('keeps reduced-motion progress on the same bounded curve; only the fade is optional', () => {
    expect(
      resolveLandrushIslandLoadingReducedMotion((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      })),
    ).toBe(true)
    expect(resolveLandrushIslandLoadingReducedMotion(undefined)).toBe(false)
    expect(
      resolveLandrushIslandLoadingReducedMotion(() => {
        throw new Error('unavailable')
      }),
    ).toBe(false)
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.05 })
    controller.complete()
    const preview = createLandrushIslandLoadingVisualPreview(controller, 0)
    let received: Keyframe[] | PropertyIndexedKeyframes | undefined
    const style = createStyle()
    animateLandrushIslandLoadingPreview(
      {
        animate: (frames) => {
          received = frames
          return { cancel() {} } as unknown as Animation
        },
        style,
      } as unknown as HTMLElement,
      preview,
    )
    expect(received).toEqual(createLandrushIslandLoadingVisualKeyframes(preview))
    expect(preview.from).toBe(0.05)
    expect(preview.to).toBe(1)
    expect(style.transform).toBe('scaleX(0.05)')
  })
})

function evaluateCompositorCurve(frames: Keyframe[], durationMs: number, elapsedMs: number) {
  const offset = Math.max(0, Math.min(1, elapsedMs / durationMs))
  for (let index = 0; index < frames.length - 1; index += 1) {
    const start = Number(frames[index]!.offset)
    const end = Number(frames[index + 1]!.offset)
    if (offset <= end)
      return evaluateCompositorPiece(frames, durationMs, index, (offset - start) / (end - start))
  }
  return {
    acceleration: 0,
    progress: resolveLandrushIslandLoadingTransformProgress(String(frames.at(-1)?.transform)),
    velocity: 0,
  }
}

function evaluateCompositorPiece(frames: Keyframe[], durationMs: number, index: number, t: number) {
  const first = frames[index]!
  const last = frames[index + 1]!
  const p0 = resolveLandrushIslandLoadingTransformProgress(String(first.transform))
  const p1 = resolveLandrushIslandLoadingTransformProgress(String(last.transform))
  const seconds = ((Number(last.offset) - Number(first.offset)) * durationMs) / 1_000
  const controls = /^cubic-bezier\(([^)]+)\)$/
    .exec(String(first.easing))?.[1]
    ?.split(',')
    .map(Number)
  if (!controls)
    return { acceleration: 0, progress: p0 + (p1 - p0) * t, velocity: (p1 - p0) / seconds }
  expect(controls[0]).toBeCloseTo(1 / 3, 14)
  expect(controls[2]).toBeCloseTo(2 / 3, 14)
  const y1 = controls[1]!
  const y2 = controls[3]!
  const c3 = 1 - 3 * y2 + 3 * y1
  const c2 = 3 * y2 - 6 * y1
  const c1 = 3 * y1
  return {
    acceleration: ((p1 - p0) * (6 * c3 * t + 2 * c2)) / seconds ** 2,
    progress: p0 + (p1 - p0) * ((c3 * t + c2) * t + c1) * t,
    velocity: ((p1 - p0) * ((3 * c3 * t + 2 * c2) * t + c1)) / seconds,
  }
}

function createStyle() {
  return {
    opacity: '',
    removeProperty(name: string) {
      if (name === 'will-change') this.willChange = ''
      if (name === 'visibility') this.visibility = ''
      return ''
    },
    transform: '',
    transformOrigin: '',
    visibility: '',
    willChange: '',
  }
}
