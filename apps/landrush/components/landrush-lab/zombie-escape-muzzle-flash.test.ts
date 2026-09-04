import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeMuzzleFlashTransform,
  resolveZombieEscapeMuzzleFlashTransform,
  resolveZombieEscapeShotMuzzleFlashTransform,
} from './zombie-escape-muzzle-flash'

describe('zombie escape muzzle flash transform', () => {
  test('anchors each shared shot to its own canonical origin and direction', () => {
    const shots = {
      originX: new Float32Array([15, -9]),
      originY: new Float32Array([2, 6]),
      originZ: new Float32Array([-3, 21]),
      directionX: new Float32Array([3, 0]),
      directionY: new Float32Array([4, 0]),
      directionZ: new Float32Array([0, -2]),
    }
    const transform = createZombieEscapeMuzzleFlashTransform()
    for (const slot of [0, 1, 0]) {
      const expected = resolveZombieEscapeMuzzleFlashTransform(
        {
          muzzleX: shots.originX[slot]!,
          muzzleY: shots.originY[slot]!,
          muzzleZ: shots.originZ[slot]!,
          muzzleDirectionX: shots.directionX[slot]!,
          muzzleDirectionY: shots.directionY[slot]!,
          muzzleDirectionZ: shots.directionZ[slot]!,
        },
        0.75,
        createZombieEscapeMuzzleFlashTransform(),
      )
      expect(resolveZombieEscapeShotMuzzleFlashTransform(shots, slot, 0.75, transform)).toBe(
        transform,
      )
      expect(transform).toEqual(expected)
      expect(transform.x - transform.directionX * transform.scaleY).toBeCloseTo(
        shots.originX[slot]!,
        12,
      )
      expect(transform.z - transform.directionZ * transform.scaleY).toBeCloseTo(
        shots.originZ[slot]!,
        12,
      )
    }
    expect([...shots.originX]).toEqual([15, -9])
    expect([...shots.directionZ]).toEqual([0, -2])
  })

  test('grows forward while keeping the rear endpoint on the muzzle socket', () => {
    const transform = resolveZombieEscapeMuzzleFlashTransform(
      {
        muzzleDirectionX: 3,
        muzzleDirectionY: 4,
        muzzleDirectionZ: 0,
        muzzleX: 2,
        muzzleY: -1,
        muzzleZ: 5,
      },
      0.75,
      createZombieEscapeMuzzleFlashTransform(),
    )

    expect(transform.directionX).toBeCloseTo(0.6, 12)
    expect(transform.directionY).toBeCloseTo(0.8, 12)
    expect(transform.directionZ).toBe(0)
    expect(transform.scaleX).toBeCloseTo(0.105, 12)
    expect(transform.scaleY).toBeCloseTo(0.285, 12)
    expect(transform.scaleZ).toBeCloseTo(0.105, 12)
    expect(transform.x - transform.directionX * transform.scaleY).toBeCloseTo(2, 12)
    expect(transform.y - transform.directionY * transform.scaleY).toBeCloseTo(-1, 12)
    expect(transform.z - transform.directionZ * transform.scaleY).toBeCloseTo(5, 12)
  })

  test('follows the live recoiling socket without mutating the captured ballistic origin', () => {
    const ballisticOrigin = Object.freeze({ x: 4, y: 1.3, z: -2 })
    const transform = createZombieEscapeMuzzleFlashTransform()
    resolveZombieEscapeMuzzleFlashTransform(
      {
        muzzleDirectionX: 0,
        muzzleDirectionY: 0,
        muzzleDirectionZ: 1,
        muzzleX: ballisticOrigin.x,
        muzzleY: ballisticOrigin.y,
        muzzleZ: ballisticOrigin.z,
      },
      1,
      transform,
    )
    const launchCenterZ = transform.z

    resolveZombieEscapeMuzzleFlashTransform(
      {
        muzzleDirectionX: 0,
        muzzleDirectionY: 0,
        muzzleDirectionZ: 1,
        muzzleX: 4,
        muzzleY: 1.32,
        muzzleZ: -2.075,
      },
      0.5,
      transform,
    )

    expect(transform.z).not.toBe(launchCenterZ)
    expect(transform.x - transform.directionX * transform.scaleY).toBeCloseTo(4, 12)
    expect(transform.y - transform.directionY * transform.scaleY).toBeCloseTo(1.32, 12)
    expect(transform.z - transform.directionZ * transform.scaleY).toBeCloseTo(-2.075, 12)
    expect(ballisticOrigin).toEqual({ x: 4, y: 1.3, z: -2 })
  })

  test('normalizes malformed direction and envelope inputs deterministically', () => {
    const transform = createZombieEscapeMuzzleFlashTransform()
    resolveZombieEscapeMuzzleFlashTransform(
      {
        muzzleDirectionX: 0,
        muzzleDirectionY: 0,
        muzzleDirectionZ: 0,
        muzzleX: 1,
        muzzleY: 2,
        muzzleZ: 3,
      },
      Number.NaN,
      transform,
    )

    expect(transform).toEqual({
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      scaleX: 0,
      scaleY: 0,
      scaleZ: 0,
      x: 1,
      y: 2,
      z: 3,
    })
  })
})
