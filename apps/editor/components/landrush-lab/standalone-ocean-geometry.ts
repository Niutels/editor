import { BufferGeometry, Float32BufferAttribute } from 'three'

export type StandaloneOceanDiskGeometryOptions = {
  detailRadialSegments: number
  detailRadius: number
  horizonAngularSegments: number
  horizonRadialSegments: number
  outerRadius: number
}

export type StandaloneOceanDiskGeometryMetrics = {
  detailRadialSegments: number
  detailRadius: number
  horizonRadialSegments: number
  outerRadius: number
  triangleCount: number
  vertexCount: number
}

export function createStandaloneOceanDiskGeometry({
  detailRadialSegments,
  detailRadius,
  horizonAngularSegments,
  horizonRadialSegments,
  outerRadius,
}: StandaloneOceanDiskGeometryOptions) {
  const resolvedDetailRadialSegments = Math.max(1, Math.round(detailRadialSegments))
  const resolvedHorizonRadialSegments = Math.max(1, Math.round(horizonRadialSegments))
  const resolvedHorizonAngularSegments = Math.max(8, Math.round(horizonAngularSegments))
  const resolvedDetailRadius = Math.max(0.001, detailRadius)
  const resolvedOuterRadius = Math.max(resolvedDetailRadius + 0.001, outerRadius)
  const positions = [0, 0, 0]
  const normals = [0, 0, 1]
  const uvs = [0.5, 0.5]
  const indices: number[] = []
  const rings: number[][] = []

  function appendRing(radius: number, segmentCount: number) {
    const ring: number[] = []
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      ring.push(positions.length / 3)
      positions.push(x, y, 0)
      normals.push(0, 0, 1)
      uvs.push(0.5 + x / (resolvedOuterRadius * 2), 0.5 + y / (resolvedOuterRadius * 2))
    }
    rings.push(ring)
    return ring
  }

  for (let ringIndex = 1; ringIndex <= resolvedDetailRadialSegments; ringIndex += 1) {
    const radius = (ringIndex / resolvedDetailRadialSegments) * resolvedDetailRadius
    appendRing(radius, Math.max(8, Math.round(Math.PI * 2 * ringIndex)))
  }

  const detailOuterRing = rings.at(-1)
  const detailOuterSegmentCount = detailOuterRing?.length ?? resolvedHorizonAngularSegments
  for (let ringIndex = 1; ringIndex <= resolvedHorizonRadialSegments; ringIndex += 1) {
    const progress = ringIndex / resolvedHorizonRadialSegments
    const radius = resolvedDetailRadius + (resolvedOuterRadius - resolvedDetailRadius) * progress
    const easedProgress = progress * progress * (3 - 2 * progress)
    const segmentCount = Math.round(
      detailOuterSegmentCount +
        (resolvedHorizonAngularSegments - detailOuterSegmentCount) * easedProgress,
    )
    appendRing(radius, Math.max(8, segmentCount))
  }

  const firstRing = rings[0]
  if (firstRing) {
    for (let segment = 0; segment < firstRing.length; segment += 1) {
      indices.push(0, firstRing[segment] ?? 0, firstRing[(segment + 1) % firstRing.length] ?? 0)
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const innerRing = rings[ringIndex]
    const outerRing = rings[ringIndex + 1]
    if (!innerRing || !outerRing) continue
    stitchStandaloneOceanRings(indices, innerRing, outerRing)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = 'standalone-ocean-disk'
  geometry.userData.standaloneOceanDisk = {
    detailRadialSegments: resolvedDetailRadialSegments,
    detailRadius: resolvedDetailRadius,
    horizonRadialSegments: resolvedHorizonRadialSegments,
    outerRadius: resolvedOuterRadius,
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
  } satisfies StandaloneOceanDiskGeometryMetrics
  return geometry
}

function stitchStandaloneOceanRings(indices: number[], innerRing: number[], outerRing: number[]) {
  let innerIndex = 0
  let outerIndex = 0

  while (innerIndex < innerRing.length || outerIndex < outerRing.length) {
    const innerProgress =
      innerIndex < innerRing.length ? (innerIndex + 1) / innerRing.length : Number.POSITIVE_INFINITY
    const outerProgress =
      outerIndex < outerRing.length ? (outerIndex + 1) / outerRing.length : Number.POSITIVE_INFINITY
    const innerVertex = innerRing[innerIndex % innerRing.length] ?? 0
    const outerVertex = outerRing[outerIndex % outerRing.length] ?? 0

    if (innerProgress <= outerProgress) {
      indices.push(innerVertex, outerVertex, innerRing[(innerIndex + 1) % innerRing.length] ?? 0)
      innerIndex += 1
    } else {
      indices.push(innerVertex, outerVertex, outerRing[(outerIndex + 1) % outerRing.length] ?? 0)
      outerIndex += 1
    }
  }
}
