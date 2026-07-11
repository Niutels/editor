// @ts-nocheck -- Bruno Simon TSL/WebGPU water surface port; see BRUNO_SIMON_LICENSE.md.
import type { LandrushWorldNode } from '@pascal-app/core'
import { ClampToEdgeWrapping, type Texture, Vector2 } from 'three'
import { hashBlur } from 'three/examples/jsm/tsl/display/hashBlur.js'
import {
  color,
  dot,
  Fn,
  float,
  hash,
  max,
  mix,
  positionWorld,
  screenUV,
  select,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
  viewportSharedTexture,
} from 'three/tsl'
import type * as THREE from 'three/webgpu'
import { LandrushBrunoMeshDefaultMaterial } from './bruno-mesh-default-material'
import { LandrushBrunoWaterNoises } from './bruno-water-noises'
import { LandrushBrunoWaterWind } from './bruno-water-wind'

export { LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION } from './bruno-water-noises'

function roundLandrushWaterMaterialPerf(value: number) {
  return Math.round(value * 1000) / 1000
}

function measureLandrushWaterMaterialStartup<T>(id: string, callback: () => T) {
  if (typeof performance === 'undefined') return callback()
  const profile = globalThis.__PASCAL_WATER_STARTUP_PROFILE__
  if (!profile) return callback()

  const startedAt = performance.now()
  try {
    return callback()
  } finally {
    profile.spans.push({
      durationMs: roundLandrushWaterMaterialPerf(performance.now() - startedAt),
      id,
      startMs: roundLandrushWaterMaterialPerf(startedAt - profile.startedAt),
    })
  }
}

export const LANDRUSH_WATER_SURFACE_ELEVATION = -0.3
export const LANDRUSH_WATER_DEPTH_ELEVATION = -1.5
export const LANDRUSH_WATER_SURFACE_THICKNESS = 0.013

export type LandrushWaterSurfaceParameters = {
  blurStrength: number
  coastalFoamFarDistance: number
  coastalFoamNearDistance: number
  coastalFoamStrength: number
  coastalFoamVisibility: number
  coastalFoamWashReach: number
  depthExponent: number
  depthNoiseFrequency: number
  depthNoiseStrength: number
  depthReach: number
  depthReferenceReach: number
  edgeFadeDistance: number
  frontCyanDepthContourVisibility: number
  frontCyanShallowDepthResponseRate: number
  frontCyanShallowDepthThreshold: number
  hasBlurredUnderlay: boolean
  iceNoiseFrequency: number
  iceRatio: number
  qualityLevel: 0 | 1
  ripplesBreakupEnd: number
  ripplesBreakupFrequency: number
  ripplesBreakupSize: number
  ripplesBreakupStart: number
  ripplesBackColorRatioMax: number
  ripplesBackColorRatioMin: number
  ripplesBackColorStrength: number
  ripplesBackColorVisibility: number
  ripplesCrestVisibility: number
  ripplesFrontColorRatio: number
  ripplesFrontColorStrength: number
  ripplesFrontColorVisibility: number
  ripplesNoiseFrequency: number
  ripplesNoiseOffset: number
  ripplesNoiseStrength: number
  ripplesReachEnd: number
  ripplesReachStart: number
  ripplesRatio: number
  ripplesSlopeFrequency: number
  shoreEdge: number
  splashesEdgeAttenuationHigh: number
  splashesEdgeAttenuationLow: number
  splashesNoiseFrequency: number
  splashesRatio: number
  splashesThickness: number
  splashesTimeFrequency: number
  surfaceThickness: number
  windAngle: number
  windStrength: number
  windTimeFrequency: number
}

export type LandrushIncomingWaterSurfaceParameters = LandrushWaterSurfaceParameters & {
  waveDepthSlowdown: number
  waveShoreWrap: number
}

export const LANDRUSH_WATER_SURFACE_PARAMETERS = {
  blurStrength: 0.01,
  coastalFoamFarDistance: 0.4,
  coastalFoamNearDistance: 0.06,
  coastalFoamStrength: 0,
  coastalFoamVisibility: 1,
  coastalFoamWashReach: 0.13,
  depthExponent: 0.52,
  depthNoiseFrequency: 0.03,
  depthNoiseStrength: 0,
  depthReach: 10,
  depthReferenceReach: 70,
  edgeFadeDistance: 18,
  frontCyanDepthContourVisibility: 0,
  frontCyanShallowDepthResponseRate: 11,
  frontCyanShallowDepthThreshold: 0.34,
  hasBlurredUnderlay: true,
  iceNoiseFrequency: 0.3,
  iceRatio: 0,
  qualityLevel: 1,
  ripplesBreakupEnd: 0.3,
  ripplesBreakupFrequency: 0.005,
  ripplesBreakupSize: 0.64,
  ripplesBreakupStart: 0.21,
  ripplesBackColorRatioMax: 2.5,
  ripplesBackColorRatioMin: 1,
  ripplesBackColorStrength: 0,
  ripplesBackColorVisibility: 1,
  ripplesCrestVisibility: 1,
  ripplesFrontColorRatio: 0.5,
  ripplesFrontColorStrength: 0,
  ripplesFrontColorVisibility: 1,
  ripplesNoiseFrequency: 0.1,
  ripplesNoiseOffset: 1.5,
  ripplesNoiseStrength: 0.18,
  ripplesReachEnd: 0.55,
  ripplesReachStart: 0.39,
  ripplesRatio: 1,
  ripplesSlopeFrequency: 6.5,
  shoreEdge: 0.55,
  splashesEdgeAttenuationHigh: 1,
  splashesEdgeAttenuationLow: 0.14,
  splashesNoiseFrequency: 0.33,
  splashesRatio: 0,
  splashesThickness: 0.3,
  splashesTimeFrequency: 6,
  surfaceThickness: LANDRUSH_WATER_SURFACE_THICKNESS,
  windAngle: Math.PI * 0.6,
  windStrength: 0.5,
  windTimeFrequency: 0.1,
} satisfies LandrushWaterSurfaceParameters

