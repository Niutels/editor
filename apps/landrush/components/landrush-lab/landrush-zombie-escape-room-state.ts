import {
  MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS,
  type MultiplayerZombieEscapeStateSnapshot,
} from '@landrush/protocol'
import {
  resolveZombieEscapeNightGenericZombieTarget,
  setZombieEscapeGamePhase,
  type ZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'

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
  if (observation.state.phase !== 'night' || observation.state.phaseEndsAt === null) return 0

  const elapsedSinceReceiptMs = Math.max(0, nowMs - observation.receivedAtMs)
  const projectedServerTime = observation.serverTime + elapsedSinceReceiptMs
  return (
    Math.max(
      0,
      Math.min(
        MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS,
        observation.state.phaseEndsAt - projectedServerTime,
      ),
    ) / 1000
  )
}

export function projectLandrushZombieEscapePhaseElapsedSeconds(
  nowMs: number,
  observation: LandrushZombieEscapeRoomStateObservation,
) {
  if (observation.state.phase !== 'night' || observation.state.phaseEndsAt === null) return null

  const elapsedSinceReceiptMs = Math.max(0, nowMs - observation.receivedAtMs)
  const projectedServerTime = observation.serverTime + elapsedSinceReceiptMs
  const elapsedMs =
    MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS -
    (observation.state.phaseEndsAt - projectedServerTime)
  return Math.max(0, Math.min(MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS, elapsedMs)) / 1000
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
    if (simulation.phase !== 'build') setZombieEscapeGamePhase(simulation, 'build')
    simulation.night = Math.max(0, observation.state.night - 1)
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
  if (destructiveTransition && simulation.phase === 'night') {
    simulation.waveSpawnRemaining = resolveZombieEscapeNightGenericZombieTarget(
      simulation.phaseSecondsRemaining,
      simulation.zombies.pool.capacity,
      simulation.priorNightKills,
    )
  }

  return {
    appliedState: nextAppliedState,
    canonicalStateChanged,
    destructiveTransition,
    phaseChanged: previousPhase !== simulation.phase,
    reconciled: force || canonicalStateChanged || semanticStateChanged,
    semanticStateChanged,
  } as const
}
