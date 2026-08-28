export type ZombieEscapeWeaponVfxStyleId = 'pistol' | 'carbine' | 'scattergun' | 'coil' | 'launcher'

export type ZombieEscapeWeaponVfxTravelPattern =
  | 'bolt'
  | 'rail'
  | 'helix'
  | 'needle'
  | 'prism'
  | 'ribbon'
  | 'fan'
  | 'boom'
  | 'salt'
  | 'chunky'
  | 'splinter'
  | 'pulse'
  | 'rocket'

export type ZombieEscapeWeaponVfxImpactPattern =
  | 'compact'
  | 'star'
  | 'splinters'
  | 'sun-flare'
  | 'ricochet'
  | 'facets'
  | 'salt'
  | 'coral'
  | 'driftwood'

export type ZombieEscapeWeaponVfxArcPattern =
  | 'none'
  | 'jagged'
  | 'twin-fork'
  | 'pulse-nodes'
  | 'ion-ribbon'
  | 'copper-strobe'

export type ZombieEscapeWeaponVfxBlastPattern =
  | 'none'
  | 'faceted'
  | 'shards'
  | 'geyser'
  | 'mushroom'
  | 'implosion'

export type ZombieEscapeWeaponVfxStyle = Readonly<{
  accentColor: number
  accentLengthScale: number
  accentOffsetMeters: number
  accentRadius: number
  arcPattern: ZombieEscapeWeaponVfxArcPattern
  arcColorA: number
  arcColorB: number
  blastCloudScale: number
  blastPattern: ZombieEscapeWeaponVfxBlastPattern
  detailColorA: number
  detailColorB: number
  id: ZombieEscapeWeaponVfxStyleId
  impactPattern: ZombieEscapeWeaponVfxImpactPattern
  impactColor: number
  impactFlashScale: number
  impactStretchScale: number
  muzzleColor: number
  muzzleLengthScale: number
  muzzleRadiusScale: number
  sparkColor: number
  sparkCount: number
  sparkScale: number
  tracerColor: number
  tracerLengthScale: number
  tracerMinimumHalfLength: number
  tracerRadius: number
  travelPattern: ZombieEscapeWeaponVfxTravelPattern
  variantIndex: number
  variantLabel: string
}>

export type ZombieEscapeWeaponVfxPoint = {
  x: number
  y: number
  z: number
}

export const ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT = 6
export const ZOMBIE_ESCAPE_COIL_ARC_BRANCH_COUNT = 2
export const ZOMBIE_ESCAPE_COIL_ARC_NODE_COUNT = 7
export const ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT = 12
export const ZOMBIE_ESCAPE_TRAVEL_DETAIL_COUNT = 8
export const ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT = 12
export const ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT = 5
export const ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT = 5

type ZombieEscapeWeaponVfxVariantFields = Pick<
  ZombieEscapeWeaponVfxStyle,
  | 'arcPattern'
  | 'blastPattern'
  | 'detailColorA'
  | 'detailColorB'
  | 'impactPattern'
  | 'travelPattern'
  | 'variantIndex'
  | 'variantLabel'
>

type ZombieEscapeWeaponVfxBaseStyle = Omit<
  ZombieEscapeWeaponVfxStyle,
  keyof ZombieEscapeWeaponVfxVariantFields
>

type ZombieEscapeWeaponVfxVariantDefinition = ZombieEscapeWeaponVfxVariantFields &
  Partial<ZombieEscapeWeaponVfxBaseStyle>

const PISTOL_BASE_STYLE = {
  accentColor: 0,
  accentLengthScale: 0,
  accentOffsetMeters: 0,
  accentRadius: 0,
  arcColorA: 0,
  arcColorB: 0,
  blastCloudScale: 1,
  id: 'pistol',
  impactColor: 0xff9a3d,
  impactFlashScale: 0.22,
  impactStretchScale: 0.65,
  muzzleColor: 0xfff0a8,
  muzzleLengthScale: 0.88,
  muzzleRadiusScale: 0.9,
  sparkColor: 0xffd579,
  sparkCount: 3,
  sparkScale: 0.82,
  tracerColor: 0xffc45a,
  tracerLengthScale: 1,
  tracerMinimumHalfLength: 0.11,
  tracerRadius: 0.055,
} as const satisfies ZombieEscapeWeaponVfxBaseStyle

