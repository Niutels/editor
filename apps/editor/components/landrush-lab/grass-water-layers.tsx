'use client'

import { useTexture } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
} from 'three'
import type { LandrushRoadSegment, LandrushTree } from '@/components/landrush/types'
import { BrunoTreeLayer, type BrunoTreeReference } from './bruno-tree-layers'
import { createGrassBladeColorGeometry } from './grass-blade-geometry'
import {
  createGrassFieldTexture,
  createGrassFieldTextureFromData,
  GRASS_FIELD_PLANE_SIZE,
  type GrassFieldBlocker,
} from './grass-field-texture'
import type { GrassBladeTuning } from './grass-material'
import {
  type StylizedGrassInteractionRef,
  StylizedSceneLandLayer,
} from './stylized-scene-land-layers'
import type { WaterLandSurface } from './water-scene'

type GrassWaterLandLayersProps = {
  bladeFadeBlockers?: readonly GrassFieldBlocker[]
  bladeSubdivisions?: number
  bladeGrassBlockers?: readonly GrassFieldBlocker[]
  bladeRenderOrder?: number
  fieldResolution?: number
  finalFieldResolution?: number
  finalSpawnResolution?: number
  grassBlockers?: readonly GrassFieldBlocker[]
  grassInteractionRef?: StylizedGrassInteractionRef
  groundRenderOrder?: number
  profileMeasure?: ProfileMeasure
  roads?: readonly LandrushRoadSegment[]
  showBlades?: boolean
  showGround?: boolean
  showTrees?: boolean
  spawnResolution?: number
  stylizedGroundTexture?: boolean
  stylizedSceneLayout?: boolean
  stylizedGroundTextureWorldSizeMeters?: number
  surface: WaterLandSurface
  tuning: GrassBladeTuning
}

type GrassGroundLayerProps = {
  elevation: number
  profileMeasure?: ProfileMeasure
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
  stylizedTexture: boolean
  stylizedTextureWorldSizeMeters: number
  texture: Texture
}

type GrassBladeLayerWebGPUProps = {
  bladeSubdivisions?: number
  colorTexture?: Texture
  elevation: number
  fieldTexture: Texture
  profileMeasure?: ProfileMeasure
  renderOrder: number
  tuning: GrassBladeTuning
}

type ProfileMeasure = <T>(id: string, callback: () => T) => T

const GRASS_WATER_EDGE_FADE_METERS = 0
const GRASS_TREE_CELL_METERS = 5.8
const GRASS_TREE_MIN_ALPHA = 0.12
const GRASS_TREE_MIN_COUNT = 7
const GRASS_TREE_MAX_COUNT = 34
const EMPTY_GRASS_ROADS: readonly LandrushRoadSegment[] = []
const STYLIZED_GRASS_TEXTURE_PATH =
  '/landrush-lab/stylized-scene/grass_texture/grass_05_basecolor_1k.webp'
const STYLIZED_DIRT_TEXTURE_PATH =
  '/landrush-lab/stylized-scene/ground_texture/ground_07_4k/ground_07__basecolor_1k.webp'
const STYLIZED_DIRT_AO_TEXTURE_PATH =
  '/landrush-lab/stylized-scene/ground_texture/ground_07_4k/ground_07__ambientocclusion_1k.webp'
const STYLIZED_DIRT_HEIGHT_TEXTURE_PATH =
  '/landrush-lab/stylized-scene/ground_texture/ground_07_4k/ground_07__height_1k.webp'
const DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS = 5
const MIN_STYLIZED_TEXTURE_WORLD_SIZE_METERS = 0.001
const STYLIZED_GROUND_PREVIEW_TEXTURE_RESOLUTION = 512
const STYLIZED_GROUND_FINAL_TEXTURE_RESOLUTION = 1024
const STYLIZED_PATH_EDGE_FEATHER_METERS = 0.48
const STYLIZED_PATH_EDGE_NOISE_METERS = 0.18
const STYLIZED_PATH_WIDTH_SCALE = 1.08
const GRASS_GROUND_RENDER_ORDER = 12
const GRASS_BLADE_RENDER_ORDER = 13
const STYLIZED_GRASS_BLADE_RENDER_ORDER = 14

