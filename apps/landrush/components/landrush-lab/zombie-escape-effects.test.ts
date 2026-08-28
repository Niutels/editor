import { describe, expect, test } from 'bun:test'
import {
  shouldRenderZombieEscapeChainArc,
  shouldRenderZombieEscapeImpactFlash,
  shouldRenderZombieEscapeImpactSparks,
  shouldRenderZombieEscapeMuzzle,
  shouldRenderZombieEscapeTracer,
  shouldScanZombieEscapeDeathDustCandidates,
  shouldScanZombieEscapeEffectPool,
} from './zombie-escape-effects'
import {
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND,
} from './zombie-escape-simulation'

describe('Zombie Escape effects', () => {
  test('skips empty fixed-pool and already-observed death-dust scans', () => {
    expect(shouldScanZombieEscapeEffectPool(0)).toBe(false)
    expect(shouldScanZombieEscapeEffectPool(1)).toBe(true)
    expect(shouldScanZombieEscapeEffectPool(Number.NaN)).toBe(false)
    expect(shouldScanZombieEscapeDeathDustCandidates(0, 0)).toBe(false)
    expect(shouldScanZombieEscapeDeathDustCandidates(1, 0)).toBe(true)
    expect(shouldScanZombieEscapeDeathDustCandidates(1, 1)).toBe(false)
    expect(shouldScanZombieEscapeDeathDustCandidates(0, 1)).toBe(false)
  })

  test('keeps one tracer visible for travel and the complete impact lifetime', () => {
    expect(
      shouldRenderZombieEscapeTracer(
        ZOMBIE_ESCAPE_SHOT_PHASE.travel,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.none,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeTracer(
        ZOMBIE_ESCAPE_SHOT_PHASE.impact,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeTracer(
        ZOMBIE_ESCAPE_SHOT_PHASE.impact,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeTracer(
        ZOMBIE_ESCAPE_SHOT_PHASE.inactive,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired,
      ),
    ).toBe(false)
  })

  test('gives muzzle ownership to the primary carrier of a volley', () => {
    expect(shouldRenderZombieEscapeMuzzle(1)).toBe(true)
    expect(shouldRenderZombieEscapeMuzzle(0)).toBe(false)
  })

  test('renders faceted contact flashes without duplicating chain and splash-victim effects', () => {
    expect(
      shouldRenderZombieEscapeImpactFlash(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactFlash(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactFlash(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactFlash(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(false)
    expect(
      shouldRenderZombieEscapeImpactFlash(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(false)
  })

  test('renders weapon-specific shards for contacts but not launcher splash victims', () => {
    expect(
      shouldRenderZombieEscapeImpactSparks(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactSparks(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactSparks(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactSparks(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactSparks(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment,
      ),
    ).toBe(true)
    expect(
      shouldRenderZombieEscapeImpactSparks(
        ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim,
        ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy,
      ),
    ).toBe(false)
  })

  test('draws deterministic arc segments only for coil chain events', () => {
    expect(shouldRenderZombieEscapeChainArc(ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain)).toBe(
      true,
    )
    expect(
      shouldRenderZombieEscapeChainArc(ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.projectile),
    ).toBe(false)
    expect(shouldRenderZombieEscapeChainArc(ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast)).toBe(
      false,
    )
  })
})
