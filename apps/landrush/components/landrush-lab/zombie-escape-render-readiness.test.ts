import { describe, expect, test } from 'bun:test'
import type { Object3D } from 'three'
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry } from 'three'
import {
  compileZombieEscapeRenderRepresentatives,
  createZombieEscapeHeldWeaponRenderRepresentativeKey,
  createZombieEscapeRenderReadinessCoordinator,
  createZombieEscapeRenderReadinessRegistry,
  createZombieEscapeZombieRenderRepresentativeKey,
  getZombieEscapeRenderRepresentativeKeys,
  isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled,
  waitForZombieEscapeGpuPreparation,
  ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
  type ZombieEscapePipelineRenderer,
  type ZombieEscapeRenderReadinessTimer,
} from './zombie-escape-render-readiness'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createFakeRenderReadinessTimer() {
  let nextHandle = 1
  let clearCount = 0
  const callbacks = new Map<number, () => void>()
  const scheduledDelays: number[] = []
  const timer: ZombieEscapeRenderReadinessTimer = {
    clear(handle) {
      clearCount += 1
      callbacks.delete(handle as number)
    },
    schedule(callback, delayMs) {
      const handle = nextHandle
      nextHandle += 1
      callbacks.set(handle, callback)
      scheduledDelays.push(delayMs)
      return handle
    },
  }
  return {
    get clearCount() {
      return clearCount
    },
    get pendingCount() {
      return callbacks.size
    },
    scheduledDelays,
    fireAll() {
      const pendingCallbacks = Array.from(callbacks.values())
      callbacks.clear()
      for (const callback of pendingCallbacks) callback()
    },
    timer,
  }
}

async function flushMicrotasksUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await Promise.resolve()
  }
}

function createCompileFixture() {
  const targetScene = new Scene()
  const ancestor = new Group()
  const root = new Group()
  const child = new Group()
  const mesh = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
  ancestor.visible = false
  root.visible = false
  child.visible = false
  child.frustumCulled = true
  mesh.visible = false
  mesh.frustumCulled = true
  child.add(mesh)
  root.add(child)
  ancestor.add(root)
  targetScene.add(ancestor)
  return {
    ancestor,
    camera: new PerspectiveCamera(),
    child,
    mesh,
    root,
    targetScene,
  }
}

describe('Zombie Escape render representative coverage', () => {
  test('covers each held weapon, generated zombie, presentation variant, and pooled effect', () => {
    const keys = getZombieEscapeRenderRepresentativeKeys('balanced')
    expect(new Set(keys).size).toBe(keys.length)
    for (const weapon of ZOMBIE_ESCAPE_WEAPON_CATALOG) {
      expect(keys).toContain(createZombieEscapeHeldWeaponRenderRepresentativeKey(weapon.id))
    }
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      expect(keys).toContain(createZombieEscapeZombieRenderRepresentativeKey(zombie.id))
    }
    expect(keys).toContain('weapon-pickup')
    expect(keys).toContain('effect:tracer')
    expect(keys).toContain('effect:muzzle')
    expect(keys).toContain('effect:impact')
    expect(keys).toContain('effect:sparks')
    expect(keys).toContain('effect:blood')
    expect(keys).toContain('effect:carrier-accent')
    expect(keys).toContain('effect:travel-detail')
    expect(keys).toContain('effect:travel-ribbon')
    expect(keys).toContain('effect:muzzle-petals')
    expect(keys).toContain('effect:death-dust')
    expect(getZombieEscapeRenderRepresentativeKeys('performance')).not.toContain(
      createZombieEscapeZombieRenderRepresentativeKey(ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]!.id),
    )
  })

  test('becomes complete only at exact registered coverage and ignores stale cleanup', () => {
    const first = new Group()
    const replacement = new Group()
    const registry = createZombieEscapeRenderReadinessRegistry(['first', 'second'])
    const unregisterFirst = registry.register('first', first)
    expect(registry.getSnapshot()).toMatchObject({ complete: false, missingKeys: ['second'] })
    const unregisterReplacement = registry.register('first', replacement)
    unregisterFirst()
    expect(registry.getSnapshot().representatives[0]).toEqual({ key: 'first', root: replacement })
    const unregisterSecond = registry.register('second', new Group())
    expect(registry.getSnapshot()).toMatchObject({ complete: true, missingKeys: [] })
    unregisterReplacement()
    expect(registry.getSnapshot()).toMatchObject({ complete: false, missingKeys: ['first'] })
    unregisterSecond()
  })
})

