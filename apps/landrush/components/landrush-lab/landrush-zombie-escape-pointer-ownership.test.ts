import { describe, expect, test } from 'bun:test'
import {
  acquireLandrushZombieEscapeCanvasPointerOwnership,
  isLandrushZombieEscapeDirectCombatPointer,
  isLandrushZombieEscapeGameplayKeyboardCode,
  resolveLandrushZombieEscapePickupPromptPresentation,
  shouldLandrushZombieEscapeOwnCanvasPointerEvents,
} from './landrush-zombie-escape-mode'

describe('Landrush Zombie Escape canvas pointer ownership', () => {
  test('reserves touch pointers for the virtual sticks instead of treating them as mouse fire', () => {
    expect(isLandrushZombieEscapeDirectCombatPointer('touch')).toBe(false)
    expect(isLandrushZombieEscapeDirectCombatPointer('mouse')).toBe(true)
    expect(isLandrushZombieEscapeDirectCombatPointer('pen')).toBe(true)
  })

  test('belongs to Pascal during day/build and to combat only during the expected night phase', () => {
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(false, 'build')).toBe(false)
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(true, 'build')).toBe(false)
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(false, 'night')).toBe(false)
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(true, 'night')).toBe(true)
  })

  test('treats only unblocked robot and interact commands as gameplay keyboard activity', () => {
    for (const code of [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowLeft',
      'ArrowDown',
      'ArrowRight',
      'ShiftLeft',
      'ShiftRight',
      'ControlLeft',
      'ControlRight',
      'Space',
      'KeyE',
    ]) {
      expect(isLandrushZombieEscapeGameplayKeyboardCode(code)).toBe(true)
    }
    for (const code of ['Escape', 'KeyR', 'Tab']) {
      expect(isLandrushZombieEscapeGameplayKeyboardCode(code)).toBe(false)
    }
  })

  test('uses auto-buy copy without a keyboard badge for touch pickups', () => {
    expect(
      resolveLandrushZombieEscapePickupPromptPresentation({
        inputMode: 'touch',
        prompt: { affordable: true, cost: 5, displayName: 'Reef Carbine', weaponIndex: 1 },
      }),
    ).toEqual({ badge: null, message: 'Auto-buy Reef Carbine · $5' })
    expect(
      resolveLandrushZombieEscapePickupPromptPresentation({
        inputMode: 'touch',
        prompt: { affordable: false, cost: 5, displayName: 'Reef Carbine', weaponIndex: 1 },
      }),
    ).toEqual({ badge: null, message: 'Need $5 for Reef Carbine' })
    expect(
      resolveLandrushZombieEscapePickupPromptPresentation({
        inputMode: 'keyboard',
        prompt: { affordable: true, cost: 5, displayName: 'Reef Carbine', weaponIndex: 1 },
      }),
    ).toEqual({ badge: 'E', message: 'Buy Reef Carbine · $5' })
  })

  test('suspends an enabled R3F pointer manager and restores it on release', () => {
    let enabled = true
    const changes: boolean[] = []
    const release = acquireLandrushZombieEscapeCanvasPointerOwnership({
      getEnabled: () => enabled,
      setEnabled: (nextEnabled) => {
        enabled = nextEnabled
        changes.push(nextEnabled)
      },
    })

    expect(enabled).toBe(false)
    release()
    expect(enabled).toBe(true)
    expect(changes).toEqual([false, true])
  })

  test('preserves an already-disabled R3F pointer manager', () => {
    let enabled = false
    const changes: boolean[] = []
    const release = acquireLandrushZombieEscapeCanvasPointerOwnership({
      getEnabled: () => enabled,
      setEnabled: (nextEnabled) => {
        enabled = nextEnabled
        changes.push(nextEnabled)
      },
    })

    release()
    expect(enabled).toBe(false)
    expect(changes).toEqual([])
  })
})
