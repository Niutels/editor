import { type Camera, MathUtils } from 'three'

export const LANDRUSH_ROBOT_SCREEN_REVEAL_BODY_RADIUS_METERS = 0.3
export const LANDRUSH_ROBOT_SCREEN_REVEAL_BASE_OFFSET_METERS = -1
export const LANDRUSH_ROBOT_SCREEN_REVEAL_TOP_OFFSET_METERS = 1

type LandrushRevealPerspectiveCamera = Camera & {
  fov: number
  isPerspectiveCamera: true
  zoom: number
}

type LandrushRevealOrthographicCamera = Camera & {
  bottom: number
  isOrthographicCamera: true
  top: number
  zoom: number
}

export function projectLandrushRobotScreenRevealRadius({
  bodyRadius = LANDRUSH_ROBOT_SCREEN_REVEAL_BODY_RADIUS_METERS,
  bottomOffset = LANDRUSH_ROBOT_SCREEN_REVEAL_BASE_OFFSET_METERS,
  camera,
  topOffset = LANDRUSH_ROBOT_SCREEN_REVEAL_TOP_OFFSET_METERS,
  viewportHeight,
  viewportWidth,
  zoomDistance,
}: {
  bodyRadius?: number
  bottomOffset?: number
  camera: Camera
  topOffset?: number
  viewportHeight: number
  viewportWidth: number
  zoomDistance: number
}) {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(bodyRadius) ||
    !Number.isFinite(bottomOffset) ||
    !Number.isFinite(topOffset) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    bodyRadius <= 0 ||
    bottomOffset >= topOffset
  ) {
    return 0
  }

  const boundingRadius = Math.max(
    Math.hypot(bodyRadius, bottomOffset),
    Math.hypot(bodyRadius, topOffset),
  )

  if (isLandrushRevealPerspectiveCamera(camera)) {
    if (
      !Number.isFinite(zoomDistance) ||
      !Number.isFinite(camera.fov) ||
      !Number.isFinite(camera.zoom) ||
      zoomDistance <= boundingRadius ||
      camera.fov <= 0 ||
      camera.fov >= 180 ||
      camera.zoom <= 0
    ) {
      return 0
    }

    // The authored zoom distance owns reveal scale; follow lag and subject translation must not.
    const focalLengthPx =
      (viewportHeight * camera.zoom) / (2 * Math.tan(MathUtils.degToRad(camera.fov * 0.5)))
    return (
      (focalLengthPx * boundingRadius) /
      Math.sqrt(zoomDistance * zoomDistance - boundingRadius * boundingRadius)
    )
  }

  if (isLandrushRevealOrthographicCamera(camera)) {
    const verticalSpan = camera.top - camera.bottom
    if (
      !Number.isFinite(verticalSpan) ||
      !Number.isFinite(camera.zoom) ||
      verticalSpan <= 0 ||
      camera.zoom <= 0
    ) {
      return 0
    }
    return (boundingRadius * viewportHeight * camera.zoom) / verticalSpan
  }

  return 0
}

function isLandrushRevealPerspectiveCamera(
  camera: Camera,
): camera is LandrushRevealPerspectiveCamera {
  return (camera as Partial<LandrushRevealPerspectiveCamera>).isPerspectiveCamera === true
}

function isLandrushRevealOrthographicCamera(
  camera: Camera,
): camera is LandrushRevealOrthographicCamera {
  return (camera as Partial<LandrushRevealOrthographicCamera>).isOrthographicCamera === true
}
