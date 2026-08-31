import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeWeaponSwitchInputState,
  readZombieEscapeShoulderWeaponSwitch,
  readZombieEscapeWheelWeaponSwitch,
  resetZombieEscapeWeaponSwitchInput,
} from './zombie-escape-weapon-switch-input'

describe('Zombie Escape weapon-switch input', () => {
  test('emits one previous or next command per shoulder press', () => {
    const state = createZombieEscapeWeaponSwitchInputState()

    expect(readZombieEscapeShoulderWeaponSwitch(state, true, false)).toBe(-1)
    expect(readZombieEscapeShoulderWeaponSwitch(state, true, false)).toBe(0)
    expect(readZombieEscapeShoulderWeaponSwitch(state, false, false)).toBe(0)
    expect(readZombieEscapeShoulderWeaponSwitch(state, false, true)).toBe(1)
    expect(readZombieEscapeShoulderWeaponSwitch(state, false, true)).toBe(0)
  })

  test('does not choose a direction when both shoulders rise together', () => {
    const state = createZombieEscapeWeaponSwitchInputState()

    expect(readZombieEscapeShoulderWeaponSwitch(state, true, true)).toBe(0)
    expect(readZombieEscapeShoulderWeaponSwitch(state, true, false)).toBe(0)
    expect(readZombieEscapeShoulderWeaponSwitch(state, false, false)).toBe(0)
    expect(readZombieEscapeShoulderWeaponSwitch(state, true, false)).toBe(-1)
  })

  test('normalizes pixel, line, and page wheel deltas and respects direction', () => {
    const pixelState = createZombieEscapeWeaponSwitchInputState()
    expect(readZombieEscapeWheelWeaponSwitch(pixelState, 24, 0, 0)).toBe(0)
    expect(readZombieEscapeWheelWeaponSwitch(pixelState, 24, 0, 1)).toBe(1)

    const lineState = createZombieEscapeWeaponSwitchInputState()
    expect(readZombieEscapeWheelWeaponSwitch(lineState, -2, 1, 0)).toBe(-1)

    const pageState = createZombieEscapeWeaponSwitchInputState()
    expect(readZombieEscapeWheelWeaponSwitch(pageState, 1, 2, 0)).toBe(1)
  })

  test('bounds a high-frequency wheel gesture to one switch during the cooldown', () => {
    const state = createZombieEscapeWeaponSwitchInputState()

    expect(readZombieEscapeWheelWeaponSwitch(state, 100, 0, 1_000)).toBe(1)
    expect(readZombieEscapeWheelWeaponSwitch(state, 100, 0, 1_010)).toBe(0)
    expect(readZombieEscapeWheelWeaponSwitch(state, 100, 0, 1_141)).toBe(1)
  })

  test('resets held shoulders and accumulated wheel input', () => {
    const state = createZombieEscapeWeaponSwitchInputState()
    readZombieEscapeShoulderWeaponSwitch(state, true, false)
    readZombieEscapeWheelWeaponSwitch(state, 20, 0, 50)

    resetZombieEscapeWeaponSwitchInput(state)

    expect(readZombieEscapeShoulderWeaponSwitch(state, true, false)).toBe(-1)
    expect(readZombieEscapeWheelWeaponSwitch(state, 28, 0, 51)).toBe(0)
  })
})
