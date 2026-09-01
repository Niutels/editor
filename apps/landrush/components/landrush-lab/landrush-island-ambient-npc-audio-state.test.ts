import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushIslandAmbientNpcBumpAudio,
  clearLandrushIslandAmbientNpcAudioPosition,
  createLandrushIslandAmbientNpcAudioPositions,
  createLandrushIslandAmbientNpcBumpRuntime,
  LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_REPEAT_INTERVAL_SECONDS,
  readLandrushIslandAmbientNpcAudioPositions,
  registerLandrushIslandAmbientNpcAudioPositions,
  setLandrushIslandAmbientNpcAudioPosition,
} from './landrush-island-ambient-npc-audio-state'

const GLOBAL_INTERVAL_SECONDS = 0.7

function advance(
  runtime: ReturnType<typeof createLandrushIslandAmbientNpcBumpRuntime>,
  positions: ReturnType<typeof createLandrushIslandAmbientNpcAudioPositions>,
  nowSeconds: number,
  playerY: number,
  playbackAvailable = true,
) {
  return advanceLandrushIslandAmbientNpcBumpAudio(
    runtime,
    positions,
    0,
    playerY,
    0,
    nowSeconds,
    playbackAvailable,
    GLOBAL_INTERVAL_SECONDS,
  )
}

describe('ambient NPC bump audio', () => {
  test('fires once on contact and rearms only after separation', () => {
    const positions = createLandrushIslandAmbientNpcAudioPositions(2)
    const runtime = createLandrushIslandAmbientNpcBumpRuntime(2)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.8, 0, 0)

    expect(advance(runtime, positions, 1, 0)).toBe(0)
    expect(advance(runtime, positions, 2, 0)).toBe(-1)

    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 2, 0, 0)
    expect(advance(runtime, positions, 3, 0)).toBe(-1)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.8, 0, 0)
    expect(
      advance(runtime, positions, 1 + LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_REPEAT_INTERVAL_SECONDS, 0),
    ).toBe(0)
  })

  test('requires three-dimensional proximity across floor elevations', () => {
    const positions = createLandrushIslandAmbientNpcAudioPositions(2)
    const runtime = createLandrushIslandAmbientNpcBumpRuntime(2)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.1, 3, 0)
    setLandrushIslandAmbientNpcAudioPosition(positions, 1, 0.1, -3, 0)

    expect(advance(runtime, positions, 1, 0)).toBe(-1)
    expect([...runtime.contactState]).toEqual([0, 0])

    setLandrushIslandAmbientNpcAudioPosition(positions, 1, 0.1, 0.2, 0)
    expect(advance(runtime, positions, 2, 0)).toBe(1)
  })

  test('consumes simultaneous contacts instead of playing delayed reactions', () => {
    const positions = createLandrushIslandAmbientNpcAudioPositions(2)
    const runtime = createLandrushIslandAmbientNpcBumpRuntime(2)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.75, 0, 0)
    setLandrushIslandAmbientNpcAudioPosition(positions, 1, 0.8, 0, 0)

    expect(advance(runtime, positions, 1, 0)).toBe(0)
    expect(advance(runtime, positions, 1.2, 0)).toBe(-1)
    expect(advance(runtime, positions, 1 + GLOBAL_INTERVAL_SECONDS, 0)).toBe(-1)
  })

  test('consumes contacts while playback is unavailable', () => {
    const positions = createLandrushIslandAmbientNpcAudioPositions(1)
    const runtime = createLandrushIslandAmbientNpcBumpRuntime(1)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.75, 0, 0)

    expect(advance(runtime, positions, 1, 0, false)).toBe(-1)
    expect(advance(runtime, positions, 2, 0, true)).toBe(-1)
  })

  test('does not delay a re-entry reaction until its cooldown expires', () => {
    const positions = createLandrushIslandAmbientNpcAudioPositions(1)
    const runtime = createLandrushIslandAmbientNpcBumpRuntime(1)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.75, 0, 0)
    expect(advance(runtime, positions, 1, 0)).toBe(0)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 2, 0, 0)
    expect(advance(runtime, positions, 1.5, 0)).toBe(-1)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.75, 0, 0)
    expect(advance(runtime, positions, 2, 0)).toBe(-1)
    expect(advance(runtime, positions, 7, 0)).toBe(-1)
  })

  test('clears inactive NPCs without producing stale contact audio', () => {
    const positions = createLandrushIslandAmbientNpcAudioPositions(1)
    const runtime = createLandrushIslandAmbientNpcBumpRuntime(1)
    setLandrushIslandAmbientNpcAudioPosition(positions, 0, 0.4, 0, 0)
    clearLandrushIslandAmbientNpcAudioPosition(positions, 0)

    expect(advance(runtime, positions, 1, 0)).toBe(-1)
    expect(runtime.contactState[0]).toBe(0)
  })

  test('isolates runtime registrations and restores the previous owner safely', () => {
    const runtimeOwner = {}
    const first = createLandrushIslandAmbientNpcAudioPositions(1)
    const second = createLandrushIslandAmbientNpcAudioPositions(2)
    const unregisterFirst = registerLandrushIslandAmbientNpcAudioPositions(runtimeOwner, first)
    expect(readLandrushIslandAmbientNpcAudioPositions(runtimeOwner)).toBe(first)
    const unregisterSecond = registerLandrushIslandAmbientNpcAudioPositions(runtimeOwner, second)
    expect(readLandrushIslandAmbientNpcAudioPositions(runtimeOwner)).toBe(second)

    unregisterFirst()
    expect(readLandrushIslandAmbientNpcAudioPositions(runtimeOwner)).toBe(second)
    unregisterSecond()
    expect(readLandrushIslandAmbientNpcAudioPositions(runtimeOwner)).toBeNull()
  })
})
