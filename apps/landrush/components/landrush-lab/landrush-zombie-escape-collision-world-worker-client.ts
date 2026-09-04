import {
  createLandrushZombieEscapeCollisionWorldCompilation,
  type LandrushZombieEscapeCollisionWorldCompilation,
  type LandrushZombieEscapeCollisionWorldInput,
  type LandrushZombieEscapeCollisionWorlds,
} from '@landrush/pascal-host/zombie-game-navigation'
import {
  createLandrushZombieEscapeCollisionWorldWorkerError,
  isLandrushZombieEscapeCollisionWorldWorkerResponse,
  type LandrushZombieEscapeCollisionWorldWorkerRequest,
  type LandrushZombieEscapeCollisionWorldWorkerStatus,
  normalizeLandrushZombieEscapeCollisionWorldWorkerError,
} from './landrush-zombie-escape-collision-world-worker-transport'

export type LandrushZombieEscapeCollisionWorldWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  postMessage: (request: LandrushZombieEscapeCollisionWorldWorkerRequest) => void
  terminate: () => void
}

export type LandrushZombieEscapeCollisionWorldWorkerCompiler = {
  compile: (
    input: LandrushZombieEscapeCollisionWorldInput,
    signal?: AbortSignal,
  ) => Promise<LandrushZombieEscapeCollisionWorlds>
  dispose: () => void
}

type PendingCompilation = {
  accepted: boolean
  abortListener: (() => void) | null
  dispatched: boolean
  promise: Promise<LandrushZombieEscapeCollisionWorlds>
  reject: (error: unknown) => void
  request: LandrushZombieEscapeCollisionWorldWorkerRequest
  resolve: (worlds: LandrushZombieEscapeCollisionWorlds) => void
  signal?: AbortSignal
}

