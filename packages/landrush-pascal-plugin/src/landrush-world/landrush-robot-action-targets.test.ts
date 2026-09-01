import { describe, expect, test } from 'bun:test'
import type { AnimationAction } from 'three'
import { LandrushRobotActionTargetAccumulator } from './landrush-robot-action-targets'

function createAction(): AnimationAction {
  return {} as AnimationAction
}

describe('LandrushRobotActionTargetAccumulator', () => {
  test('merges aliased locomotion roles with the original weight and time-scale rules', () => {
    const accumulator = new LandrushRobotActionTargetAccumulator()
    const sharedAction = createAction()
    const runAction = createAction()

    accumulator.reset()
    accumulator.add(sharedAction, 0.25, 0.5)
    accumulator.add(sharedAction, 0.5, 1.25)
    accumulator.add(runAction, 1.5, 0.8)

    const sharedTarget = accumulator.get(sharedAction)
    expect(sharedTarget?.action).toBe(sharedAction)
    expect(sharedTarget?.weight).toBeCloseTo(0.75)
    expect(sharedTarget?.weightedTimeScale).toBeCloseTo(0.75)
    expect(sharedTarget?.timeScaleSum).toBeCloseTo(0.75)
    expect(runAction).not.toBe(sharedAction)
    expect(accumulator.get(runAction)).toMatchObject({
      timeScaleSum: 0.8,
      weight: 1,
      weightedTimeScale: 1,
    })
  })

  test('reuses target records while replacing action identities after reset', () => {
    const accumulator = new LandrushRobotActionTargetAccumulator()
    const firstAction = createAction()
    const secondAction = createAction()
    const replacementAction = createAction()

    accumulator.add(firstAction, 1, 0.5)
    accumulator.add(secondAction, 0.4, 1.2)
    const firstTarget = accumulator.get(firstAction)
    const secondTarget = accumulator.get(secondAction)

    accumulator.reset()
    expect(firstTarget?.action).toBeNull()
    expect(secondTarget?.action).toBeNull()
    expect(accumulator.get(firstAction)).toBeNull()
    expect(accumulator.get(secondAction)).toBeNull()
    accumulator.add(replacementAction, 0.3, 0.9)
    accumulator.add(firstAction, 0.6, 1.1)

    expect(accumulator.get(replacementAction)).toBe(firstTarget)
    expect(accumulator.get(firstAction)).toBe(secondTarget)
    expect(accumulator.get(secondAction)).toBeNull()
  })
})
