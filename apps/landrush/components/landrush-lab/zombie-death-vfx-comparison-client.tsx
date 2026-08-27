'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { ZombieEscapeActors } from './zombie-escape-actors'
import { resolveZombieEscapeAttackNormalizedPhase } from './zombie-escape-attack-presentation'
import { resolveZombieEscapeDeathNormalizedPhase } from './zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SEED, ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import type { ZombieEscapeDeathDustVariant } from './zombie-escape-death-dust'
import { ZombieEscapeEffects } from './zombie-escape-effects'
import type { ZombieEscapeGeneratedAssetReadinessSnapshot } from './zombie-escape-generated-asset-readiness'
import {
  createZombieEscapeSimulation,
  spawnZombieEscapeZombie,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { createZombieEscapeArena } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

const ATTACK_END_SECONDS = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
const HIT_END_SECONDS = ATTACK_END_SECONDS + 0.46
const DEATH_START_SECONDS = HIT_END_SECONDS
const COMPARISON_CYCLE_SECONDS =
  DEATH_START_SECONDS + ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds + 0.35
const COMPARISON_RENDERER_CACHE = new WeakMap<HTMLCanvasElement, Promise<WebGPURenderer>>()
const COMPARISON_ZOMBIE_ASSET_KEY = `zombie:${ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]!.id}`
const COMPARISON_ATTACK_WALK_SPEED = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]!.movement.walkMetersPerSecond
const COMPARISON_CAMERA_HORIZONTAL_LENGTH = Math.hypot(3.45, 4.85)
const COMPARISON_ATTACK_DIRECTION_X = 4.85 / COMPARISON_CAMERA_HORIZONTAL_LENGTH
const COMPARISON_ATTACK_DIRECTION_Z = -3.45 / COMPARISON_CAMERA_HORIZONTAL_LENGTH
const COMPARISON_ATTACK_TRAVEL_METERS = COMPARISON_ATTACK_WALK_SPEED * ATTACK_END_SECONDS
const COMPARISON_ATTACK_START_X =
  (-COMPARISON_ATTACK_DIRECTION_X * COMPARISON_ATTACK_TRAVEL_METERS) / 2
const COMPARISON_ATTACK_START_Z =
  (-COMPARISON_ATTACK_DIRECTION_Z * COMPARISON_ATTACK_TRAVEL_METERS) / 2

export type ZombieDeathVfxComparisonMotion = 'attack-walk' | 'death'

function createComparisonRenderer(props: { canvas?: HTMLCanvasElement }) {
  const canvas = props.canvas
  const cached = canvas ? COMPARISON_RENDERER_CACHE.get(canvas) : undefined
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
  if (canvas) COMPARISON_RENDERER_CACHE.set(canvas, promise)
  return promise
}

type ZombieDeathVfxComparisonState = Readonly<{
  assetReady: boolean
  attackCooldown: number
  attackPhase: number
  backend: 'pending' | 'webgpu'
  cycleSeconds: number
  deathPhase: number
  distanceMeters: number
  dpr: number
  intent: number
  locomotionBlend: number
  motion: ZombieDeathVfxComparisonMotion
  runBlend: number
  seed: number
  speedMetersPerSecond: number
  variant: ZombieEscapeDeathDustVariant
  zombieX: number
  zombieZ: number
}>

declare global {
  interface Window {
    __ZOMBIE_DEATH_VFX_COMPARISON__?: {
      getState: () => ZombieDeathVfxComparisonState
      play: () => void
      restart: () => void
      setTime: (seconds: number) => void
    }
  }
}

