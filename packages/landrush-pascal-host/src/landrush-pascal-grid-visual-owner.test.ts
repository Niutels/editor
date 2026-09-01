import { describe, expect, test } from 'bun:test'
import { resolveLandrushPascalCanonicalGridVisibility } from './landrush-pascal-grid-visual-owner'

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
  test('keeps the parcel grid authoritative on house floors, slabs, and ceilings', () => {
    expect(visible(0, 0, 1, null, false, 0)).toBe(false)
    expect(visible(0, 0.05, 1, null, false, 0)).toBe(false)
    expect(visible(0, 2.7, 1, null, false, 0)).toBe(false)
    expect(visible(0, 2.7, -1, null, false, 0)).toBe(false)
  })

  test('classifies moving wall hosts as oriented and other moving planes as horizontal', () => {
    expect(visible(1.5, null, null, 4, true, 0)).toBe(true)
    expect(visible(1.5, null, null, 4, false, 0)).toBe(false)
  })

  test('falls back to the selected level and preserves invalid plane inputs', () => {
    expect(visible(3, null, null, null, false, 12)).toBe(false)
    expect(visible(3, Number.NaN, 1, null, false, 3)).toBe(true)
    expect(visible(3, 3, Number.NaN, null, false, 3)).toBe(true)
    expect(visible(3, null, null, null, false, Number.NaN)).toBe(true)
  })

  test('preserves oriented planes and absent owners', () => {
    expect(visible(0, 0, 0, null, false, 0)).toBe(true)
    expect(visible(0, 2.7, 0.949, null, false, 0)).toBe(true)
    expect(visible(0, 2.7, -0.949, null, false, 0)).toBe(true)
    expect(visible(0, 2.7, 0.95, null, false, 0)).toBe(false)
    expect(visible(0, 2.7, -0.95, null, false, 0)).toBe(false)
    expect(visible(null, 0.25, 1, null, false, 0)).toBe(true)
    expect(visible(Number.NaN, 0, 1, null, false, 0)).toBe(true)
  })
})
