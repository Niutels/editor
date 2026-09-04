import { describe, expect, test } from 'bun:test'
import {
  ZOMBIE_ESCAPE_SEED,
  ZOMBIE_ESCAPE_SIMULATION,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { createZombieEscapeControlState } from '@landrush/zombie-gameplay/zombie-escape-controls'
import {
  createZombieEscapeHudSnapshot,
  createZombieEscapeSimulation,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import {
  advanceLandrushZombieEscapeRestartButtonState,
  createLandrushZombieEscapeRestartButtonState,
  requestLandrushZombieEscapeNightStart,
  resolveLandrushZombieEscapeIntegratedLocomotionEnabled,
  restartLandrushZombieEscapeIntegratedSimulation,
  stepLandrushZombieEscapeIntegratedSimulation,
} from './landrush-zombie-escape-runtime'

describe('integrated Zombie Escape terminal lifecycle', () => {
  test('keeps a lethal step in terminal night instead of resetting to Day', () => {
    const { arena, input, simulation } = createLethalIntegratedSimulation()

    const outcome = stepUntilIntegratedTerminal({
      arena,
      input,
      simulation,
    })
    const snapshot = createZombieEscapeHudSnapshot(simulation)

    expect(outcome).toEqual({ phaseChanged: false, stepped: true, terminal: true })
    expect(snapshot.status).toBe('lost')
    expect(snapshot.phase).toBe('night')
    expect(snapshot.health).toBe(0)
  })

  test('resets external motion before either terminal outcome starts one deterministic Day', () => {
    for (const terminalStatus of ['lost', 'won'] as const) {
      const { arena, simulation } = createTerminalIntegratedSimulation(terminalStatus)
      const externalMotion = {
        velocityX: 4,
        velocityZ: -2,
        x: 9,
        z: -3,
      }
      let externalResetCalls = 0

      restartLandrushZombieEscapeIntegratedSimulation({
        arena,
        resetExternalPlayerMotion: () => {
          expect(simulation.status).toBe(terminalStatus)
          externalResetCalls += 1
          externalMotion.velocityX = 0
          externalMotion.velocityZ = 0
          externalMotion.x = arena.playerStartX
          externalMotion.z = arena.playerStartZ
        },
        simulation,
      })

      simulation.player.x = externalMotion.x
      simulation.player.z = externalMotion.z
      simulation.player.vx = externalMotion.velocityX
      simulation.player.vz = externalMotion.velocityZ

      expect(externalResetCalls).toBe(1)
      expect(createZombieEscapeHudSnapshot(simulation)).toMatchObject({
        health: 100,
        night: 0,
        phase: 'build',
        phaseSecondsRemaining: ZOMBIE_ESCAPE_SIMULATION.buildDurationSeconds,
        status: 'playing',
        zombies: 0,
      })
      expect(simulation.player).toMatchObject({
        vx: 0,
        vz: 0,
        x: arena.playerStartX,
        z: arena.playerStartZ,
      })
    }
  })

  test('does not advance time, spawn, or damage while the camera handoff is unready', () => {
    const { arena, input, simulation } = createLethalIntegratedSimulation()
    const before = createZombieEscapeHudSnapshot(simulation)

    for (let frame = 0; frame < 84; frame += 1) {
      const outcome = stepLandrushZombieEscapeIntegratedSimulation({
        arena,
        deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        expectedPhase: 'night',
        input,
        phaseReady: false,
        simulation,
      })
      expect(outcome.stepped).toBe(false)
    }

    expect(createZombieEscapeHudSnapshot(simulation)).toMatchObject({
      elapsedSeconds: before.elapsedSeconds,
      health: before.health,
      phase: 'night',
      status: 'playing',
      zombies: before.zombies,
    })
  })

  test('starts deterministic first-wave damage only after readiness', () => {
    const arena = createIntegratedArena()
    const simulation = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED)
    const input = createZombieEscapeControlState()
    setZombieEscapeGamePhase(simulation, 'night')
    const beforeHandoff = createZombieEscapeHudSnapshot(simulation)

    for (let frame = 0; frame < 84; frame += 1) {
      stepLandrushZombieEscapeIntegratedSimulation({
        arena,
        deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        expectedPhase: 'night',
        input,
        phaseReady: false,
        simulation,
      })
    }
    expect(createZombieEscapeHudSnapshot(simulation)).toMatchObject({
      elapsedSeconds: beforeHandoff.elapsedSeconds,
      health: beforeHandoff.health,
      zombies: beforeHandoff.zombies,
    })

    const baselineArena = createIntegratedArena()
    const baselineSimulation = createZombieEscapeSimulation(baselineArena, ZOMBIE_ESCAPE_SEED)
    const baselineInput = createZombieEscapeControlState()
    setZombieEscapeGamePhase(baselineSimulation, 'night')

    const firstDamageTick = stepUntilFirstIntegratedDamage({
      arena,
      input,
      simulation,
    })
    const baselineFirstDamageTick = stepUntilFirstIntegratedDamage({
      arena: baselineArena,
      input: baselineInput,
      simulation: baselineSimulation,
    })

    expect(firstDamageTick).toBe(baselineFirstDamageTick)
    expect(firstDamageTick).toBeGreaterThan(0)
    expect(firstDamageTick).toBeLessThanOrEqual(720)
    expect(simulation.elapsedSeconds).toBeCloseTo(
      firstDamageTick * ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      6,
    )
    expect(simulation.player.health).toBe(92)
    expect(simulation.phase).toBe('night')
    expect(simulation.status).toBe('playing')
  })

  test('keeps hidden weapon pickups inactive throughout integrated Day', () => {
    const arena = createIntegratedArena()
    const simulation = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED)
    const pickup = simulation.weaponPickups.find(({ weaponIndex }) => weaponIndex === 1)
    expect(pickup).toBeDefined()
    if (!pickup) return
    simulation.player.x = pickup.x
    simulation.player.y = pickup.y
    simulation.player.z = pickup.z
    simulation.money = 1_000
    const input = createZombieEscapeControlState()
    input.inputMode = 'touch'
    input.interactPressed = true

    stepLandrushZombieEscapeIntegratedSimulation({
      arena,
      deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      expectedPhase: 'build',
      input,
      phaseReady: true,
      simulation,
    })

    expect(simulation.player.weaponIndex).toBe(0)
    expect(simulation.weaponPurchaseCount).toBe(0)
    expect(createZombieEscapeHudSnapshot(simulation).pickupPrompt).toBeNull()
    expect(input.inputMode).toBe('touch')
    expect(input.interactPressed).toBe(false)

    setZombieEscapeGamePhase(simulation, 'night')
    stepLandrushZombieEscapeIntegratedSimulation({
      arena,
      deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      expectedPhase: 'night',
      input,
      phaseReady: true,
      simulation,
    })

    expect(simulation.player.weaponIndex).toBe(1)
    expect(simulation.weaponPurchaseCount).toBe(1)
  })

  test('holds both won and lost terminal snapshots without advancing simulation', () => {
    for (const terminalStatus of ['lost', 'won'] as const) {
      const { arena, input, simulation } = createTerminalIntegratedSimulation(terminalStatus)
      const elapsedSeconds = simulation.elapsedSeconds

      const outcome = stepLandrushZombieEscapeIntegratedSimulation({
        arena,
        deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        expectedPhase: 'night',
        input,
        phaseReady: true,
        simulation,
      })

      expect(outcome).toEqual({ phaseChanged: false, stepped: false, terminal: true })
      expect(simulation.elapsedSeconds).toBe(elapsedSeconds)
      expect(simulation.phase).toBe('night')
      expect(simulation.status).toBe(terminalStatus)
    }
  })

  test('freezes integrated locomotion for either terminal status without affecting normal island movement', () => {
    expect(
      resolveLandrushZombieEscapeIntegratedLocomotionEnabled({
        baseMovementEnabled: true,
        status: 'playing',
        zombieEscapeEnabled: true,
      }),
    ).toBe(true)

    for (const status of ['lost', 'won'] as const) {
      expect(
        resolveLandrushZombieEscapeIntegratedLocomotionEnabled({
          baseMovementEnabled: true,
          status,
          zombieEscapeEnabled: true,
        }),
      ).toBe(false)
      expect(
        resolveLandrushZombieEscapeIntegratedLocomotionEnabled({
          baseMovementEnabled: true,
          status,
          zombieEscapeEnabled: false,
        }),
      ).toBe(true)
    }

    expect(
      resolveLandrushZombieEscapeIntegratedLocomotionEnabled({
        baseMovementEnabled: false,
        status: 'playing',
        zombieEscapeEnabled: true,
      }),
    ).toBe(false)
  })

  test('requires a released then freshly pressed Triangle for either terminal restart', () => {
    for (const status of ['lost', 'won'] as const) {
      const buttonState = createLandrushZombieEscapeRestartButtonState()

      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, true, 'playing')).toBe(
        false,
      )
      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, true, status)).toBe(false)
      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, false, status)).toBe(false)
      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, true, status)).toBe(true)
      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, true, status)).toBe(false)
      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, true, 'playing')).toBe(
        false,
      )
      expect(advanceLandrushZombieEscapeRestartButtonState(buttonState, true, status)).toBe(false)
    }
  })

  test('starts night exactly once from a ready, playing Day', () => {
    const simulation = createZombieEscapeSimulation(createIntegratedArena(), ZOMBIE_ESCAPE_SEED)

    simulation.paused = true
    expect(
      requestLandrushZombieEscapeNightStart({
        expectedPhase: 'build',
        phaseReady: true,
        simulation,
      }),
    ).toBe(false)
    simulation.paused = false
    expect(
      requestLandrushZombieEscapeNightStart({
        expectedPhase: 'build',
        phaseReady: false,
        simulation,
      }),
    ).toBe(false)
    expect(
      requestLandrushZombieEscapeNightStart({
        expectedPhase: 'night',
        phaseReady: true,
        simulation,
      }),
    ).toBe(false)

    expect(
      requestLandrushZombieEscapeNightStart({
        expectedPhase: 'build',
        phaseReady: true,
        simulation,
      }),
    ).toBe(true)
    expect(simulation.phase).toBe('night')
    expect(simulation.night).toBe(1)
    expect(simulation.phaseSecondsRemaining).toBe(ZOMBIE_ESCAPE_SIMULATION.nightDurationSeconds)
    const scheduledZombieCount = simulation.waveSpawnRemaining

    expect(
      requestLandrushZombieEscapeNightStart({
        expectedPhase: 'build',
        phaseReady: true,
        simulation,
      }),
    ).toBe(false)
    expect(simulation.night).toBe(1)
    expect(simulation.waveSpawnRemaining).toBe(scheduledZombieCount)
  })
})

