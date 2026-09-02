import type { Box3, Camera, InstancedMesh, Object3D, Scene, Sphere } from 'three'
import { Matrix4 } from 'three'

export const LANDRUSH_RENDER_READINESS_TIMEOUT_MS = 15_000

export function clearLandrushRenderReadinessRoot(root: Object3D) {
  // Public teardown would overwrite Three's shared child payload during a live removal event.
  for (const child of root.children) {
    if (child.parent === root) child.parent = null
  }
  root.children.length = 0
}

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

export type LandrushPresentationPipelinePrewarmState = {
  pipelinePrewarmBeginCount?: number
  pipelinePrewarmCamera?: Camera
  pipelinePrewarmCameraMatched?: boolean
  pipelinePrewarmCallbackInstalled?: boolean
  pipelinePrewarmFailedRevision?: number
  pipelinePrewarmOnRenderSettled?: (revision: number, outcome: 'failed' | 'rendered') => void
  pipelinePrewarmPipelineAvailable?: boolean
  pipelinePrewarmPipelineError?: boolean
  pipelinePrewarmPostprocessCallbackCount?: number
  pipelinePrewarmPostprocessFrameCount?: number
  pipelinePrewarmRenderedCamera?: Camera
  pipelinePrewarmRenderPath?: 'direct' | 'presentation'
  pipelinePrewarmRenderedRevision?: number
  pipelinePrewarmRequestRevision?: number
}

export type LandrushPresentationPipelinePrewarmRequest = Readonly<{
  camera: Camera
  renderPath?: 'direct' | 'presentation'
  renderer: LandrushPipelineRenderer
  representatives: readonly LandrushRenderRepresentative[]
  targetScene: Scene
}>

type FlagSnapshot = Readonly<{
  frustumCulled: boolean
  instancedMeshBoundingBox: Readonly<{ object: Box3; value: Box3 }> | null
  instancedMeshBoundingSphere: Readonly<{ object: Sphere; value: Sphere }> | null
  instancedMeshCount: number | null
  instancedMeshMatrix0: Matrix4 | null
  object: Object3D
  visible: boolean
}>

const CONCEALED_INSTANCE_MATRIX = new Matrix4().makeTranslation(0, -1_000_000, 0)

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
const PRESENTATION_PIPELINE_PREWARM_COORDINATORS = new WeakMap<
  LandrushPipelineRenderer,
  PresentationPipelinePrewarmCoordinator
>()

type PresentationPipelinePrewarmBinding = Readonly<{
  invalidate: () => void
  scene: Scene
  state: LandrushPresentationPipelinePrewarmState
  token: object
}>

type PresentationPipelinePrewarmEntry = {
  camera: Camera
  reject: (reason: Error) => void
  representatives: readonly LandrushRenderRepresentative[]
  renderPath: 'direct' | 'presentation'
  resolve: () => void
  revision: number | null
  settled: boolean
  targetScene: Scene
}

type PresentationPipelinePrewarmActive = Readonly<{
  entry: PresentationPipelinePrewarmEntry
  restore: () => void
  revision: number
}>

type PresentationPipelinePrewarmCoordinator = {
  active?: PresentationPipelinePrewarmActive
  binding?: PresentationPipelinePrewarmBinding
  nextRevision: number
  queue: PresentationPipelinePrewarmEntry[]
}

