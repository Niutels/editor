import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  Vector2,
} from 'three'
import type { PascalWaterPoint2 } from './water-field'

export const PASCAL_WATER_LOW_ELEVATION = -0.04
export const PASCAL_WATER_SAND_ELEVATION = -0.1

const CLIFF_MIN_QUAD_AREA_METERS = 0.01
const CLIFF_MIN_QUAD_EDGE_METERS = 0.04
const CLIFF_INITIAL_VERTICES_PER_POINT = 160
const CLIFF_SAND_COVERAGE_MARGIN_METERS = 0.2

export type PascalWaterElevationParameters = {
  cliffAverageSlope: number
  cliffBandMergeThresholdMeters: number
  cliffBlockDepthMaxMeters: number
  cliffBlockDepthMinMeters: number
  cliffColorAverageRatio: number
  cliffColorFamilyVariationCount: number
  cliffColorFamilyDistribution: number
  cliffContrast: number
  cliffLayer1BlockWidthMeters: number
  cliffLayer1BlockWidthVariationMeters: number
  cliffLayer1BlockWidthVariationDistribution: number
  cliffLayer1ExtrusionAverageMeters: number
  cliffLayer1ExtrusionVariationMeters: number
  cliffLayer1ExtrusionVariationDistribution: number
  cliffLayer2AltitudeRatio: number
  cliffLayer2AltitudeVariation: number
  cliffLayer2AltitudeVariationDistribution: number
  cliffLayer2BlockWidthMeters: number
  cliffLayer2Density: number
  cliffLayer2BlockWidthVariationMeters: number
  cliffLayer2BlockWidthVariationDistribution: number
  cliffLayer2ExtrusionAverageMeters: number
  cliffLayer2ExtrusionVariationMeters: number
  cliffLayer2ExtrusionVariationDistribution: number
  cliffLayer3AltitudeRatio: number
  cliffLayer3AltitudeVariation: number
  cliffLayer3AltitudeVariationDistribution: number
  cliffLayer3BlockWidthMeters: number
  cliffLayer3Density: number
  cliffLayer3BlockWidthVariationMeters: number
  cliffLayer3BlockWidthVariationDistribution: number
  cliffLayer3ExtrusionAverageMeters: number
  cliffLayer3ExtrusionVariationMeters: number
  cliffLayer3ExtrusionVariationDistribution: number
  cliffSlopeVariation: number
  cliffSlopeVariationDistribution: number
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
type CliffExposure = 'dim' | 'light' | 'shade'
type CliffFaceColorSet = {
  bottom: CliffColor
  inner: CliffColor
  outer: CliffColor
  side: CliffColor
  top: CliffColor
}
type CliffColorFamily = {
  dim: CliffColor
  light: CliffColor
  shade: CliffColor
  weight: number
}
type CliffVertex = {
  x: number
  y: number
  z: number
}
type CliffTriangle = readonly [CliffVertex, CliffVertex, CliffVertex]
type CliffNormal = { x: number; y: number; z: number }

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

export function createPascalWaterContourBandGeometry(
  outerPoints: readonly PascalWaterPoint2[],
  innerPoints: readonly PascalWaterPoint2[],
) {
  const pointCount = Math.min(outerPoints.length, innerPoints.length)
  const geometry = new BufferGeometry()
  if (pointCount < 3) return geometry

  const positions = new Float32Array(pointCount * 2 * 3)
  const indices = new Uint32Array(pointCount * 6)
  for (let index = 0; index < pointCount; index += 1) {
    const outer = outerPoints[index]
    const inner = innerPoints[index]
    if (!(outer && inner)) continue

    const vertexOffset = index * 6
    positions[vertexOffset] = outer.x
    positions[vertexOffset + 2] = outer.z
    positions[vertexOffset + 3] = inner.x
    positions[vertexOffset + 5] = inner.z

    const nextIndex = (index + 1) % pointCount
    const outerIndex = index * 2
    const innerIndex = outerIndex + 1
    const nextOuterIndex = nextIndex * 2
    const nextInnerIndex = nextOuterIndex + 1
    const indexOffset = index * 6
    indices[indexOffset] = outerIndex
    indices[indexOffset + 1] = nextInnerIndex
    indices[indexOffset + 2] = nextOuterIndex
    indices[indexOffset + 3] = outerIndex
    indices[indexOffset + 4] = innerIndex
    indices[indexOffset + 5] = nextInnerIndex
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

export function createPascalWaterCliffSandCoveragePerimeter({
  innerElevation,
  outerElevation,
  parameters,
  plateauPoints,
  shorelinePoints,
  slopeStartPoints,
}: {
  innerElevation: number
  outerElevation: number
  parameters: PascalWaterElevationParameters
  plateauPoints: readonly PascalWaterPoint2[]
  shorelinePoints: readonly PascalWaterPoint2[]
  slopeStartPoints: readonly PascalWaterPoint2[]
}) {
  const pointCount = Math.min(plateauPoints.length, shorelinePoints.length, slopeStartPoints.length)
  if (pointCount < 3) return [...shorelinePoints]

  const cliffHeight = Math.max(0.5, innerElevation - outerElevation)
  const maxSlope =
    Math.max(0, parameters.cliffAverageSlope) + Math.max(0, parameters.cliffSlopeVariation)
  const connectedCliffReach =
    [0, 1, 2].reduce((reach, layerIndex) => {
      const extrusion = stylizedCliffLayerExtrusionParameters(layerIndex, parameters)
      return reach + extrusion.average + extrusion.variation + CLIFF_OFFSET_JITTER_METERS
    }, 0) +
    maxSlope * cliffHeight
  const center = centerForPoints(plateauPoints)
  const coveragePoints: PascalWaterPoint2[] = []

  for (let index = 0; index < pointCount; index += 1) {
    const plateau = plateauPoints[index]
    const shoreline = shorelinePoints[index]
    const slopeStart = slopeStartPoints[index]
    if (!(plateau && shoreline && slopeStart)) continue

    let outward = normalize2(slopeStart.x - plateau.x, slopeStart.z - plateau.z)
    if (distance2(plateau, slopeStart) <= 0.05) {
      outward = normalize2(shoreline.x - plateau.x, shoreline.z - plateau.z)
    }
    if (distance2(plateau, shoreline) <= 0.05) {
      outward = normalize2(plateau.x - center.x, plateau.z - center.z)
    }

    const baseCoverage = Math.max(distance2(plateau, shoreline), distance2(plateau, slopeStart))
    const coverage = Math.max(baseCoverage, connectedCliffReach) + CLIFF_SAND_COVERAGE_MARGIN_METERS
    coveragePoints.push({
      x: plateau.x + outward.x * coverage,
      z: plateau.z + outward.z * coverage,
    })
  }

  return coveragePoints
}

export function createPascalWaterCliffFootprintGeometry(cliffGeometry: BufferGeometry) {
  const geometry = new BufferGeometry()
  const sourcePositions = cliffGeometry.getAttribute('position')
  if (!sourcePositions) return geometry

  const positions = new Float32Array(sourcePositions.count * 3)
  for (let index = 0; index < sourcePositions.count; index += 1) {
    const offset = index * 3
    positions[offset] = sourcePositions.getX(index)
    positions[offset + 2] = sourcePositions.getZ(index)
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const sourceIndex = cliffGeometry.getIndex()
  if (sourceIndex) geometry.setIndex(sourceIndex.clone())
  geometry.computeBoundingSphere()
  return geometry
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
  const pointCount = Math.min(outerPoints.length, innerPoints.length)
  const geometry = new BufferGeometry()
  if (pointCount < 3) return geometry

  const hasBlockDepth =
    Math.max(parameters.cliffBlockDepthMinMeters, parameters.cliffBlockDepthMaxMeters) > 0.001
  if (!hasBlockDepth) {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const averageCliffTone = averageCliffRingTone(pointCount, parameters)
    addSmoothCliffRingSurface(
      positions,
      colors,
      indices,
      normals,
      uvs,
      outerPoints,
      innerPoints,
      pointCount,
      outerElevation,
      innerElevation,
      cliffFaceColors(averageCliffTone, parameters).outer,
    )

    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  const sink = createCliffGeometrySink(pointCount * CLIFF_INITIAL_VERTICES_PER_POINT)
  addStylizedCliffColumns(
    sink,
    outerPoints,
    innerPoints,
    pointCount,
    outerElevation,
    innerElevation,
    parameters,
  )

  const attributeLength = sink.vertexCount * 3
  geometry.setAttribute(
    'position',
    new BufferAttribute(sink.positions.subarray(0, attributeLength), 3),
  )
  geometry.setAttribute('color', new BufferAttribute(sink.colors.subarray(0, attributeLength), 3))
  geometry.setAttribute('normal', new BufferAttribute(sink.normals.subarray(0, attributeLength), 3))
  geometry.setAttribute('uv', new BufferAttribute(sink.uvs.subarray(0, sink.vertexCount * 2), 2))
  return geometry
}

function addSmoothCliffRingSurface(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  uvs: number[],
  outerPoints: readonly PascalWaterPoint2[],
  innerPoints: readonly PascalWaterPoint2[],
  pointCount: number,
  outerElevation: number,
  innerElevation: number,
  color: CliffColor,
) {
  for (let index = 0; index < pointCount; index += 1) {
    const outer = outerPoints[index]
    const inner = innerPoints[index]
    if (!(outer && inner)) continue

    const progress = index / Math.max(1, pointCount - 1)
    positions.push(outer.x, outerElevation, outer.z, inner.x, innerElevation, inner.z)
    colors.push(color[0], color[1], color[2], color[0], color[1], color[2])
    normals.push(0, 1, 0, 0, 1, 0)
    uvs.push(progress, 0, progress, 1)
  }

  for (let index = 0; index < pointCount; index += 1) {
    const nextIndex = (index + 1) % pointCount
    const outer = index * 2
    const inner = outer + 1
    const nextOuter = nextIndex * 2
    const nextInner = nextOuter + 1
    indices.push(outer, nextOuter, nextInner, outer, nextInner, inner)
  }
}

// ---------------------------------------------------------------------------
// Stylized faceted cliffs
//
// The cliff ring is split into columns along the coast. Each column protrudes
// outward by a random depth and is stacked from three strata whose offsets
// step back toward the plateau, exposing slanted ledges between tiers. Faces
// are emitted as independent flat-shaded triangles with material/exposure
// colors baked into vertex colors (the renderer draws them with an unlit material).
// ---------------------------------------------------------------------------

const CLIFF_SKIRT_DROP_METERS = 0.9
const CLIFF_OFFSET_JITTER_METERS = 0.18
const CLIFF_FACET_JITTER_METERS = 0.3
const CLIFF_FACET_ANCHOR_STEP = 3
const CLIFF_EXPOSURE_LIGHT_NORMAL_Y = 0.55
const CLIFF_EXPOSURE_SHADE_NORMAL_Y = -0.12
const CLIFF_MAX_COLOR_FAMILY_VARIATIONS = 8
const CLIFF_REFERENCE_FAMILIES: readonly CliffColorFamily[] = [
  {
    dim: srgbCliffColor(0x5d, 0x5d, 0x62),
    light: srgbCliffColor(0xb1, 0x9a, 0x8c),
    shade: srgbCliffColor(0x46, 0x46, 0x4f),
    weight: 2 / 3,
  },
  {
    dim: srgbCliffColor(0x73, 0x62, 0x5d),
    light: srgbCliffColor(0x9d, 0x81, 0x72),
    shade: srgbCliffColor(0x42, 0x3e, 0x45),
    weight: 1 / 3,
  },
]
const CLIFF_REFERENCE_FAMILY_RAMPS = Array.from(
  { length: CLIFF_MAX_COLOR_FAMILY_VARIATIONS + 1 },
  (_, variationCount) => createCliffReferenceFamilyRamp(variationCount),
)
const CLIFF_PROFILE_EPSILON = 0.001

type CliffGeometrySink = {
  colors: Float32Array
  normals: Float32Array
  positions: Float32Array
  uvs: Float32Array
  vertexCount: number
}

function createCliffGeometrySink(vertexCapacity: number): CliffGeometrySink {
  const capacity = Math.max(3, Math.ceil(vertexCapacity))
  return {
    colors: new Float32Array(capacity * 3),
    normals: new Float32Array(capacity * 3),
    positions: new Float32Array(capacity * 3),
    uvs: new Float32Array(capacity * 2),
    vertexCount: 0,
  }
}

function ensureCliffGeometrySinkCapacity(sink: CliffGeometrySink, additionalVertices: number) {
  const requiredCapacity = sink.vertexCount + additionalVertices
  const currentCapacity = sink.positions.length / 3
  if (requiredCapacity <= currentCapacity) return

  const nextCapacity = Math.max(requiredCapacity, currentCapacity * 2)
  sink.positions = growCliffFloat32Array(sink.positions, nextCapacity * 3)
  sink.colors = growCliffFloat32Array(sink.colors, nextCapacity * 3)
  sink.normals = growCliffFloat32Array(sink.normals, nextCapacity * 3)
  sink.uvs = growCliffFloat32Array(sink.uvs, nextCapacity * 2)
}

function growCliffFloat32Array(source: Float32Array, length: number) {
  const result = new Float32Array(length)
  result.set(source)
  return result
}

type CliffStationFrame = {
  inner: PascalWaterPoint2
  outward: PascalWaterPoint2
  width: number
}

type StylizedCliffStratum = {
  // Outward extrusion beyond the backing layer at the stratum's top edge.
  offset: number
  // Outward batter of the bottom edge, as a fraction of the stratum height.
  // Strata that reach higher stay closer to vertical.
  slopeFactor: number
  // t (0=toe, 1=plateau) at the stratum's top; the last stratum always reaches 1.
  topFraction: number
}

type StylizedCliffColumn = {
  brightness: number
  enabled: boolean
  family: CliffColorFamily
  layerIndex: number
  segmentCount: number
  startIndex: number
  strata: readonly StylizedCliffStratum[]
}
type StylizedCliffProfilePoint = {
  outwardOffset: number
  vertex: CliffVertex
}
type StylizedCliffSideProfile = {
  frame: CliffStationFrame
  points: readonly StylizedCliffProfilePoint[]
}
type StylizedCliffColumnStation = {
  column: StylizedCliffColumn
  step: number
}

function addStylizedCliffColumns(
  sink: CliffGeometrySink,
  outerPoints: readonly PascalWaterPoint2[],
  innerPoints: readonly PascalWaterPoint2[],
  pointCount: number,
  outerElevation: number,
  innerElevation: number,
  parameters: PascalWaterElevationParameters,
) {
  const frames = createCliffStationFrames(outerPoints, innerPoints, pointCount)
  const columnLayers = createStylizedCliffColumnLayers(frames, pointCount, parameters)
  const columns = columnLayers.flat().filter((column) => column.enabled)
  if (columns.length === 0) return
  const cliffHeight = Math.max(0.5, innerElevation - outerElevation)
  const columnProfiles = createStylizedCliffColumnProfiles(
    frames,
    columnLayers,
    pointCount,
    cliffHeight,
    outerElevation,
    innerElevation,
  )

  for (const column of columns) {
    const profile = columnProfiles.get(column)
    if (profile) {
      emitStylizedCliffColumn(
        sink,
        frames,
        column,
        profile,
        pointCount,
        outerElevation,
        innerElevation,
      )
    }
  }

  for (const layerColumns of columnLayers) {
    for (let index = 0; index < layerColumns.length; index += 1) {
      const column = layerColumns[index]
      const nextColumn = layerColumns[(index + 1) % layerColumns.length]
      const profile = column ? columnProfiles.get(column) : undefined
      const nextProfile = nextColumn ? columnProfiles.get(nextColumn) : undefined
      if (
        !(column && nextColumn && profile && nextProfile) ||
        (!column.enabled && !nextColumn.enabled) ||
        layerColumns.length < 2
      ) {
        continue
      }
      emitStylizedCliffSeam(
        sink,
        frames,
        innerPoints,
        column,
        profile,
        nextColumn,
        nextProfile,
        pointCount,
        outerElevation,
        innerElevation,
      )
    }
  }

  for (const column of (columnLayers.at(-1) ?? []).filter((candidate) => candidate.enabled)) {
    emitStylizedCliffBoulders(sink, frames, column, pointCount, outerElevation, parameters)
  }
}

function emitStylizedCliffBoulders(
  sink: CliffGeometrySink,
  frames: readonly CliffStationFrame[],
  column: StylizedCliffColumn,
  pointCount: number,
  outerElevation: number,
  parameters: PascalWaterElevationParameters,
) {
  const seed = column.startIndex * 29.31 + pointCount * 0.17
  if (hashUnit(seed, 51.7) > 0.34) return

  const boulderCount = hashUnit(seed, 63.1) < 0.38 ? 2 : 1

  for (let boulder = 0; boulder < boulderCount; boulder += 1) {
    const pick = hashUnit(seed, 71.3 + boulder * 17.7)
    const index = (column.startIndex + Math.floor(pick * column.segmentCount)) % pointCount
    const frame = frames[index]
    if (!frame) continue

    const distance = 1.1 + hashUnit(seed, 83.9 + boulder * 11.1) * 2.6
    const center = {
      x: frame.inner.x + frame.outward.x * (frame.width + distance),
      z: frame.inner.z + frame.outward.z * (frame.width + distance),
    }
    const radius = 0.35 + hashUnit(seed, 91.7 + boulder * 7.3) * 0.6
    const height = 0.28 + hashUnit(seed, 97.1 + boulder * 5.9) * 0.55
    emitStylizedCliffBoulder(
      sink,
      center,
      radius,
      height,
      outerElevation,
      pickStylizedCliffFamily(
        seed + boulder * 133.7,
        parameters.cliffColorFamilyVariationCount,
        parameters.cliffColorFamilyDistribution,
      ),
      stylizedCliffBrightness(seed + boulder * 29.3, parameters),
      seed + boulder * 133.7,
    )
  }
}

function emitStylizedCliffBoulder(
  sink: CliffGeometrySink,
  center: PascalWaterPoint2,
  radius: number,
  height: number,
  outerElevation: number,
  family: CliffColorFamily,
  brightness: number,
  seed: number,
) {
  const cornerCount = hashUnit(seed, 3.1) < 0.5 ? 5 : 6
  const baseY = outerElevation - 0.22
  const topY = baseY + Math.max(0.25, height)
  const topShiftX = (hashUnit(seed, 7.7) - 0.5) * radius * 0.7
  const topShiftZ = (hashUnit(seed, 11.3) - 0.5) * radius * 0.7
  const topScale = 0.45 + hashUnit(seed, 13.9) * 0.3
  const base: CliffVertex[] = []
  const top: CliffVertex[] = []

  for (let corner = 0; corner < cornerCount; corner += 1) {
    const angle =
      (corner / cornerCount) * Math.PI * 2 +
      hashUnit(seed, 17.3 + corner * 3.7) * ((Math.PI * 2) / cornerCount) * 0.55
    const cornerRadius = radius * (0.7 + hashUnit(seed, 23.1 + corner * 5.1) * 0.55)
    base.push({
      x: center.x + Math.cos(angle) * cornerRadius,
      y: baseY,
      z: center.z + Math.sin(angle) * cornerRadius,
    })
    top.push({
      x: center.x + topShiftX + Math.cos(angle) * cornerRadius * topScale,
      y: topY + (hashUnit(seed, 27.9 + corner * 4.3) - 0.5) * height * 0.35,
      z: center.z + topShiftZ + Math.sin(angle) * cornerRadius * topScale,
    })
  }

  let topCenterY = 0
  for (const vertex of top) topCenterY += vertex.y
  const topCenter: CliffVertex = {
    x: center.x + topShiftX,
    y: topCenterY / cornerCount + 0.05,
    z: center.z + topShiftZ,
  }

  for (let corner = 0; corner < cornerCount; corner += 1) {
    const nextCorner = (corner + 1) % cornerCount
    const baseA = base[corner]
    const baseB = base[nextCorner]
    const topA = top[corner]
    const topB = top[nextCorner]
    if (!(baseA && baseB && topA && topB)) continue

    const sideHint: CliffNormal = {
      x: (baseA.x + baseB.x) / 2 - center.x,
      y: 0.2,
      z: (baseA.z + baseB.z) / 2 - center.z,
    }
    addStylizedCliffTriangle(sink, [baseA, baseB, topB], sideHint, family, 'dim', brightness)
    addStylizedCliffTriangle(sink, [baseA, topB, topA], sideHint, family, 'dim', brightness)
    addStylizedCliffTriangle(
      sink,
      [topCenter, topA, topB],
      { x: 0, y: 1, z: 0 },
      family,
      'light',
      brightness,
    )
  }
}

function createCliffStationFrames(
  outerPoints: readonly PascalWaterPoint2[],
  innerPoints: readonly PascalWaterPoint2[],
  pointCount: number,
): CliffStationFrame[] {
  const outwardDirections = createCliffContourOutwardDirections(
    innerPoints,
    outerPoints,
    pointCount,
  )
  const frames: CliffStationFrame[] = []

  for (let index = 0; index < pointCount; index += 1) {
    const inner = innerPoints[index] ?? { x: 0, z: 0 }
    const outer = outerPoints[index] ?? inner
    const outward = outwardDirections[index] ?? normalize2(outer.x - inner.x, outer.z - inner.z)
    let width = distance2(inner, outer)
    if (width <= 0.05) {
      width = 0.3
    }
    frames.push({ inner, outward, width })
  }

  return frames
}

function createCliffContourOutwardDirections(
  contourPoints: readonly PascalWaterPoint2[],
  outwardHintPoints: readonly PascalWaterPoint2[],
  pointCount: number,
) {
  const center = centerForPoints(contourPoints)
  let signedArea = 0
  for (let index = 0; index < pointCount; index += 1) {
    const current = contourPoints[index]
    const next = contourPoints[(index + 1) % pointCount]
    if (current && next) signedArea += current.x * next.z - next.x * current.z
  }
  const contourIsCounterClockwise = signedArea >= 0
  const directions: PascalWaterPoint2[] = []

  for (let index = 0; index < pointCount; index += 1) {
    const current = contourPoints[index] ?? { x: 0, z: 0 }
    const previous = distinctCliffContourNeighbor(contourPoints, current, index, -1, pointCount)
    const next = distinctCliffContourNeighbor(contourPoints, current, index, 1, pointCount)
    const incoming = normalize2(current.x - previous.x, current.z - previous.z)
    const outgoing = normalize2(next.x - current.x, next.z - current.z)
    const incomingNormal = contourIsCounterClockwise
      ? { x: incoming.z, z: -incoming.x }
      : { x: -incoming.z, z: incoming.x }
    const outgoingNormal = contourIsCounterClockwise
      ? { x: outgoing.z, z: -outgoing.x }
      : { x: -outgoing.z, z: outgoing.x }
    const summedNormalLength = Math.hypot(
      incomingNormal.x + outgoingNormal.x,
      incomingNormal.z + outgoingNormal.z,
    )
    let outward =
      summedNormalLength > 0.001
        ? normalize2(incomingNormal.x + outgoingNormal.x, incomingNormal.z + outgoingNormal.z)
        : outgoingNormal

    const hint = outwardHintPoints[index]
    const hintX = (hint?.x ?? current.x) - current.x
    const hintZ = (hint?.z ?? current.z) - current.z
    if (Math.hypot(hintX, hintZ) > 0.001) {
      const hintDirection = normalize2(hintX, hintZ)
      if (outward.x * hintX + outward.z * hintZ < 0) {
        outward = { x: -outward.x, z: -outward.z }
      }
      const signedTurn =
        (incoming.x * outgoing.z - incoming.z * outgoing.x) * (contourIsCounterClockwise ? 1 : -1)
      if (signedTurn < -0.001) {
        // Concave normal rays converge, so retain a guarded amount of contour influence.
        outward = normalize2(
          lerp(hintDirection.x, outward.x, 0.25),
          lerp(hintDirection.z, outward.z, 0.25),
        )
      }
    } else if (outward.x * (current.x - center.x) + outward.z * (current.z - center.z) < 0) {
      outward = { x: -outward.x, z: -outward.z }
    }
    directions.push(outward)
  }

  return directions
}

function distinctCliffContourNeighbor(
  points: readonly PascalWaterPoint2[],
  current: PascalWaterPoint2,
  index: number,
  direction: -1 | 1,
  pointCount: number,
) {
  for (let step = 1; step < pointCount; step += 1) {
    const candidate = points[(index + direction * step + pointCount) % pointCount]
    if (candidate && distance2(current, candidate) > 0.0001) return candidate
  }
  return current
}

function createStylizedCliffColumnLayers(
  frames: readonly CliffStationFrame[],
  pointCount: number,
  parameters: PascalWaterElevationParameters,
): StylizedCliffColumn[][] {
  return [0, 1, 2].map((layerIndex) =>
    createStylizedCliffLayerColumns(frames, pointCount, parameters, layerIndex),
  )
}

function createStylizedCliffLayerColumns(
  frames: readonly CliffStationFrame[],
  pointCount: number,
  parameters: PascalWaterElevationParameters,
  layerIndex: number,
): StylizedCliffColumn[] {
  const columns: StylizedCliffColumn[] = []
  const width = stylizedCliffLayerBlockWidth(layerIndex, parameters)
  let startIndex = 0
  let consumed = 0

  while (consumed < pointCount) {
    const seed = layerIndex * 113.17 + startIndex * 13.37 + pointCount * 0.61
    const widthJitter = stylizedCliffVariationOffset(
      seed,
      41.7,
      width.variation,
      width.distribution,
    )
    const targetWidth = Math.max(0.9, width.average + widthJitter)
    let segmentCount = 0
    let lengthMeters = 0

    while (consumed + segmentCount < pointCount) {
      const index = (startIndex + segmentCount) % pointCount
      const current = frames[index]
      const next = frames[(index + 1) % pointCount]
      if (!(current && next)) break
      lengthMeters += distance2(current.inner, next.inner)
      segmentCount += 1
      if (lengthMeters >= targetWidth) break
    }

    if (segmentCount === 0) break
    columns.push(createStylizedCliffColumn(startIndex, segmentCount, seed, parameters, layerIndex))
    consumed += segmentCount
    startIndex = (startIndex + segmentCount) % pointCount
  }

  const lastColumn = columns.at(-1)
  const previousColumn = columns.at(-2)
  if (lastColumn && previousColumn && lastColumn.segmentCount <= 1) {
    columns.pop()
    columns[columns.length - 1] = {
      ...previousColumn,
      segmentCount: previousColumn.segmentCount + lastColumn.segmentCount,
    }
  }

  return columns
}

function createStylizedCliffColumn(
  startIndex: number,
  segmentCount: number,
  seed: number,
  parameters: PascalWaterElevationParameters,
  layerIndex: number,
): StylizedCliffColumn {
  const topFraction = stylizedCliffLayerTopFraction(layerIndex, seed, parameters)
  const offset = stylizedCliffLayerExtrusion(layerIndex, seed, parameters)
  const slopeFactor = stylizedCliffLayerSlope(seed, parameters)
  const strata: StylizedCliffStratum[] = [
    {
      offset,
      slopeFactor,
      topFraction,
    },
  ]

  return {
    brightness: stylizedCliffBrightness(seed, parameters),
    enabled: stylizedCliffLayerBlockEnabled(layerIndex, seed, parameters),
    family: pickStylizedCliffFamily(
      seed,
      parameters.cliffColorFamilyVariationCount,
      parameters.cliffColorFamilyDistribution,
    ),
    layerIndex,
    segmentCount,
    startIndex,
    strata,
  }
}

function stylizedCliffLayerBlockEnabled(
  layerIndex: number,
  seed: number,
  parameters: PascalWaterElevationParameters,
) {
  if (layerIndex === 0) return true
  const density = clamp01(
    layerIndex === 1 ? parameters.cliffLayer2Density : parameters.cliffLayer3Density,
  )
  if (density <= 0) return false
  if (density >= 1) return true
  return hashUnit(seed, 79.31) < density
}

function stylizedCliffLayerBlockWidth(
  layerIndex: number,
  parameters: PascalWaterElevationParameters,
): { average: number; distribution: number; variation: number } {
  if (layerIndex === 0) {
    return {
      average: Math.max(0.9, parameters.cliffLayer1BlockWidthMeters),
      distribution: parameters.cliffLayer1BlockWidthVariationDistribution,
      variation: Math.max(0, parameters.cliffLayer1BlockWidthVariationMeters),
    }
  }
  if (layerIndex === 1) {
    return {
      average: Math.max(0.9, parameters.cliffLayer2BlockWidthMeters),
      distribution: parameters.cliffLayer2BlockWidthVariationDistribution,
      variation: Math.max(0, parameters.cliffLayer2BlockWidthVariationMeters),
    }
  }
  return {
    average: Math.max(0.9, parameters.cliffLayer3BlockWidthMeters),
    distribution: parameters.cliffLayer3BlockWidthVariationDistribution,
    variation: Math.max(0, parameters.cliffLayer3BlockWidthVariationMeters),
  }
}

function stylizedCliffLayerTopFraction(
  layerIndex: number,
  seed: number,
  parameters: PascalWaterElevationParameters,
) {
  if (layerIndex === 0) return 1

  const average =
    layerIndex === 1 ? parameters.cliffLayer2AltitudeRatio : parameters.cliffLayer3AltitudeRatio
  const variation =
    layerIndex === 1
      ? parameters.cliffLayer2AltitudeVariation
      : parameters.cliffLayer3AltitudeVariation
  const distribution =
    layerIndex === 1
      ? parameters.cliffLayer2AltitudeVariationDistribution
      : parameters.cliffLayer3AltitudeVariationDistribution
  const jitter = stylizedCliffVariationOffset(seed, 53.9, variation, distribution)
  const upperBound =
    layerIndex === 1 ? 0.92 : Math.min(0.86, parameters.cliffLayer2AltitudeRatio - 0.08)
  return clampRange(average + jitter, 0.08, Math.max(0.12, upperBound))
}

function stylizedCliffLayerExtrusion(
  layerIndex: number,
  seed: number,
  parameters: PascalWaterElevationParameters,
) {
  const { average, distribution, variation } = stylizedCliffLayerExtrusionParameters(
    layerIndex,
    parameters,
  )
  const jitter = stylizedCliffVariationOffset(seed, 61.7, variation, distribution)
  return average + jitter
}

function stylizedCliffLayerExtrusionParameters(
  layerIndex: number,
  parameters: PascalWaterElevationParameters,
) {
  const average = Math.max(
    0.05,
    layerIndex === 0
      ? parameters.cliffLayer1ExtrusionAverageMeters
      : layerIndex === 1
        ? parameters.cliffLayer2ExtrusionAverageMeters
        : parameters.cliffLayer3ExtrusionAverageMeters,
  )
  const variation = Math.min(
    Math.max(
      0,
      layerIndex === 0
        ? parameters.cliffLayer1ExtrusionVariationMeters
        : layerIndex === 1
          ? parameters.cliffLayer2ExtrusionVariationMeters
          : parameters.cliffLayer3ExtrusionVariationMeters,
    ),
    average * 0.45,
  )
  const distribution =
    layerIndex === 0
      ? parameters.cliffLayer1ExtrusionVariationDistribution
      : layerIndex === 1
        ? parameters.cliffLayer2ExtrusionVariationDistribution
        : parameters.cliffLayer3ExtrusionVariationDistribution
  return { average, distribution, variation }
}

function stylizedCliffLayerSlope(seed: number, parameters: PascalWaterElevationParameters) {
  const average = Math.max(0, parameters.cliffAverageSlope)
  const variation = Math.max(0, parameters.cliffSlopeVariation)
  const jitter = stylizedCliffVariationOffset(
    seed,
    67.9,
    variation,
    parameters.cliffSlopeVariationDistribution,
  )
  return Math.max(0, average + jitter)
}

function stylizedCliffVariationOffset(
  seed: number,
  salt: number,
  variation: number,
  distribution: number,
) {
  const span = Math.max(0, variation)
  if (span <= 0) return 0
  return stylizedCliffDistributionSample(seed, salt, distribution) * span
}

function stylizedCliffDistributionSample(seed: number, salt: number, distribution: number) {
  const uniform = hashUnit(seed, salt) * 2 - 1
  const centered =
    ((hashUnit(seed, salt + 17.17) + hashUnit(seed, salt + 31.31) + hashUnit(seed, salt + 43.43)) /
      3 -
      0.5) *
    2
  const weight = Number.isFinite(distribution) ? clamp01(distribution) : 0
  return lerp(uniform, centered, weight)
}

function stylizedCliffColumnEdgeOffsets(
  column: StylizedCliffColumn,
  index: number,
  cliffHeight: number,
): { bottoms: number[]; tops: number[] } {
  const tops: number[] = []
  const bottoms: number[] = []

  for (let stratum = 0; stratum < column.strata.length; stratum += 1) {
    const spec = column.strata[stratum]
    if (!spec) continue

    const jitter =
      column.layerIndex === 0
        ? 0
        : stylizedCliffOffsetJitter(index, stratum) * (stratum === 0 ? 1 : 0.7)
    const floor = column.layerIndex === 0 ? 0 : Math.max(0.06, 0.1 - stratum * 0.02)
    const previousTop = tops[stratum - 1]
    let top = Math.max(floor, spec.offset + jitter)
    if (previousTop !== undefined) top = Math.max(floor, Math.min(top, previousTop - 0.02))

    const lowFraction = 0
    const stratumHeight = Math.max(0.2, (spec.topFraction - lowFraction) * cliffHeight)
    let bottom = top + spec.slopeFactor * stratumHeight
    if (previousTop !== undefined) bottom = Math.max(top, Math.min(bottom, previousTop - 0.01))

    tops.push(top)
    bottoms.push(bottom)
  }

  return { bottoms, tops }
}

function stylizedCliffColumnTops(column: StylizedCliffColumn, index: number): number[] {
  const tops: number[] = []
  for (let boundary = 0; boundary < column.strata.length - 1; boundary += 1) {
    const base = column.strata[boundary]?.topFraction ?? 0.5
    const jitter = (hashUnit(index * 3.71 + boundary * 57.3, 9.13) - 0.5) * 0.08
    const previous = tops[boundary - 1] ?? 0.06
    tops.push(clampRange(base + jitter, previous + 0.08, 0.94))
  }
  return tops
}

function stylizedCliffColumnDrops(
  column: StylizedCliffColumn,
  index: number,
  cliffHeight: number,
): number[] {
  return column.strata.map((_, stratum) =>
    stratum === column.strata.length - 1
      ? anchorCliffRimDrop(index, cliffHeight)
      : anchorCliffLedgeDrop(stratum, index, cliffHeight),
  )
}

function anchorCliffLedgeDrop(stratum: number, index: number, cliffHeight: number) {
  const raw = 0.12 + hashUnit(index * 7.77, stratum * 31.7 + 2.21) * 0.24
  return Math.min(raw, Math.max(0.02, cliffHeight * 0.055))
}

function anchorCliffRimDrop(index: number, cliffHeight: number) {
  const raw = 0.05 + hashUnit(index * 5.31, 77.7) * 0.12
  return Math.min(raw, Math.max(0.01, cliffHeight * 0.03))
}

function stylizedCliffOffsetJitter(index: number, stratum: number) {
  return (hashUnit(index * 12.91 + stratum * 41.3, 6.17) - 0.5) * 2 * CLIFF_OFFSET_JITTER_METERS
}

function stylizedCliffFacetJitter(index: number, stratum: number) {
  return (hashUnit(index * 9.73 + stratum * 27.9, 15.31) - 0.5) * 2 * CLIFF_FACET_JITTER_METERS
}

function stylizedCliffPoint(
  frame: CliffStationFrame,
  t: number,
  outwardOffset: number,
  outerElevation: number,
  innerElevation: number,
  yAdjust = 0,
): CliffVertex {
  return {
    x: frame.inner.x + frame.outward.x * outwardOffset,
    y: lerp(outerElevation, innerElevation, t) + yAdjust,
    z: frame.inner.z + frame.outward.z * outwardOffset,
  }
}

type StylizedCliffColumnProfile = {
  bottomOffsets: readonly (readonly number[])[]
  drops: readonly (readonly number[])[]
  midOffsets: readonly (readonly number[])[]
  stratumTops: readonly (readonly number[])[]
  topOffsets: readonly (readonly number[])[]
}

function createStylizedCliffColumnProfile(
  column: StylizedCliffColumn,
  pointCount: number,
  cliffHeight: number,
): StylizedCliffColumnProfile {
  const steps = column.segmentCount
  const anchorSteps: number[] = []
  for (let step = 0; step < steps; step += CLIFF_FACET_ANCHOR_STEP) anchorSteps.push(step)
  anchorSteps.push(steps)

  const anchorIndices = anchorSteps.map((step) => (column.startIndex + step) % pointCount)
  const anchorEdges = anchorIndices.map((index) =>
    stylizedCliffColumnEdgeOffsets(column, index, cliffHeight),
  )
  const anchorMidOffsets = anchorIndices.map((index, anchor) => {
    const edges = anchorEdges[anchor]
    return column.strata.map((_, stratum) => {
      const top = edges?.tops[stratum] ?? 0.1
      const bottom = edges?.bottoms[stratum] ?? top
      const slope = column.strata[stratum]?.slopeFactor ?? 0
      return (top + bottom) / 2 + stylizedCliffFacetJitter(index, stratum) * slope
    })
  })
  const anchorTops = anchorIndices.map((index) => stylizedCliffColumnTops(column, index))
  const anchorDrops = anchorIndices.map((index) =>
    stylizedCliffColumnDrops(column, index, cliffHeight),
  )

  const bottomOffsets: number[][] = []
  const drops: number[][] = []
  const midOffsets: number[][] = []
  const stratumTops: number[][] = []
  const topOffsets: number[][] = []
  for (let step = 0; step <= steps; step += 1) {
    const anchor = Math.min(
      Math.floor(step / CLIFF_FACET_ANCHOR_STEP),
      Math.max(0, anchorSteps.length - 2),
    )
    const lowStep = anchorSteps[anchor] ?? 0
    const highStep = anchorSteps[anchor + 1] ?? steps
    const blend = highStep > lowStep ? (step - lowStep) / (highStep - lowStep) : 0
    const lowEdges = anchorEdges[anchor]
    const highEdges = anchorEdges[anchor + 1] ?? lowEdges
    const lowMid = anchorMidOffsets[anchor] ?? []
    const highMid = anchorMidOffsets[anchor + 1] ?? lowMid
    const lowTops = anchorTops[anchor] ?? []
    const highTops = anchorTops[anchor + 1] ?? lowTops
    const lowDrops = anchorDrops[anchor] ?? []
    const highDrops = anchorDrops[anchor + 1] ?? lowDrops

    topOffsets.push(
      column.strata.map((_, stratum) => {
        const low = lowEdges?.tops[stratum] ?? 0.1
        return lerp(low, highEdges?.tops[stratum] ?? low, blend)
      }),
    )
    bottomOffsets.push(
      column.strata.map((_, stratum) => {
        const low = lowEdges?.bottoms[stratum] ?? 0.1
        return lerp(low, highEdges?.bottoms[stratum] ?? low, blend)
      }),
    )
    midOffsets.push(lowMid.map((value, stratum) => lerp(value, highMid[stratum] ?? value, blend)))
    stratumTops.push(
      lowTops.map((value, boundary) => lerp(value, highTops[boundary] ?? value, blend)),
    )
    drops.push(lowDrops.map((value, stratum) => lerp(value, highDrops[stratum] ?? value, blend)))
  }

  return {
    bottomOffsets,
    drops,
    midOffsets,
    stratumTops,
    topOffsets,
  }
}

function createStylizedCliffColumnProfiles(
  frames: readonly CliffStationFrame[],
  columnLayers: readonly (readonly StylizedCliffColumn[])[],
  pointCount: number,
  cliffHeight: number,
  outerElevation: number,
  innerElevation: number,
) {
  const profiles = new Map<StylizedCliffColumn, StylizedCliffColumnProfile>()
  let backingStations: readonly (readonly StylizedCliffColumnStation[])[] | null = null

  for (const columns of columnLayers) {
    for (const column of columns) {
      const generatedProfile = createStylizedCliffColumnProfile(column, pointCount, cliffHeight)
      const relativeProfile = column.enabled
        ? generatedProfile
        : createStylizedCliffSkippedColumnProfile(generatedProfile)
      const profile = backingStations
        ? attachStylizedCliffColumnProfile(
            frames,
            column,
            relativeProfile,
            backingStations,
            profiles,
            pointCount,
            outerElevation,
            innerElevation,
          )
        : relativeProfile
      profiles.set(column, profile)
    }
    const occupiedStations = createStylizedCliffColumnStations(
      columns.filter((column) => column.enabled),
      pointCount,
    )
    backingStations = backingStations
      ? mergeStylizedCliffColumnStations(backingStations, occupiedStations)
      : occupiedStations
  }

  return profiles
}

function createStylizedCliffSkippedColumnProfile(
  profile: StylizedCliffColumnProfile,
): StylizedCliffColumnProfile {
  const zeroOffsets = (rows: readonly (readonly number[])[]) => rows.map((row) => row.map(() => 0))
  return {
    bottomOffsets: zeroOffsets(profile.bottomOffsets),
    drops: zeroOffsets(profile.drops),
    midOffsets: zeroOffsets(profile.midOffsets),
    stratumTops: profile.stratumTops,
    topOffsets: zeroOffsets(profile.topOffsets),
  }
}

function mergeStylizedCliffColumnStations(
  backing: readonly (readonly StylizedCliffColumnStation[])[],
  additions: readonly (readonly StylizedCliffColumnStation[])[],
) {
  return backing.map((stations, index) => [...stations, ...(additions[index] ?? [])])
}

function createStylizedCliffColumnStations(
  columns: readonly StylizedCliffColumn[],
  pointCount: number,
) {
  const stations: StylizedCliffColumnStation[][] = Array.from({ length: pointCount }, () => [])
  for (const column of columns) {
    for (let step = 0; step <= column.segmentCount; step += 1) {
      const station = stations[(column.startIndex + step) % pointCount]
      station?.push({ column, step })
    }
  }
  return stations
}

function attachStylizedCliffColumnProfile(
  frames: readonly CliffStationFrame[],
  column: StylizedCliffColumn,
  relativeProfile: StylizedCliffColumnProfile,
  backingStations: readonly (readonly StylizedCliffColumnStation[])[],
  backingProfiles: ReadonlyMap<StylizedCliffColumn, StylizedCliffColumnProfile>,
  pointCount: number,
  outerElevation: number,
  innerElevation: number,
): StylizedCliffColumnProfile {
  const topFraction = column.strata.at(-1)?.topFraction ?? 1
  const targetElevation = lerp(outerElevation, innerElevation, topFraction)
  const backingOffsets: number[] = []

  for (let step = 0; step <= column.segmentCount; step += 1) {
    const stationIndex = (column.startIndex + step) % pointCount
    let backingOffset = Number.NEGATIVE_INFINITY

    for (const backingStation of backingStations[stationIndex] ?? []) {
      const backingProfile = backingProfiles.get(backingStation.column)
      if (!backingProfile) continue
      const sideProfile = createStylizedCliffSideProfile(
        frames,
        backingStation.column,
        backingProfile,
        backingStation.step,
        pointCount,
        outerElevation,
        innerElevation,
        false,
      )
      if (!sideProfile) continue
      backingOffset = Math.max(
        backingOffset,
        sampleStylizedCliffSideProfile(sideProfile, targetElevation).outwardOffset,
      )
    }

    backingOffsets.push(Number.isFinite(backingOffset) ? backingOffset : 0)
  }

  return {
    bottomOffsets: offsetStylizedCliffProfile(relativeProfile.bottomOffsets, backingOffsets),
    drops: relativeProfile.drops,
    midOffsets: offsetStylizedCliffProfile(relativeProfile.midOffsets, backingOffsets),
    stratumTops: relativeProfile.stratumTops,
    topOffsets: offsetStylizedCliffProfile(relativeProfile.topOffsets, backingOffsets),
  }
}

function offsetStylizedCliffProfile(
  profile: readonly (readonly number[])[],
  backingOffsets: readonly number[],
) {
  return profile.map((offsets, step) => {
    const backingOffset = backingOffsets[step] ?? 0
    return offsets.map((offset) => offset + backingOffset)
  })
}

function emitStylizedCliffColumn(
  sink: CliffGeometrySink,
  frames: readonly CliffStationFrame[],
  column: StylizedCliffColumn,
  profile: StylizedCliffColumnProfile,
  pointCount: number,
  outerElevation: number,
  innerElevation: number,
) {
  for (let step = 0; step < column.segmentCount; step += 1) {
    const index = (column.startIndex + step) % pointCount
    const nextIndex = (index + 1) % pointCount
    const frame = frames[index]
    const nextFrame = frames[nextIndex]
    if (!(frame && nextFrame)) continue

    const topOffsets = profile.topOffsets[step] ?? []
    const nextTopOffsets = profile.topOffsets[step + 1] ?? topOffsets
    const bottomOffsets = profile.bottomOffsets[step] ?? topOffsets
    const nextBottomOffsets = profile.bottomOffsets[step + 1] ?? nextTopOffsets
    const midOffsets = profile.midOffsets[step] ?? topOffsets
    const nextMidOffsets = profile.midOffsets[step + 1] ?? nextTopOffsets
    const stratumTops = profile.stratumTops[step] ?? []
    const nextStratumTops = profile.stratumTops[step + 1] ?? stratumTops
    const stepDrops = profile.drops[step] ?? []
    const nextStepDrops = profile.drops[step + 1] ?? stepDrops
    const lastStratum = column.strata.length - 1

    for (let stratum = 0; stratum < column.strata.length; stratum += 1) {
      const spec = column.strata[stratum]
      if (!spec) continue
      const lowT = stratum === 0 ? 0 : (stratumTops[stratum - 1] ?? 0.36)
      const highT =
        stratum === lastStratum ? spec.topFraction : (stratumTops[stratum] ?? spec.topFraction)
      const nextLowT = stratum === 0 ? 0 : (nextStratumTops[stratum - 1] ?? 0.36)
      const nextHighT =
        stratum === lastStratum ? spec.topFraction : (nextStratumTops[stratum] ?? highT)
      const topDrop = stepDrops[stratum] ?? 0.12
      const nextTopDrop = nextStepDrops[stratum] ?? 0.12
      const offset = topOffsets[stratum] ?? 0.1
      const nextOffset = nextTopOffsets[stratum] ?? 0.1
      const bottomOffset = bottomOffsets[stratum] ?? offset
      const nextBottomOffset = nextBottomOffsets[stratum] ?? nextOffset
      const midT = (lowT + highT) / 2
      const nextMidT = (nextLowT + nextHighT) / 2
      const midOffset = midOffsets[stratum] ?? offset
      const nextMidOffset = nextMidOffsets[stratum] ?? nextOffset
      const wallHint: CliffNormal = {
        x: (frame.outward.x + nextFrame.outward.x) / 2,
        y: 0.15,
        z: (frame.outward.z + nextFrame.outward.z) / 2,
      }
      const lower0 = stylizedCliffPoint(frame, lowT, bottomOffset, outerElevation, innerElevation)
      const lower1 = stylizedCliffPoint(
        nextFrame,
        nextLowT,
        nextBottomOffset,
        outerElevation,
        innerElevation,
      )
      const mid0 = stylizedCliffPoint(frame, midT, midOffset, outerElevation, innerElevation)
      const mid1 = stylizedCliffPoint(
        nextFrame,
        nextMidT,
        nextMidOffset,
        outerElevation,
        innerElevation,
      )
      const upper0 = stylizedCliffPoint(
        frame,
        highT,
        offset,
        outerElevation,
        innerElevation,
        -topDrop,
      )
      const upper1 = stylizedCliffPoint(
        nextFrame,
        nextHighT,
        nextOffset,
        outerElevation,
        innerElevation,
        -nextTopDrop,
      )

      if (hashUnit(index * 3.91, stratum * 11.3 + 1.7) < 0.5) {
        addStylizedCliffTriangle(
          sink,
          [lower0, lower1, mid1],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [lower0, mid1, mid0],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [mid0, mid1, upper1],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [mid0, upper1, upper0],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
      } else {
        addStylizedCliffTriangle(
          sink,
          [lower0, lower1, mid0],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [lower1, mid1, mid0],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [mid0, mid1, upper0],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [mid1, upper1, upper0],
          wallHint,
          column.family,
          'dim',
          column.brightness,
        )
      }

      const ledgeHint: CliffNormal = {
        x: wallHint.x * 0.35,
        y: 1,
        z: wallHint.z * 0.35,
      }

      if (stratum < lastStratum) {
        const upperOffset = bottomOffsets[stratum + 1] ?? 0.08
        const nextUpperOffset = nextBottomOffsets[stratum + 1] ?? 0.08
        const ledgeInner0 = stylizedCliffPoint(
          frame,
          highT,
          upperOffset,
          outerElevation,
          innerElevation,
        )
        const ledgeInner1 = stylizedCliffPoint(
          nextFrame,
          nextHighT,
          nextUpperOffset,
          outerElevation,
          innerElevation,
        )
        addStylizedCliffTriangle(
          sink,
          [upper0, upper1, ledgeInner1],
          ledgeHint,
          column.family,
          'light',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [upper0, ledgeInner1, ledgeInner0],
          ledgeHint,
          column.family,
          'light',
          column.brightness,
        )
      } else {
        // Overlap the backing layers so mismatched rock boundaries cannot expose wedges.
        const plateau0 =
          column.layerIndex === 0
            ? stylizedCliffPoint(frame, 1, 0, outerElevation, innerElevation)
            : stylizedCliffPoint(frame, highT, 0, outerElevation, innerElevation)
        const plateau1 =
          column.layerIndex === 0
            ? stylizedCliffPoint(nextFrame, 1, 0, outerElevation, innerElevation)
            : stylizedCliffPoint(nextFrame, nextHighT, 0, outerElevation, innerElevation)
        addStylizedCliffTriangle(
          sink,
          [upper0, upper1, plateau1],
          ledgeHint,
          column.family,
          'light',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [upper0, plateau1, plateau0],
          ledgeHint,
          column.family,
          'light',
          column.brightness,
        )
      }

      if (stratum === 0) {
        const skirt0: CliffVertex = {
          x: lower0.x,
          y: outerElevation - CLIFF_SKIRT_DROP_METERS,
          z: lower0.z,
        }
        const skirt1: CliffVertex = {
          x: lower1.x,
          y: outerElevation - CLIFF_SKIRT_DROP_METERS,
          z: lower1.z,
        }
        const skirtHint: CliffNormal = { x: wallHint.x, y: 0, z: wallHint.z }
        addStylizedCliffTriangle(
          sink,
          [skirt0, skirt1, lower1],
          skirtHint,
          column.family,
          'shade',
          column.brightness,
        )
        addStylizedCliffTriangle(
          sink,
          [skirt0, lower1, lower0],
          skirtHint,
          column.family,
          'shade',
          column.brightness,
        )
      }
    }
  }
}

function emitStylizedCliffSeam(
  sink: CliffGeometrySink,
  frames: readonly CliffStationFrame[],
  innerPoints: readonly PascalWaterPoint2[],
  column: StylizedCliffColumn,
  columnProfile: StylizedCliffColumnProfile,
  nextColumn: StylizedCliffColumn,
  nextColumnProfile: StylizedCliffColumnProfile,
  pointCount: number,
  outerElevation: number,
  innerElevation: number,
) {
  const boundaryIndex = nextColumn.startIndex

  const previousPoint = innerPoints[(boundaryIndex - 1 + pointCount) % pointCount]
  const nextPoint = innerPoints[(boundaryIndex + 1) % pointCount]
  if (!(previousPoint && nextPoint)) return

  const tangent = normalize2(nextPoint.x - previousPoint.x, nextPoint.z - previousPoint.z)
  const currentProfile = createStylizedCliffSideProfile(
    frames,
    column,
    columnProfile,
    column.segmentCount,
    pointCount,
    outerElevation,
    innerElevation,
  )
  const nextProfile = createStylizedCliffSideProfile(
    frames,
    nextColumn,
    nextColumnProfile,
    0,
    pointCount,
    outerElevation,
    innerElevation,
  )
  if (!(currentProfile && nextProfile)) return

  const breakpoints = createStylizedCliffProfileBreakpoints(currentProfile, nextProfile)

  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const y0 = breakpoints[index]
    const y1 = breakpoints[index + 1]
    if (y0 === undefined || y1 === undefined || y1 - y0 <= CLIFF_PROFILE_EPSILON) continue

    const currentBottom = sampleStylizedCliffSideProfile(currentProfile, y0)
    const currentTop = sampleStylizedCliffSideProfile(currentProfile, y1)
    const nextBottom = sampleStylizedCliffSideProfile(nextProfile, y0)
    const nextTop = sampleStylizedCliffSideProfile(nextProfile, y1)
    const stripDelta =
      (currentBottom.outwardOffset +
        currentTop.outwardOffset -
        nextBottom.outwardOffset -
        nextTop.outwardOffset) /
      2
    const stripSign = stripDelta >= 0 ? 1 : -1
    const seamHint: CliffNormal = { x: tangent.x * stripSign, y: 0, z: tangent.z * stripSign }
    const seamColumn = stripSign >= 0 ? column : nextColumn

    emitStylizedCliffProfileStrip(
      sink,
      currentBottom,
      currentTop,
      nextBottom,
      nextTop,
      seamHint,
      seamColumn.family,
      'shade',
      seamColumn.brightness,
    )
  }
}

function createStylizedCliffSideProfile(
  frames: readonly CliffStationFrame[],
  column: StylizedCliffColumn,
  columnProfile: StylizedCliffColumnProfile,
  step: number,
  pointCount: number,
  outerElevation: number,
  innerElevation: number,
  includeTopCap = true,
): StylizedCliffSideProfile | null {
  const frame = frames[(column.startIndex + step) % pointCount]
  if (!frame) return null

  const topOffsets = columnProfile.topOffsets[step] ?? []
  const bottomOffsets = columnProfile.bottomOffsets[step] ?? topOffsets
  const midOffsets = columnProfile.midOffsets[step] ?? topOffsets
  const stratumTops = columnProfile.stratumTops[step] ?? []
  const drops = columnProfile.drops[step] ?? []
  const lastStratum = column.strata.length - 1
  const points: StylizedCliffProfilePoint[] = []

  pushStylizedCliffProfilePoint(
    points,
    stylizedCliffProfilePoint(
      frame,
      0,
      bottomOffsets[0] ?? 0.1,
      outerElevation,
      innerElevation,
      -CLIFF_SKIRT_DROP_METERS,
    ),
  )

  for (let stratum = 0; stratum < column.strata.length; stratum += 1) {
    const spec = column.strata[stratum]
    if (!spec) continue
    const lowT = stratum === 0 ? 0 : (stratumTops[stratum - 1] ?? 0.36)
    const highT =
      stratum === lastStratum ? spec.topFraction : (stratumTops[stratum] ?? spec.topFraction)
    const midT = (lowT + highT) / 2
    const offset = topOffsets[stratum] ?? 0.1
    const bottomOffset = bottomOffsets[stratum] ?? offset
    const midOffset = midOffsets[stratum] ?? offset
    const topDrop = drops[stratum] ?? 0.12

    pushStylizedCliffProfilePoint(
      points,
      stylizedCliffProfilePoint(frame, lowT, bottomOffset, outerElevation, innerElevation),
    )
    pushStylizedCliffProfilePoint(
      points,
      stylizedCliffProfilePoint(frame, midT, midOffset, outerElevation, innerElevation),
    )
    pushStylizedCliffProfilePoint(
      points,
      stylizedCliffProfilePoint(frame, highT, offset, outerElevation, innerElevation, -topDrop),
    )

    if (stratum < lastStratum) {
      pushStylizedCliffProfilePoint(
        points,
        stylizedCliffProfilePoint(
          frame,
          highT,
          bottomOffsets[stratum + 1] ?? 0.08,
          outerElevation,
          innerElevation,
        ),
      )
    } else if (includeTopCap) {
      const ledgeT = column.layerIndex === 0 ? 1 : highT
      pushStylizedCliffProfilePoint(
        points,
        stylizedCliffProfilePoint(frame, ledgeT, 0, outerElevation, innerElevation),
      )
    }
  }

  return points.length >= 2 ? { frame, points } : null
}

function stylizedCliffProfilePoint(
  frame: CliffStationFrame,
  t: number,
  outwardOffset: number,
  outerElevation: number,
  innerElevation: number,
  yAdjust = 0,
): StylizedCliffProfilePoint {
  return {
    outwardOffset,
    vertex: stylizedCliffPoint(frame, t, outwardOffset, outerElevation, innerElevation, yAdjust),
  }
}

function pushStylizedCliffProfilePoint(
  points: StylizedCliffProfilePoint[],
  point: StylizedCliffProfilePoint,
) {
  const previous = points.at(-1)
  if (
    previous &&
    distance3(previous.vertex, point.vertex) <= CLIFF_PROFILE_EPSILON &&
    Math.abs(previous.outwardOffset - point.outwardOffset) <= CLIFF_PROFILE_EPSILON
  ) {
    return
  }

  points.push(point)
}

function createStylizedCliffProfileBreakpoints(
  currentProfile: StylizedCliffSideProfile,
  nextProfile: StylizedCliffSideProfile,
) {
  const breakpoints = uniqueSortedProfileBreakpoints([
    ...currentProfile.points.map((point) => point.vertex.y),
    ...nextProfile.points.map((point) => point.vertex.y),
  ])
  const crossingBreakpoints: number[] = []

  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const y0 = breakpoints[index]
    const y1 = breakpoints[index + 1]
    if (y0 === undefined || y1 === undefined || y1 - y0 <= CLIFF_PROFILE_EPSILON) continue

    const delta0 =
      sampleStylizedCliffSideProfile(currentProfile, y0).outwardOffset -
      sampleStylizedCliffSideProfile(nextProfile, y0).outwardOffset
    const delta1 =
      sampleStylizedCliffSideProfile(currentProfile, y1).outwardOffset -
      sampleStylizedCliffSideProfile(nextProfile, y1).outwardOffset
    if (Math.abs(delta0) <= CLIFF_PROFILE_EPSILON || Math.abs(delta1) <= CLIFF_PROFILE_EPSILON) {
      continue
    }
    if (delta0 * delta1 >= 0) continue

    crossingBreakpoints.push(lerp(y0, y1, Math.abs(delta0) / (Math.abs(delta0) + Math.abs(delta1))))
  }

  return uniqueSortedProfileBreakpoints([...breakpoints, ...crossingBreakpoints])
}

function uniqueSortedProfileBreakpoints(values: readonly number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((first, second) => first - second)
  const unique: number[] = []
  for (const value of sorted) {
    const previous = unique.at(-1)
    if (previous === undefined || Math.abs(value - previous) > CLIFF_PROFILE_EPSILON) {
      unique.push(value)
    }
  }
  return unique
}

function sampleStylizedCliffSideProfile(
  profile: StylizedCliffSideProfile,
  y: number,
): StylizedCliffProfilePoint {
  const first = profile.points[0]
  const last = profile.points.at(-1)
  if (!first || !last) {
    return { outwardOffset: 0, vertex: { x: 0, y, z: 0 } }
  }
  if (y <= first.vertex.y + CLIFF_PROFILE_EPSILON) return first
  if (y >= last.vertex.y - CLIFF_PROFILE_EPSILON) return last

  for (let index = 0; index < profile.points.length - 1; index += 1) {
    const lower = profile.points[index]
    const upper = profile.points[index + 1]
    if (!(lower && upper)) continue
    const minY = Math.min(lower.vertex.y, upper.vertex.y)
    const maxY = Math.max(lower.vertex.y, upper.vertex.y)
    if (y < minY - CLIFF_PROFILE_EPSILON || y > maxY + CLIFF_PROFILE_EPSILON) continue

    const span = upper.vertex.y - lower.vertex.y
    const t = Math.abs(span) <= CLIFF_PROFILE_EPSILON ? 0 : (y - lower.vertex.y) / span
    return {
      outwardOffset: lerp(lower.outwardOffset, upper.outwardOffset, t),
      vertex: lerpCliffVertex(lower.vertex, upper.vertex, t),
    }
  }

  return last
}

function lerpCliffVertex(first: CliffVertex, second: CliffVertex, t: number): CliffVertex {
  return {
    x: lerp(first.x, second.x, t),
    y: lerp(first.y, second.y, t),
    z: lerp(first.z, second.z, t),
  }
}

function emitStylizedCliffProfileStrip(
  sink: CliffGeometrySink,
  currentBottom: StylizedCliffProfilePoint,
  currentTop: StylizedCliffProfilePoint,
  nextBottom: StylizedCliffProfilePoint,
  nextTop: StylizedCliffProfilePoint,
  seamHint: CliffNormal,
  family: CliffColorFamily,
  exposure: CliffExposure,
  brightness: number,
) {
  const bottomGap = currentBottom.outwardOffset - nextBottom.outwardOffset
  const topGap = currentTop.outwardOffset - nextTop.outwardOffset
  if (Math.abs(bottomGap) <= CLIFF_PROFILE_EPSILON && Math.abs(topGap) <= CLIFF_PROFILE_EPSILON) {
    return
  }
  if (bottomGap * topGap < -CLIFF_PROFILE_EPSILON) return

  addStylizedCliffTriangle(
    sink,
    [currentBottom.vertex, nextBottom.vertex, nextTop.vertex],
    seamHint,
    family,
    exposure,
    brightness,
  )
  addStylizedCliffTriangle(
    sink,
    [currentBottom.vertex, nextTop.vertex, currentTop.vertex],
    seamHint,
    family,
    exposure,
    brightness,
  )
}

function addStylizedCliffTriangle(
  sink: CliffGeometrySink,
  vertices: CliffTriangle,
  hint: CliffNormal,
  family: CliffColorFamily,
  exposure: CliffExposure,
  brightness: number,
) {
  let normal = normalForRenderableTriangle(vertices)
  if (!normal) return
  let oriented = vertices
  let geometryNormal = normal
  if (dot3(normal, hint) < 0) {
    oriented = [vertices[0], vertices[2], vertices[1]] as CliffTriangle
    normal = { x: -normal.x, y: -normal.y, z: -normal.z }
    geometryNormal = normalForTriangle(oriented)
  }

  const color = stylizedCliffExposureColor(normal, family, exposure, brightness)
  addColoredTriangle(sink, oriented, color, geometryNormal)
}

function stylizedCliffExposureColor(
  normal: CliffNormal,
  family: CliffColorFamily,
  exposure: CliffExposure,
  brightness: number,
): CliffColor {
  let resolvedExposure = exposure
  if (normal.y >= CLIFF_EXPOSURE_LIGHT_NORMAL_Y) {
    resolvedExposure = 'light'
  } else if (normal.y <= CLIFF_EXPOSURE_SHADE_NORMAL_Y) {
    resolvedExposure = 'shade'
  }

  const color = family[resolvedExposure]
  return brightness === 1 ? color : scaleColor(color, brightness)
}

function createCliffReferenceFamilyRamp(variationCount: number): readonly CliffColorFamily[] {
  const first = CLIFF_REFERENCE_FAMILIES[0]!
  const last = CLIFF_REFERENCE_FAMILIES[1]!
  const familyCount = variationCount + 2
  const families = Array.from({ length: familyCount }, (_, index) => {
    const t = index / Math.max(1, familyCount - 1)
    return {
      dim: mixColor(first.dim, last.dim, t),
      light: mixColor(first.light, last.light, t),
      shade: mixColor(first.shade, last.shade, t),
      weight: lerp(first.weight, last.weight, t),
    }
  })
  const totalWeight = families.reduce((total, family) => total + family.weight, 0)
  return families.map((family) => ({
    dim: srgbCliffColorToLinear(family.dim),
    light: srgbCliffColorToLinear(family.light),
    shade: srgbCliffColorToLinear(family.shade),
    weight: family.weight / totalWeight,
  }))
}

function stylizedCliffFamilyRamp(variationCount: number) {
  const index = clampRange(Math.round(variationCount), 0, CLIFF_MAX_COLOR_FAMILY_VARIATIONS)
  return CLIFF_REFERENCE_FAMILY_RAMPS[index] ?? CLIFF_REFERENCE_FAMILY_RAMPS[0]!
}

function stylizedCliffFamilyDistributionSample(seed: number, salt: number, distribution: number) {
  const uniform = hashUnit(seed, salt)
  const weight = Number.isFinite(distribution) ? clamp01(distribution) : 0
  if (weight <= 0) return uniform

  const centered =
    (hashUnit(seed, salt + 17.17) + hashUnit(seed, salt + 31.31) + hashUnit(seed, salt + 43.43)) / 3
  return lerp(uniform, centered, weight)
}

function pickStylizedCliffFamily(
  seed: number,
  variationCount: number,
  distribution: number,
): CliffColorFamily {
  const families = stylizedCliffFamilyRamp(variationCount)
  const pick = stylizedCliffFamilyDistributionSample(seed, 3.7, distribution)
  let accumulated = 0
  for (const family of families) {
    accumulated += family.weight
    if (pick <= accumulated) return family
  }
  return families[0]!
}

function stylizedCliffBrightness(_seed: number, _parameters: PascalWaterElevationParameters) {
  return 1
}

function srgbCliffColor(red: number, green: number, blue: number): CliffColor {
  return [red / 255, green / 255, blue / 255]
}

function srgbCliffColorToLinear(color: CliffColor): CliffColor {
  return [
    srgbChannelToLinear(color[0]),
    srgbChannelToLinear(color[1]),
    srgbChannelToLinear(color[2]),
  ]
}

function srgbChannelToLinear(value: number) {
  const clamped = clamp01(value)
  return clamped <= 0.04045 ? clamped / 12.92 : ((clamped + 0.055) / 1.055) ** 2.4
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

function addColoredTriangle(
  sink: CliffGeometrySink,
  vertices: CliffTriangle,
  color: CliffColor,
  normal: CliffNormal,
) {
  ensureCliffGeometrySinkCapacity(sink, 3)
  const firstVertex = sink.vertexCount
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index]
    if (!vertex) continue
    const offset = (firstVertex + index) * 3
    sink.positions[offset] = vertex.x
    sink.positions[offset + 1] = vertex.y
    sink.positions[offset + 2] = vertex.z
    sink.colors[offset] = color[0]
    sink.colors[offset + 1] = color[1]
    sink.colors[offset + 2] = color[2]
    sink.normals[offset] = normal.x
    sink.normals[offset + 1] = normal.y
    sink.normals[offset + 2] = normal.z
  }
  const uvOffset = firstVertex * 2
  sink.uvs[uvOffset] = 0
  sink.uvs[uvOffset + 1] = 0
  sink.uvs[uvOffset + 2] = 1
  sink.uvs[uvOffset + 3] = 0
  sink.uvs[uvOffset + 4] = 0.5
  sink.uvs[uvOffset + 5] = 1
  sink.vertexCount += 3
}

function normalForRenderableTriangle(vertices: CliffTriangle): CliffNormal | null {
  const [first, second, third] = vertices
  const shortestEdgeSquared = Math.min(
    distanceSquared3(first, second),
    distanceSquared3(second, third),
    distanceSquared3(third, first),
  )
  if (shortestEdgeSquared < CLIFF_MIN_QUAD_EDGE_METERS ** 2) return null

  const normal = cross3(subtract3(second, first), subtract3(third, first))
  const length = Math.hypot(normal.x, normal.y, normal.z)
  if (length * 0.5 < CLIFF_MIN_QUAD_AREA_METERS * 0.5) return null

  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function normalForTriangle(vertices: CliffTriangle): CliffNormal {
  const [first, second, third] = vertices
  const normal = cross3(subtract3(second, first), subtract3(third, first))
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

function distance2(a: PascalWaterPoint2, b: PascalWaterPoint2) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function normalize2(x: number, z: number): PascalWaterPoint2 {
  const length = Math.hypot(x, z)
  if (length <= 0.000001) return { x: 0, z: 1 }
  return { x: x / length, z: z / length }
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

function cliffFaceColors(
  base: CliffColor,
  parameters: PascalWaterElevationParameters,
): CliffFaceColorSet {
  const contrast = parameters.cliffContrast

  return {
    bottom: scaleColor(base, 0.42 + contrast * 0.08),
    inner: scaleColor(base, 0.88 - contrast * 0.08),
    outer: scaleColor(base, 0.62 - contrast * 0.12),
    side: scaleColor(base, 0.7 - contrast * 0.1),
    top: base,
  }
}

function subtract3(a: CliffVertex, b: CliffVertex): CliffNormal {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

function cross3(a: CliffNormal, b: CliffNormal): CliffNormal {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot3(a: CliffNormal, b: CliffNormal) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function distance3(a: CliffVertex, b: CliffVertex) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function distanceSquared3(a: CliffVertex, b: CliffVertex) {
  const x = a.x - b.x
  const y = a.y - b.y
  const z = a.z - b.z
  return x * x + y * y + z * z
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
