import { BackSide, Color, DoubleSide } from 'three'
import {
  cameraFar,
  cameraNear,
  cameraPosition,
  cameraProjectionMatrix,
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  color,
  cos,
  exp,
  float,
  fwidth,
  getViewPosition,
  int,
  linearDepth,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
  reflect,
  screenUV,
  sin,
  sqrt,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
  viewportDepthTexture,
  viewZToOrthographicDepth,
} from 'three/tsl'
import { MeshBasicNodeMaterial, type Node as TSLNode } from 'three/webgpu'
import { STANDALONE_OCEAN_CLOUD_CONTROLS } from './standalone-ocean-clouds'
import type { WaterlineInteractionField } from './waterline-interaction-field'

export type StandaloneOceanDebugMode =
  | 'cloud-density'
  | 'cloud-lighting'
  | 'compression'
  | 'displacement'
  | 'final'
  | 'foam'
  | 'fresnel'
  | 'glare'
  | 'glints'
  | 'no-glare'
  | 'normals'
  | 'reflection'
  | 'submerged-rocks'
  | 'waterline'

export type StandaloneOceanWaveBandParameters = {
  amplitude: number
  choppiness: number
  directionOffsetDegrees: number
  enabled: boolean
  frequency: number
  phaseDegrees: number
  shape: number
  speed: number
}

export type StandaloneOceanParameters = {
  choppinessEnabled: boolean
  deepColor: string
  foamEnabled: boolean
  foamColor: string
  foamColorRampPosition: number
  foamEmissionStrength: number
  foamWhiteRampPosition: number
  fresnelEnabled: boolean
  glareEnabled: boolean
  glareSaturation: number
  glareSize: number
  glareStrength: number
  glareTint: string
  glintsEnabled: boolean
  glintStrength: number
  hazeEnabled: boolean
  horizonHaze: number
  oceanAlignment: number
  oceanChoppiness: number
  oceanColorA: string
  oceanColorB: string
  oceanCrestCurvature: number
  oceanDamping: number
  oceanDetailStrength: number
  oceanDirectionDegrees: number
  oceanFrequencyScale: number
  oceanSmallestWave: number
  oceanSpectrumSpread: number
  oceanTimeScale: number
  oceanWaveScale: number
  oceanWindVelocity: number
  reflectionEnabled: boolean
  reflectionStrength: number
  seed: number
  shallowColor: string
  skyEnabled: boolean
  skyHorizonColor: string
  skyZenithColor: string
  sunAzimuthDegrees: number
  sunElevationDegrees: number
  toonEnabled: boolean
  underwaterRockAbsorption: number
  underwaterRockBlur: number
  underwaterRockDepthFalloff: number
  underwaterRockDistortion: number
  underwaterRockFadeStartDepth: number
  underwaterRockMaxDepth: number
  underwaterRocksEnabled: boolean
  underwaterRockVisibility: number
  waveFoamCoverage: number
  waveFoamOpacity: number
  waterlineFoamCloneBreakup: number
  waterlineFoamCloneCrestInfluence: number
  waterlineFoamCloneEnabled: boolean
  waterlineFoamCloneIntensity: number
  waterlineFoamCloneInward: number
  waterlineFoamCloneOutward: number
  waterlineFoamClonePhaseDegrees: number
  waterlineFoamCloneSoftness: number
  waterlineFoamCloneSpeed: number
  waterlineFoamCloneVariation: number
  waterlineFoamCloneWidth: number
  waterlineFoamBreakup: number
  waterlineFoamBreakupScale: number
  waterlineFoamCrestInfluence: number
  waterlineFoamElevationOffset: number
  waterlineFoamEnabled: boolean
  waterlineFoamEvolutionSpeed: number
  waterlineFoamFillOpacity: number
  waterlineFoamIntensity: number
  waterlineFoamOuterWidth: number
  waterlineFoamReach: number
  waterlineFoamSoftness: number
  waterlineFoamSpeed: number
  waterlineFoamSurfaceTracking: number
  waterlineFoamWarpStrength: number
  waterlineFoamWidth: number
  waveBands: StandaloneOceanWaveBandParameters[]
  wavesEnabled: boolean
}

const DEFAULT_STANDALONE_OCEAN_WAVE_BANDS: StandaloneOceanWaveBandParameters[] = [
  {
    amplitude: 3,
    choppiness: 2.5,
    directionOffsetDegrees: 0,
    enabled: true,
    frequency: 0.34,
    phaseDegrees: 0,
    shape: 4,
    speed: 3,
  },
  {
    amplitude: 1,
    choppiness: 2.5,
    directionOffsetDegrees: 0,
    enabled: true,
    frequency: 1.13,
    phaseDegrees: 0,
    shape: 1.29,
    speed: 3,
  },
  {
    amplitude: 1,
    choppiness: 1,
    directionOffsetDegrees: 0,
    enabled: true,
    frequency: 1.62,
    phaseDegrees: 0,
    shape: 1,
    speed: 1.58,
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    amplitude: 1,
    choppiness: 1,
    directionOffsetDegrees: 0,
    enabled: index === 0,
    frequency: 1,
    phaseDegrees: 0,
    shape: 1,
    speed: 1,
  })),
]

export const DEFAULT_STANDALONE_OCEAN_PARAMETERS: StandaloneOceanParameters = {
  choppinessEnabled: true,
  deepColor: '#053b76',
  foamEnabled: true,
  foamColor: '#fffdf4',
  foamColorRampPosition: 0.356,
  foamEmissionStrength: 10.7,
  foamWhiteRampPosition: 0.265,
  fresnelEnabled: true,
  glareEnabled: true,
  glareSaturation: 1,
  glareSize: 0.5,
  glareStrength: 0.907,
  glareTint: '#ffad32',
  glintsEnabled: true,
  glintStrength: 0.72,
  hazeEnabled: true,
  horizonHaze: 0.42,
  oceanAlignment: 0.461,
  oceanChoppiness: 0.9,
  oceanColorA: '#087bc8',
  oceanColorB: '#1619c9',
  oceanCrestCurvature: 0.65,
  oceanDamping: 0.734,
  oceanDetailStrength: 0.28,
  oceanDirectionDegrees: 90,
  oceanFrequencyScale: 1,
  oceanSmallestWave: 0.9,
  oceanSpectrumSpread: 1.15,
  oceanTimeScale: 0.42,
  oceanWaveScale: 3.7,
  oceanWindVelocity: 15,
  reflectionEnabled: true,
  reflectionStrength: 0.82,
  seed: 29,
  shallowColor: '#1ebcc2',
  skyEnabled: true,
  skyHorizonColor: '#c8edf0',
  skyZenithColor: '#2e82c4',
  sunAzimuthDegrees: -38,
  sunElevationDegrees: 42,
  toonEnabled: true,
  underwaterRockAbsorption: 1.41,
  underwaterRockBlur: 6,
  underwaterRockDepthFalloff: 0.85,
  underwaterRockDistortion: 0.03,
  underwaterRockFadeStartDepth: 0,
  underwaterRockMaxDepth: 4.5,
  underwaterRocksEnabled: true,
  underwaterRockVisibility: 1,
  waveFoamCoverage: 0,
  waveFoamOpacity: 0.46,
  waterlineFoamCloneBreakup: 1,
  waterlineFoamCloneCrestInfluence: 0,
  waterlineFoamCloneEnabled: false,
  waterlineFoamCloneIntensity: 0.21,
  waterlineFoamCloneInward: -0.75,
  waterlineFoamCloneOutward: 2.75,
  waterlineFoamClonePhaseDegrees: 0,
  waterlineFoamCloneSoftness: 0.58,
  waterlineFoamCloneSpeed: 0.12,
  waterlineFoamCloneVariation: 0.35,
  waterlineFoamCloneWidth: 0.07,
  waterlineFoamBreakup: 1,
  waterlineFoamBreakupScale: 1,
  waterlineFoamCrestInfluence: 0,
  waterlineFoamElevationOffset: 0,
  waterlineFoamEnabled: true,
  waterlineFoamEvolutionSpeed: 2,
  waterlineFoamFillOpacity: 0.27,
  waterlineFoamIntensity: 0.14,
  waterlineFoamOuterWidth: 0.11,
  waterlineFoamReach: 0.1,
  waterlineFoamSoftness: 0.58,
  waterlineFoamSpeed: 0,
  waterlineFoamSurfaceTracking: 1,
  waterlineFoamWarpStrength: 0.7,
  waterlineFoamWidth: 0.07,
  waveBands: DEFAULT_STANDALONE_OCEAN_WAVE_BANDS,
  wavesEnabled: true,
}

export function createDefaultStandaloneOceanParameters(): StandaloneOceanParameters {
  return {
    ...DEFAULT_STANDALONE_OCEAN_PARAMETERS,
    waveBands: DEFAULT_STANDALONE_OCEAN_WAVE_BANDS.map((band) => ({ ...band })),
  }
}

const STANDALONE_OCEAN_BANDS = [
  { amplitude: 1, angleOffset: 0, speed: 0.82, wavelength: 1 },
  { amplitude: 0.52, angleOffset: 0.72, speed: 0.91, wavelength: 0.56 },
  { amplitude: 0.28, angleOffset: -0.88, speed: 1.03, wavelength: 0.31 },
  { amplitude: 0.14, angleOffset: 1.62, speed: 1.11, wavelength: 0.17 },
  { amplitude: 0.065, angleOffset: -2.05, speed: 1.19, wavelength: 0.085 },
  { amplitude: 0.028, angleOffset: 2.86, speed: 1.31, wavelength: 0 },
] as const

const STANDALONE_OCEAN_COMPONENTS_PER_BAND = 4

function createStandaloneOceanRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const STANDALONE_OCEAN_SPECTRAL_COMPONENTS = STANDALONE_OCEAN_BANDS.map((_band, bandIndex) => {
  const random = createStandaloneOceanRandom(0x2f6e2b1 + bandIndex * 0x9e3779b1)
  const components = Array.from({ length: STANDALONE_OCEAN_COMPONENTS_PER_BAND }, () => ({
    amplitudeWeight: 0.38 + Math.sqrt(-2 * Math.log(Math.max(random(), 0.000_001))),
    angleJitter: (random() + random() - 1) * 1.15,
    phase: random() * Math.PI * 2,
    speedScale: 0.86 + random() * 0.28,
    wavelengthScale: 2 ** ((random() * 2 - 1) * 0.46),
  }))
  const amplitudeTotal = components.reduce(
    (total, component) => total + component.amplitudeWeight,
    0,
  )
  return components.map((component) => ({
    ...component,
    amplitudeWeight: component.amplitudeWeight / amplitudeTotal,
  }))
})

export const STANDALONE_OCEAN_SPECTRAL_MODE_COUNT =
  STANDALONE_OCEAN_BANDS.length * STANDALONE_OCEAN_COMPONENTS_PER_BAND

const STANDALONE_OCEAN_TRANSPARENT_BODY_OPACITY_FLOOR = 0.42
const createStandaloneOceanPackedVarying = varying as unknown as <
  T extends 'float' | 'vec2' | 'vec4',
>(
  node: TSLNode<T>,
  name: string,
) => TSLNode<T>

export type StandaloneOceanMaterialBundle = ReturnType<typeof createStandaloneOceanMaterials>

type StandaloneOceanGeometryContract = {
  cloudDetailOctaves: number
  detailRadius: number
  outerRadius: number
  vertexSpacing: number
}

type StandaloneOceanWaveBundle = {
  compression: TSLNode<'float'>
  crest: TSLNode<'float'>
  displacementX: TSLNode<'float'>
  displacementZ: TSLNode<'float'>
  glintCarrier: TSLNode<'float'>
  height: TSLNode<'float'>
  jacobian: TSLNode<'float'>
  normal: TSLNode<'vec3'>
  slope: TSLNode<'float'>
}

