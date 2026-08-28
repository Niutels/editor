export type LandrushIslandZombieStartupPhase =
  | 'critical-loading'
  | 'scene-prime'
  | 'fade'
  | 'live'
  | 'render-error'

export type LandrushIslandZombieLiveAdmission =
  | 'blocked'
  | 'core'
  | 'collider'
  | 'ambient'
  | 'deferred'
  | 'cosmetics'

export type LandrushIslandZombieStartupState = Readonly<{
  admission: LandrushIslandZombieLiveAdmission
  phase: LandrushIslandZombieStartupPhase
}>

export type LandrushIslandZombieStartupLifecycle = Readonly<{
  authorityKey: string
  enabled: boolean
  generation: number
  readinessReady: boolean
  runKey: string
}>

export type LandrushIslandZombieStartupLifecycleReconciliation = Readonly<{
  lifecycle: LandrushIslandZombieStartupLifecycle
  reset: boolean
}>

export type LandrushIslandZombieStartupEvent =
  | 'critical-ready'
  | 'scene-prime-ready'
  | 'scene-prime-failed'
  | 'startup-failed'
  | 'fade-finished'
  | 'admit-collider'
  | 'admit-ambient'
  | 'admit-deferred'
  | 'admit-cosmetics'

export type LandrushIslandZombieStartupGates = Readonly<{
  ambientLifeAdmitted: boolean
  colliderRebuildAdmitted: boolean
  coreGameplayAdmitted: boolean
  cosmeticAssetsAdmitted: boolean
  deferredRuntimeAdmitted: boolean
  loadingOverlayVisible: boolean
  sceneDrawDisabled: boolean
}>

export const LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS = 4
export const LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_SUBMISSIONS = 12
export const LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_ATTEMPTS = 12
export const LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_WAIT_MS = 5_000
export const LANDRUSH_ISLAND_ZOMBIE_STARTUP_TERMINAL_DEADLINE_MS = 110_000

export type LandrushIslandZombieScenePrimeFenceStatus =
  | 'unavailable'
  | 'missing'
  | 'pending'
  | 'settled'
  | 'failed'

export type LandrushIslandZombieScenePrimeAction = 'wait' | 'insert-fence' | 'settle' | 'fail'

const LIVE_ADMISSION_ORDER: Record<LandrushIslandZombieLiveAdmission, number> = {
  blocked: 0,
  core: 1,
  collider: 2,
  ambient: 3,
  deferred: 4,
  cosmetics: 5,
}

export function createLandrushIslandZombieStartupState(): LandrushIslandZombieStartupState {
  return { admission: 'blocked', phase: 'critical-loading' }
}

export function reconcileLandrushIslandZombieStartupLifecycle({
  authorityKey,
  current,
  enabled,
  readinessReady,
  runKey,
}: {
  authorityKey: string
  current: LandrushIslandZombieStartupLifecycle | null
  enabled: boolean
  readinessReady: boolean
  runKey: string
}): LandrushIslandZombieStartupLifecycleReconciliation {
  if (!current) {
    return {
      lifecycle: { authorityKey, enabled, generation: 0, readinessReady, runKey },
      reset: false,
    }
  }

  const reset =
    enabled !== current.enabled ||
    (enabled &&
      current.enabled &&
      (authorityKey !== current.authorityKey ||
        runKey !== current.runKey ||
        (current.readinessReady && !readinessReady)))
  return {
    lifecycle: {
      authorityKey,
      enabled,
      generation: current.generation + (reset ? 1 : 0),
      readinessReady,
      runKey,
    },
    reset,
  }
}

export function canAdvanceLandrushIslandZombieStartupLifecycle(
  lifecycle: LandrushIslandZombieStartupLifecycle | null,
  expectedGeneration: number,
) {
  return (
    lifecycle?.enabled === true &&
    lifecycle.readinessReady &&
    lifecycle.generation === expectedGeneration
  )
}

export function canTerminateLandrushIslandZombieStartupLifecycle(
  lifecycle: LandrushIslandZombieStartupLifecycle | null,
  expectedGeneration: number,
) {
  return lifecycle?.enabled === true && lifecycle.generation === expectedGeneration
}

export function advanceLandrushIslandZombieStartupState(
  state: LandrushIslandZombieStartupState,
  event: LandrushIslandZombieStartupEvent,
): LandrushIslandZombieStartupState {
  if (event === 'startup-failed' && state.phase !== 'live' && state.phase !== 'render-error') {
    return { admission: 'blocked', phase: 'render-error' }
  }
  if (state.phase === 'critical-loading' && event === 'critical-ready') {
    return { admission: 'blocked', phase: 'scene-prime' }
  }
  if (state.phase === 'scene-prime' && event === 'scene-prime-ready') {
    return { admission: 'blocked', phase: 'fade' }
  }
  if (state.phase === 'scene-prime' && event === 'scene-prime-failed') {
    return { admission: 'blocked', phase: 'render-error' }
  }
  if (state.phase === 'fade' && event === 'fade-finished') {
    return { admission: 'core', phase: 'live' }
  }
  if (state.phase !== 'live') return state
  if (state.admission === 'core' && event === 'admit-collider') {
    return { admission: 'collider', phase: 'live' }
  }
  if (state.admission === 'collider' && event === 'admit-ambient') {
    return { admission: 'ambient', phase: 'live' }
  }
  if (state.admission === 'ambient' && event === 'admit-deferred') {
    return { admission: 'deferred', phase: 'live' }
  }
  if (state.admission === 'deferred' && event === 'admit-cosmetics') {
    return { admission: 'cosmetics', phase: 'live' }
  }
  return state
}

export function resolveLandrushIslandZombieStartupGates(
  state: LandrushIslandZombieStartupState,
): LandrushIslandZombieStartupGates {
  const admission = LIVE_ADMISSION_ORDER[state.admission]
  return {
    ambientLifeAdmitted: state.phase === 'live' && admission >= LIVE_ADMISSION_ORDER.ambient,
    colliderRebuildAdmitted: state.phase === 'live' && admission >= LIVE_ADMISSION_ORDER.collider,
    coreGameplayAdmitted: state.phase === 'live' && admission >= LIVE_ADMISSION_ORDER.core,
    cosmeticAssetsAdmitted: state.phase === 'live' && admission >= LIVE_ADMISSION_ORDER.cosmetics,
    deferredRuntimeAdmitted: state.phase === 'live' && admission >= LIVE_ADMISSION_ORDER.deferred,
    loadingOverlayVisible: state.phase !== 'live',
    sceneDrawDisabled: state.phase === 'critical-loading' || state.phase === 'render-error',
  }
}

export function resolveLandrushIslandZombieScenePrimeAction({
  attempts,
  elapsedMs,
  fenceStatus,
  successfulSubmissions,
}: {
  attempts: number
  elapsedMs: number
  fenceStatus: LandrushIslandZombieScenePrimeFenceStatus
  successfulSubmissions: number
}): LandrushIslandZombieScenePrimeAction {
  const primeLimitReached =
    attempts >= LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_ATTEMPTS ||
    elapsedMs >= LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_WAIT_MS
  if (fenceStatus === 'failed' || fenceStatus === 'unavailable') return 'fail'
  if (successfulSubmissions < LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS) {
    return primeLimitReached ? 'fail' : 'wait'
  }
  if (fenceStatus === 'settled') return 'settle'
  if (
    successfulSubmissions >= LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_SUBMISSIONS ||
    primeLimitReached
  ) {
    return 'fail'
  }
  return fenceStatus === 'missing' ? 'insert-fence' : 'wait'
}
