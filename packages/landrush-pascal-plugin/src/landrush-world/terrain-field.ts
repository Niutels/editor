import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { LandrushGrassPatch, LandrushTerrainSample, Point2 } from './render-types'
import {
  clamp01,
  clampByte,
  createProceduralTexture,
  createStyleRandom,
  expandBounds,
  hashSeed,
  hexToRgb,
  lerp,
  mixRgb,
  pointInPolygon,
  smoothstep,
} from './render-utils'
import { GRASS_COLORS } from './style-constants'
import type { LandrushWorldNode } from './schema'

const GRASS_BLADE_CANDIDATES = 5200
const LANDRUSH_TERRAIN_TEXTURE_SIZE = 1024
const LANDRUSH_TERRAIN_TEXTURE_WORLD_SIZE = 112
const LANDRUSH_WATER_FIELD_PADDING = 160
const LANDRUSH_WATER_DEPTH_REACH = 10
const LANDRUSH_WATER_SHORE_LINE_WIDTH = 2
const LANDRUSH_BRUNO_DEPTH_FIELD_SCALE = 6.4
const LANDRUSH_WATER_DEPTH_EXPONENT = 0.55
const LANDRUSH_WATER_DEPTH_NOISE_FREQUENCY = 0.03
const LANDRUSH_WATER_DEPTH_NOISE_STRENGTH = 0.07
export const LANDRUSH_WATER_PLANE_PADDING = 900

export function createLandrushTerrainData(
  seed: string,
  bounds: LandrushWorldNode['perimeter']['bounds'],
  perimeter: readonly Point2[],
  roads: LandrushWorldNode['roads']['segments'],
  textureSize = LANDRUSH_TERRAIN_TEXTURE_SIZE,
) {
  const size = textureSize
  const data = new Uint8Array(size * size * 4)
  const textureBounds = expandBounds(bounds, LANDRUSH_WATER_FIELD_PADDING)
  const seedOffset = (hashSeed(`${seed}:grass-field`) % 997) / 997
  const sample = (x: number, z: number) => sampleLandrushTerrain(x, z, seedOffset, perimeter, roads)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const worldX = textureBounds.minX + (x / (size - 1)) * textureBounds.width
      const worldZ = textureBounds.minZ + (y / (size - 1)) * textureBounds.depth
      const terrain = sample(worldX, worldZ)
      const index = (y * size + x) * 4
      data[index] = clampByte(terrain.roadMask * 255)
      data[index + 1] = clampByte(terrain.grassDensity * 255)
      data[index + 2] = clampByte((terrain.waterDepth === 0 ? 1 : 1 - terrain.waterDepth) * 255)
      data[index + 3] = clampByte(terrain.waterShoreLine * 255)
    }
  }

  return {
    bounds: textureBounds,
    grassTexture: createGrassRegionTexture(sample, textureSize),
    sample,
    texture: createProceduralTexture(data, size, size),
  }
}

