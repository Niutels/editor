'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  Matrix4,
  NoToneMapping,
  type PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { readLandrushGamepadInput } from './landrush-gamepad-input'
import { ZombieEscapeActors } from './zombie-escape-actors'
import { ZombieEscapeArena } from './zombie-escape-arena'
import {
  deriveZombieEscapeCameraRig,
  ZOMBIE_ESCAPE_SEED,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_VISUAL_CONTRACT,
  type ZombieEscapeInputMode,
  type ZombieEscapeQuality,
} from './zombie-escape-config'
import {
  createZombieEscapeControlLatch,
  createZombieEscapeControlState,
  readZombieEscapeGamepadMetaInto,
  resolveZombieEscapeControlsInto,
  type ZombieEscapeGamepadMeta,
  type ZombieEscapeRawControls,
} from './zombie-escape-controls'
import { ZombieEscapeEffects } from './zombie-escape-effects'
import {
  createZombieEscapeHudSnapshot,
  createZombieEscapeSimulation,
  cycleZombieEscapeCameraBookmark,
  cycleZombieEscapeDebugMode,
  cycleZombieEscapeOwnedWeapon,
  resetZombieEscapeSimulation,
  stepZombieEscapeSimulation,
  type ZombieEscapeHudSnapshot,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import {
  createZombieEscapeWeaponSwitchInputState,
  readZombieEscapeShoulderWeaponSwitch,
  readZombieEscapeWheelWeaponSwitch,
  resetZombieEscapeWeaponSwitchInput,
} from './zombie-escape-weapon-switch-input'
import type { ZombieEscapeArenaData } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

declare global {
  interface Window {
    __ZOMBIE_ESCAPE_DEBUG__?: unknown
  }
}

export type ZombieEscapeSceneApi = {
  cycleCamera: () => void
  cycleDebug: () => void
  reset: () => void
  togglePause: () => void
}

export function ZombieEscapeScene({
  apiRef,
  arena,
  onHudSnapshot,
  onInputModeChange,
  onQualityToggle,
  quality,
}: {
  apiRef: MutableRefObject<ZombieEscapeSceneApi | null>
  arena: ZombieEscapeArenaData
  onHudSnapshot: (snapshot: ZombieEscapeHudSnapshot) => void
  onInputModeChange: (mode: ZombieEscapeInputMode) => void
  onQualityToggle: () => void
  quality: ZombieEscapeQuality
}) {
  const { camera, gl } = useThree()
  const [simulation] = useState(() => createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED))
  const simulationRef = useRef<ZombieEscapeSimulation>(simulation)
  const impactVisualRegistry = useMemo(() => createZombieEscapeImpactVisualRegistry(), [])
  const keysRef = useRef(new Set<string>())
  const pointerRef = useRef({
    activeAtMs: Number.NEGATIVE_INFINITY,
    initialized: false,
    ndcX: 0,
    ndcY: 0,
  })
  const fireMouseRef = useRef(false)
  const firePulseRef = useRef(false)
  const rawControlsRef = useRef<ZombieEscapeRawControls>({
    fireMouse: false,
    gamepad: null,
    gamepadMeta: { menu: false, view: false },
    keys: keysRef.current,
    pointerActive: false,
    pointerAimStrength: 0,
    pointerAimX: 0,
    pointerAimZ: -1,
    viewForwardX: 0,
    viewForwardZ: -1,
  })
  const gamepadMetaRef = useRef<ZombieEscapeGamepadMeta>({ menu: false, view: false })
  const weaponSwitchInputStateRef = useRef(createZombieEscapeWeaponSwitchInputState())
  const controlLatchRef = useRef(createZombieEscapeControlLatch())
  const controlsRef = useRef(createZombieEscapeControlState())
  const accumulatorRef = useRef(0)
  const inputModeRef = useRef<ZombieEscapeInputMode>('keyboard')
  const snapshotAtRef = useRef(Number.NEGATIVE_INFINITY)
  const debugPublishAtRef = useRef(Number.NEGATIVE_INFINITY)
  const frameMsRef = useRef(16.7)
  const raycaster = useMemo(() => new Raycaster(), [])
  const pointerNdc = useMemo(() => new Vector2(), [])
  const groundPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), -0.05), [])
  const pointerWorld = useMemo(() => new Vector3(), [])
  const cameraForward = useMemo(() => new Vector3(), [])

  const activateInputMode = useCallback(
    (mode: ZombieEscapeInputMode) => {
      controlLatchRef.current.inputMode = mode
      if (inputModeRef.current === mode) return
      inputModeRef.current = mode
      onInputModeChange(mode)
    },
    [onInputModeChange],
  )

  const publishSnapshot = useCallback(() => {
    onHudSnapshot(
      createZombieEscapeHudSnapshot(
        simulation,
        gl.info.render.calls,
        gl.info.render.triangles,
        frameMsRef.current,
      ),
    )
  }, [gl, onHudSnapshot, simulation])

  const cycleOwnedWeapon = useCallback(
    (direction: -1 | 1) => {
      if (simulation.phase !== 'night' || simulation.status !== 'playing') return
      if (!cycleZombieEscapeOwnedWeapon(simulation, direction)) return
      publishSnapshot()
    },
    [publishSnapshot, simulation],
  )

  useEffect(() => {
    const api: ZombieEscapeSceneApi = {
      cycleCamera: () => {
        cycleZombieEscapeCameraBookmark(simulation)
        publishSnapshot()
      },
      cycleDebug: () => {
        cycleZombieEscapeDebugMode(simulation)
        publishSnapshot()
      },
      reset: () => {
        accumulatorRef.current = 0
        resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
        resetZombieEscapeSimulation(simulation, arena)
        publishSnapshot()
      },
      togglePause: () => {
        if (simulation.status === 'playing') simulation.paused = !simulation.paused
        publishSnapshot()
      },
    }
    apiRef.current = api
    return () => {
      if (apiRef.current === api) apiRef.current = null
    }
  }, [apiRef, arena, publishSnapshot, simulation])

  useEffect(() => {
    const canvas = gl.domElement
    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      pointerRef.current.ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointerRef.current.ndcY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      pointerRef.current.initialized = true
      pointerRef.current.activeAtMs = performance.now()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      fireMouseRef.current = true
      firePulseRef.current = true
      updatePointer(event)
      canvas.focus()
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 0) fireMouseRef.current = false
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      keysRef.current.add(event.code)
      if (event.code === 'Space' && !event.repeat) firePulseRef.current = true
      if (
        event.code === 'Space' ||
        event.code === 'F1' ||
        event.code === 'ArrowUp' ||
        event.code === 'ArrowDown' ||
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight'
      ) {
        event.preventDefault()
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code)
    }
    const clearInput = () => {
      keysRef.current.clear()
      fireMouseRef.current = false
      firePulseRef.current = false
      resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.target !== canvas) return
      event.preventDefault()
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
    const preventContextMenu = (event: MouseEvent) => event.preventDefault()

    canvas.tabIndex = 0
    canvas.addEventListener('pointermove', updatePointer)
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('contextmenu', preventContextMenu)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', clearInput)
    return () => {
      canvas.removeEventListener('pointermove', updatePointer)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('contextmenu', preventContextMenu)
      canvas.removeEventListener('wheel', handleWheel)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearInput)
    }
  }, [activateInputMode, cycleOwnedWeapon, gl])

  useFrame((state, frameDelta) => {
    const raw = rawControlsRef.current
    const pointer = pointerRef.current
    raw.fireMouse = fireMouseRef.current || firePulseRef.current
    const gamepad = readLandrushGamepadInput()
    raw.gamepad = gamepad
    const weaponSwitchDirection = readZombieEscapeShoulderWeaponSwitch(
      weaponSwitchInputStateRef.current,
      Boolean(gamepad?.leftShoulder),
      Boolean(gamepad?.rightShoulder),
    )
    if (weaponSwitchDirection !== 0) {
      activateInputMode('gamepad')
      cycleOwnedWeapon(weaponSwitchDirection)
    }
    raw.gamepadMeta = readZombieEscapeGamepadMetaInto(gamepadMetaRef.current)
    raw.pointerActive = performance.now() - pointer.activeAtMs < 450
    camera.getWorldDirection(cameraForward)
    cameraForward.y = 0
    if (cameraForward.lengthSq() > 0.000_001) cameraForward.normalize()
    raw.viewForwardX = cameraForward.x
    raw.viewForwardZ = cameraForward.z
    raw.pointerAimStrength = 0
    if (pointer.initialized) {
      pointerNdc.set(pointer.ndcX, pointer.ndcY)
      raycaster.setFromCamera(pointerNdc, camera)
      if (raycaster.ray.intersectPlane(groundPlane, pointerWorld)) {
        raw.pointerAimX = pointerWorld.x - simulation.player.x
        raw.pointerAimZ = pointerWorld.z - simulation.player.z
        raw.pointerAimStrength = 1
      }
    }

    const controls = controlsRef.current
    resolveZombieEscapeControlsInto(raw, controlLatchRef.current, controls)
    activateInputMode(controls.inputMode)
    if (controls.pausePressed && simulation.status === 'playing') {
      simulation.paused = !simulation.paused
      accumulatorRef.current = 0
    }
    if (controls.resetPressed) {
      resetZombieEscapeWeaponSwitchInput(weaponSwitchInputStateRef.current)
      resetZombieEscapeSimulation(simulation, arena)
      accumulatorRef.current = 0
    }
    if (controls.debugPressed) cycleZombieEscapeDebugMode(simulation)
    if (controls.cameraPressed) cycleZombieEscapeCameraBookmark(simulation)
    if (controls.qualityPressed) onQualityToggle()

    const clampedDelta = Math.min(
      ZOMBIE_ESCAPE_SIMULATION.maximumFrameDeltaSeconds,
      Math.max(0, frameDelta),
    )
    frameMsRef.current += (clampedDelta * 1000 - frameMsRef.current) * 0.08
    if (!simulation.paused && simulation.status === 'playing') {
      accumulatorRef.current = Math.min(
        accumulatorRef.current + clampedDelta,
        ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds * ZOMBIE_ESCAPE_SIMULATION.maximumSubsteps,
      )
      let substeps = 0
      while (
        accumulatorRef.current >= ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds &&
        substeps < ZOMBIE_ESCAPE_SIMULATION.maximumSubsteps
      ) {
        stepZombieEscapeSimulation(
          simulation,
          controls,
          ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
          arena,
        )
        accumulatorRef.current -= ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
        substeps += 1
      }
      if (substeps > 0) firePulseRef.current = false
    } else {
      accumulatorRef.current = 0
      firePulseRef.current = false
    }

    if (state.clock.elapsedTime - snapshotAtRef.current >= 0.1) {
      snapshotAtRef.current = state.clock.elapsedTime
      publishSnapshot()
    }
    if (state.clock.elapsedTime - debugPublishAtRef.current >= 0.5) {
      debugPublishAtRef.current = state.clock.elapsedTime
      const equippedWeapon =
        ZOMBIE_ESCAPE_WEAPON_CATALOG[simulation.player.weaponIndex] ??
        ZOMBIE_ESCAPE_WEAPON_CATALOG[0]
      window.__ZOMBIE_ESCAPE_DEBUG__ = {
        assets: {
          equippedWeapon: equippedWeapon?.assetPath ?? null,
          weapons: ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon) => weapon.assetPath),
          zombies: ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie) => ({
            id: zombie.id,
            rigged: zombie.glb.riggedBase.path,
            run: zombie.glb.run.path,
            walk: zombie.glb.walk.path,
          })),
        },
        backend: gl.capabilities.isWebGL2 ? 'webgl2' : 'webgl1',
        cameraBookmark: simulation.cameraBookmark,
        debugMode: simulation.debugMode,
        fixedDeltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
        frameBudgetMs: ZOMBIE_ESCAPE_VISUAL_CONTRACT.frameBudgetMs,
        gpuFrameMs: null,
        pools: {
          impacts: simulation.impacts.pool.activeCount,
          projectiles: simulation.projectiles.pool.activeCount,
          tracers: simulation.tracers.pool.activeCount,
          zombies: simulation.zombies.pool.activeCount,
        },
        postProcessRenderTargets: 0,
        quality,
        render: {
          calls: gl.info.render.calls,
          frameMs: Number(frameMsRef.current.toFixed(2)),
          triangles: gl.info.render.triangles,
        },
        seed: simulation.seed,
        visualContract: ZOMBIE_ESCAPE_VISUAL_CONTRACT,
      }
    }
  }, -30)

  useEffect(() => {
    window.__ZOMBIE_ESCAPE_DEBUG__ = {
      initializing: true,
      seed: simulation.seed,
    }
    return () => {
      delete window.__ZOMBIE_ESCAPE_DEBUG__
    }
  }, [simulation.seed])

  return (
    <>
      <ZombieEscapePresentation simulationRef={simulationRef} />
      <hemisphereLight color="#fff1c9" groundColor="#1b5263" intensity={2.2} />
      <directionalLight color="#ffe0a5" intensity={3.2} position={[12, 22, 9]} />
      <ambientLight color="#a8d9de" intensity={0.52} />
      <ZombieEscapeArena arena={arena} simulationRef={simulationRef} />
      <ZombieEscapeActors
        impactVisualRegistry={impactVisualRegistry}
        quality={quality}
        simulationRef={simulationRef}
      />
      <ZombieEscapeEffects
        impactVisualRegistry={impactVisualRegistry}
        simulationRef={simulationRef}
      />
      <ZombieEscapeCamera arena={arena} simulationRef={simulationRef} />
      <ZombieEscapeRenderDriver />
    </>
  )
}

