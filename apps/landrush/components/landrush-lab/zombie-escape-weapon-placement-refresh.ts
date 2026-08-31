export type ZombieEscapeWeaponPlacementRefreshController = Readonly<{
  dispose: () => void
  flush: () => boolean
  schedule: () => void
}>

type ZombieEscapeWeaponPlacementHistoryState = Readonly<{
  futureStates: readonly unknown[]
  isTracking: boolean
}>

export function createZombieEscapeWeaponPlacementHistoryRefreshListener({
  initialState,
  schedule,
}: {
  initialState: ZombieEscapeWeaponPlacementHistoryState
  schedule: () => void
}) {
  let futureStateCount = initialState.futureStates.length
  let tracking = initialState.isTracking

  return (state: ZombieEscapeWeaponPlacementHistoryState) => {
    const nextFutureStateCount = state.futureStates.length
    const settledPausedChange = !tracking && state.isTracking
    const historyPositionChanged = futureStateCount !== nextFutureStateCount
    futureStateCount = nextFutureStateCount
    tracking = state.isTracking
    if (settledPausedChange || historyPositionChanged) schedule()
  }
}

export function createZombieEscapeWeaponPlacementRefreshController({
  isBuildPhase,
  refresh,
  scheduleMicrotask = queueMicrotask,
}: {
  isBuildPhase: () => boolean
  refresh: () => void
  scheduleMicrotask?: (callback: () => void) => void
}): ZombieEscapeWeaponPlacementRefreshController {
  let disposed = false
  let generation = 0

  return {
    dispose() {
      disposed = true
      generation += 1
    },
    flush() {
      generation += 1
      if (disposed || !isBuildPhase()) return false
      refresh()
      return true
    },
    schedule() {
      if (disposed || !isBuildPhase()) return
      const scheduledGeneration = ++generation
      scheduleMicrotask(() => {
        if (disposed || scheduledGeneration !== generation) return
        scheduleMicrotask(() => {
          if (disposed || scheduledGeneration !== generation || !isBuildPhase()) {
            return
          }
          refresh()
        })
      })
    },
  }
}
