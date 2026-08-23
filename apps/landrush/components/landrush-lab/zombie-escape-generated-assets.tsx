'use client'

import { useGLTFKTX2 } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Component,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Euler,
  Group,
  LoopRepeat,
  type Material,
  type Mesh,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { ZombieEscapeQuality } from './zombie-escape-config'
import {
  resolveZombieEscapeGeneratedAssetSettlement,
  tryCreateZombieEscapeGeneratedAsset,
  type ZombieEscapeGeneratedAssetTerminalStatus,
} from './zombie-escape-generated-asset-readiness'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import {
  createZombieEscapeHeldWeaponRenderRepresentativeKey,
  createZombieEscapeRenderReadinessCoordinator,
  createZombieEscapeZombieRenderRepresentativeKey,
  ZOMBIE_ESCAPE_PICKUP_RENDER_REPRESENTATIVE_KEY,
  type ZombieEscapePipelineRenderer,
  type ZombieEscapeRenderReadinessCoordinator,
  type ZombieEscapeRenderReadinessRegistry,
  type ZombieEscapeRenderReadinessSnapshot,
  type ZombieEscapeRenderReadinessStatus,
} from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'
import {
  registerZombieEscapeImpactVisual,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'
import {
  ZOMBIE_ESCAPE_WEAPON_CATALOG,
  type ZombieEscapeWeaponSpecification,
} from './zombie-escape-weapon-catalog'
import {
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
  type ZombieEscapeZombieCatalogEntry,
} from './zombie-escape-zombie-catalog'

export type GeneratedZombieVisual = {
  animationRoot: Group
  generation: number
  hitMaterials: Array<{
    baseColor: Color | null
    baseEmissive: Color
    baseEmissiveIntensity: number
    material: Material & { color?: Color; emissive: Color; emissiveIntensity: number }
  }>
  mixer: AnimationMixer
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
const GENERATED_BALANCED_ASSET_KEYS = [
  ...GENERATED_WEAPON_ASSET_KEYS,
  ...GENERATED_ZOMBIE_ASSET_KEYS,
]
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
  return {
    contentReady: true as const,
    diagnostic: {
      level: status.state === 'failed' ? ('error' as const) : ('warning' as const),
      message: status.message,
    },
  }
}

export function clearZombieEscapeGeneratedAssetCaches(failedKeys?: readonly string[]) {
  const paths = failedKeys
    ? failedKeys.flatMap((key) => GENERATED_ASSET_PATHS_BY_KEY.get(key) ?? [])
    : Array.from(GENERATED_ASSET_PATHS_BY_KEY.values()).flat()
  for (const path of new Set(paths)) useGLTF.clear(path)
}

export function ZombieEscapeGeneratedAssets({
  impactVisualRegistry,
  loadedZombieVariantsRef,
  omitHeldWeapon = false,
  onGeneratedAssetsFailureChange,
  onGeneratedAssetsReadyChange,
  quality,
  renderReadinessRegistry,
  retryGeneration = 0,
  simulationRef,
  zombiePresentationFramePriority,
}: {
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  omitHeldWeapon?: boolean
  onGeneratedAssetsFailureChange?: (failures: readonly ZombieEscapeGeneratedAssetFailure[]) => void
  onGeneratedAssetsReadyChange?: (ready: boolean) => void
  quality: ZombieEscapeQuality
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  retryGeneration?: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  zombiePresentationFramePriority?: number
}) {
  const { camera, gl, scene } = useThree()
  const expectedKeys =
    quality === 'balanced' ? GENERATED_BALANCED_ASSET_KEYS : GENERATED_WEAPON_ASSET_KEYS
  const [allocationReadiness, setAllocationReadiness] = useState({
    generation: retryGeneration,
    ready: false,
  })
  const coordinatorRef = useRef<ZombieEscapeRenderReadinessCoordinator | null>(null)
  if (!coordinatorRef.current) {
    coordinatorRef.current = createZombieEscapeRenderReadinessCoordinator()
  }
  const renderReadinessSnapshot = useSyncExternalStore(
    renderReadinessRegistry?.subscribe ?? subscribeToNoRenderReadinessRegistry,
    renderReadinessRegistry?.getSnapshot ?? getEmptyRenderReadinessSnapshot,
    renderReadinessRegistry?.getSnapshot ?? getEmptyRenderReadinessSnapshot,
  )
  const allocationReady =
    allocationReadiness.generation === retryGeneration && allocationReadiness.ready
  const readinessRef = useRef<{
    generation: number
    statuses: Map<string, ZombieEscapeGeneratedAssetTerminalStatus>
  }>({ generation: retryGeneration, statuses: new Map() })
  if (readinessRef.current.generation !== retryGeneration) {
    readinessRef.current = { generation: retryGeneration, statuses: new Map() }
  }
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
      if (renderReadinessRegistry) {
        setAllocationReadiness((current) =>
          current.generation === retryGeneration && current.ready === settlement.ready
            ? current
            : { generation: retryGeneration, ready: settlement.ready },
        )
        if (!settlement.ready) onGeneratedAssetsReadyChange?.(false)
      } else {
        onGeneratedAssetsReadyChange?.(settlement.ready)
      }
    },
    [
      expectedKeys,
      onGeneratedAssetsFailureChange,
      onGeneratedAssetsReadyChange,
      renderReadinessRegistry,
      retryGeneration,
    ],
  )

  useEffect(() => {
    const coordinator = coordinatorRef.current
    if (!(coordinator && renderReadinessRegistry)) return
    onGeneratedAssetsReadyChange?.(false)
    if (!(allocationReady && renderReadinessSnapshot.complete)) {
      coordinator.invalidate()
      return
    }

    void coordinator.request(
      {
        camera,
        generation: retryGeneration,
        identity: renderReadinessSnapshot,
        representatives: renderReadinessSnapshot.representatives,
        renderer: gl as unknown as ZombieEscapePipelineRenderer,
        targetScene: scene,
      },
      (status) => {
        const settlement = resolveZombieEscapeRenderPipelineSettlement(status)
        if (settlement.diagnostic?.level === 'error') {
          console.error(
            '[zombie-escape] Render pipeline prewarm failed; continuing with loaded content.',
            settlement.diagnostic.message,
          )
        } else if (settlement.diagnostic) {
          console.warn(
            '[zombie-escape] Render pipeline prewarm timed out; continuing with loaded content.',
            settlement.diagnostic.message,
          )
        }
        onGeneratedAssetsReadyChange?.(settlement.contentReady)
      },
    )
  }, [
    allocationReady,
    camera,
    gl,
    onGeneratedAssetsReadyChange,
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
          impactVisualRegistry={impactVisualRegistry}
          loadedZombieVariantsRef={loadedZombieVariantsRef}
          onAssetStatusChange={reportAssetStatus}
          renderReadinessRegistry={renderReadinessRegistry}
          retryGeneration={retryGeneration}
          simulationRef={simulationRef}
          zombiePresentationFramePriority={zombiePresentationFramePriority}
        />
      ) : null}
    </>
  )
}

