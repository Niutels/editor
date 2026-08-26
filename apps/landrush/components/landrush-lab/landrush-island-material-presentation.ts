import { cloneMaterial } from '@pascal-app/viewer'
import {
  Group,
  type Material,
  type Mesh,
  NoBlending,
  NormalBlending,
  type Object3D,
  type Plane,
} from 'three'
import { materialOpacity, mul, uniform } from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'
import { readLandrushIslandFloorFadeOpacity } from './landrush-floor-fade-opacity'
import { readLandrushRobotRevealObjectAmount } from './landrush-robot-reveal-support'
import { createLandrushRobotScreenRevealOpacityNode } from './robot-screen-reveal-mask'

export type LandrushIslandRevealMaterialPresentation =
  | { kind: 'clip'; clippingPlanes: Plane[] }
  | { kind: 'soft' }

export type LandrushIslandMaterialReadinessMesh = Readonly<{
  floor: boolean
  mesh: Mesh
  reveal: boolean
}>

type LandrushIslandPresentationNodeMaterial = Material & {
  alphaTestNode?: TSLNode<'float'> | null
  backdropAlphaNode?: unknown | null
  backdropNode?: unknown | null
  opacityNode?: TSLNode<'float'> | null
  transmission?: number
  transmissionNode?: unknown | null
}

type LandrushIslandPresentationSlot = {
  source: Material
}

type LandrushIslandPresentationVariant = {
  clippingPlanes: Plane[] | null
  floor: boolean
  floorTranslucent: boolean
  key: string
  reveal: 'clip' | 'none' | 'soft'
}

type LandrushIslandPresentationState = {
  floor: boolean
  floorTranslucent: boolean
  reveal: LandrushIslandRevealMaterialPresentation | null
}

type LandrushIslandPresentationBinding = {
  ancestors: Object3D[]
  assignedMaterial: Material | Material[]
  assignedMaterials: Material[]
  floorOwnerTokens: Set<LandrushIslandFloorFadeOwnerToken>
  floorReferences: number
  floorTranslucent: boolean
  mesh: Mesh
  originalMaterial: Material | Material[]
  preparedFloorState: LandrushIslandFloorFadePreparationState | null
  presentationArrays: Map<string, Material[]>
  reveal: LandrushIslandRevealMaterialPresentation | null
  slots: LandrushIslandPresentationSlot[]
}

type LandrushIslandAncestorListenerReference = {
  listener: (event: { child: Object3D }) => void
  referenceCount: number
}

type LandrushIslandFloorFadePreparedAssignment = {
  assignment: Material | Material[] | null
  expectedMaterials: Material[]
  key: string | null
  keys: string[]
  materials: Material[]
}

declare const landrushIslandFloorFadePreparationHandleBrand: unique symbol
declare const landrushIslandFloorFadeOwnerTokenBrand: unique symbol

export type LandrushIslandFloorFadePreparationHandle = {
  readonly [landrushIslandFloorFadePreparationHandleBrand]: true
}

export type LandrushIslandFloorFadeOwnerToken = {
  readonly [landrushIslandFloorFadeOwnerTokenBrand]: true
}

type LandrushIslandFloorFadePreparationState = {
  binding: LandrushIslandPresentationBinding | null
  committedOwnerToken: LandrushIslandFloorFadeOwnerToken | null
  cursor: number
  fractional: LandrushIslandFloorFadePreparedAssignment
  mesh: Mesh
  observedMaterial: Material | Material[]
  observedMaterials: Material[]
  opaque: LandrushIslandFloorFadePreparedAssignment
  reveal: LandrushIslandRevealMaterialPresentation | null
  sourceMaterial: Material | Material[]
  sourceEpochs: number[]
  sources: Material[]
  usesInstalledBinding: boolean
}

export type LandrushIslandFloorFadePreparationAdvance = {
  materialDelta: number
  status: 'complete' | 'pending' | 'stale'
}

export type LandrushIslandFloorFadePreparationCommit = {
  materialDelta: number
  status: 'committed' | 'stale'
}