export function createStandaloneOceanMaterials(
  parameters: StandaloneOceanParameters,
  debugMode: StandaloneOceanDebugMode,
  geometry: StandaloneOceanGeometryContract,
  waterlineInteractionField: WaterlineInteractionField | null = null,
  submergedRockRefraction = false,
) {
  const controls = createStandaloneOceanUniforms(parameters)
  const coordinates = vec2(positionLocal.x, positionLocal.y.negate())
  const radialDistance = coordinates.length()
  const waveEnvelope = radialDistance
    .smoothstep(geometry.detailRadius * 0.9, geometry.detailRadius * 1.8)
    .oneMinus()
  const evaluatedWaves = createStandaloneOceanWaveBundle(
    coordinates,
    controls.time,
    controls,
    geometry.vertexSpacing,
  )
  const wavePoseInput = vec4(
    evaluatedWaves.displacementX,
    evaluatedWaves.displacementZ,
    evaluatedWaves.height,
    evaluatedWaves.jacobian,
  ) as TSLNode<'vec4'>
  const waveFrameInput = vec4(evaluatedWaves.normal, evaluatedWaves.compression) as TSLNode<'vec4'>
  const waveEnergyInput = vec2(evaluatedWaves.crest, evaluatedWaves.glintCarrier) as TSLNode<'vec2'>
  const wavePose = createStandaloneOceanPackedVarying(wavePoseInput, 'vStandaloneOceanWavePose')
  const waveFrame = createStandaloneOceanPackedVarying(waveFrameInput, 'vStandaloneOceanWaveFrame')
  const waveEnergy = createStandaloneOceanPackedVarying(
    waveEnergyInput,
    'vStandaloneOceanWaveEnergy',
  )
  const interpolatedWaveNormal = waveFrame.xyz.normalize()
  const geometryWaves = {
    compression: waveFrame.w,
    crest: waveEnergy.x,
    displacementX: wavePose.x,
    displacementZ: wavePose.y,
    glintCarrier: waveEnergy.y,
    height: wavePose.z,
    jacobian: wavePose.w,
    normal: interpolatedWaveNormal,
    slope: interpolatedWaveNormal.y.oneMinus().mul(9).clamp(0, 1),
  }
  const opticalNormal = mix(
    vec3(0, 1, 0),
    createStandaloneOceanDetailNormal(geometryWaves.normal, coordinates, controls.time, controls),
    waveEnvelope,
  ).normalize()
  const opticalWaves = {
    ...geometryWaves,
    compression: geometryWaves.compression.mul(waveEnvelope),
    crest: geometryWaves.crest.mul(waveEnvelope),
    height: geometryWaves.height.mul(waveEnvelope),
    normal: opticalNormal,
    slope: opticalNormal.y.oneMinus().mul(9).clamp(0, 1),
  }
  const sunDirection = createStandaloneOceanSunDirection(controls)
  const horizonRadiance = createStandaloneOceanHorizonRadiance(controls)
  const projectionW = cameraProjectionMatrix.element(int(3)).element(int(3)) as TSLNode<'float'>
  const orthographicProjection = projectionW.equal(float(1))
  const perspectiveViewDirection = cameraPosition.sub(positionWorld).normalize()
  const orthographicViewDirection = vec3(0, 0, 1).transformDirection(cameraWorldMatrix)
  const viewDirection = orthographicProjection.select(
    orthographicViewDirection,
    perspectiveViewDirection,
  )
  const reflectionDirection = reflect(viewDirection.negate(), opticalWaves.normal).normalize()
  const reflectedSky = createStandaloneOceanAnalyticReflection(
    reflectionDirection,
    sunDirection,
    controls,
  )
  const reflectionColor = reflectedSky.color
  const nDotV = opticalWaves.normal.dot(viewDirection).abs().clamp(0, 1)
  const fresnel = nDotV.oneMinus().pow(5).mul(0.98).add(0.02)
  const activeFresnel = mix(float(1), fresnel, controls.fresnelEnabled)
  const lightFacing = opticalWaves.normal.dot(sunDirection).mul(0.5).add(0.5).clamp(0, 1)
  const heightTint = opticalWaves.height.mul(1.9).add(0.5).clamp(0, 1)
  const bodyColor = mix(
    controls.deepColor,
    controls.shallowColor,
    lightFacing.mul(0.34).add(heightTint.mul(0.16)).clamp(0, 0.58),
  )
  const submergedRockTransmission = createStandaloneOceanSubmergedRockTransmission(
    bodyColor,
    opticalWaves.normal,
    viewDirection,
    fresnel,
    controls,
    submergedRockRefraction,
  )
  const reflectionMix = activeFresnel
    .mul(controls.reflectionStrength)
    .mul(controls.reflectionEnabled)
    .clamp(0, 1)
  const opticalColor = mix(submergedRockTransmission.color, reflectionColor, reflectionMix)
  const distanceToCamera = cameraPosition.sub(positionWorld).length()
  const haze = distanceToCamera
    .smoothstep(220, 1200)
    .mul(controls.horizonHaze)
    .mul(controls.hazeEnabled)
    .clamp(0, 0.86)
  const horizonWater = mix(controls.shallowColor, horizonRadiance, 0.68)
  const hazedOpticalColor = mix(opticalColor, horizonWater, haze)
  const edgeHorizonBlend = radialDistance
    .smoothstep(geometry.outerRadius * 0.7, geometry.outerRadius * 0.97)
    .clamp(0, 1)
  const waveFoam = createStandaloneOceanFoamMask(opticalWaves, coordinates, controls)
  const waterlineFoam = createStandaloneOceanWaterlineFoam(
    coordinates,
    geometryWaves,
    opticalWaves,
    viewDirection,
    controls,
    waterlineInteractionField,
  )
  const waveFoamMask = waveFoam.mul(controls.foamEnabled)
  const waterlineFoamMask = waterlineFoam.mask.mul(controls.foamEnabled)
  const foamMask = waveFoamMask.max(waterlineFoamMask)
  const foamColorRamp = foamMask.smoothstep(
    controls.foamColorRampPosition.sub(0.16).max(0),
    controls.foamColorRampPosition.max(0.001),
  )
  const waveFoamWashRamp = waveFoamMask.smoothstep(
    controls.foamWhiteRampPosition.sub(0.12).max(0),
    controls.foamWhiteRampPosition.max(0.001),
  )
  const paintedOceanColor = mix(controls.oceanColorA, controls.oceanColorB, foamColorRamp)
  const toonOceanColor = mix(hazedOpticalColor, paintedOceanColor, controls.toonEnabled.mul(0.24))
  const glint = createStandaloneOceanGlintMask(
    opticalWaves,
    coordinates,
    controls.time,
    viewDirection,
    sunDirection,
    controls,
  )
  const foamBrightness = controls.foamEmissionStrength.div(10.7).clamp(0, 1.6).mul(0.32).add(1)
  const waveFoamMix = waveFoamWashRamp.mul(controls.waveFoamOpacity).clamp(0, 1)
  const foamColor = controls.foamColor.mul(foamBrightness)
  const boundaryFoamColor = controls.foamColor.mul(0.94)
  const glintColor = color('#f2ffff')
  const glintMix = glint.mul(0.78).clamp(0, 0.72)
  const clearSurfaceColor = mix(toonOceanColor, glintColor, glintMix)
  const boundaryMistMix = waterlineFoam.mist.mul(controls.foamEnabled).mul(1.1).clamp(0, 0.42)
  const boundaryRibbonMix = waterlineFoam.ribbon.mul(controls.foamEnabled).mul(2.6).clamp(0, 0.74)
  const mistedSurfaceColor = mix(clearSurfaceColor, boundaryFoamColor, boundaryMistMix)
  const ribbonedSurfaceColor = mix(mistedSurfaceColor, boundaryFoamColor, boundaryRibbonMix)
  const finalSurfaceColor = mix(ribbonedSurfaceColor, foamColor, waveFoamMix)
  const glareMask = createStandaloneOceanGlareMask(opticalWaves, glint, controls).mul(
    controls.glareEnabled,
  )
  const glareColor = mix(color('#fff8df'), controls.glareTint, controls.glareSaturation.clamp(0, 1))
  const compositedSurfaceColor = finalSurfaceColor.add(
    glareColor.mul(glareMask).mul(controls.glareStrength).mul(0.13),
  )
  const horizonSurfaceColor = mix(compositedSurfaceColor, horizonRadiance, edgeHorizonBlend)
  const noGlareHorizonSurfaceColor = mix(finalSurfaceColor, horizonRadiance, edgeHorizonBlend)
  const bodyOpacityFloor = float(
    submergedRockRefraction ? STANDALONE_OCEAN_TRANSPARENT_BODY_OPACITY_FLOOR : 1,
  )
  const surfaceOpacity = submergedRockTransmission.opacity
    .max(bodyOpacityFloor)
    .max(reflectionMix.mul(0.72))
    .max(waveFoamMix)
    .max(boundaryMistMix)
    .max(boundaryRibbonMix)
    .max(glareMask.mul(0.32))
    .max(edgeHorizonBlend)
    .clamp(0, 1)
  const displacementDebug = vec3(
    geometryWaves.displacementX.mul(2.8).add(0.5),
    geometryWaves.height.mul(2.8).add(0.5),
    geometryWaves.displacementZ.mul(2.8).add(0.5),
  )
  const compressionDebug = vec3(
    opticalWaves.compression,
    opticalWaves.crest,
    opticalWaves.jacobian.clamp(0, 1),
  )
  const foamDebug = vec3(foamMask, foamColorRamp, waveFoamWashRamp)
  const glintDebug = vec3(glint, glint.mul(0.94), glint.mul(0.72))
  const glareDebug = vec3(glareMask, glareMask.mul(0.55), glareMask.mul(0.12))
  const resolvedSurfaceColor =
    debugMode === 'cloud-density'
      ? vec3(reflectedSky.cloudDensity)
      : debugMode === 'cloud-lighting'
        ? reflectedSky.cloudLighting
        : debugMode === 'compression'
          ? compressionDebug
          : debugMode === 'displacement'
            ? displacementDebug
            : debugMode === 'foam'
              ? foamDebug
              : debugMode === 'fresnel'
                ? vec3(activeFresnel, activeFresnel, activeFresnel)
                : debugMode === 'glare'
                  ? glareDebug
                  : debugMode === 'glints'
                    ? glintDebug
                    : debugMode === 'normals'
                      ? opticalWaves.normal.mul(0.5).add(0.5)
                      : debugMode === 'reflection'
                        ? reflectionColor
                        : debugMode === 'submerged-rocks'
                          ? submergedRockTransmission.debugColor
                          : debugMode === 'waterline'
                            ? waterlineFoam.debugColor
                            : debugMode === 'no-glare'
                              ? noGlareHorizonSurfaceColor
                              : horizonSurfaceColor
  const surface = new MeshBasicNodeMaterial({
    depthTest: true,
    depthWrite: !submergedRockRefraction,
    side: DoubleSide,
    transparent: submergedRockRefraction,
  })
  surface.positionNode = vec3(
    positionLocal.x.add(wavePose.x.mul(waveEnvelope)),
    positionLocal.y.sub(wavePose.y.mul(waveEnvelope)),
    wavePose.z.mul(waveEnvelope),
  )
  surface.colorNode = resolvedSurfaceColor
  surface.opacityNode = surfaceOpacity
  surface.name = 'standalone-ocean-surface'
  surface.userData.landrushFramebufferDrawPreparation =
    submergedRockRefraction || waterlineInteractionField !== null
  surface.userData.standaloneOcean = {
    foam: 'instantaneous-jacobian-crest-bright-broken-coverage',
    glare: 'single-pass-analytic-glare',
    minimumBodyOpacity: STANDALONE_OCEAN_TRANSPARENT_BODY_OPACITY_FLOOR,
    submergedRocks: submergedRockRefraction
      ? 'depth-aware-beer-lambert-filtered-transmission'
      : 'disabled-no-pre-water-capture',
    waterline: waterlineInteractionField
      ? 'wave-displaced-terrain-anchored-bright-filled-ribbon-without-line-carriers'
      : 'disabled-no-interaction-field',
    waves: 'twenty-four-mode-stochastic-directional-spectrum',
  }

  const skyDirection = viewDirection.negate()
  const skyField = createStandaloneOceanSky(
    skyDirection,
    sunDirection,
    controls,
    geometry.cloudDetailOctaves,
  )
  const sky = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    side: BackSide,
  })
  sky.colorNode =
    debugMode === 'cloud-density'
      ? vec3(skyField.cloudDensity)
      : debugMode === 'cloud-lighting'
        ? skyField.cloudLighting
        : debugMode === 'final' || debugMode === 'no-glare'
          ? skyField.color
          : color('#01030a')
  sky.name = 'standalone-ocean-sky'
  sky.userData.standaloneOceanClouds = {
    detailOctaves: geometry.cloudDetailOctaves,
    field: 'vertex-weather-warp-shape-lighting-with-fragment-detail-erosion',
    fragmentNoiseSamples: 1,
    reflection: 'bounded-analytic-cloud-radiance',
    vertexNoiseSamples: geometry.cloudDetailOctaves + 5,
    vertexVaryings: ['vStandaloneOceanSkyShape', 'vStandaloneOceanSkyLight'],
  }

  return {
    dispose() {
      surface.dispose()
      sky.dispose()
    },
    setParameters(next: StandaloneOceanParameters) {
      controls.choppinessEnabled.value = next.choppinessEnabled ? 1 : 0
      controls.deepColor.value.set(next.deepColor)
      controls.foamEnabled.value = next.foamEnabled ? 1 : 0
      controls.foamColor.value.set(next.foamColor)
      controls.foamColorRampPosition.value = next.foamColorRampPosition
      controls.foamEmissionStrength.value = next.foamEmissionStrength
      controls.foamWhiteRampPosition.value = next.foamWhiteRampPosition
      controls.fresnelEnabled.value = next.fresnelEnabled ? 1 : 0
      controls.glareEnabled.value = next.glareEnabled ? 1 : 0
      controls.glareSaturation.value = next.glareSaturation
      controls.glareSize.value = next.glareSize
      controls.glareStrength.value = next.glareStrength
      controls.glareTint.value.set(next.glareTint)
      controls.glintsEnabled.value = next.glintsEnabled ? 1 : 0
      controls.glintStrength.value = next.glintStrength
      controls.hazeEnabled.value = next.hazeEnabled ? 1 : 0
      controls.horizonHaze.value = next.horizonHaze
      controls.oceanAlignment.value = next.oceanAlignment
      controls.oceanChoppiness.value = next.oceanChoppiness
      controls.oceanColorA.value.set(next.oceanColorA)
      controls.oceanColorB.value.set(next.oceanColorB)
      controls.oceanCrestCurvature.value = next.oceanCrestCurvature
      controls.oceanDamping.value = next.oceanDamping
      controls.oceanDetailStrength.value = next.oceanDetailStrength
      controls.oceanDirectionDegrees.value = next.oceanDirectionDegrees
      controls.oceanFrequencyScale.value = next.oceanFrequencyScale
      controls.oceanSmallestWave.value = next.oceanSmallestWave
      controls.oceanSpectrumSpread.value = next.oceanSpectrumSpread
      controls.oceanTimeScale.value = next.oceanTimeScale
      controls.oceanWaveScale.value = next.oceanWaveScale
      controls.oceanWindVelocity.value = next.oceanWindVelocity
      controls.reflectionEnabled.value = next.reflectionEnabled ? 1 : 0
      controls.reflectionStrength.value = next.reflectionStrength
      controls.seed.value = next.seed
      controls.shallowColor.value.set(next.shallowColor)
      controls.skyEnabled.value = next.skyEnabled ? 1 : 0
      controls.skyHorizonColor.value.set(next.skyHorizonColor)
      controls.skyZenithColor.value.set(next.skyZenithColor)
      controls.sunAzimuthDegrees.value = next.sunAzimuthDegrees
      controls.sunElevationDegrees.value = next.sunElevationDegrees
      controls.toonEnabled.value = next.toonEnabled ? 1 : 0
      controls.underwaterRockAbsorption.value = next.underwaterRockAbsorption
      controls.underwaterRockBlur.value = next.underwaterRockBlur
      controls.underwaterRockDepthFalloff.value = next.underwaterRockDepthFalloff
      controls.underwaterRockDistortion.value = next.underwaterRockDistortion
      controls.underwaterRockFadeStartDepth.value = next.underwaterRockFadeStartDepth
      controls.underwaterRockMaxDepth.value = next.underwaterRockMaxDepth
      controls.underwaterRocksEnabled.value = next.underwaterRocksEnabled ? 1 : 0
      controls.underwaterRockVisibility.value = next.underwaterRockVisibility
      controls.waveFoamCoverage.value = next.waveFoamCoverage
      controls.waveFoamOpacity.value = next.waveFoamOpacity
      controls.waterlineFoamCloneBreakup.value = next.waterlineFoamCloneBreakup
      controls.waterlineFoamCloneCrestInfluence.value = next.waterlineFoamCloneCrestInfluence
      controls.waterlineFoamCloneEnabled.value = next.waterlineFoamCloneEnabled ? 1 : 0
      controls.waterlineFoamCloneIntensity.value = next.waterlineFoamCloneIntensity
      controls.waterlineFoamCloneInward.value = next.waterlineFoamCloneInward
      controls.waterlineFoamCloneOutward.value = next.waterlineFoamCloneOutward
      controls.waterlineFoamClonePhaseDegrees.value = next.waterlineFoamClonePhaseDegrees
      controls.waterlineFoamCloneSoftness.value = next.waterlineFoamCloneSoftness
      controls.waterlineFoamCloneSpeed.value = next.waterlineFoamCloneSpeed
      controls.waterlineFoamCloneVariation.value = next.waterlineFoamCloneVariation
      controls.waterlineFoamCloneWidth.value = next.waterlineFoamCloneWidth
      controls.waterlineFoamBreakup.value = next.waterlineFoamBreakup
      controls.waterlineFoamBreakupScale.value = next.waterlineFoamBreakupScale
      controls.waterlineFoamCrestInfluence.value = next.waterlineFoamCrestInfluence
      controls.waterlineFoamElevationOffset.value = next.waterlineFoamElevationOffset
      controls.waterlineFoamEnabled.value = next.waterlineFoamEnabled ? 1 : 0
      controls.waterlineFoamEvolutionSpeed.value = next.waterlineFoamEvolutionSpeed
      controls.waterlineFoamFillOpacity.value = next.waterlineFoamFillOpacity
      controls.waterlineFoamIntensity.value = next.waterlineFoamIntensity
      controls.waterlineFoamOuterWidth.value = next.waterlineFoamOuterWidth
      controls.waterlineFoamReach.value = next.waterlineFoamReach
      controls.waterlineFoamSoftness.value = next.waterlineFoamSoftness
      controls.waterlineFoamSpeed.value = next.waterlineFoamSpeed
      controls.waterlineFoamSurfaceTracking.value = next.waterlineFoamSurfaceTracking
      controls.waterlineFoamWarpStrength.value = next.waterlineFoamWarpStrength
      controls.waterlineFoamWidth.value = next.waterlineFoamWidth
      for (let index = 0; index < controls.waveBands.length; index += 1) {
        const band = next.waveBands[index]
        const bandControls = controls.waveBands[index]
        if (!band || !bandControls) continue
        bandControls.amplitude.value = band.amplitude
        bandControls.choppiness.value = band.choppiness
        bandControls.directionOffsetDegrees.value = band.directionOffsetDegrees
        bandControls.enabled.value = band.enabled ? 1 : 0
        bandControls.frequency.value = band.frequency
        bandControls.phaseDegrees.value = band.phaseDegrees
        bandControls.shape.value = band.shape
        bandControls.speed.value = band.speed
      }
      controls.wavesEnabled.value = next.wavesEnabled ? 1 : 0
    },
    sky,
    surface,
    time: controls.time,
  }
}