const CARBINE_BASE_STYLE = {
  accentColor: 0xff6f61,
  accentLengthScale: 1.08,
  accentOffsetMeters: 0,
  accentRadius: 0.047,
  arcColorA: 0,
  arcColorB: 0,
  blastCloudScale: 1,
  id: 'carbine',
  impactColor: 0x66f3ff,
  impactFlashScale: 0.14,
  impactStretchScale: 2.4,
  muzzleColor: 0x9ff8ff,
  muzzleLengthScale: 1.34,
  muzzleRadiusScale: 0.76,
  sparkColor: 0xff8175,
  sparkCount: 4,
  sparkScale: 0.95,
  tracerColor: 0x70f4ff,
  tracerLengthScale: 1.58,
  tracerMinimumHalfLength: 0.2,
  tracerRadius: 0.026,
} as const satisfies ZombieEscapeWeaponVfxBaseStyle

const SCATTERGUN_BASE_STYLE = {
  accentColor: 0,
  accentLengthScale: 0,
  accentOffsetMeters: 0,
  accentRadius: 0,
  arcColorA: 0,
  arcColorB: 0,
  blastCloudScale: 1,
  id: 'scattergun',
  impactColor: 0xffbd5e,
  impactFlashScale: 0.13,
  impactStretchScale: 0.55,
  muzzleColor: 0xffd06a,
  muzzleLengthScale: 1.42,
  muzzleRadiusScale: 1.72,
  sparkColor: 0xffc86b,
  sparkCount: 3,
  sparkScale: 0.62,
  tracerColor: 0xffc75d,
  tracerLengthScale: 0.66,
  tracerMinimumHalfLength: 0.07,
  tracerRadius: 0.022,
} as const satisfies ZombieEscapeWeaponVfxBaseStyle

const COIL_BASE_STYLE = {
  accentColor: 0xd97936,
  accentLengthScale: 0.92,
  accentOffsetMeters: 0,
  accentRadius: 0.057,
  arcColorA: 0x68f5ff,
  arcColorB: 0xe38a42,
  blastCloudScale: 1,
  id: 'coil',
  impactColor: 0x70f5ff,
  impactFlashScale: 0.16,
  impactStretchScale: 0.85,
  muzzleColor: 0x88f7ff,
  muzzleLengthScale: 1.02,
  muzzleRadiusScale: 0.74,
  sparkColor: 0x85f7ff,
  sparkCount: 4,
  sparkScale: 0.88,
  tracerColor: 0x63f2ff,
  tracerLengthScale: 1.08,
  tracerMinimumHalfLength: 0.12,
  tracerRadius: 0.034,
} as const satisfies ZombieEscapeWeaponVfxBaseStyle

const LAUNCHER_BASE_STYLE = {
  accentColor: 0x64e7ee,
  accentLengthScale: 1.52,
  accentOffsetMeters: -0.18,
  accentRadius: 0.19,
  arcColorA: 0,
  arcColorB: 0,
  blastCloudScale: 1,
  id: 'launcher',
  impactColor: 0xff715a,
  impactFlashScale: 0.82,
  impactStretchScale: 1.05,
  muzzleColor: 0xff6659,
  muzzleLengthScale: 1.82,
  muzzleRadiusScale: 1.58,
  sparkColor: 0xa3fff5,
  sparkCount: 12,
  sparkScale: 1.48,
  tracerColor: 0xfff4e6,
  tracerLengthScale: 0.84,
  tracerMinimumHalfLength: 0.2,
  tracerRadius: 0.12,
} as const satisfies ZombieEscapeWeaponVfxBaseStyle

