import { describe, expect, test } from 'bun:test'
import {
  distanceToSegment2,
  openPointRing,
  pointInPolygonOrNearEdge,
  segmentFootprint,
  segmentsIntersect2,
} from './navigation-geometry'

const square = [
  { x: -1, z: -1 },
  { x: 1, z: -1 },
  { x: 1, z: 1 },
  { x: -1, z: 1 },
  { x: -1, z: -1 },
]

describe('Landrush navigation geometry', () => {
  test('treats crossings identically in both travel directions', () => {
    const left = { x: -2, z: 0 }
    const right = { x: 2, z: 0 }
    const bottom = { x: 0, z: -2 }
    const top = { x: 0, z: 2 }

    expect(segmentsIntersect2(left, right, bottom, top)).toBe(true)
    expect(segmentsIntersect2(right, left, bottom, top)).toBe(true)
    expect(segmentsIntersect2(bottom, top, right, left)).toBe(true)
  })

  test('handles closed and open parcel rings with the same edge tolerance', () => {
    const openSquare = openPointRing(square)

    expect(openSquare).toHaveLength(4)
    expect(pointInPolygonOrNearEdge({ x: 0, z: 0 }, square)).toBe(true)
    expect(pointInPolygonOrNearEdge({ x: 1.03, z: 0 }, openSquare)).toBe(true)
    expect(pointInPolygonOrNearEdge({ x: 1.05, z: 0 }, openSquare)).toBe(false)
  })

  test('builds a symmetric collision footprint independent of segment direction', () => {
    const forward = segmentFootprint({ x: 0, z: 0 }, { x: 4, z: 0 }, 1)
    const reverse = segmentFootprint({ x: 4, z: 0 }, { x: 0, z: 0 }, 1)

    expect(
      forward.every((point) => distanceToSegment2(point, { x: 0, z: 0 }, { x: 4, z: 0 }) === 0.5),
    ).toBe(true)
    expect(new Set(forward.map((point) => `${point.x}:${point.z}`))).toEqual(
      new Set(reverse.map((point) => `${point.x}:${point.z}`)),
    )
  })
})
