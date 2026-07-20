import { describe, expect, test } from 'bun:test'
import { type BufferGeometry, Ray, Vector3 } from 'three'
import {
  createPascalWaterCliffFootprintGeometry,
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
  cliffCornerChipDarkening: 0.12,
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

type NovelUniformTriangle = {
  centerRadius: number
  centerY: number
  normalY: number
  radialDot: number
  triangleIndex: number
  vertices: readonly CliffTestVertex[]
}

type CliffTestVertex = {
  x: number
  y: number
  z: number
}

function novelUniformTriangles(geometry: BufferGeometry, baselineColors: ReadonlySet<string>) {
  const colors = geometry.getAttribute('color')
  const normals = geometry.getAttribute('normal')
  const positions = geometry.getAttribute('position')
  const triangles: NovelUniformTriangle[] = []

  for (let index = 0; index < positions.count; index += 3) {
    const triangleColors = [0, 1, 2].map((offset) =>
      [colors.getX(index + offset), colors.getY(index + offset), colors.getZ(index + offset)]
        .map((value) => value.toFixed(6))
        .join(':'),
    )
    const color = triangleColors[0]
    if (
      !color ||
      triangleColors.some((candidate) => candidate !== color) ||
      baselineColors.has(color)
    ) {
      continue
    }

    const vertices = [0, 1, 2].map((offset) => ({
      x: positions.getX(index + offset),
      y: positions.getY(index + offset),
      z: positions.getZ(index + offset),
    }))
    const centerX = vertices.reduce((sum, vertex) => sum + vertex.x, 0) / 3
    const centerY = vertices.reduce((sum, vertex) => sum + vertex.y, 0) / 3
    const centerZ = vertices.reduce((sum, vertex) => sum + vertex.z, 0) / 3
    const centerRadius = Math.hypot(centerX, centerZ)
    const normalX = normals.getX(index)
    const normalY = normals.getY(index)
    const normalZ = normals.getZ(index)
    triangles.push({
      centerRadius,
      centerY,
      normalY,
      radialDot: (normalX * centerX + normalZ * centerZ) / Math.max(centerRadius, 0.0001),
      triangleIndex: index / 3,
      vertices,
    })
  }

  return triangles
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function chipAxisLengths(triangle: NovelUniformTriangle) {
  const [down, ...upperVertices] = [...triangle.vertices].sort(
    (first, second) => first.y - second.y,
  )
  const firstUpper = upperVertices[0]
  const secondUpper = upperVertices[1]
  if (!(down && firstUpper && secondUpper)) {
    return { depthMeters: 0, edgeMeters: 0, heightMeters: 0 }
  }

  const firstRadius = Math.hypot(firstUpper.x, firstUpper.z)
  const secondRadius = Math.hypot(secondUpper.x, secondUpper.z)
  const inward = firstRadius < secondRadius ? firstUpper : secondUpper
  const along = inward === firstUpper ? secondUpper : firstUpper
  return {
    depthMeters: Math.hypot(inward.x - down.x, inward.z - down.z),
    edgeMeters: Math.hypot(along.x - down.x, along.z - down.z),
    heightMeters: Math.min(inward.y, along.y) - down.y,
  }
}

type CliffTestEdge = {
  end: CliffTestVertex
  maxX: number
  maxY: number
  maxZ: number
  minX: number
  minY: number
  minZ: number
  start: CliffTestVertex
  triangleIndex: number
}

const CHIP_SEAM_STRESS_PARAMETERS = {
  cliffAverageSlope: 0.14,
  cliffCornerChipAngleAverage: 0.5,
  cliffCornerChipAngleDensity: 1,
  cliffCornerChipAngleDistribution: 0.65,
  cliffCornerChipAngleVariation: 0.35,
  cliffCornerChipAverage: 0.35,
  cliffCornerChipDarkening: 1,
  cliffCornerChipDensity: 1,
  cliffCornerChipDistribution: 0.65,
  cliffCornerChipVariation: 0.2,
  cliffFrontPaintDensity: 0,
  cliffLayer1BlockWidthMeters: 2.2,
  cliffLayer1BlockWidthVariationDistribution: 0,
  cliffLayer1BlockWidthVariationMeters: 8,
  cliffLayer1ExtrusionAverageMeters: 1.7,
  cliffLayer1ExtrusionVariationDistribution: 0.1,
  cliffLayer1ExtrusionVariationMeters: 1,
  cliffLayer2AltitudeRatio: 0.69,
  cliffLayer2AltitudeVariation: 0.14,
  cliffLayer2AltitudeVariationDistribution: 0,
  cliffLayer2BlockWidthMeters: 0.9,
  cliffLayer2BlockWidthVariationDistribution: 0,
  cliffLayer2BlockWidthVariationMeters: 4.3,
  cliffLayer2Density: 1,
  cliffLayer2ExtrusionAverageMeters: 1.15,
  cliffLayer2ExtrusionVariationDistribution: 0,
  cliffLayer2ExtrusionVariationMeters: 0.28,
  cliffLayer3AltitudeRatio: 0.36,
  cliffLayer3AltitudeVariation: 0.17,
  cliffLayer3AltitudeVariationDistribution: 1,
  cliffLayer3BlockWidthMeters: 0.9,
  cliffLayer3BlockWidthVariationDistribution: 0,
  cliffLayer3BlockWidthVariationMeters: 1.4,
  cliffLayer3Density: 1,
  cliffLayer3ExtrusionAverageMeters: 0.95,
  cliffLayer3ExtrusionVariationDistribution: 0,
  cliffLayer3ExtrusionVariationMeters: 0.28,
  cliffSlopeVariation: 0.05,
  cliffSlopeVariationDistribution: 0,
} satisfies Partial<PascalWaterElevationParameters>

function cliffChipSeamStressGeometry(overrides: Partial<PascalWaterElevationParameters> = {}) {
  const pointCount = 64
  const inner = Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2
    const radius = 55 + 8 * Math.sin(angle * 3 + 0.3) + 3.36 * Math.sin(angle * 6 - 1.1)
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
  })
  const outer = inner.map((point, index) => {
    const angle = (index / pointCount) * Math.PI * 2
    const radius = Math.hypot(point.x, point.z) + 5
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
  })
  return createPascalWaterCliffRingGeometry(outer, inner, 0, 10.8, {
    ...BASE_PARAMETERS,
    ...CHIP_SEAM_STRESS_PARAMETERS,
    ...overrides,
  })
}

