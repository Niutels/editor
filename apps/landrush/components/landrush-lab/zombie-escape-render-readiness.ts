import { Group, type Object3D } from 'three'
import {
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

export const ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY = 'weapon-pickup'
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
  await compileZombieEscapeRenderAggregate(
    { camera, renderer, representatives, targetScene },
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
        representatives,
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
      representatives,
      targetScene,
    })
  } else {
    await renderer.compileAsync(targetScene, camera, targetScene)
  }
  completed += 1
  onProgress?.({ completed, total })
  await waitForZombieEscapeGpuPreparation(renderer)
  onProgress?.({ completed: total, total })
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
        placements.push({
          index: representativeRoot.parent?.children.indexOf(representativeRoot) ?? -1,
          parent: representativeRoot.parent,
          root: representativeRoot,
        })
        root.add(representativeRoot)
      }
      return compileLandrushRenderRepresentative({
        camera,
        renderer,
        representative: { key, root },
        targetScene,
      })
    } finally {
      restoreZombieEscapeRenderAggregatePlacements(root, placements)
    }
  })()
  await pendingCompilation
}

function restoreZombieEscapeRenderAggregatePlacements(
  aggregateRoot: Group,
  placements: readonly Readonly<{
    index: number
    parent: Object3D | null
    root: Object3D
  }>[],
) {
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const placement = placements[index]!
    aggregateRoot.remove(placement.root)
    if (!placement.parent) continue
    placement.parent.add(placement.root)
    const restoredIndex = placement.parent.children.indexOf(placement.root)
    const targetIndex = Math.min(placement.index, placement.parent.children.length - 1)
    if (restoredIndex === targetIndex) continue
    placement.parent.children.splice(restoredIndex, 1)
    placement.parent.children.splice(targetIndex, 0, placement.root)
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
