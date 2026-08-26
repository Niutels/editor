export const BVH_ECCTRL_FIXED_STEP_SECONDS = 1 / 60
export const BVH_ECCTRL_MAX_FIXED_STEPS = 8
export const BVH_ECCTRL_MAX_BACKLOG_SECONDS = 0.25

export type BVHEcctrlLocomotionState = {
  airJumpsUsed: number
  grounded: boolean
  jumpQueued: boolean
  jumpsUsed: number
  supportEstablished: boolean
}

export type BVHEcctrlJumpImpulse = {
  kind: 'air' | 'ground'
  velocity: number
}

export function resolveBVHEcctrlCapsuleCenterFromFoot({
  capsuleLength,
  capsuleRadius,
  floatHeight,
}: {
  capsuleLength: number
  capsuleRadius: number
  floatHeight: number
}) {
  return Math.max(0, capsuleLength) / 2 + Math.max(0, capsuleRadius) + Math.max(0, floatHeight)
}

export function resolveBVHEcctrlCapsuleTotalClearance({
  capsuleLength,
  capsuleRadius,
  floatHeight,
}: {
  capsuleLength: number
  capsuleRadius: number
  floatHeight: number
}) {
  return Math.max(0, capsuleLength) + Math.max(0, capsuleRadius) * 2 + Math.max(0, floatHeight)
}

export function resolveBVHEcctrlStanceShape({
  capsuleLength,
  capsuleRadius,
  floatHeight,
  totalClearance,
}: {
  capsuleLength: number
  capsuleRadius: number
  floatHeight: number
  totalClearance: number
}) {
  const standingCapsuleLength = Math.max(0, capsuleLength)
  const standingFloatHeight = Math.max(0, floatHeight)
  const capsuleCapsClearance = Math.max(0, capsuleRadius) * 2
  const standingTotalClearance = standingCapsuleLength + capsuleCapsClearance + standingFloatHeight
  const resolvedTotalClearance = Math.max(
    capsuleCapsClearance,
    Math.min(standingTotalClearance, Math.max(0, totalClearance)),
  )
  const clearanceAboveCaps = resolvedTotalClearance - capsuleCapsClearance
  const resolvedFloatHeight = Math.min(standingFloatHeight, clearanceAboveCaps)

  return {
    capsuleLength: Math.min(
      standingCapsuleLength,
      Math.max(0, clearanceAboveCaps - resolvedFloatHeight),
    ),
    floatHeight: resolvedFloatHeight,
  }
}

export function resolveBVHEcctrlCrouchingState({
  crouching,
  crouchRequested,
  standingClear,
}: {
  crouching: boolean
  crouchRequested: boolean
  standingClear: boolean
}) {
  return crouchRequested || (crouching && !standingClear)
}

export function createBVHEcctrlLocomotionState(): BVHEcctrlLocomotionState {
  return {
    airJumpsUsed: 0,
    grounded: false,
    jumpQueued: false,
    jumpsUsed: 0,
    supportEstablished: false,
  }
}

export function canRequestBVHEcctrlJump(state: BVHEcctrlLocomotionState, maxAirJumps: number) {
  return (
    !state.jumpQueued &&
    (state.grounded ||
      (state.supportEstablished && state.airJumpsUsed < Math.max(0, Math.floor(maxAirJumps))))
  )
}

export function requestBVHEcctrlJump(state: BVHEcctrlLocomotionState, maxAirJumps: number) {
  if (state.jumpQueued || !canRequestBVHEcctrlJump(state, maxAirJumps)) return false
  state.jumpQueued = true
  return true
}

export function consumeBVHEcctrlJump({
  airJumpVelocityMultiplier,
  jumpVelocity,
  maxAirJumps,
  state,
}: {
  airJumpVelocityMultiplier: number
  jumpVelocity: number
  maxAirJumps: number
  state: BVHEcctrlLocomotionState
}): BVHEcctrlJumpImpulse | null {
  if (!state.jumpQueued) return null
  state.jumpQueued = false

  if (state.grounded) {
    state.grounded = false
    state.jumpsUsed = 1
    return { kind: 'ground', velocity: Math.max(0, jumpVelocity) }
  }

  const airJumpLimit = Math.max(0, Math.floor(maxAirJumps))
  if (!state.supportEstablished || state.airJumpsUsed >= airJumpLimit) return null
  state.airJumpsUsed += 1
  state.jumpsUsed += 1
  return {
    kind: 'air',
    velocity: Math.max(0, jumpVelocity) * Math.max(0, airJumpVelocityMultiplier),
  }
}

export function setBVHEcctrlGrounded(state: BVHEcctrlLocomotionState, grounded: boolean) {
  state.grounded = grounded
  if (!grounded) return
  state.supportEstablished = true
  state.airJumpsUsed = 0
  state.jumpsUsed = 0
}

export function resolveBVHEcctrlFixedSteps({
  accumulatedSeconds,
  elapsedSeconds,
  maxBacklogSeconds = BVH_ECCTRL_MAX_BACKLOG_SECONDS,
  maxSteps = BVH_ECCTRL_MAX_FIXED_STEPS,
  stepSeconds = BVH_ECCTRL_FIXED_STEP_SECONDS,
}: {
  accumulatedSeconds: number
  elapsedSeconds: number
  maxBacklogSeconds?: number
  maxSteps?: number
  stepSeconds?: number
}) {
  const safeStepSeconds = Math.max(Number.EPSILON, stepSeconds)
  const safeMaxSteps = Math.max(1, Math.floor(maxSteps))
  const totalSeconds = Math.max(0, accumulatedSeconds) + Math.max(0, elapsedSeconds)
  const availableSeconds = Math.min(totalSeconds, Math.max(safeStepSeconds, maxBacklogSeconds))
  const steps = Math.min(
    safeMaxSteps,
    Math.floor((availableSeconds + Number.EPSILON) / safeStepSeconds),
  )
  return {
    droppedSeconds: Math.max(0, totalSeconds - availableSeconds),
    remainderSeconds: Math.max(0, availableSeconds - steps * safeStepSeconds),
    steps,
  }
}

export function resolveBVHEcctrlPresentationAlpha(
  remainderSeconds: number,
  stepSeconds = BVH_ECCTRL_FIXED_STEP_SECONDS,
) {
  const safeStepSeconds = Math.max(Number.EPSILON, stepSeconds)
  return Math.max(0, Math.min(1, Math.max(0, remainderSeconds) / safeStepSeconds))
}

export function advanceBVHEcctrlBallisticStep({
  acceleration,
  deltaSeconds,
  position,
  velocity,
}: {
  acceleration: number
  deltaSeconds: number
  position: number
  velocity: number
}) {
  const safeDelta = Math.max(0, deltaSeconds)
  return {
    position: position + velocity * safeDelta + acceleration * safeDelta * safeDelta * 0.5,
    velocity: velocity + acceleration * safeDelta,
  }
}
