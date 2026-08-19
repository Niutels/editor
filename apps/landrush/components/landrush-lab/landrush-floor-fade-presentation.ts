import { clamp01 } from '@landrush/runtime'
import type { LevelNode } from '@pascal-app/core'
import type { Material, Mesh, Object3D } from 'three'
import { materialOpacity, mul, uniform } from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'
import {
  LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY,
  readLandrushIslandFloorFadeOpacity,
} from './landrush-floor-fade-opacity'
import { createLandrushRobotScreenRevealOpacityNode } from './robot-screen-reveal-mask'

export const LANDRUSH_ISLAND_FLOOR_FADE_EPSILON = 0.002

const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_MATERIALS_PER_FRAME = 1
const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_OBJECTS_PER_FRAME = 192
const LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_TIME_BUDGET_MS = 1.5

export type LandrushIslandRevealMaterialState = {
  clipIntersection: boolean
  clippingPlanes: Material['clippingPlanes']
  depthWrite: boolean
  hasOwnOpacityNode: boolean
  opacityNode: TSLNode<'float'> | null | undefined
  revealAmountUniform?: TSLNode<'float'> & { value: number }
  transparent: boolean
}

export type LandrushIslandRevealNodeMaterial = Material & {
  opacityNode?: TSLNode<'float'> | null
}

export type LandrushIslandFloorFadeMaterialState = {
  hasOwnOpacityNode: boolean
  material: Material
  opacityNode: TSLNode<'float'> | null | undefined
  references: number
  transparent: boolean
}

type LandrushIslandFloorFadeMeshState = {
  hadOwnOpacity: boolean
  mesh: Mesh
  opacity: unknown
}

export type LandrushIslandFloorFadeLevelState = {
  complete: boolean
  materials: Set<Material>
  meshes: LandrushIslandFloorFadeMeshState[]
  pendingObjects: Object3D[]
  root: Object3D
}

export const landrushIslandActiveRevealMaterialStates = new WeakMap<
  Material,
  LandrushIslandRevealMaterialState
>()

export function applyLandrushIslandFloorLevelOpacity({
  floorFadeLevels,
  floorFadeMaterials,
  levelId,
  opacity,
  root,
}: {
  floorFadeLevels: Map<LevelNode['id'], LandrushIslandFloorFadeLevelState>
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>
  levelId: LevelNode['id']
  opacity: number
  root: Object3D
}) {
  const clampedOpacity = clamp01(opacity)
  let levelState = floorFadeLevels.get(levelId)
  if (levelState?.root !== root) {
    if (levelState) restoreLandrushIslandFloorFadeLevel(levelState, floorFadeMaterials)
    floorFadeLevels.delete(levelId)
    levelState = undefined
  }
  if (!levelState) return

  root.visible = clampedOpacity > LANDRUSH_ISLAND_FLOOR_FADE_EPSILON
  for (const meshState of levelState.meshes) {
    meshState.mesh.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = clampedOpacity
  }
}

export function ensureLandrushIslandFloorFadeLevelPreparation({
  floorFadeLevels,
  floorFadeMaterials,
  levelId,
  preparationQueue,
  queuedLevelIds,
  root,
}: {
  floorFadeLevels: Map<LevelNode['id'], LandrushIslandFloorFadeLevelState>
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>
  levelId: LevelNode['id']
  preparationQueue: LevelNode['id'][]
  queuedLevelIds: Set<LevelNode['id']>
  root: Object3D
}) {
  const existingState = floorFadeLevels.get(levelId)
  if (existingState?.root === root) return
  if (existingState) restoreLandrushIslandFloorFadeLevel(existingState, floorFadeMaterials)

  floorFadeLevels.set(levelId, {
    complete: false,
    materials: new Set(),
    meshes: [],
    pendingObjects: [root],
    root,
  })
  if (queuedLevelIds.has(levelId)) return
  queuedLevelIds.add(levelId)
  preparationQueue.push(levelId)
}

export function prepareLandrushIslandFloorFadeLevels({
  floorFadeLevels,
  floorFadeMaterials,
  preparationQueue,
  queuedLevelIds,
}: {
  floorFadeLevels: Map<LevelNode['id'], LandrushIslandFloorFadeLevelState>
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>
  preparationQueue: LevelNode['id'][]
  queuedLevelIds: Set<LevelNode['id']>
}) {
  const startedAt = performance.now()
  let materialsPrepared = 0
  let meshesPrepared = 0
  let objectsVisited = 0

  while (
    preparationQueue.length > 0 &&
    materialsPrepared < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_MATERIALS_PER_FRAME &&
    objectsVisited < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_MAX_OBJECTS_PER_FRAME &&
    performance.now() - startedAt < LANDRUSH_ISLAND_FLOOR_FADE_PREPARE_TIME_BUDGET_MS
  ) {
    const levelId = preparationQueue.shift()
    if (!levelId) break
    const levelState = floorFadeLevels.get(levelId)
    if (!levelState || levelState.complete) {
      queuedLevelIds.delete(levelId)
      continue
    }

    const object = levelState.pendingObjects.pop()
    if (object) {
      objectsVisited += 1
      for (let childIndex = object.children.length - 1; childIndex >= 0; childIndex -= 1) {
        const child = object.children[childIndex]
        if (child) levelState.pendingObjects.push(child)
      }

      const mesh = object as Mesh
      if (mesh.isMesh && mesh.material) {
        materialsPrepared += prepareLandrushIslandFloorFadeMesh(
          levelState,
          floorFadeMaterials,
          mesh,
        )
        meshesPrepared += 1
      }
    }

    if (levelState.pendingObjects.length === 0) {
      levelState.complete = true
      queuedLevelIds.delete(levelId)
    } else {
      preparationQueue.push(levelId)
    }
  }

  return {
    elapsedMs: performance.now() - startedAt,
    materialsPrepared,
    meshesPrepared,
    objectsVisited,
  }
}

