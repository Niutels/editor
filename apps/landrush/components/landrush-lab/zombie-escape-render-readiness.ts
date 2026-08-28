import { type Camera, type Object3D, Scene, Vector4 } from 'three'
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
  waitForLandrushRenderAdmissionOpportunity,
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
export const ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORT_WEIGHT = 24
export const ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS = 24
export const ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_FENCE_POLLS = 8

// This is an empirical scheduling score, not a millisecond bound.
const ZOMBIE_ESCAPE_WEBGL_REALIZATION_GEOMETRY_BYTES_PER_WEIGHT = 1024 * 1024
const ZOMBIE_ESCAPE_WEBGL_REALIZATION_VERTEX_INVOCATIONS_PER_WEIGHT = 100_000

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

export type ZombieEscapeWebGLRealizationUnit = Readonly<{
  renderables: readonly Object3D[]
  root: Object3D
  weight: number
}>

export type ZombieEscapeWebGLRealizationCohort = Readonly<{
  units: readonly ZombieEscapeWebGLRealizationUnit[]
  weight: number
}>

type ZombieEscapeWebGLFenceContext = Readonly<{
  ALREADY_SIGNALED: number
  CONDITION_SATISFIED: number
  SYNC_GPU_COMMANDS_COMPLETE: number
  TIMEOUT_EXPIRED: number
  WAIT_FAILED: number
  clientWaitSync: (sync: unknown, flags: number, timeout: number) => number
  deleteSync: (sync: unknown) => void
  fenceSync: (condition: number, flags: number) => unknown
  flush: () => void
}>

type ZombieEscapeWebGLRealizationRenderer = ZombieEscapePipelineRenderer & {
  autoClear: boolean
  getActiveCubeFace: () => number
  getActiveMipmapLevel: () => number
  getContext: () => unknown
  getRenderTarget: () => unknown
  getScissor: (target: Vector4) => Vector4
  getScissorTest: () => boolean
  getViewport: (target: Vector4) => Vector4
  render: (scene: Scene, camera: Camera) => void
  setRenderTarget: (target: unknown, activeCubeFace?: number, activeMipmapLevel?: number) => void
  setScissor: (scissor: Vector4) => void
  setScissorTest: (enabled: boolean) => void
  setViewport: (viewport: Vector4) => void
}

type ZombieEscapeWebGLRendererStateSnapshot = Readonly<{
  activeCubeFace: number
  activeMipmapLevel: number
  autoClear: boolean
  renderTarget: unknown
  scissor: Vector4
  scissorTest: boolean
  viewport: Vector4
}>

