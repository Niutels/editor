import { describe, expect, test } from 'bun:test'
import { installR3fSubscriberProfiling } from './frame-load-profiler'

type FrameCallback = (...args: unknown[]) => unknown

describe('R3F subscriber frame profiling', () => {
  test('keeps one wrapper and one tracked entry across repeated callback refreshes', () => {
    const invocations: number[] = []
    const measuredLabels: string[] = []
    let assignments = 0
    let current: unknown = () => invocations.push(-1)
    const frameRef = {
      get current() {
        return current
      },
      set current(value: unknown) {
        assignments += 1
        current = value
      },
    }
    const rootState = {
      internal: {
        subscribers: [{ priority: 7, ref: frameRef }],
      },
    }
    const profiling = installR3fSubscriberProfiling(() => rootState, {
      measure<T>(id: string, callback: () => T) {
        measuredLabels.push(id)
        return callback()
      },
    })
    const stableWrapper = frameRef.current
    let latestCallback = current as FrameCallback

    for (let index = 0; index < 1_000; index += 1) {
      latestCallback = () => invocations.push(index)
      frameRef.current = latestCallback
      profiling.wrap()
      expect(frameRef.current).toBe(stableWrapper)
      expect(profiling.getTrackedSubscriberCount()).toBe(1)
    }

    ;(frameRef.current as FrameCallback)()
    expect(invocations).toEqual([999])
    expect(measuredLabels).toHaveLength(1)
    expect(measuredLabels[0]).toContain('r3f.useFrame.0.p7')

    const assignmentsBeforeRestore = assignments
    profiling.restore()
    expect(frameRef.current).toBe(latestCallback)
    expect(assignments).toBe(assignmentsBeforeRestore + 1)
    expect(profiling.getTrackedSubscriberCount()).toBe(0)

    profiling.restore()
    profiling.wrap()
    expect(frameRef.current).toBe(latestCallback)
    expect(assignments).toBe(assignmentsBeforeRestore + 1)
  })

  test('prunes removed subscribers and leaves the profiler callback untouched', () => {
    const firstOriginal = () => 'first'
    const secondOriginal = () => 'second'
    const profilerOriginal = () => 'profiler'
    const firstRef = { current: firstOriginal as unknown }
    const secondRef = { current: secondOriginal as unknown }
    const profilerRef = { current: profilerOriginal as unknown }
    const rootState = {
      internal: {
        subscribers: [
          { priority: -100_000, ref: profilerRef },
          { priority: 0, ref: firstRef },
          { priority: 1, ref: secondRef },
        ],
      },
    }
    const profiling = installR3fSubscriberProfiling(() => rootState, {
      measure<T>(_id: string, callback: () => T) {
        return callback()
      },
    })
    const secondWrapper = secondRef.current

    expect(profiling.getTrackedSubscriberCount()).toBe(2)
    expect(firstRef.current).not.toBe(firstOriginal)
    expect(profilerRef.current).toBe(profilerOriginal)

    rootState.internal.subscribers = [
      { priority: -100_000, ref: profilerRef },
      { priority: 1, ref: secondRef },
    ]
    profiling.wrap()

    expect(firstRef.current).toBe(firstOriginal)
    expect(secondRef.current).toBe(secondWrapper)
    expect(profiling.getTrackedSubscriberCount()).toBe(1)

    profiling.restore()
    expect(secondRef.current).toBe(secondOriginal)
    expect(profilerRef.current).toBe(profilerOriginal)
  })
})
