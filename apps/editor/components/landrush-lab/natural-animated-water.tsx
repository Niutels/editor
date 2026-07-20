'use client'

import { PASCAL_WATER_LOW_ELEVATION, type PascalWaterLandSurface } from '@pascal-app/nodes'
import { renderScheduler } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  PlaneGeometry,
  RGBAFormat,
} from 'three'
import {
  cameraPosition,
  color,
  cos,
  float,
  fwidth,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
  sin,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'
import { MeshBasicNodeMaterial, type Node as TSLNode } from 'three/webgpu'

export type NaturalWaterDebugMode =
  | 'bands'
  | 'compression'
  | 'contour'
  | 'contour-field'
  | 'depth'
  | 'displacement'
  | 'final'
  | 'foam-events'
  | 'glare'
  | 'glints'
  | 'normals'
  | 'opacity'
  | 'terrain'
  | 'warp'
  | 'wave-foam'
export type NaturalWaterQuality = 'balanced' | 'high'

export type NaturalWaterParameters = {
  deepOpacity: number
  depthColorCount: number
  depthColors: [string, string, string, string, string, string]
  depthFalloff: number
  depthTintStrength: number
  depthThresholds: [number, number, number, number, number]
  depthTransitionSmoothness: number
  detailRelief: number
  foamColor: string
  foamColorRampPosition: number
  foamEmissionStrength: number
  foamWhiteRampPosition: number
  glareSaturation: number
  glareSize: number
  glareStrength: number
  glareTint: string
  macroRelief: number
  maxDepth: number
  oceanAlignment: number
  oceanChoppiness: number
  oceanColorA: string
  oceanColorB: string
  oceanDamping: number
  oceanDirectionDegrees: number
  oceanSmallestWave: number
  oceanTimeScale: number
  oceanWaveScale: number
  oceanWindVelocity: number
  outcropCoverage: number
  outcropScale: number
  plateauHeight: number
  plateauVariation: number
  sandPatchContrast: number
  seabedFeatureScale: number
  seed: number
  shallowOpacity: number
  shoreContourBreakup: number
  shoreContourFluctuation: number
  shoreContourMotionSpeed: number
  shoreContourOpacity: number
  shoreContourReach: number
  shoreContourSoftness: number
  shoreContourWidth: number
  shoreContourWispScale: number
  shoreRiseDistance: number
  surfaceGlintStrength: number
  surfaceWarpStrength: number
  terraceStep: number
  terraceStrength: number
  waveFoamCoverage: number
  waveFoamOpacity: number
}

export const DEFAULT_NATURAL_WATER_PARAMETERS: NaturalWaterParameters = {
  deepOpacity: 0.085,
  depthColorCount: 5,
  depthColors: ['#1cbec0', '#0da7b7', '#078bae', '#086d9e', '#07538b', '#063a75'],
  depthFalloff: 1.22,
  depthTintStrength: 1,
  depthThresholds: [0.55, 1.5, 3, 5.2, 7.8],
  depthTransitionSmoothness: 0.9,
  detailRelief: 0.5,
  foamColor: '#fffdf4',
  foamColorRampPosition: 0.356,
  foamEmissionStrength: 10.7,
  foamWhiteRampPosition: 0.265,
  glareSaturation: 1,
  glareSize: 0.5,
  glareStrength: 0.907,
  glareTint: '#ffad32',
  macroRelief: 1.65,
  maxDepth: 10,
  oceanAlignment: 0.461,
  oceanChoppiness: 0.9,
  oceanColorA: '#087bc8',
  oceanColorB: '#1619c9',
  oceanDamping: 0.734,
  oceanDirectionDegrees: 90,
  oceanSmallestWave: 0.9,
  oceanTimeScale: 0.42,
  oceanWaveScale: 3.7,
  oceanWindVelocity: 15,
  outcropCoverage: 0.08,
  outcropScale: 30,
  plateauHeight: 1.45,
  plateauVariation: 0.25,
  sandPatchContrast: 0.8,
  seabedFeatureScale: 62,
  seed: 29,
  shallowOpacity: 0.025,
  shoreContourBreakup: 0.58,
  shoreContourFluctuation: 1,
  shoreContourMotionSpeed: 0.65,
  shoreContourOpacity: 0.72,
  shoreContourReach: 1.35,
  shoreContourSoftness: 0.78,
  shoreContourWidth: 0.22,
  shoreContourWispScale: 14,
  shoreRiseDistance: 72,
  surfaceGlintStrength: 0.72,
  surfaceWarpStrength: 0.55,
  terraceStep: 0.85,
  terraceStrength: 0.42,
  waveFoamCoverage: 0,
  waveFoamOpacity: 0.58,
}

export function createDefaultNaturalWaterParameters(): NaturalWaterParameters {
  return {
    ...DEFAULT_NATURAL_WATER_PARAMETERS,
    depthColors: [...DEFAULT_NATURAL_WATER_PARAMETERS.depthColors],
    depthThresholds: [...DEFAULT_NATURAL_WATER_PARAMETERS.depthThresholds],
  }
}

const NATURAL_WATER_LEVEL = PASCAL_WATER_LOW_ELEVATION
const NATURAL_WATER_ENCODED_MAX_ELEVATION = 2.05

const NATURAL_WATER_QUALITY = {
  balanced: { fieldResolution: 384, planeSegments: 144 },
  high: { fieldResolution: 640, planeSegments: 224 },
} as const

const NATURAL_OCEAN_BANDS = [
  { amplitude: 1, angleOffset: 0, speed: 0.82, wavelength: 1 },
  { amplitude: 0.52, angleOffset: 0.72, speed: 0.91, wavelength: 0.56 },
  { amplitude: 0.28, angleOffset: -0.88, speed: 1.03, wavelength: 0.31 },
  { amplitude: 0.14, angleOffset: 1.62, speed: 1.11, wavelength: 0.17 },
  { amplitude: 0.065, angleOffset: -2.05, speed: 1.19, wavelength: 0.085 },
  { amplitude: 0.028, angleOffset: 2.86, speed: 1.31, wavelength: 0 },
] as const

type NaturalWaterPoint = { x: number; z: number }
type NaturalWaterRing = {
  cumulativeLengths: readonly number[]
  length: number
  points: readonly NaturalWaterPoint[]
}
type NaturalWaterDisposable = { dispose: () => void }
type NaturalWaterTerrainParameters = Pick<
  NaturalWaterParameters,
  | 'depthFalloff'
  | 'detailRelief'
  | 'macroRelief'
  | 'maxDepth'
  | 'outcropCoverage'
  | 'outcropScale'
  | 'plateauHeight'
  | 'plateauVariation'
  | 'seabedFeatureScale'
  | 'seed'
  | 'shoreRiseDistance'
  | 'terraceStep'
  | 'terraceStrength'
>
type NaturalWaterField = {
  aboveWaterRatio: number
  encodingMax: number
  encodingMin: number
  maxElevation: number
  minElevation: number
  planeSegments: number
  resolution: number
  shoreDistanceRange: number
  shorelineLength: number
  terrainGeometry: PlaneGeometry
  texture: DataTexture
  waterGeometry: PlaneGeometry
}
type NaturalWaterRuntimeDebug = {
  algorithm: 'shared-deterministic-coastal-water-field'
  animated: boolean
  debugMode: NaturalWaterDebugMode
  field: {
    aboveWaterRatio: number
    maxElevation: number
    minElevation: number
    quantizationMeters: number
    resolution: number
    shoreDistanceRange: number
    shorelineLength: number
    texelSizeMeters: number
  }
  noPost: true
  parameters: NaturalWaterParameters
  planeSegments: number
  quality: NaturalWaterQuality
  rendering: {
    analyticWaveCount: number
    glareDrawCalls: number
    postProcessRenderTargets: number
    waterDrawCalls: number
  }
  timeSeconds: number
}

declare global {
  interface Window {
    __LANDRUSH_NATURAL_WATER_DEBUG__?: NaturalWaterRuntimeDebug
  }
}

const pendingNaturalWaterDisposals = new WeakMap<NaturalWaterDisposable, { cancelled: boolean }>()

export function NaturalAnimatedWater({
  animate = true,
  debugMode,
  parameters,
  quality,
  resetRevision,
  surface,
}: {
  animate?: boolean
  debugMode: NaturalWaterDebugMode
  parameters: NaturalWaterParameters
  quality: NaturalWaterQuality
  resetRevision: number
  surface: PascalWaterLandSurface
}) {
  const invalidate = useThree((state) => state.invalidate)
  const { fieldResolution, planeSegments } = NATURAL_WATER_QUALITY[quality]
  const waterTime = useMemo(() => uniform(0), [])
  const terrainParameters = useMemo<NaturalWaterTerrainParameters>(
    () => ({
      depthFalloff: parameters.depthFalloff,
      detailRelief: parameters.detailRelief,
      macroRelief: parameters.macroRelief,
      maxDepth: parameters.maxDepth,
      outcropCoverage: parameters.outcropCoverage,
      outcropScale: parameters.outcropScale,
      plateauHeight: parameters.plateauHeight,
      plateauVariation: parameters.plateauVariation,
      seabedFeatureScale: parameters.seabedFeatureScale,
      seed: parameters.seed,
      shoreRiseDistance: parameters.shoreRiseDistance,
      terraceStep: parameters.terraceStep,
      terraceStrength: parameters.terraceStrength,
    }),
    [
      parameters.depthFalloff,
      parameters.detailRelief,
      parameters.macroRelief,
      parameters.maxDepth,
      parameters.outcropCoverage,
      parameters.outcropScale,
      parameters.plateauHeight,
      parameters.plateauVariation,
      parameters.seabedFeatureScale,
      parameters.seed,
      parameters.shoreRiseDistance,
      parameters.terraceStep,
      parameters.terraceStrength,
    ],
  )
  const field = useMemo(
    () => createNaturalWaterField(surface, terrainParameters, planeSegments, fieldResolution),
    [fieldResolution, planeSegments, surface, terrainParameters],
  )
  const terrainMaterial = useMemo(
    () => createNaturalWaterTerrainMaterial(field, debugMode, parameters, surface.waterPlaneSize),
    [debugMode, field, parameters, surface.waterPlaneSize],
  )
  const waterMaterial = useMemo(
    () =>
      createNaturalWaterSurfaceMaterial(
        field,
        debugMode,
        parameters,
        surface.waterPlaneSize,
        waterTime,
      ),
    [debugMode, field, parameters, surface.waterPlaneSize, waterTime],
  )
  const glareMaterial = useMemo(
    () =>
      createNaturalWaterGlareMaterial(
        field,
        debugMode,
        parameters,
        surface.waterPlaneSize,
        waterTime,
      ),
    [debugMode, field, parameters, surface.waterPlaneSize, waterTime],
  )
  const timeValue = waterTime as unknown as { value: number }

  useDeferredNaturalWaterDisposal(field.texture)
  useDeferredNaturalWaterDisposal(field.terrainGeometry)
  useDeferredNaturalWaterDisposal(field.waterGeometry)
  useDeferredNaturalWaterDisposal(terrainMaterial)
  useDeferredNaturalWaterDisposal(waterMaterial)
  useDeferredNaturalWaterDisposal(glareMaterial)

  useEffect(() => {
    if (resetRevision < 0) return
    timeValue.value = 0
    invalidate()
    renderScheduler.requestFrame('geometry:changed')
  }, [invalidate, resetRevision, timeValue])

  useEffect(() => {
    if (!(field && terrainMaterial && waterMaterial)) return
    invalidate()
    renderScheduler.requestFrame('geometry:changed')
  }, [field, invalidate, terrainMaterial, waterMaterial])

  useEffect(() => {
    window.__LANDRUSH_NATURAL_WATER_DEBUG__ = {
      algorithm: 'shared-deterministic-coastal-water-field',
      animated: animate,
      debugMode,
      field: {
        aboveWaterRatio: field.aboveWaterRatio,
        maxElevation: field.maxElevation,
        minElevation: field.minElevation,
        quantizationMeters: (field.encodingMax - field.encodingMin) / 1024,
        resolution: field.resolution,
        shoreDistanceRange: field.shoreDistanceRange,
        shorelineLength: field.shorelineLength,
        texelSizeMeters: surface.waterPlaneSize / Math.max(1, field.resolution - 1),
      },
      noPost: true,
      parameters: {
        ...parameters,
        depthColors: [...parameters.depthColors],
        depthThresholds: [...parameters.depthThresholds],
      },
      planeSegments,
      quality,
      rendering: {
        analyticWaveCount: NATURAL_OCEAN_BANDS.length,
        glareDrawCalls: parameters.glareStrength > 0 ? 1 : 0,
        postProcessRenderTargets: 0,
        waterDrawCalls: parameters.glareStrength > 0 ? 3 : 2,
      },
      timeSeconds: timeValue.value,
    }
    return () => {
      delete window.__LANDRUSH_NATURAL_WATER_DEBUG__
    }
  }, [
    animate,
    debugMode,
    field,
    parameters,
    planeSegments,
    quality,
    surface.waterPlaneSize,
    timeValue,
  ])

  useFrame((_, delta) => {
    if (animate && document.visibilityState !== 'hidden') {
      timeValue.value += Math.min(Math.max(delta, 0), 0.05)
      invalidate()
    }
    const runtimeDebug = window.__LANDRUSH_NATURAL_WATER_DEBUG__
    if (runtimeDebug) {
      runtimeDebug.animated = animate
      runtimeDebug.timeSeconds = timeValue.value
    }
  })

  return (
    <>
      <mesh
        dispose={null}
        geometry={field.terrainGeometry}
        key={`natural-sand:${field.terrainGeometry.uuid}`}
        material={terrainMaterial}
        renderOrder={-20}
        userData={{ __pascalSkipMaterialHighlight: true }}
      />
      <mesh
        dispose={null}
        geometry={field.waterGeometry}
        key={`natural-water:${field.waterGeometry.uuid}`}
        material={waterMaterial}
        position={[0, NATURAL_WATER_LEVEL, 0]}
        renderOrder={debugMode === 'final' ? -10 : 80}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ __pascalSkipMaterialHighlight: true }}
      />
      <mesh
        dispose={null}
        geometry={field.waterGeometry}
        key={`natural-water-glare:${field.waterGeometry.uuid}`}
        material={glareMaterial}
        position={[0, NATURAL_WATER_LEVEL + 0.012, 0]}
        renderOrder={-9}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ __pascalSkipMaterialHighlight: true }}
      />
    </>
  )
}

