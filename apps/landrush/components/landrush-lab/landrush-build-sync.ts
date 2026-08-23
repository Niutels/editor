export type LandrushBuildSyncGraphNode = {
  readonly children?: readonly string[]
  readonly id: string
  readonly metadata?: unknown
  readonly parentId?: string | null
  readonly type?: string
  readonly visible?: boolean
}

const LANDRUSH_BUILD_SYNC_STRUCTURAL_OBJECT_TYPES = new Set([
  'ceiling',
  'column',
  'elevator',
  'fence',
  'item',
  'roof',
  'shelf',
  'slab',
  'stair',
  'wall',
])

export function isLandrushBuildPlacementDraft(node: Pick<LandrushBuildSyncGraphNode, 'metadata'>) {
  const metadata = node.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false

  const placementMetadata = metadata as { isNew?: unknown; isTransient?: unknown }
  return placementMetadata.isTransient === true || placementMetadata.isNew === true
}

export function isLandrushBuildSyncStructuralObject(
  node: Pick<LandrushBuildSyncGraphNode, 'parentId' | 'type' | 'visible'>,
  isBuildLevelId: (parentId: string | null | undefined) => boolean,
) {
  return (
    typeof node.type === 'string' &&
    LANDRUSH_BUILD_SYNC_STRUCTURAL_OBJECT_TYPES.has(node.type) &&
    isBuildLevelId(node.parentId)
  )
}

export function parseLandrushBuildSyncSnapshotNodes<Node extends { id: string }>(
  values: readonly unknown[],
  parseNode: (value: unknown) => Node | null,
): { kind: 'invalid' } | { kind: 'nodes'; nodes: Record<string, Node> } {
  const nodes: Record<string, Node> = {}
  for (const value of values) {
    const parsedNode = parseNode(value)
    const node = parsedNode
      ? preserveLandrushBuildSyncMigrationFieldPresence(value, parsedNode)
      : null
    if (!node || Object.hasOwn(nodes, node.id)) return { kind: 'invalid' }
    nodes[node.id] = node
  }
  return { kind: 'nodes', nodes }
}

function preserveLandrushBuildSyncMigrationFieldPresence<Node extends { id: string }>(
  source: unknown,
  parsedNode: Node,
): Node {
  if (
    !source ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    !parsedNode ||
    typeof parsedNode !== 'object' ||
    Array.isArray(parsedNode)
  ) {
    return parsedNode
  }

  const sourceRecord = source as Record<string, unknown>
  const parsedRecord = parsedNode as Node & Record<string, unknown>
  if (sourceRecord.id !== parsedRecord.id || sourceRecord.type !== parsedRecord.type) {
    return parsedNode
  }

  const presenceSensitiveField =
    sourceRecord.type === 'slab'
      ? 'thickness'
      : sourceRecord.type === 'level' ||
          sourceRecord.type === 'wall' ||
          sourceRecord.type === 'ceiling'
        ? 'height'
        : null
  if (
    !presenceSensitiveField ||
    sourceRecord[presenceSensitiveField] !== undefined ||
    !Object.hasOwn(parsedRecord, presenceSensitiveField)
  ) {
    return parsedNode
  }

  // Core uses these omitted fields as vertical migration or follow-mode gates.
  const migratedInput = { ...parsedRecord }
  delete migratedInput[presenceSensitiveField]
  return migratedInput
}

export function isLandrushBuildSyncV2GraphLossless<
  ParsedNode extends LandrushBuildSyncGraphNode,
  SelectedNode extends LandrushBuildSyncGraphNode,
  CanonicalNode extends LandrushBuildSyncGraphNode,
>(
  parsedNodes: Readonly<Record<string, ParsedNode>>,
  selectedNodes: readonly SelectedNode[],
  canonicalTransportNodes: readonly CanonicalNode[],
) {
  const parsedIds = Object.keys(parsedNodes)
  if (
    parsedIds.length !== selectedNodes.length ||
    !selectedNodes.every((node) => Object.hasOwn(parsedNodes, node.id)) ||
    parsedIds.length !== canonicalTransportNodes.length
  ) {
    return false
  }

  const canonicalById = new Map(canonicalTransportNodes.map((node) => [node.id, node]))
  return parsedIds.every((id) => {
    const canonical = canonicalById.get(id)
    return Boolean(canonical && semanticValuesEqual(parsedNodes[id], canonical))
  })
}

