import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushRobotRevealObjectTransitions,
  LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY,
  readLandrushRobotRevealObjectAmount,
  shouldKeepLandrushRobotRevealSlabOpaque,
} from './landrush-robot-reveal-support'

describe('Landrush robot reveal support slabs', () => {
  test('keeps the current support floor opaque', () => {
    expect(
      shouldKeepLandrushRobotRevealSlabOpaque({
        robotLevelBaseY: 2.8,
        slabLevelBaseY: 2.8,
        tolerance: 0.08,
      }),
    ).toBe(true)
  })

  test('keeps lower floors opaque while allowing an upper floor to cut away', () => {
    expect(
      shouldKeepLandrushRobotRevealSlabOpaque({
        robotLevelBaseY: 2.8,
        slabLevelBaseY: 0,
        tolerance: 0.08,
      }),
    ).toBe(true)
    expect(
      shouldKeepLandrushRobotRevealSlabOpaque({
        robotLevelBaseY: 2.8,
        slabLevelBaseY: 5.6,
        tolerance: 0.08,
      }),
    ).toBe(false)
  })
})

describe('Landrush robot reveal object scope', () => {
  test('does not reveal a rear mesh that shares a foreground mesh material', () => {
    const foregroundMesh = { material: 'shared-wall-finish' }
    const rearMesh = { material: 'shared-wall-finish' }
    const states = new Map()

    advanceLandrushRobotRevealObjectTransitions({
      activeObjects: new Set([foregroundMesh]),
      deltaSeconds: 0.05,
      epsilon: 0.001,
      fadeInDelaySeconds: 0,
      fadeInResponse: 12,
      fadeOutResponse: 12,
      states,
    })

    expect(states.get(foregroundMesh)?.amount).toBeGreaterThan(0)
    expect(states.has(rearMesh)).toBe(false)
    expect(readLandrushRobotRevealObjectAmount(rearMesh)).toBe(0)
  })

  test('fades a departing foreground mesh before removing its state', () => {
    const mesh = { [LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY]: 1 }
    const states = new Map([[mesh, { amount: 1, fadeInDelaySeconds: 0 }]])

    advanceLandrushRobotRevealObjectTransitions({
      activeObjects: new Set(),
      deltaSeconds: 0.05,
      epsilon: 0.001,
      fadeInDelaySeconds: 0,
      fadeInResponse: 12,
      fadeOutResponse: 12,
      states,
    })

    expect(states.get(mesh)?.amount).toBeGreaterThan(0)
    expect(states.get(mesh)?.amount).toBeLessThan(1)
  })
})
