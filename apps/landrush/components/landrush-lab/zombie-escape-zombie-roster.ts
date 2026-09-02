import {
  LANDRUSH_ISLAND_AMBIENT_NPCS,
  type LandrushIslandAmbientNpc,
} from './landrush-island-ambient-catalog'
import { ZOMBIE_ESCAPE_CAPACITY } from './zombie-escape-config'
import {
  ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS,
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
} from './zombie-escape-zombie-catalog'

export const ZOMBIE_ESCAPE_ZOMBIE_GAIT = {
  runner: 1,
  walker: 0,
} as const

export type ZombieEscapeZombieGait =
  (typeof ZOMBIE_ESCAPE_ZOMBIE_GAIT)[keyof typeof ZOMBIE_ESCAPE_ZOMBIE_GAIT]

export type ZombieEscapeAmbientNpcSourceId = LandrushIslandAmbientNpc['id']

export const ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS: readonly ZombieEscapeAmbientNpcSourceId[] =
  Object.freeze(LANDRUSH_ISLAND_AMBIENT_NPCS.map(({ id }) => id))

const ZOMBIE_ESCAPE_AMBIENT_NPC_VARIANT_BY_NPC_INDEX = Uint8Array.from(
  ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
  (sourceNpcId, npcIndex) => {
    const variant = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.findIndex(
      (zombie) => zombie.sourceNpcId === sourceNpcId,
    )
    if (variant < 0) throw new Error(`Missing zombie variant for ambient NPC: ${sourceNpcId}`)
    if (ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variant]!.bodyClass === 'standard') return variant
    const fallback =
      ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS[
        npcIndex % ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS.length
      ]
    if (fallback === undefined) throw new Error('Zombie Escape requires a standard zombie variant')
    return fallback
  },
)

export type ZombieEscapeZombieRoster = Readonly<{
  sourceNpcIdByPoolSlot: readonly (ZombieEscapeAmbientNpcSourceId | null)[]
  variantByPoolSlot: Uint8Array
}>

const ZOMBIE_ESCAPE_REGULAR_SPEED_MINIMUM = 0.9
const ZOMBIE_ESCAPE_REGULAR_SPEED_MAXIMUM = 1.12
const ZOMBIE_ESCAPE_SPRINTER_SPEED_MINIMUM = 1.3
const ZOMBIE_ESCAPE_SPRINTER_SPEED_MAXIMUM = 1.55

function mixZombieEscapeSpawnIdentity(seed: number, ...values: readonly number[]) {
  let value = (Math.trunc(seed) ^ 0x9e37_79b9) >>> 0
  for (const input of values) {
    value ^= Math.trunc(input) >>> 0
    value = Math.imul(value ^ (value >>> 16), 0x21f0_aaad)
    value = Math.imul(value ^ (value >>> 15), 0x735a_2d97)
    value ^= value >>> 15
  }
  return value >>> 0
}

export function resolveZombieEscapeSpawnSpeedScale(
  seed: number,
  spawnOrdinal: number,
  maximumSpeedMultiplier = 1,
) {
  const lane = Math.max(0, Math.trunc(spawnOrdinal)) % 5
  const blockOrdinal = Math.floor(Math.max(0, Math.trunc(spawnOrdinal)) / 5)
  const sprinterLane = mixZombieEscapeSpawnIdentity(seed, blockOrdinal, 0x52ab_91d3) % 5
  const amount = mixZombieEscapeSpawnIdentity(seed, spawnOrdinal, 0x8f6c_a231) / 0x1_0000_0000
  const resolvedMaximumSpeedMultiplier = Number.isFinite(maximumSpeedMultiplier)
    ? Math.max(1, maximumSpeedMultiplier)
    : 1
  const minimum =
    lane === sprinterLane
      ? ZOMBIE_ESCAPE_SPRINTER_SPEED_MINIMUM
      : ZOMBIE_ESCAPE_REGULAR_SPEED_MINIMUM
  const baseMaximum =
    lane === sprinterLane
      ? ZOMBIE_ESCAPE_SPRINTER_SPEED_MAXIMUM
      : ZOMBIE_ESCAPE_REGULAR_SPEED_MAXIMUM
  const maximum = baseMaximum * resolvedMaximumSpeedMultiplier
  return minimum + (maximum - minimum) * amount
}

