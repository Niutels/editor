import polygonClipping, { type Pair, type Polygon, type Ring } from 'polygon-clipping'
import type { LandrushPoint2 } from '@/components/landrush/types'

export type ParcelAllocationOptions = {
  count: number
  maxEdges: number
  roadReserveMeters?: number
  seed: string | number
  shoreSetbackMeters: number
  simplifyToleranceMeters: number
  splitJitter: number
  squareness: number
}

export type ParcelAllocationParcel = {
  area: number
  aspectRatio: number
  centroid: LandrushPoint2
  color: string
  compactness: number
  edgeCount: number
  id: string
  index: number
  neighborIds: readonly string[]
  points: readonly LandrushPoint2[]
  rawPoints: readonly LandrushPoint2[]
  reservedArea: number
}

export type ParcelAllocationResult = {
  availableArea: number
  boundary: readonly LandrushPoint2[]
  coveredArea: number
  parcels: readonly ParcelAllocationParcel[]
  simplifiedArea: number
}

type RandomSource = () => number

type PartitionLeaf = {
  key: string
  points: LandrushPoint2[]
}

type SplitCandidate = {
  left: LandrushPoint2[]
  right: LandrushPoint2[]
  score: number
}

const EPSILON = 0.000001
const MIN_SPLIT_AREA = 0.5
const MAX_SPLIT_DEPTH = 32
const MAX_SIMPLIFIED_AREA_COVERAGE = 1.1
const MIN_SIMPLIFIED_AREA_COVERAGE = 0.9
const PARCEL_ROAD_RESERVE_ROUND_SEGMENTS = 12
const PARCEL_ROAD_RESERVE_SNAP_SCALE = 10_000

const PARCEL_COLORS = [
  '#f2c94c',
  '#6fcf97',
  '#56ccf2',
  '#bb6bd9',
  '#f2994a',
  '#2f80ed',
  '#eb5757',
  '#27ae60',
  '#f4a7b9',
  '#9bcd67',
  '#80b7b3',
  '#d7b96e',
] as const

export function allocateParcels(
  surfacePoints: readonly LandrushPoint2[],
  options: ParcelAllocationOptions,
): ParcelAllocationResult {
  const count = clampInteger(options.count, 1, 64)
  const maxEdges = clampInteger(options.maxEdges, 3, 15)
  const boundary = prepareBoundary(surfacePoints, options.shoreSetbackMeters)
  const availableArea = polygonArea(boundary)
  const random = createRandom(String(options.seed))
  const leaves = partitionPolygon(boundary, count, options, random, 'parcel', 0)
  const ids = leaves.map((_, index) => `parcel-${String(index + 1).padStart(2, '0')}`)
  const neighborSets = createNeighborSets(leaves, ids)
  const parcels = leaves.map<ParcelAllocationParcel>((leaf, index) => {
    const reservedPoints = reserveParcelRoadArea(
      leaf.points,
      Math.max(0, options.roadReserveMeters ?? 0),
    )
    const reservedArea = polygonArea(reservedPoints)
    const points = simplifyParcelPoints(
      reservedPoints,
      maxEdges,
      Math.max(0, options.simplifyToleranceMeters),
    )
    const area = polygonArea(points)

    return {
      area,
      aspectRatio: polygonAspectRatio(points),
      centroid: polygonCentroid(points),
      color: PARCEL_COLORS[index % PARCEL_COLORS.length]!,
      compactness: polygonCompactness(points),
      edgeCount: points.length,
      id: ids[index]!,
      index,
      neighborIds: [...neighborSets[index]!].sort(),
      points,
      rawPoints: leaf.points,
      reservedArea,
    }
  })

  return {
    availableArea,
    boundary,
    coveredArea: leaves.reduce((total, leaf) => total + polygonArea(leaf.points), 0),
    parcels,
    simplifiedArea: parcels.reduce((total, parcel) => total + parcel.area, 0),
  }
}

function partitionPolygon(
  polygon: readonly LandrushPoint2[],
  count: number,
  options: ParcelAllocationOptions,
  random: RandomSource,
  key: string,
  depth: number,
): PartitionLeaf[] {
  const cleanPolygon = cleanPoints(polygon)
  if (count <= 1 || cleanPolygon.length < 3 || depth >= MAX_SPLIT_DEPTH) {
    return [{ key, points: cleanPolygon }]
  }

  const leftCount = Math.floor(count / 2)
  const rightCount = count - leftCount
  const split = chooseSplit(cleanPolygon, leftCount / count, options, random, depth)

  if (!split) return [{ key, points: cleanPolygon }]

  return [
    ...partitionPolygon(split.left, leftCount, options, random, `${key}-a`, depth + 1),
    ...partitionPolygon(split.right, rightCount, options, random, `${key}-b`, depth + 1),
  ]
}