export function GrassWaterLandLayers({
  bladeFadeBlockers = [],
  bladeSubdivisions,
  bladeGrassBlockers,
  bladeRenderOrder,
  fieldResolution,
  finalFieldResolution,
  finalSpawnResolution,
  grassBlockers = [],
  grassInteractionRef,
  groundRenderOrder = GRASS_GROUND_RENDER_ORDER,
  profileMeasure,
  roads = EMPTY_GRASS_ROADS,
  showBlades = true,
  showGround = true,
  showTrees = true,
  spawnResolution,
  stylizedGroundTexture = false,
  stylizedSceneLayout = false,
  stylizedGroundTextureWorldSizeMeters = DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS,
  surface,
  tuning,
}: GrassWaterLandLayersProps) {
  const classicFoliageEnabled = !stylizedSceneLayout && (showBlades || showTrees)
  const groundFieldNeeded = showGround || classicFoliageEnabled
  const spawnFieldNeeded = classicFoliageEnabled
  const groundResolution = groundFieldNeeded ? fieldResolution : 2
  const groundFinalResolution = groundFieldNeeded ? (finalFieldResolution ?? fieldResolution) : 2
  const spawnPreviewResolution = spawnFieldNeeded ? (spawnResolution ?? fieldResolution) : 2
  const spawnFinalResolution = spawnFieldNeeded
    ? (finalSpawnResolution ?? spawnPreviewResolution)
    : 2
  const groundTextureRoads = stylizedGroundTexture ? EMPTY_GRASS_ROADS : roads
  const resolvedBladeGrassBlockers = bladeGrassBlockers ?? grassBlockers
  const resolvedBladeRenderOrder =
    bladeRenderOrder ??
    (stylizedSceneLayout ? STYLIZED_GRASS_BLADE_RENDER_ORDER : GRASS_BLADE_RENDER_ORDER)
  const groundField = useMemo(
    () =>
      measure(profileMeasure, 'setup.grass.ground-field-texture', () =>
        createGrassFieldTexture({
          alphaMode: 'surface',
          blockers: grassBlockers,
          density: tuning.density,
          edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
          patchSize: tuning.patchSize,
          patchSoftness: tuning.patchSoftness,
          perimeter: surface.grassSurfacePoints,
          planeSize: GRASS_FIELD_PLANE_SIZE,
          profileMeasure,
          profileScope: 'setup.grass.ground-field-texture',
          resolution: groundResolution,
          roads: groundTextureRoads,
        }),
      ),
    [
      groundResolution,
      grassBlockers,
      groundTextureRoads,
      profileMeasure,
      surface.grassSurfacePoints,
      tuning.density,
      tuning.patchSize,
      tuning.patchSoftness,
    ],
  )
  const asyncGroundField = useAsyncGrassFieldTexture({
    alphaMode: 'surface',
    blockers: grassBlockers,
    density: tuning.density,
    edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
    patchSize: tuning.patchSize,
    patchSoftness: tuning.patchSoftness,
    perimeter: surface.grassSurfacePoints,
    profileMeasure,
    resolution: groundFinalResolution,
    roads: groundTextureRoads,
    shouldGenerate:
      groundFieldNeeded &&
      typeof groundFinalResolution === 'number' &&
      groundFinalResolution !== groundResolution,
  })
  const renderedGroundField = asyncGroundField ?? groundField
  const spawnPreviewField = useMemo(
    () =>
      measure(profileMeasure, 'setup.grass.spawn-field-texture', () =>
        createGrassFieldTexture({
          blockers: resolvedBladeGrassBlockers,
          density: tuning.density,
          edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
          patchSize: tuning.patchSize,
          patchSoftness: tuning.patchSoftness,
          perimeter: surface.grassSurfacePoints,
          planeSize: GRASS_FIELD_PLANE_SIZE,
          profileMeasure,
          profileScope: 'setup.grass.spawn-field-texture',
          resolution: spawnPreviewResolution,
          roads,
        }),
      ),
    [
      spawnPreviewResolution,
      profileMeasure,
      resolvedBladeGrassBlockers,
      roads,
      surface.grassSurfacePoints,
      tuning.density,
      tuning.patchSize,
      tuning.patchSoftness,
    ],
  )
  const asyncSpawnField = useAsyncGrassFieldTexture({
    alphaMode: 'density',
    blockers: resolvedBladeGrassBlockers,
    density: tuning.density,
    edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
    patchSize: tuning.patchSize,
    patchSoftness: tuning.patchSoftness,
    perimeter: surface.grassSurfacePoints,
    profileMeasure,
    resolution: spawnFinalResolution,
    roads,
    shouldGenerate:
      spawnFieldNeeded &&
      typeof spawnFinalResolution === 'number' &&
      spawnFinalResolution !== spawnPreviewResolution,
  })
  const spawnField = asyncSpawnField ?? spawnPreviewField
  const treeReferences = useMemo(() => {
    if (!showTrees || stylizedSceneLayout) return []
    return measure(profileMeasure, 'setup.grass.tree-references', () =>
      createGrassTextureTreeReferences({
        density: tuning.density,
        elevation: surface.grassSurfaceElevation,
        fieldSize: GRASS_FIELD_PLANE_SIZE,
        fieldTexture: spawnField.texture,
      }),
    )
  }, [
    profileMeasure,
    showTrees,
    spawnField.texture,
    stylizedSceneLayout,
    surface.grassSurfaceElevation,
    tuning.density,
  ])

  useEffect(() => () => groundField.texture.dispose(), [groundField.texture])
  useEffect(() => () => spawnPreviewField.texture.dispose(), [spawnPreviewField.texture])

  return (
    <>
      {showGround ? (
        <GrassGroundLayer
          elevation={surface.grassSurfaceElevation}
          profileMeasure={profileMeasure}
          renderOrder={groundRenderOrder}
          roads={roads}
          stylizedTexture={stylizedGroundTexture}
          stylizedTextureWorldSizeMeters={stylizedGroundTextureWorldSizeMeters}
          texture={renderedGroundField.texture}
        />
      ) : null}
      {stylizedSceneLayout ? (
        <Suspense fallback={null}>
          <StylizedSceneLandLayer
            elevation={surface.grassSurfaceElevation}
            grassFadeBlockers={bladeFadeBlockers}
            grassInteractionRef={grassInteractionRef}
            grassBlockers={resolvedBladeGrassBlockers}
            profileMeasure={profileMeasure}
            roads={roads}
            grassRenderOrder={resolvedBladeRenderOrder}
            showBlades={showBlades}
            showTrees={showTrees}
            surfacePoints={surface.grassSurfacePoints}
            tuning={tuning}
          />
        </Suspense>
      ) : showBlades ? (
        <GrassBladeLayerWebGPU
          bladeSubdivisions={bladeSubdivisions}
          colorTexture={renderedGroundField.texture}
          elevation={surface.grassSurfaceElevation}
          fieldTexture={spawnField.texture}
          profileMeasure={profileMeasure}
          renderOrder={resolvedBladeRenderOrder}
          tuning={tuning}
        />
      ) : null}
      {!stylizedSceneLayout && showTrees ? (
        <Suspense fallback={null}>
          <BrunoTreeLayer
            colorTexture={renderedGroundField.texture}
            fieldSize={GRASS_FIELD_PLANE_SIZE}
            references={treeReferences}
            tuning={tuning}
          />
        </Suspense>
      ) : null}
    </>
  )
}

