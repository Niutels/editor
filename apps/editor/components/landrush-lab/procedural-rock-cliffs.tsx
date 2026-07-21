'use client'

import { LANDRUSH_WATER_SURFACE_ELEVATION, type PascalWaterLandSurface } from '@pascal-app/nodes'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  type BufferGeometry,
  DataTexture,
  LinearFilter,
  type Material,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshToonMaterial,
  RedFormat,
  type Texture,
} from 'three'
import {
  createGrassFieldTexture,
  GRASS_FIELD_PLANE_SIZE,
  GRASS_FIELD_RESOLUTION,
} from './grass-field-texture'
import {
  createProceduralRockCliffPlan,
  DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  type ProceduralBeachControls,
  type ProceduralRockCliffDebugMode,
  type ProceduralRockCliffMetrics,
  type ProceduralRockCliffQuality,
  type ProceduralRockCliffWallControls,
  type ProceduralRockOffshoreControls,
  type ProceduralRockToneControls,
} from './procedural-rock-cliff-geometry'
import { ProceduralStylizedGrassGround } from './stylized-grass-ground-material'
import {
  createWaterlineInteractionField,
  type WaterlineInteractionField,
} from './waterline-interaction-field'

export type ProceduralRockCliffRuntimeMetrics = {
  drawCalls: number
  fps: number
  frameMs: number
  triangles: number
}

export function ProceduralRockCliffs({
  beachControls = DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  cutCount,
  debugMode,
  offshoreControls,
  onMetrics,
  onRuntimeMetrics,
  onWaterlineInteractionField,
  profileMeasure,
  quality,
  rockRenderOrder = 9,
  rockScale,
  seed,
  showGround = true,
  surface,
  toneControls,
  wallControls,
  waterSurfaceElevation,
}: {
  beachControls?: ProceduralBeachControls
  cutCount: number
  debugMode: ProceduralRockCliffDebugMode
  offshoreControls: ProceduralRockOffshoreControls
  onMetrics?: (metrics: ProceduralRockCliffMetrics) => void
  onRuntimeMetrics?: (metrics: ProceduralRockCliffRuntimeMetrics) => void
  onWaterlineInteractionField?: (field: WaterlineInteractionField | null) => void
  profileMeasure?: <T>(id: string, callback: () => T) => T
  quality: ProceduralRockCliffQuality
  rockRenderOrder?: number
  rockScale: number
  seed: number
  showGround?: boolean
  surface: PascalWaterLandSurface
  toneControls: ProceduralRockToneControls
  wallControls: ProceduralRockCliffWallControls
  waterSurfaceElevation?: number
}) {
  const plan = useMemo(
    () => {
      const build = () =>
        createProceduralRockCliffPlan({
          beachControls,
          cutCount,
          offshoreControls,
          quality,
          rockScale,
          seed,
          surface,
          toneControls,
          wallControls,
          waterSurfaceElevation,
        })
      return profileMeasure ? profileMeasure('setup.cliffs.geometry-plan', build) : build()
    },
    [
      beachControls,
      cutCount,
      offshoreControls,
      profileMeasure,
      quality,
      rockScale,
      seed,
      surface,
      toneControls,
      wallControls,
      waterSurfaceElevation,
    ],
  )
  const grassField = useMemo(
    () =>
      showGround
        ? createGrassFieldTexture({
            alphaMode: 'surface',
            density: 1,
            edgeFadeMeters: 0.28,
            perimeter: surface.grassSurfacePoints,
            planeSize: GRASS_FIELD_PLANE_SIZE,
            resolution: GRASS_FIELD_RESOLUTION,
            roads: [],
          })
        : null,
    [showGround, surface.grassSurfacePoints],
  )
  const waterlineInteractionField = useMemo(
    () => {
      if (!onWaterlineInteractionField) return null
      const build = () =>
        createWaterlineInteractionField(
          plan.geometry,
          waterSurfaceElevation ?? LANDRUSH_WATER_SURFACE_ELEVATION,
          {
            elevationRangeMeters: 2.5,
            maximumDistanceMeters: 6,
            resolution: quality === 'dense' ? 1280 : 1024,
          },
        )
      return profileMeasure ? profileMeasure('setup.cliffs.waterline-sdf', build) : build()
    },
    [onWaterlineInteractionField, plan.geometry, profileMeasure, quality, waterSurfaceElevation],
  )
  const toonGradient = useMemo(createRockToonGradientTexture, [])

  useEffect(() => onMetrics?.(plan.metrics), [onMetrics, plan.metrics])
  useEffect(() => {
    onWaterlineInteractionField?.(waterlineInteractionField)
    return () => onWaterlineInteractionField?.(null)
  }, [onWaterlineInteractionField, waterlineInteractionField])
  useEffect(
    () => () => {
      plan.coverageGeometry.dispose()
      plan.geometry.dispose()
      plan.variantGeometry.dispose()
    },
    [plan],
  )
  useEffect(() => () => grassField?.texture.dispose(), [grassField])
  useEffect(() => () => toonGradient.dispose(), [toonGradient])
  useEffect(() => () => waterlineInteractionField?.texture.dispose(), [waterlineInteractionField])

  const rockGeometry =
    debugMode === 'coverage'
      ? plan.coverageGeometry
      : debugMode === 'variants'
        ? plan.variantGeometry
        : plan.geometry

  return (
    <group name="blender-reference-procedural-rock-cliffs">
      <ProceduralRockMesh
        debugMode={debugMode}
        geometry={rockGeometry}
        renderOrder={rockRenderOrder}
        toonGradient={toonGradient}
      />

      {grassField ? (
        <ProceduralStylizedGrassGround
          elevation={surface.grassSurfaceElevation}
          maskTexture={grassField.texture}
          renderOrder={14}
        />
      ) : null}
      {onRuntimeMetrics ? <ProceduralRockRuntimeProbe onMetrics={onRuntimeMetrics} /> : null}
    </group>
  )
}

