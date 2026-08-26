import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_WEAPON_PICKUPS } from './zombie-escape-config'
import {
  createZombieEscapeFallbackWeaponPickupPlacements,
  translateZombieEscapeWeaponPickupPlacements,
} from './zombie-escape-weapon-pickup-data'

describe('Zombie Escape weapon pickup data', () => {
  test('creates deterministic standalone fallback placements from the authored pickup catalog', () => {
    const first = createZombieEscapeFallbackWeaponPickupPlacements()
    const second = createZombieEscapeFallbackWeaponPickupPlacements()

    expect(first).toEqual(
      ZOMBIE_ESCAPE_WEAPON_PICKUPS.map((pickup, weaponIndex) => ({
        scopeId: `standalone:${String(weaponIndex)}`,
        weaponIndex,
        x: pickup.x,
        y: 0,
        z: pickup.z,
      })),
    )
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })

  test('translates world placements into simulation-local coordinates without mutation', () => {
    const placements = [{ scopeId: 'building:a', weaponIndex: 2, x: 14, y: 3, z: -3 }] as const

    expect(translateZombieEscapeWeaponPickupPlacements(placements, { x: 10, z: -8 })).toEqual([
      { scopeId: 'building:a', weaponIndex: 2, x: 4, y: 3, z: 5 },
    ])
    expect(placements[0]).toEqual({ scopeId: 'building:a', weaponIndex: 2, x: 14, y: 3, z: -3 })
  })
})
