import {
  acquireZombieEscapePoolSlot,
  createZombieEscapeFixedPool,
  releaseZombieEscapePoolSlot,
  resetZombieEscapeFixedPool,
  type ZombieEscapeFixedPool,
} from './zombie-escape-pool'

export const ZOMBIE_ESCAPE_BLOOD_EFFECT = Object.freeze({
  dropletsPerEvent: 10,
  lifetimeSeconds: 0.46,
  residueBlotsPerEvent: 3,
  splashLobesPerEvent: 4,
})
const BLOOD_TIME_EPSILON_SECONDS = 1e-9

export type ZombieEscapeBloodEventPool = {
  directionX: Float32Array
  directionY: Float32Array
  directionZ: Float32Array
  normalX: Float32Array
  normalY: Float32Array
  normalZ: Float32Array
  originX: Float32Array
  originY: Float32Array
  originZ: Float32Array
  pool: ZombieEscapeFixedPool
  seed: Uint32Array
  spawnElapsedSeconds: Float64Array
  targetGeneration: Uint32Array
  targetSlot: Int32Array
}

export type ZombieEscapeBloodEvent = {
  directionX: number
  directionY: number
  directionZ: number
  normalX: number
  normalY: number
  normalZ: number
  originX: number
  originY: number
  originZ: number
  seed: number
  spawnElapsedSeconds: number
  targetGeneration: number
  targetSlot: number
}

export type ZombieEscapeBloodEnvelope = {
  droplet: number
  normalizedAge: number
  residue: number
  splash: number
}

export function createZombieEscapeBloodEventPool(capacity: number): ZombieEscapeBloodEventPool {
  const pool = createZombieEscapeFixedPool(capacity)
  const targetSlot = new Int32Array(pool.capacity)
  targetSlot.fill(-1)
  return {
    directionX: new Float32Array(pool.capacity),
    directionY: new Float32Array(pool.capacity),
    directionZ: new Float32Array(pool.capacity),
    normalX: new Float32Array(pool.capacity),
    normalY: new Float32Array(pool.capacity),
    normalZ: new Float32Array(pool.capacity),
    originX: new Float32Array(pool.capacity),
    originY: new Float32Array(pool.capacity),
    originZ: new Float32Array(pool.capacity),
    pool,
    seed: new Uint32Array(pool.capacity),
    spawnElapsedSeconds: new Float64Array(pool.capacity),
    targetGeneration: new Uint32Array(pool.capacity),
    targetSlot,
  }
}

export function spawnZombieEscapeBloodEvent(
  events: ZombieEscapeBloodEventPool,
  event: ZombieEscapeBloodEvent,
) {
  const slot = acquireZombieEscapePoolSlot(events.pool)
  events.directionX[slot] = event.directionX
  events.directionY[slot] = event.directionY
  events.directionZ[slot] = event.directionZ
  events.normalX[slot] = event.normalX
  events.normalY[slot] = event.normalY
  events.normalZ[slot] = event.normalZ
  events.originX[slot] = event.originX
  events.originY[slot] = event.originY
  events.originZ[slot] = event.originZ
  events.seed[slot] = event.seed >>> 0
  events.spawnElapsedSeconds[slot] = event.spawnElapsedSeconds
  events.targetGeneration[slot] = event.targetGeneration >>> 0
  events.targetSlot[slot] = event.targetSlot
  return slot
}

export function releaseZombieEscapeBloodEvent(events: ZombieEscapeBloodEventPool, slot: number) {
  return releaseZombieEscapePoolSlot(events.pool, slot)
}

export function resetZombieEscapeBloodEvents(events: ZombieEscapeBloodEventPool) {
  resetZombieEscapeFixedPool(events.pool)
  events.targetSlot.fill(-1)
}

export function reconcileZombieEscapeBloodEventPool(
  events: ZombieEscapeBloodEventPool,
  elapsedSeconds: number,
  previousElapsedSeconds: number,
) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < previousElapsedSeconds) {
    resetZombieEscapeBloodEvents(events)
    return 'reset' as const
  }

  for (let slot = 0; slot < events.pool.capacity; slot += 1) {
    if (events.pool.active[slot] === 0) continue
    const spawnElapsedSeconds = events.spawnElapsedSeconds[slot]!
    const age = elapsedSeconds - spawnElapsedSeconds
    const expirationElapsedSeconds =
      spawnElapsedSeconds + ZOMBIE_ESCAPE_BLOOD_EFFECT.lifetimeSeconds
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      elapsedSeconds + BLOOD_TIME_EPSILON_SECONDS >= expirationElapsedSeconds
    ) {
      releaseZombieEscapeBloodEvent(events, slot)
    }
  }
  return 'advanced' as const
}

export function resolveZombieEscapeBloodEnvelope(
  ageSeconds: number,
  output: ZombieEscapeBloodEnvelope,
) {
  const lifetime = ZOMBIE_ESCAPE_BLOOD_EFFECT.lifetimeSeconds
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds >= lifetime) {
    output.droplet = 0
    output.normalizedAge = ageSeconds >= lifetime ? 1 : 0
    output.residue = 0
    output.splash = 0
    return false
  }

  const normalizedAge = clamp01(ageSeconds / lifetime)
  output.normalizedAge = normalizedAge
  output.splash = 1 - smoothstep(0.16, 0.4, normalizedAge)
  output.droplet = Math.sqrt(1 - smoothstep(0.1, 0.92, normalizedAge))
  output.residue = smoothstep(0, 0.08, normalizedAge) * (1 - smoothstep(0.68, 1, normalizedAge))
  return true
}

export function createZombieEscapeBloodEventSeed(
  shotGeneration: number,
  shotSlot: number,
  targetGeneration: number,
) {
  return mixZombieEscapeBloodSeed(
    (shotGeneration >>> 0) ^
      Math.imul((shotSlot + 1) >>> 0, 0x9e37_79b1) ^
      Math.imul((targetGeneration + 1) >>> 0, 0x85eb_ca6b),
  )
}

export function deriveZombieEscapeBloodParticleSeed(
  eventSeed: number,
  layer: number,
  particle: number,
) {
  return mixZombieEscapeBloodSeed(
    (eventSeed >>> 0) ^
      Math.imul((layer + 1) >>> 0, 0x632b_e59b) ^
      Math.imul((particle + 1) >>> 0, 0x8515_7af5),
  )
}

export function zombieEscapeBloodHashUnit(seed: number) {
  return mixZombieEscapeBloodSeed(seed) / 4_294_967_296
}

function mixZombieEscapeBloodSeed(seed: number) {
  let value = seed >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d)
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b)
  value ^= value >>> 16
  return value >>> 0
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp01((value - edge0) / (edge1 - edge0))
  return progress * progress * (3 - progress * 2)
}
