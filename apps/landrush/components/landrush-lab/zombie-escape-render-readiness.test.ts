import { describe, expect, test } from 'bun:test'
import { LANDRUSH_ROBOT_STAGED_TEXTURE_EXPECTED } from '@landrush/pascal-plugin/landrush-world/robot'
import type { Box2, Camera, Object3D, Texture, Vector2 } from 'three'
import {
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector4,
} from 'three'
import {
  collectZombieEscapeWebGLRealizationUnits,
  compileZombieEscapeRenderRepresentatives,
  createZombieEscapeHeldWeaponRenderRepresentativeKey,
  createZombieEscapeRenderReadinessCoordinator,
  createZombieEscapeRenderReadinessRegistry,
  createZombieEscapeRenderReadinessSnapshotSelector,
  createZombieEscapeRenderRepresentativePrewarmQueue,
  createZombieEscapeZombieRenderRepresentativeKey,
  getZombieEscapeRenderRepresentativeKeys,
  planZombieEscapeWebGLRealizationCohorts,
  stageZombieEscapeWebGLTextures,
  ZOMBIE_ESCAPE_FALLBACK_RENDER_REPRESENTATIVE_KEY,
  ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
  ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORT_WEIGHT,
  ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS,
  ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_MAX_BYTES,
  type ZombieEscapePipelineRenderer,
  type ZombieEscapeRenderReadinessCoordinator,
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

const WEBGL_FENCE_STATUS = {
  alreadySignaled: 1,
  conditionSatisfied: 2,
  timeoutExpired: 3,
  waitFailed: 4,
} as const

function createWebGLRealizationRenderer({
  fenceStatuses = [],
  mutateTextureStateOnInit = false,
  onCopyTexture,
  onInitTexture,
  onRender,
  pixelUnpackBuffer = null,
}: {
  fenceStatuses?: number[]
  mutateTextureStateOnInit?: boolean
  onCopyTexture?: (
    source: Texture,
    destination: Texture,
    sourceRegion: Box2,
    destinationPosition: Vector2,
  ) => void
  onInitTexture?: (texture: Texture) => void
  onRender?: (scene: Scene, camera: Camera, call: number) => void
  pixelUnpackBuffer?: unknown
} = {}) {
  const events: string[] = []
  const renderTarget = { id: 'initial-target' }
  const state = {
    activeCubeFace: 2,
    activeMipmapLevel: 3,
    autoClear: false,
    renderTarget: renderTarget as unknown,
    scissor: new Vector4(5, 6, 7, 8),
    scissorTest: true,
    viewport: new Vector4(1, 2, 300, 200),
  }
  const initial = {
    ...state,
    scissor: state.scissor.clone(),
    viewport: state.viewport.clone(),
  }
  let deletedFences = 0
  let nextFence = 0
  let renderCalls = 0
  let currentPixelUnpackBuffer = pixelUnpackBuffer
  let currentTextureSlot = 20
  const textureResources = new WeakMap<object, { textureGPU: object }>()
  const textureBindings = new Map<number, unknown>([[currentTextureSlot, { id: 'bound-texture' }]])
  const pixelStore = new Map<number, boolean | number>()
  const context = {
    ACTIVE_TEXTURE: 13,
    ALREADY_SIGNALED: WEBGL_FENCE_STATUS.alreadySignaled,
    CONDITION_SATISFIED: WEBGL_FENCE_STATUS.conditionSatisfied,
    SYNC_GPU_COMMANDS_COMPLETE: 5,
    TIMEOUT_EXPIRED: WEBGL_FENCE_STATUS.timeoutExpired,
    WAIT_FAILED: WEBGL_FENCE_STATUS.waitFailed,
    PIXEL_UNPACK_BUFFER: 6,
    PIXEL_UNPACK_BUFFER_BINDING: 7,
    TEXTURE_2D: 14,
    TEXTURE_BINDING_2D: 15,
    UNPACK_ALIGNMENT: 16,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 19,
    UNPACK_FLIP_Y_WEBGL: 17,
    UNPACK_IMAGE_HEIGHT: 8,
    UNPACK_ROW_LENGTH: 9,
    UNPACK_SKIP_IMAGES: 10,
    UNPACK_SKIP_PIXELS: 11,
    UNPACK_SKIP_ROWS: 12,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 18,
    bindBuffer(target: number, buffer: unknown) {
      if (target !== context.PIXEL_UNPACK_BUFFER) throw new Error('unexpected buffer target')
      currentPixelUnpackBuffer = buffer
      events.push(buffer === null ? 'unpack-buffer:null' : 'unpack-buffer:restore')
    },
    clientWaitSync() {
      events.push('fence:poll')
      return fenceStatuses.shift() ?? WEBGL_FENCE_STATUS.conditionSatisfied
    },
    deleteSync() {
      deletedFences += 1
      events.push('fence:delete')
    },
    fenceSync() {
      nextFence += 1
      events.push('fence:create')
      return { id: nextFence }
    },
    flush() {
      events.push('fence:flush')
    },
    getParameter(parameter: number) {
      if (parameter === context.ACTIVE_TEXTURE) return currentTextureSlot
      if (parameter === context.TEXTURE_BINDING_2D) {
        return textureBindings.get(currentTextureSlot) ?? null
      }
      if (parameter === context.PIXEL_UNPACK_BUFFER_BINDING) return currentPixelUnpackBuffer
      const value = pixelStore.get(parameter)
      if (value === undefined) throw new Error('unexpected WebGL parameter')
      return value
    },
  }
  for (const parameter of [
    context.UNPACK_IMAGE_HEIGHT,
    context.UNPACK_ALIGNMENT,
    context.UNPACK_COLORSPACE_CONVERSION_WEBGL,
    context.UNPACK_FLIP_Y_WEBGL,
    context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    context.UNPACK_ROW_LENGTH,
    context.UNPACK_SKIP_IMAGES,
    context.UNPACK_SKIP_PIXELS,
    context.UNPACK_SKIP_ROWS,
  ]) {
    pixelStore.set(
      parameter,
      parameter === context.UNPACK_FLIP_Y_WEBGL ||
        parameter === context.UNPACK_PREMULTIPLY_ALPHA_WEBGL
        ? false
        : parameter * 10,
    )
  }
  const backend = {
    copyTextureToTexture(
      source: Texture,
      destination: Texture,
      sourceRegion: Box2,
      destinationPosition: Vector2,
    ) {
      events.push('texture:copy')
      onCopyTexture?.(source, destination, sourceRegion, destinationPosition)
    },
    get(value: object) {
      return textureResources.get(value) ?? {}
    },
    has(value: object) {
      return textureResources.has(value)
    },
    isWebGLBackend: true as const,
    state: {
      activeTexture(slot: number) {
        currentTextureSlot = slot
      },
      bindTexture(_type: number, texture: unknown, slot = currentTextureSlot) {
        currentTextureSlot = slot
        textureBindings.set(slot, texture)
      },
      getParameter(parameter: number) {
        return pixelStore.get(parameter)
      },
      pixelStorei(parameter: number, value: boolean | number) {
        pixelStore.set(parameter, value)
      },
    },
  }
  const renderer = {
    backend,
    get autoClear() {
      return state.autoClear
    },
    set autoClear(value: boolean) {
      state.autoClear = value
    },
    async compileAsync(root: Object3D) {
      events.push(root.isScene ? 'compile:scene' : 'compile:renderable')
    },
    getActiveCubeFace: () => state.activeCubeFace,
    getActiveMipmapLevel: () => state.activeMipmapLevel,
    getContext: () => context,
    getRenderTarget: () => state.renderTarget,
    getScissor(target: Vector4) {
      return target.copy(state.scissor)
    },
    getScissorTest: () => state.scissorTest,
    getViewport(target: Vector4) {
      return target.copy(state.viewport)
    },
    initTexture(texture: Texture) {
      events.push('texture:init')
      if (mutateTextureStateOnInit) {
        backend.state.activeTexture(998)
        backend.state.bindTexture(context.TEXTURE_2D, {}, 998)
        backend.state.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true)
        backend.state.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
        backend.state.pixelStorei(context.UNPACK_ALIGNMENT, 8)
        backend.state.pixelStorei(context.UNPACK_COLORSPACE_CONVERSION_WEBGL, 999)
      }
      if (!textureResources.has(texture)) textureResources.set(texture, { textureGPU: {} })
      onInitTexture?.(texture)
    },
    render(scene: Scene, camera: Camera) {
      renderCalls += 1
      events.push(scene.children.length === 0 ? 'render:empty' : 'render:scene')
      onRender?.(scene, camera, renderCalls)
    },
    setRenderTarget(target: unknown, activeCubeFace = 0, activeMipmapLevel = 0) {
      state.renderTarget = target
      state.activeCubeFace = activeCubeFace
      state.activeMipmapLevel = activeMipmapLevel
    },
    setScissor(scissor: Vector4) {
      state.scissor.copy(scissor)
    },
    setScissorTest(enabled: boolean) {
      state.scissorTest = enabled
    },
    setViewport(viewport: Vector4) {
      state.viewport.copy(viewport)
    },
  } as unknown as ZombieEscapePipelineRenderer

  return {
    backend,
    context,
    get deletedFences() {
      return deletedFences
    },
    events,
    initial,
    invalidateTexture(texture: Texture) {
      textureResources.delete(texture)
    },
    replaceTextureResource(texture: Texture) {
      textureResources.set(texture, { textureGPU: {} })
    },
    renderer,
    state,
    get pixelUnpackBuffer() {
      return currentPixelUnpackBuffer
    },
    get pixelStore() {
      return new Map(pixelStore)
    },
    get textureState() {
      return {
        activeTexture: currentTextureSlot,
        texture2D: textureBindings.get(currentTextureSlot) ?? null,
      }
    },
  }
}

