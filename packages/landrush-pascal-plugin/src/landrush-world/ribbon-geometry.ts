import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { LandrushRibbonGeometrySet, Point2 } from './render-types'
import type { LandrushWorldNode } from './schema'

export function createLandrushRibbonGeometries(
  perimeter: readonly Point2[],
  parcels: LandrushWorldNode['parcels'],
  roads: LandrushWorldNode['roads']['segments'],
  sidewalks: LandrushWorldNode['roads']['sidewalks'],
): LandrushRibbonGeometrySet {
  const ownerOutlines = parcels
    .filter((parcel) => parcel.kind === 'owner')
    .map((parcel) => parcel.outline)
  const neighborOutlines = parcels
    .filter((parcel) => parcel.kind !== 'owner')
    .map((parcel) => parcel.outline)

  return {
    neighborParcelOutlines: mergedOutlineRibbonGeometries(neighborOutlines, 0.34, 0.23),
    ownerParcelOutlines: mergedOutlineRibbonGeometries(ownerOutlines, 0.34, 0.23),
    roadCrowns: mergedRibbonGeometry(
      roads.map((road) => ({
        points: road.points,
        width: Math.max(1.28, road.width * 0.62),
      })),
      0.28,
    ),
    roads: mergedRibbonGeometry(roads, 0.14),
    shoreSand: mergedOutlineRibbonGeometry(perimeter, 1.65, 0.015),
    sidewalks: mergedRibbonGeometry(sidewalks, 0.12),
  }
}

export function disposeLandrushRibbonGeometries(geometries: LandrushRibbonGeometrySet) {
  for (const geometry of Object.values(geometries)) {
    geometry.dispose()
  }
}

function ribbonGeometry(points: readonly Point2[], width: number, y: number): BufferGeometry {
  const geometry = new BufferGeometry()
  const cleanPoints = points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || !areSamePoint(point, previous)
  })
  if (cleanPoints.length < 2) return geometry

  const positions: number[] = []
  const indices: number[] = []
  const halfWidth = width / 2

  cleanPoints.forEach((point, index) => {
    const normal = normalAtPolylinePoint(cleanPoints, index)
    const nx = normal.x * halfWidth
    const nz = normal.z * halfWidth
    positions.push(point.x + nx, y, point.z + nz, point.x - nx, y, point.z - nz)
  })

  for (let index = 0; index < cleanPoints.length - 1; index += 1) {
    const base = index * 2
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3)
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function outlineRibbonGeometries(
  points: readonly Point2[],
  width: number,
  y: number,
): BufferGeometry[] {
  return points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]
    if (!next || areSamePoint(point, next)) return []
    return [ribbonGeometry([point, next], width, y)]
  })
}

function mergedOutlineRibbonGeometry(
  points: readonly Point2[],
  width: number,
  y: number,
): BufferGeometry {
  return mergeBufferGeometries(outlineRibbonGeometries(points, width, y))
}

function mergedOutlineRibbonGeometries(
  polygons: readonly (readonly Point2[])[],
  width: number,
  y: number,
): BufferGeometry {
  return mergeBufferGeometries(
    polygons.flatMap((points) => outlineRibbonGeometries(points, width, y)),
  )
}

function mergedRibbonGeometry(
  ribbons: readonly { points: readonly Point2[]; width: number }[],
  y: number,
): BufferGeometry {
  return mergeBufferGeometries(
    ribbons.map((ribbon) => ribbonGeometry(ribbon.points, ribbon.width, y)),
  )
}

function mergeBufferGeometries(geometries: readonly BufferGeometry[]) {
  const merged = new BufferGeometry()
  const positions: number[] = []
  const indices: number[] = []
  let vertexOffset = 0

  for (const geometry of geometries) {
    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute || positionAttribute.count === 0) {
      geometry.dispose()
      continue
    }

    for (let index = 0; index < positionAttribute.count; index += 1) {
      positions.push(
        positionAttribute.getX(index),
        positionAttribute.getY(index),
        positionAttribute.getZ(index),
      )
    }

    const indexAttribute = geometry.getIndex()
    if (indexAttribute) {
      for (let index = 0; index < indexAttribute.count; index += 1) {
        indices.push(indexAttribute.getX(index) + vertexOffset)
      }
    } else {
      for (let index = 0; index < positionAttribute.count; index += 1) {
        indices.push(index + vertexOffset)
      }
    }

    vertexOffset += positionAttribute.count
    geometry.dispose()
  }

  if (positions.length === 0) return merged
  merged.setAttribute('position', new Float32BufferAttribute(positions, 3))
  merged.setIndex(indices)
  merged.computeVertexNormals()
  return merged
}

function normalAtPolylinePoint(points: readonly Point2[], index: number): Point2 {
  const current = points[index]
  if (!current) return { x: 0, z: 0 }

  const previous = points[index - 1]
  const next = points[index + 1]
  if (!(previous || next)) return { x: 0, z: 0 }

  const dx =
    next && previous ? next.x - previous.x : next ? next.x - current.x : current.x - previous!.x
  const dz =
    next && previous ? next.z - previous.z : next ? next.z - current.z : current.z - previous!.z
  const length = Math.max(Math.hypot(dx, dz), 0.001)

  return {
    x: -dz / length,
    z: dx / length,
  }
}

function areSamePoint(a: Point2, b: Point2) {
  return Math.abs(a.x - b.x) <= 0.001 && Math.abs(a.z - b.z) <= 0.001
}
