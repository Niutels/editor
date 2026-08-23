'use client'

import { renderScheduler } from '@landrush/runtime'
import { useInteractive, useScene } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import {
  type MutableRefObject,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { type Group, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { readLandrushGamepadInput } from './landrush-gamepad-input'
import {
  createLandrushIslandRuntimeDoorPassabilityKey,
  createLandrushZombieEscapeCollisionWorldsResolver,
  resolveLandrushIslandRuntimeDoorPassabilityKey,
} from './landrush-island-ai-navigation-semantics'
import type {
  LandrushIslandMaterialPresentationOwner,
  LandrushIslandMaterialReadinessMesh,
} from './landrush-island-material-presentation'
import {
  LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
  LandrushIslandMaterialPresentationRenderReadiness,
} from './landrush-island-material-presentation-readiness'
import {
  createLandrushIslandPalmCollisionCircles,
  createLandrushIslandPalmLayout,
  resolveLandrushIslandPalmLayoutCenter,
} from './landrush-island-palm-layout'
import {
  createLandrushRobotWeaponCombatState,
  createLandrushRobotWeaponMuzzlePose,
  LandrushRobotWeaponRig,
} from './landrush-robot-weapon-rig'
import { resolveLandrushZombieEscapeAimPlaneElevation } from './landrush-zombie-escape-aim'
import { shouldShowLandrushZombieEscapeMoney } from './landrush-zombie-escape-hud-visibility'
import {
  advanceLandrushZombieEscapePhaseClock,
  advanceLandrushZombieEscapeRestartButtonState,
  canAdvanceLandrushZombieEscapeIntegratedSimulation,
  createLandrushZombieEscapePhaseClock,
  createLandrushZombieEscapeRestartButtonState,
  restartLandrushZombieEscapeIntegratedSimulation,
  stepLandrushZombieEscapeIntegratedSimulation,
} from './landrush-zombie-escape-runtime'
import { LandrushZombieEscapeStructurePresentation } from './landrush-zombie-escape-structure-presentation'
import { ZombieEscapeActors } from './zombie-escape-actors'
import { ZombieEscapeAudio } from './zombie-escape-audio'
import { ZOMBIE_ESCAPE_SEED, ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  createZombieEscapeControlState,
  isZombieEscapeGamepadFirePressed,
} from './zombie-escape-controls'
import { ZombieEscapeEffects } from './zombie-escape-effects'
import {
  clearZombieEscapeGeneratedAssetCaches,
  type ZombieEscapeGeneratedAssetFailure,
} from './zombie-escape-generated-assets'
import { ZombieEscapeMoneyBadge } from './zombie-escape-hud'
import {
  createZombieEscapeRenderReadinessRegistry,
  getZombieEscapeRenderRepresentativeKeys,
} from './zombie-escape-render-readiness'
import {
  countZombieEscapeShotsByPhase,
  createZombieEscapeHudSnapshot,
  createZombieEscapeSimulation,
  getZombieEscapeMeleeProgress,
  restoreZombieEscapeDefaultMuzzlePose,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapePlayerMuzzlePose,
  setZombieEscapeWeaponPickupPlacements,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  type ZombieEscapeGamePhase,
  type ZombieEscapeGameStatus,
  type ZombieEscapeHudSnapshot,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import {
  resolveZombieEscapeWeaponPickupPlacements,
  translateZombieEscapeWeaponPickupPlacements,
} from './zombie-escape-weapon-placement'
import { createZombieEscapeArena, type ZombieEscapeArenaData } from './zombie-escape-world'

const RECOIL_DURATION_SECONDS = 0.13
const GENERATED_ASSET_AUTO_RETRY_DELAYS_MS = [650, 1_300] as const

export const LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER = {
  effects: 0.9,
  floorPresentation: 0.92,
  input: 0.3,
  motion: 0.4,
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
    __LANDRUSH_ZOMBIE_ESCAPE_HUD_PORTAL__?: {
      container: HTMLDivElement
      owner: symbol
      release: () => void
    }
  }
}

export type LandrushZombieEscapePlayerMotion = {
  falling: boolean
  heading: number
  isMoving: boolean
  position: Vector3
  runRequested: boolean
  speed: number
  velocity: Vector3
}

export type LandrushZombieEscapeModeProps = {
  active: boolean
  combatHeadingRef: MutableRefObject<number | null>
  expectedPhase: ZombieEscapeGamePhase
  groundY: number
  materialPresentation: LandrushIslandMaterialPresentationOwner
  materialPresentationReadinessMeshes: readonly LandrushIslandMaterialReadinessMesh[]
  motionRef: MutableRefObject<LandrushZombieEscapePlayerMotion | null>
  /**
   * Rare-event snapshots of temporarily destroyed furniture node IDs. An empty set clears all
   * exclusions (initial mount, reset, or unmount); consumers may update derived collision
   * structures but must not mutate the canonical scene graph.
   */
  onDestroyedFurnitureIdsChange?: (nodeIds: ReadonlySet<string>) => void
  onGeneratedAssetsReadyChange?: (ready: boolean) => void
  onPhaseChange: (phase: ZombieEscapeGamePhase) => void
  onResetExternalPlayerMotion: () => void
  onStatusChange: (status: ZombieEscapeGameStatus) => void
  phaseReady: boolean
  playerColor: string
  spawn: Readonly<{ x: number; z: number }>
  surfacePoints: readonly Readonly<{ x: number; z: number }>[]
  viewerSceneReady: boolean
  visualRootRef: MutableRefObject<Group | null>
}

export function shouldLandrushZombieEscapeOwnCanvasPointerEvents(
  active: boolean,
  expectedPhase: ZombieEscapeGamePhase,
) {
  return active && expectedPhase === 'night'
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

export function LandrushZombieEscapeMode({
  active,
  combatHeadingRef,
  expectedPhase,
  groundY,
  materialPresentation,
  materialPresentationReadinessMeshes,
  motionRef,
  onDestroyedFurnitureIdsChange,
  onGeneratedAssetsReadyChange,
  onPhaseChange,
  onResetExternalPlayerMotion,
  onStatusChange,
  phaseReady,
  playerColor,
  spawn,
  surfacePoints,
  viewerSceneReady,
  visualRootRef,
}: LandrushZombieEscapeModeProps) {
  const { camera, get, gl, setEvents } = useThree()
  const sceneNodes = useScene((state) => state.nodes)
  const [resolveCollisionWorlds] = useState(() =>
    createLandrushZombieEscapeCollisionWorldsResolver(),
  )
  const interactiveDoorPassabilityKey = useInteractive((state) =>
    createLandrushIslandRuntimeDoorPassabilityKey(state.doors),
  )
  const interactiveDoorPassability = useMemo(
    () => resolveLandrushIslandRuntimeDoorPassabilityKey(interactiveDoorPassabilityKey),
    [interactiveDoorPassabilityKey],
  )
  const arena = useMemo(
    () => createIntegratedZombieEscapeArena(surfacePoints, spawn),
    [spawn, surfacePoints],
  )
  const palmLayout = useMemo(
    () =>
      createLandrushIslandPalmLayout({
        center: resolveLandrushIslandPalmLayoutCenter(surfacePoints),
        shoreline: surfacePoints,
      }),
    [surfacePoints],
  )
  const palmCollisionCircles = useMemo(
    () => createLandrushIslandPalmCollisionCircles({ layout: palmLayout, origin: spawn }),
    [palmLayout, spawn],
  )
  const weaponPickupPlacements = useMemo(
    () =>
      translateZombieEscapeWeaponPickupPlacements(
        resolveZombieEscapeWeaponPickupPlacements(sceneNodes),
        spawn,
      ),
    [sceneNodes, spawn],
  )
  const collisionWorlds = useMemo(
    () =>
      resolveCollisionWorlds({
        agentRadius: ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRadius,
        circles: palmCollisionCircles,
        doorPassability: interactiveDoorPassability,
        nodes: sceneNodes,
        playRadius: arena.playRadius,
        spawn,
        verticalOriginY: groundY,
      }),
    [
      arena.playRadius,
      groundY,
      interactiveDoorPassability,
      palmCollisionCircles,
      resolveCollisionWorlds,
      sceneNodes,
      spawn,
    ],
  )
  const [simulation] = useState(() => {
    const state = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED)
    setZombieEscapeCollisionWorld(state, collisionWorlds.navigation, collisionWorlds.combat)
    setZombieEscapeExternalPlayerPose(state, true)
    return state
  })
  const simulationRef = useRef<ZombieEscapeSimulation>(simulation)
  const impactVisualRegistry = useMemo(() => createZombieEscapeImpactVisualRegistry(), [])
  const renderReadinessRegistry = useMemo(
    () =>
      createZombieEscapeRenderReadinessRegistry([
        ...getZombieEscapeRenderRepresentativeKeys('balanced'),
        LANDRUSH_ISLAND_MATERIAL_PRESENTATION_RENDER_REPRESENTATIVE_KEY,
      ]),
    [],
  )
  const combatStateRef = useRef(createLandrushRobotWeaponCombatState())
  const muzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())
  const controlsRef = useRef(createZombieEscapeControlState())
  const accumulatorRef = useRef(0)
  const phaseClockRef = useRef(createLandrushZombieEscapePhaseClock())
  const fireMouseRef = useRef(false)
  const gamepadInteractHeldRef = useRef(false)
  const gamepadRestartButtonStateRef = useRef(createLandrushZombieEscapeRestartButtonState())
  const interactPulseRef = useRef(false)
  const pointerRef = useRef({ initialized: false, ndcX: 0, ndcY: 0 })
  const pointerNdc = useMemo(() => new Vector2(), [])
  const pointerWorld = useMemo(() => new Vector3(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const aimPlane = useMemo(() => new Plane(new Vector3(0, 1, 0)), [])
  const cameraForward = useMemo(() => new Vector3(), [])
  const inputModeRef = useRef<'gamepad' | 'keyboard'>('keyboard')
  const [inputMode, setInputMode] = useState<'gamepad' | 'keyboard'>('keyboard')
  const [snapshot, setSnapshot] = useState<ZombieEscapeHudSnapshot>(() =>
    createZombieEscapeHudSnapshot(simulation),
  )
  const [generatedAssetFailures, setGeneratedAssetFailures] = useState<
    readonly ZombieEscapeGeneratedAssetFailure[]
  >([])
  const [generatedAssetRetryAttempt, setGeneratedAssetRetryAttempt] = useState(0)
  const [generatedAssetRetryGeneration, setGeneratedAssetRetryGeneration] = useState(0)
  const [generatedAssetsRetrying, setGeneratedAssetsRetrying] = useState(false)
  const snapshotAtRef = useRef(Number.NEGATIVE_INFINITY)
  const debugAtRef = useRef(Number.NEGATIVE_INFINITY)
  const frameMsRef = useRef(16.7)
  const publishedObstacleRevisionRef = useRef(simulation.obstacleRevision)
  const combatOwnsCanvasPointerEvents = shouldLandrushZombieEscapeOwnCanvasPointerEvents(
    active,
    expectedPhase,
  )

  const activateInputMode = useCallback((mode: 'gamepad' | 'keyboard') => {
    if (inputModeRef.current === mode) return
    inputModeRef.current = mode
    setInputMode(mode)
  }, [])

  const handleGeneratedAssetsReadyChange = useCallback(
    (ready: boolean) => {
      onGeneratedAssetsReadyChange?.(ready)
      if (!ready) return
      setGeneratedAssetFailures([])
      setGeneratedAssetRetryAttempt(0)
      setGeneratedAssetsRetrying(false)
    },
    [onGeneratedAssetsReadyChange],
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
      if (failures.length === 0) return
      setGeneratedAssetsRetrying(true)
      onGeneratedAssetsReadyChange?.(false)
      clearZombieEscapeGeneratedAssetCaches(failures.map((failure) => failure.key))
      setGeneratedAssetRetryGeneration((generation) => generation + 1)
    },
    [onGeneratedAssetsReadyChange],
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

  useLayoutEffect(() => {
    setZombieEscapeCollisionWorld(simulation, collisionWorlds.navigation, collisionWorlds.combat)
  }, [collisionWorlds, simulation])

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
    setSnapshot(
      createZombieEscapeHudSnapshot(
        simulation,
        gl.info.render.calls,
        gl.info.render.triangles,
        frameMsRef.current,
      ),
    )
  }, [gl, simulation])

  const runAgain = useCallback(() => {
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
    gamepadInteractHeldRef.current = false
    interactPulseRef.current = false
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
  ])

  useEffect(() => onPhaseChange(snapshot.phase), [onPhaseChange, snapshot.phase])
  useEffect(() => onStatusChange(snapshot.status), [onStatusChange, snapshot.status])

  useEffect(() => {
    if (!combatOwnsCanvasPointerEvents) return
    return acquireLandrushZombieEscapeCanvasPointerOwnership({
      getEnabled: () => get().events.enabled,
      setEnabled: (enabled) => setEvents({ enabled }),
    })
  }, [combatOwnsCanvasPointerEvents, get, setEvents])

  useEffect(() => {
    if (snapshot.phase !== 'build' || simulation.phase !== 'build') return
    setZombieEscapeWeaponPickupPlacements(simulation, weaponPickupPlacements)
  }, [simulation, snapshot.phase, weaponPickupPlacements])

  useEffect(() => {
    if (!active) {
      fireMouseRef.current = false
      gamepadInteractHeldRef.current = false
      interactPulseRef.current = false
      combatHeadingRef.current = null
      return
    }
    const canvas = gl.domElement
    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      pointerRef.current.ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointerRef.current.ndcY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      pointerRef.current.initialized = true
      activateInputMode('keyboard')
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.target !== canvas) return
      fireMouseRef.current = true
      updatePointer(event)
      canvas.focus()
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 0) fireMouseRef.current = false
    }
    const clearFire = () => {
      fireMouseRef.current = false
      interactPulseRef.current = false
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyE' ||
        event.defaultPrevented ||
        event.repeat ||
        isZombieEscapeEditableTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      activateInputMode('keyboard')
      interactPulseRef.current = true
    }

    canvas.addEventListener('pointermove', updatePointer)
    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('blur', clearFire)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      canvas.removeEventListener('pointermove', updatePointer)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('blur', clearFire)
      window.removeEventListener('keydown', handleKeyDown, true)
      fireMouseRef.current = false
      gamepadInteractHeldRef.current = false
      interactPulseRef.current = false
      combatHeadingRef.current = null
    }
  }, [activateInputMode, active, combatHeadingRef, gl])

  useEffect(
    () => () => {
      combatHeadingRef.current = null
      restoreZombieEscapeDefaultMuzzlePose(simulation)
      delete window.__LANDRUSH_ZOMBIE_ESCAPE__
    },
    [combatHeadingRef, simulation],
  )

  useFrame(() => {
    if (!active) return
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
    if (gamepadActive) activateInputMode('gamepad')
    let aimX = Math.sin(simulation.player.aimAngle)
    let aimZ = Math.cos(simulation.player.aimAngle)
    let aimStrength = 0

    camera.getWorldDirection(cameraForward)
    cameraForward.y = 0
    if (cameraForward.lengthSq() <= 0.000_001) cameraForward.set(0, 0, -1)
    else cameraForward.normalize()

    if (gamepad && gamepad.lookStrength > 0.08) {
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
    } else if (pointerRef.current.initialized) {
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
    controls.fire = fireMouseRef.current || isZombieEscapeGamepadFirePressed(gamepad)
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

    syncIntegratedPlayerPose(simulation, motion, groundY, spawn)
    if (aimStrength > 0.001) simulation.player.aimAngle = Math.atan2(aimX, aimZ)
    combatHeadingRef.current = simulation.player.aimAngle
    combatStateRef.current.aimAngle = simulation.player.aimAngle
    combatStateRef.current.meleePhase = simulation.player.meleePhase
    combatStateRef.current.meleeProgress = getZombieEscapeMeleeProgress(simulation.player)
    combatStateRef.current.movementHeading = motion.heading
    combatStateRef.current.weaponIndex = simulation.player.weaponIndex
  }, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.input)

  useFrame((state, delta) => {
    const motion = motionRef.current
    if (motion) syncIntegratedPlayerPose(simulation, motion, groundY, spawn)
    const phaseClockAdvance = advanceLandrushZombieEscapePhaseClock({
      authorityNowSeconds: state.clock.elapsedTime,
      clock: phaseClockRef.current,
      expectedPhase,
      phaseReady: phaseReady && motion !== null,
      simulation,
    })
    if (!motion) return

    const frameDelta = Math.min(
      ZOMBIE_ESCAPE_SIMULATION.maximumFrameDeltaSeconds,
      Math.max(0, delta),
    )
    frameMsRef.current += (frameDelta * 1000 - frameMsRef.current) * 0.08
    const controls = controlsRef.current
    const phaseCanAdvance = canAdvanceLandrushZombieEscapeIntegratedSimulation({
      expectedPhase,
      phaseReady,
      simulation,
    })
    if (phaseClockAdvance.phaseChanged) {
      accumulatorRef.current = 0
      publishDestroyedFurnitureIds()
      snapshotAtRef.current = state.clock.elapsedTime
      publishSnapshot()
    }
    if (!active) {
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
    if (active && muzzlePose.ready) {
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
    controls.fire = active && controls.fire && muzzlePose.ready
    controls.interactPressed = active && interactPulseRef.current

    if (!phaseCanAdvance) {
      accumulatorRef.current = 0
      controls.fire = false
      controls.interactPressed = false
      fireMouseRef.current = false
      interactPulseRef.current = false
    } else if (!simulation.paused && simulation.status === 'playing') {
      accumulatorRef.current = Math.min(
        accumulatorRef.current + frameDelta,
        ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds * ZOMBIE_ESCAPE_SIMULATION.maximumSubsteps,
      )
      let substeps = 0
      while (
        accumulatorRef.current >= ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds &&
        substeps < ZOMBIE_ESCAPE_SIMULATION.maximumSubsteps
      ) {
        syncIntegratedPlayerPose(simulation, motion, groundY, spawn)
        const outcome = stepLandrushZombieEscapeIntegratedSimulation({
          arena,
          deltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
          expectedPhase,
          input: controls,
          phaseReady,
          simulation,
        })
        controls.interactPressed = false
        interactPulseRef.current = false
        publishDestroyedFurnitureIds()
        if (outcome.terminal || outcome.phaseChanged) {
          if (outcome.terminal) onStatusChange(simulation.status)
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
        syncIntegratedPlayerPose(simulation, motion, groundY, spawn)
        accumulatorRef.current -= ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
        substeps += 1
      }
    } else {
      accumulatorRef.current = 0
    }

    combatStateRef.current.recoil = resolveIntegratedWeaponRecoil(simulation)
    combatStateRef.current.meleePhase = simulation.player.meleePhase
    combatStateRef.current.meleeProgress = getZombieEscapeMeleeProgress(simulation.player)
    combatStateRef.current.movementHeading = motion.heading
    combatStateRef.current.weaponIndex = simulation.player.weaponIndex

    if (state.clock.elapsedTime - snapshotAtRef.current >= 0.1) {
      snapshotAtRef.current = state.clock.elapsedTime
      publishSnapshot()
    }
    if (state.clock.elapsedTime - debugAtRef.current >= 0.25) {
      debugAtRef.current = state.clock.elapsedTime
      publishIntegratedDebugState({
        arena,
        expectedPhase,
        groundY,
        muzzlePose: muzzlePoseRef.current,
        phaseReady,
        simulation,
        spawn,
      })
    }
    renderScheduler.requestFrame('animation')
  }, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.simulation)

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
          impactVisualRegistry={impactVisualRegistry}
          onGeneratedAssetsFailureChange={handleGeneratedAssetsFailureChange}
          onGeneratedAssetsReadyChange={handleGeneratedAssetsReadyChange}
          presentationFramePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.presentation}
          playerColor={playerColor}
          quality="balanced"
          renderReadinessRegistry={renderReadinessRegistry}
          renderPlayer={false}
          retryGeneratedAssetsGeneration={generatedAssetRetryGeneration}
          simulationRef={simulationRef}
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
      <Suspense fallback={null}>
        <LandrushRobotWeaponRig
          active={active}
          combatStateRef={combatStateRef}
          framePriority={LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.weapon}
          muzzlePoseRef={muzzlePoseRef}
          renderReadinessRegistry={renderReadinessRegistry}
          visualRootRef={visualRootRef}
        />
      </Suspense>
      <LandrushZombieEscapeHudPortal
        expectedPhase={expectedPhase}
        generatedAssetFailureCount={generatedAssetFailures.length}
        generatedAssetsRetrying={generatedAssetsRetrying}
        inputMode={inputMode}
        onRetryGeneratedAssets={retryGeneratedAssets}
        onRunAgain={runAgain}
        ownerDocument={gl.domElement.ownerDocument}
        phaseReady={phaseReady}
        snapshot={snapshot}
      />
    </>
  )
}

type LandrushZombieEscapeHudProps = {
  expectedPhase: ZombieEscapeGamePhase
  generatedAssetFailureCount: number
  generatedAssetsRetrying: boolean
  inputMode: 'gamepad' | 'keyboard'
  onRetryGeneratedAssets: () => void
  onRunAgain: () => void
  phaseReady: boolean
  snapshot: ZombieEscapeHudSnapshot
}

function LandrushZombieEscapeHudPortal({
  expectedPhase,
  generatedAssetFailureCount,
  generatedAssetsRetrying,
  inputMode,
  onRetryGeneratedAssets,
  onRunAgain,
  ownerDocument,
  phaseReady,
  snapshot,
}: LandrushZombieEscapeHudProps & { ownerDocument: Document }) {
  const ownerRef = useRef(Symbol('landrush-zombie-escape-hud'))
  const rootRef = useRef<Root | null>(null)

  useEffect(() => {
    const targetWindow = ownerDocument.defaultView
    if (!targetWindow) return

    targetWindow.__LANDRUSH_ZOMBIE_ESCAPE_HUD_PORTAL__?.release()
    for (const staleContainer of ownerDocument.querySelectorAll(
      '[data-landrush-zombie-escape-hud-portal="true"]',
    )) {
      staleContainer.remove()
    }

    const container = ownerDocument.createElement('div')
    container.dataset.landrushZombieEscapeHudPortal = 'true'
    container.style.inset = '0'
    container.style.pointerEvents = 'none'
    container.style.position = 'fixed'
    container.style.zIndex = '120'
    ownerDocument.body.appendChild(container)

    const root = createRoot(container)
    const owner = ownerRef.current
    let released = false
    const release = () => {
      if (released) return
      released = true
      if (rootRef.current === root) rootRef.current = null
      root.unmount()
      container.remove()
    }
    rootRef.current = root
    targetWindow.__LANDRUSH_ZOMBIE_ESCAPE_HUD_PORTAL__ = { container, owner, release }
    return () => {
      if (targetWindow.__LANDRUSH_ZOMBIE_ESCAPE_HUD_PORTAL__?.owner !== owner) return
      delete targetWindow.__LANDRUSH_ZOMBIE_ESCAPE_HUD_PORTAL__
      release()
    }
  }, [ownerDocument])

  useEffect(() => {
    rootRef.current?.render(
      <LandrushZombieEscapeHud
        expectedPhase={expectedPhase}
        generatedAssetFailureCount={generatedAssetFailureCount}
        generatedAssetsRetrying={generatedAssetsRetrying}
        inputMode={inputMode}
        onRetryGeneratedAssets={onRetryGeneratedAssets}
        onRunAgain={onRunAgain}
        phaseReady={phaseReady}
        snapshot={snapshot}
      />,
    )
  }, [
    expectedPhase,
    generatedAssetFailureCount,
    generatedAssetsRetrying,
    inputMode,
    onRetryGeneratedAssets,
    onRunAgain,
    phaseReady,
    snapshot,
  ])

  return null
}

function LandrushZombieEscapeHud({
  expectedPhase,
  generatedAssetFailureCount,
  generatedAssetsRetrying,
  inputMode,
  onRetryGeneratedAssets,
  onRunAgain,
  phaseReady,
  snapshot,
}: LandrushZombieEscapeHudProps) {
  const phase = snapshot.phase === 'night' ? 'night' : 'build'
  const phaseSecondsRemaining = Number.isFinite(snapshot.phaseSecondsRemaining)
    ? Math.max(0, snapshot.phaseSecondsRemaining)
    : 0
  const pickupPrompt = snapshot.pickupPrompt
  const health = Math.max(0, Math.min(100, snapshot.health))
  const terminal = snapshot.status !== 'playing'
  const moneyVisible = shouldShowLandrushZombieEscapeMoney({
    actualPhase: snapshot.phase,
    expectedPhase,
    phaseReady,
  })
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 select-none text-white"
      data-actual-avatar="/navigation/proto_pascal_robot.glb"
      data-expected-phase={expectedPhase}
      data-integrated-landrush-world="true"
      data-phase={phase}
      data-phase-ready={phaseReady ? 'true' : 'false'}
      data-phase-seconds-remaining={Math.ceil(phaseSecondsRemaining)}
      data-shot-carriers-per-event="1"
      data-testid="landrush-zombie-escape-hud"
    >
      {moneyVisible ? (
        <ZombieEscapeMoneyBadge className="absolute top-4 left-4" money={snapshot.money} />
      ) : null}
      {phase === 'build' ? (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/58 px-3 py-1.5 font-medium text-[11px] text-white/90 shadow-lg backdrop-blur-md"
          data-testid="landrush-zombie-escape-build-countdown"
        >
          Day · {formatZombieEscapePhaseTime(phaseSecondsRemaining)}
        </div>
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
      {pickupPrompt ? (
        <div
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/52 px-3 py-2 text-[11px] text-white/92 shadow-lg backdrop-blur-sm"
          data-testid="landrush-zombie-escape-pickup-prompt"
        >
          <kbd className="grid size-6 place-items-center rounded-full bg-white text-[11px] text-slate-950">
            {inputMode === 'gamepad' ? '□' : 'E'}
          </kbd>
          <span>
            {pickupPrompt.affordable ? 'Buy' : 'Need'} {pickupPrompt.displayName} · $
            {pickupPrompt.cost}
          </span>
        </div>
      ) : null}
      {generatedAssetFailureCount > 0 || generatedAssetsRetrying ? (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-slate-950/24 backdrop-blur-[2px]">
          <section className="mx-4 w-[min(430px,calc(100vw-2rem))] rounded-3xl border border-white/18 bg-slate-950/88 p-7 text-center shadow-2xl">
            <p className="font-black text-amber-200 text-xs uppercase tracking-[0.28em]">
              Zombie assets unavailable
            </p>
            <h1 className="mt-3 font-black text-2xl">
              {generatedAssetsRetrying
                ? 'Retrying the missing assets…'
                : 'Some models failed to load.'}
            </h1>
            <p className="mt-3 text-sm text-white/65">
              The island remains visible while the required combat assets recover.
            </p>
            <button
              className="mt-6 rounded-xl border border-white/18 bg-white/10 px-4 py-2 font-semibold text-sm text-white transition enabled:hover:border-white/35 enabled:hover:bg-white/16 disabled:cursor-wait disabled:opacity-55"
              data-testid="landrush-zombie-escape-retry-assets"
              disabled={generatedAssetsRetrying}
              onClick={onRetryGeneratedAssets}
              type="button"
            >
              {generatedAssetsRetrying ? 'Retrying…' : 'Retry assets'}
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
            <button
              className="mt-6 rounded-xl border border-white/18 bg-white/10 px-4 py-2 font-semibold text-sm text-white transition hover:border-white/35 hover:bg-white/16"
              data-testid="landrush-zombie-escape-run-again"
              onClick={onRunAgain}
              type="button"
            >
              {inputMode === 'gamepad' ? '△ / Y Run again' : 'Run again'}
            </button>
          </section>
        </div>
      ) : null}
    </div>
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

function formatZombieEscapePhaseTime(seconds: number) {
  const roundedSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  return `${String(minutes)}:${String(roundedSeconds % 60).padStart(2, '0')}`
}

function isZombieEscapeEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA')
  )
}

function createIntegratedZombieEscapeArena(
  surfacePoints: readonly Readonly<{ x: number; z: number }>[],
  spawn: Readonly<{ x: number; z: number }>,
): ZombieEscapeArenaData {
  const arena = createZombieEscapeArena(ZOMBIE_ESCAPE_SEED)
  const edgeDistance = minimumDistanceToPolygonEdges(spawn, surfacePoints)
  const playRadius = Math.max(14, Math.min(48, edgeDistance - 1.5))
  return {
    ...arena,
    escapeX: 0,
    escapeZ: -Math.max(10, playRadius - 2),
    obstacleCount: 0,
    playerStartX: 0,
    playerStartZ: 0,
    playRadius,
    radius: playRadius + 3,
  }
}

function minimumDistanceToPolygonEdges(
  point: Readonly<{ x: number; z: number }>,
  polygon: readonly Readonly<{ x: number; z: number }>[],
) {
  if (polygon.length < 2) return 32
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!(start && end)) continue
    const edgeX = end.x - start.x
    const edgeZ = end.z - start.z
    const lengthSquared = edgeX * edgeX + edgeZ * edgeZ
    const amount =
      lengthSquared <= 0.000_001
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * edgeX + (point.z - start.z) * edgeZ) / lengthSquared,
            ),
          )
    minimum = Math.min(
      minimum,
      Math.hypot(point.x - (start.x + edgeX * amount), point.z - (start.z + edgeZ * amount)),
    )
  }
  return Number.isFinite(minimum) ? minimum : 32
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

