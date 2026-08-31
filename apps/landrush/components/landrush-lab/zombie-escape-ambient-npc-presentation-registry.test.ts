import { describe, expect, test } from 'bun:test'
import { createZombieEscapeAmbientHandoffState } from './zombie-escape-ambient-handoff'
import {
  createZombieEscapeAmbientNpcPresentationClaim,
  createZombieEscapeAmbientNpcPresentationRegistry,
  isZombieEscapeAmbientNpcHandoffCandidatePending,
  resolveZombieEscapeAmbientNpcPresentationClaim,
  type ZombieEscapeAmbientNpcPresentationSimulation,
} from './zombie-escape-ambient-npc-presentation-registry'
import { ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS } from './zombie-escape-zombie-roster'

describe('Zombie Escape ambient NPC presentation registry', () => {
  test('captures every mounted NPC into one reused typed-array source', () => {
    const sourceIds = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.slice(0, 2)
    const registry = createZombieEscapeAmbientNpcPresentationRegistry(sourceIds)
    const simulation = createSimulation(4)
    simulation.variantByPoolSlot.set([7, 3])
    registry.setGroundY(2.5)
    const unbind = registry.bindRuntime({
      originX: 12,
      originZ: -9,
      readShoulderTorchLighting: () => null,
      readSimulation: () => simulation,
    })
    const firstAdapter = {
      capture(source: ReturnType<typeof registry.captureSource>, index: number) {
        source.x[index] = 4
        source.y[index] = 1
        source.z[index] = -3
        source.yaw[index] = 0.4
        source.locomotionMode[index] = 2
        source.locomotionPhase[index] = 1.75
        return true
      },
    }
    const unregisterFirst = registry.register(0, firstAdapter)
    const unregisterSecond = registry.register(1, { capture: () => false })

    const first = registry.captureSource()
    const second = registry.captureSource()
    expect(second).toBe(first)
    expect(first.x).toBeInstanceOf(Float32Array)
    expect(first.valid).toEqual(new Uint8Array([1, 0]))
    expect(first.variant).toEqual(new Uint8Array([7, 3]))
    expect(first.x[0]).toBe(4)
    expect(first.locomotionPhase[0]).toBe(1.75)
    expect(registry.getRegisteredCount()).toBe(2)
    expect(registry.readGroundY()).toBe(2.5)
    expect(registry.readRuntime()?.originX).toBe(12)
    expect(registry.readRuntime()?.originZ).toBe(-9)
    expect('originY' in (registry.readRuntime() ?? {})).toBe(false)

    unregisterFirst()
    unregisterSecond()
    unbind()
    expect(registry.getRegisteredCount()).toBe(0)
    expect(registry.readRuntime()).toBeNull()
  })

  test('keeps replacement registration and validates ownership by slot generation', () => {
    const registry = createZombieEscapeAmbientNpcPresentationRegistry(
      ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.slice(0, 1),
    )
    const staleUnregister = registry.register(0, { capture: () => false })
    const activeUnregister = registry.register(0, { capture: () => true })
    staleUnregister()
    expect(registry.getRegisteredCount()).toBe(1)
    expect(registry.captureSource().valid[0]).toBe(1)

    const simulation = createSimulation(4)
    simulation.ambientHandoff.slotByNpcIndex[0] = 2
    simulation.ambientHandoff.generationByNpcIndex[0] = 9
    simulation.ambientHandoff.npcIndexBySlot[2] = 0
    simulation.zombies.pool.active[2] = 1
    simulation.zombies.pool.generation[2] = 9
    const claim = createZombieEscapeAmbientNpcPresentationClaim()
    expect(resolveZombieEscapeAmbientNpcPresentationClaim(simulation, 0, claim)).toBe(claim)
    expect(claim).toEqual({ generation: 9, slot: 2, valid: true })

    simulation.zombies.pool.generation[2] = 10
    resolveZombieEscapeAmbientNpcPresentationClaim(simulation, 0, claim)
    expect(claim.valid).toBe(false)
    activeUnregister()
  })

  test('keeps only unconsumed candidates pending', () => {
    const handoff = createZombieEscapeAmbientHandoffState(4)
    handoff.candidateCount = 2
    handoff.candidateNpcIndex.set([1, 3])
    expect(isZombieEscapeAmbientNpcHandoffCandidatePending(handoff, 1)).toBe(true)
    expect(isZombieEscapeAmbientNpcHandoffCandidatePending(handoff, 3)).toBe(true)
    expect(isZombieEscapeAmbientNpcHandoffCandidatePending(handoff, 2)).toBe(false)

    handoff.candidateCursor = 1
    expect(isZombieEscapeAmbientNpcHandoffCandidatePending(handoff, 1)).toBe(false)
    expect(isZombieEscapeAmbientNpcHandoffCandidatePending(handoff, 3)).toBe(true)

    handoff.candidateCursor = handoff.candidateCount
    expect(isZombieEscapeAmbientNpcHandoffCandidatePending(handoff, 3)).toBe(false)
  })
})

function createSimulation(capacity: number) {
  const floats = () => new Float32Array(capacity)
  return {
    ambientHandoff: createZombieEscapeAmbientHandoffState(capacity),
    paused: false,
    variantByPoolSlot: new Uint8Array(capacity),
    zombies: {
      attackCooldown: floats(),
      deathPresentationSeconds: floats(),
      heading: floats(),
      health: floats(),
      hitFlash: floats(),
      hitImpulseX: floats(),
      hitImpulseY: floats(),
      hitImpulseZ: floats(),
      hitReaction: floats(),
      intent: new Uint8Array(capacity),
      pool: { active: new Uint8Array(capacity), generation: new Uint32Array(capacity) },
      runBlend: floats(),
      spawnOrdinal: new Uint32Array(capacity),
      vx: floats(),
      vz: floats(),
      x: floats(),
      y: floats(),
      z: floats(),
    },
  } satisfies ZombieEscapeAmbientNpcPresentationSimulation
}