export const ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS = [
  createWeaponVfxStyle(PISTOL_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xffd579,
    detailColorB: 0xff7b36,
    impactPattern: 'compact',
    travelPattern: 'bolt',
    variantIndex: 0,
    variantLabel: 'Ember Snap',
  }),
  createWeaponVfxStyle(PISTOL_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xfff7c2,
    detailColorB: 0xff6f3d,
    impactFlashScale: 0.12,
    impactPattern: 'star',
    muzzleColor: 0xffcf8a,
    sparkCount: 0,
    tracerColor: 0xffdf7a,
    travelPattern: 'bolt',
    variantIndex: 1,
    variantLabel: 'Rotating Flint Star',
  }),
  createWeaponVfxStyle(PISTOL_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xffba65,
    detailColorB: 0xfff1b5,
    impactFlashScale: 0.07,
    impactPattern: 'splinters',
    sparkCount: 0,
    tracerRadius: 0.045,
    travelPattern: 'bolt',
    variantIndex: 2,
    variantLabel: 'Impact-First Splinters',
  }),
  createWeaponVfxStyle(PISTOL_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xfff3a2,
    detailColorB: 0xff7b30,
    impactColor: 0xffd35c,
    impactFlashScale: 0.38,
    impactPattern: 'sun-flare',
    impactStretchScale: 0.42,
    sparkCount: 1,
    travelPattern: 'bolt',
    variantIndex: 3,
    variantLabel: 'Short Sun Flare',
  }),
  createWeaponVfxStyle(PISTOL_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0x8bf8ff,
    detailColorB: 0xffbd62,
    impactColor: 0xa9fbff,
    impactFlashScale: 0.09,
    impactPattern: 'ricochet',
    sparkCount: 0,
    tracerColor: 0xffeb96,
    travelPattern: 'bolt',
    variantIndex: 4,
    variantLabel: 'Ricochet Glint',
  }),
  createWeaponVfxStyle(CARBINE_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0x8ffaff,
    detailColorB: 0xff6f61,
    impactPattern: 'compact',
    travelPattern: 'rail',
    variantIndex: 0,
    variantLabel: 'Rail Lance',
  }),
  createWeaponVfxStyle(CARBINE_BASE_STYLE, {
    accentColor: 0x3fbfd0,
    accentRadius: 0.032,
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xc8ffff,
    detailColorB: 0x36cfeb,
    impactColor: 0xbaffff,
    impactPattern: 'facets',
    sparkColor: 0x79efff,
    tracerColor: 0x40ddf4,
    travelPattern: 'helix',
    variantIndex: 1,
    variantLabel: 'Cyan Helix',
  }),
  createWeaponVfxStyle(CARBINE_BASE_STYLE, {
    accentRadius: 0,
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xffffff,
    detailColorB: 0x73edff,
    impactFlashScale: 0.075,
    impactPattern: 'compact',
    impactStretchScale: 3.5,
    sparkCount: 2,
    tracerColor: 0xeaffff,
    tracerLengthScale: 2.05,
    tracerRadius: 0.013,
    travelPattern: 'needle',
    variantIndex: 2,
    variantLabel: 'Needle Pulse',
  }),
  createWeaponVfxStyle(CARBINE_BASE_STYLE, {
    accentRadius: 0,
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0x70f6ff,
    detailColorB: 0xff7769,
    impactPattern: 'facets',
    sparkCount: 5,
    tracerColor: 0xf8ffff,
    travelPattern: 'prism',
    variantIndex: 3,
    variantLabel: 'Prism Segments',
  }),
  createWeaponVfxStyle(CARBINE_BASE_STYLE, {
    accentColor: 0x55e3f0,
    accentRadius: 0.075,
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0x68f6ff,
    detailColorB: 0x2c8399,
    impactColor: 0x67efff,
    impactPattern: 'facets',
    sparkCount: 3,
    tracerColor: 0xc8ffff,
    travelPattern: 'ribbon',
    variantIndex: 4,
    variantLabel: 'Wake Ribbon',
  }),
  createWeaponVfxStyle(SCATTERGUN_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xffcf77,
    detailColorB: 0xff8754,
    impactPattern: 'compact',
    travelPattern: 'fan',
    variantIndex: 0,
    variantLabel: 'Horizontal Buck Fan',
  }),
  createWeaponVfxStyle(SCATTERGUN_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xff8e28,
    detailColorB: 0xff4d12,
    impactColor: 0xffd078,
    impactFlashScale: 0.2,
    impactPattern: 'compact',
    muzzleColor: 0xffc465,
    muzzleLengthScale: 0.32,
    muzzleRadiusScale: 0.65,
    sparkCount: 1,
    tracerLengthScale: 0.48,
    tracerRadius: 0.035,
    travelPattern: 'boom',
    variantIndex: 1,
    variantLabel: 'Classic Boom Fan',
  }),
  createWeaponVfxStyle(SCATTERGUN_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xe9fff4,
    detailColorB: 0xa6e7d4,
    impactColor: 0xd5fff0,
    impactPattern: 'salt',
    sparkColor: 0xe9fff4,
    sparkCount: 8,
    sparkScale: 0.45,
    tracerColor: 0xe5f6d6,
    tracerRadius: 0.016,
    travelPattern: 'salt',
    variantIndex: 2,
    variantLabel: 'Salt Spray',
  }),
  createWeaponVfxStyle(SCATTERGUN_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xff7f68,
    detailColorB: 0xffc07d,
    impactColor: 0xff765f,
    impactFlashScale: 0.19,
    impactPattern: 'coral',
    sparkColor: 0xffa56e,
    sparkCount: 4,
    tracerColor: 0xff7965,
    tracerLengthScale: 0.56,
    tracerRadius: 0.045,
    travelPattern: 'chunky',
    variantIndex: 3,
    variantLabel: 'Coral Buckshot',
  }),
  createWeaponVfxStyle(SCATTERGUN_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'none',
    detailColorA: 0xd6a15c,
    detailColorB: 0x7f4c2e,
    impactColor: 0xe8b66c,
    impactFlashScale: 0.08,
    impactPattern: 'driftwood',
    sparkCount: 0,
    tracerColor: 0xb7773e,
    tracerLengthScale: 1.05,
    tracerRadius: 0.018,
    travelPattern: 'splinter',
    variantIndex: 4,
    variantLabel: 'Driftwood Splinters',
  }),
  createWeaponVfxStyle(COIL_BASE_STYLE, {
    arcPattern: 'jagged',
    blastPattern: 'none',
    detailColorA: 0x72f7ff,
    detailColorB: 0xe38a42,
    impactPattern: 'compact',
    travelPattern: 'pulse',
    variantIndex: 0,
    variantLabel: 'Jagged Chain',
  }),
  createWeaponVfxStyle(COIL_BASE_STYLE, {
    arcColorA: 0xeaffff,
    arcColorB: 0x6cefff,
    arcPattern: 'twin-fork',
    blastPattern: 'none',
    detailColorA: 0xeaffff,
    detailColorB: 0x75eaff,
    impactPattern: 'compact',
    sparkCount: 2,
    travelPattern: 'pulse',
    variantIndex: 1,
    variantLabel: 'Twin Fork',
  }),
  createWeaponVfxStyle(COIL_BASE_STYLE, {
    accentRadius: 0.03,
    arcColorA: 0xb9ffff,
    arcColorB: 0x61e7ff,
    arcPattern: 'pulse-nodes',
    blastPattern: 'none',
    detailColorA: 0xe6ffff,
    detailColorB: 0x4bdcf5,
    impactPattern: 'facets',
    sparkCount: 2,
    travelPattern: 'pulse',
    variantIndex: 2,
    variantLabel: 'Pulse Nodes',
  }),
  createWeaponVfxStyle(COIL_BASE_STYLE, {
    accentColor: 0x4ad9ec,
    accentRadius: 0.09,
    arcColorA: 0x93fbff,
    arcColorB: 0x39b8d0,
    arcPattern: 'ion-ribbon',
    blastPattern: 'none',
    detailColorA: 0xbfffff,
    detailColorB: 0x3ed0e5,
    impactPattern: 'facets',
    sparkCount: 1,
    travelPattern: 'ribbon',
    variantIndex: 3,
    variantLabel: 'Ion Ribbon',
  }),
  createWeaponVfxStyle(COIL_BASE_STYLE, {
    arcColorA: 0xffb05e,
    arcColorB: 0x70f4ff,
    arcPattern: 'copper-strobe',
    blastPattern: 'none',
    detailColorA: 0xffc273,
    detailColorB: 0x6cf5ff,
    impactColor: 0xffa755,
    impactPattern: 'compact',
    muzzleColor: 0xffb85f,
    sparkColor: 0xffbc67,
    tracerColor: 0xffae58,
    travelPattern: 'pulse',
    variantIndex: 4,
    variantLabel: 'Copper Strobe',
  }),
  createWeaponVfxStyle(LAUNCHER_BASE_STYLE, {
    arcPattern: 'none',
    blastPattern: 'faceted',
    detailColorA: 0xff765e,
    detailColorB: 0x91fff6,
    impactPattern: 'compact',
    travelPattern: 'rocket',
    variantIndex: 0,
    variantLabel: 'Faceted Core',
  }),
  createWeaponVfxStyle(LAUNCHER_BASE_STYLE, {
    accentColor: 0xff8e75,
    arcPattern: 'none',
    blastCloudScale: 2,
    blastPattern: 'shards',
    detailColorA: 0xff765e,
    detailColorB: 0xffc487,
    impactColor: 0xff866d,
    impactFlashScale: 0.56,
    impactPattern: 'compact',
    sparkColor: 0xffb16e,
    sparkCount: 8,
    travelPattern: 'rocket',
    variantIndex: 1,
    variantLabel: 'Coral Shard Bloom',
  }),
  createWeaponVfxStyle(LAUNCHER_BASE_STYLE, {
    accentColor: 0x58dae8,
    arcPattern: 'none',
    blastPattern: 'geyser',
    detailColorA: 0xc2ffff,
    detailColorB: 0x48d8e8,
    impactColor: 0x7cefff,
    impactPattern: 'compact',
    muzzleColor: 0x78f4ff,
    sparkColor: 0xbaffff,
    tracerColor: 0xeaffff,
    travelPattern: 'rocket',
    variantIndex: 2,
    variantLabel: 'Aqua Geyser',
  }),
  createWeaponVfxStyle(LAUNCHER_BASE_STYLE, {
    accentColor: 0xff9864,
    arcPattern: 'none',
    blastPattern: 'mushroom',
    detailColorA: 0xffa06a,
    detailColorB: 0xffe099,
    impactColor: 0xff7a52,
    impactPattern: 'compact',
    sparkColor: 0xffd38a,
    tracerColor: 0xffe4bd,
    travelPattern: 'rocket',
    variantIndex: 3,
    variantLabel: 'Ember Mushroom',
  }),
  createWeaponVfxStyle(LAUNCHER_BASE_STYLE, {
    accentColor: 0x72f6ee,
    arcPattern: 'none',
    blastPattern: 'implosion',
    detailColorA: 0xd8ffff,
    detailColorB: 0xff6573,
    impactColor: 0xf3ffff,
    impactFlashScale: 0.48,
    impactPattern: 'compact',
    sparkColor: 0x8cfff3,
    sparkCount: 6,
    tracerColor: 0xa7fff6,
    travelPattern: 'rocket',
    variantIndex: 4,
    variantLabel: 'Implosion Pop',
  }),
] as const satisfies readonly ZombieEscapeWeaponVfxStyle[]

