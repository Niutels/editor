import { clamp01 } from '@landrush/runtime'
import type { AnyNode } from '@pascal-app/core'
import {
  readWallCutoutMaterialAssignment,
  releaseWallCutoutMaterialPresentation,
  retainWallCutoutMaterialPresentation,
} from '@pascal-app/viewer'
import type { Material, Mesh, Object3D } from 'three'
import { LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY } from './landrush-floor-fade-opacity'
import type {
  LandrushIslandFloorFadeOwnerToken,
  LandrushIslandFloorFadePreparationHandle,
  LandrushIslandMaterialPresentationOwner,
} from './landrush-island-material-presentation'

export const LANDRUSH_ISLAND_FLOOR_FADE_EPSILON = 0.002
export const LANDRUSH_ISLAND_FLOOR_FADE_RESPONSE = 12

const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_MATERIALS_PER_FRAME = 1
const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_OBJECTS_PER_FRAME = 192
const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_STEPS_PER_FRAME = 384
const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_TIME_BUDGET_MS = 1.5

type LandrushIslandFloorFadeMaterialMode = 'fractional' | 'opaque'

type LandrushIslandFloorFadeObjectLease = {
  hadOwnOpacity: boolean
  object: Object3D
  opacity: unknown
  references: number
  visible: boolean
}

type LandrushIslandFloorFadeQuarantine = {
  amount: number
  lease: LandrushIslandFloorFadeObjectLease
  object: Object3D
  phase: 'fading' | 'waiting'
  revision: number
  rootState: LandrushIslandFloorFadeRootState
  targetOpacity: number
  token: number
}

type LandrushIslandFloorFadeScanItem = {
  childCursor: number
  entered: boolean
  generatedRoot: Object3D | null
  object: Object3D
}

type LandrushIslandFloorFadeMeshStage = {
  generatedRoot: Object3D | null
  handle: LandrushIslandFloorFadePreparationHandle
  mesh: Mesh
  prepared: boolean
  removed: boolean
  sourceAssignment: Material | Material[] | undefined
}

type LandrushIslandFloorFadeGeneration = {
  commitCursor: number
  generatedMeshes: Map<Object3D, Set<Mesh>>
  id: number
  nextMeshes: Set<Mesh>
  nextObservedParents: Set<Object3D>
  observedParentIterator: IterableIterator<Object3D> | null
  prepareCursor: number
  quarantineIterator: IterableIterator<LandrushIslandFloorFadeQuarantine> | null
  reconcileIterator: IterableIterator<Mesh> | null
  removedGeneratedRoots: Set<Object3D>
  revision: number
  stack: LandrushIslandFloorFadeScanItem[]
  stages: LandrushIslandFloorFadeMeshStage[]
  stagesByMesh: Map<Mesh, LandrushIslandFloorFadeMeshStage>
}

type LandrushIslandFloorFadeRootState = {
  committedAssignments: Map<Mesh, Material | Material[]>
  committedGeneratedMeshes: Map<Object3D, Set<Mesh>>
  committedMeshes: Set<Mesh>
  committedRevision: number
  committedSourceAssignments: Map<Mesh, Material | Material[]>
  disposed: boolean
  excludedRoots: Set<Object3D>
  forceVisible: boolean
  generation: LandrushIslandFloorFadeGeneration | null
  hasCommittedPresentation: boolean
  hasStructuralToken: boolean
  latestStructuralToken: unknown
  lease: LandrushIslandFloorFadeObjectLease
  materialOwnerToken: LandrushIslandFloorFadeOwnerToken
  materialMode: LandrushIslandFloorFadeMaterialMode | null
  observedParents: Set<Object3D>
  onChildAdded: (event: LandrushIslandFloorFadeChildEvent) => void
  onChildRemoved: (event: LandrushIslandFloorFadeChildEvent) => void
  presentationEffectiveOpacity: number
  presentationOpacity: number
  pendingSourceAssignments: Map<Mesh, Material | Material[]>
  quarantines: Map<Object3D, LandrushIslandFloorFadeQuarantine>
  queuedGenerationId: number | null
  requestedRevision: number
  root: Object3D
}

type LandrushIslandFloorFadeLevelState = {
  appliedOpacity: number
  canonical: LandrushIslandFloorFadeRootState
  desiredEffectiveOpacity: number
  desiredOpacity: number
  fallback: LandrushIslandFloorFadeRootState | null
  lastSafe: LandrushIslandFloorFadeRootState | null
}

type LandrushIslandFloorFadeQueueEntry = {
  generationId: number
  rootState: LandrushIslandFloorFadeRootState
}

type LandrushIslandFloorFadeArrivalEntry = {
  quarantine: LandrushIslandFloorFadeQuarantine
  token: number
}

type LandrushIslandFloorFadeChildEvent = {
  child: Object3D
}

type LandrushIslandFloorFadeChildEventTarget = {
  addEventListener: (
    type: 'childadded' | 'childremoved',
    listener: (event: LandrushIslandFloorFadeChildEvent) => void,
  ) => void
  removeEventListener: (
    type: 'childadded' | 'childremoved',
    listener: (event: LandrushIslandFloorFadeChildEvent) => void,
  ) => void
}

type LandrushIslandFloorFadePreparationStep = {
  edgesTraversed: number
  materialsPrepared: number
  maxPendingStackDepth: number
  meshesPrepared: number
  objectsVisited: number
  stackItemsAdded: number
}

export type LandrushIslandFloorFadePreparationMetrics = Readonly<{
  arrivalsAdvanced: number
  edgesTraversed: number
  elapsedMs: number
  materialsPrepared: number
  maxPendingStackDepth: number
  meshesPrepared: number
  objectsVisited: number
  preparationSteps: number
  stackItemsAdded: number
}>

export type LandrushIslandFloorFadeLevelReadState = Readonly<{
  appliedOpacity: number
  assignmentMismatchCount: number
  canonicalVisible: boolean
  canonicalRoot: Object3D
  desiredOpacity: number
  fallbackVisible: boolean | null
  materialMode: LandrushIslandFloorFadeMaterialMode | null
  pending: boolean
  presentationOpacity: number
  quarantineCount: number
  ready: boolean
}>

export type LandrushIslandFloorFadePreparationSnapshot<RootId> = Readonly<{
  completeLevelIds: ReadonlySet<RootId>
  pendingLevelIds: ReadonlySet<RootId>
  retainedLeaseCount: number
}>

