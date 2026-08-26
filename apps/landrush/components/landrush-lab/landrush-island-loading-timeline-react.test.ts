import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
} from './landrush-island-loading-progress-controller'
import { LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS } from './landrush-island-loading-shell-bootstrap'
import {
  animateLandrushIslandLoadingHandoffFade,
  animateLandrushIslandLoadingPreview,
  createLandrushIslandLoadingAppliedVisualSegment,
  createLandrushIslandLoadingCompletionPreview,
  createLandrushIslandLoadingPercentRetargetKeyframes,
  createLandrushIslandLoadingProgressPresentation,
  createLandrushIslandLoadingRetargetKeyframes,
  createLandrushIslandLoadingVisualPreview,
  LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
  resolveDisplayedLoadingProgress,
  resolveLandrushIslandLoadingCompositorElapsedDelta,
  resolveLandrushIslandLoadingCompositorSampleInterval,
  resolveLandrushIslandLoadingPresentedFrameDelta,
  resolveLandrushIslandLoadingReducedMotion,
  resolveLandrushIslandLoadingTransformProgress,
  retargetLandrushIslandLoadingAnimationsWhileRunning,
  retargetLandrushIslandLoadingPercentPreview,
  retargetLandrushIslandLoadingPreview,
  shouldAdvanceLandrushIslandLoadingFrameFallback,
  shouldReconcileLandrushIslandLoadingPreview,
} from './landrush-island-loading-timeline-react'

