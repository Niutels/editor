import { describe, expect, test } from 'bun:test'
import { createLandrushIslandFishRuntime } from './landrush-island-fish-runtime'

describe('Landrush island fish runtime', () => {
  test('updates every registered batch through one deterministic frame path', () => {
    const runtime = createLandrushIslandFishRuntime()
    const calls: string[] = []
    const disposeFirst = runtime.register({
      id: 'first',
      instanceCount: 120,
      update: (timeSeconds, waterY, phase, phaseCount) =>
        calls.push(`first:${timeSeconds}:${waterY}:${phase}:${phaseCount}`),
    })
    runtime.register({
      id: 'second',
      instanceCount: 80,
      update: (timeSeconds, waterY, phase, phaseCount) =>
        calls.push(`second:${timeSeconds}:${waterY}:${phase}:${phaseCount}`),
    })

    expect(runtime.snapshot()).toEqual({ batchCount: 2, instanceCount: 200, updatePhaseCount: 2 })
    runtime.advance(4.5, 1.25)
    runtime.advance(5, 1.5)
    expect(calls).toEqual([
      'first:4.5:1.25:0:2',
      'second:4.5:1.25:0:2',
      'first:5:1.5:1:2',
      'second:5:1.5:1:2',
    ])

    disposeFirst()
    disposeFirst()
    expect(runtime.snapshot()).toEqual({ batchCount: 1, instanceCount: 80, updatePhaseCount: 2 })
    runtime.advance(8, 2)
    expect(calls.at(-1)).toBe('second:8:2:0:2')
  })

  test('rejects duplicate batch identities', () => {
    const runtime = createLandrushIslandFishRuntime()
    runtime.register({ id: 'school', instanceCount: 1, update: () => {} })
    expect(() => runtime.register({ id: 'school', instanceCount: 1, update: () => {} })).toThrow(
      'Fish batch school is already registered.',
    )
  })
})
