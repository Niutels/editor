import { Texture } from 'three'
import { describe, expect, test } from 'vitest'
import {
  createBoundedStylizedGrassGroundMaterial,
  updateBoundedStylizedGrassGroundMaterial,
} from './stylized-grass-ground-material'

describe('bounded Zombie stylized grass material', () => {
  test('keeps one classic material identity while the progressive mask texture changes', () => {
    const previewMask = new Texture()
    const finalMask = new Texture()
    const material = createBoundedStylizedGrassGroundMaterial('#ffffff', previewMask)
    let disposals = 0
    material.addEventListener('dispose', () => {
      disposals += 1
    })

    expect(material.isMeshBasicMaterial).toBe(true)
    expect('colorNode' in material).toBe(false)
    expect(material.map).toBe(previewMask)
    expect(material.name).toBe('zombie-bounded-stylized-grass-ground')
    expect(material.userData.landrushProceduralStylizedGrass).toEqual({
      complexity: 'bounded-texture-mask',
      coordinateSpace: 'uv',
    })

    expect(updateBoundedStylizedGrassGroundMaterial(material, '#93a64f', finalMask)).toBe(material)
    expect(material.map).toBe(finalMask)
    expect(material.color.getHexString()).toBe('93a64f')

    material.dispose()
    expect(disposals).toBe(1)
    previewMask.dispose()
    finalMask.dispose()
  })
})
