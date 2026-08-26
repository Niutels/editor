import { describe, expect, test } from 'bun:test'
import {
  resolveZombieEscapeLocomotionPlaybackRate,
  resolveZombieEscapeLocomotionWeight,
} from './zombie-escape-locomotion-playback'

describe('Zombie Escape locomotion playback', () => {
  test('uses actual post-collision speed for walk and run cadence', () => {
    expect(resolveZombieEscapeLocomotionPlaybackRate(1.4, 1.4, 3.5, 0)).toBeCloseTo(1, 6)
    expect(resolveZombieEscapeLocomotionPlaybackRate(3.5, 1.4, 3.5, 1)).toBeCloseTo(1, 6)
    expect(resolveZombieEscapeLocomotionPlaybackRate(1.75, 1.4, 3.5, 1)).toBeCloseTo(0.5, 6)
    expect(resolveZombieEscapeLocomotionPlaybackRate(2.45, 1.4, 3.5, 0.5)).toBeCloseTo(1, 6)
  })

  test('removes locomotion influence when collision leaves the zombie stationary', () => {
    expect(resolveZombieEscapeLocomotionPlaybackRate(0, 1.4, 3.5, 1)).toBe(0)
    expect(resolveZombieEscapeLocomotionWeight(0)).toBe(0)
    expect(resolveZombieEscapeLocomotionWeight(0.225)).toBeCloseTo(1, 6)
  })
})
