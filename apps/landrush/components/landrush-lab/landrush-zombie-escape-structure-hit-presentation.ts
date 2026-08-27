import { cloneMaterial } from '@pascal-app/viewer'
import { Color, type Material, Matrix4, type Mesh, type Object3D, Vector3 } from 'three'
import { color, materialColor, vec4 } from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'

export type LandrushZombieEscapeStructureHitPhase = 'black' | 'none' | 'white'

export type LandrushZombieEscapeStructureHitSample = Readonly<{
  amount: number
  objectId: string
}>

export type LandrushZombieEscapeStructureHitPose = Readonly<{
  offsetX: number
  offsetZ: number
  phase: LandrushZombieEscapeStructureHitPhase
}>

type StructureHitMaterial = Material & {
  alphaTestNode?: TSLNode<'float'> | null
  color?: Color
  colorNode?: TSLNode | null
  emissive?: Color
  emissiveIntensity?: number
  emissiveMap?: unknown | null
  emissiveNode?: TSLNode | null
  isNodeMaterial?: boolean
  map?: unknown | null
}

type StructureHitMeshBinding = {
  appliedAssignment: Material | Material[] | null
  appliedMaterials: Material[]
  blackAssignment: Material | Material[]
  blackMaterials: Material[]
  mesh: Mesh
  sourceAssignment: Material | Material[]
  sourceMaterials: Material[]
  whiteAssignment: Material | Material[]
  whiteMaterials: Material[]
}

type StructureHitRootBinding = {
  applied: boolean
  baseMatrix: Matrix4
  basePosition: Vector3
  meshBindings: Map<Mesh, StructureHitMeshBinding>
  root: Object3D
}

type StructureHitMaterialVariants = {
  black: Material
  disposeListener: () => void
  references: number
  sourceDisposed: boolean
  white: Material
}

const STRUCTURE_HIT_BLACK = new Color('#030104')
const STRUCTURE_HIT_WHITE = new Color('#ffffff')
const STRUCTURE_HIT_BLACK_NODE = color('#030104')
const STRUCTURE_HIT_WHITE_NODE = color('#ffffff')
const STRUCTURE_HIT_WHITE_EMISSIVE_NODE = STRUCTURE_HIT_WHITE_NODE.mul(3.6)

export function resolveLandrushZombieEscapeStructureHitPose(
  objectId: string,
  feedbackAmount: number,
): LandrushZombieEscapeStructureHitPose {
  const amount = Number.isFinite(feedbackAmount) ? Math.max(0, Math.min(1, feedbackAmount)) : 0
  if (amount <= 0) return { offsetX: 0, offsetZ: 0, phase: 'none' }

  const elapsedSeconds = (1 - amount) * ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds
  const flashAmount =
    elapsedSeconds < ZOMBIE_ESCAPE_SIMULATION.zombieHitFlashSeconds
      ? 1 - elapsedSeconds / ZOMBIE_ESCAPE_SIMULATION.zombieHitFlashSeconds
      : 0
  const zombiePhase = resolveZombieEscapeHitFlickerPhase(flashAmount)
  const phase = zombiePhase === 'red' ? 'white' : zombiePhase
  const seedPhase = hashStructureHitPhase(objectId)
  const envelope = amount * amount

  return {
    offsetX: Math.sin(elapsedSeconds * Math.PI * 24 + seedPhase) * 0.018 * envelope,
    offsetZ: Math.sin(elapsedSeconds * Math.PI * 34 + seedPhase * 1.37) * 0.012 * envelope,
    phase,
  }
}

export class LandrushZombieEscapeStructureHitPresentation {
  private readonly materialVariants = new Map<Material, StructureHitMaterialVariants>()
  private readonly rootBindings = new Map<Object3D, StructureHitRootBinding>()
  private ownedMaterialTotal = 0

  get ownedMaterialCount() {
    return this.ownedMaterialTotal
  }

  sync(samples: ReadonlyMap<Object3D, LandrushZombieEscapeStructureHitSample>) {
    this.restore()

    for (const [root, binding] of [...this.rootBindings]) {
      if (samples.has(root)) continue
      this.disposeRootBinding(binding)
    }

    for (const [root, sample] of samples) {
      const pose = resolveLandrushZombieEscapeStructureHitPose(sample.objectId, sample.amount)
      if (sample.amount <= 0 || !Number.isFinite(sample.amount)) {
        const existing = this.rootBindings.get(root)
        if (existing) this.disposeRootBinding(existing)
        continue
      }

      const binding = this.rootBindings.get(root) ?? this.createRootBinding(root)
      if (root.matrixAutoUpdate) {
        binding.basePosition.copy(root.position)
        root.position.x += pose.offsetX
        root.position.z += pose.offsetZ
        root.updateMatrix()
      } else {
        binding.baseMatrix.copy(root.matrix)
        root.matrix.elements[12] += pose.offsetX
        root.matrix.elements[14] += pose.offsetZ
        root.matrixWorldNeedsUpdate = true
      }
      binding.applied = true
      this.syncRootMaterials(binding, pose.phase)
    }
  }

