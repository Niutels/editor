import type { MultiplayerPlayerCombatSnapshot } from '@landrush/protocol'

export const REMOTE_PRESENTATION_POSITION_EPSILON_SQ = 0.0004
export const REMOTE_PRESENTATION_HEADING_EPSILON_RADIANS = 0.001
export const REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS = 0.5
export const REMOTE_PRESENTATION_MOVEMENT_FRESH_MS = 1000
export const REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS = 120
export const REMOTE_PRESENTATION_MAX_EXTRAPOLATION_MS = 160

const REMOTE_PRESENTATION_MAX_SAMPLES = 12
const REMOTE_PRESENTATION_MIN_TELEPORT_METERS = 6
const REMOTE_PRESENTATION_TELEPORT_SPEED_FACTOR = 4
const REMOTE_PRESENTATION_FALLBACK_TRAVEL_SPEED = 7
const REMOTE_PRESENTATION_MAX_RETIMING_MS = 500

export type RemotePresentationSnapshot = {
  combat?: MultiplayerPlayerCombatSnapshot
  heading: number
  moving: boolean
  position: readonly [number, number, number]
  speed: number
  updatedAt: number
}

export type RemotePresentationTimelineSample<T extends RemotePresentationSnapshot> = {
  presentationTime: number
  snapshot: T
}

export type RemotePresentationTimeline<T extends RemotePresentationSnapshot> = {
  clockOffsetMs: number
  samples: readonly RemotePresentationTimelineSample<T>[]
}

export type RemotePresentationStore<T extends RemotePresentationSnapshot> = {
  getPresentationSnapshot: (id: string, now: number) => T | null
  getSnapshot: (id: string) => T | null
  getSnapshots: () => T[]
}

export type RemotePresentationReconciliation<T extends RemotePresentationSnapshot> = {
  accepted: boolean
  teleported: boolean
  timeline: RemotePresentationTimeline<T>
}

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

export function reconcileRemotePresentationTimeline<T extends RemotePresentationSnapshot>(
  current: RemotePresentationTimeline<T> | null,
  snapshot: T,
  serverTime: number,
  receivedAt: number,
): RemotePresentationReconciliation<T> {
  const observedClockOffset = receivedAt - serverTime
  const clockOffsetMs = current
    ? Math.min(current.clockOffsetMs, observedClockOffset)
    : observedClockOffset
  const previousSample = current?.samples.at(-1)

  if (previousSample && snapshot.updatedAt <= previousSample.snapshot.updatedAt) {
    return {
      accepted: false,
      teleported: false,
      timeline: { clockOffsetMs, samples: current?.samples ?? [] },
    }
  }

  if (!previousSample) {
    return {
      accepted: true,
      teleported: false,
      timeline: {
        clockOffsetMs,
        samples: [{ presentationTime: snapshot.updatedAt, snapshot }],
      },
    }
  }

  const sourceDeltaMs = snapshot.updatedAt - previousSample.snapshot.updatedAt
  const distance = distanceBetweenSnapshots(previousSample.snapshot, snapshot)
  const declaredSpeed = Math.max(previousSample.snapshot.speed, snapshot.speed, 0)
  const expectedDistance = (declaredSpeed * sourceDeltaMs) / 1000
  const teleportThreshold = Math.max(
    REMOTE_PRESENTATION_MIN_TELEPORT_METERS,
    expectedDistance * REMOTE_PRESENTATION_TELEPORT_SPEED_FACTOR + 1,
  )
  const teleported = distance > teleportThreshold

  if (teleported) {
    return {
      accepted: true,
      teleported: true,
      timeline: {
        clockOffsetMs,
        samples: [{ presentationTime: snapshot.updatedAt, snapshot }],
      },
    }
  }

  let interpolationStart = previousSample
  const reconciledSamples = [...(current?.samples ?? [])]
  const currentPresentationTime =
    receivedAt - clockOffsetMs - REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS
  if (
    current &&
    currentPresentationTime >
      previousSample.presentationTime + REMOTE_PRESENTATION_MAX_EXTRAPOLATION_MS
  ) {
    const presentedBeforeUpdate = resolveRemotePresentationSnapshot(current, receivedAt)
    if (presentedBeforeUpdate) {
      interpolationStart = {
        presentationTime: currentPresentationTime,
        snapshot: presentedBeforeUpdate,
      }
      reconciledSamples.push(interpolationStart)
    }
  }

  const travelSpeed =
    declaredSpeed > Number.EPSILON ? declaredSpeed : REMOTE_PRESENTATION_FALLBACK_TRAVEL_SPEED
  const remainingDistance = distanceBetweenSnapshots(interpolationStart.snapshot, snapshot)
  const minimumTravelMs = Math.min(
    REMOTE_PRESENTATION_MAX_RETIMING_MS,
    (remainingDistance / travelSpeed) * 1000,
  )
  const presentationTime = Math.max(
    snapshot.updatedAt,
    interpolationStart.presentationTime + minimumTravelMs,
  )
  const samples = [...reconciledSamples, { presentationTime, snapshot }].slice(
    -REMOTE_PRESENTATION_MAX_SAMPLES,
  )

  return {
    accepted: true,
    teleported: false,
    timeline: { clockOffsetMs, samples },
  }
}

