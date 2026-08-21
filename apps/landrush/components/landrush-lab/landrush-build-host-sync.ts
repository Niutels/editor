import type {
  AnyNode,
  AnyNodeId,
  SceneCommit,
  SceneCommitOrigin,
  SceneNodePatch,
  SceneOperationPatch,
} from '@pascal-app/core'

type LandrushBuildHostPatchInput = {
  currentNodes: Readonly<Record<string, AnyNode>>
  currentRootNodeIds: readonly AnyNodeId[]
  incomingNodes: readonly AnyNode[]
  ownsCurrentNode: (node: AnyNode) => boolean
}

export type LandrushBuildHostPatchResult =
  | { kind: 'invalid' }
  | { kind: 'patches'; patches: readonly SceneOperationPatch[] }

export function shouldApplyLandrushBuildContentUpdate(update: { source?: unknown }) {
  return update.source === 'snapshot' || update.source === 'remote'
}

export function shouldPublishLandrushBuildSceneCommit(origin: SceneCommitOrigin) {
  return origin === 'local'
}

export function shouldSubscribeLandrushBuildCommitPublisher({
  hasLiveLayoutNode,
  hasLocalParcelOwnership,
}: {
  hasLiveLayoutNode: boolean
  hasLocalParcelOwnership: boolean
}) {
  return hasLiveLayoutNode && hasLocalParcelOwnership
}

export function isLandrushBuildMaterializationReady({
  appliedSequence,
  authorizedDeletedNodeIds = [],
  baselineNodes,
  liveNodes,
  materializedSequence,
}: {
  appliedSequence: number
  authorizedDeletedNodeIds?: Iterable<string>
  baselineNodes: readonly Pick<AnyNode, 'id'>[] | undefined
  liveNodes: Readonly<Record<string, unknown>>
  materializedSequence: number
}) {
  if (!(baselineNodes && appliedSequence > 0 && materializedSequence === appliedSequence)) {
    return false
  }

  const authorizedIds = new Set(authorizedDeletedNodeIds)
  return baselineNodes.every(
    (node) => Object.hasOwn(liveNodes, node.id) || authorizedIds.has(node.id),
  )
}

export function advanceLandrushBuildAuthorizedLocalDeletions({
  authorizedNodeIds,
  baselineNodes,
  commit,
}: {
  authorizedNodeIds: Iterable<AnyNodeId>
  baselineNodes: readonly Pick<AnyNode, 'id'>[]
  commit: SceneCommit
}) {
  const nextIds = new Set(authorizedNodeIds)
  if (commit.origin !== 'local') return nextIds

  for (const node of baselineNodes) {
    const id = node.id as AnyNodeId
    if (Object.hasOwn(commit.current.nodes, id)) {
      nextIds.delete(id)
      continue
    }
    if (!Object.hasOwn(commit.before.nodes, id)) continue
    if (commit.changedNodeIds?.has(id)) nextIds.add(id)
    else nextIds.delete(id)
  }
  return nextIds
}

export function isLandrushBuildConflictRetryReady({
  appliedSequence,
  conflictSequence,
  hasBaseline,
}: {
  appliedSequence: number
  conflictSequence: number
  hasBaseline: boolean
}) {
  return hasBaseline && conflictSequence > 0 && appliedSequence === conflictSequence
}

export function createLandrushBuildAuthorityParcelKey({
  authorityEpoch,
  parcelId,
  worldId,
}: {
  authorityEpoch: number
  parcelId: string
  worldId: string
}) {
  return `${authorityEpoch}\u0000${worldId}\u0000${parcelId}`
}

export function resetLandrushBuildAuthorityCachesOnChange({
  appliedSequences,
  authorizedDeletionIds,
  materializedSequences,
  nextAuthority,
  previousAuthority,
  quarantinedSequences,
  safeTransportBaselines,
}: {
  appliedSequences: Map<string, number>
  authorizedDeletionIds: Map<string, ReadonlySet<AnyNodeId>>
  materializedSequences: Map<string, number>
  nextAuthority: { epoch: number; worldId: string }
  previousAuthority: { epoch: number; worldId: string }
  quarantinedSequences: Map<string, number>
  safeTransportBaselines: Map<string, readonly AnyNode[]>
}) {
  if (
    previousAuthority.epoch === nextAuthority.epoch &&
    previousAuthority.worldId === nextAuthority.worldId
  ) {
    return false
  }
  appliedSequences.clear()
  authorizedDeletionIds.clear()
  materializedSequences.clear()
  quarantinedSequences.clear()
  safeTransportBaselines.clear()
  return true
}

