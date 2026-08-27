export const LANDRUSH_ZOMBIE_ESCAPE_TOUCH_STICK_DEADZONE = 0.12
export const LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD = 0.72
export const LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD = 0.64

export type LandrushZombieEscapeTouchStick = 'aim' | 'move'
export type LandrushZombieEscapeTouchInputKind = LandrushZombieEscapeTouchStick | 'jump'

export type LandrushZombieEscapeTouchStickState = {
  displacement: number
  pointerId: number | null
  screenX: number
  screenY: number
  strength: number
}

export type LandrushZombieEscapeTouchInputState = {
  aim: LandrushZombieEscapeTouchStickState
  firing: boolean
  jumpRequested: boolean
  move: LandrushZombieEscapeTouchStickState
}

export type LandrushZombieEscapeTouchMoveInput = {
  forward: number
  strafe: number
  strength: number
}

export type LandrushZombieEscapeTouchAimDirection = {
  x: number
  z: number
}

export function createLandrushZombieEscapeTouchInputState(): LandrushZombieEscapeTouchInputState {
  return {
    aim: createTouchStickState(),
    firing: false,
    jumpRequested: false,
    move: createTouchStickState(),
  }
}

export function requestLandrushZombieEscapeTouchJump(state: LandrushZombieEscapeTouchInputState) {
  state.jumpRequested = true
}

export function clearLandrushZombieEscapeTouchJumpRequest(
  state: LandrushZombieEscapeTouchInputState,
) {
  state.jumpRequested = false
}

export function consumeLandrushZombieEscapeTouchJumpRequest(
  state: LandrushZombieEscapeTouchInputState,
) {
  if (!state.jumpRequested) return false
  clearLandrushZombieEscapeTouchJumpRequest(state)
  return true
}

export function beginLandrushZombieEscapeTouchStick(
  state: LandrushZombieEscapeTouchInputState,
  stick: LandrushZombieEscapeTouchStick,
  pointerId: number,
) {
  if (!Number.isFinite(pointerId)) return false
  const target = state[stick]
  if (target.pointerId === pointerId) return true
  if (target.pointerId !== null || state[otherStick(stick)].pointerId === pointerId) return false

  resetTouchStickState(target)
  target.pointerId = pointerId
  if (stick === 'aim') state.firing = false
  return true
}

export function updateLandrushZombieEscapeTouchStick(
  state: LandrushZombieEscapeTouchInputState,
  stick: LandrushZombieEscapeTouchStick,
  pointerId: number,
  offsetX: number,
  offsetY: number,
  radius: number,
) {
  const target = state[stick]
  if (target.pointerId !== pointerId) return false

  const sample = resolveTouchStickSample(offsetX, offsetY, radius)
  target.displacement = sample.displacement
  target.screenX = sample.screenX
  target.screenY = sample.screenY
  target.strength = sample.strength
  if (stick === 'aim') {
    state.firing = state.firing
      ? sample.displacement > LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD
      : sample.displacement >= LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD
  }
  return true
}

export function endLandrushZombieEscapeTouchStick(
  state: LandrushZombieEscapeTouchInputState,
  stick: LandrushZombieEscapeTouchStick,
  pointerId: number,
) {
  const target = state[stick]
  if (target.pointerId !== pointerId) return false

  resetTouchStickState(target)
  if (stick === 'aim') state.firing = false
  return true
}

export function resetLandrushZombieEscapeTouchInput(state: LandrushZombieEscapeTouchInputState) {
  resetTouchStickState(state.aim)
  resetTouchStickState(state.move)
  state.firing = false
  clearLandrushZombieEscapeTouchJumpRequest(state)
}

export function resolveLandrushZombieEscapeTouchMoveInput(
  state: LandrushZombieEscapeTouchInputState,
): LandrushZombieEscapeTouchMoveInput | null {
  if (state.move.pointerId === null || state.move.strength <= 0) return null
  return {
    forward: -state.move.screenY,
    strafe: state.move.screenX,
    strength: state.move.strength,
  }
}

export function resolveLandrushZombieEscapeOwnedTouchMoveInput(
  state: LandrushZombieEscapeTouchInputState,
): LandrushZombieEscapeTouchMoveInput | null | undefined {
  if (state.move.pointerId === null) return undefined
  return resolveLandrushZombieEscapeTouchMoveInput(state)
}

export function resolveLandrushZombieEscapeTouchAimDirection({
  cameraForwardX,
  cameraForwardZ,
  screenX,
  screenY,
}: {
  cameraForwardX: number
  cameraForwardZ: number
  screenX: number
  screenY: number
}): LandrushZombieEscapeTouchAimDirection | null {
  if (
    !Number.isFinite(cameraForwardX) ||
    !Number.isFinite(cameraForwardZ) ||
    !Number.isFinite(screenX) ||
    !Number.isFinite(screenY)
  ) {
    return null
  }
  const cameraLength = Math.hypot(cameraForwardX, cameraForwardZ)
  const screenLength = Math.hypot(screenX, screenY)
  if (cameraLength <= Number.EPSILON || screenLength <= Number.EPSILON) return null

  const forwardX = cameraForwardX / cameraLength
  const forwardZ = cameraForwardZ / cameraLength
  const rightX = -forwardZ
  const rightZ = forwardX
  const forwardAmount = -screenY / screenLength
  const rightAmount = screenX / screenLength
  const aimX = rightX * rightAmount + forwardX * forwardAmount
  const aimZ = rightZ * rightAmount + forwardZ * forwardAmount
  const aimLength = Math.hypot(aimX, aimZ)
  if (aimLength <= Number.EPSILON) return null
  return { x: aimX / aimLength, z: aimZ / aimLength }
}

function createTouchStickState(): LandrushZombieEscapeTouchStickState {
  return {
    displacement: 0,
    pointerId: null,
    screenX: 0,
    screenY: 0,
    strength: 0,
  }
}

function resetTouchStickState(state: LandrushZombieEscapeTouchStickState) {
  state.displacement = 0
  state.pointerId = null
  state.screenX = 0
  state.screenY = 0
  state.strength = 0
}

function resolveTouchStickSample(offsetX: number, offsetY: number, radius: number) {
  const safeOffsetX = Number.isFinite(offsetX) ? offsetX : 0
  const safeOffsetY = Number.isFinite(offsetY) ? offsetY : 0
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0
  const offsetLength = Math.hypot(safeOffsetX, safeOffsetY)
  if (safeRadius === 0 || offsetLength <= Number.EPSILON) {
    return { displacement: 0, screenX: 0, screenY: 0, strength: 0 }
  }

  const displacement = Math.min(1, offsetLength / safeRadius)
  if (displacement <= LANDRUSH_ZOMBIE_ESCAPE_TOUCH_STICK_DEADZONE) {
    return { displacement, screenX: 0, screenY: 0, strength: 0 }
  }

  const strength = Math.min(
    1,
    (displacement - LANDRUSH_ZOMBIE_ESCAPE_TOUCH_STICK_DEADZONE) /
      (1 - LANDRUSH_ZOMBIE_ESCAPE_TOUCH_STICK_DEADZONE),
  )
  const directionScale = strength / offsetLength
  return {
    displacement,
    screenX: safeOffsetX * directionScale,
    screenY: safeOffsetY * directionScale,
    strength,
  }
}

function otherStick(stick: LandrushZombieEscapeTouchStick): LandrushZombieEscapeTouchStick {
  return stick === 'aim' ? 'move' : 'aim'
}