type GrassFieldTextureResult = ReturnType<typeof createGrassFieldTexture>

function useAsyncGrassFieldTexture({
  alphaMode,
  blockers,
  density,
  edgeFadeMeters,
  patchSize,
  patchSoftness,
  perimeter,
  profileMeasure,
  resolution,
  roads,
  shouldGenerate,
}: {
  alphaMode: 'density' | 'surface'
  blockers: readonly GrassFieldBlocker[]
  density: number
  edgeFadeMeters: number
  patchSize: number
  patchSoftness: number
  perimeter: WaterLandSurface['grassSurfacePoints']
  profileMeasure?: ProfileMeasure
  resolution?: number
  roads: readonly LandrushRoadSegment[]
  shouldGenerate: boolean
}) {
  const [field, setField] = useState<GrassFieldTextureResult | null>(null)

  useEffect(() => {
    setField(null)
    if (!shouldGenerate || !resolution || typeof Worker === 'undefined') return

    let cancelled = false
    const worker = new Worker('/landrush-lab/grass-field-worker.js')
    worker.onmessage = (event: MessageEvent) => {
      if (cancelled) return
      const payload = event.data as {
        bytes: ArrayBuffer
        resolution: number
        stats: GrassFieldTextureResult['stats']
      }
      const commitScope = `setup.grass.async-${alphaMode}-field-texture-commit`
      setField(
        measure(profileMeasure, commitScope, () =>
          createGrassFieldTextureFromData(
            {
              bytes: new Uint8Array(payload.bytes),
              resolution: payload.resolution,
              stats: payload.stats,
            },
            profileMeasure,
            commitScope,
          ),
        ),
      )
    }
    worker.postMessage({
      alphaMode,
      blockers: blockers.map((blocker) => ({
        featherMeters: blocker.featherMeters,
        points: blocker.points.map((point) => ({ x: point.x, z: point.z })),
      })),
      density,
      edgeFadeMeters,
      patchSize,
      patchSoftness,
      perimeter: perimeter.map((point) => ({ x: point.x, z: point.z })),
      planeSize: GRASS_FIELD_PLANE_SIZE,
      resolution,
      roads: roads.map((road) => ({
        points: road.points.map((point) => ({ x: point.x, z: point.z })),
        width: road.width,
      })),
    })

    return () => {
      cancelled = true
      worker.terminate()
    }
  }, [
    alphaMode,
    blockers,
    density,
    edgeFadeMeters,
    patchSize,
    patchSoftness,
    perimeter,
    profileMeasure,
    resolution,
    roads,
    shouldGenerate,
  ])

  useEffect(() => () => field?.texture.dispose(), [field])

  return field
}