function createIntegratedArena() {
  const arena = createZombieEscapeArena(ZOMBIE_ESCAPE_SEED)
  arena.obstacleCount = 0
  arena.playerStartX = 0
  arena.playerStartZ = 0
  return arena
}

function stepUntilFirstIntegratedDamage({
  arena,
  input,
  simulation,
}: {
  arena: ReturnType<typeof createIntegratedArena>
  input: ReturnType<typeof createZombieEscapeControlState>
  simulation: ReturnType<typeof createZombieEscapeSimulation>
}) {
  const initialHealth = simulation.player.health
  for (let tick = 1; tick <= 720; tick += 1) {
    stepLandrushZombieEscapeIntegratedSimulation({
      arena,
      deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      expectedPhase: 'night',
      input,
      phaseReady: true,
      simulation,
    })
    if (simulation.player.health < initialHealth) return tick
  }
  return Number.POSITIVE_INFINITY
}

function createLethalIntegratedSimulation() {
  const arena = createIntegratedArena()
  const simulation = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED)
  const input = createZombieEscapeControlState()
  setZombieEscapeGamePhase(simulation, 'night')
  simulation.waveSpawnRemaining = 0
  simulation.waveState = 'escape'
  simulation.player.health = 8
  const zombie = spawnZombieEscapeZombie(
    simulation,
    simulation.player.x,
    simulation.player.z - 0.7,
    120,
  )
  return { arena, input, simulation }
}