export class LandrushIslandFloorFadePresentationOwner<
  RootId extends AnyNode['id'] = AnyNode['id'],
> {
  private arrivalHead = 0
  private readonly arrivalQueue: LandrushIslandFloorFadeArrivalEntry[] = []
  private disposed = false
  private frameRequestScheduled = false
  private generationId = 0
  private readonly leases = new Set<LandrushIslandFloorFadeObjectLease>()
  private readonly leasesByObject = new WeakMap<Object3D, LandrushIslandFloorFadeObjectLease>()
  private readonly levels = new Map<RootId, LandrushIslandFloorFadeLevelState>()
  private preparationHead = 0
  private readonly preparationQueue: LandrushIslandFloorFadeQueueEntry[] = []
  private quarantineToken = 0
  private readonly rootStates = new Map<Object3D, LandrushIslandFloorFadeRootState>()
  private readonly suppressedLeases = new Map<Object3D, LandrushIslandFloorFadeObjectLease>()
  private suppressedLeaseIterator: IterableIterator<
    [Object3D, LandrushIslandFloorFadeObjectLease]
  > | null = null

  constructor(
    private readonly materialPresentation: LandrushIslandMaterialPresentationOwner,
    private readonly requestFrame: () => void = noop,
  ) {}

  get hasPendingWork() {
    if (this.disposed) return false
    for (const rootState of this.rootStates.values()) {
      if (rootState.generation) return true
      for (const quarantine of rootState.quarantines.values()) {
        if (quarantine.phase === 'fading') return true
      }
    }
    return false
  }

  get retainedLeaseCount() {
    return this.leases.size
  }

  ensureLevel({
    excludedRoots = [],
    forceVisible = false,
    levelId,
    root,
    structuralToken,
  }: {
    excludedRoots?: Iterable<Object3D>
    forceVisible?: boolean
    levelId: RootId
    root: Object3D
    structuralToken: unknown
  }) {
    if (this.disposed) return
    this.reclaimOneDetachedSuppressedLease()
    const level = this.levels.get(levelId)
    if (!level) {
      const canonical = this.createRootState({
        excludedRoots,
        forceVisible,
        root,
        structuralToken,
      })
      const nextLevel: LandrushIslandFloorFadeLevelState = {
        appliedOpacity: 1,
        canonical,
        desiredEffectiveOpacity: 1,
        desiredOpacity: 1,
        fallback: null,
        lastSafe: null,
      }
      this.levels.set(levelId, nextLevel)
      this.settleReadyHandoffs()
      return
    }

    if (level.canonical.root === root) {
      level.canonical.forceVisible = forceVisible
      this.setExcludedRoots(level.canonical, excludedRoots)
      this.noteStructuralToken(level.canonical, structuralToken)
      this.captureCommittedSourceAssignments(level.canonical)
      this.settleReadyHandoffs()
      return
    }

    const safe = this.selectSafeState(level)
    const requested =
      level.fallback?.root === root
        ? level.fallback
        : this.createRootState({ excludedRoots, forceVisible, root, structuralToken })
    requested.forceVisible = forceVisible
    this.setExcludedRoots(requested, excludedRoots)
    this.noteStructuralToken(requested, structuralToken)

    const previousCanonical = level.canonical
    const previousFallback = level.fallback
    level.canonical = requested
    level.fallback = safe && safe !== requested ? safe : null
    level.lastSafe = safe

    for (const stale of [previousCanonical, previousFallback]) {
      if (!stale || stale === requested || stale === level.fallback) continue
      this.retireRootState(stale, false)
    }

    if (level.fallback) {
      this.hideRoot(level.canonical, level.desiredOpacity, level.desiredEffectiveOpacity)
    }
    this.settleReadyHandoffs()
  }

  applyLevelOpacity({
    levelId,
    opacity,
    effectiveOpacity = opacity,
    root,
  }: {
    effectiveOpacity?: number
    levelId: RootId
    opacity: number
    root: Object3D
  }): { appliedOpacity: number; ready: boolean } {
    this.reclaimOneDetachedSuppressedLease()
    const level = this.levels.get(levelId)
    if (!level || level.canonical.root !== root || this.disposed) {
      return {
        appliedOpacity: level?.appliedOpacity ?? clamp01(opacity),
        ready: level ? this.isCanonicalReady(level) : false,
      }
    }

    level.desiredEffectiveOpacity = clamp01(effectiveOpacity)
    level.desiredOpacity = clamp01(opacity)
    this.settleReadyHandoffs()
    return {
      appliedOpacity: level.appliedOpacity,
      ready: this.isCanonicalReady(level),
    }
  }

  prepareFrame(deltaSeconds = 0): LandrushIslandFloorFadePreparationMetrics {
    const startedAt = performance.now()
    this.reclaimOneDetachedSuppressedLease()
    this.frameRequestScheduled = false
    let arrivalsAdvanced = 0
    let edgesTraversed = 0
    let materialsPrepared = 0
    let maxPendingStackDepth = 0
    let meshesPrepared = 0
    let objectsVisited = 0
    let preparationSteps = 0
    let stackItemsAdded = 0

    const arrivalCount = Math.min(
      this.arrivalQueue.length - this.arrivalHead,
      LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_OBJECTS_PER_FRAME,
    )
    for (let index = 0; index < arrivalCount; index += 1) {
      const entry = this.shiftArrival()
      if (!entry) break
      const quarantine = entry.quarantine
      if (
        quarantine.token !== entry.token ||
        quarantine.phase !== 'fading' ||
        quarantine.rootState.disposed
      ) {
        continue
      }
      arrivalsAdvanced += 1
      this.advanceQuarantine(quarantine, deltaSeconds)
    }

    while (
      this.preparationHead < this.preparationQueue.length &&
      materialsPrepared < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_MATERIALS_PER_FRAME &&
      objectsVisited < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_OBJECTS_PER_FRAME &&
      preparationSteps < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_STEPS_PER_FRAME &&
      performance.now() - startedAt < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_TIME_BUDGET_MS
    ) {
      const entry = this.shiftPreparation()
      if (!entry) break
      preparationSteps += 1
      const rootState = entry.rootState
      const generation = rootState.generation
      if (
        rootState.disposed ||
        !generation ||
        generation.id !== entry.generationId ||
        rootState.queuedGenerationId !== entry.generationId
      ) {
        continue
      }
      rootState.queuedGenerationId = null

      const result = this.advanceGeneration(rootState, generation)
      edgesTraversed += result.edgesTraversed
      materialsPrepared += result.materialsPrepared
      maxPendingStackDepth = Math.max(maxPendingStackDepth, result.maxPendingStackDepth)
      meshesPrepared += result.meshesPrepared
      objectsVisited += result.objectsVisited
      stackItemsAdded += result.stackItemsAdded

      if (rootState.generation === generation) this.enqueueGeneration(rootState)
    }

    this.compactQueues()
    this.settleReadyHandoffs()
    if (this.hasPendingWork) this.signalFrame()
    else this.frameRequestScheduled = false

    return {
      arrivalsAdvanced,
      edgesTraversed,
      elapsedMs: performance.now() - startedAt,
      materialsPrepared,
      maxPendingStackDepth,
      meshesPrepared,
      objectsVisited,
      preparationSteps,
      stackItemsAdded,
    }
  }

  readLevel(levelId: RootId): LandrushIslandFloorFadeLevelReadState | null {
    const level = this.levels.get(levelId)
    if (!level) return null
    let assignmentMismatchCount = 0
    for (const [mesh, assignment] of level.canonical.committedAssignments) {
      if (mesh.material !== assignment) assignmentMismatchCount += 1
    }
    return {
      appliedOpacity: level.appliedOpacity,
      assignmentMismatchCount,
      canonicalVisible: level.canonical.root.visible,
      canonicalRoot: level.canonical.root,
      desiredOpacity: level.desiredOpacity,
      fallbackVisible: level.fallback?.root.visible ?? null,
      materialMode: level.canonical.materialMode,
      pending: level.canonical.generation !== null,
      presentationOpacity: level.canonical.presentationOpacity,
      quarantineCount: level.canonical.quarantines.size,
      ready: this.isCanonicalReady(level),
    }
  }

  readPreparationSnapshot(): LandrushIslandFloorFadePreparationSnapshot<RootId> {
    const completeLevelIds = new Set<RootId>()
    const pendingLevelIds = new Set<RootId>()
    for (const [levelId, level] of this.levels) {
      if (this.isCanonicalReady(level)) completeLevelIds.add(levelId)
      if (level.canonical.generation) pendingLevelIds.add(levelId)
    }
    return {
      completeLevelIds,
      pendingLevelIds,
      retainedLeaseCount: this.leases.size,
    }
  }

  pruneLevels(liveCanonicalRoots: ReadonlyMap<RootId, Object3D>) {
    this.reclaimOneDetachedSuppressedLease()
    for (const [levelId, level] of this.levels) {
      if (liveCanonicalRoots.get(levelId) === level.canonical.root) continue
      this.restoreLevelCanonicalOnly(level)
      this.levels.delete(levelId)
    }
  }

  restoreCanonicalLevels() {
    this.reclaimOneDetachedSuppressedLease()
    for (const level of this.levels.values()) this.restoreLevelCanonicalOnly(level)
    this.levels.clear()
    this.preparationQueue.length = 0
    this.arrivalQueue.length = 0
    this.preparationHead = 0
    this.arrivalHead = 0
    this.frameRequestScheduled = false
  }

  disposeExactAll() {
    if (this.disposed) return
    this.disposed = true
    for (const level of this.levels.values()) {
      if (level.fallback && level.fallback !== level.canonical) {
        this.retireRootState(level.fallback, true)
      }
      this.retireRootState(level.canonical, true)
    }
    for (const rootState of [...this.rootStates.values()]) this.retireRootState(rootState, true)
    for (const lease of [...this.leases]) {
      this.restoreLeaseValue(lease)
      lease.references = 0
      this.leases.delete(lease)
      this.leasesByObject.delete(lease.object)
    }
    this.levels.clear()
    this.rootStates.clear()
    this.preparationQueue.length = 0
    this.arrivalQueue.length = 0
    this.preparationHead = 0
    this.arrivalHead = 0
    this.leases.clear()
    this.suppressedLeases.clear()
    this.suppressedLeaseIterator = null
    this.frameRequestScheduled = false
  }

  private createRootState({
    excludedRoots,
    forceVisible,
    root,
    structuralToken,
  }: {
    excludedRoots: Iterable<Object3D>
    forceVisible: boolean
    root: Object3D
    structuralToken: unknown
  }) {
    const existing = this.rootStates.get(root)
    if (existing && !existing.disposed) return existing

    const rootState = {} as LandrushIslandFloorFadeRootState
    rootState.committedAssignments = new Map()
    rootState.committedGeneratedMeshes = new Map()
    rootState.committedMeshes = new Set()
    rootState.committedRevision = 0
    rootState.committedSourceAssignments = new Map()
    rootState.disposed = false
    rootState.excludedRoots = new Set(
      [...excludedRoots].filter((excludedRoot) => excludedRoot !== root),
    )
    rootState.forceVisible = forceVisible
    rootState.generation = null
    rootState.hasCommittedPresentation = false
    rootState.hasStructuralToken = true
    rootState.latestStructuralToken = structuralToken
    rootState.lease = this.retainRootLease(root)
    rootState.materialOwnerToken = this.materialPresentation.createFloorFadeOwnerToken()
    rootState.materialMode = null
    rootState.observedParents = new Set()
    rootState.pendingSourceAssignments = new Map()
    rootState.presentationEffectiveOpacity = 1
    rootState.presentationOpacity = 1
    rootState.quarantines = new Map()
    rootState.queuedGenerationId = null
    rootState.requestedRevision = 1
    rootState.root = root
    rootState.onChildAdded = (event) => this.handleObservedChildAdded(rootState, event.child)
    rootState.onChildRemoved = (event) => this.handleObservedChildRemoved(rootState, event.child)

    this.observeParent(rootState, root)
    this.rootStates.set(root, rootState)
    this.startGeneration(rootState)
    return rootState
  }

  private setExcludedRoots(
    rootState: LandrushIslandFloorFadeRootState,
    excludedRoots: Iterable<Object3D>,
  ) {
    const nextExcludedRoots = new Set(
      [...excludedRoots].filter((excludedRoot) => excludedRoot !== rootState.root),
    )
    if (sameObjectSet(rootState.excludedRoots, nextExcludedRoots)) return
    rootState.excludedRoots = nextExcludedRoots
    this.requestGeneration(rootState)
  }

  private noteStructuralToken(
    rootState: LandrushIslandFloorFadeRootState,
    structuralToken: unknown,
  ) {
    if (
      rootState.hasStructuralToken &&
      Object.is(rootState.latestStructuralToken, structuralToken)
    ) {
      return
    }
    rootState.hasStructuralToken = true
    rootState.latestStructuralToken = structuralToken
    this.requestGeneration(rootState)
  }

  private requestGeneration(rootState: LandrushIslandFloorFadeRootState) {
    if (rootState.disposed) return
    rootState.requestedRevision += 1
    if (!rootState.generation) this.startGeneration(rootState)
  }

  private startGeneration(rootState: LandrushIslandFloorFadeRootState) {
    if (rootState.disposed || rootState.generation) return
    const generation: LandrushIslandFloorFadeGeneration = {
      commitCursor: 0,
      generatedMeshes: new Map(),
      id: ++this.generationId,
      nextMeshes: new Set(),
      nextObservedParents: new Set(),
      observedParentIterator: null,
      prepareCursor: 0,
      quarantineIterator: null,
      reconcileIterator: null,
      removedGeneratedRoots: new Set(),
      revision: rootState.requestedRevision,
      stack: [
        {
          childCursor: 0,
          entered: false,
          generatedRoot: null,
          object: rootState.root,
        },
      ],
      stages: [],
      stagesByMesh: new Map(),
    }
    rootState.generation = generation
    this.enqueueGeneration(rootState)
  }

  private enqueueGeneration(rootState: LandrushIslandFloorFadeRootState) {
    const generation = rootState.generation
    if (!generation || rootState.queuedGenerationId === generation.id) return
    rootState.queuedGenerationId = generation.id
    this.preparationQueue.push({ generationId: generation.id, rootState })
    this.signalFrame()
  }

  private advanceGeneration(
    rootState: LandrushIslandFloorFadeRootState,
    generation: LandrushIslandFloorFadeGeneration,
  ) {
    if (generation.stack.length > 0) {
      const item = generation.stack.at(-1)
      if (!item) return emptyPreparationStep()
      if (!item.entered) {
        item.entered = true
        if (item.generatedRoot && generation.removedGeneratedRoots.has(item.generatedRoot)) {
          generation.stack.pop()
          return preparationStep({ maxPendingStackDepth: generation.stack.length })
        }

        const object = item.object
        if (object !== rootState.root && rootState.excludedRoots.has(object)) {
          generation.stack.pop()
          return preparationStep({
            maxPendingStackDepth: generation.stack.length,
            objectsVisited: 1,
          })
        }
        if (!item.generatedRoot && object !== rootState.root && isGeneratedGeometryObject(object)) {
          item.generatedRoot = object
        }

        if (isObservedGeometryParent(object, rootState.root)) {
          generation.nextObservedParents.add(object)
          this.observeParent(rootState, object)
        }

        const mesh = object as Mesh
        if (mesh.isMesh && mesh.material && !generation.stagesByMesh.has(mesh)) {
          const sourceOverride =
            rootState.pendingSourceAssignments.get(mesh) ??
            readWallCutoutMaterialAssignment(mesh) ??
            undefined
          rootState.pendingSourceAssignments.delete(mesh)
          const stage: LandrushIslandFloorFadeMeshStage = {
            generatedRoot: item.generatedRoot,
            handle: this.materialPresentation.beginFloorFadePreparation(mesh, sourceOverride),
            mesh,
            prepared: false,
            removed: false,
            sourceAssignment: sourceOverride,
          }
          generation.stages.push(stage)
          generation.stagesByMesh.set(mesh, stage)
          generation.nextMeshes.add(mesh)
          if (item.generatedRoot) {
            let meshes = generation.generatedMeshes.get(item.generatedRoot)
            if (!meshes) {
              meshes = new Set()
              generation.generatedMeshes.set(item.generatedRoot, meshes)
            }
            meshes.add(mesh)
          }
        }
        return preparationStep({
          maxPendingStackDepth: generation.stack.length,
          objectsVisited: 1,
        })
      }

      if (item.childCursor < item.object.children.length) {
        const child = item.object.children[item.childCursor]
        item.childCursor += 1
        if (child) {
          generation.stack.push({
            childCursor: 0,
            entered: false,
            generatedRoot: item.generatedRoot,
            object: child,
          })
          return preparationStep({
            edgesTraversed: 1,
            maxPendingStackDepth: generation.stack.length,
            stackItemsAdded: 1,
          })
        }
        return preparationStep({ edgesTraversed: 1 })
      }

      generation.stack.pop()
      return preparationStep({ maxPendingStackDepth: generation.stack.length })
    }

    if (generation.prepareCursor < generation.stages.length) {
      const stage = generation.stages[generation.prepareCursor]
      if (!stage || stage.removed) {
        generation.prepareCursor += 1
        return emptyPreparationStep()
      }
      const result = this.materialPresentation.advanceFloorFadePreparation(stage.handle)
      if (result.status === 'stale') {
        this.restartStaleGeneration(rootState, generation)
        return preparationStep({
          materialsPrepared: result.materialDelta,
        })
      }
      if (result.status === 'complete') {
        stage.prepared = true
        generation.prepareCursor += 1
      }
      return preparationStep({
        materialsPrepared: result.materialDelta,
      })
    }

    if (generation.commitCursor < generation.stages.length) {
      const stage = generation.stages[generation.commitCursor]
      generation.commitCursor += 1
      if (!stage || stage.removed) return emptyPreparationStep()
      const result = this.materialPresentation.commitFloorFadePreparation(stage.handle, {
        ownerToken: rootState.materialOwnerToken,
        translucent: isFractionalOpacity(rootState.presentationEffectiveOpacity),
      })
      if (result.status === 'stale') {
        this.restartStaleGeneration(rootState, generation)
        return preparationStep({
          materialsPrepared: result.materialDelta,
        })
      }
      if (!rootState.committedMeshes.has(stage.mesh)) {
        retainWallCutoutMaterialPresentation(stage.mesh)
      }
      rootState.committedMeshes.add(stage.mesh)
      rootState.committedAssignments.set(stage.mesh, stage.mesh.material)
      if (stage.sourceAssignment !== undefined) {
        rootState.committedSourceAssignments.set(stage.mesh, stage.sourceAssignment)
      }
      return preparationStep({
        materialsPrepared: result.materialDelta,
        meshesPrepared: 1,
      })
    }

    generation.reconcileIterator ??= rootState.committedMeshes.values()
    const reconciliation = generation.reconcileIterator.next()
    if (!reconciliation.done) {
      const mesh = reconciliation.value
      if (!generation.nextMeshes.has(mesh)) {
        releaseWallCutoutMaterialPresentation(mesh)
        this.materialPresentation.releasePreparedFloorFade(mesh, rootState.materialOwnerToken)
        rootState.committedMeshes.delete(mesh)
        rootState.committedAssignments.delete(mesh)
        rootState.committedSourceAssignments.delete(mesh)
      }
      return emptyPreparationStep()
    }

    generation.observedParentIterator ??= rootState.observedParents.values()
    const observedParent = generation.observedParentIterator.next()
    if (!observedParent.done) {
      if (
        rootState.requestedRevision === generation.revision &&
        !generation.nextObservedParents.has(observedParent.value)
      ) {
        this.unobserveParent(rootState, observedParent.value)
      }
      return emptyPreparationStep()
    }

    generation.quarantineIterator ??= rootState.quarantines.values()
    const quarantineEntry = generation.quarantineIterator.next()
    if (!quarantineEntry.done) {
      const quarantine = quarantineEntry.value
      if (!isDescendantOrSelf(quarantine.object, rootState.root)) {
        this.cancelQuarantine(quarantine)
      } else if (quarantine.phase === 'waiting' && quarantine.revision <= generation.revision) {
        this.startQuarantineFade(quarantine)
      }
      return emptyPreparationStep()
    }

    this.finishGeneration(rootState, generation)
    return emptyPreparationStep()
  }

  private restartStaleGeneration(
    rootState: LandrushIslandFloorFadeRootState,
    generation: LandrushIslandFloorFadeGeneration,
  ) {
    if (rootState.generation !== generation) return
    rootState.generation = null
    rootState.queuedGenerationId = null
    rootState.requestedRevision = Math.max(rootState.requestedRevision, generation.revision + 1)
    this.startGeneration(rootState)
  }

  private finishGeneration(
    rootState: LandrushIslandFloorFadeRootState,
    generation: LandrushIslandFloorFadeGeneration,
  ) {
    if (rootState.generation !== generation) return

    rootState.committedGeneratedMeshes = generation.generatedMeshes
    rootState.committedRevision = generation.revision
    rootState.generation = null
    rootState.queuedGenerationId = null
    rootState.hasCommittedPresentation = true
    rootState.materialMode = isFractionalOpacity(rootState.presentationEffectiveOpacity)
      ? 'fractional'
      : 'opaque'

    if (rootState.requestedRevision > rootState.committedRevision) {
      this.startGeneration(rootState)
    }
  }

  private handleObservedChildAdded(rootState: LandrushIslandFloorFadeRootState, child: Object3D) {
    if (
      rootState.disposed ||
      !isDescendantOrSelf(child, rootState.root) ||
      isWithinRoots(child, rootState.excludedRoots)
    ) {
      return
    }
    const revision = rootState.requestedRevision + 1
    this.quarantineSubtree(rootState, child, revision)
    if (isObservedGeometryParent(child, rootState.root)) this.observeParent(rootState, child)
    this.requestGeneration(rootState)
  }

  private captureCommittedSourceAssignments(rootState: LandrushIslandFloorFadeRootState) {
    let changed = false
    for (const [mesh, assignment] of rootState.committedAssignments) {
      const wallAssignment = readWallCutoutMaterialAssignment(mesh)
      const committedSourceAssignment = rootState.committedSourceAssignments.get(mesh)
      if (
        wallAssignment &&
        !sameFloorFadeMaterialAssignment(wallAssignment, committedSourceAssignment) &&
        !sameFloorFadeMaterialAssignment(
          wallAssignment,
          rootState.pendingSourceAssignments.get(mesh),
        )
      ) {
        rootState.pendingSourceAssignments.set(mesh, wallAssignment)
        changed = true
      }
      const ownedAssignment = this.materialPresentation.readOwnedFloorFadeAssignment(
        mesh,
        rootState.materialOwnerToken,
      )
      // Reveal may have installed another valid combined variant since the floor's last commit.
      if (ownedAssignment) rootState.committedAssignments.set(mesh, ownedAssignment)
      if (mesh.material === (ownedAssignment ?? assignment)) continue
      const sourceAssignment = mesh.material
      if (
        !sameFloorFadeMaterialAssignment(
          sourceAssignment,
          rootState.pendingSourceAssignments.get(mesh),
        )
      ) {
        rootState.pendingSourceAssignments.set(mesh, sourceAssignment)
        changed = true
      }
      if (ownedAssignment) {
        mesh.material = ownedAssignment
      } else {
        // Preserve a real replacement when the old presentation binding no longer owns it.
        rootState.committedAssignments.set(mesh, sourceAssignment)
        this.quarantineSubtree(rootState, mesh, rootState.requestedRevision + 1)
        changed = true
      }
    }
    if (changed) this.requestGeneration(rootState)
  }

  private handleObservedChildRemoved(rootState: LandrushIslandFloorFadeRootState, child: Object3D) {
    if (rootState.disposed) return
    if (!isGeneratedGeometryObject(child)) {
      const quarantine = rootState.quarantines.get(child)
      if (quarantine) this.cancelQuarantine(quarantine)
      this.unobserveParent(rootState, child)
      this.requestGeneration(rootState)
      return
    }
    const generation = rootState.generation
    if (generation) generation.removedGeneratedRoots.add(child)

    const knownMeshes = new Set<Mesh>()
    for (const mesh of rootState.committedGeneratedMeshes.get(child) ?? []) {
      knownMeshes.add(mesh)
    }
    for (const mesh of generation?.generatedMeshes.get(child) ?? []) knownMeshes.add(mesh)

    for (const mesh of knownMeshes) {
      if (rootState.committedMeshes.has(mesh)) {
        releaseWallCutoutMaterialPresentation(mesh)
      }
      this.materialPresentation.detachMeshBeforeDispose(mesh)
      rootState.committedMeshes.delete(mesh)
      rootState.committedAssignments.delete(mesh)
      rootState.committedSourceAssignments.delete(mesh)
      rootState.pendingSourceAssignments.delete(mesh)
      generation?.nextMeshes.delete(mesh)
      const stage = generation?.stagesByMesh.get(mesh)
      if (stage) stage.removed = true
    }
    rootState.committedGeneratedMeshes.delete(child)
    generation?.generatedMeshes.delete(child)

    for (const quarantine of [...rootState.quarantines.values()]) {
      if (quarantine.object !== child && !isDescendantOrSelf(quarantine.object, child)) continue
      this.cancelQuarantine(quarantine)
    }
    this.requestGeneration(rootState)
  }

  private observeParent(rootState: LandrushIslandFloorFadeRootState, parent: Object3D) {
    if (rootState.observedParents.has(parent)) return
    const eventParent = parent as unknown as LandrushIslandFloorFadeChildEventTarget
    eventParent.addEventListener('childadded', rootState.onChildAdded)
    eventParent.addEventListener('childremoved', rootState.onChildRemoved)
    rootState.observedParents.add(parent)
  }

  private unobserveParent(rootState: LandrushIslandFloorFadeRootState, parent: Object3D) {
    if (!rootState.observedParents.delete(parent)) return
    const eventParent = parent as unknown as LandrushIslandFloorFadeChildEventTarget
    eventParent.removeEventListener('childadded', rootState.onChildAdded)
    eventParent.removeEventListener('childremoved', rootState.onChildRemoved)
  }

  private quarantineSubtree(
    rootState: LandrushIslandFloorFadeRootState,
    object: Object3D,
    revision: number,
  ) {
    let ancestor = object.parent
    while (ancestor && ancestor !== rootState.root) {
      const quarantine = rootState.quarantines.get(ancestor)
      if (quarantine) {
        if (quarantine.phase === 'waiting') {
          this.quarantineObject(rootState, ancestor, revision)
          return
        }
      }
      ancestor = ancestor.parent
    }
    this.quarantineObject(rootState, object, revision)
  }

  private quarantineObject(
    rootState: LandrushIslandFloorFadeRootState,
    object: Object3D,
    revision: number,
  ) {
    const existing = rootState.quarantines.get(object)
    if (existing) {
      if (existing.phase === 'fading') existing.token = ++this.quarantineToken
      existing.amount = 0
      existing.phase = 'waiting'
      existing.revision = Math.max(existing.revision, revision)
      object.visible = false
      object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0
      return
    }

    const lease = this.retainLease(object)
    const quarantine: LandrushIslandFloorFadeQuarantine = {
      amount: 0,
      lease,
      object,
      phase: 'waiting',
      revision,
      rootState,
      targetOpacity: readLeasePresentationOpacity(lease),
      token: ++this.quarantineToken,
    }
    rootState.quarantines.set(object, quarantine)
    object.visible = false
    object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0
  }

  private startQuarantineFade(quarantine: LandrushIslandFloorFadeQuarantine) {
    const lease = quarantine.lease
    if (!lease.visible || quarantine.targetOpacity <= LANDRUSH_ISLAND_FLOOR_FADE_EPSILON) {
      this.cancelQuarantine(quarantine)
      return
    }
    quarantine.phase = 'fading'
    quarantine.amount = 0
    quarantine.token = ++this.quarantineToken
    quarantine.object.visible = lease.visible
    quarantine.object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0
    this.arrivalQueue.push({ quarantine, token: quarantine.token })
    this.signalFrame()
  }

  private advanceQuarantine(quarantine: LandrushIslandFloorFadeQuarantine, deltaSeconds: number) {
    const alpha =
      deltaSeconds > 0 ? 1 - Math.exp(-LANDRUSH_ISLAND_FLOOR_FADE_RESPONSE * deltaSeconds) : 0
    quarantine.amount += (quarantine.targetOpacity - quarantine.amount) * alpha
    if (
      Math.abs(quarantine.targetOpacity - quarantine.amount) <= LANDRUSH_ISLAND_FLOOR_FADE_EPSILON
    ) {
      this.cancelQuarantine(quarantine)
      return
    }
    quarantine.object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = quarantine.amount
    this.arrivalQueue.push({ quarantine, token: quarantine.token })
  }

  private cancelQuarantine(quarantine: LandrushIslandFloorFadeQuarantine) {
    quarantine.token = ++this.quarantineToken
    quarantine.rootState.quarantines.delete(quarantine.object)
    this.releaseLeaseExact(quarantine.lease)
  }

  private settleReadyHandoffs() {
    if (this.disposed || this.levels.size === 0) return
    const passLimit = this.levels.size + 1
    for (let pass = 0; pass < passLimit; pass += 1) {
      let changed = false
      for (const level of this.levels.values()) {
        changed = this.settleLevel(level) || changed
      }
      if (!changed) return
    }
  }

  private settleLevel(level: LandrushIslandFloorFadeLevelState) {
    const previousAppliedOpacity = level.appliedOpacity
    const previousFallback = level.fallback
    const previousCanonicalVisible = level.canonical.root.visible
    const previousFallbackVisible = level.fallback?.root.visible

    const opacity = level.desiredOpacity
    const effectiveOpacity = level.desiredEffectiveOpacity
    if (opacity <= LANDRUSH_ISLAND_FLOOR_FADE_EPSILON) {
      this.hideRoot(level.canonical, 0, effectiveOpacity)
      if (level.fallback) this.hideRoot(level.fallback, 0, effectiveOpacity)
      level.appliedOpacity = 0
      return didLevelPresentationChange(
        level,
        previousAppliedOpacity,
        previousFallback,
        previousCanonicalVisible,
        previousFallbackVisible,
      )
    }

    const canonicalPresent = this.isRootDestinationPresent(level.canonical)
    const canonicalReady =
      this.isCanonicalReady(level) ||
      (level.lastSafe === level.canonical && level.canonical.hasCommittedPresentation)
    const opacityIsOpaque = opacity >= 1 - LANDRUSH_ISLAND_FLOOR_FADE_EPSILON
    const effectiveOpacityIsOpaque = effectiveOpacity >= 1 - LANDRUSH_ISLAND_FLOOR_FADE_EPSILON

    if (canonicalPresent && ((opacityIsOpaque && effectiveOpacityIsOpaque) || canonicalReady)) {
      this.presentCanonical(
        level,
        opacityIsOpaque ? 1 : opacity,
        effectiveOpacityIsOpaque ? 1 : effectiveOpacity,
      )
      return didLevelPresentationChange(
        level,
        previousAppliedOpacity,
        previousFallback,
        previousCanonicalVisible,
        previousFallbackVisible,
      )
    }

    const fallback = level.fallback
    if (fallback && this.isRootDestinationPresent(fallback)) {
      if ((opacityIsOpaque && effectiveOpacityIsOpaque) || fallback.hasCommittedPresentation) {
        this.hideRoot(level.canonical, opacity, effectiveOpacity)
        this.showRoot(
          fallback,
          opacityIsOpaque ? 1 : opacity,
          effectiveOpacityIsOpaque ? 1 : effectiveOpacity,
        )
        level.lastSafe = fallback
        level.appliedOpacity = opacityIsOpaque ? 1 : opacity
        return didLevelPresentationChange(
          level,
          previousAppliedOpacity,
          previousFallback,
          previousCanonicalVisible,
          previousFallbackVisible,
        )
      }
      if (fallback.presentationOpacity >= 1 - LANDRUSH_ISLAND_FLOOR_FADE_EPSILON) {
        this.hideRoot(level.canonical, opacity, effectiveOpacity)
        this.showRoot(fallback, 1, effectiveOpacityIsOpaque ? 1 : effectiveOpacity)
        level.lastSafe = fallback
        level.appliedOpacity = 1
        return didLevelPresentationChange(
          level,
          previousAppliedOpacity,
          previousFallback,
          previousCanonicalVisible,
          previousFallbackVisible,
        )
      }
    }

    if (canonicalPresent) {
      this.showRoot(level.canonical, 1, 1)
      if (level.fallback) {
        this.hideRoot(level.fallback, opacity, effectiveOpacity)
        this.retireRootState(level.fallback, false)
        level.fallback = null
      }
      level.lastSafe = level.canonical
      level.appliedOpacity = 1
    } else {
      this.hideRoot(level.canonical, opacity, effectiveOpacity)
      if (fallback) this.hideRoot(fallback, opacity, effectiveOpacity)
      level.appliedOpacity = 0
    }

    return didLevelPresentationChange(
      level,
      previousAppliedOpacity,
      previousFallback,
      previousCanonicalVisible,
      previousFallbackVisible,
    )
  }

  private presentCanonical(
    level: LandrushIslandFloorFadeLevelState,
    opacity: number,
    effectiveOpacity: number,
  ) {
    this.showRoot(level.canonical, opacity, effectiveOpacity)
    if (level.fallback && level.fallback !== level.canonical) {
      this.hideRoot(level.fallback, opacity, effectiveOpacity)
      this.retireRootState(level.fallback, false)
    }
    level.fallback = null
    level.lastSafe = level.canonical
    level.appliedOpacity = opacity
  }

  private showRoot(
    rootState: LandrushIslandFloorFadeRootState,
    opacity: number,
    effectiveOpacity: number,
  ) {
    const clampedOpacity = clamp01(opacity)
    rootState.presentationEffectiveOpacity = clamp01(effectiveOpacity)
    rootState.presentationOpacity = clampedOpacity
    rootState.root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = clampedOpacity

    if (rootState.hasCommittedPresentation && clampedOpacity > LANDRUSH_ISLAND_FLOOR_FADE_EPSILON) {
      this.applyPreparedMode(rootState, isFractionalOpacity(rootState.presentationEffectiveOpacity))
    }
    rootState.root.visible =
      this.isRootDestinationPresent(rootState) &&
      clampedOpacity > LANDRUSH_ISLAND_FLOOR_FADE_EPSILON
  }

  private hideRoot(
    rootState: LandrushIslandFloorFadeRootState,
    opacity: number,
    effectiveOpacity = opacity,
  ) {
    rootState.presentationEffectiveOpacity = clamp01(effectiveOpacity)
    rootState.presentationOpacity = clamp01(opacity)
    rootState.root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] =
      rootState.presentationOpacity
    rootState.root.visible = false
  }

  private applyPreparedMode(rootState: LandrushIslandFloorFadeRootState, translucent: boolean) {
    const mode: LandrushIslandFloorFadeMaterialMode = translucent ? 'fractional' : 'opaque'
    if (rootState.materialMode === mode) return

    let complete = true
    let needsPreparation = false
    for (const mesh of rootState.committedMeshes) {
      const status = this.materialPresentation.applyPreparedFloorFade(mesh, translucent)
      if (status !== 'stale') {
        rootState.committedAssignments.set(mesh, mesh.material)
        needsPreparation ||= status === 'pending'
        continue
      }
      complete = false
      needsPreparation = true
      this.quarantineSubtree(rootState, mesh, rootState.requestedRevision + 1)
    }
    if (needsPreparation && (!complete || !rootState.generation)) {
      this.requestGeneration(rootState)
    }
    if (complete) rootState.materialMode = mode
  }

  private selectSafeState(level: LandrushIslandFloorFadeLevelState) {
    if (this.isRootDrawing(level.canonical)) return level.canonical
    if (level.fallback && this.isRootDrawing(level.fallback)) return level.fallback
    return level.lastSafe && !level.lastSafe.disposed ? level.lastSafe : null
  }

  private isRootDrawing(rootState: LandrushIslandFloorFadeRootState) {
    return (
      rootState.root.visible &&
      rootState.presentationOpacity > LANDRUSH_ISLAND_FLOOR_FADE_EPSILON &&
      this.isRootDestinationPresent(rootState)
    )
  }

  private isRootDestinationPresent(rootState: LandrushIslandFloorFadeRootState) {
    const lease = rootState.lease
    return (
      (rootState.forceVisible || lease.visible) && hasVisibleAncestorPathToScene(rootState.root)
    )
  }

  private isCanonicalReady(level: LandrushIslandFloorFadeLevelState) {
    const canonical = level.canonical
    return (
      canonical.hasCommittedPresentation &&
      canonical.generation === null &&
      canonical.committedRevision === canonical.requestedRevision
    )
  }

  private restoreLevelCanonicalOnly(level: LandrushIslandFloorFadeLevelState) {
    if (level.fallback && level.fallback !== level.canonical) {
      this.retireRootState(level.fallback, false)
    }
    this.retireRootState(level.canonical, true)
  }

  private retireRootState(rootState: LandrushIslandFloorFadeRootState, restoreExact: boolean) {
    if (rootState.disposed) return
    rootState.disposed = true
    rootState.generation = null
    rootState.queuedGenerationId = null
    for (const parent of [...rootState.observedParents]) this.unobserveParent(rootState, parent)

    for (const quarantine of [...rootState.quarantines.values()]) {
      this.cancelQuarantine(quarantine)
    }
    for (const mesh of rootState.committedMeshes) {
      releaseWallCutoutMaterialPresentation(mesh)
      this.materialPresentation.releasePreparedFloorFade(mesh, rootState.materialOwnerToken)
    }
    rootState.committedMeshes.clear()
    rootState.committedAssignments.clear()
    rootState.committedGeneratedMeshes.clear()
    rootState.root.visible = false
    if (restoreExact) this.releaseLeaseExact(rootState.lease)
    else this.suppressRootLease(rootState.lease)
    if (this.rootStates.get(rootState.root) === rootState) {
      this.rootStates.delete(rootState.root)
    }
  }

  private retainLease(object: Object3D) {
    const existing = this.leasesByObject.get(object)
    if (existing) {
      existing.references += 1
      this.leases.add(existing)
      return existing
    }
    const lease: LandrushIslandFloorFadeObjectLease = {
      hadOwnOpacity: Object.hasOwn(
        object.userData,
        LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY,
      ),
      object,
      opacity: object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
      references: 1,
      visible: object.visible,
    }
    this.leasesByObject.set(object, lease)
    this.leases.add(lease)
    return lease
  }

  private retainRootLease(object: Object3D) {
    const suppressed = this.suppressedLeases.get(object)
    if (!suppressed) return this.retainLease(object)
    this.suppressedLeases.delete(object)
    return suppressed
  }

  private suppressRootLease(lease: LandrushIslandFloorFadeObjectLease) {
    if (!isConnectedToScene(lease.object)) {
      this.releaseLeaseExact(lease)
      return
    }
    this.suppressedLeases.set(lease.object, lease)
  }

  private reclaimOneDetachedSuppressedLease() {
    if (this.suppressedLeases.size === 0) {
      this.suppressedLeaseIterator = null
      return
    }
    this.suppressedLeaseIterator ??= this.suppressedLeases.entries()
    let entry = this.suppressedLeaseIterator.next()
    if (entry.done) {
      this.suppressedLeaseIterator = this.suppressedLeases.entries()
      entry = this.suppressedLeaseIterator.next()
    }
    if (entry.done) return
    const [object, lease] = entry.value
    if (isConnectedToScene(object)) return
    this.suppressedLeases.delete(object)
    this.releaseLeaseExact(lease)
  }

  private releaseLeaseExact(lease: LandrushIslandFloorFadeObjectLease) {
    lease.references = Math.max(0, lease.references - 1)
    if (lease.references > 0) return
    this.restoreLeaseValue(lease)
    this.leases.delete(lease)
    this.leasesByObject.delete(lease.object)
  }

  private restoreLeaseValue(lease: LandrushIslandFloorFadeObjectLease) {
    lease.object.visible = lease.visible
    if (lease.hadOwnOpacity) {
      lease.object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = lease.opacity
    } else {
      delete lease.object.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]
    }
  }

  private signalFrame() {
    if (this.frameRequestScheduled || this.disposed) return
    this.frameRequestScheduled = true
    this.requestFrame()
  }

  private shiftPreparation() {
    const entry = this.preparationQueue[this.preparationHead]
    if (!entry) return null
    this.preparationHead += 1
    return entry
  }

  private shiftArrival() {
    const entry = this.arrivalQueue[this.arrivalHead]
    if (!entry) return null
    this.arrivalHead += 1
    return entry
  }

  private compactQueues(force = false) {
    if (
      force ||
      (this.preparationHead > 1024 && this.preparationHead * 2 >= this.preparationQueue.length)
    ) {
      this.preparationQueue.splice(0, this.preparationHead)
      this.preparationHead = 0
    }
    if (force || (this.arrivalHead > 1024 && this.arrivalHead * 2 >= this.arrivalQueue.length)) {
      this.arrivalQueue.splice(0, this.arrivalHead)
      this.arrivalHead = 0
    }
  }
}

