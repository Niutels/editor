'use client'

import {
  createLandrushWaterMaterial,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  type LandrushWaterSurfaceMaterial,
  type LandrushWaterSurfaceParameters,
} from '@pascal-app/nodes'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import {
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LineBasicMaterial,
  type Material,
  type Mesh,
  Path,
  RGBAFormat,
  Shape,
  ShapeUtils,
  type Texture,
  Line as ThreeLine,
  type ToneMapping,
  Vector2,
  Vector3,
} from 'three'
import * as THREE from 'three/webgpu'
import type { LandrushIsland, LandrushPoint2 } from '@/components/landrush/types'
import { FrameLoadProfilerProbe, measureLandrushFrameSlice } from './frame-load-profiler'
import {
  createDepthReferencePerimeter,
  createSmoothedWaterPerimeter,
  createWaterFieldTexture,
  WATER_FIELD_DEPTH_REFERENCE_REACH,
  type WaterFieldParameters,
} from './water-field-texture'
import type { IslandElevationParameters } from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'
import type { WaterViewPreset } from './water-view-presets'

type WaterSceneProps = {
  artifactDiagnostics?: WaterArtifactDiagnostics
  debugLayer: 'shoreline' | null
  elevationParameters: IslandElevationParameters
  fieldRevisionKey?: string
  fieldParameters: WaterFieldParameters
  frameProfile?: boolean
  finalFieldEnabled?: boolean
  island: LandrushIsland
  materialParameters: WaterSceneMaterialParameters
  preset: WaterViewPreset
  previewTerrainFieldResolution?: number
  progressiveField?: boolean
  renderLandOverlay?: (surface: WaterLandSurface) => ReactNode
  terrainFieldResolution: number
  showDepthReference: boolean
  toneMapping?: ToneMapping
  waterFieldIsland: LandrushIsland
  waterMaterialFactory?: WaterMaterialFactory
  waveDepthTextureEnabled?: boolean
}

export type WaterArtifactDiagnostics = {
  expandLand: boolean
  hideWater: boolean
  liftLand: boolean
  maskLandWater: boolean
  opaqueWater: boolean
  showDepthTexture: boolean
}

export type WaterLandSurface = {
  grassSurfaceElevation: number
  grassSurfacePoints: readonly LandrushPoint2[]
  hasElevation: boolean
  plateauElevation: number
  plateauPoints: readonly LandrushPoint2[]
  shorelinePoints: readonly LandrushPoint2[]
  slopeStartPoints: readonly LandrushPoint2[]
  waterPlaneSize: number
}

type WaterSceneMaterialParameters = LandrushWaterSurfaceParameters & {
  waveDepthSmooth?: number
}

export type WaterMaterialFactory = (
  renderer: THREE.WebGPURenderer,
  terrainFieldTexture: Texture,
  bounds: Parameters<typeof createLandrushWaterMaterial>[2],
  parameters: Partial<WaterSceneMaterialParameters>,
  waveDepthTexture?: Texture,
) => LandrushWaterSurfaceMaterial

const WATER_LAB_RENDERER_CACHE = new WeakMap<HTMLCanvasElement, Promise<THREE.WebGPURenderer>>()
const WATER_LAB_MIN_DISTANCE = 2
const WATER_LAB_MAX_DISTANCE = 1400
const WATER_LAB_MIN_ZOOM = 0.75
const WATER_LAB_MAX_ZOOM = 80
const CLIFF_MIN_QUAD_AREA_METERS = 0.01
const CLIFF_MIN_QUAD_EDGE_METERS = 0.04
const LAND_ARTIFACT_EXPAND_METERS = 1
const LAND_ARTIFACT_LIFT_METERS = 0.18
const ISLAND_LOW_ELEVATION = -0.04
const ISLAND_SAND_ELEVATION = -0.1

function createWaterLabRenderer(props: { canvas?: HTMLCanvasElement }) {
  const canvas = props.canvas
  const cached = canvas ? WATER_LAB_RENDERER_CACHE.get(canvas) : undefined
  if (cached) return cached

  const promise = (async () => {
    const renderer = new THREE.WebGPURenderer(props as never)
    renderer.toneMapping = ACESFilmicToneMapping
    await renderer.init()
    return renderer
  })()
  if (canvas) WATER_LAB_RENDERER_CACHE.set(canvas, promise)
  return promise
}

export function WaterScene({
  artifactDiagnostics = {
    expandLand: false,
    hideWater: false,
    liftLand: false,
    maskLandWater: false,
    opaqueWater: false,
    showDepthTexture: false,
  },
  debugLayer,
  elevationParameters,
  fieldRevisionKey,
  fieldParameters,
  frameProfile = false,
  finalFieldEnabled = true,
  island,
  materialParameters,
  preset,
  previewTerrainFieldResolution,
  progressiveField = false,
  renderLandOverlay,
  terrainFieldResolution,
  showDepthReference,
  toneMapping = ACESFilmicToneMapping,
  waterFieldIsland,
  waterMaterialFactory = createLandrushWaterMaterial,
  waveDepthTextureEnabled = false,
}: WaterSceneProps) {
  const controlsTarget = useMemo(() => new Vector3(...preset.camera.target), [preset.camera.target])

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      frameloop="never"
      gl={createWaterLabRenderer as never}
      shadows={false}
    >
      <FrameLoadProfilerProbe enabled={frameProfile} />
      <WaterSceneToneMapping toneMapping={toneMapping} />
      <color args={['#164a77']} attach="background" />
      <OrthographicCamera
        far={900}
        makeDefault
        near={0.1}
        position={preset.camera.position}
        zoom={preset.camera.zoom}
      />
      <CameraTarget target={preset.camera.target} />
      <OrbitControls
        dampingFactor={0.08}
        enableDamping
        makeDefault
        maxDistance={WATER_LAB_MAX_DISTANCE}
        maxZoom={WATER_LAB_MAX_ZOOM}
        minDistance={WATER_LAB_MIN_DISTANCE}
        minZoom={WATER_LAB_MIN_ZOOM}
        target={controlsTarget}
      />
      <ambientLight intensity={1.25} />
      <directionalLight intensity={1.9} position={[46, 72, 34]} />
      <WaterMeshes
        key={fieldRevisionKey}
        artifactDiagnostics={artifactDiagnostics}
        debugLayer={debugLayer}
        elevationParameters={elevationParameters}
        fieldParameters={fieldParameters}
        finalFieldEnabled={finalFieldEnabled}
        island={island}
        materialParameters={materialParameters}
        previewTerrainFieldResolution={previewTerrainFieldResolution}
        progressiveField={progressiveField}
        renderLandOverlay={renderLandOverlay}
        terrainFieldResolution={terrainFieldResolution}
        showDepthReference={showDepthReference}
        waterFieldIsland={waterFieldIsland}
        waterMaterialFactory={waterMaterialFactory}
        waveDepthTextureEnabled={waveDepthTextureEnabled}
      />
    </Canvas>
  )
}

function WaterSceneToneMapping({ toneMapping }: { toneMapping: ToneMapping }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    gl.toneMapping = toneMapping
    scene.traverse((object) => {
      const material = (object as Mesh).material
      if (!material) return

      const materials = Array.isArray(material) ? material : [material]
      for (const entry of materials as Material[]) {
        entry.needsUpdate = true
      }
    })
  }, [gl, scene, toneMapping])

  return null
}

function CameraTarget({ target }: { target: [number, number, number] }) {
  const { camera, invalidate } = useThree()

  useEffect(() => {
    camera.lookAt(new Vector3(...target))
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, target])

  return null
}

