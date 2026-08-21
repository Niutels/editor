import { describe, expect, test } from 'bun:test'
import {
  resolveZombieEscapeAimReticleElevation,
  resolveZombieEscapeAimReticleYaw,
} from './zombie-escape-aim'

describe('Zombie Escape aim frame', () => {
  test.each([
    0,
    Math.PI / 2,
    -Math.PI / 2,
    Math.PI,
  ])('keeps the local +Z reticle arrow aligned with world aim at %p radians', (aimAngle) => {
    const reticleYaw = resolveZombieEscapeAimReticleYaw(aimAngle)

    expect(Math.sin(reticleYaw)).toBeCloseTo(Math.sin(aimAngle), 8)
    expect(Math.cos(reticleYaw)).toBeCloseTo(Math.cos(aimAngle), 8)
  })

  test('falls back to the canonical forward direction for invalid input', () => {
    expect(resolveZombieEscapeAimReticleYaw(Number.NaN)).toBe(0)
  })

  test('keeps elevation and aim aligned with an elevated player', () => {
    const playerY = 3.25
    const aimAngle = Math.PI / 3

    expect(resolveZombieEscapeAimReticleElevation(playerY)).toBeCloseTo(3.37, 8)
    expect(resolveZombieEscapeAimReticleYaw(aimAngle)).toBeCloseTo(aimAngle, 8)
  })
})
