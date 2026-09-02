'use client'

import { type ProfileMoneyOperationRequest, renderScheduler } from '@landrush/runtime'
import { subscribeSceneCommits, useInteractive, useScene } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import {
  lazy,
  type MutableRefObject,
  memo,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type Camera, type Group, Plane, Raycaster, Vector2, Vector3 } from 'three'
import {
  publishLandrushZombieEscapeHudPortal,
  releaseLandrushZombieEscapeHudPortal,
  updateLandrushZombieEscapeHudPortalSnapshot,
} from '../../lib/zombie-escape-hud-portal'
import {
  LandrushControllerCommandHud,
  type LandrushControllerCommands,
} from './landrush-controller-command-hud'
import { readLandrushGamepadInput } from './landrush-gamepad-input'
import {
  createLandrushIslandRuntimeDoorPassabilityKey,
  createLandrushZombieEscapeCollisionWorldSignature,
  createLandrushZombieEscapeStableClosedDoorPassability,
  type LandrushZombieEscapeCollisionWorldCompilation,
  type LandrushZombieEscapeCollisionWorldInput,
  type LandrushZombieEscapeCollisionWorlds,
  type LandrushZombieEscapeSurfaceNavigationSupport,
  resolveLandrushIslandRuntimeDoorPassabilityKey,
  resolveLandrushZombieEscapeLiveOperableDoorIds,
  resolveLandrushZombieEscapeRuntimePassableDoorIds,
} from './landrush-island-ai-navigation-semantics'
import { landrushIslandInputTargetBlocksGameplay } from './landrush-island-input-capture'
import type {
  LandrushIslandMaterialPresentationOwner,
  LandrushIslandMaterialReadinessMesh,
} from './landrush-island-material-presentation'
import {
  LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  LandrushIslandMaterialPresentationRenderReadiness,
} from './landrush-island-material-presentation-readiness'
import {
  createLandrushIslandPalmCollisionCircles,
  type LandrushIslandPalmPlacement,
} from './landrush-island-palm-layout'
import {
  createLandrushRobotShoulderTorchLightingState,
  type LandrushRobotShoulderTorchLightingState,
} from './landrush-robot-shoulder-torch'
import {
  createLandrushRobotWeaponCombatState,
  createLandrushRobotWeaponMuzzlePose,
  type LandrushRobotWeaponCombatState,
  type LandrushRobotWeaponMuzzlePose,
  LandrushRobotWeaponRig,
} from './landrush-robot-weapon-rig'
import {
  createLandrushZombieEscapeNightStartReadiness,
  reconcileLandrushZombieEscapeNightStartReadiness,
  resolveLandrushZombieEscapeCombatFireEnabled,
  resolveLandrushZombieEscapeInteractionActionable,
} from './landrush-zombie-escape-actionability'
import { resolveLandrushZombieEscapeAimPlaneElevation } from './landrush-zombie-escape-aim'
import { createLandrushZombieEscapeIntegratedArena } from './landrush-zombie-escape-arena'
import {
  prepareLandrushZombieEscapeCameraForRenderReadiness,
  resolveLandrushZombieEscapeCamera,
  resolveLandrushZombieEscapeCameraLayout,
} from './landrush-zombie-escape-camera'
import {
  createBrowserLandrushZombieEscapeCollisionWorldBuildScheduleHost,
  createLandrushZombieEscapeCollisionWorldBuildCoordinator,
  createLandrushZombieEscapeCollisionWorldBuildState,
  isLandrushZombieEscapeDesiredCollisionWorldReady,
  type LandrushZombieEscapeCollisionWorldBuildCoordinator,
  resolveLandrushZombieEscapeCollisionWorldBuildPriority,
  resolveLandrushZombieEscapeCollisionWorldPhaseReady,
} from './landrush-zombie-escape-collision-world-lifecycle'
import { createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler } from './landrush-zombie-escape-collision-world-worker-client'
import {
  shouldShowLandrushZombieEscapeMoney,
  shouldShowLandrushZombieEscapeNightInteractionHud,
  shouldShowLandrushZombieEscapeTouchControls,
} from './landrush-zombie-escape-hud-visibility'
import {
  createLandrushZombieEscapeCombatSnapshot,
  type LandrushZombieEscapeCombatSnapshotReader,
} from './landrush-zombie-escape-multiplayer'
import {
  createLandrushZombieEscapeNavigationReadiness,
  isLandrushZombieEscapeCollisionWorldInstalled,
  type LandrushZombieEscapeNavigationReadiness,
  resolveLandrushZombieEscapeRecoveryPresentation,
} from './landrush-zombie-escape-navigation-readiness'
import { LandrushZombieEscapePlayerHitPresentationView } from './landrush-zombie-escape-player-hit-presentation'
import {
  applyLandrushZombieEscapeRoomState,
  type LandrushZombieEscapeAppliedRoomState,
  type LandrushZombieEscapeClockMode,
  type LandrushZombieEscapeRoomStateObservation,
} from './landrush-zombie-escape-room-state'
import {
  advanceLandrushZombieEscapePhaseClock,
  advanceLandrushZombieEscapeRestartButtonState,
  canAdvanceLandrushZombieEscapeIntegratedSimulation,
  createLandrushZombieEscapePhaseClock,
  createLandrushZombieEscapeRestartButtonState,
  requestLandrushZombieEscapeNightStart,
  restartLandrushZombieEscapeIntegratedSimulation,
  stepLandrushZombieEscapeIntegratedSimulation,
} from './landrush-zombie-escape-runtime'
import {
  applyLandrushZombieEscapeProfileMoneyOperations,
  captureLandrushZombieEscapeEconomyCheckpoint,
  hydrateLandrushZombieEscapeProfileMoney,
  resolveLandrushZombieEscapeDeathAction,
  shouldAttemptLandrushZombieEscapeDeathReport,
} from './landrush-zombie-escape-session'
import { LandrushZombieEscapeStructurePresentation } from './landrush-zombie-escape-structure-presentation'
import {
  type LandrushZombieEscapeTouchInputKind,
  type LandrushZombieEscapeTouchInputState,
  resetLandrushZombieEscapeTouchInput,
  resolveLandrushZombieEscapeTouchAimDirection,
} from './landrush-zombie-escape-touch-input'
import { LandrushZombieEscapeTouchJoysticks } from './landrush-zombie-escape-touch-joysticks'
import { ZombieEscapeActors } from './zombie-escape-actors'
import type { ZombieEscapeAmbientNpcPresentationRegistry } from './zombie-escape-ambient-npc-presentation-registry'
import { ZombieEscapeAudio } from './zombie-escape-audio'
import { inspectZombieEscapeSparseAttachmentHeapLeases } from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SEED,
  ZOMBIE_ESCAPE_SIMULATION,
  type ZombieEscapeInputMode,
} from './zombie-escape-config'
import {
  createZombieEscapeControlState,
  isZombieEscapeGamepadFirePressed,
} from './zombie-escape-controls'
import { ZombieEscapeEffects } from './zombie-escape-effects'
import type { ZombieEscapeGeneratedAssetReadinessSnapshot } from './zombie-escape-generated-asset-readiness'
import {
  clearZombieEscapeGeneratedAssetCaches,
  type ZombieEscapeGeneratedAssetFailure,
} from './zombie-escape-generated-assets'
import { ZombieEscapeMoneyBadge } from './zombie-escape-hud'
import type { LandrushZombieEscapeNavigationScaleProofResult } from './zombie-escape-navigation-scale-proof'
import type { LandrushZombieEscapeNavigationScaleProofFixtureWorldSummary } from './zombie-escape-navigation-scale-proof-fixture'
import {
  createZombieEscapeRenderReadinessRegistry,
  getZombieEscapeRenderRepresentativeKeys,
  type ZombieEscapeRenderReadinessRegistry,
} from './zombie-escape-render-readiness'
import {
  countZombieEscapeShotsByPhase,
  createZombieEscapeHudSnapshot,
  createZombieEscapeSimulation,
  cycleZombieEscapeOwnedWeapon,
  getZombieEscapeMeleeProgress,
  installZombieEscapeAmbientHandoffCandidates,
  isZombieEscapeWeaponPickupAvailable,
  requestZombieEscapeDeterministicObstacleDelta,
  resolveZombieEscapeScheduledPopulation,
  restoreZombieEscapeDefaultMuzzlePose,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  setZombieEscapeObstacleDamageEnabled,
  setZombieEscapePlayerMuzzlePose,
  setZombieEscapeWeaponPickupPlacements,
  synchronizeZombieEscapePassableObstacleIds,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  type ZombieEscapeGamePhase,
  type ZombieEscapeGameStatus,
  type ZombieEscapeHudSnapshot,
  type ZombieEscapeObstacleDeltaRequestResult,
  type ZombieEscapePickupPrompt,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import {
  createZombieEscapeImpactVisualRegistry,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import { ZombieEscapeWeaponInventoryRow } from './zombie-escape-weapon-inventory'
import {
  resolveZombieEscapeWeaponPickupPlacements,
  resolveZombieEscapeWeaponPlacementSeed,
  translateZombieEscapeWeaponPickupPlacements,
} from './zombie-escape-weapon-placement'
import {
  createZombieEscapeWeaponPlacementHistoryRefreshListener,
  createZombieEscapeWeaponPlacementRefreshController,
} from './zombie-escape-weapon-placement-refresh'
import {
  createZombieEscapeWeaponSwitchInputState,
  readZombieEscapeShoulderWeaponSwitch,
  readZombieEscapeWheelWeaponSwitch,
  resetZombieEscapeWeaponSwitchInput,
} from './zombie-escape-weapon-switch-input'
import type { ZombieEscapeArenaData } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS } from './zombie-escape-zombie-roster'

const GENERATED_ASSET_AUTO_RETRY_DELAYS_MS = [650, 1_300] as const
const LANDRUSH_ZOMBIE_ESCAPE_SURFACE_SUPPORT_ID = 'landrush-island:surface-boundary'
const LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK_PROTECTED_HEALTH = 1_000_000_000
export const LANDRUSH_ZOMBIE_ESCAPE_MAXIMUM_RECOVERY_SUBSTEPS = 2

function createOfflineZombieEscapeWeaponPlacementSessionId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

const LazyLandrushZombieNavigationOverlay = lazy(
  () => import('./landrush-zombie-navigation-overlay'),
)

export const LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER = {
  effects: 0.9,
  floorPresentation: 0.92,
  input: 0.3,
  motion: 0.4,
  navigationOverlay: 0.97,
  passthrough: 0.95,
  presentation: 0.85,
  robot: 0.6,
  simulation: 0.8,
  viewerRender: 1,
  weapon: 0.7,
} as const

declare global {
  interface Window {
    __LANDRUSH_ZOMBIE_ESCAPE__?: unknown
    __LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?: LandrushZombieEscapeRoomSoakBridge
  }
}

export type LandrushZombieEscapeRoomSoakState = {
  active: boolean
  enabled: boolean
  originalObstacleDamageEnabled: boolean | null
  originalPlayerHealth: number | null
  playerProtected: boolean
  targetZombieCount: number
}

export type LandrushZombieEscapeRoomSoakSnapshot = Readonly<{
  active: boolean
  activeZombieCount: number
  enabled: boolean
  obstacleDamageSuppressed: boolean
  obstacleDeltaAppliedRevision: number
  obstacleDeltaRequestedRevision: number
  phaseHeld: boolean
  playerProtected: boolean
  reachableSpawnCompletedCount: number
  representedZombieCount: number
  rosterRealized: boolean
  scheduledZombieCount: number
  targetZombieCount: number
  zombieCapacity: number
}>

export type LandrushZombieEscapeRoomSoakPlayerState = {
  audioWriteSequence: number
  health: number
  hitSlowSeconds: number
  hurtFlash: number
  phase: ZombieEscapeGamePhase
  playerProtected: boolean
  status: ZombieEscapeGameStatus
}

export type LandrushZombieEscapeRoomSoakBridge = {
  begin: () => LandrushZombieEscapeRoomSoakSnapshot
  end: () => LandrushZombieEscapeRoomSoakSnapshot
  getPlayerState: (
    target: LandrushZombieEscapeRoomSoakPlayerState,
  ) => LandrushZombieEscapeRoomSoakPlayerState
  getState: () => LandrushZombieEscapeRoomSoakSnapshot
  releasePlayerProtection: () => LandrushZombieEscapeRoomSoakSnapshot
  requestObstacleDelta: () => ZombieEscapeObstacleDeltaRequestResult
  requestTargetRoster: () => LandrushZombieEscapeRoomSoakSnapshot
}

type LandrushZombieEscapeNavigationScaleProofRunner =
  () => Promise<LandrushZombieEscapeNavigationScaleProofResult>

type LandrushZombieEscapeNavigationScaleProofFixtureCapture = Readonly<{
  compilation: LandrushZombieEscapeCollisionWorldCompilation
  expectedWorld: LandrushZombieEscapeNavigationScaleProofFixtureWorldSummary
  proofInput: Readonly<{
    collisionWorldGeneration: number
    worldOrigin: Readonly<{ x: number; y: number; z: number }>
  }>
}>

type LandrushZombieEscapeNavigationScaleProofFixtureCaptureRunner =
  () => Promise<LandrushZombieEscapeNavigationScaleProofFixtureCapture>

type LandrushZombieEscapeNavigationScaleProofCache = {
  controller: AbortController
  key: string
  promise: Promise<LandrushZombieEscapeNavigationScaleProofResult>
}

const LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_TIMEOUT_MS = 120_000

export function createLandrushZombieEscapeNavigationScaleProofCacheKey({
  collisionWorldGeneration,
  collisionWorldSignature,
  world,
}: {
  collisionWorldGeneration: number
  collisionWorldSignature: string
  world: Pick<
    ZombieEscapeSimulation['collisionWorld'],
    'activationRevision' | 'revision' | 'semanticKey'
  >
}) {
  return JSON.stringify([
    collisionWorldGeneration,
    world.revision,
    world.activationRevision,
    world.semanticKey,
    collisionWorldSignature,
  ])
}

export function shouldEnableLandrushZombieEscapeNavigationScaleProof(search: string) {
  const params = new URLSearchParams(search)
  return params.get('bench') === '1' && params.get('landrushNavScaleProof') === '1'
}

export function shouldEnableLandrushZombieEscapeNavigationScaleProofFixtureCapture(search: string) {
  const params = new URLSearchParams(search)
  return params.get('bench') === '1' && params.get('landrushNavFixtureCapture') === '1'
}

export function shouldEnableLandrushZombieNavigationOverlay(search: string) {
  const params = new URLSearchParams(search)
  return params.get('landrushNavOverlay') === '1' || params.get('navOverlay') === '1'
}

export function shouldPublishLandrushZombieEscapeIntegratedDebugState(search: string) {
  return new URLSearchParams(search).get('bench') === '1'
}

export function accumulateLandrushZombieEscapeFrameTime(
  accumulatorSeconds: number,
  frameDeltaSeconds: number,
) {
  const fixedDeltaSeconds = ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
  const maximumAccumulatorSeconds =
    fixedDeltaSeconds * (LANDRUSH_ZOMBIE_ESCAPE_MAXIMUM_RECOVERY_SUBSTEPS + 1) - Number.EPSILON
  return Math.min(
    Math.max(0, accumulatorSeconds) + Math.max(0, frameDeltaSeconds),
    maximumAccumulatorSeconds,
  )
}

export function installLandrushZombieEscapeAmbientHandoffAtNightBoundary(
  registry: ZombieEscapeAmbientNpcPresentationRegistry,
  simulation: ZombieEscapeSimulation,
) {
  return installZombieEscapeAmbientHandoffCandidates(simulation, registry.captureSource())
}

export function areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(
  first: ZombieEscapeHudSnapshot,
  second: ZombieEscapeHudSnapshot,
) {
  const terminal = second.status !== 'playing'
  return (
    first.phase === second.phase &&
    first.status === second.status &&
    clampLandrushZombieEscapeHudHealth(first.health) ===
      clampLandrushZombieEscapeHudHealth(second.health) &&
    first.money === second.money &&
    first.weaponIndex === second.weaponIndex &&
    first.weaponInventoryMask === second.weaponInventoryMask &&
    landrushZombieEscapePickupPromptsMatch(first.pickupPrompt, second.pickupPrompt) &&
    (!terminal ||
      (first.kills === second.kills &&
        first.elapsedSeconds.toFixed(1) === second.elapsedSeconds.toFixed(1)))
  )
}

export function isLandrushZombieEscapeNavigationScaleProofFixtureCaptureReady({
  buildReady,
  captureEnabled,
  compilationSignature,
  desiredSignature,
  effectiveNavigationWorld,
  installedNavigationWorld,
  installedSignature,
  sourceNavigationWorld,
}: {
  buildReady: boolean
  captureEnabled: boolean
  compilationSignature: string | null
  desiredSignature: string
  effectiveNavigationWorld: unknown
  installedNavigationWorld: unknown
  installedSignature: string | null
  sourceNavigationWorld: unknown
}) {
  return (
    buildReady &&
    captureEnabled &&
    compilationSignature !== null &&
    effectiveNavigationWorld !== null &&
    installedNavigationWorld !== null &&
    sourceNavigationWorld !== null &&
    compilationSignature === installedSignature &&
    installedSignature === desiredSignature &&
    installedNavigationWorld === sourceNavigationWorld
  )
}

export type LandrushZombieEscapePlayerMotion = {
  falling: boolean
  heading: number
  isMoving: boolean
  maximumSpeedScale: number
  position: Vector3
  runRequested: boolean
  speed: number
  velocity: Vector3
}

export type LandrushZombieEscapeModeProps = {
  active: boolean
  ambientNpcPresentationRegistry: ZombieEscapeAmbientNpcPresentationRegistry
  combatHeadingRef: MutableRefObject<number | null>
  combatSnapshotReaderRef?: MutableRefObject<LandrushZombieEscapeCombatSnapshotReader | null>
  expectedPhase: ZombieEscapeGamePhase
  groundY: number
  materialPresentation: LandrushIslandMaterialPresentationOwner
  materialPresentationReadinessMeshes: readonly LandrushIslandMaterialReadinessMesh[]
  motionRef: MutableRefObject<LandrushZombieEscapePlayerMotion | null>
  navigationAuthorityKey: string
  navigationMountGeneration: string
  onCollisionWorldReadinessChange: (readiness: LandrushZombieEscapeNavigationReadiness) => void
  /**
   * Rare-event snapshots of temporarily destroyed furniture node IDs. An empty set clears all
   * exclusions (initial mount, reset, or unmount); consumers may update derived collision
   * structures but must not mutate the canonical scene graph.
   */
  onDestroyedFurnitureIdsChange?: (nodeIds: ReadonlySet<string>) => void
  onGeneratedAssetsReadinessChange?: (
    readiness: ZombieEscapeGeneratedAssetReadinessSnapshot,
  ) => void
  onInteractionActionabilityChange: (actionable: boolean) => void
  onNightTransitionStart: () => void
  onPhaseChange: (phase: ZombieEscapeGamePhase) => void
  onProfileMoneyOperation?: (operation: ProfileMoneyOperationRequest) => number | null
  onResetExternalPlayerMotion: () => void
  onStatusChange: (status: ZombieEscapeGameStatus) => void
  onZombieEscapeDeath?: () => boolean
  palmLayout: readonly LandrushIslandPalmPlacement[]
  phaseReady: boolean
  playerColor: string
  profileMoneyBalance?: number
  spawn: Readonly<{ x: number; z: number }>
  surfacePoints: readonly Readonly<{ x: number; z: number }>[]
  zombieEscapeClockMode: LandrushZombieEscapeClockMode
  zombieEscapeRoomStateObservation: LandrushZombieEscapeRoomStateObservation | null
  startZombieEscapeNight: () => boolean
  viewerSceneReady: boolean
  visualRootRef: MutableRefObject<Group | null>
  zombieEscapeTouchInputRef: MutableRefObject<LandrushZombieEscapeTouchInputState>
}

export function shouldLandrushZombieEscapeOwnCanvasPointerEvents(
  active: boolean,
  expectedPhase: ZombieEscapeGamePhase,
) {
  return active && expectedPhase === 'night'
}

export function isLandrushZombieEscapeDirectCombatPointer(pointerType: string) {
  return pointerType !== 'touch'
}

export function isLandrushZombieEscapeGameplayKeyboardCode(code: string) {
  return (
    code === 'KeyW' ||
    code === 'ArrowUp' ||
    code === 'KeyA' ||
    code === 'ArrowLeft' ||
    code === 'KeyS' ||
    code === 'ArrowDown' ||
    code === 'KeyD' ||
    code === 'ArrowRight' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'Space' ||
    code === 'KeyE'
  )
}

export function acquireLandrushZombieEscapeCanvasPointerOwnership({
  getEnabled,
  setEnabled,
}: {
  getEnabled: () => boolean
  setEnabled: (enabled: boolean) => void
}) {
  const previouslyEnabled = getEnabled()
  if (previouslyEnabled) setEnabled(false)
  return () => {
    if (previouslyEnabled) setEnabled(true)
  }
}

export function createLandrushZombieEscapeRoomSoakState(): LandrushZombieEscapeRoomSoakState {
  return {
    active: false,
    enabled: false,
    originalObstacleDamageEnabled: null,
    originalPlayerHealth: null,
    playerProtected: false,
    targetZombieCount: 0,
  }
}

export function readLandrushZombieEscapeRoomSoakSnapshot(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
): LandrushZombieEscapeRoomSoakSnapshot {
  const scheduledZombieCount = resolveZombieEscapeScheduledPopulation(simulation)
  let representedZombieCount = 0
  const zombies = simulation.zombies
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) continue
    if (
      zombies.navigationConnector[slot]! >= 0 ||
      zombies.navigationWaypointNode[slot]! >= 0 ||
      zombies.navigationIntentValid[slot] !== 0 ||
      zombies.navigationIntentPending[slot] !== 0 ||
      zombies.navigationIntentAdmissionDeferredReasons[slot] !== 0
    ) {
      representedZombieCount += 1
    }
  }
  const rosterRealized =
    state.targetZombieCount > 0 &&
    simulation.collisionWorld.navigationMode === 'sparse' &&
    simulation.zombies.pool.activeCount === state.targetZombieCount &&
    scheduledZombieCount === state.targetZombieCount &&
    representedZombieCount === state.targetZombieCount &&
    simulation.navigationSparseSpawnSearchCompletedCount >= state.targetZombieCount &&
    !simulation.navigationSparseSpawnSearchActive
  return {
    active: state.active,
    activeZombieCount: simulation.zombies.pool.activeCount,
    enabled: state.enabled,
    obstacleDamageSuppressed: !simulation.obstacleDamageEnabled,
    obstacleDeltaAppliedRevision: simulation.obstacleDeltaMetrics.appliedRevision,
    obstacleDeltaRequestedRevision: simulation.obstacleDeltaMetrics.requestedRevision,
    phaseHeld: state.active,
    playerProtected: state.active && state.playerProtected,
    reachableSpawnCompletedCount: simulation.navigationSparseSpawnSearchCompletedCount,
    representedZombieCount,
    rosterRealized,
    scheduledZombieCount,
    targetZombieCount: state.targetZombieCount,
    zombieCapacity: simulation.zombies.pool.capacity,
  }
}

