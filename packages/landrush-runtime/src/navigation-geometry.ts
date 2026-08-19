export type LandrushNavigationPoint2 = {
  x: number
  z: number
}

const DEFAULT_EDGE_TOLERANCE_METERS = 0.04

export function normalize2(x: number, z: number) {
  const length = Math.hypot(x, z)
  if (length < 0.000001) return { x: 0, z: -1 }
  return { x: x / length, z: z / length }
}

export function dot2(a: LandrushNavigationPoint2, b: LandrushNavigationPoint2) {
  return a.x * b.x + a.z * b.z
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function openPointRing(points: readonly LandrushNavigationPoint2[]) {
  if (points.length < 2) return [...points]
  const first = points[0]
  const last = points.at(-1)
  if (first && last && pointsAlmostEqual(first, last, 0.001)) return points.slice(0, -1)
  return [...points]
}

export function pointInPolygon(
  point: LandrushNavigationPoint2,
  polygon: readonly LandrushNavigationPoint2[],
) {
  const ring = openPointRing(polygon)
  let inside = false
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; index += 1) {
    const current = ring[index]
    const previous = ring[previousIndex]
    if (!(current && previous)) continue
    const crosses = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    if (crosses && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

export function landrushIslandNavigationSegmentIntersectsPolygon(
  start: LandrushNavigationPoint2,
  end: LandrushNavigationPoint2,
  polygon: readonly LandrushNavigationPoint2[],
) {
  if (pointInPolygon(end, polygon)) return true

  const ring = openPointRing(polygon)
  for (let index = 0; index < ring.length; index += 1) {
    const edgeStart = ring[index]
    const edgeEnd = ring[(index + 1) % ring.length]
    if (!edgeStart || !edgeEnd) continue
    if (segmentsIntersect2(start, end, edgeStart, edgeEnd)) return true
  }
  return false
}

export function segmentsIntersect2(
  firstStart: LandrushNavigationPoint2,
  firstEnd: LandrushNavigationPoint2,
  secondStart: LandrushNavigationPoint2,
  secondEnd: LandrushNavigationPoint2,
) {
  const firstDirection = orient2(firstStart, firstEnd, secondStart)
  const secondDirection = orient2(firstStart, firstEnd, secondEnd)
  const thirdDirection = orient2(secondStart, secondEnd, firstStart)
  const fourthDirection = orient2(secondStart, secondEnd, firstEnd)

  if (
    Math.sign(firstDirection) !== Math.sign(secondDirection) &&
    Math.sign(thirdDirection) !== Math.sign(fourthDirection)
  ) {
    return true
  }

  return (
    pointOnSegment2(secondStart, firstStart, firstEnd, firstDirection) ||
    pointOnSegment2(secondEnd, firstStart, firstEnd, secondDirection) ||
    pointOnSegment2(firstStart, secondStart, secondEnd, thirdDirection) ||
    pointOnSegment2(firstEnd, secondStart, secondEnd, fourthDirection)
  )
}

export function pointsAlmostEqual2(
  first: LandrushNavigationPoint2,
  second: LandrushNavigationPoint2,
) {
  return pointsAlmostEqual(first, second, 0.000001)
}

export function rectFootprint({
  center,
  depth,
  rotation,
  width,
}: {
  center: LandrushNavigationPoint2
  depth: number
  rotation: number
  width: number
}): readonly LandrushNavigationPoint2[] {
  const halfWidth = Math.max(0.04, width / 2)
  const halfDepth = Math.max(0.04, depth / 2)
  return [
    rotateFootprintPoint({ x: -halfWidth, z: -halfDepth }, center, rotation),
    rotateFootprintPoint({ x: halfWidth, z: -halfDepth }, center, rotation),
    rotateFootprintPoint({ x: halfWidth, z: halfDepth }, center, rotation),
    rotateFootprintPoint({ x: -halfWidth, z: halfDepth }, center, rotation),
  ]
}

export function rectFootprintFromAxes({
  center,
  depth,
  normal,
  tangent,
  width,
}: {
  center: LandrushNavigationPoint2
  depth: number
  normal: LandrushNavigationPoint2
  tangent: LandrushNavigationPoint2
  width: number
}): readonly LandrushNavigationPoint2[] {
  const halfWidth = Math.max(0.04, width / 2)
  const halfDepth = Math.max(0.04, depth / 2)
  return [
    {
      x: center.x - tangent.x * halfWidth - normal.x * halfDepth,
      z: center.z - tangent.z * halfWidth - normal.z * halfDepth,
    },
    {
      x: center.x + tangent.x * halfWidth - normal.x * halfDepth,
      z: center.z + tangent.z * halfWidth - normal.z * halfDepth,
    },
    {
      x: center.x + tangent.x * halfWidth + normal.x * halfDepth,
      z: center.z + tangent.z * halfWidth + normal.z * halfDepth,
    },
    {
      x: center.x - tangent.x * halfWidth + normal.x * halfDepth,
      z: center.z - tangent.z * halfWidth + normal.z * halfDepth,
    },
  ]
}

export function segmentFootprint(
  start: LandrushNavigationPoint2,
  end: LandrushNavigationPoint2,
  width: number,
): readonly LandrushNavigationPoint2[] {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length <= 0.000001) {
    return rectFootprint({ center: start, depth: width, rotation: 0, width })
  }

  const halfWidth = Math.max(0.04, width / 2)
  const nx = (-dz / length) * halfWidth
  const nz = (dx / length) * halfWidth
  return [
    { x: start.x + nx, z: start.z + nz },
    { x: end.x + nx, z: end.z + nz },
    { x: end.x - nx, z: end.z - nz },
    { x: start.x - nx, z: start.z - nz },
  ]
}

export function rotateFootprintPoint(
  point: LandrushNavigationPoint2,
  center: LandrushNavigationPoint2,
  rotation: number,
): LandrushNavigationPoint2 {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    x: center.x + point.x * cos - point.z * sin,
    z: center.z + point.x * sin + point.z * cos,
  }
}

export function pointInPolygonOrNearEdge(
  point: LandrushNavigationPoint2,
  polygon: readonly LandrushNavigationPoint2[],
  tolerance = DEFAULT_EDGE_TOLERANCE_METERS,
) {
  return pointInPolygon(point, polygon) || distanceToClosedPolyline(point, polygon) <= tolerance
}

export function distanceToClosedPolyline(
  point: LandrushNavigationPoint2,
  polygon: readonly LandrushNavigationPoint2[],
) {
  const ring = openPointRing(polygon)
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (start && end) best = Math.min(best, distanceToSegment2(point, start, end))
  }
  return best
}