export function ZombieDeathVfxComparisonClient({
  motion,
  variant,
}: {
  motion: ZombieDeathVfxComparisonMotion
  variant: ZombieEscapeDeathDustVariant
}) {
  const assetReadyRef = useRef(false)
  const [assetReady, setAssetReady] = useState(false)
  const handleReadiness = useCallback((snapshot: ZombieEscapeGeneratedAssetReadinessSnapshot) => {
    const comparisonZombieReady = snapshot.readyKeys.includes(COMPARISON_ZOMBIE_ASSET_KEY)
    assetReadyRef.current = comparisonZombieReady
    setAssetReady(comparisonZombieReady)
  }, [])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#77a998] text-[#fff8df] [&_canvas]:h-full [&_canvas]:w-full">
      <Canvas
        camera={{ far: 80, fov: 38, near: 0.05, position: [3.45, 2.25, 4.85] }}
        dpr={1}
        frameloop="always"
        gl={createComparisonRenderer as never}
        onCreated={({ camera, gl }) => {
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
          camera.lookAt(0, 0.82, 0)
          camera.updateMatrixWorld()
        }}
        shadows={false}
      >
        <ZombieDeathVfxComparisonWorld
          assetReadyRef={assetReadyRef}
          motion={motion}
          onReadiness={handleReadiness}
          variant={variant}
        />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/35 bg-[#253c37]/80 px-4 py-3 shadow-xl backdrop-blur-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8d7ad]">
          {motion === 'attack-walk'
            ? 'Zombie walking strike · fixed seed / camera / clock'
            : 'Zombie death VFX · fixed seed / camera / budget'}
        </div>
        <div className="mt-1 text-lg font-bold">
          {motion === 'attack-walk'
            ? `Dockworker · ${COMPARISON_ATTACK_WALK_SPEED.toFixed(2)} m/s · ${ATTACK_END_SECONDS.toFixed(2)} s`
            : formatVariantLabel(variant)}
        </div>
        <div className="mt-1 text-xs text-white/70">
          {assetReady ? 'Capture ready' : 'Loading the comparison zombie…'}
        </div>
      </div>
    </main>
  )
}

