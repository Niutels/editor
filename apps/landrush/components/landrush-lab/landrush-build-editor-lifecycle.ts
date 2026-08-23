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

export function shouldSyncLandrushBuildEditorMode({
  buildMode,
  interactionReady,
  transitionFromBuild,
}: {
  buildMode: boolean
  interactionReady: boolean
  transitionFromBuild: boolean
}) {
  return buildMode ? !interactionReady : transitionFromBuild
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
  const chromeEntryActive = buildMode && chromeReady
  const systemsEntryActive = buildMode && parcelReady && buildSceneModeActive
  const exitActive = !buildMode && transitionFromBuild
  return {
    chromeActive: chromeEntryActive || exitActive,
    interactionReady: systemsEntryActive && chromeReady && systemsReady,
    systemsActive: (systemsEntryActive && systemsReady) || exitActive,
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
