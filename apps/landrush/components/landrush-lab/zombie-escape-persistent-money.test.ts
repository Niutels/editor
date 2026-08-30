import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeSimulation,
  resetZombieEscapeSimulation,
  setZombieEscapeGamePhase,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('Zombie Escape persistent money and day revival', () => {
  test('preserves money across reset', () => {
    const arena = createZombieEscapeArena(101)
    const simulation = createZombieEscapeSimulation(arena, 102)
    simulation.money = 430

    resetZombieEscapeSimulation(simulation, arena)

    expect(simulation.money).toBe(430)
  })

  test('entering day revives a dead player without changing money', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(103), 104)
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.money = 510
    simulation.player.health = 0
    simulation.player.hurtFlash = 0.75
    simulation.status = 'lost'

    setZombieEscapeGamePhase(simulation, 'build')

    expect(simulation.phase).toBe('build')
    expect(simulation.status).toBe('playing')
    expect(simulation.player.health).toBe(100)
    expect(simulation.player.hurtFlash).toBe(0)
    expect(simulation.money).toBe(510)
  })

  test('entering day does not heal or reset a surviving player', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(105), 106)
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.player.health = 42
    simulation.player.hurtFlash = 0.25

    setZombieEscapeGamePhase(simulation, 'build')

    expect(simulation.status).toBe('playing')
    expect(simulation.player.health).toBe(42)
    expect(simulation.player.hurtFlash).toBe(0.25)
  })

  test('entering day resumes a winner without changing health', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(107), 108)
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.player.health = 68
    simulation.player.hurtFlash = 0.1
    simulation.status = 'won'

    setZombieEscapeGamePhase(simulation, 'build')

    expect(simulation.status).toBe('playing')
    expect(simulation.player.health).toBe(68)
    expect(simulation.player.hurtFlash).toBe(0.1)
  })
})