type GrassTextureTreeCandidate = {
  alpha: number
  canopyRadius: number
  kind: LandrushTree['kind']
  rotation: number
  score: number
  trunkHeight: number
  x: number
  z: number
}

function createGrassTextureTreeReferences({
  density,
  elevation,
  fieldSize,
  fieldTexture,
}: {
  density: number
  elevation: number
  fieldSize: number
  fieldTexture: Texture
}): BrunoTreeReference[] {
  const image = fieldTexture.image as
    | { data?: Uint8Array; height?: number; width?: number }
    | undefined
  const data = image?.data
  const resolution = image?.width ?? 0
  if (!data || resolution <= 1 || image?.height !== resolution) return []

  const targetCount = Math.round(lerp(GRASS_TREE_MIN_COUNT, GRASS_TREE_MAX_COUNT, clamp01(density)))
  const cellsPerAxis = Math.max(8, Math.round(fieldSize / GRASS_TREE_CELL_METERS))
  const cellSize = fieldSize / cellsPerAxis
  const halfSize = fieldSize / 2
  const candidates: GrassTextureTreeCandidate[] = []

  for (let cellZ = 0; cellZ < cellsPerAxis; cellZ += 1) {
    for (let cellX = 0; cellX < cellsPerAxis; cellX += 1) {
      const seed = cellX * 97.13 + cellZ * 313.71
      const jitterX = (hashUnit(seed, 2.1) - 0.5) * cellSize * 0.84
      const jitterZ = (hashUnit(seed, 9.7) - 0.5) * cellSize * 0.84
      const x = -halfSize + (cellX + 0.5) * cellSize + jitterX
      const z = -halfSize + (cellZ + 0.5) * cellSize + jitterZ
      const alpha = sampleGrassTextureAlpha(data, resolution, fieldSize, x, z)
      if (alpha < GRASS_TREE_MIN_ALPHA) continue

      const scaleSeed = hashUnit(seed, 27.6)
      candidates.push({
        alpha,
        canopyRadius: 0.72 + alpha * 0.72 + scaleSeed * 0.28,
        kind: 'canopy',
        rotation: hashUnit(seed, 38.8) * Math.PI * 2,
        score: alpha * 0.82 + hashUnit(seed, 51.2) * 0.18,
        trunkHeight: 0.92 + alpha * 0.48 + scaleSeed * 0.2,
        x,
        z,
      })
    }
  }

  const selected: GrassTextureTreeCandidate[] = []
  const minSpacing = lerp(8.8, 5.8, clamp01(density))
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (selected.length >= targetCount) break
    if (
      selected.some((tree) => Math.hypot(candidate.x - tree.x, candidate.z - tree.z) < minSpacing)
    ) {
      continue
    }
    selected.push(candidate)
  }

  return selected.map((candidate, index) => ({
    elevation,
    tree: {
      band: 'grass',
      canopyRadius: candidate.canopyRadius,
      id: `grass-density-tree-${index}`,
      kind: candidate.kind,
      position: { x: candidate.x, z: candidate.z },
      r3fPosition: [candidate.x, elevation, candidate.z],
      rotation: candidate.rotation,
      trunkHeight: candidate.trunkHeight,
    },
  }))
}

