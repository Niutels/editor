import type { ParcelAllocationOptions, ParcelAllocationResult } from './parcel-allocation'

export type ParcelsMetrics = {
  areaVariance: number
  averageCompactness: number
  averageNeighbors: number
  coverageRatio: number
  isolatedParcels: number
  maxAspectRatio: number
  maxEdges: number
  minAreaRatio: number
  parcelCount: number
  requestedCount: number
  simplifiedCoverageRatio: number
}

export type ParcelsMetricGate = {
  key: keyof ParcelsMetrics
  label: string
  pass: boolean
  value: number
}

export function measureParcelsLab(
  allocation: ParcelAllocationResult | null,
  options: ParcelAllocationOptions,
): ParcelsMetrics {
  if (!allocation || allocation.parcels.length === 0 || allocation.availableArea <= 0) {
    return {
      areaVariance: 0,
      averageCompactness: 0,
      averageNeighbors: 0,
      coverageRatio: 0,
      isolatedParcels: 0,
      maxAspectRatio: 0,
      maxEdges: 0,
      minAreaRatio: 0,
      parcelCount: 0,
      requestedCount: options.count,
      simplifiedCoverageRatio: 0,
    }
  }

  const parcelAreas = allocation.parcels.map((parcel) => parcel.area)
  const targetArea = allocation.availableArea / Math.max(1, options.count)

  return {
    areaVariance: round(coefficientOfVariation(parcelAreas), 3),
    averageCompactness: round(average(allocation.parcels.map((parcel) => parcel.compactness)), 3),
    averageNeighbors: round(
      average(allocation.parcels.map((parcel) => parcel.neighborIds.length)),
      2,
    ),
    coverageRatio: round(allocation.coveredArea / allocation.availableArea, 3),
    isolatedParcels: allocation.parcels.filter((parcel) => parcel.neighborIds.length === 0).length,
    maxAspectRatio: round(Math.max(...allocation.parcels.map((parcel) => parcel.aspectRatio)), 2),
    maxEdges: Math.max(...allocation.parcels.map((parcel) => parcel.edgeCount)),
    minAreaRatio: round(Math.min(...parcelAreas) / targetArea, 2),
    parcelCount: allocation.parcels.length,
    requestedCount: options.count,
    simplifiedCoverageRatio: round(allocation.simplifiedArea / allocation.availableArea, 3),
  }
}

export function parcelsMetricGates(
  metrics: ParcelsMetrics,
  options: ParcelAllocationOptions,
): ParcelsMetricGate[] {
  return [
    {
      key: 'parcelCount',
      label: `${metrics.requestedCount} parcels`,
      pass: metrics.parcelCount === metrics.requestedCount,
      value: metrics.parcelCount,
    },
    {
      key: 'coverageRatio',
      label: 'raw coverage >= 99%',
      pass: metrics.coverageRatio >= 0.99,
      value: metrics.coverageRatio,
    },
    {
      key: 'simplifiedCoverageRatio',
      label: 'visible area 94-106%',
      pass: metrics.simplifiedCoverageRatio >= 0.94 && metrics.simplifiedCoverageRatio <= 1.06,
      value: metrics.simplifiedCoverageRatio,
    },
    {
      key: 'maxEdges',
      label: `edges <= ${options.maxEdges}`,
      pass: metrics.maxEdges <= options.maxEdges,
      value: metrics.maxEdges,
    },
    {
      key: 'isolatedParcels',
      label: 'isolated = 0',
      pass: options.count <= 1 || metrics.isolatedParcels === 0,
      value: metrics.isolatedParcels,
    },
    {
      key: 'maxAspectRatio',
      label: 'aspect max <= 4',
      pass: metrics.maxAspectRatio <= 4,
      value: metrics.maxAspectRatio,
    },
    {
      key: 'areaVariance',
      label: 'area variance < 28%',
      pass: metrics.areaVariance < 0.28,
      value: metrics.areaVariance,
    },
  ]
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function coefficientOfVariation(values: readonly number[]) {
  const mean = average(values)
  if (mean <= 0) return 0
  const variance = average(values.map((value) => (value - mean) ** 2))
  return Math.sqrt(variance) / mean
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