export function requestLandrushZombieEscapeRoomSoakTargetRoster(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
) {
  if (
    !state.enabled ||
    !state.active ||
    simulation.phase !== 'night' ||
    simulation.status !== 'playing'
  ) {
    return readLandrushZombieEscapeRoomSoakSnapshot(state, simulation)
  }

  state.targetZombieCount = ZOMBIE_ESCAPE_CAPACITY.zombies
  if (simulation.zombies.pool.capacity !== state.targetZombieCount) {
    return readLandrushZombieEscapeRoomSoakSnapshot(state, simulation)
  }

  const scheduledZombieCount = resolveZombieEscapeScheduledPopulation(simulation)
  if (scheduledZombieCount < state.targetZombieCount) {
    simulation.replacementSpawnRemaining += state.targetZombieCount - scheduledZombieCount
  }
  return readLandrushZombieEscapeRoomSoakSnapshot(state, simulation)
}

export function requestLandrushZombieEscapeRoomSoakObstacleDelta(
  simulation: ZombieEscapeSimulation,
) {
  return requestZombieEscapeDeterministicObstacleDelta(simulation)
}

export function beginLandrushZombieEscapeRoomSoak(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
) {
  if (simulation.phase === 'night' && simulation.status === 'playing') {
    if (!state.active) {
      state.originalObstacleDamageEnabled = simulation.obstacleDamageEnabled
      state.originalPlayerHealth = simulation.player.health
      state.active = true
    }
    setZombieEscapeObstacleDamageEnabled(simulation, false)
    if (!state.playerProtected) {
      simulation.player.health = Math.max(
        simulation.player.health,
        LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK_PROTECTED_HEALTH,
      )
      state.playerProtected = true
    }
  }
  return readLandrushZombieEscapeRoomSoakSnapshot(state, simulation)
}

export function releaseLandrushZombieEscapeRoomSoakPlayerProtection(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
) {
  if (state.active && state.playerProtected && state.originalPlayerHealth !== null) {
    simulation.player.health = state.originalPlayerHealth
    state.playerProtected = false
  }
  return readLandrushZombieEscapeRoomSoakSnapshot(state, simulation)
}

export function readLandrushZombieEscapeRoomSoakPlayerState(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
  target: LandrushZombieEscapeRoomSoakPlayerState,
) {
  target.audioWriteSequence = simulation.audioEvents.writeSequence
  target.health = simulation.player.health
  target.hitSlowSeconds = simulation.player.hitSlowSeconds
  target.hurtFlash = simulation.player.hurtFlash
  target.phase = simulation.phase
  target.playerProtected = state.active && state.playerProtected
  target.status = simulation.status
  return target
}

export function endLandrushZombieEscapeRoomSoak(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
) {
  if (state.active && state.originalPlayerHealth !== null) {
    simulation.player.health = state.originalPlayerHealth
  }
  if (state.originalObstacleDamageEnabled !== null) {
    setZombieEscapeObstacleDamageEnabled(simulation, state.originalObstacleDamageEnabled)
  }
  state.active = false
  state.originalObstacleDamageEnabled = null
  state.originalPlayerHealth = null
  state.playerProtected = false
  state.targetZombieCount = 0
  return readLandrushZombieEscapeRoomSoakSnapshot(state, simulation)
}

export function createLandrushZombieEscapeRoomSoakBridge(
  state: LandrushZombieEscapeRoomSoakState,
  simulation: ZombieEscapeSimulation,
): LandrushZombieEscapeRoomSoakBridge {
  return {
    begin: () => beginLandrushZombieEscapeRoomSoak(state, simulation),
    end: () => endLandrushZombieEscapeRoomSoak(state, simulation),
    getPlayerState: (target) =>
      readLandrushZombieEscapeRoomSoakPlayerState(state, simulation, target),
    getState: () => readLandrushZombieEscapeRoomSoakSnapshot(state, simulation),
    releasePlayerProtection: () =>
      releaseLandrushZombieEscapeRoomSoakPlayerProtection(state, simulation),
    requestObstacleDelta: () => requestLandrushZombieEscapeRoomSoakObstacleDelta(simulation),
    requestTargetRoster: () => requestLandrushZombieEscapeRoomSoakTargetRoster(state, simulation),
  }
}

