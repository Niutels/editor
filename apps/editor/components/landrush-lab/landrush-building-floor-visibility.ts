import {
  type AnyNode,
  detectSpacesForLevel,
  getLevelHeight,
  type LevelNode,
  type WallNode,
} from '@pascal-app/core'

export type LandrushBuildingFloorPoint = {
  x: number
  z: number
}

export type LandrushBuildingFloorInteriorRegion = {
  holes: readonly (readonly [number, number][])[]
  polygon: readonly (readonly [number, number])[]
  source: 'ceiling' | 'closed-walls' | 'slab' | 'zone'
}

export type LandrushBuildingFloorStackFloor = {
  baseY: number
  height: number
  interiorRegions: readonly LandrushBuildingFloorInteriorRegion[]
  level: number
  levelIds: readonly LevelNode['id'][]
  primaryLevelId: LevelNode['id']
}

export type LandrushBuildingFloorStack = {
  buildingId: string | null
  floors: readonly LandrushBuildingFloorStackFloor[]
  scopeId: string
}

export type LandrushBuildingFloorContext = {
  buildingId: string | null
  floor: LandrushBuildingFloorStackFloor
  levelId: LevelNode['id']
  levelNumber: number
  region: LandrushBuildingFloorInteriorRegion
  scopeId: string
}

export type LandrushBuildingFloorVisibility = {
  hiddenLevelIds: readonly LevelNode['id'][]
  visibleLevelIds: readonly LevelNode['id'][]
}

export function resolveLandrushBuildingFloorStacks(
  nodes: Record<string, AnyNode>,
): readonly LandrushBuildingFloorStack[] {
  const levelsByScope = new Map<string, LevelNode[]>()

  for (const node of Object.values(nodes)) {
    if (node.type !== 'level') continue
    const scopeId = resolveLevelScopeId(node)
    const levels = levelsByScope.get(scopeId)
    if (levels) levels.push(node)
    else levelsByScope.set(scopeId, [node])
  }

  return [...levelsByScope.entries()]
    .map(([scopeId, levels]) => createFloorStack(scopeId, levels, nodes))
    .sort((first, second) => first.scopeId.localeCompare(second.scopeId))
}

export function findLandrushBuildingFloorContext({
  groundY,
  point,
  robotWorldY,
  stacks,
  verticalTolerance = 0.35,
}: {
  groundY: number
  point: LandrushBuildingFloorPoint
  robotWorldY: number
  stacks: readonly LandrushBuildingFloorStack[]
  verticalTolerance?: number
}): LandrushBuildingFloorContext | null {
  const candidates: Array<LandrushBuildingFloorContext & { verticalDistance: number }> = []

  for (const stack of stacks) {
    const firstFloor = stack.floors[0]
    const lastFloor = stack.floors.at(-1)
    if (!firstFloor || !lastFloor) continue

    const minimumY = groundY + firstFloor.baseY - verticalTolerance
    const maximumY = groundY + lastFloor.baseY + lastFloor.height + verticalTolerance
    if (robotWorldY < minimumY || robotWorldY > maximumY) continue

    let activeFloor = firstFloor
    for (const floor of stack.floors) {
      if (robotWorldY + verticalTolerance < groundY + floor.baseY) break
      activeFloor = floor
    }

    const region = findLandrushBuildingFloorInteriorRegion(point, activeFloor.interiorRegions)
    if (!region) continue

    candidates.push({
      buildingId: stack.buildingId,
      floor: activeFloor,
      levelId: activeFloor.primaryLevelId,
      levelNumber: activeFloor.level,
      region,
      scopeId: stack.scopeId,
      verticalDistance: Math.abs(robotWorldY - (groundY + activeFloor.baseY)),
    })
  }

  const best = candidates.sort(
    (first, second) =>
      first.verticalDistance - second.verticalDistance ||
      first.scopeId.localeCompare(second.scopeId),
  )[0]
  if (!best) return null

  const { verticalDistance: _verticalDistance, ...context } = best
  return context
}

export function resolveLandrushBuildingFloorVisibility(
  stacks: readonly LandrushBuildingFloorStack[],
  context: LandrushBuildingFloorContext | null,
): LandrushBuildingFloorVisibility {
  const hiddenLevelIds: LevelNode['id'][] = []
  const visibleLevelIds: LevelNode['id'][] = []

  for (const stack of stacks) {
    for (const floor of stack.floors) {
      const hidden =
        context !== null && stack.scopeId === context.scopeId && floor.level > context.levelNumber
      if (hidden) hiddenLevelIds.push(...floor.levelIds)
      else visibleLevelIds.push(...floor.levelIds)
    }
  }

  return { hiddenLevelIds, visibleLevelIds }
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

function createFloorStack(
  scopeId: string,
  levels: readonly LevelNode[],
  nodes: Record<string, AnyNode>,
): LandrushBuildingFloorStack {
  const levelsByNumber = new Map<number, LevelNode[]>()
  for (const level of levels) {
    const floorLevels = levelsByNumber.get(level.level)
    if (floorLevels) floorLevels.push(level)
    else levelsByNumber.set(level.level, [level])
  }

  let baseY = 0
  const floors = [...levelsByNumber.entries()]
    .sort(([first], [second]) => first - second)
    .map(([levelNumber, floorLevels]) => {
      const sortedLevels = [...floorLevels].sort(
        (first, second) =>
          countVisibleLevelContent(second.id, nodes) - countVisibleLevelContent(first.id, nodes) ||
          first.id.localeCompare(second.id),
      )
      const primaryLevel = sortedLevels[0]!
      const height = Math.max(...sortedLevels.map((level) => getLevelHeight(level.id, nodes)))
      const floor: LandrushBuildingFloorStackFloor = {
        baseY,
        height,
        interiorRegions: sortedLevels.flatMap((level) =>
          resolveLandrushBuildingFloorInteriorRegions(nodes, level.id),
        ),
        level: levelNumber,
        levelIds: sortedLevels.map((level) => level.id),
        primaryLevelId: primaryLevel.id,
      }
      baseY += height
      return floor
    })

  return {
    buildingId: levels[0]?.parentId ?? null,
    floors,
    scopeId,
  }
}

function resolveLevelScopeId(level: LevelNode) {
  const metadata =
    level.metadata && typeof level.metadata === 'object' && !Array.isArray(level.metadata)
      ? (level.metadata as Record<string, unknown>)
      : null
  const parcelId = metadata?.landrushParcelId
  if (typeof parcelId === 'string' && parcelId.length > 0) return `parcel:${parcelId}`
  return `building:${level.parentId ?? level.id}`
}

function countVisibleLevelContent(levelId: LevelNode['id'], nodes: Record<string, AnyNode>) {
  let count = 0
  for (const node of Object.values(nodes)) {
    if (node.parentId === levelId && node.visible !== false) count += 1
  }
  return count
}
