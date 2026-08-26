import type { NaturalRoadPlan } from './natural-road-plan'
import {
  createNaturalRoadPlanSignature,
  createNaturalRoadPlanWorkerError,
  isNaturalRoadPlanWorkerResponse,
  type NaturalRoadPlanInput,
  type NaturalRoadPlanWorkerRequest,
  type NaturalRoadPlanWorkerStatus,
  normalizeNaturalRoadPlanWorkerError,
} from './natural-road-plan-worker-transport'

export type NaturalRoadPlanWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  postMessage: (request: NaturalRoadPlanWorkerRequest) => void
  terminate: () => void
}

export type NaturalRoadPlanWorkerCompiler = {
  build: (input: NaturalRoadPlanInput) => Promise<NaturalRoadPlan>
  dispose: () => void
}

type PendingNaturalRoadPlan = {
  accepted: boolean
  dispatched: boolean
  promise: Promise<NaturalRoadPlan>
  reject: (error: unknown) => void
  request: NaturalRoadPlanWorkerRequest
  resolve: (plan: NaturalRoadPlan) => void
  executionTimeout: ReturnType<typeof setTimeout> | null
  startupTimeout: ReturnType<typeof setTimeout> | null
}

export const NATURAL_ROAD_PLAN_WORKER_EXECUTION_TIMEOUT_MS = 15_000
export const NATURAL_ROAD_PLAN_WORKER_STARTUP_TIMEOUT_MS = 60_000