export const LANDRUSH_INCOMING_WATER_SURFACE_PARAMETERS = {
  ...LANDRUSH_WATER_SURFACE_PARAMETERS,
  waveDepthSlowdown: 0.28,
  waveShoreWrap: 0.12,
} satisfies LandrushIncomingWaterSurfaceParameters

export type LandrushWaterSurfaceMaterial = LandrushBrunoMeshDefaultMaterial & {
  userData: {
    landrushWater: {
      noises: LandrushBrunoWaterNoises
      parameters: LandrushWaterSurfaceParameters
      setParameters: (parameters: Partial<LandrushWaterSurfaceParameters>) => void
      update: (deltaSeconds: number) => void
      wind: LandrushBrunoWaterWind
    }
  }
}

export type LandrushIncomingWaterSurfaceMaterial = LandrushBrunoMeshDefaultMaterial & {
  userData: {
    landrushWater: {
      noises: LandrushBrunoWaterNoises
      parameters: LandrushIncomingWaterSurfaceParameters
      setParameters: (parameters: Partial<LandrushIncomingWaterSurfaceParameters>) => void
      update: (deltaSeconds: number) => void
      wind: LandrushBrunoWaterWind
    }
  }
}

export function createLandrushWaterMaterial(
  renderer: THREE.WebGPURenderer,
  terrainFieldTexture: Texture,
  bounds: LandrushWorldNode['perimeter']['bounds'],
  parameters: Partial<LandrushWaterSurfaceParameters> = {},
): LandrushWaterSurfaceMaterial {
  return createLandrushWaterMaterialInternal(
    renderer,
    terrainFieldTexture,
    bounds,
    {
      ...LANDRUSH_WATER_SURFACE_PARAMETERS,
      ...parameters,
      waveDepthSlowdown: 0,
      waveShoreWrap: 1,
    },
    'shore',
  ) as LandrushWaterSurfaceMaterial
}

export function createLandrushIncomingWaterMaterial(
  renderer: THREE.WebGPURenderer,
  terrainFieldTexture: Texture,
  bounds: LandrushWorldNode['perimeter']['bounds'],
  parameters: Partial<LandrushIncomingWaterSurfaceParameters> = {},
): LandrushIncomingWaterSurfaceMaterial {
  return createLandrushWaterMaterialInternal(
    renderer,
    terrainFieldTexture,
    bounds,
    { ...LANDRUSH_INCOMING_WATER_SURFACE_PARAMETERS, ...parameters },
    'incoming',
  )
}

function createLandrushWaterMaterialInternal(
  renderer: THREE.WebGPURenderer,
  terrainFieldTexture: Texture,
  bounds: LandrushWorldNode['perimeter']['bounds'],
  params: LandrushIncomingWaterSurfaceParameters,
  ripplePhase: 'incoming' | 'shore',
): LandrushIncomingWaterSurfaceMaterial {
  return measureLandrushWaterMaterialStartup('setup.landrush-water.material.internal', () => {
    terrainFieldTexture.wrapS = ClampToEdgeWrapping
    terrainFieldTexture.wrapT = ClampToEdgeWrapping

    const noises = measureLandrushWaterMaterialStartup(
      'setup.landrush-water.material.create-noises',
      () => new LandrushBrunoWaterNoises(renderer),
    )
    const wind = measureLandrushWaterMaterialStartup(
      'setup.landrush-water.material.create-wind',
      () => new LandrushBrunoWaterWind(noises),
    )
    wind.angle = params.windAngle
    wind.direction.value.set(Math.sin(params.windAngle), Math.cos(params.windAngle))
    wind.strength.value = params.windStrength
    wind.timeFrequency = params.windTimeFrequency

    const context = measureLandrushWaterMaterialStartup(
      'setup.landrush-water.material.create-context',
      () =>
        createLandrushBrunoWaterContext({
          bounds,
          noises,
          params,
          terrainFieldTexture,
          wind,
        }),
    )

    const material = measureLandrushWaterMaterialStartup(
      'setup.landrush-water.material.build-node-graph',
      () =>
        createLandrushWaterMaterialFromContext({
          context,
          noises,
          params,
          ripplePhase,
          wind,
        }),
    )

    return material
  })
}