export function createLandrushBuildAuthorityEvictionPatches({
  currentNodes,
  currentRootNodeIds,
  worldIds,
}: {
  currentNodes: Readonly<Record<string, AnyNode>>
  currentRootNodeIds: readonly AnyNodeId[]
  worldIds: ReadonlySet<string>
}): LandrushBuildHostPatchResult {
  const ownedNodeIds = collectLandrushBuildAuthorityEvictionNodeIds(currentNodes, worldIds)
  if (!ownedNodeIds) return { kind: 'invalid' }
  return createLandrushBuildHostOperationPatches({
    currentNodes,
    currentRootNodeIds,
    incomingNodes: [],
    ownsCurrentNode: (node) => ownedNodeIds.has(node.id),
  })
}

export function createLandrushBuildCommitPublishScheduler<TDesired>({
  publish,
  readDesired,
  scheduleMicrotask = queueMicrotask,
  settle,
}: {
  publish: (desired: TDesired) => void
  readDesired: () => TDesired
  scheduleMicrotask?: (callback: () => void) => void
  settle?: () => boolean
}) {
  let disposed = false
  let generation = 0
  let hasPendingLocalCommit = false

  return {
    dispose() {
      disposed = true
      generation += 1
      hasPendingLocalCommit = false
    },
    handleCommit(commit: SceneCommit) {
      if (shouldPublishLandrushBuildSceneCommit(commit.origin)) hasPendingLocalCommit = true
      const scheduledGeneration = ++generation
      scheduleMicrotask(() => {
        scheduleMicrotask(() => {
          if (disposed || scheduledGeneration !== generation) return
          const shouldPublish = hasPendingLocalCommit
          hasPendingLocalCommit = false
          if (settle && !settle()) return
          if (disposed || scheduledGeneration !== generation || !shouldPublish) return
          publish(readDesired())
        })
      })
    },
  }
}

export function createLandrushBuildInvalidNodeDeletionScheduler({
  deleteInvalidNodeIds,
  readInvalidNodeIds,
  scheduleMicrotask = queueMicrotask,
}: {
  deleteInvalidNodeIds: (ids: readonly string[]) => void
  readInvalidNodeIds: () => readonly string[]
  scheduleMicrotask?: (callback: () => void) => void
}) {
  let disposed = false
  let deleteQueued = false
  const pendingIds = new Set<string>()

  return {
    dispose() {
      disposed = true
      pendingIds.clear()
    },
    handleSceneChange() {
      if (disposed) return
      for (const id of readInvalidNodeIds()) pendingIds.add(id)
      if (deleteQueued || pendingIds.size === 0) return

      deleteQueued = true
      scheduleMicrotask(() => {
        deleteQueued = false
        if (disposed) return

        const currentInvalidIds = new Set(readInvalidNodeIds())
        const ids = [...pendingIds].filter((id) => currentInvalidIds.has(id))
        pendingIds.clear()
        if (ids.length > 0) deleteInvalidNodeIds(ids)
      })
    },
  }
}

