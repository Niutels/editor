'use client'

import { useGLTFKTX2, useGpuResourceLifetime } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Component,
  type ErrorInfo,
  type MutableRefObject,
  memo,
  type ReactNode,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  type Camera,
  Color,
  Euler,
  Group,
  LoopOnce,
  LoopRepeat,
  type Material,
  type Mesh,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { LandrushRobotShoulderTorchLightingState } from './landrush-robot-shoulder-torch'
import {
  parseLandrushZombieNightDebugQuery,
  resolveLandrushZombieNightVisibilityTreatment,
} from './landrush-zombie-night-presentation-state'
import {
  createZombieEscapeAttackClip,
  isZombieEscapeAttackPresentationActive,
  resolveZombieEscapeAttackNormalizedPhase,
} from './zombie-escape-attack-presentation'
import { resolveZombieEscapeDeathNormalizedPhase } from './zombie-escape-character-motion'
import type { ZombieEscapeQuality } from './zombie-escape-config'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'
import {
  resolveZombieEscapeGeneratedAssetReadinessSnapshot,
  resolveZombieEscapeGeneratedAssetSettlement,
  tryCreateZombieEscapeGeneratedAsset,
  type ZombieEscapeGeneratedAssetReadinessSnapshot,
  type ZombieEscapeGeneratedAssetTerminalStatus,
} from './zombie-escape-generated-asset-readiness'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'
import {
  countZombieEscapeAuthoredVariantCapacity,
  createZombieEscapeAuthoredInstancePresentationCooperatively,
  type ZombieEscapeAuthoredInstancePresentation,
  type ZombieEscapeAuthoredInstanceSelection,
} from './zombie-escape-instanced-skinned-presentation'
import {
  resolveZombieEscapeLocomotionPlaybackRate,
  resolveZombieEscapeLocomotionWeight,
} from './zombie-escape-locomotion-playback'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import {
  createZombieEscapeHeldWeaponRenderRepresentativeKey,
  createZombieEscapeRenderReadinessCoordinator,
  createZombieEscapeZombieRenderRepresentativeKey,
  resolveZombieEscapeRenderReadinessProgressTotal,
  ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY,
  type ZombieEscapePipelineRenderer,
  type ZombieEscapeRenderReadinessCoordinator,
  type ZombieEscapeRenderReadinessRegistry,
  type ZombieEscapeRenderReadinessSnapshot,
  type ZombieEscapeRenderReadinessStatus,
} from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'
import {
  isZombieEscapeWeaponPickupAvailable,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import {
  registerZombieEscapeImpactVisual,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'
import {
  createZombieEscapeVisualLodState,
  resolveZombieEscapeDetailedRootPoolSize,
  updateZombieEscapePresentationLodDebugAuthoredVariant,
  updateZombieEscapePresentationLodDebugSelection,
  updateZombieEscapePresentationLodDebugVariant,
  updateZombieEscapeVisualLod,
  type ZombieEscapePresentationLodDebugSnapshot,
  type ZombieEscapeVisualLodInput,
  type ZombieEscapeVisualLodState,
} from './zombie-escape-visual-lod'
import {
  ZOMBIE_ESCAPE_WEAPON_CATALOG,
  type ZombieEscapeWeaponSpecification,
} from './zombie-escape-weapon-catalog'
import {
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
  type ZombieEscapeZombieCatalogEntry,
} from './zombie-escape-zombie-catalog'
import {
  createZombieEscapeZombieShader,
  type ZombieEscapeZombieShader,
} from './zombie-escape-zombie-material'

export type GeneratedZombieVisual = {
  animationRoot: Group
  attackAction: ReturnType<AnimationMixer['clipAction']> | null
  deathAction: ReturnType<AnimationMixer['clipAction']> | null
  generation: number
  hitMaterials: Array<{
    baseColor: Color | null
    baseEmissive: Color
    baseEmissiveIntensity: number
    material: Material & { color?: Color; emissive: Color; emissiveIntensity: number }
  }>
  mixer: AnimationMixer | null
  ownedMaterials: Material[]
  root: Group
  runAction: ReturnType<AnimationMixer['clipAction']> | null
  unregisterImpactVisual: () => void
  walkAction: ReturnType<AnimationMixer['clipAction']> | null
}

type GeneratedAssetStatusReporter = (
  key: string,
  status: ZombieEscapeGeneratedAssetTerminalStatus | null,
) => void

type ZombieVisualPrewarmCoordinator = {
  claimed: boolean
  frameToken: number
}

const ZOMBIE_HIT_BLACK = new Color('#030104')
const ZOMBIE_HIT_RED = new Color('#ff1738')
const ZOMBIE_VARIANT_INDICES = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((_, index) => index)
const GENERATED_WEAPON_ASSET_KEYS = ZOMBIE_ESCAPE_WEAPON_CATALOG.map(
  (weapon) => `weapon:${weapon.assetPath}`,
)
const GENERATED_ZOMBIE_ASSET_KEYS = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(
  (zombie) => `zombie:${zombie.id}`,
)
export const ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS = Object.freeze([
  ...GENERATED_WEAPON_ASSET_KEYS,
  ...GENERATED_ZOMBIE_ASSET_KEYS,
])
export const ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_CATALOG_SIGNATURE = `zombie-balanced-assets:${JSON.stringify(
  ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS,
)}`
const GENERATED_ASSET_PATH_ENTRIES: Array<readonly [string, readonly string[]]> = [
  ...ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon): readonly [string, readonly string[]] => [
    `weapon:${weapon.assetPath}`,
    [weapon.assetPath],
  ]),
  ...ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie): readonly [string, readonly string[]] => [
    `zombie:${zombie.id}`,
    [zombie.glb.riggedBase.path, zombie.glb.run.path, zombie.glb.walk.path],
  ]),
]
const GENERATED_ASSET_PATHS_BY_KEY = new Map(GENERATED_ASSET_PATH_ENTRIES)
const EMPTY_RENDER_READINESS_SNAPSHOT: ZombieEscapeRenderReadinessSnapshot = {
  complete: false,
  missingKeys: [],
  representatives: [],
  revision: 0,
}
const subscribeToNoRenderReadinessRegistry = () => () => undefined
const getEmptyRenderReadinessSnapshot = () => EMPTY_RENDER_READINESS_SNAPSHOT
const EMPTY_READY_ZOMBIE_VARIANTS = new Set<number>()

function yieldZombieEscapeAuthoredBuildSlice() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

export function resolveZombieEscapeGeneratedVariantAdmissionCount(
  admittedCount: number,
  settledVariantIndices: ReadonlySet<number>,
  totalCount = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
) {
  const boundedTotal = Math.max(0, Math.floor(totalCount))
  const boundedCount = Math.min(boundedTotal, Math.max(0, Math.floor(admittedCount)))
  if (boundedCount >= boundedTotal) return boundedCount
  return boundedCount === 0 || settledVariantIndices.has(boundedCount - 1)
    ? boundedCount + 1
    : boundedCount
}

export type ZombieEscapeGeneratedAssetFailure = Readonly<{
  key: string
  message: string
}>

export function resolveZombieEscapeRenderPipelineSettlement(
  status: ZombieEscapeRenderReadinessStatus,
) {
  if (status.state === 'ready') {
    return { contentReady: true as const, diagnostic: null }
  }
  if (status.state === 'degraded') {
    return {
      contentReady: false as const,
      diagnostic: {
        level: 'warning' as const,
        message: status.message,
      },
    }
  }
  return {
    contentReady: false as const,
    diagnostic: {
      level: 'error' as const,
      message: status.message,
    },
  }
}

export function updateZombieEscapeRenderPipelineProgress(
  current: { completed: number; total: number },
  progress: Readonly<{ completed: number; total: number }>,
) {
  if (current.completed === progress.completed && current.total === progress.total) return false
  current.completed = progress.completed
  current.total = progress.total
  return true
}

export function isZombieEscapeZombieSlotExternallyPresented(
  simulation: ZombieEscapeSimulation,
  slot: number,
) {
  const zombies = simulation.zombies
  if (slot < 0 || slot >= zombies.pool.active.length || zombies.pool.active[slot] === 0) {
    return false
  }
  const npcIndex = simulation.ambientHandoff.npcIndexBySlot[slot] ?? -1
  return (
    npcIndex >= 0 &&
    simulation.ambientHandoff.slotByNpcIndex[npcIndex] === slot &&
    simulation.ambientHandoff.generationByNpcIndex[npcIndex] === zombies.pool.generation[slot]
  )
}

