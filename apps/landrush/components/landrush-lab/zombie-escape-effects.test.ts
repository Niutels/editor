import { describe, expect, test } from 'bun:test'
import {
  shouldRenderZombieEscapeGenericImpact,
  shouldRenderZombieEscapeTracer,
} from './zombie-escape-effects'
import {
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
} from './zombie-escape-simulation'

describe('Zombie Escape effects', () => {
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

  test('reserves the generic flash, ring, and sparks for environment impacts', () => {
    expect(shouldRenderZombieEscapeGenericImpact(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment)).toBe(
      true,
    )
    expect(shouldRenderZombieEscapeGenericImpact(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy)).toBe(false)
    expect(shouldRenderZombieEscapeGenericImpact(ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired)).toBe(
      false,
    )
  })
})
