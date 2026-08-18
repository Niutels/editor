'use client'

import { useScene } from '@pascal-app/core'
import {
  clearPascalWaterMaterialParameterOverrides,
  type PascalWaterLandSurface,
  setPascalWaterMaterialParameters,
} from '@landrush/pascal-plugin'
import { renderScheduler } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  type InstancedMesh,
  LinearFilter,
  Object3D,
  RedFormat,
  Shape,
} from 'three'

export type MediterraneanCliffDebugMode =
  | 'final'
  | 'mass-structure'
  | 'fracture-field'
  | 'wave-exposure'
  | 'support'
  | 'planar-removed'
  | 'planar-spawned'
  | 'planar-untouched'
export type MediterraneanCliffQuality = 'design' | 'draft' | 'high'
export type MediterraneanCliffCameraBookmark = 'design' | 'far' | 'near'

export type MediterraneanErosionCliffParameters = {
  bottomDepthMeters: number
  boundaryJitter: number
  cavityDarkening: number
  centerInfluence: number
  densityThreshold: number
  diskMarginRatio: number
  flatSurfaceRatio: number
  foamBreakup: number
  foamIntensity: number
  foamSpeed: number
  foamWidthMeters: number
  growthDirectionChaos: number
  growthMultiplier: number
  jointCarving: number
  jointWidthMeters: number
  layerReliefMeters: number
  layerNoiseCarryover: number
  lowerLayerAmplifier: number
  moundBulgeMeters: number
  noiseScaleMeters: number
  noiseStrength: number
  perimeterFalloffMeters: number
  perimeterInfluence: number
  planarMergeAngleDegrees: number
  rockHeightVariation: number
  sandChannelDepthMeters: number
  sandRampPower: number
  sandRampTopMeters: number
  sandRampWarp: number
  sandReliefMeters: number
  sandSpreadVariation: number
  satelliteRockDensity: number
  satelliteRockScale: number
  seed: number
  splitStrength: number
  toonSoftness: number
  upperLayerErosion: number
}

export type MediterraneanErosionCliffStats = {
  diskRadiusMeters: number
  drawCalls: number
  foamSegmentCount: number
  gridCellCount: number
  layerCount: number
  layerOccupancy: number[]
  occupiedCellCount: number
  perimeterTopCoveragePercent: number
  planarPassCount: number
  planarOversizedTriangleCount: number
  planarPatchCount: number
  planarSecondPassFillCount: number
  planarSphereCount: number
  planarTopologyPreserved: boolean
  planarRemovedTriangleCount: number
  planarSpawnedTriangleCount: number
  planarUntouchedTriangleCount: number
  planarizedTriangleCount: number
  rockTriangles: number
  rockHeightVariationMeters: number
  sandHeightVariationMeters: number
  sandMaxRadiusMeters: number
  satelliteSeedCount: number
  shorelineCrownVariationMeters: number
  shorelineMoundSeedCount: number
  totalTriangles: number
  unsupportedOccupiedCellCount: number
}

export const DEFAULT_MEDITERRANEAN_EROSION_CLIFF_PARAMETERS = {
  bottomDepthMeters: 15,
  boundaryJitter: 0.14,
  cavityDarkening: 0.78,
  centerInfluence: 0.04,
  densityThreshold: 0.47,
  diskMarginRatio: 0.5,
  flatSurfaceRatio: 0.78,
  foamBreakup: 0.55,
  foamIntensity: 0.7,
  foamSpeed: 1.15,
  foamWidthMeters: 0.62,
  growthDirectionChaos: 0.46,
  growthMultiplier: 1.24,
  jointCarving: 0.82,
  jointWidthMeters: 2.1,
  layerReliefMeters: 0.9,
  layerNoiseCarryover: 0.62,
  lowerLayerAmplifier: 0.86,
  moundBulgeMeters: 9.2,
  noiseScaleMeters: 12,
  noiseStrength: 0.72,
  perimeterFalloffMeters: 10.5,
  perimeterInfluence: 0.56,
  planarMergeAngleDegrees: 34,
  rockHeightVariation: 0.9,
  sandChannelDepthMeters: 2.8,
  sandRampPower: 1.35,
  sandRampTopMeters: -5.2,
  sandRampWarp: 0.24,
  sandReliefMeters: 3.15,
  sandSpreadVariation: 0.68,
  satelliteRockDensity: 0.8,
  satelliteRockScale: 1,
  seed: 509,
  splitStrength: 0.92,
  toonSoftness: 0.68,
  upperLayerErosion: 0.8,
} satisfies MediterraneanErosionCliffParameters

export const EMPTY_MEDITERRANEAN_EROSION_CLIFF_STATS = {
  diskRadiusMeters: 0,
  drawCalls: 0,
  foamSegmentCount: 0,
  gridCellCount: 0,
  layerCount: 6,
  layerOccupancy: [0, 0, 0, 0, 0, 0],
  occupiedCellCount: 0,
  perimeterTopCoveragePercent: 0,
  planarPassCount: 2,
  planarOversizedTriangleCount: 0,
  planarPatchCount: 0,
  planarSecondPassFillCount: 0,
  planarSphereCount: 0,
  planarTopologyPreserved: true,
  planarRemovedTriangleCount: 0,
  planarSpawnedTriangleCount: 0,
  planarUntouchedTriangleCount: 0,
  planarizedTriangleCount: 0,
  rockTriangles: 0,
  rockHeightVariationMeters: 0,
  sandHeightVariationMeters: 0,
  sandMaxRadiusMeters: 0,
  satelliteSeedCount: 0,
  shorelineCrownVariationMeters: 0,
  shorelineMoundSeedCount: 0,
  totalTriangles: 0,
  unsupportedOccupiedCellCount: 0,
} satisfies MediterraneanErosionCliffStats

type Point2 = { x: number; z: number }
type Point3 = { x: number; y: number; z: number }
type GeometryWriter = {
  colors: number[]
  normals: number[]
  positions: number[]
  uvs: number[]
}
type FoamWriter = GeometryWriter & {
  basePositions: number[]
  flowDirections: number[]
  phases: number[]
}
type RockBodyKind = 'appendix' | 'buttress' | 'core' | 'toe'
type PerimeterFrame = {
  distance: number
  outward: Point2
  point: Point2
  tangent: Point2
}
type RockBodyPlan = {
  anchor: Point2
  baseY: number
  exposure: number
  formationId: number
  grooveAngle: number
  id: number
  jointFamily: 0 | 1
  jointLean: number
  kind: Exclude<RockBodyKind, 'core'>
  outward: Point2
  outwardRadius: number
  projection: number
  strength: number
  tangent: Point2
  tangentRadius: number
  topY: number
}
type CoastalRockPlan = {
  bounds: readonly number[]
  bodies: readonly RockBodyPlan[]
  center: Point2
  diskRadius: number
  formationCount: number
  frames: readonly PerimeterFrame[]
  islandRadius: number
  jointNormals: readonly [Point2, Point2]
  jointPhases: readonly [number, number]
  jointSpacings: readonly [number, number]
  minX: number
  minZ: number
  perimeter: readonly Point2[]
  perimeterLength: number
  sandMaxRadius: number
  waveDirection: Point2
}
type RockTriangleMeta = {
  bodyId: number
  exposure: number
  formationId: number
  fracture: number
  kind: RockBodyKind
  layerIndex: number
  support: number
}
type RockWriter = GeometryWriter & {
  triangleMeta: RockTriangleMeta[]
}
type RockVertex = {
  exposure: number
  fracture: number
  point: Point3
  support: number
}
type CliffBuild = {
  foamGeometry: BufferGeometry
  fractureGeometry: BufferGeometry
  massGeometry: BufferGeometry
  planarSphereSamples: readonly PlanarSphereSample[]
  removedFaceGeometry: BufferGeometry
  rockGeometry: BufferGeometry
  sandGeometry: BufferGeometry
  spawnedFaceGeometry: BufferGeometry
  stats: MediterraneanErosionCliffStats
  supportGeometry: BufferGeometry
  untouchedFaceGeometry: BufferGeometry
  waveGeometry: BufferGeometry
}
type QualitySettings = {
  cellSizeMeters: number
  sandRings: number
  sandSegments: number
}
type SliderConfig = {
  key: Exclude<keyof MediterraneanErosionCliffParameters, 'seed'>
  label: string
  max: number
  min: number
  step: number
}
type SliderGroup = {
  id: string
  label: string
  sliders: readonly SliderConfig[]
}
type PendingGeometryDisposal = { cancelled: boolean }
type GpuQueue = { onSubmittedWorkDone?: () => Promise<void> }
type PlanarNormalCluster = {
  sumX: number
  sumY: number
  sumZ: number
  weight: number
}
type PlanarSphereBucket = {
  bodyId: number
  clusters: PlanarNormalCluster[]
  gridX: number
  gridZ: number
  layerIndex: number
  passIndex: PlanarPassIndex
}
type PlanarSphereAddress = {
  bodyId: number
  gridX: number
  gridZ: number
  influence: number
  key: string
  layerIndex: number
  passIndex: PlanarPassIndex
}
type PlanarSphereSample = {
  center: Point3
  passIndex: PlanarPassIndex
  radius: number
}
type PlanarTriangleTarget = {
  address: PlanarSphereAddress
  clusterIndex: number
  influence: number
  normal: Point3
}
type PlanarTriangleReplacement = {
  debugColor: readonly [number, number, number]
  normal: Point3
}
type PlanarPassBuild = {
  buckets: ReadonlyMap<string, PlanarSphereBucket>
  targets: readonly (PlanarTriangleTarget | null)[]
}
type PlanarPassIndex = 0 | 1
type WriterTriangleSample = {
  bodyId: number
  centroidX: number
  centroidY: number
  centroidZ: number
  normalX: number
  normalY: number
  normalZ: number
  weight: number
}

const QUALITY_SETTINGS = {
  design: { cellSizeMeters: 1.25, sandRings: 26, sandSegments: 128 },
  draft: { cellSizeMeters: 2.4, sandRings: 14, sandSegments: 64 },
  high: { cellSizeMeters: 0.82, sandRings: 36, sandSegments: 176 },
} satisfies Record<MediterraneanCliffQuality, QualitySettings>

const DEBUG_MODES = [
  { id: 'final', label: 'Final result' },
  { id: 'mass-structure', label: 'Mass hierarchy' },
  { id: 'fracture-field', label: 'Fractures' },
  { id: 'wave-exposure', label: 'Wave exposure' },
  { id: 'support', label: 'Support' },
  { id: 'planar-untouched', label: 'Untouched faces' },
  { id: 'planar-removed', label: 'Deleted faces' },
  { id: 'planar-spawned', label: 'Spawned faces' },
] as const satisfies readonly { id: MediterraneanCliffDebugMode; label: string }[]

const QUALITY_OPTIONS = [
  { id: 'draft', label: 'Draft' },
  { id: 'design', label: 'Design' },
  { id: 'high', label: 'High' },
] as const satisfies readonly { id: MediterraneanCliffQuality; label: string }[]

const CAMERA_OPTIONS = [
  { id: 'near', label: 'Near' },
  { id: 'design', label: 'Design' },
  { id: 'far', label: 'Far' },
] as const satisfies readonly { id: MediterraneanCliffCameraBookmark; label: string }[]

const SLIDER_GROUPS = [
  {
    id: 'volume',
    label: 'Mass envelope',
    sliders: [
      { key: 'bottomDepthMeters', label: 'Bottom depth', max: 24, min: 6, step: 0.25 },
      { key: 'diskMarginRatio', label: 'Disk margin', max: 1, min: 0.1, step: 0.01 },
      {
        key: 'densityThreshold',
        label: 'Mass survival threshold',
        max: 0.85,
        min: 0.2,
        step: 0.01,
      },
      { key: 'boundaryJitter', label: 'Boundary irregularity', max: 0.28, min: 0, step: 0.01 },
      { key: 'moundBulgeMeters', label: 'Buttress projection', max: 12, min: 0, step: 0.1 },
    ],
  },
  {
    id: 'density',
    label: 'Formation field',
    sliders: [
      {
        key: 'perimeterFalloffMeters',
        label: 'Perimeter reach',
        max: 36,
        min: 4,
        step: 0.25,
      },
      { key: 'perimeterInfluence', label: 'Perimeter influence', max: 1.4, min: 0, step: 0.01 },
      { key: 'centerInfluence', label: 'Center influence', max: 0.8, min: 0, step: 0.01 },
      { key: 'noiseScaleMeters', label: 'Joint field scale', max: 28, min: 3, step: 0.25 },
      { key: 'noiseStrength', label: 'Spacing variation', max: 1, min: 0, step: 0.01 },
      { key: 'growthDirectionChaos', label: 'Direction chaos', max: 1, min: 0, step: 0.01 },
      { key: 'growthMultiplier', label: 'Growth multiplier', max: 1.8, min: 0.4, step: 0.01 },
      {
        key: 'lowerLayerAmplifier',
        label: 'Lower-layer amplifier',
        max: 1.2,
        min: 0,
        step: 0.01,
      },
    ],
  },
  {
    id: 'satellites',
    label: 'Appendices and toe blocks',
    sliders: [
      { key: 'satelliteRockDensity', label: 'Appendix density', max: 1, min: 0, step: 0.01 },
      { key: 'satelliteRockScale', label: 'Appendix scale', max: 1.8, min: 0.35, step: 0.01 },
      { key: 'rockHeightVariation', label: 'Height diversity', max: 1, min: 0, step: 0.01 },
    ],
  },
  {
    id: 'strata',
    label: 'Joints and planar consolidation',
    sliders: [
      {
        key: 'layerNoiseCarryover',
        label: 'Previous-layer noise',
        max: 1,
        min: 0,
        step: 0.01,
      },
      { key: 'jointWidthMeters', label: 'Joint width', max: 3.5, min: 0.1, step: 0.05 },
      { key: 'jointCarving', label: 'Joint carving', max: 0.8, min: 0, step: 0.01 },
      { key: 'splitStrength', label: 'Split strength', max: 1, min: 0, step: 0.01 },
      { key: 'layerReliefMeters', label: 'Layer dome relief', max: 4, min: 0, step: 0.05 },
      { key: 'upperLayerErosion', label: 'Upper-layer erosion', max: 1, min: 0, step: 0.01 },
      { key: 'flatSurfaceRatio', label: 'Planar pass strength', max: 1, min: 0, step: 0.01 },
      {
        key: 'planarMergeAngleDegrees',
        label: 'Planar merge angle',
        max: 72,
        min: 8,
        step: 1,
      },
    ],
  },
  {
    id: 'seabed',
    label: 'Sand support',
    sliders: [
      { key: 'sandRampTopMeters', label: 'Sand ramp altitude', max: -0.5, min: -14, step: 0.25 },
      { key: 'sandRampPower', label: 'Sand ramp profile', max: 3.5, min: 0.35, step: 0.05 },
      { key: 'sandRampWarp', label: 'Sand ramp warp', max: 0.4, min: 0, step: 0.01 },
      { key: 'sandSpreadVariation', label: 'Sand lobe spread', max: 0.85, min: 0, step: 0.01 },
      { key: 'sandReliefMeters', label: 'Sand height relief', max: 5, min: 0, step: 0.05 },
      { key: 'sandChannelDepthMeters', label: 'Sand channel depth', max: 5, min: 0, step: 0.05 },
    ],
  },
  {
    id: 'waterline',
    label: 'Waterline mist',
    sliders: [
      { key: 'foamWidthMeters', label: 'Mist width', max: 3.5, min: 0.2, step: 0.05 },
      { key: 'foamBreakup', label: 'Contour breakup', max: 0.9, min: 0, step: 0.01 },
      { key: 'foamSpeed', label: 'Fluctuation speed', max: 3.5, min: 0, step: 0.05 },
      { key: 'foamIntensity', label: 'Mist intensity', max: 1, min: 0, step: 0.01 },
    ],
  },
  {
    id: 'surface',
    label: 'Painterly response',
    sliders: [
      { key: 'cavityDarkening', label: 'Cavity darkening', max: 1, min: 0, step: 0.01 },
      { key: 'toonSoftness', label: 'Toon ramp softness', max: 1, min: 0, step: 0.01 },
    ],
  },
] satisfies readonly SliderGroup[]

