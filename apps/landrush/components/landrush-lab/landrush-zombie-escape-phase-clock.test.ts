import { describe, expect, test } from 'bun:test'
import {
  ZOMBIE_ESCAPE_SEED,
  ZOMBIE_ESCAPE_SIMULATION,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeGamePhase,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import {
  advanceLandrushZombieEscapePhaseClock,
  createLandrushZombieEscapePhaseClock,
  stepLandrushZombieEscapeIntegratedSimulation,
} from './landrush-zombie-escape-runtime'

describe('integrated Zombie Escape authoritative phase clock', () => {
  test('holds the build phase until the player starts the night', () => {
    const simulation = createPhaseClockSimulation().simulation
    const clock = createLandrushZombieEscapePhaseClock()
    const initialRemaining = simulation.phaseSecondsRemaining

    samplePhaseClock(clock, simulation, 10, 'build')
    const transition = samplePhaseClock(
      clock,
      simulation,
      10 + ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds * 4,
      'build',
    )

    expect(transition).toEqual({ advancedSeconds: 0, phaseChanged: false })
    expect(simulation.phase).toBe('build')
    expect(simulation.phaseSecondsRemaining).toBe(initialRemaining)
    expect(simulation.night).toBe(0)
  })

  test('ends night across a large stall, discards excess, and leaves physics time capped', () => {
    const { arena, simulation } = createPhaseClockSimulation()
    const clock = createLandrushZombieEscapePhaseClock()
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.phaseSecondsRemaining = 0.25

    samplePhaseClock(clock, simulation, 100, 'night')
    const transition = samplePhaseClock(clock, simulation, 145, 'night')

    expect(transition).toEqual({ advancedSeconds: 45, phaseChanged: true })
    expect(simulation.phase).toBe('build')
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds)
    expect(simulation.night).toBe(1)
    expect(simulation.elapsedSeconds).toBe(0)

    const waitingForParent = samplePhaseClock(clock, simulation, 150, 'night')
    expect(waitingForParent).toEqual({ advancedSeconds: 0, phaseChanged: false })
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds)

    const physicsOutcome = stepLandrushZombieEscapeIntegratedSimulation({
      arena,
      deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      expectedPhase: 'build',
      input: createZombieEscapeControlState(),
      phaseReady: true,
      simulation,
    })
    expect(physicsOutcome.stepped).toBe(true)
    expect(simulation.elapsedSeconds).toBeCloseTo(ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, 12)
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds)
  })

  test('converges for one stalled second and sixty equal wall-time partitions', () => {
    const stalled = createPhaseClockSimulation().simulation
    const partitioned = createPhaseClockSimulation().simulation
    const stalledClock = createLandrushZombieEscapePhaseClock()
    const partitionedClock = createLandrushZombieEscapePhaseClock()
    setZombieEscapeGamePhase(stalled, 'night')
    setZombieEscapeGamePhase(partitioned, 'night')

    samplePhaseClock(stalledClock, stalled, 10, 'night')
    samplePhaseClock(partitionedClock, partitioned, 250, 'night')
    samplePhaseClock(stalledClock, stalled, 11, 'night')
    for (let frame = 1; frame <= 60; frame += 1) {
      samplePhaseClock(partitionedClock, partitioned, 250 + frame / 60, 'night')
    }

    expect(partitioned.phase).toBe(stalled.phase)
    expect(partitioned.night).toBe(stalled.night)
    expect(partitioned.phaseSecondsRemaining).toBeCloseTo(stalled.phaseSecondsRemaining, 10)
    expect(partitioned.elapsedSeconds).toBe(stalled.elapsedSeconds)
  })

  test('rebases without advancing while readiness, expected phase, or pause blocks authority', () => {
    const simulation = createPhaseClockSimulation().simulation
    const clock = createLandrushZombieEscapePhaseClock()
    setZombieEscapeGamePhase(simulation, 'night')
    const initialRemaining = simulation.phaseSecondsRemaining

    samplePhaseClock(clock, simulation, 20, 'night')
    samplePhaseClock(clock, simulation, 21, 'night', false)
    simulation.paused = true
    samplePhaseClock(clock, simulation, 22, 'night')
    simulation.paused = false
    samplePhaseClock(clock, simulation, 23, 'build')

    expect(simulation.phaseSecondsRemaining).toBe(initialRemaining)

    samplePhaseClock(clock, simulation, 24, 'night')
    expect(simulation.phaseSecondsRemaining).toBeCloseTo(initialRemaining - 1, 12)
  })

  test('rebases a replaced authority clock without waiting for its prior origin', () => {
    const simulation = createPhaseClockSimulation().simulation
    const clock = createLandrushZombieEscapePhaseClock()
    setZombieEscapeGamePhase(simulation, 'night')
    const initialRemaining = simulation.phaseSecondsRemaining

    samplePhaseClock(clock, simulation, 100, 'night')
    samplePhaseClock(clock, simulation, 5, 'night')
    const resumed = samplePhaseClock(clock, simulation, 6, 'night')

    expect(resumed).toEqual({ advancedSeconds: 1, phaseChanged: false })
    expect(simulation.phaseSecondsRemaining).toBeCloseTo(initialRemaining - 1, 12)
  })

  test('produces equal phase state for clients with different render cadences and clock origins', () => {
    const first = createPhaseClockSimulation().simulation
    const second = createPhaseClockSimulation().simulation
    const firstClock = createLandrushZombieEscapePhaseClock()
    const secondClock = createLandrushZombieEscapePhaseClock()
    setZombieEscapeGamePhase(first, 'night')
    setZombieEscapeGamePhase(second, 'night')

    for (const now of [1_000, 1_000.04, 1_000.19, 1_000.63, 1_001.75]) {
      samplePhaseClock(firstClock, first, now, 'night')
    }
    for (const now of [80, 80.2, 80.55, 81.1, 81.75]) {
      samplePhaseClock(secondClock, second, now, 'night')
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
