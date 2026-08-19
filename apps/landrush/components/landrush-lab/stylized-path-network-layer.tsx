'use client'

import {
  createWorldPolygonBoundaryWallsGeometry,
  createWorldPolygonSurfaceGeometry,
} from '@landrush/runtime'
import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from 'polygon-clipping'
import { useEffect, useMemo } from 'react'
import { type BufferGeometry, DoubleSide } from 'three'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'

export const STYLIZED_PATH_SIDEWALK_WIDTH_METERS = 0.57
export const STYLIZED_PATH_SIDEWALK_SEAM_METERS = 0.08
export const STYLIZED_PATH_ROADBED_MARGIN_METERS = 0.08
export const STYLIZED_PATH_ROADBED_INSET_METERS =
  STYLIZED_PATH_SIDEWALK_WIDTH_METERS +
  STYLIZED_PATH_SIDEWALK_SEAM_METERS +
  STYLIZED_PATH_ROADBED_MARGIN_METERS
export const STYLIZED_PATH_WIDTH_SCALE = 2.05
export const STYLIZED_PATH_ROADBED_COLOR = '#d5bea1'
export const STYLIZED_PATH_SIDEWALK_COLOR = '#dbc5a8'
export const STYLIZED_PATH_OUTER_CURB_COLOR = '#b2a187'
export const STYLIZED_PATH_ROADBED_WALL_COLOR = '#746f69'
export const STYLIZED_PATH_SEAM_COLOR = '#c7b89e'

const STYLIZED_PATH_SIDEWALK_LIFT_METERS = 0.095
const STYLIZED_PATH_SEAM_LIFT_METERS = 0.088
const STYLIZED_PATH_ROADBED_LIFT_METERS = 0.03
const STYLIZED_PATH_GRASS_LIFT_METERS = 0.018
const STYLIZED_PATH_ROUND_SEGMENTS = 12
const STYLIZED_PATH_BOOLEAN_BATCH_SIZE = 256
const STYLIZED_PATH_MIN_WIDTH_METERS = 0.08
const STYLIZED_PATH_MIN_POLYGON_AREA = 0.0001
const STYLIZED_PATH_SNAP_SCALE = 10_000

type StylizedPathNetworkGeometries = {
  metrics: StylizedPathNetworkMetrics
  outerCurbWalls: BufferGeometry
  roadbedWalls: BufferGeometry
  roadbeds: BufferGeometry
  seams: BufferGeometry
  sidewalks: BufferGeometry
}

export type StylizedPathNetworkMetrics = {
  clippedArea: number
  polygonCount: number
  triangleCount: number
  vertexCount: number
}

