'use client'

import type { PascalWaterLandSurface } from '@landrush/pascal-plugin'
import { renderScheduler } from '@landrush/runtime'
import { type AnyNode, useInteractive, useScene } from '@pascal-app/core'
import { useGLTFKTX2, useGpuResourceLifetime } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  Component,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type AnimationAction,
  AnimationMixer,
  Box3,
  DynamicDrawUsage,
  type Group,
  type InstancedMesh,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  type Mesh,
  Quaternion,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import {
  createLandrushIslandAiNavigationSnapshot,
  createLandrushIslandRuntimeDoorPassabilityKey,
  resolveLandrushIslandRuntimeDoorPassabilityKey,
} from './landrush-island-ai-navigation-semantics'
import {
  LANDRUSH_ISLAND_AMBIENT_BOATS,
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_FISH,
  LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_NPCS,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
  type LandrushIslandAmbientBoat,
  type LandrushIslandAmbientFish,
  type LandrushIslandAmbientNpc,
} from './landrush-island-ambient-catalog'
import { createLandrushIslandAmbientCloneSkeletonResource } from './landrush-island-ambient-clone-lifecycle'
import {
  parseLandrushIslandAmbientMotionDebugSettings,
  resolveAdmittedLandrushIslandAmbientNavigationObstacles,
} from './landrush-island-ambient-lifecycle'
import {
  advanceLandrushIslandAmbientLoadQueueAfterYield,
  createLandrushIslandAmbientLoadQueueStateForMount,
  createLandrushIslandAmbientLoadUnits,
  createLandrushIslandAmbientLoadUnitWatchdog,
  type LandrushIslandAmbientLoadReadiness,
  type LandrushIslandAmbientLoadSettlement,
  type LandrushIslandAmbientLoadUnit,
  type LandrushIslandAmbientLoadUnitWatchdog,
  resolveLandrushIslandAmbientLoadReadiness,
  resolveMountedLandrushIslandAmbientLoadUnits,
  scheduleLandrushIslandAmbientLoadAdmissionYield,
  settleLandrushIslandAmbientLoadQueue,
} from './landrush-island-ambient-load-queue'
import {
  createLandrushIslandAmbientNavigationWorld,
  distanceToLandrushIslandAmbientObstacles,
  isLandrushIslandAmbientPointOnRoad,
  type LandrushIslandAmbientNavigationObstacle,
  type LandrushIslandAmbientNavigationWorld,
} from './landrush-island-ambient-navigation'
import { createLandrushIslandAmbientSemanticNavigationObstacles } from './landrush-island-ambient-navigation-semantics'
import {
  advanceLandrushIslandAmbientNpcMotion,
  createLandrushIslandAmbientNpcJourneyPlanner,
  createLandrushIslandAmbientNpcMotionState,
  createLandrushIslandAmbientNpcNeighborIndex,
  LANDRUSH_ISLAND_AMBIENT_NPC_PLANNING_OPERATIONS_PER_FRAME,
  type LandrushIslandAmbientNpcJourneyPlanner,
  type LandrushIslandAmbientNpcMotionState,
  type LandrushIslandAmbientNpcNeighborIndex,
  type LandrushIslandAmbientNpcNeighborQuery,
  reconcileLandrushIslandAmbientNpcMotionStateForWorld,
} from './landrush-island-ambient-npc-motion'
import {
  createLandrushIslandFishLanes,
  createLandrushIslandFishMotionSample,
  createLandrushIslandFishMotionScratch,
  createLandrushIslandFishTrajectory,
  type LandrushIslandFishMotionSample,
  type LandrushIslandFishTrajectory,
  measureLandrushIslandFishShoreDistance,
  sampleLandrushIslandFishMotionInto,
} from './landrush-island-fish-motion'
import {
  createLandrushIslandFishRuntime,
  type LandrushIslandFishRuntime,
} from './landrush-island-fish-runtime'
import { resolveLandrushIslandVisiblePalmLayout } from './landrush-island-palm-collider'
import { resolveLandrushIslandAmbientPalmSlotVisible } from './landrush-island-palm-construction-visibility'
import {
  createLandrushIslandPalmCollisionCircles,
  type LandrushIslandPalmPlacement,
  resolveLandrushIslandAmbientPalmSlots,
} from './landrush-island-palm-layout'
import { createLandrushIslandPalmPresentation } from './landrush-island-palm-presentation'
import { LandrushZombieNightPresentation } from './landrush-zombie-night-presentation'
import {
  parseLandrushZombieNightDebugQuery,
  resolveLandrushZombieNightVisibilityTreatment,
} from './landrush-zombie-night-presentation-state'
import {
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION,
  type ZombieEscapeAmbientHandoffSource,
} from './zombie-escape-ambient-handoff'
import { createZombieEscapeAmbientNpcPresentationResource } from './zombie-escape-ambient-npc-presentation'
import {
  createZombieEscapeAmbientNpcPresentationClaim,
  isZombieEscapeAmbientNpcHandoffCandidatePending,
  resolveZombieEscapeAmbientNpcPresentationClaim,
  type ZombieEscapeAmbientNpcPresentationRegistry,
} from './zombie-escape-ambient-npc-presentation-registry'
import {
  createZombieEscapeAttackClip,
  isZombieEscapeAttackPresentationActive,
  resolveZombieEscapeAttackNormalizedPhase,
} from './zombie-escape-attack-presentation'
import { resolveZombieEscapeDeathNormalizedPhase } from './zombie-escape-character-motion'
import type { ZombieEscapeCollisionCircleSource } from './zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS } from './zombie-escape-config'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'
import {
  resolveZombieEscapeLocomotionPlaybackRate,
  resolveZombieEscapeLocomotionWeight,
} from './zombie-escape-locomotion-playback'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
  ZOMBIE_ESCAPE_PRESENTATION_ROOT_Y,
} from './zombie-escape-presentation-pose'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

type AmbientNpcActions = {
  attack: AnimationAction | null
  death: AnimationAction | null
  idle: AnimationAction | null
  mixer: AnimationMixer
  run: AnimationAction | null
  walk: AnimationAction | null
}

type AmbientMotionDebugStore = {
  fish: Record<string, LandrushIslandFishMotionDebugEntry>
  npcs: Record<string, LandrushIslandNpcMotionDebugEntry>
}

type AmbientMotionDebugRuntime = {
  store: AmbientMotionDebugStore | null
  timeSeconds: number | null
}

const EMPTY_AMBIENT_SCENE_NODES: Record<string, AnyNode> = {}
const AMBIENT_NPC_COLLISION_RADIUS_METERS = ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS
const AMBIENT_FISH_Y_AXIS = new Vector3(0, 1, 0)
const AMBIENT_FISH_Z_AXIS = new Vector3(0, 0, 1)
const AMBIENT_NPC_ZOMBIE_ACTION_BLEND_SECONDS = 0.18
const AMBIENT_NPC_ZOMBIE_PRESENTATION_FRAME_PRIORITY = 0.86

const LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS = createLandrushIslandAmbientLoadUnits({
  boatIds: LANDRUSH_ISLAND_AMBIENT_BOATS.map((boat) => boat.id),
  fishIds: LANDRUSH_ISLAND_AMBIENT_FISH.map((fish) => fish.id),
  npcIds: LANDRUSH_ISLAND_AMBIENT_NPCS.map((npc) => npc.id),
  palmIds: LANDRUSH_ISLAND_AMBIENT_PALMS.map((palm) => palm.id),
})
export const LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_IDS = Object.freeze(
  LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS.map((unit) => unit.id),
)
export const LANDRUSH_ISLAND_AMBIENT_LOAD_CATALOG_SIGNATURE = `ambient-assets:${JSON.stringify(
  LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_IDS,
)}`

