'use client'

import type { PascalWaterLandSurface } from '@landrush/pascal-plugin'
import { renderScheduler } from '@landrush/runtime'
import { type AnyNode, useInteractive, useScene } from '@pascal-app/core'
import { useGLTFKTX2, useGpuResourceLifetime } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
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
  resolveLandrushIslandAmbientNpcPalmCollisions,
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
  LANDRUSH_ISLAND_AMBIENT_NPC_PLANNING_OPERATIONS_PER_FRAME,
  type LandrushIslandAmbientNpcJourneyPlanner,
  type LandrushIslandAmbientNpcMotionState,
  type LandrushIslandAmbientNpcNeighbor,
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
import {
  createLandrushIslandPalmCollisionCircles,
  type LandrushIslandPalmPlacement,
  resolveLandrushIslandAmbientPalmSlots,
} from './landrush-island-palm-layout'
import {
  createLandrushRenderReadinessCoordinator,
  type LandrushPipelineRenderer,
  type LandrushRenderReadinessCoordinator,
} from './landrush-render-readiness'
import type { ZombieEscapeCollisionCircleSource } from './zombie-escape-collision-world'

type AmbientNpcActions = {
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

const AMBIENT_NPC_POSITIONS = new Map<string, LandrushPoint2>()
const EMPTY_AMBIENT_SCENE_NODES: Record<string, AnyNode> = {}
const AMBIENT_NPC_COLLISION_RADIUS_METERS = 0.3
const AMBIENT_FISH_Y_AXIS = new Vector3(0, 1, 0)
const AMBIENT_FISH_Z_AXIS = new Vector3(0, 0, 1)

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
  npcsVisible,
  onLoadReadinessChange,
  palmLayout,
  roads,
  surface,
  waterY,
  zombieIslandActive,
}: {
  admitted: boolean
  npcsVisible: boolean
  onLoadReadinessChange: (readiness: LandrushIslandAmbientLoadReadiness) => void
  palmLayout: readonly LandrushIslandPalmPlacement[]
  roads: readonly LandrushRoadSegment[]
  surface: PascalWaterLandSurface
  waterY: number
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
  const [renderReadinessCoordinator] = useState(createLandrushRenderReadinessCoordinator)
  const [fishRuntime] = useState(createLandrushIslandFishRuntime)
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
  const palmCollisionCircles = useMemo(
    () => createLandrushIslandPalmCollisionCircles({ layout: palmLayout, origin: { x: 0, z: 0 } }),
    [palmLayout],
  )
  const palmNavigationObstacles = useMemo(
    () =>
      createLandrushIslandPalmNavigationObstacles(
        resolveLandrushIslandAmbientNpcPalmCollisions(
          palmCollisionCircles,
          LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
        ),
      ),
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
  const oceanBounds = useMemo(() => boundsForPoints(surface.grassSurfacePoints), [surface])
  const mountedLoadUnits = resolveMountedLandrushIslandAmbientLoadUnits(
    loadQueue,
    LANDRUSH_ISLAND_AMBIENT_LOAD_UNITS,
  )

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
      renderReadinessCoordinator.dispose()
    },
    [renderReadinessCoordinator],
  )

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
    if (!admitted) return
    fishRuntime.advance(motionDebug.timeSeconds ?? clock.elapsedTime, waterY)
  }, -6)

  useEffect(() => {
    if (
      !admitted ||
      !pageVisible ||
      loadQueue.inFlightUnitId !== null ||
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
  }, [admitted, loadQueue.generation, loadQueue.inFlightUnitId, pageVisible, terminalUnitCount])

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
        npcModelCount: npcsVisible ? LANDRUSH_ISLAND_AMBIENT_NPCS.length : 0,
        npcNavigationObstacleCount: navigationObstacles.length,
        palmInstanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
        palmModelCount: LANDRUSH_ISLAND_AMBIENT_PALMS.length,
        source: 'meshy-image-to-3d',
        visiblePalmInstanceCount,
      }}
    >
      {mountedLoadUnits.map((unit) => (
        <AmbientProgressiveLoadUnit
          generation={loadQueue.generation}
          key={`${loadQueue.generation}:${unit.id}`}
          onSettled={handleLoadUnitSettled}
          renderReadinessCoordinator={renderReadinessCoordinator}
          unitId={unit.id}
        >
          <AmbientLoadUnitModel
            center={center}
            fishRuntime={fishRuntime}
            groundY={surface.grassSurfaceElevation}
            motionDebug={motionDebug}
            navigationWorld={navigationWorld}
            npcJourneyPlanner={npcJourneyPlanner}
            npcsVisible={npcsVisible}
            orbitRadiusX={Math.max(oceanBounds.width * 0.54 + 4, 1)}
            orbitRadiusZ={Math.max(oceanBounds.depth * 0.54 + 4, 1)}
            palmLayout={palmLayout}
            shoreline={surface.grassSurfacePoints}
            unit={unit}
            waterY={waterY}
            zombieIslandActive={zombieIslandActive}
          />
        </AmbientProgressiveLoadUnit>
      ))}
    </group>
  )
}