export function createBrowserNaturalRoadPlanWorkerCompiler({
  executionTimeoutMs = NATURAL_ROAD_PLAN_WORKER_EXECUTION_TIMEOUT_MS,
  startupTimeoutMs = NATURAL_ROAD_PLAN_WORKER_STARTUP_TIMEOUT_MS,
  workerFactory = createBrowserNaturalRoadPlanWorker,
}: {
  executionTimeoutMs?: number
  startupTimeoutMs?: number
  workerFactory?: () => NaturalRoadPlanWorkerLike
} = {}): NaturalRoadPlanWorkerCompiler {
  let active: PendingNaturalRoadPlan | null = null
  let disposed = false
  let nextRequestId = 1
  let worker: NaturalRoadPlanWorkerLike | null = null
  let workerReady = false

  const clearBuildTimeouts = (pending: PendingNaturalRoadPlan) => {
    if (pending.startupTimeout !== null) {
      clearTimeout(pending.startupTimeout)
      pending.startupTimeout = null
    }
    if (pending.executionTimeout !== null) {
      clearTimeout(pending.executionTimeout)
      pending.executionTimeout = null
    }
  }

  const releaseWorker = () => {
    const currentWorker = worker
    worker = null
    workerReady = false
    if (!currentWorker) return
    currentWorker.onerror = null
    currentWorker.onmessage = null
    currentWorker.onmessageerror = null
    currentWorker.terminate()
  }

  const rejectPending = (error: unknown) => {
    const pending = active
    active = null
    if (!pending) return
    clearBuildTimeouts(pending)
    pending.reject(error)
  }

  const failWorker = (error: unknown) => {
    const normalized = normalizeNaturalRoadPlanWorkerError(error)
    releaseWorker()
    rejectPending(createNaturalRoadPlanWorkerError(normalized))
  }

  const ensureWorker = () => {
    if (worker) return worker
    const nextWorker = workerFactory()
    worker = nextWorker
    nextWorker.onmessage = (event) => {
      const response = event.data
      if (isWorkerStatus(response)) {
        if (response.type === 'ready') {
          if (workerReady) {
            failWorker(new Error('Natural-road worker reported ready more than once.'))
            return
          }
          workerReady = true
          dispatchActive()
          return
        }
        const pending = active
        if (
          !pending?.dispatched ||
          pending.accepted ||
          response.requestId !== pending.request.requestId ||
          response.signature !== pending.request.signature
        ) {
          failWorker(new Error('Natural-road worker accepted a stale or mismatched request.'))
          return
        }
        pending.accepted = true
        if (pending.startupTimeout !== null) {
          clearTimeout(pending.startupTimeout)
          pending.startupTimeout = null
        }
        pending.executionTimeout = setTimeout(
          () => {
            if (active !== pending) return
            active = null
            releaseWorker()
            pending.executionTimeout = null
            pending.reject(
              createTimeoutError(
                `Natural-road worker execution did not finish within ${resolveTimeoutMilliseconds(
                  executionTimeoutMs,
                  NATURAL_ROAD_PLAN_WORKER_EXECUTION_TIMEOUT_MS,
                )}ms.`,
              ),
            )
          },
          resolveTimeoutMilliseconds(
            executionTimeoutMs,
            NATURAL_ROAD_PLAN_WORKER_EXECUTION_TIMEOUT_MS,
          ),
        )
        return
      }

      const pending = active
      if (!pending) {
        failWorker(new Error('Natural-road worker responded without an active request.'))
        return
      }
      if (!isNaturalRoadPlanWorkerResponse(response)) {
        failWorker(new Error('Natural-road worker returned an invalid response.'))
        return
      }
      if (
        !pending.dispatched ||
        !pending.accepted ||
        response.requestId !== pending.request.requestId ||
        response.signature !== pending.request.signature
      ) {
        failWorker(new Error('Natural-road worker returned a stale or mismatched response.'))
        return
      }
      active = null
      clearBuildTimeouts(pending)
      if (response.ok) pending.resolve(response.plan)
      else pending.reject(createNaturalRoadPlanWorkerError(response.error))
    }
    nextWorker.onerror = (event) => {
      event.preventDefault()
      failWorker(event)
    }
    nextWorker.onmessageerror = () => {
      failWorker(new Error('Natural-road worker response could not be deserialized.'))
    }
    return nextWorker
  }

  function dispatchActive() {
    if (disposed || !active) return
    try {
      const currentWorker = ensureWorker()
      if (!workerReady || active.dispatched) return
      active.dispatched = true
      currentWorker.postMessage(active.request)
    } catch (error) {
      failWorker(error)
    }
  }

  const build = (input: NaturalRoadPlanInput) => {
    if (disposed) return Promise.reject(createAbortError('Natural-road worker is disposed.'))
    const signature = createNaturalRoadPlanSignature(input)
    if (active?.request.signature === signature) return active.promise

    let rejectPlan!: (error: unknown) => void
    let resolvePlan!: (plan: NaturalRoadPlan) => void
    const promise = new Promise<NaturalRoadPlan>((resolve, reject) => {
      rejectPlan = reject
      resolvePlan = resolve
    })
    const stale = active
    if (stale) {
      active = null
      clearBuildTimeouts(stale)
      releaseWorker()
      stale.reject(createAbortError('Natural-road build was superseded by a newer request.'))
    }
    const pending: PendingNaturalRoadPlan = {
      accepted: false,
      dispatched: false,
      executionTimeout: null,
      promise,
      reject: rejectPlan,
      request: {
        input,
        requestId: nextRequestId,
        signature,
        type: 'build',
      },
      resolve: resolvePlan,
      startupTimeout: null,
    }
    active = pending
    nextRequestId += 1
    pending.startupTimeout = setTimeout(
      () => {
        if (active !== pending) return
        active = null
        releaseWorker()
        pending.startupTimeout = null
        pending.reject(
          createTimeoutError(
            `Natural-road worker did not become ready and accept the request within ${resolveTimeoutMilliseconds(
              startupTimeoutMs,
              NATURAL_ROAD_PLAN_WORKER_STARTUP_TIMEOUT_MS,
            )}ms.`,
          ),
        )
      },
      resolveTimeoutMilliseconds(startupTimeoutMs, NATURAL_ROAD_PLAN_WORKER_STARTUP_TIMEOUT_MS),
    )
    dispatchActive()
    return promise
  }

  return {
    build,
    dispose: () => {
      if (disposed) return
      disposed = true
      releaseWorker()
      rejectPending(createAbortError('Natural-road worker was disposed.'))
    },
  }
}

function isWorkerStatus(value: unknown): value is NaturalRoadPlanWorkerStatus {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as Partial<NaturalRoadPlanWorkerStatus>
  return (
    candidate.type === 'ready' ||
    (candidate.type === 'accepted' &&
      'requestId' in candidate &&
      typeof candidate.requestId === 'number' &&
      'signature' in candidate &&
      typeof candidate.signature === 'string')
  )
}

function createAbortError(message: string) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function createTimeoutError(message: string) {
  const error = new Error(message)
  error.name = 'TimeoutError'
  return error
}

function resolveTimeoutMilliseconds(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(1, value) : fallback
}

function createBrowserNaturalRoadPlanWorker(): NaturalRoadPlanWorkerLike {
  return new Worker('/landrush-lab/workers/natural-road-plan.worker.js', { type: 'module' })
}
