'use client'

import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
} from 'three'
import type { LandrushWorldNode } from '@pascal-app/core'
import type { Point2 } from './render-types'

const GROUND_FIELD_RESOLUTION = 512
const GROUND_FIELD_PLANE_SIZE = 132
const GROUND_EDGE_FADE_METERS = 0
const GROUND_TEXTURE_BASE = '/landrush-lab/stylized-scene/ground_texture/ground_07_4k'
const GRASS_TEXTURE_BASE = '/landrush-lab/stylized-scene/grass_texture'
const STYLIZED_GRASS_TEXTURE_PATH = `${GRASS_TEXTURE_BASE}/grass_05_basecolor_1k.webp`
const STYLIZED_DIRT_TEXTURE_PATH = `${GROUND_TEXTURE_BASE}/ground_07__basecolor_1k.webp`
const STYLIZED_DIRT_AO_TEXTURE_PATH = `${GROUND_TEXTURE_BASE}/ground_07__ambientocclusion_1k.webp`
const STYLIZED_DIRT_HEIGHT_TEXTURE_PATH = `${GROUND_TEXTURE_BASE}/ground_07__height_1k.webp`
const DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS = 5
const MIN_STYLIZED_TEXTURE_WORLD_SIZE_METERS = 0.001
const STYLIZED_GROUND_FINAL_TEXTURE_RESOLUTION = 1024
const STYLIZED_GROUND_PREVIEW_TEXTURE_RESOLUTION = 512
const STYLIZED_PATH_EDGE_FEATHER_METERS = 0.48
const STYLIZED_PATH_EDGE_NOISE_METERS = 0.18
const STYLIZED_PATH_WIDTH_SCALE = 1.08
const GRASS_ROAD_EDGE_PADDING_METERS = 0.08
const GRASS_ROAD_FEATHER_METERS = 0.46
const GRASS_COLORS = [
  [118, 156, 72],
  [150, 176, 89],
  [91, 145, 68],
  [176, 194, 104],
] as const
const GRASS_REGION_CORE_SHARPNESS = 5.2
const GRASS_REGION_BLEND_SHARPNESS = 2.15
const PARCEL_FILL_TEXTURE_RESOLUTION = 512
const PARCEL_OVERLAY_COLOR = '#e0a35a'
const PARCEL_OVERLAY_PATH_PADDING_METERS = 0.06
const PARCEL_BOUNDARY_EDGE_THRESHOLD_METERS = 0.48
const PARCEL_OVERLAY_RGB = colorToRgb(PARCEL_OVERLAY_COLOR)
const PARCEL_OVERLAY_STYLE = {
  contourWidthMeters: 0.34,
  glowOpacity: 0.055,
  glowWidthMeters: 2.1,
  gradientDistanceMeters: 4.8,
  maxTransparency: 0.99,
  minTransparency: 0.58,
}
const EMPTY_ROADS: readonly LandrushWorldNode['roads']['segments'][number][] = []

type GroundFieldResult = {
  texture: DataTexture
}

type GrassFieldSample = {
  color: readonly [number, number, number]
  colorIndex: 0 | 1 | 2 | 3
  density: number
  detail: number
  roadDistance: number
  shoreDistance: number
  surfaceAlpha: number
  transition: number
}

type GroundTextureOptions = {
  dirtAOTexture: Texture
  dirtHeightTexture: Texture
  dirtTexture: Texture
  fieldSize: number
  grassTexture: Texture
  maskTexture: Texture
  roads: readonly LandrushWorldNode['roads']['segments'][number][]
  textureWorldSizeMeters: number
}

type PreparedStylizedGroundTexture = {
  dirtAOSource: TextureImageData
  dirtHeightSource: TextureImageData
  dirtSource: TextureImageData
  fieldSize: number
  grassSource: TextureImageData
  maskData: Uint8Array
  maskSize: number
  pathGrid: StylizedPathGrid | null
  textureRepeat: number
}

type TextureImageData = {
  data: Uint8ClampedArray
  height: number
  width: number
}

type RgbByte = readonly [number, number, number]

type StylizedPathSpan = {
  end: Point2
  halfWidth: number
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  start: Point2
}

type StylizedPathGrid = {
  cells: StylizedPathSpan[][]
  cellsPerAxis: number
  fieldSize: number
}

type ParcelOverlayStyle = {
  contourWidthMeters: number
  glowOpacity: number
  glowWidthMeters: number
  gradientDistanceMeters: number
  maxTransparency: number
  minTransparency: number
}

type NormalizedParcelOverlayStyle = {
  centerOpacity: number
  contourWidthMeters: number
  edgeOpacity: number
  glowOpacity: number
  glowWidthMeters: number
  gradientDistanceMeters: number
}

type ParcelFillTexture = {
  hasVisiblePixels: boolean
  texture: DataTexture
}

type ParcelFillEdge = {
  end: Point2
  start: Point2
}

type PreparedParcelFill = {
  bounds: ParcelFillBounds
  edges: readonly ParcelFillEdge[]
  points: readonly Point2[]
}

type ParcelFillBounds = {
  maxX: number
  maxZ: number
  minX: number
  minZ: number
}

type DirtPathField = {
  junctions: readonly DirtPathJunction[]
  spans: readonly DirtPathSpan[]
}

type DirtPathSpan = {
  end: Point2
  halfWidth: number
  start: Point2
}

type DirtPathJunction = {
  point: Point2
  radius: number
}