function makeHeavyRealizationMesh(name: string) {
  const mesh = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial()) as Mesh & {
    count: number
    isInstancedMesh: boolean
  }
  mesh.name = name
  mesh.count = 1_000_000
  mesh.isInstancedMesh = true
  return mesh
}

function createDeferredRobotTexture(pixels: Uint8Array, width: number, height: number) {
  const texture = new DataTexture(pixels, width, height)
  texture.userData.landrushRobotStagedTextureUpload = true
  texture.source.dataReady = false
  texture.needsUpdate = true
  return texture
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
    expect(keys).toContain(ZOMBIE_ESCAPE_FALLBACK_RENDER_REPRESENTATIVE_KEY)
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

  test('selects strict critical coverage with stable identity across cosmetic registration', () => {
    const registry = createZombieEscapeRenderReadinessRegistry(['critical', 'cosmetic'])
    const selectCritical = createZombieEscapeRenderReadinessSnapshotSelector(['critical'])
    expect(selectCritical(registry.getSnapshot())).toMatchObject({
      complete: false,
      missingKeys: ['critical'],
    })
    const unregisterCritical = registry.register('critical', new Group())
    const ready = selectCritical(registry.getSnapshot())
    expect(ready).toMatchObject({ complete: true, missingKeys: [] })
    const unregisterCosmetic = registry.register('cosmetic', new Group())
    expect(selectCritical(registry.getSnapshot())).toBe(ready)
    unregisterCosmetic()
    expect(selectCritical(registry.getSnapshot())).toBe(ready)
    unregisterCritical()
  })
})

