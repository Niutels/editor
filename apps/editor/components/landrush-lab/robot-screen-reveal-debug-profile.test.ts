import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushRobotScreenRevealAmount,
  compensateLandrushRobotScreenRevealLayerOpacity,
  sampleLandrushRobotScreenRevealGrowthScale,
  sampleLandrushRobotScreenRevealRadialOpacity,
} from './robot-screen-reveal-curve'
import { measureRobotScreenRevealProfile } from './robot-screen-reveal-debug-profile'

describe('robot screen reveal debug profile', () => {
  test('100 percent smoothness eases both fixed endpoints without moving them', () => {
    const controls = {
      innerRadiusPx: 100,
      outerRadiusPx: 300,
      smoothnessPercent: 100,
    }
    expect(
      sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 120 }),
    ).toBeCloseTo(0.028, 10)
    expect(
      sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 200 }),
    ).toBeCloseTo(0.5, 10)
    expect(
      sampleLandrushRobotScreenRevealRadialOpacity({ ...controls, distancePx: 280 }),
    ).toBeCloseTo(0.972, 10)
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

  test('smoothness removes endpoint slope without concentrating the fade into a threshold', () => {
    const endpointSmooth = measureRobotScreenRevealProfile({
      innerRadiusPx: 100,
      mode: 'soft-mask',
      outerRadiusPx: 300,
      smoothnessPercent: 100,
    })
    const linear = measureRobotScreenRevealProfile({
      innerRadiusPx: 100,
      mode: 'soft-mask',
      outerRadiusPx: 300,
      smoothnessPercent: 0,
    })
    expect(endpointSmooth.endpointSlope).toBe(0)
    expect(linear.endpointSlope).toBe(1)
    expect(endpointSmooth.slopeConcentration).toBeCloseTo(1.5, 2)
    expect(endpointSmooth.slopeConcentration).toBeLessThan(1.51)
    expect(linear.visibleOnsetOffsetPx).toBeLessThan(1)
    expect(endpointSmooth.visibleOnsetOffsetPx).toBeLessThan(8)
  })

  test('layer compensation preserves the intended opacity after repeated blending', () => {
    for (const opacity of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const perLayerOpacity = compensateLandrushRobotScreenRevealLayerOpacity(opacity, 8)
      const compositedOpacity = 1 - (1 - perLayerOpacity) ** 8
      expect(compositedOpacity).toBeCloseTo(opacity, 10)
    }
  })

  test('fade-in remains visible over several rendered frames', () => {
    let amount = 0
    const samples: number[] = []
    for (let frame = 0; frame < 30; frame += 1) {
      amount = advanceLandrushRobotScreenRevealAmount({
        amount,
        deltaSeconds: 1 / 60,
        response: 5.5,
        target: 1,
      })
      samples.push(amount)
    }
    expect(samples[0]).toBeGreaterThan(0.08)
    expect(samples[0]).toBeLessThan(0.1)
    expect(samples[5]).toBeGreaterThan(0.4)
    expect(samples[5]).toBeLessThan(0.45)
    expect(samples[29]).toBeGreaterThan(0.93)
    expect(samples[29]).toBeLessThan(0.94)
  })

  test('the reveal footprint grows smoothly from a smaller radius', () => {
    const scales = [0, 0.25, 0.5, 0.75, 1].map((amount) =>
      sampleLandrushRobotScreenRevealGrowthScale({ amount, startScale: 0.34 }),
    )
    expect(scales[0]).toBeCloseTo(0.34, 10)
    expect(scales[2]).toBeCloseTo(0.67, 10)
    expect(scales[4]).toBe(1)
    expect(scales).toEqual([...scales].sort((left, right) => left - right))
  })
})
