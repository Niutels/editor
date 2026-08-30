import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'
import {
  collectLandrushIslandMaterialPresentationReadinessMeshes,
  LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  registerLandrushIslandMaterialPresentationRenderReadiness,
} from './landrush-island-material-presentation-readiness'
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
    expect(clientSource).toContain('viewerSceneReady={materialPresentationReadinessReady}')
    expect(clientSource).toContain('<LandrushIslandDayMaterialPresentationRenderReadiness')
    expect(readinessSource).toContain('coordinator.invalidate()')
    expect(readinessSource).toContain('root.clear()')
    expect(readinessSource).toContain(
      '[camera, generation, gl, meshes, onReadinessChange, owner, ready, scene]',
    )
    expect(readinessSource).toContain('[meshGeneration, meshes, owner, ready, registry, scene]')
    expect(readinessSource).toContain('registrationCleanupRef.current?.()')
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
    const worldRoot = new Group()
    worldRoot.add(worldMesh)
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

    owner.dispose()
    geometry.dispose()
    material.dispose()
    worldGeometry.dispose()
    worldMaterial.dispose()
  })
})
