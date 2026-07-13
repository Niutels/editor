import { describe, expect, test } from 'bun:test'
import type { BufferGeometry } from 'three'
import {
  createPascalWaterCliffRingGeometry,
  type PascalWaterElevationParameters,
} from './surface-geometry'

const BASE_PARAMETERS: PascalWaterElevationParameters = {
  cliffAverageSlope: 0,
  cliffBandMergeThresholdMeters: 3.6,
  cliffBlockDepthMaxMeters: 2.1,
  cliffBlockDepthMinMeters: 0.5,
  cliffColorAverageRatio: 0.75,
  cliffColorFamilyDistribution: 0,
  cliffColorFamilyVariationCount: 0,
  cliffContrast: 0.41,
  cliffCornerChipAngleAverage: 0.5,
  cliffCornerChipAngleDensity: 1,
  cliffCornerChipAngleDistribution: 0.5,
  cliffCornerChipAngleVariation: 0,
  cliffCornerChipAverage: 0,
  cliffCornerChipDensity: 0,
  cliffCornerChipDistribution: 0.5,
  cliffCornerChipVariation: 0,
  cliffFrontPaintColorCount: 1,
  cliffFrontPaintColorDistance: 0.6,
  cliffFrontPaintDensity: 1,
  cliffFrontPaintSplashHeightRatio: 0.32,
  cliffFrontPaintSplashHeightVariation: 0.14,
  cliffFrontPaintSplashHeightVariationDistribution: 0.55,
  cliffFrontPaintSplashVerticalSpreadRatio: 0.24,
  cliffFrontPaintSplashVerticalSpreadVariation: 0.12,
  cliffFrontPaintSplashVerticalSpreadVariationDistribution: 0.55,
  cliffFrontPaintSplashWidthRatio: 0.72,
  cliffFrontPaintSplashWidthVariation: 0.18,
  cliffFrontPaintSplashWidthVariationDistribution: 0.55,
  cliffLayer1BlockWidthMeters: 4,
  cliffLayer1BlockWidthVariationMeters: 0,
  cliffLayer1BlockWidthVariationDistribution: 0,
  cliffLayer1ExtrusionAverageMeters: 0.95,
  cliffLayer1ExtrusionVariationMeters: 0.28,
  cliffLayer1ExtrusionVariationDistribution: 0,
  cliffLayer2AltitudeRatio: 0.64,
  cliffLayer2AltitudeVariation: 0.14,
  cliffLayer2AltitudeVariationDistribution: 0,
  cliffLayer2BlockWidthMeters: 4.2,
  cliffLayer2BlockWidthVariationMeters: 1.5,
  cliffLayer2BlockWidthVariationDistribution: 0,
  cliffLayer2Density: 0,
  cliffLayer2ExtrusionAverageMeters: 0.95,
  cliffLayer2ExtrusionVariationMeters: 0.28,
  cliffLayer2ExtrusionVariationDistribution: 0,
  cliffLayer3AltitudeRatio: 0.36,
  cliffLayer3AltitudeVariation: 0.12,
  cliffLayer3AltitudeVariationDistribution: 0,
  cliffLayer3BlockWidthMeters: 3.1,
  cliffLayer3BlockWidthVariationMeters: 1.15,
  cliffLayer3BlockWidthVariationDistribution: 0,
  cliffLayer3Density: 0,
  cliffLayer3ExtrusionAverageMeters: 0.95,
  cliffLayer3ExtrusionVariationMeters: 0.28,
  cliffLayer3ExtrusionVariationDistribution: 0,
  cliffSlopeVariation: 0,
  cliffSlopeVariationDistribution: 0,
  cliffToneVariation: 0.35,
  contourNoiseFrequency: 0.08,
  contourVariationMeters: 3.5,
  edgeLiftMeters: 6,
  innerContourMeters: 3.75,
  outerContourMeters: 0,
}

function circlePoints(radius: number, count = 48) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
  })
}

function cliffGeometry(overrides: Partial<PascalWaterElevationParameters> = {}) {
  return createPascalWaterCliffRingGeometry(circlePoints(13), circlePoints(10), 0, 6, {
    ...BASE_PARAMETERS,
    ...overrides,
  })
}

function attributeValues(geometry: BufferGeometry, name: 'color' | 'position') {
  return Array.from(geometry.getAttribute(name).array, (value) => Number(value.toFixed(6)))
}

