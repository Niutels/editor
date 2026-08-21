import { describe, expect, test } from 'bun:test'
import {
  consumeLandrushIslandJumpRequest,
  createLandrushIslandJumpRequestState,
  LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS,
  queueLandrushIslandJumpRequest,
} from './landrush-island-jump-control'

describe('Landrush island jump control', () => {
  test('retains a buffered edge through descent and consumes it once at touchdown', () => {
    const request = createLandrushIslandJumpRequestState()
    const requestedAtMs = 1_000

    queueLandrushIslandJumpRequest(request, 'keyboard-space', requestedAtMs)
    expect(consumeLandrushIslandJumpRequest(request, 0.76, false, requestedAtMs)).toBeNull()
    expect(
      consumeLandrushIslandJumpRequest(
        request,
        0.78,
        false,
        requestedAtMs + LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS,
      ),
    ).toBe('keyboard-space')
    expect(consumeLandrushIslandJumpRequest(request, 0.78, false, requestedAtMs + 1)).toBeNull()
  })

  test('does not repeat a consumed request while its physical button remains held', () => {
    const request = createLandrushIslandJumpRequestState()

    queueLandrushIslandJumpRequest(request, 'gamepad', 50)
    expect(consumeLandrushIslandJumpRequest(request, null, false, 50)).toBe('gamepad')
    expect(consumeLandrushIslandJumpRequest(request, 0.78, false, 51)).toBeNull()
  })

  test('expires old requests and never consumes while falling', () => {
    const request = createLandrushIslandJumpRequestState()

    queueLandrushIslandJumpRequest(request, 'runtime-probe', 100)
    expect(consumeLandrushIslandJumpRequest(request, null, true, 100)).toBeNull()
    expect(
      consumeLandrushIslandJumpRequest(
        request,
        null,
        false,
        100 + LANDRUSH_ISLAND_JUMP_INPUT_BUFFER_MS + 1,
      ),
    ).toBeNull()
    expect(request.source).toBeNull()
  })
})
