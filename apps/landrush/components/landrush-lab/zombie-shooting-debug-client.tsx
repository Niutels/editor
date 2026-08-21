'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AnimationMixer,
  Box3,
  Color,
  DynamicDrawUsage,
  type Group,
  type InstancedMesh,
  LoopRepeat,
  type Material,
  MathUtils,
  type Mesh,
  NoToneMapping,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  createLandrushRobotWeaponMuzzlePose,
  type LandrushRobotWeaponMuzzlePose,
} from './landrush-robot-weapon-rig'
import { WeaponFitSubject } from './weapon-fit-debug-rig'
import type {
  WeaponAssetDiagnostic,
  WeaponFitDebugDiagnostics,
  WeaponFitDebugSettings,
} from './weapon-fit-debug-state'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

type CameraBookmark = 'design' | 'far' | 'near'
type ViewMode = 'diagnostic' | 'final' | 'no-post'

type TimelineState = {
  deltaSeconds: number
  elapsedSeconds: number
}

type DebugMetrics = {
  activeEffectSlots: number
  drawCalls: number
  fps: number
  sequenceSeconds: number
  triangles: number
}

const MAXIMUM_DELTA_SECONDS = 0.05
const SEQUENCE_DURATION_SECONDS = 4.2
const SHOT_TIMES_SECONDS = [0.72, 2.06, 3.4] as const
const PROJECTILE_TRAVEL_SECONDS = 0.24
const EFFECT_POOL_CAPACITY = SHOT_TIMES_SECONDS.length
const SHOOTER_Z = 1.25
const WEAPON = ZOMBIE_ESCAPE_WEAPON_CATALOG[1]
const ZOMBIE = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]
const IMPACT_POSITION = new Vector3(0, 1.24, -5.42)
const Y_AXIS = new Vector3(0, 1, 0)
const ZOMBIE_HIT_COLOR = new Color('#ff6b3d')

type ZombieFlashMaterial = Material & {
  color?: Color
  emissive?: Color
  emissiveIntensity?: number
}

type ZombieFlashMaterialState = {
  baseColor: Color | null
  baseEmissive: Color | null
  baseEmissiveIntensity: number
  material: ZombieFlashMaterial
}

const SHOOTER_SETTINGS: WeaponFitDebugSettings = {
  cameraBookmark: 'design',
  dominantHand: 'right',
  gripMode: 'two-hand',
  showAxes: false,
  showBounds: false,
  showSkeleton: false,
  transform: {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scale: 1,
  },
  weaponId: WEAPON.id,
}

const CAMERA_POSES = {
  design: {
    far: 80,
    fov: 43,
    near: 0.05,
    position: new Vector3(7.7, 5.55, 9.55),
    target: new Vector3(0, 0.98, -2.12),
  },
  far: {
    far: 100,
    fov: 42,
    near: 0.08,
    position: new Vector3(9.2, 7.3, 11.8),
    target: new Vector3(0, 0.82, -2.05),
  },
  near: {
    far: 50,
    fov: 40,
    near: 0.035,
    position: new Vector3(3.25, 2.7, -1.25),
    target: new Vector3(0, 1.18, -5.05),
  },
} as const satisfies Record<
  CameraBookmark,
  { far: number; fov: number; near: number; position: Vector3; target: Vector3 }
>

const EMPTY_METRICS: DebugMetrics = {
  activeEffectSlots: 0,
  drawCalls: 0,
  fps: 0,
  sequenceSeconds: 0,
  triangles: 0,
}

const ignorePoseDiagnostic = (_diagnostic: Pick<WeaponFitDebugDiagnostics, 'arms' | 'grips'>) => {}

