import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  Group,
  type InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  type SpotLight,
} from 'three'
import { color } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  applyLandrushZombieNightSurfaceColorBindings,
  createLandrushZombieNightBeaconRenderReadinessRepresentative,
  createLandrushZombieNightLightTopology,
  createLandrushZombieNightSurfaceRenderReadinessRepresentative,
  inheritLandrushZombieNightSurfaceMaterial,
  LANDRUSH_ZOMBIE_NIGHT_SPOT_LIGHT_COUNTS,
  notifyLandrushZombieNightSurfaceMaterialChange,
  observeLandrushZombieNightWorld,
  prepareLandrushZombieNightSurfaceMaterials,
  readPreparedLandrushZombieNightSurfaceRole,
  setLandrushZombieNightSurfaceAmount,
  setLandrushZombieNightSurfaceSunsetUniformAmount,
  setLandrushZombieNightSurfaceUniformAmount,
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

  test('tints the stable classic grass-ground material identity through the night envelope', () => {
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial({ color: '#ffffff' })
    const mesh = new Mesh(geometry, material)
    mesh.name = 'landrush-grass-ground'
    setLandrushZombieNightSurfaceAmount(0)

    try {
      expect(prepareLandrushZombieNightSurfaceMaterials(mesh, [material])).toBe(1)
      expect(readPreparedLandrushZombieNightSurfaceRole(material)).toBe('grass-ground')

      setLandrushZombieNightSurfaceAmount(1)
      expect(mesh.material).toBe(material)
      expect(mesh.name).toBe('landrush-grass-ground')
      expect(material.color.getHex()).toBe(0x6c7f9e)

      setLandrushZombieNightSurfaceAmount(0)
      expect(material.color.getHex()).toBe(0xffffff)
    } finally {
      setLandrushZombieNightSurfaceAmount(0)
      material.dispose()
      geometry.dispose()
    }
  })

  test('applies sunset tint only to classic grass ground before the night envelope begins', () => {
    const geometry = new BoxGeometry()
    const groundMaterial = new MeshBasicMaterial({ color: '#ffffff' })
    const curbsideMaterial = new MeshBasicMaterial({ color: '#ffffff' })
    const ground = new Mesh(geometry, groundMaterial)
    const curbside = new Mesh(geometry, curbsideMaterial)
    ground.name = 'landrush-grass-ground'
    curbside.name = 'natural-road-sidewalks'
    setLandrushZombieNightSurfaceAmount(0)

    try {
      expect(prepareLandrushZombieNightSurfaceMaterials(ground, [groundMaterial])).toBe(1)
      expect(prepareLandrushZombieNightSurfaceMaterials(curbside, [curbsideMaterial])).toBe(1)

      setLandrushZombieNightSurfaceSunsetUniformAmount(1)
      applyLandrushZombieNightSurfaceColorBindings()
      expect(groundMaterial.color.getHex()).toBe(0xefb99f)
      expect(curbsideMaterial.color.getHex()).toBe(0xffffff)

      setLandrushZombieNightSurfaceSunsetUniformAmount(0)
      applyLandrushZombieNightSurfaceColorBindings()
      expect(groundMaterial.color.getHex()).toBe(0xffffff)
      expect(curbsideMaterial.color.getHex()).toBe(0xffffff)
    } finally {
      setLandrushZombieNightSurfaceAmount(0)
      groundMaterial.dispose()
      curbsideMaterial.dispose()
      geometry.dispose()
    }
  })

  test('keeps ordinary color materials off the per-frame uniform path until a bounded flush', () => {
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial({ color: '#ffffff' })
    const mesh = new Mesh(geometry, material)
    mesh.name = 'natural-road-sidewalks'
    prepareLandrushZombieNightSurfaceMaterials(mesh, [material])

    setLandrushZombieNightSurfaceAmount(0)
    setLandrushZombieNightSurfaceUniformAmount(0.75)
    expect(material.color.getHex()).toBe(0xffffff)

    applyLandrushZombieNightSurfaceColorBindings()
    expect(material.color.getHex()).not.toBe(0xffffff)

    setLandrushZombieNightSurfaceAmount(0)
    material.dispose()
    geometry.dispose()
  })

  test('builds beacon materials separately from every disposable runtime light topology', () => {
    const representative = createLandrushZombieNightBeaconRenderReadinessRepresentative()
    const spotLights: SpotLight[] = []
    representative.root.traverse((child) => {
      if ((child as SpotLight).isSpotLight === true) spotLights.push(child as SpotLight)
    })
    const meshes = representative.root.children.filter((child) => (child as Mesh).isMesh === true)

    expect(spotLights).toHaveLength(0)
    expect(meshes).toHaveLength(5)
    const fixtureMaterial = (meshes[0] as Mesh).material as MeshStandardMaterial
    expect(fixtureMaterial.isMeshStandardMaterial).toBe(true)
    expect(fixtureMaterial.transparent).toBe(false)
    expect(fixtureMaterial.depthWrite).toBe(true)
    expect(fixtureMaterial.opacity).toBe(1)
    expect(fixtureMaterial.map).not.toBeNull()
    expect(fixtureMaterial.metalnessMap).not.toBeNull()
    expect(fixtureMaterial.normalMap).not.toBeNull()
    expect(fixtureMaterial.roughnessMap).not.toBeNull()
    expect(fixtureMaterial.emissiveMap).not.toBeNull()
    const groundPoolMaterial = (meshes[4] as Mesh).material as MeshBasicMaterial
    expect((meshes[4] as InstancedMesh).isInstancedMesh).toBe(true)
    expect((meshes[4] as InstancedMesh).instanceColor).not.toBeNull()
    expect(groundPoolMaterial.isMeshBasicMaterial).toBe(true)
    expect(groundPoolMaterial.map).not.toBeNull()
    expect(groundPoolMaterial.map?.colorSpace).toBe(NoColorSpace)
    expect(groundPoolMaterial.map?.name).toBe('landrush-zombie-night-ground-pool')
    expect(groundPoolMaterial.transparent).toBe(true)
    expect(groundPoolMaterial.depthWrite).toBe(false)
    representative.dispose()
    representative.dispose()
    expect(representative.root.children).toHaveLength(0)

    expect(LANDRUSH_ZOMBIE_NIGHT_SPOT_LIGHT_COUNTS).toEqual([
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.low,
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
      LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.high,
    ])
    for (const count of LANDRUSH_ZOMBIE_NIGHT_SPOT_LIGHT_COUNTS) {
      const topology = createLandrushZombieNightLightTopology(count)
      const spotLights: SpotLight[] = []
      topology.root.traverse((child) => {
        if ((child as SpotLight).isSpotLight) spotLights.push(child as SpotLight)
      })
      let disposedLights = 0
      expect(topology.root.visible).toBe(true)
      expect(spotLights).toHaveLength(count)
      expect(topology.root.children).toHaveLength(count * 2)
      for (const light of spotLights) {
        expect(light.intensity).toBe(0)
        expect(light.castShadow).toBe(false)
        expect(light.target.parent).toBe(topology.root)
        light.addEventListener('dispose', () => {
          disposedLights += 1
        })
      }
      topology.dispose()
      topology.dispose()
      expect(topology.root.children).toHaveLength(0)
      expect(
        spotLights.every((light) => light.parent === null && light.target.parent === null),
      ).toBe(true)
      expect(disposedLights).toBe(count)
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