export class LandrushIslandMaterialPresentationOwner {
  private readonly ancestorListenerReferences = new Map<
    Object3D,
    LandrushIslandAncestorListenerReference
  >()
  private readonly bindings = new Map<Mesh, LandrushIslandPresentationBinding>()
  private readonly cachedVariants = new Map<Material, Map<string, Material>>()
  private readonly clippingPlaneIds = new WeakMap<Plane[], number>()
  private readonly deferredDisposedSources = new WeakSet<Material>()
  private readonly floorFadePreparations = new WeakMap<
    LandrushIslandFloorFadePreparationHandle,
    LandrushIslandFloorFadePreparationState
  >()
  private readonly floorFadeOwnerTokens = new WeakSet<LandrushIslandFloorFadeOwnerToken>()
  private readonly revealMeshes = new Set<Mesh>()
  private readonly sourceBindingCounts = new Map<Material, number>()
  private readonly sourceCacheEpochs = new WeakMap<Material, number>()
  private readonly sourceDisposeListeners = new Map<Material, () => void>()
  private nextClippingPlaneId = 1
  private ownedVariantCount = 0
  private readonly floorOpacityNode = uniform(1).onObjectUpdate(({ object }) =>
    readLandrushIslandFloorFadeOpacity(object),
  ) as unknown as TSLNode<'float'>
  private readonly revealAmountNode = uniform(0).onObjectUpdate(({ object }) =>
    readLandrushRobotRevealObjectAmount(object?.userData),
  ) as unknown as TSLNode<'float'>

  get floorMaterialCount() {
    let count = 0
    for (const binding of this.bindings.values()) {
      if (hasFloorFadeOwnership(binding)) count += binding.slots.length
    }
    return count
  }

  get activeBindingCount() {
    return this.bindings.size
  }

  get activeAncestorListenerCount() {
    return this.ancestorListenerReferences.size
  }

  get ownedMaterialCount() {
    return this.ownedVariantCount
  }

  createRenderReadinessRepresentative(
    meshes: Iterable<LandrushIslandMaterialReadinessMesh>,
    presentation: LandrushIslandRevealMaterialPresentation,
  ): Group {
    const group = new Group()
    const readinessByMesh = new Map<Mesh, { floor: boolean; reveal: boolean }>()
    for (const { floor, mesh, reveal } of meshes) {
      const readiness = readinessByMesh.get(mesh)
      if (readiness) {
        readiness.floor ||= floor
        readiness.reveal ||= reveal
      } else {
        readinessByMesh.set(mesh, { floor, reveal })
      }
    }

    for (const [mesh, readiness] of readinessByMesh) {
      const states: LandrushIslandPresentationState[] = []
      if (readiness.floor) {
        states.push(
          { floor: true, floorTranslucent: false, reveal: null },
          { floor: true, floorTranslucent: true, reveal: null },
        )
      }
      if (readiness.reveal) {
        states.push({ floor: false, floorTranslucent: false, reveal: presentation })
      }
      if (readiness.floor && readiness.reveal) {
        states.push(
          { floor: true, floorTranslucent: false, reveal: presentation },
          { floor: true, floorTranslucent: true, reveal: presentation },
        )
      }

      const binding = this.bindings.get(mesh)
      const currentBinding = binding && isBindingAssignmentCurrent(binding) ? binding : null
      const sourceMaterial = currentBinding?.originalMaterial ?? mesh.material
      const sources = currentBinding
        ? currentBinding.slots.map((slot) => slot.source)
        : Array.isArray(sourceMaterial)
          ? sourceMaterial
          : [sourceMaterial]
      const emittedAssignments: Material[][] = []

      for (const state of states) {
        const materials = sources.map((source) => {
          const variant = this.resolveVariantState(state, source)
          return variant ? this.resolveVariant(source, variant) : source
        })
        if (sameMaterialAssignment(materials, sources)) continue
        if (
          emittedAssignments.some((assignment) => sameMaterialAssignment(assignment, materials))
        ) {
          continue
        }
        emittedAssignments.push(materials)

        const representative = mesh.clone(false)
        representative.material = Array.isArray(sourceMaterial) ? materials : materials[0]!
        group.add(representative)
      }
    }

    return group
  }

  acquireFloorFade(mesh: Mesh) {
    const binding = this.ensureBinding(mesh)
    binding.floorReferences += 1
    if (binding.floorReferences > 1) return 0
    return this.reconcileBinding(binding)
  }

  createFloorFadeOwnerToken(): LandrushIslandFloorFadeOwnerToken {
    const token = {} as LandrushIslandFloorFadeOwnerToken
    this.floorFadeOwnerTokens.add(token)
    return token
  }

  beginFloorFadePreparation(mesh: Mesh): LandrushIslandFloorFadePreparationHandle {
    const binding = this.bindings.get(mesh) ?? null
    if (binding) this.refreshBindingAncestors(binding)
    const observedMaterial = mesh.material
    const usesInstalledBinding = binding !== null && observedMaterial === binding.assignedMaterial
    const sourceMaterial = usesInstalledBinding ? binding.originalMaterial : observedMaterial
    const sources = readMaterialAssignment(sourceMaterial)
    const createPreparedAssignment = (): LandrushIslandFloorFadePreparedAssignment => ({
      assignment: sources.length === 0 ? sourceMaterial : null,
      expectedMaterials: new Array<Material>(sources.length),
      key: sources.length === 0 ? '' : null,
      keys: new Array<string>(sources.length),
      materials: new Array<Material>(sources.length),
    })

    const handle = {} as LandrushIslandFloorFadePreparationHandle
    this.floorFadePreparations.set(handle, {
      binding,
      committedOwnerToken: null,
      cursor: 0,
      fractional: createPreparedAssignment(),
      mesh,
      observedMaterial,
      observedMaterials: readMaterialAssignment(observedMaterial),
      opaque: createPreparedAssignment(),
      reveal: binding?.reveal ?? null,
      sourceMaterial,
      sourceEpochs: sources.map((source) => this.readSourceCacheEpoch(source)),
      sources,
      usesInstalledBinding,
    })
    return handle
  }

