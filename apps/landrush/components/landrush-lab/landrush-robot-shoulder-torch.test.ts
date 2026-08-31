import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LinearFilter, LinearMipmapLinearFilter, Matrix4, Object3D, StaticDrawUsage } from 'three'
import {
  createLandrushRobotShoulderTorchLightingState,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_BODY_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FEED_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_OPACITY,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_SURFACE_TRIANGLE_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_LENS_EMISSIVE_INTENSITY,
  LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY,
  LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA,
  LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  LANDRUSH_ROBOT_SHOULDER_TORCH_SPOT_INTENSITY,
  resolveLandrushRobotShoulderTorchContribution,
  resolveLandrushRobotShoulderTorchGeometryBudget,
  updateLandrushRobotShoulderTorchGroundTarget,
  updateLandrushRobotShoulderTorchLightingState,
  updateLandrushRobotShoulderTorchMergeTarget,
} from './landrush-robot-shoulder-torch'
import {
  createLandrushRobotShoulderTorchBeamAlphaTexture,
  createLandrushRobotShoulderTorchBeamGeometry,
  createLandrushRobotShoulderTorchPixelTexture,
  createLandrushRobotShoulderTorchPoseState,
  resolveLandrushRobotShoulderTorchBeamEnvelope,
  updateLandrushRobotShoulderTorchPoseState,
} from './landrush-robot-shoulder-torch-rig'