export function WorldMultiplayerDirtCopyLayoutLayer({
  node,
  showGround,
  showParcels,
  showRoads,
}: {
  node: LandrushWorldNode
  showGround: boolean
  showParcels: boolean
  showRoads: boolean
}) {
  const groundFieldSize = GROUND_FIELD_PLANE_SIZE
  const parcelFieldSize = Math.max(
    groundFieldSize,
    finiteNumber(node.size.width, groundFieldSize),
    finiteNumber(node.size.depth, groundFieldSize),
  )
  const visibleRoads = showRoads ? node.roads.segments : []
  const dirtPathField = useMemo(
    () => (showRoads ? createDirtPathField(node.roads.segments) : null),
    [node.roads.segments, showRoads],
  )

  return (
    <>
      {showGround ? (
        <WorldMultiplayerGroundLayer
          fieldSize={groundFieldSize}
          perimeter={node.perimeter.points}
          roads={visibleRoads}
        />
      ) : null}
      {showParcels ? (
        <WorldMultiplayerParcelOverlayLayer
          boundary={node.perimeter.points}
          dirtPathField={dirtPathField}
          fieldSize={parcelFieldSize}
          parcels={node.parcels}
        />
      ) : null}
    </>
  )
}

function WorldMultiplayerGroundLayer({
  fieldSize,
  perimeter,
  roads,
}: {
  fieldSize: number
  perimeter: readonly Point2[]
  roads: readonly LandrushWorldNode['roads']['segments'][number][]
}) {
  const [grassTexture, dirtTexture, dirtAOTexture, dirtHeightTexture] = useTexture([
    STYLIZED_GRASS_TEXTURE_PATH,
    STYLIZED_DIRT_TEXTURE_PATH,
    STYLIZED_DIRT_AO_TEXTURE_PATH,
    STYLIZED_DIRT_HEIGHT_TEXTURE_PATH,
  ]) as Texture[]
  const maskTexture = useMemo(
    () =>
      createGroundFieldTexture({
        edgeFadeMeters: GROUND_EDGE_FADE_METERS,
        fieldSize,
        perimeter,
        resolution: GROUND_FIELD_RESOLUTION,
        roads: EMPTY_ROADS,
      }).texture,
    [fieldSize, perimeter],
  )
  const groundTextureOptions = useMemo<GroundTextureOptions>(
    () => ({
      dirtAOTexture: dirtAOTexture!,
      dirtHeightTexture: dirtHeightTexture!,
      dirtTexture: dirtTexture!,
      fieldSize,
      grassTexture: grassTexture!,
      maskTexture,
      roads,
      textureWorldSizeMeters: DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS,
    }),
    [dirtAOTexture, dirtHeightTexture, dirtTexture, fieldSize, grassTexture, maskTexture, roads],
  )
  const previewGroundTexture = useMemo(
    () =>
      createStylizedGroundTexture(
        groundTextureOptions,
        STYLIZED_GROUND_PREVIEW_TEXTURE_RESOLUTION,
      ),
    [groundTextureOptions],
  )
  const finalGroundTexture = useDeferredStylizedGroundTexture(
    groundTextureOptions,
    STYLIZED_GROUND_FINAL_TEXTURE_RESOLUTION,
  )
  const groundTexture = finalGroundTexture ?? previewGroundTexture

  useEffect(
    () => () => {
      if (previewGroundTexture.userData.landrushGeneratedStylizedGrassGround) {
        previewGroundTexture.dispose()
      }
    },
    [previewGroundTexture],
  )
  useEffect(
    () => () => {
      if (finalGroundTexture?.userData.landrushGeneratedStylizedGrassGround) {
        finalGroundTexture.dispose()
      }
    },
    [finalGroundTexture],
  )

  useEffect(() => () => maskTexture.dispose(), [maskTexture])

  return (
    <mesh position={[0, 0.018, 0]} renderOrder={2} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[fieldSize, fieldSize, 1, 1]} />
      <meshBasicMaterial
        depthWrite={false}
        map={groundTexture}
        opacity={0.96}
        side={DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}

function WorldMultiplayerParcelOverlayLayer({
  boundary,
  dirtPathField,
  fieldSize,
  parcels,
}: {
  boundary: readonly Point2[]
  dirtPathField: DirtPathField | null
  fieldSize: number
  parcels: LandrushWorldNode['parcels']
}) {
  const style = useMemo(() => normalizeParcelOverlayStyle(PARCEL_OVERLAY_STYLE), [])
  const fill = useMemo(
    () =>
      createParcelFillTexture(
        parcels.map((parcel) => ({ points: parcel.outline })),
        boundary,
        style,
        fieldSize,
        dirtPathField ? PARCEL_OVERLAY_PATH_PADDING_METERS : 0,
        dirtPathField,
      ),
    [boundary, dirtPathField, fieldSize, parcels, style],
  )

  useEffect(() => () => fill.texture.dispose(), [fill.texture])

  if (!fill.hasVisiblePixels) return null

  return (
    <mesh position={[0, 0.058, 0]} renderOrder={27} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[fieldSize, fieldSize, 1, 1]} />
      <meshBasicMaterial
        depthWrite={false}
        map={fill.texture}
        side={DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}

function createGroundFieldTexture({
  edgeFadeMeters,
  fieldSize,
  perimeter,
  resolution,
  roads,
}: {
  edgeFadeMeters: number
  fieldSize: number
  perimeter: readonly Point2[]
  resolution: number
  roads: readonly LandrushWorldNode['roads']['segments'][number][]
}): GroundFieldResult {
  const bytes = new Uint8Array(resolution * resolution * 4)
  const openPerimeter = openRing(perimeter)
  const patchOptions = {
    density: 0.82,
    edgeFadeMeters,
    patchSize: 24,
    patchSoftness: 0.18,
  }

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const world = {
        x: (x / (resolution - 1) - 0.5) * fieldSize,
        z: (y / (resolution - 1) - 0.5) * fieldSize,
      }
      const sample = sampleGrassFieldPoint(world, openPerimeter, roads, patchOptions)
      if (!sample) continue
      const index = (y * resolution + x) * 4
      bytes[index] = byte(sample.color[0] / 255)
      bytes[index + 1] = byte(sample.color[1] / 255)
      bytes[index + 2] = byte(sample.color[2] / 255)
      bytes[index + 3] = byte(sample.surfaceAlpha)
    }
  }

  const texture = new DataTexture(bytes, resolution, resolution, RGBAFormat)
  texture.flipY = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return { texture }
}