export function LandrushIslandAmbientLife({
  admitted,
  ambientNpcPresentationRegistry,
  blockedPalmInstanceIndices,
  npcsVisible,
  onLoadReadinessChange,
  palmLayout,
  readCanonicalElapsedSeconds,
  roads,
  surface,
  waterY,
  zombieEscapeHandoffEnabled,
  zombieIslandActive,
}: {
  admitted: boolean
  ambientNpcPresentationRegistry: ZombieEscapeAmbientNpcPresentationRegistry
  blockedPalmInstanceIndices: ReadonlySet<number>
  npcsVisible: boolean
  onLoadReadinessChange: (readiness: LandrushIslandAmbientLoadReadiness) => void
  palmLayout: readonly LandrushIslandPalmPlacement[]
  readCanonicalElapsedSeconds: () => number | null
  roads: readonly LandrushRoadSegment[]
  surface: PascalWaterLandSurface
  waterY: number
  zombieEscapeHandoffEnabled: boolean
  zombieIslandActive: boolean
}) {
  const sceneNodes = useScene((state) => (admitted ? state.nodes : EMPTY_AMBIENT_SCENE_NODES))
  const interactiveDoorPassabilityKey = useInteractive((state) =>
    createLandrushIslandRuntimeDoorPassabilityKey(state.doors),
  )
  const interactiveDoorPassability = useMemo(
    () => resolveLandrushIslandRuntimeDoorPassabilityKey(interactiveDoorPassabilityKey),
    [interactiveDoorPassabilityKey],
  )
  const [loadQueue, setLoadQueue] = useState(createLandrushIslandAmbientLoadQueueStateForMount)
  const [fishRuntime] = useState(createLandrushIslandFishRuntime)
  const [zombieOutsideTorchVisibility] = useState(readAmbientNpcZombieOutsideTorchVisibility)
  const [pageVisible, setPageVisible] = useState(readAmbientPageVisible)
  const pageVisibleRef = useRef(pageVisible)
  pageVisibleRef.current = pageVisible
  const handleLoadUnitSettled = useCallback((settlement: LandrushIslandAmbientLoadSettlement) => {
    setLoadQueue((current) => settleLandrushIslandAmbientLoadQueue(current, settlement))
  }, [])
  const terminalUnitCount = Object.keys(loadQueue.terminalOutcomes).length
  const previousTerminalUnitCountRef = useRef(terminalUnitCount)
  const ambientLoadReadiness = useMemo(
    () => resolveLandrushIslandAmbientLoadReadiness(loadQueue, LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS),
    [loadQueue],
  )
  const center = useMemo(
    () => averagePoint(surface.grassSurfacePoints),
    [surface.grassSurfacePoints],
  )
  const [motionDebug] = useState(readAmbientMotionDebugRuntime)
  const visiblePalmInstanceCount = zombieIslandActive
    ? LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT
    : LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT
  const visiblePalmLayout = useMemo(
    () =>
      resolveLandrushIslandVisiblePalmLayout({
        blockedInstanceIndices: blockedPalmInstanceIndices,
        layout: palmLayout,
        visibleCount: visiblePalmInstanceCount,
      }),
    [blockedPalmInstanceIndices, palmLayout, visiblePalmInstanceCount],
  )
  const ambientNpcPalmLayout = useMemo(
    () =>
      resolveLandrushIslandVisiblePalmLayout({
        blockedInstanceIndices: blockedPalmInstanceIndices,
        layout: palmLayout,
        visibleCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      }),
    [blockedPalmInstanceIndices, palmLayout],
  )
  const palmCollisionCircles = useMemo(
    () =>
      createLandrushIslandPalmCollisionCircles({
        layout: ambientNpcPalmLayout,
        origin: { x: 0, z: 0 },
      }),
    [ambientNpcPalmLayout],
  )
  const palmNavigationObstacles = useMemo(
    () => createLandrushIslandPalmNavigationObstacles(palmCollisionCircles),
    [palmCollisionCircles],
  )
  const semanticNavigationSnapshot = useMemo(
    () =>
      createLandrushIslandAiNavigationSnapshot({
        doorPassability: interactiveDoorPassability,
        nodes: sceneNodes,
        spawn: { x: 0, z: 0 },
        verticalOriginY: 0,
      }),
    [interactiveDoorPassability, sceneNodes],
  )
  const navigationObstacles = useMemo(
    () =>
      resolveAdmittedLandrushIslandAmbientNavigationObstacles({
        admitted,
        createSceneObstacles: () =>
          createLandrushIslandAmbientSemanticNavigationObstacles({
            agentRadius: AMBIENT_NPC_COLLISION_RADIUS_METERS,
            groundY: surface.grassSurfaceElevation,
            snapshot: semanticNavigationSnapshot,
          }),
        palmObstacles: palmNavigationObstacles,
      }),
    [admitted, palmNavigationObstacles, semanticNavigationSnapshot, surface.grassSurfaceElevation],
  )
  const navigationWorld = useMemo<LandrushIslandAmbientNavigationWorld>(
    () =>
      createLandrushIslandAmbientNavigationWorld({
        obstacles: navigationObstacles,
        roads,
        surfacePoints: surface.grassSurfacePoints,
      }),
    [navigationObstacles, roads, surface.grassSurfacePoints],
  )
  const npcJourneyPlanner = useMemo(
    () => createLandrushIslandAmbientNpcJourneyPlanner(navigationWorld),
    [navigationWorld],
  )
  const npcNeighborIndex = useMemo(
    () =>
      createLandrushIslandAmbientNpcNeighborIndex(
        navigationWorld,
        LANDRUSH_ISLAND_AMBIENT_NPCS.length,
      ),
    [navigationWorld],
  )
  const oceanBounds = useMemo(() => boundsForPoints(surface.grassSurfacePoints), [surface])
  const mountedLoadUnits = resolveMountedLandrushIslandAmbientLoadUnits(
    loadQueue,
    LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS,
  )

  useLayoutEffect(() => {
    ambientNpcPresentationRegistry.setGroundY(surface.grassSurfaceElevation)
  }, [ambientNpcPresentationRegistry, surface.grassSurfaceElevation])

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = readAmbientPageVisible()
      pageVisibleRef.current = visible
      setPageVisible(visible)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(
    () => () => {
      npcJourneyPlanner.dispose()
    },
    [npcJourneyPlanner],
  )

  useFrame(() => {
    if (!(admitted && npcsVisible)) return
    const result = npcJourneyPlanner.advance(
      LANDRUSH_ISLAND_AMBIENT_NPC_PLANNING_OPERATIONS_PER_FRAME,
    )
    if (result.pendingCount > 0) renderScheduler.requestFrame('animation')
  }, -5.5)

  useFrame(function updateLandrushIslandFishBatches({ clock }) {
    if (!shouldAdvanceLandrushIslandFishBatches(admitted, zombieIslandActive)) return
    fishRuntime.advance(motionDebug.timeSeconds ?? clock.elapsedTime, waterY)
  }, -6)

  useEffect(() => {
    if (
      !admitted ||
      !pageVisible ||
      loadQueue.admittedUnitIds.length === LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS.length ||
      terminalUnitCount === LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS.length
    ) {
      return
    }
    const generation = loadQueue.generation
    return scheduleLandrushIslandAmbientLoadAdmissionYield({
      onYield: () => {
        setLoadQueue((current) =>
          advanceLandrushIslandAmbientLoadQueueAfterYield(
            current,
            LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS,
            {
              generation,
              policy: {
                admitted,
                pageVisible: pageVisibleRef.current,
              },
            },
          ),
        )
      },
    })
  }, [
    admitted,
    loadQueue.admittedUnitIds.length,
    loadQueue.generation,
    pageVisible,
    terminalUnitCount,
  ])

  useEffect(() => {
    if (terminalUnitCount === previousTerminalUnitCountRef.current) return
    previousTerminalUnitCountRef.current = terminalUnitCount
    renderScheduler.requestFrame('geometry:changed')
  }, [terminalUnitCount])

  useEffect(() => {
    onLoadReadinessChange(ambientLoadReadiness)
  }, [ambientLoadReadiness, onLoadReadinessChange])

  if (!admitted) return null

  return (
    <group
      userData={{
        boatModelCount: LANDRUSH_ISLAND_AMBIENT_BOATS.length,
        fishInstanceCount: LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT,
        fishModelCount: LANDRUSH_ISLAND_AMBIENT_FISH.length,
        fishUpdatePhaseCount: fishRuntime.snapshot().updatePhaseCount,
        npcModelCount: npcsVisible || zombieIslandActive ? LANDRUSH_ISLAND_AMBIENT_NPCS.length : 0,
        npcNavigationObstacleCount: navigationObstacles.length,
        palmInstanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
        palmModelCount: LANDRUSH_ISLAND_AMBIENT_PALMS.length,
        source: 'meshy-image-to-3d',
        visiblePalmInstanceCount: visiblePalmLayout.length,
      }}
    >
      <LandrushZombieNightPresentation
        active={zombieIslandActive}
        groundY={surface.grassSurfaceElevation}
        readCanonicalElapsedSeconds={readCanonicalElapsedSeconds}
        roads={roads}
      />
      {mountedLoadUnits.map((unit) => (
        <AmbientProgressiveLoadUnit
          generation={loadQueue.generation}
          key={`${loadQueue.generation}:${unit.id}`}
          onSettled={handleLoadUnitSettled}
          unitId={unit.id}
        >
          <AmbientLoadUnitModel
            ambientNpcPresentationRegistry={ambientNpcPresentationRegistry}
            center={center}
            blockedPalmInstanceIndices={blockedPalmInstanceIndices}
            fishRuntime={fishRuntime}
            groundY={surface.grassSurfaceElevation}
            motionDebug={motionDebug}
            navigationWorld={navigationWorld}
            npcJourneyPlanner={npcJourneyPlanner}
            npcNeighborIndex={npcNeighborIndex}
            npcsVisible={npcsVisible}
            orbitRadiusX={Math.max(oceanBounds.width * 0.54 + 4, 1)}
            orbitRadiusZ={Math.max(oceanBounds.depth * 0.54 + 4, 1)}
            palmLayout={palmLayout}
            shoreline={surface.grassSurfacePoints}
            unit={unit}
            waterY={waterY}
            zombieEscapeHandoffEnabled={zombieEscapeHandoffEnabled}
            zombieIslandActive={zombieIslandActive}
            zombieOutsideTorchVisibility={zombieOutsideTorchVisibility}
          />
        </AmbientProgressiveLoadUnit>
      ))}
    </group>
  )
}

