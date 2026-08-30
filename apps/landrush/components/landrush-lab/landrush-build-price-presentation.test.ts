import { describe, expect, test } from 'bun:test'
import {
  canAffordLandrushBuildSelection,
  resolveLandrushBuildMinimumSelectionCost,
  resolveLandrushBuildPricePresentation,
} from './landrush-build-price-presentation'

describe('Landrush build price presentation', () => {
  test('presents the variable wall rate before placement', () => {
    expect(resolveLandrushBuildPricePresentation('wall')).toEqual({
      ariaLabel: 'Price: $10 per meter',
      label: '$10/m',
    })
  })

  test('presents fences as free', () => {
    expect(resolveLandrushBuildPricePresentation('fence')).toEqual({
      ariaLabel: 'Price: $0',
      label: '$0',
    })
  })

  test('presents every ordinary priced construction kind at ten dollars', () => {
    const ordinaryKinds = [
      'block',
      'box-vent',
      'ceiling',
      'chimney',
      'column',
      'cupola',
      'door',
      'dormer',
      'downspout',
      'duct-fitting',
      'duct-segment',
      'duct-terminal',
      'elevator',
      'eyebrow-vent',
      'gutter',
      'hvac-equipment',
      'lean-to-extension',
      'lineset',
      'liquid-line',
      'pipe-fitting',
      'pipe-segment',
      'pipe-trap',
      'ridge-vent',
      'roof',
      'roof-segment',
      'shelf',
      'skylight',
      'slab',
      'solar-panel',
      'spawn',
      'stair',
      'stair-segment',
      'structural-grid',
      'turbine-vent',
      'window',
    ]

    for (const kind of ordinaryKinds) {
      expect(resolveLandrushBuildPricePresentation(kind)).toEqual({
        ariaLabel: 'Price: $10',
        label: '$10',
      })
    }
  })

  test('presents every catalog item at fifty dollars', () => {
    expect(resolveLandrushBuildPricePresentation('item')).toEqual({
      ariaLabel: 'Price: $50',
      label: '$50',
    })
  })

  test('fails closed for modes, groups, unsupported kinds, and absent kinds', () => {
    for (const kind of [
      'painting',
      'terrain',
      'mep',
      'Wall',
      'plugin:unknown',
      '',
      null,
      undefined,
    ]) {
      expect(resolveLandrushBuildPricePresentation(kind)).toBeNull()
    }
  })

  test('resolves the minimum balance required to arm each priced placement kind', () => {
    expect(resolveLandrushBuildMinimumSelectionCost('fence')).toBe(0)
    expect(resolveLandrushBuildMinimumSelectionCost('wall')).toBe(1)
    expect(resolveLandrushBuildMinimumSelectionCost('door')).toBe(10)
    expect(resolveLandrushBuildMinimumSelectionCost('item')).toBe(50)
    expect(resolveLandrushBuildMinimumSelectionCost('duct-segment')).toBe(10)
    expect(resolveLandrushBuildMinimumSelectionCost('plugin:unknown')).toBeNull()
  })

  test('allows projected pending and canonical synced balances at the exact threshold', () => {
    expect(canAffordLandrushBuildSelection('wall', { balance: 1, status: 'pending' })).toBe(true)
    expect(canAffordLandrushBuildSelection('door', { balance: 10, status: 'synced' })).toBe(true)
    expect(canAffordLandrushBuildSelection('item', { balance: 50, status: 'pending' })).toBe(true)
  })

  test('rejects paid selections below their threshold', () => {
    expect(canAffordLandrushBuildSelection('wall', { balance: 0, status: 'synced' })).toBe(false)
    expect(canAffordLandrushBuildSelection('door', { balance: 9, status: 'pending' })).toBe(false)
    expect(canAffordLandrushBuildSelection('item', { balance: 49, status: 'synced' })).toBe(false)
  })

  test('fails closed for paid selections until the profile wallet is usable', () => {
    expect(canAffordLandrushBuildSelection('door', null)).toBe(false)
    expect(canAffordLandrushBuildSelection('door', undefined)).toBe(false)
    expect(canAffordLandrushBuildSelection('door', { balance: 10, status: 'stale' })).toBe(false)
    expect(canAffordLandrushBuildSelection('door', { balance: Number.NaN, status: 'synced' })).toBe(
      false,
    )
  })

  test('keeps fences free while unpriced placement tools fail closed', () => {
    expect(canAffordLandrushBuildSelection('fence', null)).toBe(true)
    expect(canAffordLandrushBuildSelection('fence', { balance: Number.NaN, status: 'stale' })).toBe(
      true,
    )
    expect(canAffordLandrushBuildSelection('duct-segment', null)).toBe(false)
    expect(
      canAffordLandrushBuildSelection('plugin:unknown', { balance: 100, status: 'synced' }),
    ).toBe(false)
  })
})
