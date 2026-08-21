import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeControlLatch,
  createZombieEscapeControlState,
  resolveZombieEscapeControlsInto,
  type ZombieEscapeGamepadSample,
  type ZombieEscapeRawControls,
} from './zombie-escape-controls'

function createRawControls(): ZombieEscapeRawControls {
  return {
    fireMouse: false,
    gamepad: null,
    gamepadMeta: { menu: false, view: false },
    keys: new Set(),
    pointerActive: false,
    pointerAimStrength: 0,
    pointerAimX: 0,
    pointerAimZ: -1,
    viewForwardX: 0,
    viewForwardZ: -1,
  }
}

function createGamepadSample(
  overrides: Partial<ZombieEscapeGamepadSample> = {},
): ZombieEscapeGamepadSample {
  return {
    connected: true,
    dpadDown: false,
    dpadUp: false,
    forward: 0,
    lookStrength: 0,
    lookX: 0,
    lookY: 0,
    rightTrigger: 0,
    run: false,
    square: false,
    strafe: 0,
    strength: 0,
    triangle: false,
    ...overrides,
  }
}

describe('Zombie Escape controls', () => {
  test('keeps camera-relative movement independent from pointer aim', () => {
    const raw = createRawControls()
    raw.keys = new Set(['KeyW', 'KeyD'])
    raw.pointerActive = true
    raw.pointerAimStrength = 1
    raw.pointerAimX = -1
    raw.pointerAimZ = 0
    const output = createZombieEscapeControlState()
    resolveZombieEscapeControlsInto(raw, createZombieEscapeControlLatch(), output)

    expect(Math.hypot(output.moveX, output.moveZ)).toBeCloseTo(1, 8)
    expect(output.moveX).toBeGreaterThan(0)
    expect(output.moveZ).toBeLessThan(0)
    expect(output.aimX).toBe(-1)
    expect(output.aimZ).toBeCloseTo(0)
    expect(output.inputMode).toBe('keyboard')
  })

  test('maps the right stick into world aim and selects gamepad prompts', () => {
    const raw = createRawControls()
    raw.gamepad = createGamepadSample({
      forward: 0.5,
      lookStrength: 1,
      lookX: 1,
      rightTrigger: 0.8,
      run: true,
      strength: 0.5,
    })
    const output = createZombieEscapeControlState()
    resolveZombieEscapeControlsInto(raw, createZombieEscapeControlLatch(), output)

    expect(output.aimX).toBeCloseTo(1)
    expect(output.aimZ).toBeCloseTo(0)
    expect(output.fire).toBe(true)
    expect(output.run).toBe(true)
    expect(output.inputMode).toBe('gamepad')
  })

  test('assigns R2 only to fire and the canonical run command only to sprint', () => {
    const raw = createRawControls()
    const output = createZombieEscapeControlState()
    const latch = createZombieEscapeControlLatch()

    raw.gamepad = createGamepadSample({ rightTrigger: 0.8 })
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.fire).toBe(true)
    expect(output.run).toBe(false)

    raw.gamepad = createGamepadSample({ run: true })
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.fire).toBe(false)
    expect(output.run).toBe(true)
  })

  test('ignores legacy shoulder aliases', () => {
    const raw = createRawControls()
    const shoulderOnly = {
      ...createGamepadSample(),
      leftShoulder: true,
      rightShoulder: true,
    }
    raw.gamepad = shoulderOnly
    const output = createZombieEscapeControlState()

    resolveZombieEscapeControlsInto(raw, createZombieEscapeControlLatch(), output)

    expect(output.fire).toBe(false)
    expect(output.run).toBe(false)
  })

  test('emits pause, reset, and debug controls only on press edges', () => {
    const raw = createRawControls()
    raw.keys = new Set(['KeyP', 'KeyR', 'F1'])
    const latch = createZombieEscapeControlLatch()
    const output = createZombieEscapeControlState()

    resolveZombieEscapeControlsInto(raw, latch, output)
    expect([output.pausePressed, output.resetPressed, output.debugPressed]).toEqual([
      true,
      true,
      true,
    ])
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect([output.pausePressed, output.resetPressed, output.debugPressed]).toEqual([
      false,
      false,
      false,
    ])
  })

  test('retains one E interaction pulse until simulation consumption', () => {
    const raw = createRawControls()
    raw.keys = new Set(['KeyE'])
    const latch = createZombieEscapeControlLatch()
    const output = createZombieEscapeControlState()

    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(true)
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(true)

    output.interactPressed = false
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(false)

    raw.keys = new Set()
    resolveZombieEscapeControlsInto(raw, latch, output)
    raw.keys = new Set(['KeyE'])
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(true)
  })

  test('maps Square to the same edge-triggered interaction as E', () => {
    const raw = createRawControls()
    raw.gamepad = createGamepadSample({ square: true })
    const latch = createZombieEscapeControlLatch()
    const output = createZombieEscapeControlState()

    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(true)
    expect(output.inputMode).toBe('gamepad')

    output.interactPressed = false
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(false)

    raw.gamepad = createGamepadSample()
    resolveZombieEscapeControlsInto(raw, latch, output)
    raw.gamepad = createGamepadSample({ square: true })
    resolveZombieEscapeControlsInto(raw, latch, output)
    expect(output.interactPressed).toBe(true)
  })
})
