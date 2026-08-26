import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
} from './procedural-rock-cliff-geometry'
import {
  compileProceduralRockCliffBundleInWorker,
  createProceduralRockCliffWorkerResource,
  type ProceduralRockCliffWorkerLike,
} from './procedural-rock-cliff-worker-client'
import {
  createProceduralRockCliffWorkerSignature,
  type ProceduralRockCliffWorkerCompileInput,
  type ProceduralRockCliffWorkerRequest,
  type ProceduralRockCliffWorkerResponse,
  type ProceduralRockCliffWorkerStatus,
  type SerializedProceduralRockCliffBundle,
} from './procedural-rock-cliff-worker-transport'
import { isProceduralRockCliffLoadReady } from './procedural-rock-cliffs'

describe('procedural-rock cliff worker client', () => {
  test('reports readiness only for the bundle committed for the active semantic signature', () => {
    expect(isProceduralRockCliffLoadReady('active', undefined)).toBe(false)
    expect(isProceduralRockCliffLoadReady('active', 'stale')).toBe(false)
    expect(isProceduralRockCliffLoadReady('active', 'active')).toBe(true)
  })

  test('shares one in-flight and settled compilation across StrictMode-equivalent inputs', async () => {
    let compileCount = 0
    let resolveCompilation!: (bundle: SerializedProceduralRockCliffBundle) => void
    const bundle = createEmptyBundle()
    const resource = createProceduralRockCliffWorkerResource({
      compile: () => {
        compileCount += 1
        return new Promise((resolve) => {
          resolveCompilation = resolve
        })
      },
    })
    const input = createInput()

    const first = resource.load(input)
    const repeated = resource.load(structuredClone(input))
    expect(repeated).toBe(first)
    await Promise.resolve()
    expect(compileCount).toBe(1)

    resolveCompilation(bundle)
    await expect(first).resolves.toBe(bundle)
    expect(resource.load(structuredClone(input))).toBe(first)
    expect(compileCount).toBe(1)
  })

  test('evicts failed work so a later mount can retry the same semantics', async () => {
    let compileCount = 0
    const resource = createProceduralRockCliffWorkerResource({
      compile: async () => {
        compileCount += 1
        if (compileCount === 1) throw new Error('worker failed')
        return createEmptyBundle()
      },
    })
    const input = createInput()

    await expect(resource.load(input)).rejects.toThrow('worker failed')
    await expect(resource.load(structuredClone(input))).resolves.toBeDefined()
    expect(compileCount).toBe(2)
  })

  test('terminates superseded semantics before starting the latest compilation', async () => {
    let concurrentCompilations = 0
    let maximumConcurrency = 0
    const pending: Array<{
      resolve: (bundle: SerializedProceduralRockCliffBundle) => void
      signal: AbortSignal
    }> = []
    const resource = createProceduralRockCliffWorkerResource({
      compile: (_input, _signature, signal) =>
        new Promise((resolve, reject) => {
          concurrentCompilations += 1
          maximumConcurrency = Math.max(maximumConcurrency, concurrentCompilations)
          const finish = () => {
            concurrentCompilations -= 1
          }
          signal.addEventListener(
            'abort',
            () => {
              finish()
              reject(new DOMException('superseded', 'AbortError'))
            },
            { once: true },
          )
          pending.push({
            resolve: (bundle) => {
              finish()
              resolve(bundle)
            },
            signal,
          })
        }),
    })
    const first = resource.load(createInput())
    await Promise.resolve()
    expect(pending).toHaveLength(1)

    const latestInput = { ...createInput(), waterlineResolution: 1280 }
    const latest = resource.load(latestInput)
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()

    expect(pending[0]?.signal.aborted).toBe(true)
    expect(pending).toHaveLength(2)
    expect(maximumConcurrency).toBe(1)
    pending[1]!.resolve(createEmptyBundle())
    await expect(latest).resolves.toBeDefined()
  })

  test('never caches a stale completion that arrives after supersession', async () => {
    const pending: Array<(bundle: SerializedProceduralRockCliffBundle) => void> = []
    let compileCount = 0
    const resource = createProceduralRockCliffWorkerResource({
      compile: () => {
        compileCount += 1
        return new Promise((resolve) => pending.push(resolve))
      },
    })
    const staleInput = createInput()
    const latestInput = { ...createInput(), waterlineResolution: 1280 }
    const stale = resource.load(staleInput)
    await Promise.resolve()
    const latest = resource.load(latestInput)

    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    pending[0]!(createEmptyBundle())
    pending[1]!(createEmptyBundle())
    await expect(latest).resolves.toBeDefined()

    const retriedStale = resource.load(structuredClone(staleInput))
    await Promise.resolve()
    expect(compileCount).toBe(3)
    pending[2]!(createEmptyBundle())
    await expect(retriedStale).resolves.toBeDefined()
  })

  test('retains at most the two most recently used settled bundles by default', async () => {
    let compileCount = 0
    const resource = createProceduralRockCliffWorkerResource({
      compile: async () => {
        compileCount += 1
        return createEmptyBundle()
      },
    })
    const firstInput = createInput()
    const secondInput = { ...createInput(), waterlineResolution: 1152 }
    const thirdInput = { ...createInput(), waterlineResolution: 1280 }

    await resource.load(firstInput)
    await resource.load(secondInput)
    await resource.load(thirdInput)
    await resource.load(structuredClone(secondInput))
    expect(compileCount).toBe(3)

    await resource.load(structuredClone(firstInput))
    expect(compileCount).toBe(4)
  })

  test('waits for worker presentation readiness and validates request identity', async () => {
    const worker = new FakeProceduralRockCliffWorker()
    const input = createInput()
    const signature = createProceduralRockCliffWorkerSignature(input)
    const pending = compileProceduralRockCliffBundleInWorker(
      input,
      signature,
      undefined,
      () => worker,
    )

    expect(worker.requests).toEqual([])
    worker.emitStatus({ type: 'ready' })
    expect(worker.requests).toHaveLength(1)
    expect(worker.requests[0]).toMatchObject({ signature, type: 'compile' })

    const request = worker.requests[0]!
    worker.emitStatus({ requestId: request.requestId, signature, type: 'accepted' })
    const bundle = createEmptyBundle()
    worker.emitResponse({ bundle, ok: true, requestId: request.requestId, signature })

    await expect(pending).resolves.toBe(bundle)
    expect(worker.terminated).toBe(true)
  })

  test('terminates worker CPU immediately when a compile signal is aborted', async () => {
    const worker = new FakeProceduralRockCliffWorker()
    const controller = new AbortController()
    const input = createInput()
    const signature = createProceduralRockCliffWorkerSignature(input)
    const pending = compileProceduralRockCliffBundleInWorker(
      input,
      signature,
      controller.signal,
      () => worker,
    )
    worker.emitStatus({ type: 'ready' })
    expect(worker.requests).toHaveLength(1)

    controller.abort()

    expect(worker.terminated).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

class FakeProceduralRockCliffWorker implements ProceduralRockCliffWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null
  readonly requests: ProceduralRockCliffWorkerRequest[] = []
  terminated = false

  postMessage(request: ProceduralRockCliffWorkerRequest) {
    this.requests.push(structuredClone(request))
  }

  terminate() {
    this.terminated = true
  }

  emitResponse(response: ProceduralRockCliffWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<unknown>)
  }

  emitStatus(status: ProceduralRockCliffWorkerStatus) {
    this.onmessage?.({ data: status } as MessageEvent<unknown>)
  }
}

function createInput(): ProceduralRockCliffWorkerCompileInput {
  return {
    beachControls: DEFAULT_PROCEDURAL_BEACH_CONTROLS,
    cutCount: 5,
    includeWaterlineInteractionField: true,
    offshoreControls: DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
    quality: 'balanced',
    rockScale: 1,
    seed: 42,
    surface: {
      grassSurfaceElevation: 2,
      grassSurfacePoints: [
        { x: -10, z: -10 },
        { x: 10, z: -10 },
        { x: 10, z: 10 },
        { x: -10, z: 10 },
      ],
      hasElevation: true,
      plateauElevation: 2,
      plateauPoints: [],
      shorelinePoints: [],
      slopeStartPoints: [],
      waterPlaneSize: 64,
    },
    toneControls: DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
    wallControls: DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
    waterSurfaceElevation: 0,
    waterlineElevationRangeMeters: 2.5,
    waterlineMaximumDistanceMeters: 6,
    waterlineResolution: 1024,
  }
}

function createEmptyBundle() {
  return {} as SerializedProceduralRockCliffBundle
}