describe('Landrush robot shoulder torches', () => {
  test('keeps the standard-material fixture texture filterable for WebGPU sampling', () => {
    const texture = createLandrushRobotShoulderTorchPixelTexture()
    try {
      expect(texture.magFilter).toBe(LinearFilter)
      expect(texture.minFilter).toBe(LinearFilter)
    } finally {
      texture.dispose()
    }
  })

  test('mipmaps the power-of-two beam alpha field for stable top-down minification', () => {
    const texture = createLandrushRobotShoulderTorchBeamAlphaTexture()
    try {
      expect(texture.image.width).toBe(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION)
      expect(texture.image.height).toBe(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION)
      expect(texture.generateMipmaps).toBe(true)
      expect(texture.magFilter).toBe(LinearFilter)
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter)
    } finally {
      texture.dispose()
    }
  })

  test('pre-initializes the static merged-beam UVs before the first active frame', () => {
    const geometry = createLandrushRobotShoulderTorchBeamGeometry()
    try {
      const uv = geometry.getAttribute('uv')
      expect(uv.usage).toBe(StaticDrawUsage)
      expect(Array.from(uv.array)).toEqual(
        [
          0, 0, 0, 0.18, 1, 0.18, 0, 0, 1, 0.18, 1, 0, 0, 0.18, 0, 1, 1, 1, 0, 0.18, 1, 1, 1, 0.18,
        ].map(Math.fround),
      )
    } finally {
      geometry.dispose()
    }
  })

  test('publishes the current shoulder pose into one stable allocation-free state', () => {
    const state = createLandrushRobotShoulderTorchPoseState()
    const left = state.leftShoulder
    const right = state.rightShoulder
    const origin = state.robotOrigin
    const visualRoot = new Object3D()

    expect(
      updateLandrushRobotShoulderTorchPoseState(
        state,
        visualRoot,
        new Matrix4().makeTranslation(-0.4, 1.8, 3),
        new Matrix4().makeTranslation(0.4, 1.8, 3),
        new Matrix4().makeTranslation(7, 0.2, -5),
      ),
    ).toBe(state)
    expect(state.leftShoulder).toBe(left)
    expect(state.rightShoulder).toBe(right)
    expect(state.robotOrigin).toBe(origin)
    expect(state.leftShoulder.toArray()).toEqual([-0.4, 1.8, 3])
    expect(state.rightShoulder.toArray()).toEqual([0.4, 1.8, 3])
    expect(state.robotOrigin.toArray()).toEqual([7, 0.2, -5])
    expect(state.visualRoot).toBe(visualRoot)
    expect(state.ready).toBe(true)
  })

  test('keeps the root and spot light in the render graph with zero day contribution', () => {
    expect(
      resolveLandrushRobotShoulderTorchContribution({
        active: false,
        emitSpotLights: true,
        showBeams: true,
        showFixtures: true,
      }),
    ).toEqual({
      beamOpacity: 0,
      fixtureOpacity: 0,
      lensEmissiveIntensity: 0,
      lightIntensity: 0,
    })
  })

  test('keeps one physical spotlight behind the two source feeds and unified beam', () => {
    const source = readFileSync(
      new URL('./landrush-robot-shoulder-torch-rig.tsx', import.meta.url),
      'utf8',
    )
    expect(source.match(/<spotLight\b/g)).toHaveLength(1)
    expect(source).toContain('side={FrontSide}')
    expect(source).not.toContain('vertexColors')
    expect(source).not.toContain('TORCH_BEAM_FEED_ENERGY')
    expect(source).toContain(
      'updateLandrushRobotShoulderTorchBeamRadial(cameraPosition, beamTarget, scratch)',
    )
    expect(source).not.toContain('DoubleSide')
    expect(source).not.toContain('TORCH_BEAM_FIN_ORIENTATIONS')
  })

  test('changes only fixture, beam, and spot-light contribution while active', () => {
    expect(
      resolveLandrushRobotShoulderTorchContribution({
        active: true,
        emitSpotLights: true,
        showBeams: true,
        showFixtures: true,
      }),
    ).toEqual({
      beamOpacity: LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_OPACITY,
      fixtureOpacity: 1,
      lensEmissiveIntensity: LANDRUSH_ROBOT_SHOULDER_TORCH_LENS_EMISSIVE_INTENSITY,
      lightIntensity: LANDRUSH_ROBOT_SHOULDER_TORCH_SPOT_INTENSITY,
    })
    expect(
      resolveLandrushRobotShoulderTorchContribution({
        active: true,
        emitSpotLights: false,
        showBeams: false,
        showFixtures: false,
      }),
    ).toEqual({
      beamOpacity: 0,
      fixtureOpacity: 0,
      lensEmissiveIntensity: 0,
      lightIntensity: 0,
    })
  })

  test('keeps every paired fixture far below a 3k-triangle Meshy result', () => {
    for (const design of LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS) {
      const budget = resolveLandrushRobotShoulderTorchGeometryBudget(design)
      expect(budget.pairFixtureTriangles).toBeLessThan(300)
      expect(budget.totalEffectTriangles).toBeLessThan(350)
      expect(budget.fixtureTextureBytes).toBe(256)
      expect(budget.beamAlphaTextureBytes).toBe(87_380)
      expect(budget.textureBytes).toBe(87_636)
    }
    expect(resolveLandrushRobotShoulderTorchGeometryBudget().pairFixtureTriangles).toBe(
      resolveLandrushRobotShoulderTorchGeometryBudget(LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN)
        .pairFixtureTriangles,
    )
    expect(resolveLandrushRobotShoulderTorchGeometryBudget().beamTriangles).toBe(4)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FEED_COUNT).toBe(2)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_BODY_COUNT).toBe(1)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_SURFACE_TRIANGLE_COUNT).toBe(4)
  })

  test('lands the unified beam on the ground in the exact combat aim direction', () => {
    const target = { x: Number.NaN, y: Number.NaN, z: Number.NaN }
    const forward = updateLandrushRobotShoulderTorchGroundTarget(target, 0, 1.2, 5.4, 8, -3)
    expect(forward).toBe(target)
    expect(forward.x).toBeCloseTo(8)
    expect(forward.y).toBeCloseTo(1.235)
    expect(forward.z).toBeCloseTo(2.4)
    const right = updateLandrushRobotShoulderTorchGroundTarget(target, Math.PI / 2, 0, 4, 2, 5)
    expect(right).toBe(target)
    expect(right.x).toBeCloseTo(6)
    expect(right.y).toBeCloseTo(0.035)
    expect(right.z).toBeCloseTo(5)
  })

  test('joins two source feeds into one body at the authored merge distance', () => {
    const origin = { x: 8, y: 1.2, z: -3 }
    const target = { x: 8, y: 0.035, z: 2.4 }
    const mergeTarget = { x: 0, y: 0, z: 0 }
    const updated = updateLandrushRobotShoulderTorchMergeTarget(
      mergeTarget,
      origin,
      target,
      LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE,
    )

    expect(updated).toBe(mergeTarget)
    expect(
      Math.hypot(updated.x - origin.x, updated.y - origin.y, updated.z - origin.z),
    ).toBeCloseTo(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE)
    expect(updated.x).toBeCloseTo(origin.x)
    expect(updated.y).toBeLessThan(origin.y)
    expect(updated.z).toBeGreaterThan(origin.z)
  })

  test('keeps both sources filled and the merged beam center-high without a bright rim', () => {
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, 0.5)).toBe(1)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.25, 0)).toBe(1)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.75, 0)).toBe(1)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, 0)).toBe(0)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.25, 0.05 / 5.4)).toBeGreaterThan(0.9)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, 1)).toBe(0)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.99, 0.5)).toBeLessThan(0.01)
    for (const v of [0, 0.02, 0.05, 0.09, 0.15, 0.18, 0.5, 0.9, 1]) {
      expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0, v)).toBe(0)
      expect(resolveLandrushRobotShoulderTorchBeamEnvelope(1, v)).toBe(0)
    }
    for (const v of [0.18, 0.5, 0.9]) {
      let previous = resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, v)
      expect(Number.isFinite(previous)).toBe(true)
      for (let step = 1; step <= 20; step += 1) {
        const u = 0.5 + step / 40
        const value = resolveLandrushRobotShoulderTorchBeamEnvelope(u, v)
        expect(value).toBeLessThanOrEqual(previous)
        expect(value).toBeCloseTo(resolveLandrushRobotShoulderTorchBeamEnvelope(1 - u, v))
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
        previous = value
      }
      expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0, v)).toBe(0)
      expect(resolveLandrushRobotShoulderTorchBeamEnvelope(1, v)).toBe(0)
    }
    for (const v of [0, 0.02, 0.05, 0.09, 0.15]) {
      let previous = resolveLandrushRobotShoulderTorchBeamEnvelope(0.75, v)
      for (let step = 1; step <= 25; step += 1) {
        const u = 0.75 + step / 100
        const value = resolveLandrushRobotShoulderTorchBeamEnvelope(u, v)
        expect(value).toBeLessThanOrEqual(previous)
        expect(value).toBeCloseTo(resolveLandrushRobotShoulderTorchBeamEnvelope(1 - u, v))
        previous = value
      }
      expect(previous).toBe(0)
    }
    for (const [center, direction] of [
      [0.25, -1],
      [0.75, 1],
    ] as const) {
      let previous = resolveLandrushRobotShoulderTorchBeamEnvelope(center, 0)
      for (let step = 1; step <= 10; step += 1) {
        const value = resolveLandrushRobotShoulderTorchBeamEnvelope(
          center + direction * step * 0.01,
          0,
        )
        expect(value).toBeLessThanOrEqual(previous)
        previous = value
      }
      expect(previous).toBe(0)
    }
  })

  test('publishes the exact real-light cone for zombie visibility without allocating a new state', () => {
    const state = createLandrushRobotShoulderTorchLightingState()
    const updated = updateLandrushRobotShoulderTorchLightingState(
      state,
      true,
      { x: 1.25, y: 2.5, z: -3.75 },
      { x: 6.5, y: 0.25, z: 8.75 },
    )

    expect(updated).toBe(state)
    expect(updated).toEqual({
      active: true,
      originX: 1.25,
      originY: 2.5,
      originZ: -3.75,
      targetX: 6.5,
      targetY: 0.25,
      targetZ: 8.75,
    })
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE).toBe(0.34)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA).toBe(0.9)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE).toBe(8.4)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY).toBe(0.5)
  })
})
