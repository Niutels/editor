import { type AnyNode, detectSpacesForLevel, type LevelNode, type WallNode } from '@pascal-app/core'

export type LandrushBuildingFloorPoint = {
  x: number
  z: number
}

export type LandrushBuildingFloorInteriorRegion = {
  holes: readonly (readonly [number, number][])[]
  polygon: readonly (readonly [number, number])[]
  source: 'ceiling' | 'closed-walls' | 'slab' | 'zone'
}

export function resolveLandrushBuildingFloorInteriorRegions(
  nodes: Record<string, AnyNode>,
  levelId: LevelNode['id'],
): readonly LandrushBuildingFloorInteriorRegion[] {
  const levelNodes = Object.values(nodes).filter(
    (node) => node.parentId === levelId && node.visible !== false,
  )
  const walls = levelNodes.filter((node): node is WallNode => node.type === 'wall')
  const closedRooms = walls.length >= 3 ? detectSpacesForLevel(levelId, walls).spaces : []

  if (closedRooms.length > 0) {
    return closedRooms.map((space) => ({
      holes: [],
      polygon: space.polygon,
      source: 'closed-walls' as const,
    }))
  }

  const ceilings = levelNodes.filter((node) => node.type === 'ceiling')
  if (ceilings.length > 0) {
    return ceilings
      .filter((ceiling) => ceiling.polygon.length >= 3)
      .map((ceiling) => ({
        holes: ceiling.holes,
        polygon: ceiling.polygon,
        source: 'ceiling' as const,
      }))
  }

  const zones = levelNodes.filter((node) => node.type === 'zone')
  if (zones.length > 0) {
    return zones
      .filter((zone) => zone.polygon.length >= 3)
      .map((zone) => ({
        holes: [],
        polygon: zone.polygon,
        source: 'zone' as const,
      }))
  }

  if (walls.length < 3) return []

  const slabs = levelNodes.filter((node) => node.type === 'slab')
  return slabs
    .filter((slab) => slab.polygon.length >= 3)
    .map((slab) => ({
      holes: slab.holes,
      polygon: slab.polygon,
      source: 'slab' as const,
    }))
}

export function findLandrushBuildingFloorInteriorRegion(
  point: LandrushBuildingFloorPoint,
  regions: readonly LandrushBuildingFloorInteriorRegion[],
) {
  return (
    regions.find(
      (region) =>
        pointInFloorPolygon(point, region.polygon) &&
        !region.holes.some((hole) => pointInFloorPolygon(point, hole)),
    ) ?? null
  )
}

function pointInFloorPolygon(
  point: LandrushBuildingFloorPoint,
  polygon: readonly (readonly [number, number])[],
) {
  if (polygon.length < 3) return false

  let inside = false
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue

    if (pointOnFloorSegment(point, previous, current)) return true

    const crosses = current[1] > point.z !== previous[1] > point.z
    const boundaryX =
      ((previous[0] - current[0]) * (point.z - current[1])) /
        (previous[1] - current[1] || Number.EPSILON) +
      current[0]
    if (crosses && point.x < boundaryX) inside = !inside
  }
  return inside
}

function pointOnFloorSegment(
  point: LandrushBuildingFloorPoint,
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start[0], point.z - start[1]) <= 0.000_001
  }

  const projection = ((point.x - start[0]) * dx + (point.z - start[1]) * dz) / lengthSquared
  if (projection < 0 || projection > 1) return false

  return (
    Math.hypot(point.x - (start[0] + dx * projection), point.z - (start[1] + dz * projection)) <=
    0.000_001
  )
}
