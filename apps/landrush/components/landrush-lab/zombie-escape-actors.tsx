'use client'

import { LandrushWorldNode } from '@landrush/pascal-plugin'
import { LandrushRobot } from '@landrush/pascal-plugin/landrush-world/robot'
import type { ZombieEscapeQuality } from '@landrush/zombie-gameplay/zombie-escape-config'
import { ZOMBIE_ESCAPE_DEFAULT_WEAPON } from '@landrush/zombie-gameplay/zombie-escape-config'
import {
  getZombieEscapeMeleeProgress,
  restoreZombieEscapeDefaultMuzzlePose,
  setZombieEscapePlayerMuzzlePose,
  type ZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-zombie-catalog'
import { useFrame } from '@react-three/fiber'
import {
  type MutableRefObject,
  memo,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import type { Camera, Group } from 'three'
import type { LandrushRobotShoulderTorchLightingState } from './landrush-robot-shoulder-torch'
import {
  createLandrushRobotWeaponCombatState,
  createLandrushRobotWeaponMuzzlePose,
  LandrushRobotWeaponRig,
} from './landrush-robot-weapon-rig'
import {
  resolveZombieEscapeAimReticleElevation,
  resolveZombieEscapeAimReticleYaw,
} from './zombie-escape-aim'
import type { ZombieEscapeGeneratedAssetReadinessSnapshot } from './zombie-escape-generated-asset-readiness'
import {
  type ZombieEscapeGeneratedAssetFailure,
  ZombieEscapeGeneratedAssets,
} from './zombie-escape-generated-assets'
import {
  ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,
  type ZombieEscapeRenderReadinessRegistry,
} from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'
import type { ZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import {
  createZombieEscapePresentationLodDebugSnapshot,
  type ZombieEscapePresentationLodDebugSnapshot,
} from './zombie-escape-visual-lod'

export const ZombieEscapeActors = memo(function ZombieEscapeActors({
  impactVisualRegistry,
  onGeneratedAssetsFailureChange,
  onGeneratedAssetsReadinessChange,
  playerColor = '#fff0a2',
  presentationFramePriority,
  quality,
  detailedZombies,
  renderReadinessCamera,
  renderReadinessRegistry,
  renderPlayer = true,
  retryGeneratedAssetsGeneration = 0,
  simulationRef,
  shoulderTorchLightingStateRef,
  zombieMaterialPhaseActive = true,
}: {
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  onGeneratedAssetsFailureChange?: (failures: readonly ZombieEscapeGeneratedAssetFailure[]) => void
  onGeneratedAssetsReadinessChange?: (
    readiness: ZombieEscapeGeneratedAssetReadinessSnapshot,
  ) => void
  playerColor?: string
  presentationFramePriority?: number
  quality: ZombieEscapeQuality
  detailedZombies?: boolean
  renderReadinessCamera?: Camera
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  renderPlayer?: boolean
  retryGeneratedAssetsGeneration?: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  shoulderTorchLightingStateRef?: RefObject<LandrushRobotShoulderTorchLightingState>
  zombieMaterialPhaseActive?: boolean
}) {
  const loadedZombieVariantsRef = useRef(new Set<number>())
  const detailedZombieSlotsRef = useRef(new Uint8Array(simulationRef.current.zombies.pool.capacity))
  const presentationLodDebugRef = useRef<ZombieEscapePresentationLodDebugSnapshot | null>(null)
  if (!presentationLodDebugRef.current) {
    presentationLodDebugRef.current = createZombieEscapePresentationLodDebugSnapshot(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
    )
  }
  const presentationUserData = useMemo(
    () => ({ presentationLod: presentationLodDebugRef.current }),
    [],
  )
  return (
    <group name="zombie-escape-presentation" userData={presentationUserData}>
      {renderPlayer ? <ZombieEscapeOrbot simulationRef={simulationRef} /> : null}
      <ZombieEscapeGeneratedAssets
        detailedZombies={detailedZombies ?? quality === 'balanced'}
        detailedZombieSlotsRef={detailedZombieSlotsRef}
        impactVisualRegistry={impactVisualRegistry}
        loadedZombieVariantsRef={loadedZombieVariantsRef}
        omitHeldWeapon
        onGeneratedAssetsFailureChange={onGeneratedAssetsFailureChange}
        onGeneratedAssetsReadinessChange={onGeneratedAssetsReadinessChange}
        presentationLodDebugRef={presentationLodDebugRef}
        quality={quality}
        renderReadinessCamera={renderReadinessCamera}
        renderReadinessRegistry={renderReadinessRegistry}
        retryGeneration={retryGeneratedAssetsGeneration}
        simulationRef={simulationRef}
        shoulderTorchLightingStateRef={shoulderTorchLightingStateRef}
        zombieMaterialPhaseActive={zombieMaterialPhaseActive}
        zombiePresentationFramePriority={presentationFramePriority}
        zombieSelectionFramePriority={(presentationFramePriority ?? -19) - 0.01}
      />
      <ZombieEscapeAimReticle
        framePriority={presentationFramePriority ?? -18}
        playerColor={playerColor}
        renderReadinessRegistry={renderReadinessRegistry}
        simulationRef={simulationRef}
      />
    </group>
  )
})

function ZombieEscapeOrbot({
  simulationRef,
}: {
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const visualRootRef = useRef<Group | null>(null)
  const combatStateRef = useRef(createLandrushRobotWeaponCombatState())
  const muzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())
  const node = useMemo(
    () =>
      LandrushWorldNode.parse({
        id: 'landrush-world_zombie-escape-player',
        landrushMode: 'walk',
        name: 'Zombie Escape player',
        playerHeading: Math.PI,
        playerPosition: [0, 0.05, 0],
        playerMoving: false,
        playerSpeed: 0,
      }),
    [],
  )

  useFrame(() => {
    const simulation = simulationRef.current
    const player = simulation.player
    const speed = Math.hypot(player.vx, player.vz)
    node.playerPosition[0] = player.x
    node.playerPosition[1] = 0.05
    node.playerPosition[2] = player.z
    node.playerHeading = player.movementHeading
    node.playerMoving = speed > 0.08
    node.playerSpeed = speed

    const combatState = combatStateRef.current
    combatState.aimAngle = player.aimAngle
    combatState.meleePhase = player.meleePhase
    combatState.meleeProgress = getZombieEscapeMeleeProgress(player)
    combatState.movementHeading = player.movementHeading
    combatState.shotSequence = simulation.nextShotVolleySequence
    combatState.weaponIndex = player.weaponIndex
  }, -20)

  useFrame(() => {
    const pose = muzzlePoseRef.current
    if (!pose.ready) return
    setZombieEscapePlayerMuzzlePose(simulationRef.current, {
      directionX: pose.direction.x,
      directionY: pose.direction.y,
      directionZ: pose.direction.z,
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
    })
  }, 3)

  useEffect(
    () => () => {
      restoreZombieEscapeDefaultMuzzlePose(simulationRef.current)
    },
    [simulationRef],
  )

  return (
    <group
      userData={{
        assetRoot: '/landrush-lab/zombie-escape/assets/',
        playerAsset: '/navigation/proto_pascal_robot.glb',
        playerRenderer: 'LandrushRobot',
        weaponAsset: ZOMBIE_ESCAPE_DEFAULT_WEAPON.assetPath,
        weaponId: ZOMBIE_ESCAPE_DEFAULT_WEAPON.id,
      }}
    >
      <Suspense fallback={null}>
        <LandrushRobot framePriority={0} node={node} visualRootRef={visualRootRef} />
        <LandrushRobotWeaponRig
          combatStateRef={combatStateRef}
          framePriority={2.5}
          muzzlePoseRef={muzzlePoseRef}
          visualRootRef={visualRootRef}
        />
      </Suspense>
    </group>
  )
}

function ZombieEscapeAimReticle({
  framePriority,
  playerColor,
  renderReadinessRegistry,
  simulationRef,
}: {
  framePriority: number
  playerColor: string
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const reticleRef = useRef<Group>(null)
  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,
    reticleRef,
  )
  useFrame(() => {
    const simulation = simulationRef.current
    if (reticleRef.current) {
      reticleRef.current.position.set(
        simulation.player.x,
        resolveZombieEscapeAimReticleElevation(simulation.player.y),
        simulation.player.z,
      )
      reticleRef.current.rotation.y = resolveZombieEscapeAimReticleYaw(simulation.player.aimAngle)
      const pulse = 1 + Math.sin(simulation.elapsedSeconds * 6) * 0.08
      reticleRef.current.scale.setScalar(pulse)
    }
  }, framePriority)

  return (
    <group ref={reticleRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.38, 24]} />
        <meshBasicMaterial color={playerColor} depthWrite={false} transparent />
      </mesh>
      <mesh position={[0, 0, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.13, 0.3, 5]} />
        <meshBasicMaterial color={playerColor} />
      </mesh>
    </group>
  )
}
