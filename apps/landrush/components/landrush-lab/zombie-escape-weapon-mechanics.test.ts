import { describe, expect, test } from 'bun:test'
import {
  resolveZombieEscapeRadialDamageScale,
  writeZombieEscapeSymmetricSpreadDirection,
  zombieEscapeTargetPrecedesByDistance,
} from '@landrush/zombie-gameplay/zombie-escape-weapon-mechanics'

describe('Zombie Escape weapon mechanics', () => {
  test('writes a deterministic seven-pellet symmetric spread around the primary direction', () => {
    const output = { x: 0, y: 0, z: 0 }
    const directions = Array.from({ length: 7 }, (_, pelletOrdinal) => {
      writeZombieEscapeSymmetricSpreadDirection(0, 0, -1, pelletOrdinal, 7, 0.18, output)
      return [output.x, output.y, output.z]
    })

    expect(directions[0]).toEqual([0, 0, -1])
    for (let pair = 0; pair < 3; pair += 1) {
      const left = directions[pair * 2 + 1]!
      const right = directions[pair * 2 + 2]!
      expect(left[0]).toBeCloseTo(-right[0]!, 12)
      expect(left[1]).toBeCloseTo(right[1]!, 12)
      expect(left[2]).toBeCloseTo(right[2]!, 12)
      expect(Math.hypot(...left)).toBeCloseTo(1, 12)
    }
  })

  test('falls linearly to the configured nonzero blast edge and stops outside it', () => {
    expect(resolveZombieEscapeRadialDamageScale(0, 3.2, 0.3)).toBe(1)
    expect(resolveZombieEscapeRadialDamageScale(1.6, 3.2, 0.3)).toBeCloseTo(0.65, 12)
    expect(resolveZombieEscapeRadialDamageScale(3.2, 3.2, 0.3)).toBeCloseTo(0.3, 12)
    expect(resolveZombieEscapeRadialDamageScale(3.21, 3.2, 0.3)).toBe(0)
  })

  test('orders equal-distance targets by stable pool slot', () => {
    expect(zombieEscapeTargetPrecedesByDistance(4, 2, 4, 3)).toBe(true)
    expect(zombieEscapeTargetPrecedesByDistance(4, 3, 4, 2)).toBe(false)
    expect(zombieEscapeTargetPrecedesByDistance(3, 9, 4, 1)).toBe(true)
  })
})
