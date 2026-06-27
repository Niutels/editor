const PASCAL_WATER_FIELD_RESOLUTION = 1024
const BRUNO_DEPTH_FIELD_SCALE = 6.4
const TAU = Math.PI * 2

const PASCAL_WATER_FIELD_DEFAULT_PARAMETERS = {
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
}

const PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH = 70
const WATER_FIELD_DEPTH_DISTANCE_MAX_METERS =
  PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH * BRUNO_DEPTH_FIELD_SCALE
const WATER_FIELD_DEPTH_EXACT_DISTANCE_METERS =
  PASCAL_WATER_FIELD_DEFAULT_PARAMETERS.depthReach * BRUNO_DEPTH_FIELD_SCALE

self.onmessage = (event) => {
  const message = event.data
  if (!message || message.type !== 'generate') return

  try {
    const result = createPascalWaterFieldTextureData({
      parameters: message.parameters,
      perimeter: message.perimeter || [],
      planeSize: message.planeSize,
      resolution: message.resolution,
    })

    self.postMessage(
      {
        bytes: result.data.buffer,
        height: result.height,
        id: message.id,
        type: 'complete',
        width: result.width,
      },
      [result.data.buffer],
    )
  } catch (error) {
    self.postMessage({
      id: message.id || '',
      message: error instanceof Error ? error.message : String(error),
      type: 'error',
    })
  }
}

function createPascalWaterFieldTextureData({
  parameters,
  perimeter,
  planeSize,
  resolution = PASCAL_WATER_FIELD_RESOLUTION,
}) {
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
  const world = { x: 0, z: 0 }
  const denominator = textureResolution - 1

  for (let y = 0; y < textureResolution; y += 1) {
    world.z = (y / denominator - 0.5) * planeSize

    for (let x = 0; x < textureResolution; x += 1) {
      world.x = (x / denominator - 0.5) * planeSize
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
      const depthDistanceRatio = inside
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

function createPascalWaterDepthReferencePerimeter(points, parameters) {
  if (points.length < 3) return [...points]
  const params = { ...PASCAL_WATER_FIELD_DEFAULT_PARAMETERS, ...parameters }
  const center = points.reduce(
    (total, point) => ({ x: total.x + point.x, z: total.z + point.z }),
    { x: 0, z: 0 },
  )
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

function collapsePocketField(angle, scale) {
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

function angularDistance(a, b) {
  const delta = Math.abs(((((a - b + Math.PI) % TAU) + TAU) % TAU) - Math.PI)
  return Math.min(delta, TAU - delta)
}

function createDistanceIndex(points, maxDistance) {
  const cellSize = Math.max(8, Math.min(24, maxDistance / 3))
  const cells = new Map()

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

function distanceToIndexedPolyline(point, index) {
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

function gridCell(value, cellSize) {
  return Math.floor(value / cellSize)
}

function gridKey(cellX, cellZ) {
  return `${cellX}:${cellZ}`
}

function boundsFor(points) {
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

function distanceToBounds(point, bounds) {
  const dx = point.x < bounds.minX ? bounds.minX - point.x : Math.max(0, point.x - bounds.maxX)
  const dz = point.z < bounds.minZ ? bounds.minZ - point.z : Math.max(0, point.z - bounds.maxZ)
  return Math.hypot(dx, dz)
}

function approximateDepthDistance(point, center, radius, exactDistance) {
  const radialDistance = Math.max(0, Math.hypot(point.x - center.x, point.z - center.z) - radius)

  return Math.min(WATER_FIELD_DEPTH_DISTANCE_MAX_METERS, Math.max(exactDistance, radialDistance))
}

function centerFor(points) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function averageRadiusFor(points, center) {
  if (points.length === 0) return 0
  let radius = 0
  for (const point of points) {
    radius += Math.hypot(point.x - center.x, point.z - center.z)
  }
  return radius / points.length
}

function openRing(points) {
  if (points.length < 2) return [...points]
  const first = points[0]
  const last = points[points.length - 1]
  if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.001) return points.slice(0, -1)
  return [...points]
}

function pointInPolygon(point, polygon) {
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

function distanceToSegment(point, start, end) {
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

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 0.000001)))
  return t * t * (3 - 2 * t)
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function packUnit16(value) {
  const encoded = Math.max(0, Math.min(65535, Math.round(value * 65535)))
  return [Math.floor(encoded / 256), encoded % 256]
}

function clampResolution(value) {
  return Math.max(64, Math.min(PASCAL_WATER_FIELD_RESOLUTION, Math.round(value)))
}

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function fbm(x, y, seed) {
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

function valueNoise(x, y, seed) {
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

function gridHash(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}
