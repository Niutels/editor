import { ZOMBIE_ESCAPE_MELEE } from './zombie-escape-config'

export type ZombieEscapeMeleePhase = 'active' | 'idle' | 'recovery' | 'windup'

export type ZombieEscapeMeleePresentationPose = {
  forwardOffset: number
  liftOffset: number
  roll: number
  yawOffset: number
}

export const ZOMBIE_ESCAPE_MELEE_HIT_ACTIVE_PROGRESS = 0.5

export function resolveZombieEscapeMeleePhaseProgress(
  phase: ZombieEscapeMeleePhase,
  phaseSeconds: number,
) {
  const duration =
    phase === 'windup'
      ? ZOMBIE_ESCAPE_MELEE.windupSeconds
      : phase === 'active'
        ? ZOMBIE_ESCAPE_MELEE.activeSeconds
        : phase === 'recovery'
          ? ZOMBIE_ESCAPE_MELEE.recoverySeconds
          : 0
  return duration <= 0 ? 0 : clamp01(phaseSeconds / duration)
}

export function resolveZombieEscapeMeleePresentationPose(
  phase: ZombieEscapeMeleePhase,
  progress: number,
  output: ZombieEscapeMeleePresentationPose = createZombieEscapeMeleePresentationPose(),
) {
  const amount = smoothstep(clamp01(progress))
  if (phase === 'windup') {
    output.forwardOffset = -0.08 * amount
    output.liftOffset = 0.08 * amount
    output.roll = -0.18 * amount
    output.yawOffset = -0.65 * amount
    return output
  }
  if (phase === 'active') {
    output.forwardOffset = 0.05 * Math.sin(amount * Math.PI)
    output.liftOffset = 0.08 - 0.05 * amount
    output.roll = -0.18 + 0.36 * amount
    output.yawOffset = -0.65 + 1.3 * amount
    return output
  }
  if (phase === 'recovery') {
    const remaining = 1 - amount
    output.forwardOffset = 0.04 * remaining
    output.liftOffset = 0.03 * remaining
    output.roll = 0.18 * remaining
    output.yawOffset = 0.65 * remaining
    return output
  }
  output.forwardOffset = 0
  output.liftOffset = 0
  output.roll = 0
  output.yawOffset = 0
  return output
}

export function createZombieEscapeMeleePresentationPose(): ZombieEscapeMeleePresentationPose {
  return { forwardOffset: 0, liftOffset: 0, roll: 0, yawOffset: 0 }
}

export function dampZombieEscapeAngle(
  current: number,
  target: number,
  response: number,
  deltaSeconds: number,
) {
  const delta = wrapAngle(target - current)
  return wrapAngle(
    current + delta * (1 - Math.exp(-Math.max(0, response) * Math.max(0, deltaSeconds))),
  )
}

export function resolveZombieEscapeTorsoAimOffset(
  aimAngle: number,
  locomotionHeading: number,
  maximumOffsetRadians = Math.PI * 0.62,
) {
  const limit = Math.max(0, maximumOffsetRadians)
  return Math.max(-limit, Math.min(limit, wrapAngle(aimAngle - locomotionHeading)))
}

export function wrapZombieEscapeAngle(angle: number) {
  return wrapAngle(angle)
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
