import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapePresentationPoint,
  createZombieEscapePresentationPose,
  inverseTransformZombieEscapePresentationPoint,
  resolveZombieEscapePresentationPose,
  transformZombieEscapePresentationDirection,
  transformZombieEscapePresentationPoint,
} from '@landrush/zombie-gameplay/zombie-escape-presentation-pose'
import { Quaternion, Vector3 } from 'three'

describe('Zombie Escape presentation pose', () => {
  test('rotates a hit response around the cached body center without allocating an output', () => {
    const output = createZombieEscapePresentationPose()
    const bodyCenterY = 0.92
    expect(
      resolveZombieEscapePresentationPose(3, 2, -4, 1.2, 0.7, 0.5, 0.2, -0.8, output, bodyCenterY),
    ).toBe(output)

    const impulseLength = Math.hypot(0.5, -0.8)
    const directionX = 0.5 / impulseLength
    const directionZ = -0.8 / impulseLength
    const tilt = Math.min(1, impulseLength) * 0.7 * 0.22
    const expected = new Quaternion()
      .setFromAxisAngle(new Vector3(directionZ, 0, -directionX), tilt)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.2))
    expect(output.quaternionX).toBeCloseTo(expected.x, 6)
    expect(output.quaternionY).toBeCloseTo(expected.y, 6)
    expect(output.quaternionZ).toBeCloseTo(expected.z, 6)
    expect(output.quaternionW).toBeCloseTo(expected.w, 6)

    const pivotWorld = transformZombieEscapePresentationPoint(
      output,
      0,
      bodyCenterY,
      0,
      createZombieEscapePresentationPoint(),
    )
    const translationAmount = Math.min(1, impulseLength) * 0.7 * 0.115
    expect(pivotWorld.x).toBeCloseTo(3 + directionX * translationAmount, 6)
    expect(pivotWorld.y).toBeCloseTo(2 + 0.03 + 0.2 * 0.7 * 0.065 + bodyCenterY, 6)
    expect(pivotWorld.z).toBeCloseTo(-4 + directionZ * translationAmount, 6)
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

  test('falls through a deterministic midpoint and locks the settled corpse pose', () => {
    const bodyCenterY = 0.9
    const midpoint = resolveZombieEscapePresentationPose(
      1,
      0,
      2,
      0.35,
      0,
      1,
      0,
      0,
      createZombieEscapePresentationPose(),
      bodyCenterY,
      0.5,
      17,
    )
    const settled = resolveZombieEscapePresentationPose(
      1,
      0,
      2,
      0.35,
      0,
      1,
      0,
      0,
      createZombieEscapePresentationPose(),
      bodyCenterY,
      1,
      17,
    )
    const midpointUp = transformZombieEscapePresentationDirection(
      midpoint,
      0,
      1,
      0,
      createZombieEscapePresentationPoint(),
    )
    const settledUp = transformZombieEscapePresentationDirection(
      settled,
      0,
      1,
      0,
      createZombieEscapePresentationPoint(),
    )
    expect(midpointUp.x).toBeGreaterThan(0.5)
    expect(midpointUp.y).toBeGreaterThan(0.5)
    expect(settledUp.x).toBeGreaterThan(0.99)
    expect(settledUp.y).toBeGreaterThan(0)
    expect(settledUp.y).toBeLessThan(0.06)

    const settledBodyCenter = transformZombieEscapePresentationPoint(
      settled,
      0,
      bodyCenterY,
      0,
      createZombieEscapePresentationPoint(),
    )
    const terminalHorizontalOffset = bodyCenterY * Math.sin(Math.PI * 0.5 - 0.055)
    expect(settledBodyCenter.x).toBeCloseTo(1 + terminalHorizontalOffset, 6)
    expect(settledBodyCenter.z).toBeCloseTo(2, 6)

    const repeated = resolveZombieEscapePresentationPose(
      1,
      0,
      2,
      0.35,
      0,
      1,
      0,
      0,
      createZombieEscapePresentationPose(),
      bodyCenterY,
      1,
      17,
    )
    expect(repeated).toEqual(settled)
  })
})
