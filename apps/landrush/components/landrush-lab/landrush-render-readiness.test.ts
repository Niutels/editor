import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three'
import {
  beginLandrushPresentationPipelinePrewarmFrame,
  compileLandrushRenderRepresentatives,
  completeLandrushPresentationPipelinePrewarmFrame,
  createLandrushRenderReadinessCoordinator,
  type LandrushPipelineRenderer,
  type LandrushPresentationPipelinePrewarmState,
  registerLandrushPresentationPipelinePrewarm,
  requestLandrushPresentationPipelinePrewarm,
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
  test('renders overlapping live representatives with exact state restoration and no graph moves', async () => {
    const renderer = { compileAsync: async () => undefined }
    const zombieCamera = new PerspectiveCamera()
    const scene = new Scene()
    const parent = new Group()
    const before = new Group()
    const root = new Group()
    const child = new Group()
    const after = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const instances = new InstancedMesh(geometry, material, 4)
    const state: LandrushPresentationPipelinePrewarmState = {}
    let invalidations = 0
    parent.add(before, root, after)
    root.add(child)
    child.add(instances)
    scene.add(parent)
    const originalParentChildren = [...parent.children]
    const originalRootChildren = [...root.children]
    root.visible = false
    child.visible = false
    instances.visible = false
    instances.frustumCulled = true
    instances.count = 0
    root.layers.set(3)
    child.layers.set(5)
    const rootLayerMask = root.layers.mask
    const childLayerMask = child.layers.mask
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => {
        invalidations += 1
      },
      renderer,
      scene,
      state,
    })

    try {
      const pending = requestLandrushPresentationPipelinePrewarm({
        camera: zombieCamera,
        renderer,
        representatives: [
          { key: 'root', root },
          { key: 'overlap', root: child },
          { key: 'duplicate', root },
        ],
        targetScene: scene,
      })
      expect(invalidations).toBe(1)
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(state.pipelinePrewarmCamera).toBe(zombieCamera)
      expect(root.visible).toBe(true)
      expect(child.visible).toBe(true)
      expect(instances.visible).toBe(true)
      expect(instances.frustumCulled).toBe(false)
      expect(instances.count).toBe(1)
      expect(parent.children).toEqual(originalParentChildren)
      expect(root.children).toEqual(originalRootChildren)
      expect(root.layers.mask).toBe(rootLayerMask)
      expect(child.layers.mask).toBe(childLayerMask)

      state.pipelinePrewarmRenderedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(state.pipelinePrewarmCamera).toBeUndefined()
      expect(root.visible).toBe(false)
      expect(child.visible).toBe(false)
      expect(instances.visible).toBe(false)
      expect(instances.frustumCulled).toBe(true)
      expect(instances.count).toBe(0)
      expect(parent.children).toEqual(originalParentChildren)
      expect(root.children).toEqual(originalRootChildren)
      await pending
    } finally {
      unregister()
      geometry.dispose()
      material.dispose()
    }
  })

  test('temporarily exposes detached representative trees without publishing scene graph events', async () => {
    const renderer = { compileAsync: async () => undefined }
    const camera = new PerspectiveCamera()
    const scene = new Scene()
    const existing = new Group()
    const detachedAncestor = new Group()
    const root = new Group()
    const state: {
      pipelinePrewarmRenderedRevision?: number
      pipelinePrewarmRequestRevision?: number
    } = {}
    let childAddedEvents = 0
    scene.add(existing)
    detachedAncestor.add(root)
    detachedAncestor.visible = false
    root.visible = false
    scene.addEventListener('childadded', () => {
      childAddedEvents += 1
    })
    const originalSceneChildren = [...scene.children]
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })

    try {
      const pending = requestLandrushPresentationPipelinePrewarm({
        camera,
        renderer,
        representatives: [{ key: 'detached', root }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(detachedAncestor.parent).toBe(scene)
      expect(root.parent).toBe(detachedAncestor)
      expect(detachedAncestor.visible).toBe(true)
      expect(root.visible).toBe(true)
      expect(scene.children).toEqual([...originalSceneChildren, detachedAncestor])
      expect(childAddedEvents).toBe(0)

      state.pipelinePrewarmRenderedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      await pending
      expect(detachedAncestor.parent).toBeNull()
      expect(root.parent).toBe(detachedAncestor)
      expect(detachedAncestor.visible).toBe(false)
      expect(root.visible).toBe(false)
      expect(scene.children).toEqual(originalSceneChildren)
      expect(childAddedEvents).toBe(0)
    } finally {
      unregister()
    }
  })

  test('warms only registered renderables while preserving effective light visibility', async () => {
    const renderer = { compileAsync: async () => undefined }
    const camera = new PerspectiveCamera()
    const scene = new Scene()
    const hiddenAncestor = new Group()
    const representative = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const instances = new InstancedMesh(geometry, material, 2)
    const registeredLight = new PointLight()
    const hiddenLight = new PointLight()
    const unrelated = new Group()
    const state: LandrushPresentationPipelinePrewarmState = {}
    hiddenAncestor.visible = false
    instances.count = 0
    instances.visible = false
    registeredLight.visible = false
    unrelated.visible = false
    representative.add(instances, registeredLight)
    hiddenAncestor.add(representative, hiddenLight)
    scene.add(hiddenAncestor, unrelated)
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })

    try {
      const pending = requestLandrushPresentationPipelinePrewarm({
        camera,
        renderer,
        representatives: [{ key: 'instances', root: representative }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(hiddenAncestor.visible).toBe(true)
      expect(representative.visible).toBe(true)
      expect(instances.visible).toBe(true)
      expect(instances.count).toBe(1)
      expect(registeredLight.visible).toBe(true)
      expect(hiddenLight.visible).toBe(false)
      expect(unrelated.visible).toBe(false)

      state.pipelinePrewarmRenderedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      await pending
      expect(hiddenAncestor.visible).toBe(false)
      expect(instances.visible).toBe(false)
      expect(instances.count).toBe(0)
      expect(registeredLight.visible).toBe(false)
      expect(hiddenLight.visible).toBe(true)
      expect(unrelated.visible).toBe(false)
    } finally {
      unregister()
      geometry.dispose()
      material.dispose()
    }
  })

  test('rejects a failed pipeline revision and allows a later request to recover', async () => {
    const renderer = { compileAsync: async () => undefined }
    const zombieCamera = new PerspectiveCamera()
    const scene = new Scene()
    const root = new Group()
    const state: LandrushPresentationPipelinePrewarmState = {}
    root.visible = false
    scene.add(root)
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })

    try {
      const failed = requestLandrushPresentationPipelinePrewarm({
        camera: zombieCamera,
        renderer,
        representatives: [{ key: 'failed', root }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(state.pipelinePrewarmCamera).toBe(zombieCamera)
      state.pipelinePrewarmFailedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      await expect(failed).rejects.toThrow('render failed')
      expect(state.pipelinePrewarmCamera).toBeUndefined()
      expect(root.visible).toBe(false)
      expect(state.pipelinePrewarmRequestRevision).toBe(0)
      expect(state.pipelinePrewarmFailedRevision).toBe(1)

      const recovered = requestLandrushPresentationPipelinePrewarm({
        camera: zombieCamera,
        renderer,
        representatives: [{ key: 'recovered', root }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(state.pipelinePrewarmCamera).toBe(zombieCamera)
      expect(state.pipelinePrewarmRequestRevision).toBe(2)
      state.pipelinePrewarmRenderedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      await recovered
      expect(state.pipelinePrewarmCamera).toBeUndefined()
      expect(root.visible).toBe(false)
    } finally {
      unregister()
    }
  })

  test('serializes live-scene pipeline prewarms and restores an unacknowledged frame before retry', async () => {
    const renderer = { compileAsync: async () => undefined }
    const camera = new PerspectiveCamera()
    const scene = new Scene()
    const firstRoot = new Group()
    const secondRoot = new Group()
    const state: {
      pipelinePrewarmRenderedRevision?: number
      pipelinePrewarmRequestRevision?: number
    } = {}
    firstRoot.visible = false
    secondRoot.visible = false
    scene.add(firstRoot, secondRoot)
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })

    try {
      const first = requestLandrushPresentationPipelinePrewarm({
        camera,
        renderer,
        representatives: [{ key: 'first', root: firstRoot }],
        targetScene: scene,
      })
      const second = requestLandrushPresentationPipelinePrewarm({
        camera,
        renderer,
        representatives: [{ key: 'second', root: secondRoot }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(firstRoot.visible).toBe(true)
      expect(secondRoot.visible).toBe(false)
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(firstRoot.visible).toBe(false)
      expect(secondRoot.visible).toBe(false)

      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(firstRoot.visible).toBe(true)
      expect(secondRoot.visible).toBe(false)
      state.pipelinePrewarmRenderedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      await first

      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(firstRoot.visible).toBe(false)
      expect(secondRoot.visible).toBe(true)
      state.pipelinePrewarmRenderedRevision = state.pipelinePrewarmRequestRevision
      completeLandrushPresentationPipelinePrewarmFrame(renderer)
      await second
      expect(secondRoot.visible).toBe(false)
    } finally {
      unregister()
    }
  })

  test('settles immediately from the exact render callback without waiting for a later frame hook', async () => {
    const renderer = { compileAsync: async () => undefined }
    const camera = new PerspectiveCamera()
    const scene = new Scene()
    const root = new Group()
    const state: LandrushPresentationPipelinePrewarmState = {}
    root.visible = false
    scene.add(root)
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })

    try {
      const pending = requestLandrushPresentationPipelinePrewarm({
        camera,
        renderer,
        representatives: [{ key: 'root', root }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      expect(root.visible).toBe(true)
      const revision = state.pipelinePrewarmRequestRevision!
      state.pipelinePrewarmCameraMatched = true
      state.pipelinePrewarmRenderedCamera = camera
      state.pipelinePrewarmOnRenderSettled?.(revision, 'rendered')
      await pending
      expect(root.visible).toBe(false)
      expect(state.pipelinePrewarmRenderedRevision).toBe(revision)
    } finally {
      unregister()
    }
  })

  test('rejects a rendered callback that did not use the exact requested camera', async () => {
    const camera = new PerspectiveCamera()
    const otherCamera = new PerspectiveCamera()
    const renderer = { compileAsync: async () => undefined }
    const scene = new Scene()
    const root = new Group()
    const state: LandrushPresentationPipelinePrewarmState = {}
    root.visible = false
    scene.add(root)
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })

    try {
      const pending = requestLandrushPresentationPipelinePrewarm({
        camera,
        renderer,
        representatives: [{ key: 'root', root }],
        targetScene: scene,
      })
      beginLandrushPresentationPipelinePrewarmFrame(renderer)
      const revision = state.pipelinePrewarmRequestRevision!
      state.pipelinePrewarmCameraMatched = true
      state.pipelinePrewarmRenderedCamera = otherCamera
      state.pipelinePrewarmOnRenderSettled?.(revision, 'rendered')

      await expect(pending).rejects.toThrow('render failed')
      expect(state.pipelinePrewarmRenderedRevision).toBeUndefined()
      expect(state.pipelinePrewarmFailedRevision).toBe(revision)
      expect(root.visible).toBe(false)
    } finally {
      unregister()
    }
  })

  test('restores active representatives and rejects pending work on driver cleanup', async () => {
    const renderer = { compileAsync: async () => undefined }
    const zombieCamera = new PerspectiveCamera()
    const scene = new Scene()
    const root = new Group()
    const state: LandrushPresentationPipelinePrewarmState = {}
    root.visible = false
    scene.add(root)
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })
    const pending = requestLandrushPresentationPipelinePrewarm({
      camera: zombieCamera,
      renderer,
      representatives: [{ key: 'root', root }],
      targetScene: scene,
    })
    beginLandrushPresentationPipelinePrewarmFrame(renderer)
    expect(state.pipelinePrewarmCamera).toBe(zombieCamera)
    expect(root.visible).toBe(true)
    unregister()
    expect(state.pipelinePrewarmCamera).toBeUndefined()
    expect(root.visible).toBe(false)
    await expect(pending).rejects.toThrow('was unmounted')
  })

  test('compiles zero-count instances as one and restores exact state before awaiting', async () => {
    const compilation = deferred<void>()
    const ancestor = new Group()
    const root = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const zeroCount = new InstancedMesh(geometry, material, 4)
    const populated = new InstancedMesh(geometry, material, 4)
    ancestor.visible = false
    root.visible = false
    zeroCount.count = 0
    zeroCount.visible = false
    zeroCount.frustumCulled = true
    populated.count = 2
    populated.visible = false
    populated.frustumCulled = true
    root.add(zeroCount, populated)
    ancestor.add(root)
    let compileObserved = false

    const pending = compileLandrushRenderRepresentatives({
      camera: new PerspectiveCamera(),
      renderer: {
        compileAsync(compiledRoot) {
          compileObserved = true
          expect(compiledRoot).toBe(root)
          expect(ancestor.visible).toBe(true)
          expect(root.visible).toBe(true)
          expect(zeroCount.visible).toBe(true)
          expect(zeroCount.frustumCulled).toBe(false)
          expect(zeroCount.count).toBe(1)
          expect(populated.visible).toBe(true)
          expect(populated.frustumCulled).toBe(false)
          expect(populated.count).toBe(2)
          return compilation.promise
        },
      },
      representatives: [{ key: 'instances', root }],
      targetScene: new Scene(),
    })

    expect(compileObserved).toBe(true)
    expect(ancestor.visible).toBe(false)
    expect(root.visible).toBe(false)
    expect(zeroCount.visible).toBe(false)
    expect(zeroCount.frustumCulled).toBe(true)
    expect(zeroCount.count).toBe(0)
    expect(populated.visible).toBe(false)
    expect(populated.frustumCulled).toBe(true)
    expect(populated.count).toBe(2)
    compilation.resolve()
    await pending
    geometry.dispose()
    material.dispose()
  })

  test('restores zero-count instances after synchronous throw and asynchronous rejection', async () => {
    for (const failure of ['throw', 'reject'] as const) {
      const geometry = new BoxGeometry()
      const material = new MeshBasicMaterial()
      const root = new Group()
      const mesh = new InstancedMesh(geometry, material, 2)
      root.visible = false
      mesh.count = 0
      mesh.visible = false
      mesh.frustumCulled = true
      root.add(mesh)

      await expect(
        compileLandrushRenderRepresentatives({
          camera: new PerspectiveCamera(),
          renderer: {
            compileAsync() {
              expect(root.visible).toBe(true)
              expect(mesh.visible).toBe(true)
              expect(mesh.frustumCulled).toBe(false)
              expect(mesh.count).toBe(1)
              if (failure === 'throw') throw new Error('compile failed')
              return Promise.reject(new Error('compile failed'))
            },
          },
          representatives: [{ key: failure, root }],
          targetScene: new Scene(),
        }),
      ).rejects.toThrow('compile failed')
      expect(root.visible).toBe(false)
      expect(mesh.visible).toBe(false)
      expect(mesh.frustumCulled).toBe(true)
      expect(mesh.count).toBe(0)
      geometry.dispose()
      material.dispose()
    }
  })

  test('rejects delayed WebGPU validation errors instead of publishing false readiness', async () => {
    let uncapturedErrorListener: ((event: unknown) => void) | undefined
    let errorScopePending = false
    const root = new Group()
    root.visible = false
    const renderer: LandrushPipelineRenderer = {
      backend: {
        device: {
          addEventListener(type: string, listener: (event: unknown) => void) {
            expect(type).toBe('uncapturederror')
            uncapturedErrorListener = listener
          },
          popErrorScope() {
            expect(errorScopePending).toBe(true)
            errorScopePending = false
            return Promise.resolve(null)
          },
          pushErrorScope(filter: string) {
            expect(filter).toBe('validation')
            errorScopePending = true
          },
          removeEventListener(type: string, listener: (event: unknown) => void) {
            expect(type).toBe('uncapturederror')
            expect(listener).toBe(uncapturedErrorListener)
            uncapturedErrorListener = undefined
          },
        },
      },
      async compileAsync() {
        expect(root.visible).toBe(true)
        uncapturedErrorListener?.({ error: { message: 'invalid sampler binding' } })
      },
    }

    await expect(
      compileLandrushRenderRepresentatives({
        camera: new PerspectiveCamera(),
        renderer,
        representatives: [{ key: 'invalid-material', root }],
        targetScene: new Scene(),
      }),
    ).rejects.toThrow('invalid sampler binding')
    expect(root.visible).toBe(false)
    expect(errorScopePending).toBe(false)
    expect(uncapturedErrorListener).toBeUndefined()
  })

  test('rejects a scoped WebGPU validation error when the compile scope settles', async () => {
    const events: string[] = []
    const renderer: LandrushPipelineRenderer = {
      backend: {
        device: {
          addEventListener() {
            events.push('listen')
          },
          async popErrorScope() {
            events.push('pop')
            return { message: 'invalid render pipeline' }
          },
          pushErrorScope() {
            events.push('push')
          },
          removeEventListener() {
            events.push('unlisten')
          },
        },
      },
      async compileAsync() {
        events.push('compile')
      },
    }

    await expect(
      compileLandrushRenderRepresentatives({
        camera: new PerspectiveCamera(),
        renderer,
        representatives: [{ key: 'scoped-error', root: new Group() }],
        targetScene: new Scene(),
      }),
    ).rejects.toThrow('invalid render pipeline')
    expect(events).toEqual(['listen', 'push', 'compile', 'pop', 'unlisten'])
  })

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
