import { Group, type Material, type Object3D } from 'three'
import {
  readLandrushMaterialPipelineSignature,
  resolveLandrushPipelineCoverageRepresentative,
} from './landrush-render-pipeline-signature'
import {
  clearLandrushRenderReadinessRoot,
  compileLandrushRenderRepresentative,
  createLandrushRenderReadinessCoordinator,
  initializeLandrushRenderReadinessRenderer,
  LANDRUSH_RENDER_READINESS_TIMEOUT_MS,
  type LandrushPipelineRenderer,
  type LandrushRenderReadinessCoordinator,
  type LandrushRenderReadinessProgress,
  type LandrushRenderReadinessRequest,
  type LandrushRenderReadinessStatus,
  type LandrushRenderReadinessTimer,
  type LandrushRenderRepresentative,
  requestLandrushPresentationPipelinePrewarm,
} from './landrush-render-readiness'
import type { ZombieEscapeQuality } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

const ZOMBIE_ESCAPE_EFFECT_RENDER_REPRESENTATIVE_KEYS = [
  'effect:tracer',
  'effect:muzzle',
  'effect:impact',
  'effect:sparks',
  'effect:blood',
  'effect:carrier-accent',
  'effect:travel-detail',
  'effect:travel-ribbon',
  'effect:muzzle-petals',
  'effect:death-dust',
] as const

const ZOMBIE_ESCAPE_SCENE_PIPELINE_RENDER_REPRESENTATIVE_KEY = 'scene:pipeline-coverage'

export const ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY = 'weapon-pickup'
export const ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY = 'player:aim-reticle'
export const ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY = 'robot:shoulder-torch'
export const ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS = LANDRUSH_RENDER_READINESS_TIMEOUT_MS
export const ZOMBIE_ESCAPE_WEBGPU_RENDER_READINESS_PROGRESS_TOTAL = 4
export const ZOMBIE_ESCAPE_WEBGL_RENDER_READINESS_PROGRESS_TOTAL = 3

export type ZombieEscapeRenderRepresentativeKey = string

export type ZombieEscapeRenderRepresentative = LandrushRenderRepresentative

export type ZombieEscapeRenderReadinessSnapshot = Readonly<{
  complete: boolean
  missingKeys: readonly ZombieEscapeRenderRepresentativeKey[]
  representatives: readonly ZombieEscapeRenderRepresentative[]
  revision: number
}>

export type ZombieEscapeRenderReadinessRegistry = Readonly<{
  getSnapshot: () => ZombieEscapeRenderReadinessSnapshot
  register: (key: ZombieEscapeRenderRepresentativeKey, root: Object3D) => () => void
  subscribe: (listener: () => void) => () => void
}>

export type ZombieEscapePipelineRenderer = LandrushPipelineRenderer

export type ZombieEscapeRenderReadinessStatus = LandrushRenderReadinessStatus

export type ZombieEscapeRenderReadinessRequest = LandrushRenderReadinessRequest

export type ZombieEscapeRenderReadinessCoordinator = LandrushRenderReadinessCoordinator

export type ZombieEscapeRenderReadinessProgress = LandrushRenderReadinessProgress

export type ZombieEscapeRenderReadinessTimer = LandrushRenderReadinessTimer

type RegisteredRepresentative = Readonly<{
  registration: symbol
  root: Object3D
}>

type ZombieEscapePreparedRepresentativeCache = {
  camera: ZombieEscapeRenderReadinessRequest['camera']
  context: unknown
  representativesByKey: Map<
    ZombieEscapeRenderRepresentativeKey,
    Readonly<{
      pipelineFingerprint: string
      pipelineRoot: Object3D
      sourceRoot: Object3D
    }>
  >
  scenePipelineSignatures: Set<string>
  targetScene: ZombieEscapeRenderReadinessRequest['targetScene']
}

const PREPARED_REPRESENTATIVES_BY_RENDERER = new WeakMap<
  ZombieEscapePipelineRenderer,
  ZombieEscapePreparedRepresentativeCache
>()

const GPU_PREPARATION_TIMER: ZombieEscapeRenderReadinessTimer = {
  clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
}