function sampleGrassTextureAlpha(
  data: Uint8Array,
  resolution: number,
  fieldSize: number,
  x: number,
  z: number,
) {
  const u = x / fieldSize + 0.5
  const v = z / fieldSize + 0.5
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0

  const pixelX = Math.max(0, Math.min(resolution - 1, Math.round(u * (resolution - 1))))
  const pixelY = Math.max(0, Math.min(resolution - 1, Math.round(v * (resolution - 1))))
  return (data[(pixelY * resolution + pixelX) * 4 + 3] ?? 0) / 255
}

function hashUnit(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

export function GrassGroundLayer({
  elevation,
  profileMeasure,
  renderOrder,
  roads,
  stylizedTexture,
  stylizedTextureWorldSizeMeters,
  texture,
}: GrassGroundLayerProps) {
  if (stylizedTexture) {
    return (
      <StylizedGrassGroundLayer
        elevation={elevation}
        profileMeasure={profileMeasure}
        renderOrder={renderOrder}
        roads={roads}
        texture={texture}
        textureWorldSizeMeters={stylizedTextureWorldSizeMeters}
      />
    )
  }

  return (
    <GrassGroundMesh
      elevation={elevation}
      opacity={0.88}
      renderOrder={renderOrder}
      texture={texture}
    />
  )
}

function StylizedGrassGroundLayer({
  elevation,
  profileMeasure,
  renderOrder,
  roads,
  texture,
  textureWorldSizeMeters,
}: {
  elevation: number
  profileMeasure?: ProfileMeasure
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
  texture: Texture
  textureWorldSizeMeters: number
}) {
  const [grassTexture, dirtTexture, dirtAOTexture, dirtHeightTexture] = useTexture([
    STYLIZED_GRASS_TEXTURE_PATH,
    STYLIZED_DIRT_TEXTURE_PATH,
    STYLIZED_DIRT_AO_TEXTURE_PATH,
    STYLIZED_DIRT_HEIGHT_TEXTURE_PATH,
  ]) as Texture[]
  const textureOptions = useMemo(
    () => ({
      dirtAOTexture: dirtAOTexture!,
      dirtHeightTexture: dirtHeightTexture!,
      dirtTexture: dirtTexture!,
      fieldSize: GRASS_FIELD_PLANE_SIZE,
      grassTexture: grassTexture!,
      maskTexture: texture,
      roads,
      textureWorldSizeMeters,
    }),
    [
      dirtAOTexture,
      dirtHeightTexture,
      dirtTexture,
      grassTexture,
      roads,
      texture,
      textureWorldSizeMeters,
    ],
  )
  const previewGroundTexture = useMemo(
    () =>
      measure(profileMeasure, 'setup.grass.stylized-ground-preview-texture', () =>
        createStylizedGrassGroundTexture(
          textureOptions,
          STYLIZED_GROUND_PREVIEW_TEXTURE_RESOLUTION,
        ),
      ),
    [profileMeasure, textureOptions],
  )
  const finalGroundTexture = useDeferredStylizedGrassGroundTexture({
    outputSize: STYLIZED_GROUND_FINAL_TEXTURE_RESOLUTION,
    profileMeasure,
    textureOptions,
  })
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

  return (
    <GrassGroundMesh
      elevation={elevation}
      opacity={0.96}
      renderOrder={renderOrder}
      texture={groundTexture}
    />
  )
}

function GrassGroundMesh({
  elevation,
  opacity,
  renderOrder,
  texture,
}: {
  elevation: number
  opacity: number
  renderOrder: number
  texture: Texture
}) {
  return (
    <mesh
      position={[0, elevation + 0.018, 0]}
      renderOrder={renderOrder}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[GRASS_FIELD_PLANE_SIZE, GRASS_FIELD_PLANE_SIZE, 1, 1]} />
      <meshBasicMaterial
        depthWrite={false}
        map={texture}
        opacity={opacity}
        side={DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}

type StylizedGroundTextureOptions = {
  dirtAOTexture: Texture
  dirtHeightTexture: Texture
  dirtTexture: Texture
  fieldSize: number
  grassTexture: Texture
  maskTexture: Texture
  roads: readonly LandrushRoadSegment[]
  textureWorldSizeMeters: number
}

type StylizedPathSpan = {
  end: { x: number; z: number }
  halfWidth: number
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  start: { x: number; z: number }
}

type StylizedPathGrid = {
  cells: StylizedPathSpan[][]
  cellsPerAxis: number
  fieldSize: number
}

type TextureImageData = {
  data: Uint8ClampedArray
  height: number
  width: number
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

function useDeferredStylizedGrassGroundTexture({
  outputSize,
  profileMeasure,
  textureOptions,
}: {
  outputSize: number
  profileMeasure?: ProfileMeasure
  textureOptions: StylizedGroundTextureOptions
}) {
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    setTexture(null)
    if (typeof window === 'undefined') return

    const prepared = measure(profileMeasure, 'setup.grass.stylized-ground-final-prepare', () =>
      prepareStylizedGroundTexture(textureOptions),
    )
    if (!prepared) return

    let cancelled = false
    let frameId: number | null = null
    let timeoutId: number | null = null
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
        paintStylizedGroundTextureRow(output.data, row, outputSize, prepared)
        row += 1
      }
      if (row < outputSize) {
        frameId = window.requestAnimationFrame(step)
        return
      }

      const generatedTexture = measure(
        profileMeasure,
        'setup.grass.stylized-ground-final-commit',
        () => {
          context.putImageData(output, 0, 0)
          return createStylizedGroundTextureFromCanvas(canvas)
        },
      )
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
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [outputSize, profileMeasure, textureOptions])

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
}: StylizedGroundTextureOptions): PreparedStylizedGroundTexture | null {
  if (typeof document === 'undefined') return null
  const maskImage = maskTexture.image as
    | { data?: Uint8Array; height?: number; width?: number }
    | undefined
  const maskData = maskImage?.data
  const maskSize = maskImage?.width ?? 0
  if (!maskData || maskSize <= 1 || maskImage?.height !== maskSize) return null

  const grassSource = imageDataFromTexture(grassTexture)
  const dirtSource = imageDataFromTexture(dirtTexture)
  const dirtAOSource = imageDataFromTexture(dirtAOTexture)
  const dirtHeightSource = imageDataFromTexture(dirtHeightTexture)
  if (!grassSource || !dirtSource || !dirtAOSource || !dirtHeightSource) return null

  return {
    dirtAOSource,
    dirtHeightSource,
    dirtSource,
    fieldSize,
    grassSource,
    maskData,
    maskSize,
    pathGrid: createStylizedPathGrid(roads, fieldSize),
    textureRepeat: fieldSize / normalizedStylizedTextureWorldSize(textureWorldSizeMeters),
  }
}

