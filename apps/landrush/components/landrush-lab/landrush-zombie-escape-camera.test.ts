import { describe, expect, test } from 'bun:test'
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import {
  handoffLandrushZombieEscapeCameraPose,
  LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY,
  resolveLandrushZombieEscapeCameraLayout,
  resolveLandrushZombieEscapeCameraProjectionHalfHeight,
  sampleLandrushZombieEscapeCameraTransition,
} from './landrush-zombie-escape-camera'

describe('Landrush Zombie Escape camera', () => {
  test('matches the Orbot animation-debug design bookmark', () => {
    const layout = resolveLandrushZombieEscapeCameraLayout(1920, 1080)
    const horizontalDistance = Math.cos(MathUtils.degToRad(68)) * 18

    expect(layout.offset[0]).toBeCloseTo(Math.sin(MathUtils.degToRad(34)) * horizontalDistance, 12)
    expect(layout.offset[1]).toBeCloseTo(Math.sin(MathUtils.degToRad(68)) * 18, 12)
    expect(layout.offset[2]).toBeCloseTo(Math.cos(MathUtils.degToRad(34)) * horizontalDistance, 12)
    expect(layout.targetOffset).toEqual([0, 0.72, 0])
    expect(layout.top).toBe(6.4)
    expect(layout.bottom).toBe(-6.4)
    expect(layout.near).toBe(0.05)
    expect(layout.far).toBe(90)
    expect(layout.zoom).toBe(1)
    expect(LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY).toBeGreaterThan(0.4)
    expect(LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY).toBeLessThan(1)
  })

  test('keeps the vertical framing fixed and derives horizontal framing from the viewport', () => {
    const landscape = resolveLandrushZombieEscapeCameraLayout(1920, 1080)
    const portrait = resolveLandrushZombieEscapeCameraLayout(900, 1600)

    expect(landscape.right).toBeCloseTo(6.4 * (1920 / 1080), 12)
    expect(landscape.left).toBeCloseTo(-landscape.right, 12)
    expect(portrait.right).toBeCloseTo(6.4 * (900 / 1600), 12)
    expect(portrait.left).toBeCloseTo(-portrait.right, 12)
    expect(portrait.top - portrait.bottom).toBe(12.8)
  })

  test('produces a finite minimum frustum for an unavailable viewport', () => {
    const layout = resolveLandrushZombieEscapeCameraLayout(Number.NaN, 0)

    expect(layout.left).toBeCloseTo(-0.64, 12)
    expect(layout.right).toBeCloseTo(0.64, 12)
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

  test('preserves source framing at entry and lands exactly on the authored framing', () => {
    const sourceHalfHeight = 2.75

    expect(sampleLandrushZombieEscapeCameraTransition(0, sourceHalfHeight)).toEqual({
      amount: 0,
      far: 90,
      halfHeight: sourceHalfHeight,
      progress: 0,
    })
    expect(sampleLandrushZombieEscapeCameraTransition(0.5, sourceHalfHeight)).toEqual({
      amount: 0.5,
      far: 90,
      halfHeight: (sourceHalfHeight + 6.4) / 2,
      progress: 0.5,
    })
    expect(sampleLandrushZombieEscapeCameraTransition(1, sourceHalfHeight)).toEqual({
      amount: 1,
      far: 90,
      halfHeight: 6.4,
      progress: 1,
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
