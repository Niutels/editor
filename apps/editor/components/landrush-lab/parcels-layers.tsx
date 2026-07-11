'use client'

import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
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
  generateParcelEdgeStreets,
  generateParcelStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
  type ParcelStreetNetwork,
  type ParcelStreetOptions,
  type ParcelStreetSegment,
} from './parcel-streets'
import type { WaterLandSurface } from './water-scene'

type ParcelsLandLayersProps = {
  dirtPathFilletRadiusScale?: number
  onAllocationChange?: (allocation: ParcelAllocationResult) => void
  onStreetNetworkChange?: (network: ParcelStreetNetwork) => void
  options: ParcelAllocationOptions
  parcelOverlayOptions: ParcelOverlayOptions
  renderStreetGeometry?: boolean
  showParcels?: boolean
  showStreets: boolean
  streetAppearance?: StreetAppearance
  streetOptions: ParcelStreetOptions
  streetPathMode?: StreetPathMode
  surface: WaterLandSurface
}

type StreetAppearance = 'dirt' | 'paved'
type StreetPathMode = 'connected' | 'parcel-edges'

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
const DIRT_PATH_TEXTURE_BASE = '/landrush-lab/stylized-scene/ground_texture/ground_07_4k'
const DIRT_PATH_GRASS_TEXTURE_BASE = '/landrush-lab/stylized-scene/grass_texture'
const DIRT_PATH_TEXTURE_REPEAT = 1
const DIRT_PATH_TEXTURE_WORLD_SIZE_METERS = 1.18
const DIRT_PATH_LAYER_OFFSET_METERS = 0.019
const DIRT_PATH_RENDER_ORDER = 11
const DIRT_PATH_BLEND_TEXTURE_SIZE = 2048
const DIRT_PATH_CENTER_DEPRESSION_METERS = 0.014
const DIRT_PATH_EDGE_RISE_METERS = 0.008
const DIRT_PATH_PATCH_SUBDIVISION_DEPTH = 2
const DIRT_PATH_SPAN_STEP_METERS = 0.32
const DIRT_PATH_SURFACE_NOISE_METERS = 0.006
const DIRT_PATH_WIDTH_SUBDIVISIONS = 4
const DEFAULT_DIRT_PATH_FILLET_RADIUS_SCALE = 0.72
const DIRT_PATH_FILLET_RADIUS_MAX_METERS = 15
const DIRT_PATH_FILLET_STEPS = 8
const DIRT_PATH_MAX_FILLET_ANGLE = Math.PI - Math.PI / 96
const DIRT_PATH_MIN_FILLET_ANGLE = Math.PI / 48
const DIRT_PATH_SMOOTH_UNION_METERS = 0.18
const DIRT_ROAD_WIDTH_SCALE = 1.08
const PARCEL_BOUNDARY_EDGE_THRESHOLD_METERS = 0.48
const PARCEL_FILL_TEXTURE_RESOLUTION = 512
const PARCEL_OVERLAY_COLOR = '#e0a35a'
const PARCEL_OVERLAY_PATH_PADDING_METERS = 0.06
const PARCEL_OVERLAY_RGB = colorToRgb(PARCEL_OVERLAY_COLOR)
const STREET_RENDER_NODE_PRECISION = 100

const DIRT_PATH_TEXTURE_PATHS = {
  ambientOcclusion: `${DIRT_PATH_TEXTURE_BASE}/ground_07__ambientocclusion_1k.webp`,
  color: `${DIRT_PATH_TEXTURE_BASE}/ground_07__basecolor_1k.webp`,
  grassColor: `${DIRT_PATH_GRASS_TEXTURE_BASE}/grass_05_basecolor_1k.webp`,
  height: `${DIRT_PATH_TEXTURE_BASE}/ground_07__height_1k.webp`,
  normal: `${DIRT_PATH_TEXTURE_BASE}/ground_07__normal_gl_1k.webp`,
  roughness: `${DIRT_PATH_TEXTURE_BASE}/ground_07__roughness_1k.webp`,
} as const

type DirtPathTextures = {
  ambientOcclusion: Texture
  color: Texture
  height: Texture
  normal: Texture
  roughness: Texture
}

type RgbByte = readonly [number, number, number]

type ParcelFillTexture = {
  hasVisiblePixels: boolean
  texture: DataTexture
}

type ParcelFillEdge = {
  end: LandrushPoint2
  start: LandrushPoint2
}

type StreetIncident = {
  direction: LandrushPoint2
  halfWidth: number
}

type StreetJunction = {
  incidents: StreetIncident[]
  point: LandrushPoint2
}

type DirtPathJunction = {
  incidents: readonly DirtPathIncident[]
  point: LandrushPoint2
  radius: number
}

type DirtPathSpan = {
  end: LandrushPoint2
  halfWidth: number
  parcelIds: readonly string[]
  start: LandrushPoint2
}

type DirtPathIncident = {
  direction: LandrushPoint2
  halfWidth: number
  length: number
  parcelIds: readonly string[]
}

type DirtPathRenderPoint = LandrushPoint2 & {
  u?: number
  v?: number
  y?: number
}

type DirtPathField = {
  junctions: readonly DirtPathJunction[]
  spans: readonly DirtPathSpan[]
}

type DirtPathFillet = {
  arc: readonly LandrushPoint2[]
  corner: LandrushPoint2
  endTangent: LandrushPoint2
  startTangent: LandrushPoint2
}

type DirtPathBendJoin = {
  arc: readonly LandrushPoint2[]
  center: LandrushPoint2
}

type DirtPathJunctionPatches = {
  bendJoins: readonly DirtPathBendJoin[]
  fillets: readonly DirtPathFillet[]
}

type DirtPathJunctionPatchMap = ReadonlyMap<string, DirtPathJunctionPatches>

