import {
  type AnyNode,
  BuildingNode,
  DEFAULT_LEVEL_HEIGHT,
  LevelNode,
  type StairNode,
} from '@pascal-app/core'
import { migrateVerticalSceneNodes } from '@pascal-app/core/scene-migrations'

export type LandrushParcelBuildGraphScope = {
  contextBuildingId: string
  contextLevelId: string
  contextSiteId: string
  parcelId: string
  worldId: string
}

export type LandrushParcelBuildGraph = {
  buildingId: string
  groundLevelId: string
  migrated: boolean
  nodes: AnyNode[]
}

const FNV_64_OFFSET = 14_695_981_039_346_656_037n
const FNV_64_PRIME = 1_099_511_628_211n

export function createLandrushParcelBuildGraphIds(
  scope: Pick<LandrushParcelBuildGraphScope, 'parcelId' | 'worldId'>,
) {
  const suffix = hashLandrushParcelBuildScope(`${scope.worldId}\0${scope.parcelId}`)
  return {
    buildingId: `building_landrush-parcel-${suffix}`,
    groundLevelId: `level_landrush-parcel-${suffix}-0`,
    levelId(level: number) {
      return `level_landrush-parcel-${suffix}-${levelIdToken(level)}`
    },
  }
}

export function canonicalizeLandrushParcelBuildGraph(
  sourceNodes: readonly AnyNode[],
  scope: LandrushParcelBuildGraphScope,
): LandrushParcelBuildGraph {
  const ids = createLandrushParcelBuildGraphIds(scope)
  const sourceInput = sourceNodes.map(cloneNode).sort(compareNodeIds)
  const source = sourceInput.filter((node) => !nodeBelongsToForeignScope(node, scope))
  const sourceById = new Map<string, AnyNode>(source.map((node) => [node.id, node]))
  const sourceBuildings = source.filter(
    (node): node is Extract<AnyNode, { type: 'building' }> =>
      node.type === 'building' &&
      node.id !== scope.contextBuildingId &&
      (node.id === ids.buildingId || nodeBelongsToScope(node, scope)),
  )
  const sourceBuildingIds = new Set<string>(sourceBuildings.map((building) => building.id))
  const sourceLevels = source.filter(
    (node): node is Extract<AnyNode, { type: 'level' }> =>
      node.type === 'level' &&
      node.id !== scope.contextLevelId &&
      (sourceBuildingIds.has(node.parentId ?? '') || nodeBelongsToScope(node, scope)),
  )
  const sourceLevelIds = new Set<string>(sourceLevels.map((level) => level.id))
  const sourceContent = source.filter(
    (node) =>
      node.type !== 'building' &&
      node.type !== 'level' &&
      (nodeBelongsToScope(node, scope) ||
        hasAcceptedBuildAncestry(node, sourceById, sourceBuildingIds, sourceLevelIds, scope)),
  )
  const hasLegacyContent =
    sourceBuildings.length === 0 ||
    sourceLevels.some((level) => !sourceBuildingIds.has(level.parentId ?? '')) ||
    sourceContent.some(
      (node) =>
        node.parentId === scope.contextLevelId ||
        (!sourceLevelIds.has(node.parentId ?? '') && !sourceById.has(node.parentId ?? '')),
    )
  const existingDefaultBuilding = sourceBuildings.find((building) => building.id === ids.buildingId)
  const defaultSourceBuilding = hasLegacyContent
    ? existingDefaultBuilding
    : (existingDefaultBuilding ?? sourceBuildings[0])
  const buildingId = defaultSourceBuilding?.id ?? ids.buildingId
  const legacyWorldBaseElevations = new Map<string, number>()
  const reparentedLegacyLevelIds = new Set<string>()

  const nodesById = new Map<string, AnyNode>()
  for (const sourceBuilding of sourceBuildings) {
    nodesById.set(sourceBuilding.id, {
      ...sourceBuilding,
      parentId: scope.contextSiteId,
    } as AnyNode)
  }
  if (!nodesById.has(buildingId)) {
    nodesById.set(
      buildingId,
      BuildingNode.parse({
        children: [],
        id: buildingId,
        name: `Landrush ${scope.parcelId}`,
        parentId: scope.contextSiteId,
      }),
    )
  }

  for (const level of sourceLevels) {
    const hasAcceptedBuildingParent = sourceBuildingIds.has(level.parentId ?? '')
    const parentId = hasAcceptedBuildingParent ? level.parentId! : buildingId
    if (!hasAcceptedBuildingParent) {
      reparentedLegacyLevelIds.add(level.id)
      const worldBaseElevation = readWorldBaseElevationMetadata(level)
      if (worldBaseElevation !== null) {
        legacyWorldBaseElevations.set(level.id, worldBaseElevation)
      }
    }
    nodesById.set(level.id, { ...level, parentId } as AnyNode)
  }

  const groundLevel =
    sourceLevels.find((level) => level.level === 0 && level.parentId === buildingId) ??
    sourceLevels.find(
      (level) =>
        level.level === 0 &&
        !sourceBuildingIds.has(level.parentId ?? '') &&
        nodeBelongsToScope(level, scope),
    )
  const groundLevelId = groundLevel?.id ?? ids.groundLevelId
  const createdGroundLevel = !nodesById.has(groundLevelId)
  if (createdGroundLevel) {
    reparentedLegacyLevelIds.add(groundLevelId)
    nodesById.set(
      groundLevelId,
      LevelNode.parse({
        children: [],
        ...(hasLegacyContent ? {} : { height: DEFAULT_LEVEL_HEIGHT }),
        id: groundLevelId,
        level: 0,
        name: 'Ground Floor',
        parentId: buildingId,
      }),
    )
  }

  const remappedLevelIds = new Map<string, string>([[scope.contextLevelId, groundLevelId]])
  for (const sourceNode of sourceContent) {
    const node = cloneNode(sourceNode)
    node.parentId = resolveCanonicalParentId({
      groundLevelId,
      nodesById,
      remappedLevelIds,
      sourceById,
      sourceBuildingIds,
      sourceNode,
      sourceLevelIds,
    })
    nodesById.set(node.id, node)
  }

  repairStairLevelReferences(nodesById, groundLevelId, scope, remappedLevelIds)
  repairSlabHostReferences(nodesById)
  repairParentReferences(nodesById, groundLevelId, scope.contextSiteId)
  synchronizeChildren(nodesById)
  migrateVerticalParcelNodes(nodesById)
  for (const levelId of reparentedLegacyLevelIds) {
    if (legacyWorldBaseElevations.has(levelId)) continue
    const directChildWorldBaseElevation = readConsistentDirectChildWorldBaseElevation(
      nodesById,
      levelId,
    )
    if (directChildWorldBaseElevation !== null) {
      legacyWorldBaseElevations.set(levelId, directChildWorldBaseElevation)
    }
  }
  migrateLegacyWorldBaseElevations(nodesById, legacyWorldBaseElevations)

  const nodes = sortGraphNodes(nodesById)
  return {
    buildingId,
    groundLevelId,
    migrated: !haveEqualNodeMaps(sourceInput, nodes),
    nodes,
  }
}

