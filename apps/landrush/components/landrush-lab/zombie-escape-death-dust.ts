import { ZOMBIE_ESCAPE_SIMULATION } from '@landrush/zombie-gameplay/zombie-escape-config'
import {
  acquireZombieEscapePoolSlot,
  createZombieEscapeFixedPool,
  releaseZombieEscapePoolSlot,
  resetZombieEscapeFixedPool,
  type ZombieEscapeFixedPool,
} from '@landrush/zombie-gameplay/zombie-escape-pool'

const ZOMBIE_ESCAPE_DEATH_DUST_BASE_IMPACT_DEATH_PHASE = 0.82
export const ZOMBIE_ESCAPE_DEATH_DUST_TRIGGER_ADVANCE_SECONDS = 0.3
const ZOMBIE_ESCAPE_DEATH_DUST_IMPACT_DEATH_PHASE = Math.max(
  0,
  ZOMBIE_ESCAPE_DEATH_DUST_BASE_IMPACT_DEATH_PHASE -
    ZOMBIE_ESCAPE_DEATH_DUST_TRIGGER_ADVANCE_SECONDS /
      ZOMBIE_ESCAPE_SIMULATION.zombieDeathCollapseSeconds,
)

export const ZOMBIE_ESCAPE_DEATH_DUST = Object.freeze({
  clodsPerEvent: 10,
  ellipsoidsPerEvent: 8,
  impactDeathPhase: ZOMBIE_ESCAPE_DEATH_DUST_IMPACT_DEATH_PHASE,
  lifetimeSeconds: 1.2,
  puffsPerEvent: 16,
})

const DEATH_DUST_TIME_EPSILON_SECONDS = 1e-9

export const ZOMBIE_ESCAPE_DEATH_DUST_VARIANTS = [
  'alpha-hash-puffs',
  'low-poly-puffs',
  'ellipsoid-impostors',
  'toon-flipbook',
  'ground-clods',
] as const

export type ZombieEscapeDeathDustVariant = (typeof ZOMBIE_ESCAPE_DEATH_DUST_VARIANTS)[number]

export const DEFAULT_ZOMBIE_ESCAPE_DEATH_DUST_VARIANT: ZombieEscapeDeathDustVariant =
  'alpha-hash-puffs'

export type ZombieEscapeDeathDustEventPool = {
  directionX: Float32Array
  directionZ: Float32Array
  groundY: Float32Array
  originX: Float32Array
  originZ: Float32Array
  pool: ZombieEscapeFixedPool
  seed: Uint32Array
  spawnElapsedSeconds: Float64Array
  targetGeneration: Uint32Array
  targetSlot: Int32Array
}

export type ZombieEscapeDeathDustEvent = {
  directionX: number
  directionZ: number
  groundY: number
  originX: number
  originZ: number
  seed: number
  spawnElapsedSeconds: number
  targetGeneration: number
  targetSlot: number
}

export type ZombieEscapeDeathDustEnvelope = {
  normalizedAge: number
  opacity: number
  outward: number
  rise: number
  scale: number
}

export type ZombieEscapeDeathDustParticleSample = {
  opacity: number
  rotation: number
  scale: number
  x: number
  y: number
  z: number
}

export function createZombieEscapeDeathDustEventPool(
  capacity: number,
): ZombieEscapeDeathDustEventPool {
  const pool = createZombieEscapeFixedPool(capacity)
  const targetSlot = new Int32Array(pool.capacity)
  targetSlot.fill(-1)
  return {
    directionX: new Float32Array(pool.capacity),
    directionZ: new Float32Array(pool.capacity),
    groundY: new Float32Array(pool.capacity),
    originX: new Float32Array(pool.capacity),
    originZ: new Float32Array(pool.capacity),
    pool,
    seed: new Uint32Array(pool.capacity),
    spawnElapsedSeconds: new Float64Array(pool.capacity),
    targetGeneration: new Uint32Array(pool.capacity),
    targetSlot,
  }
}

