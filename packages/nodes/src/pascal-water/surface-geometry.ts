import { BufferGeometry, Float32BufferAttribute, Path, Shape, Vector2 } from 'three'
import type { PascalWaterPoint2 } from './water-field'

export const PASCAL_WATER_LOW_ELEVATION = -0.04
export const PASCAL_WATER_SAND_ELEVATION = -0.1

export type PascalWaterElevationParameters = {
  cliffBandMergeThresholdMeters: number
  cliffBlockDepthMaxMeters: number
  cliffBlockDepthMinMeters: number
  cliffColorAverageRatio: number
  cliffContrast: number
  cliffToneVariation: number
  contourNoiseFrequency: number
  contourVariationMeters: number
  edgeLiftMeters: number
  innerContourMeters: number
  outerContourMeters: number
}

export type PascalWaterLandSurface = {
  grassSurfaceElevation: number
  grassSurfacePoints: readonly PascalWaterPoint2[]
  hasElevation: boolean
  plateauElevation: number
  plateauPoints: readonly PascalWaterPoint2[]
  shorelinePoints: readonly PascalWaterPoint2[]
  slopeStartPoints: readonly PascalWaterPoint2[]
  waterPlaneSize: number
}

type CliffColor = [number, number, number]
type CliffVertex = {
  x: number
  y: number
  z: number
}

export function createPascalWaterLandSurface({
  elevationParameters,
  shorelinePoints,
  waterPlaneSize,
}: {
  elevationParameters: PascalWaterElevationParameters
  shorelinePoints: readonly PascalWaterPoint2[]
  waterPlaneSize: number
}): PascalWaterLandSurface {
  const elevationContours = createElevationContours(shorelinePoints, elevationParameters)
  const slopeStartPoints = elevationContours.outer
  const plateauPoints = elevationContours.inner
  const plateauElevation = PASCAL_WATER_LOW_ELEVATION + elevationParameters.edgeLiftMeters
  const hasElevation =
    elevationParameters.edgeLiftMeters > 0.001 &&
    elevationParameters.innerContourMeters - elevationParameters.outerContourMeters > 0.001
  const grassSurfacePoints = hasElevation ? plateauPoints : shorelinePoints
  const grassSurfaceElevation = hasElevation ? plateauElevation : PASCAL_WATER_LOW_ELEVATION + 0.02

  return {
    grassSurfaceElevation,
    grassSurfacePoints,
    hasElevation,
    plateauElevation,
    plateauPoints,
    shorelinePoints,
    slopeStartPoints,
    waterPlaneSize,
  }
}

export function shapeFromPoints(points: readonly PascalWaterPoint2[]) {
  const shape = new Shape()
  const first = points[0]
  if (!first) return shape
  shape.moveTo(first.x, -first.z)
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (point) shape.lineTo(point.x, -point.z)
  }
  shape.closePath()
  return shape
}

export function waterShapeWithHole(holePoints: readonly PascalWaterPoint2[], planeSize: number) {
  const half = planeSize / 2
  const shape = new Shape()
  shape.moveTo(-half, -half)
  shape.lineTo(half, -half)
  shape.lineTo(half, half)
  shape.lineTo(-half, half)
  shape.closePath()

  if (holePoints.length < 3) return shape

  const hole = holePoints.map((point) => new Vector2(point.x, -point.z))
  const orientedHole = signedArea2(hole) > 0 ? [...hole].reverse() : hole
  const holePath = new Path()
  const first = orientedHole[0]
  if (!first) return shape

  holePath.moveTo(first.x, first.y)
  for (let index = 1; index < orientedHole.length; index += 1) {
    const point = orientedHole[index]
    if (point) holePath.lineTo(point.x, point.y)
  }
  holePath.closePath()
  shape.holes.push(holePath)
  return shape
}

export function createPascalWaterBounds(size: number) {
  const half = size / 2
  return {
    depth: size,
    maxX: half,
    maxZ: half,
    minX: -half,
    minZ: -half,
    width: size,
  }
}

