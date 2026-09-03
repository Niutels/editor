import { describe, expect, test } from 'bun:test'
import {
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION,
  type ZombieEscapeAmbientHandoffSource,
} from './zombie-escape-ambient-handoff'
import { createZombieEscapeCollisionWorld } from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import { releaseZombieEscapePoolSlot } from './zombie-escape-pool'
import {
  createZombieEscapeSimulation,
  installZombieEscapeAmbientHandoffCandidates,
  resetZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_GRACE_SECONDS,
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_STAGGER_SECONDS,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS } from './zombie-escape-zombie-roster'

function createAmbientHandoffSource(
  variantByPoolSlot: Uint8Array,
): ZombieEscapeAmbientHandoffSource {
  const count = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length
  const source: ZombieEscapeAmbientHandoffSource = {
    locomotionMode: new Uint8Array(count),
    locomotionPhase: new Float32Array(count),
    sourceNpcIds: ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
    valid: new Uint8Array(count).fill(1),
    variant: new Uint8Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
    yaw: new Float32Array(count),
    z: new Float32Array(count),
  }
  for (let index = 0; index < count; index += 1) {
    source.locomotionMode[index] =
      index === 0
        ? ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.run
        : ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION.walk
    source.locomotionPhase[index] = 0.375 + index * 0.125
    source.variant[index] = variantByPoolSlot[index]!
    source.x[index] = -9 + index * 2
    source.y[index] = 0
    source.yaw[index] = 1.25 - index * 0.1
    source.z[index] = -4 + (index % 3) * 3
  }
  return source
}

function createSparseTestWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: 0.37,
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'ambient-handoff-ground',
        polygon: [
          { x: -32, z: -32 },
          { x: 32, z: -32 },
          { x: 32, z: 32 },
          { x: -32, z: 32 },
        ],
      },
    ],
    playRadius: 32,
  })
}

function stepUntilFirstZombie(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  arena: ReturnType<typeof createZombieEscapeArena>,
  maximumTicks = 4_000,
) {
  const input = createZombieEscapeControlState()
  for (let tick = 0; tick < maximumTicks && state.zombies.pool.activeCount === 0; tick += 1) {
    stepZombieEscapeSimulation(state, input, 1 / 60, arena)
  }
  expect(state.zombies.pool.activeCount).toBe(1)
}

