// @ts-nocheck -- Independent lag-body water experiment copied from water-surface.ts.
import type { LandrushWorldNode } from '@pascal-app/core'
import { ClampToEdgeWrapping, type Texture, Vector2 } from 'three'
import { hashBlur } from 'three/examples/jsm/tsl/display/hashBlur.js'
import {
  atan,
  color,
  cos,
  Fn,
  float,
  hash,
  max,
  mix,
  positionWorld,
  screenUV,
  select,
  sin,
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
import {
  LANDRUSH_WATER_SURFACE_ELEVATION,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  LANDRUSH_WATER_SURFACE_THICKNESS,
  type LandrushWaterSurfaceParameters,
} from './water-surface'

export type LandrushWaterBodySurfaceParameters = LandrushWaterSurfaceParameters & {
  waveBodyAheadBrightness: number
  waveBodyAheadLagSeconds: number
  waveBodyAheadRatio: number
  waveBodyAheadWidth: number
  waveBodyBehindBrightness: number
  waveBodyBehindLagSeconds: number
  waveBodyBehindRatio: number
  waveBodyBehindWidth: number
  waveDepthSmooth: number
  waveSectorCount: number
  waveSectorEnabled: number
  waveSectorRotationSpeed: number
  waveSectorTimeOffset: number
}

export const LANDRUSH_WATER_BODY_SURFACE_PARAMETERS = {
  ...LANDRUSH_WATER_SURFACE_PARAMETERS,
  ripplesBreakupEnd: 0.61,
  ripplesBreakupFrequency: 0.02,
  ripplesBreakupStart: 0.06,
  waveBodyAheadBrightness: 0.51,
  waveBodyAheadLagSeconds: 1.97,
  waveBodyAheadRatio: 0.16,
  waveBodyAheadWidth: 0.6,
  waveBodyBehindBrightness: 0.69,
  waveBodyBehindLagSeconds: 0.36,
  waveBodyBehindRatio: 0.28,
  waveBodyBehindWidth: 0.12,
  waveDepthSmooth: 1,
  waveSectorCount: 1,
  waveSectorEnabled: 1,
  waveSectorRotationSpeed: 0,
  waveSectorTimeOffset: 5,
} satisfies LandrushWaterBodySurfaceParameters

export type LandrushWaterBodySurfaceMaterial = LandrushBrunoMeshDefaultMaterial & {
  userData: {
    landrushWater: {
      noises: LandrushBrunoWaterNoises
      parameters: LandrushWaterBodySurfaceParameters
      setParameters: (parameters: Partial<LandrushWaterBodySurfaceParameters>) => void
      update: (deltaSeconds: number) => void
      wind: LandrushBrunoWaterWind
    }
  }
}

export function createLandrushWaterBodyMaterial(
  renderer: THREE.WebGPURenderer,
  terrainFieldTexture: Texture,
  bounds: LandrushWorldNode['perimeter']['bounds'],
  parameters: Partial<LandrushWaterBodySurfaceParameters> = {},
  waveDepthTexture: Texture = terrainFieldTexture,
): LandrushWaterBodySurfaceMaterial {
  terrainFieldTexture.wrapS = ClampToEdgeWrapping
  terrainFieldTexture.wrapT = ClampToEdgeWrapping
  waveDepthTexture.wrapS = ClampToEdgeWrapping
  waveDepthTexture.wrapT = ClampToEdgeWrapping

  const params = { ...LANDRUSH_WATER_BODY_SURFACE_PARAMETERS, ...parameters }
  const noises = new LandrushBrunoWaterNoises(renderer)
  const wind = new LandrushBrunoWaterWind(noises)
  wind.angle = params.windAngle
  wind.direction.value.set(Math.sin(params.windAngle), Math.cos(params.windAngle))
  wind.strength.value = params.windStrength
  wind.timeFrequency = params.windTimeFrequency

  const context = createLandrushBodyWaterContext({
    bounds,
    noises,
    params,
    terrainFieldTexture,
    waveDepthTexture,
    wind,
  })

  const depthExponent = uniform(params.depthExponent)
  const depthNoiseFrequency = uniform(params.depthNoiseFrequency)
  const depthNoiseStrength = uniform(params.depthNoiseStrength)
  const depthReach = uniform(params.depthReach)
  const depthReferenceReach = uniform(params.depthReferenceReach)
  const edgeFadeDistance = uniform(params.edgeFadeDistance)
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
  const waveBodyAheadBrightness = uniform(params.waveBodyAheadBrightness)
  const waveBodyAheadLagSeconds = uniform(params.waveBodyAheadLagSeconds)
  const waveBodyAheadRatio = uniform(params.waveBodyAheadRatio)
  const waveBodyAheadWidth = uniform(params.waveBodyAheadWidth)
  const waveBodyBehindBrightness = uniform(params.waveBodyBehindBrightness)
  const waveBodyBehindLagSeconds = uniform(params.waveBodyBehindLagSeconds)
  const waveBodyBehindRatio = uniform(params.waveBodyBehindRatio)
  const waveBodyBehindWidth = uniform(params.waveBodyBehindWidth)
  const waveDepthSmooth = uniform(params.waveDepthSmooth)
  const waveSectorCount = uniform(params.waveSectorCount)
  const waveSectorEnabled = uniform(params.waveSectorEnabled)
  const waveSectorRotationSpeed = uniform(params.waveSectorRotationSpeed)
  const waveSectorTimeOffset = uniform(params.waveSectorTimeOffset)
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
  const parameterUniforms = {
    depthExponent,
    depthNoiseFrequency,
    depthNoiseStrength,
    depthReach,
    depthReferenceReach,
    edgeFadeDistance,
    iceNoiseFrequency,
    iceRatio,
    ripplesBreakupEnd,
    ripplesBreakupFrequency,
    ripplesBreakupSize,
    ripplesBreakupStart,
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
    waveBodyAheadBrightness,
    waveBodyAheadLagSeconds,
    waveBodyAheadRatio,
    waveBodyAheadWidth,
    waveBodyBehindBrightness,
    waveBodyBehindLagSeconds,
    waveBodyBehindRatio,
    waveBodyBehindWidth,
    waveDepthSmooth,
    waveSectorCount,
    waveSectorEnabled,
    waveSectorRotationSpeed,
    waveSectorTimeOffset,
    windTimeFrequency,
  }

  const hasRipples = params.ripplesRatio > 0
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

  const waveDepthNode = Fn(([position]) => {
    return context.terrain.waveDepthNode(position)
  })

  const waveSectorTimeOffsetNode = Fn(() => {
    const center = vec2(bounds.minX + bounds.width * 0.5, bounds.minZ + bounds.depth * 0.5)
    const centered = positionWorld.xz.sub(center)
    const rotation = wind.localTime.mul(waveSectorRotationSpeed)
    const rotationCos = cos(rotation)
    const rotationSin = sin(rotation)
    const rotated = vec2(
      centered.x.mul(rotationCos).sub(centered.y.mul(rotationSin)),
      centered.x.mul(rotationSin).add(centered.y.mul(rotationCos)),
    )
    const direction = rotated.div(rotated.length().max(0.001))
    const sectorCount = waveSectorCount.clamp(1, 60).floor()
    const angle = atan(direction.y, direction.x).add(Math.PI)
    const stagger = angle
      .div(Math.PI * 2)
      .mul(sectorCount)
      .floor()
    const adjacentSectorLag = waveSectorTimeOffset
      .mul(windTimeFrequency.mul(0.5))
      .mul(wind.strength)

    return stagger.mul(adjacentSectorLag).mul(waveSectorEnabled)
  })

  const rippleMasksNode = Fn(([terrainData, timeOffset, softness]) => {
    const shoreDepthField = waveDepthNode(positionWorld.xz)
    const rippleVisibilityDepth = rippleVisibilityDepthNode(terrainData)
    const rippleMask = rippleVisibilityDepth.smoothstep(ripplesReachStart, ripplesReachEnd)
    const rippleBreakupDepth = max(rippleVisibilityDepth, shoreDepthField)
    const ripplesBreakupMask = rippleBreakupDepth.smoothstep(ripplesBreakupStart, ripplesBreakupEnd)
    const rippleTime = wind.localTime.mul(0.5).add(timeOffset).add(waveSectorTimeOffsetNode())
    const baseRipple = shoreDepthField.sub(rippleTime).mul(ripplesSlopeFrequency)
    const rippleIndex = baseRipple.floor()

    const ripplesNoise = texture(
      noises.perlin,
      positionWorld.xz.add(rippleIndex.div(ripplesNoiseOffset)).mul(ripplesNoiseFrequency),
    )
      .r.mul(ripplesNoiseStrength)
      .mul(ripplesBreakupMask)
    const perlinBreakupNoise = texture(
      noises.perlin,
      positionWorld.xz
        .add(vec2(rippleIndex.mul(17.3), rippleIndex.mul(41.9)))
        .mul(ripplesBreakupFrequency),
    ).r
    const cellBreakupNoise = hash(
      positionWorld.xz
        .mul(ripplesBreakupFrequency.mul(4))
        .add(vec2(rippleIndex.mul(0.37), rippleIndex.mul(0.73)))
        .floor(),
    )
    const breakupNoise = max(perlinBreakupNoise, cellBreakupNoise.mul(0.9))
    const breakupKeep = breakupNoise.step(ripplesBreakupMask.mul(ripplesBreakupSize).sub(0.08))

    const ripples = shoreDepthField
      .sub(rippleTime)
      .mul(ripplesSlopeFrequency)
      .mod(1)
      .sub(shoreDepthField.remap(0, 1, -0.3, 1).oneMinus())
      .add(ripplesNoise)

    const threshold = ripplesRatio.remap(0, 1, -1, -0.4)
    const crest = threshold.step(ripples)
    const bodyDistance = ripples.sub(threshold).abs()
    const body = bodyDistance.smoothstep(softness, float(0))
    const visibility = rippleMask.mul(breakupKeep)

    return vec2(crest.mul(visibility), body.mul(visibility))
  })

  const ripplesNode = Fn(([terrainData]) => {
    return rippleMasksNode(terrainData, float(0), float(0.001)).x
  })

  const rippleBodyBehindNode = Fn(([terrainData]) => {
    const lagPhase = waveBodyBehindLagSeconds.mul(windTimeFrequency.mul(0.5)).mul(wind.strength)
    return rippleMasksNode(terrainData, lagPhase, waveBodyBehindWidth).y.mul(waveBodyBehindRatio)
  })

  const rippleBodyAheadNode = Fn(([terrainData]) => {
    const lagPhase = waveBodyAheadLagSeconds.mul(windTimeFrequency.mul(0.5)).mul(wind.strength)
    return rippleMasksNode(terrainData, float(0).sub(lagPhase), waveBodyAheadWidth).y.mul(
      waveBodyAheadRatio,
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
    return terrainData.a.mul(edgeFadeNode(terrainData)).smoothstep(shoreEdge, shoreEdge.add(0.12))
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

  const bodyBehindMask = () =>
    Fn(() => {
      if (!hasRipples) return float(0)

      const terrainData = context.terrain.terrainNode(positionWorld.xz)
      return rippleBodyBehindNode(terrainData)
    })()

  const bodyAheadMask = () =>
    Fn(() => {
      if (!hasRipples) return float(0)

      const terrainData = context.terrain.terrainNode(positionWorld.xz)
      return rippleBodyAheadNode(terrainData)
    })()

  const waterSurfaceColor = Fn(() => {
    const terrainData = context.terrain.terrainNode(positionWorld.xz)
    const details = detailsMask()
    const behindBody = bodyBehindMask()
    const aheadBody = bodyAheadMask()
    const shoreDepthField = shoreDepthFieldNode(terrainData)
    const waterColor = waterColorNode(shoreDepthField)
    const behindColor = mix(waterColor, color('#b9f3ed'), behindBody.mul(waveBodyBehindBrightness))
    const bodiedColor = mix(behindColor, color('#d7fbff'), aheadBody.mul(waveBodyAheadBrightness))

    return mix(bodiedColor, color(0xffffff), details)
  })()

  const waterSurfaceAlpha = Fn(() => {
    return max(float(0.92), max(detailsMask(), max(bodyBehindMask(), bodyAheadMask()))).clamp(0, 1)
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
  }) as LandrushWaterBodySurfaceMaterial

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

function createLandrushBodyWaterContext({
  bounds,
  noises,
  params,
  terrainFieldTexture,
  waveDepthTexture,
  wind,
}: {
  bounds: LandrushWorldNode['perimeter']['bounds']
  noises: LandrushBrunoWaterNoises
  params: LandrushWaterBodySurfaceParameters
  terrainFieldTexture: Texture
  waveDepthTexture: Texture
  wind: LandrushBrunoWaterWind
}) {
  const boundsMin = uniform(new Vector2(bounds.minX, bounds.minZ))
  const boundsSize = uniform(new Vector2(bounds.width, bounds.depth))
  const surfaceElevationUniform = uniform(LANDRUSH_WATER_SURFACE_ELEVATION)
  const surfaceThicknessUniform = uniform(
    params.surfaceThickness ?? LANDRUSH_WATER_SURFACE_THICKNESS,
  )

  const textureUvNode = Fn(([position]) => {
    const textureUv = position.sub(boundsMin).div(boundsSize).clamp(0, 1)
    return textureUv
  })

  const terrainNode = Fn(([position]) => {
    return texture(terrainFieldTexture, textureUvNode(position))
  })

  const waveDepthNode = Fn(([position]) => {
    return texture(waveDepthTexture, textureUvNode(position)).r
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
      waveDepthNode,
    },
    water: {
      surfaceElevationUniform,
      surfaceThicknessUniform,
    },
    wind,
  }
}
