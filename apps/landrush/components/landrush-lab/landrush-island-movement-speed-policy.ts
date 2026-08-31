export type LandrushIslandMovementSpeedEnvelope = 'run' | 'walk'

export type LandrushIslandMovementSpeedPolicy = {
  controllerRun: boolean
  presentationRunRequested: boolean
  speedScale: number
}

export function resolveLandrushIslandMovementSpeedPolicy({
  crouching,
  intensity,
  maximumSpeedScale,
  requestedRun,
  speedEnvelope = 'walk',
}: {
  crouching: boolean
  intensity: number
  maximumSpeedScale: number
  requestedRun: boolean
  speedEnvelope?: LandrushIslandMovementSpeedEnvelope
}): LandrushIslandMovementSpeedPolicy {
  const presentationRunRequested = requestedRun && !crouching
  return {
    controllerRun: !crouching && (presentationRunRequested || speedEnvelope === 'run'),
    presentationRunRequested,
    speedScale: Math.min(1, Math.max(0, intensity)) * Math.min(1, Math.max(0, maximumSpeedScale)),
  }
}