  advanceFloorFadePreparation(
    handle: LandrushIslandFloorFadePreparationHandle,
  ): LandrushIslandFloorFadePreparationAdvance {
    const preparation = this.floorFadePreparations.get(handle)
    if (preparation?.binding && preparation.binding === this.bindings.get(preparation.mesh)) {
      this.refreshBindingAncestors(preparation.binding)
    }
    if (
      !preparation ||
      preparation.committedOwnerToken ||
      !this.isCurrentFloorFadePreparation(preparation)
    ) {
      return { materialDelta: 0, status: 'stale' }
    }

    const slotCount = preparation.sources.length
    const stepCount = slotCount * 2
    if (preparation.cursor >= stepCount) return { materialDelta: 0, status: 'complete' }

    const fractional = preparation.cursor >= slotCount
    const slotIndex = preparation.cursor % slotCount
    const prepared = fractional ? preparation.fractional : preparation.opaque
    const state: LandrushIslandPresentationState = {
      floor: true,
      floorTranslucent: fractional,
      reveal: preparation.reveal,
    }
    const variant = this.resolveVariantState(state, preparation.sources[slotIndex]!)
    const materialCountBefore = this.ownedMaterialCount
    prepared.keys[slotIndex] = variant?.key ?? 'source'
    const material = variant
      ? this.resolveVariant(preparation.sources[slotIndex]!, variant)
      : preparation.sources[slotIndex]!
    prepared.materials[slotIndex] = material
    prepared.expectedMaterials[slotIndex] = material
    preparation.cursor += 1

    if (preparation.cursor === slotCount || preparation.cursor === stepCount) {
      prepared.key = prepared.keys.join('|')
      prepared.assignment = Array.isArray(preparation.sourceMaterial)
        ? prepared.materials
        : prepared.materials[0]!
    }

    return {
      materialDelta: this.ownedMaterialCount - materialCountBefore,
      status: preparation.cursor === stepCount ? 'complete' : 'pending',
    }
  }

  commitFloorFadePreparation(
    handle: LandrushIslandFloorFadePreparationHandle,
    {
      ownerToken,
      translucent,
    }: { ownerToken: LandrushIslandFloorFadeOwnerToken; translucent: boolean },
  ): LandrushIslandFloorFadePreparationCommit {
    const preparation = this.floorFadePreparations.get(handle)
    if (preparation?.binding && preparation.binding === this.bindings.get(preparation.mesh)) {
      this.refreshBindingAncestors(preparation.binding)
    }
    if (!preparation || !this.floorFadeOwnerTokens.has(ownerToken)) {
      return { materialDelta: 0, status: 'stale' }
    }
    if (preparation.committedOwnerToken) {
      const binding = this.bindings.get(preparation.mesh)
      return preparation.committedOwnerToken === ownerToken &&
        binding?.preparedFloorState === preparation &&
        binding.floorOwnerTokens.has(ownerToken) &&
        this.isPreparedFloorStateCurrent(binding, preparation) &&
        isBindingAssignmentCurrent(binding)
        ? { materialDelta: 0, status: 'committed' }
        : { materialDelta: 0, status: 'stale' }
    }
    if (
      preparation.cursor < preparation.sources.length * 2 ||
      !preparation.opaque.assignment ||
      !preparation.fractional.assignment ||
      !isMaterialAssignmentCurrent(
        preparation.opaque.assignment,
        preparation.opaque.expectedMaterials,
      ) ||
      !isMaterialAssignmentCurrent(
        preparation.fractional.assignment,
        preparation.fractional.expectedMaterials,
      ) ||
      !this.isCurrentFloorFadePreparation(preparation)
    ) {
      return { materialDelta: 0, status: 'stale' }
    }

    const existing = preparation.binding
    const canReuseBinding =
      existing !== null &&
      preparation.usesInstalledBinding &&
      existing.originalMaterial === preparation.sourceMaterial &&
      sameMaterialAssignment(
        existing.slots.map((slot) => slot.source),
        preparation.sources,
      )
    let binding = canReuseBinding ? existing : null
    if (!binding) {
      const floorReferences = existing?.floorReferences ?? 0
      const floorOwnerTokens = existing?.floorOwnerTokens ?? new Set()
      const reveal = existing?.reveal ?? null
      const replacement = this.createBindingRecord(
        preparation.mesh,
        preparation.sourceMaterial,
        preparation.sources,
      )
      this.retainBindingSources(replacement)
      if (existing) this.retireBinding(existing, false)
      this.bindings.set(preparation.mesh, replacement)
      binding = replacement
      binding.floorReferences = floorReferences
      binding.floorOwnerTokens = floorOwnerTokens
      binding.reveal = reveal
    }
    this.refreshBindingAncestors(binding)

    binding.floorOwnerTokens.add(ownerToken)
    binding.floorTranslucent = translucent
    if (Array.isArray(binding.originalMaterial)) {
      binding.presentationArrays.set(
        preparation.opaque.key!,
        preparation.opaque.assignment as Material[],
      )
      binding.presentationArrays.set(
        preparation.fractional.key!,
        preparation.fractional.assignment as Material[],
      )
    }
    const assignment = translucent
      ? preparation.fractional.assignment
      : preparation.opaque.assignment
    const expectedMaterials = translucent
      ? preparation.fractional.expectedMaterials
      : preparation.opaque.expectedMaterials
    if (!isMaterialAssignmentCurrent(assignment, expectedMaterials)) {
      return { materialDelta: 0, status: 'stale' }
    }
    assignBindingMaterial(binding, assignment, expectedMaterials)
    binding.preparedFloorState = preparation
    preparation.committedOwnerToken = ownerToken
    return { materialDelta: 0, status: 'committed' }
  }

