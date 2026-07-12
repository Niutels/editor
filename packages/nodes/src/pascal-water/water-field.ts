import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGBAFormat } from 'three'

export const PASCAL_WATER_FIELD_RESOLUTION = 1024
const BRUNO_DEPTH_FIELD_SCALE = 6.4
const TAU = Math.PI * 2

export type PascalWaterPoint2 = {
  x: number
  z: number
}

export type PascalWaterFieldParameters = {
  depthContourCollapseMeters: number
  depthContourCollapseScale: number
  depthContourNoiseFrequency: number
  depthContourOffsetMeters: number
  depthContourVariationMeters: number
  depthExponent: number
  depthNoiseFrequency: number
  depthNoiseStrength: number
  depthReach: number
  edgeFadeDistance: number
  shoreBandMeters: number
  shoreFeatherMeters: number
  shoreNoiseFrequency: number
  shoreVariationMeters: number
}

export const PASCAL_WATER_FIELD_DEFAULT_PARAMETERS = {
  depthContourCollapseMeters: 10.3,
  depthContourCollapseScale: 1.25,
  depthContourNoiseFrequency: 0.1,
  depthContourOffsetMeters: 2.6,
  depthContourVariationMeters: 8.6,
  depthExponent: 0.52,
  depthNoiseFrequency: 0.03,
  depthNoiseStrength: 0,
  depthReach: 15,
  edgeFadeDistance: 18,
  shoreBandMeters: 0,
  shoreFeatherMeters: 0.45,
  shoreNoiseFrequency: 0.075,
  shoreVariationMeters: 0.85,
} satisfies PascalWaterFieldParameters

export const PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH = 70

const WATER_FIELD_DEPTH_DISTANCE_MAX_METERS =
  PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH * BRUNO_DEPTH_FIELD_SCALE
const WATER_FIELD_DEPTH_EXACT_DISTANCE_METERS =
  PASCAL_WATER_FIELD_DEFAULT_PARAMETERS.depthReach * BRUNO_DEPTH_FIELD_SCALE

type WaterFieldOptions = {
  interiorDepthIsDeep?: boolean
  parameters?: Partial<PascalWaterFieldParameters>
  perimeter: readonly PascalWaterPoint2[]
  planeSize: number
  resolution?: number
}

export type PascalWaterFieldTextureData = {
  data: Uint8Array
  height: number
  width: number
}

export function createPascalWaterFieldTextureData({
  interiorDepthIsDeep = true,
  parameters,
  perimeter,
  planeSize,
  resolution = PASCAL_WATER_FIELD_RESOLUTION,
}: WaterFieldOptions): PascalWaterFieldTextureData {
  const params = { ...PASCAL_WATER_FIELD_DEFAULT_PARAMETERS, ...parameters }
  const textureResolution = clampResolution(resolution)
  const data = new Uint8Array(textureResolution * textureResolution * 4)
  const half = planeSize / 2
  const openPerimeter = openRing(perimeter)
  const perimeterBounds = boundsFor(openPerimeter)
  const depthPerimeter = createPascalWaterDepthReferencePerimeter(openPerimeter, params)
  const depthBounds = boundsFor(depthPerimeter)
  const depthCenter = centerFor(depthPerimeter)
  const depthRadius = averageRadiusFor(depthPerimeter, depthCenter)
  const shoreUsefulDistance = Math.max(
    1,
    params.shoreBandMeters + params.shoreFeatherMeters + params.shoreVariationMeters * 0.5,
  )
  const depthExactDistance = Math.min(
    WATER_FIELD_DEPTH_DISTANCE_MAX_METERS,
    Math.max(WATER_FIELD_DEPTH_EXACT_DISTANCE_METERS, shoreUsefulDistance),
  )
  const distanceIndex = createDistanceIndex(openPerimeter, shoreUsefulDistance)
  const depthDistanceIndex = createDistanceIndex(depthPerimeter, depthExactDistance)

  for (let y = 0; y < textureResolution; y += 1) {
    for (let x = 0; x < textureResolution; x += 1) {
      const world = {
        x: (x / (textureResolution - 1) - 0.5) * planeSize,
        z: (y / (textureResolution - 1) - 0.5) * planeSize,
      }
      const index = (y * textureResolution + x) * 4
      const boundsDistance = distanceToBounds(world, perimeterBounds)
      const depthBoundsDistance = distanceToBounds(world, depthBounds)
      const outsideUsefulDistance = boundsDistance > shoreUsefulDistance
      const outsideDepthUsefulDistance = depthBoundsDistance > depthExactDistance
      const inside = boundsDistance > 0 ? false : pointInPolygon(world, openPerimeter)
      const shoreDistance = outsideUsefulDistance
        ? shoreUsefulDistance
        : distanceToIndexedPolyline(world, distanceIndex)
      const depthDistance = outsideDepthUsefulDistance
        ? approximateDepthDistance(world, depthCenter, depthRadius, depthExactDistance)
        : distanceToIndexedPolyline(world, depthDistanceIndex)
      const signedShoreDistance = inside ? -shoreDistance : shoreDistance
      const edgeDistance = Math.max(0, Math.min(half - Math.abs(world.x), half - Math.abs(world.z)))
      const depthDistanceRatio =
        inside && interiorDepthIsDeep
          ? 1
          : Math.min(1, depthDistance / WATER_FIELD_DEPTH_DISTANCE_MAX_METERS)
      const packedDepthDistance = packUnit16(depthDistanceRatio)
      const shoreNoise = fbm(
        world.x * params.shoreNoiseFrequency,
        world.z * params.shoreNoiseFrequency,
        8.9,
      )
      const shoreThickness = Math.max(
        0.08,
        params.shoreBandMeters + (shoreNoise - 0.5) * params.shoreVariationMeters,
      )
      const shore =
        1 -
        smoothstep(
          shoreThickness,
          shoreThickness + params.shoreFeatherMeters,
          Math.abs(signedShoreDistance),
        )

      data[index] = packedDepthDistance[0]
      data[index + 1] = packedDepthDistance[1]
      data[index + 2] = byte(edgeDistance / PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH)
      data[index + 3] = byte(shore)
    }
  }

  return { data, height: textureResolution, width: textureResolution }
}

