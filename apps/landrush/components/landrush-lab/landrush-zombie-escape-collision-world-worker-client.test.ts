import { describe, expect, test } from 'bun:test'
import {
  createLandrushZombieEscapeCollisionWorldSignature,
  createLandrushZombieEscapeCollisionWorldsResolver,
  type LandrushZombieEscapeCollisionWorldInput,
  type LandrushZombieEscapeCollisionWorlds,
} from './landrush-island-ai-navigation-semantics'
import {
  createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler,
  type LandrushZombieEscapeCollisionWorldWorkerLike,
} from './landrush-zombie-escape-collision-world-worker-client'
import type {
  LandrushZombieEscapeCollisionWorldWorkerRequest,
  LandrushZombieEscapeCollisionWorldWorkerResponse,
  LandrushZombieEscapeCollisionWorldWorkerStatus,
} from './landrush-zombie-escape-collision-world-worker-transport'

describe('Zombie Escape collision-world worker client', () => {
  test('cancels stale in-flight work and dispatches the latest semantic request immediately', async () => {
    const workers = [
      new FakeCollisionWorldWorker(),
      new FakeCollisionWorldWorker(),
      new FakeCollisionWorldWorker(),
    ]
    let workerIndex = 0
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => workers[workerIndex++]!,
    })
    const firstInput = createInput(0.4)
    const secondInput = createInput(0.5)
    const latestInput = createInput(0.6)

    const first = compiler.compile(firstInput)
    const firstResult = first.then(
      () => null,
      (error: unknown) => error,
    )
    workers[0]!.emitReady()
    const superseded = compiler.compile(secondInput)
    const supersededResult = superseded.then(
      () => null,
      (error: unknown) => error,
    )
    workers[1]!.emitReady()
    const latest = compiler.compile(latestInput)
    workers[2]!.emitReady()
    expect(workers[0]!.requests[0]?.signature).toBe(
      createLandrushZombieEscapeCollisionWorldSignature(firstInput),
    )
    expect(workers[0]!.terminated).toBe(true)
    expect(workers[1]!.requests[0]?.signature).toBe(
      createLandrushZombieEscapeCollisionWorldSignature(secondInput),
    )
    expect(workers[1]!.terminated).toBe(true)
    expect(workers[2]!.requests[0]?.signature).toBe(
      createLandrushZombieEscapeCollisionWorldSignature(latestInput),
    )
    expect(await firstResult).toMatchObject({ name: 'AbortError' })
    expect(await supersededResult).toMatchObject({ name: 'AbortError' })

    const latestWorlds = createWorlds(latestInput)
    workers[2]!.succeedActive(latestWorlds)
    await expect(latest).resolves.toMatchObject({ combat: { navigationMode: 'dense' } })
    compiler.dispose()
    expect(workers[2]!.terminated).toBe(true)
  })

  test('shares identical in-flight semantics and keeps the worker alive after compiler failure', async () => {
    const worker = new FakeCollisionWorldWorker()
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => worker,
    })
    const firstInput = createInput(0.4)
    const first = compiler.compile(firstInput)
    const identical = compiler.compile(firstInput)
    worker.emitReady()
    expect(identical).toBe(first)
    expect(worker.requests).toHaveLength(1)
    worker.failActive({ message: 'compile failed', name: 'CompileError' })
    await expect(first).rejects.toMatchObject({ message: 'compile failed', name: 'CompileError' })
    await expect(identical).rejects.toMatchObject({
      message: 'compile failed',
      name: 'CompileError',
    })
    expect(worker.terminated).toBe(false)

    const secondInput = createInput(0.5)
    const second = compiler.compile(secondInput)
    expect(worker.requests).toHaveLength(2)

    worker.succeedActive(createWorlds(secondInput))
    await expect(second).resolves.toBeDefined()
    compiler.dispose()
  })

  test('surfaces constructor and postMessage failures without a synchronous fallback', async () => {
    let constructorAttempts = 0
    const constructorFailure = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => {
        constructorAttempts += 1
        throw new Error('worker unavailable')
      },
    })

    await expect(constructorFailure.compile(createInput(0.4))).rejects.toThrow('worker unavailable')
    await expect(constructorFailure.compile(createInput(0.4))).rejects.toThrow('worker unavailable')
    expect(constructorAttempts).toBe(2)
    constructorFailure.dispose()

    const worker = new FakeCollisionWorldWorker()
    worker.postMessageError = new DOMException('could not clone', 'DataCloneError')
    const postFailure = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => worker,
    })
    const failedPost = postFailure.compile(createInput(0.5))
    worker.emitReady()
    await expect(failedPost).rejects.toMatchObject({
      message: 'could not clone',
      name: 'DataCloneError',
    })
    expect(worker.terminated).toBe(true)
    postFailure.dispose()
  })

  test('terminates active worker CPU immediately when its generation signal aborts', async () => {
    const workers = [new FakeCollisionWorldWorker(), new FakeCollisionWorldWorker()]
    let workerIndex = 0
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => workers[workerIndex++]!,
    })
    const controller = new AbortController()
    const active = compiler.compile(createInput(0.4), controller.signal)
    workers[0]!.emitReady()
    expect(workers[0]!.requests).toHaveLength(1)

    controller.abort()
    expect(workers[0]!.terminated).toBe(true)
    await expect(active).rejects.toMatchObject({ name: 'AbortError' })

    const nextInput = createInput(0.5)
    const next = compiler.compile(nextInput, new AbortController().signal)
    workers[1]!.emitReady()
    expect(workers[1]!.requests).toHaveLength(1)
    workers[1]!.succeedActive(createWorlds(nextInput))
    await expect(next).resolves.toBeDefined()
    compiler.dispose()
  })

  test('treats error, messageerror, and mismatched responses as fatal transport failures', async () => {
    const workers = [
      new FakeCollisionWorldWorker(),
      new FakeCollisionWorldWorker(),
      new FakeCollisionWorldWorker(),
    ]
    let workerIndex = 0
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => workers[workerIndex++]!,
    })

    const deserializeFailure = compiler.compile(createInput(0.4))
    workers[0]!.emitReady()
    workers[0]!.emitMessageError()
    await expect(deserializeFailure).rejects.toThrow('could not be deserialized')
    expect(workers[0]!.terminated).toBe(true)

    const runtimeFailure = compiler.compile(createInput(0.5))
    workers[1]!.emitReady()
    workers[1]!.emitError(new Error('worker crashed'))
    await expect(runtimeFailure).rejects.toThrow('worker crashed')
    expect(workers[1]!.terminated).toBe(true)

    const mismatchedInput = createInput(0.6)
    const mismatched = compiler.compile(mismatchedInput)
    workers[2]!.emitReady()
    const request = workers[2]!.requests[0]!
    workers[2]!.acceptActive()
    workers[2]!.emitResponse({
      ok: true,
      requestId: request.requestId + 1,
      signature: request.signature,
      worlds: createWorlds(mismatchedInput),
    })
    await expect(mismatched).rejects.toThrow('stale or mismatched')
    expect(workers[2]!.terminated).toBe(true)
    compiler.dispose()
  })

  test('dispose terminates the worker and rejects shared active requests', async () => {
    const worker = new FakeCollisionWorldWorker()
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => worker,
    })
    const input = createInput(0.4)
    const active = compiler.compile(input)
    const shared = compiler.compile(input)
    worker.emitReady()

    compiler.dispose()
    await expect(active).rejects.toMatchObject({ name: 'AbortError' })
    await expect(shared).rejects.toMatchObject({ name: 'AbortError' })
    await expect(compiler.compile(createInput(0.6))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(worker.terminated).toBe(true)
  })

  test('waits for worker readiness and sends only the compact deterministic payload once', async () => {
    const worker = new FakeCollisionWorldWorker()
    const prepared = []
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      onPreparedCompilation: (compilation) => prepared.push(structuredClone(compilation)),
      workerFactory: () => worker,
    })
    const input = createInput(0.4)
    const pending = compiler.compile(input)

    expect(worker.requests).toEqual([])
    worker.emitReady()
    expect(worker.requests).toHaveLength(1)
    expect('input' in worker.requests[0]!).toBe(false)
    expect(worker.requests[0]!.payload).toMatchObject({ agentRadius: 0.4, playRadius: 8 })
    expect(worker.requests[0]!.payload.objectSemantics).toEqual([])
    expect(prepared).toEqual([
      {
        payload: worker.requests[0]!.payload,
        payloadIntegrity: worker.requests[0]!.payloadIntegrity,
        signature: worker.requests[0]!.signature,
      },
    ])

    worker.succeedActive(createWorlds(input))
    await expect(pending).resolves.toBeDefined()
    compiler.dispose()
  })

  test('rejects duplicate readiness and mismatched acceptance as transport failures', async () => {
    const workers = [new FakeCollisionWorldWorker(), new FakeCollisionWorldWorker()]
    let workerIndex = 0
    const compiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      workerFactory: () => workers[workerIndex++]!,
    })

    const duplicateReady = compiler.compile(createInput(0.4))
    workers[0]!.emitReady()
    workers[0]!.emitReady()
    await expect(duplicateReady).rejects.toThrow('reported ready more than once')
    expect(workers[0]!.terminated).toBe(true)

    const mismatchedAcceptance = compiler.compile(createInput(0.5))
    workers[1]!.emitReady()
    const request = workers[1]!.requests[0]!
    workers[1]!.emitStatus({
      requestId: request.requestId + 1,
      signature: request.signature,
      type: 'accepted',
    })
    await expect(mismatchedAcceptance).rejects.toThrow('accepted a stale or mismatched request')
    expect(workers[1]!.terminated).toBe(true)
    compiler.dispose()
  })
})

