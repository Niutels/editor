import { expect, test } from 'bun:test'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeGamePhase,
  stepZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'

test('indexes a wave spawn before its first agent update', () => {
  const arena = createZombieEscapeArena(91_001)
  const simulation = createZombieEscapeSimulation(arena, 91_002)
  const input = createZombieEscapeControlState()
  setZombieEscapeGamePhase(simulation, 'night')
  simulation.waveSpawnRemaining = 1
  simulation.waveSpawnTimerSeconds = 0

  stepZombieEscapeSimulation(simulation, input, 1 / 60, arena)

  expect(simulation.zombies.pool.activeCount).toBe(1)
  expect(simulation.agentSpatialIndex.indexedAgentCount).toBe(0)
  expect(simulation.agentSpatialIndex.unindexedAgentCount).toBe(0)

  stepZombieEscapeSimulation(simulation, input, 1 / 60, arena)

  expect(simulation.zombies.pool.activeCount).toBe(1)
  expect(simulation.agentSpatialIndex.indexedAgentCount).toBe(1)
  expect(simulation.agentSpatialIndex.unindexedAgentCount).toBe(0)
})