export function ParcelsLandLayers({
  dirtPathFilletRadiusScale = DEFAULT_DIRT_PATH_FILLET_RADIUS_SCALE,
  onAllocationChange,
  onStreetNetworkChange,
  options,
  parcelOverlayOptions,
  renderStreetGeometry = true,
  showParcels = true,
  showStreets,
  streetAppearance = 'paved',
  streetOptions,
  streetPathMode = 'connected',
  surface,
}: ParcelsLandLayersProps) {
  const allocation = useMemo(
    () => allocateParcels(surface.grassSurfacePoints, options),
    [options, surface.grassSurfacePoints],
  )
  const streetNetwork = useMemo(
    () =>
      streetPathMode === 'parcel-edges'
        ? generateParcelEdgeStreets(allocation, streetOptions)
        : generateParcelStreets(allocation, streetOptions),
    [allocation, streetOptions, streetPathMode],
  )
  const dirtPathField = useMemo(
    () =>
      showStreets && streetAppearance === 'dirt'
        ? createDirtPathField(streetNetwork.segments, DIRT_ROAD_WIDTH_SCALE)
        : null,
    [showStreets, streetAppearance, streetNetwork.segments],
  )
  const parcelOverlayPathInsetMeters = dirtPathField ? PARCEL_OVERLAY_PATH_PADDING_METERS : 0
  const shouldRenderStreetGeometry = showStreets && renderStreetGeometry

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
          boundary={allocation.boundary}
          dirtPathField={dirtPathField}
          elevation={surface.grassSurfaceElevation}
          fieldSize={surface.waterPlaneSize}
          pathInsetMeters={parcelOverlayPathInsetMeters}
          parcels={allocation.parcels}
          style={parcelOverlayOptions}
        />
      ) : null}
      {shouldRenderStreetGeometry ? (
        streetAppearance === 'dirt' ? (
          dirtPathField ? (
            <DirtStreetNetworkLayer
              elevation={surface.grassSurfaceElevation + DIRT_PATH_LAYER_OFFSET_METERS}
              filletRadiusScale={dirtPathFilletRadiusScale}
              pathField={dirtPathField}
            />
          ) : null
        ) : (
          <StreetNetworkLayer
            elevation={surface.grassSurfaceElevation + 0.18}
            network={streetNetwork}
          />
        )
      ) : null}
    </group>
  )
}

function ParcelOverlayLayer({
  boundary,
  dirtPathField,
  elevation,
  fieldSize,
  pathInsetMeters,
  parcels,
  style,
}: {
  boundary: readonly LandrushPoint2[]
  dirtPathField: DirtPathField | null
  elevation: number
  fieldSize: number
  pathInsetMeters: number
  parcels: readonly ParcelAllocationParcel[]
  style: ParcelOverlayOptions
}) {
  const overlay = useMemo(() => normalizeParcelOverlayOptions(style), [style])
  const edgeInset = Math.max(0, finiteNumber(pathInsetMeters, 0))
  const fill = useMemo(
    () => createParcelFillTexture(parcels, boundary, overlay, fieldSize, edgeInset, dirtPathField),
    [boundary, dirtPathField, edgeInset, fieldSize, overlay, parcels],
  )

  useEffect(() => () => fill.texture.dispose(), [fill.texture])

  return (
    <group>
      {fill.hasVisiblePixels ? (
        <mesh position={[0, elevation + 0.058, 0]} renderOrder={27} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[fieldSize, fieldSize, 1, 1]} />
          <meshBasicMaterial
            depthWrite={false}
            map={fill.texture}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
      ) : null}
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

function createParcelFillTexture(
  parcels: readonly ParcelAllocationParcel[],
  boundary: readonly LandrushPoint2[],
  style: NormalizedParcelOverlayOptions,
  fieldSize: number,
  edgeInset: number,
  dirtPathField: DirtPathField | null,
): ParcelFillTexture {
  const resolution = PARCEL_FILL_TEXTURE_RESOLUTION
  const bytes = new Uint8Array(resolution * resolution * 4)
  const preparedParcels = parcels.map((parcel) => ({
    bounds: boundsForPoints(parcel.points),
    edges: parcelFillEdges(parcel.points, boundary, Boolean(dirtPathField)),
    points: parcel.points,
  }))
  const red = byte(PARCEL_OVERLAY_RGB.r)
  const green = byte(PARCEL_OVERLAY_RGB.g)
  const blue = byte(PARCEL_OVERLAY_RGB.b)
  const edgeFillOpacity = style.edgeOpacity * 0.72
  const contourFeather = Math.max(fieldSize / resolution, 0.035)
  const fadeDistance = Math.max(0.1, style.gradientDistanceMeters - style.contourWidthMeters)
  let hasVisiblePixels = false

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const point = {
        x: (x / (resolution - 1) - 0.5) * fieldSize,
        z: (y / (resolution - 1) - 0.5) * fieldSize,
      }
      const parcel = containingPreparedParcel(preparedParcels, point)
      const index = (y * resolution + x) * 4
      let alpha = 0

      if (parcel) {
        const edgeDistance = distanceToEdges(point, parcel.edges)
        const insetEdgeDistance = dirtPathField
          ? signedDistanceToDirtPath(point, dirtPathField) - edgeInset
          : edgeDistance - edgeInset
        if (Number.isFinite(insetEdgeDistance) && insetEdgeDistance >= 0) {
          const contourMask =
            1 -
            smoothstep(
              style.contourWidthMeters - contourFeather,
              style.contourWidthMeters + contourFeather,
              insetEdgeDistance,
            )
          const fillFade = smoothstep(
            0,
            fadeDistance,
            Math.max(0, insetEdgeDistance - style.contourWidthMeters),
          )
          const glowFade = 1 - smoothstep(0, style.glowWidthMeters, insetEdgeDistance)
          const fillAlpha = clamp01(
            lerp(edgeFillOpacity, style.centerOpacity, fillFade) + style.glowOpacity * glowFade,
          )
          alpha = Math.max(fillAlpha, style.edgeOpacity * contourMask)
        } else if (!Number.isFinite(edgeDistance)) {
          alpha = style.centerOpacity
        }
      }

      if (alpha > 0.002) hasVisiblePixels = true
      bytes[index] = red
      bytes[index + 1] = green
      bytes[index + 2] = blue
      bytes[index + 3] = byte(alpha)
    }
  }

  const texture = new DataTexture(bytes, resolution, resolution, RGBAFormat)
  texture.flipY = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return { hasVisiblePixels, texture }
}

