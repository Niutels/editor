export function reconcileLandrushDestroyedFurnitureIds(
  current: ReadonlySet<string>,
  next: ReadonlySet<string>,
): ReadonlySet<string> {
  if (current.size === next.size && [...current].every((nodeId) => next.has(nodeId))) {
    return current
  }

  return new Set(next)
}

export function createLandrushDestroyedFurnitureExclusionSignature(nodeIds: ReadonlySet<string>) {
  return JSON.stringify([...nodeIds].sort())
}