export type ZombieEscapeAuthoredVariantSlotBuckets =
  readonly ZombieEscapeAuthoredInstanceSelection[]

export function createZombieEscapeAuthoredVariantSlotBuckets(
  variantByPoolSlot: Uint8Array,
  variantCount: number,
): ZombieEscapeAuthoredVariantSlotBuckets {
  if (!(Number.isSafeInteger(variantCount) && variantCount >= 1 && variantCount <= 256)) {
    throw new Error(
      `Authored zombie variant count must be an integer from 1 to 256; received ${String(variantCount)}.`,
    )
  }
  if (variantByPoolSlot.length > 65_536) {
    throw new Error('Authored zombie pool slots must fit in unsigned 16-bit selection storage.')
  }
  for (const variantIndex of variantByPoolSlot) {
    if (variantIndex >= variantCount) {
      throw new Error(
        `Authored zombie pool variant ${String(variantIndex)} has no selection bucket.`,
      )
    }
  }
  return Array.from({ length: variantCount }, (_, variantIndex) => ({
    count: 0,
    slots: new Uint16Array(
      countZombieEscapeAuthoredVariantCapacity(variantByPoolSlot, variantIndex),
    ),
  }))
}

export function updateZombieEscapeGeneratedZombiePresentationExclusions(
  simulation: ZombieEscapeSimulation,
  detailedSlots: Uint8Array,
  externallyPresentedSlots: Uint8Array,
  authoredExclusionSlots: Uint8Array,
  authoredVariantSlots: ZombieEscapeAuthoredVariantSlotBuckets,
) {
  const zombies = simulation.zombies
  const capacity = zombies.pool.active.length
  if (
    detailedSlots.length < capacity ||
    externallyPresentedSlots.length < capacity ||
    authoredExclusionSlots.length < capacity ||
    zombies.variant.length < capacity
  ) {
    throw new Error('Generated zombie presentation exclusion arrays must cover the active pool.')
  }
  for (const selection of authoredVariantSlots) selection.count = 0
  for (let slot = 0; slot < capacity; slot += 1) {
    const externallyPresented = isZombieEscapeZombieSlotExternallyPresented(simulation, slot)
    const authoredExcluded = detailedSlots[slot] !== 0 || externallyPresented
    externallyPresentedSlots[slot] = externallyPresented ? 1 : 0
    authoredExclusionSlots[slot] = authoredExcluded ? 1 : 0
    if (zombies.pool.active[slot] === 0 || authoredExcluded) continue
    const variantIndex = zombies.variant[slot]!
    const selection = authoredVariantSlots[variantIndex]
    if (!selection) {
      throw new Error(
        `Authored zombie pool variant ${String(variantIndex)} has no selection bucket.`,
      )
    }
    if (selection.count >= selection.slots.length) {
      throw new Error(
        `Authored zombie instance capacity ${String(selection.slots.length)} is below the selected count.`,
      )
    }
    selection.slots[selection.count] = slot
    selection.count += 1
  }
}

export function clearZombieEscapeGeneratedAssetCaches(failedKeys?: readonly string[]) {
  const paths = failedKeys
    ? failedKeys.flatMap((key) => GENERATED_ASSET_PATHS_BY_KEY.get(key) ?? [])
    : Array.from(GENERATED_ASSET_PATHS_BY_KEY.values()).flat()
  for (const path of new Set(paths)) useGLTF.clear(path)
}

