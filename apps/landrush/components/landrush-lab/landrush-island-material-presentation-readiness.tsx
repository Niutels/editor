'use client'

import { useLayoutEffect, useRef } from 'react'
import type { Mesh, Object3D } from 'three'
import type {
  LandrushIslandMaterialPresentationOwner,
  LandrushIslandMaterialReadinessMesh,
} from './landrush-island-material-presentation'
import { isLandrushRevealObjectOwnedByRoot } from './robot-reveal-mesh-ownership'
import type { ZombieEscapeRenderReadinessRegistry } from './zombie-escape-render-readiness'

export const LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY =
  'island:material-presentation'

export function collectLandrushIslandMaterialPresentationReadinessMeshes({
  floorRoots,
  registeredNodeRoots,
  revealRoots,
}: {
  floorRoots: Iterable<Object3D>
  registeredNodeRoots: ReadonlySet<Object3D>
  revealRoots: Iterable<Object3D>
}) {
  const meshes = new Map<Mesh, LandrushIslandMaterialReadinessMesh>()
  const mergeMesh = (mesh: Mesh, floor: boolean, reveal: boolean) => {
    const current = meshes.get(mesh)
    if (!current) {
      meshes.set(mesh, { floor, mesh, reveal })
      return
    }
    if ((current.floor || !floor) && (current.reveal || !reveal)) return
    meshes.set(mesh, {
      floor: current.floor || floor,
      mesh,
      reveal: current.reveal || reveal,
    })
  }
  for (const root of floorRoots) {
    root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) mergeMesh(mesh, true, false)
    })
  }
  for (const root of revealRoots) {
    root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      if (!isLandrushRevealObjectOwnedByRoot(object, root, registeredNodeRoots)) return
      mergeMesh(mesh, false, true)
    })
  }
  return [...meshes.values()]
}

export function registerLandrushIslandMaterialPresentationRenderReadiness({
  meshes,
  owner,
  ready,
  registry,
}: {
  meshes: readonly LandrushIslandMaterialReadinessMesh[]
  owner: LandrushIslandMaterialPresentationOwner
  ready: boolean
  registry: ZombieEscapeRenderReadinessRegistry
}) {
  if (!ready) return undefined

  const root = owner.createRenderReadinessRepresentative(meshes, { kind: 'soft' })
  let unregister: (() => void) | undefined
  try {
    unregister = registry.register(
      LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      root,
    )
  } catch (error) {
    root.clear()
    throw error
  }

  let registered = true
  return () => {
    if (!registered) return
    registered = false
    unregister?.()
    root.clear()
  }
}

export function LandrushIslandMaterialPresentationRenderReadiness({
  meshes,
  owner,
  ready,
  registry,
}: {
  meshes: readonly LandrushIslandMaterialReadinessMesh[]
  owner: LandrushIslandMaterialPresentationOwner
  ready: boolean
  registry: ZombieEscapeRenderReadinessRegistry
}) {
  const readyMeshesRef = useRef(meshes)
  readyMeshesRef.current = meshes

  useLayoutEffect(
    () =>
      registerLandrushIslandMaterialPresentationRenderReadiness({
        meshes: readyMeshesRef.current,
        owner,
        ready,
        registry,
      }),
    [owner, ready, registry],
  )

  return null
}
