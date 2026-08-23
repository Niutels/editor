export type StandaloneOceanCloudQuality = 'balanced' | 'high' | 'performance'

export type StandaloneOceanCloudProfile = {
  metrics: {
    baseAltitude: number
    coverage: number
    detailOctaves: number
    drawCalls: 0
    estimatedFragmentNoiseSamples: 1
    estimatedNoiseSamples: number
    estimatedVertexNoiseSamples: number
    quality: StandaloneOceanCloudQuality
    renderTargets: 0
    seed: number
    topAltitude: number
  }
}

export const STANDALONE_OCEAN_CLOUD_CONTROLS = {
  anvilBias: 0.12,
  baseAltitude: 135,
  cloudType: 0.62,
  coverage: 0.58,
  density: 0.84,
  detailErosion: 0.34,
  horizonFade: 0.075,
  precipitation: 0.08,
  shapeScale: 0.19,
  silverLining: 0.48,
  topAltitude: 225,
  wind: { xMetersPerSecond: 0.58, zMetersPerSecond: 0.16 },
} as const

export const STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT = {
  cameraEnvelope: { design: 95, far: 320, near: 8 },
  frameBudgetMs: 1.6,
  identity: [
    'one continuous weather field spanning the visible sky',
    'broad coherent cloud banks broken by detail erosion instead of overlapping spheres',
    'cool self-shadowed interiors and warm sun-facing edges',
    'the ocean reflection preserves sky coverage and lighting with a bounded analytic field',
  ],
  invariants: [
    'the cloud seed is deterministic',
    'cloud motion advects a stable field instead of rotating geometry around the camera',
    'performance tiers preserve coverage and directional lighting',
    'the cloud field adds no draw call or render target beyond the existing sky pass',
    'the ocean reflection uses no procedural noise samples',
    'low-frequency weather, warp, shape, and lighting evaluate per sky vertex',
    'one detail erosion noise sample remains per sky fragment',
  ],
  subject: 'A wide Mediterranean fair-weather cloud layer over the island and ocean',
} as const

const STANDALONE_OCEAN_CLOUD_QUALITY = {
  balanced: { detailOctaves: 3, estimatedNoiseSamples: 9 },
  high: { detailOctaves: 4, estimatedNoiseSamples: 10 },
  performance: { detailOctaves: 2, estimatedNoiseSamples: 8 },
} as const

export function createStandaloneOceanCloudProfile({
  quality,
  seed,
}: {
  quality: StandaloneOceanCloudQuality
  seed: number
}): StandaloneOceanCloudProfile {
  const settings = STANDALONE_OCEAN_CLOUD_QUALITY[quality]
  return {
    metrics: {
      baseAltitude: STANDALONE_OCEAN_CLOUD_CONTROLS.baseAltitude,
      coverage: STANDALONE_OCEAN_CLOUD_CONTROLS.coverage,
      detailOctaves: settings.detailOctaves,
      drawCalls: 0,
      estimatedFragmentNoiseSamples: 1,
      estimatedNoiseSamples: settings.estimatedNoiseSamples,
      estimatedVertexNoiseSamples: settings.estimatedNoiseSamples - 1,
      quality,
      renderTargets: 0,
      seed: Math.trunc(seed),
      topAltitude: STANDALONE_OCEAN_CLOUD_CONTROLS.topAltitude,
    },
  }
}
