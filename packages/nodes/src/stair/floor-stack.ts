import {
  type AnyNode,
  type AnyNodeId,
  computeStairSegmentChainTransforms,
  type FloorPlacedFootprint,
  type StairNode,
  type StairSegmentNode,
} from '@pascal-app/core'

export { computeStairSegmentChainTransforms as computeStairSegmentFloorStackTransforms }

export function getStairFloorPlacedFootprints(
  stair: StairNode,
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
): FloorPlacedFootprint[] {
  if ((stair.stairType ?? 'straight') !== 'straight') {
    return getArcStairFloorPlacedFootprints(stair)
  }

  const segments = (stair.children ?? [])
    .map((childId) => nodes[childId as AnyNodeId])
    .filter((node): node is StairSegmentNode => node?.type === 'stair-segment')

  return getStairSegmentFloorPlacedFootprints(stair, segments)
}

const MAX_ARC_FOOTPRINT_SWEEP = Math.PI / 12

function getArcStairFloorPlacedFootprints(stair: StairNode): FloorPlacedFootprint[] {
  const isSpiral = stair.stairType === 'spiral'
  const innerRadius = Math.max(isSpiral ? 0.05 : 0.2, stair.innerRadius ?? (isSpiral ? 0.2 : 0.9))
  const outerRadius = innerRadius + Math.max(stair.width ?? 1, 0.4)
  const sweepAngle = stair.sweepAngle ?? (isSpiral ? Math.PI * 2 : Math.PI / 2)
  const stepCount = Math.max(2, Math.round(stair.stepCount ?? 10))
  const sliceCount = Math.max(stepCount, Math.ceil(Math.abs(sweepAngle) / MAX_ARC_FOOTPRINT_SWEEP))
  const footprints: FloorPlacedFootprint[] = []

  for (let index = 0; index < sliceCount; index += 1) {
    const startAngle = -sweepAngle / 2 + (sweepAngle * index) / sliceCount
    const endAngle = -sweepAngle / 2 + (sweepAngle * (index + 1)) / sliceCount
    const midAngle = (startAngle + endAngle) / 2
    const halfSweep = Math.abs(endAngle - startAngle) / 2
    const projectedInnerRadius = innerRadius * Math.cos(halfSweep)
    const radialSize = outerRadius - projectedInnerRadius
    const tangentialSize = 2 * outerRadius * Math.sin(halfSweep)
    const centerRadius = (outerRadius + projectedInnerRadius) / 2
    const [offsetX, offsetZ] = rotateXZ(
      Math.cos(midAngle) * centerRadius,
      Math.sin(midAngle) * centerRadius,
      stair.rotation,
    )

    footprints.push({
      position: [stair.position[0] + offsetX, stair.position[1], stair.position[2] + offsetZ],
      dimensions: [Math.max(radialSize, 0.01), 0.01, Math.max(tangentialSize, 0.01)],
      rotation: [0, midAngle - stair.rotation, 0],
    })
  }

  if (isSpiral && (stair.showCenterColumn ?? true)) {
    const columnRadius = Math.max(0.05, Math.min(innerRadius * 0.72, innerRadius - 0.03))
    footprints.push({
      position: stair.position,
      dimensions: [columnRadius * 2, 0.01, columnRadius * 2],
      rotation: [0, 0, 0],
    })
  }

  return footprints
}

export function getStairSegmentFloorPlacedFootprints(
  stair: StairNode,
  segments: readonly StairSegmentNode[],
): FloorPlacedFootprint[] {
  const transforms = computeStairSegmentChainTransforms(segments)

  return segments.map((segment, index) => {
    const transform = transforms[index]!
    const [centerOffsetX, centerOffsetZ] = rotateXZ(0, segment.length / 2, transform.rotation)
    const centerInGroupX = transform.position[0] + centerOffsetX
    const centerInGroupZ = transform.position[2] + centerOffsetZ
    const [centerOffsetWorldX, centerOffsetWorldZ] = rotateXZ(
      centerInGroupX,
      centerInGroupZ,
      stair.rotation,
    )

    return {
      position: [
        stair.position[0] + centerOffsetWorldX,
        stair.position[1] + transform.position[1],
        stair.position[2] + centerOffsetWorldZ,
      ],
      dimensions: [
        segment.width,
        Math.max(segment.height, segment.thickness, 0.01),
        segment.length,
      ],
      rotation: [0, stair.rotation + transform.rotation, 0],
    }
  })
}

function rotateXZ(x: number, z: number, angle: number): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos + z * sin, -x * sin + z * cos]
}
