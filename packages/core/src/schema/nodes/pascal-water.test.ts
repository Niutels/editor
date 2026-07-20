import { describe, expect, test } from 'bun:test'
import { PascalWaterNode } from './pascal-water'

describe('PascalWaterNode cliff front paint', () => {
  test('defaults to one color and validates the 1-5 color range', () => {
    const defaults = PascalWaterNode.parse({}).elevationParameters
    expect(defaults.cliffFrontPaintColorCount).toBe(1)
    expect(defaults.cliffFrontPaintColorDistance).toBe(0.45)
    expect(defaults.cliffFrontPaintDensity).toBe(1)
    expect(defaults.cliffFrontPaintSplashHeightRatio).toBe(0.32)
    expect(defaults.cliffFrontPaintSplashWidthRatio).toBe(0.72)
    expect(defaults.cliffFrontPaintSplashVerticalSpreadRatio).toBe(0.24)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffFrontPaintColorCount: 0 } }).success,
    ).toBe(false)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffFrontPaintColorCount: 6 } }).success,
    ).toBe(false)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffFrontPaintColorDistance: 2 } })
        .success,
    ).toBe(true)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffFrontPaintColorDistance: 2.01 } })
        .success,
    ).toBe(false)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffFrontPaintSplashWidthRatio: 1.01 } })
        .success,
    ).toBe(false)
  })
})

describe('PascalWaterNode cliff corner chips', () => {
  test('defaults chips off and validates normalized chip controls', () => {
    const defaults = PascalWaterNode.parse({}).elevationParameters
    expect(defaults.cliffCornerChipAverage).toBe(0)
    expect(defaults.cliffCornerChipDarkening).toBe(0.12)
    expect(defaults.cliffCornerChipDensity).toBe(0)
    expect(defaults.cliffCornerChipAngleAverage).toBe(0.5)
    expect(defaults.cliffCornerChipAngleDensity).toBe(1)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffCornerChipAverage: 1 } }).success,
    ).toBe(true)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffCornerChipAverage: 1.01 } }).success,
    ).toBe(false)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffCornerChipDarkening: 1 } }).success,
    ).toBe(true)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffCornerChipDarkening: -0.01 } })
        .success,
    ).toBe(false)
    expect(
      PascalWaterNode.safeParse({ elevationParameters: { cliffCornerChipAngleAverage: -0.01 } })
        .success,
    ).toBe(false)
  })
})