function ZombieEscapeGeneratedWeapons({
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
}

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
    const pickup = simulation.weaponPickups.find(
      (candidate) => candidate.weaponIndex === weaponIndex,
    )
    marker.visible = Boolean(pickup) && simulation.purchasedWeapons[weaponIndex] === 0
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

export function GeneratedWeaponModel({
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
}

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

function ZombieEscapeGeneratedZombies({
  impactVisualRegistry,
  loadedZombieVariantsRef,
  onAssetStatusChange,
  renderReadinessRegistry,
  retryGeneration,
  simulationRef,
  zombiePresentationFramePriority,
}: {
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  onAssetStatusChange: GeneratedAssetStatusReporter
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  retryGeneration: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  zombiePresentationFramePriority?: number
}) {
  const prewarmCoordinatorRef = useRef<ZombieVisualPrewarmCoordinator>({
    claimed: false,
    frameToken: Number.NaN,
  })
  return (
    <group
      userData={{
        generatedZombieVariantCapacity: ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
        loading: 'before-first-spawn',
      }}
    >
      {ZOMBIE_VARIANT_INDICES.map((variantIndex) => {
        const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variantIndex]
        if (!zombie) return null
        return (
          <GeneratedAssetErrorBoundary
            assetKey={`zombie:${zombie.id}`}
            key={`${zombie.id}:${retryGeneration}`}
            onAssetStatusChange={onAssetStatusChange}
          >
            <Suspense fallback={null}>
              <GeneratedZombieVariant
                framePriority={zombiePresentationFramePriority ?? -17}
                impactVisualRegistry={impactVisualRegistry}
                loadedZombieVariantsRef={loadedZombieVariantsRef}
                onAssetStatusChange={onAssetStatusChange}
                prewarmCoordinatorRef={prewarmCoordinatorRef}
                renderReadinessRegistry={renderReadinessRegistry}
                simulationRef={simulationRef}
                variantIndex={variantIndex}
                zombie={zombie}
              />
            </Suspense>
          </GeneratedAssetErrorBoundary>
        )
      })}
    </group>
  )
}

function GeneratedZombieVariant({
  framePriority,
  impactVisualRegistry,
  loadedZombieVariantsRef,
  onAssetStatusChange,
  prewarmCoordinatorRef,
  renderReadinessRegistry,
  simulationRef,
  variantIndex,
  zombie,
}: {
  framePriority: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  onAssetStatusChange: GeneratedAssetStatusReporter
  prewarmCoordinatorRef: MutableRefObject<ZombieVisualPrewarmCoordinator>
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  variantIndex: number
  zombie: ZombieEscapeZombieCatalogEntry
}) {
  const riggedGltf = useGLTFKTX2(zombie.glb.riggedBase.path)
  const runGltf = useGLTF(zombie.glb.run.path)
  const walkGltf = useGLTF(zombie.glb.walk.path)
  const groupRef = useRef<Group>(null)
  const visualsRef = useRef(new Map<number, GeneratedZombieVisual>())
  const pooledVisualsRef = useRef<GeneratedZombieVisual[]>([])
  const prewarmReadyRef = useRef(false)
  const visualCreationFailedRef = useRef(false)
  const unregisterRenderRepresentativeRef = useRef<(() => void) | null>(null)
  const assetKey = `zombie:${zombie.id}`
  const targetPoolSize = useMemo(() => {
    let count = 0
    for (const rosterVariant of simulationRef.current.variantByPoolSlot) {
      if (rosterVariant === variantIndex) count += 1
    }
    return count
  }, [simulationRef, variantIndex])
  const presentationPose = useMemo(() => createZombieEscapePresentationPose(), [])
  const modelTransform = useMemo(
    () => computeZombieTransform(riggedGltf.scene, zombie.characterHeightMeters),
    [riggedGltf.scene, zombie.characterHeightMeters],
  )
  const runClip = useMemo(
    () => runGltf.animations.find((clip) => clip.name === zombie.glb.run.expectedClipName) ?? null,
    [runGltf.animations, zombie.glb.run.expectedClipName],
  )
  const walkClip = useMemo(
    () =>
      walkGltf.animations.find((clip) => clip.name === zombie.glb.walk.expectedClipName) ?? null,
    [walkGltf.animations, zombie.glb.walk.expectedClipName],
  )

  useEffect(() => {
    loadedZombieVariantsRef.current.add(variantIndex)
    visualCreationFailedRef.current = false
    if (targetPoolSize === 0) {
      prewarmReadyRef.current = true
      onAssetStatusChange(assetKey, { state: 'ready' })
    }
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
    }
  }, [assetKey, loadedZombieVariantsRef, onAssetStatusChange, targetPoolSize, variantIndex])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group || visualCreationFailedRef.current) return
    const frameUpdate = tryCreateZombieEscapeGeneratedAsset(() => {
      const simulation = simulationRef.current
      const zombies = simulation.zombies
      const visuals = visualsRef.current

      if (!prewarmReadyRef.current) {
        const visualCount = visuals.size + pooledVisualsRef.current.length
        if (visualCount >= targetPoolSize) {
          prewarmReadyRef.current = true
          onAssetStatusChange(assetKey, { state: 'ready' })
        } else if (
          claimZombieVisualPrewarmFrame(prewarmCoordinatorRef.current, state.clock.elapsedTime)
        ) {
          const visual = createZombieVisual({
            active: false,
            group,
            generation: 0,
            impactVisualRegistry,
            modelTransform,
            runClip,
            source: riggedGltf.scene,
            slot: null,
            walkClip,
          })
          registerZombieRenderRepresentative(
            visual,
            unregisterRenderRepresentativeRef,
            renderReadinessRegistry,
            zombie.id,
          )
          pooledVisualsRef.current.push(visual)
          if (visualCount + 1 >= targetPoolSize) {
            prewarmReadyRef.current = true
            onAssetStatusChange(assetKey, { state: 'ready' })
          }
        }
      }

      for (const [slot, visual] of visuals) {
        if (
          zombies.pool.active[slot] !== 0 &&
          zombies.pool.generation[slot] === visual.generation &&
          zombies.variant[slot] === variantIndex
        ) {
          continue
        }
        parkZombieVisual(visual)
        pooledVisualsRef.current.push(visual)
        visuals.delete(slot)
      }

      for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
        if (zombies.pool.active[slot] === 0 || zombies.variant[slot] !== variantIndex) continue
        let visual = visuals.get(slot)
        if (!visual) {
          const generation = zombies.pool.generation[slot] ?? 0
          visual = pooledVisualsRef.current.pop()
          if (visual) {
            visuals.set(slot, visual)
            activateZombieVisual(visual, impactVisualRegistry, slot, generation)
          } else {
            visual = createZombieVisual({
              active: true,
              group,
              generation,
              impactVisualRegistry,
              modelTransform,
              runClip,
              source: riggedGltf.scene,
              slot,
              walkClip,
            })
            registerZombieRenderRepresentative(
              visual,
              unregisterRenderRepresentativeRef,
              renderReadinessRegistry,
              zombie.id,
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
        const runBlend = zombies.runBlend[slot] ?? 0
        visual.walkAction?.setEffectiveWeight(1 - runBlend)
        visual.walkAction?.setEffectiveTimeScale(0.82 + (zombies.speedScale[slot] ?? 1) * 0.18)
        visual.runAction?.setEffectiveWeight(runBlend)
        visual.runAction?.setEffectiveTimeScale(0.9 + runBlend * 0.35)
        visual.mixer.update(simulation.paused ? 0 : Math.min(0.05, Math.max(0, delta)))
      }
    })
    if (!frameUpdate.ok) {
      visualCreationFailedRef.current = true
      console.error(
        `[zombie-escape] Failed to update generated asset ${assetKey}.`,
        frameUpdate.message,
      )
      onAssetStatusChange(assetKey, { message: frameUpdate.message, state: 'failed' })
    }
  }, framePriority)

  return <group ref={groupRef} userData={{ zombieAssetId: zombie.id }} />
}