export function isLandrushBuildSyncMigrationPayloadSafe<
  SourceNode extends { id: string },
  CandidateNode extends LandrushBuildSyncGraphNode,
  CanonicalNode extends LandrushBuildSyncGraphNode,
>(
  sourceNodes: readonly SourceNode[],
  candidateTransportNodes: readonly CandidateNode[],
  canonicalTransportNodes: readonly CanonicalNode[],
) {
  const sourceIds = new Set<string>()
  for (const node of sourceNodes) {
    if (sourceIds.has(node.id)) return false
    sourceIds.add(node.id)
  }

  const candidateById = new Map<string, CandidateNode>()
  for (const node of candidateTransportNodes) {
    if (candidateById.has(node.id)) return false
    candidateById.set(node.id, node)
  }
  if ([...sourceIds].some((id) => !candidateById.has(id))) return false

  return isLandrushBuildSyncV2GraphLossless(
    Object.fromEntries(candidateById),
    candidateTransportNodes,
    canonicalTransportNodes,
  )
}

export function areLandrushBuildSyncNodeSetsEqual<
  LeftNode extends LandrushBuildSyncGraphNode,
  RightNode extends LandrushBuildSyncGraphNode,
>(leftNodes: readonly LeftNode[], rightNodes: readonly RightNode[]) {
  if (leftNodes.length !== rightNodes.length) return false
  const rightById = new Map<string, RightNode>()
  for (const node of rightNodes) {
    if (rightById.has(node.id)) return false
    rightById.set(node.id, node)
  }
  const leftIds = new Set<string>()
  for (const node of leftNodes) {
    if (leftIds.has(node.id)) return false
    leftIds.add(node.id)
    const right = rightById.get(node.id)
    if (!right || !semanticValuesEqual(node, right)) return false
  }
  return true
}

export function isLandrushBuildSyncCandidateSafeAgainstLiveBaseline<
  BaselineNode extends LandrushBuildSyncGraphNode,
  CandidateNode extends LandrushBuildSyncGraphNode,
  LiveNode extends LandrushBuildSyncGraphNode,
>(
  baselineNodes: readonly BaselineNode[],
  candidateNodes: readonly CandidateNode[],
  liveNodes: Readonly<Record<string, LiveNode>>,
  options: {
    authorizedDeletedNodeIds?: Iterable<string>
    requiredLiveNodeIds?: Iterable<string>
  } = {},
) {
  const baselineIds = new Set<string>()
  for (const node of baselineNodes) {
    if (baselineIds.has(node.id)) return false
    baselineIds.add(node.id)
  }

  const candidateIds = new Set<string>()
  for (const node of candidateNodes) {
    if (candidateIds.has(node.id)) return false
    candidateIds.add(node.id)
  }

  const authorizedDeletedNodeIds = new Set(options.authorizedDeletedNodeIds ?? [])
  for (const id of baselineIds) {
    if (candidateIds.has(id)) continue
    if (!Object.hasOwn(liveNodes, id) && authorizedDeletedNodeIds.has(id)) continue
    return false
  }
  for (const id of options.requiredLiveNodeIds ?? []) {
    if (candidateIds.has(id) || !Object.hasOwn(liveNodes, id)) continue
    if (hasLandrushBuildPlacementDraftAncestry(liveNodes, id)) continue
    return false
  }
  return true
}

export function collectLandrushBuildSyncRequiredLiveNodeIds<
  Node extends LandrushBuildSyncGraphNode,
>(nodes: Readonly<Record<string, Node>>, isOwnedStructuralNode: (node: Node) => boolean) {
  const ids = new Set<string>()
  for (const node of Object.values(nodes)) {
    if (!isOwnedStructuralNode(node)) continue
    if (hasLandrushBuildPlacementDraftAncestry(nodes, node.id)) continue
    ids.add(node.id)
  }
  return ids
}

