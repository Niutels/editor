import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushZombieEscapePhaseClock,
  createLandrushZombieEscapePhaseClock,
  stepLandrushZombieEscapeIntegratedSimulation,
} from './landrush-zombie-escape-runtime'
import { ZOMBIE_ESCAPE_SEED, ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import { createZombieEscapeSimulation } from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('integrated Zombie Escape authoritative phase clock', () => {
  test('reaches night from build without requiring combat to be active', () => {
    const simulation = createPhaseClockSimulation().simulation
    const clock = createLandrushZombieEscapePhaseClock()

    samplePhaseClock(clock, simulation, 10, 'build')
    const transition = samplePhaseClock(
      clock,
      simulation,
      10 + ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds,
      'build',
    )

    expect(transition.phaseChanged).toBe(true)
    expect(simulation.phase).toBe('night')
    expect(simulation.night).toBe(1)
  })

  test('advances one phase across a large stall, discards excess, and leaves physics time capped', () => {
    const { arena, simulation } = createPhaseClockSimulation()
    const clock = createLandrushZombieEscapePhaseClock()
    simulation.phaseSecondsRemaining = 0.25

    samplePhaseClock(clock, simulation, 100, 'build')
    const transition = samplePhaseClock(clock, simulation, 145, 'build')

    expect(transition).toEqual({ advancedSeconds: 45, phaseChanged: true })
    expect(simulation.phase).toBe('night')
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds)
    expect(simulation.night).toBe(1)
    expect(simulation.elapsedSeconds).toBe(0)

    const waitingForParent = samplePhaseClock(clock, simulation, 150, 'build')
    expect(waitingForParent).toEqual({ advancedSeconds: 0, phaseChanged: false })
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds)

    const physicsOutcome = stepLandrushZombieEscapeIntegratedSimulation({
      arena,
      deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      expectedPhase: 'night',
      input: createZombieEscapeControlState(),
      phaseReady: true,
      simulation,
    })
    expect(physicsOutcome.stepped).toBe(true)
    expect(simulation.elapsedSeconds).toBeCloseTo(ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, 12)
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds)
  })

  test('converges for one stalled second and sixty equal wall-time partitions', () => {
    const stalled = createPhaseClockSimulation().simulation
    const partitioned = createPhaseClockSimulation().simulation
    const stalledClock = createLandrushZombieEscapePhaseClock()
    const partitionedClock = createLandrushZombieEscapePhaseClock()

    samplePhaseClock(stalledClock, stalled, 10, 'build')
    samplePhaseClock(partitionedClock, partitioned, 250, 'build')
    samplePhaseClock(stalledClock, stalled, 11, 'build')
    for (let frame = 1; frame <= 60; frame += 1) {
      samplePhaseClock(partitionedClock, partitioned, 250 + frame / 60, 'build')
    }

    expect(partitioned.phase).toBe(stalled.phase)
    expect(partitioned.night).toBe(stalled.night)
    expect(partitioned.phaseSecondsRemaining).toBeCloseTo(stalled.phaseSecondsRemaining, 10)
    expect(partitioned.elapsedSeconds).toBe(stalled.elapsedSeconds)
  })

  test('rebases without advancing while readiness, expected phase, or pause blocks authority', () => {
    const simulation = createPhaseClockSimulation().simulation
    const clock = createLandrushZombieEscapePhaseClock()
    const initialRemaining = simulation.phaseSecondsRemaining

    samplePhaseClock(clock, simulation, 20, 'build')
    samplePhaseClock(clock, simulation, 21, 'build', false)
    simulation.paused = true
    samplePhaseClock(clock, simulation, 22, 'build')
    simulation.paused = false
    samplePhaseClock(clock, simulation, 23, 'night')

    expect(simulation.phaseSecondsRemaining).toBe(initialRemaining)

    samplePhaseClock(clock, simulation, 24, 'build')
    expect(simulation.phaseSecondsRemaining).toBeCloseTo(initialRemaining - 1, 12)
  })

  test('rebases a replaced authority clock without waiting for its prior origin', () => {
    const simulation = createPhaseClockSimulation().simulation
    const clock = createLandrushZombieEscapePhaseClock()
    const initialRemaining = simulation.phaseSecondsRemaining

    samplePhaseClock(clock, simulation, 100, 'build')
    samplePhaseClock(clock, simulation, 5, 'build')
    const resumed = samplePhaseClock(clock, simulation, 6, 'build')

    expect(resumed).toEqual({ advancedSeconds: 1, phaseChanged: false })
    expect(simulation.phaseSecondsRemaining).toBeCloseTo(initialRemaining - 1, 12)
  })

  test('produces equal phase state for clients with different render cadences and clock origins', () => {
    const first = createPhaseClockSimulation().simulation
    const second = createPhaseClockSimulation().simulation
    const firstClock = createLandrushZombieEscapePhaseClock()
    const secondClock = createLandrushZombieEscapePhaseClock()

    for (const now of [1_000, 1_000.04, 1_000.19, 1_000.63, 1_001.75]) {
      samplePhaseClock(firstClock, first, now, 'build')
    }
    for (const now of [80, 80.2, 80.55, 81.1, 81.75]) {
      samplePhaseClock(secondClock, second, now, 'build')
    }

    expect(second.phase).toBe(first.phase)
    expect(second.night).toBe(first.night)
    expect(second.phaseSecondsRemaining).toBeCloseTo(first.phaseSecondsRemaining, 10)
  })
})

function createPhaseClockSimulation() {
  const arena = createZombieEscapeArena(ZOMBIE_ESCAPE_SEED)
  arena.obstacleCount = 0
  return {
    arena,
    simulation: createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED),
  }
}

function samplePhaseClock(
  clock: ReturnType<typeof createLandrushZombieEscapePhaseClock>,
  simulation: ReturnType<typeof createZombieEscapeSimulation>,
  authorityNowSeconds: number,
  expectedPhase: 'build' | 'night',
  phaseReady = true,
) {
  return advanceLandrushZombieEscapePhaseClock({
    authorityNowSeconds,
    clock,
    expectedPhase,
    phaseReady,
    simulation,
  })
}
