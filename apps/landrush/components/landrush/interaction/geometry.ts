import type {
  LandrushBuildEligibility,
  LandrushPropertyGeometry,
  LandrushVector2,
  LandrushVector3,
  LandrushVector3Like,
} from '../types'

export const DEFAULT_LANDRUSH_SPAWN: LandrushVector3 = { x: 0, y: 0, z: 0 }
export const DEFAULT_BUILD_ACTIVATION_DISTANCE = 2

export function toLandrushVector3(
  value: LandrushVector3Like | undefined,
  fallback: LandrushVector3 = DEFAULT_LANDRUSH_SPAWN,
): LandrushVector3 {
  if (!value) return { ...fallback }

  if (Array.isArray(value)) {
    return {
      x: value[0] ?? fallback.x,
      y: value[1] ?? fallback.y,
      z: value[2] ?? fallback.z,
    }
  }

  const vector = value as LandrushVector3
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  }
}

export function toLandrushVector2(value: LandrushVector3 | LandrushVector2): LandrushVector2 {
  return {
    x: value.x,
    z: value.z,
  }
}

export function lerpNumber(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

export function lerpVector3(
  from: LandrushVector3,
  to: LandrushVector3,
  progress: number,
): LandrushVector3 {
  return {
    x: lerpNumber(from.x, to.x, progress),
    y: lerpNumber(from.y, to.y, progress),
    z: lerpNumber(from.z, to.z, progress),
  }
}

export function distance2d(a: LandrushVector2, b: LandrushVector2) {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.hypot(dx, dz)
}

export function resolveBuildEligibility(
  position: LandrushVector3 | LandrushVector2,
  ownerProperty: LandrushPropertyGeometry,
  activationDistance = DEFAULT_BUILD_ACTIVATION_DISTANCE,
): LandrushBuildEligibility {
  const point = toLandrushVector2(position)
  const insideProperty = containsPoint(ownerProperty, point)
  const distance = insideProperty ? 0 : distanceToProperty(ownerProperty, point)
  const allowed = insideProperty || distance <= activationDistance

  return {
    allowed,
    insideProperty,
    distance,
    reason: insideProperty
      ? 'inside-owner-property'
      : allowed
        ? 'near-owner-property'
        : 'too-far-from-owner-property',
  }
}

function containsPoint(property: LandrushPropertyGeometry, point: LandrushVector2) {
  if (property.kind === 'custom') return property.contains(point)
  if (property.kind === 'circle') return distance2d(point, property.center) <= property.radius

  if (property.kind === 'rect') {
    const halfX = property.size.x / 2
    const halfZ = property.size.z / 2
    return (
      point.x >= property.center.x - halfX &&
      point.x <= property.center.x + halfX &&
      point.z >= property.center.z - halfZ &&
      point.z <= property.center.z + halfZ
    )
  }

  return pointInPolygon(point, property.points)
}

function distanceToProperty(property: LandrushPropertyGeometry, point: LandrushVector2) {
  if (property.kind === 'custom') return property.distanceTo?.(point) ?? Number.POSITIVE_INFINITY
  if (property.kind === 'circle') {
    return Math.max(0, distance2d(point, property.center) - property.radius)
  }

  if (property.kind === 'rect') {
    const halfX = property.size.x / 2
    const halfZ = property.size.z / 2
    const dx = Math.max(Math.abs(point.x - property.center.x) - halfX, 0)
    const dz = Math.max(Math.abs(point.z - property.center.z) - halfZ, 0)
    return Math.hypot(dx, dz)
  }

  if (property.points.length < 2) return Number.POSITIVE_INFINITY

  return property.points.reduce((closest, current, index) => {
    const next = property.points[(index + 1) % property.points.length]
    if (!next) return closest
    return Math.min(closest, distanceToSegment(point, current, next))
  }, Number.POSITIVE_INFINITY)
}

function pointInPolygon(point: LandrushVector2, polygon: readonly LandrushVector2[]) {
  if (polygon.length < 3) return false

  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i]
    const previous = polygon[j]
    if (!current || !previous) continue

    const crossesZ = current.z > point.z !== previous.z > point.z
    const xAtZ =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x

    if (crossesZ && point.x < xAtZ) inside = !inside
  }

  return inside
}

function distanceToSegment(point: LandrushVector2, start: LandrushVector2, end: LandrushVector2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz

  if (lengthSquared === 0) return distance2d(point, start)

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  const projection = {
    x: start.x + t * dx,
    z: start.z + t * dz,
  }

  return distance2d(point, projection)
}
