'use client'

import {
  blendStylizedGroundPathColor,
  stylizedGroundByte255 as byte255,
  createStylizedGroundTextureFromCanvas,
  createStylizedPathGrid,
  type StylizedGroundRgbByte as RgbByte,
  type StylizedPathGrid,
  sampleStylizedGroundMaskRgba as sampleMaskRgba,
  stylizedPathSignedDistance,
  type PascalWaterLandSurface as WaterLandSurface,
} from '@landrush/pascal-plugin'
import { useGpuResourceLifetime } from '@pascal-app/viewer'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, type Mesh, type Texture } from 'three'
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
import { notifyLandrushZombieNightSurfaceMaterialChange } from './landrush-zombie-night-presentation-material'
import {
  type GrassPattern,
  getOrganicGrassPattern,
  sampleOrganicGrassPattern,
} from './organic-grass-pattern'
import {
  canUseProceduralStylizedGrassGround,
  ProceduralStylizedGrassGround,
  type StylizedGrassGroundDebugMode,
  type StylizedGrassGroundTextureReadyHandler,
} from './stylized-grass-ground-material'
import { StylizedPathNetworkLayer } from './stylized-path-network-layer'
import {
  DEFAULT_STYLIZED_GRASS_GROUND_TINT_CAP,
  type StylizedGrassInteractionRef,
  type StylizedGrassPreparedResidencyReadinessHandler,
  type StylizedGrassPreparedResidencyRequest,
  type StylizedGrassVisibilityRef,
  StylizedSceneLandLayer,
} from './stylized-scene-land-layers'

type GrassWaterLandLayersProps = {
  bladeFadeBlockers?: readonly GrassFieldBlocker[]
  bladeSubdivisions?: number
  bladeGrassBlockers?: readonly GrassFieldBlocker[]
  bladeRenderOrder?: number
  bladeVisibilityRef?: StylizedGrassVisibilityRef
  bladesVisible?: boolean
  fieldResolution?: number
  finalFieldResolution?: number
  finalSpawnResolution?: number
  grassBlockers?: readonly GrassFieldBlocker[]
  grassDebugState?: GrassLifecycleDebugState
  grassInteractionRef?: StylizedGrassInteractionRef
  grassPreparedResidencyRequest?: StylizedGrassPreparedResidencyRequest | null
  grassStreamingPaused?: boolean
  groundRenderOrder?: number
  onStylizedGroundTextureReady?: (ready: boolean) => void
  onGrassPreparedResidencyReadinessChange?: StylizedGrassPreparedResidencyReadinessHandler
  profileMeasure?: ProfileMeasure
  renderStylizedPathNetwork?: boolean
  roads?: readonly LandrushRoadSegment[]
  showBlades?: boolean
  showGround?: boolean
  showTrees?: boolean
  spawnResolution?: number
  stylizedGroundTexture?: boolean
  stylizedGroundDebugMode?: StylizedGrassGroundDebugMode
  stylizedSceneLayout?: boolean
  stylizedGroundTint?: string
  stylizedGroundTextureWorldSizeMeters?: number
  stylizedGrassGroundTintCap?: number
  surface: WaterLandSurface
  treeBlockers?: readonly GrassFieldBlocker[]
  tuning: GrassBladeTuning
}