const LAYER_COUNT = 6
const MAX_PLANAR_NORMAL_CLUSTERS = 3
const PLANAR_PASS_COUNT = 2
const PLANAR_MAX_FACE_SURFACE_FRACTION = 1 / 8
const PLANAR_SECOND_PASS_OFFSET_RATIO = 0.5
const PLANAR_SPHERE_DIAMETER_RATIO = 2.85
const WATERLINE_Y = 0
const BODY_RING_RATIOS = [0, 0.16, 0.29, 0.5, 0.72, 0.9, 1] as const
const pendingGeometryDisposals = new WeakMap<BufferGeometry, PendingGeometryDisposal>()
const ROCK_HEIGHT_PALETTE = [
  color('#314d5c'),
  color('#416a78'),
  color('#64898a'),
  color('#8d5148'),
  color('#c16e50'),
  color('#e99a6d'),
] as const
const ROCK_COLOR_BOUNDS = [-15, -10, -5, 0, 3, 6, 9] as const
const LAYER_DEBUG_PALETTE = [
  color('#213f73'),
  color('#246a94'),
  color('#39a6ad'),
  color('#d95c59'),
  color('#ed8b48'),
  color('#ffd36d'),
] as const
const DIAGNOSTIC = {
  deletedDark: color('#8f2448'),
  deletedLight: color('#ffb04f'),
  hot: color('#ffdf58'),
  low: color('#1a1834'),
  mid: color('#39b9c7'),
} as const

declare global {
  interface Window {
    __MEDITERRANEAN_EROSION_CLIFF_DEBUG__?: {
      debugMode: MediterraneanCliffDebugMode
      fieldContract: {
        coordinateDomain: 'world-xz'
        layerCount: 6
        meshing: 'semantic-core-ribbon-plus-attached-faceted-buttress-bodies'
        primaryFields: readonly [
          'rock-strength',
          'persistent-joint-families',
          'directional-wave-exposure',
          'waterline-attack',
          'gravity-support',
        ]
        planarPass: {
          compositionRule: 'untouched-source-plus-one-for-one-replacements'
          diameterRule: '285%-of-layer-thickness'
          horizontalStepRule: 'sphere-radius'
          maxSourceFaceAreaRule: 'strictly-less-than-one-eighth-sphere-surface-area'
          passCount: 2
          positionRule: 'replacement-reuses-source-triangle-positions'
          replacementRule: 'selected-source-triangle-is-deleted-before-reemission'
          secondPassOffsetRule: 'half-radius-xz-stagger'
          transitionRule: 'sphere-interior-weighted-normal-fusion'
          untouchedRule: 'source-triangle-without-planar-replacement'
          verticalCenterRule: 'layer-midpoint'
        }
        supportRule: 'island-attached-buttresses-plus-seabed-supported-derived-debris'
      }
      invariants: {
        perimeterTopCoveragePercent: number
        planarTopologyPreserved: boolean
        sandExtendsBeyondDisk: boolean
        sandHeightVariationMeters: number
        satelliteSeedCount: number
        shorelineCrownVariationMeters: number
        shorelineMoundSeedCount: number
        unsupportedOccupiedCellCount: number
      }
      mechanism: 'causal-coastal-mass-plan-with-erosion-clefts-and-derived-toe-blocks'
      noPost: true
      parameters: MediterraneanErosionCliffParameters
      quality: MediterraneanCliffQuality
      stats: MediterraneanErosionCliffStats
    }
  }
}

export function MediterraneanErosionCliffs({
  debugMode,
  onStatsChange,
  parameters,
  quality,
  showPlanarSphereSamples,
  surface,
}: {
  debugMode: MediterraneanCliffDebugMode
  onStatsChange: (stats: MediterraneanErosionCliffStats) => void
  parameters: MediterraneanErosionCliffParameters
  quality: MediterraneanCliffQuality
  showPlanarSphereSamples: boolean
  surface: PascalWaterLandSurface
}) {
  const build = useMemo(
    () => createMediterraneanErosionCliffBuild(surface, parameters, quality),
    [parameters, quality, surface],
  )
  const plateauShape = useMemo(() => createPlateauShape(surface.shorelinePoints), [surface])
  const toonGradient = useMemo(
    () => createToonGradientTexture(parameters.toonSoftness, parameters.cavityDarkening),
    [parameters.cavityDarkening, parameters.toonSoftness],
  )
  const resources = useMemo(
    () =>
      [
        build.rockGeometry,
        build.massGeometry,
        build.fractureGeometry,
        build.waveGeometry,
        build.supportGeometry,
        build.removedFaceGeometry,
        build.spawnedFaceGeometry,
        build.untouchedFaceGeometry,
        build.sandGeometry,
        build.foamGeometry,
      ] as const,
    [
      build.foamGeometry,
      build.fractureGeometry,
      build.massGeometry,
      build.removedFaceGeometry,
      build.rockGeometry,
      build.sandGeometry,
      build.spawnedFaceGeometry,
      build.supportGeometry,
      build.untouchedFaceGeometry,
      build.waveGeometry,
    ],
  )
  const displayedStats = useMemo(() => {
    if (debugMode === 'planar-untouched') {
      return {
        ...build.stats,
        drawCalls: 1,
        totalTriangles: build.stats.planarUntouchedTriangleCount,
      }
    }
    if (debugMode === 'planar-removed') {
      return {
        ...build.stats,
        drawCalls: 1,
        totalTriangles: build.stats.planarRemovedTriangleCount,
      }
    }
    if (debugMode === 'planar-spawned') {
      return {
        ...build.stats,
        drawCalls: 1,
        totalTriangles: build.stats.planarSpawnedTriangleCount,
      }
    }
    if (debugMode !== 'final') {
      return {
        ...build.stats,
        drawCalls: 1,
        totalTriangles: build.stats.rockTriangles,
      }
    }
    if (showPlanarSphereSamples) {
      return {
        ...build.stats,
        drawCalls: build.stats.drawCalls + PLANAR_PASS_COUNT,
      }
    }
    return build.stats
  }, [build.stats, debugMode, showPlanarSphereSamples])
  useGeometryLifecycle(resources)

  useEffect(() => {
    const waterNode = Object.values(useScene.getState().nodes).find(
      (node) => node.type === 'pascal-water',
    )
    if (!waterNode) return
    setPascalWaterMaterialParameters(waterNode.id, {
      coastalFoamVisibility: 0,
      ripplesCrestVisibility: 0,
    })
    return () => clearPascalWaterMaterialParameterOverrides(waterNode.id)
  }, [])

  useEffect(() => () => toonGradient.dispose(), [toonGradient])

  useEffect(() => {
    onStatsChange(displayedStats)
    window.__MEDITERRANEAN_EROSION_CLIFF_DEBUG__ = {
      debugMode,
      fieldContract: {
        coordinateDomain: 'world-xz',
        layerCount: 6,
        meshing: 'semantic-core-ribbon-plus-attached-faceted-buttress-bodies',
        primaryFields: [
          'rock-strength',
          'persistent-joint-families',
          'directional-wave-exposure',
          'waterline-attack',
          'gravity-support',
        ],
        planarPass: {
          compositionRule: 'untouched-source-plus-one-for-one-replacements',
          diameterRule: '285%-of-layer-thickness',
          horizontalStepRule: 'sphere-radius',
          maxSourceFaceAreaRule: 'strictly-less-than-one-eighth-sphere-surface-area',
          passCount: 2,
          positionRule: 'replacement-reuses-source-triangle-positions',
          replacementRule: 'selected-source-triangle-is-deleted-before-reemission',
          secondPassOffsetRule: 'half-radius-xz-stagger',
          transitionRule: 'sphere-interior-weighted-normal-fusion',
          untouchedRule: 'source-triangle-without-planar-replacement',
          verticalCenterRule: 'layer-midpoint',
        },
        supportRule: 'island-attached-buttresses-plus-seabed-supported-derived-debris',
      },
      invariants: {
        perimeterTopCoveragePercent: build.stats.perimeterTopCoveragePercent,
        planarTopologyPreserved: build.stats.planarTopologyPreserved,
        sandExtendsBeyondDisk: build.stats.sandMaxRadiusMeters > build.stats.diskRadiusMeters,
        sandHeightVariationMeters: build.stats.sandHeightVariationMeters,
        satelliteSeedCount: build.stats.satelliteSeedCount,
        shorelineCrownVariationMeters: build.stats.shorelineCrownVariationMeters,
        shorelineMoundSeedCount: build.stats.shorelineMoundSeedCount,
        unsupportedOccupiedCellCount: build.stats.unsupportedOccupiedCellCount,
      },
      mechanism: 'causal-coastal-mass-plan-with-erosion-clefts-and-derived-toe-blocks',
      noPost: true,
      parameters,
      quality,
      stats: displayedStats,
    }
  }, [build.stats, debugMode, displayedStats, onStatsChange, parameters, quality])

  if (debugMode !== 'final') {
    const geometry =
      debugMode === 'planar-untouched'
        ? build.untouchedFaceGeometry
        : debugMode === 'planar-removed'
          ? build.removedFaceGeometry
          : debugMode === 'planar-spawned'
            ? build.spawnedFaceGeometry
            : debugMode === 'mass-structure'
              ? build.massGeometry
              : debugMode === 'fracture-field'
                ? build.fractureGeometry
                : debugMode === 'wave-exposure'
                  ? build.waveGeometry
                  : build.supportGeometry
    return (
      <mesh
        dispose={null}
        frustumCulled={false}
        geometry={geometry}
        key={`mediterranean-${debugMode}:${geometry.uuid}`}
        name={`mediterranean-${debugMode}`}
        renderOrder={100}
      >
        <meshBasicMaterial
          color={debugMode === 'planar-untouched' ? '#ddff5a' : '#ffffff'}
          name={`mediterranean-${debugMode}-isolation-material`}
          side={DoubleSide}
          toneMapped={false}
          vertexColors={debugMode !== 'planar-untouched'}
        />
      </mesh>
    )
  }

  return (
    <group name="mediterranean-causal-coastal-rock-masses" renderOrder={80}>
      <mesh
        castShadow
        dispose={null}
        geometry={build.sandGeometry}
        key={`mediterranean-sand-ramp:${build.sandGeometry.uuid}`}
        receiveShadow
        renderOrder={79}
      >
        <meshStandardMaterial
          color="#cbb27b"
          name="mediterranean-supporting-sand-ramp"
          roughness={0.97}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        castShadow
        dispose={null}
        geometry={build.rockGeometry}
        key={`mediterranean-layered-rocks:${build.rockGeometry.uuid}`}
        receiveShadow
        renderOrder={82}
      >
        <meshToonMaterial
          color="#ffffff"
          dithering
          emissive="#160b0d"
          emissiveIntensity={0.04}
          gradientMap={toonGradient}
          name="mediterranean-layered-rock-toon"
          side={DoubleSide}
          vertexColors
        />
      </mesh>
      <WaterlineMist
        geometry={build.foamGeometry}
        intensity={parameters.foamIntensity}
        speed={parameters.foamSpeed}
      />
      <mesh
        key={`mediterranean-layered-plateau:${build.rockGeometry.uuid}`}
        position={[0, surface.plateauElevation + 0.025, 0]}
        renderOrder={81}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <shapeGeometry args={[plateauShape]} />
        <meshStandardMaterial
          color="#75a851"
          name="mediterranean-layered-plateau"
          roughness={0.95}
          side={DoubleSide}
        />
      </mesh>
      {showPlanarSphereSamples ? <PlanarSphereOverlay samples={build.planarSphereSamples} /> : null}
    </group>
  )
}

function PlanarSphereOverlay({ samples }: { samples: readonly PlanarSphereSample[] }) {
  const firstPass = useMemo(() => samples.filter((sample) => sample.passIndex === 0), [samples])
  const secondPass = useMemo(() => samples.filter((sample) => sample.passIndex === 1), [samples])

  return (
    <group name="mediterranean-planar-sphere-sample-overlay" renderOrder={120}>
      <PlanarSphereInstances
        color="#27d9ff"
        name="mediterranean-planar-pass-1-sphere-samples"
        samples={firstPass}
      />
      <PlanarSphereInstances
        color="#ff4fc8"
        name="mediterranean-planar-pass-2-sphere-samples"
        samples={secondPass}
      />
    </group>
  )
}

function PlanarSphereInstances({
  color: tint,
  name,
  samples,
}: {
  color: string
  name: string
  samples: readonly PlanarSphereSample[]
}) {
  const meshRef = useRef<InstancedMesh>(null)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const transform = new Object3D()
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]!
      transform.position.set(sample.center.x, sample.center.y, sample.center.z)
      transform.scale.setScalar(sample.radius)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    renderScheduler.requestFrame('geometry:changed')
  }, [samples])

  if (samples.length === 0) return null
  return (
    <instancedMesh
      args={[undefined, undefined, samples.length]}
      frustumCulled={false}
      name={name}
      ref={meshRef}
      renderOrder={120}
    >
      <sphereGeometry args={[1, 10, 6]} />
      <meshBasicMaterial color={tint} depthWrite={false} toneMapped={false} wireframe />
    </instancedMesh>
  )
}

