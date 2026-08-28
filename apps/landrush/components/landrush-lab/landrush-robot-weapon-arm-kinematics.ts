import { MathUtils, type Quaternion, Vector3 } from 'three'

const MINIMUM_ARM_LENGTH_METERS = 0.000_001

export type LandrushRobotTwoBoneIkScratch = {
  pole: Vector3
  shoulderToTarget: Vector3
}

export function createLandrushRobotTwoBoneIkScratch(): LandrushRobotTwoBoneIkScratch {
  return {
    pole: new Vector3(),
    shoulderToTarget: new Vector3(),
  }
}

export function captureLandrushRobotWeaponRelativeHandQuaternion(
  weaponWorldQuaternion: Quaternion,
  handWorldQuaternion: Quaternion,
  target: Quaternion,
) {
  return target.copy(weaponWorldQuaternion).invert().multiply(handWorldQuaternion).normalize()
}

export function resolveLandrushRobotWeaponHandQuaternion(
  weaponWorldQuaternion: Quaternion,
  palmLocalQuaternion: Quaternion,
  weaponRelativeHandQuaternion: Quaternion,
  target: Quaternion,
) {
  return target
    .copy(weaponWorldQuaternion)
    .multiply(palmLocalQuaternion)
    .multiply(weaponRelativeHandQuaternion)
    .normalize()
}

export function resolveLandrushRobotTwoBoneElbowTarget(
  shoulder: Vector3,
  wristTarget: Vector3,
  upperArmLength: number,
  foreArmLength: number,
  poleDirection: Vector3,
  target: Vector3,
  scratch: LandrushRobotTwoBoneIkScratch,
) {
  const safeUpperArmLength = Math.max(MINIMUM_ARM_LENGTH_METERS, Math.abs(upperArmLength))
  const safeForeArmLength = Math.max(MINIMUM_ARM_LENGTH_METERS, Math.abs(foreArmLength))
  scratch.shoulderToTarget.copy(wristTarget).sub(shoulder)
  const requestedReach = scratch.shoulderToTarget.length()
  if (requestedReach <= MINIMUM_ARM_LENGTH_METERS) {
    scratch.shoulderToTarget.set(1, 0, 0)
  } else {
    scratch.shoulderToTarget.multiplyScalar(1 / requestedReach)
  }

  const minimumReach = Math.abs(safeUpperArmLength - safeForeArmLength) + MINIMUM_ARM_LENGTH_METERS
  const maximumReach = safeUpperArmLength + safeForeArmLength - MINIMUM_ARM_LENGTH_METERS
  const reach = MathUtils.clamp(requestedReach, minimumReach, maximumReach)
  const elbowAxialDistance =
    (safeUpperArmLength * safeUpperArmLength -
      safeForeArmLength * safeForeArmLength +
      reach * reach) /
    (2 * reach)
  const elbowRadialDistance = Math.sqrt(
    Math.max(0, safeUpperArmLength * safeUpperArmLength - elbowAxialDistance * elbowAxialDistance),
  )

  scratch.pole
    .copy(poleDirection)
    .addScaledVector(scratch.shoulderToTarget, -poleDirection.dot(scratch.shoulderToTarget))
  if (scratch.pole.lengthSq() <= MINIMUM_ARM_LENGTH_METERS * MINIMUM_ARM_LENGTH_METERS) {
    scratch.pole.set(0, 1, 0)
    if (Math.abs(scratch.pole.dot(scratch.shoulderToTarget)) > 0.95) {
      scratch.pole.set(0, 0, 1)
    }
    scratch.pole.addScaledVector(
      scratch.shoulderToTarget,
      -scratch.pole.dot(scratch.shoulderToTarget),
    )
  }
  scratch.pole.normalize()

  return target
    .copy(shoulder)
    .addScaledVector(scratch.shoulderToTarget, elbowAxialDistance)
    .addScaledVector(scratch.pole, elbowRadialDistance)
}