function ZombieDeathVfxComparisonWorld({
  assetReadyRef,
  motion,
  onReadiness,
  variant,
}: {
  assetReadyRef: { current: boolean }
  motion: ZombieDeathVfxComparisonMotion
  onReadiness: (snapshot: ZombieEscapeGeneratedAssetReadinessSnapshot) => void
  variant: ZombieEscapeDeathDustVariant
}) {
  const cycleDuration = motion === 'attack-walk' ? ATTACK_END_SECONDS : COMPARISON_CYCLE_SECONDS
  const arena = useMemo(() => createZombieEscapeArena(ZOMBIE_ESCAPE_SEED), [])
  const [simulation] = useState(() => {
    const next = createZombieEscapeSimulation(arena, ZOMBIE_ESCAPE_SEED, [], {
      zombieCapacity: ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
    })
    const slot = spawnZombieEscapeZombie(next, 0, 0, 100)
    if (slot !== 0) throw new Error('The death VFX comparison could not reserve zombie slot zero.')
    initializeComparisonZombie(next)
    return next
  })
  const simulationRef = useRef<ZombieEscapeSimulation>(simulation)
  const impactVisualRegistry = useMemo(createZombieEscapeImpactVisualRegistry, [])
  const manualTimeRef = useRef<number | null>(null)
  const restartRequestedRef = useRef(false)
  const automaticStartRef = useRef<number | null>(null)
  const comparisonStateRef = useRef<ZombieDeathVfxComparisonState>({
    assetReady: false,
    attackCooldown: ATTACK_END_SECONDS,
    attackPhase: 0,
    backend: 'pending',
    cycleSeconds: 0,
    deathPhase: 0,
    distanceMeters: 0,
    dpr: 1,
    intent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
    locomotionBlend: 0,
    motion,
    runBlend: 0,
    seed: ZOMBIE_ESCAPE_SEED,
    speedMetersPerSecond: 0,
    variant,
    zombieX: 0,
    zombieZ: 0,
  })

  useEffect(() => {
    const bridge = {
      getState: () => comparisonStateRef.current,
      play: () => {
        manualTimeRef.current = null
        restartRequestedRef.current = true
      },
      restart: () => {
        manualTimeRef.current = 0
      },
      setTime: (seconds: number) => {
        manualTimeRef.current = Math.max(0, Math.min(cycleDuration, seconds))
      },
    }
    window.__ZOMBIE_DEATH_VFX_COMPARISON__ = bridge
    return () => {
      if (window.__ZOMBIE_DEATH_VFX_COMPARISON__ === bridge) {
        delete window.__ZOMBIE_DEATH_VFX_COMPARISON__
      }
    }
  }, [cycleDuration])

  useFrame((state) => {
    if (automaticStartRef.current === null || restartRequestedRef.current) {
      automaticStartRef.current = state.clock.elapsedTime
      restartRequestedRef.current = false
    }
    const cycleSeconds =
      manualTimeRef.current ?? (state.clock.elapsedTime - automaticStartRef.current) % cycleDuration
    applyComparisonZombieTime(simulation, cycleSeconds, motion)
    const zombies = simulation.zombies
    const zombieX = zombies.x[0] ?? 0
    const zombieZ = zombies.z[0] ?? 0
    const attackDistance =
      (zombieX - COMPARISON_ATTACK_START_X) * COMPARISON_ATTACK_DIRECTION_X +
      (zombieZ - COMPARISON_ATTACK_START_Z) * COMPARISON_ATTACK_DIRECTION_Z
    comparisonStateRef.current = {
      assetReady: assetReadyRef.current,
      attackCooldown: zombies.attackCooldown[0] ?? 0,
      attackPhase:
        motion === 'attack-walk'
          ? resolveZombieEscapeAttackNormalizedPhase(zombies.attackCooldown[0] ?? 0)
          : 0,
      backend: (state.gl as unknown as { isWebGPURenderer?: boolean }).isWebGPURenderer
        ? 'webgpu'
        : 'pending',
      cycleSeconds,
      deathPhase:
        zombies.health[0]! <= 0
          ? resolveZombieEscapeDeathNormalizedPhase(zombies.deathPresentationSeconds[0]!)
          : 0,
      distanceMeters: motion === 'attack-walk' ? Math.max(0, attackDistance) : 0,
      dpr: state.gl.getPixelRatio(),
      intent: zombies.intent[0] ?? ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      locomotionBlend: zombies.locomotionBlend[0] ?? 0,
      motion,
      runBlend: zombies.runBlend[0] ?? 0,
      seed: ZOMBIE_ESCAPE_SEED,
      speedMetersPerSecond: Math.hypot(zombies.vx[0] ?? 0, zombies.vz[0] ?? 0),
      variant,
      zombieX,
      zombieZ,
    }
  }, -30)

  return (
    <>
      <color args={['#77a998']} attach="background" />
      <hemisphereLight color="#fff1c9" groundColor="#31574a" intensity={2.3} />
      <directionalLight color="#ffe0a5" intensity={3.4} position={[4, 8, 5]} />
      <ambientLight color="#b8d9ca" intensity={0.46} />
      <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, -0.035]}>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#718d5f" roughness={1} />
      </mesh>
      <mesh position={[-1.3, 0.23, 1.05]} rotation={[0.08, 0.34, -0.04]}>
        <dodecahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#596b53" roughness={1} />
      </mesh>
      <Suspense fallback={null}>
        <ZombieEscapeActors
          impactVisualRegistry={impactVisualRegistry}
          onGeneratedAssetsReadinessChange={onReadiness}
          quality="balanced"
          renderPlayer={false}
          simulationRef={simulationRef}
          zombieMaterialPhaseActive
        />
      </Suspense>
      <ZombieEscapeEffects
        deathDustVariant={variant}
        impactVisualRegistry={impactVisualRegistry}
        simulationRef={simulationRef}
      />
    </>
  )
}

function initializeComparisonZombie(simulation: ZombieEscapeSimulation) {
  simulation.elapsedSeconds = 0
  simulation.paused = false
  simulation.phase = 'night'
  simulation.player.x = 0
  simulation.player.y = 0
  simulation.player.z = 3.4
  simulation.status = 'playing'
  simulation.waveState = 'active'
  const zombies = simulation.zombies
  zombies.variant[0] = 0
  zombies.x[0] = 0
  zombies.y[0] = 0
  zombies.z[0] = 0
  zombies.heading[0] = 0
  zombies.vx[0] = 0
  zombies.vz[0] = 0
  zombies.locomotionBlend[0] = 0
  zombies.runBlend[0] = 0
}