function AmbientLoadUnitModel({
  ambientNpcPresentationRegistry,
  blockedPalmInstanceIndices,
  center,
  fishRuntime,
  groundY,
  motionDebug,
  navigationWorld,
  npcJourneyPlanner,
  npcNeighborIndex,
  npcsVisible,
  orbitRadiusX,
  orbitRadiusZ,
  palmLayout,
  shoreline,
  unit,
  waterY,
  zombieEscapeHandoffEnabled,
  zombieIslandActive,
  zombieOutsideTorchVisibility,
}: {
  ambientNpcPresentationRegistry: ZombieEscapeAmbientNpcPresentationRegistry
  blockedPalmInstanceIndices: ReadonlySet<number>
  center: LandrushPoint2
  fishRuntime: LandrushIslandFishRuntime
  groundY: number
  motionDebug: AmbientMotionDebugRuntime
  navigationWorld: LandrushIslandAmbientNavigationWorld
  npcJourneyPlanner: LandrushIslandAmbientNpcJourneyPlanner
  npcNeighborIndex: LandrushIslandAmbientNpcNeighborIndex
  npcsVisible: boolean
  orbitRadiusX: number
  orbitRadiusZ: number
  palmLayout: readonly LandrushIslandPalmPlacement[]
  shoreline: readonly LandrushPoint2[]
  unit: LandrushIslandAmbientLoadUnit
  waterY: number
  zombieEscapeHandoffEnabled: boolean
  zombieIslandActive: boolean
  zombieOutsideTorchVisibility: number
}) {
  if (unit.kind === 'palm') {
    const palm = LANDRUSH_ISLAND_AMBIENT_PALMS[unit.catalogIndex]
    if (!palm) throw new Error(`Unknown ambient palm load unit ${unit.id}.`)
    const palmSlots = resolveLandrushIslandAmbientPalmSlots({
      catalogIndex: unit.catalogIndex,
      catalogSize: LANDRUSH_ISLAND_AMBIENT_PALMS.length,
      dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      instanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
      zombieIslandActive,
    })
    return (
      <group>
        {palmSlots.map((slot) => {
          const placement = palmLayout[slot.instanceIndex]
          const position = placement?.position ?? center
          return (
            <group
              key={slot.instanceIndex}
              visible={resolveLandrushIslandAmbientPalmSlotVisible({
                blockedInstanceIndices: blockedPalmInstanceIndices,
                instanceIndex: slot.instanceIndex,
                phaseVisible: slot.visible,
              })}
            >
              <LandrushIslandMeshyPalm
                modelPath={palm.modelPath}
                position={[position.x, groundY, position.z]}
                targetSizeMeters={placement?.heightMeters ?? palm.heightMeters}
              />
            </group>
          )
        })}
      </group>
    )
  }
  if (unit.kind === 'fish') {
    const fish = LANDRUSH_ISLAND_AMBIENT_FISH[unit.catalogIndex]
    if (!fish) throw new Error(`Unknown ambient fish load unit ${unit.id}.`)
    return (
      <LandrushIslandMeshyFishSchool
        center={center}
        debugStore={motionDebug.store}
        debugTimeSeconds={motionDebug.timeSeconds}
        fish={fish}
        index={unit.catalogIndex}
        runtime={fishRuntime}
        shoreline={shoreline}
        waterY={waterY}
      />
    )
  }
  if (unit.kind === 'boat') {
    const boat = LANDRUSH_ISLAND_AMBIENT_BOATS[unit.catalogIndex]
    if (!boat) throw new Error(`Unknown ambient boat load unit ${unit.id}.`)
    return (
      <LandrushIslandMeshyBoat
        boat={boat}
        center={center}
        index={unit.catalogIndex}
        orbitRadiusX={orbitRadiusX}
        orbitRadiusZ={orbitRadiusZ}
        waterY={waterY}
      />
    )
  }

  const npc = LANDRUSH_ISLAND_AMBIENT_NPCS[unit.catalogIndex]
  if (!npc) throw new Error(`Unknown ambient NPC load unit ${unit.id}.`)
  return (
    <group visible={npcsVisible || zombieIslandActive}>
      <AmbientNpc
        ambientNpcPresentationRegistry={ambientNpcPresentationRegistry}
        dayActive={npcsVisible}
        debugStore={motionDebug.store}
        groundY={groundY}
        index={unit.catalogIndex}
        navigationWorld={navigationWorld}
        npc={npc}
        npcNeighborIndex={npcNeighborIndex}
        planner={npcJourneyPlanner}
        zombieEscapeHandoffEnabled={zombieEscapeHandoffEnabled}
        zombieIslandActive={zombieIslandActive}
        zombieOutsideTorchVisibility={zombieOutsideTorchVisibility}
      />
    </group>
  )
}

function AmbientProgressiveLoadUnit({
  children,
  generation,
  onSettled,
  unitId,
}: {
  children: ReactNode
  generation: number
  onSettled: (settlement: LandrushIslandAmbientLoadSettlement) => void
  unitId: string
}) {
  const watchdogRef = useRef<LandrushIslandAmbientLoadUnitWatchdog | null>(null)
  const settledOutcomeRef = useRef<LandrushIslandAmbientLoadSettlement['outcome'] | null>(null)
  const handleSettled = useCallback(
    (settlement: LandrushIslandAmbientLoadSettlement) => {
      if (settledOutcomeRef.current !== null) return
      const watchdog = watchdogRef.current
      if (watchdog) {
        watchdog.settle(settlement.outcome)
        return
      }
      settledOutcomeRef.current = settlement.outcome
      onSettled(settlement)
    },
    [onSettled],
  )

  useEffect(() => {
    if (settledOutcomeRef.current !== null) return
    const watchdog = createLandrushIslandAmbientLoadUnitWatchdog({
      generation,
      onSettled: (settlement) => {
        settledOutcomeRef.current = settlement.outcome
        onSettled(settlement)
      },
      unitId,
    })
    watchdogRef.current = watchdog
    return () => {
      watchdog.dispose()
      if (watchdogRef.current === watchdog) watchdogRef.current = null
    }
  }, [generation, onSettled, unitId])

  return (
    <AmbientLoadErrorBoundary generation={generation} onSettled={handleSettled} unitId={unitId}>
      <Suspense fallback={null}>
        <AmbientLoadCompletion generation={generation} onSettled={handleSettled} unitId={unitId}>
          {children}
        </AmbientLoadCompletion>
      </Suspense>
    </AmbientLoadErrorBoundary>
  )
}

