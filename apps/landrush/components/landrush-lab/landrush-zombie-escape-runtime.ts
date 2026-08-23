import type { ZombieEscapeControlState } from './zombie-escape-controls'
import {
  advanceZombieEscapePhaseClock,
  resetZombieEscapeSimulation,
  stepZombieEscapeSimulationPhysics,
  type ZombieEscapeGamePhase,
  type ZombieEscapeGameStatus,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import type { ZombieEscapeArenaData } from './zombie-escape-world'

export type LandrushZombieEscapeRestartButtonState = {
  armed: boolean
  held: boolean
}

export type LandrushZombieEscapePhaseClock = {
  authorityNowSeconds: number | null
}

export type LandrushZombieEscapePhaseClockAdvance = {
  advancedSeconds: number
  phaseChanged: boolean
}

export function createLandrushZombieEscapePhaseClock(): LandrushZombieEscapePhaseClock {
  return { authorityNowSeconds: null }
}

export function advanceLandrushZombieEscapePhaseClock({
  authorityNowSeconds,
  clock,
  expectedPhase,
  phaseReady,
  simulation,
}: {
  authorityNowSeconds: number
  clock: LandrushZombieEscapePhaseClock
  expectedPhase: ZombieEscapeGamePhase
  phaseReady: boolean
  simulation: ZombieEscapeSimulation
}): LandrushZombieEscapePhaseClockAdvance {
  if (!Number.isFinite(authorityNowSeconds)) return { advancedSeconds: 0, phaseChanged: false }
  const previousAuthorityNowSeconds = clock.authorityNowSeconds
  if (previousAuthorityNowSeconds === null) {
    clock.authorityNowSeconds = authorityNowSeconds
    return { advancedSeconds: 0, phaseChanged: false }
  }
  if (authorityNowSeconds <= previousAuthorityNowSeconds) {
    if (authorityNowSeconds < previousAuthorityNowSeconds) {
      clock.authorityNowSeconds = authorityNowSeconds
    }
    return { advancedSeconds: 0, phaseChanged: false }
  }

  clock.authorityNowSeconds = authorityNowSeconds
  if (
    !canAdvanceLandrushZombieEscapeIntegratedSimulation({
      expectedPhase,
      phaseReady,
      simulation,
    }) ||
    simulation.paused ||
    simulation.status !== 'playing'
  ) {
    return { advancedSeconds: 0, phaseChanged: false }
  }

  const advancedSeconds = authorityNowSeconds - previousAuthorityNowSeconds
  return {
    advancedSeconds,
    phaseChanged: advanceZombieEscapePhaseClock(simulation, advancedSeconds),
  }
}

export function createLandrushZombieEscapeRestartButtonState(): LandrushZombieEscapeRestartButtonState {
  return { armed: false, held: false }
}

export function advanceLandrushZombieEscapeRestartButtonState(
  state: LandrushZombieEscapeRestartButtonState,
  held: boolean,
  status: ZombieEscapeGameStatus,
) {
  const wasHeld = state.held
  state.held = held

  if (status === 'playing') {
    state.armed = false
    return false
  }
  if (!held) {
    state.armed = true
    return false
  }
  if (!state.armed || wasHeld) return false

  state.armed = false
  return true
}

export function resolveLandrushZombieEscapeIntegratedLocomotionEnabled({
  baseMovementEnabled,
  status,
  zombieEscapeEnabled,
}: {
  baseMovementEnabled: boolean
  status: ZombieEscapeGameStatus
  zombieEscapeEnabled: boolean
}) {
  return baseMovementEnabled && (!zombieEscapeEnabled || status === 'playing')
}

export function canAdvanceLandrushZombieEscapeIntegratedSimulation({
  expectedPhase,
  phaseReady,
  simulation,
}: {
  expectedPhase: ZombieEscapeGamePhase
  phaseReady: boolean
  simulation: ZombieEscapeSimulation
}) {
  return phaseReady && simulation.phase === expectedPhase
}

export function stepLandrushZombieEscapeIntegratedSimulation({
  arena,
  deltaSeconds,
  expectedPhase,
  input,
  phaseReady,
  simulation,
}: {
  arena: ZombieEscapeArenaData
  deltaSeconds: number
  expectedPhase: ZombieEscapeGamePhase
  input: ZombieEscapeControlState
  phaseReady: boolean
  simulation: ZombieEscapeSimulation
}) {
  const phaseBeforeStep = simulation.phase
  if (
    !canAdvanceLandrushZombieEscapeIntegratedSimulation({
      expectedPhase,
      phaseReady,
      simulation,
    }) ||
    simulation.paused ||
    simulation.status !== 'playing'
  ) {
    return {
      phaseChanged: false,
      stepped: false,
      terminal: simulation.status !== 'playing',
    } as const
  }

  stepZombieEscapeSimulationPhysics(simulation, input, deltaSeconds, arena)
  return {
    phaseChanged: simulation.phase !== phaseBeforeStep,
    stepped: true,
    terminal: simulation.status !== 'playing',
  } as const
}

export function restartLandrushZombieEscapeIntegratedSimulation({
  arena,
  resetExternalPlayerMotion,
  simulation,
}: {
  arena: ZombieEscapeArenaData
  resetExternalPlayerMotion: () => void
  simulation: ZombieEscapeSimulation
}) {
  resetExternalPlayerMotion()
  resetZombieEscapeSimulation(simulation, arena)
}