  applyPreparedFloorFade(mesh: Mesh, translucent: boolean): 'applied' | 'stale' {
    const binding = this.bindings.get(mesh)
    if (binding) this.refreshBindingAncestors(binding)
    if (
      !binding ||
      !hasFloorFadeOwnership(binding) ||
      !isBindingAssignmentCurrent(binding) ||
      !binding.preparedFloorState
    ) {
      return 'stale'
    }
    const preparation = binding.preparedFloorState
    if (!this.isPreparedFloorStateCurrent(binding, preparation)) {
      return 'stale'
    }
    const assignment = translucent
      ? preparation.fractional.assignment
      : preparation.opaque.assignment
    const expectedMaterials = translucent
      ? preparation.fractional.expectedMaterials
      : preparation.opaque.expectedMaterials
    if (!assignment || !isMaterialAssignmentCurrent(assignment, expectedMaterials)) return 'stale'
    assignBindingMaterial(binding, assignment, expectedMaterials)
    binding.floorTranslucent = translucent
    return 'applied'
  }

  updateFloorFade(mesh: Mesh, translucent: boolean) {
    const binding = this.bindings.get(mesh)
    if (!binding) return
    this.refreshBindingAncestors(binding)
    if (!isBindingAssignmentCurrent(binding)) {
      this.replaceBindingSource(binding, translucent)
      return
    }
    if (binding.floorTranslucent === translucent) return
    binding.floorTranslucent = translucent
    if (hasFloorFadeOwnership(binding)) this.reconcileBinding(binding)
  }

  releaseFloorFade(mesh: Mesh) {
    const binding = this.bindings.get(mesh)
    if (!binding || binding.floorReferences <= 0) return
    this.refreshBindingAncestors(binding)
    if (
      !isBindingAssignmentCurrent(binding) &&
      binding.floorReferences === 1 &&
      binding.floorOwnerTokens.size === 0 &&
      binding.reveal === null
    ) {
      this.retireBinding(binding, false)
      return
    }
    const currentBinding = this.ensureBinding(mesh)
    currentBinding.floorReferences -= 1
    if (!hasFloorFadeOwnership(currentBinding)) this.reconcileBinding(currentBinding)
  }

  releasePreparedFloorFade(mesh: Mesh, ownerToken: LandrushIslandFloorFadeOwnerToken) {
    if (!this.floorFadeOwnerTokens.has(ownerToken)) return
    const binding = this.bindings.get(mesh)
    if (!binding?.floorOwnerTokens.has(ownerToken)) return
    this.refreshBindingAncestors(binding)
    binding.floorOwnerTokens.delete(ownerToken)
    if (!hasFloorFadeOwnership(binding) && binding.reveal === null) {
      this.retireBinding(binding, isBindingAssignmentCurrent(binding))
      return
    }
    if (!hasFloorFadeOwnership(binding)) this.reconcileBinding(binding)
  }