export function createPascalWaterCliffRingGeometry(
  outerPoints: readonly PascalWaterPoint2[],
  innerPoints: readonly PascalWaterPoint2[],
  outerElevation: number,
  innerElevation: number,
  parameters: PascalWaterElevationParameters,
) {
  const geometry = new BufferGeometry()
  const pointCount = Math.min(openRing(outerPoints).length, openRing(innerPoints).length)
  if (pointCount < 3) return geometry

  const outer = openRing(outerPoints)
  const inner = openRing(innerPoints)
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  const averageTone = averageCliffRingTone(pointCount, parameters)

  for (let index = 0; index < pointCount; index += 1) {
    const nextIndex = (index + 1) % pointCount
    const outerA = outer[index]
    const outerB = outer[nextIndex]
    const innerA = inner[index]
    const innerB = inner[nextIndex]
    if (!(outerA && outerB && innerA && innerB)) continue

    const segmentTone = mixColor(
      cliffRockTone(index * 17.71 + pointCount * 0.37, parameters),
      averageTone,
      clamp01(parameters.cliffColorAverageRatio),
    )
    const faceTone = scaleColor(segmentTone, 0.66 + parameters.cliffContrast * 0.08)
    addColoredQuad(
      positions,
      colors,
      indices,
      normals,
      [
        pointToCliffVertex(outerA, outerElevation),
        pointToCliffVertex(outerB, outerElevation),
        pointToCliffVertex(innerB, innerElevation),
        pointToCliffVertex(innerA, innerElevation),
      ],
      faceTone,
    )
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  return geometry
}

export function lineLoopGeometryFromPoints(points: readonly PascalWaterPoint2[]) {
  const geometry = new BufferGeometry()
  const closedPointCount = points.length + 1
  const positions = new Float32Array(closedPointCount * 3)
  for (let index = 0; index < closedPointCount; index += 1) {
    const point = points[index % points.length]
    if (!point) continue
    positions[index * 3] = point.x
    positions[index * 3 + 1] = 0.16
    positions[index * 3 + 2] = point.z
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function createElevationContours(
  points: readonly PascalWaterPoint2[],
  parameters: PascalWaterElevationParameters,
) {
  if (points.length < 3) return { inner: [...points], outer: [...points] }
  const center = centerForPoints(points)
  const outerBase = Math.max(0, parameters.outerContourMeters)
  const innerBase = Math.max(outerBase + 0.5, parameters.innerContourMeters)
  const variation = Math.max(0, parameters.contourVariationMeters)
  const frequency = Math.max(0.001, parameters.contourNoiseFrequency)
  const outer: PascalWaterPoint2[] = []
  const inner: PascalWaterPoint2[] = []

  for (const point of points) {
    const dx = center.x - point.x
    const dz = center.z - point.z
    const distanceToCenter = Math.hypot(dx, dz) || 1
    const angle = Math.atan2(point.z - center.z, point.x - center.x)
    const outerNoise = elevationContourNoise(point, angle, frequency, 15.9)
    const innerNoise = elevationContourNoise(point, angle, frequency, 43.7)
    const outerInset = clampRange(
      outerBase + outerNoise * variation * 0.5,
      0,
      distanceToCenter * 0.82,
    )
    const innerInset = clampRange(
      innerBase + innerNoise * variation,
      outerInset + 0.75,
      distanceToCenter * 0.94,
    )

    outer.push(insetPoint(point, dx, dz, distanceToCenter, outerInset))
    inner.push(insetPoint(point, dx, dz, distanceToCenter, innerInset))
  }

  return { inner, outer }
}

function insetPoint(
  point: PascalWaterPoint2,
  dx: number,
  dz: number,
  length: number,
  inset: number,
) {
  return {
    x: point.x + (dx / length) * inset,
    z: point.z + (dz / length) * inset,
  }
}

function elevationContourNoise(
  point: PascalWaterPoint2,
  angle: number,
  frequency: number,
  seed: number,
) {
  const primary = fbm(point.x * frequency, point.z * frequency, seed) * 2 - 1
  const secondary =
    fbm((point.x + 73) * frequency * 2.15, (point.z - 41) * frequency * 2.15, seed + 19.4) * 2 - 1
  const lobe =
    Math.sin(angle * 3.2 + seed * 0.11) * 0.32 + Math.sin(angle * 6.7 - seed * 0.07) * 0.18
  const pocket = smoothstep(0.4, 1, Math.sin(angle * 5.1 + seed * 0.2) * 0.5 + 0.5)

  return primary * 0.52 + secondary * 0.26 + lobe - pocket * 0.18
}

function pointToCliffVertex(point: PascalWaterPoint2, y: number): CliffVertex {
  return {
    x: point.x,
    y,
    z: point.z,
  }
}

function addColoredQuad(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  vertices: readonly [CliffVertex, CliffVertex, CliffVertex, CliffVertex],
  color: CliffColor,
) {
  const baseIndex = positions.length / 3
  const normal = normalForQuad(vertices)
  for (const vertex of vertices) {
    positions.push(vertex.x, vertex.y, vertex.z)
    colors.push(color[0], color[1], color[2])
    normals.push(normal.x, normal.y, normal.z)
  }
  indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
}

function normalForQuad(vertices: readonly [CliffVertex, CliffVertex, CliffVertex, CliffVertex]) {
  const [first, second, third, fourth] = vertices
  const firstNormal = cross3(subtract3(second, first), subtract3(third, first))
  const secondNormal = cross3(subtract3(third, first), subtract3(fourth, first))
  const normal = {
    x: firstNormal.x + secondNormal.x,
    y: firstNormal.y + secondNormal.y,
    z: firstNormal.z + secondNormal.z,
  }
  const length = Math.hypot(normal.x, normal.y, normal.z)

  if (length <= 0.000001) {
    return { x: 0, y: 1, z: 0 }
  }

  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function signedArea2(points: readonly Vector2[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue
    area += current.x * next.y - next.x * current.y
  }
  return area * 0.5
}

function centerForPoints(points: readonly PascalWaterPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function openRing(points: readonly PascalWaterPoint2[]) {
  if (points.length < 2) return [...points]
  const first = points[0]!
  const last = points[points.length - 1]!
  if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.001) return points.slice(0, -1)
  return [...points]
}

function cliffRockTone(seed: number, parameters: PascalWaterElevationParameters): CliffColor {
  const palette: readonly CliffColor[] = [
    [0.5, 0.35, 0.2],
    [0.38, 0.29, 0.2],
    [0.58, 0.48, 0.29],
    [0.33, 0.33, 0.3],
    [0.25, 0.18, 0.12],
    [0.47, 0.4, 0.31],
  ]
  const baseIndex = Math.floor(hashUnit(seed, 3.7) * palette.length) % palette.length
  const nextIndex = Math.floor(hashUnit(seed, 7.9) * palette.length) % palette.length
  const fallback: CliffColor = [0.5, 0.35, 0.2]
  const base = palette[baseIndex] ?? fallback
  const secondary = palette[nextIndex] ?? fallback
  const tone = mixColor(
    base,
    secondary,
    hashUnit(seed, 13.4) * parameters.cliffToneVariation * 0.28,
  )
  const brightness =
    0.78 +
    hashUnit(seed, 19.1) * parameters.cliffToneVariation * 0.34 +
    (hashUnit(seed, 23.8) - 0.5) * parameters.cliffContrast * 0.24

  return scaleColor(tone, brightness)
}

function averageCliffRingTone(
  segmentCount: number,
  parameters: PascalWaterElevationParameters,
): CliffColor {
  if (segmentCount <= 0) {
    return [0.5, 0.35, 0.2]
  }

  let red = 0
  let green = 0
  let blue = 0

  for (let index = 0; index < segmentCount; index += 1) {
    const tone = cliffRockTone(index * 17.71 + segmentCount * 0.37, parameters)
    red += tone[0]
    green += tone[1]
    blue += tone[2]
  }

  return [red / segmentCount, green / segmentCount, blue / segmentCount]
}

function subtract3(a: CliffVertex, b: CliffVertex) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

function cross3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 0.000001)))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function fbm(x: number, y: number, seed: number) {
  let value = 0
  let amplitude = 0.55
  let frequency = 1

  for (let index = 0; index < 4; index += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + index * 17.17) * amplitude
    frequency *= 2.04
    amplitude *= 0.5
  }

  return value
}

function valueNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return lerp(
    lerp(gridHash(ix, iy, seed), gridHash(ix + 1, iy, seed), ux),
    lerp(gridHash(ix, iy + 1, seed), gridHash(ix + 1, iy + 1, seed), ux),
    uy,
  )
}

function hashUnit(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function gridHash(x: number, y: number, seed: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mixColor(a: CliffColor, b: CliffColor, t: number): CliffColor {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function scaleColor(color: CliffColor, scale: number): CliffColor {
  return [
    clampRange(color[0] * scale, 0, 1),
    clampRange(color[1] * scale, 0, 1),
    clampRange(color[2] * scale, 0, 1),
  ]
}
