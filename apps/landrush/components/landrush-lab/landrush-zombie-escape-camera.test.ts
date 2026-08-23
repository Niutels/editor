import { describe, expect, test } from 'bun:test'
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import {
  handoffLandrushZombieEscapeCameraPose,
  LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY,
  resolveLandrushZombieEscapeCameraLayout,
  resolveLandrushZombieEscapeCameraProjectionHalfHeight,
  sampleLandrushZombieEscapeCameraTransition,
} from './landrush-zombie-escape-camera'
import {
  resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters,
  ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE,
  ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'

describe('Landrush Zombie Escape camera', () => {
  test('preserves the Orbot animation-debug pose and centers its projection', () => {
    const layout = resolveLandrushZombieEscapeCameraLayout(1920, 1080)
    const camera = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
    const horizontalDistance = Math.cos(camera.elevationRadians) * camera.distanceMeters

    expect(layout.offset[0]).toBeCloseTo(Math.sin(camera.azimuthRadians) * horizontalDistance, 12)
    expect(layout.offset[1]).toBeCloseTo(
      Math.sin(camera.elevationRadians) * camera.distanceMeters,
      12,
    )
    expect(layout.offset[2]).toBeCloseTo(Math.cos(camera.azimuthRadians) * horizontalDistance, 12)
    expect(layout.targetOffset).toEqual([0, camera.targetHeightMeters, 0])
    expect(layout.halfHeight).toBe(camera.halfHeightMeters)
    expect(layout.top).toBe(camera.halfHeightMeters)
    expect(layout.bottom).toBe(-camera.halfHeightMeters)
    expect(layout.projectionCenterY).toBe(0)
    expect(layout.near).toBe(camera.nearMeters)
    expect(layout.far).toBe(camera.farMeters)
    expect(layout.zoom).toBe(camera.zoom)
    expect(LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY).toBeGreaterThan(0.4)
    expect(LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY).toBeLessThan(1)
  })

  test('keeps replacement zombies outside full standard, envelope, and ultrawide footprints', () => {
    const camera = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
    const standardFootprint = resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(16 / 9)
    const maximumFootprint = resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(
      camera.maximumAspectRatio,
    )
    const ultrawideFootprint = resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(32 / 9)

    expect(standardFootprint).toBeLessThan(maximumFootprint)
    expect(ultrawideFootprint).toBeLessThan(maximumFootprint)
    for (const aspect of [16 / 9, camera.maximumAspectRatio, 32 / 9]) {
      const layout = resolveLandrushZombieEscapeCameraLayout(aspect * 900, 900)
      const target = new Vector3(0, camera.targetHeightMeters, 0)
      const gameplayCamera = new OrthographicCamera(
        layout.left,
        layout.right,
        layout.top,
        layout.bottom,
        layout.near,
        layout.far,
      )
      gameplayCamera.position.fromArray(layout.offset).add(target)
      gameplayCamera.lookAt(target)
      gameplayCamera.updateMatrixWorld(true)
      gameplayCamera.updateProjectionMatrix()
      let projectedGroundRadius = 0

      for (const ndcX of [-1, 1]) {
        for (const ndcY of [-1, 1]) {
          const nearPoint = new Vector3(ndcX, ndcY, -1).unproject(gameplayCamera)
          const direction = new Vector3(ndcX, ndcY, 1).unproject(gameplayCamera).sub(nearPoint)
          const groundPoint = nearPoint
            .clone()
            .addScaledVector(direction, -nearPoint.y / direction.y)
          projectedGroundRadius = Math.max(
            projectedGroundRadius,
            Math.hypot(groundPoint.x, groundPoint.z),
          )
        }
      }

      expect(projectedGroundRadius).toBeCloseTo(
        resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(aspect),
        10,
      )
      expect(
        projectedGroundRadius + ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      ).toBeLessThan(ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS)
    }
    expect(
      ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS -
        maximumFootprint -
        ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    ).toBeCloseTo(camera.replacementSpawnMarginMeters, 12)
    expect(ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS).toBeGreaterThan(17.9)
    expect(ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS).toBeLessThan(18.1)
  })

  test('caps ultrawide horizontal span while preserving the live projection aspect', () => {
    const camera = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
    const liveAspect = 32 / 9
    const layout = resolveLandrushZombieEscapeCameraLayout(3200, 900)
    const maximumHorizontalHalfSpan = camera.halfHeightMeters * camera.maximumAspectRatio

    expect(layout.right).toBeCloseTo(maximumHorizontalHalfSpan, 12)
    expect(layout.left).toBeCloseTo(-maximumHorizontalHalfSpan, 12)
    expect(layout.halfHeight).toBeCloseTo(maximumHorizontalHalfSpan / liveAspect, 12)
    expect(layout.halfHeight).toBeLessThan(camera.halfHeightMeters)
    expect((layout.right - layout.left) / (layout.top - layout.bottom)).toBeCloseTo(liveAspect, 12)
  })

  test('keeps vertical framing stable across resize and derives horizontal framing from aspect', () => {
    const landscape = resolveLandrushZombieEscapeCameraLayout(1920, 1080)
    const portrait = resolveLandrushZombieEscapeCameraLayout(900, 1600)

    expect(landscape.right).toBeCloseTo(landscape.halfHeight * (1920 / 1080), 12)
    expect(landscape.left).toBeCloseTo(-landscape.right, 12)
    expect(portrait.right).toBeCloseTo(portrait.halfHeight * (900 / 1600), 12)
    expect(portrait.left).toBeCloseTo(-portrait.right, 12)
    expect(portrait.halfHeight).toBeCloseTo(landscape.halfHeight, 12)
    expect(portrait.top).toBeCloseTo(landscape.top, 12)
    expect(portrait.bottom).toBeCloseTo(landscape.bottom, 12)
  })

  test('centers the followed target without tying actor scale to terrain elevation', () => {
    const layouts = [
      resolveLandrushZombieEscapeCameraLayout(1920, 1080),
      resolveLandrushZombieEscapeCameraLayout(900, 1600),
    ]
    const landscape = layouts[0]!
    const groundY = 0
    const target = new Vector3(44, groundY + 0.72, 12.3)
    const createCamera = (layout: typeof landscape) => {
      const camera = new OrthographicCamera(
        layout.left,
        layout.right,
        layout.top,
        layout.bottom,
        layout.near,
        layout.far,
      )
      camera.position.fromArray(layout.offset).add(target)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      return camera
    }

    for (const layout of layouts) {
      const camera = createCamera(layout)
      const targetProjection = target.clone().project(camera)

      expect(layout.top - layout.bottom).toBeCloseTo(layout.halfHeight * 2, 12)
      expect(layout.halfHeight).toBe(6.4)
      expect(targetProjection.x).toBeCloseTo(0, 12)
      expect(targetProjection.y).toBeCloseTo(0, 12)
      expect(targetProjection.z).toBeGreaterThanOrEqual(-1)
      expect(targetProjection.z).toBeLessThanOrEqual(1)
    }
  })

  test('produces a finite minimum frustum for an unavailable viewport', () => {
    const layout = resolveLandrushZombieEscapeCameraLayout(Number.NaN, 0)

    expect(layout.left).toBeCloseTo(-layout.halfHeight * 0.1, 12)
    expect(layout.right).toBeCloseTo(layout.halfHeight * 0.1, 12)
    expect(layout.offset.every(Number.isFinite)).toBe(true)
  })

  test('matches perspective and orthographic framing at the handoff plane', () => {
    const perspective = new PerspectiveCamera(60, 16 / 9, 0.1, 100)
    perspective.zoom = 2
    perspective.updateProjectionMatrix()
    const orthographic = new OrthographicCamera(-8, 8, 6, -6, 0.1, 100)
    orthographic.zoom = 2
    orthographic.updateProjectionMatrix()

    expect(resolveLandrushZombieEscapeCameraProjectionHalfHeight(perspective, 10)).toBeCloseTo(
      (Math.tan(MathUtils.degToRad(30)) * 10) / 2,
      12,
    )
    expect(resolveLandrushZombieEscapeCameraProjectionHalfHeight(orthographic, 10)).toBeCloseTo(
      3,
      12,
    )
  })

  test('preserves source framing at entry and lands smoothly on the authored gameplay span', () => {
    const sourceHalfHeight = 2.75
    const sourceProjectionCenterY = -1.4
    const targetHalfHeight = resolveLandrushZombieEscapeCameraLayout(1920, 1080).halfHeight

    expect(
      sampleLandrushZombieEscapeCameraTransition(
        0,
        sourceHalfHeight,
        90,
        sourceProjectionCenterY,
        0,
        targetHalfHeight,
      ),
    ).toEqual({
      amount: 0,
      far: 90,
      halfHeight: sourceHalfHeight,
      progress: 0,
      projectionCenterY: sourceProjectionCenterY,
    })
    expect(
      sampleLandrushZombieEscapeCameraTransition(
        0.5,
        sourceHalfHeight,
        90,
        sourceProjectionCenterY,
        0,
        targetHalfHeight,
      ),
    ).toEqual({
      amount: 0.5,
      far: 90,
      halfHeight: (sourceHalfHeight + targetHalfHeight) / 2,
      progress: 0.5,
      projectionCenterY: sourceProjectionCenterY / 2,
    })
    expect(
      sampleLandrushZombieEscapeCameraTransition(
        1,
        sourceHalfHeight,
        90,
        sourceProjectionCenterY,
        0,
        targetHalfHeight,
      ),
    ).toEqual({
      amount: 1,
      far: 90,
      halfHeight: targetHalfHeight,
      progress: 1,
      projectionCenterY: 0,
    })
  })

  test('keeps a distant source scene inside the frustum throughout the handoff', () => {
    expect(sampleLandrushZombieEscapeCameraTransition(0, 20, 900).far).toBe(900)
    expect(sampleLandrushZombieEscapeCameraTransition(0.5, 20, 900).far).toBe(495)
    expect(sampleLandrushZombieEscapeCameraTransition(1, 20, 900).far).toBe(90)
  })

  test('hands the final zombie pose to the restored camera before releasing ownership', () => {
    const source = new OrthographicCamera()
    source.position.set(9, 12, -4)
    source.up.set(0.1, 0.98, 0.05).normalize()
    source.lookAt(new Vector3(2, 1, 3))
    source.updateMatrixWorld(true)
    const target = new PerspectiveCamera()

    handoffLandrushZombieEscapeCameraPose(source, target)

    expect(target.position.toArray()).toEqual(source.position.toArray())
    expect(target.quaternion.toArray()).toEqual(source.quaternion.toArray())
    expect(target.up.toArray()).toEqual(source.up.toArray())
  })
})
