import { describe, expect, test } from 'bun:test'
import { BufferGeometry, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import {
  resolveLandrushIslandFishUpdateRange,
  setLandrushIslandFishInstanceMatrixIfChanged,
  shouldAdvanceLandrushIslandFishBatches,
} from './landrush-island-ambient-life'

describe('Landrush island ambient-life frame work', () => {
  test('pauses underwater fish animation while Zombie gameplay owns the frame budget', () => {
    expect(shouldAdvanceLandrushIslandFishBatches(true, false)).toBe(true)
    expect(shouldAdvanceLandrushIslandFishBatches(true, true)).toBe(false)
    expect(shouldAdvanceLandrushIslandFishBatches(false, false)).toBe(false)
    expect(shouldAdvanceLandrushIslandFishBatches(false, true)).toBe(false)
  })

  test('partitions phased fish updates into contiguous upload ranges', () => {
    expect(resolveLandrushIslandFishUpdateRange(5, 0, 2)).toEqual({ count: 2, start: 0 })
    expect(resolveLandrushIslandFishUpdateRange(5, 1, 2)).toEqual({ count: 3, start: 2 })
    expect(resolveLandrushIslandFishUpdateRange(6, 2, 3)).toEqual({ count: 2, start: 4 })
    expect(resolveLandrushIslandFishUpdateRange(0, 0, 2)).toEqual({ count: 0, start: 0 })
  })

  test('does not rewrite an unchanged fish instance matrix', () => {
    const geometry = new BufferGeometry()
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, 2)
    const identity = new Matrix4()
    const moved = new Matrix4().makeTranslation(3, 1, -2)

    try {
      expect(setLandrushIslandFishInstanceMatrixIfChanged(mesh, 1, identity)).toBe(false)
      expect(setLandrushIslandFishInstanceMatrixIfChanged(mesh, 1, moved)).toBe(true)
      expect(setLandrushIslandFishInstanceMatrixIfChanged(mesh, 1, moved)).toBe(false)
    } finally {
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    }
  })
})