export function ZombieShootingDebugClient() {
  const [bookmark, setBookmark] = useState<CameraBookmark>('design')
  const [viewMode, setViewMode] = useState<ViewMode>('final')
  const [paused, setPaused] = useState(false)
  const [resetRevision, setResetRevision] = useState(0)
  const [metrics, setMetrics] = useState<DebugMetrics>(EMPTY_METRICS)
  const [weaponDiagnostic, setWeaponDiagnostic] = useState<WeaponAssetDiagnostic | null>(null)
  const [zombieClipLoaded, setZombieClipLoaded] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedCamera = params.get('camera')
    const requestedView = params.get('view')
    if (isCameraBookmark(requestedCamera)) setBookmark(requestedCamera)
    if (isViewMode(requestedView)) setViewMode(requestedView)
    if (params.get('paused') === '1') setPaused(true)
  }, [])

  const updateBookmark = useCallback((next: CameraBookmark) => {
    setBookmark(next)
    replaceDebugQuery('camera', next)
  }, [])
  const updateViewMode = useCallback((next: ViewMode) => {
    setViewMode(next)
    replaceDebugQuery('view', next)
  }, [])
  const reset = useCallback(() => {
    setResetRevision((revision) => revision + 1)
    setPaused(false)
    replaceDebugQuery('paused', null)
  }, [])
  const togglePaused = useCallback(() => {
    setPaused((current) => {
      replaceDebugQuery('paused', current ? null : '1')
      return !current
    })
  }, [])

  return (
    <main className="relative h-screen w-screen select-none overflow-hidden bg-[#2387a6] text-white [&_canvas]:h-full [&_canvas]:w-full">
      <Canvas
        aria-label="Landrush character firing a generated weapon at a generated running zombie"
        camera={{
          far: CAMERA_POSES.design.far,
          fov: CAMERA_POSES.design.fov,
          near: CAMERA_POSES.design.near,
          position: CAMERA_POSES.design.position.toArray(),
        }}
        dpr={[1, 1.5]}
        frameloop="always"
        gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
        shadows={false}
      >
        <ZombieShootingWorld
          bookmark={bookmark}
          onMetricsChange={setMetrics}
          onWeaponDiagnosticChange={setWeaponDiagnostic}
          onZombieClipStatusChange={setZombieClipLoaded}
          paused={paused}
          resetRevision={resetRevision}
          viewMode={viewMode}
        />
      </Canvas>

      <header className="pointer-events-none absolute top-4 left-4 max-w-[28rem] rounded-2xl border border-white/15 bg-slate-950/78 px-4 py-3 shadow-2xl backdrop-blur-md">
        <p className="font-semibold text-[0.66rem] text-cyan-200 uppercase tracking-[0.24em]">
          Landrush visual proof
        </p>
        <h1 className="mt-1 font-semibold text-lg">Generated weapon → generated zombie</h1>
        <p className="mt-1 text-slate-300 text-xs leading-relaxed">
          {WEAPON.displayName} · {ZOMBIE.label} · deterministic three-shot loop
        </p>
      </header>

      <DebugControls
        bookmark={bookmark}
        onBookmarkChange={updateBookmark}
        onReset={reset}
        onTogglePaused={togglePaused}
        onViewModeChange={updateViewMode}
        paused={paused}
        viewMode={viewMode}
      />

      <aside className="pointer-events-none absolute bottom-4 left-4 max-w-[33rem] rounded-xl border border-white/12 bg-slate-950/76 px-3 py-2 font-mono text-[0.68rem] text-slate-300 leading-relaxed backdrop-blur-md">
        <div className="flex flex-wrap gap-x-3">
          <span>{metrics.fps.toFixed(0)} fps</span>
          <span>{metrics.drawCalls} draws</span>
          <span>{metrics.triangles.toLocaleString()} tris</span>
          <span>
            {metrics.activeEffectSlots}/{EFFECT_POOL_CAPACITY} VFX slots
          </span>
          <span>t={metrics.sequenceSeconds.toFixed(2)}s</span>
        </div>
        <div className="mt-1 text-slate-400">
          weapon {weaponDiagnostic?.status ?? 'loading'} · zombie clip{' '}
          {zombieClipLoaded ? 'exact-match' : 'loading'} · Δ≤{MAXIMUM_DELTA_SECONDS.toFixed(2)}s ·
          post passes 0
        </div>
        <div className="truncate text-slate-500" title={ZOMBIE.glb.run.expectedClipName}>
          {ZOMBIE.glb.run.expectedClipName}
        </div>
      </aside>

      <p className="pointer-events-none absolute right-4 bottom-4 rounded-full border border-white/12 bg-slate-950/70 px-3 py-1.5 text-[0.68rem] text-slate-300 backdrop-blur-md">
        Near isolates the running target · Design shows the firing line · Far proves context
      </p>
    </main>
  )
}