export function createLandrushZombieEscapeRoutingDebugSnapshot(simulation: ZombieEscapeSimulation) {
  const attachmentHeapLeases = inspectZombieEscapeSparseAttachmentHeapLeases(
    simulation.navigationField,
  )
  const cachedFollowWork = simulation.navigationSparseCachedFollowWork
  const flowSearchWork = simulation.navigationSparseFlowSearchWork
  const obstacleDelta = simulation.obstacleDeltaMetrics
  const spawnSearchWork = simulation.navigationSparseSpawnWork
  const targetUpdate = simulation.navigationField.graphSparseTargetUpdate
  const targetUpdateWork = simulation.navigationSparseTargetWork
  const visibilityWork = simulation.navigationVisibilityWork
  return {
    fallbackRebuildCount: simulation.navigationField.fallbackRebuildCount,
    graphAttachmentCandidateCount: simulation.navigationField.graphAttachmentCandidateCount,
    graphAttachmentFullSearchCount: simulation.navigationField.graphAttachmentFullSearchCount,
    graphAttachmentSupportCheckCount: simulation.navigationField.graphAttachmentSupportCheckCount,
    navigationSparseAttachmentActiveAgentLeaseCount: attachmentHeapLeases.activeAgentLeases,
    navigationSparseAttachmentAvailableAgentLeaseCount: attachmentHeapLeases.availableAgentLeases,
    navigationSparseAttachmentFieldSingletonLeaseReserved: attachmentHeapLeases.singletonReserved,
    navigationSparseAttachmentLeaseInvariantViolationCount:
      attachmentHeapLeases.leaseInvariantViolationCount,
    navigationSparseAttachmentMaximumActiveAgentLeaseCountObserved:
      attachmentHeapLeases.maximumActiveAgentLeases,
    navigationSparseAttachmentMaximumHierarchyNodeCount:
      attachmentHeapLeases.maximumHierarchyNodeCount,
    navigationSparseAttachmentSpawnLeaseReserved: attachmentHeapLeases.spawnReserved,
    maximumResolveCountObservedPerTick:
      simulation.navigationIntentMaximumResolveCountObservedPerTick,
    navigationVisibilityColliderCandidateVisitsMaximumObservedPerTick:
      visibilityWork.colliderCandidateVisitsMaximumObservedPerTick,
    navigationVisibilityColliderCandidateVisitsThisTick:
      visibilityWork.colliderCandidateVisitsThisTick,
    navigationVisibilityColliderCandidateVisitsTotal: visibilityWork.colliderCandidateVisitsTotal,
    navigationVisibilityColliderHierarchyNodeVisitsMaximumObservedPerTick:
      visibilityWork.colliderHierarchyNodeVisitsMaximumObservedPerTick,
    navigationVisibilityColliderHierarchyNodeVisitsThisTick:
      visibilityWork.colliderHierarchyNodeVisitsThisTick,
    navigationVisibilityColliderHierarchyNodeVisitsTotal:
      visibilityWork.colliderHierarchyNodeVisitsTotal,
    navigationVisibilitySupportHierarchyNodeVisitsMaximumObservedPerTick:
      visibilityWork.supportHierarchyNodeVisitsMaximumObservedPerTick,
    navigationVisibilitySupportHierarchyNodeVisitsThisTick:
      visibilityWork.supportHierarchyNodeVisitsThisTick,
    navigationVisibilitySupportHierarchyNodeVisitsTotal:
      visibilityWork.supportHierarchyNodeVisitsTotal,
    navigationVisibilitySupportHoleVisitsMaximumObservedPerTick:
      visibilityWork.supportHoleVisitsMaximumObservedPerTick,
    navigationVisibilitySupportHoleVisitsThisTick: visibilityWork.supportHoleVisitsThisTick,
    navigationVisibilitySupportHoleVisitsTotal: visibilityWork.supportHoleVisitsTotal,
    navigationVisibilitySupportItemVisitsMaximumObservedPerTick:
      visibilityWork.supportItemVisitsMaximumObservedPerTick,
    navigationVisibilitySupportItemVisitsThisTick: visibilityWork.supportItemVisitsThisTick,
    navigationVisibilitySupportItemVisitsTotal: visibilityWork.supportItemVisitsTotal,
    navigationVisibilitySupportRingEdgeVisitsMaximumObservedPerTick:
      visibilityWork.supportRingEdgeVisitsMaximumObservedPerTick,
    navigationVisibilitySupportRingEdgeVisitsThisTick: visibilityWork.supportRingEdgeVisitsThisTick,
    navigationVisibilitySupportRingEdgeVisitsTotal: visibilityWork.supportRingEdgeVisitsTotal,
    navigationVisibilitySupportRingHierarchyNodeVisitsMaximumObservedPerTick:
      visibilityWork.supportRingHierarchyNodeVisitsMaximumObservedPerTick,
    navigationVisibilitySupportRingHierarchyNodeVisitsThisTick:
      visibilityWork.supportRingHierarchyNodeVisitsThisTick,
    navigationVisibilitySupportRingHierarchyNodeVisitsTotal:
      visibilityWork.supportRingHierarchyNodeVisitsTotal,
    obstacleDeltaAllocationCountMaximumObservedPerTick:
      obstacleDelta.allocationCount.maximumObservedPerTick,
    obstacleDeltaAllocationCountThisTick: obstacleDelta.allocationCount.thisTick,
    obstacleDeltaAllocationCountTotal: obstacleDelta.allocationCount.total,
    obstacleDeltaAppliedCount: obstacleDelta.appliedCount,
    obstacleDeltaAppliedRevision: obstacleDelta.appliedRevision,
    obstacleDeltaConnectorMaskWritesMaximumObservedPerTick:
      obstacleDelta.connectorMaskWrites.maximumObservedPerTick,
    obstacleDeltaConnectorMaskWritesThisTick: obstacleDelta.connectorMaskWrites.thisTick,
    obstacleDeltaConnectorMaskWritesTotal: obstacleDelta.connectorMaskWrites.total,
    obstacleDeltaFullArrayClearCountMaximumObservedPerTick:
      obstacleDelta.fullArrayClearCount.maximumObservedPerTick,
    obstacleDeltaFullArrayClearCountThisTick: obstacleDelta.fullArrayClearCount.thisTick,
    obstacleDeltaFullArrayClearCountTotal: obstacleDelta.fullArrayClearCount.total,
    obstacleDeltaObjectLookupComparisonsMaximumObservedPerTick:
      obstacleDelta.objectLookupComparisons.maximumObservedPerTick,
    obstacleDeltaObjectLookupComparisonsThisTick: obstacleDelta.objectLookupComparisons.thisTick,
    obstacleDeltaObjectLookupComparisonsTotal: obstacleDelta.objectLookupComparisons.total,
    obstacleDeltaObjectMaskWritesMaximumObservedPerTick:
      obstacleDelta.objectMaskWrites.maximumObservedPerTick,
    obstacleDeltaObjectMaskWritesThisTick: obstacleDelta.objectMaskWrites.thisTick,
    obstacleDeltaObjectMaskWritesTotal: obstacleDelta.objectMaskWrites.total,
    obstacleDeltaRequestCount: obstacleDelta.requestCount,
    obstacleDeltaRequestedRevision: obstacleDelta.requestedRevision,
    obstacleDeltaRequiresRecompileCount: obstacleDelta.requiresRecompileCount,
    obstacleDeltaRevisionAdvanceCount: obstacleDelta.revisionAdvanceCount,
    obstacleDeltaUnchangedCount: obstacleDelta.unchangedCount,
    obstacleDeltaViewRevisionAdvanceCount: obstacleDelta.viewRevisionAdvanceCount,
    obstacleDeltaWorldCompileCountMaximumObservedPerTick:
      obstacleDelta.worldCompileCount.maximumObservedPerTick,
    obstacleDeltaWorldCompileCountThisTick: obstacleDelta.worldCompileCount.thisTick,
    obstacleDeltaWorldCompileCountTotal: obstacleDelta.worldCompileCount.total,
    navigationAnchorInvalidationCount: simulation.navigationAnchorInvalidationCount,
    navigationAnchoredAgentCount: simulation.navigationAnchoredAgentCount,
    navigationGraphNodeCount: simulation.collisionWorld.navigationGraph.nodeIds.length,
    navigationGoalResolvedTick: simulation.navigationGoalResolvedTick,
    navigationIntentCanceledCount: simulation.navigationIntentCanceledCount,
    navigationIntentDemandCachedAnchorLostCount:
      simulation.navigationIntentDemandCachedAnchorLostCount,
    navigationIntentDemandCollisionRecoveryCount:
      simulation.navigationIntentDemandCollisionRecoveryCount,
    navigationIntentDemandConnectorChangedCount:
      simulation.navigationIntentDemandConnectorChangedCount,
    navigationIntentDemandRoutePublishedCount: simulation.navigationIntentDemandRoutePublishedCount,
    navigationIntentDemandSpawnCount: simulation.navigationIntentDemandSpawnCount,
    navigationIntentDemandWorldChangedCount: simulation.navigationIntentDemandWorldChangedCount,
    navigationIntentFirstServiceCount: simulation.navigationIntentFirstServiceCount,
    navigationIntentIssuedCount: simulation.navigationIntentIssuedCount,
    navigationIntentMaximumResolveCountObservedPerTick:
      simulation.navigationIntentMaximumResolveCountObservedPerTick,
    navigationIntentMaximumUnservicedAgeTicksObserved:
      simulation.navigationIntentMaximumUnservicedAgeTicksObserved,
    navigationIntentOldestPendingAgeTicks: simulation.navigationIntentOldestPendingAgeTicks,
    navigationIntentOldestUnservicedAgeTicks: simulation.navigationIntentOldestUnservicedAgeTicks,
    navigationIntentPendingCount: simulation.navigationIntentPendingCount,
    navigationIntentResolvedCount: simulation.navigationIntentResolvedCount,
    navigationIntentResolveBudgetPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
    navigationIntentResolveBudgetViolationCount:
      simulation.navigationIntentResolveBudgetViolationCount,
    navigationIntentResolveCountThisTick: simulation.navigationIntentResolveCountThisTick,
    navigationIntentUnservicedPendingCount: simulation.navigationIntentUnservicedPendingCount,
    navigationLivingWithoutCommittedActionCount:
      simulation.navigationLivingWithoutCommittedActionCount,
    navigationRetainedPendingActionCount: simulation.navigationRetainedPendingActionCount,
    navigationStaleTargetCount: simulation.navigationStaleTargetCount,
    navigationIntentAdmissionDeferredCanceledCount:
      simulation.navigationIntentAdmissionDeferredCanceledCount,
    navigationIntentAdmissionDeferredMarkedCount:
      simulation.navigationIntentAdmissionDeferredMarkedCount,
    navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick:
      simulation.navigationIntentAdmissionDeferredMaximumPromotedCountObservedPerTick,
    navigationIntentAdmissionDeferredPendingCount:
      simulation.navigationIntentAdmissionDeferredPendingCount,
    navigationIntentAdmissionDeferredPromotionBudgetPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount:
      simulation.navigationIntentAdmissionDeferredPromotedCachedAnchorLostCount,
    navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount:
      simulation.navigationIntentAdmissionDeferredPromotedCollisionRecoveryCount,
    navigationIntentAdmissionDeferredPromotedConnectorChangedCount:
      simulation.navigationIntentAdmissionDeferredPromotedConnectorChangedCount,
    navigationIntentAdmissionDeferredPromotedCount:
      simulation.navigationIntentAdmissionDeferredPromotedCount,
    navigationIntentAdmissionDeferredPromotedCountThisTick:
      simulation.navigationIntentAdmissionDeferredPromotedCountThisTick,
    navigationIntentAdmissionDeferredPromotedSpawnCount:
      simulation.navigationIntentAdmissionDeferredPromotedSpawnCount,
    navigationIntentAdmissionDeferredPromotedWorldChangedCount:
      simulation.navigationIntentAdmissionDeferredPromotedWorldChangedCount,
    navigationIntentAdmissionDeferredQueueOperationCountThisTick:
      simulation.navigationIntentAdmissionDeferredQueueOperationCountThisTick,
    navigationIntentAdmissionDeferredQueueOperationCountTotal:
      simulation.navigationIntentAdmissionDeferredQueueOperationCountTotal,
    navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick:
      simulation.navigationIntentAdmissionDeferredQueueOperationMaximumObservedPerTick,
    navigationObstacleRefreshDeferredCanceledCount:
      simulation.navigationObstacleRefreshDeferredCanceledCount,
    navigationObstacleRefreshDeferredMarkedCount:
      simulation.navigationObstacleRefreshDeferredMarkedCount,
    navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick:
      simulation.navigationObstacleRefreshDeferredMaximumPromotedCountObservedPerTick,
    navigationObstacleRefreshDeferredPendingCount:
      simulation.navigationObstacleRefreshDeferredPendingCount,
    navigationObstacleRefreshDeferredPromotedCount:
      simulation.navigationObstacleRefreshDeferredPromotedCount,
    navigationObstacleRefreshDeferredPromotedCountThisTick:
      simulation.navigationObstacleRefreshDeferredPromotedCountThisTick,
    navigationObstacleRefreshDeferredPromotionBudgetPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    navigationObstacleRefreshDiscoveryAppliedRevision:
      simulation.navigationObstacleRefreshDiscoveryAppliedRevision,
    navigationObstacleRefreshDiscoveryEpochRevision:
      simulation.navigationObstacleRefreshDiscoveryEpochRevision,
    navigationObstacleRefreshDiscoveryRemainingSlotCount:
      simulation.navigationObstacleRefreshDiscoveryRemainingSlotCount,
    navigationRefreshAdmissionBudgetPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    navigationRefreshAdmissionCountThisTick: simulation.navigationRefreshAdmissionCountThisTick,
    navigationRefreshAdmissionCountTotal: simulation.navigationRefreshAdmissionCountTotal,
    navigationRefreshAdmissionMaximumCountObservedPerTick:
      simulation.navigationRefreshAdmissionMaximumCountObservedPerTick,
    navigationRefreshCandidateInspectionBudgetPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationRefreshCandidateInspectionBudgetPerTick,
    navigationRefreshSlotCapacity: simulation.zombies.pool.capacity,
    navigationRefreshCandidateInspectionsMaximumObservedPerTick:
      simulation.navigationRefreshCandidateInspectionsMaximumObservedPerTick,
    navigationRefreshCandidateInspectionsThisTick:
      simulation.navigationRefreshCandidateInspectionsThisTick,
    navigationRefreshCandidateInspectionsTotal:
      simulation.navigationRefreshCandidateInspectionsTotal,
    navigationSparseCachedFollowCandidateVisitsMaximumObservedPerTick:
      cachedFollowWork.candidateVisitsMaximumObservedPerTick,
    navigationSparseCachedFollowCandidateVisitsThisTick: cachedFollowWork.candidateVisitsThisTick,
    navigationSparseCachedFollowCandidateVisitsTotal: cachedFollowWork.candidateVisitsTotal,
    navigationSparseCachedFollowCollisionPredicatesMaximumObservedPerTick:
      cachedFollowWork.collisionPredicatesMaximumObservedPerTick,
    navigationSparseCachedFollowCollisionPredicatesThisTick:
      cachedFollowWork.collisionPredicatesThisTick,
    navigationSparseCachedFollowCollisionPredicatesTotal: cachedFollowWork.collisionPredicatesTotal,
    navigationSparseCachedFollowHeapOperationsMaximumObservedPerTick:
      cachedFollowWork.heapOperationsMaximumObservedPerTick,
    navigationSparseCachedFollowHeapOperationsThisTick: cachedFollowWork.heapOperationsThisTick,
    navigationSparseCachedFollowHeapOperationsTotal: cachedFollowWork.heapOperationsTotal,
    navigationSparseCachedFollowHierarchyNodeVisitsMaximumObservedPerTick:
      cachedFollowWork.hierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseCachedFollowHierarchyNodeVisitsThisTick:
      cachedFollowWork.hierarchyNodeVisitsThisTick,
    navigationSparseCachedFollowHierarchyNodeVisitsTotal: cachedFollowWork.hierarchyNodeVisitsTotal,
    navigationSparseCachedFollowSupportPredicatesMaximumObservedPerTick:
      cachedFollowWork.supportPredicatesMaximumObservedPerTick,
    navigationSparseCachedFollowSupportPredicatesThisTick:
      cachedFollowWork.supportPredicatesThisTick,
    navigationSparseCachedFollowSupportPredicatesTotal: cachedFollowWork.supportPredicatesTotal,
    navigationSparseCollisionReanchorAttemptCount:
      simulation.navigationSparseCollisionReanchorAttemptCount,
    navigationSparseCollisionReanchorCompletedCount:
      simulation.navigationSparseCollisionReanchorCompletedCount,
    navigationSparseCollisionReanchorFailedCount:
      simulation.navigationSparseCollisionReanchorFailedCount,
    navigationSparseFlowSearchCandidateVisitsMaximumObservedPerTick:
      flowSearchWork.candidateVisitsMaximumObservedPerTick,
    navigationSparseFlowSearchCandidateVisitsThisTick: flowSearchWork.candidateVisitsThisTick,
    navigationSparseFlowSearchCandidateVisitsTotal: flowSearchWork.candidateVisitsTotal,
    navigationSparseFlowSearchCollisionPredicatesMaximumObservedPerTick:
      flowSearchWork.collisionPredicatesMaximumObservedPerTick,
    navigationSparseFlowSearchCollisionPredicatesThisTick:
      flowSearchWork.collisionPredicatesThisTick,
    navigationSparseFlowSearchCollisionPredicatesTotal: flowSearchWork.collisionPredicatesTotal,
    navigationSparseFlowSearchHeapOperationsMaximumObservedPerTick:
      flowSearchWork.heapOperationsMaximumObservedPerTick,
    navigationSparseFlowSearchHeapOperationsThisTick: flowSearchWork.heapOperationsThisTick,
    navigationSparseFlowSearchHeapOperationsTotal: flowSearchWork.heapOperationsTotal,
    navigationSparseFlowSearchHierarchyNodeVisitsMaximumObservedPerTick:
      flowSearchWork.hierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseFlowSearchHierarchyNodeVisitsThisTick:
      flowSearchWork.hierarchyNodeVisitsThisTick,
    navigationSparseFlowSearchHierarchyNodeVisitsTotal: flowSearchWork.hierarchyNodeVisitsTotal,
    navigationSparseFlowSearchSupportPredicatesMaximumObservedPerTick:
      flowSearchWork.supportPredicatesMaximumObservedPerTick,
    navigationSparseFlowSearchSupportPredicatesThisTick: flowSearchWork.supportPredicatesThisTick,
    navigationSparseFlowSearchSupportPredicatesTotal: flowSearchWork.supportPredicatesTotal,
    navigationSparseSearchAgentSlicesPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
    navigationSparseSearchActiveAgentCount: simulation.navigationSparseSearchActiveAgentCount,
    navigationSparseSearchWorldStaleActiveCount:
      simulation.navigationSparseSearchWorldStaleActiveCount,
    navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick:
      simulation.navigationSparseSearchAgentEligiblePendingCountAtScheduleThisTick,
    navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved:
      simulation.navigationSparseSearchAgentMaximumPendingNoProgressAgeTicksObserved,
    navigationSparseSearchAgentOldestPendingNoProgressAgeTicks:
      simulation.navigationSparseSearchAgentOldestPendingNoProgressAgeTicks,
    navigationSparseSearchAgentProgressSliceCountThisTick:
      simulation.navigationSparseSearchAgentProgressSliceCountThisTick,
    navigationSparseSearchAgentProgressSliceCountTotal:
      simulation.navigationSparseSearchAgentProgressSliceCountTotal,
    navigationSparseSearchAgentServiceSliceCountThisTick:
      simulation.navigationSparseSearchAgentServiceSliceCountThisTick,
    navigationSparseSearchAgentServiceSliceCountTotal:
      simulation.navigationSparseSearchAgentServiceSliceCountTotal,
    navigationSparseSearchBudgetViolationCount:
      simulation.navigationSparseSearchBudgetViolationCount,
    navigationSparseSearchCanceledCount: simulation.navigationSparseSearchCanceledCount,
    navigationSparseSearchCandidateVisitsMaximumObservedPerTick:
      simulation.navigationSparseSearchCandidateVisitsMaximumObservedPerTick,
    navigationSparseSearchCandidateVisitsThisTick:
      simulation.navigationSparseSearchCandidateVisitsThisTick,
    navigationSparseSearchCandidateVisitsTotal:
      simulation.navigationSparseSearchCandidateVisitsTotal,
    navigationSparseSearchCollisionPredicatesMaximumObservedPerTick:
      simulation.navigationSparseSearchCollisionPredicatesMaximumObservedPerTick,
    navigationSparseSearchCollisionPredicatesThisTick:
      simulation.navigationSparseSearchCollisionPredicatesThisTick,
    navigationSparseSearchCollisionPredicatesTotal:
      simulation.navigationSparseSearchCollisionPredicatesTotal,
    navigationSparseSearchCompletedCount: simulation.navigationSparseSearchCompletedCount,
    navigationSparseSearchCompletionProgressThisTick:
      simulation.navigationSparseSearchCompletionProgressThisTick,
    navigationSparseSearchCompletionProgressTotal:
      simulation.navigationSparseSearchCompletionProgressTotal,
    navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick:
      simulation.navigationSparseSearchGraphEdgeVisitsMaximumObservedPerTick,
    navigationSparseSearchGraphEdgeVisitsThisTick:
      simulation.navigationSparseSearchGraphEdgeVisitsThisTick,
    navigationSparseSearchGraphEdgeVisitsTotal:
      simulation.navigationSparseSearchGraphEdgeVisitsTotal,
    navigationSparseSearchHeapOperationsMaximumObservedPerTick:
      simulation.navigationSparseSearchHeapOperationsMaximumObservedPerTick,
    navigationSparseSearchHeapOperationsThisTick:
      simulation.navigationSparseSearchHeapOperationsThisTick,
    navigationSparseSearchHeapOperationsTotal: simulation.navigationSparseSearchHeapOperationsTotal,
    navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick:
      simulation.navigationSparseSearchHierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseSearchHierarchyNodeVisitsThisTick:
      simulation.navigationSparseSearchHierarchyNodeVisitsThisTick,
    navigationSparseSearchHierarchyNodeVisitsTotal:
      simulation.navigationSparseSearchHierarchyNodeVisitsTotal,
    navigationSparseSearchInvalidatedCount: simulation.navigationSparseSearchInvalidatedCount,
    navigationSparseSearchCompactTargetMaximumNodeCount:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumNodeCount,
    navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumCandidateVisitsPerTick,
    navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumGraphEdgeVisitsPerTick,
    navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchCompactTargetMaximumHeapOperationsPerTick,
    navigationSparseSearchMaximumCandidateVisitsPerAgentSlice:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerAgentSlice,
    navigationSparseSearchMaximumCandidateVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCandidateVisitsPerTick,
    navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerAgentSlice,
    navigationSparseSearchMaximumCollisionPredicatesPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumCollisionPredicatesPerTick,
    navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerAgentSlice,
    navigationSparseSearchMaximumHierarchyNodeVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHierarchyNodeVisitsPerTick,
    navigationSparseSearchMaximumGraphEdgeVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumGraphEdgeVisitsPerTick,
    navigationSparseSearchMaximumHeapOperationsPerAgentSlice:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerAgentSlice,
    navigationSparseSearchMaximumHeapOperationsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumHeapOperationsPerTick,
    navigationSparseSearchMinimumWorkUnitsPerAgentSlice:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMinimumWorkUnitsPerAgentSlice,
    navigationSparseSearchMaximumSupportPredicatesPerAgentSlice:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerAgentSlice,
    navigationSparseSearchMaximumSupportPredicatesPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumSupportPredicatesPerTick,
    navigationSparseSearchMaximumTargetCandidateVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetCandidateVisitsPerTick,
    navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetGraphEdgeVisitsPerTick,
    navigationSparseSearchMaximumTargetHeapOperationsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetHeapOperationsPerTick,
    navigationSparseSearchMaximumTargetBuildsPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchMaximumTargetBuildsPerTick,
    navigationSparseSearchMaximumNoProgressAgeTicksObserved:
      simulation.navigationSparseSearchMaximumNoProgressAgeTicksObserved,
    navigationSparseSearchNoProgressAgeTicks: simulation.navigationSparseSearchNoProgressAgeTicks,
    navigationSparseSearchPendingAgentCount: simulation.navigationSparseSearchPendingAgentCount,
    navigationSparseSearchRestartedCollisionRecoveryCount:
      simulation.navigationSparseSearchRestartedCollisionRecoveryCount,
    navigationSparseSearchRestartedCount: simulation.navigationSparseSearchRestartedCount,
    navigationSparseSearchRestartedRoutePublishedCount:
      simulation.navigationSparseSearchRestartedRoutePublishedCount,
    navigationSparseSearchRestartedWorldChangedCount:
      simulation.navigationSparseSearchRestartedWorldChangedCount,
    navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved:
      simulation.navigationSparseSearchSpawnMaximumNoProgressAgeTicksObserved,
    navigationSparseSearchSpawnNoProgressAgeTicks:
      simulation.navigationSparseSearchSpawnNoProgressAgeTicks,
    navigationSparseSearchSpawnProgressSliceCountThisTick:
      simulation.navigationSparseSearchSpawnProgressSliceCountThisTick,
    navigationSparseSearchSpawnProgressSliceCountTotal:
      simulation.navigationSparseSearchSpawnProgressSliceCountTotal,
    navigationSparseSearchSpawnServiceSliceCountThisTick:
      simulation.navigationSparseSearchSpawnServiceSliceCountThisTick,
    navigationSparseSearchSpawnServiceSliceCountTotal:
      simulation.navigationSparseSearchSpawnServiceSliceCountTotal,
    navigationSparseSearchSpawnSlicesPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchSpawnSlicesPerTick,
    navigationSparseSearchServiceSliceCountThisTick:
      simulation.navigationSparseSearchServiceSliceCountThisTick,
    navigationSparseSearchServiceSliceCountTotal:
      simulation.navigationSparseSearchServiceSliceCountTotal,
    navigationSparseSearchStartedCount: simulation.navigationSparseSearchStartedCount,
    navigationSparseSearchSupportPredicatesMaximumObservedPerTick:
      simulation.navigationSparseSearchSupportPredicatesMaximumObservedPerTick,
    navigationSparseSearchSupportPredicatesThisTick:
      simulation.navigationSparseSearchSupportPredicatesThisTick,
    navigationSparseSearchSupportPredicatesTotal:
      simulation.navigationSparseSearchSupportPredicatesTotal,
    navigationSparseSearchTargetBuildsMaximumObservedPerTick:
      simulation.navigationSparseSearchTargetBuildsMaximumObservedPerTick,
    navigationSparseSearchTargetBuildsThisTick:
      simulation.navigationSparseSearchTargetBuildsThisTick,
    navigationSparseSearchTargetBuildsTotal: simulation.navigationSparseSearchTargetBuildsTotal,
    navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved:
      simulation.navigationSparseSearchTargetMaximumNoProgressAgeTicksObserved,
    navigationSparseSearchTargetNoProgressAgeTicks:
      simulation.navigationSparseSearchTargetNoProgressAgeTicks,
    navigationSparseSearchTargetProgressSliceCountThisTick:
      simulation.navigationSparseSearchTargetProgressSliceCountThisTick,
    navigationSparseSearchTargetProgressSliceCountTotal:
      simulation.navigationSparseSearchTargetProgressSliceCountTotal,
    navigationSparseSearchTargetServiceSliceCountThisTick:
      simulation.navigationSparseSearchTargetServiceSliceCountThisTick,
    navigationSparseSearchTargetServiceSliceCountTotal:
      simulation.navigationSparseSearchTargetServiceSliceCountTotal,
    navigationSparseSearchTargetSlicesPerTick:
      ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchTargetSlicesPerTick,
    navigationSparseSearchUncausedStartViolationCount:
      simulation.navigationSparseSearchUncausedStartViolationCount,
    navigationTargetCommittedRouteGeneration: simulation.navigationTargetCommittedRouteGeneration,
    navigationTargetRequestedRevision: simulation.navigationTargetRequestedRevision,
    navigationWorldRefreshAdmissionGeneration: simulation.navigationWorldRefreshAdmissionGeneration,
    navigationWorldRefreshEpochGeneration: simulation.navigationWorldRefreshEpochGeneration,
    navigationWorldRefreshInspectionRemaining: simulation.navigationWorldRefreshInspectionRemaining,
    navigationWorldRefreshMaximumPromotedCountObservedPerTick:
      simulation.navigationWorldRefreshMaximumPromotedCountObservedPerTick,
    navigationWorldRefreshMinimumAppliedGeneration:
      simulation.navigationWorldRefreshMinimumAppliedGeneration,
    navigationWorldRefreshPendingCount: simulation.navigationWorldRefreshPendingCount,
    navigationWorldRefreshPromotedCountThisTick:
      simulation.navigationWorldRefreshPromotedCountThisTick,
    navigationWorldRefreshPromotedCountTotal: simulation.navigationWorldRefreshPromotedCountTotal,
    navigationWorldRefreshRestartedCountThisTick:
      simulation.navigationWorldRefreshRestartedCountThisTick,
    navigationWorldRefreshRestartedCountTotal: simulation.navigationWorldRefreshRestartedCountTotal,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsMaximumObservedPerTick:
      spawnSearchWork.attachmentHierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsThisTick:
      spawnSearchWork.attachmentHierarchyNodeVisitsThisTick,
    navigationSparseSpawnSearchAttachmentHierarchyNodeVisitsTotal:
      spawnSearchWork.attachmentHierarchyNodeVisitsTotal,
    navigationSparseSpawnSearchCandidateVisitsMaximumObservedPerTick:
      spawnSearchWork.candidateVisitsMaximumObservedPerTick,
    navigationSparseSpawnSearchCandidateVisitsThisTick: spawnSearchWork.candidateVisitsThisTick,
    navigationSparseSpawnSearchCandidateVisitsTotal: spawnSearchWork.candidateVisitsTotal,
    navigationSparseSpawnSearchCollisionPredicatesMaximumObservedPerTick:
      spawnSearchWork.collisionPredicatesMaximumObservedPerTick,
    navigationSparseSpawnSearchCollisionPredicatesThisTick:
      spawnSearchWork.collisionPredicatesThisTick,
    navigationSparseSpawnSearchCollisionPredicatesTotal: spawnSearchWork.collisionPredicatesTotal,
    navigationSparseSpawnSearchCompletedCount: simulation.navigationSparseSpawnSearchCompletedCount,
    navigationSparseSpawnSearchHeapOperationsMaximumObservedPerTick:
      spawnSearchWork.heapOperationsMaximumObservedPerTick,
    navigationSparseSpawnSearchHeapOperationsThisTick: spawnSearchWork.heapOperationsThisTick,
    navigationSparseSpawnSearchHeapOperationsTotal: spawnSearchWork.heapOperationsTotal,
    navigationSparseSpawnSearchHierarchyNodeVisitsMaximumObservedPerTick:
      spawnSearchWork.hierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseSpawnSearchHierarchyNodeVisitsThisTick:
      spawnSearchWork.hierarchyNodeVisitsThisTick,
    navigationSparseSpawnSearchHierarchyNodeVisitsTotal: spawnSearchWork.hierarchyNodeVisitsTotal,
    navigationSparseSpawnSearchInvalidatedCount:
      simulation.navigationSparseSpawnSearchInvalidatedCount,
    navigationSparseSpawnSearchDependencyWaiting:
      simulation.navigationSparseSpawnSearchDependencyWaiting,
    navigationSparseSpawnSearchPendingCount: simulation.navigationSparseSpawnSearchActive ? 1 : 0,
    navigationSparseSpawnSearchStartedCount: simulation.navigationSparseSpawnSearchStartedCount,
    navigationSparseSpawnSearchSupportPredicatesMaximumObservedPerTick:
      spawnSearchWork.supportPredicatesMaximumObservedPerTick,
    navigationSparseSpawnSearchSupportPredicatesThisTick: spawnSearchWork.supportPredicatesThisTick,
    navigationSparseSpawnSearchSupportPredicatesTotal: spawnSearchWork.supportPredicatesTotal,
    navigationSparseTargetUpdateCandidateOffset: targetUpdate.candidateOffset,
    navigationSparseTargetUpdateCandidateVisitsMaximumObservedPerTick:
      targetUpdateWork.candidateVisitsMaximumObservedPerTick,
    navigationSparseTargetUpdateCandidateVisitsThisTick: targetUpdateWork.candidateVisitsThisTick,
    navigationSparseTargetUpdateCandidateVisitsTotal: targetUpdateWork.candidateVisitsTotal,
    navigationSparseTargetUpdateCollisionPredicatesMaximumObservedPerTick:
      targetUpdateWork.collisionPredicatesMaximumObservedPerTick,
    navigationSparseTargetUpdateCollisionPredicatesThisTick:
      targetUpdateWork.collisionPredicatesThisTick,
    navigationSparseTargetUpdateCollisionPredicatesTotal: targetUpdateWork.collisionPredicatesTotal,
    navigationSparseTargetUpdateCompletedFallbackBuilds: targetUpdate.completedFallbackBuilds,
    navigationSparseTargetUpdateCompletedStrictBuilds: targetUpdate.completedStrictBuilds,
    navigationSparseTargetUpdateCurrentEdge: targetUpdate.currentEdge,
    navigationSparseTargetUpdateCurrentNode: targetUpdate.currentNode,
    navigationSparseTargetUpdateGraphEdgeVisitsMaximumObservedPerTick:
      targetUpdateWork.graphEdgeVisitsMaximumObservedPerTick,
    navigationSparseTargetUpdateGraphEdgeVisitsThisTick: targetUpdateWork.graphEdgeVisitsThisTick,
    navigationSparseTargetUpdateGraphEdgeVisitsTotal: targetUpdateWork.graphEdgeVisitsTotal,
    navigationSparseTargetUpdateHeapOperationsMaximumObservedPerTick:
      targetUpdateWork.heapOperationsMaximumObservedPerTick,
    navigationSparseTargetUpdateHeapOperationsThisTick: targetUpdateWork.heapOperationsThisTick,
    navigationSparseTargetUpdateHeapOperationsTotal: targetUpdateWork.heapOperationsTotal,
    navigationSparseTargetUpdateHeapSize: targetUpdate.heapSize,
    navigationSparseTargetUpdateHierarchyNodeVisitsMaximumObservedPerTick:
      targetUpdateWork.hierarchyNodeVisitsMaximumObservedPerTick,
    navigationSparseTargetUpdateHierarchyNodeVisitsThisTick:
      targetUpdateWork.hierarchyNodeVisitsThisTick,
    navigationSparseTargetUpdateHierarchyNodeVisitsTotal: targetUpdateWork.hierarchyNodeVisitsTotal,
    navigationSparseTargetUpdateInitializationOffset: targetUpdate.initializationOffset,
    navigationSparseTargetUpdatePhase: targetUpdate.phase,
    navigationSparseTargetUpdateReachableCount: targetUpdate.reachableCount,
    navigationSparseTargetUpdateRestartCount: targetUpdate.restartCount,
    navigationSparseTargetUpdateRouteInvalidationCount: targetUpdate.routeInvalidationCount,
    navigationSparseTargetUpdateStatus: targetUpdate.status,
    navigationSparseTargetUpdateSupportPredicatesMaximumObservedPerTick:
      targetUpdateWork.supportPredicatesMaximumObservedPerTick,
    navigationSparseTargetUpdateSupportPredicatesThisTick:
      targetUpdateWork.supportPredicatesThisTick,
    navigationSparseTargetUpdateSupportPredicatesTotal: targetUpdateWork.supportPredicatesTotal,
    navigationSparseTargetUpdateTargetNodeOffset: targetUpdate.targetNodeOffset,
    navigationSparseTargetUpdateValidationNodeOffset: targetUpdate.validationNodeOffset,
    navigationWorldRevision: simulation.navigationWorldRevision,
    navigationMode: simulation.navigationField.world.navigationMode,
    rebuildCount: simulation.navigationField.rebuildCount,
    resolveBudgetPerTick: ZOMBIE_ESCAPE_SIMULATION.navigationIntentResolveBudgetPerTick,
    resolveCount: simulation.navigationIntentResolveCount,
    resolveCountThisTick: simulation.navigationIntentResolveCountThisTick,
    simulationTick: simulation.simulationTick,
    targetLayerIndex: simulation.navigationField.targetLayerIndex,
  }
}