export function registerLandrushPresentationPipelinePrewarm({
  invalidate,
  renderer,
  scene,
  state,
}: Readonly<{
  invalidate: () => void
  renderer: LandrushPipelineRenderer
  scene: Scene
  state: LandrushPresentationPipelinePrewarmState
}>) {
  const coordinator = getLandrushPresentationPipelinePrewarmCoordinator(renderer)
  const token = {}
  const previousBinding = coordinator.binding
  if (coordinator.active) {
    coordinator.active.restore()
    coordinator.queue.unshift(coordinator.active.entry)
    coordinator.active = undefined
  }
  if (previousBinding) {
    previousBinding.state.pipelinePrewarmRequestRevision = normalizeLandrushPipelineRevision(
      previousBinding.state.pipelinePrewarmRenderedRevision,
    )
  }
  coordinator.binding = { invalidate, scene, state, token }
  const onRenderSettled = (revision: number, outcome: 'failed' | 'rendered') => {
    const active = coordinator.active
    if (coordinator.binding?.token !== token || !active || active.revision !== revision) {
      return
    }
    const cameraMatched =
      state.pipelinePrewarmCameraMatched === true &&
      state.pipelinePrewarmRenderedCamera === active.entry.camera
    if (outcome === 'failed' || !cameraMatched) state.pipelinePrewarmFailedRevision = revision
    else state.pipelinePrewarmRenderedRevision = revision
    restoreLandrushPresentationPipelinePrewarmActive(coordinator, true)
  }
  state.pipelinePrewarmOnRenderSettled = onRenderSettled
  state.pipelinePrewarmCallbackInstalled = true
  if (coordinator.queue.length > 0) invalidate()

  return () => {
    if (coordinator.binding?.token !== token) return
    if (coordinator.active) {
      coordinator.active.restore()
      rejectLandrushPresentationPipelinePrewarmEntry(
        coordinator.active.entry,
        new Error('Landrush presentation pipeline prewarm was unmounted.'),
      )
      coordinator.active = undefined
    }
    for (const entry of coordinator.queue.splice(0)) {
      rejectLandrushPresentationPipelinePrewarmEntry(
        entry,
        new Error('Landrush presentation pipeline prewarm was unmounted.'),
      )
    }
    state.pipelinePrewarmRequestRevision = normalizeLandrushPipelineRevision(
      state.pipelinePrewarmRenderedRevision,
    )
    if (state.pipelinePrewarmOnRenderSettled === onRenderSettled) {
      state.pipelinePrewarmOnRenderSettled = undefined
      state.pipelinePrewarmCallbackInstalled = false
    }
    coordinator.binding = undefined
    PRESENTATION_PIPELINE_PREWARM_COORDINATORS.delete(renderer)
  }
}

export function requestLandrushPresentationPipelinePrewarm({
  camera,
  renderPath = 'presentation',
  renderer,
  representatives,
  targetScene,
}: LandrushPresentationPipelinePrewarmRequest) {
  const coordinator = PRESENTATION_PIPELINE_PREWARM_COORDINATORS.get(renderer)
  if (!coordinator?.binding) {
    return Promise.reject(new Error('Landrush presentation pipeline prewarm is not mounted.'))
  }

  return new Promise<void>((resolve, reject) => {
    coordinator.queue.push({
      camera,
      reject,
      representatives,
      renderPath,
      resolve,
      revision: null,
      settled: false,
      targetScene,
    })
    coordinator.binding?.invalidate()
  })
}

