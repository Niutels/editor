import { describe, expect, test } from 'bun:test'
import { createPlacementCommitGuard } from './placement-commit-guard'

const pointer = (
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
  timeStamp: 1_000,
  ...overrides,
})

describe('placement commit guard', () => {
  test('does not commit when hover is followed by a release without a placement-surface press', () => {
    const guard = createPlacementCommitGuard()
    expect(guard.consume(pointer({ timeStamp: 1_050 }))).toBe(false)
  })

  test('commits one matching click gesture', () => {
    const guard = createPlacementCommitGuard()
    guard.arm(pointer())
    expect(guard.consume(pointer({ clientX: 123, clientY: 83, timeStamp: 1_090 }))).toBe(true)
    expect(guard.consume(pointer({ timeStamp: 1_100 }))).toBe(false)
  })

  test('rejects moved, stale, and mismatched-pointer releases', () => {
    const guard = createPlacementCommitGuard()

    guard.arm(pointer())
    expect(guard.consume(pointer({ clientX: 132, timeStamp: 1_050 }))).toBe(false)

    guard.arm(pointer())
    expect(guard.consume(pointer({ timeStamp: 2_001 }))).toBe(false)

    guard.arm(pointer())
    expect(guard.consume(pointer({ pointerId: 8, timeStamp: 1_050 }))).toBe(false)
  })
})
