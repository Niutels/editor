const LANDRUSH_BUILD_CAMERA_CONTROL_HANDOFF_FRAMES = 3

export type LandrushBuildCameraHandoffInput = {
  cameraControlsAvailable: boolean
  cameraControlsReady: boolean
  controlHandoffFrames: number
}

export type LandrushBuildCameraHandoffStep = {
  applySettledPose: boolean
  controlHandoffFrames: number
  handoffComplete: boolean
  seedCameraControls: boolean
}

export function advanceLandrushBuildCameraHandoff({
  cameraControlsAvailable,
  cameraControlsReady,
  controlHandoffFrames,
}: LandrushBuildCameraHandoffInput): LandrushBuildCameraHandoffStep {
  if (!cameraControlsReady) {
    return {
      applySettledPose: true,
      controlHandoffFrames,
      handoffComplete: false,
      seedCameraControls: false,
    }
  }

  if (!cameraControlsAvailable) {
    return {
      applySettledPose: false,
      controlHandoffFrames,
      handoffComplete: true,
      seedCameraControls: false,
    }
  }

  const nextControlHandoffFrames = Math.min(
    controlHandoffFrames + 1,
    LANDRUSH_BUILD_CAMERA_CONTROL_HANDOFF_FRAMES,
  )
  return {
    applySettledPose: true,
    controlHandoffFrames: nextControlHandoffFrames,
    handoffComplete: nextControlHandoffFrames >= LANDRUSH_BUILD_CAMERA_CONTROL_HANDOFF_FRAMES,
    seedCameraControls: true,
  }
}