  detachMeshBeforeDispose(mesh: Mesh) {
    this.revealMeshes.delete(mesh)
    const binding = this.bindings.get(mesh)
    if (!binding) return
    if (isBindingAssignmentCurrent(binding)) {
      this.retireBinding(binding, true)
      return
    }

    const externalMaterials = new Set(readMaterialAssignment(mesh.material))
    const hiddenSources = new Set([
      ...binding.slots.map((slot) => slot.source),
      ...readMaterialAssignment(binding.originalMaterial),
    ])
    const deferredSources = new Set(
      [...hiddenSources].filter((source) => this.deferredDisposedSources.has(source)),
    )
    this.retireBinding(binding, false)
    for (const source of hiddenSources) {
      if (
        externalMaterials.has(source) ||
        deferredSources.has(source) ||
        (this.sourceBindingCounts.get(source) ?? 0) > 0 ||
        isCachedSourceMaterial(source)
      ) {
        continue
      }
      source.dispose()
    }
  }

  syncRevealMeshes(meshes: Iterable<Mesh>, presentation: LandrushIslandRevealMaterialPresentation) {
    const nextMeshes = new Set(meshes)
    for (const mesh of nextMeshes) {
      const binding = this.ensureBinding(mesh)
      this.revealMeshes.add(mesh)
      if (!sameRevealPresentation(binding.reveal, presentation)) {
        binding.reveal = presentation
        this.reconcileBinding(binding)
      }
    }
    for (const mesh of [...this.revealMeshes]) {
      if (nextMeshes.has(mesh)) continue
      this.revealMeshes.delete(mesh)
      const binding = this.bindings.get(mesh)
      if (!binding) continue
      const currentBinding = this.ensureBinding(mesh)
      currentBinding.reveal = null
      this.reconcileBinding(currentBinding)
    }

    let activeMaterialCount = 0
    for (const mesh of nextMeshes) {
      const binding = this.bindings.get(mesh)
      if (!binding) continue
      for (const slot of binding.slots) {
        if (presentation.kind === 'soft' && isSoftRevealSource(slot.source)) continue
        activeMaterialCount += 1
      }
    }
    return {
      activeMaterialCount,
      materialCount: activeMaterialCount,
    }
  }

  clearReveal() {
    for (const mesh of [...this.revealMeshes]) {
      const binding = this.bindings.get(mesh)
      if (!binding) continue
      const currentBinding = this.ensureBinding(mesh)
      currentBinding.reveal = null
      this.reconcileBinding(currentBinding)
    }
    this.revealMeshes.clear()
  }

  dispose() {
    this.revealMeshes.clear()
    for (const binding of [...this.bindings.values()]) this.retireBinding(binding, true)
    for (const source of [...this.cachedVariants.keys()]) this.releaseCachedVariants(source)
  }

  private ensureBinding(mesh: Mesh) {
    const existing = this.bindings.get(mesh)
    if (!existing) return this.createBinding(mesh)
    if (isBindingAssignmentCurrent(existing)) {
      this.refreshBindingAncestors(existing)
      return existing
    }

    return this.replaceBindingSource(existing, existing.floorTranslucent)
  }

  private replaceBindingSource(
    existing: LandrushIslandPresentationBinding,
    floorTranslucent: boolean,
  ) {
    const floorReferences = existing.floorReferences
    const floorOwnerTokens = existing.floorOwnerTokens
    const reveal = existing.reveal
    const mesh = existing.mesh
    this.retireBinding(existing, false)
    const replacement = this.createBinding(mesh)
    replacement.floorReferences = floorReferences
    replacement.floorOwnerTokens = floorOwnerTokens
    replacement.floorTranslucent = floorTranslucent
    replacement.reveal = reveal
    this.reconcileBinding(replacement)
    return replacement
  }

  private createBinding(
    mesh: Mesh,
    originalMaterial: Material | Material[] = mesh.material,
    sources: Material[] = readMaterialAssignment(originalMaterial),
  ) {
    const binding = this.createBindingRecord(mesh, originalMaterial, sources)
    this.bindings.set(mesh, binding)
    this.retainBindingSources(binding)
    this.refreshBindingAncestors(binding)
    return binding
  }

  private createBindingRecord(
    mesh: Mesh,
    originalMaterial: Material | Material[],
    sources: Material[],
  ): LandrushIslandPresentationBinding {
    return {
      ancestors: [],
      assignedMaterial: mesh.material,
      assignedMaterials: readMaterialAssignment(mesh.material),
      floorOwnerTokens: new Set(),
      floorReferences: 0,
      floorTranslucent: false,
      mesh,
      originalMaterial,
      preparedFloorState: null,
      presentationArrays: new Map(),
      reveal: null,
      slots: sources.map((source) => ({ source })),
    }
  }

