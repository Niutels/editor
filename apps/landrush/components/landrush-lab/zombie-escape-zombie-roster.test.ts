import { describe, expect, test } from 'bun:test'
import { LANDRUSH_ISLAND_AMBIENT_NPCS } from './landrush-island-ambient-catalog'
import { ZOMBIE_ESCAPE_CAPACITY } from './zombie-escape-config'
import {
  ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS,
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
} from './zombie-escape-zombie-catalog'
import {
  createZombieEscapeVariantByPoolSlot,
  createZombieEscapeZombieRoster,
  resolveZombieEscapeFirstProjectileSlowdownMultiplier,
  resolveZombieEscapeProjectileSlowdownMultiplier,
  resolveZombieEscapeSpawnSpeedScale,
  ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
} from './zombie-escape-zombie-roster'

describe('Zombie Escape zombie roster', () => {
  test('reserves the exact production roster of one hundred zombies', () => {
    expect(ZOMBIE_ESCAPE_CAPACITY.zombies).toBe(100)
  })

  test('builds a deterministic balanced standard-only full-capacity assignment', () => {
    const first = createZombieEscapeVariantByPoolSlot(91_337)
    const repeated = createZombieEscapeVariantByPoolSlot(91_337)
    const otherSeed = createZombieEscapeVariantByPoolSlot(91_338)
    const counts = new Uint8Array(ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length)
    for (const variant of first) counts[variant] = counts[variant]! + 1
    const standardCounts = ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS.map((variant) => counts[variant]!)

    expect(first).toEqual(repeated)
    expect(first).not.toEqual(otherSeed)
    expect(first).toHaveLength(ZOMBIE_ESCAPE_CAPACITY.zombies)
    expect(
      first.every((variant) => ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variant]!.bodyClass === 'standard'),
    ).toBe(true)
    expect(Math.max(...standardCounts) - Math.min(...standardCounts)).toBeLessThanOrEqual(1)
  })

  test('maps the ambient catalog prefix to its exact zombie bodies and shuffles only the suffix', () => {
    const first = createZombieEscapeZombieRoster(91_337)
    const repeated = createZombieEscapeZombieRoster(91_337)
    const otherSeed = createZombieEscapeZombieRoster(91_338)
    const prefixCount = LANDRUSH_ISLAND_AMBIENT_NPCS.length

    expect(ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS).toEqual(
      LANDRUSH_ISLAND_AMBIENT_NPCS.map(({ id }) => id),
    )
    expect(first).toEqual(repeated)
    expect(first.sourceNpcIdByPoolSlot.slice(0, prefixCount)).toEqual(
      LANDRUSH_ISLAND_AMBIENT_NPCS.map(({ id }) => id),
    )
    for (let npcIndex = 0; npcIndex < prefixCount; npcIndex += 1) {
      const assigned = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[first.variantByPoolSlot[npcIndex]!]!
      const exact = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.find(
        ({ sourceNpcId }) => sourceNpcId === LANDRUSH_ISLAND_AMBIENT_NPCS[npcIndex]!.id,
      )!
      expect(assigned.bodyClass).toBe('standard')
      if (exact.bodyClass === 'standard') expect(assigned.sourceNpcId).toBe(exact.sourceNpcId)
    }
    expect(first.variantByPoolSlot.slice(0, prefixCount)).toEqual(
      otherSeed.variantByPoolSlot.slice(0, prefixCount),
    )
    expect(first.variantByPoolSlot.slice(prefixCount)).not.toEqual(
      otherSeed.variantByPoolSlot.slice(prefixCount),
    )
    expect(first.sourceNpcIdByPoolSlot.slice(prefixCount).every((id) => id === null)).toBe(true)
  })

  test('derives a deterministic 80/20 regular and sprinter speed distribution from spawn identity', () => {
    const first = Array.from({ length: 10_000 }, (_, ordinal) =>
      resolveZombieEscapeSpawnSpeedScale(91_337, ordinal),
    )
    const repeated = Array.from({ length: 10_000 }, (_, ordinal) =>
      resolveZombieEscapeSpawnSpeedScale(91_337, ordinal),
    )
    const sprinters = first.filter((speed) => speed >= 1.3)
    const regular = first.filter((speed) => speed < 1.3)

    expect(first).toEqual(repeated)
    expect(first).not.toEqual(
      Array.from({ length: 10_000 }, (_, ordinal) =>
        resolveZombieEscapeSpawnSpeedScale(91_338, ordinal),
      ),
    )
    expect(sprinters.length / first.length).toBeGreaterThan(0.19)
    expect(sprinters.length / first.length).toBeLessThan(0.21)
    expect(Math.min(...regular)).toBeGreaterThanOrEqual(0.9)
    expect(Math.max(...regular)).toBeLessThanOrEqual(1.12)
    expect(Math.min(...sprinters)).toBeGreaterThanOrEqual(1.3)
    expect(Math.max(...sprinters)).toBeLessThanOrEqual(1.55)

    for (let block = 0; block < 128; block += 1) {
      const blockSpeeds = Array.from({ length: 5 }, (_, lane) => {
        const ordinal = block * 5 + lane
        return resolveZombieEscapeSpawnSpeedScale(91_337, ordinal)
      })
      expect(blockSpeeds.filter((speed) => speed >= 1.3)).toHaveLength(1)
    }
    for (const length of [10, 15, 60]) {
      const cohort = Array.from({ length }, (_, ordinal) =>
        resolveZombieEscapeSpawnSpeedScale(91_337, ordinal),
      )
      expect(cohort.filter((speed) => speed >= 1.3)).toHaveLength(length / 5)
    }
    for (const length of [14, ZOMBIE_ESCAPE_CAPACITY.zombies]) {
      const cohort = Array.from({ length }, (_, ordinal) =>
        resolveZombieEscapeSpawnSpeedScale(91_337, ordinal),
      )
      expect(cohort.filter((speed) => speed >= 1.3).length).toBeGreaterThanOrEqual(
        Math.floor(length / 5),
      )
      expect(cohort.filter((speed) => speed >= 1.3).length).toBeLessThanOrEqual(
        Math.ceil(length / 5),
      )
    }
  })

  test('widens only each gait distribution maximum by the requested multiplier', () => {
    const baseline = Array.from({ length: 1_000 }, (_, ordinal) =>
      resolveZombieEscapeSpawnSpeedScale(91_337, ordinal),
    )
    const maximumSpeedMultiplier = 1.25
    const widened = baseline.map((_, ordinal) =>
      resolveZombieEscapeSpawnSpeedScale(91_337, ordinal, maximumSpeedMultiplier),
    )

    for (let ordinal = 0; ordinal < baseline.length; ordinal += 1) {
      const baselineSpeed = baseline[ordinal]!
      const minimum = baselineSpeed >= 1.3 ? 1.3 : 0.9
      const baselineMaximum = baselineSpeed >= 1.3 ? 1.55 : 1.12
      const amount = (baselineSpeed - minimum) / (baselineMaximum - minimum)
      expect(widened[ordinal]).toBeCloseTo(
        minimum + (baselineMaximum * maximumSpeedMultiplier - minimum) * amount,
        12,
      )
    }
  })

  test('derives one bounded multiplicative slowdown per projectile hit identity', () => {
    const first = Array.from({ length: 32 }, (_, hitOrdinal) =>
      resolveZombieEscapeProjectileSlowdownMultiplier(91_337, 12, hitOrdinal),
    )
    const repeated = Array.from({ length: 32 }, (_, hitOrdinal) =>
      resolveZombieEscapeProjectileSlowdownMultiplier(91_337, 12, hitOrdinal),
    )

    expect(first).toEqual(repeated)
    expect(new Set(first).size).toBeGreaterThan(1)
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0.975)
    expect(Math.max(...first)).toBeLessThanOrEqual(0.9975)
    const previousMultipliers = [0.979, 0.9795, 0.9515]
    for (let index = 0; index < previousMultipliers.length; index += 1) {
      expect(1 - first[index]!).toBeCloseTo((1 - previousMultipliers[index]!) * 0.25, 12)
    }
  })

  test('keeps only one quarter of the legacy runner-to-walker first-hit speed drop', () => {
    for (let variant = 0; variant < ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length; variant += 1) {
      for (const wave of [1, 5, 20]) {
        const movement = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variant]!.movement
        const walkSpeed = movement.walkMetersPerSecond + wave * 0.06
        const runSpeed = movement.runMetersPerSecond + wave * 0.18
        const spawnOrdinal = variant * 7 + wave
        const laterHitMultiplier = resolveZombieEscapeProjectileSlowdownMultiplier(
          91_337,
          spawnOrdinal,
          0,
        )
        const legacyHitMultiplier = 1 - (1 - laterHitMultiplier) * 4
        const legacyPostHitSpeed = walkSpeed * legacyHitMultiplier
        const firstHitMultiplier = resolveZombieEscapeFirstProjectileSlowdownMultiplier(
          91_337,
          spawnOrdinal,
          walkSpeed,
          runSpeed,
        )
        const currentPostHitSpeed = runSpeed * firstHitMultiplier

        expect((runSpeed - currentPostHitSpeed) / (runSpeed - legacyPostHitSpeed)).toBeCloseTo(
          0.25,
          12,
        )
      }
    }
  })
})
