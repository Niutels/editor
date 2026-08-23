import type { ZombieEscapeGamePhase } from './zombie-escape-simulation'

export function shouldShowLandrushZombieEscapeMoney({
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