  private refreshBindingAncestors(binding: LandrushIslandPresentationBinding) {
    let ancestor = binding.mesh.parent
    let index = 0
    while (ancestor && ancestor === binding.ancestors[index]) {
      ancestor = ancestor.parent
      index += 1
    }
    if (!ancestor && index === binding.ancestors.length) return

    const nextAncestors: Object3D[] = []
    ancestor = binding.mesh.parent
    while (ancestor) {
      nextAncestors.push(ancestor)
      ancestor = ancestor.parent
    }
    for (const previousAncestor of binding.ancestors) {
      if (!nextAncestors.includes(previousAncestor)) {
        this.releaseAncestorListener(previousAncestor)
      }
    }
    for (const nextAncestor of nextAncestors) {
      if (!binding.ancestors.includes(nextAncestor)) this.retainAncestorListener(nextAncestor)
    }
    binding.ancestors = nextAncestors
  }

  private retainAncestorListener(ancestor: Object3D) {
    const existing = this.ancestorListenerReferences.get(ancestor)
    if (existing) {
      existing.referenceCount += 1
      return
    }
    const listener = ({ child }: { child: Object3D }) => {
      if (child.userData.__fromGeometry !== true) return
      child.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh && this.bindings.has(mesh)) this.detachMeshBeforeDispose(mesh)
      })
    }
    ancestor.addEventListener('childremoved', listener)
    this.ancestorListenerReferences.set(ancestor, { listener, referenceCount: 1 })
  }

  private releaseAncestorListener(ancestor: Object3D) {
    const reference = this.ancestorListenerReferences.get(ancestor)
    if (!reference) return
    reference.referenceCount -= 1
    if (reference.referenceCount > 0) return
    ancestor.removeEventListener('childremoved', reference.listener)
    this.ancestorListenerReferences.delete(ancestor)
  }

  private releaseBindingAncestors(binding: LandrushIslandPresentationBinding) {
    for (const ancestor of binding.ancestors) this.releaseAncestorListener(ancestor)
    binding.ancestors = []
  }

  private isCurrentFloorFadePreparation(preparation: LandrushIslandFloorFadePreparationState) {
    if ((this.bindings.get(preparation.mesh) ?? null) !== preparation.binding) return false
    if (!sameRevealPresentationOrNull(preparation.binding?.reveal ?? null, preparation.reveal)) {
      return false
    }
    if (!this.arePreparationSourceEpochsCurrent(preparation)) return false
    if (!isMaterialAssignmentCurrent(preparation.sourceMaterial, preparation.sources)) return false

    if (!preparation.usesInstalledBinding) {
      return (
        preparation.mesh.material === preparation.observedMaterial &&
        isMaterialAssignmentCurrent(preparation.observedMaterial, preparation.observedMaterials) &&
        preparation.sourceMaterial === preparation.observedMaterial
      )
    }

    const binding = preparation.binding
    if (!binding || preparation.mesh.material !== binding.assignedMaterial) return false
    if (binding.originalMaterial !== preparation.sourceMaterial) return false
    if (preparation.mesh.material === preparation.observedMaterial) {
      return isMaterialAssignmentCurrent(
        preparation.observedMaterial,
        preparation.observedMaterials,
      )
    }
    return isBindingAssignmentCurrent(binding)
  }

  private isPreparedFloorStateCurrent(
    binding: LandrushIslandPresentationBinding,
    preparation: LandrushIslandFloorFadePreparationState,
  ) {
    return (
      preparation.sourceMaterial === binding.originalMaterial &&
      isMaterialAssignmentCurrent(binding.originalMaterial, preparation.sources) &&
      binding.slots.length === preparation.sources.length &&
      binding.slots.every((slot, index) => slot.source === preparation.sources[index]) &&
      sameRevealPresentationOrNull(preparation.reveal, binding.reveal) &&
      this.arePreparationSourceEpochsCurrent(preparation)
    )
  }

  private arePreparationSourceEpochsCurrent(preparation: LandrushIslandFloorFadePreparationState) {
    return preparation.sources.every(
      (source, index) => this.readSourceCacheEpoch(source) === preparation.sourceEpochs[index],
    )
  }

  private readSourceCacheEpoch(source: Material) {
    return this.sourceCacheEpochs.get(source) ?? 0
  }

  private reconcileBinding(binding: LandrushIslandPresentationBinding) {
    if (!hasFloorFadeOwnership(binding) && binding.reveal === null) {
      this.retireBinding(binding, true)
      return 0
    }

    const previousMaterialCount = this.ownedMaterialCount
    const materials: Material[] = []
    const keys: string[] = []
    const state: LandrushIslandPresentationState = {
      floor: hasFloorFadeOwnership(binding),
      floorTranslucent: binding.floorTranslucent,
      reveal: binding.reveal,
    }
    for (const slot of binding.slots) {
      const variant = this.resolveVariantState(state, slot.source)
      keys.push(variant?.key ?? 'source')
      materials.push(variant ? this.resolveVariant(slot.source, variant) : slot.source)
    }

    const nextMaterial = Array.isArray(binding.originalMaterial)
      ? this.resolvePresentationArray(binding, keys.join('|'), materials)
      : materials[0]!
    assignBindingMaterial(binding, nextMaterial, [...materials])
    return this.ownedMaterialCount - previousMaterialCount
  }

  private resolveVariant(source: Material, variant: LandrushIslandPresentationVariant) {
    let variants = this.cachedVariants.get(source)
    if (!variants) {
      variants = new Map()
      this.cachedVariants.set(source, variants)
      const disposeListener = () => {
        if ((this.sourceBindingCounts.get(source) ?? 0) > 0) {
          this.deferredDisposedSources.add(source)
          return
        }
        this.releaseCachedVariants(source)
      }
      this.sourceDisposeListeners.set(source, disposeListener)
      source.addEventListener('dispose', disposeListener)
    }
    const existing = variants.get(variant.key)
    if (existing) return existing

    const material = cloneMaterial(source)
    const nodeMaterial = material as LandrushIslandPresentationNodeMaterial
    const sourceNodeMaterial = source as LandrushIslandPresentationNodeMaterial
    if (sourceNodeMaterial.alphaTestNode !== undefined) {
      nodeMaterial.alphaTestNode = sourceNodeMaterial.alphaTestNode
    }
    let opacityNode = nodeMaterial.opacityNode ?? (materialOpacity as unknown as TSLNode<'float'>)
    if (variant.floor) {
      opacityNode = mul(opacityNode, this.floorOpacityNode) as unknown as TSLNode<'float'>
    }
    if (variant.reveal === 'soft') {
      opacityNode = createLandrushRobotScreenRevealOpacityNode(
        opacityNode,
        this.revealAmountNode,
        1,
      )
    }
    if (variant.floor || variant.reveal === 'soft') nodeMaterial.opacityNode = opacityNode
    if (variant.reveal === 'clip' && variant.clippingPlanes) {
      material.clippingPlanes = variant.clippingPlanes
      material.clipIntersection = true
    }
    const usesDepthWritingSoftReveal = canUseDepthWritingSoftReveal(
      source,
      sourceNodeMaterial,
      variant,
    )
    const usesSortedFractionalPresentation =
      (variant.floor && variant.floorTranslucent) ||
      (variant.reveal === 'soft' && !usesDepthWritingSoftReveal)
    material.transparent = source.transparent
    material.blending = source.blending
    material.alphaHash = source.alphaHash || (usesDepthWritingSoftReveal && !source.alphaToCoverage)
    material.alphaToCoverage = variant.reveal === 'clip' ? true : source.alphaToCoverage
    if (usesSortedFractionalPresentation) {
      material.transparent = true
      if (material.blending === NoBlending) material.blending = NormalBlending
    }
    material.depthWrite = usesSortedFractionalPresentation ? false : source.depthWrite
    material.needsUpdate = true
    variants.set(variant.key, material)
    this.ownedVariantCount += 1
    return material
  }

  private releaseCachedVariants(source: Material) {
    const disposeListener = this.sourceDisposeListeners.get(source)
    if (disposeListener) {
      source.removeEventListener('dispose', disposeListener)
      this.sourceDisposeListeners.delete(source)
    }
    const variants = this.cachedVariants.get(source)
    if (!variants) {
      this.deferredDisposedSources.delete(source)
      return
    }
    this.deferredDisposedSources.delete(source)
    this.cachedVariants.delete(source)
    this.sourceCacheEpochs.set(source, this.readSourceCacheEpoch(source) + 1)
    this.ownedVariantCount -= variants.size
    for (const material of variants.values()) material.dispose()
  }

  private resolveVariantState(
    state: LandrushIslandPresentationState,
    source: Material,
  ): LandrushIslandPresentationVariant | null {
    const floor = state.floor
    const reveal = state.reveal?.kind === 'soft' && isSoftRevealSource(source) ? null : state.reveal
    if (!floor && !reveal) return null

    const floorKey = floor
      ? state.floorTranslucent
        ? 'floor-translucent'
        : 'floor-opaque'
      : 'no-floor'
    if (reveal?.kind === 'clip') {
      const clippingPlaneId = this.resolveClippingPlaneId(reveal.clippingPlanes)
      return {
        clippingPlanes: reveal.clippingPlanes,
        floor,
        floorTranslucent: state.floorTranslucent,
        key: `${floorKey}|reveal-clip:${clippingPlaneId}`,
        reveal: 'clip',
      }
    }
    const revealKind = reveal?.kind === 'soft' ? 'soft' : 'none'
    return {
      clippingPlanes: null,
      floor,
      floorTranslucent: state.floorTranslucent,
      key: `${floorKey}|reveal-${revealKind}`,
      reveal: revealKind,
    }
  }

  private resolveClippingPlaneId(clippingPlanes: Plane[]) {
    const existing = this.clippingPlaneIds.get(clippingPlanes)
    if (existing !== undefined) return existing
    const id = this.nextClippingPlaneId
    this.nextClippingPlaneId += 1
    this.clippingPlaneIds.set(clippingPlanes, id)
    return id
  }

  private resolvePresentationArray(
    binding: LandrushIslandPresentationBinding,
    key: string,
    materials: Material[],
  ) {
    const existing = binding.presentationArrays.get(key)
    if (existing && sameMaterialAssignment(existing, materials)) return existing
    binding.presentationArrays.set(key, materials)
    return materials
  }

  private retainBindingSources(binding: LandrushIslandPresentationBinding) {
    for (const source of new Set(binding.slots.map((slot) => slot.source))) {
      this.sourceBindingCounts.set(source, (this.sourceBindingCounts.get(source) ?? 0) + 1)
    }
  }

  private releaseBindingSources(binding: LandrushIslandPresentationBinding) {
    for (const source of new Set(binding.slots.map((slot) => slot.source))) {
      const count = this.sourceBindingCounts.get(source)
      if (!count || count <= 1) {
        this.sourceBindingCounts.delete(source)
        if (this.deferredDisposedSources.has(source)) this.releaseCachedVariants(source)
      } else {
        this.sourceBindingCounts.set(source, count - 1)
      }
    }
  }

  private retireBinding(binding: LandrushIslandPresentationBinding, restore: boolean) {
    if (restore && isBindingAssignmentCurrent(binding)) {
      binding.mesh.material = binding.originalMaterial
    }
    binding.presentationArrays.clear()
    this.bindings.delete(binding.mesh)
    this.releaseBindingAncestors(binding)
    this.releaseBindingSources(binding)
  }
}