export function spawnZombieEscapeDeathDustEvent(
  events: ZombieEscapeDeathDustEventPool,
  event: ZombieEscapeDeathDustEvent,
) {
  const slot = acquireZombieEscapePoolSlot(events.pool)
  const directionLength = Math.hypot(event.directionX, event.directionZ)
  if (directionLength > 0.000_001) {
    events.directionX[slot] = event.directionX / directionLength
    events.directionZ[slot] = event.directionZ / directionLength
  } else {
    events.directionX[slot] = 0
    events.directionZ[slot] = 1
  }
  events.groundY[slot] = event.groundY
  events.originX[slot] = event.originX
  events.originZ[slot] = event.originZ
  events.seed[slot] = event.seed >>> 0
  events.spawnElapsedSeconds[slot] = event.spawnElapsedSeconds
  events.targetGeneration[slot] = event.targetGeneration >>> 0
  events.targetSlot[slot] = event.targetSlot
  return slot
}

export function resetZombieEscapeDeathDustEvents(events: ZombieEscapeDeathDustEventPool) {
  resetZombieEscapeFixedPool(events.pool)
  events.targetSlot.fill(-1)
}

export function reconcileZombieEscapeDeathDustEventPool(
  events: ZombieEscapeDeathDustEventPool,
  elapsedSeconds: number,
  previousElapsedSeconds: number,
) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < previousElapsedSeconds) {
    resetZombieEscapeDeathDustEvents(events)
    return 'reset' as const
  }
  for (let slot = 0; slot < events.pool.capacity; slot += 1) {
    if (events.pool.active[slot] === 0) continue
    const spawnElapsedSeconds = events.spawnElapsedSeconds[slot]!
    const age = elapsedSeconds - spawnElapsedSeconds
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      elapsedSeconds + DEATH_DUST_TIME_EPSILON_SECONDS >=
        spawnElapsedSeconds + ZOMBIE_ESCAPE_DEATH_DUST.lifetimeSeconds
    ) {
      releaseZombieEscapePoolSlot(events.pool, slot)
    }
  }
  return 'advanced' as const
}

export function resolveZombieEscapeDeathDustEnvelope(
  ageSeconds: number,
  output: ZombieEscapeDeathDustEnvelope,
) {
  const lifetime = ZOMBIE_ESCAPE_DEATH_DUST.lifetimeSeconds
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds >= lifetime) {
    output.normalizedAge = ageSeconds >= lifetime ? 1 : 0
    output.opacity = 0
    output.outward = ageSeconds >= lifetime ? 1 : 0
    output.rise = 0
    output.scale = 0
    return false
  }
  const normalizedAge = clamp01(ageSeconds / lifetime)
  output.normalizedAge = normalizedAge
  output.opacity = smoothstep(0, 0.055, normalizedAge) * (1 - smoothstep(0.58, 1, normalizedAge))
  output.outward = 1 - (1 - normalizedAge) * (1 - normalizedAge)
  output.rise = Math.sin(Math.PI * normalizedAge)
  output.scale = smoothstep(0, 0.16, normalizedAge) * (1 - smoothstep(0.82, 1, normalizedAge))
  return true
}

