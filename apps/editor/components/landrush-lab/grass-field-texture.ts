import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGBAFormat } from 'three'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'

export const GRASS_FIELD_RESOLUTION = 512
export const GRASS_SPAWN_FIELD_RESOLUTION = 1024
export const GRASS_FIELD_PREVIEW_RESOLUTION = 256
export const GRASS_FIELD_PLANE_SIZE = 132

const GRASS_COLORS = [
  [153, 149, 75],
  [150, 146, 78],
  [153, 147, 85],
  [141, 144, 82],
] as const
const GRASS_REGION_CORE_SHARPNESS = 5.2
const GRASS_REGION_BLEND_SHARPNESS = 2.15
const GRASS_ROAD_EDGE_PADDING_METERS = 0.08
const GRASS_ROAD_FEATHER_METERS = 0.46
const GRASS_BLOCKER_FEATHER_METERS = 0.28

export type GrassFieldBlocker = {
  clearanceMeters?: number
  featherMeters?: number
  initialVisibility?: number
  points: readonly LandrushPoint2[]
}

type GrassFieldOptions = {
  alphaMode?: 'density' | 'surface'
  blockers?: readonly GrassFieldBlocker[]
  density?: number
  edgeFadeMeters?: number
  patchSize?: number
  patchSoftness?: number
  perimeter: readonly LandrushPoint2[]
  planeSize: number
  profileMeasure?: GrassFieldProfileMeasure
  profileScope?: string
  resolution?: number
  roads: readonly LandrushRoadSegment[]
}

type GrassFieldProfileMeasure = <T>(id: string, callback: () => T) => T

export type GrassFieldSample = {
  color: readonly [number, number, number]
  colorIndex: 0 | 1 | 2 | 3
  blockerDistance: number
  density: number
  detail: number
  roadDistance: number
  shoreDistance: number
  surfaceAlpha: number
  transition: number
}

export type GrassFieldDistribution = {
  activeColorCount: number
  densityCoverage: number
  regionBalanceMin: number
  roadClearancePass: boolean
  shoreFadePass: boolean
}

export type GrassFieldTextureData = {
  bytes: Uint8Array
  resolution: number
  stats: GrassFieldDistribution
}

export function createGrassFieldTexture(options: GrassFieldOptions) {
  const profileScope = options.profileScope ?? 'setup.grass.field-texture'
  const data = measure(options.profileMeasure, `${profileScope}.data.total`, () =>
    createGrassFieldData(options, profileScope),
  )
  return createGrassFieldTextureFromData(data, options.profileMeasure, profileScope)
}

export function createGrassFieldTextureFromData(
  data: GrassFieldTextureData,
  profileMeasure?: GrassFieldProfileMeasure,
  profileScope = 'setup.grass.field-texture',
) {
  return measure(profileMeasure, `${profileScope}.texture.create-data-texture`, () => {
    const texture = new DataTexture(data.bytes, data.resolution, data.resolution, RGBAFormat)
    texture.flipY = true
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.needsUpdate = true
    return { stats: data.stats, texture }
  })
}

export function measureGrassFieldDistribution(
  perimeter: readonly LandrushPoint2[],
  planeSize: number,
  roads: readonly LandrushRoadSegment[],
): GrassFieldDistribution {
  return createGrassFieldData({ perimeter, planeSize, roads }).stats
}