export const ZOMBIE_ESCAPE_PRODUCTION_WEAPON_VFX_VARIANT_INDICES = [0, 4, 1, 1, 1] as const

export const ZOMBIE_ESCAPE_WEAPON_VFX_STYLES = [
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[0],
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[9],
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[11],
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[16],
  ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[21],
] as const satisfies readonly ZombieEscapeWeaponVfxStyle[]

const FALLBACK_STYLE = ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[0]

export function resolveZombieEscapeWeaponVfxStyle(
  weaponIndex: number,
  variantIndex?: number,
): ZombieEscapeWeaponVfxStyle {
  if (!Number.isFinite(weaponIndex)) return FALLBACK_STYLE
  const resolvedWeaponIndex = Math.trunc(weaponIndex)
  if (resolvedWeaponIndex < 0 || resolvedWeaponIndex >= ZOMBIE_ESCAPE_WEAPON_VFX_STYLES.length) {
    return FALLBACK_STYLE
  }
  const productionVariantIndex =
    ZOMBIE_ESCAPE_PRODUCTION_WEAPON_VFX_VARIANT_INDICES[resolvedWeaponIndex] ?? 0
  const resolvedVariantIndex =
    variantIndex !== undefined &&
    Number.isFinite(variantIndex) &&
    Math.trunc(variantIndex) >= 0 &&
    Math.trunc(variantIndex) < ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT
      ? Math.trunc(variantIndex)
      : productionVariantIndex
  return (
    ZOMBIE_ESCAPE_WEAPON_VFX_VARIANTS[
      resolvedWeaponIndex * ZOMBIE_ESCAPE_WEAPON_VFX_VARIANT_COUNT + resolvedVariantIndex
    ] ?? FALLBACK_STYLE
  )
}

