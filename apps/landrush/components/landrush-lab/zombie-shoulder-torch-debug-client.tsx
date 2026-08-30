'use client'

import { LandrushWorldNode } from '@landrush/pascal-plugin'
import { LandrushRobot } from '@landrush/pascal-plugin/landrush-world/robot'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, type Group, SRGBColorSpace } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import {
  LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGN_LABELS,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS,
  LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  resolveLandrushRobotShoulderTorchGeometryBudget,
} from './landrush-robot-shoulder-torch'
import {
  LandrushRobotShoulderTorchFixture,
  LandrushRobotShoulderTorchRig,
  useLandrushRobotShoulderTorchPixelTexture,
} from './landrush-robot-shoulder-torch-rig'
import {
  createLandrushRobotWeaponCombatState,
  type LandrushRobotWeaponCombatState,
} from './landrush-robot-weapon-rig'

export type ZombieShoulderTorchDebugView = 'beam' | 'designs' | 'mounted'
export type ZombieShoulderTorchDebugMode = 'final' | 'fixture-only' | 'light-only'

const ZOMBIE_SHOULDER_TORCH_DEBUG_RENDERER_CACHE = new WeakMap<
  HTMLCanvasElement,
  Promise<WebGPURenderer>
>()

type ZombieShoulderTorchDebugSnapshot = {
  budget: ReturnType<typeof resolveLandrushRobotShoulderTorchGeometryBudget>
  camera: ZombieShoulderTorchDebugView
  design: typeof LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN
  dpr: 1
  mode: ZombieShoulderTorchDebugMode
  noPostProcessing: true
  ready: boolean
}

declare global {
  interface Window {
    __ZOMBIE_SHOULDER_TORCH_DEBUG__?: ZombieShoulderTorchDebugSnapshot
  }
}

export function ZombieShoulderTorchDebugClient({
  mode,
  view,
}: {
  mode: ZombieShoulderTorchDebugMode
  view: ZombieShoulderTorchDebugView
}) {
  const [canvasReady, setCanvasReady] = useState(false)
  const [subjectReady, setSubjectReady] = useState(view === 'designs')
  const budget = resolveLandrushRobotShoulderTorchGeometryBudget()
  const ready = canvasReady && subjectReady
  const handleSubjectReady = useCallback(() => setSubjectReady(true), [])

  useEffect(() => {
    const snapshot: ZombieShoulderTorchDebugSnapshot = {
      budget,
      camera: view,
      design: LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
      dpr: 1,
      mode,
      noPostProcessing: true,
      ready,
    }
    window.__ZOMBIE_SHOULDER_TORCH_DEBUG__ = snapshot
    return () => {
      if (window.__ZOMBIE_SHOULDER_TORCH_DEBUG__ === snapshot) {
        delete window.__ZOMBIE_SHOULDER_TORCH_DEBUG__
      }
    }
  }, [budget, mode, ready, view])

  const camera = resolveZombieShoulderTorchDebugCamera(view)
  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#030711] text-slate-100"
      data-ready={ready ? 'true' : 'false'}
      data-testid="zombie-shoulder-torch-debug"
    >
      <Canvas
        camera={{ far: 40, fov: camera.fov, near: 0.02, position: camera.position }}
        dpr={1}
        frameloop="always"
        gl={createZombieShoulderTorchDebugRenderer as never}
        key={view}
        onCreated={({ camera: sceneCamera, gl }) => {
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = view === 'beam' ? 0.82 : 1.05
          sceneCamera.lookAt(...camera.target)
          sceneCamera.updateMatrixWorld(true)
          setCanvasReady(true)
        }}
        shadows={false}
      >
        <ZombieShoulderTorchDebugWorld
          mode={mode}
          onSubjectReady={handleSubjectReady}
          view={view}
        />
      </Canvas>
      <section className="pointer-events-none absolute top-5 left-5 rounded-2xl border border-amber-100/20 bg-slate-950/78 px-4 py-3 shadow-2xl backdrop-blur-md">
        <p className="font-black text-[10px] text-amber-200 uppercase tracking-[0.24em]">
          Zombie shoulder torch · {view}
        </p>
        <h1 className="mt-1 font-black text-xl">Sentinel Mk II · selected</h1>
        <p className="mt-1 text-slate-300 text-xs">
          {budget.pairFixtureTriangles} fixture tris / pair · {budget.textureBytes} B armor texture
        </p>
        <p className="text-slate-400 text-xs">
          {budget.beamTriangles} beam tris · one unified spot light · no post
        </p>
      </section>
      {view === 'designs' ? <ZombieShoulderTorchDesignLabels /> : null}
      <div className="pointer-events-none absolute right-5 bottom-5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 font-semibold text-[10px] text-white/65 uppercase tracking-[0.18em]">
        {ready ? 'Capture ready' : 'Preparing fixed view'} · DPR 1 · 8×8 nearest texture
      </div>
    </main>
  )
}