function chooseSplit(
  polygon: readonly LandrushPoint2[],
  targetRatio: number,
  options: ParcelAllocationOptions,
  random: RandomSource,
  depth: number,
): SplitCandidate | null {
  let best: SplitCandidate | null = null
  const parentArea = polygonArea(polygon)
  if (parentArea <= MIN_SPLIT_AREA * 2) return null

  for (const axis of candidateAxes(polygon, random, options.splitJitter, depth)) {
    const threshold = thresholdForAreaRatio(polygon, axis, targetRatio)
    const left = clipByProjection(polygon, axis, threshold, 'less')
    const right = clipByProjection(polygon, axis, threshold, 'greater')
    const leftArea = polygonArea(left)
    const rightArea = polygonArea(right)
    if (left.length < 3 || right.length < 3) continue
    if (leftArea <= MIN_SPLIT_AREA || rightArea <= MIN_SPLIT_AREA) continue

    const areaError = Math.abs(leftArea / (leftArea + rightArea) - targetRatio)
    const aspectPenalty =
      Math.log(orientedAspectRatio(left, axis)) + Math.log(orientedAspectRatio(right, axis))
    const compactPenalty = 2 - polygonCompactness(left) - polygonCompactness(right)
    const edgePenalty =
      Math.max(0, left.length - options.maxEdges) + Math.max(0, right.length - options.maxEdges)
    const sliverPenalty = Math.max(0, 0.08 - Math.min(leftArea, rightArea) / parentArea) * 20
    const organicNudge = random() * clamp01(options.splitJitter) * 0.14
    const shapeWeight = 0.55 + clamp01(options.squareness) * 1.65
    const score =
      areaError * 18 +
      aspectPenalty * shapeWeight +
      compactPenalty * (0.7 + clamp01(options.squareness)) +
      edgePenalty * 0.11 +
      sliverPenalty -
      organicNudge

    if (!best || score < best.score) {
      best = { left, right, score }
    }
  }

  return best
}

function thresholdForAreaRatio(
  polygon: readonly LandrushPoint2[],
  axis: LandrushPoint2,
  targetRatio: number,
) {
  const projections = polygon.map((point) => dot(point, axis))
  let low = Math.min(...projections)
  let high = Math.max(...projections)
  const targetArea = polygonArea(polygon) * targetRatio

  for (let index = 0; index < 30; index += 1) {
    const middle = (low + high) / 2
    const area = polygonArea(clipByProjection(polygon, axis, middle, 'less'))
    if (area < targetArea) low = middle
    else high = middle
  }

  return (low + high) / 2
}

function clipByProjection(
  polygon: readonly LandrushPoint2[],
  axis: LandrushPoint2,
  threshold: number,
  side: 'greater' | 'less',
) {
  const clipped: LandrushPoint2[] = []
  if (polygon.length < 3) return clipped

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!
    const next = polygon[(index + 1) % polygon.length]!
    const currentProjection = dot(current, axis)
    const nextProjection = dot(next, axis)
    const currentInside =
      side === 'less'
        ? currentProjection <= threshold + EPSILON
        : currentProjection >= threshold - EPSILON
    const nextInside =
      side === 'less'
        ? nextProjection <= threshold + EPSILON
        : nextProjection >= threshold - EPSILON

    if (currentInside && nextInside) {
      clipped.push(next)
    } else if (currentInside && !nextInside) {
      clipped.push(
        intersectionAtProjection(current, next, currentProjection, nextProjection, threshold),
      )
    } else if (!currentInside && nextInside) {
      clipped.push(
        intersectionAtProjection(current, next, currentProjection, nextProjection, threshold),
        next,
      )
    }
  }

  return cleanPoints(clipped)
}

function intersectionAtProjection(
  start: LandrushPoint2,
  end: LandrushPoint2,
  startProjection: number,
  endProjection: number,
  threshold: number,
) {
  const t = (threshold - startProjection) / (endProjection - startProjection || EPSILON)
  return {
    x: lerp(start.x, end.x, clamp01(t)),
    z: lerp(start.z, end.z, clamp01(t)),
  }
}