describe('Landrush island loading presentation handoff', () => {
  test('finishes from the compositor animation instead of a React render timer', () => {
    let frames: Keyframe[] | PropertyIndexedKeyframes | null = null
    let options: KeyframeAnimationOptions | number | undefined
    let finish: (() => void) | null = null
    let cancelled = false
    let finished = 0
    const style = createStyle()
    const animation = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'finish' && typeof listener === 'function') {
          finish = () => listener(new Event('finish'))
        }
      },
      cancel: () => {
        cancelled = true
      },
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
      360,
      () => {
        finished += 1
      },
    )

    expect(returned).toBe(animation)
    expect(frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(options).toEqual({ duration: 360, easing: 'ease-out', fill: 'forwards' })
    expect(finished).toBe(0)
    finish?.()
    expect(finished).toBe(1)
    expect(style.opacity).toBe('0')
    expect(style.willChange).toBe('')
    expect(cancelled).toBe(false)
  })

  test('completes synchronously when animation is unavailable', () => {
    let finished = false
    const style = createStyle()
    const element = { animate: undefined, style }

    const returned = animateLandrushIslandLoadingHandoffFade(
      element as unknown as HTMLElement,
      360,
      () => {
        finished = true
      },
    )

    expect(returned).toBeNull()
    expect(finished).toBe(true)
    expect(style.opacity).toBe('0')
  })

  test('adopts the exact shell compositor scale as the runtime progress floor', () => {
    expect(resolveLandrushIslandLoadingTransformProgress('matrix(0.37, 0, 0, 1, 0, 0)')).toBe(0.37)
    expect(
      resolveLandrushIslandLoadingTransformProgress(
        'matrix3d(0.62, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
      ),
    ).toBe(0.62)
    expect(resolveLandrushIslandLoadingTransformProgress('scaleX(0.81)')).toBe(0.81)
    expect(resolveLandrushIslandLoadingTransformProgress('none')).toBe(0)
  })

  test('keeps the first runtime frame at the adopted shell floor', () => {
    expect(resolveDisplayedLoadingProgress(null, 5_000, 0.23)).toBe(0.23)
  })

  test('reconciles sub-percent progress from an individual asset milestone', () => {
    const segment = {
      durationMs: 1_000,
      from: 0.5,
      keyframes: [
        { offset: 0, progress: 0.5 },
        { offset: 1, progress: 0.5 },
      ],
      startedAtMs: 0,
      to: 0.5,
    }

    expect(shouldReconcileLandrushIslandLoadingPreview(segment, 500, 0.502)).toBe(true)
  })

  test('retargets future keyframes without restarting the compositor timeline', () => {
    const segment = {
      durationMs: 18_000,
      from: 0.4,
      keyframes: [
        { offset: 0, progress: 0.4 },
        { offset: 1, progress: 0.8 },
      ],
      startedAtMs: 12_000,
      to: 0.8,
    }
    let frames: Keyframe[] | PropertyIndexedKeyframes | null = null
    let currentTime = 12_000
    let historicalReads = 0
    const animation = {
      effect: {
        getKeyframes: () => {
          historicalReads += 1
          return []
        },
        setKeyframes: (nextFrames: Keyframe[] | PropertyIndexedKeyframes) => {
          frames = nextFrames
        },
      },
      get currentTime() {
        return currentTime
      },
      set currentTime(value: CSSNumberish | null) {
        currentTime = Number(value)
      },
      playState: 'running' as AnimationPlayState,
    }
    const style = createStyle()
    style.transform = 'scaleX(0.4)'

    const retargeted = retargetLandrushIslandLoadingPreview(
      animation as unknown as Animation,
      { animate: undefined, style } as unknown as HTMLElement,
      segment,
    )

    expect(retargeted).toBe(true)
    expect(currentTime).toBe(12_000)
    expect(frames).toEqual([
      { offset: 0, transform: 'scaleX(0.4)' },
      { offset: 0.1, transform: 'scaleX(0.4)' },
      { offset: 0.25, transform: 'scaleX(0.8)' },
      { offset: 1, transform: 'scaleX(0.8)' },
    ])
    expect(historicalReads).toBe(0)
    expect(style.transform).toBe('scaleX(0.4)')
  })

  test('retargets fill and percentage immediately without pausing the running timeline', () => {
    const events: string[] = []
    const fillAnimation = {
      currentTime: 4_225,
      pause: () => events.push('fill:pause'),
      play: () => events.push('fill:play'),
      playState: 'running',
      ready: new Promise<Animation>(() => undefined),
    } as unknown as Animation
    const percentAnimation = {
      currentTime: 4_200,
      pause: () => events.push('percent:pause'),
      play: () => events.push('percent:play'),
      playState: 'running',
      ready: new Promise<Animation>(() => undefined),
    } as unknown as Animation

    const retargeted = retargetLandrushIslandLoadingAnimationsWhileRunning(
      fillAnimation,
      percentAnimation,
      (heldCurrentTimeMs) => {
        events.push(`retarget:${String(heldCurrentTimeMs)}`)
        return true
      },
    )

    expect(retargeted).toBe(true)
    expect(percentAnimation.currentTime).toBe(4_225)
    expect(events).toEqual(['retarget:4225'])
  })

  test('does not mutate a fill and percentage pair unless both animations are active', () => {
    let retargetCalls = 0
    const retargeted = retargetLandrushIslandLoadingAnimationsWhileRunning(
      { currentTime: 1_000, playState: 'running' } as Animation,
      { currentTime: 1_000, playState: 'finished' } as Animation,
      () => {
        retargetCalls += 1
        return true
      },
    )

    expect(retargeted).toBe(false)
    expect(retargetCalls).toBe(0)
  })

  test('discards stalled wall-clock time instead of repaying it as progress', () => {
    expect(resolveLandrushIslandLoadingPresentedFrameDelta(16.667, 0)).toBeCloseTo(16.667, 3)
    expect(resolveLandrushIslandLoadingPresentedFrameDelta(1_516.667, 16.667)).toBeCloseTo(
      1_000 / 30,
      6,
    )
    expect(resolveLandrushIslandLoadingPresentedFrameDelta(1_533.334, 1_516.667)).toBeCloseTo(
      16.667,
      3,
    )
    expect(resolveLandrushIslandLoadingPresentedFrameDelta(100, 120)).toBe(0)
    expect(resolveLandrushIslandLoadingCompositorElapsedDelta(9_000, 1_000)).toBe(
      LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
    )
    expect(resolveLandrushIslandLoadingCompositorElapsedDelta(1_016.667, 1_000)).toBeCloseTo(
      16.667,
      3,
    )
    expect(resolveLandrushIslandLoadingCompositorElapsedDelta(100, 120)).toBe(0)
    expect(shouldAdvanceLandrushIslandLoadingFrameFallback(99.999, 0)).toBe(false)
    expect(shouldAdvanceLandrushIslandLoadingFrameFallback(100, 0)).toBe(true)
    expect(shouldAdvanceLandrushIslandLoadingFrameFallback(100, 120)).toBe(false)
  })

  test('holds a short compositor lease instead of banking hidden progress through a stall', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.165_092,
      initialVelocityPerSecond: LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
    })
    controller.setConfirmedProgress(0.8, {
      ceiling: 0.984,
      estimatedDurationMs: 8_000,
    })
    const segment = createLandrushIslandLoadingVisualPreview(
      controller,
      0,
      LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
    )
    const keyframes = createLandrushIslandLoadingRetargetKeyframes(segment, 5_935.534)
    const maximumLeaseProgress =
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND *
      (LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS / 1_000)

    expect(segment.to - segment.from).toBeLessThanOrEqual(maximumLeaseProgress + 0.000_001)
    expect(keyframes.at(-1)?.offset).toBe(1)
    expect(keyframes.at(-2)?.progress).toBeCloseTo(segment.to, 12)
    expect(keyframes.at(-2)?.offset).toBeCloseTo(
      (5_935.534 + LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS) /
        LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
      12,
    )
    expect(keyframes.at(-1)?.progress).toBeCloseTo(segment.to, 12)
  })

  test('does not reinterpret a pending compositor clock as time zero', () => {
    let keyframeWrites = 0
    const animation = {
      currentTime: null,
      effect: {
        setKeyframes: () => {
          keyframeWrites += 1
        },
      },
      playState: 'pending' as AnimationPlayState,
    }
    const segment = {
      durationMs: 1_000,
      from: 0.2,
      keyframes: [
        { offset: 0, progress: 0.2 },
        { offset: 1, progress: 0.3 },
      ],
      startedAtMs: 0,
      to: 0.3,
    }
    const style = createStyle()

    expect(
      retargetLandrushIslandLoadingPreview(
        animation as unknown as Animation,
        { animate: undefined, style } as unknown as HTMLElement,
        segment,
      ),
    ).toBe(false)
    expect(
      retargetLandrushIslandLoadingPercentPreview(
        animation as unknown as Animation,
        { animate: undefined, style } as unknown as HTMLElement,
        segment,
      ),
    ).toBe(false)
    expect(keyframeWrites).toBe(0)
  })

  test('never exposes a future preview endpoint before WAAPI owns the frame', () => {
    const style = createStyle()
    style.transform = 'scaleX(0.2)'
    let transformObservedByAnimate = ''
    const animation = { cancel() {} }

    const returned = animateLandrushIslandLoadingPreview(
      {
        animate: () => {
          transformObservedByAnimate = style.transform
          return animation as unknown as Animation
        },
        style,
      } as unknown as HTMLElement,
      {
        durationMs: 30_000,
        from: 0.2,
        keyframes: [
          { offset: 0, progress: 0.2 },
          { offset: 1, progress: 0.8 },
        ],
        startedAtMs: 0,
        to: 0.8,
      },
    )

    expect(returned).toBe(animation)
    expect(transformObservedByAnimate).toBe('scaleX(0.2)')
    expect(style.transform).toBe('scaleX(0.2)')
  })

  test('keeps the long runway within an Idle-sized compositor keyframe budget', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.2 })
    controller.setConfirmedProgress(0.8, { ceiling: 0.984, estimatedDurationMs: 8_000 })

    const preview = createLandrushIslandLoadingVisualPreview(
      controller,
      0,
      LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
    )

    expect(preview.durationMs).toBe(LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS)
    expect(preview.keyframes.length).toBeGreaterThanOrEqual(900)
    expect(preview.keyframes.length).toBeLessThanOrEqual(902)
    expect(preview.keyframes.at(-1)?.progress).toBeGreaterThan(0.5)
    expect(
      resolveLandrushIslandLoadingCompositorSampleInterval(
        LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
      ),
    ).toBeCloseTo(LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS / 900, 12)
    expect(resolveLandrushIslandLoadingCompositorSampleInterval(10_000)).toBeCloseTo(1_000 / 30, 12)
  })

  test('keeps the rendered floor when WAAPI animation creation fails', () => {
    const style = createStyle()
    style.transform = 'scaleX(0.37)'

    const returned = animateLandrushIslandLoadingPreview(
      {
        animate: () => {
          throw new Error('WAAPI unavailable')
        },
        style,
      } as unknown as HTMLElement,
      {
        durationMs: 30_000,
        from: 0.37,
        keyframes: [
          { offset: 0, progress: 0.37 },
          { offset: 1, progress: 0.7 },
        ],
        startedAtMs: 0,
        to: 0.7,
      },
    )

    expect(returned).toBeNull()
    expect(style.transform).toBe('scaleX(0.37)')
  })

  test('maps a completion segment onto the remaining fixed compositor timeline', () => {
    expect(
      createLandrushIslandLoadingRetargetKeyframes(
        {
          durationMs: 2_000,
          from: 0.9,
          keyframes: [
            { offset: 0, progress: 0.9 },
            { offset: 1, progress: 1 },
          ],
          startedAtMs: 5_000,
          to: 1,
        },
        5_000,
      ),
    ).toEqual([
      { offset: 0, progress: 0.9 },
      { offset: 5_000 / LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS, progress: 0.9 },
      { offset: 7_000 / LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS, progress: 1 },
      { offset: 1, progress: 1 },
    ])
  })

  test('does not compress a capped final runway when retargeting the compositor timeline', () => {
    const controller = createLandrushIslandLoadingProgressController({
      initialProgress: 0.14,
      initialVelocityPerSecond: 0.006,
    })
    controller.complete()
    const keyframes = createLandrushIslandLoadingRetargetKeyframes(
      createLandrushIslandLoadingVisualPreview(controller, 0, 18_000),
      12_000,
    )
    const intervalRates = keyframes.slice(1).map((keyframe, index) => {
      const previous = keyframes[index]!
      const elapsedSeconds =
        ((keyframe.offset - previous.offset) * LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS) /
        1_000
      return elapsedSeconds > 0 ? (keyframe.progress - previous.progress) / elapsedSeconds : 0
    })

    expect(Math.min(...intervalRates)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...intervalRates)).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND + 0.000_001,
    )
  })

  test('truncates an overlong retarget instead of compressing it past the speed ceiling', () => {
    const keyframes = createLandrushIslandLoadingRetargetKeyframes(
      {
        durationMs: 4_000,
        from: 0.4,
        keyframes: [
          { offset: 0, progress: 0.4 },
          { offset: 1, progress: 0.7 },
        ],
        startedAtMs: 0,
        to: 0.7,
      },
      LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS - 1_000,
    )

    expect(keyframes).toHaveLength(3)
    expect(keyframes[0]).toEqual({ offset: 0, progress: 0.4 })
    expect(keyframes[1]).toEqual({
      offset:
        (LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS - 1_000) /
        LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
      progress: 0.4,
    })
    expect(keyframes[2]?.offset).toBe(1)
    expect(keyframes[2]?.progress).toBeCloseTo(0.475, 12)
  })

  test('keeps duplicate retarget offsets at their prior physical position', () => {
    const keyframes = createLandrushIslandLoadingRetargetKeyframes(
      {
        durationMs: 1_000,
        from: 0.4,
        keyframes: [
          { offset: 0, progress: 0.4 },
          { offset: 0, progress: 0.6 },
          { offset: 1, progress: 0.7 },
        ],
        startedAtMs: 0,
        to: 0.7,
      },
      0,
    )

    expect(keyframes.map(({ offset }) => offset)).toEqual([
      0,
      1_000 / LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
      1,
    ])
    expect(keyframes.map(({ progress }) => progress)).toEqual([
      0.4, 0.47500000000000003, 0.47500000000000003,
    ])
  })

  test('moves the visible integer at the exact fill thresholds on the same timeline', () => {
    const keyframes = createLandrushIslandLoadingPercentRetargetKeyframes(
      {
        durationMs: 18_000,
        from: 0.4,
        keyframes: [
          { offset: 0, progress: 0.4 },
          { offset: 1, progress: 0.42 },
        ],
        startedAtMs: 12_000,
        to: 0.42,
      },
      12_000,
    )

    expect(keyframes).toHaveLength(4)
    expect(keyframes[0]).toEqual({ offset: 0, percent: 40 })
    expect(keyframes[1]?.offset).toBeCloseTo(21_000 / 120_000, 12)
    expect(keyframes[1]?.percent).toBe(41)
    expect(keyframes[2]).toEqual({ offset: 30_000 / 120_000, percent: 42 })
    expect(keyframes[3]).toEqual({ offset: 1, percent: 42 })
  })

  test('drives confirmed completion through retained sampled motion until dismissal is ready', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.96 })
    const segments = []
    let startedAtMs = 1_000

    while (!controller.readyToDismiss() && segments.length < 10) {
      const segment = createLandrushIslandLoadingCompletionPreview(controller, startedAtMs, 520)
      segments.push(segment)
      controller.step(segment.durationMs)
      startedAtMs += segment.durationMs
    }

    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every((segment) => segment.durationMs === 520)).toBe(true)
    expect(segments[0]?.from).toBe(0.96)
    expect(segments[0]?.keyframes.length).toBeGreaterThan(2)
    expect(segments.every((segment) => segment.to <= 1)).toBe(true)
    expect(controller.readyToDismiss()).toBe(true)
    expect(segments.at(-1)?.to).toBeGreaterThanOrEqual(LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS)
  })

  test('caps the reduced-motion completion fallback at dismissal progress', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.96 })
    const preview = createLandrushIslandLoadingCompletionPreview(controller, 1_000, 520)

    const applied = createLandrushIslandLoadingAppliedVisualSegment(preview, true, 1)

    expect(applied.from).toBe(LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS)
    expect(applied.to).toBe(LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS)
  })

  test('derives the visible integer from the same scalar as the fill', () => {
    expect(createLandrushIslandLoadingProgressPresentation(0.794)).toEqual({
      percent: 79,
      percentText: '79%',
      progress: 0.794,
    })
    expect(createLandrushIslandLoadingProgressPresentation(0.795_1).percent).toBe(79)
    expect(createLandrushIslandLoadingProgressPresentation(0.8).percent).toBe(80)
    expect(createLandrushIslandLoadingProgressPresentation(0.999).percent).toBe(99)
    expect(createLandrushIslandLoadingProgressPresentation(1).percent).toBe(100)
  })

  test('uses static progress and no WAAPI when reduced motion is requested', () => {
    let animateCalls = 0
    const style = createStyle()
    const returned = animateLandrushIslandLoadingPreview(
      {
        animate: () => {
          animateCalls += 1
          throw new Error('reduced-motion progress must not animate')
        },
        style,
      } as unknown as HTMLElement,
      {
        durationMs: 30_000,
        from: 0.3,
        keyframes: [
          { offset: 0, progress: 0.3 },
          { offset: 1, progress: 0.7 },
        ],
        startedAtMs: 0,
        to: 0.7,
      },
      true,
    )

    expect(returned).toBeNull()
    expect(animateCalls).toBe(0)
    expect(style.transform).toBe('scaleX(0.7)')
    expect(style.willChange).toBe('auto')
    expect(
      resolveLandrushIslandLoadingReducedMotion((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      })),
    ).toBe(true)
    expect(resolveLandrushIslandLoadingReducedMotion(undefined)).toBe(false)
  })
})

function createStyle() {
  return {
    opacity: '',
    removeProperty(name: string) {
      if (name === 'will-change') this.willChange = ''
      return ''
    },
    transform: '',
    willChange: '',
  }
}