export function createPascalWaterFieldTextureFromData(
  bytes: Uint8Array,
  width: number,
  height: number,
) {
  const texture = new DataTexture(bytes, width, height, RGBAFormat)
  texture.flipY = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

export function createPascalWaterFieldTexture(options: WaterFieldOptions) {
  const { data, height, width } = createPascalWaterFieldTextureData(options)
  return createPascalWaterFieldTextureFromData(data, width, height)
}

export function createPascalWaveDepthFieldTexture(
  sourceTexture: DataTexture,
  parameters: Pick<PascalWaterFieldParameters, 'depthExponent' | 'depthReach' | 'edgeFadeDistance'>,
  smoothingRatio: number,
  planeSize: number,
) {
  const image = sourceTexture.image as {
    data?: Uint8Array
    height?: number
    width?: number
  }
  const width = image.width ?? 1
  const height = image.height ?? width
  const source = image.data
  const baseValues = new Float32Array(width * height)
  const smoothedValues = new Float32Array(width * height)
  const bytes = new Uint8Array(width * height * 4)
  const smoothAmount = clamp01(smoothingRatio)

  if (!source) {
    return createPascalWaterFieldTextureFromData(bytes, width, height)
  }

  for (let pixelIndex = 0; pixelIndex < baseValues.length; pixelIndex += 1) {
    const sourceIndex = pixelIndex * 4
    const depthRatio = ((source[sourceIndex] ?? 0) * 256 + (source[sourceIndex + 1] ?? 0)) / 65535
    if (depthRatio >= 0.995) {
      baseValues[pixelIndex] = -1
      continue
    }

    const edgeDistance =
      ((source[sourceIndex + 2] ?? 0) / 255) * PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH
    const edgeFade = smoothstep(0, parameters.edgeFadeDistance, edgeDistance)
    const offshore = clamp01(
      (depthRatio * PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH) /
        Math.max(parameters.depthReach, 0.001),
    )
    baseValues[pixelIndex] = (1 - offshore ** parameters.depthExponent) * edgeFade
  }

  const radius = Math.max(1, Math.round((3 / planeSize) * Math.max(width, height)))
  const diagonalRadius = Math.max(1, Math.round(radius * Math.SQRT1_2))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x
      const baseValue = baseValues[pixelIndex] ?? -1
      if (baseValue < 0) {
        smoothedValues[pixelIndex] = -1
        continue
      }

      const smoothedValue = weightedWaveDepthSample(baseValues, width, height, x, y, [
        [0, 0, 0.2],
        [radius, 0, 0.12],
        [-radius, 0, 0.12],
        [0, radius, 0.12],
        [0, -radius, 0.12],
        [diagonalRadius, diagonalRadius, 0.08],
        [-diagonalRadius, diagonalRadius, 0.08],
        [diagonalRadius, -diagonalRadius, 0.08],
        [-diagonalRadius, -diagonalRadius, 0.08],
      ])
      smoothedValues[pixelIndex] = lerp(baseValue, smoothedValue, smoothAmount)
    }
  }

  for (let pixelIndex = 0; pixelIndex < smoothedValues.length; pixelIndex += 1) {
    const value = smoothedValues[pixelIndex] ?? -1
    const byteValue = value < 0 ? 0 : byte(value)
    const index = pixelIndex * 4
    bytes[index] = byteValue
    bytes[index + 1] = byteValue
    bytes[index + 2] = byteValue
    bytes[index + 3] = value < 0 ? 0 : 255
  }

  return createPascalWaterFieldTextureFromData(bytes, width, height)
}

