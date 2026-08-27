import { describe, expect, test } from 'bun:test'
import {
  createLandrushIslandJumpEdgeBlurPresentationState,
  LANDRUSH_ISLAND_JUMP_EDGE_BLUR,
  resolveLandrushIslandJumpEdgeBlurAmount,
  resolveLandrushIslandJumpEdgeBlurDebugMode,
  resolveLandrushIslandJumpEdgeBlurSample,
  resolveLandrushIslandJumpEdgeBlurStrength,
  startLandrushIslandJumpEdgeBlur,
} from './landrush-island-jump-edge-blur'

describe('jump edge blur presentation', () => {
  test('eases in and out across the doubled impulse lifetime', () => {
    expect(LANDRUSH_ISLAND_JUMP_EDGE_BLUR).toMatchObject({
      attackEndMs: 80,
      endMs: 600,
      holdEndMs: 140,
    })

    const attack = [-1, 0, 20, 40, 60, 80].map(resolveLandrushIslandJumpEdgeBlurAmount)
    expect(attack).toEqual([...attack].sort((a, b) => a - b))
    expect(attack.at(0)).toBe(0)
    expect(attack.at(-1)).toBe(1)
    expect(resolveLandrushIslandJumpEdgeBlurAmount(140)).toBe(1)

    const release = [180, 280, 400, 520, LANDRUSH_ISLAND_JUMP_EDGE_BLUR.endMs].map(
      resolveLandrushIslandJumpEdgeBlurAmount,
    )
    expect(release).toEqual([...release].sort((a, b) => b - a))
    expect(release.at(-1)).toBe(0)
  })

  test('retriggering restarts the impulse from the latest accepted jump', () => {
    const state = createLandrushIslandJumpEdgeBlurPresentationState()
    startLandrushIslandJumpEdgeBlur(state, 100)
    const fading = resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 500, state }).amount

    startLandrushIslandJumpEdgeBlur(state, 500)
    const restarted = resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 500, state })
    expect(restarted.active).toBe(true)
    expect(restarted.amount).toBe(0)
    expect(resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 580, state }).amount).toBe(1)
    expect(resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 580, state }).amount).toBeGreaterThan(
      fading,
    )
  })

  test('exposes only the bounded envelope and scales reduced motion down', () => {
    const state = createLandrushIslandJumpEdgeBlurPresentationState()
    startLandrushIslandJumpEdgeBlur(state, 0)
    const full = resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 80, state })
    const reduced = resolveLandrushIslandJumpEdgeBlurSample({
      nowMs: 80,
      reducedMotion: true,
      state,
    })

    expect(Object.keys(full).sort()).toEqual(['active', 'amount'])
    expect(full.amount).toBe(1)
    expect(reduced.amount).toBe(LANDRUSH_ISLAND_JUMP_EDGE_BLUR.reducedMotionStrength)
  })

  test('keeps every diagnostic deterministic across motion preferences', () => {
    for (const debugMode of ['fixed', 'mask', 'contribution'] as const) {
      const state = createLandrushIslandJumpEdgeBlurPresentationState(debugMode)
      const sample = resolveLandrushIslandJumpEdgeBlurSample({
        nowMs: 0,
        reducedMotion: true,
        state,
      })
      expect(sample).toEqual({ active: true, amount: 1 })
    }
  })

  test('resolves deterministic diagnostics without leaking invalid values', () => {
    expect(resolveLandrushIslandJumpEdgeBlurDebugMode('mask')).toBe('mask')
    expect(resolveLandrushIslandJumpEdgeBlurDebugMode('contribution')).toBe('contribution')
    expect(resolveLandrushIslandJumpEdgeBlurDebugMode('fixed')).toBe('fixed')
    expect(resolveLandrushIslandJumpEdgeBlurDebugMode('1')).toBe('fixed')
    expect(resolveLandrushIslandJumpEdgeBlurDebugMode('nope')).toBe('final')
    expect(resolveLandrushIslandJumpEdgeBlurDebugMode(null)).toBe('final')
  })

  test('clamps the capture strength ladder to the shipped range', () => {
    expect(resolveLandrushIslandJumpEdgeBlurStrength(null)).toBe(2)
    expect(resolveLandrushIslandJumpEdgeBlurStrength('invalid')).toBe(2)
    expect(resolveLandrushIslandJumpEdgeBlurStrength('-1')).toBe(0)
    expect(resolveLandrushIslandJumpEdgeBlurStrength('0')).toBe(0)
    expect(resolveLandrushIslandJumpEdgeBlurStrength('1.25')).toBe(1.25)
    expect(resolveLandrushIslandJumpEdgeBlurStrength('3')).toBe(2)
  })

  test('has a real inactive to active to inactive impulse lifecycle', () => {
    const state = createLandrushIslandJumpEdgeBlurPresentationState()
    expect(resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 99, state }).active).toBe(false)

    startLandrushIslandJumpEdgeBlur(state, 100)
    expect(resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 100, state }).active).toBe(true)
    expect(resolveLandrushIslandJumpEdgeBlurSample({ nowMs: 180, state }).amount).toBe(1)
    expect(
      resolveLandrushIslandJumpEdgeBlurSample({
        nowMs: 100 + LANDRUSH_ISLAND_JUMP_EDGE_BLUR.endMs,
        state,
      }),
    ).toEqual({ active: false, amount: 0 })
  })
})
