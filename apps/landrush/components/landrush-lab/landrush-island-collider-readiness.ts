import type { AnyNode, AnyNodeId, LevelNode } from '@pascal-app/core'
import type { Mesh, Object3D } from 'three'

const LANDRUSH_ISLAND_COLLIDER_LEVEL_BASE_Y_EPSILON = 0.015

export type LandrushIslandColliderLevelPlacement = Readonly<{
  baseY: number
  levelId: LevelNode['id']
  object: Object3D
}>

type LandrushIslandColliderFloorStack = Readonly<{
  floors: readonly Readonly<{
    baseY: number
    levelIds: readonly LevelNode['id'][]
  }>[]
}>

export type LandrushIslandBuiltColliderReadiness = {
  authorityKey: string
  installedVersion: string | null
  requestedVersion: string
}

export function reconcileLandrushIslandBuiltColliderReadiness({
  authorityKey,
  current,
  reported,
}: {
  authorityKey: string
  current: LandrushIslandBuiltColliderReadiness | null
  reported: LandrushIslandBuiltColliderReadiness
}) {
  if (reported.authorityKey !== authorityKey) return current
  if (
    current?.authorityKey === reported.authorityKey &&
    current.requestedVersion === reported.requestedVersion &&
    current.installedVersion === reported.installedVersion
  ) {
    return current
  }
  return reported
}

export function resolveLandrushIslandBuiltCollidersReady({
  admitted,
  authorityKey,
  status,
}: {
  admitted: boolean
  authorityKey: string
  status: LandrushIslandBuiltColliderReadiness | null
}) {
  return (
    admitted &&
    status?.authorityKey === authorityKey &&
    status.installedVersion !== null &&
    status.installedVersion === status.requestedVersion
  )
}

export function areLandrushWallColliderGeometriesReady({
  dirtyNodeIds,
  nodes,
  resolveObject,
}: {
  dirtyNodeIds: ReadonlySet<AnyNodeId>
  nodes: Record<string, AnyNode>
  resolveObject: (nodeId: AnyNodeId) => Object3D | undefined
}) {
  for (const node of Object.values(nodes)) {
    if (node.type !== 'wall' || node.visible === false) continue

    const [startX, startZ] = node.start
    const [endX, endZ] = node.end
    if (Math.hypot(endX - startX, endZ - startZ) <= 0.0001) continue
    if (dirtyNodeIds.has(node.id)) return false

    const position = (resolveObject(node.id) as Mesh | undefined)?.geometry?.getAttribute(
      'position',
    )
    // Pascal's visible wall placeholder is one degenerate three-vertex triangle.
    // Cloning it produces a valid BVH with no wall surface and leaves collision
    // absent until an unrelated door/window event happens to rebuild the world.
    if (!position || position.count <= 3) return false
  }

  return true
}

export function resolveLandrushIslandColliderLevelPlacements({
  nodes,
  resolveObject,
  stacks,
}: {
  nodes: Record<string, AnyNode>
  resolveObject: (nodeId: AnyNodeId) => Object3D | undefined
  stacks: readonly LandrushIslandColliderFloorStack[]
}): readonly LandrushIslandColliderLevelPlacement[] | null {
  const baseYByLevelId = new Map<LevelNode['id'], number>()
  for (const stack of stacks) {
    for (const floor of stack.floors) {
      if (!Number.isFinite(floor.baseY)) return null
      for (const levelId of floor.levelIds) {
        const node = nodes[levelId]
        if (node?.type !== 'level') return null
        if (node.visible === false) continue
        const existingBaseY = baseYByLevelId.get(levelId)
        if (
          existingBaseY !== undefined &&
          Math.abs(existingBaseY - floor.baseY) > LANDRUSH_ISLAND_COLLIDER_LEVEL_BASE_Y_EPSILON
        ) {
          return null
        }
        baseYByLevelId.set(levelId, floor.baseY)
      }
    }
  }

  const placements: LandrushIslandColliderLevelPlacement[] = []
  const baseYByObject = new Map<Object3D, number>()
  for (const [levelId, baseY] of [...baseYByLevelId].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    const object = resolveObject(levelId)
    if (!object) return null
    const existingBaseY = baseYByObject.get(object)
    if (existingBaseY !== undefined) {
      if (Math.abs(existingBaseY - baseY) > LANDRUSH_ISLAND_COLLIDER_LEVEL_BASE_Y_EPSILON) {
        return null
      }
      continue
    }
    baseYByObject.set(object, baseY)
    placements.push({ baseY, levelId, object })
  }
  return placements
}

export function withLandrushIslandColliderLevelPlacements<T>(
  placements: readonly LandrushIslandColliderLevelPlacement[],
  build: () => T,
) {
  const snapshots = placements.map(({ object }) => ({
    object,
    visible: object.visible,
    y: object.position.y,
  }))

  try {
    for (const { baseY, object } of placements) {
      object.position.y = baseY
      object.visible = true
      object.updateWorldMatrix(true, true)
    }
    return build()
  } finally {
    for (const { object, visible, y } of snapshots) {
      object.position.y = y
      object.visible = visible
      object.updateWorldMatrix(true, true)
    }
  }
}