function AmbientLoadUnitModel({
  center,
  fishRuntime,
  groundY,
  motionDebug,
  navigationWorld,
  npcJourneyPlanner,
  npcsVisible,
  orbitRadiusX,
  orbitRadiusZ,
  palmLayout,
  shoreline,
  unit,
  waterY,
  zombieIslandActive,
}: {
  center: LandrushPoint2
  fishRuntime: LandrushIslandFishRuntime
  groundY: number
  motionDebug: AmbientMotionDebugRuntime
  navigationWorld: LandrushIslandAmbientNavigationWorld
  npcJourneyPlanner: LandrushIslandAmbientNpcJourneyPlanner
  npcsVisible: boolean
  orbitRadiusX: number
  orbitRadiusZ: number
  palmLayout: readonly LandrushIslandPalmPlacement[]
  shoreline: readonly LandrushPoint2[]
  unit: LandrushIslandAmbientLoadUnit
  waterY: number
  zombieIslandActive: boolean
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
            <group key={slot.instanceIndex} visible={slot.visible}>
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
    <group visible={npcsVisible}>
      <AmbientNpc
        active={npcsVisible}
        debugStore={motionDebug.store}
        groundY={groundY}
        index={unit.catalogIndex}
        navigationWorld={navigationWorld}
        npc={npc}
        planner={npcJourneyPlanner}
      />
    </group>
  )
}

function AmbientProgressiveLoadUnit({
  children,
  generation,
  onSettled,
  renderReadinessCoordinator,
  unitId,
}: {
  children: ReactNode
  generation: number
  onSettled: (settlement: LandrushIslandAmbientLoadSettlement) => void
  renderReadinessCoordinator: LandrushRenderReadinessCoordinator
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
        <AmbientLoadCompletion
          coordinator={renderReadinessCoordinator}
          generation={generation}
          onSettled={handleSettled}
          unitId={unitId}
        >
          {children}
        </AmbientLoadCompletion>
      </Suspense>
    </AmbientLoadErrorBoundary>
  )
}

