import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'

const LANDRUSH_BUILD_GRID_DEFAULT_STEP_METERS = 0.5
const LANDRUSH_BUILD_GRID_SEGMENT_STEP_METERS = 1
const LANDRUSH_BUILD_GRID_LINE_WIDTH_METERS = 0.055
const LANDRUSH_BUILD_GRID_EXTENT_METERS = 4
const LANDRUSH_BUILD_GRID_ISLAND_EDGE_CLEARANCE_METERS = 1.35
const LANDRUSH_BUILD_GRID_ISLAND_EDGE_FADE_METERS = 4.25
const LANDRUSH_BUILD_GRID_ROAD_EDGE_FADE_METERS = 2

export type LandrushBuildGridGeometryData = {
  alphas: number[]
  positions: number[]
}

export function createLandrushBuildGridGeometryData(
  parcel: { points: readonly LandrushPoint2[] } | null,
  gridStep = LANDRUSH_BUILD_GRID_DEFAULT_STEP_METERS,
  buildableBoundaryPoints: readonly LandrushPoint2[] = [],
  roadClearanceSegments: readonly LandrushRoadSegment[] = [],
): LandrushBuildGridGeometryData {
  const geometry = { alphas: [], positions: [] } satisfies LandrushBuildGridGeometryData
  if (!parcel || parcel.points.length < 3) return geometry

  const resolvedGridStep =
    Number.isFinite(gridStep) && gridStep > 0 ? gridStep : LANDRUSH_BUILD_GRID_DEFAULT_STEP_METERS
  const mask = {
    islandRing: openPointRing(buildableBoundaryPoints),
    parcelRing: openPointRing(parcel.points),
    roadClearanceSegments,
  }
  const bounds = boundsForPoints(mask.parcelRing)
  const segmentStep = Math.max(resolvedGridStep, LANDRUSH_BUILD_GRID_SEGMENT_STEP_METERS)
  const minX =
    Math.floor((bounds.minX - LANDRUSH_BUILD_GRID_EXTENT_METERS) / resolvedGridStep) *
    resolvedGridStep
  const maxX =
    Math.ceil((bounds.maxX + LANDRUSH_BUILD_GRID_EXTENT_METERS) / resolvedGridStep) *
    resolvedGridStep
  const minZ =
    Math.floor((bounds.minZ - LANDRUSH_BUILD_GRID_EXTENT_METERS) / resolvedGridStep) *
    resolvedGridStep
  const maxZ =
    Math.ceil((bounds.maxZ + LANDRUSH_BUILD_GRID_EXTENT_METERS) / resolvedGridStep) *
    resolvedGridStep

  for (let x = minX; x <= maxX + 0.0001; x += resolvedGridStep) {
    for (let z = minZ; z < maxZ - 0.0001; z += segmentStep) {
      pushLandrushBuildGridSegment(geometry, mask, x, z, x, Math.min(maxZ, z + segmentStep))
    }
  }
  for (let z = minZ; z <= maxZ + 0.0001; z += resolvedGridStep) {
    for (let x = minX; x < maxX - 0.0001; x += segmentStep) {
      pushLandrushBuildGridSegment(geometry, mask, x, z, Math.min(maxX, x + segmentStep), z)
    }
  }

  return geometry
}

function pushLandrushBuildGridSegment(
  geometry: LandrushBuildGridGeometryData,
  mask: {
    islandRing: readonly LandrushPoint2[]
    parcelRing: readonly LandrushPoint2[]
    roadClearanceSegments: readonly LandrushRoadSegment[]
  },
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const startAlpha = landrushBuildGridAlphaAtPoint({ x: startX, z: startZ }, mask)
  const endAlpha = landrushBuildGridAlphaAtPoint({ x: endX, z: endZ }, mask)
  if (Math.max(startAlpha, endAlpha) <= 0.001) return

  const deltaX = endX - startX
  const deltaZ = endZ - startZ
  const length = Math.hypot(deltaX, deltaZ)
  if (length <= 0.000001) return

  const halfWidth = LANDRUSH_BUILD_GRID_LINE_WIDTH_METERS / 2
  const offsetX = (-deltaZ / length) * halfWidth
  const offsetZ = (deltaX / length) * halfWidth
  const startLeftX = startX + offsetX
  const startLeftZ = startZ + offsetZ
  const startRightX = startX - offsetX
  const startRightZ = startZ - offsetZ
  const endLeftX = endX + offsetX
  const endLeftZ = endZ + offsetZ
  const endRightX = endX - offsetX
  const endRightZ = endZ - offsetZ

  geometry.positions.push(
    startLeftX,
    0,
    startLeftZ,
    endLeftX,
    0,
    endLeftZ,
    startRightX,
    0,
    startRightZ,
    startRightX,
    0,
    startRightZ,
    endLeftX,
    0,
    endLeftZ,
    endRightX,
    0,
    endRightZ,
  )
  geometry.alphas.push(startAlpha, endAlpha, startAlpha, startAlpha, endAlpha, endAlpha)
}