function createStandaloneOceanUniforms(parameters: StandaloneOceanParameters) {
  return {
    choppinessEnabled: uniform(parameters.choppinessEnabled ? 1 : 0),
    deepColor: uniform(new Color(parameters.deepColor)),
    foamEnabled: uniform(parameters.foamEnabled ? 1 : 0),
    foamColor: uniform(new Color(parameters.foamColor)),
    foamColorRampPosition: uniform(parameters.foamColorRampPosition),
    foamEmissionStrength: uniform(parameters.foamEmissionStrength),
    foamWhiteRampPosition: uniform(parameters.foamWhiteRampPosition),
    fresnelEnabled: uniform(parameters.fresnelEnabled ? 1 : 0),
    glareEnabled: uniform(parameters.glareEnabled ? 1 : 0),
    glareSaturation: uniform(parameters.glareSaturation),
    glareSize: uniform(parameters.glareSize),
    glareStrength: uniform(parameters.glareStrength),
    glareTint: uniform(new Color(parameters.glareTint)),
    glintsEnabled: uniform(parameters.glintsEnabled ? 1 : 0),
    glintStrength: uniform(parameters.glintStrength),
    hazeEnabled: uniform(parameters.hazeEnabled ? 1 : 0),
    horizonHaze: uniform(parameters.horizonHaze),
    oceanAlignment: uniform(parameters.oceanAlignment),
    oceanChoppiness: uniform(parameters.oceanChoppiness),
    oceanColorA: uniform(new Color(parameters.oceanColorA)),
    oceanColorB: uniform(new Color(parameters.oceanColorB)),
    oceanCrestCurvature: uniform(parameters.oceanCrestCurvature),
    oceanDamping: uniform(parameters.oceanDamping),
    oceanDetailStrength: uniform(parameters.oceanDetailStrength),
    oceanDirectionDegrees: uniform(parameters.oceanDirectionDegrees),
    oceanFrequencyScale: uniform(parameters.oceanFrequencyScale),
    oceanSmallestWave: uniform(parameters.oceanSmallestWave),
    oceanSpectrumSpread: uniform(parameters.oceanSpectrumSpread),
    oceanTimeScale: uniform(parameters.oceanTimeScale),
    oceanWaveScale: uniform(parameters.oceanWaveScale),
    oceanWindVelocity: uniform(parameters.oceanWindVelocity),
    reflectionEnabled: uniform(parameters.reflectionEnabled ? 1 : 0),
    reflectionStrength: uniform(parameters.reflectionStrength),
    seed: uniform(parameters.seed),
    shallowColor: uniform(new Color(parameters.shallowColor)),
    skyEnabled: uniform(parameters.skyEnabled ? 1 : 0),
    skyHorizonColor: uniform(new Color(parameters.skyHorizonColor)),
    skyZenithColor: uniform(new Color(parameters.skyZenithColor)),
    sunAzimuthDegrees: uniform(parameters.sunAzimuthDegrees),
    sunElevationDegrees: uniform(parameters.sunElevationDegrees),
    time: uniform(0),
    toonEnabled: uniform(parameters.toonEnabled ? 1 : 0),
    underwaterRockAbsorption: uniform(parameters.underwaterRockAbsorption),
    underwaterRockBlur: uniform(parameters.underwaterRockBlur),
    underwaterRockDepthFalloff: uniform(parameters.underwaterRockDepthFalloff),
    underwaterRockDistortion: uniform(parameters.underwaterRockDistortion),
    underwaterRockFadeStartDepth: uniform(parameters.underwaterRockFadeStartDepth),
    underwaterRockMaxDepth: uniform(parameters.underwaterRockMaxDepth),
    underwaterRocksEnabled: uniform(parameters.underwaterRocksEnabled ? 1 : 0),
    underwaterRockVisibility: uniform(parameters.underwaterRockVisibility),
    waveFoamCoverage: uniform(parameters.waveFoamCoverage),
    waveFoamOpacity: uniform(parameters.waveFoamOpacity),
    waterlineFoamCloneBreakup: uniform(parameters.waterlineFoamCloneBreakup),
    waterlineFoamCloneCrestInfluence: uniform(parameters.waterlineFoamCloneCrestInfluence),
    waterlineFoamCloneEnabled: uniform(parameters.waterlineFoamCloneEnabled ? 1 : 0),
    waterlineFoamCloneIntensity: uniform(parameters.waterlineFoamCloneIntensity),
    waterlineFoamCloneInward: uniform(parameters.waterlineFoamCloneInward),
    waterlineFoamCloneOutward: uniform(parameters.waterlineFoamCloneOutward),
    waterlineFoamClonePhaseDegrees: uniform(parameters.waterlineFoamClonePhaseDegrees),
    waterlineFoamCloneSoftness: uniform(parameters.waterlineFoamCloneSoftness),
    waterlineFoamCloneSpeed: uniform(parameters.waterlineFoamCloneSpeed),
    waterlineFoamCloneVariation: uniform(parameters.waterlineFoamCloneVariation),
    waterlineFoamCloneWidth: uniform(parameters.waterlineFoamCloneWidth),
    waterlineFoamBreakup: uniform(parameters.waterlineFoamBreakup),
    waterlineFoamBreakupScale: uniform(parameters.waterlineFoamBreakupScale),
    waterlineFoamCrestInfluence: uniform(parameters.waterlineFoamCrestInfluence),
    waterlineFoamElevationOffset: uniform(parameters.waterlineFoamElevationOffset),
    waterlineFoamEnabled: uniform(parameters.waterlineFoamEnabled ? 1 : 0),
    waterlineFoamEvolutionSpeed: uniform(parameters.waterlineFoamEvolutionSpeed),
    waterlineFoamFillOpacity: uniform(parameters.waterlineFoamFillOpacity),
    waterlineFoamIntensity: uniform(parameters.waterlineFoamIntensity),
    waterlineFoamOuterWidth: uniform(parameters.waterlineFoamOuterWidth),
    waterlineFoamReach: uniform(parameters.waterlineFoamReach),
    waterlineFoamSoftness: uniform(parameters.waterlineFoamSoftness),
    waterlineFoamSpeed: uniform(parameters.waterlineFoamSpeed),
    waterlineFoamSurfaceTracking: uniform(parameters.waterlineFoamSurfaceTracking),
    waterlineFoamWarpStrength: uniform(parameters.waterlineFoamWarpStrength),
    waterlineFoamWidth: uniform(parameters.waterlineFoamWidth),
    waveBands: parameters.waveBands.map((band) => ({
      amplitude: uniform(band.amplitude),
      choppiness: uniform(band.choppiness),
      directionOffsetDegrees: uniform(band.directionOffsetDegrees),
      enabled: uniform(band.enabled ? 1 : 0),
      frequency: uniform(band.frequency),
      phaseDegrees: uniform(band.phaseDegrees),
      shape: uniform(band.shape),
      speed: uniform(band.speed),
    })),
    wavesEnabled: uniform(parameters.wavesEnabled ? 1 : 0),
  }
}

type StandaloneOceanUniforms = ReturnType<typeof createStandaloneOceanUniforms>

function createStandaloneOceanSampledLinearDepth(
  screenPosition: TSLNode<'vec2'>,
  depthSample: TSLNode<'float'>,
) {
  return viewZToOrthographicDepth(
    getViewPosition(screenPosition, depthSample, cameraProjectionMatrixInverse).z,
    cameraNear,
    cameraFar,
  )
}