export function LandrushZombieEscapeMode({
  active,
  ambientNpcPresentationRegistry,
  combatHeadingRef,
  combatSnapshotReaderRef,
  expectedPhase,
  groundY,
  materialPresentation,
  materialPresentationReadinessMeshes,
  motionRef,
  navigationAuthorityKey,
  navigationMountGeneration,
  onCollisionWorldReadinessChange,
  onDestroyedFurnitureIdsChange,
  onGeneratedAssetsReadinessChange,
  onInteractionActionabilityChange,
  onNightTransitionStart,
  onPhaseChange,
  onProfileMoneyOperation,
  onResetExternalPlayerMotion,
  onStatusChange,
  onZombieEscapeDeath,
  palmLayout,
  phaseReady,
  playerColor,
  profileMoneyBalance,
  spawn,
  surfacePoints,
  zombieEscapeClockMode,
  zombieEscapeRoomStateObservation,
  startZombieEscapeNight,
  viewerSceneReady,
  visualRootRef,
  zombieEscapeTouchInputRef,
}: LandrushZombieEscapeModeProps) {
  const { camera, get, gl, setEvents, size } = useThree()
  const renderReadinessCamera = useMemo(
    () => resolveLandrushZombieEscapeCamera(motionRef),
    [motionRef],
  )
  const renderReadinessCameraLayout = useMemo(
    () => resolveLandrushZombieEscapeCameraLayout(size.width, size.height),
    [size.height, size.width],
  )
  const renderReadinessCameraOffset = useMemo(() => new Vector3(), [])
  const renderReadinessCameraTarget = useMemo(() => new Vector3(), [])
  const prepareRenderReadinessCamera = useCallback(() => {
    prepareLandrushZombieEscapeCameraForRenderReadiness({
      camera: renderReadinessCamera,
      layout: renderReadinessCameraLayout,
      motion: motionRef.current,
      offset: renderReadinessCameraOffset,
      target: renderReadinessCameraTarget,
    })
  }, [
    motionRef,
    renderReadinessCamera,
    renderReadinessCameraLayout,
    renderReadinessCameraOffset,
    renderReadinessCameraTarget,
  ])
  useLayoutEffect(prepareRenderReadinessCamera, [prepareRenderReadinessCamera])
  useFrame(() => {
    if (expectedPhase === 'build') prepareRenderReadinessCamera()
  }, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.input - 0.02)
  const zombieMaterialPhaseActive = expectedPhase === 'night'
  const sceneNodes = useScene((state) => state.nodes)
  const interactiveDoorPassabilityKey = useInteractive((state) =>
    createLandrushIslandRuntimeDoorPassabilityKey(state.doors),
  )
  const interactiveDoorPassability = useMemo(
    () => resolveLandrushIslandRuntimeDoorPassabilityKey(interactiveDoorPassabilityKey),
    [interactiveDoorPassabilityKey],
  )
  const stableDoorPassability = useMemo(
    () => createLandrushZombieEscapeStableClosedDoorPassability(sceneNodes),
    [sceneNodes],
  )
  const liveOperableDoorIds = useMemo(
    () => resolveLandrushZombieEscapeLiveOperableDoorIds(sceneNodes),
    [sceneNodes],
  )
  const runtimePassableDoorIds = useMemo(
    () => resolveLandrushZombieEscapeRuntimePassableDoorIds(sceneNodes, interactiveDoorPassability),
    [interactiveDoorPassability, sceneNodes],
  )
  const arena = useMemo(
    () => createLandrushZombieEscapeIntegratedArena(surfacePoints, spawn),
    [spawn, surfacePoints],
  )
  const surfaceSupport = useMemo<LandrushZombieEscapeSurfaceNavigationSupport>(
    () => ({
      boundary: true,
      elevation: 0,
      id: LANDRUSH_ZOMBIE_ESCAPE_SURFACE_SUPPORT_ID,
      polygon: surfacePoints.map(({ x, z }) => ({ x: x - spawn.x, z: z - spawn.z })),
    }),
    [spawn, surfacePoints],
  )
  const palmCollisionCircles = useMemo(
    () => createLandrushIslandPalmCollisionCircles({ layout: palmLayout, origin: spawn }),
    [palmLayout, spawn],
  )
  const collisionWorldInput = useMemo<LandrushZombieEscapeCollisionWorldInput>(
    () => ({
      agentRadius: ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRadius,
      circles: palmCollisionCircles,
      doorPassability: stableDoorPassability,
      nodes: sceneNodes,
      playRadius: arena.playRadius,
      spawn,
      surfaceSupport,
      verticalOriginY: groundY,
    }),
    [
      arena.playRadius,
      groundY,
      palmCollisionCircles,
      sceneNodes,
      spawn,
      stableDoorPassability,
      surfaceSupport,
    ],
  )
  const collisionWorldDesiredSignature = useMemo(
    () => createLandrushZombieEscapeCollisionWorldSignature(collisionWorldInput),
    [collisionWorldInput],
  )
  const [collisionWorldBuildState, setCollisionWorldBuildState] = useState(() =>
    createLandrushZombieEscapeCollisionWorldBuildState<LandrushZombieEscapeCollisionWorlds>(),
  )
  const [collisionWorldBuildError, setCollisionWorldBuildError] = useState<string | null>(null)
  const [installedCollisionWorlds, setInstalledCollisionWorlds] =
    useState<LandrushZombieEscapeCollisionWorlds | null>(null)
  const [collisionWorldRetrying, setCollisionWorldRetrying] = useState(false)
  const [nightStartReadiness, setNightStartReadiness] = useState(
    createLandrushZombieEscapeNightStartReadiness,
  )
  const collisionWorldReadinessGenerationRef = useRef(0)
  const collisionWorldInstallationFailureRef = useRef<{
    error: string
    worlds: LandrushZombieEscapeCollisionWorlds
  } | null>(null)
  const collisionWorldBuildOwnerRef = useRef<{
    authorityKey: string
    mountGeneration: string
    retryGeneration: number
    state: typeof collisionWorldBuildState
  } | null>(null)
  const collisionWorldBuildCoordinatorRef =
    useRef<
      LandrushZombieEscapeCollisionWorldBuildCoordinator<
        LandrushZombieEscapeCollisionWorldInput,
        LandrushZombieEscapeCollisionWorlds
      >
    >(null)
  const [simulation] = useState(() => {
    const state = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED, undefined, {
      requireSparseNavigation: true,
    })
    hydrateLandrushZombieEscapeProfileMoney(state, profileMoneyBalance)
    setZombieEscapeExternalPlayerPose(state, true)
    return state
  })
  const [offlineWeaponPlacementSessionId] = useState(
    createOfflineZombieEscapeWeaponPlacementSessionId,
  )
  const weaponPlacementSessionId =
    zombieEscapeClockMode === 'offline-local'
      ? offlineWeaponPlacementSessionId
      : (zombieEscapeRoomStateObservation?.state.sessionId ?? 'online-waiting')
  const authoritativeWeaponPlacementNight =
    zombieEscapeClockMode === 'offline-local'
      ? null
      : (zombieEscapeRoomStateObservation?.state.night ?? 0)
  const refreshWeaponPickupPlacements = useCallback(() => {
    const placementSeed = resolveZombieEscapeWeaponPlacementSeed({
      night: authoritativeWeaponPlacementNight ?? simulation.night,
      sessionId: weaponPlacementSessionId,
    })
    setZombieEscapeWeaponPickupPlacements(
      simulation,
      translateZombieEscapeWeaponPickupPlacements(
        resolveZombieEscapeWeaponPickupPlacements(useScene.getState().nodes, placementSeed),
        { x: spawn.x, z: spawn.z },
      ),
    )
  }, [authoritativeWeaponPlacementNight, simulation, spawn.x, spawn.z, weaponPlacementSessionId])
  const weaponPickupPlacementRefreshControllerRef = useRef<ReturnType<
    typeof createZombieEscapeWeaponPlacementRefreshController
  > | null>(null)
  useLayoutEffect(() => {
    const controller = createZombieEscapeWeaponPlacementRefreshController({
      isBuildPhase: () => simulation.phase === 'build',
      refresh: refreshWeaponPickupPlacements,
    })
    weaponPickupPlacementRefreshControllerRef.current = controller
    const unsubscribeCommits = subscribeSceneCommits(controller.schedule)
    const unsubscribeHistory = useScene.temporal.subscribe(
      createZombieEscapeWeaponPlacementHistoryRefreshListener({
        initialState: useScene.temporal.getState(),
        schedule: controller.schedule,
      }),
    )
    controller.flush()
    return () => {
      unsubscribeCommits()
      unsubscribeHistory()
      controller.dispose()
      if (weaponPickupPlacementRefreshControllerRef.current === controller) {
        weaponPickupPlacementRefreshControllerRef.current = null
      }
    }
  }, [refreshWeaponPickupPlacements, simulation])
  const simulationRef = useRef<ZombieEscapeSimulation>(simulation)
  const impactVisualRegistry = useMemo(() => createZombieEscapeImpactVisualRegistry(), [])
  const [shoulderTorchLightingState] = useState(createLandrushRobotShoulderTorchLightingState)
  const shoulderTorchLightingStateRef = useRef(shoulderTorchLightingState)
  useLayoutEffect(() => {
    return ambientNpcPresentationRegistry.bindRuntime({
      originX: spawn.x,
      originZ: spawn.z,
      readShoulderTorchLighting: () => shoulderTorchLightingStateRef.current,
      readSimulation: () => simulation,
    })
  }, [ambientNpcPresentationRegistry, simulation, spawn.x, spawn.z])
  const installAmbientHandoffAtNightBoundary = useCallback(
    () =>
      installLandrushZombieEscapeAmbientHandoffAtNightBoundary(
        ambientNpcPresentationRegistry,
        simulation,
      ),
    [ambientNpcPresentationRegistry, simulation],
  )
  const renderReadinessRegistry = useMemo(
    () =>
      createZombieEscapeRenderReadinessRegistry([
        ...getZombieEscapeRenderRepresentativeKeys('balanced'),
        LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
        LANDRUSH_ISLAND_NIGHT_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      ]),
    [],
  )
  const combatStateRef = useRef(createLandrushRobotWeaponCombatState())
  const muzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())
  useEffect(() => {
    if (!combatSnapshotReaderRef) return
    const readSnapshot: LandrushZombieEscapeCombatSnapshotReader = () =>
      active && simulation.phase === 'night'
        ? createLandrushZombieEscapeCombatSnapshot(simulation, {
            x: spawn.x,
            y: groundY,
            z: spawn.z,
          })
        : undefined
    combatSnapshotReaderRef.current = readSnapshot
    return () => {
      if (combatSnapshotReaderRef.current === readSnapshot) combatSnapshotReaderRef.current = null
    }
  }, [active, combatSnapshotReaderRef, groundY, simulation, spawn.x, spawn.z])
  const controlsRef = useRef(createZombieEscapeControlState())
  const accumulatorRef = useRef(0)
  const appliedRoomStateRef = useRef<LandrushZombieEscapeAppliedRoomState | null>(null)
  const deathReportedRef = useRef(false)
  const deathReportRetryAtRef = useRef(Number.NEGATIVE_INFINITY)
  const clockModeRef = useRef<LandrushZombieEscapeClockMode>(zombieEscapeClockMode)
  const phaseClockRef = useRef(createLandrushZombieEscapePhaseClock())
  const roomSoakStateRef = useRef<LandrushZombieEscapeRoomSoakState>(
    createLandrushZombieEscapeRoomSoakState(),
  )
  const navigationScaleProofCacheRef = useRef<LandrushZombieEscapeNavigationScaleProofCache | null>(
    null,
  )
  const navigationScaleProofPreparedCompilationRef =
    useRef<LandrushZombieEscapeCollisionWorldCompilation | null>(null)
  const fireMouseRef = useRef(false)
  const firePointerIdRef = useRef<number | null>(null)
  const gamepadInteractHeldRef = useRef(false)
  const weaponSwitchInputStateRef = useRef(createZombieEscapeWeaponSwitchInputState())
  const gamepadRestartButtonStateRef = useRef(createLandrushZombieEscapeRestartButtonState())
  const interactPulseRef = useRef(false)
  const pointerRef = useRef({ initialized: false, ndcX: 0, ndcY: 0 })
  const pointerNdc = useMemo(() => new Vector2(), [])
  const pointerWorld = useMemo(() => new Vector3(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const aimPlane = useMemo(() => new Plane(new Vector3(0, 1, 0)), [])
  const cameraForward = useMemo(() => new Vector3(), [])
  const aimInputSourceRef = useRef<'gamepad' | 'pointer' | 'touch' | null>(null)
  const inputModeRef = useRef<ZombieEscapeInputMode>('keyboard')
  const [inputMode, setInputMode] = useState<ZombieEscapeInputMode>('keyboard')
  const [initialHudSnapshot] = useState<ZombieEscapeHudSnapshot>(() =>
    createZombieEscapeHudSnapshot(simulation),
  )
  const snapshotRef = useRef(initialHudSnapshot)
  const hudPortalOwnerRef = useRef(Symbol('landrush-zombie-escape-hud'))
  const [generatedAssetFailures, setGeneratedAssetFailures] = useState<
    readonly ZombieEscapeGeneratedAssetFailure[]
  >([])
  const [generatedAssetRetryAttempt, setGeneratedAssetRetryAttempt] = useState(0)
  const [generatedAssetRetryGeneration, setGeneratedAssetRetryGeneration] = useState(0)
  const [generatedAssetsRetrying, setGeneratedAssetsRetrying] = useState(false)
  const [navigationOverlayEnabled, setNavigationOverlayEnabled] = useState(false)
  const snapshotAtRef = useRef(Number.NEGATIVE_INFINITY)
  const publishedObstacleRevisionRef = useRef(simulation.obstacleRevision)
  const isCurrentCollisionWorldInstalled = useCallback(() => {
    const owner = collisionWorldBuildOwnerRef.current
    const installationFailure = collisionWorldInstallationFailureRef.current
    return (
      owner !== null &&
      owner.authorityKey === navigationAuthorityKey &&
      owner.mountGeneration === navigationMountGeneration &&
      owner.retryGeneration === generatedAssetRetryGeneration &&
      owner.state === collisionWorldBuildState &&
      installedCollisionWorlds === collisionWorldBuildState.worlds &&
      isLandrushZombieEscapeCollisionWorldInstalled({
        error:
          installationFailure?.worlds === collisionWorldBuildState.worlds
            ? installationFailure.error
            : collisionWorldBuildError,
        installedCombatWorld: simulation.combatCollisionSourceWorld,
        installedNavigationWorld: simulation.collisionSourceWorld,
        worlds: collisionWorldBuildState.worlds,
      })
    )
  }, [
    collisionWorldBuildError,
    collisionWorldBuildState,
    generatedAssetRetryGeneration,
    installedCollisionWorlds,
    navigationAuthorityKey,
    navigationMountGeneration,
    simulation,
  ])
  const collisionWorldInstalled = isCurrentCollisionWorldInstalled()
  const desiredCollisionWorldReady = isLandrushZombieEscapeDesiredCollisionWorldReady({
    desiredSignature: collisionWorldDesiredSignature,
    state: collisionWorldBuildState,
  })
  const runtimePhaseReady =
    collisionWorldInstalled &&
    resolveLandrushZombieEscapeCollisionWorldPhaseReady({
      desiredSignature: collisionWorldDesiredSignature,
      expectedPhase,
      phaseReady,
      state: collisionWorldBuildState,
    })
  const nightStartCandidateReady =
    phaseReady && desiredCollisionWorldReady && collisionWorldInstalled
  const nightStartBuildPhaseActive =
    expectedPhase === 'build' &&
    simulation.phase === 'build' &&
    (zombieEscapeClockMode === 'offline-local' ||
      (zombieEscapeClockMode === 'online-canonical' &&
        zombieEscapeRoomStateObservation?.state.phase === 'build'))
  const nightStartReadinessContextKey = JSON.stringify([
    navigationAuthorityKey,
    navigationMountGeneration,
    collisionWorldDesiredSignature,
    generatedAssetRetryGeneration,
    zombieEscapeClockMode,
    zombieEscapeRoomStateObservation?.state.sessionId ?? null,
  ])
  const resolvedNightStartReadiness = reconcileLandrushZombieEscapeNightStartReadiness({
    buildPhaseActive: nightStartBuildPhaseActive,
    candidateReady: nightStartCandidateReady,
    contextKey: nightStartReadinessContextKey,
    current: nightStartReadiness,
  })
  const sharedNightStartReady = resolvedNightStartReadiness.ready
  useLayoutEffect(() => {
    setNightStartReadiness((current) =>
      reconcileLandrushZombieEscapeNightStartReadiness({
        buildPhaseActive: nightStartBuildPhaseActive,
        candidateReady: nightStartCandidateReady,
        contextKey: nightStartReadinessContextKey,
        current,
      }),
    )
  }, [nightStartBuildPhaseActive, nightStartCandidateReady, nightStartReadinessContextKey])
  const interactionActionable = resolveLandrushZombieEscapeInteractionActionable({
    collisionWorldReady: runtimePhaseReady,
    interactionEligible: active && zombieEscapeClockMode !== 'online-waiting',
  })
  const nightPresentationActive = shouldLandrushZombieEscapeOwnCanvasPointerEvents(
    interactionActionable,
    expectedPhase,
  )
  const navigationScaleProofEnabled =
    typeof window !== 'undefined' &&
    shouldEnableLandrushZombieEscapeNavigationScaleProof(window.location.search)
  const navigationScaleProofFixtureCaptureEnabled =
    typeof window !== 'undefined' &&
    shouldEnableLandrushZombieEscapeNavigationScaleProofFixtureCapture(window.location.search)
  const integratedDebugPublicationEnabled = useMemo(
    () =>
      typeof window !== 'undefined' &&
      shouldPublishLandrushZombieEscapeIntegratedDebugState(window.location.search),
    [],
  )
  const integratedDebugSemanticStateRef = useRef({ expectedPhase, phaseReady: runtimePhaseReady })
  integratedDebugSemanticStateRef.current.expectedPhase = expectedPhase
  integratedDebugSemanticStateRef.current.phaseReady = runtimePhaseReady

  useEffect(() => {
    if (shouldEnableLandrushZombieNavigationOverlay(window.location.search)) {
      setNavigationOverlayEnabled(true)
    }
  }, [])

  useLayoutEffect(() => {
    onInteractionActionabilityChange(interactionActionable)
  }, [interactionActionable, onInteractionActionabilityChange])

  useLayoutEffect(
    () => () => {
      onInteractionActionabilityChange(false)
    },
    [onInteractionActionabilityChange],
  )

  const runNavigationScaleProof =
    useCallback<LandrushZombieEscapeNavigationScaleProofRunner>(() => {
      const collisionWorld = simulation.collisionWorld
      const collisionWorldGeneration = simulation.collisionWorldGeneration
      const collisionWorldSignature = collisionWorldBuildState.signature
      if (
        !collisionWorldBuildState.ready ||
        collisionWorldBuildState.worlds === null ||
        collisionWorldSignature === null ||
        collisionWorldSignature !== collisionWorldDesiredSignature
      ) {
        return Promise.reject(
          new Error('Landrush Zombie Escape navigation scale proof world is not phase-ready'),
        )
      }
      const cacheKey = createLandrushZombieEscapeNavigationScaleProofCacheKey({
        collisionWorldGeneration,
        collisionWorldSignature,
        world: collisionWorld,
      })
      const existing = navigationScaleProofCacheRef.current
      if (existing?.key === cacheKey) return existing.promise
      existing?.controller.abort()
      const controller = new AbortController()
      const timeoutHandle = window.setTimeout(
        () => controller.abort(),
        LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_TIMEOUT_MS,
      )
      let running: Promise<LandrushZombieEscapeNavigationScaleProofResult>
      running = import('./zombie-escape-navigation-scale-proof')
        .then(({ runLandrushZombieEscapeNavigationScaleProof }) =>
          runLandrushZombieEscapeNavigationScaleProof({
            arena,
            collisionWorld,
            collisionWorldGeneration,
            collisionWorldSignature,
            fixedDeltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
            signal: controller.signal,
            timeoutMs: LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_TIMEOUT_MS,
            worldOrigin: { x: spawn.x, y: groundY, z: spawn.z },
          }),
        )
        .then((result) => {
          if (
            simulation.collisionWorld !== collisionWorld ||
            simulation.collisionWorldGeneration !== collisionWorldGeneration ||
            collisionWorld.revision !== result.world.revision ||
            collisionWorld.activationRevision !== result.world.activationRevision ||
            result.world.collisionWorldGeneration !== collisionWorldGeneration
          ) {
            throw new Error(
              'Landrush Zombie Escape navigation scale proof world generation changed',
            )
          }
          return result
        })
        .catch((error: unknown) => {
          if (navigationScaleProofCacheRef.current?.promise === running) {
            navigationScaleProofCacheRef.current = null
          }
          throw error
        })
        .finally(() => window.clearTimeout(timeoutHandle))
      navigationScaleProofCacheRef.current = { controller, key: cacheKey, promise: running }
      return running
    }, [
      arena,
      collisionWorldBuildState,
      collisionWorldDesiredSignature,
      groundY,
      simulation,
      spawn,
    ])

  const captureNavigationScaleProofFixture =
    useCallback<LandrushZombieEscapeNavigationScaleProofFixtureCaptureRunner>(async () => {
      const compilation = navigationScaleProofPreparedCompilationRef.current
      const collisionWorld = simulation.collisionWorld
      const collisionWorldGeneration = simulation.collisionWorldGeneration
      const collisionWorldSignature = collisionWorldBuildState.signature
      if (
        !compilation ||
        !isLandrushZombieEscapeNavigationScaleProofFixtureCaptureReady({
          buildReady: collisionWorldBuildState.ready,
          captureEnabled: navigationScaleProofFixtureCaptureEnabled,
          compilationSignature: compilation?.signature ?? null,
          desiredSignature: collisionWorldDesiredSignature,
          effectiveNavigationWorld: collisionWorld,
          installedNavigationWorld: collisionWorldBuildState.worlds?.navigation ?? null,
          installedSignature: collisionWorldSignature,
          sourceNavigationWorld: simulation.collisionSourceWorld,
        })
      ) {
        throw new Error('Landrush Zombie Escape fixture capture world is not phase-ready')
      }
      const { createLandrushZombieEscapeNavigationScaleProofFixtureWorldSummary } = await import(
        './zombie-escape-navigation-scale-proof-fixture'
      )
      if (
        simulation.collisionWorld !== collisionWorld ||
        simulation.collisionWorldGeneration !== collisionWorldGeneration ||
        collisionWorldBuildState.signature !== collisionWorldSignature
      ) {
        throw new Error('Landrush Zombie Escape fixture capture world generation changed')
      }
      return {
        compilation: structuredClone(compilation),
        expectedWorld: createLandrushZombieEscapeNavigationScaleProofFixtureWorldSummary(
          collisionWorld,
          compilation.signature,
        ),
        proofInput: {
          collisionWorldGeneration,
          worldOrigin: { x: spawn.x, y: groundY, z: spawn.z },
        },
      }
    }, [
      collisionWorldBuildState,
      collisionWorldDesiredSignature,
      groundY,
      navigationScaleProofFixtureCaptureEnabled,
      simulation,
      spawn,
    ])

  useEffect(() => {
    if (!integratedDebugPublicationEnabled) return
    const bridge = createLandrushZombieEscapeIntegratedDebugBridge({
      arena,
      groundY,
      navigationScaleProofFixtureCapture: navigationScaleProofFixtureCaptureEnabled
        ? captureNavigationScaleProofFixture
        : null,
      navigationScaleProofRunner: navigationScaleProofEnabled ? runNavigationScaleProof : null,
      readExpectedPhase: () => integratedDebugSemanticStateRef.current.expectedPhase,
      readMuzzlePose: () => muzzlePoseRef.current,
      readPhaseReady: () => integratedDebugSemanticStateRef.current.phaseReady,
      roomSoakState: roomSoakStateRef.current,
      simulation,
      spawn,
    })
    window.__LANDRUSH_ZOMBIE_ESCAPE__ = bridge
    return () => {
      if (window.__LANDRUSH_ZOMBIE_ESCAPE__ === bridge) {
        delete window.__LANDRUSH_ZOMBIE_ESCAPE__
      }
    }
  }, [
    arena,
    captureNavigationScaleProofFixture,
    groundY,
    integratedDebugPublicationEnabled,
    navigationScaleProofEnabled,
    navigationScaleProofFixtureCaptureEnabled,
    runNavigationScaleProof,
    simulation,
    spawn,
  ])

  useEffect(
    () => () => {
      const cached = navigationScaleProofCacheRef.current
      if (cached) {
        cached.controller.abort()
        navigationScaleProofCacheRef.current = null
      }
    },
    [],
  )

  const activateInputMode = useCallback((mode: ZombieEscapeInputMode) => {
    if (inputModeRef.current === mode) return
    inputModeRef.current = mode
    setInputMode(mode)
  }, [])

  const handleTouchInput = useCallback(
    (input: LandrushZombieEscapeTouchInputKind) => {
      activateInputMode('touch')
      if (input === 'aim') aimInputSourceRef.current = 'touch'
    },
    [activateInputMode],
  )

  const handleGeneratedAssetsReadinessChange = useCallback(
    (readiness: ZombieEscapeGeneratedAssetReadinessSnapshot) => {
      onGeneratedAssetsReadinessChange?.(readiness)
      if (!readiness.ready) return
      setGeneratedAssetFailures([])
      setGeneratedAssetRetryAttempt(0)
      setGeneratedAssetsRetrying(false)
    },
    [onGeneratedAssetsReadinessChange],
  )

  const handleGeneratedAssetsFailureChange = useCallback(
    (failures: readonly ZombieEscapeGeneratedAssetFailure[]) => {
      if (failures.length === 0) return
      setGeneratedAssetFailures((current) =>
        generatedAssetFailuresMatch(current, failures)
          ? current
          : failures.map((failure) => ({ ...failure })),
      )
      setGeneratedAssetsRetrying(false)
    },
    [],
  )

  const beginGeneratedAssetsRetry = useCallback(
    (failures: readonly ZombieEscapeGeneratedAssetFailure[]) => {
      if (failures.length === 0 && collisionWorldBuildError === null) return
      setGeneratedAssetsRetrying(failures.length > 0)
      setCollisionWorldRetrying(true)
      setCollisionWorldBuildError(null)
      collisionWorldBuildCoordinatorRef.current?.dispose()
      collisionWorldBuildCoordinatorRef.current = null
      if (failures.length > 0) {
        clearZombieEscapeGeneratedAssetCaches(failures.map((failure) => failure.key))
      }
      setGeneratedAssetRetryGeneration((generation) => generation + 1)
    },
    [collisionWorldBuildError],
  )

  useEffect(() => {
    if (generatedAssetsRetrying || generatedAssetFailures.length === 0) return
    const delay = GENERATED_ASSET_AUTO_RETRY_DELAYS_MS[generatedAssetRetryAttempt]
    if (delay === undefined) return
    const failures = generatedAssetFailures
    const timeout = window.setTimeout(() => {
      setGeneratedAssetRetryAttempt((attempt) => attempt + 1)
      beginGeneratedAssetsRetry(failures)
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [
    beginGeneratedAssetsRetry,
    generatedAssetFailures,
    generatedAssetRetryAttempt,
    generatedAssetsRetrying,
  ])

  const retryGeneratedAssets = useCallback(() => {
    setGeneratedAssetRetryAttempt(0)
    beginGeneratedAssetsRetry(generatedAssetFailures)
  }, [beginGeneratedAssetsRetry, generatedAssetFailures])

  useEffect(() => {
    const owner = {
      authorityKey: navigationAuthorityKey,
      mountGeneration: navigationMountGeneration,
      retryGeneration: generatedAssetRetryGeneration,
      state:
        createLandrushZombieEscapeCollisionWorldBuildState<LandrushZombieEscapeCollisionWorlds>(),
    }
    let lastError: string | null = null
    const workerCompiler = createBrowserLandrushZombieEscapeCollisionWorldWorkerCompiler({
      ...(navigationScaleProofFixtureCaptureEnabled
        ? {
            onPreparedCompilation: (compilation: LandrushZombieEscapeCollisionWorldCompilation) => {
              navigationScaleProofPreparedCompilationRef.current = compilation
            },
          }
        : {}),
    })
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: workerCompiler.compile,
      host: createBrowserLandrushZombieEscapeCollisionWorldBuildScheduleHost(),
      onError: (error) => {
        if (collisionWorldBuildOwnerRef.current !== owner) return
        lastError = error instanceof Error ? error.message : String(error)
        console.error('Failed to compile the current Zombie Escape collision world.', error)
      },
      onStateChange: (state) => {
        if (collisionWorldBuildOwnerRef.current !== owner) return
        owner.state = state
        const error =
          !state.ready && state.generation > 0 && state.pendingSignature === null
            ? (lastError ?? 'The island navigation worker could not prepare this world.')
            : null
        if (state.ready || state.pendingSignature !== null) lastError = null
        setCollisionWorldBuildState((current) =>
          collisionWorldBuildOwnerRef.current === owner ? state : current,
        )
        setCollisionWorldBuildError((current) =>
          collisionWorldBuildOwnerRef.current === owner ? error : current,
        )
      },
      resolveSignature: createLandrushZombieEscapeCollisionWorldSignature,
    })
    collisionWorldBuildOwnerRef.current = owner
    collisionWorldBuildCoordinatorRef.current = coordinator
    setCollisionWorldBuildState(owner.state)
    setCollisionWorldBuildError(null)
    return () => {
      if (collisionWorldBuildOwnerRef.current === owner) collisionWorldBuildOwnerRef.current = null
      if (collisionWorldBuildCoordinatorRef.current === coordinator) {
        collisionWorldBuildCoordinatorRef.current = null
      }
      coordinator.dispose()
      workerCompiler.dispose()
      navigationScaleProofPreparedCompilationRef.current = null
    }
  }, [
    generatedAssetRetryGeneration,
    navigationAuthorityKey,
    navigationMountGeneration,
    navigationScaleProofFixtureCaptureEnabled,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry/authority changes replace the ref-backed coordinator and must re-submit unchanged inputs.
  useEffect(() => {
    collisionWorldBuildCoordinatorRef.current?.request(
      collisionWorldInput,
      resolveLandrushZombieEscapeCollisionWorldBuildPriority(expectedPhase),
    )
  }, [
    collisionWorldInput,
    expectedPhase,
    generatedAssetRetryGeneration,
    navigationAuthorityKey,
    navigationMountGeneration,
    navigationScaleProofFixtureCaptureEnabled,
  ])

  const collisionWorlds = collisionWorldBuildState.worlds
  useLayoutEffect(() => {
    if (!collisionWorlds) return
    collisionWorldInstallationFailureRef.current = null
    try {
      setZombieEscapeCollisionWorld(simulation, collisionWorlds.navigation, collisionWorlds.combat)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      collisionWorldInstallationFailureRef.current = { error: message, worlds: collisionWorlds }
      setInstalledCollisionWorlds(null)
      setCollisionWorldBuildError(message)
      return
    }
    setInstalledCollisionWorlds(collisionWorlds)
    renderScheduler.requestFrame('geometry:changed')
  }, [collisionWorlds, simulation])

  useLayoutEffect(() => {
    const owner = collisionWorldBuildOwnerRef.current
    const installationFailure = collisionWorldInstallationFailureRef.current
    const readiness = createLandrushZombieEscapeNavigationReadiness({
      authorityKey: navigationAuthorityKey,
      currentBuild:
        owner !== null &&
        owner.authorityKey === navigationAuthorityKey &&
        owner.mountGeneration === navigationMountGeneration &&
        owner.retryGeneration === generatedAssetRetryGeneration &&
        owner.state === collisionWorldBuildState,
      error:
        installationFailure?.worlds === collisionWorldBuildState.worlds
          ? installationFailure.error
          : collisionWorldBuildError,
      generation: ++collisionWorldReadinessGenerationRef.current,
      installedCombatWorld: simulation.combatCollisionSourceWorld,
      installedNavigationWorld: simulation.collisionSourceWorld,
      mountGeneration: navigationMountGeneration,
      requestedSignature: collisionWorldDesiredSignature,
      state: collisionWorldBuildState,
    })
    onCollisionWorldReadinessChange(readiness)
    if (readiness.status !== 'pending') setCollisionWorldRetrying(false)
    return () => {
      onCollisionWorldReadinessChange({
        ...readiness,
        generation: ++collisionWorldReadinessGenerationRef.current,
        installedSignature: null,
        status: 'pending',
        error: null,
      })
    }
  }, [
    collisionWorldBuildError,
    collisionWorldBuildState,
    collisionWorldDesiredSignature,
    generatedAssetRetryGeneration,
    navigationAuthorityKey,
    navigationMountGeneration,
    onCollisionWorldReadinessChange,
    simulation,
  ])

  useLayoutEffect(() => {
    if (
      synchronizeZombieEscapePassableObstacleIds(
        simulation,
        runtimePassableDoorIds,
        liveOperableDoorIds,
      ) === 0
    ) {
      return
    }
    renderScheduler.requestFrame('geometry:changed')
  }, [liveOperableDoorIds, runtimePassableDoorIds, simulation])

  const publishDestroyedFurnitureIds = useCallback(() => {
    if (publishedObstacleRevisionRef.current === simulation.obstacleRevision) return
    publishedObstacleRevisionRef.current = simulation.obstacleRevision
    onDestroyedFurnitureIdsChange?.(new Set(simulation.destroyedObstacleIds))
  }, [onDestroyedFurnitureIdsChange, simulation])

  useEffect(() => {
    publishedObstacleRevisionRef.current = simulation.obstacleRevision
    onDestroyedFurnitureIdsChange?.(new Set(simulation.destroyedObstacleIds))
    return () => onDestroyedFurnitureIdsChange?.(new Set())
  }, [onDestroyedFurnitureIdsChange, simulation])

  const publishSnapshot = useCallback(() => {
    const next = createZombieEscapeHudSnapshot(simulation)
    const previous = snapshotRef.current
    if (areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(previous, next)) return
    if (previous.phase !== next.phase) {
      onPhaseChange(next.phase)
      if (next.phase === 'build') {
        weaponPickupPlacementRefreshControllerRef.current?.flush()
      }
    }
    if (previous.status !== next.status) onStatusChange(next.status)
    snapshotRef.current = next
    updateLandrushZombieEscapeHudPortalSnapshot(hudPortalOwnerRef.current, next)
  }, [onPhaseChange, onStatusChange, simulation])

  const cycleOwnedWeapon = useCallback(
    (direction: -1 | 1) => {
      if (simulation.phase !== 'night' || simulation.status !== 'playing') return
      if (!cycleZombieEscapeOwnedWeapon(simulation, direction)) return
      combatStateRef.current.weaponIndex = simulation.player.weaponIndex
      publishSnapshot()
      renderScheduler.requestFrame('animation')
    },
    [publishSnapshot, simulation],
  )

  useEffect(() => {
    if (!hydrateLandrushZombieEscapeProfileMoney(simulation, profileMoneyBalance)) return
    publishSnapshot()
  }, [profileMoneyBalance, publishSnapshot, simulation])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('bench') !== '1' || params.get('landrushZombieRoomSoak') !== '1') return

    const soakState = roomSoakStateRef.current
    soakState.enabled = true
    const bridge = createLandrushZombieEscapeRoomSoakBridge(soakState, simulation)
    window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__ = bridge
    return () => {
      bridge.end()
      soakState.enabled = false
      if (window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__ === bridge) {
        delete window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__
      }
    }
  }, [simulation])

  const runAgain = useCallback(() => {
    if (zombieEscapeClockMode !== 'offline-local') return
    restartLandrushZombieEscapeIntegratedSimulation({
      arena,
      resetExternalPlayerMotion: onResetExternalPlayerMotion,
      simulation,
    })
    onStatusChange(simulation.status)
    accumulatorRef.current = 0
    const controls = controlsRef.current
    controls.aimStrength = 0
    controls.fire = false
    controls.interactPressed = false
    controls.moveStrength = 0
    controls.moveX = 0
    controls.moveZ = 0
    controls.run = false
    fireMouseRef.current = false
    firePointerIdRef.current = null
    gamepadInteractHeldRef.current = false
    resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
    interactPulseRef.current = false
    resetLandrushZombieEscapeTouchInput(zombieEscapeTouchInputRef.current)
    publishDestroyedFurnitureIds()
    publishSnapshot()
    renderScheduler.requestFrame('animation')
  }, [
    arena,
    onResetExternalPlayerMotion,
    onStatusChange,
    publishDestroyedFurnitureIds,
    publishSnapshot,
    simulation,
    zombieEscapeClockMode,
    zombieEscapeTouchInputRef,
  ])

  const startZombie = useCallback(() => {
    if (zombieEscapeClockMode !== 'offline-local') {
      if (
        zombieEscapeClockMode !== 'online-canonical' ||
        !sharedNightStartReady ||
        expectedPhase !== 'build' ||
        simulation.phase !== 'build'
      ) {
        return
      }
      weaponPickupPlacementRefreshControllerRef.current?.flush()
      if (installAmbientHandoffAtNightBoundary() !== ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length) {
        return
      }
      if (!startZombieEscapeNight()) return
      onNightTransitionStart()
      renderScheduler.requestFrame('animation')
      return
    }
    weaponPickupPlacementRefreshControllerRef.current?.flush()
    if (installAmbientHandoffAtNightBoundary() !== ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length) {
      return
    }
    if (
      !requestLandrushZombieEscapeNightStart({
        expectedPhase,
        phaseReady: sharedNightStartReady,
        simulation,
      })
    ) {
      return
    }
    onNightTransitionStart()
    accumulatorRef.current = 0
    publishDestroyedFurnitureIds()
    publishSnapshot()
    renderScheduler.requestFrame('animation')
  }, [
    expectedPhase,
    installAmbientHandoffAtNightBoundary,
    onNightTransitionStart,
    publishDestroyedFurnitureIds,
    publishSnapshot,
    simulation,
    sharedNightStartReady,
    startZombieEscapeNight,
    zombieEscapeClockMode,
  ])

  const renderHud = useCallback(
    (hudSnapshot: ZombieEscapeHudSnapshot) => (
      <LandrushZombieEscapeHud
        expectedPhase={expectedPhase}
        generatedAssetFailureCount={generatedAssetFailures.length}
        generatedAssetsRetrying={generatedAssetsRetrying}
        inputMode={inputMode}
        navigationError={collisionWorldBuildError}
        navigationRetrying={collisionWorldRetrying}
        onInput={handleTouchInput}
        onRetryGeneratedAssets={retryGeneratedAssets}
        onRunAgain={runAgain}
        onStartZombie={startZombie}
        ownerDocument={gl.domElement.ownerDocument}
        nightStartReady={sharedNightStartReady}
        phaseReady={interactionActionable}
        runAgainAvailable={zombieEscapeClockMode === 'offline-local'}
        snapshot={hudSnapshot}
        zombieEscapeTouchInputRef={zombieEscapeTouchInputRef}
      />
    ),
    [
      collisionWorldBuildError,
      collisionWorldRetrying,
      expectedPhase,
      generatedAssetFailures.length,
      generatedAssetsRetrying,
      gl.domElement.ownerDocument,
      handleTouchInput,
      inputMode,
      interactionActionable,
      retryGeneratedAssets,
      runAgain,
      sharedNightStartReady,
      startZombie,
      zombieEscapeClockMode,
      zombieEscapeTouchInputRef,
    ],
  )
  const hudPortalZIndex = resolveLandrushZombieEscapeRecoveryPresentation({
    generatedAssetFailureCount: generatedAssetFailures.length,
    generatedAssetsRetrying,
    navigationError: collisionWorldBuildError,
    navigationRetrying: collisionWorldRetrying,
  }).zIndex

  useLayoutEffect(() => {
    publishLandrushZombieEscapeHudPortal({
      owner: hudPortalOwnerRef.current,
      ownerDocument: gl.domElement.ownerDocument,
      render: renderHud,
      snapshot: snapshotRef.current,
      zIndex: hudPortalZIndex,
    })
  }, [gl.domElement.ownerDocument, hudPortalZIndex, renderHud])

  useLayoutEffect(
    () => () => {
      releaseLandrushZombieEscapeHudPortal(hudPortalOwnerRef.current)
    },
    [],
  )

  useEffect(() => {
    onPhaseChange(snapshotRef.current.phase)
  }, [onPhaseChange])
  useEffect(() => {
    onStatusChange(snapshotRef.current.status)
  }, [onStatusChange])

  useEffect(() => {
    if (!nightPresentationActive) return
    return acquireLandrushZombieEscapeCanvasPointerOwnership({
      getEnabled: () => get().events.enabled,
      setEnabled: (enabled) => setEvents({ enabled }),
    })
  }, [get, nightPresentationActive, setEvents])

  useEffect(() => {
    if (!nightPresentationActive) {
      fireMouseRef.current = false
      firePointerIdRef.current = null
      gamepadInteractHeldRef.current = false
      resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
      interactPulseRef.current = false
      resetLandrushZombieEscapeTouchInput(zombieEscapeTouchInputRef.current)
      combatHeadingRef.current = null
      return
    }
    const canvas = gl.domElement
    const updatePointer = (event: PointerEvent) => {
      if (!isLandrushZombieEscapeDirectCombatPointer(event.pointerType)) return
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      pointerRef.current.ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointerRef.current.ndcY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      pointerRef.current.initialized = true
      aimInputSourceRef.current = 'pointer'
      activateInputMode('keyboard')
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !isLandrushZombieEscapeDirectCombatPointer(event.pointerType) ||
        event.button !== 0 ||
        event.target !== canvas
      ) {
        return
      }
      fireMouseRef.current = true
      firePointerIdRef.current = event.pointerId
      updatePointer(event)
      canvas.focus()
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== firePointerIdRef.current) return
      fireMouseRef.current = false
      firePointerIdRef.current = null
    }
    const clearFire = () => {
      fireMouseRef.current = false
      firePointerIdRef.current = null
      resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
      interactPulseRef.current = false
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.target !== canvas) return
      event.preventDefault()
      event.stopPropagation()
      const direction = readZombieEscapeWheelWeaponSwitch(
        weaponSwitchInputStateRef.current,
        event.deltaY,
        event.deltaMode,
        performance.now(),
      )
      if (direction === 0) return
      activateInputMode('keyboard')
      cycleOwnedWeapon(direction)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (landrushIslandInputTargetBlocksGameplay(event.target)) return
      if (isLandrushZombieEscapeGameplayKeyboardCode(event.code)) {
        activateInputMode('keyboard')
      }
      if (event.code !== 'KeyE' || event.defaultPrevented || event.repeat) return
      event.preventDefault()
      interactPulseRef.current = true
    }

    canvas.addEventListener('pointermove', updatePointer)
    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('blur', clearFire)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      canvas.removeEventListener('pointermove', updatePointer)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('wheel', handleWheel, true)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('blur', clearFire)
      window.removeEventListener('keydown', handleKeyDown, true)
      fireMouseRef.current = false
      firePointerIdRef.current = null
      gamepadInteractHeldRef.current = false
      resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
      interactPulseRef.current = false
      combatHeadingRef.current = null
    }
  }, [
    activateInputMode,
    combatHeadingRef,
    cycleOwnedWeapon,
    gl,
    nightPresentationActive,
    zombieEscapeTouchInputRef,
  ])

  useEffect(
    () => () => {
      combatHeadingRef.current = null
      const motion = motionRef.current
      if (motion) motion.maximumSpeedScale = 1
      resetLandrushZombieEscapeTouchInput(zombieEscapeTouchInputRef.current)
      restoreZombieEscapeDefaultMuzzlePose(simulation)
      delete window.__LANDRUSH_ZOMBIE_ESCAPE__
    },
    [combatHeadingRef, motionRef, simulation, zombieEscapeTouchInputRef],
  )

  useFrame(() => {
    if (!interactionActionable || !isCurrentCollisionWorldInstalled()) return
    const motion = motionRef.current
    if (!motion) return

    const gamepad = readLandrushGamepadInput()
    if (
      advanceLandrushZombieEscapeRestartButtonState(
        gamepadRestartButtonStateRef.current,
        Boolean(gamepad?.triangle),
        simulation.status,
      )
    ) {
      activateInputMode('gamepad')
      runAgain()
      return
    }
    const controls = controlsRef.current
    const weaponSwitchDirection = readZombieEscapeShoulderWeaponSwitch(
      weaponSwitchInputStateRef.current,
      Boolean(gamepad?.leftShoulder),
      Boolean(gamepad?.rightShoulder),
    )
    if (nightPresentationActive && weaponSwitchDirection !== 0) {
      activateInputMode('gamepad')
      cycleOwnedWeapon(weaponSwitchDirection)
    }
    const gamepadInteractHeld = Boolean(gamepad?.square)
    if (gamepadInteractHeld && !gamepadInteractHeldRef.current) {
      interactPulseRef.current = true
    }
    gamepadInteractHeldRef.current = gamepadInteractHeld
    const gamepadActive = Boolean(
      gamepad &&
        (gamepad.strength > 0 ||
          gamepad.lookStrength > 0.08 ||
          gamepad.rightTrigger > 0 ||
          gamepad.run ||
          gamepad.cross ||
          gamepad.circle ||
          gamepad.square ||
          gamepad.triangle ||
          gamepad.dpadDown ||
          gamepad.dpadLeft ||
          gamepad.dpadRight ||
          gamepad.dpadUp ||
          gamepad.leftShoulder ||
          gamepad.rightShoulder ||
          gamepad.leftTrigger > 0),
    )
    const touchInput = zombieEscapeTouchInputRef.current
    const touchInputActive = touchInput.aim.pointerId !== null || touchInput.move.pointerId !== null
    if (gamepadActive && !touchInputActive) activateInputMode('gamepad')
    let aimX = Math.sin(simulation.player.aimAngle)
    let aimZ = Math.cos(simulation.player.aimAngle)
    let aimStrength = 0

    camera.getWorldDirection(cameraForward)
    cameraForward.y = 0
    if (cameraForward.lengthSq() <= 0.000_001) cameraForward.set(0, 0, -1)
    else cameraForward.normalize()

    if (touchInput.aim.pointerId !== null) {
      aimInputSourceRef.current = 'touch'
      if (touchInput.aim.strength > 0) {
        const direction = resolveLandrushZombieEscapeTouchAimDirection({
          cameraForwardX: cameraForward.x,
          cameraForwardZ: cameraForward.z,
          screenX: touchInput.aim.screenX,
          screenY: touchInput.aim.screenY,
        })
        if (direction) {
          aimX = direction.x
          aimZ = direction.z
          aimStrength = touchInput.aim.strength
        }
      }
    } else if (gamepad && gamepad.lookStrength > 0.08) {
      aimInputSourceRef.current = 'gamepad'
      const rightX = -cameraForward.z
      const rightZ = cameraForward.x
      const forwardAmount = -gamepad.lookY
      aimX = rightX * gamepad.lookX + cameraForward.x * forwardAmount
      aimZ = rightZ * gamepad.lookX + cameraForward.z * forwardAmount
      const length = Math.hypot(aimX, aimZ)
      if (length > 0.000_001) {
        aimX /= length
        aimZ /= length
        aimStrength = Math.min(1, gamepad.lookStrength)
      }
    } else if (aimInputSourceRef.current === 'pointer' && pointerRef.current.initialized) {
      pointerNdc.set(pointerRef.current.ndcX, pointerRef.current.ndcY)
      raycaster.setFromCamera(pointerNdc, camera)
      aimPlane.constant = -resolveLandrushZombieEscapeAimPlaneElevation(motion.position.y, groundY)
      if (raycaster.ray.intersectPlane(aimPlane, pointerWorld)) {
        aimX = pointerWorld.x - motion.position.x
        aimZ = pointerWorld.z - motion.position.z
        const length = Math.hypot(aimX, aimZ)
        if (length > 0.000_001) {
          aimX /= length
          aimZ /= length
          aimStrength = 1
        }
      }
    }

    controls.aimX = aimX
    controls.aimZ = aimZ
    controls.aimStrength = aimStrength
    controls.fire =
      fireMouseRef.current || touchInput.firing || isZombieEscapeGamepadFirePressed(gamepad)
    controls.inputMode = inputModeRef.current
    controls.interactPressed = interactPulseRef.current
    controls.moveStrength = 0
    controls.moveX = 0
    controls.moveZ = 0
    controls.run = false
    controls.cameraPressed = false
    controls.debugPressed = false
    controls.pausePressed = false
    controls.qualityPressed = false
    controls.resetPressed = false

    if (aimStrength > 0.001) simulation.player.aimAngle = Math.atan2(aimX, aimZ)
    combatHeadingRef.current = simulation.player.aimAngle
    combatStateRef.current.aimAngle = simulation.player.aimAngle
    combatStateRef.current.meleePhase = simulation.player.meleePhase
    combatStateRef.current.meleeProgress = getZombieEscapeMeleeProgress(simulation.player)
    combatStateRef.current.movementHeading = motion.heading
    combatStateRef.current.weaponIndex = simulation.player.weaponIndex
  }, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.input)

  useFrame((state, delta) => {
    const installed = isCurrentCollisionWorldInstalled()
    const frameRuntimePhaseReady = runtimePhaseReady && installed
    const frameInteractionActionable = interactionActionable && installed
    const motion = motionRef.current
    if (clockModeRef.current !== zombieEscapeClockMode) {
      clockModeRef.current = zombieEscapeClockMode
      phaseClockRef.current.authorityNowSeconds = state.clock.elapsedTime
    }
    let phaseClockAdvance = { advancedSeconds: 0, phaseChanged: false }
    if (zombieEscapeClockMode === 'online-canonical' && zombieEscapeRoomStateObservation) {
      if (
        simulation.phase === 'build' &&
        zombieEscapeRoomStateObservation.state.phase === 'night'
      ) {
        weaponPickupPlacementRefreshControllerRef.current?.flush()
        if (
          installAmbientHandoffAtNightBoundary() !== ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length
        ) {
          renderScheduler.requestFrame('animation')
          return
        }
      }
      const reconciliation = applyLandrushZombieEscapeRoomState({
        appliedState: appliedRoomStateRef.current,
        nowMs: performance.now(),
        observation: zombieEscapeRoomStateObservation,
        simulation,
      })
      appliedRoomStateRef.current = reconciliation.appliedState
      phaseClockRef.current.authorityNowSeconds = state.clock.elapsedTime
      if (zombieEscapeRoomStateObservation.state.phase === 'build') {
        deathReportedRef.current = false
        deathReportRetryAtRef.current = Number.NEGATIVE_INFINITY
      }
      if (reconciliation.destructiveTransition) accumulatorRef.current = 0
      if (reconciliation.semanticStateChanged) {
        publishDestroyedFurnitureIds()
        snapshotAtRef.current = state.clock.elapsedTime
        publishSnapshot()
      }
    } else if (zombieEscapeClockMode === 'offline-local') {
      phaseClockAdvance = advanceLandrushZombieEscapePhaseClock({
        authorityNowSeconds: state.clock.elapsedTime,
        clock: phaseClockRef.current,
        expectedPhase,
        phaseReady: frameRuntimePhaseReady && motion !== null && !roomSoakStateRef.current.active,
        simulation,
      })
    } else {
      phaseClockRef.current.authorityNowSeconds = state.clock.elapsedTime
    }
    const attemptDeathReport = () => {
      if (
        !shouldAttemptLandrushZombieEscapeDeathReport({
          clockMode: zombieEscapeClockMode,
          nextAttemptAtSeconds: deathReportRetryAtRef.current,
          nowSeconds: state.clock.elapsedTime,
          reported: deathReportedRef.current,
          status: simulation.status,
        })
      ) {
        return
      }
      deathReportRetryAtRef.current = state.clock.elapsedTime + 1
      if (onZombieEscapeDeath?.() === true) deathReportedRef.current = true
    }
    attemptDeathReport()
    if (!motion) return

    const frameDelta = Math.min(
      ZOMBIE_ESCAPE_SIMULATION.maximumFrameDeltaSeconds,
      Math.max(0, delta),
    )
    const controls = controlsRef.current
    const phaseCanAdvance =
      (zombieEscapeClockMode === 'offline-local' ||
        (zombieEscapeClockMode === 'online-canonical' &&
          zombieEscapeRoomStateObservation !== null)) &&
      canAdvanceLandrushZombieEscapeIntegratedSimulation({
        expectedPhase,
        phaseReady: frameRuntimePhaseReady,
        simulation,
      })
    if (phaseClockAdvance.phaseChanged) {
      accumulatorRef.current = 0
      publishDestroyedFurnitureIds()
      snapshotAtRef.current = state.clock.elapsedTime
      publishSnapshot()
    }
    if (!frameInteractionActionable) {
      controls.aimStrength = 0
      controls.fire = false
      controls.interactPressed = false
      controls.moveStrength = 0
      controls.moveX = 0
      controls.moveZ = 0
      controls.run = false
    }
    syncIntegratedPlayerPose(simulation, motion, groundY, spawn)

    const muzzlePose = muzzlePoseRef.current
    if (frameInteractionActionable && muzzlePose.ready) {
      setZombieEscapePlayerMuzzlePose(simulation, {
        directionX: muzzlePose.direction.x,
        directionY: muzzlePose.direction.y,
        directionZ: muzzlePose.direction.z,
        x: muzzlePose.position.x - spawn.x,
        y: muzzlePose.position.y - groundY,
        z: muzzlePose.position.z - spawn.z,
      })
    } else {
      restoreZombieEscapeDefaultMuzzlePose(simulation)
    }
    controls.fire = resolveLandrushZombieEscapeCombatFireEnabled({
      collisionWorldReady: frameRuntimePhaseReady,
      interactionEligible: active,
      muzzleReady: muzzlePose.ready,
      requested: controls.fire,
    })
    controls.interactPressed = frameInteractionActionable && interactPulseRef.current

    if (!phaseCanAdvance) {
      accumulatorRef.current = 0
      controls.fire = false
      controls.interactPressed = false
      fireMouseRef.current = false
      interactPulseRef.current = false
    } else if (!simulation.paused && simulation.status === 'playing') {
      accumulatorRef.current = accumulateLandrushZombieEscapeFrameTime(
        accumulatorRef.current,
        frameDelta,
      )
      let substeps = 0
      while (
        accumulatorRef.current >= ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds &&
        substeps < LANDRUSH_ZOMBIE_ESCAPE_MAXIMUM_RECOVERY_SUBSTEPS
      ) {
        const economyCheckpoint = onProfileMoneyOperation
          ? captureLandrushZombieEscapeEconomyCheckpoint(simulation)
          : null
        const outcome = stepLandrushZombieEscapeIntegratedSimulation({
          arena,
          deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
          expectedPhase,
          input: controls,
          phaseReady: frameRuntimePhaseReady,
          simulation,
        })
        if (economyCheckpoint) {
          applyLandrushZombieEscapeProfileMoneyOperations({
            checkpoint: economyCheckpoint,
            onOperation: onProfileMoneyOperation,
            simulation,
          })
        }
        controls.interactPressed = false
        interactPulseRef.current = false
        publishDestroyedFurnitureIds()
        if (outcome.terminal || outcome.phaseChanged) {
          if (outcome.terminal) {
            const deathAction = resolveLandrushZombieEscapeDeathAction({
              clockMode: zombieEscapeClockMode,
              status: simulation.status,
            })
            if (deathAction === 'enter-build') {
              setZombieEscapeGamePhase(simulation, 'build')
            } else if (deathAction === 'report-death') {
              attemptDeathReport()
            }
            onStatusChange(simulation.status)
          }
          accumulatorRef.current = 0
          controls.fire = false
          controls.interactPressed = false
          fireMouseRef.current = false
          interactPulseRef.current = false
          syncIntegratedPlayerPose(simulation, motion, groundY, spawn)
          snapshotAtRef.current = state.clock.elapsedTime
          publishSnapshot()
          break
        }
        accumulatorRef.current -= ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
        substeps += 1
      }
    } else {
      accumulatorRef.current = 0
    }

    motion.maximumSpeedScale =
      active && simulation.player.hitSlowSeconds > 0
        ? ZOMBIE_ESCAPE_SIMULATION.playerHitSpeedScale
        : 1

    combatStateRef.current.shotSequence = simulation.nextShotVolleySequence
    combatStateRef.current.meleePhase = simulation.player.meleePhase
    combatStateRef.current.meleeProgress = getZombieEscapeMeleeProgress(simulation.player)
    combatStateRef.current.movementHeading = motion.heading
    combatStateRef.current.weaponIndex = simulation.player.weaponIndex

    if (state.clock.elapsedTime - snapshotAtRef.current >= 0.1) {
      snapshotAtRef.current = state.clock.elapsedTime
      publishSnapshot()
    }
    renderScheduler.requestFrame('animation')
  }, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.simulation)

  return (
    <LandrushZombieEscapePresentation
      active={active}
      combatStateRef={combatStateRef}
      expectedPhase={expectedPhase}
      generatedAssetRetryGeneration={generatedAssetRetryGeneration}
      groundY={groundY}
      impactVisualRegistry={impactVisualRegistry}
      materialPresentation={materialPresentation}
      materialPresentationReadinessMeshes={materialPresentationReadinessMeshes}
      muzzlePoseRef={muzzlePoseRef}
      navigationOverlayEnabled={navigationOverlayEnabled}
      onGeneratedAssetsFailureChange={handleGeneratedAssetsFailureChange}
      onGeneratedAssetsReadinessChange={handleGeneratedAssetsReadinessChange}
      playerColor={playerColor}
      renderReadinessCamera={renderReadinessCamera}
      renderReadinessRegistry={renderReadinessRegistry}
      runtimePhaseReady={runtimePhaseReady}
      shoulderTorchLightingStateRef={shoulderTorchLightingStateRef}
      simulationRef={simulationRef}
      spawn={spawn}
      viewerSceneReady={viewerSceneReady}
      visualRootRef={visualRootRef}
      zombieMaterialPhaseActive={zombieMaterialPhaseActive}
    />
  )
}

