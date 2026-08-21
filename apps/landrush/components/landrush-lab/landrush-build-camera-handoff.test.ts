import { describe, expect, test } from 'bun:test'
import { advanceLandrushBuildCameraHandoff } from './landrush-build-camera-handoff'

describe('Landrush build camera handoff', () => {
  test('keeps the settled transition pose until camera interaction is ready', () => {
    expect(
      advanceLandrushBuildCameraHandoff({
        cameraControlsAvailable: true,
        cameraControlsReady: false,
        controlHandoffFrames: 0,
      }),
    ).toEqual({
      applySettledPose: true,
      controlHandoffFrames: 0,
      handoffComplete: false,
      seedCameraControls: false,
    })
  })

  test('releases the transition immediately when no camera controls exist', () => {
    expect(
      advanceLandrushBuildCameraHandoff({
        cameraControlsAvailable: false,
        cameraControlsReady: true,
        controlHandoffFrames: 0,
      }),
    ).toEqual({
      applySettledPose: false,
      controlHandoffFrames: 0,
      handoffComplete: true,
      seedCameraControls: false,
    })
  })

  test('seeds available camera controls for three frames before releasing', () => {
    let controlHandoffFrames = 0

    for (const handoffComplete of [false, false, true]) {
      const step = advanceLandrushBuildCameraHandoff({
        cameraControlsAvailable: true,
        cameraControlsReady: true,
        controlHandoffFrames,
      })
      controlHandoffFrames = step.controlHandoffFrames

      expect(step).toEqual({
        applySettledPose: true,
        controlHandoffFrames,
        handoffComplete,
        seedCameraControls: true,
      })
    }

    expect(controlHandoffFrames).toBe(3)
  })
})
