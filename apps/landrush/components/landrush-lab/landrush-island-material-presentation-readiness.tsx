'use client'

import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Group, type Mesh, type Object3D } from 'three'
import type {
  LandrushIslandMaterialPresentationOwner,
  LandrushIslandMaterialReadinessMesh,
} from './landrush-island-material-presentation'
import {
  createLandrushRenderReadinessCoordinator,
  type LandrushPipelineRenderer,
} from './landrush-render-readiness'
import {
  createLandrushZombieNightBeaconRenderReadinessRepresentative,
  createLandrushZombieNightSurfaceRenderReadinessRepresentative,
  LANDRUSH_ZOMBIE_NIGHT_RENDER_REPRESENTATIVE_KEY,
  observeLandrushZombieNightWorld,
} from './landrush-zombie-night-presentation-material'
import { isLandrushRevealObjectOwnedByRoot } from './robot-reveal-mesh-ownership'
import type { ZombieEscapeRenderReadinessRegistry } from './zombie-escape-render-readiness'

export const LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY =
  'island:material-presentation'
export const LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY =
  LANDRUSH_ZOMBIE_NIGHT_RENDER_REPRESENTATIVE_KEY
export const LANDRUSH_ISLAND_DAY_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY =
  'island:material-presentation:day'

export type LandrushIslandDayMaterialPresentationReadiness = Readonly<{
  completed: number
  generation: string
  ready: boolean
  total: number
}>

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
  generation = 0,
  meshes,
  owner,
  ready,
  registry,
  worldRoot,
}: {
  generation?: number
  meshes: readonly LandrushIslandMaterialReadinessMesh[]
  owner: LandrushIslandMaterialPresentationOwner
  ready: boolean
  registry: ZombieEscapeRenderReadinessRegistry
  worldRoot?: Object3D
}) {
  if (!ready) return undefined

  const dayRoot = owner.createRenderReadinessRepresentative(meshes, { kind: 'soft' })
  const nightRoot = new Group()
  dayRoot.userData.landrushMaterialReadinessGeneration = generation
  nightRoot.userData.landrushMaterialReadinessGeneration = generation
  const surfaceRepresentative = worldRoot
    ? createLandrushZombieNightSurfaceRenderReadinessRepresentative(worldRoot)
    : null
  const beaconRepresentative = createLandrushZombieNightBeaconRenderReadinessRepresentative()
  if (surfaceRepresentative) nightRoot.add(surfaceRepresentative)
  nightRoot.add(beaconRepresentative.root)
  let unregisterDay: (() => void) | undefined
  let unregisterNight: (() => void) | undefined
  try {
    unregisterDay = registry.register(
      LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      dayRoot,
    )
    unregisterNight = registry.register(
      LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      nightRoot,
    )
  } catch (error) {
    unregisterDay?.()
    dayRoot.clear()
    nightRoot.clear()
    beaconRepresentative.dispose()
    throw error
  }

  let registered = true
  return () => {
    if (!registered) return
    registered = false
    unregisterNight?.()
    unregisterDay?.()
    dayRoot.clear()
    nightRoot.clear()
    beaconRepresentative.dispose()
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
  const scene = useThree((state) => state.scene)
  const [meshGeneration, setMeshGeneration] = useState(0)
  const registrationCleanupRef = useRef<(() => void) | undefined>(undefined)
  const invalidateRegistration = useCallback(() => {
    registrationCleanupRef.current?.()
    registrationCleanupRef.current = undefined
    setMeshGeneration((current) => current + 1)
  }, [])

  useLayoutEffect(
    () => observeLandrushZombieNightWorld(scene, invalidateRegistration),
    [invalidateRegistration, scene],
  )

  useLayoutEffect(() => {
    const cleanup = registerLandrushIslandMaterialPresentationRenderReadiness({
      generation: meshGeneration,
      meshes,
      owner,
      ready,
      registry,
      worldRoot: scene,
    })
    registrationCleanupRef.current = cleanup
    return () => {
      if (registrationCleanupRef.current === cleanup) {
        registrationCleanupRef.current = undefined
      }
      cleanup?.()
    }
  }, [meshGeneration, meshes, owner, ready, registry, scene])

  return null
}

export function LandrushIslandDayMaterialPresentationRenderReadiness({
  generation,
  meshes,
  onReadinessChange,
  owner,
  ready,
}: {
  generation: string
  meshes: readonly LandrushIslandMaterialReadinessMesh[]
  onReadinessChange: (readiness: LandrushIslandDayMaterialPresentationReadiness) => void
  owner: LandrushIslandMaterialPresentationOwner
  ready: boolean
}) {
  const { camera, gl, scene } = useThree()
  const coordinatorRef = useRef<ReturnType<typeof createLandrushRenderReadinessCoordinator> | null>(
    null,
  )
  const requestGenerationRef = useRef(0)
  coordinatorRef.current ??= createLandrushRenderReadinessCoordinator()

  useLayoutEffect(() => {
    const coordinator = coordinatorRef.current
    if (!coordinator) return
    coordinator.invalidate()
    if (!ready) {
      onReadinessChange({ completed: 0, generation, ready: false, total: 1 })
      return
    }

    const root = owner.createRenderReadinessRepresentative(meshes, { kind: 'soft' })
    const requestGeneration = ++requestGenerationRef.current
    let active = true
    let completed = 0
    onReadinessChange({ completed, generation, ready: false, total: 1 })
    void coordinator.request(
      {
        camera,
        generation: requestGeneration,
        identity: root,
        representatives: [
          {
            key: LANDRUSH_ISLAND_DAY_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
            root,
          },
        ],
        renderer: gl as unknown as LandrushPipelineRenderer,
        targetScene: scene,
      },
      (status) => {
        if (!active) return
        const contentReady = status.state === 'ready'
        if (contentReady) completed = 1
        onReadinessChange({ completed, generation, ready: contentReady, total: 1 })
      },
      (progress) => {
        if (!active) return
        completed = Math.min(1, progress.completed)
        onReadinessChange({ completed, generation, ready: false, total: 1 })
      },
    )

    return () => {
      active = false
      coordinator.invalidate()
      root.clear()
      onReadinessChange({ completed: 0, generation, ready: false, total: 1 })
    }
  }, [camera, generation, gl, meshes, onReadinessChange, owner, ready, scene])

  return null
}