function WaterMeshes({
  artifactDiagnostics,
  debugLayer,
  elevationParameters,
  fieldParameters,
  finalFieldEnabled,
  island,
  materialParameters,
  previewTerrainFieldResolution,
  progressiveField,
  renderLandOverlay,
  terrainFieldResolution,
  showDepthReference,
  waterFieldIsland,
  waterMaterialFactory,
  waveDepthTextureEnabled,
}: {
  artifactDiagnostics: WaterArtifactDiagnostics
  debugLayer: 'shoreline' | null
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  finalFieldEnabled: boolean
  island: LandrushIsland
  materialParameters: WaterSceneMaterialParameters
  previewTerrainFieldResolution?: number
  progressiveField: boolean
  renderLandOverlay?: (surface: WaterLandSurface) => ReactNode
  terrainFieldResolution: number
  showDepthReference: boolean
  waterFieldIsland: LandrushIsland
  waterMaterialFactory: WaterMaterialFactory
  waveDepthTextureEnabled: boolean
}) {
  const renderer = useThree((state) => state.gl)
  const shorelinePoints = useMemo(
    () => createSmoothedWaterPerimeter(island.perimeter.points),
    [island],
  )
  const waterFieldShorelinePoints = useMemo(
    () => createSmoothedWaterPerimeter(waterFieldIsland.perimeter.points),
    [waterFieldIsland],
  )
  const depthReferencePoints = useMemo(
    () => createDepthReferencePerimeter(shorelinePoints, fieldParameters),
    [fieldParameters, shorelinePoints],
  )
  const visualShorelinePoints = useMemo(
    () =>
      artifactDiagnostics.expandLand
        ? expandPointsFromCenter(shorelinePoints, LAND_ARTIFACT_EXPAND_METERS)
        : shorelinePoints,
    [artifactDiagnostics.expandLand, shorelinePoints],
  )
  const visualDepthReferencePoints = useMemo(
    () =>
      artifactDiagnostics.expandLand
        ? expandPointsFromCenter(depthReferencePoints, LAND_ARTIFACT_EXPAND_METERS)
        : depthReferencePoints,
    [artifactDiagnostics.expandLand, depthReferencePoints],
  )
  const elevationContours = useMemo(
    () => createElevationContours(visualShorelinePoints, elevationParameters),
    [elevationParameters, visualShorelinePoints],
  )
  const landLiftMeters = artifactDiagnostics.liftLand ? LAND_ARTIFACT_LIFT_METERS : 0
  const slopeStartPoints = elevationContours.outer
  const plateauPoints = elevationContours.inner
  const plateauElevation = ISLAND_LOW_ELEVATION + elevationParameters.edgeLiftMeters
  const hasElevation =
    elevationParameters.edgeLiftMeters > 0.001 &&
    elevationParameters.innerContourMeters - elevationParameters.outerContourMeters > 0.001
  const grassSurfacePoints = hasElevation ? plateauPoints : shorelinePoints
  const grassSurfaceElevation = hasElevation ? plateauElevation : ISLAND_LOW_ELEVATION + 0.02
  const landSurface = useMemo(
    () => ({
      grassSurfaceElevation,
      grassSurfacePoints,
      hasElevation,
      plateauElevation,
      plateauPoints,
      shorelinePoints,
      slopeStartPoints,
      waterPlaneSize: WATER_PLANE_SIZE,
    }),
    [
      grassSurfaceElevation,
      grassSurfacePoints,
      hasElevation,
      plateauElevation,
      plateauPoints,
      shorelinePoints,
      slopeStartPoints,
    ],
  )
  const islandShape = useMemo(() => shapeFromPoints(visualShorelinePoints), [visualShorelinePoints])
  const beachShape = useMemo(
    () => shapeFromPoints(visualDepthReferencePoints),
    [visualDepthReferencePoints],
  )
  const maskedWaterShape = useMemo(
    () => waterShapeWithHole(visualDepthReferencePoints, WATER_PLANE_SIZE),
    [visualDepthReferencePoints],
  )
  const plateauShape = useMemo(() => shapeFromPoints(plateauPoints), [plateauPoints])
  const cliffGeometry = useMemo(
    () =>
      createCliffRingGeometry(
        slopeStartPoints,
        plateauPoints,
        ISLAND_LOW_ELEVATION,
        plateauElevation,
        elevationParameters,
      ),
    [elevationParameters, plateauElevation, plateauPoints, slopeStartPoints],
  )
  const depthReferenceGeometry = useMemo(
    () => lineLoopGeometryFromPoints(depthReferencePoints),
    [depthReferencePoints],
  )
  const depthReferenceLine = useMemo(() => {
    const line = new ThreeLine(
      depthReferenceGeometry,
      new LineBasicMaterial({
        color: '#ff4fd8',
        depthTest: false,
        opacity: 0.95,
        transparent: true,
      }),
    )
    line.renderOrder = 30
    return line
  }, [depthReferenceGeometry])
  const waterFieldTextureParameters = useMemo(
    () => ({
      depthContourCollapseMeters: fieldParameters.depthContourCollapseMeters,
      depthContourCollapseScale: fieldParameters.depthContourCollapseScale,
      depthContourNoiseFrequency: fieldParameters.depthContourNoiseFrequency,
      depthContourOffsetMeters: fieldParameters.depthContourOffsetMeters,
      depthContourVariationMeters: fieldParameters.depthContourVariationMeters,
      shoreBandMeters: fieldParameters.shoreBandMeters,
      shoreFeatherMeters: fieldParameters.shoreFeatherMeters,
      shoreNoiseFrequency: fieldParameters.shoreNoiseFrequency,
      shoreVariationMeters: fieldParameters.shoreVariationMeters,
    }),
    [
      fieldParameters.depthContourCollapseMeters,
      fieldParameters.depthContourCollapseScale,
      fieldParameters.depthContourNoiseFrequency,
      fieldParameters.depthContourOffsetMeters,
      fieldParameters.depthContourVariationMeters,
      fieldParameters.shoreBandMeters,
      fieldParameters.shoreFeatherMeters,
      fieldParameters.shoreNoiseFrequency,
      fieldParameters.shoreVariationMeters,
    ],
  )
  const previewWaterFieldResolution =
    progressiveField && typeof previewTerrainFieldResolution === 'number'
      ? Math.min(terrainFieldResolution, previewTerrainFieldResolution)
      : terrainFieldResolution
  const previewWaterField = useMemo(
    () =>
      createWaterFieldTexture({
        parameters: waterFieldTextureParameters,
        perimeter: waterFieldShorelinePoints,
        planeSize: WATER_PLANE_SIZE,
        resolution: previewWaterFieldResolution,
      }),
    [previewWaterFieldResolution, waterFieldShorelinePoints, waterFieldTextureParameters],
  )
  const asyncWaterField = useAsyncWaterFieldTexture({
    parameters: waterFieldTextureParameters,
    perimeter: waterFieldShorelinePoints,
    planeSize: WATER_PLANE_SIZE,
    resolution: terrainFieldResolution,
    shouldGenerate:
      progressiveField &&
      finalFieldEnabled &&
      terrainFieldResolution !== previewWaterFieldResolution,
  })
  const stableWaterFieldRef = useRef<Texture | null>(null)
  if (stableWaterFieldRef.current === null) {
    stableWaterFieldRef.current = previewWaterField
  }
  const waterField = stableWaterFieldRef.current
  const waveDepthSmooth = materialParameters.waveDepthSmooth ?? 0
  const previewWaveDepthField = useMemo(
    () =>
      waveDepthTextureEnabled
        ? createWaveDepthFieldTexture(previewWaterField, fieldParameters, waveDepthSmooth)
        : previewWaterField,
    [fieldParameters, previewWaterField, waveDepthSmooth, waveDepthTextureEnabled],
  )
  const stableWaveDepthFieldRef = useRef<Texture | null>(null)
  if (stableWaveDepthFieldRef.current === null) {
    stableWaveDepthFieldRef.current = previewWaveDepthField
  }
  const waveDepthField = waveDepthTextureEnabled ? stableWaveDepthFieldRef.current : waterField
  const waterBounds = useMemo(() => createWaterBounds(WATER_PLANE_SIZE), [])
  const liveDepthMaterialParameters = useMemo(
    () => ({
      ...materialParameters,
      depthExponent: fieldParameters.depthExponent,
      depthNoiseFrequency: fieldParameters.depthNoiseFrequency,
      depthNoiseStrength: fieldParameters.depthNoiseStrength,
      depthReach: fieldParameters.depthReach,
      depthReferenceReach: WATER_FIELD_DEPTH_REFERENCE_REACH,
      edgeFadeDistance: fieldParameters.edgeFadeDistance,
    }),
    [
      fieldParameters.depthExponent,
      fieldParameters.depthNoiseFrequency,
      fieldParameters.depthNoiseStrength,
      fieldParameters.depthReach,
      fieldParameters.edgeFadeDistance,
      materialParameters,
    ],
  )
  const effectiveMaterialParameters = useMemo(
    () =>
      debugLayer === 'shoreline'
        ? {
            ...liveDepthMaterialParameters,
            iceRatio: 0,
            ripplesRatio: 0,
            splashesRatio: 0,
          }
        : liveDepthMaterialParameters,
    [debugLayer, liveDepthMaterialParameters],
  )
  const liveDepthMaterialParametersRef = useRef(liveDepthMaterialParameters)
  liveDepthMaterialParametersRef.current = liveDepthMaterialParameters
  const preservedWindTimeRef = useRef(0)
  const material = useMemo(() => {
    const nextMaterial = waterMaterialFactory(
      renderer as unknown as THREE.WebGPURenderer,
      waterField,
      waterBounds,
      liveDepthMaterialParametersRef.current,
      waveDepthField,
    )
    nextMaterial.userData.landrushWater.wind.localTime.value = preservedWindTimeRef.current
    return nextMaterial
  }, [renderer, waterBounds, waveDepthField, waterField, waterMaterialFactory])
  const materialRef = useRef<LandrushWaterSurfaceMaterial>(material)
  const appliedMaterialRef = useRef<LandrushWaterSurfaceMaterial | null>(null)
  const appliedMaterialParametersRef = useRef<LandrushWaterSurfaceParameters | null>(null)

  useEffect(() => {
    materialRef.current = material
    return () => material.dispose()
  }, [material])

  useEffect(() => {
    material.transparent = !artifactDiagnostics.opaqueWater
    material.depthWrite = artifactDiagnostics.opaqueWater
    material.needsUpdate = true
  }, [artifactDiagnostics.opaqueWater, material])

  useEffect(() => {
    const waterControls = material.userData
      .landrushWater as typeof material.userData.landrushWater & {
      setParameters?: (parameters: Partial<LandrushWaterSurfaceParameters>) => void
    }
    const previousParameters = appliedMaterialParametersRef.current
    if (appliedMaterialRef.current !== material || !previousParameters) {
      appliedMaterialRef.current = material
      appliedMaterialParametersRef.current = effectiveMaterialParameters
      return
    }

    const patch = diffWaterMaterialParameters(previousParameters, effectiveMaterialParameters)
    if (Object.keys(patch).length > 0) {
      waterControls.setParameters?.(patch)
    }
    appliedMaterialRef.current = material
    appliedMaterialParametersRef.current = effectiveMaterialParameters
  }, [effectiveMaterialParameters, material])

  useEffect(() => {
    if (progressiveField && finalFieldEnabled) return
    if (previewWaterField === waterField) return
    copyWaterFieldTextureData(waterField, previewWaterField)
  }, [finalFieldEnabled, previewWaterField, progressiveField, waterField])

  useEffect(() => {
    if (!waveDepthTextureEnabled) return
    if (progressiveField && finalFieldEnabled) return
    if (previewWaveDepthField === waveDepthField) return
    copyWaterFieldTextureData(waveDepthField, previewWaveDepthField)
  }, [
    finalFieldEnabled,
    previewWaveDepthField,
    progressiveField,
    waveDepthField,
    waveDepthTextureEnabled,
  ])

  useEffect(() => {
    if (!asyncWaterField) return
    copyWaterFieldTextureData(waterField, asyncWaterField)
  }, [asyncWaterField, waterField])

  useEffect(() => {
    if (!waveDepthTextureEnabled) return
    if (!asyncWaterField) return
    const asyncWaveDepthField = createWaveDepthFieldTexture(
      asyncWaterField,
      fieldParameters,
      waveDepthSmooth,
    )
    copyWaterFieldTextureData(waveDepthField, asyncWaveDepthField)
    asyncWaveDepthField.dispose()
  }, [asyncWaterField, fieldParameters, waveDepthField, waveDepthSmooth, waveDepthTextureEnabled])

  useEffect(() => () => waterField.dispose(), [waterField])
  useEffect(
    () => () => {
      if (waveDepthTextureEnabled) waveDepthField.dispose()
    },
    [waveDepthField, waveDepthTextureEnabled],
  )
  useEffect(() => () => depthReferenceGeometry.dispose(), [depthReferenceGeometry])
  useEffect(() => () => depthReferenceLine.material.dispose(), [depthReferenceLine])
  useEffect(() => () => cliffGeometry.dispose(), [cliffGeometry])

  useWaterMaterialAnimation(materialRef, preservedWindTimeRef)

  return (
    <group>
      {!artifactDiagnostics.hideWater ? (
        <mesh
          position={[0, LANDRUSH_WATER_SURFACE_ELEVATION, 0]}
          renderOrder={1}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {artifactDiagnostics.maskLandWater ? (
            <shapeGeometry args={[maskedWaterShape]} />
          ) : (
            <planeGeometry args={[WATER_PLANE_SIZE, WATER_PLANE_SIZE, 1, 1]} />
          )}
          <primitive attach="material" object={material} />
        </mesh>
      ) : null}

      <group position={[0, landLiftMeters, 0]}>
        <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[beachShape]} />
          <meshBasicMaterial color="#d8cb90" side={DoubleSide} />
        </mesh>

        <mesh position={[0, ISLAND_SAND_ELEVATION, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[islandShape]} />
          <meshBasicMaterial color="#d8cb90" side={DoubleSide} />
        </mesh>

        {hasElevation ? (
          <>
            <mesh geometry={cliffGeometry}>
              <meshStandardMaterial
                color="#ffffff"
                roughness={0.98}
                side={DoubleSide}
                vertexColors
              />
            </mesh>
            <mesh position={[0, plateauElevation, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <shapeGeometry args={[plateauShape]} />
              <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
            </mesh>
          </>
        ) : (
          <mesh position={[0, ISLAND_LOW_ELEVATION, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[islandShape]} />
            <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
          </mesh>
        )}

        {renderLandOverlay ? renderLandOverlay(landSurface) : null}
      </group>

      {showDepthReference ? <primitive object={depthReferenceLine} /> : null}
    </group>
  )
}

function useAsyncWaterFieldTexture({
  parameters,
  perimeter,
  planeSize,
  resolution,
  shouldGenerate,
}: {
  parameters: Partial<WaterFieldParameters>
  perimeter: readonly LandrushPoint2[]
  planeSize: number
  resolution: number
  shouldGenerate: boolean
}) {
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    setTexture(null)
    if (!shouldGenerate || typeof Worker === 'undefined') return

    let cancelled = false
    const worker = new Worker('/landrush-lab/water-field-worker.js')
    worker.onmessage = (event: MessageEvent) => {
      if (cancelled) return
      const payload = event.data as { bytes: ArrayBuffer; resolution: number }
      setTexture(createWaterFieldTextureFromData(new Uint8Array(payload.bytes), payload.resolution))
    }
    worker.postMessage({
      parameters,
      perimeter: perimeter.map((point) => ({ x: point.x, z: point.z })),
      planeSize,
      resolution,
    })

    return () => {
      cancelled = true
      worker.terminate()
    }
  }, [parameters, perimeter, planeSize, resolution, shouldGenerate])

  useEffect(() => () => texture?.dispose(), [texture])

  return texture
}

function createWaterFieldTextureFromData(bytes: Uint8Array, resolution: number) {
  const texture = new DataTexture(bytes, resolution, resolution, RGBAFormat)
  texture.flipY = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

export function createWaveDepthFieldTexture(
  sourceTexture: Texture,
  parameters: Pick<WaterFieldParameters, 'depthExponent' | 'depthReach' | 'edgeFadeDistance'>,
  smoothingRatio: number,
) {
  const image = sourceTexture.image as {
    data?: Uint8Array
    height?: number
    width?: number
  }
  const width = image.width ?? 1
  const height = image.height ?? width
  const source = image.data
  const baseValues = new Float32Array(width * height)
  const smoothedValues = new Float32Array(width * height)
  const bytes = new Uint8Array(width * height * 4)
  const smoothAmount = clamp01(smoothingRatio)

  if (!source) {
    return createWaterFieldTextureFromData(bytes, width)
  }

  for (let pixelIndex = 0; pixelIndex < baseValues.length; pixelIndex += 1) {
    const sourceIndex = pixelIndex * 4
    const depthRatio = ((source[sourceIndex] ?? 0) * 256 + (source[sourceIndex + 1] ?? 0)) / 65535
    if (depthRatio >= 0.995) {
      baseValues[pixelIndex] = -1
      continue
    }

    const edgeDistance = ((source[sourceIndex + 2] ?? 0) / 255) * WATER_FIELD_DEPTH_REFERENCE_REACH
    const edgeFade = smoothstep(0, parameters.edgeFadeDistance, edgeDistance)
    const offshore = clamp01(
      (depthRatio * WATER_FIELD_DEPTH_REFERENCE_REACH) / Math.max(parameters.depthReach, 0.001),
    )
    baseValues[pixelIndex] = (1 - offshore ** parameters.depthExponent) * edgeFade
  }

  const radius = Math.max(1, Math.round((3 / WATER_PLANE_SIZE) * Math.max(width, height)))
  const diagonalRadius = Math.max(1, Math.round(radius * Math.SQRT1_2))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x
      const baseValue = baseValues[pixelIndex] ?? -1
      if (baseValue < 0) {
        smoothedValues[pixelIndex] = -1
        continue
      }

      const smoothedValue = weightedWaveDepthSample(baseValues, width, height, x, y, [
        [0, 0, 0.2],
        [radius, 0, 0.12],
        [-radius, 0, 0.12],
        [0, radius, 0.12],
        [0, -radius, 0.12],
        [diagonalRadius, diagonalRadius, 0.08],
        [-diagonalRadius, diagonalRadius, 0.08],
        [diagonalRadius, -diagonalRadius, 0.08],
        [-diagonalRadius, -diagonalRadius, 0.08],
      ])
      smoothedValues[pixelIndex] = lerp(baseValue, smoothedValue, smoothAmount)
    }
  }

  for (let pixelIndex = 0; pixelIndex < smoothedValues.length; pixelIndex += 1) {
    const value = smoothedValues[pixelIndex] ?? -1
    const byteValue = value < 0 ? 0 : byteFromUnit(value)
    const index = pixelIndex * 4
    bytes[index] = byteValue
    bytes[index + 1] = byteValue
    bytes[index + 2] = byteValue
    bytes[index + 3] = value < 0 ? 0 : 255
  }

  return createWaterFieldTextureFromData(bytes, width)
}