export function createGrassBladeGeometry(
  bounds: LandrushWorldNode['perimeter']['bounds'],
  perimeter: readonly Point2[],
  seed: string,
  roads: LandrushWorldNode['roads']['segments'],
  sampleTerrain: (x: number, z: number) => LandrushTerrainSample,
) {
  const random = createStyleRandom(`${seed}:grass-blades`)
  const positions: number[] = []
  const colors: number[] = []
  const fourth = hexToRgb(GRASS_COLORS[3])

  for (let index = 0; index < GRASS_BLADE_CANDIDATES; index += 1) {
    const x = bounds.minX + random() * bounds.width
    const z = bounds.minZ + random() * bounds.depth
    if (!pointInPolygon({ x, z }, perimeter)) continue
    if (isNearRoad({ x, z }, roads)) continue

    const region = sampleTerrain(x, z)
    if (random() > 0.08 + region.grassDensity * 0.76) continue

    const base = hexToRgb(GRASS_COLORS[region.colorIndex]!)
    const tint = mixRgb(base, fourth, region.highlight * 0.24)
    const shade = 0.82 + random() * 0.16 + region.detail * 0.06
    const height = 0.3 + region.grassDensity * 0.82 + random() * 0.28
    const width = 0.06 + random() * 0.075
    const angle = random() * Math.PI * 2
    const lean = 0.1 + random() * 0.34

    for (let side = 0; side < 2; side += 1) {
      const bladeAngle = angle + side * (Math.PI / 2) + (random() - 0.5) * 0.24
      const nx = Math.cos(bladeAngle) * width
      const nz = Math.sin(bladeAngle) * width
      const leanX = Math.cos(bladeAngle + Math.PI / 2) * lean
      const leanZ = Math.sin(bladeAngle + Math.PI / 2) * lean

      positions.push(x - nx, 0.035, z - nz, x + nx, 0.035, z + nz, x + leanX, height, z + leanZ)

      for (let vertex = 0; vertex < 3; vertex += 1) {
        colors.push(
          clamp01((tint.r / 255) * shade),
          clamp01((tint.g / 255) * shade),
          clamp01((tint.b / 255) * shade),
        )
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function createGrassPatchShapes(
  seed: string,
  bounds: LandrushWorldNode['perimeter']['bounds'],
  perimeter: readonly Point2[],
  sampleTerrain: (x: number, z: number) => LandrushTerrainSample,
) {
  const random = createStyleRandom(`${seed}:grass-patches`)
  const patches: LandrushGrassPatch[] = []

  for (let index = 0; index < 14; index += 1) {
    let center: Point2 | null = null
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: bounds.minX + random() * bounds.width,
        z: bounds.minZ + random() * bounds.depth,
      }
      const terrain = sampleTerrain(candidate.x, candidate.z)
      if (pointInPolygon(candidate, perimeter) && terrain.grassDensity > 0.34) {
        center = candidate
        break
      }
    }
    if (!center) continue

    const terrain = sampleTerrain(center.x, center.z)
    const radiusX = 7.5 + random() * 13
    const radiusZ = 6 + random() * 11
    const phase = random() * Math.PI * 2
    const points: Point2[] = []

    for (let step = 0; step < 20; step += 1) {
      const angle = (step / 20) * Math.PI * 2
      let radiusScale =
        0.68 +
        fbm(Math.cos(angle + phase) * 0.9 + index, Math.sin(angle - phase) * 0.9, phase) * 0.48
      let pointValue = {
        x: center.x + Math.cos(angle) * radiusX * radiusScale,
        z: center.z + Math.sin(angle) * radiusZ * radiusScale,
      }

      for (let shrink = 0; shrink < 8 && !pointInPolygon(pointValue, perimeter); shrink += 1) {
        radiusScale *= 0.78
        pointValue = {
          x: center.x + Math.cos(angle) * radiusX * radiusScale,
          z: center.z + Math.sin(angle) * radiusZ * radiusScale,
        }
      }

      if (pointInPolygon(pointValue, perimeter)) {
        points.push(pointValue)
      }
    }

    if (points.length < 8) continue
    points.push({ ...points[0]! })
    patches.push({
      colorIndex: terrain.colorIndex,
      id: `grass-patch-${index}`,
      opacity: 0.14 + terrain.grassDensity * 0.1,
      points,
    })
  }

  return patches
}

function createGrassRegionTexture(
  sampleTerrain: (x: number, z: number) => LandrushTerrainSample,
  textureSize = LANDRUSH_TERRAIN_TEXTURE_SIZE,
) {
  const size = textureSize
  const data = new Uint8Array(size * size * 4)
  const colors = GRASS_COLORS.map(hexToRgb)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const worldX = (x / (size - 1) - 0.5) * LANDRUSH_TERRAIN_TEXTURE_WORLD_SIZE
      const worldZ = (y / (size - 1) - 0.5) * LANDRUSH_TERRAIN_TEXTURE_WORLD_SIZE
      const region = sampleTerrain(worldX, worldZ)
      const shade = 0.94 + smoothstep(0.24, 0.92, region.detail) * 0.045
      const base = colors[region.colorIndex]!
      const fourth = colors[3]!
      const fourthMix = region.highlight * 0.18
      const roadWash = region.roadMask * 0.18
      const shoreWash = region.shoreEdge * 0.12
      const index = (y * size + x) * 4
      data[index] = clampByte(lerp(lerp(base.r, fourth.r, fourthMix), 207, roadWash) * shade)
      data[index + 1] = clampByte(
        lerp(lerp(base.g, fourth.g, fourthMix), 214, roadWash + shoreWash) * shade,
      )
      data[index + 2] = clampByte(lerp(lerp(base.b, fourth.b, fourthMix), 179, roadWash) * shade)
      data[index + 3] = 255
    }
  }

  return createProceduralTexture(data, size, size, LANDRUSH_TERRAIN_TEXTURE_WORLD_SIZE)
}

