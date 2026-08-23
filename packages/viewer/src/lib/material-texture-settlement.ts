import type { Material, Object3D } from 'three'

export type MaterialTextureAssignmentStatus = 'failed' | 'pending' | 'ready'

type MaterialTextureAssignment = {
  key: string
  retry?: () => void
  status: MaterialTextureAssignmentStatus
}

export type MaterialTextureSettlement = {
  failedAssignments: number
  pendingAssignments: number
  settled: boolean
}

export class MaterialTextureAssignmentRegistry {
  private assignments = new WeakMap<Material, Map<string, MaterialTextureAssignment>>()
  private cloneDisposeListeners = new WeakMap<Material, () => void>()
  private cloneSources = new WeakMap<Material, Material>()
  private clones = new WeakMap<Material, Set<Material>>()
  revision = 0

  begin(material: Material, slot: string, key: string, retry?: () => void) {
    const source = this.getSource(material)
    const assignment = {
      key,
      retry: retry ?? this.assignments.get(source)?.get(slot)?.retry,
      status: 'pending',
    } as const
    this.set(source, slot, assignment)
    for (const clone of this.clones.get(source) ?? []) {
      this.syncTextureSlot(source, clone, slot)
      this.set(clone, slot, assignment)
    }
  }

  clear(material: Material, slot: string) {
    const source = this.getSource(material)
    this.clearOne(source, slot)
    for (const clone of this.clones.get(source) ?? []) {
      this.syncTextureSlot(source, clone, slot)
      this.clearOne(clone, slot)
    }
  }

  getStatus(material: Material, slot: string): MaterialTextureAssignmentStatus | null {
    return this.assignments.get(material)?.get(slot)?.status ?? null
  }

  hasFailed(material: Material) {
    const source = this.getSource(material)
    for (const assignment of this.assignments.get(source)?.values() ?? []) {
      if (assignment.status === 'failed') return true
    }
    return false
  }

  isTrackedClone(material: Material) {
    return this.cloneSources.has(material)
  }

  trackClone(sourceMaterial: Material, clone: Material) {
    this.untrackClone(clone)
    const source = this.getSource(sourceMaterial)
    let clones = this.clones.get(source)
    if (!clones) {
      clones = new Set()
      this.clones.set(source, clones)
    }
    clones.add(clone)
    this.cloneSources.set(clone, source)

    for (const [slot, assignment] of this.assignments.get(source) ?? []) {
      this.syncTextureSlot(source, clone, slot)
      this.set(clone, slot, assignment)
    }

    const onDispose = () => this.untrackClone(clone)
    clone.addEventListener('dispose', onDispose)
    this.cloneDisposeListeners.set(clone, onDispose)
  }

  untrackClone(clone: Material) {
    const onDispose = this.cloneDisposeListeners.get(clone)
    if (onDispose) clone.removeEventListener('dispose', onDispose)
    this.cloneDisposeListeners.delete(clone)
    const source = this.cloneSources.get(clone)
    if (!source) return
    this.clones.get(source)?.delete(clone)
    this.cloneSources.delete(clone)
    if (this.assignments.delete(clone)) this.revision += 1
  }

  private clearOne(material: Material, slot: string) {
    const assignments = this.assignments.get(material)
    if (!assignments) return
    if (!assignments.delete(slot)) return
    this.revision += 1
    if (assignments.size === 0) this.assignments.delete(material)
  }

  isCurrent(material: Material, slot: string, key: string) {
    return this.assignments.get(this.getSource(material))?.get(slot)?.key === key
  }

  reset() {
    this.assignments = new WeakMap()
    this.cloneDisposeListeners = new WeakMap()
    this.cloneSources = new WeakMap()
    this.clones = new WeakMap()
    this.revision += 1
  }

  settle(
    material: Material,
    slot: string,
    key: string,
    status: Exclude<MaterialTextureAssignmentStatus, 'pending'>,
  ) {
    const source = this.getSource(material)
    if (!this.isCurrent(source, slot, key)) return false
    const assignment = {
      key,
      retry: this.assignments.get(source)?.get(slot)?.retry,
      status,
    }
    this.set(source, slot, assignment)
    for (const clone of this.clones.get(source) ?? []) {
      this.syncTextureSlot(source, clone, slot)
      this.set(clone, slot, assignment)
    }
    return true
  }

  summarizeMaterials(materials: Iterable<Material>): MaterialTextureSettlement {
    let failedAssignments = 0
    let pendingAssignments = 0
    const visited = new Set<Material>()

    for (const material of materials) {
      if (visited.has(material)) continue
      visited.add(material)
      const assignments = this.assignments.get(material)
      if (!assignments) continue
      for (const assignment of assignments.values()) {
        if (assignment.status === 'pending') pendingAssignments += 1
        else if (assignment.status === 'failed') failedAssignments += 1
      }
    }

    return {
      failedAssignments,
      pendingAssignments,
      settled: pendingAssignments === 0,
    }
  }

  summarizeObjects(roots: Iterable<Object3D>): MaterialTextureSettlement {
    const materials = this.collectObjectMaterials(roots)
    return this.summarizeMaterials(materials)
  }

  retryFailedObjects(roots: Iterable<Object3D>) {
    const retries = new Set<() => void>()
    const sources = new Set<Material>()
    for (const material of this.collectObjectMaterials(roots)) {
      sources.add(this.getSource(material))
    }
    for (const source of sources) {
      for (const assignment of this.assignments.get(source)?.values() ?? []) {
        if (assignment.status === 'failed' && assignment.retry) retries.add(assignment.retry)
      }
    }
    for (const retry of retries) retry()
    return retries.size
  }

  private set(material: Material, slot: string, assignment: MaterialTextureAssignment) {
    let assignments = this.assignments.get(material)
    if (!assignments) {
      assignments = new Map()
      this.assignments.set(material, assignments)
    }
    const current = assignments.get(slot)
    if (
      current?.key === assignment.key &&
      current.status === assignment.status &&
      (current.retry || !assignment.retry)
    ) {
      return
    }
    assignments.set(slot, assignment)
    this.revision += 1
  }

  private getSource(material: Material) {
    return this.cloneSources.get(material) ?? material
  }

  private syncTextureSlot(source: Material, clone: Material, slot: string) {
    const sourceRecord = source as unknown as Record<string, unknown>
    const cloneRecord = clone as unknown as Record<string, unknown>
    cloneRecord[slot] = sourceRecord[slot] ?? null
    clone.needsUpdate = true
  }

  private collectObjectMaterials(roots: Iterable<Object3D>) {
    const materials = new Set<Material>()
    for (const root of roots) {
      root.traverse((object) => {
        const material = (object as Object3D & { material?: Material | Material[] }).material
        if (Array.isArray(material)) {
          for (const entry of material) materials.add(entry)
        } else if (material) {
          materials.add(material)
        }
      })
    }
    return materials
  }
}

export const materialTextureAssignmentRegistry = new MaterialTextureAssignmentRegistry()