export function restoreLandrushIslandFloorFadeLevels(
  floorFadeLevels: Map<LevelNode['id'], LandrushIslandFloorFadeLevelState>,
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>,
) {
  for (const levelState of floorFadeLevels.values()) {
    restoreLandrushIslandFloorFadeLevel(levelState, floorFadeMaterials)
  }
  floorFadeLevels.clear()
}

function prepareLandrushIslandFloorFadeMesh(
  levelState: LandrushIslandFloorFadeLevelState,
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>,
  mesh: Mesh,
) {
  const hadOwnOpacity = Object.hasOwn(
    mesh.userData,
    LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY,
  )
  const opacity = mesh.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]
  mesh.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 1
  levelState.meshes.push({ hadOwnOpacity, mesh, opacity })

  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  let materialsPrepared = 0
  for (const source of new Set(sourceMaterials)) {
    if (levelState.materials.has(source)) continue
    levelState.materials.add(source)
    if (acquireLandrushIslandFloorFadeMaterial(floorFadeMaterials, source)) {
      materialsPrepared += 1
    }
  }
  return materialsPrepared
}

function acquireLandrushIslandFloorFadeMaterial(
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>,
  material: Material,
) {
  const existingState = floorFadeMaterials.get(material)
  if (existingState) {
    existingState.references += 1
    return false
  }

  const nodeMaterial = material as LandrushIslandRevealNodeMaterial & { isNodeMaterial?: boolean }
  const activeRevealState = landrushIslandActiveRevealMaterialStates.get(material)
  const hasOwnOpacityNode = activeRevealState
    ? activeRevealState.hasOwnOpacityNode
    : Object.hasOwn(material, 'opacityNode')
  const opacityNode = activeRevealState ? activeRevealState.opacityNode : nodeMaterial.opacityNode
  const transparent = activeRevealState?.transparent ?? material.transparent
  const objectOpacityNode = uniform(1).onObjectUpdate(({ object }) =>
    readLandrushIslandFloorFadeOpacity(object),
  ) as unknown as TSLNode<'float'>
  const floorOpacityNode = mul(
    opacityNode ?? (materialOpacity as unknown as TSLNode<'float'>),
    objectOpacityNode,
  ) as unknown as TSLNode<'float'>

  floorFadeMaterials.set(material, {
    hasOwnOpacityNode,
    material,
    opacityNode,
    references: 1,
    transparent,
  })
  if (activeRevealState) {
    activeRevealState.hasOwnOpacityNode = true
    activeRevealState.opacityNode = floorOpacityNode
    activeRevealState.transparent = true
    nodeMaterial.opacityNode = activeRevealState.revealAmountUniform
      ? createLandrushRobotScreenRevealOpacityNode(
          floorOpacityNode,
          activeRevealState.revealAmountUniform,
          1,
          { depthAware: false },
        )
      : floorOpacityNode
  } else {
    nodeMaterial.opacityNode = floorOpacityNode
  }
  material.transparent = true
  material.needsUpdate = true
  return true
}

function restoreLandrushIslandFloorFadeLevel(
  levelState: LandrushIslandFloorFadeLevelState,
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>,
) {
  levelState.root.visible = true
  for (const meshState of levelState.meshes) {
    if (meshState.hadOwnOpacity) {
      meshState.mesh.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = meshState.opacity
    } else {
      delete meshState.mesh.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]
    }
  }
  for (const material of levelState.materials) {
    releaseLandrushIslandFloorFadeMaterial(floorFadeMaterials, material)
  }
}

function releaseLandrushIslandFloorFadeMaterial(
  floorFadeMaterials: Map<Material, LandrushIslandFloorFadeMaterialState>,
  material: Material,
) {
  const state = floorFadeMaterials.get(material)
  if (!state) return
  state.references -= 1
  if (state.references > 0) return

  const nodeMaterial = material as LandrushIslandRevealNodeMaterial
  const activeRevealState = landrushIslandActiveRevealMaterialStates.get(material)
  if (activeRevealState) {
    activeRevealState.hasOwnOpacityNode = state.hasOwnOpacityNode
    activeRevealState.opacityNode = state.opacityNode
    activeRevealState.transparent = state.transparent
    if (activeRevealState.revealAmountUniform) {
      nodeMaterial.opacityNode = createLandrushRobotScreenRevealOpacityNode(
        state.opacityNode ?? (materialOpacity as unknown as TSLNode<'float'>),
        activeRevealState.revealAmountUniform,
        1,
        { depthAware: false },
      )
    } else if (state.hasOwnOpacityNode) {
      nodeMaterial.opacityNode = state.opacityNode
    } else {
      delete nodeMaterial.opacityNode
    }
    material.transparent = true
  } else {
    if (state.hasOwnOpacityNode) nodeMaterial.opacityNode = state.opacityNode
    else delete nodeMaterial.opacityNode
    material.transparent = state.transparent
  }
  material.needsUpdate = true
  floorFadeMaterials.delete(material)
}