type ZombieEscapeWebGLObjectFlagSnapshot = Readonly<{
  frustumCulled: boolean
  layerMask: number
  object: Object3D
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

export async function compileZombieEscapeRenderRepresentatives(
  {
    camera,
    representatives,
    renderer,
    targetScene,
  }: Omit<ZombieEscapeRenderReadinessRequest, 'generation' | 'identity'>,
  waitForAdmissionOpportunity?: () => Promise<void>,
  isRequestCurrent: () => boolean = () => true,
) {
  await compileLandrushRenderRepresentatives(
    {
      camera,
      renderer,
      representatives,
      targetScene,
    },
    waitForAdmissionOpportunity,
    isRequestCurrent,
  )
  assertZombieEscapeRenderReadinessCurrent(isRequestCurrent)

  if (!representatives.some((representative) => representative.root === targetScene)) return

  await realizeZombieEscapeWebGLAttachedScene(
    { camera, renderer, targetScene },
    waitForAdmissionOpportunity ?? waitForLandrushRenderAdmissionOpportunity,
    isRequestCurrent,
  )
}

export function collectZombieEscapeWebGLRealizationUnits(
  targetScene: Object3D,
): readonly ZombieEscapeWebGLRealizationUnit[] {
  const units: ZombieEscapeWebGLRealizationUnit[] = []

  const visit = (object: Object3D) => {
    if (!object.visible) return

    if (isZombieEscapeRenderableObject(object)) {
      units.push({
        renderables: [object],
        root: object,
        weight: Math.min(
          ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORT_WEIGHT,
          estimateZombieEscapeWebGLRealizationWeight(object),
        ),
      })
    }

    for (const child of object.children) visit(child)
  }

  visit(targetScene)
  return units
}

export function planZombieEscapeWebGLRealizationCohorts(
  units: readonly ZombieEscapeWebGLRealizationUnit[],
  {
    maxCohorts = ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS,
    maxWeight = ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORT_WEIGHT,
  }: Readonly<{ maxCohorts?: number; maxWeight?: number }> = {},
): readonly ZombieEscapeWebGLRealizationCohort[] {
  const boundedMaxCohorts = Math.max(1, Math.trunc(maxCohorts))
  const boundedMaxWeight = Math.max(1, Math.trunc(maxWeight))
  const cohorts: Array<{ units: ZombieEscapeWebGLRealizationUnit[]; weight: number }> = []
  let current: { units: ZombieEscapeWebGLRealizationUnit[]; weight: number } | undefined

  for (const unit of units) {
    const boundedUnitWeight = Math.max(1, Math.min(boundedMaxWeight, Math.trunc(unit.weight)))
    if (!current || current.weight + boundedUnitWeight > boundedMaxWeight) {
      current = { units: [], weight: 0 }
      cohorts.push(current)
    }
    current.units.push(unit)
    current.weight += boundedUnitWeight
  }

  if (cohorts.length > boundedMaxCohorts) {
    throw new Error(
      `Zombie Escape WebGL realization requires ${String(cohorts.length)} cohorts; the bounded maximum is ${String(boundedMaxCohorts)}.`,
    )
  }
  return cohorts
}

export async function realizeZombieEscapeWebGLAttachedScene(
  {
    camera,
    renderer,
    targetScene,
  }: Readonly<{
    camera: Camera
    renderer: ZombieEscapePipelineRenderer
    targetScene: Scene
  }>,
  waitForAdmissionOpportunity = waitForLandrushRenderAdmissionOpportunity,
  isCurrent: () => boolean = () => true,
) {
  assertZombieEscapeRenderReadinessCurrent(isCurrent)
  if (renderer.backend?.device) return

  const webglRenderer = resolveZombieEscapeWebGLRealizationRenderer(renderer)
  const context = resolveZombieEscapeWebGLFenceContext(webglRenderer)
  const emptyScene = new Scene()
  const realizedRenderables = new Set<Object3D>()
  let submittedCohorts = 0
  let activeObjectSnapshots: readonly ZombieEscapeWebGLObjectFlagSnapshot[] | undefined
  let activeRendererSnapshot: ZombieEscapeWebGLRendererStateSnapshot | undefined

  try {
    activeRendererSnapshot = snapshotZombieEscapeWebGLRendererState(webglRenderer)
    await submitZombieEscapeWebGLRealizationDraw(
      () => {
        try {
          webglRenderer.render(emptyScene, camera)
        } finally {
          restoreZombieEscapeWebGLRendererState(webglRenderer, activeRendererSnapshot!)
          activeRendererSnapshot = undefined
        }
      },
      context,
      waitForAdmissionOpportunity,
      isCurrent,
    )

    while (true) {
      assertZombieEscapeRenderReadinessCurrent(isCurrent)
      const currentUnits = collectZombieEscapeWebGLRealizationUnits(targetScene)
      const coldUnits = currentUnits.filter((unit) =>
        unit.renderables.some((renderable) => !realizedRenderables.has(renderable)),
      )
      if (coldUnits.length === 0) return

      const remainingCohorts = ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS - submittedCohorts
      if (remainingCohorts <= 0) {
        throw new Error(
          `Zombie Escape WebGL realization exceeded the bounded maximum of ${String(ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS)} cohorts after the scene changed during admission.`,
        )
      }
      const cohort = planZombieEscapeWebGLRealizationCohorts(coldUnits, {
        maxCohorts: remainingCohorts,
      })[0]!
      activeObjectSnapshots = snapshotZombieEscapeWebGLRealizationObjects(currentUnits)
      activeRendererSnapshot = snapshotZombieEscapeWebGLRendererState(webglRenderer)
      applyZombieEscapeWebGLRealizationCohort(currentUnits, cohort)
      const diagnosticLabel = describeZombieEscapeWebGLRealizationCohort(submittedCohorts, cohort)
      markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:start`)
      try {
        await submitZombieEscapeWebGLRealizationDraw(
          () => {
            try {
              webglRenderer.render(targetScene, camera)
            } finally {
              restoreZombieEscapeWebGLRealizationObjects(activeObjectSnapshots!)
              restoreZombieEscapeWebGLRendererState(webglRenderer, activeRendererSnapshot!)
              activeObjectSnapshots = undefined
              activeRendererSnapshot = undefined
            }
          },
          context,
          waitForAdmissionOpportunity,
          isCurrent,
        )
      } finally {
        markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:end`)
      }
      for (const unit of cohort.units) {
        for (const renderable of unit.renderables) realizedRenderables.add(renderable)
      }
      submittedCohorts += 1
    }
  } finally {
    if (activeObjectSnapshots) {
      restoreZombieEscapeWebGLRealizationObjects(activeObjectSnapshots)
    }
    if (activeRendererSnapshot) {
      restoreZombieEscapeWebGLRendererState(webglRenderer, activeRendererSnapshot)
    }
  }
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

