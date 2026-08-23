import type { AttachmentSide } from './stair-segment'

export type StairSegmentChainInput = Readonly<{
  attachmentSide: AttachmentSide
  height: number
  length: number
  width: number
}>

export type StairSegmentChainTransform = {
  position: [number, number, number]
  rotation: number
}

export function computeStairSegmentChainTransforms(
  segments: readonly StairSegmentChainInput[],
): StairSegmentChainTransform[] {
  const transforms: StairSegmentChainTransform[] = []
  let currentX = 0
  let currentY = 0
  let currentZ = 0
  let currentRotation = 0

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!
    if (index > 0) {
      const previous = segments[index - 1]!
      const attachX =
        segment.attachmentSide === 'left'
          ? previous.width / 2
          : segment.attachmentSide === 'right'
            ? -previous.width / 2
            : 0
      const attachZ = segment.attachmentSide === 'front' ? previous.length : previous.length / 2
      const [rotatedX, rotatedZ] = rotateStairChainVector(attachX, attachZ, currentRotation)
      currentX += rotatedX
      currentY += previous.height
      currentZ += rotatedZ
      if (segment.attachmentSide === 'left') currentRotation += Math.PI / 2
      if (segment.attachmentSide === 'right') currentRotation -= Math.PI / 2
    }
    transforms.push({
      position: [currentX, currentY, currentZ],
      rotation: currentRotation,
    })
  }

  return transforms
}

function rotateStairChainVector(x: number, z: number, rotation: number) {
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  return [x * cosine + z * sine, -x * sine + z * cosine] as const
}
