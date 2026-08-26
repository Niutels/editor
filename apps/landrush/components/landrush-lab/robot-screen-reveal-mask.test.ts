import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearLandrushRobotScreenRevealMask,
  readLandrushRobotScreenRevealMaskSnapshot,
  sampleLandrushRobotScreenRevealDepthAmount,
  updateLandrushRobotScreenRevealMask,
} from './robot-screen-reveal-mask'

afterEach(() => clearLandrushRobotScreenRevealMask())

describe('Landrush robot screen reveal depth mask', () => {
  test('reveals only fragments before the player depth with a symmetric four-centimeter feather', () => {
    const robotNearDepth = 17.9956969143944

    expect(sampleLandrushRobotScreenRevealDepthAmount(17.857, robotNearDepth)).toBe(1)
    expect(sampleLandrushRobotScreenRevealDepthAmount(robotNearDepth, robotNearDepth)).toBeCloseTo(
      0.5,
      8,
    )
    expect(sampleLandrushRobotScreenRevealDepthAmount(18.739, robotNearDepth)).toBe(0)
  })

  test('fails open instead of revealing geometry when the depth threshold is invalid', () => {
    expect(sampleLandrushRobotScreenRevealDepthAmount(4, Number.NaN)).toBe(0)
    updateLandrushRobotScreenRevealMask({
      centerX: 100,
      centerY: 100,
      height: 200,
      innerRadius: 20,
      outerRadius: 40,
      robotNearDepth: Number.NaN,
      width: 200,
    })

    expect(readLandrushRobotScreenRevealMaskSnapshot().robotNearDepth).toBe(0)
  })
})