function createWeaponVfxStyle(
  base: ZombieEscapeWeaponVfxBaseStyle,
  variant: ZombieEscapeWeaponVfxVariantDefinition,
): ZombieEscapeWeaponVfxStyle {
  return { ...base, ...variant }
}

export function resolveZombieEscapeVfxNormalizedAge(age: number, lifetime: number) {
  if (!(Number.isFinite(age) && Number.isFinite(lifetime) && lifetime > 0)) return 1
  return Math.min(1, Math.max(0, age / lifetime))
}

export function resolveZombieEscapeVfxImpactEnvelope(normalizedAge: number) {
  const progress = Number.isFinite(normalizedAge) ? Math.min(1, Math.max(0, normalizedAge)) : 1
  const remaining = 1 - progress
  return remaining * remaining
}

export function resolveZombieEscapeScattergunMuzzlePetalEnvelope(normalizedAge: number) {
  if (!Number.isFinite(normalizedAge)) return 0
  const progress = Math.min(1, Math.max(0, normalizedAge))
  const attack = Math.min(1, progress / 0.18)
  return attack * (1 - progress) ** 1.65
}

export function resolveZombieEscapeVfxBlastScale(normalizedAge: number) {
  const progress = Number.isFinite(normalizedAge) ? Math.min(1, Math.max(0, normalizedAge)) : 1
  const expansion = 0.24 + 1.18 * (1 - (1 - progress) ** 4)
  return expansion * (1 - progress) ** 1.15
}

