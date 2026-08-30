import { describe, expect, it } from 'bun:test'
import { PARCEL_BUILD_SCHEMA_VERSION, type ParcelBuildNode } from '@landrush/protocol'
import { ParcelBuildSyncQueue } from './parcel-build-sync-queue'

const wallA = { id: 'wall-a', type: 'wall' } satisfies ParcelBuildNode
const wallB = { id: 'wall-b', type: 'wall' } satisfies ParcelBuildNode
const wallC = { id: 'wall-c', type: 'wall' } satisfies ParcelBuildNode

function createQueue() {
  let nextId = 1
  const queue = new ParcelBuildSyncQueue(() => `operation-${nextId++}`)
  queue.resumeWorld('world-1')
  return queue
}

function prepare(queue: ParcelBuildSyncQueue, connectionId = 'connection-1', now = 0) {
  return queue.prepareSend({
    connectionId,
    now,
    parcelId: 'parcel-1',
    retryAfterMs: 5_000,
    worldId: 'world-1',
    writerEpoch: 3,
    writerSessionId: 'writer-1',
  })
}

function snapshot(operationId: string, revision: number, nodes = [wallA]) {
  return {
    nodes,
    operationId,
    parcelId: 'parcel-1',
    revision,
    schemaVersion: PARCEL_BUILD_SCHEMA_VERSION,
    updatedAt: 1,
    updatedBy: 'builder',
    worldId: 'world-1',
  } as const
}