function WaterlineMist({
  geometry,
  intensity,
  speed,
}: {
  geometry: BufferGeometry
  intensity: number
  speed: number
}) {
  const time = useRef(0)

  useFrame((state, delta) => {
    time.current += Math.min(delta, 0.05) * speed
    const positions = geometry.getAttribute('position')
    const basePositions = geometry.getAttribute('basePosition')
    const flows = geometry.getAttribute('flowDirection')
    const phases = geometry.getAttribute('phase')
    const colors = geometry.getAttribute('color')
    if (!positions || !basePositions || !flows || !phases || !colors) return

    const positionArray = positions.array as Float32Array
    const baseArray = basePositions.array as Float32Array
    const flowArray = flows.array as Float32Array
    const phaseArray = phases.array as Float32Array
    const colorArray = colors.array as Float32Array
    for (let index = 0; index < positions.count; index += 1) {
      const wave = Math.sin(time.current * 2.1 + phaseArray[index]!) * 0.12
      positionArray[index * 3] = baseArray[index * 3]! + flowArray[index * 3]! * wave
      positionArray[index * 3 + 1] =
        baseArray[index * 3 + 1]! + Math.sin(time.current * 2.7 + phaseArray[index]! * 1.7) * 0.025
      positionArray[index * 3 + 2] = baseArray[index * 3 + 2]! + flowArray[index * 3 + 2]! * wave
      const brightness = 0.78 + Math.sin(time.current * 3.3 + phaseArray[index]!) * 0.16
      colorArray[index * 3] = brightness
      colorArray[index * 3 + 1] = brightness
      colorArray[index * 3 + 2] = brightness
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    state.invalidate()
  })

  return (
    <mesh
      dispose={null}
      frustumCulled={false}
      geometry={geometry}
      key={`mediterranean-waterline-mist:${geometry.uuid}`}
      renderOrder={88}
    >
      <meshBasicMaterial
        color="#ffffff"
        depthWrite={false}
        name="mediterranean-waterline-mist"
        opacity={intensity}
        side={DoubleSide}
        transparent
        vertexColors
      />
    </mesh>
  )
}

export function MediterraneanErosionCliffPanel({
  cameraBookmark,
  debugMode,
  onCameraBookmarkChange,
  onDebugModeChange,
  onParameterChange,
  onQualityChange,
  onReset,
  onShowGrassChange,
  onShowPlanarSphereSamplesChange,
  parameters,
  quality,
  showGrass,
  showPlanarSphereSamples,
  stats,
}: {
  cameraBookmark: MediterraneanCliffCameraBookmark
  debugMode: MediterraneanCliffDebugMode
  onCameraBookmarkChange: (bookmark: MediterraneanCliffCameraBookmark) => void
  onDebugModeChange: (mode: MediterraneanCliffDebugMode) => void
  onParameterChange: (key: keyof MediterraneanErosionCliffParameters, value: number) => void
  onQualityChange: (quality: MediterraneanCliffQuality) => void
  onReset: () => void
  onShowGrassChange: (showGrass: boolean) => void
  onShowPlanarSphereSamplesChange: (show: boolean) => void
  parameters: MediterraneanErosionCliffParameters
  quality: MediterraneanCliffQuality
  showGrass: boolean
  showPlanarSphereSamples: boolean
  stats: MediterraneanErosionCliffStats
}) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  return (
    <section
      className="pointer-events-auto absolute left-4 top-4 z-10 max-h-[40vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-white/12 bg-slate-950/82 px-3 py-3 text-xs text-slate-100 shadow-2xl shadow-black/25 backdrop-blur sm:max-h-[calc(100vh-2rem)]"
      data-mediterranean-erosion-cliff-panel
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="font-medium uppercase tracking-[0.16em] text-slate-300">
            Causal Coastal Rock Lab
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            Attached buttresses · persistent joints · wave-cut toes · no post FX
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            className="h-7 rounded-md border border-white/14 bg-white/8 px-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/14"
            onClick={() => setHidden(true)}
            type="button"
          >
            Hide
          </button>
          <button
            className="h-7 rounded-md border border-white/14 bg-white/8 px-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/14"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>

      <ControlGroup label="View">
        <SegmentedButtons
          active={cameraBookmark}
          ariaLabel="Cliff camera bookmark"
          onChange={onCameraBookmarkChange}
          options={CAMERA_OPTIONS}
        />
      </ControlGroup>

      <ControlGroup label="Mechanism views">
        <SegmentedButtons
          active={debugMode}
          ariaLabel="Cliff mechanism visualization"
          onChange={onDebugModeChange}
          options={DEBUG_MODES}
        />
      </ControlGroup>

      <ControlGroup label="Resolution">
        <SegmentedButtons
          active={quality}
          ariaLabel="Cliff quality tier"
          onChange={onQualityChange}
          options={QUALITY_OPTIONS}
        />
      </ControlGroup>

      <ControlGroup label="Determinism">
        <label className="grid gap-1">
          <span className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
            <span>Geology seed</span>
            <span className="tabular-nums text-slate-100">{Math.round(parameters.seed)}</span>
          </span>
          <input
            aria-label="Geology seed"
            className="h-4 w-full accent-orange-300"
            data-erosion-cliff-parameter="seed"
            max={999}
            min={1}
            onInput={(event) => onParameterChange('seed', Number(event.currentTarget.value))}
            step={1}
            type="range"
            value={parameters.seed}
          />
        </label>
      </ControlGroup>

      {SLIDER_GROUPS.map((group) => (
        <ControlGroup key={group.id} label={group.label}>
          <div className="space-y-2.5">
            {group.sliders.map((slider) => (
              <label className="grid gap-1" key={slider.key}>
                <span className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
                  <span>{slider.label}</span>
                  <span className="tabular-nums text-slate-100">
                    {formatSliderValue(parameters[slider.key], slider.step)}
                  </span>
                </span>
                <input
                  aria-label={slider.label}
                  className="h-4 w-full accent-orange-300"
                  data-erosion-cliff-parameter={slider.key}
                  max={slider.max}
                  min={slider.min}
                  onInput={(event) =>
                    onParameterChange(slider.key, Number(event.currentTarget.value))
                  }
                  step={slider.step}
                  type="range"
                  value={parameters[slider.key]}
                />
              </label>
            ))}
          </div>
        </ControlGroup>
      ))}

      <div className="mt-3 space-y-1.5">
        <label
          className={`flex items-center gap-2 text-[11px] font-medium ${
            debugMode === 'final' ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          <input
            aria-label="Every 10th planar sphere"
            checked={showPlanarSphereSamples}
            className="size-3.5 accent-cyan-400"
            disabled={debugMode !== 'final'}
            onChange={(event) => onShowPlanarSphereSamplesChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Every 10th sphere
          <span className="text-[9px] text-slate-500">cyan pass 1 · pink pass 2</span>
        </label>
        <label
          className={`flex items-center gap-2 text-[11px] font-medium ${
            debugMode === 'final' ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          <input
            checked={showGrass}
            className="size-3.5 accent-lime-400"
            disabled={debugMode !== 'final'}
            onChange={(event) => onShowGrassChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Grass layer
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-md border border-white/10 bg-black/20 p-2 text-[10px] text-slate-400">
        <Metric label="Layers" value={stats.layerCount} />
        <Metric label="Disk radius" value={Math.round(stats.diskRadiusMeters)} suffix="m" />
        <Metric label="Grid cells" value={stats.gridCellCount} />
        <Metric label="Occupied" value={stats.occupiedCellCount} />
        <Metric
          label="Rim coverage"
          value={Math.round(stats.perimeterTopCoveragePercent)}
          suffix="%"
        />
        <Metric label="Planar passes" value={stats.planarPassCount} />
        <Metric label="Planar spheres" value={stats.planarSphereCount} />
        <Metric label="Planar patches" value={stats.planarPatchCount} />
        <Metric label="Pass 2 fills" value={stats.planarSecondPassFillCount} />
        <Metric label="Oversized unchanged" value={stats.planarOversizedTriangleCount} />
        <Metric label="Untouched faces" value={stats.planarUntouchedTriangleCount} />
        <Metric label="Deleted faces" value={stats.planarRemovedTriangleCount} />
        <Metric label="Spawned faces" value={stats.planarSpawnedTriangleCount} />
        <Metric label="Replaced tris" value={stats.planarizedTriangleCount} />
        <span className="flex items-center justify-between gap-2">
          <span>Pass topology</span>
          <span className="text-slate-200">
            {stats.planarTopologyPreserved ? 'unchanged' : 'changed'}
          </span>
        </span>
        <Metric label="Shoreline mounds" value={stats.shorelineMoundSeedCount} />
        <Metric label="Exterior rocks" value={stats.satelliteSeedCount} />
        <Metric
          label="Mound crown range"
          value={Math.round(stats.shorelineCrownVariationMeters * 10) / 10}
          suffix="m"
        />
        <Metric
          label="Height range"
          value={Math.round(stats.rockHeightVariationMeters)}
          suffix="m"
        />
        <Metric label="Sand reach" value={Math.round(stats.sandMaxRadiusMeters)} suffix="m" />
        <Metric
          label="Sand height range"
          value={Math.round(stats.sandHeightVariationMeters * 10) / 10}
          suffix="m"
        />
        <Metric label="Mist spans" value={stats.foamSegmentCount} />
        <Metric label="Draw calls" value={stats.drawCalls} />
        <Metric label="Unsupported cells" value={stats.unsupportedOccupiedCellCount} />
        <Metric label="Rock tris" value={stats.rockTriangles} />
        <Metric label="Total tris" value={stats.totalTriangles} />
        <span className="col-span-2 mt-1 flex items-center justify-between gap-2 border-t border-white/10 pt-1">
          <span>Layer occupancy</span>
          <span className="tabular-nums text-slate-200">{stats.layerOccupancy.join(' · ')}</span>
        </span>
      </div>
    </section>
  )
}

function ControlGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="mt-3">
      <h3 className="mb-2 border-b border-white/12 pb-1 text-[10px] font-semibold uppercase text-slate-400">
        {label}
      </h3>
      {children}
    </section>
  )
}

function SegmentedButtons<T extends string>({
  active,
  ariaLabel,
  onChange,
  options,
}: {
  active: T
  ariaLabel: string
  onChange: (value: T) => void
  options: readonly { id: T; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          aria-pressed={active === option.id}
          className={
            'h-7 rounded-md border px-2 text-[10px] font-medium transition ' +
            (active === option.id
              ? 'border-orange-200/90 bg-orange-300 text-slate-950'
              : 'border-white/14 bg-white/8 text-slate-200 hover:bg-white/14')
          }
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Metric({ label, suffix = '', value }: { label: string; suffix?: string; value: number }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="tabular-nums text-slate-200">
        {value.toLocaleString()}
        {suffix}
      </span>
    </span>
  )
}

function formatSliderValue(value: number, step: number) {
  if (step >= 1) return Math.round(value).toString()
  return value.toFixed(step < 0.05 ? 2 : 1)
}

function createMediterraneanErosionCliffBuild(
  surface: PascalWaterLandSurface,
  parameters: MediterraneanErosionCliffParameters,
  quality: MediterraneanCliffQuality,
): CliffBuild {
  const settings = QUALITY_SETTINGS[quality]
  const plan = createCoastalRockPlan(surface, parameters, settings)
  if (!plan) return createEmptyCliffBuild()

  const rockBuild = createCoastalRockGeometry(plan, parameters)
  const sandGeometry = createSandRampGeometry(plan, parameters, settings)
  const foamBuild = createWaterlineMistGeometry(plan, parameters)
  const layerOccupancy = plan.bounds.slice(0, -1).map((lowerY, layerIndex) => {
    const upperY = plan.bounds[layerIndex + 1]!
    return (
      plan.frames.length +
      plan.bodies.filter((body) => body.baseY < upperY && body.topY > lowerY).length
    )
  })
  const rockTriangles = triangleCount(rockBuild.geometry)
  const totalTriangles =
    rockTriangles + triangleCount(sandGeometry) + triangleCount(foamBuild.geometry)
  const sandHeightVariationMeters = sandGeometry.boundingBox
    ? sandGeometry.boundingBox.max.y - sandGeometry.boundingBox.min.y
    : 0
  const buttresses = plan.bodies.filter((body) => body.kind === 'buttress')
  const satelliteBodies = plan.bodies.filter((body) => body.kind !== 'buttress')

  return {
    foamGeometry: foamBuild.geometry,
    fractureGeometry: rockBuild.fractureGeometry,
    massGeometry: rockBuild.massGeometry,
    planarSphereSamples: rockBuild.planarSphereSamples,
    removedFaceGeometry: rockBuild.removedFaceGeometry,
    rockGeometry: rockBuild.geometry,
    sandGeometry,
    spawnedFaceGeometry: rockBuild.spawnedFaceGeometry,
    stats: {
      diskRadiusMeters: plan.diskRadius,
      drawCalls: 4,
      foamSegmentCount: foamBuild.segmentCount,
      gridCellCount: plan.frames.length * 7 + plan.bodies.length * BODY_RING_RATIOS.length * 9,
      layerCount: LAYER_COUNT,
      layerOccupancy,
      occupiedCellCount: plan.frames.length + plan.bodies.length,
      perimeterTopCoveragePercent: 100,
      planarPassCount: rockBuild.planarPassCount,
      planarOversizedTriangleCount: rockBuild.planarOversizedTriangleCount,
      planarPatchCount: rockBuild.planarPatchCount,
      planarSecondPassFillCount: rockBuild.planarSecondPassFillCount,
      planarSphereCount: rockBuild.planarSphereCount,
      planarTopologyPreserved: rockBuild.planarTopologyPreserved,
      planarRemovedTriangleCount: triangleCount(rockBuild.removedFaceGeometry),
      planarSpawnedTriangleCount: triangleCount(rockBuild.spawnedFaceGeometry),
      planarUntouchedTriangleCount: triangleCount(rockBuild.untouchedFaceGeometry),
      planarizedTriangleCount: rockBuild.planarizedTriangleCount,
      rockTriangles,
      rockHeightVariationMeters: measureBodyTopVariation(plan.bodies),
      sandHeightVariationMeters,
      sandMaxRadiusMeters: plan.sandMaxRadius,
      satelliteSeedCount: satelliteBodies.length,
      shorelineCrownVariationMeters: measureBodyTopVariation(buttresses),
      shorelineMoundSeedCount: plan.formationCount,
      totalTriangles,
      unsupportedOccupiedCellCount: 0,
    },
    supportGeometry: rockBuild.supportGeometry,
    untouchedFaceGeometry: rockBuild.untouchedFaceGeometry,
    waveGeometry: rockBuild.waveGeometry,
  }
}

function createEmptyCliffBuild(): CliffBuild {
  return {
    foamGeometry: finishFoamGeometry(createFoamWriter()),
    fractureGeometry: finishGeometry(createWriter()),
    massGeometry: finishGeometry(createWriter()),
    planarSphereSamples: [],
    removedFaceGeometry: finishGeometry(createWriter()),
    rockGeometry: finishGeometry(createWriter()),
    sandGeometry: finishGeometry(createWriter()),
    spawnedFaceGeometry: finishGeometry(createWriter()),
    stats: EMPTY_MEDITERRANEAN_EROSION_CLIFF_STATS,
    supportGeometry: finishGeometry(createWriter()),
    untouchedFaceGeometry: finishGeometry(createWriter()),
    waveGeometry: finishGeometry(createWriter()),
  }
}

function createCoastalRockPlan(
  surface: PascalWaterLandSurface,
  parameters: MediterraneanErosionCliffParameters,
  settings: QualitySettings,
): CoastalRockPlan | null {
  const perimeter = openRing(surface.shorelinePoints)
  if (perimeter.length < 3) return null

  const center = polygonAreaCentroid(perimeter)
  const segmentLengths = perimeter.map((point, index) =>
    distance2(point, perimeter[(index + 1) % perimeter.length]!),
  )
  const perimeterLength = segmentLengths.reduce((sum, length) => sum + length, 0)
  const islandRadius = perimeter.reduce(
    (maximum, point) => Math.max(maximum, distance2(point, center)),
    0,
  )
  const diskRadius = islandRadius * (1 + parameters.diskMarginRatio)
  const frameStep = Math.max(2.4, settings.cellSizeMeters * 2.8)
  const frameCount = Math.max(24, Math.ceil(perimeterLength / frameStep))
  const frames = Array.from({ length: frameCount }, (_, index) =>
    samplePerimeterFrameByDistance(
      perimeter,
      segmentLengths,
      perimeterLength,
      (index / frameCount) * perimeterLength,
      center,
    ),
  )
  const waveAngle =
    Math.PI * 0.245 + hashSigned(parameters.seed + 73.1, parameters.seed - 41.7) * 0.16
  const waveDirection = { x: Math.cos(waveAngle), z: Math.sin(waveAngle) }
  const jointAngleA =
    Math.PI * 0.11 + hashSigned(parameters.seed + 101.3, parameters.seed - 23.9) * 0.12
  const jointAngleB =
    jointAngleA + Math.PI * lerp(0.42, 0.57, hashUnit(parameters.seed + 131.7, 19.3))
  const jointNormals = [
    { x: Math.cos(jointAngleA), z: Math.sin(jointAngleA) },
    { x: Math.cos(jointAngleB), z: Math.sin(jointAngleB) },
  ] as const
  const jointSpacings = [
    Math.max(8, parameters.noiseScaleMeters * 1.08),
    Math.max(6.5, parameters.noiseScaleMeters * 0.72),
  ] as const
  const jointPhases = [
    hashUnit(parameters.seed + 163.1, 37.9),
    hashUnit(parameters.seed + 191.9, 53.3),
  ] as const
  const bounds = createLayerBounds(parameters.bottomDepthMeters, surface.plateauElevation)
  const spacingScale = lerp(1.16, 0.84, clamp((parameters.growthMultiplier - 0.4) / 1.4, 0, 1))
  const targetSpacing =
    lerp(25, 18, parameters.noiseStrength) *
    spacingScale *
    lerp(0.88, 1.14, clamp(parameters.noiseScaleMeters / 28, 0, 1))
  const formationCount = clamp(Math.round(perimeterLength / targetSpacing), 11, 21)
  const bodies: RockBodyPlan[] = []
  let nextBodyId = 0

  const appendBody = (body: Omit<RockBodyPlan, 'id'>) => {
    bodies.push({ ...body, id: nextBodyId })
    nextBodyId += 1
  }

  for (let formationId = 0; formationId < formationCount; formationId += 1) {
    const jitter = 0.16 + hashUnit(formationId + 17, parameters.seed + 211) * 0.68
    const frame = samplePerimeterFrameByDistance(
      perimeter,
      segmentLengths,
      perimeterLength,
      perimeterLength * ((formationId + jitter) / formationCount),
      center,
    )
    const exposure = coastalExposure(frame.outward, waveDirection)
    const strengthNoise = domainWarpedValueNoise(
      frame.point.x,
      frame.point.z,
      Math.max(parameters.noiseScaleMeters * 1.9, 18),
      parameters.seed + 503,
    )
    const strength = clamp(
      0.68 + strengthNoise * 0.52 + parameters.centerInfluence * 0.12,
      0.72,
      1.28,
    )
    const localSpacing = perimeterLength / formationCount
    const hierarchy = hashUnit(formationId + 41, parameters.seed + 223)
    const width =
      localSpacing *
      lerp(0.82, 1.3, smoothCurve(hierarchy)) *
      lerp(0.86, 1.08, parameters.perimeterInfluence)
    const projection =
      (parameters.moundBulgeMeters + 1) *
      parameters.growthMultiplier *
      0.85 *
      lerp(0.72, 1.06, exposure) *
      lerp(0.78, 1.18, strengthNoise)
    const heightNoise = hashUnit(formationId + 83, parameters.seed + 239)
    const topRatio = lerp(0.88, lerp(0.93, 1, heightNoise), parameters.rockHeightVariation)
    const topY = surface.plateauElevation * topRatio
    const baseY = -lerp(5.2, 7.2, exposure)
    const attachmentDepth = Math.min(2.4, parameters.perimeterFalloffMeters * 0.12)
    const baseAnchor = {
      x: frame.point.x - frame.outward.x * attachmentDepth,
      z: frame.point.z - frame.outward.z * attachmentDepth,
    }
    const splitChance = clamp(
      0.3 + parameters.splitStrength * parameters.jointCarving * lerp(0.52, 0.86, exposure),
      0,
      0.88,
    )
    const split =
      hierarchy > 0.32 || hashUnit(formationId + 109, parameters.seed + 251) < splitChance
    const tripleSplit =
      split &&
      hashUnit(formationId + 113, parameters.seed + 257) <
        lerp(0.16, 0.34, exposure) * parameters.splitStrength
    const lobeCount = tripleSplit ? 3 : split ? 2 : 1

    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const side = lobeCount === 1 ? 0 : lerp(-1, 1, lobeIndex / (lobeCount - 1))
      const tangentOffset = side * width * (tripleSplit ? 0.31 : 0.235)
      const lobeWidth = width * (tripleSplit ? 0.48 : split ? 0.64 : 1.02)
      const lobeProjection =
        projection *
        lerp(0.86, 1.15, hashUnit(formationId * 5 + lobeIndex + 137, parameters.seed + 263))
      const jointFamily = ((formationId + lobeIndex) % 2) as 0 | 1
      appendBody({
        anchor: {
          x: baseAnchor.x + frame.tangent.x * tangentOffset,
          z: baseAnchor.z + frame.tangent.z * tangentOffset,
        },
        baseY,
        exposure,
        formationId,
        grooveAngle: bodyGrooveAngle(frame, jointNormals[jointFamily]),
        jointFamily,
        jointLean:
          hashSigned(formationId * 7 + lobeIndex + 157, parameters.seed + 277) *
          parameters.growthDirectionChaos,
        kind: 'buttress',
        outward: frame.outward,
        outwardRadius: lobeProjection * lerp(0.34, 0.4, strength),
        projection: lobeProjection,
        strength,
        tangent: frame.tangent,
        tangentRadius: lobeWidth * 0.5,
        topY:
          topY *
          lerp(0.82, 1.03, hashUnit(formationId * 11 + lobeIndex + 173, parameters.seed + 293)),
      })
    }

    const appendixChance = parameters.satelliteRockDensity * lerp(0.58, 0.92, exposure)
    if (hashUnit(formationId + 193, parameters.seed + 307) < appendixChance) {
      const side = hashSigned(formationId + 211, parameters.seed + 313)
      const scale = parameters.satelliteRockScale * lerp(0.72, 1.06, strengthNoise)
      const appendixProjection = projection * scale * 0.68
      appendBody({
        anchor: {
          x:
            frame.point.x +
            frame.outward.x * projection * 0.46 +
            frame.tangent.x * side * width * 0.22,
          z:
            frame.point.z +
            frame.outward.z * projection * 0.46 +
            frame.tangent.z * side * width * 0.22,
        },
        baseY: -lerp(3.8, 5.4, exposure),
        exposure,
        formationId,
        grooveAngle: bodyGrooveAngle(frame, jointNormals[(formationId + 1) % 2]!),
        jointFamily: ((formationId + 1) % 2) as 0 | 1,
        jointLean: hashSigned(formationId + 223, parameters.seed + 331) * 0.42,
        kind: 'appendix',
        outward: frame.outward,
        outwardRadius: appendixProjection * 0.36,
        projection: appendixProjection,
        strength,
        tangent: frame.tangent,
        tangentRadius: width * scale * 0.3,
        topY: topY * lerp(0.56, 0.76, hashUnit(formationId + 239, parameters.seed + 347)),
      })
    }

    const toeCount =
      hashUnit(formationId + 257, parameters.seed + 359) <
      parameters.satelliteRockDensity * lerp(0.34, 0.68, exposure)
        ? hashUnit(formationId + 269, parameters.seed + 367) < 0.32
          ? 2
          : 1
        : 0
    for (let toeIndex = 0; toeIndex < toeCount; toeIndex += 1) {
      const toeScale =
        parameters.satelliteRockScale *
        lerp(2.1, 4.2, hashUnit(formationId * 13 + toeIndex + 281, parameters.seed + 379))
      const tangentOffset =
        hashSigned(formationId * 17 + toeIndex + 307, parameters.seed + 389) * width * 0.42
      appendBody({
        anchor: {
          x:
            frame.point.x +
            frame.outward.x * (projection * 0.76 + toeScale * 0.24) +
            frame.tangent.x * tangentOffset,
          z:
            frame.point.z +
            frame.outward.z * (projection * 0.76 + toeScale * 0.24) +
            frame.tangent.z * tangentOffset,
        },
        baseY: -lerp(0.9, 1.8, hashUnit(formationId + toeIndex + 317, parameters.seed + 401)),
        exposure,
        formationId,
        grooveAngle: bodyGrooveAngle(frame, jointNormals[formationId % 2]!),
        jointFamily: (formationId % 2) as 0 | 1,
        jointLean: hashSigned(formationId + toeIndex + 337, parameters.seed + 419) * 0.28,
        kind: 'toe',
        outward: frame.outward,
        outwardRadius: toeScale * 0.78,
        projection: toeScale * 1.08,
        strength,
        tangent: frame.tangent,
        tangentRadius: toeScale * 0.92,
        topY: lerp(
          0.9,
          Math.min(4, topY * 0.42),
          hashUnit(formationId + toeIndex + 349, parameters.seed + 431),
        ),
      })
    }
  }

  const sandMaxRadius = calculateSandMaxRadius(center, diskRadius, parameters)
  return {
    bodies,
    bounds,
    center,
    diskRadius,
    formationCount,
    frames,
    islandRadius,
    jointNormals,
    jointPhases,
    jointSpacings,
    minX: center.x - diskRadius,
    minZ: center.z - diskRadius,
    perimeter,
    perimeterLength,
    sandMaxRadius,
    waveDirection,
  }
}

function createLayerBounds(bottomDepthMeters: number, plateauElevation: number) {
  return [
    -bottomDepthMeters,
    -(bottomDepthMeters * 2) / 3,
    -bottomDepthMeters / 3,
    WATERLINE_Y,
    plateauElevation / 3,
    (plateauElevation * 2) / 3,
    plateauElevation,
  ] as const
}

function coastalExposure(outward: Point2, waveDirection: Point2) {
  const facing = outward.x * waveDirection.x + outward.z * waveDirection.z
  return clamp(0.18 + smoothstep(-0.28, 0.94, facing) * 0.82, 0.18, 1)
}

function bodyGrooveAngle(frame: PerimeterFrame, jointNormal: Point2) {
  return Math.atan2(
    jointNormal.x * frame.outward.x + jointNormal.z * frame.outward.z,
    jointNormal.x * frame.tangent.x + jointNormal.z * frame.tangent.z,
  )
}

function samplePerimeterFrameByDistance(
  perimeter: readonly Point2[],
  segmentLengths: readonly number[],
  perimeterLength: number,
  distance: number,
  center: Point2,
): PerimeterFrame {
  const wrappedDistance = ((distance % perimeterLength) + perimeterLength) % perimeterLength
  let remaining = wrappedDistance
  for (let index = 0; index < perimeter.length; index += 1) {
    const start = perimeter[index]!
    const end = perimeter[(index + 1) % perimeter.length]!
    const length = segmentLengths[index]!
    if (remaining > length && index < perimeter.length - 1) {
      remaining -= length
      continue
    }
    const ratio = clamp(remaining / Math.max(length, 0.001), 0, 1)
    const point = lerp2(start, end, ratio)
    const frameSpan = Math.min(Math.max(perimeterLength * 0.006, 0.8), length * 0.75)
    const before = sampleRingPointByDistance(
      perimeter,
      segmentLengths,
      perimeterLength,
      wrappedDistance - frameSpan,
    )
    const after = sampleRingPointByDistance(
      perimeter,
      segmentLengths,
      perimeterLength,
      wrappedDistance + frameSpan,
    )
    const tangent = normalize2(after.x - before.x, after.z - before.z)
    let outward = { x: -tangent.z, z: tangent.x }
    if (outward.x * (point.x - center.x) + outward.z * (point.z - center.z) < 0) {
      outward = { x: -outward.x, z: -outward.z }
    }
    return { distance: wrappedDistance, outward, point, tangent }
  }
  const point = perimeter[0]!
  const outward = normalize2(point.x - center.x, point.z - center.z)
  return {
    distance: wrappedDistance,
    outward,
    point,
    tangent: { x: -outward.z, z: outward.x },
  }
}

function sampleRingPointByDistance(
  perimeter: readonly Point2[],
  segmentLengths: readonly number[],
  perimeterLength: number,
  distance: number,
) {
  let remaining = ((distance % perimeterLength) + perimeterLength) % perimeterLength
  for (let index = 0; index < perimeter.length; index += 1) {
    const length = segmentLengths[index]!
    if (remaining <= length || index === perimeter.length - 1) {
      return lerp2(
        perimeter[index]!,
        perimeter[(index + 1) % perimeter.length]!,
        clamp(remaining / Math.max(length, 0.001), 0, 1),
      )
    }
    remaining -= length
  }
  return perimeter[0]!
}

function polygonAreaCentroid(points: readonly Point2[]): Point2 {
  let areaTwice = 0
  let x = 0
  let z = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const cross = current.x * next.z - next.x * current.z
    areaTwice += cross
    x += (current.x + next.x) * cross
    z += (current.z + next.z) * cross
  }
  if (Math.abs(areaTwice) <= 0.000001) {
    const sum = points.reduce((value, point) => ({ x: value.x + point.x, z: value.z + point.z }), {
      x: 0,
      z: 0,
    })
    return { x: sum.x / points.length, z: sum.z / points.length }
  }
  return { x: x / (areaTwice * 3), z: z / (areaTwice * 3) }
}

function createCoastalRockGeometry(
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
) {
  const sourceWriter = createRockWriter()
  emitCoreCliffRibbon(sourceWriter, plan, parameters)
  for (const body of plan.bodies) emitRockBody(sourceWriter, body, plan, parameters)

  const planarPass = applyPlanarConsolidation(sourceWriter, plan, parameters)
  const finalWriter = createRockWriter()
  const removedWriter = createRockWriter()
  const spawnedWriter = createRockWriter()
  const untouchedWriter = createRockWriter()
  const sourceTriangleCount = Math.floor(sourceWriter.positions.length / 9)
  for (let triangleIndex = 0; triangleIndex < sourceTriangleCount; triangleIndex += 1) {
    const replacement = planarPass.replacements[triangleIndex] ?? null
    if (!replacement) {
      copyRockTriangle(sourceWriter, finalWriter, triangleIndex)
      copyRockTriangle(sourceWriter, untouchedWriter, triangleIndex)
      continue
    }
    const sourceSample = writerTriangleSample(sourceWriter, triangleIndex)
    copyRockTriangle(sourceWriter, removedWriter, triangleIndex, {
      color: sourceSample ? removedFaceDebugColor(sourceSample, plan) : DIAGNOSTIC.deletedLight,
    })
    copyRockTriangle(sourceWriter, spawnedWriter, triangleIndex, {
      color: replacement.debugColor,
      normal: replacement.normal,
    })
    copyRockTriangle(sourceWriter, finalWriter, triangleIndex, { normal: replacement.normal })
  }
  const planarTopologyPreserved =
    finalWriter.positions.length === sourceWriter.positions.length &&
    finalWriter.positions.every((value, index) => value === sourceWriter.positions[index])
  const fractureGeometry = createDiagnosticRockGeometry(finalWriter, 'fracture-field')
  const massGeometry = createDiagnosticRockGeometry(finalWriter, 'mass-structure')
  const supportGeometry = createDiagnosticRockGeometry(finalWriter, 'support')
  const waveGeometry = createDiagnosticRockGeometry(finalWriter, 'wave-exposure')
  applyPainterlyDirectionalShading(finalWriter, parameters)

  return {
    fractureGeometry,
    geometry: finishGeometry(finalWriter),
    massGeometry,
    removedFaceGeometry: finishGeometry(removedWriter),
    spawnedFaceGeometry: finishGeometry(spawnedWriter),
    supportGeometry,
    untouchedFaceGeometry: finishGeometry(untouchedWriter),
    waveGeometry,
    ...planarPass,
    planarTopologyPreserved,
  }
}

function applyPainterlyDirectionalShading(
  writer: RockWriter,
  parameters: MediterraneanErosionCliffParameters,
) {
  const lightDirection = normalize3({ x: -0.68, y: 0.58, z: 0.42 })
  const shadowTint = color('#4b3040')
  const transition = lerp(0.025, 0.095, parameters.toonSoftness)
  for (let triangleIndex = 0; triangleIndex < writer.triangleMeta.length; triangleIndex += 1) {
    const offset = triangleIndex * 9
    const normal = normalize3({
      x: writer.normals[offset]!,
      y: writer.normals[offset + 1]!,
      z: writer.normals[offset + 2]!,
    })
    const direct = Math.max(0, dot3(normal, lightDirection))
    const skyFill = clamp(normal.y * 0.5 + 0.5, 0, 1)
    const signal = clamp(direct * 0.78 + skyFill * 0.22, 0, 1)
    let shade = 0.48
    shade = lerp(shade, 0.64, smoothstep(0.16 - transition, 0.16 + transition, signal))
    shade = lerp(shade, 0.8, smoothstep(0.4 - transition, 0.4 + transition, signal))
    shade = lerp(shade, 0.94, smoothstep(0.68 - transition, 0.68 + transition, signal))
    shade = lerp(shade, 1, smoothstep(0.86 - transition, 0.86 + transition, signal))
    const meta = writer.triangleMeta[triangleIndex]!
    const cavity =
      smoothstep(0.18, 0.9, meta.fracture) * parameters.cavityDarkening * 0.27 +
      (meta.kind === 'core' ? 0.035 : 0)
    const shadowWeight = clamp((1 - shade) * 0.68 + cavity, 0, 0.7)
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const colorOffset = offset + vertex * 3
      const base = [
        writer.colors[colorOffset]!,
        writer.colors[colorOffset + 1]!,
        writer.colors[colorOffset + 2]!,
      ] as const
      const shaded = mixColor(base, shadowTint, shadowWeight)
      writer.colors[colorOffset] = shaded[0]
      writer.colors[colorOffset + 1] = shaded[1]
      writer.colors[colorOffset + 2] = shaded[2]
    }
  }
}

