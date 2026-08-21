import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeWeaponPickupGrassBlockers,
  ZOMBIE_ESCAPE_WEAPON_PICKUPS,
} from './zombie-escape-config'

const PICKUP_PEDESTAL_RADIUS_METERS = 0.76
const PICKUP_SELECTED_SCALE = 1.18
const BUILT_GRASS_CLEARANCE_METERS = 1
const BUILT_GRASS_FEATHER_METERS = 0.3

describe('zombie escape pickup grass blockers', () => {
  test('translates every local pickup footprint into island coordinates from the spawn', () => {
    const spawn = Object.freeze({ x: 41.25, z: -17.5 })
    const blockers = createZombieEscapeWeaponPickupGrassBlockers(spawn)

    expect(blockers).toHaveLength(ZOMBIE_ESCAPE_WEAPON_PICKUPS.length)
    blockers.forEach((blocker, index) => {
      const pickup = ZOMBIE_ESCAPE_WEAPON_PICKUPS[index]
      expect(pickup).toBeDefined()
      expect(blocker.points).toHaveLength(8)

      const center = blocker.points.reduce(
        (sum, point) => ({ x: sum.x + point.x / 8, z: sum.z + point.z / 8 }),
        { x: 0, z: 0 },
      )
      expect(center.x).toBeCloseTo(spawn.x + pickup!.x, 12)
      expect(center.z).toBeCloseTo(spawn.z + pickup!.z, 12)
    })
    expect(spawn).toEqual({ x: 41.25, z: -17.5 })
  })

  test('uses the built-footprint mask settings and keeps each clearance tightly bounded', () => {
    const blockers = createZombieEscapeWeaponPickupGrassBlockers({ x: 0, z: 0 })
    const footprintRadius = PICKUP_PEDESTAL_RADIUS_METERS * PICKUP_SELECTED_SCALE

    blockers.forEach((blocker, index) => {
      const pickup = ZOMBIE_ESCAPE_WEAPON_PICKUPS[index]
      expect(pickup).toBeDefined()
      expect(blocker.clearanceMeters).toBe(BUILT_GRASS_CLEARANCE_METERS)
      expect(blocker.featherMeters).toBe(BUILT_GRASS_FEATHER_METERS)

      for (const point of blocker.points) {
        expect(Math.hypot(point.x - pickup!.x, point.z - pickup!.z)).toBeCloseTo(
          footprintRadius,
          12,
        )
      }

      expect(footprintRadius + (blocker.clearanceMeters ?? 0)).toBeLessThan(1.9)
    })
  })

  test('returns stable values without sharing mutable blocker data between calls', () => {
    const first = createZombieEscapeWeaponPickupGrassBlockers({ x: -12, z: 8 })
    const second = createZombieEscapeWeaponPickupGrassBlockers({ x: -12, z: 8 })

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first[0]).not.toBe(second[0])
    expect(first[0]?.points).not.toBe(second[0]?.points)
  })
})