export function createLandrushBuildHostOperationPatches({
  currentNodes,
  currentRootNodeIds,
  incomingNodes,
  ownsCurrentNode,
}: LandrushBuildHostPatchInput): LandrushBuildHostPatchResult {
  const incomingById = mapUniqueNodes(incomingNodes)
  if (!incomingById || !nodesHaveCompatibleIdentity(currentNodes, incomingNodes, ownsCurrentNode)) {
    return { kind: 'invalid' }
  }

  const scaffoldIds = collectNewParentScaffoldIds(currentNodes, incomingById)
  if (scaffoldIds === null) return { kind: 'invalid' }

  const patches: SceneOperationPatch[] = []
  let nextNodes = currentNodes
  let nextRootNodeIds = currentRootNodeIds

  if (scaffoldIds.size > 0) {
    const scaffoldNodes = incomingNodes
      .filter((node) => scaffoldIds.has(node.id))
      .map((node) => scaffoldNode(node, scaffoldIds))
    const scaffoldPatch = createScaffoldPatch({
      currentNodes,
      currentRootNodeIds,
      scaffoldNodes,
    })
    if (!scaffoldPatch) return { kind: 'invalid' }
    if (!isLandrushBuildHostOperationPatchEmpty(scaffoldPatch)) patches.push(scaffoldPatch)
    const scaffoldState = applyScaffoldForPlanning(currentNodes, currentRootNodeIds, scaffoldNodes)
    if (!scaffoldState) return { kind: 'invalid' }
    nextNodes = scaffoldState.nodes
    nextRootNodeIds = scaffoldState.rootNodeIds
  }

  const relationBridge = createDeletedParentRelationBridge({
    currentNodes: nextNodes,
    currentRootNodeIds: nextRootNodeIds,
    incomingById,
    incomingNodes,
    ownsCurrentNode,
    scaffoldIds,
  })
  if (relationBridge === null) return { kind: 'invalid' }
  if (relationBridge) {
    patches.push(relationBridge.patch)
    nextNodes = relationBridge.nodes
  }

  const reconcilePatch = createReconcilePatch({
    currentNodes: nextNodes,
    currentRootNodeIds: nextRootNodeIds,
    incomingNodes,
    ownsCurrentNode,
  })
  if (!reconcilePatch) return { kind: 'invalid' }
  if (!isLandrushBuildHostOperationPatchEmpty(reconcilePatch)) patches.push(reconcilePatch)
  return { kind: 'patches', patches }
}

function createDeletedParentRelationBridge({
  currentNodes,
  currentRootNodeIds,
  incomingById,
  incomingNodes,
  ownsCurrentNode,
  scaffoldIds,
}: {
  currentNodes: Readonly<Record<string, AnyNode>>
  currentRootNodeIds: readonly AnyNodeId[]
  incomingById: ReadonlyMap<AnyNodeId, AnyNode>
  incomingNodes: readonly AnyNode[]
  ownsCurrentNode: (node: AnyNode) => boolean
  scaffoldIds: ReadonlySet<AnyNodeId>
}) {
  const bridgeNodes = Object.values(currentNodes).filter(
    (node) => ownsCurrentNode(node) || scaffoldIds.has(node.id),
  )
  const bridgeById = new Map(bridgeNodes.map((node) => [node.id, node]))
  const deleteIds = new Set(
    bridgeNodes.filter((node) => !incomingById.has(node.id)).map((node) => node.id),
  )
  const reparentedNodes = incomingNodes.filter((incoming) => {
    const current = currentNodes[incoming.id]
    const currentParentId = normalizedParentId(current)
    return (
      current !== undefined &&
      currentParentId !== normalizedParentId(incoming) &&
      currentParentId !== null &&
      deleteIds.has(currentParentId)
    )
  })
  if (reparentedNodes.length === 0) return undefined

  for (const incoming of reparentedNodes) {
    const current = bridgeById.get(incoming.id)
    const currentParentId = normalizedParentId(current)
    const incomingParentId = normalizedParentId(incoming)
    if (!current || !currentParentId || !incomingParentId || deleteIds.has(incomingParentId)) {
      return null
    }

    const currentParent = bridgeById.get(currentParentId)
    const incomingParent = currentNodes[incomingParentId]
    if (
      !currentParent ||
      !hasExplicitChildren(currentParent) ||
      !explicitChildren(currentParent).includes(current.id) ||
      !incomingParent ||
      !hasExplicitChildren(incomingParent)
    ) {
      return null
    }

    bridgeById.set(current.id, { ...current, parentId: incomingParentId } as AnyNode)
    bridgeById.set(currentParentId, {
      ...currentParent,
      children: explicitChildren(currentParent).filter((id) => id !== current.id),
    } as AnyNode)

    const ownedIncomingParent = bridgeById.get(incomingParentId)
    if (ownedIncomingParent) {
      const children = explicitChildren(ownedIncomingParent)
      bridgeById.set(incomingParentId, {
        ...ownedIncomingParent,
        children: children.includes(current.id) ? children : [...children, current.id],
      } as AnyNode)
    }
  }

  const patch = createReconcilePatch({
    currentNodes,
    currentRootNodeIds,
    incomingNodes: [...bridgeById.values()],
    ownsCurrentNode,
  })
  if (
    !patch ||
    patch.materialChanges.length > 0 ||
    patch.nodeCreates.length > 0 ||
    patch.nodeDeletes.length > 0 ||
    isLandrushBuildHostOperationPatchEmpty(patch)
  ) {
    return null
  }

  const nodes = applyNodeUpdatesForPlanning(currentNodes, patch.nodeUpdates)
  return nodes ? { nodes, patch } : null
}