function candidateAxes(
  polygon: readonly LandrushPoint2[],
  random: RandomSource,
  splitJitter: number,
  depth: number,
) {
  const axes: LandrushPoint2[] = []
  const principal = principalAxis(polygon)
  const phase = (random() - 0.5) * clamp01(splitJitter) * 0.42 + depth * 0.037

  axes.push(principal, perpendicular(principal), { x: 1, z: 0 }, { x: 0, z: 1 })

  for (let index = 0; index < 12; index += 1) {
    const angle = phase + (index / 12) * Math.PI
    axes.push({ x: Math.cos(angle), z: Math.sin(angle) })
  }

  return dedupeAxes(axes)
}

function principalAxis(polygon: readonly LandrushPoint2[]) {
  const center = averagePoint(polygon)
  let xx = 0
  let zz = 0
  let xz = 0

  for (const point of polygon) {
    const dx = point.x - center.x
    const dz = point.z - center.z
    xx += dx * dx
    zz += dz * dz
    xz += dx * dz
  }

  const angle =
    Math.abs(xx - zz) < EPSILON && Math.abs(xz) < EPSILON ? 0 : Math.atan2(2 * xz, xx - zz) / 2
  return { x: Math.cos(angle), z: Math.sin(angle) }
}

function dedupeAxes(axes: readonly LandrushPoint2[]) {
  const result: LandrushPoint2[] = []

  for (const axis of axes) {
    const normalized = normalize(axis)
    if (result.some((existing) => Math.abs(dot(existing, normalized)) > 0.985)) continue
    result.push(normalized)
  }

  return result
}

function prepareBoundary(points: readonly LandrushPoint2[], setback: number) {
  const boundary = cleanPoints(points)
  if (setback <= 0) return boundary

  const center = polygonCentroid(boundary)
  const inset = boundary.map((point) => {
    const dx = center.x - point.x
    const dz = center.z - point.z
    const distance = Math.hypot(dx, dz)
    if (distance <= EPSILON) return point
    const amount = Math.min(setback, distance * 0.72)
    return {
      x: point.x + (dx / distance) * amount,
      z: point.z + (dz / distance) * amount,
    }
  })

  return polygonArea(inset) > polygonArea(boundary) * 0.25 ? cleanPoints(inset) : boundary
}

function reserveParcelRoadArea(points: readonly LandrushPoint2[], reserveMeters: number) {
  const clean = cleanPoints(points)
  if (clean.length < 3 || reserveMeters <= EPSILON) return clean

  const subject = parcelPolygon(clean)
  const edgeReserves = clean.flatMap((start, index) => {
    const end = clean[(index + 1) % clean.length]
    if (!end) return []
    const capsule = parcelEdgeCapsule(start, end, reserveMeters, PARCEL_ROAD_RESERVE_ROUND_SEGMENTS)
    return capsule ? [capsule] : []
  })
  const firstReserve = edgeReserves[0]
  if (!firstReserve) return clean

  const roadReserve = polygonClipping.union(firstReserve, ...edgeReserves.slice(1))
  const buildableArea = polygonClipping.difference(subject, roadReserve)
  const largestPolygon = [...buildableArea].sort(
    (first, second) => polygonPairArea(second[0] ?? []) - polygonPairArea(first[0] ?? []),
  )[0]
  const outerRing = largestPolygon?.[0]
  return outerRing ? cleanPoints(openPairRing(outerRing).map(([x, z]) => ({ x, z }))) : []
}

function parcelPolygon(points: readonly LandrushPoint2[]): Polygon {
  return [closedPairRing(points.map((point) => snappedPair(point.x, point.z)))]
}

function parcelEdgeCapsule(
  start: LandrushPoint2,
  end: LandrushPoint2,
  radius: number,
  roundSegments: number,
): Polygon | null {
  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  if (Math.hypot(deltaX, deltaZ) <= EPSILON) return null

  const heading = Math.atan2(deltaZ, deltaX)
  const capSegments = Math.max(3, Math.floor(roundSegments / 2))
  const ring: Ring = []
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = heading + Math.PI / 2 - (index / capSegments) * Math.PI
    ring.push(snappedPair(end.x + Math.cos(angle) * radius, end.z + Math.sin(angle) * radius))
  }
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = heading - Math.PI / 2 - (index / capSegments) * Math.PI
    ring.push(snappedPair(start.x + Math.cos(angle) * radius, start.z + Math.sin(angle) * radius))
  }
  return [closedPairRing(ring)]
}

