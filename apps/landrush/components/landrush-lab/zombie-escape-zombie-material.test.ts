import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three'
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

describe('zombie phase material shader', () => {
  test('preserves the authored PBR texture while adding reusable zombie nodes', () => {
    const geometry = new BoxGeometry(1, 2, 0.5)
    const map = new Texture()
    const source = new MeshStandardMaterial({
      color: '#cfa98c',
      emissive: '#110407',
      emissiveIntensity: 0.35,
      map,
      metalness: 0.08,
      roughness: 0.61,
    })
    const shader = createZombieEscapeZombieShader({ phaseAmount: 0 })
    const first = shader.createMaterial(source, geometry, 4)
    const second = shader.createMaterial(source, geometry, 4)

    expect(first).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(first).not.toBe(source)
    expect((first as MeshStandardNodeMaterial).map).toBe(map)
    expect((first as MeshStandardNodeMaterial).color.getHex()).toBe(source.color.getHex())
    expect((first as MeshStandardNodeMaterial).emissive.getHex()).toBe(source.emissive.getHex())
    expect((first as MeshStandardNodeMaterial).roughness).toBe(source.roughness)
    expect((first as MeshStandardNodeMaterial).colorNode).toBe(
      (second as MeshStandardNodeMaterial).colorNode,
    )
    expect((first as MeshStandardNodeMaterial).roughnessNode).toBe(
      (second as MeshStandardNodeMaterial).roughnessNode,
    )
    expect(first.userData.zombieTextureShader).toEqual({
      debugMode: 'final',
      phaseScoped: true,
      seed: 4,
    })

    first.dispose()
    second.dispose()
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
