import type { ZombieEscapeGamePhase } from './zombie-escape-simulation'

export function shouldShowLandrushZombieEscapeMoney({
  actualPhase,
  expectedPhase,
  phaseReady: _phaseReady,
}: {
  actualPhase: ZombieEscapeGamePhase
  expectedPhase: ZombieEscapeGamePhase
  phaseReady: boolean
}) {
  return actualPhase === expectedPhase
}

export function shouldShowLandrushZombieEscapeNightInteractionHud({
  actualPhase,
  expectedPhase,
  phaseReady,
}: {
  actualPhase: ZombieEscapeGamePhase
  expectedPhase: ZombieEscapeGamePhase
  phaseReady: boolean
}) {
  return phaseReady && expectedPhase === 'night' && actualPhase === 'night'
}

export function shouldShowLandrushZombieEscapeTouchControls({
  actualPhase,
  expectedPhase,
  phaseReady,
  terminal,
}: {
  actualPhase: ZombieEscapeGamePhase
  expectedPhase: ZombieEscapeGamePhase
  phaseReady: boolean
  terminal: boolean
}) {
  return phaseReady && !terminal && expectedPhase === 'night' && actualPhase === 'night'
}