function createStandaloneOceanSubmergedRockTransmission(
  bodyColor: TSLNode<'vec3'>,
  normal: TSLNode<'vec3'>,
  viewDirection: TSLNode<'vec3'>,
  fresnel: TSLNode<'float'>,
  controls: StandaloneOceanUniforms,
  enabled: boolean,
) {
  if (!enabled) {
    return {
      color: bodyColor,
      debugColor: vec3(0, 0, 0),
      opacity: float(1),
    }
  }

  const viewportDepth = viewportDepthTexture()
  const currentLinearDepth = linearDepth()
  const depthRange = cameraFar.sub(cameraNear)
  const maximumDepth = controls.underwaterRockMaxDepth.max(0.1)
  const fadeStartDepth = controls.underwaterRockFadeStartDepth
    .min(maximumDepth.sub(0.05).max(0))
    .max(0)
  const distortion = vec2(normal.x, normal.z.negate())
    .mul(controls.underwaterRockDistortion)
    .mul(fresnel.oneMinus().mul(0.82).add(0.18))
  const refractedUv = screenUV.add(distortion).clamp(0.002, 0.998)
  const centerLinearDepth = createStandaloneOceanSampledLinearDepth(
    refractedUv,
    viewportDepth.sample(refractedUv).r,
  )
  const centerRayDepth = centerLinearDepth.sub(currentLinearDepth).mul(depthRange).max(0)
  const centerVerticalDepth = centerRayDepth.mul(viewDirection.y.abs().max(0.12))
  const centerDepthRatio = centerVerticalDepth.div(maximumDepth).clamp(0, 1)
  const absorptionScale = controls.underwaterRockAbsorption.max(0)
  const depthSoftness = controls.underwaterRockBlur.max(0).mul(0.035)
  const fadeProgress = centerVerticalDepth
    .sub(fadeStartDepth.sub(depthSoftness))
    .div(maximumDepth.sub(fadeStartDepth).add(depthSoftness.mul(2)).max(0.05))
    .clamp(0, 1)
  const validCoverage = fadeProgress
    .pow(controls.underwaterRockDepthFalloff.clamp(0.25, 4))
    .smoothstep(0, 1)
    .oneMinus()
  const opticalPathDepth = centerRayDepth.min(maximumDepth.mul(4))
  const absorptionTransmission = exp(opticalPathDepth.mul(absorptionScale).mul(-0.24)).clamp(0, 1)
  const shallowClarity = controls.underwaterRockVisibility.clamp(0, 1).mul(0.74)
  const transmission = validCoverage
    .mul(shallowClarity)
    .mul(absorptionTransmission)
    .mul(controls.underwaterRocksEnabled)
    .mul(fresnel.oneMinus())
    .clamp(0, 0.74)
  const absorptionTint = absorptionTransmission
    .oneMinus()
    .mul(0.78)
    .add(centerDepthRatio.pow(0.72).mul(absorptionScale.mul(0.16)))
    .clamp(0, 0.86)
  const absorbedBodyColor = mix(bodyColor, controls.deepColor, absorptionTint)

  return {
    color: absorbedBodyColor,
    debugColor: vec3(validCoverage, absorptionTransmission.mul(validCoverage), transmission),
    opacity: transmission.oneMinus(),
  }
}

function createStandaloneOceanSunDirection(controls: StandaloneOceanUniforms) {
  const azimuth = controls.sunAzimuthDegrees.mul(Math.PI / 180)
  const elevation = controls.sunElevationDegrees.mul(Math.PI / 180)
  const horizontal = cos(elevation)
  return vec3(
    horizontal.mul(cos(azimuth)),
    sin(elevation),
    horizontal.mul(sin(azimuth)),
  ).normalize()
}

function createStandaloneOceanAnalyticReflection(
  direction: TSLNode<'vec3'>,
  sunDirection: TSLNode<'vec3'>,
  controls: StandaloneOceanUniforms,
) {
  const horizonRadiance = createStandaloneOceanHorizonRadiance(controls)
  const upward = direction.y.clamp(0, 1)
  const skyBlend = upward.smoothstep(0.015, 0.62)
  const gradient = mix(horizonRadiance, controls.skyZenithColor, skyBlend)
  const sunDot = direction.dot(sunDirection).max(0)
  const sunDisc = color('#ffd27a').mul(sunDot.pow(720)).mul(8)
  const sunHalo = color('#ffc66e').mul(sunDot.pow(18)).mul(0.9)
  const clearSky = gradient.add(sunDisc).add(sunHalo)

  const projectedDirection = direction.xz.div(upward.max(0.16)).clamp(-6, 6)
  const windPhase = controls.time.mul(
    (STANDALONE_OCEAN_CLOUD_CONTROLS.wind.xMetersPerSecond +
      STANDALONE_OCEAN_CLOUD_CONTROLS.wind.zMetersPerSecond) *
      0.018,
  )
  const seedPhase = controls.seed.mul(0.173)
  const primaryLobe = sin(projectedDirection.dot(vec2(1.17, 0.73)).add(windPhase).add(seedPhase))
  const secondaryLobe = sin(
    projectedDirection.dot(vec2(-0.61, 1.43)).sub(windPhase.mul(0.71)).sub(seedPhase.mul(1.37)),
  )
  const densitySignal = primaryLobe
    .mul(0.58)
    .add(secondaryLobe.mul(0.27))
    .add(primaryLobe.mul(secondaryLobe).mul(0.15))
    .mul(0.5)
    .add(0.5)
  const coverageThreshold = 1 - STANDALONE_OCEAN_CLOUD_CONTROLS.coverage * 0.78
  const horizonFade = upward.smoothstep(0.012, STANDALONE_OCEAN_CLOUD_CONTROLS.horizonFade)
  const cloudDensity = densitySignal
    .smoothstep(coverageThreshold, coverageThreshold + 0.16)
    .mul(horizonFade)
    .mul(STANDALONE_OCEAN_CLOUD_CONTROLS.density)
    .clamp(0, 0.88)

  const sunHeight = sunDirection.y.max(0).smoothstep(0.02, 0.32)
  const lightVariation = secondaryLobe.mul(0.5).add(0.5)
  const lightVisibility = lightVariation
    .mul(0.24)
    .add(0.58)
    .mul(sunHeight.mul(0.65).add(0.35))
    .clamp(0, 1)
  const cloudEdge = cloudDensity.mul(cloudDensity.oneMinus()).mul(4).clamp(0, 1)
  const silverLining = cloudEdge
    .mul(sunDot.pow(6))
    .mul(STANDALONE_OCEAN_CLOUD_CONTROLS.silverLining)
  const precipitationDarkening = 1 - STANDALONE_OCEAN_CLOUD_CONTROLS.precipitation * 0.34
  const shadowColor = mix(color('#70828e'), horizonRadiance, 0.16).mul(precipitationDarkening)
  const sunlitColor = mix(color('#f1f4ed'), color('#fff0d2'), sunHeight.mul(0.48))
  const cloudColor = mix(shadowColor, sunlitColor, lightVisibility).add(
    color('#ffe4b0').mul(silverLining.mul(0.58)),
  )
  const cloudedSky = mix(clearSky, cloudColor, cloudDensity)

  return {
    cloudDensity,
    cloudLighting: vec3(lightVisibility, silverLining, cloudDensity),
    color: mix(horizonRadiance, cloudedSky, controls.skyEnabled),
  }
}

function createStandaloneOceanSky(
  direction: TSLNode<'vec3'>,
  sunDirection: TSLNode<'vec3'>,
  controls: StandaloneOceanUniforms,
  detailOctaves: number,
) {
  const horizonRadiance = createStandaloneOceanHorizonRadiance(controls)
  const upward = direction.y.max(0)
  const skyBlend = upward.smoothstep(0.015, 0.62)
  const gradient = mix(horizonRadiance, controls.skyZenithColor, skyBlend)
  const sunDot = direction.dot(sunDirection).max(0)
  const sunDisc = color('#ffd27a').mul(sunDot.pow(720)).mul(8)
  const sunHalo = color('#ffc66e').mul(sunDot.pow(18)).mul(0.9)
  const clearSky = gradient.add(sunDisc).add(sunHalo)

  const projectedDirection = direction.xz.div(upward.max(0.045))
  const cloudWind = vec2(
    controls.time.mul(STANDALONE_OCEAN_CLOUD_CONTROLS.wind.xMetersPerSecond * 0.0024),
    controls.time.mul(STANDALONE_OCEAN_CLOUD_CONTROLS.wind.zMetersPerSecond * 0.0024),
  )
  const seedOffset = vec2(controls.seed.mul(0.071), controls.seed.mul(-0.053))
  const baseCoordinates = projectedDirection
    .mul(STANDALONE_OCEAN_CLOUD_CONTROLS.shapeScale)
    .add(cloudWind)
    .add(seedOffset)
  const weatherCoordinates = baseCoordinates.mul(0.31)
  const weather = normalizedStandaloneOceanNoise(weatherCoordinates)
  const warpX = normalizedStandaloneOceanNoise(
    weatherCoordinates.mul(1.73).add(vec2(13.7, -8.1)),
  ).sub(0.5)
  const warpZ = normalizedStandaloneOceanNoise(
    weatherCoordinates.mul(1.57).add(vec2(-5.3, 17.9)),
  ).sub(0.5)
  const shapedCoordinates = baseCoordinates.add(vec2(warpX, warpZ).mul(0.86))
  const broadShape = createStandaloneOceanCloudFbm(shapedCoordinates, detailOctaves)
  const skyShapeInput = vec4(shapedCoordinates, weather, broadShape) as TSLNode<'vec4'>
  const skyShape = createStandaloneOceanPackedVarying(skyShapeInput, 'vStandaloneOceanSkyShape')
  const sunPlanarDirection = sunDirection.xz.div(sunDirection.xz.length().max(0.001))
  const lightCoordinates = skyShape.xy.add(sunPlanarDirection.mul(0.32))
  const lightDensityInput = normalizedStandaloneOceanNoise(lightCoordinates.mul(0.74))
    .mul(0.58)
    .add(normalizedStandaloneOceanNoise(lightCoordinates.mul(1.61).add(vec2(7.9, -12.4))).mul(0.42))
    .toVar('standaloneOceanSkyLightDensity') as TSLNode<'float'>
  const lightDensity = createStandaloneOceanPackedVarying(
    lightDensityInput,
    'vStandaloneOceanSkyLight',
  )
  const detail = normalizedStandaloneOceanNoise(skyShape.xy.mul(5.2).add(vec2(31.3, -19.7)))
  const cloudType = STANDALONE_OCEAN_CLOUD_CONTROLS.cloudType
  const densitySignal = skyShape.z
    .mul(0.54 + cloudType * 0.08)
    .add(skyShape.w.mul(0.5))
    .sub(detail.mul(STANDALONE_OCEAN_CLOUD_CONTROLS.detailErosion * 0.16))
  const coverageThreshold = 1 - STANDALONE_OCEAN_CLOUD_CONTROLS.coverage * 0.78
  const densityFootprint = fwidth(densitySignal).mul(1.45).max(0.008)
  const horizonFade = upward.smoothstep(0.012, STANDALONE_OCEAN_CLOUD_CONTROLS.horizonFade)
  const cloudDensity = densitySignal
    .smoothstep(
      float(coverageThreshold).sub(densityFootprint),
      float(coverageThreshold + 0.14).add(densityFootprint),
    )
    .mul(horizonFade)
    .mul(STANDALONE_OCEAN_CLOUD_CONTROLS.density)
    .clamp(0, 0.94)

  const sunHeight = sunDirection.y.max(0).smoothstep(0.02, 0.32)
  const lightVisibility = lightDensity
    .smoothstep(0.47, 0.73)
    .oneMinus()
    .mul(sunHeight.mul(0.65).add(0.35))
  const cloudEdge = cloudDensity.mul(cloudDensity.oneMinus()).mul(4).clamp(0, 1)
  const forwardScatter = sunDot.pow(6)
  const silverLining = cloudEdge
    .mul(forwardScatter)
    .mul(STANDALONE_OCEAN_CLOUD_CONTROLS.silverLining)
  const precipitationDarkening = 1 - STANDALONE_OCEAN_CLOUD_CONTROLS.precipitation * 0.34
  const shadowColor = mix(color('#70828e'), horizonRadiance, 0.16).mul(precipitationDarkening)
  const sunlitColor = mix(color('#f1f4ed'), color('#fff0d2'), sunHeight.mul(0.48))
  const cloudLight = lightVisibility.mul(0.72).add(0.18).clamp(0, 1)
  const cloudColor = mix(shadowColor, sunlitColor, cloudLight).add(
    color('#ffe4b0').mul(silverLining.mul(0.58)),
  )
  const cloudedSky = mix(clearSky, cloudColor, cloudDensity)

  return {
    cloudDensity,
    cloudLighting: vec3(lightVisibility, silverLining, cloudDensity),
    color: mix(horizonRadiance, cloudedSky, controls.skyEnabled),
  }
}

