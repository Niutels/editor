import { describe, expect, test } from 'bun:test'
import { shouldRefreshShadowBounds, VIEWER_LIGHTING_OWNER, viewerOwnsLighting } from './lights'

describe('viewer light ownership', () => {
  test('owns unclaimed lighting and an explicit viewer claim', () => {
    expect(viewerOwnsLighting(undefined)).toBe(true)
    expect(viewerOwnsLighting(null)).toBe(true)
    expect(viewerOwnsLighting(VIEWER_LIGHTING_OWNER)).toBe(true)
  })

  test('yields every light write to an external presentation owner', () => {
    expect(viewerOwnsLighting('landrush-zombie-night')).toBe(false)
    expect(viewerOwnsLighting({ system: 'external' })).toBe(false)
  })
})

describe('shadow bounds invalidation', () => {
  test('does no subtree work for an unchanged scene', () => {
    expect(shouldRefreshShadowBounds(true, false, 4, 4, 7, 7)).toBe(false)
  })

  test('refreshes for explicit, geometry, and registry changes', () => {
    expect(shouldRefreshShadowBounds(true, true, 4, 4, 7, 7)).toBe(true)
    expect(shouldRefreshShadowBounds(true, false, 5, 4, 7, 7)).toBe(true)
    expect(shouldRefreshShadowBounds(true, false, 4, 4, 8, 7)).toBe(true)
  })

  test('defers dirty bounds work while shadows are disabled', () => {
    expect(shouldRefreshShadowBounds(false, true, 4, 4, 7, 7)).toBe(false)
  })
})
