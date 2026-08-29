import { describe, expect, test } from 'bun:test'
import { Group, PerspectiveCamera, Scene } from 'three'
import {
  compileLandrushRenderRepresentatives,
  createLandrushRenderReadinessCoordinator,
  type LandrushPipelineRenderer,
} from './landrush-render-readiness'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushMicrotasksUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) {
    await Promise.resolve()
  }
}

function createRequest(renderer: LandrushPipelineRenderer) {
  return {
    camera: new PerspectiveCamera(),
    generation: 1,
    identity: {},
    renderer,
    representatives: [{ key: 'root', root: new Group() }],
    targetScene: new Scene(),
  }
}

describe('Landrush render readiness compile coordination', () => {
  test('reports only completed awaited representatives as incremental progress', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    const roots = [new Group(), new Group()]
    const progress: Array<Readonly<{ completed: number; total: number }>> = []
    let calls = 0
    const pending = compileLandrushRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: {
          compileAsync: () => (calls++ === 0 ? first.promise : second.promise),
        },
        representatives: roots.map((root, index) => ({ key: String(index), root })),
        targetScene: new Scene(),
      },
      (snapshot) => progress.push(snapshot),
    )

    expect(progress).toEqual([{ completed: 0, total: 2 }])
    first.resolve()
    await flushMicrotasksUntil(() => calls === 2)
    expect(progress).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
    ])
    second.resolve()
    await pending
    expect(progress).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ])
  })

  test('attributes opt-in startup timing to each awaited representative', async () => {
    const traceGlobal = globalThis as typeof globalThis & {
      __LANDRUSH_ATOMIC_STARTUP__?: {
        activeRenderRepresentative?: string | null
        renderReadiness: Array<{
          edge: 'settled' | 'start'
          key: string
          outcome?: 'failed' | 'ready'
        }>
        startedAt: number
      }
    }
    const previousTrace = traceGlobal.__LANDRUSH_ATOMIC_STARTUP__
    const trace = {
      activeRenderRepresentative: null,
      renderReadiness: [],
      startedAt: performance.now(),
    }
    traceGlobal.__LANDRUSH_ATOMIC_STARTUP__ = trace
    try {
      const roots = [new Group(), new Group()]
      await compileLandrushRenderRepresentatives({
        camera: new PerspectiveCamera(),
        renderer: { compileAsync: async () => undefined },
        representatives: roots.map((root, index) => ({ key: `representative-${index}`, root })),
        targetScene: new Scene(),
      })

      expect(
        trace.renderReadiness.map(({ edge, key, outcome }) => ({ edge, key, outcome })),
      ).toEqual([
        { edge: 'start', key: 'representative-0', outcome: undefined },
        { edge: 'settled', key: 'representative-0', outcome: 'ready' },
        { edge: 'start', key: 'representative-1', outcome: undefined },
        { edge: 'settled', key: 'representative-1', outcome: 'ready' },
      ])
      expect(trace.activeRenderRepresentative).toBeNull()
    } finally {
      if (previousTrace) traceGlobal.__LANDRUSH_ATOMIC_STARTUP__ = previousTrace
      else delete traceGlobal.__LANDRUSH_ATOMIC_STARTUP__
    }
  })

  test('replays progress to new exact-request subscribers without duplicating existing observers', async () => {
    const compilation = deferred<void>()
    let reportProgress:
      | ((progress: Readonly<{ completed: number; total: number }>) => void)
      | undefined
    const coordinator = createLandrushRenderReadinessCoordinator({
      compile: async (_request, onProgress) => {
        reportProgress = onProgress
        onProgress?.({ completed: 0, total: 3 })
        await compilation.promise
        onProgress?.({ completed: 3, total: 3 })
      },
    })
    const request = createRequest({ compileAsync: async () => undefined })
    const firstProgress: Array<Readonly<{ completed: number; total: number }>> = []
    const secondProgress: Array<Readonly<{ completed: number; total: number }>> = []
    const firstObserver = (progress: Readonly<{ completed: number; total: number }>) =>
      firstProgress.push(progress)
    const first = coordinator.request(request, () => undefined, firstObserver)
    await flushMicrotasksUntil(() => Boolean(reportProgress))
    const sameObserver = coordinator.request(request, () => undefined, firstObserver)
    const newObserver = coordinator.request(
      request,
      () => undefined,
      (progress) => secondProgress.push(progress),
    )

    expect(sameObserver).toBe(first)
    expect(newObserver).toBe(first)
    expect(firstProgress).toEqual([{ completed: 0, total: 3 }])
    expect(secondProgress).toEqual([{ completed: 0, total: 3 }])
    for (const malformed of [
      { completed: Number.NaN, total: 3 },
      { completed: 0, total: Number.NaN },
      { completed: Number.POSITIVE_INFINITY, total: 3 },
      { completed: 0.5, total: 3 },
      { completed: -1, total: 3 },
      { completed: 1, total: 4 },
      { completed: 4, total: 3 },
    ]) {
      reportProgress?.(malformed)
    }
    reportProgress?.({ completed: 1, total: 3 })
    reportProgress?.({ completed: 1, total: 3 })
    expect(firstProgress.at(-1)).toEqual({ completed: 1, total: 3 })
    expect(secondProgress.at(-1)).toEqual({ completed: 1, total: 3 })
    expect(firstProgress).toHaveLength(2)
    expect(secondProgress).toHaveLength(2)

    compilation.resolve()
    expect(await first).toBe('ready')
    expect(firstProgress.at(-1)).toEqual({ completed: 3, total: 3 })
    reportProgress?.({ completed: 2, total: 3 })
    expect(firstProgress).toHaveLength(3)
    expect(secondProgress).toHaveLength(3)
    coordinator.dispose()
  })

  test('suppresses late progress after invalidation, disposal, and WebGL context replacement', async () => {
    for (const staleBy of ['invalidate', 'dispose', 'context'] as const) {
      const compilation = deferred<void>()
      let reportProgress:
        | ((progress: Readonly<{ completed: number; total: number }>) => void)
        | undefined
      const context = {}
      const renderer = { backend: { gl: context }, compileAsync: async () => undefined }
      const coordinator = createLandrushRenderReadinessCoordinator({
        compile: async (_request, onProgress) => {
          reportProgress = onProgress
          onProgress?.({ completed: 0, total: 1 })
          await compilation.promise
        },
      })
      const progress: unknown[] = []
      const pending = coordinator.request(
        createRequest(renderer),
        () => undefined,
        (snapshot) => progress.push(snapshot),
      )
      await flushMicrotasksUntil(() => Boolean(reportProgress))
      if (staleBy === 'invalidate') coordinator.invalidate()
      else if (staleBy === 'dispose') coordinator.dispose()
      else renderer.backend.gl = {}
      reportProgress?.({ completed: 1, total: 1 })
      expect(progress).toEqual([{ completed: 0, total: 1 }])
      compilation.resolve()
      expect(await pending).toBe('stale')
      coordinator.dispose()
    }
  })

  test('keeps progress from a replaced request out of the next generation', async () => {
    const firstCompilation = deferred<void>()
    let reportFirstProgress:
      | ((progress: Readonly<{ completed: number; total: number }>) => void)
      | undefined
    let calls = 0
    const coordinator = createLandrushRenderReadinessCoordinator({
      compile: async (_request, onProgress) => {
        calls += 1
        onProgress?.({ completed: 0, total: 1 })
        if (calls === 1) {
          reportFirstProgress = onProgress
          await firstCompilation.promise
        }
        onProgress?.({ completed: 1, total: 1 })
      },
    })
    const request = createRequest({ compileAsync: async () => undefined })
    const firstProgress: unknown[] = []
    const secondProgress: unknown[] = []
    const first = coordinator.request(
      request,
      () => undefined,
      (progress) => firstProgress.push(progress),
    )
    await flushMicrotasksUntil(() => Boolean(reportFirstProgress))
    const second = coordinator.request(
      { ...request, generation: 2, identity: {} },
      () => undefined,
      (progress) => secondProgress.push(progress),
    )
    reportFirstProgress?.({ completed: 1, total: 1 })
    expect(firstProgress).toEqual([{ completed: 0, total: 1 }])
    expect(secondProgress).toEqual([])
    firstCompilation.resolve()
    expect(await first).toBe('stale')
    expect(await second).toBe('ready')
    expect(firstProgress).toEqual([{ completed: 0, total: 1 }])
    expect(secondProgress).toEqual([
      { completed: 0, total: 1 },
      { completed: 1, total: 1 },
    ])
    expect(calls).toBe(2)
    coordinator.dispose()
  })

  test('ignores progress after terminal failure and supports invalidation during replay', async () => {
    let reportProgress:
      | ((progress: Readonly<{ completed: number; total: number }>) => void)
      | undefined
    const coordinator = createLandrushRenderReadinessCoordinator({
      compile: async (_request, onProgress) => {
        reportProgress = onProgress
        onProgress?.({ completed: 0, total: 1 })
        throw new Error('compilation rejected')
      },
    })
    const request = createRequest({ compileAsync: async () => undefined })
    const progress: unknown[] = []
    const statuses: string[] = []
    const pending = coordinator.request(
      request,
      (status) => statuses.push(status.state),
      (snapshot) => progress.push(snapshot),
    )
    expect(await pending).toBe('failed')
    reportProgress?.({ completed: 1, total: 1 })
    expect(progress).toEqual([{ completed: 0, total: 1 }])
    const replay = coordinator.request(
      request,
      (status) => statuses.push(status.state),
      () => coordinator.invalidate(),
    )
    expect(replay).toBe(pending)
    expect(await replay).toBe('failed')
    expect(statuses).toEqual(['failed'])
    coordinator.dispose()
  })

  test('serializes separate coordinators that share one renderer device context', async () => {
    const firstCompilation = deferred<void>()
    const secondCompilation = deferred<void>()
    const device = {}
    const firstRenderer = { backend: { device }, compileAsync: async () => undefined }
    const secondRenderer = { backend: { device }, compileAsync: async () => undefined }
    const calls: string[] = []
    let active = 0
    let maximumActive = 0
    const firstCoordinator = createLandrushRenderReadinessCoordinator({
      compile: async () => {
        calls.push('first')
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await firstCompilation.promise
        active -= 1
      },
    })
    const secondCoordinator = createLandrushRenderReadinessCoordinator({
      compile: async () => {
        calls.push('second')
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await secondCompilation.promise
        active -= 1
      },
    })

    const first = firstCoordinator.request(createRequest(firstRenderer), () => undefined)
    await flushMicrotasksUntil(() => calls.length === 1)
    const second = secondCoordinator.request(createRequest(secondRenderer), () => undefined)
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toEqual(['first'])

    firstCompilation.resolve()
    expect(await first).toBe('ready')
    await flushMicrotasksUntil(() => calls.length === 2)
    expect(calls).toEqual(['first', 'second'])
    secondCompilation.resolve()
    expect(await second).toBe('ready')
    expect(maximumActive).toBe(1)
  })

  test('does not serialize separate renderer device contexts', async () => {
    const compilation = deferred<void>()
    let active = 0
    let maximumActive = 0
    const createCoordinator = () =>
      createLandrushRenderReadinessCoordinator({
        compile: async () => {
          active += 1
          maximumActive = Math.max(maximumActive, active)
          await compilation.promise
          active -= 1
        },
      })
    const firstCoordinator = createCoordinator()
    const secondCoordinator = createCoordinator()
    const first = firstCoordinator.request(
      createRequest({ backend: { device: {} }, compileAsync: async () => undefined }),
      () => undefined,
    )
    const second = secondCoordinator.request(
      createRequest({ backend: { device: {} }, compileAsync: async () => undefined }),
      () => undefined,
    )

    await flushMicrotasksUntil(() => active === 2)
    expect(maximumActive).toBe(2)
    compilation.resolve()
    expect(await first).toBe('ready')
    expect(await second).toBe('ready')
  })
})
