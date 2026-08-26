export const ZOMBIE_ESCAPE_BLOOD_VARIANTS = [
  {
    code: 0,
    dropletCount: 14,
    dropletGeometry: 'icosahedron',
    id: 'wet-hybrid',
    label: 'Wet hybrid',
    residueCount: 3,
    splashCount: 6,
    splashGeometry: 'capsule',
  },
  {
    code: 1,
    dropletCount: 32,
    dropletGeometry: 'tetrahedron',
    id: 'fine-mist',
    label: 'Fine mist',
    residueCount: 2,
    splashCount: 3,
    splashGeometry: 'needle',
  },
  {
    code: 2,
    dropletCount: 8,
    dropletGeometry: 'dodecahedron',
    id: 'heavy-clots',
    label: 'Heavy clots',
    residueCount: 2,
    splashCount: 3,
    splashGeometry: 'clot',
  },
  {
    code: 3,
    dropletCount: 3,
    dropletGeometry: 'icosahedron',
    id: 'surface-splat',
    label: 'Surface splat',
    residueCount: 3,
    splashCount: 1,
    splashGeometry: 'fan',
  },
  {
    code: 4,
    dropletCount: 10,
    dropletGeometry: 'icosahedron',
    id: 'viscous-strings',
    label: 'Viscous strings',
    residueCount: 3,
    splashCount: 6,
    splashGeometry: 'string',
  },
] as const

export type ZombieEscapeBloodVariant = (typeof ZOMBIE_ESCAPE_BLOOD_VARIANTS)[number]['id']
export type ZombieEscapeBloodVariantCode = (typeof ZOMBIE_ESCAPE_BLOOD_VARIANTS)[number]['code']
export type ZombieEscapeBloodVariantProfile = (typeof ZOMBIE_ESCAPE_BLOOD_VARIANTS)[number]

export const DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT: ZombieEscapeBloodVariant = 'wet-hybrid'
export const DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE: ZombieEscapeBloodVariantCode = 0
export const ZOMBIE_ESCAPE_BLOOD_CLOSE_RANGE_METERS = 4
export const ZOMBIE_ESCAPE_BLOOD_HEAVY_DAMAGE_THRESHOLD = 50
export const ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT = 6
export const ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT = 32
export const ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT = 4

export function isZombieEscapeBloodVariant(
  value: string | null,
): value is ZombieEscapeBloodVariant {
  return ZOMBIE_ESCAPE_BLOOD_VARIANTS.some((variant) => variant.id === value)
}

export function resolveZombieEscapeBloodVariant(
  value: string | null | undefined,
): ZombieEscapeBloodVariant {
  const candidate = value ?? null
  return isZombieEscapeBloodVariant(candidate) ? candidate : DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT
}

export function getZombieEscapeBloodVariantProfile(
  variant: ZombieEscapeBloodVariant,
): ZombieEscapeBloodVariantProfile {
  return ZOMBIE_ESCAPE_BLOOD_VARIANTS.find((profile) => profile.id === variant)!
}

export function resolveZombieEscapeBloodVariantCode(
  value: number | null | undefined,
): ZombieEscapeBloodVariantCode {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4
    ? value
    : DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE
}

export function resolveZombieEscapeBloodHitVariantCode(
  damage: number,
  distanceSquared: number,
): ZombieEscapeBloodVariantCode {
  if (Number.isFinite(damage) && damage >= ZOMBIE_ESCAPE_BLOOD_HEAVY_DAMAGE_THRESHOLD) return 2
  if (
    Number.isFinite(distanceSquared) &&
    distanceSquared >= 0 &&
    distanceSquared <= ZOMBIE_ESCAPE_BLOOD_CLOSE_RANGE_METERS ** 2
  ) {
    return 4
  }
  return DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE
}
