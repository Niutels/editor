import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Scene,
  SpotLight,
} from 'three'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'
import {
  collectLandrushIslandMaterialPresentationReadinessMeshes,
  LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  observeLandrushZombieNightReadinessLightTopology,
  readLandrushZombieNightReadinessLightTopology,
  registerLandrushIslandMaterialPresentationRenderReadiness,
} from './landrush-island-material-presentation-readiness'
import { observeLandrushZombieNightWorld } from './landrush-zombie-night-presentation-material'
import { LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS } from './landrush-zombie-night-presentation-state'
import { LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY } from './landrush-zombie-night-street-lightpost'
import { createZombieEscapeRenderReadinessRegistry } from './zombie-escape-render-readiness'

describe('Landrush island material presentation render readiness', () => {
  test('waits for the current floor generation before collecting or registering either mode', () => {
    const clientSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    const readinessSource = readFileSync(
      new URL('./landrush-island-material-presentation-readiness.tsx', import.meta.url),
      'utf8',
    )

    expect(clientSource).toContain(
      'viewerSceneReady && floorPresentationReadinessGeneration !== null',
    )
    expect(clientSource).toContain(
      'viewerSceneReady={viewerSceneReady && ambientLoadReadiness?.ready === true}',
    )
    expect(clientSource.indexOf('<LandrushIslandAmbientLife')).toBeLessThan(
      clientSource.indexOf('<MemoizedLandrushIslandPlayerLayer'),
    )
    expect(clientSource).toContain('viewerSceneReady={materialPresentationReadinessReady}')
    expect(clientSource).toContain('<LandrushIslandDayMaterialPresentationRenderReadiness')
    expect(readinessSource).toContain('coordinator.invalidate()')
    expect(readinessSource).not.toContain('dayRoot.clear()')
    expect(readinessSource).not.toContain('nightRoot.clear()')
    expect(readinessSource).not.toContain('root.clear()')
    expect(readinessSource).toContain('clearLandrushRenderReadinessRoot(root)')
    expect(readinessSource).toContain(
      '[camera, generation, gl, meshes, onReadinessChange, owner, ready, scene]',
    )
    expect(readinessSource).toContain(
      '[meshGeneration, meshes, nightQuality, owner, ready, registry, scene]',
    )
    expect(readinessSource).toContain('registrationCleanupRef.current?.()')
    expect(readinessSource).toContain('observeLandrushZombieNightReadinessLightTopology')
    expect(readinessSource).not.toContain('createLandrushZombieNightLightTopology')
  })

  test('OR-merges floor and registered-root-owned reveal provenance per mesh', () => {
    const floorRoot = new Group()
    const floorMesh = new Mesh()
    const registeredFloorDescendant = new Group()
    const registeredFloorMesh = new Mesh()
    registeredFloorDescendant.add(registeredFloorMesh)
    floorRoot.add(floorMesh, registeredFloorDescendant)

    const revealRoot = new Group()
    const revealMesh = new Mesh()
    const nestedRegisteredRevealRoot = new Group()
    const nestedRevealMesh = new Mesh()
    nestedRegisteredRevealRoot.add(nestedRevealMesh)
    revealRoot.add(revealMesh, nestedRegisteredRevealRoot)

    const overlappingRoot = new Group()
    const overlappingMesh = new Mesh()
    overlappingRoot.add(overlappingMesh)

    const meshes = collectLandrushIslandMaterialPresentationReadinessMeshes({
      floorRoots: [floorRoot, floorRoot, overlappingRoot],
      registeredNodeRoots: new Set([
        floorRoot,
        registeredFloorDescendant,
        revealRoot,
        nestedRegisteredRevealRoot,
        overlappingRoot,
      ]),
      revealRoots: [revealRoot, revealRoot, overlappingRoot],
    })

    expect(new Set(meshes.map(({ mesh }) => mesh)).size).toBe(meshes.length)
    expect(meshes).toContainEqual({ floor: true, mesh: floorMesh, reveal: false })
    expect(meshes).toContainEqual({ floor: true, mesh: registeredFloorMesh, reveal: false })
    expect(meshes).toContainEqual({ floor: false, mesh: revealMesh, reveal: true })
    expect(meshes).toContainEqual({ floor: true, mesh: overlappingMesh, reveal: true })
    expect(meshes.some(({ mesh }) => mesh === nestedRevealMesh)).toBe(false)
  })

  test('registers only after scene readiness and releases only the detached representatives', () => {
    const registry = createZombieEscapeRenderReadinessRegistry([
      LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
    ])
    const owner = new LandrushIslandMaterialPresentationOwner()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
    const worldGeometry = new BoxGeometry()
    const worldMaterial = new MeshStandardMaterial()
    const worldMesh = new Mesh(worldGeometry, worldMaterial)
    worldMesh.name = 'natural-road-sidewalks'
    const worldRoot = new Scene()
    worldRoot.add(worldMesh)
    const productionLights = mountProductionNightStreetLights(
      worldRoot,
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
    )
    let geometryDisposed = false
    let materialDisposed = false
    geometry.addEventListener('dispose', () => {
      geometryDisposed = true
    })
    material.addEventListener('dispose', () => {
      materialDisposed = true
    })

    const gatedCleanup = registerLandrushIslandMaterialPresentationRenderReadiness({
      meshes: [{ floor: false, mesh, reveal: true }],
      owner,
      ready: false,
      registry,
    })

    expect(gatedCleanup).toBeUndefined()
    expect(registry.getSnapshot().complete).toBe(false)
    expect(owner.ownedMaterialCount).toBe(0)

    const cleanup = registerLandrushIslandMaterialPresentationRenderReadiness({
      meshes: [{ floor: false, mesh, reveal: true }],
      owner,
      ready: true,
      registry,
      worldRoot,
    })
    const dayRepresentative = registry
      .getSnapshot()
      .representatives.find(
        ({ key }) => key === LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      )?.root
    const nightRepresentative = registry
      .getSnapshot()
      .representatives.find(
        ({ key }) => key === LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      )?.root

    expect(cleanup).toBeFunction()
    expect(registry.getSnapshot().complete).toBe(true)
    expect(dayRepresentative).toBeInstanceOf(Group)
    expect(dayRepresentative?.parent).toBeNull()
    expect(dayRepresentative?.children.length).toBeGreaterThan(0)
    for (const child of dayRepresentative?.children ?? []) {
      expect((child as Mesh).geometry).toBe(geometry)
    }
    const nightMaterials = new Set()
    nightRepresentative?.traverse((object) => {
      const renderable = object as Mesh
      if (renderable.isMesh) nightMaterials.add(renderable.material)
    })
    expect(nightMaterials).toContain(worldMaterial)
    expect(nightRepresentative?.getObjectByProperty('geometry', geometry)).toBeUndefined()

    cleanup?.()
    cleanup?.()

    expect(registry.getSnapshot().complete).toBe(false)
    expect(dayRepresentative?.children).toHaveLength(0)
    expect(nightRepresentative?.children).toHaveLength(0)
    expect(geometryDisposed).toBe(false)
    expect(materialDisposed).toBe(false)
    expect(productionLights.disposedCount()).toBe(0)

    owner.dispose()
    productionLights.dispose()
    geometry.dispose()
    material.dispose()
    worldGeometry.dispose()
    worldMaterial.dispose()
  })

  test('compiles the exact mounted production topology without adding representative lights', () => {
    for (const quality of ['low', 'balanced', 'high'] as const) {
      const registry = createZombieEscapeRenderReadinessRegistry([
        LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
        LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      ])
      const owner = new LandrushIslandMaterialPresentationOwner()
      const worldRoot = new Scene()
      expect(
        registerLandrushIslandMaterialPresentationRenderReadiness({
          meshes: [],
          owner,
          quality,
          ready: true,
          registry,
          worldRoot,
        }),
      ).toBeUndefined()
      const productionLights = mountProductionNightStreetLights(
        worldRoot,
        LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS[quality],
      )
      const cleanup = registerLandrushIslandMaterialPresentationRenderReadiness({
        meshes: [],
        owner,
        quality,
        ready: true,
        registry,
        worldRoot,
      })
      const nightRepresentative = registry
        .getSnapshot()
        .representatives.find(
          ({ key }) =>
            key === LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
        )?.root
      const representativeLights = collectSpotLights(nightRepresentative)
      const targetSceneLights = collectSpotLights(worldRoot)
      for (const light of targetSceneLights) {
        expect(light.intensity).toBe(0)
        expect(light.castShadow).toBe(false)
        expect(light.layers.mask).toBe(1)
        expect(light.target.parent).toBe(light.parent)
      }

      expect(representativeLights).toHaveLength(0)
      expect(targetSceneLights).toHaveLength(LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS[quality])
      expect([...representativeLights, ...targetSceneLights]).toHaveLength(
        LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS[quality],
      )
      cleanup?.()
      cleanup?.()
      expect(nightRepresentative?.children).toHaveLength(0)
      expect(productionLights.disposedCount()).toBe(0)
      owner.dispose()
      productionLights.dispose()
    }
    expect(LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS).toEqual({ balanced: 12, high: 16, low: 8 })
  })

  test('tears down synthetic representatives without corrupting the live removal event', () => {
    const registry = createZombieEscapeRenderReadinessRegistry([
      LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
    ])
    const owner = new LandrushIslandMaterialPresentationOwner()
    const worldRoot = new Scene()
    const generatedRoot = new Group()
    generatedRoot.userData.__fromGeometry = true
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
    mesh.name = 'natural-road-sidewalks'
    generatedRoot.add(mesh)
    worldRoot.add(generatedRoot)
    const productionLights = mountProductionNightStreetLights(
      worldRoot,
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
    )
    let cleanup: (() => void) | undefined
    const stopObserving = observeLandrushZombieNightWorld(worldRoot, () => {
      cleanup?.()
      cleanup = undefined
    })
    owner.acquireFloorFade(mesh)
    cleanup = registerLandrushIslandMaterialPresentationRenderReadiness({
      meshes: [{ floor: true, mesh, reveal: false }],
      owner,
      ready: true,
      registry,
      worldRoot,
    })
    const representatives = registry.getSnapshot().representatives.map(({ root }) => root)
    let syntheticRemovalEvents = 0
    for (const representative of representatives) {
      representative.traverse((object) => {
        object.addEventListener('childremoved', () => {
          syntheticRemovalEvents += 1
        })
      })
    }
    let laterRemovedChild: Object3D | null = null
    worldRoot.addEventListener('childremoved', (event) => {
      laterRemovedChild = event.child
      expect(owner.activeBindingCount).toBe(0)
      expect(mesh.material).toBe(material)
    })

    expect(() => worldRoot.remove(generatedRoot)).not.toThrow()
    expect(laterRemovedChild).toBe(generatedRoot)
    expect(syntheticRemovalEvents).toBe(0)
    expect(registry.getSnapshot().complete).toBe(false)
    expect(representatives.every((representative) => representative.children.length === 0)).toBe(
      true,
    )

    stopObserving()
    cleanup?.()
    owner.dispose()
    productionLights.dispose()
    geometry.dispose()
    material.dispose()
  })

  test('reconciles both topology observers after an earlier nested removal clears the event child', () => {
    const worldRoot = new Scene()
    const generatedRoot = new Group()
    generatedRoot.userData.landrushZombieNight = true
    generatedRoot.userData[LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY] = 1
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
    mesh.name = 'natural-road-sidewalks'
    generatedRoot.add(mesh)
    worldRoot.add(generatedRoot)
    const nestedParent = new Group()
    const nestedChild = new Group()
    nestedParent.add(nestedChild)
    worldRoot.addEventListener('childremoved', () => {
      nestedParent.remove(nestedChild)
    })
    let surfaceChanges = 0
    let topologyChanges = 0
    const stopSurfaceObserver = observeLandrushZombieNightWorld(worldRoot, () => {
      surfaceChanges += 1
    })
    const stopTopologyObserver = observeLandrushZombieNightReadinessLightTopology(worldRoot, () => {
      topologyChanges += 1
    })

    expect(() => worldRoot.remove(generatedRoot)).not.toThrow()
    expect(surfaceChanges).toBe(1)
    expect(topologyChanges).toBe(1)
    const detachedRelevantChild = new Group()
    detachedRelevantChild.userData.landrushZombieNight = true
    detachedRelevantChild.userData[
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY
    ] = 1
    generatedRoot.add(detachedRelevantChild)
    expect(surfaceChanges).toBe(1)
    expect(topologyChanges).toBe(1)

    stopTopologyObserver()
    stopSurfaceObserver()
    geometry.dispose()
    material.dispose()
  })

  test('tracks async nested mount and removal while accepting sparse and zero plans', () => {
    const worldRoot = new Scene()
    let changes = 0
    const stopObserving = observeLandrushZombieNightReadinessLightTopology(worldRoot, () => {
      changes += 1
    })
    const presentationRoot = createProductionNightStreetLightRoot(0)
    worldRoot.add(presentationRoot)
    expect(changes).toBe(1)
    expect(readLandrushZombieNightReadinessLightTopology(worldRoot, 'balanced')).toMatchObject({
      mountedCount: 0,
      plannedCount: 0,
      ready: true,
    })

    presentationRoot.userData[LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY] =
      2
    const first = addProductionNightSpotLight(presentationRoot)
    expect(changes).toBe(2)
    expect(readLandrushZombieNightReadinessLightTopology(worldRoot, 'balanced').ready).toBe(false)
    const second = addProductionNightSpotLight(presentationRoot)
    expect(changes).toBe(3)
    expect(readLandrushZombieNightReadinessLightTopology(worldRoot, 'balanced')).toMatchObject({
      capacity: 12,
      mountedCount: 2,
      plannedCount: 2,
      ready: true,
    })

    second.removeFromParent()
    expect(changes).toBe(4)
    expect(readLandrushZombieNightReadinessLightTopology(worldRoot, 'balanced').ready).toBe(false)
    stopObserving()
    first.dispose()
    second.dispose()
  })
})

