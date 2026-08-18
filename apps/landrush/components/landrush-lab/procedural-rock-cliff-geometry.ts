import { LANDRUSH_WATER_SURFACE_ELEVATION, type PascalWaterLandSurface } from '@landrush/pascal-plugin'
import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Object3D, Vector3 } from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

export type ProceduralRockCliffDebugMode =
  | 'final'
  | 'height'
  | 'normals'
  | 'coverage'
  | 'variants'
  | 'wireframe'
export type ProceduralRockCliffQuality = 'balanced' | 'dense'

export type ProceduralBeachControls = {
  basinVariationMeters: number
  domainWarpMeters: number
  dryCoverage: number
  enabled: boolean
  gridSpacingMeters: number
  macroScaleMeters: number
  maximumEmergenceMeters: number
  profilePower: number
  shorelineDepthMeters: number
  surfaceVariationMeters: number
  widthMeters: number
  widthVariation: number
}

export type ProceduralRockCliffWallControls = {
  bottomElevationMeters: number
  coverageOverlap: number
  reliefDepthMeters: number
  rockHeightMeters: number
  rockWidthMeters: number
}

export type ProceduralRockOffshoreControls = {
  clusterCount: number
  clusterSpreadMeters: number
  compoundChance: number
  compoundMemberCount: number
  compoundSpreadRatio: number
  density: number
  exposure: number
  horizontalScaleChance: number
  horizontalScaleMaximum: number
  minimumSpacingRatio: number
  shoreDistanceMeters: number
  sizeScale: number
  sizeVariation: number
  submergedCrownDepthMaxMeters: number
  submergedCrownDepthMinMeters: number
  submergedFraction: number
}

export type ProceduralRockToneControls = {
  dryBottomToTopContribution: number
  offshoreGradientBias: number
}

export const DEFAULT_PROCEDURAL_BEACH_CONTROLS = {
  basinVariationMeters: 2.35,
  domainWarpMeters: 18,
  dryCoverage: 0.34,
  enabled: true,
  gridSpacingMeters: 2.25,
  macroScaleMeters: 54,
  maximumEmergenceMeters: 1.1,
  profilePower: 1.25,
  shorelineDepthMeters: 9.2,
  surfaceVariationMeters: 1.65,
  widthMeters: 72,
  widthVariation: 0.5,
} as const satisfies ProceduralBeachControls

export const DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS = {
  bottomElevationMeters: -10,
  coverageOverlap: 0.45,
  reliefDepthMeters: 2.45,
  rockHeightMeters: 2.9,
  rockWidthMeters: 3.55,
} as const satisfies ProceduralRockCliffWallControls

export const DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS = {
  clusterCount: 8,
  clusterSpreadMeters: 40,
  compoundChance: 0.55,
  compoundMemberCount: 3,
  compoundSpreadRatio: 0.44,
  density: 1.7,
  exposure: 0.3,
  horizontalScaleChance: 0.18,
  horizontalScaleMaximum: 2.3,
  minimumSpacingRatio: 0.92,
  shoreDistanceMeters: 2,
  sizeScale: 1,
  sizeVariation: 1,
  submergedCrownDepthMaxMeters: 3.25,
  submergedCrownDepthMinMeters: 0.35,
  submergedFraction: 0.28,
} as const satisfies ProceduralRockOffshoreControls

export const DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS = {
  dryBottomToTopContribution: 0.88,
  offshoreGradientBias: 0,
} as const satisfies ProceduralRockToneControls

export type ProceduralRockCliffMetrics = {
  backingTriangles: number
  beachExposedVertexRatio: number
  beachMaximumElevationMeters: number
  beachMinimumElevationMeters: number
  beachRadialBands: number
  beachSegments: number
  beachTriangles: number
  beachWidthMeters: number
  bottomElevationMeters: number
  columnCount: number
  cutCount: number
  drawCalls: number
  maximumColumnRockCount: number
  meanColumnRockCount: number
  minimumColumnRockCount: number
  offshoreClusterCount: number
  offshoreCompoundRockInstances: number
  offshoreFormationCount: number
  offshoreMinimumSpacingRatio: number
  offshoreOversizedRockInstances: number
  offshoreRockInstances: number
  offshoreSubmergedRockInstances: number
  offshoreTargetRockInstances: number
  renderedTriangles: number
  rockInstances: number
  seed: number
  sourceBoundaryEdges: number
  sourceTriangles: number
  sourceVertices: number
  variants: number
  wallHeightMeters: number
  wallRockInstances: number
}

type ProceduralRockPlacement = {
  coverageColor: Color
  pitch: number
  roll: number
  scaleX: number
  scaleY: number
  scaleZ: number
  submergedBottomElevation: number | null
  toneDomain: 'cliff' | 'offshore'
  toneOffset: number
  variant: number
  x: number
  y: number
  yaw: number
  z: number
}

type OffshoreOccupiedRock = {
  center: Point2
  cluster: number
  formationId: number
  radius: number
}

type OffshoreRockDimensions = {
  envelopeRadius: number
  formationScale: number
  horizontalScale: number
  oversized: boolean
  requiresCluster: boolean
  variant: number
  worldDepth: number
  worldHeight: number
  worldWidth: number
}

type PlacedOffshoreRock = {
  center: Point2
  cluster: number
  dimensions: OffshoreRockDimensions
  formationId: number
  fullySubmerged: boolean
  prominence: number
}

export type ProceduralRockCliffPlan = {
  coverageGeometry: BufferGeometry
  geometry: BufferGeometry
  metrics: ProceduralRockCliffMetrics
  variantGeometry: BufferGeometry
}

type Point2 = { x: number; z: number }
type PolyFace = Vector3[]
type RockColorZone = 'dry' | 'submerged'

type CompiledRockVertex = {
  diagnosticShade: number
  localHeightRatio: number
  normal: Vector3
  position: Vector3
  randomGradientRatio: number
}

type CompiledRockBuffers = {
  coverageColors: number[]
  finalColors: number[]
  normals: number[]
  positions: number[]
  variantColors: number[]
}

type CompiledRockColorContext = {
  coverageColor: Color
  dryBottomToTopContribution: number
  offshoreGradientBias: number
  toneOffset: number
  variantColor: Color
}

const ROCK_MATERIAL_PALETTE = [
  new Color('#8d5148'),
  new Color('#c16e50'),
  new Color('#e99a6d'),
] as const
const ROCK_TONE_WEIGHT_ALTITUDE = 0.6
const ROCK_TONE_WEIGHT_RANDOM_GRADIENT = 0.2
const ROCK_TONE_WEIGHT_LOCAL_HEIGHT = 0.1
const ROCK_TONE_WEIGHT_RANDOM_OFFSET = 0.1
const ROCK_BACKING_DEBUG_COLOR = new Color('#d6d0b6')
const ROCK_BACKING_VARIANT_COLOR = new Color('#7e8b86')
const ROCK_BACKING_WALL_GRASS_CLEARANCE = 0.04
const ROCK_BACKING_WALL_INSET_METERS = 0.5
const ROCK_OFFSHORE_FIELD = {
  beachSurfaceClearanceMeters: 3,
  denseDensityScale: 5.25 / 4.1,
  largeFormationCoreScale: 1.35,
  largeFormationScaleThreshold: 1.6,
  maximumClusterCount: 32,
  maximumCompoundMemberCount: 8,
  maximumDensity: 4,
  maximumHorizontalScale: 4,
  maximumShoreDistanceMeters: 96,
  maximumSizeScale: 4,
  maximumSizeVariation: 2.5,
  maximumSubmergedCrownDepthMeters: 9,
  minimumShoreClearanceMeters: 1.25,
  rocksPerCluster: 4.1,
} as const
const ROCK_SHAPE_PROFILES = [
  { bellyRadius: 1.12, crownRadius: 0.76, crestRadius: 0.46, lean: 0.08, shoulderRadius: 1 },
  { bellyRadius: 1.2, crownRadius: 0.54, crestRadius: 0.3, lean: 0.23, shoulderRadius: 0.82 },
  { bellyRadius: 0.96, crownRadius: 0.82, crestRadius: 0.52, lean: 0.16, shoulderRadius: 1.13 },
  { bellyRadius: 1.25, crownRadius: 0.65, crestRadius: 0.38, lean: 0.12, shoulderRadius: 0.91 },
  { bellyRadius: 1.04, crownRadius: 0.9, crestRadius: 0.58, lean: 0.2, shoulderRadius: 0.94 },
] as const
const BEACH_COVERAGE_COLOR = new Color('#d8ae4f')
const BEACH_VARIANT_COLOR = new Color('#b98e43')
const BEACH_BASE_COLOR = new Color('#d5ad56')
const BEACH_HIGHLIGHT_COLOR = new Color('#e2c36e')

export function createProceduralRockCliffPlan({
  beachControls = DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  cutCount,
  offshoreControls,
  quality,
  rockScale,
  seed,
  surface,
  toneControls,
  wallControls,
  waterSurfaceElevation = LANDRUSH_WATER_SURFACE_ELEVATION,
}: {
  beachControls?: ProceduralBeachControls
  cutCount: number
  offshoreControls: ProceduralRockOffshoreControls
  quality: ProceduralRockCliffQuality
  rockScale: number
  seed: number
  surface: PascalWaterLandSurface
  toneControls: ProceduralRockToneControls
  wallControls: ProceduralRockCliffWallControls
  waterSurfaceElevation?: number
}): ProceduralRockCliffPlan {
  const resolvedWaterSurfaceElevation = Number.isFinite(waterSurfaceElevation)
    ? waterSurfaceElevation
    : LANDRUSH_WATER_SURFACE_ELEVATION
  const variantCount = quality === 'dense' ? 36 : 24
  const perimeter = cleanRing(surface.grassSurfacePoints)
  const backingWallRing = offsetRingInward(perimeter, ROCK_BACKING_WALL_INSET_METERS)
  const sourceGeometries = Array.from({ length: variantCount }, (_, variant) =>
    createProceduralRockGeometry({ cutCount, seed: mixSeed(seed, variant + 1), variant }),
  )
  const requestedBottomElevation = Number.isFinite(wallControls.bottomElevationMeters)
    ? wallControls.bottomElevationMeters
    : DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.bottomElevationMeters
  const cliffBaseElevation = Math.min(
    requestedBottomElevation,
    resolvedWaterSurfaceElevation - 0.25,
  )
  const cliffTopElevation = surface.grassSurfaceElevation - ROCK_BACKING_WALL_GRASS_CLEARANCE
  const bathymetryField = createProceduralBathymetryField({
    bottomElevation: cliffBaseElevation,
    controls: beachControls,
    perimeter,
    seed,
    waterPlaneSize: surface.waterPlaneSize,
    waterSurfaceElevation: resolvedWaterSurfaceElevation,
  })
  const wallPlan = createRockWallPlacementPlan({
    bottomElevation: cliffBaseElevation,
    controls: wallControls,
    perimeter,
    quality,
    rockScale,
    seed,
    sourceGeometries,
    topElevation: cliffTopElevation,
    wallRing: backingWallRing,
  })
  const offshorePlan = createOffshoreRockPlacementPlan({
    bathymetryField,
    bottomElevation: cliffBaseElevation,
    controls: wallControls,
    offshoreControls,
    perimeter,
    quality,
    rockScale,
    seed,
    sourceGeometries,
    waterSurfaceElevation: resolvedWaterSurfaceElevation,
  })
  const placements = [...wallPlan.placements, ...offshorePlan.placements]

  const sourceTriangles = sourceGeometries.reduce(
    (total, geometry) => total + (geometry.getAttribute('position')?.count ?? 0) / 3,
    0,
  )
  const sourceVertices = sourceGeometries.reduce(
    (total, geometry) => total + (geometry.getAttribute('position')?.count ?? 0),
    0,
  )
  const sourceBoundaryEdges = sourceGeometries.reduce(
    (total, geometry) => total + geometryBoundaryEdgeCount(geometry),
    0,
  )
  const compiled = compileRockCliffGeometries(
    sourceGeometries,
    placements,
    perimeter,
    beachControls,
    quality,
    surface.waterPlaneSize,
    backingWallRing,
    cliffTopElevation,
    cliffBaseElevation,
    cliffTopElevation,
    resolvedWaterSurfaceElevation,
    toneControls,
    seed,
  )
  for (const geometry of sourceGeometries) geometry.dispose()
  const renderedTriangles = (compiled.geometry.getAttribute('position')?.count ?? 0) / 3

  return {
    coverageGeometry: compiled.coverageGeometry,
    geometry: compiled.geometry,
    metrics: {
      backingTriangles: compiled.backingTriangles,
      beachExposedVertexRatio: compiled.beachExposedVertexRatio,
      beachMaximumElevationMeters: compiled.beachMaximumElevationMeters,
      beachMinimumElevationMeters: compiled.beachMinimumElevationMeters,
      beachRadialBands: compiled.beachRadialBands,
      beachSegments: compiled.beachSegments,
      beachTriangles: compiled.beachTriangles,
      beachWidthMeters: beachControls.enabled ? surface.waterPlaneSize : 0,
      bottomElevationMeters: cliffBaseElevation,
      columnCount: wallPlan.columnRockCounts.length,
      cutCount,
      drawCalls: 2,
      maximumColumnRockCount: Math.max(...wallPlan.columnRockCounts),
      meanColumnRockCount:
        wallPlan.columnRockCounts.reduce((total, count) => total + count, 0) /
        Math.max(wallPlan.columnRockCounts.length, 1),
      minimumColumnRockCount: Math.min(...wallPlan.columnRockCounts),
      offshoreClusterCount: offshorePlan.clusterCount,
      offshoreCompoundRockInstances: offshorePlan.compoundRockCount,
      offshoreFormationCount: offshorePlan.formationCount,
      offshoreMinimumSpacingRatio: offshorePlan.minimumSpacingRatio,
      offshoreOversizedRockInstances: offshorePlan.oversizedRockCount,
      offshoreRockInstances: offshorePlan.placements.length,
      offshoreSubmergedRockInstances: offshorePlan.submergedRockCount,
      offshoreTargetRockInstances: offshorePlan.targetRockCount,
      renderedTriangles,
      rockInstances: placements.length,
      seed,
      sourceBoundaryEdges,
      sourceTriangles,
      sourceVertices,
      variants: variantCount,
      wallHeightMeters: cliffTopElevation - cliffBaseElevation,
      wallRockInstances: wallPlan.placements.length,
    },
    variantGeometry: compiled.variantGeometry,
  }
}

