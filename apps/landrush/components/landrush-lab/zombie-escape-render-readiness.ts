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
  await renderer.compileAsync(targetScene, camera, targetScene)
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
