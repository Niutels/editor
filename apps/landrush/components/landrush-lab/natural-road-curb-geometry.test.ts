import type { BufferAttribute } from 'three'
import { describe, expect, test } from 'vitest'
import { createRoundedWorldPolygonBoundaryWallsGeometry } from './natural-road-curb-geometry'
import { NATURAL_ROAD_STYLE } from './natural-road-network-layer'

const square = [
  [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ],
] as const

describe('natural road curb geometry', () => {
  test('keeps the asphalt above the opaque grass-ground surface', () => {
    expect(NATURAL_ROAD_STYLE.carriageway.surfaceOffsetMeters).toBeGreaterThan(0.018)
    expect(NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters).toBe(0.15)
  })

  test('emits a vertical riser and a quarter-round lip that terminates at the sidewalk cap', () => {
    const geometry = createRoundedWorldPolygonBoundaryWallsGeometry(
      [{ area: square, bottomY: -0.025, roundoverRadius: 0.045, topY: 0.125 }],
      { profileSegments: 4, role: { key: 'role', value: 'curb' } },
    )
    const positions = geometry.getAttribute('position') as BufferAttribute
    const yValues = new Set<number>()

    for (let index = 0; index < positions.count; index += 1) {
      yValues.add(Number(positions.getY(index).toFixed(5)))
    }

    expect(geometry.userData.role).toBe('curb')
    expect(geometry.userData.roundedBoundaryProfileSegments).toBe(4)
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-0.025, 5)
    expect(geometry.boundingBox?.max.y).toBeCloseTo(0.125, 5)
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.045, 5)
    expect(yValues.size).toBe(6)
    expect(yValues.has(0.08)).toBe(true)
    geometry.dispose()
  })

  test('keeps the rounded strip indexed, non-degenerate, and smoothly shaded', () => {
    const geometry = createRoundedWorldPolygonBoundaryWallsGeometry(
      [{ area: square, bottomY: 0, roundoverRadius: 0.04, topY: 0.16 }],
      { profileSegments: 5, role: { key: 'role', value: 'curb' } },
    )
    const positions = geometry.getAttribute('position') as BufferAttribute
    const normals = geometry.getAttribute('normal') as BufferAttribute
    const index = geometry.index
    let upwardNormalCount = 0

    expect(index).not.toBeNull()
    for (let vertex = 0; vertex < normals.count; vertex += 1) {
      if (normals.getY(vertex) > 0.15) upwardNormalCount += 1
    }
    for (let offset = 0; offset < (index?.count ?? 0); offset += 3) {
      const a = index?.getX(offset) ?? 0
      const b = index?.getX(offset + 1) ?? 0
      const c = index?.getX(offset + 2) ?? 0
      const ab = [
        positions.getX(b) - positions.getX(a),
        positions.getY(b) - positions.getY(a),
        positions.getZ(b) - positions.getZ(a),
      ]
      const ac = [
        positions.getX(c) - positions.getX(a),
        positions.getY(c) - positions.getY(a),
        positions.getZ(c) - positions.getZ(a),
      ]
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ]
      expect(Math.hypot(...cross)).toBeGreaterThan(0.000001)
    }

    expect(upwardNormalCount).toBeGreaterThan(0)
    geometry.dispose()
  })

  test('raises a shallow crown on the sidewalk edge facing the road', () => {
    const geometry = createRoundedWorldPolygonBoundaryWallsGeometry(
      [
        {
          area: square,
          bottomY: 0,
          roadEdgeBumpHeight: 0.022,
          roadEdgeBumpWidth: 0.085,
          roundoverRadius: 0.045,
          topY: 0.15,
        },
      ],
      { profileSegments: 6, role: { key: 'role', value: 'road-facing-curb' } },
    )

    expect(geometry.boundingBox?.max.y).toBeCloseTo(0.172, 5)
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.13, 5)
    expect(geometry.userData.role).toBe('road-facing-curb')
    geometry.dispose()
  })
})