function sampleGrassFieldPoint(
  point: Point2,
  openPerimeter: readonly Point2[],
  roads: readonly LandrushWorldNode['roads']['segments'][number][],
  patchOptions: {
    density: number
    edgeFadeMeters: number
    patchSize: number
    patchSoftness: number
  },
): GrassFieldSample | null {
  if (!pointInPolygon(point, openPerimeter)) return null

  const shoreDistance = distanceToPolyline(point, openPerimeter)
  const roadDistance = distanceToRoads(point, roads)
  const roadFade = smoothstep(0.02, GRASS_ROAD_FEATHER_METERS, roadDistance)
  const region = organicGrassRegion(point)
  const shoreFade = edgeFade(shoreDistance, patchOptions.edgeFadeMeters)
  const highResolutionGrain = fbm(point.x * 0.096 + 3.1, point.z * 0.096 - 8.4)
  const broadMask = 0.82 + highResolutionGrain * 0.18
  const patchMask = grassPatchDensity(point, patchOptions, region.density)
  const density = clamp01(shoreFade * roadFade * broadMask * patchMask)
  const surfaceAlpha = clamp01(shoreFade * roadFade)
  const shade = 0.88 + density * 0.12 + region.highlight * 0.04
  const detail = 0.97 + noise(point.x * 0.24 + 18.5, point.z * 0.24 - 7.1) * 0.06
  const color = mixGrassColors(region.weights, shade * detail)

  return {
    color,
    colorIndex: region.colorIndex,
    density,
    detail: region.detail,
    roadDistance,
    shoreDistance,
    surfaceAlpha,
    transition: region.transition,
  }
}

function distanceToRoads(
  point: Point2,
  roads: readonly LandrushWorldNode['roads']['segments'][number][],
) {
  let best = Number.POSITIVE_INFINITY
  for (const road of roads) {
    const clearance = road.width / 2 + GRASS_ROAD_EDGE_PADDING_METERS
    best = Math.min(best, distanceToOpenPolyline(point, road.points) - clearance)
  }
  return best
}

function createStylizedGroundTexture({
  dirtAOTexture,
  dirtHeightTexture,
  dirtTexture,
  fieldSize,
  grassTexture,
  maskTexture,
  roads,
  textureWorldSizeMeters,
}: GroundTextureOptions, outputSize?: number): Texture {
  const prepared = prepareStylizedGroundTexture({
    dirtAOTexture,
    dirtHeightTexture,
    dirtTexture,
    fieldSize,
    grassTexture,
    maskTexture,
    roads,
    textureWorldSizeMeters,
  })
  if (!prepared) return maskTexture
  return createStylizedGroundCanvasTexture(
    prepared,
    outputSize ?? stylizedGroundTextureOutputSize(prepared.maskSize),
  )
}

function useDeferredStylizedGroundTexture(options: GroundTextureOptions, outputSize: number) {
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    setTexture(null)
    if (typeof window === 'undefined') return
    const prepared = prepareStylizedGroundTexture(options)
    if (!prepared) return

    let cancelled = false
    let timeoutId: number | null = null
    let frameId: number | null = null
    let row = 0
    const canvas = document.createElement('canvas')
    canvas.width = outputSize
    canvas.height = outputSize
    const context = canvas.getContext('2d')
    if (!context) return
    const output = context.createImageData(outputSize, outputSize)

    const step = () => {
      if (cancelled) return
      const startedAt = performance.now()
      while (row < outputSize && performance.now() - startedAt < 10) {
        paintStylizedGroundRow(output.data, row, outputSize, prepared)
        row += 1
      }
      if (row < outputSize) {
        frameId = window.requestAnimationFrame(step)
        return
      }

      context.putImageData(output, 0, 0)
      const generatedTexture = createStylizedGroundTextureFromCanvas(canvas)
      if (cancelled) {
        generatedTexture.dispose()
        return
      }
      setTexture(generatedTexture)
    }

    timeoutId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(step)
    }, 120)

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [options, outputSize])

  return texture
}