function createNaturalWaterField(
  surface: PascalWaterLandSurface,
  parameters: NaturalWaterTerrainParameters,
  planeSegments: number,
  resolution: number,
): NaturalWaterField {
  const shoreline = createNaturalWaterRing(surface.shorelinePoints)
  const plateau = createNaturalWaterRing(surface.grassSurfacePoints)
  const fieldData = new Uint16Array(resolution * resolution * 4)
  const terrainGeometry = new PlaneGeometry(
    surface.waterPlaneSize,
    surface.waterPlaneSize,
    planeSegments,
    planeSegments,
  )
  terrainGeometry.rotateX(-Math.PI / 2)
  const terrainPositions = terrainGeometry.getAttribute('position')
  const encodingMin = -Math.max(0.5, parameters.maxDepth)
  const encodingMax = NATURAL_WATER_ENCODED_MAX_ELEVATION
  const shoreDistanceRange = Math.max(
    12,
    Math.min(surface.waterPlaneSize * 0.5, parameters.shoreRiseDistance * 1.5),
  )
  let minElevation = Number.POSITIVE_INFINITY
  let maxElevation = Number.NEGATIVE_INFINITY
  let aboveWaterCount = 0

  const planeHalfExtent = surface.waterPlaneSize * 0.5
  const fieldStep = surface.waterPlaneSize / Math.max(1, resolution - 1)

  for (let row = 0; row < resolution; row += 1) {
    const z = -planeHalfExtent + row * fieldStep
    for (let column = 0; column < resolution; column += 1) {
      const x = -planeHalfExtent + column * fieldStep
      const index = row * resolution + column
      const sample = sampleNaturalWaterTerrain(x, z, shoreline, plateau, parameters)
      const relativeElevation = clampRange(sample.elevation, encodingMin, encodingMax)
      const normalizedElevation = clamp01(
        (relativeElevation - encodingMin) / Math.max(0.0001, encodingMax - encodingMin),
      )
      const dataOffset = index * 4
      fieldData[dataOffset] = DataUtils.toHalfFloat(normalizedElevation)
      fieldData[dataOffset + 1] = DataUtils.toHalfFloat(sample.sandPatch)
      fieldData[dataOffset + 2] = DataUtils.toHalfFloat(sample.shoreArc)
      fieldData[dataOffset + 3] = DataUtils.toHalfFloat(
        clamp01(sample.shoreDistance / shoreDistanceRange),
      )
      minElevation = Math.min(minElevation, relativeElevation)
      maxElevation = Math.max(maxElevation, relativeElevation)
      if (relativeElevation > 0) aboveWaterCount += 1
    }
  }

  for (let index = 0; index < terrainPositions.count; index += 1) {
    const x = terrainPositions.getX(index)
    const z = terrainPositions.getZ(index)
    const sample = sampleNaturalWaterTerrain(x, z, shoreline, plateau, parameters)
    const relativeElevation = clampRange(sample.elevation, encodingMin, encodingMax)
    terrainPositions.setY(index, NATURAL_WATER_LEVEL + relativeElevation)
  }

  terrainPositions.needsUpdate = true
  terrainGeometry.computeVertexNormals()
  terrainGeometry.computeBoundingBox()
  terrainGeometry.computeBoundingSphere()

  const fieldTexture = new DataTexture(fieldData, resolution, resolution, RGBAFormat, HalfFloatType)
  fieldTexture.flipY = false
  fieldTexture.generateMipmaps = false
  fieldTexture.magFilter = LinearFilter
  fieldTexture.minFilter = LinearFilter
  fieldTexture.wrapS = ClampToEdgeWrapping
  fieldTexture.wrapT = ClampToEdgeWrapping
  fieldTexture.name = `natural-water-shared-heightfield-${resolution}`
  fieldTexture.needsUpdate = true

  return {
    aboveWaterRatio: aboveWaterCount / Math.max(1, resolution * resolution),
    encodingMax,
    encodingMin,
    maxElevation: Number.isFinite(maxElevation) ? maxElevation : 0,
    minElevation: Number.isFinite(minElevation) ? minElevation : 0,
    planeSegments,
    resolution,
    shoreDistanceRange,
    shorelineLength: shoreline.length,
    terrainGeometry,
    texture: fieldTexture,
    waterGeometry: new PlaneGeometry(
      surface.waterPlaneSize,
      surface.waterPlaneSize,
      planeSegments,
      planeSegments,
    ),
  }
}