function weightedWaveDepthSample(
  values: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  samples: readonly (readonly [number, number, number])[],
) {
  let weightedValue = 0
  let totalWeight = 0

  for (const [offsetX, offsetY, weight] of samples) {
    const sampleX = Math.max(0, Math.min(width - 1, x + offsetX))
    const sampleY = Math.max(0, Math.min(height - 1, y + offsetY))
    const sampleValue = values[sampleY * width + sampleX]
    if (sampleValue === undefined || sampleValue < 0) continue
    weightedValue += sampleValue * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedValue / totalWeight : values[y * width + x] || 0
}

function copyWaterFieldTextureData(target: Texture, source: Texture) {
  const targetTexture = target as DataTexture
  const sourceTexture = source as DataTexture
  const targetData = targetTexture.image.data as Uint8Array | null
  const sourceData = sourceTexture.image.data as Uint8Array | null
  if (!targetData || !sourceData) return

  if (
    targetTexture.image.width === sourceTexture.image.width &&
    targetTexture.image.height === sourceTexture.image.height &&
    targetData.length === sourceData.length
  ) {
    targetData.set(sourceData)
  } else {
    targetTexture.image = {
      data: sourceData.slice(),
      height: sourceTexture.image.height,
      width: sourceTexture.image.width,
    }
  }
  targetTexture.needsUpdate = true
}

function diffWaterMaterialParameters(
  previousParameters: LandrushWaterSurfaceParameters,
  nextParameters: LandrushWaterSurfaceParameters,
) {
  const patch: Partial<LandrushWaterSurfaceParameters> = {}
  const keys = Object.keys(nextParameters) as Array<keyof LandrushWaterSurfaceParameters>
  for (const key of keys) {
    if (previousParameters[key] !== nextParameters[key]) {
      patch[key] = nextParameters[key] as never
    }
  }
  return patch
}

function useWaterMaterialAnimation(
  materialRef: RefObject<LandrushWaterSurfaceMaterial>,
  preservedWindTimeRef: MutableRefObject<number>,
) {
  const advance = useThree((state) => state.advance)

  useEffect(() => {
    let animationFrame = 0
    let elapsedSeconds = 0
    let previousTime = window.performance.now()

    const update = (time: number) => {
      const deltaSeconds = Math.min(Math.max((time - previousTime) / 1000, 0), 0.08)
      previousTime = time
      elapsedSeconds += deltaSeconds

      measureLandrushFrameSlice('scene.water.material-update', () => {
        const water = materialRef.current?.userData.landrushWater
        if (!water) return

        water.update(deltaSeconds)
        preservedWindTimeRef.current = water.wind.localTime.value
      })

      advance(elapsedSeconds)
      animationFrame = window.requestAnimationFrame(update)
    }

    animationFrame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [advance, materialRef, preservedWindTimeRef])
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

function waterShapeWithHole(holePoints: readonly LandrushPoint2[], planeSize: number) {
  const half = planeSize / 2
  const shape = new Shape()
  shape.moveTo(-half, -half)
  shape.lineTo(half, -half)
  shape.lineTo(half, half)
  shape.lineTo(-half, half)
  shape.closePath()

  if (holePoints.length < 3) return shape

  const hole = holePoints.map((point) => new Vector2(point.x, -point.z))
  const orientedHole = signedArea2(hole) > 0 ? [...hole].reverse() : hole
  const holePath = new Path()
  const first = orientedHole[0]
  if (!first) return shape

  holePath.moveTo(first.x, first.y)
  for (let index = 1; index < orientedHole.length; index += 1) {
    const point = orientedHole[index]
    if (point) holePath.lineTo(point.x, point.y)
  }
  holePath.closePath()
  shape.holes.push(holePath)
  return shape
}

function signedArea2(points: readonly Vector2[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue
    area += current.x * next.y - next.x * current.y
  }
  return area * 0.5
}

function expandPointsFromCenter(points: readonly LandrushPoint2[], meters: number) {
  if (points.length < 3 || Math.abs(meters) <= 0.0001) return points
  const center = centerForPoints(points)

  return points.map((point) => {
    const dx = point.x - center.x
    const dz = point.z - center.z
    const length = Math.hypot(dx, dz) || 1
    return {
      x: point.x + (dx / length) * meters,
      z: point.z + (dz / length) * meters,
    }
  })
}

function createElevationContours(
  points: readonly LandrushPoint2[],
  parameters: IslandElevationParameters,
) {
  if (points.length < 3) return { inner: [...points], outer: [...points] }
  const center = centerForPoints(points)
  const outerBase = Math.max(0, parameters.outerContourMeters)
  const innerBase = Math.max(outerBase + 0.5, parameters.innerContourMeters)
  const variation = Math.max(0, parameters.contourVariationMeters)
  const frequency = Math.max(0.001, parameters.contourNoiseFrequency)
  const outer: LandrushPoint2[] = []
  const inner: LandrushPoint2[] = []

  for (const point of points) {
    const dx = center.x - point.x
    const dz = center.z - point.z
    const distanceToCenter = Math.hypot(dx, dz) || 1
    const angle = Math.atan2(point.z - center.z, point.x - center.x)
    const outerNoise = elevationContourNoise(point, angle, frequency, 15.9)
    const innerNoise = elevationContourNoise(point, angle, frequency, 43.7)
    const outerInset = clampRange(
      outerBase + outerNoise * variation * 0.5,
      0,
      distanceToCenter * 0.82,
    )
    const innerInset = clampRange(
      innerBase + innerNoise * variation,
      outerInset + 0.75,
      distanceToCenter * 0.94,
    )

    outer.push(insetPoint(point, dx, dz, distanceToCenter, outerInset))
    inner.push(insetPoint(point, dx, dz, distanceToCenter, innerInset))
  }

  return { inner, outer }
}

function insetPoint(point: LandrushPoint2, dx: number, dz: number, length: number, inset: number) {
  return {
    x: point.x + (dx / length) * inset,
    z: point.z + (dz / length) * inset,
  }
}

function elevationContourNoise(
  point: LandrushPoint2,
  angle: number,
  frequency: number,
  seed: number,
) {
  const primary = fbm(point.x * frequency, point.z * frequency, seed) * 2 - 1
  const secondary =
    fbm((point.x + 73) * frequency * 2.15, (point.z - 41) * frequency * 2.15, seed + 19.4) * 2 - 1
  const lobe =
    Math.sin(angle * 3.2 + seed * 0.11) * 0.32 + Math.sin(angle * 6.7 - seed * 0.07) * 0.18
  const pocket = smoothstep(0.4, 1, Math.sin(angle * 5.1 + seed * 0.2) * 0.5 + 0.5)

  return primary * 0.52 + secondary * 0.26 + lobe - pocket * 0.18
}

function createCliffRingGeometry(
  outerPoints: readonly LandrushPoint2[],
  innerPoints: readonly LandrushPoint2[],
  outerElevation: number,
  innerElevation: number,
  parameters: IslandElevationParameters,
) {
  const pointCount = Math.min(outerPoints.length, innerPoints.length)
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  if (pointCount < 3) return geometry

  const averageCliffTone = averageCliffRingTone(pointCount, parameters)
  const bandGroups = createCliffBandGroups(
    innerPoints,
    pointCount,
    parameters.cliffBandMergeThresholdMeters,
  )
  const normalOuterPoints = createNormalAlignedOuterPoints(innerPoints, outerPoints, pointCount)
  const bandMeshes = bandGroups
    .map((group) =>
      createCliffBandMesh(
        group,
        innerPoints,
        normalOuterPoints,
        pointCount,
        parameters,
        averageCliffTone,
      ),
    )
    .filter((mesh): mesh is CliffBandMesh => mesh !== null)

  for (const mesh of bandMeshes) {
    for (let index = 0; index < mesh.points.length - 1; index += 1) {
      const current = mesh.points[index]
      const next = mesh.points[index + 1]
      if (!(current && next)) continue

      addColoredQuad(
        positions,
        colors,
        indices,
        normals,
        [
          { x: current.outer.x, y: outerElevation, z: current.outer.z },
          { x: next.outer.x, y: outerElevation, z: next.outer.z },
          { x: next.inner.x, y: innerElevation, z: next.inner.z },
          { x: current.inner.x, y: innerElevation, z: current.inner.z },
        ],
        mesh.colors.outer,
      )
    }

    addCliffBlockDepthSurfaces(
      positions,
      colors,
      indices,
      normals,
      mesh,
      outerElevation,
      innerElevation,
    )
  }

  addCliffBlockDepthSeams(
    positions,
    colors,
    indices,
    normals,
    bandMeshes,
    outerElevation,
    innerElevation,
  )

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  return geometry
}

type CliffBandGroup = {
  endIndex: number
  lengthMeters: number
  startIndex: number
}

type CliffBandMesh = {
  colors: CliffFaceColorSet
  depthMeters: number
  direction: LandrushPoint2
  group: CliffBandGroup
  points: readonly CliffBandPoint[]
}

type CliffBandPoint = {
  inner: LandrushPoint2
  outer: LandrushPoint2
}

function createCliffBandMesh(
  group: CliffBandGroup,
  innerPoints: readonly LandrushPoint2[],
  outerPoints: readonly LandrushPoint2[],
  pointCount: number,
  parameters: IslandElevationParameters,
  averageCliffTone: CliffColor,
): CliffBandMesh | null {
  const direction = cliffBlockDirectionForGroup(group, innerPoints, outerPoints, pointCount)
  const rawPoints = collectCliffBandPoints(group, innerPoints, outerPoints, pointCount)
  const points = alignCliffBandPointsToBlockFrame(rawPoints, direction)
  if (points.length < 2) return null

  const requestedDepth = cliffBlockDepthForGroup(group, pointCount, parameters)
  const depthMeters = safeCliffBlockDepthForPoints(points, direction, requestedDepth)
  const segmentTone = mixColor(
    cliffRockTone(group.startIndex * 17.71 + pointCount * 0.37, parameters),
    averageCliffTone,
    clamp01(parameters.cliffColorAverageRatio),
  )

  return {
    colors: cliffFaceColors(segmentTone, parameters),
    depthMeters,
    direction,
    group,
    points,
  }
}

function collectCliffBandPoints(
  group: CliffBandGroup,
  innerPoints: readonly LandrushPoint2[],
  outerPoints: readonly LandrushPoint2[],
  pointCount: number,
) {
  const points: CliffBandPoint[] = []
  let index = group.startIndex
  let guard = 0

  while (guard <= pointCount) {
    const inner = innerPoints[index]
    const outer = outerPoints[index]
    if (inner && outer) {
      points.push({ inner, outer })
    }

    if (index === group.endIndex) break
    index = (index + 1) % pointCount
    guard += 1
  }

  return points
}

function alignCliffBandPointsToBlockFrame(
  points: readonly CliffBandPoint[],
  direction: LandrushPoint2,
) {
  if (points.length < 2) return points

  const firstPoint = points[0]
  if (!firstPoint) return points

  let tangent = normalize2(-direction.z, direction.x)
  const centers = points.map((point) => midpoint2(point.inner, point.outer))
  let tangentTravel = 0

  for (let index = 1; index < centers.length; index += 1) {
    const previous = centers[index - 1]
    const current = centers[index]
    if (!(previous && current)) continue
    tangentTravel += dot2({ x: current.x - previous.x, z: current.z - previous.z }, tangent)
  }

  if (tangentTravel < 0) {
    tangent = { x: -tangent.x, z: -tangent.z }
  }

  const origin = midpoint2(firstPoint.inner, firstPoint.outer)
  const alignedPoints: CliffBandPoint[] = []
  let previousU = 0

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const center = centers[index]
    const previousCenter = centers[index - 1]
    if (!(point && center)) continue

    let stationU = dot2({ x: center.x - origin.x, z: center.z - origin.z }, tangent)
    if (index > 0 && previousCenter) {
      const centerStep = distance2(previousCenter, center)
      if (stationU <= previousU + 0.02) {
        stationU = previousU + Math.max(0.02, centerStep)
      }
    }

    previousU = stationU
    alignedPoints.push({
      inner: projectPointToBlockStation(point.inner, origin, tangent, direction, stationU),
      outer: projectPointToBlockStation(point.outer, origin, tangent, direction, stationU),
    })
  }

  return alignedPoints
}

function midpoint2(a: LandrushPoint2, b: LandrushPoint2) {
  return {
    x: (a.x + b.x) * 0.5,
    z: (a.z + b.z) * 0.5,
  }
}

function projectPointToBlockStation(
  point: LandrushPoint2,
  origin: LandrushPoint2,
  tangent: LandrushPoint2,
  direction: LandrushPoint2,
  stationU: number,
) {
  const localV = dot2({ x: point.x - origin.x, z: point.z - origin.z }, direction)

  return {
    x: origin.x + tangent.x * stationU + direction.x * localV,
    z: origin.z + tangent.z * stationU + direction.z * localV,
  }
}

function safeCliffBlockDepthForPoints(
  points: readonly CliffBandPoint[],
  direction: LandrushPoint2,
  requestedDepth: number,
) {
  const depth = Math.max(0, requestedDepth)
  if (depth <= 0.001 || cliffBlockDepthIsClean(points, direction, depth)) return depth

  let low = 0
  let high = depth
  for (let index = 0; index < 12; index += 1) {
    const midpoint = (low + high) * 0.5
    if (cliffBlockDepthIsClean(points, direction, midpoint)) {
      low = midpoint
    } else {
      high = midpoint
    }
  }

  return low > 0.05 ? low : 0
}

function cliffBlockDepthIsClean(
  points: readonly CliffBandPoint[],
  direction: LandrushPoint2,
  depthMeters: number,
) {
  return (
    ribbonLoopIsClean(
      points.map((point) => point.inner),
      direction,
      depthMeters,
    ) &&
    ribbonLoopIsClean(
      points.map((point) => point.outer),
      direction,
      depthMeters,
    )
  )
}

function ribbonLoopIsClean(
  points: readonly LandrushPoint2[],
  direction: LandrushPoint2,
  depthMeters: number,
) {
  if (points.length < 2 || depthMeters <= 0.001) return true

  const loop = [
    ...points,
    ...points.map((point) => offsetPoint2(point, direction, depthMeters)).reverse(),
  ]

  return !polygonSelfIntersects2(loop)
}

function offsetPoint2(point: LandrushPoint2, direction: LandrushPoint2, depthMeters: number) {
  return {
    x: point.x + direction.x * depthMeters,
    z: point.z + direction.z * depthMeters,
  }
}

function addCliffBlockDepthSurfaces(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  mesh: CliffBandMesh,
  outerElevation: number,
  innerElevation: number,
) {
  if (mesh.depthMeters <= 0.001) return

  const frontInner = mesh.points.map(({ inner }) => pointToCliffVertex(inner, innerElevation))
  const frontOuter = mesh.points.map(({ outer }) => pointToCliffVertex(outer, outerElevation))
  const backInner = mesh.points.map(({ inner }) =>
    offsetCliffPoint(inner, innerElevation, mesh.direction, mesh.depthMeters),
  )
  const backOuter = mesh.points.map(({ outer }) =>
    offsetCliffPoint(outer, outerElevation, mesh.direction, mesh.depthMeters),
  )

  addTriangulatedPolygonSurface(
    positions,
    colors,
    indices,
    normals,
    [...frontInner, ...[...backInner].reverse()],
    mesh.colors.top,
    { x: 0, y: 1, z: 0 },
  )
  addTriangulatedPolygonSurface(
    positions,
    colors,
    indices,
    normals,
    [...frontOuter, ...[...backOuter].reverse()],
    mesh.colors.bottom,
    { x: 0, y: -1, z: 0 },
  )
  for (let index = 0; index < backOuter.length - 1; index += 1) {
    const currentOuter = backOuter[index]
    const nextOuter = backOuter[index + 1]
    const currentInner = backInner[index]
    const nextInner = backInner[index + 1]
    if (!(currentOuter && nextOuter && currentInner && nextInner)) continue

    addColoredQuad(
      positions,
      colors,
      indices,
      normals,
      [currentOuter, nextOuter, nextInner, currentInner],
      mesh.colors.inner,
    )
  }
}

function createCliffBandGroups(
  innerPoints: readonly LandrushPoint2[],
  pointCount: number,
  mergeThresholdMeters: number,
) {
  const threshold = Math.max(0, mergeThresholdMeters)
  const groups: CliffBandGroup[] = []
  let startIndex = 0

  while (startIndex < pointCount) {
    let currentIndex = startIndex
    let lengthMeters = 0
    let segmentCount = 0

    while (segmentCount < pointCount) {
      const nextIndex = (currentIndex + 1) % pointCount
      const start = innerPoints[currentIndex]
      const end = innerPoints[nextIndex]
      if (!(start && end)) break

      lengthMeters += distance2(start, end)
      segmentCount += 1
      currentIndex = nextIndex

      if (threshold <= 0 || lengthMeters >= threshold || currentIndex === 0) break
    }

    if (segmentCount === 0) break

    groups.push({ endIndex: currentIndex, lengthMeters, startIndex })
    if (currentIndex === 0) break
    startIndex = currentIndex
  }

  const lastGroup = groups.at(-1)
  const previousGroup = groups.at(-2)
  if (threshold > 0 && lastGroup && previousGroup && lastGroup.lengthMeters < threshold) {
    previousGroup.endIndex = lastGroup.endIndex
    previousGroup.lengthMeters += lastGroup.lengthMeters
    groups.pop()
  }

  const onlyGroup = groups[0]
  if (groups.length === 1 && onlyGroup && onlyGroup.startIndex === onlyGroup.endIndex) {
    return createEvenCliffBandGroups(innerPoints, pointCount, Math.min(4, pointCount))
  }

  return groups
}

function createEvenCliffBandGroups(
  innerPoints: readonly LandrushPoint2[],
  pointCount: number,
  groupCount: number,
) {
  const groups: CliffBandGroup[] = []

  for (let index = 0; index < groupCount; index += 1) {
    const startIndex = Math.floor((index * pointCount) / groupCount)
    const endIndex = Math.floor(((index + 1) * pointCount) / groupCount) % pointCount
    if (startIndex === endIndex) continue

    groups.push({
      endIndex,
      lengthMeters: distanceAlongClosedPoints(innerPoints, startIndex, endIndex),
      startIndex,
    })
  }

  return groups
}

function createNormalAlignedOuterPoints(
  innerPoints: readonly LandrushPoint2[],
  referenceOuterPoints: readonly LandrushPoint2[],
  pointCount: number,
) {
  const points: LandrushPoint2[] = []

  for (let index = 0; index < pointCount; index += 1) {
    const inner = innerPoints[index]
    const referenceOuter = referenceOuterPoints[index]
    const previous = innerPoints[(index - 1 + pointCount) % pointCount]
    const next = innerPoints[(index + 1) % pointCount]
    if (!(inner && referenceOuter && previous && next)) continue

    const tangent = normalize2(next.x - previous.x, next.z - previous.z)
    const firstNormal = normalize2(-tangent.z, tangent.x)
    const secondNormal = normalize2(tangent.z, -tangent.x)
    const referenceOffset = {
      x: referenceOuter.x - inner.x,
      z: referenceOuter.z - inner.z,
    }
    const outwardNormal =
      dot2(firstNormal, referenceOffset) >= dot2(secondNormal, referenceOffset)
        ? firstNormal
        : secondNormal
    const projectedWidth = dot2(outwardNormal, referenceOffset)
    const fallbackWidth = Math.hypot(referenceOffset.x, referenceOffset.z)
    const width = Math.max(projectedWidth, fallbackWidth * 0.35, 0.2)

    points[index] = {
      x: inner.x + outwardNormal.x * width,
      z: inner.z + outwardNormal.z * width,
    }
  }

  return points
}

function cliffBlockDirectionForGroup(
  group: CliffBandGroup,
  innerPoints: readonly LandrushPoint2[],
  outerPoints: readonly LandrushPoint2[],
  pointCount: number,
) {
  let x = 0
  let z = 0
  let index = group.startIndex
  let vertexCount = 0

  while (vertexCount <= pointCount) {
    const inner = innerPoints[index]
    const outer = outerPoints[index]
    if (inner && outer) {
      const dx = outer.x - inner.x
      const dz = outer.z - inner.z
      const distance = Math.hypot(dx, dz)
      if (distance > 0.0001) {
        x += dx / distance
        z += dz / distance
      }
    }

    if (index === group.endIndex) break
    index = (index + 1) % pointCount
    vertexCount += 1
  }

  return normalize2(x, z)
}

function cliffBlockDepthForGroup(
  group: CliffBandGroup,
  pointCount: number,
  parameters: IslandElevationParameters,
) {
  const minDepth = Math.max(
    0,
    Math.min(parameters.cliffBlockDepthMinMeters, parameters.cliffBlockDepthMaxMeters),
  )
  const maxDepth = Math.max(
    0,
    Math.max(parameters.cliffBlockDepthMinMeters, parameters.cliffBlockDepthMaxMeters),
  )
  if (maxDepth <= 0.001) return 0

  return lerp(
    minDepth,
    maxDepth,
    hashUnit(group.startIndex * 11.37 + pointCount * 0.29, group.endIndex * 7.13 + 5.7),
  )
}

function addCliffBlockDepthSeams(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  bandMeshes: readonly CliffBandMesh[],
  outerElevation: number,
  innerElevation: number,
) {
  if (bandMeshes.length < 2) return

  for (let index = 0; index < bandMeshes.length; index += 1) {
    const mesh = bandMeshes[index]
    const nextMesh = bandMeshes[(index + 1) % bandMeshes.length]
    if (!(mesh && nextMesh)) continue

    const meshPoint = mesh.points.at(-1)
    const nextPoint = nextMesh.points[0]
    if (!(meshPoint && nextPoint)) continue

    const meshFrontOuter = pointToCliffVertex(meshPoint.outer, outerElevation)
    const meshFrontInner = pointToCliffVertex(meshPoint.inner, innerElevation)
    const nextFrontOuter = pointToCliffVertex(nextPoint.outer, outerElevation)
    const nextFrontInner = pointToCliffVertex(nextPoint.inner, innerElevation)
    const meshBackOuter = offsetCliffPoint(
      meshPoint.outer,
      outerElevation,
      mesh.direction,
      mesh.depthMeters,
    )
    const meshBackInner = offsetCliffPoint(
      meshPoint.inner,
      innerElevation,
      mesh.direction,
      mesh.depthMeters,
    )
    const nextBackOuter = offsetCliffPoint(
      nextPoint.outer,
      outerElevation,
      nextMesh.direction,
      nextMesh.depthMeters,
    )
    const nextBackInner = offsetCliffPoint(
      nextPoint.inner,
      innerElevation,
      nextMesh.direction,
      nextMesh.depthMeters,
    )
    const seamColor =
      mesh.depthMeters >= nextMesh.depthMeters ? mesh.colors.side : nextMesh.colors.side

    addColoredQuad(
      positions,
      colors,
      indices,
      normals,
      [meshFrontOuter, nextFrontOuter, nextFrontInner, meshFrontInner],
      seamColor,
    )
    addColoredQuad(
      positions,
      colors,
      indices,
      normals,
      [meshBackOuter, nextBackOuter, nextBackInner, meshBackInner],
      seamColor,
    )
    addColoredQuad(
      positions,
      colors,
      indices,
      normals,
      [meshFrontInner, nextFrontInner, nextBackInner, meshBackInner],
      mesh.colors.top,
    )
    addColoredQuad(
      positions,
      colors,
      indices,
      normals,
      [nextFrontOuter, meshFrontOuter, meshBackOuter, nextBackOuter],
      mesh.colors.bottom,
    )
  }
}

type CliffVertex = {
  x: number
  y: number
  z: number
}

type CliffColor = [number, number, number]
type CliffFaceColorSet = {
  bottom: CliffColor
  inner: CliffColor
  outer: CliffColor
  side: CliffColor
  top: CliffColor
}
type CliffQuad = readonly [CliffVertex, CliffVertex, CliffVertex, CliffVertex]
type CliffTriangle = readonly [CliffVertex, CliffVertex, CliffVertex]
type CliffNormal = { x: number; y: number; z: number }
type Point2Like = { x: number; z: number }

function pointToCliffVertex(point: LandrushPoint2, y: number): CliffVertex {
  return {
    x: point.x,
    y,
    z: point.z,
  }
}

function offsetCliffPoint(
  point: LandrushPoint2,
  y: number,
  direction: LandrushPoint2,
  depthMeters: number,
): CliffVertex {
  return {
    x: point.x + direction.x * depthMeters,
    y,
    z: point.z + direction.z * depthMeters,
  }
}

function addTriangulatedPolygonSurface(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  vertices: readonly CliffVertex[],
  color: CliffColor,
  normalHint: CliffNormal,
) {
  const cleanVertices = cleanPolygonVertices(vertices)
  if (cleanVertices.length < 3 || polygonSelfIntersects2(cleanVertices)) return

  const triangles = ShapeUtils.triangulateShape(
    cleanVertices.map((vertex) => new Vector2(vertex.x, vertex.z)),
    [],
  )

  for (const triangle of triangles) {
    const [firstIndex, secondIndex, thirdIndex] = triangle
    if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined) {
      continue
    }

    const first = cleanVertices[firstIndex]
    const second = cleanVertices[secondIndex]
    const third = cleanVertices[thirdIndex]
    if (!(first && second && third)) continue

    addColoredTriangleFacing(
      positions,
      colors,
      indices,
      normals,
      [first, second, third],
      color,
      normalHint,
    )
  }
}

function cleanPolygonVertices(vertices: readonly CliffVertex[]) {
  const cleanVertices: CliffVertex[] = []

  for (const vertex of vertices) {
    const previous = cleanVertices.at(-1)
    if (previous && distance3(previous, vertex) <= 0.0001) continue
    cleanVertices.push(vertex)
  }

  const first = cleanVertices[0]
  const last = cleanVertices.at(-1)
  if (first && last && cleanVertices.length > 1 && distance3(first, last) <= 0.0001) {
    cleanVertices.pop()
  }

  return cleanVertices
}

function addColoredQuad(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  vertices: CliffQuad,
  color: CliffColor,
) {
  if (!isRenderableQuad(vertices)) return

  const baseIndex = positions.length / 3
  const normal = normalForQuad(vertices)
  for (const vertex of vertices) {
    positions.push(vertex.x, vertex.y, vertex.z)
    colors.push(color[0], color[1], color[2])
    normals.push(normal.x, normal.y, normal.z)
  }
  indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
}

function addColoredTriangle(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  vertices: CliffTriangle,
  color: CliffColor,
) {
  if (!isRenderableTriangle(vertices)) return

  const baseIndex = positions.length / 3
  const normal = normalForTriangle(vertices)
  for (const vertex of vertices) {
    positions.push(vertex.x, vertex.y, vertex.z)
    colors.push(color[0], color[1], color[2])
    normals.push(normal.x, normal.y, normal.z)
  }
  indices.push(baseIndex, baseIndex + 1, baseIndex + 2)
}

function addColoredTriangleFacing(
  positions: number[],
  colors: number[],
  indices: number[],
  normals: number[],
  vertices: CliffTriangle,
  color: CliffColor,
  normalHint: CliffNormal,
) {
  const normal = normalForTriangle(vertices)
  const orientedVertices =
    dot3(normal, normalHint) < 0
      ? ([vertices[0], vertices[2], vertices[1]] as CliffTriangle)
      : vertices

  addColoredTriangle(positions, colors, indices, normals, orientedVertices, color)
}

function isRenderableQuad(vertices: CliffQuad) {
  const [first, second, third, fourth] = vertices
  const shortestEdge = Math.min(
    distance3(first, second),
    distance3(second, third),
    distance3(third, fourth),
    distance3(fourth, first),
  )

  return (
    shortestEdge >= CLIFF_MIN_QUAD_EDGE_METERS &&
    quadArea(vertices) >= CLIFF_MIN_QUAD_AREA_METERS &&
    !horizontalQuadFolds(vertices)
  )
}

function isRenderableTriangle(vertices: CliffTriangle) {
  const [first, second, third] = vertices
  const shortestEdge = Math.min(
    distance3(first, second),
    distance3(second, third),
    distance3(third, first),
  )

  return (
    shortestEdge >= CLIFF_MIN_QUAD_EDGE_METERS &&
    triangleArea(first, second, third) >= CLIFF_MIN_QUAD_AREA_METERS * 0.5
  )
}

function normalForQuad(vertices: CliffQuad): CliffNormal {
  const [first, second, third, fourth] = vertices
  const firstNormal = cross3(subtract3(second, first), subtract3(third, first))
  const secondNormal = cross3(subtract3(third, first), subtract3(fourth, first))
  const normal = {
    x: firstNormal.x + secondNormal.x,
    y: firstNormal.y + secondNormal.y,
    z: firstNormal.z + secondNormal.z,
  }
  const length = Math.hypot(normal.x, normal.y, normal.z)

  if (length <= 0.000001) {
    return { x: 0, y: 1, z: 0 }
  }

  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function normalForTriangle(vertices: CliffTriangle): CliffNormal {
  const [first, second, third] = vertices
  const normal = cross3(subtract3(second, first), subtract3(third, first))
  const length = Math.hypot(normal.x, normal.y, normal.z)

  if (length <= 0.000001) {
    return { x: 0, y: 1, z: 0 }
  }

  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function quadArea(vertices: CliffQuad) {
  const [first, second, third, fourth] = vertices
  return triangleArea(first, second, third) + triangleArea(first, third, fourth)
}

function triangleArea(first: CliffVertex, second: CliffVertex, third: CliffVertex) {
  const normal = cross3(subtract3(second, first), subtract3(third, first))
  return Math.hypot(normal.x, normal.y, normal.z) * 0.5
}

function horizontalQuadFolds(vertices: CliffQuad) {
  const [first, second, third, fourth] = vertices
  const minY = Math.min(first.y, second.y, third.y, fourth.y)
  const maxY = Math.max(first.y, second.y, third.y, fourth.y)
  if (maxY - minY > 0.0001) return false

  return (
    segmentsIntersect2(first, second, third, fourth) ||
    segmentsIntersect2(second, third, fourth, first)
  )
}

function polygonSelfIntersects2(points: readonly Point2Like[]) {
  if (points.length < 4) return false

  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex]
    const firstEnd = points[(firstIndex + 1) % points.length]
    if (!(firstStart && firstEnd)) continue

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (polygonEdgesAreAdjacent(firstIndex, secondIndex, points.length)) continue

      const secondStart = points[secondIndex]
      const secondEnd = points[(secondIndex + 1) % points.length]
      if (!(secondStart && secondEnd)) continue
      if (segmentsIntersect2(firstStart, firstEnd, secondStart, secondEnd)) return true
    }
  }

  return false
}

