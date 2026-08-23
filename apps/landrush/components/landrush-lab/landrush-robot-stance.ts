const LANDRUSH_ISLAND_ROBOT_STANDING_STANCE = {
  cameraTargetHeight: 1.28,
  fpvEyeHeight: 1.58,
  totalClearance: 1.8,
} as const

const LANDRUSH_ISLAND_ROBOT_CROUCH_HEIGHT_SCALE = 0.5

export const LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE = {
  standing: LANDRUSH_ISLAND_ROBOT_STANDING_STANCE,
  crouching: {
    cameraTargetHeight:
      LANDRUSH_ISLAND_ROBOT_STANDING_STANCE.cameraTargetHeight *
      LANDRUSH_ISLAND_ROBOT_CROUCH_HEIGHT_SCALE,
    fpvEyeHeight:
      LANDRUSH_ISLAND_ROBOT_STANDING_STANCE.fpvEyeHeight *
      LANDRUSH_ISLAND_ROBOT_CROUCH_HEIGHT_SCALE,
    totalClearance:
      LANDRUSH_ISLAND_ROBOT_STANDING_STANCE.totalClearance *
      LANDRUSH_ISLAND_ROBOT_CROUCH_HEIGHT_SCALE,
  },
} as const

export function resolveLandrushIslandRobotStancePresentation(crouchAmount: number) {
  const amount = Math.max(0, Math.min(1, Number.isFinite(crouchAmount) ? crouchAmount : 0))
  const { crouching, standing } = LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE

  return {
    cameraTargetHeight:
      standing.cameraTargetHeight +
      (crouching.cameraTargetHeight - standing.cameraTargetHeight) * amount,
    fpvEyeHeight: standing.fpvEyeHeight + (crouching.fpvEyeHeight - standing.fpvEyeHeight) * amount,
    totalClearance:
      standing.totalClearance + (crouching.totalClearance - standing.totalClearance) * amount,
  }
}