describe('Zombie Escape render compilation', () => {
  test('bypasses exact presentation rendering only for explicit draw or post-FX diagnostics', () => {
    expect(isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled('')).toBe(false)
    expect(isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled('?disable=ao')).toBe(false)
    expect(isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled('?disable=draw')).toBe(true)
    expect(isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled('?disable=postFx')).toBe(
      true,
    )
    expect(
      isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled('?disable=outline,postFx'),
    ).toBe(true)
  })

  test('initializes first, submits one aggregate against the actual scene, and restores it before await', async () => {
    const fixture = createCompileFixture()
    const compilation = deferred<unknown>()
    const events: string[] = []
    let aggregateRoot: Object3D | undefined
    let compileCount = 0
    const renderer: ZombieEscapePipelineRenderer = {
      async compileAsync(root, camera, targetScene) {
        compileCount += 1
        events.push(compileCount === 1 ? 'compile:representative' : 'compile:scene')
        expect(camera).toBe(fixture.camera)
        expect(targetScene).toBe(fixture.targetScene)
        if (compileCount === 2) {
          expect(root).toBe(fixture.targetScene)
          expect(fixture.ancestor.visible).toBe(false)
          return undefined
        }
        aggregateRoot = root
        expect(root).not.toBe(fixture.root)
        expect(fixture.root.parent).toBe(root)
        expect(fixture.ancestor.children).not.toContain(fixture.root)
        expect(fixture.ancestor.visible).toBe(false)
        expect(fixture.root.visible).toBe(true)
        expect(fixture.child.visible).toBe(true)
        expect(fixture.child.frustumCulled).toBe(true)
        expect(fixture.mesh.visible).toBe(true)
        expect(fixture.mesh.frustumCulled).toBe(false)
        return compilation.promise
      },
      init() {
        events.push('init')
      },
    }
    const pending = compileZombieEscapeRenderRepresentatives({
      camera: fixture.camera,
      renderer,
      representatives: [{ key: 'hidden', root: fixture.root }],
      targetScene: fixture.targetScene,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['init', 'compile:representative'])
    expect(aggregateRoot).toBeDefined()
    expect(fixture.root.parent).toBe(fixture.ancestor)
    expect(fixture.ancestor.children).toEqual([fixture.root])
    expect(fixture.ancestor.visible).toBe(false)
    expect(fixture.root.visible).toBe(false)
    expect(fixture.child.visible).toBe(false)
    expect(fixture.child.frustumCulled).toBe(true)
    expect(fixture.mesh.visible).toBe(false)
    expect(fixture.mesh.frustumCulled).toBe(true)
    compilation.resolve(undefined)
    await pending
    expect(events).toEqual(['init', 'compile:representative', 'compile:scene'])
    expect(fixture.ancestor.visible).toBe(false)
    expect(fixture.root.visible).toBe(false)
    expect(fixture.child.visible).toBe(false)
    expect(fixture.mesh.visible).toBe(false)
    expect(fixture.mesh.frustumCulled).toBe(true)
    fixture.mesh.geometry.dispose()
    fixture.mesh.material.dispose()
  })

  test('warms exact WebGPU presentation and direct frames after the aggregate compile', async () => {
    const fixture = createCompileFixture()
    const compiledRoots: Object3D[] = []
    const compiledPointLightCounts: number[] = []
    const containsRepresentative: boolean[] = []
    const prewarmRenderPaths: Array<'direct' | 'presentation' | undefined> = []
    let initialized = false
    const renderer: ZombieEscapePipelineRenderer = {
      backend: { device: { queue: { onSubmittedWorkDone: async () => undefined } } },
      async compileAsync(root, camera, targetScene) {
        expect(camera).toBe(fixture.camera)
        expect(targetScene).toBe(fixture.targetScene)
        compiledRoots.push(root)
        let pointLightCount = 0
        let representativeFound = false
        root.traverse((object) => {
          if ((object as { isPointLight?: boolean }).isPointLight) pointLightCount += 1
          if (object === fixture.root) representativeFound = true
        })
        compiledPointLightCounts.push(pointLightCount)
        containsRepresentative.push(representativeFound)
      },
      init() {
        initialized = true
      },
      isWebGPURenderer: true,
    }

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: fixture.camera,
        renderer,
        representatives: [{ key: 'hidden', root: fixture.root }],
        targetScene: fixture.targetScene,
      },
      undefined,
      async ({ renderPath, representatives }) => {
        prewarmRenderPaths.push(renderPath)
        expect(representatives).toEqual([{ key: 'hidden', root: fixture.root }])
      },
    )

    expect(initialized).toBe(true)
    expect(compiledRoots).toHaveLength(1)
    expect(compiledRoots[0]).not.toBe(fixture.root)
    expect(compiledPointLightCounts).toEqual([0])
    expect(containsRepresentative).toEqual([true])
    expect(prewarmRenderPaths).toEqual(['presentation', 'direct'])
    expect(fixture.root.parent).toBe(fixture.ancestor)
    expect(fixture.ancestor.visible).toBe(false)
    expect(fixture.root.visible).toBe(false)
    expect(fixture.child.visible).toBe(false)
    expect(fixture.mesh.visible).toBe(false)
    expect(fixture.mesh.frustumCulled).toBe(true)
    fixture.mesh.geometry.dispose()
    fixture.mesh.material.dispose()
  })

  test('recompiles only wall-style material root replacements after initial aggregate readiness', async () => {
    const targetScene = new Scene()
    const camera = new PerspectiveCamera()
    const initialRepresentatives = [
      { key: 'weapon-held:fixture', root: new Group() },
      { key: 'effect:fixture', root: new Group() },
      { key: 'island:material-presentation', root: new Group() },
      { key: 'island:material-presentation:night', root: new Group() },
    ]
    const replacementRepresentatives = initialRepresentatives.map((representative) =>
      representative.key.startsWith('island:material-presentation')
        ? { key: representative.key, root: new Group() }
        : representative,
    )
    const keysByRoot = new Map(
      [...initialRepresentatives, ...replacementRepresentatives].map(({ key, root }) => [
        root,
        key,
      ]),
    )
    const compiledKeySets: string[][] = []
    const prewarmedKeySets: string[][] = []
    const renderer: ZombieEscapePipelineRenderer = {
      backend: { device: { queue: { onSubmittedWorkDone: async () => undefined } } },
      async compileAsync(root) {
        const keys: string[] = []
        root.traverse((object) => {
          const key = keysByRoot.get(object as Group)
          if (key) keys.push(key)
        })
        compiledKeySets.push(keys)
      },
      isWebGPURenderer: true,
    }
    const prewarm = async ({
      representatives,
    }: {
      representatives: readonly { key: string }[]
    }) => {
      prewarmedKeySets.push(representatives.map(({ key }) => key))
    }

    await compileZombieEscapeRenderRepresentatives(
      { camera, renderer, representatives: initialRepresentatives, targetScene },
      undefined,
      prewarm,
    )
    await compileZombieEscapeRenderRepresentatives(
      { camera, renderer, representatives: replacementRepresentatives, targetScene },
      undefined,
      prewarm,
    )
    const progress: unknown[] = []
    await compileZombieEscapeRenderRepresentatives(
      { camera, renderer, representatives: replacementRepresentatives, targetScene },
      (snapshot) => progress.push(snapshot),
      prewarm,
    )

    expect(compiledKeySets).toEqual([
      initialRepresentatives.map(({ key }) => key),
      ['island:material-presentation', 'island:material-presentation:night'],
    ])
    expect(prewarmedKeySets).toEqual([
      initialRepresentatives.map(({ key }) => key),
      initialRepresentatives.map(({ key }) => key),
      ['island:material-presentation', 'island:material-presentation:night'],
      ['island:material-presentation', 'island:material-presentation:night'],
    ])
    expect(progress).toEqual([
      { completed: 0, total: 4 },
      { completed: 4, total: 4 },
    ])
  })

  test('caches roots only after GPU completion and invalidates them with the renderer device', async () => {
    let rejectGpuCompletion = true
    let aggregateCompiles = 0
    let exactPrewarms = 0
    const createDevice = () => ({
      queue: {
        onSubmittedWorkDone: async () => {
          if (rejectGpuCompletion) throw new Error('fixture GPU completion failed')
        },
      },
    })
    const backend = { device: createDevice() }
    const renderer: ZombieEscapePipelineRenderer = {
      backend,
      async compileAsync() {
        aggregateCompiles += 1
      },
      isWebGPURenderer: true,
    }
    const request = {
      camera: new PerspectiveCamera(),
      renderer,
      representatives: [{ key: 'island:material-presentation', root: new Group() }],
      targetScene: new Scene(),
    }
    const prewarm = async () => {
      exactPrewarms += 1
    }

    await expect(
      compileZombieEscapeRenderRepresentatives(request, undefined, prewarm),
    ).rejects.toThrow('fixture GPU completion failed')
    rejectGpuCompletion = false
    await compileZombieEscapeRenderRepresentatives(request, undefined, prewarm)
    await compileZombieEscapeRenderRepresentatives(request, undefined, prewarm)
    expect(aggregateCompiles).toBe(2)
    expect(exactPrewarms).toBe(4)

    backend.device = createDevice()
    await compileZombieEscapeRenderRepresentatives(request, undefined, prewarm)
    expect(aggregateCompiles).toBe(3)
    expect(exactPrewarms).toBe(6)
  })

  test('restores every flag after synchronous throw and asynchronous rejection', async () => {
    for (const failure of ['throw', 'reject'] as const) {
      const fixture = createCompileFixture()
      const renderer = {
        compileAsync() {
          if (failure === 'throw') throw new Error('compile failed')
          return Promise.reject(new Error('compile failed'))
        },
      } as ZombieEscapePipelineRenderer
      await expect(
        compileZombieEscapeRenderRepresentatives({
          camera: fixture.camera,
          renderer,
          representatives: [{ key: failure, root: fixture.root }],
          targetScene: fixture.targetScene,
        }),
      ).rejects.toThrow('compile failed')
      expect(fixture.root.parent).toBe(fixture.ancestor)
      expect(fixture.ancestor.children).toEqual([fixture.root])
      expect(fixture.ancestor.visible).toBe(false)
      expect(fixture.root.visible).toBe(false)
      expect(fixture.child.visible).toBe(false)
      expect(fixture.mesh.visible).toBe(false)
      expect(fixture.mesh.frustumCulled).toBe(true)
      fixture.mesh.geometry.dispose()
      fixture.mesh.material.dispose()
    }
  })

  test('restores exact sibling and nested hierarchy before an aggregate submission settles', async () => {
    const representativeOrders = ['forward', 'reverse'] as const
    for (const order of representativeOrders) {
      const parent = new Group()
      const before = new Group()
      const first = new Group()
      const between = new Group()
      const second = new Group()
      const after = new Group()
      parent.add(before, first, between, second, after)
      const originalChildren = [...parent.children]
      const compilation = deferred<unknown>()
      let calls = 0
      const pending = compileZombieEscapeRenderRepresentatives({
        camera: new PerspectiveCamera(),
        renderer: {
          compileAsync: (root) => {
            calls += 1
            if (calls > 1) return Promise.resolve()
            expect(root.children).toEqual(order === 'forward' ? [first, second] : [second, first])
            return compilation.promise
          },
        },
        representatives: (order === 'forward' ? [first, second] : [second, first]).map(
          (root, index) => ({ key: String(index), root }),
        ),
        targetScene: new Scene(),
      })
      await flushMicrotasksUntil(() => calls === 1)
      expect(parent.children).toEqual(originalChildren)
      expect(first.parent).toBe(parent)
      expect(second.parent).toBe(parent)
      compilation.resolve(undefined)
      await pending
    }

    for (const order of representativeOrders) {
      const parent = new Group()
      const ancestor = new Group()
      const before = new Group()
      const descendant = new Group()
      const after = new Group()
      parent.add(ancestor)
      ancestor.add(before, descendant, after)
      const originalChildren = [...ancestor.children]
      const compilation = deferred<unknown>()
      let calls = 0
      const representatives = order === 'forward' ? [ancestor, descendant] : [descendant, ancestor]
      const pending = compileZombieEscapeRenderRepresentatives({
        camera: new PerspectiveCamera(),
        renderer: {
          compileAsync: () => {
            calls += 1
            return calls === 1 ? compilation.promise : Promise.resolve()
          },
        },
        representatives: representatives.map((root, index) => ({ key: String(index), root })),
        targetScene: new Scene(),
      })
      await flushMicrotasksUntil(() => calls === 1)
      expect(ancestor.parent).toBe(parent)
      expect(ancestor.children).toEqual(originalChildren)
      expect(descendant.parent).toBe(ancestor)
      compilation.resolve(undefined)
      await pending
    }
  })

  test('aggregates live representatives without emitting ownership lifecycle events', async () => {
    const parent = new Group()
    const before = new Group()
    const first = new Group()
    const between = new Group()
    const second = new Group()
    const after = new Group()
    parent.add(before, first, between, second, after)
    const originalChildren = [...parent.children]
    const ownershipEvents: string[] = []
    first.addEventListener('added', () => ownershipEvents.push('first:added'))
    first.addEventListener('removed', () => ownershipEvents.push('first:removed'))
    second.addEventListener('added', () => ownershipEvents.push('second:added'))
    second.addEventListener('removed', () => ownershipEvents.push('second:removed'))
    const compilation = deferred<unknown>()
    let calls = 0
    const pending = compileZombieEscapeRenderRepresentatives({
      camera: new PerspectiveCamera(),
      renderer: {
        compileAsync: (root) => {
          calls += 1
          if (calls > 1) return Promise.resolve()
          expect(root.children).toEqual([first, second])
          return compilation.promise
        },
      },
      representatives: [
        { key: 'first', root: first },
        { key: 'second', root: second },
      ],
      targetScene: new Scene(),
    })
    await flushMicrotasksUntil(() => calls === 1)
    expect(parent.children).toEqual(originalChildren)
    expect(first.parent).toBe(parent)
    expect(second.parent).toBe(parent)
    expect(ownershipEvents).toEqual([])
    compilation.reject(new Error('compile failed'))
    await expect(pending).rejects.toThrow('compile failed')
    expect(parent.children).toEqual(originalChildren)
    expect(first.parent).toBe(parent)
    expect(second.parent).toBe(parent)
    expect(ownershipEvents).toEqual([])
  })

  test('deduplicates identical roots and restores a parentless root before submission settles', async () => {
    const root = new Group()
    const compilation = deferred<unknown>()
    let aggregateOccurrences = 0
    let calls = 0
    const pending = compileZombieEscapeRenderRepresentatives({
      camera: new PerspectiveCamera(),
      renderer: {
        compileAsync: (aggregate) => {
          calls += 1
          if (calls > 1) return Promise.resolve()
          aggregate.traverse((object) => {
            if (object === root) aggregateOccurrences += 1
          })
          return compilation.promise
        },
      },
      representatives: [
        { key: 'first', root },
        { key: 'duplicate', root },
      ],
      targetScene: new Scene(),
    })
    await flushMicrotasksUntil(() => calls === 1)
    expect(root.parent).toBeNull()
    expect(aggregateOccurrences).toBe(1)
    compilation.resolve(undefined)
    await pending
  })

  test('serializes the aggregate and legacy scene submissions without per-root compiles', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const roots = [new Group(), new Group()]
    let active = 0
    let maximumActive = 0
    let calls = 0
    const renderer: ZombieEscapePipelineRenderer = {
      async compileAsync(root) {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        if (calls === 0) {
          let representativeCount = 0
          root.traverse((object) => {
            if (roots.includes(object as Group)) representativeCount += 1
          })
          expect(representativeCount).toBe(2)
        }
        const pending = calls++ === 0 ? first : second
        await pending.promise
        active -= 1
      },
    }
    const pending = compileZombieEscapeRenderRepresentatives({
      camera: new PerspectiveCamera(),
      renderer,
      representatives: roots.map((root, index) => ({ key: String(index), root })),
      targetScene: new Scene(),
    })
    await Promise.resolve()
    expect(calls).toBe(1)
    first.resolve(undefined)
    await flushMicrotasksUntil(() => calls === 2)
    expect(calls).toBe(2)
    second.resolve(undefined)
    await pending
    expect(calls).toBe(2)
    expect(maximumActive).toBe(1)
  })
})