function createStylizedGrassGroundTexture({
  dirtAOTexture,
  dirtHeightTexture,
  dirtTexture,
  fieldSize,
  grassTexture,
  maskTexture,
  roads,
  textureWorldSizeMeters,
}: StylizedGroundTextureOptions, outputSizeOverride?: number): Texture {
  if (typeof document === 'undefined') return maskTexture
  const maskImage = maskTexture.image as
    | { data?: Uint8Array; height?: number; width?: number }
    | undefined
  const maskData = maskImage?.data
  const maskSize = maskImage?.width ?? 0
  if (!maskData || maskSize <= 1 || maskImage?.height !== maskSize) return maskTexture

  const grassSource = imageDataFromTexture(grassTexture)
  const dirtSource = imageDataFromTexture(dirtTexture)
  const dirtAOSource = imageDataFromTexture(dirtAOTexture)
  const dirtHeightSource = imageDataFromTexture(dirtHeightTexture)
  if (!grassSource || !dirtSource || !dirtAOSource || !dirtHeightSource) return maskTexture
  const pathGrid = createStylizedPathGrid(roads, fieldSize)
  const textureRepeat = fieldSize / normalizedStylizedTextureWorldSize(textureWorldSizeMeters)
  const outputSize = outputSizeOverride ?? stylizedGroundTextureOutputSize(maskSize)

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) return maskTexture
  const output = context.createImageData(outputSize, outputSize)

  for (let y = 0; y < outputSize; y += 1) {
    for (let x = 0; x < outputSize; x += 1) {
      const index = (y * outputSize + x) * 4
      const u = x / (outputSize - 1)
      const v = y / (outputSize - 1)
      const mask = sampleMaskRgba(maskData, maskSize, u, v)
      const alpha = mask[3]
      if (alpha <= 0) {
        const rawGrass = sampleRepeatedRgb(grassSource, u, v, textureRepeat, 0, 0)
        const color = stylizedGrassGroundColor(rawGrass, [128, 164, 82], u, v)
        output.data[index] = byte255(color[0])
        output.data[index + 1] = byte255(color[1])
        output.data[index + 2] = byte255(color[2])
        output.data[index + 3] = 0
        continue
      }

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

      output.data[index] = byte255(color[0])
      output.data[index + 1] = byte255(color[1])
      output.data[index + 2] = byte255(color[2])
      output.data[index + 3] = alpha
    }
  }

  context.putImageData(output, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.flipY = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = true
  texture.userData.landrushGeneratedStylizedGrassGround = true
  texture.needsUpdate = true
  return texture
}