function describeZombieEscapeWebGLRealizationCohort(
  cohortIndex: number,
  cohort: ZombieEscapeWebGLRealizationCohort,
) {
  const units = cohort.units.map((unit) => {
    const renderable = unit.root as Object3D & {
      count?: number
      geometry?: Readonly<{
        attributes?: Readonly<Record<string, unknown>>
        type?: string
      }>
      material?: Readonly<{ type?: string }> | Readonly<{ type?: string }>[]
    }
    const material = Array.isArray(renderable.material)
      ? renderable.material.map(({ type }) => type ?? 'Material').join('+')
      : (renderable.material?.type ?? 'Material')
    return [
      renderable.name || renderable.type,
      `weight=${String(unit.weight)}`,
      `count=${String(renderable.count ?? 1)}`,
      `geometry=${renderable.geometry?.type ?? 'none'}`,
      `attributes=${Object.keys(renderable.geometry?.attributes ?? {})
        .sort()
        .join('+')}`,
      `material=${material}`,
    ].join(',')
  })
  return `landrush:webgl-realization:cohort=${String(cohortIndex)}:${units.join(';')}`
}

function markZombieEscapeWebGLRealizationDiagnostic(label: string) {
  if (
    typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('bench') !== '1'
  ) {
    return
  }
  window.performance.mark(label)
}

