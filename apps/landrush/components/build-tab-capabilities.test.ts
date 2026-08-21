import { describe, expect, test } from 'bun:test'
import { applyBuildTabCapabilities } from './build-tab'

describe('BuildTab capabilities', () => {
  const types = [
    { id: 'wall' },
    { id: 'painting', mode: 'material-paint' },
    { id: 'terrain', mode: 'terrain-sculpt' },
  ]

  test('keeps the standalone palette unchanged by default', () => {
    expect(applyBuildTabCapabilities(types, { materialPaint: true })).toEqual(types)
  })

  test('removes only material painting for a host without the paint interaction router', () => {
    expect(applyBuildTabCapabilities(types, { materialPaint: false })).toEqual([
      { id: 'wall' },
      { id: 'terrain', mode: 'terrain-sculpt' },
    ])
  })
})