  restore() {
    for (const binding of this.rootBindings.values()) {
      for (const meshBinding of binding.meshBindings.values()) {
        if (
          meshBinding.appliedAssignment &&
          isMaterialAssignmentCurrent(
            meshBinding.mesh.material,
            meshBinding.appliedAssignment,
            meshBinding.appliedMaterials,
          )
        ) {
          meshBinding.mesh.material = meshBinding.sourceAssignment
        }
        meshBinding.appliedAssignment = null
        meshBinding.appliedMaterials = []
      }
      if (!binding.applied) continue
      if (binding.root.matrixAutoUpdate) {
        binding.root.position.copy(binding.basePosition)
        binding.root.updateMatrix()
      } else {
        binding.root.matrix.copy(binding.baseMatrix)
        binding.root.matrixWorldNeedsUpdate = true
      }
      binding.root.updateMatrixWorld(true)
      binding.applied = false
    }
  }

  dispose() {
    this.restore()
    for (const binding of [...this.rootBindings.values()]) this.disposeRootBinding(binding)
    for (const [source, variants] of [...this.materialVariants]) {
      this.disposeMaterialVariants(source, variants)
    }
  }

  private createRootBinding(root: Object3D) {
    const binding: StructureHitRootBinding = {
      applied: false,
      baseMatrix: new Matrix4(),
      basePosition: new Vector3(),
      meshBindings: new Map(),
      root,
    }
    this.rootBindings.set(root, binding)
    return binding
  }

  private syncRootMaterials(
    rootBinding: StructureHitRootBinding,
    phase: LandrushZombieEscapeStructureHitPhase,
  ) {
    const liveMeshes = new Set<Mesh>()
    rootBinding.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      liveMeshes.add(mesh)
      let meshBinding = rootBinding.meshBindings.get(mesh)
      if (meshBinding && !isSourceAssignmentCurrent(meshBinding, mesh.material)) {
        this.disposeMeshBinding(rootBinding, meshBinding)
        meshBinding = undefined
      }
      if (phase === 'none') return
      meshBinding ??= this.createMeshBinding(rootBinding, mesh)
      const assignment =
        phase === 'white' ? meshBinding.whiteAssignment : meshBinding.blackAssignment
      const materials = phase === 'white' ? meshBinding.whiteMaterials : meshBinding.blackMaterials
      mesh.material = assignment
      meshBinding.appliedAssignment = assignment
      meshBinding.appliedMaterials = materials
    })

    for (const meshBinding of [...rootBinding.meshBindings.values()]) {
      if (!liveMeshes.has(meshBinding.mesh)) this.disposeMeshBinding(rootBinding, meshBinding)
    }
  }

  private createMeshBinding(rootBinding: StructureHitRootBinding, mesh: Mesh) {
    const sourceAssignment = mesh.material
    const sourceMaterials = readMaterialAssignment(sourceAssignment)
    const variants = sourceMaterials.map((source) => this.retainMaterialVariants(source))
    const blackMaterials = variants.map((entry) => entry.black)
    const whiteMaterials = variants.map((entry) => entry.white)
    const binding: StructureHitMeshBinding = {
      appliedAssignment: null,
      appliedMaterials: [],
      blackAssignment: Array.isArray(sourceAssignment) ? blackMaterials : blackMaterials[0]!,
      blackMaterials,
      mesh,
      sourceAssignment,
      sourceMaterials,
      whiteAssignment: Array.isArray(sourceAssignment) ? whiteMaterials : whiteMaterials[0]!,
      whiteMaterials,
    }
    rootBinding.meshBindings.set(mesh, binding)
    return binding
  }

  private disposeMeshBinding(
    rootBinding: StructureHitRootBinding,
    binding: StructureHitMeshBinding,
  ) {
    if (
      binding.appliedAssignment &&
      isMaterialAssignmentCurrent(
        binding.mesh.material,
        binding.appliedAssignment,
        binding.appliedMaterials,
      )
    ) {
      binding.mesh.material = binding.sourceAssignment
    }
    rootBinding.meshBindings.delete(binding.mesh)
    for (const source of binding.sourceMaterials) this.releaseMaterialVariants(source)
  }

  private disposeRootBinding(binding: StructureHitRootBinding) {
    for (const meshBinding of [...binding.meshBindings.values()]) {
      this.disposeMeshBinding(binding, meshBinding)
    }
    this.rootBindings.delete(binding.root)
  }

  private retainMaterialVariants(source: Material) {
    const existing = this.materialVariants.get(source)
    if (existing) {
      existing.references += 1
      return existing
    }
    const variants: StructureHitMaterialVariants = {
      black: createStructureHitMaterial(source, 'black'),
      disposeListener: () => {},
      references: 1,
      sourceDisposed: false,
      white: createStructureHitMaterial(source, 'white'),
    }
    variants.disposeListener = () => {
      variants.sourceDisposed = true
      if (variants.references <= 0) this.disposeMaterialVariants(source, variants)
    }
    source.addEventListener('dispose', variants.disposeListener)
    this.materialVariants.set(source, variants)
    this.ownedMaterialTotal += 2
    return variants
  }

  private releaseMaterialVariants(source: Material) {
    const variants = this.materialVariants.get(source)
    if (!variants) return
    variants.references -= 1
    if (variants.references > 0 || !variants.sourceDisposed) return
    this.disposeMaterialVariants(source, variants)
  }

  private disposeMaterialVariants(source: Material, variants: StructureHitMaterialVariants) {
    if (this.materialVariants.get(source) !== variants) return
    this.materialVariants.delete(source)
    source.removeEventListener('dispose', variants.disposeListener)
    this.ownedMaterialTotal -= 2
    variants.black.dispose()
    variants.white.dispose()
  }
}