export function createZombieVisual({
  active,
  group,
  generation,
  impactVisualRegistry,
  modelTransform,
  runClip,
  source,
  slot,
  walkClip,
}: {
  active: boolean
  group: Group
  generation: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  modelTransform: ReturnType<typeof computeZombieTransform>
  runClip: AnimationClip | null
  source: Group
  slot: number | null
  walkClip: AnimationClip | null
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
          const material = sourceMaterial.clone()
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
    for (const action of [walkAction, runAction]) {
      action?.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      if (active) action?.play()
    }
    unregisterImpactVisual =
      active && slot !== null
        ? registerZombieEscapeImpactVisual(impactVisualRegistry, slot, generation, visualRoot)
        : () => undefined
    const visual = {
      animationRoot: visualRoot,
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

function registerZombieRenderRepresentative(
  visual: GeneratedZombieVisual,
  unregisterRef: MutableRefObject<(() => void) | null>,
  registry: ZombieEscapeRenderReadinessRegistry | undefined,
  zombieId: string,
) {
  if (!(registry && !unregisterRef.current)) return
  unregisterRef.current = registry.register(
    createZombieEscapeZombieRenderRepresentativeKey(zombieId),
    visual.root,
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

function activateZombieVisual(
  visual: GeneratedZombieVisual,
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry,
  slot: number,
  generation: number,
) {
  visual.generation = generation
  visual.unregisterImpactVisual = registerZombieEscapeImpactVisual(
    impactVisualRegistry,
    slot,
    generation,
    visual.animationRoot,
  )
  visual.walkAction?.reset().play()
  visual.runAction?.reset().play()
  visual.root.visible = true
}

function parkZombieVisual(visual: GeneratedZombieVisual) {
  visual.unregisterImpactVisual()
  visual.unregisterImpactVisual = () => undefined
  visual.walkAction?.stop()
  visual.runAction?.stop()
  visual.root.visible = false
}

function disposeZombieVisual(visual: GeneratedZombieVisual, group: Group | null) {
  try {
    visual.unregisterImpactVisual()
  } catch {}
  try {
    visual.mixer.stopAllAction()
  } catch {}
  try {
    visual.mixer.uncacheRoot(visual.animationRoot)
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
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
  }
}
