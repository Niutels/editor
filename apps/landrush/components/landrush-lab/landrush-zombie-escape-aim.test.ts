import { describe, expect, test } from 'bun:test'
import { Plane, Ray, Vector3 } from 'three'
import { resolveLandrushZombieEscapeAimPlaneElevation } from './landrush-zombie-escape-aim'

describe('Landrush Zombie Escape aim plane', () => {
  test('projects the pointer onto the current player floor instead of global ground', () => {
    const ray = new Ray(new Vector3(0, 10, 10), new Vector3(0, -1, -1).normalize())
    const plane = new Plane(new Vector3(0, 1, 0))
    const intersection = new Vector3()
    const playerFloorY = resolveLandrushZombieEscapeAimPlaneElevation(3, 0)
    plane.constant = -playerFloorY

    expect(ray.intersectPlane(plane, intersection)).not.toBeNull()
    expect(intersection.y).toBeCloseTo(3, 6)
    expect(intersection.z).toBeCloseTo(3, 6)
    expect(resolveLandrushZombieEscapeAimPlaneElevation(Number.NaN, 1.25)).toBe(1.25)
  })
})
