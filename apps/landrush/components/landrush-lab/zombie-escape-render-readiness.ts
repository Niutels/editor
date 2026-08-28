import type { Object3D } from 'three'
import {
  compileLandrushRenderRepresentatives,
  createLandrushRenderReadinessCoordinator,
  LANDRUSH_RENDER_READINESS_TIMEOUT_MS,
  type LandrushPipelineRenderer,
  type LandrushRenderReadinessCoordinator,
  type LandrushRenderReadinessRequest,
  type LandrushRenderReadinessStatus,
  type LandrushRenderReadinessTimer,
  type LandrushRenderRepresentative,
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
] as const

export const ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY = 'weapon-pickup'
export const ZOMBIE_ESCAPE_FALLBACK_RENDER_REPRESENTATIVE_KEY = 'zombie:fallback'
export const ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS = LANDRUSH_RENDER_READINESS_TIMEOUT_MS

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

export type ZombieEscapeRenderReadinessTimer = LandrushRenderReadinessTimer

export type ZombieEscapeRenderRepresentativePrewarmQueue = Readonly<{
  dispose: () => void
  invalidate: () => void
  synchronize: (request: Omit<ZombieEscapeRenderReadinessRequest, 'identity'>) => void
  waitForSettled: () => Promise<'failed' | 'ready' | 'stale'>
}>

type RegisteredRepresentative = Readonly<{
  registration: symbol
  root: Object3D
}>

export function createZombieEscapeHeldWeaponRenderRepresentativeKey(weaponId: string) {
  return `weapon-held:${weaponId}`
}

export function createZombieEscapeZombieRenderRepresentativeKey(zombieId: string) {
  return `zombie:${zombieId}`
}

export function getZombieEscapeRenderRepresentativeKeys(
  quality: ZombieEscapeQuality,
): readonly ZombieEscapeRenderRepresentativeKey[] {
  return [
    ...ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon) =>
      createZombieEscapeHeldWeaponRenderRepresentativeKey(weapon.id),
    ),
    ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY,
    ZOMBIE_ESCAPE_FALLBACK_RENDER_REPRESENTATIVE_KEY,
    ...(quality === 'balanced'
      ? ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie) =>
          createZombieEscapeZombieRenderRepresentativeKey(zombie.id),
        )
      : []),
    ...ZOMBIE_ESCAPE_EFFECT_RENDER_REPRESENTATIVE_KEYS,
  ]
}

