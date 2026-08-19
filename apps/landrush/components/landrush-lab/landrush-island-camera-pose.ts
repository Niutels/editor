import { type Camera, Quaternion, Vector3 } from 'three'
import type { LandrushBugReportCamera } from './landrush-bug-report'

export type LandrushIslandCameraPose = {
  distance: number
  pitch: number
  position: Vector3
  quaternion: Quaternion
  target: Vector3
  yaw: number
  zoom?: number | null
}

type LandrushIslandOrthographicCamera = Camera & {
  isOrthographicCamera: true
  updateProjectionMatrix: () => void
  zoom: number
}

export function setLandrushIslandMapCameraZoom(camera: Camera, zoom: number) {
  if (!isLandrushIslandOrthographicCamera(camera)) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}

export function isLandrushIslandOrthographicCamera(
  camera: Camera,
): camera is LandrushIslandOrthographicCamera {
  return (camera as Partial<LandrushIslandOrthographicCamera>).isOrthographicCamera === true
}

export function applyLandrushIslandCameraPose(
  camera: Camera,
  pose: LandrushIslandCameraPose | null,
  fallbackTarget: readonly [number, number, number] = [0, 0, 0],
) {
  camera.up.set(0, 1, 0)
  if (pose) {
    camera.position.copy(pose.position)
    camera.quaternion.copy(pose.quaternion)
  } else {
    camera.lookAt(fallbackTarget[0], fallbackTarget[1], fallbackTarget[2])
  }
  camera.updateMatrixWorld()
}

export function createLandrushIslandCameraPose(
  camera: Camera,
  target: Vector3,
): LandrushIslandCameraPose {
  const pose: LandrushIslandCameraPose = {
    distance: 0,
    pitch: 0,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: target.clone(),
    yaw: 0,
    zoom: isLandrushIslandOrthographicCamera(camera) ? camera.zoom : null,
  }
  updateLandrushIslandCameraPoseOrbit(pose)
  return pose
}

export function cloneLandrushIslandCameraPose(
  pose: LandrushIslandCameraPose | null,
): LandrushIslandCameraPose | null {
  if (!pose) return null
  return {
    distance: pose.distance,
    pitch: pose.pitch,
    position: pose.position.clone(),
    quaternion: pose.quaternion.clone(),
    target: pose.target.clone(),
    yaw: pose.yaw,
    zoom: pose.zoom ?? null,
  }
}

export function serializeLandrushBugReportCameraPose(
  pose: LandrushIslandCameraPose,
): LandrushBugReportCamera {
  return {
    distance: pose.distance,
    pitch: pose.pitch,
    position: [pose.position.x, pose.position.y, pose.position.z],
    quaternion: [pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w],
    target: [pose.target.x, pose.target.y, pose.target.z],
    yaw: pose.yaw,
    zoom: pose.zoom ?? null,
  }
}

export function deserializeLandrushBugReportCameraPose(
  camera: LandrushBugReportCamera | null,
): LandrushIslandCameraPose | null {
  if (!camera) return null
  return {
    distance: camera.distance,
    pitch: camera.pitch,
    position: new Vector3(...camera.position),
    quaternion: new Quaternion(...camera.quaternion),
    target: new Vector3(...camera.target),
    yaw: camera.yaw,
    zoom: camera.zoom,
  }
}

export function writeLandrushIslandCameraPose(
  poseRef: { current: LandrushIslandCameraPose | null },
  camera: Camera,
  target: Vector3,
) {
  let pose = poseRef.current
  if (!pose) {
    pose = {
      distance: 0,
      pitch: 0,
      position: new Vector3(),
      quaternion: new Quaternion(),
      target: new Vector3(),
      yaw: 0,
    }
    poseRef.current = pose
  }

  pose.position.copy(camera.position)
  pose.quaternion.copy(camera.quaternion)
  pose.target.copy(target)
  pose.zoom = isLandrushIslandOrthographicCamera(camera) ? camera.zoom : null
  updateLandrushIslandCameraPoseOrbit(pose)
}

export function updateLandrushIslandCameraPoseOrbit(pose: LandrushIslandCameraPose) {
  const offsetX = pose.position.x - pose.target.x
  const offsetY = pose.position.y - pose.target.y
  const offsetZ = pose.position.z - pose.target.z
  const horizontalDistance = Math.hypot(offsetX, offsetZ)
  pose.yaw = Math.atan2(offsetX, offsetZ)
  pose.pitch = Math.atan2(offsetY, horizontalDistance)
  pose.distance = Math.hypot(horizontalDistance, offsetY)
}