describe('Zombie Escape ambient NPC handoff', () => {
  test('installs the complete capture atomically and fails closed on an incomplete source', () => {
    const arena = createZombieEscapeArena(5_401)
    const state = createZombieEscapeSimulation(arena, 9_401)
    const source = createAmbientHandoffSource(state.variantByPoolSlot)

    expect(installZombieEscapeAmbientHandoffCandidates(state, source)).toBe(10)
    expect([...state.ambientHandoff.candidateNpcIndex]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

    source.valid[4] = 0
    expect(installZombieEscapeAmbientHandoffCandidates(state, source)).toBe(0)
    expect(state.ambientHandoff.candidateCount).toBe(0)
    expect(state.ambientHandoff.candidateCursor).toBe(0)
    expect([...state.ambientHandoff.candidateInstalledByNpcIndex]).toEqual(
      Array.from({ length: 10 }, () => 0),
    )

    source.valid[4] = 1
    const reorderedSource: ZombieEscapeAmbientHandoffSource = {
      ...source,
      sourceNpcIds: [
        source.sourceNpcIds[1]!,
        source.sourceNpcIds[0]!,
        ...source.sourceNpcIds.slice(2),
      ],
    }
    expect(installZombieEscapeAmbientHandoffCandidates(state, reorderedSource)).toBe(0)
    expect(state.ambientHandoff.candidateCount).toBe(0)
    expect(
      [...state.ambientHandoff.candidateInstalledByNpcIndex].every((value) => value === 0),
    ).toBe(true)
  })

  test('seeds the exact captured transform, heading, locomotion phase, and first identity', () => {
    const arena = createZombieEscapeArena(5_402)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9_402)
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    state.player.x = 15
    state.player.z = 15
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')

    stepUntilFirstZombie(state, arena)

    const slot = state.ambientHandoff.slotByNpcIndex[0]!
    expect(slot).toBe(0)
    expect(state.zombies.x[slot]).toBe(source.x[0])
    expect(state.zombies.y[slot]).toBe(source.y[0])
    expect(state.zombies.z[slot]).toBe(source.z[0])
    expect(state.zombies.heading[slot]).toBe(source.yaw[0])
    expect(state.zombies.locomotionPhase[slot]).toBe(source.locomotionPhase[0])
    expect(state.zombies.locomotionBlend[slot]).toBe(1)
    expect(state.zombies.runBlend[slot]).toBe(1)
    expect(state.zombies.variant[slot]).toBe(source.variant[0])
    expect(state.ambientHandoff.generationByNpcIndex[0]).toBe(state.zombies.pool.generation[slot])
    expect(state.ambientHandoff.npcIndexBySlot[slot]).toBe(0)
    expect(state.waveSpawnRemaining).toBe(9)

    stepZombieEscapeSimulation(state, createZombieEscapeControlState(), 1 / 60, arena)
    expect(state.zombies.pool.activeCount).toBe(1)
  })

  test('uses sparse navigation anchoring without moving a valid captured position', () => {
    const arena = createZombieEscapeArena(5_403)
    const state = createZombieEscapeSimulation(arena, 9_403, undefined, {
      requireSparseNavigation: true,
    })
    setZombieEscapeCollisionWorld(state, createSparseTestWorld())
    state.player.x = 12
    state.player.z = 12
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')

    stepUntilFirstZombie(state, arena)

    const slot = state.ambientHandoff.slotByNpcIndex[0]!
    expect(state.zombies.x[slot]).toBe(source.x[0])
    expect(state.zombies.z[slot]).toBe(source.z[0])
    expect(state.zombies.heading[slot]).toBe(source.yaw[0])
    expect(state.zombies.locomotionPhase[slot]).toBe(source.locomotionPhase[0])
    expect(state.ambientHandoff.candidateAnchorAttempts[0]).toBe(0)
    expect(state.navigationSparseSpawnSearchStartedCount).toBe(1)
    expect(state.navigationSparseSpawnSearchCompletedCount).toBe(1)
  })

  test('preserves a dense handoff beside the player at its exact visible transform', () => {
    const arena = createZombieEscapeArena(5_407)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9_407)
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    source.x[0] = state.player.x
    source.z[0] = state.player.z
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')

    stepUntilFirstZombie(state, arena)

    const slot = state.ambientHandoff.slotByNpcIndex[0]!
    expect(state.ambientHandoff.candidateAnchorAttempts[0]).toBe(0)
    expect(state.zombies.x[slot]).toBe(source.x[0])
    expect(state.zombies.y[slot]).toBe(source.y[0])
    expect(state.zombies.z[slot]).toBe(source.z[0])
    expect(state.zombies.heading[slot]).toBe(source.yaw[0])
    expect(state.zombies.locomotionPhase[slot]).toBe(source.locomotionPhase[0])
    expect(state.zombies.variant[slot]).toBe(source.variant[0])
    expect(state.ambientHandoff.generationByNpcIndex[0]).toBe(state.zombies.pool.generation[slot])
    expect(state.ambientHandoff.npcIndexBySlot[slot]).toBe(0)
    expect(state.waveSpawnRemaining).toBe(9)
  })

  test('keeps colocated handoffs harmless through grace and staggers first-contact damage', () => {
    const arena = createZombieEscapeArena(5_409)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9_409)
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    for (let index = 0; index < source.sourceNpcIds.length; index += 1) {
      source.x[index] = state.player.x
      source.y[index] = state.player.y
      source.z[index] = state.player.z
    }
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')

    const input = createZombieEscapeControlState()
    const admitted = new Uint8Array(source.sourceNpcIds.length)
    const firstContactObserved = new Uint8Array(source.sourceNpcIds.length)
    const fixedDelta = ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
    const graceTicks = Math.ceil(ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_GRACE_SECONDS / fixedDelta)
    for (let tick = 0; tick < graceTicks; tick += 1) {
      stepZombieEscapeSimulation(state, input, fixedDelta, arena)
      for (let npcIndex = 0; npcIndex < admitted.length; npcIndex += 1) {
        const slot = state.ambientHandoff.slotByNpcIndex[npcIndex]!
        if (slot < 0 || admitted[npcIndex] !== 0) continue
        admitted[npcIndex] = 1
        expect(state.zombies.x[slot]).toBe(source.x[npcIndex])
        expect(state.zombies.y[slot]).toBe(source.y[npcIndex])
        expect(state.zombies.z[slot]).toBe(source.z[npcIndex])
        expect(state.zombies.attackCooldown[slot]).toBeCloseTo(
          ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds +
            ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_GRACE_SECONDS +
            npcIndex * ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_STAGGER_SECONDS,
          5,
        )
        state.zombies.speedScale[slot] = 0
      }
      expect(state.player.health).toBe(100)
    }
    expect([...admitted]).toEqual(Array.from({ length: admitted.length }, () => 1))

    const damageTicks: number[] = []
    const firstContactNpcIndices: number[] = []
    const maximumTick = graceTicks + Math.ceil(2 / fixedDelta)
    for (let tick = graceTicks; tick < maximumTick && damageTicks.length < 2; tick += 1) {
      const healthBefore = state.player.health
      stepZombieEscapeSimulation(state, input, fixedDelta, arena)
      const newFirstContacts: number[] = []
      for (let npcIndex = 0; npcIndex < firstContactObserved.length; npcIndex += 1) {
        const slot = state.ambientHandoff.slotByNpcIndex[npcIndex]!
        if (
          slot >= 0 &&
          firstContactObserved[npcIndex] === 0 &&
          state.zombies.attackContactResolved[slot] !== 0
        ) {
          firstContactObserved[npcIndex] = 1
          newFirstContacts.push(npcIndex)
        }
      }
      if (state.player.health === healthBefore) {
        expect(newFirstContacts).toHaveLength(0)
        continue
      }
      expect(healthBefore - state.player.health).toBe(8)
      expect(newFirstContacts).toHaveLength(1)
      damageTicks.push(tick)
      firstContactNpcIndices.push(newFirstContacts[0]!)
    }

    expect(firstContactNpcIndices).toEqual([0, 1])
    expect(damageTicks).toHaveLength(2)
    expect(damageTicks[1]! - damageTicks[0]!).toBeGreaterThanOrEqual(
      Math.floor(ZOMBIE_ESCAPE_AMBIENT_HANDOFF_ATTACK_STAGGER_SECONDS / fixedDelta),
    )
    expect(state.player.health).toBe(84)
  })

  test('preserves a sparse handoff beside the player at its exact visible transform', () => {
    const arena = createZombieEscapeArena(5_408)
    const state = createZombieEscapeSimulation(arena, 9_408, undefined, {
      requireSparseNavigation: true,
    })
    setZombieEscapeCollisionWorld(state, createSparseTestWorld())
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    source.x[0] = state.player.x
    source.z[0] = state.player.z
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')

    stepUntilFirstZombie(state, arena)

    const slot = state.ambientHandoff.slotByNpcIndex[0]!
    expect(state.ambientHandoff.candidateAnchorAttempts[0]).toBe(0)
    expect(state.zombies.x[slot]).toBe(source.x[0])
    expect(state.zombies.y[slot]).toBe(source.y[0])
    expect(state.zombies.z[slot]).toBe(source.z[0])
    expect(state.zombies.heading[slot]).toBe(source.yaw[0])
    expect(state.zombies.locomotionPhase[slot]).toBe(source.locomotionPhase[0])
    expect(state.zombies.variant[slot]).toBe(source.variant[0])
    expect(state.ambientHandoff.generationByNpcIndex[0]).toBe(state.zombies.pool.generation[slot])
    expect(state.ambientHandoff.npcIndexBySlot[slot]).toBe(0)
    expect(state.waveSpawnRemaining).toBe(9)
  })

  test('falls back after bounded failed anchors and retains generation-keyed identity ownership', () => {
    const arena = createZombieEscapeArena(5_404)
    const state = createZombieEscapeSimulation(arena, 9_404, undefined, {
      requireSparseNavigation: true,
    })
    setZombieEscapeCollisionWorld(state, createSparseTestWorld())
    state.player.x = 0
    state.player.z = 0
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    source.x[0] = 200
    source.z[0] = 200
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')

    stepUntilFirstZombie(state, arena)

    const slot = state.ambientHandoff.slotByNpcIndex[0]!
    expect(state.ambientHandoff.candidateAnchorAttempts[0]).toBe(3)
    expect(
      Math.hypot(state.zombies.x[slot]! - source.x[0]!, state.zombies.z[slot]! - source.z[0]!),
    ).toBeGreaterThan(100)
    expect(state.zombies.pool.active[slot]).toBe(1)
    expect(state.ambientHandoff.generationByNpcIndex[0]).toBe(state.zombies.pool.generation[slot])
    expect(state.waveSpawnRemaining).toBe(9)
  })

  test('clears ownership on generic slot reuse and on build/reset lifecycle boundaries', () => {
    const arena = createZombieEscapeArena(5_405)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9_405)
    const source = createAmbientHandoffSource(state.variantByPoolSlot)
    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'night')
    stepUntilFirstZombie(state, arena)
    const claimedSlot = state.ambientHandoff.slotByNpcIndex[0]!
    const claimedGeneration = state.ambientHandoff.generationByNpcIndex[0]!

    expect(releaseZombieEscapePoolSlot(state.zombies.pool, claimedSlot)).toBe(true)
    const reusedSlot = spawnZombieEscapeZombie(state, 3, 4)
    expect(reusedSlot).toBe(claimedSlot)
    expect(state.zombies.pool.generation[reusedSlot]).not.toBe(claimedGeneration)
    expect(state.ambientHandoff.slotByNpcIndex[0]).toBe(-1)
    expect(state.ambientHandoff.generationByNpcIndex[0]).toBe(0)
    expect(state.ambientHandoff.npcIndexBySlot[reusedSlot]).toBe(-1)

    installZombieEscapeAmbientHandoffCandidates(state, source)
    setZombieEscapeGamePhase(state, 'build')
    expect(state.ambientHandoff.candidateCount).toBe(0)
    expect([...state.ambientHandoff.slotByNpcIndex].every((slot) => slot === -1)).toBe(true)

    installZombieEscapeAmbientHandoffCandidates(state, source)
    resetZombieEscapeSimulation(state, arena)
    expect(state.ambientHandoff.candidateCount).toBe(0)
    expect([...state.ambientHandoff.generationByNpcIndex].every((value) => value === 0)).toBe(true)
  })

  test('captures and binds the same ambient identities again on a later night', () => {
    const arena = createZombieEscapeArena(5_406)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 9_406)
    const firstSource = createAmbientHandoffSource(state.variantByPoolSlot)
    installZombieEscapeAmbientHandoffCandidates(state, firstSource)
    setZombieEscapeGamePhase(state, 'night')
    stepUntilFirstZombie(state, arena)
    const firstSlot = state.ambientHandoff.slotByNpcIndex[0]!
    const firstGeneration = state.ambientHandoff.generationByNpcIndex[0]!

    setZombieEscapeGamePhase(state, 'build')
    const secondSource = createAmbientHandoffSource(state.variantByPoolSlot)
    secondSource.x[0] = 6.5
    secondSource.z[0] = -7.25
    secondSource.yaw[0] = -0.75
    secondSource.locomotionPhase[0] = 0.8125
    expect(installZombieEscapeAmbientHandoffCandidates(state, secondSource)).toBe(10)
    setZombieEscapeGamePhase(state, 'night')
    stepUntilFirstZombie(state, arena)

    const secondSlot = state.ambientHandoff.slotByNpcIndex[0]!
    expect(secondSlot).toBe(firstSlot)
    expect(state.ambientHandoff.generationByNpcIndex[0]).toBe(
      state.zombies.pool.generation[secondSlot],
    )
    expect(state.ambientHandoff.generationByNpcIndex[0]).not.toBe(firstGeneration)
    expect(state.zombies.x[secondSlot]).toBe(secondSource.x[0])
    expect(state.zombies.z[secondSlot]).toBe(secondSource.z[0])
    expect(state.zombies.heading[secondSlot]).toBe(secondSource.yaw[0])
    expect(state.zombies.locomotionPhase[secondSlot]).toBe(secondSource.locomotionPhase[0])
  })
})