export function createZombieEscapeRenderReadinessSnapshotSelector(
  requiredKeys: readonly ZombieEscapeRenderRepresentativeKey[],
) {
  const uniqueRequiredKeys = Array.from(new Set(requiredKeys))
  let previous: ZombieEscapeRenderReadinessSnapshot | undefined
  return (snapshot: ZombieEscapeRenderReadinessSnapshot) => {
    const roots = new Map(snapshot.representatives.map(({ key, root }) => [key, root]))
    const missingKeys: ZombieEscapeRenderRepresentativeKey[] = []
    const representatives: ZombieEscapeRenderRepresentative[] = []
    for (const key of uniqueRequiredKeys) {
      const root = roots.get(key)
      if (root) representatives.push({ key, root })
      else missingKeys.push(key)
    }
    if (
      previous &&
      equalZombieEscapeReadinessKeys(previous.missingKeys, missingKeys) &&
      equalZombieEscapeReadinessRepresentatives(previous.representatives, representatives)
    ) {
      return previous
    }
    previous = {
      complete: missingKeys.length === 0,
      missingKeys,
      representatives,
      revision: snapshot.revision,
    }
    return previous
  }
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

export async function compileZombieEscapeRenderRepresentatives({
  camera,
  representatives,
  renderer,
  targetScene,
}: Omit<ZombieEscapeRenderReadinessRequest, 'generation' | 'identity'>) {
  await compileLandrushRenderRepresentatives({
    camera,
    renderer,
    representatives,
    targetScene,
  })
}

export function createZombieEscapeRenderReadinessCoordinator({
  compile = compileZombieEscapeRenderRepresentatives,
  timeoutMs = ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
  timer,
}: {
  compile?: typeof compileZombieEscapeRenderRepresentatives
  timeoutMs?: number
  timer?: ZombieEscapeRenderReadinessTimer
} = {}): ZombieEscapeRenderReadinessCoordinator {
  return createLandrushRenderReadinessCoordinator({
    compile,
    formatTimeoutMessage: (boundedTimeoutMs) =>
      `Zombie Escape render readiness timed out after ${String(boundedTimeoutMs)}ms.`,
    timeoutMs,
    timer,
  })
}

export function createZombieEscapeRenderRepresentativePrewarmQueue({
  compile = compileLandrushRenderRepresentatives,
  onStatus,
  timeoutMs = ZOMBIE_ESCAPE_RENDER_READINESS_TIMEOUT_MS,
  timer,
}: {
  compile?: typeof compileLandrushRenderRepresentatives
  onStatus?: (key: string, status: ZombieEscapeRenderReadinessStatus) => void
  timeoutMs?: number
  timer?: ZombieEscapeRenderReadinessTimer
} = {}): ZombieEscapeRenderRepresentativePrewarmQueue {
  const coordinator = createLandrushRenderReadinessCoordinator({
    compile,
    formatTimeoutMessage: (boundedTimeoutMs) =>
      `Zombie Escape render representative prewarm timed out after ${String(boundedTimeoutMs)}ms.`,
    timeoutMs,
    timer,
  })
  let context:
    | Pick<ZombieEscapeRenderReadinessRequest, 'camera' | 'generation' | 'renderer' | 'targetScene'>
    | undefined
  let disposed = false
  let failed = false
  let revision = 0
  let roots = new Map<string, Object3D>()
  let tail = Promise.resolve()

  const invalidate = () => {
    revision += 1
    context = undefined
    failed = false
    roots = new Map()
    tail = Promise.resolve()
    coordinator.invalidate()
  }

  return {
    dispose() {
      if (disposed) return
      disposed = true
      invalidate()
      coordinator.dispose()
    },
    invalidate,
    synchronize(request) {
      if (disposed) return
      if (
        !context ||
        context.camera !== request.camera ||
        context.generation !== request.generation ||
        context.renderer !== request.renderer ||
        context.targetScene !== request.targetScene
      ) {
        invalidate()
        context = request
      }

      const currentKeys = new Set(request.representatives.map(({ key }) => key))
      for (const key of roots.keys()) {
        if (!currentKeys.has(key)) roots.delete(key)
      }
      for (const representative of request.representatives) {
        if (roots.get(representative.key) === representative.root) continue
        roots.set(representative.key, representative.root)
        const queuedRevision = revision
        const queuedRequest: ZombieEscapeRenderReadinessRequest = {
          ...request,
          identity: representative.root,
          representatives: [representative],
        }
        tail = tail.then(async () => {
          if (
            disposed ||
            revision !== queuedRevision ||
            roots.get(representative.key) !== representative.root
          ) {
            return
          }
          const result = await coordinator.request(queuedRequest, (status) => {
            if (
              disposed ||
              revision !== queuedRevision ||
              roots.get(representative.key) !== representative.root
            ) {
              return
            }
            onStatus?.(representative.key, status)
          })
          if (revision === queuedRevision && result === 'failed') failed = true
        })
      }
    },
    waitForSettled() {
      const queuedRevision = revision
      const queuedTail = tail
      return queuedTail.then(() => {
        if (disposed || revision !== queuedRevision) return 'stale'
        return failed ? 'failed' : 'ready'
      })
    },
  }
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

function equalZombieEscapeReadinessKeys(
  left: readonly ZombieEscapeRenderRepresentativeKey[],
  right: readonly ZombieEscapeRenderRepresentativeKey[],
) {
  return left.length === right.length && left.every((key, index) => key === right[index])
}

function equalZombieEscapeReadinessRepresentatives(
  left: readonly ZombieEscapeRenderRepresentative[],
  right: readonly ZombieEscapeRenderRepresentative[],
) {
  return (
    left.length === right.length &&
    left.every(
      (representative, index) =>
        representative.key === right[index]?.key && representative.root === right[index]?.root,
    )
  )
}
