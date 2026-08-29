import {
  MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS,
  MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS,
  type MultiplayerZombieEscapeStateSnapshot,
} from '@landrush/protocol'
import { setZombieEscapeGamePhase, type ZombieEscapeSimulation } from './zombie-escape-simulation'

export type LandrushZombieEscapeClockMode = 'offline-local' | 'online-canonical' | 'online-waiting'

export type LandrushZombieEscapeRoomStateObservation = Readonly<{
  receivedAtMs: number
  serverTime: number
  state: MultiplayerZombieEscapeStateSnapshot
  transportGeneration: number
}>

export type LandrushZombieEscapeAppliedRoomState = Readonly<{
  revision: number
  sessionId: string
  transportGeneration: number
}>

export function projectLandrushZombieEscapePhaseSecondsRemaining({
  nowMs,
  observation,
}: {
  nowMs: number
  observation: LandrushZombieEscapeRoomStateObservation
}) {
  const durationMs =
    observation.state.phase === 'build'
      ? MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS
      : MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS
  if (observation.state.phaseEndsAt === null) return durationMs / 1000

  const elapsedSinceReceiptMs = Math.max(0, nowMs - observation.receivedAtMs)
  const projectedServerTime = observation.serverTime + elapsedSinceReceiptMs
  return (
    Math.max(0, Math.min(durationMs, observation.state.phaseEndsAt - projectedServerTime)) / 1000
  )
}

export function applyLandrushZombieEscapeRoomState({
  appliedState,
  force = false,
  nowMs,
  observation,
  simulation,
}: {
  appliedState: LandrushZombieEscapeAppliedRoomState | null
  force?: boolean
  nowMs: number
  observation: LandrushZombieEscapeRoomStateObservation
  simulation: ZombieEscapeSimulation
}) {
  const nextAppliedState = {
    revision: observation.state.revision,
    sessionId: observation.state.sessionId,
    transportGeneration: observation.transportGeneration,
  }
  const canonicalStateChanged =
    appliedState?.transportGeneration !== nextAppliedState.transportGeneration ||
    appliedState?.sessionId !== nextAppliedState.sessionId ||
    appliedState?.revision !== nextAppliedState.revision
  const previousPhase = simulation.phase
  const previousNight = simulation.night
  const semanticStateChanged =
    previousPhase !== observation.state.phase || previousNight !== observation.state.night
  let destructiveTransition = false

  if (semanticStateChanged && observation.state.phase === 'night') {
    simulation.night =
      simulation.phase === 'build'
        ? Math.max(0, observation.state.night - 1)
        : observation.state.night
    setZombieEscapeGamePhase(simulation, 'night')
    simulation.night = observation.state.night
    destructiveTransition = true
  } else if (semanticStateChanged && observation.state.phase === 'build') {
    if (simulation.phase !== 'build') {
      setZombieEscapeGamePhase(simulation, 'build')
      destructiveTransition = true
    }
    simulation.night = observation.state.night
  }

  simulation.phaseSecondsRemaining = projectLandrushZombieEscapePhaseSecondsRemaining({
    nowMs,
    observation,
  })

  return {
    appliedState: nextAppliedState,
    canonicalStateChanged,
    destructiveTransition,
    phaseChanged: previousPhase !== simulation.phase,
    reconciled: force || canonicalStateChanged || semanticStateChanged,
    semanticStateChanged,
  } as const
}
