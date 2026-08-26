import { describe, expect, test } from 'bun:test'
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three'
import { hasDrawableGeometry } from './drawable-geometry'

function createTriangle(points: readonly number[]) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  return geometry
}

describe('hasDrawableGeometry', () => {
  test('rejects missing and empty position buffers', () => {
    expect(hasDrawableGeometry(null)).toBe(false)
    expect(hasDrawableGeometry(new BufferGeometry())).toBe(false)
    expect(hasDrawableGeometry(createTriangle([]))).toBe(false)
  })

  test('rejects an intentional zero-area placeholder triangle', () => {
    const geometry = createTriangle([0, 0, 0, 0, 0, 0, 0, 0, 0])
    geometry.setAttribute('normal', new Float32BufferAttribute(new Array(9).fill(0), 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(new Array(6).fill(0), 2))

    expect(hasDrawableGeometry(geometry)).toBe(false)
  })

  test('accepts a visible non-indexed triangle', () => {
    expect(hasDrawableGeometry(createTriangle([0, 0, 0, 1, 0, 0, 0, 1, 0]))).toBe(true)
  })

  test('uses indices when checking a single triangle', () => {
    const geometry = createTriangle([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 2, 2])
    geometry.setIndex(new Uint16BufferAttribute([0, 1, 2], 1))
    expect(hasDrawableGeometry(geometry)).toBe(true)

    geometry.setIndex(new Uint16BufferAttribute([0, 0, 0], 1))
    expect(hasDrawableGeometry(geometry)).toBe(false)
  })

  test('keeps larger geometry on the constant-time path', () => {
    expect(hasDrawableGeometry(createTriangle([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true)
  })
})