describe('ParcelBuildSyncQueue', () => {
  it('preserves local work created while reconnect authority is suspended', () => {
    const queue = createQueue()
    queue.suspendWorld('world-1')
    queue.enqueue('world-1', 'parcel-1', [wallA], 0)
    expect(prepare(queue)).toBeNull()
    expect(queue.reconcileSnapshot('world-1', 'parcel-1', null).kind).toBe('suppressed')
    queue.resumeWorld('world-1')
    const operation = prepare(queue)
    expect(operation?.operationId).toBe('operation-1')
    expect(operation?.nodes).toEqual([wallA])
  })

  it('keeps one stable operation through a lost send, timeout, and reconnect retry', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 4)

    const first = prepare(queue)
    expect(first?.operationId).toBe('operation-1')
    expect(first?.baseRevision).toBe(4)
    expect(prepare(queue)?.operationId).toBe('operation-1')

    queue.markSent('world-1', 'parcel-1', 'operation-1', 'connection-1', 0)
    expect(prepare(queue, 'connection-1', 4_999)).toBeNull()
    expect(prepare(queue, 'connection-1', 5_000)?.operationId).toBe('operation-1')
    expect(prepare(queue, 'connection-2', 10)?.operationId).toBe('operation-1')
  })

  it('treats delayed matching ack as transport metadata and promotes only the latest pending state', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 0)
    const first = prepare(queue)
    queue.markSent('world-1', 'parcel-1', first!.operationId, 'connection-1', 0)
    queue.enqueue('world-1', 'parcel-1', [wallB], 0)
    queue.enqueue('world-1', 'parcel-1', [wallC], 0)

    const acknowledged = queue.acknowledge('world-1', 'parcel-1', first!.operationId, 1)
    expect(acknowledged?.nodes).toEqual([wallA])
    const second = prepare(queue, 'connection-1', 1)
    expect(second?.baseRevision).toBe(1)
    expect(second?.operationId).toBe('operation-2')
    expect(second?.nodes).toEqual([wallC])
    expect(queue.inspect('world-1', 'parcel-1')?.pendingNodes).toBeNull()
  })

  it('exposes the reservation legs without changing queue state', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 0)
    expect(queue.inspectReservation('world-1', 'parcel-1')).toEqual({
      authoritativeRevision: 0,
      inFlightNodes: null,
      pendingNodes: [wallA],
    })
    prepare(queue)
    expect(queue.inspectReservation('world-1', 'parcel-1')).toEqual({
      authoritativeRevision: 0,
      inFlightNodes: [wallA],
      pendingNodes: null,
    })
  })

  it('does not settle a matching operation on an invalid revision acknowledgement', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 4)
    const operation = prepare(queue)!
    expect(queue.acknowledge('world-1', 'parcel-1', operation.operationId, 4)).toBeNull()
    expect(queue.inspect('world-1', 'parcel-1')?.inFlight?.operationId).toBe(operation.operationId)
  })

  it('settles a lost ack from a reconnect snapshot without emitting content', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 0)
    const operation = prepare(queue)!
    const result = queue.reconcileSnapshot(
      'world-1',
      'parcel-1',
      snapshot(operation.operationId, 1),
    )
    expect(result.kind).toBe('acknowledged')
    expect(queue.hasLocalDesiredState('world-1', 'parcel-1')).toBe(false)
  })

  it('suppresses an unchanged reconnect baseline and resends the same operation', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallB], 7)
    const operation = prepare(queue)!
    queue.markSent('world-1', 'parcel-1', operation.operationId, 'connection-1', 0)

    const result = queue.reconcileSnapshot('world-1', 'parcel-1', snapshot('older-op', 7))
    expect(result.kind).toBe('suppressed')
    const retry = prepare(queue, 'connection-2', 1)
    expect(retry?.operationId).toBe(operation.operationId)
    expect(retry?.baseRevision).toBe(7)
  })

  it('accepts an initial schema1 snapshot and suppresses its duplicate during migration', () => {
    const queue = createQueue()
    const legacyNodes = Array.from({ length: 11 }, (_, index) => ({
      id: `legacy-${index}`,
      type: index === 0 ? 'Building' : 'wall',
    })) satisfies ParcelBuildNode[]
    const migrationNodes = [
      ...legacyNodes,
      { id: 'parcel-building', type: 'Building' },
      { id: 'parcel-ground', type: 'Level' },
      { id: 'parcel-site', type: 'Site' },
    ] satisfies ParcelBuildNode[]
    const legacySnapshot = {
      ...snapshot('legacy-operation', 283, legacyNodes),
      schemaVersion: 1,
    } as const

    expect(queue.reconcileSnapshot('world-1', 'parcel-1', legacySnapshot)).toEqual({
      kind: 'content',
    })
    expect(queue.enqueue('world-1', 'parcel-1', migrationNodes, 283)).toBeNull()

    const migration = prepare(queue)
    expect(migration?.baseRevision).toBe(283)
    expect(migration?.nodes).toEqual(migrationNodes)
    expect(queue.reconcileSnapshot('world-1', 'parcel-1', legacySnapshot)).toEqual({
      kind: 'suppressed',
    })
    expect(queue.inspect('world-1', 'parcel-1')?.conflict).toBeNull()
  })

  it('never sends a pre-snapshot scaffold over an existing schema2 authority', () => {
    const queue = createQueue()
    const authoritativeNodes = Array.from({ length: 15 }, (_, index) => ({
      id: `authoritative-${index}`,
      type: index === 0 ? 'Building' : 'wall',
    })) satisfies ParcelBuildNode[]
    const scaffoldNodes = [
      { id: 'parcel-building', type: 'Building' },
      { id: 'parcel-ground', type: 'Level' },
    ] satisfies ParcelBuildNode[]

    queue.suspendWorld('world-1')
    queue.enqueue('world-1', 'parcel-1', scaffoldNodes, 0)
    expect(prepare(queue)).toBeNull()

    const result = queue.reconcileSnapshot(
      'world-1',
      'parcel-1',
      snapshot('authoritative-operation', 285, authoritativeNodes),
    )
    expect(result.kind).toBe('conflict')
    if (result.kind !== 'conflict') throw new Error('Expected conflict')
    expect(result.conflict.authoritativeBuild?.nodes).toEqual(authoritativeNodes)
    expect(result.conflict.localDesiredNodes).toEqual(scaffoldNodes)

    queue.resumeWorld('world-1')
    expect(prepare(queue)).toBeNull()
  })

  it('pauses on unexpected authority, preserves rejected work, and never blindly retries it', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 1)
    const operation = prepare(queue)!
    queue.enqueue('world-1', 'parcel-1', [wallC], 1)

    const result = queue.reconcileSnapshot('world-1', 'parcel-1', snapshot('remote-op', 2, [wallB]))
    expect(result.kind).toBe('conflict')
    if (result.kind !== 'conflict') throw new Error('Expected conflict')
    expect(result.conflict.localDesiredNodes).toEqual([wallC])
    expect(result.conflict.rejectedOperationId).toBe(operation.operationId)
    expect(prepare(queue, 'connection-2', 1)).toBeNull()
    expect(queue.inspect('world-1', 'parcel-1')?.conflict?.localDesiredNodes).toEqual([wallC])

    for (let index = 0; index < 100; index += 1) {
      queue.enqueue('world-1', 'parcel-1', [wallC, { id: `wall-${index}`, type: 'wall' }], 2)
      expect(prepare(queue, 'connection-2', index + 2)).toBeNull()
    }
    expect(queue.inspect('world-1', 'parcel-1')?.conflict?.localDesiredNodes).toEqual([
      wallC,
      { id: 'wall-99', type: 'wall' },
    ])

    queue.resolveConflict('world-1', 'parcel-1', [wallB, wallC], 2)
    const resumed = prepare(queue, 'connection-2', 2)
    expect(resumed?.baseRevision).toBe(2)
    expect(resumed?.nodes).toEqual([wallB, wallC])
  })

  it('pauses a permanently rejected operation without retrying it', () => {
    const queue = createQueue()
    queue.enqueue('world-1', 'parcel-1', [wallA], 2)
    const operation = prepare(queue)!
    const rejected = queue.reject(
      'world-1',
      'parcel-1',
      operation.operationId,
      snapshot('authoritative-op', 2, [wallB]),
    )
    expect(rejected?.localDesiredNodes).toEqual([wallA])
    expect(prepare(queue, 'connection-2', 10_000)).toBeNull()
  })
})
