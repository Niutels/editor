'use client'

import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Shape,
} from 'three'
import type { LandrushPoint2 } from '@/components/landrush/types'
import {
  allocateParcels,
  type ParcelAllocationOptions,
  type ParcelAllocationParcel,
  type ParcelAllocationResult,
} from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  generateParcelStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
  type ParcelStreetNetwork,
  type ParcelStreetOptions,
  type ParcelStreetSegment,
} from './parcel-streets'
import type { WaterLandSurface } from './water-scene'

type ParcelsLandLayersProps = {
  onAllocationChange?: (allocation: ParcelAllocationResult) => void
  onStreetNetworkChange?: (network: ParcelStreetNetwork) => void
  options: ParcelAllocationOptions
  parcelOverlayOptions: ParcelOverlayOptions
  showParcels?: boolean
  showStreets: boolean
  streetOptions: ParcelStreetOptions
  surface: WaterLandSurface
}

export type ParcelOverlayOptions = {
  contourWidthMeters: number
  glowOpacity: number
  glowWidthMeters: number
  gradientDistanceMeters: number
  maxTransparency: number
  minTransparency: number
}

type NormalizedParcelOverlayOptions = {
  centerOpacity: number
  contourWidthMeters: number
  edgeOpacity: number
  glowOpacity: number
  glowWidthMeters: number
  gradientDistanceMeters: number
}

const STREET_ROAD_COLOR = '#626e75'
const STREET_CURB_COLOR = '#b8ad96'
const STREET_SHOULDER_COLOR = '#e7dfc8'
const PARCEL_GRADIENT_BAND_COUNT = 7
const STREET_RENDER_NODE_PRECISION = 100

type ParcelGradientBand = {
  geometry: BufferGeometry
  opacity: number
}

type StreetIncident = {
  direction: LandrushPoint2
  halfWidth: number
}

type StreetJunction = {
  incidents: StreetIncident[]
  point: LandrushPoint2
}

export function ParcelsLandLayers({
  onAllocationChange,
  onStreetNetworkChange,
  options,
  parcelOverlayOptions,
  showParcels = true,
  showStreets,
  streetOptions,
  surface,
}: ParcelsLandLayersProps) {
  const allocation = useMemo(
    () => allocateParcels(surface.grassSurfacePoints, options),
    [options, surface.grassSurfacePoints],
  )
  const streetNetwork = useMemo(
    () => generateParcelStreets(allocation, streetOptions),
    [allocation, streetOptions],
  )

  useEffect(() => {
    onAllocationChange?.(allocation)
  }, [allocation, onAllocationChange])

  useEffect(() => {
    onStreetNetworkChange?.(streetNetwork)
  }, [onStreetNetworkChange, streetNetwork])

  return (
    <group>
      {showParcels
        ? allocation.parcels.map((parcel, index) => (
            <ParcelMesh
              elevation={surface.grassSurfaceElevation + index * 0.001}
              key={parcel.id}
              parcel={parcel}
              style={parcelOverlayOptions}
            />
          ))
        : null}
      {showStreets ? (
        <StreetNetworkLayer
          elevation={surface.grassSurfaceElevation + 0.18}
          network={streetNetwork}
        />
      ) : null}
    </group>
  )
}