function prepareStylizedGroundTexture({
  dirtAOTexture,
  dirtHeightTexture,
  dirtTexture,
  fieldSize,
  grassTexture,
  maskTexture,
  roads,
  textureWorldSizeMeters,
}: GroundTextureOptions): PreparedStylizedGroundTexture | null {
  if (typeof document === 'undefined') return null
  const maskImage = maskTexture.image as
    | { data?: Uint8Array; height?: number; width?: number }
    | undefined
  const maskData = maskImage?.data
  const maskSize = maskImage?.width ?? 0
  if (!maskData || maskSize <= 1 || maskImage?.height !== maskSize) {
    maskTexture.userData.landrushStylizedGroundReason = 'invalid mask texture'
    return null
  }

  const grassSource = imageDataFromTexture(grassTexture)
  const dirtSource = imageDataFromTexture(dirtTexture)
  const dirtAOSource = imageDataFromTexture(dirtAOTexture)
  const dirtHeightSource = imageDataFromTexture(dirtHeightTexture)
  if (!grassSource || !dirtSource || !dirtAOSource || !dirtHeightSource) {
    maskTexture.userData.landrushStylizedGroundReason = 'source texture image data unavailable'
    return null
  }
  const pathGrid = createStylizedPathGrid(roads, fieldSize)
  const textureRepeat = fieldSize / normalizedStylizedTextureWorldSize(textureWorldSizeMeters)

  return {
    dirtAOSource,
    dirtHeightSource,
    dirtSource,
    fieldSize,
    grassSource,
    maskData,
    maskSize,
    pathGrid,
    textureRepeat,
  }
}

function createStylizedGroundCanvasTexture(
  prepared: PreparedStylizedGroundTexture,
  outputSize: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) return createFallbackDataTexture()
  const output = context.createImageData(outputSize, outputSize)

  for (let y = 0; y < outputSize; y += 1) {
    paintStylizedGroundRow(output.data, y, outputSize, prepared)
  }

  context.putImageData(output, 0, 0)
  return createStylizedGroundTextureFromCanvas(canvas)
}

function paintStylizedGroundRow(
  output: Uint8ClampedArray,
  y: number,
  outputSize: number,
  prepared: PreparedStylizedGroundTexture,
) {
  const {
    dirtAOSource,
    dirtHeightSource,
    dirtSource,
    fieldSize,
    grassSource,
    maskData,
    maskSize,
    pathGrid,
    textureRepeat,
  } = prepared

  for (let x = 0; x < outputSize; x += 1) {
    const index = (y * outputSize + x) * 4
    const u = x / (outputSize - 1)
    const v = y / (outputSize - 1)
    const mask = sampleMaskRgba(maskData, maskSize, u, v)
    const alpha = mask[3]
    if (alpha <= 0) continue

    const worldPoint = {
      x: (u - 0.5) * fieldSize,
      z: (v - 0.5) * fieldSize,
    }
    const warpX = (stylizedGroundNoise(u * 7.1 + 2.4, v * 7.1 - 1.7) - 0.5) * 0.045
    const warpY = (stylizedGroundNoise(u * 6.4 - 4.1, v * 6.4 + 5.9) - 0.5) * 0.045
    const rawGrass = sampleRepeatedRgb(grassSource, u, v, textureRepeat, warpX, warpY)
    const grassColor = stylizedGrassGroundColor(rawGrass, [mask[0], mask[1], mask[2]], u, v)
    const pathWeight = stylizedPathWeight(worldPoint, pathGrid, u, v)
    let color = grassColor

    if (pathWeight > 0.001) {
      const dirtWarpX = (stylizedGroundNoise(u * 4.8 - 6.2, v * 4.8 + 3.5) - 0.5) * 0.028
      const dirtWarpY = (stylizedGroundNoise(u * 5.5 + 8.9, v * 5.5 - 1.2) - 0.5) * 0.028
      const rawDirt = sampleRepeatedRgb(dirtSource, u, v, textureRepeat, dirtWarpX, dirtWarpY)
      const dirtAO = sampleRepeatedChannel(
        dirtAOSource,
        u,
        v,
        textureRepeat,
        dirtWarpX,
        dirtWarpY,
      )
      const dirtHeight = sampleRepeatedChannel(
        dirtHeightSource,
        u,
        v,
        textureRepeat,
        dirtWarpX,
        dirtWarpY,
      )
      const dirtColor = stylizedDirtGroundColor(rawDirt, dirtAO, dirtHeight, u, v)
      color = mixRgbBytes(
        grassColor,
        dirtColor,
        stylizedHeightAdjustedPathWeight(pathWeight, dirtHeight),
      )
    }

    output[index] = byte255(color[0])
    output[index + 1] = byte255(color[1])
    output[index + 2] = byte255(color[2])
    output[index + 3] = alpha
  }
}

function createStylizedGroundTextureFromCanvas(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.flipY = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = true
  texture.userData.landrushGeneratedStylizedGrassGround = true
  texture.userData.landrushStylizedGroundReason = 'generated'
  texture.needsUpdate = true
  return texture
}

function createFallbackDataTexture() {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat)
  texture.needsUpdate = true
  return texture
}

function imageDataFromTexture(texture: Texture): TextureImageData | null {
  const image = texture.image as CanvasImageSource | undefined
  if (!image) return null
  const imageSize = imageCanvasSize(image)
  if (imageSize.width <= 1 || imageSize.height <= 1) return null
  const canvas = document.createElement('canvas')
  canvas.width = imageSize.width
  canvas.height = imageSize.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, imageSize.width, imageSize.height)
  return { ...imageSize, data: context.getImageData(0, 0, imageSize.width, imageSize.height).data }
}

