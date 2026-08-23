import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_PASCAL_GRID_PLANE_EPSILON,
  resolveLandrushPascalCanonicalGridVisibility,
} from './landrush-pascal-grid-visual-owner'

const visible = (
  ownedHorizontalGridPlaneY: number | null,
  publishedSurfaceY: number | null,
  publishedSurfaceNormalY: number | null,
  movingPlaneY: number | null,
  movingPlaneWallHosted: boolean,
  selectedLevelY: number,
) =>
  resolveLandrushPascalCanonicalGridVisibility(
    ownedHorizontalGridPlaneY,
    publishedSurfaceY,
    publishedSurfaceNormalY,
    movingPlaneY,
    movingPlaneWallHosted,
    selectedLevelY,
  )

describe('Landrush Pascal canonical grid visual owner', () => {
  test('lets the published placement surface own the active plane', () => {
    expect(visible(2, 2, 1, 4, true, 0)).toBe(false)
    expect(visible(2, 2, 0, null, false, 0)).toBe(true)
  })

  test('classifies moving wall hosts as oriented and other moving planes as horizontal', () => {
    expect(visible(1.5, null, null, 1.5, true, 0)).toBe(true)
    expect(visible(1.5, null, null, 1.5, false, 0)).toBe(false)
  })

  test('falls back to the selected level and preserves invalid plane inputs', () => {
    expect(visible(3, null, null, null, false, 3)).toBe(false)
    expect(visible(3, Number.NaN, 1, null, false, 3)).toBe(true)
    expect(visible(3, 3, Number.NaN, null, false, 3)).toBe(true)
    expect(visible(3, null, null, null, false, Number.NaN)).toBe(true)
  })

  test('suppresses only within the coplanar horizontal tolerance', () => {
    expect(visible(2, 2, 1, null, false, 0)).toBe(false)
    expect(visible(2, 2 + LANDRUSH_PASCAL_GRID_PLANE_EPSILON, 1, null, false, 0)).toBe(false)
    expect(visible(2, 2 + LANDRUSH_PASCAL_GRID_PLANE_EPSILON + 0.0001, 1, null, false, 0)).toBe(
      true,
    )
  })

  test('preserves oriented, elevated, ceiling, unowned, and invalid-owner visuals', () => {
    expect(visible(0, 0, 0, null, false, 0)).toBe(true)
    expect(visible(0, 2.7, 1, null, false, 0)).toBe(true)
    expect(visible(null, 0, 1, null, false, 0)).toBe(true)
    expect(visible(Number.NaN, 0, 1, null, false, 0)).toBe(true)
  })
})