function createRockWallPlacementPlan({
  bottomElevation,
  controls,
  perimeter,
  quality,
  rockScale,
  seed,
  sourceGeometries,
  topElevation,
  wallRing,
}: {
  bottomElevation: number
  controls: ProceduralRockCliffWallControls
  perimeter: readonly Point2[]
  quality: ProceduralRockCliffQuality
  rockScale: number
  seed: number
  sourceGeometries: readonly BufferGeometry[]
  topElevation: number
  wallRing: readonly Point2[]
}) {
  const qualityScale = quality === 'dense' ? 0.78 : 1
  const targetWidth = Math.max(0.25, controls.rockWidthMeters * rockScale * qualityScale)
  const targetHeight = Math.max(0.25, controls.rockHeightMeters * rockScale * qualityScale)
  const reliefDepth = Math.max(0.05, controls.reliefDepthMeters * rockScale)
  const coverageOverlap = clamp(controls.coverageOverlap, 0, 0.6)
  const perimeterLength = closedRingLength(wallRing)
  const columnCount = Math.max(24, Math.round(perimeterLength / targetWidth))
  const stationSpacing = perimeterLength / columnCount
  const wallHeight = Math.max(0.25, topElevation - bottomElevation)
  const center = ringCenter(wallRing)
  const placements: ProceduralRockPlacement[] = []
  const columnRockCounts: number[] = []

  for (let column = 0; column < columnCount; column += 1) {
    const random = new SeededRandom(mixSeed(seed, 2_003 + column * 97))
    const t = (column + 0.5 + random.range(-0.08, 0.08)) / columnCount
    const wallPoint = sampleClosedRing(wallRing, t)
    const perimeterPoint = sampleClosedRing(perimeter, t)
    const previous = sampleClosedRing(wallRing, t - 0.0025)
    const next = sampleClosedRing(wallRing, t + 0.0025)
    const tangent = normalize2(next.x - previous.x, next.z - previous.z)
    let outward = normalize2(perimeterPoint.x - wallPoint.x, perimeterPoint.z - wallPoint.z)
    if (distance2(perimeterPoint, wallPoint) < 0.05) {
      outward = normalize2(wallPoint.x - center.x, wallPoint.z - center.z)
    }
    let yaw = -Math.atan2(tangent.z, tangent.x)
    const localZ = { x: Math.sin(yaw), z: Math.cos(yaw) }
    if (localZ.x * outward.x + localZ.z * outward.z < 0) yaw += Math.PI

    const columnTargetHeight = targetHeight * random.range(0.86, 1.14)
    const rockCount = Math.max(2, Math.round(wallHeight / columnTargetHeight))
    const heightWeights = Array.from({ length: rockCount }, () => random.range(0.78, 1.22))
    const heightWeightTotal = heightWeights.reduce((total, weight) => total + weight, 0)
    let cellBottom = bottomElevation

    for (let cell = 0; cell < rockCount; cell += 1) {
      const coreHeight =
        cell === rockCount - 1
          ? topElevation - cellBottom
          : (wallHeight * (heightWeights[cell] ?? 1)) / Math.max(heightWeightTotal, 0.001)
      const verticalPadding = coreHeight * coverageOverlap * 0.5
      const rockBottom = Math.max(bottomElevation, cellBottom - verticalPadding)
      const rockTop = Math.min(topElevation, cellBottom + coreHeight + verticalPadding)
      const variant = random.integer(0, sourceGeometries.length)
      const sourceGeometry = sourceGeometries[variant]
      const sourceWidth = geometryLocalWidth(sourceGeometry)
      const sourceDepth = geometryLocalDepth(sourceGeometry)
      const sourceMinimumZ = geometryLocalMinimumZ(sourceGeometry)
      const worldWidth = stationSpacing * (1 + coverageOverlap) * random.range(0.9, 1.12)
      const worldDepth = reliefDepth * random.range(0.72, 1.28)
      const scaleZ = worldDepth / sourceDepth
      const radialOriginOffset = -sourceMinimumZ * scaleZ - worldDepth * 0.35
      const tangentJitter = random.range(-0.12, 0.12) * stationSpacing
      const toneOffsetBroad = random.range(-1, 1)
      const toneOffsetFine = random.range(-1, 1)
      const toneOffset = clamp(toneOffsetBroad * 0.75 + toneOffsetFine * 0.25, -1, 1)
      const coverageColor = new Color().setHSL(
        hashUnit(seed * 0.000_13 + column * 0.71, cell * 1.37 + variant * 0.19),
        0.62,
        0.58,
      )

      placements.push({
        coverageColor,
        pitch: 0,
        roll: 0,
        scaleX: worldWidth / sourceWidth,
        scaleY: Math.max(0.25, rockTop - rockBottom),
        scaleZ,
        submergedBottomElevation: null,
        toneDomain: 'cliff',
        toneOffset,
        variant,
        x: wallPoint.x + tangent.x * tangentJitter + outward.x * radialOriginOffset,
        y: rockBottom,
        yaw,
        z: wallPoint.z + tangent.z * tangentJitter + outward.z * radialOriginOffset,
      })
      cellBottom += coreHeight
    }
    columnRockCounts.push(rockCount)
  }

  return { columnRockCounts, placements }
}