function emitCoreCliffRibbon(
  writer: RockWriter,
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
) {
  const rings = plan.bounds.map((height, layerIndex) =>
    plan.frames.map((frame) => coreRibbonVertex(frame, height, layerIndex, plan, parameters)),
  )
  for (let layerIndex = 0; layerIndex < rings.length - 1; layerIndex += 1) {
    const lowerRing = rings[layerIndex]!
    const upperRing = rings[layerIndex + 1]!
    for (let frameIndex = 0; frameIndex < plan.frames.length; frameIndex += 1) {
      const nextFrame = (frameIndex + 1) % plan.frames.length
      const frame = plan.frames[frameIndex]!
      const vertices = [
        lowerRing[frameIndex]!,
        lowerRing[nextFrame]!,
        upperRing[nextFrame]!,
        upperRing[frameIndex]!,
      ] as const
      const meta = rockTriangleMeta(vertices, {
        bodyId: -1,
        formationId: Math.floor((frame.distance / plan.perimeterLength) * plan.formationCount),
        kind: 'core',
        layerIndex,
      })
      emitRockQuad(writer, vertices, { x: frame.outward.x, y: 0.04, z: frame.outward.z }, meta)
    }
  }
}

function coreRibbonVertex(
  frame: PerimeterFrame,
  height: number,
  layerIndex: number,
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
): RockVertex {
  const exposure = coastalExposure(frame.outward, plan.waveDirection)
  const offsets = [1.2, 1.55, 1.9, -0.45, 1.45, 0.75, 0.08] as const
  const broadStrength = domainWarpedValueNoise(
    frame.point.x,
    frame.point.z,
    Math.max(parameters.noiseScaleMeters * 1.75, 16),
    parameters.seed + 601,
  )
  const boundaryVariation =
    (broadStrength - 0.5) *
    parameters.boundaryJitter *
    4.2 *
    Math.sin((layerIndex / (LAYER_COUNT - 1)) * Math.PI)
  const preliminary = {
    x: frame.point.x + frame.outward.x * (offsets[layerIndex]! + boundaryVariation),
    y: height,
    z: frame.point.z + frame.outward.z * (offsets[layerIndex]! + boundaryVariation),
  }
  const fracture = jointWeaknessAtPoint(preliminary, plan, parameters)
  const waterlineAttack = 1 - smoothstep(0.2, 1.8, Math.abs(height - WATERLINE_Y))
  const indentation =
    fracture * parameters.jointCarving * parameters.jointWidthMeters * 0.34 +
    waterlineAttack * exposure * parameters.upperLayerErosion * 0.34
  return {
    exposure,
    fracture: Math.max(fracture, waterlineAttack * exposure * 0.34),
    point: {
      x: preliminary.x - frame.outward.x * indentation,
      y: height - fracture * parameters.jointWidthMeters * 0.08,
      z: preliminary.z - frame.outward.z * indentation,
    },
    support: 1,
  }
}

