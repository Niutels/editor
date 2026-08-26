import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeBloodEventPool,
  createZombieEscapeBloodEventSeed,
  deriveZombieEscapeBloodParticleSeed,
  reconcileZombieEscapeBloodEventPool,
  releaseZombieEscapeBloodEvent,
  resetZombieEscapeBloodEvents,
  resolveZombieEscapeBloodEnvelope,
  spawnZombieEscapeBloodEvent,
  ZOMBIE_ESCAPE_BLOOD_EFFECT,
  type ZombieEscapeBloodEnvelope,
} from './zombie-escape-blood-effects'
import {
  DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
  getZombieEscapeBloodVariantProfile,
} from './zombie-escape-blood-variants'

const event = {
  directionX: 0,
  directionY: 0,
  directionZ: -1,
  normalX: 0,
  normalY: 0,
  normalZ: 1,
  originX: 1,
  originY: 2,
  originZ: 3,
  seed: 17,
  spawnElapsedSeconds: 4,
  targetGeneration: 9,
  targetSlot: 2,
}

describe('Zombie Escape blood event pool', () => {
  test('is bounded and deterministically overwrites the oldest event', () => {
    const events = createZombieEscapeBloodEventPool(2)

    expect(spawnZombieEscapeBloodEvent(events, event)).toBe(0)
    expect(spawnZombieEscapeBloodEvent(events, { ...event, seed: 18 })).toBe(1)
    expect(spawnZombieEscapeBloodEvent(events, { ...event, seed: 19 })).toBe(0)
    expect(events.pool.activeCount).toBe(2)
    expect(events.seed[0]).toBe(19)
    expect(events.seed[1]).toBe(18)
    expect(events.variantCode[0]).toBe(DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE)
  })

  test('releases and resets without replacing fixed storage', () => {
    const events = createZombieEscapeBloodEventPool(2)
    const origins = events.originX
    const variants = events.variantCode
    const slot = spawnZombieEscapeBloodEvent(events, event)

    expect(releaseZombieEscapeBloodEvent(events, slot)).toBe(true)
    spawnZombieEscapeBloodEvent(events, event)
    resetZombieEscapeBloodEvents(events)

    expect(events.originX).toBe(origins)
    expect(events.variantCode).toBe(variants)
    expect(events.pool.activeCount).toBe(0)
    expect([...events.targetSlot]).toEqual([-1, -1])
    expect([...events.variantCode]).toEqual([
      DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
      DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
    ])
  })

  test('expires before the next acquire and preserves a same-frame spawn after rewind', () => {
    const events = createZombieEscapeBloodEventPool(1)
    const storage = events.originX
    spawnZombieEscapeBloodEvent(events, event)

    expect(
      reconcileZombieEscapeBloodEventPool(
        events,
        event.spawnElapsedSeconds + ZOMBIE_ESCAPE_BLOOD_EFFECT.lifetimeSeconds,
        event.spawnElapsedSeconds,
      ),
    ).toBe('advanced')
    expect(events.pool.activeCount).toBe(0)
    expect(spawnZombieEscapeBloodEvent(events, { ...event, seed: 23 })).toBe(0)

    expect(reconcileZombieEscapeBloodEventPool(events, 1, 5)).toBe('reset')
    expect(events.pool.activeCount).toBe(0)
    expect(
      spawnZombieEscapeBloodEvent(events, { ...event, seed: 29, spawnElapsedSeconds: 1 }),
    ).toBe(0)
    expect(events.pool.activeCount).toBe(1)
    expect(events.seed[0]).toBe(29)
    expect(events.originX).toBe(storage)
  })

  test('retains simultaneous event variants and sanitizes invalid codes to Wet Hybrid', () => {
    const events = createZombieEscapeBloodEventPool(3)
    const heavy = getZombieEscapeBloodVariantProfile('heavy-clots').code
    const viscous = getZombieEscapeBloodVariantProfile('viscous-strings').code

    spawnZombieEscapeBloodEvent(events, event)
    spawnZombieEscapeBloodEvent(events, { ...event, seed: 18, variantCode: heavy })
    spawnZombieEscapeBloodEvent(events, {
      ...event,
      seed: 19,
      variantCode: 99 as never,
    })

    expect([...events.variantCode]).toEqual([
      DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
      heavy,
      DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
    ])
    spawnZombieEscapeBloodEvent(events, { ...event, seed: 20, variantCode: viscous })
    expect([...events.variantCode]).toEqual([
      viscous,
      heavy,
      DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT_CODE,
    ])
  })
})

describe('Zombie Escape blood presentation contract', () => {
  test('uses normalized, non-negative envelopes with a finite lifetime', () => {
    const output: ZombieEscapeBloodEnvelope = {
      droplet: 0,
      normalizedAge: 0,
      residue: 0,
      splash: 0,
    }

    expect(resolveZombieEscapeBloodEnvelope(0, output)).toBe(true)
    expect(output.splash).toBe(1)
    expect(output.droplet).toBeGreaterThan(0)
    expect(output.residue).toBe(0)

    expect(resolveZombieEscapeBloodEnvelope(0.2, output)).toBe(true)
    expect(output.splash).toBeLessThan(1)
    expect(output.residue).toBeGreaterThan(0)
    expect(Object.values(output).every((value) => Number.isFinite(value) && value >= 0)).toBe(true)

    expect(
      resolveZombieEscapeBloodEnvelope(ZOMBIE_ESCAPE_BLOOD_EFFECT.lifetimeSeconds, output),
    ).toBe(false)
    expect(output).toEqual({ droplet: 0, normalizedAge: 1, residue: 0, splash: 0 })
  })

  test('derives stable event and per-layer seeds without sharing every transform', () => {
    const seed = createZombieEscapeBloodEventSeed(31, 4, 12)

    expect(createZombieEscapeBloodEventSeed(31, 4, 12)).toBe(seed)
    expect(createZombieEscapeBloodEventSeed(32, 4, 12)).not.toBe(seed)
    expect(deriveZombieEscapeBloodParticleSeed(seed, 0, 0)).toBe(
      deriveZombieEscapeBloodParticleSeed(seed, 0, 0),
    )
    expect(deriveZombieEscapeBloodParticleSeed(seed, 0, 0)).not.toBe(
      deriveZombieEscapeBloodParticleSeed(seed, 1, 0),
    )
  })
})