type GrassGroundLayerProps = {
  elevation: number
  onTextureReady?: StylizedGrassGroundTextureReadyHandler
  profileMeasure?: ProfileMeasure
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
  stylizedTexture: boolean
  stylizedTextureDebugMode: StylizedGrassGroundDebugMode
  stylizedTextureTint: string
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

export type GrassLifecycleDebugState = {
  buildMode: boolean
  source: string
}

type ProfileMeasure = <T>(id: string, callback: () => T) => T

const GRASS_WATER_EDGE_FADE_METERS = 0
const GRASS_TREE_CELL_METERS = 5.8
const GRASS_TREE_MIN_ALPHA = 0.12
const GRASS_TREE_MIN_COUNT = 7
const GRASS_TREE_MAX_COUNT = 34

const EMPTY_GRASS_ROADS: readonly LandrushRoadSegment[] = []
const EMPTY_GRASS_BLOCKERS: readonly GrassFieldBlocker[] = []
const DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS = 5
const MIN_STYLIZED_TEXTURE_WORLD_SIZE_METERS = 0.001
const STYLIZED_GROUND_PREVIEW_TEXTURE_RESOLUTION = 512
const STYLIZED_GROUND_FINAL_TEXTURE_RESOLUTION = 2048
const GRASS_GROUND_RENDER_ORDER = 12
const GRASS_BLADE_RENDER_ORDER = 13
const STYLIZED_GRASS_BLADE_RENDER_ORDER = 14

export function GrassWaterLandLayers({
  bladeFadeBlockers = EMPTY_GRASS_BLOCKERS,
  bladeSubdivisions,
  bladeGrassBlockers,
  bladeRenderOrder,
  bladeVisibilityRef,
  bladesVisible = true,
  fieldResolution,
  finalFieldResolution,
  finalSpawnResolution,
  grassBlockers = EMPTY_GRASS_BLOCKERS,
  grassDebugState,
  grassInteractionRef,
  grassPreparedResidencyRequest = null,
  grassStreamingPaused = false,
  groundRenderOrder = GRASS_GROUND_RENDER_ORDER,
  onStylizedGroundTextureReady,
  onGrassPreparedResidencyReadinessChange,
  profileMeasure,
  renderStylizedPathNetwork = true,
  roads = EMPTY_GRASS_ROADS,
  showBlades = true,
  showGround = true,
  showTrees = true,
  spawnResolution,
  stylizedGroundTexture = false,
  stylizedGroundDebugMode = 'final',
  stylizedSceneLayout = false,
  stylizedGroundTint = '#ffffff',
  stylizedGroundTextureWorldSizeMeters = DEFAULT_STYLIZED_TEXTURE_WORLD_SIZE_METERS,
  stylizedGrassGroundTintCap = DEFAULT_STYLIZED_GRASS_GROUND_TINT_CAP,
  surface,
  treeBlockers,
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
  const resolvedTreeBlockers = treeBlockers ?? bladeFadeBlockers
  const resolvedBladeRenderOrder =
    bladeRenderOrder ??
    (stylizedSceneLayout ? STYLIZED_GRASS_BLADE_RENDER_ORDER : GRASS_BLADE_RENDER_ORDER)
  const [stylizedGroundColorTexture, setStylizedGroundColorTexture] = useState<Texture | null>(null)
  const handleStylizedGroundTextureReady = useCallback<StylizedGrassGroundTextureReadyHandler>(
    (ready, texture) => {
      setStylizedGroundColorTexture(ready ? (texture ?? null) : null)
      onStylizedGroundTextureReady?.(ready)
    },
    [onStylizedGroundTextureReady],
  )
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

  useGpuResourceLifetime(groundField.texture)
  useGpuResourceLifetime(spawnPreviewField.texture)

  return (
    <>
      {showGround ? (
        <GrassGroundLayer
          elevation={surface.grassSurfaceElevation}
          profileMeasure={profileMeasure}
          renderOrder={groundRenderOrder}
          roads={stylizedGroundTexture ? EMPTY_GRASS_ROADS : roads}
          onTextureReady={handleStylizedGroundTextureReady}
          stylizedTexture={stylizedGroundTexture}
          stylizedTextureDebugMode={stylizedGroundDebugMode}
          stylizedTextureTint={stylizedGroundTint}
          stylizedTextureWorldSizeMeters={stylizedGroundTextureWorldSizeMeters}
          texture={renderedGroundField.texture}
        />
      ) : null}
      {showGround && stylizedGroundTexture && renderStylizedPathNetwork && roads.length > 0 ? (
        <StylizedPathNetworkLayer
          elevation={surface.grassSurfaceElevation}
          perimeter={surface.grassSurfacePoints}
          renderOrder={groundRenderOrder + 1}
          roads={roads}
        />
      ) : null}
      {stylizedSceneLayout ? (
        <Suspense fallback={null}>
          <StylizedSceneLandLayer
            bladesVisible={bladesVisible}
            elevation={surface.grassSurfaceElevation}
            groundColorTexture={stylizedGroundColorTexture}
            groundTintCap={stylizedGrassGroundTintCap}
            grassFadeBlockers={bladeFadeBlockers}
            grassDebugState={{
              ...grassDebugState,
              fadeBlockerSignature: grassBlockersSignature(bladeFadeBlockers),
              structuralBlockerSignature: grassBlockersSignature(resolvedBladeGrassBlockers),
            }}
            grassInteractionRef={grassInteractionRef}
            grassPreparedResidencyRequest={grassPreparedResidencyRequest}
            grassBlockers={resolvedBladeGrassBlockers}
            profileMeasure={profileMeasure}
            roads={roads}
            grassRenderOrder={resolvedBladeRenderOrder}
            grassVisibilityRef={bladeVisibilityRef}
            onGrassPreparedResidencyReadinessChange={onGrassPreparedResidencyReadinessChange}
            showBlades={showBlades}
            showTrees={showTrees}
            streamingPaused={grassStreamingPaused}
            surfacePoints={surface.grassSurfacePoints}
            treeBlockers={resolvedTreeBlockers}
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

function grassBlockersSignature(blockers: readonly GrassFieldBlocker[]) {
  return blockers
    .map((blocker) =>
      blocker.points.map((point) => `${point.x.toFixed(2)}:${point.z.toFixed(2)}`).join('|'),
    )
    .join('||')
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

  useGpuResourceLifetime(field?.texture)

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

export function GrassGroundLayer({
  elevation,
  onTextureReady,
  profileMeasure,
  renderOrder,
  roads,
  stylizedTexture,
  stylizedTextureDebugMode,
  stylizedTextureTint,
  stylizedTextureWorldSizeMeters,
  texture,
}: GrassGroundLayerProps) {
  useEffect(() => {
    if (!stylizedTexture) onTextureReady?.(true)
  }, [onTextureReady, stylizedTexture])

  if (stylizedTexture) {
    return (
      <StylizedGrassGroundLayer
        elevation={elevation}
        onTextureReady={onTextureReady}
        profileMeasure={profileMeasure}
        renderOrder={renderOrder}
        roads={roads}
        debugMode={stylizedTextureDebugMode}
        tint={stylizedTextureTint}
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
  debugMode,
  elevation,
  profileMeasure,
  renderOrder,
  roads,
  onTextureReady,
  tint,
  texture,
  textureWorldSizeMeters,
}: {
  debugMode: StylizedGrassGroundDebugMode
  elevation: number
  onTextureReady?: StylizedGrassGroundTextureReadyHandler
  profileMeasure?: ProfileMeasure
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
  tint: string
  texture: Texture
  textureWorldSizeMeters: number
}) {
  if (canUseProceduralStylizedGrassGround()) {
    return (
      <ProceduralStylizedGrassGround
        debugMode={debugMode}
        elevation={elevation}
        maskTexture={texture}
        onReady={onTextureReady}
        renderOrder={renderOrder}
        color={tint}
      />
    )
  }

  return (
    <CanvasStylizedGrassGroundLayer
      elevation={elevation}
      onTextureReady={onTextureReady}
      profileMeasure={profileMeasure}
      renderOrder={renderOrder}
      roads={roads}
      tint={tint}
      texture={texture}
      textureWorldSizeMeters={textureWorldSizeMeters}
    />
  )
}

function CanvasStylizedGrassGroundLayer({
  elevation,
  profileMeasure,
  renderOrder,
  roads,
  onTextureReady,
  tint,
  texture,
  textureWorldSizeMeters,
}: {
  elevation: number
  onTextureReady?: StylizedGrassGroundTextureReadyHandler
  profileMeasure?: ProfileMeasure
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
  tint: string
  texture: Texture
  textureWorldSizeMeters: number
}) {
  const textureOptions = useMemo(
    () => ({
      fieldSize: GRASS_FIELD_PLANE_SIZE,
      maskTexture: texture,
      roads,
      textureWorldSizeMeters,
    }),
    [roads, texture, textureWorldSizeMeters],
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

  useEffect(() => {
    onTextureReady?.(Boolean(finalGroundTexture), finalGroundTexture ?? undefined)
  }, [finalGroundTexture, onTextureReady])

  useGpuResourceLifetime(
    previewGroundTexture.userData.landrushGeneratedStylizedGrassGround
      ? previewGroundTexture
      : null,
  )
  useGpuResourceLifetime(
    finalGroundTexture?.userData.landrushGeneratedStylizedGrassGround ? finalGroundTexture : null,
  )

  return (
    <GrassGroundMesh
      color={tint}
      elevation={elevation}
      opacity={0.96}
      renderOrder={renderOrder}
      texture={groundTexture}
    />
  )
}

function GrassGroundMesh({
  color = '#ffffff',
  elevation,
  opacity,
  renderOrder,
  texture,
}: {
  color?: string
  elevation: number
  opacity: number
  renderOrder: number
  texture: Texture
}) {
  const meshRef = useRef<Mesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if ((material as { map?: Texture }).map !== texture) return
    notifyLandrushZombieNightSurfaceMaterialChange(mesh)
  }, [texture])

  return (
    <mesh
      name="landrush-grass-ground"
      position={[0, elevation + 0.018, 0]}
      ref={meshRef}
      renderOrder={renderOrder}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[GRASS_FIELD_PLANE_SIZE, GRASS_FIELD_PLANE_SIZE, 1, 1]} />
      <meshBasicMaterial
        color={color}
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
  fieldSize: number
  maskTexture: Texture
  roads: readonly LandrushRoadSegment[]
  textureWorldSizeMeters: number
}

type PreparedStylizedGroundTexture = {
  fieldSize: number
  grainRepeat: number
  grassPattern: GrassPattern
  maskData: Uint8Array
  maskSize: number
  pathGrid: StylizedPathGrid | null
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
  fieldSize,
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

  return {
    fieldSize,
    grainRepeat: fieldSize / normalizedStylizedTextureWorldSize(textureWorldSizeMeters),
    grassPattern: getOrganicGrassPattern(),
    maskData,
    maskSize,
    pathGrid: createStylizedPathGrid(roads, fieldSize),
  }
}

function createStylizedGrassGroundTexture(
  options: StylizedGroundTextureOptions,
  outputSizeOverride?: number,
): Texture {
  if (typeof document === 'undefined') return options.maskTexture
  const prepared = prepareStylizedGroundTexture(options)
  if (!prepared) return options.maskTexture
  const outputSize = outputSizeOverride ?? stylizedGroundTextureOutputSize(prepared.maskSize)

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) return options.maskTexture
  const output = context.createImageData(outputSize, outputSize)

  for (let y = 0; y < outputSize; y += 1) {
    paintStylizedGroundTextureRow(output.data, y, outputSize, prepared)
  }

  context.putImageData(output, 0, 0)
  return createStylizedGroundTextureFromCanvas(canvas)
}

function paintStylizedGroundTextureRow(
  output: Uint8ClampedArray,
  y: number,
  outputSize: number,
  prepared: PreparedStylizedGroundTexture,
) {
  const { fieldSize, grainRepeat, grassPattern, maskData, maskSize, pathGrid } = prepared

  for (let x = 0; x < outputSize; x += 1) {
    const index = (y * outputSize + x) * 4
    const u = x / (outputSize - 1)
    const v = y / (outputSize - 1)
    const mask = sampleMaskRgba(maskData, maskSize, u, v)
    const alpha = mask[3]
    if (alpha <= 0) {
      const color = stylizedGrassGroundColor(u, v, grassPattern)
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
    const grassColor = stylizedGrassGroundColor(u, v, grassPattern)
    const pathDistance = stylizedPathSignedDistance(worldPoint, pathGrid, u, v)
    const color = blendStylizedGroundPathColor(grassColor, pathDistance, u, v, grainRepeat)

    output[index] = byte255(color[0])
    output[index + 1] = byte255(color[1])
    output[index + 2] = byte255(color[2])
    output[index + 3] = alpha
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

function stylizedGrassGroundColor(u: number, v: number, pattern: GrassPattern): RgbByte {
  return sampleOrganicGrassPattern(pattern, u, v)
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

  useGpuResourceLifetime(bladeGeometry)

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