function polygonEdgesAreAdjacent(firstIndex: number, secondIndex: number, pointCount: number) {
  return (
    Math.abs(firstIndex - secondIndex) <= 1 || (firstIndex === 0 && secondIndex === pointCount - 1)
  )
}

function segmentsIntersect2(
  firstStart: Point2Like,
  firstEnd: Point2Like,
  secondStart: Point2Like,
  secondEnd: Point2Like,
) {
  const firstA = orientation2(firstStart, firstEnd, secondStart)
  const firstB = orientation2(firstStart, firstEnd, secondEnd)
  const secondA = orientation2(secondStart, secondEnd, firstStart)
  const secondB = orientation2(secondStart, secondEnd, firstEnd)

  return firstA * firstB < -0.000001 && secondA * secondB < -0.000001
}

function orientation2(a: Point2Like, b: Point2Like, c: Point2Like) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function subtract3(a: CliffVertex, b: CliffVertex): CliffNormal {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

function cross3(a: CliffNormal, b: CliffNormal): CliffNormal {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot3(a: CliffNormal, b: CliffNormal) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function distance3(a: CliffVertex, b: CliffVertex) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function cliffRockTone(seed: number, parameters: IslandElevationParameters): CliffColor {
  const palette: readonly CliffColor[] = [
    [0.5, 0.35, 0.2],
    [0.38, 0.29, 0.2],
    [0.58, 0.48, 0.29],
    [0.33, 0.33, 0.3],
    [0.25, 0.18, 0.12],
    [0.47, 0.4, 0.31],
  ]
  const baseIndex = Math.floor(hashUnit(seed, 3.7) * palette.length) % palette.length
  const nextIndex = Math.floor(hashUnit(seed, 7.9) * palette.length) % palette.length
  const fallback: CliffColor = [0.5, 0.35, 0.2]
  const base = palette[baseIndex] ?? fallback
  const secondary = palette[nextIndex] ?? fallback
  const tone = mixColor(
    base,
    secondary,
    hashUnit(seed, 13.4) * parameters.cliffToneVariation * 0.28,
  )
  const brightness =
    0.78 +
    hashUnit(seed, 19.1) * parameters.cliffToneVariation * 0.34 +
    (hashUnit(seed, 23.8) - 0.5) * parameters.cliffContrast * 0.24

  return scaleColor(tone, brightness)
}

function averageCliffRingTone(
  segmentCount: number,
  parameters: IslandElevationParameters,
): CliffColor {
  if (segmentCount <= 0) {
    return [0.5, 0.35, 0.2]
  }

  let red = 0
  let green = 0
  let blue = 0

  for (let index = 0; index < segmentCount; index += 1) {
    const tone = cliffRockTone(index * 17.71 + segmentCount * 0.37, parameters)
    red += tone[0]
    green += tone[1]
    blue += tone[2]
  }

  return [red / segmentCount, green / segmentCount, blue / segmentCount]
}

function cliffFaceColors(
  base: CliffColor,
  parameters: IslandElevationParameters,
): CliffFaceColorSet {
  const contrast = parameters.cliffContrast

  return {
    bottom: scaleColor(base, 0.42 + contrast * 0.08),
    inner: scaleColor(base, 0.88 - contrast * 0.08),
    outer: scaleColor(base, 0.62 - contrast * 0.12),
    side: scaleColor(base, 0.7 - contrast * 0.1),
    top: base,
  }
}

function lineLoopGeometryFromPoints(points: readonly LandrushPoint2[]) {
  const geometry = new BufferGeometry()
  const closedPointCount = points.length + 1
  const positions = new Float32Array(closedPointCount * 3)
  for (let index = 0; index < closedPointCount; index += 1) {
    const point = points[index % points.length]
    if (!point) continue
    positions[index * 3] = point.x
    positions[index * 3 + 1] = 0.16
    positions[index * 3 + 2] = point.z
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function centerForPoints(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function distanceAlongClosedPoints(
  points: readonly LandrushPoint2[],
  startIndex: number,
  endIndex: number,
) {
  let currentIndex = startIndex
  let distance = 0
  let segmentCount = 0

  while (segmentCount < points.length && currentIndex !== endIndex) {
    const nextIndex = (currentIndex + 1) % points.length
    const start = points[currentIndex]
    const end = points[nextIndex]
    if (!(start && end)) break

    distance += distance2(start, end)
    currentIndex = nextIndex
    segmentCount += 1
  }

  return distance
}

function distance2(a: LandrushPoint2, b: LandrushPoint2) {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 0.000001)))
  return t * t * (3 - 2 * t)
}

function byteFromUnit(value: number) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalize2(x: number, z: number) {
  const length = Math.hypot(x, z) || 1
  return { x: x / length, z: z / length }
}

function dot2(a: { x: number; z: number }, b: { x: number; z: number }) {
  return a.x * b.x + a.z * b.z
}

function fbm(x: number, y: number, seed: number) {
  let value = 0
  let amplitude = 0.55
  let frequency = 1

  for (let index = 0; index < 4; index += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + index * 17.17) * amplitude
    frequency *= 2.04
    amplitude *= 0.5
  }

  return value
}

function valueNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return lerp(
    lerp(gridHash(ix, iy, seed), gridHash(ix + 1, iy, seed), ux),
    lerp(gridHash(ix, iy + 1, seed), gridHash(ix + 1, iy + 1, seed), ux),
    uy,
  )
}

function hashUnit(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function gridHash(x: number, y: number, seed: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function scaleColor(color: [number, number, number], scale: number): [number, number, number] {
  return [
    clampRange(color[0] * scale, 0, 1),
    clampRange(color[1] * scale, 0, 1),
    clampRange(color[2] * scale, 0, 1),
  ]
}

function createWaterBounds(size: number) {
  const half = size / 2
  return {
    depth: size,
    maxX: half,
    maxZ: half,
    minX: -half,
    minZ: -half,
    width: size,
  }
}