function cliffTestEdges(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const edges: CliffTestEdge[] = []
  for (let index = 0; index < positions.count; index += 3) {
    const vertices = [0, 1, 2].map((offset) => ({
      x: positions.getX(index + offset),
      y: positions.getY(index + offset),
      z: positions.getZ(index + offset),
    }))
    for (const [startIndex, endIndex] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const start = vertices[startIndex]
      const end = vertices[endIndex]
      if (!(start && end)) continue
      edges.push({
        end,
        maxX: Math.max(start.x, end.x),
        maxY: Math.max(start.y, end.y),
        maxZ: Math.max(start.z, end.z),
        minX: Math.min(start.x, end.x),
        minY: Math.min(start.y, end.y),
        minZ: Math.min(start.z, end.z),
        start,
        triangleIndex: index / 3,
      })
    }
  }
  return edges
}

function cliffTestEdgeCovered(
  start: CliffTestVertex,
  end: CliffTestVertex,
  triangleIndex: number,
  edges: readonly CliffTestEdge[],
) {
  const tolerance = 0.002
  const x = end.x - start.x
  const y = end.y - start.y
  const z = end.z - start.z
  const length = Math.hypot(x, y, z)
  if (length <= tolerance) return true
  const directionX = x / length
  const directionY = y / length
  const directionZ = z / length
  const bounds = {
    maxX: Math.max(start.x, end.x) + tolerance,
    maxY: Math.max(start.y, end.y) + tolerance,
    maxZ: Math.max(start.z, end.z) + tolerance,
    minX: Math.min(start.x, end.x) - tolerance,
    minY: Math.min(start.y, end.y) - tolerance,
    minZ: Math.min(start.z, end.z) - tolerance,
  }
  const intervals: [number, number][] = []

  for (const edge of edges) {
    if (
      edge.triangleIndex === triangleIndex ||
      edge.maxX < bounds.minX ||
      edge.minX > bounds.maxX ||
      edge.maxY < bounds.minY ||
      edge.minY > bounds.maxY ||
      edge.maxZ < bounds.minZ ||
      edge.minZ > bounds.maxZ
    ) {
      continue
    }

    const projections: number[] = []
    let collinear = true
    for (const point of [edge.start, edge.end]) {
      const offsetX = point.x - start.x
      const offsetY = point.y - start.y
      const offsetZ = point.z - start.z
      const projection = offsetX * directionX + offsetY * directionY + offsetZ * directionZ
      const perpendicular = Math.hypot(
        offsetX - directionX * projection,
        offsetY - directionY * projection,
        offsetZ - directionZ * projection,
      )
      if (perpendicular > tolerance) {
        collinear = false
        break
      }
      projections.push(projection)
    }
    if (!collinear) continue

    const intervalStart = Math.max(0, Math.min(...projections))
    const intervalEnd = Math.min(length, Math.max(...projections))
    if (intervalEnd - intervalStart > tolerance) {
      intervals.push([intervalStart, intervalEnd])
    }
  }

  intervals.sort((first, second) => first[0] - second[0])
  let coveredUntil = 0
  for (const [intervalStart, intervalEnd] of intervals) {
    if (intervalStart > coveredUntil + tolerance) return false
    coveredUntil = Math.max(coveredUntil, intervalEnd)
    if (coveredUntil >= length - tolerance) return true
  }
  return false
}

