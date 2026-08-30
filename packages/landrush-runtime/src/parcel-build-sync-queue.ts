import {
  isParcelWriterEpoch,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_SCHEMA_VERSION,
  type ParcelBuildNode,
  type ParcelBuildSnapshot,
  type SyncParcelBuildNodesMessage,
} from '@landrush/protocol'

export type ParcelBuildSyncConflict = {
  authoritativeBuild: ParcelBuildSnapshot<ParcelBuildNode> | null
  localDesiredNodes: ParcelBuildNode[]
  rejectedOperationId: string | null
}

export type ParcelBuildSnapshotReconciliation =
  | { kind: 'acknowledged'; nodes: ParcelBuildNode[]; operationId: string; revision: number }
  | { kind: 'conflict'; conflict: ParcelBuildSyncConflict }
  | { kind: 'content' }
  | { kind: 'suppressed' }

type InFlightParcelBuild = {
  baseRevision: number
  lastSentAt: number | null
  lastSentConnectionId: string | null
  nodes: ParcelBuildNode[]
  operationId: string
}

type ParcelBuildSyncQueueEntry = {
  authoritativeRevision: number
  conflict: ParcelBuildSyncConflict | null
  inFlight: InFlightParcelBuild | null
  parcelId: string
  pendingNodes: ParcelBuildNode[] | null
  worldId: string
}

export class ParcelBuildSyncQueue {
  readonly #createOperationId: () => string
  readonly #entries = new Map<string, ParcelBuildSyncQueueEntry>()
  readonly #readyWorlds = new Set<string>()

  constructor(createOperationId: () => string) {
    this.#createOperationId = createOperationId
  }

  clear() {
    this.#entries.clear()
    this.#readyWorlds.clear()
  }

  clearWorld(worldId: string) {
    for (const [key, entry] of this.#entries) {
      if (entry.worldId === worldId) this.#entries.delete(key)
    }
    this.#readyWorlds.delete(worldId)
  }

  suspendWorld(worldId: string) {
    this.#readyWorlds.delete(worldId)
  }

  resumeWorld(worldId: string) {
    this.#readyWorlds.add(worldId)
  }

  isWorldReady(worldId: string) {
    return this.#readyWorlds.has(worldId)
  }

  enqueue(
    worldId: string,
    parcelId: string,
    nodes: readonly ParcelBuildNode[],
    authoritativeRevision: number,
  ) {
    const entry = this.#entry(worldId, parcelId, authoritativeRevision)
    if (entry.conflict) {
      entry.conflict.localDesiredNodes = cloneNodes(nodes)
      return cloneConflict(entry.conflict)
    }
    entry.pendingNodes = cloneNodes(nodes)
    return null
  }

  resolveConflict(
    worldId: string,
    parcelId: string,
    nodes: readonly ParcelBuildNode[],
    authoritativeRevision: number,
  ) {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    if (!entry?.conflict) return false
    entry.authoritativeRevision = normalizeParcelBuildRevision(authoritativeRevision)
    entry.conflict = null
    entry.pendingNodes = cloneNodes(nodes)
    return true
  }

