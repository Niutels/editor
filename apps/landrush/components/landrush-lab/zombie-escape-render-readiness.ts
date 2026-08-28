import {
  LANDRUSH_ROBOT_STAGED_TEXTURE_EXPECTED,
  readLandrushRobotStagedTextureUpload,
} from '@landrush/pascal-plugin/landrush-world/robot'
import {
  Box2,
  type Camera,
  DataTexture,
  type Object3D,
  Scene,
  type Texture,
  Vector2,
  Vector4,
} from 'three'
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
export const ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORT_WEIGHT = 8
export const ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_COHORTS = 24
export const ZOMBIE_ESCAPE_WEBGL_REALIZATION_MAX_FENCE_POLLS = 8
export const ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_DISCOVERY_TIMEOUT_MS = 10_000
export const ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_MAX_DISCOVERY_ADMISSIONS = 720
export const ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_MAX_BYTES = 64 * 1024

// This is an empirical scheduling score, not a millisecond bound.
const ZOMBIE_ESCAPE_WEBGL_REALIZATION_GEOMETRY_BYTES_PER_WEIGHT = 1024 * 1024
const ZOMBIE_ESCAPE_WEBGL_REALIZATION_VERTEX_INVOCATIONS_PER_WEIGHT = 100_000
const ZOMBIE_ESCAPE_WEBGL_REALIZATION_VIEWPORT = new Vector4(0, 0, 1, 1)

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

type ZombieEscapeWebGLTextureUploadContext = ZombieEscapeWebGLFenceContext &
  Readonly<{
    ACTIVE_TEXTURE: number
    PIXEL_UNPACK_BUFFER: number
    PIXEL_UNPACK_BUFFER_BINDING: number
    TEXTURE_2D: number
    TEXTURE_BINDING_2D: number
    UNPACK_ALIGNMENT: number
    UNPACK_COLORSPACE_CONVERSION_WEBGL: number
    UNPACK_FLIP_Y_WEBGL: number
    UNPACK_IMAGE_HEIGHT: number
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: number
    UNPACK_ROW_LENGTH: number
    UNPACK_SKIP_IMAGES: number
    UNPACK_SKIP_PIXELS: number
    UNPACK_SKIP_ROWS: number
    bindBuffer: (target: number, buffer: unknown) => void
    getParameter: (parameter: number) => unknown
  }>

type ZombieEscapeWebGLBackend = Readonly<{
  copyTextureToTexture: (
    source: Texture,
    destination: Texture,
    sourceRegion: Box2,
    destinationPosition: Vector2,
    sourceLevel: number,
    destinationLevel: number,
  ) => void
  get: (value: object) => unknown
  has: (value: object) => boolean
  isWebGLBackend: true
  state: Readonly<{
    activeTexture: (slot: number) => void
    bindTexture: (type: number, texture: unknown, slot?: number) => void
    getParameter: (parameter: number) => unknown
    pixelStorei: (parameter: number, value: boolean | number) => void
  }>
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
  initTexture: (texture: Texture) => void
  render: (scene: Scene, camera: Camera) => void
  setRenderTarget: (target: unknown, activeCubeFace?: number, activeMipmapLevel?: number) => void
  setScissor: (scissor: Vector4) => void
  setScissorTest: (enabled: boolean) => void
  setViewport: (viewport: Vector4) => void
}

type ZombieEscapeWebGLTextureUploadRenderer = ZombieEscapeWebGLRealizationRenderer & {
  backend: ZombieEscapeWebGLBackend
}

const stagedZombieEscapeTexturesByBackend = new WeakMap<object, WeakMap<Texture, object>>()

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
  castShadow: boolean
  frustumCulled: boolean
  layerMask: number
  object: Object3D
}>