function resolveIntegratedWeaponRecoil(simulation: ZombieEscapeSimulation) {
  const slot = simulation.lastShotSlot
  if (slot < 0 || simulation.shots.pool.active[slot] === 0) return 0
  if (simulation.shots.pool.generation[slot] !== simulation.lastShotGeneration) return 0
  const age = simulation.shots.travelAge[slot]! + simulation.shots.impactAge[slot]!
  return Math.max(0, 1 - age / RECOIL_DURATION_SECONDS)
}

function publishIntegratedDebugState({
  arena,
  expectedPhase,
  groundY,
  muzzlePose,
  phaseReady,
  simulation,
  spawn,
}: {
  arena: ZombieEscapeArenaData
  expectedPhase: ZombieEscapeGamePhase
  groundY: number
  muzzlePose: ReturnType<typeof createLandrushRobotWeaponMuzzlePose>
  phaseReady: boolean
  simulation: ZombieEscapeSimulation
  spawn: Readonly<{ x: number; z: number }>
}) {
  let reactingEnemies = 0
  for (let slot = 0; slot < simulation.zombies.pool.capacity; slot += 1) {
    if (
      simulation.zombies.pool.active[slot] !== 0 &&
      (simulation.zombies.hitFlash[slot]! > 0 || simulation.zombies.hitReaction[slot]! > 0)
    ) {
      reactingEnemies += 1
    }
  }
  const lastShotSlot = simulation.lastShotSlot
  const lastShot =
    lastShotSlot >= 0 &&
    simulation.shots.pool.generation[lastShotSlot] === simulation.lastShotGeneration
      ? {
          currentWorld: [
            simulation.shots.x[lastShotSlot]! + spawn.x,
            simulation.shots.y[lastShotSlot]! + groundY,
            simulation.shots.z[lastShotSlot]! + spawn.z,
          ],
          generation: simulation.lastShotGeneration,
          hitWorld: [
            simulation.shots.hitX[lastShotSlot]! + spawn.x,
            simulation.shots.hitY[lastShotSlot]! + groundY,
            simulation.shots.hitZ[lastShotSlot]! + spawn.z,
          ],
          impactKind: simulation.shots.impactKind[lastShotSlot],
          originWorld: [
            simulation.shots.originX[lastShotSlot]! + spawn.x,
            simulation.shots.originY[lastShotSlot]! + groundY,
            simulation.shots.originZ[lastShotSlot]! + spawn.z,
          ],
          phase: simulation.shots.phase[lastShotSlot],
          slot: lastShotSlot,
        }
      : null
  window.__LANDRUSH_ZOMBIE_ESCAPE__ = {
    actualAvatar: '/navigation/proto_pascal_robot.glb',
    arena: { playRadius: arena.playRadius, worldOrigin: [spawn.x, groundY, spawn.z] },
    frameOrder: LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER,
    integratedIntoExistingCanvas: true,
    economy: {
      ammo: simulation.player.ammo,
      money: simulation.money,
      purchasedWeapons: Array.from(simulation.purchasedWeapons),
    },
    expectedPhase,
    lastShot,
    muzzle: muzzlePose.ready
      ? {
          direction: muzzlePose.direction.toArray(),
          position: muzzlePose.position.toArray(),
          ready: true,
        }
      : { ready: false },
    shots: {
      active: simulation.shots.pool.activeCount,
      impact: countZombieEscapeShotsByPhase(simulation.shots, ZOMBIE_ESCAPE_SHOT_PHASE.impact),
      oneAuthoritativeCarrierPerShot: true,
      shotsFired: simulation.shotsFired,
      travel: countZombieEscapeShotsByPhase(simulation.shots, ZOMBIE_ESCAPE_SHOT_PHASE.travel),
    },
    phase: simulation.phase,
    phaseReady,
    phaseSecondsRemaining: simulation.phaseSecondsRemaining,
    night: simulation.night,
    pickups: simulation.weaponPickups.map((pickup) => ({
      available: simulation.purchasedWeapons[pickup.weaponIndex] === 0,
      scopeId: pickup.scopeId,
      weapon: ZOMBIE_ESCAPE_WEAPON_CATALOG[pickup.weaponIndex]?.id ?? null,
      world: [pickup.x + spawn.x, pickup.y + groundY, pickup.z + spawn.z],
    })),
    status: simulation.status,
    targets: {
      active: simulation.zombies.pool.activeCount,
      reacting: reactingEnemies,
    },
    weapon: ZOMBIE_ESCAPE_WEAPON_CATALOG[simulation.player.weaponIndex]?.id ?? null,
  }
}
