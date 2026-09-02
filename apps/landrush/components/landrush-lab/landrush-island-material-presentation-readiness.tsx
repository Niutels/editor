'use client'

import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Group, type Mesh, type Object3D, type SpotLight } from 'three'
import type {
  LandrushIslandMaterialPresentationOwner,
  LandrushIslandMaterialReadinessMesh,
} from './landrush-island-material-presentation'
import {
  clearLandrushRenderReadinessRoot,
  createLandrushRenderReadinessCoordinator,
  type LandrushPipelineRenderer,
} from './landrush-render-readiness'
import {
  createLandrushZombieNightBeaconRenderReadinessRepresentative,
  createLandrushZombieNightSurfaceRenderReadinessRepresentative,
  LANDRUSH_ZOMBIE_NIGHT_RENDER_REPRESENTATIVE_KEY,
  observeLandrushZombieNightWorld,
} from './landrush-zombie-night-presentation-material'
import {
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS,
  type LandrushZombieNightQuality,
  parseLandrushZombieNightDebugQuery,
} from './landrush-zombie-night-presentation-state'
import { LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY } from './landrush-zombie-night-street-lightpost'
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

export type LandrushZombieNightReadinessLightTopology = Readonly<{
  capacity: number
  mountedCount: number
  plannedCount: number | null
  publisherCount: number
  ready: boolean
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

export function readLandrushZombieNightReadinessLightTopology(
  worldRoot: Object3D,
  quality: LandrushZombieNightQuality,
): LandrushZombieNightReadinessLightTopology {
  const capacity = LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS[quality]
  let mountedCount = 0
  let plannedCount = 0
  let publisherCount = 0
  let validPlan = true
  worldRoot.traverse((object) => {
    if (isMountedLandrushZombieNightSpotLight(object)) mountedCount += 1
    if (!publishesLandrushZombieNightStreetLightCount(object)) return
    publisherCount += 1
    const value =
      object.userData[LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY]
    if (!Number.isSafeInteger(value) || value < 0) {
      validPlan = false
      return
    }
    plannedCount += value
  })
  const resolvedPlannedCount = publisherCount > 0 && validPlan ? plannedCount : null
  return {
    capacity,
    mountedCount,
    plannedCount: resolvedPlannedCount,
    publisherCount,
    ready:
      resolvedPlannedCount !== null &&
      resolvedPlannedCount <= capacity &&
      mountedCount === resolvedPlannedCount,
  }
}

export function observeLandrushZombieNightReadinessLightTopology(
  worldRoot: Object3D,
  onTopologyChange: () => void,
) {
  const observed = new Set<Object3D>()
  let disposed = false
  const attach = (root: Object3D) => {
    root.traverse((object) => {
      if (observed.has(object)) return
      observed.add(object)
      const eventTarget = object as unknown as LandrushZombieNightReadinessChildEventTarget
      eventTarget.addEventListener('childadded', handleChildAdded)
      eventTarget.addEventListener('childremoved', handleChildRemoved)
    })
  }
  const detach = (root: Object3D) => {
    root.traverse((object) => {
      if (!observed.delete(object)) return
      const eventTarget = object as unknown as LandrushZombieNightReadinessChildEventTarget
      eventTarget.removeEventListener('childadded', handleChildAdded)
      eventTarget.removeEventListener('childremoved', handleChildRemoved)
    })
  }
  const reconcile = () => {
    let affectsTopology = false
    for (const object of [...observed]) {
      if (
        !observed.has(object) ||
        object === worldRoot ||
        (object.parent && observed.has(object.parent))
      ) {
        continue
      }
      affectsTopology ||= containsLandrushZombieNightReadinessLightTopology(object)
      detach(object)
    }
    worldRoot.traverse((object) => {
      if (observed.has(object)) return
      affectsTopology ||= containsLandrushZombieNightReadinessLightTopology(object)
      attach(object)
    })
    if (affectsTopology) onTopologyChange()
  }
  function handleChildAdded({ child }: LandrushZombieNightReadinessChildEvent) {
    if (!child) {
      reconcile()
      return
    }
    const affectsTopology = containsLandrushZombieNightReadinessLightTopology(child)
    attach(child)
    if (affectsTopology) onTopologyChange()
  }
  function handleChildRemoved({ child }: LandrushZombieNightReadinessChildEvent) {
    if (!child) {
      reconcile()
      return
    }
    const affectsTopology = containsLandrushZombieNightReadinessLightTopology(child)
    detach(child)
    if (affectsTopology) onTopologyChange()
  }

  attach(worldRoot)
  return () => {
    if (disposed) return
    disposed = true
    detach(worldRoot)
  }
}

export function registerLandrushIslandMaterialPresentationRenderReadiness({
  generation = 0,
  meshes,
  owner,
  quality = 'balanced',
  ready,
  registry,
  worldRoot,
}: {
  generation?: number
  meshes: readonly LandrushIslandMaterialReadinessMesh[]
  owner: LandrushIslandMaterialPresentationOwner
  quality?: LandrushZombieNightQuality
  ready: boolean
  registry: ZombieEscapeRenderReadinessRegistry
  worldRoot?: Object3D
}) {
  if (!ready || !worldRoot) return undefined
  const lightTopology = readLandrushZombieNightReadinessLightTopology(worldRoot, quality)
  if (!lightTopology.ready) return undefined

  const dayRoot = owner.createRenderReadinessRepresentative(meshes, { kind: 'soft' })
  const nightRoot = new Group()
  dayRoot.userData.landrushMaterialReadinessGeneration = generation
  nightRoot.userData.landrushMaterialReadinessGeneration = generation
  const surfaceRepresentative =
    createLandrushZombieNightSurfaceRenderReadinessRepresentative(worldRoot)
  const beaconRepresentative = createLandrushZombieNightBeaconRenderReadinessRepresentative()
  nightRoot.add(surfaceRepresentative)
  nightRoot.add(beaconRepresentative.root)
  const disposeNightRepresentatives = () => {
    clearLandrushRenderReadinessRoot(nightRoot)
    beaconRepresentative.dispose()
  }
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
    clearLandrushRenderReadinessRoot(dayRoot)
    disposeNightRepresentatives()
    throw error
  }

  let registered = true
  return () => {
    if (!registered) return
    registered = false
    unregisterNight?.()
    unregisterDay?.()
    clearLandrushRenderReadinessRoot(dayRoot)
    disposeNightRepresentatives()
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
  const [nightQuality] = useState(readLandrushZombieNightReadinessQuality)
  const [meshGeneration, setMeshGeneration] = useState(0)
  const registrationCleanupRef = useRef<(() => void) | undefined>(undefined)
  const invalidateRegistration = useCallback(() => {
    registrationCleanupRef.current?.()
    registrationCleanupRef.current = undefined
    setMeshGeneration((current) => current + 1)
  }, [])

  useLayoutEffect(() => {
    const disposeSurfaceObserver = observeLandrushZombieNightWorld(scene, invalidateRegistration)
    const disposeLightObserver = observeLandrushZombieNightReadinessLightTopology(
      scene,
      invalidateRegistration,
    )
    return () => {
      disposeLightObserver()
      disposeSurfaceObserver()
    }
  }, [invalidateRegistration, scene])

  useLayoutEffect(() => {
    const cleanup = registerLandrushIslandMaterialPresentationRenderReadiness({
      generation: meshGeneration,
      meshes,
      owner,
      quality: nightQuality,
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
  }, [meshGeneration, meshes, nightQuality, owner, ready, registry, scene])

  return null
}

type LandrushZombieNightReadinessChildEvent = Readonly<{ child?: Object3D | null }>

type LandrushZombieNightReadinessChildEventTarget = {
  addEventListener: (
    type: 'childadded' | 'childremoved',
    listener: (event: LandrushZombieNightReadinessChildEvent) => void,
  ) => void
  removeEventListener: (
    type: 'childadded' | 'childremoved',
    listener: (event: LandrushZombieNightReadinessChildEvent) => void,
  ) => void
}

function containsLandrushZombieNightReadinessLightTopology(root: Object3D) {
  let relevant = false
  root.traverse((object) => {
    if (relevant) return
    relevant =
      isMountedLandrushZombieNightSpotLight(object) ||
      publishesLandrushZombieNightStreetLightCount(object)
  })
  return relevant
}

function isMountedLandrushZombieNightSpotLight(object: Object3D) {
  return (object as SpotLight).isSpotLight === true && object.userData.landrushZombieNight === true
}

function publishesLandrushZombieNightStreetLightCount(object: Object3D) {
  return (
    object.userData.landrushZombieNight === true &&
    Object.hasOwn(
      object.userData,
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY,
    )
  )
}

function readLandrushZombieNightReadinessQuality() {
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search)
  return parseLandrushZombieNightDebugQuery(params).quality
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
      clearLandrushRenderReadinessRoot(root)
      onReadinessChange({ completed: 0, generation, ready: false, total: 1 })
    }
  }, [camera, generation, gl, meshes, onReadinessChange, owner, ready, scene])

  return null
}
