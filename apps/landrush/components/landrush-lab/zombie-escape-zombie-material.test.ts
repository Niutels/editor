import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  BoxGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three'
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import {
  createLandrushRobotShoulderTorchLightingState,
  updateLandrushRobotShoulderTorchLightingState,
} from './landrush-robot-shoulder-torch'
import { LANDRUSH_ZOMBIE_NIGHT_SHIPPING_OUTSIDE_TORCH_VISIBILITY } from './landrush-zombie-night-presentation-state'
import {
  createZombieEscapeZombieShader,
  ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE,
} from './zombie-escape-zombie-material'

describe('zombie phase material shader', () => {
  test('preserves the authored PBR texture while adding reusable zombie nodes', () => {
    const geometry = new BoxGeometry(1, 2, 0.5)
    const map = new Texture()
    const metalnessMap = new Texture()
    const roughnessMap = new Texture()
    const source = new MeshStandardMaterial({
      color: '#cfa98c',
      emissive: '#110407',
      emissiveIntensity: 0.35,
      emissiveMap: map,
      map,
      metalness: 0.08,
      metalnessMap,
      roughness: 0.61,
      roughnessMap,
    })
    const shader = createZombieEscapeZombieShader({ phaseAmount: 0 })
    const first = shader.createMaterial(source, geometry, 4)
    const second = shader.createMaterial(source, geometry, 4)

    expect(first).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(first).not.toBe(source)
    expect((first as MeshStandardNodeMaterial).map).toBe(map)
    expect((first as MeshStandardNodeMaterial).color.getHex()).toBe(source.color.getHex())
    expect((first as MeshStandardNodeMaterial).emissive.getHex()).toBe(source.emissive.getHex())
    expect((first as MeshStandardNodeMaterial).emissiveIntensity).toBe(source.emissiveIntensity)
    expect((first as MeshStandardNodeMaterial).emissiveMap).toBe(map)
    expect((first as MeshStandardNodeMaterial).metalness).toBe(source.metalness)
    expect((first as MeshStandardNodeMaterial).metalnessMap).toBe(metalnessMap)
    expect((first as MeshStandardNodeMaterial).roughness).toBe(source.roughness)
    expect((first as MeshStandardNodeMaterial).roughnessMap).toBe(roughnessMap)
    expect((first as MeshStandardNodeMaterial).colorNode).toBe(
      (second as MeshStandardNodeMaterial).colorNode,
    )
    expect((first as MeshStandardNodeMaterial).roughnessNode).toBe(
      (second as MeshStandardNodeMaterial).roughnessNode,
    )
    expect((first as MeshStandardNodeMaterial).metalnessNode).toBe(
      (second as MeshStandardNodeMaterial).metalnessNode,
    )
    expect(first.userData.zombieTextureShader).toEqual({
      debugMode: 'final',
      outsideTorchVisibility: 1,
      phaseScoped: true,
      response: ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE,
      seed: 4,
      torchScoped: false,
    })

    first.dispose()
    second.dispose()
    source.dispose()
    map.dispose()
    metalnessMap.dispose()
    roughnessMap.dispose()
    geometry.dispose()
  })

  test('mixes mapped source PBR channels into a nonmetal zombie response', () => {
    const sourceText = readFileSync(
      new URL('./zombie-escape-zombie-material.ts', import.meta.url),
      'utf8',
    )

    expect(sourceText).toContain('const sourceMetalness = materialMetalness')
    expect(sourceText).toContain('const sourceRoughness = materialRoughness')
    expect(sourceText).not.toContain("materialReference('roughness'")
    expect(sourceText).toContain('material.metalnessNode = graph.metalnessNode')
    expect(sourceText).toMatch(
      /metalnessNode: mix\(\s*sourceMetalness,\s*ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE\.zombieMetalness,\s*phaseNode,\s*\)/,
    )
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.zombieMetalness).toBeGreaterThanOrEqual(0)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.zombieMetalness).toBeLessThanOrEqual(0.05)
  })

  test('adds a stable real-torch visibility field for shipping zombie attenuation', () => {
    const geometry = new BoxGeometry()
    const source = new MeshStandardMaterial()
    const shader = createZombieEscapeZombieShader({
      outsideTorchVisibility: LANDRUSH_ZOMBIE_NIGHT_SHIPPING_OUTSIDE_TORCH_VISIBILITY,
      phaseAmount: 1,
    })
    const material = shader.createMaterial(source, geometry, 3) as MeshStandardNodeMaterial
    const colorNode = material.colorNode
    const emissiveNode = material.emissiveNode
    const torchState = createLandrushRobotShoulderTorchLightingState()

    updateLandrushRobotShoulderTorchLightingState(
      torchState,
      true,
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 2, z: 7 },
    )
    shader.setTorchLighting(torchState)

    expect(shader.getOutsideTorchVisibility()).toBe(0.8)
    expect(material.colorNode).toBe(colorNode)
    expect(material.emissiveNode).toBe(emissiveNode)
    expect(material.userData.zombieTextureShader).toEqual({
      debugMode: 'final',
      outsideTorchVisibility: 0.8,
      phaseScoped: true,
      response: ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE,
      seed: 3,
      torchScoped: true,
    })

    shader.setTorchLighting(null)
    expect(material.colorNode).toBe(colorNode)

    material.dispose()
    source.dispose()
    geometry.dispose()
  })

  test('gives real lights ownership at full zombie phase while retaining mapped detail', () => {
    const geometry = new BoxGeometry(1, 2, 0.5)
    const map = new Texture()
    const source = new MeshStandardMaterial({
      color: '#d9b18c',
      emissive: '#ffffff',
      emissiveMap: map,
      map,
      metalness: 1,
      roughness: 0.55,
    })
    const shader = createZombieEscapeZombieShader({ phaseAmount: 1 })
    const material = shader.createMaterial(source, geometry, 11) as MeshStandardNodeMaterial

    expect(material.map).toBe(map)
    expect(material.emissiveMap).toBe(map)
    expect(material.metalness).toBe(1)
    expect(material.metalnessNode).toBeDefined()
    expect(material.userData.zombieTextureShader.response).toBe(
      ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE,
    )
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.sourceEmissiveRetentionAtFullPhase).toBeLessThan(
      0.005,
    )
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.clothingTextureRetention).toBe(0.82)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.clothingBruiseResponse).toBeGreaterThanOrEqual(
      0.4,
    )
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.clothingVeinResponse).toBeGreaterThanOrEqual(0.25)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.tissueTextureRetention).toBe(0.04)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.cadaverDetailFloor).toBeGreaterThan(0.5)
    expect(
      ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.cadaverDetailFloor +
        ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.cadaverDetailRange,
    ).toBeGreaterThanOrEqual(1)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.zombieRoughnessFloor).toBeGreaterThanOrEqual(0.7)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.dryRoughnessTissue).toBeGreaterThan(
      ZOMBIE_ESCAPE_ZOMBIE_MATERIAL_RESPONSE.dryRoughnessMottle,
    )

    material.dispose()
    source.dispose()
    map.dispose()
    geometry.dispose()
  })

  test('clamps one shared phase weight without rebuilding materials', () => {
    const geometry = new BoxGeometry()
    const source = new MeshStandardMaterial()
    const shader = createZombieEscapeZombieShader({ phaseAmount: -2 })
    const material = shader.createMaterial(source, geometry, 0)

    expect(shader.getPhaseAmount()).toBe(0)
    shader.setPhaseAmount(0.42)
    expect(shader.getPhaseAmount()).toBe(0.42)
    shader.setPhaseAmount(8)
    expect(shader.getPhaseAmount()).toBe(1)
    shader.setPhaseAmount(Number.NaN)
    expect(shader.getPhaseAmount()).toBe(0)
    expect(material).toBeInstanceOf(MeshStandardNodeMaterial)

    material.dispose()
    source.dispose()
    geometry.dispose()
  })

  test('keeps physical extensions and leaves unsupported materials on their native path', () => {
    const geometry = new BoxGeometry()
    const shader = createZombieEscapeZombieShader({ phaseAmount: 1 })
    const physicalSource = new MeshPhysicalMaterial({ clearcoat: 0.4, transmission: 0.2 })
    const basicSource = new MeshBasicMaterial({ color: '#d7b493' })
    const physical = shader.createMaterial(physicalSource, geometry, 2)
    const basic = shader.createMaterial(basicSource, geometry, 2)

    expect(physical).toBeInstanceOf(MeshPhysicalNodeMaterial)
    expect((physical as MeshPhysicalNodeMaterial).clearcoat).toBe(0.4)
    expect((physical as MeshPhysicalNodeMaterial).transmission).toBe(0.2)
    expect(basic).toBeInstanceOf(MeshBasicMaterial)
    expect(basic).not.toBe(basicSource)

    physical.dispose()
    basic.dispose()
    physicalSource.dispose()
    basicSource.dispose()
    geometry.dispose()
  })
})