function createOffshoreRockPlacementPlan({
  bathymetryField,
  bottomElevation,
  controls,
  offshoreControls,
  perimeter,
  quality,
  rockScale,
  seed,
  sourceGeometries,
  waterSurfaceElevation,
}: {
  bathymetryField: ProceduralBathymetryField | null
  bottomElevation: number
  controls: ProceduralRockCliffWallControls
  offshoreControls: ProceduralRockOffshoreControls
  perimeter: readonly Point2[]
  quality: ProceduralRockCliffQuality
  rockScale: number
  seed: number
  sourceGeometries: readonly BufferGeometry[]
  waterSurfaceElevation: number
}) {
  const clusterCount = Math.round(
    clamp(offshoreControls.clusterCount, 1, ROCK_OFFSHORE_FIELD.maximumClusterCount),
  )
  const clusterSpreadMeters = clamp(offshoreControls.clusterSpreadMeters, 0, 40)
  const compoundChance = clamp(offshoreControls.compoundChance, 0, 1)
  const compoundMemberCount = Math.round(
    clamp(offshoreControls.compoundMemberCount, 0, ROCK_OFFSHORE_FIELD.maximumCompoundMemberCount),
  )
  const compoundSpreadRatio = clamp(offshoreControls.compoundSpreadRatio, 0.08, 0.92)
  const density = clamp(offshoreControls.density, 0, ROCK_OFFSHORE_FIELD.maximumDensity)
  const exposure = clamp(offshoreControls.exposure, 0.02, 0.95)
  const horizontalScaleChance = clamp(offshoreControls.horizontalScaleChance, 0, 1)
  const horizontalScaleMaximum = clamp(
    offshoreControls.horizontalScaleMaximum,
    1,
    ROCK_OFFSHORE_FIELD.maximumHorizontalScale,
  )
  const requiredSpacingRatio = clamp(offshoreControls.minimumSpacingRatio, 0.5, 3)
  const shoreDistanceMeters = clamp(
    offshoreControls.shoreDistanceMeters,
    0.5,
    ROCK_OFFSHORE_FIELD.maximumShoreDistanceMeters,
  )
  const sizeScale = clamp(offshoreControls.sizeScale, 0.2, ROCK_OFFSHORE_FIELD.maximumSizeScale)
  const sizeVariation = clamp(
    offshoreControls.sizeVariation,
    0,
    ROCK_OFFSHORE_FIELD.maximumSizeVariation,
  )
  const submergedFraction = clamp(offshoreControls.submergedFraction, 0, 1)
  const submergedCrownDepthMinMeters = clamp(
    Math.min(
      offshoreControls.submergedCrownDepthMinMeters,
      offshoreControls.submergedCrownDepthMaxMeters,
    ),
    0.05,
    ROCK_OFFSHORE_FIELD.maximumSubmergedCrownDepthMeters,
  )
  const submergedCrownDepthMaxMeters = clamp(
    Math.max(
      offshoreControls.submergedCrownDepthMinMeters,
      offshoreControls.submergedCrownDepthMaxMeters,
    ),
    submergedCrownDepthMinMeters,
    Math.min(
      ROCK_OFFSHORE_FIELD.maximumSubmergedCrownDepthMeters,
      Math.max(0.05, waterSurfaceElevation - bottomElevation - 0.35),
    ),
  )
  const qualityDensityScale = quality === 'dense' ? ROCK_OFFSHORE_FIELD.denseDensityScale : 1
  const targetRockCount = Math.round(
    clusterCount * ROCK_OFFSHORE_FIELD.rocksPerCluster * density * qualityDensityScale,
  )
  const winding = signedRingArea(perimeter) >= 0 ? 1 : -1
  const placements: ProceduralRockPlacement[] = []
  const occupied: OffshoreOccupiedRock[] = []
  let compoundRockCount = 0
  let nextFormationId = 0
  let oversizedRockCount = 0
  let submergedRockCount = 0
  const clusters = Array.from({ length: clusterCount }, (_, cluster) => {
    const random = new SeededRandom(mixSeed(seed, 3_901 + cluster * 113))
    return {
      radialSpread: clusterSpreadMeters * random.range(0.4, 5.8 / 7),
      shoreDistance:
        shoreDistanceMeters +
        random.range(-clusterSpreadMeters * (5.5 / 7), clusterSpreadMeters * (5.5 / 7)),
      t: (cluster + random.range(0.15, 0.85)) / clusterCount,
      tangentSpread: clusterSpreadMeters * random.range(4.5 / 7, 8.5 / 7),
    }
  })

  const createRockDimensions = ({
    allowOversize,
    forceMaximumOversize = false,
    prominence,
    random,
    sizeMultiplier = 1,
  }: {
    allowOversize: boolean
    forceMaximumOversize?: boolean
    prominence: number
    random: SeededRandom
    sizeMultiplier?: number
  }): OffshoreRockDimensions => {
    const normalizedProminence = clamp(prominence, 0, 1)
    const baseWorldWidth = Math.max(
      0.25,
      controls.rockWidthMeters *
        rockScale *
        sizeScale *
        sizeMultiplier *
        variedScale(random, 0.74, 1.16, sizeVariation) *
        variedProminenceScale(lerp(0.84, 1.24, normalizedProminence), sizeVariation),
    )
    const baseWorldDepth = Math.max(
      controls.reliefDepthMeters *
        rockScale *
        sizeScale *
        sizeMultiplier *
        variedScale(random, 0.72, 1.34, sizeVariation),
      baseWorldWidth * variedScale(random, 0.68, 1.08, sizeVariation),
    )
    const oversized =
      allowOversize &&
      horizontalScaleMaximum > 1.001 &&
      (forceMaximumOversize || random.next() < horizontalScaleChance)
    const horizontalScale = oversized
      ? forceMaximumOversize
        ? horizontalScaleMaximum
        : lerp(1, horizontalScaleMaximum, 0.25 + 0.75 * random.next() ** 0.55)
      : 1
    const rawWorldWidth = baseWorldWidth * horizontalScale
    const rawWorldDepth = baseWorldDepth * horizontalScale
    const rawWorldHeight =
      controls.rockHeightMeters *
      rockScale *
      sizeScale *
      sizeMultiplier *
      variedScale(random, 0.86, 1.14, sizeVariation) *
      variedProminenceScale(lerp(0.82, 1.72, normalizedProminence ** 0.76), sizeVariation)
    const nominalFootprint = Math.max(
      controls.rockWidthMeters * rockScale,
      controls.reliefDepthMeters * rockScale,
      0.25,
    )
    const formationScale = Math.max(rawWorldWidth, rawWorldDepth) / nominalFootprint
    const requiresCluster = formationScale >= ROCK_OFFSHORE_FIELD.largeFormationScaleThreshold
    const coreScaleRatio = requiresCluster
      ? Math.min(1, ROCK_OFFSHORE_FIELD.largeFormationCoreScale / formationScale)
      : 1
    const worldWidth = rawWorldWidth * coreScaleRatio
    const worldDepth = rawWorldDepth * coreScaleRatio
    const worldHeight = rawWorldHeight * coreScaleRatio

    return {
      envelopeRadius: Math.max(rawWorldWidth, rawWorldDepth) * 0.5,
      formationScale,
      horizontalScale,
      oversized,
      requiresCluster,
      variant: random.integer(0, sourceGeometries.length),
      worldDepth,
      worldHeight,
      worldWidth,
    }
  }

  const intersectsSurfacingBeach = (center: Point2, formationRadius: number) => {
    if (!bathymetryField) return false
    const probeRadius = formationRadius + ROCK_OFFSHORE_FIELD.beachSurfaceClearanceMeters
    const surfaced = (point: Point2) =>
      bathymetryField.sample(point).elevation >= waterSurfaceElevation - 0.02
    if (surfaced(center)) return true

    for (let ring = 1; ring <= 3; ring += 1) {
      const radius = probeRadius * (ring / 3)
      const sampleCount = 8 + ring * 4
      const angleOffset = ring * 0.271
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const angle = angleOffset + (sampleIndex / sampleCount) * Math.PI * 2
        if (
          surfaced({
            x: center.x + Math.cos(angle) * radius,
            z: center.z + Math.sin(angle) * radius,
          })
        ) {
          return true
        }
      }
    }
    return false
  }

  const tryAppendRock = ({
    center,
    cluster,
    dimensions,
    forceSubmerged,
    formationId,
    isCompoundMember,
    prominence,
    random,
  }: {
    center: Point2
    cluster: number
    dimensions: OffshoreRockDimensions
    forceSubmerged?: boolean
    formationId: number
    isCompoundMember: boolean
    prominence: number
    random: SeededRandom
  }): PlacedOffshoreRock | null => {
    if (pointInRing(center, perimeter)) return null
    if (
      minimumDistanceToRing(center, perimeter) <
      dimensions.envelopeRadius + ROCK_OFFSHORE_FIELD.minimumShoreClearanceMeters
    ) {
      return null
    }
    if (intersectsSurfacingBeach(center, dimensions.envelopeRadius)) return null
    if (
      occupied.some(
        (other) =>
          other.formationId !== formationId &&
          distance2(center, other.center) <
            (dimensions.envelopeRadius + other.radius) * requiredSpacingRatio,
      )
    ) {
      return null
    }

    const normalizedProminence = clamp(prominence, 0, 1)
    const fullySubmerged = forceSubmerged ?? random.next() < submergedFraction
    const crownDepth = fullySubmerged
      ? random.range(submergedCrownDepthMinMeters, submergedCrownDepthMaxMeters)
      : 0
    const availableSubmergedHeight = Math.max(
      0.25,
      waterSurfaceElevation - bottomElevation - crownDepth,
    )
    const worldHeight = fullySubmerged
      ? Math.min(dimensions.worldHeight, availableSubmergedHeight * 0.92)
      : dimensions.worldHeight
    const exposedFraction = fullySubmerged
      ? 0
      : clamp(
          exposure * lerp(0.6, 0.43 / 0.3, normalizedProminence ** 0.78) * random.range(0.9, 1.1),
          0.02,
          0.95,
        )
    const baseElevation = fullySubmerged
      ? waterSurfaceElevation - crownDepth - worldHeight
      : waterSurfaceElevation - worldHeight * (1 - exposedFraction)
    const variant = dimensions.variant
    const sourceGeometry = sourceGeometries[variant]
    const toneOffsetBroad = random.range(-1, 1)
    const toneOffsetFine = random.range(-1, 1)

    placements.push({
      coverageColor: new Color().setHSL(
        hashUnit(seed * 0.000_17 + cluster * 0.83, formationId * 1.19 + variant * 0.23),
        0.68,
        0.57,
      ),
      pitch: random.range(-0.055, 0.055),
      roll: random.range(-0.055, 0.055),
      scaleX: dimensions.worldWidth / geometryLocalWidth(sourceGeometry),
      scaleY: worldHeight,
      scaleZ: dimensions.worldDepth / geometryLocalDepth(sourceGeometry),
      submergedBottomElevation: bottomElevation,
      toneDomain: 'offshore',
      toneOffset: clamp(toneOffsetBroad * 0.75 + toneOffsetFine * 0.25, -1, 1),
      variant,
      x: center.x,
      y: baseElevation,
      yaw: random.range(0, Math.PI * 2),
      z: center.z,
    })
    occupied.push({ center, cluster, formationId, radius: dimensions.envelopeRadius })
    if (isCompoundMember) compoundRockCount += 1
    if (fullySubmerged) submergedRockCount += 1
    if (dimensions.oversized) oversizedRockCount += 1

    return {
      center,
      cluster,
      dimensions: { ...dimensions, worldHeight },
      formationId,
      fullySubmerged,
      prominence: normalizedProminence,
    }
  }

  const placeRockFromShore = ({
    alongOffset,
    cluster,
    forceMaximumOversize,
    forceSubmerged,
    prominence,
    random,
    shoreDistance,
    t,
  }: {
    alongOffset: number
    cluster: number
    forceMaximumOversize?: boolean
    forceSubmerged?: boolean
    prominence: number
    random: SeededRandom
    shoreDistance: number
    t: number
  }): PlacedOffshoreRock | null => {
    const perimeterPoint = sampleClosedRing(perimeter, t)
    const previous = sampleClosedRing(perimeter, t - 0.0025)
    const next = sampleClosedRing(perimeter, t + 0.0025)
    const tangent = normalize2(next.x - previous.x, next.z - previous.z)
    let outward = winding > 0 ? { x: tangent.z, z: -tangent.x } : { x: -tangent.z, z: tangent.x }
    const outwardProbe = {
      x: perimeterPoint.x + outward.x * 0.5,
      z: perimeterPoint.z + outward.z * 0.5,
    }
    if (pointInRing(outwardProbe, perimeter)) outward = { x: -outward.x, z: -outward.z }

    const dimensions = createRockDimensions({
      allowOversize: true,
      forceMaximumOversize,
      prominence,
      random,
    })
    const resolvedShoreDistance = Math.max(
      shoreDistance,
      dimensions.envelopeRadius + ROCK_OFFSHORE_FIELD.minimumShoreClearanceMeters,
    )
    const center = {
      x: perimeterPoint.x + tangent.x * alongOffset + outward.x * resolvedShoreDistance,
      z: perimeterPoint.z + tangent.z * alongOffset + outward.z * resolvedShoreDistance,
    }
    const formationId = nextFormationId
    nextFormationId += 1
    return tryAppendRock({
      center,
      cluster,
      dimensions,
      forceSubmerged,
      formationId,
      isCompoundMember: false,
      prominence,
      random,
    })
  }

  const appendCompoundMembers = (
    parent: PlacedOffshoreRock,
    random: SeededRandom,
    availableSlots: number,
  ) => {
    const forcedByFormationSize = parent.dimensions.requiresCluster
    if (
      !forcedByFormationSize &&
      (availableSlots <= 0 || compoundMemberCount <= 0 || random.next() >= compoundChance)
    ) {
      return
    }

    const stochasticMemberCount = Math.max(
      1,
      Math.round(compoundMemberCount * random.range(0.58, 1.08)),
    )
    const minimumLargeFormationMembers = Math.round(
      clamp(
        Math.ceil(parent.dimensions.formationScale * 1.35),
        3,
        ROCK_OFFSHORE_FIELD.maximumCompoundMemberCount,
      ),
    )
    const requestedMembers = Math.min(
      ROCK_OFFSHORE_FIELD.maximumCompoundMemberCount,
      forcedByFormationSize
        ? Math.max(stochasticMemberCount, minimumLargeFormationMembers)
        : Math.min(availableSlots, stochasticMemberCount),
    )
    for (let member = 0; member < requestedMembers; member += 1) {
      const prominence = clamp(parent.prominence * random.range(0.48, 0.92), 0.05, 1)
      const dimensions = createRockDimensions({
        allowOversize: false,
        prominence,
        random,
        sizeMultiplier: forcedByFormationSize
          ? Math.min(1.25, 1.15 / Math.max(sizeScale, 0.2)) * random.range(0.82, 1.12)
          : random.range(0.42, 0.78),
      })
      const angleStep = (Math.PI * 2) / Math.max(requestedMembers, 1)
      const angle = forcedByFormationSize
        ? member * angleStep + random.range(-0.28, 0.28) * angleStep
        : random.range(0, Math.PI * 2)
      const offset = forcedByFormationSize
        ? Math.max(0.1, parent.dimensions.envelopeRadius - dimensions.envelopeRadius * 0.35) *
          random.range(0.34, 0.94)
        : (parent.dimensions.envelopeRadius + dimensions.envelopeRadius) *
          compoundSpreadRatio *
          random.range(0.28, 0.92)
      const center = {
        x: parent.center.x + Math.cos(angle) * offset,
        z: parent.center.z + Math.sin(angle) * offset,
      }
      tryAppendRock({
        center,
        cluster: parent.cluster,
        dimensions,
        forceSubmerged: parent.fullySubmerged ? true : undefined,
        formationId: parent.formationId,
        isCompoundMember: true,
        prominence,
        random,
      })
    }
  }

  const anchorCount = Math.min(clusters.length, targetRockCount)
  const anchors: PlacedOffshoreRock[] = []
  let guaranteedWideAnchorPlaced = false
  for (let anchorIndex = 0; anchorIndex < anchorCount; anchorIndex += 1) {
    const cluster = Math.floor((anchorIndex * clusters.length) / Math.max(anchorCount, 1))
    const anchor = clusters[cluster]
    if (!anchor) continue
    const random = new SeededRandom(mixSeed(seed, 5_009 + cluster * 149))
    const placed = placeRockFromShore({
      alongOffset: 0,
      cluster,
      forceMaximumOversize:
        !guaranteedWideAnchorPlaced && horizontalScaleChance > 0 && horizontalScaleMaximum > 1.001,
      forceSubmerged: false,
      prominence: random.range(0.82, 1),
      random,
      shoreDistance: anchor.shoreDistance,
      t: anchor.t,
    })
    if (placed) {
      anchors.push(placed)
      guaranteedWideAnchorPlaced ||= placed.dimensions.oversized
    }
  }

  for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
    const anchor = anchors[anchorIndex]
    if (!anchor || placements.length >= targetRockCount) break
    appendCompoundMembers(
      anchor,
      new SeededRandom(mixSeed(seed, 6_103 + anchorIndex * 173)),
      targetRockCount - placements.length,
    )
  }

  const scatterRandom = new SeededRandom(mixSeed(seed, 7_117))
  const maximumAttempts = Math.max(targetRockCount, 1) * 96
  const minimumClusterShoreDistance = clamp(
    shoreDistanceMeters - clusterSpreadMeters * (7.5 / 7),
    0.5,
    ROCK_OFFSHORE_FIELD.maximumShoreDistanceMeters,
  )
  const maximumClusterShoreDistance = clamp(
    shoreDistanceMeters + clusterSpreadMeters * (11 / 7),
    minimumClusterShoreDistance,
    ROCK_OFFSHORE_FIELD.maximumShoreDistanceMeters,
  )
  for (
    let attempt = 0;
    attempt < maximumAttempts && placements.length < targetRockCount;
    attempt += 1
  ) {
    const cluster = scatterRandom.integer(0, clusters.length)
    const anchor = clusters[cluster]
    if (!anchor) continue
    const stray = scatterRandom.next() < 0.16
    const placed = placeRockFromShore({
      alongOffset: stray
        ? scatterRandom.range(-clusterSpreadMeters * (10 / 7), clusterSpreadMeters * (10 / 7))
        : scatterRandom.range(-anchor.tangentSpread, anchor.tangentSpread),
      cluster: stray ? -1 : cluster,
      prominence: stray ? scatterRandom.range(0.22, 0.68) : scatterRandom.range(0.08, 0.72),
      random: scatterRandom,
      shoreDistance: stray
        ? scatterRandom.range(
            clamp(
              shoreDistanceMeters - clusterSpreadMeters * (6.5 / 7),
              0.5,
              ROCK_OFFSHORE_FIELD.maximumShoreDistanceMeters,
            ),
            maximumClusterShoreDistance,
          )
        : clamp(
            anchor.shoreDistance + scatterRandom.range(-anchor.radialSpread, anchor.radialSpread),
            minimumClusterShoreDistance,
            maximumClusterShoreDistance,
          ),
      t: stray ? scatterRandom.next() : anchor.t,
    })
    if (placed) {
      appendCompoundMembers(placed, scatterRandom, targetRockCount - placements.length)
    }
  }

  let minimumSpacingRatio = Number.POSITIVE_INFINITY
  for (let first = 0; first < occupied.length; first += 1) {
    for (let second = first + 1; second < occupied.length; second += 1) {
      const firstRock = occupied[first]
      const secondRock = occupied[second]
      if (!(firstRock && secondRock)) continue
      if (firstRock.formationId === secondRock.formationId) continue
      minimumSpacingRatio = Math.min(
        minimumSpacingRatio,
        distance2(firstRock.center, secondRock.center) / (firstRock.radius + secondRock.radius),
      )
    }
  }

  return {
    clusterCount: new Set(occupied.filter((rock) => rock.cluster >= 0).map((rock) => rock.cluster))
      .size,
    compoundRockCount,
    formationCount: new Set(occupied.map((rock) => rock.formationId)).size,
    minimumSpacingRatio: Number.isFinite(minimumSpacingRatio) ? minimumSpacingRatio : 0,
    oversizedRockCount,
    placements,
    submergedRockCount,
    targetRockCount,
  }
}

