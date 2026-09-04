import type { ZombieEscapeShotEventPool } from '@landrush/zombie-gameplay/zombie-escape-simulation'

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
  return resolveMuzzleFlashTransform(
    pose.muzzleX,
    pose.muzzleY,
    pose.muzzleZ,
    pose.muzzleDirectionX,
    pose.muzzleDirectionY,
    pose.muzzleDirectionZ,
    envelope,
    result,
  )
}

export function resolveZombieEscapeShotMuzzleFlashTransform(
  shots: Pick<
    ZombieEscapeShotEventPool,
    'originX' | 'originY' | 'originZ' | 'directionX' | 'directionY' | 'directionZ'
  >,
  slot: number,
  envelope: number,
  result: ZombieEscapeMuzzleFlashTransform,
) {
  return resolveMuzzleFlashTransform(
    shots.originX[slot]!,
    shots.originY[slot]!,
    shots.originZ[slot]!,
    shots.directionX[slot]!,
    shots.directionY[slot]!,
    shots.directionZ[slot]!,
    envelope,
    result,
  )
}

function resolveMuzzleFlashTransform(
  x: number,
  y: number,
  z: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  envelope: number,
  result: ZombieEscapeMuzzleFlashTransform,
) {
  const directionLength = Math.hypot(directionX, directionY, directionZ)
  const inverseDirectionLength = 1 / Math.max(0.000_001, directionLength)
  if (directionLength <= 0.000_001) {
    result.directionX = 0
    result.directionY = 0
    result.directionZ = -1
  } else {
    result.directionX = directionX * inverseDirectionLength
    result.directionY = directionY * inverseDirectionLength
    result.directionZ = directionZ * inverseDirectionLength
  }

  const clampedEnvelope = Number.isFinite(envelope) ? Math.min(1, Math.max(0, envelope)) : 0
  const halfLength = MUZZLE_FLASH_HALF_LENGTH * clampedEnvelope
  result.x = x + result.directionX * halfLength
  result.y = y + result.directionY * halfLength
  result.z = z + result.directionZ * halfLength
  result.scaleX = MUZZLE_FLASH_RADIUS * clampedEnvelope
  result.scaleY = halfLength
  result.scaleZ = MUZZLE_FLASH_RADIUS * clampedEnvelope
  return result
}