function AmbientLoadCompletion({
  children,
  generation,
  onSettled,
  unitId,
}: {
  children: ReactNode
  generation: number
  onSettled: (settlement: LandrushIslandAmbientLoadSettlement) => void
  unitId: string
}) {
  useEffect(() => {
    onSettled({ generation, outcome: 'loaded', unitId })
  }, [generation, onSettled, unitId])
  return children
}

class AmbientLoadErrorBoundary extends Component<
  {
    children: ReactNode
    generation: number
    onSettled: (settlement: LandrushIslandAmbientLoadSettlement) => void
    unitId: string
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn(`[Landrush ambient] Failed to load ${this.props.unitId}.`, error)
    this.props.onSettled({
      generation: this.props.generation,
      outcome: 'failed',
      unitId: this.props.unitId,
    })
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function LandrushIslandMeshyPalm({
  modelPath,
  position,
  targetSizeMeters,
}: {
  modelPath: string
  position: readonly [number, number, number]
  targetSizeMeters: number
}) {
  const gltf = useGLTFKTX2(modelPath)
  const model = useMemo(() => createLandrushIslandPalmPresentation(gltf.scene), [gltf.scene])
  const transform = useMemo(
    () => computeGroundedTransform(gltf.scene, targetSizeMeters),
    [gltf.scene, targetSizeMeters],
  )
  return (
    <group position={position} rotation={[0, hashAngle(modelPath), 0]}>
      <primitive object={model} position={transform.offset} scale={transform.scale} />
    </group>
  )
}

export function LandrushIslandMeshyFishSchool({
  center,
  debugStore,
  debugTimeSeconds,
  fish,
  index,
  runtime,
  shoreline,
  waterY,
}: {
  center: LandrushPoint2
  debugStore: AmbientMotionDebugStore | null
  debugTimeSeconds: number | null
  fish: LandrushIslandAmbientFish
  index: number
  runtime: LandrushIslandFishRuntime
  shoreline: readonly LandrushPoint2[]
  waterY: number
}) {
  const gltf = useGLTFKTX2(fish.modelPath)
  const instancingSource = useMemo(
    () => resolveAmbientFishInstancingSource(gltf.scene),
    [gltf.scene],
  )
  const meshRef = useRef<InstancedMesh>(null)
  const lanes = useMemo(
    () => createLandrushIslandFishLanes(fish, shoreline, center, index),
    [center, fish, index, shoreline],
  )
  const trajectories = useMemo(
    () =>
      Array.from({ length: fish.schoolSize }, (_, schoolIndex) =>
        createLandrushIslandFishTrajectory(fish, lanes, index, schoolIndex),
      ),
    [fish, index, lanes],
  )
  const transform = useMemo(
    () => computeCenteredTransform(gltf.scene, fish.lengthMeters),
    [fish.lengthMeters, gltf.scene],
  )
  const baseMatrix = useMemo(
    () =>
      new Matrix4()
        .compose(
          transform.offset,
          new Quaternion().setFromAxisAngle(AMBIENT_FISH_Y_AXIS, fish.modelForwardYaw),
          new Vector3(transform.scale, transform.scale, transform.scale),
        )
        .multiply(instancingSource.matrix),
    [fish.modelForwardYaw, instancingSource.matrix, transform.offset, transform.scale],
  )
  const instancedGeometry = useMemo(
    () => instancingSource.geometry.clone().applyMatrix4(baseMatrix),
    [baseMatrix, instancingSource.geometry],
  )
  const samples = useMemo(
    () => Array.from({ length: fish.schoolSize }, createLandrushIslandFishMotionSample),
    [fish.schoolSize],
  )
  const motionScratch = useMemo(createLandrushIslandFishMotionScratch, [])
  const matrixScratch = useMemo(
    () => ({
      bankQuaternion: new Quaternion(),
      matrix: new Matrix4(),
      position: new Vector3(),
      quaternion: new Quaternion(),
      scale: new Vector3(1, 1, 1),
      yawQuaternion: new Quaternion(),
    }),
    [],
  )
  const updateBatch = useCallback(
    (elapsedSeconds: number, currentWaterY: number, phase = 0, phaseCount = 1) => {
      const mesh = meshRef.current
      if (!mesh) return
      const updateRange = resolveLandrushIslandFishUpdateRange(fish.schoolSize, phase, phaseCount)
      let firstChangedInstance = updateRange.start + updateRange.count
      let lastChangedInstance = -1
      for (
        let schoolIndex = updateRange.start;
        schoolIndex < updateRange.start + updateRange.count;
        schoolIndex += 1
      ) {
        const trajectory = trajectories[schoolIndex]
        const sample = samples[schoolIndex]
        if (!(trajectory && sample)) continue
        sampleLandrushIslandFishMotionInto(
          trajectory,
          elapsedSeconds,
          currentWaterY,
          sample,
          motionScratch,
        )
        matrixScratch.position.set(sample.position.x, sample.position.y, sample.position.z)
        matrixScratch.yawQuaternion.setFromAxisAngle(AMBIENT_FISH_Y_AXIS, sample.yawRadians)
        matrixScratch.bankQuaternion.setFromAxisAngle(AMBIENT_FISH_Z_AXIS, sample.bankRadians)
        matrixScratch.quaternion.multiplyQuaternions(
          matrixScratch.yawQuaternion,
          matrixScratch.bankQuaternion,
        )
        matrixScratch.matrix.compose(
          matrixScratch.position,
          matrixScratch.quaternion,
          matrixScratch.scale,
        )
        if (setLandrushIslandFishInstanceMatrixIfChanged(mesh, schoolIndex, matrixScratch.matrix)) {
          firstChangedInstance = Math.min(firstChangedInstance, schoolIndex)
          lastChangedInstance = schoolIndex
        }
        if (debugStore) {
          recordLandrushIslandFishMotionDebug(
            debugStore,
            fish,
            schoolIndex,
            sample,
            shoreline,
            trajectory,
            elapsedSeconds,
          )
        }
      }
      if (lastChangedInstance >= firstChangedInstance) {
        mesh.instanceMatrix.addUpdateRange(
          firstChangedInstance * 16,
          (lastChangedInstance - firstChangedInstance + 1) * 16,
        )
        mesh.instanceMatrix.needsUpdate = true
      }
    },
    [debugStore, fish, matrixScratch, motionScratch, samples, shoreline, trajectories],
  )
  useGpuResourceLifetime(instancedGeometry)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    updateBatch(debugTimeSeconds ?? 0, waterY)
    const unregister = runtime.register({
      id: fish.id,
      instanceCount: fish.schoolSize,
      update: updateBatch,
    })
    return () => {
      unregister()
      clearLandrushIslandFishMotionDebug(debugStore, fish.id)
    }
  }, [debugStore, debugTimeSeconds, fish.id, fish.schoolSize, runtime, updateBatch, waterY])
  return (
    <instancedMesh
      args={[instancedGeometry, instancingSource.material, fish.schoolSize]}
      castShadow={false}
      dispose={null}
      frustumCulled={false}
      matrixAutoUpdate={false}
      receiveShadow={false}
      ref={meshRef}
      userData={{
        fishBatchCount: 1,
        fishModelForwardAxis: fish.modelForwardAxis,
        fishModelForwardYaw: fish.modelForwardYaw,
        fishModelId: fish.id,
        rendering: 'instanced',
        schoolSize: fish.schoolSize,
      }}
    />
  )
}

export function resolveLandrushIslandFishUpdateRange(
  instanceCount: number,
  phase: number,
  phaseCount: number,
) {
  const count = Math.max(0, Math.trunc(instanceCount))
  const phases = Math.max(1, Math.trunc(phaseCount))
  const normalizedPhase = Math.min(phases - 1, Math.max(0, Math.trunc(phase)))
  const start = Math.floor((count * normalizedPhase) / phases)
  const end = Math.floor((count * (normalizedPhase + 1)) / phases)
  return { count: end - start, start }
}