export function createZombieEscapeHeldWeaponRenderRepresentativeKey(weaponId: string) {
  return `weapon-held:${weaponId}`
}

export function createZombieEscapeZombieRenderRepresentativeKey(zombieId: string) {
  return `zombie:${zombieId}`
}

export function resolveZombieEscapeRenderReadinessProgressTotal(
  renderer: Pick<ZombieEscapePipelineRenderer, 'isWebGPURenderer'>,
) {
  return renderer.isWebGPURenderer === true
    ? ZOMBIE_ESCAPE_WEBGPU_RENDER_READINESS_PROGRESS_TOTAL
    : ZOMBIE_ESCAPE_WEBGL_RENDER_READINESS_PROGRESS_TOTAL
}

export function getZombieEscapeRenderRepresentativeKeys(
  quality: ZombieEscapeQuality,
): readonly ZombieEscapeRenderRepresentativeKey[] {
  return [
    ...ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon) =>
      createZombieEscapeHeldWeaponRenderRepresentativeKey(weapon.id),
    ),
    ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,
    ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,
    ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY,
    ...(quality === 'balanced'
      ? ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie) =>
          createZombieEscapeZombieRenderRepresentativeKey(zombie.id),
        )
      : []),
    ...ZOMBIE_ESCAPE_EFFECT_RENDER_REPRESENTATIVE_KEYS,
  ]
}

