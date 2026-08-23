export const LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS = 150

export type LandrushIslandJumpRequestSource = 'gamepad' | 'keyboard-space' | 'runtime-probe'

export type LandrushIslandJumpRequestState = {
  requestedAtMs: number
  source: LandrushIslandJumpRequestSource | null
}

export type LandrushIslandJumpButtonState = {
  armed: boolean
  held: boolean
}

export type LandrushIslandJumpPresentationState = {
  acceptedAtSimulationSeconds: number
  landedAtSimulationSeconds: number | null
  takeoffObserved: boolean
}

export function createLandrushIslandJumpButtonState(): LandrushIslandJumpButtonState {
  return { armed: true, held: false }
}

export function advanceLandrushIslandJumpButtonState(
  state: LandrushIslandJumpButtonState,
  pressed: boolean,
  commandsEnabled: boolean,
) {
  if (!commandsEnabled) {
    state.armed = false
    state.held = pressed
    return false
  }
  if (!pressed) {
    state.armed = true
    state.held = false
    return false
  }

  const requested = state.armed && !state.held
  state.held = pressed
  return requested
}

export function requestLandrushIslandKeyboardJumpFromKeyDown({
  buttonState,
  commandsEnabled,
  defaultPrevented,
  editableTarget,
  repeat,
}: {
  buttonState: LandrushIslandJumpButtonState
  commandsEnabled: boolean
  defaultPrevented: boolean
  editableTarget: boolean
  repeat: boolean
}) {
  const requested = advanceLandrushIslandJumpButtonState(
    buttonState,
    true,
    commandsEnabled && !defaultPrevented && !editableTarget,
  )
  return !repeat && requested
}

export function createLandrushIslandJumpPresentationState(
  acceptedAtSimulationSeconds: number,
): LandrushIslandJumpPresentationState {
  return {
    acceptedAtSimulationSeconds,
    landedAtSimulationSeconds: null,
    takeoffObserved: false,
  }
}

export function advanceLandrushIslandJumpPresentation({
  currentSimulationSeconds,
  durationSeconds,
  grounded,
  jumpsUsed,
  state,
  takeoffProgress,
  touchdownProgress,
}: {
  currentSimulationSeconds: number
  durationSeconds: number
  grounded: boolean
  jumpsUsed: number
  state: LandrushIslandJumpPresentationState
  takeoffProgress: number
  touchdownProgress: number
}) {
  const safeDurationSeconds = Math.max(Number.EPSILON, durationSeconds)
  const safeTakeoffProgress = Math.max(0, Math.min(1, takeoffProgress))
  const safeTouchdownProgress = Math.max(safeTakeoffProgress, Math.min(1, touchdownProgress))
  const simulationSeconds = Math.max(state.acceptedAtSimulationSeconds, currentSimulationSeconds)
  if (!state.takeoffObserved && (!grounded || jumpsUsed > 0)) {
    state.takeoffObserved = true
  }
  if (state.takeoffObserved && grounded && state.landedAtSimulationSeconds === null) {
    state.landedAtSimulationSeconds = simulationSeconds
  }
  if (!state.takeoffObserved) return safeTakeoffProgress
  if (state.landedAtSimulationSeconds === null) {
    return Math.min(
      safeTouchdownProgress,
      safeTakeoffProgress +
        (simulationSeconds - state.acceptedAtSimulationSeconds) / safeDurationSeconds,
    )
  }
  return Math.min(
    1,
    safeTouchdownProgress +
      (simulationSeconds - state.landedAtSimulationSeconds) / safeDurationSeconds,
  )
}

export function createLandrushIslandJumpRequestState(): LandrushIslandJumpRequestState {
  return { requestedAtMs: Number.NEGATIVE_INFINITY, source: null }
}

export function queueLandrushIslandJumpRequest(
  state: LandrushIslandJumpRequestState,
  source: LandrushIslandJumpRequestSource,
  nowMs: number,
) {
  state.requestedAtMs = nowMs
  state.source = source
}

export function consumeLandrushIslandJumpRequest(
  state: LandrushIslandJumpRequestState,
  canJump: boolean,
  falling: boolean,
  nowMs: number,
) {
  const source = state.source
  if (!source) return null

  const ageMs = Math.max(0, nowMs - state.requestedAtMs)
  if (!Number.isFinite(ageMs) || ageMs > LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS) {
    resetLandrushIslandJumpRequestState(state)
    return null
  }
  if (falling || !canJump) return null

  resetLandrushIslandJumpRequestState(state)
  return source
}

export function resetLandrushIslandJumpRequestState(state: LandrushIslandJumpRequestState) {
  state.requestedAtMs = Number.NEGATIVE_INFINITY
  state.source = null
}
