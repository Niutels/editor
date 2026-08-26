import type { Plane } from 'three'

const WEBGL_REVEAL_FAIL_OPEN_PLANE_CONSTANT = 1_000_000

type Point3 = Readonly<{ x: number; y: number; z: number }>

export function updateLandrushRobotScreenRevealWebGLDepthPlane({
  cameraForward,
  cameraPosition,
  plane,
  robotNearDepth,
}: {
  cameraForward: Point3
  cameraPosition: Point3
  plane: Plane
  robotNearDepth: number
}) {
  const length = Math.hypot(cameraForward.x, cameraForward.y, cameraForward.z)
  if (
    !pointIsFinite(cameraForward) ||
    !pointIsFinite(cameraPosition) ||
    !Number.isFinite(robotNearDepth) ||
    robotNearDepth <= 0 ||
    length <= Number.EPSILON
  ) {
    disableLandrushRobotScreenRevealWebGLDepthPlane(plane)
    return false
  }

  const normalX = cameraForward.x / length
  const normalY = cameraForward.y / length
  const normalZ = cameraForward.z / length
  plane.normal.set(normalX, normalY, normalZ)
  plane.constant =
    -(normalX * cameraPosition.x + normalY * cameraPosition.y + normalZ * cameraPosition.z) -
    robotNearDepth
  return true
}

export function disableLandrushRobotScreenRevealWebGLDepthPlane(plane: Plane) {
  plane.normal.set(0, 1, 0)
  plane.constant = WEBGL_REVEAL_FAIL_OPEN_PLANE_CONSTANT
  return plane
}

function pointIsFinite(point: Point3) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
}
