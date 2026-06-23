'use client'

import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
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
const PARCEL_CENTER_FILL_MIN_OPACITY = 0.02
const PARCEL_GLOW_MIN_OPACITY = 0.08
const PARCEL_GRADIENT_BAND_COUNT = 1
const STREET_RENDER_NODE_PRECISION = 100

type ParcelGradientBand = {
  geometry: BufferGeometry
  opacity: number
}

type ParcelOverlayGeometries = {
  centerGeometry: BufferGeometry
  contourGeometry: BufferGeometry
  glowGeometry: BufferGeometry
  gradientBands: readonly ParcelGradientBand[]
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
      {showParcels ? (
        <ParcelOverlayLayer
          elevation={surface.grassSurfaceElevation}
          parcels={allocation.parcels}
          style={parcelOverlayOptions}
        />
      ) : null}
      {showStreets ? (
        <StreetNetworkLayer
          elevation={surface.grassSurfaceElevation + 0.18}
          network={streetNetwork}
        />
      ) : null}
    </group>
  )
}

function ParcelOverlayLayer({
  elevation,
  parcels,
  style,
}: {
  elevation: number
  parcels: readonly ParcelAllocationParcel[]
  style: ParcelOverlayOptions
}) {
  const overlay = useMemo(() => normalizeParcelOverlayOptions(style), [style])
  const geometries = useMemo(
    () => createParcelOverlayGeometries(parcels, overlay, elevation),
    [elevation, overlay, parcels],
  )

  useEffect(
    () => () => {
      geometries.centerGeometry.dispose()
      geometries.glowGeometry.dispose()
      geometries.contourGeometry.dispose()
      for (const band of geometries.gradientBands) band.geometry.dispose()
    },
    [geometries],
  )

  return (
    <group>
      {overlay.centerOpacity > PARCEL_CENTER_FILL_MIN_OPACITY &&
      geometryHasVertices(geometries.centerGeometry) ? (
        <mesh geometry={geometries.centerGeometry} renderOrder={18}>
          <meshBasicMaterial
            depthWrite={false}
            opacity={overlay.centerOpacity}
            side={DoubleSide}
            toneMapped={false}
            transparent
            vertexColors
          />
        </mesh>
      ) : null}
      {overlay.glowOpacity > PARCEL_GLOW_MIN_OPACITY &&
      geometryHasVertices(geometries.glowGeometry) ? (
        <mesh geometry={geometries.glowGeometry} renderOrder={19}>
          <meshBasicMaterial
            blending={AdditiveBlending}
            depthWrite={false}
            opacity={overlay.glowOpacity}
            side={DoubleSide}
            toneMapped={false}
            transparent
            vertexColors
          />
        </mesh>
      ) : null}
      {geometries.gradientBands.map((band, index) => (
        <mesh geometry={band.geometry} key={`parcel-gradient-${index}`} renderOrder={20 + index}>
          <meshBasicMaterial
            depthWrite={false}
            opacity={band.opacity}
            side={DoubleSide}
            toneMapped={false}
            transparent
            vertexColors
          />
        </mesh>
      ))}
      <mesh geometry={geometries.contourGeometry} renderOrder={27}>
        <meshBasicMaterial
          depthWrite={false}
          opacity={overlay.edgeOpacity}
          side={DoubleSide}
          toneMapped={false}
          transparent
          vertexColors
        />
      </mesh>
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

function createParcelOverlayGeometries(
  parcels: readonly ParcelAllocationParcel[],
  style: NormalizedParcelOverlayOptions,
  elevation: number,
): ParcelOverlayGeometries {
  const centerPositions: number[] = []
  const centerColors: number[] = []
  const glowPositions: number[] = []
  const glowColors: number[] = []
  const contourPositions: number[] = []
  const contourColors: number[] = []
  const startDistance = style.contourWidthMeters
  const distance = Math.max(0, style.gradientDistanceMeters - startDistance)
  const gradientPositions = Array.from({ length: PARCEL_GRADIENT_BAND_COUNT }, () => [] as number[])
  const gradientColors = Array.from({ length: PARCEL_GRADIENT_BAND_COUNT }, () => [] as number[])
  const gradientOpacities: number[] = []

  for (let index = 0; index < PARCEL_GRADIENT_BAND_COUNT; index += 1) {
    const startT = index / PARCEL_GRADIENT_BAND_COUNT
    const endT = (index + 1) / PARCEL_GRADIENT_BAND_COUNT
    const opacityT = (index + 0.5) / PARCEL_GRADIENT_BAND_COUNT
    gradientOpacities[index] = lerp(style.edgeOpacity * 0.72, style.centerOpacity, opacityT)
  }

  parcels.forEach((parcel, parcelIndex) => {
    const color = colorToRgb(parcel.color)
    const parcelLift = parcelIndex * 0.0002
    const centerPoints = insetPointsTowardCentroid(
      parcel.points,
      parcel.centroid,
      style.gradientDistanceMeters,
    )

    if (style.centerOpacity > PARCEL_CENTER_FILL_MIN_OPACITY) {
      appendFilledPolygonGeometry(
        centerPositions,
        centerColors,
        centerPoints,
        elevation + 0.052 + parcelLift,
        color,
      )
    }

    if (style.glowOpacity > PARCEL_GLOW_MIN_OPACITY) {
      appendRingBandGeometry(
        glowPositions,
        glowColors,
        parcel.points,
        parcel.centroid,
        0,
        style.glowWidthMeters,
        elevation + 0.056 + parcelLift,
        color,
      )
    }

    if (distance > 0.02) {
      for (let index = 0; index < PARCEL_GRADIENT_BAND_COUNT; index += 1) {
        const opacity = gradientOpacities[index] ?? 0
        if (opacity <= 0.001) continue
        const startT = index / PARCEL_GRADIENT_BAND_COUNT
        const endT = (index + 1) / PARCEL_GRADIENT_BAND_COUNT
        appendRingBandGeometry(
          gradientPositions[index]!,
          gradientColors[index]!,
          parcel.points,
          parcel.centroid,
          startDistance + distance * startT,
          startDistance + distance * endT,
          elevation + 0.064 + index * 0.001 + parcelLift,
          color,
        )
      }
    }

    appendRingBandGeometry(
      contourPositions,
      contourColors,
      parcel.points,
      parcel.centroid,
      0,
      style.contourWidthMeters,
      elevation + 0.084 + parcelLift,
      color,
    )
  })

  return {
    centerGeometry: coloredTriangleGeometry(centerPositions, centerColors),
    contourGeometry: coloredTriangleGeometry(contourPositions, contourColors),
    glowGeometry: coloredTriangleGeometry(glowPositions, glowColors),
    gradientBands: gradientPositions
      .map((positions, index) => ({
        geometry: coloredTriangleGeometry(positions, gradientColors[index]!),
        opacity: gradientOpacities[index] ?? 0,
      }))
      .filter((band) => band.opacity > 0.001 && geometryHasVertices(band.geometry)),
  }
}

function appendRingBandGeometry(
  positions: number[],
  colors: number[],
  points: readonly LandrushPoint2[],
  centroid: LandrushPoint2,
  outerInset: number,
  innerInset: number,
  y: number,
  color: RgbColor,
) {
  if (points.length < 3 || innerInset <= outerInset + 0.001) return
  const outer = insetPointsTowardCentroid(points, centroid, outerInset)
  const inner = insetPointsTowardCentroid(points, centroid, innerInset)

  for (let index = 0; index < points.length; index += 1) {
    const outerA = outer[index]
    const outerB = outer[(index + 1) % outer.length]
    const innerA = inner[index]
    const innerB = inner[(index + 1) % inner.length]
    if (!(outerA && outerB && innerA && innerB)) continue

    pushColoredTriangle(positions, colors, outerA, outerB, innerA, y, color)
    pushColoredTriangle(positions, colors, outerB, innerB, innerA, y, color)
  }
}

function appendFilledPolygonGeometry(
  positions: number[],
  colors: number[],
  points: readonly LandrushPoint2[],
  y: number,
  color: RgbColor,
) {
  if (points.length < 3) return
  const triangles = ShapeUtils.triangulateShape(
    points.map((point) => new Vector2(point.x, point.z)),
    [],
  )

  for (const triangle of triangles) {
    const first = points[triangle[0]]
    const second = points[triangle[1]]
    const third = points[triangle[2]]
    if (!(first && second && third)) continue
    pushColoredTriangle(positions, colors, first, second, third, y, color)
  }
}

type RgbColor = { b: number; g: number; r: number }

function colorToRgb(value: string): RgbColor {
  const color = new Color(value)
  return { b: color.b, g: color.g, r: color.r }
}

function pushColoredTriangle(
  positions: number[],
  colors: number[],
  first: LandrushPoint2,
  second: LandrushPoint2,
  third: LandrushPoint2,
  y: number,
  color: RgbColor,
) {
  pushColoredVertex(positions, colors, first, y, color)
  pushColoredVertex(positions, colors, second, y, color)
  pushColoredVertex(positions, colors, third, y, color)
}

function pushColoredVertex(
  positions: number[],
  colors: number[],
  point: LandrushPoint2,
  y: number,
  color: RgbColor,
) {
  positions.push(point.x, y, point.z)
  colors.push(color.r, color.g, color.b)
}

function coloredTriangleGeometry(positions: readonly number[], colors: readonly number[]) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

function geometryHasVertices(geometry: BufferGeometry) {
  return (geometry.getAttribute('position')?.count ?? 0) > 0
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
