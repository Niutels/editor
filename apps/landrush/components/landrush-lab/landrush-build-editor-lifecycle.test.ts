import { describe, expect, test } from 'bun:test'
import {
  resolveLandrushBuildEditorActivation,
  resolveLandrushBuildEditorKeyboardReserved,
  resolveLandrushBuildEditorModeTransition,
  shouldSyncLandrushBuildEditorMode,
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

  test('opens chrome during the camera handoff but keeps tools inactive until it settles', () => {
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

    expect(waitingForCamera).toEqual({
      chromeActive: true,
      interactionReady: false,
      systemsActive: false,
    })
    expect(waitingForParcel).toEqual({
      chromeActive: true,
      interactionReady: false,
      systemsActive: false,
    })
  })

  test('keeps shell and Exit available while parcel systems become ready, recover, or evict', () => {
    const resolve = (parcelReady: boolean) =>
      resolveLandrushBuildEditorActivation({
        buildMode: true,
        buildSceneModeActive: true,
        chromeReady: true,
        parcelReady,
        systemsReady: true,
        transitionFromBuild: false,
      })

    expect([resolve(false), resolve(true), resolve(false), resolve(true)]).toEqual([
      { chromeActive: true, interactionReady: false, systemsActive: false },
      { chromeActive: true, interactionReady: true, systemsActive: true },
      { chromeActive: true, interactionReady: false, systemsActive: false },
      { chromeActive: true, interactionReady: true, systemsActive: true },
    ])
  })

  test('separates shell, systems, and interaction readiness across the entry matrix', () => {
    const cases = [
      {
        expected: { chromeActive: false, interactionReady: false, systemsActive: false },
        readiness: {
          buildSceneModeActive: false,
          chromeReady: false,
          parcelReady: false,
          systemsReady: false,
        },
      },
      {
        expected: { chromeActive: true, interactionReady: false, systemsActive: false },
        readiness: {
          buildSceneModeActive: true,
          chromeReady: true,
          parcelReady: false,
          systemsReady: true,
        },
      },
      {
        expected: { chromeActive: true, interactionReady: false, systemsActive: false },
        readiness: {
          buildSceneModeActive: false,
          chromeReady: true,
          parcelReady: true,
          systemsReady: true,
        },
      },
      {
        expected: { chromeActive: true, interactionReady: false, systemsActive: false },
        readiness: {
          buildSceneModeActive: true,
          chromeReady: true,
          parcelReady: true,
          systemsReady: false,
        },
      },
      {
        expected: { chromeActive: true, interactionReady: true, systemsActive: true },
        readiness: {
          buildSceneModeActive: true,
          chromeReady: true,
          parcelReady: true,
          systemsReady: true,
        },
      },
    ]

    for (const { expected, readiness } of cases) {
      expect(
        resolveLandrushBuildEditorActivation({
          buildMode: true,
          transitionFromBuild: false,
          ...readiness,
        }),
      ).toEqual(expected)
    }
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
    ).toEqual({ chromeActive: false, interactionReady: false, systemsActive: true })
    expect(
      resolveLandrushBuildEditorActivation({
        buildMode: true,
        buildSceneModeActive: true,
        chromeReady: true,
        parcelReady: true,
        systemsReady: true,
        transitionFromBuild: false,
      }),
    ).toEqual({ chromeActive: true, interactionReady: true, systemsActive: true })
    expect(
      resolveLandrushBuildEditorActivation({
        buildMode: false,
        buildSceneModeActive: false,
        chromeReady: false,
        parcelReady: false,
        systemsReady: false,
        transitionFromBuild: true,
      }),
    ).toEqual({ chromeActive: true, interactionReady: false, systemsActive: true })
  })

  test('does not resync Select over the default tool at the interaction-ready edge', () => {
    expect(
      shouldSyncLandrushBuildEditorMode({
        buildMode: true,
        interactionReady: false,
        transitionFromBuild: false,
      }),
    ).toBe(true)
    expect(
      shouldSyncLandrushBuildEditorMode({
        buildMode: true,
        interactionReady: true,
        transitionFromBuild: false,
      }),
    ).toBe(false)
    expect(
      shouldSyncLandrushBuildEditorMode({
        buildMode: false,
        interactionReady: false,
        transitionFromBuild: true,
      }),
    ).toBe(true)
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
