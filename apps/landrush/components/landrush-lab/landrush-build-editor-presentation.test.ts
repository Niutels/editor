import { describe, expect, test } from 'bun:test'
import {
  isLandrushBuildEditorPresentationTargetCurrent,
  isLandrushBuildEditorPresentationTransition,
  resolveLandrushBuildEditorFocusHandoffStart,
  resolveLandrushBuildEditorFocusRestore,
  resolveLandrushBuildEditorPresentationSchedule,
  resolveLandrushDayChromePresentation,
} from './landrush-build-editor-presentation'

const CAMERA_TRANSITION_MS = 1_400
const PRESENTATION_TRANSITION_MS = 500

describe('Landrush build editor presentation', () => {
  test('opens only for the final 500ms of a build camera handoff', () => {
    expect(
      resolveLandrushBuildEditorPresentationSchedule({
        cameraTransitionMs: CAMERA_TRANSITION_MS,
        nowMs: 1_250,
        presentationTransitionMs: PRESENTATION_TRANSITION_MS,
        transition: { from: 'player', id: 7, startedAtMs: 1_000, to: 'build' },
      }),
    ).toEqual({
      durationMs: 500,
      startsAtMs: 1_900,
      targetOpen: true,
      transitionId: 7,
      waitMs: 650,
    })
  })

  test('closes on the same final-window schedule and never adds a late delay', () => {
    expect(
      resolveLandrushBuildEditorPresentationSchedule({
        cameraTransitionMs: CAMERA_TRANSITION_MS,
        nowMs: 2_100,
        presentationTransitionMs: PRESENTATION_TRANSITION_MS,
        transition: { from: 'build', id: 8, startedAtMs: 1_000, to: 'player' },
      }),
    ).toEqual({
      durationMs: 500,
      startsAtMs: 1_900,
      targetOpen: false,
      transitionId: 8,
      waitMs: 0,
    })
  })

  test('identifies only transitions that cross the build boundary', () => {
    expect(
      isLandrushBuildEditorPresentationTransition({
        from: 'map',
        id: 9,
        startedAtMs: 0,
        to: 'build',
      }),
    ).toBe(true)
    expect(
      isLandrushBuildEditorPresentationTransition({
        from: 'player',
        id: 10,
        startedAtMs: 0,
        to: 'map',
      }),
    ).toBe(false)
    expect(
      resolveLandrushBuildEditorPresentationSchedule({
        cameraTransitionMs: CAMERA_TRANSITION_MS,
        nowMs: 0,
        presentationTransitionMs: PRESENTATION_TRANSITION_MS,
        transition: { from: 'player', id: 10, startedAtMs: 0, to: 'map' },
      }),
    ).toBeNull()
  })

  test('gives rapid reversals distinct direction-aware callback identities', () => {
    const entering = resolveLandrushBuildEditorPresentationSchedule({
      cameraTransitionMs: CAMERA_TRANSITION_MS,
      nowMs: 300,
      presentationTransitionMs: PRESENTATION_TRANSITION_MS,
      transition: { from: 'player', id: 11, startedAtMs: 0, to: 'build' },
    })
    const leaving = resolveLandrushBuildEditorPresentationSchedule({
      cameraTransitionMs: CAMERA_TRANSITION_MS,
      nowMs: 300,
      presentationTransitionMs: PRESENTATION_TRANSITION_MS,
      transition: { from: 'build', id: 12, startedAtMs: 300, to: 'player' },
    })

    expect(entering?.transitionId).not.toBe(leaving?.transitionId)
    expect(entering?.targetOpen).toBe(true)
    expect(leaving?.targetOpen).toBe(false)
    expect(leaving?.waitMs).toBe(900)
    expect(
      isLandrushBuildEditorPresentationTargetCurrent(
        leaving?.transitionId ?? null,
        entering?.transitionId ?? -1,
      ),
    ).toBe(false)
    expect(
      isLandrushBuildEditorPresentationTargetCurrent(
        leaving?.transitionId ?? null,
        leaving?.transitionId ?? -1,
      ),
    ).toBe(true)
  })

  test('keeps day chrome mounted visually while gating input from editor and transition owners', () => {
    expect(
      resolveLandrushDayChromePresentation({
        buildEditorChromeActive: false,
        buildEditorInteractionReady: false,
        buildEditorLayoutOpen: false,
        buildMode: false,
        commandsEnabled: true,
        modeTransitionActive: false,
        zombieNightActive: false,
      }),
    ).toEqual({ interactionReady: true, presented: true })
    expect(
      resolveLandrushDayChromePresentation({
        buildEditorChromeActive: true,
        buildEditorInteractionReady: false,
        buildEditorLayoutOpen: false,
        buildMode: false,
        commandsEnabled: true,
        modeTransitionActive: true,
        zombieNightActive: false,
      }),
    ).toEqual({ interactionReady: false, presented: true })
    expect(
      resolveLandrushDayChromePresentation({
        buildEditorChromeActive: false,
        buildEditorInteractionReady: true,
        buildEditorLayoutOpen: false,
        buildMode: false,
        commandsEnabled: true,
        modeTransitionActive: false,
        zombieNightActive: false,
      }).interactionReady,
    ).toBe(false)
    expect(
      resolveLandrushDayChromePresentation({
        buildEditorChromeActive: true,
        buildEditorInteractionReady: true,
        buildEditorLayoutOpen: true,
        buildMode: true,
        commandsEnabled: true,
        modeTransitionActive: false,
        zombieNightActive: false,
      }),
    ).toEqual({ interactionReady: false, presented: false })
  })

  test('keeps day chrome visible when scheduled editor presentation is not actually available', () => {
    const buildEditorLayoutPresented = true
    const buildEditorChromeActive = false
    const buildEditorLayoutOpen = buildEditorLayoutPresented && buildEditorChromeActive

    expect(
      resolveLandrushDayChromePresentation({
        buildEditorChromeActive,
        buildEditorInteractionReady: false,
        buildEditorLayoutOpen,
        buildMode: true,
        commandsEnabled: true,
        modeTransitionActive: false,
        zombieNightActive: false,
      }),
    ).toEqual({ interactionReady: false, presented: true })
  })

  test('keeps one visual owner through delayed readiness, recovery, and rapid reversal', () => {
    const resolve = ({
      buildEditorChromeActive,
      buildEditorLayoutOpen,
      buildMode,
    }: {
      buildEditorChromeActive: boolean
      buildEditorLayoutOpen: boolean
      buildMode: boolean
    }) =>
      resolveLandrushDayChromePresentation({
        buildEditorChromeActive,
        buildEditorInteractionReady: buildEditorLayoutOpen,
        buildEditorLayoutOpen,
        buildMode,
        commandsEnabled: true,
        modeTransitionActive: true,
        zombieNightActive: false,
      })

    expect([
      resolve({
        buildEditorChromeActive: false,
        buildEditorLayoutOpen: false,
        buildMode: true,
      }),
      resolve({
        buildEditorChromeActive: true,
        buildEditorLayoutOpen: true,
        buildMode: true,
      }),
      resolve({
        buildEditorChromeActive: true,
        buildEditorLayoutOpen: false,
        buildMode: false,
      }),
    ]).toEqual([
      { interactionReady: false, presented: true },
      { interactionReady: false, presented: false },
      { interactionReady: false, presented: true },
    ])
  })

  test('hands focused day controls to the editor only after build entry settles', () => {
    const start = resolveLandrushBuildEditorFocusHandoffStart({
      current: null,
      outgoingOwnsFocus: true,
      sinkOwnsFocus: false,
      transition: { from: 'player', id: 21, startedAtMs: 0, to: 'build' },
    })

    expect(start).toEqual({
      handoff: { targetOwner: 'editor', transitionId: 21 },
      moveFocusToSink: true,
    })
    expect(
      resolveLandrushBuildEditorFocusRestore({
        handoff: start.handoff,
        modeTransitionActive: true,
        sinkOwnsFocus: true,
        targetReady: false,
      }),
    ).toBe('wait')
    expect(
      resolveLandrushBuildEditorFocusRestore({
        handoff: start.handoff,
        modeTransitionActive: false,
        sinkOwnsFocus: true,
        targetReady: true,
      }),
    ).toBe('focus')
  })

  test('restores editor focus to Exit when the shell is open even if tools are not ready', () => {
    const buildEditorLayoutOpen = true
    const buildEditorInteractionReady = false

    expect(buildEditorInteractionReady).toBe(false)
    expect(
      resolveLandrushBuildEditorFocusRestore({
        handoff: { targetOwner: 'editor', transitionId: 25 },
        modeTransitionActive: false,
        sinkOwnsFocus: true,
        targetReady: buildEditorLayoutOpen,
      }),
    ).toBe('focus')
  })

  test('hands focused editor controls back to the stable day Build button after exit', () => {
    const start = resolveLandrushBuildEditorFocusHandoffStart({
      current: null,
      outgoingOwnsFocus: true,
      sinkOwnsFocus: false,
      transition: { from: 'build', id: 22, startedAtMs: 0, to: 'player' },
    })

    expect(start).toEqual({
      handoff: { targetOwner: 'day', transitionId: 22 },
      moveFocusToSink: true,
    })
    expect(
      resolveLandrushBuildEditorFocusRestore({
        handoff: start.handoff,
        modeTransitionActive: false,
        sinkOwnsFocus: false,
        targetReady: true,
      }),
    ).toBe('clear')
  })

  test('retargets a rapid reversal while focus remains on the stable sink', () => {
    const entering = resolveLandrushBuildEditorFocusHandoffStart({
      current: null,
      outgoingOwnsFocus: true,
      sinkOwnsFocus: false,
      transition: { from: 'player', id: 23, startedAtMs: 0, to: 'build' },
    })
    const reversing = resolveLandrushBuildEditorFocusHandoffStart({
      current: entering.handoff,
      outgoingOwnsFocus: false,
      sinkOwnsFocus: true,
      transition: { from: 'build', id: 24, startedAtMs: 300, to: 'player' },
    })

    expect(reversing).toEqual({
      handoff: { targetOwner: 'day', transitionId: 24 },
      moveFocusToSink: false,
    })
    expect(reversing.handoff?.transitionId).not.toBe(entering.handoff?.transitionId)
  })
})