export function areLandrushBuildFootprintsInsideBoundary<Point>(
  footprints: readonly (readonly Point[])[],
  isInsideBoundary: (point: Point) => boolean,
) {
  return (
    footprints.length > 0 &&
    footprints.every((footprint) => footprint.length > 0 && footprint.every(isInsideBoundary))
  )
}

export function hasLandrushBuildPlacementDraftAncestry<Node extends LandrushBuildSyncGraphNode>(
  nodes: Readonly<Record<string, Node>>,
  id: string,
) {
  const visitedIds = new Set<string>()
  let currentId: string | null = id

  while (currentId && !visitedIds.has(currentId)) {
    visitedIds.add(currentId)
    const node: Node | undefined = nodes[currentId]
    if (!node) return false
    if (isLandrushBuildPlacementDraft(node)) return true
    currentId = node.parentId ?? null
  }

  return false
}

export function collectLandrushBuildSyncDescendantIds<Node extends LandrushBuildSyncGraphNode>(
  nodes: Readonly<Record<string, Node>>,
  rootIds: readonly string[],
  options: {
    includeNode?: (node: Node) => boolean
  } = {},
) {
  const childrenByParentId = new Map<string, string[]>()
  for (const node of Object.values(nodes)) {
    if (!node.parentId) continue
    const childIds = childrenByParentId.get(node.parentId) ?? []
    childIds.push(node.id)
    childrenByParentId.set(node.parentId, childIds)
  }

  const selectedIds = new Set<string>()
  const pendingIds = [...rootIds]
  while (pendingIds.length > 0) {
    const id = pendingIds.pop()
    if (!id || selectedIds.has(id)) continue

    const node = nodes[id]
    if (
      !node ||
      hasLandrushBuildPlacementDraftAncestry(nodes, id) ||
      (options.includeNode && !options.includeNode(node))
    ) {
      continue
    }

    selectedIds.add(id)
    const explicitChildIds = Array.isArray(node.children) ? node.children : []
    const childIds = new Set([...explicitChildIds, ...(childrenByParentId.get(id) ?? [])])
    pendingIds.push(...childIds)
  }

  return selectedIds
}

export function collectLandrushBuildSyncGraphNodeIds<Node extends LandrushBuildSyncGraphNode>(
  nodes: Readonly<Record<string, Node>>,
  rootIds: readonly string[],
  options: {
    includeNode?: (node: Node) => boolean
    stopParentIds?: ReadonlySet<string>
  } = {},
) {
  const selectedIds = collectLandrushBuildSyncDescendantIds(nodes, rootIds, options)
  const stopParentIds = options.stopParentIds ?? new Set<string>()

  for (const rootId of rootIds) {
    let parentId = nodes[rootId]?.parentId ?? null
    const visitedIds = new Set<string>()
    while (parentId && !visitedIds.has(parentId) && !stopParentIds.has(parentId)) {
      visitedIds.add(parentId)
      const parent = nodes[parentId]
      if (
        !parent ||
        hasLandrushBuildPlacementDraftAncestry(nodes, parentId) ||
        (options.includeNode && !options.includeNode(parent))
      ) {
        break
      }
      selectedIds.add(parentId)
      if (parent.type === 'building') break
      parentId = parent.parentId ?? null
    }
  }

  const selectedBuildingIds = new Set(
    [...selectedIds].filter((id) => nodes[id]?.type === 'building'),
  )
  for (const node of Object.values(nodes)) {
    if (node.type !== 'level' || !node.parentId || !selectedBuildingIds.has(node.parentId)) continue
    if (options.includeNode && !options.includeNode(node)) continue
    for (const id of collectLandrushBuildSyncDescendantIds(nodes, [node.id], options)) {
      selectedIds.add(id)
    }
  }

  return selectedIds
}

