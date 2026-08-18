import {
  type BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three'

export type WaterlineInteractionField = {
  bounds: {
    maxX: number
    maxZ: number
    minX: number
    minZ: number
  }
  elevationMaximumMeters: number
  elevationMinimumMeters: number
  maximumDistanceMeters: number
  referenceElevationMeters: number
  resolution: number
  segmentCount: number
  sliceSegmentCounts: [number, number, number]
  terrainElevationMaximumMeters: number
  terrainElevationMinimumMeters: number
  texture: DataTexture
}

type WaterlineSegment = {
  endX: number
  endZ: number
  startX: number
  startZ: number
}

export function createWaterlineInteractionField(
  geometry: BufferGeometry,
  waterSurfaceElevation: number,
  {
    elevationRangeMeters = 2.5,
    maximumDistanceMeters = 4,
    resolution = 512,
  }: {
    elevationRangeMeters?: number
    maximumDistanceMeters?: number
    resolution?: number
  } = {},
): WaterlineInteractionField | null {
  const position = geometry.getAttribute('position')
  if (!position || position.itemSize < 3) return null

  const safeElevationRange = Math.max(0.1, elevationRangeMeters)
  const safeMaximumDistance = Math.max(0.1, maximumDistanceMeters)
  const safeResolution = Math.max(32, Math.round(resolution))
  const sliceElevations = [
    waterSurfaceElevation - safeElevationRange,
    waterSurfaceElevation,
    waterSurfaceElevation + safeElevationRange,
  ] as const
  const sliceSegments = sliceElevations.map((elevation) =>
    collectWaterlineSegments(geometry, elevation),
  )
  if (sliceSegments.every((segments) => segments.length === 0)) return null

  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const segments of sliceSegments) {
    for (const segment of segments) {
      minX = Math.min(minX, segment.startX, segment.endX)
      minZ = Math.min(minZ, segment.startZ, segment.endZ)
      maxX = Math.max(maxX, segment.startX, segment.endX)
      maxZ = Math.max(maxZ, segment.startZ, segment.endZ)
    }
  }

  const padding = safeMaximumDistance * 1.5
  minX -= padding
  minZ -= padding
  maxX += padding
  maxZ += padding
  const width = Math.max(0.001, maxX - minX)
  const depth = Math.max(0.001, maxZ - minZ)
  const texelWidth = width / safeResolution
  const texelDepth = depth / safeResolution
  const encodedSlices = sliceSegments.map((segments) =>
    rasterizeWaterlineSlice(
      segments,
      minX,
      minZ,
      texelWidth,
      texelDepth,
      safeMaximumDistance,
      safeResolution,
    ),
  )
  const terrainElevationMinimumMeters = waterSurfaceElevation - safeElevationRange
  const terrainElevationMaximumMeters = waterSurfaceElevation + safeElevationRange
  const encodedTerrainElevations = rasterizeProjectedTerrainElevations(
    geometry,
    minX,
    minZ,
    texelWidth,
    texelDepth,
    terrainElevationMinimumMeters,
    terrainElevationMaximumMeters,
    safeResolution,
  )
  const encodedDistances = new Uint8Array(safeResolution * safeResolution * 4)

  for (let index = 0; index < safeResolution * safeResolution; index += 1) {
    encodedDistances[index * 4] = encodedSlices[0]![index]!
    encodedDistances[index * 4 + 1] = encodedSlices[1]![index]!
    encodedDistances[index * 4 + 2] = encodedSlices[2]![index]!
    encodedDistances[index * 4 + 3] = encodedTerrainElevations[index]!
  }

  const texture = new DataTexture(
    encodedDistances,
    safeResolution,
    safeResolution,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  texture.name = 'compiled-rock-waterline-three-elevation-signed-distance-field'

  const sliceSegmentCounts = sliceSegments.map((segments) => segments.length) as [
    number,
    number,
    number,
  ]

  return {
    bounds: { maxX, maxZ, minX, minZ },
    elevationMaximumMeters: sliceElevations[2],
    elevationMinimumMeters: sliceElevations[0],
    maximumDistanceMeters: safeMaximumDistance,
    referenceElevationMeters: waterSurfaceElevation,
    resolution: safeResolution,
    segmentCount: sliceSegmentCounts[1],
    sliceSegmentCounts,
    terrainElevationMaximumMeters,
    terrainElevationMinimumMeters,
    texture,
  }
}

function rasterizeProjectedTerrainElevations(
  geometry: BufferGeometry,
  minX: number,
  minZ: number,
  texelWidth: number,
  texelDepth: number,
  minimumElevationMeters: number,
  maximumElevationMeters: number,
  resolution: number,
) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triangleCount = Math.floor((index?.count ?? position.count) / 3)
  const elevations = new Float32Array(resolution * resolution)
  elevations.fill(minimumElevationMeters)

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const first = index ? index.getX(triangleIndex * 3) : triangleIndex * 3
    const second = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1
    const third = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2
    const x0 = position.getX(first)
    const y0 = position.getY(first)
    const z0 = position.getZ(first)
    const x1 = position.getX(second)
    const y1 = position.getY(second)
    const z1 = position.getZ(second)
    const x2 = position.getX(third)
    const y2 = position.getY(third)
    const z2 = position.getZ(third)
    const denominator = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2)
    if (Math.abs(denominator) <= 0.000_000_1) continue

    const minimumXIndex = clampInteger(
      Math.floor((Math.min(x0, x1, x2) - minX) / texelWidth - 0.5),
      0,
      resolution - 1,
    )
    const maximumXIndex = clampInteger(
      Math.ceil((Math.max(x0, x1, x2) - minX) / texelWidth - 0.5),
      0,
      resolution - 1,
    )
    const minimumZIndex = clampInteger(
      Math.floor((Math.min(z0, z1, z2) - minZ) / texelDepth - 0.5),
      0,
      resolution - 1,
    )
    const maximumZIndex = clampInteger(
      Math.ceil((Math.max(z0, z1, z2) - minZ) / texelDepth - 0.5),
      0,
      resolution - 1,
    )

    for (let zIndex = minimumZIndex; zIndex <= maximumZIndex; zIndex += 1) {
      const sampleZ = minZ + (zIndex + 0.5) * texelDepth
      for (let xIndex = minimumXIndex; xIndex <= maximumXIndex; xIndex += 1) {
        const sampleX = minX + (xIndex + 0.5) * texelWidth
        const firstWeight = ((z1 - z2) * (sampleX - x2) + (x2 - x1) * (sampleZ - z2)) / denominator
        const secondWeight = ((z2 - z0) * (sampleX - x2) + (x0 - x2) * (sampleZ - z2)) / denominator
        const thirdWeight = 1 - firstWeight - secondWeight
        if (firstWeight < -0.000_1 || secondWeight < -0.000_1 || thirdWeight < -0.000_1) {
          continue
        }
        const elevation = y0 * firstWeight + y1 * secondWeight + y2 * thirdWeight
        const sampleIndex = zIndex * resolution + xIndex
        elevations[sampleIndex] = Math.max(elevations[sampleIndex]!, elevation)
      }
    }
  }

  const elevationRange = Math.max(0.001, maximumElevationMeters - minimumElevationMeters)
  const encodedElevations = new Uint8Array(resolution * resolution)
  for (let sampleIndex = 0; sampleIndex < elevations.length; sampleIndex += 1) {
    const normalizedElevation = Math.max(
      0,
      Math.min(1, (elevations[sampleIndex]! - minimumElevationMeters) / elevationRange),
    )
    encodedElevations[sampleIndex] = Math.round(normalizedElevation * 255)
  }
  return encodedElevations
}