export const ZombieEscapeGeneratedAssets = memo(function ZombieEscapeGeneratedAssets({
  detailedZombies,
  detailedZombieSlotsRef,
  impactVisualRegistry,
  loadedZombieVariantsRef,
  omitHeldWeapon = false,
  onGeneratedAssetsFailureChange,
  onGeneratedAssetsReadinessChange,
  presentationLodDebugRef,
  quality,
  renderReadinessCamera,
  renderReadinessRegistry,
  retryGeneration = 0,
  simulationRef,
  shoulderTorchLightingStateRef,
  zombieMaterialPhaseActive,
  zombiePresentationFramePriority,
  zombieSelectionFramePriority,
}: {
  detailedZombies: boolean
  detailedZombieSlotsRef: MutableRefObject<Uint8Array>
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  omitHeldWeapon?: boolean
  onGeneratedAssetsFailureChange?: (failures: readonly ZombieEscapeGeneratedAssetFailure[]) => void
  onGeneratedAssetsReadinessChange?: (
    readiness: ZombieEscapeGeneratedAssetReadinessSnapshot,
  ) => void
  presentationLodDebugRef: MutableRefObject<ZombieEscapePresentationLodDebugSnapshot | null>
  quality: ZombieEscapeQuality
  renderReadinessCamera?: Camera
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  retryGeneration?: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  shoulderTorchLightingStateRef?: RefObject<LandrushRobotShoulderTorchLightingState>
  zombieMaterialPhaseActive: boolean
  zombiePresentationFramePriority?: number
  zombieSelectionFramePriority: number
}) {
  const { camera: activeCamera, gl, scene } = useThree()
  const pipelineCamera = renderReadinessCamera ?? activeCamera
  const [zombieNightVisibility] = useState(() =>
    typeof window === 'undefined'
      ? 'normal'
      : parseLandrushZombieNightDebugQuery(new URLSearchParams(window.location.search)).visibility,
  )
  const outsideTorchVisibility =
    resolveLandrushZombieNightVisibilityTreatment(zombieNightVisibility).outsideTorchVisibility
  const [zombieShader] = useState(() =>
    createZombieEscapeZombieShader({
      outsideTorchVisibility,
      phaseAmount: zombieMaterialPhaseActive ? 1 : 0,
    }),
  )
  useLayoutEffect(() => {
    zombieShader.setPhaseAmount(zombieMaterialPhaseActive ? 1 : 0)
  }, [zombieMaterialPhaseActive, zombieShader])
  const visualLodStateRef = useRef<ZombieEscapeVisualLodState | null>(null)
  const visualLodInputRef = useRef<ZombieEscapeVisualLodInput | null>(null)
  const [zombiePresentationExclusionSlots] = useState(() => {
    const capacity = simulationRef.current.zombies.pool.capacity
    return {
      authored: new Uint8Array(capacity),
      authoredByVariant: createZombieEscapeAuthoredVariantSlotBuckets(
        simulationRef.current.variantByPoolSlot,
        ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
      ),
      externallyPresented: new Uint8Array(capacity),
    }
  })
  const authoredZombieExclusionSlotsRef = useRef(zombiePresentationExclusionSlots.authored)
  const externallyPresentedZombieSlotsRef = useRef(
    zombiePresentationExclusionSlots.externallyPresented,
  )
  useFrame(() => {
    if (zombieMaterialPhaseActive && outsideTorchVisibility < 1) {
      zombieShader.setTorchLighting(shoulderTorchLightingStateRef?.current ?? null)
    }
    const simulation = simulationRef.current
    const capacity = simulation.zombies.pool.capacity
    let visualLodState = visualLodStateRef.current
    if (!visualLodState || visualLodState.capacity !== capacity) {
      visualLodState = createZombieEscapeVisualLodState(
        capacity,
        ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
      )
      visualLodStateRef.current = visualLodState
      detailedZombieSlotsRef.current = visualLodState.selected
    }
    let visualLodInput = visualLodInputRef.current
    if (!visualLodInput) {
      visualLodInput = {
        active: simulation.zombies.pool.active,
        elapsedSeconds: simulation.elapsedSeconds,
        generation: simulation.zombies.pool.generation,
        hitFlash: simulation.zombies.hitFlash,
        hitReaction: simulation.zombies.hitReaction,
        observerX: simulation.player.x,
        observerZ: simulation.player.z,
        readyVariants: EMPTY_READY_ZOMBIE_VARIANTS,
        variant: simulation.zombies.variant,
        x: simulation.zombies.x,
        z: simulation.zombies.z,
      }
      visualLodInputRef.current = visualLodInput
    }
    visualLodInput.active = simulation.zombies.pool.active
    visualLodInput.elapsedSeconds = simulation.elapsedSeconds
    visualLodInput.generation = simulation.zombies.pool.generation
    visualLodInput.hitFlash = simulation.zombies.hitFlash
    visualLodInput.hitReaction = simulation.zombies.hitReaction
    visualLodInput.observerX = simulation.player.x
    visualLodInput.observerZ = simulation.player.z
    visualLodInput.readyVariants = detailedZombies
      ? loadedZombieVariantsRef.current
      : EMPTY_READY_ZOMBIE_VARIANTS
    visualLodInput.variant = simulation.zombies.variant
    visualLodInput.x = simulation.zombies.x
    visualLodInput.z = simulation.zombies.z
    const counts = updateZombieEscapeVisualLod(visualLodState, visualLodInput)
    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedZombieSlotsRef.current,
      externallyPresentedZombieSlotsRef.current,
      authoredZombieExclusionSlotsRef.current,
      zombiePresentationExclusionSlots.authoredByVariant,
    )
    if (presentationLodDebugRef.current) {
      updateZombieEscapePresentationLodDebugSelection(presentationLodDebugRef.current, counts)
    }
  }, zombieSelectionFramePriority)
  const expectedKeys =
    quality === 'balanced'
      ? ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS
      : GENERATED_WEAPON_ASSET_KEYS
  const [allocationReadiness, setAllocationReadiness] = useState({
    generation: retryGeneration,
    ready: false,
  })
  const [pipelineAttempt, setPipelineAttempt] = useState(0)
  const coordinatorRef = useRef<ZombieEscapeRenderReadinessCoordinator | null>(null)
  if (!coordinatorRef.current) {
    coordinatorRef.current = createZombieEscapeRenderReadinessCoordinator({
      watchdogStartsOnAdmission: true,
    })
  }
  const renderReadinessSnapshot = useSyncExternalStore(
    renderReadinessRegistry?.subscribe ?? subscribeToNoRenderReadinessRegistry,
    renderReadinessRegistry?.getSnapshot ?? getEmptyRenderReadinessSnapshot,
    renderReadinessRegistry?.getSnapshot ?? getEmptyRenderReadinessSnapshot,
  )
  const pipelineRequestIdentity = useMemo(
    () => ({ attempt: pipelineAttempt, snapshot: renderReadinessSnapshot }),
    [pipelineAttempt, renderReadinessSnapshot],
  )
  const allocationReady =
    allocationReadiness.generation === retryGeneration && allocationReadiness.ready
  const readinessRef = useRef<{
    generation: number
    statuses: Map<string, ZombieEscapeGeneratedAssetTerminalStatus>
  }>({ generation: retryGeneration, statuses: new Map() })
  const pipelineReadinessRef = useRef({
    completed: 0,
    generation: retryGeneration,
    missingRepresentativeKeys: [] as readonly string[],
    ready: !renderReadinessRegistry,
    required: Boolean(renderReadinessRegistry),
    total: 1,
  })
  if (readinessRef.current.generation !== retryGeneration) {
    readinessRef.current = { generation: retryGeneration, statuses: new Map() }
  }
  if (
    pipelineReadinessRef.current.generation !== retryGeneration ||
    pipelineReadinessRef.current.required !== Boolean(renderReadinessRegistry)
  ) {
    pipelineReadinessRef.current = {
      completed: 0,
      generation: retryGeneration,
      missingRepresentativeKeys: [] as readonly string[],
      ready: !renderReadinessRegistry,
      required: Boolean(renderReadinessRegistry),
      total: 1,
    }
  }
  const publishReadiness = useCallback(() => {
    const readiness = readinessRef.current
    const pipelineReadiness = pipelineReadinessRef.current
    if (
      readiness.generation !== retryGeneration ||
      pipelineReadiness.generation !== retryGeneration
    ) {
      return
    }
    onGeneratedAssetsReadinessChange?.(
      resolveZombieEscapeGeneratedAssetReadinessSnapshot({
        expectedKeys,
        generation: retryGeneration,
        pipelineCompleted: pipelineReadiness.completed,
        pipelineMissingRepresentativeKeys: pipelineReadiness.missingRepresentativeKeys,
        pipelineReady: pipelineReadiness.ready,
        pipelineTotal: pipelineReadiness.total,
        statuses: readiness.statuses,
      }),
    )
  }, [expectedKeys, onGeneratedAssetsReadinessChange, retryGeneration])
  const reportAssetStatus = useCallback<GeneratedAssetStatusReporter>(
    (key, status) => {
      const readiness = readinessRef.current
      if (readiness.generation !== retryGeneration) return
      if (status) readiness.statuses.set(key, status)
      else readiness.statuses.delete(key)
      const settlement = resolveZombieEscapeGeneratedAssetSettlement(
        expectedKeys,
        readiness.statuses,
      )
      onGeneratedAssetsFailureChange?.(settlement.failed)
      setAllocationReadiness((current) =>
        current.generation === retryGeneration && current.ready === settlement.ready
          ? current
          : { generation: retryGeneration, ready: settlement.ready },
      )
      publishReadiness()
    },
    [expectedKeys, onGeneratedAssetsFailureChange, publishReadiness, retryGeneration],
  )

  useEffect(() => publishReadiness(), [publishReadiness])

  useEffect(() => {
    const coordinator = coordinatorRef.current
    const pipelineReadiness = pipelineReadinessRef.current
    if (pipelineReadiness.generation !== retryGeneration) return
    if (!(coordinator && renderReadinessRegistry)) {
      pipelineReadiness.ready = true
      publishReadiness()
      return
    }
    const pipelineRenderer = gl as unknown as ZombieEscapePipelineRenderer
    const pipelineTotal = resolveZombieEscapeRenderReadinessProgressTotal(pipelineRenderer)
    pipelineReadiness.completed = 0
    pipelineReadiness.missingRepresentativeKeys = renderReadinessSnapshot.missingKeys
    pipelineReadiness.ready = false
    pipelineReadiness.total = pipelineTotal
    publishReadiness()

    let active = true
    const isCurrentSnapshot = () =>
      active &&
      readinessRef.current.generation === retryGeneration &&
      pipelineReadinessRef.current === pipelineReadiness &&
      renderReadinessRegistry.getSnapshot() === renderReadinessSnapshot
    const isCurrentFinalRequest = () =>
      isCurrentSnapshot() &&
      resolveZombieEscapeGeneratedAssetSettlement(expectedKeys, readinessRef.current.statuses).ready
    const retryStalePipeline = (status: 'failed' | 'ready' | 'stale') => {
      if (status === 'stale' && isCurrentSnapshot()) {
        setPipelineAttempt((current) => current + 1)
      }
    }
    if (!(allocationReady && renderReadinessSnapshot.complete)) {
      coordinator.invalidate()
      return () => {
        active = false
      }
    }

    void coordinator
      .request(
        {
          camera: pipelineCamera,
          generation: retryGeneration,
          identity: pipelineRequestIdentity,
          representatives: renderReadinessSnapshot.representatives,
          renderer: pipelineRenderer,
          targetScene: scene,
        },
        (status) => {
          if (!isCurrentFinalRequest()) return
          const settlement = resolveZombieEscapeRenderPipelineSettlement(status)
          if (settlement.diagnostic?.level === 'error') {
            console.error(
              '[zombie-escape] Required render pipeline preparation failed; keeping loading active for retry.',
              settlement.diagnostic.message,
            )
            onGeneratedAssetsFailureChange?.([
              ...resolveZombieEscapeGeneratedAssetSettlement(
                expectedKeys,
                readinessRef.current.statuses,
              ).failed,
              { key: 'render:pipeline', message: settlement.diagnostic.message },
            ])
          } else if (settlement.diagnostic) {
            console.warn(
              '[zombie-escape] Required render pipeline preparation exceeded its warning threshold; keeping loading active until it settles.',
              settlement.diagnostic.message,
            )
          }
          const currentPipelineReadiness = pipelineReadinessRef.current
          if (currentPipelineReadiness.generation !== retryGeneration) return
          currentPipelineReadiness.ready = settlement.contentReady
          publishReadiness()
        },
        (progress) => {
          if (!isCurrentFinalRequest()) return
          if (
            !updateZombieEscapeRenderPipelineProgress(pipelineReadiness, {
              completed: Math.max(pipelineReadiness.completed, progress.completed),
              total: progress.total,
            })
          ) {
            return
          }
          publishReadiness()
        },
      )
      .then(retryStalePipeline)
    return () => {
      active = false
    }
  }, [
    allocationReady,
    expectedKeys,
    gl,
    onGeneratedAssetsFailureChange,
    pipelineCamera,
    pipelineRequestIdentity,
    publishReadiness,
    renderReadinessRegistry,
    renderReadinessSnapshot,
    retryGeneration,
    scene,
  ])

  useEffect(
    () => () => {
      coordinatorRef.current?.invalidate()
    },
    [],
  )

  return (
    <>
      <ZombieEscapeGeneratedWeapons
        omitHeldWeapon={omitHeldWeapon}
        onAssetStatusChange={reportAssetStatus}
        renderReadinessRegistry={renderReadinessRegistry}
        retryGeneration={retryGeneration}
        simulationRef={simulationRef}
      />
      {quality === 'balanced' ? (
        <ZombieEscapeGeneratedZombies
          authoredZombieSelections={zombiePresentationExclusionSlots.authoredByVariant}
          detailedZombies={detailedZombies}
          detailedZombieSlotsRef={detailedZombieSlotsRef}
          externallyPresentedZombieSlotsRef={externallyPresentedZombieSlotsRef}
          impactVisualRegistry={impactVisualRegistry}
          loadedZombieVariantsRef={loadedZombieVariantsRef}
          onAssetStatusChange={reportAssetStatus}
          presentationLodDebugRef={presentationLodDebugRef}
          renderReadinessRegistry={renderReadinessRegistry}
          retryGeneration={retryGeneration}
          simulationRef={simulationRef}
          zombieShader={zombieShader}
          zombiePresentationFramePriority={zombiePresentationFramePriority}
        />
      ) : null}
    </>
  )
})