export function activateLandrushBuildHostEditorTarget({
  applyPatch,
  currentNodes,
  currentRootNodeIds,
  hasLiveNodeState,
  incomingNodes,
  ownsCurrentNode,
  selectTarget,
  target,
}: LandrushBuildHostPatchInput & {
  applyPatch: (patch: SceneOperationPatch) => boolean
  hasLiveNodeState?: (id: AnyNodeId) => boolean
  selectTarget: (target: { buildingId: AnyNodeId; levelId: AnyNodeId }) => void
  target: { buildingId: AnyNodeId; levelId: AnyNodeId }
}) {
  const result = createLandrushBuildHostOperationPatches({
    currentNodes,
    currentRootNodeIds,
    incomingNodes,
    ownsCurrentNode,
  })
  if (result.kind === 'invalid') return false
  if (
    hasLiveNodeState &&
    landrushBuildHostOperationPatchesHaveLiveConflict(
      result.patches,
      currentNodes,
      hasLiveNodeState,
    )
  ) {
    return false
  }
  for (const patch of result.patches) {
    if (!applyPatch(patch)) return false
  }
  selectTarget(target)
  return true
}

export function landrushBuildHostOperationPatchesHaveLiveConflict(
  patches: readonly SceneOperationPatch[],
  currentNodes: Readonly<Record<string, AnyNode>>,
  hasLiveNodeState: (id: AnyNodeId) => boolean,
) {
  const conflictIds = new Set<AnyNodeId>()
  const addNodeAndParent = (node: AnyNode) => {
    conflictIds.add(node.id)
    const parentId = normalizedParentId(node)
    if (parentId) conflictIds.add(parentId)
  }

  for (const patch of patches) {
    for (const { id, data } of patch.nodeUpdates) {
      conflictIds.add(id)
      if (!Object.hasOwn(data, 'parentId')) continue
      const currentParentId = normalizedParentId(currentNodes[id])
      if (currentParentId) conflictIds.add(currentParentId)
      if (typeof data.parentId === 'string') conflictIds.add(data.parentId as AnyNodeId)
    }
    for (const { node } of patch.nodeCreates) addNodeAndParent(node)
    for (const { node } of patch.nodeDeletes) addNodeAndParent(node)
  }

  return [...conflictIds].some(hasLiveNodeState)
}

export function isLandrushBuildHostOperationPatchEmpty(patch: SceneOperationPatch) {
  return (
    patch.materialChanges.length === 0 &&
    patch.nodeCreates.length === 0 &&
    patch.nodeDeletes.length === 0 &&
    patch.nodeUpdates.length === 0
  )
}

function createScaffoldPatch({
  currentNodes,
  currentRootNodeIds,
  scaffoldNodes,
}: {
  currentNodes: Readonly<Record<string, AnyNode>>
  currentRootNodeIds: readonly AnyNodeId[]
  scaffoldNodes: readonly AnyNode[]
}) {
  const scaffoldById = mapUniqueNodes(scaffoldNodes)
  if (!scaffoldById) return null
  const patch = emptyOperationPatch()
  const createOffsetByParent = new Map<AnyNodeId | null, number>()

  for (const node of scaffoldNodes) {
    const parentId = normalizedParentId(node)
    const scaffoldParent = parentId ? scaffoldById.get(parentId) : null
    let position: number
    if (scaffoldParent) {
      position = explicitChildren(scaffoldParent).indexOf(node.id)
      if (position < 0) return null
    } else {
      const siblings = parentId ? explicitChildren(currentNodes[parentId]) : [...currentRootNodeIds]
      if (parentId && !currentNodes[parentId]) return null
      const offset = createOffsetByParent.get(parentId) ?? 0
      position = siblings.length + offset
      createOffsetByParent.set(parentId, offset + 1)
    }
    patch.nodeCreates.push({ node, position })
  }

  return patch
}

