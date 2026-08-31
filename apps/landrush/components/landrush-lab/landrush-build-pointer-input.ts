export type LandrushBuildPointerIntent = {
  button: number
  cameraControlsActive: boolean
  cameraDragInProgress: boolean
  defaultPrevented: boolean
  insideCanvas: boolean
  interactiveTarget: boolean
}

export type LandrushBuildCameraDragAction = 'orbit' | 'pan'

export type LandrushBuildWheelIntent = Omit<LandrushBuildPointerIntent, 'button'>

export type LandrushBuildCameraOffsetBounds = {
  maxDistance: number
  maxHeight: number
  minDistance: number
  minHeight: number
}

export function shouldArmLandrushBuildRobotExit({
  editorPlacementActive,
  robotHit,
}: {
  editorPlacementActive: boolean
  robotHit: boolean
}) {
  return robotHit && !editorPlacementActive
}

export function shouldCommitLandrushBuildRobotExit({
  armed,
  editorPlacementActive,
  robotHit,
}: {
  armed: boolean
  editorPlacementActive: boolean
  robotHit: boolean
}) {
  return armed && robotHit && !editorPlacementActive
}

export function constrainLandrushBuildCameraOffset<
  TOffset extends { x: number; y: number; z: number },
>(offset: TOffset, bounds: LandrushBuildCameraOffsetBounds) {
  const rawDistance = Math.hypot(offset.x, offset.y, offset.z)
  const distance = Math.min(Math.max(rawDistance, bounds.minDistance), bounds.maxDistance)
  const maximumVerticalOffset = Math.min(bounds.maxHeight, distance * 0.995)
  const minimumVerticalOffset = Math.min(bounds.minHeight, maximumVerticalOffset)
  const verticalOffset = Math.min(Math.max(offset.y, minimumVerticalOffset), maximumVerticalOffset)
  const horizontalOffset = Math.sqrt(
    Math.max(0, distance * distance - verticalOffset * verticalOffset),
  )
  const currentHorizontalOffset = Math.hypot(offset.x, offset.z)
  if (currentHorizontalOffset < 0.0001) {
    offset.x = 0
    offset.y = verticalOffset
    offset.z = horizontalOffset
    return offset
  }

  const horizontalScale = horizontalOffset / currentHorizontalOffset
  offset.x *= horizontalScale
  offset.y = verticalOffset
  offset.z *= horizontalScale
  return offset
}

export function resolveLandrushBuildCameraDragAction(
  intent: LandrushBuildPointerIntent,
): LandrushBuildCameraDragAction | null {
  if (
    intent.defaultPrevented ||
    !intent.insideCanvas ||
    intent.interactiveTarget ||
    intent.cameraControlsActive ||
    intent.cameraDragInProgress
  ) {
    return null
  }

  if (intent.button === 2) return 'orbit'
  if (intent.button === 1) return 'pan'
  return null
}

export function shouldBeginLandrushBuildCameraOrbit(intent: LandrushBuildPointerIntent) {
  return resolveLandrushBuildCameraDragAction(intent) === 'orbit'
}

export function shouldHandleLandrushBuildCameraWheel(intent: LandrushBuildWheelIntent) {
  return (
    !intent.defaultPrevented &&
    intent.insideCanvas &&
    !intent.interactiveTarget &&
    !intent.cameraControlsActive &&
    !intent.cameraDragInProgress
  )
}

export function shouldSuppressLandrushBuildContextMenu({
  insideCanvas,
  interactiveTarget,
}: Pick<LandrushBuildPointerIntent, 'insideCanvas' | 'interactiveTarget'>) {
  return insideCanvas && !interactiveTarget
}