export function resolveRemotePresentationSnapshot<T extends RemotePresentationSnapshot>(
  timeline: RemotePresentationTimeline<T> | null,
  now: number,
): T | null {
  const samples = timeline?.samples
  if (!timeline || !samples || samples.length === 0) return null
  if (samples.length === 1) return cloneSnapshot(samples[0]!.snapshot)

  const presentationTime = now - timeline.clockOffsetMs - REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS
  const firstSample = samples[0]!
  if (presentationTime <= firstSample.presentationTime) return cloneSnapshot(firstSample.snapshot)

  for (let index = 1; index < samples.length; index += 1) {
    const next = samples[index]!
    if (presentationTime > next.presentationTime) continue
    const previous = samples[index - 1]!
    const duration = Math.max(1, next.presentationTime - previous.presentationTime)
    return interpolateSnapshots(
      previous.snapshot,
      next.snapshot,
      clamp01((presentationTime - previous.presentationTime) / duration),
    )
  }

  const latest = samples.at(-1)!
  const previous = samples.at(-2)!
  if (!latest.snapshot.moving || latest.snapshot.speed <= 0) return cloneSnapshot(latest.snapshot)

  const sampleDurationMs = latest.presentationTime - previous.presentationTime
  if (sampleDurationMs <= 0) return cloneSnapshot(latest.snapshot)
  const extrapolationMs = Math.min(
    REMOTE_PRESENTATION_MAX_EXTRAPOLATION_MS,
    Math.max(0, presentationTime - latest.presentationTime),
  )
  if (extrapolationMs <= 0) return cloneSnapshot(latest.snapshot)

  const sampleSeconds = sampleDurationMs / 1000
  const extrapolationSeconds = extrapolationMs / 1000
  const velocity = [
    (latest.snapshot.position[0] - previous.snapshot.position[0]) / sampleSeconds,
    (latest.snapshot.position[1] - previous.snapshot.position[1]) / sampleSeconds,
    (latest.snapshot.position[2] - previous.snapshot.position[2]) / sampleSeconds,
  ] as const
  const velocityLength = Math.hypot(...velocity)
  const velocityScale =
    velocityLength > latest.snapshot.speed && velocityLength > 0
      ? latest.snapshot.speed / velocityLength
      : 1
  const headingDelta = signedAngleDistance(previous.snapshot.heading, latest.snapshot.heading)

  return {
    ...latest.snapshot,
    heading: latest.snapshot.heading + (headingDelta / sampleSeconds) * extrapolationSeconds,
    position: [
      latest.snapshot.position[0] + velocity[0] * velocityScale * extrapolationSeconds,
      latest.snapshot.position[1] + velocity[1] * velocityScale * extrapolationSeconds,
      latest.snapshot.position[2] + velocity[2] * velocityScale * extrapolationSeconds,
    ],
  }
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

function interpolateSnapshots<T extends RemotePresentationSnapshot>(
  first: T,
  second: T,
  amount: number,
) {
  const discreteSnapshot = amount <= 0 ? first : second
  return {
    ...discreteSnapshot,
    ...(discreteSnapshot.combat
      ? { combat: interpolateCombatSnapshots(first.combat, second.combat, amount) }
      : {}),
    heading: first.heading + signedAngleDistance(first.heading, second.heading) * amount,
    moving: first.moving || second.moving,
    position: [
      first.position[0] + (second.position[0] - first.position[0]) * amount,
      first.position[1] + (second.position[1] - first.position[1]) * amount,
      first.position[2] + (second.position[2] - first.position[2]) * amount,
    ],
    speed: first.speed + (second.speed - first.speed) * amount,
    updatedAt: first.updatedAt + (second.updatedAt - first.updatedAt) * amount,
  } as T
}

function interpolateCombatSnapshots(
  first: MultiplayerPlayerCombatSnapshot | undefined,
  second: MultiplayerPlayerCombatSnapshot | undefined,
  amount: number,
) {
  if (!first || !second || amount <= 0 || second.shotSequence < first.shotSequence) {
    return amount <= 0 ? first : second
  }
  const previousShots = new Map(first.shots.map((shot) => [shot.id, shot]))
  return {
    ...second,
    aimAngle: first.aimAngle + signedAngleDistance(first.aimAngle, second.aimAngle) * amount,
    meleeProgress:
      first.meleePhase === second.meleePhase
        ? first.meleeProgress + (second.meleeProgress - first.meleeProgress) * amount
        : second.meleeProgress,
    shots: second.shots.map((shot) => {
      const previous = previousShots.get(shot.id)
      if (!previous || previous.weaponIndex !== shot.weaponIndex) return shot
      return {
        ...shot,
        position: interpolatePoint(previous.position, shot.position, amount),
        previousPosition: interpolatePoint(
          previous.previousPosition,
          shot.previousPosition,
          amount,
        ),
      }
    }),
  }
}

function interpolatePoint(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    first[0] + (second[0] - first[0]) * amount,
    first[1] + (second[1] - first[1]) * amount,
    first[2] + (second[2] - first[2]) * amount,
  ]
}

function cloneSnapshot<T extends RemotePresentationSnapshot>(snapshot: T) {
  return { ...snapshot, position: [...snapshot.position] } as T
}

function distanceBetweenSnapshots(
  first: RemotePresentationSnapshot,
  second: RemotePresentationSnapshot,
) {
  return Math.hypot(
    second.position[0] - first.position[0],
    second.position[1] - first.position[1],
    second.position[2] - first.position[2],
  )
}

function signedAngleDistance(first: number, second: number) {
  return Math.atan2(Math.sin(second - first), Math.cos(second - first))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
