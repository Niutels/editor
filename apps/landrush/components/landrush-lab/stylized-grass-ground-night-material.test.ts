import { describe, expect, test } from 'bun:test'
import { DataTexture, RGBAFormat } from 'three'
import {
  readPreparedLandrushZombieNightSurfaceRole,
  setLandrushZombieNightSurfaceAmount,
  setLandrushZombieNightSurfaceSunsetUniformAmount,
  setLandrushZombieNightSurfaceUniformAmount,
} from './landrush-zombie-night-presentation-material'
import { createProceduralStylizedGrassDisplayMaterial } from './stylized-grass-ground-material'

describe('procedural stylized grass display material', () => {
  test('keeps the baked ground on one prepared node graph through sunset and night', () => {
    const texture = new DataTexture(new Uint8Array([150, 146, 78, 255]), 1, 1, RGBAFormat)
    const material = createProceduralStylizedGrassDisplayMaterial(texture, '#ffffff')
    const preparedColorNode = material.colorNode
    const preparedVersion = material.version

    try {
      expect(material.isNodeMaterial).toBe(true)
      expect(material.name).toBe('procedural-stylized-grass-ground')
      expect(readPreparedLandrushZombieNightSurfaceRole(material)).toBe('grass-ground')

      setLandrushZombieNightSurfaceSunsetUniformAmount(1)
      setLandrushZombieNightSurfaceUniformAmount(0.5)
      expect(material.colorNode).toBe(preparedColorNode)
      expect(material.version).toBe(preparedVersion)
    } finally {
      setLandrushZombieNightSurfaceAmount(0)
      material.dispose()
      texture.dispose()
    }
  })
})
