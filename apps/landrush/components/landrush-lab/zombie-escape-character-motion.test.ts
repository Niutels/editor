import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeAttackSwingPose,
  resolveZombieEscapeAttackSwingPose,
  resolveZombieEscapeDeathFallRadians,
  resolveZombieEscapeDeathNormalizedPhase,
  ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS,
} from './zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'

describe('Zombie Escape deterministic character motion', () => {
  test('drives one arm through a readable windup, contact swing, and exact loop pose', () => {
    const output = createZombieEscapeAttackSwingPose()
    const start = { ...resolveZombieEscapeAttackSwingPose(0, output) }
    const windup = { ...resolveZombieEscapeAttackSwingPose(0.18, output) }
    const contact = {
      ...resolveZombieEscapeAttackSwingPose(
        ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase,
        output,
      ),
    }
    const end = { ...resolveZombieEscapeAttackSwingPose(1, output) }

    expect(windup.shoulderPitch - contact.shoulderPitch).toBeGreaterThan(1.5)
    expect(windup.elbowBend).toBeGreaterThan(contact.elbowBend + 0.9)
    expect(end).toEqual(start)
  })

  test('maps the longer corpse lifetime onto a short collapse and a locked terminal phase', () => {
    expect(ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds).toBe(0.3)
    expect(ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS).toBe(0.72)
    expect(ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds).toBe(2.4)
    expect(
      resolveZombieEscapeDeathNormalizedPhase(
        ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds,
      ),
    ).toBe(0)
    expect(
      resolveZombieEscapeDeathNormalizedPhase(
        ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds -
          ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS * 0.5,
      ),
    ).toBeCloseTo(0.5, 6)
    expect(
      resolveZombieEscapeDeathNormalizedPhase(
        ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds -
          ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS,
      ),
    ).toBe(1)
    expect(resolveZombieEscapeDeathNormalizedPhase(0.1)).toBe(1)
    expect(resolveZombieEscapeDeathFallRadians(0.5)).toBeGreaterThan(0.7)
    expect(resolveZombieEscapeDeathFallRadians(1)).toBeCloseTo(Math.PI * 0.5 - 0.055, 8)
  })
})