function createStructureHitMaterial(
  source: Material,
  phase: Exclude<LandrushZombieEscapeStructureHitPhase, 'none'>,
) {
  const material = cloneMaterial(source) as StructureHitMaterial
  const sourceHitMaterial = source as StructureHitMaterial
  material.alphaHash = source.alphaHash
  material.alphaTest = source.alphaTest
  material.alphaToCoverage = source.alphaToCoverage
  if (sourceHitMaterial.alphaTestNode !== undefined) {
    material.alphaTestNode = sourceHitMaterial.alphaTestNode
  }
  const hitColor = phase === 'white' ? STRUCTURE_HIT_WHITE : STRUCTURE_HIT_BLACK
  if (material.color?.isColor) material.color.copy(hitColor)
  if (material.emissive?.isColor) material.emissive.copy(hitColor)
  if (material.emissiveIntensity !== undefined) {
    material.emissiveIntensity = phase === 'white' ? 3.6 : 0
  }
  if (material.emissiveMap !== undefined) material.emissiveMap = null
  if (material.isNodeMaterial) {
    const authoredColorNode = material.colorNode
    const sourceColorNode = vec4(
      (authoredColorNode ?? materialColor) as never,
    ) as unknown as TSLNode<'vec4'>
    material.colorNode = vec4(
      phase === 'white' ? STRUCTURE_HIT_WHITE_NODE : STRUCTURE_HIT_BLACK_NODE,
      sourceColorNode.a,
    ) as unknown as TSLNode
    if (material.emissiveNode !== undefined) {
      material.emissiveNode = (phase === 'white'
        ? STRUCTURE_HIT_WHITE_EMISSIVE_NODE
        : STRUCTURE_HIT_BLACK_NODE) as unknown as TSLNode
    }
  }
  material.needsUpdate = true
  return material
}

function hashStructureHitPhase(objectId: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < objectId.length; index += 1) {
    hash ^= objectId.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return ((hash >>> 0) / 4_294_967_296) * Math.PI * 2
}

function isSourceAssignmentCurrent(
  binding: StructureHitMeshBinding,
  assignment: Material | Material[],
) {
  return isMaterialAssignmentCurrent(assignment, binding.sourceAssignment, binding.sourceMaterials)
}

function isMaterialAssignmentCurrent(
  current: Material | Material[],
  expectedAssignment: Material | Material[],
  expectedMaterials: Material[],
) {
  if (current !== expectedAssignment) return false
  return Array.isArray(current)
    ? sameMaterialAssignment(current, expectedMaterials)
    : expectedMaterials.length === 1 && current === expectedMaterials[0]
}

function readMaterialAssignment(assignment: Material | Material[]) {
  return Array.isArray(assignment) ? [...assignment] : [assignment]
}

function sameMaterialAssignment(first: Material[], second: Material[]) {
  return (
    first.length === second.length && first.every((material, index) => material === second[index])
  )
}