function createGrassFieldData(
  {
    alphaMode = 'density',
    blockers = [],
    density,
    edgeFadeMeters,
    patchSize,
    patchSoftness,
    perimeter,
    planeSize,
    profileMeasure,
    resolution,
    roads,
  }: GrassFieldOptions,
  profileScope = 'setup.grass.field-texture',
) {
  const fieldResolution = resolution ?? GRASS_FIELD_RESOLUTION
  const bytes = measure(
    profileMeasure,
    `${profileScope}.data.allocate-bytes`,
    () => new Uint8Array(fieldResolution * fieldResolution * 4),
  )
  const counts = [0, 0, 0, 0]
  let dense = 0
  let insideCount = 0
  let interiorDensity = 0
  let interiorSamples = 0
  let roadClearanceFailures = 0
  let shoreDensity = 0
  let shoreSamples = 0
  const openPerimeter = measure(profileMeasure, `${profileScope}.data.open-perimeter`, () =>
    openRing(perimeter),
  )
  const patchOptions = measure(
    profileMeasure,
    `${profileScope}.data.resolve-patch-options`,
    () => ({
      density: density ?? 0.82,
      edgeFadeMeters: edgeFadeMeters ?? 8.4,
      patchSize: patchSize ?? 24,
      patchSoftness: patchSoftness ?? 0.18,
    }),
  )
  const rowBlockSize = 1

  measure(profileMeasure, `${profileScope}.data.sample-pixels`, () => {
    for (let rowStart = 0; rowStart < fieldResolution; rowStart += rowBlockSize) {
      const rowEnd = Math.min(fieldResolution, rowStart + rowBlockSize)
      measure(profileMeasure, `${profileScope}.data.sample-row-block`, () => {
        for (let y = rowStart; y < rowEnd; y += 1) {
          for (let x = 0; x < fieldResolution; x += 1) {
            const world = {
              x: (x / (fieldResolution - 1) - 0.5) * planeSize,
              z: (y / (fieldResolution - 1) - 0.5) * planeSize,
            }
            const index = (y * fieldResolution + x) * 4
            const sample = sampleGrassFieldPoint(
              world,
              openPerimeter,
              roads,
              patchOptions,
              blockers,
            )
            if (!sample) {
              const transparentGrassColor = GRASS_COLORS[1]
              bytes[index] = byte(transparentGrassColor[0] / 255)
              bytes[index + 1] = byte(transparentGrassColor[1] / 255)
              bytes[index + 2] = byte(transparentGrassColor[2] / 255)
              bytes[index + 3] = 0
              continue
            }

            bytes[index] = byte(sample.color[0] / 255)
            bytes[index + 1] = byte(sample.color[1] / 255)
            bytes[index + 2] = byte(sample.color[2] / 255)
            bytes[index + 3] =
              alphaMode === 'surface'
                ? byte(sample.surfaceAlpha)
                : byte(smoothstep(0.08, 0.7, sample.density))
            counts[sample.colorIndex] = (counts[sample.colorIndex] ?? 0) + 1
            insideCount += 1
            if (sample.density > 0.48) dense += 1
            if (sample.roadDistance < 0.02 && sample.density > 0.08) roadClearanceFailures += 1
            if (sample.shoreDistance < 5) {
              shoreDensity += sample.density
              shoreSamples += 1
            } else if (sample.shoreDistance > 15) {
              interiorDensity += sample.density
              interiorSamples += 1
            }
          }
        }
      })
    }
  })

  return measure(profileMeasure, `${profileScope}.data.finalize-stats`, () => {
    const shares = counts.map((count) => (insideCount > 0 ? count / insideCount : 0))
    return {
      bytes,
      resolution: fieldResolution,
      stats: {
        activeColorCount: shares.filter((share) => share > 0.02).length,
        densityCoverage: round(insideCount > 0 ? dense / insideCount : 0, 3),
        regionBalanceMin: round(Math.min(...shares), 3),
        roadClearancePass: roadClearanceFailures === 0,
        shoreFadePass:
          shoreSamples > 0 &&
          interiorSamples > 0 &&
          shoreDensity / shoreSamples < (interiorDensity / interiorSamples) * 0.72,
      },
    }
  })
}

export function sampleGrassFieldPoint(
  point: LandrushPoint2,
  openPerimeter: readonly LandrushPoint2[],
  roads: readonly LandrushRoadSegment[],
  patchOptions: {
    density: number
    edgeFadeMeters: number
    patchSize: number
    patchSoftness: number
  } = {
    density: 0.82,
    edgeFadeMeters: 8.4,
    patchSize: 24,
    patchSoftness: 0.18,
  },
  blockers: readonly GrassFieldBlocker[] = [],
): GrassFieldSample | null {
  if (!pointInPolygon(point, openPerimeter)) return null

  const shoreDistance = distanceToPolyline(point, openPerimeter)
  const roadDistance = distanceToRoads(point, roads)
  const blockerSample = sampleBlockerDistance(point, blockers)
  const blockerDistance = blockerSample.distance
  const roadFade = smoothstep(0.02, GRASS_ROAD_FEATHER_METERS, roadDistance)
  const blockerFade = smoothstep(0, blockerSample.featherMeters, blockerDistance)
  const region = organicGrassRegion(point)
  const shoreFade = edgeFade(shoreDistance, patchOptions.edgeFadeMeters)
  const highResolutionGrain = fbm(point.x * 0.096 + 3.1, point.z * 0.096 - 8.4)
  const broadMask = 0.82 + highResolutionGrain * 0.18
  const patchMask = grassPatchDensity(point, patchOptions, region.density)
  const density = clamp(shoreFade * roadFade * blockerFade * broadMask * patchMask)
  const surfaceAlpha = clamp(shoreFade * roadFade * blockerFade)
  const shade = 0.88 + density * 0.12 + region.highlight * 0.04
  const detail = 0.97 + noise(point.x * 0.24 + 18.5, point.z * 0.24 - 7.1) * 0.06
  const color = mixGrassColors(region.weights, shade * detail)

  return {
    color,
    colorIndex: region.colorIndex,
    blockerDistance,
    density,
    detail: region.detail,
    roadDistance,
    shoreDistance,
    surfaceAlpha,
    transition: region.transition,
  }
}

