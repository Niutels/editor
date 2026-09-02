import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
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

  test('keeps the weapon inventory anchor phase-invariant when touch controls appear', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const inventoryInvocation =
      source.match(
        /<ZombieEscapeWeaponInventoryRow[\s\S]*?weaponInventoryMask=\{snapshot\.weaponInventoryMask\}\s*\/>/,
      )?.[0] ?? ''

    expect(inventoryInvocation).not.toBe('')
    expect(inventoryInvocation).toContain('bottom-[max(1rem,env(safe-area-inset-bottom))]')
    expect(inventoryInvocation).toContain('left-[max(1rem,env(safe-area-inset-left))]')
    expect(inventoryInvocation).toContain(
      '[@media(any-pointer:coarse)]:right-[calc(max(1rem,env(safe-area-inset-right))+clamp(4.2rem,15.4vw,5.6rem)+1rem)]',
    )
    expect(inventoryInvocation).toContain(
      '[@media(any-pointer:coarse)]:left-[calc(max(1rem,env(safe-area-inset-left))+clamp(4.2rem,15.4vw,5.6rem)+1rem)]',
    )
    expect(inventoryInvocation).toContain('[@media(any-pointer:coarse)]:flex-wrap')
    expect(inventoryInvocation).toContain('[@media(any-pointer:coarse)]:justify-center')
    expect(inventoryInvocation).not.toContain('touchControlsVisible')
    expect(inventoryInvocation).not.toContain('bottom-[max(9rem')
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
