// @ts-nocheck -- Bruno Simon TSL/WebGPU water surface port; see BRUNO_SIMON_LICENSE.md.
import type { LandrushWorldNode } from '@pascal-app/core'
import { ClampToEdgeWrapping, type Texture, Vector2 } from 'three'
import { hashBlur } from 'three/examples/jsm/tsl/display/hashBlur.js'
import {
  color,
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

export const LANDRUSH_WATER_SURFACE_ELEVATION = -0.3
export const LANDRUSH_WATER_DEPTH_ELEVATION = -1.5
export const LANDRUSH_WATER_SURFACE_THICKNESS = 0.013

export type LandrushWaterSurfaceParameters = {
  blurStrength: number
  hasBlurredUnderlay: boolean
  iceNoiseFrequency: number
  iceRatio: number
  qualityLevel: 0 | 1
  ripplesBreakupEnd: number
  ripplesBreakupFrequency: number
  ripplesBreakupSize: number
  ripplesBreakupStart: number
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

export const LANDRUSH_WATER_SURFACE_PARAMETERS = {
  blurStrength: 0.01,
  hasBlurredUnderlay: true,
  iceNoiseFrequency: 0.3,
  iceRatio: 0,
  qualityLevel: 1,
  ripplesBreakupEnd: 0.3,
  ripplesBreakupFrequency: 0.01,
  ripplesBreakupSize: 0.68,
  ripplesBreakupStart: 0.21,
  ripplesNoiseFrequency: 0.1,
  ripplesNoiseOffset: 1.5,
  ripplesNoiseStrength: 0.18,
  ripplesReachEnd: 0.55,
  ripplesReachStart: 0.39,
  ripplesRatio: 1,
  ripplesSlopeFrequency: 15.7,
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

export type LandrushWaterSurfaceMaterial = LandrushBrunoMeshDefaultMaterial & {
  userData: {
    landrushWater: {
      noises: LandrushBrunoWaterNoises
      parameters: LandrushWaterSurfaceParameters
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
  terrainFieldTexture.wrapS = ClampToEdgeWrapping
  terrainFieldTexture.wrapT = ClampToEdgeWrapping

  const params = { ...LANDRUSH_WATER_SURFACE_PARAMETERS, ...parameters }
  const noises = new LandrushBrunoWaterNoises(renderer)
  const wind = new LandrushBrunoWaterWind(noises)
  wind.angle = params.windAngle
  wind.direction.value.set(Math.sin(params.windAngle), Math.cos(params.windAngle))
  wind.strength.value = params.windStrength
  wind.timeFrequency = params.windTimeFrequency

  const context = createLandrushBrunoWaterContext({
    bounds,
    noises,
    params,
    terrainFieldTexture,
    wind,
  })

  const ripplesRatio = uniform(params.ripplesRatio)
  const ripplesSlopeFrequency = uniform(params.ripplesSlopeFrequency)
  const ripplesBreakupEnd = uniform(params.ripplesBreakupEnd)
  const ripplesBreakupFrequency = uniform(params.ripplesBreakupFrequency)
  const ripplesBreakupSize = uniform(params.ripplesBreakupSize)
  const ripplesBreakupStart = uniform(params.ripplesBreakupStart)
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

  const hasRipples = params.ripplesRatio > 0
  const hasIce = params.iceRatio > 0
  const hasSplashes = params.splashesRatio > 0

  const ripplesNode = Fn(([terrainData]) => {
    const shoreDepthField = terrainData.b
    const rippleMask = shoreDepthField.smoothstep(ripplesReachStart, ripplesReachEnd)
    const ripplesBreakupMask = shoreDepthField.smoothstep(ripplesBreakupStart, ripplesBreakupEnd)
    const rippleTime = wind.localTime.mul(0.5)
    const baseRipple = shoreDepthField.sub(rippleTime).mul(ripplesSlopeFrequency)
    const rippleIndex = baseRipple.floor()

    const ripplesNoise = texture(
      noises.perlin,
      positionWorld.xz.add(rippleIndex.div(ripplesNoiseOffset)).mul(ripplesNoiseFrequency),
    )
      .r.mul(ripplesNoiseStrength)
      .mul(ripplesBreakupMask)
    const breakupNoise = texture(
      noises.perlin,
      positionWorld.xz
        .add(vec2(rippleIndex.mul(17.3), rippleIndex.mul(41.9)))
        .mul(ripplesBreakupFrequency),
    ).r
    const breakupKeep = ripplesBreakupMask.mul(ripplesBreakupSize).sub(0.08).step(breakupNoise)

    const ripples = shoreDepthField
      .sub(rippleTime)
      .mul(ripplesSlopeFrequency)
      .mod(1)
      .sub(shoreDepthField.remap(0, 1, -0.3, 1).oneMinus())
      .add(ripplesNoise)

    ripples.assign(ripplesRatio.remap(0, 1, -1, -0.4).step(ripples))

    return ripples.mul(rippleMask).mul(breakupKeep)
  })

  const iceNode = Fn(([terrainData]) => {
    const iceVoronoi = texture(noises.voronoi, positionWorld.xz.mul(iceNoiseFrequency)).g
    const ice = terrainData.b.remapClamp(0, iceRatio, 0, 1).toVar()
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
    splash.assign(splash.sub(splashTime).mod(1))

    const edgeMutliplier = splashesVoronoi.g.remapClamp(
      splashesEdgeAttenuationLow,
      splashesEdgeAttenuationHigh,
      0,
      1,
    )
    const thickness = splashesThickness.mul(edgeMutliplier)
    splash.assign(splash.step(thickness).oneMinus())

    const splashVisibilityRandom = hash(splashesVoronoi.b.mul(654321))
    const visible = splashVisibilityRandom.add(splashPerlin).mod(1)
    visible.assign(splashesRatio.step(visible))
    splash.assign(splash.mul(visible))

    return splash
  })

  const shoreNode = Fn(([terrainData]) => {
    return terrainData.a.smoothstep(shoreEdge, shoreEdge.add(0.12))
  })

  const detailsMask = () =>
    Fn(() => {
      const terrainData = context.terrain.terrainNode(positionWorld.xz)
      const value = float(0)

      if (hasRipples) value.assign(max(value, ripplesNode(terrainData)))
      if (hasIce) value.assign(max(value, iceNode(terrainData)))
      if (hasSplashes) value.assign(max(value, splashesNode()))

      value.assign(max(value, shoreNode(terrainData)))

      return value
    })()

  const waterSurfaceColor = Fn(() => {
    const terrainData = context.terrain.terrainNode(positionWorld.xz)
    const details = detailsMask()

    return mix(context.terrain.colorNode(terrainData), color(0xffffff), details)
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
  }) as LandrushWaterSurfaceMaterial

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