export function beginLandrushPresentationPipelinePrewarmFrame(renderer: LandrushPipelineRenderer) {
  const coordinator = PRESENTATION_PIPELINE_PREWARM_COORDINATORS.get(renderer)
  const binding = coordinator?.binding
  if (!(coordinator && binding)) return

  if (coordinator.active) {
    restoreLandrushPresentationPipelinePrewarmActive(coordinator, false)
  }

  let entry = coordinator.queue.shift()
  while (entry?.settled) entry = coordinator.queue.shift()
  if (!entry) return
  if (entry.targetScene !== binding.scene) {
    rejectLandrushPresentationPipelinePrewarmEntry(
      entry,
      new Error('Landrush presentation pipeline prewarm scene changed before rendering.'),
    )
    if (coordinator.queue.length > 0) binding.invalidate()
    return
  }

  const renderedRevision = normalizeLandrushPipelineRevision(
    binding.state.pipelinePrewarmRenderedRevision,
  )
  const currentRequestRevision = normalizeLandrushPipelineRevision(
    binding.state.pipelinePrewarmRequestRevision,
  )
  const revision =
    entry.revision && entry.revision > renderedRevision
      ? entry.revision
      : Math.max(coordinator.nextRevision, currentRequestRevision + 1, renderedRevision + 1)
  entry.revision = revision
  coordinator.nextRevision = revision + 1
  const previousCamera = binding.state.pipelinePrewarmCamera
  const previousRenderPath = binding.state.pipelinePrewarmRenderPath
  let restoreRepresentatives: () => void = () => undefined
  try {
    restoreRepresentatives = exposeLandrushRepresentativesForPresentationFrame(
      binding.scene,
      entry.representatives,
    )
    binding.state.pipelinePrewarmCamera = entry.camera
    binding.state.pipelinePrewarmRenderPath = entry.renderPath
    binding.state.pipelinePrewarmCameraMatched = false
    binding.state.pipelinePrewarmRenderedCamera = undefined
  } catch (error) {
    restoreRepresentatives()
    rejectLandrushPresentationPipelinePrewarmEntry(
      entry,
      error instanceof Error ? error : new Error(String(error)),
    )
    if (coordinator.queue.length > 0) binding.invalidate()
    return
  }
  const restore = () => {
    restoreRepresentatives()
    if (binding.state.pipelinePrewarmCamera === entry.camera) {
      binding.state.pipelinePrewarmCamera = previousCamera
    }
    if (binding.state.pipelinePrewarmRenderPath === entry.renderPath) {
      binding.state.pipelinePrewarmRenderPath = previousRenderPath
    }
  }
  coordinator.active = { entry, restore, revision }
  binding.state.pipelinePrewarmBeginCount =
    normalizeLandrushPipelineRevision(binding.state.pipelinePrewarmBeginCount) + 1
  binding.state.pipelinePrewarmRequestRevision = revision
}

export function completeLandrushPresentationPipelinePrewarmFrame(
  renderer: LandrushPipelineRenderer,
) {
  const coordinator = PRESENTATION_PIPELINE_PREWARM_COORDINATORS.get(renderer)
  if (!coordinator?.active) return
  restoreLandrushPresentationPipelinePrewarmActive(coordinator, true)
}

export function scheduleLandrushRenderReadinessCompilation<Value>({
  prerequisite = Promise.resolve(),
  renderer,
  run,
}: Readonly<{
  prerequisite?: Promise<void>
  renderer: LandrushPipelineRenderer
  run: () => Promise<Value>
}>) {
  const contextKey = getLandrushRendererCompileTailKey(renderer)
  const previousContextTail = RENDER_READINESS_COMPILE_TAILS.get(contextKey)
  const admissionTail =
    previousContextTail && previousContextTail !== prerequisite
      ? Promise.all([prerequisite, previousContextTail]).then(() => undefined)
      : prerequisite
  const result = admissionTail.then(run)
  const settledTail = result.then(
    () => undefined,
    () => undefined,
  )
  RENDER_READINESS_COMPILE_TAILS.set(contextKey, settledTail)
  void settledTail.then(() => {
    if (RENDER_READINESS_COMPILE_TAILS.get(contextKey) === settledTail) {
      RENDER_READINESS_COMPILE_TAILS.delete(contextKey)
    }
  })
  return result
}

type LandrushRenderReadinessTraceState = {
  activeRenderRepresentative?: string | null
  renderReadiness?: Array<{
    durationMs?: number
    edge: 'settled' | 'start'
    key: string
    outcome?: 'failed' | 'ready'
    stats?: LandrushRenderReadinessRepresentativeStats
    t: number
  }>
  startedAt?: number
}

type LandrushRenderReadinessTraceScope = Readonly<{
  key: string
  startedAt: number
  state: LandrushRenderReadinessTraceState
}>

type LandrushRenderReadinessRepresentativeStats = Readonly<{
  geometryCount: number
  materialSlotCount: number
  meshCount: number
  objectCount: number
  renderableCount: number
  skinnedMeshCount: number
  uniqueMaterialCount: number
}>