function didLevelPresentationChange(
  level: LandrushIslandFloorFadeLevelState,
  previousAppliedOpacity: number,
  previousFallback: LandrushIslandFloorFadeRootState | null,
  previousCanonicalVisible: boolean,
  previousFallbackVisible: boolean | undefined,
) {
  return (
    level.appliedOpacity !== previousAppliedOpacity ||
    level.fallback !== previousFallback ||
    level.canonical.root.visible !== previousCanonicalVisible ||
    level.fallback?.root.visible !== previousFallbackVisible
  )
}

function emptyPreparationStep() {
  return preparationStep()
}

function preparationStep(
  overrides: Partial<LandrushIslandFloorFadePreparationStep> = {},
): LandrushIslandFloorFadePreparationStep {
  return {
    edgesTraversed: 0,
    materialsPrepared: 0,
    maxPendingStackDepth: 0,
    meshesPrepared: 0,
    objectsVisited: 0,
    stackItemsAdded: 0,
    ...overrides,
  }
}

function hasVisibleAncestorPathToScene(root: Object3D) {
  let current: Object3D | null = root
  while (current) {
    if (current !== root && !current.visible) return false
    if ((current as Object3D & { isScene?: boolean }).isScene === true) return true
    current = current.parent
  }
  return false
}

function isConnectedToScene(root: Object3D) {
  let current: Object3D | null = root
  while (current) {
    if ((current as Object3D & { isScene?: boolean }).isScene === true) return true
    current = current.parent
  }
  return false
}

