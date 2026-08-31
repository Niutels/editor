import { describe, expect, test } from 'bun:test'
import {
  constrainLandrushBuildCameraOffset,
  resolveLandrushBuildCameraDragAction,
  shouldArmLandrushBuildRobotExit,
  shouldBeginLandrushBuildCameraOrbit,
  shouldCommitLandrushBuildRobotExit,
  shouldHandleLandrushBuildCameraWheel,
  shouldSuppressLandrushBuildContextMenu,
} from './landrush-build-pointer-input'

const baseIntent = {
  button: 2,
  cameraControlsActive: false,
  cameraDragInProgress: false,
  defaultPrevented: false,
  insideCanvas: true,
  interactiveTarget: false,
}

describe('Landrush build pointer ownership', () => {
  test('does not arm or commit the robot exit while a wall placement owns the pointer', () => {
    expect(shouldArmLandrushBuildRobotExit({ editorPlacementActive: true, robotHit: true })).toBe(
      false,
    )
    expect(
      shouldCommitLandrushBuildRobotExit({
        armed: true,
        editorPlacementActive: true,
        robotHit: true,
      }),
    ).toBe(false)
  })

  test('does not commit when a wall finishes between pointerdown and pointerup', () => {
    const armed = shouldArmLandrushBuildRobotExit({
      editorPlacementActive: true,
      robotHit: true,
    })

    expect(armed).toBe(false)
    expect(
      shouldCommitLandrushBuildRobotExit({
        armed,
        editorPlacementActive: false,
        robotHit: true,
      }),
    ).toBe(false)
  })

  test('commits the robot exit only after an idle pointerdown and pointerup both hit it', () => {
    const armed = shouldArmLandrushBuildRobotExit({
      editorPlacementActive: false,
      robotHit: true,
    })

    expect(armed).toBe(true)
    expect(
      shouldCommitLandrushBuildRobotExit({
        armed,
        editorPlacementActive: false,
        robotHit: true,
      }),
    ).toBe(true)
    expect(
      shouldCommitLandrushBuildRobotExit({
        armed,
        editorPlacementActive: false,
        robotHit: false,
      }),
    ).toBe(false)
  })

  test('fully reserves left click for editor placement tools', () => {
    expect(shouldBeginLandrushBuildCameraOrbit({ ...baseIntent, button: 0 })).toBe(false)
    expect(resolveLandrushBuildCameraDragAction({ ...baseIntent, button: 0 })).toBeNull()
  })

  test('maps right drag to orbit and middle drag to screen pan', () => {
    expect(shouldBeginLandrushBuildCameraOrbit(baseIntent)).toBe(true)
    expect(resolveLandrushBuildCameraDragAction(baseIntent)).toBe('orbit')
    expect(resolveLandrushBuildCameraDragAction({ ...baseIntent, button: 1 })).toBe('pan')
  })

  test('does not steal camera drags from controls, active drags, or interactive chrome', () => {
    expect(
      resolveLandrushBuildCameraDragAction({ ...baseIntent, cameraControlsActive: true }),
    ).toBeNull()
    expect(
      resolveLandrushBuildCameraDragAction({ ...baseIntent, cameraDragInProgress: true }),
    ).toBeNull()
    expect(
      resolveLandrushBuildCameraDragAction({ ...baseIntent, interactiveTarget: true }),
    ).toBeNull()
    expect(resolveLandrushBuildCameraDragAction({ ...baseIntent, insideCanvas: false })).toBeNull()
    expect(
      resolveLandrushBuildCameraDragAction({ ...baseIntent, defaultPrevented: true }),
    ).toBeNull()
  })

  test('handles wheel zoom only when the canvas camera is unclaimed', () => {
    expect(shouldHandleLandrushBuildCameraWheel(baseIntent)).toBe(true)
    expect(
      shouldHandleLandrushBuildCameraWheel({ ...baseIntent, cameraControlsActive: true }),
    ).toBe(false)
    expect(
      shouldHandleLandrushBuildCameraWheel({ ...baseIntent, cameraDragInProgress: true }),
    ).toBe(false)
    expect(shouldHandleLandrushBuildCameraWheel({ ...baseIntent, interactiveTarget: true })).toBe(
      false,
    )
    expect(shouldHandleLandrushBuildCameraWheel({ ...baseIntent, insideCanvas: false })).toBe(false)
    expect(shouldHandleLandrushBuildCameraWheel({ ...baseIntent, defaultPrevented: true })).toBe(
      false,
    )
  })

  test('suppresses the browser menu only on the non-interactive canvas', () => {
    expect(shouldSuppressLandrushBuildContextMenu(baseIntent)).toBe(true)
    expect(shouldSuppressLandrushBuildContextMenu({ ...baseIntent, interactiveTarget: true })).toBe(
      false,
    )
    expect(shouldSuppressLandrushBuildContextMenu({ ...baseIntent, insideCanvas: false })).toBe(
      false,
    )
  })
})

describe('Landrush build camera constraints', () => {
  const bounds = {
    maxDistance: 22,
    maxHeight: 15,
    minDistance: 10,
    minHeight: 7,
  }

  test('keeps close and below-ground poses above the parcel at the minimum radius', () => {
    const offset = constrainLandrushBuildCameraOffset({ x: 0, y: -4, z: 2 }, bounds)

    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(10)
    expect(offset.y).toBe(7)
  })

  test('keeps distant and vertical poses inside distance and height bounds', () => {
    const offset = constrainLandrushBuildCameraOffset({ x: 0, y: 30, z: 0 }, bounds)

    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(22)
    expect(offset.y).toBe(15)
  })
})
