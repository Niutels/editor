import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type PointLight } from 'three'
import { color } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  createLandrushZombieNightBeaconRenderReadinessRepresentative,
  createLandrushZombieNightLightTopology,
  createLandrushZombieNightSurfaceRenderReadinessRepresentative,
  inheritLandrushZombieNightSurfaceMaterial,
  LANDRUSH_ZOMBIE_NIGHT_POINT_LIGHT_COUNTS,
  notifyLandrushZombieNightSurfaceMaterialChange,
  observeLandrushZombieNightWorld,
  prepareLandrushZombieNightSurfaceMaterials,
  readPreparedLandrushZombieNightSurfaceRole,
  setLandrushZombieNightSurfaceAmount,
} from './landrush-zombie-night-presentation-material'
import { LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS } from './landrush-zombie-night-presentation-state'

describe('Landrush zombie night material preparation', () => {
  test('installs one stable node graph before amount-only runtime updates', () => {
    const geometry = new BoxGeometry()
    const material = new MeshStandardNodeMaterial()
    material.colorNode = color('#ffffff')
    const mesh = new Mesh(geometry, material)
    mesh.name = 'landrush-grass-ground'

    expect(prepareLandrushZombieNightSurfaceMaterials(mesh, [material])).toBe(1)
    const preparedColorNode = material.colorNode
    const preparedVersion = material.version

    setLandrushZombieNightSurfaceAmount(1)
    setLandrushZombieNightSurfaceAmount(0.25)
    expect(material.colorNode).toBe(preparedColorNode)
    expect(material.version).toBe(preparedVersion)
    expect(prepareLandrushZombieNightSurfaceMaterials(mesh, [material])).toBe(1)
    expect(material.colorNode).toBe(preparedColorNode)
    expect(material.version).toBe(preparedVersion)

    const clone = material.clone()
    expect(inheritLandrushZombieNightSurfaceMaterial(material, clone)).toBe(true)
    expect(clone.colorNode).toBe(preparedColorNode)
    expect(readPreparedLandrushZombieNightSurfaceRole(clone)).toBe('grass-ground')

    setLandrushZombieNightSurfaceAmount(0)
    clone.dispose()
    material.dispose()
    geometry.dispose()
  })

  test('keeps classic material clones on the same reversible color envelope', () => {
    const geometry = new BoxGeometry()
    const source = new MeshStandardMaterial({ color: '#ffffff' })
    const mesh = new Mesh(geometry, source)
    mesh.name = 'natural-road-sidewalks'
    prepareLandrushZombieNightSurfaceMaterials(mesh, [source])

    setLandrushZombieNightSurfaceAmount(1)
    const clone = source.clone()
    inheritLandrushZombieNightSurfaceMaterial(source, clone)
    expect(clone.color.getHex()).toBe(source.color.getHex())
    expect(clone.color.getHex()).not.toBe(0xffffff)

    setLandrushZombieNightSurfaceAmount(0)
    expect(source.color.getHex()).toBe(0xffffff)
    expect(clone.color.getHex()).toBe(0xffffff)

    clone.dispose()
    source.dispose()
    geometry.dispose()
  })

  test('builds beacon materials separately from every disposable runtime light topology', () => {
    const representative = createLandrushZombieNightBeaconRenderReadinessRepresentative()
    const pointLights: PointLight[] = []
    representative.root.traverse((child) => {
      if ((child as PointLight).isPointLight === true) pointLights.push(child as PointLight)
    })
    const meshes = representative.root.children.filter((child) => (child as Mesh).isMesh === true)

    expect(pointLights).toHaveLength(0)
    expect(meshes).toHaveLength(4)
    expect(
      meshes
        .map((mesh) => (mesh as Mesh).material as MeshStandardMaterial)
        .every(
          (material) =>
            material.transparent && material.depthWrite === false && material.opacity === 0,
        ),
    ).toBe(true)
    representative.dispose()
    representative.dispose()
    expect(representative.root.children).toHaveLength(0)

    expect(LANDRUSH_ZOMBIE_NIGHT_POINT_LIGHT_COUNTS).toEqual([
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.low,
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.high,
    ])
    for (const count of LANDRUSH_ZOMBIE_NIGHT_POINT_LIGHT_COUNTS) {
      const topology = createLandrushZombieNightLightTopology(count)
      expect(topology.root.children).toHaveLength(count)
      topology.dispose()
      topology.dispose()
      expect(topology.root.children).toHaveLength(0)
    }
  })

  test('tracks surface additions and material swaps without representing unrelated world meshes', () => {
    const world = new Group()
    const nested = new Group()
    world.add(nested)
    let generationChanges = 0
    const stopObserving = observeLandrushZombieNightWorld(world, () => {
      generationChanges += 1
    })
    const grassGeometry = new BoxGeometry()
    const grassMaterial = new MeshStandardNodeMaterial()
    grassMaterial.colorNode = color('#ffffff')
    const grass = new Mesh(grassGeometry, grassMaterial)
    grass.name = 'landrush-grass-ground'
    nested.add(grass)

    expect(generationChanges).toBe(1)
    expect(readPreparedLandrushZombieNightSurfaceRole(grassMaterial)).toBe('grass-ground')
    const stableColorNode = grassMaterial.colorNode
    const stableVersion = grassMaterial.version
    setLandrushZombieNightSurfaceAmount(1)
    expect(grassMaterial.colorNode).toBe(stableColorNode)
    expect(grassMaterial.version).toBe(stableVersion)

    const unrelatedGeometry = new BoxGeometry()
    const unrelatedMaterial = new MeshStandardMaterial()
    const unrelated = new Mesh(unrelatedGeometry, unrelatedMaterial)
    world.add(unrelated)
    expect(generationChanges).toBe(1)

    const bakedMaterial = new MeshStandardMaterial({ color: '#ffffff' })
    grass.material = bakedMaterial
    expect(notifyLandrushZombieNightSurfaceMaterialChange(grass)).toBe(true)
    expect(generationChanges).toBe(2)
    expect(readPreparedLandrushZombieNightSurfaceRole(bakedMaterial)).toBe('grass-ground')

    stopObserving()
    const duplicate = new Mesh(grassGeometry, bakedMaterial)
    duplicate.name = 'landrush-grass-ground'
    world.add(duplicate)
    const representative = createLandrushZombieNightSurfaceRenderReadinessRepresentative(world)
    const representedMaterials = representative.children.map((child) => (child as Mesh).material)
    expect(representedMaterials.filter((material) => material === bakedMaterial)).toHaveLength(1)
    expect(representedMaterials).not.toContain(unrelatedMaterial)

    nested.remove(grass)
    expect(generationChanges).toBe(2)
    setLandrushZombieNightSurfaceAmount(0)
    grassMaterial.dispose()
    bakedMaterial.dispose()
    unrelatedMaterial.dispose()
    grassGeometry.dispose()
    unrelatedGeometry.dispose()
  })
})
