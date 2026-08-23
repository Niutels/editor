import { describe, expect, test } from 'bun:test'
import {
  calculateFrameObservedWorkEnvelopeAccounting,
  setFrameLoadProfilerActive,
} from './frame-load-profiler-accounting'

describe('frame observed-work-envelope accounting', () => {
  test('separates measured spans, gaps inside the envelope, and time outside it', () => {
    expect(
      calculateFrameObservedWorkEnvelopeAccounting({
        beginMs: 100,
        nextBeginMs: 120,
        topLevelSlices: [
          { durationMs: 2, startMs: 101 },
          { durationMs: 3, startMs: 105 },
        ],
        workEndMs: 112,
      }),
    ).toEqual({
      intervalMs: 20,
      measuredTopLevelUnionMs: 5,
      observedWorkEnvelopeMs: 12,
      outsideObservedWorkEnvelopeMs: 8,
      unmeasuredObservedWorkEnvelopeMs: 7,
    })
  })

  test('uses the union of overlapping top-level spans', () => {
    expect(
      calculateFrameObservedWorkEnvelopeAccounting({
        beginMs: 100,
        nextBeginMs: 120,
        topLevelSlices: [
          { durationMs: 4, startMs: 101 },
          { durationMs: 3, startMs: 103 },
        ],
        workEndMs: 110,
      }),
    ).toEqual({
      intervalMs: 20,
      measuredTopLevelUnionMs: 5,
      observedWorkEnvelopeMs: 10,
      outsideObservedWorkEnvelopeMs: 10,
      unmeasuredObservedWorkEnvelopeMs: 5,
    })
  })

  test('clamps the envelope and measured spans to the frame interval', () => {
    expect(
      calculateFrameObservedWorkEnvelopeAccounting({
        beginMs: 100,
        nextBeginMs: 110,
        topLevelSlices: [
          { durationMs: 4, startMs: 98 },
          { durationMs: 5, startMs: 108 },
        ],
        workEndMs: 114,
      }),
    ).toEqual({
      intervalMs: 10,
      measuredTopLevelUnionMs: 4,
      observedWorkEnvelopeMs: 10,
      outsideObservedWorkEnvelopeMs: 0,
      unmeasuredObservedWorkEnvelopeMs: 6,
    })
  })

  test('extends the envelope to an observed callback after render', () => {
    expect(
      calculateFrameObservedWorkEnvelopeAccounting({
        beginMs: 100,
        nextBeginMs: 120,
        topLevelSlices: [
          { durationMs: 5, startMs: 101 },
          { durationMs: 2, startMs: 112 },
        ],
        workEndMs: 114,
      }),
    ).toEqual({
      intervalMs: 20,
      measuredTopLevelUnionMs: 7,
      observedWorkEnvelopeMs: 14,
      outsideObservedWorkEnvelopeMs: 6,
      unmeasuredObservedWorkEnvelopeMs: 7,
    })
  })

  test('attributes no envelope work when work ends before the frame begins', () => {
    expect(
      calculateFrameObservedWorkEnvelopeAccounting({
        beginMs: 100,
        nextBeginMs: 116,
        topLevelSlices: [{ durationMs: 3, startMs: 101 }],
        workEndMs: 99,
      }),
    ).toEqual({
      intervalMs: 16,
      measuredTopLevelUnionMs: 0,
      observedWorkEnvelopeMs: 0,
      outsideObservedWorkEnvelopeMs: 16,
      unmeasuredObservedWorkEnvelopeMs: 0,
    })
  })
})

describe('frame profiler activation lifecycle', () => {
  test('deactivates and re-enables the same profiler', () => {
    const profiler = {
      enabled: true,
      freeze() {
        this.enabled = false
      },
      reset() {
        this.enabled = true
      },
    }

    setFrameLoadProfilerActive(profiler, false)
    expect(profiler.enabled).toBe(false)

    setFrameLoadProfilerActive(profiler, true)
    expect(profiler.enabled).toBe(true)
  })
})