function createReconcilePatch({
  currentNodes,
  currentRootNodeIds,
  incomingNodes,
  ownsCurrentNode,
}: LandrushBuildHostPatchInput): SceneOperationPatch | null {
  const incomingById = mapUniqueNodes(incomingNodes)
  if (!incomingById) return null
  const currentOwnedNodes = Object.values(currentNodes).filter(ownsCurrentNode)
  const deleteIds = new Set(
    currentOwnedNodes
      .filter((node) => !incomingById.has(node.id))
      .map((node) => node.id as AnyNodeId),
  )
  const createIds = new Set(
    incomingNodes.filter((node) => !currentNodes[node.id]).map((node) => node.id as AnyNodeId),
  )
  const patch = emptyOperationPatch()

  for (const node of incomingNodes) {
    const current = currentNodes[node.id]
    if (!current) continue
    if (current.type !== node.type || current.object !== node.object) return null
    const currentParentId = normalizedParentId(current)
    const incomingParentId = normalizedParentId(node)
    if (currentParentId === incomingParentId) continue
    if (!(currentParentId && incomingParentId)) return null
    if (deleteIds.has(currentParentId) || deleteIds.has(incomingParentId)) return null
  }

  for (const node of currentOwnedNodes) {
    if (!deleteIds.has(node.id)) continue
    const siblings = siblingsForNode(currentNodes, currentRootNodeIds, node)
    const position = siblings.indexOf(node.id)
    if (position < 0) return null
    patch.nodeDeletes.push({ node, position })
  }

  const createOffsetByParent = new Map<AnyNodeId | null, number>()
  for (const node of incomingNodes) {
    if (!createIds.has(node.id)) continue
    const parentId = normalizedParentId(node)
    const parentIsCreated = Boolean(parentId && createIds.has(parentId))
    let position: number
    if (parentIsCreated && parentId) {
      position = explicitChildren(incomingById.get(parentId)).indexOf(node.id)
      if (position < 0) return null
    } else {
      const siblings = parentId ? explicitChildren(currentNodes[parentId]) : [...currentRootNodeIds]
      if (parentId && !currentNodes[parentId]) return null
      const retainedCount = siblings.filter((id) => !deleteIds.has(id)).length
      const offset = createOffsetByParent.get(parentId) ?? 0
      position = retainedCount + offset
      createOffsetByParent.set(parentId, offset + 1)
    }
    patch.nodeCreates.push({ node, position })
  }

  const updatesById = new Map<AnyNodeId, SceneNodePatch>()
  for (const node of incomingNodes) {
    const current = currentNodes[node.id]
    if (!current) continue
    const update = createNodeUpdate(current, node)
    if (update) updatesById.set(update.id, update)
  }

  const externalParentIds = new Set<AnyNodeId>()
  for (const node of incomingNodes) {
    const current = currentNodes[node.id]
    if (!current) continue
    const currentParentId = normalizedParentId(current)
    const incomingParentId = normalizedParentId(node)
    if (currentParentId === incomingParentId) continue
    if (currentParentId && !incomingById.has(currentParentId))
      externalParentIds.add(currentParentId)
    if (incomingParentId && !incomingById.has(incomingParentId)) {
      externalParentIds.add(incomingParentId)
    }
  }

  for (const parentId of externalParentIds) {
    const parent = currentNodes[parentId]
    if (!parent || deleteIds.has(parentId)) return null
    const children = explicitChildren(parent).filter((childId) => {
      if (deleteIds.has(childId)) return false
      const incoming = incomingById.get(childId)
      return !incoming || normalizedParentId(incoming) === parentId
    })
    for (const node of incomingNodes) {
      if (normalizedParentId(node) !== parentId || children.includes(node.id)) continue
      children.push(node.id)
    }
    if (!semanticValuesEqual(explicitChildren(parent), children)) {
      const existing = updatesById.get(parentId)
      updatesById.set(parentId, {
        data: { ...(existing?.data ?? {}), children } as Partial<AnyNode>,
        id: parentId,
        removeFields: existing?.removeFields ?? [],
      })
    }
  }

  patch.nodeUpdates.push(...updatesById.values())
  return patch
}

function collectNewParentScaffoldIds(
  currentNodes: Readonly<Record<string, AnyNode>>,
  incomingById: ReadonlyMap<AnyNodeId, AnyNode>,
) {
  const scaffoldIds = new Set<AnyNodeId>()
  for (const node of incomingById.values()) {
    const current = currentNodes[node.id]
    if (!current || normalizedParentId(current) === normalizedParentId(node)) continue
    const parentId = normalizedParentId(node)
    if (!parentId) return null
    let ancestorId: AnyNodeId | null = parentId
    const visited = new Set<AnyNodeId>()
    while (ancestorId && !currentNodes[ancestorId]) {
      if (visited.has(ancestorId)) return null
      visited.add(ancestorId)
      const ancestor = incomingById.get(ancestorId)
      if (!ancestor) return null
      scaffoldIds.add(ancestorId)
      ancestorId = normalizedParentId(ancestor)
    }
  }
  return scaffoldIds
}

