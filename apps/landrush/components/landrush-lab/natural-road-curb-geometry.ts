import { BufferGeometry, Float32BufferAttribute } from 'three'

type WorldPolygonRing = readonly (readonly [number, number])[]
type WorldPolygonArea = readonly (readonly WorldPolygonRing[])[]

export type RoundedBoundaryBand = {
  area: WorldPolygonArea
  bottomY: number
  roundoverRadius: number
  roadEdgeBumpHeight?: number
  roadEdgeBumpWidth?: number
  topY: number
}

export function createRoundedWorldPolygonBoundaryWallsGeometry(
  bands: readonly RoundedBoundaryBand[],
  {
    profileSegments,
    role,
  }: {
    profileSegments: number
    role: { key: string; value: string }
  },
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []
  const roundedSegments = Math.max(2, Math.floor(profileSegments))

  for (const {
    area,
    bottomY,
    roadEdgeBumpHeight = 0,
    roadEdgeBumpWidth = 0,
    roundoverRadius,
    topY,
  } of bands) {
    const height = topY - bottomY
    if (height <= 0.0001) continue
    const radius = Math.min(Math.max(0, roundoverRadius), height * 0.9)
    const profile = createCurbProfile({
      bottomY,
      roadEdgeBumpHeight: Math.max(0, roadEdgeBumpHeight),
      roadEdgeBumpWidth: Math.max(0, roadEdgeBumpWidth),
      radius,
      segments: roundedSegments,
      topY,
    })

    for (const polygon of area) {
      for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
        const ring = openRing(polygon[ringIndex] ?? [])
        if (ring.length < 2) continue
        const signedArea = ringSignedArea(ring)
        const solidSide = ringIndex === 0 ? Math.sign(signedArea) : -Math.sign(signedArea)
        const side = solidSide === 0 ? 1 : solidSide
        const miterDirections = createSolidMiterDirections(ring, side)
        const cumulativeLengths = createCumulativeLengths(ring)
        const totalLength = cumulativeLengths.at(-1) ?? 1
        const rowWidth = ring.length + 1
        const vertexOffset = positions.length / 3

        for (let profileIndex = 0; profileIndex < profile.length; profileIndex += 1) {
          const profilePoint = profile[profileIndex]
          if (!profilePoint) continue
          for (let pointIndex = 0; pointIndex <= ring.length; pointIndex += 1) {
            const sourceIndex = pointIndex % ring.length
            const point = ring[sourceIndex]
            const miter = miterDirections[sourceIndex]
            if (!(point && miter)) continue
            positions.push(
              point[0] + miter[0] * profilePoint.offset,
              profilePoint.y,
              point[1] + miter[1] * profilePoint.offset,
            )
            uvs.push(
              (cumulativeLengths[pointIndex] ?? totalLength) / Math.max(totalLength, 0.0001),
              profilePoint.v,
            )
          }
        }

        for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
          for (let pointIndex = 0; pointIndex < ring.length; pointIndex += 1) {
            const a = vertexOffset + profileIndex * rowWidth + pointIndex
            const b = a + 1
            const c = a + rowWidth
            const d = c + 1
            if (side > 0) {
              indices.push(a, b, c, b, d, c)
            } else {
              indices.push(a, c, b, b, c, d)
            }
          }
        }
      }
    }
  }

  geometry.userData[role.key] = role.value
  geometry.userData.roundedBoundaryProfileSegments = roundedSegments
  if (positions.length === 0 || indices.length === 0) return geometry
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function createCurbProfile({
  bottomY,
  roadEdgeBumpHeight,
  roadEdgeBumpWidth,
  radius,
  segments,
  topY,
}: {
  bottomY: number
  roadEdgeBumpHeight: number
  roadEdgeBumpWidth: number
  radius: number
  segments: number
  topY: number
}) {
  const profile: { offset: number; y: number }[] = [{ offset: 0, y: bottomY }]
  if (radius <= 0.0001) {
    profile.push({ offset: 0, y: topY })
  } else {
    profile.push({ offset: 0, y: topY - radius })
    for (let segment = 1; segment <= segments; segment += 1) {
      const angle = (segment / segments) * (Math.PI / 2)
      profile.push({
        offset: -radius + Math.cos(angle) * radius,
        y: topY - radius + Math.sin(angle) * radius,
      })
    }
  }

  if (roadEdgeBumpHeight > 0.0001 && roadEdgeBumpWidth > 0.0001) {
    for (let segment = 1; segment <= segments; segment += 1) {
      const progress = segment / segments
      profile.push({
        offset: -radius - roadEdgeBumpWidth * progress,
        y: topY + Math.sin(progress * Math.PI) * roadEdgeBumpHeight,
      })
    }
  }

  const distances = [0]
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1]
    const current = profile[index]
    distances.push(
      (distances[index - 1] ?? 0) +
        (previous && current
          ? Math.hypot(current.offset - previous.offset, current.y - previous.y)
          : 0),
    )
  }
  const totalDistance = Math.max(0.0001, distances.at(-1) ?? 0.0001)
  return profile.map((point, index) => ({
    ...point,
    v: (distances[index] ?? 0) / totalDistance,
  }))
}

function createSolidMiterDirections(ring: WorldPolygonRing, solidSide: number) {
  return ring.map((point, index) => {
    const previous = ring[(index - 1 + ring.length) % ring.length]
    const next = ring[(index + 1) % ring.length]
    if (!(previous && next)) return [0, 0] as const
    const previousNormal = solidNormal(previous, point, solidSide)
    const nextNormal = solidNormal(point, next, solidSide)
    const sumX = previousNormal[0] + nextNormal[0]
    const sumZ = previousNormal[1] + nextNormal[1]
    const sumLength = Math.hypot(sumX, sumZ)
    if (sumLength <= 0.0001) return nextNormal
    const bisector = [sumX / sumLength, sumZ / sumLength] as const
    const projection = Math.max(0.4, bisector[0] * nextNormal[0] + bisector[1] * nextNormal[1])
    const miterScale = Math.min(2.5, 1 / projection)
    return [bisector[0] * miterScale, bisector[1] * miterScale] as const
  })
}

function solidNormal(
  start: readonly [number, number],
  end: readonly [number, number],
  solidSide: number,
) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.max(0.0001, Math.hypot(dx, dz))
  return [(-dz / length) * solidSide, (dx / length) * solidSide] as const
}

function createCumulativeLengths(ring: WorldPolygonRing) {
  const lengths = [0]
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    lengths.push(
      (lengths[index] ?? 0) + (start && end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : 0),
    )
  }
  return lengths
}

function openRing(ring: WorldPolygonRing): WorldPolygonRing {
  if (ring.length <= 1) return [...ring]
  const first = ring[0]
  const last = ring.at(-1)
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1)
  return [...ring]
}

function ringSignedArea(ring: WorldPolygonRing) {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    if (current && next) area += current[0] * next[1] - next[0] * current[1]
  }
  return area * 0.5
}
