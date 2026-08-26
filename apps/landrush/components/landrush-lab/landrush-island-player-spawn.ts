import {
  type AnyNode,
  type AnyNodeId,
  getFloorStackedPosition,
  getLevelElevations,
  type SpawnNode,
} from '@pascal-app/core'
import { isLandrushBuildPlacementDraft } from './landrush-build-sync'

export type LandrushIslandPlayerSpawnPose = {
  heading: number
  source: 'fallback' | 'scene'
  spawnNodeId: SpawnNode['id'] | null
  x: number
  y: number
  z: number
}

export function resolveLandrushIslandPlayerSpawn({
  fallback,
  levelBaseYById,
  nodes,
  parcelId,
}: {
  fallback: Pick<LandrushIslandPlayerSpawnPose, 'heading' | 'x' | 'y' | 'z'>
  levelBaseYById?: ReadonlyMap<string, number>
  nodes: Readonly<Record<string, AnyNode>>
  parcelId: string | null | undefined
}): LandrushIslandPlayerSpawnPose {
  if (!parcelId) return fallbackPose(fallback)

  const spawns = Object.values(nodes)
    .filter(
      (node): node is SpawnNode =>
        node.type === 'spawn' &&
        !isLandrushBuildPlacementDraft(node) &&
        isVisibleInParcelAncestry(node, nodes, parcelId),
    )
    .sort((first, second) => first.id.localeCompare(second.id))
  if (spawns.length === 0) return fallbackPose(fallback)

  const elevations =
    levelBaseYById ??
    new Map(
      [...getLevelElevations(nodes as Record<AnyNodeId, AnyNode>)].map(([id, value]) => [
        id,
        value.baseY,
      ]),
    )
  for (const spawn of spawns) {
    if (!spawn.parentId) continue
    const level = nodes[spawn.parentId]
    if (level?.type !== 'level') continue
    const building = level.parentId ? nodes[level.parentId] : null
    const buildingPosition: readonly [number, number, number] =
      building?.type === 'building' ? building.position : [0, 0, 0]
    const buildingYaw = building?.type === 'building' ? (building.rotation[1] ?? 0) : 0
    const levelBaseY = elevations.get(level.id) ?? level.baseElevation
    const floorStackedPosition = getFloorStackedPosition({
      levelId: level.id,
      node: spawn,
      nodes: nodes as Record<string, AnyNode>,
      position: spawn.position,
      rotation: spawn.rotation,
    })
    const cosine = Math.cos(buildingYaw)
    const sine = Math.sin(buildingYaw)

    return {
      heading: buildingYaw + spawn.rotation,
      source: 'scene',
      spawnNodeId: spawn.id,
      x: buildingPosition[0] + spawn.position[0] * cosine + spawn.position[2] * sine,
      y: buildingPosition[1] + levelBaseY + floorStackedPosition[1],
      z: buildingPosition[2] - spawn.position[0] * sine + spawn.position[2] * cosine,
    }
  }

  return fallbackPose(fallback)
}

function fallbackPose(
  fallback: Pick<LandrushIslandPlayerSpawnPose, 'heading' | 'x' | 'y' | 'z'>,
): LandrushIslandPlayerSpawnPose {
  return { ...fallback, source: 'fallback', spawnNodeId: null }
}

function isVisibleInParcelAncestry(
  node: AnyNode,
  nodes: Readonly<Record<string, AnyNode>>,
  parcelId: string,
) {
  const visited = new Set<string>()
  let current: AnyNode | undefined = node
  let matchedParcel = false

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.visible === false) return false
    const currentParcelId = readLandrushParcelId(current)
    if (currentParcelId && currentParcelId !== parcelId) return false
    if (currentParcelId === parcelId) matchedParcel = true
    if (!current.parentId) return matchedParcel
    current = nodes[current.parentId]
  }

  return false
}

function readLandrushParcelId(node: AnyNode) {
  const metadata =
    node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)
      ? (node.metadata as Record<string, unknown>)
      : null
  const parcelId = metadata?.landrushParcelId
  return typeof parcelId === 'string' && parcelId.length > 0 ? parcelId : null
}
