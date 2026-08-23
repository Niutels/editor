import { describe, expect, test } from 'bun:test'
import { shouldShowLandrushZombieEscapeMoney } from './landrush-zombie-escape-hud-visibility'

describe('Landrush zombie HUD visibility', () => {
  test('shows money only for an authoritative, ready night phase', () => {
    expect(
      shouldShowLandrushZombieEscapeMoney({
        actualPhase: 'night',
        expectedPhase: 'night',
        phaseReady: true,
      }),
    ).toBe(true)

    for (const state of [
      { actualPhase: 'build', expectedPhase: 'build', phaseReady: true },
      { actualPhase: 'night', expectedPhase: 'build', phaseReady: true },
      { actualPhase: 'night', expectedPhase: 'night', phaseReady: false },
      { actualPhase: 'build', expectedPhase: 'night', phaseReady: true },
    ] as const) {
      expect(shouldShowLandrushZombieEscapeMoney(state)).toBe(false)
    }
  })
})
