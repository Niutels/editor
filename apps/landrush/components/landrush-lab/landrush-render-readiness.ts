import type { Camera, Object3D, Scene } from 'three'

export const LANDRUSH_RENDER_READINESS_TIMEOUT_MS = 15_000

export type LandrushPipelineRenderer = Readonly<{
  backend?: Readonly<{ device?: unknown; gl?: unknown }>
  compileAsync: (root: Object3D, camera: Camera, targetScene: Scene) => Promise<unknown>
  getContext?: () => unknown
  init?: () => Promise<unknown> | unknown
  isWebGPURenderer?: boolean
}>

export type LandrushRenderRepresentative = Readonly<{
  key: string
  root: Object3D
}>

export type LandrushRenderReadinessStatus =
  | Readonly<{ state: 'ready' }>
  | Readonly<{ message: string; state: 'degraded' }>
  | Readonly<{ message: string; state: 'failed' }>

export type LandrushRenderReadinessProgress = Readonly<{
  completed: number
  total: number
}>

export type LandrushRenderReadinessRequest = Readonly<{
  camera: Camera
  generation: number
  identity: object
  representatives: readonly LandrushRenderRepresentative[]
  renderer: LandrushPipelineRenderer
  targetScene: Scene
}>

export type LandrushRenderReadinessCoordinator = Readonly<{
  dispose: () => void
  invalidate: () => void
  request: (
    request: LandrushRenderReadinessRequest,
    onStatus: (status: LandrushRenderReadinessStatus) => void,
    onProgress?: (progress: LandrushRenderReadinessProgress) => void,
  ) => Promise<'failed' | 'ready' | 'stale'>
}>

export type LandrushRenderReadinessTimer = Readonly<{
  clear: (handle: unknown) => void
  schedule: (callback: () => void, delayMs: number) => unknown
}>

type FlagSnapshot = Readonly<{
  frustumCulled: boolean
  object: Object3D
  visible: boolean
}>

type RenderReadinessCoordinatorEntry = {
  callbacks: Set<(status: LandrushRenderReadinessStatus) => void>
  clearWatchdog: () => void
  context: unknown
  progress?: LandrushRenderReadinessProgress
  progressCallbacks: Set<(progress: LandrushRenderReadinessProgress) => void>
  promise: Promise<'failed' | 'ready' | 'stale'>
  request: LandrushRenderReadinessRequest
  sequence: number
  status?: LandrushRenderReadinessStatus
}

const RENDER_READINESS_COMPILE_TAILS = new WeakMap<object, Promise<void>>()

export async function compileLandrushRenderRepresentatives(
  {
    camera,
    representatives,
    renderer,
    targetScene,
  }: Omit<LandrushRenderReadinessRequest, 'generation' | 'identity'>,
  onProgress?: (progress: LandrushRenderReadinessProgress) => void,
) {
  const total = representatives.length
  let completed = 0
  onProgress?.({ completed, total })
  await renderer.init?.()

  for (const representative of representatives) {
    let pendingCompilation: Promise<unknown>
    const restore = forceLandrushRepresentativeRenderable(representative.root)
    try {
      pendingCompilation = renderer.compileAsync(representative.root, camera, targetScene)
    } finally {
      restore()
    }
    await pendingCompilation
    completed += 1
    onProgress?.({ completed, total })
  }
}