function scaffoldNode(node: AnyNode, scaffoldIds: ReadonlySet<AnyNodeId>) {
  if (!('children' in node && Array.isArray(node.children))) return node
  return {
    ...node,
    children: explicitChildren(node).filter((id) => scaffoldIds.has(id)),
  } as AnyNode
}

function applyScaffoldForPlanning(
  currentNodes: Readonly<Record<string, AnyNode>>,
  currentRootNodeIds: readonly AnyNodeId[],
  scaffoldNodes: readonly AnyNode[],
) {
  const nodes = { ...currentNodes } as Record<string, AnyNode>
  const rootNodeIds = [...currentRootNodeIds]
  const scaffoldIds = new Set(scaffoldNodes.map((node) => node.id))

  for (const node of scaffoldNodes) nodes[node.id] = node
  for (const node of scaffoldNodes) {
    const parentId = normalizedParentId(node)
    if (!parentId) {
      if (!rootNodeIds.includes(node.id)) rootNodeIds.push(node.id)
      continue
    }
    if (scaffoldIds.has(parentId)) continue
    const parent = nodes[parentId]
    if (!parent) return null
    const children = explicitChildren(parent)
    if (!children.includes(node.id)) {
      nodes[parentId] = { ...parent, children: [...children, node.id] } as AnyNode
    }
  }
  return { nodes, rootNodeIds }
}

function applyNodeUpdatesForPlanning(
  currentNodes: Readonly<Record<string, AnyNode>>,
  updates: readonly SceneNodePatch[],
) {
  const nodes = { ...currentNodes } as Record<string, AnyNode>
  for (const { id, data, removeFields } of updates) {
    const current = nodes[id]
    if (!current) return null
    const next = { ...current, ...data } as Record<string, unknown>
    for (const field of removeFields) delete next[field]
    nodes[id] = next as AnyNode
  }
  return nodes
}

function nodesHaveCompatibleIdentity(
  currentNodes: Readonly<Record<string, AnyNode>>,
  incomingNodes: readonly AnyNode[],
  ownsCurrentNode: (node: AnyNode) => boolean,
) {
  return incomingNodes.every((node) => {
    const current = currentNodes[node.id]
    return (
      !current ||
      (ownsCurrentNode(current) && current.type === node.type && current.object === node.object)
    )
  })
}

function mapUniqueNodes(nodes: readonly AnyNode[]) {
  const result = new Map<AnyNodeId, AnyNode>()
  for (const node of nodes) {
    if (result.has(node.id)) return null
    result.set(node.id, node)
  }
  return result
}