function createProductionNightStreetLightRoot(plannedCount: number) {
  const root = new Group()
  root.userData.landrushZombieNight = true
  root.userData[LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_PLANNED_COUNT_USER_DATA_KEY] = plannedCount
  return root
}

function addProductionNightSpotLight(root: Object3D) {
  const placement = new Group()
  const light = new SpotLight('#ffc36e', 0, 11.5, 0.92, 0.68, 2)
  light.castShadow = false
  light.userData.landrushZombieNight = true
  placement.add(light, light.target)
  root.add(placement)
  return light
}

function mountProductionNightStreetLights(worldRoot: Object3D, count: number) {
  const root = createProductionNightStreetLightRoot(count)
  const lights = Array.from({ length: count }, () => addProductionNightSpotLight(root))
  let disposed = 0
  for (const light of lights) {
    light.addEventListener('dispose', () => {
      disposed += 1
    })
  }
  worldRoot.add(root)
  return {
    dispose() {
      root.removeFromParent()
      for (const light of lights) light.dispose()
    },
    disposedCount: () => disposed,
  }
}

function collectSpotLights(root: Object3D | null | undefined) {
  const lights: SpotLight[] = []
  root?.traverse((object) => {
    if ((object as SpotLight).isSpotLight) lights.push(object as SpotLight)
  })
  return lights
}
