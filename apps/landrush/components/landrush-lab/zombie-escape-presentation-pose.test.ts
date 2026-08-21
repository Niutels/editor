import { describe, expect, test } from 'bun:test'
import { Euler, Quaternion, Vector3 } from 'three'
import {
  createZombieEscapePresentationPoint,
  createZombieEscapePresentationPose,
  inverseTransformZombieEscapePresentationPoint,
  resolveZombieEscapePresentationPose,
  transformZombieEscapePresentationDirection,
  transformZombieEscapePresentationPoint,
} from './zombie-escape-presentation-pose'

describe('Zombie Escape presentation pose', () => {
  test('matches the rendered YXZ root transform without allocating an output', () => {
    const output = createZombieEscapePresentationPose()
    expect(resolveZombieEscapePresentationPose(3, 2, -4, 1.2, 0.7, 0.5, 0.2, -0.8, output)).toBe(
      output,
    )

    const expected = new Quaternion().setFromEuler(
      new Euler(-(-0.8) * 0.7 * 0.16, 1.2, 0.5 * 0.7 * 0.16, 'YXZ'),
    )
    expect(output.quaternionX).toBeCloseTo(expected.x, 6)
    expect(output.quaternionY).toBeCloseTo(expected.y, 6)
    expect(output.quaternionZ).toBeCloseTo(expected.z, 6)
    expect(output.quaternionW).toBeCloseTo(expected.w, 6)
  })

  test('round-trips points and rotates directions with the same quaternion', () => {
    const pose = resolveZombieEscapePresentationPose(
      -2,
      0,
      5,
      -0.7,
      0.9,
      -0.4,
      0.3,
      0.8,
      createZombieEscapePresentationPose(),
    )
    const world = transformZombieEscapePresentationPoint(
      pose,
      0.3,
      1.2,
      -0.5,
      createZombieEscapePresentationPoint(),
    )
    const local = inverseTransformZombieEscapePresentationPoint(
      pose,
      world.x,
      world.y,
      world.z,
      createZombieEscapePresentationPoint(),
    )
    expect(local.x).toBeCloseTo(0.3, 6)
    expect(local.y).toBeCloseTo(1.2, 6)
    expect(local.z).toBeCloseTo(-0.5, 6)

    const actualDirection = transformZombieEscapePresentationDirection(
      pose,
      0,
      0,
      1,
      createZombieEscapePresentationPoint(),
    )
    const expectedDirection = new Vector3(0, 0, 1).applyQuaternion(
      new Quaternion(pose.quaternionX, pose.quaternionY, pose.quaternionZ, pose.quaternionW),
    )
    expect(actualDirection.x).toBeCloseTo(expectedDirection.x, 6)
    expect(actualDirection.y).toBeCloseTo(expectedDirection.y, 6)
    expect(actualDirection.z).toBeCloseTo(expectedDirection.z, 6)
  })
})