function emitRockBody(
  writer: RockWriter,
  body: RockBodyPlan,
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
) {
  const radialSegments = body.kind === 'buttress' ? 8 : body.kind === 'appendix' ? 7 : 6
  const rings = BODY_RING_RATIOS.map((ratio) =>
    Array.from({ length: radialSegments }, (_, segment) =>
      bodySurfaceVertex(body, ratio, segment, radialSegments, plan, parameters),
    ),
  )
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const lowerRing = rings[ringIndex]!
    const upperRing = rings[ringIndex + 1]!
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const nextSegment = (segment + 1) % radialSegments
      const vertices = [
        lowerRing[segment]!,
        lowerRing[nextSegment]!,
        upperRing[nextSegment]!,
        upperRing[segment]!,
      ] as const
      if (bodyFaceIsHidden(vertices, body, plan)) continue
      const centroid = averagePoints(vertices.map((vertex) => vertex.point))
      const hint = normalize3({
        x: centroid.x - body.anchor.x,
        y: (centroid.y - (body.baseY + body.topY) * 0.5) * 0.12,
        z: centroid.z - body.anchor.z,
      })
      const meta = rockTriangleMeta(vertices, {
        bodyId: body.id,
        formationId: body.formationId,
        kind: body.kind,
        layerIndex: layerIndexAtHeight(centroid.y, plan.bounds),
      })
      emitRockQuad(writer, vertices, hint, meta)
    }
  }

  const bottomRing = rings[0]!
  const topRing = rings.at(-1)!
  const bottomCenter = bodyCapCenter(bottomRing, body.baseY - 0.035)
  const topCenter = bodyCapCenter(
    topRing,
    body.topY + Math.max(0.08, (body.topY - body.baseY) * 0.018),
  )
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const nextSegment = (segment + 1) % radialSegments
    const bottomVertices = [bottomRing[nextSegment]!, bottomRing[segment]!, bottomCenter] as const
    if (!bodyFaceIsHidden(bottomVertices, body, plan)) {
      emitRockTriangle(
        writer,
        bottomVertices,
        { x: 0, y: -1, z: 0 },
        rockTriangleMeta(bottomVertices, {
          bodyId: body.id,
          formationId: body.formationId,
          kind: body.kind,
          layerIndex: layerIndexAtHeight(body.baseY, plan.bounds),
        }),
      )
    }
    const topVertices = [topRing[segment]!, topRing[nextSegment]!, topCenter] as const
    if (!bodyFaceIsHidden(topVertices, body, plan)) {
      emitRockTriangle(
        writer,
        topVertices,
        { x: 0, y: 1, z: 0 },
        rockTriangleMeta(topVertices, {
          bodyId: body.id,
          formationId: body.formationId,
          kind: body.kind,
          layerIndex: layerIndexAtHeight(body.topY, plan.bounds),
        }),
      )
    }
  }
}

function bodySurfaceVertex(
  body: RockBodyPlan,
  ratio: number,
  segment: number,
  radialSegments: number,
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
): RockVertex {
  const baseAngle = (segment / radialSegments) * Math.PI * 2
  const columnTurn =
    hashSigned(body.id * 97 + segment * 31, parameters.seed + body.formationId * 17) *
    parameters.boundaryJitter *
    0.34
  const angle = baseAngle + columnTurn
  const tangentProfile = bodyProfileScale(body.kind, ratio, 'tangent')
  const outwardProfile = bodyProfileScale(body.kind, ratio, 'outward')
  const centerProfile = bodyProfileScale(body.kind, ratio, 'center')
  const exponent = body.kind === 'toe' ? 0.74 : body.kind === 'appendix' ? 0.82 : 0.88
  const columnIrregularity =
    1 +
    hashSigned(body.id * 131 + segment * 43, parameters.seed + 719) *
      (0.055 + parameters.boundaryJitter * 0.28)
  let localTangent =
    signedPower(Math.cos(angle), exponent) *
    body.tangentRadius *
    tangentProfile *
    columnIrregularity
  let localOutward =
    signedPower(Math.sin(angle), exponent) *
    body.outwardRadius *
    outwardProfile *
    (2 - columnIrregularity)
  const frontalWeight = Math.max(0, Math.sin(angle))
  localOutward *=
    1 +
    frontalWeight *
      hashSigned(body.id * 149 + segment * 47, parameters.seed + 727) *
      (0.08 + parameters.boundaryJitter * 0.24)
  const height = lerp(body.baseY, body.topY, ratio)
  const waterlineAttack =
    body.kind === 'toe' ? 0 : 1 - smoothstep(0.22, 1.35, Math.abs(height - WATERLINE_Y))
  const waterlineVariation = lerp(
    0.68,
    1.28,
    hashUnit(body.id * 157 + segment * 53, parameters.seed + 733),
  )
  localOutward *=
    1 - waterlineAttack * body.exposure * parameters.upperLayerErosion * 0.16 * waterlineVariation
  const grooveAngle = body.grooveAngle + body.jointLean * (ratio - 0.42) * 0.38
  const angularDistance = wrappedAngleDistance(angle, grooveAngle)
  const grooveWidth = clamp(
    (parameters.jointWidthMeters / Math.max(body.tangentRadius + body.outwardRadius, 0.001)) * 1.8,
    0.1,
    0.4,
  )
  const groove =
    (1 - smoothstep(grooveWidth, grooveWidth * 2.2, angularDistance)) *
    smoothstep(0.06, 0.3, ratio) *
    (1 - smoothstep(0.92, 1, ratio))
  const grooveScale = 1 - groove * parameters.jointCarving * parameters.splitStrength * 0.52
  localTangent *= grooveScale
  localOutward *= grooveScale
  const centerOutward = body.projection * centerProfile
  const tangentLean = body.jointLean * body.tangentRadius * (ratio - 0.28) * 0.18
  const slabBreakIndex = 2 + Math.floor(hashUnit(body.id * 163 + 11, parameters.seed + 739) * 3)
  const slabBreakRatio = BODY_RING_RATIOS[slabBreakIndex]!
  const upperSlab = ratio >= slabBreakRatio ? 1 : 0
  const slabFracture = 1 - smoothstep(0.001, 0.055, Math.abs(ratio - slabBreakRatio))
  const slabShearTangent =
    upperSlab * body.tangentRadius * hashSigned(body.id * 167 + 17, parameters.seed + 751) * 0.085
  const slabShearOutward =
    -upperSlab *
    body.outwardRadius *
    lerp(0.035, 0.09, hashUnit(body.id * 179 + 23, parameters.seed + 757))
  const preliminary = {
    x:
      body.anchor.x +
      body.outward.x * (centerOutward + localOutward + slabShearOutward) +
      body.tangent.x * (localTangent + tangentLean + slabShearTangent),
    y:
      height +
      (localTangent / Math.max(body.tangentRadius, 0.001)) *
        body.jointLean *
        (body.topY - body.baseY) *
        0.035 +
      hashSigned(body.id * 173 + segment * 59, parameters.seed + 743) *
        (body.topY - body.baseY) *
        (0.035 + parameters.boundaryJitter * 0.08) *
        Math.sin(ratio * Math.PI) -
      upperSlab * (body.topY - body.baseY) * 0.012,
    z:
      body.anchor.z +
      body.outward.z * (centerOutward + localOutward + slabShearOutward) +
      body.tangent.z * (localTangent + tangentLean + slabShearTangent),
  }
  const joint = jointWeaknessAtPoint(preliminary, plan, parameters)
  const radial = normalize2(
    body.outward.x * localOutward + body.tangent.x * localTangent,
    body.outward.z * localOutward + body.tangent.z * localTangent,
  )
  const jointIndent =
    joint *
    parameters.jointCarving *
    parameters.jointWidthMeters *
    (body.kind === 'toe' ? 0.08 : body.kind === 'appendix' ? 0.22 : 0.28)
  return {
    exposure: body.exposure,
    fracture: Math.max(
      groove,
      joint,
      slabFracture * lerp(0.58, 0.92, parameters.splitStrength),
      waterlineAttack * body.exposure * 0.34,
    ),
    point: {
      x: preliminary.x - radial.x * jointIndent,
      y: preliminary.y - Math.max(groove, joint) * parameters.jointWidthMeters * 0.07,
      z: preliminary.z - radial.z * jointIndent,
    },
    support: 1,
  }
}

