export const REMOTE_PRESENTATION_POSITION_EPSILON_SQ = 0.0004
export const REMOTE_PRESENTATION_HEADING_EPSILON_RADIANS = 0.001
export const REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS = 0.5
export const REMOTE_PRESENTATION_MOVEMENT_FRESH_MS = 1000

export type RemotePresentationActivity = {
  animationSettleSeconds: number
  headingErrorRadians: number
  moving: boolean
  positionErrorSq: number
}

export function frameIndependentResponseAmount(responsePerSecond: number, deltaSeconds: number) {
  return 1 - Math.exp(-Math.max(0, responsePerSecond) * Math.max(0, deltaSeconds))
}

export function shortestAngleDistance(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)))
}

export function shouldContinueRemotePresentation({
  animationSettleSeconds,
  headingErrorRadians,
  moving,
  positionErrorSq,
}: RemotePresentationActivity) {
  return (
    moving ||
    animationSettleSeconds > 0 ||
    positionErrorSq > REMOTE_PRESENTATION_POSITION_EPSILON_SQ ||
    headingErrorRadians > REMOTE_PRESENTATION_HEADING_EPSILON_RADIANS
  )
}

export function viewAnglesFromDirection({ x, y, z }: { x: number; y: number; z: number }) {
  const length = Math.hypot(x, y, z)
  if (length <= Number.EPSILON) return { pitch: 0, yaw: 0 }

  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, y / length))),
    yaw: Math.atan2(x, z),
  }
}