export function resolveZombieEscapeDeathDustParticleSample(
  events: ZombieEscapeDeathDustEventPool,
  eventSlot: number,
  particleIndex: number,
  ageSeconds: number,
  envelope: ZombieEscapeDeathDustEnvelope,
  output: ZombieEscapeDeathDustParticleSample,
) {
  if (!resolveZombieEscapeDeathDustEnvelope(ageSeconds, envelope)) {
    output.opacity = 0
    output.rotation = 0
    output.scale = 0
    output.x = 0
    output.y = -100
    output.z = 0
    return false
  }
  const seed = deriveZombieEscapeDeathDustParticleSeed(events.seed[eventSlot] ?? 0, particleIndex)
  const angle = zombieEscapeDeathDustHashUnit(seed) * Math.PI * 2
  const radialDistance =
    (0.22 + zombieEscapeDeathDustHashUnit(seed ^ 0x68bc_21eb) * 1.18) * envelope.outward
  const directionalDistance =
    (0.08 + zombieEscapeDeathDustHashUnit(seed ^ 0x02e5_be93) * 0.36) * envelope.outward
  const lateralX = Math.cos(angle)
  const lateralZ = Math.sin(angle)
  const baseScale = 0.16 + zombieEscapeDeathDustHashUnit(seed ^ 0xa54f_f53a) * 0.34
  output.x =
    (events.originX[eventSlot] ?? 0) +
    lateralX * radialDistance +
    (events.directionX[eventSlot] ?? 0) * directionalDistance
  output.y =
    (events.groundY[eventSlot] ?? 0) +
    0.04 +
    (0.12 + zombieEscapeDeathDustHashUnit(seed ^ 0x510e_527f) * 0.52) * envelope.rise
  output.z =
    (events.originZ[eventSlot] ?? 0) +
    lateralZ * radialDistance +
    (events.directionZ[eventSlot] ?? 0) * directionalDistance
  output.opacity = envelope.opacity
  output.rotation =
    zombieEscapeDeathDustHashUnit(seed ^ 0x9b05_688c) * Math.PI * 2 +
    ageSeconds * (zombieEscapeDeathDustHashUnit(seed ^ 0x1f83_d9ab) - 0.5) * 1.8
  output.scale = baseScale * (0.55 + envelope.scale * 1.45)
  return true
}

export function createZombieEscapeDeathDustEventSeed(
  targetGeneration: number,
  targetSlot: number,
  spawnOrdinal: number,
) {
  return mixZombieEscapeDeathDustSeed(
    (targetGeneration >>> 0) ^
      Math.imul((targetSlot + 1) >>> 0, 0x9e37_79b1) ^
      Math.imul((spawnOrdinal + 1) >>> 0, 0x85eb_ca6b),
  )
}

export function deriveZombieEscapeDeathDustParticleSeed(eventSeed: number, particleIndex: number) {
  return mixZombieEscapeDeathDustSeed(
    (eventSeed >>> 0) ^ Math.imul((particleIndex + 1) >>> 0, 0x632b_e59b),
  )
}

export function zombieEscapeDeathDustHashUnit(seed: number) {
  return mixZombieEscapeDeathDustSeed(seed) / 4_294_967_296
}

export function resolveZombieEscapeDeathDustVariant(
  value: string | string[] | null | undefined,
): ZombieEscapeDeathDustVariant {
  const candidate = Array.isArray(value) ? value[0] : value
  return ZOMBIE_ESCAPE_DEATH_DUST_VARIANTS.includes(candidate as ZombieEscapeDeathDustVariant)
    ? (candidate as ZombieEscapeDeathDustVariant)
    : DEFAULT_ZOMBIE_ESCAPE_DEATH_DUST_VARIANT
}

export function resolveZombieEscapeDeathDustSpawnElapsedSeconds(
  elapsedSeconds: number,
  deathPresentationSeconds: number,
) {
  const now = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  const remaining = Number.isFinite(deathPresentationSeconds)
    ? Math.max(
        0,
        Math.min(ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds, deathPresentationSeconds),
      )
    : ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds
  const deathElapsed = ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds - remaining
  const triggerElapsed =
    ZOMBIE_ESCAPE_SIMULATION.zombieDeathCollapseSeconds * ZOMBIE_ESCAPE_DEATH_DUST.impactDeathPhase
  return Math.max(0, now - Math.max(0, deathElapsed - triggerElapsed))
}

export function shouldSpawnZombieEscapeDeathDust({
  active,
  deathPhase,
  generation,
  health,
  observedGeneration,
}: {
  active: boolean
  deathPhase: number
  generation: number
  health: number
  observedGeneration: number
}) {
  return (
    active &&
    health <= 0 &&
    deathPhase >= ZOMBIE_ESCAPE_DEATH_DUST.impactDeathPhase &&
    generation >>> 0 !== observedGeneration >>> 0
  )
}

function mixZombieEscapeDeathDustSeed(seed: number) {
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
