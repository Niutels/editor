import { describe, expect, test } from 'bun:test'
import { BufferGeometry, DataTexture, Float32BufferAttribute, RGBAFormat } from 'three'
import {
  DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
  type ProceduralRockCliffMetrics,
  type ProceduralRockCliffPlan,
} from './procedural-rock-cliff-geometry'
import {
  collectProceduralRockCliffWorkerTransferables,
  createProceduralRockCliffWorkerSignature,
  type ProceduralRockCliffWorkerCompileInput,
  resolveProceduralRockCliffWorkerRequest,
  restoreProceduralRockCliffBundle,
  serializeProceduralRockCliffBundle,
} from './procedural-rock-cliff-worker-transport'
import type { WaterlineInteractionField } from './waterline-interaction-field'

describe('procedural-rock cliff worker transport', () => {
  test('uses one deterministic signature for semantically identical structured-clone inputs', () => {
    const input = createInput()
    expect(createProceduralRockCliffWorkerSignature(structuredClone(input))).toBe(
      createProceduralRockCliffWorkerSignature(input),
    )
    expect(
      createProceduralRockCliffWorkerSignature({ ...input, waterlineResolution: 1280 }),
    ).not.toBe(createProceduralRockCliffWorkerSignature(input))
  })

  test('transfers compiled arrays once and restores render resources without rescanning or copying', () => {
    const serialized = serializeProceduralRockCliffBundle(createPlan(), createWaterlineField())
    const transfer = collectProceduralRockCliffWorkerTransferables(serialized)
    expect(transfer).toHaveLength(10)
    expect(new Set(transfer).size).toBe(transfer.length)

    const received = structuredClone(serialized, { transfer })
    expect(serialized.plan.geometry.positions.byteLength).toBe(0)
    expect(serialized.waterlineInteractionField?.data.byteLength).toBe(0)

    const restored = restoreProceduralRockCliffBundle(received)
    expect(restored.plan.geometry.getAttribute('position').array).toBe(
      received.plan.geometry.positions,
    )
    expect(restored.plan.geometry.boundingBox?.min.toArray()).toEqual([-1, 0, -1])
    expect(restored.plan.geometry.boundingBox?.max.toArray()).toEqual([1, 2, 0])
    expect(restored.plan.geometry.userData).toEqual({ source: 'worker-test' })
    expect(restored.waterlineInteractionField?.texture.image.data).toBe(
      received.waterlineInteractionField?.data,
    )
    expect(restored.waterlineInteractionField?.texture.needsUpdate).toBeUndefined()
    expect(restored.waterlineInteractionField?.texture.version).toBeGreaterThan(0)
  })

  test('rejects signature drift before invoking the expensive compiler', () => {
    let compileCount = 0
    const input = createInput()
    const response = resolveProceduralRockCliffWorkerRequest(
      {
        input,
        requestId: 7,
        signature: 'stale',
        type: 'compile',
      },
      () => {
        compileCount += 1
        return serializeProceduralRockCliffBundle(createPlan(), null)
      },
    )

    expect(response).toMatchObject({
      error: { name: 'DataError' },
      ok: false,
      requestId: 7,
      signature: 'stale',
    })
    expect(compileCount).toBe(0)
  })
})

function createInput(): ProceduralRockCliffWorkerCompileInput {
  return {
    beachControls: DEFAULT_PROCEDURAL_BEACH_CONTROLS,
    cutCount: 5,
    includeWaterlineInteractionField: true,
    offshoreControls: DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
    quality: 'balanced',
    rockScale: 1,
    seed: 42,
    surface: {
      grassSurfaceElevation: 2,
      grassSurfacePoints: [
        { x: -10, z: -10 },
        { x: 10, z: -10 },
        { x: 10, z: 10 },
        { x: -10, z: 10 },
      ],
      hasElevation: true,
      plateauElevation: 2,
      plateauPoints: [],
      shorelinePoints: [],
      slopeStartPoints: [],
      waterPlaneSize: 64,
    },
    toneControls: DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
    wallControls: DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
    waterSurfaceElevation: 0,
    waterlineElevationRangeMeters: 2.5,
    waterlineMaximumDistanceMeters: 6,
    waterlineResolution: 1024,
  }
}

function createPlan(): ProceduralRockCliffPlan {
  return {
    coverageGeometry: createGeometry(),
    geometry: createGeometry(),
    metrics: { renderedTriangles: 1 } as ProceduralRockCliffMetrics,
    variantGeometry: createGeometry(),
  }
}

function createGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 0, 2, 0], 3))
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  geometry.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData = { source: 'worker-test' }
  return geometry
}

function createWaterlineField(): WaterlineInteractionField {
  return {
    bounds: { maxX: 1, maxZ: 1, minX: -1, minZ: -1 },
    elevationMaximumMeters: 2.5,
    elevationMinimumMeters: -2.5,
    maximumDistanceMeters: 6,
    referenceElevationMeters: 0,
    resolution: 2,
    segmentCount: 3,
    sliceSegmentCounts: [1, 3, 2],
    terrainElevationMaximumMeters: 2.5,
    terrainElevationMinimumMeters: -2.5,
    texture: new DataTexture(new Uint8Array(16), 2, 2, RGBAFormat),
  }
}