export function shouldAdvanceLandrushIslandFishBatches(
  admitted: boolean,
  zombieIslandActive: boolean,
) {
  return admitted && !zombieIslandActive
}

export function setLandrushIslandFishInstanceMatrixIfChanged(
  mesh: InstancedMesh,
  instance: number,
  matrix: Matrix4,
) {
  const offset = instance * 16
  const target = mesh.instanceMatrix.array
  const elements = matrix.elements
  for (let component = 0; component < 16; component += 1) {
    if (target[offset + component] !== Math.fround(elements[component]!)) {
      mesh.setMatrixAt(instance, matrix)
      return true
    }
  }
  return false
}

export function LandrushIslandMeshyBoat({
  boat,
  center,
  index,
  orbitRadiusX,
  orbitRadiusZ,
  waterY,
}: {
  boat: LandrushIslandAmbientBoat
  center: LandrushPoint2
  index: number
  orbitRadiusX: number
  orbitRadiusZ: number
  waterY: number
}) {
  const gltf = useGLTFKTX2(boat.modelPath)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const rootRef = useRef<Group>(null)
  const transform = useMemo(
    () => computeWaterlineTransform(gltf.scene, boat.lengthMeters),
    [boat.lengthMeters, gltf.scene],
  )
  const placement = useMemo(() => {
    const angle = -0.45 + index * 2.05
    return {
      baseYaw: angle + Math.PI / 2,
      phase: hashAngle(boat.id),
      x: center.x + Math.cos(angle) * (orbitRadiusX + 5 + index * 2.5),
      z: center.z + Math.sin(angle) * (orbitRadiusZ + 5 + index * 2),
    }
  }, [boat.id, center.x, center.z, index, orbitRadiusX, orbitRadiusZ])

  useEffect(() => prepareMeshes(model), [model])
  useFrame(({ clock }) => {
    const root = rootRef.current
    if (!root) return
    const time = clock.elapsedTime
    root.position.set(
      placement.x,
      waterY - transform.waterlineDepth + Math.sin(time * 0.55 + placement.phase) * 0.13,
      placement.z,
    )
    root.rotation.set(
      Math.sin(time * 0.42 + placement.phase * 0.8) * 0.018,
      placement.baseYaw + Math.sin(time * 0.2 + placement.phase) * 0.035,
      Math.sin(time * 0.48 + placement.phase * 1.7) * 0.026,
    )
  }, -6)

  return (
    <group ref={rootRef} userData={{ ambientBoatId: boat.id, motion: 'buoyant' }}>
      <primitive
        object={model}
        position={transform.offset}
        rotation={[0, transform.headingOffset, 0]}
        scale={transform.scale}
      />
    </group>
  )
}

