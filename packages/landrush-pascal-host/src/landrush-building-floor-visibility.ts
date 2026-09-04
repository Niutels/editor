import {
  type AnyNode,
  detectSpacesForLevel,
  getStoredLevelHeight,
  type LevelNode,
  resolveCeilingHeight,
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

export type LandrushBuildingFloorPlacement = {
  buildingId: string | null
  floor: LandrushBuildingFloorStackFloor
  levelId: LevelNode['id']
  scopeId: string
}

export type LandrushBuildingFloorTransition = {
  lowerLevelNumber: number
  scopeId: string
  upperFloorVisibility: number
  upperLevelNumber: number
}

export type LandrushBuildingFloorOpacity = {
  levelId: LevelNode['id']
  opacity: number
}

export type LandrushBuildingFloorCover = {
  levelId: LevelNode['id']
  nodeId: AnyNode['id']
  scopeId: string
}

export function resolveLandrushBuildingFloorStacks(
  nodes: Record<string, AnyNode>,
): readonly LandrushBuildingFloorStack[] {
  const levelsByScope = new Map<string, LevelNode[]>()

  for (const node of Object.values(nodes)) {
    if (node.type !== 'level') continue
    for (const scopeId of resolveLevelScopeIds(node, nodes)) {
      const levels = levelsByScope.get(scopeId)
      if (levels) levels.push(node)
      else levelsByScope.set(scopeId, [node])
    }
  }

  return [...levelsByScope.entries()]
    .map(([scopeId, levels]) => createFloorStack(scopeId, levels, nodes))
    .sort((first, second) => first.scopeId.localeCompare(second.scopeId))
}

export function findLandrushBuildingFloorPlacement({
  levelId,
  scopeId,
  stacks,
}: {
  levelId: LevelNode['id']
  scopeId?: string | null
  stacks: readonly LandrushBuildingFloorStack[]
}): LandrushBuildingFloorPlacement | null {
  const candidates: LandrushBuildingFloorPlacement[] = []

  for (const stack of stacks) {
    for (const floor of stack.floors) {
      if (!floor.levelIds.includes(levelId)) continue
      candidates.push({
        buildingId: stack.buildingId,
        floor,
        levelId,
        scopeId: stack.scopeId,
      })
    }
  }

  return (
    candidates.find((candidate) => scopeId && candidate.scopeId === scopeId) ??
    candidates.sort((first, second) => first.scopeId.localeCompare(second.scopeId))[0] ??
    null
  )
}

export function findLandrushBuildingFloorContext({
  groundY,
  horizontalExitMargin = 0,
  point,
  previousContext = null,
  robotWorldY,
  stacks,
  verticalTolerance = 0.35,
}: {
  groundY: number
  horizontalExitMargin?: number
  point: LandrushBuildingFloorPoint
  previousContext?: LandrushBuildingFloorContext | null
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
  if (best) {
    const { verticalDistance: _verticalDistance, ...context } = best
    return context
  }

  const exitMargin = Math.max(0, horizontalExitMargin)
  if (!previousContext || exitMargin <= 0) return null
  const previousStack = stacks.find((stack) => stack.scopeId === previousContext.scopeId)
  const previousFloor = previousStack?.floors.find(
    (floor) => floor.level === previousContext.levelNumber,
  )
  if (!previousStack || !previousFloor) return null

  const minimumY = groundY + previousFloor.baseY - verticalTolerance
  const maximumY = groundY + previousFloor.baseY + previousFloor.height + verticalTolerance
  if (robotWorldY < minimumY || robotWorldY > maximumY) return null

  const region = previousFloor.interiorRegions.find((candidate) =>
    pointWithinFloorRegionExitMargin(point, candidate, exitMargin),
  )
  if (!region) return null

  return {
    buildingId: previousStack.buildingId,
    floor: previousFloor,
    levelId: previousFloor.primaryLevelId,
    levelNumber: previousFloor.level,
    region,
    scopeId: previousStack.scopeId,
  }
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

export function resolveLandrushBuildingFloorOpacities(
  stacks: readonly LandrushBuildingFloorStack[],
  context: LandrushBuildingFloorContext | null,
  transition: LandrushBuildingFloorTransition | null = null,
): readonly LandrushBuildingFloorOpacity[] {
  const opacityByLevelId = new Map<LevelNode['id'], number>()

  for (const stack of stacks) {
    for (const floor of stack.floors) {
      let opacity =
        context !== null && stack.scopeId === context.scopeId && floor.level > context.levelNumber
          ? 0
          : 1

      if (transition && stack.scopeId === transition.scopeId) {
        if (floor.level <= transition.lowerLevelNumber) opacity = 1
        else if (floor.level === transition.upperLevelNumber) {
          opacity = clampFloorOpacity(transition.upperFloorVisibility)
        } else if (floor.level > transition.upperLevelNumber) opacity = 0
      }

      for (const levelId of floor.levelIds) {
        opacityByLevelId.set(levelId, Math.min(opacityByLevelId.get(levelId) ?? 1, opacity))
      }
    }
  }

  return [...opacityByLevelId].map(([levelId, opacity]) => ({ levelId, opacity }))
}

export function resolveLandrushBuildingFloorCovers(
  nodes: Record<string, AnyNode>,
  stacks: readonly LandrushBuildingFloorStack[],
): readonly LandrushBuildingFloorCover[] {
  const covers = new Map<string, LandrushBuildingFloorCover>()
  const nodesByParentId = new Map<string, AnyNode[]>()
  for (const node of Object.values(nodes)) {
    if (!node.parentId) continue
    const siblings = nodesByParentId.get(node.parentId)
    if (siblings) siblings.push(node)
    else nodesByParentId.set(node.parentId, [node])
  }

  for (const stack of stacks) {
    for (const floor of stack.floors) {
      for (const levelId of floor.levelIds) {
        const level = nodes[levelId]
        if (level?.type !== 'level') continue

        for (const node of nodesByParentId.get(levelId) ?? []) {
          if (
            node.parentId !== levelId ||
            node.visible === false ||
            (node.type !== 'ceiling' && node.type !== 'roof') ||
            !isNodeInLevelScope(node, level, stack.scopeId) ||
            !isRenderedOverheadCover(node, nodes)
          ) {
            continue
          }

          covers.set(`${stack.scopeId}:${node.id}`, {
            levelId,
            nodeId: node.id,
            scopeId: stack.scopeId,
          })
        }
      }
    }
  }

  return [...covers.values()].sort(
    (first, second) =>
      first.scopeId.localeCompare(second.scopeId) ||
      first.levelId.localeCompare(second.levelId) ||
      first.nodeId.localeCompare(second.nodeId),
  )
}

export function resolveLandrushBuildingActiveFloorCoverNodeIds(
  covers: readonly LandrushBuildingFloorCover[],
  context: LandrushBuildingFloorContext | null,
): readonly AnyNode['id'][] {
  if (!context) return []
  const activeLevelIds = new Set(context.floor.levelIds)
  return covers
    .filter((cover) => cover.scopeId === context.scopeId && activeLevelIds.has(cover.levelId))
    .map((cover) => cover.nodeId)
}

export function resolveLandrushBuildingFloorInteriorRegions(
  nodes: Record<string, AnyNode>,
  levelId: LevelNode['id'],
  scopeId?: string,
): readonly LandrushBuildingFloorInteriorRegion[] {
  const level = nodes[levelId]
  const levelNodes = Object.values(nodes).filter(
    (node) =>
      node.parentId === levelId &&
      node.visible !== false &&
      (level?.type !== 'level' || isNodeInLevelScope(node, level, scopeId)),
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

function pointWithinFloorRegionExitMargin(
  point: LandrushBuildingFloorPoint,
  region: LandrushBuildingFloorInteriorRegion,
  exitMargin: number,
) {
  const withinOuterBoundary =
    pointInFloorPolygon(point, region.polygon) ||
    distanceToFloorPolygonBoundary(point, region.polygon) <= exitMargin
  if (!withinOuterBoundary) return false

  for (const hole of region.holes) {
    if (
      pointInFloorPolygon(point, hole) &&
      distanceToFloorPolygonBoundary(point, hole) > exitMargin
    ) {
      return false
    }
  }
  return true
}

function distanceToFloorPolygonBoundary(
  point: LandrushBuildingFloorPoint,
  polygon: readonly (readonly [number, number])[],
) {
  let minimumDistance = Number.POSITIVE_INFINITY
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    minimumDistance = Math.min(minimumDistance, distanceToFloorSegment(point, previous, current))
  }
  return minimumDistance
}

function distanceToFloorSegment(
  point: LandrushBuildingFloorPoint,
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start[0], point.z - start[1])
  }
  const projection = Math.min(
    1,
    Math.max(0, ((point.x - start[0]) * dx + (point.z - start[1]) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start[0] + dx * projection), point.z - (start[1] + dz * projection))
}

function clampFloorOpacity(value: number) {
  return Math.min(1, Math.max(0, value))
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
          countVisibleLevelContent(second.id, nodes, scopeId) -
            countVisibleLevelContent(first.id, nodes, scopeId) || first.id.localeCompare(second.id),
      )
      const primaryLevel = sortedLevels[0]!
      const height = Math.max(
        ...sortedLevels.map((level) => resolveLandrushScopeStoreyHeight(level, nodes, scopeId)),
      )
      const floor: LandrushBuildingFloorStackFloor = {
        baseY,
        height,
        interiorRegions: sortedLevels.flatMap((level) =>
          resolveLandrushBuildingFloorInteriorRegions(nodes, level.id, scopeId),
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

function resolveLevelScopeIds(level: LevelNode, nodes: Record<string, AnyNode>) {
  const parcelId = resolveNodeParcelId(level)
  if (parcelId) return [`parcel:${parcelId}`]

  const scopeIds = new Set([`building:${level.parentId ?? level.id}`])
  for (const node of Object.values(nodes)) {
    if (node.parentId !== level.id) continue
    const childParcelId = resolveNodeParcelId(node)
    if (childParcelId) scopeIds.add(`parcel:${childParcelId}`)
  }
  return [...scopeIds]
}

function resolveLandrushScopeStoreyHeight(
  level: LevelNode,
  nodes: Record<string, AnyNode>,
  scopeId: string,
) {
  const scopeParcelId = parcelIdForScope(scopeId)
  const levelParcelId = resolveNodeParcelId(level)
  if (level.height !== undefined && (!scopeParcelId || levelParcelId === scopeParcelId)) {
    return getStoredLevelHeight(level)
  }

  let contentTop = 0
  for (const node of Object.values(nodes)) {
    if (node.parentId !== level.id || !isNodeInLevelScope(node, level, scopeId)) continue
    if (node.type !== 'wall' && node.type !== 'ceiling') continue
    const height = node.height ?? getStoredLevelHeight(level)
    if (height > contentTop) contentTop = height
  }
  return contentTop > 0 ? contentTop : getStoredLevelHeight(level)
}

function isNodeInLevelScope(node: AnyNode, level: LevelNode, scopeId?: string) {
  if (!scopeId) return true

  const scopeParcelId = parcelIdForScope(scopeId)
  const nodeParcelId = resolveNodeParcelId(node)
  if (!scopeParcelId) return nodeParcelId === null

  const levelParcelId = resolveNodeParcelId(level)
  if (levelParcelId === scopeParcelId) {
    return nodeParcelId === null || nodeParcelId === scopeParcelId
  }
  return nodeParcelId === scopeParcelId
}

function isRenderedOverheadCover(
  node: Extract<AnyNode, { type: 'ceiling' | 'roof' }>,
  nodes: Record<string, AnyNode>,
) {
  const metadata =
    node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)
      ? (node.metadata as Record<string, unknown>)
      : null
  if (metadata?.nonRendering) return false
  return node.type === 'roof' || resolveCeilingHeight(node, nodes) > 0
}

function parcelIdForScope(scopeId: string) {
  return scopeId.startsWith('parcel:') ? scopeId.slice('parcel:'.length) : null
}

function resolveNodeParcelId(node: AnyNode) {
  const metadata =
    node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)
      ? (node.metadata as Record<string, unknown>)
      : null
  const parcelId = metadata?.landrushParcelId
  return typeof parcelId === 'string' && parcelId.length > 0 ? parcelId : null
}

function countVisibleLevelContent(
  levelId: LevelNode['id'],
  nodes: Record<string, AnyNode>,
  scopeId?: string,
) {
  const level = nodes[levelId]
  let count = 0
  for (const node of Object.values(nodes)) {
    if (
      node.parentId === levelId &&
      node.visible !== false &&
      (level?.type !== 'level' || isNodeInLevelScope(node, level, scopeId))
    ) {
      count += 1
    }
  }
  return count
}
