import polygonClipping, { type Pair, type Polygon, type Ring } from 'polygon-clipping'
import { ShapeUtils, Vector2 } from 'three'
import type { LandrushPoint2 } from '@/components/landrush/types'

export type LandrushBuildGridTriangle = readonly [LandrushPoint2, LandrushPoint2, LandrushPoint2]

export function clipLandrushBuildGridQuadToParcel(
  quad: readonly LandrushPoint2[],
  parcelRing: readonly LandrushPoint2[],
) {
  const quadPolygon = landrushBuildGridPolygon(quad)
  const parcelPolygon = landrushBuildGridPolygon(parcelRing)
  if (quadPolygon.length === 0 || parcelPolygon.length === 0) return []

  const triangles: LandrushBuildGridTriangle[] = []
  const clipped = polygonClipping.intersection(quadPolygon, parcelPolygon)
  for (const polygon of clipped) {
    const rings = polygon.map(openLandrushBuildGridRing).filter((ring) => ring.length >= 3)
    const contourRing = rings[0]
    if (!contourRing) continue
    const contour = contourRing.map(([x, z]) => new Vector2(x, z))
    const holeRings = rings.slice(1)
    const holes = holeRings.map((ring) => ring.map(([x, z]) => new Vector2(x, z)))
    const points = [contourRing, ...holeRings].flat()
    for (const face of ShapeUtils.triangulateShape(contour, holes)) {
      const [firstIndex, secondIndex, thirdIndex] = face
      if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined)
        continue
      const first = points[firstIndex]
      const second = points[secondIndex]
      const third = points[thirdIndex]
      if (!(first && second && third)) continue
      triangles.push([
        { x: first[0], z: first[1] },
        { x: second[0], z: second[1] },
        { x: third[0], z: third[1] },
      ])
    }
  }
  return triangles
}

function landrushBuildGridPolygon(points: readonly LandrushPoint2[]): Polygon {
  if (points.length < 3) return []
  const ring: Ring = points.map(({ x, z }) => [x, z] satisfies Pair)
  const first = ring[0]
  const last = ring.at(-1)
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]])
  }
  return ring.length >= 4 ? [ring] : []
}

function openLandrushBuildGridRing(ring: Ring) {
  const first = ring[0]
  const last = ring.at(-1)
  return first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
}
