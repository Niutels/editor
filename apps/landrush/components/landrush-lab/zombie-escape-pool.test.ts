import { describe, expect, test } from 'bun:test'
import {
  acquireZombieEscapePoolSlot,
  createZombieEscapeFixedPool,
  releaseZombieEscapePoolSlot,
  resetZombieEscapeFixedPool,
} from '@landrush/zombie-gameplay/zombie-escape-pool'

describe('Zombie Escape fixed pool', () => {
  test('fills unique slots and deterministically overwrites the oldest slot when full', () => {
    const pool = createZombieEscapeFixedPool(3)
    expect([
      acquireZombieEscapePoolSlot(pool),
      acquireZombieEscapePoolSlot(pool),
      acquireZombieEscapePoolSlot(pool),
    ]).toEqual([0, 1, 2])
    expect(pool.activeCount).toBe(3)
    expect(acquireZombieEscapePoolSlot(pool)).toBe(0)
    expect(pool.activeCount).toBe(3)
    expect(pool.generation[0]).toBeGreaterThan(pool.generation[2] ?? 0)
  })

  test('releases and resets without replacing backing arrays', () => {
    const pool = createZombieEscapeFixedPool(2)
    const active = pool.active
    acquireZombieEscapePoolSlot(pool)
    acquireZombieEscapePoolSlot(pool)
    expect(releaseZombieEscapePoolSlot(pool, 1)).toBe(true)
    expect(acquireZombieEscapePoolSlot(pool)).toBe(1)
    resetZombieEscapeFixedPool(pool)
    expect(pool.active).toBe(active)
    expect(pool.activeCount).toBe(0)
    expect([...pool.active]).toEqual([0, 0])
  })

  test('keeps generations monotonic across resets so stale visual identities cannot alias', () => {
    const pool = createZombieEscapeFixedPool(1)
    const slot = acquireZombieEscapePoolSlot(pool)
    const previousGeneration = pool.generation[slot]!

    resetZombieEscapeFixedPool(pool)
    const nextSlot = acquireZombieEscapePoolSlot(pool)

    expect(nextSlot).toBe(slot)
    expect(pool.generation[nextSlot]).toBeGreaterThan(previousGeneration)
  })
})
