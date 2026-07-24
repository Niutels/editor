import { describe, expect, test } from 'bun:test'
import { createClickGestureDeduper } from './click-gesture-deduper'

const pointerEvent = (
  type: 'click' | 'pointerup',
  overrides: Partial<{
    clientX: number
    clientY: number
    pointerId: number
    timeStamp: number
  }> = {},
) => ({
  clientX: 120,
  clientY: 80,
  pointerId: 7,
  timeStamp: type === 'pointerup' ? 1_000 : 1_010,
  type,
  ...overrides,
})

describe('click gesture deduper', () => {
  test('collapses a synthesized node click and browser grid click', () => {
    const accept = createClickGestureDeduper()
    expect(accept({ nativeEvent: { nativeEvent: pointerEvent('pointerup') } })).toBe(true)
    expect(accept({ nativeEvent: pointerEvent('click') })).toBe(false)
  })

  test('collapses repeated handlers for the same semantic event', () => {
    const accept = createClickGestureDeduper()
    const event = { nativeEvent: { nativeEvent: pointerEvent('pointerup') } }
    expect(accept(event)).toBe(true)
    expect(accept(event)).toBe(false)
  })

  test('accepts distinct gestures and standalone grid clicks', () => {
    const accept = createClickGestureDeduper()
    expect(accept({ nativeEvent: pointerEvent('click') })).toBe(true)
    expect(
      accept({
        nativeEvent: {
          nativeEvent: pointerEvent('pointerup', { timeStamp: 1_200 }),
        },
      }),
    ).toBe(true)
    expect(
      accept({
        nativeEvent: {
          nativeEvent: pointerEvent('pointerup', { pointerId: 8, timeStamp: 1_220 }),
        },
      }),
    ).toBe(true)
  })
})