function paintStylizedGroundTextureRow(
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
    if (alpha <= 0) {
      const rawGrass = sampleRepeatedRgb(grassSource, u, v, textureRepeat, 0, 0)
      const color = stylizedGrassGroundColor(rawGrass, [128, 164, 82], u, v)
      output[index] = byte255(color[0])
      output[index + 1] = byte255(color[1])
      output[index + 2] = byte255(color[2])
      output[index + 3] = 0
      continue
    }

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

function normalizedStylizedTextureWorldSize(value: number) {
  return Number.isFinite(value)
    ? Math.max(MIN_STYLIZED_TEXTURE_WORLD_SIZE_METERS, value)
    : DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS
}

type RgbByte = readonly [number, number, number]

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

function stylizedPathWeight(
  point: { x: number; z: number },
  pathGrid: StylizedPathGrid | null,
  u: number,
  v: number,
) {
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

function createStylizedPathGrid(
  roads: readonly LandrushRoadSegment[],
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

function stylizedPathSpansNearPoint(point: { x: number; z: number }, pathGrid: StylizedPathGrid) {
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

function signedDistanceToStylizedSpans(
  point: { x: number; z: number },
  spans: readonly StylizedPathSpan[],
) {
  let signedDistance = Number.POSITIVE_INFINITY
  for (const span of spans) {
    signedDistance = Math.min(
      signedDistance,
      distanceToStylizedSegment(point, span.start, span.end) - span.halfWidth,
    )
  }
  return signedDistance
}

function distanceToStylizedSegment(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.z - start.z)

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function mixRgbBytes(first: RgbByte, second: RgbByte, amount: number): RgbByte {
  const t = clamp01(amount)
  return [lerp(first[0], second[0], t), lerp(first[1], second[1], t), lerp(first[2], second[2], t)]
}

function scaleRgbBytes(color: RgbByte, scale: number): RgbByte {
  return [color[0] * scale, color[1] * scale, color[2] * scale]
}

function byte255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function fractional(value: number) {
  return value - Math.floor(value)
}

function stylizedGroundNoise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(hashUnit(ix, iz), hashUnit(ix + 1, iz), ux),
    lerp(hashUnit(ix, iz + 1), hashUnit(ix + 1, iz + 1), ux),
    uz,
  )
}

export function GrassBladeLayerWebGPU({
  bladeSubdivisions,
  colorTexture,
  elevation,
  fieldTexture,
  profileMeasure,
  renderOrder,
  tuning,
}: GrassBladeLayerWebGPUProps) {
  const bladeGeometry = useMemo(
    () =>
      measure(profileMeasure, 'setup.grass.blade-color-geometry', () =>
        createGrassBladeColorGeometry({
          bladeSubdivisions,
          brightness: tuning.brightness,
          colorTexture,
          fieldSize: GRASS_FIELD_PLANE_SIZE,
          fieldTexture,
          height: tuning.height,
          profileMeasure,
          profileScope: 'setup.grass.blade-color-geometry',
          rootShadow: tuning.rootShadow,
          width: tuning.width,
          wind: tuning.wind,
        }),
      ),
    [
      bladeSubdivisions,
      colorTexture,
      fieldTexture,
      profileMeasure,
      tuning.brightness,
      tuning.height,
      tuning.rootShadow,
      tuning.width,
      tuning.wind,
    ],
  )

  useEffect(() => () => bladeGeometry.dispose(), [bladeGeometry])

  return (
    <mesh
      frustumCulled={false}
      geometry={bladeGeometry}
      position={[0, elevation + 0.02, 0]}
      renderOrder={renderOrder}
    >
      <meshBasicMaterial
        depthWrite={false}
        opacity={tuning.opacity}
        side={DoubleSide}
        toneMapped={false}
        transparent
        vertexColors
      />
    </mesh>
  )
}

function measure<T>(profileMeasure: ProfileMeasure | undefined, id: string, callback: () => T) {
  return profileMeasure ? profileMeasure(id, callback) : callback()
}
