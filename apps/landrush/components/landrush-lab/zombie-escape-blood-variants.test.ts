import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT,
  DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
  getZombieEscapeBloodVariantProfile,
  isZombieEscapeBloodVariant,
  resolveZombieEscapeBloodHitVariantCode,
  resolveZombieEscapeBloodVariant,
  resolveZombieEscapeBloodVariantCode,
  ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT,
  ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT,
  ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT,
  ZOMBIE_ESCAPE_BLOOD_VARIANTS,
} from './zombie-escape-blood-variants'

describe('Zombie Escape blood presentation variants', () => {
  test('defines five unique real-renderer variants', () => {
    const ids = ZOMBIE_ESCAPE_BLOOD_VARIANTS.map((variant) => variant.id)
    const codes = ZOMBIE_ESCAPE_BLOOD_VARIANTS.map((variant) => variant.code)
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
    expect(new Set(codes).size).toBe(5)
    for (const id of ids) expect(isZombieEscapeBloodVariant(id)).toBe(true)
  })

  test('selects one deterministic production style from immutable impact data', () => {
    const wet = getZombieEscapeBloodVariantProfile('wet-hybrid').code
    const heavy = getZombieEscapeBloodVariantProfile('heavy-clots').code
    const viscous = getZombieEscapeBloodVariantProfile('viscous-strings').code

    expect(resolveZombieEscapeBloodHitVariantCode(49.999, 16.001)).toBe(wet)
    expect(resolveZombieEscapeBloodHitVariantCode(50, 16.001)).toBe(heavy)
    expect(resolveZombieEscapeBloodHitVariantCode(58, 4)).toBe(heavy)
    expect(resolveZombieEscapeBloodHitVariantCode(36, 16)).toBe(viscous)
    expect(resolveZombieEscapeBloodHitVariantCode(36, 4.000_1 ** 2)).toBe(wet)
    expect(resolveZombieEscapeBloodHitVariantCode(Number.NaN, Number.NaN)).toBe(wet)
    expect(resolveZombieEscapeBloodVariantCode(99)).toBe(DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE)
  })

  test('keeps every profile inside the fixed instanced allocation', () => {
    for (const profile of ZOMBIE_ESCAPE_BLOOD_VARIANTS) {
      expect(profile.splashCount).toBeLessThanOrEqual(ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT)
      expect(profile.dropletCount).toBeLessThanOrEqual(ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT)
      expect(profile.residueCount).toBeLessThanOrEqual(ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT)
      expect(getZombieEscapeBloodVariantProfile(profile.id)).toBe(profile)
    }
  })

  test('falls back deterministically for an invalid query value', () => {
    expect(resolveZombieEscapeBloodVariant('not-a-variant')).toBe(
      DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT,
    )
    expect(resolveZombieEscapeBloodVariant(null)).toBe(DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT)
  })
})