type LandrushGpuValidationDevice = Readonly<{
  addEventListener?: (type: 'uncapturederror', listener: (event: unknown) => void) => void
  popErrorScope?: () => Promise<unknown | null>
  pushErrorScope?: (filter: 'validation') => void
  removeEventListener?: (type: 'uncapturederror', listener: (event: unknown) => void) => void
}>

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
  if (renderer.init) await initializeLandrushRenderReadinessRenderer(renderer)

  for (const representative of representatives) {
    await compileLandrushRenderRepresentative({ camera, renderer, representative, targetScene })
    completed += 1
    onProgress?.({ completed, total })
  }
}

export async function initializeLandrushRenderReadinessRenderer(
  renderer: LandrushPipelineRenderer,
) {
  if (!renderer.init) return
  const trace = beginLandrushRenderReadinessTrace('@renderer-init')
  let outcome: 'failed' | 'ready' = 'ready'
  try {
    await renderer.init()
  } catch (error) {
    outcome = 'failed'
    throw error
  } finally {
    settleLandrushRenderReadinessTrace(trace, outcome)
  }
}

export async function compileLandrushRenderRepresentative({
  camera,
  renderer,
  representative,
  targetScene,
}: Readonly<{
  camera: Camera
  renderer: LandrushPipelineRenderer
  representative: LandrushRenderRepresentative
  targetScene: Scene
}>) {
  const trace = beginLandrushRenderReadinessTrace(representative.key, representative.root)
  let outcome: 'failed' | 'ready' = 'ready'
  try {
    await validateLandrushGpuCompilation(renderer, () => {
      const restore = forceLandrushRepresentativeRenderable(representative.root)
      try {
        return renderer.compileAsync(representative.root, camera, targetScene)
      } finally {
        restore()
      }
    })
  } catch (error) {
    outcome = 'failed'
    throw error
  } finally {
    settleLandrushRenderReadinessTrace(trace, outcome)
  }
}

async function validateLandrushGpuCompilation(
  renderer: LandrushPipelineRenderer,
  compile: () => Promise<unknown>,
) {
  const device = renderer.backend?.device as LandrushGpuValidationDevice | undefined
  if (!device) {
    await compile()
    return
  }

  let uncapturedError: unknown
  const onUncapturedError = (event: unknown) => {
    uncapturedError ??= readLandrushGpuValidationEventError(event)
  }
  device.addEventListener?.('uncapturederror', onUncapturedError)
  const supportsErrorScope = Boolean(device.pushErrorScope && device.popErrorScope)
  let errorScopePending = false
  try {
    if (supportsErrorScope) {
      device.pushErrorScope?.('validation')
      errorScopePending = true
    }
    await compile()
    const scopedError = errorScopePending ? await device.popErrorScope?.() : null
    errorScopePending = false
    const validationError = uncapturedError ?? scopedError
    if (validationError) {
      throw new Error(
        `Landrush WebGPU compilation failed validation: ${readLandrushGpuValidationMessage(validationError)}`,
      )
    }
  } finally {
    if (errorScopePending) {
      try {
        await device.popErrorScope?.()
      } catch {
        // Preserve the original compile failure.
      }
    }
    device.removeEventListener?.('uncapturederror', onUncapturedError)
  }
}

function readLandrushGpuValidationEventError(event: unknown) {
  if (event && typeof event === 'object' && 'error' in event) {
    return (event as Readonly<{ error?: unknown }>).error ?? event
  }
  return event
}

function readLandrushGpuValidationMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as Readonly<{ message?: unknown }>).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

function beginLandrushRenderReadinessTrace(
  key: string,
  root?: Object3D,
): LandrushRenderReadinessTraceScope | null {
  const state = (
    globalThis as typeof globalThis & {
      __LANDRUSH_ATOMIC_STARTUP__?: LandrushRenderReadinessTraceState
    }
  ).__LANDRUSH_ATOMIC_STARTUP__
  if (!state?.renderReadiness) return null
  const startedAt = performance.now()
  state.activeRenderRepresentative = key
  state.renderReadiness.push({
    edge: 'start',
    key,
    stats: root ? readLandrushRenderReadinessRepresentativeStats(root) : undefined,
    t: startedAt - (state.startedAt ?? 0),
  })
  return { key, startedAt, state }
}

