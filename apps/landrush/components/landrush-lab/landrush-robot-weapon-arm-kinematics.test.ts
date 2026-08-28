import { describe, expect, test } from 'bun:test'
import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import {
  captureLandrushRobotWeaponRelativeHandQuaternion,
  createLandrushRobotTwoBoneIkScratch,
  resolveLandrushRobotTwoBoneElbowTarget,
  resolveLandrushRobotWeaponHandQuaternion,
} from './landrush-robot-weapon-arm-kinematics'

describe('Landrush robot weapon arm kinematics', () => {
  test('resolves palm orientation absolutely without accumulating full rotations', () => {
    const weaponQuaternion = new Quaternion()
    const initialHandQuaternion = new Quaternion().setFromEuler(new Euler(0.28, -0.42, 0.16, 'XYZ'))
    const palmLocalQuaternion = new Quaternion().setFromEuler(
      new Euler(MathUtils.degToRad(4), 0, MathUtils.degToRad(-5), 'XYZ'),
    )
    const weaponRelativeHandQuaternion = captureLandrushRobotWeaponRelativeHandQuaternion(
      weaponQuaternion,
      initialHandQuaternion,
      new Quaternion(),
    )
    const restPose = resolveLandrushRobotWeaponHandQuaternion(
      weaponQuaternion,
      palmLocalQuaternion,
      weaponRelativeHandQuaternion,
      new Quaternion(),
    ).clone()
    const resolvedPose = new Quaternion()
    let maximumExcursion = 0

    for (let cycle = 0; cycle < 100; cycle += 1) {
      for (let step = 0; step <= 20; step += 1) {
        const triangularPulse = 1 - Math.abs(step / 10 - 1)
        weaponQuaternion.setFromEuler(
          new Euler(0, 0, MathUtils.degToRad(17) * triangularPulse, 'XYZ'),
        )
        resolveLandrushRobotWeaponHandQuaternion(
          weaponQuaternion,
          palmLocalQuaternion,
          weaponRelativeHandQuaternion,
          resolvedPose,
        )
        maximumExcursion = Math.max(maximumExcursion, restPose.angleTo(resolvedPose))
      }
    }

    expect(MathUtils.radToDeg(maximumExcursion)).toBeCloseTo(17, 8)
    expect(resolvedPose.angleTo(restPose)).toBeLessThan(0.000_000_1)
  })

  test('moves the elbow backward when the wrist recoils opposite the firing direction', () => {
    const shoulder = new Vector3(0, 0, 0)
    const pole = new Vector3(0, -1, 0)
    const scratch = createLandrushRobotTwoBoneIkScratch()
    const extendedElbow = resolveLandrushRobotTwoBoneElbowTarget(
      shoulder,
      new Vector3(0.8, 0, 0),
      0.6,
      0.6,
      pole,
      new Vector3(),
      scratch,
    ).clone()
    const recoiledElbow = resolveLandrushRobotTwoBoneElbowTarget(
      shoulder,
      new Vector3(0.68, 0, 0),
      0.6,
      0.6,
      pole,
      new Vector3(),
      scratch,
    )

    expect(recoiledElbow.x).toBeLessThan(extendedElbow.x)
    expect(extendedElbow.x - recoiledElbow.x).toBeCloseTo(0.06, 8)
  })
})