export function isLandrushBuildNodeInParcelMutationScope<Node extends LandrushBuildSyncGraphNode>(
  nodes: Readonly<Record<string, Node>>,
  nodeId: string,
  scope: {
    allowUntaggedSharedLevel?: boolean
    parcelId: string
    sharedLevelId: string
    worldId?: string
  },
) {
  const visitedIds = new Set<string>()
  let currentId: string | null = nodeId
  let matchedScope = false

  while (currentId && !visitedIds.has(currentId)) {
    visitedIds.add(currentId)
    if (currentId === scope.sharedLevelId) {
      return (
        matchedScope ||
        (currentId !== nodeId &&
          !Object.hasOwn(nodes, scope.sharedLevelId) &&
          scope.allowUntaggedSharedLevel !== false)
      )
    }
    const node: Node | undefined = nodes[currentId]
    if (!node) return matchedScope
    const metadataScope = readLandrushBuildScope(node.metadata)
    if (metadataScope.parcelId && metadataScope.parcelId !== scope.parcelId) return false
    if (scope.worldId && metadataScope.worldId && metadataScope.worldId !== scope.worldId) {
      return false
    }
    if (metadataScope.parcelId === scope.parcelId) matchedScope = true
    currentId = node.parentId ?? null
  }

  return matchedScope
}

export function isLandrushBuildNodeInValidatedLegacyScope<Node extends LandrushBuildSyncGraphNode>(
  nodes: Readonly<Record<string, Node>>,
  nodeId: string,
  scope: {
    allowedNodeIds: ReadonlySet<string>
    sharedLevelId: string
  },
) {
  if (nodeId === scope.sharedLevelId || !scope.allowedNodeIds.has(nodeId)) return false

  const visitedIds = new Set<string>()
  let currentId: string | null = nodeId
  while (currentId && !visitedIds.has(currentId)) {
    if (currentId === scope.sharedLevelId) return true
    if (!scope.allowedNodeIds.has(currentId)) return false
    visitedIds.add(currentId)

    const node: Node | undefined = nodes[currentId]
    if (!node) return false
    const metadataScope = readLandrushBuildScope(node.metadata)
    if (metadataScope.parcelId || metadataScope.worldId) return false
    currentId = node.parentId ?? null
  }

  return false
}

export function createLandrushBuildSyncSnapshotNodes<Node extends LandrushBuildSyncGraphNode>(
  nodes: readonly Node[],
  scope: {
    parcelId: string
    worldId: string
  },
) {
  const syncedIds = new Set(nodes.map((node) => node.id))

  return nodes.map((node) => {
    const clone = JSON.parse(JSON.stringify(node)) as Record<string, unknown> & {
      children?: unknown[]
      metadata?: unknown
    }
    if (Array.isArray(clone.children)) {
      clone.children = clone.children.filter(
        (id): id is string => typeof id === 'string' && syncedIds.has(id),
      )
    }
    const metadata =
      clone.metadata && typeof clone.metadata === 'object' && !Array.isArray(clone.metadata)
        ? clone.metadata
        : {}
    clone.metadata = {
      ...metadata,
      landrushBuildSynced: true,
      landrushParcelId: scope.parcelId,
      landrushWorldId: scope.worldId,
    }
    return clone as Node
  })
}

export function createLandrushBuildSyncTransportNodes<Node extends LandrushBuildSyncGraphNode>(
  nodes: readonly Node[],
  scope: {
    parcelId: string
    worldId: string
  },
) {
  const scopedNodes = createLandrushBuildSyncSnapshotNodes(nodes, scope)
  const syncedIds = new Set(scopedNodes.map((node) => node.id))

  return scopedNodes.map((node) => {
    if (typeof node.parentId !== 'string' || syncedIds.has(node.parentId)) return node
    return { ...node, parentId: null }
  })
}

function readLandrushBuildScope(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { parcelId: null, worldId: null }
  }
  const scope = metadata as { landrushParcelId?: unknown; landrushWorldId?: unknown }
  return {
    parcelId:
      typeof scope.landrushParcelId === 'string' && scope.landrushParcelId.length > 0
        ? scope.landrushParcelId
        : null,
    worldId:
      typeof scope.landrushWorldId === 'string' && scope.landrushWorldId.length > 0
        ? scope.landrushWorldId
        : null,
  }
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