function readLandrushRenderReadinessRepresentativeStats(
  root: Object3D,
): LandrushRenderReadinessRepresentativeStats {
  const geometries = new Set<unknown>()
  const materials = new Set<unknown>()
  let materialSlotCount = 0
  let meshCount = 0
  let objectCount = 0
  let renderableCount = 0
  let skinnedMeshCount = 0
  root.traverse((object) => {
    objectCount += 1
    if (isLandrushRenderableObject(object)) renderableCount += 1
    const mesh = object as Object3D & {
      geometry?: unknown
      isMesh?: boolean
      isSkinnedMesh?: boolean
      material?: unknown | unknown[]
    }
    if (!mesh.isMesh) return
    meshCount += 1
    if (mesh.isSkinnedMesh) skinnedMeshCount += 1
    if (mesh.geometry) geometries.add(mesh.geometry)
    const assignedMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of assignedMaterials) {
      if (!material) continue
      materialSlotCount += 1
      materials.add(material)
    }
  })
  return {
    geometryCount: geometries.size,
    materialSlotCount,
    meshCount,
    objectCount,
    renderableCount,
    skinnedMeshCount,
    uniqueMaterialCount: materials.size,
  }
}

function settleLandrushRenderReadinessTrace(
  trace: LandrushRenderReadinessTraceScope | null,
  outcome: 'failed' | 'ready',
) {
  if (!trace) return
  const settledAt = performance.now()
  trace.state.renderReadiness?.push({
    durationMs: settledAt - trace.startedAt,
    edge: 'settled',
    key: trace.key,
    outcome,
    t: settledAt - (trace.state.startedAt ?? 0),
  })
  if (trace.state.activeRenderRepresentative === trace.key) {
    trace.state.activeRenderRepresentative = null
  }
}