export function createLandrushRenderReadinessCoordinator({
  compile = compileLandrushRenderRepresentatives,
  formatTimeoutMessage = formatLandrushRenderReadinessTimeoutMessage,
  timeoutMs = LANDRUSH_RENDER_READINESS_TIMEOUT_MS,
  timer = DEFAULT_RENDER_READINESS_TIMER,
}: {
  compile?: typeof compileLandrushRenderRepresentatives
  formatTimeoutMessage?: (timeoutMs: number) => string
  timeoutMs?: number
  timer?: LandrushRenderReadinessTimer
} = {}): LandrushRenderReadinessCoordinator {
  let disposed = false
  let current: RenderReadinessCoordinatorEntry | undefined
  let sequence = 0
  let tail = Promise.resolve()

  const invalidate = () => {
    sequence += 1
    current?.clearWatchdog()
    current?.callbacks.clear()
    current?.progressCallbacks.clear()
    current = undefined
  }

  return {
    dispose() {
      disposed = true
      invalidate()
    },
    invalidate,
    request(request, onStatus, onProgress) {
      if (disposed) return Promise.resolve('stale')
      const context = getLandrushRendererContext(request.renderer)
      if (
        current &&
        current.request.generation === request.generation &&
        current.request.identity === request.identity &&
        current.request.renderer === request.renderer &&
        current.request.camera === request.camera &&
        current.request.targetScene === request.targetScene &&
        current.context === context
      ) {
        const entry = current
        if (entry.progress && onProgress && !entry.progressCallbacks.has(onProgress)) {
          onProgress(entry.progress)
        }
        if (!isLandrushRenderReadinessRequestCurrent(entry, current, disposed)) {
          return entry.promise
        }
        if (entry.status) onStatus(entry.status)
        if (
          isLandrushRenderReadinessRequestCurrent(entry, current, disposed) &&
          (!entry.status || entry.status.state === 'degraded')
        ) {
          entry.callbacks.add(onStatus)
          if (onProgress) entry.progressCallbacks.add(onProgress)
        }
        return entry.promise
      }

      sequence += 1
      current?.clearWatchdog()
      current?.callbacks.clear()
      current?.progressCallbacks.clear()
      const entry: RenderReadinessCoordinatorEntry = {
        callbacks: new Set([onStatus]),
        clearWatchdog: () => undefined,
        context,
        progressCallbacks: new Set(onProgress ? [onProgress] : []),
        promise: Promise.resolve<'stale'>('stale'),
        request,
        sequence,
      }
      current = entry
      entry.clearWatchdog = scheduleLandrushRenderReadinessTimeout(
        () => {
          if (!isLandrushRenderReadinessRequestCurrent(entry, current, disposed)) return
          publishLandrushRenderReadinessStatus(
            entry,
            {
              message: formatTimeoutMessage(Math.max(1, Math.trunc(timeoutMs))),
              state: 'degraded',
            },
            false,
          )
        },
        timeoutMs,
        timer,
      )
      const contextKey = getLandrushRendererCompileTailKey(request.renderer)
      const previousContextTail = RENDER_READINESS_COMPILE_TAILS.get(contextKey)
      const admissionTail =
        previousContextTail && previousContextTail !== tail
          ? Promise.all([tail, previousContextTail]).then(() => undefined)
          : tail
      const run = admissionTail.then(async (): Promise<'failed' | 'ready' | 'stale'> => {
        if (!isLandrushRenderReadinessRequestCurrent(entry, current, disposed)) {
          entry.clearWatchdog()
          entry.callbacks.clear()
          entry.progressCallbacks.clear()
          return 'stale'
        }
        try {
          await Promise.resolve().then(() =>
            compile(request, (progress) => {
              if (
                !isLandrushRenderReadinessRequestCurrent(entry, current, disposed) ||
                (entry.status && entry.status.state !== 'degraded')
              ) {
                return
              }
              publishLandrushRenderReadinessProgress(entry, progress)
            }),
          )
        } catch (error) {
          if (!isLandrushRenderReadinessRequestCurrent(entry, current, disposed)) {
            entry.callbacks.clear()
            entry.progressCallbacks.clear()
            return 'stale'
          }
          const message = error instanceof Error ? error.message : String(error)
          publishLandrushRenderReadinessStatus(
            entry,
            {
              message,
              state: 'failed',
            },
            true,
          )
          return 'failed'
        } finally {
          entry.clearWatchdog()
        }
        if (!isLandrushRenderReadinessRequestCurrent(entry, current, disposed)) {
          entry.callbacks.clear()
          entry.progressCallbacks.clear()
          return 'stale'
        }
        publishLandrushRenderReadinessStatus(entry, { state: 'ready' }, true)
        return 'ready'
      })
      entry.promise = run
      const settledTail = run.then(
        () => undefined,
        () => undefined,
      )
      tail = settledTail
      RENDER_READINESS_COMPILE_TAILS.set(contextKey, settledTail)
      void settledTail.then(() => {
        if (RENDER_READINESS_COMPILE_TAILS.get(contextKey) === settledTail) {
          RENDER_READINESS_COMPILE_TAILS.delete(contextKey)
        }
      })
      return run
    },
  }
}