const ZombieEscapeGeneratedWeapons = memo(function ZombieEscapeGeneratedWeapons({
  omitHeldWeapon,
  onAssetStatusChange,
  renderReadinessRegistry,
  retryGeneration,
  simulationRef,
}: {
  omitHeldWeapon: boolean
  onAssetStatusChange: GeneratedAssetStatusReporter
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  retryGeneration: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  return (
    <group userData={{ generatedWeaponCount: ZOMBIE_ESCAPE_WEAPON_CATALOG.length }}>
      {omitHeldWeapon
        ? null
        : ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon, weaponIndex) => (
            <GeneratedHeldWeapon
              key={`held-${weapon.id}`}
              retryGeneration={retryGeneration}
              renderReadinessRegistry={renderReadinessRegistry}
              simulationRef={simulationRef}
              weapon={weapon}
              weaponIndex={weaponIndex}
            />
          ))}
      {ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon, weaponIndex) => (
        <GeneratedWeaponPickup
          key={`pickup-${weapon.id}`}
          onAssetStatusChange={onAssetStatusChange}
          renderReadinessRegistry={renderReadinessRegistry}
          retryGeneration={retryGeneration}
          simulationRef={simulationRef}
          weapon={weapon}
          weaponIndex={weaponIndex}
        />
      ))}
    </group>
  )
})

function GeneratedHeldWeapon({
  retryGeneration,
  renderReadinessRegistry,
  simulationRef,
  weapon,
  weaponIndex,
}: {
  retryGeneration: number
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  weapon: ZombieEscapeWeaponSpecification
  weaponIndex: number
}) {
  const rootRef = useRef<Group>(null)

  useFrame(() => {
    const root = rootRef.current
    if (!root) return
    const player = simulationRef.current.player
    root.visible = player.weaponIndex === weaponIndex
    root.position.set(player.x, 0, player.z)
    root.rotation.y = player.aimAngle
  }, -19)

  return (
    <group ref={rootRef}>
      <group position={[0.52, 1.12, 0.43]} scale={weapon.wield === 'one-hand' ? 1.45 : 1.12}>
        <GeneratedWeaponModel
          renderReadinessRegistry={renderReadinessRegistry}
          renderRepresentativeKey={createZombieEscapeHeldWeaponRenderRepresentativeKey(weapon.id)}
          retryGeneration={retryGeneration}
          weapon={weapon}
        />
      </group>
    </group>
  )
}

function GeneratedWeaponPickup({
  onAssetStatusChange,
  renderReadinessRegistry,
  retryGeneration,
  simulationRef,
  weapon,
  weaponIndex,
}: {
  onAssetStatusChange: GeneratedAssetStatusReporter
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  retryGeneration: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  weapon: ZombieEscapeWeaponSpecification
  weaponIndex: number
}) {
  const rootRef = useRef<Group>(null)
  const markerRef = useRef<Group>(null)
  useZombieEscapeRenderRepresentative(
    weaponIndex === 0 ? renderReadinessRegistry : undefined,
    ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY,
    markerRef,
  )

  useFrame((_, delta) => {
    const marker = markerRef.current
    if (!marker) return
    const simulation = simulationRef.current
    const pickupIndex = simulation.weaponPickupIndexByWeaponIndex[weaponIndex] ?? -1
    const pickup = pickupIndex >= 0 ? simulation.weaponPickups[pickupIndex] : undefined
    marker.visible = Boolean(pickup) && isZombieEscapeWeaponPickupAvailable(simulation, weaponIndex)
    if (!(pickup && marker.visible)) return

    const nearbyPickup = simulation.weaponPickups[simulation.nearbyPickupIndex]
    const selected = nearbyPickup?.weaponIndex === weaponIndex
    marker.position.set(pickup.x, pickup.y + 0.04, pickup.z)
    marker.scale.setScalar(selected ? 1.18 : 1)
    if (rootRef.current) rootRef.current.rotation.y += Math.min(0.05, delta) * 0.7
  }, -18)

  return (
    <group ref={markerRef} visible={false}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.62, 0.76, 0.22, 16]} />
        <meshStandardMaterial color="#1d5261" metalness={0.24} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.64, 24]} />
        <meshBasicMaterial color="#7ef7ff" toneMapped={false} />
      </mesh>
      <group position={[0, 0.62, 0]} ref={rootRef} rotation={[0.12, 0, 0]} scale={1.65}>
        <GeneratedWeaponModel
          assetKey={`weapon:${weapon.assetPath}`}
          onAssetStatusChange={onAssetStatusChange}
          retryGeneration={retryGeneration}
          weapon={weapon}
        />
      </group>
    </group>
  )
}

export const GeneratedWeaponModel = memo(function GeneratedWeaponModel({
  weapon,
  assetKey = `weapon:${weapon.assetPath}`,
  onAssetStatusChange,
  renderReadinessRegistry,
  renderRepresentativeKey,
  retryGeneration = 0,
}: {
  assetKey?: string
  onAssetStatusChange?: GeneratedAssetStatusReporter
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  renderRepresentativeKey?: string
  retryGeneration?: number
  weapon: ZombieEscapeWeaponSpecification
}) {
  return (
    <GeneratedAssetErrorBoundary
      assetKey={assetKey}
      key={`${assetKey}:${retryGeneration}`}
      onAssetStatusChange={onAssetStatusChange}
    >
      <Suspense fallback={null}>
        <LoadedGeneratedWeaponModel
          assetKey={assetKey}
          onAssetStatusChange={onAssetStatusChange}
          renderReadinessRegistry={renderReadinessRegistry}
          renderRepresentativeKey={renderRepresentativeKey}
          weapon={weapon}
        />
      </Suspense>
    </GeneratedAssetErrorBoundary>
  )
})

function LoadedGeneratedWeaponModel({
  assetKey,
  onAssetStatusChange,
  renderReadinessRegistry,
  renderRepresentativeKey,
  weapon,
}: {
  assetKey: string
  onAssetStatusChange?: GeneratedAssetStatusReporter
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  renderRepresentativeKey?: string
  weapon: ZombieEscapeWeaponSpecification
}) {
  const gltf = useGLTF(weapon.assetPath)
  const rootRef = useRef<Group>(null)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const transform = useMemo(() => computeWeaponTransform(gltf.scene, weapon), [gltf.scene, weapon])
  useZombieEscapeRenderRepresentative(
    renderRepresentativeKey ? renderReadinessRegistry : undefined,
    renderRepresentativeKey ?? `unregistered-weapon:${weapon.id}`,
    rootRef,
  )

  useEffect(() => {
    model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = false
      mesh.receiveShadow = false
    })
    onAssetStatusChange?.(assetKey, { state: 'ready' })
    return () => onAssetStatusChange?.(assetKey, null)
  }, [assetKey, model, onAssetStatusChange])

  return (
    <group ref={rootRef} rotation={transform.rotation} scale={transform.scale}>
      <primitive object={model} position={transform.offset} />
    </group>
  )
}

