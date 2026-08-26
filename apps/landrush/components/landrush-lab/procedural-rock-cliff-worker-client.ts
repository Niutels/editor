import {
  createProceduralRockCliffWorkerError,
  createProceduralRockCliffWorkerSignature,
  isProceduralRockCliffWorkerResponse,
  normalizeProceduralRockCliffWorkerError,
  type ProceduralRockCliffWorkerCompileInput,
  type ProceduralRockCliffWorkerRequest,
  type ProceduralRockCliffWorkerStatus,
  type SerializedProceduralRockCliffBundle,
} from './procedural-rock-cliff-worker-transport'

export type ProceduralRockCliffWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  postMessage: (request: ProceduralRockCliffWorkerRequest) => void
  terminate: () => void
}

type CompileProceduralRockCliffBundle = (
  input: ProceduralRockCliffWorkerCompileInput,
  signature: string,
  signal: AbortSignal,
) => Promise<SerializedProceduralRockCliffBundle>

type CachedCompilation = {
  promise: Promise<SerializedProceduralRockCliffBundle>
  settled: boolean
}

type ActiveCompilation = {
  controller: AbortController
  entry: CachedCompilation
  signature: string
}

let nextRequestId = 1

export function createProceduralRockCliffWorkerResource({
  compile = (input, signature, signal) =>
    compileProceduralRockCliffBundleInWorker(input, signature, signal),
  maximumSettledEntries = 2,
}: {
  compile?: CompileProceduralRockCliffBundle
  maximumSettledEntries?: number
} = {}) {
  let activeCompilation: ActiveCompilation | null = null
  const compilations = new Map<string, CachedCompilation>()

  const trimSettledEntries = () => {
    const safeMaximum = Math.max(1, Math.round(maximumSettledEntries))
    let settledCount = [...compilations.values()].filter((entry) => entry.settled).length
    if (settledCount <= safeMaximum) return
    for (const [signature, entry] of compilations) {
      if (!entry.settled) continue
      compilations.delete(signature)
      settledCount -= 1
      if (settledCount <= safeMaximum) return
    }
  }

  const supersedeActiveCompilation = () => {
    const staleCompilation = activeCompilation
    activeCompilation = null
    if (!staleCompilation) return
    if (compilations.get(staleCompilation.signature) === staleCompilation.entry) {
      compilations.delete(staleCompilation.signature)
    }
    staleCompilation.controller.abort()
  }

  return {
    dispose() {
      supersedeActiveCompilation()
      compilations.clear()
    },
    load(input: ProceduralRockCliffWorkerCompileInput) {
      const signature = createProceduralRockCliffWorkerSignature(input)
      if (activeCompilation && activeCompilation.signature !== signature) {
        supersedeActiveCompilation()
      }
      const cached = compilations.get(signature)
      if (cached) {
        compilations.delete(signature)
        compilations.set(signature, cached)
        return cached.promise
      }

      const controller = new AbortController()
      const entry: CachedCompilation = {
        promise: undefined as unknown as Promise<SerializedProceduralRockCliffBundle>,
        settled: false,
      }
      const promise = runAbortableCompilation(
        () => compile(input, signature, controller.signal),
        controller.signal,
      ).then(
        (bundle) => {
          if (controller.signal.aborted || activeCompilation?.entry !== entry) {
            throw createAbortError('Procedural-rock compilation completed after it was superseded.')
          }
          activeCompilation = null
          entry.settled = true
          trimSettledEntries()
          return bundle
        },
        (error: unknown) => {
          if (activeCompilation?.entry === entry) activeCompilation = null
          if (compilations.get(signature) === entry) compilations.delete(signature)
          throw error
        },
      )
      entry.promise = promise
      compilations.set(signature, entry)
      activeCompilation = { controller, entry, signature }
      return promise
    },
  }
}

const proceduralRockCliffWorkerResource = createProceduralRockCliffWorkerResource()

export function loadProceduralRockCliffBundle(input: ProceduralRockCliffWorkerCompileInput) {
  return proceduralRockCliffWorkerResource.load(input)
}

