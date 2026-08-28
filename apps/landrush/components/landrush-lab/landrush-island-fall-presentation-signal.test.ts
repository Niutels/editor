import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandFallPresentationSignal,
  createLandrushIslandFallPresentationState,
} from './landrush-island-fall-presentation-signal'

function state(active: boolean, amount: number, slowMotionFactor = 1, wiggleAmount = 0) {
  return { active, amount, slowMotionFactor, wiggleAmount }
}

describe('Landrush island fall presentation signal', () => {
  test('keeps raw frame state exact while publishing only screen-relevant changes', () => {
    const signal = createLandrushIslandFallPresentationSignal()
    let notifications = 0
    signal.subscribe(() => {
      notifications += 1
    })

    const raw = state(true, 0.004, 0.72, 0.31)
    signal.publish(raw)
    expect(signal.current).toBe(raw)
    expect(signal.getSnapshot()).toEqual({ active: true, amount: 0.004 })
    expect(notifications).toBe(1)

    const screenEquivalent = state(true, 0.011, 0.4, 0.8)
    signal.publish(screenEquivalent)
    expect(signal.current).toBe(screenEquivalent)
    expect(signal.getSnapshot()).toEqual({ active: true, amount: 0.004 })
    expect(notifications).toBe(1)
  })

  test('uses cumulative amount change from the last published snapshot', () => {
    const signal = createLandrushIslandFallPresentationSignal()
    const snapshots: unknown[] = []
    signal.subscribe(() => snapshots.push(signal.getSnapshot()))

    signal.publish(state(true, 0))
    signal.publish(state(true, 0.006))
    signal.publish(state(true, 0.0119))
    expect(snapshots).toEqual([{ active: true, amount: 0 }])

    signal.publish(state(true, 0.012))
    expect(snapshots).toEqual([
      { active: true, amount: 0 },
      { active: true, amount: 0.012 },
    ])
  })

  test('publishes active edges and the exact terminal inactive state', () => {
    const signal = createLandrushIslandFallPresentationSignal()
    const snapshots: unknown[] = []
    signal.subscribe(() => snapshots.push(signal.getSnapshot()))

    signal.publish(state(true, 0.8))
    signal.publish(state(false, 0.795))
    signal.publish(state(false, 0))
    signal.publish(state(false, 0))

    expect(snapshots).toEqual([
      { active: true, amount: 0.8 },
      { active: false, amount: 0.795 },
      { active: false, amount: 0 },
    ])
  })

  test('exposes publish-before-subscribe state and stable snapshots per client', () => {
    const first = createLandrushIslandFallPresentationSignal()
    const second = createLandrushIslandFallPresentationSignal()
    const published = state(true, 0.45, 0.3, 0.6)
    first.publish(published)

    const firstSnapshot = first.getSnapshot()
    expect(first.getSnapshot()).toBe(firstSnapshot)
    expect(firstSnapshot).toEqual({ active: true, amount: 0.45 })
    expect(first.current).toBe(published)
    expect(second.current).toEqual(createLandrushIslandFallPresentationState())
    expect(second.getSnapshot()).toEqual({ active: false, amount: 0 })
    expect(first.getServerSnapshot()).toBe(first.getServerSnapshot())
    expect(first.getServerSnapshot()).toBe(second.getServerSnapshot())

    let notifications = 0
    const unsubscribe = first.subscribe(() => {
      notifications += 1
    })
    first.publish(state(true, 0.47))
    unsubscribe()
    first.publish(state(true, 0.49))
    expect(notifications).toBe(1)
  })
})