function rasterizeWaterlineSlice(
  segments: WaterlineSegment[],
  minX: number,
  minZ: number,
  texelWidth: number,
  texelDepth: number,
  maximumDistanceMeters: number,
  resolution: number,
) {
  const encodedDistances = new Uint8Array(resolution * resolution)
  if (segments.length === 0) {
    encodedDistances.fill(255)
    return encodedDistances
  }

  const distances = new Float32Array(resolution * resolution)
  const barrierMask = new Uint8Array(resolution * resolution)
  distances.fill(maximumDistanceMeters + Math.hypot(texelWidth, texelDepth) * 2)

  for (const segment of segments) {
    const steps = Math.max(
      1,
      Math.ceil(
        Math.max(
          Math.abs(segment.endX - segment.startX) / texelWidth,
          Math.abs(segment.endZ - segment.startZ) / texelDepth,
        ) * 1.5,
      ),
    )
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps
      const sampleX = segment.startX + (segment.endX - segment.startX) * ratio
      const sampleZ = segment.startZ + (segment.endZ - segment.startZ) * ratio
      const xIndex = clampInteger(
        Math.round((sampleX - minX) / texelWidth - 0.5),
        0,
        resolution - 1,
      )
      const zIndex = clampInteger(
        Math.round((sampleZ - minZ) / texelDepth - 0.5),
        0,
        resolution - 1,
      )
      const index = zIndex * resolution + xIndex
      distances[index] = 0
      barrierMask[index] = 1
    }
  }

  const insideMask = createWaterlineFloodInsideMask(barrierMask, resolution)
  propagateWaterlineDistances(distances, texelWidth, texelDepth, resolution)
  for (let index = 0; index < distances.length; index += 1) {
    const normalizedDistance = Math.min(1, distances[index]! / maximumDistanceMeters)
    const signedNormalizedDistance =
      normalizedDistance >= 0.96 ? 1 : (insideMask[index] ? -1 : 1) * normalizedDistance
    encodedDistances[index] = Math.round((signedNormalizedDistance * 0.5 + 0.5) * 255)
  }
  return encodedDistances
}

