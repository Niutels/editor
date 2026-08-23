// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { createViewerPointerEvents } from './viewer-pointer-events'

function createHarness() {
  let setCount = 0
  let state: any
  const store = {
    getState: () => state,
  }
  const manager = createViewerPointerEvents(store as never)
  state = {
    events: manager,
    internal: { lastEvent: { current: null } },
    set(update: (current: any) => Partial<typeof state>) {
      setCount += 1
      state = { ...state, ...update(state) }
    },
  }
  const added: string[] = []
  const target = {
    addEventListener(name: string) {
      added.push(name)
    },
    removeEventListener() {},
  } as unknown as HTMLElement

  return {
    added,
    connect: manager.connect,
    getSetCount: () => setCount,
    getState: () => state,
    manager,
    target,
  }
}

describe('viewer pointer events', () => {
  test('ignores only a detached null event target', () => {
    const harness = createHarness()

    expect(() => harness.connect?.(null as never)).not.toThrow()
    expect(harness.getSetCount()).toBe(0)
    expect(harness.added).toEqual([])
  })

  test('delegates a mounted target to the default R3F manager', () => {
    const harness = createHarness()

    harness.connect?.(harness.target)

    expect(harness.getSetCount()).toBe(1)
    expect(harness.getState().events.connected).toBe(harness.target)
    expect(harness.added).toHaveLength(Object.keys(harness.manager.handlers ?? {}).length)
    expect(harness.manager.enabled).toBe(true)
    expect(harness.manager.priority).toBe(1)
  })

  test('connects normally after a stale null attempt', () => {
    const harness = createHarness()

    harness.connect?.(null as never)
    harness.connect?.(harness.target)

    expect(harness.getSetCount()).toBe(1)
    expect(harness.getState().events.connected).toBe(harness.target)
  })
})
