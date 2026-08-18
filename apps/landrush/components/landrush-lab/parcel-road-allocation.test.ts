import { createPascalWaterLandSurface, createPascalWaterSmoothedPerimeter } from '@landrush/pascal-plugin'
import { describe, expect, test } from 'vitest'
import type { LandrushPoint2 } from '@/components/landrush/types'
import { allocateParcels, polygonArea } from './parcel-allocation'
import { generateParcelEdgeStreets } from './parcel-streets'
import {
  generateWaterLabIsland,
  WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const boundary: LandrushPoint2[] = [
  { x: 0, z: 0 },
  { x: 20, z: 0 },
  { x: 20, z: 10 },
  { x: 0, z: 10 },
]

describe('road-aware parcel allocation', () => {
  test('reserves road area from the usable parcel while retaining the raw partition', () => {
    const allocation = allocateParcels(boundary, {
      count: 1,
      maxEdges: 15,
      roadReserveMeters: 2,
      seed: 'road-reserve',
      shoreSetbackMeters: 0,
      simplifyToleranceMeters: 0,
      splitJitter: 0,
      squareness: 1,
    })
    const parcel = allocation.parcels[0]

    expect(parcel).toBeDefined()
    expect(polygonArea(parcel?.rawPoints ?? [])).toBeCloseTo(200, 6)
    expect(parcel?.area).toBeCloseTo(96, 6)
    expect(Math.min(...(parcel?.points.map((point) => point.x) ?? []))).toBeCloseTo(2, 6)
    expect(Math.max(...(parcel?.points.map((point) => point.x) ?? []))).toBeCloseTo(18, 6)
    expect(Math.min(...(parcel?.points.map((point) => point.z) ?? []))).toBeCloseTo(2, 6)
    expect(Math.max(...(parcel?.points.map((point) => point.z) ?? []))).toBeCloseTo(8, 6)
  })

  test('keeps road centerlines on the raw partition after parcels are reserved', () => {
    const allocation = allocateParcels(boundary, {
      count: 2,
      maxEdges: 15,
      roadReserveMeters: 1,
      seed: 'road-centerlines',
      shoreSetbackMeters: 0,
      simplifyToleranceMeters: 0,
      splitJitter: 0,
      squareness: 1,
    })
    const streets = generateParcelEdgeStreets(allocation, {
      loopiness: 0,
      roadWidthMeters: 2,
      seed: 'road-centerlines',
    })
    const sharedRoad = streets.segments.find((segment) => segment.parcelIds.length === 2)

    expect(sharedRoad).toBeDefined()
    expect(sharedRoad?.points.every((point) => Math.abs(point.x - 10) < 0.001)).toBe(true)
    expect(
      allocation.parcels.every((parcel) =>
        parcel.points.every((point) => Math.abs(point.x - 10) >= 0.999),
      ),
    ).toBe(true)
  })

  test('keeps every usable parcel valid on an irregular twelve-parcel island', () => {
    const islandBoundary = Array.from({ length: 64 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2
      const radius = 56 + Math.sin(angle * 3) * 5 + Math.cos(angle * 7) * 2
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
    })
    const allocation = allocateParcels(islandBoundary, {
      count: 12,
      maxEdges: 15,
      roadReserveMeters: 1.655,
      seed: 'irregular-island',
      shoreSetbackMeters: 0,
      simplifyToleranceMeters: 0.18,
      splitJitter: 0.12,
      squareness: 0.82,
    })
    const streets = generateParcelEdgeStreets(allocation, {
      loopiness: 0,
      roadWidthMeters: 1.5,
      seed: 'irregular-island',
    })

    expect(allocation.parcels).toHaveLength(12)
    expect(
      allocation.parcels.every(
        (parcel) =>
          parcel.points.length >= 3 &&
          parcel.points.length <= 15 &&
          parcel.area > 1 &&
          parcel.area < polygonArea(parcel.rawPoints) &&
          parcel.area / parcel.reservedArea >= 0.9,
      ),
    ).toBe(true)
    expect(streets.graphConnected).toBe(true)
    expect(streets.roadConnected).toBe(true)
  })

  test('preserves coastal parcel contours after road reservation and simplification', () => {
    const island = generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS)
    const landSurface = createPascalWaterLandSurface({
      elevationParameters: {
        ...WATER_LAB_DEFAULT_ELEVATION_PARAMETERS,
        cliffColorAverageRatio: 0.92,
        cliffToneVariation: 0.12,
      },
      shorelinePoints: createPascalWaterSmoothedPerimeter(island.perimeter.points),
      waterPlaneSize: WATER_PLANE_SIZE,
    })
    const allocation = allocateParcels(landSurface.grassSurfacePoints, {
      count: 12,
      maxEdges: 15,
      roadReserveMeters: 1.655,
      seed: `${island.seed}:world-parcels:12`,
      shoreSetbackMeters: 0,
      simplifyToleranceMeters: 0.18,
      splitJitter: 0.12,
      squareness: 0.82,
    })

    expect(allocation.parcels).toHaveLength(12)
    expect(
      allocation.parcels.every(
        (parcel) =>
          parcel.points.length >= 3 &&
          parcel.area / parcel.reservedArea >= 0.9 &&
          parcel.area / parcel.reservedArea <= 1.1,
      ),
    ).toBe(true)
    expect(allocation.parcels.every((parcel) => parcel.points.length <= 15)).toBe(true)
    expect(allocation.parcels[9]?.points.length).toBeGreaterThan(3)
  })
})
