const MUZZLE_FLASH_RADIUS = 0.14
const MUZZLE_FLASH_HALF_LENGTH = 0.38

export type ZombieEscapeMuzzleFlashPose = {
  muzzleDirectionX: number
  muzzleDirectionY: number
  muzzleDirectionZ: number
  muzzleX: number
  muzzleY: number
  muzzleZ: number
}

export type ZombieEscapeMuzzleFlashTransform = {
  directionX: number
  directionY: number
  directionZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
  x: number
  y: number
  z: number
}

export function createZombieEscapeMuzzleFlashTransform(): ZombieEscapeMuzzleFlashTransform {
  return {
    directionX: 0,
    directionY: 0,
    directionZ: -1,
    scaleX: 0,
    scaleY: 0,
    scaleZ: 0,
    x: 0,
    y: 0,
    z: 0,
  }
}

export function resolveZombieEscapeMuzzleFlashTransform(
  pose: ZombieEscapeMuzzleFlashPose,
  envelope: number,
  result: ZombieEscapeMuzzleFlashTransform,
) {
  const directionLength = Math.hypot(
    pose.muzzleDirectionX,
    pose.muzzleDirectionY,
    pose.muzzleDirectionZ,
  )
  const inverseDirectionLength = 1 / Math.max(0.000_001, directionLength)
  if (directionLength <= 0.000_001) {
    result.directionX = 0
    result.directionY = 0
    result.directionZ = -1
  } else {
    result.directionX = pose.muzzleDirectionX * inverseDirectionLength
    result.directionY = pose.muzzleDirectionY * inverseDirectionLength
    result.directionZ = pose.muzzleDirectionZ * inverseDirectionLength
  }

  const clampedEnvelope = Number.isFinite(envelope) ? Math.min(1, Math.max(0, envelope)) : 0
  const halfLength = MUZZLE_FLASH_HALF_LENGTH * clampedEnvelope
  result.x = pose.muzzleX + result.directionX * halfLength
  result.y = pose.muzzleY + result.directionY * halfLength
  result.z = pose.muzzleZ + result.directionZ * halfLength
  result.scaleX = MUZZLE_FLASH_RADIUS * clampedEnvelope
  result.scaleY = halfLength
  result.scaleZ = MUZZLE_FLASH_RADIUS * clampedEnvelope
  return result
}
