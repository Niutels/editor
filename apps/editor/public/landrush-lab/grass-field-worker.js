self.onmessage = (event) => {
  const data = createGrassFieldData(event.data)
  self.postMessage(
    {
      bytes: data.bytes.buffer,
      resolution: data.resolution,
      stats: data.stats,
    },
    [data.bytes.buffer],
  )
}

const GRASS_REGION_CORE_SHARPNESS = 5.2
const GRASS_REGION_BLEND_SHARPNESS = 2.15
const GRASS_ROAD_EDGE_PADDING_METERS = 0.08
const GRASS_ROAD_FEATHER_METERS = 0.46

function createGrassFieldData({
  alphaMode = 'density',
  density,
  edgeFadeMeters,
  patchSize,
  patchSoftness,
  perimeter,
  planeSize,
  resolution,
  roads = [],
}) {
  const fieldResolution = resolution ?? 1024
  const bytes = new Uint8Array(fieldResolution * fieldResolution * 4)
  const counts = [0, 0, 0, 0]
  let dense = 0
  let insideCount = 0
  let interiorDensity = 0
  let interiorSamples = 0
  let roadClearanceFailures = 0
  let shoreDensity = 0
  let shoreSamples = 0
  const openPerimeter = openRing(perimeter)

  for (let y = 0; y < fieldResolution; y += 1) {
    for (let x = 0; x < fieldResolution; x += 1) {
      const world = {
        x: (x / (fieldResolution - 1) - 0.5) * planeSize,
        z: (y / (fieldResolution - 1) - 0.5) * planeSize,
      }
      const index = (y * fieldResolution + x) * 4
      const sample = sampleGrassFieldPoint(world, openPerimeter, roads, {
        density: density ?? 0.82,
        edgeFadeMeters: edgeFadeMeters ?? 8.4,
        patchSize: patchSize ?? 24,
        patchSoftness: patchSoftness ?? 0.18,
      })
      if (!sample) continue

      bytes[index] = byte(sample.color[0] / 255)
      bytes[index + 1] = byte(sample.color[1] / 255)
      bytes[index + 2] = byte(sample.color[2] / 255)
      bytes[index + 3] =
        alphaMode === 'surface' ? 255 : byte(smoothstep(0.08, 0.7, sample.density))
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
}

function sampleGrassFieldPoint(point, openPerimeter, roads, patchOptions) {
  if (!pointInPolygon(point, openPerimeter)) return null

  const shoreDistance = distanceToPolyline(point, openPerimeter)
  const roadDistance = distanceToRoads(point, roads)
  const roadFade = smoothstep(0.02, GRASS_ROAD_FEATHER_METERS, roadDistance)
  const region = organicGrassRegion(point)
  const shoreFade = edgeFade(shoreDistance, patchOptions.edgeFadeMeters)
  const highResolutionGrain = fbm(point.x * 0.096 + 3.1, point.z * 0.096 - 8.4)
  const broadMask = 0.82 + highResolutionGrain * 0.18
  const patchMask = grassPatchDensity(point, patchOptions, region.density)
  const density = clamp(shoreFade * roadFade * broadMask * patchMask)
  const shade = 0.88 + density * 0.12 + region.highlight * 0.04
  const detail = 0.97 + noise(point.x * 0.24 + 18.5, point.z * 0.24 - 7.1) * 0.06
  const color = mixGrassColors(region.weights, shade * detail)

  return {
    color,
    colorIndex: region.colorIndex,
    density,
    roadDistance,
    shoreDistance,
  }
}

function distanceToRoads(point, roads) {
  let best = Number.POSITIVE_INFINITY
  for (const road of roads) {
    const clearance = road.width / 2 + GRASS_ROAD_EDGE_PADDING_METERS
    best = Math.min(best, distanceToOpenPolyline(point, road.points) - clearance)
  }
  return best
}

function organicGrassRegion(point) {
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
  const transition = 1 - smoothstep(0.08, 0.28, sorted[0] - sorted[1])
  const weights = mixWeights(
    softmax(scores, GRASS_REGION_CORE_SHARPNESS),
    softmax(scores, GRASS_REGION_BLEND_SHARPNESS),
    transition,
  )
  let colorIndex = 0
  for (let index = 1; index < weights.length; index += 1) {
    if (weights[index] > weights[colorIndex]) colorIndex = index
  }

  const detail = fbm(nx * 1.68 - 2.2, nz * 1.68 + 0.9)
  const density = smoothstep(0.24, 0.84, scores[colorIndex] * 0.72 + detail * 0.28)
  const highlight = smoothstep(0.48, 0.86, weights[3] * 0.55 + detail * 0.45)

  return { colorIndex, density, detail, highlight, transition, warp, weights }
}

function grassPatchDensity(point, patchOptions, regionDensity) {
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

function edgeFade(distance, meters) {
  const fadeMeters = Math.max(0, meters)
  const fadeStartMeters = Math.min(0.7, fadeMeters * 0.25)
  return fadeMeters <= 0.001 ? 1 : smoothstep(fadeStartMeters, fadeMeters, distance)
}

function mixGrassColors(weights, shade) {
  const colors = [
    [118, 156, 72],
    [150, 176, 89],
    [91, 145, 68],
    [176, 194, 104],
  ]
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index]
    const weight = weights[index] ?? 0
    red += color[0] * weight
    green += color[1] * weight
    blue += color[2] * weight
  }

  return [red * shade, green * shade, blue * shade]
}

function softmax(values, sharpness) {
  const maxValue = Math.max(...values)
  const weighted = values.map((value) => Math.exp((value - maxValue) * sharpness))
  const total = weighted.reduce((sum, value) => sum + value, 0) || 1
  return weighted.map((value) => value / total)
}

function mixWeights(a, b, t) {
  const weights = a.map((value, index) => lerp(value, b[index] ?? 0, t))
  const total = weights.reduce((sum, value) => sum + value, 0) || 1
  return weights.map((value) => value / total)
}

function fbm(x, z) {
  return (
    noise(x, z) * 0.55 +
    noise(x * 2.03 + 8.1, z * 2.03 - 2.2) * 0.3 +
    noise(x * 4.1 - 7.3, z * 4.1 + 5.9) * 0.15
  )
}

function ridgedFbm(x, z) {
  const value =
    Math.abs(noise(x, z) * 2 - 1) * 0.5 +
    Math.abs(noise(x * 1.93 + 8.1, z * 2.07 - 2.2) * 2 - 1) * 0.32 +
    Math.abs(noise(x * 3.9 - 7.3, z * 4.15 + 5.9) * 2 - 1) * 0.18

  return 1 - clamp(value)
}

function noise(x, z) {
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

function hash(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123)
}

function openRing(points) {
  const first = points[0]
  const last = points[points.length - 1]
  return first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.001
    ? points.slice(0, -1)
    : [...points]
}

function pointInPolygon(point, polygon) {
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

function distanceToPolyline(point, polygon) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToOpenPolyline(point, polyline) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const t = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 0.000001),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function clamp(value) {
  return Math.max(0, Math.min(1, value))
}

function fract(value) {
  return value - Math.floor(value)
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function round(value, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