type LandrushZombieEscapePresentationProps = {
  active: boolean
  combatStateRef: RefObject<LandrushRobotWeaponCombatState>
  expectedPhase: ZombieEscapeGamePhase
  generatedAssetRetryGeneration: number
  groundY: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  materialPresentation: LandrushIslandMaterialPresentationOwner
  materialPresentationReadinessMeshes: readonly LandrushIslandMaterialReadinessMesh[]
  muzzlePoseRef: MutableRefObject<LandrushRobotWeaponMuzzlePose>
  navigationOverlayEnabled: boolean
  onGeneratedAssetsFailureChange: (failures: readonly ZombieEscapeGeneratedAssetFailure[]) => void
  onGeneratedAssetsReadinessChange: (readiness: ZombieEscapeGeneratedAssetReadinessSnapshot) => void
  playerColor: string
  renderReadinessCamera: Camera
  renderReadinessRegistry: ZombieEscapeRenderReadinessRegistry
  runtimePhaseReady: boolean
  shoulderTorchLightingStateRef: RefObject<LandrushRobotShoulderTorchLightingState>
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  spawn: Readonly<{ x: number; z: number }>
  viewerSceneReady: boolean
  visualRootRef: MutableRefObject<Group | null>
  zombieMaterialPhaseActive: boolean
}