function ProceduralRockMesh({
  debugMode,
  geometry,
  renderOrder,
  toonGradient,
}: {
  debugMode: ProceduralRockCliffDebugMode
  geometry: BufferGeometry
  renderOrder: number
  toonGradient: Texture
}) {
  const material = useMemo(
    () => createRockMaterial(debugMode, toonGradient),
    [debugMode, toonGradient],
  )

  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      castShadow
      frustumCulled={false}
      geometry={geometry}
      name="procedural-cut-rock-wall-and-offshore-compiler"
      receiveShadow
      renderOrder={renderOrder}
    >
      <primitive attach="material" object={material} />
    </mesh>
  )
}

function createRockMaterial(
  debugMode: ProceduralRockCliffDebugMode,
  toonGradient: Texture,
): Material {
  if (debugMode === 'normals') {
    return new MeshNormalMaterial({ flatShading: true })
  }
  if (debugMode === 'wireframe') {
    return new MeshBasicMaterial({ color: '#d9ebef', wireframe: true })
  }
  if (debugMode !== 'final') {
    return new MeshBasicMaterial({ color: '#ffffff', vertexColors: true })
  }
  return new MeshToonMaterial({
    color: '#ffffff',
    dithering: true,
    emissive: '#160b0d',
    emissiveIntensity: 0.035,
    gradientMap: toonGradient,
    vertexColors: true,
  })
}

function createRockToonGradientTexture() {
  const width = 64
  const data = new Uint8Array(width)
  const softness = 0.68
  const cavityDarkening = 0.78
  const transition = mixNumber(0.008, 0.075, softness)
  const shadow = mixNumber(0.5, 0.32, cavityDarkening)
  const dark = mixNumber(0.64, 0.5, cavityDarkening)
  const mid = mixNumber(0.78, 0.68, cavityDarkening)
  const light = mixNumber(0.9, 0.85, cavityDarkening)

  for (let index = 0; index < width; index += 1) {
    const ratio = index / (width - 1)
    let value = shadow
    value = mixNumber(value, dark, smoothstep(0.2 - transition, 0.2 + transition, ratio))
    value = mixNumber(value, mid, smoothstep(0.42 - transition, 0.42 + transition, ratio))
    value = mixNumber(value, light, smoothstep(0.66 - transition, 0.66 + transition, ratio))
    value = mixNumber(value, 1, smoothstep(0.84 - transition, 0.84 + transition, ratio))
    data[index] = Math.round(value * 255)
  }

  const texture = new DataTexture(data, width, 1, RedFormat)
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.name = 'pascal-procedural-rock-height-toon-ramp'
  texture.needsUpdate = true
  return texture
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const ratio = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.000_1)))
  return ratio * ratio * (3 - 2 * ratio)
}

function mixNumber(first: number, second: number, ratio: number) {
  return first + (second - first) * ratio
}

function ProceduralRockRuntimeProbe({
  onMetrics,
}: {
  onMetrics: (metrics: ProceduralRockCliffRuntimeMetrics) => void
}) {
  const gl = useThree((state) => state.gl)
  const drawCallsRef = useRef(0)
  const elapsedRef = useRef(0)
  const framesRef = useRef(0)
  const trianglesRef = useRef(0)

  useFrame((_state, delta) => {
    elapsedRef.current += delta
    framesRef.current += 1
    if (elapsedRef.current < 0.75) return

    const fps = framesRef.current / Math.max(elapsedRef.current, 0.001)
    const drawCalls = Math.max(0, gl.info.render.calls - drawCallsRef.current)
    const triangles = Math.max(0, gl.info.render.triangles - trianglesRef.current)
    onMetrics({
      drawCalls: Math.round(drawCalls / Math.max(framesRef.current, 1)),
      fps,
      frameMs: 1000 / Math.max(fps, 0.001),
      triangles: Math.round(triangles / Math.max(framesRef.current, 1)),
    })
    drawCallsRef.current = gl.info.render.calls
    elapsedRef.current = 0
    framesRef.current = 0
    trianglesRef.current = gl.info.render.triangles
  })

  return null
}

export {
  DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
  type ProceduralRockCliffWallControls,
  type ProceduralRockOffshoreControls,
  type ProceduralRockToneControls,
} from './procedural-rock-cliff-geometry'
export type {
  ProceduralBeachControls,
  ProceduralRockCliffDebugMode,
  ProceduralRockCliffMetrics,
  ProceduralRockCliffQuality,
}
