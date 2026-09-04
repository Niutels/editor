import {
  createZombieEscapePresentationPoint,
  inverseTransformZombieEscapePresentationDirection,
  inverseTransformZombieEscapePresentationPoint,
  transformZombieEscapePresentationDirection,
  transformZombieEscapePresentationPoint,
  type ZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'

export type ZombieEscapeImpactAttachment = {
  normalX: number
  normalY: number
  normalZ: number
  x: number
  y: number
  z: number
}

export type ZombieEscapeBallisticSample = {
  velocityX: number
  velocityY: number
  velocityZ: number
  x: number
  y: number
  z: number
}

export function createZombieEscapeImpactAttachment(): ZombieEscapeImpactAttachment {
  return { normalX: 0, normalY: 0, normalZ: 1, x: 0, y: 0, z: 0 }
}

export function createZombieEscapeBallisticSample(): ZombieEscapeBallisticSample {
  return { velocityX: 0, velocityY: 0, velocityZ: 0, x: 0, y: 0, z: 0 }
}

export function resolveZombieEscapeBallisticSample(
  originX: number,
  originY: number,
  originZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  normalOffset: number,
  initialVelocityX: number,
  initialVelocityY: number,
  initialVelocityZ: number,
  gravity: number,
  age: number,
  output: ZombieEscapeBallisticSample,
) {
  output.velocityX = initialVelocityX
  output.velocityY = initialVelocityY - gravity * age
  output.velocityZ = initialVelocityZ
  output.x = originX + normalX * normalOffset + initialVelocityX * age
  output.y = originY + normalY * normalOffset + initialVelocityY * age - gravity * age * age * 0.5
  output.z = originZ + normalZ * normalOffset + initialVelocityZ * age
  return output
}

const capturePointScratch = createZombieEscapePresentationPoint()
const captureNormalScratch = createZombieEscapePresentationPoint()

export function captureZombieEscapeImpactAttachment(
  worldX: number,
  worldY: number,
  worldZ: number,
  worldNormalX: number,
  worldNormalY: number,
  worldNormalZ: number,
  pose: ZombieEscapePresentationPose,
  output: ZombieEscapeImpactAttachment,
) {
  inverseTransformZombieEscapePresentationPoint(pose, worldX, worldY, worldZ, capturePointScratch)
  inverseTransformZombieEscapePresentationDirection(
    pose,
    worldNormalX,
    worldNormalY,
    worldNormalZ,
    captureNormalScratch,
  )
  output.x = capturePointScratch.x
  output.y = capturePointScratch.y
  output.z = capturePointScratch.z
  output.normalX = captureNormalScratch.x
  output.normalY = captureNormalScratch.y
  output.normalZ = captureNormalScratch.z
  normalizeZombieEscapeAttachmentNormal(output)
  return output
}

export function resolveZombieEscapeImpactAttachment(
  localX: number,
  localY: number,
  localZ: number,
  localNormalX: number,
  localNormalY: number,
  localNormalZ: number,
  pose: ZombieEscapePresentationPose,
  output: ZombieEscapeImpactAttachment,
) {
  transformZombieEscapePresentationPoint(pose, localX, localY, localZ, output)
  transformZombieEscapePresentationDirection(
    pose,
    localNormalX,
    localNormalY,
    localNormalZ,
    captureNormalScratch,
  )
  output.normalX = captureNormalScratch.x
  output.normalY = captureNormalScratch.y
  output.normalZ = captureNormalScratch.z
  normalizeZombieEscapeAttachmentNormal(output)
  return output
}

function normalizeZombieEscapeAttachmentNormal(output: ZombieEscapeImpactAttachment) {
  const normalLength = Math.hypot(output.normalX, output.normalY, output.normalZ)
  if (normalLength > 0.000_001) {
    const inverseLength = 1 / normalLength
    output.normalX *= inverseLength
    output.normalY *= inverseLength
    output.normalZ *= inverseLength
  } else {
    output.normalX = 0
    output.normalY = 0
    output.normalZ = 1
  }
}