function variedProminenceScale(defaultScale: number, variation: number) {
  return Math.max(0.12, 1 + (defaultScale - 1) * variation)
}

function variedScale(random: SeededRandom, minimum: number, maximum: number, variation: number) {
  return random.range(
    Math.max(0.12, 1 + (minimum - 1) * variation),
    Math.max(0.12, 1 + (maximum - 1) * variation),
  )
}

function geometryLocalDepth(geometry: BufferGeometry | undefined) {
  const bounds = geometry?.boundingBox
  return bounds ? Math.max(0.001, bounds.max.z - bounds.min.z) : 1
}

function geometryLocalWidth(geometry: BufferGeometry | undefined) {
  const bounds = geometry?.boundingBox
  return bounds ? Math.max(0.001, bounds.max.x - bounds.min.x) : 1
}

function geometryLocalMinimumZ(geometry: BufferGeometry | undefined) {
  return geometry?.boundingBox?.min.z ?? -0.5
}

function createProceduralRockGeometry({
  cutCount,
  seed,
  variant,
}: {
  cutCount: number
  seed: number
  variant: number
}) {
  const random = new SeededRandom(seed)
  let faces = createRockBaseFaces(random, variant)
  const baseScale = new Vector3(
    random.range(0.88, 1.14),
    random.range(0.82, 1.12),
    random.range(0.86, 1.16),
  )
  faces = faces.map((face) => face.map((point) => point.clone().multiply(baseScale)))
  faces = convexFaces(
    uniqueVertices(clipPolyhedron(faces, new Vector3(0, -1, 0), random.range(0.68, 0.82))),
  )

  for (let cutIndex = 0; cutIndex < cutCount; cutIndex += 1) {
    const sampledFace = weightedRandomSideFace(faces, random)
    if (!sampledFace) break
    const faceNormal = polygonNormal(sampledFace)
    const jitter = randomUnitVector(random).multiplyScalar(random.range(0.02, 0.12))
    const cutNormal = faceNormal.add(jitter).normalize()
    const projections = uniqueVertices(faces).map((point) => point.dot(cutNormal))
    const minimum = Math.min(...projections)
    const maximum = Math.max(...projections)
    const cutDistance = maximum - (maximum - minimum) * random.range(0.035, 0.105)
    const clipped = clipPolyhedron(faces, cutNormal, cutDistance)
    if (clipped.length >= 8) faces = convexFaces(uniqueVertices(clipped))
  }

  return emitRockGeometry(normalizeRockFaces(convexFaces(uniqueVertices(faces))), seed, variant)
}

function createRockBaseFaces(random: SeededRandom, variant: number) {
  const profile = ROCK_SHAPE_PROFILES[variant % ROCK_SHAPE_PROFILES.length]!
  const segmentCount = 6 + (variant % 5)
  const angleStep = (Math.PI * 2) / segmentCount
  const angleOffset = random.range(0, Math.PI * 2)
  const angles = Array.from(
    { length: segmentCount },
    (_, index) => angleOffset + index * angleStep + random.range(-0.18, 0.18) * angleStep,
  )
  const leanAngle = random.range(0, Math.PI * 2)
  const leanAmount = profile.lean * random.range(0.72, 1.32)
  const leanX = Math.cos(leanAngle) * leanAmount
  const leanZ = Math.sin(leanAngle) * leanAmount
  const bottom = createIrregularRockRing(angles, random, 0.68, 1.02, -1, -0.8, 0, 0)
  const belly = createIrregularRockRing(
    angles,
    random,
    profile.bellyRadius * 0.82,
    profile.bellyRadius * 1.18,
    -0.28,
    0.08,
    leanX * 0.2,
    leanZ * 0.2,
  )
  const shoulder = createIrregularRockRing(
    angles,
    random,
    profile.shoulderRadius * 0.78,
    profile.shoulderRadius * 1.2,
    0.34,
    0.7,
    leanX * 0.55,
    leanZ * 0.55,
  )
  const crown = createIrregularRockRing(
    angles,
    random,
    profile.crownRadius * 0.74,
    profile.crownRadius * 1.22,
    0.68,
    0.98,
    leanX * 0.82,
    leanZ * 0.82,
  )
  const crest = createIrregularRockRing(
    angles,
    random,
    profile.crestRadius * 0.7,
    profile.crestRadius * 1.28,
    0.86,
    1.06,
    leanX,
    leanZ,
  )
  const apex = new Vector3(
    leanX + random.range(-0.2, 0.2),
    Math.max(...crest.map((point) => point.y)) + random.range(0.02, 0.055),
    leanZ + random.range(-0.2, 0.2),
  )
  return convexFaces([...bottom, ...belly, ...shoulder, ...crown, ...crest, apex])
}

function createIrregularRockRing(
  angles: readonly number[],
  random: SeededRandom,
  minimumRadius: number,
  maximumRadius: number,
  minimumHeight: number,
  maximumHeight: number,
  centerX: number,
  centerZ: number,
) {
  return angles.map((angle) => {
    const radius = random.range(minimumRadius, maximumRadius)
    return new Vector3(
      centerX + Math.cos(angle) * radius,
      random.range(minimumHeight, maximumHeight),
      centerZ + Math.sin(angle) * radius,
    )
  })
}

function convexFaces(points: readonly Vector3[]) {
  const geometry = new ConvexGeometry([...points])
  const faces = geometryFaces(geometry)
  geometry.dispose()
  return faces
}

function geometryFaces(geometry: BufferGeometry) {
  const faces: PolyFace[] = []
  const positions = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triangleCount = index ? index.count / 3 : positions.count / 3
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const face: Vector3[] = []
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = triangle * 3 + corner
      face.push(new Vector3().fromBufferAttribute(positions, index?.getX(offset) ?? offset))
    }
    faces.push(face)
  }
  return faces
}

function weightedRandomSideFace(faces: readonly PolyFace[], random: SeededRandom) {
  const sideFaces = faces.filter((face) => Math.abs(polygonNormal(face).y) < 0.78)
  return weightedRandomFace(sideFaces.length > 0 ? sideFaces : faces, random)
}

function clipPolyhedron(faces: readonly PolyFace[], normal: Vector3, distance: number) {
  const clippedFaces: PolyFace[] = []
  const intersections: Vector3[] = []

  for (const face of faces) {
    const clipped: Vector3[] = []
    for (let index = 0; index < face.length; index += 1) {
      const current = face[index]
      const next = face[(index + 1) % face.length]
      if (!(current && next)) continue
      const currentDistance = current.dot(normal) - distance
      const nextDistance = next.dot(normal) - distance
      const currentInside = currentDistance <= 0.000_01
      const nextInside = nextDistance <= 0.000_01

      if (currentInside) clipped.push(current.clone())
      if (currentInside === nextInside) continue

      const ratio = currentDistance / (currentDistance - nextDistance)
      const intersection = current.clone().lerp(next, ratio)
      clipped.push(intersection.clone())
      intersections.push(intersection)
    }

    const clean = cleanPolygon(clipped)
    if (clean.length >= 3 && polygonArea(clean) > 0.000_01) clippedFaces.push(clean)
  }

  const cap = sortedCapPoints(intersections, normal)
  if (cap.length >= 3) clippedFaces.push(cap)
  return clippedFaces
}