function ZombieEscapeRenderDriver() {
  useFrame(({ camera, gl, scene }) => {
    gl.render(scene, camera)
  }, 100)
  return null
}

function ZombieEscapePresentation({
  simulationRef,
}: {
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const { gl, scene } = useThree()
  const finalBackground = useMemo(() => new Color('#2b88a1'), [])
  const baselineBackground = useMemo(() => new Color('#356f7b'), [])
  const fog = useMemo(() => new Fog('#2b88a1', 35, 95), [])
  const previousModeRef = useRef<string | null>(null)

  useEffect(() => {
    const previousBackground = scene.background
    const previousFog = scene.fog
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure
    return () => {
      scene.background = previousBackground
      scene.fog = previousFog
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
    }
  }, [gl, scene])

  useFrame(() => {
    const mode = simulationRef.current.debugMode
    if (previousModeRef.current === mode) return
    previousModeRef.current = mode
    const noPost = mode === 'no-post'
    scene.background = noPost ? baselineBackground : finalBackground
    scene.fog = noPost ? null : fog
    gl.toneMapping = noPost ? NoToneMapping : ACESFilmicToneMapping
    gl.toneMappingExposure = noPost ? 1 : 1.05
  }, -40)

  return null
}

function ZombieEscapeCamera({
  arena,
  simulationRef,
}: {
  arena: ZombieEscapeArenaData
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const cameraRigs = useMemo(
    () => ({
      design: deriveZombieEscapeCameraRig('design', arena.radius),
      far: deriveZombieEscapeCameraRig('far', arena.radius),
      near: deriveZombieEscapeCameraRig('near', arena.radius),
    }),
    [arena.radius],
  )
  const desiredPosition = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const up = useMemo(() => new Vector3(0, 1, 0), [])
  const lookMatrix = useMemo(() => new Matrix4(), [])
  const desiredQuaternion = useMemo(() => new Quaternion(), [])
  const previousBookmarkRef = useRef<string | null>(null)

  useFrame((_, delta) => {
    const simulation = simulationRef.current
    const rig = cameraRigs[simulation.cameraBookmark]
    if (previousBookmarkRef.current !== simulation.cameraBookmark) {
      previousBookmarkRef.current = simulation.cameraBookmark
      camera.fov = rig.fov
      camera.near = rig.near
      camera.far = rig.far
      camera.updateProjectionMatrix()
    }
    desiredPosition.set(
      simulation.player.x + rig.offsetX,
      rig.offsetY,
      simulation.player.z + rig.offsetZ,
    )
    target.set(
      simulation.player.x + Math.sin(simulation.player.aimAngle) * 0.85,
      0.95,
      simulation.player.z + Math.cos(simulation.player.aimAngle) * 0.85,
    )
    lookMatrix.lookAt(desiredPosition, target, up)
    desiredQuaternion.setFromRotationMatrix(lookMatrix)
    const response = 1 - Math.exp(-rig.followResponse * Math.min(delta, 0.05))
    camera.position.lerp(desiredPosition, response)
    camera.quaternion.slerp(desiredQuaternion, response)
    camera.updateMatrixWorld()
  }, -10)

  return null
}