function imageCanvasSize(image: CanvasImageSource) {
  const sizedImage = image as {
    height?: number
    naturalHeight?: number
    naturalWidth?: number
    width?: number
  }
  return {
    height: Math.max(0, Math.round(sizedImage.naturalHeight ?? sizedImage.height ?? 0)),
    width: Math.max(0, Math.round(sizedImage.naturalWidth ?? sizedImage.width ?? 0)),
  }
}

function stylizedGroundTextureOutputSize(maskSize: number) {
  return maskSize >= 512
    ? STYLIZED_GROUND_FINAL_TEXTURE_RESOLUTION
    : STYLIZED_GROUND_PREVIEW_TEXTURE_RESOLUTION
}

function createStylizedPathGrid(
  roads: readonly LandrushWorldNode['roads']['segments'][number][],
  fieldSize: number,
): StylizedPathGrid | null {
  const spans: StylizedPathSpan[] = []
  for (const road of roads) {
    const halfWidth = (Math.max(0.1, road.width) * STYLIZED_PATH_WIDTH_SCALE) / 2
    const padding = halfWidth + STYLIZED_PATH_EDGE_FEATHER_METERS + STYLIZED_PATH_EDGE_NOISE_METERS
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      spans.push({
        end,
        halfWidth,
        maxX: Math.max(start.x, end.x) + padding,
        maxZ: Math.max(start.z, end.z) + padding,
        minX: Math.min(start.x, end.x) - padding,
        minZ: Math.min(start.z, end.z) - padding,
        start,
      })
    }
  }
  if (spans.length === 0) return null

  const cellsPerAxis = Math.max(16, Math.min(64, Math.ceil(fieldSize / 4)))
  const cells = Array.from({ length: cellsPerAxis * cellsPerAxis }, () => [] as StylizedPathSpan[])
  for (const span of spans) {
    const minCellX = stylizedPathCellIndex(span.minX, fieldSize, cellsPerAxis)
    const maxCellX = stylizedPathCellIndex(span.maxX, fieldSize, cellsPerAxis)
    const minCellZ = stylizedPathCellIndex(span.minZ, fieldSize, cellsPerAxis)
    const maxCellZ = stylizedPathCellIndex(span.maxZ, fieldSize, cellsPerAxis)
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        cells[cellZ * cellsPerAxis + cellX]?.push(span)
      }
    }
  }

  return { cells, cellsPerAxis, fieldSize }
}

function stylizedPathWeight(point: Point2, pathGrid: StylizedPathGrid | null, u: number, v: number) {
  if (!pathGrid) return 0
  const spans = stylizedPathSpansNearPoint(point, pathGrid)
  if (spans.length === 0) return 0
  const signedDistance = signedDistanceToStylizedSpans(point, spans)
  if (!Number.isFinite(signedDistance)) return 0
  const edgeNoise =
    (stylizedGroundNoise(u * 18.2 + 4.6, v * 18.9 - 8.4) - 0.5) * STYLIZED_PATH_EDGE_NOISE_METERS
  return (
    1 -
    smoothstep(
      -STYLIZED_PATH_EDGE_FEATHER_METERS * 0.35,
      STYLIZED_PATH_EDGE_FEATHER_METERS,
      signedDistance + edgeNoise,
    )
  )
}

function stylizedPathSpansNearPoint(point: Point2, pathGrid: StylizedPathGrid) {
  const cellX = stylizedPathCellIndex(point.x, pathGrid.fieldSize, pathGrid.cellsPerAxis)
  const cellZ = stylizedPathCellIndex(point.z, pathGrid.fieldSize, pathGrid.cellsPerAxis)
  return pathGrid.cells[cellZ * pathGrid.cellsPerAxis + cellX] ?? []
}

function stylizedPathCellIndex(value: number, fieldSize: number, cellsPerAxis: number) {
  return Math.max(
    0,
    Math.min(cellsPerAxis - 1, Math.floor((value / fieldSize + 0.5) * cellsPerAxis)),
  )
}

function signedDistanceToStylizedSpans(point: Point2, spans: readonly StylizedPathSpan[]) {
  let signedDistance = Number.POSITIVE_INFINITY
  for (const span of spans) {
    signedDistance = Math.min(
      signedDistance,
      distanceToSegment(point, span.start, span.end) - span.halfWidth,
    )
  }
  return signedDistance
}