function sampleNaturalWaterTerrain(
  x: number,
  z: number,
  shoreline: NaturalWaterRing,
  plateau: NaturalWaterRing,
  parameters: NaturalWaterTerrainParameters,
) {
  const insideShoreline = naturalWaterPointInPolygon(x, z, shoreline.points)
  const insidePlateau = naturalWaterPointInPolygon(x, z, plateau.points)
  const shorelineQuery = naturalWaterClosestRingPoint(x, z, shoreline)
  const plateauQuery = naturalWaterClosestRingPoint(x, z, plateau)
  const shorelineDistance = shorelineQuery.distance
  const plateauDistance = plateauQuery.distance
  const seed = parameters.seed * 19.19 + 7.73
  const featureScale = Math.max(20, parameters.seabedFeatureScale)
  const warpScale = Math.max(18, featureScale * 0.82)
  const warpAmount = Math.max(7, Math.min(24, parameters.shoreRiseDistance * 0.18))
  const warpX =
    (naturalWaterFbm(x / warpScale + 11.7, z / warpScale - 4.3, seed + 13.7) - 0.5) * warpAmount
  const warpZ =
    (naturalWaterFbm(x / warpScale - 8.1, z / warpScale + 16.4, seed + 31.9) - 0.5) * warpAmount
  const warpedX = x + warpX
  const warpedZ = z + warpZ
  const macro = naturalWaterFbm(warpedX / featureScale, warpedZ / featureScale, seed + 51.3)
  const ridgeField = naturalWaterFbm(
    (warpedX + 31.7) / (featureScale * 0.52),
    (warpedZ - 19.4) / (featureScale * 0.52),
    seed + 67.9,
  )
  const channelField = naturalWaterFbm(
    (warpedX - 23.1) / (featureScale * 0.71),
    (warpedZ + 37.6) / (featureScale * 0.71),
    seed + 73.7,
  )
  const detail = naturalWaterFbm(warpedX / 15, warpedZ / 15, seed + 79.1)
  const microDetail = naturalWaterFbm(warpedX / 7.2, warpedZ / 7.2, seed + 91.7)
  const terracePhaseField = naturalWaterFbm(
    (warpedX + 53.8) / (featureScale * 0.64),
    (warpedZ - 42.5) / (featureScale * 0.64),
    seed + 95.3,
  )
  const patchBroad = naturalWaterFbm(warpedX / 25, warpedZ / 25, seed + 101.7)
  const patchDetail = naturalWaterFbm(warpedX / 8.5, warpedZ / 8.5, seed + 137.3)
  const sandPatch = clamp01(patchBroad * 0.76 + patchDetail * 0.24)
  let elevation: number

  if (insidePlateau) {
    elevation = parameters.plateauHeight - 0.055
  } else if (insideShoreline) {
    const coastProgress = smootherstepNumber(
      0,
      1,
      shorelineDistance / Math.max(0.001, shorelineDistance + plateauDistance),
    )
    const transitionRelief =
      ((macro - 0.5) * parameters.macroRelief + (detail - 0.5) * parameters.detailRelief) *
      Math.sin(Math.PI * coastProgress) *
      0.38
    elevation = lerp(-0.055, parameters.plateauHeight - 0.055, coastProgress) + transitionRelief
  } else {
    const shoreProgress = smoothstepNumber(
      0,
      Math.max(1, parameters.shoreRiseDistance),
      shorelineDistance,
    )
    const shelfDepth = shoreProgress ** Math.max(0.25, parameters.depthFalloff)
    const shelfElevation = lerp(-0.055, -parameters.maxDepth, shelfDepth)
    const reliefWindow = smootherstepNumber(1.25, 9, shorelineDistance)
    const ridgeProfile = 1 - Math.abs(ridgeField * 2 - 1)
    const channelCut = smoothstepNumber(0.6, 0.86, channelField)
    const broadRelief =
      (macro - 0.5) * 2 * parameters.macroRelief * 1.18 +
      (ridgeProfile - 0.5) * 2 * parameters.macroRelief * 0.52 -
      channelCut * parameters.macroRelief * 0.46
    const fineRelief =
      ((detail - 0.5) * 1.42 + (microDetail - 0.5) * 0.58) * parameters.detailRelief
    const preTerraceElevation = shelfElevation + broadRelief * reliefWindow
    const terraceStep = Math.max(0.08, parameters.terraceStep)
    const terracePhase = (terracePhaseField - 0.5) * terraceStep * 1.35
    const terracedElevation =
      Math.round((preTerraceElevation + terracePhase) / terraceStep) * terraceStep - terracePhase
    elevation =
      lerp(
        preTerraceElevation,
        terracedElevation,
        clamp01(parameters.terraceStrength) * reliefWindow,
      ) +
      fineRelief * reliefWindow

    const shoreBoost =
      1 -
      smoothstepNumber(
        parameters.shoreRiseDistance * 0.32,
        parameters.shoreRiseDistance * 1.22,
        shorelineDistance,
      )
    const outcropNoise = naturalWaterFbm(
      warpedX / Math.max(8, parameters.outcropScale),
      warpedZ / Math.max(8, parameters.outcropScale),
      seed + 173.9,
    )
    const outcropThreshold = 0.8 - clamp01(parameters.outcropCoverage) * 0.24 - shoreBoost * 0.035
    const outcropMask =
      smoothstepNumber(outcropThreshold, outcropThreshold + 0.09, outcropNoise) *
      smoothstepNumber(12, 22, shorelineDistance)
    const outcropVariation =
      (naturalWaterFbm(warpedX / 19, warpedZ / 19, seed + 211.1) - 0.5) *
      2 *
      parameters.plateauVariation
    const outcropHeight = clampRange(parameters.plateauHeight + outcropVariation, 1, 2)
    elevation = lerp(elevation, outcropHeight, outcropMask)
  }

  return {
    elevation: clampRange(elevation, -parameters.maxDepth, 2),
    sandPatch,
    shoreArc: shorelineQuery.arc,
    shoreDistance: shorelineDistance,
  }
}

