import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeWeaponPlacementHistoryRefreshListener,
  createZombieEscapeWeaponPlacementRefreshController,
} from './zombie-escape-weapon-placement-refresh'

describe('Zombie Escape weapon placement refresh', () => {
  test('coalesces scene commits and reads the latest settled build state once', () => {
    const microtasks: (() => void)[] = []
    const applied: number[] = []
    let buildPhase = true
    let sceneRevision = 0
    const controller = createZombieEscapeWeaponPlacementRefreshController({
      isBuildPhase: () => buildPhase,
      refresh: () => applied.push(sceneRevision),
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })

    sceneRevision = 1
    controller.schedule()
    sceneRevision = 2
    controller.schedule()

    expect(applied).toEqual([])
    drainMicrotasks(microtasks)
    expect(applied).toEqual([2])

    buildPhase = false
    sceneRevision = 3
    controller.schedule()
    drainMicrotasks(microtasks)
    expect(applied).toEqual([2])
  })

  test('flushes immediately and cancels a stale queued refresh', () => {
    const microtasks: (() => void)[] = []
    const applied: number[] = []
    let sceneRevision = 1
    const controller = createZombieEscapeWeaponPlacementRefreshController({
      isBuildPhase: () => true,
      refresh: () => applied.push(sceneRevision),
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })

    controller.schedule()
    sceneRevision = 2

    expect(controller.flush()).toBe(true)
    expect(applied).toEqual([2])

    sceneRevision = 3
    drainMicrotasks(microtasks)
    expect(applied).toEqual([2])
  })

  test('refreshes once after undo, redo, or a paused edit settles', () => {
    const microtasks: (() => void)[] = []
    const applied: number[] = []
    let sceneRevision = 0
    const controller = createZombieEscapeWeaponPlacementRefreshController({
      isBuildPhase: () => true,
      refresh: () => applied.push(sceneRevision),
      scheduleMicrotask: (callback) => microtasks.push(callback),
    })
    const listener = createZombieEscapeWeaponPlacementHistoryRefreshListener({
      initialState: { futureStates: [], isTracking: true },
      schedule: controller.schedule,
    })

    listener({ futureStates: [], isTracking: false })
    sceneRevision = 1
    expect(microtasks).toEqual([])

    listener({ futureStates: [], isTracking: true })
    listener({ futureStates: [{}], isTracking: true })
    sceneRevision = 2
    listener({ futureStates: [], isTracking: true })

    expect(applied).toEqual([])
    drainMicrotasks(microtasks)
    expect(applied).toEqual([2])
  })
})

function drainMicrotasks(microtasks: (() => void)[]) {
  while (microtasks.length > 0) microtasks.shift()!()
}
