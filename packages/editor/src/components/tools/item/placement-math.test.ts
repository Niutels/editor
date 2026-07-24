import { describe, expect, test } from 'bun:test'
import {
  calculateCursorRotation,
  getDetachedAttachmentPreviewLift,
  stripTransient,
} from './placement-math'

function expectCursorForward(
  wallStart: [number, number],
  wallEnd: [number, number],
  normalZ: number,
  expected: [number, number],
) {
  const rotation = calculateCursorRotation([0, 0, normalZ], wallStart, wallEnd)
  expect(Math.sin(rotation)).toBeCloseTo(expected[0], 8)
  expect(Math.cos(rotation)).toBeCloseTo(expected[1], 8)
}

describe('calculateCursorRotation', () => {
  test('points the cursor local +Z out through the hovered wall face', () => {
    expectCursorForward([0, 0], [4, 0], 1, [0, 1])
    expectCursorForward([0, 0], [4, 0], -1, [0, -1])
    expectCursorForward([0, 0], [0, 4], 1, [-1, 0])
    expectCursorForward([0, 0], [0, 4], -1, [1, 0])
  })
})

describe('stripTransient', () => {
  test('removes placement-only metadata flags before commit', () => {
    expect(stripTransient({ isNew: true, isTransient: true, label: 'copy' })).toEqual({
      label: 'copy',
    })
  })
})

describe('getDetachedAttachmentPreviewLift', () => {
  test('raises attach-only item previews while they are detached from their host', () => {
    expect(getDetachedAttachmentPreviewLift('wall')).toBeGreaterThan(0)
    expect(getDetachedAttachmentPreviewLift('wall-side')).toBeGreaterThan(0)
    expect(getDetachedAttachmentPreviewLift('ceiling')).toBeGreaterThan(0)
  })

  test('keeps floor item previews on the floor', () => {
    expect(getDetachedAttachmentPreviewLift(undefined)).toBe(0)
  })
})
