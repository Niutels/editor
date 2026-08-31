export type ZombieEscapeWeaponSwitchDirection = -1 | 0 | 1

export type ZombieEscapeWeaponSwitchInputState = {
  leftShoulderHeld: boolean
  rightShoulderHeld: boolean
  wheelDelta: number
  wheelDirection: ZombieEscapeWeaponSwitchDirection
  wheelSwitchedAtMs: number
}

const ZOMBIE_ESCAPE_WHEEL_SWITCH_THRESHOLD = 48
const ZOMBIE_ESCAPE_WHEEL_SWITCH_COOLDOWN_MS = 140

export function createZombieEscapeWeaponSwitchInputState(): ZombieEscapeWeaponSwitchInputState {
  return {
    leftShoulderHeld: false,
    rightShoulderHeld: false,
    wheelDelta: 0,
    wheelDirection: 0,
    wheelSwitchedAtMs: Number.NEGATIVE_INFINITY,
  }
}

export function resetZombieEscapeWeaponSwitchInput(state: ZombieEscapeWeaponSwitchInputState) {
  state.leftShoulderHeld = false
  state.rightShoulderHeld = false
  state.wheelDelta = 0
  state.wheelDirection = 0
  state.wheelSwitchedAtMs = Number.NEGATIVE_INFINITY
}

export function readZombieEscapeShoulderWeaponSwitch(
  state: ZombieEscapeWeaponSwitchInputState,
  leftShoulderPressed: boolean,
  rightShoulderPressed: boolean,
): ZombieEscapeWeaponSwitchDirection {
  const previousPressed = leftShoulderPressed && !state.leftShoulderHeld
  const nextPressed = rightShoulderPressed && !state.rightShoulderHeld
  state.leftShoulderHeld = leftShoulderPressed
  state.rightShoulderHeld = rightShoulderPressed
  if (previousPressed === nextPressed) return 0
  return previousPressed ? -1 : 1
}

export function readZombieEscapeWheelWeaponSwitch(
  state: ZombieEscapeWeaponSwitchInputState,
  deltaY: number,
  deltaMode: number,
  nowMs: number,
): ZombieEscapeWeaponSwitchDirection {
  if (!Number.isFinite(deltaY) || deltaY === 0 || !Number.isFinite(nowMs)) return 0
  const normalizedDelta = deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 120 : 1)
  const direction: ZombieEscapeWeaponSwitchDirection = normalizedDelta < 0 ? -1 : 1
  if (state.wheelDirection !== direction) {
    state.wheelDelta = 0
    state.wheelDirection = direction
  }
  state.wheelDelta += normalizedDelta
  if (Math.abs(state.wheelDelta) < ZOMBIE_ESCAPE_WHEEL_SWITCH_THRESHOLD) return 0
  state.wheelDelta = 0
  if (nowMs - state.wheelSwitchedAtMs < ZOMBIE_ESCAPE_WHEEL_SWITCH_COOLDOWN_MS) return 0
  state.wheelSwitchedAtMs = nowMs
  return direction
}
