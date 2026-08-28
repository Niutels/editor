import { describe, expect, test } from 'bun:test'
import { shouldRenderZombieEscapeFallback } from './zombie-escape-fallback-zombies'

describe('Zombie Escape fallback presentation', () => {
  test('remains active until a variant is explicitly presentation-ready', () => {
    const ready = new Set<number>()
    expect(shouldRenderZombieEscapeFallback(1, 3, ready)).toBe(true)
    expect(shouldRenderZombieEscapeFallback(0, 3, ready)).toBe(false)

    ready.add(3)
    expect(shouldRenderZombieEscapeFallback(1, 3, ready)).toBe(false)
    expect(shouldRenderZombieEscapeFallback(1, 4, ready)).toBe(true)
  })
})