function assignBindingMaterial(
  binding: LandrushIslandPresentationBinding,
  assignment: Material | Material[],
  expectedMaterials: Material[],
) {
  binding.mesh.material = assignment
  binding.assignedMaterial = assignment
  binding.assignedMaterials = expectedMaterials
}

function hasFloorFadeOwnership(binding: LandrushIslandPresentationBinding) {
  return binding.floorReferences > 0 || binding.floorOwnerTokens.size > 0
}

function isBindingAssignmentCurrent(binding: LandrushIslandPresentationBinding) {
  return (
    binding.mesh.material === binding.assignedMaterial &&
    isMaterialAssignmentCurrent(binding.assignedMaterial, binding.assignedMaterials)
  )
}

function isCachedSourceMaterial(material: Material) {
  return material.userData?.__pascalCachedMaterial === true
}

function isMaterialAssignmentCurrent(
  assignment: Material | Material[] | null,
  expectedMaterials: Material[],
): assignment is Material | Material[] {
  if (!assignment) return false
  return Array.isArray(assignment)
    ? sameMaterialAssignment(assignment, expectedMaterials)
    : expectedMaterials.length === 1 && assignment === expectedMaterials[0]
}

function readMaterialAssignment(assignment: Material | Material[]) {
  return Array.isArray(assignment) ? [...assignment] : [assignment]
}