function DebugControls({
  bookmark,
  onBookmarkChange,
  onReset,
  onTogglePaused,
  onViewModeChange,
  paused,
  viewMode,
}: {
  bookmark: CameraBookmark
  onBookmarkChange: (bookmark: CameraBookmark) => void
  onReset: () => void
  onTogglePaused: () => void
  onViewModeChange: (viewMode: ViewMode) => void
  paused: boolean
  viewMode: ViewMode
}) {
  return (
    <nav
      aria-label="Zombie shooting debug controls"
      className="absolute top-4 right-4 flex max-w-[30rem] flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/82 p-2 shadow-2xl backdrop-blur-md"
    >
      <ControlRow label="Camera">
        {(['near', 'design', 'far'] as const).map((entry) => (
          <DebugButton
            active={bookmark === entry}
            key={entry}
            label={capitalize(entry)}
            onClick={() => onBookmarkChange(entry)}
          />
        ))}
      </ControlRow>
      <ControlRow label="View">
        {(['final', 'no-post', 'diagnostic'] as const).map((entry) => (
          <DebugButton
            active={viewMode === entry}
            key={entry}
            label={entry === 'no-post' ? 'No post' : capitalize(entry)}
            onClick={() => onViewModeChange(entry)}
          />
        ))}
      </ControlRow>
      <div className="flex justify-end gap-1.5 border-white/10 border-t pt-2">
        <DebugButton active={paused} label={paused ? 'Resume' : 'Pause'} onClick={onTogglePaused} />
        <DebugButton active={false} label="Reset loop" onClick={onReset} />
      </div>
    </nav>
  )
}

function ControlRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="mr-1 text-[0.62rem] text-slate-400 uppercase tracking-[0.18em]">
        {label}
      </span>
      {children}
    </div>
  )
}

function DebugButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1.5 font-medium text-xs transition-colors ${
        active
          ? 'border-cyan-300/70 bg-cyan-400/22 text-cyan-100'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function ZombieShootingWorld({
  bookmark,
  onMetricsChange,
  onWeaponDiagnosticChange,
  onZombieClipStatusChange,
  paused,
  resetRevision,
  viewMode,
}: {
  bookmark: CameraBookmark
  onMetricsChange: Dispatch<SetStateAction<DebugMetrics>>
  onWeaponDiagnosticChange: Dispatch<SetStateAction<WeaponAssetDiagnostic | null>>
  onZombieClipStatusChange: Dispatch<SetStateAction<boolean>>
  paused: boolean
  resetRevision: number
  viewMode: ViewMode
}) {
  const timelineRef = useRef<TimelineState>({ deltaSeconds: 0, elapsedSeconds: 0 })
  const muzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())

  return (
    <>
      <color args={[viewMode === 'diagnostic' ? '#172131' : '#70c9df']} attach="background" />
      <fog attach="fog" args={[viewMode === 'diagnostic' ? '#172131' : '#70c9df', 15, 42]} />
      <RendererPresentation viewMode={viewMode} />
      <TimelineClock paused={paused} resetRevision={resetRevision} timelineRef={timelineRef} />
      <CameraDirector bookmark={bookmark} timelineRef={timelineRef} />

      <hemisphereLight args={['#fff3d5', '#236164', viewMode === 'diagnostic' ? 1.2 : 2.15]} />
      <directionalLight color="#fff3d2" intensity={3.1} position={[5, 9, 5]} />
      <directionalLight color="#8be7ff" intensity={0.72} position={[-5, 4, -6]} />

      <IslandProofStage diagnostic={viewMode === 'diagnostic'} />
      <ShooterCharacter
        muzzlePoseRef={muzzlePoseRef}
        onWeaponDiagnosticChange={onWeaponDiagnosticChange}
        timelineRef={timelineRef}
      />
      <Suspense fallback={<ZombieLoadingStandIn />}>
        <GeneratedRunningZombie
          onClipStatusChange={onZombieClipStatusChange}
          resetRevision={resetRevision}
          timelineRef={timelineRef}
        />
      </Suspense>
      <FiringEffects
        diagnostic={viewMode === 'diagnostic'}
        muzzlePoseRef={muzzlePoseRef}
        timelineRef={timelineRef}
      />
      <MetricsReporter onMetricsChange={onMetricsChange} timelineRef={timelineRef} />
      <ZombieShootingManualRenderDriver />
    </>
  )
}

function TimelineClock({
  paused,
  resetRevision,
  timelineRef,
}: {
  paused: boolean
  resetRevision: number
  timelineRef: MutableRefObject<TimelineState>
}) {
  useEffect(() => {
    void resetRevision
    timelineRef.current.deltaSeconds = 0
    timelineRef.current.elapsedSeconds = 0
  }, [resetRevision, timelineRef])

  useFrame((_, rawDelta) => {
    const delta = Math.min(MAXIMUM_DELTA_SECONDS, Math.max(0, rawDelta))
    timelineRef.current.deltaSeconds = paused ? 0 : delta
    if (!paused) timelineRef.current.elapsedSeconds += delta
  }, -100)

  return null
}

