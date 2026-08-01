import { describe, expect, test } from 'bun:test'
import { sampleLandrushRobotScreenRevealRadialOpacity } from './robot-screen-reveal-curve'
import { measureRobotScreenRevealProfile } from './robot-screen-reveal-debug-profile'

describe('robot screen reveal debug profile', () => {
  test('100 percent smoothness is linear across fixed radii', () => {
    const controls = {
      innerRadiusPx: 100,
      outerRadiusPx: 300,
      smoothnessPercent: 100,
    }
    expect(
      sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 120 }),
    ).toBeCloseTo(0.1, 10)
    expect(
      sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 200 }),
    ).toBeCloseTo(0.5, 10)
    expect(
      sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 280 }),
    ).toBeCloseTo(0.9, 10)
  })

  test('softness never moves the exact endpoints or midpoint', () => {
    for (const smoothnessPercent of [0, 25, 50, 75, 100]) {
      const controls = {
        innerRadiusPx: 100,
        outerRadiusPx: 300,
        smoothnessPercent,
      }
      expect(sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 100 })).toBe(0)
      expect(
        sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 200 }),
      ).toBeCloseTo(0.5, 10)
      expect(sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 300 })).toBe(1)
    }
  })

  test('the hard threshold reports a full one-pixel opacity jump', () => {
    const measurement = measureRobotScreenRevealProfile({
      innerRadiusPx: 100,
      mode: 'hard-threshold',
      outerRadiusPx: 300,
      smoothnessPercent: 100,
    })
    expect(measurement.continuous).toBe(false)
    expect(measurement.maxDeltaPerPixel).toBe(1)
    expect(measurement.maxQuantizedStep).toBe(255)
  })

  test('maximum smoothness minimizes the soft-mask slope concentration', () => {
    const linear = measureRobotScreenRevealProfile({
      innerRadiusPx: 100,
      mode: 'soft-mask',
      outerRadiusPx: 300,
      smoothnessPercent: 100,
    })
    const concentrated = measureRobotScreenRevealProfile({
      innerRadiusPx: 100,
      mode: 'soft-mask',
      outerRadiusPx: 300,
      smoothnessPercent: 50,
    })
    expect(linear.slopeConcentration).toBeCloseTo(1, 2)
    expect(concentrated.slopeConcentration).toBeGreaterThan(4)
    expect(linear.visibleOnsetOffsetPx).toBeLessThan(1)
    expect(concentrated.visibleOnsetOffsetPx).toBeGreaterThan(30)
  })
})