export function createZombieEscapeRenderReadinessRegistry(
  expectedKeys: readonly ZombieEscapeRenderRepresentativeKey[],
): ZombieEscapeRenderReadinessRegistry {
  const uniqueExpectedKeys = Array.from(new Set(expectedKeys))
  const expectedKeySet = new Set(uniqueExpectedKeys)
  const roots = new Map<ZombieEscapeRenderRepresentativeKey, RegisteredRepresentative>()
  const listeners = new Set<() => void>()
  let revision = 0
  let snapshot = createRegistrySnapshot(uniqueExpectedKeys, roots, revision)

  const publish = () => {
    revision += 1
    snapshot = createRegistrySnapshot(uniqueExpectedKeys, roots, revision)
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    register(key, root) {
      if (!expectedKeySet.has(key)) {
        throw new Error(`Unexpected Zombie Escape render representative: ${key}`)
      }
      const registration = Symbol(key)
      roots.set(key, { registration, root })
      publish()
      return () => {
        if (roots.get(key)?.registration !== registration) return
        roots.delete(key)
        publish()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export async function compileZombieEscapeRenderRepresentatives(
  {
    camera,
    representatives,
    renderer,
    targetScene,
  }: Omit<ZombieEscapeRenderReadinessRequest, 'generation' | 'identity'>,
  onProgress?: (progress: ZombieEscapeRenderReadinessProgress) => void,
  prewarmPresentationPipeline = requestLandrushPresentationPipelinePrewarm,
) {
  const webGpu = renderer.isWebGPURenderer === true
  const total = resolveZombieEscapeRenderReadinessProgressTotal(renderer)
  let completed = 0
  onProgress?.({ completed, total })
  await initializeLandrushRenderReadinessRenderer(renderer)
  const preparedCache = resolveZombieEscapePreparedRepresentativeCache({
    camera,
    renderer,
    targetScene,
  })
  const scenePipelineCoverage = createZombieEscapeScenePipelineRepresentativeResult(
    { camera, representatives, targetScene },
    preparedCache.scenePipelineSignatures,
  )
  const scenePipelineRepresentative = scenePipelineCoverage.root
  const resolvedRepresentatives = representatives.map(({ key, root: sourceRoot }) => {
    const pipelineRoot = resolveLandrushPipelineCoverageRepresentative(sourceRoot)
    return {
      key,
      pipelineFingerprint: readZombieEscapeRenderTreeFingerprint(pipelineRoot),
      pipelineRoot,
      sourceRoot,
    }
  })
  const changedRepresentatives = resolvedRepresentatives.filter((representative) => {
    const prepared = preparedCache.representativesByKey.get(representative.key)
    return (
      prepared?.sourceRoot !== representative.sourceRoot ||
      prepared.pipelineRoot !== representative.pipelineRoot ||
      prepared.pipelineFingerprint !== representative.pipelineFingerprint
    )
  })
  if (changedRepresentatives.length === 0 && scenePipelineRepresentative.children.length === 0) {
    onProgress?.({ completed: total, total })
    return
  }
  const changedPipelineRepresentatives = changedRepresentatives.map(({ key, pipelineRoot }) => ({
    key,
    root: pipelineRoot,
  }))
  const expandedRepresentatives =
    scenePipelineRepresentative.children.length > 0
      ? [
          ...changedPipelineRepresentatives,
          {
            key: ZOMBIE_ESCAPE_SCENE_PIPELINE_RENDER_REPRESENTATIVE_KEY,
            root: scenePipelineRepresentative,
          },
        ]
      : changedPipelineRepresentatives
  const representativesToPrepare = expandedRepresentatives
  try {
    await compileZombieEscapeRenderAggregate(
      { camera, renderer, representatives: representativesToPrepare, targetScene },
      () => {
        completed += 1
        onProgress?.({ completed, total })
      },
    )
    const exactFramePrewarmDisabled = isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled()
    if (webGpu) {
      if (!exactFramePrewarmDisabled) {
        await prewarmPresentationPipeline({
          camera,
          renderPath: 'presentation',
          renderer,
          representatives: representativesToPrepare,
          targetScene,
        })
      }
      completed += 1
      onProgress?.({ completed, total })
    }
    if (webGpu && !exactFramePrewarmDisabled) {
      await prewarmPresentationPipeline({
        camera,
        renderPath: 'direct',
        renderer,
        representatives: representativesToPrepare,
        targetScene,
      })
    } else {
      await renderer.compileAsync(targetScene, camera, targetScene)
    }
    completed += 1
    onProgress?.({ completed, total })
    await waitForZombieEscapeGpuPreparation(renderer)
  } finally {
    clearLandrushRenderReadinessRoot(scenePipelineRepresentative)
  }
  if (preparedCache.context === resolveZombieEscapeRendererContext(renderer)) {
    for (const { key, pipelineFingerprint, pipelineRoot, sourceRoot } of changedRepresentatives) {
      preparedCache.representativesByKey.set(key, {
        pipelineFingerprint,
        pipelineRoot,
        sourceRoot,
      })
    }
    for (const signature of scenePipelineCoverage.pipelineSignatures) {
      preparedCache.scenePipelineSignatures.add(signature)
    }
  }
  onProgress?.({ completed: total, total })
}

export function createZombieEscapeScenePipelineRepresentative({
  camera,
  representatives,
  targetScene,
}: Pick<ZombieEscapeRenderReadinessRequest, 'camera' | 'representatives' | 'targetScene'>) {
  return createZombieEscapeScenePipelineRepresentativeResult({
    camera,
    representatives,
    targetScene,
  }).root
}

function createZombieEscapeScenePipelineRepresentativeResult(
  {
    camera,
    representatives,
    targetScene,
  }: Pick<ZombieEscapeRenderReadinessRequest, 'camera' | 'representatives' | 'targetScene'>,
  preparedPipelineSignatures: ReadonlySet<string> = new Set(),
) {
  const representedObjects = new Set<Object3D>()
  const materialSignatures = new WeakMap<Material, string>()
  const representedPipelines = new Set<string>()
  for (const { root } of representatives) {
    root.traverse((object) => representedObjects.add(object))
  }

  const root = new Group()
  root.position.y = -1_000_000
  targetScene.updateMatrixWorld(true)
  targetScene.traverse((object) => {
    if (
      representedObjects.has(object) ||
      !isZombieEscapeRenderableObject(object) ||
      !object.layers.test(camera.layers)
    ) {
      return
    }
    const pipelineKey = readZombieEscapeScenePipelineSignature(object, (material) => {
      let signature = materialSignatures.get(material)
      if (signature === undefined) {
        signature = readLandrushMaterialPipelineSignature(material)
        materialSignatures.set(material, signature)
      }
      return signature
    })
    if (preparedPipelineSignatures.has(pipelineKey) || representedPipelines.has(pipelineKey)) return
    representedPipelines.add(pipelineKey)
    const representative = object.clone(false)
    const source = object as Object3D & {
      customDepthMaterial?: object
      customDistanceMaterial?: object
    }
    const clone = representative as Object3D & {
      customDepthMaterial?: object
      customDistanceMaterial?: object
    }
    clone.customDepthMaterial = source.customDepthMaterial
    clone.customDistanceMaterial = source.customDistanceMaterial
    representative.matrix.copy(object.matrixWorld)
    representative.matrixAutoUpdate = false
    representative.matrixWorldAutoUpdate = true
    representative.matrixWorldNeedsUpdate = true
    representative.layers.mask = camera.layers.mask
    root.add(representative)
  })
  return { pipelineSignatures: representedPipelines, root }
}

function readZombieEscapeScenePipelineSignature(
  object: Object3D,
  readMaterialSignature: (material: Material) => string,
) {
  const renderable = object as Object3D & {
    castShadow?: boolean
    count?: number
    customDepthMaterial?: Material
    customDistanceMaterial?: Material
    geometry?: {
      attributes?: Record<string, unknown>
      groups?: Array<{ count: number; materialIndex?: number }>
      index?: unknown
      morphAttributes?: Record<string, unknown[]>
      morphTargetsRelative?: boolean
    }
    instanceColor?: unknown
    instanceMatrix?: unknown
    isBatchedMesh?: boolean
    isInstancedMesh?: boolean
    isLine?: boolean
    isLineLoop?: boolean
    isLineSegments?: boolean
    isMesh?: boolean
    isPoints?: boolean
    isSkinnedMesh?: boolean
    isSprite?: boolean
    material?: Material | Material[]
    matrixWorld: { determinant: () => number }
    morphTexture?: unknown
    morphTargetInfluences?: readonly number[]
    receiveShadow?: boolean
    skeleton?: { bones?: unknown[] }
    uuid: string
  }
  const materials = Array.isArray(renderable.material)
    ? renderable.material
    : renderable.material
      ? [renderable.material]
      : []
  const geometry = renderable.geometry
  const activeMaterialSlots =
    materials.length > 1
      ? Array.from(
          new Set(
            (geometry?.groups ?? [])
              .filter((group) => group.count > 0)
              .map((group) => group.materialIndex ?? 0),
          ),
        ).sort((first, second) => first - second)
      : []
  const attributes = Object.entries(geometry?.attributes ?? {})
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([name, attribute]) => `${name}:${readZombieEscapePipelineAttributeSignature(attribute)}`)
    .join(',')
  const morphAttributes = Object.entries(geometry?.morphAttributes ?? {})
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([name, entries]) =>
        `${name}:${entries
          .map((entry) => readZombieEscapePipelineAttributeSignature(entry, true))
          .join(';')}`,
    )
    .join(',')
  return [
    renderable.isMesh ? 'mesh' : '',
    renderable.isLineSegments ? 'line-segments' : renderable.isLineLoop ? 'line-loop' : '',
    renderable.isLine ? 'line' : '',
    renderable.isPoints ? 'points' : '',
    renderable.isSprite ? 'sprite' : '',
    renderable.isBatchedMesh ? 'batched' : 'not-batched',
    renderable.isInstancedMesh ? 'instanced' : 'not-instanced',
    renderable.isSkinnedMesh ? 'skinned' : 'static',
    renderable.instanceColor ? 'instance-color' : 'no-instance-color',
    renderable.instanceMatrix ? 'instance-matrix' : 'no-instance-matrix',
    renderable.morphTexture ? 'instance-morph' : 'no-instance-morph',
    geometry?.index ? 'indexed' : 'non-indexed',
    `attributes:${attributes}`,
    `morph:${morphAttributes}`,
    geometry?.morphTargetsRelative ? 'relative-morph' : 'absolute-morph',
    `morph-influences:${String(renderable.morphTargetInfluences?.length ?? 0)}`,
    `skeleton-bones:${String(renderable.skeleton?.bones?.length ?? 0)}`,
    `materials:${materials.map(readMaterialSignature).join(',')}`,
    `material-groups:${materials.length > 1 ? activeMaterialSlots.join(',') : 'single'}`,
    renderable.castShadow ? 'casts-shadow' : 'no-cast-shadow',
    renderable.receiveShadow ? 'receives-shadow' : 'no-receive-shadow',
    renderable.matrixWorld.determinant() < 0 ? 'front-face-cw' : 'front-face-ccw',
    `custom-depth:${String(
      renderable.castShadow && renderable.customDepthMaterial
        ? readMaterialSignature(renderable.customDepthMaterial)
        : 'none',
    )}`,
    `custom-distance:${String(
      renderable.castShadow && renderable.customDistanceMaterial
        ? readMaterialSignature(renderable.customDistanceMaterial)
        : 'none',
    )}`,
    (renderable.count ?? 1) > 1 ? 'multi-draw-count' : 'single-draw-count',
  ].join('|')
}

function readZombieEscapeRenderTreeFingerprint(root: Object3D) {
  const materialSignatures = new WeakMap<Material, string>()
  const entries: string[] = []
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!isZombieEscapeRenderableObject(object)) return
    const renderable = object as Object3D & {
      geometry?: { uuid?: string }
      material?: Material | Material[]
    }
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : []
    const pipelineSignature = readZombieEscapeScenePipelineSignature(object, (material) => {
      let signature = materialSignatures.get(material)
      if (signature === undefined) {
        signature = readLandrushMaterialPipelineSignature(material)
        materialSignatures.set(material, signature)
      }
      return signature
    })
    entries.push(
      [
        object.uuid,
        renderable.geometry?.uuid ?? 'no-geometry',
        materials.map((material) => `${material.uuid}:${material.version}`).join(','),
        pipelineSignature,
      ].join('|'),
    )
  })
  return entries.join('\n')
}

