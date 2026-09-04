import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'

export type ZombieEscapeAttackDirection = {
  x: number
  y: number
  z: number
}

export type ZombieEscapeAttackSwingPose = {
  leftForearmDirection: ZombieEscapeAttackDirection
  leftUpperArmDirection: ZombieEscapeAttackDirection
  rightForearmDirection: ZombieEscapeAttackDirection
  rightUpperArmDirection: ZombieEscapeAttackDirection
}

export const ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS =
  ZOMBIE_ESCAPE_SIMULATION.zombieDeathCollapseSeconds

const ATTACK_SWING_KEYFRAMES = [
  {
    leftForearmDirection: { x: -0.55, y: -0.42, z: 0.72 },
    leftUpperArmDirection: { x: 0.48, y: -0.72, z: 0.5 },
    phase: 0,
    rightForearmDirection: { x: 0.55, y: -0.4, z: 0.73 },
    rightUpperArmDirection: { x: -0.48, y: -0.7, z: 0.53 },
  },
  {
    leftForearmDirection: { x: -0.55, y: -0.42, z: 0.72 },
    leftUpperArmDirection: { x: 0.48, y: -0.72, z: 0.5 },
    phase: 0.18,
    rightForearmDirection: { x: 0.25, y: 0.72, z: -0.65 },
    rightUpperArmDirection: { x: -0.1, y: 0.78, z: -0.62 },
  },
  {
    leftForearmDirection: { x: -0.55, y: -0.42, z: 0.72 },
    leftUpperArmDirection: { x: 0.48, y: -0.72, z: 0.5 },
    phase: ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase,
    rightForearmDirection: { x: 0.34, y: -0.65, z: 0.68 },
    rightUpperArmDirection: { x: 0.08, y: -0.67, z: 0.74 },
  },
  {
    leftForearmDirection: { x: -0.55, y: -0.42, z: 0.72 },
    leftUpperArmDirection: { x: 0.48, y: -0.72, z: 0.5 },
    phase: 0.72,
    rightForearmDirection: { x: 0.45, y: -0.83, z: 0.33 },
    rightUpperArmDirection: { x: 0.38, y: -0.85, z: 0.37 },
  },
  {
    leftForearmDirection: { x: -0.55, y: -0.42, z: 0.72 },
    leftUpperArmDirection: { x: 0.48, y: -0.72, z: 0.5 },
    phase: 1,
    rightForearmDirection: { x: 0.55, y: -0.4, z: 0.73 },
    rightUpperArmDirection: { x: -0.48, y: -0.7, z: 0.53 },
  },
] as const

export function createZombieEscapeAttackSwingPose(): ZombieEscapeAttackSwingPose {
  return {
    leftForearmDirection: { x: 0, y: 0, z: 0 },
    leftUpperArmDirection: { x: 0, y: 0, z: 0 },
    rightForearmDirection: { x: 0, y: 0, z: 0 },
    rightUpperArmDirection: { x: 0, y: 0, z: 0 },
  }
}

export function resolveZombieEscapeAttackSwingPose(
  normalizedPhase: number,
  output: ZombieEscapeAttackSwingPose = createZombieEscapeAttackSwingPose(),
) {
  const phase = clamp01(normalizedPhase)
  let nextIndex = 1
  while (
    nextIndex < ATTACK_SWING_KEYFRAMES.length - 1 &&
    phase > ATTACK_SWING_KEYFRAMES[nextIndex]!.phase
  ) {
    nextIndex += 1
  }
  const previous = ATTACK_SWING_KEYFRAMES[nextIndex - 1]!
  const next = ATTACK_SWING_KEYFRAMES[nextIndex]!
  const amount = smoothstep(
    (phase - previous.phase) / Math.max(0.000_001, next.phase - previous.phase),
  )
  interpolateDirection(
    previous.leftForearmDirection,
    next.leftForearmDirection,
    amount,
    output.leftForearmDirection,
  )
  interpolateDirection(
    previous.leftUpperArmDirection,
    next.leftUpperArmDirection,
    amount,
    output.leftUpperArmDirection,
  )
  interpolateDirection(
    previous.rightForearmDirection,
    next.rightForearmDirection,
    amount,
    output.rightForearmDirection,
  )
  interpolateDirection(
    previous.rightUpperArmDirection,
    next.rightUpperArmDirection,
    amount,
    output.rightUpperArmDirection,
  )
  return output
}

function interpolateDirection(
  previous: ZombieEscapeAttackDirection,
  next: ZombieEscapeAttackDirection,
  amount: number,
  output: ZombieEscapeAttackDirection,
) {
  output.x = previous.x + (next.x - previous.x) * amount
  output.y = previous.y + (next.y - previous.y) * amount
  output.z = previous.z + (next.z - previous.z) * amount
  const inverseLength = 1 / Math.max(0.000_001, Math.hypot(output.x, output.y, output.z))
  output.x *= inverseLength
  output.y *= inverseLength
  output.z *= inverseLength
}

export function resolveZombieEscapeDeathNormalizedPhase(deathPresentationSeconds: number) {
  const remaining = Number.isFinite(deathPresentationSeconds)
    ? Math.min(
        ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds,
        Math.max(0, deathPresentationSeconds),
      )
    : ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds
  const elapsed = ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds - remaining
  return clamp01(elapsed / ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS)
}

export function resolveZombieEscapeDeathFallRadians(normalizedPhase: number) {
  return smoothstep(clamp01(normalizedPhase)) * (Math.PI * 0.5 - 0.055)
}

export function resolveZombieEscapeDeathFallbackAngle(deterministicOrdinal: number) {
  const ordinal = Number.isFinite(deterministicOrdinal) ? Math.trunc(deterministicOrdinal) : 0
  const hash = Math.imul((ordinal >>> 0) ^ 0x68bc_21eb, 0x9e37_79b1) >>> 0
  return (hash / 0x1_0000_0000) * Math.PI * 2
}

function smoothstep(value: number) {
  const clamped = clamp01(value)
  return clamped * clamped * (3 - 2 * clamped)
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}