function AmbientNpc({
  ambientNpcPresentationRegistry,
  dayActive,
  debugStore,
  groundY,
  index,
  navigationWorld,
  npc,
  npcNeighborIndex,
  planner,
  zombieEscapeHandoffEnabled,
  zombieIslandActive,
  zombieOutsideTorchVisibility,
}: {
  ambientNpcPresentationRegistry: ZombieEscapeAmbientNpcPresentationRegistry
  dayActive: boolean
  debugStore: AmbientMotionDebugStore | null
  groundY: number
  index: number
  navigationWorld: LandrushIslandAmbientNavigationWorld
  npc: LandrushIslandAmbientNpc
  npcNeighborIndex: LandrushIslandAmbientNpcNeighborIndex
  planner: LandrushIslandAmbientNpcJourneyPlanner
  zombieEscapeHandoffEnabled: boolean
  zombieIslandActive: boolean
  zombieOutsideTorchVisibility: number
}) {
  const riggedGltf = useGLTFKTX2(npc.glb.rigged)
  const idleGltf = useGLTF(npc.glb.idle)
  const runGltf = useGLTF(npc.glb.run)
  const walkGltf = useGLTF(npc.glb.walk)
  const modelOwner = useMemo(() => {
    const model = cloneSkeleton(riggedGltf.scene) as Group
    return {
      model,
      skeletonResource: createLandrushIslandAmbientCloneSkeletonResource(model),
    }
  }, [riggedGltf.scene])
  const model = modelOwner.model
  useGpuResourceLifetime(modelOwner.skeletonResource)
  const zombieVariantIndex = useMemo(
    () => ZOMBIE_ESCAPE_ZOMBIE_CATALOG.findIndex((zombie) => zombie.sourceNpcId === npc.id),
    [npc.id],
  )
  const zombieVariant = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[zombieVariantIndex]
  if (!zombieVariant) throw new Error(`Missing zombie variant for ambient NPC ${npc.id}.`)
  const presentationResource = useMemo(
    () =>
      zombieEscapeHandoffEnabled
        ? createZombieEscapeAmbientNpcPresentationResource(
            model,
            zombieVariant.seed,
            zombieOutsideTorchVisibility,
          )
        : null,
    [model, zombieEscapeHandoffEnabled, zombieOutsideTorchVisibility, zombieVariant.seed],
  )
  useGpuResourceLifetime(presentationResource)
  const rootUserData = useMemo(
    () => ({
      ambientNpcId: npc.id,
      collision: 'scene-obstacles+npc-separation',
      navigation: 'player-surface-visibility-graph',
      phase: 'idle',
      zombieGeneration: 0,
      zombieSlot: -1,
    }),
    [npc.id],
  )
  const rootRef = useRef<Group>(null)
  const actionsRef = useRef<AmbientNpcActions | null>(null)
  const actionPhaseRef = useRef<LandrushIslandAmbientNpcMotionState['phase'] | null>(null)
  const motionRef = useRef<LandrushIslandAmbientNpcMotionState | null>(null)
  const motionWorldRef = useRef(navigationWorld)
  const [zombiePresentation] = useState(createAmbientNpcZombiePresentationState)
  if (!motionRef.current) {
    motionRef.current = createLandrushIslandAmbientNpcMotionState(index, navigationWorld)
  }
  const transform = useMemo(
    () => computeGroundedTransform(riggedGltf.scene, npc.heightMeters),
    [npc.heightMeters, riggedGltf.scene],
  )
  const neighborQuery = useMemo<LandrushIslandAmbientNpcNeighborQuery>(
    () => npcNeighborIndex.createQuery(npc.id),
    [npc.id, npcNeighborIndex],
  )
  const walkClip = walkGltf.animations[0] ?? null
  const attackClip = useMemo(
    () => (zombieEscapeHandoffEnabled ? createZombieEscapeAttackClip(model, walkClip) : null),
    [model, walkClip, zombieEscapeHandoffEnabled],
  )
  const deathClip = useMemo(
    () => (zombieEscapeHandoffEnabled ? createZombieEscapeDeathClip(model) : null),
    [model, zombieEscapeHandoffEnabled],
  )
  const captureAdapter = useMemo(
    () => ({
      capture(source: ZombieEscapeAmbientHandoffSource, captureIndex: number) {
        const root = rootRef.current
        const actions = actionsRef.current
        const motion = motionRef.current
        const runtime = ambientNpcPresentationRegistry.readRuntime()
        if (
          !(presentationResource && root && actions && motion && runtime && captureIndex === index)
        ) {
          return false
        }
        const phase = actionPhaseRef.current ?? motion.phase
        const action =
          phase === 'idle' ? actions.idle : phase === 'walk' ? actions.walk : actions.run
        source.x[index] = root.position.x - runtime.originX
        source.y[index] = root.position.y - ambientNpcPresentationRegistry.readGroundY()
        source.z[index] = root.position.z - runtime.originZ
        source.yaw[index] = root.rotation.y
        source.locomotionMode[index] = ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION[phase]
        source.locomotionPhase[index] = resolveAmbientNpcZombieLocomotionPhase(
          action?.time ?? 0,
          action?.getClip().duration ?? 0,
        )
        source.variant[index] = zombieVariantIndex
        return true
      },
    }),
    [ambientNpcPresentationRegistry, index, presentationResource, zombieVariantIndex],
  )

  useLayoutEffect(() => {
    if (!zombieEscapeHandoffEnabled) return
    return ambientNpcPresentationRegistry.register(index, captureAdapter)
  }, [ambientNpcPresentationRegistry, captureAdapter, index, zombieEscapeHandoffEnabled])

  useEffect(() => {
    prepareMeshes(model)
    const mixer = new AnimationMixer(model)
    const idle = idleGltf.animations[0] ? mixer.clipAction(idleGltf.animations[0], model) : null
    const walk = walkGltf.animations[0] ? mixer.clipAction(walkGltf.animations[0], model) : null
    const run = runGltf.animations[0] ? mixer.clipAction(runGltf.animations[0], model) : null
    const attack = attackClip ? mixer.clipAction(attackClip, model) : null
    const death = deathClip ? mixer.clipAction(deathClip, model) : null
    for (const action of [idle, walk, run]) {
      action?.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      action?.play()
    }
    attack?.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
    death?.setLoop(LoopOnce, 1)
    if (death) death.clampWhenFinished = true
    const actions = { attack, death, idle, mixer, run, walk }
    actionsRef.current = actions
    const phase = motionRef.current?.phase ?? 'idle'
    setAmbientNpcActionWeights(
      actions,
      phase === 'idle' ? 1 : 0,
      phase === 'walk' ? 1 : 0,
      phase === 'run' ? 1 : 0,
      0,
      0,
    )
    mixer.update(0)
    actionPhaseRef.current = phase
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      actionsRef.current = null
      actionPhaseRef.current = null
    }
  }, [attackClip, deathClip, idleGltf.animations, model, runGltf.animations, walkGltf.animations])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let motion = motionRef.current
    if (!motion) return
    if (motionWorldRef.current !== navigationWorld) {
      motion = reconcileLandrushIslandAmbientNpcMotionStateForWorld(motion, index, navigationWorld)
      motionRef.current = motion
      motionWorldRef.current = navigationWorld
    }
    if (dayActive) {
      root.position.set(motion.position.x, groundY, motion.position.z)
      root.rotation.y = motion.yaw
      npcNeighborIndex.set(npc.id, motion.position)
    } else {
      npcNeighborIndex.delete(npc.id)
    }
    return () => {
      npcNeighborIndex.delete(npc.id)
      clearLandrushIslandNpcMotionDebug(debugStore, npc.id)
    }
  }, [dayActive, debugStore, groundY, index, navigationWorld, npc.id, npcNeighborIndex])

  useLayoutEffect(() => {
    const root = rootRef.current
    const actions = actionsRef.current
    const motion = motionRef.current
    if (!(root && motion && presentationResource)) return
    presentationResource.setHitFlash(0)
    zombiePresentation.activeGeneration = 0
    zombiePresentation.activeSlot = -1
    zombiePresentation.releasedForNight = false
    zombiePresentation.transitionSeconds = 0
    if (dayActive) {
      presentationResource.setZombiePhase(0)
      root.visible = true
      root.position.set(motion.position.x, groundY, motion.position.z)
      root.rotation.set(0, motion.yaw, 0)
      root.userData.phase = motion.phase
      root.userData.zombieGeneration = 0
      root.userData.zombieSlot = -1
      npcNeighborIndex.set(npc.id, motion.position)
      if (actions) {
        actions.attack?.stop()
        actions.death?.stop()
        setAmbientNpcActionWeights(
          actions,
          motion.phase === 'idle' ? 1 : 0,
          motion.phase === 'walk' ? 1 : 0,
          motion.phase === 'run' ? 1 : 0,
          0,
          0,
        )
        actions.mixer.update(0)
        actionPhaseRef.current = motion.phase
      }
      return
    }
    if (zombieIslandActive) {
      presentationResource.setZombiePhase(1)
      root.visible = true
      root.userData.phase = 'zombie'
      root.userData.zombieGeneration = 0
      root.userData.zombieSlot = -1
      npcNeighborIndex.delete(npc.id)
    }
  }, [
    dayActive,
    groundY,
    npc.id,
    npcNeighborIndex,
    presentationResource,
    zombieIslandActive,
    zombiePresentation,
  ])

  useFrame((_, delta) => {
    if (!dayActive) return
    const root = rootRef.current
    const actions = actionsRef.current
    if (!(root && actions)) return
    const frameDelta = Math.min(0.1, Math.max(0, delta))
    const currentMotion = motionRef.current
    if (!currentMotion) return
    const previousX = currentMotion.position.x
    const previousZ = currentMotion.position.z
    const previousYaw = currentMotion.yaw
    const motion = advanceLandrushIslandAmbientNpcMotion(
      currentMotion,
      frameDelta,
      navigationWorld,
      neighborQuery,
      planner,
    )
    if (motion.position.x !== previousX || motion.position.z !== previousZ) {
      root.position.x = motion.position.x
      root.position.z = motion.position.z
      npcNeighborIndex.set(npc.id, motion.position)
    }
    if (motion.yaw !== previousYaw) root.rotation.y = motion.yaw
    if (actionPhaseRef.current !== motion.phase) {
      setAmbientNpcActionWeights(
        actions,
        motion.phase === 'idle' ? 1 : 0,
        motion.phase === 'walk' ? 1 : 0,
        motion.phase === 'run' ? 1 : 0,
        0,
        0,
      )
      root.userData.phase = motion.phase
      root.userData.destinationPreference = motion.destinationPreference
      actionPhaseRef.current = motion.phase
    }
    if (debugStore) {
      recordLandrushIslandNpcMotionDebug(debugStore, npc.id, motion, navigationWorld)
    }
    actions.mixer.update(frameDelta)
  }, -5)

  useFrame((_, delta) => {
    if (dayActive || !zombieIslandActive || !presentationResource) return
    const root = rootRef.current
    const actions = actionsRef.current
    const runtime = ambientNpcPresentationRegistry.readRuntime()
    const presentation = zombiePresentation
    if (!(root && actions && runtime) || presentation.releasedForNight) return
    const simulation = runtime.readSimulation()
    if (zombieOutsideTorchVisibility < 1) {
      presentationResource.shader.setTorchLighting(runtime.readShoulderTorchLighting())
    }
    const claim = resolveZombieEscapeAmbientNpcPresentationClaim(
      simulation,
      index,
      presentation.claim,
    )
    if (
      presentation.activeSlot >= 0 &&
      (!claim.valid ||
        claim.slot !== presentation.activeSlot ||
        claim.generation !== presentation.activeGeneration)
    ) {
      presentationResource.setHitFlash(0)
      presentation.activeSlot = -1
      presentation.activeGeneration = 0
      presentation.releasedForNight = true
      root.visible = false
      root.userData.zombieGeneration = 0
      root.userData.zombieSlot = -1
      return
    }
    if (!claim.valid) {
      if (!isZombieEscapeAmbientNpcHandoffCandidatePending(simulation.ambientHandoff, index)) {
        presentationResource.setHitFlash(0)
        presentation.releasedForNight = true
        root.visible = false
        root.userData.zombieGeneration = 0
        root.userData.zombieSlot = -1
      }
      return
    }
    const slot = claim.slot
    if (presentation.activeSlot < 0) {
      actions.attack?.play()
      actions.death?.play()
      presentation.activeSlot = slot
      presentation.activeGeneration = claim.generation
      presentation.transitionSeconds = 0
      presentation.sourceAttackWeight = actions.attack?.getEffectiveWeight() ?? 0
      presentation.sourceDeathWeight = actions.death?.getEffectiveWeight() ?? 0
      presentation.sourceIdleWeight = actions.idle?.getEffectiveWeight() ?? 0
      presentation.sourceRunWeight = actions.run?.getEffectiveWeight() ?? 0
      presentation.sourceWalkWeight = actions.walk?.getEffectiveWeight() ?? 0
      root.visible = true
    }
    const zombies = simulation.zombies
    const deathProgress =
      (zombies.health[slot] ?? 0) <= 0
        ? resolveZombieEscapeDeathNormalizedPhase(zombies.deathPresentationSeconds[slot] ?? 0)
        : 0
    resolveZombieEscapePresentationPose(
      (zombies.x[slot] ?? 0) + runtime.originX,
      (zombies.y[slot] ?? 0) +
        ambientNpcPresentationRegistry.readGroundY() -
        ZOMBIE_ESCAPE_PRESENTATION_ROOT_Y,
      (zombies.z[slot] ?? 0) + runtime.originZ,
      zombies.heading[slot] ?? 0,
      zombies.hitReaction[slot] ?? 0,
      zombies.hitImpulseX[slot] ?? 0,
      zombies.hitImpulseY[slot] ?? 0,
      zombies.hitImpulseZ[slot] ?? 0,
      presentation.pose,
      transform.bodyCenterY,
      deathProgress,
      zombies.spawnOrdinal[slot] ?? 0,
    )
    root.position.set(presentation.pose.x, presentation.pose.y, presentation.pose.z)
    root.quaternion.set(
      presentation.pose.quaternionX,
      presentation.pose.quaternionY,
      presentation.pose.quaternionZ,
      presentation.pose.quaternionW,
    )
    presentationResource.setHitFlash(zombies.hitFlash[slot] ?? 0)
    updateAmbientNpcZombieActions(
      actions,
      presentation,
      Math.min(0.05, Math.max(0, delta)),
      simulation.paused,
      Math.hypot(zombies.vx[slot] ?? 0, zombies.vz[slot] ?? 0),
      zombies.runBlend[slot] ?? 0,
      zombieVariant.movement.walkMetersPerSecond,
      zombieVariant.movement.runMetersPerSecond,
      zombies.intent[slot] ?? 0,
      zombies.attackCooldown[slot] ?? 0,
      zombies.health[slot] ?? 0,
      zombies.deathPresentationSeconds[slot] ?? 0,
    )
    root.userData.phase = 'zombie'
    root.userData.zombieGeneration = presentation.activeGeneration
    root.userData.zombieSlot = presentation.activeSlot
  }, AMBIENT_NPC_ZOMBIE_PRESENTATION_FRAME_PRIORITY)

  return (
    <group ref={rootRef} userData={rootUserData}>
      <primitive
        dispose={null}
        object={model}
        position={transform.offset}
        scale={transform.scale}
      />
    </group>
  )
}