function createStandaloneOceanCloudFbm(coordinates: TSLNode<'vec2'>, octaves: number) {
  let amplitude = 0.56
  let frequency = 1
  let normalization = 0
  let result: TSLNode<'float'> = float(0)

  for (let octave = 0; octave < Math.max(1, Math.min(4, octaves)); octave += 1) {
    const octaveOffset = vec2(17.13 * octave, -11.47 * octave)
    result = result.add(
      normalizedStandaloneOceanNoise(coordinates.mul(frequency).add(octaveOffset)).mul(amplitude),
    )
    normalization += amplitude
    amplitude *= 0.5
    frequency *= 2.07
  }

  return result.div(normalization)
}

function createStandaloneOceanHorizonRadiance(controls: StandaloneOceanUniforms) {
  return mix(controls.skyHorizonColor, color('#fff1d8'), 0.08)
}

function createStandaloneOceanFoamMask(
  waves: StandaloneOceanWaveBundle,
  coordinates: TSLNode<'vec2'>,
  controls: StandaloneOceanUniforms,
) {
  const windAngle = controls.oceanDirectionDegrees.mul(Math.PI / 180)
  const windDirectionX = cos(windAngle)
  const windDirectionZ = sin(windAngle)
  const alongWind = coordinates.x.mul(windDirectionX).add(coordinates.y.mul(windDirectionZ))
  const acrossWind = coordinates.x
    .mul(windDirectionZ.negate())
    .add(coordinates.y.mul(windDirectionX))
  const breakupScale = controls.oceanSmallestWave.max(0.4)
  const broadBreakup = normalizedStandaloneOceanNoise(
    vec2(alongWind.div(breakupScale.mul(7.8)), acrossWind.div(breakupScale.mul(2.4))).add(
      vec2(controls.seed.mul(0.071), controls.seed.mul(-0.053)),
    ),
  )
    .smoothstep(0.32, 0.72)
    .mul(0.62)
    .add(0.38)
  const fineBreakup = normalizedStandaloneOceanNoise(
    vec2(alongWind.div(breakupScale.mul(2.2)), acrossWind.div(breakupScale.mul(0.72))).add(
      vec2(controls.seed.mul(-0.043), controls.seed.mul(0.091)),
    ),
  )
    .smoothstep(0.42, 0.74)
    .mul(0.35)
    .add(0.65)
  const compressionBreak = waves.compression
    .mul(waves.crest.pow(1.45))
    .mul(waves.slope.mul(0.7).add(0.3))
  const crestBreak = waves.crest.pow(2.6).mul(waves.slope.pow(0.78))
  const breakingEnergy = compressionBreak
    .mul(0.82)
    .add(crestBreak.mul(0.24))
    .mul(broadBreakup)
    .mul(fineBreakup)
  return breakingEnergy.smoothstep(0.14, 0.32).add(controls.waveFoamCoverage.mul(0.12)).clamp(0, 1)
}