function polygonPairArea(ring: Ring) {
  const opened = openPairRing(ring)
  let area = 0
  for (let index = 0; index < opened.length; index += 1) {
    const current = opened[index]
    const next = opened[(index + 1) % opened.length]
    if (current && next) area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area / 2)
}

function openPairRing(ring: Ring): Ring {
  if (ring.length <= 1) return [...ring]
  const first = ring[0]
  const last = ring.at(-1)
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : [...ring]
}

function closedPairRing(ring: Ring): Ring {
  const opened = openPairRing(ring)
  const first = opened[0]
  return first ? [...opened, [first[0], first[1]]] : []
}

function snappedPair(x: number, z: number): Pair {
  return [
    Math.round(x * PARCEL_ROAD_RESERVE_SNAP_SCALE) / PARCEL_ROAD_RESERVE_SNAP_SCALE,
    Math.round(z * PARCEL_ROAD_RESERVE_SNAP_SCALE) / PARCEL_ROAD_RESERVE_SNAP_SCALE,
  ]
}

function simplifyParcelPoints(
  points: readonly LandrushPoint2[],
  maxEdges: number,
  tolerance: number,
) {
  const clean = cleanPoints(points)
  const minimumArea = polygonArea(clean) * MIN_SIMPLIFIED_AREA_COVERAGE
  const maximumArea = polygonArea(clean) * MAX_SIMPLIFIED_AREA_COVERAGE
  let simplified = removeSoftVertices(clean, tolerance, minimumArea, maximumArea)

  while (simplified.length > maxEdges && simplified.length > 3) {
    const next = removeLeastImportantVertex(simplified, minimumArea, maximumArea)
    if (!next) break
    simplified = next
  }

  return simplified
}

function removeSoftVertices(
  points: readonly LandrushPoint2[],
  tolerance: number,
  minimumArea: number,
  maximumArea: number,
) {
  if (points.length <= 3 || tolerance <= 0) return [...points]

  let current = [...points]
  while (current.length > 3) {
    let best:
      | {
          importance: number
          points: LandrushPoint2[]
        }
      | undefined

    for (let index = 0; index < current.length; index += 1) {
      const previous = current[(index - 1 + current.length) % current.length]!
      const point = current[index]!
      const following = current[(index + 1) % current.length]!
      const importance = triangleArea(previous, point, following)
      if (distanceToSegment(point, previous, following) > tolerance) continue
      if (importance > tolerance * 2) continue

      const candidate = removeParcelVertex(current, index, minimumArea, maximumArea)
      if (!candidate || (best && importance >= best.importance)) continue
      best = { importance, points: candidate }
    }

    if (!best) break
    current = best.points
  }

  return current
}

function removeLeastImportantVertex(
  points: readonly LandrushPoint2[],
  minimumArea: number,
  maximumArea: number,
): LandrushPoint2[] | null {
  let best: LandrushPoint2[] | null = null
  let bestArea = Number.POSITIVE_INFINITY

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!
    const point = points[index]!
    const following = points[(index + 1) % points.length]!
    const area = triangleArea(previous, point, following)
    if (area >= bestArea) continue

    const candidate = removeParcelVertex(points, index, minimumArea, maximumArea)
    if (!candidate) continue
    bestArea = area
    best = candidate
  }

  return best
}

function removeParcelVertex(
  points: readonly LandrushPoint2[],
  index: number,
  minimumArea: number,
  maximumArea: number,
) {
  const candidate = points.filter((_, candidateIndex) => candidateIndex !== index)
  const candidateArea = polygonArea(candidate)
  if (candidateArea + EPSILON < minimumArea || candidateArea - EPSILON > maximumArea) return null
  return parcelPolygonIsSimple(candidate) ? candidate : null
}

function parcelPolygonIsSimple(points: readonly LandrushPoint2[]) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex]
    const firstEnd = points[(firstIndex + 1) % points.length]
    if (!(firstStart && firstEnd)) continue

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (secondIndex === firstIndex + 1) continue
      if (firstIndex === 0 && secondIndex === points.length - 1) continue

      const secondStart = points[secondIndex]
      const secondEnd = points[(secondIndex + 1) % points.length]
      if (!(secondStart && secondEnd)) continue
      if (parcelSegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return false
    }
  }

  return true
}

