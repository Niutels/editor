import type { ZombieEscapeInputMode } from './zombie-escape-config'

export type ZombieEscapeGamepadSample = {
  connected: boolean
  dpadDown: boolean
  dpadUp: boolean
  forward: number
  lookStrength: number
  lookX: number
  lookY: number
  rightTrigger: number
  run: boolean
  square: boolean
  strafe: number
  strength: number
  triangle: boolean
}

export type ZombieEscapeGamepadMeta = {
  menu: boolean
  view: boolean
}

export type ZombieEscapeRawControls = {
  fireMouse: boolean
  gamepad: ZombieEscapeGamepadSample | null
  gamepadMeta: ZombieEscapeGamepadMeta
  keys: ReadonlySet<string>
  pointerActive: boolean
  pointerAimStrength: number
  pointerAimX: number
  pointerAimZ: number
  viewForwardX: number
  viewForwardZ: number
}

export type ZombieEscapeControlLatch = {
  cameraHeld: boolean
  debugHeld: boolean
  inputMode: ZombieEscapeInputMode
  interactHeld: boolean
  pauseHeld: boolean
  qualityHeld: boolean
  resetHeld: boolean
}

export type ZombieEscapeControlState = {
  aimStrength: number
  aimX: number
  aimZ: number
  cameraPressed: boolean
  debugPressed: boolean
  fire: boolean
  inputMode: ZombieEscapeInputMode
  interactPressed: boolean
  moveStrength: number
  moveX: number
  moveZ: number
  pausePressed: boolean
  qualityPressed: boolean
  resetPressed: boolean
  run: boolean
}

export function createZombieEscapeControlLatch(): ZombieEscapeControlLatch {
  return {
    cameraHeld: false,
    debugHeld: false,
    inputMode: 'keyboard',
    interactHeld: false,
    pauseHeld: false,
    qualityHeld: false,
    resetHeld: false,
  }
}

export function createZombieEscapeControlState(): ZombieEscapeControlState {
  return {
    aimStrength: 0,
    aimX: 0,
    aimZ: -1,
    cameraPressed: false,
    debugPressed: false,
    fire: false,
    inputMode: 'keyboard',
    interactPressed: false,
    moveStrength: 0,
    moveX: 0,
    moveZ: 0,
    pausePressed: false,
    qualityPressed: false,
    resetPressed: false,
    run: false,
  }
}

export function isZombieEscapeGamepadFirePressed(
  gamepad: Pick<ZombieEscapeGamepadSample, 'rightTrigger'> | null,
) {
  return Boolean(gamepad && gamepad.rightTrigger >= 0.35)
}