describe('Zombie Escape GPU preparation completion', () => {
  test('counts the existing legacy scene compile separately and reserves the last unit for the fence', async () => {
    const gpu = deferred<void>()
    const root = new Group()
    const targetScene = new Scene()
    const compiled: Object3D[] = []
    const compiledRepresentativeCounts: number[] = []
    const progress: unknown[] = []
    let waitingForGpu = false
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      prewarmPresentationPipeline: async () => undefined,
    })
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: {
          backend: {
            device: {
              queue: {
                onSubmittedWorkDone: () => {
                  waitingForGpu = true
                  return gpu.promise
                },
              },
            },
          },
          compileAsync: async (object) => {
            compiled.push(object)
            let representativeCount = 0
            object.traverse((candidate) => {
              if (candidate === root) representativeCount += 1
            })
            compiledRepresentativeCounts.push(representativeCount)
          },
        },
        representatives: [{ key: 'root', root }],
        targetScene,
      },
      () => undefined,
      (snapshot) => progress.push(snapshot),
    )
    await flushMicrotasksUntil(() => waitingForGpu)
    expect(compiled).toHaveLength(2)
    expect(compiled[0]).not.toBe(root)
    expect(compiled[1]).toBe(targetScene)
    expect(compiledRepresentativeCounts).toEqual([1, 0])
    expect(root.parent).toBeNull()
    expect(progress).toEqual([
      { completed: 0, total: 3 },
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
    ])
    gpu.resolve()
    expect(await pending).toBe('ready')
    expect(progress.at(-1)).toEqual({ completed: 3, total: 3 })
    coordinator.dispose()
  })

  test('never credits the final unit or readiness when GPU completion fails', async () => {
    const gpu = deferred<void>()
    const progress: unknown[] = []
    const statuses: unknown[] = []
    let waitingForGpu = false
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      prewarmPresentationPipeline: async () => undefined,
    })
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: {
          backend: {
            device: {
              queue: {
                onSubmittedWorkDone: () => {
                  waitingForGpu = true
                  return gpu.promise
                },
              },
            },
          },
          compileAsync: async () => undefined,
          isWebGPURenderer: true,
        },
        representatives: [{ key: 'root', root: new Group() }],
        targetScene: new Scene(),
      },
      (status) => statuses.push(status),
      (snapshot) => progress.push(snapshot),
    )
    await flushMicrotasksUntil(() => waitingForGpu)
    gpu.reject(new Error('device lost'))
    expect(await pending).toBe('failed')
    expect(progress).toEqual([
      { completed: 0, total: 4 },
      { completed: 1, total: 4 },
      { completed: 2, total: 4 },
      { completed: 3, total: 4 },
    ])
    expect(statuses).toEqual([{ message: 'device lost', state: 'failed' }])
    coordinator.dispose()
  })

  test('bounds an unresponsive WebGPU queue without treating the deadline as readiness', async () => {
    const timer = createFakeRenderReadinessTimer()
    const pending = waitForZombieEscapeGpuPreparation(
      {
        backend: { device: { queue: { onSubmittedWorkDone: () => new Promise<void>(() => {}) } } },
        compileAsync: async () => undefined,
        isWebGPURenderer: true,
      },
      undefined,
      timer.timer,
    )
    expect(timer.pendingCount).toBe(1)
    timer.fireAll()
    await expect(pending).rejects.toThrow('did not finish before its deadline')
    expect(timer.pendingCount).toBe(0)
    expect(timer.clearCount).toBe(1)
  })

  test('keeps the complete registered set behind readiness until GPU submissions finish', async () => {
    const gpu = deferred<void>()
    const exactPipelineRender = deferred<void>()
    const roots = [new Group(), new Group(), new Group()]
    const parent = new Group()
    const before = new Group()
    const between = new Group()
    const after = new Group()
    parent.add(before, roots[0]!, between, roots[1]!, roots[2]!, after)
    const originalChildren = [...parent.children]
    const compiled: Object3D[] = []
    const compiledRepresentativeCounts: number[] = []
    const statuses: string[] = []
    const progress: Array<Readonly<{ completed: number; total: number }>> = []
    const targetScene = new Scene()
    const prewarmRenderPaths: Array<'direct' | 'presentation' | undefined> = []
    let waitingForExactPipelineRender = false
    let waitingForGpu = false
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      prewarmPresentationPipeline: async ({ renderPath, representatives }) => {
        prewarmRenderPaths.push(renderPath)
        waitingForExactPipelineRender = true
        expect(representatives.map(({ root }) => root)).toEqual(roots)
        expect(parent.children).toEqual(originalChildren)
        for (const root of roots) expect(root.parent).toBe(parent)
        await exactPipelineRender.promise
      },
    })
    const result = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: {
          backend: {
            device: {
              queue: {
                onSubmittedWorkDone: () => {
                  waitingForGpu = true
                  return gpu.promise
                },
              },
            },
          },
          compileAsync: async (root) => {
            compiled.push(root)
            let representativeCount = 0
            root.traverse((object) => {
              if (roots.includes(object as Group)) representativeCount += 1
            })
            compiledRepresentativeCounts.push(representativeCount)
          },
          isWebGPURenderer: true,
        },
        representatives: roots.map((root, index) => ({ key: String(index), root })),
        targetScene,
      },
      ({ state }) => statuses.push(state),
      (snapshot) => progress.push(snapshot),
    )
    await flushMicrotasksUntil(() => waitingForExactPipelineRender)
    expect(compiled).toHaveLength(1)
    expect(new Set(compiled).size).toBe(1)
    expect(roots).not.toContain(compiled[0])
    expect(compiledRepresentativeCounts).toEqual([3])
    expect(parent.children).toEqual(originalChildren)
    for (const root of roots) expect(root.parent).toBe(parent)
    expect(waitingForGpu).toBe(false)
    expect(progress).toEqual([
      { completed: 0, total: 4 },
      { completed: 1, total: 4 },
    ])
    exactPipelineRender.resolve()
    await flushMicrotasksUntil(() => waitingForGpu)
    expect(waitingForGpu).toBe(true)
    expect(compiled).toHaveLength(1)
    expect(compiledRepresentativeCounts).toEqual([3])
    expect(prewarmRenderPaths).toEqual(['presentation', 'direct'])
    expect(statuses).toEqual([])
    expect(progress).toEqual([
      { completed: 0, total: 4 },
      { completed: 1, total: 4 },
      { completed: 2, total: 4 },
      { completed: 3, total: 4 },
    ])
    gpu.resolve()
    expect(await result).toBe('ready')
    expect(statuses).toEqual(['ready'])
    expect(progress.at(-1)).toEqual({ completed: 4, total: 4 })
    coordinator.dispose()
  })

  test('does not report GPU readiness when queue submission rejects or no fence exists', async () => {
    await expect(
      waitForZombieEscapeGpuPreparation({
        backend: {
          device: {
            queue: { onSubmittedWorkDone: async () => Promise.reject(new Error('device lost')) },
          },
        },
        compileAsync: async () => undefined,
        isWebGPURenderer: true,
      }),
    ).rejects.toThrow('device lost')
    await expect(
      waitForZombieEscapeGpuPreparation({
        compileAsync: async () => undefined,
        isWebGPURenderer: true,
      }),
    ).rejects.toThrow('requires a live GPU queue or WebGL2 fence')
  })

  test('flushes WebGL work and yields without blocking until the exact fence signals', async () => {
    const timer = createFakeRenderReadinessTimer()
    const events: string[] = []
    const fence = {}
    let polls = 0
    const context = {
      ALREADY_SIGNALED: 1,
      CONDITION_SATISFIED: 2,
      SYNC_GPU_COMMANDS_COMPLETE: 3,
      TIMEOUT_EXPIRED: 4,
      clientWaitSync(value: unknown, flags: number, timeout: number) {
        expect(value).toBe(fence)
        expect(flags).toBe(0)
        expect(timeout).toBe(0)
        events.push('poll')
        return ++polls === 1 ? 4 : 2
      },
      deleteSync(value: unknown) {
        expect(value).toBe(fence)
        events.push('delete')
      },
      fenceSync(condition: number, flags: number) {
        expect(condition).toBe(3)
        expect(flags).toBe(0)
        events.push('fence')
        return fence
      },
      flush: () => events.push('flush'),
      isContextLost: () => false,
    }
    await waitForZombieEscapeGpuPreparation(
      { backend: { gl: context }, compileAsync: async () => undefined, isWebGPURenderer: true },
      async () => {
        events.push('frame')
      },
      timer.timer,
    )
    expect(events).toEqual(['fence', 'flush', 'frame', 'poll', 'frame', 'poll', 'delete'])
    expect(timer.pendingCount).toBe(0)
    expect(timer.clearCount).toBe(1)
    expect(timer.scheduledDelays).toEqual([ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS])
    timer.fireAll()
    expect(events).toEqual(['fence', 'flush', 'frame', 'poll', 'frame', 'poll', 'delete'])
  })

  test('bounds a stalled WebGL admission and never polls or deletes again after late resumption', async () => {
    for (const resume of ['resolve', 'reject'] as const) {
      const timer = createFakeRenderReadinessTimer()
      const admission = deferred<void>()
      const events: string[] = []
      const fence = {}
      const context = {
        ALREADY_SIGNALED: 1,
        CONDITION_SATISFIED: 2,
        SYNC_GPU_COMMANDS_COMPLETE: 3,
        TIMEOUT_EXPIRED: 4,
        clientWaitSync() {
          events.push('poll')
          return 2
        },
        deleteSync(value: unknown) {
          expect(value).toBe(fence)
          events.push('delete')
        },
        fenceSync: () => fence,
        flush: () => events.push('flush'),
        isContextLost() {
          events.push('context')
          return false
        },
      }
      const pending = waitForZombieEscapeGpuPreparation(
        { backend: { gl: context }, compileAsync: async () => undefined, isWebGPURenderer: true },
        () => {
          events.push('frame')
          return admission.promise
        },
        timer.timer,
      )
      expect(events).toEqual(['context', 'flush', 'frame'])
      expect(timer.pendingCount).toBe(1)
      expect(timer.scheduledDelays).toEqual([ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS])
      timer.fireAll()
      await expect(pending).rejects.toThrow('did not finish before its deadline')
      expect(events).toEqual(['context', 'flush', 'frame', 'delete'])
      expect(timer.pendingCount).toBe(0)
      expect(timer.clearCount).toBe(1)

      if (resume === 'resolve') admission.resolve()
      else admission.reject(new Error('late admission rejection'))
      await admission.promise.catch(() => undefined)
      await Promise.resolve()
      expect(events).toEqual(['context', 'flush', 'frame', 'delete'])
      expect(timer.clearCount).toBe(1)
    }
  })

  test('clears the WebGL deadline and deletes the fence once on flush failure or context loss', async () => {
    for (const failure of ['flush', 'context'] as const) {
      const timer = createFakeRenderReadinessTimer()
      let lost = false
      let deleteCount = 0
      let pollCount = 0
      const context = {
        clientWaitSync() {
          pollCount += 1
          return 0
        },
        deleteSync() {
          deleteCount += 1
        },
        fenceSync: () => ({}),
        flush() {
          if (failure === 'flush') throw new Error('flush failed')
        },
        isContextLost: () => lost,
      }
      await expect(
        waitForZombieEscapeGpuPreparation(
          { backend: { gl: context }, compileAsync: async () => undefined, isWebGPURenderer: true },
          async () => {
            lost = true
          },
          timer.timer,
        ),
      ).rejects.toThrow(failure === 'flush' ? 'flush failed' : 'context was lost while waiting')
      expect(deleteCount).toBe(1)
      expect(pollCount).toBe(0)
      expect(timer.pendingCount).toBe(0)
      expect(timer.clearCount).toBe(1)
      timer.fireAll()
      expect(deleteCount).toBe(1)
    }
  })

  test('deletes the WebGL fence when an admission wait fails', async () => {
    const timer = createFakeRenderReadinessTimer()
    let deleteCount = 0
    const context = {
      clientWaitSync: () => 0,
      deleteSync: () => {
        deleteCount += 1
      },
      fenceSync: () => ({}),
      flush: () => undefined,
      isContextLost: () => false,
    }
    await expect(
      waitForZombieEscapeGpuPreparation(
        { getContext: () => context, compileAsync: async () => undefined },
        async () => {
          throw new Error('admission aborted')
        },
        timer.timer,
      ),
    ).rejects.toThrow('admission aborted')
    expect(deleteCount).toBe(1)
    expect(timer.pendingCount).toBe(0)
    expect(timer.clearCount).toBe(1)
  })
})