const LandrushZombieEscapePresentation = memo(function LandrushZombieEscapePresentation({
  active,
  combatStateRef,
  expectedPhase,
  generatedAssetRetryGeneration,
  groundY,
  impactVisualRegistry,
  materialPresentation,
  materialPresentationReadinessMeshes,
  muzzlePoseRef,
  navigationOverlayEnabled,
  onGeneratedAssetsFailureChange,
  onGeneratedAssetsReadinessChange,
  playerColor,
  renderReadinessCamera,
  renderReadinessRegistry,
  runtimePhaseReady,
  shoulderTorchLightingStateRef,
  simulationRef,
  spawn,
  viewerSceneReady,
  visualRootRef,
  zombieMaterialPhaseActive,
}: LandrushZombieEscapePresentationProps) {
  return (
    <>
      <LandrushIslandMaterialPresentationRenderReadiness
        meshes={materialPresentationReadinessMeshes}
        owner={materialPresentation}
        ready={viewerSceneReady}
        registry={renderReadinessRegistry}
      />
      <group position={[spawn.x, groundY, spawn.z]} visible={active}>
        <ZombieEscapeActors
          detailedZombies={false}
          impactVisualRegistry={impactVisualRegistry}
          onGeneratedAssetsFailureChange={onGeneratedAssetsFailureChange}
          onGeneratedAssetsReadinessChange={onGeneratedAssetsReadinessChange}
          presentationFramePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.presentation}
          playerColor={playerColor}
          quality="balanced"
          renderReadinessCamera={renderReadinessCamera}
          renderReadinessRegistry={renderReadinessRegistry}
          renderPlayer={false}
          retryGeneratedAssetsGeneration={generatedAssetRetryGeneration}
          shoulderTorchLightingStateRef={shoulderTorchLightingStateRef}
          simulationRef={simulationRef}
          zombieMaterialPhaseActive={zombieMaterialPhaseActive}
        />
        <ZombieEscapeEffects
          framePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.effects}
          impactVisualRegistry={impactVisualRegistry}
          renderReadinessRegistry={renderReadinessRegistry}
          simulationRef={simulationRef}
        />
      </group>
      <ZombieEscapeAudio
        active={active}
        originX={spawn.x}
        originY={groundY}
        originZ={spawn.z}
        simulationRef={simulationRef}
      />
      <LandrushZombieEscapeStructurePresentation active={active} simulationRef={simulationRef} />
      <LandrushZombieEscapePlayerHitPresentationView
        active={active}
        framePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.presentation}
        simulationRef={simulationRef}
        visualRootRef={visualRootRef}
      />
      {navigationOverlayEnabled && active && runtimePhaseReady && expectedPhase === 'night' ? (
        <Suspense fallback={null}>
          <LazyLandrushZombieNavigationOverlay
            framePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.navigationOverlay}
            originX={spawn.x}
            originY={groundY}
            originZ={spawn.z}
            simulationRef={simulationRef}
          />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <LandrushRobotWeaponRig
          active={active}
          combatStateRef={combatStateRef}
          framePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.weapon}
          muzzlePoseRef={muzzlePoseRef}
          renderReadinessRegistry={renderReadinessRegistry}
          shoulderTorchLightingStateRef={shoulderTorchLightingStateRef}
          visualRootRef={visualRootRef}
        />
      </Suspense>
    </>
  )
})