export function createPascalWaterSmoothedPerimeter(
  perimeter: readonly PascalWaterPoint2[],
  samplesPerSegment = 2,
) {
  const ring = openRing(perimeter)
  if (ring.length < 4) return ring

  const smoothed: PascalWaterPoint2[] = []
  for (let index = 0; index < ring.length; index += 1) {
    const p0 = ring[(index - 1 + ring.length) % ring.length]!
    const p1 = ring[index]!
    const p2 = ring[(index + 1) % ring.length]!
    const p3 = ring[(index + 2) % ring.length]!

    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment
      smoothed.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
      })
    }
  }

  return smoothed
}

export function createPascalWaterDepthReferencePerimeter(
  points: readonly PascalWaterPoint2[],
  parameters?: Partial<PascalWaterFieldParameters>,
) {
  if (points.length < 3) return [...points]
  const params = { ...PASCAL_WATER_FIELD_DEFAULT_PARAMETERS, ...parameters }
  const center = points.reduce((total, point) => ({ x: total.x + point.x, z: total.z + point.z }), {
    x: 0,
    z: 0,
  })
  const centerX = center.x / points.length
  const centerZ = center.z / points.length

  return points.map((point) => {
    const dx = point.x - centerX
    const dz = point.z - centerZ
    const length = Math.hypot(dx, dz) || 1
    const angle = Math.atan2(dz, dx)
    const primaryNoise =
      fbm(
        point.x * params.depthContourNoiseFrequency,
        point.z * params.depthContourNoiseFrequency,
        44.3,
      ) *
        2 -
      1
    const secondaryNoise =
      fbm(
        (point.x + 91) * params.depthContourNoiseFrequency * 2.25,
        (point.z - 37) * params.depthContourNoiseFrequency * 2.25,
        91.7,
      ) *
        2 -
      1
    const lobeNoise = Math.sin(angle * 3.1 + 0.8) * 0.35 + Math.sin(angle * 7.3 - 1.2) * 0.22
    const collapse = collapsePocketField(angle, params.depthContourCollapseScale)
    const offset = clampRange(
      params.depthContourOffsetMeters +
        params.depthContourVariationMeters *
          (primaryNoise * 0.58 + secondaryNoise * 0.26 + lobeNoise) -
        params.depthContourCollapseMeters * collapse,
      -12,
      18,
    )

    return {
      x: point.x + (dx / length) * offset,
      z: point.z + (dz / length) * offset,
    }
  })
}

type WaterFieldBounds = {
  depth: number
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  width: number
}

type WaterFieldSegment = {
  end: PascalWaterPoint2
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  start: PascalWaterPoint2
}

type DistanceIndex = {
  cells: Map<string, WaterFieldSegment[]>
  cellSize: number
  maxDistance: number
}

function catmullRom(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  )
}

function collapsePocketField(angle: number, scale: number) {
  let value = 0
  const widthMultiplier = Math.max(0.2, scale)

  for (let index = 0; index < 7; index += 1) {
    const center = gridHash(index * 19.17, index * 4.73, 12.5) * TAU
    const width = (0.16 + gridHash(index * 7.31, index * 11.9, 33.8) * 0.28) * widthMultiplier
    const amplitude = 0.35 + gridHash(index * 13.1, index * 17.3, 71.2) * 0.65
    const distance = angularDistance(angle, center)
    const pocket = Math.max(0, 1 - distance / width)
    value += pocket * pocket * (3 - 2 * pocket) * amplitude
  }

  return Math.min(1, value)
}

function angularDistance(a: number, b: number) {
  const delta = Math.abs(((((a - b + Math.PI) % TAU) + TAU) % TAU) - Math.PI)
  return Math.min(delta, TAU - delta)
}