function collectLandrushBuildAuthorityEvictionNodeIds(
  nodes: Readonly<Record<string, AnyNode>>,
  worldIds: ReadonlySet<string>,
) {
  const childrenByParentId = new Map<AnyNodeId, AnyNodeId[]>()
  const stack: Array<{ id: AnyNodeId; parcelId: string; worldId: string }> = []
  for (const node of Object.values(nodes)) {
    const parentId = normalizedParentId(node)
    if (parentId) {
      const children = childrenByParentId.get(parentId) ?? []
      children.push(node.id)
      childrenByParentId.set(parentId, children)
    }
    const identity = landrushBuildAuthorityIdentity(node)
    const metadata = node.metadata as { landrushBuildSynced?: unknown } | undefined
    if (
      identity.kind === 'tagged' &&
      metadata?.landrushBuildSynced === true &&
      worldIds.has(identity.worldId)
    ) {
      stack.push({ id: node.id, parcelId: identity.parcelId, worldId: identity.worldId })
    }
  }

  const identityByNodeId = new Map<AnyNodeId, string>()
  const ownedNodeIds = new Set<AnyNodeId>()
  while (stack.length > 0) {
    const next = stack.pop()!
    const identityKey = `${next.worldId}\u0000${next.parcelId}`
    const existingIdentity = identityByNodeId.get(next.id)
    if (existingIdentity) {
      if (existingIdentity !== identityKey) return null
      continue
    }
    const node = nodes[next.id]
    if (!node) return null
    const identity = landrushBuildAuthorityIdentity(node)
    if (
      identity.kind === 'invalid' ||
      (identity.kind === 'tagged' &&
        (identity.parcelId !== next.parcelId || identity.worldId !== next.worldId))
    ) {
      return null
    }

    identityByNodeId.set(next.id, identityKey)
    ownedNodeIds.add(next.id)
    const childIds = new Set([
      ...explicitChildren(node),
      ...(childrenByParentId.get(next.id) ?? []),
    ])
    for (const childId of childIds) {
      stack.push({ id: childId, parcelId: next.parcelId, worldId: next.worldId })
    }
  }

  for (const id of ownedNodeIds) {
    const parentId = normalizedParentId(nodes[id])
    if (!parentId) continue
    const parentIdentity = landrushBuildAuthorityIdentity(nodes[parentId])
    if (parentIdentity.kind === 'invalid') return null
    if (parentIdentity.kind === 'untagged') continue
    const identity = identityByNodeId.get(id)
    if (`${parentIdentity.worldId}\u0000${parentIdentity.parcelId}` !== identity) return null
  }

  const resolvedIds = new Set<AnyNodeId>()
  for (const id of ownedNodeIds) {
    const pathIds = new Set<AnyNodeId>()
    let currentId: AnyNodeId | null = id
    while (currentId && ownedNodeIds.has(currentId) && !resolvedIds.has(currentId)) {
      if (pathIds.has(currentId)) return null
      pathIds.add(currentId)
      currentId = normalizedParentId(nodes[currentId])
    }
    for (const pathId of pathIds) resolvedIds.add(pathId)
  }
  return ownedNodeIds
}

function landrushBuildAuthorityIdentity(node: AnyNode | undefined) {
  const metadata = node?.metadata as
    | { landrushParcelId?: unknown; landrushWorldId?: unknown }
    | undefined
  const parcelId = metadata?.landrushParcelId
  const worldId = metadata?.landrushWorldId
  if (parcelId === undefined && worldId === undefined) return { kind: 'untagged' as const }
  if (typeof parcelId !== 'string' || typeof worldId !== 'string') {
    return { kind: 'invalid' as const }
  }
  return { kind: 'tagged' as const, parcelId, worldId }
}

function emptyOperationPatch(): SceneOperationPatch {
  return {
    materialChanges: [],
    nodeCreates: [],
    nodeDeletes: [],
    nodeUpdates: [],
  }
}

function createNodeUpdate(current: AnyNode, incoming: AnyNode): SceneNodePatch | null {
  const currentRecord = current as unknown as Record<string, unknown>
  const incomingRecord = incoming as unknown as Record<string, unknown>
  const data: Record<string, unknown> = {}
  const removeFields: string[] = []

  for (const [field, value] of Object.entries(incomingRecord)) {
    if (field === 'id' || field === 'object' || field === 'type') continue
    if (!semanticValuesEqual(currentRecord[field], value)) data[field] = value
  }
  for (const field of Object.keys(currentRecord)) {
    if (field === 'id' || field === 'object' || field === 'type') continue
    if (!Object.hasOwn(incomingRecord, field)) removeFields.push(field)
  }

  if (Object.keys(data).length === 0 && removeFields.length === 0) return null
  return {
    data: data as Partial<AnyNode>,
    id: current.id,
    removeFields,
  }
}

function normalizedParentId(node: AnyNode | undefined) {
  return (node?.parentId as AnyNodeId | null | undefined) ?? null
}

function siblingsForNode(
  nodes: Readonly<Record<string, AnyNode>>,
  rootNodeIds: readonly AnyNodeId[],
  node: AnyNode,
) {
  const parentId = normalizedParentId(node)
  return parentId ? explicitChildren(nodes[parentId]) : [...rootNodeIds]
}

function explicitChildren(node: AnyNode | undefined): AnyNodeId[] {
  if (!(node && 'children' in node && Array.isArray(node.children))) return []
  return node.children.filter((id) => typeof id === 'string') as AnyNodeId[]
}

function hasExplicitChildren(node: AnyNode | undefined) {
  return Boolean(node && 'children' in node && Array.isArray(node.children))
}

function semanticValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => semanticValuesEqual(value, right[index]))
    )
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) && semanticValuesEqual(leftRecord[key], rightRecord[key]),
    )
  )
}