function migrateVerticalParcelNodes(nodesById: Map<string, AnyNode>) {
  const migration = migrateVerticalSceneNodes(Object.fromEntries(nodesById))
  if (!migration.changed) return
  for (const [id, node] of Object.entries(migration.nodes)) {
    nodesById.set(id, node as AnyNode)
  }
}

function readConsistentDirectChildWorldBaseElevation(
  nodesById: ReadonlyMap<string, AnyNode>,
  levelId: string,
) {
  let worldBaseElevation: number | null = null
  for (const node of nodesById.values()) {
    if (node.parentId !== levelId) continue
    const candidate = readWorldBaseElevationMetadata(node)
    if (candidate === null) continue
    if (worldBaseElevation !== null && candidate !== worldBaseElevation) return null
    worldBaseElevation = candidate
  }
  return worldBaseElevation
}

function migrateLegacyWorldBaseElevations(
  nodesById: Map<string, AnyNode>,
  worldBaseElevations: ReadonlyMap<string, number>,
) {
  if (worldBaseElevations.size === 0) return

  const cumulativeYByBuilding = new Map<string | null, number>()
  const levels = [...nodesById.values()]
    .filter((node): node is Extract<AnyNode, { type: 'level' }> => node.type === 'level')
    .sort((left, right) => left.level - right.level || compareNodeIds(left, right))

  for (const level of levels) {
    const buildingId = getBuilding(nodesById, level.parentId)?.id ?? null
    const inheritedBaseY = cumulativeYByBuilding.get(buildingId) ?? 0
    const targetWorldBaseY = worldBaseElevations.get(level.id)
    let resolvedLevel = level
    let baseY = inheritedBaseY + (level.baseElevation ?? 0)

    if (targetWorldBaseY !== undefined) {
      const metadata = { ...(level.metadata as Record<string, unknown>) }
      delete metadata.worldBaseElevationM
      resolvedLevel = {
        ...level,
        baseElevation: targetWorldBaseY - inheritedBaseY,
        metadata,
      } as typeof level
      baseY = targetWorldBaseY
      nodesById.set(level.id, resolvedLevel)
    }

    cumulativeYByBuilding.set(buildingId, baseY + (resolvedLevel.height ?? DEFAULT_LEVEL_HEIGHT))
  }
}