export function resolveZombieEscapeCoilArcPoint(
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  seed: number,
  pointIndex: number,
  segmentCount: number,
  result: ZombieEscapeWeaponVfxPoint,
) {
  const resolvedSegmentCount = Math.max(1, Math.trunc(segmentCount))
  const resolvedPointIndex = Math.min(resolvedSegmentCount, Math.max(0, Math.trunc(pointIndex)))
  const progress = resolvedPointIndex / resolvedSegmentCount
  const deltaX = targetX - sourceX
  const deltaY = targetY - sourceY
  const deltaZ = targetZ - sourceZ
  result.x = sourceX + deltaX * progress
  result.y = sourceY + deltaY * progress
  result.z = sourceZ + deltaZ * progress
  if (resolvedPointIndex === 0 || resolvedPointIndex === resolvedSegmentCount) return result

  const length = Math.hypot(deltaX, deltaY, deltaZ)
  if (length <= 0.000_001) return result
  const directionX = deltaX / length
  const directionY = deltaY / length
  const directionZ = deltaZ / length
  const referenceX = Math.abs(directionY) < 0.86 ? 0 : 1
  const referenceY = Math.abs(directionY) < 0.86 ? 1 : 0
  let sideX = directionY * 0 - directionZ * referenceY
  let sideY = directionZ * referenceX - directionX * 0
  let sideZ = directionX * referenceY - directionY * referenceX
  const sideLength = Math.max(0.000_001, Math.hypot(sideX, sideY, sideZ))
  sideX /= sideLength
  sideY /= sideLength
  sideZ /= sideLength
  const upX = sideY * directionZ - sideZ * directionY
  const upY = sideZ * directionX - sideX * directionZ
  const upZ = sideX * directionY - sideY * directionX
  const ordinalSeed = seed ^ Math.imul(resolvedPointIndex + 1, 0x9e37_79b1)
  const sideNoise = hashSignedUnit(ordinalSeed ^ 0x85eb_ca6b)
  const upNoise = hashSignedUnit(ordinalSeed ^ 0xc2b2_ae35)
  const envelope = Math.sin(Math.PI * progress)
  const amplitude = Math.min(0.16, Math.max(0.055, length * 0.045)) * envelope
  result.x += (sideX * sideNoise + upX * upNoise) * amplitude
  result.y += (sideY * sideNoise + upY * upNoise) * amplitude
  result.z += (sideZ * sideNoise + upZ * upNoise) * amplitude
  return result
}

function hashSignedUnit(seed: number) {
  let value = seed >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d)
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b)
  value ^= value >>> 16
  return ((value >>> 0) / 2_147_483_648 - 1) * 0.92
}
