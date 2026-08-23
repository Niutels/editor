import { ZOMBIE_ESCAPE_CAPACITY, ZOMBIE_ESCAPE_ZOMBIE_VARIANT_COUNT } from './zombie-escape-config'

export const ZOMBIE_ESCAPE_ZOMBIE_GAIT = {
  runner: 1,
  walker: 0,
} as const

export type ZombieEscapeZombieGait =
  (typeof ZOMBIE_ESCAPE_ZOMBIE_GAIT)[keyof typeof ZOMBIE_ESCAPE_ZOMBIE_GAIT]

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
  capacity = ZOMBIE_ESCAPE_CAPACITY.zombies,
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

export function createZombieEscapeGaitByPoolSlot(
  seed: number,
  capacity = ZOMBIE_ESCAPE_CAPACITY.zombies,
) {
  const resolvedCapacity = Math.max(0, Math.floor(capacity))
  const gaits = new Uint8Array(resolvedCapacity)
  const runnerCount = Math.floor(resolvedCapacity / 2)
  gaits.fill(ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner, 0, runnerCount)
  return shuffleZombieEscapeRoster(gaits, seed, 0x6a09_e667)
}
