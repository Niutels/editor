import {
  isLandrushZombieEscapeDesiredCollisionWorldReady,
  type LandrushZombieEscapeCollisionWorldBuildState,
} from './landrush-zombie-escape-collision-world-lifecycle'

export type LandrushZombieEscapeNavigationReadiness = Readonly<{
  authorityKey: string
  mountGeneration: string
  generation: number
  requestedSignature: string
  installedSignature: string | null
  status: 'pending' | 'ready' | 'failed'
  error: string | null
}>

export function isLandrushZombieEscapeCollisionWorldInstalled<World>({
  error,
  installedCombatWorld,
  installedNavigationWorld,
  worlds,
}: {
  error: string | null
  installedCombatWorld: World | null
  installedNavigationWorld: World | null
  worlds: { combat: World; navigation: World } | null
}) {
  return (
    error === null &&
    worlds !== null &&
    installedNavigationWorld === worlds.navigation &&
    installedCombatWorld === worlds.combat
  )
}

export function createLandrushZombieEscapeNavigationReadiness<World>({
  authorityKey,
  currentBuild,
  error,
  generation,
  installedCombatWorld,
  installedNavigationWorld,
  mountGeneration,
  requestedSignature,
  state,
}: {
  authorityKey: string
  currentBuild: boolean
  error: string | null
  generation: number
  installedCombatWorld: World | null
  installedNavigationWorld: World | null
  mountGeneration: string
  requestedSignature: string
  state: LandrushZombieEscapeCollisionWorldBuildState<{
    combat: World
    navigation: World
  }>
}): LandrushZombieEscapeNavigationReadiness {
  const ready =
    currentBuild &&
    isLandrushZombieEscapeDesiredCollisionWorldReady({
      desiredSignature: requestedSignature,
      state,
    }) &&
    isLandrushZombieEscapeCollisionWorldInstalled({
      error,
      installedCombatWorld,
      installedNavigationWorld,
      worlds: state.worlds,
    })
  const failed =
    currentBuild &&
    (!state.ready || error !== null) &&
    state.generation > 0 &&
    state.pendingSignature === null
  return {
    authorityKey,
    mountGeneration,
    generation,
    requestedSignature,
    installedSignature: ready ? state.signature : null,
    status: ready ? 'ready' : failed ? 'failed' : 'pending',
    error: failed ? (error ?? 'The island navigation worker could not prepare this world.') : null,
  }
}

export function reconcileLandrushZombieEscapeNavigationReadiness({
  authorityKey,
  current,
  mountGeneration,
  reported,
}: {
  authorityKey: string
  current: LandrushZombieEscapeNavigationReadiness | null
  mountGeneration: string
  reported: LandrushZombieEscapeNavigationReadiness
}) {
  if (reported.authorityKey !== authorityKey || reported.mountGeneration !== mountGeneration) {
    return current
  }
  if (
    current?.authorityKey === authorityKey &&
    current.mountGeneration === mountGeneration &&
    current.generation >= reported.generation
  ) {
    return current
  }
  return reported
}

export function resolveLandrushZombieEscapeNavigationReady({
  admitted,
  authorityKey,
  enabled,
  mountGeneration,
  status,
}: {
  admitted: boolean
  authorityKey: string
  enabled: boolean
  mountGeneration: string
  status: LandrushZombieEscapeNavigationReadiness | null
}) {
  return (
    !enabled ||
    (admitted &&
      status?.authorityKey === authorityKey &&
      status.mountGeneration === mountGeneration &&
      status.status === 'ready' &&
      status.installedSignature !== null &&
      status.installedSignature === status.requestedSignature)
  )
}

export function resolveLandrushZombieEscapeRecoveryPresentation({
  generatedAssetFailureCount,
  generatedAssetsRetrying,
  navigationError,
  navigationRetrying,
}: {
  generatedAssetFailureCount: number
  generatedAssetsRetrying: boolean
  navigationError: string | null
  navigationRetrying: boolean
}) {
  const retrying = generatedAssetsRetrying || navigationRetrying
  const visible = generatedAssetFailureCount > 0 || navigationError !== null || retrying
  return { retrying, visible, zIndex: visible ? '240' : '120' }
}
