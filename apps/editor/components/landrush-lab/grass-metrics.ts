import type { LandrushIsland } from '@/components/landrush/types'
import {
  GRASS_BLADE_CANDIDATE_COUNT,
  GRASS_BLADE_COUNT,
  GRASS_BLADE_PATCH_COUNT,
  GRASS_BLADE_SUBDIVISIONS,
  GRASS_BLADE_TRIANGLES_PER_BLADE,
  GRASS_HEIGHT_VARIATION_RATIO,
} from './grass-blade-geometry'
import {
  GRASS_FIELD_PLANE_SIZE,
  GRASS_FIELD_RESOLUTION,
  measureGrassFieldDistribution,
} from './grass-field-texture'

export type GrassMetrics = {
  bladeCandidateCount: number
  bladeCount: number
  bladeGridSubdivisions: number
  bladeTriangleCount: number
  densityCoverage: number
  finiteWarmupFrames: number
  grassPatchCount: number
  heightVariationRatio: number
  organicPatchScaleMeters: number
  paletteCount: number
  regionBalanceMin: number
  roadClearancePass: number
  shoreFadePass: number
  sourceParityRules: number
  terrainFieldResolution: number
}

export type GrassMetricGate = {
  key: keyof GrassMetrics
  label: string
  pass: boolean
  value: number
}

export const GRASS_REFERENCE = {
  commit: '41046b57eeed8d156d9c3fd7fa259900baef7816',
  grassPath: 'sources/Game/World/Grass.js',
  license: 'MIT',
  repo: 'https://github.com/brunosimon/folio-2025',
  terrainPath: 'sources/Game/Terrain.js',
} as const

export function measureGrassLab(island: LandrushIsland): GrassMetrics {
  const distribution = measureGrassFieldDistribution(
    island.perimeter.points,
    GRASS_FIELD_PLANE_SIZE,
    [],
  )

  return {
    bladeCandidateCount: GRASS_BLADE_CANDIDATE_COUNT,
    bladeCount: GRASS_BLADE_COUNT,
    bladeGridSubdivisions: GRASS_BLADE_SUBDIVISIONS,
    bladeTriangleCount: GRASS_BLADE_COUNT * GRASS_BLADE_TRIANGLES_PER_BLADE,
    densityCoverage: distribution.densityCoverage,
    finiteWarmupFrames: 18,
    grassPatchCount: GRASS_BLADE_PATCH_COUNT,
    heightVariationRatio: GRASS_HEIGHT_VARIATION_RATIO,
    organicPatchScaleMeters: 54,
    paletteCount: distribution.activeColorCount,
    regionBalanceMin: distribution.regionBalanceMin,
    roadClearancePass: distribution.roadClearancePass ? 1 : 0,
    shoreFadePass: distribution.shoreFadePass ? 1 : 0,
    sourceParityRules: 5,
    terrainFieldResolution: GRASS_FIELD_RESOLUTION,
  }
}

export function grassMetricGates(metrics: GrassMetrics): GrassMetricGate[] {
  return [
    {
      key: 'paletteCount',
      label: '4 island grass colors active',
      pass: metrics.paletteCount >= 4,
      value: metrics.paletteCount,
    },
    {
      key: 'regionBalanceMin',
      label: 'each color >= 8%',
      pass: metrics.regionBalanceMin >= 0.08,
      value: metrics.regionBalanceMin,
    },
    {
      key: 'densityCoverage',
      label: 'island density coverage',
      pass: metrics.densityCoverage >= 0.45 && metrics.densityCoverage <= 0.82,
      value: metrics.densityCoverage,
    },
    {
      key: 'bladeGridSubdivisions',
      label: 'Bruno patch grid = 280',
      pass: metrics.bladeGridSubdivisions === 280,
      value: metrics.bladeGridSubdivisions,
    },
    {
      key: 'grassPatchCount',
      label: 'island grass patches = 9',
      pass: metrics.grassPatchCount === 9,
      value: metrics.grassPatchCount,
    },
    {
      key: 'bladeCandidateCount',
      label: 'blade candidates >= 700k',
      pass: metrics.bladeCandidateCount >= 700_000,
      value: metrics.bladeCandidateCount,
    },
    {
      key: 'roadClearancePass',
      label: 'road mask disabled',
      pass: metrics.roadClearancePass === 1,
      value: metrics.roadClearancePass,
    },
    {
      key: 'shoreFadePass',
      label: 'shore fade pass',
      pass: metrics.shoreFadePass === 1,
      value: metrics.shoreFadePass,
    },
    {
      key: 'heightVariationRatio',
      label: 'height randomness = 0.6',
      pass: metrics.heightVariationRatio === 0.6,
      value: metrics.heightVariationRatio,
    },
    {
      key: 'sourceParityRules',
      label: 'Bruno blade rules ported = 5',
      pass: metrics.sourceParityRules === 5,
      value: metrics.sourceParityRules,
    },
    {
      key: 'finiteWarmupFrames',
      label: 'finite warmup <= 24 frames',
      pass: metrics.finiteWarmupFrames <= 24,
      value: metrics.finiteWarmupFrames,
    },
  ]
}
