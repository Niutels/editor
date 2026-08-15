// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { resolveBVHEcctrlCollisionNormalSpeed } from './bvh-ecctrl-collision'

describe('BVHEcctrl collision response', () => {
  test('sliding cancels inward velocity without creating outward bounce', () => {
    expect(
      resolveBVHEcctrlCollisionNormalSpeed({
        averageDepth: 0.12,
        deltaSeconds: 1 / 60,
        mode: 'slide',
        pushBackDamping: 0.1,
        pushBackThreshold: 0.001,
        restitution: 0.05,
        velocityIntoSurface: -2,
      }),
    ).toBe(2)
  })

  test('push-back retains penetration recovery', () => {
    const normalSpeed = resolveBVHEcctrlCollisionNormalSpeed({
      averageDepth: 0.12,
      deltaSeconds: 1 / 60,
      mode: 'push-back',
      pushBackDamping: 0.1,
      pushBackThreshold: 0.001,
      restitution: 0.05,
      velocityIntoSurface: -2,
    })

    expect(normalSpeed).toBeGreaterThan(2)
  })
})