function sampleLandrushTerrain(
  x: number,
  z: number,
  seedOffset: number,
  perimeter: readonly Point2[],
  roads: LandrushWorldNode['roads']['segments'],
): LandrushTerrainSample {
  const grass = sampleGrassRegion(x, z, seedOffset)
  const inside = pointInPolygon({ x, z }, perimeter)
  const shoreDistance = distanceToPolygonBoundary({ x, z }, perimeter)
  const roadMask = inside ? roadMaskAtPoint({ x, z }, roads) : 0
  const shoreEdge = inside
    ? 1 - smoothstep(1.15, 7.5, shoreDistance)
    : 1 - smoothstep(0.35, 9, shoreDistance)
  const waterShoreLine = inside
    ? 0
    : 1 - smoothstep(0, LANDRUSH_WATER_SHORE_LINE_WIDTH, shoreDistance)
  const grassDensity = inside
    ? clamp01(
        (0.2 + grass.density * 0.8) *
          (1 - roadMask) *
          (0.58 + 0.42 * smoothstep(2.2, 10, shoreDistance)),
      )
    : 0
  const waterDepth = inside ? 0 : sampleWaterDepth(x, z, shoreDistance, seedOffset)

  return {
    colorIndex: grass.colorIndex,
    detail: grass.detail,
    grassDensity,
    highlight: grass.highlight,
    roadMask,
    shoreEdge: clamp01(shoreEdge),
    waterDepth,
    waterShoreLine: clamp01(waterShoreLine),
  }
}

function sampleWaterDepth(x: number, z: number, shoreDistance: number, seedOffset: number) {
  const offshore = clamp01(
    shoreDistance / (LANDRUSH_WATER_DEPTH_REACH * LANDRUSH_BRUNO_DEPTH_FIELD_SCALE),
  )
  const depth = offshore ** LANDRUSH_WATER_DEPTH_EXPONENT
  const seabed =
    (fbm(
      x * LANDRUSH_WATER_DEPTH_NOISE_FREQUENCY,
      z * LANDRUSH_WATER_DEPTH_NOISE_FREQUENCY,
      seedOffset + 31.7,
    ) -
      0.5) *
    LANDRUSH_WATER_DEPTH_NOISE_STRENGTH *
    smoothstep(0.08, 0.55, offshore)

  return clamp01(depth + seabed)
}

function isNearRoad(point: Point2, roads: LandrushWorldNode['roads']['segments']) {
  for (const road of roads) {
    const clearance = road.width / 2 + 1.05
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      if (distanceToSegment(point, start, end) <= clearance) return true
    }
  }
  return false
}

function roadMaskAtPoint(point: Point2, roads: LandrushWorldNode['roads']['segments']) {
  let mask = 0

  for (const road of roads) {
    const roadHalfWidth = road.width / 2
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      const distance = distanceToSegment(point, start, end)
      mask = Math.max(mask, 1 - smoothstep(roadHalfWidth + 0.28, roadHalfWidth + 2.1, distance))
    }
  }

  return clamp01(mask)
}

function distanceToPolygonBoundary(point: Point2, polygon: readonly Point2[]) {
  let nearest = Number.POSITIVE_INFINITY

  for (let index = 0; index < polygon.length - 1; index += 1) {
    const start = polygon[index]
    const end = polygon[index + 1]
    if (!(start && end)) continue
    nearest = Math.min(nearest, distanceToSegment(point, start, end))
  }

  return Number.isFinite(nearest) ? nearest : 0
}

function distanceToSegment(point: Point2, start: Point2, end: Point2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.z - start.z)
  const t = clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  const projectedX = start.x + dx * t
  const projectedZ = start.z + dz * t
  return Math.hypot(point.x - projectedX, point.z - projectedZ)
}

function sampleGrassRegion(x: number, z: number, seedOffset: number) {
  const nx = x * 0.0155
  const nz = z * 0.0155
  const score0 = fbm(nx + seedOffset * 4.7, nz - 0.6, seedOffset)
  const score1 = fbm(nx * 0.86 - 1.65, nz * 1.02 + seedOffset * 4.4, seedOffset + 1.7)
  const score2 = fbm(nx * 1.08 + 2.2, nz * 0.9 - 1.35, seedOffset + 3.2)
  const active0 = score0 > 0.46
  const active1 = score1 > 0.47
  const active2 = score2 > 0.465
  const adjusted = [score0, score1, score2]

  if (active0 && active1) adjusted[1]! -= 0.24
  if (active1 && active2) adjusted[2]! -= 0.24
  if (active2 && active0) adjusted[0]! -= 0.24

  let colorIndex = 0
  if (adjusted[1]! > adjusted[colorIndex]!) colorIndex = 1
  if (adjusted[2]! > adjusted[colorIndex]!) colorIndex = 2

  const highlight = smoothstep(0.54, 0.88, fbm(nx * 1.35 + 4.2, nz * 1.24 - 1.3, seedOffset + 5.4))
  const detail = fbm(nx * 1.7 - 2.2, nz * 1.7 + 0.9, seedOffset + 8)
  const density = smoothstep(0.36, 0.82, Math.max(score0, score1, score2))

  return { colorIndex, density, detail, highlight }
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