function createStandaloneOceanWaterlineFoam(
  coordinates: TSLNode<'vec2'>,
  geometryWaves: StandaloneOceanWaveBundle,
  waves: StandaloneOceanWaveBundle,
  viewDirection: TSLNode<'vec3'>,
  controls: StandaloneOceanUniforms,
  field: WaterlineInteractionField | null,
) {
  if (!field) {
    return {
      debugColor: vec3(0, 0, 0),
      mask: float(0),
      mist: float(0),
      ribbon: float(0),
    }
  }

  const motion = controls.time.mul(controls.waterlineFoamSpeed)
  const evolution = controls.time.mul(controls.waterlineFoamEvolutionSpeed)
  const breakupScale = controls.waterlineFoamBreakupScale.max(0.25)
  const waterlineCoordinates = coordinates.add(
    vec2(geometryWaves.displacementX, geometryWaves.displacementZ),
  )
  const seedOffset = vec2(controls.seed.mul(0.173), controls.seed.mul(-0.127))
  const firstWarp = normalizedStandaloneOceanNoise3(
    vec3(
      waterlineCoordinates.x.div(breakupScale).add(motion.mul(0.073)).add(seedOffset.x),
      waterlineCoordinates.y.div(breakupScale.mul(1.17)).add(motion.mul(-0.051)).add(seedOffset.y),
      evolution.mul(0.42).add(controls.seed.mul(0.019)),
    ),
  )
  const secondWarp = normalizedStandaloneOceanNoise3(
    vec3(
      waterlineCoordinates.y
        .negate()
        .div(breakupScale.mul(1.41))
        .add(motion.mul(-0.041))
        .add(seedOffset.x.mul(-1.37)),
      waterlineCoordinates.x
        .div(breakupScale.mul(0.83))
        .add(motion.mul(0.067))
        .add(seedOffset.y.mul(-1.37)),
      evolution.mul(-0.31).add(controls.seed.mul(-0.023)).add(17.31),
    ),
  )
  const textureUv = vec2(
    waterlineCoordinates.x
      .sub(field.bounds.minX)
      .div(Math.max(0.001, field.bounds.maxX - field.bounds.minX)),
    waterlineCoordinates.y
      .sub(field.bounds.minZ)
      .div(Math.max(0.001, field.bounds.maxZ - field.bounds.minZ)),
  )
    .clamp(0, 1)
    .mul((field.resolution - 1) / field.resolution)
    .add(0.5 / field.resolution)
  const interactionSample = texture(field.texture, textureUv)
  const distanceSlices = interactionSample.rgb
  const surfaceElevationOffset = geometryWaves.height
    .mul(controls.waterlineFoamSurfaceTracking)
    .add(controls.waterlineFoamElevationOffset)
  const lowerElevationBlend = surfaceElevationOffset
    .div(Math.max(0.001, field.referenceElevationMeters - field.elevationMinimumMeters))
    .add(1)
    .clamp(0, 1)
  const upperElevationBlend = surfaceElevationOffset
    .div(Math.max(0.001, field.elevationMaximumMeters - field.referenceElevationMeters))
    .clamp(0, 1)
  const encodedSignedDistance = mix(distanceSlices.r, distanceSlices.g, lowerElevationBlend).add(
    mix(distanceSlices.g, distanceSlices.b, upperElevationBlend).sub(distanceSlices.g),
  )
  const signedNormalizedDistance = encodedSignedDistance.mul(2).sub(1)
  const signedShoreDistance = signedNormalizedDistance.mul(field.maximumDistanceMeters)
  const boundsEdgeDistance = waterlineCoordinates.x
    .sub(field.bounds.minX)
    .min(float(field.bounds.maxX).sub(waterlineCoordinates.x))
    .min(waterlineCoordinates.y.sub(field.bounds.minZ))
    .min(float(field.bounds.maxZ).sub(waterlineCoordinates.y))
  const boundsValidity = boundsEdgeDistance.smoothstep(
    0,
    Math.max(
      (field.bounds.maxX - field.bounds.minX) / field.resolution,
      (field.bounds.maxZ - field.bounds.minZ) / field.resolution,
    ) * 1.5,
  )
  const broadFog = firstWarp
  const detailFog = secondWarp
  const smoothFog = broadFog.mul(0.68).add(detailFog.mul(0.32)).clamp(0, 1)
  const distanceFootprint = fwidth(signedShoreDistance).mul(1.25)
  const contactWidth = controls.waterlineFoamWidth.max(0.025).max(distanceFootprint)
  const outerFadeWidth = controls.waterlineFoamOuterWidth.max(0.025).max(distanceFootprint)
  const minimumReach = contactWidth.add(outerFadeWidth).mul(2)
  const reach = controls.waterlineFoamReach.max(minimumReach)
  const softness = controls.waterlineFoamSoftness.max(0.01)
  const waveEnergy = waves.compression.mul(0.64).add(waves.crest.mul(0.36)).clamp(0, 1)
  const localReach = reach
    .add(smoothFog.sub(0.5).mul(controls.waterlineFoamWarpStrength))
    .add(waveEnergy.sub(0.5).mul(controls.waterlineFoamCrestInfluence).mul(reach.mul(0.7)))
    .max(minimumReach)
    .min(field.maximumDistanceMeters * 0.92)
  const fieldValidity = signedNormalizedDistance.abs().smoothstep(0.94, 0.995).oneMinus()
  const currentSurfaceDepth = linearDepth()
  const sceneLinearDepth = createStandaloneOceanSampledLinearDepth(
    screenUV,
    viewportDepthTexture().sample(screenUV).r,
  )
  const sceneRayClearance = sceneLinearDepth.sub(currentSurfaceDepth).mul(cameraFar.sub(cameraNear))
  const sceneBehindWater = sceneRayClearance.smoothstep(-0.02, 0.001)
  const verticalViewScale = viewDirection.y.abs().max(0.12)
  const visibleSurfaceClearance = sceneRayClearance.max(0).mul(verticalViewScale)
  const clearanceFootprint = fwidth(visibleSurfaceClearance)
    .mul(1.35)
    .max(0.02)
    .min(softness.mul(0.8).add(0.08))
  const liveContactCoverage = visibleSurfaceClearance
    .smoothstep(localReach.sub(clearanceFootprint).max(0.015), localReach.add(clearanceFootprint))
    .oneMinus()
    .mul(sceneBehindWater)
    .mul(boundsValidity)
  const ribbonInterior = liveContactCoverage.mul(fieldValidity).clamp(0, 1)
  const breakupMask = smoothFog.smoothstep(0.22, 0.78).mul(0.56).add(0.44)
  const fillDensity = mix(float(1), breakupMask, controls.waterlineFoamBreakup.clamp(0, 1))
  const crestResponse = mix(
    float(1),
    waveEnergy.mul(0.72).add(0.46),
    controls.waterlineFoamCrestInfluence.clamp(0, 1),
  )
  const primaryStrength = controls.waterlineFoamIntensity
    .mul(controls.waterlineFoamEnabled)
    .clamp(0, 1.5)
  const primaryFillMask = ribbonInterior
    .mul(fillDensity)
    .mul(crestResponse)
    .mul(controls.waterlineFoamFillOpacity.clamp(0, 1))
    .mul(primaryStrength)
    .clamp(0, 1)
  const primaryRibbon = primaryFillMask
  const primaryMist = ribbonInterior
    .mul(smoothFog.mul(0.55).add(0.45))
    .mul(controls.waterlineFoamFillOpacity)
    .mul(primaryStrength)
    .mul(0.28)
    .clamp(0, 1)
  const cloneSweep = sin(
    controls.time
      .mul(controls.waterlineFoamCloneSpeed)
      .mul(Math.PI * 2)
      .add(controls.waterlineFoamClonePhaseDegrees.mul(Math.PI / 180)),
  )
    .mul(0.5)
    .add(0.5)
  const cloneFrontDistance = mix(
    controls.waterlineFoamCloneInward,
    controls.waterlineFoamCloneOutward,
    cloneSweep,
  ).add(smoothFog.sub(0.5).mul(controls.waterlineFoamCloneVariation))
  const cloneWidth = controls.waterlineFoamCloneWidth.max(0.025)
  const cloneSoftness = controls.waterlineFoamCloneSoftness.max(0.01)
  const cloneInnerDistance = cloneFrontDistance.min(0).sub(cloneWidth)
  const cloneOuterDistance = cloneFrontDistance.max(0).add(cloneWidth)
  const cloneBand = signedShoreDistance
    .smoothstep(cloneInnerDistance.sub(cloneSoftness), cloneInnerDistance.add(cloneSoftness))
    .mul(
      signedShoreDistance
        .smoothstep(cloneOuterDistance.sub(cloneSoftness), cloneOuterDistance.add(cloneSoftness))
        .oneMinus(),
    )
    .mul(sceneBehindWater)
  const cloneFogDensity = mix(float(1), breakupMask, controls.waterlineFoamCloneBreakup.clamp(0, 1))
  const cloneCrestResponse = mix(
    float(1),
    waveEnergy.mul(0.72).add(0.46),
    controls.waterlineFoamCloneCrestInfluence.clamp(0, 1),
  )
  const cloneFoamEnvelope = cloneFogDensity
    .mul(cloneFogDensity)
    .mul(cloneCrestResponse)
    .mul(fieldValidity)
    .mul(controls.waterlineFoamCloneIntensity)
    .mul(controls.waterlineFoamCloneEnabled)
  const cloneMask = cloneBand.mul(0.62).mul(cloneFoamEnvelope).clamp(0, 0.62)
  const cloneMist = cloneBand.mul(0.24).mul(cloneFoamEnvelope).clamp(0, 0.24)
  const mask = primaryRibbon.max(cloneMask)
  const mist = primaryMist.max(cloneMist)

  return {
    debugColor: vec3(liveContactCoverage, primaryFillMask, cloneMask),
    mask,
    mist,
    ribbon: mask,
  }
}

function createStandaloneOceanGlintMask(
  waves: StandaloneOceanWaveBundle,
  coordinates: TSLNode<'vec2'>,
  time: TSLNode<'float'>,
  viewDirection: TSLNode<'vec3'>,
  sunDirection: TSLNode<'vec3'>,
  controls: StandaloneOceanUniforms,
) {
  const sparkleScale = controls.oceanSmallestWave.max(0.4).mul(3.5)
  const sparkleCoordinates = coordinates
    .div(sparkleScale)
    .add(vec2(time.mul(0.14), time.mul(-0.09)))
    .add(vec2(controls.seed.mul(0.173), controls.seed.mul(-0.127)))
  const ridgeMask = waves.glintCarrier.smoothstep(0.34, 0.8)
  const sparkleMask = normalizedStandaloneOceanNoise(sparkleCoordinates)
    .smoothstep(0.71, 0.91)
    .mul(ridgeMask.mul(0.72).add(0.28))
  const halfVector = viewDirection.add(sunDirection).normalize()
  const directGlint = waves.normal.dot(halfVector).max(0).pow(82).mul(ridgeMask)
  const crestGlint = waves.crest.pow(3.2).mul(waves.slope.pow(0.72)).mul(0.38)
  return directGlint
    .max(crestGlint)
    .mul(sparkleMask)
    .mul(controls.glintStrength)
    .mul(controls.glintsEnabled)
    .clamp(0, 1)
}

function createStandaloneOceanGlareMask(
  waves: StandaloneOceanWaveBundle,
  glint: TSLNode<'float'>,
  controls: StandaloneOceanUniforms,
) {
  const broadness = mix(float(1.65), float(0.76), controls.glareSize.clamp(0, 1))
  const compressionHalo = waves.compression
    .mul(waves.crest.pow(1.65))
    .mul(waves.slope.mul(0.72).add(0.28))
    .smoothstep(0.28, 0.65)
    .mul(0.1)
  const glintHalo = glint.pow(broadness.mul(0.72))
  return compressionHalo.max(glintHalo)
}

function normalizedStandaloneOceanNoise(coordinates: TSLNode<'vec2'>) {
  return mx_noise_float(coordinates).mul(0.5).add(0.5).clamp(0, 1)
}

function normalizedStandaloneOceanNoise3(coordinates: TSLNode<'vec3'>) {
  return mx_noise_float(coordinates).mul(0.5).add(0.5).clamp(0, 1)
}

function createStandaloneOceanDetailNormal(
  baseNormal: TSLNode<'vec3'>,
  coordinates: TSLNode<'vec2'>,
  time: TSLNode<'float'>,
  controls: StandaloneOceanUniforms,
) {
  const windAngle = controls.oceanDirectionDegrees.mul(Math.PI / 180)
  const windDirection = vec2(cos(windAngle), sin(windAngle))
  const smallestWave = controls.oceanSmallestWave.max(0.35)
  const drift = windDirection
    .mul(time)
    .mul(controls.oceanTimeScale)
    .mul(controls.oceanWindVelocity.mul(0.018).add(0.12))
  const seedOffset = vec2(controls.seed.mul(0.173), controls.seed.mul(-0.127))
  const footprint = fwidth(coordinates).length()
  const warpCoordinates = coordinates
    .div(smallestWave.mul(12.5))
    .add(drift.mul(0.08))
    .add(seedOffset.mul(0.17))
  const warpX = normalizedStandaloneOceanNoise(warpCoordinates).sub(0.5)
  const warpZ = normalizedStandaloneOceanNoise(
    vec2(warpCoordinates.y.mul(1.21), warpCoordinates.x.mul(-0.79)).add(7.31),
  ).sub(0.5)
  const warp = vec2(warpX, warpZ).mul(1.85)
  const sampleStep = float(0.16)

  const broadCoordinates = coordinates
    .div(smallestWave.mul(8))
    .add(drift.mul(0.42))
    .add(seedOffset)
    .add(warp)
  const broadCenter = normalizedStandaloneOceanNoise(broadCoordinates)
  const broadSlopeX = normalizedStandaloneOceanNoise(broadCoordinates.add(vec2(sampleStep, 0)))
    .sub(broadCenter)
    .div(sampleStep)
  const broadSlopeZ = normalizedStandaloneOceanNoise(broadCoordinates.add(vec2(0, sampleStep)))
    .sub(broadCenter)
    .div(sampleStep)

  const fineCoordinates = coordinates
    .div(smallestWave.mul(1.8))
    .add(vec2(drift.y.negate(), drift.x).mul(0.73))
    .add(seedOffset.mul(-1.37))
    .sub(warp.mul(0.46))
  const fineCenter = normalizedStandaloneOceanNoise(fineCoordinates)
  const fineSlopeX = normalizedStandaloneOceanNoise(fineCoordinates.add(vec2(sampleStep, 0)))
    .sub(fineCenter)
    .div(sampleStep)
  const fineSlopeZ = normalizedStandaloneOceanNoise(fineCoordinates.add(vec2(0, sampleStep)))
    .sub(fineCenter)
    .div(sampleStep)

  const detailStrength = controls.oceanDetailStrength.max(0).mul(controls.wavesEnabled).mul(0.34)
  const broadFilter = footprint.div(smallestWave.mul(8)).smoothstep(0.14, 0.55).oneMinus()
  const fineFilter = footprint.div(smallestWave.mul(1.8)).smoothstep(0.1, 0.4).oneMinus()
  const detailSlopeX = broadSlopeX
    .mul(broadFilter.mul(0.85))
    .add(fineSlopeX.mul(fineFilter.mul(0.15)))
    .mul(detailStrength)
  const detailSlopeZ = broadSlopeZ
    .mul(broadFilter.mul(0.85))
    .add(fineSlopeZ.mul(fineFilter.mul(0.15)))
    .mul(detailStrength)
  return vec3(
    baseNormal.x.sub(detailSlopeX),
    baseNormal.y,
    baseNormal.z.sub(detailSlopeZ),
  ).normalize()
}

