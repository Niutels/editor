import { describe, expect, test } from 'bun:test'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import {
  applyLandrushIslandCameraPose,
  cloneLandrushIslandCameraPose,
  createLandrushIslandCameraPose,
  deserializeLandrushBugReportCameraPose,
  serializeLandrushBugReportCameraPose,
  setLandrushIslandMapCameraZoom,
} from './landrush-island-camera-pose'

describe('Landrush island camera pose', () => {
  test('round-trips bug-report camera data without sharing mutable vectors', () => {
    const camera = new PerspectiveCamera()
    camera.position.set(8, 6, 4)
    camera.lookAt(1, 2, 3)
    camera.updateMatrixWorld(true)
    const pose = createLandrushIslandCameraPose(camera, new Vector3(1, 2, 3))
    const clone = cloneLandrushIslandCameraPose(pose)
    const restored = deserializeLandrushBugReportCameraPose(
      serializeLandrushBugReportCameraPose(pose),
    )

    expect(restored?.position.toArray()).toEqual(pose.position.toArray())
    expect(restored?.target.toArray()).toEqual(pose.target.toArray())
    expect(restored?.quaternion.toArray()).toEqual(pose.quaternion.toArray())
    clone?.position.set(0, 0, 0)
    expect(pose.position.toArray()).toEqual([8, 6, 4])
  })

  test('applies perspective poses and updates orthographic zoom only where supported', () => {
    const perspective = new PerspectiveCamera()
    perspective.position.set(3, 4, 5)
    perspective.lookAt(0, 0, 0)
    perspective.updateMatrixWorld(true)
    const pose = createLandrushIslandCameraPose(perspective, new Vector3())
    const targetCamera = new PerspectiveCamera()

    applyLandrushIslandCameraPose(targetCamera, pose)
    expect(targetCamera.position.toArray()).toEqual([3, 4, 5])

    const orthographic = new OrthographicCamera()
    setLandrushIslandMapCameraZoom(orthographic, 9)
    setLandrushIslandMapCameraZoom(targetCamera, 12)
    expect(orthographic.zoom).toBe(9)
    expect(targetCamera.zoom).toBe(1)
  })
})