function readZombieEscapePipelineAttributeSignature(attribute: unknown, identitySensitive = false) {
  const candidate = attribute as {
    array?: { constructor?: { name?: string } }
    data?: {
      array?: { constructor?: { name?: string } }
      meshPerAttribute?: number
      stride?: number
    }
    gpuType?: number
    id?: number
    isInstancedBufferAttribute?: boolean
    isInterleavedBufferAttribute?: boolean
    itemSize?: number
    meshPerAttribute?: number
    normalized?: boolean
    offset?: number
  }
  const storage = candidate.isInterleavedBufferAttribute ? candidate.data : candidate
  return [
    identitySensitive ? `id:${String(candidate.id ?? 'unknown')}` : 'structural',
    candidate.isInterleavedBufferAttribute ? 'interleaved' : 'buffer',
    candidate.isInstancedBufferAttribute ? 'instanced' : 'vertex',
    storage?.array?.constructor?.name ?? 'unknown',
    String(candidate.itemSize ?? 0),
    candidate.normalized ? 'normalized' : 'raw',
    `gpu:${String(candidate.gpuType ?? 'default')}`,
    `stride:${String(candidate.data?.stride ?? candidate.itemSize ?? 0)}`,
    `offset:${String(candidate.offset ?? 0)}`,
    `divisor:${String(candidate.meshPerAttribute ?? candidate.data?.meshPerAttribute ?? 0)}`,
  ].join(':')
}

