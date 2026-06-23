'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { DoubleSide, type Texture } from 'three'
import type { LandrushRoadSegment, LandrushTree } from '@/components/landrush/types'
import { BrunoTreeLayer, type BrunoTreeReference } from './bruno-tree-layers'
import { createGrassBladeColorGeometry } from './grass-blade-geometry'
import {
  createGrassFieldTexture,
  createGrassFieldTextureFromData,
  GRASS_FIELD_PLANE_SIZE,
} from './grass-field-texture'
import type { GrassBladeTuning } from './grass-material'
import type { WaterLandSurface } from './water-scene'

type GrassWaterLandLayersProps = {
  bladeSubdivisions?: number
  fieldResolution?: number
  finalFieldResolution?: number
  finalSpawnResolution?: number
  profileMeasure?: ProfileMeasure
  roads?: readonly LandrushRoadSegment[]
  showBlades?: boolean
  showTrees?: boolean
  spawnResolution?: number
  surface: WaterLandSurface
  tuning: GrassBladeTuning
}

type GrassGroundLayerProps = {
  elevation: number
  texture: Texture
}

type GrassBladeLayerWebGPUProps = {
  bladeSubdivisions?: number
  colorTexture?: Texture
  elevation: number
  fieldTexture: Texture
  profileMeasure?: ProfileMeasure
  tuning: GrassBladeTuning
}

type ProfileMeasure = <T>(id: string, callback: () => T) => T

const GRASS_WATER_EDGE_FADE_METERS = 0
const GRASS_TREE_CELL_METERS = 5.8
const GRASS_TREE_MIN_ALPHA = 0.12
const GRASS_TREE_MIN_COUNT = 7
const GRASS_TREE_MAX_COUNT = 34
const EMPTY_GRASS_ROADS: readonly LandrushRoadSegment[] = []

export function GrassWaterLandLayers({
  bladeSubdivisions,
  fieldResolution,
  finalFieldResolution,
  finalSpawnResolution,
  profileMeasure,
  roads = EMPTY_GRASS_ROADS,
  showBlades = true,
  showTrees = true,
  spawnResolution,
  surface,
  tuning,
}: GrassWaterLandLayersProps) {
  const groundResolution = fieldResolution
  const groundFinalResolution = finalFieldResolution ?? fieldResolution
  const spawnPreviewResolution = spawnResolution ?? fieldResolution
  const spawnFinalResolution = finalSpawnResolution ?? spawnPreviewResolution
  const groundField = useMemo(
    () =>
      measure(profileMeasure, 'setup.grass.ground-field-texture', () =>
        createGrassFieldTexture({
          alphaMode: 'surface',
          density: tuning.density,
          edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
          patchSize: tuning.patchSize,
          patchSoftness: tuning.patchSoftness,
          perimeter: surface.grassSurfacePoints,
          planeSize: GRASS_FIELD_PLANE_SIZE,
          profileMeasure,
          profileScope: 'setup.grass.ground-field-texture',
          resolution: groundResolution,
          roads,
        }),
      ),
    [
      groundResolution,
      profileMeasure,
      roads,
      surface.grassSurfacePoints,
      tuning.density,
      tuning.patchSize,
      tuning.patchSoftness,
    ],
  )
  const asyncGroundField = useAsyncGrassFieldTexture({
    alphaMode: 'surface',
    density: tuning.density,
    edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
    patchSize: tuning.patchSize,
    patchSoftness: tuning.patchSoftness,
    perimeter: surface.grassSurfacePoints,
    profileMeasure,
    resolution: groundFinalResolution,
    roads,
    shouldGenerate:
      typeof groundFinalResolution === 'number' && groundFinalResolution !== groundResolution,
  })
  const renderedGroundField = asyncGroundField ?? groundField
  const spawnPreviewField = useMemo(
    () =>
      measure(profileMeasure, 'setup.grass.spawn-field-texture', () =>
        createGrassFieldTexture({
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
      roads,
      surface.grassSurfacePoints,
      tuning.density,
      tuning.patchSize,
      tuning.patchSoftness,
    ],
  )
  const asyncSpawnField = useAsyncGrassFieldTexture({
    alphaMode: 'density',
    density: tuning.density,
    edgeFadeMeters: GRASS_WATER_EDGE_FADE_METERS,
    patchSize: tuning.patchSize,
    patchSoftness: tuning.patchSoftness,
    perimeter: surface.grassSurfacePoints,
    profileMeasure,
    resolution: spawnFinalResolution,
    roads,
    shouldGenerate:
      typeof spawnFinalResolution === 'number' && spawnFinalResolution !== spawnPreviewResolution,
  })
  const spawnField = asyncSpawnField ?? spawnPreviewField
  const treeReferences = useMemo(() => {
    if (!showTrees) return []
    return measure(profileMeasure, 'setup.grass.tree-references', () =>
      createGrassTextureTreeReferences({
        density: tuning.density,
        elevation: surface.grassSurfaceElevation,
        fieldSize: GRASS_FIELD_PLANE_SIZE,
        fieldTexture: spawnField.texture,
      }),
    )
  }, [profileMeasure, showTrees, spawnField.texture, surface.grassSurfaceElevation, tuning.density])

  useEffect(() => () => groundField.texture.dispose(), [groundField.texture])
  useEffect(() => () => spawnPreviewField.texture.dispose(), [spawnPreviewField.texture])

  return (
    <>
      <GrassGroundLayer
        elevation={surface.grassSurfaceElevation}
        texture={renderedGroundField.texture}
      />
      {showBlades ? (
        <GrassBladeLayerWebGPU
          bladeSubdivisions={bladeSubdivisions}
          colorTexture={renderedGroundField.texture}
          elevation={surface.grassSurfaceElevation}
          fieldTexture={spawnField.texture}
          profileMeasure={profileMeasure}
          tuning={tuning}
        />
      ) : null}
      {showTrees ? (
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

export function GrassGroundLayer({ elevation, texture }: GrassGroundLayerProps) {
  return (
    <mesh position={[0, elevation + 0.018, 0]} renderOrder={12} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[GRASS_FIELD_PLANE_SIZE, GRASS_FIELD_PLANE_SIZE, 1, 1]} />
      <meshBasicMaterial
        depthWrite={false}
        map={texture}
        opacity={0.88}
        side={DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}

export function GrassBladeLayerWebGPU({
  bladeSubdivisions,
  colorTexture,
  elevation,
  fieldTexture,
  profileMeasure,
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
      renderOrder={13}
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
