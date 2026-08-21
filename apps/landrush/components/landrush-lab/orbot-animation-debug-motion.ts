export type OrbotAnimationDebugGait = 'auto' | 'idle' | 'run' | 'walk'

export type OrbotAnimationDebugBlendWeights = {
  idle: number
  run: number
  walk: number
}

export type OrbotAnimationDebugTrackSample = {
  heading: number
  lap: number
  position: readonly [number, number, number]
  progress: number
  tangent: readonly [number, number, number]
}

export const ORBOT_ANIMATION_DEBUG_TRACK_HALF_STRAIGHT = 5.2
export const ORBOT_ANIMATION_DEBUG_TRACK_RADIUS = 2.35
export const ORBOT_ANIMATION_DEBUG_TRACK_LENGTH =
  ORBOT_ANIMATION_DEBUG_TRACK_HALF_STRAIGHT * 4 + Math.PI * ORBOT_ANIMATION_DEBUG_TRACK_RADIUS * 2

const ORBOT_ANIMATION_DEBUG_RUN_BLEND_START_SPEED = 2.6
const ORBOT_ANIMATION_DEBUG_RUN_BLEND_FULL_SPEED = 4.8

export function resolveOrbotAnimationDebugBlendTargets(
  gait: OrbotAnimationDebugGait,
  speed: number,
): OrbotAnimationDebugBlendWeights {
  if (gait === 'idle') return { idle: 1, run: 0, walk: 0 }
  if (gait === 'walk') return { idle: 0, run: 0, walk: 1 }
  if (gait === 'run') return { idle: 0, run: 1, walk: 0 }

  const positiveSpeed = Math.max(0, speed)
  const moveWeight = clamp01(positiveSpeed / 2.4)
  const runProgress = smoothstep(
    clamp01(
      (positiveSpeed - ORBOT_ANIMATION_DEBUG_RUN_BLEND_START_SPEED) /
        (ORBOT_ANIMATION_DEBUG_RUN_BLEND_FULL_SPEED - ORBOT_ANIMATION_DEBUG_RUN_BLEND_START_SPEED),
    ),
  )
  const run = moveWeight * runProgress
  const walk = Math.max(0, moveWeight - run)
  return {
    idle: Math.max(0, 1 - walk - run),
    run,
    walk,
  }
}

export function advanceOrbotAnimationDebugBlend(
  current: OrbotAnimationDebugBlendWeights,
  target: OrbotAnimationDebugBlendWeights,
  response: number,
  deltaSeconds: number,
): OrbotAnimationDebugBlendWeights {
  const amount = 1 - Math.exp(-Math.max(0, response) * Math.max(0, deltaSeconds))
  return {
    idle: current.idle + (target.idle - current.idle) * amount,
    run: current.run + (target.run - current.run) * amount,
    walk: current.walk + (target.walk - current.walk) * amount,
  }
}

export function sampleOrbotAnimationDebugTrack(
  distanceMeters: number,
  seed: number,
): OrbotAnimationDebugTrackSample {
  const halfStraight = ORBOT_ANIMATION_DEBUG_TRACK_HALF_STRAIGHT
  const radius = ORBOT_ANIMATION_DEBUG_TRACK_RADIUS
  const straightLength = halfStraight * 2
  const arcLength = Math.PI * radius
  const nonNegativeDistance = Math.max(0, distanceMeters)
  const seedOffset = seededUnitInterval(seed) * ORBOT_ANIMATION_DEBUG_TRACK_LENGTH
  const distance = positiveModulo(
    nonNegativeDistance + seedOffset,
    ORBOT_ANIMATION_DEBUG_TRACK_LENGTH,
  )

  let x = 0
  let z = 0
  let tangentX = 0
  let tangentZ = 1

  if (distance < straightLength) {
    x = -halfStraight + distance
    z = -radius
    tangentX = 1
    tangentZ = 0
  } else if (distance < straightLength + arcLength) {
    const angle = -Math.PI / 2 + (distance - straightLength) / radius
    x = halfStraight + Math.cos(angle) * radius
    z = Math.sin(angle) * radius
    tangentX = -Math.sin(angle)
    tangentZ = Math.cos(angle)
  } else if (distance < straightLength * 2 + arcLength) {
    const segmentDistance = distance - straightLength - arcLength
    x = halfStraight - segmentDistance
    z = radius
    tangentX = -1
    tangentZ = 0
  } else {
    const angle = Math.PI / 2 + (distance - straightLength * 2 - arcLength) / radius
    x = -halfStraight + Math.cos(angle) * radius
    z = Math.sin(angle) * radius
    tangentX = -Math.sin(angle)
    tangentZ = Math.cos(angle)
  }

  return {
    heading: Math.atan2(tangentX, tangentZ),
    lap: Math.floor(nonNegativeDistance / ORBOT_ANIMATION_DEBUG_TRACK_LENGTH),
    position: [x, 0, z],
    progress:
      positiveModulo(nonNegativeDistance, ORBOT_ANIMATION_DEBUG_TRACK_LENGTH) /
      ORBOT_ANIMATION_DEBUG_TRACK_LENGTH,
    tangent: [tangentX, 0, tangentZ],
  }
}

export function seededOrbotAnimationDebugPhase(seed: number) {
  return seededUnitInterval(seed ^ 0x6d2b79f5) * Math.PI * 2
}

function seededUnitInterval(seed: number) {
  let value = Number.isFinite(seed) ? Math.trunc(seed) : 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  value ^= value >>> 15
  return (value >>> 0) / 4_294_967_296
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(value: number) {
  return value * value * (3 - value * 2)
}