function createDistanceIndex(
  points: readonly PascalWaterPoint2[],
  maxDistance: number,
): DistanceIndex {
  const cellSize = Math.max(8, Math.min(24, maxDistance / 3))
  const cells = new Map<string, WaterFieldSegment[]>()

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (!(start && end)) continue

    const segment = {
      end,
      maxX: Math.max(start.x, end.x),
      maxZ: Math.max(start.z, end.z),
      minX: Math.min(start.x, end.x),
      minZ: Math.min(start.z, end.z),
      start,
    }
    const minCellX = gridCell(segment.minX - maxDistance, cellSize)
    const maxCellX = gridCell(segment.maxX + maxDistance, cellSize)
    const minCellZ = gridCell(segment.minZ - maxDistance, cellSize)
    const maxCellZ = gridCell(segment.maxZ + maxDistance, cellSize)

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = gridKey(cellX, cellZ)
        const bucket = cells.get(key)
        if (bucket) {
          bucket.push(segment)
        } else {
          cells.set(key, [segment])
        }
      }
    }
  }

  return { cells, cellSize, maxDistance }
}

function weightedWaveDepthSample(
  values: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  samples: readonly (readonly [number, number, number])[],
) {
  let weightedValue = 0
  let totalWeight = 0

  for (const [offsetX, offsetY, weight] of samples) {
    const sampleX = Math.max(0, Math.min(width - 1, x + offsetX))
    const sampleY = Math.max(0, Math.min(height - 1, y + offsetY))
    const sampleValue = values[sampleY * width + sampleX]
    if (sampleValue === undefined || sampleValue < 0) continue
    weightedValue += sampleValue * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedValue / totalWeight : values[y * width + x] || 0
}

function distanceToIndexedPolyline(point: PascalWaterPoint2, index: DistanceIndex) {
  const candidates = index.cells.get(
    gridKey(gridCell(point.x, index.cellSize), gridCell(point.z, index.cellSize)),
  )
  if (!candidates) return index.maxDistance

  let best = index.maxDistance
  for (const segment of candidates) {
    best = Math.min(best, distanceToSegment(point, segment.start, segment.end))
  }
  return best
}

function gridCell(value: number, cellSize: number) {
  return Math.floor(value / cellSize)
}

function gridKey(cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}`
}

function boundsFor(points: readonly PascalWaterPoint2[]): WaterFieldBounds {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }

  if (!Number.isFinite(minX)) {
    return { depth: 0, maxX: 0, maxZ: 0, minX: 0, minZ: 0, width: 0 }
  }

  return { depth: maxZ - minZ, maxX, maxZ, minX, minZ, width: maxX - minX }
}

function distanceToBounds(point: PascalWaterPoint2, bounds: WaterFieldBounds) {
  const dx = point.x < bounds.minX ? bounds.minX - point.x : Math.max(0, point.x - bounds.maxX)
  const dz = point.z < bounds.minZ ? bounds.minZ - point.z : Math.max(0, point.z - bounds.maxZ)
  return Math.hypot(dx, dz)
}

function approximateDepthDistance(
  point: PascalWaterPoint2,
  center: PascalWaterPoint2,
  radius: number,
  exactDistance: number,
) {
  const radialDistance = Math.max(0, Math.hypot(point.x - center.x, point.z - center.z) - radius)

  return Math.min(WATER_FIELD_DEPTH_DISTANCE_MAX_METERS, Math.max(exactDistance, radialDistance))
}

function centerFor(points: readonly PascalWaterPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function averageRadiusFor(points: readonly PascalWaterPoint2[], center: PascalWaterPoint2) {
  if (points.length === 0) return 0
  let radius = 0
  for (const point of points) {
    radius += Math.hypot(point.x - center.x, point.z - center.z)
  }
  return radius / points.length
}

function openRing(points: readonly PascalWaterPoint2[]) {
  if (points.length < 2) return [...points]
  const first = points[0]!
  const last = points[points.length - 1]!
  if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.001) return points.slice(0, -1)
  return [...points]
}

function pointInPolygon(point: PascalWaterPoint2, polygon: readonly PascalWaterPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const crossesScanline = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    const intersects = crossesScanline && point.x < boundaryX
    if (intersects) inside = !inside
    previousIndex = index
  }
  return inside
}

function distanceToSegment(
  point: PascalWaterPoint2,
  start: PascalWaterPoint2,
  end: PascalWaterPoint2,
) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz || 0.000001
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  const closestX = start.x + dx * t
  const closestZ = start.z + dz * t
  return Math.hypot(point.x - closestX, point.z - closestZ)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 0.000001)))
  return t * t * (3 - 2 * t)
}

function byte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function packUnit16(value: number): [number, number] {
  const encoded = Math.max(0, Math.min(65535, Math.round(value * 65535)))
  return [Math.floor(encoded / 256), encoded % 256]
}

function clampResolution(value: number) {
  return Math.max(64, Math.min(PASCAL_WATER_FIELD_RESOLUTION, Math.round(value)))
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

function gridHash(x: number, y: number, seed: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