export function distanceToOpenPolyline(
  point: LandrushNavigationPoint2,
  polyline: readonly LandrushNavigationPoint2[],
) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (start && end) best = Math.min(best, distanceToSegment2(point, start, end))
  }
  return best
}

export function closestPointOnClosedPolyline(
  point: LandrushNavigationPoint2,
  polygon: readonly LandrushNavigationPoint2[],
): LandrushNavigationPoint2 | null {
  const ring = openPointRing(polygon)
  let bestDistanceSq = Number.POSITIVE_INFINITY
  let bestPoint: LandrushNavigationPoint2 | null = null
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (!(start && end)) continue
    const candidate = closestPointOnSegment2(point, start, end)
    const distanceSq = (point.x - candidate.x) ** 2 + (point.z - candidate.z) ** 2
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq
      bestPoint = candidate
    }
  }
  return bestPoint
}

export function distanceToSegment2(
  point: LandrushNavigationPoint2,
  start: LandrushNavigationPoint2,
  end: LandrushNavigationPoint2,
) {
  const closest = closestPointOnSegment2(point, start, end)
  return Math.hypot(point.x - closest.x, point.z - closest.z)
}

function orient2(
  a: LandrushNavigationPoint2,
  b: LandrushNavigationPoint2,
  c: LandrushNavigationPoint2,
) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function pointOnSegment2(
  point: LandrushNavigationPoint2,
  start: LandrushNavigationPoint2,
  end: LandrushNavigationPoint2,
  orientation: number,
) {
  if (Math.abs(orientation) > 0.000001) return false
  return (
    point.x >= Math.min(start.x, end.x) - 0.000001 &&
    point.x <= Math.max(start.x, end.x) + 0.000001 &&
    point.z >= Math.min(start.z, end.z) - 0.000001 &&
    point.z <= Math.max(start.z, end.z) + 0.000001
  )
}

function pointsAlmostEqual(
  first: LandrushNavigationPoint2,
  second: LandrushNavigationPoint2,
  tolerance: number,
) {
  return Math.hypot(first.x - second.x, first.z - second.z) <= tolerance
}

function closestPointOnSegment2(
  point: LandrushNavigationPoint2,
  start: LandrushNavigationPoint2,
  end: LandrushNavigationPoint2,
): LandrushNavigationPoint2 {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const t = clamp01(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 0.000001),
  )
  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
  }
}
