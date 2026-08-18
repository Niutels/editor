import { describe, expect, test } from 'vitest'
import {
  LANDRUSH_GRASS_MAP_FADE_END_PROGRESS,
  LANDRUSH_GRASS_MAP_FADE_START_PROGRESS,
  resolveLandrushGrassMapExposure,
  resolveLandrushGrassMapVisibility,
} from './landrush-grass-map-transition'

describe('Landrush grass map transition', () => {
  test('starts fading immediately after the map transition begins', () => {
    expect(resolveLandrushGrassMapVisibility(0)).toBe(1)
    expect(resolveLandrushGrassMapVisibility(LANDRUSH_GRASS_MAP_FADE_START_PROGRESS)).toBe(1)
    expect(
      resolveLandrushGrassMapVisibility(LANDRUSH_GRASS_MAP_FADE_START_PROGRESS + 0.001),
    ).toBeLessThan(1)
  })

  test('finishes hiding grass before the camera reaches its terminal map pose', () => {
    expect(
      resolveLandrushGrassMapVisibility(
        (LANDRUSH_GRASS_MAP_FADE_START_PROGRESS + LANDRUSH_GRASS_MAP_FADE_END_PROGRESS) / 2,
      ),
    ).toBeCloseTo(0.5, 12)
    expect(resolveLandrushGrassMapVisibility(LANDRUSH_GRASS_MAP_FADE_END_PROGRESS)).toBe(0)
    expect(resolveLandrushGrassMapVisibility(1)).toBe(0)
  })

  test('tracks raw transition progress in both directions', () => {
    expect(
      resolveLandrushGrassMapExposure(
        'map',
        { from: 'player', to: 'map' },
        LANDRUSH_GRASS_MAP_FADE_START_PROGRESS,
      ),
    ).toBe(LANDRUSH_GRASS_MAP_FADE_START_PROGRESS)
    expect(resolveLandrushGrassMapExposure('player', { from: 'map', to: 'player' }, 0.25)).toBe(
      0.75,
    )
    expect(resolveLandrushGrassMapExposure('map', null, 0)).toBe(1)
    expect(resolveLandrushGrassMapExposure('player', null, 1)).toBe(0)
  })
})
