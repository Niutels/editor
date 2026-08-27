import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  createZombieEscapeDeathDustEventPool,
  createZombieEscapeDeathDustEventSeed,
  deriveZombieEscapeDeathDustParticleSeed,
  reconcileZombieEscapeDeathDustEventPool,
  resetZombieEscapeDeathDustEvents,
  resolveZombieEscapeDeathDustEnvelope,
  resolveZombieEscapeDeathDustParticleSample,
  resolveZombieEscapeDeathDustSpawnElapsedSeconds,
  resolveZombieEscapeDeathDustVariant,
  shouldSpawnZombieEscapeDeathDust,
  spawnZombieEscapeDeathDustEvent,
  ZOMBIE_ESCAPE_DEATH_DUST,
  ZOMBIE_ESCAPE_DEATH_DUST_TRIGGER_ADVANCE_SECONDS,
  type ZombieEscapeDeathDustEnvelope,
  type ZombieEscapeDeathDustParticleSample,
} from './zombie-escape-death-dust'

const event = {
  directionX: 3,
  directionZ: 4,
  groundY: 1,
  originX: 2,
  originZ: -3,
  seed: 17,
  spawnElapsedSeconds: 4,
  targetGeneration: 9,
  targetSlot: 2,
}

describe('Zombie Escape death dust events', () => {
  test('uses bounded fixed storage and normalized event direction', () => {
    const events = createZombieEscapeDeathDustEventPool(2)
    const origins = events.originX
    expect(spawnZombieEscapeDeathDustEvent(events, event)).toBe(0)
    expect(spawnZombieEscapeDeathDustEvent(events, { ...event, seed: 18 })).toBe(1)
    expect(spawnZombieEscapeDeathDustEvent(events, { ...event, seed: 19 })).toBe(0)
    expect(events.pool.activeCount).toBe(2)
    expect(events.seed[0]).toBe(19)
    expect(events.directionX[0]).toBeCloseTo(0.6)
    expect(events.directionZ[0]).toBeCloseTo(0.8)
    resetZombieEscapeDeathDustEvents(events)
    expect(events.originX).toBe(origins)
    expect(events.pool.activeCount).toBe(0)
    expect([...events.targetSlot]).toEqual([-1, -1])
  })

  test('expires at its finite lifetime and resets on a simulation rewind', () => {
    const events = createZombieEscapeDeathDustEventPool(1)
    spawnZombieEscapeDeathDustEvent(events, event)
    expect(
      reconcileZombieEscapeDeathDustEventPool(
        events,
        event.spawnElapsedSeconds + ZOMBIE_ESCAPE_DEATH_DUST.lifetimeSeconds,
        event.spawnElapsedSeconds,
      ),
    ).toBe('advanced')
    expect(events.pool.activeCount).toBe(0)
    spawnZombieEscapeDeathDustEvent(events, event)
    expect(reconcileZombieEscapeDeathDustEventPool(events, 1, 5)).toBe('reset')
    expect(events.pool.activeCount).toBe(0)
  })

  test('has smooth, non-negative envelopes and deterministic particle samples', () => {
    const events = createZombieEscapeDeathDustEventPool(1)
    spawnZombieEscapeDeathDustEvent(events, event)
    const envelope: ZombieEscapeDeathDustEnvelope = {
      normalizedAge: 0,
      opacity: 0,
      outward: 0,
      rise: 0,
      scale: 0,
    }
    const sample: ZombieEscapeDeathDustParticleSample = {
      opacity: 0,
      rotation: 0,
      scale: 0,
      x: 0,
      y: 0,
      z: 0,
    }
    expect(resolveZombieEscapeDeathDustEnvelope(0.4, envelope)).toBe(true)
    expect(Object.values(envelope).every((value) => Number.isFinite(value) && value >= 0)).toBe(
      true,
    )
    expect(resolveZombieEscapeDeathDustParticleSample(events, 0, 3, 0.4, envelope, sample)).toBe(
      true,
    )
    const first = { ...sample }
    resolveZombieEscapeDeathDustParticleSample(events, 0, 3, 0.4, envelope, sample)
    expect(sample).toEqual(first)
    expect(resolveZombieEscapeDeathDustParticleSample(events, 0, 4, 0.4, envelope, sample)).toBe(
      true,
    )
    expect(sample).not.toEqual(first)
    expect(
      resolveZombieEscapeDeathDustEnvelope(ZOMBIE_ESCAPE_DEATH_DUST.lifetimeSeconds, envelope),
    ).toBe(false)
    expect(envelope.opacity).toBe(0)
  })

  test('keeps seeds stable and sanitizes comparison variants', () => {
    const seed = createZombieEscapeDeathDustEventSeed(9, 2, 31)
    expect(createZombieEscapeDeathDustEventSeed(9, 2, 31)).toBe(seed)
    expect(createZombieEscapeDeathDustEventSeed(10, 2, 31)).not.toBe(seed)
    expect(deriveZombieEscapeDeathDustParticleSeed(seed, 0)).not.toBe(
      deriveZombieEscapeDeathDustParticleSeed(seed, 1),
    )
    expect(resolveZombieEscapeDeathDustVariant('ellipsoid-impostors')).toBe('ellipsoid-impostors')
    expect(resolveZombieEscapeDeathDustVariant('invalid')).toBe('alpha-hash-puffs')
  })

  test('spawns once at the production trigger advanced by 0.3 seconds', () => {
    const common = {
      active: true,
      generation: 7,
      health: 0,
      observedGeneration: 0,
    }
    const trigger = ZOMBIE_ESCAPE_DEATH_DUST.impactDeathPhase
    expect(shouldSpawnZombieEscapeDeathDust({ ...common, deathPhase: 0 })).toBe(false)
    expect(shouldSpawnZombieEscapeDeathDust({ ...common, deathPhase: trigger - 0.000_001 })).toBe(
      false,
    )
    expect(shouldSpawnZombieEscapeDeathDust({ ...common, deathPhase: trigger })).toBe(true)
    expect(
      0.82 * ZOMBIE_ESCAPE_SIMULATION.zombieDeathCollapseSeconds -
        trigger * ZOMBIE_ESCAPE_SIMULATION.zombieDeathCollapseSeconds,
    ).toBeCloseTo(ZOMBIE_ESCAPE_DEATH_DUST_TRIGGER_ADVANCE_SECONDS)
    expect(ZOMBIE_ESCAPE_DEATH_DUST_TRIGGER_ADVANCE_SECONDS).toBe(0.3)
    expect(
      shouldSpawnZombieEscapeDeathDust({
        ...common,
        deathPhase: 1,
        observedGeneration: common.generation,
      }),
    ).toBe(false)
  })

  test('backdates a late frame to the deterministic advanced trigger time', () => {
    const triggerElapsed =
      ZOMBIE_ESCAPE_DEATH_DUST.impactDeathPhase *
      ZOMBIE_ESCAPE_SIMULATION.zombieDeathCollapseSeconds
    const deathStartedAt = 12
    const observedAt = deathStartedAt + triggerElapsed + 0.19
    const remaining =
      ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds - triggerElapsed - 0.19
    expect(resolveZombieEscapeDeathDustSpawnElapsedSeconds(observedAt, remaining)).toBeCloseTo(
      deathStartedAt + triggerElapsed,
    )
  })
})
