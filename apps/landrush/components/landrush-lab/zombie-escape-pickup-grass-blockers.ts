import { ZOMBIE_ESCAPE_WEAPON_PICKUPS } from '@landrush/zombie-gameplay/zombie-escape-config'
import type { GrassFieldBlocker } from './grass-field-texture'

// Cover the pedestal at its selected scale; padding and feather match built-object blockers.
const ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS = 0.76 * 1.18
const ZOMBIE_ESCAPE_PICKUP_GRASS_CLEARANCE_METERS = 1
const ZOMBIE_ESCAPE_PICKUP_GRASS_FEATHER_METERS = 0.3
const ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS =
  ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS * Math.SQRT1_2
const ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT = [
  { x: 0, z: -ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS },
  {
    x: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
  { x: ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS, z: 0 },
  {
    x: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
  { x: 0, z: ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS },
  {
    x: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
  { x: -ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT_RADIUS_METERS, z: 0 },
  {
    x: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
    z: -ZOMBIE_ESCAPE_PICKUP_GRASS_DIAGONAL_METERS,
  },
] as const

export function createZombieEscapeWeaponPickupGrassBlockers(
  spawn: Readonly<{ x: number; z: number }>,
): readonly GrassFieldBlocker[] {
  return ZOMBIE_ESCAPE_WEAPON_PICKUPS.map((pickup) => ({
    clearanceMeters: ZOMBIE_ESCAPE_PICKUP_GRASS_CLEARANCE_METERS,
    featherMeters: ZOMBIE_ESCAPE_PICKUP_GRASS_FEATHER_METERS,
    points: ZOMBIE_ESCAPE_PICKUP_GRASS_FOOTPRINT.map((offset) => ({
      x: spawn.x + pickup.x + offset.x,
      z: spawn.z + pickup.z + offset.z,
    })),
  }))
}
