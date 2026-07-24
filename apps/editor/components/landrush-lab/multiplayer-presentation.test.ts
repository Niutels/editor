import { describe, expect, it } from 'vitest'
import {
  frameIndependentResponseAmount,
  shouldContinueRemotePresentation,
  viewAnglesFromDirection,
} from './multiplayer-presentation'

function converge(responsePerSecond: number, frameRate: number, seconds: number) {
  const deltaSeconds = 1 / frameRate
  let value = 0
  for (let frame = 0; frame < frameRate * seconds; frame += 1) {
    value += (1 - value) * frameIndependentResponseAmount(responsePerSecond, deltaSeconds)
  }
  return value
}

describe('multiplayer presentation timing', () => {
  it('converges consistently across frame rates', () => {
    const at30Fps = converge(12, 30, 1)
    const at120Fps = converge(12, 120, 1)

    expect(at30Fps).toBeCloseTo(at120Fps, 10)
    expect(at30Fps).toBeCloseTo(1 - Math.exp(-12), 10)
  })

  it('keeps frames alive only for movement, reconciliation, or blend settling', () => {
    expect(
      shouldContinueRemotePresentation({
        animationSettleSeconds: 0,
        headingErrorRadians: 0,
        moving: false,
        positionErrorSq: 0,
      }),
    ).toBe(false)

    for (const activity of [
      {
        animationSettleSeconds: 0,
        headingErrorRadians: 0,
        moving: true,
        positionErrorSq: 0,
      },
      {
        animationSettleSeconds: 0.1,
        headingErrorRadians: 0,
        moving: false,
        positionErrorSq: 0,
      },
      {
        animationSettleSeconds: 0,
        headingErrorRadians: 0.01,
        moving: false,
        positionErrorSq: 0,
      },
      {
        animationSettleSeconds: 0,
        headingErrorRadians: 0,
        moving: false,
        positionErrorSq: 0.01,
      },
    ]) {
      expect(shouldContinueRemotePresentation(activity)).toBe(true)
    }
  })

  it('recovers first-person yaw and pitch from the active camera direction', () => {
    const yaw = Math.PI / 3
    const pitch = -Math.PI / 6
    const pitchCos = Math.cos(pitch)
    const angles = viewAnglesFromDirection({
      x: Math.sin(yaw) * pitchCos,
      y: Math.sin(pitch),
      z: Math.cos(yaw) * pitchCos,
    })

    expect(angles.yaw).toBeCloseTo(yaw, 10)
    expect(angles.pitch).toBeCloseTo(pitch, 10)
  })
})