const ZombieEscapeGeneratedZombies = memo(function ZombieEscapeGeneratedZombies({
  authoredZombieSelections,
  detailedZombies,
  detailedZombieSlotsRef,
  externallyPresentedZombieSlotsRef,
  impactVisualRegistry,
  loadedZombieVariantsRef,
  onAssetStatusChange,
  presentationLodDebugRef,
  renderReadinessRegistry,
  retryGeneration,
  simulationRef,
  zombieShader,
  zombiePresentationFramePriority,
}: {
  authoredZombieSelections: ZombieEscapeAuthoredVariantSlotBuckets
  detailedZombies: boolean
  detailedZombieSlotsRef: MutableRefObject<Uint8Array>
  externallyPresentedZombieSlotsRef: MutableRefObject<Uint8Array>
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  onAssetStatusChange: GeneratedAssetStatusReporter
  presentationLodDebugRef: MutableRefObject<ZombieEscapePresentationLodDebugSnapshot | null>
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  retryGeneration: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  zombieShader: ZombieEscapeZombieShader
  zombiePresentationFramePriority?: number
}) {
  const prewarmCoordinatorRef = useRef<ZombieVisualPrewarmCoordinator>({
    claimed: false,
    frameToken: Number.NaN,
  })
  const admissionFrameRef = useRef<{ generation: number; id: number } | null>(null)
  const settledVariantsRef = useRef({
    generation: retryGeneration,
    indices: new Set<number>(),
  })
  const [admission, setAdmission] = useState({ count: 0, generation: retryGeneration })
  if (settledVariantsRef.current.generation !== retryGeneration) {
    settledVariantsRef.current = { generation: retryGeneration, indices: new Set() }
  }
  const admittedVariantCount = admission.generation === retryGeneration ? admission.count : 0
  const scheduleNextVariantAdmission = useCallback(() => {
    if (admissionFrameRef.current !== null) return
    const generation = retryGeneration
    const id = window.requestAnimationFrame(() => {
      if (admissionFrameRef.current?.generation === generation) {
        admissionFrameRef.current = null
      }
      setAdmission((current) => {
        const currentCount = current.generation === generation ? current.count : 0
        const settled =
          settledVariantsRef.current.generation === generation
            ? settledVariantsRef.current.indices
            : new Set<number>()
        const nextCount = resolveZombieEscapeGeneratedVariantAdmissionCount(currentCount, settled)
        return current.generation === generation && current.count === nextCount
          ? current
          : { count: nextCount, generation }
      })
    })
    admissionFrameRef.current = { generation, id }
  }, [retryGeneration])
  const handleVariantPresentationSettled = useCallback(
    (variantIndex: number) => {
      if (settledVariantsRef.current.generation !== retryGeneration) return
      settledVariantsRef.current.indices.add(variantIndex)
      scheduleNextVariantAdmission()
    },
    [retryGeneration, scheduleNextVariantAdmission],
  )
  useEffect(() => {
    const settled = settledVariantsRef.current.indices
    if (
      admittedVariantCount === 0 ||
      (admittedVariantCount < ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length &&
        settled.has(admittedVariantCount - 1))
    ) {
      scheduleNextVariantAdmission()
    }
  }, [admittedVariantCount, scheduleNextVariantAdmission])
  useEffect(
    () => () => {
      if (admissionFrameRef.current?.generation === retryGeneration) {
        window.cancelAnimationFrame(admissionFrameRef.current.id)
        admissionFrameRef.current = null
      }
    },
    [retryGeneration],
  )
  return (
    <group
      userData={{
        generatedZombieVariantCapacity: ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
        loading: 'before-first-spawn',
      }}
    >
      {ZOMBIE_VARIANT_INDICES.slice(0, admittedVariantCount).map((variantIndex) => {
        const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variantIndex]
        if (!zombie) return null
        return (
          <GeneratedAssetErrorBoundary
            assetKey={`zombie:${zombie.id}`}
            key={`${zombie.id}:${retryGeneration}`}
            onAssetStatusChange={onAssetStatusChange}
            onTerminal={() => handleVariantPresentationSettled(variantIndex)}
          >
            <Suspense fallback={null}>
              <GeneratedZombieVariant
                authoredSelection={authoredZombieSelections[variantIndex]!}
                detailedZombies={detailedZombies}
                detailedZombieSlotsRef={detailedZombieSlotsRef}
                externallyPresentedZombieSlotsRef={externallyPresentedZombieSlotsRef}
                framePriority={zombiePresentationFramePriority ?? -17}
                impactVisualRegistry={impactVisualRegistry}
                loadedZombieVariantsRef={loadedZombieVariantsRef}
                onAssetStatusChange={onAssetStatusChange}
                onPresentationSettled={handleVariantPresentationSettled}
                presentationLodDebugRef={presentationLodDebugRef}
                prewarmCoordinatorRef={prewarmCoordinatorRef}
                renderReadinessRegistry={renderReadinessRegistry}
                simulationRef={simulationRef}
                variantIndex={variantIndex}
                zombie={zombie}
                zombieShader={zombieShader}
              />
            </Suspense>
          </GeneratedAssetErrorBoundary>
        )
      })}
    </group>
  )
})

const GeneratedZombieVariant = memo(function GeneratedZombieVariant({
  authoredSelection,
  detailedZombies,
  detailedZombieSlotsRef,
  externallyPresentedZombieSlotsRef,
  framePriority,
  impactVisualRegistry,
  loadedZombieVariantsRef,
  onAssetStatusChange,
  onPresentationSettled,
  presentationLodDebugRef,
  prewarmCoordinatorRef,
  renderReadinessRegistry,
  simulationRef,
  variantIndex,
  zombie,
  zombieShader,
}: {
  authoredSelection: ZombieEscapeAuthoredInstanceSelection
  detailedZombies: boolean
  detailedZombieSlotsRef: MutableRefObject<Uint8Array>
  externallyPresentedZombieSlotsRef: MutableRefObject<Uint8Array>
  framePriority: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  onAssetStatusChange: GeneratedAssetStatusReporter
  onPresentationSettled: (variantIndex: number) => void
  presentationLodDebugRef: MutableRefObject<ZombieEscapePresentationLodDebugSnapshot | null>
  prewarmCoordinatorRef: MutableRefObject<ZombieVisualPrewarmCoordinator>
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  variantIndex: number
  zombie: ZombieEscapeZombieCatalogEntry
  zombieShader: ZombieEscapeZombieShader
}) {
  const riggedGltf = useGLTFKTX2(zombie.glb.riggedBase.path)
  const runGltf = useGLTF(zombie.glb.run.path)
  const walkGltf = useGLTF(zombie.glb.walk.path)
  return (
    <PreparedGeneratedZombieVariant
      authoredSelection={authoredSelection}
      detailedZombies={detailedZombies}
      detailedZombieSlotsRef={detailedZombieSlotsRef}
      externallyPresentedZombieSlotsRef={externallyPresentedZombieSlotsRef}
      framePriority={framePriority}
      impactVisualRegistry={impactVisualRegistry}
      loadedZombieVariantsRef={loadedZombieVariantsRef}
      onAssetStatusChange={onAssetStatusChange}
      onPresentationSettled={onPresentationSettled}
      presentationLodDebugRef={presentationLodDebugRef}
      prewarmCoordinatorRef={prewarmCoordinatorRef}
      renderReadinessRegistry={renderReadinessRegistry}
      riggedScene={riggedGltf.scene}
      runAnimations={runGltf.animations}
      simulationRef={simulationRef}
      variantIndex={variantIndex}
      walkAnimations={walkGltf.animations}
      zombie={zombie}
      zombieShader={zombieShader}
    />
  )
})

