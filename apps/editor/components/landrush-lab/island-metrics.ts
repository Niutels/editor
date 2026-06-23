import type { LandrushPerimeter, LandrushPoint2 } from '@/components/landrush/types'

export type IslandMetrics = {
  area: number
  boundsDepth: number
  boundsWidth: number
  closed: boolean
  compactness: number
  maxSegment: number
  perimeterLength: number
}

export type IslandMetricGate = {
  key: keyof IslandMetrics
  label: string
  pass: boolean
  value: number | boolean
}

const EPSILON = 0.001

export function measureIslandPerimeter(perimeter: LandrushPerimeter): IslandMetrics {
  const points = openRing(perimeter.points)
  let signedArea = 0
  let perimeterLength = 0
  let maxSegment = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    signedArea += current.x * next.z - next.x * current.z
    const segment = distance(current, next)
    perimeterLength += segment
    maxSegment = Math.max(maxSegment, segment)
  }

  const area = Math.abs(signedArea) / 2
  const compactness =
    perimeterLength > EPSILON ? (4 * Math.PI * area) / (perimeterLength * perimeterLength) : 0

  return {
    area: round(area),
    boundsDepth: round(perimeter.bounds.depth),
    boundsWidth: round(perimeter.bounds.width),
    closed: perimeter.closed,
    compactness: round(compactness, 3),
    maxSegment: round(maxSegment),
    perimeterLength: round(perimeterLength),
  }
}

export function islandMetricGates(metrics: IslandMetrics): IslandMetricGate[] {
  return [
    { key: 'closed', label: 'closed perimeter', pass: metrics.closed, value: metrics.closed },
    {
      key: 'area',
      label: 'area 8000-12000',
      pass: metrics.area >= 8000 && metrics.area <= 12000,
      value: metrics.area,
    },
    {
      key: 'boundsWidth',
      label: 'width 85-115',
      pass: metrics.boundsWidth >= 85 && metrics.boundsWidth <= 115,
      value: metrics.boundsWidth,
    },
    {
      key: 'boundsDepth',
      label: 'depth 85-115',
      pass: metrics.boundsDepth >= 85 && metrics.boundsDepth <= 115,
      value: metrics.boundsDepth,
    },
    {
      key: 'maxSegment',
      label: 'max segment < 22',
      pass: metrics.maxSegment < 22,
      value: metrics.maxSegment,
    },
    {
      key: 'compactness',
      label: 'compactness 0.45-0.78',
      pass: metrics.compactness >= 0.45 && metrics.compactness <= 0.78,
      value: metrics.compactness,
    },
  ]
}

function openRing(points: readonly LandrushPoint2[]) {
  if (points.length < 2) return [...points]
  const first = points[0]!
  const last = points[points.length - 1]!
  if (distance(first, last) <= EPSILON) return points.slice(0, -1)
  return [...points]
}

function distance(a: LandrushPoint2, b: LandrushPoint2) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