function sameMaterialAssignment(first: Material[], second: Material[]) {
  return (
    first.length === second.length && first.every((material, index) => material === second[index])
  )
}

function sameRevealPresentation(
  first: LandrushIslandRevealMaterialPresentation | null,
  second: LandrushIslandRevealMaterialPresentation,
) {
  if (!first || first.kind !== second.kind) return false
  if (first.kind === 'soft') return true
  return second.kind === 'clip' && first.clippingPlanes === second.clippingPlanes
}

function sameRevealPresentationOrNull(
  first: LandrushIslandRevealMaterialPresentation | null,
  second: LandrushIslandRevealMaterialPresentation | null,
) {
  if (!first || !second) return first === second
  return sameRevealPresentation(first, second)
}

function isSoftRevealSource(material: Material) {
  return material.userData?.landrushRobotScreenRevealSoftMask === true
}

function canUseDepthWritingSoftReveal(
  source: Material,
  sourceNodeMaterial: LandrushIslandPresentationNodeMaterial,
  variant: LandrushIslandPresentationVariant,
) {
  return (
    variant.reveal === 'soft' &&
    !(variant.floor && variant.floorTranslucent) &&
    !source.transparent &&
    source.opacity === 1 &&
    source.depthTest &&
    source.depthWrite &&
    source.blending === NormalBlending &&
    (sourceNodeMaterial.transmission ?? 0) <= 0 &&
    sourceNodeMaterial.transmissionNode == null &&
    sourceNodeMaterial.backdropNode == null &&
    sourceNodeMaterial.backdropAlphaNode == null
  )
}