function sortedCapPoints(points: readonly Vector3[], normal: Vector3) {
  const unique = deduplicatePoints(points)
  if (unique.length < 3) return []
  const center = unique
    .reduce((total, point) => total.add(point), new Vector3())
    .multiplyScalar(1 / unique.length)
  const helper = Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  const axisU = new Vector3().crossVectors(helper, normal).normalize()
  const axisV = new Vector3().crossVectors(normal, axisU).normalize()
  const sorted = [...unique].sort((a, b) => {
    const offsetA = a.clone().sub(center)
    const offsetB = b.clone().sub(center)
    return (
      Math.atan2(offsetA.dot(axisV), offsetA.dot(axisU)) -
      Math.atan2(offsetB.dot(axisV), offsetB.dot(axisU))
    )
  })
  if (polygonNormal(sorted).dot(normal) < 0) sorted.reverse()
  return sorted
}

function normalizeRockFaces(faces: readonly PolyFace[]) {
  const points = uniqueVertices(faces)
  const center = points
    .reduce((total, point) => total.add(point), new Vector3())
    .multiplyScalar(1 / Math.max(points.length, 1))
  let covarianceXX = 0
  let covarianceXZ = 0
  let covarianceZZ = 0

  for (const point of points) {
    const x = point.x - center.x
    const z = point.z - center.z
    covarianceXX += x * x
    covarianceXZ += x * z
    covarianceZZ += z * z
  }

  const angle = -0.5 * Math.atan2(2 * covarianceXZ, covarianceXX - covarianceZZ)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const rotated = faces.map((face) =>
    face.map((point) => {
      const x = point.x - center.x
      const z = point.z - center.z
      return new Vector3(x * cosine - z * sine, point.y, x * sine + z * cosine)
    }),
  )
  const rotatedPoints = uniqueVertices(rotated)
  const minimum = new Vector3(
    Math.min(...rotatedPoints.map((point) => point.x)),
    Math.min(...rotatedPoints.map((point) => point.y)),
    Math.min(...rotatedPoints.map((point) => point.z)),
  )
  const maximum = new Vector3(
    Math.max(...rotatedPoints.map((point) => point.x)),
    Math.max(...rotatedPoints.map((point) => point.y)),
    Math.max(...rotatedPoints.map((point) => point.z)),
  )
  const horizontalScale = 1 / Math.max(maximum.x - minimum.x, maximum.z - minimum.z, 0.001)
  const verticalScale = 1 / Math.max(maximum.y - minimum.y, 0.001)
  const centerX = (minimum.x + maximum.x) * 0.5
  const centerZ = (minimum.z + maximum.z) * 0.5

  return rotated.map((face) =>
    face.map(
      (point) =>
        new Vector3(
          (point.x - centerX) * horizontalScale,
          (point.y - minimum.y) * verticalScale,
          (point.z - centerZ) * horizontalScale,
        ),
    ),
  )
}

