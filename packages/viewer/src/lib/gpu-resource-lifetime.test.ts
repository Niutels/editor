import { describe, expect, test } from 'bun:test'
import {
  createGpuResourceLifetimeManager,
  type GpuResourceDisposalScheduler,
  getGlobalGpuResourceLifetimeManager,
} from './gpu-resource-lifetime'

function createControlledDisposalScheduler() {
  const pending = new Set<() => void | Promise<void>>()
  const schedule: GpuResourceDisposalScheduler = (callback) => {
    pending.add(callback)
    return () => {
      pending.delete(callback)
    }
  }
  return {
    async flush() {
      const callbacks = [...pending]
      pending.clear()
      await Promise.all(callbacks.map((callback) => callback()))
    },
    pending,
    schedule,
  }
}

describe('gpu resource lifetime', () => {
  test('keeps the default manager stable across module refreshes', () => {
    const scope = {}

    expect(getGlobalGpuResourceLifetimeManager(scope)).toBe(
      getGlobalGpuResourceLifetimeManager(scope),
    )
  })

  test('cancels Strict Mode retirement when the same resource is retained again', async () => {
    const scheduler = createControlledDisposalScheduler()
    const manager = createGpuResourceLifetimeManager(scheduler.schedule)
    let disposals = 0
    const resource = { dispose: () => disposals++ }

    const releaseFirstMount = manager.retain(resource)
    releaseFirstMount()
    const releaseReplayMount = manager.retain(resource)

    await scheduler.flush()
    expect(disposals).toBe(0)

    releaseReplayMount()
    await scheduler.flush()
    expect(disposals).toBe(1)
  })

  test('waits for every renderer queue before disposing once', async () => {
    const scheduler = createControlledDisposalScheduler()
    const manager = createGpuResourceLifetimeManager(scheduler.schedule)
    const fenceResolvers: Array<() => void> = []
    const renderer = () => ({
      backend: {
        device: {
          queue: {
            onSubmittedWorkDone: () =>
              new Promise<void>((resolve) => {
                fenceResolvers.push(resolve)
              }),
          },
        },
      },
    })
    let disposals = 0
    const resource = { dispose: () => disposals++ }
    const releaseFirst = manager.retain(resource, renderer())
    const releaseSecond = manager.retain(resource, renderer())

    releaseFirst()
    releaseSecond()
    const flushing = scheduler.flush()
    await Promise.resolve()
    expect(fenceResolvers).toHaveLength(2)
    expect(disposals).toBe(0)

    for (const resolve of fenceResolvers) resolve()
    await flushing
    expect(disposals).toBe(1)
  })

  test('does not dispose when retained again while a queue fence is pending', async () => {
    const scheduler = createControlledDisposalScheduler()
    const manager = createGpuResourceLifetimeManager(scheduler.schedule)
    let resolveFence = () => undefined
    const renderer = {
      backend: {
        device: {
          queue: {
            onSubmittedWorkDone: () =>
              new Promise<void>((resolve) => {
                resolveFence = resolve
              }),
          },
        },
      },
    }
    let disposals = 0
    const resource = { dispose: () => disposals++ }
    const release = manager.retain(resource, renderer)
    release()
    const flushing = scheduler.flush()
    await Promise.resolve()

    const releaseNext = manager.retain(resource, renderer)
    resolveFence()
    await flushing
    expect(disposals).toBe(0)

    releaseNext()
    const finalFlush = scheduler.flush()
    await Promise.resolve()
    resolveFence()
    await finalFlush
    expect(disposals).toBe(1)
  })

  test('falls back to disposal when no WebGPU queue is available', async () => {
    const scheduler = createControlledDisposalScheduler()
    const manager = createGpuResourceLifetimeManager(scheduler.schedule)
    let disposals = 0
    const release = manager.retain({ dispose: () => disposals++ }, {})

    release()
    await scheduler.flush()

    expect(disposals).toBe(1)
  })
})