function normalizeParcelOverlayStyle(
  options: ParcelOverlayStyle,
): NormalizedParcelOverlayStyle {
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
  parcels: readonly { points: readonly Point2[] }[],
  boundary: readonly Point2[],
  style: NormalizedParcelOverlayStyle,
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

function containingPreparedParcel(
  parcels: readonly PreparedParcelFill[],
  point: Point2,
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

function parcelFillEdges(
  points: readonly Point2[],
  boundary: readonly Point2[],
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

function edgeRunsAlongBoundary(start: Point2, end: Point2, boundary: readonly Point2[]) {
  return distanceToPolygonEdges(midpoint2(start, end), boundary) <= PARCEL_BOUNDARY_EDGE_THRESHOLD_METERS
}

function createDirtPathField(
  roads: readonly LandrushWorldNode['roads']['segments'][number][],
): DirtPathField {
  const spans = roads.flatMap((road) => {
    const halfWidth = (Math.max(0.1, road.width) * STYLIZED_PATH_WIDTH_SCALE) / 2
    return road.points.slice(0, -1).flatMap((start, index) => {
      const end = road.points[index + 1]
      return end && distance2(start, end) > 0.001 ? [{ end, halfWidth, start }] : []
    })
  })
  const junctions = dirtPathJunctions(spans)
  return { junctions, spans }
}

function dirtPathJunctions(spans: readonly DirtPathSpan[]): readonly DirtPathJunction[] {
  const nodes = new Map<string, { maxHalfWidth: number; point: Point2; count: number }>()
  for (const span of spans) {
    for (const point of [span.start, span.end]) {
      const id = pointKey(point)
      const node = nodes.get(id) ?? { count: 0, maxHalfWidth: 0, point }
      node.count += 1
      node.maxHalfWidth = Math.max(node.maxHalfWidth, span.halfWidth)
      nodes.set(id, node)
    }
  }
  return [...nodes.values()]
    .filter((node) => node.count > 1)
    .map((node) => ({ point: node.point, radius: node.maxHalfWidth }))
}

function signedDistanceToDirtPath(point: Point2, pathField: DirtPathField) {
  let signedDistance = Number.POSITIVE_INFINITY
  for (const span of pathField.spans) {
    signedDistance = smoothMinDistance(
      signedDistance,
      signedDistanceToPathSpan(point, span),
      0.18,
    )
  }
  for (const junction of pathField.junctions) {
    signedDistance = smoothMinDistance(
      signedDistance,
      distance2(point, junction.point) - junction.radius,
      0.18,
    )
  }
  return signedDistance
}

function signedDistanceToPathSpan(point: Point2, span: DirtPathSpan) {
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

function organicGrassRegion(point: Point2) {
  const warp = {
    x: (fbm(point.x * 0.011 + 5.4, point.z * 0.011 - 9.2) - 0.5) * 15,
    z: (fbm(point.x * 0.011 - 3.7, point.z * 0.011 + 11.8) - 0.5) * 15,
  }
  const nx = (point.x + warp.x) * 0.018
  const nz = (point.z + warp.z) * 0.018
  const scores = [
    fbm(nx + 2.4, nz - 7.1),
    fbm(nx * 0.94 - 6.6, nz * 1.08 + 3.2),
    fbm(nx * 1.12 + 8.4, nz * 0.88 - 4.6),
    fbm(nx * 0.82 - 11.5, nz * 0.95 + 9.7),
  ]
  const sorted = [...scores].sort((a, b) => b - a)
  const transition = 1 - smoothstep(0.08, 0.28, sorted[0]! - sorted[1]!)
  const weights = mixWeights(
    softmax(scores, GRASS_REGION_CORE_SHARPNESS),
    softmax(scores, GRASS_REGION_BLEND_SHARPNESS),
    transition,
  )
  let colorIndex: 0 | 1 | 2 | 3 = 0
  for (let index = 1; index < weights.length; index += 1) {
    if (weights[index]! > weights[colorIndex]!) colorIndex = index as 0 | 1 | 2 | 3
  }
  const detail = fbm(nx * 1.68 - 2.2, nz * 1.68 + 0.9)
  const density = smoothstep(0.24, 0.84, scores[colorIndex]! * 0.72 + detail * 0.28)
  const highlight = smoothstep(0.48, 0.86, weights[3]! * 0.55 + detail * 0.45)
  return { colorIndex, density, detail, highlight, transition, weights }
}

function grassPatchDensity(
  point: Point2,
  patchOptions: { density: number; patchSize: number; patchSoftness: number },
  regionDensity: number,
) {
  const coverage = clamp01(patchOptions.density)
  const patchSize = Math.max(4, patchOptions.patchSize)
  const warpStrength = patchSize * 0.62
  const warped = {
    x: point.x + (fbm(point.x * 0.012 + 31.4, point.z * 0.012 - 18.2) - 0.5) * warpStrength,
    z: point.z + (fbm(point.x * 0.012 - 7.8, point.z * 0.012 + 42.6) - 0.5) * warpStrength,
  }
  const broadPatch = fbm(
    warped.x / Math.max(1, patchSize * 2.25) + 6.8,
    warped.z / Math.max(1, patchSize * 1.75) - 9.1,
  )
  const texturePatch = fbm(
    warped.x / Math.max(1, patchSize * 0.78) - 2.7,
    warped.z / Math.max(1, patchSize * 0.66) + 13.4,
  )
  const ridgePatch = ridgedFbm(
    warped.x / Math.max(1, patchSize * 1.08) + 21.7,
    warped.z / Math.max(1, patchSize * 0.84) - 15.2,
  )
  const fineBreakup = noise(warped.x * 0.24 + 5.5, warped.z * 0.24 - 6.3)
  const patchSignal = clamp01(
    broadPatch * 0.34 + texturePatch * 0.34 + ridgePatch * 0.22 + fineBreakup * 0.1,
  )
  const patchThreshold = lerp(0.76, 0.2, coverage)
  const patchFeather = Math.max(0.04, patchOptions.patchSoftness)
  const patchFill = smoothstep(patchThreshold, patchThreshold + patchFeather, patchSignal)
  const patchCore = smoothstep(
    patchThreshold + patchFeather * 0.75,
    patchThreshold + patchFeather + 0.12,
    patchSignal,
  )
  const patchPresence = patchFill * 0.42 + patchCore * 0.58
  const densityStrength = smoothstep(0.08, 0.55, coverage)
  const regionalPresence = 0.78 + smoothstep(0.18, 0.86, regionDensity) * 0.22
  return clamp01(patchPresence * regionalPresence * densityStrength)
}

function edgeFade(distance: number, meters: number) {
  const fadeMeters = Math.max(0, meters)
  const fadeStartMeters = Math.min(0.7, fadeMeters * 0.25)
  return fadeMeters <= 0.001 ? 1 : smoothstep(fadeStartMeters, fadeMeters, distance)
}

function mixGrassColors(weights: readonly number[], shade: number): RgbByte {
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < GRASS_COLORS.length; index += 1) {
    const color = GRASS_COLORS[index]!
    const weight = weights[index] ?? 0
    red += color[0] * weight
    green += color[1] * weight
    blue += color[2] * weight
  }
  return [red * shade, green * shade, blue * shade]
}

function stylizedGrassGroundColor(raw: RgbByte, mask: RgbByte, u: number, v: number): RgbByte {
  const referenceRoot: RgbByte = [106, 161, 79]
  const referenceTip: RgbByte = [161, 204, 51]
  const referenceWarm: RgbByte = [232, 232, 79]
  const referenceCool: RgbByte = [116, 160, 34]
  const lightNoise =
    stylizedGroundNoise(u * 5.2 + 1.8, v * 5.2 - 3.5) * 0.65 +
    stylizedGroundNoise(u * 15.4 - 2.2, v * 14.2 + 8.1) * 0.35
  let color = mixRgbBytes(raw, referenceRoot, 0.18)
  color = mixRgbBytes(color, referenceTip, Math.max(0, lightNoise - 0.36) * 0.24)
  color = mixRgbBytes(color, referenceWarm, Math.max(0, lightNoise - 0.68) * 0.18)
  color = mixRgbBytes(color, referenceCool, Math.max(0, 0.32 - lightNoise) * 0.14)
  color = mixRgbBytes(color, mask, 0.06)
  return scaleRgbBytes(color, 1.08)
}

function stylizedDirtGroundColor(
  raw: RgbByte,
  ambientOcclusion: number,
  height: number,
  u: number,
  v: number,
): RgbByte {
  const warmTan: RgbByte = [214, 164, 121]
  const sunlitTan: RgbByte = [236, 197, 153]
  const coolShadow: RgbByte = [143, 116, 88]
  const ao = clamp01(ambientOcclusion / 255)
  const heightValue = clamp01(height / 255)
  const broadNoise =
    stylizedGroundNoise(u * 3.2 + 11.7, v * 3.2 - 4.3) * 0.7 +
    stylizedGroundNoise(u * 11.6 - 5.8, v * 10.9 + 7.2) * 0.3
  const fineNoise = stylizedGroundNoise(u * 38.2 + 1.4, v * 39.8 - 9.1)
  const crackShadow = (1 - smoothstep(0.26, 0.54, heightValue)) * (1 - ao * 0.45)
  const stoneHighlight = smoothstep(0.54, 0.86, heightValue)
  const ambientShade = lerp(0.5, 1.05, ao)
  const heightShade = lerp(0.78, 1.16, heightValue)
  let color = mixRgbBytes(raw, warmTan, 0.08)
  color = scaleRgbBytes(color, ambientShade * heightShade * (1 + (fineNoise - 0.5) * 0.05))
  color = mixRgbBytes(
    color,
    coolShadow,
    clamp01(crackShadow * 0.58 + Math.max(0, 0.42 - broadNoise) * 0.12),
  )
  color = mixRgbBytes(color, sunlitTan, stoneHighlight * Math.max(0, broadNoise - 0.42) * 0.16)
  return color
}

function stylizedHeightAdjustedPathWeight(pathWeight: number, height: number) {
  const heightValue = clamp01(height / 255)
  const edgeFactor = 1 - Math.abs(pathWeight * 2 - 1)
  return clamp01(pathWeight + (heightValue - 0.5) * 0.32 * edgeFactor)
}

function sampleMaskRgba(
  source: Uint8Array,
  size: number,
  u: number,
  v: number,
): readonly [number, number, number, number] {
  const sampleX = clamp01(u) * (size - 1)
  const sampleY = clamp01(v) * (size - 1)
  const x0 = Math.floor(sampleX)
  const y0 = Math.floor(sampleY)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const tx = sampleX - x0
  const ty = sampleY - y0
  return [
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 0),
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 1),
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 2),
    sampleBilinearChannel(source, size, size, x0, y0, x1, y1, tx, ty, 3),
  ]
}