function createNaturalWaterTerrainMaterial(
  field: NaturalWaterField,
  debugMode: NaturalWaterDebugMode,
  parameters: NaturalWaterParameters,
  planeSize: number,
) {
  const fieldSample = sampleNaturalWaterField(field, positionLocal.xz, planeSize)
  const elevation = decodeNaturalWaterElevation(fieldSample.r, field)
  const patch = fieldSample.g
    .sub(0.5)
    .mul(Math.max(0, parameters.sandPatchContrast))
    .add(0.5)
    .clamp(0, 1)
  const warmSand = color('#d7b778')
  const paleSand = color('#f4dfac')
  const wetSand = color('#ead6aa')
  const drySand = mix(warmSand, paleSand, patch)
  const dryWeight = elevation.smoothstep(0.02, 0.38)
  const finalSand = mix(mix(wetSand, drySand, 0.72), drySand, dryWeight)
  const depth = elevation.negate().max(0)
  const waterCoverage = depth.smoothstep(0.0015, 0.055)
  const depthRamp = createNaturalWaterDepthRamp(depth, parameters)
  const depthPaint = depthRamp.toonColor.mul(patch.sub(0.5).mul(0.22).add(1))
  const tintStrength = depthRamp.bandProgress
    .mul(0.06)
    .add(0.94)
    .mul(clamp01(parameters.depthTintStrength))
    .mul(waterCoverage)
  const depthFilteredSand = mix(finalSand, depthPaint, tintStrength)
  const normalizedElevation = elevation
    .sub(field.encodingMin)
    .div(field.encodingMax - field.encodingMin)
    .clamp(0, 1)
  const normalizedDepth = depth.div(Math.max(0.1, parameters.maxDepth)).clamp(0, 1)
  const terrainDebug = mix(
    mix(color('#172554'), color('#38bdf8'), normalizedDepth.oneMinus()),
    color('#f8d58f'),
    elevation.smoothstep(-0.02, 0.2),
  ).mul(normalizedElevation.mul(0.18).add(0.82))
  const depthDebug = mix(
    finalSand,
    mix(color('#91e8d4'), color('#082a63'), normalizedDepth.pow(0.58)),
    waterCoverage,
  )
  const bandDebug = mix(finalSand, depthRamp.toonColor, waterCoverage)
  const resolvedColor =
    debugMode === 'terrain'
      ? terrainDebug
      : debugMode === 'depth'
        ? depthDebug
        : debugMode === 'bands'
          ? bandDebug
          : depthFilteredSand
  const material = new MeshBasicNodeMaterial({
    depthTest: true,
    depthWrite: true,
    side: DoubleSide,
  })
  material.colorNode = resolvedColor
  material.toneMapped = false
  material.name = 'natural-water-shared-sand-terrain'
  material.userData.naturalWaterField = {
    coordinateSpace: 'world-xz',
    source: 'shared-heightfield',
  }
  material.userData.__pascalSkipMaterialHighlight = true
  return material
}