export function compileProceduralRockCliffBundleInWorker(
  input: ProceduralRockCliffWorkerCompileInput,
  signature = createProceduralRockCliffWorkerSignature(input),
  signal?: AbortSignal,
  workerFactory: () => ProceduralRockCliffWorkerLike = createBrowserProceduralRockCliffWorker,
) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError('Procedural-rock worker compilation was aborted.'))
  }
  return new Promise<SerializedProceduralRockCliffBundle>((resolve, reject) => {
    let accepted = false
    let abortListener: (() => void) | null = null
    let ready = false
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    let worker: ProceduralRockCliffWorkerLike | null = null
    const request: ProceduralRockCliffWorkerRequest = {
      input,
      requestId: nextRequestId,
      signature,
      type: 'compile',
    }
    nextRequestId += 1

    const release = () => {
      if (timeout !== null) clearTimeout(timeout)
      timeout = null
      if (abortListener && signal) signal.removeEventListener('abort', abortListener)
      abortListener = null
      if (!worker) return
      worker.onerror = null
      worker.onmessage = null
      worker.onmessageerror = null
      worker.terminate()
      worker = null
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      release()
      reject(createProceduralRockCliffWorkerError(normalizeProceduralRockCliffWorkerError(error)))
    }
    const succeed = (bundle: SerializedProceduralRockCliffBundle) => {
      if (settled) return
      settled = true
      release()
      resolve(bundle)
    }

    try {
      worker = workerFactory()
    } catch (error) {
      reject(createProceduralRockCliffWorkerError(normalizeProceduralRockCliffWorkerError(error)))
      return
    }

    if (signal) {
      abortListener = () => {
        fail(createAbortError('Procedural-rock worker compilation was aborted.'))
      }
      signal.addEventListener('abort', abortListener, { once: true })
    }
    timeout = setTimeout(() => {
      fail(new DOMException('Procedural-rock worker compilation timed out.', 'TimeoutError'))
    }, 60_000)

    worker.onmessage = (event) => {
      const response = event.data
      if (isWorkerStatus(response)) {
        if (response.type === 'ready') {
          if (ready) {
            fail(new Error('Procedural-rock worker reported ready more than once.'))
            return
          }
          ready = true
          try {
            worker?.postMessage(request)
          } catch (error) {
            fail(error)
          }
          return
        }
        if (
          !ready ||
          accepted ||
          response.requestId !== request.requestId ||
          response.signature !== request.signature
        ) {
          fail(new Error('Procedural-rock worker accepted a stale or mismatched request.'))
          return
        }
        accepted = true
        return
      }
      if (!isProceduralRockCliffWorkerResponse(response)) {
        fail(new Error('Procedural-rock worker returned an invalid response.'))
        return
      }
      if (
        !ready ||
        !accepted ||
        response.requestId !== request.requestId ||
        response.signature !== request.signature
      ) {
        fail(new Error('Procedural-rock worker returned a stale or mismatched response.'))
        return
      }
      if (response.ok) succeed(response.bundle)
      else fail(createProceduralRockCliffWorkerError(response.error))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      fail(event)
    }
    worker.onmessageerror = () => {
      fail(new Error('Procedural-rock worker response could not be deserialized.'))
    }
  })
}

function runAbortableCompilation(
  compile: () => Promise<SerializedProceduralRockCliffBundle>,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return Promise.reject(createAbortError('Procedural-rock compilation was superseded.'))
  }
  return new Promise<SerializedProceduralRockCliffBundle>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort)
      reject(createAbortError('Procedural-rock compilation was superseded.'))
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    Promise.resolve()
      .then(compile)
      .then(
        (bundle) => {
          signal.removeEventListener('abort', handleAbort)
          if (signal.aborted) {
            reject(createAbortError('Procedural-rock compilation was superseded.'))
            return
          }
          resolve(bundle)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', handleAbort)
          reject(error)
        },
      )
  })
}

function createAbortError(message: string) {
  return new DOMException(message, 'AbortError')
}

function isWorkerStatus(value: unknown): value is ProceduralRockCliffWorkerStatus {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as Partial<ProceduralRockCliffWorkerStatus>
  return (
    candidate.type === 'ready' ||
    (candidate.type === 'accepted' &&
      'requestId' in candidate &&
      typeof candidate.requestId === 'number' &&
      'signature' in candidate &&
      typeof candidate.signature === 'string')
  )
}

function createBrowserProceduralRockCliffWorker(): ProceduralRockCliffWorkerLike {
  return new Worker('/landrush-lab/workers/procedural-rock-cliff.worker.js', { type: 'module' })
}