function uniquePositionStats(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const unique = new Map<string, { radius: number; y: number }>()
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    unique.set(`${x.toFixed(5)}:${y.toFixed(5)}:${z.toFixed(5)}`, {
      radius: Math.hypot(x, z),
      y,
    })
  }
  const values = [...unique.values()]
  return {
    averageRadius: values.reduce((sum, point) => sum + point.radius, 0) / values.length,
    averageY: values.reduce((sum, point) => sum + point.y, 0) / values.length,
  }
}

function uniqueColors(geometry: BufferGeometry) {
  const colors = geometry.getAttribute('color')
  const unique = new Set<string>()
  for (let index = 0; index < colors.count; index += 1) {
    unique.add(
      [colors.getX(index), colors.getY(index), colors.getZ(index)]
        .map((value) => value.toFixed(6))
        .join(':'),
    )
  }
  return unique
}

function novelFrontTriangleCountInRegion(
  geometry: BufferGeometry,
  baselineColors: ReadonlySet<string>,
  minRadius: number,
  maxRadius: number,
  maxHeightRatio: number,
) {
  const colors = geometry.getAttribute('color')
  const normals = geometry.getAttribute('normal')
  const positions = geometry.getAttribute('position')
  let count = 0

  for (let index = 0; index < positions.count; index += 3) {
    const centerX =
      (positions.getX(index) + positions.getX(index + 1) + positions.getX(index + 2)) / 3
    const centerY =
      (positions.getY(index) + positions.getY(index + 1) + positions.getY(index + 2)) / 3
    const centerZ =
      (positions.getZ(index) + positions.getZ(index + 1) + positions.getZ(index + 2)) / 3
    const radius = Math.hypot(centerX, centerZ)
    const radialDot = (normals.getX(index) * centerX + normals.getZ(index) * centerZ) / radius
    if (Math.abs(normals.getY(index)) >= 0.6 || radialDot <= 0.45) continue
    if (radius < minRadius || radius >= maxRadius || centerY / 6 >= maxHeightRatio) continue

    const color = [colors.getX(index), colors.getY(index), colors.getZ(index)]
      .map((value) => value.toFixed(6))
      .join(':')
    if (!baselineColors.has(color)) count += 1
  }

  return count
}

function protectedTriangleSignatures(geometry: BufferGeometry) {
  const colors = geometry.getAttribute('color')
  const normals = geometry.getAttribute('normal')
  const positions = geometry.getAttribute('position')
  const signatures: string[] = []

  for (let index = 0; index < positions.count; index += 3) {
    const centerX =
      (positions.getX(index) + positions.getX(index + 1) + positions.getX(index + 2)) / 3
    const centerZ =
      (positions.getZ(index) + positions.getZ(index + 1) + positions.getZ(index + 2)) / 3
    const centerLength = Math.hypot(centerX, centerZ) || 1
    const normalX = normals.getX(index)
    const normalY = normals.getY(index)
    const normalZ = normals.getZ(index)
    const radialDot = (normalX * centerX + normalZ * centerZ) / centerLength
    const isTop = normalY >= 0.55
    const isTangentialSide = Math.abs(normalY) < 0.55 && Math.abs(radialDot) < 0.45
    if (!(isTop || isTangentialSide)) continue

    const values: number[] = []
    for (let vertex = index; vertex < index + 3; vertex += 1) {
      values.push(
        positions.getX(vertex),
        positions.getY(vertex),
        positions.getZ(vertex),
        colors.getX(vertex),
        colors.getY(vertex),
        colors.getZ(vertex),
      )
    }
    signatures.push(values.map((value) => value.toFixed(5)).join(':'))
  }

  return signatures.sort()
}