function AmbientLoadCompletion({
  children,
  coordinator,
  generation,
  onSettled,
  unitId,
}: {
  children: ReactNode
  coordinator: LandrushRenderReadinessCoordinator
  generation: number
  onSettled: (settlement: LandrushIslandAmbientLoadSettlement) => void
  unitId: string
}) {
  const { camera, gl, scene } = useThree()
  const rootRef = useRef<Group>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let active = true
    void coordinator.request(
      {
        camera,
        generation,
        identity: root,
        renderer: gl as unknown as LandrushPipelineRenderer,
        representatives: [{ key: unitId, root }],
        targetScene: scene,
      },
      (status) => {
        if (!active) return
        if (status.state === 'failed') {
          console.error(
            `[Landrush ambient] Render pipeline prewarm failed for ${unitId}; continuing with loaded content.`,
            status.message,
          )
        } else if (status.state === 'degraded') {
          console.warn(
            `[Landrush ambient] Render pipeline prewarm timed out for ${unitId}; continuing with loaded content.`,
            status.message,
          )
        }
        onSettled({
          generation,
          outcome: status.state === 'ready' ? 'loaded' : 'degraded',
          unitId,
        })
      },
    )
    return () => {
      active = false
    }
  }, [camera, coordinator, generation, gl, onSettled, scene, unitId])
  return <group ref={rootRef}>{children}</group>
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
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const transform = useMemo(
    () => computeGroundedTransform(gltf.scene, targetSizeMeters),
    [gltf.scene, targetSizeMeters],
  )
  useEffect(() => prepareMeshes(model), [model])
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
      for (let schoolIndex = phase; schoolIndex < fish.schoolSize; schoolIndex += phaseCount) {
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
        mesh.setMatrixAt(schoolIndex, matrixScratch.matrix)
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
      mesh.instanceMatrix.needsUpdate = true
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
  active,
  debugStore,
  groundY,
  index,
  navigationWorld,
  npc,
  planner,
}: {
  active: boolean
  debugStore: AmbientMotionDebugStore | null
  groundY: number
  index: number
  navigationWorld: LandrushIslandAmbientNavigationWorld
  npc: LandrushIslandAmbientNpc
  planner: LandrushIslandAmbientNpcJourneyPlanner
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
  const rootRef = useRef<Group>(null)
  const actionsRef = useRef<AmbientNpcActions | null>(null)
  const motionRef = useRef<LandrushIslandAmbientNpcMotionState | null>(null)
  const motionWorldRef = useRef(navigationWorld)
  if (!motionRef.current) {
    motionRef.current = createLandrushIslandAmbientNpcMotionState(index, navigationWorld)
  }
  const transform = useMemo(
    () => computeGroundedTransform(riggedGltf.scene, npc.heightMeters),
    [npc.heightMeters, riggedGltf.scene],
  )

  useEffect(() => {
    prepareMeshes(model)
    const mixer = new AnimationMixer(model)
    const idle = idleGltf.animations[0] ? mixer.clipAction(idleGltf.animations[0], model) : null
    const walk = walkGltf.animations[0] ? mixer.clipAction(walkGltf.animations[0], model) : null
    const run = runGltf.animations[0] ? mixer.clipAction(runGltf.animations[0], model) : null
    for (const action of [idle, walk, run]) {
      action?.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      action?.play()
    }
    actionsRef.current = { idle, mixer, run, walk }
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      actionsRef.current = null
    }
  }, [idleGltf.animations, model, runGltf.animations, walkGltf.animations])

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
    root.position.set(motion.position.x, groundY, motion.position.z)
    root.rotation.y = motion.yaw
    AMBIENT_NPC_POSITIONS.set(npc.id, { ...motion.position })
    return () => {
      AMBIENT_NPC_POSITIONS.delete(npc.id)
      clearLandrushIslandNpcMotionDebug(debugStore, npc.id)
    }
  }, [debugStore, groundY, index, navigationWorld, npc.id])

  useFrame((_, delta) => {
    if (!active) return
    const root = rootRef.current
    const actions = actionsRef.current
    if (!(root && actions)) return
    const frameDelta = Math.min(0.1, Math.max(0, delta))
    const neighbors: LandrushIslandAmbientNpcNeighbor[] = []
    for (const [id, position] of AMBIENT_NPC_POSITIONS) {
      if (id !== npc.id) neighbors.push({ id, position })
    }
    const currentMotion = motionRef.current
    if (!currentMotion) return
    const motion = advanceLandrushIslandAmbientNpcMotion(
      currentMotion,
      frameDelta,
      navigationWorld,
      neighbors,
      planner,
    )
    root.position.set(motion.position.x, groundY, motion.position.z)
    root.rotation.y = motion.yaw
    AMBIENT_NPC_POSITIONS.set(npc.id, { ...motion.position })
    setAmbientNpcActionWeights(
      actions,
      motion.phase === 'idle' ? 1 : 0,
      motion.phase === 'walk' ? 1 : 0,
      motion.phase === 'run' ? 1 : 0,
    )
    root.userData.phase = motion.phase
    root.userData.destinationPreference = motion.destinationPreference
    if (debugStore) {
      recordLandrushIslandNpcMotionDebug(debugStore, npc.id, motion, navigationWorld)
    }
    actions.mixer.update(frameDelta)
  }, -5)

  return (
    <group
      ref={rootRef}
      userData={{
        ambientNpcId: npc.id,
        collision: 'scene-obstacles+npc-separation',
        navigation: 'player-surface-visibility-graph',
      }}
    >
      <primitive
        dispose={null}
        object={model}
        position={transform.offset}
        scale={transform.scale}
      />
    </group>
  )
}

function setAmbientNpcActionWeights(
  actions: AmbientNpcActions,
  idleWeight: number,
  walkWeight: number,
  runWeight: number,
) {
  actions.idle?.setEffectiveWeight(idleWeight)
  actions.walk?.setEffectiveWeight(walkWeight)
  actions.run?.setEffectiveWeight(runWeight)
}

function computeGroundedTransform(source: Group, heightMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = heightMeters / Math.max(0.000_1, size.y)
  return {
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
