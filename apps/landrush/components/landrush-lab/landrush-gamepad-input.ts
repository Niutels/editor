export type LandrushGamepadInput = {
  circle: boolean
  connected: boolean
  cross: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  dpadUp: boolean
  forward: number
  leftShoulder: boolean
  leftTrigger: number
  lookStrength: number
  lookX: number
  lookY: number
  rightShoulder: boolean
  rightTrigger: number
  run: boolean
  square: boolean
  strafe: number
  strength: number
  triangle: boolean
}

export type LandrushGamepadSnapshot = {
  axes: ArrayLike<number>
  buttons: ArrayLike<
    | {
        pressed: boolean
        value: number
      }
    | undefined
  >
}

const GAMEPAD_STICK_DEADZONE = 0.18
const GAMEPAD_BUTTON_THRESHOLD = 0.35

let cachedLandrushGamepadInput: LandrushGamepadInput | null | undefined
let landrushGamepadInputCacheClearQueued = false

export function readLandrushGamepadInput(): LandrushGamepadInput | null {
  if (cachedLandrushGamepadInput !== undefined) {
    return cachedLandrushGamepadInput
  }

  cachedLandrushGamepadInput = readCurrentLandrushGamepadInput()
  if (!landrushGamepadInputCacheClearQueued) {
    landrushGamepadInputCacheClearQueued = true
    queueMicrotask(() => {
      cachedLandrushGamepadInput = undefined
      landrushGamepadInputCacheClearQueued = false
    })
  }
  return cachedLandrushGamepadInput
}

function readCurrentLandrushGamepadInput(): LandrushGamepadInput | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null

  for (const gamepad of navigator.getGamepads()) {
    if (!gamepad?.connected) continue
    return resolveLandrushGamepadInput(gamepad)
  }

  return null
}

export function resolveLandrushGamepadInput(
  gamepad: LandrushGamepadSnapshot,
): LandrushGamepadInput {
  const movement = resolveGamepadStick(readGamepadAxis(gamepad, 0), -readGamepadAxis(gamepad, 1))
  const look = resolveGamepadStick(readGamepadAxis(gamepad, 2), readGamepadAxis(gamepad, 3))

  return {
    circle: gamepadButtonPressed(gamepad, 1),
    connected: true,
    cross: gamepadButtonPressed(gamepad, 0),
    dpadDown: gamepadButtonPressed(gamepad, 13),
    dpadLeft: gamepadButtonPressed(gamepad, 14),
    dpadRight: gamepadButtonPressed(gamepad, 15),
    dpadUp: gamepadButtonPressed(gamepad, 12),
    forward: movement.y,
    leftShoulder: gamepadButtonPressed(gamepad, 4),
    leftTrigger: gamepadButtonValue(gamepad, 6),
    lookStrength: look.strength,
    lookX: look.x,
    lookY: look.y,
    rightShoulder: gamepadButtonPressed(gamepad, 5),
    rightTrigger: gamepadButtonValue(gamepad, 7),
    run: gamepadButtonPressed(gamepad, 10),
    square: gamepadButtonPressed(gamepad, 2),
    strafe: movement.x,
    strength: movement.strength,
    triangle: gamepadButtonPressed(gamepad, 3),
  }
}

function readGamepadAxis(gamepad: LandrushGamepadSnapshot, index: number) {
  const value = gamepad.axes[index]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
}

function gamepadButtonPressed(gamepad: LandrushGamepadSnapshot, index: number) {
  return gamepadButtonValue(gamepad, index) >= GAMEPAD_BUTTON_THRESHOLD
}

function gamepadButtonValue(gamepad: LandrushGamepadSnapshot, index: number) {
  const button = gamepad.buttons[index]
  if (!button) return 0
  if (button.pressed) return 1
  return typeof button.value === 'number' && Number.isFinite(button.value)
    ? Math.max(0, Math.min(1, button.value))
    : 0
}

function resolveGamepadStick(x: number, y: number) {
  const rawStrength = Math.hypot(x, y)
  if (rawStrength <= GAMEPAD_STICK_DEADZONE) return { strength: 0, x: 0, y: 0 }

  const strength = Math.min(
    1,
    (rawStrength - GAMEPAD_STICK_DEADZONE) / (1 - GAMEPAD_STICK_DEADZONE),
  )
  const scale = strength / rawStrength
  return {
    strength,
    x: x * scale,
    y: y * scale,
  }
}
