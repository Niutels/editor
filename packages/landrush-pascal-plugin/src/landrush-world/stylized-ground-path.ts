export const STYLIZED_PATH_EDGE_FEATHER_METERS = 0.14
export const STYLIZED_PATH_EDGE_NOISE_METERS = 0.02
export const STYLIZED_PATH_SIDEWALK_WIDTH_METERS = 0.3
export const STYLIZED_PATH_SIDEWALK_SEAM_METERS = 0.06
export const STYLIZED_PATH_WIDTH_SCALE = 1.35

export type StylizedGroundPoint2 = { x: number; z: number }

export type StylizedGroundRoadSegment = {
  points: readonly StylizedGroundPoint2[]
  width: number
}

export type StylizedGroundRgbByte = readonly [number, number, number]

type StylizedPathSpan = {
  end: StylizedGroundPoint2
  halfWidth: number
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  start: StylizedGroundPoint2
}

export type StylizedPathGrid = {
  cells: StylizedPathSpan[][]
  cellsPerAxis: number
  fieldSize: number
}

export function createStylizedPathGrid(
  roads: readonly StylizedGroundRoadSegment[],
  fieldSize: number,
): StylizedPathGrid | null {
  const spans: StylizedPathSpan[] = []
  for (const road of roads) {
    const halfWidth = (Math.max(0.1, road.width) * STYLIZED_PATH_WIDTH_SCALE) / 2
    const padding = halfWidth + STYLIZED_PATH_EDGE_FEATHER_METERS + STYLIZED_PATH_EDGE_NOISE_METERS
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      spans.push({
        end,
        halfWidth,
        maxX: Math.max(start.x, end.x) + padding,
        maxZ: Math.max(start.z, end.z) + padding,
        minX: Math.min(start.x, end.x) - padding,
        minZ: Math.min(start.z, end.z) - padding,
        start,
      })
    }
  }
  if (spans.length === 0) return null

  const cellsPerAxis = Math.max(16, Math.min(64, Math.ceil(fieldSize / 4)))
  const cells = Array.from({ length: cellsPerAxis * cellsPerAxis }, () => [] as StylizedPathSpan[])
  for (const span of spans) {
    const minCellX = stylizedPathCellIndex(span.minX, fieldSize, cellsPerAxis)
    const maxCellX = stylizedPathCellIndex(span.maxX, fieldSize, cellsPerAxis)
    const minCellZ = stylizedPathCellIndex(span.minZ, fieldSize, cellsPerAxis)
    const maxCellZ = stylizedPathCellIndex(span.maxZ, fieldSize, cellsPerAxis)
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        cells[cellZ * cellsPerAxis + cellX]?.push(span)
      }
    }
  }

  return { cells, cellsPerAxis, fieldSize }
}

export function stylizedPathSignedDistance(
  point: StylizedGroundPoint2,
  pathGrid: StylizedPathGrid | null,
  u: number,
  v: number,
) {
  if (!pathGrid) return Number.POSITIVE_INFINITY
  const spans = stylizedPathSpansNearPoint(point, pathGrid)
  if (spans.length === 0) return Number.POSITIVE_INFINITY
  const signedDistance = signedDistanceToStylizedSpans(point, spans)
  if (!Number.isFinite(signedDistance)) return Number.POSITIVE_INFINITY
  const edgeNoise =
    (stylizedGroundNoise(u * 18.2 + 4.6, v * 18.9 - 8.4) - 0.5) * STYLIZED_PATH_EDGE_NOISE_METERS
  return signedDistance + edgeNoise
}

export function stylizedPathWeightFromDistance(distance: number) {
  if (!Number.isFinite(distance)) return 0
  return (
    1 -
    smoothstep(
      -STYLIZED_PATH_EDGE_FEATHER_METERS * 0.35,
      STYLIZED_PATH_EDGE_FEATHER_METERS,
      distance,
    )
  )
}

export function blendStylizedGroundPathColor(
  grassColor: StylizedGroundRgbByte,
  pathDistance: number,
  u: number,
  v: number,
  grainRepeat: number,
) {
  const pathWeight = stylizedPathWeightFromDistance(pathDistance)
  let color = grassColor

  if (pathWeight > 0.001) {
    color = mixRgbBytes(
      grassColor,
      stylizedStonePathColor(pathDistance, u, v, grainRepeat),
      pathWeight,
    )
  }

  const curbShadow = stylizedPathOuterCurbShadowFromDistance(pathDistance)
  return curbShadow > 0.001 ? mixRgbBytes(color, [82, 78, 58], curbShadow) : color
}