function estimateZombieEscapeWebGLRealizationWeight(object: Object3D) {
  const renderable = object as Object3D & {
    castShadow?: boolean
    count?: number
    geometry?: Readonly<{
      attributes?: Readonly<
        Record<
          string,
          Readonly<{
            array?: Readonly<{ byteLength?: number }>
            count?: number
          }>
        >
      >
      drawRange?: Readonly<{ count?: number }>
      index?: Readonly<{
        array?: Readonly<{ byteLength?: number }>
        count?: number
      }> | null
    }>
    isInstancedMesh?: boolean
    material?: unknown
  }
  const geometry = renderable.geometry
  const attributes = geometry?.attributes ? Object.values(geometry.attributes) : []
  const geometryBytes = attributes.reduce(
    (total, attribute) => total + Math.max(0, attribute.array?.byteLength ?? 0),
    Math.max(0, geometry?.index?.array?.byteLength ?? 0),
  )
  const positionCount = geometry?.attributes?.position?.count ?? 0
  const indexedCount = geometry?.index?.count ?? positionCount
  const drawCount = geometry?.drawRange?.count
  const vertexCount =
    typeof drawCount === 'number' && Number.isFinite(drawCount)
      ? Math.max(0, Math.min(indexedCount, drawCount))
      : Math.max(0, indexedCount)
  const instanceCount = renderable.isInstancedMesh
    ? Math.max(1, Math.trunc(renderable.count ?? 1))
    : 1
  const vertexInvocations = Math.min(Number.MAX_SAFE_INTEGER, vertexCount * instanceCount)
  const materialCount = Array.isArray(renderable.material)
    ? Math.max(1, renderable.material.length)
    : 1
  const geometryWeight = Math.ceil(
    geometryBytes / ZOMBIE_ESCAPE_WEBGL_REALIZATION_GEOMETRY_BYTES_PER_WEIGHT,
  )
  const vertexWeight = Math.ceil(
    vertexInvocations / ZOMBIE_ESCAPE_WEBGL_REALIZATION_VERTEX_INVOCATIONS_PER_WEIGHT,
  )
  const mainPassWeight = Math.max(1, materialCount + geometryWeight + vertexWeight)
  return renderable.castShadow ? mainPassWeight * 2 : mainPassWeight
}

function resolveZombieEscapeWebGLRealizationRenderer(
  renderer: ZombieEscapePipelineRenderer,
): ZombieEscapeWebGLRealizationRenderer {
  const candidate = renderer as Partial<ZombieEscapeWebGLRealizationRenderer>
  if (
    typeof candidate.autoClear !== 'boolean' ||
    typeof candidate.getActiveCubeFace !== 'function' ||
    typeof candidate.getActiveMipmapLevel !== 'function' ||
    typeof candidate.getContext !== 'function' ||
    typeof candidate.getRenderTarget !== 'function' ||
    typeof candidate.getScissor !== 'function' ||
    typeof candidate.getScissorTest !== 'function' ||
    typeof candidate.getViewport !== 'function' ||
    typeof candidate.render !== 'function' ||
    typeof candidate.setRenderTarget !== 'function' ||
    typeof candidate.setScissor !== 'function' ||
    typeof candidate.setScissorTest !== 'function' ||
    typeof candidate.setViewport !== 'function'
  ) {
    throw new Error(
      'Zombie Escape WebGL realization requires a state-preserving Three renderer contract.',
    )
  }
  return candidate as ZombieEscapeWebGLRealizationRenderer
}

function resolveZombieEscapeWebGLFenceContext(
  renderer: ZombieEscapeWebGLRealizationRenderer,
): ZombieEscapeWebGLFenceContext {
  const candidate = renderer.getContext() as Partial<ZombieEscapeWebGLFenceContext> | null
  if (
    !candidate ||
    typeof candidate.ALREADY_SIGNALED !== 'number' ||
    typeof candidate.CONDITION_SATISFIED !== 'number' ||
    typeof candidate.SYNC_GPU_COMMANDS_COMPLETE !== 'number' ||
    typeof candidate.TIMEOUT_EXPIRED !== 'number' ||
    typeof candidate.WAIT_FAILED !== 'number' ||
    typeof candidate.clientWaitSync !== 'function' ||
    typeof candidate.deleteSync !== 'function' ||
    typeof candidate.fenceSync !== 'function' ||
    typeof candidate.flush !== 'function'
  ) {
    throw new Error(
      'Zombie Escape WebGL realization requires a WebGL2 context with usable GPU fences.',
    )
  }
  return candidate as ZombieEscapeWebGLFenceContext
}

