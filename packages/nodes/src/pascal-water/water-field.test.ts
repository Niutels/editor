import { expect, test } from 'bun:test'
import { createPascalWaterFieldTextureData } from './water-field'

const squarePerimeter = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: 10, z: 10 },
  { x: -10, z: 10 },
]

function packedDepthAtCenter(data: Uint8Array, resolution: number) {
  const center = Math.floor(resolution / 2)
  const offset = (center * resolution + center) * 4
  return ((data[offset] ?? 0) * 256 + (data[offset + 1] ?? 0)) / 65535
}

test('keeps coastal depth continuous across the interior shoreline edge', () => {
  const resolution = 64
  const parameters = {
    depthContourCollapseMeters: 0,
    depthContourOffsetMeters: 0,
    depthContourVariationMeters: 0,
  }
  const deepInterior = createPascalWaterFieldTextureData({
    parameters,
    perimeter: squarePerimeter,
    planeSize: 64,
    resolution,
  })
  const continuousInterior = createPascalWaterFieldTextureData({
    interiorDepthIsDeep: false,
    parameters,
    perimeter: squarePerimeter,
    planeSize: 64,
    resolution,
  })

  expect(packedDepthAtCenter(deepInterior.data, resolution)).toBe(1)
  expect(packedDepthAtCenter(continuousInterior.data, resolution)).toBeLessThan(0.05)
})
