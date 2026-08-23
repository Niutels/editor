export type SceneReadinessBlockers = {
  buildWork: boolean
  committedRoot: boolean
  failedMaterialTextures: number
  pendingMaterialTextures: number
  prerequisitesReady: boolean
}

export type SceneReadinessState = {
  key: string | number | null | undefined
  ready: boolean
  settledFrames: number
}

export function getSceneReadinessBlockerNames({
  buildWork,
  committedRoot,
  failedMaterialTextures,
  pendingMaterialTextures,
  prerequisitesReady,
}: SceneReadinessBlockers): string[] {
  const blockers: string[] = []
  if (!prerequisitesReady) blockers.push('host-prerequisites')
  if (!committedRoot) blockers.push('scene-root')
  if (buildWork) blockers.push('scene-build')
  if (pendingMaterialTextures > 0) blockers.push('material-textures-pending')
  if (failedMaterialTextures > 0) blockers.push('material-textures-failed')
  return blockers
}

export function shouldWaitForSceneReadiness(blockers: readonly string[], capReached: boolean) {
  return (
    blockers.includes('host-prerequisites') ||
    blockers.includes('material-textures-pending') ||
    (!capReached && blockers.length > 0)
  )
}

export function advanceSceneReadinessState(
  state: SceneReadinessState,
  {
    blockers,
    capReached,
    key,
    settledFramesRequired,
  }: {
    blockers: readonly string[]
    capReached: boolean
    key: SceneReadinessState['key']
    settledFramesRequired: number
  },
): SceneReadinessState {
  const current = Object.is(state.key, key)
    ? state
    : { key, ready: false, settledFrames: 0 }
  if (shouldWaitForSceneReadiness(blockers, capReached)) {
    return current.ready || current.settledFrames > 0
      ? { ...current, ready: false, settledFrames: 0 }
      : current
  }
  if (current.ready) return current

  const settledFrames = current.settledFrames + 1
  return {
    ...current,
    ready: settledFrames >= settledFramesRequired,
    settledFrames,
  }
}
