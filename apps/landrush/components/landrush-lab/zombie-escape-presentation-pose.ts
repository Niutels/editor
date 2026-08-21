export const ZOMBIE_ESCAPE_PRESENTATION_ROOT_Y = 0.03

export type ZombieEscapePresentationPoint = {
  x: number
  y: number
  z: number
}

export type ZombieEscapePresentationPose = ZombieEscapePresentationPoint & {
  quaternionW: number
  quaternionX: number
  quaternionY: number
  quaternionZ: number
}

export function createZombieEscapePresentationPoint(): ZombieEscapePresentationPoint {
  return { x: 0, y: 0, z: 0 }
}

export function createZombieEscapePresentationPose(): ZombieEscapePresentationPose {
  return {
    quaternionW: 1,
    quaternionX: 0,
    quaternionY: 0,
    quaternionZ: 0,
    x: 0,
    y: ZOMBIE_ESCAPE_PRESENTATION_ROOT_Y,
    z: 0,
  }
}

export function resolveZombieEscapePresentationPose(
  rootX: number,
  rootY: number,
  rootZ: number,
  heading: number,
  hitReaction: number,
  hitImpulseX: number,
  hitImpulseY: number,
  hitImpulseZ: number,
  output: ZombieEscapePresentationPose,
) {
  const reaction = Math.max(0, hitReaction)
  const pitch = -hitImpulseZ * reaction * 0.16
  const roll = hitImpulseX * reaction * 0.16
  const halfPitch = pitch * 0.5
  const halfHeading = heading * 0.5
  const halfRoll = roll * 0.5
  const cosinePitch = Math.cos(halfPitch)
  const cosineHeading = Math.cos(halfHeading)
  const cosineRoll = Math.cos(halfRoll)
  const sinePitch = Math.sin(halfPitch)
  const sineHeading = Math.sin(halfHeading)
  const sineRoll = Math.sin(halfRoll)

  output.x = rootX + hitImpulseX * reaction * 0.09
  output.y = rootY + ZOMBIE_ESCAPE_PRESENTATION_ROOT_Y + Math.max(0, hitImpulseY) * reaction * 0.06
  output.z = rootZ + hitImpulseZ * reaction * 0.09
  output.quaternionX = sinePitch * cosineHeading * cosineRoll + cosinePitch * sineHeading * sineRoll
  output.quaternionY = cosinePitch * sineHeading * cosineRoll - sinePitch * cosineHeading * sineRoll
  output.quaternionZ = cosinePitch * cosineHeading * sineRoll - sinePitch * sineHeading * cosineRoll
  output.quaternionW = cosinePitch * cosineHeading * cosineRoll + sinePitch * sineHeading * sineRoll
  return output
}

export function transformZombieEscapePresentationPoint(
  pose: ZombieEscapePresentationPose,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapePresentationPoint,
) {
  rotateByQuaternion(pose, x, y, z, output)
  output.x += pose.x
  output.y += pose.y
  output.z += pose.z
  return output
}

export function inverseTransformZombieEscapePresentationPoint(
  pose: ZombieEscapePresentationPose,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapePresentationPoint,
) {
  rotateByInverseQuaternion(pose, x - pose.x, y - pose.y, z - pose.z, output)
  return output
}

export function transformZombieEscapePresentationDirection(
  pose: ZombieEscapePresentationPose,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapePresentationPoint,
) {
  rotateByQuaternion(pose, x, y, z, output)
  return output
}

export function inverseTransformZombieEscapePresentationDirection(
  pose: ZombieEscapePresentationPose,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapePresentationPoint,
) {
  rotateByInverseQuaternion(pose, x, y, z, output)
  return output
}

function rotateByQuaternion(
  pose: ZombieEscapePresentationPose,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapePresentationPoint,
) {
  const twiceCrossX = 2 * (pose.quaternionY * z - pose.quaternionZ * y)
  const twiceCrossY = 2 * (pose.quaternionZ * x - pose.quaternionX * z)
  const twiceCrossZ = 2 * (pose.quaternionX * y - pose.quaternionY * x)
  output.x =
    x +
    pose.quaternionW * twiceCrossX +
    pose.quaternionY * twiceCrossZ -
    pose.quaternionZ * twiceCrossY
  output.y =
    y +
    pose.quaternionW * twiceCrossY +
    pose.quaternionZ * twiceCrossX -
    pose.quaternionX * twiceCrossZ
  output.z =
    z +
    pose.quaternionW * twiceCrossZ +
    pose.quaternionX * twiceCrossY -
    pose.quaternionY * twiceCrossX
  return output
}

function rotateByInverseQuaternion(
  pose: ZombieEscapePresentationPose,
  x: number,
  y: number,
  z: number,
  output: ZombieEscapePresentationPoint,
) {
  const twiceCrossX = 2 * (-pose.quaternionY * z + pose.quaternionZ * y)
  const twiceCrossY = 2 * (-pose.quaternionZ * x + pose.quaternionX * z)
  const twiceCrossZ = 2 * (-pose.quaternionX * y + pose.quaternionY * x)
  output.x =
    x +
    pose.quaternionW * twiceCrossX -
    pose.quaternionY * twiceCrossZ +
    pose.quaternionZ * twiceCrossY
  output.y =
    y +
    pose.quaternionW * twiceCrossY -
    pose.quaternionZ * twiceCrossX +
    pose.quaternionX * twiceCrossZ
  output.z =
    z +
    pose.quaternionW * twiceCrossZ -
    pose.quaternionX * twiceCrossY +
    pose.quaternionY * twiceCrossX
  return output
}