function readWorldBaseElevationMetadata(node: Pick<AnyNode, 'metadata'>) {
  const metadata = node.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>).worldBaseElevationM
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resolveCanonicalParentId({
  groundLevelId,
  nodesById,
  remappedLevelIds,
  sourceById,
  sourceBuildingIds,
  sourceNode,
  sourceLevelIds,
}: {
  groundLevelId: string
  nodesById: Map<string, AnyNode>
  remappedLevelIds: ReadonlyMap<string, string>
  sourceById: ReadonlyMap<string, AnyNode>
  sourceBuildingIds: ReadonlySet<string>
  sourceNode: AnyNode
  sourceLevelIds: ReadonlySet<string>
}) {
  const parentId = sourceNode.parentId
  if (!parentId) return groundLevelId
  if (remappedLevelIds.has(parentId)) return remappedLevelIds.get(parentId)!
  if (sourceLevelIds.has(parentId) || nodesById.has(parentId)) return parentId

  const sourceParent = sourceById.get(parentId)
  if (sourceParent?.type === 'level') return groundLevelId
  if (sourceParent?.type === 'building') {
    return sourceBuildingIds.has(sourceParent.id) ? sourceParent.id : groundLevelId
  }
  if (sourceParent) return sourceParent.id
  return groundLevelId
}

function repairStairLevelReferences(
  nodesById: Map<string, AnyNode>,
  groundLevelId: string,
  scope: LandrushParcelBuildGraphScope,
  remappedLevelIds: ReadonlyMap<string, string>,
) {
  const stairs = [...nodesById.values()]
    .filter((node): node is StairNode => node.type === 'stair')
    .sort(compareNodeIds)

  for (const stair of stairs) {
    const parentLevel = getLevel(nodesById, stair.parentId)
    const declaredFromId = remapLevelReference(stair.fromLevelId, remappedLevelIds)
    const fromLevel =
      parentLevel ?? getLevel(nodesById, declaredFromId) ?? getLevel(nodesById, groundLevelId)
    if (!fromLevel) continue
    const stairBuilding = getBuilding(nodesById, fromLevel.parentId)
    if (!stairBuilding) continue

    const declaredToId = remapLevelReference(stair.toLevelId, remappedLevelIds)
    let toLevel = getLevel(nodesById, declaredToId)
    if (toLevel?.parentId !== stairBuilding.id || toLevel.id === fromLevel.id) toLevel = undefined

    if (!toLevel && stair.toLevelId !== null) {
      toLevel = findNextLevel(nodesById, stairBuilding.id, fromLevel.level)
      if (!toLevel) {
        const levelNumber = fromLevel.level + 1
        const levelId = createBuildingLevelId(scope, stairBuilding.id, levelNumber)
        const existing = getLevel(nodesById, levelId)
        toLevel =
          existing ??
          LevelNode.parse({
            children: [],
            height: DEFAULT_LEVEL_HEIGHT,
            id: levelId,
            level: levelNumber,
            name: levelNumber > 0 ? `Floor ${levelNumber}` : `Basement ${Math.abs(levelNumber)}`,
            parentId: stairBuilding.id,
          })
        nodesById.set(toLevel.id, toLevel)
      }
    }

    nodesById.set(stair.id, {
      ...stair,
      fromLevelId: fromLevel.id,
      parentId: fromLevel.id,
      toLevelId: toLevel?.id ?? null,
    } as AnyNode)
  }
}

