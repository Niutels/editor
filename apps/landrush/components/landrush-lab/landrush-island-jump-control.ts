import { resolveLandrushRobotJumpContact } from '@landrush/pascal-plugin/landrush-world/robot'

export const LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS = 150

export type LandrushIslandJumpRequestSource = 'gamepad' | 'keyboard-space' | 'runtime-probe'

export type LandrushIslandJumpRequestState = {
  requestedAtMs: number
  source: LandrushIslandJumpRequestSource | null
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
  activeJumpProgress: number | null,
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
  if (
    falling ||
    (activeJumpProgress !== null &&
      resolveLandrushRobotJumpContact(activeJumpProgress) !== 'landed')
  ) {
    return null
  }

  resetLandrushIslandJumpRequestState(state)
  return source
}

export function resetLandrushIslandJumpRequestState(state: LandrushIslandJumpRequestState) {
  state.requestedAtMs = Number.NEGATIVE_INFINITY
  state.source = null
}
