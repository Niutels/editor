import { describe, expect, test } from 'bun:test'
import {
  createLandrushZombieEscapeCollisionWorldCompilation,
  createLandrushZombieEscapeCollisionWorldsResolver,
  type LandrushZombieEscapeCollisionWorldInput,
} from '@landrush/pascal-host/zombie-game-navigation'
import {
  createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
} from '@landrush/zombie-gameplay/landrush-zombie-escape-collision-world-compiler'
import {
  createZombieEscapeCollisionHit,
  sweepZombieEscapeCircleAgainstWorld,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import { type AnyNode, LevelNode, ShelfNode } from '@pascal-app/core'
import {
  collectLandrushZombieEscapeCollisionWorldTransferables,
  createLandrushZombieEscapeCollisionWorldWorkerError,
  createLandrushZombieEscapeCollisionWorldWorkerRequestResolver,
  normalizeLandrushZombieEscapeCollisionWorldWorkerError,
  resolveLandrushZombieEscapeCollisionWorldWorkerRequest,
} from './landrush-zombie-escape-collision-world-worker-transport'

describe('Zombie Escape collision-world worker transport', () => {
  test('uses the authoritative compiler and preserves deterministic atomic world parity', () => {
    const input = createInput()
    const request = createRequest(input, 41)
    const expected = createLandrushZombieEscapeCollisionWorldsResolver()(input)
    const response = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      request,
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
    )

    expect(response.ok).toBe(true)
    if (!response.ok) throw createLandrushZombieEscapeCollisionWorldWorkerError(response.error)
    expect(response).toMatchObject({ ok: true, requestId: 41, signature: request.signature })
    expect(response.worlds.navigation.semanticKey).toBe(expected.navigation.semanticKey)
    expect(response.worlds.navigation.revision).toBe(expected.navigation.revision)
    expect(response.worlds.navigation.navigationGraph.nodeIds).toEqual(
      expected.navigation.navigationGraph.nodeIds,
    )
    expect(response.worlds.combat.semanticKey).toBe(expected.combat.semanticKey)
    expect(response.worlds.combat.revision).toBe(expected.combat.revision)
    expect(response.worlds.navigation.objectCatalog.objectSemanticKinds).toEqual(
      expected.navigation.objectCatalog.objectSemanticKinds,
    )
    expect(response.worlds.combat.objectCatalog.objectSemanticKinds).toEqual(
      expected.combat.objectCatalog.objectSemanticKinds,
    )
  })

  test('transfers each unique typed-array buffer once and leaves the received worlds queryable', () => {
    const input = createInput()
    const response = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      createRequest(input, 1),
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
    )
    if (!response.ok) throw createLandrushZombieEscapeCollisionWorldWorkerError(response.error)

    const transfer = collectLandrushZombieEscapeCollisionWorldTransferables(response.worlds)
    expect(transfer.length).toBeGreaterThan(0)
    expect(new Set(transfer).size).toBe(transfer.length)
    expect(transfer).toContain(response.worlds.combat.objectCatalog.objectSemanticKinds.buffer)
    expect(transfer).toContain(response.worlds.navigation.objectCatalog.objectSemanticKinds.buffer)
    expect(response.worlds.combat.broadphase.visitStamps.buffer).not.toBe(
      response.worlds.navigation.broadphase.visitStamps.buffer,
    )

    const received = structuredClone(response, { transfer })
    expect(response.worlds.combat.broadphase.visitStamps.byteLength).toBe(0)
    expect(received.worlds.combat.breakableObjectIds).toBeInstanceOf(Set)
    expect(received.worlds.navigation.navigationGraph.buckets).toBeInstanceOf(Map)
    expect(received.worlds.combat.broadphase.visitStamps).toBeInstanceOf(Uint32Array)
    expect(received.worlds.combat.objectCatalog.objectSemanticKinds).toBeInstanceOf(Uint8Array)
    expect([...received.worlds.combat.objectCatalog.objectSemanticKinds].sort()).toEqual(
      [
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
        ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
      ].sort(),
    )

    const hit = createZombieEscapeCollisionHit()
    const collided = sweepZombieEscapeCircleAgainstWorld(
      received.worlds.combat,
      0,
      0,
      4,
      0,
      0.1,
      hit,
    )
    expect(collided).toBe(hit)
    expect(hit.colliderKind).toBe('circle')
    expect(received.worlds.combat.broadphase.visitStamps.some((stamp) => stamp > 0)).toBe(true)
  })

  test('rejects payload or signature drift and normalizes thrown values', () => {
    const input = createInput()
    const request = createRequest(input, 2)
    expect(() =>
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload({
        ...request.payload,
        objectSemantics: undefined as never,
      }),
    ).toThrow('objectSemantics')
    const drifted = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      { ...request, signature: 'stale' },
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
    )
    expect(drifted).toMatchObject({
      error: { name: 'DataError' },
      ok: false,
      requestId: 2,
      signature: 'stale',
    })

    const changedPayload = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      {
        ...request,
        payload: { ...request.payload, playRadius: request.payload.playRadius + 1 },
      },
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
    )
    expect(changedPayload).toMatchObject({
      error: { name: 'DataError' },
      ok: false,
      requestId: 2,
      signature: request.signature,
    })

    const changedSemantics = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      {
        ...request,
        payload: {
          ...request.payload,
          objectSemantics: request.payload.objectSemantics.map((semantic) => ({
            ...semantic,
            semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
          })),
        },
      },
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
    )
    expect(changedSemantics).toMatchObject({
      error: { name: 'DataError' },
      ok: false,
      requestId: 2,
      signature: request.signature,
    })

    const missingSemanticsPayload = {
      ...request.payload,
      objectSemantics: undefined as never,
    }
    const missingSemantics = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      {
        ...request,
        payload: missingSemanticsPayload,
        payloadIntegrity: createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
          missingSemanticsPayload,
          request.signature,
        ),
      },
      createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
    )
    expect(missingSemantics).toMatchObject({
      error: { message: expect.stringContaining('objectSemantics'), name: 'DataError' },
      ok: false,
      requestId: 2,
      signature: request.signature,
    })

    const failure = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
      createRequest(input, 3),
      () => {
        throw { message: 'compiler failed', name: 'CompileError' }
      },
    )
    expect(failure).toMatchObject({
      error: { message: 'compiler failed', name: 'CompileError' },
      ok: false,
      requestId: 3,
    })
    const normalized = normalizeLandrushZombieEscapeCollisionWorldWorkerError({
      error: new TypeError('nested failure'),
    })
    expect(normalized).toMatchObject({ message: 'nested failure', name: 'TypeError' })
  })

  test('never reuses a detached cached bundle for a repeated signature', () => {
    const input = createInput()
    const resolveRequest = createLandrushZombieEscapeCollisionWorldWorkerRequestResolver()
    const request = createRequest(input, 1)

    const first = resolveRequest(request)
    if (!first.ok) throw createLandrushZombieEscapeCollisionWorldWorkerError(first.error)
    structuredClone(first, {
      transfer: collectLandrushZombieEscapeCollisionWorldTransferables(first.worlds),
    })
    expect(first.worlds.combat.broadphase.visitStamps.byteLength).toBe(0)

    const second = resolveRequest({ ...request, requestId: 2 })
    if (!second.ok) throw createLandrushZombieEscapeCollisionWorldWorkerError(second.error)
    expect(second.worlds.combat.broadphase.visitStamps.byteLength).toBeGreaterThan(0)
    const received = structuredClone(second, {
      transfer: collectLandrushZombieEscapeCollisionWorldTransferables(second.worlds),
    })
    const hit = createZombieEscapeCollisionHit()
    expect(sweepZombieEscapeCircleAgainstWorld(received.worlds.combat, 0, 0, 4, 0, 0.1, hit)).toBe(
      hit,
    )
    expect(hit.colliderKind).toBe('circle')
  })
})

function createInput(): LandrushZombieEscapeCollisionWorldInput {
  const level = LevelNode.parse({ level: 0 })
  const shelf = ShelfNode.parse({ parentId: level.id, position: [0, 0, 4] })
  return {
    agentRadius: 0.34,
    circles: [
      {
        id: 'palm:test',
        maximumY: 4,
        minimumY: 0,
        radius: 0.5,
        x: 2,
        z: 0,
      },
    ],
    nodes: indexNodes([level, shelf]),
    playRadius: 8,
    spawn: { x: 0, z: 0 },
    surfaceSupport: {
      boundary: true,
      elevation: 0,
      id: 'surface:test',
      polygon: [
        { x: -6, z: -6 },
        { x: 6, z: -6 },
        { x: 6, z: 6 },
        { x: -6, z: 6 },
      ],
    },
  }
}

function indexNodes(nodes: readonly AnyNode[]) {
  return Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<string, AnyNode>
}

function createRequest(input: LandrushZombieEscapeCollisionWorldInput, requestId: number) {
  return {
    ...createLandrushZombieEscapeCollisionWorldCompilation(input),
    requestId,
    type: 'compile' as const,
  }
}