export function resolveZombieEscapeControlsInto(
  raw: ZombieEscapeRawControls,
  latch: ZombieEscapeControlLatch,
  output: ZombieEscapeControlState,
) {
  const forwardLength = Math.hypot(raw.viewForwardX, raw.viewForwardZ)
  const forwardX = forwardLength > 0.000_001 ? raw.viewForwardX / forwardLength : 0
  const forwardZ = forwardLength > 0.000_001 ? raw.viewForwardZ / forwardLength : -1
  const rightX = -forwardZ
  const rightZ = forwardX
  const keyboardX =
    Number(raw.keys.has('KeyD') || raw.keys.has('ArrowRight')) -
    Number(raw.keys.has('KeyA') || raw.keys.has('ArrowLeft'))
  const keyboardForward =
    Number(raw.keys.has('KeyW') || raw.keys.has('ArrowUp')) -
    Number(raw.keys.has('KeyS') || raw.keys.has('ArrowDown'))
  const gamepad = raw.gamepad
  const screenX = keyboardX + (gamepad?.strafe ?? 0)
  const screenForward = keyboardForward + (gamepad?.forward ?? 0)
  const screenLength = Math.hypot(screenX, screenForward)
  const screenScale = screenLength > 1 ? 1 / screenLength : 1

  output.moveX = (rightX * screenX + forwardX * screenForward) * screenScale
  output.moveZ = (rightZ * screenX + forwardZ * screenForward) * screenScale
  output.moveStrength =
    keyboardX !== 0 || keyboardForward !== 0 ? 1 : Math.min(1, Math.max(0, gamepad?.strength ?? 0))

  if (gamepad && gamepad.lookStrength > 0) {
    const aimScreenX = gamepad.lookX
    const aimScreenForward = -gamepad.lookY
    const aimX = rightX * aimScreenX + forwardX * aimScreenForward
    const aimZ = rightZ * aimScreenX + forwardZ * aimScreenForward
    const aimLength = Math.hypot(aimX, aimZ)
    if (aimLength > 0.000_001) {
      output.aimX = aimX / aimLength
      output.aimZ = aimZ / aimLength
      output.aimStrength = Math.min(1, gamepad.lookStrength)
    }
  } else if (raw.pointerAimStrength > 0) {
    const aimLength = Math.hypot(raw.pointerAimX, raw.pointerAimZ)
    if (aimLength > 0.000_001) {
      output.aimX = raw.pointerAimX / aimLength
      output.aimZ = raw.pointerAimZ / aimLength
      output.aimStrength = Math.min(1, raw.pointerAimStrength)
    }
  } else {
    output.aimStrength = 0
  }

  output.fire = raw.fireMouse || raw.keys.has('Space') || isZombieEscapeGamepadFirePressed(gamepad)
  output.run = raw.keys.has('ShiftLeft') || raw.keys.has('ShiftRight') || Boolean(gamepad?.run)

  const pauseHeld = raw.keys.has('Escape') || raw.keys.has('KeyP') || raw.gamepadMeta.menu
  const resetHeld = raw.keys.has('KeyR') || Boolean(gamepad?.triangle)
  const debugHeld = raw.keys.has('F1') || raw.gamepadMeta.view
  const cameraHeld = raw.keys.has('KeyC') || Boolean(gamepad?.dpadUp)
  const qualityHeld = raw.keys.has('KeyQ') || Boolean(gamepad?.dpadDown)
  const interactHeld = raw.keys.has('KeyE') || Boolean(gamepad?.square)
  output.pausePressed = pauseHeld && !latch.pauseHeld
  output.resetPressed = resetHeld && !latch.resetHeld
  output.debugPressed = debugHeld && !latch.debugHeld
  output.cameraPressed = cameraHeld && !latch.cameraHeld
  output.qualityPressed = qualityHeld && !latch.qualityHeld
  output.interactPressed = output.interactPressed || (interactHeld && !latch.interactHeld)
  latch.pauseHeld = pauseHeld
  latch.resetHeld = resetHeld
  latch.debugHeld = debugHeld
  latch.cameraHeld = cameraHeld
  latch.qualityHeld = qualityHeld
  latch.interactHeld = interactHeld

  const gamepadActive = Boolean(
    gamepad &&
      (gamepad.strength > 0 ||
        gamepad.lookStrength > 0 ||
        gamepad.rightTrigger > 0 ||
        gamepad.run ||
        gamepad.square ||
        gamepad.triangle ||
        gamepad.dpadDown ||
        gamepad.dpadUp ||
        raw.gamepadMeta.menu ||
        raw.gamepadMeta.view),
  )
  const keyboardActive =
    raw.pointerActive ||
    raw.fireMouse ||
    keyboardX !== 0 ||
    keyboardForward !== 0 ||
    pauseHeld ||
    resetHeld ||
    debugHeld ||
    cameraHeld ||
    qualityHeld ||
    interactHeld
  if (gamepadActive) latch.inputMode = 'gamepad'
  else if (keyboardActive) latch.inputMode = 'keyboard'
  output.inputMode = latch.inputMode
}

export function readZombieEscapeGamepadMetaInto(output: ZombieEscapeGamepadMeta) {
  output.menu = false
  output.view = false
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return output
  for (const gamepad of navigator.getGamepads()) {
    if (!gamepad?.connected) continue
    output.menu = readGamepadButton(gamepad, 9)
    output.view = readGamepadButton(gamepad, 8)
    break
  }
  return output
}

function readGamepadButton(gamepad: Gamepad, index: number) {
  const button = gamepad.buttons[index]
  if (!button) return false
  return button.pressed || button.value >= 0.35
}