function sampleRepeatedRgb(
  source: TextureImageData,
  u: number,
  v: number,
  repeat: number,
  warpX: number,
  warpY: number,
): RgbByte {
  const { tx, ty, x0, x1, y0, y1 } = repeatedTextureSample(source, u, v, repeat, warpX, warpY)
  return [
    sampleBilinearChannel(source.data, source.width, source.height, x0, y0, x1, y1, tx, ty, 0),
    sampleBilinearChannel(source.data, source.width, source.height, x0, y0, x1, y1, tx, ty, 1),
    sampleBilinearChannel(source.data, source.width, source.height, x0, y0, x1, y1, tx, ty, 2),
  ]
}

function sampleRepeatedChannel(
  source: TextureImageData,
  u: number,
  v: number,
  repeat: number,
  warpX: number,
  warpY: number,
) {
  const { tx, ty, x0, x1, y0, y1 } = repeatedTextureSample(source, u, v, repeat, warpX, warpY)
  return sampleBilinearChannel(source.data, source.width, source.height, x0, y0, x1, y1, tx, ty, 0)
}

function repeatedTextureSample(
  source: TextureImageData,
  u: number,
  v: number,
  repeat: number,
  warpX: number,
  warpY: number,
) {
  const sampleX = fractional(u * repeat + warpX) * (source.width - 1)
  const sampleY = fractional(v * repeat + warpY) * (source.height - 1)
  const x0 = Math.floor(sampleX)
  const y0 = Math.floor(sampleY)
  return {
    tx: sampleX - x0,
    ty: sampleY - y0,
    x0,
    x1: Math.min(source.width - 1, x0 + 1),
    y0,
    y1: Math.min(source.height - 1, y0 + 1),
  }
}