export function createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
  onPreparedCompilation,
  workerFactory = createBrowserCollisionWorldWorker,
}: {
  onPreparedCompilation?: (compilation: LandrushZombieEscapeCollisionWorldCompilation) => void
  workerFactory?: () => LandrushZombieEscapeCollisionWorldWorkerLike
} = {}): LandrushZombieEscapeCollisionWorldWorkerCompiler {
  let active: PendingCompilation | null = null
  let disposed = false
  let nextRequestId = 1
  let worker: LandrushZombieEscapeCollisionWorldWorkerLike | null = null
  let workerReady = false

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

  const detachAbortListener = (compilation: PendingCompilation) => {
    if (!compilation.abortListener || !compilation.signal) return
    compilation.signal.removeEventListener('abort', compilation.abortListener)
    compilation.abortListener = null
  }

  const rejectPending = (error: unknown) => {
    const activeCompilation = active
    active = null
    if (!activeCompilation) return
    detachAbortListener(activeCompilation)
    activeCompilation.reject(error)
  }

  const failWorker = (error: unknown) => {
    const normalizedError = normalizeLandrushZombieEscapeCollisionWorldWorkerError(error)
    releaseWorker()
    rejectPending(createLandrushZombieEscapeCollisionWorldWorkerError(normalizedError))
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
            failWorker(new Error('Collision-world worker reported ready more than once.'))
            return
          }
          workerReady = true
          dispatchActive()
          return
        }
        const activeCompilation = active
        if (
          !activeCompilation?.dispatched ||
          activeCompilation.accepted ||
          response.requestId !== activeCompilation.request.requestId ||
          response.signature !== activeCompilation.request.signature
        ) {
          failWorker(new Error('Collision-world worker accepted a stale or mismatched request.'))
          return
        }
        activeCompilation.accepted = true
        return
      }
      const activeCompilation = active
      if (!activeCompilation) {
        failWorker(new Error('Collision-world worker responded without an active request.'))
        return
      }
      if (!isLandrushZombieEscapeCollisionWorldWorkerResponse(response)) {
        failWorker(new Error('Collision-world worker returned an invalid response.'))
        return
      }
      if (
        !activeCompilation.dispatched ||
        !activeCompilation.accepted ||
        response.requestId !== activeCompilation.request.requestId ||
        response.signature !== activeCompilation.request.signature
      ) {
        failWorker(new Error('Collision-world worker returned a stale or mismatched response.'))
        return
      }
      active = null
      detachAbortListener(activeCompilation)
      if (response.ok) {
        activeCompilation.resolve(response.worlds)
      } else {
        activeCompilation.reject(
          createLandrushZombieEscapeCollisionWorldWorkerError(response.error),
        )
      }
    }
    nextWorker.onerror = (event) => {
      event.preventDefault()
      failWorker(event)
    }
    nextWorker.onmessageerror = () => {
      failWorker(new Error('Collision-world worker response could not be deserialized.'))
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

  const compile = (input: LandrushZombieEscapeCollisionWorldInput, signal?: AbortSignal) => {
    if (disposed) {
      return Promise.reject(createAbortError('Collision-world worker compiler is disposed.'))
    }
    if (signal?.aborted) {
      return Promise.reject(createAbortError('Collision-world compilation was aborted.'))
    }
    let preparedCompilation: ReturnType<typeof createLandrushZombieEscapeCollisionWorldCompilation>
    try {
      preparedCompilation = createLandrushZombieEscapeCollisionWorldCompilation(input)
      onPreparedCompilation?.(preparedCompilation)
    } catch (error) {
      return Promise.reject(error)
    }
    const request: LandrushZombieEscapeCollisionWorldWorkerRequest = {
      ...preparedCompilation,
      requestId: nextRequestId,
      type: 'compile',
    }
    nextRequestId += 1
    if (active?.request.signature === preparedCompilation.signature && active.signal === signal) {
      return active.promise
    }
    let rejectCompilation!: (error: unknown) => void
    let resolveCompilation!: (worlds: LandrushZombieEscapeCollisionWorlds) => void
    const promise = new Promise<LandrushZombieEscapeCollisionWorlds>((resolve, reject) => {
      resolveCompilation = resolve
      rejectCompilation = reject
    })
    const staleCompilation = active
    if (staleCompilation) {
      active = null
      detachAbortListener(staleCompilation)
      releaseWorker()
      staleCompilation.reject(
        createAbortError('Collision-world compilation was superseded by a newer request.'),
      )
    }
    const compilation: PendingCompilation = {
      accepted: false,
      abortListener: null,
      dispatched: false,
      promise,
      reject: rejectCompilation,
      request,
      resolve: resolveCompilation,
      signal,
    }
    active = compilation
    if (signal) {
      compilation.abortListener = () => {
        if (active !== compilation) return
        active = null
        detachAbortListener(compilation)
        releaseWorker()
        compilation.reject(createAbortError('Collision-world compilation was aborted.'))
      }
      signal.addEventListener('abort', compilation.abortListener, { once: true })
    }
    dispatchActive()
    return promise
  }

  return {
    compile,
    dispose: () => {
      if (disposed) return
      disposed = true
      releaseWorker()
      rejectPending(createAbortError('Collision-world worker compiler was disposed.'))
    },
  }
}

function createAbortError(message: string) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function isWorkerStatus(value: unknown): value is LandrushZombieEscapeCollisionWorldWorkerStatus {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as Partial<LandrushZombieEscapeCollisionWorldWorkerStatus>
  return (
    candidate.type === 'ready' ||
    (candidate.type === 'accepted' &&
      'requestId' in candidate &&
      typeof candidate.requestId === 'number' &&
      'signature' in candidate &&
      typeof candidate.signature === 'string')
  )
}

function createBrowserCollisionWorldWorker(): LandrushZombieEscapeCollisionWorldWorkerLike {
  return new Worker('/landrush-lab/workers/landrush-zombie-escape-collision-world.worker.js', {
    type: 'module',
  })
}
