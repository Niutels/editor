import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'
import {
  collectLandrushIslandMaterialPresentationReadinessMeshes,
  LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  registerLandrushIslandMaterialPresentationRenderReadiness,
} from './landrush-island-material-presentation-readiness'
import { createZombieEscapeRenderReadinessRegistry } from './zombie-escape-render-readiness'

describe('Landrush island material presentation render readiness', () => {
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
    ])
    const owner = new LandrushIslandMaterialPresentationOwner()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
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
    })
    const representative = registry.getSnapshot().representatives[0]?.root

    expect(cleanup).toBeFunction()
    expect(registry.getSnapshot().complete).toBe(true)
    expect(representative).toBeInstanceOf(Group)
    expect(representative?.parent).toBeNull()
    expect(representative?.children.length).toBeGreaterThan(0)
    for (const child of representative?.children ?? []) {
      expect((child as Mesh).geometry).toBe(geometry)
    }

    cleanup?.()
    cleanup?.()

    expect(registry.getSnapshot().complete).toBe(false)
    expect(representative?.children).toHaveLength(0)
    expect(geometryDisposed).toBe(false)
    expect(materialDisposed).toBe(false)

    owner.dispose()
    geometry.dispose()
    material.dispose()
  })
})