function bodyProfileScale(
  kind: Exclude<RockBodyKind, 'core'>,
  ratio: number,
  channel: 'center' | 'outward' | 'tangent',
) {
  const profiles =
    kind === 'toe'
      ? {
          center: [0.18, 0.24, 0.22, 0.17, 0.11, 0.06, 0.025],
          outward: [0.74, 1, 0.94, 0.8, 0.58, 0.36, 0.18],
          tangent: [0.76, 1, 0.96, 0.82, 0.62, 0.4, 0.2],
        }
      : kind === 'appendix'
        ? {
            center: [0.53, 0.54, 0.52, 0.49, 0.44, 0.38, 0.3],
            outward: [0.92, 1, 0.96, 0.9, 0.82, 0.7, 0.52],
            tangent: [0.78, 1, 0.96, 0.9, 0.78, 0.62, 0.38],
          }
        : {
            center: [0.52, 0.52, 0.51, 0.49, 0.46, 0.42, 0.35],
            outward: [0.94, 1, 0.96, 0.9, 0.82, 0.7, 0.55],
            tangent: [0.82, 1, 0.97, 0.91, 0.8, 0.66, 0.44],
          }
  return sampleProfile(BODY_RING_RATIOS, profiles[channel], ratio)
}

function sampleProfile(ratios: readonly number[], values: readonly number[], ratio: number) {
  for (let index = 0; index < ratios.length - 1; index += 1) {
    if (ratio > ratios[index + 1]!) continue
    const localRatio =
      (ratio - ratios[index]!) / Math.max(ratios[index + 1]! - ratios[index]!, 0.001)
    return lerp(values[index]!, values[index + 1]!, smoothCurve(localRatio))
  }
  return values.at(-1)!
}

function bodyCapCenter(ring: readonly RockVertex[], y: number): RockVertex {
  const point = averagePoints(ring.map((vertex) => vertex.point))
  return {
    exposure: ring.reduce((sum, vertex) => sum + vertex.exposure, 0) / ring.length,
    fracture: ring.reduce((sum, vertex) => sum + vertex.fracture, 0) / ring.length,
    point: { ...point, y },
    support: 1,
  }
}

function bodyFaceIsHidden(
  vertices: readonly RockVertex[],
  _body: RockBodyPlan,
  plan: CoastalRockPlan,
) {
  return vertices.every(
    (vertex) =>
      pointInPolygon(vertex.point, plan.perimeter) &&
      nearestRingSegmentDistance(vertex.point, plan.perimeter) > 0.9,
  )
}

function jointWeaknessAtPoint(
  point: Point3,
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
) {
  let weakness = 0
  for (let family = 0; family < plan.jointNormals.length; family += 1) {
    const normal = plan.jointNormals[family]!
    const spacing = plan.jointSpacings[family]!
    const phase = plan.jointPhases[family]!
    const coordinate =
      (point.x * normal.x + point.z * normal.z) / spacing +
      phase +
      point.y * (family === 0 ? 0.012 : -0.018) * parameters.growthDirectionChaos
    const cellDistance = Math.abs(fract(coordinate + 0.5) - 0.5) * spacing
    const familyWeakness =
      1 - smoothstep(0, Math.max(parameters.jointWidthMeters * 0.62, 0.08), cellDistance)
    weakness = Math.max(weakness, familyWeakness * (family === 0 ? 1 : 0.78))
  }
  return clamp(weakness, 0, 1)
}

function rockTriangleMeta(
  vertices: readonly RockVertex[],
  identity: Pick<RockTriangleMeta, 'bodyId' | 'formationId' | 'kind' | 'layerIndex'>,
): RockTriangleMeta {
  return {
    ...identity,
    exposure: vertices.reduce((sum, vertex) => sum + vertex.exposure, 0) / vertices.length,
    fracture: vertices.reduce((sum, vertex) => sum + vertex.fracture, 0) / vertices.length,
    support: vertices.reduce((sum, vertex) => sum + vertex.support, 0) / vertices.length,
  }
}

function emitRockQuad(
  writer: RockWriter,
  vertices: readonly [RockVertex, RockVertex, RockVertex, RockVertex],
  outwardHint: Point3,
  meta: RockTriangleMeta,
) {
  const firstNormal = cross3(
    subtract3(vertices[1].point, vertices[0].point),
    subtract3(vertices[2].point, vertices[0].point),
  )
  const secondNormal = cross3(
    subtract3(vertices[2].point, vertices[0].point),
    subtract3(vertices[3].point, vertices[0].point),
  )
  let quadNormal = normalize3({
    x: firstNormal.x + secondNormal.x,
    y: firstNormal.y + secondNormal.y,
    z: firstNormal.z + secondNormal.z,
  })
  if (dot3(quadNormal, outwardHint) < 0) quadNormal = scale3(quadNormal, -1)
  emitRockTriangle(writer, [vertices[0], vertices[1], vertices[2]], outwardHint, meta, quadNormal)
  emitRockTriangle(writer, [vertices[0], vertices[2], vertices[3]], outwardHint, meta, quadNormal)
}

function emitRockTriangle(
  writer: RockWriter,
  vertices: readonly [RockVertex, RockVertex, RockVertex],
  outwardHint: Point3,
  meta: RockTriangleMeta,
  forcedNormal?: Point3,
) {
  let oriented = vertices
  let geometricNormal = triangleNormal(
    vertices.map((vertex) => vertex.point) as [Point3, Point3, Point3],
  )
  if (length3(geometricNormal) <= 0.000001) return
  if (dot3(geometricNormal, outwardHint) < 0) {
    oriented = [vertices[0], vertices[2], vertices[1]]
    geometricNormal = scale3(geometricNormal, -1)
  }
  const normal =
    forcedNormal && dot3(forcedNormal, outwardHint) >= 0 ? forcedNormal : geometricNormal
  for (const vertex of oriented) {
    const tint = rockSurfaceColor(vertex.point, ROCK_COLOR_BOUNDS)
    writer.positions.push(vertex.point.x, vertex.point.y, vertex.point.z)
    writer.normals.push(normal.x, normal.y, normal.z)
    writer.colors.push(tint[0], tint[1], tint[2])
    writer.uvs.push(vertex.point.x / 4, vertex.point.z / 4)
  }
  writer.triangleMeta.push(meta)
}

function rockSurfaceColor(
  renderedPoint: Point3,
  bounds: readonly number[],
): readonly [number, number, number] {
  let result = rockHeightPaletteColor(renderedPoint.y, bounds)
  const waterlineSalt = 1 - smoothstep(0.15, 1.2, Math.abs(renderedPoint.y - WATERLINE_Y))
  result = mixColor(result, color('#e5d5bd'), waterlineSalt * 0.16)
  return result
}

function rockHeightPaletteColor(height: number, bounds: readonly number[]) {
  const firstCenter = (bounds[0]! + bounds[1]!) * 0.5
  if (height <= firstCenter) return ROCK_HEIGHT_PALETTE[0]
  for (let index = 0; index < ROCK_HEIGHT_PALETTE.length - 1; index += 1) {
    const lowerCenter = (bounds[index]! + bounds[index + 1]!) * 0.5
    const upperCenter = (bounds[index + 1]! + bounds[index + 2]!) * 0.5
    if (height > upperCenter) continue
    const blend = smoothstep(
      0,
      1,
      (height - lowerCenter) / Math.max(upperCenter - lowerCenter, 0.001),
    )
    return mixColor(ROCK_HEIGHT_PALETTE[index]!, ROCK_HEIGHT_PALETTE[index + 1]!, blend)
  }
  return ROCK_HEIGHT_PALETTE.at(-1)!
}

function signedPower(value: number, exponent: number) {
  return Math.sign(value) * Math.abs(value) ** exponent
}

function wrappedAngleDistance(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)))
}

function createRockWriter(): RockWriter {
  return { ...createWriter(), triangleMeta: [] }
}

function applyPlanarConsolidation(
  writer: RockWriter,
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
) {
  const sourceTriangleCount = Math.floor(writer.positions.length / 9)
  const replacements: (PlanarTriangleReplacement | null)[] = Array.from(
    { length: sourceTriangleCount },
    () => null,
  )
  if (sourceTriangleCount === 0 || parameters.flatSurfaceRatio <= 0) {
    return {
      planarPassCount: PLANAR_PASS_COUNT,
      planarOversizedTriangleCount: 0,
      planarPatchCount: 0,
      planarSecondPassFillCount: 0,
      planarSphereCount: 0,
      planarSphereSamples: [],
      planarizedTriangleCount: 0,
      replacements,
    }
  }

  const samples = Array.from({ length: sourceTriangleCount }, (_, triangleIndex) =>
    writerTriangleSample(writer, triangleIndex),
  )
  const planarOversizedTriangleCount = samples.reduce(
    (count, sample) =>
      sample && !planarTriangleFitsSphereSurfaceLimit(sample, plan) ? count + 1 : count,
    0,
  )
  const mergeCosine = Math.cos((parameters.planarMergeAngleDegrees * Math.PI) / 180)
  const planarStrength = smoothstep(0.05, 0.85, parameters.flatSurfaceRatio)
  const firstPass = buildPlanarConsolidationPass(samples, plan, parameters.seed, mergeCosine, 0)
  const intermediateSamples = samples.map((sample, triangleIndex) => {
    if (!sample) return null
    const normal = applyPlanarTargetNormal(
      sample,
      firstPass.targets[triangleIndex] ?? null,
      planarStrength,
    )
    return { ...sample, normalX: normal.x, normalY: normal.y, normalZ: normal.z }
  })
  const secondPass = buildPlanarConsolidationPass(
    intermediateSamples,
    plan,
    parameters.seed,
    mergeCosine,
    1,
  )

  let planarizedTriangleCount = 0
  let planarSecondPassFillCount = 0
  for (let triangleIndex = 0; triangleIndex < sourceTriangleCount; triangleIndex += 1) {
    const sourceSample = samples[triangleIndex]
    const intermediateSample = intermediateSamples[triangleIndex]
    if (!sourceSample || !intermediateSample) continue
    const firstTarget = firstPass.targets[triangleIndex] ?? null
    const secondTarget = secondPass.targets[triangleIndex] ?? null
    if (!firstTarget && !secondTarget) continue
    const consolidatedNormal = applyPlanarTargetNormal(
      intermediateSample,
      secondTarget,
      planarStrength,
    )
    const firstColor = firstTarget
      ? planarPatchDebugColor(firstTarget.address, firstTarget.clusterIndex)
      : null
    const secondColor = secondTarget
      ? planarPatchDebugColor(secondTarget.address, secondTarget.clusterIndex)
      : null
    const secondBlend = secondTarget ? planarTargetBlend(secondTarget, planarStrength) : 0
    const debugColor =
      firstColor && secondColor
        ? mixColor(firstColor, secondColor, secondBlend)
        : (firstColor ?? secondColor ?? DIAGNOSTIC.low)
    replacements[triangleIndex] = { debugColor, normal: consolidatedNormal }
    if (!firstTarget && secondTarget) planarSecondPassFillCount += 1
    planarizedTriangleCount += 1
  }

  const passes = [firstPass, secondPass]
  const planarSphereSamples = createPlanarSphereSamples(passes, plan, parameters.seed)
  let planarPatchCount = 0
  let planarSphereCount = 0
  for (const pass of passes) {
    planarSphereCount += pass.buckets.size
    for (const bucket of pass.buckets.values()) planarPatchCount += bucket.clusters.length
  }
  return {
    planarPassCount: PLANAR_PASS_COUNT,
    planarOversizedTriangleCount,
    planarPatchCount,
    planarSecondPassFillCount,
    planarSphereCount,
    planarSphereSamples,
    planarizedTriangleCount,
    replacements,
  }
}

function buildPlanarConsolidationPass(
  samples: readonly (WriterTriangleSample | null)[],
  plan: CoastalRockPlan,
  seed: number,
  mergeCosine: number,
  passIndex: PlanarPassIndex,
): PlanarPassBuild {
  const buckets = new Map<string, PlanarSphereBucket>()
  for (const sample of samples) {
    if (!sample) continue
    const addresses = planarSphereAddresses(sample, plan, seed, passIndex)
    for (const address of addresses) {
      let bucket = buckets.get(address.key)
      if (!bucket) {
        bucket = {
          bodyId: address.bodyId,
          clusters: [],
          gridX: address.gridX,
          gridZ: address.gridZ,
          layerIndex: address.layerIndex,
          passIndex,
        }
        buckets.set(address.key, bucket)
      }
      let bestClusterIndex = -1
      let bestDot = Number.NEGATIVE_INFINITY
      for (let clusterIndex = 0; clusterIndex < bucket.clusters.length; clusterIndex += 1) {
        const cluster = bucket.clusters[clusterIndex]!
        const direction = normalize3({ x: cluster.sumX, y: cluster.sumY, z: cluster.sumZ })
        const similarity =
          sample.normalX * direction.x + sample.normalY * direction.y + sample.normalZ * direction.z
        if (similarity <= bestDot) continue
        bestDot = similarity
        bestClusterIndex = clusterIndex
      }
      if (
        bestClusterIndex < 0 ||
        (bestDot < mergeCosine && bucket.clusters.length < MAX_PLANAR_NORMAL_CLUSTERS)
      ) {
        bucket.clusters.push({
          sumX: sample.normalX * sample.weight,
          sumY: sample.normalY * sample.weight,
          sumZ: sample.normalZ * sample.weight,
          weight: sample.weight,
        })
        continue
      }
      const cluster = bucket.clusters[bestClusterIndex]!
      cluster.sumX += sample.normalX * sample.weight
      cluster.sumY += sample.normalY * sample.weight
      cluster.sumZ += sample.normalZ * sample.weight
      cluster.weight += sample.weight
    }
  }
  const targets = samples.map((sample) =>
    sample ? resolvePlanarTarget(sample, plan, seed, passIndex, buckets) : null,
  )
  return { buckets, targets }
}

function resolvePlanarTarget(
  sample: WriterTriangleSample,
  plan: CoastalRockPlan,
  seed: number,
  passIndex: PlanarPassIndex,
  buckets: ReadonlyMap<string, PlanarSphereBucket>,
): PlanarTriangleTarget | null {
  const addresses = planarSphereAddresses(sample, plan, seed, passIndex)
  let bestClusterIndex = -1
  let bestDot = Number.NEGATIVE_INFINITY
  let bestScore = Number.NEGATIVE_INFINITY
  let selectedAddress: PlanarSphereAddress | null = null
  let targetNormal: Point3 | null = null
  for (const address of addresses) {
    const bucket = buckets.get(address.key)
    if (!bucket) continue
    for (let clusterIndex = 0; clusterIndex < bucket.clusters.length; clusterIndex += 1) {
      const cluster = bucket.clusters[clusterIndex]!
      const direction = normalize3({ x: cluster.sumX, y: cluster.sumY, z: cluster.sumZ })
      const similarity =
        sample.normalX * direction.x + sample.normalY * direction.y + sample.normalZ * direction.z
      const support = Math.log2(1 + cluster.weight / Math.max(sample.weight, 0.000001))
      const score = similarity + Math.min(support, 6) * 0.035 + address.influence * 0.16
      if (score <= bestScore) continue
      bestScore = score
      bestDot = similarity
      bestClusterIndex = clusterIndex
      selectedAddress = address
      targetNormal = direction
    }
  }
  if (!targetNormal || !selectedAddress || bestClusterIndex < 0 || bestDot < 0.2) return null
  return {
    address: selectedAddress,
    clusterIndex: bestClusterIndex,
    influence: selectedAddress.influence,
    normal: targetNormal,
  }
}

