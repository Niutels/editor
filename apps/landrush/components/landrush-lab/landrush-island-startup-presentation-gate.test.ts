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

  test('cancels the pending frame on unmount', () => {
    const cancelled: number[] = []
    let ready = false
    const cancel = scheduleLandrushIslandStartupAfterPresentationFrames({
      cancelFrame: (frameId) => cancelled.push(frameId),
      onReady: () => {
        ready = true
      },
      requestFrame: () => 27,
    })

    cancel()

    expect(cancelled).toEqual([27])
    expect(ready).toBe(false)
  })
})
