import { describe, expect, test } from 'bun:test'
import {
  beginLandrushZombieEscapeTouchStick,
  clearLandrushZombieEscapeTouchJumpRequest,
  consumeLandrushZombieEscapeTouchJumpRequest,
  createLandrushZombieEscapeTouchInputState,
  endLandrushZombieEscapeTouchStick,
  LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD,
  LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD,
  LANDRUSH_ZOMBIE_ESCAPE_TOUCH_STICK_DEADZONE,
  requestLandrushZombieEscapeTouchJump,
  resetLandrushZombieEscapeTouchInput,
  resolveLandrushZombieEscapeOwnedTouchMoveInput,
  resolveLandrushZombieEscapeTouchAimDirection,
  resolveLandrushZombieEscapeTouchMoveInput,
  updateLandrushZombieEscapeTouchStick,
} from './landrush-zombie-escape-touch-input'

describe('Landrush Zombie Escape touch input', () => {
  test('applies the radial deadzone, remaps analog strength, and clamps to the pad radius', () => {
    const state = createLandrushZombieEscapeTouchInputState()
    expect(resolveLandrushZombieEscapeOwnedTouchMoveInput(state)).toBeUndefined()
    expect(beginLandrushZombieEscapeTouchStick(state, 'move', 11)).toBe(true)
    expect(resolveLandrushZombieEscapeOwnedTouchMoveInput(state)).toBeNull()

    updateLandrushZombieEscapeTouchStick(
      state,
      'move',
      11,
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_STICK_DEADZONE * 100,
      0,
      100,
    )
    expect(state.move.displacement).toBeCloseTo(0.12)
    expect(state.move.strength).toBe(0)
    expect(resolveLandrushZombieEscapeTouchMoveInput(state)).toBeNull()

    updateLandrushZombieEscapeTouchStick(state, 'move', 11, 56, 0, 100)
    expect(state.move.strength).toBeCloseTo(0.5)
    const halfwayMove = resolveLandrushZombieEscapeTouchMoveInput(state)
    expect(halfwayMove?.forward).toBe(-0)
    expect(halfwayMove?.strafe).toBeCloseTo(0.5)
    expect(halfwayMove?.strength).toBeCloseTo(0.5)
    expect(Math.hypot(halfwayMove?.forward ?? 0, halfwayMove?.strafe ?? 0)).toBeCloseTo(0.5)
    expect(resolveLandrushZombieEscapeOwnedTouchMoveInput(state)).toEqual(halfwayMove)

    updateLandrushZombieEscapeTouchStick(state, 'move', 11, 300, 400, 100)
    expect(state.move.displacement).toBe(1)
    expect(state.move.strength).toBe(1)
    expect(state.move.screenX).toBeCloseTo(0.6)
    expect(state.move.screenY).toBeCloseTo(0.8)
    const clampedMove = resolveLandrushZombieEscapeTouchMoveInput(state)
    expect(clampedMove?.forward).toBeCloseTo(-0.8)
    expect(clampedMove?.strafe).toBeCloseTo(0.6)
    expect(clampedMove?.strength).toBe(1)
    expect(Math.hypot(clampedMove?.forward ?? 0, clampedMove?.strafe ?? 0)).toBeCloseTo(1)
  })

  test('lets separate pointers own movement and aim without cross-channel interference', () => {
    const state = createLandrushZombieEscapeTouchInputState()

    expect(beginLandrushZombieEscapeTouchStick(state, 'move', 4)).toBe(true)
    expect(beginLandrushZombieEscapeTouchStick(state, 'aim', 9)).toBe(true)
    expect(beginLandrushZombieEscapeTouchStick(state, 'aim', 4)).toBe(false)
    expect(beginLandrushZombieEscapeTouchStick(state, 'move', 8)).toBe(false)
    expect(updateLandrushZombieEscapeTouchStick(state, 'move', 8, 100, 0, 100)).toBe(false)
    expect(updateLandrushZombieEscapeTouchStick(state, 'move', 4, 100, 0, 100)).toBe(true)
    expect(updateLandrushZombieEscapeTouchStick(state, 'aim', 9, 0, -50, 100)).toBe(true)
    expect(state.move.screenX).toBe(1)
    expect(state.aim.screenY).toBeLessThan(0)
  })

  test('uses engage and release hysteresis without interrupting aim', () => {
    expect(LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD).toBe(0.36)
    expect(LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD).toBe(0.32)
    expect(LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD).toBeLessThan(
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD,
    )

    const state = createLandrushZombieEscapeTouchInputState()
    beginLandrushZombieEscapeTouchStick(state, 'aim', 7)

    updateLandrushZombieEscapeTouchStick(
      state,
      'aim',
      7,
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD * 100 - 0.01,
      0,
      100,
    )
    expect(state.firing).toBe(false)
    expect(state.aim.strength).toBeGreaterThan(0)

    updateLandrushZombieEscapeTouchStick(
      state,
      'aim',
      7,
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD * 100,
      0,
      100,
    )
    expect(state.firing).toBe(true)

    updateLandrushZombieEscapeTouchStick(
      state,
      'aim',
      7,
      ((LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD +
        LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD) /
        2) *
        100,
      0,
      100,
    )
    expect(state.firing).toBe(true)
    updateLandrushZombieEscapeTouchStick(
      state,
      'aim',
      7,
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_RELEASE_THRESHOLD * 100,
      0,
      100,
    )
    expect(state.firing).toBe(false)
    expect(state.aim.strength).toBeGreaterThan(0)

    updateLandrushZombieEscapeTouchStick(
      state,
      'aim',
      7,
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD * 100 - 0.01,
      0,
      100,
    )
    expect(state.firing).toBe(false)
    updateLandrushZombieEscapeTouchStick(
      state,
      'aim',
      7,
      LANDRUSH_ZOMBIE_ESCAPE_TOUCH_FIRE_ENGAGE_THRESHOLD * 100,
      0,
      100,
    )
    expect(state.firing).toBe(true)
  })

  test('ends only the owning pointer and reset releases both sticks and fire', () => {
    const state = createLandrushZombieEscapeTouchInputState()
    beginLandrushZombieEscapeTouchStick(state, 'move', 3)
    beginLandrushZombieEscapeTouchStick(state, 'aim', 5)
    updateLandrushZombieEscapeTouchStick(state, 'move', 3, 100, 0, 100)
    updateLandrushZombieEscapeTouchStick(state, 'aim', 5, 100, 0, 100)

    expect(endLandrushZombieEscapeTouchStick(state, 'aim', 3)).toBe(false)
    expect(state.firing).toBe(true)
    expect(endLandrushZombieEscapeTouchStick(state, 'aim', 5)).toBe(true)
    expect(state.firing).toBe(false)
    expect(state.aim.pointerId).toBeNull()
    expect(state.move.pointerId).toBe(3)

    resetLandrushZombieEscapeTouchInput(state)
    expect(state).toEqual(createLandrushZombieEscapeTouchInputState())
  })

  test('latches one jump request until the gameplay loop consumes it', () => {
    const state = createLandrushZombieEscapeTouchInputState()

    expect(consumeLandrushZombieEscapeTouchJumpRequest(state)).toBe(false)
    requestLandrushZombieEscapeTouchJump(state)
    requestLandrushZombieEscapeTouchJump(state)
    expect(state.jumpRequested).toBe(true)
    expect(consumeLandrushZombieEscapeTouchJumpRequest(state)).toBe(true)
    expect(state.jumpRequested).toBe(false)
    expect(consumeLandrushZombieEscapeTouchJumpRequest(state)).toBe(false)

    requestLandrushZombieEscapeTouchJump(state)
    clearLandrushZombieEscapeTouchJumpRequest(state)
    expect(consumeLandrushZombieEscapeTouchJumpRequest(state)).toBe(false)

    requestLandrushZombieEscapeTouchJump(state)
    resetLandrushZombieEscapeTouchInput(state)
    expect(consumeLandrushZombieEscapeTouchJumpRequest(state)).toBe(false)
  })

  test('projects screen-space aim through the horizontal camera frame', () => {
    expect(
      resolveLandrushZombieEscapeTouchAimDirection({
        cameraForwardX: 0,
        cameraForwardZ: -2,
        screenX: 1,
        screenY: 0,
      }),
    ).toEqual({ x: 1, z: 0 })
    expect(
      resolveLandrushZombieEscapeTouchAimDirection({
        cameraForwardX: 0,
        cameraForwardZ: -2,
        screenX: 0,
        screenY: -1,
      }),
    ).toEqual({ x: 0, z: -1 })
    expect(
      resolveLandrushZombieEscapeTouchAimDirection({
        cameraForwardX: 0,
        cameraForwardZ: -2,
        screenX: 0,
        screenY: 1,
      }),
    ).toEqual({ x: 0, z: 1 })
    expect(
      resolveLandrushZombieEscapeTouchAimDirection({
        cameraForwardX: 0,
        cameraForwardZ: 0,
        screenX: 1,
        screenY: 0,
      }),
    ).toBeNull()
    expect(
      resolveLandrushZombieEscapeTouchAimDirection({
        cameraForwardX: Number.POSITIVE_INFINITY,
        cameraForwardZ: -1,
        screenX: 1,
        screenY: 0,
      }),
    ).toBeNull()
  })

  test('neutralizes invalid geometry without retaining movement or fire', () => {
    const state = createLandrushZombieEscapeTouchInputState()
    beginLandrushZombieEscapeTouchStick(state, 'aim', 1)
    updateLandrushZombieEscapeTouchStick(state, 'aim', 1, 100, 0, 100)
    expect(state.firing).toBe(true)

    expect(updateLandrushZombieEscapeTouchStick(state, 'aim', 1, Number.NaN, 4, 0)).toBe(true)
    expect(state.aim.strength).toBe(0)
    expect(state.firing).toBe(false)
    expect(beginLandrushZombieEscapeTouchStick(state, 'move', Number.NaN)).toBe(false)
  })
})
