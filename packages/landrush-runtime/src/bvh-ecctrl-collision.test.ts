import { describe, expect, test } from 'bun:test'
import {
  resolveBVHEcctrlCollisionCorrectionDistance,
  resolveBVHEcctrlCollisionNormalSpeed,
} from './bvh-ecctrl-collision'

describe('BVHEcctrl collision response', () => {
  test('slide cancels inward velocity without restitution or an overlap-derived rebound', () => {
    expect(
      resolveBVHEcctrlCollisionNormalSpeed({
        averageDepth: 0.1,
        deltaSeconds: 1 / 60,
        mode: 'slide',
        pushBackDamping: 0.1,
        pushBackThreshold: 0.001,
        restitution: 0.5,
        velocityIntoSurface: -3,
      }),
    ).toBe(3)
    expect(
      resolveBVHEcctrlCollisionNormalSpeed({
        averageDepth: 0.1,
        deltaSeconds: 1 / 120,
        mode: 'slide',
        pushBackDamping: 0.1,
        pushBackThreshold: 0.001,
        restitution: 0.5,
        velocityIntoSurface: 0,
      }),
    ).toBe(0)
  })

  test('slide resolves overlap with a bounded frame-rate-independent position correction', () => {
    const input = {
      averageDepth: 0.1,
      maxCorrectionDistance: 0.08,
      mode: 'slide' as const,
      skin: 0.001,
    }
    expect(resolveBVHEcctrlCollisionCorrectionDistance(input)).toBe(0.08)
    expect(
      resolveBVHEcctrlCollisionCorrectionDistance({ ...input, averageDepth: 0.02 }),
    ).toBeCloseTo(0.021, 8)
    expect(resolveBVHEcctrlCollisionCorrectionDistance({ ...input, mode: 'push-back' })).toBe(0)
  })
})