type AmbientNpcZombieActionTargets = {
  attackPhase: number
  attackWeight: number
  deathPhase: number
  deathWeight: number
  idleWeight: number
  locomotionPlaybackRate: number
  runWeight: number
  walkWeight: number
}

type AmbientNpcZombiePresentationState = {
  activeGeneration: number
  activeSlot: number
  claim: ReturnType<typeof createZombieEscapeAmbientNpcPresentationClaim>
  pose: ReturnType<typeof createZombieEscapePresentationPose>
  releasedForNight: boolean
  sourceAttackWeight: number
  sourceDeathWeight: number
  sourceIdleWeight: number
  sourceRunWeight: number
  sourceWalkWeight: number
  targets: AmbientNpcZombieActionTargets
  transitionSeconds: number
}

function createAmbientNpcZombiePresentationState(): AmbientNpcZombiePresentationState {
  return {
    activeGeneration: 0,
    activeSlot: -1,
    claim: createZombieEscapeAmbientNpcPresentationClaim(),
    pose: createZombieEscapePresentationPose(),
    releasedForNight: false,
    sourceAttackWeight: 0,
    sourceDeathWeight: 0,
    sourceIdleWeight: 0,
    sourceRunWeight: 0,
    sourceWalkWeight: 0,
    targets: createAmbientNpcZombieActionTargets(),
    transitionSeconds: 0,
  }
}

export function createAmbientNpcZombieActionTargets(): AmbientNpcZombieActionTargets {
  return {
    attackPhase: 0,
    attackWeight: 0,
    deathPhase: 0,
    deathWeight: 0,
    idleWeight: 1,
    locomotionPlaybackRate: 0,
    runWeight: 0,
    walkWeight: 0,
  }
}

export function resolveAmbientNpcZombieLocomotionPhase(
  actionTimeSeconds: number,
  clipDurationSeconds: number,
) {
  if (
    !Number.isFinite(actionTimeSeconds) ||
    !Number.isFinite(clipDurationSeconds) ||
    clipDurationSeconds <= 0
  ) {
    return 0
  }
  const wrappedTime =
    ((actionTimeSeconds % clipDurationSeconds) + clipDurationSeconds) % clipDurationSeconds
  return (wrappedTime / clipDurationSeconds) * Math.PI * 2
}

export function resolveAmbientNpcZombieActionTargets(
  horizontalSpeed: number,
  runBlend: number,
  walkMetersPerSecond: number,
  runMetersPerSecond: number,
  attackIntent: number,
  attackCooldown: number,
  health: number,
  deathPresentationSeconds: number,
  output: AmbientNpcZombieActionTargets,
) {
  const deathActive = health <= 0
  const attackIntentActive = isZombieEscapeAttackPresentationActive(attackIntent)
  const deathPhase = deathActive
    ? resolveZombieEscapeDeathNormalizedPhase(deathPresentationSeconds)
    : 0
  const deathBlendProgress = Math.min(1, deathPhase / 0.24)
  const deathWeight = deathBlendProgress * deathBlendProgress * (3 - 2 * deathBlendProgress)
  const sourceWeight = 1 - deathWeight
  const locomotionWeight = attackIntentActive
    ? 0
    : resolveZombieEscapeLocomotionWeight(horizontalSpeed) * sourceWeight
  const clampedRunBlend = Math.max(0, Math.min(1, runBlend))
  output.attackPhase = resolveZombieEscapeAttackNormalizedPhase(attackCooldown)
  output.attackWeight =
    (!deathActive && attackIntentActive) || (deathActive && attackIntentActive) ? sourceWeight : 0
  output.deathPhase = deathPhase
  output.deathWeight = deathActive ? deathWeight : 0
  output.idleWeight = attackIntentActive ? 0 : (1 - locomotionWeight) * sourceWeight
  output.locomotionPlaybackRate = resolveZombieEscapeLocomotionPlaybackRate(
    horizontalSpeed,
    walkMetersPerSecond,
    runMetersPerSecond,
    clampedRunBlend,
  )
  output.runWeight = clampedRunBlend * locomotionWeight
  output.walkWeight = (1 - clampedRunBlend) * locomotionWeight
  return output
}

function updateAmbientNpcZombieActions(
  actions: AmbientNpcActions,
  presentation: AmbientNpcZombiePresentationState,
  frameDelta: number,
  paused: boolean,
  horizontalSpeed: number,
  runBlend: number,
  walkMetersPerSecond: number,
  runMetersPerSecond: number,
  attackIntent: number,
  attackCooldown: number,
  health: number,
  deathPresentationSeconds: number,
) {
  const targets = resolveAmbientNpcZombieActionTargets(
    horizontalSpeed,
    runBlend,
    walkMetersPerSecond,
    runMetersPerSecond,
    attackIntent,
    attackCooldown,
    health,
    deathPresentationSeconds,
    presentation.targets,
  )
  const blendProgress = Math.min(
    1,
    presentation.transitionSeconds / AMBIENT_NPC_ZOMBIE_ACTION_BLEND_SECONDS,
  )
  const blend = blendProgress * blendProgress * (3 - 2 * blendProgress)
  actions.idle?.setEffectiveWeight(
    presentation.sourceIdleWeight + (targets.idleWeight - presentation.sourceIdleWeight) * blend,
  )
  actions.walk?.setEffectiveWeight(
    presentation.sourceWalkWeight + (targets.walkWeight - presentation.sourceWalkWeight) * blend,
  )
  actions.walk?.setEffectiveTimeScale(targets.locomotionPlaybackRate)
  actions.run?.setEffectiveWeight(
    presentation.sourceRunWeight + (targets.runWeight - presentation.sourceRunWeight) * blend,
  )
  actions.run?.setEffectiveTimeScale(targets.locomotionPlaybackRate)
  actions.attack?.setEffectiveWeight(
    presentation.sourceAttackWeight +
      (targets.attackWeight - presentation.sourceAttackWeight) * blend,
  )
  actions.attack?.setEffectiveTimeScale(0)
  if (actions.attack && targets.attackWeight > 0) {
    actions.attack.time = targets.attackPhase * actions.attack.getClip().duration
  }
  actions.death?.setEffectiveWeight(
    presentation.sourceDeathWeight + (targets.deathWeight - presentation.sourceDeathWeight) * blend,
  )
  actions.death?.setEffectiveTimeScale(0)
  if (actions.death && targets.deathWeight > 0) {
    actions.death.time = targets.deathPhase * actions.death.getClip().duration
  }
  actions.mixer.update(paused ? 0 : frameDelta)
  if (!paused) presentation.transitionSeconds += frameDelta
}