type LandrushZombieEscapeHudProps = {
  expectedPhase: ZombieEscapeGamePhase
  generatedAssetFailureCount: number
  generatedAssetsRetrying: boolean
  inputMode: ZombieEscapeInputMode
  navigationError: string | null
  navigationRetrying: boolean
  onInput: (input: LandrushZombieEscapeTouchInputKind) => void
  onRetryGeneratedAssets: () => void
  onRunAgain: () => void
  onStartZombie: () => void
  ownerDocument: Document
  nightStartReady: boolean
  phaseReady: boolean
  runAgainAvailable: boolean
  snapshot: ZombieEscapeHudSnapshot
  zombieEscapeTouchInputRef: MutableRefObject<LandrushZombieEscapeTouchInputState>
}

export function resolveLandrushZombieEscapeControllerCommands({
  pickupAvailable,
  runAgainAvailable = true,
  terminal,
}: {
  pickupAvailable: boolean
  runAgainAvailable?: boolean
  terminal: boolean
}): LandrushControllerCommands {
  return {
    cross: { label: 'Jump' },
    l1: { label: 'Previous' },
    l2: { label: 'Crouch' },
    r1: { label: 'Next' },
    r2: { label: 'Attack' },
    square: { label: pickupAvailable ? 'Buy' : 'Interact' },
    ...(terminal && runAgainAvailable ? { triangle: { label: 'Run again' } } : {}),
  }
}