function uncoveredCliffTriangleEdgeCount(
  geometry: BufferGeometry,
  triangles: readonly NovelUniformTriangle[],
) {
  const edges = cliffTestEdges(geometry)
  let uncovered = 0
  for (const triangle of triangles) {
    for (let index = 0; index < triangle.vertices.length; index += 1) {
      const start = triangle.vertices[index]
      const end = triangle.vertices[(index + 1) % triangle.vertices.length]
      if (start && end && !cliffTestEdgeCovered(start, end, triangle.triangleIndex, edges)) {
        uncovered += 1
      }
    }
  }
  return uncovered
}

function cliffGeometryBlocksRay(
  geometry: BufferGeometry,
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
) {
  const positions = geometry.getAttribute('position')
  const ray = new Ray(origin, direction)
  const first = new Vector3()
  const second = new Vector3()
  const third = new Vector3()
  const intersection = new Vector3()
  for (let index = 0; index < positions.count; index += 3) {
    first.fromBufferAttribute(positions, index)
    second.fromBufferAttribute(positions, index + 1)
    third.fromBufferAttribute(positions, index + 2)
    const hit = ray.intersectTriangle(first, second, third, true, intersection)
    if (hit && origin.distanceToSquared(hit) <= maxDistance ** 2) return true
  }
  return false
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

describe('Pascal cliff footprint', () => {
  test('preserves the cliff vertex layout when flattening indexed geometry', () => {
    const cliff = cliffGeometry({
      cliffBlockDepthMaxMeters: 0,
      cliffBlockDepthMinMeters: 0,
    })
    const footprint = createPascalWaterCliffFootprintGeometry(cliff)

    expect(Object.keys(footprint.attributes).sort()).toEqual(Object.keys(cliff.attributes).sort())
    expect(footprint.getIndex()?.count).toBe(cliff.getIndex()?.count)
    for (const name of Object.keys(cliff.attributes)) {
      if (name === 'position') continue
      expect(footprint.getAttribute(name)).not.toBe(cliff.getAttribute(name))
      expect(Array.from(footprint.getAttribute(name).array)).toEqual(
        Array.from(cliff.getAttribute(name).array),
      )
    }

    const positions = footprint.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      expect(positions.getY(index)).toBe(0)
    }

    cliff.dispose()
    footprint.dispose()
  })
})