  prepareSend({
    connectionId,
    now,
    parcelId,
    retryAfterMs,
    worldId,
    writerEpoch,
    writerSessionId,
  }: {
    connectionId: string
    now: number
    parcelId: string
    retryAfterMs: number
    worldId: string
    writerEpoch: number
    writerSessionId: string
  }): SyncParcelBuildNodesMessage<ParcelBuildNode> | null {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    if (!this.#readyWorlds.has(worldId) || !entry || entry.conflict) return null

    if (!entry.inFlight) {
      if (!entry.pendingNodes) return null
      entry.inFlight = {
        baseRevision: entry.authoritativeRevision,
        lastSentAt: null,
        lastSentConnectionId: null,
        nodes: entry.pendingNodes,
        operationId: this.#createOperationId(),
      }
      entry.pendingNodes = null
    }

    const inFlight = entry.inFlight
    if (
      inFlight.lastSentConnectionId === connectionId &&
      inFlight.lastSentAt !== null &&
      now - inFlight.lastSentAt < retryAfterMs
    ) {
      return null
    }
    if (!writerSessionId || !isParcelWriterEpoch(writerEpoch)) return null

    return {
      baseRevision: inFlight.baseRevision,
      nodes: cloneNodes(inFlight.nodes),
      operationId: inFlight.operationId,
      parcelId,
      schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
      type: 'sync-parcel-build-nodes',
      worldId,
      writerEpoch,
      writerSessionId,
    }
  }

  markSent(
    worldId: string,
    parcelId: string,
    operationId: string,
    connectionId: string,
    now: number,
  ) {
    const inFlight = this.#entries.get(syncKey(worldId, parcelId))?.inFlight
    if (!inFlight || inFlight.operationId !== operationId) return false
    inFlight.lastSentAt = now
    inFlight.lastSentConnectionId = connectionId
    return true
  }

  acknowledge(worldId: string, parcelId: string, operationId: string, revision: number) {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    const inFlight = entry?.inFlight
    if (!entry || !inFlight || inFlight.operationId !== operationId) return null
    const normalizedRevision = normalizeParcelBuildRevision(revision, -1)
    if (normalizedRevision !== inFlight.baseRevision + 1) return null
    entry.authoritativeRevision = normalizedRevision
    entry.inFlight = null
    return {
      nodes: cloneNodes(inFlight.nodes),
      operationId,
      revision: entry.authoritativeRevision,
    }
  }

  reconcileSnapshot(
    worldId: string,
    parcelId: string,
    build: ParcelBuildSnapshot<ParcelBuildNode> | null,
  ): ParcelBuildSnapshotReconciliation {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    const revision = build?.revision ?? 0
    if (!entry) return { kind: 'content' }

    if (entry.conflict) {
      entry.authoritativeRevision = revision
      return { kind: 'suppressed' }
    }

    if (entry.inFlight) {
      if (build?.operationId === entry.inFlight.operationId) {
        const acknowledged = this.acknowledge(
          worldId,
          parcelId,
          entry.inFlight.operationId,
          revision,
        )
        if (!acknowledged) return { kind: 'suppressed' }
        return { kind: 'acknowledged', ...acknowledged }
      }
      if (revision === entry.inFlight.baseRevision) {
        entry.authoritativeRevision = revision
        return { kind: 'suppressed' }
      }
      return this.#pauseForConflict(entry, build)
    }

    if (entry.pendingNodes) {
      if (revision === entry.authoritativeRevision) return { kind: 'suppressed' }
      return this.#pauseForConflict(entry, build)
    }

    entry.authoritativeRevision = revision
    return { kind: 'content' }
  }

  reconcileRemoteBuild(
    build: ParcelBuildSnapshot<ParcelBuildNode>,
  ): ParcelBuildSnapshotReconciliation {
    return this.reconcileSnapshot(build.worldId, build.parcelId, build)
  }

  reject(
    worldId: string,
    parcelId: string,
    operationId: string,
    build: ParcelBuildSnapshot<ParcelBuildNode> | null,
  ): ParcelBuildSyncConflict | null {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    if (!entry?.inFlight || entry.inFlight.operationId !== operationId) return null
    const result = this.#pauseForConflict(entry, build)
    return result.kind === 'conflict' ? result.conflict : null
  }

  hasLocalDesiredState(worldId: string, parcelId: string) {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    return Boolean(entry?.inFlight || entry?.pendingNodes || entry?.conflict)
  }

  parcelIds(worldId: string) {
    return [...this.#entries.values()]
      .filter((entry) => entry.worldId === worldId)
      .map((entry) => entry.parcelId)
  }

  inspect(worldId: string, parcelId: string) {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    if (!entry) return null
    return {
      authoritativeRevision: entry.authoritativeRevision,
      conflict: entry.conflict ? cloneConflict(entry.conflict) : null,
      inFlight: entry.inFlight
        ? {
            ...entry.inFlight,
            nodes: cloneNodes(entry.inFlight.nodes),
          }
        : null,
      pendingNodes: entry.pendingNodes ? cloneNodes(entry.pendingNodes) : null,
    }
  }

  inspectReservation(
    worldId: string,
    parcelId: string,
  ): Readonly<{
    authoritativeRevision: number
    inFlightNodes: readonly Readonly<ParcelBuildNode>[] | null
    pendingNodes: readonly Readonly<ParcelBuildNode>[] | null
  }> | null {
    const entry = this.#entries.get(syncKey(worldId, parcelId))
    if (!entry) return null
    return {
      authoritativeRevision: entry.authoritativeRevision,
      inFlightNodes: entry.inFlight?.nodes ?? null,
      pendingNodes: entry.pendingNodes,
    }
  }

  #entry(worldId: string, parcelId: string, authoritativeRevision: number) {
    const key = syncKey(worldId, parcelId)
    let entry = this.#entries.get(key)
    if (!entry) {
      entry = {
        authoritativeRevision: normalizeParcelBuildRevision(authoritativeRevision),
        conflict: null,
        inFlight: null,
        parcelId,
        pendingNodes: null,
        worldId,
      }
      this.#entries.set(key, entry)
    } else if (!entry.inFlight && !entry.pendingNodes && !entry.conflict) {
      entry.authoritativeRevision = normalizeParcelBuildRevision(authoritativeRevision)
    }
    return entry
  }

  #pauseForConflict(
    entry: ParcelBuildSyncQueueEntry,
    build: ParcelBuildSnapshot<ParcelBuildNode> | null,
  ): Extract<ParcelBuildSnapshotReconciliation, { kind: 'conflict' }> {
    const localDesiredNodes = cloneNodes(entry.pendingNodes ?? entry.inFlight?.nodes ?? [])
    const conflict = {
      authoritativeBuild: build ? structuredClone(build) : null,
      localDesiredNodes,
      rejectedOperationId: entry.inFlight?.operationId ?? null,
    } satisfies ParcelBuildSyncConflict
    entry.authoritativeRevision = build?.revision ?? 0
    entry.conflict = conflict
    entry.inFlight = null
    entry.pendingNodes = null
    return { conflict, kind: 'conflict' }
  }
}

function cloneNodes(nodes: readonly ParcelBuildNode[]) {
  return nodes.map((node) => structuredClone(node))
}

function cloneConflict(conflict: ParcelBuildSyncConflict): ParcelBuildSyncConflict {
  return {
    ...conflict,
    authoritativeBuild: conflict.authoritativeBuild
      ? structuredClone(conflict.authoritativeBuild)
      : null,
    localDesiredNodes: cloneNodes(conflict.localDesiredNodes),
  }
}

function syncKey(worldId: string, parcelId: string) {
  return `${worldId}:${parcelId}`
}
