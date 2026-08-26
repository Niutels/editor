import type { AnyNode, SpawnNode } from '@pascal-app/core'

export function resolveLevelSpawnSingleton(
  nodes: Readonly<Record<string, AnyNode>>,
  activeLevelId: string,
) {
  const spawnIds = Object.values(nodes)
    .filter((node): node is SpawnNode => node.type === 'spawn' && node.parentId === activeLevelId)
    .map((node) => node.id)
    .sort()

  return {
    duplicateIds: spawnIds.slice(1),
    existingId: spawnIds[0] ?? null,
  }
}