export function StylizedPathNetworkLayer({
  elevation,
  perimeter,
  renderOrder,
  roads,
}: {
  elevation: number
  perimeter: readonly LandrushPoint2[]
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
}) {
  const geometries = useMemo(
    () => createStylizedPathNetworkGeometries({ elevation, perimeter, roads }),
    [elevation, perimeter, roads],
  )

  useEffect(
    () => () => {
      geometries.sidewalks.dispose()
      geometries.seams.dispose()
      geometries.roadbeds.dispose()
      geometries.roadbedWalls.dispose()
      geometries.outerCurbWalls.dispose()
    },
    [geometries],
  )

  return (
    <>
      {hasGeometryPositions(geometries.outerCurbWalls) ? (
        <mesh
          geometry={geometries.outerCurbWalls}
          name="stylized-path-outer-curb-walls"
          renderOrder={renderOrder}
        >
          <meshBasicMaterial
            color={STYLIZED_PATH_OUTER_CURB_COLOR}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {hasGeometryPositions(geometries.sidewalks) ? (
        <mesh
          geometry={geometries.sidewalks}
          name="stylized-path-sidewalks"
          renderOrder={renderOrder + 1}
        >
          <meshBasicMaterial
            color={STYLIZED_PATH_SIDEWALK_COLOR}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {hasGeometryPositions(geometries.roadbedWalls) ? (
        <mesh
          geometry={geometries.roadbedWalls}
          name="stylized-path-roadbed-walls"
          renderOrder={renderOrder + 2}
        >
          <meshBasicMaterial
            color={STYLIZED_PATH_ROADBED_WALL_COLOR}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {hasGeometryPositions(geometries.seams) ? (
        <mesh geometry={geometries.seams} name="stylized-path-seams" renderOrder={renderOrder + 3}>
          <meshBasicMaterial
            color={STYLIZED_PATH_SEAM_COLOR}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {hasGeometryPositions(geometries.roadbeds) ? (
        <mesh
          geometry={geometries.roadbeds}
          name="stylized-path-roadbeds"
          renderOrder={renderOrder + 4}
        >
          <meshBasicMaterial
            color={STYLIZED_PATH_ROADBED_COLOR}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </>
  )
}

export function createStylizedPathNetworkGeometries({
  elevation,
  perimeter,
  roads,
}: {
  elevation: number
  perimeter: readonly LandrushPoint2[]
  roads: readonly LandrushRoadSegment[]
}): StylizedPathNetworkGeometries {
  const outerFootprint = clippedRoadFootprint(roads, perimeter, (road) =>
    Math.max(STYLIZED_PATH_MIN_WIDTH_METERS, road.width * STYLIZED_PATH_WIDTH_SCALE),
  )
  const seamFootprint = clippedRoadFootprint(roads, perimeter, (road) =>
    Math.max(
      STYLIZED_PATH_MIN_WIDTH_METERS,
      road.width * STYLIZED_PATH_WIDTH_SCALE - STYLIZED_PATH_SIDEWALK_WIDTH_METERS * 2,
    ),
  )
  const roadbedFootprint = clippedRoadFootprint(roads, perimeter, (road) =>
    Math.max(
      STYLIZED_PATH_MIN_WIDTH_METERS,
      road.width * STYLIZED_PATH_WIDTH_SCALE - STYLIZED_PATH_ROADBED_INSET_METERS * 2,
    ),
  )
  const sidewalkFootprint = cleanMultiPolygon(
    polygonClipping.difference(outerFootprint, seamFootprint),
  )
  const seamBandFootprint = cleanMultiPolygon(
    polygonClipping.difference(seamFootprint, roadbedFootprint),
  )

  const sidewalks = surfaceGeometry(
    sidewalkFootprint,
    elevation + STYLIZED_PATH_SIDEWALK_LIFT_METERS,
    'sidewalks',
  )
  const seams = surfaceGeometry(
    seamBandFootprint,
    elevation + STYLIZED_PATH_SEAM_LIFT_METERS,
    'seams',
  )
  const roadbeds = surfaceGeometry(
    roadbedFootprint,
    elevation + STYLIZED_PATH_ROADBED_LIFT_METERS,
    'roadbeds',
  )
  const outerCurbWalls = boundaryWallGeometry(
    outerFootprint,
    elevation + STYLIZED_PATH_SIDEWALK_LIFT_METERS,
    elevation + STYLIZED_PATH_GRASS_LIFT_METERS,
    'outer-curb-walls',
  )
  const roadbedWalls = boundaryWallGeometry(
    roadbedFootprint,
    elevation + STYLIZED_PATH_SEAM_LIFT_METERS,
    elevation + STYLIZED_PATH_ROADBED_LIFT_METERS,
    'roadbed-walls',
  )
  const surfaceMetrics = [sidewalks, seams, roadbeds, outerCurbWalls, roadbedWalls].map(
    geometryMetrics,
  )

  return {
    metrics: {
      clippedArea: multiPolygonArea(outerFootprint),
      polygonCount: outerFootprint.length,
      triangleCount: surfaceMetrics.reduce((total, metrics) => total + metrics.triangles, 0),
      vertexCount: surfaceMetrics.reduce((total, metrics) => total + metrics.vertices, 0),
    },
    outerCurbWalls,
    roadbedWalls,
    roadbeds,
    seams,
    sidewalks,
  }
}

function clippedRoadFootprint(
  roads: readonly LandrushRoadSegment[],
  perimeter: readonly LandrushPoint2[],
  widthForRoad: (road: LandrushRoadSegment) => number,
) {
  const footprint = bufferedRoadFootprint(roads, widthForRoad)
  const islandPolygon = perimeterPolygon(perimeter)
  if (footprint.length === 0 || islandPolygon.length === 0) return []
  return cleanMultiPolygon(polygonClipping.intersection(footprint, islandPolygon))
}

function bufferedRoadFootprint(
  roads: readonly LandrushRoadSegment[],
  widthForRoad: (road: LandrushRoadSegment) => number,
) {
  const shapes: Polygon[] = []
  const seenSegments = new Set<string>()
  for (const road of roads) {
    const radius = widthForRoad(road) / 2
    const points = cleanRoadPoints(road.points)
    if (points.length === 1 && points[0]) shapes.push(circlePolygon(points[0], radius))
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      if (!(start && end)) continue
      const signature = segmentSignature(start, end, radius)
      if (seenSegments.has(signature)) continue
      seenSegments.add(signature)
      const capsule = segmentCapsule(start, end, radius)
      if (capsule) shapes.push(capsule)
    }
  }

  let result: MultiPolygon = []
  for (let offset = 0; offset < shapes.length; offset += STYLIZED_PATH_BOOLEAN_BATCH_SIZE) {
    const batch = shapes.slice(offset, offset + STYLIZED_PATH_BOOLEAN_BATCH_SIZE)
    const first = batch[0]
    if (!first) continue
    const batchUnion = polygonClipping.union(first, ...batch.slice(1))
    result = result.length === 0 ? batchUnion : polygonClipping.union(result, batchUnion)
  }
  return cleanMultiPolygon(result)
}

function perimeterPolygon(perimeter: readonly LandrushPoint2[]): Polygon {
  const ring = closedRing(cleanRoadPoints(perimeter).map(pointPair))
  return ring.length >= 4 ? [ring] : []
}

function circlePolygon(point: LandrushPoint2, radius: number): Polygon {
  const ring: Ring = []
  for (let index = 0; index < STYLIZED_PATH_ROUND_SEGMENTS; index += 1) {
    const angle = (index / STYLIZED_PATH_ROUND_SEGMENTS) * Math.PI * 2
    ring.push(snappedPair(point.x + Math.cos(angle) * radius, point.z + Math.sin(angle) * radius))
  }
  return [closedRing(ring)]
}

function segmentCapsule(
  start: LandrushPoint2,
  end: LandrushPoint2,
  radius: number,
): Polygon | null {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length <= 0.0001) return null
  const heading = Math.atan2(dz, dx)
  const capSegments = Math.max(4, Math.floor(STYLIZED_PATH_ROUND_SEGMENTS / 2))
  const ring: Ring = []
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = heading + Math.PI / 2 - (index / capSegments) * Math.PI
    ring.push(snappedPair(end.x + Math.cos(angle) * radius, end.z + Math.sin(angle) * radius))
  }
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = heading - Math.PI / 2 - (index / capSegments) * Math.PI
    ring.push(snappedPair(start.x + Math.cos(angle) * radius, start.z + Math.sin(angle) * radius))
  }
  return [closedRing(ring)]
}

function segmentSignature(start: LandrushPoint2, end: LandrushPoint2, radius: number) {
  const startKey = `${snap(start.x)}:${snap(start.z)}`
  const endKey = `${snap(end.x)}:${snap(end.z)}`
  const [first, second] = startKey < endKey ? [startKey, endKey] : [endKey, startKey]
  return `${first}|${second}|${snap(radius)}`
}

function surfaceGeometry(area: MultiPolygon, y: number, role: string) {
  return createWorldPolygonSurfaceGeometry([{ area }], y, {
    key: 'stylizedPathNetworkRole',
    value: role,
  })
}

function boundaryWallGeometry(area: MultiPolygon, topY: number, bottomY: number, role: string) {
  return createWorldPolygonBoundaryWallsGeometry([{ area, bottomY, topY }], {
    key: 'stylizedPathNetworkRole',
    value: role,
  })
}

function cleanRoadPoints(points: readonly LandrushPoint2[]) {
  const cleaned: LandrushPoint2[] = []
  for (const point of points) {
    const snapped = { x: snap(point.x), z: snap(point.z) }
    const previous = cleaned.at(-1)
    if (!previous || Math.hypot(snapped.x - previous.x, snapped.z - previous.z) > 0.0001) {
      cleaned.push(snapped)
    }
  }
  if (cleaned.length > 2) {
    const first = cleaned[0]
    const last = cleaned.at(-1)
    if (first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.0001) {
      cleaned.pop()
    }
  }
  return cleaned
}

function cleanMultiPolygon(area: MultiPolygon): MultiPolygon {
  return area.filter((polygon) => {
    const outer = polygon[0]
    return outer && outer.length >= 4 && Math.abs(ringArea(outer)) >= STYLIZED_PATH_MIN_POLYGON_AREA
  })
}

function openRing(ring: Ring): Ring {
  if (ring.length < 2) return [...ring]
  const first = ring[0]
  const last = ring.at(-1)
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : [...ring]
}

function closedRing(ring: Ring): Ring {
  if (ring.length === 0) return []
  const first = ring[0]
  const last = ring.at(-1)
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? ring
    : [...ring, first as Pair]
}

function pointPair(point: LandrushPoint2): Pair {
  return snappedPair(point.x, point.z)
}

function snappedPair(x: number, z: number): Pair {
  return [snap(x), snap(z)]
}

function snap(value: number) {
  return Math.round(value * STYLIZED_PATH_SNAP_SCALE) / STYLIZED_PATH_SNAP_SCALE
}

function ringArea(ring: Ring) {
  let area = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index]
    const next = ring[index + 1]
    if (!(current && next)) continue
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area / 2
}

function multiPolygonArea(area: MultiPolygon) {
  return area.reduce((total, polygon) => {
    const outer = polygon[0]
    if (!outer) return total
    const holes = polygon.slice(1).reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0)
    return total + Math.max(0, Math.abs(ringArea(outer)) - holes)
  }, 0)
}

function geometryMetrics(geometry: BufferGeometry) {
  return {
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    vertices: geometry.getAttribute('position')?.count ?? 0,
  }
}

function hasGeometryPositions(geometry: BufferGeometry) {
  return (geometry.getAttribute('position')?.count ?? 0) > 0
}
