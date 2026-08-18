import { describe, expect, test } from 'bun:test'
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import {
  LANDRUSH_ROBOT_SCREEN_REVEAL_BASE_OFFSET_METERS,
  LANDRUSH_ROBOT_SCREEN_REVEAL_BODY_RADIUS_METERS,
  LANDRUSH_ROBOT_SCREEN_REVEAL_TOP_OFFSET_METERS,
  projectLandrushRobotScreenRevealRadius,
} from './robot-screen-reveal-projection'

const VIEWPORT = { height: 954, width: 1939 }
const REVEAL_CENTER = new Vector3(0, 1.08, 0)

describe('robot screen reveal projection', () => {
  test('keeps the radius fixed across camera orientation and world translation', () => {
    const radii = [
      createPerspectiveCamera(18, 14, 30, new Vector3(0, 1.28, 0)),
      createPerspectiveCamera(18, 54, 135, new Vector3(24, 1.28, -11)),
      createPerspectiveCamera(18, 74, 280, new Vector3(-36, 1.28, 42)),
    ].map((camera) =>
      projectLandrushRobotScreenRevealRadius({
        camera,
        viewportHeight: VIEWPORT.height,
        viewportWidth: VIEWPORT.width,
        zoomDistance: 18,
      }),
    )

    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-9)
  })

  test('covers the complete robot envelope across perspective zoom and pitch', () => {
    for (const pitchDegrees of [14, 54, 74]) {
      for (const distance of [10, 18, 34]) {
        const camera = createPerspectiveCamera(distance, pitchDegrees)
        const radiusPx = projectLandrushRobotScreenRevealRadius({
          camera,
          viewportHeight: VIEWPORT.height,
          viewportWidth: VIEWPORT.width,
          zoomDistance: distance,
        })
        const exhaustiveEnvelopeRadiusPx = projectExhaustiveEnvelopeRadius(camera, REVEAL_CENTER)

        expect(radiusPx).toBeGreaterThanOrEqual(exhaustiveEnvelopeRadiusPx)
      }
    }
  })

  test('changes only with the authored perspective zoom distance', () => {
    const camera = createPerspectiveCamera(18, 54)
    const radii = [10, 18, 34].map((zoomDistance) =>
      projectLandrushRobotScreenRevealRadius({
        camera,
        viewportHeight: VIEWPORT.height,
        viewportWidth: VIEWPORT.width,
        zoomDistance,
      }),
    )

    expect(radii[0]).toBeGreaterThan(radii[1]!)
    expect(radii[1]).toBeGreaterThan(radii[2]!)
  })

  test('changes only with orthographic zoom', () => {
    const camera = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100)
    camera.position.set(4, 8, 12)
    camera.lookAt(REVEAL_CENTER)
    camera.updateMatrixWorld()

    const radii = [0.5, 1, 2.5].map((zoom) => {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
      return projectLandrushRobotScreenRevealRadius({
        camera,
        viewportHeight: VIEWPORT.height,
        viewportWidth: VIEWPORT.width,
        zoomDistance: 18,
      })
    })

    expect(radii[1]! / radii[0]!).toBeCloseTo(2, 10)
    expect(radii[2]! / radii[1]!).toBeCloseTo(2.5, 10)
  })

  test('rejects invalid viewport, envelope, and zoom inputs', () => {
    const camera = createPerspectiveCamera(18, 54)
    expect(
      projectLandrushRobotScreenRevealRadius({
        camera,
        viewportHeight: 0,
        viewportWidth: VIEWPORT.width,
        zoomDistance: 18,
      }),
    ).toBe(0)
    expect(
      projectLandrushRobotScreenRevealRadius({
        bodyRadius: 0,
        camera,
        viewportHeight: VIEWPORT.height,
        viewportWidth: VIEWPORT.width,
        zoomDistance: 18,
      }),
    ).toBe(0)
    expect(
      projectLandrushRobotScreenRevealRadius({
        camera,
        viewportHeight: VIEWPORT.height,
        viewportWidth: VIEWPORT.width,
        zoomDistance: 0,
      }),
    ).toBe(0)
  })
})

function createPerspectiveCamera(
  distance: number,
  pitchDegrees: number,
  yawDegrees = 135,
  target = new Vector3(0, 1.28, 0),
) {
  const camera = new PerspectiveCamera(48, VIEWPORT.width / VIEWPORT.height, 0.1, 900)
  const pitch = MathUtils.degToRad(pitchDegrees)
  const yaw = MathUtils.degToRad(yawDegrees)
  const horizontalDistance = Math.cos(pitch) * distance
  camera.position.set(
    target.x + Math.sin(yaw) * horizontalDistance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * horizontalDistance,
  )
  camera.lookAt(target)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

function projectExhaustiveEnvelopeRadius(
  camera: PerspectiveCamera | OrthographicCamera,
  center: Vector3,
) {
  const centerNdc = center.clone().project(camera)
  let maximumDistanceSquared = 0
  for (const yOffset of [
    LANDRUSH_ROBOT_SCREEN_REVEAL_BASE_OFFSET_METERS,
    LANDRUSH_ROBOT_SCREEN_REVEAL_TOP_OFFSET_METERS,
  ]) {
    for (let index = 0; index < 1440; index += 1) {
      const angle = (index / 1440) * Math.PI * 2
      const envelopeNdc = new Vector3(
        center.x + Math.cos(angle) * LANDRUSH_ROBOT_SCREEN_REVEAL_BODY_RADIUS_METERS,
        center.y + yOffset,
        center.z + Math.sin(angle) * LANDRUSH_ROBOT_SCREEN_REVEAL_BODY_RADIUS_METERS,
      ).project(camera)
      const distanceX = (envelopeNdc.x - centerNdc.x) * VIEWPORT.width * 0.5
      const distanceY = (envelopeNdc.y - centerNdc.y) * VIEWPORT.height * 0.5
      maximumDistanceSquared = Math.max(
        maximumDistanceSquared,
        distanceX * distanceX + distanceY * distanceY,
      )
    }
  }
  return Math.sqrt(maximumDistanceSquared)
}