function setAmbientNpcActionWeights(
  actions: AmbientNpcActions,
  idleWeight: number,
  walkWeight: number,
  runWeight: number,
  attackWeight: number,
  deathWeight: number,
) {
  actions.idle?.setEffectiveWeight(idleWeight)
  actions.walk?.setEffectiveWeight(walkWeight)
  actions.run?.setEffectiveWeight(runWeight)
  actions.attack?.setEffectiveWeight(attackWeight)
  actions.death?.setEffectiveWeight(deathWeight)
}

function computeGroundedTransform(source: Group, heightMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = heightMeters / Math.max(0.000_1, size.y)
  return {
    bodyCenterY: (center.y - bounds.min.y) * scale,
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
  }
}

function computeCenteredTransform(source: Group, lengthMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const longest = Math.max(size.x, size.y, size.z, 0.000_1)
  const scale = lengthMeters / longest
  return {
    offset: center.multiplyScalar(-scale),
    scale,
  }
}

function resolveAmbientFishInstancingSource(source: Group) {
  const meshes: Array<Mesh & { isSkinnedMesh?: boolean }> = []
  source.updateWorldMatrix(true, true)
  source.traverse((object) => {
    const mesh = object as Mesh & { isSkinnedMesh?: boolean }
    if (mesh.isMesh) meshes.push(mesh)
  })
  if (meshes.length !== 1) {
    throw new Error(`Ambient fish instancing requires one mesh; received ${meshes.length}.`)
  }
  const mesh = meshes[0]!
  if (mesh.isSkinnedMesh || (mesh.morphTargetInfluences?.length ?? 0) > 0) {
    throw new Error('Ambient fish instancing requires a static source mesh.')
  }
  return {
    geometry: mesh.geometry,
    material: mesh.material,
    matrix: mesh.matrixWorld.clone(),
  }
}

function computeWaterlineTransform(source: Group, lengthMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = lengthMeters / Math.max(size.x, size.z, 0.000_1)
  return {
    headingOffset: size.x >= size.z ? -Math.PI / 2 : 0,
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
    waterlineDepth: size.y * scale * 0.28,
  }
}

function prepareMeshes(root: Group) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

function averagePoint(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), {
    x: 0,
    z: 0,
  })
  return { x: total.x / points.length, z: total.z / points.length }
}

function boundsForPoints(points: readonly LandrushPoint2[]) {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }
  return { depth: maxZ - minZ, width: maxX - minX }
}

function createLandrushIslandPalmNavigationObstacles(
  circles: readonly ZombieEscapeCollisionCircleSource[],
) {
  return circles.map<LandrushIslandAmbientNavigationObstacle>((circle) => {
    const radius = circle.radius + AMBIENT_NPC_COLLISION_RADIUS_METERS
    return {
      id: circle.objectId ?? circle.id,
      points: [
        { x: circle.x - radius, z: circle.z - radius },
        { x: circle.x + radius, z: circle.z - radius },
        { x: circle.x + radius, z: circle.z + radius },
        { x: circle.x - radius, z: circle.z + radius },
      ],
    }
  })
}

type LandrushIslandFishMotionDebugEntry = {
  forward: LandrushPoint2
  forwardDot: number
  maximumShoreDistanceMeters: number
  minimumShoreDistanceMeters: number
  modelForwardAxis: '+x' | '+z' | '-x' | '-z'
  modelForwardYaw: number
  position: { x: number; y: number; z: number }
  shoreDistanceMeters: number
  speedMetersPerSecond: number
  timeSeconds: number
  trajectoryId: string
}

type LandrushIslandNpcMotionDebugEntry = {
  destinationPreference: 'grass' | 'mixed'
  idleSeconds: number
  obstacleClearanceMeters: number
  onRoad: boolean
  phase: 'idle' | 'run' | 'walk'
  position: LandrushPoint2
  target: LandrushPoint2 | null
}

declare global {
  interface Window {
    __LANDRUSH_AMBIENT_MOTION_DEBUG__?: AmbientMotionDebugStore
  }
}

function readAmbientMotionDebugRuntime(): AmbientMotionDebugRuntime {
  if (typeof window === 'undefined') return { store: null, timeSeconds: null }
  const settings = parseLandrushIslandAmbientMotionDebugSettings(window.location.search)
  if (!settings.enabled) return { store: null, timeSeconds: settings.timeSeconds }
  window.__LANDRUSH_AMBIENT_MOTION_DEBUG__ ??= { fish: {}, npcs: {} }
  return { store: window.__LANDRUSH_AMBIENT_MOTION_DEBUG__, timeSeconds: settings.timeSeconds }
}

function readAmbientNpcZombieOutsideTorchVisibility() {
  const visibility =
    typeof window === 'undefined'
      ? 'normal'
      : parseLandrushZombieNightDebugQuery(new URLSearchParams(window.location.search)).visibility
  return resolveLandrushZombieNightVisibilityTreatment(visibility).outsideTorchVisibility
}

function readAmbientPageVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function recordLandrushIslandFishMotionDebug(
  store: AmbientMotionDebugStore,
  fish: LandrushIslandAmbientFish,
  schoolIndex: number,
  sample: LandrushIslandFishMotionSample,
  shoreline: readonly LandrushPoint2[],
  trajectory: LandrushIslandFishTrajectory,
  timeSeconds: number,
) {
  const modelHeadingYaw = sample.yawRadians + fish.modelForwardYaw
  const localForward = fishModelForwardVector(fish.modelForwardAxis)
  const modelForward = {
    x: Math.cos(modelHeadingYaw) * localForward.x + Math.sin(modelHeadingYaw) * localForward.z,
    z: -Math.sin(modelHeadingYaw) * localForward.x + Math.cos(modelHeadingYaw) * localForward.z,
  }
  store.fish[`${fish.id}:${schoolIndex}`] = {
    forward: { x: sample.forwardX, z: sample.forwardZ },
    forwardDot: modelForward.x * sample.forwardX + modelForward.z * sample.forwardZ,
    maximumShoreDistanceMeters: trajectory.maximumShoreDistanceMeters,
    minimumShoreDistanceMeters: trajectory.minimumShoreDistanceMeters,
    modelForwardAxis: fish.modelForwardAxis,
    modelForwardYaw: fish.modelForwardYaw,
    position: { ...sample.position },
    shoreDistanceMeters: measureLandrushIslandFishShoreDistance(sample.position, shoreline),
    speedMetersPerSecond: sample.speedMetersPerSecond,
    timeSeconds,
    trajectoryId: sample.trajectoryId,
  }
}

function fishModelForwardVector(axis: '+x' | '+z' | '-x' | '-z') {
  if (axis === '+x') return { x: 1, z: 0 }
  if (axis === '-x') return { x: -1, z: 0 }
  if (axis === '-z') return { x: 0, z: -1 }
  return { x: 0, z: 1 }
}

function recordLandrushIslandNpcMotionDebug(
  store: AmbientMotionDebugStore,
  id: string,
  motion: LandrushIslandAmbientNpcMotionState,
  world: LandrushIslandAmbientNavigationWorld,
) {
  store.npcs[id] = {
    destinationPreference: motion.destinationPreference,
    idleSeconds: motion.idleSeconds,
    obstacleClearanceMeters: distanceToLandrushIslandAmbientObstacles(
      motion.position,
      world.obstacles,
    ),
    onRoad: isLandrushIslandAmbientPointOnRoad(motion.position, world.roads),
    phase: motion.phase,
    position: { ...motion.position },
    target: motion.target ? { ...motion.target } : null,
  }
}

function clearLandrushIslandNpcMotionDebug(store: AmbientMotionDebugStore | null, id: string) {
  if (store) delete store.npcs[id]
}

function clearLandrushIslandFishMotionDebug(store: AmbientMotionDebugStore | null, fishId: string) {
  if (!store) return
  for (const key of Object.keys(store.fish)) {
    if (key.startsWith(`${fishId}:`)) delete store.fish[key]
  }
}

function hashAngle(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  return ((hash >>> 0) % 6_283) / 1_000
}