function propagateWaterlineDistances(
  distances: Float32Array,
  texelWidth: number,
  texelDepth: number,
  resolution: number,
) {
  const diagonal = Math.hypot(texelWidth, texelDepth)
  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const index = zIndex * resolution + xIndex
      let distance = distances[index]!
      if (xIndex > 0) distance = Math.min(distance, distances[index - 1]! + texelWidth)
      if (zIndex > 0) {
        distance = Math.min(distance, distances[index - resolution]! + texelDepth)
        if (xIndex > 0) distance = Math.min(distance, distances[index - resolution - 1]! + diagonal)
        if (xIndex < resolution - 1) {
          distance = Math.min(distance, distances[index - resolution + 1]! + diagonal)
        }
      }
      distances[index] = distance
    }
  }

  for (let zIndex = resolution - 1; zIndex >= 0; zIndex -= 1) {
    for (let xIndex = resolution - 1; xIndex >= 0; xIndex -= 1) {
      const index = zIndex * resolution + xIndex
      let distance = distances[index]!
      if (xIndex < resolution - 1) distance = Math.min(distance, distances[index + 1]! + texelWidth)
      if (zIndex < resolution - 1) {
        distance = Math.min(distance, distances[index + resolution]! + texelDepth)
        if (xIndex > 0) distance = Math.min(distance, distances[index + resolution - 1]! + diagonal)
        if (xIndex < resolution - 1) {
          distance = Math.min(distance, distances[index + resolution + 1]! + diagonal)
        }
      }
      distances[index] = distance
    }
  }
}

function createWaterlineFloodInsideMask(barrierMask: Uint8Array, resolution: number) {
  const closedBarrier = barrierMask.slice()
  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const index = zIndex * resolution + xIndex
      if (!barrierMask[index]) continue
      for (let zOffset = -1; zOffset <= 1; zOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          const neighborX = xIndex + xOffset
          const neighborZ = zIndex + zOffset
          if (
            neighborX >= 0 &&
            neighborX < resolution &&
            neighborZ >= 0 &&
            neighborZ < resolution
          ) {
            closedBarrier[neighborZ * resolution + neighborX] = 1
          }
        }
      }
    }
  }

  const outsideMask = new Uint8Array(resolution * resolution)
  const queue = new Int32Array(resolution * resolution)
  let queueStart = 0
  let queueEnd = 0
  const enqueue = (index: number) => {
    if (closedBarrier[index] || outsideMask[index]) return
    outsideMask[index] = 1
    queue[queueEnd] = index
    queueEnd += 1
  }
  for (let index = 0; index < resolution; index += 1) {
    enqueue(index)
    enqueue((resolution - 1) * resolution + index)
    enqueue(index * resolution)
    enqueue(index * resolution + resolution - 1)
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart]!
    queueStart += 1
    const xIndex = index % resolution
    const zIndex = Math.floor(index / resolution)
    if (xIndex > 0) enqueue(index - 1)
    if (xIndex < resolution - 1) enqueue(index + 1)
    if (zIndex > 0) enqueue(index - resolution)
    if (zIndex < resolution - 1) enqueue(index + resolution)
  }

  const insideMask = new Uint8Array(resolution * resolution)
  for (let index = 0; index < insideMask.length; index += 1) {
    if (!outsideMask[index] && !closedBarrier[index]) insideMask[index] = 1
  }
  return insideMask
}

