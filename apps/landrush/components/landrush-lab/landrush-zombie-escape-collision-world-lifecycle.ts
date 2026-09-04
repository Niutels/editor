import type { ZombieEscapeGamePhase } from '@landrush/zombie-gameplay/zombie-escape-simulation'

export const LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_BACKGROUND_DEBOUNCE_MS = 500
export const LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_EXECUTION_TIMEOUT_MS = 60_000
export const LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_IDLE_TIMEOUT_MS = 1_200
export const LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS = [100, 300] as const

export type LandrushZombieEscapeCollisionWorldBuildPriority = 'background' | 'urgent'

export type LandrushZombieEscapeCollisionWorldBuildState<TWorlds> = Readonly<{
  generation: number
  pendingSignature: string | null
  ready: boolean
  signature: string | null
  worlds: TWorlds | null
}>

export type LandrushZombieEscapeCollisionWorldBuildScheduleHost = {
  cancelIdleCallback?: (handle: number) => void
  clearTimeout: (handle: number) => void
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
  setTimeout: (callback: () => void, timeoutMs: number) => number
}

export type LandrushZombieEscapeCollisionWorldBuildCoordinator<TInput, TWorlds> = {
  dispose: () => void
  getState: () => LandrushZombieEscapeCollisionWorldBuildState<TWorlds>
  request: (input: TInput, priority: LandrushZombieEscapeCollisionWorldBuildPriority) => void
}

export function createLandrushZombieEscapeCollisionWorldBuildState<
  TWorlds,
>(): LandrushZombieEscapeCollisionWorldBuildState<TWorlds> {
  return { generation: 0, pendingSignature: null, ready: false, signature: null, worlds: null }
}

export function isLandrushZombieEscapeDesiredCollisionWorldReady<TWorlds>({
  desiredSignature,
  state,
}: {
  desiredSignature: string
  state: LandrushZombieEscapeCollisionWorldBuildState<TWorlds>
}) {
  return (
    state.ready &&
    state.pendingSignature === null &&
    state.worlds !== null &&
    state.signature === desiredSignature
  )
}

export function resolveLandrushZombieEscapeCollisionWorldPhaseReady<TWorlds>({
  desiredSignature,
  expectedPhase,
  phaseReady,
  state,
}: {
  desiredSignature: string
  expectedPhase: ZombieEscapeGamePhase
  phaseReady: boolean
  state: LandrushZombieEscapeCollisionWorldBuildState<TWorlds>
}) {
  return (
    phaseReady &&
    (expectedPhase !== 'night' ||
      isLandrushZombieEscapeDesiredCollisionWorldReady({ desiredSignature, state }))
  )
}

export function resolveLandrushZombieEscapeCollisionWorldBuildPriority(
  expectedPhase: ZombieEscapeGamePhase,
): LandrushZombieEscapeCollisionWorldBuildPriority {
  return expectedPhase === 'night' ? 'urgent' : 'background'
}