function createNaturalWaterSurfaceMaterial(
  field: NaturalWaterField,
  debugMode: NaturalWaterDebugMode,
  parameters: NaturalWaterParameters,
  planeSize: number,
  waterTime: TSLNode<'float'>,
) {
  const coordinates = vec2(positionLocal.x, positionLocal.y.negate())
  const fieldSample = sampleNaturalWaterField(field, coordinates, planeSize)
  const terrainElevation = decodeNaturalWaterElevation(fieldSample.r, field)
  const depth = terrainElevation.negate().max(0)
  const depthRamp = createNaturalWaterDepthRamp(depth, parameters)

  const waveDepthAttenuation = depth.smoothstep(0.08, 0.9)
  const geometryWaves = createNaturalOceanWaveBundle(
    coordinates,
    waterTime,
    parameters,
    waveDepthAttenuation,
    planeSize / Math.max(1, field.planeSegments),
    false,
  )
  const surfaceWaves = createNaturalOceanWaveBundle(
    coordinates,
    waterTime,
    parameters,
    waveDepthAttenuation,
    planeSize / Math.max(1, field.planeSegments),
    true,
  )
  const waterNormal = surfaceWaves.normal
  const waterOnly = depth.smoothstep(0.0015, 0.055)
  const warpStrength = clamp01(parameters.surfaceWarpStrength)
  const warpOffset = vec2(waterNormal.x, waterNormal.z).mul(warpStrength * -18)
  const warpedFieldSample = sampleNaturalWaterField(field, coordinates.add(warpOffset), planeSize)
  const warpedDepth = decodeNaturalWaterElevation(warpedFieldSample.r, field).negate().max(0)
  const warpedDepthRamp = createNaturalWaterDepthRamp(warpedDepth, parameters)
  const surfaceLight = waterNormal
    .dot(vec3(-0.46, 0.84, -0.28).normalize())
    .mul(0.14)
    .add(0.92)
  const baseSurfaceColor = mix(
    color('#d8fff7'),
    color('#4bb8c4'),
    depthRamp.bandProgress.mul(0.28),
  ).mul(surfaceLight)
  const refractedSurfaceColor = mix(
    baseSurfaceColor,
    warpedDepthRamp.toonColor,
    float(warpStrength * 0.075),
  )
  const waveFoam = createNaturalOceanFoamMask(surfaceWaves, coordinates, parameters).mul(waterOnly)
  const foamColorRamp = waveFoam.smoothstep(
    Math.max(0, parameters.foamColorRampPosition - 0.16),
    Math.max(0.001, parameters.foamColorRampPosition),
  )
  const foamWhiteRamp = waveFoam.smoothstep(
    Math.max(0, parameters.foamWhiteRampPosition - 0.12),
    Math.max(0.001, parameters.foamWhiteRampPosition),
  )
  const paintedOceanColor = mix(
    color(parameters.oceanColorA),
    color(parameters.oceanColorB),
    foamColorRamp,
  )
  const toonSurfaceColor = mix(refractedSurfaceColor, paintedOceanColor, 0.44)
  const glint = createNaturalWaterGlintMask(
    surfaceWaves,
    coordinates,
    waterTime,
    waterOnly,
    parameters,
  )
  const clearSurfaceColor = mix(toonSurfaceColor, color('#f2ffff'), glint.mul(0.78))
  const surfaceOpacity = mix(
    float(clamp01(parameters.shallowOpacity)),
    float(clamp01(parameters.deepOpacity)),
    depthRamp.bandProgress,
  )
    .mul(waterOnly)
    .add(glint.mul(0.1))
    .clamp(0, 1)
  const contourField = createNaturalShoreFoamEvents(
    depth,
    fieldSample,
    field,
    waterTime,
    parameters,
  )
  const shoreContour = contourField.mask
  const contourOpacity = shoreContour.mul(clamp01(parameters.shoreContourOpacity))
  const waveFoamOpacity = foamWhiteRamp.mul(clamp01(parameters.waveFoamOpacity))
  const combinedFoamOpacity = contourOpacity.max(waveFoamOpacity)
  const finalOpacity = surfaceOpacity
    .add(combinedFoamOpacity.mul(surfaceOpacity.oneMinus()))
    .clamp(0, 1)
  const foamBrightness =
    1 + Math.min(1.6, Math.max(0, parameters.foamEmissionStrength) / 10.7) * 0.32
  const combinedFoamMask = shoreContour.max(foamWhiteRamp)
  const finalSurfaceColor = mix(
    clearSurfaceColor,
    color(parameters.foamColor).mul(foamBrightness),
    combinedFoamMask,
  )
  const glareMask = createNaturalWaterGlareMask(
    surfaceWaves,
    waveFoam,
    shoreContour,
    glint,
    parameters,
  ).mul(waterOnly)
  const opacityDebug = vec3(finalOpacity, finalOpacity, finalOpacity)
  const contourDebug = vec3(shoreContour, shoreContour, shoreContour)
  const glintDebug = vec3(glint, glint.mul(0.94), glint.mul(0.72))
  const compressionDebug = vec3(
    surfaceWaves.compression,
    surfaceWaves.crest,
    surfaceWaves.jacobian.clamp(0, 1),
  )
  const displacementDebug = vec3(
    geometryWaves.displacementX.mul(2.8).add(0.5),
    geometryWaves.height.mul(2.8).add(0.5),
    geometryWaves.displacementZ.mul(2.8).add(0.5),
  )
  const waveFoamDebug = vec3(waveFoam, foamColorRamp, foamWhiteRamp)
  const glareDebug = vec3(glareMask, glareMask.mul(0.55), glareMask.mul(0.12))
  const warpDebug = vec3(
    warpOffset.x.mul(0.42).add(0.5),
    warpOffset.y.mul(0.42).add(0.5),
    warpedDepth.sub(depth).abs().mul(1.8).clamp(0, 1),
  )
  const resolvedColor =
    debugMode === 'contour'
      ? contourDebug
      : debugMode === 'contour-field' || debugMode === 'foam-events'
        ? contourField.debugColor
        : debugMode === 'compression'
          ? compressionDebug
          : debugMode === 'displacement'
            ? displacementDebug
            : debugMode === 'wave-foam'
              ? waveFoamDebug
              : debugMode === 'glare'
                ? glareDebug
                : debugMode === 'glints'
                  ? glintDebug
                  : debugMode === 'warp'
                    ? warpDebug
                    : debugMode === 'opacity'
                      ? opacityDebug
                      : debugMode === 'normals'
                        ? waterNormal.mul(0.5).add(0.5)
                        : finalSurfaceColor
  const surfaceDiagnostic =
    debugMode === 'contour' ||
    debugMode === 'contour-field' ||
    debugMode === 'compression' ||
    debugMode === 'displacement' ||
    debugMode === 'foam-events' ||
    debugMode === 'glare' ||
    debugMode === 'glints' ||
    debugMode === 'opacity' ||
    debugMode === 'normals' ||
    debugMode === 'warp' ||
    debugMode === 'wave-foam'
  const surfaceHidden = debugMode === 'terrain' || debugMode === 'depth' || debugMode === 'bands'
  const material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    transparent: !surfaceDiagnostic,
  })
  material.positionNode = vec3(
    positionLocal.x.add(geometryWaves.displacementX),
    positionLocal.y.sub(geometryWaves.displacementZ),
    geometryWaves.height,
  )
  material.colorNode = resolvedColor
  material.opacityNode = surfaceHidden ? float(0) : debugMode === 'final' ? finalOpacity : float(1)
  material.toneMapped = false
  material.name = 'natural-water-clear-animated-surface'
  material.userData.naturalWaterField = {
    coordinateSpace: 'world-xz',
    contourModel: 'stratified-independent-along-shore-events',
    contourSource: 'closest-shore-arc-and-water-side-distance',
    depthModel: 'water-level-minus-shared-terrain-elevation',
    intersectionModel: 'shared-elevation-zero-crossing',
    refractionModel: 'shared-depth-normal-offset-heuristic',
    source: 'shared-heightfield',
    waveFoamModel: 'analytic-gerstner-jacobian-compression',
    waveModel: 'six-band-directional-ocean-modifier-lite',
  }
  material.userData.__pascalSkipMaterialHighlight = true
  return material
}

function createNaturalWaterGlareMaterial(
  field: NaturalWaterField,
  debugMode: NaturalWaterDebugMode,
  parameters: NaturalWaterParameters,
  planeSize: number,
  waterTime: TSLNode<'float'>,
) {
  const coordinates = vec2(positionLocal.x, positionLocal.y.negate())
  const fieldSample = sampleNaturalWaterField(field, coordinates, planeSize)
  const terrainElevation = decodeNaturalWaterElevation(fieldSample.r, field)
  const depth = terrainElevation.negate().max(0)
  const waterOnly = depth.smoothstep(0.0015, 0.055)
  const waveDepthAttenuation = depth.smoothstep(0.08, 0.9)
  const geometryWaves = createNaturalOceanWaveBundle(
    coordinates,
    waterTime,
    parameters,
    waveDepthAttenuation,
    planeSize / Math.max(1, field.planeSegments),
    false,
  )
  const surfaceWaves = createNaturalOceanWaveBundle(
    coordinates,
    waterTime,
    parameters,
    waveDepthAttenuation,
    planeSize / Math.max(1, field.planeSegments),
    true,
  )
  const waveFoam = createNaturalOceanFoamMask(surfaceWaves, coordinates, parameters).mul(waterOnly)
  const contourField = createNaturalShoreFoamEvents(
    depth,
    fieldSample,
    field,
    waterTime,
    parameters,
  )
  const glint = createNaturalWaterGlintMask(
    surfaceWaves,
    coordinates,
    waterTime,
    waterOnly,
    parameters,
  )
  const glareMask = createNaturalWaterGlareMask(
    surfaceWaves,
    waveFoam,
    contourField.mask,
    glint,
    parameters,
  ).mul(waterOnly)
  const glareColor = mix(
    color('#fff8df'),
    color(parameters.glareTint),
    clamp01(parameters.glareSaturation),
  ).mul(1 + Math.min(1.4, Math.max(0, parameters.foamEmissionStrength) / 10.7) * 0.28)
  const material = new MeshBasicNodeMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    transparent: true,
  })
  material.positionNode = vec3(
    positionLocal.x.add(geometryWaves.displacementX),
    positionLocal.y.sub(geometryWaves.displacementZ),
    geometryWaves.height,
  )
  material.colorNode = glareColor
  material.opacityNode =
    debugMode === 'final'
      ? glareMask.mul(Math.max(0, parameters.glareStrength) * 0.13).clamp(0, 0.38)
      : float(0)
  material.toneMapped = false
  material.name = 'natural-water-analytic-glare-overlay'
  material.userData.naturalWaterGlare = {
    model: 'single-additive-analytic-overlay',
    postProcessRenderTargets: 0,
  }
  material.userData.__pascalSkipMaterialHighlight = true
  return material
}

