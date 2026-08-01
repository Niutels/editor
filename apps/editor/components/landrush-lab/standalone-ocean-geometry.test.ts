import type { BufferAttribute } from 'three'
import { describe, expect, test } from 'vitest'
import {
  createStandaloneOceanDiskGeometry,
  type StandaloneOceanDiskGeometryMetrics,
} from './standalone-ocean-geometry'

describe('standalone ocean disk geometry', () => {
  test('builds a circular footprint with no square corners', () => {
    const outerRadius = 90
    const geometry = createStandaloneOceanDiskGeometry({
      detailRadialSegments: 12,
      detailRadius: 30,
      horizonAngularSegments: 24,
      horizonRadialSegments: 6,
      outerRadius,
    })
    const positions = geometry.getAttribute('position') as BufferAttribute
    let maximumRadius = 0

    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex)
      const y = positions.getY(vertex)
      maximumRadius = Math.max(maximumRadius, Math.hypot(x, y))
      expect(Math.abs(x) > outerRadius * 0.99 && Math.abs(y) > outerRadius * 0.99).toBe(false)
    }

    expect(maximumRadius).toBeCloseTo(outerRadius, 5)
    expect(geometry.boundingBox?.max.x).toBeCloseTo(outerRadius, 5)
    geometry.dispose()
  })

  test('keeps the wave-detail center denser than the atmospheric horizon', () => {
    const geometry = createStandaloneOceanDiskGeometry({
      detailRadialSegments: 24,
      detailRadius: 60,
      horizonAngularSegments: 32,
      horizonRadialSegments: 8,
      outerRadius: 180,
    })
    const metrics = geometry.userData.standaloneOceanDisk as StandaloneOceanDiskGeometryMetrics

    expect(metrics.detailRadialSegments).toBe(24)
    expect(metrics.horizonRadialSegments).toBe(8)
    expect(metrics.outerRadius).toBe(180)
    expect(metrics.triangleCount).toBeGreaterThan(metrics.vertexCount)
    geometry.dispose()
  })

  test('emits consistently wound, non-degenerate triangles across changing ring counts', () => {
    const geometry = createStandaloneOceanDiskGeometry({
      detailRadialSegments: 18,
      detailRadius: 45,
      horizonAngularSegments: 20,
      horizonRadialSegments: 7,
      outerRadius: 140,
    })
    const positions = geometry.getAttribute('position') as BufferAttribute
    const index = geometry.index

    expect(index).not.toBeNull()
    for (let offset = 0; offset < (index?.count ?? 0); offset += 3) {
      const a = index?.getX(offset) ?? 0
      const b = index?.getX(offset + 1) ?? 0
      const c = index?.getX(offset + 2) ?? 0
      const abX = positions.getX(b) - positions.getX(a)
      const abY = positions.getY(b) - positions.getY(a)
      const acX = positions.getX(c) - positions.getX(a)
      const acY = positions.getY(c) - positions.getY(a)
      expect(abX * acY - abY * acX).toBeGreaterThan(0)
    }
    geometry.dispose()
  })
})