function emitRockGeometry(faces: readonly PolyFace[], seed: number, variant: number) {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = faces[faceIndex]
    if (!face || face.length < 3) continue
    const normal = polygonNormal(face)
    for (let triangle = 1; triangle < face.length - 1; triangle += 1) {
      const vertices = [face[0], face[triangle], face[triangle + 1]]
      if (vertices.some((vertex) => !vertex)) continue
      const height = vertices.reduce((total, vertex) => total + (vertex?.y ?? 0), 0) / 3
      const diagnosticShade = rockDiagnosticShade(normal, height, seed, variant, faceIndex)
      for (const vertex of vertices) {
        if (!vertex) continue
        positions.push(vertex.x, vertex.y, vertex.z)
        normals.push(normal.x, normal.y, normal.z)
        colors.push(
          rockSpatialGradientRatio(vertex, seed, variant),
          clamp(vertex.y, 0, 1),
          diagnosticShade,
        )
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.proceduralRock = {
    base: 'profile-varied-five-ring-convex-hull-with-asymmetric-fractured-crest',
    mechanism: 're-hulled-side-planar-cuts-watertight-pca-bottom-pivot',
    seed,
  }
  return geometry
}

function rockSpatialGradientRatio(position: Vector3, seed: number, variant: number) {
  const phase = seed * 0.000_91 + variant * 1.731
  const broad = Math.sin(position.x * 5.7 + position.y * 3.9 + position.z * 4.3 + phase) * 0.5 + 0.5
  const cross =
    Math.sin((position.x - position.z) * 9.1 + position.y * 6.2 - phase * 1.7) * 0.5 + 0.5
  const grain = hashUnit(
    position.x * 3.7 + position.y * 5.1 + seed * 0.000_3,
    position.z * 4.9 + variant * 0.73,
  )
  return smoothstep(0, 1, broad * 0.5 + cross * 0.3 + grain * 0.2)
}

function rockDiagnosticShade(
  normal: Vector3,
  height: number,
  seed: number,
  variant: number,
  faceIndex: number,
) {
  const variation = hashUnit(seed * 0.001 + faceIndex * 1.37, variant * 7.1)
  const verticalGrain = Math.sin(height * 9.4 + seed * 0.000_7) * 0.5 + 0.5
  const orientation = smoothstep(-0.4, 0.9, normal.y)
  const tone =
    0.965 + orientation * 0.035 + (variation - 0.5) * 0.024 + (verticalGrain - 0.5) * 0.012
  return clamp(tone, 0.9, 1.05)
}

function compileRockCliffGeometries(
  sourceGeometries: readonly BufferGeometry[],
  placements: readonly ProceduralRockPlacement[],
  beachPerimeter: readonly Point2[],
  beachControls: ProceduralBeachControls,
  quality: ProceduralRockCliffQuality,
  beachPlaneSize: number,
  backingWallRing: readonly Point2[],
  backingWallTopElevation: number,
  cliffBaseElevation: number,
  cliffTopElevation: number,
  waterSurfaceElevation: number,
  toneControls: ProceduralRockToneControls,
  seed: number,
) {
  const buffers: CompiledRockBuffers = {
    coverageColors: [],
    finalColors: [],
    normals: [],
    positions: [],
    variantColors: [],
  }
  const transform = new Object3D()
  const normalMatrix = new Matrix3()
  const worldPoint = new Vector3()
  const worldNormal = new Vector3()
  const dryBottomToTopContribution = clamp(toneControls.dryBottomToTopContribution, 0, 1)
  const offshoreGradientBias = clamp(toneControls.offshoreGradientBias, -1, 1)

  for (const placement of placements) {
    const sourceGeometry = sourceGeometries[placement.variant]
    if (!sourceGeometry) continue
    const sourcePositions = sourceGeometry.getAttribute('position')
    const sourceNormals = sourceGeometry.getAttribute('normal')
    const sourceColors = sourceGeometry.getAttribute('color')
    const variantColor = new Color().setHSL(
      (placement.variant * 0.618_033_988_75 + 0.04) % 1,
      0.58,
      0.58,
    )
    const colorContext: CompiledRockColorContext = {
      coverageColor: placement.coverageColor,
      dryBottomToTopContribution:
        placement.toneDomain === 'offshore' ? dryBottomToTopContribution : 0,
      offshoreGradientBias: placement.toneDomain === 'offshore' ? offshoreGradientBias : 0,
      toneOffset: placement.toneOffset,
      variantColor,
    }

    transform.position.set(placement.x, placement.y, placement.z)
    transform.rotation.set(placement.pitch, placement.yaw, placement.roll, 'YXZ')
    transform.scale.set(placement.scaleX, placement.scaleY, placement.scaleZ)
    transform.updateMatrix()
    normalMatrix.getNormalMatrix(transform.matrix)
    let sourceBottomElevation = placement.y
    let submergedVerticalScale = 1
    if (placement.submergedBottomElevation !== null) {
      sourceBottomElevation = Number.POSITIVE_INFINITY
      for (let vertexIndex = 0; vertexIndex < sourcePositions.count; vertexIndex += 1) {
        worldPoint.fromBufferAttribute(sourcePositions, vertexIndex).applyMatrix4(transform.matrix)
        sourceBottomElevation = Math.min(sourceBottomElevation, worldPoint.y)
      }
      submergedVerticalScale =
        (waterSurfaceElevation - placement.submergedBottomElevation) /
        Math.max(waterSurfaceElevation - sourceBottomElevation, 0.001)
    }

    for (let triangleOffset = 0; triangleOffset < sourcePositions.count; triangleOffset += 3) {
      const triangle: CompiledRockVertex[] = []
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = triangleOffset + corner
        worldPoint.fromBufferAttribute(sourcePositions, vertexIndex).applyMatrix4(transform.matrix)
        worldNormal
          .fromBufferAttribute(sourceNormals, vertexIndex)
          .applyNormalMatrix(normalMatrix)
          .normalize()
        if (placement.submergedBottomElevation !== null && worldPoint.y < waterSurfaceElevation) {
          const submergedHeightRatio = clamp(
            (worldPoint.y - sourceBottomElevation) /
              Math.max(waterSurfaceElevation - sourceBottomElevation, 0.001),
            0,
            1,
          )
          worldPoint.y = lerp(
            placement.submergedBottomElevation,
            waterSurfaceElevation,
            submergedHeightRatio,
          )
          worldNormal.y /= Math.max(submergedVerticalScale, 0.001)
          worldNormal.normalize()
        }
        triangle.push({
          diagnosticShade: sourceColors.getZ(vertexIndex),
          localHeightRatio: sourceColors.getY(vertexIndex),
          normal: worldNormal.clone(),
          position: worldPoint.clone(),
          randomGradientRatio: sourceColors.getX(vertexIndex),
        })
      }

      const hasSubmergedVertex = triangle.some(
        (vertex) => vertex.position.y < waterSurfaceElevation,
      )
      const hasDryVertex = triangle.some((vertex) => vertex.position.y > waterSurfaceElevation)

      if (hasSubmergedVertex && hasDryVertex) {
        emitCompiledRockPolygon(
          clipCompiledRockPolygonToWaterline(triangle, 'submerged', waterSurfaceElevation),
          colorContext,
          cliffBaseElevation,
          cliffTopElevation,
          buffers,
        )
        emitCompiledRockPolygon(
          clipCompiledRockPolygonToWaterline(triangle, 'dry', waterSurfaceElevation),
          colorContext,
          cliffBaseElevation,
          cliffTopElevation,
          buffers,
        )
        continue
      }

      emitCompiledRockPolygon(
        triangle,
        colorContext,
        cliffBaseElevation,
        cliffTopElevation,
        buffers,
      )
    }
  }

  const beach = appendProceduralBathymetry(
    beachPerimeter,
    beachControls,
    quality,
    beachPlaneSize,
    cliffBaseElevation,
    waterSurfaceElevation,
    seed,
    buffers,
  )

  const backingTriangles = appendBackingWall(
    backingWallRing,
    cliffBaseElevation,
    backingWallTopElevation,
    cliffTopElevation,
    waterSurfaceElevation,
    seed,
    buffers,
  )

  return {
    backingTriangles,
    beachExposedVertexRatio: beach.exposedVertexRatio,
    beachMaximumElevationMeters: beach.maximumElevationMeters,
    beachMinimumElevationMeters: beach.minimumElevationMeters,
    beachRadialBands: beach.radialBands,
    beachSegments: beach.segments,
    beachTriangles: beach.triangles,
    coverageGeometry: finishCompiledRockGeometry(
      buffers.positions,
      buffers.normals,
      buffers.coverageColors,
      'full-height-rock-wall-cells',
    ),
    geometry: finishCompiledRockGeometry(
      buffers.positions,
      buffers.normals,
      buffers.finalColors,
      'continuous-warm-rock-identity-with-world-and-offshore-local-bottom-to-top-tone-fields',
    ),
    variantGeometry: finishCompiledRockGeometry(
      buffers.positions,
      buffers.normals,
      buffers.variantColors,
      'variants',
    ),
  }
}

type ProceduralBathymetryField = {
  bottomElevation: number
  maximumEmergence: number
  planeSize: number
  sample: (point: Point2) => {
    elevation: number
    inside: boolean
    surfaceNoise: number
  }
  waterSurfaceElevation: number
}

function createProceduralBathymetryField({
  bottomElevation,
  controls,
  perimeter,
  seed,
  waterPlaneSize,
  waterSurfaceElevation,
}: {
  bottomElevation: number
  controls: ProceduralBeachControls
  perimeter: readonly Point2[]
  seed: number
  waterPlaneSize: number
  waterSurfaceElevation: number
}): ProceduralBathymetryField | null {
  if (!controls.enabled || perimeter.length < 3) return null

  const planeSize = clamp(waterPlaneSize, 32, 1_000)
  const coastalFalloffMeters = clamp(controls.widthMeters, 8, planeSize * 0.48)
  const coastalFalloffVariation = clamp(controls.widthVariation, 0, 0.8)
  const dryCoverage = clamp(controls.dryCoverage, 0, 0.85)
  const maximumEmergence = clamp(controls.maximumEmergenceMeters, 0.05, 3)
  const maximumDepth = Math.max(0.25, waterSurfaceElevation - bottomElevation)
  const shorelineDepth = clamp(controls.shorelineDepthMeters, 0.25, maximumDepth)
  const profilePower = clamp(controls.profilePower, 0.45, 3.5)
  const surfaceVariation = clamp(controls.surfaceVariationMeters, 0, 4)
  const basinVariation = clamp(controls.basinVariationMeters, 0, 4)
  const macroScale = clamp(controls.macroScaleMeters, 12, 180)
  const domainWarp = clamp(controls.domainWarpMeters, 0, 48)
  const ringSampler = createBathymetryRingSampler(perimeter)

  return {
    bottomElevation,
    maximumEmergence,
    planeSize,
    sample: (point) => {
      const { x, z } = point
      const inside = pointInRing(point, perimeter)
      const coast = sampleBathymetryRing(ringSampler, point)
      const warpX = (fractalValueNoise2(x, z, macroScale * 1.7, seed, 601) - 0.5) * 2 * domainWarp
      const warpZ = (fractalValueNoise2(x, z, macroScale * 1.9, seed, 709) - 0.5) * 2 * domainWarp
      const warpedX = x + warpX
      const warpedZ = z + warpZ
      const primaryBeachWave =
        Math.sin((coast.t * 3 + hashUnit(seed * 0.001_9, 81)) * Math.PI * 2) * 0.5 + 0.5
      const secondaryBeachWave =
        Math.sin((coast.t * 7 + hashUnit(seed * -0.001_3, 137)) * Math.PI * 2) * 0.5 + 0.5
      const beachCarrier = Math.max(primaryBeachWave ** 1.8, secondaryBeachWave ** 4 * 0.72)
      const alongshoreOpportunity = clamp(
        closedFractalNoise(coast.t, seed, 81) * 0.46 + beachCarrier * 0.54,
        0,
        1,
      )
      const macroBeachOpportunity = fractalValueNoise2(
        warpedX,
        warpedZ,
        macroScale * 1.35,
        seed,
        449,
      )
      const mesoBeachOpportunity = fractalValueNoise2(
        warpedX,
        warpedZ,
        Math.max(10, macroScale * 0.58),
        seed,
        503,
      )
      const beachOpportunity = clamp(
        alongshoreOpportunity * 0.48 + macroBeachOpportunity * 0.38 + mesoBeachOpportunity * 0.14,
        0,
        1,
      )
      const widthField = closedFractalNoise(coast.t, seed, 193)
      const localFalloff =
        coastalFalloffMeters *
        lerp(1 - coastalFalloffVariation, 1 + coastalFalloffVariation, widthField)
      const coastInfluence =
        (1 - smoothstep(0, 1, coast.distance / Math.max(localFalloff, 0.001))) ** profilePower
      const exposureThreshold = lerp(0.63, 0.31, dryCoverage / 0.85)
      const shelfBlend = smoothstep(
        exposureThreshold - 0.36,
        Math.min(1, exposureThreshold + 0.1),
        beachOpportunity,
      )
      const emergenceRatio =
        smoothstep(exposureThreshold, Math.min(1, exposureThreshold + 0.2), beachOpportunity) **
        0.72
      const deepShoreElevation = Math.max(bottomElevation, waterSurfaceElevation - shorelineDepth)
      const shoreElevation = lerp(
        deepShoreElevation,
        waterSurfaceElevation + maximumEmergence * emergenceRatio,
        shelfBlend,
      )
      const basinNoise = fractalValueNoise2(warpedX, warpedZ, macroScale, seed, 811)
      const surfaceNoise = fractalValueNoise2(
        warpedX,
        warpedZ,
        Math.max(8, macroScale * 0.34),
        seed,
        997,
      )
      const farDeepening = smoothstep(coastalFalloffMeters * 1.1, planeSize * 0.42, coast.distance)
      const basinFloor = lerp(
        bottomElevation + basinVariation * basinNoise ** 2.25,
        bottomElevation,
        farDeepening,
      )
      const variationEnvelope =
        (0.15 + coastInfluence * (0.25 + shelfBlend * 0.75)) * (1 - farDeepening)
      const unclampedElevation =
        lerp(basinFloor, shoreElevation, coastInfluence) +
        (surfaceNoise - 0.5) * 2 * surfaceVariation * variationEnvelope
      const maximumLocalElevation = lerp(
        waterSurfaceElevation - 0.08,
        waterSurfaceElevation + maximumEmergence,
        emergenceRatio,
      )

      return {
        elevation: clamp(unclampedElevation, bottomElevation, maximumLocalElevation),
        inside,
        surfaceNoise,
      }
    },
    waterSurfaceElevation,
  }
}

function appendProceduralBathymetry(
  perimeter: readonly Point2[],
  controls: ProceduralBeachControls,
  quality: ProceduralRockCliffQuality,
  waterPlaneSize: number,
  bottomElevation: number,
  waterSurfaceElevation: number,
  seed: number,
  buffers: CompiledRockBuffers,
) {
  const field = createProceduralBathymetryField({
    bottomElevation,
    controls,
    perimeter,
    seed,
    waterPlaneSize,
    waterSurfaceElevation,
  })
  if (!field) {
    return {
      exposedVertexRatio: 0,
      maximumElevationMeters: bottomElevation,
      minimumElevationMeters: bottomElevation,
      radialBands: 0,
      segments: 0,
      triangles: 0,
    }
  }

  const startPositionCount = buffers.positions.length
  const { maximumEmergence, planeSize } = field
  const requestedSpacing = clamp(controls.gridSpacingMeters, 1.5, 8)
  const qualitySpacing = quality === 'dense' ? requestedSpacing * 0.72 : requestedSpacing
  const segmentLimit = quality === 'dense' ? 256 : 192
  const segments = Math.round(clamp(planeSize / qualitySpacing, 64, segmentLimit))
  const radialBands = segments
  const halfSize = planeSize * 0.5
  const gridConcentration = 1.5
  const gridCoordinates = Array.from({ length: segments + 1 }, (_, index) => {
    const normalized = (index / segments) * 2 - 1
    return (halfSize * Math.sinh(normalized * gridConcentration)) / Math.sinh(gridConcentration)
  })
  const positions: Vector3[][] = []
  const noiseValues: number[][] = []
  const insideValues: boolean[][] = []
  let exposedVertices = 0
  let exteriorVertices = 0
  let minimumElevationMeters = Number.POSITIVE_INFINITY
  let maximumElevationMeters = Number.NEGATIVE_INFINITY

  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    const z = gridCoordinates[zIndex] ?? 0
    const rowPositions: Vector3[] = []
    const rowNoise: number[] = []
    const rowInside: boolean[] = []
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      const x = gridCoordinates[xIndex] ?? 0
      const point = { x, z }
      const sample = field.sample(point)

      rowPositions.push(new Vector3(x, sample.elevation, z))
      rowNoise.push(sample.surfaceNoise)
      rowInside.push(sample.inside)
    }
    positions.push(rowPositions)
    noiseValues.push(rowNoise)
    insideValues.push(rowInside)
  }

  relaxBathymetrySlopes(positions, 0.42)
  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      if (insideValues[zIndex]?.[xIndex]) continue
      const elevation = positions[zIndex]?.[xIndex]?.y
      if (elevation === undefined) continue
      exteriorVertices += 1
      if (elevation > waterSurfaceElevation) exposedVertices += 1
      minimumElevationMeters = Math.min(minimumElevationMeters, elevation)
      maximumElevationMeters = Math.max(maximumElevationMeters, elevation)
    }
  }

  const vertices = positions.map((rowPositions, zIndex) =>
    rowPositions.map((position, xIndex) => {
      const previousX = rowPositions[Math.max(0, xIndex - 1)] ?? position
      const nextX = rowPositions[Math.min(segments, xIndex + 1)] ?? position
      const previousZ = positions[Math.max(0, zIndex - 1)]?.[xIndex] ?? position
      const nextZ = positions[Math.min(segments, zIndex + 1)]?.[xIndex] ?? position
      const tangentX = nextX.clone().sub(previousX)
      const tangentZ = nextZ.clone().sub(previousZ)
      const normal = new Vector3().crossVectors(tangentZ, tangentX)
      if (normal.y < 0) normal.multiplyScalar(-1)
      if (normal.lengthSq() < 0.000_001) normal.set(0, 1, 0)
      else normal.normalize()
      const noise = noiseValues[zIndex]?.[xIndex] ?? 0.5

      return {
        diagnosticShade: lerp(0.965, 1.025, noise),
        localHeightRatio: smoothstep(
          0,
          1,
          (position.y - bottomElevation) /
            Math.max(waterSurfaceElevation + maximumEmergence - bottomElevation, 0.001),
        ),
        normal,
        position,
        randomGradientRatio: noise,
      } satisfies CompiledRockVertex
    }),
  )

  for (let zIndex = 0; zIndex < segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments; xIndex += 1) {
      const first = vertices[zIndex]?.[xIndex]
      const second = vertices[zIndex]?.[xIndex + 1]
      const third = vertices[zIndex + 1]?.[xIndex]
      const fourth = vertices[zIndex + 1]?.[xIndex + 1]
      if (!(first && second && third && fourth)) continue
      const firstInside = insideValues[zIndex]?.[xIndex] ?? false
      const secondInside = insideValues[zIndex]?.[xIndex + 1] ?? false
      const thirdInside = insideValues[zIndex + 1]?.[xIndex] ?? false
      const fourthInside = insideValues[zIndex + 1]?.[xIndex + 1] ?? false
      if (!(firstInside && secondInside && thirdInside)) {
        emitCompiledBeachTriangle(orientBeachTriangle([first, third, second]), buffers)
      }
      if (!(secondInside && thirdInside && fourthInside)) {
        emitCompiledBeachTriangle(orientBeachTriangle([second, third, fourth]), buffers)
      }
    }
  }

  return {
    exposedVertexRatio: exposedVertices / Math.max(exteriorVertices, 1),
    maximumElevationMeters: Number.isFinite(maximumElevationMeters)
      ? maximumElevationMeters
      : bottomElevation,
    minimumElevationMeters: Number.isFinite(minimumElevationMeters)
      ? minimumElevationMeters
      : bottomElevation,
    radialBands,
    segments,
    triangles: (buffers.positions.length - startPositionCount) / 9,
  }
}

