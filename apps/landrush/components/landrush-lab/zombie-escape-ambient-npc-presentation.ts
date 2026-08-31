import { Color, type Group, type Material, type Mesh } from 'three'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'
import {
  createZombieEscapeZombieShader,
  type ZombieEscapeZombieShader,
} from './zombie-escape-zombie-material'

type AmbientNpcFlashableMaterial = Material & {
  color?: Color
  emissive: Color
  emissiveIntensity: number
}

type AmbientNpcHitMaterial = {
  baseColor: Color | null
  baseEmissive: Color
  baseEmissiveIntensity: number
  material: AmbientNpcFlashableMaterial
}

type AmbientNpcMeshMaterialState = {
  mesh: Mesh
  source: Material | Material[]
  zombie: Material | Material[]
}

export type ZombieEscapeAmbientNpcPresentationResource = Readonly<{
  dispose: () => void
  setHitFlash: (hitFlash: number) => void
  setZombiePhase: (amount: number) => void
  shader: ZombieEscapeZombieShader
}>

const AMBIENT_NPC_HIT_BLACK = new Color('#030104')
const AMBIENT_NPC_HIT_RED = new Color('#ff1738')

export function createZombieEscapeAmbientNpcPresentationResource(
  root: Group,
  seed: number,
  outsideTorchVisibility: number,
): ZombieEscapeAmbientNpcPresentationResource {
  const shader = createZombieEscapeZombieShader({
    outsideTorchVisibility,
    phaseAmount: 0,
  })
  const hitMaterials: AmbientNpcHitMaterial[] = []
  const meshMaterials: AmbientNpcMeshMaterialState[] = []
  const ownedMaterials: Material[] = []
  let hitPhase = resolveZombieEscapeHitFlickerPhase(0)
  let disposed = false

  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const zombieMaterials = sourceMaterials.map((sourceMaterial) => {
      const material = shader.createMaterial(sourceMaterial, mesh.geometry, seed)
      ownedMaterials.push(material)
      const flashable = resolveAmbientNpcFlashableMaterial(material)
      if (flashable) {
        hitMaterials.push({
          baseColor: flashable.color instanceof Color ? flashable.color.clone() : null,
          baseEmissive: flashable.emissive.clone(),
          baseEmissiveIntensity: flashable.emissiveIntensity,
          material: flashable,
        })
      }
      return material
    })
    const zombieMaterial = Array.isArray(mesh.material) ? zombieMaterials : zombieMaterials[0]!
    meshMaterials.push({ mesh, source: mesh.material, zombie: zombieMaterial })
    mesh.material = zombieMaterial
  })

  return {
    dispose() {
      if (disposed) return
      disposed = true
      for (const state of meshMaterials) {
        if (state.mesh.material === state.zombie) state.mesh.material = state.source
      }
      for (const material of ownedMaterials) material.dispose()
    },
    setHitFlash(hitFlash) {
      const nextPhase = resolveZombieEscapeHitFlickerPhase(hitFlash)
      if (hitPhase === nextPhase) return
      hitPhase = nextPhase
      for (const state of hitMaterials) {
        if (nextPhase === 'none') {
          if (state.baseColor && state.material.color) {
            state.material.color.copy(state.baseColor)
          }
          state.material.emissive.copy(state.baseEmissive)
          state.material.emissiveIntensity = state.baseEmissiveIntensity
          continue
        }
        const color = nextPhase === 'red' ? AMBIENT_NPC_HIT_RED : AMBIENT_NPC_HIT_BLACK
        state.material.color?.copy(color)
        state.material.emissive.copy(color)
        state.material.emissiveIntensity = nextPhase === 'red' ? 3.6 : 0
      }
    },
    setZombiePhase: shader.setPhaseAmount,
    shader,
  }
}

function resolveAmbientNpcFlashableMaterial(
  material: Material,
): AmbientNpcFlashableMaterial | null {
  const candidate = material as Material & {
    color?: Color
    emissive?: Color
    emissiveIntensity?: number
  }
  if (!(candidate.emissive instanceof Color)) return null
  return candidate as AmbientNpcFlashableMaterial
}
