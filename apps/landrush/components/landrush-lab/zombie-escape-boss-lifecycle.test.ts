import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  recordZombieEscapePlayerTrailPoint,
  resetZombieEscapePlayerTrail,
} from './zombie-escape-player-trail'
import {
  createZombieEscapeSimulation,
  resolveZombieEscapeNightGenericZombieTarget,
  resolveZombieEscapeNightProgress,
  resolveZombieEscapeScheduledPopulation,
  resolveZombieEscapeZombieSpawnHealth,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombieAtNavigationElevation,
  stepZombieEscapeSimulation,
  stepZombieEscapeSimulationPhysics,
  ZOMBIE_ESCAPE_BOSS_KIND,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'
import {
  ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
} from './zombie-escape-zombie-catalog'

const FIXED_DELTA_SECONDS = ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds

describe('Zombie Escape night bosses', () => {
  test('uses five-times heavy health, ten-times brute health, and exact night thresholds', () => {
    expect(resolveZombieEscapeZombieSpawnHealth(52, ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT)).toBe(260)
    expect(resolveZombieEscapeZombieSpawnHealth(52, ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT)).toBe(520)
    expect(resolveZombieEscapeNightProgress(180)).toBe(0)
    expect(resolveZombieEscapeNightProgress(90)).toBe(0.5)
    expect(resolveZombieEscapeNightProgress(60)).toBe(2 / 3)
    expect(resolveZombieEscapeNightProgress(0)).toBe(1)
    expect(resolveZombieEscapeNightGenericZombieTarget(60, 100)).toBe(70)
    expect(resolveZombieEscapeNightGenericZombieTarget(0, 100)).toBe(98)
    expect(resolveZombieEscapeNightGenericZombieTarget(0, 16)).toBe(14)
  })

  test('admits one heavy at half night and one brute at two-thirds night', () => {
    const { arena, input, state } = createBossTestState(82_001)

    state.phaseSecondsRemaining = 90.001
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(countActiveBodyClass(state, 'heavy')).toBe(0)
    expect(state.bossSpawned[ZOMBIE_ESCAPE_BOSS_KIND.heavy]).toBe(0)

    state.phaseSecondsRemaining = 90 + FIXED_DELTA_SECONDS * 0.5
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.phaseSecondsRemaining).toBeLessThan(90)
    const heavySlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
    expect(heavySlot).toBeGreaterThanOrEqual(0)
    expect(countActiveBodyClass(state, 'heavy')).toBe(1)
    expect(state.zombies.health[heavySlot]).toBe(260)

    state.phaseSecondsRemaining = 60.001
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(countActiveBodyClass(state, 'brute')).toBe(0)

    state.phaseSecondsRemaining = 60 + FIXED_DELTA_SECONDS * 0.5
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulation(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.phaseSecondsRemaining).toBeLessThan(60)
    const bruteSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]!
    expect(bruteSlot).toBeGreaterThanOrEqual(0)
    expect(countActiveBodyClass(state, 'brute')).toBe(1)
    expect(state.zombies.health[bruteSlot]).toBe(520)
  })

  test('respawns the heavy after every corpse release but never respawns a killed brute', () => {
    const { arena, input, state } = createBossTestState(82_002)
    state.phaseSecondsRemaining = 60
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

    for (let kill = 0; kill < 2; kill += 1) {
      const previousSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
      const previousGeneration = state.bossOwnerGeneration[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
      state.zombies.health[previousSlot] = 0
      state.zombies.deathPresentationSeconds[previousSlot] = 0
      state.waveSpawnTimerSeconds = 0
      stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

      const nextSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
      const nextGeneration = state.bossOwnerGeneration[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
      expect(nextSlot).toBeGreaterThanOrEqual(0)
      expect(countActiveBodyClass(state, 'heavy')).toBe(1)
      expect(nextSlot !== previousSlot || nextGeneration !== previousGeneration).toBe(true)
    }

    const bruteSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]!
    expect(bruteSlot).toBeGreaterThanOrEqual(0)
    state.zombies.health[bruteSlot] = 0
    state.zombies.deathPresentationSeconds[bruteSlot] = 0
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.bossDefeated[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(1)
    expect(state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(-1)
    expect(state.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(0)

    for (let frame = 0; frame < 120; frame += 1) {
      stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(countActiveBodyClass(state, 'brute')).toBe(0)
  })

  test('respawns a projectile-killed heavy twice but keeps a projectile-killed brute dead', () => {
    const arena = createZombieEscapeArena(82_013)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 82_014, undefined, {
      zombieCapacity: 2,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.phaseSecondsRemaining = 60
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

    const expectedHeavyHealth = resolveZombieEscapeZombieSpawnHealth(
      52,
      ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
    )
    const expectedBruteHealth = resolveZombieEscapeZombieSpawnHealth(
      52,
      ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
    )
    const initialBruteSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]!
    expect(initialBruteSlot).toBeGreaterThanOrEqual(0)
    expect(state.zombies.health[initialBruteSlot]).toBe(expectedBruteHealth)
    state.zombies.x[initialBruteSlot] = state.player.x + 6
    state.zombies.z[initialBruteSlot] = state.player.z + 6
    state.zombies.speedScale[initialBruteSlot] = 0

    for (let kill = 1; kill <= 2; kill += 1) {
      const killedSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
      const killedGeneration = state.bossOwnerGeneration[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
      expect(killedSlot).toBeGreaterThanOrEqual(0)
      expect(state.zombies.pool.active[killedSlot]).toBe(1)
      expect(state.zombies.health[killedSlot]).toBe(expectedHeavyHealth)

      fireProjectilesUntilBossDies(state, input, arena, ZOMBIE_ESCAPE_BOSS_KIND.heavy, kill)
      expect(state.zombies.health[killedSlot]).toBeLessThanOrEqual(0)
      expect(state.zombies.deathPresentationSeconds[killedSlot]).toBeGreaterThan(0)
      expect(state.kills).toBe(kill)
      expect(state.currentNightKills).toBe(kill)
      expect(state.money).toBe(kill * ZOMBIE_ESCAPE_SIMULATION.killReward)

      const replacementSlot = waitForLivingBossGeneration(
        state,
        input,
        arena,
        ZOMBIE_ESCAPE_BOSS_KIND.heavy,
        killedGeneration,
      )
      expect(state.zombies.pool.active[replacementSlot]).toBe(1)
      expect(state.zombies.health[replacementSlot]).toBe(expectedHeavyHealth)
      expect(state.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.heavy]).toBe(0)
      expect(state.bossDefeated[ZOMBIE_ESCAPE_BOSS_KIND.heavy]).toBe(0)
      expect(countLivingBodyClass(state, 'heavy')).toBe(1)
    }

    const survivingHeavySlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.heavy]!
    state.zombies.x[survivingHeavySlot] = state.player.x + 6
    state.zombies.z[survivingHeavySlot] = state.player.z + 6
    state.zombies.speedScale[survivingHeavySlot] = 0
    const killedBruteSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]!
    expect(killedBruteSlot).toBe(initialBruteSlot)
    expect(state.zombies.health[killedBruteSlot]).toBe(expectedBruteHealth)

    fireProjectilesUntilBossDies(state, input, arena, ZOMBIE_ESCAPE_BOSS_KIND.brute, 3)
    expect(state.zombies.health[killedBruteSlot]).toBeLessThanOrEqual(0)
    expect(state.zombies.deathPresentationSeconds[killedBruteSlot]).toBeGreaterThan(0)
    expect(state.kills).toBe(3)
    expect(state.currentNightKills).toBe(3)
    expect(state.money).toBe(3 * ZOMBIE_ESCAPE_SIMULATION.killReward)

    for (
      let frame = 0;
      frame < 300 && state.bossDefeated[ZOMBIE_ESCAPE_BOSS_KIND.brute] === 0;
      frame += 1
    ) {
      stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(-1)
    expect(state.bossOwnerGeneration[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(0)
    expect(state.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(0)
    expect(state.bossDefeated[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(1)
    expect(countLivingBodyClass(state, 'brute')).toBe(0)

    for (let frame = 0; frame < 120; frame += 1) {
      stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    }
    expect(state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(-1)
    expect(state.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(0)
    expect(state.bossDefeated[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(1)
    expect(countLivingBodyClass(state, 'brute')).toBe(0)
  })

  test('acquires the exact closest same-layer crumb within a fixed global scan budget', () => {
    const arena = createZombieEscapeArena(82_003)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 82_004, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    resetZombieEscapePlayerTrail(state.playerTrail)
    const firstSequence = recordTrailPoint(state, -1, 0)
    const closestSequence = recordTrailPoint(state, 1, 0)
    const newestSequence = recordTrailPoint(state, 3, 0)
    expect(firstSequence).toBeLessThan(closestSequence)
    expect(closestSequence).toBeLessThan(newestSequence)

    const heavySlot = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      0,
      0,
      0,
      52,
      ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
    )
    expect(heavySlot).toBeGreaterThanOrEqual(0)
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

    expect(state.zombies.pursuitTrailGeneration[heavySlot]).toBe(state.playerTrail.generation)
    expect(state.zombies.pursuitTrailSequence[heavySlot]).toBe(closestSequence)
    expect(state.zombies.pursuitTrailSequence[heavySlot]).toBeLessThan(newestSequence)
    expect(state.playerTrailAcquisitionCandidateBudgetRemaining).toBe(
      ZOMBIE_ESCAPE_SIMULATION.playerTrailClosestPointCandidateBudgetPerTick - 3,
    )
  })

  test('gives both bosses a bounded fair slice while finding exact closest points in 256 crumbs', () => {
    const arena = createZombieEscapeArena(82_005)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 82_006, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 2
    state.player.y = 0
    state.player.z = 0
    resetZombieEscapePlayerTrail(state.playerTrail)
    for (let index = 0; index < 254; index += 1) recordTrailPoint(state, 100 + index, 0)
    const heavyClosestSequence = recordTrailPoint(state, -2, 0)
    const bruteClosestSequence = recordTrailPoint(state, 2, 0)

    const heavySlot = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      -4,
      0,
      0,
      52,
      ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
    )
    const bruteSlot = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      4,
      0,
      0,
      52,
      ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
    )
    expect(heavySlot).toBeGreaterThanOrEqual(0)
    expect(bruteSlot).toBeGreaterThanOrEqual(0)

    for (let tick = 0; tick < 7; tick += 1) {
      stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
      expect(state.playerTrailAcquisitionCandidateBudgetRemaining).toBe(0)
      expect(state.zombies.pursuitTrailSequence[heavySlot]).toBe(0)
      expect(state.zombies.pursuitTrailSequence[bruteSlot]).toBe(0)
      expect(state.zombies.pursuitTrailAcquisitionNextSequence[heavySlot]).toBe(1 + 32 * (tick + 1))
      expect(state.zombies.pursuitTrailAcquisitionNextSequence[bruteSlot]).toBe(1 + 32 * (tick + 1))
      expect(state.zombies.pursuitTrailAcquisitionSourceX[heavySlot]).toBe(-4)
      expect(state.zombies.pursuitTrailAcquisitionSourceX[bruteSlot]).toBe(4)
      if (tick === 0) {
        state.zombies.x[heavySlot] = 4
        state.zombies.x[bruteSlot] = -4
      }
    }

    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.playerTrailAcquisitionCandidateBudgetRemaining).toBe(0)
    expect(state.zombies.pursuitTrailGeneration[heavySlot]).toBe(state.playerTrail.generation)
    expect(state.zombies.pursuitTrailGeneration[bruteSlot]).toBe(state.playerTrail.generation)
    expect(state.zombies.pursuitTrailSequence[heavySlot]).toBe(heavyClosestSequence)
    expect(state.zombies.pursuitTrailSequence[bruteSlot]).toBe(bruteClosestSequence)

    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.playerTrailAcquisitionCandidateBudgetRemaining).toBe(
      ZOMBIE_ESCAPE_SIMULATION.playerTrailClosestPointCandidateBudgetPerTick,
    )
  })

  test('follows the closest breadcrumb even when it points opposite the ordinary route', () => {
    const arena = createZombieEscapeArena(82_007)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 82_008, undefined, {
      zombieCapacity: 8,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = 3
    state.player.y = 0
    state.player.z = 0
    resetZombieEscapePlayerTrail(state.playerTrail)
    const closestSequence = recordTrailPoint(state, -1, 0)
    recordTrailPoint(state, -2, 0)
    recordTrailPoint(state, 3, 0)
    const heavySlot = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      0,
      0,
      0,
      52,
      ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
    )

    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

    expect(state.zombies.pursuitTrailSequence[heavySlot]).toBe(closestSequence)
    expect(state.zombies.vx[heavySlot]).toBeLessThan(0)
  })

  test('reserves two additive boss slots without ever scheduling above pool capacity', () => {
    const { arena, input, state } = createBossTestState(82_009)
    state.phaseSecondsRemaining = 60

    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

    expect(resolveZombieEscapeScheduledPopulation(state)).toBe(16)
    expect(
      state.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.heavy] +
        state.bossSpawned[ZOMBIE_ESCAPE_BOSS_KIND.heavy],
    ).toBe(1)
    expect(
      state.bossSpawnPending[ZOMBIE_ESCAPE_BOSS_KIND.brute] +
        state.bossSpawned[ZOMBIE_ESCAPE_BOSS_KIND.brute],
    ).toBe(1)

    state.player.health = Number.MAX_SAFE_INTEGER
    for (let frame = 0; frame < 2_000 && state.zombies.pool.activeCount < 16; frame += 1) {
      stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
      state.zombies.speedScale.fill(0)
      expect(resolveZombieEscapeScheduledPopulation(state)).toBeLessThanOrEqual(16)
    }
    expect(state.zombies.pool.activeCount).toBe(16)
    expect(resolveZombieEscapeScheduledPopulation(state)).toBe(16)
    expect(countActiveBodyClass(state, 'standard')).toBe(14)
    expect(countActiveBodyClass(state, 'heavy')).toBe(1)
    expect(countActiveBodyClass(state, 'brute')).toBe(1)
  })

  test('does not queue a boss above an already full pool', () => {
    const arena = createZombieEscapeArena(82_011)
    arena.obstacleCount = 0
    const state = createZombieEscapeSimulation(arena, 82_012, undefined, {
      zombieCapacity: 1,
    })
    const input = createZombieEscapeControlState()
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.replacementSpawnRemaining = 0
    state.phaseSecondsRemaining = 60
    spawnZombieEscapeZombieAtNavigationElevation(state, 4, 4, 0)

    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)

    expect(resolveZombieEscapeScheduledPopulation(state)).toBe(1)
    expect([...state.bossSpawnPending]).toEqual([0, 0])
  })

  test('rearms both timed bosses at the start of every new night', () => {
    const { arena, input, state } = createBossTestState(82_010)
    state.phaseSecondsRemaining = 60
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    const bruteSlot = state.bossOwnerSlot[ZOMBIE_ESCAPE_BOSS_KIND.brute]!
    state.zombies.health[bruteSlot] = 0
    state.zombies.deathPresentationSeconds[bruteSlot] = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(state.bossDefeated[ZOMBIE_ESCAPE_BOSS_KIND.brute]).toBe(1)

    setZombieEscapeGamePhase(state, 'build')
    setZombieEscapeGamePhase(state, 'night')

    expect([...state.bossDefeated]).toEqual([0, 0])
    expect([...state.bossSpawnPending]).toEqual([0, 0])
    expect([...state.bossSpawned]).toEqual([0, 0])
    expect([...state.bossOwnerSlot]).toEqual([-1, -1])
    state.waveSpawnRemaining = 0
    state.phaseSecondsRemaining = 60
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    state.waveSpawnTimerSeconds = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    expect(countActiveBodyClass(state, 'heavy')).toBe(1)
    expect(countActiveBodyClass(state, 'brute')).toBe(1)
  })
})

function createBossTestState(seed: number) {
  const arena = createZombieEscapeArena(seed)
  arena.obstacleCount = 0
  const state = createZombieEscapeSimulation(arena, seed + 1, undefined, {
    zombieCapacity: 16,
  })
  const input = createZombieEscapeControlState()
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.replacementSpawnRemaining = 0
  state.waveSpawnTimerSeconds = 0
  state.waveState = 'active'
  return { arena, input, state }
}

function countActiveBodyClass(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  bodyClass: 'standard' | 'heavy' | 'brute',
) {
  let count = 0
  for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
    if (state.zombies.pool.active[slot] === 0) continue
    if (ZOMBIE_ESCAPE_ZOMBIE_CATALOG[state.zombies.variant[slot]!]!.bodyClass === bodyClass) {
      count += 1
    }
  }
  return count
}

function countLivingBodyClass(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  bodyClass: 'standard' | 'heavy' | 'brute',
) {
  let count = 0
  for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
    if (state.zombies.pool.active[slot] === 0 || state.zombies.health[slot]! <= 0) continue
    if (ZOMBIE_ESCAPE_ZOMBIE_CATALOG[state.zombies.variant[slot]!]!.bodyClass === bodyClass) {
      count += 1
    }
  }
  return count
}

function fireProjectilesUntilBossDies(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
  bossKind: (typeof ZOMBIE_ESCAPE_BOSS_KIND)[keyof typeof ZOMBIE_ESCAPE_BOSS_KIND],
  expectedKillCount: number,
) {
  const slot = state.bossOwnerSlot[bossKind]!
  input.aimX = 0
  input.aimZ = -1
  input.aimStrength = 1
  input.fire = true
  for (let frame = 0; frame < 600 && state.kills < expectedKillCount; frame += 1) {
    state.zombies.x[slot] = state.player.x
    state.zombies.y[slot] = state.player.y
    state.zombies.z[slot] = state.player.z - 3.2
    state.zombies.speedScale[slot] = 0
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
  }
  input.fire = false
  expect(state.kills).toBe(expectedKillCount)
}

function waitForLivingBossGeneration(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  input: ReturnType<typeof createZombieEscapeControlState>,
  arena: ReturnType<typeof createZombieEscapeArena>,
  bossKind: (typeof ZOMBIE_ESCAPE_BOSS_KIND)[keyof typeof ZOMBIE_ESCAPE_BOSS_KIND],
  previousGeneration: number,
) {
  let replacementSlot = -1
  for (let frame = 0; frame < 300 && replacementSlot < 0; frame += 1) {
    stepZombieEscapeSimulationPhysics(state, input, FIXED_DELTA_SECONDS, arena)
    const candidateSlot = state.bossOwnerSlot[bossKind]!
    if (
      candidateSlot >= 0 &&
      state.bossOwnerGeneration[bossKind] !== previousGeneration &&
      state.zombies.pool.active[candidateSlot] !== 0 &&
      state.zombies.health[candidateSlot]! > 0
    ) {
      replacementSlot = candidateSlot
    }
  }
  expect(replacementSlot).toBeGreaterThanOrEqual(0)
  expect(state.bossOwnerGeneration[bossKind]).not.toBe(previousGeneration)
  return replacementSlot
}

function recordTrailPoint(
  state: ReturnType<typeof createZombieEscapeSimulation>,
  x: number,
  z: number,
) {
  return recordZombieEscapePlayerTrailPoint(
    state.playerTrail,
    {
      layerIndex: -1,
      regionIndex: -1,
      tick: state.navigationIntentTick,
      x,
      y: 0,
      z,
    },
    true,
  )
}
