import type { LandrushIsland, LandrushParcel, LandrushPoint2 } from '@/components/landrush/types'

export type ParcelsRoadsMetrics = {
  connectedParcelCount: number
  expectedSidewalkCount: number
  medianRoadEdgeToParcel: number
  ownerCount: number
  parcelCount: number
  parcelEdgeMax: number
  parcelEdgeMin: number
  parcelOverlapPairs: number
  roadConnected: number
  roadEdgeP90: number
  roadSegmentCount: number
  sidewalkCount: number
  sidewalkWidthVariance: number
}

export type ParcelsRoadsMetricGate = {
  key: keyof ParcelsRoadsMetrics
  label: string
  pass: boolean
  value: number
}

export function measureParcelsRoadsLab(island: LandrushIsland): ParcelsRoadsMetrics {
  const widths = island.roads.sidewalks.map((sidewalk) => sidewalk.width)
  const edgeDistances = measureRoadEdgeDistances(island)
  return {
    connectedParcelCount: island.roads.connectedParcelIds.length,
    expectedSidewalkCount: island.roads.segments.length * 2,
    medianRoadEdgeToParcel: round(percentile(edgeDistances, 0.5)),
    ownerCount: island.parcels.filter((parcel) => parcel.kind === 'owner').length,
    parcelCount: island.parcels.length,
    parcelEdgeMax: Math.max(...island.parcels.map((parcel) => parcel.vertices.length)),
    parcelEdgeMin: Math.min(...island.parcels.map((parcel) => parcel.vertices.length)),
    parcelOverlapPairs: countParcelOverlapPairs(island.parcels),
    roadConnected: island.roads.connected ? 1 : 0,
    roadEdgeP90: round(percentile(edgeDistances, 0.9)),
    roadSegmentCount: island.roads.segments.length,
    sidewalkCount: island.roads.sidewalks.length,
    sidewalkWidthVariance: round(coefficientOfVariation(widths), 3),
  }
}

export function parcelsRoadsMetricGates(metrics: ParcelsRoadsMetrics): ParcelsRoadsMetricGate[] {
  return [
    {
      key: 'parcelCount',
      label: '10 parcels',
      pass: metrics.parcelCount === 10,
      value: metrics.parcelCount,
    },
    {
      key: 'ownerCount',
      label: '1 owner parcel',
      pass: metrics.ownerCount === 1,
      value: metrics.ownerCount,
    },
    {
      key: 'parcelEdgeMin',
      label: 'parcel edges >= 4',
      pass: metrics.parcelEdgeMin >= 4,
      value: metrics.parcelEdgeMin,
    },
    {
      key: 'parcelEdgeMax',
      label: 'parcel edges <= 6',
      pass: metrics.parcelEdgeMax <= 6,
      value: metrics.parcelEdgeMax,
    },
    {
      key: 'parcelOverlapPairs',
      label: 'overlap pairs = 0',
      pass: metrics.parcelOverlapPairs === 0,
      value: metrics.parcelOverlapPairs,
    },
    {
      key: 'roadConnected',
      label: 'road graph connected',
      pass: metrics.roadConnected === 1,
      value: metrics.roadConnected,
    },
    {
      key: 'connectedParcelCount',
      label: '10 parcels reachable',
      pass: metrics.connectedParcelCount === 10,
      value: metrics.connectedParcelCount,
    },
    {
      key: 'sidewalkCount',
      label: '2 sidewalks per road',
      pass: metrics.sidewalkCount === metrics.expectedSidewalkCount,
      value: metrics.sidewalkCount,
    },
    {
      key: 'sidewalkWidthVariance',
      label: 'sidewalk variance < 12%',
      pass: metrics.sidewalkWidthVariance < 0.12,
      value: metrics.sidewalkWidthVariance,
    },
    {
      key: 'medianRoadEdgeToParcel',
      label: 'road hug median 1.5-4m',
      pass: metrics.medianRoadEdgeToParcel >= 1.5 && metrics.medianRoadEdgeToParcel <= 4,
      value: metrics.medianRoadEdgeToParcel,
    },
  ]
}

function measureRoadEdgeDistances(island: LandrushIsland) {
  const samples: number[] = []
  for (const road of island.roads.segments) {
    const connected = island.parcels.filter((parcel) => road.connectsParcelIds.includes(parcel.id))
    for (const point of road.points) {
      const distanceToParcel = Math.min(
        ...connected.map((parcel) => distanceToPolyline(point, parcel.outline)),
      )
      samples.push(Math.max(0, distanceToParcel - road.width / 2))
    }
  }
  return samples.sort((a, b) => a - b)
}

function countParcelOverlapPairs(parcels: readonly LandrushParcel[]) {
  let overlaps = 0
  for (let a = 0; a < parcels.length; a += 1) {
    for (let b = a + 1; b < parcels.length; b += 1) {
      if (polygonsOverlap(parcels[a]!.outline, parcels[b]!.outline)) overlaps += 1
    }
  }
  return overlaps
}

function polygonsOverlap(a: readonly LandrushPoint2[], b: readonly LandrushPoint2[]) {
  return (
    a.some((point) => pointInPolygon(point, b)) ||
    b.some((point) => pointInPolygon(point, a)) ||
    segmentsIntersectAny(a, b)
  )
}

function segmentsIntersectAny(a: readonly LandrushPoint2[], b: readonly LandrushPoint2[]) {
  for (let ai = 0; ai < a.length - 1; ai += 1) {
    for (let bi = 0; bi < b.length - 1; bi += 1) {
      if (segmentsIntersect(a[ai]!, a[ai + 1]!, b[bi]!, b[bi + 1]!)) return true
    }
  }
  return false
}

function segmentsIntersect(
  a: LandrushPoint2,
  b: LandrushPoint2,
  c: LandrushPoint2,
  d: LandrushPoint2,
) {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const crosses = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    if (crosses && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

function distanceToPolyline(point: LandrushPoint2, polyline: readonly LandrushPoint2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, polyline[index]!, polyline[index + 1]!))
  }
  return best
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 0.000001),
    ),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function cross(a: LandrushPoint2, b: LandrushPoint2, c: LandrushPoint2) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function coefficientOfVariation(values: readonly number[]) {
  if (values.length === 0) return 0
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return mean > 0 ? Math.sqrt(variance) / mean : 0
}

function percentile(values: readonly number[], amount: number) {
  if (values.length === 0) return 0
  return values[Math.min(values.length - 1, Math.floor(values.length * amount))] ?? 0
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