export function createLandrushRenderReadinessCoordinator({
  compile = compileLandrushRenderRepresentatives,
  formatTimeoutMessage = formatLandrushRenderReadinessTimeoutMessage,
  timeoutMs = LANDRUSH_RENDER_READINESS_TIMEOUT_MS,
  timer = DEFAULT_RENDER_READINESS_TIMER,
  watchdogStartsOnAdmission = false,
}: {
  compile?: typeof compileLandrushRenderRepresentatives
  formatTimeoutMessage?: (timeoutMs: number) => string
  timeoutMs?: number
  timer?: LandrushRenderReadinessTimer
  watchdogStartsOnAdmission?: boolean
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
      const armWatchdog = () => {
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
      }
      if (!watchdogStartsOnAdmission) armWatchdog()
      const run = scheduleLandrushRenderReadinessCompilation({
        prerequisite: tail,
        renderer: request.renderer,
        run: async (): Promise<'failed' | 'ready' | 'stale'> => {
          if (!isLandrushRenderReadinessRequestCurrent(entry, current, disposed)) {
            entry.clearWatchdog()
            entry.callbacks.clear()
            entry.progressCallbacks.clear()
            return 'stale'
          }
          if (watchdogStartsOnAdmission) armWatchdog()
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
        },
      })
      entry.promise = run
      const settledTail = run.then(
        () => undefined,
        () => undefined,
      )
      tail = settledTail
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

function getLandrushPresentationPipelinePrewarmCoordinator(renderer: LandrushPipelineRenderer) {
  let coordinator = PRESENTATION_PIPELINE_PREWARM_COORDINATORS.get(renderer)
  if (!coordinator) {
    coordinator = { nextRevision: 1, queue: [] }
    PRESENTATION_PIPELINE_PREWARM_COORDINATORS.set(renderer, coordinator)
  }
  return coordinator
}

function restoreLandrushPresentationPipelinePrewarmActive(
  coordinator: PresentationPipelinePrewarmCoordinator,
  allowCompletion: boolean,
) {
  const active = coordinator.active
  const binding = coordinator.binding
  if (!(active && binding)) return
  active.restore()
  coordinator.active = undefined
  const renderedRevision = normalizeLandrushPipelineRevision(
    binding.state.pipelinePrewarmRenderedRevision,
  )
  const failedRevision = normalizeLandrushPipelineRevision(
    binding.state.pipelinePrewarmFailedRevision,
  )
  if (allowCompletion && failedRevision >= active.revision) {
    binding.state.pipelinePrewarmRequestRevision = renderedRevision
    rejectLandrushPresentationPipelinePrewarmEntry(
      active.entry,
      new Error('Landrush presentation pipeline prewarm render failed.'),
    )
  } else if (allowCompletion && renderedRevision >= active.revision) {
    resolveLandrushPresentationPipelinePrewarmEntry(active.entry)
  } else if (!active.entry.settled) {
    coordinator.queue.unshift(active.entry)
  }
  if (coordinator.queue.length > 0) binding.invalidate()
}

function resolveLandrushPresentationPipelinePrewarmEntry(entry: PresentationPipelinePrewarmEntry) {
  if (entry.settled) return
  entry.settled = true
  entry.resolve()
}

function rejectLandrushPresentationPipelinePrewarmEntry(
  entry: PresentationPipelinePrewarmEntry,
  reason: Error,
) {
  if (entry.settled) return
  entry.settled = true
  entry.reject(reason)
}

function normalizeLandrushPipelineRevision(revision: number | undefined) {
  return Number.isSafeInteger(revision) && (revision ?? -1) >= 0 ? (revision as number) : 0
}

function forceLandrushRepresentativeRenderable(root: Object3D) {
  return forceLandrushRepresentativesRenderable([{ key: '', root }], root)
}

function exposeLandrushRepresentativesForPresentationFrame(
  scene: Scene,
  representatives: readonly LandrushRenderRepresentative[],
) {
  const attachedRoots: Object3D[] = []
  const attachedRootSet = new Set<Object3D>()
  try {
    for (const { root } of representatives) {
      let top = root
      while (top.parent) top = top.parent
      if (top === scene || attachedRootSet.has(top)) continue
      if ((top as Scene).isScene === true) {
        throw new Error('Landrush presentation pipeline representative belongs to another scene.')
      }
      if (scene.children.includes(top)) {
        throw new Error('Landrush presentation pipeline representative has an inconsistent parent.')
      }
      attachedRootSet.add(top)
      attachedRoots.push(top)
      // These are synthetic readiness trees. A raw temporary attachment keeps
      // world observers from treating the one-frame probe as authored content.
      scene.children.push(top)
      top.parent = scene
    }
    const restoreFlags = forceLandrushRepresentativesRenderable(representatives, scene)
    return () => {
      restoreFlags()
      for (let index = attachedRoots.length - 1; index >= 0; index -= 1) {
        const root = attachedRoots[index]!
        if (root.parent !== scene) continue
        const childIndex = scene.children.indexOf(root)
        if (childIndex >= 0) scene.children.splice(childIndex, 1)
        root.parent = null
      }
    }
  } catch (error) {
    for (let index = attachedRoots.length - 1; index >= 0; index -= 1) {
      const root = attachedRoots[index]!
      if (root.parent !== scene) continue
      const childIndex = scene.children.indexOf(root)
      if (childIndex >= 0) scene.children.splice(childIndex, 1)
      root.parent = null
    }
    throw error
  }
}

function forceLandrushRepresentativesRenderable(
  representatives: readonly LandrushRenderRepresentative[],
  lightScopeRoot: Object3D,
) {
  const representedLights = new Set<Object3D>()
  for (const { root } of representatives) {
    root.traverse((object) => {
      if (isLandrushLight(object)) representedLights.add(object)
    })
  }
  const snapshots = new Map<Object3D, FlagSnapshot>()
  const snapshot = (object: Object3D) => {
    const instancedMesh = object as InstancedMesh
    if (!snapshots.has(object)) {
      const snapshotInstancedMeshBounds =
        instancedMesh.isInstancedMesh === true && instancedMesh.count === 0
      const instancedMeshBoundingBox =
        snapshotInstancedMeshBounds && instancedMesh.boundingBox
          ? { object: instancedMesh.boundingBox, value: instancedMesh.boundingBox.clone() }
          : null
      const instancedMeshBoundingSphere =
        snapshotInstancedMeshBounds && instancedMesh.boundingSphere
          ? { object: instancedMesh.boundingSphere, value: instancedMesh.boundingSphere.clone() }
          : null
      const instancedMeshMatrix0 =
        snapshotInstancedMeshBounds && instancedMesh.instanceMatrix.count > 0 ? new Matrix4() : null
      if (instancedMeshMatrix0) instancedMesh.getMatrixAt(0, instancedMeshMatrix0)
      snapshots.set(object, {
        frustumCulled: object.frustumCulled,
        instancedMeshBoundingBox,
        instancedMeshBoundingSphere,
        instancedMeshCount: instancedMesh.isInstancedMesh === true ? instancedMesh.count : null,
        instancedMeshMatrix0,
        object,
        visible: object.visible,
      })
    }
  }
  const force = (object: Object3D, renderable: boolean) => {
    const instancedMesh = object as InstancedMesh
    const light = object as Object3D & { isLight?: boolean }
    snapshot(object)
    if (light.isLight !== true || representedLights.has(object)) object.visible = true
    if (renderable) {
      object.frustumCulled = false
      if (
        instancedMesh.isInstancedMesh === true &&
        instancedMesh.count === 0 &&
        instancedMesh.instanceMatrix.count > 0
      ) {
        instancedMesh.setMatrixAt(0, CONCEALED_INSTANCE_MATRIX)
        instancedMesh.instanceMatrix.needsUpdate = true
        instancedMesh.count = 1
      }
    }
  }
  const effectivelyHiddenLights: Object3D[] = []
  lightScopeRoot.traverse((object) => {
    if (
      isLandrushLight(object) &&
      !representedLights.has(object) &&
      !isLandrushObjectEffectivelyVisible(object)
    ) {
      effectivelyHiddenLights.push(object)
    }
  })

  for (const { root } of representatives) {
    let ancestor: Object3D | null = root
    while (ancestor) {
      force(ancestor, isLandrushRenderableObject(ancestor))
      ancestor = ancestor.parent
    }
    root.traverse((object) => force(object, isLandrushRenderableObject(object)))
  }
  for (const light of effectivelyHiddenLights) {
    snapshot(light)
    light.visible = false
  }

  return () => {
    for (const snapshot of Array.from(snapshots.values()).reverse()) {
      snapshot.object.visible = snapshot.visible
      snapshot.object.frustumCulled = snapshot.frustumCulled
      if (snapshot.instancedMeshCount !== null) {
        const instancedMesh = snapshot.object as InstancedMesh
        if (snapshot.instancedMeshMatrix0) {
          instancedMesh.setMatrixAt(0, snapshot.instancedMeshMatrix0)
          instancedMesh.instanceMatrix.needsUpdate = true
        }
        instancedMesh.count = snapshot.instancedMeshCount
        if (snapshot.instancedMeshCount === 0) {
          if (snapshot.instancedMeshBoundingBox) {
            snapshot.instancedMeshBoundingBox.object.copy(snapshot.instancedMeshBoundingBox.value)
            instancedMesh.boundingBox = snapshot.instancedMeshBoundingBox.object
          } else {
            instancedMesh.boundingBox = null
          }
          if (snapshot.instancedMeshBoundingSphere) {
            snapshot.instancedMeshBoundingSphere.object.copy(
              snapshot.instancedMeshBoundingSphere.value,
            )
            instancedMesh.boundingSphere = snapshot.instancedMeshBoundingSphere.object
          } else {
            instancedMesh.boundingSphere = null
          }
        }
      }
    }
  }
}

function isLandrushLight(object: Object3D) {
  return (object as Object3D & { isLight?: boolean }).isLight === true
}

function isLandrushObjectEffectivelyVisible(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
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