function relaxBathymetrySlopes(positions: Vector3[][], maximumSlope: number) {
  const rowCount = positions.length
  const columnCount = positions[0]?.length ?? 0
  for (let pass = 0; pass < 2; pass += 1) {
    for (let zIndex = 0; zIndex < rowCount; zIndex += 1) {
      for (let xIndex = 0; xIndex < columnCount; xIndex += 1) {
        const current = positions[zIndex]?.[xIndex]
        if (!current) continue
        const previousX = positions[zIndex]?.[xIndex - 1]
        const previousZ = positions[zIndex - 1]?.[xIndex]
        if (previousX) {
          current.y = Math.max(
            current.y,
            previousX.y - Math.abs(current.x - previousX.x) * maximumSlope,
          )
        }
        if (previousZ) {
          current.y = Math.max(
            current.y,
            previousZ.y - Math.abs(current.z - previousZ.z) * maximumSlope,
          )
        }
      }
    }

    for (let zIndex = rowCount - 1; zIndex >= 0; zIndex -= 1) {
      for (let xIndex = columnCount - 1; xIndex >= 0; xIndex -= 1) {
        const current = positions[zIndex]?.[xIndex]
        if (!current) continue
        const nextX = positions[zIndex]?.[xIndex + 1]
        const nextZ = positions[zIndex + 1]?.[xIndex]
        if (nextX) {
          current.y = Math.max(current.y, nextX.y - Math.abs(nextX.x - current.x) * maximumSlope)
        }
        if (nextZ) {
          current.y = Math.max(current.y, nextZ.y - Math.abs(nextZ.z - current.z) * maximumSlope)
        }
      }
    }
  }
}

function orientBeachTriangle(
  vertices: [CompiledRockVertex, CompiledRockVertex, CompiledRockVertex],
) {
  const firstEdge = vertices[1].position.clone().sub(vertices[0].position)
  const secondEdge = vertices[2].position.clone().sub(vertices[0].position)
  return new Vector3().crossVectors(firstEdge, secondEdge).y >= 0
    ? vertices
    : ([vertices[0], vertices[2], vertices[1]] as const)
}

function emitCompiledBeachTriangle(
  triangle: readonly CompiledRockVertex[],
  buffers: CompiledRockBuffers,
) {
  for (const vertex of triangle) {
    buffers.positions.push(vertex.position.x, vertex.position.y, vertex.position.z)
    buffers.normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z)
    const finalColor = beachToneColor(vertex.randomGradientRatio)
    buffers.finalColors.push(finalColor.r, finalColor.g, finalColor.b)
    buffers.coverageColors.push(
      BEACH_COVERAGE_COLOR.r * vertex.diagnosticShade,
      BEACH_COVERAGE_COLOR.g * vertex.diagnosticShade,
      BEACH_COVERAGE_COLOR.b * vertex.diagnosticShade,
    )
    buffers.variantColors.push(
      BEACH_VARIANT_COLOR.r * vertex.diagnosticShade,
      BEACH_VARIANT_COLOR.g * vertex.diagnosticShade,
      BEACH_VARIANT_COLOR.b * vertex.diagnosticShade,
    )
  }
}

function beachToneColor(variationRatio: number) {
  const variation = clamp(variationRatio, 0, 1)
  return BEACH_BASE_COLOR.clone().lerp(BEACH_HIGHLIGHT_COLOR, variation * 0.12)
}

function closedFractalNoise(t: number, seed: number, salt: number) {
  return clamp(
    closedValueNoise(t, 5, seed, salt) * 0.5 +
      closedValueNoise(t, 11, seed, salt + 31) * 0.32 +
      closedValueNoise(t, 23, seed, salt + 79) * 0.18,
    0,
    1,
  )
}

function closedValueNoise(t: number, cells: number, seed: number, salt: number) {
  const wrapped = ((t % 1) + 1) % 1
  const position = wrapped * cells
  const cell = Math.floor(position)
  const ratio = smoothstep(0, 1, position - cell)
  const first = hashUnit(seed * 0.001_37 + salt, ((cell % cells) + cells) % cells)
  const secondCell = (cell + 1) % cells
  const second = hashUnit(seed * 0.001_37 + salt, secondCell)
  return lerp(first, second, ratio)
}

function fractalValueNoise2(x: number, z: number, scale: number, seed: number, salt: number) {
  let amplitude = 0.55
  let frequency = 1
  let total = 0
  let weight = 0
  for (let octave = 0; octave < 4; octave += 1) {
    total +=
      valueNoise2((x * frequency) / scale, (z * frequency) / scale, seed, salt + octave * 37) *
      amplitude
    weight += amplitude
    frequency *= 2.03
    amplitude *= 0.5
  }
  return total / Math.max(weight, 0.001)
}

function valueNoise2(x: number, z: number, seed: number, salt: number) {
  const cellX = Math.floor(x)
  const cellZ = Math.floor(z)
  const ratioX = smoothstep(0, 1, x - cellX)
  const ratioZ = smoothstep(0, 1, z - cellZ)
  const seededX = seed * 0.001_73 + salt * 0.137
  const seededZ = seed * -0.001_19 - salt * 0.193
  const first = lerp(
    hashUnit(cellX + seededX, cellZ + seededZ),
    hashUnit(cellX + 1 + seededX, cellZ + seededZ),
    ratioX,
  )
  const second = lerp(
    hashUnit(cellX + seededX, cellZ + 1 + seededZ),
    hashUnit(cellX + 1 + seededX, cellZ + 1 + seededZ),
    ratioX,
  )
  return lerp(first, second, ratioZ)
}

type BathymetryRingSegment = {
  end: Point2
  length: number
  start: Point2
  startDistance: number
}

function createBathymetryRingSampler(perimeter: readonly Point2[]) {
  const segments: BathymetryRingSegment[] = []
  let totalLength = 0
  for (let index = 0; index < perimeter.length; index += 1) {
    const start = perimeter[index]
    const end = perimeter[(index + 1) % perimeter.length]
    if (!(start && end)) continue
    const length = distance2(start, end)
    segments.push({ end, length, start, startDistance: totalLength })
    totalLength += length
  }
  return { segments, totalLength }
}

function sampleBathymetryRing(
  sampler: ReturnType<typeof createBathymetryRingSampler>,
  point: Point2,
) {
  let closestDistance = Number.POSITIVE_INFINITY
  let closestT = 0
  for (const segment of sampler.segments) {
    const segmentX = segment.end.x - segment.start.x
    const segmentZ = segment.end.z - segment.start.z
    const ratio = clamp(
      ((point.x - segment.start.x) * segmentX + (point.z - segment.start.z) * segmentZ) /
        Math.max(segment.length * segment.length, 0.000_001),
      0,
      1,
    )
    const distance = Math.hypot(
      point.x - (segment.start.x + segmentX * ratio),
      point.z - (segment.start.z + segmentZ * ratio),
    )
    if (distance >= closestDistance) continue
    closestDistance = distance
    closestT =
      (segment.startDistance + segment.length * ratio) / Math.max(sampler.totalLength, 0.001)
  }
  return { distance: closestDistance, t: closestT }
}

function appendBackingWall(
  ring: readonly Point2[],
  bottomElevation: number,
  topElevation: number,
  cliffTopElevation: number,
  waterSurfaceElevation: number,
  seed: number,
  buffers: CompiledRockBuffers,
) {
  const startPositionCount = buffers.positions.length
  const winding = signedRingArea(ring) >= 0 ? 1 : -1
  const wallHeight = Math.max(topElevation - bottomElevation, 0.001)
  const waterLocalHeightRatio = clamp((waterSurfaceElevation - bottomElevation) / wallHeight, 0, 1)
  const colorContext: CompiledRockColorContext = {
    coverageColor: ROCK_BACKING_DEBUG_COLOR,
    dryBottomToTopContribution: 0,
    offshoreGradientBias: 0,
    toneOffset: 0,
    variantColor: ROCK_BACKING_VARIANT_COLOR,
  }

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    if (!(current && next)) continue
    const direction = normalize2(next.x - current.x, next.z - current.z)
    const normal =
      winding > 0
        ? new Vector3(direction.z, 0, -direction.x)
        : new Vector3(-direction.z, 0, direction.x)
    const currentGradientRatio = hashUnit(seed * 0.003_1, index * 0.83)
    const nextGradientRatio = hashUnit(seed * 0.003_1, ((index + 1) % ring.length) * 0.83)
    const currentShade = 0.97 + (currentGradientRatio - 0.5) * 0.04
    const nextShade = 0.97 + (nextGradientRatio - 0.5) * 0.04
    const bottomCurrent = createBackingWallVertex(
      current,
      bottomElevation,
      normal,
      currentGradientRatio,
      0,
      currentShade,
    )
    const bottomNext = createBackingWallVertex(
      next,
      bottomElevation,
      normal,
      nextGradientRatio,
      0,
      nextShade,
    )
    const waterCurrent = createBackingWallVertex(
      current,
      waterSurfaceElevation,
      normal,
      currentGradientRatio,
      waterLocalHeightRatio,
      currentShade,
    )
    const waterNext = createBackingWallVertex(
      next,
      waterSurfaceElevation,
      normal,
      nextGradientRatio,
      waterLocalHeightRatio,
      nextShade,
    )
    const topCurrent = createBackingWallVertex(
      current,
      topElevation,
      normal,
      currentGradientRatio,
      1,
      currentShade,
    )
    const topNext = createBackingWallVertex(
      next,
      topElevation,
      normal,
      nextGradientRatio,
      1,
      nextShade,
    )
    const submergedQuad =
      winding > 0
        ? [bottomNext, bottomCurrent, waterCurrent, waterNext]
        : [bottomCurrent, bottomNext, waterNext, waterCurrent]
    const dryQuad =
      winding > 0
        ? [waterNext, waterCurrent, topCurrent, topNext]
        : [waterCurrent, waterNext, topNext, topCurrent]

    emitCompiledRockPolygon(
      submergedQuad,
      colorContext,
      bottomElevation,
      cliffTopElevation,
      buffers,
    )
    emitCompiledRockPolygon(dryQuad, colorContext, bottomElevation, cliffTopElevation, buffers)
  }

  return (buffers.positions.length - startPositionCount) / 9
}

function createBackingWallVertex(
  point: Point2,
  elevation: number,
  normal: Vector3,
  randomGradientRatio: number,
  localHeightRatio: number,
  diagnosticShade: number,
): CompiledRockVertex {
  return {
    diagnosticShade,
    localHeightRatio,
    normal,
    position: new Vector3(point.x, elevation, point.z),
    randomGradientRatio,
  }
}

function clipCompiledRockPolygonToWaterline(
  vertices: readonly CompiledRockVertex[],
  zone: RockColorZone,
  waterSurfaceElevation: number,
) {
  const clipped: CompiledRockVertex[] = []
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    if (!(current && next)) continue
    const currentInside =
      zone === 'submerged'
        ? current.position.y <= waterSurfaceElevation
        : current.position.y >= waterSurfaceElevation
    const nextInside =
      zone === 'submerged'
        ? next.position.y <= waterSurfaceElevation
        : next.position.y >= waterSurfaceElevation

    if (currentInside) clipped.push(current)
    if (currentInside === nextInside) continue

    const ratio =
      (waterSurfaceElevation - current.position.y) / (next.position.y - current.position.y)
    clipped.push(interpolateCompiledRockVertex(current, next, ratio, waterSurfaceElevation))
  }
  return clipped
}