function RendererPresentation({ viewMode }: { viewMode: ViewMode }) {
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    const previousOutputColorSpace = gl.outputColorSpace
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping = viewMode === 'final' ? ACESFilmicToneMapping : NoToneMapping
    gl.toneMappingExposure = viewMode === 'final' ? 1.04 : 1
    return () => {
      gl.outputColorSpace = previousOutputColorSpace
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
    }
  }, [gl, viewMode])

  return null
}

function CameraDirector({
  bookmark,
  timelineRef,
}: {
  bookmark: CameraBookmark
  timelineRef: MutableRefObject<TimelineState>
}) {
  const camera = useThree((state) => state.camera)
  const target = useRef(CAMERA_POSES[bookmark].target.clone())

  useLayoutEffect(() => {
    const pose = CAMERA_POSES[bookmark]
    camera.near = pose.near
    camera.far = pose.far
    if ('fov' in camera) camera.fov = pose.fov
    camera.updateProjectionMatrix()
  }, [bookmark, camera])

  useFrame(() => {
    const pose = CAMERA_POSES[bookmark]
    const delta = timelineRef.current.deltaSeconds || 1 / 60
    const response = 1 - Math.exp(-8.5 * Math.min(MAXIMUM_DELTA_SECONDS, delta))
    camera.position.lerp(pose.position, response)
    target.current.lerp(pose.target, response)
    camera.lookAt(target.current)
    camera.updateMatrixWorld()
  }, -10)

  return null
}

function IslandProofStage({ diagnostic }: { diagnostic: boolean }) {
  const vegetation = [
    [-5.7, -4.7, 0.92],
    [5.9, -3.9, 1.08],
    [-5.4, 1.2, 1.02],
    [5.3, 1.8, 0.88],
  ] as const

  return (
    <group>
      <mesh position={[0, -0.48, -1.8]}>
        <cylinderGeometry args={[20, 20, 0.58, 64]} />
        <meshStandardMaterial color={diagnostic ? '#213849' : '#1687a4'} roughness={0.38} />
      </mesh>
      <mesh position={[0, -0.14, -1.8]}>
        <cylinderGeometry args={[9.15, 8.6, 0.3, 48]} />
        <meshStandardMaterial color={diagnostic ? '#59616c' : '#dcae63'} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.015, -1.8]}>
        <cylinderGeometry args={[8.35, 8.15, 0.17, 48]} />
        <meshStandardMaterial color={diagnostic ? '#42515b' : '#70a258'} roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.12, -2.05]}>
        <boxGeometry args={[3.2, 0.12, 10.3]} />
        <meshStandardMaterial color={diagnostic ? '#697586' : '#c4b483'} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.19, -2.05]}>
        <boxGeometry args={[0.045, 0.018, 9.75]} />
        <meshBasicMaterial color={diagnostic ? '#67e8f9' : '#f6e3a3'} />
      </mesh>

      {vegetation.map(([x, z, scale], index) => (
        <group key={`${x}-${z}`} position={[x, 0, z]} scale={scale}>
          <mesh position={[0, 1.12, 0]} rotation={[0.08, 0, index % 2 === 0 ? -0.08 : 0.08]}>
            <cylinderGeometry args={[0.16, 0.24, 2.25, 8]} />
            <meshStandardMaterial color={diagnostic ? '#59616c' : '#765239'} roughness={1} />
          </mesh>
          <mesh position={[0, 2.45, 0]} scale={[1.25, 0.62, 1.05]}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={diagnostic ? '#52616c' : '#3d7f50'} flatShading />
          </mesh>
        </group>
      ))}

      {diagnostic ? (
        <group>
          <gridHelper args={[18, 36, '#67e8f9', '#334155']} position={[0, 0.205, -1.8]} />
          <axesHelper args={[1.1]} position={[-1.9, 0.22, 1.6]} />
        </group>
      ) : null}
    </group>
  )
}

