import { describe, expect, test } from 'bun:test'
import { isBVHEcctrlSupportCandidateEligible } from './bvh-ecctrl-support'

const defaults = {
  currentFootHeight: 0,
  grounded: true,
  landingSkin: 0.03,
  maxStepHeight: 0.28,
  previousFootHeight: 0,
  verticalVelocity: 0,
}

describe('BVHEcctrl support eligibility', () => {
  test('accepts a stair step but never treats a table above the feet as ground support', () => {
    expect(isBVHEcctrlSupportCandidateEligible({ ...defaults, candidateHeight: 0.17 })).toBe(true)
    expect(isBVHEcctrlSupportCandidateEligible({ ...defaults, candidateHeight: 0.8 })).toBe(false)
  })

  test('retains nearby grounded support while moving uphill but rejects airborne ascent', () => {
    expect(
      isBVHEcctrlSupportCandidateEligible({
        ...defaults,
        candidateHeight: 0.17,
        verticalVelocity: 1.4,
      }),
    ).toBe(true)
    expect(
      isBVHEcctrlSupportCandidateEligible({
        ...defaults,
        candidateHeight: 0.17,
        grounded: false,
        verticalVelocity: 4,
      }),
    ).toBe(false)
  })

  test('climbs the same walkable ramp at low and high render rates', () => {
    const fixedDelta = 1 / 60
    const rampLength = 3
    const rampHeight = 2.5
    const walkSpeed = 4.25
    const uphillVelocity = (rampHeight / rampLength) * walkSpeed

    const climbAtRenderRate = (framesPerSecond: number) => {
      let accumulator = 0
      let distance = 0
      let footHeight = 0
      for (let frame = 0; frame < framesPerSecond; frame += 1) {
        accumulator += 1 / framesPerSecond
        while (accumulator + Number.EPSILON >= fixedDelta) {
          const nextDistance = Math.min(rampLength, distance + walkSpeed * fixedDelta)
          const candidateHeight = (nextDistance / rampLength) * rampHeight
          expect(
            isBVHEcctrlSupportCandidateEligible({
              ...defaults,
              candidateHeight,
              currentFootHeight: footHeight,
              previousFootHeight: footHeight,
              verticalVelocity: uphillVelocity,
            }),
          ).toBe(true)
          distance = nextDistance
          footHeight = candidateHeight
          accumulator -= fixedDelta
        }
      }
      return footHeight
    }

    for (const framesPerSecond of [10, 15, 30, 60]) {
      expect(climbAtRenderRate(framesPerSecond)).toBeCloseTo(rampHeight, 8)
    }
  })

  test('rejects an upward foot sweep after ceiling contact zeroes vertical velocity', () => {
    expect(
      isBVHEcctrlSupportCandidateEligible({
        candidateHeight: 0.05,
        currentFootHeight: 0.1,
        grounded: false,
        landingSkin: 0.03,
        maxStepHeight: 0.28,
        previousFootHeight: 0,
        verticalVelocity: 0,
      }),
    ).toBe(false)
  })

  test('lands on a table only when descending feet sweep through its top', () => {
    expect(
      isBVHEcctrlSupportCandidateEligible({
        ...defaults,
        candidateHeight: 0.8,
        currentFootHeight: 0.76,
        grounded: false,
        previousFootHeight: 0.85,
        verticalVelocity: -4,
      }),
    ).toBe(true)
    expect(
      isBVHEcctrlSupportCandidateEligible({
        ...defaults,
        candidateHeight: 0.8,
        currentFootHeight: 0.9,
        grounded: false,
        previousFootHeight: 1,
        verticalVelocity: -2,
      }),
    ).toBe(false)
  })

  test('rejects an upper slab outside the swept-foot interval', () => {
    expect(
      isBVHEcctrlSupportCandidateEligible({
        ...defaults,
        candidateHeight: 2.55,
        currentFootHeight: 0.78,
        grounded: false,
        previousFootHeight: 0.86,
        verticalVelocity: -3,
      }),
    ).toBe(false)
  })
})
