import type { AnyNode } from '@pascal-app/core'
import {
  findLandrushBuildingFloorInteriorRegion,
  type LandrushBuildingFloorInteriorRegion,
} from './landrush-building-floor-visibility'
import { resolveLandrushZombieEscapeFirstHouseReadyRegions } from './landrush-zombie-escape-first-house'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import type { ZombieEscapeWeaponPickupPlacement } from './zombie-escape-weapon-pickup-data'

export {
  createZombieEscapeFallbackWeaponPickupPlacements,
  translateZombieEscapeWeaponPickupPlacements,
  type ZombieEscapeWeaponPickupPlacement,
} from './zombie-escape-weapon-pickup-data'

const INTERIOR_SAMPLE_STEPS = 24

export function resolveZombieEscapeWeaponPlacementSeed({
  night,
  sessionId,
}: {
  night: number
  sessionId: string
}) {
  const normalizedNight = Number.isFinite(night) ? Math.max(0, Math.trunc(night)) : 0
  return `${String(sessionId.length)}:${sessionId}:${String(normalizedNight)}`
}

export function resolveZombieEscapeWeaponPickupIndices(
  scopeIds: readonly string[],
  placementSeed: string,
): readonly number[] {
  const paidWeaponCount = Math.max(0, ZOMBIE_ESCAPE_WEAPON_CATALOG.length - 1)
  if (paidWeaponCount === 0) return []

  const assigned = new Set<number>()
  return scopeIds.map((scopeId) => {
    const preferredIndex =
      1 + (hashZombieEscapeWeaponScope(placementSeed, scopeId) % paidWeaponCount)
    for (let offset = 0; offset < paidWeaponCount; offset += 1) {
      const weaponIndex = 1 + ((preferredIndex - 1 + offset) % paidWeaponCount)
      if (assigned.has(weaponIndex)) continue
      assigned.add(weaponIndex)
      return weaponIndex
    }
    return preferredIndex
  })
}

export function resolveZombieEscapeWeaponPickupPlacements(
  nodes: Record<string, AnyNode>,
  placementSeed: string,
  maximumPlacements = ZOMBIE_ESCAPE_WEAPON_CATALOG.length,
): readonly ZombieEscapeWeaponPickupPlacement[] {
  const limit = Math.max(
    0,
    Math.min(
      5,
      Math.max(0, ZOMBIE_ESCAPE_WEAPON_CATALOG.length - 1),
      Number.isFinite(maximumPlacements) ? Math.trunc(maximumPlacements) : 0,
    ),
  )
  if (limit === 0) return []

  const largestReadyRegionByScope = new Map<
    string,
    ReturnType<typeof resolveLandrushZombieEscapeFirstHouseReadyRegions>[number]
  >()
  for (const candidate of resolveLandrushZombieEscapeFirstHouseReadyRegions(nodes)) {
    const current = largestReadyRegionByScope.get(candidate.scopeId)
    if (!current || compareInteriorRegions(candidate.region, current.region) < 0) {
      largestReadyRegionByScope.set(candidate.scopeId, candidate)
    }
  }

  const placements = [...largestReadyRegionByScope.values()]
    .flatMap(({ region, scopeId, y }) => {
      const point = findInteriorPlacementPoint(region)
      return point ? [{ point, scopeId, y }] : []
    })
    .sort((first, second) => compareWeaponPickupScopes(first.scopeId, second.scopeId))
    .slice(0, limit)
  const weaponIndices = resolveZombieEscapeWeaponPickupIndices(
    placements.map(({ scopeId }) => scopeId),
    placementSeed,
  )
  return placements.map(({ point, scopeId, y }, index) => ({
    scopeId,
    weaponIndex: weaponIndices[index]!,
    x: point.x,
    y,
    z: point.z,
  }))
}