function applyComparisonZombieTime(
  simulation: ZombieEscapeSimulation,
  cycleSeconds: number,
  motion: ZombieDeathVfxComparisonMotion,
) {
  const zombies = simulation.zombies
  if (cycleSeconds < simulation.elapsedSeconds) initializeComparisonZombie(simulation)
  simulation.elapsedSeconds = cycleSeconds
  if (motion === 'attack-walk') {
    applyComparisonWalkingStrike(simulation, cycleSeconds)
    return
  }
  zombies.x[0] = 0
  zombies.y[0] = 0
  zombies.z[0] = 0
  zombies.heading[0] = 0
  zombies.vx[0] = 0
  zombies.vz[0] = 0
  zombies.hitImpulseX[0] = 0.78
  zombies.hitImpulseY[0] = 0.16
  zombies.hitImpulseZ[0] = -0.46

  if (cycleSeconds < ATTACK_END_SECONDS) {
    zombies.health[0] = 100
    zombies.deathPresentationSeconds[0] = 0
    zombies.hitFlash[0] = 0
    zombies.hitReaction[0] = 0
    zombies.intent[0] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
    zombies.attackCooldown[0] = Math.max(0, ATTACK_END_SECONDS - cycleSeconds)
    return
  }
  if (cycleSeconds < HIT_END_SECONDS) {
    const hitProgress = (cycleSeconds - ATTACK_END_SECONDS) / (HIT_END_SECONDS - ATTACK_END_SECONDS)
    zombies.health[0] = 100
    zombies.deathPresentationSeconds[0] = 0
    zombies.hitFlash[0] = Math.max(0, 1 - hitProgress * 1.35)
    zombies.hitReaction[0] = Math.max(0, 1 - hitProgress)
    zombies.intent[0] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
    zombies.attackCooldown[0] = 0
    return
  }
  const deathElapsed = cycleSeconds - DEATH_START_SECONDS
  zombies.health[0] = 0
  zombies.deathPresentationSeconds[0] = Math.max(
    0,
    ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds - deathElapsed,
  )
  zombies.hitFlash[0] = 0
  zombies.hitReaction[0] = Math.max(
    0,
    1 - deathElapsed / ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds,
  )
  zombies.intent[0] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
  zombies.attackCooldown[0] = 0
}

function applyComparisonWalkingStrike(simulation: ZombieEscapeSimulation, cycleSeconds: number) {
  const zombies = simulation.zombies
  const strikeSeconds = Math.min(ATTACK_END_SECONDS, Math.max(0, cycleSeconds))
  const distanceMeters = COMPARISON_ATTACK_WALK_SPEED * strikeSeconds
  zombies.x[0] = COMPARISON_ATTACK_START_X + COMPARISON_ATTACK_DIRECTION_X * distanceMeters
  zombies.y[0] = 0
  zombies.z[0] = COMPARISON_ATTACK_START_Z + COMPARISON_ATTACK_DIRECTION_Z * distanceMeters
  zombies.heading[0] = Math.atan2(COMPARISON_ATTACK_DIRECTION_X, COMPARISON_ATTACK_DIRECTION_Z)
  zombies.vx[0] = COMPARISON_ATTACK_DIRECTION_X * COMPARISON_ATTACK_WALK_SPEED
  zombies.vz[0] = COMPARISON_ATTACK_DIRECTION_Z * COMPARISON_ATTACK_WALK_SPEED
  zombies.locomotionBlend[0] = 1
  zombies.runBlend[0] = 0
  zombies.locomotionPhase[0] = distanceMeters * 2.2
  zombies.health[0] = 100
  zombies.deathPresentationSeconds[0] = 0
  zombies.hitFlash[0] = 0
  zombies.hitReaction[0] = 0
  zombies.hitImpulseX[0] = 0
  zombies.hitImpulseY[0] = 0
  zombies.hitImpulseZ[0] = 0
  zombies.intent[0] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
  zombies.attackCooldown[0] = ATTACK_END_SECONDS - strikeSeconds
  zombies.attackContactResolved[0] =
    strikeSeconds >= ATTACK_END_SECONDS * ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase
      ? 1
      : 0
}

function formatVariantLabel(variant: ZombieEscapeDeathDustVariant) {
  switch (variant) {
    case 'alpha-hash-puffs':
      return '1 · Alpha-hashed procedural puffs'
    case 'low-poly-puffs':
      return '2 · Opaque low-poly puff meshes'
    case 'ellipsoid-impostors':
      return '3 · Depth-writing ellipsoid volumes'
    case 'toon-flipbook':
      return '4 · Toon flipbook + alpha-to-coverage'
    case 'ground-clods':
      return '5 · Ground shock ring + clod spray'
  }
}