function isDescendantOrSelf(object: Object3D, root: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (current === root) return true
    current = current.parent
  }
  return false
}

function sameFloorFadeMaterialAssignment(
  first: Material | Material[] | undefined,
  second: Material | Material[] | undefined,
) {
  if (first === second) return true
  return (
    Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((material, index) => material === second[index])
  )
}

function sameObjectSet(first: ReadonlySet<Object3D>, second: ReadonlySet<Object3D>) {
  if (first.size !== second.size) return false
  for (const object of first) {
    if (!second.has(object)) return false
  }
  return true
}

function isWithinRoots(object: Object3D, roots: ReadonlySet<Object3D>) {
  let current: Object3D | null = object
  while (current) {
    if (roots.has(current)) return true
    current = current.parent
  }
  return false
}

function isFractionalOpacity(opacity: number) {
  return (
    opacity > LANDRUSH_ISLAND_FLOOR_FADE_EPSILON && opacity < 1 - LANDRUSH_ISLAND_FLOOR_FADE_EPSILON
  )
}

function isGeneratedGeometryObject(object: Object3D) {
  return object.userData.__fromGeometry === true
}

function isObservedGeometryParent(object: Object3D, root: Object3D) {
  return (
    object === root ||
    ((object as Object3D & { isGroup?: boolean }).isGroup === true &&
      !isGeneratedGeometryObject(object))
  )
}

function readLeasePresentationOpacity(lease: LandrushIslandFloorFadeObjectLease) {
  if (
    !lease.hadOwnOpacity ||
    typeof lease.opacity !== 'number' ||
    !Number.isFinite(lease.opacity)
  ) {
    return 1
  }
  return clamp01(lease.opacity)
}

function noop() {}
