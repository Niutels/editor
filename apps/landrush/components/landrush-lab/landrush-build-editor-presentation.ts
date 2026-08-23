import {
  type LandrushBuildEditorViewMode,
  resolveLandrushBuildEditorModeTransition,
} from './landrush-build-editor-lifecycle'

export type LandrushBuildEditorPresentationTransition = {
  from: LandrushBuildEditorViewMode
  id: number
  startedAtMs: number
  to: LandrushBuildEditorViewMode
}

export type LandrushBuildEditorPresentationSchedule = {
  durationMs: number
  startsAtMs: number
  targetOpen: boolean
  transitionId: number
  waitMs: number
}

export type LandrushBuildEditorFocusHandoff = {
  targetOwner: 'day' | 'editor'
  transitionId: number
}

export function resolveLandrushBuildEditorFocusHandoffStart({
  current,
  outgoingOwnsFocus,
  sinkOwnsFocus,
  transition,
}: {
  current: LandrushBuildEditorFocusHandoff | null
  outgoingOwnsFocus: boolean
  sinkOwnsFocus: boolean
  transition: LandrushBuildEditorPresentationTransition
}) {
  const targetOpen = resolveLandrushBuildEditorModeTransition(transition.from, transition.to)
  const handoffActive = outgoingOwnsFocus || (current !== null && sinkOwnsFocus)
  if (targetOpen === null || !handoffActive) {
    return { handoff: null, moveFocusToSink: false }
  }
  return {
    handoff: {
      targetOwner: targetOpen ? ('editor' as const) : ('day' as const),
      transitionId: transition.id,
    },
    moveFocusToSink: outgoingOwnsFocus,
  }
}

export function resolveLandrushBuildEditorFocusRestore({
  handoff,
  modeTransitionActive,
  sinkOwnsFocus,
  targetReady,
}: {
  handoff: LandrushBuildEditorFocusHandoff | null
  modeTransitionActive: boolean
  sinkOwnsFocus: boolean
  targetReady: boolean
}): 'clear' | 'focus' | 'wait' {
  if (!handoff) return 'clear'
  if (modeTransitionActive || !targetReady) return 'wait'
  return sinkOwnsFocus ? 'focus' : 'clear'
}

export function resolveLandrushDayChromePresentation({
  buildEditorChromeActive,
  buildEditorInteractionReady,
  buildEditorLayoutOpen,
  buildMode,
  commandsEnabled,
  modeTransitionActive,
  zombieNightActive,
}: {
  buildEditorChromeActive: boolean
  buildEditorInteractionReady: boolean
  buildEditorLayoutOpen: boolean
  buildMode: boolean
  commandsEnabled: boolean
  modeTransitionActive: boolean
  zombieNightActive: boolean
}) {
  const presented = !zombieNightActive && !buildEditorLayoutOpen
  return {
    interactionReady:
      presented &&
      !buildMode &&
      !buildEditorChromeActive &&
      !buildEditorInteractionReady &&
      !modeTransitionActive &&
      commandsEnabled,
    presented,
  }
}

export function isLandrushBuildEditorPresentationTransition(
  transition: LandrushBuildEditorPresentationTransition | null,
) {
  return (
    transition !== null &&
    resolveLandrushBuildEditorModeTransition(transition.from, transition.to) !== null
  )
}

export function isLandrushBuildEditorPresentationTargetCurrent(
  activeTransitionId: number | null,
  targetTransitionId: number,
) {
  return activeTransitionId === targetTransitionId
}

export function resolveLandrushBuildEditorPresentationSchedule({
  cameraTransitionMs,
  nowMs,
  presentationTransitionMs,
  transition,
}: {
  cameraTransitionMs: number
  nowMs: number
  presentationTransitionMs: number
  transition: LandrushBuildEditorPresentationTransition | null
}): LandrushBuildEditorPresentationSchedule | null {
  if (!transition) return null
  const targetOpen = resolveLandrushBuildEditorModeTransition(transition.from, transition.to)
  if (targetOpen === null) return null

  const safeCameraTransitionMs = Number.isFinite(cameraTransitionMs)
    ? Math.max(0, cameraTransitionMs)
    : 0
  const safePresentationTransitionMs = Number.isFinite(presentationTransitionMs)
    ? Math.max(0, presentationTransitionMs)
    : 0
  const safeStartedAtMs = Number.isFinite(transition.startedAtMs) ? transition.startedAtMs : 0
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : safeStartedAtMs
  const startsAtMs =
    safeStartedAtMs + Math.max(0, safeCameraTransitionMs - safePresentationTransitionMs)

  return {
    durationMs: safePresentationTransitionMs,
    startsAtMs,
    targetOpen,
    transitionId: transition.id,
    waitMs: Math.max(0, startsAtMs - safeNowMs),
  }
}