function createWinningIntegratedSimulation() {
  const arena = createIntegratedArena()
  const simulation = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED)
  const input = createZombieEscapeControlState()
  setZombieEscapeGamePhase(simulation, 'night')
  simulation.extractionOpen = true
  simulation.waveSpawnRemaining = 0
  simulation.waveState = 'escape'
  simulation.player.x = arena.escapeX
  simulation.player.z = arena.escapeZ
  return { arena, input, simulation }
}

function createTerminalIntegratedSimulation(status: 'lost' | 'won') {
  const state =
    status === 'lost' ? createLethalIntegratedSimulation() : createWinningIntegratedSimulation()
  stepUntilIntegratedTerminal({
    arena: state.arena,
    input: state.input,
    simulation: state.simulation,
  })
  expect(state.simulation.status).toBe(status)
  return state
}

function stepUntilIntegratedTerminal({
  arena,
  input,
  simulation,
}: {
  arena: ReturnType<typeof createIntegratedArena>
  input: ReturnType<typeof createZombieEscapeControlState>
  simulation: ReturnType<typeof createZombieEscapeSimulation>
}) {
  for (let tick = 0; tick < 120; tick += 1) {
    const outcome = stepLandrushZombieEscapeIntegratedSimulation({
      arena,
      deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      expectedPhase: 'night',
      input,
      phaseReady: true,
      simulation,
    })
    if (outcome.terminal) return outcome
  }
  throw new Error('Integrated Zombie Escape simulation did not reach a terminal state')
}
