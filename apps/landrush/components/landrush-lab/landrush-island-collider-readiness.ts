import type { AnyNode, AnyNodeId } from '@pascal-app/core'
import type { Mesh, Object3D } from 'three'

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
