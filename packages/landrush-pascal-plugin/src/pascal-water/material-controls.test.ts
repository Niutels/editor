import { describe, expect, test } from 'bun:test'
import {
  clearPascalWaterMaterialParameterOverrides,
  registerPascalWaterMaterialControls,
  setPascalWaterMaterialParameters,
} from './material-controls'

describe('Pascal water material controls', () => {
  test('applies rapid slider updates to one mounted material controller', () => {
    const nodeId = 'pascal-water_slider-test'
    const patches: Array<Record<string, unknown>> = []
    const unregister = registerPascalWaterMaterialControls(nodeId, {
      setParameters: (parameters) => patches.push(parameters),
    })

    for (let value = 2; value <= 30; value += 1) {
      expect(
        setPascalWaterMaterialParameters(nodeId, {
          frontCyanShallowBreakupResponseRate: 32 - value,
          frontCyanShallowSpeedResponseRate: value,
        }),
      ).toBe(true)
    }

    expect(patches).toHaveLength(29)
    expect(patches.at(-1)).toEqual({
      frontCyanShallowBreakupResponseRate: 2,
      frontCyanShallowSpeedResponseRate: 30,
    })

    unregister()
    clearPascalWaterMaterialParameterOverrides(nodeId)
  })

  test('replays parameters changed before the material mounts', () => {
    const nodeId = 'pascal-water_pending-test'
    const patches: Array<Record<string, unknown>> = []

    expect(
      setPascalWaterMaterialParameters(nodeId, {
        frontCyanShallowBreakupResponseRate: 7,
      }),
    ).toBe(false)
    const unregister = registerPascalWaterMaterialControls(nodeId, {
      setParameters: (parameters) => patches.push(parameters),
    })

    expect(patches).toEqual([{ frontCyanShallowBreakupResponseRate: 7 }])

    unregister()
    clearPascalWaterMaterialParameterOverrides(nodeId)
  })
})
