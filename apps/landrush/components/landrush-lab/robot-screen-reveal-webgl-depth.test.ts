import { describe, expect, test } from 'bun:test'
import { Plane, Vector3 } from 'three'
import {
  disableLandrushRobotScreenRevealWebGLDepthPlane,
  updateLandrushRobotScreenRevealWebGLDepthPlane,
} from './robot-screen-reveal-webgl-depth'

const CAMERA = new Vector3(23.8040588487, 15.3712451319, 11.703069584)
const ROBOT_CENTER = new Vector3(25.6120394471, 1.08, 22.819494591)
const ROBOT_NEAR_DEPTH = 17.9956969143944

describe('Landrush robot WebGL reveal depth plane', () => {
  test('clips the supplied parcel-11 foreground wall but preserves its rear wall', () => {
    const cameraForward = ROBOT_CENTER.clone().sub(CAMERA).normalize()
    const plane = new Plane()
    expect(
      updateLandrushRobotScreenRevealWebGLDepthPlane({
        cameraForward,
        cameraPosition: CAMERA,
        plane,
        robotNearDepth: ROBOT_NEAR_DEPTH,
      }),
    ).toBe(true)

    const foregroundVertices = wallVertices([31, 20], [17, 17])
    const rearVertices = wallVertices([17, 27], [28.5, 27])
    expect(
      Math.max(...foregroundVertices.map((point) => plane.distanceToPoint(point))),
    ).toBeLessThan(0)
    expect(Math.min(...rearVertices.map((point) => plane.distanceToPoint(point)))).toBeGreaterThan(
      0,
    )
  })

  test('uses a non-clipping fail-open plane for invalid frame data', () => {
    const plane = new Plane()
    expect(
      updateLandrushRobotScreenRevealWebGLDepthPlane({
        cameraForward: { x: 0, y: 0, z: 0 },
        cameraPosition: CAMERA,
        plane,
        robotNearDepth: Number.NaN,
      }),
    ).toBe(false)
    expect(plane.distanceToPoint(CAMERA)).toBeGreaterThan(0)

    disableLandrushRobotScreenRevealWebGLDepthPlane(plane)
    expect(plane.distanceToPoint(ROBOT_CENTER)).toBeGreaterThan(0)
  })
})

function wallVertices(start: readonly [number, number], end: readonly [number, number]) {
  return [
    new Vector3(start[0], 0, start[1]),
    new Vector3(start[0], 2.55, start[1]),
    new Vector3(end[0], 0, end[1]),
    new Vector3(end[0], 2.55, end[1]),
  ]
}