function parcelSegmentsIntersect(
  firstStart: LandrushPoint2,
  firstEnd: LandrushPoint2,
  secondStart: LandrushPoint2,
  secondEnd: LandrushPoint2,
) {
  const firstSideStart = parcelTurn(firstStart, firstEnd, secondStart)
  const firstSideEnd = parcelTurn(firstStart, firstEnd, secondEnd)
  const secondSideStart = parcelTurn(secondStart, secondEnd, firstStart)
  const secondSideEnd = parcelTurn(secondStart, secondEnd, firstEnd)

  if (
    ((firstSideStart > EPSILON && firstSideEnd < -EPSILON) ||
      (firstSideStart < -EPSILON && firstSideEnd > EPSILON)) &&
    ((secondSideStart > EPSILON && secondSideEnd < -EPSILON) ||
      (secondSideStart < -EPSILON && secondSideEnd > EPSILON))
  ) {
    return true
  }

  return (
    (Math.abs(firstSideStart) <= EPSILON &&
      parcelPointOnSegment(secondStart, firstStart, firstEnd)) ||
    (Math.abs(firstSideEnd) <= EPSILON && parcelPointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(secondSideStart) <= EPSILON &&
      parcelPointOnSegment(firstStart, secondStart, secondEnd)) ||
    (Math.abs(secondSideEnd) <= EPSILON && parcelPointOnSegment(firstEnd, secondStart, secondEnd))
  )
}

function parcelTurn(start: LandrushPoint2, end: LandrushPoint2, point: LandrushPoint2) {
  return (end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x)
}

function parcelPointOnSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  return (
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.z >= Math.min(start.z, end.z) - EPSILON &&
    point.z <= Math.max(start.z, end.z) + EPSILON
  )
}

function createNeighborSets(leaves: readonly PartitionLeaf[], ids: readonly string[]) {
  const neighborSets = leaves.map(() => new Set<string>())

  for (let a = 0; a < leaves.length; a += 1) {
    for (let b = a + 1; b < leaves.length; b += 1) {
      if (sharedBoundaryLength(leaves[a]!.points, leaves[b]!.points) < 0.35) continue
      neighborSets[a]!.add(ids[b]!)
      neighborSets[b]!.add(ids[a]!)
    }
  }

  if (leaves.length > 1) {
    for (let index = 0; index < leaves.length; index += 1) {
      if (neighborSets[index]!.size > 0) continue
      const nearestIndex = nearestLeafIndex(index, leaves)
      if (nearestIndex === index) continue
      neighborSets[index]!.add(ids[nearestIndex]!)
      neighborSets[nearestIndex]!.add(ids[index]!)
    }
  }

  return neighborSets
}

function nearestLeafIndex(index: number, leaves: readonly PartitionLeaf[]) {
  const center = polygonCentroid(leaves[index]!.points)
  let bestIndex = index
  let bestDistance = Number.POSITIVE_INFINITY

  for (let candidate = 0; candidate < leaves.length; candidate += 1) {
    if (candidate === index) continue
    const candidateCenter = polygonCentroid(leaves[candidate]!.points)
    const distance = distance2(center, candidateCenter)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = candidate
    }
  }

  return bestIndex
}

function sharedBoundaryLength(a: readonly LandrushPoint2[], b: readonly LandrushPoint2[]) {
  let length = 0

  for (let ai = 0; ai < a.length; ai += 1) {
    const aStart = a[ai]!
    const aEnd = a[(ai + 1) % a.length]!

    for (let bi = 0; bi < b.length; bi += 1) {
      const bStart = b[bi]!
      const bEnd = b[(bi + 1) % b.length]!
      length += segmentOverlapLength(aStart, aEnd, bStart, bEnd)
    }
  }

  return length
}