function isZombieEscapeRenderableObject(object: Object3D) {
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

function resolveZombieEscapePreparedRepresentativeCache({
  camera,
  renderer,
  targetScene,
}: Pick<ZombieEscapeRenderReadinessRequest, 'camera' | 'renderer' | 'targetScene'>) {
  const context = resolveZombieEscapeRendererContext(renderer)
  const cached = PREPARED_REPRESENTATIVES_BY_RENDERER.get(renderer)
  if (
    cached &&
    cached.camera === camera &&
    cached.context === context &&
    cached.targetScene === targetScene
  ) {
    return cached
  }
  const next: ZombieEscapePreparedRepresentativeCache = {
    camera,
    context,
    representativesByKey: new Map(),
    scenePipelineSignatures: new Set(),
    targetScene,
  }
  PREPARED_REPRESENTATIVES_BY_RENDERER.set(renderer, next)
  return next
}

function resolveZombieEscapeRendererContext(renderer: ZombieEscapePipelineRenderer) {
  return renderer.backend?.device ?? renderer.backend?.gl ?? renderer.getContext?.() ?? renderer
}

export function isZombieEscapePresentationPipelinePrewarmDiagnosticDisabled(
  search = typeof window === 'undefined' ? '' : window.location.search,
) {
  const disabled = new Set(
    (new URLSearchParams(search).get('disable') ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  )
  return disabled.has('draw') || disabled.has('postfx')
}

async function compileZombieEscapeRenderAggregate(
  {
    camera,
    representatives,
    renderer,
    targetScene,
  }: Omit<ZombieEscapeRenderReadinessRequest, 'generation' | 'identity'>,
  onCompiled: () => void,
) {
  const root = new Group()
  const attachedRoots = new Set<Object3D>()
  const representativeRoots: Object3D[] = []
  for (const representative of representatives) {
    if (attachedRoots.has(representative.root)) continue
    attachedRoots.add(representative.root)
    representativeRoots.push(representative.root)
  }

  await compileZombieEscapeRenderAggregateVariant({
    camera,
    key: 'zombie-day',
    representativeRoots,
    renderer,
    root,
    targetScene,
  })
  onCompiled()
}

async function compileZombieEscapeRenderAggregateVariant({
  camera,
  key,
  representativeRoots,
  renderer,
  root,
  targetScene,
}: Readonly<{
  camera: ZombieEscapeRenderReadinessRequest['camera']
  key: string
  representativeRoots: readonly Object3D[]
  renderer: ZombieEscapePipelineRenderer
  root: Group
  targetScene: ZombieEscapeRenderReadinessRequest['targetScene']
}>) {
  const placements: Array<{
    index: number
    parent: Object3D | null
    root: Object3D
  }> = []
  const pendingCompilation = (() => {
    try {
      for (const representativeRoot of representativeRoots) {
        const parent = representativeRoot.parent
        const index = parent?.children.indexOf(representativeRoot) ?? -1
        placements.push({
          index,
          parent,
          root: representativeRoot,
        })
        // These representatives are live R3F objects, so the one-shot probe must not emit
        // ownership lifecycle events while temporarily assembling its compilation tree.
        if (parent && index >= 0) parent.children.splice(index, 1)
        root.children.push(representativeRoot)
        representativeRoot.parent = root
      }
      return compileLandrushRenderRepresentative({
        camera,
        renderer,
        representative: { key, root },
        targetScene,
      })
    } finally {
      restoreZombieEscapeRenderAggregatePlacements(placements)
    }
  })()
  await pendingCompilation
}

function restoreZombieEscapeRenderAggregatePlacements(
  placements: readonly Readonly<{
    index: number
    parent: Object3D | null
    root: Object3D
  }>[],
) {
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const placement = placements[index]!
    const currentParent = placement.root.parent
    const currentIndex = currentParent?.children.indexOf(placement.root) ?? -1
    if (currentParent && currentIndex >= 0) currentParent.children.splice(currentIndex, 1)
    placement.root.parent = null
    if (!placement.parent) continue
    const targetIndex = Math.min(Math.max(placement.index, 0), placement.parent.children.length)
    placement.parent.children.splice(targetIndex, 0, placement.root)
    placement.root.parent = placement.parent
  }
}

export async function waitForZombieEscapeGpuPreparation(
  renderer: ZombieEscapePipelineRenderer,
  waitForFrame: () => Promise<void> = () =>
    new Promise((resolve) => requestAnimationFrame(() => resolve())),
  timer: ZombieEscapeRenderReadinessTimer = GPU_PREPARATION_TIMER,
) {
  const device = renderer.backend?.device as
    | { queue?: { onSubmittedWorkDone?: () => Promise<void> } }
    | undefined
  if (typeof device?.queue?.onSubmittedWorkDone === 'function') {
    let timeoutHandle: unknown
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = timer.schedule(
        () => reject(new Error('Zombie Escape GPU submission did not finish before its deadline.')),
        ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
      )
    })
    try {
      await Promise.race([device.queue.onSubmittedWorkDone(), timeout])
    } finally {
      timer.clear(timeoutHandle)
    }
    return
  }
  const context = (renderer.backend?.gl ?? renderer.getContext?.()) as
    | WebGL2RenderingContext
    | undefined
  if (!context) {
    if (renderer.isWebGPURenderer) {
      throw new Error('Zombie Escape GPU preparation requires a live GPU queue or WebGL2 fence.')
    }
    return
  }
  if (
    typeof context.fenceSync !== 'function' ||
    typeof context.clientWaitSync !== 'function' ||
    typeof context.deleteSync !== 'function' ||
    typeof context.flush !== 'function' ||
    typeof context.isContextLost !== 'function'
  ) {
    throw new Error('Zombie Escape GPU preparation requires usable WebGL2 fences.')
  }
  if (context.isContextLost()) throw new Error('Zombie Escape GPU preparation context is lost.')
  const fence = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (!fence) throw new Error('Zombie Escape GPU preparation could not create a fence.')
  let finished = false
  let timeoutHandle: unknown
  const timeoutError = new Error(
    'Zombie Escape GPU preparation did not finish before its deadline.',
  )
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = timer.schedule(() => {
        if (finished) return
        finished = true
        reject(timeoutError)
      }, ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS)
    })
    const waitForFence = async () => {
      context.flush()
      for (;;) {
        await waitForFrame()
        // A frame may resume after the timeout has already deleted this fence.
        if (finished) throw timeoutError
        if (context.isContextLost()) {
          throw new Error('Zombie Escape GPU preparation context was lost while waiting.')
        }
        const status = context.clientWaitSync(fence, 0, 0)
        if (status === context.ALREADY_SIGNALED || status === context.CONDITION_SATISFIED) return
        if (status !== context.TIMEOUT_EXPIRED) {
          throw new Error('Zombie Escape GPU preparation fence failed.')
        }
      }
    }
    await Promise.race([waitForFence(), timeout])
  } finally {
    finished = true
    timer.clear(timeoutHandle)
    context.deleteSync(fence)
  }
}