describe('Pascal cliff front paint', () => {
  test('keeps the original geometry when painted rock density is zero', () => {
    const singleColor = cliffGeometry()
    const zeroDensity = cliffGeometry({ cliffFrontPaintColorCount: 5, cliffFrontPaintDensity: 0 })

    expect(attributeValues(zeroDensity, 'position')).toEqual(
      attributeValues(singleColor, 'position'),
    )
    expect(attributeValues(zeroDensity, 'color')).toEqual(attributeValues(singleColor, 'color'))

    singleColor.dispose()
    zeroDensity.dispose()
  })

  test('adds organic front color regions without changing tops or side seams', () => {
    const singleColor = cliffGeometry()
    const painted = cliffGeometry({ cliffFrontPaintColorCount: 4 })
    const baselineColors = uniqueColors(singleColor)
    const paintedColors = uniqueColors(painted)

    expect(painted.getAttribute('position').count).toBeGreaterThan(
      singleColor.getAttribute('position').count,
    )
    expect([...paintedColors].some((color) => !baselineColors.has(color))).toBe(true)
    expect(protectedTriangleSignatures(painted)).toEqual(protectedTriangleSignatures(singleColor))

    singleColor.dispose()
    painted.dispose()
  })

  test('keeps paint inside a width-limited splash instead of spanning each rock', () => {
    const narrow = cliffGeometry({
      cliffFrontPaintColorCount: 4,
      cliffFrontPaintSplashHeightVariation: 0,
      cliffFrontPaintSplashVerticalSpreadVariation: 0,
      cliffFrontPaintSplashWidthRatio: 0.22,
      cliffFrontPaintSplashWidthVariation: 0,
    })
    const wide = cliffGeometry({
      cliffFrontPaintColorCount: 4,
      cliffFrontPaintSplashHeightVariation: 0,
      cliffFrontPaintSplashVerticalSpreadVariation: 0,
      cliffFrontPaintSplashWidthRatio: 1,
      cliffFrontPaintSplashWidthVariation: 0,
    })

    expect(narrow.getAttribute('position').count).toBeLessThan(wide.getAttribute('position').count)

    narrow.dispose()
    wide.dispose()
  })

  test('anchors one continuous paint field across all three cliff layers', () => {
    const layerParameters: Partial<PascalWaterElevationParameters> = {
      cliffFrontPaintColorCount: 2,
      cliffFrontPaintColorDistance: 1.2,
      cliffFrontPaintSplashHeightRatio: 0.55,
      cliffFrontPaintSplashHeightVariation: 0,
      cliffFrontPaintSplashVerticalSpreadRatio: 0.25,
      cliffFrontPaintSplashVerticalSpreadVariation: 0,
      cliffFrontPaintSplashWidthRatio: 1,
      cliffFrontPaintSplashWidthVariation: 0,
      cliffLayer2AltitudeVariation: 0,
      cliffLayer2Density: 1,
      cliffLayer3AltitudeVariation: 0,
      cliffLayer3Density: 1,
    }
    const singleColor = cliffGeometry({
      ...layerParameters,
      cliffFrontPaintColorCount: 1,
    })
    const painted = cliffGeometry(layerParameters)
    const baselineColors = uniqueColors(singleColor)

    expect(
      novelFrontTriangleCountInRegion(painted, baselineColors, 10.5, 11.5, 1.1),
    ).toBeGreaterThan(0)
    expect(
      novelFrontTriangleCountInRegion(painted, baselineColors, 11.5, 12.5, 1.1),
    ).toBeGreaterThan(0)
    expect(
      novelFrontTriangleCountInRegion(painted, baselineColors, 12.5, 13.5, 1.1),
    ).toBeGreaterThan(0)

    singleColor.dispose()
    painted.dispose()
  })

  test('continues the dimmest paint band below the visible splash to the rock bottom', () => {
    const layerParameters: Partial<PascalWaterElevationParameters> = {
      cliffFrontPaintColorDistance: 1.2,
      cliffFrontPaintSplashHeightRatio: 0.55,
      cliffFrontPaintSplashHeightVariation: 0,
      cliffFrontPaintSplashVerticalSpreadRatio: 0.25,
      cliffFrontPaintSplashVerticalSpreadVariation: 0,
      cliffFrontPaintSplashWidthRatio: 1,
      cliffFrontPaintSplashWidthVariation: 0,
      cliffLayer1ExtrusionAverageMeters: 0.5,
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer2AltitudeVariation: 0,
      cliffLayer2Density: 1,
      cliffLayer2ExtrusionAverageMeters: 1.5,
      cliffLayer2ExtrusionVariationMeters: 0,
      cliffLayer3Density: 0,
    }
    const singleColor = cliffGeometry(layerParameters)
    const painted = cliffGeometry({
      ...layerParameters,
      cliffFrontPaintColorCount: 2,
    })

    expect(
      novelFrontTriangleCountInRegion(painted, uniqueColors(singleColor), 11.5, 12, 0.12),
    ).toBeGreaterThan(0)

    singleColor.dispose()
    painted.dispose()
  })
})