function landrushBuildGridAlphaAtPoint(
  point: LandrushPoint2,
  mask: {
    islandRing: readonly LandrushPoint2[]
    parcelRing: readonly LandrushPoint2[]
    roadClearanceSegments: readonly LandrushRoadSegment[]
  },
) {
  const parcelAlpha = landrushBuildGridParcelAlphaAtPoint(point, mask.parcelRing)
  if (parcelAlpha <= 0) return 0

  const islandAlpha = landrushBuildGridIslandAlphaAtPoint(point, mask.islandRing)
  if (islandAlpha <= 0) return 0

  const roadAlpha = landrushBuildGridRoadAlphaAtPoint(point, mask.roadClearanceSegments)
  return Math.min(parcelAlpha, islandAlpha, roadAlpha)
}

export function landrushBuildGridRoadAlphaAtPoint(
  point: LandrushPoint2,
  roadClearanceSegments: readonly Pick<LandrushRoadSegment, 'points' | 'width'>[],
) {
  let clearanceDistance = Number.POSITIVE_INFINITY
  for (const road of roadClearanceSegments) {
    const halfWidth = Math.max(0, road.width) / 2
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!start || !end) continue
      clearanceDistance = Math.min(
        clearanceDistance,
        distanceToSegment(point, start, end) - halfWidth,
      )
    }
  }
  if (!Number.isFinite(clearanceDistance)) return 1
  return clamp01(clearanceDistance / LANDRUSH_BUILD_GRID_ROAD_EDGE_FADE_METERS)
}

export function landrushBuildGridParcelAlphaAtPoint(
  point: LandrushPoint2,
  parcelRing: readonly LandrushPoint2[],
) {
  if (parcelRing.length < 3) return 0
  const distance = distanceToLandrushBuildGridRing(point, parcelRing)
  const signedDistance = pointInLandrushBuildGridRing(point, parcelRing) ? distance : -distance
  return clamp01(
    (signedDistance + LANDRUSH_BUILD_GRID_ISLAND_EDGE_CLEARANCE_METERS) /
      LANDRUSH_BUILD_GRID_ISLAND_EDGE_FADE_METERS,
  )
}

function landrushBuildGridIslandAlphaAtPoint(
  point: LandrushPoint2,
  islandRing: readonly LandrushPoint2[],
) {
  if (islandRing.length < 3) return 1
  if (!pointInLandrushBuildGridRing(point, islandRing)) return 0
  const distance = distanceToLandrushBuildGridRing(point, islandRing)
  if (
    distance >
    LANDRUSH_BUILD_GRID_ISLAND_EDGE_CLEARANCE_METERS + LANDRUSH_BUILD_GRID_ISLAND_EDGE_FADE_METERS
  ) {
    return 1
  }
  return clamp01(
    (distance - LANDRUSH_BUILD_GRID_ISLAND_EDGE_CLEARANCE_METERS) /
      LANDRUSH_BUILD_GRID_ISLAND_EDGE_FADE_METERS,
  )
}

function pointInLandrushBuildGridRing(point: LandrushPoint2, ring: readonly LandrushPoint2[]) {
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

function distanceToLandrushBuildGridRing(point: LandrushPoint2, ring: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.z - start.z)
  const amount = clamp01(
    ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / lengthSquared,
  )
  return Math.hypot(point.x - (start.x + deltaX * amount), point.z - (start.z + deltaZ * amount))
}

function boundsForPoints(points: readonly LandrushPoint2[]) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  return { minX, maxX, minZ, maxZ }
}

function openPointRing(points: readonly LandrushPoint2[]) {
  if (points.length < 2) return points
  const first = points[0]
  const last = points.at(-1)
  return first && last && first.x === last.x && first.z === last.z ? points.slice(0, -1) : points
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
