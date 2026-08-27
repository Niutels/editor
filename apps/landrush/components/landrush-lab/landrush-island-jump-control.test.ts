import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushIslandJumpButtonState,
  advanceLandrushIslandJumpPresentation,
  consumeLandrushIslandJumpRequest,
  createLandrushIslandJumpButtonState,
  createLandrushIslandJumpPresentationState,
  createLandrushIslandJumpRequestState,
  LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS,
  queueLandrushIslandJumpRequest,
  requestLandrushIslandKeyboardJumpFromKeyDown,
} from './landrush-island-jump-control'

describe('Landrush island jump control', () => {
  test('requires release after either jump button is held across a command gate', () => {
    for (const _source of ['keyboard-space', 'gamepad'] as const) {
      const button = createLandrushIslandJumpButtonState()

      expect(advanceLandrushIslandJumpButtonState(button, true, false)).toBe(false)
      expect(advanceLandrushIslandJumpButtonState(button, true, true)).toBe(false)
      expect(advanceLandrushIslandJumpButtonState(button, false, true)).toBe(false)
      expect(advanceLandrushIslandJumpButtonState(button, true, true)).toBe(true)
    }
  })

  test('never grants keyboard jump authority to editable or default-prevented keydowns', () => {
    for (const rejectedEvent of [
      { defaultPrevented: false, editableTarget: true },
      { defaultPrevented: true, editableTarget: false },
    ]) {
      const buttonState = createLandrushIslandJumpButtonState()

      expect(
        requestLandrushIslandKeyboardJumpFromKeyDown({
          buttonState,
          commandsEnabled: true,
          repeat: false,
          ...rejectedEvent,
        }),
      ).toBe(false)
      expect(advanceLandrushIslandJumpButtonState(buttonState, true, true)).toBe(false)
      expect(advanceLandrushIslandJumpButtonState(buttonState, false, true)).toBe(false)
      expect(
        requestLandrushIslandKeyboardJumpFromKeyDown({
          buttonState,
          commandsEnabled: true,
          defaultPrevented: false,
          editableTarget: false,
          repeat: false,
        }),
      ).toBe(true)
    }
  })

  test('rejects keyboard auto-repeat after the initial validated edge', () => {
    const buttonState = createLandrushIslandJumpButtonState()

    expect(
      requestLandrushIslandKeyboardJumpFromKeyDown({
        buttonState,
        commandsEnabled: true,
        defaultPrevented: false,
        editableTarget: false,
        repeat: false,
      }),
    ).toBe(true)
    expect(
      requestLandrushIslandKeyboardJumpFromKeyDown({
        buttonState,
        commandsEnabled: true,
        defaultPrevented: false,
        editableTarget: false,
        repeat: true,
      }),
    ).toBe(false)
  })

  test('drives jump pose from simulated time and physical contacts', () => {
    const state = createLandrushIslandJumpPresentationState(12)
    const advance = (currentSimulationSeconds: number, grounded: boolean, jumpsUsed: number) =>
      advanceLandrushIslandJumpPresentation({
        currentSimulationSeconds,
        durationSeconds: 1.28,
        grounded,
        jumpsUsed,
        state,
        takeoffProgress: 0.18,
        touchdownProgress: 0.78,
      })

    expect(advance(12.5, true, 0)).toBe(0.18)
    expect(advance(12, false, 1)).toBe(0.18)
    expect(advance(12.384, false, 1)).toBeCloseTo(0.48, 10)
    expect(advance(12.5, true, 0)).toBe(0.78)
    expect(advance(12.7816, true, 0)).toBeCloseTo(1, 10)
  })

  test('retains a buffered edge until the physical controller can jump', () => {
    const request = createLandrushIslandJumpRequestState()
    const requestedAtMs = 1_000

    queueLandrushIslandJumpRequest(request, 'keyboard-space', requestedAtMs)
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: false,
        commandsEnabled: true,
        falling: false,
        nowMs: requestedAtMs,
        state: request,
      }),
    ).toBeNull()
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: requestedAtMs + LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS,
        state: request,
      }),
    ).toBe('keyboard-space')
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: requestedAtMs + 1,
        state: request,
      }),
    ).toBeNull()
  })

  test('does not repeat a consumed request while its physical button remains held', () => {
    const request = createLandrushIslandJumpRequestState()

    queueLandrushIslandJumpRequest(request, 'gamepad', 50)
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: 50,
        state: request,
      }),
    ).toBe('gamepad')
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: 51,
        state: request,
      }),
    ).toBeNull()
  })

  test('buffers touch requests through the same authoritative jump queue', () => {
    const request = createLandrushIslandJumpRequestState()

    queueLandrushIslandJumpRequest(request, 'touch', 75)
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: false,
        commandsEnabled: true,
        falling: false,
        nowMs: 75,
        state: request,
      }),
    ).toBeNull()
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: 76,
        state: request,
      }),
    ).toBe('touch')
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: 77,
        state: request,
      }),
    ).toBeNull()
  })

  test('clears buffered requests as soon as jump command authority is suspended', () => {
    const request = createLandrushIslandJumpRequestState()

    queueLandrushIslandJumpRequest(request, 'touch', 90)
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: false,
        falling: false,
        nowMs: 90,
        state: request,
      }),
    ).toBeNull()
    expect(request.source).toBeNull()
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: 91,
        state: request,
      }),
    ).toBeNull()
  })

  test('expires old requests and never consumes while falling', () => {
    const request = createLandrushIslandJumpRequestState()

    queueLandrushIslandJumpRequest(request, 'runtime-probe', 100)
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: true,
        nowMs: 100,
        state: request,
      }),
    ).toBeNull()
    expect(
      consumeLandrushIslandJumpRequest({
        canJump: true,
        commandsEnabled: true,
        falling: false,
        nowMs: 100 + LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS + 1,
        state: request,
      }),
    ).toBeNull()
    expect(request.source).toBeNull()
  })
})
