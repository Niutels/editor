import { describe, expect, test } from 'bun:test'
import type { NaturalRoadPlan } from './natural-road-plan'
import {
  createBrowserNaturalRoadPlanWorkerCompiler,
  type NaturalRoadPlanWorkerLike,
} from './natural-road-plan-worker-client'
import type {
  NaturalRoadPlanInput,
  NaturalRoadPlanWorkerRequest,
  NaturalRoadPlanWorkerResponse,
  NaturalRoadPlanWorkerStatus,
} from './natural-road-plan-worker-transport'

describe('natural-road plan worker client', () => {
  test('waits for readiness and shares a matching in-flight build', async () => {
    const worker = new FakeNaturalRoadPlanWorker()
    const compiler = createBrowserNaturalRoadPlanWorkerCompiler({ workerFactory: () => worker })
    const input = createInput()

    const first = compiler.build(input)
    const replay = compiler.build(structuredClone(input))
    expect(replay).toBe(first)
    expect(worker.requests).toEqual([])

    worker.emitReady()
    expect(worker.requests).toHaveLength(1)
    worker.succeed(createPlan())
    await expect(first).resolves.toMatchObject({ quality: 'high', seed: 'cala' })
    compiler.dispose()
  })

  test('terminates superseded worker CPU and rejects its pending build', async () => {
    const workers = [new FakeNaturalRoadPlanWorker(), new FakeNaturalRoadPlanWorker()]
    let workerIndex = 0
    const compiler = createBrowserNaturalRoadPlanWorkerCompiler({
      workerFactory: () => workers[workerIndex++]!,
    })
    const stale = compiler.build(createInput())
    const staleResult = stale.then(
      () => null,
      (error: unknown) => error,
    )
    workers[0]!.emitReady()

    const latest = compiler.build(createInput({ elevation: 1 }))
    workers[1]!.emitReady()
    expect(workers[0]!.terminated).toBe(true)
    expect(await staleResult).toMatchObject({ name: 'AbortError' })

    workers[1]!.succeed(createPlan())
    await expect(latest).resolves.toBeDefined()
    compiler.dispose()
  })

  test('fails closed when the worker returns a mismatched response', async () => {
    const worker = new FakeNaturalRoadPlanWorker()
    const compiler = createBrowserNaturalRoadPlanWorkerCompiler({ workerFactory: () => worker })
    const pending = compiler.build(createInput())
    worker.emitReady()
    const request = worker.requests[0]!
    worker.emitStatus({
      requestId: request.requestId,
      signature: request.signature,
      type: 'accepted',
    })
    worker.emitResponse({
      ok: true,
      plan: createPlan(),
      requestId: request.requestId + 1,
      signature: request.signature,
    })

    await expect(pending).rejects.toThrow('stale or mismatched')
    expect(worker.terminated).toBe(true)
    compiler.dispose()
  })

  test('does not charge cold worker readiness time against execution', async () => {
    const worker = new FakeNaturalRoadPlanWorker()
    const compiler = createBrowserNaturalRoadPlanWorkerCompiler({
      executionTimeoutMs: 10,
      startupTimeoutMs: 100,
      workerFactory: () => worker,
    })
    let settled = false
    const coldBuild = compiler.build(createInput()).finally(() => {
      settled = true
    })

    await wait(25)
    expect(settled).toBe(false)
    expect(worker.terminated).toBe(false)
    worker.emitReady()
    worker.succeed(createPlan())
    await expect(coldBuild).resolves.toBeDefined()
    compiler.dispose()
  })

  test('terminates a worker that never becomes ready', async () => {
    const worker = new FakeNaturalRoadPlanWorker()
    const compiler = createBrowserNaturalRoadPlanWorkerCompiler({
      executionTimeoutMs: 100,
      startupTimeoutMs: 10,
      workerFactory: () => worker,
    })

    await expect(compiler.build(createInput())).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(worker.terminated).toBe(true)
    compiler.dispose()
  })

  test('terminates an accepted worker that exceeds the bounded execution time', async () => {
    const workers = [new FakeNaturalRoadPlanWorker(), new FakeNaturalRoadPlanWorker()]
    let workerIndex = 0
    const compiler = createBrowserNaturalRoadPlanWorkerCompiler({
      executionTimeoutMs: 10,
      startupTimeoutMs: 100,
      workerFactory: () => workers[workerIndex++]!,
    })

    const timedOut = compiler.build(createInput())
    workers[0]!.emitReady()
    const request = workers[0]!.requests[0]!
    workers[0]!.emitStatus({
      requestId: request.requestId,
      signature: request.signature,
      type: 'accepted',
    })
    await expect(timedOut).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(workers[0]!.terminated).toBe(true)

    const retry = compiler.build(createInput())
    workers[1]!.emitReady()
    workers[1]!.succeed(createPlan())
    await expect(retry).resolves.toBeDefined()
    compiler.dispose()
  })
})