function interpolateCompiledRockVertex(
  first: CompiledRockVertex,
  second: CompiledRockVertex,
  ratio: number,
  waterSurfaceElevation: number,
) {
  const position = first.position.clone().lerp(second.position, ratio)
  position.y = waterSurfaceElevation
  return {
    diagnosticShade: lerp(first.diagnosticShade, second.diagnosticShade, ratio),
    localHeightRatio: lerp(first.localHeightRatio, second.localHeightRatio, ratio),
    normal: first.normal.clone().lerp(second.normal, ratio).normalize(),
    position,
    randomGradientRatio: lerp(first.randomGradientRatio, second.randomGradientRatio, ratio),
  }
}

function emitCompiledRockPolygon(
  polygon: readonly CompiledRockVertex[],
  colorContext: CompiledRockColorContext,
  cliffBaseElevation: number,
  cliffTopElevation: number,
  buffers: CompiledRockBuffers,
) {
  const first = polygon[0]
  if (!first || polygon.length < 3) return
  for (let triangle = 1; triangle < polygon.length - 1; triangle += 1) {
    const vertices = [first, polygon[triangle], polygon[triangle + 1]]
    for (const vertex of vertices) {
      if (!vertex) continue
      buffers.positions.push(vertex.position.x, vertex.position.y, vertex.position.z)
      buffers.normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z)

      const finalColor = rockWeightedToneColor(
        vertex.position.y,
        vertex.randomGradientRatio,
        vertex.localHeightRatio,
        colorContext.toneOffset,
        colorContext.dryBottomToTopContribution,
        colorContext.offshoreGradientBias,
        cliffBaseElevation,
        cliffTopElevation,
      )
      buffers.finalColors.push(finalColor.r, finalColor.g, finalColor.b)
      buffers.coverageColors.push(
        colorContext.coverageColor.r * vertex.diagnosticShade,
        colorContext.coverageColor.g * vertex.diagnosticShade,
        colorContext.coverageColor.b * vertex.diagnosticShade,
      )
      buffers.variantColors.push(
        colorContext.variantColor.r * vertex.diagnosticShade,
        colorContext.variantColor.g * vertex.diagnosticShade,
        colorContext.variantColor.b * vertex.diagnosticShade,
      )
    }
  }
}

function finishCompiledRockGeometry(
  positions: readonly number[],
  normals: readonly number[],
  colors: readonly number[],
  colorField: string,
) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.proceduralRockCliff = {
    colorField,
    mechanism:
      'single-full-height-perimeter-rock-cladding-plus-visible-anchor-submerged-oversized-compound-offshore-formations-and-water-plane-domain-warped-bathymetry',
  }
  return geometry
}

function rockWeightedToneColor(
  height: number,
  randomGradientRatio: number,
  localHeightRatio: number,
  toneOffset: number,
  bottomToTopContribution: number,
  offshoreGradientBias: number,
  cliffBaseElevation: number,
  cliffTopElevation: number,
) {
  const weightedToneRatio = clamp(
    rockWorldAltitudeRatio(height, cliffBaseElevation, cliffTopElevation) *
      ROCK_TONE_WEIGHT_ALTITUDE +
      clamp(randomGradientRatio, 0, 1) * ROCK_TONE_WEIGHT_RANDOM_GRADIENT +
      clamp(localHeightRatio, 0, 1) * ROCK_TONE_WEIGHT_LOCAL_HEIGHT +
      clamp(toneOffset, -1, 1) * ROCK_TONE_WEIGHT_RANDOM_OFFSET,
    0,
    1,
  )
  const toneRatio = lerp(
    weightedToneRatio,
    clamp(localHeightRatio, 0, 1),
    clamp(bottomToTopContribution, 0, 1),
  )
  const biasedToneRatio =
    offshoreGradientBias < 0
      ? toneRatio ** lerp(1, 4, -offshoreGradientBias)
      : 1 - (1 - toneRatio) ** lerp(1, 4, offshoreGradientBias)
  return rockMaterialPaletteColor(biasedToneRatio)
}

function rockWorldAltitudeRatio(
  height: number,
  cliffBaseElevation: number,
  cliffTopElevation: number,
) {
  return smoothstep(
    0,
    1,
    (height - cliffBaseElevation) / Math.max(cliffTopElevation - cliffBaseElevation, 0.001),
  )
}

function rockMaterialPaletteColor(ratio: number) {
  const span = ROCK_MATERIAL_PALETTE.length - 1
  const palettePosition = clamp(ratio, 0, 1) * span
  const lowerIndex = Math.min(Math.floor(palettePosition), span - 1)
  const blend = smoothstep(0, 1, palettePosition - lowerIndex)
  return ROCK_MATERIAL_PALETTE[lowerIndex]!.clone().lerp(
    ROCK_MATERIAL_PALETTE[lowerIndex + 1]!,
    blend,
  )
}

function weightedRandomFace(faces: readonly PolyFace[], random: SeededRandom) {
  const areas = faces.map(polygonArea)
  const total = areas.reduce((sum, area) => sum + area, 0)
  let target = random.next() * total
  for (let index = 0; index < faces.length; index += 1) {
    target -= areas[index] ?? 0
    if (target <= 0) return faces[index]
  }
  return faces.at(-1)
}

function polygonNormal(face: readonly Vector3[]) {
  const origin = face[0]
  if (!origin) return new Vector3(0, 1, 0)
  for (let index = 1; index < face.length - 1; index += 1) {
    const second = face[index]
    const third = face[index + 1]
    if (!(second && third)) continue
    const normal = new Vector3().crossVectors(second.clone().sub(origin), third.clone().sub(origin))
    if (normal.lengthSq() > 0.000_000_1) return normal.normalize()
  }
  return new Vector3(0, 1, 0)
}

function polygonArea(face: readonly Vector3[]) {
  const origin = face[0]
  if (!origin) return 0
  let area = 0
  for (let index = 1; index < face.length - 1; index += 1) {
    const second = face[index]
    const third = face[index + 1]
    if (!(second && third)) continue
    area +=
      new Vector3().crossVectors(second.clone().sub(origin), third.clone().sub(origin)).length() *
      0.5
  }
  return area
}

function cleanPolygon(points: readonly Vector3[]) {
  const clean: Vector3[] = []
  for (const point of points) {
    const previous = clean.at(-1)
    if (previous && previous.distanceToSquared(point) < 0.000_000_01) continue
    clean.push(point)
  }
  const first = clean[0]
  const last = clean.at(-1)
  if (first && last && first.distanceToSquared(last) < 0.000_000_01) clean.pop()
  return clean
}

function deduplicatePoints(points: readonly Vector3[]) {
  const unique: Vector3[] = []
  for (const point of points) {
    if (unique.some((other) => other.distanceToSquared(point) < 0.000_000_1)) continue
    unique.push(point.clone())
  }
  return unique
}

function uniqueVertices(faces: readonly PolyFace[]) {
  return deduplicatePoints(faces.flat())
}

function geometryBoundaryEdgeCount(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const edgeCounts = new Map<string, number>()
  const pointKey = (index: number) =>
    [positions.getX(index), positions.getY(index), positions.getZ(index)]
      .map((value) => Math.round(value * 100_000))
      .join(',')
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    const keys = [pointKey(triangle), pointKey(triangle + 1), pointKey(triangle + 2)]
    for (let corner = 0; corner < 3; corner += 1) {
      const first = keys[corner]
      const second = keys[(corner + 1) % 3]
      if (!(first && second)) continue
      const edgeKey = first < second ? `${first}|${second}` : `${second}|${first}`
      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1)
    }
  }
  return [...edgeCounts.values()].filter((count) => count !== 2).length
}

function cleanRing(points: readonly Point2[]) {
  const clean = [...points]
  const first = clean[0]
  const last = clean.at(-1)
  if (first && last && distance2(first, last) < 0.000_1) clean.pop()
  return clean
}

function offsetRingInward(points: readonly Point2[], distance: number) {
  if (points.length < 3 || distance <= 0) return [...points]
  const winding = signedRingArea(points) >= 0 ? 1 : -1
  return points.map((current, index) => {
    const previous = points[(index - 1 + points.length) % points.length] ?? current
    const next = points[(index + 1) % points.length] ?? current
    const previousDirection = normalize2(current.x - previous.x, current.z - previous.z)
    const nextDirection = normalize2(next.x - current.x, next.z - current.z)
    const previousInward = {
      x: -previousDirection.z * winding,
      z: previousDirection.x * winding,
    }
    const nextInward = {
      x: -nextDirection.z * winding,
      z: nextDirection.x * winding,
    }
    const bisector = normalize2(previousInward.x + nextInward.x, previousInward.z + nextInward.z)
    const projection = Math.max(0.25, bisector.x * nextInward.x + bisector.z * nextInward.z)
    const miterDistance = Math.min(distance / projection, distance * 2.5)
    return {
      x: current.x + bisector.x * miterDistance,
      z: current.z + bisector.z * miterDistance,
    }
  })
}

function signedRingArea(points: readonly Point2[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (current && next) area += current.x * next.z - next.x * current.z
  }
  return area * 0.5
}

function sampleClosedRing(points: readonly Point2[], t: number) {
  if (points.length === 0) return { x: 0, z: 0 }
  const wrapped = ((t % 1) + 1) % 1
  const lengths: number[] = []
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue
    total += distance2(current, next)
    lengths.push(total)
  }
  const target = wrapped * total
  let previousLength = 0
  for (let index = 0; index < lengths.length; index += 1) {
    const nextLength = lengths[index] ?? previousLength
    if (target <= nextLength) {
      const current = points[index] ?? points[0]!
      const next = points[(index + 1) % points.length] ?? current
      const ratio = (target - previousLength) / Math.max(nextLength - previousLength, 0.000_1)
      return mixPoint(current, next, ratio)
    }
    previousLength = nextLength
  }
  return points[0] ?? { x: 0, z: 0 }
}

function closedRingLength(points: readonly Point2[]) {
  let length = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (current && next) length += distance2(current, next)
  }
  return length
}

function ringCenter(points: readonly Point2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), {
    x: 0,
    z: 0,
  })
  return { x: total.x / points.length, z: total.z / points.length }
}

function mixPoint(a: Point2, b: Point2, t: number) {
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) }
}

function normalize2(x: number, z: number) {
  const length = Math.hypot(x, z) || 1
  return { x: x / length, z: z / length }
}

function distance2(a: Point2, b: Point2) {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function minimumDistanceToRing(point: Point2, ring: readonly Point2[]) {
  let minimumDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (!(start && end)) continue
    const segmentX = end.x - start.x
    const segmentZ = end.z - start.z
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ
    const ratio = clamp(
      ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) /
        Math.max(segmentLengthSquared, 0.000_001),
      0,
      1,
    )
    minimumDistance = Math.min(
      minimumDistance,
      Math.hypot(point.x - (start.x + segmentX * ratio), point.z - (start.z + segmentZ * ratio)),
    )
  }
  return minimumDistance
}

function pointInRing(point: Point2, ring: readonly Point2[]) {
  let inside = false
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    if (!(start && end)) continue
    const crosses =
      start.z > point.z !== end.z > point.z &&
      point.x < ((end.x - start.x) * (point.z - start.z)) / (end.z - start.z) + start.x
    if (crosses) inside = !inside
  }
  return inside
}

function randomUnitVector(random: SeededRandom) {
  const y = random.range(-1, 1)
  const angle = random.range(0, Math.PI * 2)
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  return new Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.000_1)))
  return t * t * (3 - 2 * t)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function hashUnit(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43_758.545_312_3
  return value - Math.floor(value)
}

function mixSeed(seed: number, salt: number) {
  let value = (seed ^ Math.imul(salt, 0x9e37_79b1)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x85eb_ca6b) >>> 0
  value ^= value >>> 13
  return value >>> 0
}

class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b_79f5
  }

  next() {
    this.state += 0x6d2b_79f5
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }

  range(minimum: number, maximum: number) {
    return minimum + (maximum - minimum) * this.next()
  }

  integer(minimum: number, maximum: number) {
    return Math.floor(this.range(minimum, maximum))
  }
}
