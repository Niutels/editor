import { describe, expect, test } from 'bun:test'
import { resolveLandrushRobotJumpPose } from './landrush-robot-jump'

describe('resolveLandrushRobotJumpPose', () => {
  test('keeps the root grounded while the knees preload and after touchdown', () => {
    const preload = resolveLandrushRobotJumpPose(0.17)
    const touchdown = resolveLandrushRobotJumpPose(0.78)

    expect(preload.phase).toBe('anticipation')
    expect(preload.rootAltitudeScale).toBe(0)
    expect(preload.kneePitch).toBeGreaterThan(0.85)
    expect(preload.bodyCompressionOffset).toBeGreaterThan(0.12)
    expect(touchdown.phase).toBe('landing')
    expect(touchdown.rootAltitudeScale).toBe(0)
  })

  test('adds a smaller knee tuck after takeoff and a deeper landing compression', () => {
    const takeoff = resolveLandrushRobotJumpPose(0.3)
    const airborne = resolveLandrushRobotJumpPose(0.5)
    const impact = resolveLandrushRobotJumpPose(0.86)

    expect(takeoff.phase).toBe('flight')
    expect(airborne.kneePitch).toBeGreaterThan(takeoff.kneePitch)
    expect(impact.phase).toBe('recovery')
    expect(impact.kneePitch).toBe(1)
  })

  test('prepares the landing pose before touchdown', () => {
    const approach = resolveLandrushRobotJumpPose(0.7)

    expect(approach.phase).toBe('landing')
    expect(approach.rootAltitudeScale).toBeGreaterThan(0)
    expect(approach.kneePitch).toBeGreaterThan(0.25)
    expect(approach.bodyCompressionOffset).toBeGreaterThan(0.02)
  })

  test('reaches a smooth apex and an exact terminal pose', () => {
    const apex = resolveLandrushRobotJumpPose(0.48)
    const complete = resolveLandrushRobotJumpPose(1)

    expect(apex.rootAltitudeScale).toBeCloseTo(1, 6)
    expect(complete).toEqual({
      armPitch: 0,
      bodyCompressionOffset: 0,
      footPitch: 0,
      kneePitch: 0,
      phase: 'complete',
      progress: 1,
      rootAltitudeScale: 0,
      spinePitch: 0,
      upperLegPitch: 0,
    })
  })
})