export function createZombieEscapeRenderReadinessCoordinator({
  compile,
  prewarmPresentationPipeline = requestLandrushPresentationPipelinePrewarm,
  timeoutMs = ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
  timer,
  watchdogStartsOnAdmission = false,
}: {
  compile?: typeof compileZombieEscapeRenderRepresentatives
  prewarmPresentationPipeline?: typeof requestLandrushPresentationPipelinePrewarm
  timeoutMs?: number
  timer?: ZombieEscapeRenderReadinessTimer
  watchdogStartsOnAdmission?: boolean
} = {}): ZombieEscapeRenderReadinessCoordinator {
  return createLandrushRenderReadinessCoordinator({
    compile:
      compile ??
      ((request, onProgress) =>
        compileZombieEscapeRenderRepresentatives(request, onProgress, prewarmPresentationPipeline)),
    formatTimeoutMessage: (boundedTimeoutMs) =>
      `Zombie Escape render readiness timed out after ${String(boundedTimeoutMs)}ms.`,
    timeoutMs,
    timer,
    watchdogStartsOnAdmission,
  })
}

function createRegistrySnapshot(
  expectedKeys: readonly ZombieEscapeRenderRepresentativeKey[],
  roots: ReadonlyMap<ZombieEscapeRenderRepresentativeKey, RegisteredRepresentative>,
  revision: number,
): ZombieEscapeRenderReadinessSnapshot {
  const missingKeys: ZombieEscapeRenderRepresentativeKey[] = []
  const representatives: ZombieEscapeRenderRepresentative[] = []
  for (const key of expectedKeys) {
    const registered = roots.get(key)
    if (registered) representatives.push({ key, root: registered.root })
    else missingKeys.push(key)
  }
  return {
    complete: missingKeys.length === 0,
    missingKeys,
    representatives,
    revision,
  }
}