describe('Pascal cliff front paint', () => {
  test('keeps the original geometry when painted rock density is zero', () => {
    const singleColor = cliffGeometry()
    const zeroDensity = cliffGeometry({
      cliffFrontPaintColorCount: 5,
      cliffFrontPaintDensity: 0,
    })

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
    expect(attributeValues(disabled, 'color')).toEqual(attributeValues(baseline, 'color'))

    baseline.dispose()
    disabled.dispose()
  })

  test('scales chip reach with the full width of each rock', () => {
    const common: Partial<PascalWaterElevationParameters> = {
      cliffCornerChipAngleDensity: 0,
      cliffCornerChipDensity: 1,
      cliffCornerChipVariation: 0,
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer1BlockWidthVariationMeters: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    }
    const chipReaches = (widthMeters: number, amount: number) => {
      const parameters = {
        ...common,
        cliffCornerChipAverage: amount,
        cliffLayer1BlockWidthMeters: widthMeters,
      }
      const baseline = cliffGeometry({
        ...parameters,
        cliffCornerChipDensity: 0,
      })
      const chipped = cliffGeometry(parameters)
      const reaches = novelUniformTriangles(chipped, uniqueColors(baseline)).map(
        (triangle) => chipAxisLengths(triangle).edgeMeters,
      )
      baseline.dispose()
      chipped.dispose()
      return reaches
    }

    const narrowFull = chipReaches(0.9, 1)
    const wideHalf = chipReaches(4.2, 0.5)
    const wideFull = chipReaches(4.2, 1)

    expect(narrowFull.length).toBeGreaterThan(0)
    expect(wideHalf.length).toBeGreaterThan(0)
    expect(wideFull).toHaveLength(wideHalf.length)
    expect(average(wideFull)).toBeGreaterThan(average(narrowFull) * 2.5)
    expect(average(wideFull) / average(wideHalf)).toBeGreaterThan(1.85)
    expect(average(wideFull) / average(wideHalf)).toBeLessThan(2.15)
  })

  test('uses equal edge, depth, and height reach for an untilted 45-degree cut', () => {
    const parameters: Partial<PascalWaterElevationParameters> = {
      cliffCornerChipAngleDensity: 0,
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 1,
      cliffCornerChipVariation: 0,
      cliffLayer1BlockWidthMeters: 0.9,
      cliffLayer1BlockWidthVariationMeters: 0,
      cliffLayer1ExtrusionAverageMeters: 1.5,
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    }
    const baseline = cliffGeometry({
      ...parameters,
      cliffCornerChipDensity: 0,
    })
    const chipped = cliffGeometry(parameters)
    const axes = novelUniformTriangles(chipped, uniqueColors(baseline)).map(chipAxisLengths)
    const edgeReach = average(axes.map((axis) => axis.edgeMeters))

    expect(axes.length).toBeGreaterThan(0)
    expect(average(axes.map((axis) => axis.depthMeters)) / edgeReach).toBeGreaterThan(0.9)
    expect(average(axes.map((axis) => axis.depthMeters)) / edgeReach).toBeLessThan(1.1)
    expect(average(axes.map((axis) => axis.heightMeters)) / edgeReach).toBeGreaterThan(0.8)
    expect(average(axes.map((axis) => axis.heightMeters)) / edgeReach).toBeLessThan(1.2)

    baseline.dispose()
    chipped.dispose()
  })

  test('uses the angle controls to tilt cuts in both deterministic directions', () => {
    const common: Partial<PascalWaterElevationParameters> = {
      cliffCornerChipAverage: 0.5,
      cliffCornerChipDensity: 1,
      cliffCornerChipVariation: 0,
      cliffLayer1BlockWidthMeters: 0.9,
      cliffLayer1BlockWidthVariationMeters: 0,
      cliffLayer1ExtrusionAverageMeters: 1.5,
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    }
    const baseline = cliffGeometry({ ...common, cliffCornerChipDensity: 0 })
    const neutral = cliffGeometry({
      ...common,
      cliffCornerChipAngleDensity: 0,
    })
    const angled = cliffGeometry({
      ...common,
      cliffCornerChipAngleAverage: 1,
      cliffCornerChipAngleDensity: 1,
      cliffCornerChipAngleDistribution: 1,
      cliffCornerChipAngleVariation: 0,
    })
    const cuts = novelUniformTriangles(angled, uniqueColors(baseline))

    expect(attributeValues(angled, 'position')).not.toEqual(attributeValues(neutral, 'position'))
    expect(cuts.some((cut) => cut.normalY > cut.radialDot * 1.4)).toBe(true)
    expect(cuts.some((cut) => cut.radialDot > cut.normalY * 1.4)).toBe(true)

    baseline.dispose()
    neutral.dispose()
    angled.dispose()
  })

  test('uses maximum variability without saturating high average chip sizes', () => {
    const common: Partial<PascalWaterElevationParameters> = {
      cliffCornerChipAngleDensity: 0,
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 1,
      cliffCornerChipDistribution: 1,
      cliffLayer1BlockWidthMeters: 0.9,
      cliffLayer1BlockWidthVariationMeters: 0,
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    }
    const baseline = cliffGeometry({ ...common, cliffCornerChipDensity: 0 })
    const uniform = cliffGeometry({ ...common, cliffCornerChipVariation: 0 })
    const varied = cliffGeometry({ ...common, cliffCornerChipVariation: 1 })
    const baselineColors = uniqueColors(baseline)
    const uniformEdgeReach = novelUniformTriangles(uniform, baselineColors).map(
      (triangle) => chipAxisLengths(triangle).edgeMeters,
    )
    const variedEdgeReach = novelUniformTriangles(varied, baselineColors).map(
      (triangle) => chipAxisLengths(triangle).edgeMeters,
    )

    expect(variedEdgeReach).toHaveLength(uniformEdgeReach.length)
    expect(average(variedEdgeReach)).toBeLessThan(average(uniformEdgeReach) * 0.8)
    expect(Math.max(...variedEdgeReach) - Math.min(...variedEdgeReach)).toBeGreaterThan(
      Math.max(...uniformEdgeReach) - Math.min(...uniformEdgeReach) + 0.2,
    )

    baseline.dispose()
    uniform.dispose()
    varied.dispose()
  })

  test('gives exposed chip faces a darker tone than the untouched rock surface', () => {
    const baseline = cliffGeometry({
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    })
    const chipped = cliffGeometry({
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 1,
      cliffCornerChipVariation: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    })
    const baselineColors = uniqueColors(baseline)
    const chippedColors = uniqueColors(chipped)

    expect([...chippedColors].some((color) => !baselineColors.has(color))).toBe(true)
    expect(chippedColors.size).toBeGreaterThan(baselineColors.size)

    baseline.dispose()
    chipped.dispose()
  })

  test('keeps maximum chip darkening above black without changing chip geometry', () => {
    const parameters: Partial<PascalWaterElevationParameters> = {
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 1,
      cliffCornerChipVariation: 0,
      cliffLayer2Density: 0,
      cliffLayer3Density: 0,
    }
    const light = cliffGeometry({ ...parameters, cliffCornerChipDarkening: 0 })
    const dark = cliffGeometry({ ...parameters, cliffCornerChipDarkening: 1 })
    const lightColors = light.getAttribute('color')
    const darkColors = dark.getAttribute('color')
    let darkestChangedChannel = 1
    let darkerChannelCount = 0

    expect(attributeValues(dark, 'position')).toEqual(attributeValues(light, 'position'))
    for (let index = 0; index < lightColors.count; index += 1) {
      for (const channel of ['X', 'Y', 'Z'] as const) {
        const lightValue = lightColors[`get${channel}`](index)
        const darkValue = darkColors[`get${channel}`](index)
        expect(darkValue).toBeLessThanOrEqual(lightValue + 0.000001)
        if (darkValue < lightValue - 0.000001) {
          darkestChangedChannel = Math.min(darkestChangedChannel, darkValue)
          darkerChannelCount += 1
        }
      }
    }
    expect(darkerChannelCount).toBeGreaterThan(0)
    expect(darkestChangedChannel).toBeGreaterThan(0.03)

    light.dispose()
    dark.dispose()
  })

  test('cuts both ocean-facing top corners on one-span second- and third-layer blocks', () => {
    const parameters: Partial<PascalWaterElevationParameters> = {
      cliffAverageSlope: 0.14,
      cliffCornerChipAngleAverage: 0,
      cliffCornerChipAngleDensity: 1,
      cliffCornerChipAngleVariation: 0,
      cliffCornerChipAverage: 1,
      cliffCornerChipDensity: 1,
      cliffCornerChipVariation: 0,
      cliffLayer1BlockWidthMeters: 2.2,
      cliffLayer1BlockWidthVariationMeters: 0,
      cliffLayer1ExtrusionAverageMeters: 1.7,
      cliffLayer1ExtrusionVariationMeters: 0,
      cliffLayer2AltitudeRatio: 0.69,
      cliffLayer2AltitudeVariation: 0,
      cliffLayer2BlockWidthMeters: 0.9,
      cliffLayer2BlockWidthVariationMeters: 0,
      cliffLayer2Density: 1,
      cliffLayer2ExtrusionAverageMeters: 1.15,
      cliffLayer2ExtrusionVariationMeters: 0,
      cliffLayer3AltitudeRatio: 0.36,
      cliffLayer3AltitudeVariation: 0,
      cliffLayer3BlockWidthMeters: 0.9,
      cliffLayer3BlockWidthVariationMeters: 0,
      cliffLayer3Density: 1,
      cliffLayer3ExtrusionAverageMeters: 0.95,
      cliffLayer3ExtrusionVariationMeters: 0,
    }
    const baseline = cliffGeometry({
      ...parameters,
      cliffCornerChipDensity: 0,
    })
    const chipped = cliffGeometry(parameters)
    const baselineColors = uniqueColors(baseline)
    const cuts = novelUniformTriangles(chipped, baselineColors)
    const secondLayerCuts = cuts.filter((cut) => cut.centerY >= 3.5 && cut.centerY < 4.3)
    const thirdLayerCuts = cuts.filter((cut) => cut.centerY >= 1.5 && cut.centerY < 2.4)

    expect(secondLayerCuts).toHaveLength(48 * 2)
    expect(thirdLayerCuts).toHaveLength(48 * 2)
    expect(
      secondLayerCuts.every(
        (cut) => cut.centerRadius > 11.5 && cut.radialDot > 0.15 && cut.normalY > 0.1,
      ),
    ).toBe(true)
    expect(
      thirdLayerCuts.every(
        (cut) => cut.centerRadius > 13 && cut.radialDot > 0.15 && cut.normalY > 0.1,
      ),
    ).toBe(true)

    baseline.dispose()
    chipped.dispose()
  })

  test('seals every chip edge against the front, cap, or neighboring-column seam', () => {
    const baseline = cliffChipSeamStressGeometry({ cliffCornerChipDensity: 0 })
    const chipped = cliffChipSeamStressGeometry()
    const cuts = novelUniformTriangles(chipped, uniqueColors(baseline))

    expect(cuts.length).toBeGreaterThan(0)
    expect(uncoveredCliffTriangleEdgeCount(chipped, cuts)).toBe(0)

    baseline.dispose()
    chipped.dispose()
  })

  test('blocks the deterministic ocean-facing ray exposed by a crossing chipped seam', () => {
    const baseline = cliffChipSeamStressGeometry({ cliffCornerChipDensity: 0 })
    const chipped = cliffChipSeamStressGeometry()
    const angle = ((932 + 0.37) / 2048) * Math.PI * 2
    const height = -0.78 + ((63 + 0.37) / 80) * 11.42
    const origin = new Vector3(Math.cos(angle) * 105, height, Math.sin(angle) * 105)
    const direction = new Vector3(-Math.cos(angle), 0, -Math.sin(angle))

    expect(cliffGeometryBlocksRay(baseline, origin, direction, 70)).toBe(true)
    expect(cliffGeometryBlocksRay(chipped, origin, direction, 70)).toBe(true)

    baseline.dispose()
    chipped.dispose()
  })
})