function ShooterCharacter({
  muzzlePoseRef,
  onWeaponDiagnosticChange,
  timelineRef,
}: {
  muzzlePoseRef: MutableRefObject<LandrushRobotWeaponMuzzlePose>
  onWeaponDiagnosticChange: Dispatch<SetStateAction<WeaponAssetDiagnostic | null>>
  timelineRef: MutableRefObject<TimelineState>
}) {
  const upperBodyRef = useRef<Group>(null)
  const handleWeaponDiagnostic = useCallback(
    (diagnostic: WeaponAssetDiagnostic) => onWeaponDiagnosticChange(diagnostic),
    [onWeaponDiagnosticChange],
  )

  useFrame(() => {
    const upperBody = upperBodyRef.current
    if (!upperBody) return
    const sequenceTime = timelineRef.current.elapsedSeconds % SEQUENCE_DURATION_SECONDS
    let recoil = 0
    for (const shotTime of SHOT_TIMES_SECONDS) {
      const age = cyclicAge(sequenceTime, shotTime)
      if (age >= 0.16) continue
      recoil = Math.max(recoil, Math.sin((age / 0.16) * Math.PI))
    }
    upperBody.position.z = recoil * 0.055
    upperBody.rotation.x = recoil * 0.026
  }, -30)

  return (
    <group position={[0, 0.19, SHOOTER_Z]} userData={{ generatedWeapon: WEAPON.assetPath }}>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.44, 28]} />
        <meshBasicMaterial color="#173247" opacity={0.28} transparent />
      </mesh>
      <group ref={upperBodyRef}>
        <WeaponFitSubject
          muzzlePoseRef={muzzlePoseRef}
          onAssetDiagnosticChange={handleWeaponDiagnostic}
          onPoseDiagnosticChange={ignorePoseDiagnostic}
          playerGroundY={0}
          settings={SHOOTER_SETTINGS}
        />
      </group>
    </group>
  )
}

function GeneratedRunningZombie({
  onClipStatusChange,
  resetRevision,
  timelineRef,
}: {
  onClipStatusChange: Dispatch<SetStateAction<boolean>>
  resetRevision: number
  timelineRef: MutableRefObject<TimelineState>
}) {
  const gltf = useGLTF(ZOMBIE.glb.run.path)
  const model = useMemo(() => cloneSkeleton(gltf.scene) as Group, [gltf.scene])
  const pivotRef = useRef<Group>(null)
  const clip = useMemo(
    () => gltf.animations.find((candidate) => candidate.name === ZOMBIE.glb.run.expectedClipName),
    [gltf.animations],
  )
  const modelTransform = useMemo(() => computeZombieTransform(gltf.scene), [gltf.scene])
  const mixer = useMemo(() => new AnimationMixer(model), [model])
  const flashMaterialsRef = useRef<ZombieFlashMaterialState[]>([])

  useLayoutEffect(() => {
    model.position.copy(modelTransform.offset)
    model.scale.setScalar(modelTransform.scale)
    const ownedMaterials: ZombieFlashMaterial[] = []
    const flashMaterials: ZombieFlashMaterialState[] = []
    model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const clonedMaterials = sourceMaterials.map(
        (sourceMaterial) => sourceMaterial.clone() as ZombieFlashMaterial,
      )
      ownedMaterials.push(...clonedMaterials)
      for (const material of clonedMaterials) {
        flashMaterials.push({
          baseColor: material.color?.clone() ?? null,
          baseEmissive: material.emissive?.clone() ?? null,
          baseEmissiveIntensity: material.emissiveIntensity ?? 0,
          material,
        })
      }
      if (Array.isArray(mesh.material)) mesh.material = clonedMaterials
      else if (clonedMaterials[0]) mesh.material = clonedMaterials[0]
    })
    flashMaterialsRef.current = flashMaterials
    return () => {
      flashMaterialsRef.current = []
      for (const material of ownedMaterials) material.dispose()
    }
  }, [model, modelTransform])

  useEffect(() => {
    onClipStatusChange(Boolean(clip))
    if (!clip) return () => onClipStatusChange(false)
    const action = mixer.clipAction(clip, model)
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
    action.play()
    return () => {
      action.stop()
      mixer.uncacheAction(clip, model)
      mixer.uncacheRoot(model)
      onClipStatusChange(false)
    }
  }, [clip, mixer, model, onClipStatusChange])

  useEffect(() => {
    void resetRevision
    mixer.setTime(0)
  }, [mixer, resetRevision])

  useFrame(() => {
    const pivot = pivotRef.current
    if (!pivot) return
    const elapsed = timelineRef.current.elapsedSeconds
    const sequenceTime = elapsed % SEQUENCE_DURATION_SECONDS
    if (clip) mixer.setTime(elapsed % clip.duration)

    let reaction = 0
    let hitFlash = 0
    for (const shotTime of SHOT_TIMES_SECONDS) {
      const impactAge = cyclicAge(sequenceTime, shotTime) - PROJECTILE_TRAVEL_SECONDS
      if (impactAge < 0 || impactAge > 0.62) continue
      const normalized = impactAge / 0.62
      reaction = Math.max(reaction, Math.sin(normalized * Math.PI) * (1 - normalized * 0.36))
      hitFlash = Math.max(hitFlash, 1 - MathUtils.clamp(impactAge / 0.18, 0, 1))
    }
    const approach = (sequenceTime / SEQUENCE_DURATION_SECONDS) * 0.34
    pivot.position.set(0, 1 + reaction * 0.08, -5.5 + approach - reaction * 0.42)
    pivot.rotation.x = -reaction * 0.2
    pivot.rotation.z = reaction * 0.055
    pivot.scale.set(1 + reaction * 0.08, 1 - reaction * 0.12, 1 + reaction * 0.08)
    for (const state of flashMaterialsRef.current) {
      if (state.baseColor && state.material.color) {
        state.material.color.copy(state.baseColor).lerp(ZOMBIE_HIT_COLOR, hitFlash * 0.72)
      }
      if (state.baseEmissive && state.material.emissive) {
        state.material.emissive.copy(state.baseEmissive).lerp(ZOMBIE_HIT_COLOR, hitFlash)
        state.material.emissiveIntensity = state.baseEmissiveIntensity + hitFlash * 4.2
      }
    }
  }, -29)

  return (
    <group
      ref={pivotRef}
      userData={{
        animationClip: ZOMBIE.glb.run.expectedClipName,
        generatedZombie: ZOMBIE.glb.run.path,
        impactReaction: 'deterministic-procedural-overlay',
      }}
    >
      <group position={[0, -1, 0]}>
        <primitive object={model} />
      </group>
      <mesh position={[0, -0.965, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.46, 28]} />
        <meshBasicMaterial color="#392931" opacity={0.22} transparent />
      </mesh>
    </group>
  )
}