describe('Zombie Escape render compilation', () => {
  test('initializes first, compiles against the actual scene, and restores hidden flags before await', async () => {
    const fixture = createCompileFixture()
    const compilation = deferred<unknown>()
    const events: string[] = []
    const renderer: ZombieEscapePipelineRenderer = {
      async compileAsync(root, camera, targetScene) {
        events.push('compile:renderable')
        expect(camera).toBe(fixture.camera)
        expect(targetScene).toBe(fixture.targetScene)
        expect(root).toBe(fixture.mesh)
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
    expect(events).toEqual(['init', 'compile:renderable'])
    expect(fixture.ancestor.visible).toBe(false)
    expect(fixture.root.visible).toBe(false)
    expect(fixture.child.visible).toBe(false)
    expect(fixture.child.frustumCulled).toBe(true)
    expect(fixture.mesh.visible).toBe(false)
    expect(fixture.mesh.frustumCulled).toBe(true)
    compilation.resolve(undefined)
    await pending
    expect(events).toEqual(['init', 'compile:renderable'])
    expect(fixture.ancestor.visible).toBe(false)
    expect(fixture.root.visible).toBe(false)
    expect(fixture.child.visible).toBe(false)
    expect(fixture.mesh.visible).toBe(false)
    expect(fixture.mesh.frustumCulled).toBe(true)
    fixture.mesh.geometry.dispose()
    fixture.mesh.material.dispose()
  })

  test('keeps targeted WebGPU prewarm but skips the unsafe whole-scene compile', async () => {
    const fixture = createCompileFixture()
    const compiledRoots: Object3D[] = []
    let initialized = false
    const renderer: ZombieEscapePipelineRenderer = {
      async compileAsync(root, camera, targetScene) {
        expect(camera).toBe(fixture.camera)
        expect(targetScene).toBe(fixture.targetScene)
        compiledRoots.push(root)
      },
      init() {
        initialized = true
      },
      isWebGPURenderer: true,
    }

    await compileZombieEscapeRenderRepresentatives({
      camera: fixture.camera,
      renderer,
      representatives: [{ key: 'hidden', root: fixture.root }],
      targetScene: fixture.targetScene,
    })

    expect(initialized).toBe(true)
    expect(compiledRoots).toEqual([fixture.mesh])
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

  test('serializes renderables with one admission opportunity after each compile', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const roots = [
      new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial()),
      new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial()),
    ]
    let active = 0
    let admissionOpportunities = 0
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
    const pending = compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer,
        representatives: roots.map((root, index) => ({ key: String(index), root })),
        targetScene: new Scene(),
      },
      async () => {
        admissionOpportunities += 1
      },
    )
    await Promise.resolve()
    expect(calls).toBe(1)
    first.resolve(undefined)
    await flushMicrotasksUntil(() => calls === 2)
    expect(calls).toBe(2)
    second.resolve(undefined)
    await pending
    expect(calls).toBe(2)
    expect(maximumActive).toBe(1)
    expect(admissionOpportunities).toBe(2)
    for (const root of roots) {
      root.geometry.dispose()
      root.material.dispose()
    }
  })

  test('compiles an attached renderable once when representative roots overlap', async () => {
    const root = new Group()
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    root.add(mesh)
    const compiled: Object3D[] = []
    let admissionOpportunities = 0

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: {
          async compileAsync(renderable) {
            compiled.push(renderable)
          },
        },
        representatives: [
          { key: 'root', root },
          { key: 'mesh', root: mesh },
        ],
        targetScene: new Scene(),
      },
      async () => {
        admissionOpportunities += 1
      },
    )

    expect(compiled).toEqual([mesh])
    expect(admissionOpportunities).toBe(1)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('lets WebGPU compile the attached scene as one deduplicated pipeline batch', async () => {
    const targetScene = new Scene()
    const first = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    const second = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    targetScene.add(first, second)
    const compiled: Object3D[] = []
    let admissionOpportunities = 0

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: {
          backend: { device: {} },
          async compileAsync(root) {
            compiled.push(root)
          },
        },
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => {
        admissionOpportunities += 1
      },
    )

    expect(compiled).toEqual([targetScene])
    expect(admissionOpportunities).toBe(1)
    first.geometry.dispose()
    first.material.dispose()
    second.geometry.dispose()
    second.material.dispose()
  })

  test('collects each effective renderable once and plans deterministic bounded cohorts', () => {
    const targetScene = new Scene()
    const parent = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    const nested = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    const sibling = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    const hiddenParent = new Group()
    const hidden = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    parent.name = 'parent'
    nested.name = 'nested'
    sibling.name = 'sibling'
    hidden.name = 'hidden'
    hiddenParent.visible = false
    parent.add(nested)
    hiddenParent.add(hidden)
    targetScene.add(parent, sibling, hiddenParent)

    const units = collectZombieEscapeWebGLRealizationUnits(targetScene)
    expect(units.map(({ root }) => root.name)).toEqual(['parent', 'nested', 'sibling'])
    expect(units.map(({ renderables }) => renderables.map(({ name }) => name))).toEqual([
      ['parent'],
      ['nested'],
      ['sibling'],
    ])
    expect(units.flatMap(({ renderables }) => renderables)).toHaveLength(3)
    expect(new Set(units.flatMap(({ renderables }) => renderables)).size).toBe(3)
    expect(units.flatMap(({ renderables }) => renderables)).not.toContain(hidden)

    const weights = [2, 1, 3]
    const weightedUnits = units.map((unit, index) => ({ ...unit, weight: weights[index]! }))
    const firstPlan = planZombieEscapeWebGLRealizationCohorts(weightedUnits, {
      maxCohorts: 2,
      maxWeight: 3,
    })
    const secondPlan = planZombieEscapeWebGLRealizationCohorts(weightedUnits, {
      maxCohorts: 2,
      maxWeight: 3,
    })
    expect(
      firstPlan.map(({ units: cohortUnits }) => cohortUnits.map(({ root }) => root.name)),
    ).toEqual([['parent', 'nested'], ['sibling']])
    expect(
      secondPlan.map(({ units: cohortUnits }) => cohortUnits.map(({ root }) => root.name)),
    ).toEqual([['parent', 'nested'], ['sibling']])
    expect(firstPlan.every(({ weight }) => weight <= 3)).toBe(true)
    expect(() =>
      planZombieEscapeWebGLRealizationCohorts(weightedUnits, {
        maxCohorts: 1,
        maxWeight: 3,
      }),
    ).toThrow('bounded maximum is 1')
    expect(ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORT_WEIGHT).toBeGreaterThan(0)
    expect(ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS).toBeGreaterThan(0)

    for (const mesh of [parent, nested, sibling, hidden]) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  })

  test('uploads the deferred robot texture in exact fenced 64 KiB row regions per backend', async () => {
    const width = 512
    const height = 512
    const pixels = new Uint8Array(width * height * 4)
    const texture = createDeferredRobotTexture(pixels, width, height)
    const material = new MeshBasicMaterial({ map: texture })
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), material)
    const targetScene = new Scene()
    targetScene.add(mesh)
    const previousPixelUnpackBuffer = { id: 'previous-pbo' }
    const copies: Array<{
      bytes: number
      destination: Texture
      destinationY: number
      maxY: number
      minY: number
      source: Texture
      width: number
    }> = []
    const harness = createWebGLRealizationRenderer({
      mutateTextureStateOnInit: true,
      onCopyTexture(source, destination, sourceRegion, destinationPosition) {
        copies.push({
          bytes: (sourceRegion.max.y - sourceRegion.min.y) * width * 4,
          destination,
          destinationY: destinationPosition.y,
          maxY: sourceRegion.max.y,
          minY: sourceRegion.min.y,
          source,
          width: sourceRegion.max.x - sourceRegion.min.x,
        })
      },
      pixelUnpackBuffer: previousPixelUnpackBuffer,
    })
    const previousPixelStore = harness.pixelStore
    const previousTextureState = harness.textureState
    let admissions = 0
    const waitForAdmissionOpportunity = async () => {
      admissions += 1
    }

    await stageZombieEscapeWebGLTextures(
      { renderer: harness.renderer, targetScene },
      waitForAdmissionOpportunity,
    )

    expect(harness.events.filter((event) => event === 'texture:init')).toHaveLength(1)
    expect(copies).toHaveLength(16)
    expect(copies.map(({ minY, maxY }) => [minY, maxY])).toEqual(
      Array.from({ length: 16 }, (_, index) => [index * 32, (index + 1) * 32]),
    )
    expect(copies.every(({ destinationY, minY }) => destinationY === minY)).toBe(true)
    expect(copies.every(({ width: copiedWidth }) => copiedWidth === width)).toBe(true)
    expect(copies.every(({ bytes }) => bytes <= ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_MAX_BYTES)).toBe(
      true,
    )
    expect(copies.reduce((total, { bytes }) => total + bytes, 0)).toBe(pixels.byteLength)
    expect(copies.every(({ destination }) => destination === texture)).toBe(true)
    expect(
      copies.every(
        ({ source }) =>
          source instanceof DataTexture &&
          source.image.data === pixels &&
          !harness.backend.has(source),
      ),
    ).toBe(true)
    expect(harness.events.filter((event) => event === 'fence:create')).toHaveLength(17)
    expect(harness.events.filter((event) => event === 'fence:delete')).toHaveLength(17)
    expect(admissions).toBe(34)
    expect(harness.pixelUnpackBuffer).toBe(previousPixelUnpackBuffer)
    expect(harness.pixelStore).toEqual(previousPixelStore)
    expect(harness.textureState).toEqual(previousTextureState)
    expect(texture.source.dataReady).toBe(false)

    await stageZombieEscapeWebGLTextures(
      { renderer: harness.renderer, targetScene },
      waitForAdmissionOpportunity,
    )
    expect(copies).toHaveLength(16)
    expect(admissions).toBe(34)

    harness.replaceTextureResource(texture)
    await stageZombieEscapeWebGLTextures(
      { renderer: harness.renderer, targetScene },
      waitForAdmissionOpportunity,
    )
    expect(copies).toHaveLength(32)
    expect(admissions).toBe(68)

    const replacementHarness = createWebGLRealizationRenderer()
    await stageZombieEscapeWebGLTextures(
      { renderer: replacementHarness.renderer, targetScene },
      async () => undefined,
    )
    expect(replacementHarness.events.filter((event) => event === 'texture:copy')).toHaveLength(16)

    mesh.geometry.dispose()
    material.dispose()
    texture.dispose()
  })

  test('waits for the expected suspended robot before compiling its staged texture', async () => {
    const targetScene = new Scene()
    const expectation = new Group()
    expectation.userData[LANDRUSH_ROBOT_STAGED_TEXTURE_EXPECTED] = true
    targetScene.add(expectation)
    const pixels = new Uint8Array(64 * 64 * 4)
    const texture = createDeferredRobotTexture(pixels, 64, 64)
    const material = new MeshBasicMaterial({ map: texture })
    const hoverMaterial = new MeshBasicMaterial()
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), hoverMaterial)
    mesh.userData.landrushOriginalMaterial = material
    const harness = createWebGLRealizationRenderer()
    let admissions = 0

    await stageZombieEscapeWebGLTextures({ renderer: harness.renderer, targetScene }, async () => {
      admissions += 1
      if (admissions === 2) expectation.add(mesh)
    })

    expect(admissions).toBe(6)
    expect(harness.events.filter((event) => event === 'texture:init')).toHaveLength(1)
    expect(harness.events.filter((event) => event === 'texture:copy')).toHaveLength(1)

    mesh.geometry.dispose()
    hoverMaterial.dispose()
    material.dispose()
    texture.dispose()
  })

  test('restores the unpack buffer after a failed row copy and retries from allocation', async () => {
    const pixels = new Uint8Array(64 * 64 * 4)
    const texture = createDeferredRobotTexture(pixels, 64, 64)
    const material = new MeshBasicMaterial({ map: texture })
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), material)
    const targetScene = new Scene()
    targetScene.add(mesh)
    const previousPixelUnpackBuffer = { id: 'previous-pbo' }
    let shouldThrow = true
    let harness!: ReturnType<typeof createWebGLRealizationRenderer>
    harness = createWebGLRealizationRenderer({
      onCopyTexture() {
        if (!shouldThrow) return
        harness.backend.state.activeTexture(999)
        harness.backend.state.bindTexture(harness.context.TEXTURE_2D, {}, 999)
        for (const parameter of [
          harness.context.UNPACK_ALIGNMENT,
          harness.context.UNPACK_FLIP_Y_WEBGL,
          harness.context.UNPACK_IMAGE_HEIGHT,
          harness.context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
          harness.context.UNPACK_ROW_LENGTH,
          harness.context.UNPACK_SKIP_IMAGES,
          harness.context.UNPACK_SKIP_PIXELS,
          harness.context.UNPACK_SKIP_ROWS,
        ]) {
          harness.backend.state.pixelStorei(parameter, 999)
        }
        throw new Error('injected row upload failure')
      },
      pixelUnpackBuffer: previousPixelUnpackBuffer,
    })
    const previousPixelStore = harness.pixelStore
    const previousTextureState = harness.textureState

    await expect(
      stageZombieEscapeWebGLTextures(
        { renderer: harness.renderer, targetScene },
        async () => undefined,
      ),
    ).rejects.toThrow('injected row upload failure')
    expect(harness.pixelUnpackBuffer).toBe(previousPixelUnpackBuffer)
    expect(harness.pixelStore).toEqual(previousPixelStore)
    expect(harness.textureState).toEqual(previousTextureState)
    expect(harness.events.slice(-3)).toEqual([
      'unpack-buffer:null',
      'texture:copy',
      'unpack-buffer:restore',
    ])

    shouldThrow = false
    await stageZombieEscapeWebGLTextures(
      { renderer: harness.renderer, targetScene },
      async () => undefined,
    )
    expect(harness.events.filter((event) => event === 'texture:init')).toHaveLength(2)
    expect(harness.events.filter((event) => event === 'texture:copy')).toHaveLength(2)
    expect(harness.pixelUnpackBuffer).toBe(previousPixelUnpackBuffer)

    mesh.geometry.dispose()
    material.dispose()
    texture.dispose()
  })

  test('restores texture and unpack state when staged allocation throws', async () => {
    const pixels = new Uint8Array(64 * 64 * 4)
    const texture = createDeferredRobotTexture(pixels, 64, 64)
    const material = new MeshBasicMaterial({ map: texture })
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), material)
    const targetScene = new Scene()
    targetScene.add(mesh)
    const harness = createWebGLRealizationRenderer({
      mutateTextureStateOnInit: true,
      onInitTexture() {
        throw new Error('injected allocation failure')
      },
    })
    const previousPixelStore = harness.pixelStore
    const previousTextureState = harness.textureState

    await expect(
      stageZombieEscapeWebGLTextures(
        { renderer: harness.renderer, targetScene },
        async () => undefined,
      ),
    ).rejects.toThrow('injected allocation failure')
    expect(harness.pixelStore).toEqual(previousPixelStore)
    expect(harness.textureState).toEqual(previousTextureState)

    mesh.geometry.dispose()
    material.dispose()
    texture.dispose()
  })

  test('rehearses empty output and isolated weighted cohorts before scene-prime full draws', async () => {
    const targetScene = new Scene()
    const first = makeHeavyRealizationMesh('first')
    const second = makeHeavyRealizationMesh('second')
    const hiddenParent = new Group()
    const hidden = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    hidden.name = 'hidden'
    hiddenParent.visible = false
    hiddenParent.add(hidden)
    first.add(second)
    targetScene.add(first, hiddenParent)
    const sceneSignatures: string[][] = []
    const frustumSignatures: boolean[][] = []
    const harness = createWebGLRealizationRenderer({
      fenceStatuses: [WEBGL_FENCE_STATUS.timeoutExpired, WEBGL_FENCE_STATUS.conditionSatisfied],
      onRender(scene, camera) {
        if (scene !== targetScene) return
        const visibleMeshes: Mesh[] = []
        scene.traverseVisible((object) => {
          if ((object as Mesh).isMesh && object.layers.test(camera.layers)) {
            visibleMeshes.push(object as Mesh)
          }
        })
        sceneSignatures.push(visibleMeshes.map(({ name }) => name))
        frustumSignatures.push(visibleMeshes.map(({ frustumCulled }) => frustumCulled))
      },
    })

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => {
        harness.events.push('admission')
      },
    )

    expect(sceneSignatures).toEqual([['first'], ['second']])
    expect(frustumSignatures).toEqual([[false], [false]])
    expect(first.visible).toBe(true)
    expect(second.visible).toBe(true)
    expect(first.frustumCulled).toBe(true)
    expect(second.frustumCulled).toBe(true)
    expect(hiddenParent.visible).toBe(false)
    expect(hidden.visible).toBe(true)
    expect(harness.events.filter((event) => event === 'render:empty')).toHaveLength(1)
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(2)
    expect(harness.events.filter((event) => event === 'fence:create')).toHaveLength(3)
    expect(harness.events.filter((event) => event === 'fence:flush')).toHaveLength(3)
    expect(harness.events.filter((event) => event === 'admission')).toHaveLength(5)
    expect(harness.deletedFences).toBe(3)
    expect(harness.state.autoClear).toBe(harness.initial.autoClear)
    expect(harness.state.renderTarget).toBe(harness.initial.renderTarget)
    expect(harness.state.activeCubeFace).toBe(harness.initial.activeCubeFace)
    expect(harness.state.activeMipmapLevel).toBe(harness.initial.activeMipmapLevel)
    expect(harness.state.viewport.equals(harness.initial.viewport)).toBe(true)
    expect(harness.state.scissor.equals(harness.initial.scissor)).toBe(true)
    expect(harness.state.scissorTest).toBe(harness.initial.scissorTest)

    for (const mesh of [first, second, hidden]) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  })

  test('recollects renderables attached or revealed during fenced cohort admission', async () => {
    const targetScene = new Scene()
    const first = makeHeavyRealizationMesh('first')
    const revealedParent = new Group()
    const revealed = makeHeavyRealizationMesh('revealed')
    const attached = makeHeavyRealizationMesh('attached')
    revealedParent.visible = false
    revealedParent.add(revealed)
    targetScene.add(first, revealedParent)
    const sceneSignatures: string[][] = []
    const harness = createWebGLRealizationRenderer({
      onRender(scene, camera) {
        if (scene !== targetScene) return
        const visibleNames: string[] = []
        scene.traverseVisible((object) => {
          if ((object as Mesh).isMesh && object.layers.test(camera.layers)) {
            visibleNames.push(object.name)
          }
        })
        sceneSignatures.push(visibleNames)
      },
    })
    let admissions = 0

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => {
        admissions += 1
        if (admissions !== 3) return
        revealedParent.visible = true
        targetScene.add(attached)
      },
    )

    expect(sceneSignatures).toEqual([['first'], ['revealed'], ['attached']])
    expect(sceneSignatures.every((signature) => signature.length === 1)).toBe(true)
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(3)
    expect(harness.deletedFences).toBe(4)
    expect(revealedParent.visible).toBe(true)
    expect(attached.parent).toBe(targetScene)

    for (const mesh of [first, revealed, attached]) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  })

  test('fences shadow-casting cohorts as a main-only draw before the combined draw', async () => {
    const targetScene = new Scene()
    const mesh = makeHeavyRealizationMesh('shadow-caster')
    mesh.castShadow = true
    targetScene.add(mesh)
    const castShadowSignatures: boolean[] = []
    const drawRangeSignatures: number[] = []
    const viewportSignatures: Vector4[] = []
    const scissorTestSignatures: boolean[] = []
    let harness: ReturnType<typeof createWebGLRealizationRenderer>
    harness = createWebGLRealizationRenderer({
      onRender(scene) {
        if (scene !== targetScene) return
        castShadowSignatures.push(mesh.castShadow)
        drawRangeSignatures.push(mesh.geometry.drawRange.count)
        viewportSignatures.push(harness.state.viewport.clone())
        scissorTestSignatures.push(harness.state.scissorTest)
      },
    })

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => undefined,
    )

    expect(castShadowSignatures).toEqual([false, true, true])
    expect(drawRangeSignatures).toEqual([Number.POSITIVE_INFINITY, 3, Number.POSITIVE_INFINITY])
    expect(viewportSignatures.every((viewport) => viewport.equals(new Vector4(0, 0, 1, 1)))).toBe(
      true,
    )
    expect(scissorTestSignatures).toEqual([true, true, true])
    expect(mesh.castShadow).toBe(true)
    expect(mesh.geometry.drawRange).toEqual({ count: Number.POSITIVE_INFINITY, start: 0 })
    expect(mesh.frustumCulled).toBe(true)
    expect(harness.state.viewport.equals(harness.initial.viewport)).toBe(true)
    expect(harness.state.scissor.equals(harness.initial.scissor)).toBe(true)
    expect(harness.state.scissorTest).toBe(harness.initial.scissorTest)
    expect(harness.events.filter((event) => event === 'render:empty')).toHaveLength(1)
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(3)
    expect(harness.events.filter((event) => event === 'fence:create')).toHaveLength(4)
    expect(harness.deletedFences).toBe(4)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('reprocesses a renderable whose shadow pass is enabled during fence admission', async () => {
    const targetScene = new Scene()
    const mesh = makeHeavyRealizationMesh('late-shadow-caster')
    targetScene.add(mesh)
    const castShadowSignatures: boolean[] = []
    const harness = createWebGLRealizationRenderer({
      onRender(scene) {
        if (scene === targetScene) castShadowSignatures.push(mesh.castShadow)
      },
    })
    let shadowEnabled = false

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => {
        if (shadowEnabled || castShadowSignatures.length !== 1) return
        shadowEnabled = true
        mesh.castShadow = true
      },
    )

    expect(castShadowSignatures).toEqual([false, false, true, true])
    expect(mesh.castShadow).toBe(true)
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(4)
    expect(harness.events.filter((event) => event === 'fence:create')).toHaveLength(5)
    expect(harness.deletedFences).toBe(5)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('initializes each shared material texture once before its realization cohorts', async () => {
    const targetScene = new Scene()
    const texture = new DataTexture(Uint8Array.of(255, 255, 255, 255), 1, 1)
    const first = makeHeavyRealizationMesh('first-textured')
    const second = makeHeavyRealizationMesh('second-textured')
    first.material.dispose()
    second.material.dispose()
    first.material = new MeshBasicMaterial({ alphaMap: texture, map: texture })
    second.material = new MeshBasicMaterial({ map: texture })
    first.castShadow = true
    targetScene.add(first, second)
    const initializedTextures: Texture[] = []
    const harness = createWebGLRealizationRenderer({
      onInitTexture: (initialized) => initializedTextures.push(initialized),
    })

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => undefined,
    )

    expect(initializedTextures).toEqual([texture])
    expect(harness.events.indexOf('texture:init')).toBeLessThan(
      harness.events.indexOf('render:scene'),
    )
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(4)
    expect(harness.events.filter((event) => event === 'fence:create')).toHaveLength(6)
    expect(harness.deletedFences).toBe(6)
    first.geometry.dispose()
    first.material.dispose()
    second.geometry.dispose()
    second.material.dispose()
    texture.dispose()
  })

  test('restores object and renderer state when a cohort draw throws', async () => {
    for (const failingCall of [2, 3, 4]) {
      const targetScene = new Scene()
      const mesh = makeHeavyRealizationMesh('mesh')
      const sibling = makeHeavyRealizationMesh('sibling')
      mesh.castShadow = true
      mesh.layers.mask = 5
      sibling.layers.mask = 9
      const originalMeshCastShadow = mesh.castShadow
      const originalMeshLayerMask = mesh.layers.mask
      const originalMeshDrawRange = { ...mesh.geometry.drawRange }
      const originalSiblingLayerMask = sibling.layers.mask
      targetScene.add(mesh, sibling)
      let harness: ReturnType<typeof createWebGLRealizationRenderer>
      harness = createWebGLRealizationRenderer({
        onRender(_scene, _camera, call) {
          harness.state.autoClear = true
          harness.state.renderTarget = { id: 'mutated' }
          harness.state.activeCubeFace = 8
          harness.state.activeMipmapLevel = 9
          harness.state.viewport.set(9, 9, 9, 9)
          harness.state.scissor.set(8, 8, 8, 8)
          harness.state.scissorTest = false
          if (call === failingCall) throw new Error('cohort draw failed')
        },
      })

      await expect(
        compileZombieEscapeRenderRepresentatives(
          {
            camera: new PerspectiveCamera(),
            renderer: harness.renderer,
            representatives: [{ key: 'attached-scene', root: targetScene }],
            targetScene,
          },
          async () => undefined,
        ),
      ).rejects.toThrow('cohort draw failed')
      expect(mesh.visible).toBe(true)
      expect(mesh.castShadow).toBe(originalMeshCastShadow)
      expect(mesh.frustumCulled).toBe(true)
      expect(mesh.layers.mask).toBe(originalMeshLayerMask)
      expect(mesh.geometry.drawRange).toEqual(originalMeshDrawRange)
      expect(sibling.layers.mask).toBe(originalSiblingLayerMask)
      expect(sibling.frustumCulled).toBe(true)
      expect(harness.state.autoClear).toBe(harness.initial.autoClear)
      expect(harness.state.renderTarget).toBe(harness.initial.renderTarget)
      expect(harness.state.activeCubeFace).toBe(harness.initial.activeCubeFace)
      expect(harness.state.activeMipmapLevel).toBe(harness.initial.activeMipmapLevel)
      expect(harness.state.viewport.equals(harness.initial.viewport)).toBe(true)
      expect(harness.state.scissor.equals(harness.initial.scissor)).toBe(true)
      expect(harness.state.scissorTest).toBe(harness.initial.scissorTest)
      expect(harness.deletedFences).toBe(failingCall - 1)
      mesh.geometry.dispose()
      mesh.material.dispose()
      sibling.geometry.dispose()
      sibling.material.dispose()
    }
  })

  test('stops after the main-only fence when the readiness request becomes stale', async () => {
    const targetScene = new Scene()
    const mesh = makeHeavyRealizationMesh('stale-shadow-caster')
    mesh.castShadow = true
    mesh.layers.mask = 5
    targetScene.add(mesh)
    const originalLayerMask = mesh.layers.mask
    let current = true
    const harness = createWebGLRealizationRenderer()

    await expect(
      compileZombieEscapeRenderRepresentatives(
        {
          camera: new PerspectiveCamera(),
          renderer: harness.renderer,
          representatives: [{ key: 'attached-scene', root: targetScene }],
          targetScene,
        },
        async () => {
          if (harness.events.filter((event) => event === 'render:scene').length === 1) {
            current = false
          }
        },
        () => current,
      ),
    ).rejects.toThrow('became stale during realization')
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(1)
    expect(harness.deletedFences).toBe(2)
    expect(mesh.castShadow).toBe(true)
    expect(mesh.frustumCulled).toBe(true)
    expect(mesh.layers.mask).toBe(originalLayerMask)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('preserves visibility and renderer changes made by frame systems between cohorts', async () => {
    const targetScene = new Scene()
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    const originalLayerMask = mesh.layers.mask
    targetScene.add(mesh)
    const sceneVisibility: boolean[] = []
    const harness = createWebGLRealizationRenderer({
      onRender(scene) {
        if (scene === targetScene) sceneVisibility.push(mesh.visible)
      },
    })
    let admissions = 0

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => {
        admissions += 1
        if (admissions !== 2) return
        mesh.visible = false
        mesh.frustumCulled = false
        harness.state.viewport.set(11, 12, 130, 140)
        harness.state.scissor.set(21, 22, 30, 40)
        harness.state.scissorTest = false
      },
    )

    expect(sceneVisibility).toEqual([])
    expect(mesh.visible).toBe(false)
    expect(mesh.frustumCulled).toBe(false)
    expect(mesh.layers.mask).toBe(originalLayerMask)
    expect(harness.state.viewport.equals(new Vector4(11, 12, 130, 140))).toBe(true)
    expect(harness.state.scissor.equals(new Vector4(21, 22, 30, 40))).toBe(true)
    expect(harness.state.scissorTest).toBe(false)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('fails readiness on an unsupported WebGL contract or failed fence', async () => {
    const createRequest = (renderer: ZombieEscapePipelineRenderer) => {
      const targetScene = new Scene()
      return {
        camera: new PerspectiveCamera(),
        renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      }
    }
    await expect(
      compileZombieEscapeRenderRepresentatives(
        createRequest({ compileAsync: async () => undefined }),
        async () => undefined,
      ),
    ).rejects.toThrow('state-preserving Three renderer contract')

    const failedFence = createWebGLRealizationRenderer({
      fenceStatuses: [WEBGL_FENCE_STATUS.waitFailed],
    })
    await expect(
      compileZombieEscapeRenderRepresentatives(
        createRequest(failedFence.renderer),
        async () => undefined,
      ),
    ).rejects.toThrow('GPU fence wait failed')
    expect(failedFence.deletedFences).toBe(1)

    const missingFence = createWebGLRealizationRenderer()
    missingFence.context.fenceSync = () => null
    await expect(
      compileZombieEscapeRenderRepresentatives(
        createRequest(missingFence.renderer),
        async () => undefined,
      ),
    ).rejects.toThrow('could not create a GPU fence')
    expect(missingFence.deletedFences).toBe(0)
  })

  test('skips direct realization for a WebGPU renderer even with an attached scene', async () => {
    const targetScene = new Scene()
    let rendered = false
    const renderer = {
      backend: { device: {} },
      async compileAsync() {},
      render() {
        rendered = true
      },
    } as unknown as ZombieEscapePipelineRenderer

    await compileZombieEscapeRenderRepresentatives(
      {
        camera: new PerspectiveCamera(),
        renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      async () => undefined,
    )

    expect(rendered).toBe(false)
  })

  test('prewarms newly registered representatives immediately and exactly once in queue order', async () => {
    const firstCompilation = deferred<void>()
    const secondCompilation = deferred<void>()
    const calls: string[] = []
    let active = 0
    let maximumActive = 0
    const queue = createZombieEscapeRenderRepresentativePrewarmQueue({
      compile: async ({ representatives }) => {
        const key = representatives[0]!.key
        calls.push(key)
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await (key === 'first' ? firstCompilation.promise : secondCompilation.promise)
        active -= 1
      },
    })
    const camera = new PerspectiveCamera()
    const renderer = { compileAsync: async () => undefined }
    const targetScene = new Scene()
    const first = { key: 'first', root: new Group() }
    const second = { key: 'second', root: new Group() }
    const synchronize = (representatives: Array<typeof first>) =>
      queue.synchronize({ camera, generation: 1, renderer, representatives, targetScene })

    synchronize([first])
    await flushMicrotasksUntil(() => calls.length === 1)
    synchronize([first, second])
    synchronize([first, second])
    expect(calls).toEqual(['first'])

    firstCompilation.resolve()
    await flushMicrotasksUntil(() => calls.length === 2)
    expect(calls).toEqual(['first', 'second'])
    secondCompilation.resolve()
    expect(await queue.waitForSettled()).toBe('ready')
    expect(maximumActive).toBe(1)
    queue.dispose()
  })

  test('continues the representative prewarm queue after one compilation fails', async () => {
    const calls: string[] = []
    const queue = createZombieEscapeRenderRepresentativePrewarmQueue({
      compile: async ({ representatives }) => {
        const key = representatives[0]!.key
        calls.push(key)
        if (key === 'first') throw new Error('first failed')
      },
    })
    queue.synchronize({
      camera: new PerspectiveCamera(),
      generation: 1,
      renderer: { compileAsync: async () => undefined },
      representatives: [
        { key: 'first', root: new Group() },
        { key: 'second', root: new Group() },
      ],
      targetScene: new Scene(),
    })

    expect(await queue.waitForSettled()).toBe('failed')
    expect(calls).toEqual(['first', 'second'])
    queue.dispose()
  })
})

describe('Zombie Escape render readiness coordinator', () => {
  test('stops reentrant invalidation after the draw without creating a fence', async () => {
    const targetScene = new Scene()
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    targetScene.add(mesh)
    let coordinator: ZombieEscapeRenderReadinessCoordinator
    const harness = createWebGLRealizationRenderer({
      onRender() {
        coordinator.invalidate()
      },
    })
    coordinator = createZombieEscapeRenderReadinessCoordinator()

    const result = await coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: harness.renderer,
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      () => undefined,
    )

    expect(result).toBe('stale')
    expect(harness.events.filter((event) => event === 'render:empty')).toHaveLength(1)
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(0)
    expect(harness.events.filter((event) => event === 'fence:create')).toHaveLength(0)
    expect(harness.deletedFences).toBe(0)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('cancels an older generation manual realization at the next fence admission', async () => {
    const targetScene = new Scene()
    const mesh = new Mesh(new SphereGeometry(1, 4, 3), new MeshBasicMaterial())
    targetScene.add(mesh)
    const harness = createWebGLRealizationRenderer()
    const waits: Array<ReturnType<typeof deferred<void>>> = []
    const waitForAdmissionOpportunity = () => {
      const wait = deferred<void>()
      waits.push(wait)
      return wait.promise
    }
    let compileCalls = 0
    const firstStatuses: unknown[] = []
    const secondStatuses: unknown[] = []
    const coordinator = createZombieEscapeRenderReadinessCoordinator({
      compile: (request, _waitForAdmissionOpportunity, isCurrent) => {
        compileCalls += 1
        if (compileCalls > 1) return Promise.resolve()
        return compileZombieEscapeRenderRepresentatives(
          request,
          waitForAdmissionOpportunity,
          isCurrent,
        )
      },
    })
    const common = {
      camera: new PerspectiveCamera(),
      renderer: harness.renderer,
      representatives: [{ key: 'attached-scene', root: targetScene }],
      targetScene,
    }
    const first = coordinator.request({ ...common, generation: 1, identity: {} }, (status) =>
      firstStatuses.push(status),
    )

    await flushMicrotasksUntil(() => waits.length === 1)
    waits[0]!.resolve()
    await flushMicrotasksUntil(() => waits.length === 2)
    expect(harness.events.filter((event) => event === 'render:empty')).toHaveLength(1)
    const second = coordinator.request({ ...common, generation: 2, identity: {} }, (status) =>
      secondStatuses.push(status),
    )
    waits[1]!.resolve()

    expect(await first).toBe('stale')
    expect(await second).toBe('ready')
    expect(firstStatuses).toEqual([])
    expect(secondStatuses).toEqual([{ state: 'ready' }])
    expect(compileCalls).toBe(2)
    expect(harness.events.filter((event) => event === 'render:scene')).toHaveLength(0)
    expect(harness.deletedFences).toBe(1)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('keeps unsupported attached-scene realization in the failed readiness state', async () => {
    const targetScene = new Scene()
    const coordinator = createZombieEscapeRenderReadinessCoordinator()
    const statuses: unknown[] = []

    const result = await coordinator.request(
      {
        camera: new PerspectiveCamera(),
        generation: 1,
        identity: {},
        renderer: { compileAsync: async () => undefined },
        representatives: [{ key: 'attached-scene', root: targetScene }],
        targetScene,
      },
      (status) => statuses.push(status),
    )

    expect(result).toBe('failed')
    expect(statuses).toEqual([
      {
        message:
          'Zombie Escape WebGL realization requires a state-preserving Three renderer contract.',
        state: 'failed',
      },
    ])
    coordinator.dispose()
  })

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
