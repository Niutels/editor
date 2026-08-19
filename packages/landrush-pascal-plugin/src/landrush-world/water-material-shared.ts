// @ts-nocheck -- Three.js TSL node types do not model dynamically composed water graphs.
import { type Texture, Vector2 } from 'three'
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
import { LandrushBrunoMeshDefaultMaterial } from './bruno-mesh-default-material'
import type { LandrushBrunoWaterNoises } from './bruno-water-noises'
import type { LandrushBrunoWaterWind } from './bruno-water-wind'
import type { LandrushWorldNode } from './schema'

export function createLandrushWaterDepthNodes({
  depthExponent,
  depthNoiseFrequency,
  depthNoiseStrength,
  depthReach,
  depthReferenceReach,
  edgeFadeDistance,
  noises,
}: {
  depthExponent: unknown
  depthNoiseFrequency: unknown
  depthNoiseStrength: unknown
  depthReach: unknown
  depthReferenceReach: unknown
  edgeFadeDistance: unknown
  noises: LandrushBrunoWaterNoises
}) {
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

  return {
    edgeFadeNode,
    rippleVisibilityDepthNode,
    shoreDepthFieldNode,
    shoreDepthFromTerrainNode,
    waterColorNode,
  }
}

export function createLandrushWaterDetailNodes({
  edgeFadeNode,
  iceNoiseFrequency,
  iceRatio,
  noises,
  shoreDepthFieldNode,
  shoreEdge,
  splashesEdgeAttenuationHigh,
  splashesEdgeAttenuationLow,
  splashesNoiseFrequency,
  splashesRatio,
  splashesThickness,
  splashesTimeFrequency,
  wind,
}: {
  edgeFadeNode: unknown
  iceNoiseFrequency: unknown
  iceRatio: unknown
  noises: LandrushBrunoWaterNoises
  shoreDepthFieldNode: unknown
  shoreEdge: unknown
  splashesEdgeAttenuationHigh: unknown
  splashesEdgeAttenuationLow: unknown
  splashesNoiseFrequency: unknown
  splashesRatio: unknown
  splashesThickness: unknown
  splashesTimeFrequency: unknown
  wind: LandrushBrunoWaterWind
}) {
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

    const edgeMultiplier = splashesVoronoi.g.remapClamp(
      splashesEdgeAttenuationLow,
      splashesEdgeAttenuationHigh,
      0,
      1,
    )
    const thickness = splashesThickness.mul(edgeMultiplier)
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

  return { iceNode, shoreNode, splashesNode }
}

export function createLandrushWaterBaseMaterial({
  alphaNode,
  colorNode,
  context,
  detailsMask,
  params,
}: {
  alphaNode: unknown
  colorNode: unknown
  context: unknown
  detailsMask: () => unknown
  params: { blurStrength: number; hasBlurredUnderlay: boolean; qualityLevel: number }
}) {
  const material = new LandrushBrunoMeshDefaultMaterial(context, {
    depthWrite: false,
    colorNode,
    alphaNode,
    alphaTest: 0,
    hasCoreShadows: false,
    hasDropShadows: true,
    hasLightBounce: false,
    hasFog: true,
    hasWater: false,
    transparent: true,
  })
  const baseOutput = material.outputNode
  const blurredOutput = Fn(() => {
    const blurOutput = hashBlur(viewportSharedTexture(screenUV), params.blurStrength, {
      repeats: 25,
      premultipliedAlpha: true,
    })
    const surfaceAlpha = baseOutput.a
    const surfaceOutput = vec4(baseOutput.rgb, 1)

    return select(surfaceAlpha.lessThan(0.5), vec3(blurOutput), surfaceOutput)
  })()

  material.outputNode =
    params.hasBlurredUnderlay && params.qualityLevel === 0 ? blurredOutput : baseOutput
  material.maskShadowNode = detailsMask().greaterThan(0.5)
  material.needsUpdate = true
  return material
}

export function attachLandrushWaterMaterialLifecycle({
  material,
  noises,
  parameterUniforms,
  params,
  update,
  wind,
}: {
  material: LandrushBrunoMeshDefaultMaterial
  noises: LandrushBrunoWaterNoises
  parameterUniforms: Record<string, { value: number }>
  params: Record<string, unknown>
  update?: (deltaSeconds: number) => void
  wind: LandrushBrunoWaterWind
}) {
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
    update: (deltaSeconds: number) => {
      wind.update(deltaSeconds)
      update?.(deltaSeconds)
    },
    wind,
  }

  return material
}

export function createLandrushBrunoWaterContext({
  bounds,
  coastalFoamFieldTexture,
  noises,
  qualityLevel,
  surfaceElevation,
  surfaceThickness,
  terrainFieldTexture,
  waveDepthTexture,
  wind,
}: {
  bounds: LandrushWorldNode['perimeter']['bounds']
  coastalFoamFieldTexture?: Texture
  noises: LandrushBrunoWaterNoises
  qualityLevel: number
  surfaceElevation: number
  surfaceThickness: number
  terrainFieldTexture: Texture
  waveDepthTexture?: Texture
  wind: LandrushBrunoWaterWind
}) {
  const boundsMin = uniform(new Vector2(bounds.minX, bounds.minZ))
  const boundsSize = uniform(new Vector2(bounds.width, bounds.depth))
  const surfaceElevationUniform = uniform(surfaceElevation)
  const surfaceThicknessUniform = uniform(surfaceThickness)
  const textureUvNode = Fn(([position]) => {
    return position.sub(boundsMin).div(boundsSize).clamp(0, 1)
  })
  const terrainNode = Fn(([position]) => {
    return texture(terrainFieldTexture, textureUvNode(position))
  })
  const coastalFoamTerrainNode = Fn(([position]) => {
    return texture(coastalFoamFieldTexture ?? terrainFieldTexture, textureUvNode(position))
  })
  const waveDepthNode = Fn(([position]) => {
    return texture(waveDepthTexture ?? terrainFieldTexture, textureUvNode(position)).r
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
      level: qualityLevel,
    },
    reveal: {
      color: color('#ffffff'),
      distance: float(100000),
      intensity: float(0),
      position2Uniform: uniform(vec2(0, 0)),
      thickness: float(1),
    },
    terrain: {
      coastalFoamTerrainNode,
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