function ZombieLoadingStandIn() {
  return (
    <group position={[0, 1, -5.5]}>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.34, 1.12, 8, 14]} />
        <meshBasicMaterial color="#fb7185" opacity={0.32} transparent wireframe />
      </mesh>
    </group>
  )
}

function FiringEffects({
  diagnostic,
  muzzlePoseRef,
  timelineRef,
}: {
  diagnostic: boolean
  muzzlePoseRef: MutableRefObject<LandrushRobotWeaponMuzzlePose>
  timelineRef: MutableRefObject<TimelineState>
}) {
  const flashRef = useRef<InstancedMesh>(null)
  const travelRef = useRef<InstancedMesh>(null)
  const impactFlashRef = useRef<InstancedMesh>(null)
  const impactRingRef = useRef<InstancedMesh>(null)
  const shotWasTravelingRef = useRef(Array.from({ length: EFFECT_POOL_CAPACITY }, () => false))
  const shotValidRef = useRef(Array.from({ length: EFFECT_POOL_CAPACITY }, () => false))
  const shotOrigins = useMemo(
    () => Array.from({ length: EFFECT_POOL_CAPACITY }, () => new Vector3()),
    [],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const point = useMemo(() => new Vector3(), [])
  const direction = useMemo(() => new Vector3(), [])
  const directionQuaternion = useMemo(() => new Quaternion(), [])

  useLayoutEffect(() => {
    for (const mesh of [
      flashRef.current,
      travelRef.current,
      impactFlashRef.current,
      impactRingRef.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    }
  }, [])

  useFrame(() => {
    const sequenceTime = timelineRef.current.elapsedSeconds % SEQUENCE_DURATION_SECONDS
    for (let slot = 0; slot < EFFECT_POOL_CAPACITY; slot += 1) {
      const shotTime = SHOT_TIMES_SECONDS[slot]
      if (shotTime === undefined) continue
      const age = cyclicAge(sequenceTime, shotTime)
      const traveling = age < PROJECTILE_TRAVEL_SECONDS
      const muzzlePose = muzzlePoseRef.current

      if (traveling && !shotWasTravelingRef.current[slot]) {
        shotValidRef.current[slot] = false
      }
      if (traveling && !shotValidRef.current[slot] && muzzlePose.ready) {
        shotOrigins[slot]?.copy(muzzlePose.position)
        shotValidRef.current[slot] = true
      }
      shotWasTravelingRef.current[slot] = traveling
      const shotValid = shotValidRef.current[slot] === true
      const shotOrigin = shotOrigins[slot]

      if (shotValid && muzzlePose.ready && age < 0.11) {
        const envelope = Math.sin((age / 0.11) * Math.PI)
        setSimpleInstance(
          flashRef.current,
          slot,
          dummy,
          muzzlePose.position,
          0.42 + envelope * 0.95,
        )
      } else hideInstance(flashRef.current, slot, dummy)

      if (traveling && shotValid && shotOrigin) {
        const progress = MathUtils.clamp(age / PROJECTILE_TRAVEL_SECONDS, 0, 1)
        setTravelInstance(
          travelRef.current,
          slot,
          dummy,
          shotOrigin,
          IMPACT_POSITION,
          progress,
          point,
          direction,
          directionQuaternion,
          diagnostic ? 1.35 : 1,
        )
      } else hideInstance(travelRef.current, slot, dummy)

      const impactAge = age - PROJECTILE_TRAVEL_SECONDS
      if (shotValid && impactAge >= 0 && impactAge < 0.5) {
        const normalized = impactAge / 0.5
        const ringScale = (0.35 + normalized * 1.55) * (1 - normalized * 0.55)
        dummy.position.copy(IMPACT_POSITION)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(ringScale)
        dummy.updateMatrix()
        impactRingRef.current?.setMatrixAt(slot, dummy.matrix)

        if (impactAge < 0.16) {
          const flashEnvelope = 1 - impactAge / 0.16
          setSimpleInstance(
            impactFlashRef.current,
            slot,
            dummy,
            IMPACT_POSITION,
            0.3 + flashEnvelope * 1.15,
          )
        } else hideInstance(impactFlashRef.current, slot, dummy)
      } else {
        hideInstance(impactFlashRef.current, slot, dummy)
        hideInstance(impactRingRef.current, slot, dummy)
      }
    }

    for (const mesh of [
      flashRef.current,
      travelRef.current,
      impactFlashRef.current,
      impactRingRef.current,
    ]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  }, 3)

  return (
    <group
      userData={{
        allocation: 'fixed-capacity-instanced-pools',
        capacity: EFFECT_POOL_CAPACITY,
        postProcessPasses: 0,
        travelingCarriersPerShot: 1,
      }}
    >
      <TrajectoryGuide diagnostic={diagnostic} muzzlePoseRef={muzzlePoseRef} />
      <instancedMesh args={[undefined, undefined, EFFECT_POOL_CAPACITY]} ref={flashRef}>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#fff1a6"
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, EFFECT_POOL_CAPACITY]}
        frustumCulled={false}
        ref={travelRef}
      >
        <capsuleGeometry args={[0.055, 0.36, 4, 8]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffe269"
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, EFFECT_POOL_CAPACITY]}
        frustumCulled={false}
        ref={impactFlashRef}
      >
        <icosahedronGeometry args={[0.13, 1]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#fff2a8"
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, EFFECT_POOL_CAPACITY]}
        frustumCulled={false}
        ref={impactRingRef}
      >
        <ringGeometry args={[0.13, 0.28, 18]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ff8b5d"
          depthWrite={false}
          side={2}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
    </group>
  )
}