export function resolveZombieEscapeProjectileSlowdownMultiplier(
  seed: number,
  spawnOrdinal: number,
  projectileHitOrdinal: number,
) {
  const basisPoints = resolveZombieEscapeProjectileSlowdownBasisPoints(
    seed,
    spawnOrdinal,
    projectileHitOrdinal,
  )
  return 1 - basisPoints / 40_000
}

export function resolveZombieEscapeFirstProjectileSlowdownMultiplier(
  seed: number,
  spawnOrdinal: number,
  walkMetersPerSecond: number,
  runMetersPerSecond: number,
) {
  const runSpeed = Number.isFinite(runMetersPerSecond) ? Math.max(0, runMetersPerSecond) : 0
  if (runSpeed <= 0.000_001) {
    return resolveZombieEscapeProjectileSlowdownMultiplier(seed, spawnOrdinal, 0)
  }
  const walkSpeed = Number.isFinite(walkMetersPerSecond) ? Math.max(0, walkMetersPerSecond) : 0
  const legacyHitMultiplier =
    1 - resolveZombieEscapeProjectileSlowdownBasisPoints(seed, spawnOrdinal, 0) / 10_000
  const legacyPostHitSpeedRatio = Math.max(
    0,
    Math.min(1, (walkSpeed / runSpeed) * legacyHitMultiplier),
  )
  return 1 - (1 - legacyPostHitSpeedRatio) * 0.25
}

function resolveZombieEscapeProjectileSlowdownBasisPoints(
  seed: number,
  spawnOrdinal: number,
  projectileHitOrdinal: number,
) {
  return (
    100 +
    (mixZombieEscapeSpawnIdentity(seed, spawnOrdinal, projectileHitOrdinal, 0x63d8_35f1) % 901)
  )
}

function shuffleZombieEscapeRoster(values: Uint8Array, seed: number, salt: number) {
  let random = (Math.trunc(seed) ^ salt) >>> 0
  for (let slot = values.length - 1; slot > 0; slot -= 1) {
    random ^= random << 13
    random ^= random >>> 17
    random ^= random << 5
    random >>>= 0
    const swapSlot = random % (slot + 1)
    const value = values[slot]!
    values[slot] = values[swapSlot]!
    values[swapSlot] = value
  }
  return values
}

export function createZombieEscapeVariantByPoolSlot(
  seed: number,
  capacity: number = ZOMBIE_ESCAPE_CAPACITY.zombies,
) {
  const resolvedCapacity = Math.max(0, Math.floor(capacity))
  const variants = new Uint8Array(resolvedCapacity)
  const ambientPrefixCount = Math.min(
    variants.length,
    ZOMBIE_ESCAPE_AMBIENT_NPC_VARIANT_BY_NPC_INDEX.length,
  )
  for (let slot = 0; slot < ambientPrefixCount; slot += 1) {
    variants[slot] = ZOMBIE_ESCAPE_AMBIENT_NPC_VARIANT_BY_NPC_INDEX[slot]!
  }
  for (let slot = ambientPrefixCount; slot < variants.length; slot += 1) {
    variants[slot] =
      ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS[
        (slot - ambientPrefixCount) % ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS.length
      ]!
  }

  return shuffleZombieEscapeRosterSuffix(variants, seed, 0x9e37_79b9, ambientPrefixCount)
}

export function createZombieEscapeZombieRoster(
  seed: number,
  capacity: number = ZOMBIE_ESCAPE_CAPACITY.zombies,
): ZombieEscapeZombieRoster {
  const variantByPoolSlot = createZombieEscapeVariantByPoolSlot(seed, capacity)
  const sourceNpcIdByPoolSlot: (ZombieEscapeAmbientNpcSourceId | null)[] = Array.from(
    { length: variantByPoolSlot.length },
    (_, slot) => ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS[slot] ?? null,
  )
  return { sourceNpcIdByPoolSlot, variantByPoolSlot }
}

function shuffleZombieEscapeRosterSuffix(
  values: Uint8Array,
  seed: number,
  salt: number,
  start: number,
) {
  const suffix = values.subarray(Math.max(0, Math.min(values.length, Math.trunc(start))))
  shuffleZombieEscapeRoster(suffix, seed, salt)
  return values
}
