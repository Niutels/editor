'use client'

import {
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
  type ZombieEscapeZombieCatalogEntry,
} from '@landrush/zombie-gameplay/zombie-escape-zombie-catalog'
import { useGLTFKTX2 } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Component,
  type ErrorInfo,
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
  AnimationMixer,
  Box3,
  type Group,
  LoopRepeat,
  MathUtils,
  type Mesh,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

type CameraBookmark = 'near' | 'design' | 'far'
type RunnerLoadState = 'error' | 'loading' | 'ready'
type RunnerStatus = {
  clipName: string
  detail: string
  state: RunnerLoadState
}

const MAX_DELTA_SECONDS = 0.05
const CAMERA_BOOKMARKS: Record<CameraBookmark, [number, number, number]> = {
  near: [0, 18.8, 14.4],
  design: [0, 23.8, 18.2],
  far: [0, 30, 22.9],
}
const CAMERA_TARGET: [number, number, number] = [0, 0.68, 0]
const RUNNER_STAGES = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie, index) => ({
  accent: ['#ffca68', '#6fe6d5', '#ff8e7c', '#8cc9ff', '#d7a4ff'][index % 5] ?? '#7de8d7',
  position: [((index % 5) - 2) * 3.65, 0.12, Math.floor(index / 5) * 5.45 - 2.725] as [
    number,
    number,
    number,
  ],
  yaw: ((zombie.seed % 7) - 3) * 0.025,
}))
const GRASS_TUFT_POSITIONS: readonly [number, number][] = [
  [-8.7, -7.4],
  [-6.7, 7.7],
  [-3.8, -8.7],
  [0, 8.8],
  [4.3, -8.7],
  [7, 7.6],
  [8.9, -7.3],
]

for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) useGLTF.preload(zombie.glb.run.path)