type ZombieEscapeWebGLDrawRangeSnapshot = Readonly<{
  count: number
  geometry: Readonly<{
    drawRange: Readonly<{ count: number; start: number }>
    setDrawRange: (start: number, count: number) => void
  }>
  start: number
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
  const wait = waitForAdmissionOpportunity ?? waitForLandrushRenderAdmissionOpportunity
  assertZombieEscapeRenderReadinessCurrent(isRequestCurrent)
  await renderer.init?.()
  assertZombieEscapeRenderReadinessCurrent(isRequestCurrent)
  if (!renderer.backend?.device && shouldStageZombieEscapeWebGLTextures(targetScene)) {
    await stageZombieEscapeWebGLTextures({ renderer, targetScene }, wait, isRequestCurrent)
  }
  await compileLandrushRenderRepresentatives(
    {
      camera,
      renderer,
      representatives,
      targetScene,
    },
    wait,
    isRequestCurrent,
    { rendererInitialized: true },
  )
  assertZombieEscapeRenderReadinessCurrent(isRequestCurrent)
  if (!renderer.backend?.device && shouldStageZombieEscapeWebGLTextures(targetScene)) {
    await stageZombieEscapeWebGLTextures({ renderer, targetScene }, wait, isRequestCurrent)
  }

  if (!representatives.some((representative) => representative.root === targetScene)) return

  await realizeZombieEscapeWebGLAttachedScene(
    { camera, renderer, targetScene },
    wait,
    isRequestCurrent,
  )
}

