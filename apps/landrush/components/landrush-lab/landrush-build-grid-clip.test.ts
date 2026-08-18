import { describe, expect, test } from 'vitest'
import type { LandrushPoint2 } from '@/components/landrush/types'
import { clipLandrushBuildGridQuadToParcel } from './landrush-build-grid-clip'

const parcel: LandrushPoint2[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
]

describe('build grid parcel clipping', () => {
  test('clips a border strip exactly to the active parcel', () => {
    const triangles = clipLandrushBuildGridQuadToParcel(
      [
        { x: -1, z: 4.9 },
        { x: 1, z: 4.9 },
        { x: 1, z: 5.1 },
        { x: -1, z: 5.1 },
      ],
      parcel,
    )

    expect(triangles.length).toBeGreaterThan(0)
    expect(triangles.flat().every((point) => point.x >= 0 && point.x <= 10)).toBe(true)
    expect(totalTriangleArea(triangles)).toBeCloseTo(0.2, 6)
  })

  test('removes a strip that lies entirely on a neighboring parcel', () => {
    expect(
      clipLandrushBuildGridQuadToParcel(
        [
          { x: -2, z: 4.9 },
          { x: -1, z: 4.9 },
          { x: -1, z: 5.1 },
          { x: -2, z: 5.1 },
        ],
        parcel,
      ),
    ).toEqual([])
  })
})

function totalTriangleArea(triangles: ReturnType<typeof clipLandrushBuildGridQuadToParcel>) {
  return triangles.reduce((total, [first, second, third]) => {
    return (
      total +
      Math.abs(
        (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x),
      ) /
        2
    )
  }, 0)
}
