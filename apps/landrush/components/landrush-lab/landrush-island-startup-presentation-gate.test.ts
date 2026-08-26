import { describe, expect, test } from 'bun:test'
import { scheduleLandrushIslandStartupAfterPresentationFrames } from './landrush-island-startup-presentation-gate'

describe('Landrush island startup presentation gate', () => {
  test('waits for two presentation frames before mounting the expensive island', () => {
    const callbacks: FrameRequestCallback[] = []
    let ready = false
    const cancel = scheduleLandrushIslandStartupAfterPresentationFrames({
      cancelFrame: () => undefined,
      onReady: () => {
        ready = true
      },
      requestFrame: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
    })

    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.(16)
    expect(ready).toBe(false)
    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.(32)
    expect(ready).toBe(true)
    cancel()
  })

  test('does not mount the island until the streamed loading shell is ready to own progress', () => {
    const callbacks: FrameRequestCallback[] = []
    let presentationReady = false
    let ready = false
    scheduleLandrushIslandStartupAfterPresentationFrames({
      cancelFrame: () => undefined,
      isPresentationReady: () => presentationReady,
      onReady: () => {
        ready = true
      },
      requestFrame: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
    })

    callbacks.shift()?.(16)
    callbacks.shift()?.(32)
    expect(ready).toBe(false)
    expect(callbacks).toHaveLength(1)

    presentationReady = true
    callbacks.shift()?.(48)
    expect(ready).toBe(true)
    expect(callbacks).toHaveLength(0)
  })

  test('mounts through the bounded fallback when compositor ownership never advances', () => {
    const callbacks: FrameRequestCallback[] = []
    const cancelledFrames: number[] = []
    let fallback: (() => void) | null = null
    let fallbackCancelled = false
    let ready = false
    scheduleLandrushIslandStartupAfterPresentationFrames({
      cancelFrame: (frameId) => cancelledFrames.push(frameId),
      isPresentationReady: () => false,
      onReady: () => {
        ready = true
      },
      requestFrame: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
      scheduleFallback: (callback) => {
        fallback = callback
        return () => {
          fallbackCancelled = true
        }
      },
    })

    callbacks.shift()?.(16)
    callbacks.shift()?.(32)
    expect(ready).toBe(false)

    fallback?.()

    expect(ready).toBe(true)
    expect(cancelledFrames).toEqual([1])
    expect(fallbackCancelled).toBe(true)
  })

  test('cancels the pending frame on unmount', () => {
    const cancelled: number[] = []
    let fallbackCancelled = false
    let ready = false
    const cancel = scheduleLandrushIslandStartupAfterPresentationFrames({
      cancelFrame: (frameId) => cancelled.push(frameId),
      onReady: () => {
        ready = true
      },
      requestFrame: () => 27,
      scheduleFallback: () => () => {
        fallbackCancelled = true
      },
    })

    cancel()

    expect(cancelled).toEqual([27])
    expect(fallbackCancelled).toBe(true)
    expect(ready).toBe(false)
  })
})
