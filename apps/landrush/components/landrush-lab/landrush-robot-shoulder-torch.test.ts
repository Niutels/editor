import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LinearFilter } from 'three'
import {
  createLandrushRobotShoulderTorchLightingState,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FIN_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_LOBE_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_OPACITY,
  LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_LENS_EMISSIVE_INTENSITY,
  LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY,
  LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA,
  LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  LANDRUSH_ROBOT_SHOULDER_TORCH_SPOT_INTENSITY,
  resolveLandrushRobotShoulderTorchContribution,
  resolveLandrushRobotShoulderTorchGeometryBudget,
  updateLandrushRobotShoulderTorchGroundTarget,
  updateLandrushRobotShoulderTorchLightingState,
  updateLandrushRobotShoulderTorchLobeTargets,
} from './landrush-robot-shoulder-torch'
import {
  createLandrushRobotShoulderTorchPixelTexture,
  resolveLandrushRobotShoulderTorchBeamEnvelope,
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

  test('keeps one physical spotlight behind the two visual beam lobes', () => {
    const source = readFileSync(
      new URL('./landrush-robot-shoulder-torch-rig.tsx', import.meta.url),
      'utf8',
    )
    expect(source.match(/<spotLight\b/g)).toHaveLength(1)
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
      expect(budget.textureBytes).toBe(256)
    }
    expect(resolveLandrushRobotShoulderTorchGeometryBudget().pairFixtureTriangles).toBe(
      resolveLandrushRobotShoulderTorchGeometryBudget(LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN)
        .pairFixtureTriangles,
    )
    expect(resolveLandrushRobotShoulderTorchGeometryBudget().beamTriangles).toBe(12)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FIN_COUNT).toBe(3)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_LOBE_COUNT).toBe(2)
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

  test('separates two visual lobes around the unified real-light target', () => {
    const leftTarget = { x: 0, y: 0, z: 0 }
    const rightTarget = { x: 0, y: 0, z: 0 }
    const centerTarget = { x: 8, y: 0.035, z: 2.4 }
    const leftOrigin = { x: 7.7, z: -3 }
    const rightOrigin = { x: 8.3, z: -3 }
    const lateralOffset = updateLandrushRobotShoulderTorchLobeTargets(
      leftTarget,
      rightTarget,
      centerTarget,
      leftOrigin,
      rightOrigin,
      0,
      5.4,
    )

    expect(lateralOffset).toBeCloseTo(
      0.3 + Math.tan(LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE) * 5.4,
    )
    expect(leftTarget.x).toBeCloseTo(centerTarget.x - lateralOffset)
    expect(rightTarget.x).toBeCloseTo(centerTarget.x + lateralOffset)
    expect(leftOrigin.x - leftTarget.x).toBeCloseTo(
      Math.tan(LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE) * 5.4,
    )
    expect(rightTarget.x - rightOrigin.x).toBeCloseTo(
      Math.tan(LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE) * 5.4,
    )
    expect(leftTarget.y).toBe(centerTarget.y)
    expect(rightTarget.y).toBe(centerTarget.y)
    expect(leftTarget.z).toBeCloseTo(centerTarget.z)
    expect(rightTarget.z).toBeCloseTo(centerTarget.z)
  })

  test('feathers both the sides and ends of each visual beam fin', () => {
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, 0.5)).toBe(1)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0, 0.5)).toBe(0)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(1, 0.5)).toBe(0)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, 0)).toBe(0)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.5, 1)).toBe(0)
    expect(resolveLandrushRobotShoulderTorchBeamEnvelope(0.1, 0.5)).toBeLessThan(
      resolveLandrushRobotShoulderTorchBeamEnvelope(0.25, 0.5),
    )
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
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE).toBe(0.045)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE).toBe(8.4)
    expect(LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY).toBe(0.5)
  })
})
