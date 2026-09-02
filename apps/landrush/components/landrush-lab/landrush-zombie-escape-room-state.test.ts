import { describe, expect, test } from 'bun:test'
import type { MultiplayerZombieEscapeStateSnapshot } from '@landrush/protocol'
import {
  applyLandrushZombieEscapeRoomState,
  type LandrushZombieEscapeRoomStateObservation,
  projectLandrushZombieEscapePhaseElapsedSeconds,
  projectLandrushZombieEscapePhaseSecondsRemaining,
} from './landrush-zombie-escape-room-state'
import { createZombieEscapeSimulation, setZombieEscapeGamePhase } from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Zombie Escape canonical room state', () => {
  test('projects an absolute deadline from the server receipt pair and clamps it', () => {
    const observation = createObservation({ phase: 'night', phaseEndsAt: 1_050_000 })

    expect(projectLandrushZombieEscapePhaseSecondsRemaining({ nowMs: 12_500, observation })).toBe(
      47.5,
    )
    expect(projectLandrushZombieEscapePhaseSecondsRemaining({ nowMs: 90_000, observation })).toBe(0)
  })

  test('represents a held build phase without a countdown', () => {
    const observation = createObservation({ phaseEndsAt: null })

    expect(projectLandrushZombieEscapePhaseSecondsRemaining({ nowMs: 90_000, observation })).toBe(0)
  })

  test('projects canonical night elapsed time and clamps it to the server duration', () => {
    const observation = createObservation({ phase: 'night', phaseEndsAt: 1_180_000 })

    expect(projectLandrushZombieEscapePhaseElapsedSeconds(10_000, observation)).toBe(0)
    expect(projectLandrushZombieEscapePhaseElapsedSeconds(40_000, observation)).toBe(30)
    expect(projectLandrushZombieEscapePhaseElapsedSeconds(250_000, observation)).toBe(180)
  })

  test('has no canonical elapsed clock outside an observed night', () => {
    const observation = createObservation({ phaseEndsAt: null })

    expect(projectLandrushZombieEscapePhaseElapsedSeconds(10_000, observation)).toBeNull()
  })

  test('preseeds the night so a late join enters the canonical wave', () => {
    const simulation = createSimulation()
    const observation = createObservation({ night: 4, phase: 'night', phaseEndsAt: 1_150_000 })

    const result = applyLandrushZombieEscapeRoomState({
      appliedState: null,
      nowMs: 10_000,
      observation,
      simulation,
    })

    expect(result.phaseChanged).toBe(true)
    expect(simulation.phase).toBe('night')
    expect(simulation.night).toBe(4)
    expect(simulation.wave).toBe(4)
    expect(simulation.waveSpawnRemaining).toBe(25)
    expect(simulation.phaseSecondsRemaining).toBe(150)
  })

  test('reserves both boss slots when a late join lands near the population cap', () => {
    const simulation = createSimulation()
    const observation = createObservation({ night: 4, phase: 'night', phaseEndsAt: 1_001_000 })

    applyLandrushZombieEscapeRoomState({
      appliedState: null,
      nowMs: 10_000,
      observation,
      simulation,
    })

    expect(simulation.phaseSecondsRemaining).toBe(1)
    expect(simulation.waveSpawnRemaining).toBe(98)
  })

  test('updates same-phase time without resetting active pools or personal state', () => {
    const simulation = createSimulation()
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.player.health = 37
    simulation.shotsFired = 8
    simulation.waveSpawnRemaining = 19
    const shots = simulation.shots
    const zombies = simulation.zombies
    const observation = createObservation({
      night: 1,
      phase: 'night',
      phaseEndsAt: 1_120_000,
      revision: 5,
    })
    const appliedState = {
      revision: 4,
      sessionId: observation.state.sessionId,
      transportGeneration: observation.transportGeneration,
    }

    const result = applyLandrushZombieEscapeRoomState({
      appliedState,
      nowMs: 20_000,
      observation,
      simulation,
    })

    expect(result.canonicalStateChanged).toBe(true)
    expect(result.destructiveTransition).toBe(false)
    expect(simulation.shots).toBe(shots)
    expect(simulation.zombies).toBe(zombies)
    expect(simulation.player.health).toBe(37)
    expect(simulation.shotsFired).toBe(8)
    expect(simulation.waveSpawnRemaining).toBe(19)
    expect(simulation.phaseSecondsRemaining).toBe(110)
  })

  test('re-enters an already-active night when the canonical night changes', () => {
    const simulation = createSimulation()
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.priorNightKills = 4
    simulation.currentNightKills = 17
    const observation = createObservation({ night: 3, phase: 'night', revision: 9 })

    const result = applyLandrushZombieEscapeRoomState({
      appliedState: null,
      nowMs: 10_000,
      observation,
      simulation,
    })

    expect(result.destructiveTransition).toBe(true)
    expect(simulation.night).toBe(3)
    expect(simulation.wave).toBe(3)
    expect(simulation.priorNightKills).toBe(17)
    expect(simulation.currentNightKills).toBe(0)
    expect(simulation.waveSpawnRemaining).toBe(81)

    simulation.currentNightKills = 2
    const sameNightObservation = createObservation({
      night: 3,
      phase: 'night',
      phaseEndsAt: 1_100_000,
      revision: 10,
    })
    const sameNightResult = applyLandrushZombieEscapeRoomState({
      appliedState: result.appliedState,
      nowMs: 20_000,
      observation: sameNightObservation,
      simulation,
    })

    expect(sameNightResult.destructiveTransition).toBe(false)
    expect(simulation.priorNightKills).toBe(17)
    expect(simulation.currentNightKills).toBe(2)
    expect(simulation.waveSpawnRemaining).toBe(81)
    expect(simulation.phaseSecondsRemaining).toBe(90)
  })

  test('force-applying an unchanged canonical build keeps its clock held', () => {
    const simulation = createSimulation()
    simulation.player.health = 41
    const observation = createObservation({ phaseEndsAt: null, revision: 2 })
    const appliedState = {
      revision: 2,
      sessionId: observation.state.sessionId,
      transportGeneration: observation.transportGeneration,
    }

    const result = applyLandrushZombieEscapeRoomState({
      appliedState,
      force: true,
      nowMs: 15_000,
      observation,
      simulation,
    })

    expect(result.reconciled).toBe(true)
    expect(result.destructiveTransition).toBe(false)
    expect(simulation.player.health).toBe(41)
    expect(simulation.phaseSecondsRemaining).toBe(0)
  })
})

function createSimulation() {
  const arena = createZombieEscapeArena(41_005)
  arena.obstacleCount = 0
  return createZombieEscapeSimulation(arena, 41_006)
}

function createObservation(
  state: Partial<MultiplayerZombieEscapeStateSnapshot>,
): LandrushZombieEscapeRoomStateObservation {
  return {
    receivedAtMs: 10_000,
    serverTime: 1_000_000,
    state: {
      night: 0,
      phase: 'build',
      phaseEndsAt: 1_060_000,
      revision: 0,
      sessionId: 'zombie-session-a',
      ...state,
    },
    transportGeneration: 3,
  }
}
