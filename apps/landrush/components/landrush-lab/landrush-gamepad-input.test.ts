import { describe, expect, test } from 'bun:test'
import { type LandrushGamepadSnapshot, resolveLandrushGamepadInput } from './landrush-gamepad-input'

function createGamepadSnapshot(
  buttonValues: Readonly<Record<number, number>> = {},
): LandrushGamepadSnapshot {
  const buttons: Array<{ pressed: boolean; value: number } | undefined> = Array.from(
    { length: 16 },
    () => undefined,
  )
  for (const [rawIndex, value] of Object.entries(buttonValues)) {
    const index = Number(rawIndex)
    buttons[index] = { pressed: value >= 1, value }
  }
  return { axes: [0, 0, 0, 0], buttons }
}

describe('Landrush gamepad input', () => {
  test('maps R2 to the trigger without requesting a run', () => {
    const input = resolveLandrushGamepadInput(createGamepadSnapshot({ 7: 0.8 }))

    expect(input.rightTrigger).toBeCloseTo(0.8)
    expect(input.rightShoulder).toBe(false)
    expect(input.run).toBe(false)
  })

  test('maps L3 alone to the run command', () => {
    const input = resolveLandrushGamepadInput(createGamepadSnapshot({ 10: 1 }))

    expect(input.run).toBe(true)
    expect(input.rightTrigger).toBe(0)
  })

  test('keeps R1 observable without treating it as run', () => {
    const input = resolveLandrushGamepadInput(createGamepadSnapshot({ 5: 1 }))

    expect(input.rightShoulder).toBe(true)
    expect(input.run).toBe(false)
  })

  test('maps Cross and Square to their canonical face-button commands', () => {
    const input = resolveLandrushGamepadInput(createGamepadSnapshot({ 0: 1, 2: 1 }))

    expect(input.cross).toBe(true)
    expect(input.square).toBe(true)
    expect('jump' in input).toBe(false)
  })
})