export async function stageZombieEscapeWebGLTextures(
  {
    renderer,
    targetScene,
  }: Readonly<{
    renderer: ZombieEscapePipelineRenderer
    targetScene: Scene
  }>,
  waitForAdmissionOpportunity = waitForLandrushRenderAdmissionOpportunity,
  isCurrent: () => boolean = () => true,
) {
  assertZombieEscapeRenderReadinessCurrent(isCurrent)
  if (renderer.backend?.device) return

  const webglRenderer = resolveZombieEscapeWebGLTextureUploadRenderer(renderer)
  const backend = webglRenderer.backend
  const context = resolveZombieEscapeWebGLTextureUploadContext(webglRenderer)
  let completedTextures = stagedZombieEscapeTexturesByBackend.get(backend)
  if (!completedTextures) {
    completedTextures = new WeakMap()
    stagedZombieEscapeTexturesByBackend.set(backend, completedTextures)
  }
  const discoveryStartedAt = readZombieEscapeReadinessNow()
  let discoveryAdmissions = 0

  while (true) {
    assertZombieEscapeRenderReadinessCurrent(isCurrent)
    const snapshot = collectZombieEscapeStagedTextureUploads(targetScene)
    const pendingUploads = snapshot.uploads.filter(
      ({ texture }) => !isZombieEscapeStagedTextureComplete(backend, completedTextures!, texture),
    )
    if (pendingUploads.length === 0) {
      if (!snapshot.expected || snapshot.uploads.length > 0) return
      if (
        discoveryAdmissions >= ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_MAX_DISCOVERY_ADMISSIONS ||
        readZombieEscapeReadinessNow() - discoveryStartedAt >=
          ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_DISCOVERY_TIMEOUT_MS
      ) {
        throw new Error(
          'Zombie Escape expected the staged player texture, but the robot did not attach before the readiness deadline.',
        )
      }
      discoveryAdmissions += 1
      await waitForAdmissionOpportunity()
      continue
    }

    for (const upload of pendingUploads) {
      assertZombieEscapeRenderReadinessCurrent(isCurrent)
      upload.texture.source.dataReady = false
      const textureVersion = upload.texture.version
      const sourceVersion = upload.texture.source.version
      await waitForAdmissionOpportunity()
      assertZombieEscapeRenderReadinessCurrent(isCurrent)
      await submitZombieEscapeWebGLRealizationDraw(
        () =>
          initializeZombieEscapeStagedTexture({
            backend,
            context,
            renderer: webglRenderer,
            texture: upload.texture,
          }),
        context,
        waitForAdmissionOpportunity,
        isCurrent,
      )

      const textureResource = resolveZombieEscapeWebGLTextureResource(backend, upload.texture)
      if (!textureResource) {
        throw new Error('Zombie Escape staged texture allocation produced no WebGL resource.')
      }
      const stagingTexture = new DataTexture(upload.pixels, upload.width, upload.height)
      const rowsPerChunk = Math.max(
        1,
        Math.floor(ZOMBIE_ESCAPE_WEBGL_STAGED_TEXTURE_MAX_BYTES / (upload.width * 4)),
      )
      try {
        for (let y = 0; y < upload.height; y += rowsPerChunk) {
          const rowCount = Math.min(rowsPerChunk, upload.height - y)
          const sourceRegion = new Box2(new Vector2(0, y), new Vector2(upload.width, y + rowCount))
          const destinationPosition = new Vector2(0, y)
          await waitForAdmissionOpportunity()
          assertZombieEscapeRenderReadinessCurrent(isCurrent)
          assertZombieEscapeStagedTextureIdentity({
            backend,
            sourceVersion,
            texture: upload.texture,
            textureResource,
            textureVersion,
          })
          await submitZombieEscapeWebGLRealizationDraw(
            () =>
              copyZombieEscapeStagedTextureRows({
                backend,
                context,
                destination: upload.texture,
                destinationPosition,
                source: stagingTexture,
                sourceRegion,
              }),
            context,
            waitForAdmissionOpportunity,
            isCurrent,
          )
        }
        assertZombieEscapeStagedTextureIdentity({
          backend,
          sourceVersion,
          texture: upload.texture,
          textureResource,
          textureVersion,
        })
        completedTextures.set(upload.texture, textureResource)
      } finally {
        stagingTexture.dispose()
      }
    }
  }
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
  const realizedTextures = new Set<Texture>()
  const completedStagedTextures = webglRenderer.backend
    ? stagedZombieEscapeTexturesByBackend.get(webglRenderer.backend)
    : undefined
  if (completedStagedTextures) {
    for (const upload of collectZombieEscapeStagedTextureUploads(targetScene).uploads) {
      if (
        isZombieEscapeStagedTextureComplete(
          webglRenderer.backend as ZombieEscapeWebGLBackend,
          completedStagedTextures,
          upload.texture,
        )
      ) {
        realizedTextures.add(upload.texture)
      }
    }
  }
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
      const diagnosticLabel = describeZombieEscapeWebGLRealizationCohort(submittedCohorts, cohort)
      const coldTextures = collectZombieEscapeWebGLRealizationTextures(cohort).filter(
        (texture) => !realizedTextures.has(texture),
      )
      for (const texture of coldTextures) {
        await submitZombieEscapeWebGLRealizationDraw(
          () => webglRenderer.initTexture(texture),
          context,
          waitForAdmissionOpportunity,
          isCurrent,
        )
        realizedTextures.add(texture)
      }
      const hasShadowCasters = cohort.units.some((unit) =>
        unit.renderables.some((renderable) => renderable.castShadow),
      )

      if (hasShadowCasters) {
        const mainPilotDrawRanges = snapshotZombieEscapeWebGLPilotDrawRanges(cohort)
        if (mainPilotDrawRanges.length > 0) {
          const mainPilotUnits = collectZombieEscapeWebGLRealizationUnits(targetScene)
          const mainPilotRenderables = new Set(mainPilotUnits.flatMap((unit) => unit.renderables))
          activeObjectSnapshots = snapshotZombieEscapeWebGLRealizationObjects(mainPilotUnits)
          activeRendererSnapshot = snapshotZombieEscapeWebGLRendererState(webglRenderer)
          applyZombieEscapeWebGLRealizationRendererState(webglRenderer)
          applyZombieEscapeWebGLRealizationCohort(mainPilotUnits, cohort)
          for (const unit of cohort.units) {
            for (const renderable of unit.renderables) {
              if (mainPilotRenderables.has(renderable)) renderable.castShadow = false
            }
          }
          applyZombieEscapeWebGLPilotDrawRanges(mainPilotDrawRanges)
          markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:main-pilot:submit`)
          await submitZombieEscapeWebGLRealizationDraw(
            () => {
              try {
                webglRenderer.render(targetScene, camera)
              } finally {
                restoreZombieEscapeWebGLDrawRanges(mainPilotDrawRanges)
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
          markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:main-pilot:settled`)
        }

        const mainUnits = collectZombieEscapeWebGLRealizationUnits(targetScene)
        const mainRenderables = new Set(mainUnits.flatMap((unit) => unit.renderables))
        activeObjectSnapshots = snapshotZombieEscapeWebGLRealizationObjects(mainUnits)
        activeRendererSnapshot = snapshotZombieEscapeWebGLRendererState(webglRenderer)
        applyZombieEscapeWebGLRealizationRendererState(webglRenderer)
        applyZombieEscapeWebGLRealizationCohort(mainUnits, cohort)
        for (const unit of cohort.units) {
          for (const renderable of unit.renderables) {
            if (mainRenderables.has(renderable)) renderable.castShadow = false
          }
        }
        markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:main-only:submit`)
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
        markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:main-only:settled`)
      }

      const pilotUnits = collectZombieEscapeWebGLRealizationUnits(targetScene)
      const pilotDrawRanges = snapshotZombieEscapeWebGLPilotDrawRanges(cohort)
      if (pilotDrawRanges.length > 0) {
        activeObjectSnapshots = snapshotZombieEscapeWebGLRealizationObjects(pilotUnits)
        activeRendererSnapshot = snapshotZombieEscapeWebGLRendererState(webglRenderer)
        applyZombieEscapeWebGLRealizationRendererState(webglRenderer)
        applyZombieEscapeWebGLRealizationCohort(pilotUnits, cohort)
        applyZombieEscapeWebGLPilotDrawRanges(pilotDrawRanges)
        markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:shadow-pilot:submit`)
        await submitZombieEscapeWebGLRealizationDraw(
          () => {
            try {
              webglRenderer.render(targetScene, camera)
            } finally {
              restoreZombieEscapeWebGLDrawRanges(pilotDrawRanges)
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
        markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:shadow-pilot:settled`)
      }

      const combinedUnits = collectZombieEscapeWebGLRealizationUnits(targetScene)
      const combinedRenderables = new Set(combinedUnits.flatMap((unit) => unit.renderables))
      const combinedShadowCasters = new Set(
        cohort.units.flatMap((unit) =>
          unit.renderables.filter(
            (renderable) => combinedRenderables.has(renderable) && renderable.castShadow,
          ),
        ),
      )
      activeObjectSnapshots = snapshotZombieEscapeWebGLRealizationObjects(combinedUnits)
      activeRendererSnapshot = snapshotZombieEscapeWebGLRendererState(webglRenderer)
      applyZombieEscapeWebGLRealizationRendererState(webglRenderer)
      applyZombieEscapeWebGLRealizationCohort(combinedUnits, cohort)
      markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:combined:submit`)
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
      markZombieEscapeWebGLRealizationDiagnostic(`${diagnosticLabel}:combined:settled`)
      for (const unit of cohort.units) {
        for (const renderable of unit.renderables) {
          if (
            combinedRenderables.has(renderable) &&
            (!renderable.castShadow || combinedShadowCasters.has(renderable))
          ) {
            realizedRenderables.add(renderable)
          }
        }
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
  const names = cohort.units.map(({ root }) => root.name || root.type).join('+')
  return `landrush:webgl-realization:cohort=${String(cohortIndex)}:${names}`
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
    typeof candidate.initTexture !== 'function' ||
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

function resolveZombieEscapeWebGLTextureUploadRenderer(
  renderer: ZombieEscapePipelineRenderer,
): ZombieEscapeWebGLTextureUploadRenderer {
  const candidate = resolveZombieEscapeWebGLRealizationRenderer(
    renderer,
  ) as Partial<ZombieEscapeWebGLTextureUploadRenderer>
  if (
    candidate.backend?.isWebGLBackend !== true ||
    typeof candidate.backend.copyTextureToTexture !== 'function' ||
    typeof candidate.backend.get !== 'function' ||
    typeof candidate.backend.has !== 'function' ||
    typeof candidate.backend.state?.activeTexture !== 'function' ||
    typeof candidate.backend.state.bindTexture !== 'function' ||
    typeof candidate.backend.state?.getParameter !== 'function' ||
    typeof candidate.backend.state.pixelStorei !== 'function'
  ) {
    throw new Error(
      'Zombie Escape staged texture upload requires the Three WebGL backend contract.',
    )
  }
  return candidate as ZombieEscapeWebGLTextureUploadRenderer
}

function shouldStageZombieEscapeWebGLTextures(targetScene: Object3D) {
  const snapshot = collectZombieEscapeStagedTextureUploads(targetScene)
  return snapshot.expected || snapshot.uploads.length > 0
}

function collectZombieEscapeStagedTextureUploads(targetScene: Object3D) {
  const uploads = new Map<
    Texture,
    NonNullable<ReturnType<typeof readLandrushRobotStagedTextureUpload>>
  >()
  let expected = false
  targetScene.traverse((object) => {
    if (object.userData[LANDRUSH_ROBOT_STAGED_TEXTURE_EXPECTED] === true) expected = true
    const materialOwner = object as Object3D & { material?: unknown }
    const materials = [
      ...(Array.isArray(materialOwner.material)
        ? materialOwner.material
        : [materialOwner.material]),
      ...(Array.isArray(object.userData.landrushOriginalMaterial)
        ? object.userData.landrushOriginalMaterial
        : [object.userData.landrushOriginalMaterial]),
    ]
    for (const candidate of materials) {
      if (!candidate || typeof candidate !== 'object') continue
      for (const value of Object.values(candidate)) {
        if (!isZombieEscapeWebGLTexture(value) || uploads.has(value)) continue
        const upload = readLandrushRobotStagedTextureUpload(value)
        if (upload) uploads.set(value, upload)
      }
    }
  })
  return { expected, uploads: Array.from(uploads.values()) }
}

function isZombieEscapeStagedTextureComplete(
  backend: ZombieEscapeWebGLBackend,
  completedTextures: WeakMap<Texture, object>,
  texture: Texture,
) {
  const completedResource = completedTextures.get(texture)
  if (!completedResource) return false
  const currentResource = resolveZombieEscapeWebGLTextureResource(backend, texture)
  if (currentResource === completedResource) return true
  completedTextures.delete(texture)
  return false
}

function resolveZombieEscapeWebGLTextureResource(
  backend: Pick<ZombieEscapeWebGLBackend, 'get' | 'has'>,
  texture: Texture,
) {
  if (!backend.has(texture)) return null
  const textureData = backend.get(texture) as Readonly<{ textureGPU?: unknown }> | null
  const textureGPU = textureData?.textureGPU
  return textureGPU && typeof textureGPU === 'object' ? textureGPU : null
}

function assertZombieEscapeStagedTextureIdentity({
  backend,
  sourceVersion,
  texture,
  textureResource,
  textureVersion,
}: Readonly<{
  backend: ZombieEscapeWebGLBackend
  sourceVersion: number
  texture: Texture
  textureResource: object
  textureVersion: number
}>) {
  if (
    texture.version !== textureVersion ||
    texture.source.version !== sourceVersion ||
    texture.source.dataReady !== false ||
    resolveZombieEscapeWebGLTextureResource(backend, texture) !== textureResource
  ) {
    throw new Error('Zombie Escape staged texture identity changed during row upload.')
  }
}

function initializeZombieEscapeStagedTexture({
  backend,
  context,
  renderer,
  texture,
}: Readonly<{
  backend: ZombieEscapeWebGLBackend
  context: ZombieEscapeWebGLTextureUploadContext
  renderer: ZombieEscapeWebGLTextureUploadRenderer
  texture: Texture
}>) {
  const state = snapshotZombieEscapeWebGLTextureOperationState(backend, context, [
    context.UNPACK_FLIP_Y_WEBGL,
    context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    context.UNPACK_ALIGNMENT,
    context.UNPACK_COLORSPACE_CONVERSION_WEBGL,
  ])
  backend.state.activeTexture(state.activeTexture)
  try {
    renderer.initTexture(texture)
  } finally {
    restoreZombieEscapeWebGLTextureOperationState(backend, context, state)
  }
}

function copyZombieEscapeStagedTextureRows({
  backend,
  context,
  destination,
  destinationPosition,
  source,
  sourceRegion,
}: Readonly<{
  backend: ZombieEscapeWebGLBackend
  context: ZombieEscapeWebGLTextureUploadContext
  destination: Texture
  destinationPosition: Vector2
  source: Texture
  sourceRegion: Box2
}>) {
  if (backend.has(source)) {
    throw new Error(
      'Zombie Escape staged texture source was unexpectedly registered with the renderer.',
    )
  }
  const state = snapshotZombieEscapeWebGLTextureOperationState(backend, context, [
    context.UNPACK_FLIP_Y_WEBGL,
    context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    context.UNPACK_ALIGNMENT,
    context.UNPACK_ROW_LENGTH,
    context.UNPACK_IMAGE_HEIGHT,
    context.UNPACK_SKIP_PIXELS,
    context.UNPACK_SKIP_ROWS,
    context.UNPACK_SKIP_IMAGES,
  ])
  const previousPixelUnpackBuffer = context.getParameter(context.PIXEL_UNPACK_BUFFER_BINDING)

  backend.state.activeTexture(state.activeTexture)
  context.bindBuffer(context.PIXEL_UNPACK_BUFFER, null)
  try {
    backend.copyTextureToTexture(source, destination, sourceRegion, destinationPosition, 0, 0)
  } finally {
    try {
      restoreZombieEscapeWebGLTextureOperationState(backend, context, state)
    } finally {
      context.bindBuffer(context.PIXEL_UNPACK_BUFFER, previousPixelUnpackBuffer)
    }
  }
}

function snapshotZombieEscapeWebGLTextureOperationState(
  backend: ZombieEscapeWebGLBackend,
  context: ZombieEscapeWebGLTextureUploadContext,
  pixelStoreParameters: readonly number[],
) {
  const activeTexture = context.getParameter(context.ACTIVE_TEXTURE)
  if (typeof activeTexture !== 'number') {
    throw new Error('Zombie Escape staged texture upload could not snapshot active texture state.')
  }
  const texture2D = context.getParameter(context.TEXTURE_BINDING_2D)
  const pixelStore = pixelStoreParameters.map((parameter) => {
    const value = backend.state.getParameter(parameter)
    if (typeof value !== 'boolean' && typeof value !== 'number') {
      throw new Error('Zombie Escape staged texture upload could not snapshot pixel-store state.')
    }
    return [parameter, value] as const
  })
  return { activeTexture, pixelStore, texture2D }
}

function restoreZombieEscapeWebGLTextureOperationState(
  backend: ZombieEscapeWebGLBackend,
  context: ZombieEscapeWebGLTextureUploadContext,
  state: Readonly<{
    activeTexture: number
    pixelStore: readonly (readonly [number, boolean | number])[]
    texture2D: unknown
  }>,
) {
  try {
    for (const [parameter, value] of state.pixelStore) {
      backend.state.pixelStorei(parameter, value)
    }
  } finally {
    backend.state.bindTexture(context.TEXTURE_2D, state.texture2D, state.activeTexture)
    backend.state.activeTexture(state.activeTexture)
  }
}

function readZombieEscapeReadinessNow() {
  return globalThis.performance?.now() ?? Date.now()
}

function collectZombieEscapeWebGLRealizationTextures(
  cohort: ZombieEscapeWebGLRealizationCohort,
): readonly Texture[] {
  const textures = new Set<Texture>()
  for (const unit of cohort.units) {
    for (const renderable of unit.renderables) {
      const material = (renderable as Object3D & { material?: unknown }).material
      const materials = Array.isArray(material) ? material : [material]
      for (const candidate of materials) {
        if (!candidate || typeof candidate !== 'object') continue
        for (const value of Object.values(candidate)) {
          if (isZombieEscapeWebGLTexture(value)) textures.add(value)
        }
      }
    }
  }
  return Array.from(textures)
}

function isZombieEscapeWebGLTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === 'object' && (value as { isTexture?: boolean }).isTexture)
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

function resolveZombieEscapeWebGLTextureUploadContext(
  renderer: ZombieEscapeWebGLRealizationRenderer,
): ZombieEscapeWebGLTextureUploadContext {
  const candidate = resolveZombieEscapeWebGLFenceContext(
    renderer,
  ) as Partial<ZombieEscapeWebGLTextureUploadContext>
  if (
    typeof candidate.ACTIVE_TEXTURE !== 'number' ||
    typeof candidate.PIXEL_UNPACK_BUFFER !== 'number' ||
    typeof candidate.PIXEL_UNPACK_BUFFER_BINDING !== 'number' ||
    typeof candidate.TEXTURE_2D !== 'number' ||
    typeof candidate.TEXTURE_BINDING_2D !== 'number' ||
    typeof candidate.UNPACK_ALIGNMENT !== 'number' ||
    typeof candidate.UNPACK_COLORSPACE_CONVERSION_WEBGL !== 'number' ||
    typeof candidate.UNPACK_FLIP_Y_WEBGL !== 'number' ||
    typeof candidate.UNPACK_IMAGE_HEIGHT !== 'number' ||
    typeof candidate.UNPACK_PREMULTIPLY_ALPHA_WEBGL !== 'number' ||
    typeof candidate.UNPACK_ROW_LENGTH !== 'number' ||
    typeof candidate.UNPACK_SKIP_IMAGES !== 'number' ||
    typeof candidate.UNPACK_SKIP_PIXELS !== 'number' ||
    typeof candidate.UNPACK_SKIP_ROWS !== 'number' ||
    typeof candidate.bindBuffer !== 'function' ||
    typeof candidate.getParameter !== 'function'
  ) {
    throw new Error(
      'Zombie Escape staged texture upload requires WebGL2 pixel-unpack state access.',
    )
  }
  return candidate as ZombieEscapeWebGLTextureUploadContext
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
        castShadow: object.castShadow,
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
  const admitted = new Set(cohort.units.flatMap((unit) => unit.renderables))
  for (const unit of units) {
    for (const renderable of unit.renderables) {
      if (!admitted.has(renderable)) {
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
    snapshot.object.castShadow = snapshot.castShadow
    snapshot.object.layers.mask = snapshot.layerMask
    snapshot.object.frustumCulled = snapshot.frustumCulled
  }
}

function snapshotZombieEscapeWebGLPilotDrawRanges(cohort: ZombieEscapeWebGLRealizationCohort) {
  const seen = new Set<object>()
  const snapshots: ZombieEscapeWebGLDrawRangeSnapshot[] = []
  for (const unit of cohort.units) {
    for (const object of unit.renderables) {
      const renderable = object as Object3D & {
        geometry?: Readonly<{
          attributes?: Readonly<Record<string, Readonly<{ count?: number }>>>
          drawRange?: Readonly<{ count?: number; start?: number }>
          index?: Readonly<{ count?: number }> | null
          setDrawRange?: (start: number, count: number) => void
        }>
        isMesh?: boolean
      }
      const geometry = renderable.geometry
      if (!renderable.castShadow || !renderable.isMesh || !geometry || seen.has(geometry)) continue
      if (typeof geometry.setDrawRange !== 'function') continue
      const start = Math.max(0, Math.trunc(geometry.drawRange?.start ?? 0))
      const sourceCount = Math.max(
        0,
        Math.trunc(geometry.index?.count ?? geometry.attributes?.position?.count ?? 0),
      )
      const requestedCount = geometry.drawRange?.count ?? Number.POSITIVE_INFINITY
      const availableCount = Math.max(
        0,
        Math.min(
          sourceCount - start,
          Number.isFinite(requestedCount) ? requestedCount : sourceCount,
        ),
      )
      if (availableCount < 3) continue
      seen.add(geometry)
      snapshots.push({
        count: geometry.drawRange?.count ?? Number.POSITIVE_INFINITY,
        geometry: geometry as ZombieEscapeWebGLDrawRangeSnapshot['geometry'],
        start: geometry.drawRange?.start ?? 0,
      })
    }
  }
  return snapshots
}

function applyZombieEscapeWebGLPilotDrawRanges(
  snapshots: readonly ZombieEscapeWebGLDrawRangeSnapshot[],
) {
  for (const { geometry, start } of snapshots) geometry.setDrawRange(start, 3)
}

function restoreZombieEscapeWebGLDrawRanges(
  snapshots: readonly ZombieEscapeWebGLDrawRangeSnapshot[],
) {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const { count, geometry, start } = snapshots[index]!
    geometry.setDrawRange(start, count)
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

function applyZombieEscapeWebGLRealizationRendererState(
  renderer: ZombieEscapeWebGLRealizationRenderer,
) {
  renderer.setViewport(ZOMBIE_ESCAPE_WEBGL_REALIZATION_VIEWPORT)
  renderer.setScissor(ZOMBIE_ESCAPE_WEBGL_REALIZATION_VIEWPORT)
  renderer.setScissorTest(true)
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