class FakeCollisionWorldWorker implements LandrushZombieEscapeCollisionWorldWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null
  postMessageError: unknown = null
  readonly requests: LandrushZombieEscapeCollisionWorldWorkerRequest[] = []
  terminated = false

  postMessage(request: LandrushZombieEscapeCollisionWorldWorkerRequest) {
    if (this.postMessageError) throw this.postMessageError
    this.requests.push(structuredClone(request))
  }

  terminate() {
    this.terminated = true
  }

  emitError(error: Error) {
    this.onerror?.({
      error,
      message: error.message,
      preventDefault: () => undefined,
    } as ErrorEvent)
  }

  emitMessageError() {
    this.onmessageerror?.({ data: null } as MessageEvent<unknown>)
  }

  emitResponse(response: LandrushZombieEscapeCollisionWorldWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<unknown>)
  }

  emitStatus(status: LandrushZombieEscapeCollisionWorldWorkerStatus) {
    this.onmessage?.({ data: status } as MessageEvent<unknown>)
  }

  emitReady() {
    this.emitStatus({ type: 'ready' })
  }

  acceptActive() {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No active worker request.')
    this.emitStatus({
      requestId: request.requestId,
      signature: request.signature,
      type: 'accepted',
    })
  }

  failActive(error: Readonly<{ message: string; name: string }>) {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No active worker request.')
    this.acceptActive()
    this.emitResponse({
      error,
      ok: false,
      requestId: request.requestId,
      signature: request.signature,
    })
  }

  succeedActive(worlds: LandrushZombieEscapeCollisionWorlds) {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No active worker request.')
    this.acceptActive()
    this.emitResponse({
      ok: true,
      requestId: request.requestId,
      signature: request.signature,
      worlds,
    })
  }
}

function createWorlds(input: LandrushZombieEscapeCollisionWorldInput) {
  return createLandrushZombieEscapeCollisionWorldsResolver()(input)
}

function createInput(radius: number): LandrushZombieEscapeCollisionWorldInput {
  return {
    agentRadius: radius,
    nodes: {},
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