export function stylizedStonePathColor(
  distance: number,
  u: number,
  v: number,
  grainRepeat: number,
): StylizedGroundRgbByte {
  const stoneBase: StylizedGroundRgbByte = [211, 202, 176]
  const stoneRoadbed: StylizedGroundRgbByte = [196, 186, 160]
  const stoneSunlit: StylizedGroundRgbByte = [229, 221, 197]
  const stoneSeam: StylizedGroundRgbByte = [176, 166, 141]
  const stoneShadow: StylizedGroundRgbByte = [146, 137, 115]
  const edgeDepth = Math.max(0, -distance)
  const sidewalkEnd = STYLIZED_PATH_SIDEWALK_WIDTH_METERS
  const seamEnd = sidewalkEnd + STYLIZED_PATH_SIDEWALK_SEAM_METERS
  const sidewalk = 1 - smoothstep(sidewalkEnd - 0.04, sidewalkEnd + 0.01, edgeDepth)
  const outerLip = 1 - smoothstep(0.03, 0.14, edgeDepth)
  const seam =
    smoothstep(sidewalkEnd - 0.02, sidewalkEnd + 0.01, edgeDepth) *
    (1 - smoothstep(seamEnd, seamEnd + 0.04, edgeDepth))
  const roadbedStart = seamEnd + 0.06
  const roadbed = smoothstep(roadbedStart, roadbedStart + 0.16, edgeDepth)
  const roadDropShadow =
    smoothstep(roadbedStart - 0.035, roadbedStart + 0.02, edgeDepth) *
    (1 - smoothstep(roadbedStart + 0.1, roadbedStart + 0.22, edgeDepth))
  const broad = stylizedGroundNoise(u * 3.4 + 11.7, v * 3.4 - 4.3)
  const grain = stylizedGroundNoise(u * grainRepeat * 0.35 + 5.1, v * grainRepeat * 0.35 - 7.7)
  let color = mixRgbBytes(stoneBase, stoneSunlit, 0.2 + (broad - 0.5) * 0.24)
  color = mixRgbBytes(color, stoneRoadbed, roadbed * 0.5)
  color = mixRgbBytes(color, stoneSunlit, sidewalk * 0.68)
  color = mixRgbBytes(color, stoneSunlit, outerLip * 0.24)
  color = mixRgbBytes(color, stoneSeam, seam * 0.82)
  color = mixRgbBytes(color, stoneShadow, roadDropShadow * 0.28 + roadbed * 0.05)
  return scaleRgbBytes(color, 1 + (grain - 0.5) * 0.018 + outerLip * 0.03 - seam * 0.035)
}

export function stylizedPathOuterCurbShadowFromDistance(distance: number) {
  if (!Number.isFinite(distance)) return 0
  const outsideShadow = smoothstep(0.02, 0.1, distance) * (1 - smoothstep(0.24, 0.52, distance))
  return clamp01(outsideShadow * 0.16)
}

export function sampleMaskRgba(
  source: Uint8Array,
  size: number,
  u: number,
  v: number,
): readonly [number, number, number, number] {
  const sampleX = clamp01(u) * (size - 1)
  const sampleY = clamp01(v) * (size - 1)
  const x0 = Math.floor(sampleX)
  const y0 = Math.floor(sampleY)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const tx = sampleX - x0
  const ty = sampleY - y0
  return [
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 0),
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 1),
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 2),
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 3),
  ]
}

export function mixRgbBytes(
  first: StylizedGroundRgbByte,
  second: StylizedGroundRgbByte,
  amount: number,
): StylizedGroundRgbByte {
  const t = clamp01(amount)
  return [lerp(first[0], second[0], t), lerp(first[1], second[1], t), lerp(first[2], second[2], t)]
}

export function byte255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function stylizedPathSpansNearPoint(point: StylizedGroundPoint2, pathGrid: StylizedPathGrid) {
  const cellX = stylizedPathCellIndex(point.x, pathGrid.fieldSize, pathGrid.cellsPerAxis)
  const cellZ = stylizedPathCellIndex(point.z, pathGrid.fieldSize, pathGrid.cellsPerAxis)
  return pathGrid.cells[cellZ * pathGrid.cellsPerAxis + cellX] ?? []
}

function stylizedPathCellIndex(value: number, fieldSize: number, cellsPerAxis: number) {
  return Math.max(
    0,
    Math.min(cellsPerAxis - 1, Math.floor((value / fieldSize + 0.5) * cellsPerAxis)),
  )
}

function signedDistanceToStylizedSpans(
  point: StylizedGroundPoint2,
  spans: readonly StylizedPathSpan[],
) {
  let signedDistance = Number.POSITIVE_INFINITY
  for (const span of spans) {
    signedDistance = Math.min(
      signedDistance,
      distanceToSegment(point, span.start, span.end) - span.halfWidth,
    )
  }
  return signedDistance
}

function distanceToSegment(
  point: StylizedGroundPoint2,
  start: StylizedGroundPoint2,
  end: StylizedGroundPoint2,
) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.z - start.z)
  const t = clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function sampleBilinearChannel(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tx: number,
  ty: number,
  channel: number,
) {
  const topLeft = source[(y0 * width + x0) * 4 + channel] ?? 0
  const topRight = source[(y0 * width + x1) * 4 + channel] ?? 0
  const bottomLeft = source[(y1 * width + x0) * 4 + channel] ?? 0
  const bottomRight = source[(y1 * width + x1) * 4 + channel] ?? 0
  return lerp(lerp(topLeft, topRight, tx), lerp(bottomLeft, bottomRight, tx), ty)
}

function scaleRgbBytes(color: StylizedGroundRgbByte, scale: number): StylizedGroundRgbByte {
  return [color[0] * scale, color[1] * scale, color[2] * scale]
}

function stylizedGroundNoise(x: number, z: number) {
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
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