export function ZombieRunningDebugClient() {
  const [cameraBookmark, setCameraBookmark] = useState<CameraBookmark>('design')
  const [paused, setPaused] = useState(false)
  const [timeScale, setTimeScale] = useState(1)
  const [runnerStatuses, setRunnerStatuses] = useState<Record<string, RunnerStatus>>(() =>
    Object.fromEntries(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie) => [
        zombie.id,
        {
          clipName: zombie.glb.run.expectedClipName,
          detail: 'Loading optimized rig and animation-only run clip',
          state: 'loading' as const,
        },
      ]),
    ),
  )

  const reportStatus = useCallback((id: string, status: RunnerStatus) => {
    setRunnerStatuses((current) => {
      const previous = current[id]
      if (
        previous?.state === status.state &&
        previous.clipName === status.clipName &&
        previous.detail === status.detail
      ) {
        return current
      }
      return { ...current, [id]: status }
    })
  }, [])

  const readyCount = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.reduce(
    (count, zombie) => count + (runnerStatuses[zombie.id]?.state === 'ready' ? 1 : 0),
    0,
  )
  const errorCount = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.reduce(
    (count, zombie) => count + (runnerStatuses[zombie.id]?.state === 'error' ? 1 : 0),
    0,
  )

  return (
    <main
      aria-labelledby="zombie-running-debug-title"
      className="relative h-screen w-screen overflow-hidden bg-[#071c27] text-slate-100"
    >
      <h1 className="sr-only" id="zombie-running-debug-title">
        Landrush ten-zombie running animation debug scene
      </h1>
      <div
        aria-label="Three-dimensional Landrush island showing all ten actual Meshy zombie variants running"
        className="absolute inset-0"
        role="img"
      >
        <Canvas
          camera={{ far: 100, fov: 38, near: 0.1, position: CAMERA_BOOKMARKS.design }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          shadows
        >
          <color args={['#8ed5ec']} attach="background" />
          <fog args={['#8ed5ec', 31, 68]} attach="fog" />
          <CameraDirector bookmark={cameraBookmark} />
          <hemisphereLight color="#dff7ff" groundColor="#54784a" intensity={2.3} />
          <directionalLight
            castShadow
            color="#fff1c9"
            intensity={3.1}
            position={[-9, 20, 12]}
            shadow-mapSize-height={2048}
            shadow-mapSize-width={2048}
            shadow-camera-bottom={-12}
            shadow-camera-far={50}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={12}
          />
          <LandrushRunningIsland />
          <group userData={{ actualMeshyZombieCount: ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length }}>
            {ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie, index) => (
              <RunnerAssetBoundary
                id={zombie.id}
                key={zombie.id}
                onStatus={reportStatus}
                requestedClip={zombie.glb.run.expectedClipName}
              >
                <Suspense fallback={null}>
                  <ActualZombieRunner
                    index={index}
                    onStatus={reportStatus}
                    paused={paused}
                    timeScale={timeScale}
                    zombie={zombie}
                  />
                </Suspense>
              </RunnerAssetBoundary>
            ))}
          </group>
        </Canvas>
      </div>

      <section className="pointer-events-none absolute top-3 left-3 max-w-[min(440px,calc(100vw-24px))] rounded-xl border border-white/15 bg-[#07131de8] px-3.5 py-3 shadow-2xl backdrop-blur-sm">
        <p className="font-semibold text-[10px] text-cyan-200 uppercase tracking-[0.2em]">
          Landrush animation lab
        </p>
        <h2 className="mt-1 font-semibold text-base text-white">Ten actual Meshy runners</h2>
        <p className="mt-1 text-[11px] text-slate-400">
          Deterministic 5 × 2 staging · no stand-ins · no post-processing
        </p>
      </section>

      <section
        aria-live="polite"
        className="pointer-events-none absolute top-3 right-3 w-[min(310px,calc(100vw-24px))] rounded-xl border border-white/15 bg-[#07131de8] px-3 py-2.5 shadow-2xl backdrop-blur-sm"
        data-ready-count={readyCount}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[10px] text-slate-500 uppercase tracking-[0.18em]">
              Actual asset proof
            </p>
            <p className="mt-0.5 font-mono text-cyan-100 text-xs">
              {readyCount}/10 GLBs · {readyCount}/10 exact clips
            </p>
          </div>
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full ${
              errorCount > 0
                ? 'bg-rose-400'
                : readyCount === ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
                  ? 'bg-emerald-400'
                  : 'animate-pulse bg-amber-300'
            }`}
          />
        </div>
        <p className="mt-1 truncate font-mono text-[9px] text-slate-500">
          Armature|running|baselayer
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie) => {
            const status = runnerStatuses[zombie.id]
            return (
              <div className="flex min-w-0 items-center gap-1.5" key={zombie.id}>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    status?.state === 'ready'
                      ? 'bg-emerald-400'
                      : status?.state === 'error'
                        ? 'bg-rose-400'
                        : 'bg-amber-300'
                  }`}
                />
                <span className="truncate text-[9px] text-slate-300" title={status?.detail}>
                  {zombie.label} · {status?.state ?? 'loading'}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section
        aria-label="Animation and camera controls"
        className="absolute bottom-3 left-1/2 flex w-[min(720px,calc(100vw-24px))] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#07131dee] px-3 py-2 shadow-2xl backdrop-blur-sm"
      >
        <button
          aria-pressed={paused}
          className="min-w-20 rounded-md bg-cyan-400 px-3 py-1.5 font-semibold text-[#06202b] text-xs hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-white"
          onClick={() => setPaused((current) => !current)}
          type="button"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="Camera bookmark">
          {(['near', 'design', 'far'] as const).map((bookmark) => (
            <button
              aria-pressed={cameraBookmark === bookmark}
              className={`rounded-md px-2.5 py-1.5 text-xs capitalize focus-visible:outline-2 focus-visible:outline-white ${
                cameraBookmark === bookmark
                  ? 'bg-white/18 text-white'
                  : 'bg-white/6 text-slate-400 hover:bg-white/10'
              }`}
              key={bookmark}
              onClick={() => setCameraBookmark(bookmark)}
              type="button"
            >
              {bookmark}
            </button>
          ))}
        </div>
        <label className="flex min-w-56 flex-1 items-center gap-2 text-slate-400 text-xs">
          <span className="whitespace-nowrap">Time scale</span>
          <input
            aria-label="Animation time scale"
            className="h-1.5 min-w-24 flex-1 cursor-pointer accent-cyan-400"
            max={2}
            min={0.25}
            onChange={(event) => setTimeScale(Number(event.target.value))}
            step={0.25}
            type="range"
            value={timeScale}
          />
          <span className="w-9 font-mono text-cyan-100">{timeScale.toFixed(2)}×</span>
        </label>
        <span className="font-mono text-[9px] text-slate-600">Δt ≤ 50 ms</span>
      </section>
    </main>
  )
}

