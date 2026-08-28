import { describe, expect, test } from 'bun:test'
import { createLandrushIdentityCachedSelector } from './landrush-identity-cached-selector'

type StoreState = {
  nodes: Record<string, { blocked: boolean }>
  unrelated: number
}

function createSelectorStore(initialState: StoreState) {
  let state = initialState
  const listeners = new Set<(next: StoreState) => void>()
  return {
    set(next: StoreState) {
      state = next
      for (const listener of listeners) listener(state)
    },
    subscribe<Output>(selector: (current: StoreState) => Output, onChange: () => void) {
      let selected = selector(state)
      const listener = (next: StoreState) => {
        const nextSelected = selector(next)
        if (Object.is(selected, nextSelected)) return
        selected = nextSelected
        onChange()
      }
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

describe('createLandrushIdentityCachedSelector', () => {
  test('skips derivation on irrelevant store notifications', () => {
    const nodes = { door: { blocked: true } }
    const store = createSelectorStore({ nodes, unrelated: 0 })
    let derivations = 0
    let changes = 0
    const selector = createLandrushIdentityCachedSelector({
      derive: (input: StoreState['nodes']) => {
        derivations += 1
        return input.door.blocked
      },
      selectInput: (state: StoreState) => state.nodes,
    })
    store.subscribe(selector, () => {
      changes += 1
    })

    store.set({ nodes, unrelated: 1 })
    store.set({ nodes, unrelated: 2 })

    expect(derivations).toBe(1)
    expect(changes).toBe(0)
  })

  test('retains semantic output identity and wakes once for a real edit', () => {
    const initialNodes = { door: { blocked: true } }
    const store = createSelectorStore({ nodes: initialNodes, unrelated: 0 })
    let changes = 0
    const selector = createLandrushIdentityCachedSelector({
      derive: (nodes: StoreState['nodes']) => ({ blocked: nodes.door.blocked }),
      equals: (previous, next) => previous.blocked === next.blocked,
      selectInput: (state: StoreState) => state.nodes,
    })
    store.subscribe(selector, () => {
      changes += 1
    })

    store.set({ nodes: { door: { blocked: true } }, unrelated: 1 })
    expect(changes).toBe(0)
    store.set({ nodes: { door: { blocked: false } }, unrelated: 1 })
    expect(changes).toBe(1)
  })

  test('keeps selector-instance caches independent', () => {
    const nodes = { door: { blocked: true } }
    let firstDerivations = 0
    let secondDerivations = 0
    const first = createLandrushIdentityCachedSelector({
      derive: (input: StoreState['nodes']) => {
        firstDerivations += 1
        return input.door.blocked
      },
      selectInput: (state: StoreState) => state.nodes,
    })
    const second = createLandrushIdentityCachedSelector({
      derive: (input: StoreState['nodes']) => {
        secondDerivations += 1
        return input.door.blocked
      },
      selectInput: (state: StoreState) => state.nodes,
    })
    const state = { nodes, unrelated: 0 }

    expect(first(state)).toBe(true)
    expect(first(state)).toBe(true)
    expect(second(state)).toBe(true)
    expect(firstDerivations).toBe(1)
    expect(secondDerivations).toBe(1)
  })

  test('does not cache a failed derivation for the same input identity', () => {
    const input = { value: 1 }
    let attempts = 0
    const selector = createLandrushIdentityCachedSelector({
      derive: (current: typeof input) => {
        attempts += 1
        if (attempts === 1) throw new Error('transient')
        return current.value
      },
      selectInput: (state: { input: typeof input }) => state.input,
    })

    expect(() => selector({ input })).toThrow('transient')
    expect(selector({ input })).toBe(1)
    expect(attempts).toBe(2)
  })
})
