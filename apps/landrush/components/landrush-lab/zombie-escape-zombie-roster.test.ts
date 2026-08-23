import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_CAPACITY, ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT } from './zombie-escape-config'
import {
  createZombieEscapeGaitByPoolSlot,
  createZombieEscapeVariantByPoolSlot,
  ZOMBIE_ESCAPE_ZOMBIE_GAIT,
} from './zombie-escape-zombie-roster'

describe('Zombie Escape zombie roster', () => {
  test('builds a deterministic balanced full-capacity variant assignment', () => {
    const first = createZombieEscapeVariantByPoolSlot(91_337)
    const repeated = createZombieEscapeVariantByPoolSlot(91_337)
    const otherSeed = createZombieEscapeVariantByPoolSlot(91_338)
    const counts = new Uint8Array(ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT)
    for (const variant of first) counts[variant] = counts[variant]! + 1

    expect(first).toEqual(repeated)
    expect(first).not.toEqual(otherSeed)
    expect(first).toHaveLength(ZOMBIE_ESCAPE_CAPACITY.zombies)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  test('builds a deterministic mixed gait roster independently of pool acquisition order', () => {
    const first = createZombieEscapeGaitByPoolSlot(91_337)
    const repeated = createZombieEscapeGaitByPoolSlot(91_337)
    const otherSeed = createZombieEscapeGaitByPoolSlot(91_338)
    const runnerCount = [...first].filter(
      (gait) => gait === ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner,
    ).length

    expect(first).toEqual(repeated)
    expect(first).not.toEqual(otherSeed)
    expect(first).toHaveLength(ZOMBIE_ESCAPE_CAPACITY.zombies)
    expect(runnerCount).toBe(Math.floor(ZOMBIE_ESCAPE_CAPACITY.zombies / 2))
  })
})