function LandrushZombieEscapeHud({
  expectedPhase,
  generatedAssetFailureCount,
  generatedAssetsRetrying,
  inputMode,
  navigationError,
  navigationRetrying,
  onInput,
  onRetryGeneratedAssets,
  onRunAgain,
  onStartZombie,
  ownerDocument,
  nightStartReady,
  phaseReady,
  runAgainAvailable,
  snapshot,
  zombieEscapeTouchInputRef,
}: LandrushZombieEscapeHudProps) {
  const phase = snapshot.phase === 'night' ? 'night' : 'build'
  const nightInteractionHudVisible = shouldShowLandrushZombieEscapeNightInteractionHud({
    actualPhase: snapshot.phase,
    expectedPhase,
    phaseReady,
  })
  const pickupPrompt = nightInteractionHudVisible ? snapshot.pickupPrompt : null
  const health = Math.max(0, Math.min(100, snapshot.health))
  const terminal = snapshot.status !== 'playing'
  const recovery = resolveLandrushZombieEscapeRecoveryPresentation({
    generatedAssetFailureCount,
    generatedAssetsRetrying,
    navigationError,
    navigationRetrying,
  })
  const controllerCommands = resolveLandrushZombieEscapeControllerCommands({
    pickupAvailable: pickupPrompt !== null,
    runAgainAvailable,
    terminal,
  })
  const moneyVisible = shouldShowLandrushZombieEscapeMoney({
    actualPhase: snapshot.phase,
    expectedPhase,
    phaseReady,
  })
  const touchControlsVisible = shouldShowLandrushZombieEscapeTouchControls({
    actualPhase: snapshot.phase,
    expectedPhase,
    phaseReady,
    terminal,
  })
  const pickupPresentation = pickupPrompt
    ? resolveLandrushZombieEscapePickupPromptPresentation({ inputMode, prompt: pickupPrompt })
    : null
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 select-none text-white"
      data-actual-avatar="/navigation/proto_pascal_robot.glb"
      data-expected-phase={expectedPhase}
      data-integrated-landrush-world="true"
      data-night-start-ready={nightStartReady ? 'true' : 'false'}
      data-phase={phase}
      data-phase-ready={phaseReady ? 'true' : 'false'}
      data-shot-carriers-per-event="1"
      data-testid="landrush-zombie-escape-hud"
    >
      <LandrushZombieEscapeTouchJoysticks
        inputRef={zombieEscapeTouchInputRef}
        onInput={onInput}
        ownerDocument={ownerDocument}
        visible={touchControlsVisible}
      />
      <ZombieEscapeWeaponInventoryRow
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-20 [@media(any-pointer:coarse)]:right-[calc(max(1rem,env(safe-area-inset-right))+clamp(4.2rem,15.4vw,5.6rem)+1rem)] [@media(any-pointer:coarse)]:left-[calc(max(1rem,env(safe-area-inset-left))+clamp(4.2rem,15.4vw,5.6rem)+1rem)] [@media(any-pointer:coarse)]:flex-wrap [@media(any-pointer:coarse)]:justify-center"
        weaponIndex={snapshot.weaponIndex}
        weaponInventoryMask={snapshot.weaponInventoryMask}
      />
      {moneyVisible ? (
        <ZombieEscapeMoneyBadge className="absolute top-4 left-4" money={snapshot.money} />
      ) : null}
      {nightInteractionHudVisible && inputMode === 'gamepad' ? (
        <LandrushControllerCommandHud
          className="absolute top-14 right-3 z-30 md:top-[18vh] md:right-5"
          commands={controllerCommands}
          label="Zombie Escape controller commands"
        />
      ) : null}
      {phase === 'build' ? (
        <LandrushZombieEscapeStartButton
          disabled={!nightStartReady || expectedPhase !== 'build' || terminal}
          onStartZombie={onStartZombie}
        />
      ) : (
        <div
          aria-label={`Robot health ${String(Math.ceil(health))}%`}
          className="absolute top-5 left-1/2 h-2 w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 overflow-hidden rounded-full bg-black/25 shadow-[0_1px_10px_rgba(0,0,0,0.28)]"
          data-testid="landrush-zombie-escape-life-bar"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={health}
          role="meter"
        >
          <div
            className="h-full rounded-full bg-rose-400 transition-[width] duration-100"
            style={{ width: `${String(health)}%` }}
          />
        </div>
      )}
      {pickupPresentation ? (
        <div
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/52 px-3 py-2 text-[11px] text-white/92 shadow-lg backdrop-blur-sm"
          data-testid="landrush-zombie-escape-pickup-prompt"
        >
          {pickupPresentation.badge ? (
            <kbd className="grid size-6 place-items-center rounded-full bg-white text-[11px] text-slate-950">
              {pickupPresentation.badge}
            </kbd>
          ) : null}
          <span>{pickupPresentation.message}</span>
        </div>
      ) : null}
      {recovery.visible ? (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-slate-950/24 backdrop-blur-[2px]">
          <section
            className="mx-4 w-[min(430px,calc(100vw-2rem))] rounded-3xl border border-white/18 bg-slate-950/88 p-7 text-center shadow-2xl"
            data-testid="landrush-zombie-escape-loading-recovery"
            role="alert"
          >
            <p className="font-black text-amber-200 text-xs uppercase tracking-[0.28em]">
              Zombie Escape preparation
            </p>
            <h1 className="mt-3 font-black text-2xl">
              {recovery.retrying
                ? 'Retrying the required world data…'
                : navigationError
                  ? 'Island navigation could not be prepared.'
                  : 'Some models failed to load.'}
            </h1>
            <p className="mt-3 text-sm text-white/65">
              {navigationError ?? 'Required combat assets must be ready before play can continue.'}
            </p>
            <button
              className="mt-6 rounded-xl border border-white/18 bg-white/10 px-4 py-2 font-semibold text-sm text-white transition enabled:hover:border-white/35 enabled:hover:bg-white/16 disabled:cursor-wait disabled:opacity-55"
              data-testid="landrush-zombie-escape-retry-assets"
              disabled={recovery.retrying}
              onClick={onRetryGeneratedAssets}
              type="button"
            >
              {recovery.retrying ? 'Retrying…' : 'Retry preparation'}
            </button>
          </section>
        </div>
      ) : null}
      {terminal ? (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-slate-950/45 backdrop-blur-[3px]">
          <section className="mx-4 w-[min(430px,calc(100vw-2rem))] rounded-3xl border border-white/18 bg-slate-950/88 p-7 text-center shadow-2xl">
            <p className="font-black text-amber-200 text-xs uppercase tracking-[0.28em]">
              {snapshot.status === 'won' ? 'Extraction complete' : 'Robot disabled'}
            </p>
            <h1 className="mt-3 font-black text-3xl">
              {snapshot.status === 'won' ? 'You escaped the island.' : 'The horde closed in.'}
            </h1>
            <p className="mt-3 text-sm text-white/65">
              Seeded run · {snapshot.kills} zombies cleared · {snapshot.elapsedSeconds.toFixed(1)}s
            </p>
            {runAgainAvailable ? (
              <button
                className="mt-6 rounded-xl border border-white/18 bg-white/10 px-4 py-2 font-semibold text-sm text-white transition hover:border-white/35 hover:bg-white/16"
                data-testid="landrush-zombie-escape-run-again"
                onClick={onRunAgain}
                type="button"
              >
                {inputMode === 'gamepad' ? '△ / Y Run again' : 'Run again'}
              </button>
            ) : (
              <p
                className="mt-6 font-semibold text-sm text-amber-100/90"
                data-testid="landrush-zombie-escape-waiting-for-survivors"
              >
                Waiting for survivors…
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

export function resolveLandrushZombieEscapePickupPromptPresentation({
  inputMode,
  prompt,
}: {
  inputMode: ZombieEscapeInputMode
  prompt: ZombieEscapePickupPrompt
}) {
  if (inputMode === 'touch') {
    return {
      badge: null,
      message: prompt.affordable
        ? `Auto-buy ${prompt.displayName} · $${String(prompt.cost)}`
        : `Need $${String(prompt.cost)} for ${prompt.displayName}`,
    } as const
  }
  return {
    badge: inputMode === 'gamepad' ? '□' : 'E',
    message: `${prompt.affordable ? 'Buy' : 'Need'} ${prompt.displayName} · $${String(prompt.cost)}`,
  } as const
}

export function LandrushZombieEscapeStartButton({
  disabled,
  onStartZombie,
}: {
  disabled: boolean
  onStartZombie: () => void
}) {
  return (
    <button
      aria-label="Start zombie"
      className="pointer-events-auto absolute top-4 left-1/2 grid size-[5.625rem] -translate-x-1/2 place-items-center rounded-full border border-white/15 bg-slate-950/58 p-0 text-white/90 shadow-lg backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 enabled:cursor-pointer enabled:hover:border-amber-200/45 enabled:hover:bg-slate-950/72 enabled:hover:shadow-xl focus-visible:border-amber-200/55 focus-visible:bg-slate-950/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/45 disabled:cursor-wait disabled:opacity-60"
      data-testid="landrush-zombie-escape-build-countdown"
      disabled={disabled}
      onClick={onStartZombie}
      title="Start zombie"
      type="button"
    >
      <svg aria-hidden="true" className="size-[3.75rem]" viewBox="0 0 24 24">
        <defs>
          <clipPath id="landrush-zombie-start-moon-clip">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </clipPath>
        </defs>
        <path
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
          fill="#d8c99f"
          stroke="#fff1bd"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={0.7}
        />
        <g clipPath="url(#landrush-zombie-start-moon-clip)" data-moon-texture="true">
          <ellipse cx="8.2" cy="8.6" fill="#f3e6bd" opacity={0.5} rx="5.8" ry="6.7" />
          <circle cx="6.1" cy="9.1" fill="#81775f" opacity={0.64} r="1.35" />
          <circle cx="6" cy="8.8" fill="#b6a77f" opacity={0.72} r="0.72" />
          <circle cx="8.5" cy="14.7" fill="#776e59" opacity={0.58} r="1.7" />
          <circle cx="8.2" cy="14.3" fill="#bcad84" opacity={0.7} r="0.94" />
          <circle cx="11.3" cy="18.2" fill="#887d62" opacity={0.58} r="1.08" />
          <circle cx="11.1" cy="17.9" fill="#c4b58b" opacity={0.72} r="0.55" />
          <circle cx="4.3" cy="13.3" fill="#8c8165" opacity={0.52} r="0.72" />
          <circle cx="9.8" cy="6.1" fill="#8c8165" opacity={0.48} r="0.62" />
          <path
            d="M3.2 16.2c2.2-.9 3.7-.5 5.1.5 1.3.9 2.6 1.2 4.8.4"
            fill="none"
            opacity={0.28}
            stroke="#6f6652"
            strokeLinecap="round"
            strokeWidth={0.65}
          />
        </g>
        <path
          d="M21 12.79A9 9 0 1 1 11.21 3"
          fill="none"
          opacity={0.72}
          stroke="#fff7d6"
          strokeLinecap="round"
          strokeWidth={0.45}
        />
      </svg>
    </button>
  )
}

function generatedAssetFailuresMatch(
  first: readonly ZombieEscapeGeneratedAssetFailure[],
  second: readonly ZombieEscapeGeneratedAssetFailure[],
) {
  if (first.length !== second.length) return false
  return first.every(
    (failure, index) =>
      failure.key === second[index]?.key && failure.message === second[index]?.message,
  )
}

function clampLandrushZombieEscapeHudHealth(health: number) {
  return Math.max(0, Math.min(100, health))
}

function landrushZombieEscapePickupPromptsMatch(
  first: ZombieEscapePickupPrompt | null,
  second: ZombieEscapePickupPrompt | null,
) {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.affordable === second.affordable &&
      first.cost === second.cost &&
      first.displayName === second.displayName &&
      first.weaponIndex === second.weaponIndex)
  )
}

function syncIntegratedPlayerPose(
  simulation: ZombieEscapeSimulation,
  motion: LandrushZombieEscapePlayerMotion,
  groundY: number,
  spawn: Readonly<{ x: number; z: number }>,
) {
  simulation.player.x = motion.position.x - spawn.x
  simulation.player.y = motion.position.y - groundY
  simulation.player.z = motion.position.z - spawn.z
  simulation.player.vx = 0
  simulation.player.vz = 0
  simulation.player.movementHeading = motion.heading
  simulation.player.locomotionBlend = motion.isMoving ? 1 : 0
  simulation.player.runBlend = motion.runRequested ? 1 : 0
}

export function createLandrushZombieEscapeIntegratedDebugBridge({
  arena,
  groundY,
  navigationScaleProofFixtureCapture,
  navigationScaleProofRunner,
  readExpectedPhase,
  readMuzzlePose,
  readPhaseReady,
  roomSoakState,
  simulation,
  spawn,
}: {
  arena: ZombieEscapeArenaData
  groundY: number
  navigationScaleProofFixtureCapture: LandrushZombieEscapeNavigationScaleProofFixtureCaptureRunner | null
  navigationScaleProofRunner: LandrushZombieEscapeNavigationScaleProofRunner | null
  readExpectedPhase: () => ZombieEscapeGamePhase
  readMuzzlePose: () => ReturnType<typeof createLandrushRobotWeaponMuzzlePose>
  readPhaseReady: () => boolean
  roomSoakState: LandrushZombieEscapeRoomSoakState
  simulation: ZombieEscapeSimulation
  spawn: Readonly<{ x: number; z: number }>
}) {
  const bridge: Record<string, unknown> = {
    actualAvatar: '/navigation/proto_pascal_robot.glb',
    arena: { playRadius: arena.playRadius, worldOrigin: [spawn.x, groundY, spawn.z] },
    frameOrder: LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER,
    integratedIntoExistingCanvas: true,
    get benchmarkRoomSoak() {
      return readLandrushZombieEscapeRoomSoakSnapshot(roomSoakState, simulation)
    },
    get economy() {
      return {
        ammo: simulation.player.ammo,
        money: simulation.money,
        weaponPickupRespawnAtSeconds: Array.from(simulation.weaponPickupRespawnAtSeconds),
        weaponPurchaseCount: simulation.weaponPurchaseCount,
      }
    },
    get elapsedSeconds() {
      return simulation.elapsedSeconds
    },
    get expectedPhase() {
      return readExpectedPhase()
    },
    get lastShot() {
      const slot = simulation.lastShotSlot
      if (slot < 0 || simulation.shots.pool.generation[slot] !== simulation.lastShotGeneration) {
        return null
      }
      return {
        currentWorld: [
          simulation.shots.x[slot]! + spawn.x,
          simulation.shots.y[slot]! + groundY,
          simulation.shots.z[slot]! + spawn.z,
        ],
        generation: simulation.lastShotGeneration,
        hitWorld: [
          simulation.shots.hitX[slot]! + spawn.x,
          simulation.shots.hitY[slot]! + groundY,
          simulation.shots.hitZ[slot]! + spawn.z,
        ],
        impactKind: simulation.shots.impactKind[slot],
        originWorld: [
          simulation.shots.originX[slot]! + spawn.x,
          simulation.shots.originY[slot]! + groundY,
          simulation.shots.originZ[slot]! + spawn.z,
        ],
        phase: simulation.shots.phase[slot],
        slot,
      }
    },
    get muzzle() {
      const muzzlePose = readMuzzlePose()
      return muzzlePose.ready
        ? {
            direction: muzzlePose.direction.toArray(),
            position: muzzlePose.position.toArray(),
            ready: true,
          }
        : { ready: false }
    },
    get night() {
      return simulation.night
    },
    get performance() {
      return {
        collisionWorldGeneration: simulation.collisionWorldGeneration,
        routing: createLandrushZombieEscapeRoutingDebugSnapshot(simulation),
        spatial: {
          buildCount: simulation.agentSpatialIndex.buildCount,
          candidateInspectionCount: simulation.agentSpatialIndex.candidateInspectionCount,
          indexedAgentCount: simulation.agentSpatialIndex.indexedAgentCount,
          maximumCandidateInspectionsObserved:
            simulation.agentSpatialIndex.maximumCandidateInspectionsObserved,
          maximumCandidateInspectionsPerQuery:
            simulation.agentSpatialIndex.maximumCandidateInspectionsPerQuery,
          overflowQueryCount: simulation.agentSpatialIndex.overflowQueryCount,
          pairInspectionCount: simulation.agentSpatialIndex.pairInspectionCount,
          queryCount: simulation.agentSpatialIndex.queryCount,
          separationNeighborCount: simulation.agentSpatialIndex.separationNeighborCount,
          unindexedAgentCount: simulation.agentSpatialIndex.unindexedAgentCount,
        },
      }
    },
    get phase() {
      return simulation.phase
    },
    get phaseReady() {
      return readPhaseReady()
    },
    get phaseSecondsRemaining() {
      return simulation.phaseSecondsRemaining
    },
    get pickups() {
      return simulation.weaponPickups.map((pickup) => ({
        available: isZombieEscapeWeaponPickupAvailable(simulation, pickup.weaponIndex),
        scopeId: pickup.scopeId,
        weapon: ZOMBIE_ESCAPE_WEAPON_CATALOG[pickup.weaponIndex]?.id ?? null,
        world: [pickup.x + spawn.x, pickup.y + groundY, pickup.z + spawn.z],
      }))
    },
    get shots() {
      return {
        active: simulation.shots.pool.activeCount,
        impact: countZombieEscapeShotsByPhase(simulation.shots, ZOMBIE_ESCAPE_SHOT_PHASE.impact),
        oneAuthoritativeCarrierPerShot: true,
        shotsFired: simulation.shotsFired,
        travel: countZombieEscapeShotsByPhase(simulation.shots, ZOMBIE_ESCAPE_SHOT_PHASE.travel),
      }
    },
    get status() {
      return simulation.status
    },
    get targets() {
      let reacting = 0
      for (let slot = 0; slot < simulation.zombies.pool.capacity; slot += 1) {
        if (
          simulation.zombies.pool.active[slot] !== 0 &&
          (simulation.zombies.hitFlash[slot]! > 0 || simulation.zombies.hitReaction[slot]! > 0)
        ) {
          reacting += 1
        }
      }
      return { active: simulation.zombies.pool.activeCount, reacting }
    },
    get weapon() {
      return ZOMBIE_ESCAPE_WEAPON_CATALOG[simulation.player.weaponIndex]?.id ?? null
    },
  }
  if (navigationScaleProofRunner) bridge.runNavigationScaleProof = navigationScaleProofRunner
  if (navigationScaleProofFixtureCapture) {
    bridge.captureNavigationScaleProofFixture = navigationScaleProofFixtureCapture
  }
  return bridge
}
