import { describe, expect, test } from 'bun:test'
import {
  createLandrushDestroyedFurnitureExclusionSignature,
  reconcileLandrushDestroyedFurnitureIds,
} from './landrush-destroyed-furniture-collider-state'

describe('destroyed furniture collider state', () => {
  test('preserves state identity when the destroyed node set is semantically unchanged', () => {
    const current = new Set(['chair', 'table'])

    expect(reconcileLandrushDestroyedFurnitureIds(current, new Set(['table', 'chair']))).toBe(
      current,
    )
  })

  test('snapshots changed input sets instead of retaining a mutable simulation set', () => {
    const current = new Set(['chair'])
    const next = new Set(['table'])
    const reconciled = reconcileLandrushDestroyedFurnitureIds(current, next)

    expect(reconciled).not.toBe(current)
    expect(reconciled).not.toBe(next)
    expect([...reconciled]).toEqual(['table'])

    next.add('lamp')
    expect([...reconciled]).toEqual(['table'])
  })

  test('creates a deterministic rebuild signature and resets cleanly', () => {
    expect(createLandrushDestroyedFurnitureExclusionSignature(new Set(['table', 'chair']))).toBe(
      '["chair","table"]',
    )
    expect(createLandrushDestroyedFurnitureExclusionSignature(new Set())).toBe('[]')
  })
})
