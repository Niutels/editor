import type {
  LandrushIslandCameraOwner,
  LandrushIslandViewMode,
} from './landrush-island-camera-owner'
import type { ZombieEscapeGamePhase } from './zombie-escape-simulation'

export function resolveLandrushZombieEscapePhaseReady({
  authorityResyncActive,
  buildMode,
  cameraOwner,
  cameraTransitionActive,
  fpvView,
  generatedAssetsReady,
  loadingActive,
  mapView,
  modeTransitionActive,
  phase,
  sceneViewMode,
  viewMode,
  zombieEscapeEnabled,
}: {
  authorityResyncActive: boolean
  buildMode: boolean
  cameraOwner: LandrushIslandCameraOwner
  cameraTransitionActive: boolean
  fpvView: boolean
  generatedAssetsReady: boolean
  loadingActive: boolean
  mapView: boolean
  modeTransitionActive: boolean
  phase: ZombieEscapeGamePhase
  sceneViewMode: LandrushIslandViewMode
  viewMode: LandrushIslandViewMode
  zombieEscapeEnabled: boolean
}) {
  if (!zombieEscapeEnabled || !generatedAssetsReady || loadingActive || authorityResyncActive) {
    return false
  }
  if (phase === 'build') return !modeTransitionActive
  return (
    cameraOwner === 'zombie' &&
    !cameraTransitionActive &&
    viewMode === 'player' &&
    sceneViewMode === 'player' &&
    !buildMode &&
    !mapView &&
    !fpvView
  )
}

export type LandrushZombieEscapeNightStartReadiness = Readonly<{
  contextKey: string
  ready: boolean
}>

export function createLandrushZombieEscapeNightStartReadiness(): LandrushZombieEscapeNightStartReadiness {
  return { contextKey: '', ready: false }
}

export function reconcileLandrushZombieEscapeNightStartReadiness({
  buildPhaseActive,
  candidateReady,
  contextKey,
  current,
}: {
  buildPhaseActive: boolean
  candidateReady: boolean
  contextKey: string
  current: LandrushZombieEscapeNightStartReadiness
}): LandrushZombieEscapeNightStartReadiness {
  const ready =
    buildPhaseActive && (candidateReady || (current.contextKey === contextKey && current.ready))
  if (current.contextKey === contextKey && current.ready === ready) return current
  return { contextKey, ready }
}

export function resolveLandrushZombieEscapeInteractionActionable({
  collisionWorldReady,
  interactionEligible,
}: {
  collisionWorldReady: boolean
  interactionEligible: boolean
}) {
  return interactionEligible && collisionWorldReady
}

export function resolveLandrushZombieEscapeLocomotionBaseEnabled({
  baseMovementEnabled,
  interactionActionable,
  phase,
  zombieEscapeEnabled,
}: {
  baseMovementEnabled: boolean
  interactionActionable: boolean
  phase: ZombieEscapeGamePhase
  zombieEscapeEnabled: boolean
}) {
  return baseMovementEnabled && (!zombieEscapeEnabled || phase !== 'night' || interactionActionable)
}

export function resolveLandrushZombieEscapeCombatFireEnabled({
  collisionWorldReady,
  interactionEligible,
  muzzleReady,
  requested,
}: {
  collisionWorldReady: boolean
  interactionEligible: boolean
  muzzleReady: boolean
  requested: boolean
}) {
  return requested && interactionEligible && collisionWorldReady && muzzleReady
}