export function createLandrushZombieEscapeCollisionWorldBuildCoordinator<TInput, TWorlds>({
  backgroundDebounceMs = LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_BACKGROUND_DEBOUNCE_MS,
  compile,
  executionTimeoutMs = LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_EXECUTION_TIMEOUT_MS,
  host,
  idleTimeoutMs = LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_IDLE_TIMEOUT_MS,
  onError,
  onStateChange,
  resolveSignature,
  retryDelaysMs = LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS,
}: {
  backgroundDebounceMs?: number
  compile: (input: TInput, signal: AbortSignal) => TWorlds | PromiseLike<TWorlds>
  executionTimeoutMs?: number
  host: LandrushZombieEscapeCollisionWorldBuildScheduleHost
  idleTimeoutMs?: number
  onError?: (error: unknown) => void
  onStateChange: (state: LandrushZombieEscapeCollisionWorldBuildState<TWorlds>) => void
  resolveSignature: (input: TInput) => string
  retryDelaysMs?: readonly number[]
}): LandrushZombieEscapeCollisionWorldBuildCoordinator<TInput, TWorlds> {
  let disposed = false
  let generation = 0
  let activeBuildController: AbortController | null = null
  const executionTimeoutHandles = new Map<AbortController, number>()
  let idleHandle: number | null = null
  let pendingPriority: LandrushZombieEscapeCollisionWorldBuildPriority | null = null
  let state = createLandrushZombieEscapeCollisionWorldBuildState<TWorlds>()
  let timeoutHandle: number | null = null

  const cancelScheduledBuild = () => {
    if (timeoutHandle !== null) {
      host.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
    if (idleHandle !== null) {
      host.cancelIdleCallback?.(idleHandle)
      idleHandle = null
    }
  }

  const clearExecutionTimeout = (controller: AbortController) => {
    const handle = executionTimeoutHandles.get(controller)
    if (handle === undefined) return
    executionTimeoutHandles.delete(controller)
    host.clearTimeout(handle)
  }

  const abortActiveBuild = () => {
    const controller = activeBuildController
    activeBuildController = null
    if (!controller) return
    clearExecutionTimeout(controller)
    controller.abort()
  }

  const publish = (nextState: LandrushZombieEscapeCollisionWorldBuildState<TWorlds>) => {
    if (disposed) return
    state = nextState
    onStateChange(nextState)
  }

  const request = (input: TInput, priority: LandrushZombieEscapeCollisionWorldBuildPriority) => {
    if (disposed) return
    let signature: string
    try {
      signature = resolveSignature(input)
    } catch (error) {
      onError?.(error)
      return
    }

    if (state.worlds !== null && signature === state.signature) {
      if (!state.ready || state.pendingSignature !== null) {
        generation += 1
        cancelScheduledBuild()
        abortActiveBuild()
        pendingPriority = null
        publish({ ...state, generation, pendingSignature: null, ready: true })
      }
      return
    }
    if (signature === state.pendingSignature) {
      if (pendingPriority === 'urgent' || pendingPriority === priority) return
    }

    generation += 1
    const requestedGeneration = generation
    cancelScheduledBuild()
    abortActiveBuild()
    pendingPriority = priority
    publish({
      ...state,
      generation: requestedGeneration,
      pendingSignature: signature,
      ready: false,
    })

    let retryIndex = 0
    const releaseActiveBuild = (controller: AbortController) => {
      if (activeBuildController !== controller) return false
      activeBuildController = null
      clearExecutionTimeout(controller)
      return true
    }

    const handleBuildFailure = (error: unknown, controller: AbortController) => {
      if (!releaseActiveBuild(controller)) return
      if (disposed || requestedGeneration !== generation) return
      if (isAbortError(error)) {
        pendingPriority = null
        publish({ ...state, pendingSignature: null })
        return
      }
      onError?.(error)
      if (isTimeoutError(error)) {
        pendingPriority = null
        publish({ ...state, pendingSignature: null })
        return
      }
      const retryDelayMs = retryDelaysMs[retryIndex]
      if (retryDelayMs !== undefined) {
        retryIndex += 1
        timeoutHandle = host.setTimeout(build, Math.max(0, retryDelayMs))
        return
      }
      pendingPriority = null
      publish({ ...state, pendingSignature: null })
    }

    const handleBuildSuccess = (worlds: TWorlds, controller: AbortController) => {
      if (activeBuildController !== controller || disposed || requestedGeneration !== generation) {
        return
      }
      let completedSignature: string
      try {
        completedSignature = resolveSignature(input)
      } catch (error) {
        handleBuildFailure(error, controller)
        return
      }
      if (completedSignature !== signature) {
        if (!releaseActiveBuild(controller)) return
        request(input, priority)
        return
      }
      if (!releaseActiveBuild(controller)) return
      pendingPriority = null
      publish({
        generation: requestedGeneration,
        pendingSignature: null,
        ready: true,
        signature,
        worlds,
      })
    }

    function build() {
      timeoutHandle = null
      idleHandle = null
      if (disposed || requestedGeneration !== generation) return
      const controller = new AbortController()
      activeBuildController = controller
      try {
        const result = compile(input, controller.signal)
        if (
          activeBuildController !== controller ||
          disposed ||
          requestedGeneration !== generation
        ) {
          if (isPromiseLike(result)) consumeStaleBuildResult(result)
          return
        }
        if (isPromiseLike(result)) {
          const executionTimeoutHandle = host.setTimeout(
            () => {
              if (executionTimeoutHandles.get(controller) !== executionTimeoutHandle) return
              executionTimeoutHandles.delete(controller)
              if (activeBuildController !== controller) return
              controller.abort()
              handleBuildFailure(
                createCollisionWorldBuildTimeoutError(executionTimeoutMs),
                controller,
              )
            },
            Math.max(0, executionTimeoutMs),
          )
          executionTimeoutHandles.set(controller, executionTimeoutHandle)
          void Promise.resolve(result).then(
            (worlds) => handleBuildSuccess(worlds, controller),
            (error) => handleBuildFailure(error, controller),
          )
          return
        }
        handleBuildSuccess(result, controller)
      } catch (error) {
        handleBuildFailure(error, controller)
      }
    }

    const debounceMs = priority === 'background' ? Math.max(0, backgroundDebounceMs) : 0
    timeoutHandle = host.setTimeout(() => {
      timeoutHandle = null
      if (disposed || requestedGeneration !== generation) return
      if (
        priority === 'background' &&
        host.requestIdleCallback !== undefined &&
        host.cancelIdleCallback !== undefined
      ) {
        idleHandle = host.requestIdleCallback(build, { timeout: Math.max(0, idleTimeoutMs) })
        return
      }
      build()
    }, debounceMs)
  }

  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      generation += 1
      cancelScheduledBuild()
      abortActiveBuild()
    },
    getState: () => state,
    request,
  }
}

function createCollisionWorldBuildTimeoutError(timeoutMs: number) {
  const error = new Error(
    `Collision-world compilation did not settle within ${String(Math.max(0, timeoutMs))}ms.`,
  )
  error.name = 'TimeoutError'
  return error
}

function isAbortError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function isTimeoutError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'TimeoutError'
  )
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    (typeof value === 'object' && value !== null && 'then' in value) ||
    (typeof value === 'function' && 'then' in value)
  )
}

function consumeStaleBuildResult<T>(result: PromiseLike<T>) {
  void Promise.resolve(result).catch(() => undefined)
}

export function createBrowserLandrushZombieEscapeCollisionWorldBuildScheduleHost(): LandrushZombieEscapeCollisionWorldBuildScheduleHost {
  const browserWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void
    requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
  }
  const host: LandrushZombieEscapeCollisionWorldBuildScheduleHost = {
    clearTimeout: (handle) => browserWindow.clearTimeout(handle),
    setTimeout: (callback, timeoutMs) => browserWindow.setTimeout(callback, timeoutMs),
  }
  if (browserWindow.requestIdleCallback && browserWindow.cancelIdleCallback) {
    host.requestIdleCallback = (callback, options) =>
      browserWindow.requestIdleCallback!(callback, options)
    host.cancelIdleCallback = (handle) => browserWindow.cancelIdleCallback!(handle)
  }
  return host
}