function sampleBilinearChannel(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tx: number,
  ty: number,
  channel: number,
) {
  const topLeft = source[(y0 * width + x0) * 4 + channel] ?? 0
  const topRight = source[(y0 * width + x1) * 4 + channel] ?? 0
  const bottomLeft = source[(y1 * width + x0) * 4 + channel] ?? 0
  const bottomRight = source[(y1 * width + x1) * 4 + channel] ?? 0
  return lerp(lerp(topLeft, topRight, tx), lerp(bottomLeft, bottomRight, tx), ty)
}

function boundsForPoints(points: readonly Point2[]): ParcelFillBounds {
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

function distanceToEdges(point: Point2, edges: readonly ParcelFillEdge[]) {
  let distance = Number.POSITIVE_INFINITY
  for (const edge of edges) {
    distance = Math.min(distance, distanceToSegment(point, edge.start, edge.end))
  }
  return distance
}

function distanceToPolygonEdges(point: Point2, polygon: readonly Point2[]) {
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (start && end) distance = Math.min(distance, distanceToSegment(point, start, end))
  }
  return Number.isFinite(distance) ? distance : 0
}

function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
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

function distanceToPolyline(point: Point2, polygon: readonly Point2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToOpenPolyline(point: Point2, polyline: readonly Point2[]) {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (start && end) best = Math.min(best, distanceToSegment(point, start, end))
  }
  return best
}

function distanceToSegment(point: Point2, start: Point2, end: Point2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.z - start.z)
  const t = clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function softmax(values: readonly number[], sharpness: number) {
  const maxValue = Math.max(...values)
  const weighted = values.map((value) => Math.exp((value - maxValue) * sharpness))
  const total = weighted.reduce((sum, value) => sum + value, 0) || 1
  return weighted.map((value) => value / total)
}

function mixWeights(a: readonly number[], b: readonly number[], t: number) {
  const weights = a.map((value, index) => lerp(value, b[index] ?? 0, t))
  const total = weights.reduce((sum, value) => sum + value, 0) || 1
  return weights.map((value) => value / total)
}

function ridgedFbm(x: number, z: number) {
  const value =
    Math.abs(noise(x, z) * 2 - 1) * 0.5 +
    Math.abs(noise(x * 1.93 + 8.1, z * 2.07 - 2.2) * 2 - 1) * 0.32 +
    Math.abs(noise(x * 3.9 - 7.3, z * 4.15 + 5.9) * 2 - 1) * 0.18
  return 1 - clamp01(value)
}

function fbm(x: number, z: number) {
  return (
    noise(x, z) * 0.55 +
    noise(x * 2.03 + 8.1, z * 2.03 - 2.2) * 0.3 +
    noise(x * 4.1 - 7.3, z * 4.1 + 5.9) * 0.15
  )
}

function noise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(hash(ix, iz), hash(ix + 1, iz), ux),
    lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), ux),
    uz,
  )
}

function stylizedGroundNoise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(hash(ix, iz), hash(ix + 1, iz), ux),
    lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), ux),
    uz,
  )
}

function smoothMinDistance(first: number, second: number, amount: number) {
  if (!Number.isFinite(first)) return second
  if (!Number.isFinite(second)) return first
  const h = clamp01(0.5 + (0.5 * (second - first)) / Math.max(amount, 0.000001))
  return lerp(second, first, h) - amount * h * (1 - h)
}

function openRing(points: readonly Point2[]) {
  const first = points[0]
  const last = points[points.length - 1]
  return first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.001
    ? points.slice(0, -1)
    : [...points]
}

function colorToRgb(value: string) {
  const color = new Color(value)
  return { b: color.b, g: color.g, r: color.r }
}

function normalizedStylizedTextureWorldSize(value: number) {
  return Number.isFinite(value)
    ? Math.max(MIN_STYLIZED_TEXTURE_WORLD_SIZE_METERS, value)
    : DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS
}

function mixRgbBytes(first: RgbByte, second: RgbByte, amount: number): RgbByte {
  const t = clamp01(amount)
  return [lerp(first[0], second[0], t), lerp(first[1], second[1], t), lerp(first[2], second[2], t)]
}

function scaleRgbBytes(color: RgbByte, scale: number): RgbByte {
  return [color[0] * scale, color[1] * scale, color[2] * scale]
}

function midpoint2(first: Point2, second: Point2): Point2 {
  return { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 }
}

function pointKey(point: Point2) {
  return `${Math.round(point.x * 100)}:${Math.round(point.z * 100)}`
}

function distance2(first: Point2, second: Point2) {
  return Math.hypot(first.x - second.x, first.z - second.z)
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function byte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function byte255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function fractional(value: number) {
  return value - Math.floor(value)
}

function hash(x: number, z: number) {
  return fractional(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123)
}