type RgbColor = { b: number; g: number; r: number }

function colorToRgb(value: string): RgbColor {
  const color = new Color(value)
  return { b: color.b, g: color.g, r: color.r }
}

type PreparedParcelFill = {
  bounds: ParcelFillBounds
  edges: readonly ParcelFillEdge[]
  points: readonly LandrushPoint2[]
}

type ParcelFillBounds = {
  maxX: number
  maxZ: number
  minX: number
  minZ: number
}

function containingPreparedParcel(
  parcels: readonly PreparedParcelFill[],
  point: LandrushPoint2,
): PreparedParcelFill | null {
  for (const parcel of parcels) {
    if (
      point.x < parcel.bounds.minX ||
      point.x > parcel.bounds.maxX ||
      point.z < parcel.bounds.minZ ||
      point.z > parcel.bounds.maxZ
    ) {
      continue
    }
    if (pointInPolygon(point, parcel.points)) return parcel
  }

  return null
}

function boundsForPoints(points: readonly LandrushPoint2[]): ParcelFillBounds {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }

  return Number.isFinite(minX) ? { maxX, maxZ, minX, minZ } : { maxX: 0, maxZ: 0, minX: 0, minZ: 0 }
}

function parcelFillEdges(
  points: readonly LandrushPoint2[],
  boundary: readonly LandrushPoint2[],
  includeBoundaryEdges: boolean,
): readonly ParcelFillEdge[] {
  const edges: ParcelFillEdge[] = []

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (!(start && end)) continue
    if (!includeBoundaryEdges && edgeRunsAlongBoundary(start, end, boundary)) continue
    edges.push({ end, start })
  }

  return edges
}

function edgeRunsAlongBoundary(
  start: LandrushPoint2,
  end: LandrushPoint2,
  boundary: readonly LandrushPoint2[],
) {
  const midpoint = midpoint2(start, end)
  return distanceToPolygonEdges(midpoint, boundary) <= PARCEL_BOUNDARY_EDGE_THRESHOLD_METERS
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const crossesScanline = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    if (crossesScanline && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

function distanceToPolygonEdges(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!(start && end)) continue
    distance = Math.min(distance, distanceToSegment(point, start, end))
  }
  return Number.isFinite(distance) ? distance : 0
}

function distanceToEdges(point: LandrushPoint2, edges: readonly ParcelFillEdge[]) {
  let distance = Number.POSITIVE_INFINITY
  for (const edge of edges) {
    distance = Math.min(distance, distanceToSegment(point, edge.start, edge.end))
  }
  return distance
}