function applyPlanarTargetNormal(
  sample: WriterTriangleSample,
  target: PlanarTriangleTarget | null,
  planarStrength: number,
) {
  if (!target) return { x: sample.normalX, y: sample.normalY, z: sample.normalZ }
  const blend = planarTargetBlend(target, planarStrength)
  return normalize3({
    x: lerp(sample.normalX, target.normal.x, blend),
    y: lerp(sample.normalY, target.normal.y, blend),
    z: lerp(sample.normalZ, target.normal.z, blend),
  })
}

function planarTargetBlend(target: PlanarTriangleTarget, planarStrength: number) {
  return planarStrength * smoothstep(0, 0.56, target.influence)
}

function writerTriangleSample(
  writer: RockWriter,
  triangleIndex: number,
): WriterTriangleSample | null {
  const offset = triangleIndex * 9
  const ax = writer.positions[offset]!
  const ay = writer.positions[offset + 1]!
  const az = writer.positions[offset + 2]!
  const bx = writer.positions[offset + 3]!
  const by = writer.positions[offset + 4]!
  const bz = writer.positions[offset + 5]!
  const cx = writer.positions[offset + 6]!
  const cy = writer.positions[offset + 7]!
  const cz = writer.positions[offset + 8]!
  const abX = bx - ax
  const abY = by - ay
  const abZ = bz - az
  const acX = cx - ax
  const acY = cy - ay
  const acZ = cz - az
  const crossX = abY * acZ - abZ * acY
  const crossY = abZ * acX - abX * acZ
  const crossZ = abX * acY - abY * acX
  const weight = Math.hypot(crossX, crossY, crossZ)
  if (weight <= 0.000001) return null
  return {
    bodyId: writer.triangleMeta[triangleIndex]?.bodyId ?? -1,
    centroidX: (ax + bx + cx) / 3,
    centroidY: (ay + by + cy) / 3,
    centroidZ: (az + bz + cz) / 3,
    normalX: crossX / weight,
    normalY: crossY / weight,
    normalZ: crossZ / weight,
    weight,
  }
}

function planarSphereAddresses(
  sample: WriterTriangleSample,
  plan: CoastalRockPlan,
  seed: number,
  passIndex: PlanarPassIndex,
): PlanarSphereAddress[] {
  const layerIndex = layerIndexAtHeight(sample.centroidY, plan.bounds)
  if (!planarTriangleFitsSphereSurfaceLimit(sample, plan, layerIndex)) return []
  const { centerY, originX, originZ, radius } = planarSphereFrame(plan, seed, layerIndex, passIndex)
  const nearestGridX = Math.round((sample.centroidX - originX) / radius)
  const nearestGridZ = Math.round((sample.centroidZ - originZ) / radius)
  const addresses: PlanarSphereAddress[] = []
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      const gridX = nearestGridX + offsetX
      const gridZ = nearestGridZ + offsetZ
      const centerX = originX + gridX * radius
      const centerZ = originZ + gridZ * radius
      const distanceSquared =
        (sample.centroidX - centerX) ** 2 +
        (sample.centroidY - centerY) ** 2 +
        (sample.centroidZ - centerZ) ** 2
      if (distanceSquared > radius * radius) continue
      addresses.push({
        bodyId: sample.bodyId,
        gridX,
        gridZ,
        influence: clamp(1 - distanceSquared / (radius * radius), 0, 1),
        key: [passIndex, sample.bodyId, layerIndex, gridX, gridZ].join(':'),
        layerIndex,
        passIndex,
      })
    }
  }
  return addresses
}

function createPlanarSphereSamples(
  passes: readonly PlanarPassBuild[],
  plan: CoastalRockPlan,
  seed: number,
) {
  const buckets = passes
    .flatMap((pass) => [...pass.buckets.values()])
    .sort(
      (first, second) =>
        first.passIndex - second.passIndex ||
        first.layerIndex - second.layerIndex ||
        first.gridZ - second.gridZ ||
        first.gridX - second.gridX ||
        first.bodyId - second.bodyId,
    )
  const samples: PlanarSphereSample[] = []
  for (let index = 9; index < buckets.length; index += 10) {
    const bucket = buckets[index]!
    const frame = planarSphereFrame(plan, seed, bucket.layerIndex, bucket.passIndex)
    samples.push({
      center: {
        x: frame.originX + bucket.gridX * frame.radius,
        y: frame.centerY,
        z: frame.originZ + bucket.gridZ * frame.radius,
      },
      passIndex: bucket.passIndex,
      radius: frame.radius,
    })
  }
  return samples
}

function planarTriangleFitsSphereSurfaceLimit(
  sample: WriterTriangleSample,
  plan: CoastalRockPlan,
  layerIndex = layerIndexAtHeight(sample.centroidY, plan.bounds),
) {
  const radius = planarSphereRadius(plan, layerIndex)
  const triangleArea = sample.weight * 0.5
  const sphereSurfaceArea = 4 * Math.PI * radius * radius
  return triangleArea < sphereSurfaceArea * PLANAR_MAX_FACE_SURFACE_FRACTION
}

function planarSphereRadius(plan: CoastalRockPlan, layerIndex: number) {
  const lowerY = plan.bounds[layerIndex]!
  const upperY = plan.bounds[layerIndex + 1]!
  return Math.max((upperY - lowerY) * PLANAR_SPHERE_DIAMETER_RATIO * 0.5, 0.001)
}

function planarSphereFrame(
  plan: CoastalRockPlan,
  seed: number,
  layerIndex: number,
  passIndex: PlanarPassIndex,
) {
  const lowerY = plan.bounds[layerIndex]!
  const upperY = plan.bounds[layerIndex + 1]!
  const radius = planarSphereRadius(plan, layerIndex)
  const passOffset = passIndex === 1 ? radius * PLANAR_SECOND_PASS_OFFSET_RATIO : 0
  return {
    centerY: (lowerY + upperY) * 0.5,
    originX: plan.minX + hashUnit(layerIndex + 617, seed + 4409) * radius + passOffset,
    originZ: plan.minZ + hashUnit(layerIndex + 643, seed + 4421) * radius + passOffset,
    radius,
  }
}

function planarPatchDebugColor(address: PlanarSphereAddress, clusterIndex: number) {
  const patchVariation = hashUnit(
    address.gridX + address.layerIndex * 71,
    address.gridZ - address.layerIndex * 43,
  )
  const sphereTint = mixColor(
    LAYER_DEBUG_PALETTE[address.layerIndex]!,
    DIAGNOSTIC.mid,
    0.08 + patchVariation * 0.22,
  )
  const passTint = address.passIndex === 0 ? sphereTint : mixColor(sphereTint, DIAGNOSTIC.hot, 0.18)
  return mixColor(passTint, DIAGNOSTIC.hot, Math.min(clusterIndex, 4) * 0.055)
}

function copyRockTriangle(
  source: RockWriter,
  target: RockWriter,
  triangleIndex: number,
  overrides: {
    color?: readonly [number, number, number]
    normal?: Point3
  } = {},
) {
  const positionOffset = triangleIndex * 9
  const uvOffset = triangleIndex * 6
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const attributeOffset = positionOffset + vertex * 3
    const vertexUvOffset = uvOffset + vertex * 2
    target.positions.push(
      source.positions[attributeOffset]!,
      source.positions[attributeOffset + 1]!,
      source.positions[attributeOffset + 2]!,
    )
    target.normals.push(
      overrides.normal?.x ?? source.normals[attributeOffset]!,
      overrides.normal?.y ?? source.normals[attributeOffset + 1]!,
      overrides.normal?.z ?? source.normals[attributeOffset + 2]!,
    )
    target.colors.push(
      overrides.color?.[0] ?? source.colors[attributeOffset]!,
      overrides.color?.[1] ?? source.colors[attributeOffset + 1]!,
      overrides.color?.[2] ?? source.colors[attributeOffset + 2]!,
    )
    target.uvs.push(source.uvs[vertexUvOffset]!, source.uvs[vertexUvOffset + 1]!)
  }
  target.triangleMeta.push(source.triangleMeta[triangleIndex]!)
}

function removedFaceDebugColor(sample: WriterTriangleSample, plan: CoastalRockPlan) {
  const layerIndex = layerIndexAtHeight(sample.centroidY, plan.bounds)
  const orientation = clamp(0.35 + (1 - Math.abs(sample.normalY)) * 0.48, 0, 1)
  const variation = hashUnit(sample.centroidX + layerIndex * 41, sample.centroidZ - layerIndex * 29)
  const deletedTint = mixColor(
    DIAGNOSTIC.deletedDark,
    DIAGNOSTIC.deletedLight,
    clamp(orientation + (variation - 0.5) * 0.22, 0, 1),
  )
  return mixColor(deletedTint, LAYER_DEBUG_PALETTE[layerIndex]!, 0.1)
}

function createDiagnosticRockGeometry(
  writer: RockWriter,
  mode: Extract<
    MediterraneanCliffDebugMode,
    'fracture-field' | 'mass-structure' | 'support' | 'wave-exposure'
  >,
) {
  const diagnosticWriter = createRockWriter()
  for (let triangleIndex = 0; triangleIndex < writer.triangleMeta.length; triangleIndex += 1) {
    const meta = writer.triangleMeta[triangleIndex]!
    let tint: readonly [number, number, number]
    if (mode === 'fracture-field') {
      tint = mixColor(color('#15293c'), color('#ff5b3d'), smoothstep(0.05, 0.82, meta.fracture))
    } else if (mode === 'wave-exposure') {
      tint = mixColor(color('#17345d'), color('#ffd25a'), meta.exposure)
    } else if (mode === 'support') {
      tint = meta.support > 0.99 ? color('#6ee7a1') : color('#ff375f')
      if (meta.kind === 'toe') tint = mixColor(tint, color('#4fd7ff'), 0.38)
    } else {
      tint = massDiagnosticColor(meta)
    }
    copyRockTriangle(writer, diagnosticWriter, triangleIndex, { color: tint })
  }
  return finishGeometry(diagnosticWriter)
}

function massDiagnosticColor(meta: RockTriangleMeta): readonly [number, number, number] {
  if (meta.kind === 'core') return color('#4b396c')
  const hue = fract(meta.formationId * 0.61803398875 + meta.bodyId * 0.071)
  const parsed = new Color().setHSL(hue, meta.kind === 'buttress' ? 0.62 : 0.78, 0.58)
  return [parsed.r, parsed.g, parsed.b]
}

function layerIndexAtHeight(height: number, bounds: readonly number[]) {
  for (let index = 0; index < LAYER_COUNT; index += 1) {
    if (height <= bounds[index + 1]!) return index
  }
  return LAYER_COUNT - 1
}

function createSandRampGeometry(
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
  settings: QualitySettings,
) {
  const writer = createWriter()
  const sandTint = color('#d0b880')
  for (let ring = 0; ring < settings.sandRings; ring += 1) {
    for (let segment = 0; segment < settings.sandSegments; segment += 1) {
      const nextSegment = (segment + 1) % settings.sandSegments
      const outerA = sandPoint(plan, parameters, settings, ring + 1, segment)
      const outerB = sandPoint(plan, parameters, settings, ring + 1, nextSegment)
      if (ring === 0) {
        const center = sandPoint(plan, parameters, settings, 0, segment)
        emitPlainTriangle(writer, [center, outerA, outerB], { x: 0, y: 1, z: 0 }, sandTint)
        continue
      }
      const innerA = sandPoint(plan, parameters, settings, ring, segment)
      const innerB = sandPoint(plan, parameters, settings, ring, nextSegment)
      emitPlainTriangle(writer, [innerA, outerA, outerB], { x: 0, y: 1, z: 0 }, sandTint)
      emitPlainTriangle(writer, [innerA, outerB, innerB], { x: 0, y: 1, z: 0 }, sandTint)
    }
  }
  return finishGeometry(writer)
}

function sandPoint(
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
  settings: QualitySettings,
  ring: number,
  segment: number,
): Point3 {
  if (ring === 0) {
    return { x: plan.center.x, y: parameters.sandRampTopMeters, z: plan.center.z }
  }
  const radiusRatio = ring / settings.sandRings
  const angle =
    (segment / settings.sandSegments) * Math.PI * 2 +
    hashSigned(ring + 17.3, segment + parameters.seed * 0.11) *
      (Math.PI / settings.sandSegments) *
      0.22
  const outerRadius = sandOuterRadiusAtAngle(plan.center, plan.diskRadius, parameters, angle)
  const radius = outerRadius * radiusRatio
  const x = plan.center.x + Math.cos(angle) * radius
  const z = plan.center.z + Math.sin(angle) * radius
  const broadSediment = layeredValueNoise(x, z, 24, parameters.seed + 1291)
  const warpedRatio = clamp(radiusRatio + (broadSediment - 0.5) * parameters.sandRampWarp, 0, 1)
  const profile = smoothstep(0.12, 1, warpedRatio) ** parameters.sandRampPower
  const baseY = lerp(parameters.sandRampTopMeters, -parameters.bottomDepthMeters + 0.28, profile)
  const reliefNoise =
    (domainWarpedValueNoise(x, z, 19, parameters.seed + 1331) - 0.5) * 1.35 +
    (domainWarpedValueNoise(x, z, 7.5, parameters.seed + 1367) - 0.5) * 0.65
  const channel = jointLikeChannel(x, z, parameters.seed + 1399)
  const relief =
    reliefNoise * parameters.sandReliefMeters * lerp(0.22, 1, smoothstep(0.12, 1, radiusRatio))
  const sedimentBank =
    (smoothstep(0.46, 0.78, broadSediment) - 0.28) *
    parameters.sandReliefMeters *
    smoothstep(0.18, 0.82, radiusRatio)
  const channelDepth =
    channel * parameters.sandChannelDepthMeters * smoothstep(0.22, 1, radiusRatio)
  return { x, y: baseY + relief + sedimentBank - channelDepth, z }
}

function jointLikeChannel(x: number, z: number, seed: number) {
  const primary = domainWarpedValueNoise(x, z, 28, seed)
  const secondary = domainWarpedValueNoise(x, z, 16, seed + 191.3)
  const primaryLine = 1 - smoothstep(0, 0.055, Math.abs(primary - 0.5))
  const secondaryLine = 1 - smoothstep(0, 0.038, Math.abs(secondary - 0.59))
  return Math.max(primaryLine, secondaryLine * 0.72)
}