function createNaturalWaterGlareMask(
  waves: ReturnType<typeof createNaturalOceanWaveBundle>,
  waveFoam: TSLNode<'float'>,
  shoreContour: TSLNode<'float'>,
  glint: TSLNode<'float'>,
  parameters: NaturalWaterParameters,
) {
  const size = clamp01(parameters.glareSize)
  const foamHalo = waveFoam.smoothstep(
    Math.max(0.01, parameters.foamWhiteRampPosition - (0.04 + size * 0.045)),
    Math.max(0.02, parameters.foamWhiteRampPosition + 0.055),
  )
  const compressionHalo = waves.compression
    .mul(waves.crest.pow(1.65))
    .mul(waves.slope.mul(0.72).add(0.28))
    .smoothstep(0.24 + (1 - size) * 0.08, 0.62)
  const glintHalo = glint.smoothstep(0.12 + (1 - size) * 0.08, 0.72)
  const shoreHalo = shoreContour.pow(0.92 + (1 - size) * 0.38).mul(0.24)
  return foamHalo.mul(0.42).max(compressionHalo.mul(0.12)).max(glintHalo).max(shoreHalo)
}

function createNaturalWaterGlintMask(
  waves: ReturnType<typeof createNaturalOceanWaveBundle>,
  coordinates: TSLNode<'vec2'>,
  waterTime: TSLNode<'float'>,
  waterOnly: TSLNode<'float'>,
  parameters: NaturalWaterParameters,
) {
  const sparkleScale = Math.max(1.4, parameters.oceanSmallestWave * 3.5)
  const seedOffset = vec2(parameters.seed * 0.173, parameters.seed * -0.127)
  const sparkleCoordinates = coordinates
    .div(sparkleScale)
    .add(vec2(waterTime.mul(0.14), waterTime.mul(-0.09)))
    .add(seedOffset)
  const ridgeMask = waves.glintCarrier.smoothstep(0.34, 0.8)
  const sparkleMask = normalizedNaturalWaterShoreNoise(sparkleCoordinates)
    .smoothstep(0.71, 0.91)
    .mul(ridgeMask.mul(0.72).add(0.28))
  const viewDirection = cameraPosition.sub(positionWorld).normalize()
  const halfVector = viewDirection.add(vec3(-0.46, 0.84, -0.28).normalize()).normalize()
  const directGlint = waves.normal.dot(halfVector).max(0).pow(82).mul(ridgeMask)
  const crestGlint = waves.crest.pow(3.2).mul(waves.slope.pow(0.72)).mul(0.38)
  return directGlint
    .max(crestGlint)
    .mul(sparkleMask)
    .mul(waterOnly)
    .mul(clamp01(parameters.surfaceGlintStrength))
    .clamp(0, 1)
}

function createNaturalShoreFoamEvents(
  depth: TSLNode<'float'>,
  fieldSample: TSLNode<'vec4'>,
  field: NaturalWaterField,
  waterTime: TSLNode<'float'>,
  parameters: NaturalWaterParameters,
) {
  const width = Math.max(0.06, parameters.shoreContourWidth)
  const reach = Math.max(width * 1.5, parameters.shoreContourReach)
  const softness = clamp01(parameters.shoreContourSoftness)
  const breakup = clamp01(parameters.shoreContourBreakup)
  const fluctuation = clamp01(parameters.shoreContourFluctuation)
  const speed = Math.max(0, parameters.shoreContourMotionSpeed)
  const sectionLength = Math.max(4, parameters.shoreContourWispScale)
  const shoreDistance = fieldSample.a.mul(field.shoreDistanceRange)
  const alongShoreMeters = fieldSample.b.mul(field.shorelineLength)
  const cellCoordinate = alongShoreMeters.div(sectionLength)
  const cellIndex = cellCoordinate.floor()
  const cellPosition = cellCoordinate.fract()
  const seed = float(parameters.seed * 0.731 + 17.3)
  const randomCenter = naturalWaterEventHash(cellIndex.add(seed))
  const randomSpan = naturalWaterEventHash(cellIndex.mul(1.37).add(seed.mul(2.11)))
  const randomRate = naturalWaterEventHash(cellIndex.mul(2.03).add(seed.mul(3.71)))
  const randomPhase = naturalWaterEventHash(cellIndex.mul(3.17).add(seed.mul(5.29)))
  const randomReach = naturalWaterEventHash(cellIndex.mul(4.43).add(seed.mul(7.13)))
  const center = mix(float(0.36), float(0.64), randomCenter)
  const halfSpan = mix(float(0.14), float(0.27), randomSpan)
  const segmentEnvelope = cellPosition
    .sub(center)
    .abs()
    .smoothstep(halfSpan.mul(0.42 + softness * 0.34), halfSpan)
    .oneMinus()
  const cycle = waterTime
    .mul(speed * 0.13)
    .mul(mix(float(0.72), float(1.34), randomRate))
    .add(randomPhase)
    .fract()
  const lifecycle = cycle.smoothstep(0.03, 0.18).mul(cycle.smoothstep(0.64, 0.96).oneMinus())
  const eventPulse = mix(float(1), lifecycle, fluctuation)
  const frontProgress = cycle.smoothstep(0.08, 0.78)
  const localReach = float(reach).mul(mix(float(0.72), float(1.16), randomReach))
  const frontDistance = mix(float(width * 0.52), localReach, frontProgress)
  const motion = waterTime.mul(speed)
  const fogCoordinates = vec2(
    alongShoreMeters.div(sectionLength * 0.72).add(motion.mul(0.075)),
    shoreDistance.div(Math.max(0.1, reach)).sub(motion.mul(0.048)),
  ).add(vec2(seed.mul(0.13), seed.mul(-0.19)))
  const broadFog = normalizedNaturalWaterShoreNoise(fogCoordinates)
  const detailFog = normalizedNaturalWaterShoreNoise(
    fogCoordinates.mul(2.21).add(vec2(cellIndex.mul(0.37), cellIndex.mul(-0.23))),
  )
  const smoothFog = broadFog.mul(0.68).add(detailFog.mul(0.32)).clamp(0, 1)
  const undulation = smoothFog.sub(0.5).mul(width * 1.35)
  const localWidth = float(width).mul(mix(float(0.72), float(1.24), broadFog))
  const thinCrest = shoreDistance
    .sub(frontDistance.add(undulation))
    .abs()
    .smoothstep(localWidth.mul(0.18), localWidth)
    .oneMinus()
  const foggyHalo = shoreDistance
    .sub(frontDistance.add(undulation.mul(0.55)))
    .abs()
    .smoothstep(localWidth.mul(0.55), localWidth.mul(2.35))
    .oneMinus()
    .mul(0.24 + softness * 0.18)
  const contactMist = shoreDistance
    .smoothstep(width * 0.12, width * 1.9)
    .oneMinus()
    .mul(cycle.smoothstep(0.02, 0.3).oneMinus())
    .mul(0.36)
  const breakupMask = smoothFog.smoothstep(0.2 + breakup * 0.24, 0.68 + breakup * 0.12)
  const fogDensity = mix(float(1), breakupMask.mul(0.62).add(0.38), breakup)
  const waterOnly = depth.smoothstep(0.0015, 0.035)
  const reachGuard = shoreDistance
    .smoothstep(localReach.add(localWidth), localReach.add(localWidth.mul(3.2)))
    .oneMinus()
  const mask = thinCrest
    .add(foggyHalo)
    .max(contactMist)
    .mul(segmentEnvelope)
    .mul(eventPulse)
    .mul(fogDensity)
    .mul(waterOnly)
    .mul(reachGuard)
    .clamp(0, 1)
  return {
    debugColor: vec3(segmentEnvelope, eventPulse, smoothFog).mul(waterOnly),
    mask,
  }
}

