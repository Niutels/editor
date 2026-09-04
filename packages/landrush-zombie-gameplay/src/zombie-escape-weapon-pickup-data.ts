import { ZOMBIE_ESCAPE_WEAPON_PICKUPS } from './zombie-escape-config'

export type ZombieEscapeWeaponPickupPlacement = Readonly<{
  scopeId: string
  weaponIndex: number
  x: number
  y: number
  z: number
}>

export function createZombieEscapeFallbackWeaponPickupPlacements(): readonly ZombieEscapeWeaponPickupPlacement[] {
  return ZOMBIE_ESCAPE_WEAPON_PICKUPS.map((pickup, weaponIndex) => ({
    scopeId: `standalone:${String(weaponIndex)}`,
    weaponIndex,
    x: pickup.x,
    y: 0,
    z: pickup.z,
  }))
}

export function translateZombieEscapeWeaponPickupPlacements(
  placements: readonly ZombieEscapeWeaponPickupPlacement[],
  origin: Readonly<{ x: number; z: number }>,
): readonly ZombieEscapeWeaponPickupPlacement[] {
  return placements.map((placement) => ({
    ...placement,
    x: placement.x - origin.x,
    z: placement.z - origin.z,
  }))
}