function repairSlabHostReferences(nodesById: Map<string, AnyNode>) {
  for (const node of [...nodesById.values()]) {
    const record = node as AnyNode & { deckSlabId?: string; supportSlabId?: string }
    const update = { ...record } as typeof record
    let changed = false

    if (
      typeof record.supportSlabId === 'string' &&
      record.supportSlabId !== 'ground' &&
      !isSupportSlabForNode(nodesById, record.supportSlabId, node)
    ) {
      delete update.supportSlabId
      changed = true
    }
    if (
      typeof record.deckSlabId === 'string' &&
      !isSlabInNodeBuilding(nodesById, record.deckSlabId, node)
    ) {
      delete update.deckSlabId
      changed = true
    }

    if (changed) nodesById.set(node.id, update)
  }
}

function repairParentReferences(
  nodesById: Map<string, AnyNode>,
  groundLevelId: string,
  contextSiteId: string,
) {
  for (const node of [...nodesById.values()]) {
    if (node.type === 'building') {
      if (node.parentId !== contextSiteId) {
        nodesById.set(node.id, { ...node, parentId: contextSiteId } as AnyNode)
      }
      continue
    }
    if (node.parentId && nodesById.has(node.parentId)) continue
    nodesById.set(node.id, { ...node, parentId: groundLevelId } as AnyNode)
  }
}

function synchronizeChildren(nodesById: Map<string, AnyNode>) {
  const childIdsByParentId = new Map<string, string[]>()
  for (const node of nodesById.values()) {
    if (!node.parentId) continue
    const childIds = childIdsByParentId.get(node.parentId) ?? []
    childIds.push(node.id)
    childIdsByParentId.set(node.parentId, childIds)
  }

  for (const node of [...nodesById.values()]) {
    const record = node as AnyNode & { children?: string[] }
    if (!Array.isArray(record.children) && node.type !== 'building' && node.type !== 'level') {
      continue
    }

    const directChildIds = new Set(childIdsByParentId.get(node.id) ?? [])
    const children = [
      ...(record.children ?? []).filter((childId) => directChildIds.delete(childId)),
      ...[...directChildIds].sort(),
    ]
    nodesById.set(node.id, { ...record, children } as AnyNode)
  }
}

function sortGraphNodes(nodesById: ReadonlyMap<string, AnyNode>) {
  const nodes = [...nodesById.values()]
  return nodes.sort((left, right) => {
    const depthDifference = nodeDepth(left, nodesById) - nodeDepth(right, nodesById)
    return depthDifference || compareNodeIds(left, right)
  })
}

function nodeDepth(node: AnyNode, nodesById: ReadonlyMap<string, AnyNode>) {
  let depth = 0
  let parentId = node.parentId
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = nodesById.get(parentId)?.parentId ?? null
  }
  return depth
}

function findNextLevel(nodesById: ReadonlyMap<string, AnyNode>, buildingId: string, level: number) {
  return [...nodesById.values()]
    .filter(
      (node): node is Extract<AnyNode, { type: 'level' }> =>
        node.type === 'level' && node.parentId === buildingId && node.level > level,
    )
    .sort((left, right) => left.level - right.level || compareNodeIds(left, right))[0]
}

function getBuilding(nodesById: ReadonlyMap<string, AnyNode>, id: string | null | undefined) {
  const node = id ? nodesById.get(id) : undefined
  return node?.type === 'building' ? node : undefined
}

function getLevel(nodesById: ReadonlyMap<string, AnyNode>, id: string | null | undefined) {
  const node = id ? nodesById.get(id) : undefined
  return node?.type === 'level' ? node : undefined
}

function isSlabInNodeBuilding(
  nodesById: ReadonlyMap<string, AnyNode>,
  slabId: string,
  node: AnyNode,
) {
  const slab = nodesById.get(slabId)
  if (slab?.type !== 'slab') return false
  return resolveNodeBuildingId(nodesById, slab) === resolveNodeBuildingId(nodesById, node)
}

