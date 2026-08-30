import { describe, expect, test } from 'bun:test'
import {
  shouldShowLandrushZombieEscapeMoney,
  shouldShowLandrushZombieEscapeNightInteractionHud,
  shouldShowLandrushZombieEscapeTouchControls,
} from './landrush-zombie-escape-hud-visibility'

describe('Landrush zombie HUD visibility', () => {
  test('keeps money visible throughout synchronized Day and Night phases', () => {
    for (const state of [
      { actualPhase: 'build', expectedPhase: 'build', phaseReady: true },
      { actualPhase: 'build', expectedPhase: 'build', phaseReady: false },
      { actualPhase: 'night', expectedPhase: 'night', phaseReady: true },
      { actualPhase: 'night', expectedPhase: 'night', phaseReady: false },
    ] as const) {
      expect(shouldShowLandrushZombieEscapeMoney(state)).toBe(true)
    }

    for (const state of [
      { actualPhase: 'night', expectedPhase: 'build', phaseReady: true },
      { actualPhase: 'build', expectedPhase: 'night', phaseReady: true },
    ] as const) {
      expect(shouldShowLandrushZombieEscapeMoney(state)).toBe(false)
    }
  })

  test('shows touch controls only when nonterminal night gameplay is ready', () => {
    expect(
      shouldShowLandrushZombieEscapeTouchControls({
        actualPhase: 'night',
        expectedPhase: 'night',
        phaseReady: true,
        terminal: false,
      }),
    ).toBe(true)

    for (const state of [
      { actualPhase: 'build', expectedPhase: 'build', phaseReady: true, terminal: false },
      { actualPhase: 'night', expectedPhase: 'build', phaseReady: true, terminal: false },
      { actualPhase: 'build', expectedPhase: 'night', phaseReady: true, terminal: false },
      { actualPhase: 'night', expectedPhase: 'night', phaseReady: false, terminal: false },
      { actualPhase: 'night', expectedPhase: 'night', phaseReady: true, terminal: true },
    ] as const) {
      expect(shouldShowLandrushZombieEscapeTouchControls(state)).toBe(false)
    }
  })

  test('shows pickup and controller interaction hints only during ready Night gameplay', () => {
    expect(
      shouldShowLandrushZombieEscapeNightInteractionHud({
        actualPhase: 'night',
        expectedPhase: 'night',
        phaseReady: true,
      }),
    ).toBe(true)

    for (const state of [
      { actualPhase: 'build', expectedPhase: 'build', phaseReady: true },
      { actualPhase: 'night', expectedPhase: 'build', phaseReady: true },
      { actualPhase: 'build', expectedPhase: 'night', phaseReady: true },
      { actualPhase: 'night', expectedPhase: 'night', phaseReady: false },
    ] as const) {
      expect(shouldShowLandrushZombieEscapeNightInteractionHud(state)).toBe(false)
    }
  })
})