describe('Zombie Escape render readiness coordinator', () => {
  test('deduplicates one pending compile for the exact current request', async () => {
    let calls = 0
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => {
        calls += 1
        throw new Error('pipeline unavailable')
      },
    })
    const request = {
      camera: new PerspectiveCamera(),
      generation: 3,
      identity: {},
      renderer: { compileAsync: async () => undefined },
      representatives: [{ key: 'root', root: new Group() }],
      targetScene: new Scene(),
    }
    const terminals: unknown[] = []
    const first = coordinator.request(request, (status) => terminals.push(status))
    const duplicate = coordinator.request(request, (status) => terminals.push(status))
    expect(duplicate).toBe(first)
    expect(await first).toBe('failed')
    expect(calls).toBe(1)
    expect(terminals).toEqual([
      { message: 'pipeline unavailable', state: 'failed' },
      { message: 'pipeline unavailable', state: 'failed' },
    ])
  })

  test('replays a settled terminal status to a same-request subscriber', async () => {
    let calls = 0
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => {
        calls += 1
      },
    })
    const request = {
      camera: new PerspectiveCamera(),
      generation: 5,
      identity: {},
      renderer: { compileAsync: async () => undefined },
      representatives: [{ key: 'root', root: new Group() }],
      targetScene: new Scene(),
    }
    const firstStatuses: unknown[] = []
    const first = coordinator.request(request, (status) => firstStatuses.push(status))
    expect(await first).toBe('ready')
    const replayedStatuses: unknown[] = []
    const duplicate = coordinator.request(request, (status) => replayedStatuses.push(status))
    expect(duplicate).toBe(first)
    expect(await duplicate).toBe('ready')
    expect(calls).toBe(1)
    expect(firstStatuses).toEqual([{ state: 'ready' }])
    expect(replayedStatuses).toEqual([{ state: 'ready' }])
  })

  test('recompiles when the camera or target scene identity changes', async () => {
    let calls = 0
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => {
        calls += 1
      },
    })
    const camera = new PerspectiveCamera()
    const replacementCamera = new PerspectiveCamera()
    const targetScene = new Scene()
    const common = {
      generation: 2,
      identity: {},
      renderer: { compileAsync: async () => undefined },
      representatives: [{ key: 'root', root: new Group() }],
    }
    expect(await coordinator.request({ ...common, camera, targetScene }, () => undefined)).toBe(
      'ready',
    )
    expect(
      await coordinator.request(
        { ...common, camera: replacementCamera, targetScene },
        () => undefined,
      ),
    ).toBe('ready')
    expect(
      await coordinator.request(
        { ...common, camera: replacementCamera, targetScene: new Scene() },
        () => undefined,
      ),
    ).toBe('ready')
    expect(calls).toBe(3)
  })

  test('fences stale generations and serializes their compilation', async () => {
    const firstCompile = deferred<void>()
    const secondCompile = deferred<void>()
    let calls = 0
    let active = 0
    let maximumActive = 0
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        const pending = calls++ === 0 ? firstCompile : secondCompile
        await pending.promise
        active -= 1
      },
    })
    const renderer = { compileAsync: async () => undefined }
    const common = {
      camera: new PerspectiveCamera(),
      renderer,
      representatives: [{ key: 'root', root: new Group() }],
      targetScene: new Scene(),
    }
    const terminals: string[] = []
    const first = coordinator.request({ ...common, generation: 1, identity: {} }, () =>
      terminals.push('first'),
    )
    await Promise.resolve()
    const second = coordinator.request({ ...common, generation: 2, identity: {} }, () =>
      terminals.push('second'),
    )
    firstCompile.resolve()
    expect(await first).toBe('stale')
    await flushMicrotasksUntil(() => calls === 2)
    expect(calls).toBe(2)
    secondCompile.resolve()
    expect(await second).toBe('ready')
    expect(terminals).toEqual(['second'])
    expect(maximumActive).toBe(1)
  })

  test('ignores unmount and device-context completions', async () => {
    for (const fence of ['unmount', 'device'] as const) {
      const compilation = deferred<void>()
      const device = {}
      const renderer = { backend: { device }, compileAsync: async () => undefined }
      const coordinator = createZombieEscapeRenderReadinessCoordinator({
        compile: async () => compilation.promise,
      })
      let terminal = false
      const pending = coordinator.request(
        {
          camera: new PerspectiveCamera(),
          generation: 1,
          identity: {},
          renderer,
          representatives: [{ key: 'root', root: new Group() }],
          targetScene: new Scene(),
        },
        () => {
          terminal = true
        },
      )
      await Promise.resolve()
      if (fence === 'unmount') coordinator.dispose()
      else renderer.backend.device = {}
      compilation.resolve()
      expect(await pending).toBe('stale')
      expect(terminal).toBe(false)
    }
  })

  test('warns without settling on timeout and reports late success', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const compilation = deferred<void>()
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => compilation.promise,
      timer: fakeTimer.timer,
    })
    const terminals: unknown[] = []
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: { compileAsync: async () => undefined },
        representatives: [{ key: 'root', root: new Group() }],
        targetScene: new Scene(),
      },
      (status) => terminals.push(status),
    )
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1)
    expect(fakeTimer.pendingCount).toBe(1)
    fakeTimer.fireAll()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(terminals).toEqual([
      {
        message: `Zombie Escape render readiness timed out after ${String(
          ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
        )}ms.`,
        state: 'degraded',
      },
    ])
    expect(fakeTimer.pendingCount).toBe(0)
    expect(fakeTimer.clearCount).toBe(0)
    compilation.resolve()
    expect(await pending).toBe('ready')
    expect(terminals).toEqual([
      {
        message: `Zombie Escape render readiness timed out after ${String(
          ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
        )}ms.`,
        state: 'degraded',
      },
      { state: 'ready' },
    ])
    expect(fakeTimer.clearCount).toBe(0)
  })

  test('replays degraded status to an exact duplicate and keeps it subscribed for late ready', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const compilation = deferred<void>()
    let calls = 0
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => {
        calls += 1
        await compilation.promise
      },
      timer: fakeTimer.timer,
    })
    const request = {
      camera: new PerspectiveCamera(),
      generation: 1,
      identity: {},
      renderer: { compileAsync: async () => undefined },
      representatives: [{ key: 'root', root: new Group() }],
      targetScene: new Scene(),
    }
    const firstStatuses: string[] = []
    const duplicateStatuses: string[] = []
    const first = coordinator.request(request, (status) => firstStatuses.push(status.state))
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1 && calls === 1)
    fakeTimer.fireAll()
    const duplicate = coordinator.request(request, (status) => duplicateStatuses.push(status.state))
    expect(duplicate).toBe(first)
    expect(firstStatuses).toEqual(['degraded'])
    expect(duplicateStatuses).toEqual(['degraded'])
    compilation.resolve()
    expect(await duplicate).toBe('ready')
    expect(calls).toBe(1)
    expect(firstStatuses).toEqual(['degraded', 'ready'])
    expect(duplicateStatuses).toEqual(['degraded', 'ready'])
  })

  test('reports a real late compilation failure after the warning threshold', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const compilation = deferred<void>()
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => compilation.promise,
      timer: fakeTimer.timer,
    })
    const terminals: unknown[] = []
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: { compileAsync: async () => undefined },
        representatives: [{ key: 'root', root: new Group() }],
        targetScene: new Scene(),
      },
      (status) => terminals.push(status),
    )
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1)
    fakeTimer.fireAll()
    compilation.reject(new Error('pipeline compilation failed'))
    expect(await pending).toBe('failed')
    expect(terminals).toEqual([
      {
        message: `Zombie Escape render readiness timed out after ${String(
          ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
        )}ms.`,
        state: 'degraded',
      },
      { message: 'pipeline compilation failed', state: 'failed' },
    ])
  })

  test('clears the whole-request watchdog on normal settlement', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const compilation = deferred<void>()
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => compilation.promise,
      timer: fakeTimer.timer,
    })
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: { compileAsync: async () => undefined },
        representatives: [{ key: 'root', root: new Group() }],
        targetScene: new Scene(),
      },
      () => undefined,
    )
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1)
    compilation.resolve()
    expect(await pending).toBe('ready')
    expect(fakeTimer.pendingCount).toBe(0)
    expect(fakeTimer.clearCount).toBe(1)
  })

  test('suppresses a timeout terminal after the renderer device becomes stale', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const compilation = deferred<void>()
    const renderer = { backend: { device: {} }, compileAsync: async () => undefined }
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => compilation.promise,
      timer: fakeTimer.timer,
    })
    let terminal = false
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer,
        representatives: [{ key: 'root', root: new Group() }],
        targetScene: new Scene(),
      },
      () => {
        terminal = true
      },
    )
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1)
    renderer.backend.device = {}
    fakeTimer.fireAll()
    compilation.resolve()
    expect(await pending).toBe('stale')
    expect(terminal).toBe(false)
    expect(fakeTimer.pendingCount).toBe(0)
    expect(fakeTimer.clearCount).toBe(0)
  })

  test('suppresses a timeout terminal after unmount', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const compilation = deferred<void>()
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => compilation.promise,
      timer: fakeTimer.timer,
    })
    let terminal = false
    const pending = coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: { compileAsync: async () => undefined },
        representatives: [{ key: 'root', root: new Group() }],
        targetScene: new Scene(),
      },
      () => {
        terminal = true
      },
    )
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1)
    coordinator.dispose()
    fakeTimer.fireAll()
    compilation.resolve()
    expect(await pending).toBe('stale')
    expect(terminal).toBe(false)
    expect(fakeTimer.pendingCount).toBe(0)
    expect(fakeTimer.clearCount).toBe(1)
  })

  test('serializes identity changes behind a timed-out non-cancelable compilation', async () => {
    const fakeTimer = createFakeRenderReadinessTimer()
    const firstCompile = deferred<void>()
    const secondCompile = deferred<void>()
    let active = 0
    let calls = 0
    let maximumActive = 0
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        const compilation = calls++ === 0 ? firstCompile : secondCompile
        await compilation.promise
        active -= 1
      },
      timer: fakeTimer.timer,
    })
    const common = {
      camera: new PerspectiveCamera(),
      identity: {},
      renderer: { compileAsync: async () => undefined },
      representatives: [{ key: 'root', root: new Group() }],
      targetScene: new Scene(),
    }
    const terminals: string[] = []
    const first = coordinator.request({ ...common, generation: 1 }, (status) =>
      terminals.push(`first:${status.state}`),
    )
    await flushMicrotasksUntil(() => fakeTimer.pendingCount === 1)
    fakeTimer.fireAll()
    expect(terminals).toEqual(['first:degraded'])
    const second = coordinator.request({ ...common, generation: 2 }, (status) =>
      terminals.push(`second:${status.state}`),
    )
    await Promise.resolve()
    expect(calls).toBe(1)
    expect(maximumActive).toBe(1)
    expect(fakeTimer.pendingCount).toBe(1)
    fakeTimer.fireAll()
    expect(terminals).toEqual(['first:degraded', 'second:degraded'])
    firstCompile.resolve()
    expect(await first).toBe('stale')
    await flushMicrotasksUntil(() => calls === 2)
    expect(calls).toBe(2)
    secondCompile.resolve()
    expect(await second).toBe('ready')
    expect(terminals).toEqual(['first:degraded', 'second:degraded', 'second:ready'])
    expect(maximumActive).toBe(1)
    expect(fakeTimer.pendingCount).toBe(0)
    expect(fakeTimer.clearCount).toBe(0)
  })
})