function createZombieShoulderTorchDebugRenderer(props: { canvas?: HTMLCanvasElement }) {
  const canvas = props.canvas
  const cached = canvas ? ZOMBIE_SHOULDER_TORCH_DEBUG_RENDERER_CACHE.get(canvas) : undefined
  if (cached) return cached
  const promise = (async () => {
    const renderer = new WebGPURenderer({
      ...props,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    } as never)
    await renderer.init()
    return renderer
  })()
  if (canvas) ZOMBIE_SHOULDER_TORCH_DEBUG_RENDERER_CACHE.set(canvas, promise)
  return promise
}

function ZombieShoulderTorchDebugWorld({
  mode,
  onSubjectReady,
  view,
}: {
  mode: ZombieShoulderTorchDebugMode
  onSubjectReady: () => void
  view: ZombieShoulderTorchDebugView
}) {
  const beamView = view === 'beam'
  return (
    <>
      <color args={[beamView ? '#02050b' : '#08111d']} attach="background" />
      <hemisphereLight
        color={beamView ? '#56718a' : '#d7e8ff'}
        groundColor={beamView ? '#080b0b' : '#151c25'}
        intensity={beamView ? 0.28 : 1.25}
      />
      <directionalLight
        color={beamView ? '#6f8ca9' : '#fff0d6'}
        intensity={beamView ? 0.32 : 2.8}
        position={[3, 7, 2]}
      />
      <mesh position={[0, -0.01, 2.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 12]} />
        <meshStandardMaterial color={beamView ? '#101b17' : '#151f29'} roughness={0.96} />
      </mesh>
      {view === 'designs' ? (
        <ZombieShoulderTorchDesignGallery />
      ) : (
        <Suspense fallback={null}>
          <ZombieShoulderTorchRobotSubject mode={mode} onReady={onSubjectReady} view={view} />
        </Suspense>
      )}
      {beamView ? <ZombieShoulderTorchBeamTargets /> : null}
    </>
  )
}