function createLandrushWaterMaterialFromContext({
  context,
  noises,
  params,
  ripplePhase,
  wind,
}: {
  context: ReturnType<typeof createLandrushBrunoWaterContext>
  noises: LandrushBrunoWaterNoises
  params: LandrushIncomingWaterSurfaceParameters
  ripplePhase: 'incoming' | 'shore'
  wind: LandrushBrunoWaterWind
}): LandrushIncomingWaterSurfaceMaterial {
  const coastalFoamFarDistance = uniform(params.coastalFoamFarDistance)
  const coastalFoamNearDistance = uniform(params.coastalFoamNearDistance)
  const coastalFoamStrength = uniform(params.coastalFoamStrength)
  const coastalFoamVisibility = uniform(params.coastalFoamVisibility)
  const coastalFoamWashReach = uniform(params.coastalFoamWashReach)
  const depthExponent = uniform(params.depthExponent)
  const depthNoiseFrequency = uniform(params.depthNoiseFrequency)
  const depthNoiseStrength = uniform(params.depthNoiseStrength)
  const depthReach = uniform(params.depthReach)
  const depthReferenceReach = uniform(params.depthReferenceReach)
  const edgeFadeDistance = uniform(params.edgeFadeDistance)
  const frontCyanDepthContourVisibility = uniform(params.frontCyanDepthContourVisibility)
  const frontCyanShallowDepthResponseRate = uniform(params.frontCyanShallowDepthResponseRate)
  const frontCyanShallowDepthThreshold = uniform(params.frontCyanShallowDepthThreshold)
  const ripplesRatio = uniform(params.ripplesRatio)
  const ripplesSlopeFrequency = uniform(params.ripplesSlopeFrequency)
  const ripplesBreakupEnd = uniform(params.ripplesBreakupEnd)
  const ripplesBreakupFrequency = uniform(params.ripplesBreakupFrequency)
  const ripplesBreakupSize = uniform(params.ripplesBreakupSize)
  const ripplesBreakupStart = uniform(params.ripplesBreakupStart)
  const ripplesBackColorRatioMax = uniform(params.ripplesBackColorRatioMax)
  const ripplesBackColorRatioMin = uniform(params.ripplesBackColorRatioMin)
  const ripplesBackColorStrength = uniform(params.ripplesBackColorStrength)
  const ripplesBackColorVisibility = uniform(params.ripplesBackColorVisibility)
  const ripplesCrestVisibility = uniform(params.ripplesCrestVisibility)
  const ripplesFrontColorRatio = uniform(params.ripplesFrontColorRatio)
  const ripplesFrontColorStrength = uniform(params.ripplesFrontColorStrength)
  const ripplesFrontColorVisibility = uniform(params.ripplesFrontColorVisibility)
  const ripplesNoiseFrequency = uniform(params.ripplesNoiseFrequency)
  const ripplesNoiseOffset = uniform(params.ripplesNoiseOffset)
  const ripplesNoiseStrength = uniform(params.ripplesNoiseStrength)
  const ripplesReachEnd = uniform(params.ripplesReachEnd)
  const ripplesReachStart = uniform(params.ripplesReachStart)
  const iceRatio = uniform(params.iceRatio)
  const iceNoiseFrequency = uniform(params.iceNoiseFrequency)
  const splashesRatio = uniform(params.splashesRatio)
  const splashesNoiseFrequency = uniform(params.splashesNoiseFrequency)
  const splashesTimeFrequency = uniform(params.splashesTimeFrequency)
  const splashesThickness = uniform(params.splashesThickness)
  const splashesEdgeAttenuationLow = uniform(params.splashesEdgeAttenuationLow)
  const splashesEdgeAttenuationHigh = uniform(params.splashesEdgeAttenuationHigh)
  const shoreEdge = uniform(params.shoreEdge)
  const windTimeFrequency = uniform(params.windTimeFrequency)
  const waveDepthSlowdown = uniform(params.waveDepthSlowdown)
  const waveShoreWrap = uniform(params.waveShoreWrap)
  const parameterUniforms = {
    coastalFoamFarDistance,
    coastalFoamNearDistance,
    coastalFoamStrength,
    coastalFoamVisibility,
    coastalFoamWashReach,
    depthExponent,
    depthNoiseFrequency,
    depthNoiseStrength,
    depthReach,
    depthReferenceReach,
    edgeFadeDistance,
    frontCyanDepthContourVisibility,
    frontCyanShallowDepthResponseRate,
    frontCyanShallowDepthThreshold,
    iceNoiseFrequency,
    iceRatio,
    ripplesBreakupEnd,
    ripplesBreakupFrequency,
    ripplesBreakupSize,
    ripplesBreakupStart,
    ripplesBackColorRatioMax,
    ripplesBackColorRatioMin,
    ripplesBackColorStrength,
    ripplesBackColorVisibility,
    ripplesCrestVisibility,
    ripplesFrontColorRatio,
    ripplesFrontColorStrength,
    ripplesFrontColorVisibility,
    ripplesNoiseFrequency,
    ripplesNoiseOffset,
    ripplesNoiseStrength,
    ripplesRatio,
    ripplesReachEnd,
    ripplesReachStart,
    ripplesSlopeFrequency,
    shoreEdge,
    splashesEdgeAttenuationHigh,
    splashesEdgeAttenuationLow,
    splashesNoiseFrequency,
    splashesRatio,
    splashesThickness,
    splashesTimeFrequency,
    waveDepthSlowdown,
    waveShoreWrap,
    windTimeFrequency,
  }

  const hasCoastalFoam = params.coastalFoamStrength > 0
  const hasRipples = params.ripplesRatio > 0
  const hasRippleAccents =
    params.ripplesFrontColorStrength > 0 || params.ripplesBackColorStrength > 0
  const hasIce = params.iceRatio > 0
  const hasSplashes = params.splashesRatio > 0

  const packedDepthDistanceNode = Fn(([terrainData]) => {
    return terrainData.r
      .mul(255 * 256)
      .add(terrainData.g.mul(255))
      .div(65535)
  })

  const edgeFadeNode = Fn(([terrainData]) => {
    const edgeDistance = terrainData.b.mul(depthReferenceReach)
    return edgeDistance.smoothstep(0, edgeFadeDistance)
  })

  const shoreDepthFromTerrainNode = Fn(([terrainData, position]) => {
    const offshore = packedDepthDistanceNode(terrainData)
      .mul(depthReferenceReach)
      .div(max(depthReach, float(0.001)))
      .clamp(0, 1)
    const depthNoise = texture(noises.perlin, position.mul(depthNoiseFrequency))
      .r.sub(0.5)
      .mul(depthNoiseStrength)
      .mul(offshore.smoothstep(0.08, 0.55))
    const waterDepth = offshore.pow(depthExponent).add(depthNoise).clamp(0, 1)

    return waterDepth.oneMinus().mul(edgeFadeNode(terrainData))
  })

  const shoreDepthFieldNode = Fn(([terrainData]) => {
    return shoreDepthFromTerrainNode(terrainData, positionWorld.xz)
  })

  const rippleVisibilityDepthNode = Fn(([terrainData]) => {
    return shoreDepthFieldNode(terrainData)
  })

  const waterColorNode = Fn(([shoreDepthField]) => {
    const waterDepth = shoreDepthField.oneMinus()
    const shallowColor = color('#8fe4de')
    const midColor = color('#39a8cb')
    const deepColor = color('#1f6f9d')
    const shallowToMid = mix(shallowColor, midColor, waterDepth.smoothstep(0.06, 0.32))

    return mix(shallowToMid, deepColor, waterDepth.smoothstep(0.28, 0.68))
  })

  const phaseBandNode = Fn(([phase, start, end, feather]) => {
    const leadingEdge = phase.smoothstep(start, start.add(feather))
    const trailingEdge = phase.smoothstep(end.sub(feather), end).oneMinus()

    return leadingEdge.mul(trailingEdge)
  })

  const coastalFoamNode = Fn(([terrainData]) => {
    const shoreDepthField = shoreDepthFieldNode(terrainData)
    const waterDepth = shoreDepthField.oneMinus()
    const macroNoise = texture(noises.perlin, positionWorld.xz.mul(0.045).add(vec2(3.7, 8.1))).r
    const detailNoise = texture(noises.perlin, positionWorld.xz.mul(0.135).add(vec2(-5.2, 1.9))).r
    const foamNearDistance = coastalFoamNearDistance.clamp(0.01, 0.6)
    const foamFarDistance = max(coastalFoamFarDistance, foamNearDistance.add(0.04)).clamp(
      0.05,
      0.85,
    )
    const foamDistanceSpan = foamFarDistance.sub(foamNearDistance)
    const foamBandProgress = foamFarDistance
      .sub(waterDepth)
      .div(max(foamDistanceSpan, float(0.04)))
      .clamp(0, 1)
    const foamCoordinate = foamBandProgress
      .mul(2.4)
      .sub(wind.localTime.mul(0.5))
      .add(macroNoise.sub(0.5).mul(0.4))
      .add(detailNoise.sub(0.5).mul(0.08))
      .add(1000)
    const foamEvent = foamCoordinate.floor()
    const foamPhase = foamCoordinate.fract()
    const eventOffset = vec2(hash(foamEvent.mul(2.17)), hash(foamEvent.mul(5.31))).mul(37)
    const segmentMacro = texture(noises.perlin, positionWorld.xz.mul(0.055).add(eventOffset)).r
    const segmentDetail = texture(
      noises.perlin,
      positionWorld.xz.mul(0.135).add(eventOffset.mul(0.37)),
    ).r
    const segmentField = mix(segmentMacro, segmentDetail, 0.32)
    const segmentMask = segmentField.smoothstep(0.46, 0.64)
    const miniWaveBand = phaseBandNode(foamPhase, float(0.42), float(0.56), float(0.04))
    const nearShoreZone = waterDepth
      .smoothstep(foamNearDistance.sub(0.025), foamNearDistance.add(0.025))
      .mul(waterDepth.smoothstep(foamFarDistance.sub(0.035), foamFarDistance.add(0.035)).oneMinus())
    const miniWaves = miniWaveBand.mul(nearShoreZone).mul(segmentMask)
    const washNoise = mix(macroNoise, detailNoise, 0.35).smoothstep(0.35, 0.72)
    const washVariation = mix(float(0.45), float(1), washNoise)
    const warpedWashWaterDepth = waterDepth
      .sub(macroNoise.sub(0.5).mul(0.045))
      .sub(detailNoise.sub(0.5).mul(0.015))
    const washReach = coastalFoamWashReach.clamp(0.02, 0.35)
    const shoreWash = warpedWashWaterDepth
      .smoothstep(washReach.mul(0.62), washReach)
      .oneMinus()
      .mul(washVariation)

    return max(miniWaves, shoreWash.mul(0.9))
      .mul(coastalFoamStrength.clamp(0, 1))
      .mul(coastalFoamVisibility.clamp(0, 1))
  })

  const rippleBreakupNode = Fn(([eventIndex, visibilityDepth, samplePosition]) => {
    const breakupMask = visibilityDepth.smoothstep(ripplesBreakupStart, ripplesBreakupEnd)
    const perlinNoise = texture(
      noises.perlin,
      samplePosition
        .add(vec2(eventIndex.mul(17.3), eventIndex.mul(41.9)))
        .mul(ripplesBreakupFrequency),
    ).r
    const cellNoise = hash(
      samplePosition
        .mul(ripplesBreakupFrequency.mul(4))
        .add(vec2(eventIndex.mul(0.37), eventIndex.mul(0.73)))
        .floor(),
    )
    const breakupNoise = max(perlinNoise, cellNoise.mul(0.9))
    const breakupThreshold = breakupMask.mul(ripplesBreakupSize).sub(0.08)
    const hardKeep = breakupNoise.step(breakupThreshold)
    const smoothKeep = breakupNoise.smoothstep(
      breakupThreshold.sub(0.065),
      breakupThreshold.add(0.065),
    )

    return vec4(hardKeep, perlinNoise, breakupMask, smoothKeep)
  })

  const rippleNoiseNode = Fn(([eventIndex, breakupMask, samplePosition]) => {
    return texture(
      noises.perlin,
      samplePosition.add(eventIndex.div(ripplesNoiseOffset)).mul(ripplesNoiseFrequency),
    )
      .r.mul(ripplesNoiseStrength)
      .mul(breakupMask)
  })

  const rippleReferencePositionNode = Fn(([currentDepth, targetDepth]) => {
    const sampleStep = float(0.75)
    const center = positionWorld.xz
    const xOffset = vec2(sampleStep, 0)
    const zOffset = vec2(0, sampleStep)
    const xPositivePosition = center.add(xOffset)
    const xNegativePosition = center.sub(xOffset)
    const zPositivePosition = center.add(zOffset)
    const zNegativePosition = center.sub(zOffset)
    const xPositiveDepth = shoreDepthFromTerrainNode(
      context.terrain.terrainNode(xPositivePosition),
      xPositivePosition,
    )
    const xNegativeDepth = shoreDepthFromTerrainNode(
      context.terrain.terrainNode(xNegativePosition),
      xNegativePosition,
    )
    const zPositiveDepth = shoreDepthFromTerrainNode(
      context.terrain.terrainNode(zPositivePosition),
      zPositivePosition,
    )
    const zNegativeDepth = shoreDepthFromTerrainNode(
      context.terrain.terrainNode(zNegativePosition),
      zNegativePosition,
    )
    const depthGradient = vec2(
      xPositiveDepth.sub(xNegativeDepth),
      zPositiveDepth.sub(zNegativeDepth),
    ).div(sampleStep.mul(2))
    const gradientLength = max(depthGradient.length(), float(0.0005))
    const offsetDistance = targetDepth.sub(currentDepth).div(gradientLength).clamp(-6, 6)

    return center.add(depthGradient.div(gradientLength).mul(offsetDistance))
  })

  const ripplesNode = Fn(([terrainData]) => {
    const shoreDepthField = shoreDepthFieldNode(terrainData)
    const rippleVisibilityDepth = rippleVisibilityDepthNode(terrainData)
    const rippleMask = rippleVisibilityDepth.smoothstep(ripplesReachStart, ripplesReachEnd)
    const rippleTime = wind.localTime.mul(0.5)
    const baseRipple =
      ripplePhase === 'incoming'
        ? mix(
            dot(positionWorld.xz, wind.direction).div(max(depthReferenceReach, float(0.001))),
            shoreDepthField,
            waveShoreWrap,
          )
            .add(shoreDepthField.mul(shoreDepthField).mul(waveDepthSlowdown))
            .sub(rippleTime)
            .mul(ripplesSlopeFrequency)
        : shoreDepthField.sub(rippleTime).mul(ripplesSlopeFrequency)
    const wrappedBaseRipple = baseRipple.add(1000)
    const rippleIndex = wrappedBaseRipple.floor()
    const rippleBreakup = rippleBreakupNode(rippleIndex, rippleVisibilityDepth, positionWorld.xz)
    const ripplesNoise = rippleNoiseNode(rippleIndex, rippleBreakup.z, positionWorld.xz)

    const crestOffset = shoreDepthField.remap(0, 1, -0.3, 1).oneMinus()
    const basePhase = wrappedBaseRipple.fract()
    const crestPhase = basePhase.add(ripplesNoise)
    const ripplesValue = crestPhase.sub(crestOffset)
    const crestThreshold = ripplesRatio.remap(0, 1, -1, -0.4)
    const crest = crestThreshold.step(ripplesValue)
    const crestStart = crestOffset.add(crestThreshold)
    const whiteCrest = crest.mul(rippleMask).mul(rippleBreakup.x)

    if (!hasRippleAccents) return vec4(whiteCrest.mul(ripplesCrestVisibility), 0, 0, 0)

    const waveWidth = crestStart.clamp(0.035, 0.12)
    const frontCyanWaterDepth = shoreDepthField.oneMinus()
    const frontCyanDepthThreshold = frontCyanShallowDepthThreshold.clamp(0.03, 0.95)
    const frontCyanDepthResponseWidth = float(0.5)
      .div(frontCyanShallowDepthResponseRate.clamp(2, 30))
      .clamp(0.015, 0.2)
    const frontCyanTransitionSpan = frontCyanDepthResponseWidth.mul(2)
    const frontCyanTransitionStart = float(1)
      .sub(frontCyanDepthThreshold.add(frontCyanDepthResponseWidth))
      .clamp(0, 1)
    const frontCyanShallowTravel = max(shoreDepthField.sub(frontCyanTransitionStart), float(0))
    const frontCyanTransitionProgress = frontCyanShallowTravel
      .div(max(frontCyanTransitionSpan, float(0.001)))
      .clamp(0, 1)
    const frontCyanShallowProgress = frontCyanTransitionProgress.smoothstep(0, 1)
    const frontCyanIntegratedResponse = frontCyanTransitionSpan
      .mul(
        frontCyanTransitionProgress
          .mul(frontCyanTransitionProgress)
          .mul(frontCyanTransitionProgress)
          .sub(
            frontCyanTransitionProgress
              .mul(frontCyanTransitionProgress)
              .mul(frontCyanTransitionProgress)
              .mul(frontCyanTransitionProgress)
              .mul(0.5),
          ),
      )
      .add(max(frontCyanShallowTravel.sub(frontCyanTransitionSpan), float(0)))
    const frontCyanWrappedRipple = wrappedBaseRipple.sub(
      frontCyanIntegratedResponse.mul(ripplesSlopeFrequency).mul(0.62),
    )
    const frontCyanEventIndex = frontCyanWrappedRipple.floor()
    const frontCyanBasePhase = frontCyanWrappedRipple.fract()
    const frontCyanSourceBreakup = rippleBreakupNode(
      frontCyanEventIndex,
      rippleVisibilityDepth,
      positionWorld.xz,
    )
    const frontCyanRippleNoise = rippleNoiseNode(
      frontCyanEventIndex,
      frontCyanSourceBreakup.z,
      positionWorld.xz,
    )
    const frontCyanPhase = frontCyanBasePhase.add(frontCyanRippleNoise)
    const frontCyanSegmentMacro = texture(
      noises.perlin,
      positionWorld.xz
        .add(vec2(frontCyanEventIndex.mul(11.7), frontCyanEventIndex.mul(23.9)))
        .mul(0.055),
    ).r
    const frontCyanSegmentDetail = texture(
      noises.perlin,
      positionWorld.xz
        .add(vec2(frontCyanEventIndex.mul(4.3), frontCyanEventIndex.mul(7.1)))
        .mul(0.14),
    ).r
    const frontCyanSegments = mix(frontCyanSegmentMacro, frontCyanSegmentDetail, 0.3).smoothstep(
      0.44,
      0.63,
    )
    const frontCyanShallowBreakup = mix(float(1), frontCyanSegments, frontCyanShallowProgress)
    const shoreTakeover = crestStart.smoothstep(0, 0.12).oneMinus()
    const shoreFrontPhase = max(crestStart.sub(frontCyanRippleNoise), float(0))
    const shoreBackPhase = shoreFrontPhase.mul(shoreTakeover.oneMinus())
    const shoreFeather = waveWidth.mul(0.18).clamp(0.003, 0.012)
    const shoreCyanBand = phaseBandNode(
      frontCyanBasePhase,
      shoreBackPhase.sub(shoreFeather),
      shoreFrontPhase.add(waveWidth),
      shoreFeather,
    ).mul(shoreTakeover)
    const activeShoreTakeover = shoreCyanBand
      .mul(ripplesFrontColorStrength.smoothstep(0.01, 0.12))
      .mul(ripplesFrontColorVisibility.clamp(0, 1))
    const shoreCyanBreakup = mix(
      frontCyanSourceBreakup.w,
      float(1),
      shoreTakeover.smoothstep(0.25, 0.85),
    )
    const shoreCyan = shoreCyanBand
      .mul(rippleMask)
      .mul(shoreCyanBreakup)
      .mul(frontCyanShallowBreakup)
      .mul(1.45)
    const frontWidth = waveWidth.mul(ripplesFrontColorRatio).clamp(0.015, 0.08)
    const frontVisibilityDepth = rippleVisibilityDepth
      .sub(
        frontCyanPhase
          .sub(crestStart)
          .clamp(0, frontWidth)
          .div(max(ripplesSlopeFrequency, float(0.001))),
      )
      .clamp(0, 1)
    const frontReferencePosition = rippleReferencePositionNode(
      rippleVisibilityDepth,
      frontVisibilityDepth,
    )
    const frontBreakup = rippleBreakupNode(
      frontCyanEventIndex,
      frontVisibilityDepth,
      frontReferencePosition,
    )
    const frontRippleMask = frontVisibilityDepth.smoothstep(ripplesReachStart, ripplesReachEnd)
    const tailEventIndex = rippleIndex.add(1)
    const tailVisibilityDepth = rippleVisibilityDepth
      .add(
        float(1)
          .sub(basePhase)
          .div(max(ripplesSlopeFrequency, float(0.001))),
      )
      .clamp(0, 1)
    const tailReferencePosition = rippleReferencePositionNode(
      rippleVisibilityDepth,
      tailVisibilityDepth,
    )
    const tailBreakup = rippleBreakupNode(
      tailEventIndex,
      tailVisibilityDepth,
      tailReferencePosition,
    )
    const tailRippleMask = tailVisibilityDepth.smoothstep(ripplesReachStart, ripplesReachEnd)
    const tailCrestOffset = tailVisibilityDepth.remap(0, 1, -0.3, 1).oneMinus()
    const tailCrestStart = tailCrestOffset.add(crestThreshold)
    const tailRippleNoise = rippleNoiseNode(tailEventIndex, tailBreakup.z, tailReferencePosition)
    const tailCrestVisibility = tailRippleNoise
      .smoothstep(tailCrestStart.sub(0.025), tailCrestStart.add(0.025))
      .oneMinus()
    const backRatio = mix(
      ripplesBackColorRatioMin,
      ripplesBackColorRatioMax,
      hash(tailEventIndex.mul(19.73)),
    )
    const backWidth = tailCrestStart.clamp(0.035, 0.12).mul(backRatio).clamp(0.035, 0.3)
    const frontFeather = frontWidth.mul(0.18).clamp(0.002, 0.015)
    const frontBand = phaseBandNode(
      frontCyanPhase,
      crestStart.sub(frontFeather),
      crestStart.add(frontWidth),
      frontFeather,
    )
    const frontVisibility = frontRippleMask
      .mul(frontBreakup.x)
      .mul(mix(float(0.55), float(1), frontBreakup.y))
      .mul(frontCyanShallowBreakup)
    const frontCyan = max(frontBand.mul(frontVisibility), shoreCyan)
    const tailEdgeProfile = tailBreakup.w.mul(tailCrestVisibility).smoothstep(0.05, 0.95)
    const roundedBackWidth = backWidth.mul(tailEdgeProfile).clamp(0.002, 0.3)
    const tailProgress = float(1)
      .sub(basePhase)
      .div(max(roundedBackWidth, float(0.002)))
      .clamp(0, 1)
    const tailOpacity = tailProgress.smoothstep(0.025, 1).oneMinus().pow(1.35)
    const tailVariation = mix(float(0.55), float(1), tailBreakup.y)
    const tailVisibility = tailRippleMask.mul(tailEdgeProfile).mul(tailVariation)
    const remainingWhite = activeShoreTakeover.oneMinus()

    return vec4(
      whiteCrest.mul(remainingWhite).mul(ripplesCrestVisibility),
      frontCyan.mul(ripplesFrontColorVisibility),
      tailOpacity.mul(tailVisibility).mul(ripplesBackColorVisibility),
      0,
    )
  })

  const iceNode = Fn(([terrainData]) => {
    const iceVoronoi = texture(noises.voronoi, positionWorld.xz.mul(iceNoiseFrequency)).g
    const shoreDepthField = shoreDepthFieldNode(terrainData)
    const ice = shoreDepthField.remapClamp(0, iceRatio, 0, 1).toVar()
    ice.assign(iceVoronoi.step(ice))

    return ice
  })

  const splashesNode = Fn(() => {
    const splashesVoronoi = texture(noises.voronoi, positionWorld.xz.mul(splashesNoiseFrequency))
    const splashPerlin = texture(
      noises.perlin,
      positionWorld.xz.mul(splashesNoiseFrequency.mul(0.25)),
    ).r

    const splash = splashesVoronoi.r

    const splashTimeRandom = hash(splashesVoronoi.b.mul(123456)).add(splashPerlin)
    const splashTime = wind.localTime.mul(splashesTimeFrequency).add(splashTimeRandom)
    splash.assign(splash.sub(splashTime).fract())

    const edgeMutliplier = splashesVoronoi.g.remapClamp(
      splashesEdgeAttenuationLow,
      splashesEdgeAttenuationHigh,
      0,
      1,
    )
    const thickness = splashesThickness.mul(edgeMutliplier)
    splash.assign(splash.step(thickness).oneMinus())

    const splashVisibilityRandom = hash(splashesVoronoi.b.mul(654321))
    const visible = splashVisibilityRandom.add(splashPerlin).fract()
    visible.assign(splashesRatio.step(visible))
    splash.assign(splash.mul(visible))

    return splash
  })

  const shoreNode = Fn(([terrainData]) => {
    return terrainData.a.mul(edgeFadeNode(terrainData)).smoothstep(shoreEdge, shoreEdge.add(0.12))
  })

  const frontCyanDepthContourNode = Fn(([shoreDepthField]) => {
    const waterDepth = shoreDepthField.oneMinus()
    const contourDistance = waterDepth.sub(frontCyanShallowDepthThreshold.clamp(0.03, 0.95)).abs()

    return contourDistance
      .smoothstep(0.006, 0.018)
      .oneMinus()
      .mul(frontCyanDepthContourVisibility.clamp(0, 1))
  })

  const detailsMask = () =>
    Fn(() => {
      const terrainData = context.terrain.terrainNode(positionWorld.xz)
      const value = float(0)

      if (hasRipples) value.assign(max(value, ripplesNode(terrainData).x))
      if (hasIce) value.assign(max(value, iceNode(terrainData)))
      if (hasSplashes) value.assign(max(value, splashesNode()))

      value.assign(max(value, shoreNode(terrainData)))

      return value
    })()

  const waterSurfaceColor = Fn(() => {
    const terrainData = context.terrain.terrainNode(positionWorld.xz)
    const details = detailsMask()
    const shoreDepthField = shoreDepthFieldNode(terrainData)
    const waterColor = waterColorNode(shoreDepthField).toVar()

    if (hasRipples) {
      const rippleBands = ripplesNode(terrainData)
      const rippleAccent = max(
        rippleBands.y.mul(ripplesFrontColorStrength.clamp(0, 1)),
        rippleBands.z.mul(ripplesBackColorStrength.clamp(0, 1)),
      )
      waterColor.assign(mix(waterColor, color('#51bfd2'), rippleAccent.mul(0.5)))
    }

    if (hasCoastalFoam) {
      waterColor.assign(mix(waterColor, color('#f7f3df'), coastalFoamNode(terrainData)))
    }

    const finalWaterColor = mix(waterColor, color(0xffffff), details).toVar()
    finalWaterColor.assign(
      mix(finalWaterColor, color('#ff3bd4'), frontCyanDepthContourNode(shoreDepthField)),
    )

    return finalWaterColor
  })()

  const waterSurfaceAlpha = Fn(() => {
    return max(float(0.92), detailsMask()).clamp(0, 1)
  })()

  const blurOutputNode = Fn(() => {
    const blurOutput = hashBlur(viewportSharedTexture(screenUV), params.blurStrength, {
      repeats: 25,
      premultipliedAlpha: true,
    })

    return vec3(blurOutput)
  })

  const material = new LandrushBrunoMeshDefaultMaterial(context, {
    depthWrite: false,
    colorNode: waterSurfaceColor,
    alphaNode: waterSurfaceAlpha,
    alphaTest: 0,
    hasCoreShadows: false,
    hasDropShadows: true,
    hasLightBounce: false,
    hasFog: true,
    hasWater: false,
    transparent: true,
  }) as LandrushIncomingWaterSurfaceMaterial

  const baseOutput = material.outputNode
  const blurredOutput = Fn(() => {
    const blurOutput = blurOutputNode()
    const surfaceAlpha = baseOutput.a
    const surfaceOutput = vec4(baseOutput.rgb, 1)

    return select(surfaceAlpha.lessThan(0.5), blurOutput, surfaceOutput)
  })()

  material.outputNode =
    params.hasBlurredUnderlay && params.qualityLevel === 0 ? blurredOutput : baseOutput
  material.maskShadowNode = detailsMask().greaterThan(0.5)
  material.needsUpdate = true

  const originalDispose = material.dispose.bind(material)
  material.dispose = () => {
    noises.dispose()
    originalDispose()
  }
  material.userData.landrushWater = {
    noises,
    parameters: params,
    setParameters: (nextParameters) => {
      Object.assign(params, nextParameters)
      for (const [key, parameterUniform] of Object.entries(parameterUniforms)) {
        if (key in nextParameters && typeof nextParameters[key] === 'number') {
          parameterUniform.value = nextParameters[key]
        }
      }
      if (typeof nextParameters.windAngle === 'number') {
        wind.angle = nextParameters.windAngle
        wind.direction.value.set(
          Math.sin(nextParameters.windAngle),
          Math.cos(nextParameters.windAngle),
        )
      }
      if (typeof nextParameters.windStrength === 'number') {
        wind.strength.value = nextParameters.windStrength
      }
      if (typeof nextParameters.windTimeFrequency === 'number') {
        wind.timeFrequency = nextParameters.windTimeFrequency
      }
    },
    update: (deltaSeconds: number) => wind.update(deltaSeconds),
    wind,
  }

  return material
}