function collectWaterlineSegments(
  geometry: BufferGeometry,
  waterSurfaceElevation: number,
): WaterlineSegment[] {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triangleCount = Math.floor((index?.count ?? position.count) / 3)
  const segments = new Map<string, WaterlineSegment>()
  const epsilon = 0.0001

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const vertexIndices = [0, 1, 2].map((corner) =>
      index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner,
    )
    const vertices = vertexIndices.map((vertexIndex) => ({
      distance: position.getY(vertexIndex) - waterSurfaceElevation,
      x: position.getX(vertexIndex),
      z: position.getZ(vertexIndex),
    }))
    if (vertices.every((vertex) => Math.abs(vertex.distance) <= epsilon)) continue

    const intersections: Array<{ x: number; z: number }> = []
    for (const [startIndex, endIndex] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const start = vertices[startIndex]!
      const end = vertices[endIndex]!
      const startOnPlane = Math.abs(start.distance) <= epsilon
      const endOnPlane = Math.abs(end.distance) <= epsilon

      if (startOnPlane) addUniquePoint(intersections, start.x, start.z, epsilon)
      if (endOnPlane) addUniquePoint(intersections, end.x, end.z, epsilon)
      if (!startOnPlane && !endOnPlane && start.distance * end.distance < 0) {
        const ratio = start.distance / (start.distance - end.distance)
        addUniquePoint(
          intersections,
          start.x + (end.x - start.x) * ratio,
          start.z + (end.z - start.z) * ratio,
          epsilon,
        )
      }
    }

    if (intersections.length < 2) continue
    const [start, end] = farthestPointPair(intersections)
    if (!start || !end) continue
    const lengthSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2
    if (lengthSquared <= epsilon * epsilon) continue

    const startKey = quantizedPointKey(start.x, start.z)
    const endKey = quantizedPointKey(end.x, end.z)
    const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`
    if (!segments.has(key)) {
      segments.set(key, {
        endX: end.x,
        endZ: end.z,
        startX: start.x,
        startZ: start.z,
      })
    }
  }

  return [...segments.values()]
}

function addUniquePoint(
  points: Array<{ x: number; z: number }>,
  x: number,
  z: number,
  epsilon: number,
) {
  if (
    points.some((point) => Math.abs(point.x - x) <= epsilon && Math.abs(point.z - z) <= epsilon)
  ) {
    return
  }
  points.push({ x, z })
}

function farthestPointPair(points: Array<{ x: number; z: number }>) {
  let bestDistanceSquared = -1
  let bestPair: [{ x: number; z: number }, { x: number; z: number }] | null = null
  for (let startIndex = 0; startIndex < points.length - 1; startIndex += 1) {
    for (let endIndex = startIndex + 1; endIndex < points.length; endIndex += 1) {
      const start = points[startIndex]!
      const end = points[endIndex]!
      const distanceSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2
      if (distanceSquared > bestDistanceSquared) {
        bestDistanceSquared = distanceSquared
        bestPair = [start, end]
      }
    }
  }
  return bestPair ?? []
}

function quantizedPointKey(x: number, z: number) {
  return `${Math.round(x * 1_000)},${Math.round(z * 1_000)}`
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}