function naturalWaterEventHash(value: TSLNode<'float'>) {
  return sin(value.mul(12.9898).add(78.233)).mul(43758.5453).fract()
}

function normalizedNaturalWaterShoreNoise(coordinates: TSLNode<'vec2'>) {
  return mx_noise_float(coordinates).mul(0.5).add(0.5).clamp(0, 1)
}

function createNaturalOceanFoamMask(
  waves: ReturnType<typeof createNaturalOceanWaveBundle>,
  coordinates: TSLNode<'vec2'>,
  parameters: NaturalWaterParameters,
) {
  const breakup = normalizedNaturalWaterShoreNoise(
    coordinates
      .div(Math.max(0.4, parameters.oceanSmallestWave * 5.5))
      .add(vec2(parameters.seed * 0.071, parameters.seed * -0.053)),
  )
    .mul(0.38)
    .add(0.62)
  const compressionBreak = waves.compression
    .mul(waves.crest.pow(1.45))
    .mul(waves.slope.mul(0.7).add(0.3))
  const crestBreak = waves.crest.pow(2.6).mul(waves.slope.pow(0.78))
  const breakingEnergy = compressionBreak.mul(0.82).add(crestBreak.mul(0.24)).mul(breakup)
  return breakingEnergy
    .smoothstep(0.054, 0.084)
    .add(parameters.waveFoamCoverage * 0.12)
    .clamp(0, 1)
}

function createNaturalWaterDepthRamp(depth: TSLNode<'float'>, parameters: NaturalWaterParameters) {
  const colorCount = Math.max(2, Math.min(6, Math.round(parameters.depthColorCount)))
  const thresholds = normalizedNaturalWaterThresholds(
    parameters.depthThresholds,
    parameters.maxDepth,
  )
  const transition = Math.max(0.001, parameters.depthTransitionSmoothness)
  let toonColor: TSLNode<'vec3'> = mix(
    color(parameters.depthColors[0]),
    color(parameters.depthColors[0]),
    float(0),
  )
  let bandProgress: TSLNode<'float'> = float(0)

  for (let index = 0; index < colorCount - 1; index += 1) {
    const threshold = thresholds[index] ?? parameters.maxDepth
    const thresholdBlend = depth.smoothstep(
      Math.max(0, threshold - transition),
      threshold + transition,
    )
    toonColor = mix(toonColor, color(parameters.depthColors[index + 1]), thresholdBlend)
    bandProgress = mix(bandProgress, float((index + 1) / (colorCount - 1)), thresholdBlend)
  }

  return { bandProgress, toonColor }
}

function sampleNaturalWaterField(
  field: NaturalWaterField,
  coordinates: TSLNode<'vec2'>,
  planeSize: number,
) {
  const texelInset = 0.5 / field.resolution
  const texelScale = (field.resolution - 1) / field.resolution
  const uv = coordinates.div(Math.max(0.001, planeSize)).add(0.5).mul(texelScale).add(texelInset)
  return texture(field.texture, uv)
}

function decodeNaturalWaterElevation(sample: TSLNode<'float'>, field: NaturalWaterField) {
  return sample.mul(field.encodingMax - field.encodingMin).add(field.encodingMin)
}

function createNaturalOceanWaveBundle(
  coordinates: TSLNode<'vec2'>,
  waterTime: TSLNode<'float'>,
  parameters: NaturalWaterParameters,
  depthAttenuation: TSLNode<'float'>,
  vertexSpacing: number,
  fragmentFiltered: boolean,
) {
  const windVelocity = Math.max(0.1, parameters.oceanWindVelocity)
  const minimumWavelength = Math.max(0.35, parameters.oceanSmallestWave)
  const longestWavelength = Math.max(
    minimumWavelength * 14,
    Math.min(72, (windVelocity * windVelocity * 1.6) / 9.81),
  )
  const windAngle = (parameters.oceanDirectionDegrees * Math.PI) / 180
  const windDirection = [Math.cos(windAngle), Math.sin(windAngle)] as const
  const alignment = clamp01(parameters.oceanAlignment)
  const damping = clamp01(parameters.oceanDamping)
  const angularSpread = lerp(1, 0.24, alignment)
  const baseAmplitude = Math.max(0, parameters.oceanWaveScale) * 0.028 * (0.72 + windVelocity / 50)
  const timeScale = Math.max(0, parameters.oceanTimeScale)
  const choppiness = Math.max(0, parameters.oceanChoppiness)
  const footprint = fragmentFiltered ? fwidth(coordinates).length() : float(0)
  let height: TSLNode<'float'> = float(0)
  let displacementX: TSLNode<'float'> = float(0)
  let displacementZ: TSLNode<'float'> = float(0)
  let heightDerivativeX: TSLNode<'float'> = float(0)
  let heightDerivativeZ: TSLNode<'float'> = float(0)
  let displacementDerivativeXX: TSLNode<'float'> = float(0)
  let displacementDerivativeXZ: TSLNode<'float'> = float(0)
  let displacementDerivativeZX: TSLNode<'float'> = float(0)
  let displacementDerivativeZZ: TSLNode<'float'> = float(0)
  let crestAccumulator: TSLNode<'float'> = float(0)
  let glintAccumulator: TSLNode<'float'> = float(0)
  let amplitudeTotal = 0

  for (let index = 0; index < NATURAL_OCEAN_BANDS.length; index += 1) {
    const band = NATURAL_OCEAN_BANDS[index]
    if (!band) continue
    const wavelength =
      index === NATURAL_OCEAN_BANDS.length - 1
        ? minimumWavelength
        : Math.max(minimumWavelength, longestWavelength * band.wavelength)
    const waveNumber = (Math.PI * 2) / wavelength
    const angle = windAngle + band.angleOffset * angularSpread
    const directionX = Math.cos(angle)
    const directionZ = Math.sin(angle)
    const opposition = Math.max(0, -(directionX * windDirection[0] + directionZ * windDirection[1]))
    const directionalWeight = Math.max(0.08, 1 - damping * opposition * 0.94)
    const amplitude = baseAmplitude * band.amplitude * directionalWeight
    const horizontalAmplitude =
      (amplitude * choppiness * (0.78 - index * 0.055)) / Math.max(1, 0.78 + alignment * 0.22)
    const geometryWeight = smootherstepNumber(vertexSpacing * 3.1, vertexSpacing * 5.2, wavelength)
    const filterWeight = fragmentFiltered
      ? footprint.mul(waveNumber).smoothstep(0.48, 1.65).oneMinus()
      : float(geometryWeight)
    const resolvedWeight = filterWeight.mul(depthAttenuation)
    const angularSpeed = Math.sqrt(9.81 * waveNumber) * timeScale * band.speed
    const phaseOffset =
      naturalWaterGridHash(index * 19 + 7, index * 31 + 11, parameters.seed * 1.37) * Math.PI * 2
    const phase = coordinates
      .dot(vec2(directionX, directionZ))
      .mul(waveNumber)
      .sub(waterTime.mul(angularSpeed))
      .add(phaseOffset)
    const sine = sin(phase)
    const cosine = cos(phase)
    const resolvedAmplitude = resolvedWeight.mul(amplitude)
    const resolvedHorizontalAmplitude = resolvedWeight.mul(horizontalAmplitude)
    const heightDerivativeScale = resolvedAmplitude.mul(waveNumber).mul(cosine)
    const horizontalDerivativeScale = resolvedHorizontalAmplitude.mul(waveNumber).mul(sine).negate()

    height = height.add(sine.mul(resolvedAmplitude))
    displacementX = displacementX.add(cosine.mul(resolvedHorizontalAmplitude).mul(directionX))
    displacementZ = displacementZ.add(cosine.mul(resolvedHorizontalAmplitude).mul(directionZ))
    heightDerivativeX = heightDerivativeX.add(heightDerivativeScale.mul(directionX))
    heightDerivativeZ = heightDerivativeZ.add(heightDerivativeScale.mul(directionZ))
    displacementDerivativeXX = displacementDerivativeXX.add(
      horizontalDerivativeScale.mul(directionX * directionX),
    )
    displacementDerivativeXZ = displacementDerivativeXZ.add(
      horizontalDerivativeScale.mul(directionX * directionZ),
    )
    displacementDerivativeZX = displacementDerivativeZX.add(
      horizontalDerivativeScale.mul(directionZ * directionX),
    )
    displacementDerivativeZZ = displacementDerivativeZZ.add(
      horizontalDerivativeScale.mul(directionZ * directionZ),
    )
    crestAccumulator = crestAccumulator.add(
      sine.mul(0.5).add(0.5).pow(2.2).mul(resolvedWeight.mul(band.amplitude)),
    )
    glintAccumulator = glintAccumulator.add(
      cosine
        .mul(0.5)
        .add(0.5)
        .pow(4 + index * 0.8)
        .mul(resolvedWeight.mul(band.amplitude)),
    )
    amplitudeTotal += band.amplitude
  }

  const tangentXX = displacementDerivativeXX.add(1)
  const tangentZZ = displacementDerivativeZZ.add(1)
  const jacobian = tangentXX
    .mul(tangentZZ)
    .sub(displacementDerivativeXZ.mul(displacementDerivativeZX))
  const normal = vec3(
    heightDerivativeZ.mul(displacementDerivativeZX).sub(tangentZZ.mul(heightDerivativeX)),
    jacobian,
    displacementDerivativeXZ.mul(heightDerivativeX).sub(heightDerivativeZ.mul(tangentXX)),
  ).normalize()
  const compression = jacobian.oneMinus().mul(9.5).clamp(0, 1)
  const crest = crestAccumulator.div(Math.max(0.001, amplitudeTotal * 0.54)).clamp(0, 1)
  const slope = normal.y.oneMinus().mul(9).clamp(0, 1)
  return {
    compression,
    crest,
    displacementX,
    displacementZ,
    glintCarrier: glintAccumulator.div(Math.max(0.001, amplitudeTotal * 0.48)).clamp(0, 1),
    height,
    jacobian,
    normal,
    slope,
  }
}

