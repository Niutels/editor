import { describe, expect, test } from 'bun:test'
import {
  resolveZombieEscapeCoilArcPoint,
  resolveZombieEscapeScattergunMuzzlePetalEnvelope,
  resolveZombieEscapeVfxBlastScale,
  resolveZombieEscapeVfxImpactEnvelope,
  resolveZombieEscapeVfxNormalizedAge,
  resolveZombieEscapeWeaponVfxStyle,
  ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT,
  ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
  ZOMBIE_ESCAPE_PRODUCTION_WEAPON_VFX_VARIANT_INDICES,
  ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT,
  ZOMBIE_ESCAPE_WEAPON_VFX_STYLES,
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT,
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS,
} from './zombie-escape-weapon-vfx'

describe('Zombie Escape weapon VFX', () => {
  test('gives every weapon a stable, distinct no-post style', () => {
    expect(ZOMBIE_ESCAPE_WEAPON_VFX_STYLES.map(({ id }) => id)).toEqual([
      'pistol',
      'carbine',
      'scattergun',
      'coil',
      'launcher',
    ])
    expect(
      new Set(ZOMBIE_ESCAPE_WEAPON_VFX_STYLES.map(({ tracerColor }) => tracerColor)).size,
    ).toBe(ZOMBIE_ESCAPE_WEAPON_VFX_STYLES.length)
    expect(resolveZombieEscapeWeaponVfxStyle(Number.NaN).id).toBe('pistol')
    expect(resolveZombieEscapeWeaponVfxStyle(99).id).toBe('pistol')
  })

  test('authors five materially different renderer paths for every weapon', () => {
    expect(ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS).toHaveLength(
      ZOMBIE_ESCAPE_WEAPON_VFX_STYLES.length * ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT,
    )
    expect(
      new Set(ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS.map(({ variantLabel }) => variantLabel)).size,
    ).toBe(ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS.length)
    for (const { id } of ZOMBIE_ESCAPE_WEAPON_VFX_STYLES) {
      const variants = ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS.filter((style) => style.id === id)
      expect(variants).toHaveLength(5)
      expect(
        new Set(
          variants.map(
            ({ arcPattern, blastPattern, impactPattern, travelPattern }) =>
              `${travelPattern}:${impactPattern}:${arcPattern}:${blastPattern}`,
          ),
        ).size,
      ).toBe(5)
    }
    expect(resolveZombieEscapeWeaponVfxStyle(0, 1).variantLabel).toBe('Rotating Flint Star')
    expect(resolveZombieEscapeWeaponVfxStyle(1, 4).variantLabel).toBe('Wake Ribbon')
    expect(resolveZombieEscapeWeaponVfxStyle(3, 2).arcPattern).toBe('pulse-nodes')
    expect(resolveZombieEscapeWeaponVfxStyle(4, 4).blastPattern).toBe('implosion')
  })

  test('uses the approved production variant for each weapon without overriding proof variants', () => {
    expect(ZOMBIE_ESCAPE_PRODUCTION_WEAPON_VFX_VARIANT_INDICES).toEqual([0, 4, 1, 1, 1])
    expect(ZOMBIE_ESCAPE_WEAPON_VFX_STYLES.map(({ variantLabel }) => variantLabel)).toEqual([
      'Ember Snap',
      'Wake Ribbon',
      'Classic Boom Fan',
      'Twin Fork',
      'Coral Shard Bloom',
    ])
    expect(resolveZombieEscapeWeaponVfxStyle(1).variantLabel).toBe('Wake Ribbon')
    expect(resolveZombieEscapeWeaponVfxStyle(2).variantLabel).toBe('Classic Boom Fan')
    expect(resolveZombieEscapeWeaponVfxStyle(3).variantLabel).toBe('Twin Fork')
    expect(resolveZombieEscapeWeaponVfxStyle(4).variantLabel).toBe('Coral Shard Bloom')
    expect(resolveZombieEscapeWeaponVfxStyle(4).blastCloudScale).toBe(2)
    expect(resolveZombieEscapeWeaponVfxStyle(4, 0).blastCloudScale).toBe(1)
    expect(resolveZombieEscapeWeaponVfxStyle(1, Number.NaN).variantLabel).toBe('Wake Ribbon')
  })

  test('encodes the approved silhouette hierarchy', () => {
    const pistol = resolveZombieEscapeWeaponVfxStyle(0)
    const carbine = resolveZombieEscapeWeaponVfxStyle(1)
    const scattergun = resolveZombieEscapeWeaponVfxStyle(2)
    const coil = resolveZombieEscapeWeaponVfxStyle(3)
    const launcher = resolveZombieEscapeWeaponVfxStyle(4)

    expect(carbine.tracerRadius).toBeLessThan(pistol.tracerRadius)
    expect(carbine.tracerLengthScale).toBeGreaterThan(pistol.tracerLengthScale)
    expect(scattergun.muzzleRadiusScale).toBeLessThan(pistol.muzzleRadiusScale)
    expect(scattergun.muzzleLengthScale).toBeLessThan(pistol.muzzleLengthScale)
    expect(scattergun.muzzleLengthScale).toBeLessThan(scattergun.muzzleRadiusScale)
    expect(ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT).toBe(5)
    expect(scattergun.tracerRadius).toBeLessThan(pistol.tracerRadius)
    expect(coil.arcColorA).not.toBe(coil.arcColorB)
    expect(launcher.tracerRadius).toBeGreaterThan(pistol.tracerRadius)
    expect(launcher.accentRadius).toBeGreaterThan(0)
    expect(launcher.sparkCount).toBeGreaterThan(pistol.sparkCount)
    expect(carbine.impactStretchScale).toBeGreaterThan(pistol.impactStretchScale)
    expect(launcher.sparkCount).toBe(8)
    expect(resolveZombieEscapeWeaponVfxStyle(4, 0).sparkCount).toBe(12)
    expect(ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT).toBe(12)
    expect('impactRingScale' in launcher).toBe(false)
  })

  test('uses normalized lifetime envelopes with bounded malformed inputs', () => {
    expect(resolveZombieEscapeVfxNormalizedAge(0.14, 0.28)).toBeCloseTo(0.5, 12)
    expect(resolveZombieEscapeVfxNormalizedAge(-1, 0.28)).toBe(0)
    expect(resolveZombieEscapeVfxNormalizedAge(1, 0.28)).toBe(1)
    expect(resolveZombieEscapeVfxNormalizedAge(0, 0)).toBe(1)
    expect(resolveZombieEscapeVfxImpactEnvelope(0)).toBe(1)
    expect(resolveZombieEscapeVfxImpactEnvelope(1)).toBe(0)
    expect(resolveZombieEscapeVfxBlastScale(0)).toBeCloseTo(0.24, 12)
    expect(resolveZombieEscapeVfxBlastScale(0.2)).toBeGreaterThan(
      resolveZombieEscapeVfxBlastScale(0),
    )
    expect(resolveZombieEscapeVfxBlastScale(1)).toBe(0)
    expect(resolveZombieEscapeVfxBlastScale(Number.NaN)).toBe(0)
  })

  test('gives the scattergun muzzle petals a fast attack and monotonic decay', () => {
    const early = resolveZombieEscapeScattergunMuzzlePetalEnvelope(0.08)
    const peak = resolveZombieEscapeScattergunMuzzlePetalEnvelope(0.18)
    const middle = resolveZombieEscapeScattergunMuzzlePetalEnvelope(0.5)

    expect(resolveZombieEscapeScattergunMuzzlePetalEnvelope(0)).toBe(0)
    expect(early).toBeGreaterThan(0)
    expect(peak).toBeGreaterThan(early)
    expect(middle).toBeLessThan(peak)
    expect(resolveZombieEscapeScattergunMuzzlePetalEnvelope(1)).toBe(0)
    expect(resolveZombieEscapeScattergunMuzzlePetalEnvelope(Number.NaN)).toBe(0)
  })

  test('builds a deterministic segmented coil arc with exact endpoints', () => {
    const first = { x: 0, y: 0, z: 0 }
    const repeat = { x: 0, y: 0, z: 0 }
    const different = { x: 0, y: 0, z: 0 }
    const source = { x: -1, y: 0.8, z: 2 }
    const target = { x: 3, y: 1.4, z: -2 }

    resolveZombieEscapeCoilArcPoint(
      source.x,
      source.y,
      source.z,
      target.x,
      target.y,
      target.z,
      123,
      0,
      ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
      first,
    )
    expect(first).toEqual(source)
    resolveZombieEscapeCoilArcPoint(
      source.x,
      source.y,
      source.z,
      target.x,
      target.y,
      target.z,
      123,
      ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
      ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
      first,
    )
    expect(first).toEqual(target)

    resolveZombieEscapeCoilArcPoint(
      source.x,
      source.y,
      source.z,
      target.x,
      target.y,
      target.z,
      123,
      3,
      ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
      first,
    )
    resolveZombieEscapeCoilArcPoint(
      source.x,
      source.y,
      source.z,
      target.x,
      target.y,
      target.z,
      123,
      3,
      ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
      repeat,
    )
    resolveZombieEscapeCoilArcPoint(
      source.x,
      source.y,
      source.z,
      target.x,
      target.y,
      target.z,
      124,
      3,
      ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
      different,
    )
    expect(repeat).toEqual(first)
    expect(different).not.toEqual(first)
  })
})