function segmentOverlapLength(
  aStart: LandrushPoint2,
  aEnd: LandrushPoint2,
  bStart: LandrushPoint2,
  bEnd: LandrushPoint2,
) {
  const ax = aEnd.x - aStart.x
  const az = aEnd.z - aStart.z
  const bx = bEnd.x - bStart.x
  const bz = bEnd.z - bStart.z
  const aLength = Math.hypot(ax, az)
  const bLength = Math.hypot(bx, bz)
  if (aLength <= EPSILON || bLength <= EPSILON) return 0
  if (Math.abs(ax * bz - az * bx) / (aLength * bLength) > 0.002) return 0
  if (distanceToLine(bStart, aStart, aEnd) > 0.04 || distanceToLine(bEnd, aStart, aEnd) > 0.04)
    return 0

  const useX = Math.abs(ax) >= Math.abs(az)
  const aMin = Math.min(useX ? aStart.x : aStart.z, useX ? aEnd.x : aEnd.z)
  const aMax = Math.max(useX ? aStart.x : aStart.z, useX ? aEnd.x : aEnd.z)
  const bMin = Math.min(useX ? bStart.x : bStart.z, useX ? bEnd.x : bEnd.z)
  const bMax = Math.max(useX ? bStart.x : bStart.z, useX ? bEnd.x : bEnd.z)
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin)
  if (overlap <= 0) return 0

  const axisLength = Math.abs(useX ? ax : az)
  return axisLength > EPSILON ? overlap * (aLength / axisLength) : overlap
}

export function polygonArea(points: readonly LandrushPoint2[]) {
  return Math.abs(signedPolygonArea(points))
}

export function polygonCentroid(points: readonly LandrushPoint2[]): LandrushPoint2 {
  const signedArea = signedPolygonArea(points)
  if (Math.abs(signedArea) <= EPSILON) return averagePoint(points)

  let x = 0
  let z = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const cross = current.x * next.z - next.x * current.z
    x += (current.x + next.x) * cross
    z += (current.z + next.z) * cross
  }

  return {
    x: x / (6 * signedArea),
    z: z / (6 * signedArea),
  }
}

export function polygonCompactness(points: readonly LandrushPoint2[]) {
  const area = polygonArea(points)
  const perimeter = polygonPerimeter(points)
  return perimeter > EPSILON ? clamp01((Math.PI * 4 * area) / (perimeter * perimeter)) : 0
}

export function polygonAspectRatio(points: readonly LandrushPoint2[]) {
  return orientedAspectRatio(points, principalAxis(points))
}

function orientedAspectRatio(points: readonly LandrushPoint2[], axis: LandrushPoint2) {
  const side = perpendicular(axis)
  const axisRange = projectionRange(points, axis)
  const sideRange = projectionRange(points, side)
  const width = Math.max(axisRange.max - axisRange.min, EPSILON)
  const depth = Math.max(sideRange.max - sideRange.min, EPSILON)
  return Math.max(width, depth) / Math.min(width, depth)
}

function projectionRange(points: readonly LandrushPoint2[], axis: LandrushPoint2) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const projection = dot(point, axis)
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  }

  return { max, min }
}

function signedPolygonArea(points: readonly LandrushPoint2[]) {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue
    area += current.x * next.z - next.x * current.z
  }

  return area / 2
}

function polygonPerimeter(points: readonly LandrushPoint2[]) {
  let perimeter = 0

  for (let index = 0; index < points.length; index += 1) {
    perimeter += distance2(points[index]!, points[(index + 1) % points.length]!)
  }

  return perimeter
}

function cleanPoints(points: readonly LandrushPoint2[]) {
  const clean: LandrushPoint2[] = []

  for (const point of points) {
    const previous = clean.at(-1)
    if (previous && distance2(previous, point) <= 0.0001) continue
    clean.push({ x: point.x, z: point.z })
  }

  const first = clean[0]
  const last = clean.at(-1)
  if (first && last && clean.length > 1 && distance2(first, last) <= 0.0001) {
    clean.pop()
  }

  return Math.abs(signedPolygonArea(clean)) > EPSILON ? clean : []
}

function triangleArea(a: LandrushPoint2, b: LandrushPoint2, c: LandrushPoint2) {
  return Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz || EPSILON
  const t = clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function distanceToLine(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz) || EPSILON
  return Math.abs((point.x - start.x) * dz - (point.z - start.z) * dx) / length
}

function averagePoint(points: readonly LandrushPoint2[]): LandrushPoint2 {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0

  for (const point of points) {
    x += point.x
    z += point.z
  }

  return { x: x / points.length, z: z / points.length }
}

function perpendicular(point: LandrushPoint2) {
  return { x: -point.z, z: point.x }
}

function normalize(point: LandrushPoint2) {
  const length = Math.hypot(point.x, point.z) || 1
  return { x: point.x / length, z: point.z / length }
}

function dot(a: LandrushPoint2, b: LandrushPoint2) {
  return a.x * b.x + a.z * b.z
}

function distance2(a: LandrushPoint2, b: LandrushPoint2) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)))
}

function createRandom(seed: string): RandomSource {
  let state = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
