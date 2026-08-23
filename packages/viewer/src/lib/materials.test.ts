// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { afterEach, describe, expect, test } from 'bun:test'
import type { MaterialSchema } from '@pascal-app/core'
import { Group, Mesh, PlaneGeometry, Texture, TextureLoader } from 'three'
import {
  clearMaterialCache,
  cloneMaterial,
  createMaterial,
  getObjectMaterialTextureSettlement,
  getTextureKey,
  resolveTextureRepeat,
} from './materials'

const originalLoadAsync = TextureLoader.prototype.loadAsync

afterEach(() => {
  TextureLoader.prototype.loadAsync = originalLoadAsync
  clearMaterialCache()
})

function materialWithRepeat(repeat: unknown): MaterialSchema {
  return {
    texture: {
      url: 'https://example.com/texture.png',
      repeat,
    },
  } as unknown as MaterialSchema
}

describe('legacy texture repeat values', () => {
  test('normalizes tuple, scalar, and Vector2-shaped repeats', () => {
    expect(resolveTextureRepeat([2, 3], undefined)).toEqual([2, 3])
    expect(resolveTextureRepeat(2, undefined)).toEqual([2, 2])
    expect(resolveTextureRepeat({ x: 2, y: 3 }, undefined)).toEqual([2, 3])
  })

  test('falls back to scale for malformed repeats', () => {
    expect(resolveTextureRepeat({ width: 2 }, 4)).toEqual([4, 4])
  })

  test('keeps distinct Vector2-shaped repeats in distinct cache entries', () => {
    expect(getTextureKey(materialWithRepeat({ x: 2, y: 3 }))).not.toBe(
      getTextureKey(materialWithRepeat({ x: 4, y: 5 })),
    )
  })
})

describe('async material clone ownership', () => {
  test('keeps a cold inline slab clone pending, assigns its map, and settles', async () => {
    clearMaterialCache()
    let resolveTexture!: (texture: Texture) => void
    TextureLoader.prototype.loadAsync = () =>
      new Promise<Texture>((resolve) => {
        resolveTexture = resolve
      })
    const schema = materialWithRepeat([2, 3])
    const source = createMaterial(schema)
    const clone = cloneMaterial(source, { cacheKey: 'slab-inline-cold' })
    const root = new Group()
    root.add(new Mesh(new PlaneGeometry(), clone))

    expect(getObjectMaterialTextureSettlement([root]).pendingAssignments).toBe(1)

    const texture = new Texture()
    resolveTexture(texture)
    for (let index = 0; index < 8; index += 1) await Promise.resolve()

    expect((clone as { map?: Texture | null }).map).toBe(
      (source as { map?: Texture | null }).map,
    )
    expect((clone as { map?: Texture | null }).map).not.toBeNull()
    expect(getObjectMaterialTextureSettlement([root])).toEqual({
      failedAssignments: 0,
      pendingAssignments: 0,
      settled: true,
    })
  })

  test('bounds retries and lets a cached failed inline material retry later', async () => {
    clearMaterialCache()
    let attempts = 0
    TextureLoader.prototype.loadAsync = async () => {
      attempts += 1
      throw new Error('offline')
    }
    const schema = materialWithRepeat([5, 7])
    const source = createMaterial(schema)
    const clone = cloneMaterial(source, { cacheKey: 'slab-inline-retry' })
    const root = new Group()
    root.add(new Mesh(new PlaneGeometry(), clone))

    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(attempts).toBe(3)
    expect(getObjectMaterialTextureSettlement([root]).failedAssignments).toBe(1)

    let resolveRetry!: (texture: Texture) => void
    TextureLoader.prototype.loadAsync = () =>
      new Promise<Texture>((resolve) => {
        resolveRetry = resolve
      })
    expect(createMaterial(schema)).toBe(source)
    expect(getObjectMaterialTextureSettlement([root]).pendingAssignments).toBe(1)
    resolveRetry(new Texture())
    for (let index = 0; index < 8; index += 1) await Promise.resolve()

    expect(getObjectMaterialTextureSettlement([root]).settled).toBe(true)
    expect((clone as { map?: Texture | null }).map).not.toBeNull()
  })

  test('keeps a post-clear texture request authoritative when the old request resolves first', async () => {
    clearMaterialCache()
    const pending: Array<(texture: Texture) => void> = []
    TextureLoader.prototype.loadAsync = () =>
      new Promise<Texture>((resolve) => {
        pending.push(resolve)
      })
    const schema = materialWithRepeat([11, 13])

    createMaterial(schema)
    expect(pending).toHaveLength(1)
    clearMaterialCache()

    const current = createMaterial(schema)
    expect(pending).toHaveLength(2)
    const staleTexture = new Texture()
    let staleDisposals = 0
    staleTexture.addEventListener('dispose', () => {
      staleDisposals += 1
    })
    pending[0]?.(staleTexture)
    for (let index = 0; index < 8; index += 1) await Promise.resolve()

    const sameTextureDifferentMaterial = createMaterial({
      ...schema,
      properties: {
        color: '#334455',
        metalness: 0,
        opacity: 1,
        roughness: 0.5,
        side: 'front',
        transparent: false,
      },
    })
    expect(staleDisposals).toBe(1)
    expect(pending).toHaveLength(2)

    pending[1]?.(new Texture())
    for (let index = 0; index < 8; index += 1) await Promise.resolve()

    expect((current as { map?: Texture | null }).map).not.toBeNull()
    expect((sameTextureDifferentMaterial as { map?: Texture | null }).map).not.toBeNull()
  })
})