const DEFAULT_RENDER_READINESS_TIMER: LandrushRenderReadinessTimer = {
  clear(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
  },
  schedule(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs)
  },
}

function formatLandrushRenderReadinessTimeoutMessage(timeoutMs: number) {
  return `Landrush render readiness timed out after ${String(timeoutMs)}ms.`
}

function scheduleLandrushRenderReadinessTimeout(
  onTimeout: () => void,
  timeoutMs: number,
  timer: LandrushRenderReadinessTimer,
) {
  const boundedTimeoutMs = Math.max(1, Math.trunc(timeoutMs))
  let active = true
  const timeoutHandle = timer.schedule(() => {
    if (!active) return
    active = false
    onTimeout()
  }, boundedTimeoutMs)
  return () => {
    if (!active) return
    active = false
    timer.clear(timeoutHandle)
  }
}

function publishLandrushRenderReadinessStatus(
  entry: RenderReadinessCoordinatorEntry,
  status: LandrushRenderReadinessStatus,
  settled: boolean,
) {
  entry.status = status
  for (const callback of entry.callbacks) callback(status)
  if (settled) {
    entry.callbacks.clear()
    entry.progressCallbacks.clear()
  }
}

function publishLandrushRenderReadinessProgress(
  entry: RenderReadinessCoordinatorEntry,
  progress: LandrushRenderReadinessProgress,
) {
  if (
    !Number.isSafeInteger(progress.completed) ||
    !Number.isSafeInteger(progress.total) ||
    progress.completed < 0 ||
    progress.total < progress.completed ||
    (entry.progress &&
      (entry.progress.total !== progress.total || progress.completed <= entry.progress.completed))
  ) {
    return
  }
  const snapshot = { completed: progress.completed, total: progress.total }
  entry.progress = snapshot
  for (const callback of entry.progressCallbacks) callback(snapshot)
}

function forceLandrushRepresentativeRenderable(root: Object3D) {
  const snapshots = new Map<Object3D, FlagSnapshot>()
  const force = (object: Object3D, renderable: boolean) => {
    if (!snapshots.has(object)) {
      snapshots.set(object, {
        frustumCulled: object.frustumCulled,
        object,
        visible: object.visible,
      })
    }
    object.visible = true
    if (renderable) object.frustumCulled = false
  }

  let ancestor: Object3D | null = root
  while (ancestor) {
    force(ancestor, isLandrushRenderableObject(ancestor))
    ancestor = ancestor.parent
  }
  root.traverse((object) => force(object, isLandrushRenderableObject(object)))

  return () => {
    for (const snapshot of Array.from(snapshots.values()).reverse()) {
      snapshot.object.visible = snapshot.visible
      snapshot.object.frustumCulled = snapshot.frustumCulled
    }
  }
}

function isLandrushRenderableObject(object: Object3D) {
  const renderable = object as Object3D & {
    isLine?: boolean
    isMesh?: boolean
    isPoints?: boolean
    isSprite?: boolean
  }
  return Boolean(
    renderable.isMesh || renderable.isLine || renderable.isPoints || renderable.isSprite,
  )
}

function getLandrushRendererContext(renderer: LandrushPipelineRenderer) {
  return renderer.backend?.device ?? renderer.backend?.gl ?? renderer.getContext?.() ?? renderer
}

function getLandrushRendererCompileTailKey(renderer: LandrushPipelineRenderer) {
  const context = getLandrushRendererContext(renderer)
  return isWeakMapKey(context) ? context : renderer
}

function isWeakMapKey(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function isLandrushRenderReadinessRequestCurrent(
  entry: Readonly<{
    context: unknown
    request: LandrushRenderReadinessRequest
    sequence: number
  }>,
  current:
    | Readonly<{
        context: unknown
        request: LandrushRenderReadinessRequest
        sequence: number
      }>
    | undefined,
  disposed: boolean,
) {
  return (
    !disposed &&
    current === entry &&
    current.sequence === entry.sequence &&
    getLandrushRendererContext(entry.request.renderer) === entry.context
  )
}
