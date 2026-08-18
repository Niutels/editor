import { describe, expect, test } from 'vitest'
import type { LandrushPoint2 } from '@/components/landrush/types'
import {
  createLandrushBuildGridGeometryData,
  landrushBuildGridParcelAlphaAtPoint,
  landrushBuildGridRoadAlphaAtPoint,
} from './landrush-build-grid-geometry'

const parcelRing: LandrushPoint2[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
]

const islandRing: LandrushPoint2[] = [
  { x: -20, z: -20 },
  { x: 20, z: -20 },
  { x: 20, z: 20 },
  { x: -20, z: 20 },
]

const wideParcelRing: LandrushPoint2[] = [
  { x: 0, z: 0 },
  { x: 30, z: 0 },
  { x: 30, z: 30 },
  { x: 0, z: 30 },
]

describe('Landrush build grid geometry', () => {
  test('keeps every lattice line anchored to the world snap step', () => {
    const gridStep = 0.5
    const { positions } = createLandrushBuildGridGeometryData(
      { points: parcelRing },
      gridStep,
      islandRing,
    )
    let segmentCount = 0

    for (let offset = 0; offset < positions.length; offset += 18) {
      const startX = ((positions[offset] ?? 0) + (positions[offset + 6] ?? 0)) / 2
      const startZ = ((positions[offset + 2] ?? 0) + (positions[offset + 8] ?? 0)) / 2
      const endX = ((positions[offset + 3] ?? 0) + (positions[offset + 15] ?? 0)) / 2
      const fixedCoordinate = Math.abs(startX - endX) < 0.000001 ? startX : startZ
      expect(fixedCoordinate / gridStep).toBeCloseTo(Math.round(fixedCoordinate / gridStep), 6)
      segmentCount += 1
    }

    expect(segmentCount).toBeGreaterThan(0)
  })

  test('matches the island contour fade width while continuing beyond the parcel edge', () => {
    const samples = [2.9, 2, 1, 0, -0.5, -1, -1.35].map((signedDistance) =>
      landrushBuildGridParcelAlphaAtPoint({ x: 30 - signedDistance, z: 15 }, wideParcelRing),
    )

    expect(samples[0]).toBeCloseTo(1, 12)
    expect(samples[1]).toBeGreaterThan(samples[2] ?? 0)
    expect(samples[2]).toBeGreaterThan(samples[3] ?? 0)
    expect(samples[3]).toBeGreaterThan(samples[4] ?? 0)
    expect(samples[4]).toBeGreaterThan(samples[5] ?? 0)
    expect(samples[5]).toBeGreaterThan(samples[6] ?? 0)
    expect(samples[6]).toBe(0)
  })

  test('emits partially transparent vertices outside the parcel border', () => {
    const { alphas, positions } = createLandrushBuildGridGeometryData(
      { points: parcelRing },
      0.5,
      islandRing,
    )
    let outsideVertexCount = 0

    for (let vertex = 0; vertex < alphas.length; vertex += 1) {
      const x = positions[vertex * 3]
      const alpha = alphas[vertex]
      if (x !== undefined && x > 10 && alpha !== undefined && alpha > 0 && alpha < 1) {
        outsideVertexCount += 1
      }
    }

    expect(outsideVertexCount).toBeGreaterThan(0)
  })

  test('keeps the road clearance empty and fades in over two meters', () => {
    const road = {
      points: [
        { x: -10, z: 0 },
        { x: 10, z: 0 },
      ],
      width: 4,
    }

    expect(landrushBuildGridRoadAlphaAtPoint({ x: 0, z: 0 }, [road])).toBe(0)
    expect(landrushBuildGridRoadAlphaAtPoint({ x: 0, z: 2 }, [road])).toBe(0)
    expect(landrushBuildGridRoadAlphaAtPoint({ x: 0, z: 3 }, [road])).toBeCloseTo(0.5, 12)
    expect(landrushBuildGridRoadAlphaAtPoint({ x: 0, z: 4 }, [road])).toBe(1)
  })
})
