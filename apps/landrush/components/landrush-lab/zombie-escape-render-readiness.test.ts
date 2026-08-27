import { describe, expect, test } from 'bun:test'
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry } from 'three'
import {
  compileZombieEscapeRenderRepresentatives,
  createZombieEscapeHeldWeaponRenderRepresentativeKey,
  createZombieEscapeRenderReadinessCoordinator,
  createZombieEscapeRenderReadinessRegistry,
  createZombieEscapeZombieRenderRepresentativeKey,
  getZombieEscapeRenderRepresentativeKeys,
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
  const timer: ZombieEscapeRenderReadinessTimer = {
    clear(handle) {
      clearCount += 1
      callbacks.delete(handle as number)
    },
    schedule(callback) {
      const handle = nextHandle
      nextHandle += 1
      callbacks.set(handle, callback)
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
    fireAll() {
      const pendingCallbacks = Array.from(callbacks.values())
      callbacks.clear()
      for (const callback of pendingCallbacks) callback()
    },
    timer,
  }
}

async function flushMicrotasksUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) {
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
  test('initializes first, compiles against the actual scene, and restores hidden flags before await', async () => {
    const fixture = createCompileFixture()
    const compilation = deferred<unknown>()
    const events: string[] = []
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
        expect(root).toBe(fixture.root)
        expect(fixture.ancestor.visible).toBe(true)
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
      expect(fixture.ancestor.visible).toBe(false)
      expect(fixture.root.visible).toBe(false)
      expect(fixture.child.visible).toBe(false)
      expect(fixture.mesh.visible).toBe(false)
      expect(fixture.mesh.frustumCulled).toBe(true)
      fixture.mesh.geometry.dispose()
      fixture.mesh.material.dispose()
    }
  })

  test('serializes roots instead of compiling a pool concurrently', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const roots = [new Group(), new Group()]
    let active = 0
    let maximumActive = 0
    let calls = 0
    const renderer: ZombieEscapePipelineRenderer = {
      async compileAsync() {
        active += 1
        maximumActive = Math.max(maximumActive, active)
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
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(2)
    second.resolve(undefined)
    await pending
    expect(calls).toBe(3)
    expect(maximumActive).toBe(1)
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

  test('releases loading as degraded on timeout and upgrades after late success', async () => {
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

  test('reports a real late compilation failure after degraded release', async () => {
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
