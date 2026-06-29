import type { AnyNode, AnyNodeId } from '../schema/types'

export type SceneRelationNormalization = {
  changedNodeIds: Set<AnyNodeId>
  nodes: Record<AnyNodeId, AnyNode>
}

export function normalizeSceneRelations(
  nodes: Record<AnyNodeId, AnyNode>,
): SceneRelationNormalization {
  const childIdsByParentId = new Map<AnyNodeId, AnyNodeId[]>()

  for (const node of Object.values(nodes)) {
    const parentId = node.parentId as AnyNodeId | null
    if (!parentId || !nodes[parentId]) continue

    const children = childIdsByParentId.get(parentId) ?? []
    children.push(node.id as AnyNodeId)
    childIdsByParentId.set(parentId, children)
  }

  let nextNodes = nodes
  const changedNodeIds = new Set<AnyNodeId>()

  for (const node of Object.values(nodes)) {
    if (!('children' in node)) continue

    const nodeId = node.id as AnyNodeId
    const existingChildren = Array.isArray((node as { children?: unknown }).children)
      ? ((node as { children: AnyNodeId[] }).children ?? [])
      : []
    const nextChildren: AnyNodeId[] = []

    for (const childId of existingChildren) {
      const child = nodes[childId]
      if (!child) continue

      const childParentId = child.parentId as AnyNodeId | null
      if (childParentId && childParentId !== nodeId) continue
      if (!nextChildren.includes(childId)) nextChildren.push(childId)
    }

    for (const childId of childIdsByParentId.get(nodeId) ?? []) {
      if (!nextChildren.includes(childId)) nextChildren.push(childId)
    }

    if (sameNodeIdArray(existingChildren, nextChildren)) continue

    if (nextNodes === nodes) nextNodes = { ...nodes }
    nextNodes[nodeId] = { ...node, children: nextChildren } as AnyNode
    changedNodeIds.add(nodeId)
  }

  return { changedNodeIds, nodes: nextNodes }
}

function sameNodeIdArray(first: readonly AnyNodeId[], second: readonly AnyNodeId[]) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}