function createWaterlineMistGeometry(
  plan: CoastalRockPlan,
  parameters: MediterraneanErosionCliffParameters,
) {
  const writer = createFoamWriter()
  let segmentCount = 0
  for (let frameIndex = 0; frameIndex < plan.frames.length; frameIndex += 1) {
    const nextIndex = (frameIndex + 1) % plan.frames.length
    const frame = plan.frames[frameIndex]!
    const nextFrame = plan.frames[nextIndex]!
    const startVertex = coreRibbonVertex(frame, WATERLINE_Y, 3, plan, parameters)
    const endVertex = coreRibbonVertex(nextFrame, WATERLINE_Y, 3, plan, parameters)
    const salt = frameIndex * 193 + 1471
    if (hashUnit(salt, parameters.seed) < parameters.foamBreakup * 0.24) continue
    emitFoamSegment(
      writer,
      { x: startVertex.point.x, z: startVertex.point.z },
      { x: endVertex.point.x, z: endVertex.point.z },
      parameters,
      salt,
    )
    segmentCount += 1
  }

  for (const body of plan.bodies) {
    if (body.topY <= WATERLINE_Y + 0.12) continue
    const radialSegments = body.kind === 'buttress' ? 8 : body.kind === 'appendix' ? 7 : 6
    const ratio = clamp(
      (WATERLINE_Y + 0.08 - body.baseY) / Math.max(body.topY - body.baseY, 0.001),
      0.04,
      0.92,
    )
    const ring = Array.from({ length: radialSegments }, (_, segment) =>
      bodySurfaceVertex(body, ratio, segment, radialSegments, plan, parameters),
    )
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const nextSegment = (segment + 1) % radialSegments
      const start = ring[segment]!.point
      const end = ring[nextSegment]!.point
      const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 }
      const facing =
        (midpoint.x - body.anchor.x) * body.outward.x +
        (midpoint.z - body.anchor.z) * body.outward.z
      if (facing < body.projection * 0.2) continue
      const salt = body.id * 401 + segment * 53 + 2503
      if (hashUnit(salt, parameters.seed) < parameters.foamBreakup * 0.34) continue
      emitFoamSegment(writer, { x: start.x, z: start.z }, { x: end.x, z: end.z }, parameters, salt)
      segmentCount += 1
    }
  }
  return { geometry: finishFoamGeometry(writer), segmentCount }
}

function emitFoamSegment(
  writer: FoamWriter,
  start: Point2,
  end: Point2,
  parameters: MediterraneanErosionCliffParameters,
  salt: number,
) {
  const tangent = normalize2(end.x - start.x, end.z - start.z)
  const perpendicular = { x: -tangent.z, z: tangent.x }
  const width =
    parameters.foamWidthMeters * (0.72 + hashUnit(salt + 19, parameters.seed + 1511) * 0.54)
  const startWidth = width * (0.84 + hashUnit(salt + 37, parameters.seed + 1531) * 0.3)
  const endWidth = width * (0.84 + hashUnit(salt + 53, parameters.seed + 1553) * 0.3)
  const points = [
    {
      x: start.x - perpendicular.x * startWidth * 0.5,
      y: 0.075,
      z: start.z - perpendicular.z * startWidth * 0.5,
    },
    {
      x: start.x + perpendicular.x * startWidth * 0.5,
      y: 0.075,
      z: start.z + perpendicular.z * startWidth * 0.5,
    },
    {
      x: end.x + perpendicular.x * endWidth * 0.5,
      y: 0.075,
      z: end.z + perpendicular.z * endWidth * 0.5,
    },
    {
      x: end.x - perpendicular.x * endWidth * 0.5,
      y: 0.075,
      z: end.z - perpendicular.z * endWidth * 0.5,
    },
  ] as const
  const phase = hashUnit(salt + 71, parameters.seed + 1579) * Math.PI * 2
  emitFoamTriangle(writer, [points[0], points[1], points[2]], perpendicular, phase)
  emitFoamTriangle(writer, [points[0], points[2], points[3]], perpendicular, phase + 0.7)
}

function emitFoamTriangle(
  writer: FoamWriter,
  points: readonly [Point3, Point3, Point3],
  flow: Point2,
  phase: number,
) {
  let oriented = points
  if (triangleNormal(points).y < 0) oriented = [points[0], points[2], points[1]]
  for (let index = 0; index < oriented.length; index += 1) {
    const point = oriented[index]!
    writer.positions.push(point.x, point.y, point.z)
    writer.basePositions.push(point.x, point.y, point.z)
    writer.flowDirections.push(flow.x, 0, flow.z)
    writer.normals.push(0, 1, 0)
    writer.colors.push(1, 1, 1)
    writer.phases.push(phase + index * 0.31)
    writer.uvs.push(index === 1 ? 1 : 0, index === 2 ? 1 : 0)
  }
}

function emitPlainTriangle(
  writer: GeometryWriter,
  points: [Point3, Point3, Point3],
  outwardHint: Point3,
  tint: readonly [number, number, number],
) {
  let geometricNormal = triangleNormal(points)
  if (length3(geometricNormal) <= 0.000001) return
  if (dot3(geometricNormal, outwardHint) < 0) {
    points = [points[0], points[2], points[1]]
    geometricNormal = scale3(geometricNormal, -1)
  }
  for (const point of points) {
    writer.positions.push(point.x, point.y, point.z)
    writer.normals.push(geometricNormal.x, geometricNormal.y, geometricNormal.z)
    writer.colors.push(tint[0], tint[1], tint[2])
    writer.uvs.push(point.x / 4, point.z / 4)
  }
}

function layeredValueNoise(x: number, z: number, scaleMeters: number, seed: number) {
  const scale = Math.max(scaleMeters, 0.001)
  const broad = valueNoise2D(x / scale, z / scale, seed)
  const detail = valueNoise2D((x / scale) * 2.17, (z / scale) * 2.17, seed + 53.7)
  return broad * 0.76 + detail * 0.24
}

function domainWarpedValueNoise(x: number, z: number, scaleMeters: number, seed: number) {
  const scale = Math.max(scaleMeters, 0.001)
  const warpScale = scale * 2.15
  const warpX = (valueNoise2D(x / warpScale, z / warpScale, seed + 211.3) - 0.5) * scale * 0.92
  const warpZ = (valueNoise2D(x / warpScale, z / warpScale, seed + 433.7) - 0.5) * scale * 0.92
  return layeredValueNoise(x + warpX, z + warpZ, scale, seed)
}

function valueNoise2D(x: number, z: number, seed: number) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = smoothCurve(fract(x))
  const fz = smoothCurve(fract(z))
  const a = hashUnit(x0 + seed * 0.013, z0 - seed * 0.019)
  const b = hashUnit(x0 + 1 + seed * 0.013, z0 - seed * 0.019)
  const c = hashUnit(x0 + seed * 0.013, z0 + 1 - seed * 0.019)
  const d = hashUnit(x0 + 1 + seed * 0.013, z0 + 1 - seed * 0.019)
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz)
}

function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false
  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex++
  ) {
    const current = polygon[currentIndex]!
    const previous = polygon[previousIndex]!
    const crosses =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x
    if (crosses) inside = !inside
  }
  return inside
}

function nearestRingSegmentDistance(point: Point2, points: readonly Point2[]) {
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!
    const end = points[(index + 1) % points.length]!
    const segmentX = end.x - start.x
    const segmentZ = end.z - start.z
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ
    const ratio =
      segmentLengthSquared <= 0.000001
        ? 0
        : clamp(
            ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) /
              segmentLengthSquared,
            0,
            1,
          )
    nearest = Math.min(
      nearest,
      Math.hypot(point.x - (start.x + segmentX * ratio), point.z - (start.z + segmentZ * ratio)),
    )
  }
  return nearest
}

function sandOuterRadiusAtAngle(
  center: Point2,
  diskRadius: number,
  parameters: MediterraneanErosionCliffParameters,
  angle: number,
) {
  const sampleRadius = diskRadius * 0.58
  const x = center.x + Math.cos(angle) * sampleRadius
  const z = center.z + Math.sin(angle) * sampleRadius
  const macro = domainWarpedValueNoise(
    x,
    z,
    Math.max(diskRadius * 0.44, 12),
    parameters.seed + 3079,
  )
  const detail = domainWarpedValueNoise(
    x,
    z,
    Math.max(diskRadius * 0.19, 6),
    parameters.seed + 3109,
  )
  const phaseA = hashUnit(parameters.seed + 3137, 17.3) * Math.PI * 2
  const angularFinger = 0.5 + Math.sin(angle * 3 + phaseA) * 0.31 + Math.sin(angle * 7) * 0.19
  const lobe = smoothstep(0.47, 0.78, macro * 0.68 + detail * 0.2 + angularFinger * 0.12)
  return diskRadius * (1.02 + parameters.sandSpreadVariation * (0.08 + macro * 0.16 + lobe * 0.34))
}

function calculateSandMaxRadius(
  center: Point2,
  diskRadius: number,
  parameters: MediterraneanErosionCliffParameters,
) {
  let maximum = diskRadius
  for (let index = 0; index < 192; index += 1) {
    maximum = Math.max(
      maximum,
      sandOuterRadiusAtAngle(center, diskRadius, parameters, (index / 192) * Math.PI * 2),
    )
  }
  return maximum
}

function measureBodyTopVariation(bodies: readonly RockBodyPlan[]) {
  if (bodies.length === 0) return 0
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const body of bodies) {
    minimum = Math.min(minimum, body.topY)
    maximum = Math.max(maximum, body.topY)
  }
  return maximum - minimum
}

function createPlateauShape(points: readonly Point2[]) {
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

function createToonGradientTexture(softness: number, cavityDarkening: number) {
  const width = 64
  const data = new Uint8Array(width)
  const transition = lerp(0.008, 0.075, softness)
  const shadow = lerp(0.5, 0.32, cavityDarkening)
  const dark = lerp(0.64, 0.5, cavityDarkening)
  const mid = lerp(0.78, 0.68, cavityDarkening)
  const light = lerp(0.9, 0.85, cavityDarkening)
  for (let index = 0; index < width; index += 1) {
    const ratio = index / (width - 1)
    let value = shadow
    value = lerp(value, dark, smoothstep(0.2 - transition, 0.2 + transition, ratio))
    value = lerp(value, mid, smoothstep(0.42 - transition, 0.42 + transition, ratio))
    value = lerp(value, light, smoothstep(0.66 - transition, 0.66 + transition, ratio))
    value = lerp(value, 1, smoothstep(0.84 - transition, 0.84 + transition, ratio))
    data[index] = Math.round(value * 255)
  }
  const texture = new DataTexture(data, width, 1, RedFormat)
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.name = 'mediterranean-layered-rock-soft-toon-ramp'
  texture.needsUpdate = true
  return texture
}

function createWriter(): GeometryWriter {
  return { colors: [], normals: [], positions: [], uvs: [] }
}

function createFoamWriter(): FoamWriter {
  return {
    basePositions: [],
    colors: [],
    flowDirections: [],
    normals: [],
    phases: [],
    positions: [],
    uvs: [],
  }
}

function finishGeometry(writer: GeometryWriter) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(writer.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(writer.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(writer.colors, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(writer.uvs, 2))
  if (writer.positions.length > 0) {
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return geometry
}

function finishFoamGeometry(writer: FoamWriter) {
  const geometry = finishGeometry(writer)
  geometry.setAttribute('basePosition', new Float32BufferAttribute(writer.basePositions, 3))
  geometry.setAttribute('flowDirection', new Float32BufferAttribute(writer.flowDirections, 3))
  geometry.setAttribute('phase', new Float32BufferAttribute(writer.phases, 1))
  return geometry
}

function triangleCount(geometry: BufferGeometry) {
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3)
}

function useGeometryLifecycle(geometries: readonly BufferGeometry[]) {
  const renderer = useThree((state) => state.gl)

  useEffect(() => {
    for (const geometry of geometries) {
      const pending = pendingGeometryDisposals.get(geometry)
      if (pending) {
        pending.cancelled = true
        pendingGeometryDisposals.delete(geometry)
      }
    }
    renderScheduler.requestFrame('geometry:changed')

    return () => {
      for (const geometry of geometries) disposeGeometryLater(geometry, renderer)
    }
  }, [geometries, renderer])
}

function disposeGeometryLater(geometry: BufferGeometry, renderer: unknown) {
  const pending: PendingGeometryDisposal = { cancelled: false }
  pendingGeometryDisposals.set(geometry, pending)
  const dispose = () => {
    if (pending.cancelled || pendingGeometryDisposals.get(geometry) !== pending) return
    pendingGeometryDisposals.delete(geometry)
    geometry.dispose()
  }
  const waitForGpu = () => {
    const queue = (renderer as { backend?: { device?: { queue?: GpuQueue } } } | null | undefined)
      ?.backend?.device?.queue
    if (queue?.onSubmittedWorkDone) {
      void queue.onSubmittedWorkDone().then(dispose, dispose)
      return
    }
    dispose()
  }
  if (typeof requestAnimationFrame !== 'function') {
    waitForGpu()
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(waitForGpu))
}

function openRing<T extends Point2>(points: readonly T[]) {
  if (points.length < 2) return points
  const first = points[0]!
  const last = points[points.length - 1]!
  return distance2(first, last) <= 0.001 ? points.slice(0, -1) : points
}

function triangleNormal(points: readonly [Point3, Point3, Point3]) {
  return normalize3(cross3(subtract3(points[1], points[0]), subtract3(points[2], points[0])))
}

function averagePoints(points: readonly Point3[]): Point3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  const sum = points.reduce(
    (value, point) => ({
      x: value.x + point.x,
      y: value.y + point.y,
      z: value.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  )
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length }
}

function subtract3(first: Point3, second: Point3): Point3 {
  return { x: first.x - second.x, y: first.y - second.y, z: first.z - second.z }
}

function scale3(value: Point3, scale: number): Point3 {
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale }
}

function cross3(first: Point3, second: Point3): Point3 {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  }
}

function dot3(first: Point3, second: Point3) {
  return first.x * second.x + first.y * second.y + first.z * second.z
}

function length3(value: Point3) {
  return Math.hypot(value.x, value.y, value.z)
}

function normalize3(value: Point3): Point3 {
  const length = length3(value)
  if (length <= 0.000001) return { x: 0, y: 1, z: 0 }
  return { x: value.x / length, y: value.y / length, z: value.z / length }
}

function normalize2(x: number, z: number): Point2 {
  const length = Math.hypot(x, z)
  if (length <= 0.000001) return { x: 0, z: 1 }
  return { x: x / length, z: z / length }
}

function distance2(first: Point2, second: Point2) {
  return Math.hypot(first.x - second.x, first.z - second.z)
}

function lerp2(first: Point2, second: Point2, ratio: number): Point2 {
  return { x: lerp(first.x, second.x, ratio), z: lerp(first.z, second.z, ratio) }
}

function color(value: string): readonly [number, number, number] {
  const parsed = new Color(value)
  return [parsed.r, parsed.g, parsed.b]
}

function mixColor(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  ratio: number,
): readonly [number, number, number] {
  const t = clamp(ratio, 0, 1)
  return [lerp(first[0], second[0], t), lerp(first[1], second[1], t), lerp(first[2], second[2], t)]
}

function smoothCurve(value: number) {
  return value * value * (3 - 2 * value)
}

function hashSigned(x: number, y: number) {
  return hashUnit(x, y) * 2 - 1
}

function hashUnit(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
}

function fract(value: number) {
  return value - Math.floor(value)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const ratio = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1)
  return ratio * ratio * (3 - 2 * ratio)
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
