import { describe, expect, test } from 'bun:test'
import {
  resolveLandrushBuildEditorActivation,
  resolveLandrushBuildEditorKeyboardReserved,
  resolveLandrushBuildEditorModeTransition,
} from './landrush-build-editor-lifecycle'

describe('Landrush build editor lifecycle', () => {
  test('resets to select before entering and leaving the build view', () => {
    expect(resolveLandrushBuildEditorModeTransition('player', 'build')).toBe(true)
    expect(resolveLandrushBuildEditorModeTransition('map', 'build')).toBe(true)
    expect(resolveLandrushBuildEditorModeTransition('build', 'player')).toBe(false)
    expect(resolveLandrushBuildEditorModeTransition('build', 'map')).toBe(false)
    expect(resolveLandrushBuildEditorModeTransition('player', 'map')).toBeNull()
    expect(resolveLandrushBuildEditorModeTransition('build', 'build')).toBeNull()
  })

  test('keeps tools and chrome inactive until the build camera and parcel are ready', () => {
    const waitingForCamera = resolveLandrushBuildEditorActivation({
      buildMode: true,
      buildSceneModeActive: false,
      chromeReady: true,
      parcelReady: true,
      systemsReady: true,
      transitionFromBuild: false,
    })
    const waitingForParcel = resolveLandrushBuildEditorActivation({
      buildMode: true,
      buildSceneModeActive: true,
      chromeReady: true,
      parcelReady: false,
      systemsReady: true,
      transitionFromBuild: false,
    })

    expect(waitingForCamera).toEqual({ chromeActive: false, systemsActive: false })
    expect(waitingForParcel).toEqual({ chromeActive: false, systemsActive: false })
  })

  test('honors staged readiness after entry and preserves the exit transition', () => {
    expect(
      resolveLandrushBuildEditorActivation({
        buildMode: true,
        buildSceneModeActive: true,
        chromeReady: false,
        parcelReady: true,
        systemsReady: true,
        transitionFromBuild: false,
      }),
    ).toEqual({ chromeActive: false, systemsActive: true })
    expect(
      resolveLandrushBuildEditorActivation({
        buildMode: true,
        buildSceneModeActive: true,
        chromeReady: true,
        parcelReady: true,
        systemsReady: true,
        transitionFromBuild: false,
      }),
    ).toEqual({ chromeActive: true, systemsActive: true })
    expect(
      resolveLandrushBuildEditorActivation({
        buildMode: false,
        buildSceneModeActive: false,
        chromeReady: false,
        parcelReady: false,
        systemsReady: false,
        transitionFromBuild: true,
      }),
    ).toEqual({ chromeActive: true, systemsActive: true })
  })

  test('reserves editor keyboard input across entry and exit but releases it for zombie mode', () => {
    expect(
      resolveLandrushBuildEditorKeyboardReserved({
        buildMode: true,
        systemsActive: false,
        zombieNightActive: false,
      }),
    ).toBe(true)
    expect(
      resolveLandrushBuildEditorKeyboardReserved({
        buildMode: false,
        systemsActive: true,
        zombieNightActive: false,
      }),
    ).toBe(true)
    expect(
      resolveLandrushBuildEditorKeyboardReserved({
        buildMode: true,
        systemsActive: true,
        zombieNightActive: true,
      }),
    ).toBe(false)
  })
})
