import { describe, expect, test } from 'bun:test'
import {
  dampZombieEscapeAngle,
  resolveZombieEscapeMeleePresentationPose,
  resolveZombieEscapeTorsoAimOffset,
  ZOMBIE_ESCAPE_MELEE_HIT_ACTIVE_PROGRESS,
} from '@landrush/zombie-gameplay/zombie-escape-combat-pose'

describe('Zombie Escape combat pose', () => {
  test('crosses the aim direction at the authoritative melee hit instant', () => {
    const pose = resolveZombieEscapeMeleePresentationPose(
      'active',
      ZOMBIE_ESCAPE_MELEE_HIT_ACTIVE_PROGRESS,
    )

    expect(pose.yawOffset).toBeCloseTo(0, 8)
  })

  test('returns to an exact terminal rest pose', () => {
    expect(resolveZombieEscapeMeleePresentationPose('recovery', 1)).toEqual({
      forwardOffset: 0,
      liftOffset: 0,
      roll: 0,
      yawOffset: 0,
    })
    expect(resolveZombieEscapeMeleePresentationPose('idle', 0.4)).toEqual({
      forwardOffset: 0,
      liftOffset: 0,
      roll: 0,
      yawOffset: 0,
    })
  })

  test('damps shortest-arc aim consistently across frame rates and the pi seam', () => {
    const target = -Math.PI + 0.05
    const start = Math.PI - 0.05
    const at30 = integrateAngle(start, target, 30)
    const at60 = integrateAngle(start, target, 60)
    const at120 = integrateAngle(start, target, 120)

    expect(shortestAngleDifference(at30, at60)).toBeLessThan(0.000_001)
    expect(shortestAngleDifference(at60, at120)).toBeLessThan(0.000_001)
    expect(shortestAngleDifference(at120, target)).toBeLessThan(0.001)
  })

  test('keeps locomotion at the root while clamping the upper-body aim split', () => {
    expect(resolveZombieEscapeTorsoAimOffset(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 6)
    expect(resolveZombieEscapeTorsoAimOffset(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(0.2, 6)
    expect(resolveZombieEscapeTorsoAimOffset(Math.PI, 0, 0.8)).toBeCloseTo(0.8, 6)
  })
})

function integrateAngle(start: number, target: number, framesPerSecond: number) {
  let value = start
  for (let frame = 0; frame < framesPerSecond; frame += 1) {
    value = dampZombieEscapeAngle(value, target, 8, 1 / framesPerSecond)
  }
  return value
}

function shortestAngleDifference(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)))
}