function PreparedGeneratedZombieVariant({
  authoredSelection,
  detailedZombies,
  detailedZombieSlotsRef,
  externallyPresentedZombieSlotsRef,
  framePriority,
  impactVisualRegistry,
  loadedZombieVariantsRef,
  onAssetStatusChange,
  onPresentationSettled,
  presentationLodDebugRef,
  prewarmCoordinatorRef,
  renderReadinessRegistry,
  riggedScene,
  runAnimations,
  simulationRef,
  variantIndex,
  walkAnimations,
  zombie,
  zombieShader,
}: {
  authoredSelection: ZombieEscapeAuthoredInstanceSelection
  detailedZombies: boolean
  detailedZombieSlotsRef: MutableRefObject<Uint8Array>
  externallyPresentedZombieSlotsRef: MutableRefObject<Uint8Array>
  framePriority: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  onAssetStatusChange: GeneratedAssetStatusReporter
  onPresentationSettled: (variantIndex: number) => void
  presentationLodDebugRef: MutableRefObject<ZombieEscapePresentationLodDebugSnapshot | null>
  prewarmCoordinatorRef: MutableRefObject<ZombieVisualPrewarmCoordinator>
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  riggedScene: Group
  runAnimations: readonly AnimationClip[]
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  variantIndex: number
  walkAnimations: readonly AnimationClip[]
  zombie: ZombieEscapeZombieCatalogEntry
  zombieShader: ZombieEscapeZombieShader
}) {
  const groupRef = useRef<Group>(null)
  const visualsRef = useRef(new Map<number, GeneratedZombieVisual>())
  const pooledVisualsRef = useRef<GeneratedZombieVisual[]>([])
  const prewarmReadyRef = useRef(false)
  const visualCreationFailedRef = useRef(false)
  const unregisterRenderRepresentativeRef = useRef<(() => void) | null>(null)
  const assetKey = `zombie:${zombie.id}`
  const targetPoolSize = useMemo(
    () =>
      detailedZombies
        ? resolveZombieEscapeDetailedRootPoolSize(
            simulationRef.current.variantByPoolSlot,
            variantIndex,
          )
        : 0,
    [detailedZombies, simulationRef, variantIndex],
  )
  const presentationPose = useMemo(() => createZombieEscapePresentationPose(), [])
  const modelTransform = useMemo(
    () => computeZombieTransform(riggedScene, zombie.characterHeightMeters),
    [riggedScene, zombie.characterHeightMeters],
  )
  const runClip = useMemo(
    () => runAnimations.find((clip) => clip.name === zombie.glb.run.expectedClipName) ?? null,
    [runAnimations, zombie.glb.run.expectedClipName],
  )
  const walkClip = useMemo(
    () => walkAnimations.find((clip) => clip.name === zombie.glb.walk.expectedClipName) ?? null,
    [walkAnimations, zombie.glb.walk.expectedClipName],
  )
  const attackClip = useMemo(
    () => createZombieEscapeAttackClip(riggedScene, walkClip),
    [riggedScene, walkClip],
  )
  const deathClip = useMemo(() => createZombieEscapeDeathClip(riggedScene), [riggedScene])
  const authoredInstanceCapacity = useMemo(
    () =>
      countZombieEscapeAuthoredVariantCapacity(
        simulationRef.current.variantByPoolSlot,
        variantIndex,
      ),
    [simulationRef, variantIndex],
  )
  const [authoredPresentation, setAuthoredPresentation] =
    useState<ZombieEscapeAuthoredInstancePresentation | null>(null)
  useEffect(() => {
    const abortController = new AbortController()
    let active = true
    setAuthoredPresentation(null)
    visualCreationFailedRef.current = false
    void createZombieEscapeAuthoredInstancePresentationCooperatively({
      attackClip,
      deathClip,
      instanceCapacity: authoredInstanceCapacity,
      modelTransform,
      runClip,
      signal: abortController.signal,
      source: riggedScene,
      variantIndex,
      waitForBuildSlice: yieldZombieEscapeAuthoredBuildSlice,
      walkClip,
      zombieShader,
    })
      .then((presentation) => {
        if (!active) {
          presentation.dispose()
          return
        }
        setAuthoredPresentation(presentation)
      })
      .catch((error: unknown) => {
        if (!active || abortController.signal.aborted) return
        visualCreationFailedRef.current = true
        loadedZombieVariantsRef.current.delete(variantIndex)
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[zombie-escape] Failed to prepare generated asset ${assetKey}.`, message)
        onAssetStatusChange(assetKey, { message, state: 'failed' })
        onPresentationSettled(variantIndex)
      })
    return () => {
      active = false
      abortController.abort()
    }
  }, [
    assetKey,
    authoredInstanceCapacity,
    attackClip,
    deathClip,
    loadedZombieVariantsRef,
    modelTransform,
    onAssetStatusChange,
    onPresentationSettled,
    riggedScene,
    runClip,
    variantIndex,
    walkClip,
    zombieShader,
  ])
  useGpuResourceLifetime(authoredPresentation)

  useEffect(() => {
    if (authoredPresentation) onPresentationSettled(variantIndex)
  }, [authoredPresentation, onPresentationSettled, variantIndex])

  useEffect(() => {
    visualCreationFailedRef.current = false
    return () => {
      loadedZombieVariantsRef.current.delete(variantIndex)
      prewarmReadyRef.current = false
      unregisterRenderRepresentativeRef.current?.()
      unregisterRenderRepresentativeRef.current = null
      onAssetStatusChange(assetKey, null)
      for (const visual of visualsRef.current.values())
        disposeZombieVisual(visual, groupRef.current)
      for (const visual of pooledVisualsRef.current) disposeZombieVisual(visual, groupRef.current)
      visualsRef.current.clear()
      pooledVisualsRef.current.length = 0
      if (presentationLodDebugRef.current) {
        updateZombieEscapePresentationLodDebugAuthoredVariant(
          presentationLodDebugRef.current,
          variantIndex,
          0,
          0,
        )
        updateZombieEscapePresentationLodDebugVariant(
          presentationLodDebugRef.current,
          variantIndex,
          0,
          0,
        )
      }
    }
  }, [
    assetKey,
    loadedZombieVariantsRef,
    onAssetStatusChange,
    presentationLodDebugRef,
    variantIndex,
  ])

  useFrame((state, delta) => {
    const group = groupRef.current
    const presentation = authoredPresentation
    if (!group || !presentation || visualCreationFailedRef.current) return
    const frameUpdate = tryCreateZombieEscapeGeneratedAsset(() => {
      const simulation = simulationRef.current
      const zombies = simulation.zombies
      const visuals = visualsRef.current
      presentation.update(authoredSelection, zombies)
      const presentationLodDebug = presentationLodDebugRef.current
      if (presentationLodDebug) {
        const authoredDebug = presentation.getDebugSnapshot()
        updateZombieEscapePresentationLodDebugAuthoredVariant(
          presentationLodDebug,
          variantIndex,
          authoredDebug.activeCount,
          authoredDebug.batchCount,
        )
      }
      registerZombieRenderRepresentative(
        group,
        unregisterRenderRepresentativeRef,
        renderReadinessRegistry,
        zombie.id,
      )

      if (!prewarmReadyRef.current) {
        const visualCount = visuals.size + pooledVisualsRef.current.length
        if (visualCount >= targetPoolSize && presentation.getReadinessSnapshot().ready) {
          prewarmReadyRef.current = true
          loadedZombieVariantsRef.current.add(variantIndex)
          onAssetStatusChange(assetKey, { state: 'ready' })
        } else if (
          claimZombieVisualPrewarmFrame(prewarmCoordinatorRef.current, state.clock.elapsedTime)
        ) {
          const visual = createZombieVisual({
            active: false,
            attackClip,
            deathClip,
            group,
            generation: 0,
            impactVisualRegistry,
            modelTransform,
            runClip,
            source: riggedScene,
            slot: null,
            walkClip,
            zombieShader,
            zombieShaderSeed: variantIndex,
          })
          pooledVisualsRef.current.push(visual)
          if (visualCount + 1 >= targetPoolSize && presentation.getReadinessSnapshot().ready) {
            prewarmReadyRef.current = true
            loadedZombieVariantsRef.current.add(variantIndex)
            onAssetStatusChange(assetKey, { state: 'ready' })
          }
        }
      }

      for (const [slot, visual] of visuals) {
        if (
          zombies.pool.active[slot] !== 0 &&
          zombies.pool.generation[slot] === visual.generation &&
          zombies.variant[slot] === variantIndex &&
          detailedZombieSlotsRef.current[slot] !== 0 &&
          externallyPresentedZombieSlotsRef.current[slot] === 0
        ) {
          continue
        }
        parkZombieVisual(visual)
        pooledVisualsRef.current.push(visual)
        visuals.delete(slot)
      }

      for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
        if (
          zombies.pool.active[slot] === 0 ||
          zombies.variant[slot] !== variantIndex ||
          detailedZombieSlotsRef.current[slot] === 0 ||
          externallyPresentedZombieSlotsRef.current[slot] !== 0
        ) {
          continue
        }
        let visual = visuals.get(slot)
        if (!visual) {
          const generation = zombies.pool.generation[slot] ?? 0
          visual = pooledVisualsRef.current.pop()
          if (visual) {
            visuals.set(slot, visual)
            activateZombieVisual(visual, impactVisualRegistry, slot, generation)
          } else {
            throw new Error(
              `Detailed zombie root pool exhausted for variant ${zombie.id}; cap=${targetPoolSize}.`,
            )
          }
          visuals.set(slot, visual)
        }
        resolveZombieEscapePresentationPose(
          zombies.x[slot] ?? 0,
          zombies.y[slot] ?? 0,
          zombies.z[slot] ?? 0,
          zombies.heading[slot] ?? 0,
          zombies.hitReaction[slot] ?? 0,
          zombies.hitImpulseX[slot] ?? 0,
          zombies.hitImpulseY[slot] ?? 0,
          zombies.hitImpulseZ[slot] ?? 0,
          presentationPose,
          modelTransform.bodyCenterY,
          zombies.health[slot]! <= 0
            ? resolveZombieEscapeDeathNormalizedPhase(zombies.deathPresentationSeconds[slot] ?? 0)
            : 0,
          zombies.spawnOrdinal[slot] ?? 0,
        )
        visual.root.position.set(presentationPose.x, presentationPose.y, presentationPose.z)
        visual.root.quaternion.set(
          presentationPose.quaternionX,
          presentationPose.quaternionY,
          presentationPose.quaternionZ,
          presentationPose.quaternionW,
        )
        const hitPhase = resolveZombieEscapeHitFlickerPhase(zombies.hitFlash[slot] ?? 0)
        for (const materialState of visual.hitMaterials) {
          if (hitPhase === 'none') {
            if (materialState.baseColor && materialState.material.color) {
              materialState.material.color.copy(materialState.baseColor)
            }
            materialState.material.emissive.copy(materialState.baseEmissive)
            materialState.material.emissiveIntensity = materialState.baseEmissiveIntensity
            continue
          }
          const hitColor = hitPhase === 'red' ? ZOMBIE_HIT_RED : ZOMBIE_HIT_BLACK
          materialState.material.color?.copy(hitColor)
          materialState.material.emissive.copy(hitColor)
          materialState.material.emissiveIntensity = hitPhase === 'red' ? 3.6 : 0
        }
        updateZombieVisualLocomotion({
          attackCooldown: zombies.attackCooldown[slot] ?? 0,
          attackIntent: zombies.intent[slot] ?? 0,
          deathPresentationSeconds: zombies.deathPresentationSeconds[slot] ?? 0,
          delta,
          health: zombies.health[slot] ?? 0,
          horizontalSpeed: Math.hypot(zombies.vx[slot] ?? 0, zombies.vz[slot] ?? 0),
          paused: simulation.paused,
          runBlend: zombies.runBlend[slot] ?? 0,
          runMetersPerSecond: zombie.movement.runMetersPerSecond,
          visual,
          walkMetersPerSecond: zombie.movement.walkMetersPerSecond,
        })
      }
      reportGeneratedZombieVariantPresentationMetrics(
        presentationLodDebugRef,
        variantIndex,
        visuals,
        pooledVisualsRef.current,
      )
    })
    if (!frameUpdate.ok) {
      visualCreationFailedRef.current = true
      loadedZombieVariantsRef.current.delete(variantIndex)
      for (const visual of visualsRef.current.values()) {
        parkZombieVisual(visual)
        pooledVisualsRef.current.push(visual)
      }
      visualsRef.current.clear()
      console.error(
        `[zombie-escape] Failed to update generated asset ${assetKey}.`,
        frameUpdate.message,
      )
      onAssetStatusChange(assetKey, { message: frameUpdate.message, state: 'failed' })
      reportGeneratedZombieVariantPresentationMetrics(
        presentationLodDebugRef,
        variantIndex,
        visualsRef.current,
        pooledVisualsRef.current,
      )
      if (presentationLodDebugRef.current) {
        updateZombieEscapePresentationLodDebugAuthoredVariant(
          presentationLodDebugRef.current,
          variantIndex,
          0,
          0,
        )
      }
    }
  }, framePriority)

  return (
    <group ref={groupRef} userData={{ zombieAssetId: zombie.id }}>
      {authoredPresentation ? <primitive object={authoredPresentation.root} /> : null}
    </group>
  )
}

function reportGeneratedZombieVariantPresentationMetrics(
  presentationLodDebugRef: MutableRefObject<ZombieEscapePresentationLodDebugSnapshot | null>,
  variantIndex: number,
  activeVisuals: ReadonlyMap<number, GeneratedZombieVisual>,
  pooledVisuals: readonly GeneratedZombieVisual[],
) {
  const snapshot = presentationLodDebugRef.current
  if (!snapshot) return
  updateZombieEscapePresentationLodDebugVariant(
    snapshot,
    variantIndex,
    activeVisuals.size + pooledVisuals.length,
    activeVisuals.size,
  )
}

export function createZombieVisual({
  active,
  attackClip,
  deathClip = null,
  group,
  generation,
  impactVisualRegistry,
  modelTransform,
  runClip,
  source,
  slot,
  walkClip,
  zombieShader,
  zombieShaderSeed,
}: {
  active: boolean
  attackClip: AnimationClip | null
  deathClip?: AnimationClip | null
  group: Group
  generation: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  modelTransform: { bodyCenterY?: number; offset: Vector3; scale: number }
  runClip: AnimationClip | null
  source: Group
  slot: number | null
  walkClip: AnimationClip | null
  zombieShader: ZombieEscapeZombieShader
  zombieShaderSeed: number
}) {
  const hitMaterials: GeneratedZombieVisual['hitMaterials'] = []
  const ownedMaterials: Material[] = []
  let visualRoot: Group | null = null
  let root: Group | null = null
  let mixer: AnimationMixer | null = null
  let unregisterImpactVisual: () => void = () => undefined
  try {
    visualRoot = cloneSkeleton(source) as Group
    visualRoot.position.copy(modelTransform.offset)
    visualRoot.scale.setScalar(modelTransform.scale)
    visualRoot.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const clonedMaterials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
        (sourceMaterial) => {
          const material = zombieShader.createMaterial(
            sourceMaterial,
            mesh.geometry,
            zombieShaderSeed,
          )
          ownedMaterials.push(material)
          const flashable = material as Material & {
            color?: Color
            emissive?: Color
            emissiveIntensity?: number
          }
          if (flashable.emissive instanceof Color) {
            hitMaterials.push({
              baseColor: flashable.color instanceof Color ? flashable.color.clone() : null,
              baseEmissive: flashable.emissive.clone(),
              baseEmissiveIntensity: flashable.emissiveIntensity ?? 1,
              material: flashable as Material & {
                color?: Color
                emissive: Color
                emissiveIntensity: number
              },
            })
          }
          return material
        },
      )
      mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]!
      mesh.castShadow = false
      mesh.frustumCulled = false
      mesh.receiveShadow = false
    })
    root = new Group()
    root.add(visualRoot)
    root.visible = active
    mixer = new AnimationMixer(visualRoot)
    const walkAction = walkClip ? mixer.clipAction(walkClip, visualRoot) : null
    const runAction = runClip ? mixer.clipAction(runClip, visualRoot) : null
    const attackAction = attackClip ? mixer.clipAction(attackClip, visualRoot) : null
    const deathAction = deathClip ? mixer.clipAction(deathClip, visualRoot) : null
    for (const action of [attackAction, walkAction, runAction]) {
      action?.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
    }
    deathAction?.setLoop(LoopOnce, 1)
    if (deathAction) deathAction.clampWhenFinished = true
    attackAction?.play()
    deathAction?.play()
    walkAction?.play()
    runAction?.play()
    if (!active) {
      // Resolve lazy property bindings inside the bounded loading slice, then restore the pose.
      mixer.update(0)
      mixer.stopAllAction()
    }
    unregisterImpactVisual =
      active && slot !== null
        ? registerZombieEscapeImpactVisual(impactVisualRegistry, slot, generation, visualRoot)
        : () => undefined
    const visual = {
      animationRoot: visualRoot,
      attackAction,
      deathAction,
      generation,
      hitMaterials,
      mixer,
      ownedMaterials,
      root,
      runAction,
      unregisterImpactVisual,
      walkAction,
    }
    group.add(root)
    return visual
  } catch (error) {
    cleanupFailedZombieVisualConstruction({
      group,
      mixer,
      ownedMaterials,
      root,
      unregisterImpactVisual,
      visualRoot,
    })
    throw error
  }
}

export function updateZombieVisualLocomotion({
  attackCooldown,
  attackIntent,
  deathPresentationSeconds = 0,
  delta,
  health = 1,
  horizontalSpeed,
  paused,
  runBlend,
  runMetersPerSecond,
  visual,
  walkMetersPerSecond,
}: {
  attackCooldown: number
  attackIntent: number
  deathPresentationSeconds?: number
  delta: number
  health?: number
  horizontalSpeed: number
  paused: boolean
  runBlend: number
  runMetersPerSecond: number
  visual: GeneratedZombieVisual
  walkMetersPerSecond: number
}) {
  const deathActive = health <= 0
  const attackIntentActive = isZombieEscapeAttackPresentationActive(attackIntent)
  const attackActive = !deathActive && attackIntentActive
  const deathProgress = deathActive
    ? resolveZombieEscapeDeathNormalizedPhase(deathPresentationSeconds)
    : 0
  const deathBlendProgress = Math.min(1, deathProgress / 0.24)
  const deathWeight = deathBlendProgress * deathBlendProgress * (3 - 2 * deathBlendProgress)
  const sourceWeight = 1 - deathWeight
  const locomotionWeight = attackIntentActive
    ? 0
    : resolveZombieEscapeLocomotionWeight(horizontalSpeed) * sourceWeight
  const playbackRate = resolveZombieEscapeLocomotionPlaybackRate(
    horizontalSpeed,
    walkMetersPerSecond,
    runMetersPerSecond,
    runBlend,
  )
  visual.walkAction?.setEffectiveWeight((1 - runBlend) * locomotionWeight)
  visual.walkAction?.setEffectiveTimeScale(playbackRate)
  visual.runAction?.setEffectiveWeight(runBlend * locomotionWeight)
  visual.runAction?.setEffectiveTimeScale(playbackRate)
  visual.attackAction?.setEffectiveWeight(
    attackActive || (deathActive && attackIntentActive) ? sourceWeight : 0,
  )
  visual.attackAction?.setEffectiveTimeScale(0)
  if ((attackActive || (deathActive && attackIntentActive)) && visual.attackAction) {
    visual.attackAction.time =
      resolveZombieEscapeAttackNormalizedPhase(attackCooldown) *
      visual.attackAction.getClip().duration
  }
  visual.deathAction?.setEffectiveWeight(deathActive ? deathWeight : 0)
  visual.deathAction?.setEffectiveTimeScale(0)
  if (deathActive && visual.deathAction) {
    visual.deathAction.time = deathProgress * visual.deathAction.getClip().duration
  }
  if (!visual.mixer) throw new Error('Active detailed zombie has no animation mixer.')
  visual.mixer.update(paused ? 0 : Math.min(0.05, Math.max(0, delta)))
}

function registerZombieRenderRepresentative(
  root: Group,
  unregisterRef: MutableRefObject<(() => void) | null>,
  registry: ZombieEscapeRenderReadinessRegistry | undefined,
  zombieId: string,
) {
  if (!(registry && !unregisterRef.current)) return
  unregisterRef.current = registry.register(
    createZombieEscapeZombieRenderRepresentativeKey(zombieId),
    root,
  )
}

function cleanupFailedZombieVisualConstruction({
  group,
  mixer,
  ownedMaterials,
  root,
  unregisterImpactVisual,
  visualRoot,
}: {
  group: Group
  mixer: AnimationMixer | null
  ownedMaterials: readonly Material[]
  root: Group | null
  unregisterImpactVisual: () => void
  visualRoot: Group | null
}) {
  try {
    unregisterImpactVisual()
  } catch {}
  try {
    mixer?.stopAllAction()
    if (visualRoot) mixer?.uncacheRoot(visualRoot)
  } catch {}
  if (root) group.remove(root)
  for (const material of ownedMaterials) {
    try {
      material.dispose()
    } catch {}
  }
}

export function activateZombieVisual(
  visual: GeneratedZombieVisual,
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry,
  slot: number,
  generation: number,
) {
  if (!visual.mixer) throw new Error('Detailed zombie animation bindings were not prepared.')
  visual.generation = generation
  visual.unregisterImpactVisual = registerZombieEscapeImpactVisual(
    impactVisualRegistry,
    slot,
    generation,
    visual.animationRoot,
  )
  visual.attackAction?.reset().play()
  visual.deathAction?.reset().play()
  visual.walkAction?.reset().play()
  visual.runAction?.reset().play()
  visual.root.visible = true
}

export function parkZombieVisual(visual: GeneratedZombieVisual) {
  visual.unregisterImpactVisual()
  visual.unregisterImpactVisual = () => undefined
  visual.attackAction?.stop()
  visual.deathAction?.stop()
  visual.walkAction?.stop()
  visual.runAction?.stop()
  visual.root.visible = false
}

function disposeZombieVisual(visual: GeneratedZombieVisual, group: Group | null) {
  try {
    visual.unregisterImpactVisual()
  } catch {}
  try {
    visual.mixer?.stopAllAction()
  } catch {}
  try {
    visual.mixer?.uncacheRoot(visual.animationRoot)
  } catch {}
  for (const material of visual.ownedMaterials) {
    try {
      material.dispose()
    } catch {}
  }
  group?.remove(visual.root)
}

function claimZombieVisualPrewarmFrame(
  coordinator: ZombieVisualPrewarmCoordinator,
  frameToken: number,
) {
  if (coordinator.frameToken !== frameToken) {
    coordinator.frameToken = frameToken
    coordinator.claimed = false
  }
  if (coordinator.claimed) return false
  coordinator.claimed = true
  return true
}

class GeneratedAssetErrorBoundary extends Component<
  {
    assetKey: string
    children: ReactNode
    onAssetStatusChange?: GeneratedAssetStatusReporter
    onTerminal?: () => void
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[zombie-escape] Failed to load generated asset ${this.props.assetKey}.`, error)
    this.props.onAssetStatusChange?.(this.props.assetKey, { message, state: 'failed' })
    this.props.onTerminal?.()
  }

  componentWillUnmount() {
    this.props.onAssetStatusChange?.(this.props.assetKey, null)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function computeWeaponTransform(source: Group, weapon: ZombieEscapeWeaponSpecification) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  if (size.x >= size.y && size.x >= size.z) {
    return {
      offset: center.multiplyScalar(-1),
      rotation: new Euler(0, Math.PI / 2, 0),
      scale: weapon.canonicalDimensionsMeters.lengthZ / Math.max(0.000_1, size.x),
    }
  }
  if (size.y >= size.z) {
    return {
      offset: center.multiplyScalar(-1),
      rotation: new Euler(Math.PI / 2, 0, 0),
      scale: weapon.canonicalDimensionsMeters.lengthZ / Math.max(0.000_1, size.y),
    }
  }
  return {
    offset: center.multiplyScalar(-1),
    rotation: new Euler(),
    scale: weapon.canonicalDimensionsMeters.lengthZ / Math.max(0.000_1, size.z),
  }
}

function computeZombieTransform(source: Group, characterHeightMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = characterHeightMeters / Math.max(0.000_1, size.y)
  return {
    bodyCenterY: (center.y - bounds.min.y) * scale,
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
  }
}