function normalizedNaturalWaterThresholds(
  thresholds: readonly number[],
  maxDepth: number,
): [number, number, number, number, number] {
  const gap = Math.min(0.25, Math.max(0.08, maxDepth / 40))
  const normalized = [...thresholds]
  for (let index = 0; index < normalized.length; index += 1) {
    const previous = index === 0 ? 0 : (normalized[index - 1] ?? 0)
    const remaining = normalized.length - index - 1
    normalized[index] = clampRange(
      normalized[index] ?? previous + gap,
      previous + gap,
      Math.max(previous + gap, maxDepth - remaining * gap),
    )
  }
  return normalized as [number, number, number, number, number]
}

function openNaturalWaterRing(points: readonly NaturalWaterPoint[]) {
  if (points.length < 2) return [...points]
  const first = points[0]
  const last = points.at(-1)
  if (first && last && Math.hypot(first.x - last.x, first.z - last.z) < 0.0001) {
    return points.slice(0, -1)
  }
  return [...points]
}

function createNaturalWaterRing(points: readonly NaturalWaterPoint[]): NaturalWaterRing {
  const openPoints = openNaturalWaterRing(points)
  const cumulativeLengths: number[] = []
  let length = 0
  for (let index = 0; index < openPoints.length; index += 1) {
    cumulativeLengths.push(length)
    const start = openPoints[index]
    const end = openPoints[(index + 1) % openPoints.length]
    if (!start || !end) continue
    length += Math.hypot(end.x - start.x, end.z - start.z)
  }
  return { cumulativeLengths, length: Math.max(0.0001, length), points: openPoints }
}

function naturalWaterPointInPolygon(x: number, z: number, ring: readonly NaturalWaterPoint[]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[index]
    const end = ring[previous]
    if (!start || !end) continue
    const crosses = start.z > z !== end.z > z
    if (!crosses) continue
    const boundaryX = ((end.x - start.x) * (z - start.z)) / (end.z - start.z) + start.x
    if (x < boundaryX) inside = !inside
  }
  return inside
}

function naturalWaterClosestRingPoint(x: number, z: number, ring: NaturalWaterRing) {
  let nearest = Number.POSITIVE_INFINITY
  let nearestArc = 0
  for (let index = 0; index < ring.points.length; index += 1) {
    const start = ring.points[index]
    const end = ring.points[(index + 1) % ring.points.length]
    if (!start || !end) continue
    const segmentX = end.x - start.x
    const segmentZ = end.z - start.z
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ
    const ratio =
      segmentLengthSquared <= 0.000001
        ? 0
        : clampRange(
            ((x - start.x) * segmentX + (z - start.z) * segmentZ) / segmentLengthSquared,
            0,
            1,
          )
    const offsetX = x - (start.x + segmentX * ratio)
    const offsetZ = z - (start.z + segmentZ * ratio)
    const distanceSquared = offsetX * offsetX + offsetZ * offsetZ
    if (distanceSquared < nearest) {
      nearest = distanceSquared
      nearestArc = (ring.cumulativeLengths[index] ?? 0) + Math.sqrt(segmentLengthSquared) * ratio
    }
  }
  return {
    arc: clamp01(nearestArc / ring.length),
    distance: Math.sqrt(Number.isFinite(nearest) ? nearest : 0),
  }
}

function naturalWaterFbm(x: number, z: number, seed: number) {
  let amplitude = 0.55
  let amplitudeTotal = 0
  let frequency = 1
  let value = 0
  for (let octave = 0; octave < 4; octave += 1) {
    value += naturalWaterValueNoise(x * frequency, z * frequency, seed + octave * 17.17) * amplitude
    amplitudeTotal += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return value / Math.max(0.0001, amplitudeTotal)
}

function naturalWaterValueNoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(naturalWaterGridHash(ix, iz, seed), naturalWaterGridHash(ix + 1, iz, seed), ux),
    lerp(naturalWaterGridHash(ix, iz + 1, seed), naturalWaterGridHash(ix + 1, iz + 1, seed), ux),
    uz,
  )
}

function naturalWaterGridHash(x: number, z: number, seed: number) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function smootherstepNumber(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function smoothstepNumber(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function useDeferredNaturalWaterDisposal(resource: NaturalWaterDisposable) {
  useEffect(() => {
    const pending = pendingNaturalWaterDisposals.get(resource)
    if (pending) {
      pending.cancelled = true
      pendingNaturalWaterDisposals.delete(resource)
    }

    return () => {
      const nextPending = { cancelled: false }
      pendingNaturalWaterDisposals.set(resource, nextPending)
      const dispose = () => {
        if (nextPending.cancelled || pendingNaturalWaterDisposals.get(resource) !== nextPending) {
          return
        }
        pendingNaturalWaterDisposals.delete(resource)
        resource.dispose()
      }
      if (typeof requestAnimationFrame !== 'function') {
        dispose()
        return
      }
      requestAnimationFrame(() => requestAnimationFrame(dispose))
    }
  }, [resource])
}