function TrajectoryGuide({
  diagnostic,
  muzzlePoseRef,
}: {
  diagnostic: boolean
  muzzlePoseRef: MutableRefObject<LandrushRobotWeaponMuzzlePose>
}) {
  const groupRef = useRef<Group>(null)
  const guideRef = useRef<Mesh>(null)
  const muzzleMarkerRef = useRef<Mesh>(null)
  const direction = useMemo(() => new Vector3(), [])
  const midpoint = useMemo(() => new Vector3(), [])
  const quaternion = useMemo(() => new Quaternion(), [])

  useFrame(() => {
    const group = groupRef.current
    const guide = guideRef.current
    const muzzleMarker = muzzleMarkerRef.current
    const muzzlePose = muzzlePoseRef.current
    if (!group) return
    group.visible = diagnostic && muzzlePose.ready
    if (!group.visible || !guide || !muzzleMarker) return
    direction.copy(IMPACT_POSITION).sub(muzzlePose.position)
    const length = direction.length()
    midpoint.copy(muzzlePose.position).add(IMPACT_POSITION).multiplyScalar(0.5)
    quaternion.setFromUnitVectors(Y_AXIS, direction.normalize())
    guide.position.copy(midpoint)
    guide.quaternion.copy(quaternion)
    guide.scale.set(1, length, 1)
    muzzleMarker.position.copy(muzzlePose.position)
  }, 3.1)

  if (!diagnostic) return null
  return (
    <group ref={groupRef}>
      <mesh ref={guideRef}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshBasicMaterial
          color="#67e8f9"
          depthWrite={false}
          opacity={0.4}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh ref={muzzleMarkerRef}>
        <sphereGeometry args={[0.065, 10, 7]} />
        <meshBasicMaterial color="#67e8f9" toneMapped={false} />
      </mesh>
      <mesh position={IMPACT_POSITION.toArray()}>
        <sphereGeometry args={[0.08, 10, 7]} />
        <meshBasicMaterial color="#fb7185" toneMapped={false} />
      </mesh>
    </group>
  )
}

