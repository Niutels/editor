export type DisposableGpuResource = {
  dispose: () => void
}

type GpuResourceQueue = {
  onSubmittedWorkDone?: () => Promise<void>
}

export type GpuResourceRenderer = {
  backend?: {
    device?: {
      queue?: GpuResourceQueue
    }
  }
}

export type GpuResourceDisposalScheduler = (callback: () => void | Promise<void>) => () => void

type GpuResourceLifetimeEntry = {
  cancelPendingDisposal: (() => void) | null
  generation: number
  retainCount: number
  renderers: Set<GpuResourceRenderer>
}

export type GpuResourceLifetimeManager = ReturnType<typeof createGpuResourceLifetimeManager>

type GpuResourceLifetimeGlobal = {
  __PASCAL_GPU_RESOURCE_LIFETIME_MANAGER__?: GpuResourceLifetimeManager
}

export function scheduleGpuResourceDisposal(callback: () => void | Promise<void>): () => void {
  let cancelled = false
  if (typeof requestAnimationFrame !== 'function') {
    queueMicrotask(() => {
      if (!cancelled) void callback()
    })
    return () => {
      cancelled = true
    }
  }

  let secondFrame: number | null = null
  const firstFrame = requestAnimationFrame(() => {
    if (cancelled) return
    secondFrame = requestAnimationFrame(() => {
      if (!cancelled) void callback()
    })
  })
  return () => {
    cancelled = true
    if (typeof cancelAnimationFrame !== 'function') return
    cancelAnimationFrame(firstFrame)
    if (secondFrame !== null) cancelAnimationFrame(secondFrame)
  }
}

export function createGpuResourceLifetimeManager(
  scheduleDisposal: GpuResourceDisposalScheduler = scheduleGpuResourceDisposal,
) {
  const entries = new WeakMap<DisposableGpuResource, GpuResourceLifetimeEntry>()

  return {
    retain(
      resource: DisposableGpuResource | null | undefined,
      renderer?: GpuResourceRenderer | null,
    ) {
      if (!resource) return () => undefined

      let entry = entries.get(resource)
      if (!entry) {
        entry = {
          cancelPendingDisposal: null,
          generation: 0,
          retainCount: 0,
          renderers: new Set(),
        }
        entries.set(resource, entry)
      }

      entry.cancelPendingDisposal?.()
      entry.cancelPendingDisposal = null
      entry.generation += 1
      entry.retainCount += 1
      if (renderer) entry.renderers.add(renderer)

      let released = false
      return () => {
        if (released) return
        released = true
        entry!.retainCount = Math.max(0, entry!.retainCount - 1)
        if (entry!.retainCount > 0) return

        const releaseGeneration = entry!.generation
        entry!.cancelPendingDisposal = scheduleDisposal(async () => {
          entry!.cancelPendingDisposal = null
          if (entry!.retainCount > 0 || entry!.generation !== releaseGeneration) return

          await settleGpuResourceRendererQueues(entry!.renderers)
          if (entry!.retainCount > 0 || entry!.generation !== releaseGeneration) return

          entries.delete(resource)
          resource.dispose()
        })
      }
    },
  }
}

async function settleGpuResourceRendererQueues(renderers: ReadonlySet<GpuResourceRenderer>) {
  const queues = new Set<GpuResourceQueue>()
  for (const renderer of renderers) {
    const queue = renderer.backend?.device?.queue
    if (queue?.onSubmittedWorkDone) queues.add(queue)
  }

  await Promise.all(
    [...queues].map(async (queue) => {
      try {
        await queue.onSubmittedWorkDone?.()
      } catch {
        // A lost renderer cannot submit more work with this resource; cleanup still owns disposal.
      }
    }),
  )
}

export function getGlobalGpuResourceLifetimeManager(scope: object) {
  const lifetimeGlobal = scope as GpuResourceLifetimeGlobal
  lifetimeGlobal.__PASCAL_GPU_RESOURCE_LIFETIME_MANAGER__ ??= createGpuResourceLifetimeManager()
  return lifetimeGlobal.__PASCAL_GPU_RESOURCE_LIFETIME_MANAGER__
}

export const gpuResourceLifetimeManager = getGlobalGpuResourceLifetimeManager(globalThis)