function createLandrushBrunoWaterContext({
  bounds,
  noises,
  params,
  terrainFieldTexture,
  wind,
}: {
  bounds: LandrushWorldNode['perimeter']['bounds']
  noises: LandrushBrunoWaterNoises
  params: LandrushWaterSurfaceParameters
  terrainFieldTexture: Texture
  wind: LandrushBrunoWaterWind
}) {
  const boundsMin = uniform(new Vector2(bounds.minX, bounds.minZ))
  const boundsSize = uniform(new Vector2(bounds.width, bounds.depth))
  const surfaceElevationUniform = uniform(LANDRUSH_WATER_SURFACE_ELEVATION)
  const surfaceThicknessUniform = uniform(params.surfaceThickness)

  const terrainNode = Fn(([position]) => {
    const textureUv = position.sub(boundsMin).div(boundsSize).clamp(0, 1)
    return texture(terrainFieldTexture, textureUv)
  })

  const colorNode = Fn(([terrainData]) => {
    const waterDepth = terrainData.b.oneMinus()
    const shallowColor = color('#8fe4de')
    const midColor = color('#39a8cb')
    const deepColor = color('#1f6f9d')
    const shallowToMid = mix(shallowColor, midColor, waterDepth.smoothstep(0.06, 0.32))

    return mix(shallowToMid, deepColor, waterDepth.smoothstep(0.28, 0.68))
  })

  return {
    fog: {
      color: color('#164a77'),
      strength: float(0),
    },
    lighting: {
      colorUniform: color('#ffffff'),
      coreShadowEdgeHigh: float(0.55),
      coreShadowEdgeLow: float(-0.15),
      directionUniform: vec3(0.35, 0.74, 0.58).normalize(),
      intensityUniform: float(1),
      lightBounceDistance: float(12),
      lightBounceEdgeHigh: float(0.7),
      lightBounceEdgeLow: float(0.12),
      lightBounceMultiplier: float(0),
      shadowColor: color('#6d8ea0'),
    },
    noises,
    quality: {
      level: params.qualityLevel,
    },
    reveal: {
      color: color('#ffffff'),
      distance: float(100000),
      intensity: float(0),
      position2Uniform: uniform(vec2(0, 0)),
      thickness: float(1),
    },
    terrain: {
      colorNode,
      terrainNode,
    },
    water: {
      surfaceElevationUniform,
      surfaceThicknessUniform,
    },
    wind,
  }
}