function ParcelMesh({
  elevation,
  parcel,
  style,
}: {
  elevation: number
  parcel: ParcelAllocationParcel
  style: ParcelOverlayOptions
}) {
  const overlay = useMemo(() => normalizeParcelOverlayOptions(style), [style])
  const centerPoints = useMemo(
    () => insetPointsTowardCentroid(parcel.points, parcel.centroid, overlay.gradientDistanceMeters),
    [overlay.gradientDistanceMeters, parcel.centroid, parcel.points],
  )
  const centerShape = useMemo(() => shapeFromPoints(centerPoints), [centerPoints])
  const glowGeometry = useMemo(
    () =>
      ringBandGeometry(
        parcel.points,
        parcel.centroid,
        0,
        overlay.glowWidthMeters,
        elevation + 0.056,
      ),
    [elevation, overlay.glowWidthMeters, parcel.centroid, parcel.points],
  )
  const gradientBands = useMemo(
    () => parcelGradientBands(parcel.points, parcel.centroid, overlay, elevation + 0.064),
    [elevation, overlay, parcel.centroid, parcel.points],
  )
  const contourGeometry = useMemo(
    () =>
      ringBandGeometry(
        parcel.points,
        parcel.centroid,
        0,
        overlay.contourWidthMeters,
        elevation + 0.084,
      ),
    [elevation, overlay.contourWidthMeters, parcel.centroid, parcel.points],
  )
  const boundaryLine = useMemo(
    () =>
      new Line(
        lineLoopGeometry(parcel.points, elevation + 0.092),
        new LineBasicMaterial({
          color: parcel.color,
          depthTest: false,
          opacity: Math.min(1, overlay.edgeOpacity + 0.08),
          toneMapped: false,
          transparent: true,
        }),
      ),
    [elevation, overlay.edgeOpacity, parcel.color, parcel.points],
  )

  useEffect(
    () => () => {
      glowGeometry.dispose()
      contourGeometry.dispose()
      for (const band of gradientBands) band.geometry.dispose()
      boundaryLine.geometry.dispose()
      boundaryLine.material.dispose()
    },
    [boundaryLine, contourGeometry, glowGeometry, gradientBands],
  )

  return (
    <group>
      {overlay.centerOpacity > 0.001 && centerPoints.length >= 3 ? (
        <mesh position={[0, elevation + 0.052, 0]} renderOrder={18} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[centerShape]} />
          <meshBasicMaterial
            color={parcel.color}
            depthWrite={false}
            opacity={overlay.centerOpacity}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
      ) : null}
      {overlay.glowOpacity > 0.001 ? (
        <mesh geometry={glowGeometry} renderOrder={19}>
          <meshBasicMaterial
            blending={AdditiveBlending}
            color={parcel.color}
            depthWrite={false}
            opacity={overlay.glowOpacity}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
      ) : null}
      {gradientBands.map((band, index) => (
        <mesh geometry={band.geometry} key={`${parcel.id}-gradient-${index}`} renderOrder={20}>
          <meshBasicMaterial
            color={parcel.color}
            depthWrite={false}
            opacity={band.opacity}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
      <mesh geometry={contourGeometry} renderOrder={27}>
        <meshBasicMaterial
          color={parcel.color}
          depthWrite={false}
          opacity={overlay.edgeOpacity}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <primitive object={boundaryLine} renderOrder={28} />
    </group>
  )
}

function normalizeParcelOverlayOptions(
  options: ParcelOverlayOptions,
): NormalizedParcelOverlayOptions {
  const minTransparency = clamp01(finiteNumber(options.minTransparency, 0.14))
  const maxTransparency = Math.max(
    minTransparency,
    clamp01(finiteNumber(options.maxTransparency, 0.94)),
  )
  const edgeOpacity = 1 - minTransparency
  const centerOpacity = Math.min(edgeOpacity, 1 - maxTransparency)
  const gradientDistanceMeters = Math.max(0.1, finiteNumber(options.gradientDistanceMeters, 10))
  const contourWidthMeters = Math.min(
    gradientDistanceMeters,
    Math.max(0.03, finiteNumber(options.contourWidthMeters, 0.65)),
  )
  const glowWidthMeters = Math.max(contourWidthMeters, finiteNumber(options.glowWidthMeters, 3.2))

  return {
    centerOpacity,
    contourWidthMeters,
    edgeOpacity,
    glowOpacity: clamp01(finiteNumber(options.glowOpacity, 0.16)),
    glowWidthMeters,
    gradientDistanceMeters,
  }
}

function parcelGradientBands(
  points: readonly LandrushPoint2[],
  centroid: LandrushPoint2,
  style: NormalizedParcelOverlayOptions,
  y: number,
): readonly ParcelGradientBand[] {
  const startDistance = style.contourWidthMeters
  const distance = Math.max(0, style.gradientDistanceMeters - startDistance)
  if (distance <= 0.02) return []

  const bands: ParcelGradientBand[] = []

  for (let index = 0; index < PARCEL_GRADIENT_BAND_COUNT; index += 1) {
    const startT = index / PARCEL_GRADIENT_BAND_COUNT
    const endT = (index + 1) / PARCEL_GRADIENT_BAND_COUNT
    const opacityT = (index + 0.5) / PARCEL_GRADIENT_BAND_COUNT
    const opacity = lerp(style.edgeOpacity * 0.72, style.centerOpacity, opacityT)
    if (opacity <= 0.001) continue

    bands.push({
      geometry: ringBandGeometry(
        points,
        centroid,
        startDistance + distance * startT,
        startDistance + distance * endT,
        y + index * 0.001,
      ),
      opacity,
    })
  }

  return bands
}

function ringBandGeometry(
  points: readonly LandrushPoint2[],
  centroid: LandrushPoint2,
  outerInset: number,
  innerInset: number,
  y: number,
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  if (points.length < 3 || innerInset <= outerInset + 0.001) {
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return geometry
  }

  const outer = insetPointsTowardCentroid(points, centroid, outerInset)
  const inner = insetPointsTowardCentroid(points, centroid, innerInset)

  for (let index = 0; index < points.length; index += 1) {
    const outerA = outer[index]
    const outerB = outer[(index + 1) % outer.length]
    const innerA = inner[index]
    const innerB = inner[(index + 1) % inner.length]
    if (!(outerA && outerB && innerA && innerB)) continue

    positions.push(
      outerA.x,
      y,
      outerA.z,
      outerB.x,
      y,
      outerB.z,
      innerA.x,
      y,
      innerA.z,
      outerB.x,
      y,
      outerB.z,
      innerB.x,
      y,
      innerB.z,
      innerA.x,
      y,
      innerA.z,
    )
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function insetPointsTowardCentroid(
  points: readonly LandrushPoint2[],
  centroid: LandrushPoint2,
  distance: number,
) {
  if (distance <= 0) return points.map((point) => ({ x: point.x, z: point.z }))

  return points.map((point) => {
    const dx = centroid.x - point.x
    const dz = centroid.z - point.z
    const length = Math.hypot(dx, dz)
    if (length <= 0.000001) return { x: point.x, z: point.z }
    const inset = Math.min(distance, length * 0.86)
    return {
      x: point.x + (dx / length) * inset,
      z: point.z + (dz / length) * inset,
    }
  })
}

function shapeFromPoints(points: readonly LandrushPoint2[]) {
  const shape = new Shape()
  const first = points[0]
  if (!first) return shape
  shape.moveTo(first.x, -first.z)
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (point) shape.lineTo(point.x, -point.z)
  }
  shape.closePath()
  return shape
}

function lineLoopGeometry(points: readonly LandrushPoint2[], y: number) {
  const geometry = new BufferGeometry()
  const positions = new Float32Array((points.length + 1) * 3)

  for (let index = 0; index <= points.length; index += 1) {
    const point = points[index % points.length]
    if (!point) continue
    positions[index * 3] = point.x
    positions[index * 3 + 1] = y
    positions[index * 3 + 2] = point.z
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function StreetNetworkLayer({
  elevation,
  network,
}: {
  elevation: number
  network: ParcelStreetNetwork
}) {
  const curbGeometry = useMemo(
    () =>
      streetNetworkGeometry(
        network.segments,
        PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS + PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
        elevation + 0.004,
      ),
    [elevation, network.segments],
  )
  const shoulderGeometry = useMemo(
    () =>
      streetNetworkGeometry(
        network.segments,
        PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
        elevation + 0.01,
      ),
    [elevation, network.segments],
  )
  const roadGeometry = useMemo(
    () => streetNetworkGeometry(network.segments, 0, elevation + 0.018),
    [elevation, network.segments],
  )

  useEffect(
    () => () => {
      curbGeometry.dispose()
      shoulderGeometry.dispose()
      roadGeometry.dispose()
    },
    [curbGeometry, roadGeometry, shoulderGeometry],
  )

  return (
    <group>
      <mesh geometry={curbGeometry} renderOrder={33}>
        <meshBasicMaterial
          color={STREET_CURB_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={1}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh geometry={shoulderGeometry} renderOrder={34}>
        <meshBasicMaterial
          color={STREET_SHOULDER_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={1}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh geometry={roadGeometry} renderOrder={35}>
        <meshBasicMaterial
          color={STREET_ROAD_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={1}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  )
}

function streetNetworkGeometry(
  segments: readonly ParcelStreetSegment[],
  extraWidth: number,
  y: number,
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const junctions = new Map<string, StreetJunction>()

  for (const segment of segments) {
    const halfWidth = (normalizedStreetWidth(segment.width) + extraWidth) / 2

    for (let index = 0; index < segment.points.length - 1; index += 1) {
      const start = segment.points[index]
      const end = segment.points[index + 1]
      if (!(start && end) || distance2(start, end) <= 0.001) continue

      addStreetSpan(positions, start, end, halfWidth, y)
      addStreetIncident(junctions, start, { x: end.x - start.x, z: end.z - start.z }, halfWidth)
      addStreetIncident(junctions, end, { x: start.x - end.x, z: start.z - end.z }, halfWidth)
    }
  }

  for (const junction of junctions.values()) {
    addStreetJunction(positions, junction, y)
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function addStreetSpan(
  positions: number[],
  start: LandrushPoint2,
  end: LandrushPoint2,
  halfWidth: number,
  y: number,
) {
  const normal = normalForSegment(start, end)
  const firstLeft = { x: start.x + normal.x * halfWidth, z: start.z + normal.z * halfWidth }
  const firstRight = { x: start.x - normal.x * halfWidth, z: start.z - normal.z * halfWidth }
  const secondLeft = { x: end.x + normal.x * halfWidth, z: end.z + normal.z * halfWidth }
  const secondRight = { x: end.x - normal.x * halfWidth, z: end.z - normal.z * halfWidth }

  pushTriangle(positions, firstLeft, firstRight, secondLeft, y)
  pushTriangle(positions, firstRight, secondRight, secondLeft, y)
}

function addStreetIncident(
  junctions: Map<string, StreetJunction>,
  point: LandrushPoint2,
  direction: LandrushPoint2,
  halfWidth: number,
) {
  const normalizedDirection = normalize2(direction)
  if (Math.hypot(normalizedDirection.x, normalizedDirection.z) <= 0.001) return

  const id = streetRenderNodeId(point)
  const junction = junctions.get(id) ?? { incidents: [], point }
  junction.incidents.push({ direction: normalizedDirection, halfWidth })
  junctions.set(id, junction)
}

function addStreetJunction(positions: number[], junction: StreetJunction, y: number) {
  const incidents = uniqueStreetIncidents(junction.incidents)
  if (incidents.length < 2) return

  const corners = incidents.flatMap((incident) => {
    const normal = { x: -incident.direction.z, z: incident.direction.x }
    return [
      {
        x: junction.point.x + normal.x * incident.halfWidth,
        z: junction.point.z + normal.z * incident.halfWidth,
      },
      {
        x: junction.point.x - normal.x * incident.halfWidth,
        z: junction.point.z - normal.z * incident.halfWidth,
      },
    ]
  })
  const hull = convexHull(dedupeRenderPoints(corners))
  if (hull.length < 3) return

  const center = averageRenderPoint(hull)
  for (let index = 0; index < hull.length; index += 1) {
    const current = hull[index]
    const next = hull[(index + 1) % hull.length]
    if (current && next) pushTriangle(positions, center, current, next, y)
  }
}

function uniqueStreetIncidents(incidents: readonly StreetIncident[]) {
  const unique: StreetIncident[] = []

  for (const incident of incidents) {
    const existing = unique.find(
      (candidate) => dot2(candidate.direction, incident.direction) > 0.999,
    )
    if (existing) {
      existing.halfWidth = Math.max(existing.halfWidth, incident.halfWidth)
      continue
    }
    unique.push({ direction: incident.direction, halfWidth: incident.halfWidth })
  }

  return unique
}

function convexHull(points: readonly LandrushPoint2[]) {
  if (points.length <= 3) return points

  const sorted = [...points].sort((first, second) => first.x - second.x || first.z - second.z)
  const lower: LandrushPoint2[] = []
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop()
    }
    lower.push(point)
  }

  const upper: LandrushPoint2[] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    if (!point) continue
    while (
      upper.length >= 2 &&
      cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop()
    }
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function dedupeRenderPoints(points: readonly LandrushPoint2[]) {
  const byId = new Map<string, LandrushPoint2>()
  for (const point of points) {
    byId.set(streetRenderNodeId(point), point)
  }
  return [...byId.values()]
}

function averageRenderPoint(points: readonly LandrushPoint2[]) {
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function pushTriangle(
  positions: number[],
  first: LandrushPoint2,
  second: LandrushPoint2,
  third: LandrushPoint2,
  y: number,
) {
  positions.push(first.x, y, first.z, second.x, y, second.z, third.x, y, third.z)
}

function streetRenderNodeId(point: LandrushPoint2) {
  return `${Math.round(point.x * STREET_RENDER_NODE_PRECISION)}:${Math.round(point.z * STREET_RENDER_NODE_PRECISION)}`
}

function normalForSegment(start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.max(Math.hypot(dx, dz), 0.000001)
  return { x: -dz / length, z: dx / length }
}

function normalizedStreetWidth(width: number) {
  return Number.isFinite(width) ? Math.max(0.1, width) : DEFAULT_PARCEL_STREET_WIDTH_METERS
}

function normalize2(point: LandrushPoint2) {
  const length = Math.hypot(point.x, point.z)
  return length > 0.000001 ? { x: point.x / length, z: point.z / length } : { x: 0, z: 0 }
}

function dot2(first: LandrushPoint2, second: LandrushPoint2) {
  return first.x * second.x + first.z * second.z
}

function cross2(origin: LandrushPoint2, first: LandrushPoint2, second: LandrushPoint2) {
  return (first.x - origin.x) * (second.z - origin.z) - (first.z - origin.z) * (second.x - origin.x)
}

function distance2(first: LandrushPoint2, second: LandrushPoint2) {
  return Math.hypot(first.x - second.x, first.z - second.z)
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}