function createStandaloneOceanWaveBundle(
  coordinates: TSLNode<'vec2'>,
  time: TSLNode<'float'>,
  controls: StandaloneOceanUniforms,
  vertexSpacing: number,
): StandaloneOceanWaveBundle {
  const windVelocity = controls.oceanWindVelocity.max(0.1)
  const minimumWavelength = controls.oceanSmallestWave.max(0.35)
  const longestWavelength = windVelocity
    .mul(windVelocity)
    .mul(1.6 / 9.81)
    .min(72)
    .max(minimumWavelength.mul(14))
  const windAngle = controls.oceanDirectionDegrees.mul(Math.PI / 180)
  const windDirectionX = cos(windAngle)
  const windDirectionZ = sin(windAngle)
  const alignment = controls.oceanAlignment.clamp(0, 1)
  const damping = controls.oceanDamping.clamp(0, 1)
  const angularSpread = mix(float(1), float(0.24), alignment)
  const baseAmplitude = controls.oceanWaveScale
    .max(0)
    .mul(0.075)
    .mul(windVelocity.div(50).add(0.72))
    .mul(controls.wavesEnabled)
  const timeScale = controls.oceanTimeScale.max(0)
  const choppiness = controls.oceanChoppiness.max(0).mul(controls.choppinessEnabled)
  const spectrumSpread = controls.oceanSpectrumSpread.clamp(0, 1.5)
  const curvature = controls.oceanCrestCurvature.clamp(0, 1.5)
  const curvatureCoordinates = coordinates.div(longestWavelength.mul(1.85))
  const curvatureX = normalizedStandaloneOceanNoise(
    curvatureCoordinates.add(vec2(controls.seed.mul(0.071), controls.seed.mul(-0.053))),
  ).sub(0.5)
  const curvatureZ = normalizedStandaloneOceanNoise(
    vec2(curvatureCoordinates.y.mul(1.17), curvatureCoordinates.x.mul(-0.83)).add(
      vec2(controls.seed.mul(-0.043), controls.seed.mul(0.091)),
    ),
  ).sub(0.5)
  const waveCoordinates = coordinates.add(
    vec2(curvatureX, curvatureZ).mul(longestWavelength.mul(curvature).mul(0.62)),
  )
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
  let amplitudeTotal: TSLNode<'float'> = float(0)

  for (let index = 0; index < STANDALONE_OCEAN_BANDS.length; index += 1) {
    const band = STANDALONE_OCEAN_BANDS[index]
    const bandControls = controls.waveBands[index]
    const spectralComponents = STANDALONE_OCEAN_SPECTRAL_COMPONENTS[index]
    if (!band || !bandControls || !spectralComponents) continue
    const baseWavelength =
      index === STANDALONE_OCEAN_BANDS.length - 1
        ? minimumWavelength
        : longestWavelength.mul(band.wavelength).max(minimumWavelength)
    const frequency = controls.oceanFrequencyScale.max(0.05).mul(bandControls.frequency.max(0.05))

    for (let componentIndex = 0; componentIndex < spectralComponents.length; componentIndex += 1) {
      const component = spectralComponents[componentIndex]
      if (!component) continue
      const modeIndex = index * STANDALONE_OCEAN_COMPONENTS_PER_BAND + componentIndex
      const wavelengthJitter = mix(float(1), float(component.wavelengthScale), spectrumSpread)
      const wavelength = baseWavelength.mul(wavelengthJitter).div(frequency).max(0.15)
      const waveNumber = float(Math.PI * 2).div(wavelength)
      const angleOffset = bandControls.directionOffsetDegrees
        .mul(Math.PI / 180)
        .add(band.angleOffset)
        .add(spectrumSpread.mul(component.angleJitter))
      const angle = windAngle.add(angularSpread.mul(angleOffset))
      const directionX = cos(angle)
      const directionZ = sin(angle)
      const opposition = directionX
        .mul(windDirectionX)
        .add(directionZ.mul(windDirectionZ))
        .negate()
        .max(0)
      const directionalWeight = opposition.mul(damping).mul(0.94).oneMinus().max(0.08)
      const amplitudeWeight = bandControls.amplitude
        .max(0)
        .mul(band.amplitude * component.amplitudeWeight)
        .mul(bandControls.enabled)
      const amplitude = baseAmplitude.mul(amplitudeWeight).mul(directionalWeight)
      const horizontalAmplitude = amplitude
        .mul(choppiness)
        .mul(bandControls.choppiness.max(0))
        .mul(0.78 - index * 0.055)
        .div(alignment.mul(0.22).add(0.78).max(1))
      const filterWeight = wavelength.smoothstep(vertexSpacing * 2.2, vertexSpacing * 4)
      const angularSpeed = sqrt(waveNumber.mul(9.81))
        .mul(timeScale)
        .mul(band.speed * component.speedScale)
        .mul(bandControls.speed.max(0))
      const phaseOffset = sin(
        controls.seed
          .mul(1.37 + modeIndex * 0.013)
          .add(modeIndex * 19.17 + 7.31)
          .mul(12.9898)
          .add(modeIndex * 78.233),
      )
        .mul(43_758.5453)
        .fract()
        .mul(Math.PI * 2)
        .add(component.phase)
        .add(bandControls.phaseDegrees.mul(Math.PI / 180))
      const phase = waveCoordinates
        .dot(vec2(directionX, directionZ))
        .mul(waveNumber)
        .sub(time.mul(angularSpeed))
        .add(phaseOffset)
      const sine = sin(phase)
      const cosine = cos(phase)
      const shape = bandControls.shape.clamp(1, 4)
      const sineMagnitude = sine.abs().max(0.001)
      const shapeScale = sineMagnitude.pow(shape.sub(1))
      const shapedSine = sine.mul(shapeScale)
      const shapedSineDerivative = shape.mul(shapeScale).mul(cosine)
      const resolvedAmplitude = filterWeight.mul(amplitude)
      const resolvedHorizontalAmplitude = filterWeight.mul(horizontalAmplitude)
      const heightDerivativeScale = resolvedAmplitude.mul(waveNumber).mul(shapedSineDerivative)
      const horizontalDerivativeScale = resolvedHorizontalAmplitude
        .mul(waveNumber)
        .mul(sine)
        .negate()

      height = height.add(shapedSine.mul(resolvedAmplitude))
      displacementX = displacementX.add(cosine.mul(resolvedHorizontalAmplitude).mul(directionX))
      displacementZ = displacementZ.add(cosine.mul(resolvedHorizontalAmplitude).mul(directionZ))
      heightDerivativeX = heightDerivativeX.add(heightDerivativeScale.mul(directionX))
      heightDerivativeZ = heightDerivativeZ.add(heightDerivativeScale.mul(directionZ))
      displacementDerivativeXX = displacementDerivativeXX.add(
        horizontalDerivativeScale.mul(directionX).mul(directionX),
      )
      displacementDerivativeXZ = displacementDerivativeXZ.add(
        horizontalDerivativeScale.mul(directionX).mul(directionZ),
      )
      displacementDerivativeZX = displacementDerivativeZX.add(
        horizontalDerivativeScale.mul(directionZ).mul(directionX),
      )
      displacementDerivativeZZ = displacementDerivativeZZ.add(
        horizontalDerivativeScale.mul(directionZ).mul(directionZ),
      )
      crestAccumulator = crestAccumulator.add(
        shapedSine.mul(0.5).add(0.5).pow(2.2).mul(filterWeight.mul(amplitudeWeight)),
      )
      glintAccumulator = glintAccumulator.add(
        cosine
          .mul(0.5)
          .add(0.5)
          .pow(4 + index * 0.8)
          .mul(filterWeight.mul(amplitudeWeight)),
      )
      amplitudeTotal = amplitudeTotal.add(amplitudeWeight)
    }
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
  const crest = crestAccumulator.div(amplitudeTotal.mul(0.54).max(0.001)).clamp(0, 1)
  const slope = normal.y.oneMinus().mul(9).clamp(0, 1)
  return {
    compression,
    crest,
    displacementX,
    displacementZ,
    glintCarrier: glintAccumulator.div(amplitudeTotal.mul(0.48).max(0.001)).clamp(0, 1),
    height,
    jacobian,
    normal,
    slope,
  }
}