function ZombieShoulderTorchDesignGallery() {
  const texture = useLandrushRobotShoulderTorchPixelTexture()
  return (
    <>
      {LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS.map((design, index) => {
        const x = (index - 1) * 1.35
        return (
          <group key={design} position={[x, 1.08, 0]} rotation={[-0.12, 0.12, 0]} scale={1.7}>
            <group position={[-0.13, 0, 0]}>
              <LandrushRobotShoulderTorchFixture design={design} texture={texture} />
            </group>
            <group position={[0.13, 0, 0]}>
              <LandrushRobotShoulderTorchFixture design={design} texture={texture} />
            </group>
          </group>
        )
      })}
      {LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS.map((design, index) => (
        <group key={`${design}-stand`} position={[(index - 1) * 1.35, 0.2, 0]}>
          <mesh position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.38, 0.46, 0.12, 8]} />
            <meshStandardMaterial color="#202b35" metalness={0.45} roughness={0.48} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.48, 0.5, 0.05, 8]} />
            <meshStandardMaterial color="#0c121a" metalness={0.25} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function ZombieShoulderTorchRobotSubject({
  mode,
  onReady,
  view,
}: {
  mode: ZombieShoulderTorchDebugMode
  onReady: () => void
  view: ZombieShoulderTorchDebugView
}) {
  const visualRootRef = useRef<Group | null>(null)
  const combatStateRef = useRef<LandrushRobotWeaponCombatState | null>(
    createLandrushRobotWeaponCombatState(),
  )
  const readyFramesRef = useRef(0)
  const node = useMemo(
    () =>
      LandrushWorldNode.parse({
        id: 'landrush-world_shoulder-torch-debug-player',
        landrushMode: 'walk',
        name: 'Shoulder torch Orbot',
        playerHeading: 0,
        playerMoving: false,
        playerPosition: [0, 0.02, 0],
        playerSpeed: 0,
      }),
    [],
  )
  const combat = combatStateRef.current
  if (combat) {
    combat.aimAngle = 0
    combat.movementHeading = 0
  }

  useFrame(() => {
    if (!visualRootRef.current || readyFramesRef.current > 14) return
    readyFramesRef.current += 1
    if (readyFramesRef.current === 14) onReady()
  }, 3)

  return (
    <group>
      <LandrushRobot
        animationPace={0.65}
        framePriority={2}
        node={node}
        visualRootRef={visualRootRef}
      />
      <LandrushRobotShoulderTorchRig
        combatStateRef={combatStateRef}
        emitSpotLights={mode !== 'fixture-only'}
        framePriority={2.6}
        showBeams={view === 'beam' && mode !== 'fixture-only'}
        showFixtures={mode !== 'light-only'}
        visualRootRef={visualRootRef}
      />
    </group>
  )
}

function ZombieShoulderTorchBeamTargets() {
  return (
    <>
      <mesh position={[-0.72, 0.24, 3.55]} rotation={[0.04, 0.32, -0.03]}>
        <boxGeometry args={[0.58, 0.5, 0.58]} />
        <meshStandardMaterial color="#5d4a36" metalness={0.08} roughness={0.9} />
      </mesh>
      <mesh position={[0.8, 0.16, 4.35]} rotation={[0, -0.42, 0]}>
        <dodecahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color="#39483e" metalness={0.03} roughness={1} />
      </mesh>
      <gridHelper args={[10, 40, '#344737', '#1b2921']} position={[0, 0.005, 2.4]} />
    </>
  )
}

function ZombieShoulderTorchDesignLabels() {
  return (
    <div className="pointer-events-none absolute right-[8%] bottom-[9%] left-[8%] grid grid-cols-3 gap-8 text-center">
      {LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS.map((design) => {
        const label = LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGN_LABELS[design]
        const budget = resolveLandrushRobotShoulderTorchGeometryBudget(design)
        return (
          <section
            className={`rounded-2xl border px-4 py-3 backdrop-blur-md ${
              design === LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN
                ? 'border-amber-200/45 bg-amber-950/35'
                : 'border-white/12 bg-slate-950/55'
            }`}
            key={design}
          >
            <h2 className="font-black text-sm">{label.name}</h2>
            <p className="mt-1 text-[11px] text-slate-300">{label.summary}</p>
            <p className="mt-1 font-mono text-[10px] text-amber-200/75">
              {budget.pairFixtureTriangles} tris / pair
            </p>
          </section>
        )
      })}
    </div>
  )
}

function resolveZombieShoulderTorchDebugCamera(view: ZombieShoulderTorchDebugView) {
  if (view === 'designs') {
    return {
      fov: 34,
      position: [0, 2.15, 5.15] as [number, number, number],
      target: [0, 1.02, 0] as [number, number, number],
    }
  }
  if (view === 'mounted') {
    return {
      fov: 31,
      position: [1.38, 1.92, 2.15] as [number, number, number],
      target: [0, 1.4, 0.02] as [number, number, number],
    }
  }
  return {
    fov: 42,
    position: [3.8, 3.25, -4.5] as [number, number, number],
    target: [0, 0.5, 2.7] as [number, number, number],
  }
}
