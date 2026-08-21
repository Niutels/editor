import { describe, expect, test } from 'bun:test'
import {
  advanceOrbotAnimationDebugBlend,
  ORBOT_ANIMATION_DEBUG_TRACK_LENGTH,
  resolveOrbotAnimationDebugBlendTargets,
  sampleOrbotAnimationDebugTrack,
} from './orbot-animation-debug-motion'

describe('Orbot animation debug motion', () => {
  test('samples a deterministic closed track with unit tangents', () => {
    const first = sampleOrbotAnimationDebugTrack(3.25, 47)
    const repeated = sampleOrbotAnimationDebugTrack(3.25, 47)
    const wrapped = sampleOrbotAnimationDebugTrack(3.25 + ORBOT_ANIMATION_DEBUG_TRACK_LENGTH, 47)

    expect(repeated).toEqual(first)
    expect(wrapped.position[0]).toBeCloseTo(first.position[0], 10)
    expect(wrapped.position[2]).toBeCloseTo(first.position[2], 10)
    expect(Math.hypot(first.tangent[0], first.tangent[2])).toBeCloseTo(1, 10)
    expect(wrapped.lap).toBe(first.lap + 1)
  })

  test('matches production-style idle, walk, and run targets', () => {
    expect(resolveOrbotAnimationDebugBlendTargets('auto', 0)).toEqual({
      idle: 1,
      run: 0,
      walk: 0,
    })
    expect(resolveOrbotAnimationDebugBlendTargets('walk', 8)).toEqual({
      idle: 0,
      run: 0,
      walk: 1,
    })
    expect(resolveOrbotAnimationDebugBlendTargets('run', 0)).toEqual({
      idle: 0,
      run: 1,
      walk: 0,
    })

    const automaticRun = resolveOrbotAnimationDebugBlendTargets('auto', 4.8)
    expect(automaticRun.idle + automaticRun.walk + automaticRun.run).toBeCloseTo(1, 10)
    expect(automaticRun.run).toBeCloseTo(1, 10)
  })

  test('exponential blend response is frame-rate independent', () => {
    const target = { idle: 0, run: 1, walk: 0 }
    const simulate = (steps: number) => {
      let blend = { idle: 1, run: 0, walk: 0 }
      for (let frame = 0; frame < steps; frame += 1) {
        blend = advanceOrbotAnimationDebugBlend(blend, target, 8, 1 / steps)
      }
      return blend
    }

    const at30Fps = simulate(30)
    const at144Fps = simulate(144)
    expect(at30Fps.idle).toBeCloseTo(at144Fps.idle, 10)
    expect(at30Fps.run).toBeCloseTo(at144Fps.run, 10)
    expect(at30Fps.walk).toBeCloseTo(at144Fps.walk, 10)
  })
})
