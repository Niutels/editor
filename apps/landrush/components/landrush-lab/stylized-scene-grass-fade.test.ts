import { describe, expect, test } from 'bun:test'
import {
  advanceStylizedGrassFadeVisibility,
  resolveStylizedGrassFadeSpatialVisibility,
} from './stylized-scene-grass-fade'

describe('stylized grass fade timing', () => {
  test('keeps up with a long mobile frame instead of discarding elapsed time', () => {
    expect(advanceStylizedGrassFadeVisibility(1, 0, 0.25)).toBeCloseTo(0.818_181_8)
    expect(advanceStylizedGrassFadeVisibility(1, 0, 1.5)).toBe(0)
  })

  test('advances identically when the same wall time is split across frames', () => {
    const oneStep = advanceStylizedGrassFadeVisibility(1, 0, 0.9)
    const splitStep = advanceStylizedGrassFadeVisibility(
      advanceStylizedGrassFadeVisibility(1, 0, 0.3),
      0,
      0.6,
    )
    expect(splitStep).toBeCloseTo(oneStep)
  })
})

describe('stylized grass blocker feather', () => {
  test('keeps the parcel interior hidden and eases the exterior edge', () => {
    expect(resolveStylizedGrassFadeSpatialVisibility(-0.1, 0.24)).toBe(0)
    expect(resolveStylizedGrassFadeSpatialVisibility(0, 0.24)).toBe(0)
    expect(resolveStylizedGrassFadeSpatialVisibility(0.12, 0.24)).toBeCloseTo(0.5)
    expect(resolveStylizedGrassFadeSpatialVisibility(0.24, 0.24)).toBe(1)
  })
})