function CameraDirector({ bookmark }: { bookmark: CameraBookmark }) {
  const { camera } = useThree()

  useLayoutEffect(() => {
    const position = CAMERA_BOOKMARKS[bookmark]
    camera.position.set(...position)
    camera.lookAt(...CAMERA_TARGET)
    if (camera instanceof PerspectiveCamera) {
      camera.fov = 38
      camera.near = 0.1
      camera.far = 100
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld(true)
  }, [bookmark, camera])

  return null
}

function ActualZombieRunner({
  index,
  onStatus,
  paused,
  timeScale,
  zombie,
}: {
  index: number
  onStatus: (id: string, status: RunnerStatus) => void
  paused: boolean
  timeScale: number
  zombie: ZombieEscapeZombieCatalogEntry
}) {
  const riggedGltf = useGLTFKTX2(zombie.glb.riggedBase.path)
  const runGltf = useGLTF(zombie.glb.run.path)
  const stage = RUNNER_STAGES[index]!
  const runnerRef = useRef<Group>(null)
  const elapsedRef = useRef(0)
  const model = useMemo(() => cloneSkeleton(riggedGltf.scene) as Group, [riggedGltf.scene])
  const modelTransform = useMemo(
    () => computeRunnerTransform(riggedGltf.scene, zombie.characterHeightMeters),
    [riggedGltf.scene, zombie.characterHeightMeters],
  )
  const exactClip = useMemo(
    () =>
      runGltf.animations.find((animation) => animation.name === zombie.glb.run.expectedClipName) ??
      null,
    [runGltf.animations, zombie.glb.run.expectedClipName],
  )
  const mixer = useMemo(() => new AnimationMixer(model), [model])

  useLayoutEffect(() => {
    model.position.copy(modelTransform.offset)
    model.scale.setScalar(modelTransform.scale)
    model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      mesh.receiveShadow = true
    })
  }, [model, modelTransform])

  useEffect(() => {
    if (!exactClip) {
      onStatus(zombie.id, {
        clipName: zombie.glb.run.expectedClipName,
        detail: `Exact clip missing from ${zombie.glb.run.path}`,
        state: 'error',
      })
      return
    }

    const action = mixer.clipAction(exactClip, model)
    action.enabled = true
    action.setEffectiveTimeScale(
      MathUtils.clamp(zombie.movement.runMetersPerSecond / 3.2, 0.82, 1.18),
    )
    action.setEffectiveWeight(1)
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
    action.play()
    onStatus(zombie.id, {
      clipName: exactClip.name,
      detail: `${zombie.glb.riggedBase.path} + ${zombie.glb.run.path} · exact clip active`,
      state: 'ready',
    })

    return () => {
      action.stop()
      mixer.stopAllAction()
      mixer.uncacheAction(exactClip, model)
      mixer.uncacheRoot(model)
    }
  }, [exactClip, mixer, model, onStatus, zombie])

  useFrame((_, frameDelta) => {
    if (paused || !exactClip) return
    const deltaSeconds = Math.min(MAX_DELTA_SECONDS, Math.max(0, frameDelta)) * timeScale
    elapsedRef.current += deltaSeconds
    mixer.update(deltaSeconds)
    if (runnerRef.current) {
      runnerRef.current.rotation.y = stage.yaw + Math.sin(elapsedRef.current * 0.32 + index) * 0.035
    }
  })

  return (
    <group
      position={stage.position}
      ref={runnerRef}
      rotation={[0, stage.yaw, 0]}
      userData={{
        actualAnimationPath: zombie.glb.run.path,
        actualAssetPath: zombie.glb.riggedBase.path,
        actualClipName: zombie.glb.run.expectedClipName,
        variantId: zombie.id,
      }}
    >
      <primitive object={model} />
    </group>
  )
}

