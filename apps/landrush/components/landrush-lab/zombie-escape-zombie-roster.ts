import { ZOMBIE_ESCAPE_CAPACITY, ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT } from './zombie-escape-config'

export const ZOMBIE_ESCAPE_ZOMBIE_GAIT = {
  runner: 1,
  walker: 0,
} as const

export type ZombieEscapeZombieGait =
  (typeof ZOMBIE_ESCAPE_ZOMBIE_GAIT)[keyof typeof ZOMBIE_ESCAPE_ZOMBIE_GAIT]

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
  const basisPoints =
    100 +
    (mixZombieEscapeSpawnIdentity(seed, spawnOrdinal, projectileHitOrdinal, 0x63d8_35f1) % 901)
  return 1 - basisPoints / 10_000
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
  variantCount = ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT,
) {
  const resolvedCapacity = Math.max(0, Math.floor(capacity))
  const resolvedVariantCount = Math.max(1, Math.min(256, Math.floor(variantCount)))
  const variants = new Uint8Array(resolvedCapacity)
  for (let slot = 0; slot < variants.length; slot += 1) {
    variants[slot] = slot % resolvedVariantCount
  }

  return shuffleZombieEscapeRoster(variants, seed, 0x9e37_79b9)
}