function MetricsReporter({
  onMetricsChange,
  timelineRef,
}: {
  onMetricsChange: Dispatch<SetStateAction<DebugMetrics>>
  timelineRef: MutableRefObject<TimelineState>
}) {
  const reportAccumulator = useRef(0)
  const smoothedFps = useRef(60)

  useFrame(({ gl }, rawDelta) => {
    const delta = Math.min(MAXIMUM_DELTA_SECONDS, Math.max(0.000_1, rawDelta))
    smoothedFps.current = MathUtils.lerp(smoothedFps.current, 1 / delta, 0.08)
    reportAccumulator.current += delta
    if (reportAccumulator.current < 0.22) return
    reportAccumulator.current = 0
    const sequenceTime = timelineRef.current.elapsedSeconds % SEQUENCE_DURATION_SECONDS
    let activeEffectSlots = 0
    for (const shotTime of SHOT_TIMES_SECONDS) {
      if (cyclicAge(sequenceTime, shotTime) < 0.74) activeEffectSlots += 1
    }
    onMetricsChange({
      activeEffectSlots,
      drawCalls: gl.info.render.calls,
      fps: smoothedFps.current,
      sequenceSeconds: sequenceTime,
      triangles: gl.info.render.triangles,
    })
  }, 0)

  return null
}

function computeZombieTransform(source: Group) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = ZOMBIE.characterHeightMeters / Math.max(0.000_1, size.y)
  return {
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
  }
}

function setSimpleInstance(
  mesh: InstancedMesh | null,
  slot: number,
  dummy: Object3D,
  position: Vector3,
  scale: number,
) {
  if (!mesh) return
  dummy.position.copy(position)
  dummy.rotation.set(0, 0, 0)
  dummy.scale.setScalar(scale)
  dummy.updateMatrix()
  mesh.setMatrixAt(slot, dummy.matrix)
}

function setTravelInstance(
  mesh: InstancedMesh | null,
  slot: number,
  dummy: Object3D,
  start: Vector3,
  end: Vector3,
  progress: number,
  point: Vector3,
  direction: Vector3,
  quaternion: Quaternion,
  scale: number,
) {
  if (!mesh) return
  direction.copy(end).sub(start)
  if (direction.lengthSq() <= Number.EPSILON) {
    hideInstance(mesh, slot, dummy)
    return
  }
  point.lerpVectors(start, end, progress)
  quaternion.setFromUnitVectors(Y_AXIS, direction.normalize())
  dummy.position.copy(point)
  dummy.quaternion.copy(quaternion)
  dummy.scale.setScalar(scale)
  dummy.updateMatrix()
  mesh.setMatrixAt(slot, dummy.matrix)
}

function ZombieShootingManualRenderDriver() {
  useFrame(({ camera, gl, scene }) => {
    gl.render(scene, camera)
  }, 100)
  return null
}

function hideInstance(mesh: InstancedMesh | null, slot: number, dummy: Object3D) {
  if (!mesh) return
  dummy.position.set(0, -40, 0)
  dummy.rotation.set(0, 0, 0)
  dummy.scale.setScalar(0)
  dummy.updateMatrix()
  mesh.setMatrixAt(slot, dummy.matrix)
}

function cyclicAge(sequenceTime: number, eventTime: number) {
  return (sequenceTime - eventTime + SEQUENCE_DURATION_SECONDS) % SEQUENCE_DURATION_SECONDS
}

function replaceDebugQuery(key: string, value: string | null) {
  const url = new URL(window.location.href)
  if (value === null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  window.history.replaceState(window.history.state, '', url)
}

function isCameraBookmark(value: string | null): value is CameraBookmark {
  return value === 'near' || value === 'design' || value === 'far'
}

function isViewMode(value: string | null): value is ViewMode {
  return value === 'final' || value === 'no-post' || value === 'diagnostic'
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

useGLTF.preload(ZOMBIE.glb.run.path)