function distanceToSegment(point: LandrushPoint2, start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz || 0.000001
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function midpoint2(first: LandrushPoint2, second: LandrushPoint2): LandrushPoint2 {
  return {
    x: (first.x + second.x) / 2,
    z: (first.z + second.z) / 2,
  }
}

function byte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function geometryHasVertices(geometry: BufferGeometry) {
  return (geometry.getAttribute('position')?.count ?? 0) > 0
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

function DirtStreetNetworkLayer({
  elevation,
  filletRadiusScale,
  pathField,
}: {
  elevation: number
  filletRadiusScale: number
  pathField: DirtPathField
}) {
  const textures = useDirtPathTextures()
  const geometry = useMemo(
    () => dirtStreetNetworkGeometry(pathField, filletRadiusScale, elevation),
    [elevation, filletRadiusScale, pathField],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  if (!geometryHasVertices(geometry)) return null

  return (
    <mesh geometry={geometry} renderOrder={DIRT_PATH_RENDER_ORDER}>
      <meshStandardMaterial
        aoMap={textures.ambientOcclusion}
        aoMapIntensity={0.55}
        bumpMap={textures.height}
        bumpScale={0.035}
        color="#ffffff"
        depthTest={true}
        depthWrite={true}
        map={textures.color}
        metalness={0}
        normalMap={textures.normal}
        roughness={0.92}
        roughnessMap={textures.roughness}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function useDirtPathTextures(): DirtPathTextures {
  const [sourceColor, grassColor, ambientOcclusion, height, normal, roughness] = useTexture([
    DIRT_PATH_TEXTURE_PATHS.color,
    DIRT_PATH_TEXTURE_PATHS.grassColor,
    DIRT_PATH_TEXTURE_PATHS.ambientOcclusion,
    DIRT_PATH_TEXTURE_PATHS.height,
    DIRT_PATH_TEXTURE_PATHS.normal,
    DIRT_PATH_TEXTURE_PATHS.roughness,
  ]) as Texture[]

  const textures = useMemo(() => {
    const color = createDirtPathAlbedoTexture(sourceColor!, grassColor!)
    const textures = {
      ambientOcclusion: ambientOcclusion!,
      color,
      height: height!,
      normal: normal!,
      roughness: roughness!,
    }
    configureDirtPathTextures(textures)
    return textures
  }, [ambientOcclusion, grassColor, height, normal, roughness, sourceColor])

  useEffect(
    () => () => {
      if (textures.color.userData.landrushGeneratedDirtPathAlbedo) textures.color.dispose()
    },
    [textures.color],
  )

  return textures
}

function createDirtPathAlbedoTexture(dirtColor: Texture, grassColor: Texture): Texture {
  if (typeof document === 'undefined') return dirtColor
  const dirtImage = dirtColor.image as CanvasImageSource | undefined
  const grassImage = grassColor.image as CanvasImageSource | undefined
  if (!dirtImage || !grassImage) return dirtColor

  const size = DIRT_PATH_BLEND_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return dirtColor

  context.drawImage(dirtImage, 0, 0, size, size)
  const dirt = context.getImageData(0, 0, size, size)
  context.clearRect(0, 0, size, size)
  context.drawImage(grassImage, 0, 0, size, size)
  const grass = context.getImageData(0, 0, size, size)
  const data = dirt.data
  const grassData = grass.data

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const u = x / (size - 1)
      const v = y / (size - 1)
      const across = Math.abs(v - 0.5) * 2
      const rawDirt: RgbByte = [data[index]!, data[index + 1]!, data[index + 2]!]
      const rawGrass: RgbByte = [grassData[index]!, grassData[index + 1]!, grassData[index + 2]!]
      const stone = pathTextureStoneMask(u, v)
      const dirt = pathTextureDirtColor(rawDirt, u, v, across)
      const grass = pathTextureGrassColor(rawGrass, u, v)
      const edgeGrassNoise =
        (pathTextureNoise(u * 4.8 + 1.5, v * 3.8 - 2.4) - 0.5) * 0.24 +
        (pathTextureNoise(u * 14.5 - 3.2, v * 11.1 + 5.6) - 0.5) * 0.12
      const edgeGrass = smoothstep(0.72, 1.04, across + edgeGrassNoise)
      const rawGrassGap = pathTextureGrassGap(rawDirt)
      const grassBlend = Math.min(0.52, edgeGrass * 0.22 + rawGrassGap * 0.22)
      const edgeShadow = smoothstep(0.82, 1, across) * 0.04
      const centerLight = (1 - smoothstep(0.22, 0.9, across)) * 0.12
      let color = mixRgb(dirt, grass, grassBlend)
      color = scaleRgb(color, 1 + centerLight - edgeShadow)
      color = scaleRgb(color, 0.99 + stone.highlight * 0.05)
      color = mixRgb(color, [82, 54, 37], stone.crack * 0.24)
      color = mixRgb(color, grass, stone.grassCrack * 0.12)
      data[index] = byte255(color[0])
      data[index + 1] = byte255(color[1])
      data[index + 2] = byte255(color[2])
    }
  }

  context.putImageData(dirt, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.userData.landrushGeneratedDirtPathAlbedo = true
  return texture
}

function pathTextureStoneMask(u: number, v: number) {
  const slabCount = 3.55
  const slabIndex = Math.floor(u * slabCount)
  const slabJitter = (pathTextureNoise(slabIndex * 1.7 + 0.4, 3.7) - 0.5) * 0.14
  const slabLocal = fractional(u * slabCount + slabJitter)
  const transverseCrack = 1 - smoothstep(0.024, 0.145, Math.min(slabLocal, 1 - slabLocal))
  const splitJitter = (pathTextureNoise(slabIndex * 2.3 + 8.1, 11.4) - 0.5) * 0.12
  const splitA = 0.32 + splitJitter
  const splitB = 0.68 - splitJitter * 0.65
  const splitCrackA = 1 - smoothstep(0.022, 0.125, Math.abs(v - splitA))
  const splitCrackB = 1 - smoothstep(0.022, 0.12, Math.abs(v - splitB))
  const centerDrift = 0.5 + splitJitter * 0.75
  const centerCrack =
    (1 - smoothstep(0.02, 0.105, Math.abs(v - centerDrift))) *
    smoothstep(0.14, 0.58, slabLocal) *
    (1 - smoothstep(0.68, 0.98, slabLocal))
  const brokenEdge =
    (1 - smoothstep(0.58, 0.9, pathTextureNoise(u * 12.8 + 2.2, v * 16.4 - 4.1))) *
    smoothstep(0.58, 1, Math.abs(v - 0.5) * 2)
  const crack = clamp01(
    Math.max(
      transverseCrack * 0.86,
      splitCrackA * 0.68,
      splitCrackB * 0.62,
      centerCrack * 0.6,
      brokenEdge * 0.46,
    ),
  )
  const grassCrack = crack * smoothstep(0.35, 0.9, pathTextureNoise(u * 8.4 - 1.2, v * 7.6 + 4.8))
  const highlight = pathTextureNoise(u * 7.6 + 0.2, v * 5.4 - 3.1)

  return { crack, grassCrack, highlight }
}

function pathTextureDirtColor(raw: RgbByte, u: number, v: number, across: number): RgbByte {
  const warmTan: RgbByte = [226, 170, 125]
  const lightTan: RgbByte = [244, 202, 160]
  const grassGap = pathTextureGrassGap(raw)
  const stoneNoise =
    pathTextureNoise(u * 4.6 + 0.9, v * 4.2 - 1.7) * 0.7 +
    pathTextureNoise(u * 13.5 - 4.4, v * 12.1 + 3.9) * 0.3
  const warmth = 0.34 - grassGap * 0.08
  const edgeWarmth = smoothstep(0.62, 1, across) * 0.06
  let color = mixRgb(raw, warmTan, warmth)
  color = mixRgb(color, lightTan, stoneNoise * (1 - grassGap) * 0.1)
  return scaleRgb(color, 1.02 + stoneNoise * 0.08 + edgeWarmth)
}

function pathTextureGrassColor(raw: RgbByte, u: number, v: number): RgbByte {
  const saturatedGrass: RgbByte = [94, 150, 66]
  const highlightGrass: RgbByte = [159, 189, 91]
  const patch = pathTextureNoise(u * 8.4 + 3.2, v * 9.7 - 2.9)
  return mixRgb(mixRgb(raw, saturatedGrass, 0.36), highlightGrass, patch * 0.2)
}

function pathTextureGrassGap(raw: RgbByte) {
  const greenLead = raw[1] - Math.max(raw[0], raw[2])
  const redSuppression = raw[0] - raw[1]
  return Math.max(smoothstep(8, 42, greenLead), smoothstep(22, 78, -redSuppression))
}

function mixRgb(first: RgbByte, second: RgbByte, amount: number): RgbByte {
  const t = clamp01(amount)
  return [lerp(first[0], second[0], t), lerp(first[1], second[1], t), lerp(first[2], second[2], t)]
}

function scaleRgb(color: RgbByte, scale: number): RgbByte {
  return [color[0] * scale, color[1] * scale, color[2] * scale]
}

function byte255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function fractional(value: number) {
  return value - Math.floor(value)
}

function configureDirtPathTextures(textures: DirtPathTextures) {
  textures.color.colorSpace = SRGBColorSpace
  textures.ambientOcclusion.colorSpace = NoColorSpace
  textures.height.colorSpace = NoColorSpace
  textures.normal.colorSpace = NoColorSpace
  textures.roughness.colorSpace = NoColorSpace
  for (const texture of Object.values(textures)) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(DIRT_PATH_TEXTURE_REPEAT, DIRT_PATH_TEXTURE_REPEAT)
    texture.needsUpdate = true
  }
}

function createDirtPathField(
  segments: readonly ParcelStreetSegment[],
  widthScale: number,
): DirtPathField {
  const spans = dirtPathSpans(segments, widthScale)
  return {
    junctions: dirtPathJunctions(spans),
    spans,
  }
}

function dirtStreetNetworkGeometry(pathField: DirtPathField, filletRadiusScale: number, y: number) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const uvs: number[] = []
  const patchesByJunction = dirtPathJunctionPatchesByJunction(
    pathField.junctions,
    filletRadiusScale,
  )

  for (const span of pathField.spans) {
    addDirtPathSpanGeometry(positions, uvs, span, y)
  }

  for (const junction of pathField.junctions) {
    const patches = patchesByJunction.get(streetRenderNodeId(junction.point))
    addDirtPathBendJoinGeometry(positions, uvs, patches?.bendJoins ?? [], y)
    addDirtPathJunctionGeometry(positions, uvs, patches?.fillets ?? [], y)
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('uv2', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

function addDirtPathSpanGeometry(
  positions: number[],
  uvs: number[],
  span: DirtPathSpan,
  y: number,
) {
  const length = distance2(span.start, span.end)
  if (length <= 0.001) return

  const normal = normalForSegment(span.start, span.end)
  const direction = {
    x: (span.end.x - span.start.x) / length,
    z: (span.end.z - span.start.z) / length,
  }
  const lengthSteps = Math.max(1, Math.ceil(length / DIRT_PATH_SPAN_STEP_METERS))

  for (let lengthIndex = 0; lengthIndex < lengthSteps; lengthIndex += 1) {
    const startT = lengthIndex / lengthSteps
    const endT = (lengthIndex + 1) / lengthSteps
    for (let widthIndex = 0; widthIndex < DIRT_PATH_WIDTH_SUBDIVISIONS; widthIndex += 1) {
      const firstOffset = lerp(
        -span.halfWidth,
        span.halfWidth,
        widthIndex / DIRT_PATH_WIDTH_SUBDIVISIONS,
      )
      const secondOffset = lerp(
        -span.halfWidth,
        span.halfWidth,
        (widthIndex + 1) / DIRT_PATH_WIDTH_SUBDIVISIONS,
      )
      const first = dirtPathSpanPoint(
        span.start,
        direction,
        normal,
        length,
        startT,
        firstOffset,
        span.halfWidth,
        y,
      )
      const second = dirtPathSpanPoint(
        span.start,
        direction,
        normal,
        length,
        endT,
        firstOffset,
        span.halfWidth,
        y,
      )
      const third = dirtPathSpanPoint(
        span.start,
        direction,
        normal,
        length,
        startT,
        secondOffset,
        span.halfWidth,
        y,
      )
      const fourth = dirtPathSpanPoint(
        span.start,
        direction,
        normal,
        length,
        endT,
        secondOffset,
        span.halfWidth,
        y,
      )

      pushDirtTriangle(positions, uvs, first, third, second, y)
      pushDirtTriangle(positions, uvs, second, third, fourth, y)
    }
  }
}

function dirtPathSpanPoint(
  start: LandrushPoint2,
  direction: LandrushPoint2,
  normal: LandrushPoint2,
  length: number,
  t: number,
  offset: number,
  halfWidth: number,
  baseY: number,
): DirtPathRenderPoint {
  const point = {
    x: start.x + direction.x * length * t + normal.x * offset,
    z: start.z + direction.z * length * t + normal.z * offset,
  }
  const edgeRatio = clamp01(Math.abs(offset) / Math.max(halfWidth, 0.000001))
  const edgeRise = smoothstep(0.68, 1, edgeRatio)
  const centerDepression = -DIRT_PATH_CENTER_DEPRESSION_METERS * (1 - edgeRise)
  const rockNoise =
    (pathTextureNoise(point.x * 0.74 + 8.2, point.z * 0.74 - 3.5) - 0.5) *
    DIRT_PATH_SURFACE_NOISE_METERS *
    (1 - smoothstep(0.86, 1, edgeRatio))
  return {
    ...point,
    u: (length * t) / Math.max(halfWidth * 2, 0.000001),
    v: offset / Math.max(halfWidth * 2, 0.000001) + 0.5,
    y: baseY + centerDepression + DIRT_PATH_EDGE_RISE_METERS * edgeRise + rockNoise,
  }
}

function addDirtPathJunctionGeometry(
  positions: number[],
  uvs: number[],
  fillets: readonly DirtPathFillet[],
  y: number,
) {
  for (const fillet of fillets) {
    for (let index = 0; index < fillet.arc.length - 1; index += 1) {
      const current = fillet.arc[index]
      const next = fillet.arc[index + 1]
      if (current && next)
        pushSubdividedDirtTriangle(
          positions,
          uvs,
          fillet.corner,
          current,
          next,
          y,
          DIRT_PATH_PATCH_SUBDIVISION_DEPTH,
        )
    }
  }
}

function dirtPathJunctionPatchesByJunction(
  junctions: readonly DirtPathJunction[],
  filletRadiusScale: number,
): DirtPathJunctionPatchMap {
  return new Map(
    junctions.map((junction) => [
      streetRenderNodeId(junction.point),
      dirtPathJunctionPatches(junction, filletRadiusScale),
    ]),
  )
}

function dirtPathJunctionPatches(
  junction: DirtPathJunction,
  filletRadiusScale: number,
): DirtPathJunctionPatches {
  const incidents = junction.incidents
    .map((incident) => ({
      ...incident,
      angle: normalizedAngle(Math.atan2(incident.direction.z, incident.direction.x)),
    }))
    .sort((first, second) => first.angle - second.angle)
  const fillets: DirtPathFillet[] = []
  const bendJoins: DirtPathBendJoin[] = []
  const patchedPairs = new Set<string>()

  for (let index = 0; index < incidents.length; index += 1) {
    const current = incidents[index]
    const nextIndex = (index + 1) % incidents.length
    const next = incidents[nextIndex]
    if (!(current && next)) continue

    const nextAngle = next.angle + (next.angle <= current.angle ? Math.PI * 2 : 0)
    const gap = nextAngle - current.angle
    if (gap <= DIRT_PATH_MIN_FILLET_ANGLE || gap >= DIRT_PATH_MAX_FILLET_ANGLE) continue

    const fillet =
      incidents.length > 2
        ? dirtPathFilletForIncidentPair(junction.point, current, next, gap, filletRadiusScale)
        : null
    if (fillet) {
      fillets.push(fillet)
      patchedPairs.add(incidentPairKey(index, nextIndex))
      continue
    }

    const bendJoin = dirtPathBendJoinForIncidentPair(junction.point, current, next)
    if (bendJoin) {
      bendJoins.push(bendJoin)
      patchedPairs.add(incidentPairKey(index, nextIndex))
    }
  }

  if (incidents.length > 2) {
    for (let firstIndex = 0; firstIndex < incidents.length - 1; firstIndex += 1) {
      const first = incidents[firstIndex]
      if (!first) continue

      for (let secondIndex = firstIndex + 1; secondIndex < incidents.length; secondIndex += 1) {
        const second = incidents[secondIndex]
        if (!second) continue
        if (patchedPairs.has(incidentPairKey(firstIndex, secondIndex))) continue
        if (areAngularNeighborIndexes(firstIndex, secondIndex, incidents.length)) continue
        if (!dirtPathIncidentsShareParcel(first, second)) continue

        const forwardGap = second.angle - first.angle
        const smallerGap = Math.min(forwardGap, Math.PI * 2 - forwardGap)
        if (
          smallerGap <= DIRT_PATH_MIN_FILLET_ANGLE ||
          smallerGap >= Math.PI - DIRT_PATH_MIN_FILLET_ANGLE
        ) {
          continue
        }

        const current = forwardGap <= Math.PI ? first : second
        const next = forwardGap <= Math.PI ? second : first
        const bendJoin = dirtPathBendJoinForIncidentPair(junction.point, current, next)
        if (bendJoin) bendJoins.push(bendJoin)
      }
    }
  }

  return { bendJoins, fillets }
}

function dirtPathFilletForIncidentPair(
  point: LandrushPoint2,
  current: DirtPathIncident,
  next: DirtPathIncident,
  gap: number,
  filletRadiusScale: number,
): DirtPathFillet | null {
  const currentNormal = { x: -current.direction.z, z: current.direction.x }
  const nextNormal = { x: -next.direction.z, z: next.direction.x }
  const currentSidePoint = {
    x: point.x + currentNormal.x * current.halfWidth,
    z: point.z + currentNormal.z * current.halfWidth,
  }
  const nextSidePoint = {
    x: point.x - nextNormal.x * next.halfWidth,
    z: point.z - nextNormal.z * next.halfWidth,
  }
  const intersection = lineIntersection2(
    currentSidePoint,
    current.direction,
    nextSidePoint,
    next.direction,
  )
  if (!intersection || intersection.firstT <= 0.001 || intersection.secondT <= 0.001) return null

  const halfAngleTangent = Math.tan(gap / 2)
  if (Math.abs(halfAngleTangent) <= 0.000001) return null

  const requestedRadius = Math.min(
    Math.max(0, finiteNumber(filletRadiusScale, DEFAULT_DIRT_PATH_FILLET_RADIUS_SCALE)),
    DIRT_PATH_FILLET_RADIUS_MAX_METERS,
  )
  const edgeLimitedRadius =
    Math.min(current.length - intersection.firstT, next.length - intersection.secondT) *
    halfAngleTangent
  const radius = Math.min(requestedRadius, Math.max(0, edgeLimitedRadius))
  if (radius <= 0.025) return null

  const tangentDistance = radius / halfAngleTangent
  const insideStartTangent = {
    x: intersection.point.x - current.direction.x * tangentDistance,
    z: intersection.point.z - current.direction.z * tangentDistance,
  }
  const insideEndTangent = {
    x: intersection.point.x - next.direction.x * tangentDistance,
    z: intersection.point.z - next.direction.z * tangentDistance,
  }
  const centerDirection = normalize2({
    x: -current.direction.x - next.direction.x,
    z: -current.direction.z - next.direction.z,
  })
  const centerDistance = radius / Math.max(Math.sin(gap / 2), 0.000001)
  const insideCenter = {
    x: intersection.point.x + centerDirection.x * centerDistance,
    z: intersection.point.z + centerDirection.z * centerDistance,
  }
  const startTangent = rotateHalfTurnAround(insideStartTangent, intersection.point)
  const endTangent = rotateHalfTurnAround(insideEndTangent, intersection.point)
  const center = rotateHalfTurnAround(insideCenter, intersection.point)

  return {
    arc: clockwiseArcPoints(center, startTangent, endTangent, DIRT_PATH_FILLET_STEPS),
    corner: intersection.point,
    endTangent,
    startTangent,
  }
}

function dirtPathBendJoinForIncidentPair(
  point: LandrushPoint2,
  current: DirtPathIncident,
  next: DirtPathIncident,
): DirtPathBendJoin | null {
  const currentNormal = { x: -current.direction.z, z: current.direction.x }
  const nextNormal = { x: -next.direction.z, z: next.direction.x }
  const start = {
    x: point.x - currentNormal.x * current.halfWidth,
    z: point.z - currentNormal.z * current.halfWidth,
  }
  const end = {
    x: point.x + nextNormal.x * next.halfWidth,
    z: point.z + nextNormal.z * next.halfWidth,
  }
  const arc = clockwiseInterpolatedArcPoints(point, start, end, DIRT_PATH_FILLET_STEPS)

  return arc.length > 1 ? { arc, center: point } : null
}

function addDirtPathBendJoinGeometry(
  positions: number[],
  uvs: number[],
  bendJoins: readonly DirtPathBendJoin[],
  y: number,
) {
  for (const bendJoin of bendJoins) {
    for (let index = 0; index < bendJoin.arc.length - 1; index += 1) {
      const currentPoint = bendJoin.arc[index]
      const nextPoint = bendJoin.arc[index + 1]
      if (currentPoint && nextPoint)
        pushSubdividedDirtTriangle(
          positions,
          uvs,
          bendJoin.center,
          currentPoint,
          nextPoint,
          y,
          DIRT_PATH_PATCH_SUBDIVISION_DEPTH,
        )
    }
  }
}

function incidentPairKey(firstIndex: number, secondIndex: number) {
  return firstIndex < secondIndex ? `${firstIndex}:${secondIndex}` : `${secondIndex}:${firstIndex}`
}

function areAngularNeighborIndexes(firstIndex: number, secondIndex: number, count: number) {
  return (
    Math.abs(firstIndex - secondIndex) === 1 || Math.abs(firstIndex - secondIndex) === count - 1
  )
}

function dirtPathIncidentsShareParcel(first: DirtPathIncident, second: DirtPathIncident) {
  return first.parcelIds.some((parcelId) => second.parcelIds.includes(parcelId))
}

function mergeParcelIds(first: readonly string[], second: readonly string[]) {
  return [...new Set([...first, ...second])].sort()
}

function dirtPathSpans(
  segments: readonly ParcelStreetSegment[],
  widthScale: number,
): readonly DirtPathSpan[] {
  const spans: DirtPathSpan[] = []

  for (const segment of segments) {
    const halfWidth = (normalizedStreetWidth(segment.width) * widthScale) / 2
    for (let index = 0; index < segment.points.length - 1; index += 1) {
      const start = segment.points[index]
      const end = segment.points[index + 1]
      if (!(start && end) || distance2(start, end) <= 0.001) continue
      spans.push({
        end,
        halfWidth,
        parcelIds: segment.parcelIds,
        start,
      })
    }
  }

  return spans
}

function dirtPathJunctions(spans: readonly DirtPathSpan[]): readonly DirtPathJunction[] {
  const nodes = new Map<
    string,
    { incidents: DirtPathIncident[]; maxHalfWidth: number; point: LandrushPoint2 }
  >()

  for (const span of spans) {
    const direction = normalize2({ x: span.end.x - span.start.x, z: span.end.z - span.start.z })
    const length = distance2(span.start, span.end)
    addDirtPathIncident(nodes, span.start, direction, span.halfWidth, length, span.parcelIds)
    addDirtPathIncident(
      nodes,
      span.end,
      { x: -direction.x, z: -direction.z },
      span.halfWidth,
      length,
      span.parcelIds,
    )
  }

  return [...nodes.values()]
    .filter((node) => node.incidents.length > 1)
    .map((node) => {
      return {
        incidents: node.incidents,
        point: node.point,
        radius: node.maxHalfWidth,
      }
    })
}

function addDirtPathIncident(
  nodes: Map<
    string,
    { incidents: DirtPathIncident[]; maxHalfWidth: number; point: LandrushPoint2 }
  >,
  point: LandrushPoint2,
  direction: LandrushPoint2,
  halfWidth: number,
  length: number,
  parcelIds: readonly string[],
) {
  const id = streetRenderNodeId(point)
  const node = nodes.get(id) ?? { incidents: [], maxHalfWidth: 0, point }
  const existing = node.incidents.find((incident) => dot2(incident.direction, direction) > 0.998)
  if (existing) {
    existing.halfWidth = Math.max(existing.halfWidth, halfWidth)
    existing.length = Math.max(existing.length, length)
    existing.parcelIds = mergeParcelIds(existing.parcelIds, parcelIds)
  } else {
    node.incidents.push({ direction, halfWidth, length, parcelIds: [...parcelIds].sort() })
  }
  node.maxHalfWidth = Math.max(node.maxHalfWidth, halfWidth)
  nodes.set(id, node)
}

function signedDistanceToPathSpan(point: LandrushPoint2, span: DirtPathSpan) {
  const dx = span.end.x - span.start.x
  const dz = span.end.z - span.start.z
  const length = Math.max(Math.hypot(dx, dz), 0.000001)
  const ux = dx / length
  const uz = dz / length
  const localX = (point.x - span.start.x) * ux + (point.z - span.start.z) * uz - length / 2
  const localZ = Math.abs((point.x - span.start.x) * -uz + (point.z - span.start.z) * ux)
  const qx = Math.abs(localX) - length / 2
  const qz = localZ - span.halfWidth
  const outsideDistance = Math.hypot(Math.max(qx, 0), Math.max(qz, 0))
  const insideDistance = Math.min(Math.max(qx, qz), 0)
  return outsideDistance + insideDistance
}

function signedDistanceToDirtPath(point: LandrushPoint2, pathField: DirtPathField) {
  let signedDistance = Number.POSITIVE_INFINITY

  for (const span of pathField.spans) {
    signedDistance = smoothMinDistance(
      signedDistance,
      signedDistanceToPathSpan(point, span),
      DIRT_PATH_SMOOTH_UNION_METERS,
    )
  }
  for (const junction of pathField.junctions) {
    signedDistance = smoothMinDistance(
      signedDistance,
      distance2(point, junction.point) - junction.radius,
      DIRT_PATH_SMOOTH_UNION_METERS,
    )
  }

  return signedDistance
}

function smoothMinDistance(first: number, second: number, amount: number) {
  if (!Number.isFinite(first)) return second
  if (!Number.isFinite(second)) return first
  const h = clamp01(0.5 + (0.5 * (second - first)) / Math.max(amount, 0.000001))
  return lerp(second, first, h) - amount * h * (1 - h)
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

function pushDirtTriangle(
  positions: number[],
  uvs: number[],
  first: DirtPathRenderPoint,
  second: DirtPathRenderPoint,
  third: DirtPathRenderPoint,
  y: number,
) {
  if (cross2(first, second, third) > 0) {
    pushDirtVertex(positions, uvs, first, y)
    pushDirtVertex(positions, uvs, third, y)
    pushDirtVertex(positions, uvs, second, y)
    return
  }
  pushDirtVertex(positions, uvs, first, y)
  pushDirtVertex(positions, uvs, second, y)
  pushDirtVertex(positions, uvs, third, y)
}

function pushDirtVertex(
  positions: number[],
  uvs: number[],
  point: DirtPathRenderPoint,
  fallbackY: number,
) {
  positions.push(point.x, dirtPathVertexY(point, fallbackY), point.z)
  const uv = dirtPathVertexUv(point)
  uvs.push(uv.u, uv.v)
}

function pushSubdividedDirtTriangle(
  positions: number[],
  uvs: number[],
  first: DirtPathRenderPoint,
  second: DirtPathRenderPoint,
  third: DirtPathRenderPoint,
  y: number,
  depth: number,
) {
  if (depth <= 0) {
    pushDirtTriangle(positions, uvs, first, second, third, y)
    return
  }

  const firstSecond = dirtPathRenderMidpoint(first, second)
  const secondThird = dirtPathRenderMidpoint(second, third)
  const thirdFirst = dirtPathRenderMidpoint(third, first)
  pushSubdividedDirtTriangle(positions, uvs, first, firstSecond, thirdFirst, y, depth - 1)
  pushSubdividedDirtTriangle(positions, uvs, firstSecond, second, secondThird, y, depth - 1)
  pushSubdividedDirtTriangle(positions, uvs, thirdFirst, secondThird, third, y, depth - 1)
  pushSubdividedDirtTriangle(positions, uvs, firstSecond, secondThird, thirdFirst, y, depth - 1)
}

function dirtPathVertexY(point: DirtPathRenderPoint, fallbackY: number) {
  return (
    point.y ?? fallbackY - DIRT_PATH_CENTER_DEPRESSION_METERS * 0.42 + dirtPathSurfaceNoise(point)
  )
}

function dirtPathVertexUv(point: DirtPathRenderPoint) {
  if (Number.isFinite(point.u) && Number.isFinite(point.v)) {
    return { u: point.u!, v: point.v! }
  }
  return {
    u: point.x / DIRT_PATH_TEXTURE_WORLD_SIZE_METERS + 0.5,
    v: point.z / DIRT_PATH_TEXTURE_WORLD_SIZE_METERS + 0.5,
  }
}

function dirtPathRenderMidpoint(
  first: DirtPathRenderPoint,
  second: DirtPathRenderPoint,
): DirtPathRenderPoint {
  const midpoint = midpoint2(first, second)
  return {
    ...midpoint,
    u:
      Number.isFinite(first.u) && Number.isFinite(second.u)
        ? ((first.u ?? 0) + (second.u ?? 0)) / 2
        : undefined,
    v:
      Number.isFinite(first.v) && Number.isFinite(second.v)
        ? ((first.v ?? 0) + (second.v ?? 0)) / 2
        : undefined,
    y:
      Number.isFinite(first.y) && Number.isFinite(second.y)
        ? ((first.y ?? 0) + (second.y ?? 0)) / 2
        : undefined,
  }
}

function dirtPathSurfaceNoise(point: LandrushPoint2) {
  return (
    (pathTextureNoise(point.x * 0.82 - 2.4, point.z * 0.82 + 5.7) - 0.5) *
    DIRT_PATH_SURFACE_NOISE_METERS
  )
}

function clockwiseArcPoints(
  center: LandrushPoint2,
  start: LandrushPoint2,
  end: LandrushPoint2,
  steps: number,
) {
  const startAngle = Math.atan2(start.z - center.z, start.x - center.x)
  let endAngle = Math.atan2(end.z - center.z, end.x - center.x)
  while (endAngle > startAngle) endAngle -= Math.PI * 2

  const points: LandrushPoint2[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const angle = lerp(startAngle, endAngle, t)
    const radius = distance2(center, start)
    points.push({
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    })
  }
  return points
}

function clockwiseInterpolatedArcPoints(
  center: LandrushPoint2,
  start: LandrushPoint2,
  end: LandrushPoint2,
  steps: number,
) {
  const startAngle = Math.atan2(start.z - center.z, start.x - center.x)
  let endAngle = Math.atan2(end.z - center.z, end.x - center.x)
  while (endAngle > startAngle) endAngle -= Math.PI * 2

  const startRadius = distance2(center, start)
  const endRadius = distance2(center, end)
  const points: LandrushPoint2[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const angle = lerp(startAngle, endAngle, t)
    const radius = lerp(startRadius, endRadius, t)
    points.push({
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    })
  }
  return points
}

function lineIntersection2(
  firstPoint: LandrushPoint2,
  firstDirection: LandrushPoint2,
  secondPoint: LandrushPoint2,
  secondDirection: LandrushPoint2,
) {
  const denominator = crossVector2(firstDirection, secondDirection)
  if (Math.abs(denominator) <= 0.000001) return null

  const delta = { x: secondPoint.x - firstPoint.x, z: secondPoint.z - firstPoint.z }
  const firstT = crossVector2(delta, secondDirection) / denominator
  const secondT = crossVector2(delta, firstDirection) / denominator
  return {
    firstT,
    point: {
      x: firstPoint.x + firstDirection.x * firstT,
      z: firstPoint.z + firstDirection.z * firstT,
    },
    secondT,
  }
}

function rotateHalfTurnAround(point: LandrushPoint2, center: LandrushPoint2) {
  return {
    x: center.x * 2 - point.x,
    z: center.z * 2 - point.z,
  }
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

function crossVector2(first: LandrushPoint2, second: LandrushPoint2) {
  return first.x * second.z - first.z * second.x
}

function cross2(origin: LandrushPoint2, first: LandrushPoint2, second: LandrushPoint2) {
  return (first.x - origin.x) * (second.z - origin.z) - (first.z - origin.z) * (second.x - origin.x)
}

function normalizedAngle(angle: number) {
  const tau = Math.PI * 2
  return ((angle % tau) + tau) % tau
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

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}

function pathTextureNoise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(pathTextureHash(ix, iz), pathTextureHash(ix + 1, iz), ux),
    lerp(pathTextureHash(ix, iz + 1), pathTextureHash(ix + 1, iz + 1), ux),
    uz,
  )
}

function pathTextureHash(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return value - Math.floor(value)
}