describe('Pascal cliff rim', () => {
  test('overlaps beneath the plateau and blends grass into the light rock face', () => {
    const geometry = cliffGeometry({
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    })
    const colors = geometry.getAttribute('color')
    const positions = geometry.getAttribute('position')
    let transitionTriangleCount = 0

    for (let index = 0; index < positions.count; index += 3) {
      const radii = [0, 1, 2].map((offset) =>
        Math.hypot(positions.getX(index + offset), positions.getZ(index + offset)),
      )
      const heights = [0, 1, 2].map((offset) => positions.getY(index + offset))
      const overlapsPlateau = radii.some(
        (radius, offset) => radius < 9.9 && (heights[offset] ?? 0) > 5.98,
      )
      const reachesRock = radii.some(
        (radius, offset) => radius > 10.5 && (heights[offset] ?? 0) > 5.75,
      )
      if (!(overlapsPlateau && reachesRock)) continue

      transitionTriangleCount += 1
      const triangleColors = new Set(
        [0, 1, 2].map((offset) =>
          [colors.getX(index + offset), colors.getY(index + offset), colors.getZ(index + offset)]
            .map((value) => value.toFixed(6))
            .join(':'),
        ),
      )
      expect(triangleColors.size).toBeGreaterThan(1)
      for (const offset of [0, 1, 2]) {
        expect(colors.getX(index + offset)).toBeGreaterThan(0.04)
        expect(colors.getY(index + offset)).toBeGreaterThan(0.04)
        expect(colors.getZ(index + offset)).toBeGreaterThan(0.04)
      }
    }

    expect(transitionTriangleCount).toBeGreaterThan(0)
    geometry.dispose()
  })
})

describe('Pascal cliff layer proportions', () => {
  test('omits third-layer rocks deeper than 1.25 times their contour width', () => {
    const noThirdLayer = cliffGeometry({ cliffLayer3Density: 0 })
    const tooNarrow = cliffGeometry({
      cliffLayer3BlockWidthMeters: 0.9,
      cliffLayer3BlockWidthVariationMeters: 0,
      cliffLayer3Density: 1,
      cliffLayer3ExtrusionAverageMeters: 3.5,
      cliffLayer3ExtrusionVariationMeters: 0,
    })
    const wideEnough = cliffGeometry({
      cliffLayer3BlockWidthMeters: 4,
      cliffLayer3BlockWidthVariationMeters: 0,
      cliffLayer3Density: 1,
      cliffLayer3ExtrusionAverageMeters: 3.5,
      cliffLayer3ExtrusionVariationMeters: 0,
    })

    expect(attributeValues(tooNarrow, 'position')).toEqual(
      attributeValues(noThirdLayer, 'position'),
    )
    expect(wideEnough.getAttribute('position').count).toBeGreaterThan(
      noThirdLayer.getAttribute('position').count,
    )

    noThirdLayer.dispose()
    tooNarrow.dispose()
    wideEnough.dispose()
  })
})

describe('Pascal cliff corner chips', () => {
  test('leaves the original geometry untouched when chip density is zero', () => {
    const baseline = cliffGeometry()
    const disabled = cliffGeometry({
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 0,
      cliffCornerChipVariation: 0,
    })

    expect(attributeValues(disabled, 'position')).toEqual(attributeValues(baseline, 'position'))

    baseline.dispose()
    disabled.dispose()
  })

  test('uses chip angle to trade horizontal depth for vertical height', () => {
    const baseline = cliffGeometry({ cliffLayer2Density: 0, cliffLayer3Density: 0 })
    const common = {
      cliffCornerChipAngleDensity: 1,
      cliffCornerChipAngleDistribution: 1,
      cliffCornerChipAngleVariation: 0,
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 1,
      cliffCornerChipDistribution: 1,
      cliffCornerChipVariation: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    }
    const depthBiased = cliffGeometry({ ...common, cliffCornerChipAngleAverage: 0 })
    const heightBiased = cliffGeometry({ ...common, cliffCornerChipAngleAverage: 1 })
    const depthStats = uniquePositionStats(depthBiased)
    const heightStats = uniquePositionStats(heightBiased)

    expect(attributeValues(depthBiased, 'position')).not.toEqual(
      attributeValues(baseline, 'position'),
    )
    expect(attributeValues(heightBiased, 'position')).not.toEqual(
      attributeValues(baseline, 'position'),
    )
    expect(depthStats.averageRadius).toBeLessThan(heightStats.averageRadius)
    expect(heightStats.averageY).toBeLessThan(depthStats.averageY)

    baseline.dispose()
    depthBiased.dispose()
    heightBiased.dispose()
  })
})
