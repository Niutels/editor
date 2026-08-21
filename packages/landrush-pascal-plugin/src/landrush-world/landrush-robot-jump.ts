const ANTICIPATION_END = 0.18
const TAKEOFF_END = 0.3
const FLIGHT_END = 0.6
const TOUCHDOWN = 0.78
const LANDING_END = 0.86

export type LandrushRobotJumpPhase =
  | 'anticipation'
  | 'takeoff'
  | 'flight'
  | 'landing'
  | 'recovery'
  | 'complete'

export type LandrushRobotJumpContact = 'airborne' | 'landed' | 'preload'

export type LandrushRobotJumpPose = {
  armPitch: number
  bodyCompressionOffset: number
  contact: LandrushRobotJumpContact
  footPitch: number
  kneePitch: number
  phase: LandrushRobotJumpPhase
  progress: number
  rootAltitudeScale: number
  spinePitch: number
  upperLegPitch: number
}

export type LandrushRobotJumpPoseRef = {
  current: number | null
}

export function resolveLandrushRobotJumpPose(progress: number): LandrushRobotJumpPose {
  const clampedProgress = clamp01(progress)
  const rootAltitudeScale = resolveJumpAltitudeScale(clampedProgress)

  if (clampedProgress >= 1) {
    return createJumpPose('complete', clampedProgress, rootAltitudeScale, 0, 0, 0, 0, 0)
  }

  if (clampedProgress < ANTICIPATION_END) {
    const amount = smoothstep(clampedProgress / ANTICIPATION_END)
    return createJumpPose(
      'anticipation',
      clampedProgress,
      rootAltitudeScale,
      lerp(0, -0.45, amount),
      lerp(0, 0.9, amount),
      lerp(0, -0.38, amount),
      lerp(0, 0.16, amount),
      lerp(0, -0.25, amount),
    )
  }

  if (clampedProgress < TAKEOFF_END) {
    const amount = smoothstep(
      (clampedProgress - ANTICIPATION_END) / (TAKEOFF_END - ANTICIPATION_END),
    )
    return createJumpPose(
      'takeoff',
      clampedProgress,
      rootAltitudeScale,
      lerp(-0.45, -0.06, amount),
      lerp(0.9, 0.12, amount),
      lerp(-0.38, 0.08, amount),
      lerp(0.16, -0.06, amount),
      lerp(-0.25, 0.5, amount),
    )
  }

  if (clampedProgress < FLIGHT_END) {
    const amount = (clampedProgress - TAKEOFF_END) / (FLIGHT_END - TAKEOFF_END)
    const tuckAmount = Math.sin(Math.PI * amount)
    return createJumpPose(
      'flight',
      clampedProgress,
      rootAltitudeScale,
      -0.06 - tuckAmount * 0.16,
      0.12 + tuckAmount * 0.32,
      0.08 - tuckAmount * 0.12,
      -0.06 + tuckAmount * 0.1,
      lerp(0.5, 0.3, smoothstep(amount)),
    )
  }

  if (clampedProgress < TOUCHDOWN) {
    const amount = smoothstep((clampedProgress - FLIGHT_END) / (TOUCHDOWN - FLIGHT_END))
    return createJumpPose(
      'landing',
      clampedProgress,
      rootAltitudeScale,
      lerp(-0.06, -0.2, amount),
      lerp(0.12, 0.4, amount),
      lerp(0.08, -0.18, amount),
      lerp(-0.06, 0.08, amount),
      lerp(0.3, 0.08, amount),
    )
  }

  if (clampedProgress < LANDING_END) {
    const amount = smoothstep((clampedProgress - TOUCHDOWN) / (LANDING_END - TOUCHDOWN))
    return createJumpPose(
      'landing',
      clampedProgress,
      rootAltitudeScale,
      lerp(-0.2, -0.5, amount),
      lerp(0.4, 1, amount),
      lerp(-0.18, -0.45, amount),
      lerp(0.08, 0.18, amount),
      lerp(0.08, -0.28, amount),
    )
  }

  const amount = smoothstep((clampedProgress - LANDING_END) / (1 - LANDING_END))
  return createJumpPose(
    'recovery',
    clampedProgress,
    rootAltitudeScale,
    lerp(-0.5, 0, amount),
    lerp(1, 0, amount),
    lerp(-0.45, 0, amount),
    lerp(0.18, 0, amount),
    lerp(-0.28, 0, amount),
  )
}

export function resolveLandrushRobotJumpContact(progress: number): LandrushRobotJumpContact {
  const clampedProgress = clamp01(progress)
  if (clampedProgress < ANTICIPATION_END) return 'preload'
  if (clampedProgress < TOUCHDOWN) return 'airborne'
  return 'landed'
}

function resolveJumpAltitudeScale(progress: number) {
  if (progress <= ANTICIPATION_END || progress >= TOUCHDOWN) return 0
  const airborneProgress =
    (progress - ANTICIPATION_END) / Math.max(Number.EPSILON, TOUCHDOWN - ANTICIPATION_END)
  return Math.sin(Math.PI * smoothstep(airborneProgress))
}

function createJumpPose(
  phase: LandrushRobotJumpPhase,
  progress: number,
  rootAltitudeScale: number,
  upperLegPitch: number,
  kneePitch: number,
  footPitch: number,
  spinePitch: number,
  armPitch: number,
): LandrushRobotJumpPose {
  return {
    armPitch,
    bodyCompressionOffset: resolveBodyCompressionOffset(phase, kneePitch),
    contact: resolveLandrushRobotJumpContact(progress),
    footPitch,
    kneePitch,
    phase,
    progress,
    rootAltitudeScale,
    spinePitch,
    upperLegPitch,
  }
}

function resolveBodyCompressionOffset(phase: LandrushRobotJumpPhase, kneePitch: number) {
  if (phase === 'anticipation') return clamp01(kneePitch / 0.9) * 0.13
  if (phase === 'takeoff') return clamp01((kneePitch - 0.12) / 0.78) * 0.13
  if (phase === 'landing') return clamp01((kneePitch - 0.12) / 0.88) * 0.15
  if (phase === 'recovery') return clamp01(kneePitch) * 0.15
  return 0
}

function smoothstep(value: number) {
  const clamped = clamp01(value)
  return clamped * clamped * (3 - 2 * clamped)
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}
