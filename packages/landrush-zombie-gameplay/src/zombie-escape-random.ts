export type ZombieEscapeRandomState = {
  value: number
}

export function createZombieEscapeRandomState(seed: number): ZombieEscapeRandomState {
  return { value: normalizeZombieEscapeSeed(seed) }
}

export function resetZombieEscapeRandomState(state: ZombieEscapeRandomState, seed: number) {
  state.value = normalizeZombieEscapeSeed(seed)
}

export function nextZombieEscapeRandom(state: ZombieEscapeRandomState) {
  let value = (state.value + 0x6d2b_79f5) | 0
  state.value = value
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
}

export function zombieEscapeRandomRange(
  state: ZombieEscapeRandomState,
  minimum: number,
  maximum: number,
) {
  return minimum + (maximum - minimum) * nextZombieEscapeRandom(state)
}

function normalizeZombieEscapeSeed(seed: number) {
  const normalized = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1
  return normalized === 0 ? 1 : normalized
}
