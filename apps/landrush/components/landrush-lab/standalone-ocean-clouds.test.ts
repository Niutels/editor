import { describe, expect, test } from 'vitest'
import {
  createStandaloneOceanCloudProfile,
  STANDALONE_OCEAN_CLOUD_CONTROLS,
  STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT,
} from './standalone-ocean-clouds'

describe('standalone ocean clouds', () => {
  test('builds a deterministic shader profile from the same seed and quality tier', () => {
    const first = createStandaloneOceanCloudProfile({ quality: 'balanced', seed: 73 })
    const second = createStandaloneOceanCloudProfile({ quality: 'balanced', seed: 73 })

    expect(second).toEqual(first)
    expect(first.metrics.drawCalls).toBe(0)
    expect(first.metrics.renderTargets).toBe(0)
    expect(first.metrics.detailOctaves).toBe(3)
    expect(first.metrics.estimatedFragmentNoiseSamples).toBe(1)
    expect(first.metrics.estimatedVertexNoiseSamples).toBe(8)
    expect(
      first.metrics.estimatedFragmentNoiseSamples + first.metrics.estimatedVertexNoiseSamples,
    ).toBe(first.metrics.estimatedNoiseSamples)
  })

  test('publishes the authored cloud altitude and coverage controls', () => {
    const profile = createStandaloneOceanCloudProfile({ quality: 'high', seed: 1042 })

    expect(profile.metrics.baseAltitude).toBe(STANDALONE_OCEAN_CLOUD_CONTROLS.baseAltitude)
    expect(profile.metrics.topAltitude).toBe(STANDALONE_OCEAN_CLOUD_CONTROLS.topAltitude)
    expect(profile.metrics.coverage).toBe(STANDALONE_OCEAN_CLOUD_CONTROLS.coverage)
    expect(profile.metrics.topAltitude).toBeGreaterThan(profile.metrics.baseAltitude)
  })

  test('changes the field seed and scales detail by quality tier', () => {
    const first = createStandaloneOceanCloudProfile({ quality: 'performance', seed: 11 })
    const second = createStandaloneOceanCloudProfile({ quality: 'performance', seed: 12 })
    const high = createStandaloneOceanCloudProfile({ quality: 'high', seed: 11 })

    expect(second.metrics.seed).not.toBe(first.metrics.seed)
    expect(high.metrics.detailOctaves).toBeGreaterThan(first.metrics.detailOctaves)
    expect(high.metrics.estimatedNoiseSamples).toBeGreaterThan(first.metrics.estimatedNoiseSamples)
  })

  test('keeps the visual contract sky-wide and reflection-aware', () => {
    expect(STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT.identity).toContain(
      'one continuous weather field spanning the visible sky',
    )
    expect(STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT.identity).toContain(
      'the ocean reflection preserves sky coverage and lighting with a bounded analytic field',
    )
    expect(STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT.invariants).toContain(
      'the ocean reflection uses no procedural noise samples',
    )
    expect(STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT.invariants).toContain(
      'low-frequency weather, warp, shape, and lighting evaluate per sky vertex',
    )
    expect(STANDALONE_OCEAN_CLOUD_VISUAL_CONTRACT.invariants).toContain(
      'one detail erosion noise sample remains per sky fragment',
    )
  })
})