function LandrushRunningIsland() {
  return (
    <group>
      <mesh position={[0, -0.62, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[42, 96]} />
        <meshStandardMaterial color="#1687a4" metalness={0.08} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <cylinderGeometry args={[12.65, 13.2, 0.58, 64]} />
        <meshStandardMaterial color="#d9ad68" flatShading roughness={0.96} />
      </mesh>
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[11.9, 12.25, 0.36, 64]} />
        <meshStandardMaterial color="#6f9f55" flatShading roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.205, 0]} receiveShadow>
        <boxGeometry args={[18.5, 0.05, 1.05]} />
        <meshStandardMaterial color="#c8ae75" roughness={0.96} />
      </mesh>
      {RUNNER_STAGES.map((stage, index) => (
        <group key={ZOMBIE_ESCAPE_ZOMBIE_CATALOG[index]!.id} position={stage.position}>
          <mesh position={[0, -0.02, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.32, 32]} />
            <meshStandardMaterial color="#b9955b" roughness={0.98} />
          </mesh>
          <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.12, 1.24, 32]} />
            <meshBasicMaterial color={stage.accent} opacity={0.68} transparent />
          </mesh>
          <mesh position={[0, 0.025, 0.84]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.38, 0.08]} />
            <meshBasicMaterial color={stage.accent} />
          </mesh>
        </group>
      ))}
      <IslandPalm position={[-10.1, 0.1, -6.4]} rotation={0.45} />
      <IslandPalm position={[10.2, 0.1, -6.1]} rotation={-0.55} />
      <IslandPalm position={[-10.3, 0.1, 6]} rotation={0.9} />
      <IslandPalm position={[10.1, 0.1, 6.35]} rotation={-0.8} />
      {GRASS_TUFT_POSITIONS.map(([x, z], index) => (
        <group key={`${x}-${z}`} position={[x, 0.25, z]} rotation={[0, index * 0.73, 0]}>
          {[-0.2, 0, 0.2].map((offset) => (
            <mesh key={offset} position={[offset, 0, 0]} rotation={[0, 0, offset * 1.8]}>
              <coneGeometry args={[0.08, 0.62 + Math.abs(offset), 4]} />
              <meshStandardMaterial color="#9ac45a" flatShading roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function IslandPalm({
  position,
  rotation,
}: {
  position: [number, number, number]
  rotation: number
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 1.35, 0]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.18, 0.28, 2.7, 7]} />
        <meshStandardMaterial color="#79543a" flatShading roughness={0.98} />
      </mesh>
      {[0, 1, 2, 3, 4].map((leaf) => (
        <mesh
          castShadow
          key={leaf}
          position={[0, 2.75, 0]}
          rotation={[0.16, (leaf / 5) * Math.PI * 2, Math.PI / 2]}
        >
          <coneGeometry args={[0.34, 2.15, 5]} />
          <meshStandardMaterial color={leaf % 2 === 0 ? '#3e8650' : '#4e9957'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

class RunnerAssetBoundary extends Component<
  {
    children: ReactNode
    id: string
    onStatus: (id: string, status: RunnerStatus) => void
    requestedClip: string
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onStatus(this.props.id, {
      clipName: this.props.requestedClip,
      detail: error.message,
      state: 'error',
    })
  }

  render() {
    return this.state.error ? null : this.props.children
  }
}

function computeRunnerTransform(source: Group, characterHeightMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = characterHeightMeters / Math.max(0.000_1, size.y)
  return {
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
  }
}
