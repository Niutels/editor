import { describe, expect, test } from 'bun:test'
import {
  applyBuildTabCapabilities,
  applyBuildTabStructureKindAllowList,
  isBuildTabVariableStructurePriceKind,
} from './build-tab'

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

  test('keeps the full palette when no structure-kind allow-list is provided', () => {
    const palette = [
      { id: 'wall', kind: 'wall' },
      { id: 'door', kind: 'door' },
      { id: 'roof', kind: 'roof' },
      { id: 'mep' },
      { id: 'terrain', mode: 'terrain-sculpt' },
    ]

    expect(applyBuildTabStructureKindAllowList(palette)).toBe(palette)
  })

  test('exposes exactly wall and door when those are the allowed structure kinds', () => {
    const palette = [
      { id: 'wall', kind: 'wall' },
      { id: 'fence', kind: 'fence' },
      { id: 'door', kind: 'door' },
      { id: 'roof', kind: 'roof' },
      { id: 'mep' },
      { id: 'terrain', mode: 'terrain-sculpt' },
    ]

    expect(applyBuildTabStructureKindAllowList(palette, new Set(['wall', 'door']))).toEqual([
      { id: 'wall', kind: 'wall' },
      { id: 'door', kind: 'door' },
    ])
  })

  test('marks only composite placement tools as minimum-price actions', () => {
    expect(isBuildTabVariableStructurePriceKind('duct-segment')).toBe(true)
    expect(isBuildTabVariableStructurePriceKind('pipe-segment')).toBe(true)
    expect(isBuildTabVariableStructurePriceKind('liquid-line')).toBe(true)
    expect(isBuildTabVariableStructurePriceKind('lean-to-extension')).toBe(false)
    expect(isBuildTabVariableStructurePriceKind('duct-fitting')).toBe(false)
    expect(isBuildTabVariableStructurePriceKind('door')).toBe(false)
    expect(isBuildTabVariableStructurePriceKind(undefined)).toBe(false)
  })
})
