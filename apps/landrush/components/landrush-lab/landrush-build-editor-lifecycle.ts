export type LandrushBuildEditorViewMode = 'build' | 'map' | 'player'

export function resolveLandrushBuildEditorModeTransition(
  currentViewMode: LandrushBuildEditorViewMode,
  nextViewMode: LandrushBuildEditorViewMode,
) {
  if (currentViewMode === nextViewMode) return null
  if (nextViewMode === 'build') return true
  if (currentViewMode === 'build') return false
  return null
}

export function resolveLandrushBuildEditorActivation({
  buildMode,
  buildSceneModeActive,
  chromeReady,
  parcelReady,
  systemsReady,
  transitionFromBuild,
}: {
  buildMode: boolean
  buildSceneModeActive: boolean
  chromeReady: boolean
  parcelReady: boolean
  systemsReady: boolean
  transitionFromBuild: boolean
}) {
  const entryActive = buildMode && buildSceneModeActive && parcelReady
  const exitActive = !buildMode && transitionFromBuild
  return {
    chromeActive: (entryActive && chromeReady) || exitActive,
    systemsActive: (entryActive && systemsReady) || exitActive,
  }
}

export function resolveLandrushBuildEditorKeyboardReserved({
  buildMode,
  systemsActive,
  zombieNightActive,
}: {
  buildMode: boolean
  systemsActive: boolean
  zombieNightActive: boolean
}) {
  return (buildMode || systemsActive) && !zombieNightActive
}