function hashZombieEscapeWeaponScope(placementSeed: string, scopeId: string) {
  const identity = `${placementSeed}\u0000${scopeId}`
  let hash = 2_166_136_261
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function compareWeaponPickupScopes(first: string, second: string) {
  const firstPriority = first.startsWith('parcel:') ? 0 : 1
  const secondPriority = second.startsWith('parcel:') ? 0 : 1
  return firstPriority - secondPriority || first.localeCompare(second)
}

function compareInteriorRegions(
  first: LandrushBuildingFloorInteriorRegion,
  second: LandrushBuildingFloorInteriorRegion,
) {
  return (
    netRegionArea(second) - netRegionArea(first) ||
    serializePolygon(first.polygon).localeCompare(serializePolygon(second.polygon))
  )
}

function findInteriorPlacementPoint(region: LandrushBuildingFloorInteriorRegion) {
  if (region.polygon.length < 3) return null
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, z] of region.polygon) {
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxZ = Math.max(maxZ, z)
  }
  if (![minX, minZ, maxX, maxZ].every(Number.isFinite)) return null

  const candidates = [polygonCentroid(region.polygon)]
  for (let zIndex = 0; zIndex < INTERIOR_SAMPLE_STEPS; zIndex += 1) {
    for (let xIndex = 0; xIndex < INTERIOR_SAMPLE_STEPS; xIndex += 1) {
      candidates.push({
        x: minX + ((xIndex + 0.5) / INTERIOR_SAMPLE_STEPS) * (maxX - minX),
        z: minZ + ((zIndex + 0.5) / INTERIOR_SAMPLE_STEPS) * (maxZ - minZ),
      })
    }
  }

  let best: { clearance: number; x: number; z: number } | null = null
  for (const candidate of candidates) {
    if (!findLandrushBuildingFloorInteriorRegion(candidate, [region])) continue
    const clearance = distanceToRegionBoundary(candidate, region)
    if (
      !best ||
      clearance > best.clearance + 0.000_001 ||
      (Math.abs(clearance - best.clearance) <= 0.000_001 &&
        (candidate.z < best.z || (candidate.z === best.z && candidate.x < best.x)))
    ) {
      best = { clearance, ...candidate }
    }
  }
  return best ? { x: best.x, z: best.z } : null
}

function distanceToRegionBoundary(
  point: Readonly<{ x: number; z: number }>,
  region: LandrushBuildingFloorInteriorRegion,
) {
  let distance = distanceToPolygonBoundary(point, region.polygon)
  for (const hole of region.holes) {
    distance = Math.min(distance, distanceToPolygonBoundary(point, hole))
  }
  return distance
}

function distanceToPolygonBoundary(
  point: Readonly<{ x: number; z: number }>,
  polygon: readonly (readonly [number, number])[],
) {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!(start && end)) continue
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const lengthSquared = dx * dx + dz * dz
    const amount =
      lengthSquared <= Number.EPSILON
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point.x - start[0]) * dx + (point.z - start[1]) * dz) / lengthSquared),
          )
    minimum = Math.min(
      minimum,
      Math.hypot(point.x - (start[0] + dx * amount), point.z - (start[1] + dz * amount)),
    )
  }
  return minimum
}

function netRegionArea(region: LandrushBuildingFloorInteriorRegion) {
  return Math.max(
    0,
    polygonArea(region.polygon) -
      region.holes.reduce((total, hole) => total + polygonArea(hole), 0),
  )
}

function polygonArea(polygon: readonly (readonly [number, number])[]) {
  return Math.abs(signedPolygonArea(polygon))
}

function polygonCentroid(polygon: readonly (readonly [number, number])[]) {
  const signedArea = signedPolygonArea(polygon)
  if (Math.abs(signedArea) <= Number.EPSILON) {
    const total = polygon.reduce((sum, [x, z]) => ({ x: sum.x + x, z: sum.z + z }), { x: 0, z: 0 })
    return { x: total.x / polygon.length, z: total.z / polygon.length }
  }

  let x = 0
  let z = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!
    const next = polygon[(index + 1) % polygon.length]!
    const cross = current[0] * next[1] - next[0] * current[1]
    x += (current[0] + next[0]) * cross
    z += (current[1] + next[1]) * cross
  }
  return { x: x / (6 * signedArea), z: z / (6 * signedArea) }
}

function signedPolygonArea(polygon: readonly (readonly [number, number])[]) {
  let twiceArea = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!
    const next = polygon[(index + 1) % polygon.length]!
    twiceArea += current[0] * next[1] - next[0] * current[1]
  }
  return twiceArea / 2
}

function serializePolygon(polygon: readonly (readonly [number, number])[]) {
  return polygon.map(([x, z]) => `${String(x)},${String(z)}`).join(';')
}