function isSupportSlabForNode(
  nodesById: ReadonlyMap<string, AnyNode>,
  slabId: string,
  node: AnyNode,
) {
  const slab = nodesById.get(slabId)
  if (slab?.type !== 'slab') return false
  return resolveNodeLevelId(nodesById, slab) === resolveNodeLevelId(nodesById, node)
}

function resolveNodeBuildingId(nodesById: ReadonlyMap<string, AnyNode>, node: AnyNode) {
  let current: AnyNode | undefined = node
  const visited = new Set<string>()
  while (current) {
    if (current.type === 'building') return current.id
    const parentId = current.parentId
    if (!parentId || visited.has(parentId)) return null
    visited.add(parentId)
    current = nodesById.get(parentId)
  }
  return null
}

function resolveNodeLevelId(nodesById: ReadonlyMap<string, AnyNode>, node: AnyNode) {
  let current: AnyNode | undefined = node
  const visited = new Set<string>()
  while (current) {
    if (current.type === 'level') return current.id
    const parentId = current.parentId
    if (!parentId || visited.has(parentId)) return null
    visited.add(parentId)
    current = nodesById.get(parentId)
  }
  return null
}

function remapLevelReference(
  id: string | null | undefined,
  remappedLevelIds: ReadonlyMap<string, string>,
) {
  return id ? (remappedLevelIds.get(id) ?? id) : id
}

function hasAcceptedBuildAncestry(
  node: AnyNode,
  sourceById: ReadonlyMap<string, AnyNode>,
  sourceBuildingIds: ReadonlySet<string>,
  sourceLevelIds: ReadonlySet<string>,
  scope: LandrushParcelBuildGraphScope,
) {
  let parentId = node.parentId
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    if (parentId === scope.contextLevelId) return true
    if (sourceLevelIds.has(parentId) || sourceBuildingIds.has(parentId)) return true
    visited.add(parentId)
    parentId = sourceById.get(parentId)?.parentId ?? null
  }
  return false
}

function createBuildingLevelId(
  scope: Pick<LandrushParcelBuildGraphScope, 'parcelId' | 'worldId'>,
  buildingId: string,
  level: number,
) {
  const ids = createLandrushParcelBuildGraphIds(scope)
  if (buildingId === ids.buildingId) return ids.levelId(level)
  const buildingSuffix = hashLandrushParcelBuildScope(buildingId)
  return `level_landrush-parcel-${buildingSuffix}-${levelIdToken(level)}`
}

function nodeBelongsToScope(node: AnyNode, scope: LandrushParcelBuildGraphScope) {
  const metadata = readScopeMetadata(node)
  return metadata.landrushParcelId === scope.parcelId && metadata.landrushWorldId === scope.worldId
}

function nodeBelongsToForeignScope(node: AnyNode, scope: LandrushParcelBuildGraphScope) {
  const metadata = readScopeMetadata(node)
  return (
    (typeof metadata.landrushParcelId === 'string' &&
      metadata.landrushParcelId !== scope.parcelId) ||
    (typeof metadata.landrushWorldId === 'string' && metadata.landrushWorldId !== scope.worldId)
  )
}

function readScopeMetadata(node: AnyNode) {
  return (node.metadata ?? {}) as {
    landrushParcelId?: unknown
    landrushWorldId?: unknown
  }
}

function levelIdToken(level: number) {
  if (Number.isSafeInteger(level)) return level < 0 ? `b${Math.abs(level)}` : `${level}`
  return `n${hashLandrushParcelBuildScope(`${level}`)}`
}

function hashLandrushParcelBuildScope(value: string) {
  let hash = FNV_64_OFFSET
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * FNV_64_PRIME)
  }
  return hash.toString(36)
}

function cloneNode<Node extends AnyNode>(node: Node): Node {
  return JSON.parse(JSON.stringify(node)) as Node
}

function haveEqualNodeMaps(left: readonly AnyNode[], right: readonly AnyNode[]) {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort(compareNodeIds)
  const sortedRight = [...right].sort(compareNodeIds)
  return JSON.stringify(sortedLeft) === JSON.stringify(sortedRight)
}

function compareNodeIds(left: Pick<AnyNode, 'id'>, right: Pick<AnyNode, 'id'>) {
  return left.id.localeCompare(right.id)
}
