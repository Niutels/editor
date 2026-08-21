import { describe, expect, test } from 'bun:test'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'

describe('Zombie Escape hit flicker', () => {
  test('alternates deterministic red and black phases before restoring the material', () => {
    expect(resolveZombieEscapeHitFlickerPhase(1)).toBe('red')
    expect(resolveZombieEscapeHitFlickerPhase(0.8)).toBe('black')
    expect(resolveZombieEscapeHitFlickerPhase(0.6)).toBe('red')
    expect(resolveZombieEscapeHitFlickerPhase(0)).toBe('none')
    expect(resolveZombieEscapeHitFlickerPhase(Number.NaN)).toBe('none')
  })
})
