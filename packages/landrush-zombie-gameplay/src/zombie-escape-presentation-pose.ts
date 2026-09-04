import {
  resolveZombieEscapeDeathFallbackAngle,
  resolveZombieEscapeDeathFallRadians,
} from './zombie-escape-character-motion'

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
  bodyCenterY = 0,
  deathProgress = 0,
  deathFallOrdinal = 0,
) {
  const reaction = Number.isFinite(hitReaction) ? Math.max(0, Math.min(1, hitReaction)) : 0
  const impulseX = Number.isFinite(hitImpulseX) ? hitImpulseX : 0
  const impulseY = Number.isFinite(hitImpulseY) ? hitImpulseY : 0
  const impulseZ = Number.isFinite(hitImpulseZ) ? hitImpulseZ : 0
  const horizontalImpulse = Math.hypot(impulseX, impulseZ)
  const boundedHorizontalImpulse = Math.min(1, horizontalImpulse)
  const inverseHorizontalImpulse = 1 / Math.max(0.000_001, horizontalImpulse)
  let directionX = impulseX * inverseHorizontalImpulse
  let directionZ = impulseZ * inverseHorizontalImpulse
  if (horizontalImpulse <= 0.000_001) {
    const fallbackAngle = resolveZombieEscapeDeathFallbackAngle(deathFallOrdinal)
    directionX = Math.sin(fallbackAngle)
    directionZ = Math.cos(fallbackAngle)
  }

  const hitTilt = boundedHorizontalImpulse * reaction * 0.22
  const halfHitTilt = hitTilt * 0.5
  const halfHeading = heading * 0.5
  const sineHitTilt = Math.sin(halfHitTilt)
  const cosineHitTilt = Math.cos(halfHitTilt)
  const cosineHeading = Math.cos(halfHeading)
  const sineHeading = Math.sin(halfHeading)
  const hitQuaternionX = directionZ * sineHitTilt
  const hitQuaternionZ = -directionX * sineHitTilt
  const baseQuaternionX = hitQuaternionX * cosineHeading - hitQuaternionZ * sineHeading
  const baseQuaternionY = cosineHitTilt * sineHeading
  const baseQuaternionZ = hitQuaternionZ * cosineHeading + hitQuaternionX * sineHeading
  const baseQuaternionW = cosineHitTilt * cosineHeading

  const pivotY = Number.isFinite(bodyCenterY) ? Math.max(0, bodyCenterY) : 0
  const pivotSine = Math.sin(hitTilt) * pivotY
  const translationAmount = boundedHorizontalImpulse * reaction * 0.115
  output.x = rootX + directionX * translationAmount - directionX * pivotSine
  output.y =
    rootY +
    ZOMBIE_ESCAPE_PRESENTATION_ROOT_Y +
    Math.max(0, Math.min(1, impulseY)) * reaction * 0.065 +
    pivotY * (1 - Math.cos(hitTilt))
  output.z = rootZ + directionZ * translationAmount - directionZ * pivotSine

  const fallRadians = resolveZombieEscapeDeathFallRadians(deathProgress)
  const halfFall = fallRadians * 0.5
  const sineFall = Math.sin(halfFall)
  const fallQuaternionX = directionZ * sineFall
  const fallQuaternionZ = -directionX * sineFall
  const fallQuaternionW = Math.cos(halfFall)

  output.quaternionX =
    fallQuaternionX * baseQuaternionW +
    fallQuaternionW * baseQuaternionX -
    fallQuaternionZ * baseQuaternionY
  output.quaternionY =
    fallQuaternionW * baseQuaternionY +
    fallQuaternionZ * baseQuaternionX -
    fallQuaternionX * baseQuaternionZ
  output.quaternionZ =
    fallQuaternionZ * baseQuaternionW +
    fallQuaternionW * baseQuaternionZ +
    fallQuaternionX * baseQuaternionY
  output.quaternionW =
    fallQuaternionW * baseQuaternionW -
    fallQuaternionX * baseQuaternionX -
    fallQuaternionZ * baseQuaternionZ
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