function distanceToRoads(point: LandrushPoint2, roads: readonly LandrushRoadSegment[]) {
  let best = Number.POSITIVE_INFINITY
  for (const road of roads) {
    const clearance = road.width / 2 + GRASS_ROAD_EDGE_PADDING_METERS
    best = Math.min(best, distanceToOpenPolyline(point, road.points) - clearance)
  }
  return best
}

function sampleBlockerDistance(point: LandrushPoint2, blockers: readonly GrassFieldBlocker[]) {
  let distance = Number.POSITIVE_INFINITY
  let featherMeters = GRASS_BLOCKER_FEATHER_METERS
  for (const blocker of blockers) {
    const ring = openRing(blocker.points)
    if (ring.length < 3) continue
    const boundaryDistance = distanceToPolyline(point, ring)
    const signedDistance = pointInPolygon(point, ring) ? -boundaryDistance : boundaryDistance
    const nextDistance = signedDistance - Math.max(0, blocker.clearanceMeters ?? 0)
    if (nextDistance < distance) {
      distance = nextDistance
      featherMeters = blocker.featherMeters ?? GRASS_BLOCKER_FEATHER_METERS
    }
  }
  return { distance, featherMeters: Math.max(0.001, featherMeters) }
}

function organicGrassRegion(point: LandrushPoint2) {
  const warp = {
    x: (fbm(point.x * 0.011 + 5.4, point.z * 0.011 - 9.2) - 0.5) * 15,
    z: (fbm(point.x * 0.011 - 3.7, point.z * 0.011 + 11.8) - 0.5) * 15,
  }
  const nx = (point.x + warp.x) * 0.018
  const nz = (point.z + warp.z) * 0.018
  const scores = [
    fbm(nx + 2.4, nz - 7.1),
    fbm(nx * 0.94 - 6.6, nz * 1.08 + 3.2),
    fbm(nx * 1.12 + 8.4, nz * 0.88 - 4.6),
    fbm(nx * 0.82 - 11.5, nz * 0.95 + 9.7),
  ]

  const sorted = [...scores].sort((a, b) => b - a)
  const transition = 1 - smoothstep(0.08, 0.28, sorted[0]! - sorted[1]!)
  const weights = mixWeights(
    softmax(scores, GRASS_REGION_CORE_SHARPNESS),
    softmax(scores, GRASS_REGION_BLEND_SHARPNESS),
    transition,
  )
  let colorIndex: 0 | 1 | 2 | 3 = 0
  for (let index = 1; index < weights.length; index += 1) {
    if (weights[index]! > weights[colorIndex]!) colorIndex = index as 0 | 1 | 2 | 3
  }

  const detail = fbm(nx * 1.68 - 2.2, nz * 1.68 + 0.9)
  const density = smoothstep(0.24, 0.84, scores[colorIndex]! * 0.72 + detail * 0.28)
  const highlight = smoothstep(0.48, 0.86, weights[3]! * 0.55 + detail * 0.45)

  return { colorIndex, density, detail, highlight, transition, warp, weights }
}