class FakeNaturalRoadPlanWorker implements NaturalRoadPlanWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null
  readonly requests: NaturalRoadPlanWorkerRequest[] = []
  terminated = false

  postMessage(request: NaturalRoadPlanWorkerRequest) {
    this.requests.push(structuredClone(request))
  }

  terminate() {
    this.terminated = true
  }

  emitReady() {
    this.emitStatus({ type: 'ready' })
  }

  emitStatus(status: NaturalRoadPlanWorkerStatus) {
    this.onmessage?.({ data: status } as MessageEvent<unknown>)
  }

  emitResponse(response: NaturalRoadPlanWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<unknown>)
  }

  succeed(plan: NaturalRoadPlan) {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No active natural-road request.')
    this.emitStatus({
      requestId: request.requestId,
      signature: request.signature,
      type: 'accepted',
    })
    this.emitResponse({
      ok: true,
      plan,
      requestId: request.requestId,
      signature: request.signature,
    })
  }
}

function createInput(overrides: Partial<NaturalRoadPlanInput> = {}): NaturalRoadPlanInput {
  return {
    elevation: 0,
    perimeter: [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 2 },
      { x: -2, z: 2 },
    ],
    quality: 'high',
    roads: [],
    seed: 'cala',
    ...overrides,
  }
}

function createPlan(): NaturalRoadPlan {
  return {
    footprints: {
      asphalt: [],
      centerDashes: [],
      clearance: [],
      edgeLines: [],
      outerSidewalk: [],
      perimeterSidewalk: [],
      roadSidewalks: [],
      sidewalks: [],
    },
    groundElevation: 0,
    metrics: {
      buildTimeMs: 0,
      endpointCount: 0,
      estimatedTriangleCount: 0,
      estimatedVertexCount: 0,
      footprintVertexCount: 0,
      junctionCount: 0,
      nodeCount: 0,
      perimeterSidewalkSegmentCount: 0,
      routeLengthMeters: 0,
      segmentCount: 0,
      sidewalkOffsetAudit: {
        excessMeters: 0,
        expectedMeters: 0,
        maximumAbsoluteErrorMeters: 0,
        maximumMeters: 0,
        minimumMeters: 0,
        point: { x: 0, z: 0 },
      },
    },
    nodes: [],
    perimeterSidewalkPoints: [],
    perimeterSidewalkRoadIds: [],
    quality: 'high',
    roadGeometryAudit: {
      boundaryFailures: [],
      failureCount: 0,
      maximumBoundaryTurnDegrees: 0,
      maximumParallelDeviationMeters: 0,
      minimumHalfWidthMeters: 0,
      probes: [],
      requiredHalfWidthMeters: 0,
      sampleCount: 0,
      worstPoint: { x: 0, z: 0 },
    },
    roadWidths: {},
    roads: [],
    seed: 'cala',
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
