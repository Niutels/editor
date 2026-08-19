import { describe, expect, test } from 'bun:test'
import {
  blendStylizedGroundPathColor,
  createStylizedPathGrid,
  sampleMaskRgba,
  stylizedPathSignedDistance,
  stylizedPathWeightFromDistance,
} from './stylized-ground-path'

describe('stylized ground path rendering', () => {
  test('builds one road field used by both world renderers', () => {
    const grid = createStylizedPathGrid(
      [
        {
          points: [
            { x: -10, z: 0 },
            { x: 10, z: 0 },
          ],
          width: 2,
        },
      ],
      100,
    )

    expect(grid).not.toBeNull()
    expect(stylizedPathSignedDistance({ x: 0, z: 0 }, grid, 0.5, 0.5)).toBeLessThan(-1.3)
    expect(stylizedPathSignedDistance({ x: 0, z: 4 }, grid, 0.5, 0.5)).toBeGreaterThan(2.6)
  })

  test('keeps path blending and mask interpolation deterministic', () => {
    expect(stylizedPathWeightFromDistance(0)).toBeCloseTo(0.83320632, 6)
    expect(blendStylizedGroundPathColor([150, 146, 78], -1, 0.5, 0.5, 20)).toEqual([
      202.38684147656397, 192.9592150324165, 167.23718446599713,
    ])
    expect(
      sampleMaskRgba(
        new Uint8Array([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]),
        2,
        0.5,
        0.5,
      ),
    ).toEqual([60, 70, 80, 90])
  })
})
