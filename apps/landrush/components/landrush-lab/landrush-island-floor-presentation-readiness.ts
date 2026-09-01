export type LandrushIslandFloorPresentationReadiness = Readonly<{
  completed: number
  generation: string
  ready: boolean
  requestKey: string
  total: number
}>

export type LandrushIslandFloorPresentationReadinessState = Readonly<{
  settledGeneration: string | null
}>

export type LandrushIslandFloorPresentationPoseSnapshot = {
  groundY: number
  hasMotion: boolean
  stacks: unknown
  x: number
  y: number
  z: number
}

export function landrushIslandFloorPresentationPoseChanged(
  previous: LandrushIslandFloorPresentationPoseSnapshot | null,
  stacks: unknown,
  groundY: number,
  hasMotion: boolean,
  x: number,
  y: number,
  z: number,
) {
  return (
    previous === null ||
    previous.stacks !== stacks ||
    previous.groundY !== groundY ||
    previous.hasMotion !== hasMotion ||
    previous.x !== x ||
    previous.y !== y ||
    previous.z !== z
  )
}

export function collectLandrushIslandExpectedFloorPresentationRoots<
  TNode extends { children?: readonly string[]; type: string },
  TEntry extends { levelId: string; root: object | null },
>({
  nodes,
  rootNodeIds,
  roots,
}: {
  nodes: Readonly<Record<string, TNode>>
  rootNodeIds: readonly string[]
  roots: readonly TEntry[]
}): TEntry[] {
  const reachableNodeIds = new Set<string>()
  const pendingNodeIds = [...rootNodeIds]

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.pop()
    if (!nodeId || reachableNodeIds.has(nodeId)) continue
    const node = nodes[nodeId]
    if (!node) continue
    reachableNodeIds.add(nodeId)
    for (const childId of node.children ?? []) {
      if (!reachableNodeIds.has(childId)) pendingNodeIds.push(childId)
    }
  }

  // An unregistered root has no admission or canonical-completion path. A later
  // registry revision rebuilds this set and admits the root before it is counted.
  return roots.filter(({ levelId, root }) => {
    const node = nodes[levelId]
    return (
      root !== null &&
      reachableNodeIds.has(levelId) &&
      (node?.type === 'level' || node?.type === 'ceiling' || node?.type === 'roof')
    )
  })
}

export function collectLandrushIslandRegisteredFloorPresentationRoots<
  TRoot extends object,
  TEntry extends { root: TRoot | null },
>(roots: readonly TEntry[]): Array<TEntry & { root: TRoot }> {
  return roots.filter((entry): entry is TEntry & { root: TRoot } => entry.root !== null)
}

export function advanceLandrushIslandFloorPresentationReadiness({
  admissionComplete,
  canonicalReadyRoots,
  generation,
  hasPendingWork,
  previous,
  registrationComplete,
  requestKey,
  total,
}: {
  admissionComplete: boolean
  canonicalReadyRoots: number
  generation: string
  hasPendingWork: boolean
  previous: LandrushIslandFloorPresentationReadinessState
  registrationComplete: boolean
  requestKey: string
  total: number
}): Readonly<{
  readiness: LandrushIslandFloorPresentationReadiness
  state: LandrushIslandFloorPresentationReadinessState
}> {
  const boundedTotal = Math.max(0, Math.trunc(total))
  const completed = Math.min(boundedTotal, Math.max(0, Math.trunc(canonicalReadyRoots)))
  const complete =
    admissionComplete && registrationComplete && !hasPendingWork && completed === boundedTotal
  const ready = complete && previous.settledGeneration === generation

  return {
    readiness: {
      completed,
      generation,
      ready,
      requestKey,
      total: boundedTotal,
    },
    state: {
      settledGeneration: complete ? generation : null,
    },
  }
}

export function reconcileLandrushIslandFloorPresentationReadiness({
  current,
  currentRequestKey,
  reported,
}: {
  current: LandrushIslandFloorPresentationReadiness | null
  currentRequestKey: string
  reported: LandrushIslandFloorPresentationReadiness
}) {
  if (reported.requestKey !== currentRequestKey) return current
  if (
    current?.requestKey === reported.requestKey &&
    current.generation === reported.generation &&
    current.completed === reported.completed &&
    current.total === reported.total &&
    current.ready === reported.ready
  ) {
    return current
  }
  return reported
}

export function resolveLandrushIslandFloorPresentationReady({
  admitted,
  requestKey,
  status,
}: {
  admitted: boolean
  requestKey: string
  status: LandrushIslandFloorPresentationReadiness | null
}) {
  return admitted && status?.requestKey === requestKey && status.ready
}