function snapshotZombieEscapeWebGLRealizationObjects(
  units: readonly ZombieEscapeWebGLRealizationUnit[],
) {
  const seen = new Set<Object3D>()
  const snapshots: ZombieEscapeWebGLObjectFlagSnapshot[] = []
  for (const unit of units) {
    for (const object of unit.renderables) {
      if (seen.has(object)) continue
      seen.add(object)
      snapshots.push({
        frustumCulled: object.frustumCulled,
        layerMask: object.layers.mask,
        object,
      })
    }
  }
  return snapshots
}

function applyZombieEscapeWebGLRealizationCohort(
  units: readonly ZombieEscapeWebGLRealizationUnit[],
  cohort: ZombieEscapeWebGLRealizationCohort,
) {
  const admitted = new Set(cohort.units)
  for (const unit of units) {
    for (const renderable of unit.renderables) {
      if (!admitted.has(unit)) {
        renderable.layers.mask = 0
        continue
      }
      renderable.frustumCulled = false
    }
  }
}

function restoreZombieEscapeWebGLRealizationObjects(
  snapshots: readonly ZombieEscapeWebGLObjectFlagSnapshot[],
) {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index]!
    snapshot.object.layers.mask = snapshot.layerMask
    snapshot.object.frustumCulled = snapshot.frustumCulled
  }
}

function snapshotZombieEscapeWebGLRendererState(
  renderer: ZombieEscapeWebGLRealizationRenderer,
): ZombieEscapeWebGLRendererStateSnapshot {
  return {
    activeCubeFace: renderer.getActiveCubeFace(),
    activeMipmapLevel: renderer.getActiveMipmapLevel(),
    autoClear: renderer.autoClear,
    renderTarget: renderer.getRenderTarget(),
    scissor: renderer.getScissor(new Vector4()).clone(),
    scissorTest: renderer.getScissorTest(),
    viewport: renderer.getViewport(new Vector4()).clone(),
  }
}

function restoreZombieEscapeWebGLRendererState(
  renderer: ZombieEscapeWebGLRealizationRenderer,
  snapshot: ZombieEscapeWebGLRendererStateSnapshot,
) {
  renderer.autoClear = snapshot.autoClear
  renderer.setRenderTarget(
    snapshot.renderTarget,
    snapshot.activeCubeFace,
    snapshot.activeMipmapLevel,
  )
  renderer.setViewport(snapshot.viewport)
  renderer.setScissor(snapshot.scissor)
  renderer.setScissorTest(snapshot.scissorTest)
}

async function submitZombieEscapeWebGLRealizationDraw(
  draw: () => void,
  context: ZombieEscapeWebGLFenceContext,
  waitForAdmissionOpportunity: () => Promise<void>,
  isCurrent: () => boolean,
) {
  assertZombieEscapeRenderReadinessCurrent(isCurrent)
  draw()
  assertZombieEscapeRenderReadinessCurrent(isCurrent)
  const fence = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (!fence) throw new Error('Zombie Escape WebGL realization could not create a GPU fence.')

  try {
    context.flush()
    for (let poll = 0; poll < ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_FENCE_POLLS; poll += 1) {
      await waitForAdmissionOpportunity()
      assertZombieEscapeRenderReadinessCurrent(isCurrent)
      const status = context.clientWaitSync(fence, 0, 0)
      if (status === context.ALREADY_SIGNALED || status === context.CONDITION_SATISFIED) return
      if (status === context.WAIT_FAILED) {
        throw new Error('Zombie Escape WebGL realization GPU fence wait failed.')
      }
      if (status !== context.TIMEOUT_EXPIRED) {
        throw new Error(
          `Zombie Escape WebGL realization received an unexpected fence status: ${String(status)}.`,
        )
      }
    }
    throw new Error(
      `Zombie Escape WebGL realization GPU fence did not settle after ${String(ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_FENCE_POLLS)} admission opportunities.`,
    )
  } finally {
    context.deleteSync(fence)
  }
}

function assertZombieEscapeRenderReadinessCurrent(isCurrent: () => boolean) {
  if (!isCurrent()) {
    throw new Error('Zombie Escape render readiness request became stale during realization.')
  }
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
