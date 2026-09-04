'use client'

import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { cloneMaterial } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, memo, useEffect, useRef } from 'react'
import { Color, type Group, type Material, type Mesh } from 'three'
import {
  resolveZombieEscapeHitFlickerPhase,
  type ZombieEscapeHitFlickerPhase,
} from './zombie-escape-hit-flicker'

type PlayerHitMaterial = Material & {
  color?: Color
  emissive?: Color
  emissiveIntensity?: number
}

type PlayerHitMaterialState = {
  baseColor: Color | null
  baseEmissive: Color | null
  baseEmissiveIntensity: number | null
  material: PlayerHitMaterial
}

type PlayerHitMeshBinding = {
  hitAssignment: Material | Material[]
  mesh: Mesh
  sourceAssignment: Material | Material[]
}

const PLAYER_HIT_RED = new Color('#ff1738')
const PLAYER_HIT_BLACK = new Color('#030104')

export class LandrushZombieEscapePlayerHitPresentation {
  private readonly materialStates: PlayerHitMaterialState[] = []
  private readonly meshBindings: PlayerHitMeshBinding[] = []
  private readonly ownedMaterials = new Set<Material>()
  private phase: ZombieEscapeHitFlickerPhase = 'none'
  private root: Group | null = null

  sync(root: Group | null, hitFlash: number) {
    if (root !== this.root) this.bind(root)
    const phase = resolveZombieEscapeHitFlickerPhase(hitFlash)
    if (phase === this.phase) return
    this.phase = phase
    for (const state of this.materialStates) applyPlayerHitMaterialPhase(state, phase)
  }

  dispose() {
    this.releaseBindings()
    this.root = null
    this.phase = 'none'
  }

  private bind(root: Group | null) {
    this.releaseBindings()
    this.root = root
    this.phase = 'none'
    if (!root) return

    const materialClones = new Map<Material, Material>()
    root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const hoverSourceAssignment = mesh.userData.landrushOriginalMaterial
      const hoverOwnsAssignment = isPlayerHitMaterialAssignment(hoverSourceAssignment)
      const sourceAssignment = hoverOwnsAssignment ? hoverSourceAssignment : mesh.material
      const sourceMaterials = Array.isArray(sourceAssignment)
        ? sourceAssignment
        : [sourceAssignment]
      const hitMaterials = sourceMaterials.map((source) => {
        const existing = materialClones.get(source)
        if (existing) return existing
        const cloned = cloneMaterial(source)
        materialClones.set(source, cloned)
        this.ownedMaterials.add(cloned)
        const hitMaterial = cloned as PlayerHitMaterial
        const baseColor = hitMaterial.color instanceof Color ? hitMaterial.color.clone() : null
        const baseEmissive =
          hitMaterial.emissive instanceof Color ? hitMaterial.emissive.clone() : null
        if (baseColor || baseEmissive) {
          this.materialStates.push({
            baseColor,
            baseEmissive,
            baseEmissiveIntensity:
              typeof hitMaterial.emissiveIntensity === 'number'
                ? hitMaterial.emissiveIntensity
                : null,
            material: hitMaterial,
          })
        }
        return cloned
      })
      const hitAssignment = Array.isArray(sourceAssignment) ? hitMaterials : hitMaterials[0]!
      if (hoverOwnsAssignment) mesh.userData.landrushOriginalMaterial = hitAssignment
      else mesh.material = hitAssignment
      this.meshBindings.push({ hitAssignment, mesh, sourceAssignment })
    })
  }

  private releaseBindings() {
    for (const binding of this.meshBindings) {
      if (binding.mesh.material === binding.hitAssignment) {
        binding.mesh.material = binding.sourceAssignment
      }
      if (binding.mesh.userData.landrushOriginalMaterial === binding.hitAssignment) {
        binding.mesh.userData.landrushOriginalMaterial = binding.sourceAssignment
      }
    }
    this.meshBindings.length = 0
    this.materialStates.length = 0
    for (const material of this.ownedMaterials) material.dispose()
    this.ownedMaterials.clear()
  }
}

function isPlayerHitMaterialAssignment(value: unknown): value is Material | Material[] {
  const materials = Array.isArray(value) ? value : [value]
  return (
    materials.length > 0 &&
    materials.every(
      (material) =>
        typeof material === 'object' &&
        material !== null &&
        (material as Material & { isMaterial?: boolean }).isMaterial === true,
    )
  )
}

function applyPlayerHitMaterialPhase(
  state: PlayerHitMaterialState,
  phase: ZombieEscapeHitFlickerPhase,
) {
  if (phase === 'none') {
    if (state.baseColor && state.material.color) state.material.color.copy(state.baseColor)
    if (state.baseEmissive && state.material.emissive) {
      state.material.emissive.copy(state.baseEmissive)
    }
    if (
      state.baseEmissiveIntensity !== null &&
      typeof state.material.emissiveIntensity === 'number'
    ) {
      state.material.emissiveIntensity = state.baseEmissiveIntensity
    }
    return
  }

  const color = phase === 'red' ? PLAYER_HIT_RED : PLAYER_HIT_BLACK
  state.material.color?.copy(color)
  state.material.emissive?.copy(color)
  if (typeof state.material.emissiveIntensity === 'number') {
    state.material.emissiveIntensity = phase === 'red' ? 3.6 : 0
  }
}

export const LandrushZombieEscapePlayerHitPresentationView = memo(
  function LandrushZombieEscapePlayerHitPresentationView({
    active,
    framePriority,
    simulationRef,
    visualRootRef,
  }: {
    active: boolean
    framePriority: number
    simulationRef: MutableRefObject<ZombieEscapeSimulation>
    visualRootRef: MutableRefObject<Group | null>
  }) {
    const presentationRef = useRef<LandrushZombieEscapePlayerHitPresentation | null>(null)
    presentationRef.current ??= new LandrushZombieEscapePlayerHitPresentation()

    useEffect(() => {
      const presentation = presentationRef.current
      return () => presentation?.dispose()
    }, [])

    useFrame(() => {
      const presentation = presentationRef.current
      if (!presentation) return
      const root = visualRootRef.current
      presentation.sync(root, active ? simulationRef.current.player.hurtFlash : 0)
    }, framePriority)

    return null
  },
)