function grassPatchDensity(
  point: LandrushPoint2,
  patchOptions: { density: number; patchSize: number; patchSoftness: number },
  regionDensity: number,
) {
  const coverage = clamp(patchOptions.density)
  const patchSize = Math.max(4, patchOptions.patchSize)
  const warpStrength = patchSize * 0.62
  const warped = {
    x: point.x + (fbm(point.x * 0.012 + 31.4, point.z * 0.012 - 18.2) - 0.5) * warpStrength,
    z: point.z + (fbm(point.x * 0.012 - 7.8, point.z * 0.012 + 42.6) - 0.5) * warpStrength,
  }
  const broadPatch = fbm(
    warped.x / Math.max(1, patchSize * 2.25) + 6.8,
    warped.z / Math.max(1, patchSize * 1.75) - 9.1,
  )
  const texturePatch = fbm(
    warped.x / Math.max(1, patchSize * 0.78) - 2.7,
    warped.z / Math.max(1, patchSize * 0.66) + 13.4,
  )
  const ridgePatch = ridgedFbm(
    warped.x / Math.max(1, patchSize * 1.08) + 21.7,
    warped.z / Math.max(1, patchSize * 0.84) - 15.2,
  )
  const fineBreakup = noise(warped.x * 0.24 + 5.5, warped.z * 0.24 - 6.3)
  const patchSignal = clamp(
    broadPatch * 0.34 + texturePatch * 0.34 + ridgePatch * 0.22 + fineBreakup * 0.1,
  )
  const patchThreshold = lerp(0.76, 0.2, coverage)
  const patchFeather = Math.max(0.04, patchOptions.patchSoftness)
  const patchFill = smoothstep(patchThreshold, patchThreshold + patchFeather, patchSignal)
  const patchCore = smoothstep(
    patchThreshold + patchFeather * 0.75,
    patchThreshold + patchFeather + 0.12,
    patchSignal,
  )
  const patchPresence = patchFill * 0.42 + patchCore * 0.58
  const densityStrength = smoothstep(0.08, 0.55, coverage)
  const regionalPresence = 0.78 + smoothstep(0.18, 0.86, regionDensity) * 0.22

  return clamp(patchPresence * regionalPresence * densityStrength)
}

function edgeFade(distance: number, meters: number) {
  const fadeMeters = Math.max(0, meters)
  const fadeStartMeters = Math.min(0.7, fadeMeters * 0.25)
  return fadeMeters <= 0.001 ? 1 : smoothstep(fadeStartMeters, fadeMeters, distance)
}

function mixGrassColors(
  weights: readonly number[],
  shade: number,
): readonly [number, number, number] {
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < GRASS_COLORS.length; index += 1) {
    const color = GRASS_COLORS[index]!
    const weight = weights[index] ?? 0
    red += color[0] * weight
    green += color[1] * weight
    blue += color[2] * weight
  }

  return [red * shade, green * shade, blue * shade]
}

function softmax(values: readonly number[], sharpness: number) {
  const maxValue = Math.max(...values)
  const weighted = values.map((value) => Math.exp((value - maxValue) * sharpness))
  const total = weighted.reduce((sum, value) => sum + value, 0) || 1
  return weighted.map((value) => value / total)
}

function mixWeights(a: readonly number[], b: readonly number[], t: number) {
  const weights = a.map((value, index) => lerp(value, b[index] ?? 0, t))
  const total = weights.reduce((sum, value) => sum + value, 0) || 1
  return weights.map((value) => value / total)
}

function fbm(x: number, z: number) {
  return (
    noise(x, z) * 0.55 +
    noise(x * 2.03 + 8.1, z * 2.03 - 2.2) * 0.3 +
    noise(x * 4.1 - 7.3, z * 4.1 + 5.9) * 0.15
  )
}

function ridgedFbm(x: number, z: number) {
  const value =
    Math.abs(noise(x, z) * 2 - 1) * 0.5 +
    Math.abs(noise(x * 1.93 + 8.1, z * 2.07 - 2.2) * 2 - 1) * 0.32 +
    Math.abs(noise(x * 3.9 - 7.3, z * 4.15 + 5.9) * 2 - 1) * 0.18

  return 1 - clamp(value)
}

function noise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(hash(ix, iz), hash(ix + 1, iz), ux),
    lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), ux),
    uz,
  )
}

function hash(x: number, z: number) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123)
}

function openRing(points: readonly LandrushPoint2[]) {
  const first = points[0]
  const last = points[points.length - 1]
  return first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.001
    ? points.slice(0, -1)
    : [...points]
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const crosses = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    if (crosses && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

function distanceToPolyline(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToOpenPolyline(point: LandrushPoint2, polyline: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const t = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 0.000001),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function fract(value: number) {
  return value - Math.floor(value)
}

function byte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function measure<T>(
  profileMeasure: GrassFieldProfileMeasure | undefined,
  id: string,
  callback: () => T,
): T {
  return profileMeasure ? profileMeasure(id, callback) : callback()
}
